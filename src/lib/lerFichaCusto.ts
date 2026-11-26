import * as XLSX from 'xlsx'
import type { LinhaCusto, OrigemCusto } from '../types'
import { avaliarExpr, soma } from './calc'
import { uid } from './format'

/**
 * Leitor das fichas de custo da Pereira & Cruz em Excel (uma ficha por folha). Formatos conhecidos:
 *  - Longratex: Cliente | Ref. <tipo> | <modelo> <variante> | <código>; Total → Preço final (à mão) → Margem total.
 *  - Imprevu:   Ref. <cliente> | <modelo>; Total → N/ Comissão (fixa) → [Comissão agente % × total] → Valor total → Preço final.
 *  - GBTX:      Cliente | Marca | Ref. <código> | <descrição>; Total → N/ Comissão → Valor total → Preço final → Margem total.
 * Guarda consumos e valores como foram escritos (3/32, 140.8/1000), recalcula os totais por fórmula e assinala:
 * totais escritos à mão, linhas sem consumo ou a zero, preço final ajustado à mão, nomes copiados de outra ficha.
 */

export interface FichaCustoLida {
  folha: string
  cliente: string
  marca: string
  tipoPeca: string
  nome: string
  variante: string
  codigo: string
  linhas: (LinhaCusto & { totalFicheiro: number; fixo: boolean })[]
  totalFicheiro: number | null
  totalCalculado: number
  margemFixa: number | null // «N/ Comissão»
  comissaoPct: number | null // «Comissão agente» (% sobre o total)
  valorTotal: number // total + margem + comissão (calculado)
  precoFinal: number | null
  precoAjustado: boolean // preço final escrito à mão, diferente do valor total
  comissaoSobreCusto: boolean // a % do agente foi calculada só sobre o total do custo (ex.: E28*0.07)
  nomeDaFolha: boolean // a folha não tinha nome no cabeçalho (nome tirado do nome da folha)
  avisos: string[]
}

const txt = (c?: XLSX.CellObject) => (c?.v == null ? '' : String(c.v).trim())
const num = (c?: XLSX.CellObject) => (typeof c?.v === 'number' ? c.v : avaliarExpr(txt(c)) ?? NaN)
const exprDe = (c?: XLSX.CellObject) => (c?.f && /^[\d.+\-*/() ]+$/.test(c.f) && /[+\-*/]/.test(c.f) ? c.f.replace(/\s/g, '') : undefined)
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const pareceCodigo = (s: string) => /\d/.test(s) && /^[A-Za-z0-9][A-Za-z0-9.\-/]{3,}$/.test(s)

export function tipoDePeca(s: string) {
  const t = norm(s)
  if (/camisa|shirt|chemise/.test(t)) return 'Camisa'
  if (/saia|skirt|jupe/.test(t)) return 'Saia'
  if (/casaco|jacket|blusao|veste/.test(t)) return 'Casaco'
  if (/calcao|short|bermuda|lison|bradley/.test(t)) return 'Calções'
  if (/calca|pant|jean|vaquer|denim|roxy|melody|june|rio|swiggy|lexi|stevie|campanula/.test(t)) return 'Calças'
  return 'A definir'
}

/** Origem sugerida de cada linha (para a validação): mão de obra e materiais variáveis a confirmar. */
function origemDe(desc: string): OrigemCusto {
  const d = norm(desc)
  if (/confec|bordad|estamp|laser|botao|molas|elastico/.test(d)) return 'Confirmar'
  if (/tecido|lavand|tinturar/.test(d)) return 'Estimada'
  return 'Segura'
}

/**
 * @param clientesConhecidos nomes dos clientes dos dados mestre (para reconhecer o cliente escrito no campo «Ref.»)
 * @param clientePorOmissao cliente deduzido do nome do ficheiro (ex.: IMPREVU_FW27 → Imprevu), quando a folha não o diz
 */
