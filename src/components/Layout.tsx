import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Archive, Bell, Landmark, Mail, CalendarClock, Check, Percent, ChevronDown, Cloud, ClipboardList, Database, ShoppingCart, FileClock, History, KeyRound, LayoutGrid, LogOut, Menu, PanelLeftClose, X, PanelLeftOpen, Receipt } from 'lucide-react'
import { useDb } from '../store/db'
import { fichasPorAprovar } from '../lib/calc'
import { situacaoPrazos } from '../lib/prazos'
import { resumoCompras } from '../lib/compras'
import { Toasts } from './ui'
import { modoServidor } from '../lib/supabase'
import { carregarEmails, emailDisponivel, emailsNovos, faturasNovas, useEmails, verificarEmails } from '../lib/email'

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

// Pendentes já vistos (ao abrir o sino): o número a vermelho só conta os novos.
// Pendentes limpos («Limpar»): saem da lista até aparecer um pendente novo (ou mudar, ex.: mais um dia de atraso).
const CHAVE_VISTOS = 'sino-vistos'
const CHAVE_LIMPOS = 'sino-limpos'
function ler(chave: string): string[] {
  try { return JSON.parse(localStorage.getItem(chave) || '[]') } catch { return [] }
}
function gravar(chave: string, v: string[]) {
  try { localStorage.setItem(chave, JSON.stringify(v)) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event('sino-vistos'))
}

