import { supabase } from './supabase'
import { AMBITO_FOLHAS, google, obterToken } from './sheets'

/**
 * Produção diária (peças por hora): lida da folha escrita à mão e escrita na folha Google da produção
 * («É ESTE!!! Produção2026» no Drive), uma folha por mês com uma linha por dia.
 * O fim de um modelo marca-se a laranja na hora em que acabou (como na folha da fábrica).
 */

export const INTERVALOS = ['8h-9h', '9h-10h', '10h-11h', '11h-12h', '13h-14h', '14h-15h', '15h-16h', '16h-17h', '17h-18h']
export interface DiaProducao {
  data: string
  horas: { intervalo: string; pecas: number | null; fimModelo: boolean }[]
  modelos: string
  totalEscrito: number | null
  observacoes: string[]
  confianca: 'alta' | 'media' | 'baixa'
}
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const FOLHA_INICIAL = '1NEw040dsMajgU88KeP_Y8rpehL409t1eFR1o1mZgxX4'
const LARANJA = { red: 252 / 255, green: 229 / 255, blue: 205 / 255 }
const AMBITO = `https://www.googleapis.com/auth/drive.file ${AMBITO_FOLHAS}`

export const totalDia = (d: DiaProducao) => d.horas.reduce((s, h) => s + (h.pecas ?? 0), 0)
const normalIntervalo = (s: string) => s.toLowerCase().replace(/\s/g, '').replace(/h$/, '').replace(/(\d+)h?-(\d+)h?/, '$1-$2')

/** Completa as horas que faltam na leitura (para a grelha ter sempre as mesmas colunas). */
export function normalizarDia(d: DiaProducao): DiaProducao {
  const por = new Map(d.horas.map((h) => [normalIntervalo(h.intervalo), h]))
  return { ...d, horas: INTERVALOS.map((i) => por.get(normalIntervalo(i)) ?? { intervalo: i, pecas: null, fimModelo: false }) }
}

export async function folhaProducao(): Promise<string> {
  if (supabase) {
    const { data } = await supabase.from('documentos').select('dados').eq('colecao', 'configuracao').eq('id', 'producao').maybeSingle()
    const id = (data?.dados as { folhaGoogle?: string } | undefined)?.folhaGoogle
    if (id) return id
  }
  return FOLHA_INICIAL
}
export async function guardarFolhaProducao(id: string) {
  if (!supabase) return
  await supabase.from('documentos').upsert({ colecao: 'configuracao', id: 'producao', dados: { folhaGoogle: id } })
}

const colLetra = (n: number) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const serial = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5
const aspas = (nome: string) => `'${nome.replace(/'/g, "''")}'`

