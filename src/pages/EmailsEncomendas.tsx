import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronDown, CornerUpLeft, FilePlus2, FileSpreadsheet, FileText, ImagePlus, Mail, PlugZap, RefreshCw, RotateCcw, Send, Settings2, X } from 'lucide-react'
import { Botao, Cabecalho, Campo, Cartao, Entrada, Modal, Pilulas, Vazio, aviso } from '../components/ui'
import {
  abrirAnexo, carregarEmails, ehEncomenda, emailDisponivel, guardarConfigEmail, guardarImagemAssinatura, marcarEmail, nomeConta, responderEmail, testarEmail, urlImagem,
  useEmails, verificarEmails, type EmailEncomenda, type TesteConta,
} from '../lib/email'
import { dataHora } from '../lib/format'
import { useDb } from '../store/db'
import LeituraEmail from './emails/LeituraEmail'
import { modoServidor } from '../lib/supabase'

type Vista = 'nova' | 'tratada' | 'ignorada'
const lista = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
const tamanho = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)

const area = 'w-full px-3 py-2 rounded-controlo border border-linha bg-papel text-[14px] outline-none focus:border-tinta-2 focus:ring-2 focus:ring-ouro/25'

/** Assinatura das respostas de uma conta: nome do remetente, texto e imagem. */
function Assinatura({ conta }: { conta: string }) {
  const config = useEmails((s) => s.config)
  const atual = config.assinaturas?.[conta] ?? {}
  const [nome, setNome] = useState(atual.nome ?? 'Pereira & Cruz')
  const [texto, setTexto] = useState(atual.texto ?? '')
  const [imagem, setImagem] = useState(atual.imagem ?? '')
  const [ver, setVer] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (imagem) void urlImagem(imagem).then(setVer); else setVer('') }, [imagem])
  const escolher = async (f: File) => {
    try { setImagem(await guardarImagemAssinatura(conta, f)) } catch (e) { aviso(`Não foi possível carregar a imagem: ${e instanceof Error ? e.message : String(e)}`) }
  }
  const guardar = async () => {
    setAGuardar(true)
    try {
      await guardarConfigEmail({ ...config, assinaturas: { ...config.assinaturas, [conta]: { nome: nome.trim(), texto: texto.trim(), imagem: imagem || undefined } } })
      aviso(`Assinatura de ${nomeConta(config, conta)} guardada.`)
    } catch (e) { aviso(`Não foi possível guardar: ${e instanceof Error ? e.message : String(e)}`) } finally { setAGuardar(false) }
  }
  return (
    <div className="border border-linha rounded-controlo p-4">
      <p className="font-medium text-[14px] mb-3">{nomeConta(config, conta)} <span className="text-tenue font-normal">· {conta}</span></p>
      <div className="space-y-3">
        <Campo rotulo="Nome do remetente"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Texto da assinatura">
          <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} className={area} placeholder={'Com os melhores cumprimentos,\nSofia\nPereira & Cruz'} />
        </Campo>
        <div className="flex items-center gap-3 flex-wrap">
          {ver && <img src={ver} alt="" className="max-h-16 max-w-[220px] border border-linha rounded" />}
          <Botao pequeno icone={<ImagePlus size={14} />} onClick={() => input.current?.click()}>{imagem ? 'Trocar imagem' : 'Imagem da assinatura'}</Botao>
          {imagem && <Botao pequeno variante="fantasma" onClick={() => setImagem('')}>Tirar imagem</Botao>}
          <input ref={input} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolher(f); e.target.value = '' }} />
        </div>
        <Botao pequeno variante="primario" disabled={aGuardar} onClick={guardar}>Guardar assinatura</Botao>
      </div>
    </div>
  )
}

