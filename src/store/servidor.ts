import type { RealtimeChannel, RealtimePostgresChangesPayload, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { aviso } from '../components/ui'
import { iguais, juntar } from '../lib/juntar'
import { COLECOES, dadosIniciais, juntarClientes, useDb, type Colecao } from './db'
import type { Atividade, ClienteCfg } from '../types'

/**
 * Sincronização com o Supabase:
 * - ao iniciar sessão carrega todos os documentos (e semeia a base de dados se estiver vazia);
 * - cada alteração no estado é guardada (por coleção/id, com espera de 600 ms);
 * - o que é retirado do estado é apagado no servidor.
 *
 * Vários aparelhos ao mesmo tempo (telemóvel e computador):
 * - cada documento tem uma versão no servidor; só se grava sobre a versão que este aparelho leu.
 *   Se outro aparelho gravou entretanto, as duas alterações juntam-se campo a campo (lib/juntar.ts) e grava-se o resultado;
 * - o Supabase avisa (Realtime) quando um documento muda noutro aparelho e a alteração aparece logo, sem recarregar;
 *   ao voltar à aplicação (telemóvel acordado, rede de volta) confere-se tudo o que mudou entretanto.
 * Precisa do script supabase/migrations/20261127000000_tempo_real.sql; sem ele grava como antes (a última gravação ganha).
 */

type Linha = { colecao: Colecao; id: string; dados: unknown; versao?: number }
type Doc = { id: string }
let aHidratar = false
const fila = new Map<string, Linha>()
let temporizador: ReturnType<typeof setTimeout> | null = null

/** Última versão conhecida do servidor, por documento: serve de base para juntar alterações. */
const base = new Map<string, { versao: number; dados: unknown }>()
/** false se ainda não correu no Supabase o script 20261127000000_tempo_real.sql */
let comVersao = true
const k = (c: string, id: string) => `${c}/${id}`
const eColecao = (c: unknown): c is Colecao => (COLECOES as readonly unknown[]).includes(c)

const vazio = () => ({ ...Object.fromEntries(COLECOES.map((c) => [c, []])), atividade: [] as Atividade[] })

const ordenar = (c: Colecao, lista: Doc[]) => {
  const por = (k: string) => (a: Record<string, unknown>, b: Record<string, unknown>) => String(b[k] ?? '').localeCompare(String(a[k] ?? ''))
  if (c === 'encomendas') return [...lista].sort(por('criadaEm') as never)
  if (c === 'pedidos') return [...lista].sort(por('criadoEm') as never)
  if (c === 'historico') return [...lista].sort(por('data') as never)
  return [...lista].sort((a, b) => a.id.localeCompare(b.id, 'pt', { numeric: true }))
}

async function lerTudo(): Promise<Linha[]> {
  const out: Linha[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase!.from('documentos').select(comVersao ? 'colecao,id,dados,versao' : 'colecao,id,dados').in('colecao', [...COLECOES]).range(i, i + 999)
    if (error && comVersao && /versao/.test(error.message)) { comVersao = false; return lerTudo() }
    if (error) throw error
    out.push(...(data as unknown as Linha[]))
    if (data.length < 1000) return out
  }
}

async function semear(): Promise<Linha[]> {
  const ini = dadosIniciais() as unknown as Record<Colecao, Doc[]>
  const linhas: Linha[] = COLECOES.flatMap((c) => ini[c].map((d) => ({ colecao: c, id: d.id, dados: d })))
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await supabase!.from('documentos').upsert(linhas.slice(i, i + 200))
    if (error) throw error
  }
  await supabase!.from('atividade').insert({ acao: 'Dados iniciais carregados', detalhe: `${linhas.length} registos (clientes, dados mestre, encomendas de exemplo)` })
  await supabase!.from('atividade').insert({ acao: 'Dados mestre atualizados', detalhe: `v${VERSAO_DADOS} · dados iniciais` })
  return linhas
}

/** Versão dos dados mestre de origem: ao subir, junta-se ao servidor o que for novo (sem alterar nem repor o que existe). */
const VERSAO_DADOS = 14
const MESTRE: Colecao[] = ['fornecedores', 'tecidos', 'equivalencias', 'lavagens', 'acessorios', 'escalas', 'destinatarios', 'precosRef', 'precosTingimento', 'precosLavagem', 'clientes', 'estadosProducao', 'categoriasPeca']

