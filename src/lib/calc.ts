import type { ClienteCfg, Encomenda, LinhaCusto, LinhaMaterial, Modelo, PrecoHistorico, Variante, Empresa } from '../types'

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
export const totalMaterial = (l: LinhaMaterial, v: Variante) => (l.consumo == null || l.semConsumo ? null : l.consumo * totalVariante(v))

/** Quantidade de referência para o embalamento: confecionado (se já houver) ou encomenda. */
export const qtdConfecionada = (v: Variante) => v.qtdConfecionado ?? v.qtd
/** Quantidade a pôr nas caixas: embalado → confecionado → encomenda. */
export const qtdParaEmbalar = (v: Variante) => v.qtdEmbalado ?? v.qtdConfecionado ?? v.qtd

/** ID interno: E + ano (2 dígitos) + nº da encomenda + nº do modelo na encomenda. Ex.: E26-082-3 */
export function idInterno(e: Encomenda, m: Modelo) {
  const ano = (e.criadaEm || new Date().toISOString()).slice(2, 4)
  const n = e.numeroInterno != null ? String(e.numeroInterno).padStart(3, '0') : '???'
  return `E${ano}-${n}-${e.modelos.findIndex((x) => x.id === m.id) + 1}`
}
export const idInternoEncomenda = (e: Encomenda) => idInterno(e, e.modelos[0] ?? ({ id: '' } as Modelo)).replace(/-\d+$/, '')

// ---------------- Verificações ----------------
/** aviso = não impede a aprovação */
export interface Verificacao { ok: boolean; texto: string; detalhe?: string; aviso?: boolean }

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
  const zeros = m.materiais.filter((l) => !l.semConsumo && (l.consumo == null || (comQtd && l.consumo === 0)))
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
  if (!m.medidas.length) out.push({ ok: false, aviso: true, texto: 'Medidas por preencher (o tech pack não tem tabela)' })
  if (v.qtdConfecionado) {
    const abaixo = v.qtdConfecionado.some((q, i) => q < v.qtd[i])
    out.push({ ok: !abaixo, aviso: true, texto: abaixo ? 'Confecionado abaixo da encomenda nalgum tamanho' : `Confecionado: ${soma(v.qtdConfecionado)} peças` })
  }
  if (v.qtdEmbalado) {
    const ref = v.qtdConfecionado ?? v.qtd
    const mais = v.qtdEmbalado.some((q, i) => q > ref[i])
    out.push({ ok: !mais, aviso: true, texto: mais ? 'Embalado acima do confecionado nalgum tamanho' : `Embalado: ${soma(v.qtdEmbalado)} peças` })
  }
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
  const doc = e.totaisDocumento
  if (doc) {
    const pecas = pecasEncomenda(e)
    out.push({ ok: pecas === doc.pecas, texto: pecas === doc.pecas ? `Peças iguais ao documento (${doc.pecas})` : `Peças: ${pecas} lidas, ${doc.pecas} no documento` })
    if (doc.porTamanho) {
      const n = doc.porTamanho.length
      const lidas = doc.porTamanho.map((_, i) => soma(e.modelos.flatMap((m) => m.variantes.map((v) => v.qtdEncomenda[i] ?? 0))))
      const iguais = e.modelos.every((m) => m.escala.length >= n) && lidas.every((x, i) => x === doc.porTamanho![i])
      out.push({ ok: iguais, texto: iguais ? 'Totais por tamanho iguais ao documento' : 'Totais por tamanho diferentes do documento', detalhe: iguais ? undefined : `Lidos: ${lidas.join(' · ')}` })
    }
    const valor = Math.round(valorEncomenda(e) * 100) / 100
    if (doc.valor > 0) out.push({ ok: Math.abs(valor - doc.valor) < 0.005, texto: Math.abs(valor - doc.valor) < 0.005 ? 'Valor igual ao documento' : 'Valor diferente do documento' })
  }
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

export const EMPRESAS: Record<Empresa, { nome: string; papel: string }> = {
  PC: { nome: 'Pereira & Cruz', papel: 'corte e confeção' },
  PP: { nome: "Pereira's Project", papel: 'materiais, lavandaria, acabamento e entrega' },
  FORA: { nome: 'Confeção fora', papel: 'subcontratada' },
  CLIENTE: { nome: 'Cliente', papel: 'corte ou material dado pelo cliente' },
}
export const ROTULO_EMPRESA: Record<Empresa, string> = { PC: 'P&C', PP: 'PP', FORA: 'FORA', CLIENTE: 'CLIENTE' }
export const ORDEM_EMPRESAS: Empresa[] = ['PC', 'PP', 'FORA', 'CLIENTE']
/**
 * Empresa que assume cada linha: a escolhida na ficha; senão a escrita na descrição («Corte - Pereira & Cruz»);
 * senão a regra: corte, confeção e revista são da Pereira & Cruz (confeção «fora» é subcontratada), o resto
 * (materiais, lavandaria, acabamento, embalagem) da Pereira's Project.
 */
