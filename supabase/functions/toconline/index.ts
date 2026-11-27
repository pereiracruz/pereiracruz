// Supabase Edge Function «toconline» — ligação à API do TOConline (Pereira's Project e Pereira & Cruz).
// FASE 1: leitura. FASE 2: cria RASCUNHOS de guias (GT), que se revêem e finalizam no TOConline. Testa a ligação e lê séries, documentos (guias, faturas), clientes, fornecedores e artigos,
// para copiar a estrutura exata antes de criar documentos fiscais (que não se podem apagar).
//
// Segredos (Supabase → Edge Functions → Secrets), por empresa: PP = Pereira's Project, PC = Pereira & Cruz
//   TOC_PP_CLIENT_ID, TOC_PP_CLIENT_SECRET, TOC_PP_OAUTH_URL, TOC_PP_API_URL  (e TOC_PP_REDIRECT_URL, se vier no email)
//   TOC_PC_CLIENT_ID, TOC_PC_CLIENT_SECRET, TOC_PC_OAUTH_URL, TOC_PC_API_URL  (e TOC_PC_REDIRECT_URL)
// Os valores vêm do TOConline: Empresa → Configurações → Dados API (link enviado ao integrador, válido 72 h).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

type Empresa = 'PP' | 'PC'
const cfg = (e: Empresa) => {
  const v = (k: string) => (Deno.env.get(`TOC_${e}_${k}`) ?? '').trim()
  return { id: v('CLIENT_ID'), segredo: v('CLIENT_SECRET'), oauth: v('OAUTH_URL').replace(/\/+$/, ''), api: v('API_URL').replace(/\/+$/, ''), redirect: v('REDIRECT_URL') }
}

// token em memória (válido 4 h; o refresh token só 8 h, por isso pede-se um novo quando expira)
const tokens = new Map<Empresa, { valor: string; ate: number }>()
async function token(e: Empresa): Promise<string> {
  const t = tokens.get(e)
  if (t && t.ate > Date.now() + 60_000) return t.valor
  const c = cfg(e)
  if (!c.id || !c.segredo || !c.oauth || !c.api) throw new Error(`Faltam os segredos do TOConline da empresa ${e === 'PP' ? "Pereira's Project" : 'Pereira & Cruz'} (TOC_${e}_…).`)
  // 2.1 código de autorização: lê-se do cabeçalho Location do 302, sem seguir o redirect
  const q = new URLSearchParams({ client_id: c.id, response_type: 'code', scope: 'commercial' })
  if (c.redirect) q.set('redirect_uri', c.redirect)
  const r1 = await fetch(`${c.oauth}/auth?${q}`, { headers: { 'Content-Type': 'application/json' }, redirect: 'manual' })
  const loc = r1.headers.get('location') ?? ''
  const code = loc ? new URL(loc, c.oauth).searchParams.get('code') : null
  if (!code) throw new Error(`TOConline: não devolveu o código de autorização (HTTP ${r1.status}). Confirme o CLIENT_ID e o OAUTH_URL.`)
  // 2.2 token de acesso
  const r2 = await fetch(`${c.oauth}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: `Basic ${btoa(`${c.id}:${c.segredo}`)}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, scope: 'commercial' }),
  })
  const j = await r2.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string }
  if (!r2.ok || !j.access_token) throw new Error(`TOConline: token recusado (HTTP ${r2.status}${j.error ? `, ${j.error}` : ''}). Confirme o CLIENT_SECRET.`)
  tokens.set(e, { valor: j.access_token, ate: Date.now() + (j.expires_in ?? 14400) * 1000 })
  return j.access_token
}

async function get(e: Empresa, caminho: string) {
  const r = await fetch(`${cfg(e).api}/${caminho.replace(/^\/+/, '')}`, {
    headers: { 'Content-Type': 'application/vnd.api+json', Accept: 'application/json', Authorization: `Bearer ${await token(e)}` },
  })
  const texto = await r.text()
  let json: unknown = texto
  try { json = JSON.parse(texto) } catch { /* texto */ }
  if (!r.ok) throw new Error(`TOConline ${r.status} em ${caminho.split('?')[0]}: ${texto.slice(0, 300)}`)
  return json as { data?: unknown }
}

