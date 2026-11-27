// Supabase Edge Function «email-encomendas» — lê a caixa de correio por IMAP e recolhe os emails de encomendas.
// SÓ LEITURA na caixa: abre a pasta em modo de leitura e não marca nada como lido, não move nem apaga.
// Para cada email de encomenda novo: guarda os anexos (Excel, PDF, imagens) no bucket «documentos»
// (pasta email/…) e regista o email na tabela «documentos», coleção «emails», para rever na aplicação.
//
// Segredos (Supabase → Edge Functions → Secrets), uma série por conta de email:
//   1.ª conta: EMAIL_IMAP_HOST, EMAIL_USER, EMAIL_PASSWORD  (opcionais: EMAIL_IMAP_PORT, por omissão 993; EMAIL_PASTA, por omissão INBOX)
//   2.ª conta: EMAIL_2_IMAP_HOST, EMAIL_2_USER, EMAIL_2_PASSWORD  (EMAIL_2_IMAP_PORT, EMAIL_2_PASTA)
//   3.ª conta: EMAIL_3_…  e assim por diante, até EMAIL_9_…
//   IMAP_HOST = servidor que aparece no Thunderbird (Definições da conta → Definições do servidor → Nome do servidor).
//   PASSWORD  = de preferência uma palavra-passe de aplicação só para isto.
//   Envio (responder): por omissão usa o mesmo servidor do IMAP, porta 465 (SSL/TLS), mesmo utilizador e palavra-passe.
//   Se for diferente: EMAIL_SMTP_HOST / EMAIL_SMTP_PORT (EMAIL_2_SMTP_HOST, …). O Supabase bloqueia a porta 587.
//
// Filtros (na aplicação, página «Emails de encomendas»; guardados em documentos/configuracao/email):
//   remetentes: partes do endereço ou do nome (ex.: «whitecotton», «@cliente.pt»)
//   palavras:      palavras no assunto (ex.: «encomenda», «order», «pedido»)
//   palavrasTexto: palavras no texto da mensagem — só as inequívocas (ex.: «encomenda», «tech pack»)
//   palavrasFaturas / palavrasFaturasTexto: o mesmo para faturas e recibos verdes de fornecedores (tipo «fatura»)
//   palavrasPedidos / palavrasPedidosTexto: pedidos de preço/cotação de produção ou amostra (tipo «pedido», página «Emails de pedidos»;
//                  não precisam de anexo)
//   Um email entra se tiver anexo Excel ou PDF E (sem filtros, ou se coincidir com algum remetente ou palavra).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { ImapFlow } from 'npm:imapflow@1'
import nodemailer from 'npm:nodemailer@6'
import MailComposer from 'npm:nodemailer@6/lib/mail-composer/index.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const ANEXO_UTIL = /\.(xlsx|xlsm|xls|csv|pdf|png|jpe?g|webp)$/i
const DOCUMENTO = /\.(xlsx|xlsm|xls|csv|pdf)$/i
const IMAGEM = /\.(png|jpe?g|webp|gif)$/i
// imagens da assinatura / do corpo do email (image001.png, logótipos…) não são anexos da encomenda
const imagemDoCorpo = (a: { filename?: string; contentDisposition?: string; related?: boolean; cid?: string }) =>
  IMAGEM.test(a.filename ?? '') && (a.related || a.contentDisposition !== 'attachment' || /^image\d{3}\.|assinatura|signature|logo/i.test(a.filename ?? ''))
const MAX_POR_VEZ = 4 // emails novos tratados por chamada (o resto fica para a seguinte; a aplicação volta a chamar)
const MAX_BYTES = 15 * 1024 * 1024

