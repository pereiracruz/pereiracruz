import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Mail, FileText, Receipt, RefreshCw, Trash2, Truck } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Campo, Cartao, Entrada, Etiqueta, Modal, aviso } from '../../components/ui'
import { qtdParaEmbalar, soma } from '../../lib/calc'
import { dataCurta, eur, hojeISO, int, parseNum } from '../../lib/format'
import { NOME_EMPRESA_TOC, apagarRascunhoTOC, consultarTOC, criarGuiaTOC, enviarGuiaEmailTOC, finalizarGuiaTOC, listarTOC, tocDisponivel, type EmpresaTOC, type GuiaParaTOC } from '../../lib/toconline'
import type { Encomenda, GuiaTOC } from '../../types'

/** Valores habituais de cada empresa (lidos das guias reais em 26/11/2026; editáveis em cada guia). */
// As guias levam só quantidades: o preço entra apenas na fatura.
const HABITUAL: Record<EmpresaTOC, { carga: { morada: string; cp: string; localidade: string }; texto: string; artigo: string }> = {
  PP: { carga: { morada: 'RUA DA AGRA, N.º 70', cp: '4775-205', localidade: 'NEGREIROS' }, texto: 'Artigos p/armazém', artigo: 'CONF' },
  PC: { carga: { morada: 'Rua da Agra, nº40', cp: '4775-205', localidade: 'Negreiros' }, texto: 'Artigos confecionados a feitio p/armazém', artigo: '' },
}
const VIATURAS = ['V/carro', 'BD-35-HS']

type Reg = { id: string } & Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))
interface Linha { chave: string; incluir: boolean; produto: string; descricao: string; quantidade: number }
interface Dados { series: { id: string; rotulo: string }[]; clientes: Reg[]; produtos: Reg[]; taxId?: string; unidadeId?: string }

