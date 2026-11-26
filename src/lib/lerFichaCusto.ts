import * as XLSX from 'xlsx'
import type { LinhaCusto, OrigemCusto } from '../types'
import { avaliarExpr, soma } from './calc'
import { uid } from './format'

/**
 * Leitor das fichas de custo da Pereira & Cruz em Excel (uma ficha por folha):
 *   Cliente … | Ref. <tipo de peça> | <nome do modelo> <variante> | <código>
 *   Descrição | Unidade | Consumo | Valor Unitário | Valor Total (S/IVA)
 *   … linhas …
 *   Total | Preço Final | Margem total
 * Guarda os consumos e valores como foram escritos (ex.: 3/32, 140.8/1000) e assinala totais escritos à mão
 * que não batem com consumo × valor.
 */

export interface FichaCustoLida {
  folha: string
  cliente: string
  tipoPeca: string
  nome: string
  variante: string
  codigo: string
  linhas: (LinhaCusto & { totalFicheiro: number; fixo: boolean })[]
  totalFicheiro: number | null
  totalCalculado: number
  precoFinal: number | null
  avisos: string[]
}

const txt = (c?: XLSX.CellObject) => (c?.v == null ? '' : String(c.v).trim())
const num = (c?: XLSX.CellObject) => (typeof c?.v === 'number' ? c.v : avaliarExpr(txt(c)) ?? NaN)
const exprDe = (c?: XLSX.CellObject) => (c?.f && /^[\d.+\-*/() ]+$/.test(c.f) ? c.f.replace(/\s/g, '') : undefined)
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function tipoDePeca(s: string) {
  const t = norm(s)
  if (/calcao|short|bermuda/.test(t)) return 'Calções'
  if (/calca|pant|jean|vaqueir/.test(t)) return 'Calças'
  if (/camisa|shirt|chemise/.test(t)) return 'Camisa'
  if (/casaco|jacket|blusao/.test(t)) return 'Casaco'
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : 'A definir'
}

/** Origem sugerida de cada linha (para a validação): mão de obra e materiais variáveis a confirmar. */
function origemDe(desc: string): OrigemCusto {
  const d = norm(desc)
  if (/confec|bordad|estamp|botao|molas|elastico/.test(d)) return 'Confirmar'
  if (/tecido|lavand|tinturar/.test(d)) return 'Estimada'
  return 'Segura'
}

export function lerFichasCusto(buf: ArrayBuffer): FichaCustoLida[] {
  const wb = XLSX.read(buf, { cellFormula: true })
  const out: FichaCustoLida[] = []
  for (const nomeFolha of wb.SheetNames) {
    const ws = wb.Sheets[nomeFolha]
    if (!ws['!ref']) continue
    const r = XLSX.utils.decode_range(ws['!ref'])
    const fimLinhas = Math.min(r.e.r, 200), fimCols = Math.min(r.e.c, 15)
    const cel = (R: number, C: number) => ws[XLSX.utils.encode_cell({ r: R, c: C })] as XLSX.CellObject | undefined

    // cabeçalho da tabela
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

    // dados do modelo, acima da tabela
    let cliente = '', tipo = '', nome = '', variante = '', codigo = ''
    for (let R = r.s.r; R < rCab; R++) {
      const linha = Array.from({ length: fimCols + 1 }, (_, C) => txt(cel(R, C))).filter(Boolean)
      if (!linha.length) continue
      const i = linha.findIndex((x) => /^cliente/i.test(x))
      if (i >= 0) { cliente = linha[i + 1] ?? ''; continue }
      const j = linha.findIndex((x) => /^ref\.?$/i.test(x))
      if (j >= 0) { tipo = linha[j + 1] ?? ''; continue }
      if (/^ficha de custo$/i.test(linha[0])) continue
      if (!nome && tipo) { nome = linha[0]; variante = linha[1] ?? ''; continue }
      if (!codigo && /^\d{4,}$/.test(linha[0])) codigo = linha[0]
    }

    // linhas da ficha
    const linhas: FichaCustoLida['linhas'] = []
    let totalFicheiro: number | null = null, precoFinal: number | null = null
    for (let R = rCab + 1; R <= fimLinhas; R++) {
      const d = txt(cel(R, col.desc))
      const rotulos = Array.from({ length: fimCols + 1 }, (_, C) => [C, txt(cel(R, C))] as const)
      const pf = rotulos.find(([, t]) => /^pre[çc]o final/i.test(t))
      if (pf) { const v = num(cel(R, pf[0] + 1)); if (Number.isFinite(v)) precoFinal = v; continue }
      if (/^total$/i.test(d)) { const v = num(cel(R, col.tot)); if (Number.isFinite(v)) totalFicheiro = v; continue }
      if (!d || /^margem/i.test(d)) continue
      const consumo = num(cel(R, col.cons)), valor = num(cel(R, col.val))
      if (!Number.isFinite(consumo) || !Number.isFinite(valor)) continue
      const cTot = cel(R, col.tot)
      const totFich = num(cTot)
      const fixo = !!cTot && !cTot.f && Number.isFinite(totFich) && Math.abs(totFich - consumo * valor) > 0.0005
      linhas.push({
        id: uid('c'), descricao: d.replace(/\s{2,}/g, ' '), unidade: col.un != null ? txt(cel(R, col.un)) : undefined,
        consumo, valor, consumoExpr: exprDe(cel(R, col.cons)), valorExpr: exprDe(cel(R, col.val)),
        origem: origemDe(d), totalFicheiro: Number.isFinite(totFich) ? totFich : consumo * valor, fixo,
      })
    }
    if (!linhas.length) continue
    const totalCalculado = soma(linhas.map((l) => l.consumo * l.valor))
    const avisos: string[] = []
    for (const l of linhas.filter((x) => x.fixo)) avisos.push(`«${l.descricao}»: total escrito à mão (${l.totalFicheiro.toFixed(2)} €) diferente de consumo × valor (${(l.consumo * l.valor).toFixed(2)} €).`)
    for (const l of linhas.filter((x) => x.consumo > 0 && x.valor === 0)) avisos.push(`«${l.descricao}» com valor 0 € (confirmar).`)
    const corte = linhas.find((l) => /^corte/i.test(norm(l.descricao))), confec = linhas.find((l) => /^confec/i.test(norm(l.descricao)))
    if (corte && confec && corte.valor > confec.valor && corte.valor > 2) avisos.push(`Corte (${corte.valor.toFixed(2)} €) mais caro do que a confeção (${confec.valor.toFixed(2)} €): valores trocados?`)
    if (totalFicheiro != null && Math.abs(totalFicheiro - totalCalculado) > 0.005) avisos.push(`Total da ficha ${totalFicheiro.toFixed(2)} € ≠ total calculado ${totalCalculado.toFixed(2)} €.`)
    if (tipo && nome && norm(tipo).includes('chino') && !norm(`${nome} ${variante}`).includes('chino')) avisos.push(`Tipo de peça «${tipo}» não condiz com o modelo «${nome} ${variante}».`)
    if (precoFinal != null && precoFinal < totalCalculado) avisos.push(`Preço final (${precoFinal.toFixed(2)} €) abaixo do custo.`)
    out.push({ folha: nomeFolha, cliente, tipoPeca: tipoDePeca(`${tipo} ${variante}`), nome: nome || nomeFolha, variante, codigo, linhas, totalFicheiro, totalCalculado, precoFinal, avisos })
  }
  return out
}
