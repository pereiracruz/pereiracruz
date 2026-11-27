import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, CheckCheck, ExternalLink, FileSpreadsheet, FileText, Info, Package, RefreshCw, Sheet, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Cartao, Etiqueta, Kpi, Pilulas, Tabela, aviso, type Tom } from '../../components/ui'
import ComprasEncomenda from '../producao/ComprasEncomenda'
import PrazosEncomenda from '../producao/PrazosEncomenda'
import GuiasEncomenda from '../producao/GuiasEncomenda'
import { resumoCompras } from '../../lib/compras'
import { situacaoPrazos } from '../../lib/prazos'
import { entregaDe, ordensDaEncomenda } from '../../lib/producao-ordens'
import { NOME_FOLHA, folhasDoModelo } from '../../components/Folhas'
import { fichasGeradas, idInternoEncomenda, pecasEncomenda, pecasModelo, referenciasEncomenda, valorEncomenda, verificarEncomenda } from '../../lib/calc'
import { exportarLivro, montarLivro, nomeLivro } from '../../lib/exportar'
import { exportarSheets, sheetsDisponivel } from '../../lib/sheets'
import { hojeISO } from '../../lib/format'
import { gerarFichaDoTechPack } from '../../lib/gerarFicha'
import { lerGuardadoComIA, ligarTechPack, type TechPackLido } from '../../lib/ia'
import { abrirOF, cfgCliente, guardarOF } from '../../lib/of'
import { modoServidor } from '../../lib/supabase'
import { dataCurta, eur, int } from '../../lib/format'
import { ESTADO_FICHA } from './FichaModelo'
import { tomEstado } from './Encomendas'
import type { Modelo } from '../../types'

