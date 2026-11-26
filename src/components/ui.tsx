import { useEffect, useMemo, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react'

// ---------------- Botões ----------------
type BtnVar = 'primario' | 'secundario' | 'fantasma' | 'perigo'
export function Botao({ variante = 'secundario', icone, className, children, pequeno, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: BtnVar; icone?: ReactNode; pequeno?: boolean }) {
  return (
    <button
      {...p}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-controlo font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap',
        pequeno ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        variante === 'primario' && 'bg-tinta text-white hover:bg-tinta-2',
        variante === 'secundario' && 'bg-papel border border-linha text-tinta hover:bg-fundo',
        variante === 'fantasma' && 'text-suave hover:text-tinta hover:bg-fundo-2/60',
        variante === 'perigo' && 'bg-papel border border-vermelho-borda text-vermelho hover:bg-vermelho-fraco',
        className,
      )}
    >
      {icone}{children}
    </button>
  )
}

// ---------------- Cartões ----------------
export const Cartao = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={clsx('bg-papel border border-linha rounded-cartao', className)}>{children}</div>
)

export function CartaoTitulo({ titulo, sub, acao, icone }: { titulo: ReactNode; sub?: ReactNode; acao?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
      <div className="flex gap-3">
        {icone && <div className="mt-0.5 text-suave">{icone}</div>}
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight">{titulo}</h3>
          {sub && <p className="text-[13px] text-suave mt-0.5">{sub}</p>}
        </div>
      </div>
      {acao}
    </div>
  )
}

