// Supabase Edge Function «email-encomendas» — lê a caixa de correio por IMAP e recolhe os emails de encomendas.
// SÓ LEITURA na caixa: abre a pasta em modo de leitura e não marca nada como lido, não move nem apaga.
// Para cada email de encomenda novo: guarda os anexos (Excel, PDF, imagens) no bucket «documentos»
// (pasta email/…) e regista o email na tabela «documentos», coleção «emails», para rever na aplicação.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   EMAIL_IMAP_HOST   servidor IMAP (o que aparece no Thunderbird: Definições da conta → Definições do servidor)
//   EMAIL_IMAP_PORT   opcional, por omissão 993 (SSL/TLS)
//   EMAIL_USER        endereço / utilizador da caixa
//   EMAIL_PASSWORD    palavra-passe (de preferência uma palavra-passe de aplicação só para isto)
//   EMAIL_PASTA       opcional, por omissão INBOX
//
// Filtros (na aplicação, página «Emails de encomendas»; guardados em documentos/configuracao/email):
//   remetentes: partes do endereço ou do nome (ex.: «whitecotton», «@cliente.pt»)
//   palavras:   palavras no assunto (ex.: «encomenda», «order», «PO»)
//   Um email entra se tiver anexo Excel/PDF/imagem E (sem filtros, ou se coincidir com algum remetente ou palavra).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { ImapFlow } from 'npm:imapflow@1'
import { simpleParser } from 'npm:mailparser@3'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const ANEXO_UTIL = /\.(xlsx|xlsm|xls|csv|pdf|png|jpe?g|webp)$/i
const MAX_POR_VEZ = 15 // emails novos tratados por chamada (o resto fica para a seguinte)
const MAX_BYTES = 25 * 1024 * 1024

function cliente() {
  const host = env('EMAIL_IMAP_HOST'), user = env('EMAIL_USER'), pass = Deno.env.get('EMAIL_PASSWORD') ?? ''
  if (!host || !user || !pass) throw new Error('Faltam os segredos do email no Supabase (EMAIL_IMAP_HOST, EMAIL_USER, EMAIL_PASSWORD).')
  const port = Number(env('EMAIL_IMAP_PORT') || 993)
  return new ImapFlow({
    host, port, secure: port === 993, auth: { user, pass }, logger: false,
    socketTimeout: 60_000, greetingTimeout: 20_000,
  })
}

const nomeFicheiro = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'anexo'

