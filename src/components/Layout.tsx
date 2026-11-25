import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, Check, ChevronDown, Cloud, ClipboardList, Database, FileClock, History, KeyRound, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, Receipt } from 'lucide-react'
import { useDb } from '../store/db'
import { fichasPorAprovar } from '../lib/calc'
import { Toasts } from './ui'
import { modoServidor } from '../lib/supabase'

function Item({ para, icone, children, fim }: { para: string; icone?: ReactNode; children: ReactNode; fim?: boolean }) {
  return (
    <NavLink to={para} end={fim}
      className={({ isActive }) => clsx(
        'relative flex items-center gap-3 h-10 px-3 rounded-controlo text-[15px] transition-colors',
        isActive ? 'bg-fundo text-tinta font-medium border border-linha before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-tinta' : 'text-tinta-2 hover:bg-fundo/70',
      )}>
      {icone && <span className="text-suave">{icone}</span>}
      {children}
    </NavLink>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(true)
  return (
    <div className="border-t border-linha pt-4 pb-3 px-3">
      <button onClick={() => setAberto(!aberto)} className="w-full flex items-center justify-between px-3 mb-2 text-[15px] font-semibold text-tinta">
        {titulo}
        <ChevronDown size={15} className={clsx('text-tenue transition-transform', !aberto && '-rotate-90')} />
      </button>
      {aberto && <div className="space-y-1 pl-3">{children}</div>}
    </div>
  )
}

function Sino() {
  const encomendas = useDb((s) => s.encomendas)
  const pedidos = useDb((s) => s.pedidos)
  const nav = useNavigate()
  const [aberto, setAberto] = useState(false)
  const itens = [
    ...encomendas.flatMap((e) => e.modelos.filter((m) => m.estado === 'rascunho').map((m) => ({
      texto: `Ficha por aprovar: ${m.nome}`, sub: `${e.cliente} · ${e.colecao}`, para: `/fichas/${e.id}/${m.id}`,
    }))),
    ...pedidos.filter((p) => p.estado === 'Por validar').map((p) => ({ texto: `Orçamento por validar: ${p.peca}`, sub: p.cliente, para: `/orcamentos/${p.id}` })),
  ]
  return (
    <div className="relative">
      <button onClick={() => setAberto(!aberto)} className="relative p-1.5 text-suave hover:text-tinta" aria-label="Pendentes">
        <Bell size={18} />
        {itens.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-vermelho text-white text-[10px] font-semibold grid place-items-center">{itens.length}</span>}
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute left-0 top-9 z-40 w-80 bg-papel border border-linha rounded-cartao shadow-xl p-2">
            <p className="px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-suave">Pendentes</p>
            {itens.length === 0 && <p className="px-3 py-4 text-[14px] text-tenue">Nada por tratar.</p>}
            {itens.map((i, k) => (
              <button key={k} onClick={() => { setAberto(false); nav(i.para) }} className="w-full text-left px-3 py-2 rounded-md hover:bg-fundo">
                <p className="text-[14px]">{i.texto}</p><p className="text-[12px] text-tenue">{i.sub}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout() {
  const [recolhida, setRecolhida] = useState(false)
  const sair = useDb((s) => s.sair)
  const nome = useDb((s) => s.nomeUtilizador)
  const porAprovar = useDb((s) => s.encomendas.reduce((n, e) => n + fichasPorAprovar(e), 0))
  const aGuardar = useDb((s) => s.aGuardar)

  return (
    <div className="h-full flex">
      <aside className={clsx('no-print shrink-0 bg-papel border-r border-linha flex flex-col transition-[width] duration-200', recolhida ? 'w-0 overflow-hidden border-0' : 'w-[248px]')}>
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-2.5">
            <img src="/logo-mark.png" alt="" className="h-8 w-auto" />
            <span className="font-semibold text-[15px] tracking-tight whitespace-nowrap">Pereira & Cruz</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setRecolhida(true)} className="p-1.5 text-tenue hover:text-tinta" aria-label="Recolher a barra lateral"><PanelLeftClose size={17} /></button>
            <Sino />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto">
          <div className="px-3 pb-4 pt-1 space-y-1">
            <Item para="/" fim icone={<LayoutGrid size={17} />}>Painel</Item>
          </div>
          <Grupo titulo="Fichas de produção">
            <Item para="/fichas" icone={<ClipboardList size={17} />}>
              <span className="flex-1">Encomendas</span>
              {porAprovar > 0 && <span className="text-[11px] font-semibold bg-ouro-fraco text-ouro-texto rounded-full px-1.5">{porAprovar}</span>}
            </Item>
            <Item para="/dados" icone={<Database size={17} />}>Dados mestre</Item>
          </Grupo>
          <Grupo titulo="Pré-orçamentação">
            <Item para="/orcamentos" icone={<Receipt size={17} />}>Pedidos</Item>
            <Item para="/historico" icone={<History size={17} />}>Histórico de preços</Item>
          </Grupo>
        </nav>

        <div className="border-t border-linha px-3 py-3 space-y-1">
          <Item para="/atividade" icone={<FileClock size={16} />}>Registo de atividade</Item>
          <Item para="/conta" icone={<KeyRound size={16} />}>A minha conta</Item>
        </div>
        <div className="border-t border-linha px-4 py-3 flex items-center gap-3">
          <div className="relative size-9 rounded-full bg-tinta text-white grid place-items-center text-[13px] font-semibold">
            {nome.charAt(0)}
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-verde ring-2 ring-papel" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium leading-tight">{nome}</p>
            <p className="text-[12px] text-tenue flex items-center gap-1">{modoServidor
              ? (aGuardar ? <><Cloud size={11} className="animate-pulse" />A guardar…</> : <><Check size={11} className="text-verde" />Guardado</>)
              : 'Modo local'}</p>
          </div>
          <button onClick={sair} className="p-1.5 text-tenue hover:text-tinta" aria-label="Sair" title="Sair"><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative">
        {recolhida && (
          <button onClick={() => setRecolhida(false)} className="no-print absolute left-3 top-4 p-2 text-suave hover:text-tinta" aria-label="Abrir a barra lateral"><PanelLeftOpen size={18} /></button>
        )}
        <div className="max-w-[1180px] mx-auto px-8 py-8 min-h-full flex flex-col">
          <div className="flex-1"><Outlet /></div>
          <footer className="no-print mt-12 pt-5 border-t border-linha text-[11px] tracking-[0.12em] uppercase text-tenue text-right">© {new Date().getFullYear()} Pereira & Cruz</footer>
        </div>
      </main>
      <Toasts />
    </div>
  )
}
