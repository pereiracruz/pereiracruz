// Supabase Edge Function «ler-documento»
// Lê uma encomenda ou um tech pack (PDF ou imagem) guardado no bucket «documentos»
// com o Claude Opus 5.5 através do Google Cloud Vertex AI, endpoint multi-região «eu»
// (processamento só na União Europeia). Devolve JSON validado por esquema.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT_JSON  conteúdo do ficheiro JSON da conta de serviço Google Cloud
//   VERTEX_REGION                opcional, por omissão «eu»
//   CLAUDE_MODEL                 opcional, por omissão «claude-opus-5-5»

import { AnthropicVertex } from 'npm:@anthropic-ai/vertex-sdk@1.1.3'
import { GoogleAuth } from 'npm:google-auth-library@10.9.1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { unzipSync, strFromU8 } from 'npm:fflate@0.8'
import * as XLSX from 'npm:xlsx@0.18.5'

// ---------------- Esquemas da leitura ----------------

const s = { type: 'string' } as const
const sn = { type: ['string', 'null'] } as const
const nn = { type: ['number', 'null'] } as const
const confianca = { type: 'string', enum: ['alta', 'media', 'baixa'] } as const
const obj = (props: Record<string, unknown>) => ({
  type: 'object', properties: props, required: Object.keys(props), additionalProperties: false,
})

const ESQUEMA_ENCOMENDA = obj({
  cliente: sn,
  numeroDocumento: sn,
  dataDocumento: { ...sn, description: 'AAAA-MM-DD' },
  dataEntrega: { ...sn, description: 'AAAA-MM-DD, só se o documento a indicar' },
  tamanhos: { type: 'array', items: s, description: 'Cabeçalho de tamanhos, pela ordem do documento' },
  linhas: {
    type: 'array',
    items: obj({
      linhaEncomenda: { ...sn, description: 'Nº da linha de encomenda do cliente, se existir (ex.: P261273)' },
      referencia: s,
      descricao: s,
      cor: { ...s, description: 'Código e nome da cor como no documento (ex.: "313 - LIGHT BLUE")' },
      quantidades: { type: 'array', items: { type: 'integer' }, description: 'Uma quantidade por tamanho, alinhada com «tamanhos»; 0 onde a célula está vazia' },
      total: { type: ['integer', 'null'] },
      preco: nn,
      pagina: { type: 'integer' },
      confianca,
    }),
  },
  totaisDocumento: obj({
    pecas: { type: ['integer', 'null'] },
    valor: { ...nn, description: 'Total ilíquido (sem IVA), se existir' },
    porTamanho: { type: ['array', 'null'], items: { type: 'integer' } },
  }),
  notas: { type: 'array', items: s, description: 'Observações e normas do documento (ex.: Oeko-Tex, formaldeídos)' },
  perguntas: { type: 'array', items: s, description: 'Perguntas que o cliente faz no documento' },
})

const campo = obj({ campo: s, valor: s, pagina: { type: 'integer' }, confianca })
const material = obj({
  descricao: s, fornecedor: sn, consumo: nn, unidade: sn, cor: sn, observacoes: sn, pagina: { type: 'integer' }, confianca,
})

const ESQUEMA_TECHPACK = obj({
  marca: sn,
  colecao: sn,
  modelos: {
    type: 'array',
    items: obj({
      referencia: { ...s, description: 'Referência/código do modelo como no tech pack' },
      nome: s,
      tipoPeca: sn,
      paginas: { type: 'array', items: { type: 'integer' } },
      composicao: sn,
      tamanhos: { type: 'array', items: s },
      campos: { type: 'array', items: campo, description: 'Tecido, lavagem/tingimento, gola, botões, pespontos, cuidados, cabide, etc.' },
      tecidos: { type: 'array', items: material },
      acessorios: { type: 'array', items: material },
      bordadosEstampados: {
        type: 'array',
        items: obj({ tipo: { type: 'string', enum: ['Bordado', 'Estampado'] }, posicao: s, medidas: sn, cor: sn, fornecedor: sn, pagina: { type: 'integer' }, confianca }),
      },
      medidas: {
        type: ['object', 'null'],
        properties: {
          tamanhoBase: sn,
          pontos: { type: 'array', items: obj({ ponto: s, valores: { type: 'array', items: nn } }) },
        },
        required: ['tamanhoBase', 'pontos'],
        additionalProperties: false,
      },
      pedidos: { type: 'array', items: s, description: 'Pedidos à fábrica (ex.: «find fabric with EA»), não são dados' },
      observacoes: { type: 'array', items: s },
    }),
  },
})

