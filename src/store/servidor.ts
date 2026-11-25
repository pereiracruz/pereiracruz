import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { aviso } from '../components/ui'
import { COLECOES, dadosIniciais, useDb, type Colecao } from './db'
import type { Atividade } from '../types'

/**
 * Sincronização com o Supabase:
 * - ao iniciar sessão carrega todos os documentos (e semeia a base de dados se estiver vazia);
 * - cada alteração no estado é guardada (upsert por coleção/id, com espera de 600 ms);
 * - o que é retirado do estado é apagado no servidor.
 */

type Linha = { colecao: Colecao; id: string; dados: unknown }
let aHidratar = false
const fila = new Map<string, Linha>()
let temporizador: ReturnType<typeof setTimeout> | null = null

const vazio = () => ({ ...Object.fromEntries(COLECOES.map((c) => [c, []])), atividade: [] as Atividade[] })

const ordenar = (c: Colecao, lista: { id: string }[]) => {
  const por = (k: string) => (a: Record<string, unknown>, b: Record<string, unknown>) => String(b[k] ?? '').localeCompare(String(a[k] ?? ''))
  if (c === 'encomendas') return [...lista].sort(por('criadaEm') as never)
  if (c === 'pedidos') return [...lista].sort(por('criadoEm') as never)
  if (c === 'historico') return [...lista].sort(por('data') as never)
  return [...lista].sort((a, b) => a.id.localeCompare(b.id, 'pt', { numeric: true }))
}

async function lerTudo(): Promise<Linha[]> {
  const out: Linha[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase!.from('documentos').select('colecao,id,dados').range(i, i + 999)
    if (error) throw error
    out.push(...(data as Linha[]))
    if (data.length < 1000) return out
  }
}

async function semear(): Promise<Linha[]> {
  const ini = dadosIniciais() as unknown as Record<Colecao, { id: string }[]>
  const linhas: Linha[] = COLECOES.flatMap((c) => ini[c].map((d) => ({ colecao: c, id: d.id, dados: d })))
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await supabase!.from('documentos').upsert(linhas.slice(i, i + 200))
    if (error) throw error
  }
  await supabase!.from('atividade').insert({ acao: 'Dados iniciais carregados', detalhe: `${linhas.length} registos (clientes, dados mestre, encomendas de exemplo)` })
  return linhas
}

async function carregar(user: User) {
  useDb.setState({ aCarregar: true, erroServidor: null })
  try {
    let linhas = await lerTudo()
    if (!linhas.length) linhas = await semear()
    const porColecao = Object.fromEntries(COLECOES.map((c) => [c, ordenar(c, linhas.filter((l) => l.colecao === c).map((l) => l.dados as { id: string }))]))
    const { data: act } = await supabase!.from('atividade').select('id,data,acao,detalhe').order('data', { ascending: false }).limit(500)
    const { data: perfil } = await supabase!.from('perfis').select('nome').eq('id', user.id).maybeSingle()
    aHidratar = true
    useDb.setState({
      ...porColecao,
      atividade: (act ?? []).map((a) => ({ id: String(a.id), data: a.data, acao: a.acao, detalhe: a.detalhe })),
      sessao: user.email ?? user.id,
      nomeUtilizador: perfil?.nome ?? 'Admin',
      aCarregar: false,
    })
  } catch (e) {
    console.error(e)
    const msg = (e as { message?: string }).message ?? String(e)
    useDb.setState({ aCarregar: false, erroServidor: /permission denied/i.test(msg) ? 'Sem permissões nas tabelas: falta correr o script de permissões no Supabase.' : msg })
  } finally {
    aHidratar = false
  }
}

async function despejar() {
  temporizador = null
  if (!fila.size) return
  const linhas = [...fila.values()]
  fila.clear()
  const { error } = await supabase!.from('documentos').upsert(linhas)
  useDb.setState((s) => ({ aGuardar: Math.max(0, s.aGuardar - linhas.length) }))
  if (error) { console.error(error); aviso('Não foi possível guardar no servidor. Verifique a ligação.') }
}

function agendar(l: Linha) {
  const k = `${l.colecao}/${l.id}`
  if (!fila.has(k)) useDb.setState((s) => ({ aGuardar: s.aGuardar + 1 }))
  fila.set(k, l)
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(despejar, 600)
}

async function apagar(colecao: Colecao, ids: string[]) {
  for (const id of ids) {
    if (fila.delete(`${colecao}/${id}`)) useDb.setState((s) => ({ aGuardar: Math.max(0, s.aGuardar - 1) }))
  }
  const { error } = await supabase!.from('documentos').delete().eq('colecao', colecao).in('id', ids)
  if (error) { console.error(error); aviso('Não foi possível apagar no servidor.') }
}

let iniciado = false
export function iniciarServidor() {
  if (!supabase || iniciado) return
  iniciado = true

  supabase.auth.onAuthStateChange((evento, sessao) => {
    // as chamadas ao Supabase não se fazem dentro do callback (recomendação do supabase-js)
    if (sessao && (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN')) {
      if (useDb.getState().sessao !== (sessao.user.email ?? sessao.user.id)) setTimeout(() => void carregar(sessao.user), 0)
    } else if (!sessao) {
      aHidratar = true
      useDb.setState({ ...vazio(), sessao: null })
      aHidratar = false
    }
  })

  useDb.subscribe((s, prev) => {
    if (aHidratar || !s.sessao || !prev.sessao) return
    for (const c of COLECOES) {
      const novo = s[c] as { id: string }[], antigo = prev[c] as { id: string }[]
      if (novo === antigo) continue
      const mapa = new Map(antigo.map((x) => [x.id, x]))
      for (const x of novo) if (mapa.get(x.id) !== x) agendar({ colecao: c, id: x.id, dados: x })
      const ids = new Set(novo.map((x) => x.id))
      const removidos = antigo.filter((x) => !ids.has(x.id)).map((x) => x.id)
      if (removidos.length) void apagar(c, removidos)
    }
  })

  window.addEventListener('beforeunload', (e) => {
    if (fila.size) { void despejar(); e.preventDefault() }
  })
}
