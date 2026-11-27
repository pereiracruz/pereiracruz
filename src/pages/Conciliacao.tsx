import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, Check, CircleCheck, Download, ExternalLink, FileUp, Landmark, Link2, Plus, RefreshCw, Save, FileSpreadsheet, Trash2 } from 'lucide-react'
import { Botao, Cabecalho, Campo, Cartao, Entrada, Etiqueta, Modal, Seletor, Vazio, aviso } from '../components/ui'
import { lerComIA, type ExtratoLido } from '../lib/ia'
import { lerExtratoFicheiro } from '../lib/extratoFicheiro'
import { abrirModelo, descarregarModelo, folhaPara, preencher, type Modelo } from '../lib/excelModelo'
import { abrirLivroGoogle, ficheiroDaEmpresa, guardarFicheiroDaEmpresa, idDoLink, preencherGoogle, prepararGoogle, sheetsDisponivel, sugestaoFolha, type LivroGoogle } from '../lib/conciliacaoSheets'
import {
  MESES, apagarConciliacao, arred, candidatas, carregarFaturas, cruzar, guardarConciliacao, idConciliacao,
  listarConciliacoes, saldoCalculado, textoFaturas, type Conciliacao, type DocTOC, type Movimento,
} from '../lib/conciliacao'
import { NOME_EMPRESA_TOC, tocDisponivel, type EmpresaTOC } from '../lib/toconline'
import { dataCurta, eur } from '../lib/format'
import { useDb } from '../store/db'

