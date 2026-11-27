import type { Encomenda, OrdemFabrico } from '../types'
import { idInternoEncomenda } from './calc'

/** Estados em que a ordem já saiu da produção (não contam como «em curso»). */
export const ESTADO_FECHADO = /^(16|17|18)\b|entregue|faturad/i
export const fechada = (o: OrdemFabrico) => ESTADO_FECHADO.test(o.estado)
/** Entrega que conta: a comunicada ao cliente, senão a prevista, senão a pedida. */
export const entregaDe = (o: OrdemFabrico) => o.dtEntregaReal || o.dtEntregaComunicada || o.dtEntregaPrev || o.dtEntregaSolic
export const atrasada = (o: OrdemFabrico, hoje: string) => !fechada(o) && !!entregaDe(o) && entregaDe(o) < hoje

/** O mesmo cliente escrito de outra forma («DR COLLECTORS» = «Dr. Collectors», «T'S IN THE BOX » = «T's in the box»). */
const letras = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const mesmoClienteOrdem = (a: string, b: string) => { const x = letras(a), y = letras(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }
const mesmoNumero = (o: OrdemFabrico, id: string) => !id.includes('???') && (o.numero === id || o.numero.startsWith(`${id}-`))

/** Encomenda da aplicação com o mesmo nº interno (E26-081, ou E26-087 para E26-087-1) e o mesmo cliente. */
export function encomendaDaOrdem(o: OrdemFabrico, encomendas: Encomenda[]) {
  return encomendas.find((e) => mesmoNumero(o, idInternoEncomenda(e)) && mesmoClienteOrdem(o.cliente, e.cliente))
}
export const ordensDaEncomenda = (e: Encomenda, ordens: OrdemFabrico[]) =>
  ordens.filter((o) => mesmoNumero(o, idInternoEncomenda(e)) && mesmoClienteOrdem(o.cliente, e.cliente))
/** Mesmo nº interno mas outro cliente: não se ligam (aviso na importação). */
export const numeroComOutroCliente = (o: OrdemFabrico, encomendas: Encomenda[]) =>
  encomendas.find((e) => mesmoNumero(o, idInternoEncomenda(e)) && !mesmoClienteOrdem(o.cliente, e.cliente))
