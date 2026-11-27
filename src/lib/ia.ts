import { supabase } from './supabase'
import { slug } from './format'
import type { LeituraExcel } from './lerEncomendaExcel'
import type { Modelo, Variante } from '../types'

// ---------- Tipos devolvidos pela função «ler-documento» (ver supabase/functions/ler-documento/esquemas.ts) ----------
export type Confianca = 'alta' | 'media' | 'baixa'
export interface EncomendaLida {
  cliente: string | null; numeroDocumento: string | null; dataDocumento: string | null; dataEntrega: string | null
  tamanhos: string[]
  linhas: { linhaEncomenda: string | null; referencia: string; descricao: string; cor: string; quantidades: number[]; total: number | null; preco: number | null; pagina: number; confianca: Confianca }[]
  totaisDocumento: { pecas: number | null; valor: number | null; porTamanho: number[] | null }
  notas: string[]; perguntas: string[]
}
export interface MaterialLido { descricao: string; fornecedor: string | null; consumo: number | null; unidade: string | null; cor: string | null; observacoes: string | null; pagina: number; confianca: Confianca }
export interface TechPackLido {
  marca: string | null; colecao: string | null
  modelos: {
    referencia: string; nome: string; tipoPeca: string | null; paginas: number[]; composicao: string | null; tamanhos: string[]
    campos: { campo: string; valor: string; pagina: number; confianca: Confianca }[]
    tecidos: MaterialLido[]; acessorios: MaterialLido[]
    bordadosEstampados: { tipo: 'Bordado' | 'Estampado'; posicao: string; medidas: string | null; cor: string | null; fornecedor: string | null; pagina: number; confianca: Confianca }[]
    medidas: { tamanhoBase: string | null; pontos: { ponto: string; valores: (number | null)[] }[] } | null
    pedidos: string[]; observacoes: string[]
  }[]
}
export interface ExtratoLido {
  banco: string | null; conta: string | null; titular: string | null; dataInicio: string | null; dataFim: string | null
  saldoInicial: number | null; saldoFinal: number | null
  movimentos: { data: string; descricao: string; valor: number; saldo: number | null; pagina: number; confianca: Confianca }[]
}
export interface ResultadoIA<T> { dados: T; caminho: string; uso: { entrada: number; saida: number }; modelo: string }

/** Guarda o ficheiro no Supabase (bucket privado «documentos») e pede a leitura à IA (processamento na UE). */
export async function lerComIA<T>(ficheiro: File, tipo: 'encomenda' | 'techpack' | 'extrato' | 'fatura' | 'producao', contexto?: string): Promise<ResultadoIA<T>> {
  if (!supabase) throw new Error('A leitura com IA precisa do servidor (Supabase).')
  const { data: sessao } = await supabase.auth.getUser()
  const ponto = ficheiro.name.lastIndexOf('.')
  const nome = ponto > 0 ? `${slug(ficheiro.name.slice(0, ponto))}${ficheiro.name.slice(ponto).toLowerCase()}` : slug(ficheiro.name)
  const caminho = `${sessao.user?.id ?? 'anon'}/${new Date().toISOString().slice(0, 10)}/${Date.now().toString(36)}-${nome}`
  const { error: eUp } = await supabase.storage.from('documentos').upload(caminho, ficheiro, { contentType: ficheiro.type || undefined })
  if (eUp) throw new Error(`Não foi possível guardar o ficheiro: ${eUp.message}`)

  const { data, error } = await supabase.functions.invoke('ler-documento', { body: { caminho, tipo, contexto } })
  if (error) {
    // a função devolve { erro } com o motivo; o supabase-js expõe a resposta em error.context
    let motivo = error.message
    try { const corpo = await (error as { context?: Response }).context?.json(); if (corpo?.erro) motivo = corpo.erro } catch { /* sem corpo */ }
    throw new Error(motivo)
  }
  if (!data?.ok) throw new Error(data?.erro ?? 'A leitura falhou.')
  return { dados: data.dados as T, caminho, uso: data.uso, modelo: data.modelo }
}

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s|-)\S/g, (c) => c.toUpperCase())

/**
 * Converte a leitura da IA de uma encomenda em PDF para a mesma estrutura da leitura de Excel:
 * uma referência = um modelo; cada cor = uma variante; a mesma cor em várias linhas junta-se.
 */