type Config = { remetentes?: string[]; palavras?: string[]; dias?: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)

  let imap: ImapFlow | null = null
  try {
    // só utilizadores com sessão iniciada na aplicação
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return resposta({ erro: 'Sessão necessária.' }, 401)
    const chave = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, chave, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: quem, error: eSessao } = await supabase.auth.getUser(token)
    if (eSessao || !quem.user) return resposta({ erro: 'Sessão inválida ou expirada. Volte a entrar na aplicação.' }, 401)

    const { acao } = await req.json() as { acao: 'testar' | 'verificar' }
    const pasta = env('EMAIL_PASTA') || 'INBOX'

    imap = cliente()
    await imap.connect()

    if (acao === 'testar') {
      const pastas = (await imap.list()).map((p) => p.path)
      const estado = await imap.status(pasta, { messages: true, unseen: true })
      return resposta({ ok: true, utilizador: env('EMAIL_USER'), pasta, pastas, mensagens: estado.messages ?? 0, porLer: estado.unseen ?? 0 })
    }
    if (acao !== 'verificar') return resposta({ erro: 'Pedido inválido' }, 400)

    // filtros e emails já registados
    const { data: cfgLinha } = await supabase.from('documentos').select('dados').eq('colecao', 'configuracao').eq('id', 'email').maybeSingle()
    const cfg = (cfgLinha?.dados ?? {}) as Config
    const remetentes = (cfg.remetentes ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean)
    const palavras = (cfg.palavras ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean)
    const dias = Math.min(Math.max(Number(cfg.dias) || 14, 1), 90)
    const { data: existentes, error: eEx } = await supabase.from('documentos').select('id').eq('colecao', 'emails')
    if (eEx) throw new Error(`Base de dados: ${eEx.message}`)
    const jaVistos = new Set((existentes ?? []).map((l) => l.id as string))

    const lock = await imap.getMailboxLock(pasta, { readOnly: true })
    const novos: { id: string; assunto: string; de: string; anexos: number }[] = []
    let candidatos = 0, restantes = 0
    try {
      const validade = String((imap.mailbox && typeof imap.mailbox === 'object' ? imap.mailbox.uidValidity : '') ?? '')
      const desde = new Date(Date.now() - dias * 864e5)
      const uids = (await imap.search({ since: desde }, { uid: true })) || []
      // 1.º passo, leve: cabeçalhos e estrutura (sem descarregar o conteúdo)
      const escolhidos: number[] = []
      if (uids.length) for await (const m of imap.fetch(uids, { uid: true, envelope: true, bodyStructure: true, size: true }, { uid: true })) {
        const id = `${validade}-${m.uid}`
        if (jaVistos.has(id)) continue
        const de = (m.envelope?.from ?? []).map((a) => `${a.name ?? ''} <${a.address ?? ''}>`).join(', ').toLowerCase()
        const assunto = (m.envelope?.subject ?? '').toLowerCase()
        const nomes: string[] = []
        const percorrer = (n: { dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; childNodes?: unknown[] } | undefined) => {
          if (!n) return
          const nome = n.dispositionParameters?.filename ?? n.parameters?.name
          if (nome) nomes.push(nome)
          for (const c of (n.childNodes ?? []) as typeof n[]) percorrer(c)
        }
        percorrer(m.bodyStructure as Parameters<typeof percorrer>[0])
        if (!nomes.some((n) => ANEXO_UTIL.test(n))) continue
        const semFiltros = !remetentes.length && !palavras.length
        if (!semFiltros && !remetentes.some((r) => de.includes(r)) && !palavras.some((p) => assunto.includes(p))) continue
        if ((m.size ?? 0) > MAX_BYTES) continue
        candidatos++
        escolhidos.push(m.uid)
      }
      escolhidos.sort((a, b) => a - b)
      restantes = Math.max(0, escolhidos.length - MAX_POR_VEZ)

      // 2.º passo: descarregar e guardar os escolhidos (BODY.PEEK: não marca como lido)
      for (const uid of escolhidos.slice(0, MAX_POR_VEZ)) {
        const msg = await imap.fetchOne(String(uid), { source: true, envelope: true }, { uid: true })
        if (!msg || !msg.source) continue
        const id = `${validade}-${uid}`
        const mail = await simpleParser(msg.source)
        const anexos: { nome: string; caminho: string; tipo: string; tamanho: number }[] = []
        for (const [i, a] of (mail.attachments ?? []).entries()) {
          const nome = a.filename ?? `anexo-${i + 1}`
          if (!ANEXO_UTIL.test(nome)) continue
          const caminho = `email/${id}/${i}-${nomeFicheiro(nome)}`
          const { error } = await supabase.storage.from('documentos').upload(caminho, a.content, { contentType: a.contentType || undefined, upsert: true })
          if (error) throw new Error(`Não consegui guardar o anexo ${nome}: ${error.message}`)
          anexos.push({ nome, caminho, tipo: a.contentType ?? '', tamanho: a.size ?? a.content.length })
        }
        const de = mail.from?.value?.[0]
        const dados = {
          id,
          uid,
          messageId: mail.messageId ?? null,
          de: de?.address ?? '',
          deNome: de?.name ?? '',
          assunto: mail.subject ?? '(sem assunto)',
          data: (mail.date ?? msg.envelope?.date ?? new Date()).toISOString(),
          texto: (mail.text ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000),
          anexos,
          estado: 'nova',
          recebidoEm: new Date().toISOString(),
        }
        const { error } = await supabase.from('documentos').upsert({ colecao: 'emails', id, dados })
        if (error) throw new Error(`Base de dados: ${error.message}`)
        novos.push({ id, assunto: dados.assunto, de: dados.de, anexos: anexos.length })
      }
    } finally {
      lock.release()
    }
    return resposta({ ok: true, novos, candidatos, restantes, dias })
  } catch (e) {
    console.error(e)
    const m = e instanceof Error ? e.message : String(e)
    const amigavel = /AUTHENTICATIONFAILED|Invalid credentials|authentication failed|LOGIN failed/i.test(m)
      ? 'O servidor de email recusou o utilizador ou a palavra-passe (EMAIL_USER / EMAIL_PASSWORD).'
      : /ENOTFOUND|getaddrinfo|ECONNREFUSED|timed? ?out/i.test(m)
        ? `Não consegui chegar ao servidor de email (${env('EMAIL_IMAP_HOST')}:${env('EMAIL_IMAP_PORT') || 993}). Confirme o EMAIL_IMAP_HOST e a porta.`
        : m
    return resposta({ erro: amigavel }, 500)
  } finally {
    try { await imap?.logout() } catch { /* já fechada */ }
  }
})
