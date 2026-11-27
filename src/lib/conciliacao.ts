import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { listarTOC, type EmpresaTOC } from './toconline'

/** Conciliação bancária: movimentos do extrato cruzados com as faturas (venda e compra) do TOConline. */

export interface DocTOC {
  id: string; tipo: 'venda' | 'compra'; docType: string; numero: string; data: string
  total: number; pendente: number | null; entidade: string; nif: string
}
export interface Proposta { docs: DocTOC[]; pontos: number; motivo: string }
export interface Movimento {
  id: string; data: string; descricao: string; valor: number; saldoBanco: number | null
  /** faturas atribuídas (pode ser mais do que uma, ou parte de uma) */
  faturas: { id?: string; tipo?: 'venda' | 'compra'; numero: string; entidade?: string; total?: number }[]
  obs: string
  estado: 'por-conciliar' | 'proposto' | 'confirmado' | 'sem-fatura'
  confianca?: 'alta' | 'media' | 'baixa'
}
export interface Conciliacao {
  id: string; empresa: EmpresaTOC; conta: string; ano: number; mes: number
  saldoInicial: number; saldoFinalExtrato: number | null
  movimentos: Movimento[]
  extrato?: { nome: string; caminho: string }
  atualizadoEm: string
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const idConciliacao = (empresa: string, conta: string, ano: number, mes: number) =>
  `${empresa}-${conta.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()}-${ano}-${String(mes).padStart(2, '0')}`
export const arred = (n: number) => Math.round(n * 100) / 100

// ---------- guardar / ler ----------
export async function listarConciliacoes(): Promise<Conciliacao[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('documentos').select('dados').eq('colecao', 'conciliacoes')
  if (error) throw new Error(error.message)
  return (data ?? []).map((l) => l.dados as Conciliacao).sort((a, b) => b.ano - a.ano || b.mes - a.mes || a.conta.localeCompare(b.conta))
}
export async function guardarConciliacao(c: Conciliacao) {
  if (!supabase) throw new Error('Sem servidor.')
  const dados = { ...c, atualizadoEm: new Date().toISOString() }
  const { error } = await supabase.from('documentos').upsert({ colecao: 'conciliacoes', id: c.id, dados })
  if (error) throw new Error(error.message)
  return dados
}
export async function apagarConciliacao(id: string) {
  if (!supabase) return
  const { error } = await supabase.from('documentos').delete().eq('colecao', 'conciliacoes').eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------- faturas do TOConline ----------
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
const texto = (...v: unknown[]) => String(v.find((x) => typeof x === 'string' && x.trim()) ?? '').trim()

/** Lê as faturas por páginas (das mais recentes para as mais antigas) até à data «desde». */
async function lerPaginas(empresa: EmpresaTOC, recurso: string, desde: string, aviso: (s: string) => void) {
  const todos: ({ id: string } & Record<string, unknown>)[] = []
  for (let p = 1; p <= 40; p++) {
    let pagina: ({ id: string } & Record<string, unknown>)[]
    try {
      pagina = await listarTOC(empresa, `${recurso}?page[size]=100&page[number]=${p}&sort=-date`)
    } catch (e) {
      if (p === 1) throw e
      break
    }
    todos.push(...pagina)
    const maisAntiga = pagina.reduce((m, d) => (String(d.date ?? '') < m ? String(d.date ?? '') : m), '9999')
    if (pagina.length < 100 || maisAntiga < desde) break
    aviso(`${recurso.includes('purchases') ? 'Compras' : 'Vendas'}: ${todos.length} documentos lidos…`)
  }
  return todos.filter((d) => String(d.date ?? '') >= desde)
}

export async function carregarFaturas(empresa: EmpresaTOC, desde: string, aviso: (s: string) => void = () => {}) {
  const erros: string[] = []
  let vendas: DocTOC[] = [], compras: DocTOC[] = []
  try {
    vendas = (await lerPaginas(empresa, 'commercial_sales_documents', desde, aviso))
      .filter((d) => /^(FT|FR|FS|NC|ND)$/.test(String(d.document_type ?? '')) && Number(d.status ?? 1) !== 4)
      .map((d) => {
        const t = String(d.document_type)
        const total = num(d.gross_total)
        return {
          id: d.id, tipo: 'venda' as const, docType: t, numero: texto(d.document_no), data: String(d.date ?? '').slice(0, 10),
          total: arred((t === 'NC' ? -1 : 1) * Math.abs(total || 0)), pendente: Number.isFinite(num(d.pending_total)) ? num(d.pending_total) : null,
          entidade: texto(d.customer_business_name, d.customer_name), nif: texto(d.customer_tax_registration_number),
        }
      })
  } catch (e) { erros.push(`Vendas: ${e instanceof Error ? e.message : String(e)}`) }
  try {
    compras = (await lerPaginas(empresa, 'commercial_purchases_documents', desde, aviso))
      .filter((d) => Number(d.status ?? 1) !== 4)
      .map((d) => {
        const t = String(d.document_type ?? '')
        const total = num(d.gross_total ?? d.total)
        return {
          id: d.id, tipo: 'compra' as const, docType: t,
          // nº do documento do fornecedor (é o que aparece no extrato e na conciliação)
          numero: texto(d.external_reference, d.supplier_document_no, d.document_no, d.reference),
          data: String(d.date ?? '').slice(0, 10),
          total: arred((/^NC/.test(t) ? -1 : 1) * Math.abs(total || 0)), pendente: Number.isFinite(num(d.pending_total)) ? num(d.pending_total) : null,
          entidade: texto(d.supplier_business_name, d.supplier_name, d.business_name), nif: texto(d.supplier_tax_registration_number),
        }
      })
  } catch (e) { erros.push(`Compras: ${e instanceof Error ? e.message : String(e)}`) }
  return { vendas, compras, erros }
}

// ---------- cruzamento ----------
const PALAVRAS_VAZIAS = new Set(['lda', 'unipessoal', 'limitada', 'sa', 'sociedade', 'comercio', 'comercial', 'industria', 'de', 'da', 'do', 'das', 'dos', 'e', 'the', 'and', 'ltd', 'llc', 'sl', 'srl', 'gmbh', 'pagamento', 'fornecedor', 'recebimento', 'cliente', 'trf', 'transferencia', 'imediata', 'dd', 'ips'])
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const palavras = (s: string) => normal(s).split(' ').filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p))