export function leituraDaIA(d: EncomendaLida, nomeFicheiro: string): LeituraExcel {
  const tam = d.tamanhos
  const porRef = new Map<string, { linha: string | null; descricao: string; cores: Map<string, { q: number[]; preco: number; linhas: number }> }>()
  const difs: LeituraExcel['linhasComDiferenca'] = []
  d.linhas.forEach((l, i) => {
    const q = tam.map((_, k) => Math.max(0, Math.round(l.quantidades[k] ?? 0)))
    const s = q.reduce((a, b) => a + b, 0)
    if (l.total != null && l.total !== s) difs.push({ linha: i + 1, ref: `${l.referencia} · ${l.cor}`, lida: s, ficheiro: l.total })
    const r = porRef.get(l.referencia) ?? { linha: l.linhaEncomenda, descricao: l.descricao, cores: new Map<string, { q: number[]; preco: number; linhas: number }>() }
    const c = r.cores.get(l.cor) ?? { q: tam.map(() => 0), preco: 0, linhas: 0 }
    c.q = c.q.map((x, k) => x + q[k]); c.linhas++; if (l.preco) c.preco = l.preco
    r.cores.set(l.cor, c); porRef.set(l.referencia, r)
  })
  const crianca = tam.some((t) => /^\d{1,2}\s?[MYA]$/i.test(t.trim()))
  const modelos: Modelo[] = [...porRef.entries()].map(([ref, r]) => {
    const variantes: Variante[] = [...r.cores.entries()].map(([cor, c]) => {
      const nomeCor = titulo(cor.replace(/^\d+\s*-\s*/, ''))
      return {
        id: slug(cor), ref: cor.match(/^\d+/)?.[0] ?? slug(cor), nome: cor.match(/^\d+/) ? `${cor.match(/^\d+/)![0]} - ${nomeCor}` : nomeCor,
        refCor: nomeCor.toUpperCase(), codigoLavagem: 'A definir', qtdEncomenda: c.q, qtd: [...c.q], preco: c.preco, fichaGerada: false,
        linhasOrigem: c.linhas > 1 ? c.linhas : undefined,
      }
    })
    const tipoPeca = /cal[çc][ãa]o|short|bermuda/i.test(r.descricao) ? 'Calções' : /cal[çc]a|pant|jean|denim/i.test(r.descricao) ? 'Calças'
      : /camisa|shirt|chemise/i.test(r.descricao) ? 'Camisa' : /casaco|jacket|blus/i.test(r.descricao) ? 'Casaco' : 'A definir'
    return {
      id: slug(ref), nome: titulo(r.descricao.replace(/\s*-\s*/g, ' · ')), refCliente: ref, linhaEncomenda: r.linha ?? undefined,
      tipoPeca, descricao: tipoPeca.toUpperCase(), escala: tam, techPack: false, variantes, estado: 'sem-ficha',
      materiais: [], operacoes: [], observacoes: [], novasObservacoes: [], medidas: [], versoes: [], caixaMax: crianca ? 40 : 20,
    }
  })
  const pecas = modelos.reduce((n, m) => n + m.variantes.reduce((k, v) => k + v.qtdEncomenda.reduce((a, b) => a + b, 0), 0), 0)
  return {
    ok: true, origem: 'ia', folha: nomeFicheiro, linhaCabecalho: 0, tamanhos: tam, colunasExtra: [], modelos,
    preEncomenda: pecas, stock: 0, temPrecos: d.linhas.some((l) => !!l.preco), linhasLidas: d.linhas.length, linhasComDiferenca: difs,
    perguntas: d.perguntas.map((t) => ({ ref: 'Documento', texto: t })), notasPorRef: {},
    documento: { cliente: d.cliente, numero: d.numeroDocumento, data: d.dataDocumento, entrega: d.dataEntrega },
    notasDocumento: d.notas,
    totaisDoc: d.totaisDocumento.pecas != null
      ? { pecas: d.totaisDocumento.pecas, valor: d.totaisDocumento.valor ?? 0, porTamanho: d.totaisDocumento.porTamanho ?? undefined }
      : undefined,
    linhasDuvidosas: d.linhas.filter((l) => l.confianca === 'baixa').map((l) => ({ ref: l.referencia, cor: l.cor, pagina: l.pagina })),
  }
}

/** Liga os modelos do tech pack às referências da encomenda (pelo número da referência). */
export function ligarTechPack(modelos: Modelo[], tp: TechPackLido) {
  const digitos = (s: string) => s.match(/\d{4,}/g) ?? []
  const out: Record<string, number> = {}
  modelos.forEach((m) => {
    const alvo = new Set([...digitos(m.refCliente ?? ''), ...m.variantes.flatMap((v) => digitos(v.ref)), ...digitos(m.nome)])
    const i = tp.modelos.findIndex((t) => digitos(t.referencia).some((d) => alvo.has(d)) || m.variantes.some((v) => v.ref && t.referencia.includes(v.ref)))
    if (i >= 0) out[m.id] = i
  })
  return out
}

/** Lê com IA um ficheiro que já está guardado no servidor (ex.: anexo de um email). */
export async function lerGuardadoComIA<T>(caminho: string, tipo: 'encomenda' | 'techpack' | 'extrato' | 'fatura', contexto?: string): Promise<{ dados: T; uso: { entrada: number; saida: number } }> {
  if (!supabase) throw new Error('A leitura com IA precisa do servidor (Supabase).')
  const { data, error } = await supabase.functions.invoke('ler-documento', { body: { caminho, tipo, contexto } })
  if (error) {
    let motivo = error.message
    try { const corpo = await (error as { context?: Response }).context?.json(); if (corpo?.erro) motivo = corpo.erro } catch { /* sem corpo */ }
    throw new Error(motivo)
  }
  if (!data?.ok) throw new Error(data?.erro ?? 'A leitura falhou.')
  return { dados: data.dados as T, uso: data.uso }
}