const agoraLocal = () => {
  const d = new Date(Date.now() + 30 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const rotuloProduto = (p: Reg) => [s(p.item_code), s(p.item_description ?? p.description ?? p.name)].filter(Boolean).join(' · ')

export default function GuiasEncomenda({ enc }: { enc: Encomenda }) {
  const { atualizarEncomenda, log } = useDb()
  const [empresa, setEmpresa] = useState<EmpresaTOC>('PP')
  const [dados, setDados] = useState<Dados | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [erro, setErro] = useState('')
  const [serie, setSerie] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [filtro, setFiltro] = useState('')
  const [descarga, setDescarga] = useState({ morada: '', cp: '', localidade: '' })
  const [carga, setCarga] = useState(HABITUAL.PP.carga)
  const [viatura, setViatura] = useState('V/carro')
  const [hora, setHora] = useState(agoraLocal())
  const [texto, setTexto] = useState(HABITUAL.PP.texto)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [confirmar, setConfirmar] = useState(false)
  const [aCriar, setACriar] = useState(false)
  const [finalizarLogo, setFinalizarLogo] = useState(true)
  const [aFinalizar, setAFinalizar] = useState('')
  const [enviarLogo, setEnviarLogo] = useState(true)
  const [emailPara, setEmailPara] = useState('')
  const [aEnviar, setAEnviar] = useState('')
  const [aAtualizar, setAAtualizar] = useState('')
  const [faturar, setFaturar] = useState<GuiaTOC | null>(null)

  const guias = enc.guias ?? []
  const guardarGuias = (fn: (g: GuiaTOC[]) => GuiaTOC[]) => atualizarEncomenda(enc.id, (e) => ({ ...e, guias: fn(e.guias ?? []) }))

  const linhasIniciais = (emp: EmpresaTOC, produtos: Reg[]): Linha[] =>
    enc.modelos.flatMap((m) => m.variantes.map((v) => {
      const qtd = soma(qtdParaEmbalar(v))
      const tipo = (m.tipoPeca || '').toLowerCase()
      const prod = emp === 'PP'
        ? produtos.find((p) => s(p.item_code).toUpperCase() === HABITUAL.PP.artigo)
        : produtos.find((p) => tipo && (s(p.item_code).toLowerCase().startsWith(tipo.split(' ')[0]) || s(p.item_description).toLowerCase().includes(tipo.split(' ')[0])))
      const descricao = emp === 'PP'
        ? `${m.nome} ${v.nome}`.trim()
        : [m.tipoPeca, `${m.nome} ${v.nome}`, enc.numeroDocumento].filter(Boolean).map((x) => String(x).toUpperCase()).join('\n')
      return { chave: `${m.id}:${v.id}`, incluir: qtd > 0, produto: prod?.id ?? '', descricao, quantidade: qtd }
    }))

  const carregar = async (emp: EmpresaTOC) => {
    setEmpresa(emp); setErro(''); setACarregar(true); setDados(null); setClienteId('')
    setCarga(HABITUAL[emp].carga); setTexto(HABITUAL[emp].texto)
    try {
      const [seriesGT, clientes, produtos, taxas, unidades] = await Promise.all([
        listarTOC(emp, 'commercial_document_series?filter[document_type]=GT&page[size]=200'),
        listarTOC(emp, 'customers?page[size]=500'),
        listarTOC(emp, 'products?page[size]=500'),
        listarTOC(emp, 'taxes?page[size]=100').catch(() => [] as Reg[]),
        listarTOC(emp, 'units_of_measure?page[size]=100').catch(() => [] as Reg[]),
      ])
      const ano = hojeISO().slice(0, 4)
      const series = seriesGT.filter((x) => !x.document_type || s(x.document_type) === 'GT')
        .map((x) => ({ id: x.id, rotulo: `GT ${s(x.prefix) || s(x.name) || x.id}` }))
        .sort((a, b) => b.rotulo.localeCompare(a.rotulo))
      const taxa = taxas.find((t) => s(t.tax_code) === 'NOR' && (!t.tax_country_region || s(t.tax_country_region) === 'PT'))
      const un = unidades.find((u) => /^un/i.test(s(u.unit_of_measure ?? u.abbreviation ?? u.name)))
      setDados({ series, clientes, produtos, taxId: taxa?.id, unidadeId: un?.id })
      setSerie(series.find((x) => x.rotulo.endsWith(ano))?.id ?? series[0]?.id ?? '')
      setLinhas(linhasIniciais(emp, produtos))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally { setACarregar(false) }
  }

  const escolherCliente = async (id: string) => {
    setClienteId(id)
    const c = dados?.clientes.find((x) => x.id === id)
    setDescarga({ morada: s(c?.address_detail), cp: s(c?.postcode), localidade: s(c?.city) })
    setEmailPara(s(c?.email))
    if (!id) return
    try {
      const r = await consultarTOC(empresa, `customers/${id}?include=addresses`) as { included?: { type: string; attributes?: Record<string, unknown> }[] }
      const m = r?.included?.find((x) => x.type === 'addresses')?.attributes
      if (m) setDescarga({ morada: s(m.address_detail), cp: s(m.postcode), localidade: s(m.city) })
    } catch { /* fica o que houver; edita-se à mão */ }
  }

  const cliente = dados?.clientes.find((x) => x.id === clienteId)
  const nomeCliente = s(cliente?.business_name ?? cliente?.name)
  const escolhidas = linhas.filter((l) => l.incluir && l.quantidade > 0)
  const pecas = soma(escolhidas.map((l) => l.quantidade))
  const falta = !dados ? 'Carregue os dados do TOConline.' : !clienteId ? 'Escolha o destinatário.' : !escolhidas.length ? 'Escolha pelo menos uma linha com quantidade.'
    : escolhidas.some((l) => !l.produto) ? 'Escolha o artigo do TOConline em todas as linhas.' : !descarga.morada || !descarga.cp ? 'Falta a morada de descarga.'
      : !viatura.trim() ? 'Falta a viatura.' : !hora ? 'Falta a data e hora de carga.' : ''

  const mudarLinha = (chave: string, x: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...x } : l)))

  const criar = async () => {
    if (falta || !dados || !cliente) return
    setACriar(true)
    const guia: GuiaParaTOC = {
      serie_id: serie || undefined, data: hojeISO(),
      cliente: { id: cliente.id, nome: nomeCliente, nif: s(cliente.tax_registration_number) || undefined },
      carga, descarga, viatura: viatura.trim(), hora_carga: `${hora.replace('T', ' ')}:00`,
      notas: `Encomenda ${enc.cliente} · ${enc.colecao}`,
      linhas: [
        ...(texto.trim() ? [{ tipo: 'texto' as const, descricao: texto.trim() }] : []),
        ...escolhidas.map((l) => ({ tipo: 'artigo' as const, descricao: l.descricao.replace(/\n/g, '\r\n'), item_id: l.produto, quantidade: l.quantidade, preco: 0, tax_id: dados.taxId, unidade_id: dados.unidadeId })),
      ],
    }
    try {
      const r = await criarGuiaTOC(empresa, guia, finalizarLogo)
      guardarGuias((g) => [...g, { id: String(r.id), empresa, criadaEm: new Date().toISOString(), destinatario: nomeCliente, pecas, viatura: viatura.trim(), estado: (r.finalizado ? 'finalizada' : 'rascunho') as GuiaTOC['estado'], numero: r.document_no || undefined, codigoAT: r.communication_code || undefined, linhas: escolhidas.map((l) => ({ chave: l.chave, descricao: l.descricao, quantidade: l.quantidade })) }])
      log('Guia criada no TOConline', `${enc.cliente} · ${enc.colecao} · ${NOME_EMPRESA_TOC[empresa]} · ${nomeCliente} · ${pecas} peças${r.finalizado ? ` · FINALIZADA ${r.document_no ?? ''}` : ' · rascunho'}`)
      if (r.finalizado && enviarLogo) {
        try {
          const em = await enviarGuiaEmailTOC(empresa, String(r.id), emailPara.trim() || undefined)
          guardarGuias((gs) => gs.map((x) => (x.id === String(r.id) && x.empresa === empresa ? { ...x, email: em.para } : x)))
          log('Guia enviada por email', `${r.document_no ?? ''} · ${nomeCliente} · ${em.para}`)
        } catch (e) { setErro(`A guia ${r.document_no ?? ''} foi finalizada, mas o email não foi enviado: ${e instanceof Error ? e.message : String(e)}`) }
      }
      if (r.erroFinalizar) setErro(`O rascunho foi criado, mas o TOConline não deixou finalizar: ${r.erroFinalizar}`)
      else aviso(r.finalizado ? `Guia ${r.document_no ?? ''} gravada e finalizada${r.communication_code ? ` (código AT ${r.communication_code})` : ': confirme no TOConline se foi comunicada à AT'}.` : 'Rascunho da guia criado no TOConline. Reveja-o e finalize-o lá.')
      setConfirmar(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e)); setConfirmar(false)
    } finally { setACriar(false) }
  }

  const atualizar = async (g: GuiaTOC) => {
    setAAtualizar(g.id)
    try {
      const r = await consultarTOC(g.empresa, `commercial_sales_documents/${g.id}`) as { data?: { attributes?: Record<string, unknown> } }
      const a = r?.data?.attributes ?? {}
      let fatura = g.fatura
      const filhos = Array.isArray(a.child_documents_ids) ? (a.child_documents_ids as unknown[]).map(String) : []
      for (const fid of filhos) {
        const f = await consultarTOC(g.empresa, `commercial_sales_documents/${fid}`) as { data?: { attributes?: Record<string, unknown> } }
        const fa = f?.data?.attributes ?? {}
        if (/^F[TRS]$/.test(s(fa.document_type)) && Number(fa.status) !== 4) { fatura = { numero: s(fa.document_no), total: Number(fa.gross_total) || undefined }; break }
      }
      guardarGuias((gs) => gs.map((x) => (x.id === g.id && x.empresa === g.empresa ? { ...x, estado: (Number(a.status) === 0 ? 'rascunho' : 'finalizada') as GuiaTOC['estado'], numero: s(a.document_no) || x.numero, codigoAT: s(a.communication_code) || x.codigoAT, fatura } : x)))
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      if (/404/.test(m)) guardarGuias((gs) => gs.map((x) => (x.id === g.id && x.empresa === g.empresa ? { ...x, estado: 'apagada' as const } : x)))
      else aviso(m)
    } finally { setAAtualizar('') }
  }

  const finalizar = async (g: GuiaTOC) => {
    if (!window.confirm(`Gravar e finalizar a guia para ${g.destinatario} (${int(g.pecas)} peças)? Depois de finalizada já não se altera nem apaga, só se anula no TOConline.`)) return
    setAFinalizar(g.id)
    try {
      const r = await finalizarGuiaTOC(g.empresa, g.id)
      guardarGuias((gs) => gs.map((x) => (x.id === g.id && x.empresa === g.empresa ? { ...x, estado: (r.finalizado ? 'finalizada' : 'rascunho') as GuiaTOC['estado'], numero: r.document_no || x.numero, codigoAT: r.communication_code || x.codigoAT } : x)))
      log('Guia finalizada no TOConline', `${enc.cliente} · ${enc.colecao} · ${g.destinatario} · ${r.document_no ?? ''}`)
      aviso(r.finalizado ? `Guia ${r.document_no ?? ''} finalizada${r.communication_code ? ` (código AT ${r.communication_code})` : ': confirme no TOConline se foi comunicada à AT'}.` : 'O TOConline não finalizou a guia.')
    } catch (e) { aviso(e instanceof Error ? e.message : String(e)) } finally { setAFinalizar('') }
  }

  const enviar = async (g: GuiaTOC) => {
    const para = window.prompt(`Enviar a guia ${g.numero ?? ''} por email a ${g.destinatario}.\nEmail (vazio = o email do cliente no TOConline):`, g.email ?? '')
    if (para === null) return
    setAEnviar(g.id)
    try {
      const r = await enviarGuiaEmailTOC(g.empresa, g.id, para.trim() || undefined)
      guardarGuias((gs) => gs.map((x) => (x.id === g.id && x.empresa === g.empresa ? { ...x, email: r.para } : x)))
      log('Guia enviada por email', `${g.numero ?? ''} · ${g.destinatario} · ${r.para}`)
      aviso(`Guia enviada para ${r.para || 'o email do cliente'}.`)
    } catch (e) { aviso(e instanceof Error ? e.message : String(e)) } finally { setAEnviar('') }
  }

  const apagar = async (g: GuiaTOC) => {
    if (!window.confirm(`Apagar o rascunho da guia para ${g.destinatario} no TOConline? Só funciona enquanto não estiver finalizada.`)) return
    try {
      await apagarRascunhoTOC(g.empresa, g.id)
      guardarGuias((gs) => gs.map((x) => (x.id === g.id && x.empresa === g.empresa ? { ...x, estado: 'apagada' as const } : x)))
      log('Rascunho de guia apagado', `${enc.cliente} · ${enc.colecao} · ${g.destinatario}`)
    } catch (e) { aviso(e instanceof Error ? e.message : String(e)) }
  }

  if (!tocDisponivel) return <Cartao className="p-5 text-[13.5px] text-suave">As guias do TOConline só funcionam no site publicado.</Cartao>
  const clientesFiltrados = (dados?.clientes ?? []).filter((c) => !filtro || `${s(c.business_name)} ${s(c.tax_registration_number)}`.toLowerCase().includes(filtro.toLowerCase())).slice(0, 300)

  return (
    <div className="space-y-4">
      {guias.length > 0 && (
        <Cartao>
          <div className="px-5 pt-5 pb-2"><h3 className="font-semibold">Guias desta encomenda</h3></div>
          <table className="w-full text-[13.5px]">
            <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-y border-linha bg-fundo/40">
              <th className="text-left px-5 py-2 font-medium">Empresa</th><th className="text-left px-2 font-medium">Destinatário</th><th className="text-right px-2 font-medium">Peças</th>
              <th className="text-left px-2 font-medium">Estado</th><th className="text-left px-2 font-medium">Nº / código AT</th><th className="text-left px-2 font-medium">Fatura</th><th className="px-5" /></tr></thead>
            <tbody>{guias.map((g) => (
              <tr key={`${g.empresa}${g.id}`} className="border-b border-linha">
                <td className="px-5 py-2.5">{NOME_EMPRESA_TOC[g.empresa]}<div className="text-[11.5px] text-tenue">{dataCurta(g.criadaEm.slice(0, 10))} · {g.viatura}</div></td>
                <td className="px-2">{g.destinatario}</td>
                <td className="px-2 text-right num">{int(g.pecas)}</td>
                <td className="px-2">{g.estado === 'rascunho' ? <Etiqueta tom="ambar">Rascunho</Etiqueta> : g.estado === 'finalizada' ? <Etiqueta tom="verde">Finalizada</Etiqueta> : <Etiqueta tom="neutro">Apagada</Etiqueta>}</td>
                <td className="px-2">{g.numero || '—'}{g.codigoAT && <div className="text-[11.5px] text-tenue">AT {g.codigoAT}</div>}{g.email && <div className="text-[11.5px] text-tenue">enviada para {g.email}</div>}</td>
                <td className="px-2">{g.fatura ? <><Etiqueta tom="verde">{g.fatura.numero}</Etiqueta>{g.fatura.total != null && <div className="text-[11.5px] text-tenue">{eur(g.fatura.total)} c/ IVA</div>}</>
                  : g.estado === 'finalizada' ? <Botao pequeno variante="secundario" icone={<Receipt size={13} />} onClick={() => setFaturar(g)}>Valores para faturar</Botao> : <span className="text-tenue">—</span>}</td>
                <td className="px-5 text-right whitespace-nowrap">
                  {g.estado !== 'apagada' && <Botao pequeno variante="fantasma" icone={<RefreshCw size={13} className={aAtualizar === g.id ? 'animate-spin' : ''} />} onClick={() => atualizar(g)}>Atualizar</Botao>}
                  {g.estado === 'finalizada' && <Botao pequeno variante="fantasma" icone={<Mail size={13} />} disabled={aEnviar === g.id} onClick={() => enviar(g)}>{aEnviar === g.id ? 'A enviar…' : g.email ? 'Reenviar' : 'Enviar por email'}</Botao>}
                  {g.estado === 'rascunho' && <Botao pequeno variante="secundario" icone={<CheckCircle2 size={13} />} disabled={aFinalizar === g.id} onClick={() => finalizar(g)}>{aFinalizar === g.id ? 'A finalizar…' : 'Gravar e finalizar'}</Botao>}
                  {g.estado === 'rascunho' && <Botao pequeno variante="fantasma" icone={<Trash2 size={13} />} onClick={() => apagar(g)}>Apagar</Botao>}
                </td>
              </tr>))}</tbody>
          </table>
          <p className="px-5 py-3 text-[12px] text-tenue">Se a guia ainda não tiver código AT, comunique-a no TOConline e carregue em Atualizar para trazer o código. A fatura faz-se no TOConline, convertendo a guia; «Valores para faturar» mostra os preços da encomenda e, depois de converter, Atualizar traz o número da fatura.</p>
        </Cartao>
      )}

      <Cartao className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Truck size={16} /> Nova guia de transporte</h3>
            <p className="text-[13px] text-suave">Cria a guia no TOConline com os dados desta encomenda e, se escolher, grava e finaliza logo. Em rascunho pode rever-se e apagar-se; finalizada, só se anula no TOConline.</p>
          </div>
          <div className="flex gap-2">
            {(['PP', 'PC'] as EmpresaTOC[]).map((e) => <Botao key={e} pequeno variante={dados && empresa === e ? 'primario' : 'secundario'} disabled={aCarregar} onClick={() => carregar(e)}>{NOME_EMPRESA_TOC[e]}</Botao>)}
          </div>
        </div>
        {aCarregar && <p className="text-[13px] text-suave">A ler clientes, artigos e séries do TOConline…</p>}
        {erro && <div className="mb-3 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho/30 rounded-controlo px-3 py-2 flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span className="break-all">{erro}</span></div>}
        {!dados && !aCarregar && <p className="text-[13px] text-tenue">Escolha a empresa que emite a guia.</p>}

        {dados && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <Campo rotulo="Série">
                <select value={serie} onChange={(e) => setSerie(e.target.value)} className="w-full h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px]">
                  {dados.series.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Viatura">
                <Entrada value={viatura} onChange={(e) => setViatura(e.target.value)} list="viaturas-guia" />
                <datalist id="viaturas-guia">{VIATURAS.map((v) => <option key={v} value={v} />)}</datalist>
              </Campo>
              <Campo rotulo="Data e hora de carga"><Entrada type="datetime-local" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Campo rotulo="Destinatário (cliente no TOConline)">
                <Entrada placeholder="Procurar por nome ou NIF" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="mb-2" />
                <select value={clienteId} onChange={(e) => escolherCliente(e.target.value)} className="w-full h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px]">
                  <option value="">— escolher —</option>
                  {clientesFiltrados.map((c) => <option key={c.id} value={c.id}>{s(c.business_name ?? c.name)}{c.tax_registration_number ? ` · ${s(c.tax_registration_number)}` : ''}</option>)}
                </select>
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 text-[12px] font-medium text-suave">Carga (de onde sai)</div>
                <Entrada className="col-span-2" value={carga.morada} onChange={(e) => setCarga({ ...carga, morada: e.target.value })} />
                <Entrada value={carga.cp} onChange={(e) => setCarga({ ...carga, cp: e.target.value })} />
                <Entrada value={carga.localidade} onChange={(e) => setCarga({ ...carga, localidade: e.target.value })} />
                <div className="col-span-2 text-[12px] font-medium text-suave mt-1">Descarga (para onde vai)</div>
                <Entrada className="col-span-2" placeholder="Morada" value={descarga.morada} onChange={(e) => setDescarga({ ...descarga, morada: e.target.value })} />
                <Entrada placeholder="0000-000" value={descarga.cp} onChange={(e) => setDescarga({ ...descarga, cp: e.target.value })} />
                <Entrada placeholder="Localidade" value={descarga.localidade} onChange={(e) => setDescarga({ ...descarga, localidade: e.target.value })} />
              </div>
            </div>

            <Campo rotulo="Linha de texto (primeira linha da guia)"><Entrada value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-y border-linha bg-fundo/40">
                  <th className="px-2 py-2" /><th className="text-left px-2 font-medium">Artigo (TOConline)</th><th className="text-left px-2 font-medium">Descrição</th>
                  <th className="text-right px-2 font-medium w-24">Quantidade</th></tr></thead>
                <tbody>{linhas.map((l) => (
                  <tr key={l.chave} className="border-b border-linha align-top">
                    <td className="px-2 py-2"><input type="checkbox" checked={l.incluir} onChange={(e) => mudarLinha(l.chave, { incluir: e.target.checked })} /></td>
                    <td className="px-2 py-1.5">
                      <select value={l.produto} onChange={(e) => mudarLinha(l.chave, { produto: e.target.value })} className="h-8 w-48 px-2 rounded-md border border-linha bg-papel text-[13px]">
                        <option value="">— escolher —</option>
                        {dados.produtos.map((p) => <option key={p.id} value={p.id}>{rotuloProduto(p)}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5"><textarea value={l.descricao} rows={Math.max(1, l.descricao.split('\n').length)} onChange={(e) => mudarLinha(l.chave, { descricao: e.target.value })}
                      className="w-full min-w-56 px-2 py-1 rounded-md border border-linha bg-papel text-[13px]" /></td>
                    <td className="px-2 py-1.5"><Entrada className="h-8 text-right" value={l.quantidade} onChange={(e) => mudarLinha(l.chave, { quantidade: Math.max(0, Math.round(parseNum(e.target.value) ?? 0)) })} /></td>
                  </tr>))}</tbody>
              </table>
              <p className="text-[12px] text-tenue mt-1">Quantidades: embalado → confecionado → encomenda. A guia leva só quantidades; o preço entra na fatura.</p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <span className="text-[13px] text-suave">{escolhidas.length} linha(s) · <b>{int(pecas)}</b> peças</span>
              <div className="flex items-center gap-3">
                {falta && <span className="text-[12.5px] text-ambar">{falta}</span>}
                <Botao variante="primario" icone={<FileText size={15} />} disabled={!!falta} onClick={() => setConfirmar(true)}>Criar guia no TOConline</Botao>
              </div>
            </div>
          </div>
        )}
      </Cartao>

      <ValoresFatura enc={enc} guia={faturar} onFechar={() => setFaturar(null)} />

      <Modal aberto={confirmar} onFechar={() => !aCriar && setConfirmar(false)} titulo={finalizarLogo ? 'Criar e finalizar a guia?' : 'Criar rascunho da guia?'} sub={`${NOME_EMPRESA_TOC[empresa]} → ${nomeCliente}`}
        rodape={<><Botao onClick={() => setConfirmar(false)} disabled={aCriar}>Cancelar</Botao><Botao variante="primario" onClick={criar} disabled={aCriar}>{aCriar ? 'A criar…' : finalizarLogo ? (enviarLogo ? 'Criar, finalizar e enviar' : 'Criar, gravar e finalizar') : 'Criar rascunho'}</Botao></>}>
        <div className="text-[13.5px] space-y-2">
          <p>Viatura <b>{viatura}</b> · carga a <b>{hora.replace('T', ' ')}</b></p>
          <p>De {carga.morada}, {carga.cp} {carga.localidade}<br />Para {descarga.morada}, {descarga.cp} {descarga.localidade}</p>
          <ul className="list-disc pl-5">{escolhidas.map((l) => <li key={l.chave}>{l.descricao.split('\n').join(' · ')}: {int(l.quantidade)} un.</li>)}</ul>
          <label className="flex items-start gap-2 pt-1"><input type="checkbox" className="mt-1" checked={finalizarLogo} onChange={(e) => setFinalizarLogo(e.target.checked)} />
            <span><b>Gravar e finalizar</b> logo (a guia ganha número). Depois de finalizada já não se altera nem apaga, só se anula no TOConline.</span></label>
          {finalizarLogo && <div className="pl-6 space-y-1.5">
            <label className="flex items-center gap-2"><input type="checkbox" checked={enviarLogo} onChange={(e) => setEnviarLogo(e.target.checked)} /><span>Enviar a guia por email ao cliente</span></label>
            {enviarLogo && <Entrada className="h-9" placeholder="Email do cliente (vazio = o que está no TOConline)" value={emailPara} onChange={(e) => setEmailPara(e.target.value)} />}
          </div>}
          {!finalizarLogo && <p className="text-suave">Fica como <b>rascunho</b>: pode conferi-lo e finalizá-lo depois com «Gravar e finalizar».</p>}
        </div>
      </Modal>
    </div>
  )
}

/** Preços da encomenda para as linhas de uma guia, para usar ao converter a guia em fatura no TOConline. */
function ValoresFatura({ enc, guia, onFechar }: { enc: Encomenda; guia: GuiaTOC | null; onFechar: () => void }) {
  if (!guia) return null
  const preco = (chave: string) => {
    const [mId, vId] = chave.split(':')
    return enc.modelos.find((m) => m.id === mId)?.variantes.find((v) => v.id === vId)?.preco ?? 0
  }
  const linhas = (guia.linhas ?? []).map((l) => ({ ...l, preco: preco(l.chave) }))
  const liquido = Math.round(soma(linhas.map((l) => l.quantidade * l.preco)) * 100) / 100
  const iva = Math.round(liquido * 0.23 * 100) / 100
  const texto = [...linhas.map((l) => `${l.descricao.split('\n').join(' · ')}: ${l.quantidade} × ${eur(l.preco)} = ${eur(l.quantidade * l.preco)}`),
    `Total sem IVA: ${eur(liquido)} · IVA 23%: ${eur(iva)} · Total: ${eur(liquido + iva)}`].join('\n')
  return (
    <Modal aberto onFechar={onFechar} largura="max-w-2xl" titulo={`Valores para faturar · ${guia.numero ?? 'guia'}`} sub={`${guia.destinatario} · preços por peça da encomenda`}
      rodape={<><Botao icone={<Copy size={14} />} onClick={() => { void navigator.clipboard?.writeText(texto); aviso('Valores copiados.') }}>Copiar</Botao><Botao variante="primario" onClick={onFechar}>Fechar</Botao></>}>
      {!linhas.length ? <p className="text-[13.5px] text-suave">Esta guia foi criada antes de a aplicação guardar as linhas. Use os preços da encomenda no separador «Modelos e fichas».</p> : (
        <div className="text-[13.5px]">
          <table className="w-full mb-3">
            <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-b border-linha"><th className="text-left py-1.5 font-medium">Linha</th><th className="text-right font-medium">Qtd.</th><th className="text-right font-medium">Preço</th><th className="text-right font-medium">Valor</th></tr></thead>
            <tbody>{linhas.map((l) => (
              <tr key={l.chave} className="border-b border-linha"><td className="py-1.5">{l.descricao.split('\n').join(' · ')}</td><td className="text-right num">{int(l.quantidade)}</td>
                <td className="text-right num">{l.preco ? eur(l.preco) : <span className="text-ambar">sem preço</span>}</td><td className="text-right num">{eur(l.quantidade * l.preco)}</td></tr>))}</tbody>
          </table>
          <div className="text-right space-y-0.5"><div>Total sem IVA <b className="num">{eur(liquido)}</b></div><div className="text-suave">IVA 23% {eur(iva)}</div><div>Total <b className="num">{eur(liquido + iva)}</b></div></div>
          <ol className="list-decimal pl-5 mt-4 text-[13px] text-suave space-y-0.5">
            <li>No TOConline, abra a guia {guia.numero ?? ''} e escolha converter em fatura.</li>
            <li>Ponha os preços por peça desta tabela nas linhas e confira o total.</li>
            <li>Finalize a fatura e, aqui, carregue em Atualizar na guia: o número da fatura aparece na coluna Fatura.</li>
          </ol>
        </div>
      )}
    </Modal>
  )
}