export function Kpi({ rotulo, valor, sub, ativo, onClick, icone, tom }: {
  rotulo: string; valor: ReactNode; sub?: ReactNode; ativo?: boolean; onClick?: () => void; icone?: ReactNode; tom?: 'verde' | 'ambar' | 'vermelho'
}) {
  const C = onClick ? 'button' : 'div'
  return (
    <C
      onClick={onClick}
      className={clsx(
        'text-left bg-papel border rounded-cartao p-5 min-h-[120px] flex flex-col transition-colors',
        ativo ? 'border-tinta ring-1 ring-tinta' : 'border-linha',
        onClick && 'hover:border-linha-forte cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between w-full">
        <span className="text-[13px] text-suave">{rotulo}</span>
        {icone && (
          <span className={clsx('size-6 rounded-md grid place-items-center',
            tom === 'verde' ? 'bg-verde-fraco text-verde' : tom === 'ambar' ? 'bg-ambar-fraco text-ambar' : tom === 'vermelho' ? 'bg-vermelho-fraco text-vermelho' : 'bg-fundo-2 text-suave')}>
            {icone}
          </span>
        )}
      </div>
      <span className="text-[28px] font-semibold tracking-tight mt-2 num">{valor}</span>
      {sub && <span className="text-[12px] text-tenue mt-auto">{sub}</span>}
    </C>
  )
}

// ---------------- Etiquetas ----------------
export type Tom = 'verde' | 'ambar' | 'vermelho' | 'azul' | 'neutro' | 'ouro'
const TONS: Record<Tom, string> = {
  verde: 'bg-verde-fraco border-verde-borda text-verde',
  ambar: 'bg-ambar-fraco border-ambar-borda text-ambar',
  vermelho: 'bg-vermelho-fraco border-vermelho-borda text-vermelho',
  azul: 'bg-azul-fraco border-azul-borda text-azul',
  neutro: 'bg-papel border-linha text-tinta-2',
  ouro: 'bg-ouro-fraco border-ouro/40 text-ouro-texto',
}
export const Etiqueta = ({ tom = 'neutro', children, ponto = true }: { tom?: Tom; children: ReactNode; ponto?: boolean }) => (
  <span className={clsx('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-[12px] font-medium whitespace-nowrap', TONS[tom])}>
    {ponto && <span className="size-1.5 rounded-full bg-current" />}{children}
  </span>
)

export const EtiquetaIA = () => (
  <span className="inline-grid place-items-center h-4 px-1 rounded-[3px] bg-tinta text-ouro text-[9px] font-bold tracking-wider">IA</span>
)

export function Confianca({ nivel }: { nivel: 'alta' | 'media' | 'baixa' }) {
  const n = nivel === 'alta' ? 3 : nivel === 'media' ? 2 : 1
  const cor = nivel === 'alta' ? 'bg-verde' : nivel === 'media' ? 'bg-ambar' : 'bg-vermelho'
  return (
    <span className="inline-flex items-end gap-[2px] h-3" title={`Confiança ${nivel === 'media' ? 'média' : nivel}`}>
      {[1, 2, 3].map((i) => <span key={i} className={clsx('w-[3px] rounded-[1px]', i <= n ? cor : 'bg-linha-forte')} style={{ height: 4 + i * 3 }} />)}
    </span>
  )
}

// ---------------- Cabeçalho de página ----------------
export function Cabecalho({ migalhas, sobre, titulo, extra, sub, acoes }: {
  migalhas?: { rotulo: string; para?: string }[]; sobre?: string; titulo: ReactNode; extra?: ReactNode; sub?: ReactNode; acoes?: ReactNode
}) {
  return (
    <header className="mb-5 pb-5 lg:mb-6 lg:pb-6 border-b border-linha">
      {migalhas && (
        <nav className="flex items-center gap-1.5 text-[13px] text-suave mb-4 lg:mb-5 no-print flex-wrap">
          {migalhas.map((m, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={13} className="text-tenue" />}
              {m.para ? <Link to={m.para} className="hover:text-tinta">{m.rotulo}</Link> : <span className="text-tinta">{m.rotulo}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-end justify-between gap-4 lg:gap-6 flex-wrap">
        <div className="min-w-0">
          {sobre && <p className="text-[13px] text-suave mb-1">{sobre}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[24px] sm:text-[28px] lg:text-[32px] font-semibold tracking-[-0.02em] leading-tight break-words">{titulo}</h1>
            {extra}
          </div>
          {sub && <p className="text-[14px] text-suave mt-1.5">{sub}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2 no-print flex-wrap">{acoes}</div>}
      </div>
    </header>
  )
}

// ---------------- Passos ----------------
export function Passos({ passos, atual }: { passos: string[]; atual: number }) {
  return (
    <ol className="flex items-center gap-3 flex-wrap mb-6">
      {passos.map((p, i) => (
        <li key={p} className="flex items-center gap-3">
          {i > 0 && <span className="w-6 h-px bg-linha-forte" />}
          <span className={clsx('flex items-center gap-2 text-[14px]', i <= atual ? 'text-tinta' : 'text-tenue', i === atual && 'font-medium')}>
            {i < atual ? (
              <span className="size-5 rounded-full bg-tinta text-white grid place-items-center"><Check size={12} strokeWidth={3} /></span>
            ) : (
              <span className={clsx('size-5 rounded-full border-2', i === atual ? 'border-ouro' : 'border-linha-forte')} />
            )}
            {p}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ---------------- Separadores ----------------
export function Pilulas<T extends string>({ opcoes, valor, onChange, className }: { opcoes: { id: T; rotulo: ReactNode }[]; valor: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx('inline-flex p-1 bg-papel border border-linha rounded-full gap-1 flex-wrap', className)}>
      {opcoes.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={clsx('h-9 px-4 rounded-full text-[14px] transition-colors', valor === o.id ? 'bg-tinta text-white' : 'text-tinta-2 hover:bg-fundo')}>
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ opcoes, valor, onChange }: { opcoes: { id: T; rotulo: ReactNode }[]; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {opcoes.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={clsx('h-8 px-3 rounded-md border text-[14px] transition-colors', valor === o.id ? 'bg-tinta border-tinta text-white' : 'bg-papel border-linha text-tinta-2 hover:border-linha-forte')}>
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

// ---------------- Formulários ----------------
export const Campo = ({ rotulo, children, ajuda }: { rotulo: string; children: ReactNode; ajuda?: ReactNode }) => (
  <label className="block">
    <span className="block text-[13px] font-medium text-tinta-2 mb-1.5">{rotulo}</span>
    {children}
    {ajuda && <span className="block text-[12px] text-tenue mt-1">{ajuda}</span>}
  </label>
)
export const Entrada = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={clsx('w-full h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px] outline-none focus:border-tinta-2 focus:ring-2 focus:ring-ouro/25 placeholder:text-tenue', className)} />
)
export function Seletor({ valor, onChange, opcoes, className, vazio }: { valor: string; onChange: (v: string) => void; opcoes: string[]; className?: string; vazio?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <select value={valor} onChange={(e) => onChange(e.target.value)}
        className={clsx('w-full h-10 pl-3 pr-8 appearance-none rounded-controlo border border-linha bg-papel text-[14px] outline-none focus:border-tinta-2', !valor && 'text-tenue')}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tenue pointer-events-none" />
    </div>
  )
}

// ---------------- Janela modal ----------------
export function Modal({ aberto, onFechar, titulo, sub, children, rodape, largura = 'max-w-lg' }: {
  aberto: boolean; onFechar: () => void; titulo: string; sub?: string; children: ReactNode; rodape?: ReactNode; largura?: string
}) {
  useEffect(() => {
    if (!aberto) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 no-print" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-tinta/25 backdrop-blur-[3px]" onClick={onFechar} />
      <div className={clsx('relative w-full bg-papel rounded-painel shadow-2xl border border-linha max-h-[90vh] flex flex-col', largura)}>
        <div className="flex items-start justify-between px-6 pt-5">
          <div>
            <h2 className="text-[18px] font-semibold">{titulo}</h2>
            {sub && <p className="text-[14px] text-suave mt-1">{sub}</p>}
          </div>
          <button onClick={onFechar} className="text-tenue hover:text-tinta p-1"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 overflow-auto">{children}</div>
        {rodape && <div className="px-6 py-4 border-t border-linha flex justify-end gap-2">{rodape}</div>}
      </div>
    </div>
  )
}

// ---------------- Avisos ----------------
export function Aviso({ tom = 'ambar', titulo, children, icone }: { tom?: Tom; titulo: ReactNode; children?: ReactNode; icone?: ReactNode }) {
  return (
    <div className={clsx('rounded-cartao border px-5 py-4 flex gap-3', TONS[tom])}>
      {icone && <span className="mt-0.5">{icone}</span>}
      <div className="text-tinta">
        <p className="font-semibold text-[14px]">{titulo}</p>
        {children && <div className="text-[13px] text-tinta-2 mt-0.5">{children}</div>}
      </div>
    </div>
  )
}

export const Vazio = ({ children }: { children: ReactNode }) => (
  <div className="py-12 text-center text-[14px] text-tenue">{children}</div>
)

// ---------------- Tabela com filtros por coluna ----------------
export interface Coluna<T> {
  id: string
  rotulo: string
  valor: (r: T) => string | number
  render?: (r: T) => ReactNode
  filtro?: 'texto' | 'lista' | 'data'
  alinhar?: 'esq' | 'centro' | 'dir'
  largura?: string
}

const filtroData = (iso: string, f: string) => {
  const d = new Date(iso + 'T00:00:00'); const h = new Date(); h.setHours(0, 0, 0, 0)
  const dias = (d.getTime() - h.getTime()) / 864e5
  switch (f) {
    case 'Próximos 7 dias': return dias >= 0 && dias <= 7
    case 'Este mês': return d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear()
    case 'Este ano': return d.getFullYear() === h.getFullYear()
    case 'Já passou': return dias < 0
    case 'Depois de hoje': return dias > 0
    default: return true
  }
}

export function Tabela<T>({ colunas, linhas, chave, onLinha, acaoLinha, vazio = 'Sem resultados.', filtroExterno }: {
  colunas: Coluna<T>[]; linhas: T[]; chave: (r: T) => string; onLinha?: (r: T) => void; acaoLinha?: (r: T) => ReactNode; vazio?: string
  filtroExterno?: (r: T) => boolean
}) {
  const [f, setF] = useState<Record<string, string>>({})
  const temFiltros = colunas.some((c) => c.filtro)
  const visiveis = useMemo(() => linhas.filter((r) => {
    if (filtroExterno && !filtroExterno(r)) return false
    return colunas.every((c) => {
      const v = f[c.id]; if (!v) return true
      const val = String(c.valor(r))
      if (c.filtro === 'texto') return val.toLowerCase().includes(v.toLowerCase())
      if (c.filtro === 'data') return filtroData(val, v)
      return val === v
    })
  }), [linhas, f, colunas, filtroExterno])

  const al = (a?: string) => (a === 'dir' ? 'text-right' : a === 'centro' ? 'text-center' : 'text-left')
  return (
    <div className="bg-papel border border-linha rounded-cartao overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="bg-fundo/50">
            {colunas.map((c) => (
              <th key={c.id} className={clsx('px-4 pt-4 pb-2 text-[11px] font-semibold tracking-[0.08em] uppercase text-suave', al(c.alinhar))} style={{ width: c.largura }}>
                {c.rotulo}
              </th>
            ))}
            {acaoLinha && <th />}
          </tr>
          {temFiltros && (
            <tr className="bg-fundo/50 border-b border-linha">
              {colunas.map((c) => (
                <th key={c.id} className="px-4 pb-3 font-normal">
                  {c.filtro === 'texto' && (
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tenue" />
                      <input value={f[c.id] ?? ''} onChange={(e) => setF({ ...f, [c.id]: e.target.value })} placeholder={c.rotulo.charAt(0) + c.rotulo.slice(1).toLowerCase()}
                        className="w-full min-w-[90px] h-8 pl-7 pr-2 rounded-md border border-linha bg-papel text-[13px] outline-none focus:border-tinta-2 placeholder:text-tenue" />
                    </div>
                  )}
                  {(c.filtro === 'lista' || c.filtro === 'data') && (
                    <Seletor className="min-w-[110px] [&_select]:h-8 [&_select]:text-[13px]" valor={f[c.id] ?? ''} onChange={(v) => setF({ ...f, [c.id]: v })}
                      vazio={c.rotulo.charAt(0) + c.rotulo.slice(1).toLowerCase()}
                      opcoes={c.filtro === 'data'
                        ? ['Próximos 7 dias', 'Este mês', 'Este ano', 'Já passou', 'Depois de hoje']
                        : [...new Set(linhas.map((r) => String(c.valor(r))))].sort((a, b) => a.localeCompare(b, 'pt'))} />
                  )}
                </th>
              ))}
              {acaoLinha && <th />}
            </tr>
          )}
        </thead>
        <tbody>
          {visiveis.map((r) => (
            <tr key={chave(r)} onClick={onLinha ? () => onLinha(r) : undefined}
              className={clsx('border-b border-linha last:border-0', onLinha && 'cursor-pointer hover:bg-fundo/60')}>
              {colunas.map((c) => (
                <td key={c.id} className={clsx('px-4 py-3.5 num', al(c.alinhar), c.alinhar === 'dir' && 'whitespace-nowrap')}>{c.render ? c.render(r) : c.valor(r)}</td>
              ))}
              {acaoLinha && <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>{acaoLinha(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {visiveis.length === 0 && <Vazio>{vazio}</Vazio>}
    </div>
  )
}

// ---------------- Toast ----------------
let toastSet: ((s: string | null) => void) | null = null
export const aviso = (s: string) => toastSet?.(s)
export function Toasts() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { toastSet = setMsg; return () => { toastSet = null } }, [])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t) }, [msg])
  if (!msg) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-tinta text-white text-[14px] px-4 py-2.5 rounded-controlo shadow-xl flex items-center gap-2 no-print">
      <Check size={15} className="text-ouro" />{msg}
    </div>
  )
}
