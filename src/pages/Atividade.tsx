import { useDb } from '../store/db'
import { Cabecalho, Tabela } from '../components/ui'
import { dataHora } from '../lib/format'
import type { Atividade as A } from '../types'

export default function Atividade() {
  const atividade = useDb((s) => s.atividade)
  return (
    <>
      <Cabecalho sobre="Administração" titulo="Registo de atividade" sub="Acessos e ações sensíveis: fichas aprovadas e exportadas, preços validados, alterações aos dados mestre." />
      <Tabela<A> linhas={atividade} chave={(a) => a.id} vazio="Sem atividade registada."
        colunas={[
          { id: 'data', rotulo: 'Data', valor: (a) => a.data, render: (a) => <span className="text-suave whitespace-nowrap">{dataHora(a.data)}</span>, largura: '180px' },
          { id: 'acao', rotulo: 'Ação', valor: (a) => a.acao, filtro: 'lista', render: (a) => <span className="font-medium">{a.acao}</span> },
          { id: 'det', rotulo: 'Detalhe', valor: (a) => a.detalhe, filtro: 'texto' },
          { id: 'quem', rotulo: 'Utilizador', valor: () => 'Admin', alinhar: 'centro' },
        ]} />
    </>
  )
}