/** 0 a 1: quanto do nome da entidade aparece no descritivo (o banco corta os nomes, por isso aceita prefixos). */
export function semelhancaNome(descricao: string, entidade: string) {
  const ent = palavras(entidade)
  if (!ent.length) return 0
  const desc = palavras(descricao)
  const juntos = normal(descricao).replace(/ /g, '')
  let acertos = 0
  for (const p of ent) {
    if (desc.some((d) => d === p || (d.length >= 4 && p.startsWith(d)) || (p.length >= 4 && d.startsWith(p))) || (p.length >= 5 && juntos.includes(p))) acertos++
  }
  // as primeiras palavras do nome contam mais (o banco mostra o início)
  return Math.min(1, acertos / Math.min(ent.length, 3))
}

const dias = (a: string, b: string) => (new Date(a).getTime() - new Date(b).getTime()) / 864e5
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005

/** Faturas candidatas para um movimento, da mais provável para a menos provável. */
export function candidatas(m: Movimento, docs: DocTOC[], usados: Set<string> = new Set()): Proposta[] {
  const alvo = Math.abs(m.valor)
  const lado = docs.filter((d) => (m.valor >= 0 ? d.tipo === 'venda' : d.tipo === 'compra') && !usados.has(d.id) && dias(d.data, m.data) <= 5)
  const propostas: Proposta[] = []
  const valorBate = (d: DocTOC) => igual(Math.abs(d.total), alvo) || (d.pendente != null && d.pendente > 0 && igual(d.pendente, alvo))
  // valor único: se só uma fatura do período tem exatamente este valor, é muito provável que seja ela
  // (ex.: débitos «CCONFIRMING» da CGD, «Reembolso de faturas» do confirming, sem nome no descritivo)
  const unico = lado.filter(valorBate).length === 1
  for (const d of lado) {
    const nome = semelhancaNome(m.descricao, d.entidade)
    const valorTotal = igual(Math.abs(d.total), alvo)
    const valorPendente = d.pendente != null && d.pendente > 0 && igual(d.pendente, alvo)
    const ref = d.numero && normal(m.descricao).includes(normal(d.numero).split(' ').pop() ?? '#')
    const atraso = dias(m.data, d.data)
    let pontos = 40 * nome + (atraso <= 60 ? 10 : atraso <= 180 ? 4 : 0) + (ref ? 40 : 0)
    if (valorTotal || valorPendente) pontos += 50 + (unico && nome < 0.5 ? 25 : 0) + (atraso >= 0 && atraso <= 10 ? 3 : 0)
    if (pontos >= 40) propostas.push({ docs: [d], pontos, motivo: [valorTotal ? 'valor igual' : valorPendente ? 'valor em dívida igual' : 'valor diferente', (valorTotal || valorPendente) && unico ? 'única fatura com este valor' : '', nome >= 0.5 ? 'nome coincide' : nome > 0 ? 'nome parecido' : '', ref ? 'nº no descritivo' : ''].filter(Boolean).join(' · ') })
  }
  // várias faturas da mesma entidade que somam o valor (até 3)
  if (!propostas.some((p) => p.pontos >= 90)) {
    const porEntidade = new Map<string, DocTOC[]>()
    for (const d of lado) if (semelhancaNome(m.descricao, d.entidade) >= 0.5 && Math.abs(d.total) < alvo) porEntidade.set(d.entidade, [...(porEntidade.get(d.entidade) ?? []), d])
    for (const lista of porEntidade.values()) {
      const l = lista.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 14)
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
        if (igual(Math.abs(l[i].total) + Math.abs(l[j].total), alvo)) propostas.push({ docs: [l[i], l[j]], pontos: 85, motivo: '2 faturas somam o valor · nome coincide' })
        for (let k = j + 1; k < l.length; k++) if (igual(Math.abs(l[i].total) + Math.abs(l[j].total) + Math.abs(l[k].total), alvo)) propostas.push({ docs: [l[i], l[j], l[k]], pontos: 80, motivo: '3 faturas somam o valor · nome coincide' })
      }
    }
  }
  return propostas.sort((a, b) => b.pontos - a.pontos).slice(0, 8)
}

