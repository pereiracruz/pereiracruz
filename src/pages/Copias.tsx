import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CalendarClock, CircleCheck, Download, Eraser, RotateCcw, Upload } from 'lucide-react'
import { IDS_EXEMPLO, dadosExemplo, type GrupoExemplo } from '../lib/exemplo'
import { COLECOES, useDb, type Colecao } from '../store/db'
import { Botao, Cabecalho, Cartao, Entrada, Modal, aviso } from '../components/ui'
import { ACAO_DESCARREGADA, compararCopia, criarCopia, descarregarCopia, lerCopia, listarAutomaticas, obterAutomatica, type Copia, type CopiaAutomatica, type Diferenca } from '../lib/copias'
import { dataHora } from '../lib/format'
import { modoServidor } from '../lib/supabase'

const NOMES: Record<Colecao, string> = {
  encomendas: 'Encomendas (com as fichas)', pedidos: 'Pedidos de orçamento', historico: 'Histórico de preços',
  fornecedores: 'Fornecedores', tecidos: 'Tecidos', equivalencias: 'Equivalências de tecido', lavagens: 'Lavagens e tingimentos',
  acessorios: 'Acessórios por cliente', escalas: 'Tamanhos', destinatarios: 'Destinatários', precosRef: 'Tabela de preços', precosTingimento: 'Clothius · tingimento', precosLavagem: 'Clothius · lavandaria', clientes: 'Clientes',
}
const DIAS_AVISO = 7
const tamanhoLegivel = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const ha = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
  return d === 0 ? 'menos de um dia' : d === 1 ? '1 dia' : `${d} dias`
}

