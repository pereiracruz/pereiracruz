import * as XLSX from 'xlsx'
import { MESES, textoFaturas, type Conciliacao } from './conciliacao'

/**
 * Preenche a conciliação no PRÓPRIO Excel da utilizadora (um ficheiro por empresa e ano, uma folha por mês e conta),
 * mexendo só nas células da folha do mês: formatação, logótipo, fórmulas e as outras folhas ficam como estão.
 * Trabalha diretamente no XML do .xlsx (o SheetJS gratuito perderia a formatação ao gravar).
 * Se a folha do mês ainda não existir, é criada como cópia da última folha da mesma conta.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CFB = (XLSX as unknown as { CFB: any }).CFB
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const T_WS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'
const T_DRAW = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'

export interface FolhaModelo { nome: string; caminho: string; rid: string }
export interface Modelo { cfb: unknown; folhas: FolhaModelo[]; nomeFicheiro: string }

const dec = new TextDecoder(), enc = new TextEncoder()
const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const serial = (d: Document) => new XMLSerializer().serializeToString(d)

function ler(cfb: unknown, caminho: string): string | null {
  const e = CFB.find(cfb, `/${caminho}`)
  return e && e.content ? dec.decode(new Uint8Array(e.content)) : null
}
function gravar(cfb: unknown, caminho: string, texto: string) {
  const e = CFB.find(cfb, `/${caminho}`)
  const bytes = enc.encode(texto)
  if (e) { e.content = bytes; e.size = bytes.length } else CFB.utils.cfb_add(cfb, `/${caminho}`, bytes)
}
const filhos = (el: Element | Document, nome: string) => Array.from(el.getElementsByTagName(nome))

export async function abrirModelo(f: File): Promise<Modelo> {
  const cfb = CFB.read(new Uint8Array(await f.arrayBuffer()), { type: 'buffer' })
  const wb = ler(cfb, 'xl/workbook.xml'), rels = ler(cfb, 'xl/_rels/workbook.xml.rels')
  if (!wb || !rels) throw new Error('Este ficheiro não parece um Excel (.xlsx).')
  const r = parse(rels)
  const alvo = new Map(filhos(r, 'Relationship').map((x) => [x.getAttribute('Id')!, x.getAttribute('Target')!]))
  const folhas = filhos(parse(wb), 'sheet').map((s) => {
    const rid = s.getAttributeNS(NS_R, 'id') ?? s.getAttribute('r:id') ?? ''
    const t = alvo.get(rid) ?? ''
    return { nome: s.getAttribute('name') ?? '', rid, caminho: t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}` }
  })
  return { cfb, folhas, nomeFicheiro: f.name }
}

// ---------- escolher a folha ----------
const chaveConta = (conta: string) => {
  const n = conta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return /revolut/.test(n) ? 'revolut' : /cgd|caixa geral/.test(n) ? 'cgd' : 'principal'
}
const contaDaFolha = (nome: string) => (/revolut/i.test(nome) ? 'revolut' : /cgd/i.test(nome) ? 'cgd' : 'principal')
const mesDaFolha = (nome: string) => { const m = nome.match(/(\d{2})_(\d{4})/); return m ? Number(m[2]) * 12 + Number(m[1]) : null }

/** Folha do mês desta conta (se existir) e, para criar uma nova, a folha a copiar e o nome a dar-lhe. */
export function folhaPara(m: Modelo, c: Conciliacao) {
  const conta = chaveConta(c.conta)
  const alvoMes = c.ano * 12 + c.mes
  const daConta = m.folhas.filter((f) => contaDaFolha(f.nome) === conta && mesDaFolha(f.nome) != null)
  const existente = daConta.find((f) => mesDaFolha(f.nome) === alvoMes)
  const anteriores = daConta.filter((f) => mesDaFolha(f.nome)! < alvoMes).sort((a, b) => mesDaFolha(b.nome)! - mesDaFolha(a.nome)!)
  const base = anteriores[0] ?? daConta[0] ?? m.folhas[m.folhas.length - 1]
  const mm = String(c.mes).padStart(2, '0')
  // o nome novo segue o padrão da folha copiada (ex.: «09_2026_cgd» → «10_2026_cgd», «revolut_09_2026» → «revolut_10_2026»)
  let novoNome = base ? base.nome.replace(/\d{2}_\d{4}/, `${mm}_${c.ano}`) : `${mm}_${c.ano}`
  if (!/\d{2}_\d{4}/.test(base?.nome ?? '')) novoNome = `${mm}_${c.ano}${conta === 'principal' ? '' : `_${conta}`}`
  return { existente, base, novoNome }
}

