import type { OrdemFabrico } from '../types'
import { slug } from './format'

/**
 * Importação do planeamento da produção (Excel «PLAN_RENT» da Pereira & Cruz).
 * Lê só a folha do planeamento (a que tem o cabeçalho ID · CLIENTE · O.F. · REF_DESC): as folhas de salários
 * (DMRs, CUSTO-HR) e as restantes não são lidas.
 */
export interface LeituraPlaneamento {
  folha: string
  ordens: Omit<OrdemFabrico, 'importacao' | 'ficheiro' | 'importadoEm'>[]
  ignoradas: number // linhas sem ID
  avisos: string[]
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/** Data ISO (aaaa-mm-dd) de uma célula: Date, nº de série do Excel ou texto dd/mm/aaaa. Só horas ou data vazia (1900) → vazio. */
export function dataCelula(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    if (v.getUTCFullYear() < 2000) return '' // só hora ou data vazia no Excel
    const d = new Date(v.getTime() + 12 * 3600e3) // evita mudar de dia por causa do fuso
    return d.toISOString().slice(0, 10)
  }
  // nº de série do Excel (a parte inteira é o dia; abaixo de 1 é só hora, sem data)
  // (antes de 2000 = célula de data vazia no Excel, que aparece como 00/01/1900 ou 01/01/1900)
  if (typeof v === 'number' && v >= 36526 && v < 80000) return new Date((Math.floor(v) - 25569) * 864e5).toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}
const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim().replace(/\s|€/g, '')
  if (!s || /^#/.test(s)) return null
  const n = Number(/,\d+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}
const texto = (v: unknown) => (v == null || /^#(VALUE|REF|N\/A|DIV)/i.test(String(v)) ? '' : String(v).replace(/\s+/g, ' ').trim())

const COLUNAS = {
  numero: 'ID', dtEncomenda: 'DT_ENCOMENDA', cliente: 'CLIENTE', categoria: 'CATEGORIA', of: 'O.F.', ref: 'REF_DESC', qtd: 'QTD', precoUnit: 'PRECO_UNIT',
  valor: 'VALOR_ENCOMENDA', dtEntregaSolic: 'DT_ENTREGA_SOLIC', embal: 'EMBAL', estado: 'ESTADO', prioridade: 'PRIORIDADE', darFora: 'DAR_FORA', amostra: 'AMOSTRA?',
  dtEntregaPrev: 'DT_ENTREGA_PREV', dtEntregaComunicada: 'DT_ENTREGA_COMUNICADA', dtEntregaReal: 'DT_ENTREGA_REAL',
} as const
const OBRIGATORIAS = ['ID', 'CLIENTE', 'REF_DESC']

export async function lerPlaneamento(buf: ArrayBuffer): Promise<LeituraPlaneamento> {
  const XLSX = await import('xlsx') // a biblioteca do Excel só carrega quando é precisa
  const wb = XLSX.read(buf, { bookVBA: false }) // datas como nº de série (sem fusos horários)
  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: false })
    const iCab = linhas.slice(0, 15).findIndex((l) => OBRIGATORIAS.every((c) => l.some((x) => norm(x) === c)))
    if (iCab < 0) continue
    const cab = linhas[iCab].map(norm)
    const col = Object.fromEntries(Object.entries(COLUNAS).map(([k, c]) => [k, cab.indexOf(norm(c))])) as Record<keyof typeof COLUNAS, number>
    const v = (l: unknown[], k: keyof typeof COLUNAS) => (col[k] >= 0 ? l[col[k]] : null)
    const vezes = new Map<string, number>()
    const ordens: LeituraPlaneamento['ordens'] = []
    let ignoradas = 0
    for (const l of linhas.slice(iCab + 1)) {
      const num = texto(v(l, 'numero'))
      if (!num || !/^E?\d/i.test(num)) { if (l.some((x) => x != null && x !== '')) ignoradas++; continue }
      const n = (vezes.get(num) ?? 0) + 1
      vezes.set(num, n)
      ordens.push({
        id: `${slug(num).toUpperCase()}·${n}`, numero: num,
        dtEncomenda: dataCelula(v(l, 'dtEncomenda')), cliente: texto(v(l, 'cliente')), categoria: texto(v(l, 'categoria')), of: texto(v(l, 'of')), ref: texto(v(l, 'ref')),
        qtd: numero(v(l, 'qtd')), precoUnit: numero(v(l, 'precoUnit')), valor: numero(v(l, 'valor')),
        dtEntregaSolic: dataCelula(v(l, 'dtEntregaSolic')), embal: texto(v(l, 'embal')), estado: texto(v(l, 'estado')), prioridade: numero(v(l, 'prioridade')),
        darFora: texto(v(l, 'darFora')), amostra: texto(v(l, 'amostra')).replace(/^-$/, ''),
        dtEntregaPrev: dataCelula(v(l, 'dtEntregaPrev')), dtEntregaComunicada: dataCelula(v(l, 'dtEntregaComunicada')), dtEntregaReal: dataCelula(v(l, 'dtEntregaReal')),
      })
    }
    const avisos: string[] = []
    const semColuna = Object.entries(COLUNAS).filter(([k]) => col[k as keyof typeof COLUNAS] < 0).map(([, c]) => c)
    if (semColuna.length) avisos.push(`Colunas não encontradas (ficam vazias): ${semColuna.join(', ')}.`)
    const repetidos = [...vezes.entries()].filter(([, n]) => n > 1)
    if (repetidos.length) avisos.push(`${repetidos.length} nº(s) com várias linhas (ex.: ${repetidos.slice(0, 3).map(([k, n]) => `${k} × ${n}`).join(', ')}): cada linha entra como uma ordem.`)
    return { folha: nome, ordens, ignoradas, avisos }
  }
  throw new Error('Não encontrei a folha do planeamento (cabeçalho com ID, CLIENTE e REF_DESC).')
}

/** Compara a leitura com o que já está na aplicação. */
export function compararPlaneamento(lidas: LeituraPlaneamento['ordens'], atuais: OrdemFabrico[]) {
  const mapa = new Map(atuais.map((o) => [o.id, o]))
  const CAMPOS = Object.keys(COLUNAS).filter((k) => k !== 'numero') as (keyof typeof COLUNAS)[]
  const novas = lidas.filter((o) => !mapa.has(o.id))
  const alteradas = lidas.filter((o) => { const a = mapa.get(o.id); return a && CAMPOS.some((k) => String(a[k] ?? '') !== String(o[k] ?? '')) })
  const estadoMuda = alteradas.filter((o) => mapa.get(o.id)!.estado !== o.estado)
  return { novas, alteradas, iguais: lidas.length - novas.length - alteradas.length, estadoMuda }
}