/** Propõe a fatura de cada movimento ainda por conciliar (não mexe nos confirmados). Cada fatura só é usada uma vez. */
export function cruzar(c: Conciliacao, docs: DocTOC[]): Conciliacao {
  const usados = new Set<string>()
  for (const m of c.movimentos) if (m.estado === 'confirmado') for (const f of m.faturas) if (f.id) usados.add(f.id)
  const pendentes = c.movimentos.filter((m) => m.estado === 'por-conciliar' || m.estado === 'proposto')
  const melhores = pendentes.map((m) => ({ m, p: candidatas(m, docs, usados)[0] })).filter((x): x is { m: Movimento; p: Proposta } => !!x.p && x.p.pontos >= 75)
    .sort((a, b) => b.p.pontos - a.p.pontos)
  const atribuido = new Map<string, Proposta>()
  for (const { m, p } of melhores) {
    if (p.docs.some((d) => usados.has(d.id))) continue
    p.docs.forEach((d) => usados.add(d.id))
    atribuido.set(m.id, p)
  }
  return {
    ...c,
    movimentos: c.movimentos.map((m): Movimento => {
      if (m.estado === 'confirmado' || m.estado === 'sem-fatura') return m
      const p = atribuido.get(m.id)
      if (!p) return { ...m, estado: 'por-conciliar', faturas: [], confianca: undefined }
      return {
        ...m, estado: 'proposto', confianca: p.pontos >= 100 ? 'alta' : p.pontos >= 85 ? 'media' : 'baixa',
        faturas: p.docs.map((d) => ({ id: d.id, tipo: d.tipo, numero: d.numero, entidade: d.entidade, total: d.total })),
      }
    }),
  }
}