const CORRECOES: { colecao: Colecao; id: string; antes: Record<string, unknown>; depois: Record<string, unknown> }[] = [
  { colecao: 'clientes', id: 'c1', antes: { comissao: 7 }, depois: { comissao: 0 } }, // v9: a agente da Imprevu já não existe
  { colecao: 'destinatarios', id: 'd6', antes: { nome: 'Embalamento' }, depois: { nome: 'Paulo e Marta', contacto: 'Embalamento' } }, // v12
]

async function atualizarMestre(linhas: Linha[]): Promise<Linha[]> {
  const { data: feito } = await supabase!.from('atividade').select('id').eq('acao', 'Dados mestre atualizados').like('detalhe', `v${VERSAO_DADOS} %`).limit(1)
  if (feito?.length) return []
  const ini = dadosIniciais() as unknown as Record<Colecao, Doc[]>
  const existe = new Set(linhas.map((l) => `${l.colecao}/${l.id}`))
  const novas: Linha[] = MESTRE.filter((c) => c !== 'clientes').flatMap((c) => ini[c].filter((d) => !existe.has(`${c}/${d.id}`)).map((d) => ({ colecao: c, id: d.id, dados: d })))
  // clientes: juntam-se pelo nome (podem ter sido criados à mão); nos existentes só se preenchem campos novos (v13: OF e acessórios do cliente)
  const clientesAtuais = linhas.filter((l) => l.colecao === 'clientes').map((l) => l.dados as ClienteCfg)
  for (const c of juntarClientes(clientesAtuais, ini.clientes as unknown as ClienteCfg[])) {
    const antes = clientesAtuais.find((x) => x.id === c.id)
    if (!antes || !iguais(antes, c)) novas.push({ colecao: 'clientes', id: c.id, dados: c })
  }
  // correções a registos existentes, só se ainda tiverem o valor antigo
  for (const k of CORRECOES) {
    const l = linhas.find((x) => x.colecao === k.colecao && x.id === k.id)
    const d = l?.dados as Record<string, unknown> | undefined
    if (l && d && Object.entries(k.antes).every(([c, v]) => d[c] === v)) novas.push({ colecao: l.colecao, id: l.id, dados: { ...d, ...k.depois } })
  }
  if (novas.length) {
    const { error } = await supabase!.from('documentos').upsert(novas)
    if (error) throw error
  }
  await supabase!.from('atividade').insert({ acao: 'Dados mestre atualizados', detalhe: `v${VERSAO_DADOS} · ${novas.length} registos novos` })
  return novas
}

async function carregar(user: User) {
  useDb.setState({ aCarregar: true, erroServidor: null })
  try {
    let linhas = await lerTudo()
    if (!linhas.length) { await semear(); linhas = await lerTudo() }
    else {
      // dados mestre novos: se falhar (ex.: falta um script no Supabase), avisa mas não impede a entrada
      const novas = await atualizarMestre(linhas).catch((e: { message?: string }) => {
        console.error(e)
        aviso(/check constraint/i.test(e.message ?? '') ? 'Falta correr no Supabase o script 20261126000000_colecoes.sql (tabelas da Clothius).' : 'Não foi possível atualizar os dados mestre no servidor.')
        return [] as Linha[]
      })
      if (novas.length) linhas = await lerTudo() // relê para ficar com as versões do servidor
    }
    base.clear()
    for (const l of linhas) if (l.versao != null) base.set(k(l.colecao, l.id), { versao: l.versao, dados: l.dados })
    const porColecao = Object.fromEntries(COLECOES.map((c) => [c, ordenar(c, linhas.filter((l) => l.colecao === c).map((l) => l.dados as Doc))]))
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
    aHidratar = false
    if (comVersao) ligarTempoReal()
    else aviso('Falta correr no Supabase o script 20261127000000_tempo_real.sql (alterações em vários aparelhos).')
  } catch (e) {
    console.error(e)
    const msg = (e as { message?: string }).message ?? String(e)
    useDb.setState({ aCarregar: false, erroServidor: /permission denied/i.test(msg) ? 'Sem permissões nas tabelas: falta correr o script de permissões no Supabase.' : msg })
  } finally {
    aHidratar = false
  }
}

