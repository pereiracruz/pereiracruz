import type { FolhaLivro } from './exportar'
import { paraSheets } from './exportar'

/**
 * Exportação para o Google Sheets no Drive do utilizador (ex.: pereiracruz.lda@gmail.com).
 * Autorização «Iniciar sessão com Google» (Google Identity Services) com o âmbito drive.file:
 * a aplicação só vê e altera os ficheiros que ela própria cria.
 */

const CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined
const AMBITO = 'https://www.googleapis.com/auth/drive.file'
const PASTA = 'Fichas de produção · Pereira & Cruz'
export const sheetsDisponivel = !!CLIENT_ID

type TokenResposta = { access_token?: string; expires_in?: number; error?: string; error_description?: string }
type ClienteToken = { requestAccessToken: (o?: { prompt?: string }) => void }
type GIS = { accounts: { oauth2: { initTokenClient: (o: {
  client_id: string; scope: string; callback: (r: TokenResposta) => void; error_callback?: (e: { type?: string; message?: string }) => void
}) => ClienteToken } } }
declare global { interface Window { google?: GIS } }

let gis: Promise<void> | null = null
/** Carrega o script do Google cedo, para a janela de autorização abrir logo no clique. */
export function prepararGoogle() {
  if (!sheetsDisponivel || gis) return gis
  gis = new Promise((ok, falha) => {
    if (window.google?.accounts?.oauth2) return ok()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => ok()
    s.onerror = () => { gis = null; falha(new Error('Não foi possível carregar o Google. Verifique a ligação.')) }
    document.head.appendChild(s)
  })
  return gis
}

let token: { valor: string; expira: number; ambito: string } | null = null
/** Âmbito para editar as folhas de cálculo que já existem no Drive (ex.: a conciliação bancária). */
export const AMBITO_FOLHAS = 'https://www.googleapis.com/auth/spreadsheets'
/** Pede o token ao Google. Tem de ser chamado diretamente no clique (sem esperas antes), para a janela não ser bloqueada. */
export function obterToken(ambito = AMBITO): Promise<string> {
  if (token && token.expira > Date.now() + 60_000 && ambito.split(' ').every((a) => token!.ambito.includes(a))) return Promise.resolve(token.valor)
  if (!window.google?.accounts?.oauth2) return Promise.reject(new Error('O Google ainda está a carregar. Tente de novo dentro de segundos.'))
  return new Promise((ok, falha) => {
    const cliente = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID!, scope: ambito,
      callback: (r) => {
        if (r.error || !r.access_token) return falha(new Error(r.error_description || r.error || 'Autorização recusada.'))
        token = { valor: r.access_token, expira: Date.now() + (r.expires_in ?? 3600) * 1000, ambito }
        ok(r.access_token)
      },
      error_callback: (e) => falha(new Error(e.type === 'popup_closed' ? 'A janela do Google foi fechada antes de autorizar.' : e.type === 'popup_failed_to_open' ? 'O browser bloqueou a janela do Google: autorize janelas pop-up para este site.' : e.message || 'Autorização cancelada.')),
    })
    cliente.requestAccessToken({ prompt: token ? '' : undefined })
  })
}

export async function google(url: string, t: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const corpo = await r.json().catch(() => ({}))
  if (r.status === 401) { token = null; throw new Error('A autorização do Google expirou. Exporte de novo.') }
  if (!r.ok) {
    const msg: string = corpo?.error?.message ?? `HTTP ${r.status}`
    if (r.status === 403 && /has not been used|disabled/i.test(msg)) throw new Error('Ative a Google Sheets API e a Google Drive API no projeto Google Cloud.')
    if (r.status === 403 && /insufficient|scope|permission/i.test(msg)) { token = null; throw new Error('Falta autorizar a aplicação a editar as suas folhas do Google (ou a conta escolhida não tem acesso a este ficheiro). Tente de novo e aceite o pedido do Google.') }
    if (r.status === 404) throw new Error('Não encontrei a folha de cálculo no Google Drive (confirme o link e a conta Google escolhida).')
    throw new Error(msg)
  }
  return corpo
}