function Sino({ direita }: { direita?: boolean }) {
  const encomendas = useDb((s) => s.encomendas)
  const pedidos = useDb((s) => s.pedidos)
  const emails = useEmails((s) => s.emails)
  const nav = useNavigate()
  const [aberto, setAberto] = useState(false)
  const todos = [
    ...encomendas.flatMap((e) => e.modelos.filter((m) => m.estado === 'rascunho').map((m) => ({
      texto: `Ficha por aprovar: ${m.nome}`, sub: `${e.cliente} · ${e.colecao}`, para: `/fichas/${e.id}/${m.id}`,
    }))),
    ...encomendas.filter((e) => e.estado !== 'Concluída').flatMap((e) => situacaoPrazos(e).alertas.map((a) => ({
      texto: a, sub: `${e.cliente} · ${e.colecao}`, para: `/fichas/${e.id}?aba=prazos`,
    }))),
    ...pedidos.filter((p) => p.estado === 'Por validar').map((p) => ({ texto: `Orçamento por validar: ${p.peca}`, sub: p.cliente, para: `/orcamentos/${p.id}` })),
    ...emails.filter((m) => m.estado === 'nova').map((m) => (m.tipo === 'fatura'
      ? { texto: `Fatura recebida: ${m.assunto}`, sub: m.deNome || m.de, para: '/faturas' }
      : { texto: `Email de encomenda: ${m.assunto}`, sub: m.deNome || m.de, para: `/emails#${m.id}` })),
  ]
  const [vistos, setVistos] = useState<string[]>(() => ler(CHAVE_VISTOS))
  const [limpos, setLimpos] = useState<string[]>(() => ler(CHAVE_LIMPOS))
  const [verLimpos, setVerLimpos] = useState(false)
  // os dois sinos (computador e telemóvel) ficam sincronizados
  useEffect(() => {
    const atualizar = () => { setVistos(ler(CHAVE_VISTOS)); setLimpos(ler(CHAVE_LIMPOS)) }
    window.addEventListener('sino-vistos', atualizar)
    window.addEventListener('storage', atualizar)
    return () => { window.removeEventListener('sino-vistos', atualizar); window.removeEventListener('storage', atualizar) }
  }, [])
  const chave = (i: { texto: string; para: string }) => `${i.para}|${i.texto}`
  const escondidos = todos.filter((i) => limpos.includes(chave(i))).length
  const itens = verLimpos ? todos : todos.filter((i) => !limpos.includes(chave(i)))
  const limpar = () => { const atuais = todos.map(chave); gravar(CHAVE_LIMPOS, atuais); setLimpos(atuais); setVerLimpos(false) }
  const novos = itens.filter((i) => !vistos.includes(chave(i))).length
  const abrir = () => {
    if (!aberto) {
      // guarda só os pendentes atuais, para a lista não crescer sem fim
      const atuais = itens.map(chave)
      gravar(CHAVE_VISTOS, atuais)
      setVistos(atuais)
    }
    setAberto(!aberto); setVerLimpos(false)
  }
  return (
    <div className="relative">
      <button onClick={abrir} className="relative p-1.5 text-suave hover:text-tinta" aria-label="Pendentes">
        <Bell size={18} />
        {novos > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-vermelho text-white text-[10px] font-semibold grid place-items-center">{novos}</span>}
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className={clsx('absolute top-9 z-40 w-80 max-w-[calc(100vw-2rem)] bg-papel', direita ? 'right-0' : 'left-0', 'border border-linha rounded-cartao shadow-xl p-2')}>
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-suave">Pendentes</p>
              {itens.length > 0 && <button onClick={limpar} className="text-[12px] font-medium text-suave hover:text-tinta">Limpar</button>}
            </div>
            {itens.length === 0 && <p className="px-3 py-4 text-[14px] text-tenue">Nada por tratar.</p>}
            {itens.map((i, k) => (
              <button key={k} onClick={() => { setAberto(false); nav(i.para) }} className="w-full text-left px-3 py-2 rounded-md hover:bg-fundo">
                <p className="text-[14px]">{i.texto}</p><p className="text-[12px] text-tenue">{i.sub}</p>
              </button>
            ))}
            {!verLimpos && escondidos > 0 && (
              <button onClick={() => setVerLimpos(true)} className="w-full text-left px-3 py-2 text-[12px] text-tenue hover:text-tinta border-t border-linha mt-1">
                Mostrar {escondidos} limpo{escondidos === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout() {
  const [recolhida, setRecolhida] = useState(false)
  // telemóvel: o menu abre por cima e fecha ao mudar de página
  const [menuAberto, setMenuAberto] = useState(false)
  const local = useLocation()
  useEffect(() => { setMenuAberto(false) }, [local.pathname, local.search])
  const sair = useDb((s) => s.sair)
  const nome = useDb((s) => s.nomeUtilizador)
  const porAprovar = useDb((s) => s.encomendas.reduce((n, e) => n + fichasPorAprovar(e), 0))
  const aGuardar = useDb((s) => s.aGuardar)
  const novosEmails = useEmails(emailsNovos)
  const novasFaturas = useEmails(faturasNovas)
  // emails de encomendas: carrega ao entrar e vai à caixa de correio de 10 em 10 minutos enquanto a aplicação está aberta
  useEffect(() => {
    if (!emailDisponivel) return
    void carregarEmails()
    const ir = () => { if (document.visibilityState === 'visible') verificarEmails().catch(() => { /* aparece na página dos emails */ }) }
    const primeira = setTimeout(ir, 5_000)
    const t = setInterval(ir, 10 * 60_000)
    return () => { clearTimeout(primeira); clearInterval(t) }
  }, [])
  const encomendas = useDb((s) => s.encomendas)
  const emCurso = encomendas.filter((e) => e.estado !== 'Concluída')
  const atrasadas = emCurso.filter((e) => situacaoPrazos(e).nivel === 'atrasada').length
  const porEncomendar = emCurso.reduce((n, e) => n + resumoCompras(e).porEncomendar, 0)
  const copiaEmFalta = useDb((s) => {
    const u = s.atividade.find((a) => a.acao === 'Cópia de segurança descarregada')
    return !u || Date.now() - new Date(u.data).getTime() > 7 * 864e5
  })

  return (
    <div className="h-full flex">
      {menuAberto && <div className="no-print fixed inset-0 z-40 bg-tinta/30 lg:hidden" onClick={() => setMenuAberto(false)} />}
      <aside className={clsx('no-print bg-papel border-r border-linha flex flex-col',
        'fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] max-lg:overflow-y-auto transition-transform duration-200 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]', menuAberto ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        'lg:relative lg:z-40 lg:max-w-none lg:translate-none lg:shadow-none lg:shrink-0 lg:transition-[width] lg:pt-0 lg:pb-0', recolhida ? 'lg:w-0 lg:overflow-hidden lg:border-0' : 'lg:w-[248px]')}>
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-2.5">
            <img src="/logo-mark.png" alt="" className="h-8 w-auto" />
            <span className="font-semibold text-[15px] tracking-tight whitespace-nowrap">Pereira's Project</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setRecolhida(true)} className="hidden lg:block p-1.5 text-tenue hover:text-tinta" aria-label="Recolher a barra lateral"><PanelLeftClose size={17} /></button>
            <span className="hidden lg:block"><Sino /></span>
            <button onClick={() => setMenuAberto(false)} className="lg:hidden p-2 text-tenue hover:text-tinta" aria-label="Fechar o menu"><X size={20} /></button>
          </div>
        </div>

        <nav className="flex-none lg:flex-1 lg:overflow-y-auto">
          <div className="px-3 pb-4 pt-1 space-y-1">
            <Item para="/" fim icone={<LayoutGrid size={17} />}>Painel</Item>
          </div>
          <Grupo titulo="Fichas de produção">
            <Item para="/fichas" icone={<ClipboardList size={17} />}>
              <span className="flex-1">Encomendas</span>
              {porAprovar > 0 && <span className="text-[11px] font-semibold bg-ouro-fraco text-ouro-texto rounded-full px-1.5">{porAprovar}</span>}
            </Item>
            {emailDisponivel && <Item para="/emails" icone={<Mail size={17} />}>
              <span className="flex-1">Emails de encomendas</span>
              {novosEmails > 0 && <span className="text-[11px] font-semibold bg-vermelho-fraco text-vermelho rounded-full px-1.5" title="Emails de encomendas por tratar">{novosEmails}</span>}
            </Item>}
            <Item para="/compras" icone={<ShoppingCart size={17} />}>
              <span className="flex-1">Compras</span>
              {porEncomendar > 0 && <span className="text-[11px] font-semibold bg-ambar-fraco text-ambar rounded-full px-1.5" title="Materiais por encomendar">{porEncomendar}</span>}
            </Item>
            <Item para="/prazos" icone={<CalendarClock size={17} />}>
              <span className="flex-1">Prazos</span>
              {atrasadas > 0 && <span className="text-[11px] font-semibold bg-vermelho-fraco text-vermelho rounded-full px-1.5" title="Encomendas atrasadas">{atrasadas}</span>}
            </Item>
            <Item para="/dados" icone={<Database size={17} />}>Dados mestre</Item>
          </Grupo>
          <Grupo titulo="Pré-orçamentação">
            <Item para="/orcamentos" icone={<Receipt size={17} />}>Pedidos</Item>
            <Item para="/historico" icone={<History size={17} />}>Histórico de preços</Item>
            <Item para="/margens" icone={<Percent size={17} />}>Margens</Item>
          </Grupo>
          {modoServidor && <Grupo titulo="Financeiro">
            <Item para="/faturas" icone={<Receipt size={17} />}>
              <span className="flex-1">Faturas recebidas</span>
              {novasFaturas > 0 && <span className="text-[11px] font-semibold bg-vermelho-fraco text-vermelho rounded-full px-1.5" title="Faturas recebidas por tratar">{novasFaturas}</span>}
            </Item>
            <Item para="/conciliacao" icone={<Landmark size={17} />}>Conciliação bancária</Item>
          </Grupo>}
        </nav>

        <div className="border-t border-linha px-3 py-3 space-y-1">
          <Item para="/atividade" icone={<FileClock size={16} />}>Registo de atividade</Item>
          <Item para="/copias" icone={<Archive size={16} />}><span className="flex-1">Cópias de segurança</span>{copiaEmFalta && <span className="size-2 rounded-full bg-ambar" title="Cópia de segurança em falta" />}</Item>
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

      <main className="flex-1 min-w-0 overflow-y-auto relative">
        {/* barra de cima no telemóvel */}
        <div className="no-print lg:hidden sticky top-0 z-30 bg-fundo/95 backdrop-blur border-b border-linha pt-[env(safe-area-inset-top)]">
          <div className="h-14 flex items-center justify-between px-2">
            <button onClick={() => setMenuAberto(true)} className="p-2.5 text-tinta" aria-label="Abrir o menu"><Menu size={22} /></button>
            <span className="flex items-center gap-2"><img src="/logo-mark.png" alt="" className="h-7 w-auto" /><span className="font-semibold text-[15px] tracking-tight">Pereira's Project</span></span>
            <span className="p-1.5"><Sino direita /></span>
          </div>
        </div>
        {recolhida && (
          <button onClick={() => setRecolhida(false)} className="no-print hidden lg:block absolute left-3 top-4 p-2 text-suave hover:text-tinta" aria-label="Abrir a barra lateral"><PanelLeftOpen size={18} /></button>
        )}
        <div className="max-w-[1180px] mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8 min-h-full flex flex-col pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex-1"><Outlet /></div>
          <footer className="no-print mt-12 pt-5 border-t border-linha text-[11px] tracking-[0.12em] uppercase text-tenue text-right">© {new Date().getFullYear()} Pereira & Cruz</footer>
        </div>
      </main>
      <Toasts />
    </div>
  )
}
