// Junta a leitura com IA de um email feita por partes (uma por documento + uma final com o texto do email).
// Cada chamada ao servidor tem ~150 s; um email com vários tech packs não cabe numa só resposta da IA.
// O bloco entre os marcadores está COPIADO em supabase/functions/ler-email/index.ts; o teste
// tests/unidade/juntar-leituras.spec.ts confirma que as duas cópias são iguais.

// ==== INÍCIO juntarLeituras ====
type Obj = Record<string, unknown>
const lista = (x: unknown): Obj[] => (Array.isArray(x) ? (x as Obj[]) : [])
const chaveTexto = (x: unknown) => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const semRepetidos = <T>(xs: T[], chave: (x: T) => string) => {
  const vistos = new Set<string>()
  return xs.filter((x) => { const k = chave(x); if (!k || vistos.has(k)) return false; vistos.add(k); return true })
}

/** Junta a leitura final (texto do email) com as leituras parciais (uma por documento).
 *  Da final: classificação, idioma, resumo, pedido de preço. Das parciais: tech packs e encomendas (os documentos).
 *  Cliente: o da final, completado com o das parciais. Anexos e dúvidas: todos, sem repetidos. */
export function juntarLeituras(final: Obj, parciais: Obj[]): Obj {
  const todas = [...parciais, final]
  // tech pack: os modelos de todos os documentos
  const tps = todas.map((l) => l.techpack as Obj | null).filter((t): t is Obj => !!t)
  const modelos = semRepetidos(tps.flatMap((t) => lista(t.modelos)), (m) => `${chaveTexto(m.referencia)}|${chaveTexto(m.nome)}`)
  const techpack = tps.length
    ? { marca: tps.map((t) => t.marca).find(Boolean) ?? null, colecao: tps.map((t) => t.colecao).find(Boolean) ?? null, modelos }
    : null
  // encomenda: a primeira como base, com as linhas, notas e perguntas de todas
  const encs = todas.map((l) => l.encomenda as Obj | null).filter((e): e is Obj => !!e)
  const encomenda = encs.length ? {
    ...encs[0],
    linhas: encs.flatMap((e) => lista(e.linhas)),
    notas: semRepetidos(encs.flatMap((e) => (Array.isArray(e.notas) ? (e.notas as string[]) : [])), chaveTexto),
    perguntas: semRepetidos(encs.flatMap((e) => (Array.isArray(e.perguntas) ? (e.perguntas as string[]) : [])), chaveTexto),
  } : null
  // cliente: campos em falta na final vêm das parciais
  const cliente: Obj = { ...((final.cliente as Obj) ?? {}) }
  for (const p of parciais) for (const [k, v] of Object.entries((p.cliente as Obj) ?? {})) if (cliente[k] == null && v != null) cliente[k] = v
  // anexos: a descrição feita ao ler o próprio documento tem prioridade
  const anexos = semRepetidos([...parciais.flatMap((p) => lista(p.anexos)), ...lista(final.anexos)], (a) => chaveTexto(a.nome))
  const textos = (l: Obj) => (Array.isArray(l.duvidas) ? (l.duvidas as string[]) : [])
  const duvidas = semRepetidos([...textos(final), ...parciais.flatMap(textos)], chaveTexto)
  return {
    ...final,
    cliente, anexos, encomenda, techpack,
    pedidoPreco: final.pedidoPreco ?? parciais.map((p) => p.pedidoPreco).find(Boolean) ?? null,
    duvidas,
  }
}

/** Resumo curto de uma leitura parcial, para a leitura final saber o que os documentos já disseram. */
export function resumoParcial(nome: string, l: Obj): Obj {
  const tp = l.techpack as Obj | null
  return {
    anexo: nome, resumo: l.resumo ?? '',
    modelos: lista(tp?.modelos).map((m) => ({ referencia: m.referencia, nome: m.nome, tipoPeca: m.tipoPeca, composicao: m.composicao, tamanhos: m.tamanhos,
      tecidos: lista(m.tecidos).map((t) => t.descricao), acessorios: lista(m.acessorios).map((a) => a.descricao), lavagem: lista(m.campos).filter((c) => /lavag|wash|tratam/i.test(String(c.campo))).map((c) => c.valor) })),
    linhasEncomenda: lista((l.encomenda as Obj | null)?.linhas).length,
    duvidas: Array.isArray(l.duvidas) ? l.duvidas : [],
  }
}
// ==== FIM juntarLeituras ====