/** Emails de encomendas (com Excel/PDF) ou, com modo «pedido», emails a pedir preço/cotação de produção ou amostra. */
export default function EmailsEncomendas({ modo = 'encomenda' }: { modo?: 'encomenda' | 'pedido' }) {
  const pedidos = modo === 'pedido'
  const titulo = pedidos ? 'Emails de pedidos' : 'Emails de encomendas'
  const sobre = pedidos ? 'Pré-orçamentação' : 'Fichas de produção'
  const nav = useNavigate()
  const log = useDb((s) => s.log)
  const encomendas = useDb((s) => s.encomendas)
  const { emails, config, carregado, aVerificar, ultimaVerificacao, erro } = useEmails()
  const [vista, setVista] = useState<Vista>('nova')
  const [aberto, setAberto] = useState<string | null>(null)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [remetentes, setRemetentes] = useState('')
  const [palavras, setPalavras] = useState('')
  const [palavrasTexto, setPalavrasTexto] = useState('')
  const [palavrasPedidos, setPalavrasPedidos] = useState('')
  const [palavrasPedidosTexto, setPalavrasPedidosTexto] = useState('')
  const [palavrasExcluir, setPalavrasExcluir] = useState('')
  const [dias, setDias] = useState('14')
  const [teste, setTeste] = useState<TesteConta[] | null>(null)
  const [aTestar, setATestar] = useState(false)
  const [erroTeste, setErroTeste] = useState('')
  const [aResponder, setAResponder] = useState<EmailEncomenda | null>(null)
  const [resposta, setResposta] = useState('')
  const [aEnviar, setAEnviar] = useState(false)
  const contas = [...new Set([...Object.keys(config.nomesContas ?? {}), ...emails.map((e) => (e.conta ?? '').toLowerCase()).filter(Boolean)])]

  const enviar = async () => {
    if (!aResponder) return
    setAEnviar(true)
    try {
      const r = await responderEmail(aResponder, resposta)
      log('Resposta a email enviada', `${r.para} · ${r.assunto}`)
      aviso(r.copiaEnviados ? 'Resposta enviada.' : 'Resposta enviada (não consegui guardar cópia em Enviados).')
      setAResponder(null); setResposta('')
    } catch (e) { aviso(`Não foi enviada: ${e instanceof Error ? e.message : String(e)}`) } finally { setAEnviar(false) }
  }

  useEffect(() => { if (emailDisponivel && !carregado) void carregarEmails() }, [carregado])
  useEffect(() => {
    setRemetentes(config.remetentes.join(', ')); setPalavras(config.palavras.join(', ')); setPalavrasTexto((config.palavrasTexto ?? []).join(', ')); setDias(String(config.dias))
    setPalavrasPedidos((config.palavrasPedidos ?? []).join(', ')); setPalavrasPedidosTexto((config.palavrasPedidosTexto ?? []).join(', ')); setPalavrasExcluir((config.palavrasPedidosExcluir ?? []).join(', '))
    if (carregado && !pedidos && !config.remetentes.length && !config.palavras.length) setFiltrosAbertos(true)
  }, [config, carregado, pedidos])

  const verificar = async () => {
    try {
      const r = await verificarEmails(pedidos)
      const meus = r.novos.filter((n) => (pedidos ? n.tipo === 'pedido' : n.tipo !== 'pedido' && n.tipo !== 'fatura'))
      const nome = pedidos ? 'pedido' : 'encomenda'
      aviso(meus.length ? `${meus.length} email(s) de ${nome} novo(s).${r.restantes ? ` Faltam ${r.restantes}: carregue outra vez.` : ''}` : `Sem emails de ${nome} novos.${r.restantes ? ` Faltam ${r.restantes}: carregue outra vez.` : ''}`)
      if (meus.length) log(`${titulo} recolhidos`, `${meus.length} email(s): ${meus.map((n) => n.assunto).join(' · ')}`.slice(0, 300))
    } catch { /* o erro fica no estado */ }
  }

  const testar = async () => {
    setATestar(true); setErroTeste(''); setTeste(null)
    try { setTeste(await testarEmail()) } catch (e) { setErroTeste(e instanceof Error ? e.message : String(e)) } finally { setATestar(false) }
  }

  const guardarFiltros = async () => {
    try {
      await guardarConfigEmail({ ...config, remetentes: lista(remetentes), palavras: lista(palavras), palavrasTexto: lista(palavrasTexto), palavrasPedidos: lista(palavrasPedidos).length ? lista(palavrasPedidos) : undefined, palavrasPedidosTexto: lista(palavrasPedidosTexto).length ? lista(palavrasPedidosTexto) : undefined, palavrasPedidosExcluir: lista(palavrasExcluir).length ? lista(palavrasExcluir) : undefined, dias: Math.min(Math.max(Number(dias) || 14, 1), 90) })
      aviso('Filtros guardados.')
    } catch (e) { aviso(`Não foi possível guardar: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const mudar = async (e: EmailEncomenda, estado: EmailEncomenda['estado']) => {
    try { await marcarEmail(e, estado) } catch (x) { aviso(`Não foi possível alterar: ${x instanceof Error ? x.message : String(x)}`) }
  }

  const deEncomenda = emails.filter((e) => (pedidos ? e.tipo === 'pedido' : ehEncomenda(e)))
  const visiveis = deEncomenda.filter((e) => e.estado === vista)
  const conta = (v: Vista) => deEncomenda.filter((e) => e.estado === v).length

  if (!emailDisponivel) return (
    <>
      <Cabecalho sobre={sobre} titulo={titulo} />
      <Vazio>Disponível no site publicado (com servidor).</Vazio>
    </>
  )

  return (
    <>
      <Cabecalho sobre={sobre} titulo={titulo}
        sub={pedidos ? 'Emails das 3 caixas a pedir preço ou cotação de uma produção ou amostra (com ou sem anexo). Só lê: no Thunderbird fica tudo como está.' : 'A aplicação vai à caixa de correio buscar os emails de encomendas com Excel ou PDF. Só lê: no Thunderbird fica tudo como está.'}
        acoes={<>
          <Botao variante="fantasma" icone={<Settings2 size={15} />} onClick={() => setFiltrosAbertos(!filtrosAbertos)}>Filtros e ligação</Botao>
          <Botao variante="primario" icone={<RefreshCw size={15} className={clsx(aVerificar && 'animate-spin')} />} disabled={aVerificar} onClick={verificar}>
            {aVerificar ? 'A verificar…' : 'Ver emails novos'}
          </Botao>
        </>} />

      {ultimaVerificacao && !erro && <p className="text-[13px] text-tenue -mt-2 mb-4">Última verificação: {dataHora(ultimaVerificacao)}</p>}
      {erro && <p className="mb-4 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}

      {filtrosAbertos && (
        <Cartao className="p-5 mb-5">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            {pedidos ? <>
            <Campo rotulo="Palavras no assunto" ajuda="Vazio = as da aplicação: pedido, cotação, orçamento, preço, price, quotation, quote, RFQ, costing, amostra, sample, devis, presupuesto…">
              <Entrada value={palavrasPedidos} onChange={(e) => setPalavrasPedidos(e.target.value)} placeholder="pedido, cotação, preço, price, quotation, amostra" />
            </Campo>
            <Campo rotulo="Palavras no texto da mensagem" ajuda="Vazio = as da aplicação: pedido de cotação, pedido de orçamento, preço, qual o preço, quanto custa, best price, target price, please quote…">
              <Entrada value={palavrasPedidosTexto} onChange={(e) => setPalavrasPedidosTexto(e.target.value)} placeholder="pedido de cotação, preço, best price" />
            </Campo>
            <Campo rotulo="Excluir (assunto)" ajuda="Assuntos com estas palavras nunca são pedidos. Vazio = fatura, invoice, liquidação, pagamento, recibo, documentação, apoios, newsletter, promoção, status update…">
              <Entrada value={palavrasExcluir} onChange={(e) => setPalavrasExcluir(e.target.value)} placeholder="fatura, liquidação, pagamento" />
            </Campo>
            </> : <>
            <Campo rotulo="Remetentes" ajuda="Parte do endereço ou do nome, separados por vírgulas (ex.: whitecotton, @cliente.pt).">
              <Entrada value={remetentes} onChange={(e) => setRemetentes(e.target.value)} placeholder="whitecotton, @cliente.pt" />
            </Campo>
            <Campo rotulo="Palavras no assunto" ajuda="Ex.: encomenda, order, pedido. Basta coincidir o remetente ou uma palavra.">
              <Entrada value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="encomenda, order, pedido" />
            </Campo>
            <Campo rotulo="Palavras no texto da mensagem" ajuda="Só palavras que não aparecem em emails normais (evite «pedido», «project»…).">
              <Entrada value={palavrasTexto} onChange={(e) => setPalavrasTexto(e.target.value)} placeholder="encomenda, tech pack" />
            </Campo>
            </>}
            <Campo rotulo="Procurar nos últimos (dias)" ajuda="Entre 1 e 90.">
              <Entrada value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" className="max-w-28" />
            </Campo>
          </div>
          <p className="text-[13px] text-suave mb-4">{pedidos ? 'Entram com ou sem anexo. Se o assunto tiver uma palavra de encomenda (ex.: «encomenda», «order») e um Excel ou PDF, vai para Emails de encomendas.' : 'Só entram emails com anexo Excel ou PDF. Sem filtros, entram todos os que tiverem esses anexos. Os pedidos de preço vão para Emails de pedidos.'}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Botao variante="primario" pequeno onClick={guardarFiltros}>Guardar filtros</Botao>
            <Botao pequeno icone={<PlugZap size={14} />} disabled={aTestar} onClick={testar}>{aTestar ? 'A testar…' : 'Testar ligação ao email'}</Botao>
          </div>
          {teste && <ul className="mt-3 space-y-1.5">
            {teste.map((c) => (
              <li key={c.conta} className={clsx('text-[13px] border rounded-controlo px-3 py-2', c.ok ? 'text-verde bg-verde-fraco/60 border-verde-borda' : 'text-vermelho bg-vermelho-fraco border-vermelho-borda')}>
                <b>{nomeConta(config, c.conta)}</b>{nomeConta(config, c.conta) !== c.conta && <span className="opacity-70"> ({c.conta})</span>} · {c.ok ? `ligação feita, pasta ${c.pasta}: ${c.mensagens} emails (${c.porLer} por ler)` : c.erro}
              </li>
            ))}
          </ul>}
          {erroTeste && <p className="mt-3 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erroTeste}</p>}
          {contas.length > 0 && <>
            <h3 className="font-semibold mt-6 mb-1">Assinaturas das respostas</h3>
            <p className="text-[13px] text-suave mb-3">Vão no fim de cada resposta enviada pela aplicação, conforme a conta onde o email chegou.</p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{contas.map((c) => <Assinatura key={c} conta={c} />)}</div>
          </>}
        </Cartao>
      )}

      <Pilulas className="mb-4" valor={vista} onChange={setVista} opcoes={[
        { id: 'nova', rotulo: `Por tratar${conta('nova') ? ` (${conta('nova')})` : ''}` },
        { id: 'tratada', rotulo: 'Tratados' },
        { id: 'ignorada', rotulo: 'Ignorados' },
      ]} />

      <Cartao>
        {!carregado ? <Vazio>A carregar…</Vazio>
          : visiveis.length === 0 ? <Vazio>{vista === 'nova' ? 'Nenhum email por tratar. Carregue em «Ver emails novos».' : 'Nada aqui.'}</Vazio>
          : <ul className="divide-y divide-linha">
            {visiveis.map((e) => {
              const enc = e.encomendaId ? encomendas.find((x) => x.id === e.encomendaId) : undefined
              return (
                <li key={e.id} className="px-5 py-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <Mail size={17} className="text-suave mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[15px] break-words">{e.assunto}</p>
                      <p className="text-[13px] text-suave">{e.deNome ? `${e.deNome} · ` : ''}{e.de} · {dataHora(e.data)}{e.conta ? <span className="text-tenue"> · conta {nomeConta(config, e.conta)}</span> : null}</p>
                      <div className="flex gap-2 flex-wrap mt-2">
                        {e.anexos.map((a) => (
                          <button key={a.caminho} onClick={() => abrirAnexo(a).catch((x) => aviso(x.message))}
                            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-linha text-[12px] hover:bg-fundo">
                            {/\.(xlsx?|xlsm|csv)$/i.test(a.nome) ? <FileSpreadsheet size={13} /> : <FileText size={13} />}
                            {a.nome} <span className="text-tenue">{tamanho(a.tamanho)}</span>
                          </button>
                        ))}
                      </div>
                      {e.texto && (
                        <button onClick={() => setAberto(aberto === e.id ? null : e.id)} className="mt-2 text-[12px] text-suave hover:text-tinta inline-flex items-center gap-1">
                          <ChevronDown size={13} className={clsx('transition-transform', aberto !== e.id && '-rotate-90')} />Texto do email
                        </button>
                      )}
                      {aberto === e.id && <pre className="mt-2 whitespace-pre-wrap text-[13px] text-tinta-2 bg-fundo border border-linha rounded-controlo p-3 max-h-72 overflow-auto font-sans">{e.texto}</pre>}
                      {(e.respostas ?? []).map((r, i) => (
                        <div key={i} className="mt-2 text-[13px] bg-verde-fraco/50 border border-verde-borda rounded-controlo px-3 py-2">
                          <p className="text-suave">Respondido {dataHora(r.data)} por {r.por} para {r.para}{r.copiaEnviados ? '' : ' · sem cópia em Enviados'}</p>
                          <p className="whitespace-pre-wrap mt-1">{r.texto}</p>
                        </div>
                      ))}
                      {modoServidor && <LeituraEmail email={e} />}
                      {enc && <p className="mt-2 text-[13px]">Encomenda: <button className="underline" onClick={() => nav(`/fichas/${enc.id}`)}>{enc.cliente} · {enc.colecao}</button></p>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Botao pequeno icone={<CornerUpLeft size={14} />} onClick={() => { setAResponder(e); setResposta('') }}>Responder</Botao>
                      {e.estado === 'nova' && <>
                        {pedidos
                          ? <Botao variante="primario" pequeno icone={<FilePlus2 size={14} />} onClick={() => { void mudar(e, 'tratada'); nav('/orcamentos/novo') }}>Criar pedido de orçamento</Botao>
                          : <Botao variante="primario" pequeno icone={<FilePlus2 size={14} />} disabled={!e.anexos.length}
                          onClick={() => nav('/fichas/nova', { state: { emailId: e.id } })}>Criar encomenda</Botao>}
                        <Botao variante="fantasma" pequeno icone={<X size={14} />} onClick={() => mudar(e, 'ignorada')}>Ignorar</Botao>
                      </>}
                      {e.estado !== 'nova' && <Botao variante="fantasma" pequeno icone={<RotateCcw size={14} />} onClick={() => mudar(e, 'nova')}>Voltar a por tratar</Botao>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>}
      </Cartao>

      <Modal aberto={!!aResponder} onFechar={() => !aEnviar && setAResponder(null)} titulo="Responder" largura="max-w-2xl"
        sub={aResponder ? `De ${nomeConta(config, aResponder.conta)} (${aResponder.conta}) para ${aResponder.de}` : ''}
        rodape={<>
          <Botao variante="fantasma" disabled={aEnviar} onClick={() => setAResponder(null)}>Cancelar</Botao>
          <Botao variante="primario" icone={<Send size={15} />} disabled={aEnviar || !resposta.trim()} onClick={enviar}>{aEnviar ? 'A enviar…' : 'Enviar'}</Botao>
        </>}>
        {aResponder && <>
          <p className="text-[13px] text-suave mb-2">Assunto: {/^(re|res|aw|sv)\s*:/i.test(aResponder.assunto) ? aResponder.assunto : `RE: ${aResponder.assunto}`}</p>
          <textarea autoFocus rows={8} value={resposta} onChange={(x) => setResposta(x.target.value)} className={area} placeholder="Escreva a resposta…" />
          <p className="text-[12px] text-tenue mt-2">
            {aResponder.conta && config.assinaturas?.[aResponder.conta.toLowerCase()]?.texto ? 'Leva a assinatura desta conta e o email original citado em baixo.' : 'Esta conta ainda não tem assinatura (Filtros e ligação → Assinaturas). O email original vai citado em baixo.'}
            {' '}Responde só ao remetente e fica guardada em Enviados.
          </p>
        </>}
      </Modal>
    </>
  )
}
