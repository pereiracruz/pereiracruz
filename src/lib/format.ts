const nf0 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nfN = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 })

/** 1357 -> "1 357" (agrupamento também para 4 dígitos) */
export const int = (n: number) => nf0.format(n).replace(/\./g, ' ').replace(/^(\d)(\d{3})$/, '$1 $2')
export const num = (n: number) => nfN.format(n)
export const eur = (n: number) => `${nf2.format(n).replace(/\./g, ' ')} €`
export const dec2 = (n: number) => nf2.format(n)

export const dataCurta = (iso?: string) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export const dataLonga = (d = new Date()) => {
  const s = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const hojeISO = () => new Date().toISOString().slice(0, 10)
export const agoraISO = () => new Date().toISOString()
export const dataHora = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Converte "1,25" ou "1.25" em número; vazio -> null */
export const parseNum = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const uid = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 9)}`
export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
