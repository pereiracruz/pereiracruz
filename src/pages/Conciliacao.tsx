import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, Check, CircleCheck, Download, FileUp, Landmark, Link2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Botao, Cabecalho, Campo, Cartao, Entrada, Etiqueta, Modal, Seletor, Vazio, aviso } from '../components/ui'
import { lerComIA, type ExtratoLido } from '../lib/ia'
import { lerExtratoFicheiro } from '../lib/extratoFicheiro'
import {
  MESES, apagarConciliacao, arred, candidatas, carregarFaturas, cruzar, descarregarExcel, guardarConciliacao, idConciliacao,
  listarConciliacoes, saldoCalculado, textoFaturas, type Conciliacao, type DocTOC, type Movimento,
} from '../lib/conciliacao'
import { NOME_EMPRESA_TOC, tocDisponivel, type EmpresaTOC } from '../lib/toconline'
import { dataCurta, eur } from '../lib/format'
import { useDb } from '../store/db'

const CONTAS_HABITUAIS = ['Crédito Agrícola', 'Caixa Geral de Depósitos', 'Montepio', 'Revolut']
const ESTADOS: Record<Movimento['estado'], { rotulo: string; tom: 'verde' | 'ambar' | 'vermelho' | 'azul' | 'neutro' }> = {
  confirmado: { rotulo: 'Confirmado', tom: 'verde' },
  proposto: { rotulo: 'Proposta', tom: 'azul' },
  'por-conciliar': { rotulo: 'Por conciliar', tom: 'ambar' },
  'sem-fatura': { rotulo: 'Sem fatura', tom: 'neutro' },
}

