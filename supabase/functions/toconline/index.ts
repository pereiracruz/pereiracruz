// Supabase Edge Function «toconline» — ligação à API do TOConline (Pereira's Project e Pereira & Cruz).
// FASE 1: SÓ LEITURA. Testa a ligação e lê séries, documentos (guias, faturas), clientes, fornecedores e artigos,
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

// só leitura, e só estes recursos
const PERMITIDOS = /^(api\/)?(v1\/)?(commercial_document_series|commercial_sales_documents|commercial_sales_document_lines|customers|suppliers|products|services|units_of_measure|taxes|countries|tax_exemption_reasons|addresses|email_addresses)(\/[\w-]+)?(\?.*)?$/

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

    const { empresa, acao, caminho } = await req.json() as { empresa: Empresa; acao: 'testar' | 'consultar'; caminho?: string }
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
      if (!caminho || !PERMITIDOS.test(caminho)) return resposta({ erro: 'Consulta não permitida (só leitura de documentos, séries, clientes, fornecedores e artigos).' }, 400)
      return resposta({ ok: true, resultado: await get(empresa, caminho) })
    }
    return resposta({ erro: 'Ação desconhecida' }, 400)
  } catch (e) {
    console.error(e)
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500)
  }
})
