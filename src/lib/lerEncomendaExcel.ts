import * as XLSX from 'xlsx'
import type { Encomenda, Modelo, Variante } from '../types'
import { slug } from './format'

/**
 * Leitor de encomendas em Excel (sem IA): encontra a linha de cabeçalho, as colunas de tamanhos,
 * referência, descrição, cor, quantidade e preço. As linhas "stock" somam ao stock da mesma referência.
 * Confere cada linha com a coluna de quantidade do próprio ficheiro.
 */

const RE_TAM = /^(\d{2}|XXS|XS|S|M|L|XL|XXL|[2-5]XL|\d{1,2}M|\d{1,2}Y|\d{1,2}A|L\d{2}|T\d{1,2}|\d{2}\/\d{2})$/i
const RE_REF = /^(style|ref|refer[eê]ncia|r[ée]f[ée]rence|article|art\.?|code|modelo|item)/i
const RE_DESC = /^(desc|designa|libell|nome|name)/i
const RE_COR = /^(colou?r|cor|couleur|coloris)/i
const RE_QTD = /^(qty|qt[eé]|quant|total|pcs|pe[çc]as)/i
const RE_PRECO = /^(price|prix|pre[çc]o|pvp|unit)/i
const RE_STOCK = /^stock$/i

export interface PerguntaCliente { ref: string; texto: string }
export interface LeituraExcel {
  ok: boolean
  erro?: string
  folha: string
  linhaCabecalho: number
  tamanhos: string[]
  colunasExtra: string[]
  modelos: Modelo[]
  preEncomenda: number
  stock: number
  temPrecos: boolean
  linhasLidas: number
  linhasComDiferenca: { linha: number; ref: string; lida: number; ficheiro: number }[]
  perguntas: PerguntaCliente[]
  notasPorRef: Record<string, string[]>
}

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s|-)\S/g, (c) => c.toUpperCase())
const prefixoComum = (frases: string[]) => {
  const ps = frases.map((f) => f.trim().split(/\s+/))
  const out: string[] = []
  for (let i = 0; i < ps[0].length; i++) { if (ps.every((p) => p[i] === ps[0][i])) out.push(ps[0][i]); else break }
  return out.join(' ')
}

