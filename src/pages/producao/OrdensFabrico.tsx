import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, FileSpreadsheet, History, Link2, Undo2 } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Cartao, Entrada, Kpi, Modal, Pilulas, Tabela, aviso } from '../../components/ui'
import { compararPlaneamento, lerPlaneamento, type LeituraPlaneamento } from '../../lib/planeamentoExcel'
import { atrasada, encomendaDaOrdem, entregaDe, fechada, numeroComOutroCliente } from '../../lib/producao-ordens'
import { ACAO_DESCARREGADA, criarCopia, descarregarCopia } from '../../lib/copias'
import { dataCurta, dataHora, eur, hojeISO, int } from '../../lib/format'
import type { OrdemFabrico } from '../../types'

const tomEstado = (e: string) => (/^0[1-4]\b/.test(e) ? 'bg-ambar-fraco text-ambar border-ambar-borda'
  : /^(16|17|18)\b|entregue|faturad/i.test(e) ? 'bg-verde-fraco text-verde border-verde-borda'
    : /fora/i.test(e) ? 'bg-azul-fraco text-azul border-azul/30' : 'bg-papel text-tinta border-linha')

function SeletorEstado({ o, estados }: { o: OrdemFabrico; estados: string[] }) {
  const { atualizarOrdem, log } = useDb()
  const lista = estados.includes(o.estado) || !o.estado ? estados : [o.estado, ...estados]
  return (
    <select value={o.estado} onClick={(e) => e.stopPropagation()} aria-label={`Estado de ${o.numero}`}
      onChange={(e) => { atualizarOrdem(o.id, { estado: e.target.value, estadoAlteradoEm: hojeISO() }); log('Produção: estado alterado', `${o.numero} ${o.cliente} · ${o.ref}: ${e.target.value}`) }}
      className={clsx('h-8 max-w-[13rem] rounded-md border px-2 text-[12.5px] font-medium outline-none', tomEstado(o.estado))}>
      {!o.estado && <option value="">—</option>}
      {lista.map((s) => <option key={s}>{s}</option>)}
    </select>
  )
}

type Previa = LeituraPlaneamento & { ficheiro: string; comp: ReturnType<typeof compararPlaneamento>; ligadas: number; outroCliente: string[] }

