import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, CheckCheck, FileSpreadsheet, Plus, Send, ShieldCheck } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Etiqueta, Kpi, Modal, Tabela, aviso, type Tom } from '../../components/ui'
import { lerFichasCusto, type FichaCustoLida } from '../../lib/lerFichaCusto'
import { calcularCusto } from '../../lib/calc'
import { dataCurta, eur, hojeISO, slug } from '../../lib/format'
import type { EstadoPedido, Pedido } from '../../types'

export const TOM_PEDIDO: Record<EstadoPedido, Tom> = { Rascunho: 'neutro', 'Por validar': 'ambar', Validado: 'verde', Enviado: 'azul', Fechado: 'neutro' }

export default function Pedidos() {
  const { pedidos, clientes, guardarPedido, guardarLinha, adicionarHistorico, log } = useDb()
  const input = useRef<HTMLInputElement>(null)
  const [lidas, setLidas] = useState<{ ficheiro: string; fichas: FichaCustoLida[] } | null>(null)
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set())
  const [erroImp, setErroImp] = useState('')
  const titulo = (t: string) => t.toLowerCase().replace(/(^|\s|-)\S/g, (c) => c.toUpperCase())

  const abrir = async (f: File) => {
    setErroImp('')
    try {
      const porFicheiro = clientes.find((c) => f.name.toLowerCase().includes(c.nome.toLowerCase().replace(/[^a-z0-9]/g, '')))?.nome ?? ''
      const fichas = lerFichasCusto(await f.arrayBuffer(), clientes.map((c) => c.nome), porFicheiro)
      if (!fichas.length) throw new Error('Não encontrei nenhuma ficha de custo (tabela com «Descrição», «Consumo» e «Valor Unitário»).')
      setLidas({ ficheiro: f.name, fichas }); setEscolhidas(new Set(fichas.map((x) => x.folha)))
    } catch (e) { setErroImp(e instanceof Error ? e.message : String(e)) }
  }

  const importar = () => {
    if (!lidas) return
    let n = 0
    const novosClientes = new Set<string>()
    const sel = lidas.fichas.filter((x) => escolhidas.has(x.folha))
    // o mesmo código em várias folhas (cabeçalho copiado) não pode fazer uma ficha apagar a outra
    const repetido = (f: (typeof sel)[number]) => sel.filter((g) => (g.codigo || g.nome) === (f.codigo || f.nome) && g.variante === f.variante).length > 1
    for (const f of sel) {
      const cliente = clientes.find((c) => c.nome.toLowerCase() === f.cliente.toLowerCase())?.nome ?? (f.cliente || '—')
      if (cliente !== '—' && !clientes.some((c) => c.nome === cliente) && !novosClientes.has(cliente)) {
        novosClientes.add(cliente)
        // a comissão de agente fica em cada ficha; o cliente novo fica sem agente
        guardarLinha('clientes', { id: `cli-${slug(cliente)}`, nome: cliente, ...(f.margemFixa != null ? { margemTipo: 'fixa' as const, margem: f.margemFixa } : { margemTipo: 'percentual' as const, margem: 20 }), comissao: 0,
          idPrefixo: cliente.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() }, `Clientes: ${cliente} (criado ao importar fichas de custo${f.marca ? `, marca ${f.marca}` : ''})`)
      }
      const tecido = f.linhas.find((l) => /^tecido/i.test(l.descricao))?.descricao.replace(/^tecido\s*-?\s*/i, '').trim() || '—'
      const id = `fc-${slug(`${cliente}-${f.codigo || f.nome}-${f.variante}${repetido(f) ? `-${f.folha}` : ''}`)}`
      const pedido: Pedido = {
        id, cliente, peca: titulo(f.nome), variante: titulo(f.variante), tipoPeca: f.tipoPeca, tecido, tratamento: '—', entrega: '',
        linhas: f.linhas.map(({ totalFicheiro: _t, fixo: _f, ...l }) => l), estado: f.precoFinal != null ? 'Fechado' : 'Rascunho',
        // preço igual ao cálculo da ficha → fica calculado (custo + N/ comissão + agente); escrito à mão → preço fixado
        margemFixa: f.margemFixa ?? undefined, comissaoPct: f.comissaoPct ?? (f.margemFixa != null ? 0 : undefined), comissaoSobreCusto: f.comissaoSobreCusto || undefined,
        precoFinal: f.precoFinal != null && (f.precoAjustado || f.margemFixa == null) ? f.precoFinal : undefined,
        precoMin: f.precoFinal ?? undefined, precoMax: f.precoFinal ?? undefined,
        validadoPor: f.precoFinal != null ? 'Importado' : undefined, criadoEm: hojeISO(), referencia: f.codigo || undefined,
        origem: 'importado', origemFicheiro: `${lidas.ficheiro} · ${f.folha}`,
      }
      guardarPedido(pedido)
      if (f.precoFinal != null) adicionarHistorico({ id: `${id}-h`, cliente, peca: pedido.peca, variante: pedido.variante, tipoPeca: f.tipoPeca, tecido, tratamento: pedido.variante || '—', preco: f.precoFinal, pecas: null, origem: 'Ficha de custo', data: hojeISO() })
      n++
    }
    log('Fichas de custo importadas', `${lidas.ficheiro} · ${n} fichas${novosClientes.size ? ` · clientes novos: ${[...novosClientes].join(', ')}` : ''}`)
    aviso(`${n} ${n === 1 ? 'ficha importada' : 'fichas importadas'}.`)
    setLidas(null)
  }
  const nav = useNavigate()
  const [kpi, setKpi] = useState<EstadoPedido | ''>('')
  const preco = (p: Pedido) => p.precoMin != null && p.precoMax != null
    ? (p.precoMin === p.precoMax ? eur(p.precoMin) : `${eur(p.precoMin)} – ${eur(p.precoMax)}`)
    : eur(calcularCusto(p.linhas, clientes.find((c) => c.nome === p.cliente), p.precoFinal, p).final)
  const k = (e: EstadoPedido) => ({ ativo: kpi === e, onClick: () => setKpi(kpi === e ? '' : e), valor: pedidos.filter((p) => p.estado === e).length })

  return (
    <>
      <Cabecalho sobre="Pré-orçamentação" titulo="Pedidos" sub={`${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'}`}
        acoes={<>
          <Botao icone={<FileSpreadsheet size={15} />} onClick={() => input.current?.click()}>Importar fichas de custo</Botao>
          <input ref={input} type="file" hidden accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void abrir(f); e.target.value = '' }} />
          <Botao variante="primario" icone={<Plus size={16} />} onClick={() => nav('/orcamentos/novo')}>Novo pedido</Botao>
        </>} />
      {erroImp && <p className="mb-4 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erroImp}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <Kpi rotulo="Por validar" icone={<ShieldCheck size={14} />} tom="ambar" {...k('Por validar')} />
        <Kpi rotulo="Enviados" icone={<Send size={14} />} {...k('Enviado')} />
        <Kpi rotulo="Fechados" icone={<CheckCheck size={14} />} tom="verde" {...k('Fechado')} />
      </div>
      <Tabela<Pedido> linhas={pedidos} chave={(p) => p.id} onLinha={(p) => nav(`/orcamentos/${p.id}`)} filtroExterno={kpi ? (p) => p.estado === kpi : undefined}
        vazio="Ainda não há pedidos."
        colunas={[
          { id: 'cliente', rotulo: 'Cliente', valor: (p) => p.cliente, filtro: 'texto', render: (p) => <span className="font-medium">{p.cliente}</span> },
          { id: 'peca', rotulo: 'Peça', valor: (p) => `${p.peca} · ${p.variante}`, filtro: 'texto' },
          { id: 'preco', rotulo: 'Preço por peça', valor: preco, alinhar: 'dir' },
          { id: 'entrega', rotulo: 'Data de entrega', valor: (p) => p.entrega, render: (p) => dataCurta(p.entrega), filtro: 'data', alinhar: 'centro' },
          { id: 'val', rotulo: 'Validado por', valor: (p) => p.validadoPor ?? '—', alinhar: 'centro' },
          { id: 'estado', rotulo: 'Estado', valor: (p) => p.estado, filtro: 'lista', alinhar: 'centro', render: (p) => <Etiqueta tom={TOM_PEDIDO[p.estado]}>{p.estado}</Etiqueta> },
        ]} />

      <Modal aberto={!!lidas} onFechar={() => setLidas(null)} titulo="Importar fichas de custo" largura="max-w-3xl"
        sub={lidas ? `${lidas.ficheiro} · ${lidas.fichas.length} ${lidas.fichas.length === 1 ? 'ficha' : 'fichas'}. Os totais são recalculados por fórmula (consumo × valor).` : ''}
        rodape={<><Botao variante="fantasma" onClick={() => setLidas(null)}>Cancelar</Botao><Botao variante="primario" disabled={!escolhidas.size} onClick={importar}>Importar {escolhidas.size} {escolhidas.size === 1 ? 'ficha' : 'fichas'}</Botao></>}>
        <div className="space-y-3">
          {lidas?.fichas.map((f) => {
            const sel = escolhidas.has(f.folha)
            const margem = f.precoFinal != null ? f.precoFinal - f.totalCalculado : null
            return (
              <label key={f.folha} className={`block rounded-cartao border p-4 cursor-pointer ${sel ? 'border-tinta' : 'border-linha opacity-70'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 size-4 accent-[#1c1b19]" checked={sel} onChange={() => { const n = new Set(escolhidas); if (sel) n.delete(f.folha); else n.add(f.folha); setEscolhidas(n) }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{titulo(f.nome)} {f.variante && <span className="text-suave font-normal">· {titulo(f.variante)}</span>}</p>
                    <p className="text-[12px] text-suave">Folha «{f.folha}» · {f.cliente || 'cliente?'}{f.marca && ` (${f.marca})`}{f.cliente && !clientes.some((c) => c.nome.toLowerCase() === f.cliente.toLowerCase()) && ' · cliente novo'} · {f.tipoPeca}{f.codigo && ` · ref. ${f.codigo}`} · {f.linhas.length} linhas</p>
                    <div className="flex gap-x-5 gap-y-1 flex-wrap text-[13px] mt-2 num">
                      <span>Custo <b>{eur(f.totalCalculado)}</b>{f.totalFicheiro != null && Math.abs(f.totalFicheiro - f.totalCalculado) > 0.005 && <span className="text-ambar"> (na ficha: {eur(f.totalFicheiro)})</span>}</span>
                      {f.margemFixa != null && <span className="text-suave">+ N/ comissão {eur(f.margemFixa)}{f.comissaoPct ? ` + agente ${String(f.comissaoPct).replace('.', ',')} %` : ''}</span>}
                      <span>Preço final <b>{f.precoFinal != null ? eur(f.precoFinal) : '—'}</b>{f.precoAjustado && <span className="text-ambar"> (à mão)</span>}</span>
                      {margem != null && <span className={margem < 0 ? 'text-vermelho' : ''}>Margem <b>{eur(margem)}</b> ({((margem / f.precoFinal!) * 100).toFixed(1).replace('.', ',')} %)</span>}
                    </div>
                    {f.avisos.length > 0
                      ? <ul className="mt-2 space-y-0.5">{f.avisos.map((a) => <li key={a} className="text-[12px] text-ambar flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{a}</li>)}</ul>
                      : <p className="mt-2 text-[12px] text-verde flex items-center gap-1.5"><Check size={12} />Sem avisos.</p>}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
