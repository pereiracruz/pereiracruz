// Supabase Edge Function «ler-email» — lê um email guardado (texto + anexos) com IA pelo OpenRouter.
// Classifica o email (encomenda, pedido de preço, tech pack, fatura, alteração, outro), identifica o cliente e extrai a
// encomenda e o tech pack nos MESMOS formatos da função «ler-documento» (a aplicação reutiliza a passagem para encomenda
// e fichas). Saída em JSON segundo o esquema, que vai nas instruções (o modo estrito recusa um esquema deste tamanho) e é
// acertada ao esquema na função (ajustarAoEsquema), com reparação automática (response-healing).
// Com mais de um documento (PDF/Excel), a leitura é feita POR PARTES — um documento por chamada e uma leitura final com o
// texto do email e as imagens — porque cada chamada tem ~150 s; a aplicação repete o pedido até vir «concluido».
// PDFs: lidos pelo próprio modelo (engine «native», vê as páginas como imagem) ou por OCR Mistral (OPENROUTER_PDF=mistral-ocr).
// Documentação: https://openrouter.ai/docs/llms.txt (structured-outputs, multimodal/pdfs, routing/provider-selection, zdr).
//
// Segredos (Supabase → Edge Functions → Secrets):
//   OPENROUTER_API_KEY   chave do OpenRouter (obrigatória; nunca no código nem no chat)
//   OPENROUTER_MODELO    opcional, por omissão «anthropic/claude-opus-5.5» (tem de aceitar ficheiros e structured outputs)
//   OPENROUTER_PDF       opcional: native (omissão) | mistral-ocr (PDFs digitalizados) | cloudflare-ai
//   OPENROUTER_URL       opcional: https://openrouter.ai/api/v1 (omissão) ou https://eu.openrouter.ai/api/v1 (só planos Business/Enterprise: processamento na UE)
//   OPENROUTER_ZDR       opcional: «1» para só usar fornecedores com retenção zero de dados
//   OPENROUTER_FORNECEDORES opcional: fornecedores por ordem (omissão anthropic,claude-on-aws,azure,amazon-bedrock; o Google recusa o esquema)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import * as XLSX from 'npm:xlsx@0.18.5'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ---------------- Esquema (strict: todos os campos obrigatórios, null quando não existe) ----------------
const s = { type: 'string' } as const
const sn = { type: ['string', 'null'] } as const
const nn = { type: ['number', 'null'] } as const
const confianca = { type: 'string', enum: ['alta', 'media', 'baixa'] } as const
const obj = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false, ...extra })
const ouNull = (o: Record<string, unknown>) => ({ ...o, type: ['object', 'null'] })

