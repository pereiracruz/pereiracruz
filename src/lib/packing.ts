import type { Encomenda, Envio } from '../types'
import { packingList, soma } from './calc'

export interface BlocoPacking {
  chave: string; modeloId: string; varianteId: string
  titulo: string; tamanhos: string[]; caixaMax: number
  origem: 'embalado' | 'confecionado' | 'encomenda'
  caixas: { numero: number; qtd: number[]; total: number; peso?: number }[]
  totalPorTamanho: number[]; total: number; temPeso: boolean; peso: number
}

/** Calcula as caixas de um envio; a numeração continua de referência para referência. */
export function calcularEnvio(enc: Encomenda, envio: Envio): BlocoPacking[] {
  let n = 0
  const out: BlocoPacking[] = []
  for (const it of envio.itens) {
    const m = enc.modelos.find((x) => x.id === it.modeloId)
    const v = m?.variantes.find((x) => x.id === it.varianteId)
    if (!m || !v) continue
    const origem = v.qtdEmbalado ? 'embalado' : v.qtdConfecionado ? 'confecionado' : 'encomenda'
    const qtd = v.qtdEmbalado ?? v.qtdConfecionado ?? v.qtd
    const temPeso = m.pesoPeca != null && m.pesoPeca > 0
    const caixas = packingList(qtd, m.caixaMax).map((c) => {
      const total = soma(c)
      return { numero: ++n, qtd: c, total, peso: temPeso ? Math.round(total * m.pesoPeca! * 10) / 10 : undefined }
    })
    out.push({
      chave: it.modeloId + it.varianteId, modeloId: m.id, varianteId: v.id,
      titulo: `${m.nome} ${v.nome}`.toUpperCase(), tamanhos: m.escala.slice(0, qtd.length), caixaMax: m.caixaMax, origem,
      caixas, totalPorTamanho: qtd, total: soma(qtd), temPeso, peso: soma(caixas.map((c) => c.peso ?? 0)),
    })
  }
  return out
}
