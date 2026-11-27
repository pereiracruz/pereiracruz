import { encomendaImprevu, encomendasIniciais, historicoInicial, pedidosIniciais } from '../data/seed'
import type { Encomenda, Pedido, PrecoHistorico } from '../types'

/**
 * Dados de exemplo carregados no primeiro arranque (e a encomenda criada com «Usar o exemplo da Imprevu»).
 * Identificam-se pelo id: os dados mestre (clientes, tecidos, tabelas da Clothius…) não entram.
 */
export const IDS_EXEMPLO = {
  encomendas: new Set([...encomendasIniciais().map((e) => e.id), encomendaImprevu().id]),
  pedidos: new Set(pedidosIniciais().map((p) => p.id)),
  historico: new Set(historicoInicial().map((h) => h.id)),
}
export type GrupoExemplo = keyof typeof IDS_EXEMPLO

export function dadosExemplo(s: { encomendas: Encomenda[]; pedidos: Pedido[]; historico: PrecoHistorico[] }) {
  return {
    encomendas: s.encomendas.filter((e) => IDS_EXEMPLO.encomendas.has(e.id)),
    pedidos: s.pedidos.filter((p) => IDS_EXEMPLO.pedidos.has(p.id)),
    historico: s.historico.filter((h) => IDS_EXEMPLO.historico.has(h.id)),
  }
}