export interface Livro { id: string; token: string; titulo: string; folhas: { nome: string; sheetId: number }[] }
/** Tem de ser chamado no clique (a primeira vez abre a janela do Google). */
export async function abrirProducao(id: string): Promise<Livro> {
  const t = await obterToken(AMBITO)
  const r = await google(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(sheetId,title)`, t)
  return { id, token: t, titulo: r.properties?.title ?? '', folhas: (r.sheets ?? []).map((s: { properties: { sheetId: number; title: string } }) => ({ nome: s.properties.title, sheetId: s.properties.sheetId })) }
}

interface Mapa { folha: { nome: string; sheetId: number }; linhaPorData: Map<number, number>; colHora: Map<string, number>; colProducao: number | null; colModelo: number | null; valores: unknown[][] }
async function mapear(l: Livro, mes: number): Promise<Mapa> {
  const folha = l.folhas.find((f) => f.nome.trim().toLowerCase() === MESES[mes - 1].toLowerCase())
  if (!folha) throw new Error(`Não encontrei a folha «${MESES[mes - 1]}» em ${l.titulo}.`)
  const v = await google(`https://sheets.googleapis.com/v4/spreadsheets/${l.id}/values/${encodeURIComponent(`${aspas(folha.nome)}!A1:Z60`)}?valueRenderOption=UNFORMATTED_VALUE`, l.token)
  const valores: unknown[][] = v.values ?? []
  const iCab = valores.findIndex((r) => String(r[0] ?? '').trim().toLowerCase() === 'data')
  if (iCab < 0) throw new Error(`Na folha «${folha.nome}» não encontrei o cabeçalho «Data».`)
  const cab = valores[iCab].map((x) => String(x ?? '').trim())
  const colHora = new Map<string, number>()
  cab.forEach((c, i) => { if (/\d+h?\s*-\s*\d+h?/i.test(c)) colHora.set(normalIntervalo(c), i + 1) })
  const colProducao = cab.findIndex((c) => /^produ/i.test(c)) + 1 || null
  const colModelo = cab.findIndex((c) => /^modelo/i.test(c)) + 1 || null
  const linhaPorData = new Map<number, number>()
  valores.forEach((r, i) => { if (i > iCab && typeof r[0] === 'number') linhaPorData.set(Math.round(r[0] as number), i + 1) })
  return { folha, linhaPorData, colHora, colProducao, colModelo, valores }
}

/** O que já está na folha para estes dias (para avisar antes de substituir). */
export async function jaPreenchidos(l: Livro, dias: DiaProducao[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const meses = [...new Set(dias.map((d) => +d.data.slice(5, 7)))]
  for (const mes of meses) {
    const m = await mapear(l, mes)
    for (const d of dias.filter((x) => +x.data.slice(5, 7) === mes)) {
      const linha = m.linhaPorData.get(serial(d.data))
      if (!linha) continue
      const soma = [...m.colHora.values()].reduce((s, c) => s + (typeof m.valores[linha - 1]?.[c - 1] === 'number' ? (m.valores[linha - 1][c - 1] as number) : 0), 0)
      if (soma > 0) out[d.data] = soma
    }
  }
  return out
}

/** Escreve os dias na folha do mês: peças por hora, modelo(s), total (fórmula) e o laranja no fim de cada modelo. */
export async function escreverProducao(l: Livro, dias: DiaProducao[]): Promise<{ escritos: string[]; semLinha: string[]; link: string }> {
  const escritos: string[] = [], semLinha: string[] = []
  let gid = 0
  const meses = [...new Set(dias.map((d) => +d.data.slice(5, 7)))]
  for (const mes of meses) {
    const m = await mapear(l, mes)
    gid = m.folha.sheetId
    const dados: { range: string; values: unknown[][] }[] = []
    const formatos: unknown[] = []
    for (const d of dias.filter((x) => +x.data.slice(5, 7) === mes)) {
      const linha = m.linhaPorData.get(serial(d.data))
      if (!linha) { semLinha.push(d.data); continue }
      const cols: number[] = []
      for (const h of d.horas) {
        const c = m.colHora.get(normalIntervalo(h.intervalo))
        if (!c) continue
        cols.push(c)
        dados.push({ range: `${aspas(m.folha.nome)}!${colLetra(c)}${linha}`, values: [[h.pecas ?? '']] })
        // laranja no fim do modelo; sem laranja nas outras horas deste dia
        formatos.push({ repeatCell: { range: { sheetId: m.folha.sheetId, startRowIndex: linha - 1, endRowIndex: linha, startColumnIndex: c - 1, endColumnIndex: c },
          cell: { userEnteredFormat: { backgroundColor: h.fimModelo ? LARANJA : { red: 1, green: 1, blue: 1 } } }, fields: 'userEnteredFormat.backgroundColor' } })
      }
      if (m.colProducao && cols.length) {
        const atual = String(m.valores[linha - 1]?.[m.colProducao - 1] ?? '')
        if (!atual || typeof m.valores[linha - 1]?.[m.colProducao - 1] === 'number') {
          dados.push({ range: `${aspas(m.folha.nome)}!${colLetra(m.colProducao)}${linha}`, values: [[`=SUM(${colLetra(Math.min(...cols))}${linha}:${colLetra(Math.max(...cols))}${linha})`]] })
        }
      }
      if (m.colModelo) dados.push({ range: `${aspas(m.folha.nome)}!${colLetra(m.colModelo)}${linha}`, values: [[d.modelos]] })
      escritos.push(d.data)
    }
    if (dados.length) await google(`https://sheets.googleapis.com/v4/spreadsheets/${l.id}/values:batchUpdate`, l.token, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: dados }) })
    if (formatos.length) await google(`https://sheets.googleapis.com/v4/spreadsheets/${l.id}:batchUpdate`, l.token, { method: 'POST', body: JSON.stringify({ requests: formatos }) })
  }
  return { escritos, semLinha, link: `https://docs.google.com/spreadsheets/d/${l.id}/edit#gid=${gid}` }
}
