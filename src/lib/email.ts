import { create } from 'zustand'
import { supabase } from './supabase'

/** Emails de encomendas recolhidos pela função do servidor «email-encomendas» (IMAP, só leitura na caixa). */
export interface AnexoEmail { nome: string; caminho: string; tipo: string; tamanho: number }
export interface EmailEncomenda {
  id: string; uid: number; messageId: string | null
  /** conta de email onde chegou (há várias caixas) */
  conta?: string
  de: string; deNome: string; assunto: string; data: string; texto: string
  anexos: AnexoEmail[]
  estado: 'nova' | 'tratada' | 'ignorada'
  encomendaId?: string
  recebidoEm: string
}
export interface ConfigEmail {
  remetentes: string[]; palavras: string[]; dias: number
  /** nome a mostrar por conta (endereço → nome), ex.: geral@… → «Geral» */
  nomesContas: Record<string, string>
}
export const CONFIG_EMAIL_INICIAL: ConfigEmail = { remetentes: [], palavras: [], dias: 14, nomesContas: {} }
export const nomeConta = (cfg: ConfigEmail, conta?: string) => (conta ? cfg.nomesContas?.[conta.toLowerCase()] || conta : '')

export const emailDisponivel = !!supabase

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('A leitura de emails só funciona no site publicado (com servidor).')
  const { data, error } = await supabase.functions.invoke('email-encomendas', { body: corpo })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const det = ctx ? await ctx.json().catch(() => null) as { erro?: string } | null : null
    if (det?.erro) throw new Error(det.erro)
    if (/not found|404/i.test(error.message)) throw new Error('A função «email-encomendas» ainda não existe no Supabase.')
    throw new Error(error.message)
  }
  if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro)
  return data as T
}

export interface TesteConta { conta: string; pasta: string; ok: boolean; mensagens?: number; porLer?: number; erro?: string }
export const testarEmail = () => chamar<{ contas: TesteConta[] }>({ acao: 'testar' }).then((r) => r.contas)
export interface ResultadoVerificar {
  novos: { id: string; conta: string; assunto: string; de: string; anexos: number }[]
  restantes: number; dias: number
  /** contas que falharam (as outras foram lidas na mesma) */
  erros: { conta: string; erro: string }[]
}

// ---------- estado partilhado (lista, número de novos no menu e no sino) ----------
interface EstadoEmails {
  emails: EmailEncomenda[]
  config: ConfigEmail
  carregado: boolean
  aVerificar: boolean
  ultimaVerificacao: string | null
  erro: string
}
export const useEmails = create<EstadoEmails>(() => ({
  emails: [], config: CONFIG_EMAIL_INICIAL, carregado: false, aVerificar: false, ultimaVerificacao: null, erro: '',
}))

/** Lê da base de dados os emails já recolhidos e os filtros. */
export async function carregarEmails() {
  if (!supabase) return
  const { data, error } = await supabase.from('documentos').select('colecao,id,dados').in('colecao', ['emails', 'configuracao'])
  if (error) { useEmails.setState({ erro: error.message }); return }
  const emails = (data ?? []).filter((l) => l.colecao === 'emails').map((l) => l.dados as EmailEncomenda)
    .sort((a, b) => b.data.localeCompare(a.data))
  const cfg = (data ?? []).find((l) => l.colecao === 'configuracao' && l.id === 'email')?.dados as Partial<ConfigEmail> | undefined
  useEmails.setState({ emails, config: { ...CONFIG_EMAIL_INICIAL, ...cfg }, carregado: true })
}

/** Pede ao servidor que vá à caixa de correio buscar emails novos; depois recarrega a lista. */
export async function verificarEmails(): Promise<ResultadoVerificar> {
  if (useEmails.getState().aVerificar) throw new Error('Já está a verificar.')
  useEmails.setState({ aVerificar: true, erro: '' })
  try {
    const r = await chamar<ResultadoVerificar>({ acao: 'verificar' })
    await carregarEmails()
    useEmails.setState({ ultimaVerificacao: new Date().toISOString(), erro: (r.erros ?? []).map((e) => `${e.conta}: ${e.erro}`).join(' · ') })
    return r
  } catch (e) {
    useEmails.setState({ erro: e instanceof Error ? e.message : String(e) })
    throw e
  } finally {
    useEmails.setState({ aVerificar: false })
  }
}

export async function guardarConfigEmail(config: ConfigEmail) {
  if (!supabase) throw new Error('Sem servidor.')
  const { error } = await supabase.from('documentos').upsert({ colecao: 'configuracao', id: 'email', dados: config })
  if (error) throw new Error(error.message)
  useEmails.setState({ config })
}

export async function marcarEmail(email: EmailEncomenda, estado: EmailEncomenda['estado'], encomendaId?: string) {
  if (!supabase) return
  const novo = { ...email, estado, encomendaId: encomendaId ?? email.encomendaId }
  const { error } = await supabase.from('documentos').upsert({ colecao: 'emails', id: email.id, dados: novo })
  if (error) throw new Error(error.message)
  useEmails.setState((s) => ({ emails: s.emails.map((e) => (e.id === email.id ? novo : e)) }))
}

/** Descarrega um anexo guardado e devolve-o como ficheiro (para a Nova encomenda o ler como se fosse carregado). */
export async function anexoComoFicheiro(a: AnexoEmail): Promise<File> {
  if (!supabase) throw new Error('Sem servidor.')
  const { data, error } = await supabase.storage.from('documentos').download(a.caminho)
  if (error || !data) throw new Error(`Não consegui abrir o anexo ${a.nome}.`)
  return new File([data], a.nome, { type: a.tipo || data.type })
}

export async function abrirAnexo(a: AnexoEmail) {
  if (!supabase) return
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(a.caminho, 300)
  if (error || !data) throw new Error(`Não consegui abrir o anexo ${a.nome}.`)
  window.open(data.signedUrl, '_blank', 'noopener')
}

export const emailsNovos = (s: EstadoEmails) => s.emails.filter((e) => e.estado === 'nova').length
