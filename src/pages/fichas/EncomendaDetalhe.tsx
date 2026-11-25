import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Check, CheckCheck, FileSpreadsheet, Info, Package, Trash2, Upload } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Cartao, Etiqueta, Kpi, Tabela, aviso } from '../../components/ui'
import { NOME_FOLHA, folhasDoModelo } from '../../components/Folhas'
import { fichasGeradas, idInternoEncomenda, pecasEncomenda, pecasModelo, referenciasEncomenda, valorEncomenda, verificarEncomenda } from '../../lib/calc'
import { exportarLivro } from '../../lib/exportar'
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
  const aprovadas = enc.modelos.filter((m) => m.estado === 'aprovada' || m.estado === 'enviada')
  const destNome = (f: string) => destinatarios.find((d) => d.folha === f)?.nome

  return (
    <>
      <Cabecalho migalhas={[{ rotulo: 'Encomendas', para: '/fichas' }, { rotulo: `${enc.cliente} · ${enc.colecao}` }]} sobre="Fichas de produção"
        titulo={`${enc.cliente} · ${enc.colecao}`} extra={<><Etiqueta tom={tomEstado(enc.estado)}>{enc.estado}</Etiqueta><Etiqueta ponto={false}>{enc.modoServico}</Etiqueta><Etiqueta tom="azul" ponto={false}>{idInternoEncomenda(enc)}</Etiqueta></>}
        sub={<>{enc.numeroDocumento && `Documento ${enc.numeroDocumento} de ${dataCurta(enc.dataDocumento)} · `}{referenciasEncomenda(enc)} referências · {int(pecasEncomenda(enc))} peças · ficheiros: {enc.ficheiros.join(', ')}</>}
        acoes={<>
          <Botao icone={<Package size={15} />} onClick={() => nav(`/fichas/${enc.id}/packing`)}>Packing list</Botao>
          <Botao icone={<FileSpreadsheet size={15} />} disabled={!aprovadas.length} title={aprovadas.length ? '' : 'Ainda não há fichas aprovadas'} onClick={() => {
            const entradas = aprovadas.flatMap((m) => m.variantes.filter((v) => v.fichaGerada).map((v) => ({ m, v, folhas: folhasDoModelo(m).filter((f) => f === 'produto' || f === 'embalamento') })))
            const nome = exportarLivro(enc, entradas, (m) => m.versoes[m.versoes.length - 1]?.data ?? enc.criadaEm, destinatarios, true)
            const fora = enc.modelos.filter((m) => m.estado === 'rascunho').length
            log('Livro Excel exportado', `${enc.cliente} · ${enc.colecao} · ${entradas.length} variantes`)
            aviso(fora ? `${nome} descarregado. ${fora} modelo(s) por aprovar ficaram de fora.` : `${nome} descarregado.`)
          }}>Livro Excel</Botao>
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

      <div className="grid grid-cols-[260px_1fr] gap-4 mb-5">
        <Cartao className="p-4 space-y-3">
          <div>
            <p className="text-[13px] text-suave mb-1.5">Nº interno da encomenda</p>
            <input type="number" min={1} value={enc.numeroInterno ?? ''} onChange={(e) => { const n = e.target.value ? Number(e.target.value) : undefined; atualizarEncomenda(enc.id, (x) => ({ ...x, numeroInterno: n })) }}
              className="w-full h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px] outline-none focus:border-tinta-2" />
            <p className="text-[12px] text-tenue mt-1">ID nas fichas: {idInternoEncomenda(enc)}-nº do modelo</p>
          </div>
          <div>
          <p className="text-[13px] text-suave mb-1.5">Data de entrega</p>
          <input type="date" value={enc.entrega} onChange={(e) => { const v = e.target.value; atualizarEncomenda(enc.id, (x) => ({ ...x, entrega: v })); log('Data de entrega alterada', `${enc.cliente} · ${enc.colecao} · ${v || 'sem data'}`) }}
            className={`w-full h-10 px-3 rounded-controlo border bg-papel text-[14px] outline-none focus:border-tinta-2 ${enc.entrega ? 'border-linha' : 'border-ambar-borda bg-ambar-fraco'}`} />
          {!enc.entrega && <p className="text-[12px] text-ambar mt-1.5">A confirmar: vem no email do cliente.</p>}
          </div>
        </Cartao>
        {(enc.notas?.length ?? 0) > 0 ? (
          <Cartao className="p-4">
            <p className="text-[13px] text-suave mb-1.5 flex items-center gap-1.5"><Info size={13} />Notas do documento · passam para as observações das fichas</p>
            <ul className="text-[13px] space-y-0.5 list-disc pl-5">{enc.notas!.map((n) => <li key={n}>{n}</li>)}</ul>
          </Cartao>
        ) : <div />}
      </div>

      <div className="flex gap-x-6 gap-y-1 flex-wrap text-[13px] mb-5">
        {verif.map((v) => <span key={v.texto} className={`flex items-center gap-1.5 ${v.ok ? 'text-verde' : 'text-ambar'}`}>{v.ok ? <Check size={14} /> : <AlertTriangle size={14} />}{v.texto}</span>)}
      </div>

      <Tabela<Modelo>
        linhas={enc.modelos} chave={(m) => m.id} onLinha={(m) => m.estado !== 'sem-ficha' && nav(`/fichas/${enc.id}/${m.id}`)}
        colunas={[
          { id: 'modelo', rotulo: 'Modelo', valor: (m) => `${m.nome} ${m.refCliente ?? ''}`, filtro: 'texto', render: (m) => (
            <div><p className="font-medium">{m.nome}{m.alias && <span className="text-suave font-normal"> ({m.alias})</span>}</p>
              {m.refCliente && <p className="text-[12px] text-tenue font-mono">{m.linhaEncomenda} · {m.refCliente}</p>}</div>) },
          { id: 'tipo', rotulo: 'Tipo de peça', valor: (m) => m.tipoPeca, filtro: 'lista' },
          { id: 'var', rotulo: 'Variantes', valor: (m) => m.variantes.map((v) => v.nome).join(' · '), render: (m) => <span className="text-[13px] text-tinta-2">{m.variantes.map((v) => (
            <span key={v.id} className="whitespace-nowrap">{v.nome}{(v.linhasOrigem ?? 1) > 1 && <span className="ml-1 text-[11px] text-azul bg-azul-fraco rounded px-1" title="A mesma cor vinha partida em várias linhas da encomenda">{v.linhasOrigem} linhas juntas</span>}</span>
          )).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</span> },
          { id: 'pecas', rotulo: 'Peças', valor: (m) => pecasModelo(m), render: (m) => int(pecasModelo(m)), alinhar: 'centro' },
          { id: 'dest', rotulo: 'Folhas por destinatário', valor: (m) => (m.estado === 'sem-ficha' ? '' : folhasDoModelo(m).join()), render: (m) => m.estado === 'sem-ficha' ? <span className="text-tenue">—</span> :
            <span className="text-[12px] text-suave">{folhasDoModelo(m).filter((f) => f !== 'medidas').map((f) => f === 'produto' || f === 'embalamento' ? NOME_FOLHA[f] : `${NOME_FOLHA[f]} (${destNome(f)})`).join(' · ')}</span> },
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
