import { useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ClipboardList, Receipt, Search, Shirt, X } from 'lucide-react'
import { useDb } from '../store/db'
import { nomeTipo, pesquisar, type TipoResultado } from '../lib/pesquisa'

const ICONES: Record<TipoResultado, typeof Search> = { encomenda: ClipboardList, modelo: Shirt, pedido: Receipt }
const ABRIR = 'pesquisa:abrir'

/** Abre a pesquisa geral (de qualquer sítio). */
export const abrirPesquisa = () => window.dispatchEvent(new Event(ABRIR))

/** Caixa que abre a pesquisa (barra lateral no computador). */
export function CaixaPesquisa() {
  const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  return (
    <button onClick={abrirPesquisa}
      className="w-full flex items-center gap-2 h-9 px-3 rounded-controlo border border-linha bg-fundo text-[13px] text-tenue hover:border-tinta/30 hover:text-suave">
      <Search size={15} />
      <span className="flex-1 text-left">Pesquisar…</span>
      <kbd className="hidden lg:inline text-[11px] font-sans border border-linha rounded px-1">{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}

/** Janela da pesquisa: encomendas, modelos, referências, OF e pedidos. Atalhos: Ctrl/⌘+K ou «/». */
export function JanelaPesquisa() {
  const [aberta, setAberta] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const encomendas = useDb((s) => s.encomendas)
  const pedidos = useDb((s) => s.pedidos)
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)

  const resultados = useMemo(() => (aberta ? pesquisar(q, encomendas, pedidos) : []), [aberta, q, encomendas, pedidos])

  useEffect(() => {
    const abrir = () => { setAberta(true); setQ(''); setSel(0) }
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      const aEscrever = !!alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); abrir() }
      else if (e.key === '/' && !aEscrever && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); abrir() }
    }
    window.addEventListener(ABRIR, abrir)
    window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener(ABRIR, abrir); window.removeEventListener('keydown', tecla) }
  }, [])

  useEffect(() => { if (aberta) setTimeout(() => input.current?.focus(), 0) }, [aberta])
  useEffect(() => { setSel(0) }, [q])
  useEffect(() => { lista.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel])

  if (!aberta) return null
  const fechar = () => setAberta(false)
  const ir = (i: number) => { const r = resultados[i]; if (r) { fechar(); nav(r.para) } }
  const teclas = (e: TeclaReact) => {
    if (e.key === 'Escape') fechar()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); ir(sel) }
  }

  return (
    <div className="fixed inset-0 z-50 no-print flex justify-center sm:items-start sm:pt-[12vh] sm:px-4" role="dialog" aria-modal aria-label="Pesquisa">
      <div className="absolute inset-0 bg-tinta/25 backdrop-blur-[3px]" onClick={fechar} />
      <div className="relative w-full sm:max-w-xl bg-papel sm:rounded-painel shadow-2xl sm:border border-linha flex flex-col h-full sm:h-auto sm:max-h-[70vh] pt-[env(safe-area-inset-top)] sm:pt-0">
        <div className="flex items-center gap-2 px-4 border-b border-linha">
          <Search size={18} className="text-tenue shrink-0" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={teclas}
            type="search" enterKeyHint="go" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            placeholder="Encomenda, modelo, referência, OF…"
            className="flex-1 h-14 bg-transparent outline-none text-[16px] placeholder:text-tenue" />
          <button onClick={fechar} className="p-2 -mr-2 text-tenue hover:text-tinta" aria-label="Fechar a pesquisa"><X size={20} /></button>
        </div>
        <div ref={lista} className="flex-1 overflow-y-auto py-2 pb-[env(safe-area-inset-bottom)]">
          {q.trim().length < 2
            ? <p className="px-5 py-6 text-[13px] text-suave">Escreva parte do nome do cliente, da coleção ou do modelo, uma referência (ex.: 7E27JANETAW), o nº interno (ex.: E26-082) ou o nº da OF.</p>
            : resultados.length === 0
              ? <p className="px-5 py-6 text-[13px] text-suave">Nada encontrado para «{q.trim()}».</p>
              : resultados.map((r, i) => {
                const Icone = ICONES[r.tipo]
                const novoGrupo = i === 0 || resultados[i - 1].tipo !== r.tipo
                return (
                  <div key={r.chave}>
                    {novoGrupo && <p className="px-5 pt-3 pb-1 text-[11px] uppercase tracking-wider text-tenue">{nomeTipo(r.tipo)}</p>}
                    <button data-i={i} onClick={() => ir(i)} onMouseMove={() => sel !== i && setSel(i)}
                      className={clsx('w-full flex items-start gap-3 px-5 py-2.5 text-left', i === sel && 'bg-fundo')}>
                      <Icone size={16} className="text-suave mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium truncate">{r.titulo}</span>
                        <span className="block text-[12px] text-suave truncate">{r.detalhe}</span>
                        {r.onde && <span className="block text-[12px] text-ouro-texto truncate">{r.onde}</span>}
                      </span>
                    </button>
                  </div>
                )
              })}
        </div>
      </div>
    </div>
  )
}