// ---------- Estado local ----------

const docLocal = (c: Colecao, id: string) => (useDb.getState()[c] as Doc[]).find((x) => x.id === id)

/** Põe um documento no estado. Com guardar = false não volta a ser gravado (veio do servidor tal e qual). */
function substituir(c: Colecao, id: string, valor: unknown, guardar: boolean) {
  const lista = useDb.getState()[c] as Doc[]
  const nova = lista.some((x) => x.id === id) ? lista.map((x) => (x.id === id ? (valor as Doc) : x)) : ordenar(c, [...lista, valor as Doc])
  const antes = aHidratar
  aHidratar = !guardar
  try { useDb.setState({ [c]: nova } as never) } finally { aHidratar = antes }
}

function retirar(c: Colecao, id: string) {
  const lista = useDb.getState()[c] as Doc[]
  if (!lista.some((x) => x.id === id)) return
  const antes = aHidratar
  aHidratar = true
  try { useDb.setState({ [c]: lista.filter((x) => x.id !== id) } as never) } finally { aHidratar = antes }
}

const NOMES: Partial<Record<Colecao, string>> = { encomendas: 'Esta encomenda', pedidos: 'Este pedido' }
let ultimoAviso = 0
function avisarJuncao(c: Colecao, conflitos: string[]) {
  if (Date.now() - ultimoAviso < 4000) return
  ultimoAviso = Date.now()
  const quem = NOMES[c] ?? 'Este registo'
  aviso(conflitos.length
    ? `${quem} foi alterada noutro aparelho: juntaram-se as alterações (${conflitos.length} campo${conflitos.length > 1 ? 's' : ''} alterado${conflitos.length > 1 ? 's' : ''} nos dois: ficou o deste aparelho).`
    : `${quem} foi alterada noutro aparelho: juntaram-se as duas alterações.`)
}

// ---------- Gravar ----------

let emCurso = false
const emVoo = new Set<string>()
const adiados = new Set<string>()

const msgErro = (m: string) => (/check constraint/i.test(m) ? 'Falta correr no Supabase o script 20261126000000_colecoes.sql.' : 'Não foi possível guardar no servidor. Verifique a ligação.')

async function gravarUma(l: Linha, tentativas = 3): Promise<void> {
  const chave = k(l.colecao, l.id)
  if (!comVersao) {
    const { error } = await supabase!.from('documentos').upsert({ colecao: l.colecao, id: l.id, dados: l.dados })
    if (error) throw error
    return
  }
  const b = base.get(chave)
  const r = b
    ? await supabase!.from('documentos').update({ dados: l.dados }).eq('colecao', l.colecao).eq('id', l.id).eq('versao', b.versao).select('versao')
    : await supabase!.from('documentos').insert({ colecao: l.colecao, id: l.id, dados: l.dados }).select('versao')
  if (r.error && r.error.code !== '23505') throw r.error // 23505: já existe (criado noutro aparelho)
  if (!r.error && r.data.length) { base.set(chave, { versao: r.data[0].versao as number, dados: l.dados }); return }

  // outro aparelho gravou entretanto: junta as alterações
  const { data: atual, error } = await supabase!.from('documentos').select('dados,versao').eq('colecao', l.colecao).eq('id', l.id).maybeSingle()
  if (error) throw error
  if (!atual) { base.delete(chave); if (tentativas > 0) return gravarUma(l, tentativas - 1); return } // apagado noutro aparelho: volta a criar
  base.set(chave, { versao: atual.versao as number, dados: atual.dados })
  const minha = docLocal(l.colecao, l.id)
  if (!minha) return // entretanto apagado aqui
  const { valor, conflitos } = juntar(b?.dados, minha as unknown, atual.dados as unknown)
  avisarJuncao(l.colecao, conflitos)
  // o resultado volta a gravar-se (agora sobre a versão do outro aparelho), a não ser que já seja igual ao do servidor
  if (iguais(valor, atual.dados)) {
    if (fila.delete(chave)) useDb.setState((s) => ({ aGuardar: Math.max(0, s.aGuardar - 1) }))
    substituir(l.colecao, l.id, atual.dados, false)
  } else substituir(l.colecao, l.id, valor, true)
}