export function empresaDaLinha(l: Pick<LinhaCusto, 'descricao' | 'empresa'>): Empresa {
  if (l.empresa) return l.empresa
  const d = l.descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\bfora\b|subcontrat/.test(d)) return 'FORA'
  if (/pereira'?s\s*project/.test(d)) return 'PP'
  if (/pereira\s*(&|e)\s*cruz/.test(d)) return 'PC'
  return /^(corte|confec|controlo|revista|costura)/.test(d.trim()) ? 'PC' : 'PP'
}
export function totaisPorEmpresa(linhas: LinhaCusto[]): Record<Empresa, number> {
  const t: Record<Empresa, number> = { PC: 0, PP: 0, FORA: 0, CLIENTE: 0 }
  for (const l of linhas) t[empresaDaLinha(l)] += totalLinha(l)
  return t
}
/** Margem desejada sobre o custo (nem sempre possível: o preço final é sempre decidido pela Pereira & Cruz). */
export const MARGEM_OBJETIVO = 25
type OpcoesFicha = { margemFixa?: number; comissaoPct?: number; comissaoFixa?: number; comissaoSobreCusto?: boolean }
const arredondarCima = (v: number) => Math.ceil(v * 100 - 1e-9) / 100

/** Agente: € por peça, ou % sobre (custo + N/ comissão); nas fichas antigas, % só sobre o custo. */
function agente(base: number, custo: number, cfg?: ClienteCfg, ficha?: OpcoesFicha) {
  const fixa = ficha?.comissaoFixa ?? (ficha?.comissaoPct == null && cfg?.comissaoTipo === 'fixa' ? cfg.comissao : undefined)
  if (fixa != null) return { comissao: fixa, pct: 0, fixa }
  const pct = ficha?.comissaoPct ?? cfg?.comissao ?? 0
  return { comissao: ((ficha?.comissaoSobreCusto ? custo : base) * pct) / 100, pct, fixa: undefined as number | undefined }
}

/**
 * Ficha de custo. Duas formas de chegar ao preço:
 * - preço final fixado (decidido à mão): margem total = preço final − custo (− agente);
 * - calculado: custo + N/ comissão do cliente (fixa ou %) + agente (% sobre custo + N/ comissão, ou € por peça).
 * margemPct é sempre sobre o custo (como os 20 % e o objetivo de 25 %).
 */
export function calcularCusto(linhas: LinhaCusto[], cfg?: ClienteCfg, precoFinal?: number, ficha?: OpcoesFicha) {
  const total = soma(linhas.map(totalLinha))
  const nMargem = ficha?.margemFixa ?? (!cfg ? 0 : cfg.margemTipo === 'fixa' ? cfg.margem : (total * cfg.margem) / 100)
  const ag = agente(total + nMargem, total, cfg, ficha)
  const valorTotal = total + nMargem + ag.comissao
  const pctCusto = (m: number) => (total ? (m / total) * 100 : 0)
  if (precoFinal != null) {
    const margem = precoFinal - total - ag.comissao
    return { total, margem, comissao: ag.comissao, final: precoFinal, margemPct: pctCusto(margem), fixado: true, nMargem, pct: ag.pct, agenteFixo: ag.fixa, valorTotal, ajuste: precoFinal - valorTotal }
  }
  return { total, margem: nMargem, comissao: ag.comissao, final: valorTotal, margemPct: pctCusto(nMargem), fixado: false, nMargem, pct: ag.pct, agenteFixo: ag.fixa, valorTotal, ajuste: 0 }
}

/** Preços sugeridos (arredondados ao cêntimo para cima): a regra do cliente e o objetivo de 25 % sobre o custo. */
export function precosSugeridos(linhas: LinhaCusto[], cfg?: ClienteCfg, ficha?: OpcoesFicha) {
  const c = calcularCusto(linhas, cfg, undefined, ficha)
  const nObjetivo = (c.total * MARGEM_OBJETIVO) / 100
  const objetivo = c.total + nObjetivo + agente(c.total + nObjetivo, c.total, cfg, ficha).comissao
  return { regra: arredondarCima(c.valorTotal), objetivo: arredondarCima(objetivo), custo: c.total }
}

/** Lê «3/32», «0,46+0,08», «140.8/1000» ou «1,2» (só números e + − × ÷). */
export function avaliarExpr(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(/,/g, '.').replace(/^=/, '').replace(/[x×]/g, '*').replace(/÷/g, '/')
  if (!t || !/^[\d.+\-*/()]+$/.test(t)) return null
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict"; return (${t})`)() as number
    return Number.isFinite(v) ? v : null
  } catch { return null }
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
