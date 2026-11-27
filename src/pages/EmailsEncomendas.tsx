import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronDown, FilePlus2, FileSpreadsheet, FileText, Mail, PlugZap, RefreshCw, RotateCcw, Settings2, X } from 'lucide-react'
import { Botao, Cabecalho, Campo, Cartao, Entrada, Pilulas, Vazio, aviso } from '../components/ui'
import {
  abrirAnexo, carregarEmails, emailDisponivel, guardarConfigEmail, marcarEmail, nomeConta, testarEmail, useEmails, verificarEmails,
  type EmailEncomenda, type TesteConta,
} from '../lib/email'
import { dataHora } from '../lib/format'
import { useDb } from '../store/db'

type Vista = 'nova' | 'tratada' | 'ignorada'
const lista = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
const tamanho = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)

export default function EmailsEncomendas() {
  const nav = useNavigate()
  const log = useDb((s) => s.log)
  const encomendas = useDb((s) => s.encomendas)
  const { emails, config, carregado, aVerificar, ultimaVerificacao, erro } = useEmails()
  const [vista, setVista] = useState<Vista>('nova')
  const [aberto, setAberto] = useState<string | null>(null)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [remetentes, setRemetentes] = useState('')
  const [palavras, setPalavras] = useState('')
  const [dias, setDias] = useState('14')
  const [teste, setTeste] = useState<TesteConta[] | null>(null)
  const [aTestar, setATestar] = useState(false)
  const [erroTeste, setErroTeste] = useState('')

  useEffect(() => { if (emailDisponivel && !carregado) void carregarEmails() }, [carregado])
  useEffect(() => {
    setRemetentes(config.remetentes.join(', ')); setPalavras(config.palavras.join(', ')); setDias(String(config.dias))
    if (carregado && !config.remetentes.length && !config.palavras.length) setFiltrosAbertos(true)
  }, [config, carregado])

  const verificar = async () => {
    try {
      const r = await verificarEmails()
      aviso(r.novos.length ? `${r.novos.length} email(s) de encomenda novo(s).${r.restantes ? ` Faltam ${r.restantes}: carregue outra vez.` : ''}` : 'Sem emails de encomenda novos.')
      if (r.novos.length) log('Emails de encomendas recolhidos', `${r.novos.length} email(s): ${r.novos.map((n) => n.assunto).join(' · ')}`.slice(0, 300))
    } catch { /* o erro fica no estado */ }
  }

  const testar = async () => {
    setATestar(true); setErroTeste(''); setTeste(null)
    try { setTeste(await testarEmail()) } catch (e) { setErroTeste(e instanceof Error ? e.message : String(e)) } finally { setATestar(false) }
  }

  const guardarFiltros = async () => {
    try {
      await guardarConfigEmail({ ...config, remetentes: lista(remetentes), palavras: lista(palavras), dias: Math.min(Math.max(Number(dias) || 14, 1), 90) })
      aviso('Filtros guardados.')
    } catch (e) { aviso(`Não foi possível guardar: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const mudar = async (e: EmailEncomenda, estado: EmailEncomenda['estado']) => {
    try { await marcarEmail(e, estado) } catch (x) { aviso(`Não foi possível alterar: ${x instanceof Error ? x.message : String(x)}`) }
  }

  const visiveis = emails.filter((e) => e.estado === vista)
  const conta = (v: Vista) => emails.filter((e) => e.estado === v).length

  if (!emailDisponivel) return (
    <>
      <Cabecalho sobre="Fichas de produção" titulo="Emails de encomendas" />
      <Vazio>Disponível no site publicado (com servidor).</Vazio>
    </>
  )

  return (
    <>
      <Cabecalho sobre="Fichas de produção" titulo="Emails de encomendas"
        sub="A aplicação vai à caixa de correio buscar os emails de encomendas com Excel ou PDF. Só lê: no Thunderbird fica tudo como está."
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Campo rotulo="Remetentes" ajuda="Parte do endereço ou do nome, separados por vírgulas (ex.: whitecotton, @cliente.pt).">
              <Entrada value={remetentes} onChange={(e) => setRemetentes(e.target.value)} placeholder="whitecotton, @cliente.pt" />
            </Campo>
            <Campo rotulo="Palavras no assunto" ajuda="Ex.: encomenda, order, PO. Basta coincidir o remetente ou uma palavra.">
              <Entrada value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="encomenda, order, PO" />
            </Campo>
            <Campo rotulo="Procurar nos últimos (dias)" ajuda="Entre 1 e 90.">
              <Entrada value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" className="max-w-28" />
            </Campo>
          </div>
          <p className="text-[13px] text-suave mb-4">Só entram emails com anexo Excel ou PDF. Sem filtros, entram todos os que tiverem esses anexos.</p>
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
                      {enc && <p className="mt-2 text-[13px]">Encomenda: <button className="underline" onClick={() => nav(`/fichas/${enc.id}`)}>{enc.cliente} · {enc.colecao}</button></p>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {e.estado === 'nova' && <>
                        <Botao variante="primario" pequeno icone={<FilePlus2 size={14} />} disabled={!e.anexos.length}
                          onClick={() => nav('/fichas/nova', { state: { emailId: e.id } })}>Criar encomenda</Botao>
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
    </>
  )
}
