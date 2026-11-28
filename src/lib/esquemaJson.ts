// Acerta uma resposta da IA ao esquema JSON pedido, quando o fornecedor não pôde garantir o formato
// (o esquema da leitura de emails é grande demais para o «structured outputs» estrito dos fornecedores do Claude).
// Campos em falta ficam vazios/null, «confianca» em falta fica «baixa», números em texto passam a números.
// O bloco entre os marcadores está COPIADO em supabase/functions/ler-email/index.ts; o teste
// tests/unidade/esquema-json.spec.ts confirma que as duas cópias são iguais.

// ==== INÍCIO ajustarAoEsquema ====
export type EsquemaJson = { type?: string | readonly string[]; properties?: Record<string, EsquemaJson>; items?: EsquemaJson; enum?: readonly unknown[] }

/** Devolve o valor com a forma exata do esquema: só as propriedades do esquema, todas presentes, nos tipos certos.
 *  Num enum, o valor em falta ou desconhecido passa ao ÚLTIMO da lista (o mais prudente: «baixa», «outro»). */
export function ajustarAoEsquema(v: unknown, e: EsquemaJson): unknown {
  const tipos: readonly string[] = Array.isArray(e.type) ? e.type : e.type ? [e.type as string] : []
  const tem = (t: string) => tipos.includes(t)
  const numero = tem('integer') || tem('number')
  if (v === undefined || v === null) {
    if (tem('null')) return null
    if (tem('object')) return ajustarAoEsquema({}, e)
    if (tem('array')) return []
    if (e.enum) return e.enum[e.enum.length - 1]
    if (tem('string')) return ''
    if (numero) return 0
    if (tem('boolean')) return false
    return null
  }
  if (tem('object') && e.properties) {
    if (typeof v !== 'object' || Array.isArray(v)) return tem('null') ? null : ajustarAoEsquema({}, e)
    const o = v as Record<string, unknown>
    return Object.fromEntries(Object.entries(e.properties).map(([k, sub]) => [k, ajustarAoEsquema(o[k], sub)]))
  }
  if (tem('array')) {
    if (!Array.isArray(v)) return tem('null') ? null : []
    return e.items ? v.map((x) => ajustarAoEsquema(x, e.items!)) : v
  }
  if (e.enum) {
    if (e.enum.includes(v)) return v
    const igual = e.enum.find((x) => typeof x === 'string' && typeof v === 'string' && x.toLowerCase() === v.trim().toLowerCase())
    return igual ?? e.enum[e.enum.length - 1]
  }
  if (numero) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(/\s/g, '').replace(',', '.')) : NaN
    if (Number.isFinite(n)) return tem('integer') ? Math.round(n) : n
    return tem('null') ? null : 0
  }
  if (tem('string') && typeof v !== 'string') return typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (tem('boolean') && typeof v !== 'boolean') return v === 'true' || v === 1
  return v
}
// ==== FIM ajustarAoEsquema ====