// contas bancárias de cada empresa (a CGD da Pereira's Project tem a linha de confirming, plafond de 45 000 €)
const CONTAS: Record<EmpresaTOC, string[]> = {
  PP: ['Crédito Agrícola', 'Caixa Geral de Depósitos', 'Revolut'],
  PC: ['Montepio', 'Caixa Geral de Depósitos', 'Revolut'],
}
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
    setAtual({ id: '', empresa: 'PP', conta: CONTAS.PP[0], ano, mes, saldoInicial: 0, saldoFinalExtrato: null, movimentos: [], atualizadoEm: '' })
  }
  const porConciliar = (c: Conciliacao) => c.movimentos.filter((m) => m.estado === 'por-conciliar' || m.estado === 'proposto').length

  return (
    <>
      <Cabecalho sobre="Financeiro" titulo="Conciliação bancária"
        sub="Carregue o extrato do banco (PDF, Word, CSV ou Excel): a IA lê os movimentos e a aplicação procura no TOConline a fatura de cada um."
        acoes={<>
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
  const inputExcel = useRef<HTMLInputElement>(null)
  const [modelo, setModelo] = useState<Modelo | null>(null)
  const nova = !inicial.id

  // folha de cálculo Google da empresa (Drive): o id lê-se antes, para o clique abrir logo a janela do Google
  const [idGoogle, setIdGoogle] = useState<string | null>(null)
  const [livro, setLivro] = useState<LivroGoogle | null>(null)
  useEffect(() => { void prepararGoogle(); setIdGoogle(null); void ficheiroDaEmpresa(c.empresa).then(setIdGoogle) }, [c.empresa])
  const abrirGoogle = async () => {
    if (!idGoogle) return
    try { setLivro(await abrirLivroGoogle(idGoogle)) } catch (e) { aviso(e instanceof Error ? e.message : String(e)) }
  }

  const abrirExcel = async (f: File) => {
    try { setModelo(await abrirModelo(f)) } catch (e) { aviso(e instanceof Error ? e.message : String(e)) }
  }

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
  const contas = useMemo(() => [...new Set([...CONTAS[c.empresa], ...anteriores.filter((a) => a.empresa === c.empresa).map((a) => a.conta)])], [anteriores, c.empresa])

  return (
    <>
      <Cabecalho migalhas={[{ rotulo: 'Conciliação bancária' }, { rotulo: nova ? 'Nova' : `${MESES[c.mes - 1]} ${c.ano}` }]} sobre="Financeiro"
        titulo={`${MESES[c.mes - 1]} ${c.ano} · ${c.conta}`}
        acoes={<>
          <Botao variante="fantasma" icone={<ArrowLeft size={15} />} onClick={() => { if (!alterado || confirm('Sair sem guardar as alterações?')) onSair() }}>Voltar</Botao>
          {!nova && <Botao variante="perigo" icone={<Trash2 size={15} />} onClick={apagar}>Apagar</Botao>}
          {sheetsDisponivel && <Botao icone={<FileSpreadsheet size={15} />} disabled={!c.movimentos.length || !idGoogle} onClick={abrirGoogle}>Preencher no Google Sheets</Botao>}
          <Botao variante={sheetsDisponivel ? 'fantasma' : 'secundario'} icone={<Download size={15} />} disabled={!c.movimentos.length} onClick={() => inputExcel.current?.click()}>{sheetsDisponivel ? 'Ficheiro Excel' : 'Preencher o meu Excel'}</Botao>
          <input ref={inputExcel} type="file" hidden accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void abrirExcel(f); e.target.value = '' }} />
          <Botao variante="primario" icone={<Save size={15} />} disabled={!alterado} onClick={guardar}>Guardar</Botao>
        </>} />

      <Cartao className="p-5 mb-5">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <Campo rotulo="Empresa">
            <Seletor valor={NOME_EMPRESA_TOC[c.empresa]} opcoes={Object.values(NOME_EMPRESA_TOC)}
              onChange={(v) => {
                const empresa = (Object.entries(NOME_EMPRESA_TOC).find(([, n]) => n === v)?.[0] ?? 'PP') as EmpresaTOC
                mudar((x) => ({ ...x, empresa, conta: CONTAS[empresa].includes(x.conta) ? x.conta : CONTAS[empresa][0] })); setDocs(null)
              }} />
          </Campo>
          <Campo rotulo="Conta">
            <Seletor valor={c.conta} opcoes={contas} onChange={(v) => mudar((x) => ({ ...x, conta: v }))} />
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

      {livro && <PreencherGoogle livro={livro} c={c} onFechar={() => setLivro(null)} log={log}
        onTrocar={async (id) => { await guardarFicheiroDaEmpresa(c.empresa, id); setIdGoogle(id); try { setLivro(await abrirLivroGoogle(id)) } catch (e) { aviso(e instanceof Error ? e.message : String(e)) } }} />}
      {modelo && <PreencherExcel modelo={modelo} c={c} onFechar={() => setModelo(null)} log={log} />}
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

/** Escolher a folha do Excel da utilizadora onde vai a conciliação (a do mês, ou uma nova copiada da última da conta). */
function PreencherExcel({ modelo, c, onFechar, log }: { modelo: Modelo; c: Conciliacao; onFechar: () => void; log: (a: string, d: string) => void }) {
  const sugestao = useMemo(() => folhaPara(modelo, c), [modelo, c])
  const NOVA = '__nova__'
  const [folha, setFolha] = useState(sugestao.existente?.nome ?? NOVA)
  const [base, setBase] = useState(sugestao.base?.nome ?? modelo.folhas[0]?.nome ?? '')
  const [nome, setNome] = useState(sugestao.novoNome)
  const repetido = folha === NOVA && modelo.folhas.some((f) => f.nome === nome)
  const fazer = () => {
    try {
      const alvo = folha === NOVA ? { copiarDe: modelo.folhas.find((f) => f.nome === base)!, nome: nome.trim() } : modelo.folhas.find((f) => f.nome === folha)!
      const usada = preencher(modelo, c, alvo)
      descarregarModelo(modelo)
      log('Conciliação passada para o Excel', `${modelo.nomeFicheiro} · folha ${usada}`)
      aviso(`Folha «${usada}» preenchida. O Excel foi descarregado.`)
      onFechar()
    } catch (e) { aviso(`Não foi possível preencher: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo="Preencher o meu Excel" sub={modelo.nomeFicheiro}
      rodape={<>
        <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" icone={<Download size={15} />} disabled={(folha === NOVA && (!nome.trim() || repetido))} onClick={fazer}>Preencher e descarregar</Botao>
      </>}>
      <div className="space-y-4">
        <Campo rotulo="Folha" ajuda={sugestao.existente ? 'É a folha deste mês e desta conta: os movimentos que lá estão são substituídos.' : 'Ainda não há folha deste mês para esta conta: é criada uma nova, igual à última.'}>
          <select value={folha} onChange={(e) => setFolha(e.target.value)} className="w-full h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px]">
            <option value={NOVA}>Criar folha nova…</option>
            {modelo.folhas.map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
          </select>
        </Campo>
        {folha === NOVA && <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome da folha nova" ajuda={repetido ? 'Já existe uma folha com este nome.' : undefined}><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo rotulo="Copiar formatação de">
            <select value={base} onChange={(e) => setBase(e.target.value)} className="w-full h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px]">
              {modelo.folhas.map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
            </select>
          </Campo>
        </div>}
        <p className="text-[13px] text-suave">Só a folha escolhida é alterada: as outras folhas, o logótipo e a formatação ficam como estão. O nº da fatura vai entre parênteses na descrição e o saldo fica com as fórmulas. Guarde o ficheiro descarregado no lugar do antigo.</p>
      </div>
    </Modal>
  )
}

/** Preencher a folha do mês na folha de cálculo Google da empresa (no Drive). */
function PreencherGoogle({ livro, c, onFechar, onTrocar, log }: { livro: LivroGoogle; c: Conciliacao; onFechar: () => void; onTrocar: (id: string) => void; log: (a: string, d: string) => void }) {
  const sugestao = useMemo(() => sugestaoFolha(livro, c), [livro, c])
  const NOVA = '__nova__'
  const [folha, setFolha] = useState(sugestao.existente?.nome ?? NOVA)
  const [base, setBase] = useState(sugestao.base?.nome ?? livro.folhas[0]?.nome ?? '')
  const [nome, setNome] = useState(sugestao.novoNome)
  const [link, setLink] = useState('')
  const [aFazer, setAFazer] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)
  useEffect(() => { setFolha(sugestao.existente?.nome ?? NOVA); setBase(sugestao.base?.nome ?? livro.folhas[0]?.nome ?? ''); setNome(sugestao.novoNome); setFeito(null) }, [sugestao, livro])
  const repetido = folha === NOVA && livro.folhas.some((f) => f.nome === nome.trim())
  const fazer = async () => {
    setAFazer(true)
    try {
      const url = await preencherGoogle(livro, c, folha === NOVA ? { copiarDe: base, nome: nome.trim() } : { folha })
      const usada = folha === NOVA ? nome.trim() : folha
      log('Conciliação passada para o Google Sheets', `${livro.titulo} · folha ${usada}`)
      setFeito(url)
    } catch (e) { aviso(`Não foi possível preencher: ${e instanceof Error ? e.message : String(e)}`) } finally { setAFazer(false) }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo="Preencher no Google Sheets" sub={livro.titulo}
      rodape={feito ? <>
        <Botao variante="fantasma" onClick={onFechar}>Fechar</Botao>
        <a href={feito} target="_blank" rel="noreferrer"><Botao variante="primario" icone={<ExternalLink size={15} />}>Abrir a folha</Botao></a>
      </> : <>
        <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" icone={<FileSpreadsheet size={15} />} disabled={aFazer || (folha === NOVA && (!nome.trim() || repetido))} onClick={fazer}>{aFazer ? 'A preencher…' : 'Preencher'}</Botao>
      </>}>
      {feito ? <p className="text-[14px]">Feito: a folha «{folha === NOVA ? nome : folha}» de {livro.titulo} está preenchida. O Google guarda o histórico de versões (Ficheiro → Histórico de versões), se precisar de voltar atrás.</p> : (
        <div className="space-y-4">
          <Campo rotulo="Folha" ajuda={sugestao.existente ? 'É a folha deste mês e desta conta: os movimentos que lá estão são substituídos.' : 'Ainda não há folha deste mês para esta conta: é criada uma nova, duplicando a última da mesma conta (com a mesma formatação).'}>
            <select value={folha} onChange={(e) => setFolha(e.target.value)} className="w-full h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px]">
              <option value={NOVA}>Criar folha nova…</option>
              {livro.folhas.map((f) => <option key={f.sheetId} value={f.nome}>{f.nome}</option>)}
            </select>
          </Campo>
          {folha === NOVA && <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Nome da folha nova" ajuda={repetido ? 'Já existe uma folha com este nome.' : undefined}><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
            <Campo rotulo="Duplicar a folha">
              <select value={base} onChange={(e) => setBase(e.target.value)} className="w-full h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px]">
                {livro.folhas.map((f) => <option key={f.sheetId} value={f.nome}>{f.nome}</option>)}
              </select>
            </Campo>
          </div>}
          <details className="text-[13px] text-suave">
            <summary className="cursor-pointer">Usar outra folha de cálculo (ex.: a de 2027)</summary>
            <div className="flex gap-2 mt-2">
              <Entrada value={link} onChange={(e) => setLink(e.target.value)} placeholder="Cole o link da folha do Google Sheets" />
              <Botao disabled={!idDoLink(link)} onClick={() => onTrocar(idDoLink(link)!)}>Usar</Botao>
            </div>
          </details>
        </div>
      )}
    </Modal>
  )
}
