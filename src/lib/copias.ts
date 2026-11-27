import { COLECOES, type Colecao } from '../store/db'
import type { Atividade } from '../types'
import { supabase } from './supabase'

export const APP_COPIA = 'pereiracruz-fichas'
export const VERSAO_COPIA = 1

export interface Copia {
  app: typeof APP_COPIA
  versao: number
  criadaEm: string
  origem: string
  colecoes: Record<Colecao, { id: string }[]>
  atividade: Atividade[]
}

export function criarCopia(estado: Record<Colecao, { id: string }[]> & { atividade: Atividade[] }): Copia {
  return {
    app: APP_COPIA, versao: VERSAO_COPIA, criadaEm: new Date().toISOString(), origem: location.origin,
    colecoes: Object.fromEntries(COLECOES.map((c) => [c, estado[c]])) as Copia['colecoes'],
    atividade: estado.atividade,
  }
}

export function descarregarCopia(c: Copia) {
  const blob = new Blob([JSON.stringify(c, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `copia-pereiracruz-${c.criadaEm.slice(0, 10)}-${c.criadaEm.slice(11, 16).replace(':', 'h')}.json`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return a.download
}

/** Lê e valida um ficheiro de cópia. Lança erro com a explicação se não for válido. */
export async function lerCopia(f: File): Promise<Copia> {
  let dados: unknown
  try { dados = JSON.parse(await f.text()) } catch { throw new Error('O ficheiro não é uma cópia de segurança válida (não é JSON).') }
  return validarCopia(dados)
}

/** Valida o conteúdo de uma cópia (de um ficheiro ou das cópias automáticas do servidor). */
export function validarCopia(dados: unknown): Copia {
  const c = (dados ?? {}) as Partial<Copia>
  if (c.app !== APP_COPIA) throw new Error('Este ficheiro não é uma cópia de segurança desta aplicação.')
  if (typeof c.versao !== 'number' || c.versao > VERSAO_COPIA) throw new Error('Cópia feita por uma versão mais recente da aplicação. Atualize a página e tente de novo.')
  if (!c.colecoes || typeof c.colecoes !== 'object') throw new Error('A cópia não tem dados.')
  for (const col of COLECOES) {
    const lista = (c.colecoes as Record<string, unknown>)[col]
    if (lista === undefined) continue
    if (!Array.isArray(lista) || lista.some((x) => !x || typeof x !== 'object' || typeof (x as { id?: unknown }).id !== 'string')) {
      throw new Error(`A cópia está danificada na parte «${col}».`)
    }
  }
  return { ...c, atividade: Array.isArray(c.atividade) ? c.atividade : [] } as Copia
}

export type Diferenca = { colecao: Colecao; atual: number; copia: number; novos: number; removidos: number; alterados: number }
export function compararCopia(estado: Record<Colecao, { id: string }[]>, c: Copia): Diferenca[] {
  return COLECOES.map((col) => {
    // coleção que não existia quando a cópia foi feita: fica como está
    const atual = estado[col] ?? [], copia = c.colecoes[col] ?? atual
    const mapa = new Map(atual.map((x) => [x.id, JSON.stringify(x)]))
    const ids = new Set(copia.map((x) => x.id))
    return {
      colecao: col, atual: atual.length, copia: copia.length,
      novos: copia.filter((x) => !mapa.has(x.id)).length,
      removidos: atual.filter((x) => !ids.has(x.id)).length,
      alterados: copia.filter((x) => mapa.has(x.id) && mapa.get(x.id) !== JSON.stringify(x)).length,
    }
  })
}

// ---------- Cópias automáticas (semanais, no Supabase) ----------

export const ACAO_AUTOMATICA = 'Cópia de segurança automática'
export const ACAO_DESCARREGADA = 'Cópia de segurança descarregada'

export interface CopiaAutomatica { id: number; criadaEm: string; registos: number; tamanho: number }

/** Lista as cópias automáticas (sem o conteúdo). null = a tabela ainda não existe (falta o script). */
export async function listarAutomaticas(): Promise<CopiaAutomatica[] | null> {
  if (!supabase) return []
  const { data, error } = await supabase.from('copias_automaticas').select('id,criada_em,registos,tamanho').order('criada_em', { ascending: false })
  if (error) {
    if (/does not exist|schema cache|42P01|PGRST205/i.test(`${error.code} ${error.message}`)) return null
    throw error
  }
  return (data ?? []).map((r) => ({ id: r.id as number, criadaEm: r.criada_em as string, registos: r.registos as number, tamanho: Number(r.tamanho) }))
}

export async function obterAutomatica(id: number): Promise<Copia> {
  const { data, error } = await supabase!.from('copias_automaticas').select('conteudo').eq('id', id).single()
  if (error) throw error
  return validarCopia(data.conteudo)
}

/** Data da cópia mais recente, automática ou descarregada (para o aviso no menu). */
export async function ultimaCopiaServidor(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.from('copias_automaticas').select('criada_em').order('criada_em', { ascending: false }).limit(1)
  return (data?.[0]?.criada_em as string | undefined) ?? null
}
