import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Check, CheckCheck, Trash2, Upload } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Etiqueta, Kpi, Tabela, aviso } from '../../components/ui'
import { NOME_FOLHA, folhasDoModelo } from '../../components/Folhas'
import { fichasGeradas, pecasEncomenda, pecasModelo, referenciasEncomenda, valorEncomenda, verificarEncomenda } from '../../lib/calc'
import { dataCurta, eur, int } from '../../lib/format'
import { ESTADO_FICHA } from './FichaModelo'
import { tomEstado } from './Encomendas'
import type { Modelo } from '../../types'

export default function EncomendaDetalhe() {
  const { encId } = useParams()
  const nav = useNavigate()
  const { encomendas, destinatarios, atualizarEncomenda, apagarEncomenda, log } = useDb()
  const enc = encomendas.find((e) => e.id === encId)
  if (!enc) return <Navigate to="/fichas" replace />

  const verif = verificarEncomenda(enc)
  const valor = valorEncomenda(enc)
  const todasAprovadas = enc.modelos.filter((m) => m.estado !== 'sem-ficha').every((m) => m.estado === 'aprovada' || m.estado === 'enviada')
  const destNome = (f: string) => destinatarios.find((d) => d.folha === f)?.nome

  return (
    <>
      <Cabecalho migalhas={[{ rotulo: 'Encomendas', para: '/fichas' }, { rotulo: `${enc.cliente} · ${enc.colecao}` }]} sobre="Fichas de produção"
        titulo={`${enc.cliente} · ${enc.colecao}`} extra={<><Etiqueta tom={tomEstado(enc.estado)}>{enc.estado}</Etiqueta><Etiqueta ponto={false}>{enc.modoServico}</Etiqueta></>}
        sub={`${referenciasEncomenda(enc)} referências · ${int(pecasEncomenda(enc))} peças · entrega ${dataCurta(enc.entrega)} · ficheiros: ${enc.ficheiros.join(', ')}`}
        acoes={<>
          <Botao variante="fantasma" icone={<Trash2 size={15} />} onClick={() => {
            if (confirm(`Apagar a encomenda ${enc.cliente} · ${enc.colecao} e as suas fichas?`)) { apagarEncomenda(enc.id); log('Encomenda apagada', `${enc.cliente} · ${enc.colecao}`); nav('/fichas') }
          }}>Apagar</Botao>
          {enc.estado !== 'Concluída' && <Botao icone={<CheckCheck size={15} />} disabled={!todasAprovadas} title={todasAprovadas ? '' : 'Há fichas por aprovar'}
            onClick={() => { atualizarEncomenda(enc.id, (e) => ({ ...e, estado: 'Concluída' })); log('Encomenda concluída', `${enc.cliente} · ${enc.colecao}`); aviso('Encomenda marcada como concluída.') }}>Marcar como concluída</Botao>}
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-5">
        <Kpi rotulo="Modelos" valor={enc.modelos.length} />
        <Kpi rotulo="Referências" valor={referenciasEncomenda(enc)} sub={`${int(enc.preEncomenda)} pré-encomenda · ${enc.stock} stock`} />
        <Kpi rotulo="Peças" valor={int(pecasEncomenda(enc))} sub={valor ? eur(valor) : undefined} />
        <Kpi rotulo="Fichas geradas" valor={fichasGeradas(enc)} sub={`de ${referenciasEncomenda(enc)} variantes`} />
      </div>

      <div className="flex gap-x-6 gap-y-1 flex-wrap text-[13px] mb-5">
        {verif.map((v) => <span key={v.texto} className={`flex items-center gap-1.5 ${v.ok ? 'text-verde' : 'text-ambar'}`}>{v.ok ? <Check size={14} /> : <AlertTriangle size={14} />}{v.texto}</span>)}
      </div>

      <Tabela<Modelo>
        linhas={enc.modelos} chave={(m) => m.id} onLinha={(m) => m.estado !== 'sem-ficha' && nav(`/fichas/${enc.id}/${m.id}`)}
        colunas={[
          { id: 'modelo', rotulo: 'Modelo', valor: (m) => m.nome, filtro: 'texto', render: (m) => <span className="font-medium">{m.nome}{m.alias && <span className="text-suave font-normal"> ({m.alias})</span>}</span> },
          { id: 'tipo', rotulo: 'Tipo de peça', valor: (m) => m.tipoPeca, filtro: 'lista' },
          { id: 'var', rotulo: 'Variantes', valor: (m) => m.variantes.map((v) => v.nome).join(' · '), render: (m) => <span className="text-[13px] text-tinta-2">{m.variantes.map((v) => v.nome).join(' · ')}</span> },
          { id: 'pecas', rotulo: 'Peças', valor: (m) => pecasModelo(m), render: (m) => int(pecasModelo(m)), alinhar: 'centro' },
          { id: 'dest', rotulo: 'Folhas por destinatário', valor: (m) => (m.estado === 'sem-ficha' ? '' : folhasDoModelo(m).join()), render: (m) => m.estado === 'sem-ficha' ? <span className="text-tenue">—</span> :
            <span className="text-[12px] text-suave">{folhasDoModelo(m).filter((f) => !['produto', 'packing', 'medidas'].includes(f)).map((f) => f === 'corte' || f === 'embalamento' ? NOME_FOLHA[f] : `${NOME_FOLHA[f]} (${destNome(f)})`).join(' · ')}</span> },
          { id: 'ficha', rotulo: 'Ficha', valor: (m) => (m.estado === 'sem-ficha' && !m.techPack ? 'Falta tech pack' : ESTADO_FICHA[m.estado].rotulo), filtro: 'lista', alinhar: 'centro',
            render: (m) => m.estado === 'sem-ficha' && !m.techPack ? <Etiqueta>Falta tech pack</Etiqueta> : <Etiqueta tom={ESTADO_FICHA[m.estado].tom}>{ESTADO_FICHA[m.estado].rotulo}</Etiqueta> },
        ]}
        acaoLinha={(m) => m.estado !== 'sem-ficha'
          ? <Botao pequeno onClick={() => nav(`/fichas/${enc.id}/${m.id}`)}>Abrir fichas</Botao>
          : <Botao pequeno variante="fantasma" icone={<Upload size={13} />} onClick={() => aviso('A leitura de um novo tech pack fica ativa com o servidor e a IA.')}>Tech pack</Botao>}
      />
    </>
  )
}