const ENCOMENDA = obj({
  cliente: sn, numeroDocumento: sn,
  dataDocumento: { ...sn, description: 'AAAA-MM-DD' }, dataEntrega: { ...sn, description: 'AAAA-MM-DD, só se indicada' },
  tamanhos: { type: 'array', items: s, description: 'Cabeçalho de tamanhos pela ordem do documento; vazio se não houver colunas de tamanhos' },
  linhas: { type: 'array', items: obj({
    linhaEncomenda: sn, referencia: s, descricao: s,
    cor: { ...s, description: 'Código e nome da cor como no documento' },
    quantidades: { type: 'array', items: { type: 'integer' }, description: 'Uma por tamanho, alinhada com «tamanhos»; 0 onde vazio' },
    total: { type: ['integer', 'null'] }, preco: nn, pagina: { type: 'integer' }, confianca,
  }) },
  totaisDocumento: obj({ pecas: { type: ['integer', 'null'] }, valor: nn, porTamanho: { type: ['array', 'null'], items: { type: 'integer' } } }),
  notas: { type: 'array', items: s }, perguntas: { type: 'array', items: s },
})
const campo = obj({ campo: s, valor: s, pagina: { type: 'integer' }, confianca })
const material = obj({ descricao: s, fornecedor: sn, consumo: nn, unidade: sn, cor: sn, observacoes: sn, pagina: { type: 'integer' }, confianca })
const TECHPACK = obj({
  marca: sn, colecao: sn,
  modelos: { type: 'array', items: obj({
    referencia: s, nome: s, tipoPeca: sn, paginas: { type: 'array', items: { type: 'integer' } }, composicao: sn, tamanhos: { type: 'array', items: s },
    campos: { type: 'array', items: campo }, tecidos: { type: 'array', items: material }, acessorios: { type: 'array', items: material },
    bordadosEstampados: { type: 'array', items: obj({ tipo: { type: 'string', enum: ['Bordado', 'Estampado'] }, posicao: s, medidas: sn, cor: sn, fornecedor: sn, pagina: { type: 'integer' }, confianca }) },
    medidas: { type: ['object', 'null'], properties: { tamanhoBase: sn, pontos: { type: 'array', items: obj({ ponto: s, valores: { type: 'array', items: nn } }) } }, required: ['tamanhoBase', 'pontos'], additionalProperties: false },
    pedidos: { type: 'array', items: s }, observacoes: { type: 'array', items: s },
  }) },
})
const PEDIDO = obj({
  pecas: { type: 'array', items: obj({ referencia: sn, descricao: s, tipoPeca: sn, tecido: sn, tratamento: sn, quantidade: { type: ['integer', 'null'] }, precoAlvo: nn, observacoes: sn }) },
  prazo: { ...sn, description: 'AAAA-MM-DD ou texto do prazo pedido' },
  observacoes: { type: 'array', items: s },
})
const ESQUEMA = obj({
  classificacao: obj({
    tipo: { type: 'string', enum: ['encomenda', 'pedido_preco', 'tech_pack', 'alteracao', 'fatura', 'outro'],
      description: 'encomenda = ordem de compra com quantidades; pedido_preco = pedido de cotação/orçamento; tech_pack = só ficha técnica/OF; alteracao = muda uma encomenda existente; fatura = documento de compra de fornecedor' },
    confianca, motivo: { ...s, description: 'Uma frase em português de Portugal' },
  }),
  idioma: sn,
  resumo: { ...s, description: 'Resumo em português de Portugal, 1 a 3 frases' },
  cliente: obj({ nome: sn, marca: sn, nif: sn, email: sn, pais: sn, nomeConhecido: { ...sn, description: 'Nome exato da lista de clientes conhecidos, se for um deles' } }),
  anexos: { type: 'array', items: obj({ nome: s, tipo: { type: 'string', enum: ['encomenda', 'tech_pack', 'of', 'fatura', 'imagem', 'outro'] }, resumo: s }) },
  encomenda: ouNull(ENCOMENDA),
  techpack: ouNull(TECHPACK),
  pedidoPreco: ouNull(PEDIDO),
  duvidas: { type: 'array', items: s, description: 'O que falta ou está ambíguo e deve ser confirmado com o cliente, em PT-PT' },
})