type Conta = { n: number; host: string; port: number; user: string; pass: string; pasta: string; smtpHost: string; smtpPort: number }
function contas(): Conta[] {
  const r: Conta[] = []
  for (let n = 1; n <= 9; n++) {
    const pre = n === 1 ? ['EMAIL_', 'EMAIL_1_'] : [`EMAIL_${n}_`]
    const v = (k: string) => pre.map((p) => env(p + k)).find(Boolean) ?? ''
    const pass = pre.map((p) => Deno.env.get(p + 'PASSWORD') ?? '').find(Boolean) ?? ''
    const host = v('IMAP_HOST'), user = v('USER')
    if (!host && !user && !pass) continue
    if (!host || !user || !pass) throw new Error(`Conta ${n}: falta ${!host ? 'IMAP_HOST' : !user ? 'USER' : 'PASSWORD'} nos segredos do Supabase (${pre[pre.length - 1]}…).`)
    r.push({ n, host, user, pass, port: Number(v('IMAP_PORT') || 993), pasta: v('PASTA') || 'INBOX', smtpHost: v('SMTP_HOST') || host, smtpPort: Number(v('SMTP_PORT') || 465) })
  }
  if (!r.length) throw new Error('Faltam os segredos do email no Supabase (EMAIL_IMAP_HOST, EMAIL_USER, EMAIL_PASSWORD).')
  return r
}
const cliente = (c: Conta) => new ImapFlow({
  host: c.host, port: c.port, secure: c.port === 993, auth: { user: c.user, pass: c.pass }, logger: false,
  socketTimeout: 60_000, greetingTimeout: 20_000,
})
const amigavel = (c: Conta, e: unknown) => {
  // o ImapFlow guarda a resposta exata do servidor em responseText / serverResponseCode
  const x = e as { message?: string; responseText?: string; serverResponseCode?: string; authenticationFailed?: boolean }
  const servidor = [x?.serverResponseCode, x?.responseText].filter(Boolean).join(' ')
  const m = `${e instanceof Error ? e.message : String(e)}${servidor ? ` (${servidor})` : ''}`
  return x?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|authentication failed|LOGIN failed/i.test(m)
    ? `o servidor recusou o utilizador ou a palavra-passe${servidor ? `. Resposta do servidor: «${servidor}»` : ''} (utilizador usado: «${c.user}», servidor ${c.host}:${c.port}, palavra-passe com ${c.pass.length} caracteres).`
    : /ENOTFOUND|getaddrinfo|ECONNREFUSED|timed? ?out/i.test(m)
      ? `não consegui chegar ao servidor ${c.host}:${c.port}. Confirme o IMAP_HOST e a porta.`
      : m
}

const nomeFicheiro = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'anexo'

type Assinatura = { nome?: string; texto?: string; imagem?: string }
type No = { part?: string; type?: string; size?: number; disposition?: string; dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; childNodes?: No[] }
const folhas = (n?: No, r: No[] = []): No[] => { if (!n) return r; if (n.childNodes?.length) for (const f of n.childNodes) folhas(f, r); else r.push(n); return r }
const nomeDe = (n: No) => n.dispositionParameters?.filename ?? n.parameters?.name ?? ''
async function lerTudo(stream: AsyncIterable<Uint8Array>, max: number): Promise<Uint8Array> {
  const partes: Uint8Array[] = []; let total = 0
  for await (const p of stream) { partes.push(p); total += p.length; if (total > max) break }
  const r = new Uint8Array(Math.min(total, max)); let o = 0
  for (const p of partes) { const q = p.subarray(0, Math.max(0, r.length - o)); r.set(q, o); o += q.length; if (o >= r.length) break }
  return r
}

type Config = { remetentes?: string[]; palavras?: string[]; palavrasTexto?: string[]; palavrasFaturas?: string[]; palavrasFaturasTexto?: string[]; palavrasPedidos?: string[]; palavrasPedidosTexto?: string[]; palavrasPedidosExcluir?: string[]; dias?: number; assinaturas?: Record<string, Assinatura> }

type Novo = { id: string; conta: string; assunto: string; de: string; anexos: number; tipo?: string }
type Tipo = 'fatura' | 'encomenda' | 'pedido'
type Filtros = { remetentes: string[]; palavras: string[]; palavrasTexto: string[]; palavrasFaturas: string[]; palavrasFaturasTexto: string[]; palavrasPedidos: string[]; palavrasPedidosTexto: string[]; palavrasPedidosExcluir: string[]; dias: number }
// pedidos de preço / cotação de produção ou amostra (PT, EN, FR, ES); editáveis em «Emails de pedidos»
const PEDIDOS_ASSUNTO = ['pedido', 'cotação', 'cotacao', 'cotações', 'cotacoes', 'orçamento', 'orcamento', 'preço', 'preco', 'preços', 'precos',
  'price', 'prices', 'pricing', 'quotation', 'quote', 'rfq', 'costing', 'amostra', 'amostras', 'sample', 'samples', 'proto', 'devis', 'prix', 'presupuesto', 'cotización', 'precio']
