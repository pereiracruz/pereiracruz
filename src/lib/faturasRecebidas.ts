import { supabase } from './supabase'
import { lerGuardadoComIA } from './ia'
import { consultarTOC, NOME_EMPRESA_TOC, type EmpresaTOC } from './toconline'
import { slug } from './format'

/**
 * Faturas e recibos verdes de fornecedores (por email ou carregados): leitura com IA, procura do registo
 * correspondente no e-Fatura do TOConline (Pereira's Project ou Pereira & Cruz) e conferência dos valores.
 * O «Criar e associar» faz-se no TOConline (não existe na API): a aplicação mostra o que verificar.
 */

export interface FaturaLida {
  tipoDocumento: 'fatura' | 'fatura-recibo' | 'fatura simplificada' | 'nota de crédito' | 'nota de débito' | 'recibo verde' | 'recibo' | 'outro'
  numero: string; data: string; vencimento: string | null
  fornecedor: { nome: string; nif: string }; cliente: { nome: string | null; nif: string | null }
  linhasIva: { taxa: number; base: number; iva: number; motivoIsencao: string | null }[]
  totalSemIva: number; totalIva: number; total: number
  retencao: number | null; taxaRetencao: number | null; aPagar: number | null
  descricao: string | null; observacoes: string[]; confianca: 'alta' | 'media' | 'baixa'
}
export interface RegistoEfatura {
  id: string; empresa: EmpresaTOC; nif: string; fornecedor: string; tipo: string; numero: string; data: string
  total: number; iva: number; estado: string; documentoLocal: string | null
}
export interface Verificacao { campo: string; lido: string; efatura: string; ok: boolean | null; nota?: string }
export interface FaturaRecebida {
  id: string; origem: 'email' | 'upload'; emailId?: string
  ficheiro: { nome: string; caminho: string }
  recebidaEm: string
  leitura?: FaturaLida
  registo?: RegistoEfatura | null
  verificacoes?: Verificacao[]
  estado: 'nova' | 'lida' | 'conferida' | 'lancada' | 'ignorada'
  obs?: string
}

// NIF das empresas (para confirmar que o documento é para a empresa certa)
export const NIF_EMPRESA: Partial<Record<EmpresaTOC, string>> = { PP: '516204475' }

export const idFatura = (caminho: string) => slug(caminho).slice(-80)

export async function listarFaturasRecebidas(): Promise<FaturaRecebida[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('documentos').select('dados').eq('colecao', 'faturasRecebidas')
  if (error) throw new Error(error.message)
  return (data ?? []).map((l) => l.dados as FaturaRecebida)
}
export async function guardarFaturaRecebida(f: FaturaRecebida) {
  if (!supabase) throw new Error('Sem servidor.')
  const { error } = await supabase.from('documentos').upsert({ colecao: 'faturasRecebidas', id: f.id, dados: f })
  if (error) throw new Error(error.message)
  return f
}

/** Carrega um PDF/imagem para o servidor e cria a fatura recebida. */
export async function carregarFatura(ficheiro: File): Promise<FaturaRecebida> {
  if (!supabase) throw new Error('Sem servidor.')
  const ponto = ficheiro.name.lastIndexOf('.')
  const nome = ponto > 0 ? `${slug(ficheiro.name.slice(0, ponto))}${ficheiro.name.slice(ponto).toLowerCase()}` : slug(ficheiro.name)
  const caminho = `faturas/${new Date().toISOString().slice(0, 10)}/${Date.now().toString(36)}-${nome}`
  const { error } = await supabase.storage.from('documentos').upload(caminho, ficheiro, { contentType: ficheiro.type || undefined })
  if (error) throw new Error(`Não foi possível guardar o ficheiro: ${error.message}`)
  return guardarFaturaRecebida({ id: idFatura(caminho), origem: 'upload', ficheiro: { nome: ficheiro.name, caminho }, recebidaEm: new Date().toISOString(), estado: 'nova' })
}

export async function lerFatura(f: FaturaRecebida): Promise<FaturaRecebida> {
  const r = await lerGuardadoComIA<FaturaLida>(f.ficheiro.caminho, 'fatura', `Empresas compradoras possíveis: ${NOME_EMPRESA_TOC.PP} (NIF ${NIF_EMPRESA.PP}) e ${NOME_EMPRESA_TOC.PC}.`)
  return guardarFaturaRecebida({ ...f, leitura: r.dados, estado: f.estado === 'nova' ? 'lida' : f.estado })
}

