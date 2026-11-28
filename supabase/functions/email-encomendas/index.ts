// Supabase Edge Function «email-encomendas» — lê a caixa de correio por IMAP e recolhe os emails de encomendas.
// SÓ LEITURA na caixa: abre a pasta em modo de leitura e não marca nada como lido, não move nem apaga.
// Para cada email de encomenda novo: regista o email; os anexos são recolhidos depois, aos poucos (ação «rebuscar»,
// ver «Recolha dos anexos») — PDF, Excel e imagens (a IA lê), ficheiros de dentro dos zips e moldes DXF (só para descarregar),
// guardados no bucket «documentos» (pasta email/…). O email fica na tabela «documentos», coleção «emails».
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
//   Um email entra se tiver anexo Excel, PDF ou zip E (sem filtros, ou se coincidir com algum remetente ou palavra).
// Ação «rebuscar» (emailId, recomecar?): um passo da recolha dos anexos; repetir até «concluido». A aplicação chama-a
// sozinha para os emails novos e no botão «Buscar anexos outra vez» (recomecar: true).
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
const IMAGEM = /\.(png|jpe?g|webp|gif)$/i
// Regras dos anexos — cópia de src/lib/anexosEmail.ts (o teste anexos-email.spec.ts confirma que são iguais).
// ==== INÍCIO anexosEmail ====
/** ler = a IA lê (PDF, Excel, imagens) · zip = abre-se e trata-se cada ficheiro · guardar = fica para descarregar (moldes DXF…) · ignorar */
export type DestinoAnexo = 'ler' | 'zip' | 'guardar' | 'ignorar'
export type AnexoNaoGuardado = { nome: string; tamanho: number; motivo: string }
/** formatos que a IA lê */
export const ANEXO_LIDO = /\.(xlsx|xlsm|xls|csv|pdf|png|jpe?g|webp|gif)$/i
/** anexos que contam como «documento» para uma encomenda ou fatura entrar (os zips podem trazer os PDFs) */
export const DOCUMENTO_EMAIL = /\.(xlsx|xlsm|xls|csv|pdf|zip)$/i
const IMAGEM_ANEXO = /\.(png|jpe?g|webp|gif)$/i
/** lixo do Mac e do Windows, dentro e fora de zips */
export const LIXO_ANEXO = /(^|\/)(__MACOSX\/|\._[^/]*$|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i
/** ficheiros que os programas de email acrescentam e que não são do cliente */
const RUIDO_EMAIL = /^(ATT\d+\.(htm|html|txt)|smime\.p7s|winmail\.dat)$|\.(p7s|vcf|ics)$/i

/** O que fazer com um anexo. Fora de zips, imagens no corpo do email (assinaturas, logótipos) não são anexos. */
export function destinoAnexo(a: { nome: string; disposicao?: string; relacionado?: boolean; dentroDeZip?: boolean }): DestinoAnexo {
  const caminho = (a.nome ?? '').trim()
  const nome = caminho.split('/').pop() ?? ''
  if (!nome || caminho.endsWith('/') || LIXO_ANEXO.test(caminho) || RUIDO_EMAIL.test(nome)) return 'ignorar'
  if (!a.dentroDeZip && IMAGEM_ANEXO.test(nome)
    && (a.relacionado || (a.disposicao ?? '').toLowerCase() !== 'attachment' || /^image\d{3}\.|assinatura|signature|logo/i.test(nome))) return 'ignorar'
  if (/\.zip$/i.test(nome)) return a.dentroDeZip ? 'guardar' : 'zip' // zips dentro de zips ficam inteiros
  return ANEXO_LIDO.test(nome) ? 'ler' : 'guardar'
}

/** Zips feitos no Mac guardam os nomes em UTF-8 sem o indicar: o leitor mostra «CALÃ\u0087AS» em vez de «CALÇAS». */
export function corrigirNomeZip(nome: string): string {
  if (!/[\u0080-ÿ]/.test(nome) || /[^\u0000-ÿ]/.test(nome)) return nome.normalize('NFC')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(nome, (c) => c.charCodeAt(0))).normalize('NFC')
  } catch { return nome.normalize('NFC') }
}

