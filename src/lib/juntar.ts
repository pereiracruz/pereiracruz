/**
 * Junção de duas alterações ao mesmo documento (encomenda, pedido, dados mestre…).
 *
 * base   = a versão que este aparelho tinha quando começou a alterar
 * minha  = a versão deste aparelho (com as alterações por gravar)
 * deles  = a versão que entretanto foi gravada noutro aparelho
 *
 * Campo a campo: o que só um dos lados alterou fica com essa alteração; o que os dois alteraram de forma
 * diferente fica com a alteração deste aparelho (a mais recente) e conta como conflito.
 * Listas de registos com identificador (modelos, variantes, compras, prazos, envios, guias…) juntam-se registo a registo:
 * um registo acrescentado num aparelho e outro acrescentado no outro ficam os dois.
 */

type Obj = Record<string, unknown>
const CHAVES = ['id', 'chave', 'etapa'] as const

const eObjeto = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export function iguais(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => iguais(x, b[i]))
  if (eObjeto(a) && eObjeto(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined), kb = Object.keys(b).filter((k) => b[k] !== undefined)
    return ka.length === kb.length && ka.every((k) => iguais(a[k], b[k]))
  }
  return false
}

/** Campo que identifica cada registo da lista (id, chave ou etapa), se todos o tiverem e sem repetições. */
function chaveDaLista(...listas: (unknown[] | undefined)[]): string | null {
  const todos = listas.flatMap((l) => l ?? [])
  if (!todos.length) return null
  for (const c of CHAVES) {
    if (!todos.every((x) => eObjeto(x) && (typeof x[c] === 'string' || typeof x[c] === 'number'))) continue
    if (listas.every((l) => !l || new Set(l.map((x) => (x as Obj)[c])).size === l.length)) return c
  }
  return null
}

export interface Resultado<T> { valor: T; conflitos: string[] }

export function juntar<T>(base: T | undefined, minha: T, deles: T): Resultado<T> {
  const conflitos: string[] = []
  const valor = j(base, minha, deles, '', conflitos) as T
  return { valor, conflitos }
}

function j(b: unknown, m: unknown, d: unknown, caminho: string, conflitos: string[]): unknown {
  if (iguais(m, d)) return m
  if (iguais(m, b)) return d
  if (iguais(d, b)) return m
  // os dois lados alteraram
  if (eObjeto(m) && eObjeto(d)) return objetos(eObjeto(b) ? b : {}, m, d, caminho, conflitos)
  if (Array.isArray(m) && Array.isArray(d)) {
    const bl = Array.isArray(b) ? b : undefined
    const c = chaveDaLista(bl, m, d)
    if (c) return listas(bl ?? [], m as Obj[], d as Obj[], c, caminho, conflitos)
  }
  conflitos.push(caminho || '(documento)')
  return m
}

function objetos(b: Obj, m: Obj, d: Obj, caminho: string, conflitos: string[]): Obj {
  const out: Obj = {}
  for (const k of new Set([...Object.keys(m), ...Object.keys(d), ...Object.keys(b)])) {
    const v = j(b[k], m[k], d[k], caminho ? `${caminho}.${k}` : k, conflitos)
    if (v !== undefined) out[k] = v
  }
  return out
}

function listas(b: unknown[], m: Obj[], d: Obj[], c: string, caminho: string, conflitos: string[]): Obj[] {
  const id = (x: unknown) => String((x as Obj)[c])
  const mb = new Map(b.map((x) => [id(x), x])), mm = new Map(m.map((x) => [id(x), x])), md = new Map(d.map((x) => [id(x), x]))
  const resultado = new Map<string, Obj>()
  for (const k of new Set([...mm.keys(), ...md.keys(), ...mb.keys()])) {
    const vb = mb.get(k), vm = mm.get(k), vd = md.get(k)
    const sub = `${caminho}[${k}]`
    if (vm && vd) { resultado.set(k, j(vb, vm, vd, sub, conflitos) as Obj); continue }
    if (vm && !vd) {
      // apagado no outro aparelho: só desaparece se aqui não foi alterado
      if (!vb) resultado.set(k, vm)
      else if (!iguais(vm, vb)) { resultado.set(k, vm); conflitos.push(sub) }
      continue
    }
    if (vd && !vm) {
      if (!vb) resultado.set(k, vd)
      else if (!iguais(vd, vb)) { resultado.set(k, vd); conflitos.push(sub) }
    }
  }
  // ordem: a deste aparelho se a mudou; senão a do outro; os registos que faltarem vão para o fim
  const ordemMudou = !iguais(m.map(id).filter((k) => mb.has(k)), b.map(id).filter((k) => mm.has(k)))
  const ordem = [...(ordemMudou ? m : d).map(id), ...(ordemMudou ? d : m).map(id)]
  return [...new Set(ordem)].filter((k) => resultado.has(k)).map((k) => resultado.get(k)!)
}