// ---------- e-Fatura ----------
const soDigitos = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '')
const normalNum = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/^(FT|FR|FS|NC|ND|RG|RC|FA|FAC)(?=\d)/, '$1')
const filtro = (expr: string) => encodeURIComponent(`"${expr}"`).replace(/'/g, '%27')

async function registosDoFornecedor(empresa: EmpresaTOC, nif: string) {
  const r = await consultarTOC(empresa, `document_associations?page[number]=1&page[size]=100&filter=${filtro(`tax_registration_number = '${nif}'`)}`) as { data?: { id: string; attributes: Record<string, unknown> }[] }
  return (r?.data ?? []).map((d): RegistoEfatura => {
    const a = d.attributes
    return {
      id: d.id, empresa, nif: String(a.tax_registration_number ?? ''), fornecedor: String(a.business_name ?? ''), tipo: String(a.document_type ?? ''),
      numero: String(a.document_identifier ?? ''), data: String(a.date ?? '').slice(0, 10), total: Number(a.gross_total ?? 0), iva: Number(a.vat_total ?? 0),
      estado: String(a.status ?? ''), documentoLocal: (a.local_document_no as string) || null,
    }
  })
}

/** Procura o registo do e-Fatura (nas duas empresas) que corresponde ao documento lido. */
export async function procurarNoEfatura(l: FaturaLida): Promise<RegistoEfatura | null> {
  const nif = soDigitos(l.fornecedor.nif)
  if (!nif) throw new Error('A leitura não tem o NIF do fornecedor.')
  // empresa pelo NIF do cliente, quando o documento o indica; senão procura nas duas
  const cliente = soDigitos(l.cliente.nif)
  const ordem: EmpresaTOC[] = cliente && cliente === NIF_EMPRESA.PP ? ['PP', 'PC'] : cliente ? ['PC', 'PP'] : ['PP', 'PC']
  for (const empresa of ordem) {
    const regs = await registosDoFornecedor(empresa, nif)
    const n = normalNum(l.numero)
    const porNumero = regs.find((r) => normalNum(r.numero) === n || normalNum(r.numero).endsWith(n.split('/').pop() ?? '#') && r.data === l.data)
    if (porNumero) return porNumero
    const porValor = regs.filter((r) => r.data === l.data && Math.abs(r.total - l.total) < 0.01)
    if (porValor.length === 1) return porValor[0]
  }
  return null
}

const eur = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')} €`)
const dt = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—')

/** Conferência: o que foi lido no documento contra o registo do e-Fatura, e as regras dos recibos verdes. */
export function conferir(l: FaturaLida, r: RegistoEfatura | null): Verificacao[] {
  const v: Verificacao[] = []
  const somaIva = l.linhasIva.reduce((s, x) => s + x.iva, 0)
  const somaBase = l.linhasIva.reduce((s, x) => s + x.base, 0)
  v.push({ campo: 'Contas do documento', lido: `${eur(somaBase)} + IVA ${eur(somaIva)}`, efatura: eur(l.total), ok: Math.abs(somaBase + somaIva - l.total) < 0.02, nota: 'base + IVA = total' })
  for (const x of l.linhasIva) {
    const esperado = Math.round(x.base * x.taxa) / 100
    if (Math.abs(esperado - x.iva) > 0.02) v.push({ campo: `IVA a ${x.taxa} %`, lido: eur(x.iva), efatura: eur(esperado), ok: false, nota: 'o IVA não corresponde à taxa × base' })
    if (x.taxa === 0) v.push({ campo: 'Isenção de IVA', lido: x.motivoIsencao ?? 'sem motivo indicado', efatura: '', ok: x.motivoIsencao ? true : null, nota: x.motivoIsencao ? undefined : 'confirmar o motivo de isenção' })
  }
  if (r) {
    v.push({ campo: 'Número', lido: l.numero, efatura: r.numero, ok: normalNum(l.numero) === normalNum(r.numero) })
    v.push({ campo: 'Data', lido: dt(l.data), efatura: dt(r.data), ok: l.data === r.data })
    v.push({ campo: 'Total', lido: eur(l.total), efatura: eur(r.total), ok: Math.abs(l.total - r.total) < 0.01 })
    v.push({ campo: 'IVA', lido: eur(l.totalIva), efatura: eur(r.iva), ok: Math.abs(l.totalIva - r.iva) < 0.01 })
    v.push({ campo: 'Empresa', lido: l.cliente.nif ?? '—', efatura: NOME_EMPRESA_TOC[r.empresa], ok: !l.cliente.nif || r.empresa !== 'PP' || soDigitos(l.cliente.nif) === NIF_EMPRESA.PP })
  } else v.push({ campo: 'e-Fatura', lido: l.numero, efatura: 'não encontrado', ok: false, nota: 'o fornecedor pode ainda não ter comunicado à AT (ou o NIF/número foram mal lidos)' })
  if (l.tipoDocumento === 'recibo verde' || l.retencao != null) {
    const base = somaBase || l.totalSemIva
    const taxa = l.taxaRetencao ?? (base ? Math.round((l.retencao ?? 0) / base * 1000) / 10 : null)
    const esperado = l.taxaRetencao != null ? Math.round(base * l.taxaRetencao) / 100 : null
    v.push({ campo: 'Retenção na fonte', lido: `${eur(l.retencao)}${taxa != null ? ` (${String(taxa).replace('.', ',')} %)` : ''}`, efatura: esperado != null ? eur(esperado) : '—',
      ok: l.retencao == null ? null : esperado != null ? Math.abs(esperado - l.retencao) < 0.02 : [25, 23, 20, 16.5, 11.5].includes(taxa ?? -1) ? true : null,
      nota: 'no TOConline: preencher «Total Ret.» com este valor' })
    v.push({ campo: 'Data de vencimento', lido: dt(l.vencimento), efatura: '', ok: l.vencimento ? true : null, nota: l.vencimento ? 'no TOConline: «Vence a»' : 'o recibo não indica vencimento: confirmar' })
    if (l.aPagar != null && l.retencao != null) v.push({ campo: 'Valor a pagar', lido: eur(l.aPagar), efatura: eur(Math.round((l.total - l.retencao) * 100) / 100), ok: Math.abs(l.total - l.retencao - l.aPagar) < 0.02, nota: 'total − retenção' })
  }
  return v
}
