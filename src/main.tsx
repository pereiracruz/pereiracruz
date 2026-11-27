import { StrictMode } from 'react'
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
import Encomendas from './pages/fichas/Encomendas'
import NovaEncomenda from './pages/fichas/NovaEncomenda'
import EmailsEncomendas from './pages/EmailsEncomendas'
import ConciliacaoBancaria from './pages/Conciliacao'
import EncomendaDetalhe from './pages/fichas/EncomendaDetalhe'
import FichaModelo from './pages/fichas/FichaModelo'
import PackingList from './pages/fichas/PackingList'
import DadosMestre from './pages/DadosMestre'
import Pedidos from './pages/orcamentos/Pedidos'
import NovoPedido from './pages/orcamentos/NovoPedido'
import Historico from './pages/orcamentos/Historico'
import Margens from './pages/orcamentos/Margens'
import Atividade from './pages/Atividade'
import Conta from './pages/Conta'
import Copias from './pages/Copias'
import Compras from './pages/producao/Compras'
import Prazos from './pages/producao/Prazos'

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
        <Route path="emails" element={<EmailsEncomendas />} />
        <Route path="conciliacao" element={<ConciliacaoBancaria />} />
        <Route path="fichas/:encId" element={<EncomendaDetalhe />} />
        <Route path="fichas/:encId/packing" element={<PackingList />} />
        <Route path="fichas/:encId/:modId" element={<FichaModelo />} />
        <Route path="compras" element={<Compras />} />
        <Route path="prazos" element={<Prazos />} />
        <Route path="dados" element={<DadosMestre />} />
        <Route path="orcamentos" element={<Pedidos />} />
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