// Escrita (fase 2): só RASCUNHOS de guias de transporte (GT), pela API anterior (/api/…, sem v1), que cria o documento
// em preparação: pode ser revisto e apagado no TOConline. A finalização e a comunicação à AT fazem-se no TOConline.
const baseRascunhos = (e: Empresa) => {
  let u = cfg(e).api.replace(/\/v1$/, '')
  if (!/\/api$/.test(u)) u += '/api'
  return u
}
async function enviar(e: Empresa, metodo: 'POST' | 'DELETE', caminho: string, corpo?: unknown) {
  const r = await fetch(`${baseRascunhos(e)}/${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/vnd.api+json', Accept: 'application/json', Authorization: `Bearer ${await token(e)}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const texto = await r.text()
  let json: unknown = texto
  try { json = texto ? JSON.parse(texto) : {} } catch { /* texto */ }
  if (!r.ok) throw new Error(`TOConline ${r.status} em ${metodo} ${caminho.split('?')[0]}: ${texto.slice(0, 500)}`)
  return json as { data?: { id?: string; attributes?: Record<string, unknown> } }
}

interface LinhaGuia { tipo: 'texto' | 'artigo'; descricao: string; item_id?: string; quantidade?: number; preco?: number; tax_id?: string; unidade_id?: string }
interface Guia {
  serie_id?: string; serie_prefixo?: string; data: string
  cliente: { id?: string; nome: string; nif?: string; morada?: string; cp?: string; localidade?: string; pais?: string }
  carga: { morada: string; cp: string; localidade: string }
  descarga: { morada: string; cp: string; localidade: string }
  viatura: string; hora_carga: string; notas?: string; linhas: LinhaGuia[]
}
const txt = (v: unknown, max = 200) => String(v ?? '').slice(0, max)

async function criarRascunhoGuia(e: Empresa, g: Guia) {
  if (!g?.cliente?.nome || !g.linhas?.some((l) => l.tipo === 'artigo')) throw new Error('A guia precisa de destinatário e de pelo menos um artigo.')
  if (g.linhas.length > 60) throw new Error('Demasiadas linhas numa guia.')
  const attrs: Record<string, unknown> = {
    document_type: 'GT', status: 0, date: txt(g.data, 10),
    customer_business_name: txt(g.cliente.nome), customer_country: txt(g.cliente.pais || 'PT', 2),
    vehicle_registration: txt(g.viatura, 40), shipment_loading_time: txt(g.hora_carga, 19),
    shipment_from_address_detail: txt(g.carga.morada), shipment_from_postcode: txt(g.carga.cp, 20), shipment_from_city: txt(g.carga.localidade, 80), shipment_from_country: 'PT',
    shipment_address_detail: txt(g.descarga.morada), shipment_postcode: txt(g.descarga.cp, 20), shipment_city: txt(g.descarga.localidade, 80), shipment_country: 'PT',
    notes: txt(g.notas, 1000),
  }
  if (g.cliente.id) attrs.customer_id = Number(g.cliente.id) || g.cliente.id
  if (g.cliente.nif) attrs.customer_tax_registration_number = txt(g.cliente.nif, 20)
  if (g.cliente.morada) attrs.customer_address_detail = txt(g.cliente.morada)
  if (g.cliente.cp) attrs.customer_postcode = txt(g.cliente.cp, 20)
  if (g.cliente.localidade) attrs.customer_city = txt(g.cliente.localidade, 80)
  if (g.serie_id) attrs.document_series_id = Number(g.serie_id) || g.serie_id
  else if (g.serie_prefixo) attrs.document_series_prefix = txt(g.serie_prefixo, 20)

  const cab = await enviar(e, 'POST', 'commercial_sales_documents', { data: { type: 'commercial_sales_documents', attributes: attrs } })
  const id = cab.data?.id
  if (!id) throw new Error(`TOConline não devolveu o documento criado: ${JSON.stringify(cab).slice(0, 300)}`)
  const estado = Number(cab.data?.attributes?.status ?? 0)
  try {
    for (const l of g.linhas) {
      const la: Record<string, unknown> = { document_id: Number(id) || id, description: txt(l.descricao, 2000) }
      if (l.tipo === 'artigo') {
        la.item_type = 'Product'
        la.quantity = Number(l.quantidade) || 0
        la.unit_price = Number(l.preco) || 0
        if (l.item_id) la.item_id = Number(l.item_id) || l.item_id
        if (l.tax_id) la.tax_id = Number(l.tax_id) || l.tax_id
        if (l.unidade_id) la.unit_of_measure_id = Number(l.unidade_id) || l.unidade_id
      }
      await enviar(e, 'POST', 'commercial_sales_document_lines', { data: { type: 'commercial_sales_document_lines', attributes: la } })
    }
  } catch (err) {
    // linha recusada: apaga o rascunho para não ficar meia guia (só se ainda estiver em preparação)
    if (estado !== 1) await enviar(e, 'DELETE', `commercial_sales_documents/${id}`).catch(() => {})
    throw err
  }
  const doc = await get(e, `commercial_sales_documents/${id}`) as { data?: { attributes?: Record<string, unknown> } }
  const a = doc.data?.attributes ?? {}
  return { id, status: a.status, document_no: a.document_no, finalizado: Number(a.status) === 1 }
}

async function apagarRascunho(e: Empresa, id: string) {
  if (!/^\d+$/.test(id)) throw new Error('Documento inválido.')
  const doc = await get(e, `commercial_sales_documents/${id}`) as { data?: { attributes?: Record<string, unknown> } }
  const a = doc.data?.attributes ?? {}
  if (a.document_type !== 'GT' || Number(a.status) !== 0) throw new Error('Só se apagam guias em preparação (rascunho). Uma guia finalizada só se anula no TOConline.')
  await enviar(e, 'DELETE', `commercial_sales_documents/${id}`)
  return { ok: true }
}

// só leitura, e só estes recursos
const PERMITIDOS = /^(api\/)?(v1\/)?(commercial_document_series|commercial_sales_documents|commercial_sales_document_lines|commercial_sales_receipts|commercial_purchases_documents|commercial_purchases_payments|customers|suppliers|products|services|units_of_measure|taxes|countries|tax_exemption_reasons|addresses|email_addresses)(\/[\w-]+)?(\?.*)?$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)
  try {
    // só utilizadores com sessão iniciada e perfil ativo
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return resposta({ erro: 'Sessão necessária.' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: quem, error: eSessao } = await supabase.auth.getUser(jwt)
    if (eSessao || !quem.user) return resposta({ erro: 'Sessão inválida ou expirada. Volte a entrar na aplicação.' }, 401)
    const { data: perfil } = await supabase.from('perfis').select('ativo').eq('id', quem.user.id).maybeSingle()
    if (!perfil?.ativo) return resposta({ erro: 'Utilizador sem acesso.' }, 403)

    const { empresa, acao, caminho, guia, id } = await req.json() as { empresa: Empresa; acao: 'testar' | 'consultar' | 'criar_guia' | 'apagar_rascunho'; caminho?: string; guia?: Guia; id?: string }
    if (empresa !== 'PP' && empresa !== 'PC') return resposta({ erro: 'Empresa inválida' }, 400)

    if (acao === 'testar') {
      const series = await get(empresa, 'commercial_document_series?page[size]=100') as { data?: { id: string; attributes: Record<string, unknown> }[] }
      const docs = await get(empresa, 'commercial_sales_documents?page[size]=30&sort=-date') as { data?: { id: string; attributes: Record<string, unknown> }[] }
      const a = (x: Record<string, unknown>, ks: string[]) => Object.fromEntries(ks.map((k) => [k, x[k]]))
      return resposta({
        ok: true,
        series: (series.data ?? []).map((s) => ({ id: s.id, ...a(s.attributes, ['document_type', 'prefix', 'name', 'active', 'is_active', 'year']) })),
        documentos: (docs.data ?? []).map((d) => ({ id: d.id, ...a(d.attributes, ['document_type', 'document_no', 'date', 'status', 'customer_business_name', 'gross_total', 'acts_as_shipment_document', 'vehicle_registration', 'communication_status', 'parent_document_type']) })),
      })
    }
    if (acao === 'consultar') {
      // e-Fatura (documentos da AT por associar): recurso da API anterior (/api/…, sem v1), só leitura
      if (caminho && /^document_associations(\/[\w-]+)?(\?.*)?$/.test(caminho)) {
        const r = await fetch(`${baseRascunhos(empresa)}/${caminho}`, { headers: { 'Content-Type': 'application/vnd.api+json', Accept: 'application/json', Authorization: `Bearer ${await token(empresa)}` } })
        const texto = await r.text()
        if (!r.ok) throw new Error(`TOConline ${r.status} em ${caminho.split('?')[0]}: ${texto.slice(0, 300)}`)
        return resposta({ ok: true, resultado: JSON.parse(texto) })
      }
      if (!caminho || !PERMITIDOS.test(caminho)) return resposta({ erro: 'Consulta não permitida (só leitura de documentos de venda e compra, recibos, pagamentos, séries, clientes, fornecedores e artigos).' }, 400)
      return resposta({ ok: true, resultado: await get(empresa, caminho) })
    }
    if (acao === 'criar_guia') return resposta({ ok: true, ...(await criarRascunhoGuia(empresa, guia as Guia)) })
    if (acao === 'apagar_rascunho') return resposta(await apagarRascunho(empresa, String(id ?? '')))
    return resposta({ erro: 'Ação desconhecida' }, 400)
  } catch (e) {
    console.error(e)
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500)
  }
})