export function lerEncomendaExcel(buf: ArrayBuffer, nomesConhecidos: string[] = []): LeituraExcel {
  const wb = XLSX.read(buf)
  const vazio = (erro: string): LeituraExcel => ({ ok: false, erro, folha: '', linhaCabecalho: 0, tamanhos: [], colunasExtra: [], modelos: [], preEncomenda: 0, stock: 0, temPrecos: false, linhasLidas: 0, linhasComDiferenca: [], perguntas: [], notasPorRef: {} })

  for (const nomeFolha of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeFolha], { header: 1, defval: '', raw: true })
    // cabeçalho: primeira linha com ≥3 tamanhos e uma coluna de referência
    const iCab = linhas.findIndex((l) => l.filter((c) => RE_TAM.test(String(c).trim())).length >= 3 && l.some((c) => RE_REF.test(String(c).trim())))
    if (iCab < 0) continue
    const cab = linhas[iCab].map((c) => String(c).trim())
    const col = (re: RegExp) => cab.findIndex((c) => re.test(c))
    const cTam = cab.map((c, i) => (RE_TAM.test(c) ? i : -1)).filter((i) => i >= 0)
    const cRef = col(RE_REF), cDesc = col(RE_DESC), cCor = col(RE_COR), cQtd = col(RE_QTD), cPreco = col(RE_PRECO)
    const usadas = new Set([cRef, cDesc, cCor, cQtd, cPreco, ...cTam])
    const cExtra = cab.map((c, i) => (c && !usadas.has(i) ? i : -1)).filter((i) => i >= 0)
    const tamanhos = cTam.map((i) => cab[i])

    type L = { ref: string; desc: string; cor: string; q: number[]; preco: number; extra: string[] }
    const lidas: L[] = []
    const difs: LeituraExcel['linhasComDiferenca'] = []
    linhas.slice(iCab + 1).forEach((l, k) => {
      const ref = String(l[cRef] ?? '').trim()
      if (!ref || /^total/i.test(ref)) return
      const q = cTam.map((i) => Math.round(Number(l[i]) || 0))
      const s = q.reduce((a, b) => a + b, 0)
      if (s === 0) return
      if (cQtd >= 0 && l[cQtd] !== '' && Number(l[cQtd]) !== s) difs.push({ linha: iCab + k + 2, ref, lida: s, ficheiro: Number(l[cQtd]) })
      lidas.push({
        ref, desc: cDesc >= 0 ? String(l[cDesc]).trim() : ref, cor: cCor >= 0 ? String(l[cCor]).trim() : '',
        q, preco: cPreco >= 0 ? Number(String(l[cPreco]).replace(',', '.')) || 0 : 0,
        extra: cExtra.map((i) => String(l[i] ?? '').trim()).filter(Boolean),
      })
    })
    if (!lidas.length) return vazio('Encontrei o cabeçalho mas nenhuma linha com quantidades.')

    // juntar por referência; linhas "stock" somam ao stock da referência
    const porRef = new Map<string, { desc: string; cor: string; pre: number[]; stock: number[]; preco: number; linhas: number; extra: string[] }>()
    for (const l of lidas) {
      const e = porRef.get(l.ref) ?? { desc: l.desc, cor: '', pre: tamanhos.map(() => 0), stock: tamanhos.map(() => 0), preco: 0, linhas: 0, extra: [] }
      if (RE_STOCK.test(l.cor)) e.stock = e.stock.map((x, i) => x + l.q[i])
      else { e.pre = e.pre.map((x, i) => x + l.q[i]); e.cor = e.cor || l.cor; e.linhas++ }
      if (l.preco) e.preco = l.preco
      for (const x of l.extra) if (!e.extra.includes(x)) e.extra.push(x)
      porRef.set(l.ref, e)
    }

    // agrupar referências em modelos: mesmo código sem o último carácter (ex.: 8H260801JU1/JU2 → JU)
    const grupos = new Map<string, string[]>()
    for (const ref of porRef.keys()) {
      const k = ref.replace(/[0-9A-Z]$/i, '')
      grupos.set(k, [...(grupos.get(k) ?? []), ref])
    }
    const perguntas: PerguntaCliente[] = []
    const notasPorRef: Record<string, string[]> = {}
    const modelos: Modelo[] = []
    for (const refs of grupos.values()) {
      const descs = refs.map((r) => porRef.get(r)!.desc)
      const conhecido = nomesConhecidos.find((n) => descs[0].toUpperCase().startsWith(n.toUpperCase()))
      let nome = conhecido ?? (refs.length > 1 ? prefixoComum(descs) : '')
      if (!nome) nome = descs[0].split(/\s+/).slice(0, 2).join(' ')
      const variantes: Variante[] = refs.map((r) => {
        const e = porRef.get(r)!
        const resto = e.desc.slice(nome.length).trim() || e.cor || r
        const total = e.pre.map((x, i) => x + e.stock[i])
        for (const x of e.extra) {
          if (/\?\s*$/.test(x)) perguntas.push({ ref: r, texto: x })
          else (notasPorRef[r] ??= []).push(x)
        }
        return {
          id: slug(r), ref: r, nome: titulo(resto), refCor: (e.cor || resto).toUpperCase(), codigoLavagem: 'A definir',
          qtdEncomenda: total, qtd: [...total], preco: e.preco, fichaGerada: false, linhasOrigem: e.linhas > 1 ? e.linhas : undefined,
          qtdStock: e.stock.some(Boolean) ? e.stock : undefined,
        }
      })
      modelos.push({
        id: slug(nome), nome: titulo(nome), tipoPeca: /denim|jean|calç|pant/i.test(nome) ? 'Calças' : 'A definir', descricao: titulo(nome).toUpperCase(),
        escala: tamanhos, techPack: false, variantes, estado: 'sem-ficha', materiais: [], operacoes: [],
        observacoes: [], novasObservacoes: [], medidas: [], versoes: [], caixaMax: 20,
      })
    }
    const soma = (f: (v: Variante) => number[]) => modelos.flatMap((m) => m.variantes.flatMap(f)).reduce((a, b) => a + b, 0)
    const stock = soma((v) => v.qtdStock ?? [])
    return {
      ok: true, folha: nomeFolha, linhaCabecalho: iCab + 1, tamanhos, colunasExtra: cExtra.map((i) => cab[i]), modelos,
      stock, preEncomenda: soma((v) => v.qtdEncomenda) - stock, temPrecos: modelos.some((m) => m.variantes.some((v) => v.preco > 0)),
      linhasLidas: lidas.length, linhasComDiferenca: difs, perguntas, notasPorRef,
    }
  }
  return vazio('Não encontrei uma tabela com referência e colunas de tamanhos.')
}

/** Coleção a partir dos nomes dos ficheiros (ex.: DENIMFW26 → FW26). */
export const colecaoDosFicheiros = (nomes: string[]) => nomes.join(' ').match(/(SS|FW|AW|PE|AH)\s?(\d{2})/i)?.slice(1).join('').toUpperCase() ?? ''

export function encomendaDaLeitura(l: LeituraExcel, cliente: string, colecao: string, modo: Encomenda['modoServico'], ficheiros: string[]): Encomenda {
  let id = slug(`${cliente}-${colecao || 'encomenda'}`)
  id = `${id}-${Date.now().toString(36).slice(-4)}`
  return {
    id, cliente, colecao: colecao || '—', modoServico: modo, entrega: '', criadaEm: new Date().toISOString().slice(0, 10), estado: 'Em revisão',
    preEncomenda: l.preEncomenda, stock: l.stock, ficheiros, modelos: l.modelos,
    notas: [
      ...l.perguntas.map((p) => `Pergunta do cliente (${p.ref}): ${p.texto}`),
      ...Object.entries(l.notasPorRef).map(([ref, ns]) => `${ref}: ${ns.join(' · ')}`),
      ...(!l.temPrecos ? ['A encomenda não traz preços.'] : []),
      'Data de entrega: confirmar no email do cliente.',
    ],
    totaisDocumento: { pecas: l.preEncomenda + l.stock, valor: 0 },
  }
}