export default function OrdensFabrico() {
  const nav = useNavigate()
  const estado = useDb()
  const { ordensFabrico: ordens, estadosProducao, encomendas, importarOrdens, apagarImportacao, log } = estado
  const input = useRef<HTMLInputElement>(null)
  const [vista, setVista] = useState<'estado' | 'lista'>('estado')
  const [verFechadas, setVerFechadas] = useState(false)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState('')
  const [aLer, setALer] = useState(false)
  const [importacoes, setImportacoes] = useState(false)
  const [desfazer, setDesfazer] = useState<string | null>(null)
  const [textoDesfazer, setTextoDesfazer] = useState('')
  const hoje = hojeISO()

  const estados = useMemo(() => {
    const base = [...estadosProducao].sort((a, b) => a.ordem - b.ordem).map((e) => e.nome)
    const outros = [...new Set(ordens.map((o) => o.estado).filter((e) => e && !base.includes(e)))].sort()
    return [...base, ...outros]
  }, [estadosProducao, ordens])
  const emCurso = ordens.filter((o) => !fechada(o))
  const visiveis = (verFechadas ? ordens : emCurso).slice().sort((a, b) => (a.prioridade ?? 1e9) - (b.prioridade ?? 1e9) || a.numero.localeCompare(b.numero, 'pt', { numeric: true }))
  const grupos = useMemo(() => [...new Set(ordens.map((o) => o.importacao))].map((id) => {
    const os = ordens.filter((o) => o.importacao === id)
    return { id, n: os.length, ficheiro: os[0].ficheiro, em: os[0].importadoEm }
  }).sort((a, b) => b.em.localeCompare(a.em)), [ordens])

  const escolher = async (f: File) => {
    setErro(''); setALer(true)
    try {
      const l = await lerPlaneamento(await f.arrayBuffer())
      const ligadas = new Set(l.ordens.map((o) => encomendaDaOrdem(o as OrdemFabrico, encomendas)?.id).filter(Boolean)).size
      const outroCliente = [...new Set(l.ordens.map((o) => { const e = numeroComOutroCliente(o as OrdemFabrico, encomendas); return e ? `${o.numero} (${o.cliente} no Excel, ${e.cliente} na aplicação)` : '' }).filter(Boolean))]
      setPrevia({ ...l, ficheiro: f.name, comp: compararPlaneamento(l.ordens, ordens), ligadas, outroCliente })
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setALer(false) }
  }
  const importar = () => {
    if (!previa) return
    const importacao = `imp-${Date.now().toString(36)}`, agora = new Date().toISOString()
    importarOrdens(previa.ordens.map((o) => ({ ...o, importacao, ficheiro: previa.ficheiro, importadoEm: agora })))
    log('Planeamento importado', `${previa.ficheiro} · folha ${previa.folha} · ${previa.ordens.length} ordens (${previa.comp.novas.length} novas, ${previa.comp.alteradas.length} alteradas)`)
    aviso(`${previa.ordens.length} ordens de fabrico importadas.`)
    setPrevia(null)
  }
  const confirmarDesfazer = () => {
    const g = grupos.find((x) => x.id === desfazer)
    if (!g) return
    const c = criarCopia(estado as unknown as Parameters<typeof criarCopia>[0])
    log(ACAO_DESCARREGADA, `${descarregarCopia(c)} · antes de desfazer a importação do planeamento`)
    apagarImportacao(g.id)
    log('Importação do planeamento desfeita', `${g.ficheiro} de ${dataHora(g.em)} · ${g.n} ordens apagadas`)
    aviso(`Importação desfeita: ${g.n} ordens apagadas.`)
    setDesfazer(null); setTextoDesfazer(''); setImportacoes(false)
  }

  const cartaoOrdem = (o: OrdemFabrico) => {
    const enc = encomendaDaOrdem(o, encomendas)
    return (
      <div key={o.id} className="rounded-controlo border border-linha bg-papel p-3 text-[13px] space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold">{o.numero}</span>
          {o.prioridade != null && <span className="text-[11px] text-suave">prioridade {o.prioridade}</span>}
        </div>
        <p className="font-medium leading-snug">{o.cliente}</p>
        <p className="text-tinta-2 leading-snug">{o.ref || '—'}{o.of && <span className="text-suave"> · OF {o.of}</span>}</p>
        <p className="text-suave">{o.qtd != null ? `${int(o.qtd)} peças` : ''}{entregaDe(o) && <span className={clsx(atrasada(o, hoje) && 'text-vermelho font-medium')}> · entrega {dataCurta(entregaDe(o))}</span>}</p>
        {o.darFora && o.darFora !== 'Não' && <p className="text-azul text-[12px]">Fora: {o.darFora}</p>}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <SeletorEstado o={o} estados={estados} />
          {enc && <button onClick={() => nav(`/fichas/${enc.id}`)} className="text-azul text-[12px] flex items-center gap-1 hover:underline" title="Abrir a encomenda"><Link2 size={13} />fichas</button>}
        </div>
      </div>
    )
  }

  return (
    <>
      <Cabecalho sobre="Fichas de produção" titulo="Produção"
        sub="Ordens de fabrico do planeamento da linha (importadas do Excel): estado de cada uma, prioridade e entrega. Os salários e as folhas de custos do Excel não são lidos."
        acoes={<>
          {grupos.length > 0 && <Botao variante="fantasma" icone={<History size={15} />} onClick={() => setImportacoes(true)}>Importações</Botao>}
          <Botao variante="primario" icone={<FileSpreadsheet size={15} />} disabled={aLer} onClick={() => input.current?.click()}>{aLer ? 'A ler…' : 'Importar planeamento (Excel)'}</Botao>
          <input ref={input} type="file" hidden accept=".xlsx,.xlsm,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolher(f); e.target.value = '' }} />
        </>} />
      {erro && <p className="mb-4 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}

      {!ordens.length ? (
        <Cartao className="p-6 text-[14px] text-suave">
          Ainda não há ordens de fabrico. Importe o Excel do planeamento (folha PLAN_RENT): entram as encomendas com cliente, OF, referência, quantidade, preço, datas e estado.
          Pode desfazer a importação a qualquer momento.
        </Cartao>
      ) : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-5">
          <Kpi rotulo="Em curso" valor={emCurso.length} sub={`de ${ordens.length} ordens`} />
          <Kpi rotulo="À espera de tecido" valor={emCurso.filter((o) => /^01\b|tecido/i.test(o.estado)).length} tom={emCurso.some((o) => /^01\b/.test(o.estado)) ? 'ambar' : undefined} />
          <Kpi rotulo="Entrega já passou" valor={emCurso.filter((o) => atrasada(o, hoje)).length} tom={emCurso.some((o) => atrasada(o, hoje)) ? 'vermelho' : undefined} />
          <Kpi rotulo="Valor em curso" valor={eur(emCurso.reduce((s, o) => s + (o.valor ?? 0), 0))} sub={`${int(emCurso.reduce((s, o) => s + (o.qtd ?? 0), 0))} peças`} />
        </div>
        <div className="flex items-center gap-4 flex-wrap mb-4">
          <Pilulas valor={vista} onChange={setVista} opcoes={[{ id: 'estado', rotulo: 'Por estado' }, { id: 'lista', rotulo: 'Lista' }]} />
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={verFechadas} onChange={(e) => setVerFechadas(e.target.checked)} /> Mostrar entregues e faturadas</label>
        </div>

        {vista === 'estado' ? (
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
            {estados.filter((e) => verFechadas || !/^(16|17|18)\b|entregue|faturad/i.test(e)).map((e) => {
              const os = visiveis.filter((o) => o.estado === e)
              return (
                <div key={e} className="w-[250px] shrink-0">
                  <div className="flex items-center justify-between px-1 mb-2"><p className="text-[13px] font-semibold">{e}</p><span className="text-[12px] text-suave num">{os.length}</span></div>
                  <div className="space-y-2">{os.length ? os.map(cartaoOrdem) : <p className="text-[12px] text-tenue px-1">—</p>}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <Tabela<OrdemFabrico> linhas={visiveis} chave={(o) => o.id}
            colunas={[
              { id: 'num', rotulo: 'Nº', filtro: 'texto', valor: (o) => `${o.numero} ${o.of}`, render: (o) => { const enc = encomendaDaOrdem(o, encomendas)
                return <div><p className="font-medium whitespace-nowrap">{o.numero}</p>{enc && <button onClick={() => nav(`/fichas/${enc.id}`)} className="text-azul text-[12px] flex items-center gap-1 hover:underline"><Link2 size={12} />fichas</button>}</div> } },
              { id: 'cli', rotulo: 'Cliente', filtro: 'lista', valor: (o) => o.cliente },
              { id: 'ref', rotulo: 'Referência', filtro: 'texto', valor: (o) => `${o.ref} ${o.of} ${o.categoria}`, render: (o) => <div><p>{o.ref || '—'}</p><p className="text-[12px] text-tenue">{[o.of && `OF ${o.of}`, o.categoria].filter(Boolean).join(' · ')}</p></div> },
              { id: 'qtd', rotulo: 'Peças', alinhar: 'dir', valor: (o) => o.qtd ?? 0, render: (o) => (o.qtd != null ? int(o.qtd) : '—') },
              { id: 'valor', rotulo: 'Valor', alinhar: 'dir', valor: (o) => o.valor ?? 0, render: (o) => (o.valor != null ? <span className="num whitespace-nowrap">{eur(o.valor)}</span> : '—') },
              { id: 'ent', rotulo: 'Entrega', filtro: 'data', valor: (o) => entregaDe(o), render: (o) => entregaDe(o) ? <span className={clsx('whitespace-nowrap', atrasada(o, hoje) && 'text-vermelho font-medium')}>{dataCurta(entregaDe(o))}</span> : <span className="text-tenue">—</span> },
              { id: 'prio', rotulo: 'Prior.', alinhar: 'centro', valor: (o) => o.prioridade ?? 9999, render: (o) => o.prioridade ?? '—' },
              { id: 'estado', rotulo: 'Estado', filtro: 'lista', valor: (o) => o.estado, render: (o) => <SeletorEstado o={o} estados={estados} /> },
            ]} />
        )}
      </>}

      <Modal aberto={!!previa} onFechar={() => setPrevia(null)} titulo="Importar planeamento" largura="max-w-xl"
        sub={previa ? `${previa.ficheiro} · folha ${previa.folha}` : ''}
        rodape={<>
          <Botao variante="fantasma" onClick={() => setPrevia(null)}>Cancelar</Botao>
          <Botao variante="primario" disabled={!previa?.ordens.length} onClick={importar}>Importar {previa?.ordens.length} ordens</Botao>
        </>}>
        {previa && <div className="space-y-3 text-[14px]">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['Novas', previa.comp.novas.length], ['Alteradas', previa.comp.alteradas.length], ['Iguais', previa.comp.iguais]].map(([r, n]) => (
              <div key={r} className="rounded-controlo border border-linha py-2"><p className="text-[20px] font-semibold num">{n}</p><p className="text-[12px] text-suave">{r}</p></div>
            ))}
          </div>
          {previa.comp.estadoMuda.length > 0 && <p className="text-[13px] text-ambar flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{previa.comp.estadoMuda.length} ordem(ns) mudam de estado: o Excel substitui o estado escolhido na aplicação.</p>}
          <p className="text-[13px] text-suave">{previa.ligadas} encomenda(s) da aplicação ficam ligadas pelo nº interno. As encomendas e as fichas não são alteradas.</p>
          {previa.outroCliente.length > 0 && <p className="text-[13px] text-ambar flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>Com o mesmo nº mas outro cliente, não ficam ligadas: {previa.outroCliente.slice(0, 4).join('; ')}{previa.outroCliente.length > 4 ? '…' : ''}</span></p>}
          {previa.ignoradas > 0 && <p className="text-[13px] text-suave">{previa.ignoradas} linha(s) sem nº ignoradas.</p>}
          {previa.avisos.map((a) => <p key={a} className="text-[13px] text-suave">{a}</p>)}
          <p className="text-[12px] text-tenue">Só a folha do planeamento é lida: salários, nomes de trabalhadores e custos do Excel não entram na aplicação. A importação pode ser desfeita em «Importações».</p>
        </div>}
      </Modal>

      <Modal aberto={importacoes} onFechar={() => { setImportacoes(false); setDesfazer(null) }} titulo="Importações do planeamento" largura="max-w-xl"
        sub="Desfazer apaga as ordens que essa importação trouxe ou atualizou. As encomendas, fichas e restantes dados não são tocados.">
        <div className="space-y-2">
          {grupos.map((g) => (
            <div key={g.id} className="rounded-controlo border border-linha p-3 text-[13px]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span><b className="font-semibold">{g.ficheiro}</b><span className="block text-suave">{dataHora(g.em)} · {g.n} ordens</span></span>
                {desfazer !== g.id && <Botao pequeno variante="perigo" icone={<Undo2 size={14} />} onClick={() => { setDesfazer(g.id); setTextoDesfazer('') }}>Desfazer…</Botao>}
              </div>
              {desfazer === g.id && <div className="mt-3 space-y-2">
                <p>Antes de apagar é descarregada uma cópia de segurança. Escreva <b>DESFAZER</b> para confirmar.</p>
                <div className="flex gap-2">
                  <Entrada value={textoDesfazer} onChange={(e) => setTextoDesfazer(e.target.value)} placeholder="DESFAZER" />
                  <Botao variante="perigo" disabled={textoDesfazer.trim().toUpperCase() !== 'DESFAZER'} onClick={confirmarDesfazer}>Apagar {g.n} ordens</Botao>
                </div>
              </div>}
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