const ESQUEMA_EXTRATO = obj({
  banco: sn,
  conta: { ...sn, description: 'Nº de conta ou IBAN, como no extrato' },
  titular: sn,
  dataInicio: { ...sn, description: 'AAAA-MM-DD' },
  dataFim: { ...sn, description: 'AAAA-MM-DD' },
  saldoInicial: { ...nn, description: 'Saldo anterior / inicial do período' },
  saldoFinal: { ...nn, description: 'Saldo final do período' },
  movimentos: {
    type: 'array',
    items: obj({
      data: { ...s, description: 'Data do movimento (AAAA-MM-DD); se houver data-movimento e data-valor, usa a data-movimento' },
      descricao: { ...s, description: 'Descritivo exatamente como no extrato' },
      valor: { type: 'number', description: 'Positivo para créditos/entradas, negativo para débitos/saídas' },
      saldo: { ...nn, description: 'Saldo após o movimento, se o extrato o mostrar' },
      pagina: { type: 'integer' },
      confianca,
    }),
  },
})

const ESQUEMA_FATURA = obj({
  tipoDocumento: { type: 'string', enum: ['fatura', 'fatura-recibo', 'fatura simplificada', 'nota de crédito', 'nota de débito', 'recibo verde', 'recibo', 'outro'] },
  numero: { ...s, description: 'Número do documento exatamente como impresso (ex.: «FT 2026/123», «FR ATSIRE01FR/35»)' },
  data: { ...s, description: 'Data de emissão AAAA-MM-DD' },
  vencimento: { ...sn, description: 'Data de vencimento AAAA-MM-DD, se existir' },
  fornecedor: obj({ nome: s, nif: { ...s, description: 'NIF do emitente, só algarismos (sem PT)' } }),
  cliente: obj({ nome: sn, nif: { ...sn, description: 'NIF do adquirente, só algarismos' } }),
  linhasIva: {
    type: 'array', description: 'Uma linha por taxa de IVA (incluindo isento 0 %)',
    items: obj({ taxa: { type: 'number' }, base: { type: 'number' }, iva: { type: 'number' }, motivoIsencao: sn }),
  },
  totalSemIva: { type: 'number' },
  totalIva: { type: 'number' },
  total: { type: 'number', description: 'Total do documento (com IVA), antes de retenções' },
  retencao: { ...nn, description: 'Valor da retenção na fonte de IRS/IRC, se existir' },
  taxaRetencao: { ...nn, description: 'Percentagem da retenção (ex.: 25, 23, 11.5), se indicada' },
  aPagar: { ...nn, description: 'Valor a pagar (total menos retenção), se indicado' },
  descricao: { ...sn, description: 'Resumo do que foi comprado/prestado (uma linha)' },
  observacoes: { type: 'array', items: s },
  confianca,
})

const ESQUEMA_PRODUCAO = obj({
  dias: {
    type: 'array',
    items: obj({
      data: { ...s, description: 'AAAA-MM-DD' },
      horas: {
        type: 'array', description: 'Uma entrada por intervalo de hora que aparece na folha, pela ordem',
        items: obj({
          intervalo: { ...s, description: 'Como «8h-9h», «9h-10h», …, «17h-18h»' },
          pecas: { type: ['integer', 'null'], description: 'Peças produzidas nessa hora; null se estiver em branco; 0 se estiver escrito 0' },
          fimModelo: { type: 'boolean', description: 'true se nessa hora a folha marca o fim de um modelo (risco, seta, círculo, «fim», troca de modelo)' },
        }),
      },
      modelos: { ...s, description: 'Modelo(s) feitos nesse dia, como escritos, separados por «/» (ex.: «E26-107-3/E26-107-6»)' },
      totalEscrito: { type: ['integer', 'null'], description: 'Total do dia se estiver escrito na folha (para conferir a soma)' },
      observacoes: { type: 'array', items: s },
      confianca,
    }),
  },
})