const PEDIDOS_TEXTO = ['pedido de cotação', 'pedido de cotacao', 'pedido de orçamento', 'pedido de orcamento', 'pedido de preço', 'pedido de preco', 'pedido de amostra',
  'preço', 'qual o preço', 'qual o valor', 'quanto custa', 'preço por peça', 'preço unitário', 'cotação', 'orçamento para',
  'price request', 'request for quotation', 'please quote', 'best price', 'target price', 'price per piece', 'unit price', 'your price', 'quotation', 'costing',
  'demande de prix', 'devis', 'presupuesto', 'cotización']
// assuntos que nunca são pedidos de preço (faturas, pagamentos, documentação, publicidade)
const PEDIDOS_EXCLUIR = ['fatura', 'factura', 'faturas', 'invoice', 'liquidação', 'liquidacao', 'pagamento', 'payment', 'recibo', 'nota de crédito',
  'documentação', 'documentacao', 'apoio', 'apoios', 'newsletter', 'webinar', 'promoção', 'promocao', 'desconto', 'status update']
type SupabaseCliente = ReturnType<typeof createClient>

/** Recolhe os emails de encomendas novos de uma conta. Devolve quantos ficaram por tratar (limite por chamada). */
async function verificarConta(c: Conta, supabase: SupabaseCliente, filtros: Filtros,
  jaVistos: Set<string>, limite: number, novos: Novo[]): Promise<number> {
  const imap = cliente(c)
  await imap.connect()
  try {
    const lock = await imap.getMailboxLock(c.pasta, { readOnly: true })
    try {
      const validade = String((imap.mailbox && typeof imap.mailbox === 'object' ? imap.mailbox.uidValidity : '') ?? '')
      const chave = (uid: number) => `c${c.n}-${validade}-${uid}`
      const desde = new Date(Date.now() - filtros.dias * 864e5)
      const uids = (await imap.search({ since: desde }, { uid: true })) || []
      // palavras no assunto OU na mensagem: a pesquisa é feita pelo próprio servidor de email (não descarrega nada)
      const comPalavra = new Set<number>()
      const comFatura = new Set<number>()
      const comPedido = new Set<number>()
      const pesquisar = async (criterios: Record<string, string>[], destino: Set<number>) => {
        if (uids.length) for (const criterio of criterios) {
          try {
            const r = await imap.search({ since: desde, ...criterio }, { uid: true })
            if (r) for (const u of r) destino.add(u)
          } catch (e) { console.error('pesquisa', criterio, e) }
        }
      }
      await pesquisar([...filtros.palavras.map((p) => ({ subject: p })), ...filtros.palavrasTexto.map((p) => ({ body: p }))], comPalavra)
      await pesquisar([...filtros.palavrasFaturas.map((p) => ({ subject: p })), ...filtros.palavrasFaturasTexto.map((p) => ({ body: p }))], comFatura)
      await pesquisar([...filtros.palavrasPedidos.map((p) => ({ subject: p })), ...filtros.palavrasPedidosTexto.map((p) => ({ body: p }))], comPedido)
      // 1.º passo, leve: cabeçalhos e estrutura (sem descarregar o conteúdo)
      const escolhidos: number[] = []
      const tipos = new Map<number, Tipo>()
      const estrutura = new Map<number, { bs: No; env: { messageId?: string; subject?: string; date?: Date | string; from?: { name?: string; address?: string }[]; replyTo?: { address?: string }[] } }>()
      if (uids.length) for await (const m of imap.fetch(uids, { uid: true, envelope: true, bodyStructure: true, size: true }, { uid: true })) {
        if (jaVistos.has(chave(m.uid))) continue
        if (m.envelope?.messageId && jaVistos.has(`mid:${m.envelope.messageId}`)) continue // já veio por outra conta
        const de = (m.envelope?.from ?? []).map((a) => `${a.name ?? ''} <${a.address ?? ''}>`).join(', ').toLowerCase()
        const assunto = (m.envelope?.subject ?? '').toLowerCase()
        const nomes: string[] = []
        const percorrer = (n: { disposition?: string; dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; childNodes?: unknown[] } | undefined) => {
          if (!n) return
          const nome = n.dispositionParameters?.filename ?? n.parameters?.name
          if (nome && !(IMAGEM.test(nome) && (n.disposition ?? '').toLowerCase() !== 'attachment')) nomes.push(nome)
          for (const f of (n.childNodes ?? []) as typeof n[]) percorrer(f)
        }
        percorrer(m.bodyStructure as Parameters<typeof percorrer>[0])
        const temDocumento = nomes.some((n) => DOCUMENTO.test(n))
        const ehPedido = (comPedido.has(m.uid) || filtros.palavrasPedidos.some((p) => assunto.includes(p))) && !filtros.palavrasPedidosExcluir.some((p) => assunto.includes(p))
        // encomendas e faturas têm de trazer Excel ou PDF (as imagens sozinhas costumam ser assinaturas); pedidos de preço não
        if (!temDocumento && !ehPedido) continue
        const semFiltros = !filtros.remetentes.length && !filtros.palavras.length && !filtros.palavrasTexto.length
        const ehFatura = temDocumento && (comFatura.has(m.uid) || filtros.palavrasFaturas.some((p) => assunto.includes(p)))
        // palavras de encomenda «fortes» (as que não são também de pedido, ex.: «encomenda», «order»)
        const fortes = filtros.palavras.filter((p) => !filtros.palavrasPedidos.includes(p))
        const encomendaForte = temDocumento && fortes.some((p) => assunto.includes(p))
        const ehEncomenda = temDocumento && (semFiltros || filtros.remetentes.some((r) => de.includes(r)) || comPalavra.has(m.uid) || filtros.palavras.some((p) => assunto.includes(p)))
        if (!ehFatura && !ehEncomenda && !ehPedido) continue
        // «Fatura da encomenda X» é uma fatura: as palavras de fatura no assunto mandam
        const tipo: Tipo = ehFatura && ((!ehEncomenda && !ehPedido) || filtros.palavrasFaturas.some((p) => assunto.includes(p))) ? 'fatura'
          : ehPedido && !encomendaForte ? 'pedido' : ehEncomenda ? 'encomenda' : 'pedido'
        tipos.set(m.uid, tipo)
        if ((m.size ?? 0) > MAX_BYTES) continue
        escolhidos.push(m.uid)
        estrutura.set(m.uid, { bs: m.bodyStructure as No, env: (m.envelope ?? {}) as never })
      }
      escolhidos.sort((a, b) => a - b)
      const agora = escolhidos.slice(0, Math.max(0, limite))

      // 2.º passo: descarregar SÓ o texto e os anexos úteis de cada escolhido (BODY.PEEK: não marca como lido).
      // Não se descarrega o email inteiro: poupa memória e tempo no servidor.
      for (const uid of agora) {
        const id = chave(uid)
        const { bs, env } = estrutura.get(uid)!
        if (env.messageId && jaVistos.has(`mid:${env.messageId}`)) { jaVistos.add(id); continue }
        const nos = folhas(bs)
        // texto: text/plain (ou text/html sem etiquetas)
        const corpo = nos.find((n) => n.type === 'text/plain' && !nomeDe(n) && (n.disposition ?? '').toLowerCase() !== 'attachment')
          ?? nos.find((n) => n.type === 'text/html' && !nomeDe(n) && (n.disposition ?? '').toLowerCase() !== 'attachment')
        let texto = ''
        if (corpo?.part) {
          try {
            const d = await imap.download(String(uid), corpo.part, { uid: true, maxBytes: 200_000 })
            texto = new TextDecoder('utf-8').decode(await lerTudo(d.content, 200_000))
            if (corpo.type === 'text/html') texto = texto.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          } catch (e) { console.error('texto', uid, e) }
        } else if (bs?.part === undefined && bs?.type?.startsWith('text/')) {
          try { const d = await imap.download(String(uid), '1', { uid: true, maxBytes: 200_000 }); texto = new TextDecoder('utf-8').decode(await lerTudo(d.content, 200_000)) } catch { /* sem texto */ }
        }
        // anexos úteis (Excel, PDF; imagens só se forem anexo a sério)
        const anexos: { nome: string; caminho: string; tipo: string; tamanho: number }[] = []
        let i = 0
        for (const n of nos) {
          const nome = nomeDe(n)
          if (!nome || !n.part || !ANEXO_UTIL.test(nome)) continue
          if (IMAGEM.test(nome) && ((n.disposition ?? '').toLowerCase() !== 'attachment' || /^image\d{3}\.|assinatura|signature|logo/i.test(nome))) continue
          if ((n.size ?? 0) > MAX_BYTES * 1.4) continue // tamanho em base64
          const d = await imap.download(String(uid), n.part, { uid: true })
          const conteudo = await lerTudo(d.content, MAX_BYTES)
          const caminho = `email/${id}/${i++}-${nomeFicheiro(nome)}`
          const { error } = await supabase.storage.from('documentos').upload(caminho, conteudo, { contentType: n.type || undefined, upsert: true })
          if (error) throw new Error(`não consegui guardar o anexo ${nome}: ${error.message}`)
          anexos.push({ nome, caminho, tipo: n.type ?? '', tamanho: conteudo.length })
        }
        // cabeçalhos para responder na mesma conversa
        let references: string[] = [], responderPara: string | null = env.replyTo?.[0]?.address ?? null
        try {
          const h = await imap.fetchOne(String(uid), { headers: ['references'] }, { uid: true })
          const cab = h && h.headers ? new TextDecoder().decode(h.headers).replace(/\r?\n[ \t]+/g, ' ') : ''
          references = cab.match(/<[^<>\s]+>/g) ?? []
        } catch { /* sem cabeçalhos */ }
        const de = env.from?.[0]
        if (responderPara && de?.address && responderPara.toLowerCase() === de.address.toLowerCase()) responderPara = null
        const dados = {
          id, uid, conta: c.user, tipo: tipos.get(uid) ?? 'encomenda',
          messageId: env.messageId ?? null,
          references, responderPara,
          de: de?.address ?? '',
          deNome: de?.name ?? '',
          assunto: env.subject || '(sem assunto)',
          data: new Date(env.date ?? Date.now()).toISOString(),
          texto: texto.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000),
          anexos,
          estado: 'nova',
          recebidoEm: new Date().toISOString(),
        }
        const { error } = await supabase.from('documentos').upsert({ colecao: 'emails', id, dados })
        if (error) throw new Error(`base de dados: ${error.message}`)
        jaVistos.add(id)
        if (dados.messageId) jaVistos.add(`mid:${dados.messageId}`)
        novos.push({ id, conta: c.user, assunto: dados.assunto, de: dados.de, anexos: anexos.length, tipo: dados.tipo })
      }
      return escolhidos.length - agora.length
    } finally {
      lock.release()
    }
  } finally {
    try { await imap.logout() } catch { /* já fechada */ }
  }
}