// ---------- ajudas de células ----------
const colNum = (l: string) => l.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
const colLetra = (n: number) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const partes = (ref: string) => { const m = ref.match(/^([A-Z]+)(\d+)$/)!; return { col: colNum(m[1]), row: Number(m[2]) } }
const dataExcel = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5

class Folha {
  doc: Document; dados: Element; sst: string[]
  constructor(xml: string, sst: string[]) {
    this.doc = parse(xml); this.sst = sst
    this.dados = filhos(this.doc, 'sheetData')[0]
  }
  linhas() { return filhos(this.dados, 'row') }
  linha(r: number, criar = true): Element | null {
    const ls = this.linhas()
    const l = ls.find((x) => Number(x.getAttribute('r')) === r)
    if (l || !criar) return l ?? null
    const nova = this.doc.createElementNS(NS, 'row'); nova.setAttribute('r', String(r))
    const depois = ls.find((x) => Number(x.getAttribute('r')) > r)
    this.dados.insertBefore(nova, depois ?? null)
    return nova
  }
  celula(ref: string, criar = true): Element | null {
    const { row, col } = partes(ref)
    const l = this.linha(row, criar)
    if (!l) return null
    const cs = filhos(l, 'c')
    const c = cs.find((x) => x.getAttribute('r') === ref)
    if (c || !criar) return c ?? null
    const nova = this.doc.createElementNS(NS, 'c'); nova.setAttribute('r', ref)
    const depois = cs.find((x) => partes(x.getAttribute('r')!).col > col)
    l.insertBefore(nova, depois ?? null)
    return nova
  }
  texto(ref: string): string {
    const c = this.celula(ref, false)
    if (!c) return ''
    const t = c.getAttribute('t')
    if (t === 's') return this.sst[Number(filhos(c, 'v')[0]?.textContent ?? -1)] ?? ''
    if (t === 'inlineStr') return filhos(c, 't').map((x) => x.textContent).join('')
    return filhos(c, 'v')[0]?.textContent ?? ''
  }
  estilo(ref: string) { return this.celula(ref, false)?.getAttribute('s') ?? null }
  limpar(ref: string) {
    const c = this.celula(ref, false)
    if (!c) return
    while (c.firstChild) c.removeChild(c.firstChild)
    c.removeAttribute('t')
  }
  private preparar(ref: string, s?: string | null) {
    const c = this.celula(ref)!
    while (c.firstChild) c.removeChild(c.firstChild)
    c.removeAttribute('t')
    if (s) c.setAttribute('s', s)
    return c
  }
  numero(ref: string, v: number, s?: string | null) {
    const c = this.preparar(ref, s)
    const e = this.doc.createElementNS(NS, 'v'); e.textContent = String(v); c.appendChild(e)
  }
  textoEm(ref: string, v: string, s?: string | null) {
    const c = this.preparar(ref, s)
    c.setAttribute('t', 'inlineStr')
    const is = this.doc.createElementNS(NS, 'is'), t = this.doc.createElementNS(NS, 't')
    t.setAttribute('xml:space', 'preserve'); t.textContent = v
    is.appendChild(t); c.appendChild(is)
  }
  /** Fórmula com o valor já calculado (para o ficheiro abrir com os saldos certos em qualquer programa). */
  formula(ref: string, f: string, s?: string | null, valor?: number) {
    const c = this.preparar(ref, s)
    const e = this.doc.createElementNS(NS, 'f'); e.textContent = f; c.appendChild(e)
    if (valor != null) { const v = this.doc.createElementNS(NS, 'v'); v.textContent = String(valor); c.appendChild(v) }
  }
  /** Converte fórmulas partilhadas («shared») em fórmulas normais, para se poder mexer em cada célula sem estragar as outras. */
  desfazerPartilhadas() {
    const mestres = new Map<string, { f: string; row: number; col: number }>()
    for (const f of filhos(this.dados, 'f')) {
      if (f.getAttribute('t') === 'shared' && f.getAttribute('ref') && f.textContent) {
        const p = partes((f.parentNode as Element).getAttribute('r')!)
        mestres.set(f.getAttribute('si')!, { f: f.textContent, ...p })
      }
    }
    for (const f of filhos(this.dados, 'f')) {
      if (f.getAttribute('t') !== 'shared') continue
      const m = mestres.get(f.getAttribute('si') ?? '')
      const p = partes((f.parentNode as Element).getAttribute('r')!)
      f.removeAttribute('t'); f.removeAttribute('si'); f.removeAttribute('ref')
      if (m) f.textContent = m.f.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (_t, d1, col, d2, row) =>
        `${d1}${d1 ? col : colLetra(colNum(col) + p.col - m.col)}${d2}${d2 ? row : Number(row) + p.row - m.row}`)
    }
  }
  /** Desce todas as linhas a partir de «desde» (inclusive) «n» linhas, com as células combinadas. */
  descer(desde: number, n: number) {
    for (const l of this.linhas().reverse()) {
      const r = Number(l.getAttribute('r'))
      if (r < desde) continue
      l.setAttribute('r', String(r + n))
      for (const c of filhos(l, 'c')) { const p = partes(c.getAttribute('r')!); c.setAttribute('r', `${colLetra(p.col)}${p.row + n}`) }
    }
    for (const m of filhos(this.doc, 'mergeCell')) {
      const [a, b] = m.getAttribute('ref')!.split(':')
      const pa = partes(a), pb = partes(b ?? a)
      if (pa.row >= desde) m.setAttribute('ref', `${colLetra(pa.col)}${pa.row + n}:${colLetra(pb.col)}${pb.row + n}`)
    }
  }
  juntar(ref: string) {
    let mc = filhos(this.doc, 'mergeCells')[0]
    if (!mc) { mc = this.doc.createElementNS(NS, 'mergeCells'); this.doc.documentElement.insertBefore(mc, this.dados.nextSibling) }
    if (filhos(mc, 'mergeCell').some((x) => x.getAttribute('ref') === ref)) return
    const e = this.doc.createElementNS(NS, 'mergeCell'); e.setAttribute('ref', ref); mc.appendChild(e)
    mc.setAttribute('count', String(filhos(mc, 'mergeCell').length))
  }
}

