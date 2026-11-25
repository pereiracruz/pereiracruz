import type { ClienteCfg, Encomenda, LinhaCusto, LinhaMaterial, Modelo, PrecoHistorico, Variante } from '../types'

export const soma = (a: number[]) => a.reduce((s, x) => s + x, 0)

/** Reparte um total por pesos, em inteiros que somam exatamente o total. */
export function distribuir(total: number, pesos: number[]): number[] {
  const ps = soma(pesos)
  const exatos = pesos.map((p) => (total * p) / ps)
  const base = exatos.map(Math.floor)
  let resto = total - soma(base)
  const ordem = exatos.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of ordem) { if (resto <= 0) break; base[i]++; resto-- }
  return base
}

export const totalVariante = (v: Variante) => soma(v.qtd)
export const totalEncVariante = (v: Variante) => soma(v.qtdEncomenda)
export const pecasModelo = (m: Modelo) => soma(m.variantes.map(totalEncVariante))
export const pecasEncomenda = (e: Encomenda) => soma(e.modelos.map(pecasModelo))
export const referenciasEncomenda = (e: Encomenda) => soma(e.modelos.map((m) => m.variantes.length))
export const valorEncomenda = (e: Encomenda) =>
  soma(e.modelos.flatMap((m) => m.variantes.map((v) => totalEncVariante(v) * v.preco)))
export const fichasGeradas = (e: Encomenda) => soma(e.modelos.map((m) => m.variantes.filter((v) => v.fichaGerada).length))
export const fichasPorAprovar = (e: Encomenda) =>
  soma(e.modelos.filter((m) => m.estado === 'rascunho').map((m) => m.variantes.filter((v) => v.fichaGerada).length))

/** Total de material de uma linha para uma variante: consumo × peças (sempre por fórmula). */
export const totalMaterial = (l: LinhaMaterial, v: Variante) => (l.consumo == null ? null : l.consumo * totalVariante(v))

// ---------------- Verificações ----------------
export interface Verificacao { ok: boolean; texto: string; detalhe?: string }

export function verificarFicha(m: Modelo, v: Variante): Verificacao[] {
  const out: Verificacao[] = []
  const iguais = v.qtd.every((q, i) => q === v.qtdEncomenda[i])
  out.push({
    ok: iguais,
    texto: iguais ? `Quantidades iguais à encomenda (${totalEncVariante(v)})` : 'Quantidades diferentes da encomenda',
    detalhe: iguais ? undefined : `Encomenda: ${v.qtdEncomenda.join(' · ')} — ficha: ${v.qtd.join(' · ')}`,
  })
  out.push({ ok: true, texto: 'Modelo e variante iguais em todas as folhas' })
  const comQtd = totalVariante(v) > 0
  const zeros = m.materiais.filter((l) => l.consumo == null || (comQtd && l.consumo === 0))
  out.push({
    ok: zeros.length === 0,
    texto: zeros.length === 0 ? 'Totais calculados, nenhum a zero' : `${zeros.length} ${zeros.length === 1 ? 'material sem consumo' : 'materiais sem consumo'}`,
    detalhe: zeros.map((z) => z.ref).join(', ') || undefined,
  })
  const semJust = m.materiais.filter((l) => l.divergencia && !l.justificacao?.trim())
  const comDiv = m.materiais.filter((l) => l.divergencia)
  out.push({
    ok: semJust.length === 0,
    texto: semJust.length
      ? `${semJust.length} divergência(s) do tech pack sem justificação`
      : comDiv.length ? 'Divergências do tech pack justificadas' : 'Materiais iguais ao tech pack',
    detalhe: semJust.map((l) => l.ref).join(', ') || undefined,
  })
  if (!m.medidas.length) out.push({ ok: false, texto: 'Medidas por preencher (o tech pack não tem tabela)' })
  return out
}

/** Verificações ao nível da encomenda: soma por cor vs total por tamanho, variantes sem ficha. */
export function verificarEncomenda(e: Encomenda): Verificacao[] {
  const out: Verificacao[] = []
  const semFicha = e.modelos.flatMap((m) => m.variantes.filter((v) => !v.fichaGerada).map((v) => `${m.nome} · ${v.nome}`))
  out.push({
    ok: semFicha.length === 0,
    texto: semFicha.length ? `${semFicha.length} variantes sem ficha` : 'Todas as variantes têm ficha',
  })
  const difs = e.modelos.filter((m) => m.variantes.some((v) => v.fichaGerada && v.qtd.some((q, i) => q !== v.qtdEncomenda[i])))
  out.push({
    ok: difs.length === 0,
    texto: difs.length ? `Soma por cor diferente do total por tamanho em ${difs.map((m) => m.nome).join(', ')}` : 'Soma por cor igual ao total por tamanho',
  })
  return out
}

// ---------------- Packing list ----------------
/** Enche caixas de no máximo `max` peças, tamanho a tamanho. */
export function packingList(qtd: number[], max: number): number[][] {
  const caixas: number[][] = []
  let atual = qtd.map(() => 0)
  let ocup = 0
  qtd.forEach((q, i) => {
    let r = q
    while (r > 0) {
      const cabe = Math.min(r, max - ocup)
      atual[i] += cabe; ocup += cabe; r -= cabe
      if (ocup === max) { caixas.push(atual); atual = qtd.map(() => 0); ocup = 0 }
    }
  })
  if (ocup > 0) caixas.push(atual)
  return caixas
}

// ---------------- Ficha de custo ----------------
export const totalLinha = (l: LinhaCusto) => l.consumo * l.valor
export function calcularCusto(linhas: LinhaCusto[], cfg?: ClienteCfg) {
  const total = soma(linhas.map(totalLinha))
  const margem = !cfg ? 0 : cfg.margemTipo === 'fixa' ? cfg.margem : (total * cfg.margem) / 100
  const comissao = cfg ? (total * cfg.comissao) / 100 : 0
  const final = total + margem + comissao
  return { total, margem, comissao, final }
}

// ---------------- Peças parecidas ----------------
export interface Parecida { h: PrecoHistorico; score: number; motivos: string[] }
export function pecasParecidas(
  alvo: { cliente: string; tipoPeca: string; tecido: string; tratamento: string; peca: string },
  hist: PrecoHistorico[],
): Parecida[] {
  const norm = (s: string) => s.toLowerCase().trim()
  return hist
    .map((h) => {
      const motivos: string[] = []
      let score = 0
      if (norm(h.tipoPeca) === norm(alvo.tipoPeca)) { score += 2; motivos.push('tipo de peça') }
      if (norm(h.cliente) === norm(alvo.cliente)) { score += 1; motivos.push('cliente') }
      if (norm(h.tecido) === norm(alvo.tecido)) { score += 1; motivos.push('tecido') }
      if (norm(h.tratamento) === norm(alvo.tratamento)) { score += 1; motivos.push('tratamento') }
      if (norm(h.peca).includes(norm(alvo.peca).split(' ')[0])) { score += 1; motivos.push('mesma peça') }
      return { h, score, motivos }
    })
    .filter((p) => p.score >= 3 && p.motivos.includes('tipo de peça'))
    .sort((a, b) => b.score - a.score)
}

export const MIN_CASOS_INTERVALO = 2

export function propostaIntervalo(precoCalculado: number, parecidas: Parecida[]) {
  if (parecidas.length < MIN_CASOS_INTERVALO) return null
  const precos = [precoCalculado, ...parecidas.slice(0, 5).map((p) => p.h.preco)]
  return { min: Math.min(...precos), max: Math.max(...precos), base: parecidas.slice(0, 5) }
}
