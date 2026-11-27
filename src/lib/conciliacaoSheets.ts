import { supabase } from './supabase'
import { AMBITO_FOLHAS, google, obterToken, prepararGoogle, sheetsDisponivel } from './sheets'
import { MESES, textoFaturas, type Conciliacao } from './conciliacao'
import { folhaPara } from './excelModelo'
import type { EmpresaTOC } from './toconline'

/**
 * Conciliação escrita diretamente na folha de cálculo Google da empresa (ex.: «Conciliacao_Bancaria_PP2026» no Drive),
 * com a API do Google Sheets e a conta Google de quem está a usar a aplicação. A formatação fica a cargo do próprio
 * Google: a folha do mês nova é um duplicado da última folha da mesma conta.
 */

export { sheetsDisponivel, prepararGoogle }
const AMBITO = `https://www.googleapis.com/auth/drive.file ${AMBITO_FOLHAS}`

// Ficheiros de 2026 (Drive da Pereira & Cruz, pasta «Conciliações»); mudam-se na aplicação para outro ano.
const FICHEIROS_INICIAIS: Partial<Record<EmpresaTOC, string>> = {
  PP: '1fKiCMRwrHhD6GeJPhnakPAsj5pEq3quz_0CE5QsIS30',
  PC: '1EbCjRsQJAf50sZT_i-zGtueRvR49utp89oKE16VBM3Y',
}

export const idDoLink = (s: string) => s.match(/\/d\/([\w-]{20,})/)?.[1] ?? (/^[\w-]{20,}$/.test(s.trim()) ? s.trim() : null)

export async function ficheiroDaEmpresa(empresa: EmpresaTOC): Promise<string | null> {
  if (supabase) {
    const { data } = await supabase.from('documentos').select('dados').eq('colecao', 'configuracao').eq('id', 'conciliacao').maybeSingle()
    const id = (data?.dados as { folhasGoogle?: Record<string, string> } | undefined)?.folhasGoogle?.[empresa]
    if (id) return id
  }
  return FICHEIROS_INICIAIS[empresa] ?? null
}
export async function guardarFicheiroDaEmpresa(empresa: EmpresaTOC, id: string) {
  if (!supabase) return
  const { data } = await supabase.from('documentos').select('dados').eq('colecao', 'configuracao').eq('id', 'conciliacao').maybeSingle()
  const dados = (data?.dados ?? {}) as { folhasGoogle?: Record<string, string> }
  await supabase.from('documentos').upsert({ colecao: 'configuracao', id: 'conciliacao', dados: { ...dados, folhasGoogle: { ...dados.folhasGoogle, [empresa]: id } } })
}

export interface FolhaGoogle { nome: string; sheetId: number; indice: number; linhas: number }
export interface LivroGoogle { id: string; titulo: string; folhas: FolhaGoogle[]; token: string }

/** Tem de ser chamado diretamente no clique (a primeira vez abre a janela do Google). */
export async function abrirLivroGoogle(id: string): Promise<LivroGoogle> {
  const t = await obterToken(AMBITO)
  const r = await google(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(sheetId,title,index,gridProperties.rowCount)`, t)
  return {
    id, token: t, titulo: r.properties?.title ?? '',
    folhas: (r.sheets ?? []).map((s: { properties: { sheetId: number; title: string; index: number; gridProperties?: { rowCount?: number } } }) => ({
      nome: s.properties.title, sheetId: s.properties.sheetId, indice: s.properties.index, linhas: s.properties.gridProperties?.rowCount ?? 1000,
    })),
  }
}

export const sugestaoFolha = (l: LivroGoogle, c: Conciliacao) => folhaPara(l, c)

const colNum = (l: string) => l.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
const colLetra = (n: number) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const aspas = (nome: string) => `'${nome.replace(/'/g, "''")}'`
// datas como número de série (formatado como data): não depende da língua/região da folha
const dataF = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5

