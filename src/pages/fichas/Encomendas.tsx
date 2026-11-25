import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, FileStack, Plus, ScanSearch } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Etiqueta, Kpi, Tabela, type Tom } from '../../components/ui'
import { fichasGeradas, fichasPorAprovar, pecasEncomenda, referenciasEncomenda } from '../../lib/calc'
import { dataCurta, int } from '../../lib/format'
import type { Encomenda, EstadoEncomenda } from '../../types'

export const tomEstado = (e: EstadoEncomenda): Tom => (e === 'Concluída' ? 'neutro' : e === 'Fichas geradas' ? 'verde' : 'ambar')

export default function Encomendas() {
  const encomendas = useDb((s) => s.encomendas)
  const nav = useNavigate()
  const [kpi, setKpi] = useState<'' | EstadoEncomenda>('')

  return (
    <>
      <Cabecalho sobre="Fichas de produção" titulo="Encomendas" sub={`${encomendas.length} ${encomendas.length === 1 ? 'encomenda' : 'encomendas'}`}
        acoes={<Botao variante="primario" icone={<Plus size={16} />} onClick={() => nav('/fichas/nova')}>Nova encomenda</Botao>} />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Kpi rotulo="Em revisão" valor={encomendas.filter((e) => e.estado === 'Em revisão').length} sub={`${encomendas.reduce((n, e) => n + fichasPorAprovar(e), 0)} fichas por aprovar`}
          icone={<ScanSearch size={14} />} tom="ambar" ativo={kpi === 'Em revisão'} onClick={() => setKpi(kpi === 'Em revisão' ? '' : 'Em revisão')} />
        <Kpi rotulo="Fichas geradas" valor={encomendas.filter((e) => e.estado === 'Fichas geradas').length} icone={<FileStack size={14} />}
          ativo={kpi === 'Fichas geradas'} onClick={() => setKpi(kpi === 'Fichas geradas' ? '' : 'Fichas geradas')} />
        <Kpi rotulo="Concluídas" valor={encomendas.filter((e) => e.estado === 'Concluída').length} icone={<CheckCheck size={14} />} tom="verde"
          ativo={kpi === 'Concluída'} onClick={() => setKpi(kpi === 'Concluída' ? '' : 'Concluída')} />
      </div>
      <Tabela<Encomenda>
        linhas={encomendas} chave={(e) => e.id} onLinha={(e) => nav(`/fichas/${e.id}`)}
        filtroExterno={kpi ? (e) => e.estado === kpi : undefined}
        vazio="Ainda não há encomendas. Carregue a primeira em «Nova encomenda»."
        colunas={[
          { id: 'cliente', rotulo: 'Cliente', valor: (e) => e.cliente, filtro: 'texto', render: (e) => <span className="font-medium">{e.cliente}</span> },
          { id: 'colecao', rotulo: 'Coleção', valor: (e) => e.colecao, filtro: 'texto', alinhar: 'centro' },
          { id: 'modo', rotulo: 'Serviço', valor: (e) => e.modoServico, filtro: 'lista', alinhar: 'centro' },
          { id: 'modelos', rotulo: 'Modelos', valor: (e) => e.modelos.length, alinhar: 'centro' },
          { id: 'refs', rotulo: 'Referências', valor: (e) => referenciasEncomenda(e), alinhar: 'centro' },
          { id: 'pecas', rotulo: 'Peças', valor: (e) => pecasEncomenda(e), render: (e) => int(pecasEncomenda(e)), alinhar: 'centro' },
          { id: 'fichas', rotulo: 'Fichas', valor: (e) => fichasGeradas(e), render: (e) => `${fichasGeradas(e)} / ${referenciasEncomenda(e)}`, alinhar: 'centro' },
          { id: 'entrega', rotulo: 'Data de entrega', valor: (e) => e.entrega, render: (e) => dataCurta(e.entrega), filtro: 'data', alinhar: 'centro' },
          { id: 'estado', rotulo: 'Estado', valor: (e) => e.estado, filtro: 'lista', render: (e) => <Etiqueta tom={tomEstado(e.estado)}>{e.estado}</Etiqueta>, alinhar: 'centro' },
        ]}
      />
    </>
  )
}
