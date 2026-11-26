import { useNavigate } from 'react-router-dom'
import { useDb } from '../../store/db'
import { Cabecalho, Etiqueta, Kpi, Tabela } from '../../components/ui'
import { estadoDe, necessidadesCompra, type LinhaCompra } from '../../lib/compras'
import { dataCurta, int, num } from '../../lib/format'
import type { Encomenda } from '../../types'
import { SeletorCompra, useMudarCompra } from './ComprasEncomenda'

type Linha = LinhaCompra & { enc: Encomenda; id: string }

export default function Compras() {
  const nav = useNavigate()
  const encomendas = useDb((s) => s.encomendas).filter((e) => e.estado !== 'Concluída')
  const mudar = useMudarCompra()
  const linhas: Linha[] = encomendas.flatMap((enc) => necessidadesCompra(enc).map((l) => ({ ...l, enc, id: `${enc.id}/${l.chave}` })))
  const conta = (s: string) => linhas.filter((l) => estadoDe(l.enc, l.chave).estado === s && !(s === 'Por encomendar' && l.daCliente)).length
  return (
    <>
      <Cabecalho sobre="Fichas de produção" titulo="Compras" sub="O que a Pereira's Project tem de comprar para as encomendas em curso, calculado a partir das fichas (consumo × peças). Clique numa linha para abrir a encomenda." />
      <div className="grid grid-cols-4 gap-4 mb-5">
        <Kpi rotulo="Encomendas em curso" valor={encomendas.length} />
        <Kpi rotulo="Por encomendar" valor={conta('Por encomendar')} tom={conta('Por encomendar') ? 'ambar' : undefined} />
        <Kpi rotulo="Encomendado (por receber)" valor={conta('Encomendado')} />
        <Kpi rotulo="Recebido" valor={conta('Recebido')} tom="verde" />
      </div>
      <Tabela<Linha> linhas={linhas} chave={(l) => l.id} onLinha={(l) => nav(`/fichas/${l.enc.id}?aba=compras`)} vazio="Sem materiais: gere as fichas das encomendas."
        colunas={[
          { id: 'enc', rotulo: 'Encomenda', filtro: 'lista', valor: (l) => `${l.enc.cliente} · ${l.enc.colecao}` },
          { id: 'forn', rotulo: 'Fornecedor', filtro: 'lista', valor: (l) => (l.daCliente ? `${l.fornecedor} (da cliente)` : l.fornecedor) },
          { id: 'mat', rotulo: 'Material', filtro: 'texto', valor: (l) => `${l.ref} ${l.tipo}`, render: (l) => <div><p>{l.ref}</p><p className="text-[12px] text-tenue">{l.tipo} · {l.modelos.join(', ')}</p></div> },
          { id: 'cor', rotulo: 'Cor', valor: (l) => l.cor },
          { id: 'qtd', rotulo: 'A comprar', alinhar: 'dir', valor: (l) => l.qtdComprar ?? -1, render: (l) => l.qtdComprar == null
            ? <span className="text-ambar text-[12px]">{l.semConsumo ? 'conforme a encomenda' : 'consumo a confirmar'}</span>
            : <span className="num font-semibold">{num(l.qtdComprar)} {l.unidade === 'm' ? 'm' : 'un.'}</span> },
          { id: 'pecas', rotulo: 'Peças', alinhar: 'dir', valor: (l) => l.pecas, render: (l) => int(l.pecas) },
          { id: 'entrega', rotulo: 'Entrega', valor: (l) => l.enc.entrega, filtro: 'data', render: (l) => l.enc.entrega ? dataCurta(l.enc.entrega) : <Etiqueta tom="ambar">a confirmar</Etiqueta> },
          { id: 'estado', rotulo: 'Estado', filtro: 'lista', valor: (l) => estadoDe(l.enc, l.chave).estado,
            render: (l) => <SeletorCompra valor={estadoDe(l.enc, l.chave).estado} onChange={(v) => mudar(l.enc, [l], { estado: v })} /> },
        ]} />
    </>
  )
}