/** Preenche a folha (ou cria-a, duplicando outra) e devolve o link para ela. */
export async function preencherGoogle(l: LivroGoogle, c: Conciliacao, escolha: { folha: string } | { copiarDe: string; nome: string }): Promise<string> {
  const t = l.token
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${l.id}`
  let folha: FolhaGoogle
  if ('copiarDe' in escolha) {
    const origem = l.folhas.find((f) => f.nome === escolha.copiarDe)!
    const r = await google(`${base}:batchUpdate`, t, { method: 'POST', body: JSON.stringify({ requests: [{ duplicateSheet: { sourceSheetId: origem.sheetId, insertSheetIndex: origem.indice + 1, newSheetName: escolha.nome } }] }) })
    const p = r.replies[0].duplicateSheet.properties
    folha = { nome: p.title, sheetId: p.sheetId, indice: p.index, linhas: p.gridProperties?.rowCount ?? origem.linhas }
  } else folha = l.folhas.find((f) => f.nome === escolha.folha)!
  const nome = aspas(folha.nome)

  // ler o que lá está (fórmulas como texto) e as células combinadas
  const v = await google(`${base}/values/${encodeURIComponent(`${nome}!A1:Z${folha.linhas}`)}?valueRenderOption=FORMULA`, t)
  const g = (r: number, col: number) => String(((v.values ?? [])[r - 1] ?? [])[col - 1] ?? '').trim()
  const linhasLidas: unknown[][] = v.values ?? []
  let linhaCab = 8
  for (let r = 1; r <= Math.min(20, linhasLidas.length); r++) {
    const l2 = (linhasLidas[r - 1] ?? []).map((x) => String(x ?? '').trim().toLowerCase())
    if (l2.includes('data') && l2.some((x) => /quantia/.test(x))) { linhaCab = r; break }
  }
  const cab = (linhasLidas[linhaCab - 1] ?? []).map((x) => String(x ?? '').trim().toLowerCase())
  const achar = (re: RegExp, omissao: string) => { const i = cab.findIndex((x) => re.test(x)); return i >= 0 ? colLetra(i + 1) : omissao }
  const C = { data: achar(/^data$/, 'A'), desc: achar(/descri/, 'B'), valor: achar(/quantia|valor|montante/, 'E'), saldo: achar(/saldo/, 'F'), obs: '' }
  C.obs = achar(/^obs/, colLetra(colNum(C.saldo) + 1))
  const ultimaCol = Math.max(...Object.values(C).map(colNum))
  const linhaSaldo = linhaCab + 1, primeira = linhaCab + 2
  let rodape: number | null = null
  for (let r = linhaSaldo + 1; r <= linhasLidas.length; r++) if (/^data:\s*$/i.test(g(r, colNum(C.data)))) { rodape = r; break }

  const info = await google(`${base}?ranges=${encodeURIComponent(nome)}&fields=sheets(merges)`, t)
  const merges: { startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number }[] = info.sheets?.[0]?.merges ?? []
  const mDesc = merges.find((m) => m.startRowIndex === primeira - 1 && m.startColumnIndex === colNum(C.desc) - 1)

  const n = c.movimentos.length
  const pedidos: unknown[] = []
  // espaço: se as linhas preparadas não chegam, insere linhas antes do rodapé (com a formatação da linha de cima)
  if (rodape && rodape - 2 - primeira + 1 < n) {
    const falta = n - (rodape - 2 - primeira + 1)
    pedidos.push({ insertDimension: { range: { sheetId: folha.sheetId, dimension: 'ROWS', startIndex: rodape - 2, endIndex: rodape - 2 + falta }, inheritFromBefore: true } })
    if (mDesc) for (let k = 0; k < falta; k++) {
      const r0 = rodape - 2 + k
      pedidos.push({ mergeCells: { mergeType: 'MERGE_ALL', range: { sheetId: folha.sheetId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: mDesc.startColumnIndex, endColumnIndex: mDesc.endColumnIndex } } })
    }
    rodape += falta
  }
  const fim = rodape ? rodape - 2 : Math.max(primeira + n - 1, linhasLidas.length)
  const ultima = primeira + n - 1
  // a coluna das datas com formato de data (as linhas vazias da folha podem não o ter)
  pedidos.push({ repeatCell: { range: { sheetId: folha.sheetId, startRowIndex: primeira - 1, endRowIndex: ultima, startColumnIndex: colNum(C.data) - 1, endColumnIndex: colNum(C.data) }, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } })
  const rDataRodape = rodape ?? ultima + 2
  pedidos.push({ repeatCell: { range: { sheetId: folha.sheetId, startRowIndex: rDataRodape - 1, endRowIndex: rDataRodape, startColumnIndex: colNum(C.data), endColumnIndex: colNum(C.data) + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } })
  if (pedidos.length) await google(`${base}:batchUpdate`, t, { method: 'POST', body: JSON.stringify({ requests: pedidos }) })

  // limpa os valores da zona dos movimentos (a formatação fica)
  await google(`${base}/values:batchClear`, t, { method: 'POST', body: JSON.stringify({ ranges: [`${nome}!A${primeira}:${colLetra(ultimaCol)}${fim}`] }) })

  const dados: { range: string; values: unknown[][] }[] = []
  // Ano / Mês
  for (let r = 1; r < linhaCab; r++) {
    const linha = (linhasLidas[r - 1] ?? []).map((x) => String(x ?? '').trim().toLowerCase())
    linha.forEach((x, i) => {
      const destino = () => { for (let k = i + 1; k <= i + 3; k++) if (linha[k] !== undefined && !/:\s*$/.test(linha[k] ?? '')) return colLetra(k + 1); return colLetra(i + 2) }
      if (/^ano:?$/.test(x)) dados.push({ range: `${nome}!${destino()}${r}`, values: [[c.ano]] })
      if (/^m[eê]s:?$/.test(x)) dados.push({ range: `${nome}!${destino()}${r}`, values: [[MESES[c.mes - 1]]] })
    })
  }
  const anterior = c.mes === 1 ? `dez ${c.ano - 1}` : `${MESES[c.mes - 2].toLowerCase()} ${c.ano}`
  dados.push({ range: `${nome}!${C.desc}${linhaSaldo}`, values: [[`Saldo transitado ${anterior}`]] })
  dados.push({ range: `${nome}!${C.saldo}${linhaSaldo}`, values: [[c.saldoInicial]] })
  c.movimentos.forEach((m, i) => {
    const r = primeira + i
    const fat = textoFaturas(m)
    dados.push({ range: `${nome}!${C.data}${r}`, values: [[dataF(m.data)]] })
    dados.push({ range: `${nome}!${C.desc}${r}`, values: [[fat ? `${m.descricao} (${fat})` : m.descricao]] })
    dados.push({ range: `${nome}!${C.valor}${r}`, values: [[m.valor]] })
    dados.push({ range: `${nome}!${C.saldo}${r}`, values: [[`=${C.saldo}${r - 1}+${C.valor}${r}`]] })
    const obs = m.obs || (m.estado === 'sem-fatura' ? 'sem fatura' : '')
    if (obs) dados.push({ range: `${nome}!${C.obs}${r}`, values: [[obs]] })
  })
  const hoje = new Date().toISOString().slice(0, 10)
  const rf = rodape ?? ultima + 2
  if (!rodape) {
    dados.push({ range: `${nome}!${C.data}${rf}`, values: [['Data:']] })
    dados.push({ range: `${nome}!${C.valor}${rf}`, values: [['SALDO TOTAL']] })
  }
  dados.push({ range: `${nome}!${colLetra(colNum(C.data) + 1)}${rf}`, values: [[dataF(hoje)]] })
  // SALDO TOTAL: na célula onde já havia a fórmula do total (ou na coluna do saldo)
  const colTotal = (() => { const l2 = linhasLidas[(rodape ?? 0) - 1] ?? []; const i = l2.findIndex((x) => /^=/.test(String(x ?? ''))); return i >= 0 ? colLetra(i + 1) : C.saldo })()
  dados.push({ range: `${nome}!${colTotal}${rf}`, values: [[`=${C.saldo}${ultima}`]] })
  await google(`${base}/values:batchUpdate`, t, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: dados }) })
  return `https://docs.google.com/spreadsheets/d/${l.id}/edit#gid=${folha.sheetId}`
}
