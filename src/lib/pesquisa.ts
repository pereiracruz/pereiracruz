import type { Encomenda, Pedido } from '../types'
import { idInterno, idInternoEncomenda } from './calc'

export type TipoResultado = 'encomenda' | 'modelo' | 'pedido'
export interface Resultado {
  tipo: TipoResultado
  chave: string
  titulo: string
  detalhe: string
  /** o que coincidiu, quando não está no título (ex.: «Ref. 7E27JANETAW») */
  onde?: string
  para: string
  pontos: number
}

/** minúsculas, sem acentos */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** só letras e números: «E26-082» = «e26 082» = «E26082» */
const compacto = (s: string) => norm(s).replace(/[^a-z0-9]/g, '')

interface Campo { rotulo: string; valor: string | undefined | null; peso: number }

/** Pontua um conjunto de campos para a pesquisa. 0 = não coincide. */
function pontuar(q: string, campos: Campo[]): { pontos: number; onde?: Campo } {
  const palavras = norm(q).split(/\s+/).filter(Boolean)
  const qc = compacto(q)
  if (!palavras.length || !qc) return { pontos: 0 }
  const validos = campos.filter((c) => c.valor)
  const tudo = norm(validos.map((c) => c.valor).join(' '))
  // todas as palavras têm de aparecer (em qualquer campo), ou o código inteiro sem separadores
  const porPalavras = palavras.every((p) => tudo.includes(p))
  const porCodigo = qc.length >= 3 && validos.some((c) => compacto(c.valor!).includes(qc))
  if (!porPalavras && !porCodigo) return { pontos: 0 }
  let pontos = 1, onde: Campo | undefined
  for (const c of validos) {
    const v = norm(c.valor!), vc = compacto(c.valor!)
    let p = 0
    if (vc === qc) p = 100
    else if (palavras.length === 1 && v.split(/[^a-z0-9]+/).includes(palavras[0].replace(/[^a-z0-9]/g, ''))) p = 70 // palavra inteira («dr» em «Dr. Collectors»)
    else if (vc.startsWith(qc)) p = 50
    else if (vc.includes(qc) || v.includes(norm(q).trim())) p = 30
    else if (palavras.some((w) => v.includes(w))) p = 5
    p *= c.peso
    if (p > pontos) { pontos = p; onde = c }
  }
  return { pontos, onde }
}

const NOMES_TIPO: Record<TipoResultado, string> = { encomenda: 'Encomendas', modelo: 'Modelos', pedido: 'Pedidos de orçamento' }
export const nomeTipo = (t: TipoResultado) => NOMES_TIPO[t]

/** Procura em encomendas (nº interno, documento, cliente, coleção), modelos (nome, referências, OF, variantes) e pedidos. */
export function pesquisar(q: string, encomendas: Encomenda[], pedidos: Pedido[], limitePorTipo = 8): Resultado[] {
  if (compacto(q).length < 2) return []
  const res: Resultado[] = []

  for (const e of encomendas) {
    const codigo = idInternoEncomenda(e)
    const r = pontuar(q, [
      { rotulo: 'Nº interno', valor: codigo, peso: 1.2 },
      { rotulo: 'Nº do documento', valor: e.numeroDocumento, peso: 1.2 },
      { rotulo: 'Cliente', valor: e.cliente, peso: 1 },
      { rotulo: 'Coleção', valor: e.colecao, peso: 1 },
    ])
    if (r.pontos) {
      res.push({
        tipo: 'encomenda', chave: `e/${e.id}`, para: `/fichas/${e.id}`, pontos: r.pontos,
        titulo: `${e.cliente} · ${e.colecao}`,
        detalhe: [codigo, e.numeroDocumento && `doc. ${e.numeroDocumento}`, e.estado].filter(Boolean).join(' · '),
      })
    }

    for (const m of e.modelos) {
      const campos: Campo[] = [
        { rotulo: 'ID interno', valor: idInterno(e, m), peso: 1.2 },
        { rotulo: 'Modelo', valor: m.nome, peso: 1.1 },
        { rotulo: 'Nome', valor: m.alias, peso: 1.1 },
        { rotulo: 'Ref. do cliente', valor: m.refCliente, peso: 1.2 },
        { rotulo: 'Linha da encomenda', valor: m.linhaEncomenda, peso: 0.8 },
        { rotulo: 'OF', valor: m.of?.ficheiro.replace(/\.pdf$/i, ''), peso: 1.1 },
        { rotulo: 'Tipo de peça', valor: m.tipoPeca, peso: 0.6 },
        { rotulo: 'Descrição', valor: m.descricao, peso: 0.6 },
        { rotulo: 'Tecido', valor: m.tecido, peso: 0.5 },
        ...m.variantes.flatMap((v): Campo[] => [
          { rotulo: 'Ref.', valor: v.ref, peso: 1.2 },
          { rotulo: 'Variante', valor: v.nome, peso: 0.7 },
          { rotulo: 'Cor', valor: v.refCor, peso: 0.7 },
          { rotulo: 'Lavagem', valor: v.codigoLavagem, peso: 0.7 },
        ]),
        // o cliente e a coleção ajudam a juntar palavras («imprevu mao»), mas valem pouco sozinhos
        { rotulo: 'Cliente', valor: e.cliente, peso: 0.3 },
        { rotulo: 'Coleção', valor: e.colecao, peso: 0.3 },
      ]
      const r2 = pontuar(q, campos)
      if (!r2.pontos) continue
      const mostrado = [m.nome, m.alias, idInterno(e, m), e.cliente, e.colecao]
      res.push({
        tipo: 'modelo', chave: `m/${e.id}/${m.id}`, para: `/fichas/${e.id}/${m.id}`, pontos: r2.pontos,
        titulo: m.alias && m.alias !== m.nome ? `${m.nome} · ${m.alias}` : m.nome,
        detalhe: [idInterno(e, m), e.cliente, e.colecao].join(' · '),
        onde: r2.onde && !mostrado.includes(r2.onde.valor ?? '') ? `${r2.onde.rotulo} ${r2.onde.valor}` : undefined,
      })
    }
  }

  for (const p of pedidos) {
    const r = pontuar(q, [
      { rotulo: 'Referência', valor: p.referencia, peso: 1.2 },
      { rotulo: 'Peça', valor: p.peca, peso: 1 },
      { rotulo: 'Variante', valor: p.variante, peso: 0.7 },
      { rotulo: 'Cliente', valor: p.cliente, peso: 0.8 },
      { rotulo: 'Tipo de peça', valor: p.tipoPeca, peso: 0.5 },
      { rotulo: 'Tecido', valor: p.tecido, peso: 0.5 },
    ])
    if (!r.pontos) continue
    res.push({
      tipo: 'pedido', chave: `p/${p.id}`, para: `/orcamentos/${p.id}`, pontos: r.pontos,
      titulo: [p.peca, p.variante].filter(Boolean).join(' · ') || 'Pedido sem nome',
      detalhe: [p.referencia, p.cliente, p.estado].filter(Boolean).join(' · '),
    })
  }

  // grupos ordenados pelo melhor resultado (procurar uma referência mostra primeiro os modelos)
  const grupos = (['encomenda', 'modelo', 'pedido'] as TipoResultado[])
    .map((t) => res.filter((r) => r.tipo === t).sort((a, b) => b.pontos - a.pontos).slice(0, limitePorTipo))
    .filter((g) => g.length)
    .sort((a, b) => b[0].pontos - a[0].pontos)
  return grupos.flat()
}