/** Pasta da aplicação no Drive (com drive.file só aparecem as pastas criadas pela aplicação). */
async function pasta(t: string): Promise<string> {
  const q = encodeURIComponent(`name='${PASTA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const lista = await google(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, t)
  if (lista.files?.length) return lista.files[0].id
  const nova = await google('https://www.googleapis.com/drive/v3/files?fields=id', t, {
    method: 'POST', body: JSON.stringify({ name: PASTA, mimeType: 'application/vnd.google-apps.folder' }),
  })
  return nova.id
}

/** Cria a folha de cálculo no Drive do utilizador e devolve o link. */
export async function exportarSheets(titulo: string, livro: FolhaLivro[]): Promise<string> {
  if (!sheetsDisponivel) throw new Error('Falta ligar a aplicação à conta Google (VITE_GOOGLE_CLIENT_ID).')
  const t = await obterToken() // primeiro, ainda dentro do clique
  const folhas = paraSheets(livro)

  const ficheiro = await google('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', t, {
    method: 'POST',
    body: JSON.stringify({ name: titulo, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [await pasta(t)] }),
  })
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${ficheiro.id}`

  // folhas: acrescentar as nossas e apagar a folha vazia inicial
  const inicial = await google(`${base}?fields=sheets.properties`, t)
  const criadas = await google(`${base}:batchUpdate`, t, {
    method: 'POST',
    body: JSON.stringify({ requests: [
      ...folhas.map((f) => ({ addSheet: { properties: { title: f.nome, gridProperties: { rowCount: Math.max(50, f.linhas.length + 5), columnCount: 20 } } } })),
      { deleteSheet: { sheetId: inicial.sheets[0].properties.sheetId } },
    ] }),
  })
  const ids: number[] = criadas.replies.filter((r: { addSheet?: unknown }) => r.addSheet).map((r: { addSheet: { properties: { sheetId: number } } }) => r.addSheet.properties.sheetId)

  // valores (USER_ENTERED: «=SUM(...)» fica fórmula)
  await google(`${base}/values:batchUpdate`, t, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: folhas.map((f) => ({ range: `'${f.nome.replace(/'/g, "''")}'!A1`, values: f.linhas })) }),
  })

  // formato: título, cabeçalhos das tabelas a azul, títulos de secção a vermelho, larguras
  const azul = { red: 0.12, green: 0.31, blue: 0.47 }
  const formatos = folhas.flatMap((f, i) => {
    const sheetId = ids[i]
    const reqs: unknown[] = [{ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } }, fields: 'userEnteredFormat.textFormat' } }]
    f.linhas.forEach((l, r) => {
      const primeiro = String(l[0] ?? '')
      if (/^(TECIDO|P\.C\. Referência|Referência|Cor do cliente|Posição|Ponto de medida|BOX Nº|Caixa nº)/i.test(primeiro)) {
        reqs.push({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: Math.max(1, l.length) },
          cell: { userEnteredFormat: { backgroundColor: azul, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } })
      } else if (l.length === 1 && primeiro && primeiro === primeiro.toUpperCase() && r > 0) {
        reqs.push({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0.64, green: 0.13, blue: 0.1 } } } }, fields: 'userEnteredFormat.textFormat' } })
      }
    })
    f.larguras.forEach((w, c) => reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: Math.round(w * 7.5) }, fields: 'pixelSize' } }))
    return reqs
  })
  if (formatos.length) await google(`${base}:batchUpdate`, t, { method: 'POST', body: JSON.stringify({ requests: formatos }) })

  return ficheiro.webViewLink ?? `https://docs.google.com/spreadsheets/d/${ficheiro.id}/edit`
}
