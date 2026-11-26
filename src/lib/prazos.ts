import type { Encomenda, Etapa, Prazo } from '../types'
import { hojeISO } from './format'
import { resumoCompras } from './compras'

/**
 * Etapas de uma encomenda até à entrega. Quem trata: materiais e lavandaria/expedição pela Pereira's Project,
 * corte e confeção pela Pereira & Cruz, lavandaria na Clothius, embalamento pelo Paulo e pela Marta.
 * Dias antes da entrega usados no planeamento automático (editáveis em cada encomenda).
 */
export const ETAPAS: { etapa: Etapa; quem: string; diasAntes: number }[] = [
  { etapa: 'Materiais', quem: "Pereira's Project", diasAntes: 35 },
  { etapa: 'Corte', quem: 'Pereira & Cruz', diasAntes: 28 },
  { etapa: 'Confeção', quem: 'Pereira & Cruz', diasAntes: 18 },
  { etapa: 'Lavandaria', quem: 'Clothius', diasAntes: 10 },
  { etapa: 'Embalamento', quem: 'Paulo e Marta', diasAntes: 3 },
  { etapa: 'Expedição', quem: "Pereira's Project", diasAntes: 0 },
]

const dia = 864e5
export const somarDias = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00`).getTime() + n * dia).toISOString().slice(0, 10)
export const diasAte = (iso: string, hoje = hojeISO()) => Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${hoje}T12:00:00`).getTime()) / dia)

export const prazoDe = (e: Encomenda, etapa: Etapa): Prazo => e.prazos?.find((p) => p.etapa === etapa) ?? { etapa }

/** Preenche as datas em falta a contar da entrega (não mexe nas que já existem). */
export function planear(e: Encomenda): Prazo[] {
  return ETAPAS.map(({ etapa, diasAntes }) => {
    const p = prazoDe(e, etapa)
    return p.data || !e.entrega ? p : { ...p, data: somarDias(e.entrega, -diasAntes) }
  })
}

export type NivelPrazo = 'atrasada' | 'urgente' | 'ok' | 'sem-data' | 'concluida'
export interface SituacaoPrazos {
  nivel: NivelPrazo
  diasEntrega: number | null
  proxima?: { etapa: Etapa; data?: string; dias: number | null }
  atrasadas: { etapa: Etapa; data: string; dias: number }[]
  alertas: string[]
}

export function situacaoPrazos(e: Encomenda, hoje = hojeISO()): SituacaoPrazos {
  if (e.estado === 'Concluída' || prazoDe(e, 'Expedição').feito) return { nivel: 'concluida', diasEntrega: null, atrasadas: [], alertas: [] }
  const diasEntrega = e.entrega ? diasAte(e.entrega, hoje) : null
  const atrasadas = ETAPAS.map(({ etapa }) => prazoDe(e, etapa)).filter((p) => p.data && !p.feito && p.data < hoje).map((p) => ({ etapa: p.etapa, data: p.data!, dias: -diasAte(p.data!, hoje) }))
  const prox = ETAPAS.map(({ etapa }) => prazoDe(e, etapa)).find((p) => !p.feito)
  const alertas: string[] = []
  if (diasEntrega != null && diasEntrega < 0) alertas.push(`Entrega atrasada ${-diasEntrega} dia(s)`)
  else if (diasEntrega != null && diasEntrega <= 7) alertas.push(diasEntrega === 0 ? 'Entrega hoje' : `Entrega daqui a ${diasEntrega} dia(s)`)
  for (const a of atrasadas) alertas.push(`${a.etapa} atrasada ${a.dias} dia(s)`)
  const corte = prazoDe(e, 'Corte')
  if (corte.data && !corte.feito && diasAte(corte.data, hoje) <= 7) {
    const r = resumoCompras(e)
    if (r.porReceber) alertas.push(`${r.porReceber} material(is) por receber e o corte é ${diasAte(corte.data, hoje) < 0 ? 'já passou' : `daqui a ${diasAte(corte.data, hoje)} dia(s)`}`)
  }
  const nivel: NivelPrazo = !e.entrega ? 'sem-data' : (diasEntrega! < 0 || atrasadas.length) ? 'atrasada' : (diasEntrega! <= 7 || alertas.length) ? 'urgente' : 'ok'
  return { nivel, diasEntrega, proxima: prox && { etapa: prox.etapa, data: prox.data, dias: prox.data ? diasAte(prox.data, hoje) : null }, atrasadas, alertas }
}
