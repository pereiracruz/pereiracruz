import { useNavigate } from 'react-router-dom'
import { useDb } from '../../store/db'
import { Cabecalho, Etiqueta, Kpi, Tabela, type Tom } from '../../components/ui'
import { ETAPAS, prazoDe, situacaoPrazos, type NivelPrazo } from '../../lib/prazos'
import { dataCurta, int } from '../../lib/format'
import { pecasEncomenda, idInternoEncomenda } from '../../lib/calc'
import type { Encomenda } from '../../types'
import { textoDias } from './PrazosEncomenda'

export const NIVEL: Record<NivelPrazo, { rotulo: string; tom: Tom }> = {
  atrasada: { rotulo: 'Atrasada', tom: 'vermelho' }, urgente: { rotulo: 'Atenção', tom: 'ambar' }, ok: { rotulo: 'Dentro do prazo', tom: 'verde' },
  'sem-data': { rotulo: 'Sem data', tom: 'neutro' }, concluida: { rotulo: 'Concluída', tom: 'azul' },
}

export default function Prazos() {
  const nav = useNavigate()
  const encomendas = useDb((s) => s.encomendas).filter((e) => e.estado !== 'Concluída')
    .sort((a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999'))
  const sit = new Map(encomendas.map((e) => [e.id, situacaoPrazos(e)]))
  const n = (k: NivelPrazo) => encomendas.filter((e) => sit.get(e.id)!.nivel === k).length
  return (
    <>
      <Cabecalho sobre="Fichas de produção" titulo="Prazos" sub="Encomendas em curso por data de entrega, com a próxima etapa e os atrasos. Clique numa encomenda para planear as datas." />
      <div className="grid grid-cols-4 gap-4 mb-5">
        <Kpi rotulo="Atrasadas" valor={n('atrasada')} tom={n('atrasada') ? 'vermelho' : undefined} />
        <Kpi rotulo="Precisam de atenção" valor={n('urgente')} sub="entrega em 7 dias ou materiais por receber" tom={n('urgente') ? 'ambar' : undefined} />
        <Kpi rotulo="Dentro do prazo" valor={n('ok')} tom="verde" />
        <Kpi rotulo="Sem data de entrega" valor={n('sem-data')} />
      </div>
      <Tabela<Encomenda> linhas={encomendas} chave={(e) => e.id} onLinha={(e) => nav(`/fichas/${e.id}?aba=prazos`)} vazio="Não há encomendas em curso."
        colunas={[
          { id: 'enc', rotulo: 'Encomenda', filtro: 'texto', valor: (e) => `${e.cliente} ${e.colecao}`, render: (e) => <div><p className="font-medium">{e.cliente} · {e.colecao}</p><p className="text-[12px] text-tenue">{idInternoEncomenda(e)} · {int(pecasEncomenda(e))} peças</p></div> },
          { id: 'entrega', rotulo: 'Entrega', filtro: 'data', valor: (e) => e.entrega, render: (e) => e.entrega
            ? <div><p>{dataCurta(e.entrega)}</p><p className="text-[12px] text-tenue">{textoDias(sit.get(e.id)!.diasEntrega!)}</p></div> : <Etiqueta tom="ambar">a confirmar</Etiqueta> },
          { id: 'etapas', rotulo: 'Etapas', valor: (e) => ETAPAS.filter(({ etapa }) => prazoDe(e, etapa).feito).length, render: (e) => (
            <div className="flex gap-1" title={ETAPAS.map(({ etapa }) => `${etapa}: ${prazoDe(e, etapa).feito ? 'feita' : prazoDe(e, etapa).data ? dataCurta(prazoDe(e, etapa).data) : 'sem data'}`).join('\n')}>
              {ETAPAS.map(({ etapa }) => { const p = prazoDe(e, etapa); const atras = !p.feito && p.data && p.data < new Date().toISOString().slice(0, 10)
                return <span key={etapa} className={`h-2 w-6 rounded-full ${p.feito ? 'bg-verde' : atras ? 'bg-vermelho' : p.data ? 'bg-linha' : 'bg-fundo border border-linha'}`} /> })}
            </div>) },
          { id: 'prox', rotulo: 'Próxima etapa', valor: (e) => sit.get(e.id)!.proxima?.etapa ?? '', render: (e) => { const p = sit.get(e.id)!.proxima
            return p ? <div><p>{p.etapa}</p><p className="text-[12px] text-tenue">{p.data ? `${dataCurta(p.data)} · ${textoDias(p.dias!)}` : 'sem data'}</p></div> : <span className="text-tenue">—</span> } },
          { id: 'alertas', rotulo: 'Alertas', valor: (e) => sit.get(e.id)!.alertas.join(' '), render: (e) => <span className="text-[12.5px] text-tinta-2">{sit.get(e.id)!.alertas.join(' · ') || <span className="text-tenue">—</span>}</span> },
          { id: 'nivel', rotulo: 'Situação', filtro: 'lista', alinhar: 'centro', valor: (e) => NIVEL[sit.get(e.id)!.nivel].rotulo, render: (e) => <Etiqueta tom={NIVEL[sit.get(e.id)!.nivel].tom}>{NIVEL[sit.get(e.id)!.nivel].rotulo}</Etiqueta> },
        ]} />
    </>
  )
}