export default function ConciliacaoBancaria() {
  const log = useDb((s) => s.log)
  const [lista, setLista] = useState<Conciliacao[] | null>(null)
  const [atual, setAtual] = useState<Conciliacao | null>(null)
  const [erro, setErro] = useState('')
  const carregar = () => listarConciliacoes().then(setLista).catch((e) => setErro(e.message))
  useEffect(() => { if (tocDisponivel) void carregar() }, [])

  if (!tocDisponivel) return <><Cabecalho sobre="Financeiro" titulo="Conciliação bancária" /><Vazio>Disponível no site publicado (com servidor).</Vazio></>
  if (atual) return <Editor inicial={atual} anteriores={lista ?? []} onSair={() => { setAtual(null); void carregar() }} log={log} />

  const nova = () => {
    const hoje = new Date()
    const mes = hoje.getMonth() === 0 ? 12 : hoje.getMonth()
    const ano = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear()
    setAtual({ id: '', empresa: 'PP', conta: CONTAS_HABITUAIS[0], ano, mes, saldoInicial: 0, saldoFinalExtrato: null, movimentos: [], atualizadoEm: '' })
  }
  const porConciliar = (c: Conciliacao) => c.movimentos.filter((m) => m.estado === 'por-conciliar' || m.estado === 'proposto').length

  return (
    <>
      <Cabecalho sobre="Financeiro" titulo="Conciliação bancária"
        sub="Carregue o extrato do banco (PDF, Word, CSV ou Excel): a IA lê os movimentos e a aplicação procura no TOConline a fatura de cada um."
        acoes={<>
          {lista && lista.length > 0 && <Botao icone={<Download size={15} />} onClick={() => descarregarExcel(lista.filter((c) => c.ano === lista[0].ano).sort((a, b) => a.mes - b.mes || a.conta.localeCompare(b.conta)), `Conciliacao_Bancaria_${lista[0].ano}.xlsx`)}>Excel do ano</Botao>}
          <Botao variante="primario" icone={<Plus size={15} />} onClick={nova}>Nova conciliação</Botao>
        </>} />
      {erro && <p className="mb-4 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}
      <Cartao>
        {!lista ? <Vazio>A carregar…</Vazio> : lista.length === 0 ? <Vazio>Ainda não há conciliações. Carregue em «Nova conciliação».</Vazio> : (
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12px] uppercase tracking-wider text-suave border-b border-linha">
              <th className="text-left px-5 py-2.5">Mês</th><th className="text-left">Empresa</th><th className="text-left">Conta</th>
              <th className="text-right">Movimentos</th><th className="text-right">Por conciliar</th><th className="text-right pr-5">Saldo final</th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} onClick={() => setAtual(c)} className="border-b border-linha last:border-0 hover:bg-fundo cursor-pointer">
                  <td className="px-5 py-2.5 font-medium">{MESES[c.mes - 1]} {c.ano}</td>
                  <td>{NOME_EMPRESA_TOC[c.empresa]}</td><td>{c.conta}</td>
                  <td className="text-right num">{c.movimentos.length}</td>
                  <td className="text-right">{porConciliar(c) ? <Etiqueta tom="ambar">{porConciliar(c)}</Etiqueta> : <Etiqueta tom="verde">0</Etiqueta>}</td>
                  <td className="text-right pr-5 num">{eur(saldoCalculado(c))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </>
  )
}

function Editor({ inicial, anteriores, onSair, log }: { inicial: Conciliacao; anteriores: Conciliacao[]; onSair: () => void; log: (a: string, d: string) => void }) {
  const [c, setC] = useState<Conciliacao>(inicial)
  const [docs, setDocs] = useState<DocTOC[] | null>(null)
  const [estado, setEstado] = useState('')
  const [erro, setErro] = useState('')
  const [aLer, setALer] = useState(false)
  const [alterado, setAlterado] = useState(false)
  const [escolher, setEscolher] = useState<Movimento | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'pendentes'>('todos')
  const input = useRef<HTMLInputElement>(null)
  const nova = !inicial.id

  const mudar = (f: (c: Conciliacao) => Conciliacao) => { setC(f); setAlterado(true) }
  const mudarMov = (id: string, f: (m: Movimento) => Movimento) => mudar((x) => ({ ...x, movimentos: x.movimentos.map((m) => (m.id === id ? f(m) : m)) }))

  // saldo transitado: o saldo final da conciliação do mês anterior (mesma empresa e conta)
  const anterior = anteriores.find((a) => a.empresa === c.empresa && a.conta === c.conta && (a.ano * 12 + a.mes) === (c.ano * 12 + c.mes - 1))

  const lerExtrato = async (f: File) => {
    setALer(true); setErro('')
    try {
      // CSV e Excel exportados do banco leem-se diretamente (rápido, sem IA); PDF, Word e fotos com IA
      let d: ExtratoLido | null = null, caminho = ''
      if (/\.(csv|txt|xlsx|xls|xlsm)$/i.test(f.name)) { setEstado(`A ler ${f.name}…`); d = await lerExtratoFicheiro(f) }
      if (!d) {
        setEstado(`A ler ${f.name} com IA… (pode demorar 1 a 2 minutos)`)
        const r = await lerComIA<ExtratoLido>(f, 'extrato', `Empresa: ${NOME_EMPRESA_TOC[c.empresa]}. Conta: ${c.conta}. Mês: ${MESES[c.mes - 1]} ${c.ano}.`)
        d = r.dados; caminho = r.caminho
      }
      // muitos bancos mostram os movimentos do mais recente para o mais antigo: a conciliação fica por ordem de data
      const lidos = d.movimentos.length > 1 && d.movimentos[0].data > d.movimentos[d.movimentos.length - 1].data ? [...d.movimentos].reverse() : d.movimentos
      const movimentos: Movimento[] = lidos.map((m, i): Movimento => ({
        id: `m${i + 1}`, data: m.data, descricao: m.descricao.trim(), valor: arred(m.valor), saldoBanco: m.saldo, faturas: [], obs: '', estado: 'por-conciliar',
      }))
      const saldoInicial = d.saldoInicial ?? (anterior ? saldoCalculado(anterior) : 0)
      mudar((x) => ({ ...x, movimentos, saldoInicial: arred(saldoInicial), saldoFinalExtrato: d.saldoFinal, extrato: { nome: f.name, caminho } }))
      setEstado(`${movimentos.length} movimentos lidos.`)
      log('Extrato bancário lido', `${NOME_EMPRESA_TOC[c.empresa]} · ${c.conta} · ${MESES[c.mes - 1]} ${c.ano} · ${movimentos.length} movimentos`)
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setEstado('') } finally { setALer(false) }
  }

  const fazerCruzamento = async () => {
    setALer(true); setErro('')
    try {
      let lista = docs
      if (!lista) {
        // faturas desde 12 meses antes do mês (pagamentos de faturas antigas)
        const desde = `${c.ano - 1}-${String(c.mes).padStart(2, '0')}-01`
        setEstado('A ler as faturas do TOConline…')
        const r = await carregarFaturas(c.empresa, desde, setEstado)
        if (r.erros.length) setErro(r.erros.join(' · '))
        lista = [...r.vendas, ...r.compras]
        setDocs(lista)
      }
      const novo = cruzar(c, lista)
      mudar(() => novo)
      const propostos = novo.movimentos.filter((m) => m.estado === 'proposto').length
      setEstado(`${lista.length} faturas do TOConline · ${propostos} movimentos com fatura proposta. Confirme as propostas.`)
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setEstado('') } finally { setALer(false) }
  }

  const guardar = async () => {
    if (!c.movimentos.length) { aviso('Carregue primeiro o extrato.'); return }
    const id = idConciliacao(c.empresa, c.conta, c.ano, c.mes)
    if (nova && anteriores.some((a) => a.id === id) && !confirm(`Já existe a conciliação de ${MESES[c.mes - 1]} ${c.ano} desta conta. Substituir?`)) return
    try {
      const g = await guardarConciliacao({ ...c, id })
      setC(g); setAlterado(false); aviso('Conciliação guardada.')
      log('Conciliação bancária guardada', `${NOME_EMPRESA_TOC[c.empresa]} · ${c.conta} · ${MESES[c.mes - 1]} ${c.ano}`)
    } catch (e) { aviso(`Não foi possível guardar: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const apagar = async () => {
    if (!confirm('Apagar esta conciliação da aplicação? (O extrato e as faturas não são apagados.)')) return
    try { await apagarConciliacao(c.id); aviso('Conciliação apagada.'); onSair() } catch (e) { aviso(e instanceof Error ? e.message : String(e)) }
  }

  const confirmarPropostas = () => mudar((x) => ({ ...x, movimentos: x.movimentos.map((m): Movimento => (m.estado === 'proposto' && m.confianca !== 'baixa' ? { ...m, estado: 'confirmado' } : m)) }))

  const saldo = saldoCalculado(c)
  const diferenca = c.saldoFinalExtrato != null ? arred(saldo - c.saldoFinalExtrato) : null
  const contagem = (e: Movimento['estado']) => c.movimentos.filter((m) => m.estado === e).length
  const visiveis = filtro === 'todos' ? c.movimentos : c.movimentos.filter((m) => m.estado === 'por-conciliar' || m.estado === 'proposto')
  const contas = useMemo(() => [...new Set([...CONTAS_HABITUAIS, ...anteriores.map((a) => a.conta)])], [anteriores])

  return (
    <>
      <Cabecalho migalhas={[{ rotulo: 'Conciliação bancária' }, { rotulo: nova ? 'Nova' : `${MESES[c.mes - 1]} ${c.ano}` }]} sobre="Financeiro"
        titulo={`${MESES[c.mes - 1]} ${c.ano} · ${c.conta}`}
        acoes={<>
          <Botao variante="fantasma" icone={<ArrowLeft size={15} />} onClick={() => { if (!alterado || confirm('Sair sem guardar as alterações?')) onSair() }}>Voltar</Botao>
          {!nova && <Botao variante="perigo" icone={<Trash2 size={15} />} onClick={apagar}>Apagar</Botao>}
          <Botao icone={<Download size={15} />} disabled={!c.movimentos.length} onClick={() => descarregarExcel([c], `Conciliacao_${c.empresa}_${c.ano}_${String(c.mes).padStart(2, '0')}_${c.conta.replace(/\s+/g, '')}.xlsx`)}>Excel</Botao>
          <Botao variante="primario" icone={<Save size={15} />} disabled={!alterado} onClick={guardar}>Guardar</Botao>
        </>} />

      <Cartao className="p-5 mb-5">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <Campo rotulo="Empresa">
            <Seletor valor={NOME_EMPRESA_TOC[c.empresa]} opcoes={Object.values(NOME_EMPRESA_TOC)}
              onChange={(v) => { mudar((x) => ({ ...x, empresa: (Object.entries(NOME_EMPRESA_TOC).find(([, n]) => n === v)?.[0] ?? 'PP') as EmpresaTOC })); setDocs(null) }} />
          </Campo>
          <Campo rotulo="Conta">
            <Entrada list="contas-banco" value={c.conta} onChange={(e) => mudar((x) => ({ ...x, conta: e.target.value }))} />
            <datalist id="contas-banco">{contas.map((n) => <option key={n} value={n} />)}</datalist>
          </Campo>
          <Campo rotulo="Mês">
            <Seletor valor={MESES[c.mes - 1]} opcoes={MESES} onChange={(v) => { mudar((x) => ({ ...x, mes: MESES.indexOf(v) + 1 })); setDocs(null) }} />
          </Campo>
          <Campo rotulo="Ano">
            <Entrada inputMode="numeric" value={String(c.ano)} onChange={(e) => { mudar((x) => ({ ...x, ano: Number(e.target.value) || x.ano })); setDocs(null) }} />
          </Campo>
          <Campo rotulo="Saldo transitado" ajuda={anterior ? `Mês anterior: ${eur(saldoCalculado(anterior))}` : undefined}>
            <Entrada inputMode="decimal" value={String(c.saldoInicial)} onChange={(e) => mudar((x) => ({ ...x, saldoInicial: Number(e.target.value.replace(',', '.')) || 0 }))} />
          </Campo>
          <div className="flex gap-2 flex-wrap">
            <Botao icone={<FileUp size={15} />} disabled={aLer} onClick={() => input.current?.click()}>{c.movimentos.length ? 'Outro extrato' : 'Carregar extrato'}</Botao>
            <input ref={input} type="file" hidden accept=".pdf,.docx,.csv,.txt,.xlsx,.xls,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void lerExtrato(f); e.target.value = '' }} />
          </div>
        </div>
        {c.extrato && <p className="text-[13px] text-suave mt-3">Extrato: {c.extrato.nome}</p>}
        {estado && <p className="text-[13px] text-tinta-2 mt-3 flex items-center gap-2">{aLer && <RefreshCw size={13} className="animate-spin" />}{estado}</p>}
        {erro && <p className="mt-3 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}
      </Cartao>

      {c.movimentos.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <Resumo rotulo="Movimentos" valor={String(c.movimentos.length)} />
            <Resumo rotulo="Confirmados" valor={String(contagem('confirmado'))} tom="verde" />
            <Resumo rotulo="Propostas a rever" valor={String(contagem('proposto'))} tom="azul" />
            <Resumo rotulo="Por conciliar" valor={String(contagem('por-conciliar'))} tom="ambar" />
            <Resumo rotulo="Saldo final" valor={eur(saldo)}
              sub={diferenca == null ? undefined : diferenca === 0 ? 'igual ao extrato ✓' : `extrato: ${eur(c.saldoFinalExtrato!)} · diferença ${eur(diferenca)}`}
              tom={diferenca == null ? undefined : diferenca === 0 ? 'verde' : 'vermelho'} />
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Botao variante="primario" icone={<Link2 size={15} />} disabled={aLer} onClick={fazerCruzamento}>{docs ? 'Cruzar outra vez' : 'Cruzar com o TOConline'}</Botao>
            {contagem('proposto') > 0 && <Botao icone={<Check size={15} />} onClick={confirmarPropostas}>Confirmar propostas de confiança alta/média</Botao>}
            <span className="flex-1" />
            <Botao pequeno variante={filtro === 'todos' ? 'secundario' : 'fantasma'} onClick={() => setFiltro('todos')}>Todos</Botao>
            <Botao pequeno variante={filtro === 'pendentes' ? 'secundario' : 'fantasma'} onClick={() => setFiltro('pendentes')}>Por rever</Botao>
          </div>

          <Cartao>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-b border-linha">
                  <th className="text-left px-4 py-2.5 w-24">Data</th><th className="text-left">Descrição</th><th className="text-right w-28">Quantia</th>
                  <th className="text-left pl-4 w-72">Fatura</th><th className="text-left w-44">OBS</th><th className="w-28 pr-4" /></tr></thead>
                <tbody>
                  {visiveis.map((m) => (
                    <tr key={m.id} className="border-b border-linha last:border-0 align-top">
                      <td className="px-4 py-2 whitespace-nowrap">{dataCurta(m.data)}</td>
                      <td className="py-2 pr-2">
                        <input value={m.descricao} onChange={(e) => mudarMov(m.id, (x) => ({ ...x, descricao: e.target.value }))}
                          className="w-full bg-transparent outline-none focus:bg-fundo rounded px-1 -mx-1" />
                      </td>
                      <td className={clsx('py-2 text-right num whitespace-nowrap', m.valor < 0 ? 'text-vermelho' : 'text-verde')}>{eur(m.valor)}</td>
                      <td className="py-2 pl-4">
                        <button onClick={() => setEscolher(m)} className="text-left w-full hover:bg-fundo rounded px-1 -mx-1">
                          {m.faturas.length ? <>
                            <span className="font-medium">{textoFaturas(m)}</span>
                            <span className="block text-[12px] text-tenue truncate">{m.faturas[0].entidade}{m.faturas.length === 1 && m.faturas[0].total != null && Math.abs(m.faturas[0].total) !== Math.abs(m.valor) ? ` · fatura ${eur(m.faturas[0].total)}` : ''}</span>
                          </> : <span className="text-tenue">{m.estado === 'sem-fatura' ? '— sem fatura' : 'Escolher…'}</span>}
                        </button>
                      </td>
                      <td className="py-2">
                        <input value={m.obs} placeholder="—" onChange={(e) => mudarMov(m.id, (x) => ({ ...x, obs: e.target.value }))}
                          className="w-full bg-transparent outline-none focus:bg-fundo rounded px-1 -mx-1 placeholder:text-tenue" />
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {m.estado === 'proposto'
                          ? <button onClick={() => mudarMov(m.id, (x) => ({ ...x, estado: 'confirmado' }))} title="Confirmar a proposta"
                            className="inline-flex items-center gap-1 text-[12px] text-azul hover:underline"><CircleCheck size={13} />Confirmar{m.confianca === 'baixa' ? ' ?' : ''}</button>
                          : <Etiqueta tom={ESTADOS[m.estado].tom}>{ESTADOS[m.estado].rotulo}</Etiqueta>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
          {diferenca != null && diferenca !== 0 && (
            <p className="mt-4 text-[13px] text-vermelho flex items-center gap-2"><AlertTriangle size={14} />O saldo calculado não bate com o extrato: confirme o saldo transitado e se faltam movimentos.</p>
          )}
        </>
      )}

      <Escolher mov={escolher} docs={docs} onFechar={() => setEscolher(null)}
        onEscolher={(m) => { mudarMov(m.id, () => m); setEscolher(null) }} />
    </>
  )
}

function Resumo({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: 'verde' | 'azul' | 'ambar' | 'vermelho' }) {
  return (
    <Cartao className="px-4 py-3">
      <p className="text-[12px] text-suave">{rotulo}</p>
      <p className={clsx('text-[20px] font-semibold num', tom === 'verde' && 'text-verde', tom === 'ambar' && 'text-ambar', tom === 'vermelho' && 'text-vermelho', tom === 'azul' && 'text-azul')}>{valor}</p>
      {sub && <p className="text-[12px] text-tenue">{sub}</p>}
    </Cartao>
  )
}

/** Janela para escolher a fatura de um movimento: propostas, pesquisa nas faturas, nº escrito à mão ou «sem fatura». */
function Escolher({ mov, docs, onFechar, onEscolher }: { mov: Movimento | null; docs: DocTOC[] | null; onFechar: () => void; onEscolher: (m: Movimento) => void }) {
  const [pesquisa, setPesquisa] = useState('')
  const [manual, setManual] = useState('')
  useEffect(() => { setPesquisa(''); setManual(mov && !mov.faturas.some((f) => f.id) ? (mov.faturas[0]?.numero ?? '') : '') }, [mov])
  if (!mov) return null
  const propostas = docs ? candidatas(mov, docs) : []
  const termo = pesquisa.trim().toLowerCase()
  const encontrados = docs && termo.length >= 2
    ? docs.filter((d) => (mov.valor >= 0 ? d.tipo === 'venda' : d.tipo === 'compra') && (`${d.numero} ${d.entidade} ${d.total}`.toLowerCase().includes(termo))).slice(0, 30)
    : []
  const usar = (ds: DocTOC[]) => onEscolher({ ...mov, estado: 'confirmado', confianca: undefined, faturas: ds.map((d) => ({ id: d.id, tipo: d.tipo, numero: d.numero, entidade: d.entidade, total: d.total })) })
  const Linha = ({ ds, motivo }: { ds: DocTOC[]; motivo?: string }) => (
    <button onClick={() => usar(ds)} className="w-full text-left px-3 py-2 rounded-md hover:bg-fundo border border-linha">
      <p className="text-[14px] font-medium">{ds.map((d) => `${d.docType} ${d.numero}`).join(' + ')} <span className="font-normal text-suave">· {eur(ds.reduce((s, d) => s + d.total, 0))}</span></p>
      <p className="text-[12px] text-tenue">{ds[0].entidade} · {ds.map((d) => dataCurta(d.data)).join(', ')}{ds[0].pendente ? ` · em dívida ${eur(ds[0].pendente)}` : ''}{motivo ? ` · ${motivo}` : ''}</p>
    </button>
  )
  return (
    <Modal aberto onFechar={onFechar} titulo="Fatura do movimento" largura="max-w-2xl" sub={`${dataCurta(mov.data)} · ${mov.descricao} · ${eur(mov.valor)}`}
      rodape={<>
        <Botao variante="fantasma" onClick={() => onEscolher({ ...mov, estado: 'por-conciliar', faturas: [], confianca: undefined })}>Limpar</Botao>
        <Botao onClick={() => onEscolher({ ...mov, estado: 'sem-fatura', faturas: [], confianca: undefined })}>Sem fatura</Botao>
      </>}>
      {!docs && <p className="text-[13px] text-ambar bg-ambar-fraco border border-ambar-borda rounded-controlo px-3 py-2 mb-4">Carregue em «Cruzar com o TOConline» para ver as faturas propostas.</p>}
      {propostas.length > 0 && <>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-suave mb-2">Propostas</p>
        <div className="space-y-1.5 mb-5">{propostas.map((p, i) => <Linha key={i} ds={p.docs} motivo={p.motivo} />)}</div>
      </>}
      {docs && <>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-suave mb-2">Procurar fatura de {mov.valor >= 0 ? 'cliente' : 'fornecedor'}</p>
        <Entrada value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} placeholder="Nº, nome ou valor" className="mb-2" />
        <div className="space-y-1.5 mb-5 max-h-64 overflow-auto">{encontrados.map((d) => <Linha key={d.id} ds={[d]} />)}</div>
      </>}
      <p className="text-[12px] font-semibold uppercase tracking-wider text-suave mb-2">Ou escrever o nº (fatura que não está no TOConline)</p>
      <div className="flex gap-2">
        <Entrada value={manual} onChange={(e) => setManual(e.target.value)} placeholder="ex.: FT 1/38441 - FT 1/38478" />
        <Botao disabled={!manual.trim()} onClick={() => onEscolher({ ...mov, estado: 'confirmado', confianca: undefined, faturas: [{ numero: manual.trim() }] })}>Usar</Botao>
      </div>
      <p className="text-[12px] text-tenue mt-3 flex items-center gap-1.5"><Landmark size={12} />O nº escolhido vai entre parênteses na descrição do Excel, como na sua conciliação.</p>
    </Modal>
  )
}