export default function EncomendaDetalhe() {
  const { encId } = useParams()
  const nav = useNavigate()
  const { encomendas, destinatarios, fornecedores, tecidos, equivalencias, acessorios, clientes, ordensFabrico, atualizarEncomenda, atualizarModelo, apagarEncomenda, log } = useDb()
  const enc = encomendas.find((e) => e.id === encId)
  const [aExportar, setAExportar] = useState(false)
  const [aTratarOF, setATratarOF] = useState<string | null>(null) // modelo cuja OF está a ser guardada/lida
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') ?? 'modelos') as 'modelos' | 'compras' | 'prazos' | 'guias'
  if (!enc) return <Navigate to="/fichas" replace />
  const rc = resumoCompras(enc)
  const sp = situacaoPrazos(enc)

  const verif = verificarEncomenda(enc)
  const valor = valorEncomenda(enc)
  const todasAprovadas = enc.modelos.filter((m) => m.estado !== 'sem-ficha').every((m) => m.estado === 'aprovada' || m.estado === 'enviada')
  const aprovadas = enc.modelos.filter((m) => m.estado === 'aprovada' || m.estado === 'enviada')
  const destNome = (f: string) => destinatarios.find((d) => d.folha === f)?.nome

  // clientes com ordem de fabrico (OF) por modelo em vez de tech pack (ex.: Simão e Olgando, GBTX)
  const cfg = cfgCliente(clientes, enc.cliente)
  const comOF = cfg?.documentoModelo === 'OF'
  const encId_ = enc.id

  /** Lê a OF com IA (mesma leitura do tech pack) e liga-a ao modelo, para se poder gerar a ficha. */
  const lerOF = async (m: Modelo, ficheiro: string, caminho: string) => {
    const chave = `${ficheiro} (OF ${m.nome})`
    try {
      const contexto = `Ordem de fabrico (OF) do cliente ${enc.cliente}, para o modelo ${m.nome}${m.refCliente ? ` (ref. ${m.refCliente})` : ''}; referências das variantes: ${m.variantes.map((v) => v.ref).filter(Boolean).join(', ') || '—'}. Não há tech pack: a OF é o documento técnico do modelo.${cfg?.acessorios === 'Do cliente' ? ' Os acessórios e a embalagem são fornecidos pelo cliente; a fábrica trata do tecido, lavandaria, corte e confeção.' : ''}`
      const r = await lerGuardadoComIA<TechPackLido>(caminho, 'techpack', contexto)
      if (!r.dados.modelos?.length) throw new Error('a leitura não encontrou nenhum modelo na OF')
      const indice = ligarTechPack([m], r.dados)[m.id] ?? 0
      atualizarEncomenda(encId_, (e) => ({
        ...e,
        techPacks: [...(e.techPacks ?? []).filter((t) => t.ficheiro !== chave), { ficheiro: chave, caminho, dados: r.dados as unknown }],
        modelos: e.modelos.map((x) => (x.id === m.id ? { ...x, techPack: true, techPackLido: { ficheiro: chave, indice }, of: x.of && { ...x.of, erroLeitura: undefined } } : x)),
      }))
      log('OF lida com IA', `${enc.cliente} · ${m.nome} · ${ficheiro}`)
      aviso('OF lida. Já pode gerar a ficha.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      atualizarModelo(encId_, m.id, (x) => ({ ...x, of: x.of && { ...x.of, erroLeitura: msg } }))
      aviso(`OF guardada, mas a leitura com IA falhou: ${msg}`)
    }
  }

  const carregarOF = async (m: Modelo, f: File) => {
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { alert('A OF tem de ser um PDF.'); return }
    if (!modoServidor) { alert('Guardar a OF precisa do servidor (Supabase).'); return }
    setATratarOF(m.id)
    try {
      const caminho = await guardarOF(f)
      atualizarModelo(encId_, m.id, (x) => ({ ...x, of: { ficheiro: f.name, caminho, data: hojeISO() }, ...(x.estado === 'sem-ficha' ? { techPackLido: undefined } : {}) }))
      log(m.of ? 'OF substituída' : 'OF carregada', `${enc.cliente} · ${m.nome} · ${f.name}`)
      if (m.estado === 'sem-ficha') await lerOF(m, f.name, caminho)
      else aviso('OF guardada. A ficha já existente não foi alterada.')
    } catch (e) { alert(e instanceof Error ? e.message : String(e)) } finally { setATratarOF(null) }
  }

  /** Botão que abre a escolha do PDF da OF. */
  const botaoOF = (m: Modelo, texto: string) => (
    <span onClick={(e) => e.stopPropagation()} className="inline-block">
      <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={aTratarOF === m.id}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void carregarOF(m, f) }} />
      <Botao pequeno variante="fantasma" icone={<Upload size={13} />} disabled={aTratarOF === m.id} onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement).click()}>
        {aTratarOF === m.id ? 'A guardar e ler…' : texto}
      </Botao>
    </span>
  )

  const estadoFicha = (m: Modelo): { rotulo: string; tom: Tom } => {
    if (m.estado !== 'sem-ficha') return ESTADO_FICHA[m.estado]
    if (comOF) return !m.of ? { rotulo: 'Falta OF', tom: 'neutro' } : m.of.erroLeitura && !m.techPackLido ? { rotulo: 'OF por ler', tom: 'ambar' } : { rotulo: 'OF carregada', tom: 'azul' }
    return m.techPack ? ESTADO_FICHA[m.estado] : { rotulo: 'Falta tech pack', tom: 'neutro' }
  }

  return (
    <>
      <Cabecalho migalhas={[{ rotulo: 'Encomendas', para: '/fichas' }, { rotulo: `${enc.cliente} · ${enc.colecao}` }]} sobre="Fichas de produção"
        titulo={`${enc.cliente} · ${enc.colecao}`} extra={<><Etiqueta tom={tomEstado(enc.estado)}>{enc.estado}</Etiqueta><Etiqueta ponto={false}>{enc.modoServico}</Etiqueta><Etiqueta tom="azul" ponto={false}>{idInternoEncomenda(enc)}</Etiqueta></>}
        sub={<>{enc.linkSheets && <a href={enc.linkSheets.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-azul hover:underline mr-2"><ExternalLink size={12} />Google Sheets ({enc.linkSheets.data.split('-').reverse().join('/')})</a>}{enc.numeroDocumento && `Documento ${enc.numeroDocumento} de ${dataCurta(enc.dataDocumento)} · `}{referenciasEncomenda(enc)} referências · {int(pecasEncomenda(enc))} peças · ficheiros: {enc.ficheiros.join(', ')}</>}
        acoes={<>
          <Botao icone={<Package size={15} />} onClick={() => nav(`/fichas/${enc.id}/packing`)}>Packing list</Botao>
          <Botao icone={<FileSpreadsheet size={15} />} disabled={!aprovadas.length} title={aprovadas.length ? '' : 'Ainda não há fichas aprovadas'} onClick={() => {
            const entradas = aprovadas.flatMap((m) => m.variantes.filter((v) => v.fichaGerada).map((v) => ({ m, v, folhas: folhasDoModelo(m).filter((f) => f === 'produto' || f === 'embalamento') })))
            const nome = exportarLivro(enc, entradas, (m) => m.versoes[m.versoes.length - 1]?.data ?? enc.criadaEm, destinatarios, true)
            const fora = enc.modelos.filter((m) => m.estado === 'rascunho').length
            log('Livro Excel exportado', `${enc.cliente} · ${enc.colecao} · ${entradas.length} variantes`)
            aviso(fora ? `${nome} descarregado. ${fora} modelo(s) por aprovar ficaram de fora.` : `${nome} descarregado.`)
          }}>Livro Excel</Botao>
          {sheetsDisponivel && <Botao icone={<Sheet size={15} />} disabled={!aprovadas.length || aExportar} onClick={async () => {
            const entradas = aprovadas.flatMap((m) => m.variantes.filter((v) => v.fichaGerada).map((v) => ({ m, v, folhas: folhasDoModelo(m).filter((f) => f === 'produto' || f === 'embalamento') })))
            const titulo = nomeLivro(enc, entradas).replace(/_/g, ' ')
            setAExportar(true)
            try {
              const url = await exportarSheets(titulo, montarLivro(enc, entradas, (m) => m.versoes[m.versoes.length - 1]?.data ?? enc.criadaEm, destinatarios, true))
              atualizarEncomenda(enc.id, (e) => ({ ...e, linkSheets: { url, data: hojeISO(), titulo } }))
              log('Fichas exportadas (Google Sheets)', `${enc.cliente} · ${enc.colecao} · ${url}`)
              aviso('Folha criada no Google Drive.')
              window.open(url, '_blank')
            } catch (e) { alert(`Google Sheets: ${e instanceof Error ? e.message : String(e)}`) } finally { setAExportar(false) }
          }}>{aExportar ? 'A criar…' : 'Google Sheets'}</Botao>}
          <Botao variante="fantasma" icone={<Trash2 size={15} />} onClick={() => {
            if (confirm(`Apagar a encomenda ${enc.cliente} · ${enc.colecao} e as suas fichas?`)) { apagarEncomenda(enc.id); log('Encomenda apagada', `${enc.cliente} · ${enc.colecao}`); nav('/fichas') }
          }}>Apagar</Botao>
          {enc.estado !== 'Concluída' && <Botao icone={<CheckCheck size={15} />} disabled={!todasAprovadas} title={todasAprovadas ? '' : 'Há fichas por aprovar'}
            onClick={() => { atualizarEncomenda(enc.id, (e) => ({ ...e, estado: 'Concluída' })); log('Encomenda concluída', `${enc.cliente} · ${enc.colecao}`); aviso('Encomenda marcada como concluída.') }}>Marcar como concluída</Botao>}
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-5">
        <Kpi rotulo="Modelos" valor={enc.modelos.length} />
        <Kpi rotulo="Referências" valor={referenciasEncomenda(enc)} sub={`${int(enc.preEncomenda)} pré-encomenda · ${enc.stock} stock`} />
        <Kpi rotulo="Peças" valor={int(pecasEncomenda(enc))} sub={valor ? eur(valor) : undefined} />
        <Kpi rotulo="Fichas geradas" valor={fichasGeradas(enc)} sub={`de ${referenciasEncomenda(enc)} variantes`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 mb-5">
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

      {(() => { // ordens de fabrico do planeamento com o mesmo nº interno (só consulta)
        const ordens = ordensDaEncomenda(enc, ordensFabrico)
        return ordens.length > 0 && (
          <Cartao className="p-4 mb-5">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <p className="text-[13px] text-suave">Produção · planeamento da linha ({ordens.length} {ordens.length === 1 ? 'ordem' : 'ordens'} de fabrico)</p>
              <button onClick={() => nav('/producao')} className="text-azul text-[13px] hover:underline">Abrir Produção</button>
            </div>
            <div className="divide-y divide-linha text-[13px]">
              {ordens.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                  <span className="font-medium w-24">{o.numero}</span>
                  <span className="flex-1 min-w-[10rem]">{o.ref || '—'}{o.of && <span className="text-suave"> · OF {o.of}</span>}</span>
                  <span className="num text-suave">{o.qtd != null ? `${int(o.qtd)} peças` : ''}</span>
                  <span className="text-suave">{entregaDe(o) ? `entrega ${dataCurta(entregaDe(o))}` : ''}</span>
                  <Etiqueta ponto={false}>{o.estado || 'sem estado'}</Etiqueta>
                </div>
              ))}
            </div>
          </Cartao>
        )
      })()}

      <div className="mb-4"><Pilulas valor={aba} onChange={(v) => setParams(v === 'modelos' ? {} : { aba: v }, { replace: true })} opcoes={[
        { id: 'modelos', rotulo: 'Modelos e fichas' },
        { id: 'compras', rotulo: <>Compras{rc.porEncomendar > 0 && <span className="ml-1.5 text-[11px] font-semibold bg-ambar-fraco text-ambar rounded-full px-1.5">{rc.porEncomendar}</span>}</> },
        { id: 'prazos', rotulo: <>Prazos{(sp.nivel === 'atrasada' || sp.nivel === 'urgente') && <span className={`ml-1.5 inline-block size-2 rounded-full ${sp.nivel === 'atrasada' ? 'bg-vermelho' : 'bg-ambar'}`} />}</> },
        { id: 'guias', rotulo: <>Guias{(enc.guias ?? []).some((g) => g.estado === 'rascunho') && <span className="ml-1.5 inline-block size-2 rounded-full bg-ambar" />}</> },
      ]} /></div>
      {aba === 'compras' && <ComprasEncomenda enc={enc} />}
      {aba === 'prazos' && <PrazosEncomenda enc={enc} />}
      {aba === 'guias' && <GuiasEncomenda enc={enc} />}
      {aba === 'modelos' && <>
      <div className="flex gap-x-6 gap-y-1 flex-wrap text-[13px] mb-5">
        {verif.map((v) => <span key={v.texto} className={`flex items-center gap-1.5 ${v.ok ? 'text-verde' : 'text-ambar'}`}>{v.ok ? <Check size={14} /> : <AlertTriangle size={14} />}{v.texto}</span>)}
      </div>

      <Tabela<Modelo>
        linhas={enc.modelos} chave={(m) => m.id} onLinha={(m) => m.estado !== 'sem-ficha' && nav(`/fichas/${enc.id}/${m.id}`)}
        colunas={[
          { id: 'modelo', rotulo: 'Modelo', valor: (m) => `${m.nome} ${m.refCliente ?? ''}`, filtro: 'texto', render: (m) => (
            <div><p className="font-medium">{m.nome}{m.alias && <span className="text-suave font-normal"> ({m.alias})</span>}</p>
              {m.refCliente && <p className="text-[12px] text-tenue font-mono">{m.linhaEncomenda} · {m.refCliente}</p>}
              {comOF && m.of && <p className="text-[12px] mt-0.5 flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); void abrirOF(m.of!.caminho) }} className="inline-flex items-center gap-1 text-azul hover:underline"><FileText size={12} />OF: {m.of.ficheiro}</button>
                {m.estado !== 'sem-ficha' && <label onClick={(e) => e.stopPropagation()} className="text-tenue hover:text-tinta cursor-pointer">substituir
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void carregarOF(m, f) }} /></label>}
              </p>}</div>) },
          { id: 'tipo', rotulo: 'Tipo de peça', valor: (m) => m.tipoPeca, filtro: 'lista' },
          { id: 'var', rotulo: 'Variantes', valor: (m) => m.variantes.map((v) => v.nome).join(' · '), render: (m) => <span className="text-[13px] text-tinta-2">{m.variantes.map((v) => (
            <span key={v.id} className="whitespace-nowrap">{v.nome}{(v.linhasOrigem ?? 1) > 1 && <span className="ml-1 text-[11px] text-azul bg-azul-fraco rounded px-1" title="A mesma cor vinha partida em várias linhas da encomenda">{v.linhasOrigem} linhas juntas</span>}</span>
          )).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</span> },
          { id: 'pecas', rotulo: 'Peças', valor: (m) => pecasModelo(m), render: (m) => int(pecasModelo(m)), alinhar: 'centro' },
          { id: 'dest', rotulo: 'Folhas por destinatário', valor: (m) => (m.estado === 'sem-ficha' ? '' : folhasDoModelo(m).join()), render: (m) => m.estado === 'sem-ficha' ? <span className="text-tenue">—</span> :
            <span className="text-[12px] text-suave">{folhasDoModelo(m).filter((f) => f !== 'medidas').map((f) => f === 'produto' || f === 'embalamento' ? NOME_FOLHA[f] : `${NOME_FOLHA[f]} (${destNome(f)})`).join(' · ')}</span> },
          { id: 'ficha', rotulo: 'Ficha', valor: (m) => estadoFicha(m).rotulo, filtro: 'lista', alinhar: 'centro',
            render: (m) => { const e = estadoFicha(m); return <Etiqueta tom={e.tom}>{e.rotulo}</Etiqueta> } },
        ]}
        acaoLinha={(m) => {
          if (m.estado !== 'sem-ficha') return <Botao pequeno onClick={() => nav(`/fichas/${enc.id}/${m.id}`)}>Abrir fichas</Botao>
          if (comOF && !m.of) return botaoOF(m, 'Carregar OF')
          const tp = m.techPackLido && (enc.techPacks ?? []).find((t) => t.ficheiro === m.techPackLido!.ficheiro)
          const modeloTP = tp ? (tp.dados as TechPackLido).modelos[m.techPackLido!.indice] : undefined
          if (comOF && !modeloTP) return (
            <span className="inline-flex gap-1.5">
              <Botao pequeno variante="primario" icone={<RefreshCw size={13} />} disabled={aTratarOF === m.id} title={m.of?.erroLeitura}
                onClick={async () => { setATratarOF(m.id); try { await lerOF(m, m.of!.ficheiro, m.of!.caminho) } finally { setATratarOF(null) } }}>{aTratarOF === m.id ? 'A ler…' : 'Ler OF'}</Botao>
              {botaoOF(m, 'Substituir')}
            </span>
          )
          if (modeloTP) return (
            <Botao pequeno variante="primario" onClick={() => {
              atualizarModelo(enc.id, m.id, (x) => gerarFichaDoTechPack(x, modeloTP, enc, { fornecedores, tecidos, equivalencias, acessorios, clientes }))
              log(comOF ? 'Ficha gerada da OF' : 'Ficha gerada do tech pack', `${enc.cliente} · ${m.nome} · ${tp!.ficheiro}`)
              aviso('Ficha gerada. Reveja os valores assinalados e aprove.')
              nav(`/fichas/${enc.id}/${m.id}`)
            }}>Gerar ficha</Botao>
          )
          return <Botao pequeno variante="fantasma" icone={<Upload size={13} />} onClick={() => nav('/fichas/nova')}>Tech pack</Botao>
        }}
      />
      </>}
    </>
  )
}