async function despejar() {
  temporizador = null
  if (emCurso || !fila.size) return
  emCurso = true
  const linhas = [...fila.values()]
  fila.clear()
  for (const l of linhas) emVoo.add(k(l.colecao, l.id))
  const erros: { message?: string }[] = []
  try {
    for (let i = 0; i < linhas.length; i += 8) {
      await Promise.all(linhas.slice(i, i + 8).map((l) => gravarUma(l).catch((e) => { console.error(e); erros.push(e) })))
    }
  } finally {
    emVoo.clear()
    emCurso = false
    useDb.setState((s) => ({ aGuardar: Math.max(0, s.aGuardar - linhas.length) }))
  }
  if (erros.length) aviso(msgErro(erros[0].message ?? ''))
  if (adiados.size) { const ks = [...adiados]; adiados.clear(); pedir(ks) }
  if (fila.size && !temporizador) temporizador = setTimeout(despejar, 600)
}

function agendar(l: Linha) {
  const chave = k(l.colecao, l.id)
  if (!fila.has(chave)) useDb.setState((s) => ({ aGuardar: s.aGuardar + 1 }))
  fila.set(chave, l)
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(despejar, 600)
}

async function apagar(colecao: Colecao, ids: string[]) {
  for (const id of ids) {
    if (fila.delete(k(colecao, id))) useDb.setState((s) => ({ aGuardar: Math.max(0, s.aGuardar - 1) }))
  }
  const { error } = await supabase!.from('documentos').delete().eq('colecao', colecao).in('id', ids)
  if (error) { console.error(error); aviso('Não foi possível apagar no servidor.'); return }
  for (const id of ids) base.delete(k(colecao, id))
}

// ---------- Alterações vindas de outros aparelhos ----------

let canal: RealtimeChannel | null = null
const aPedir = new Set<string>()
let temporizadorPedir: ReturnType<typeof setTimeout> | null = null

/** Pede ao servidor os documentos indicados (colecao/id), juntando pedidos próximos. */
function pedir(chaves: string[]) {
  for (const c of chaves) aPedir.add(c)
  if (temporizadorPedir) return
  temporizadorPedir = setTimeout(() => { temporizadorPedir = null; void buscar() }, 250)
}

async function buscar() {
  const chaves = [...aPedir]
  aPedir.clear()
  const porColecao = new Map<Colecao, string[]>()
  for (const ch of chaves) {
    const i = ch.indexOf('/'), c = ch.slice(0, i) as Colecao
    porColecao.set(c, [...(porColecao.get(c) ?? []), ch.slice(i + 1)])
  }
  for (const [c, ids] of porColecao) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase!.from('documentos').select('colecao,id,dados,versao').eq('colecao', c).in('id', ids.slice(i, i + 100))
      if (error) { console.error(error); continue }
      for (const l of data as unknown as Linha[]) aplicarRemoto(l)
    }
  }
}

function aplicarRemoto(l: Linha) {
  if (!eColecao(l.colecao) || l.versao == null) return
  const chave = k(l.colecao, l.id)
  const b = base.get(chave)
  if (b && l.versao <= b.versao) return // já conhecido (ex.: a gravação deste próprio aparelho)
  if (emVoo.has(chave)) { adiados.add(chave); return } // trata-se quando terminar a gravação em curso
  const local = docLocal(l.colecao, l.id)
  base.set(chave, { versao: l.versao, dados: l.dados })
  if (!local) { if (!b) substituir(l.colecao, l.id, l.dados, false); return } // novo noutro aparelho (se havia base, foi apagado aqui)
  const pendente = fila.has(chave)
  const alteradoAqui = pendente || !b || !iguais(local, b.dados)
  if (!alteradoAqui) { substituir(l.colecao, l.id, l.dados, false); return }
  const { valor, conflitos } = juntar(b?.dados, local as unknown, l.dados)
  if (iguais(valor, l.dados)) {
    if (fila.delete(chave)) useDb.setState((s) => ({ aGuardar: Math.max(0, s.aGuardar - 1) }))
    substituir(l.colecao, l.id, l.dados, false)
    return
  }
  avisarJuncao(l.colecao, conflitos)
  substituir(l.colecao, l.id, valor, true)
}