export default function Copias() {
  const estado = useDb()
  const { atividade, log, aGuardar } = estado
  const input = useRef<HTMLInputElement>(null)
  const [copia, setCopia] = useState<Copia | null>(null)
  const [difs, setDifs] = useState<Diferenca[]>([])
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')

  const [automaticas, setAutomaticas] = useState<CopiaAutomatica[] | null | undefined>(undefined) // null = falta o script
  const [erroAuto, setErroAuto] = useState('')
  const [aAbrir, setAAbrir] = useState<number | null>(null)
  useEffect(() => {
    if (!modoServidor) return
    listarAutomaticas().then(setAutomaticas).catch((e) => setErroAuto(e instanceof Error ? e.message : String(e)))
  }, [])

  const ultima = atividade.find((a) => a.acao === ACAO_DESCARREGADA)
  const dias = ultima ? Math.floor((Date.now() - new Date(ultima.data).getTime()) / 864e5) : null
  const ultimaAuto = automaticas?.[0]
  const autoEmDia = !!ultimaAuto && Date.now() - new Date(ultimaAuto.criadaEm).getTime() <= 8 * 864e5
  const emFalta = !autoEmDia && (dias == null || dias >= DIAS_AVISO)
  const contagem = (c: Colecao) => (estado[c] as unknown[]).length

  const descarregar = () => {
    const c = criarCopia(estado as unknown as Parameters<typeof criarCopia>[0])
    const nome = descarregarCopia(c)
    const total = COLECOES.reduce((n, col) => n + (c.colecoes[col]?.length ?? 0), 0)
    log(ACAO_DESCARREGADA, `${nome} · ${total} registos`)
    aviso('Cópia de segurança descarregada.')
  }

  // ---- dados de exemplo (encomendas, pedido e histórico carregados no primeiro arranque)
  const exemplo = dadosExemplo(estado)
  const temExemplo = exemplo.encomendas.length + exemplo.pedidos.length + exemplo.historico.length > 0
  const [limpar, setLimpar] = useState(false)
  const [grupos, setGrupos] = useState<Record<GrupoExemplo, boolean>>({ encomendas: true, pedidos: true, historico: false })
  const [textoLimpar, setTextoLimpar] = useState('')
  const aApagar = (g: GrupoExemplo) => (grupos[g] ? exemplo[g].length : 0)
  const limparExemplo = () => {
    descarregar() // cópia antes de apagar
    const fora = <T extends { id: string }>(g: GrupoExemplo, lista: T[]) => (grupos[g] ? lista.filter((x) => !IDS_EXEMPLO[g].has(x.id)) : lista)
    const s = useDb.getState()
    const detalhe = [
      aApagar('encomendas') ? `encomendas: ${exemplo.encomendas.map((e) => `${e.cliente} ${e.colecao}`).join(', ')}` : '',
      aApagar('pedidos') ? `pedidos: ${exemplo.pedidos.map((p) => `${p.peca} ${p.variante}`.trim()).join(', ')}` : '',
      aApagar('historico') ? `histórico: ${exemplo.historico.length} preços` : '',
    ].filter(Boolean).join(' · ')
    useDb.setState({ encomendas: fora('encomendas', s.encomendas), pedidos: fora('pedidos', s.pedidos), historico: fora('historico', s.historico) })
    log('Dados de exemplo apagados', detalhe)
    setLimpar(false); setTextoLimpar('')
    aviso(modoServidor ? 'Dados de exemplo apagados. A gravar no servidor…' : 'Dados de exemplo apagados.')
  }

  const abrirAutomatica = async (id: number, acao: 'descarregar' | 'repor') => {
    setErro(''); setConfirmacao(''); setAAbrir(id)
    try {
      const c = await obterAutomatica(id)
      if (acao === 'descarregar') {
        const nome = descarregarCopia(c)
        log(ACAO_DESCARREGADA, `${nome} · cópia automática de ${dataHora(c.criadaEm)}`)
        aviso('Cópia descarregada. Guarde-a no Google Drive.')
      } else {
        setCopia(c)
        setDifs(compararCopia(estado as unknown as Record<Colecao, { id: string }[]>, c))
      }
    } catch (e) { setErroAuto(e instanceof Error ? e.message : String(e)) }
    finally { setAAbrir(null) }
  }

  const escolher = async (f: File) => {
    setErro(''); setConfirmacao('')
    try {
      const c = await lerCopia(f)
      setCopia(c)
      setDifs(compararCopia(estado as unknown as Record<Colecao, { id: string }[]>, c))
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }

  const repor = () => {
    if (!copia) return
    useDb.setState(Object.fromEntries(COLECOES.map((c) => [c, copia.colecoes[c] ?? useDb.getState()[c]])) as Partial<ReturnType<typeof useDb.getState>>)
    log('Cópia de segurança reposta', `Cópia de ${dataHora(copia.criadaEm)} · ${difs.reduce((n, d) => n + d.novos + d.alterados + d.removidos, 0)} alterações`)
    setCopia(null)
    aviso(modoServidor ? 'Cópia reposta. A gravar no servidor…' : 'Cópia reposta.')
  }

  const mudancas = difs.reduce((n, d) => n + d.novos + d.alterados + d.removidos, 0)

  return (
    <>
      <Cabecalho sobre="Administração" titulo="Cópias de segurança"
        sub="Um ficheiro com todos os dados: encomendas e fichas, dados mestre, orçamentos, histórico e registo de atividade. Guarde-o fora deste computador (por exemplo, no Google Drive)." />

      <div className={clsx('rounded-cartao border px-5 py-4 mb-5 flex gap-3', emFalta ? 'bg-ambar-fraco border-ambar-borda' : 'bg-verde-fraco/60 border-verde-borda')}>
        {emFalta ? <AlertTriangle size={18} className="text-ambar mt-0.5" /> : <CircleCheck size={18} className="text-verde mt-0.5" />}
        <div className="text-[14px]">
          <p className="font-semibold">{ultimaAuto
            ? `Última cópia automática: ${dataHora(ultimaAuto.criadaEm)} (há ${ha(ultimaAuto.criadaEm)})`
            : ultima ? `Última cópia: ${dataHora(ultima.data)} (há ${ha(ultima.data)})` : 'Ainda não foi feita nenhuma cópia de segurança.'}</p>
          <p className="text-[13px] text-tinta-2">{autoEmDia
            ? `Em dia. O servidor faz uma cópia todos os domingos de madrugada.${ultima ? ` Última guardada no Drive: ${dataHora(ultima.data)}.` : ''}`
            : automaticas === null ? 'As cópias automáticas ainda não estão ligadas: falta correr no Supabase o script 20261128000000_copias_automaticas.sql.'
            : ultimaAuto ? 'A cópia automática desta semana não foi feita. Descarregue uma cópia e avise quem gere o servidor.'
            : emFalta ? 'Recomenda-se uma cópia por semana.' : 'Em dia. Próxima cópia recomendada daqui a uma semana.'}</p>
        </div>
      </div>

      {modoServidor && automaticas !== null && (
        <Cartao className="p-5 mb-5">
          <div className="flex items-center gap-2 mb-1"><CalendarClock size={16} className="text-suave" /><h3 className="font-semibold">Cópias automáticas no servidor</h3></div>
          <p className="text-[13px] text-suave mb-4">Uma por semana, ao domingo de madrugada, sem custos. Ficam as últimas 8 (cerca de 2 meses).
            Estão no mesmo servidor que os dados: protegem contra enganos, mas para ter uma cópia fora descarregue uma de vez em quando e guarde-a no Google Drive.</p>
          {erroAuto && <p className="mb-3 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erroAuto}</p>}
          {automaticas === undefined ? <p className="text-[13px] text-suave">A carregar…</p>
            : automaticas.length === 0 ? <p className="text-[13px] text-suave">Ainda não há cópias automáticas. A primeira é feita no próximo domingo.</p>
            : (
              <div className="divide-y divide-linha border border-linha rounded-controlo">
                {automaticas.map((a, i) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-[13px]">
                    <span className="flex-1 min-w-[10rem]"><b className="font-semibold">{dataHora(a.criadaEm)}</b>{i === 0 && <span className="ml-2 text-[11px] text-verde">mais recente</span>}</span>
                    <span className="num text-suave">{a.registos} registos · {tamanhoLegivel(a.tamanho)}</span>
                    <span className="flex gap-2">
                      <Botao pequeno icone={<Download size={14} />} disabled={aAbrir != null} onClick={() => void abrirAutomatica(a.id, 'descarregar')}>Descarregar</Botao>
                      <Botao pequeno icone={<RotateCcw size={14} />} disabled={aAbrir != null || aGuardar > 0} onClick={() => void abrirAutomatica(a.id, 'repor')}>Repor…</Botao>
                    </span>
                  </div>
                ))}
              </div>
            )}
        </Cartao>
      )}

      {temExemplo && (
        <Cartao className="p-5 mb-5">
          <div className="flex items-center gap-2 mb-1"><Eraser size={16} className="text-suave" /><h3 className="font-semibold">Dados de exemplo</h3></div>
          <p className="text-[13px] text-suave mb-3">Encomendas, pedidos e preços carregados no primeiro arranque, a partir dos documentos de exemplo.
            Contam nas compras, nos prazos, no sino e nas margens. Os dados mestre (clientes, tecidos, tabelas da Clothius…) não são apagados.</p>
          <ul className="text-[13px] space-y-0.5 mb-4">
            {exemplo.encomendas.length > 0 && <li>Encomendas: {exemplo.encomendas.map((e) => `${e.cliente} · ${e.colecao}`).join(', ')}</li>}
            {exemplo.pedidos.length > 0 && <li>Pedidos de orçamento: {exemplo.pedidos.map((p) => `${p.peca} ${p.variante}`.trim()).join(', ')}</li>}
            {exemplo.historico.length > 0 && <li>Histórico de preços: {exemplo.historico.length} preços</li>}
          </ul>
          <Botao icone={<Eraser size={15} />} disabled={aGuardar > 0} onClick={() => { setLimpar(true); setTextoLimpar('') }}>Limpar dados de exemplo…</Botao>
        </Cartao>
      )}

      <Modal aberto={limpar} onFechar={() => setLimpar(false)} titulo="Limpar dados de exemplo" sub="Antes de apagar é descarregada uma cópia de segurança."
        rodape={<>
          <Botao variante="fantasma" onClick={() => setLimpar(false)}>Cancelar</Botao>
          <Botao variante="perigo" icone={<Eraser size={15} />} disabled={textoLimpar.trim().toUpperCase() !== 'LIMPAR' || !(aApagar('encomendas') + aApagar('pedidos') + aApagar('historico'))} onClick={limparExemplo}>Apagar os escolhidos</Botao>
        </>}>
        <div className="space-y-3 text-[14px]">
          {([['encomendas', 'Encomendas de exemplo', exemplo.encomendas.map((e) => `${e.cliente} · ${e.colecao}`).join(', ')],
            ['pedidos', 'Pedidos de orçamento de exemplo', exemplo.pedidos.map((p) => `${p.peca} ${p.variante}`.trim()).join(', ')],
            ['historico', 'Histórico de preços de exemplo', `${exemplo.historico.length} preços das encomendas de exemplo da Imprevu. Podem servir de referência nos orçamentos: só apague se não quiser usá-los.`]] as const)
            .filter(([g]) => exemplo[g].length > 0).map(([g, rotulo, det]) => (
              <label key={g} className="flex gap-3 items-start">
                <input type="checkbox" className="mt-1" checked={grupos[g]} onChange={(e) => setGrupos({ ...grupos, [g]: e.target.checked })} />
                <span><span className="font-medium">{rotulo}</span> <span className="text-suave">({exemplo[g].length})</span><span className="block text-[13px] text-suave">{det}</span></span>
              </label>
            ))}
          <p className="text-[13px]">Escreva <b>LIMPAR</b> para confirmar.</p>
          <Entrada value={textoLimpar} onChange={(e) => setTextoLimpar(e.target.value)} placeholder="LIMPAR" />
        </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Cartao className="p-5">
          <h3 className="font-semibold mb-1">Descarregar cópia agora (para o Drive)</h3>
          <p className="text-[13px] text-suave mb-4">Ficheiro JSON com o estado atual. Os PDFs e Excel originais guardados no servidor não entram na cópia.</p>
          <div className="divide-y divide-linha border border-linha rounded-controlo mb-4">
            {COLECOES.map((c) => (
              <div key={c} className="flex justify-between px-3 py-1.5 text-[13px]"><span>{NOMES[c]}</span><span className="num text-suave">{contagem(c)}</span></div>
            ))}
            <div className="flex justify-between px-3 py-1.5 text-[13px]"><span>Registo de atividade</span><span className="num text-suave">{atividade.length}</span></div>
          </div>
          <Botao variante="primario" icone={<Download size={15} />} disabled={aGuardar > 0} onClick={descarregar} title={aGuardar ? 'A gravar alterações no servidor…' : ''}>Descarregar cópia de segurança</Botao>
        </Cartao>

        <Cartao className="p-5">
          <h3 className="font-semibold mb-1">Repor a partir de uma cópia</h3>
          <p className="text-[13px] text-suave mb-4">Substitui os dados atuais pelos da cópia. Antes de repor, é mostrado o que muda. O registo de atividade não é apagado.</p>
          <Botao icone={<Upload size={15} />} onClick={() => input.current?.click()}>Escolher ficheiro de cópia…</Botao>
          <input ref={input} type="file" hidden accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolher(f); e.target.value = '' }} />
          {erro && <p className="mt-3 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}
        </Cartao>
      </div>

      <Modal aberto={!!copia} onFechar={() => setCopia(null)} titulo="Repor cópia de segurança" largura="max-w-2xl"
        sub={copia ? `Cópia de ${dataHora(copia.criadaEm)}${copia.origem ? ` · ${copia.origem.replace(/^https?:\/\//, '')}` : ''}` : ''}
        rodape={<>
          <Botao variante="fantasma" onClick={() => setCopia(null)}>Cancelar</Botao>
          <Botao variante="perigo" disabled={confirmacao.trim().toUpperCase() !== 'REPOR' || mudancas === 0} onClick={repor}>Repor os dados</Botao>
        </>}>
        {copia && (
          <>
            <table className="w-full text-[13px] mb-4">
              <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-b border-linha">
                <th className="text-left py-1.5">Dados</th><th className="text-right">Agora</th><th className="text-right">Na cópia</th><th className="text-right">Novos</th><th className="text-right">Alterados</th><th className="text-right">Retirados</th></tr></thead>
              <tbody>
                {difs.map((d) => (
                  <tr key={d.colecao} className={clsx('border-b border-linha num', d.novos + d.alterados + d.removidos === 0 && 'text-tenue')}>
                    <td className="py-1.5">{NOMES[d.colecao]}</td><td className="text-right">{d.atual}</td><td className="text-right">{d.copia}</td>
                    <td className="text-right">{d.novos || ''}</td><td className="text-right">{d.alterados || ''}</td><td className={clsx('text-right', d.removidos && 'text-vermelho font-semibold')}>{d.removidos || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mudancas === 0
              ? <p className="text-[14px] text-verde">Os dados atuais são iguais aos da cópia. Não há nada a repor.</p>
              : <>
                <p className="text-[13px] text-ambar bg-ambar-fraco border border-ambar-borda rounded-controlo px-3 py-2 mb-3">
                  O que foi criado ou alterado depois desta cópia perde-se. Se tiver dúvidas, descarregue primeiro uma cópia do estado atual.
                </p>
                <label className="block text-[13px] mb-1.5">Para confirmar, escreva <b>REPOR</b>:</label>
                <Entrada value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder="REPOR" />
              </>}
          </>
        )}
      </Modal>
    </>
  )
}
