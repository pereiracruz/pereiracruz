import * as XLSX from 'xlsx'
import type { Encomenda, EstadoCompra, EstadoCompraTipo } from '../types'
import { soma } from './calc'
import { dataCurta, slug } from './format'

/**
 * Compras de uma encomenda (feitas pela Pereira's Project): materiais das fichas × peças de cada variante,
 * juntos por fornecedor, material, cor e unidade. «Conforme variante» parte a cor por variante.
 */
export interface LinhaCompra {
  chave: string
  fornecedor: string
  ref: string
  cor: string
  unidade: 'm' | 'un'
  tipo: 'Tecido' | 'Acessório' | 'Embalagem'
  pecas: number
  qtd: number | null // consumo × peças (null = consumo a confirmar ou sem consumo)
  qtdComprar: number | null // com a margem de quebra, arredondado para cima
  modelos: string[]
  daCliente: boolean // enviado pela cliente: não se compra, só se confirma a receção
  aConfirmar: boolean // há modelos com consumo por confirmar
  semConsumo: boolean // ex.: linha (só cor e fornecedor)
}

export const MARGEM_COMPRAS = { tecido: 5, acessorios: 5 }
export const ESTADOS_COMPRA: EstadoCompraTipo[] = ['Por encomendar', 'Encomendado', 'Recebido']

const daCliente = (f: string) => /cliente/i.test(f)

export function necessidadesCompra(e: Encomenda): LinhaCompra[] {
  const margem = e.margemCompras ?? MARGEM_COMPRAS
  const mapa = new Map<string, LinhaCompra>()
  for (const m of e.modelos) {
    for (const mat of m.materiais) {
      const porCor = /conforme variante/i.test(mat.cor)
        ? m.variantes.map((v) => ({ cor: v.refCor || v.nome, pecas: soma(v.qtd) }))
        : [{ cor: mat.cor || '—', pecas: soma(m.variantes.map((v) => soma(v.qtd))) }]
      for (const { cor, pecas } of porCor) {
        if (!pecas) continue
        const chave = slug(`${mat.fornecedor}|${mat.ref}|${cor}|${mat.unidade}`)
        const tipo = mat.folha === 'tecido' ? 'Tecido' : mat.folha === 'embalamento' ? 'Embalagem' : 'Acessório'
        const l = mapa.get(chave) ?? { chave, fornecedor: mat.fornecedor || 'A confirmar', ref: mat.ref, cor, unidade: mat.unidade, tipo, pecas: 0, qtd: 0, qtdComprar: 0, modelos: [], daCliente: daCliente(mat.fornecedor), aConfirmar: false, semConsumo: false } as LinhaCompra
        l.pecas += pecas
        if (!l.modelos.includes(m.nome)) l.modelos.push(m.nome)
        if (mat.semConsumo) l.semConsumo = true
        else if (mat.consumo == null) l.aConfirmar = true
        else l.qtd = (l.qtd ?? 0) + mat.consumo * pecas
        mapa.set(chave, l)
      }
    }
  }
  return [...mapa.values()].map((l) => {
    const qtd = l.semConsumo || (l.aConfirmar && !l.qtd) ? null : l.qtd
    const pct = l.tipo === 'Tecido' ? margem.tecido : margem.acessorios
    const comprar = qtd == null ? null : l.unidade === 'm' ? Math.ceil(qtd * (1 + pct / 100)) : Math.ceil(qtd * (1 + pct / 100) - 1e-9)
    return { ...l, qtd, qtdComprar: l.daCliente ? (qtd == null ? null : Math.ceil(qtd)) : comprar }
  }).sort((a, b) => Number(a.daCliente) - Number(b.daCliente) || a.fornecedor.localeCompare(b.fornecedor, 'pt') || a.tipo.localeCompare(b.tipo) || a.ref.localeCompare(b.ref, 'pt'))
}

export const estadoDe = (e: Encomenda, chave: string): EstadoCompra => e.compras?.find((c) => c.chave === chave) ?? { chave, estado: 'Por encomendar' }

/** Resumo para alertas e para a lista global. */
export function resumoCompras(e: Encomenda) {
  const linhas = necessidadesCompra(e)
  const porReceber = linhas.filter((l) => estadoDe(e, l.chave).estado !== 'Recebido')
  return { linhas, porReceber: porReceber.length, porEncomendar: linhas.filter((l) => !l.daCliente && estadoDe(e, l.chave).estado === 'Por encomendar').length, semFicha: e.modelos.filter((m) => !m.materiais.length).length }
}

const qtdTexto = (l: LinhaCompra) => l.semConsumo ? 'conforme a encomenda' : l.qtdComprar == null ? 'consumo a confirmar' : `${l.qtdComprar} ${l.unidade === 'm' ? 'm' : 'un.'}`

/** Texto para mandar a um fornecedor (email ou WhatsApp). */
export function textoFornecedor(e: Encomenda, fornecedor: string, linhas: LinhaCompra[]) {
  const ls = linhas.filter((l) => l.fornecedor === fornecedor && !l.daCliente)
  return [`Olá,`, '', `Para a encomenda ${e.cliente} · ${e.colecao}${e.entrega ? ` (entrega ${dataCurta(e.entrega)})` : ''}, precisamos de:`, '',
    ...ls.map((l) => `- ${l.ref}${l.cor && l.cor !== '—' && l.cor !== 'N/A' ? ` · cor ${l.cor}` : ''}: ${qtdTexto(l)}`), '', 'Obrigado,', "Pereira's Project"].join('\n')
}

export function exportarCompras(e: Encomenda) {
  const linhas = necessidadesCompra(e)
  const cab = ['Fornecedor', 'Tipo', 'Material', 'Cor', 'Peças', 'Necessário', 'A comprar', 'Unidade', 'Modelos', 'Estado', 'Data', 'Nota']
  const dados = linhas.map((l) => {
    const est = estadoDe(e, l.chave)
    return [l.daCliente ? `${l.fornecedor} (da cliente)` : l.fornecedor, l.tipo, l.ref, l.cor, l.pecas,
      l.qtd == null ? (l.semConsumo ? 'conforme a encomenda' : 'a confirmar') : Math.round(l.qtd * 100) / 100,
      l.qtdComprar ?? '', l.unidade === 'm' ? 'm' : 'un.', l.modelos.join(', '), est.estado, est.data ? dataCurta(est.data) : '', est.nota ?? '']
  })
  const ws = XLSX.utils.aoa_to_sheet([[`Compras · ${e.cliente} · ${e.colecao}`], [`Entrega: ${dataCurta(e.entrega)} · margem de quebra: tecido ${(e.margemCompras ?? MARGEM_COMPRAS).tecido} %, acessórios ${(e.margemCompras ?? MARGEM_COMPRAS).acessorios} %`], [], cab, ...dados])
  ws['!cols'] = [22, 11, 34, 22, 8, 12, 10, 8, 30, 14, 11, 30].map((w) => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Compras')
  const nome = `Compras_${slug(e.cliente)}_${slug(e.colecao)}.xlsx`
  XLSX.writeFile(wb, nome)
  return nome
}
