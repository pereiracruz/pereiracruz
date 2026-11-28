import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, Check, FilePlus2, Sparkles, UserPlus } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Entrada, Etiqueta, aviso, type Tom } from '../../components/ui'
import { marcarEmail, useEmails, type EmailEncomenda } from '../../lib/email'
import { NOME_TIPO, clienteDoEmail, encomendaDoEmail, lerEmailComIA, pedidosDoEmail, type LeituraEmailIA } from '../../lib/emailIA'
import { dataHora, int, slug } from '../../lib/format'

const TOM_TIPO: Record<string, Tom> = { encomenda: 'verde', pedido_preco: 'azul', tech_pack: 'ouro', alteracao: 'ambar', fatura: 'neutro', outro: 'neutro' }

/** Leitura do email com IA (OpenRouter): classificação, cliente, encomenda/tech pack/pedido e ações para criar na aplicação. */
export default function LeituraEmail({ email }: { email: EmailEncomenda }) {
  const nav = useNavigate()
  const { clientes, fornecedores, tecidos, equivalencias, acessorios, adicionarEncomenda, guardarPedido, guardarLinha, log } = useDb()
  const [aLer, setALer] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState(false)
  const leitura = email.leituraIA
  const l = leitura?.dados
  const cli = l ? clienteDoEmail(l, clientes) : null
  const [colecao, setColecao] = useState('')

  const ler = async () => {
    setALer(true); setErro(''); setProgresso('')
    try {
      const r: LeituraEmailIA = await lerEmailComIA(email.id, clientes.map((c) => c.nome), (f, t) => setProgresso(`${f}/${t}`))
      useEmails.setState((s) => ({ emails: s.emails.map((e) => (e.id === email.id ? { ...e, leituraIA: r } : e)) }))
      log('Email lido com IA', `${email.assunto} · ${NOME_TIPO[r.dados.classificacao.tipo]} · ${r.modelo}`)
      setAberta(true)
      setColecao(r.dados.techpack?.colecao ?? r.dados.encomenda?.numeroDocumento ?? '')
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setALer(false) }
  }
  const criarCliente = () => {
    if (!cli?.nome) return
    guardarLinha('clientes', { id: `cli-${slug(cli.nome)}`, nome: cli.nome, margemTipo: 'percentual', margem: 20, comissao: 0, idPrefixo: cli.nome.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() }, `Clientes: ${cli.nome} (criado a partir de um email)`)
    aviso(`Cliente ${cli.nome} criado. Reveja a margem em Dados mestre → Clientes.`)
  }
  const criarEncomenda = async () => {
    if (!l || !cli?.nome) return
    try {
      const { encomenda, fichas } = encomendaDoEmail(l, cli.nome, colecao.trim(), email.anexos.map((a) => a.nome), { fornecedores, tecidos, equivalencias, acessorios, clientes })
      adicionarEncomenda(encomenda)
      await marcarEmail(email, 'tratada', encomenda.id)
      log('Encomenda criada a partir de email (IA)', `${encomenda.cliente} · ${encomenda.colecao} · ${encomenda.modelos.length} modelos · ${fichas} ficha(s) em rascunho`)
      aviso(fichas ? `Encomenda criada com ${fichas} ficha(s) em rascunho: reveja e aprove.` : 'Encomenda criada. As fichas geram-se quando houver tech pack ou OF.')
      nav(`/fichas/${encomenda.id}`)
    } catch (e) { aviso(e instanceof Error ? e.message : String(e)) }
  }
  const criarPedidos = async () => {
    if (!l || !cli?.nome) return
    const ps = pedidosDoEmail(l, cli.nome)
    ps.forEach(guardarPedido)
    await marcarEmail(email, 'tratada')
    log('Pedidos de orçamento criados a partir de email (IA)', `${cli.nome} · ${ps.map((p) => p.peca).join(', ')}`)
    aviso(`${ps.length} pedido(s) de orçamento criados com a ficha-modelo: reveja os valores.`)
    nav(ps.length === 1 ? `/orcamentos/${ps[0].id}` : '/orcamentos')
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Botao pequeno variante={leitura ? 'fantasma' : 'secundario'} icone={<Sparkles size={14} />} disabled={aLer} onClick={ler}>
          {aLer ? `A ler o email e os anexos…${progresso ? ` ${progresso}` : ''}` : leitura ? 'Ler outra vez' : 'Ler com IA'}</Botao>
        {l && <button onClick={() => setAberta(!aberta)} className="text-[12px] text-azul hover:underline">
          {aberta ? 'Esconder leitura' : `Leitura: ${NOME_TIPO[l.classificacao.tipo]} (${dataHora(leitura!.em)})`}</button>}
      </div>
      {erro && <p className="mt-2 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}
      {l && aberta && (
        <div className="mt-2 rounded-controlo border border-linha bg-fundo/50 p-3 space-y-3 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap">
            <Etiqueta tom={TOM_TIPO[l.classificacao.tipo]}>{NOME_TIPO[l.classificacao.tipo]}</Etiqueta>
            <span className={clsx(l.classificacao.confianca === 'baixa' && 'text-ambar')}>confiança {l.classificacao.confianca}</span>
            <span className="text-suave">· {l.classificacao.motivo}</span>
          </div>
          <p>{l.resumo}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-suave">Cliente:</span>
            {cli?.existente ? <span className="flex items-center gap-1 text-verde font-medium"><Check size={14} />{cli.existente.nome} (já existe)</span>
              : cli?.nome ? <><span className="font-medium">{cli.nome}</span><span className="text-ambar">cliente novo</span><Botao pequeno variante="fantasma" icone={<UserPlus size={13} />} onClick={criarCliente}>Criar cliente</Botao></>
                : <span className="text-ambar">não identificado</span>}
            {l.cliente.nif && <span className="text-suave">· NIF {l.cliente.nif}</span>}
          </div>
          {l.anexos.length > 0 && <p className="text-suave">Anexos: {l.anexos.map((a) => `${a.nome} (${a.tipo.replace('_', ' ')})`).join(' · ')}</p>}
          {leitura!.ignorados.length > 0 && <p className="text-ambar">Não lidos: {leitura!.ignorados.join(', ')}</p>}

          {l.encomenda && l.encomenda.linhas.length > 0 && <div>
            <p className="font-medium mb-1">Encomenda {l.encomenda.numeroDocumento ?? ''}{l.encomenda.dataEntrega && ` · entrega ${l.encomenda.dataEntrega}`} · {l.encomenda.linhas.length} linhas · {int(l.encomenda.linhas.reduce((s, x) => s + (x.total ?? x.quantidades.reduce((a, b) => a + b, 0)), 0))} peças</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px]"><tbody>
              {l.encomenda.linhas.slice(0, 12).map((x, i) => (
                <tr key={i} className="border-b border-linha last:border-0">
                  <td className="py-1 pr-2 font-mono text-[12px]">{x.referencia}</td><td className="pr-2">{x.descricao}</td><td className="pr-2">{x.cor}</td>
                  <td className="pr-2 text-right num">{x.total ?? x.quantidades.reduce((a, b) => a + b, 0)}</td>
                  <td className={clsx('text-right', x.confianca === 'baixa' && 'text-ambar')}>{x.confianca}</td>
                </tr>))}
            </tbody></table></div>
            {l.encomenda.linhas.length > 12 && <p className="text-suave">… mais {l.encomenda.linhas.length - 12} linhas</p>}
          </div>}
          {l.techpack && l.techpack.modelos.length > 0 && <p><span className="font-medium">Tech pack / OF:</span> {l.techpack.modelos.map((m) => `${m.referencia} ${m.nome}`).join(' · ')}</p>}
          {l.pedidoPreco && l.pedidoPreco.pecas.length > 0 && <div>
            <p className="font-medium mb-1">Pedido de preço{l.pedidoPreco.prazo && ` · prazo ${l.pedidoPreco.prazo}`}</p>
            <ul className="list-disc pl-5">{l.pedidoPreco.pecas.map((p, i) => <li key={i}>{p.referencia ? `${p.referencia} · ` : ''}{p.descricao}{p.quantidade ? ` · ${int(p.quantidade)} peças` : ''}{p.precoAlvo ? ` · alvo ${p.precoAlvo} €` : ''}</li>)}</ul>
          </div>}
          {l.duvidas.length > 0 && <div className="text-ambar"><p className="font-medium flex items-center gap-1"><AlertTriangle size={14} />A confirmar com o cliente</p><ul className="list-disc pl-5">{l.duvidas.map((d) => <li key={d}>{d}</li>)}</ul></div>}

          <div className="flex items-end gap-2 flex-wrap pt-1">
            {l.encomenda && l.encomenda.linhas.length > 0 && <>
              <label className="text-[12px] text-suave">Coleção<Entrada className="h-8 w-40 mt-0.5" value={colecao} onChange={(e) => setColecao(e.target.value)} placeholder="ex.: SS27" /></label>
              <Botao variante="primario" pequeno icone={<FilePlus2 size={14} />} disabled={!cli?.nome || email.estado !== 'nova'} onClick={criarEncomenda}
                title={!cli?.nome ? 'Falta o cliente' : ''}>Criar encomenda{l.techpack?.modelos.length ? ' e fichas' : ''}</Botao>
            </>}
            {l.pedidoPreco && l.pedidoPreco.pecas.length > 0 && <Botao variante="primario" pequeno icone={<FilePlus2 size={14} />} disabled={!cli?.nome || email.estado !== 'nova'} onClick={criarPedidos}>
              Criar {l.pedidoPreco.pecas.length} pedido(s) de orçamento</Botao>}
          </div>
          <p className="text-[11px] text-tenue">Lido com {leitura!.modelo}{leitura!.fornecedor ? ` (${leitura!.fornecedor})` : ''}{leitura!.uso?.cost != null ? ` · custo ${leitura!.uso.cost.toFixed(3)} $` : ''}. Os valores marcados com confiança baixa e as dúvidas têm de ser confirmados; as fichas ficam em rascunho até serem aprovadas.</p>
        </div>
      )}
    </div>
  )
}
