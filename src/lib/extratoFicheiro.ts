import * as XLSX from 'xlsx'
import type { ExtratoLido } from './ia'

/**
 * Leitura direta (sem IA) de extratos exportados em CSV ou Excel pelos bancos (CGD, Crédito Agrícola, Montepio, Revolut…).
 * Procura a linha de cabeçalho (Data … Descrição … Movimento/Débito/Crédito … Saldo) e lê as linhas seguintes.
 * Devolve null se não reconhecer o formato (a aplicação usa então a leitura com IA).
 */
const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v ?? '').trim().replace(/\s|€|EUR/gi, '')
  if (!s) return null
  const negativo = /^\(.*\)$/.test(s) || /-$/.test(s)
  s = s.replace(/[()]/g, '').replace(/-$/, '')
  // 1.234,56 (pt) ou 1,234.56 (en) ou 1234.56
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? (negativo ? -Math.abs(n) : n) : null
}

function data(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

function deLinhas(linhas: unknown[][]): ExtratoLido | null {
  const txt = linhas.map((l) => l.map((c) => semAcentos(String(c ?? ''))))
  const iCab = txt.findIndex((l) => l.some((c) => /^data/.test(c)) && l.some((c) => /descri|designa|movimento|operac|detalhe/.test(c)))
  if (iCab < 0) return null
  const cab = txt[iCab]
  const col = (re: RegExp, excluir?: RegExp) => cab.findIndex((c) => re.test(c) && !(excluir && excluir.test(c)))
  const cData = cab.findIndex((c) => /^data( mov|$| de mov|-mov| operac| lanc)/.test(c)) >= 0 ? cab.findIndex((c) => /^data( mov|$| de mov|-mov| operac| lanc)/.test(c)) : col(/^data/)
  const cDesc = col(/descri|designa|detalhe/) >= 0 ? col(/descri|designa|detalhe/) : col(/operac/)
  const cDeb = col(/debito/)
  const cCred = col(/credito/)
  const cValor = cDeb < 0 ? col(/^(movimento|montante|valor|quantia|importancia|amount)/, /saldo|data/) : -1
  const cSaldo = col(/saldo/)
  if (cData < 0 || cDesc < 0 || (cValor < 0 && cDeb < 0 && cCred < 0)) return null

  const movimentos: ExtratoLido['movimentos'] = []
  for (const l of linhas.slice(iCab + 1)) {
    const d = data(l[cData])
    if (!d) continue
    let valor: number | null
    if (cValor >= 0) valor = numero(l[cValor])
    else {
      const deb = numero(l[cDeb]); const cred = cCred >= 0 ? numero(l[cCred]) : null
      valor = (cred ? Math.abs(cred) : 0) - (deb ? Math.abs(deb) : 0)
      if (!deb && !cred) valor = null
    }
    if (valor == null) continue
    movimentos.push({ data: d, descricao: String(l[cDesc] ?? '').replace(/\s+/g, ' ').trim(), valor: Math.round(valor * 100) / 100, saldo: cSaldo >= 0 ? numero(l[cSaldo]) : null, pagina: 1, confianca: 'alta' })
  }
  if (!movimentos.length) return null

  // saldos no cabeçalho do extrato (ex.: «Saldo contabilístico Inicial ;2.010,81»)
  const saldoTopo = (re: RegExp) => {
    for (const l of linhas.slice(0, iCab)) {
      const i = l.findIndex((c) => re.test(semAcentos(String(c ?? ''))))
      if (i >= 0) for (const c of l.slice(i + 1)) { const n = numero(c); if (n != null) return n }
    }
    return null
  }
  let saldoInicial = saldoTopo(/saldo.*(inicial|anterior)/)
  let saldoFinal = saldoTopo(/saldo.*(final|atual|disponivel)/)
  // por ordem de data (há bancos que mostram o mais recente primeiro)
  const desc = movimentos.length > 1 && movimentos[0].data > movimentos[movimentos.length - 1].data
  const ordenados = desc ? [...movimentos].reverse() : movimentos
  if (saldoInicial == null && ordenados[0].saldo != null) saldoInicial = Math.round((ordenados[0].saldo - ordenados[0].valor) * 100) / 100
  if (saldoFinal == null && ordenados[ordenados.length - 1].saldo != null) saldoFinal = ordenados[ordenados.length - 1].saldo
  const datas = ordenados.map((m) => m.data).sort()
  return { banco: null, conta: null, titular: null, dataInicio: datas[0], dataFim: datas[datas.length - 1], saldoInicial, saldoFinal, movimentos: ordenados }
}

function decodificar(bytes: Uint8Array) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return new TextDecoder('windows-1252').decode(bytes) }
}

/** CSV: separador «;», «,» ou tabulação; aspas respeitadas. */
function csvLinhas(texto: string): string[][] {
  const amostra = texto.split(/\r?\n/).slice(0, 30).join('\n')
  const sep = [';', '\t', ','].map((s) => [s, amostra.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const linhas: string[][] = []
  let linha: string[] = [], campo = '', aspas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (aspas) { if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++ } else if (ch === '"') aspas = false; else campo += ch; continue }
    if (ch === '"') aspas = true
    else if (ch === sep) { linha.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else campo += ch
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas
}

export async function lerExtratoFicheiro(f: File): Promise<ExtratoLido | null> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  if (/\.(csv|txt)$/i.test(f.name)) return deLinhas(csvLinhas(decodificar(bytes)))
  if (/\.(xlsx|xls|xlsm)$/i.test(f.name)) {
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
    for (const n of wb.SheetNames) {
      const r = deLinhas(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' }))
      if (r) return r
    }
  }
  return null
}