/** Decide, ficheiro a ficheiro, o que se tira de um zip (sem rebentar com a memória do servidor). */
export function filtroZip(limites = { entradas: 300, total: 150 * 1024 * 1024, parte: 30 * 1024 * 1024 }) {
  const recusados: AnexoNaoGuardado[] = []
  let n = 0, total = 0
  const aceitar = (caminho: string, tamanho: number) => {
    if (destinoAnexo({ nome: caminho, dentroDeZip: true }) === 'ignorar') return false
    const nome = corrigirNomeZip(caminho.split('/').pop() ?? caminho)
    if (tamanho > limites.parte) { recusados.push({ nome, tamanho, motivo: 'grande demais' }); return false }
    if (n >= limites.entradas || total + tamanho > limites.total) { recusados.push({ nome, tamanho, motivo: 'o zip é grande demais' }); return false }
    n++; total += tamanho
    return true
  }
  return { aceitar, recusados }
}

/** Pasta de origem de um ficheiro tirado de um zip, para mostrar: «Breedys.zip › 3 CALÇAS (1)». */
export function origemZip(nomeZip: string, caminho: string): string {
  const pastas = corrigirNomeZip(caminho).split('/').slice(0, -1).filter(Boolean)
  // a pasta com o mesmo nome do zip (o Mac cria-a sempre) não acrescenta nada
  if (pastas[0] && pastas[0].toLowerCase() === nomeZip.replace(/\.zip$/i, '').toLowerCase()) pastas.shift()
  return [nomeZip, ...pastas].join(' › ')
}
/** Ficheiro dentro de um zip, lido do diretório central (sem descomprimir nada). */
export type EntradaZip = { caminho: string; metodo: number; comprimido: number; tamanho: number; offset: number }