// ---------------- Função ----------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const INSTRUCOES = {
  encomenda: `És o assistente do escritório de uma confeção têxtil portuguesa (Pereira & Cruz).
Lê a encomenda do cliente e extrai TODAS as linhas, sem resumir nem saltar nenhuma.
- As quantidades por tamanho têm de ficar alinhadas com o cabeçalho de tamanhos: uma célula vazia é 0. Usa a posição na coluna, não a ordem dos números.
- Se a mesma cor aparece em mais de uma linha da mesma referência, mantém as linhas separadas (a aplicação junta-as).
- Copia referências, códigos e textos exatamente como estão, mesmo cortados ("...").
- Extrai os totais do próprio documento (por tamanho, peças, valor sem IVA) para a aplicação conferir a leitura.
- Indica a página de cada linha e a confiança (baixa quando a leitura for duvidosa).
- Não inventes: se um campo não existe no documento, devolve null.`,
  techpack: `És o assistente do escritório de uma confeção têxtil portuguesa (Pereira & Cruz).
Lê o tech pack do cliente (pode estar em inglês ou francês, com texto dentro de imagens e etiquetas fotografadas).
Para cada modelo/referência extrai: tecidos (com fornecedor, composição e consumo se existirem), lavagem/tingimento, bordados e estampados (posição, medidas, cor), gola, botões, pespontos, acessórios, cuidados de lavagem, medidas (só se houver tabela) e observações.
- Escreve os valores em português, mantendo referências e nomes comerciais como estão.
- Indica a página de onde veio cada valor e a confiança (baixa quando não tiveres a certeza).
- Pedidos à fábrica (ex.: "find fabric with EA", "possible to produce?") vão para «pedidos», não para os campos.
- Não inventes: o que não estiver no documento fica de fora ou a null.`,
  producao: `És o assistente de uma confeção têxtil portuguesa. Lê a folha de produção escrita à mão (fotografia): para cada dia, as peças feitas em cada hora (8h-9h, 9h-10h, 10h-11h, 11h-12h, 13h-14h, 14h-15h, 15h-16h, 16h-17h e, se existir, 17h-18h), o(s) modelo(s) e o total escrito.
- Lê cada número com cuidado (é letra manuscrita): se tiveres dúvidas, confiança baixa.
- Célula em branco = null; «0» ou traço de zero = 0.
- Marca fimModelo na hora em que a folha indica que um modelo acabou.
- Os códigos de modelo têm normalmente o formato E26-107-3: copia-os como estão escritos.
- Não inventes dias nem valores.`,
  fatura: `És o assistente administrativo de uma empresa portuguesa. Lê o documento de compra (fatura, fatura-recibo, nota de crédito ou recibo verde/ato isolado do Portal das Finanças) e extrai os dados fiscais.
- Copia o número do documento exatamente como impresso.
- NIF só com algarismos. O fornecedor é quem emite; o cliente é a nossa empresa.
- Uma linha de IVA por taxa, com base tributável e valor de IVA; isento = taxa 0 (indica o motivo de isenção se estiver escrito).
- Nos recibos verdes: valor base, IVA (se houver), retenção na fonte de IRS (valor e taxa) e o valor a pagar; a data de vencimento é a data indicada para pagamento (se não existir, null).
- Não inventes: se um campo não está no documento, devolve null.`,
  extrato: `És o assistente administrativo de uma empresa portuguesa. Lê o extrato bancário e extrai TODOS os movimentos, pela ordem do extrato, sem resumir nem saltar nenhum (incluindo comissões, impostos do selo e despesas bancárias).
- Débitos/saídas ficam com valor NEGATIVO; créditos/entradas com valor POSITIVO. Confirma o sinal pelas colunas Débito/Crédito ou pela evolução do saldo.
- Copia o descritivo exatamente como está (sem traduzir nem corrigir).
- Datas em AAAA-MM-DD. Se o extrato só tem dia/mês, usa o ano do período do extrato.
- Extrai o saldo inicial e o saldo final do período para a aplicação conferir a soma dos movimentos.
- Indica a página de cada movimento e a confiança (baixa quando a leitura for duvidosa).
- Não inventes: o que não estiver no extrato fica a null.`,
} as const

/** Texto de um ficheiro CSV/TXT: UTF-8 ou, se não for válido, Windows-1252 (extratos da CGD, Montepio…). */
function textoCsv(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return new TextDecoder('windows-1252').decode(bytes) }
}
/** Texto de uma folha de cálculo (.xlsx/.xls): cada folha em CSV com «;». */
function textoFolha(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
  return wb.SheetNames.map((n) => `### Folha ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ';', dateNF: 'yyyy-mm-dd' })}`).join('\n\n')
}

/** Texto de um documento Word (.docx): parágrafos e células de tabela separados. */
function textoDocx(bytes: Uint8Array): string {
  const ficheiros = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })
  const xml = ficheiros['word/document.xml']
  if (!xml) throw new Error('O ficheiro Word não tem conteúdo legível.')
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, '\t').replace(/<\/w:tc>/g, ' | ').replace(/<\/w:tr>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
}

