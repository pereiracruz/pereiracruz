// Supabase Edge Function «exportar-sheets»
// Cria no Google Drive da Pereira & Cruz uma folha de cálculo Google Sheets com as fichas
// (uma folha por variante/destinatário + packing list), com os totais em fórmula.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT_JSON  conta de serviço Google Cloud (a mesma da leitura com IA)
//   GOOGLE_DRIVE_FOLDER_ID       id da pasta do Drive onde ficam as fichas (partilhada com a conta de serviço)
//   GOOGLE_IMPERSONATE_EMAIL     opcional: email da empresa em nome de quem se cria o ficheiro
//                                (precisa de «delegação em todo o domínio» no Google Workspace)

import { JWT } from 'npm:google-auth-library@10.9.1'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

type Folha = { nome: string; larguras?: number[]; linhas: (string | number | null)[][] }

async function token() {
  const json = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!json) throw new Error('Falta o segredo GOOGLE_SERVICE_ACCOUNT_JSON.')
  const c = JSON.parse(json)
  const jwt = new JWT({
    email: c.client_email, key: c.private_key,
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
    subject: Deno.env.get('GOOGLE_IMPERSONATE_EMAIL') || undefined,
  })
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error('Não foi possível autenticar no Google.')
  return { token, email: c.client_email as string }
}

async function google(url: string, t: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg: string = corpo?.error?.message ?? `HTTP ${r.status}`
    if (/storage quota/i.test(msg)) throw new Error('A conta de serviço não tem espaço próprio no Drive: use uma pasta num Drive partilhado (Shared Drive) ou a delegação em nome do utilizador (ver docs/sheets.md).')
    if (r.status === 404 && url.includes('/drive/')) throw new Error('Pasta do Drive não encontrada: confirme GOOGLE_DRIVE_FOLDER_ID e se a pasta está partilhada com a conta de serviço.')
    if (r.status === 403 && /has not been used|disabled/i.test(msg)) throw new Error('Ative a Google Sheets API e a Google Drive API no projeto Google Cloud.')
    throw new Error(msg)
  }
  return corpo
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)
  try {
    // só utilizadores com sessão iniciada na aplicação
    const jwtUtilizador = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!jwtUtilizador) return resposta({ erro: 'Sessão necessária.' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: quem, error: eSessao } = await supabase.auth.getUser(jwtUtilizador)
    if (eSessao || !quem.user) return resposta({ erro: 'Sessão inválida ou expirada. Volte a entrar na aplicação.' }, 401)

    const { titulo, folhas } = await req.json() as { titulo: string; folhas: Folha[] }
    if (!titulo || !Array.isArray(folhas) || !folhas.length) return resposta({ erro: 'Pedido inválido' }, 400)
    const pasta = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
    if (!pasta) return resposta({ erro: 'Falta o segredo GOOGLE_DRIVE_FOLDER_ID (pasta do Drive para as fichas).' }, 500)

    const { token: t } = await token()

    // 1. criar a folha de cálculo diretamente na pasta (funciona em Drives partilhados)
    const ficheiro = await google('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink', t, {
      method: 'POST',
      body: JSON.stringify({ name: titulo, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [pasta] }),
    })
    const id: string = ficheiro.id
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`

    // 2. folhas: acrescentar as nossas e apagar a folha vazia inicial
    const inicial = await google(`${base}?fields=sheets.properties`, t)
    const idInicial: number = inicial.sheets[0].properties.sheetId
    const criadas = await google(`${base}:batchUpdate`, t, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          ...folhas.map((f) => ({ addSheet: { properties: { title: f.nome, gridProperties: { rowCount: Math.max(50, f.linhas.length + 5), columnCount: 20 } } } })),
          { deleteSheet: { sheetId: idInicial } },
        ],
      }),
    })
    const ids: number[] = criadas.replies.filter((r: { addSheet?: unknown }) => r.addSheet).map((r: { addSheet: { properties: { sheetId: number } } }) => r.addSheet.properties.sheetId)

    // 3. valores (USER_ENTERED: as fórmulas «=SUM(...)» ficam fórmulas)
    await google(`${base}/values:batchUpdate`, t, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: folhas.map((f) => ({ range: `'${f.nome.replace(/'/g, "''")}'!A1`, values: f.linhas.map((l) => l.map((c) => c ?? '')) })),
      }),
    })

    // 4. formato: título a negrito, cabeçalhos das tabelas a azul, larguras das colunas
    const formatos = folhas.flatMap((f, i) => {
      const sheetId = ids[i]
      const reqs: unknown[] = [{ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } }, fields: 'userEnteredFormat.textFormat' } }]
      f.linhas.forEach((l, r) => {
        const primeiro = String(l[0] ?? '')
        if (/^(TECIDO|P\.C\. Referência|Referência|Cor do cliente|Posição|Ponto de medida|BOX Nº|Caixa nº)/i.test(primeiro)) {
          reqs.push({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: Math.max(1, l.length) },
            cell: { userEnteredFormat: { backgroundColor: { red: 0.12, green: 0.31, blue: 0.47 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } },
            fields: 'userEnteredFormat(backgroundColor,textFormat)' } })
        } else if (l.length === 1 && primeiro && primeiro === primeiro.toUpperCase() && r > 0) {
          reqs.push({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0.64, green: 0.13, blue: 0.1 } } } }, fields: 'userEnteredFormat.textFormat' } })
        }
      })
      ;(f.larguras ?? []).forEach((w, c) => reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: Math.round(w * 7.5) }, fields: 'pixelSize' } }))
      return reqs
    })
    if (formatos.length) await google(`${base}:batchUpdate`, t, { method: 'POST', body: JSON.stringify({ requests: formatos }) })

    return resposta({ ok: true, id, url: ficheiro.webViewLink ?? `https://docs.google.com/spreadsheets/d/${id}/edit` })
  } catch (e) {
    console.error(e)
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500)
  }
})