const INSTRUCOES = `És o assistente do escritório de uma confeção têxtil portuguesa (Pereira's Project / Pereira & Cruz: calças, calções, casacos, ganga e sarja, adulto e criança).
Lês um email de um cliente (texto e anexos: PDF, imagens, Excel convertido em texto) e devolves JSON segundo o esquema.
1. Classifica o email. Uma encomenda tem quantidades a produzir; um pedido de preço pede cotação; um tech pack/OF só descreve o modelo.
2. Identifica o cliente pelo remetente, assinatura e documentos; se for um dos clientes conhecidos, escreve o nome exato em «nomeConhecido».
3. Se houver encomenda: extrai TODAS as linhas sem resumir; quantidades alinhadas com os tamanhos (célula vazia = 0); sem colunas de tamanhos, «tamanhos» e «quantidades» vazios e o total em «total»; a mesma cor em várias linhas fica em linhas separadas; copia referências e cores exatamente; extrai os totais do documento para conferência.
4. Se houver tech pack ou OF: por modelo, tecidos (fornecedor, composição, consumo), lavagem/tingimento, bordados/estampados, acessórios, medidas (só se houver tabela) e observações, em português; pedidos à fábrica vão para «pedidos».
5. Lê texto dentro de imagens e páginas digitalizadas com o máximo cuidado (OCR). Indica a página de cada valor e a confiança; baixa quando duvidoso.
6. Não inventes: o que não está no email fica null ou vazio; o que é ambíguo vai para «duvidas».
7. A linha «Anexos» lista TODOS os ficheiros que vieram no email, incluindo os que vinham dentro de um zip e os que não te foram enviados (ex.: moldes DXF, ficheiros grandes). Nunca digas que não veio anexo quando essa lista tem ficheiros. Os que não leste indica-os em «anexos» com o que se sabe pelo nome (ex.: «molde DXF, não lido») e, se fizerem falta para a cotação, diz em «duvidas» que têm de ser vistos à mão.`

// ---------------- Resposta sem modo estrito: acertar ao esquema (cópia de src/lib/esquemaJson.ts) ----------------
// ==== INÍCIO ajustarAoEsquema ====
export type EsquemaJson = { type?: string | readonly string[]; properties?: Record<string, EsquemaJson>; items?: EsquemaJson; enum?: readonly unknown[] }

/** Devolve o valor com a forma exata do esquema: só as propriedades do esquema, todas presentes, nos tipos certos.
 *  Num enum, o valor em falta ou desconhecido passa ao ÚLTIMO da lista (o mais prudente: «baixa», «outro»). */
export function ajustarAoEsquema(v: unknown, e: EsquemaJson): unknown {
  const tipos: readonly string[] = Array.isArray(e.type) ? e.type : e.type ? [e.type as string] : []
  const tem = (t: string) => tipos.includes(t)
  const numero = tem('integer') || tem('number')
  if (v === undefined || v === null) {
    if (tem('null')) return null
    if (tem('object')) return ajustarAoEsquema({}, e)
    if (tem('array')) return []
    if (e.enum) return e.enum[e.enum.length - 1]
    if (tem('string')) return ''
    if (numero) return 0
    if (tem('boolean')) return false
    return null
  }
  if (tem('object') && e.properties) {
    if (typeof v !== 'object' || Array.isArray(v)) return tem('null') ? null : ajustarAoEsquema({}, e)
    const o = v as Record<string, unknown>
    return Object.fromEntries(Object.entries(e.properties).map(([k, sub]) => [k, ajustarAoEsquema(o[k], sub)]))
  }
  if (tem('array')) {
    if (!Array.isArray(v)) return tem('null') ? null : []
    return e.items ? v.map((x) => ajustarAoEsquema(x, e.items!)) : v
  }
  if (e.enum) {
    if (e.enum.includes(v)) return v
    const igual = e.enum.find((x) => typeof x === 'string' && typeof v === 'string' && x.toLowerCase() === v.trim().toLowerCase())
    return igual ?? e.enum[e.enum.length - 1]
  }
  if (numero) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(/\s/g, '').replace(',', '.')) : NaN
    if (Number.isFinite(n)) return tem('integer') ? Math.round(n) : n
    return tem('null') ? null : 0
  }
  if (tem('string') && typeof v !== 'string') return typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (tem('boolean') && typeof v !== 'boolean') return v === 'true' || v === 1
  return v
}
// ==== FIM ajustarAoEsquema ====

// ---------------- Leitura por partes: juntar (cópia de src/lib/juntarLeituras.ts) ----------------
// ==== INÍCIO juntarLeituras ====
type Obj = Record<string, unknown>
const lista = (x: unknown): Obj[] => (Array.isArray(x) ? (x as Obj[]) : [])
const chaveTexto = (x: unknown) => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const semRepetidos = <T>(xs: T[], chave: (x: T) => string) => {
  const vistos = new Set<string>()
  return xs.filter((x) => { const k = chave(x); if (!k || vistos.has(k)) return false; vistos.add(k); return true })
}

