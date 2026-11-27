import { create } from 'zustand'
import { supabase } from './supabase'

/** Emails de encomendas recolhidos pela função do servidor «email-encomendas» (IMAP, só leitura na caixa). */
export interface AnexoEmail { nome: string; caminho: string; tipo: string; tamanho: number }
export interface EmailEncomenda {
  id: string; uid: number; messageId: string | null
  /** conta de email onde chegou (há várias caixas) */
  conta?: string
  /** «fatura» = fatura/recibo verde de fornecedor (Faturas recebidas); «pedido» = pedido de preço/cotação (Emails de pedidos); sem tipo = encomenda */
  tipo?: 'encomenda' | 'fatura' | 'pedido'
  de: string; deNome: string; assunto: string; data: string; texto: string
  anexos: AnexoEmail[]
  estado: 'nova' | 'tratada' | 'ignorada'
  encomendaId?: string
  recebidoEm: string
  respostas?: RespostaEmail[]
}
export interface RespostaEmail { data: string; para: string; assunto: string; texto: string; conta: string; por: string; copiaEnviados: boolean }
export interface AssinaturaConta { nome?: string; texto?: string; imagem?: string }
export interface ConfigEmail {
  remetentes: string[]; palavras: string[]; dias: number
  /** palavras procuradas no texto da mensagem (só as inequívocas; as do assunto vão em «palavras») */
  palavrasTexto: string[]
  /** pedidos de preço/cotação: palavras no assunto e no texto (vazio = as da aplicação) */
  palavrasPedidos?: string[]
  palavrasPedidosTexto?: string[]
  /** assuntos com estas palavras nunca são pedidos (faturas, pagamentos, publicidade…) */
  palavrasPedidosExcluir?: string[]
  /** nome a mostrar por conta (endereço → nome), ex.: geral@… → «Geral» */
  nomesContas: Record<string, string>
  /** assinatura das respostas por conta (endereço em minúsculas) */
  assinaturas: Record<string, AssinaturaConta>
}
export const CONFIG_EMAIL_INICIAL: ConfigEmail = { remetentes: [], palavras: [], palavrasTexto: [], dias: 14, nomesContas: {}, assinaturas: {} }
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
  novos: { id: string; conta: string; assunto: string; de: string; anexos: number; tipo?: string }[]
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
export async function verificarEmails(reclassificar = false): Promise<ResultadoVerificar> {
  if (useEmails.getState().aVerificar) throw new Error('Já está a verificar.')
  useEmails.setState({ aVerificar: true, erro: '' })
  try {
    // a função trata poucos emails de cada vez (limites do servidor): repete enquanto houver mais
    const r = await chamar<ResultadoVerificar>({ acao: 'verificar', reclassificar })
    for (let i = 0; i < 10 && r.restantes > 0; i++) {
      const mais = await chamar<ResultadoVerificar>({ acao: 'verificar' })
      r.novos.push(...mais.novos); r.restantes = mais.restantes; r.erros = mais.erros
    }
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

/** Envia a resposta pela conta onde o email chegou (com a assinatura dessa conta) e guarda cópia em Enviados. */
export async function responderEmail(email: EmailEncomenda, texto: string): Promise<RespostaEmail> {
  const r = await chamar<{ resposta: RespostaEmail }>({ acao: 'responder', emailId: email.id, texto })
  useEmails.setState((s) => ({ emails: s.emails.map((e) => (e.id === email.id ? { ...e, respostas: [...(e.respostas ?? []), r.resposta] } : e)) }))
  return r.resposta
}

/** Guarda a imagem da assinatura de uma conta no servidor e devolve o caminho. */
export async function guardarImagemAssinatura(conta: string, f: File): Promise<string> {
  if (!supabase) throw new Error('Sem servidor.')
  const ext = (f.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.png').toLowerCase()
  const caminho = `assinaturas/${conta.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}${ext}`
  const { error } = await supabase.storage.from('documentos').upload(caminho, f, { contentType: f.type || undefined })
  if (error) throw new Error(error.message)
  return caminho
}
export async function urlImagem(caminho: string) {
  if (!supabase) return ''
  const { data } = await supabase.storage.from('documentos').createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? ''
}

export const ehEncomenda = (e: EmailEncomenda) => e.tipo !== 'fatura' && e.tipo !== 'pedido'
export const emailsNovos = (s: EstadoEmails) => s.emails.filter((e) => e.estado === 'nova' && ehEncomenda(e)).length
export const pedidosNovos = (s: EstadoEmails) => s.emails.filter((e) => e.estado === 'nova' && e.tipo === 'pedido').length
export const faturasNovas = (s: EstadoEmails) => s.emails.filter((e) => e.estado === 'nova' && e.tipo === 'fatura').length
