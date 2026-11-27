import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { useDb } from './store/db'
import { iniciarServidor } from './store/servidor'
import { prepararGoogle } from './lib/sheets'
import { prepararApp } from './lib/app'
import Layout from './components/Layout'
import Login from './pages/Login'
import Painel from './pages/Painel'
const Encomendas = lazy(() => import('./pages/fichas/Encomendas'))
const NovaEncomenda = lazy(() => import('./pages/fichas/NovaEncomenda'))
const EmailsEncomendas = lazy(() => import('./pages/EmailsEncomendas'))
const ConciliacaoBancaria = lazy(() => import('./pages/Conciliacao'))
const FaturasRecebidas = lazy(() => import('./pages/FaturasRecebidas'))
const Producao = lazy(() => import('./pages/Producao'))
const OrdensFabrico = lazy(() => import('./pages/producao/OrdensFabrico'))
const Faltas = lazy(() => import('./pages/Faltas'))
const EncomendaDetalhe = lazy(() => import('./pages/fichas/EncomendaDetalhe'))
const FichaModelo = lazy(() => import('./pages/fichas/FichaModelo'))
const PackingList = lazy(() => import('./pages/fichas/PackingList'))
const DadosMestre = lazy(() => import('./pages/DadosMestre'))
const Pedidos = lazy(() => import('./pages/orcamentos/Pedidos'))
const NovoPedido = lazy(() => import('./pages/orcamentos/NovoPedido'))
const Historico = lazy(() => import('./pages/orcamentos/Historico'))
const Margens = lazy(() => import('./pages/orcamentos/Margens'))
const Atividade = lazy(() => import('./pages/Atividade'))
const Conta = lazy(() => import('./pages/Conta'))
const Copias = lazy(() => import('./pages/Copias'))
const Compras = lazy(() => import('./pages/producao/Compras'))
const Prazos = lazy(() => import('./pages/producao/Prazos'))

iniciarServidor()
void prepararGoogle()?.catch(() => {})

function App() {
  const sessao = useDb((s) => s.sessao)
  const aCarregar = useDb((s) => s.aCarregar)
  if (aCarregar) return (
    <div className="h-full grid place-items-center text-center">
      <div><img src="/logo-mark.png" alt="" className="h-14 mx-auto animate-pulse" /><p className="mt-4 text-[14px] text-suave">A carregar os dados…</p></div>
    </div>
  )
  if (!sessao) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Painel />} />
        <Route path="fichas" element={<Encomendas />} />
        <Route path="fichas/nova" element={<NovaEncomenda />} />
        <Route path="emails" element={<EmailsEncomendas key="encomendas" />} />
        <Route path="conciliacao" element={<ConciliacaoBancaria />} />
        <Route path="faturas" element={<FaturasRecebidas />} />
        <Route path="producao-diaria" element={<Producao />} />
        <Route path="producao" element={<OrdensFabrico />} />
        <Route path="faltas" element={<Faltas />} />
        <Route path="fichas/:encId" element={<EncomendaDetalhe />} />
        <Route path="fichas/:encId/packing" element={<PackingList />} />
        <Route path="fichas/:encId/:modId" element={<FichaModelo />} />
        <Route path="compras" element={<Compras />} />
        <Route path="prazos" element={<Prazos />} />
        <Route path="dados" element={<DadosMestre />} />
        <Route path="orcamentos" element={<Pedidos />} />
        <Route path="emails-pedidos" element={<EmailsEncomendas key="pedidos" modo="pedido" />} />
        <Route path="orcamentos/novo" element={<NovoPedido />} />
        <Route path="orcamentos/:pedId" element={<NovoPedido />} />
        <Route path="historico" element={<Historico />} />
        <Route path="margens" element={<Margens />} />
        <Route path="atividade" element={<Atividade />} />
        <Route path="conta" element={<Conta />} />
        <Route path="copias" element={<Copias />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

prepararApp()

// Depois de uma publicação nova, um separador antigo pode pedir partes da aplicação que já não existem:
// recarrega uma vez para ficar com a versão nova (no máximo uma vez por minuto, para não entrar em ciclo sem rede).
window.addEventListener('vite:preloadError', (e) => {
  const ultima = Number(sessionStorage.getItem('recarregadoEm') ?? 0)
  if (Date.now() - ultima < 60_000) return
  e.preventDefault()
  sessionStorage.setItem('recarregadoEm', String(Date.now()))
  location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