/** Junta a leitura final (texto do email) com as leituras parciais (uma por documento).
 *  Da final: classificação, idioma, resumo, pedido de preço. Das parciais: tech packs e encomendas (os documentos).
 *  Cliente: o da final, completado com o das parciais. Anexos e dúvidas: todos, sem repetidos. */
export function juntarLeituras(final: Obj, parciais: Obj[]): Obj {
  const todas = [...parciais, final]
  // tech pack: os modelos de todos os documentos
  const tps = todas.map((l) => l.techpack as Obj | null).filter((t): t is Obj => !!t)
  const modelos = semRepetidos(tps.flatMap((t) => lista(t.modelos)), (m) => `${chaveTexto(m.referencia)}|${chaveTexto(m.nome)}`)
  const techpack = tps.length
    ? { marca: tps.map((t) => t.marca).find(Boolean) ?? null, colecao: tps.map((t) => t.colecao).find(Boolean) ?? null, modelos }
    : null
  // encomenda: a primeira como base, com as linhas, notas e perguntas de todas
  const encs = todas.map((l) => l.encomenda as Obj | null).filter((e): e is Obj => !!e)
  const encomenda = encs.length ? {
    ...encs[0],
    linhas: encs.flatMap((e) => lista(e.linhas)),
    notas: semRepetidos(encs.flatMap((e) => (Array.isArray(e.notas) ? (e.notas as string[]) : [])), chaveTexto),
    perguntas: semRepetidos(encs.flatMap((e) => (Array.isArray(e.perguntas) ? (e.perguntas as string[]) : [])), chaveTexto),
  } : null
  // cliente: campos em falta na final vêm das parciais
  const cliente: Obj = { ...((final.cliente as Obj) ?? {}) }
  for (const p of parciais) for (const [k, v] of Object.entries((p.cliente as Obj) ?? {})) if (cliente[k] == null && v != null) cliente[k] = v
  // anexos: a descrição feita ao ler o próprio documento tem prioridade
  const anexos = semRepetidos([...parciais.flatMap((p) => lista(p.anexos)), ...lista(final.anexos)], (a) => chaveTexto(a.nome))
  const textos = (l: Obj) => (Array.isArray(l.duvidas) ? (l.duvidas as string[]) : [])
  const duvidas = semRepetidos([...textos(final), ...parciais.flatMap(textos)], chaveTexto)
  return {
    ...final,
    cliente, anexos, encomenda, techpack,
    pedidoPreco: final.pedidoPreco ?? parciais.map((p) => p.pedidoPreco).find(Boolean) ?? null,
    duvidas,
  }
}

/** Resumo curto de uma leitura parcial, para a leitura final saber o que os documentos já disseram. */
export function resumoParcial(nome: string, l: Obj): Obj {
  const tp = l.techpack as Obj | null
  return {
    anexo: nome, resumo: l.resumo ?? '',
    modelos: lista(tp?.modelos).map((m) => ({ referencia: m.referencia, nome: m.nome, tipoPeca: m.tipoPeca, composicao: m.composicao, tamanhos: m.tamanhos,
      tecidos: lista(m.tecidos).map((t) => t.descricao), acessorios: lista(m.acessorios).map((a) => a.descricao), lavagem: lista(m.campos).filter((c) => /lavag|wash|tratam/i.test(String(c.campo))).map((c) => c.valor) })),
    linhasEncomenda: lista((l.encomenda as Obj | null)?.linhas).length,
    duvidas: Array.isArray(l.duvidas) ? l.duvidas : [],
  }
}
// ==== FIM juntarLeituras ====