const html = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

/** Envia uma resposta a um email recolhido, pela conta onde ele chegou, e guarda uma cópia na pasta Enviados. */
async function responder(supabase: SupabaseCliente, lista: Conta[], emailId: string, texto: string, quem: string) {
  const { data: linha, error } = await supabase.from('documentos').select('dados').eq('colecao', 'emails').eq('id', emailId).maybeSingle()
  if (error || !linha) throw new Error('Não encontrei este email.')
  const e = linha.dados as Record<string, unknown> & { conta?: string; de: string; deNome?: string; assunto: string; data: string; texto: string; messageId?: string | null; references?: string[]; responderPara?: string | null; respostas?: unknown[] }
  const c = lista.find((x) => x.user.toLowerCase() === (e.conta ?? '').toLowerCase()) ?? lista[0]
  const { data: cfgLinha } = await supabase.from('documentos').select('dados').eq('colecao', 'configuracao').eq('id', 'email').maybeSingle()
  const ass = ((cfgLinha?.dados ?? {}) as Config).assinaturas?.[c.user.toLowerCase()] ?? {}

  // imagem da assinatura (guardada no bucket pela aplicação), embutida no email
  const anexos: { filename: string; content: Uint8Array; cid: string; contentType?: string }[] = []
  if (ass.imagem) {
    const { data: img } = await supabase.storage.from('documentos').download(ass.imagem)
    if (img) anexos.push({ filename: ass.imagem.split('/').pop() ?? 'assinatura.png', content: new Uint8Array(await img.arrayBuffer()), cid: 'assinatura@pereiracruz', contentType: img.type || undefined })
  }
  const para = e.responderPara || e.de
  const assunto = /^(re|res|aw|sv)\s*:/i.test(e.assunto) ? e.assunto : `RE: ${e.assunto}`
  const quando = new Date(e.data).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })
  const citacao = `${quando}, ${e.deNome || e.de} escreveu:\n${e.texto}`
  const corpoHtml = `<div style="font-family:Arial,sans-serif;font-size:14px">${html(texto)}<br><br>`
    + (ass.texto ? `${html(ass.texto)}<br>` : '')
    + (anexos.length ? `<img src="cid:assinatura@pereiracruz" alt="" style="max-width:480px"><br>` : '')
    + `<br><div style="border-left:2px solid #ccc;padding-left:10px;color:#555">${html(citacao)}</div></div>`
  const corpoTexto = `${texto}\n\n${ass.texto ? `${ass.texto}\n` : ''}\n${citacao.split('\n').map((l) => `> ${l}`).join('\n')}`
  const references = [...(e.references ?? []), ...(e.messageId ? [e.messageId] : [])]
  const mensagem = {
    from: { name: ass.nome || 'Pereira & Cruz', address: c.user },
    to: para, subject: assunto, text: corpoTexto, html: corpoHtml, attachments: anexos,
    ...(e.messageId ? { inReplyTo: e.messageId, references } : {}),
  }
  const bruto: Uint8Array = await new Promise((ok, falha) => new MailComposer(mensagem).compile().build((err: Error | null, b: Uint8Array) => (err ? falha(err) : ok(b))))

  const transporte = nodemailer.createTransport({ host: c.smtpHost, port: c.smtpPort, secure: c.smtpPort === 465, auth: { user: c.user, pass: c.pass } })
  try {
    await transporte.sendMail({ envelope: { from: c.user, to: [para] }, raw: bruto })
  } catch (x) {
    const m = x instanceof Error ? x.message : String(x)
    throw new Error(/auth|535|credentials/i.test(m) ? `o servidor de envio recusou o utilizador ou a palavra-passe (${c.smtpHost}:${c.smtpPort}).`
      : /ENOTFOUND|ECONNREFUSED|timed? ?out|ETIMEDOUT/i.test(m) ? `não consegui chegar ao servidor de envio ${c.smtpHost}:${c.smtpPort}. Pode ser preciso o segredo SMTP_HOST.` : m)
  }

  // cópia em Enviados (para aparecer no Thunderbird); se falhar, a resposta já foi enviada na mesma
  let copiaEnviados = false
  const imap = cliente(c)
  try {
    await imap.connect()
    const pastas = await imap.list()
    const enviados = pastas.find((p) => p.specialUse === '\\Sent') ?? pastas.find((p) => /^(INBOX[./])?(sent|enviados|itens enviados|sent items|sent messages)$/i.test(p.path))
    if (enviados) { await imap.append(enviados.path, bruto, ['\\Seen']); copiaEnviados = true }
  } catch (x) { console.error('Enviados', x) } finally { try { await imap.logout() } catch { /* já fechada */ } }

  const resposta = { data: new Date().toISOString(), para, assunto, texto, conta: c.user, por: quem, copiaEnviados }
  await supabase.from('documentos').upsert({ colecao: 'emails', id: emailId, dados: { ...e, respostas: [...(e.respostas ?? []), resposta] } })
  return resposta
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)

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

    const pedido = await req.json() as { acao: 'testar' | 'verificar' | 'responder'; emailId?: string; texto?: string; reclassificar?: boolean }
    const { acao } = pedido
    const lista = contas()

    if (acao === 'responder') {
      if (!pedido.emailId || !pedido.texto?.trim()) return resposta({ erro: 'Falta o texto da resposta.' }, 400)
      const r = await responder(supabase, lista, pedido.emailId, pedido.texto.trim(), quem.user.email ?? quem.user.id)
      return resposta({ ok: true, resposta: r })
    }

    if (acao === 'testar') {
      const resultado = await Promise.all(lista.map(async (c) => {
        const imap = cliente(c)
        try {
          await imap.connect()
          const estado = await imap.status(c.pasta, { messages: true, unseen: true })
          return { conta: c.user, pasta: c.pasta, ok: true, mensagens: estado.messages ?? 0, porLer: estado.unseen ?? 0 }
        } catch (e) {
          return { conta: c.user, pasta: c.pasta, ok: false, erro: amigavel(c, e) }
        } finally {
          try { await imap.logout() } catch { /* já fechada */ }
        }
      }))
      return resposta({ ok: true, contas: resultado })
    }
    if (acao !== 'verificar') return resposta({ erro: 'Pedido inválido' }, 400)

    // filtros e emails já registados
    const { data: cfgLinha } = await supabase.from('documentos').select('dados').eq('colecao', 'configuracao').eq('id', 'email').maybeSingle()
    const cfg = (cfgLinha?.dados ?? {}) as Config
    const filtros: Filtros = {
      remetentes: (cfg.remetentes ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
      palavras: (cfg.palavras ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
      palavrasTexto: (cfg.palavrasTexto ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
      // faturas e recibos verdes de fornecedores (vão para «Faturas recebidas»)
      palavrasFaturas: (cfg.palavrasFaturas ?? ['fatura', 'factura', 'invoice', 'recibo', 'nota de crédito', 'nota de credito', 'faturação', 'facturação']).map((s) => s.trim().toLowerCase()).filter(Boolean),
      palavrasFaturasTexto: (cfg.palavrasFaturasTexto ?? ['recibo verde', 'fatura-recibo', 'fatura em anexo', 'segue a fatura', 'segue em anexo a fatura']).map((s) => s.trim().toLowerCase()).filter(Boolean),
      palavrasPedidos: (cfg.palavrasPedidos ?? PEDIDOS_ASSUNTO).map((s) => s.trim().toLowerCase()).filter(Boolean),
      palavrasPedidosTexto: (cfg.palavrasPedidosTexto ?? PEDIDOS_TEXTO).map((s) => s.trim().toLowerCase()).filter(Boolean),
      palavrasPedidosExcluir: (cfg.palavrasPedidosExcluir ?? PEDIDOS_EXCLUIR).map((s) => s.trim().toLowerCase()).filter(Boolean),
      dias: Math.min(Math.max(Number(cfg.dias) || 14, 1), 90),
    }
    // emails já guardados como encomenda (por tratar ou ignorados, sem encomenda criada) que afinal são pedidos de preço
    if (pedido.reclassificar) {
      const { data: antigos } = await supabase.from('documentos').select('id,dados').eq('colecao', 'emails')
      const fortes = filtros.palavras.filter((p) => !filtros.palavrasPedidos.includes(p))
      for (const l of antigos ?? []) {
        const e = l.dados as { tipo?: string; estado?: string; encomendaId?: string; assunto?: string; texto?: string }
        const assunto = (e.assunto ?? '').toLowerCase(), texto = (e.texto ?? '').toLowerCase()
        const excluido = filtros.palavrasPedidosExcluir.some((p) => assunto.includes(p))
        // pedidos por tratar que afinal são faturas, pagamentos, publicidade…: passam a ignorados
        if (e.tipo === 'pedido' && e.estado === 'nova' && excluido) {
          await supabase.from('documentos').upsert({ colecao: 'emails', id: l.id, dados: { ...e, estado: 'ignorada' } })
          continue
        }
        if ((e.tipo ?? 'encomenda') !== 'encomenda' || e.encomendaId || e.estado === 'tratada' || excluido) continue
        if (fortes.some((p) => assunto.includes(p))) continue
        if (filtros.palavrasPedidos.some((p) => assunto.includes(p)) || filtros.palavrasPedidosTexto.some((p) => texto.includes(p))) {
          await supabase.from('documentos').upsert({ colecao: 'emails', id: l.id, dados: { ...e, tipo: 'pedido', estado: 'nova' } })
        }
      }
    }
    const { data: existentes, error: eEx } = await supabase.from('documentos').select('id,mid:dados->>messageId').eq('colecao', 'emails')
    if (eEx) throw new Error(`Base de dados: ${eEx.message}`)
    const jaVistos = new Set((existentes ?? []).flatMap((l) => [l.id as string, ...(l.mid ? [`mid:${l.mid}`] : [])]))

    const novos: Novo[] = []
    const erros: { conta: string; erro: string }[] = []
    let restantes = 0
    for (const c of lista) {
      try {
        restantes += await verificarConta(c, supabase, filtros, jaVistos, MAX_POR_VEZ - novos.length, novos)
      } catch (e) {
        console.error(c.user, e)
        erros.push({ conta: c.user, erro: amigavel(c, e) })
      }
    }
    if (erros.length === lista.length) return resposta({ erro: erros.map((e) => `${e.conta}: ${e.erro}`).join(' · ') }, 500)
    return resposta({ ok: true, novos, restantes, erros, dias: filtros.dias })
  } catch (e) {
    console.error(e)
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500)
  }
})
