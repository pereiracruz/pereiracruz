import { supabase } from './supabase'
import { encomendaDaLeitura } from './lerEncomendaExcel'
import { leituraDaIA, ligarTechPack, type EncomendaLida, type TechPackLido } from './ia'
import { gerarFichaDoTechPack } from './gerarFicha'
import { linhasModeloPC } from '../data/seed'
import { hojeISO, uid } from './format'
import type { AcessorioCliente, ClienteCfg, Encomenda, Equivalencia, Fornecedor, Pedido, Tecido } from '../types'

/**
 * Leitura de emails com IA (OpenRouter, função «ler-email»): classificação, cliente, encomenda, tech pack e pedido de preço,
 * nos mesmos formatos da leitura de documentos, para criar a encomenda, as fichas (rascunho) e os pedidos de orçamento.
 */
export type TipoEmailIA = 'encomenda' | 'pedido_preco' | 'tech_pack' | 'alteracao' | 'fatura' | 'outro'
export interface PedidoPrecoLido {
  pecas: { referencia: string | null; descricao: string; tipoPeca: string | null; tecido: string | null; tratamento: string | null; quantidade: number | null; precoAlvo: number | null; observacoes: string | null }[]
  prazo: string | null
  observacoes: string[]
}
export interface EmailLido {
  classificacao: { tipo: TipoEmailIA; confianca: 'alta' | 'media' | 'baixa'; motivo: string }
  idioma: string | null
  resumo: string
  cliente: { nome: string | null; marca: string | null; nif: string | null; email: string | null; pais: string | null; nomeConhecido: string | null }
  anexos: { nome: string; tipo: 'encomenda' | 'tech_pack' | 'of' | 'fatura' | 'imagem' | 'outro'; resumo: string }[]
  encomenda: (EncomendaLida & { notas: string[]; perguntas: string[] }) | null
  techpack: TechPackLido | null
  pedidoPreco: PedidoPrecoLido | null
  duvidas: string[]
}
export interface LeituraEmailIA {
  em: string; modelo: string; fornecedor: string | null
  uso: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null
  ignorados: string[]
  dados: EmailLido
}

export const NOME_TIPO: Record<TipoEmailIA, string> = {
  encomenda: 'Encomenda', pedido_preco: 'Pedido de preço', tech_pack: 'Tech pack / OF', alteracao: 'Alteração a encomenda', fatura: 'Fatura', outro: 'Outro',
}

export async function lerEmailComIA(emailId: string, clientes: string[]): Promise<LeituraEmailIA> {
  if (!supabase) throw new Error('A leitura de emails com IA precisa do servidor (Supabase).')
  const { data, error } = await supabase.functions.invoke('ler-email', { body: { emailId, clientes } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const det = ctx ? await ctx.json().catch(() => null) as { erro?: string } | null : null
    if (det?.erro) throw new Error(det.erro)
    if (/not found|404/i.test(error.message)) throw new Error('A função «ler-email» ainda não existe no Supabase.')
    throw new Error(error.message)
  }
  if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro)
  return data as LeituraEmailIA
}

const letras = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
/** Cliente existente: o nome indicado pela IA, o nome ou a marca lidos, comparados sem acentos nem pontuação. */
export function clienteDoEmail(l: EmailLido, clientes: ClienteCfg[]): { existente: ClienteCfg | null; nome: string } {
  const candidatos = [l.cliente.nomeConhecido, l.cliente.nome, l.cliente.marca, l.encomenda?.cliente].filter((x): x is string => !!x && !!letras(x))
  for (const c of candidatos) {
    const x = letras(c)
    const achado = clientes.find((k) => { const y = letras(k.nome); return y === x || (y.length >= 4 && (x.includes(y) || y.includes(x))) })
    if (achado) return { existente: achado, nome: achado.nome }
  }
  return { existente: null, nome: candidatos[0] ?? '' }
}

/** Encomenda a partir do email (linhas → modelos e variantes) e fichas em rascunho para os modelos com tech pack/OF. */
export function encomendaDoEmail(l: EmailLido, cliente: string, colecao: string, ficheiros: string[],
  dm: { fornecedores: Fornecedor[]; tecidos: Tecido[]; equivalencias: Equivalencia[]; acessorios: AcessorioCliente[]; clientes: ClienteCfg[] }): { encomenda: Encomenda; fichas: number } {
  if (!l.encomenda) throw new Error('O email não tem uma encomenda com quantidades.')
  const leitura = leituraDaIA(l.encomenda, ficheiros[0] ?? 'email')
  const enc = encomendaDaLeitura(leitura, cliente, colecao, 'Produto acabado', ficheiros)
  enc.notas = [...(enc.notas ?? []), ...(l.encomenda.notas ?? []), ...(l.encomenda.perguntas ?? []).map((p) => `Pergunta do cliente: ${p}`), ...l.duvidas.map((d) => `A confirmar: ${d}`)]
  let fichas = 0
  if (l.techpack?.modelos.length) {
    const ligacoes = ligarTechPack(enc.modelos, l.techpack)
    enc.modelos = enc.modelos.map((m) => {
      const i = ligacoes[m.id] ?? (l.techpack!.modelos.length === 1 && enc.modelos.length === 1 ? 0 : undefined)
      if (i == null) return m
      fichas++
      return gerarFichaDoTechPack({ ...m, techPack: true }, l.techpack!.modelos[i], enc, dm)
    })
  }
  return { encomenda: enc, fichas }
}

/** Um pedido de orçamento (ficha-modelo da Pereira & Cruz) por peça pedida no email. */
export function pedidosDoEmail(l: EmailLido, cliente: string): Pedido[] {
  const pecas = l.pedidoPreco?.pecas.length ? l.pedidoPreco.pecas : []
  return pecas.map((p) => {
    const tipo = /cal[çc][ãa]o|short|bermud/i.test(`${p.tipoPeca} ${p.descricao}`) ? 'Calções' : /casaco|jacket|veste|blus/i.test(`${p.tipoPeca} ${p.descricao}`) ? 'Casaco' : /camisa|shirt|chemise/i.test(`${p.tipoPeca} ${p.descricao}`) ? 'Camisa' : 'Calças'
    const tecido = /sarja|chino|twill/i.test(`${p.tecido} ${p.descricao}`) ? 'Sarja' : /ganga|denim|jean/i.test(`${p.tecido} ${p.descricao}`) ? 'Ganga' : 'Outro'
    return {
      id: uid('ped'), cliente, peca: p.referencia || p.descricao.slice(0, 40), variante: '', tipoPeca: tipo,
      tecido: p.tecido || (tecido === 'Outro' ? '—' : tecido), tratamento: p.tratamento || '—', entrega: /^\d{4}-\d{2}-\d{2}$/.test(l.pedidoPreco?.prazo ?? '') ? l.pedidoPreco!.prazo! : '',
      linhas: linhasModeloPC(tipo, tecido), estado: 'Rascunho', criadoEm: hojeISO(), origem: 'ia',
      referencia: p.precoAlvo != null ? `preço alvo do cliente ${p.precoAlvo} €` : undefined,
    } as Pedido
  })
}