// ---------------- Anexos ----------------
const MAX_TOTAL = 18 * 1024 * 1024
function excelEmTexto(bytes: Uint8Array) {
  const wb = XLSX.read(bytes, { type: 'array' })
  return wb.SheetNames.slice(0, 4).map((n) => `--- folha «${n}» ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`).join('\n').slice(0, 80_000)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return resposta({ erro: 'Sessão necessária.' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: quem, error: eSessao } = await supabase.auth.getUser(jwt)
    if (eSessao || !quem.user) return resposta({ erro: 'Sessão inválida ou expirada. Volte a entrar na aplicação.' }, 401)
    const { data: perfil } = await supabase.from('perfis').select('ativo').eq('id', quem.user.id).maybeSingle()
    if (!perfil?.ativo) return resposta({ erro: 'Utilizador sem acesso.' }, 403)

    const chave = Deno.env.get('OPENROUTER_API_KEY')
    if (!chave) return resposta({ erro: 'Falta o segredo OPENROUTER_API_KEY no Supabase (Edge Functions → Secrets).' }, 500)
    const { emailId, clientes, recomecar } = await req.json() as { emailId: string; clientes?: string[]; recomecar?: boolean }
    if (!emailId) return resposta({ erro: 'Pedido inválido' }, 400)

    const { data: linha, error: eEmail } = await supabase.from('documentos').select('dados').eq('colecao', 'emails').eq('id', emailId).maybeSingle()
    if (eEmail || !linha) return resposta({ erro: 'Não encontrei o email.' }, 404)
    type Anexo = { nome: string; caminho: string; tipo: string; tamanho: number; origem?: string }
    type Uso = { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    type EmCurso = { partes: string[]; total: number; parciais: { nome: string; dados: Record<string, unknown> }[]; uso: Uso; falhas?: Record<string, number>; notas: string[]; fornecedor: string | null; modelo: string | null; inicio: string }
    const email = linha.dados as Record<string, unknown> & { assunto: string; de: string; deNome?: string; data: string; texto: string
      anexos: Anexo[]; anexosNaoGuardados?: { nome: string; tamanho: number; motivo: string }[]; leituraEmCurso?: EmCurso }
    // ordem de leitura: PDF, Excel, imagens; os formatos que a IA não lê (DXF, zips dentro de zips…) nem se descarregam
    const formato = (a: { nome: string; tipo: string }) => {
      const tipo = (a.tipo || '').toLowerCase(), nome = a.nome.toLowerCase()
      if (tipo.includes('pdf') || nome.endsWith('.pdf')) return 'pdf'
      if (/\.(xlsx|xlsm|xls|csv)$/.test(nome) || tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv')) return 'excel'
      if (tipo.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(nome)) return 'imagem'
      return null
    }
    const documentos = email.anexos.filter((a) => formato(a) === 'pdf' || formato(a) === 'excel')
    const imagens = email.anexos.filter((a) => formato(a) === 'imagem')
    const listaAnexos = [
      ...email.anexos.map((a) => `${a.nome}${a.origem ? ` (dentro de ${a.origem})` : ''}${formato(a) ? '' : ' — não lido (formato que a IA não abre)'}`),
      ...(email.anexosNaoGuardados ?? []).map((a) => `${a.nome} — não lido (${a.motivo})`),
    ]
    const cabecalho = [
      `Clientes conhecidos: ${(clientes ?? []).join('; ') || '(nenhum)'}`,
      `De: ${email.deNome ? `${email.deNome} <${email.de}>` : email.de}`, `Data: ${email.data}`, `Assunto: ${email.assunto}`,
      `Anexos (${listaAnexos.length}):${listaAnexos.length ? `\n${listaAnexos.map((l) => `- ${l}`).join('\n')}` : ' (nenhum)'}`, '', 'Texto do email:', email.texto || '(sem texto)',
    ].join('\n')

    /** Acrescenta anexos ao conteúdo do pedido, no formato que o OpenRouter aceita. */
    const juntarAnexos = async (partes: unknown[], anexos: Anexo[], notas: string[]) => {
      let total = 0
      for (const a of anexos) {
        const { data: f, error } = await supabase.storage.from('documentos').download(a.caminho)
        if (error || !f) { notas.push(`${a.nome} (não abriu)`); continue }
        const bytes = new Uint8Array(await f.arrayBuffer())
        if ((total += bytes.length) > MAX_TOTAL) { notas.push(`${a.nome} (anexos demasiado grandes)`); continue }
        const tipo = (a.tipo || f.type || '').toLowerCase(), nome = a.nome.toLowerCase()
        partes.push({ type: 'text', text: `Anexo seguinte: «${a.nome}»${a.origem ? ` (dentro de ${a.origem})` : ''}` })
        if (formato(a) === 'pdf') partes.push({ type: 'file', file: { filename: a.nome, file_data: `data:application/pdf;base64,${encodeBase64(bytes)}` } })
        else if (formato(a) === 'imagem') partes.push({ type: 'image_url', image_url: { url: `data:${tipo.startsWith('image/') ? tipo : 'image/jpeg'};base64,${encodeBase64(bytes)}` } })
        else partes.push({ type: 'text', text: `Anexo Excel «${a.nome}» convertido em texto:\n${nome.endsWith('.csv') ? new TextDecoder().decode(bytes).slice(0, 80_000) : excelEmTexto(bytes)}` })
      }
    }

    const base = (Deno.env.get('OPENROUTER_URL') || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    const modelo = Deno.env.get('OPENROUTER_MODELO') || 'anthropic/claude-opus-5.5'
    const motorPdf = Deno.env.get('OPENROUTER_PDF') || 'native'
    type Corpo = { choices?: { message?: { content?: string }; finish_reason?: string }[]; model?: string; provider?: string; usage?: Uso
      error?: { message?: string; code?: number; metadata?: { provider_name?: string; raw?: unknown } } }
    // Fornecedores do Claude por ordem; o Google (Vertex) fica de fora. Sem «temperature» (o Claude Opus 5.5 não aceita).
    const ordem = (Deno.env.get('OPENROUTER_FORNECEDORES') || 'anthropic,claude-on-aws,azure,amazon-bedrock').split(',').map((x) => x.trim()).filter(Boolean)
    // Sem modo estrito: o esquema completo é grande demais para os fornecedores do Claude («compiled grammar is too large»);
    // vai nas instruções e a resposta é acertada ao esquema aqui (ajustarAoEsquema).
    const sistema = (extra: string) => `${INSTRUCOES}${extra ? `\n\n${extra}` : ''}

Responde APENAS com um objeto JSON (sem texto antes ou depois, sem blocos de código) que cumpra exatamente este JSON Schema (todos os campos presentes; null quando não existe):
${JSON.stringify(ESQUEMA)}`

    /** Um pedido ao OpenRouter, com nova tentativa por OCR dos PDF se o fornecedor recusar. Devolve os dados já acertados ao esquema. */
    const lerComIA = async (extra: string, partes: unknown[], notas: string[]) => {
      const temPdf = partes.some((p) => (p as { type?: string }).type === 'file')
      const pedir = async (pdf: string) => {
        const r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://pereirasproject.netlify.app', 'X-Title': "Pereira's Project" },
          body: JSON.stringify({
            model: modelo, max_tokens: 32000,
            messages: [{ role: 'system', content: sistema(extra) }, { role: 'user', content: partes }],
            plugins: [{ id: 'file-parser', pdf: { engine: pdf } }, { id: 'response-healing' }],
            provider: { order: ordem, only: ordem, data_collection: 'deny', ...(Deno.env.get('OPENROUTER_ZDR') === '1' ? { zdr: true } : {}) },
          }),
        })
        const corpo = await r.json().catch(() => ({})) as Corpo
        if (!r.ok || corpo.error) console.log('ler-email: OpenRouter', r.status, pdf, corpo.error?.message, corpo.error?.metadata?.provider_name ?? '', JSON.stringify(corpo.error?.metadata?.raw ?? '').slice(0, 600))
        return { r, corpo }
      }
      let { r, corpo } = await pedir(motorPdf)
      const repetir = (!r.ok || !!corpo.error) && ![401, 402, 429].includes(r.status) && ![401, 402, 429].includes(corpo.error?.code ?? 0)
      if (repetir && temPdf && motorPdf === 'native') {
        ;({ r, corpo } = await pedir('mistral-ocr'))
        if (r.ok && !corpo.error) notas.push('PDF lidos por OCR (Mistral): o fornecedor não aceitou o PDF diretamente')
      }
      if (!r.ok || corpo.error) {
        const raw = corpo.error?.metadata?.raw
        const det = raw ? (typeof raw === 'string' ? raw : JSON.stringify(raw)).match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? '' : ''
        const msg = `${corpo.error?.message ?? `HTTP ${r.status}`}${corpo.error?.metadata?.provider_name ? ` (${corpo.error.metadata.provider_name}${det ? `: ${det}` : ''})` : ''}`
        const dica = r.status === 401 ? ' Confirme a chave OPENROUTER_API_KEY.' : r.status === 402 ? ' Sem crédito na conta OpenRouter.' : r.status === 429 ? ' Limite de pedidos: tente daqui a pouco.' : r.status === 413 || /entity too large|payload too large|request too large/i.test(msg) ? ' Os anexos são grandes demais para um só pedido.' : /no endpoints|require/i.test(msg) ? ' Nenhum fornecedor do modelo aceita este pedido sem recolha de dados: experimente outro OPENROUTER_MODELO.' : ''
        throw new Error(`OpenRouter: ${msg}.${dica}`)
      }
      const texto = corpo.choices?.[0]?.message?.content ?? ''
      try {
        // a IA pode embrulhar o JSON em texto ou num bloco de código: fica só o objeto
        const limpo = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
        const i = limpo.indexOf('{'), j = limpo.lastIndexOf('}')
        const dados = ajustarAoEsquema(JSON.parse(i >= 0 && j > i ? limpo.slice(i, j + 1) : limpo), ESQUEMA as unknown as EsquemaJson) as Record<string, unknown>
        return { dados, uso: corpo.usage ?? {}, fornecedor: corpo.provider ?? null, modelo: corpo.model ?? modelo }
      } catch { throw new Error(`A resposta da IA não é JSON válido (${corpo.choices?.[0]?.finish_reason === 'length' ? 'resposta cortada por ser longa demais' : corpo.choices?.[0]?.finish_reason ?? 'sem motivo'}).`) }
    }
    const somar = (a: Uso, b: Uso): Uso => ({ prompt_tokens: (a.prompt_tokens ?? 0) + (b.prompt_tokens ?? 0), completion_tokens: (a.completion_tokens ?? 0) + (b.completion_tokens ?? 0), cost: (a.cost ?? 0) + (b.cost ?? 0) })
    const notasBase = email.anexos.filter((a) => !formato(a)).map((a) => `${a.nome} (formato não lido; está guardado no email)`)
    const guardar = async (dados: Record<string, unknown>) => {
      const { error } = await supabase.from('documentos').upsert({ colecao: 'emails', id: emailId, dados })
      if (error) throw new Error(`base de dados: ${error.message}`)
    }

    // Até 1 documento: tudo numa só leitura. Com mais: uma leitura por documento e uma final (cada chamada tem ~150 s).
    let curso = recomecar ? undefined : email.leituraEmCurso
    if (!curso && documentos.length <= 1) {
      const notas = [...notasBase]
      const partes: unknown[] = [{ type: 'text', text: cabecalho }]
      await juntarAnexos(partes, [...documentos, ...imagens], notas)
      const l = await lerComIA('', partes, notas)
      const { leituraEmCurso: _x, ...resto } = email
      const leitura = { em: new Date().toISOString(), modelo: l.modelo, fornecedor: l.fornecedor, uso: l.uso, ignorados: notas, dados: l.dados }
      await guardar({ ...resto, leituraIA: leitura })
      return resposta({ ...leitura, concluido: true })
    }
    if (!curso) {
      curso = { partes: documentos.map((a) => a.caminho), total: documentos.length + 1, parciais: [], uso: {}, notas: [...notasBase], fornecedor: null, modelo: null, inicio: new Date().toISOString() }
      await guardar({ ...email, leituraEmCurso: curso })
      return resposta({ concluido: false, feitos: 0, total: curso.total })
    }
    if (curso.partes.length) {
      // um documento de cada vez
      const caminho = curso.partes[0]
      const doc = email.anexos.find((a) => a.caminho === caminho)
      // se o servidor cortar a leitura a meio (tempo), à 2.ª falha este documento passa à frente
      curso.falhas ??= {}
      const falhou = (curso.falhas[caminho] ?? 0) >= 2
      if (doc && !falhou) { curso.falhas[caminho] = (curso.falhas[caminho] ?? 0) + 1; await guardar({ ...email, leituraEmCurso: curso }) }
      curso.partes.shift()
      if (doc && falhou) curso.notas.push(`${doc.nome} (não foi possível ler: demorou demais ou o fornecedor recusou duas vezes)`)
      else if (doc) {
        const partes: unknown[] = [{ type: 'text', text: cabecalho }]
        await juntarAnexos(partes, [doc], curso.notas)
        const l = await lerComIA(`ESTA LEITURA É SÓ DO ANEXO «${doc.nome}». Os outros anexos são lidos à parte e juntos depois. Extrai tudo deste anexo para «encomenda» e/ou «techpack» (sem resumir). Em «anexos» descreve só este anexo; em «duvidas» só o que falta neste anexo.`, partes, curso.notas)
        curso.parciais.push({ nome: doc.nome, dados: l.dados })
        curso.uso = somar(curso.uso, l.uso); curso.fornecedor = l.fornecedor; curso.modelo = l.modelo
      }
      await guardar({ ...email, leituraEmCurso: curso })
      return resposta({ concluido: false, feitos: curso.total - curso.partes.length - 1, total: curso.total })
    }
    // leitura final: texto do email + imagens + o que os documentos já disseram; depois junta tudo
    const partes: unknown[] = [{ type: 'text', text: cabecalho }]
    await juntarAnexos(partes, imagens, curso.notas)
    const extra = `Os documentos (PDF/Excel) deste email JÁ FORAM LIDOS À PARTE. Resumo do que se extraiu de cada um:
${JSON.stringify(curso.parciais.map((p) => resumoParcial(p.nome, p.dados))).slice(0, 30_000)}
Na tua resposta deixa «techpack» a null e «encomenda» a null (exceto se o próprio texto do email tiver uma encomenda com quantidades). Usa o que os documentos disseram para classificar, para o pedido de preço (uma peça por modelo, com a referência e o nome dos documentos) e para as dúvidas: não perguntes o que os documentos já respondem.`
    const l = await lerComIA(extra, partes, curso.notas)
    const dados = juntarLeituras(l.dados, curso.parciais.map((p) => p.dados))
    const uso = somar(curso.uso, l.uso)
    const { leituraEmCurso: _x, ...resto } = email
    const leitura = { em: new Date().toISOString(), modelo: l.modelo, fornecedor: l.fornecedor, uso, ignorados: [...curso.notas, `lido por partes: ${curso.parciais.length} documento(s) + texto do email`], dados }
    await guardar({ ...resto, leituraIA: leitura })
    return resposta({ ...leitura, concluido: true })
  } catch (e) {
    console.error(e)
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500)
  }
})