/** Lê a lista de ficheiros de um zip. Não usa bibliotecas: o servidor tem pouco tempo de processador. */
export function lerDiretorioZip(b: Uint8Array): EntradaZip[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let fim = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { fim = i; break }
  if (fim < 0) throw new Error('não é um zip válido')
  const total = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  if (p === 0xffffffff || total === 0xffff) throw new Error('zip64 (maior que 4 GB) não suportado')
  const r: EntradaZip[] = []
  for (let k = 0; k < total; k++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('zip danificado')
    const flags = v.getUint16(p + 8, true), metodo = v.getUint16(p + 10, true)
    const comprimido = v.getUint32(p + 20, true), tamanho = v.getUint32(p + 24, true)
    const n = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comentario = v.getUint16(p + 32, true)
    const offset = v.getUint32(p + 42, true)
    const bytes = b.subarray(p + 46, p + 46 + n)
    let caminho: string
    try { caminho = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { caminho = String.fromCharCode(...bytes) }
    if (!(flags & 0x800)) caminho = corrigirNomeZip(caminho)
    r.push({ caminho: caminho.normalize('NFC'), metodo, comprimido, tamanho, offset })
    p += 46 + n + extra + comentario
  }
  return r
}

/** Tira um ficheiro de um zip (guardado ou deflate), com a descompressão nativa do servidor/browser. */
export async function extrairDoZip(b: Uint8Array, e: EntradaZip): Promise<Uint8Array> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (v.getUint32(e.offset, true) !== 0x04034b50) throw new Error(`zip danificado em ${e.caminho}`)
  const inicio = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true)
  const dados = b.subarray(inicio, inicio + e.comprimido)
  if (e.metodo === 0) return dados.slice()
  if (e.metodo !== 8) throw new Error(`compressão não suportada em ${e.caminho}`)
  const fluxo = new Blob([dados as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}
// ==== FIM anexosEmail ====
const MAX_POR_VEZ = 4 // emails novos tratados por chamada (o resto fica para a seguinte; a aplicação volta a chamar)
// cada anexo até 30 MB (o email pode ser maior: os anexos descarregam-se um a um); os maiores ficam registados
// com o nome e o tamanho, para abrir no Thunderbird
const MAX_PARTE = 30 * 1024 * 1024

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

type AnexoGuardado = { nome: string; caminho: string; tipo: string; tamanho: number; origem?: string }
const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', xls: 'application/vnd.ms-excel',
  zip: 'application/zip',
}
const mimeDe = (nome: string) => MIME[(nome.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream'

// ---------- Recolha dos anexos, aos poucos ----------
// O Supabase só dá ~2 s de processador por chamada: descarregar e abrir um zip de vários MB de uma vez passa o limite.
// Por isso a recolha é feita em passos (a aplicação chama a ação «rebuscar» até vir «concluido»), com o estado guardado
// no próprio email (campo «recolha»):
//   · cada anexo do email é uma tarefa; um zip é primeiro guardado inteiro no bucket (pasta email/<id>/tmp/) e depois
//     cada ficheiro lá dentro é outra tarefa (descompressão nativa, sem bibliotecas);
//   · cada chamada faz uma tarefa pesada ou várias pequenas (até ORCAMENTO bytes);
//   · uma tarefa que falha 2 vezes (ex.: tempo de processador) passa a «não guardado», para nunca ficar presa.
type Tarefa =
  | { tipo: 'parte'; part: string; nome: string; mime?: string; tamanho: number; disposicao?: string; tentativas?: number }
  | { tipo: 'zip'; zip: string; nomeZip: string; entrada: EntradaZip; tentativas?: number }
type Recolha = { uid: number; tarefas: Tarefa[]; total: number; i: number; anexos: AnexoGuardado[]; naoGuardados: AnexoNaoGuardado[]; antigos: string[]; temporarios: string[]; inicio: string }
const ORCAMENTO = 6 * 1024 * 1024
const tamanhoTarefa = (t: Tarefa) => (t.tipo === 'parte' ? Math.round(t.tamanho / 1.37) : t.entrada.tamanho)

/** Encontra o email na caixa (pelo número guardado ou pelo Message-ID) e devolve o número e a estrutura. */
async function encontrarNaCaixa(imap: ImapFlow, c: Conta, emailId: string, messageId?: string | null) {
  const m = /^c(\d+)-(.*)-(\d+)$/.exec(emailId)
  const validade = String((imap.mailbox && typeof imap.mailbox === 'object' ? imap.mailbox.uidValidity : '') ?? '')
  const candidatos: number[] = []
  if (m && m[2] === validade) candidatos.push(Number(m[3]))
  if (messageId) {
    try {
      const r = await imap.search({ header: { 'message-id': messageId } }, { uid: true })
      if (r) candidatos.push(...r)
    } catch (x) { console.error('pesquisa message-id', x) }
  }
  for (const uid of [...new Set(candidatos)]) {
    const msg = await imap.fetchOne(String(uid), { uid: true, envelope: true, bodyStructure: true }, { uid: true })
    if (!msg || !msg.bodyStructure) continue
    if (messageId && msg.envelope?.messageId && msg.envelope.messageId !== messageId) continue // o número foi reutilizado
    return { uid, nos: folhas(msg.bodyStructure as No) }
  }
  throw new Error(`Não encontrei este email na pasta ${c.pasta} da conta ${c.user}: pode ter sido movido ou apagado no Thunderbird.`)
}

/** Lista de tarefas a partir da estrutura do email (sem descarregar nada). */
const tarefasDe = (nos: No[]): Tarefa[] => nos
  .filter((n) => n.part && nomeDe(n) && destinoAnexo({ nome: nomeDe(n), disposicao: n.disposition }) !== 'ignorar')
  .map((n) => ({ tipo: 'parte', part: n.part!, nome: nomeDe(n), mime: n.type, tamanho: n.size ?? 0, disposicao: n.disposition }))

/** Um passo da recolha dos anexos de um email. Só leitura na caixa de correio. */
async function passoRecolha(supabase: SupabaseCliente, lista: Conta[], emailId: string, recomecar: boolean) {
  const t0 = Date.now()
  const { data: linha, error } = await supabase.from('documentos').select('dados').eq('colecao', 'emails').eq('id', emailId).maybeSingle()
  if (error || !linha) throw new Error('Não encontrei este email.')
  let e = linha.dados as Record<string, unknown> & { conta?: string; messageId?: string | null; anexos?: AnexoGuardado[]; recolha?: Recolha }
  const gravar = async (dados: typeof e) => {
    const { error: x } = await supabase.from('documentos').upsert({ colecao: 'emails', id: emailId, dados })
    if (x) throw new Error(`base de dados: ${x.message}`)
    e = dados
  }
  const m = /^c(\d+)-/.exec(emailId)
  const c = lista.find((x) => (e.conta ?? '').toLowerCase() === x.user.toLowerCase()) ?? lista.find((x) => m && x.n === Number(m[1]))
  if (!c) throw new Error(`A conta ${e.conta ?? ''} já não está configurada nos segredos do Supabase.`)

  let imap: ImapFlow | null = null
  let lock: { release: () => void } | null = null
  const abrirCaixa = async () => {
    if (imap) return imap
    imap = cliente(c)
    await imap.connect()
    lock = await imap.getMailboxLock(c.pasta, { readOnly: true })
    return imap
  }
  try {
    // 1.º passo: lista de tarefas (rápido)
    if (recomecar || !e.recolha) {
      const caixa = await abrirCaixa()
      const { uid, nos } = await encontrarNaCaixa(caixa, c, emailId, e.messageId)
      const tarefas = tarefasDe(nos)
      const recolha: Recolha = {
        uid, tarefas, total: tarefas.length, i: 0, anexos: [], naoGuardados: [],
        antigos: [...(e.anexos ?? []).map((a) => a.caminho), ...(e.recolha?.anexos ?? []).map((a) => a.caminho), ...(e.recolha?.temporarios ?? [])],
        temporarios: [], inicio: new Date().toISOString(),
      }
      await gravar({ ...e, recolha, anexosPendentes: true })
      console.log('recolha', emailId, 'tarefas', tarefas.length, `${Date.now() - t0}ms`)
    }
    const r = e.recolha!
    const zips = new Map<string, Uint8Array>()
    const guardar = async (nome: string, conteudo: Uint8Array, tipo: string, origem?: string) => {
      const caminho = `email/${emailId}/${r.i++}-${nomeFicheiro(nome)}`
      const { error: x } = await supabase.storage.from('documentos').upload(caminho, conteudo, { contentType: tipo || undefined, upsert: true })
      if (x) { r.naoGuardados.push({ nome, tamanho: conteudo.length, motivo: `não ficou guardado (${x.message})` }); return }
      r.anexos.push({ nome, caminho, tipo, tamanho: conteudo.length, ...(origem ? { origem } : {}) })
    }
    let gasto = 0
    while (r.tarefas.length) {
      const t = r.tarefas[0]
      const peso = tamanhoTarefa(t)
      if (gasto > 0 && gasto + peso > ORCAMENTO) break
      const nomeT = t.tipo === 'parte' ? t.nome : corrigirNomeZip(t.entrada.caminho.split('/').pop() ?? t.entrada.caminho)
      if ((t.tentativas ?? 0) >= 2) {
        r.tarefas.shift()
        r.naoGuardados.push({ nome: nomeT, tamanho: peso, motivo: `o servidor não conseguiu tratar este ficheiro${t.tipo === 'zip' ? ` (dentro de ${t.nomeZip})` : ''}` })
        continue
      }
      if (peso > MAX_PARTE) { r.tarefas.shift(); r.naoGuardados.push({ nome: nomeT, tamanho: peso, motivo: 'grande demais' }); continue }
      // tarefa pesada: marcar a tentativa antes (se o servidor a cortar a meio, à 2.ª falha passa à frente)
      if (peso > 1024 * 1024) { t.tentativas = (t.tentativas ?? 0) + 1; await gravar({ ...e, recolha: r }) }
      const t1 = Date.now()
      if (t.tipo === 'parte') {
        let conteudo: Uint8Array
        try {
          const caixa = await abrirCaixa()
          const d = await caixa.download(String(r.uid), t.part, { uid: true })
          conteudo = await lerTudo(d.content, MAX_PARTE + 1)
        } catch (x) {
          console.error('anexo', emailId, t.nome, x)
          r.tarefas.shift(); r.naoGuardados.push({ nome: t.nome, tamanho: peso, motivo: 'não foi possível descarregar' }); continue
        }
        r.tarefas.shift()
        if (conteudo.length > MAX_PARTE) { r.naoGuardados.push({ nome: t.nome, tamanho: conteudo.length, motivo: 'grande demais' }); continue }
        if (destinoAnexo({ nome: t.nome, disposicao: t.disposicao }) === 'zip') {
          // guardar o zip inteiro (temporário) e acrescentar uma tarefa por ficheiro útil lá dentro
          let entradas: EntradaZip[] = []
          try { entradas = lerDiretorioZip(conteudo) } catch (x) {
            await guardar(t.nome, conteudo, 'application/zip')
            r.naoGuardados.push({ nome: t.nome, tamanho: conteudo.length, motivo: `o zip não abriu (${x instanceof Error ? x.message : x}); está guardado inteiro` })
            continue
          }
          const zip = `email/${emailId}/tmp/${r.i++}-${nomeFicheiro(t.nome)}`
          const { error: x } = await supabase.storage.from('documentos').upload(zip, conteudo, { contentType: 'application/zip', upsert: true })
          if (x) { r.naoGuardados.push({ nome: t.nome, tamanho: conteudo.length, motivo: `não ficou guardado (${x.message})` }); continue }
          r.temporarios.push(zip)
          zips.set(zip, conteudo)
          const filtro = filtroZip()
          const novas: Tarefa[] = entradas.filter((en) => filtro.aceitar(en.caminho, en.tamanho)).map((entrada) => ({ tipo: 'zip', zip, nomeZip: t.nome, entrada }))
          r.tarefas.unshift(...novas)
          r.total += novas.length
          r.naoGuardados.push(...filtro.recusados.map((f) => ({ ...f, motivo: `${f.motivo} (dentro de ${t.nome})` })))
        } else {
          await guardar(t.nome, conteudo, t.mime && t.mime !== 'application/octet-stream' ? t.mime : mimeDe(t.nome))
        }
      } else {
        let zip = zips.get(t.zip)
        if (!zip) {
          const { data: f, error: x } = await supabase.storage.from('documentos').download(t.zip)
          if (x || !f) { r.tarefas.shift(); r.naoGuardados.push({ nome: nomeT, tamanho: peso, motivo: `não foi possível reabrir ${t.nomeZip}` }); continue }
          zip = new Uint8Array(await f.arrayBuffer())
          zips.set(t.zip, zip)
        }
        let conteudo: Uint8Array
        try { conteudo = await extrairDoZip(zip, t.entrada) } catch (x) {
          r.tarefas.shift(); r.naoGuardados.push({ nome: nomeT, tamanho: peso, motivo: `${x instanceof Error ? x.message : x} (dentro de ${t.nomeZip})` }); continue
        }
        r.tarefas.shift()
        await guardar(nomeT, conteudo, mimeDe(nomeT), origemZip(t.nomeZip, t.entrada.caminho))
      }
      gasto += Math.max(peso, 64 * 1024)
      console.log('anexo', emailId, nomeT, peso, `${Date.now() - t1}ms`)
    }

    if (r.tarefas.length) {
      await gravar({ ...e, recolha: r })
      return { concluido: false, feitos: r.total - r.tarefas.length, total: r.total }
    }
    // fim: trocar a lista de anexos e apagar os ficheiros que deixaram de servir (antigos e zips temporários)
    const novos = new Set(r.anexos.map((a) => a.caminho))
    const apagar = [...r.antigos, ...r.temporarios].filter((x) => x && !novos.has(x))
    if (apagar.length) await supabase.storage.from('documentos').remove(apagar)
    const { recolha: _feita, ...resto } = e
    await gravar({ ...resto, anexos: r.anexos, anexosNaoGuardados: r.naoGuardados, anexosPendentes: false, anexosRecolhidosEm: new Date().toISOString() })
    console.log('recolha concluída', emailId, r.anexos.length, 'anexos', `${Date.now() - t0}ms`)
    return { concluido: true, feitos: r.total, total: r.total, anexos: r.anexos, naoGuardados: r.naoGuardados }
  } finally {
    try { (lock as { release: () => void } | null)?.release() } catch { /* já libertado */ }
    try { await (imap as ImapFlow | null)?.logout() } catch { /* já fechada */ }
  }
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
        const temDocumento = nomes.some((n) => DOCUMENTO_EMAIL.test(n))
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
        // anexos: não se descarregam aqui (limite de processador); ficam por recolher e a aplicação pede a ação «rebuscar»
        const porRecolher = tarefasDe(nos).length
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
          anexos: [],
          ...(porRecolher ? { anexosPendentes: true } : {}),
          estado: 'nova',
          recebidoEm: new Date().toISOString(),
        }
        const { error } = await supabase.from('documentos').upsert({ colecao: 'emails', id, dados })
        if (error) throw new Error(`base de dados: ${error.message}`)
        jaVistos.add(id)
        if (dados.messageId) jaVistos.add(`mid:${dados.messageId}`)
        novos.push({ id, conta: c.user, assunto: dados.assunto, de: dados.de, anexos: porRecolher, tipo: dados.tipo })
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

    const pedido = await req.json() as { acao: 'testar' | 'verificar' | 'responder' | 'rebuscar'; emailId?: string; texto?: string; reclassificar?: boolean; recomecar?: boolean }
    const { acao } = pedido
    const lista = contas()

    if (acao === 'rebuscar') {
      if (!pedido.emailId) return resposta({ erro: 'Falta o email.' }, 400)
      try {
        return resposta({ ok: true, ...(await passoRecolha(supabase, lista, pedido.emailId, !!pedido.recomecar)) })
      } catch (e) {
        const c = lista.find((x) => pedido.emailId?.startsWith(`c${x.n}-`)) ?? lista[0]
        return resposta({ erro: amigavel(c, e) }, 500)
      }
    }
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