function lerSst(cfb: unknown): string[] {
  const x = ler(cfb, 'xl/sharedStrings.xml')
  if (!x) return []
  return filhos(parse(x), 'si').map((si) => filhos(si, 't').map((t) => t.textContent ?? '').join(''))
}

/** Estilo de data usado nas outras folhas (coluna A com datas), para as linhas novas ficarem iguais. */
function estiloData(m: Modelo, sst: string[]): string | null {
  const conta = new Map<string, number>()
  for (const f of m.folhas) {
    const x = ler(m.cfb, f.caminho)
    if (!x) continue
    for (const mt of x.matchAll(/<c r="A(\d+)" s="(\d+)"(?: t="n")?><v>(4\d{4})(?:\.0)?<\/v>/g)) if (Number(mt[1]) >= 10) conta.set(mt[2], (conta.get(mt[2]) ?? 0) + 1)
  }
  void sst
  return [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

// ---------- copiar uma folha ----------
function copiarFolha(m: Modelo, base: FolhaModelo, nome: string): FolhaModelo {
  const cfb = m.cfb
  const existentes = (CFB.utils ? (cfb as { FullPaths: string[] }).FullPaths : []) as string[]
  const proximo = (re: RegExp) => Math.max(0, ...existentes.map((p) => Number(p.match(re)?.[1] ?? 0))) + 1
  const nFolha = proximo(/xl\/worksheets\/sheet(\d+)\.xml$/)
  const caminho = `xl/worksheets/sheet${nFolha}.xml`
  let xml = ler(cfb, base.caminho)!
  // a cópia não fica selecionada nem com definições de impressão/comentários partilhadas
  xml = xml.replace(/ tabSelected="1"/g, '').replace(/<legacyDrawing[^>]*\/>/g, '').replace(/(<pageSetup[^>]*?) r:id="[^"]*"/g, '$1')
  gravar(cfb, caminho, xml)
  const ct = parse(ler(cfb, '[Content_Types].xml')!)
  const override = (parte: string, tipo: string) => {
    const e = ct.createElementNS(NS_CT, 'Override'); e.setAttribute('PartName', `/${parte}`); e.setAttribute('ContentType', tipo); ct.documentElement.appendChild(e)
  }
  override(caminho, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')
  // relações da folha: só o desenho (logótipo), copiado para um desenho novo
  const relsBase = ler(cfb, base.caminho.replace(/worksheets\/(sheet\d+\.xml)$/, 'worksheets/_rels/$1.rels'))
  if (relsBase) {
    const r = parse(relsBase)
    for (const rel of filhos(r, 'Relationship')) {
      if (rel.getAttribute('Type') !== T_DRAW) { rel.parentNode!.removeChild(rel); continue }
      const alvo = rel.getAttribute('Target')!
      const origem = `xl/drawings/${alvo.split('/').pop()}`
      const nDes = proximo(/xl\/drawings\/drawing(\d+)\.xml$/)
      const novo = `xl/drawings/drawing${nDes}.xml`
      gravar(cfb, novo, ler(cfb, origem) ?? '')
      const relsDes = ler(cfb, origem.replace(/drawings\/(drawing\d+\.xml)$/, 'drawings/_rels/$1.rels'))
      if (relsDes) gravar(cfb, novo.replace(/drawings\/(drawing\d+\.xml)$/, 'drawings/_rels/$1.rels'), relsDes)
      override(novo, 'application/vnd.openxmlformats-officedocument.drawing+xml')
      rel.setAttribute('Target', `../drawings/drawing${nDes}.xml`)
      existentes.push(`/${novo}`)
    }
    gravar(cfb, `xl/worksheets/_rels/sheet${nFolha}.xml.rels`, serial(r))
  }
  gravar(cfb, '[Content_Types].xml', serial(ct))
  // livro: nova relação e nova folha logo a seguir à folha copiada
  const rels = parse(ler(cfb, 'xl/_rels/workbook.xml.rels')!)
  const ids = filhos(rels, 'Relationship').map((x) => Number((x.getAttribute('Id') ?? '').replace(/\D/g, '')) || 0)
  const rid = `rId${Math.max(0, ...ids) + 1}`
  const nr = rels.createElementNS(NS_PKG, 'Relationship'); nr.setAttribute('Id', rid); nr.setAttribute('Type', T_WS); nr.setAttribute('Target', `worksheets/sheet${nFolha}.xml`)
  rels.documentElement.appendChild(nr)
  gravar(cfb, 'xl/_rels/workbook.xml.rels', serial(rels))
  const wb = parse(ler(cfb, 'xl/workbook.xml')!)
  const sheets = filhos(wb, 'sheet')
  const iBase = sheets.findIndex((s) => s.getAttribute('name') === base.nome)
  const ns = wb.createElementNS(NS, 'sheet')
  ns.setAttribute('name', nome)
  ns.setAttribute('sheetId', String(Math.max(0, ...sheets.map((s) => Number(s.getAttribute('sheetId')) || 0)) + 1))
  ns.setAttributeNS(NS_R, 'r:id', rid)
  sheets[iBase].parentNode!.insertBefore(ns, sheets[iBase].nextSibling)
  // nomes definidos locais a folhas depois da nova sobem uma posição
  for (const dn of filhos(wb, 'definedName')) {
    const l = dn.getAttribute('localSheetId')
    if (l != null && Number(l) > iBase) dn.setAttribute('localSheetId', String(Number(l) + 1))
  }
  gravar(cfb, 'xl/workbook.xml', serial(wb))
  const f = { nome, caminho, rid }
  m.folhas.splice(iBase + 1, 0, f)
  return f
}

// ---------- preencher ----------
export function preencher(m: Modelo, c: Conciliacao, folha: FolhaModelo | { copiarDe: FolhaModelo; nome: string }): string {
  const sst = lerSst(m.cfb)
  const alvo = 'copiarDe' in folha ? copiarFolha(m, folha.copiarDe, folha.nome) : folha
  const xml = ler(m.cfb, alvo.caminho)
  if (!xml) throw new Error(`Não encontrei a folha «${alvo.nome}» dentro do ficheiro.`)
  const fl = new Folha(xml, sst)
  fl.desfazerPartilhadas()

  // colunas pelo cabeçalho (linha com «Data» e «Quantia»)
  let linhaCab = 8
  for (const l of fl.linhas()) {
    const r = Number(l.getAttribute('r'))
    if (r > 20) break
    if (filhos(l, 'c').some((x) => /^data$/i.test(fl.texto(x.getAttribute('r')!).trim())) && filhos(l, 'c').some((x) => /quantia/i.test(fl.texto(x.getAttribute('r')!)))) { linhaCab = r; break }
  }
  const cab = new Map<string, string>()
  for (const x of filhos(fl.linha(linhaCab)!, 'c')) {
    const t = fl.texto(x.getAttribute('r')!).trim().toLowerCase(), col = x.getAttribute('r')!.replace(/\d+/, '')
    if (/^data$/.test(t)) cab.set('data', col)
    else if (/descri/.test(t)) cab.set('desc', col)
    else if (/quantia|valor|montante/.test(t)) cab.set('valor', col)
    else if (/saldo/.test(t)) cab.set('saldo', col)
    else if (/obs/.test(t)) cab.set('obs', col)
  }
  const C = { data: cab.get('data') ?? 'A', desc: cab.get('desc') ?? 'B', valor: cab.get('valor') ?? 'E', saldo: cab.get('saldo') ?? 'F', obs: cab.get('obs') ?? colLetra(colNum(cab.get('saldo') ?? 'F') + 1) }
  const ultimaCol = Math.max(...Object.values(C).map(colNum))

  // Ano e Mês (linha com «Ano:» / «Mês:»)
  for (const l of fl.linhas()) {
    if (Number(l.getAttribute('r')) >= linhaCab) break
    for (const x of filhos(l, 'c')) {
      const t = fl.texto(x.getAttribute('r')!).trim().toLowerCase()
      const p = partes(x.getAttribute('r')!)
      const seguinte = () => {
        for (let k = p.col + 1; k <= p.col + 3; k++) { const ref = `${colLetra(k)}${p.row}`; const e = fl.celula(ref, false); if (e && !/:\s*$/.test(fl.texto(ref))) return ref }
        return `${colLetra(p.col + 1)}${p.row}`
      }
      if (/^ano:?$/.test(t)) { const ref = seguinte(); fl.numero(ref, c.ano, fl.estilo(ref)) }
      if (/^m[eê]s:?$/.test(t)) { const ref = seguinte(); fl.textoEm(ref, MESES[c.mes - 1], fl.estilo(ref)) }
    }
  }

  const linhaSaldo = linhaCab + 1, primeira = linhaCab + 2
  // rodapé: linha com «Data:» na coluna da data
  let rodape = fl.linhas().map((l) => Number(l.getAttribute('r'))).find((r) => r > linhaSaldo && /^data:\s*$/i.test(fl.texto(`${C.data}${r}`).trim())) ?? null
  // estilos de uma linha de movimento (a primeira) antes de limpar
  const est = Object.fromEntries((['data', 'desc', 'valor', 'saldo', 'obs'] as const).map((k) => [k, fl.estilo(`${C[k]}${primeira}`)]))
  const estData = estiloData(m, sst) ?? est.data
  const mergeDesc = filhos(fl.doc, 'mergeCell').map((x) => x.getAttribute('ref')!).find((ref) => ref.startsWith(`${C.desc}${primeira}:`))
  const largura = mergeDesc ? colNum(mergeDesc.split(':')[1].replace(/\d+/, '')) : null

  // espaço para os movimentos: se não chegar, desce o rodapé
  const n = c.movimentos.length
  const ultimaPreparada = rodape ? rodape - 2 : null
  if (rodape && ultimaPreparada! - primeira + 1 < n) {
    const falta = n - (ultimaPreparada! - primeira + 1)
    fl.descer(rodape - 1, falta)
    rodape += falta
  }
  const fim = rodape ? rodape - 2 : Math.max(primeira + n - 1, ...fl.linhas().map((l) => Number(l.getAttribute('r'))))
  // limpa a zona dos movimentos (mantém a formatação)
  for (let r = primeira; r <= fim; r++) for (let k = 1; k <= ultimaCol; k++) fl.limpar(`${colLetra(k)}${r}`)

  // saldo transitado
  const anterior = c.mes === 1 ? `dez ${c.ano - 1}` : `${MESES[c.mes - 2].toLowerCase()} ${c.ano}`
  fl.textoEm(`${C.desc}${linhaSaldo}`, `Saldo transitado ${anterior}`, fl.estilo(`${C.desc}${linhaSaldo}`) ?? est.desc)
  fl.numero(`${C.saldo}${linhaSaldo}`, c.saldoInicial, fl.estilo(`${C.saldo}${linhaSaldo}`) ?? est.saldo)

  let saldo = c.saldoInicial
  c.movimentos.forEach((mv, i) => {
    const r = primeira + i
    saldo = Math.round((saldo + mv.valor) * 100) / 100
    const fat = textoFaturas(mv)
    fl.numero(`${C.data}${r}`, dataExcel(mv.data), estData)
    fl.textoEm(`${C.desc}${r}`, fat ? `${mv.descricao} (${fat})` : mv.descricao, est.desc)
    fl.numero(`${C.valor}${r}`, mv.valor, est.valor)
    fl.formula(`${C.saldo}${r}`, `${C.saldo}${r - 1}+${C.valor}${r}`, est.saldo, saldo)
    const obs = mv.obs || (mv.estado === 'sem-fatura' ? 'sem fatura' : '')
    if (obs) fl.textoEm(`${C.obs}${r}`, obs, est.obs)
    if (largura) fl.juntar(`${C.desc}${r}:${colLetra(largura)}${r}`)
    // linhas novas: copiam a formatação das outras colunas
    for (let k = 1; k <= ultimaCol; k++) { const ref = `${colLetra(k)}${r}`; const e = fl.celula(ref); const s0 = fl.estilo(`${colLetra(k)}${primeira}`); if (e && !e.getAttribute('s') && s0) e.setAttribute('s', s0) }
  })
  const ultima = primeira + n - 1

  // rodapé: data de hoje e SALDO TOTAL
  const hoje = new Date().toISOString().slice(0, 10)
  if (rodape) {
    fl.numero(`${colLetra(colNum(C.data) + 1)}${rodape}`, dataExcel(hoje), estData)
    const refTotal = filhos(fl.linha(rodape)!, 'c').find((x) => filhos(x, 'f').length)?.getAttribute('r') ?? `${C.saldo}${rodape}`
    fl.formula(refTotal, `${C.saldo}${ultima}`, fl.estilo(refTotal), saldo)
  } else {
    const r = ultima + 2
    fl.textoEm(`${C.data}${r}`, 'Data:', est.data)
    fl.numero(`${colLetra(colNum(C.data) + 1)}${r}`, dataExcel(hoje), estData)
    fl.textoEm(`${C.valor}${r}`, 'SALDO TOTAL', est.valor)
    fl.formula(`${C.saldo}${r}`, `${C.saldo}${ultima}`, est.saldo, saldo)
  }
  // a dimensão antiga deixa de servir; o Excel volta a calculá-la
  for (const d of filhos(fl.doc, 'dimension')) d.parentNode!.removeChild(d)
  gravar(m.cfb, alvo.caminho, serial(fl.doc))

  // o livro recalcula as fórmulas ao abrir; a cadeia de cálculo antiga deixa de ser válida
  const wb = parse(ler(m.cfb, 'xl/workbook.xml')!)
  let calc = filhos(wb, 'calcPr')[0]
  if (!calc) { calc = wb.createElementNS(NS, 'calcPr'); wb.documentElement.appendChild(calc) }
  calc.setAttribute('fullCalcOnLoad', '1')
  gravar(m.cfb, 'xl/workbook.xml', serial(wb))
  if (CFB.find(m.cfb, '/xl/calcChain.xml')) {
    CFB.utils.cfb_del(m.cfb, '/xl/calcChain.xml')
    const ct = ler(m.cfb, '[Content_Types].xml')!.replace(/<Override[^>]*calcChain[^>]*\/>/, '')
    gravar(m.cfb, '[Content_Types].xml', ct)
    const r = ler(m.cfb, 'xl/_rels/workbook.xml.rels')!.replace(/<Relationship[^>]*calcChain[^>]*\/>/, '')
    gravar(m.cfb, 'xl/_rels/workbook.xml.rels', r)
  }
  return alvo.nome
}

export function descarregarModelo(m: Modelo) {
  const out = CFB.write(m.cfb, { fileType: 'zip', type: 'buffer', compression: true })
  const blob = new Blob([new Uint8Array(out)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = m.nomeFicheiro.replace(/\.xlsx$/i, '') + '.xlsx'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
