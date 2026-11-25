import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, Plus, Send, ShieldCheck } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Etiqueta, Kpi, Tabela, type Tom } from '../../components/ui'
import { calcularCusto } from '../../lib/calc'
import { dataCurta, eur } from '../../lib/format'
import type { EstadoPedido, Pedido } from '../../types'

export const TOM_PEDIDO: Record<EstadoPedido, Tom> = { Rascunho: 'neutro', 'Por validar': 'ambar', Validado: 'verde', Enviado: 'azul', Fechado: 'neutro' }

export default function Pedidos() {
  const { pedidos, clientes } = useDb()
  const nav = useNavigate()
  const [kpi, setKpi] = useState<EstadoPedido | ''>('')
  const preco = (p: Pedido) => p.precoMin != null && p.precoMax != null
    ? (p.precoMin === p.precoMax ? eur(p.precoMin) : `${eur(p.precoMin)} – ${eur(p.precoMax)}`)
    : eur(calcularCusto(p.linhas, clientes.find((c) => c.nome === p.cliente)).final)
  const k = (e: EstadoPedido) => ({ ativo: kpi === e, onClick: () => setKpi(kpi === e ? '' : e), valor: pedidos.filter((p) => p.estado === e).length })

  return (
    <>
      <Cabecalho sobre="Pré-orçamentação" titulo="Pedidos" sub={`${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'}`}
        acoes={<Botao variante="primario" icone={<Plus size={16} />} onClick={() => nav('/orcamentos/novo')}>Novo pedido</Botao>} />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Kpi rotulo="Por validar" icone={<ShieldCheck size={14} />} tom="ambar" {...k('Por validar')} />
        <Kpi rotulo="Enviados" icone={<Send size={14} />} {...k('Enviado')} />
        <Kpi rotulo="Fechados" icone={<CheckCheck size={14} />} tom="verde" {...k('Fechado')} />
      </div>
      <Tabela<Pedido> linhas={pedidos} chave={(p) => p.id} onLinha={(p) => nav(`/orcamentos/${p.id}`)} filtroExterno={kpi ? (p) => p.estado === kpi : undefined}
        vazio="Ainda não há pedidos."
        colunas={[
          { id: 'cliente', rotulo: 'Cliente', valor: (p) => p.cliente, filtro: 'texto', render: (p) => <span className="font-medium">{p.cliente}</span> },
          { id: 'peca', rotulo: 'Peça', valor: (p) => `${p.peca} · ${p.variante}`, filtro: 'texto' },
          { id: 'preco', rotulo: 'Preço por peça', valor: preco, alinhar: 'dir' },
          { id: 'entrega', rotulo: 'Data de entrega', valor: (p) => p.entrega, render: (p) => dataCurta(p.entrega), filtro: 'data', alinhar: 'centro' },
          { id: 'val', rotulo: 'Validado por', valor: (p) => p.validadoPor ?? '—', alinhar: 'centro' },
          { id: 'estado', rotulo: 'Estado', valor: (p) => p.estado, filtro: 'lista', alinhar: 'centro', render: (p) => <Etiqueta tom={TOM_PEDIDO[p.estado]}>{p.estado}</Etiqueta> },
        ]} />
    </>
  )
}
