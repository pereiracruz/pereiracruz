import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { AMBITO_FOLHAS, google, obterToken } from './sheets'

/**
 * Faltas e vencimentos do mês, a partir do relógio de ponto, com a mesma forma da folha Google «Faltas- 2026»
 * (uma folha por mês: «Outubro26», «Novembro26»…). Tudo se vê e corrige na aplicação antes de ir para o Drive.
 *
 * Horário: 8h00–12h00 e 13h00–17h10 (8h10/dia); tolerância de 5 min na entrada da manhã e no regresso do almoço.
 * Horas extra só no período definido (ex.: 16/11–23/12): antes das 8h, ao almoço e depois das 17h10 → banco de horas.
 * Regras de cálculo (iguais para todas as linhas; a confirmar pela contabilidade):
 *   salário/hora = base ÷ 173,33 · salário/dia = base ÷ 30
 *   faltas € = horas de falta não compensadas pelo banco × salário/hora · baixa € = dias de baixa × salário/dia
 *   base de descontos = base + prémio − faltas € − baixa €
 *   IRS = base de descontos × taxa · SS = base de descontos × 11 % · SS empresa = base de descontos × 23,75 %
 *   líquido = base + prémio + subsídio + KM − faltas − baixa − IRS − SS
 *   custo = base de descontos + subsídio + KM + SS empresa + acidentes de trabalho (631,02 € ÷ 3 ÷ nº de pessoas)
 */

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_FOLHA = ['Jan', 'Fev', 'Mar', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const nomeFolhaMes = (ano: number, mes: number) => `${MESES_FOLHA[mes - 1]}${String(ano).slice(2)}`
const FOLHA_INICIAL = '1kOcwMH_W5XxFBrI5J65rIpUC9CslbeTp7jhuYwqW6EU'
export const ACIDENTES_TRIMESTRE = 631.02

// ---------- horário ----------
export interface Regras { manha: [number, number]; tarde: [number, number]; tolerancia: number; extraDe: string | null; extraAte: string | null; faltasDescontamBanco: boolean }
export const REGRAS_INICIAIS: Regras = { manha: [480, 720], tarde: [780, 1030], tolerancia: 5, extraDe: '2026-11-16', extraAte: '2026-12-23', faltasDescontamBanco: true }
export const minutosDia = (r: Regras) => (r.manha[1] - r.manha[0]) + (r.tarde[1] - r.tarde[0])

// ---------- feriados (nacionais + Barcelos, 3 de maio) ----------
function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}
const iso = (d: Date) => d.toISOString().slice(0, 10)
export function feriados(ano: number): Set<string> {
  const p = pascoa(ano)
  const mais = (n: number) => iso(new Date(p.getTime() + n * 864e5))
  return new Set([`${ano}-01-01`, mais(-2), mais(0), `${ano}-04-25`, `${ano}-05-01`, `${ano}-05-03`, mais(60), `${ano}-06-10`, `${ano}-08-15`, `${ano}-10-05`, `${ano}-11-01`, `${ano}-12-01`, `${ano}-12-08`, `${ano}-12-25`])
}
export function diasDoMes(ano: number, mes: number) {
  const n = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${ano}-${String(mes).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
}
export const diaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()
export function diasUteis(ano: number, mes: number) {
  const f = feriados(ano)
  return diasDoMes(ano, mes).filter((d) => diaSemana(d) % 6 !== 0 && !f.has(d))
}

// ---------- registos do relógio ----------
/** Um dia de uma pessoa: picagens (minutos desde as 0h) ou, no resumo do programa do relógio, os totais já calculados. */
export interface DiaRelogio { data: string; picagens?: number[]; resumo?: { trabalho: number; falta: number; indefinido: number; presente: boolean } }
export interface PessoaRelogio { numero: string; nome: string; dias: DiaRelogio[] }

const hm = (s: string) => { const m = String(s).trim().match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : 0 }
/** Na folha os números têm 4 dígitos («0002») até ao 79 e 3 a partir do 80 («080»); compara-se sempre pelo valor. */
export const numeroFolha = (n: string | number) => { const v = parseInt(String(n).replace(/\D/g, ''), 10) || 0; return String(v).padStart(v >= 80 ? 3 : 4, '0') }
export const mesmoNumero = (a: string, b: string) => (parseInt(a, 10) || 0) === (parseInt(b, 10) || 0)
/** Combinados com a utilizadora: não contar (Paula Silva 80, Maria Lurdes Fernandes 6); não picam e contam como presentes (encarregada 70, Sofia 73, Rosa Faria 83 até dezembro). */
export const NAO_CONTAR = [6, 80]
export const NAO_PICAM = [70, 73, 83]

/** «Exportador_Base» do relógio (.xls/.xlsx): Number, Name, szDate, Clockings, szWorkHour, szFaultHour, szUndefinedHour… */
export async function lerResumoRelogio(f: File): Promise<PessoaRelogio[]> {
  const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' })
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' })
  if (!linhas.length || !('szDate' in linhas[0]) || !('Number' in linhas[0])) throw new Error('Este ficheiro não parece a exportação do relógio (faltam as colunas Number / szDate).')
  const por = new Map<string, PessoaRelogio>()
  for (const l of linhas) {
    const [d, m, a] = String(l.szDate).split('/')
    if (!a) continue
    const numero = numeroFolha(String(l.Number))
    const p = por.get(numero) ?? { numero, nome: String(l.Name).trim(), dias: [] }
    const marca = String(l.Clockings ?? '').trim()
    p.dias.push({ data: `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, resumo: { trabalho: hm(String(l.szWorkHour)), falta: hm(String(l.szFaultHour)), indefinido: hm(String(l.szUndefinedHour)), presente: marca === 'P' } })
    por.set(numero, p)
  }
  return [...por.values()]
}

// ---------- cálculo de um dia ----------
export type TipoAusencia = 'falta' | 'baixa' | 'ferias' | 'justificada'
export interface ResultadoDia {
  data: string; util: boolean; sabado: boolean
  falta: number; extra: number; trabalho: number
  aviso?: string            // ex.: «esqueceu-se de picar ao almoço?»
  semPicagens: boolean      // dia útil sem nenhuma picagem
  picagens?: number[]       // depois de completar as esquecidas
}

const sobrepor = (a: [number, number], b: [number, number]) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]))

/** Completa picagens esquecidas (1 ou 2 em falta): se há uma de manhã e outra à tarde, acrescenta a saída/entrada do almoço. */
function completar(p: number[], r: Regras): { p: number[]; aviso?: string } {
  const meio = (r.manha[1] + r.tarde[0]) / 2
  const s = [...p].sort((a, b) => a - b)
  if (s.length === 2 && s[0] < meio && s[1] > meio) return { p: [s[0], r.manha[1], r.tarde[0], s[1]], aviso: 'faltam as picagens do almoço: esqueceu-se de picar?' }
  if (s.length === 3) {
    const temSaidaAlmoco = s.some((x) => x >= r.manha[1] - 30 && x <= meio)
    const temEntradaAlmoco = s.some((x) => x > meio && x <= r.tarde[0] + 30)
    if (!temSaidaAlmoco && s[0] < meio) return { p: [...s, r.manha[1]].sort((a, b) => a - b), aviso: 'falta a saída para o almoço: esqueceu-se de picar?' }
    if (!temEntradaAlmoco) return { p: [...s, r.tarde[0]].sort((a, b) => a - b), aviso: 'falta a entrada depois do almoço: esqueceu-se de picar?' }
    if (s[0] > r.manha[0] + 120) return { p: [r.manha[0], ...s], aviso: 'falta a entrada da manhã: esqueceu-se de picar?' }
    return { p: [...s, r.tarde[1]], aviso: 'falta a saída da tarde: esqueceu-se de picar?' }
  }
  if (s.length === 1) return { p: s, aviso: 'só tem uma picagem: confirmar' }
  if (s.length % 2 === 1) return { p: s.slice(0, -1), aviso: 'número ímpar de picagens: confirmar' }
  return { p: s }
}

export function calcularDia(d: DiaRelogio, r: Regras, fer: Set<string>): ResultadoDia {
  const ds = diaSemana(d.data)
  const util = ds % 6 !== 0 && !fer.has(d.data)
  const sabado = ds === 6
  const noPeriodoExtra = !!r.extraDe && !!r.extraAte && d.data >= r.extraDe && d.data <= r.extraAte
  const base: ResultadoDia = { data: d.data, util, sabado, falta: 0, extra: 0, trabalho: 0, semPicagens: false }

  if (d.resumo) {
    // resumo do programa do relógio: falta do dia (com a tolerância aplicada ao total) e minutos fora do horário
    if (!util) return { ...base, trabalho: d.resumo.trabalho, extra: noPeriodoExtra ? d.resumo.trabalho + d.resumo.indefinido : 0 }
    if (!d.resumo.presente && d.resumo.trabalho === 0) return { ...base, falta: minutosDia(r), semPicagens: true }
    const falta = d.resumo.falta <= r.tolerancia * 2 ? 0 : d.resumo.falta
    return { ...base, trabalho: d.resumo.trabalho, falta, extra: noPeriodoExtra ? d.resumo.indefinido : 0 }
  }

  const { p, aviso } = completar(d.picagens ?? [], r)
  if (!p.length) return util ? { ...base, falta: minutosDia(r), semPicagens: true } : base
  const intervalos: [number, number][] = []
  for (let i = 0; i + 1 < p.length; i += 2) intervalos.push([p[i], p[i + 1]])
  const trabalho = intervalos.reduce((s, x) => s + (x[1] - x[0]), 0)
  if (!util) return { ...base, trabalho, extra: noPeriodoExtra ? trabalho : 0, picagens: p, aviso }

  let falta = 0
  for (const seg of [r.manha, r.tarde] as [number, number][]) {
    // tolerância na entrada: chegar até X minutos depois conta como a horas
    const ajustados = intervalos.map((x): [number, number] => (x[0] > seg[0] && x[0] <= seg[0] + r.tolerancia ? [seg[0], x[1]] : x))
    const coberto = ajustados.reduce((s, x) => s + sobrepor(x, seg), 0)
    falta += (seg[1] - seg[0]) - coberto
  }
  const dentro = intervalos.reduce((s, x) => s + sobrepor(x, r.manha) + sobrepor(x, r.tarde), 0)
  const extra = noPeriodoExtra ? Math.max(0, trabalho - dentro) : 0
  return { ...base, trabalho, falta, extra, picagens: p, aviso }
}

// ---------- pessoas (da folha do mês anterior) e mês ----------
export interface Pessoa {
  numero: string; nome: string
  salarioBase: number; subsidioDia: number; taxaIrs: number; premio: number; km: number
  bancoAnterior: number        // minutos
  picaPonto: boolean
  ativa: boolean
}
export interface AjustePessoa {
  ausencias: Record<string, TipoAusencia>   // dias sem picagem (ou dia inteiro) reclassificados
  confirmados: Record<string, boolean>      // avisos de picagem esquecida confirmados como presença
  premio?: number; km?: number; taxaIrs?: number; obs?: string; salarioBase?: number; subsidioDia?: number
  faltaManual?: number                      // minutos (corrige o total calculado)
  diasBaixaExtra?: number
}
export interface MesFaltas {
  id: string; ano: number; mes: number; regras: Regras
  pessoas: Pessoa[]; relogio: PessoaRelogio[]; ajustes: Record<string, AjustePessoa>
  atualizadoEm: string
}

export interface LinhaFaltas {
  pessoa: Pessoa
  dias: ResultadoDia[]
  faltaMin: number; extraSemana: number; extraSabado: number
  diasFaltaInteira: number; diasBaixa: number; diasFerias: number; diasJustificados: number; horasFalta: number
  bancoFinal: number; faltaCompensada: number; faltaNaoCompensada: number
  avisos: { data: string; texto: string }[]
  // valores da folha
  diasUteisSub: number; salarioHora: number; faltasEur: number; subsidio: number; irs: number; ss: number; ssEmpresa: number
  baixaEur: number; liquido: number; custo: number; acidentes: number; obs: string
  premio: number; km: number; taxaIrs: number; salarioBase: number; subsidioDia: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
export const horasTexto = (min: number) => (min <= 0 ? '0' : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`)
export const lerHoras = (s: unknown): number => {
  const t = String(s ?? '').trim().toLowerCase()
  const m = t.match(/^(\d+)\s*h\s*(\d{1,2})?/) ?? t.match(/^(\d+):(\d{2})/)
  if (m) return +m[1] * 60 + +(m[2] ?? 0)
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 60) : 0
}

export function calcularMes(m: MesFaltas): LinhaFaltas[] {
  const fer = feriados(m.ano)
  const uteis = diasUteis(m.ano, m.mes)
  const ativas = m.pessoas.filter((p) => p.ativa)
  const acidentes = ativas.length ? r2(ACIDENTES_TRIMESTRE / 3 / ativas.length) : 0
  return ativas.map((p) => {
    const a: AjustePessoa = m.ajustes[p.numero] ?? { ausencias: {}, confirmados: {} }
    const rel = m.relogio.find((x) => mesmoNumero(x.numero, p.numero))
    const dias = p.picaPonto && rel ? rel.dias.filter((d) => d.data.slice(0, 7) === `${m.ano}-${String(m.mes).padStart(2, '0')}`).map((d) => calcularDia(d, m.regras, fer)) : []
    let faltaMin = 0, extraSemana = 0, extraSabado = 0, diasFaltaInteira = 0, diasBaixa = 0, diasFerias = 0, diasJustificados = 0
    const avisos: { data: string; texto: string }[] = []
    if (p.picaPonto && !rel) avisos.push({ data: '', texto: 'não aparece no relógio de ponto' })
    for (const d of dias) {
      const tipo = a.ausencias[d.data]
      if (d.semPicagens || tipo) {
        const t = tipo ?? 'falta'
        if (t === 'baixa') diasBaixa++
        else if (t === 'ferias') diasFerias++
        else if (t === 'justificada') diasJustificados++
        else if (t === 'falta') { diasFaltaInteira++; faltaMin += d.semPicagens ? d.falta : minutosDia(m.regras) }
        continue
      }
      if (d.aviso && !a.confirmados[d.data]) avisos.push({ data: d.data, texto: d.aviso })
      faltaMin += d.falta
      if (d.sabado) extraSabado += d.extra; else extraSemana += d.extra
    }
    if (a.faltaManual != null) faltaMin = a.faltaManual
    diasBaixa += a.diasBaixaExtra ?? 0
    const premio = a.premio ?? p.premio, km = a.km ?? p.km, taxaIrs = a.taxaIrs ?? p.taxaIrs
    const salarioBase = a.salarioBase ?? p.salarioBase, subsidioDia = a.subsidioDia ?? p.subsidioDia
    // banco de horas: entra o extra; as faltas (que não são dias inteiros) descontam primeiro do banco
    const disponivel = p.bancoAnterior + extraSemana + extraSabado
    const faltaHoras = faltaMin - diasFaltaInteira * minutosDia(m.regras)
    const faltaCompensada = m.regras.faltasDescontamBanco ? Math.max(0, Math.min(disponivel, faltaHoras)) : 0
    const faltaNaoCompensada = faltaMin - faltaCompensada
    const bancoFinal = disponivel - faltaCompensada
    const salarioHora = salarioBase / 173.33
    const horasFalta = r2(faltaNaoCompensada / 60)
    const faltasEur = r2(horasFalta * salarioHora)
    const baixaEur = r2(diasBaixa * salarioBase / 30)
    const diasUteisSub = Math.max(0, uteis.length - diasFaltaInteira - diasBaixa - diasFerias - diasJustificados)
    const subsidio = r2(diasUteisSub * subsidioDia)
    const baseDescontos = salarioBase + premio - faltasEur - baixaEur
    const irs = r2(baseDescontos * taxaIrs), ss = r2(baseDescontos * 0.11), ssEmpresa = r2(baseDescontos * 0.2375)
    const liquido = r2(salarioBase + premio + subsidio + km - faltasEur - baixaEur - irs - ss)
    const custo = r2(baseDescontos + subsidio + km + ssEmpresa + acidentes)
    const partes = [
      diasBaixa ? `Baixa ${diasBaixa} dia(s)` : '', diasFerias ? `Férias ${diasFerias} dia(s)` : '', diasJustificados ? `Falta justificada ${diasJustificados} dia(s)` : '',
      faltaCompensada ? `${horasTexto(faltaCompensada)} compensadas no banco` : '',
    ].filter(Boolean)
    return {
      pessoa: p, dias, faltaMin, extraSemana, extraSabado, diasFaltaInteira, diasBaixa, diasFerias, diasJustificados, horasFalta, bancoFinal, faltaCompensada, faltaNaoCompensada, avisos,
      diasUteisSub, salarioHora, faltasEur, subsidio, irs, ss, ssEmpresa, baixaEur, liquido, custo, acidentes,
      obs: a.obs ?? partes.join('; '), premio, km, taxaIrs, salarioBase, subsidioDia,
    }
  })
}

/** Primeiro e último dia com registos do relógio no mês (para avisar quando a exportação não cobre o mês todo). */
export function periodoRelogio(m: MesFaltas): [string, string] | null {
  const pref = `${m.ano}-${String(m.mes).padStart(2, '0')}`
  const ds = m.relogio.flatMap((p) => p.dias.map((d) => d.data)).filter((d) => d.startsWith(pref)).sort()
  return ds.length ? [ds[0], ds[ds.length - 1]] : null
}

/** Junta registos novos do relógio aos que já estavam (o mesmo dia da mesma pessoa é substituído). */
export function juntarRelogio(antigo: PessoaRelogio[], novo: PessoaRelogio[]): PessoaRelogio[] {
  const out = antigo.map((p) => ({ ...p, dias: [...p.dias] }))
  for (const n of novo) {
    const p = out.find((x) => mesmoNumero(x.numero, n.numero))
    if (!p) { out.push(n); continue }
    for (const d of n.dias) { const i = p.dias.findIndex((x) => x.data === d.data); if (i >= 0) p.dias[i] = d; else p.dias.push(d) }
    p.dias.sort((a, b) => a.data.localeCompare(b.data))
  }
  return out
}

/** Converte a leitura da IA do PDF das picagens («08:02») em minutos. */
export interface PicagensLidas { pessoas: { numero: string; nome: string; dias: { data: string; picagens: string[] }[] }[] }
export const daLeituraIA = (r: PicagensLidas): PessoaRelogio[] => r.pessoas.map((p) => ({
  numero: numeroFolha(p.numero), nome: p.nome,
  dias: p.dias.map((d) => ({ data: d.data, picagens: d.picagens.map(hm).filter((x) => x > 0).sort((a, b) => a - b) })),
}))

// ---------- guardar o rascunho do mês ----------
export async function lerMes(id: string): Promise<MesFaltas | null> {
  if (!supabase) return null
  const { data } = await supabase.from('documentos').select('dados').eq('colecao', 'faltasMeses').eq('id', id).maybeSingle()
  return (data?.dados as MesFaltas) ?? null
}
export async function guardarMes(m: MesFaltas) {
  if (!supabase) throw new Error('Sem servidor.')
  const dados = { ...m, atualizadoEm: new Date().toISOString() }
  const { error } = await supabase.from('documentos').upsert({ colecao: 'faltasMeses', id: m.id, dados })
  if (error) throw new Error(error.message)
  return dados
}

// ---------- Google Sheets ----------
const AMBITO = `https://www.googleapis.com/auth/drive.file ${AMBITO_FOLHAS}`
const aspas = (n: string) => `'${n.replace(/'/g, "''")}'`
export async function folhaFaltas(): Promise<string> {
  if (supabase) {
    const { data } = await supabase.from('documentos').select('dados').eq('colecao', 'configuracao').eq('id', 'faltas').maybeSingle()
    const id = (data?.dados as { folhaGoogle?: string } | undefined)?.folhaGoogle
    if (id) return id
  }
  return FOLHA_INICIAL
}
export interface LivroFaltas { id: string; token: string; titulo: string; folhas: { nome: string; sheetId: number; indice: number }[] }
export async function abrirFaltas(id: string): Promise<LivroFaltas> {
  const t = await obterToken(AMBITO)
  const r = await google(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(sheetId,title,index)`, t)
  return { id, token: t, titulo: r.properties?.title ?? '', folhas: (r.sheets ?? []).map((s: { properties: { sheetId: number; title: string; index: number } }) => ({ nome: s.properties.title, sheetId: s.properties.sheetId, indice: s.properties.index })) }
}

/** Lê as pessoas (nº, nome, salário, subsídio, taxa de IRS, banco de horas) da folha de um mês. */
export async function pessoasDaFolha(l: LivroFaltas, nomeFolha: string): Promise<Pessoa[]> {
  const v = await google(`https://sheets.googleapis.com/v4/spreadsheets/${l.id}/values/${encodeURIComponent(`${aspas(nomeFolha)}!A1:AE60`)}?valueRenderOption=UNFORMATTED_VALUE`, l.token)
  const linhas: unknown[][] = v.values ?? []
  const iCab = linhas.findIndex((x) => String(x[1] ?? '').trim().toUpperCase() === 'NOME')
  if (iCab < 0) throw new Error(`Na folha «${nomeFolha}» não encontrei o cabeçalho «NOME».`)
  const out: Pessoa[] = []
  for (const x of linhas.slice(iCab + 1)) {
    const numero = String(x[0] ?? '').trim()
    const nome = String(x[1] ?? '').trim()
    if (!numero || !nome || /^totais/i.test(nome)) { if (/^totais/i.test(nome)) break; continue }
    const num = (i: number) => (typeof x[i] === 'number' ? (x[i] as number) : Number(String(x[i] ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0)
    const v = parseInt(numero, 10) || 0
    out.push({ numero, nome, salarioBase: num(14), subsidioDia: num(17), taxaIrs: num(20), premio: 0, km: 0, bancoAnterior: lerHoras(x[10]), picaPonto: !NAO_PICAM.includes(v), ativa: !NAO_CONTAR.includes(v) })
  }
  return out
}

/** Linhas exatamente como vão para a folha (colunas A…AE); as fórmulas usam só inteiros (não dependem da região da folha). */
export function linhasFolha(linhas: LinhaFaltas[], primeira: number): unknown[][] {
  const n = linhas.length
  return linhas.map((l, i) => {
    const r = primeira + i
    const h = (min: number) => (min > 0 ? horasTexto(min) : '-')
    return [
      l.pessoa.numero, l.pessoa.nome,
      l.faltaMin > 0 ? horasTexto(l.faltaMin) : 's/faltas',
      h(l.extraSemana), l.extraSabado > 0 ? horasTexto(l.extraSabado) : '',
      l.extraSemana + l.extraSabado - l.faltaMin !== 0 ? `${l.extraSemana + l.extraSabado - l.faltaMin < 0 ? '-' : ''}${horasTexto(Math.abs(l.extraSemana + l.extraSabado - l.faltaMin))}` : '-',
      l.horasFalta > 0 ? l.horasFalta : '',
      l.extraSemana + l.extraSabado > 0 ? 'Banco de horas' : 'N/A',
      '-', '-',
      horasTexto(l.bancoFinal),
      l.obs,
      30, l.premio, l.salarioBase,
      `=O${r}*100/17333`,
      `=G${r}*P${r}`,
      l.subsidioDia, l.diasUteisSub,
      `=S${r}*R${r}`,
      l.taxaIrs,
      `=(O${r}+N${r}-Q${r}-AC${r})*U${r}`,
      `=(O${r}+N${r}-Q${r}-AC${r})*11/100`,
      `=(O${r}+N${r}-Q${r}-AC${r})*2375/10000`,
      `=O${r}+N${r}+T${r}+AA${r}-Q${r}-AC${r}-V${r}-W${r}`,
      '',
      l.km, l.diasBaixa,
      `=AB${r}*O${r}/30`,
      `=O${r}+N${r}-Q${r}-AC${r}+T${r}+AA${r}+X${r}+AE${r}`,
      `=63102/100/3/${n}`,
    ]
  })
}

/** Cria (duplicando a folha do mês anterior) ou atualiza a folha do mês, com uma linha por pessoa e os totais. */
export async function escreverFaltas(l: LivroFaltas, ano: number, mes: number, linhas: LinhaFaltas[], folhaBase: string): Promise<string> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${l.id}`
  const nome = nomeFolhaMes(ano, mes)
  let folha = l.folhas.find((f) => f.nome === nome)
  if (!folha) {
    const origem = l.folhas.find((f) => f.nome === folhaBase)
    if (!origem) throw new Error(`Não encontrei a folha «${folhaBase}» para copiar.`)
    const r = await google(`${base}:batchUpdate`, l.token, { method: 'POST', body: JSON.stringify({ requests: [{ duplicateSheet: { sourceSheetId: origem.sheetId, insertSheetIndex: origem.indice + 1, newSheetName: nome } }] }) })
    const p = r.replies[0].duplicateSheet.properties
    folha = { nome: p.title, sheetId: p.sheetId, indice: p.index }
    l.folhas.push(folha)
  }
  const ref = aspas(folha.nome)
  // linhas que já existem na folha (entre o cabeçalho e TOTAIS)
  const v = await google(`${base}/values/${encodeURIComponent(`${ref}!A1:B80`)}`, l.token)
  const ab: string[][] = v.values ?? []
  const iCab = ab.findIndex((x) => String(x[1] ?? '').trim().toUpperCase() === 'NOME')
  const iTot = ab.findIndex((x, i) => i > iCab && /^totais/i.test(String(x[1] ?? '').trim()))
  if (iCab < 0) throw new Error('Não encontrei o cabeçalho «NOME» na folha.')
  const primeira = iCab + 2
  const existentes = (iTot > 0 ? iTot - 1 : ab.length) - primeira + 1 // linhas de pessoas (há uma linha em branco antes de TOTAIS)
  const pedidos: unknown[] = []
  const dif = linhas.length - existentes
  if (dif > 0) pedidos.push({ insertDimension: { range: { sheetId: folha.sheetId, dimension: 'ROWS', startIndex: primeira - 1 + existentes - 1, endIndex: primeira - 1 + existentes - 1 + dif }, inheritFromBefore: true } })
  if (dif < 0) pedidos.push({ deleteDimension: { range: { sheetId: folha.sheetId, dimension: 'ROWS', startIndex: primeira - 1 + linhas.length, endIndex: primeira - 1 + existentes } } })
  if (pedidos.length) await google(`${base}:batchUpdate`, l.token, { method: 'POST', body: JSON.stringify({ requests: pedidos }) })
  const ultima = primeira + linhas.length - 1
  const totais = ultima + 2
  const soma = (c: string) => `=SUM(${c}${primeira}:${c}${ultima})`
  const linhaTotais = ['', 'TOTAIS', '', '', '', '', '', '', '', soma('J'), '', '-', '', soma('N'), soma('O'), '', soma('Q'), '', '', soma('T'), '', soma('V'), soma('W'), soma('X'), soma('Y'), soma('Z'), soma('AA'), soma('AB'), soma('AC'), soma('AD'), soma('AE')]
  await google(`${base}/values:batchUpdate`, l.token, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: [
    { range: `${ref}!B1`, values: [[`Faltas ${MESES[mes - 1]} ${ano}`]] },
    { range: `${ref}!A${primeira}:AE${ultima}`, values: linhasFolha(linhas, primeira) },
    { range: `${ref}!A${totais}:AE${totais}`, values: [linhaTotais] },
  ] }) })
  return `https://docs.google.com/spreadsheets/d/${l.id}/edit#gid=${folha.sheetId}`
}
