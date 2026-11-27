import { supabase } from './supabase'

/** Ligação ao TOConline pela função do servidor «toconline» (as credenciais ficam nos segredos do Supabase). */
export type EmpresaTOC = 'PP' | 'PC'
export const NOME_EMPRESA_TOC: Record<EmpresaTOC, string> = { PP: "Pereira's Project", PC: 'Pereira & Cruz' }
export const tocDisponivel = !!supabase

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('A ligação ao TOConline só funciona no site publicado (com servidor).')
  const { data, error } = await supabase.functions.invoke('toconline', { body: corpo })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const det = ctx ? await ctx.json().catch(() => null) as { erro?: string } | null : null
    if (det?.erro) throw new Error(det.erro)
    if (/not found|404/i.test(error.message)) throw new Error('A função «toconline» ainda não existe no Supabase.')
    throw new Error(error.message)
  }
  if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro)
  return data as T
}

export interface TesteTOC {
  series: { id: string; document_type?: string; prefix?: string; name?: string }[]
  documentos: { id: string; document_type?: string; document_no?: string; date?: string; status?: number; customer_business_name?: string; gross_total?: number; vehicle_registration?: string | null; communication_status?: string }[]
}
export const testarTOC = (empresa: EmpresaTOC) => chamar<TesteTOC>({ empresa, acao: 'testar' })
export const consultarTOC = (empresa: EmpresaTOC, caminho: string) => chamar<{ resultado: unknown }>({ empresa, acao: 'consultar', caminho }).then((r) => r.resultado)

// ---------- Fase 2: rascunhos de guias de transporte (GT) ----------
export interface LinhaGuiaTOC { tipo: 'texto' | 'artigo'; descricao: string; item_id?: string; quantidade?: number; preco?: number; tax_id?: string; unidade_id?: string }
export interface GuiaParaTOC {
  serie_id?: string; serie_prefixo?: string; data: string
  cliente: { id?: string; nome: string; nif?: string; morada?: string; cp?: string; localidade?: string; pais?: string }
  carga: { morada: string; cp: string; localidade: string }
  descarga: { morada: string; cp: string; localidade: string }
  viatura: string; hora_carga: string; notas?: string; linhas: LinhaGuiaTOC[]
}
export const criarGuiaTOC = (empresa: EmpresaTOC, guia: GuiaParaTOC) =>
  chamar<{ id: string; status?: number; document_no?: string; finalizado: boolean }>({ empresa, acao: 'criar_guia', guia })
export const apagarRascunhoTOC = (empresa: EmpresaTOC, id: string) => chamar<{ ok: boolean }>({ empresa, acao: 'apagar_rascunho', id })

/** Lista de recursos JSON:API ({ data: [{ id, attributes }] }) → [{ id, ...attributes }]. */
export async function listarTOC(empresa: EmpresaTOC, caminho: string): Promise<({ id: string } & Record<string, unknown>)[]> {
  const r = await consultarTOC(empresa, caminho) as { data?: { id: string; attributes?: Record<string, unknown> }[] }
  return (r?.data ?? []).map((d) => ({ ...(d.attributes ?? {}), id: String(d.id) }))
}