function removerRemoto(c: Colecao, id: string) {
  const chave = k(c, id)
  if (!base.has(chave)) return
  base.delete(chave)
  if (fila.has(chave) || emVoo.has(chave)) return // alterado aqui entretanto: a alteração volta a criá-lo
  retirar(c, id)
}

function aoMudar(p: RealtimePostgresChangesPayload<Record<string, unknown>>) {
  const r = (p.eventType === 'DELETE' ? p.old : p.new) as { colecao?: unknown; id?: unknown; versao?: unknown }
  if (!eColecao(r?.colecao) || typeof r.id !== 'string') return
  if (p.eventType === 'DELETE') return removerRemoto(r.colecao, r.id)
  const b = base.get(k(r.colecao, r.id))
  if (b && typeof r.versao === 'number' && r.versao <= b.versao) return
  pedir([k(r.colecao, r.id)])
}

/** Confere com o servidor tudo o que mudou (ao voltar à aplicação ou ao restabelecer a ligação). */
let aSincronizar = false
async function sincronizar() {
  if (!comVersao || aSincronizar || !useDb.getState().sessao) return
  aSincronizar = true
  const antes = new Map([...base].map(([ch, b]) => [ch, b.versao]))
  try {
    const noServidor = new Map<string, number>()
    for (let i = 0; ; i += 1000) {
      const { data, error } = await supabase!.from('documentos').select('colecao,id,versao').in('colecao', [...COLECOES]).range(i, i + 999)
      if (error) throw error
      for (const l of data as { colecao: string; id: string; versao: number }[]) noServidor.set(k(l.colecao, l.id), l.versao)
      if (data.length < 1000) break
    }
    const mudaram = [...noServidor].filter(([ch, v]) => (base.get(ch)?.versao ?? -1) < v).map(([ch]) => ch)
    if (mudaram.length) pedir(mudaram)
    for (const [ch, v] of antes) {
      if (noServidor.has(ch) || base.get(ch)?.versao !== v) continue // (o que se gravou durante a consulta não conta)
      const i = ch.indexOf('/')
      removerRemoto(ch.slice(0, i) as Colecao, ch.slice(i + 1))
    }
  } catch (e) { console.error('sincronizar', e) } finally { aSincronizar = false }
}

function ligarTempoReal() {
  if (canal) void supabase!.removeChannel(canal)
  let primeira = true
  canal = supabase!
    .channel('documentos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documentos' }, aoMudar)
    .subscribe((estado) => {
      // ao voltar a ligar (ex.: telemóvel acordado), confere o que mudou enquanto esteve desligado
      if (estado === 'SUBSCRIBED') { if (!primeira) void sincronizar(); primeira = false }
    })
}

function desligarTempoReal() {
  if (canal) void supabase!.removeChannel(canal)
  canal = null
  base.clear()
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
      setTimeout(desligarTempoReal, 0)
      aHidratar = true
      useDb.setState({ ...vazio(), sessao: null })
      aHidratar = false
    }
  })

  useDb.subscribe((s, prev) => {
    if (aHidratar || !s.sessao || !prev.sessao) return
    for (const c of COLECOES) {
      const novo = s[c] as Doc[], antigo = prev[c] as Doc[]
      if (novo === antigo) continue
      const mapa = new Map(antigo.map((x) => [x.id, x]))
      for (const x of novo) if (mapa.get(x.id) !== x) agendar({ colecao: c, id: x.id, dados: x })
      const ids = new Set(novo.map((x) => x.id))
      const removidos = antigo.filter((x) => !ids.has(x.id)).map((x) => x.id)
      if (removidos.length) void apagar(c, removidos)
    }
  })

  // telemóvel: ao voltar à aplicação ou quando a rede volta
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void sincronizar() })
  window.addEventListener('online', () => void sincronizar())

  window.addEventListener('beforeunload', (e) => {
    if (fila.size || emCurso) { void despejar(); e.preventDefault() }
  })
}
