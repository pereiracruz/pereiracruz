import type { AcessorioCliente, ClienteCfg, Encomenda, Equivalencia, Fornecedor, LinhaMaterial, Medida, Modelo, Operacao, Tecido } from '../types'
import type { TechPackLido } from './ia'
import { hojeISO, uid } from './format'
import { FORNECIDO_CLIENTE } from './of'

type ModeloTP = TechPackLido['modelos'][number]
const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Gera a ficha (rascunho, por aprovar) de um modelo a partir da leitura do tech pack, com as regras da Pereira & Cruz:
 * - o tecido do tech pack só passa tal como está se for de um fornecedor a quem a Pereira & Cruz compra;
 *   se houver equivalência na tabela usa-se o equivalente; senão fica a decidir (justificação obrigatória);
 * - acessórios do tech pack + acessórios fixos do cliente (dados mestre); linha só com cor e fornecedor;
 * - bordados/estampados como operações; notas fixas do cliente e notas da encomenda nas observações;
 * - valores lidos com pouca confiança ficam assinalados nas novas observações.
 */
export function gerarFichaDoTechPack(
  m: Modelo, tp: ModeloTP, enc: Encomenda,
  dm: { fornecedores: Fornecedor[]; tecidos: Tecido[]; equivalencias: Equivalencia[]; acessorios: AcessorioCliente[]; clientes: ClienteCfg[] },
): Modelo {
  const fornecedorConhecido = (f: string | null) => !!f && dm.fornecedores.some((x) => norm(x.nome).split(/\s*\/\s*/).some((n) => n && (norm(f).includes(n) || n.includes(norm(f)))))
  const cfg = dm.clientes.find((c) => norm(c.nome) === norm(enc.cliente))
  const of = cfg?.documentoModelo === 'OF' // ordem de fabrico do cliente em vez de tech pack
  const doc = of ? 'OF' : 'tech pack'
  const daCliente = cfg?.acessorios === 'Do cliente' // acessórios e embalagem vêm do cliente
  const pag = (p: number) => `${doc}, pág. ${p}`
  const duvidas: string[] = []
  const materiais: LinhaMaterial[] = []

  for (const t of tp.tecidos) {
    if (t.confianca === 'baixa') duvidas.push(`Confirmar tecido «${t.descricao}» (${pag(t.pagina)}).`)
    const palavra = norm(t.descricao).split(/[\s·,/-]+/).find((w) => w.length > 3) ?? norm(t.descricao)
    const eq = dm.equivalencias.find((e) => norm(e.tecidoCliente).includes(palavra))
    // tecido que a Pereira & Cruz já compra (dados mestre): nome do tecido contido na descrição do tech pack
    const nosso = dm.tecidos.find((x) => norm(t.descricao).includes(norm(x.nome)))
    const base = { id: uid('m'), obs: t.observacoes ?? '', consumo: t.consumo, unidade: 'm' as const, cor: t.cor ?? 'Conforme variante', largura: nosso?.larguraUtil ?? 'A confirmar', folha: 'tecido' as const }
    if (nosso && nosso.fornecedor !== 'A confirmar') {
      materiais.push({ ...base, ref: t.descricao, fornecedor: nosso.fornecedor })
    } else if (eq) {
      materiais.push({ ...base, ref: eq.tecidoCasa.replace(/\s*\(.*\)$/, ''), fornecedor: eq.tecidoCasa.match(/\((.*)\)/)?.[1] ?? 'A confirmar',
        divergencia: `${of ? 'OF' : 'Tech pack'}: ${t.descricao}`, justificacao: `Equivalência da tabela: ${eq.tecidoCliente} → ${eq.tecidoCasa}.` })
    } else if (fornecedorConhecido(t.fornecedor)) {
      materiais.push({ ...base, ref: t.descricao, fornecedor: t.fornecedor! })
    } else {
      materiais.push({ ...base, ref: t.descricao, fornecedor: t.fornecedor ?? 'A confirmar',
        divergencia: `Tecido ${of ? 'da OF' : 'do tech pack'}${t.fornecedor ? ` (${t.fornecedor})` : ''} sem equivalente: escolher o tecido da Pereira & Cruz ou justificar`, justificacao: '' })
    }
  }

  materiais.push({ id: uid('m'), ref: 'Linha', fornecedor: 'A confirmar', obs: '', consumo: null, semConsumo: true, unidade: 'un', cor: 'A confirmar', folha: 'confecao' })

  const doCliente = dm.acessorios.filter((a) => norm(a.cliente) === norm(enc.cliente))
  const jaTem = (item: string) => materiais.some((x) => norm(x.ref).includes(norm(item).split(' ')[0]))
  for (const a of tp.acessorios) {
    if (a.confianca === 'baixa') duvidas.push(`Confirmar acessório «${a.descricao}» (${pag(a.pagina)}).`)
    const embalagem = /saco|bag|hang|autocol|sticker|caixa|box|cabide|hanger/i.test(a.descricao)
    materiais.push({ id: uid('m'), ref: a.descricao, fornecedor: daCliente ? FORNECIDO_CLIENTE : a.fornecedor ?? 'A confirmar',
      obs: [daCliente && a.fornecedor ? `Fornecedor na ${doc}: ${a.fornecedor}` : '', a.observacoes ?? ''].filter(Boolean).join(' · '), consumo: a.consumo,
      unidade: 'un', cor: a.cor ?? 'A confirmar', folha: embalagem ? 'embalamento' : 'confecao' })
  }
  for (const a of doCliente) {
    if (jaTem(a.item)) continue
    const n = Number(a.consumo.match(/[\d.,]+/)?.[0]?.replace(',', '.'))
    materiais.push({ id: uid('m'), ref: a.item, fornecedor: daCliente ? FORNECIDO_CLIENTE : a.fornecedor, obs: 'Acessório fixo do cliente', consumo: Number.isFinite(n) ? n : null,
      unidade: 'un', cor: 'N/A', folha: /hang|saco|autocol/i.test(a.item) ? 'embalamento' : 'confecao' })
  }

  const operacoes: Operacao[] = tp.bordadosEstampados.map((b) => {
    if (b.confianca === 'baixa') duvidas.push(`Confirmar ${b.tipo.toLowerCase()} «${b.posicao}» (${pag(b.pagina)}).`)
    return { id: uid('o'), tipo: b.tipo, posicao: b.posicao, medidas: b.medidas ?? `Ver ${doc}`, fornecedor: b.fornecedor ?? 'A confirmar', cor: b.cor ?? `Ver ${doc}` }
  })

  for (const c of tp.campos) if (c.confianca === 'baixa') duvidas.push(`Confirmar «${c.campo}: ${c.valor}» (${pag(c.pagina)}).`)
  const lavagem = tp.campos.find((c) => /lav|wash|ting|dye|tint/i.test(c.campo))?.valor

  const medidas: Medida[] = tp.medidas?.pontos.length
    ? tp.medidas.pontos.map((p) => ({ ponto: p.ponto, valores: m.escala.map((_, i) => p.valores[i] ?? null), graduacao: '', techPack: true }))
    : []

  const observacoes = [
    of ? `Seguir a OF do cliente · ref. ${tp.referencia} (${tp.nome}).` : `Seguir o tech pack · ref. ${tp.referencia} (${tp.nome}).`,
    ...(daCliente ? ['Acessórios e embalagem fornecidos pelo cliente (entregues com a OF).'] : []),
    ...(tp.composicao ? [`Composição: ${tp.composicao}.`] : []),
    ...tp.campos.filter((c) => c.confianca !== 'baixa').map((c) => `${c.campo}: ${c.valor}.`),
    ...tp.observacoes,
    ...(cfg?.notasFixas ?? []),
    ...(enc.notas ?? []).filter((n) => !/^Data de entrega|^Pergunta do cliente/i.test(n)),
  ]

  return {
    ...m,
    techPack: true, estado: 'rascunho',
    tipoPeca: m.tipoPeca === 'A definir' && tp.tipoPeca ? tp.tipoPeca : m.tipoPeca,
    tecido: materiais.find((x) => x.folha === 'tecido')?.ref, lavagem: lavagem ?? m.lavagem,
    variantes: m.variantes.map((v) => ({ ...v, fichaGerada: true })),
    materiais, operacoes,
    observacoes: [...new Set(observacoes)],
    novasObservacoes: [...duvidas, ...tp.pedidos.map((p) => `Pedido do cliente: ${p}`)],
    medidas, medidasBase: tp.medidas?.tamanhoBase ?? undefined,
    versoes: [{ n: 1, titulo: `gerada da encomenda e ${of ? 'da OF' : 'do tech pack'} (leitura com IA)`, descricao: `${materiais.length} materiais, ${operacoes.length} operações, ${duvidas.length} valores a confirmar.`, data: hojeISO() }],
  }
}
