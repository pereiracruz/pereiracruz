// Supabase Edge Function «ler-email» — lê um email guardado (texto + anexos) com IA pelo OpenRouter.
// Classifica o email (encomenda, pedido de preço, tech pack, fatura, alteração, outro), identifica o cliente e extrai a
// encomenda e o tech pack nos MESMOS formatos da função «ler-documento» (a aplicação reutiliza a passagem para encomenda
// e fichas). Saída validada por JSON Schema (structured outputs, strict) com reparação automática (response-healing).
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
    const { emailId, clientes } = await req.json() as { emailId: string; clientes?: string[] }
    if (!emailId) return resposta({ erro: 'Pedido inválido' }, 400)

    const { data: linha, error: eEmail } = await supabase.from('documentos').select('dados').eq('colecao', 'emails').eq('id', emailId).maybeSingle()
    if (eEmail || !linha) return resposta({ erro: 'Não encontrei o email.' }, 404)
    const email = linha.dados as { assunto: string; de: string; deNome?: string; data: string; texto: string
      anexos: { nome: string; caminho: string; tipo: string; tamanho: number; origem?: string }[]
      anexosNaoGuardados?: { nome: string; tamanho: number; motivo: string }[] }
    // ordem de leitura: PDF, Excel, imagens; os formatos que a IA não lê (DXF, zips dentro de zips…) nem se descarregam
    const formato = (a: { nome: string; tipo: string }) => {
      const tipo = (a.tipo || '').toLowerCase(), nome = a.nome.toLowerCase()
      if (tipo.includes('pdf') || nome.endsWith('.pdf')) return 'pdf'
      if (/\.(xlsx|xlsm|xls|csv)$/.test(nome) || tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv')) return 'excel'
      if (tipo.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(nome)) return 'imagem'
      return null
    }
    const ORDEM = { pdf: 0, excel: 1, imagem: 2 } as const
    const lidos = email.anexos.filter((a) => formato(a)).sort((a, b) => ORDEM[formato(a)!] - ORDEM[formato(b)!])
    const listaAnexos = [
      ...email.anexos.map((a) => `${a.nome}${a.origem ? ` (dentro de ${a.origem})` : ''}${formato(a) ? '' : ' — não lido (formato que a IA não abre)'}`),
      ...(email.anexosNaoGuardados ?? []).map((a) => `${a.nome} — não lido (${a.motivo})`),
    ]

    // conteúdo: texto do email + cada anexo no formato que o OpenRouter aceita
    const partes: unknown[] = [{ type: 'text', text: [
      `Clientes conhecidos: ${(clientes ?? []).join('; ') || '(nenhum)'}`,
      `De: ${email.deNome ? `${email.deNome} <${email.de}>` : email.de}`, `Data: ${email.data}`, `Assunto: ${email.assunto}`,
      `Anexos (${listaAnexos.length}):${listaAnexos.length ? `\n${listaAnexos.map((l) => `- ${l}`).join('\n')}` : ' (nenhum)'}`, '', 'Texto do email:', email.texto || '(sem texto)',
    ].join('\n') }]
    let total = 0
    const ignorados: string[] = email.anexos.filter((a) => !formato(a)).map((a) => `${a.nome} (formato não lido; está guardado no email)`)
    for (const a of lidos) {
      const { data: f, error } = await supabase.storage.from('documentos').download(a.caminho)
      if (error || !f) { ignorados.push(`${a.nome} (não abriu)`); continue }
      const bytes = new Uint8Array(await f.arrayBuffer())
      if ((total += bytes.length) > MAX_TOTAL) { ignorados.push(`${a.nome} (anexos demasiado grandes)`); continue }
      const tipo = (a.tipo || f.type || '').toLowerCase(), nome = a.nome.toLowerCase()
      if (a.origem) partes.push({ type: 'text', text: `Anexo seguinte: «${a.nome}» (dentro de ${a.origem})` })
      if (tipo.includes('pdf') || nome.endsWith('.pdf')) partes.push({ type: 'file', file: { filename: a.nome, file_data: `data:application/pdf;base64,${encodeBase64(bytes)}` } })
      else if (tipo.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(nome)) partes.push({ type: 'image_url', image_url: { url: `data:${tipo.startsWith('image/') ? tipo : 'image/jpeg'};base64,${encodeBase64(bytes)}` } })
      else if (/\.(xlsx|xlsm|xls|csv)$/.test(nome) || tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv')) partes.push({ type: 'text', text: `Anexo Excel «${a.nome}» convertido em texto:\n${nome.endsWith('.csv') ? new TextDecoder().decode(bytes).slice(0, 80_000) : excelEmTexto(bytes)}` })
      else ignorados.push(`${a.nome} (formato não lido)`)
    }

    const base = (Deno.env.get('OPENROUTER_URL') || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    const modelo = Deno.env.get('OPENROUTER_MODELO') || 'anthropic/claude-opus-5.5'
    const motorPdf = Deno.env.get('OPENROUTER_PDF') || 'native'
    const temPdf = partes.some((p) => (p as { type?: string }).type === 'file')
    type Corpo = { choices?: { message?: { content?: string }; finish_reason?: string }[]; model?: string; provider?: string; usage?: Record<string, number>
      error?: { message?: string; code?: number; metadata?: { provider_name?: string; raw?: unknown } } }
    // Fornecedores por ordem de preferência. O Google (Vertex) recusa o nosso esquema («compiled grammar is too large»),
    // por isso fica de fora; sem «temperature» (o Claude Opus 5.5 não aceita, e com require_parameters nenhum fornecedor servia).
    const ordem = (Deno.env.get('OPENROUTER_FORNECEDORES') || 'anthropic,claude-on-aws,azure,amazon-bedrock').split(',').map((x) => x.trim()).filter(Boolean)
    const pedir = async (pdf: string, exigirParametros: boolean) => {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://pereirasproject.netlify.app', 'X-Title': "Pereira's Project" },
        body: JSON.stringify({
          model: modelo, max_tokens: 32000,
          messages: [{ role: 'system', content: INSTRUCOES }, { role: 'user', content: partes }],
          response_format: { type: 'json_schema', json_schema: { name: 'email', strict: true, schema: ESQUEMA } },
          plugins: [{ id: 'file-parser', pdf: { engine: pdf } }, { id: 'response-healing' }],
          // sem recolha de dados SEMPRE; «require_parameters» só se puder (ver tentativas abaixo)
          provider: { order: ordem, only: ordem, require_parameters: exigirParametros, data_collection: 'deny', ...(Deno.env.get('OPENROUTER_ZDR') === '1' ? { zdr: true } : {}) },
        }),
      })
      const corpo = await r.json().catch(() => ({})) as Corpo
      if (!r.ok || corpo.error) console.log('ler-email: OpenRouter', r.status, pdf, exigirParametros, corpo.error?.message, corpo.error?.metadata?.provider_name ?? '', JSON.stringify(corpo.error?.metadata?.raw ?? '').slice(0, 600))
      return { r, corpo }
    }
    // Tentativas, por ordem (só se o erro for de encaminhamento ou do fornecedor; não em chave, crédito ou limite):
    //  1. PDF lido pelo próprio modelo, exigindo todos os parâmetros;
    //  2. o mesmo sem exigir todos os parâmetros (o formato JSON continua pedido e a resposta é validada a seguir);
    //  3. PDF convertido antes por OCR (Mistral, 2 $/1000 páginas): o fornecedor só recebe texto e imagens.
    const tentativas: { pdf: string; exigir: boolean; nota?: string }[] = [
      { pdf: motorPdf, exigir: true },
      { pdf: motorPdf, exigir: false, nota: 'sem exigir todos os parâmetros ao fornecedor (JSON validado na aplicação)' },
    ]
    if (temPdf && motorPdf === 'native') tentativas.push({ pdf: 'mistral-ocr', exigir: false, nota: 'PDF lidos por OCR (Mistral): nenhum fornecedor aceitou o PDF diretamente' })
    const repetir = (r: Response, c: Corpo) => (!r.ok || !!c.error) && ![401, 402, 429].includes(r.status) && ![401, 402, 429].includes(c.error?.code ?? 0)
    let { r, corpo } = await pedir(tentativas[0].pdf, tentativas[0].exigir)
    for (let k = 1; k < tentativas.length && repetir(r, corpo); k++) {
      ;({ r, corpo } = await pedir(tentativas[k].pdf, tentativas[k].exigir))
      if (r.ok && !corpo.error && tentativas[k].nota) ignorados.push(tentativas[k].nota!)
    }
    if (!r.ok || corpo.error) {
      const raw = corpo.error?.metadata?.raw
      const det = raw ? (typeof raw === 'string' ? raw : JSON.stringify(raw)).match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? '' : ''
      const msg = `${corpo.error?.message ?? `HTTP ${r.status}`}${corpo.error?.metadata?.provider_name ? ` (${corpo.error.metadata.provider_name}${det ? `: ${det}` : ''})` : ''}`
      const dica = r.status === 401 ? ' Confirme a chave OPENROUTER_API_KEY.' : r.status === 402 ? ' Sem crédito na conta OpenRouter.' : r.status === 429 ? ' Limite de pedidos: tente daqui a pouco.' : r.status === 413 || /too large|payload/i.test(msg) ? ' Os anexos são grandes demais para um só pedido.' : /no endpoints|require/i.test(msg) ? ' Nenhum fornecedor do modelo aceita este pedido sem recolha de dados (já tentei sem exigir parâmetros e com OCR dos PDF): experimente outro OPENROUTER_MODELO.' : ''
      return resposta({ erro: `OpenRouter: ${msg}.${dica}` }, 502)
    }
    const texto = corpo.choices?.[0]?.message?.content ?? ''
    let dados: unknown
    try { dados = JSON.parse(texto) } catch { return resposta({ erro: `A resposta da IA não é JSON válido (${corpo.choices?.[0]?.finish_reason ?? 'sem motivo'}).` }, 502) }

    const leitura = { em: new Date().toISOString(), modelo: corpo.model ?? modelo, fornecedor: corpo.provider ?? null, uso: corpo.usage ?? null, ignorados, dados }
    // guarda a leitura no próprio email (não se volta a pagar para ver o resultado)
    await supabase.from('documentos').upsert({ colecao: 'emails', id: emailId, dados: { ...(linha.dados as object), leituraIA: leitura } })
    return resposta(leitura)
  } catch (e) {
    console.error(e)
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500)
  }
})