export const textoFaturas = (m: Movimento) => m.faturas.map((f) => f.numero).filter(Boolean).join(' + ')
export const saldoCalculado = (c: Conciliacao) => arred(c.movimentos.reduce((s, m) => s + m.valor, c.saldoInicial))

// ---------- Excel (formato da conciliação da Pereira & Cruz / Pereira's Project) ----------
export function nomeFolha(c: Conciliacao, sigla: string) {
  return `${String(c.mes).padStart(2, '0')}_${c.ano}${sigla ? `_${sigla}` : ''}`.slice(0, 31)
}
export function siglaConta(conta: string) {
  const n = normal(conta)
  if (/credito agricola|^ca$/.test(n)) return 'CA'
  if (/caixa geral|cgd/.test(n)) return 'cgd'
  if (/revolut/.test(n)) return 'revolut'
  if (/montepio/.test(n)) return 'montepio'
  return palavras(conta).map((p) => p[0]).join('').toUpperCase().slice(0, 6) || 'conta'
}

export function folhaExcel(c: Conciliacao): XLSX.WorkSheet {
  const anterior = c.mes === 1 ? `dez ${c.ano - 1}` : `${MESES[c.mes - 2].slice(0, 3).toLowerCase()} ${c.ano}`
  const linhas: unknown[][] = [
    [`Conciliação Bancária - ${c.conta.toUpperCase()}`], [], [], [], [],
    ['Ano:', c.ano, 'Mês:', MESES[c.mes - 1]],
    [],
    ['Data', 'Descrição da atividade', 'Quantia', 'Saldo', 'OBS'],
    [null, `Saldo transitado ${anterior}`, null, c.saldoInicial, null],
  ]
  const primeira = linhas.length + 1 // linha Excel do 1.º movimento
  c.movimentos.forEach((m, i) => {
    const r = primeira + i
    const fat = textoFaturas(m)
    linhas.push([new Date(`${m.data}T00:00:00`), fat ? `${m.descricao} (${fat})` : m.descricao, m.valor, { f: `D${r - 1}+C${r}` }, m.obs || (m.estado === 'sem-fatura' ? 'sem fatura' : '')])
  })
  const ultima = primeira + c.movimentos.length - 1
  linhas.push([], ['Data:', new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00'), 'SALDO TOTAL', { f: `D${ultima}` }])
  const ws = XLSX.utils.aoa_to_sheet(linhas.map((r) => r.map((v) => (v && typeof v === 'object' && 'f' in (v as object) ? { t: 'n', f: (v as { f: string }).f } : v))), { cellDates: true })
  // formatos: datas e euros
  const ref = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let R = 0; R <= ref.e.r; R++) {
    for (const C of [0, 1, 2, 3]) {
      const cel = ws[XLSX.utils.encode_cell({ r: R, c: C })]
      if (!cel) continue
      if (cel.t === 'd' || cel.v instanceof Date) cel.z = 'dd/mm/yyyy'
      else if ((C === 2 || C === 3) && cel.t === 'n') cel.z = '#,##0.00 "€"'
    }
  }
  ws['!cols'] = [{ wch: 12 }, { wch: 70 }, { wch: 14 }, { wch: 14 }, { wch: 28 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 3, c: 4 } }]
  return ws
}

export function descarregarExcel(cs: Conciliacao[], nomeFicheiro: string) {
  const wb = XLSX.utils.book_new()
  const usados = new Set<string>()
  for (const c of cs) {
    let nome = nomeFolha(c, siglaConta(c.conta)); let n = 2
    while (usados.has(nome)) nome = `${nomeFolha(c, siglaConta(c.conta)).slice(0, 28)}_${n++}`
    usados.add(nome)
    XLSX.utils.book_append_sheet(wb, folhaExcel(c), nome)
  }
  XLSX.writeFile(wb, nomeFicheiro, { cellDates: true })
}