let cliente: AnthropicVertex | null = null
function claude() {
  if (cliente) return cliente
  const json = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!json) throw new Error('Falta o segredo GOOGLE_SERVICE_ACCOUNT_JSON.')
  const credenciais = JSON.parse(json)
  cliente = new AnthropicVertex({
    region: Deno.env.get('VERTEX_REGION') ?? 'eu',
    projectId: credenciais.project_id,
    googleAuth: new GoogleAuth({ credentials: credenciais, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }),
  })
  return cliente
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)

  try {
    // só utilizadores com sessão iniciada na aplicação (não depende da opção «Verify JWT»)
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return resposta({ erro: 'Sessão necessária.' }, 401)
    const chave = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, chave, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: quem, error: eSessao } = await supabase.auth.getUser(token)
    if (eSessao || !quem.user) return resposta({ erro: 'Sessão inválida ou expirada. Volte a entrar na aplicação.' }, 401)

    const { caminho, tipo, contexto } = await req.json() as { caminho: string; tipo: 'encomenda' | 'techpack' | 'extrato' | 'fatura' | 'producao'; contexto?: string }
    if (!caminho || !['encomenda', 'techpack', 'extrato', 'fatura', 'producao'].includes(tipo)) return resposta({ erro: 'Pedido inválido' }, 400)
    if (/\.doc$/i.test(caminho)) return resposta({ erro: 'Ficheiros .doc antigos não são suportados: guarde o extrato como .docx ou PDF.' }, 422)

    // descarregar o ficheiro com a sessão de quem pediu (respeita as regras de acesso)
    const { data: ficheiro, error } = await supabase.storage.from('documentos').download(caminho)
    if (error || !ficheiro) return resposta({ erro: 'Não consegui abrir o ficheiro guardado.' }, 404)

    const bytes = new Uint8Array(await ficheiro.arrayBuffer())
    const ehWord = /\.docx$/i.test(caminho) || ficheiro.type.includes('wordprocessingml')
    const tipoFicheiro = ficheiro.type || (caminho.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png')
    const ehCsv = /\.(csv|txt)$/i.test(caminho) || /text\/(csv|plain)/.test(ficheiro.type)
    const ehFolha = /\.(xlsx|xls)$/i.test(caminho) || /spreadsheetml|ms-excel/.test(ficheiro.type)
    const bloco = ehWord
      ? { type: 'text' as const, text: `Conteúdo do documento Word (tabelas com colunas separadas por «|»):\n\n${textoDocx(bytes)}` }
      : ehCsv
        ? { type: 'text' as const, text: `Conteúdo do ficheiro CSV (números em formato português: 1.234,56):\n\n${textoCsv(bytes)}` }
      : ehFolha
        ? { type: 'text' as const, text: `Conteúdo da folha de cálculo (colunas separadas por «;»):\n\n${textoFolha(bytes)}` }
      : tipoFicheiro === 'application/pdf'
        ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: encodeBase64(bytes) } }
        : { type: 'image' as const, source: { type: 'base64' as const, media_type: tipoFicheiro as 'image/png' | 'image/jpeg' | 'image/webp', data: encodeBase64(bytes) } }

    const stream = claude().messages.stream({
      model: Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5',
      max_tokens: 32000,
      system: INSTRUCOES[tipo],
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: tipo === 'encomenda' ? ESQUEMA_ENCOMENDA : tipo === 'extrato' ? ESQUEMA_EXTRATO : tipo === 'fatura' ? ESQUEMA_FATURA : tipo === 'producao' ? ESQUEMA_PRODUCAO : ESQUEMA_TECHPACK },
      },
      messages: [{
        role: 'user',
        content: [bloco, { type: 'text', text: `Extrai os dados deste ${tipo === 'encomenda' ? 'documento de encomenda' : tipo === 'extrato' ? 'extrato bancário' : tipo === 'fatura' ? 'documento de compra' : tipo === 'producao' ? 'folha de produção' : 'tech pack'}.${contexto ? `\nContexto: ${contexto}` : ''}` }],
      }],
    })
    const msg = await stream.finalMessage()

    if (msg.stop_reason === 'refusal') return resposta({ erro: 'A IA recusou ler este documento.' }, 422)
    if (msg.stop_reason === 'max_tokens') return resposta({ erro: 'O documento é demasiado grande para uma leitura. Divida-o em partes.' }, 422)
    const texto = msg.content.find((b) => b.type === 'text')
    if (!texto || texto.type !== 'text') return resposta({ erro: 'A IA não devolveu dados.' }, 502)

    return resposta({
      ok: true,
      tipo,
      dados: JSON.parse(texto.text),
      modelo: msg.model,
      uso: { entrada: msg.usage.input_tokens, saida: msg.usage.output_tokens },
    })
  } catch (e) {
    console.error(e)
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500)
  }
})
