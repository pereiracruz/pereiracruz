import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, Check, CheckCheck, ChevronDown, CircleCheck, Copy, CopyPlus, FilePlus2, FileText, Plus, Send, Trash2 } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Campo, Cartao, Confianca, Entrada, Etiqueta, EtiquetaIA, Passos, Pilulas, Seletor, aviso, type Tom } from '../../components/ui'
import { TechPack } from '../../components/TechPack'
import { linhasModeloPC, linhasShirtMao } from '../../data/seed'
import { MIN_CASOS_INTERVALO, avaliarExpr, calcularCusto, pecasParecidas, propostaIntervalo, totalLinha } from '../../lib/calc'
import { dataCurta, eur, hojeISO, num, uid } from '../../lib/format'
import type { LinhaCusto, OrigemCusto, Pedido } from '../../types'
import { TOM_PEDIDO } from './Pedidos'

const PASSOS = ['Carregar', 'A IA lê', 'Ficha de custo', 'Validação', 'Email']
const TOM_ORIGEM: Record<OrigemCusto, Tom> = { Segura: 'verde', Estimada: 'ambar', Confirmar: 'ambar' }

export default function NovoPedido() {
  const { pedId } = useParams()
  const nav = useNavigate()
  const { pedidos, clientes, historico, guardarPedido, adicionarHistorico, log } = useDb()
  const existente = pedidos.find((p) => p.id === pedId)
  const [pdfUrl, setPdfUrl] = useState<string>()
  const [nomePdf, setNomePdf] = useState('SHIRT MAO.pdf')
  const [carregado, setCarregado] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [pagina, setPagina] = useState(2)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mCliente, setMCliente] = useState('')
  const [mPeca, setMPeca] = useState('')
  const [mVariante, setMVariante] = useState('')
  const [mTipo, setMTipo] = useState('Calças')
  const [mEntrega, setMEntrega] = useState('')
  const criarDoModelo = () => {
    const p: Pedido = {
      id: uid('ped'), cliente: mCliente, peca: mPeca.trim(), variante: mVariante.trim(), tipoPeca: mTipo, tecido: '—', tratamento: '—',
      entrega: mEntrega, linhas: linhasModeloPC(mTipo), estado: 'Rascunho', criadoEm: hojeISO(), origem: 'modelo',
    }
    guardarPedido(p); log('Pedido de orçamento criado', `${p.cliente} · ${p.peca} (ficha-modelo)`)
    nav(`/orcamentos/${p.id}`, { replace: true })
  }

  const passo = !existente ? (lendo ? 1 : 0)
    : existente.estado === 'Rascunho' ? 2 : existente.estado === 'Por validar' ? 3 : 4

  // leitura simulada → cria o pedido em rascunho
  useEffect(() => {
    if (!lendo) return
    const t = setTimeout(() => {
      const p: Pedido = {
        id: uid('ped'), cliente: 'Imprevu', peca: 'Shirt Mao', variante: 'Acid wash', tipoPeca: 'Camisa', tecido: 'Adotrec', tratamento: 'Acid wash',
        entrega: '2026-11-30', linhas: linhasShirtMao(), estado: 'Rascunho', criadoEm: hojeISO(),
      }
      guardarPedido(p); log('Pedido de orçamento criado', `${p.cliente} · ${p.peca} · ${p.variante}`)
      setLendo(false); nav(`/orcamentos/${p.id}`, { replace: true })
    }, 2600)
    return () => clearTimeout(t)
  }, [lendo, guardarPedido, log, nav])

  const cfg = clientes.find((c) => c.nome === existente?.cliente)
  const custo = existente ? calcularCusto(existente.linhas, cfg, existente.precoFinal, existente) : null
  const parecidas = useMemo(() => (existente ? pecasParecidas(existente, historico.filter((h) => !h.id.startsWith(existente.id))) : []), [existente, historico])
  const intervalo = custo ? propostaIntervalo(custo.final, parecidas) : null
  const porConfirmar = existente?.linhas.filter((l) => l.origem !== 'Segura' && !l.confirmado) ?? []

  const atualizar = (p: Partial<Pedido>) => existente && guardarPedido({ ...existente, ...p })
  const linha = (id: string, p: Partial<LinhaCusto>) => existente && atualizar({ linhas: existente.linhas.map((l) => (l.id === id ? { ...l, ...p } : l)) })

  return (
    <>
      <Cabecalho migalhas={[{ rotulo: 'Pedidos', para: '/orcamentos' }, { rotulo: existente ? `${existente.peca} · ${existente.variante}` : 'Novo pedido' }]}
        sobre="Pré-orçamentação" titulo={existente ? `${existente.peca} · ${existente.variante}` : 'Novo pedido'}
        extra={existente && <Etiqueta tom={TOM_PEDIDO[existente.estado]}>{existente.estado}</Etiqueta>}
        sub={existente ? `${existente.cliente} · ${existente.tipoPeca} · ${existente.tecido} · entrega ${dataCurta(existente.entrega)}` : 'Só é preciso o tech pack do cliente.'}
        acoes={existente && <>
          <Botao variante="fantasma" icone={<CopyPlus size={15} />} title="Criar uma ficha nova a partir desta" onClick={() => {
            const copia: Pedido = { ...existente, id: uid('ped'), peca: `${existente.peca} (cópia)`, estado: 'Rascunho', validadoPor: undefined, precoMin: undefined, precoMax: undefined,
              criadoEm: hojeISO(), origem: 'modelo', origemFicheiro: undefined, linhas: existente.linhas.map((l) => ({ ...l, id: uid('c'), confirmado: false })) }
            guardarPedido(copia); log('Pedido de orçamento duplicado', `${existente.peca} → ${copia.peca}`)
            nav(`/orcamentos/${copia.id}`); aviso('Ficha duplicada. Altere o nome e os valores.')
          }}>Duplicar</Botao>
          {passo === 2 && <Botao variante="primario" icone={<Send size={15} />} onClick={() => {
            atualizar({ estado: 'Por validar', precoMin: intervalo?.min ?? custo!.final, precoMax: intervalo?.max ?? custo!.final, prazo: dataCurta(existente.entrega) })
            log('Orçamento enviado para validação', `${existente.peca} · ${existente.variante}`)
          }}>Enviar para validação</Botao>}
          {existente.estado === 'Validado' && <Botao variante="primario" icone={<Send size={15} />} onClick={() => { atualizar({ estado: 'Enviado' }); log('Orçamento marcado como enviado', existente.peca); aviso('Marcado como enviado.') }}>Marcar como enviado</Botao>}
          {existente.estado === 'Enviado' && <Botao variante="primario" icone={<CheckCheck size={15} />} onClick={() => { atualizar({ estado: 'Fechado' }); log('Orçamento fechado', existente.peca); aviso('Orçamento fechado.') }}>Cliente aceitou · fechar</Botao>}
        </>} />
      <Passos passos={PASSOS} atual={passo} />

      {passo === 0 && (
        <div className="grid grid-cols-[1fr_440px] gap-5 items-start">
          <div>
            <button onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setNomePdf(f.name); setPdfUrl(URL.createObjectURL(f)); setCarregado(true) } }}
              className="w-full flex items-center gap-4 p-5 rounded-cartao border border-dashed border-linha-forte bg-papel/60 hover:bg-papel text-left">
              <span className="size-10 rounded-lg bg-fundo-2 grid place-items-center text-suave"><FilePlus2 size={18} /></span>
              <span><span className="block text-[15px] font-medium">Largue aqui o tech pack do cliente</span><span className="block text-[13px] text-suave">PDF, PowerPoint ou imagens · até 25 MB</span></span>
            </button>
            <input ref={inputRef} type="file" hidden accept=".pdf,.ppt,.pptx,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setNomePdf(f.name); setPdfUrl(f.type === 'application/pdf' ? URL.createObjectURL(f) : undefined); setCarregado(true) } }} />
            {carregado && <div className="mt-4 inline-flex items-center gap-3 bg-papel border border-linha rounded-cartao p-3 pr-5"><span className="size-10 rounded-lg bg-vermelho-fraco text-vermelho grid place-items-center"><FileText size={18} /></span><span><span className="block text-[13px] font-medium">{nomePdf}</span><span className="text-[12px] text-verde">carregado</span></span></div>}
            <div className="flex items-center justify-between mt-5">
              <button onClick={() => { setNomePdf('SHIRT MAO.pdf'); setPdfUrl(undefined); setCarregado(true) }} className="flex items-center gap-2 text-[14px] text-suave hover:text-tinta"><FileText size={15} />Usar o tech pack da Imprevu</button>
              <Botao variante="primario" disabled={!carregado} icone={<EtiquetaIA />} onClick={() => setLendo(true)}>Calcular o preço</Botao>
            </div>
            {carregado && pdfUrl && <p className="mt-4 text-[13px] text-ambar bg-ambar-fraco border border-ambar-borda rounded-controlo px-3 py-2">A leitura de tech packs com IA ainda não está ativa (falta a quota da Google). Até lá, o cálculo usa o exemplo da Shirt Mao; use a ficha-modelo abaixo.</p>}

            <Cartao className="p-5 mt-6">
              <h3 className="font-semibold">Ou começar com a ficha-modelo da Pereira & Cruz</h3>
              <p className="text-[13px] text-suave mb-4">Sem tech pack nem IA: as 15 linhas das vossas fichas de custo (corte, plano de corte, confeção, forro, tecido, lavandaria…) com os valores de referência, para ajustar.</p>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Cliente"><Seletor valor={mCliente} onChange={setMCliente} vazio="Escolher…" opcoes={clientes.map((c) => c.nome)} /></Campo>
                <Campo rotulo="Tipo de peça"><Seletor valor={mTipo} onChange={setMTipo} opcoes={['Calças', 'Calções', 'Camisa', 'Casaco', 'Outra']} /></Campo>
                <Campo rotulo="Peça / modelo"><Entrada value={mPeca} onChange={(e) => setMPeca(e.target.value)} placeholder="ex.: Mini Boy City" /></Campo>
                <Campo rotulo="Variante (opcional)"><Entrada value={mVariante} onChange={(e) => setMVariante(e.target.value)} placeholder="ex.: Vaqueiro" /></Campo>
                <Campo rotulo="Data de entrega (opcional)"><Entrada type="date" value={mEntrega} onChange={(e) => setMEntrega(e.target.value)} /></Campo>
              </div>
              <div className="flex justify-end mt-4"><Botao variante="primario" disabled={!mCliente || !mPeca.trim()} onClick={criarDoModelo}>Criar ficha de custo</Botao></div>
            </Cartao>
          </div>
          <Cartao className="p-5">
            <h3 className="text-[16px] font-semibold mb-3">Fica pronto</h3>
            <ul className="space-y-2 text-[14px] text-tinta-2">
              {['Ficha de custo com materiais, mão de obra e serviços', 'Margem e comissão do agente do cliente', 'Peças parecidas do histórico', 'Intervalo de preço e prazo, com a justificação', 'Rascunho do email ao cliente'].map((t) => (
                <li key={t} className="flex gap-2.5"><span className="mt-2 size-1.5 rounded-full bg-ouro shrink-0" />{t}</li>
              ))}
            </ul>
          </Cartao>
        </div>
      )}

      {passo === 1 && (
        <div className="grid grid-cols-[1fr_1.15fr] gap-5 items-start">
          <TechPack nome={nomePdf} url={pdfUrl} pagina={pagina} setPagina={setPagina} />
          <Cartao className="p-6"><div className="flex items-center gap-3"><EtiquetaIA /><div><p className="font-semibold">A ler o tech pack e a preparar a ficha de custo…</p><p className="text-[13px] text-suave">Materiais da ficha de produção + tabela de preços</p></div></div>
            <div className="h-1 rounded-full bg-fundo-2 mt-5 overflow-hidden"><div className="h-full bg-ouro animate-[crescer_2.6s_ease-out_forwards]" style={{ width: '100%' }} /></div></Cartao>
        </div>
      )}

      {existente && custo && (
        <div className={clsx('grid gap-5 items-start', existente.origem ? 'grid-cols-1 max-w-4xl' : 'grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]')}>
          {!existente.origem && <TechPack nome="SHIRT MAO.pdf" pagina={pagina} setPagina={setPagina} />}

          <div className="space-y-4 min-w-0">
            {/* ---------- Ficha de custo ---------- */}
            {passo === 2 && <>
              {porConfirmar.length > 0 && (
                <div className="rounded-cartao border border-ambar-borda bg-ambar-fraco px-5 py-4 flex gap-3"><AlertTriangle size={17} className="text-ambar mt-0.5" />
                  <div><p className="font-semibold text-[14px]">{porConfirmar.length} valores precisam de confirmação.</p><p className="text-[13px] text-tinta-2">Ficam assinalados na validação, antes de o preço ser dado como válido.</p></div></div>
              )}
              <FichaCusto p={existente} atualizar={atualizar} editavel />
            </>}
            {passo >= 3 && <FichaCusto p={existente} atualizar={atualizar} editavel={false} compacta={existente.origem !== 'importado'} />}
            {existente.origem === 'importado' && <p className="text-[12px] text-tenue">Importada de {existente.origemFicheiro}. Para orçamentar uma peça nova a partir desta, use «Duplicar».</p>}

            <Cartao className="p-5">
              <h3 className="font-semibold">Peças parecidas</h3>
              <p className="text-[13px] text-suave mb-3">O que já foi calculado e aceite (por cliente, tipo de peça, tecido e tratamento).</p>
              {parecidas.length === 0 && <p className="text-[13px] text-tenue py-2">Sem peças parecidas no histórico.</p>}
              <div className="divide-y divide-linha">
                {parecidas.slice(0, 5).map(({ h, motivos }) => (
                  <div key={h.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0"><p className="text-[14px]">{h.peca} · {h.variante}</p><p className="text-[12px] text-tenue">{h.cliente} · {h.origem === 'Encomenda' ? 'preço de compra aceite' : h.origem === 'Ficha de custo' ? 'ficha de custo fechada' : 'orçamento validado'} · igual em {motivos.join(', ')}</p></div>
                    <Etiqueta>{h.origem}</Etiqueta>
                    <span className="w-20 text-right font-medium num">{eur(h.preco)}</span>
                  </div>
                ))}
              </div>
            </Cartao>

            {passo === 2 && (intervalo ? (
              <div className="rounded-cartao border border-ouro/40 bg-ouro-fraco/70 p-5">
                <div className="flex items-center gap-2"><EtiquetaIA /><span className="text-[14px] font-semibold">Preço proposto por peça</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-suave ml-2"><Confianca nivel={intervalo.base.length >= 3 ? 'alta' : 'media'} />Confiança {intervalo.base.length >= 3 ? 'alta' : 'média'}</span></div>
                <p className="text-[26px] font-semibold tracking-tight mt-1 num">{eur(intervalo.min)} – {eur(intervalo.max)}</p>
                <p className="text-[13px] text-tinta-2">Entrega a {dataCurta(existente.entrega)} · preço final depois do protótipo</p>
                <p className="text-[12px] text-suave mt-2">Baseado na ficha de custo ({eur(custo.final)}) e em {intervalo.base.length} {intervalo.base.length === 1 ? 'peça parecida' : 'peças parecidas'}. Quem fixa o preço é a direção de produção.</p>
              </div>
            ) : (
              <p className="text-[13px] text-suave bg-papel border border-linha rounded-cartao p-4">Sem casos parecidos suficientes (mínimo {MIN_CASOS_INTERVALO}): não é proposto intervalo. Fica a ficha de custo ({eur(custo.final)}).</p>
            ))}

            {/* ---------- Validação ---------- */}
            {passo === 3 && (
              <Cartao className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="size-9 rounded-full bg-tinta text-white grid place-items-center text-[13px] font-semibold">A</span>
                  <div><p className="text-[14px] font-semibold">Admin · Direção de produção</p><p className="text-[12px] text-suave">{existente.peca} · {existente.variante} · {existente.cliente}</p></div>
                </div>
                <p className="text-[13px] text-suave">Preço proposto por peça</p>
                <p className="text-[24px] font-semibold num mb-4">{existente.precoMin === existente.precoMax ? eur(existente.precoMin!) : `${eur(existente.precoMin!)} – ${eur(existente.precoMax!)}`}</p>
                <p className="text-[13px] font-medium mb-2">Valores a confirmar</p>
                <div className="space-y-2">
                  {existente.linhas.filter((l) => l.origem !== 'Segura').map((l) => (
                    <div key={l.id} className={clsx('flex items-center gap-3 p-3 rounded-controlo border', l.confirmado ? 'border-verde-borda bg-verde-fraco/50' : 'border-linha')}>
                      <div className="flex-1"><p className="text-[14px]">{l.descricao} · <span className="font-medium num">{eur(totalLinha(l))}</span></p>{l.nota && <p className="text-[12px] text-suave">{l.nota}</p>}</div>
                      {l.confirmado ? <Etiqueta tom="verde">Confirmado</Etiqueta> : <Botao pequeno icone={<Check size={13} />} onClick={() => linha(l.id, { confirmado: true })}>Confirmar</Botao>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <Botao variante="fantasma" icone={<ArrowLeft size={14} />} onClick={() => atualizar({ estado: 'Rascunho' })}>Ajustar</Botao>
                  <Botao variante="primario" icone={<CircleCheck size={15} />} disabled={porConfirmar.length > 0} title={porConfirmar.length ? 'Confirme todos os valores' : ''} onClick={() => {
                    atualizar({ estado: 'Validado', validadoPor: 'Admin' })
                    adicionarHistorico({ id: `${existente.id}-h`, cliente: existente.cliente, peca: existente.peca, variante: existente.variante, tipoPeca: existente.tipoPeca, tecido: existente.tecido, tratamento: existente.tratamento, preco: existente.precoMin!, pecas: null, origem: 'Orçamento', data: hojeISO() })
                    log('Preço validado', `${existente.peca} · ${existente.variante} · ${eur(existente.precoMin!)}`)
                  }}>Validar preço</Botao>
                </div>
              </Cartao>
            )}

            {/* ---------- Email ---------- */}
            {passo === 4 && existente.origem !== 'importado' && <Email p={existente} />}
          </div>
        </div>
      )}
      <style>{`@keyframes crescer{from{width:0}to{width:100%}}`}</style>
    </>
  )
}

function FichaCusto({ p, atualizar, editavel, compacta }: { p: Pedido; atualizar: (x: Partial<Pedido>) => void; editavel: boolean; compacta?: boolean }) {
  const cfg = useDb((s) => s.clientes.find((c) => c.nome === p.cliente))
  const c = calcularCusto(p.linhas, cfg, p.precoFinal, p)
  const [aberta, setAberta] = useState(!compacta)
  const linha = (id: string, x: Partial<LinhaCusto>) => atualizar({ linhas: p.linhas.map((l) => (l.id === id ? { ...l, ...x } : l)) })
  // consumo/valor: aceita números ou fórmulas simples (3/32, 140.8/1000, 0,46+0,08)
  const campo = (l: LinhaCusto, k: 'consumo' | 'valor') => {
    const expr = k === 'consumo' ? l.consumoExpr : l.valorExpr
    const mostrar = expr ?? num(l[k])
    if (!editavel) return <span className="num" title={expr ? `= ${num(l[k])}` : undefined}>{mostrar}</span>
    return <Entrada key={`${k}${l[k]}${expr}`} className="h-8 text-right px-2" defaultValue={mostrar} title={expr ? `= ${num(l[k])}` : 'Número ou fórmula (ex.: 3/32)'}
      onBlur={(e) => {
        const t = e.target.value.trim(); const v = avaliarExpr(t)
        if (v == null) { e.target.value = String(mostrar); return }
        const temOperacao = /[+\-*/x×÷]/.test(t.replace(/^-/, ''))
        linha(l.id, k === 'consumo' ? { consumo: v, consumoExpr: temOperacao ? t : undefined } : { valor: v, valorExpr: temOperacao ? t : undefined })
      }} />
  }
  return (
    <Cartao>
      <button onClick={() => compacta && setAberta(!aberta)} className="w-full flex items-start justify-between px-5 pt-5 pb-3 text-left">
        <div><h3 className="font-semibold">Ficha de custo</h3><p className="text-[13px] text-suave">{p.peca}{p.variante && ` · ${p.variante}`}{p.referencia && ` · ref. ${p.referencia}`}.{editavel && ' Consumos e valores aceitam fórmulas (ex.: 3/32); o total recalcula.'}</p></div>
        {compacta && <span className="flex items-center gap-2 font-semibold num">{eur(c.final)}<ChevronDown size={15} className={clsx('transition-transform', aberta && 'rotate-180')} /></span>}
      </button>
      {aberta && <>
        <table className="w-full text-[13px]">
          <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-y border-linha bg-fundo/40">
            <th className="text-left px-5 py-2 font-medium">Descrição</th><th className="text-center px-1 font-medium w-14">Unid.</th><th className="text-right px-2 font-medium w-24">Consumo</th><th className="text-right px-2 font-medium w-24">Valor unitário</th><th className="text-right px-2 font-medium w-24">Total s/ IVA</th><th className="text-right px-5 font-medium w-28">Origem</th>{editavel && <th className="w-8" />}</tr></thead>
          <tbody>
            {p.linhas.map((l) => {
              const incoerente = l.consumo === 0 && /leva \d/.test(l.nota ?? '')
              return (
                <tr key={l.id} className="border-b border-linha align-top">
                  <td className="px-5 py-2">
                    {editavel ? <input defaultValue={l.descricao} onBlur={(e) => e.target.value.trim() && e.target.value !== l.descricao && linha(l.id, { descricao: e.target.value.trim() })} className="w-full bg-transparent outline-none focus:bg-fundo rounded px-1 -mx-1" /> : <p>{l.descricao}</p>}
                    {l.nota && <p className={clsx('text-[12px] mt-0.5 flex gap-1', incoerente ? 'text-ambar' : 'text-suave')}>{incoerente && <AlertTriangle size={12} className="mt-0.5 shrink-0" />}{l.nota}</p>}
                  </td>
                  <td className="px-1 py-1.5 text-center text-suave">{editavel
                    ? <input defaultValue={l.unidade ?? '€'} onBlur={(e) => linha(l.id, { unidade: e.target.value.trim() || '€' })} className="w-12 h-8 text-center bg-transparent border border-linha rounded-md outline-none focus:border-tinta-2" />
                    : (l.unidade ?? '€')}</td>
                  <td className="px-2 py-1.5 text-right">{campo(l, 'consumo')}</td>
                  <td className="px-2 py-1.5 text-right">{campo(l, 'valor')}</td>
                  <td className="px-2 py-2 text-right num">{eur(totalLinha(l))}</td>
                  <td className="px-5 py-1.5 text-right">
                    <Etiqueta tom={l.confirmado ? 'verde' : TOM_ORIGEM[l.origem]}>{l.confirmado ? 'Confirmado' : l.origem}</Etiqueta>
                    {editavel && incoerente && <Botao pequeno className="mt-1.5" onClick={() => linha(l.id, { consumo: Number(l.nota!.match(/leva (\d+)/)![1]), nota: 'Corrigido de acordo com a ficha de produto.' })}>Corrigir para {l.nota!.match(/leva (\d+)/)![1]}</Botao>}
                  </td>
                  {editavel && <td className="py-2"><button title="Apagar linha" onClick={() => atualizar({ linhas: p.linhas.filter((x) => x.id !== l.id) })} className="text-tenue hover:text-vermelho"><Trash2 size={14} /></button></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        {editavel && <div className="px-5 pt-2"><Botao pequeno variante="fantasma" icone={<Plus size={13} />} onClick={() => atualizar({ linhas: [...p.linhas, { id: uid('c'), descricao: 'Nova linha', unidade: '€', consumo: 1, valor: 0, origem: 'Confirmar' }] })}>Acrescentar linha</Botao></div>}
        <div className="px-5 py-3 text-[13px] space-y-1.5">
          <div className="flex justify-between"><span>Total do custo</span><span className="font-semibold num">{eur(c.total)}</span></div>
          {c.fixado ? (<>
            <div className={clsx('flex justify-between', c.margem < 0 ? 'text-vermelho font-semibold' : 'text-suave')}><span>Margem total {c.margem < 0 && '· preço abaixo do custo'}</span><span className="num">{eur(c.margem)} · {c.margemPct.toFixed(1).replace('.', ',')} %</span></div>
            {(p.margemFixa != null || p.comissaoPct != null) && Math.abs(c.ajuste) > 0.005 && (
              <div className="flex justify-between text-tenue text-[12px]"><span>Cálculo da ficha: custo + N/ comissão {eur(c.nMargem)}{c.pct ? ` + agente ${String(c.pct).replace('.', ',')} %` : ''} = {eur(c.valorTotal)} · preço ajustado à mão</span><span className="num">{c.ajuste > 0 ? '+' : ''}{eur(c.ajuste)}</span></div>
            )}
          </>) : <>
            <div className="flex justify-between text-suave"><span>N/ comissão{p.margemFixa == null && ` (${cfg?.margemTipo === 'percentual' ? `${cfg.margem} %` : 'fixa'})`}</span><span className="num">{eur(c.margem)}</span></div>
            <div className="flex justify-between text-suave"><span>Comissão do agente ({String(c.pct).replace('.', ',')} %)</span><span className="num">{eur(c.comissao)}</span></div>
          </>}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-linha bg-fundo/40 rounded-b-cartao flex-wrap">
          <div>
            <span className="font-semibold">Preço final</span>
            {editavel && <button className="ml-3 text-[12px] text-azul hover:underline" onClick={() => atualizar({ precoFinal: c.fixado ? undefined : Math.ceil(c.final * 100 - 1e-9) / 100 })}>
              {c.fixado ? 'calcular com a margem e a comissão do cliente' : 'fixar o preço final'}</button>}
          </div>
          {editavel && c.fixado
            ? <span className="flex items-center gap-1"><Entrada key={`pf${p.precoFinal}`} className="h-9 w-28 text-right font-semibold" defaultValue={num(p.precoFinal!)} onBlur={(e) => { const v = avaliarExpr(e.target.value); if (v != null) atualizar({ precoFinal: Math.round(v * 100) / 100 }) }} /> €</span>
            : <span className="font-semibold text-[16px] num">{eur(c.final)}</span>}
        </div>
      </>}
    </Cartao>
  )
}

function Email({ p }: { p: Pedido }) {
  const [lingua, setLingua] = useState<'pt' | 'en' | 'fr'>('pt')
  const preco = p.precoMin === p.precoMax ? eur(p.precoMin!) : null
  const intervalo = { pt: preco ?? `entre ${eur(p.precoMin!)} e ${eur(p.precoMax!)}`, en: preco ?? `between ${eur(p.precoMin!)} and ${eur(p.precoMax!)}`, fr: preco ?? `entre ${eur(p.precoMin!)} et ${eur(p.precoMax!)}` }
  const peca = `${p.peca.toUpperCase()} (${p.variante.toLowerCase()})`
  const textos = {
    pt: `Assunto: ${p.peca.toUpperCase()} – orçamento\n\nOlá,\n\nSegue o nosso orçamento para a ${peca}: ${intervalo.pt} por peça, entrega a ${dataCurta(p.entrega)}.\n\nO preço final será confirmado depois do protótipo.\n\nCumprimentos,\nPereira & Cruz`,
    en: `Subject: ${p.peca.toUpperCase()} – quotation\n\nHello,\n\nPlease find our quotation for ${peca}: ${intervalo.en} per piece, delivery by ${dataCurta(p.entrega)}.\n\nThe final price will be confirmed after the prototype.\n\nBest regards,\nPereira & Cruz`,
    fr: `Objet : ${p.peca.toUpperCase()} – devis\n\nBonjour,\n\nVeuillez trouver notre devis pour ${peca} : ${intervalo.fr} par pièce, livraison le ${dataCurta(p.entrega)}.\n\nLe prix final sera confirmé après le prototype.\n\nCordialement,\nPereira & Cruz`,
  }
  const [texto, setTexto] = useState(textos.pt)
  return (
    <>
      <div className="rounded-cartao border border-verde-borda bg-verde-fraco px-5 py-4 flex gap-3"><CircleCheck size={17} className="text-verde mt-0.5" /><div><p className="font-semibold text-[14px]">Preço validado por {p.validadoPor ?? 'Admin'}.</p><p className="text-[13px] text-tinta-2">O rascunho do email está pronto. A plataforma não envia emails: copie-o para o seu programa de email.</p></div></div>
      <Cartao className="p-5">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="font-semibold">Email ao cliente</h3>
          <div className="flex items-center gap-2">
            <Pilulas valor={lingua} onChange={(l) => { setLingua(l); setTexto(textos[l]) }} opcoes={[{ id: 'pt', rotulo: 'Português' }, { id: 'en', rotulo: 'English' }, { id: 'fr', rotulo: 'Français' }]} />
            <Botao pequeno variante="fantasma" icone={<Copy size={14} />} onClick={() => { navigator.clipboard?.writeText(texto); aviso('Email copiado.') }}>Copiar</Botao>
          </div>
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={12} className="w-full rounded-controlo border border-linha p-3 text-[14px] leading-relaxed outline-none focus:border-tinta-2 resize-y" />
      </Cartao>
    </>
  )
}