export function lerFichasCusto(buf: ArrayBuffer, clientesConhecidos: string[] = [], clientePorOmissao = ''): FichaCustoLida[] {
  const wb = XLSX.read(buf, { cellFormula: true })
  const out: FichaCustoLida[] = []
  const eCliente = (s: string) => clientesConhecidos.find((c) => norm(c) === norm(s))
  for (const nomeFolha of wb.SheetNames) {
    const ws = wb.Sheets[nomeFolha]
    if (!ws['!ref']) continue
    const r = XLSX.utils.decode_range(ws['!ref'])
    const fimLinhas = Math.min(r.e.r, 200), fimCols = Math.min(r.e.c, 15)
    const cel = (R: number, C: number) => ws[XLSX.utils.encode_cell({ r: R, c: C })] as XLSX.CellObject | undefined

    // ---- cabeçalho da tabela
    let rCab = -1; const col: Record<string, number> = {}
    for (let R = r.s.r; R <= fimLinhas && rCab < 0; R++) {
      for (let C = r.s.c; C <= fimCols; C++) {
        const t = norm(txt(cel(R, C)))
        if (t.startsWith('descri')) col.desc = C
        else if (t.startsWith('unidade')) col.un = C
        else if (t.startsWith('consumo')) col.cons = C
        else if (t.startsWith('valor unit')) col.val = C
        else if (t.startsWith('valor total') || t === 'total') col.tot = C
      }
      if (col.desc != null && col.cons != null && col.val != null) rCab = R
      else Object.keys(col).forEach((k) => delete col[k])
    }
    if (rCab < 0) continue
    col.tot ??= col.val + 1

    // ---- dados do modelo, acima da tabela
    let cliente = '', marca = '', ref = '', nome = '', codigo = ''
    const celulas: { R: number; C: number; t: string }[] = []
    for (let R = r.s.r; R < rCab; R++) for (let C = r.s.c; C <= fimCols; C++) { const t = txt(cel(R, C)); if (t) celulas.push({ R, C, t }) }
    const aDireita = (i: number) => celulas.find((x) => x.R === celulas[i].R && x.C > celulas[i].C)?.t ?? ''
    const abaixo = (i: number) => celulas.find((x) => x.C === celulas[i].C && x.R > celulas[i].R)?.t ?? ''
    const usados = new Set<number>()
    celulas.forEach((c, i) => {
      if (/^cliente$/i.test(c.t)) { cliente = aDireita(i); usados.add(i) }
      else if (/^marca$/i.test(c.t)) { marca = aDireita(i); usados.add(i) }
      else if (/^ref\.?$/i.test(c.t)) { ref = aDireita(i) || abaixo(i); usados.add(i) }
    })
    const ignorar = new Set([cliente, marca, ref, 'Cliente', 'Marca', 'Ref.', 'Ref', 'Ficha de Custo'].map(norm))
    const resto = celulas.filter((c, i) => !usados.has(i) && !ignorar.has(norm(c.t)) && !/^\d{1,2}$/.test(c.t))
    // «Ref.» pode trazer o cliente (Imprevu), o tipo de peça (Longratex) ou o código (GBTX)
    let tipoTexto = ''
    if (ref) {
      const cli = eCliente(ref)
      if (cli || (!cliente && !pareceCodigo(ref) && ref === ref.toUpperCase() && ref.split(/\s+/).length === 1)) { if (!cliente) cliente = cli ?? ref }
      else if (pareceCodigo(ref)) codigo = ref
      else tipoTexto = ref
    }
    for (const c of resto) {
      if (!codigo && pareceCodigo(c.t)) { codigo = c.t; continue }
      if (!nome) { nome = c.t; continue }
    }
    const linhaNome = resto.find((c) => c.t === nome)
    const variante = linhaNome ? (resto.find((c) => c.R === linhaNome.R && c.C > linhaNome.C && c.t !== codigo)?.t ?? '') : ''
    let nomeFinal = nome, varianteFinal = variante
    if (!nomeFinal) { // folha sem cabeçalho: nome da folha (ex.: «Melody_acidwash» → Melody · acidwash)
      const [m, ...v] = nomeFolha.replace(/^c[óo]pia de\s+/i, '').split('_')
      nomeFinal = m; varianteFinal = v.join(' ')
    }
    cliente = eCliente(cliente) ?? (cliente || clientePorOmissao)

    // ---- linhas da ficha e bloco final
    const linhas: FichaCustoLida['linhas'] = []
    let totalFicheiro: number | null = null, precoFinal: number | null = null, margemFixa: number | null = null, comissaoPct: number | null = null
    let precoEFormula = false, rTotal = -1, comissaoSobreCusto = false
    for (let R = rCab + 1; R <= fimLinhas; R++) {
      const d = txt(cel(R, col.desc))
      const rotulos = Array.from({ length: fimCols + 1 }, (_, C) => [C, txt(cel(R, C))] as const).filter(([, t]) => t)
      const rot = (re: RegExp) => rotulos.find(([, t]) => re.test(t))
      const pf = rot(/^pre[çc]o final/i)
      if (pf) { const c = cel(R, pf[0] + 1); const v = num(c); if (Number.isFinite(v)) { precoFinal = v; precoEFormula = !!c?.f } ; continue }
      if (/^total$/i.test(d)) { const v = num(cel(R, col.tot)); if (Number.isFinite(v)) totalFicheiro = v; rTotal = R; continue }
      const nc = rot(/^n\/?\s*comiss/i)
      if (nc) { const v = num(cel(R, nc[0] + 1)); if (Number.isFinite(v)) margemFixa = v; continue }
      const ca = rot(/^comiss[ãa]o/i)
      if (ca) {
        const c = cel(R, ca[0] + 1)
        const m = c?.f?.match(/\*\s*([\d.]+)\s*$/) ?? c?.f?.match(/^\s*([\d.]+)\s*\*/)
        if (m) { comissaoPct = Math.round(Number(m[1]) * 10000) / 100; comissaoSobreCusto = rTotal >= 0 && new RegExp(`^\\$?[A-Z]+\\$?${rTotal + 1}\\b`).test(c!.f!.replace(/\s/g, '').replace(/^[\d.]+\*/, '')) }
        else if (totalFicheiro && Number.isFinite(num(c))) comissaoPct = Math.round((num(c) / totalFicheiro) * 10000) / 100
        continue
      }
      if (rot(/^valor total$|^margem/i) || rTotal >= 0) continue
      if (!d) continue
      const consumoC = cel(R, col.cons), valorC = cel(R, col.val)
      const valor = num(valorC)
      if (!Number.isFinite(valor)) continue // ex.: «Acessórios — DADOS PELA GBTX»
      const semConsumo = !txt(consumoC)
      const consumo = semConsumo ? 0 : num(consumoC)
      if (!Number.isFinite(consumo)) continue
      const cTot = cel(R, col.tot)
      const totFich = num(cTot)
      const fixo = !!cTot && !cTot.f && Number.isFinite(totFich) && Math.abs(totFich - consumo * valor) > 0.005
      linhas.push({
        id: uid('c'), descricao: d.replace(/\s{2,}/g, ' '), unidade: col.un != null ? txt(cel(R, col.un)) || undefined : undefined,
        consumo, valor, consumoExpr: exprDe(consumoC), valorExpr: exprDe(valorC),
        origem: origemDe(d), totalFicheiro: Number.isFinite(totFich) ? totFich : consumo * valor, fixo,
        nota: semConsumo && valor > 0 ? 'Consumo em branco na ficha original.' : undefined,
      })
    }
    if (!linhas.length) continue

    const totalCalculado = soma(linhas.map((l) => l.consumo * l.valor))
    const valorTotal = totalCalculado + (margemFixa ?? 0) + ((comissaoSobreCusto ? totalCalculado : totalCalculado + (margemFixa ?? 0)) * (comissaoPct ?? 0)) / 100
    const precoAjustado = precoFinal != null && !precoEFormula && Math.abs(precoFinal - valorTotal) > 0.005 && (margemFixa != null || comissaoPct != null)
    const avisos: string[] = []
    for (const l of linhas.filter((x) => x.fixo)) avisos.push(`«${l.descricao}»: total escrito à mão (${l.totalFicheiro.toFixed(2)} €) diferente de consumo × valor (${(l.consumo * l.valor).toFixed(2)} €).`)
    for (const l of linhas.filter((x) => x.nota && x.consumo === 0)) avisos.push(`«${l.descricao}» sem consumo: total a 0 €.`)
    const corteJunto = linhas.find((l) => /^corte/.test(norm(l.descricao)) && l.valor > 2)
    for (const l of linhas.filter((x) => x.consumo > 0 && x.valor === 0 && !(corteJunto && /^confec/.test(norm(x.descricao))))) avisos.push(`«${l.descricao}» com valor 0 € (confirmar).`)
    const corte = linhas.find((l) => /^corte/.test(norm(l.descricao))), confec = linhas.find((l) => /^confec/.test(norm(l.descricao)))
    // corte e confeção vêm juntos numa só linha (só se separam com confeção fora): não é erro
    if (corte && confec && corte.valor > 2 && confec.valor === 0) corte.nota = corte.nota ?? 'Corte e confeção juntos nesta linha.'
    for (const l of linhas.filter((x) => /^tecido/.test(norm(x.descricao)) && x.consumo > 0 && x.consumo < 0.1)) {
      l.nota = 'Consumo de tecido muito baixo: confirmar nos mini planos.'
      avisos.push(`«${l.descricao}»: consumo de tecido ${l.consumo.toFixed(3)} m muito baixo: confirmar nos mini planos.`)
    }
    if (totalFicheiro != null && Math.abs(totalFicheiro - totalCalculado) > 0.005) avisos.push(`Total da ficha ${totalFicheiro.toFixed(2)} € ≠ total calculado ${totalCalculado.toFixed(2)} €.`)
    if (tipoTexto && /chino/i.test(tipoTexto) && !/chino/i.test(`${nomeFinal} ${varianteFinal}`)) avisos.push(`Tipo de peça «${tipoTexto}» não condiz com o modelo «${nomeFinal} ${varianteFinal}».`)
    const corFolha = cor(nomeFolha), corNome = cor(nome)
    if (corFolha && corNome && corFolha !== corNome) avisos.push(`A folha «${nomeFolha}» é ${corFolha} mas o nome diz «${nome}» (cabeçalho copiado de outra ficha?).`)
    if (/^c[óo]pia de/i.test(nomeFolha)) avisos.push('Folha «Cópia de…»: confirmar se não é repetida.')
    if (precoFinal != null && precoFinal < totalCalculado) avisos.push(`Preço final (${precoFinal.toFixed(2)} €) abaixo do custo.`)

    out.push({
      folha: nomeFolha, cliente, marca, tipoPeca: tipoDePeca(`${tipoTexto} ${nomeFinal} ${varianteFinal} ${nomeFolha}`),
      nome: nomeFinal, variante: varianteFinal, codigo, linhas, totalFicheiro, totalCalculado,
      margemFixa, comissaoPct, valorTotal, precoFinal, precoAjustado, avisos, comissaoSobreCusto, nomeDaFolha: !nome,
    })
  }
  // mesmo nome ou código em folhas de modelos diferentes → cabeçalho copiado
  const GENERICAS = new Set(['shirt', 'skirt', 'denim', 'calcao', 'calca', 'midi'])
  const raiz = (f: string) => {
    const t = norm(f.replace(/^c[óo]pia de\s+/i, '')).split(/[_\s]+/).map((x) => x.replace(/[\d.]+$/, '')).filter(Boolean)
    const i = t.findIndex((x) => !GENERICAS.has(x))
    return t.slice(0, i < 0 ? t.length : i + 1).join(' ')
  }
  for (const f of out) {
    const igual = out.find((g) => g !== f && raiz(g.folha) !== raiz(f.folha) && ((f.codigo && g.codigo === f.codigo)
      || (!f.nomeDaFolha && !g.nomeDaFolha && norm(f.nome) === norm(g.nome) && !norm(f.nome).includes(raiz(f.folha)))))
    if (igual) f.avisos.push(`Mesmo ${f.codigo && igual.codigo === f.codigo ? `código (${f.codigo})` : `nome («${f.nome}»)`} que a folha «${igual.folha}»: cabeçalho copiado?`)
  }
  return out
}

const CORES: [string, RegExp][] = [
  ['azul', /blue|azul|indigo/], ['castanho', /brown|castanh|tobacco|choco/], ['cinzento', /grey|gray|cinz/], ['preto', /black|preto|noir/],
  ['branco', /white|blanc|branco/], ['ecru', /ecru|natur|cru\b/], ['lilás', /lilac|lilas|violet/], ['verde', /green|verde|vert/], ['rosa', /pink|rosa|rose/],
]
function cor(s: string) { const t = norm(s); return CORES.find(([, re]) => re.test(t))?.[0] ?? '' }
