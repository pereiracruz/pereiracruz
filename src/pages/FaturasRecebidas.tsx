import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { CircleCheck, ExternalLink, FileText, FileUp, Mail, RefreshCw, Search, X } from 'lucide-react'
import { Botao, Cabecalho, Cartao, Etiqueta, Pilulas, Vazio, aviso } from '../components/ui'
import { abrirAnexo, carregarEmails, marcarEmail, useEmails, verificarEmails } from '../lib/email'
import {
  carregarFatura, conferir, guardarFaturaRecebida, idFatura, lerFatura, listarFaturasRecebidas, procurarNoEfatura,
  type FaturaRecebida,
} from '../lib/faturasRecebidas'
import { NOME_EMPRESA_TOC, tocDisponivel } from '../lib/toconline'
import { dataHora, eur } from '../lib/format'
import { useDb } from '../store/db'

type Vista = 'por-lancar' | 'lancada' | 'ignorada'
const URL_EFATURA = 'https://app.toconline.pt/purchases/efatura'

export default function FaturasRecebidas() {
  const log = useDb((s) => s.log)
  const { emails, carregado, aVerificar } = useEmails()
  const [guardadas, setGuardadas] = useState<FaturaRecebida[] | null>(null)
  const [vista, setVista] = useState<Vista>('por-lancar')
  const [aTrabalhar, setATrabalhar] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const recarregar = () => listarFaturasRecebidas().then(setGuardadas).catch((e) => aviso(e.message))
  useEffect(() => { if (tocDisponivel) { void recarregar(); if (!carregado) void carregarEmails() } }, [carregado])

  // anexos (PDF/imagem) dos emails de faturas que ainda não estão na lista
  const todas = useMemo(() => {
    const porId = new Map<string, FaturaRecebida>((guardadas ?? []).map((f: FaturaRecebida) => [f.id, f] as const))
    for (const e of emails.filter((x) => x.tipo === 'fatura' && x.estado !== 'ignorada')) {
      for (const a of e.anexos.filter((x) => /\.(pdf|png|jpe?g|webp)$/i.test(x.nome))) {
        const id = idFatura(a.caminho)
        if (!porId.has(id)) porId.set(id, { id, origem: 'email', emailId: e.id, ficheiro: { nome: a.nome, caminho: a.caminho }, recebidaEm: e.data, estado: 'nova', obs: `${e.deNome || e.de} · ${e.assunto}` })
      }
    }
    return [...porId.values()].sort((a, b) => b.recebidaEm.localeCompare(a.recebidaEm))
  }, [guardadas, emails])

  const visiveis = todas.filter((f) => (vista === 'por-lancar' ? !['lancada', 'ignorada'].includes(f.estado) : f.estado === vista))
  const conta = (v: Vista) => todas.filter((f) => (v === 'por-lancar' ? !['lancada', 'ignorada'].includes(f.estado) : f.estado === v)).length

  const atualizar = (f: FaturaRecebida) => setGuardadas((g) => [...(g ?? []).filter((x) => x.id !== f.id), f])
  const trabalhar = async (f: FaturaRecebida, passo: (f: FaturaRecebida) => Promise<FaturaRecebida>) => {
    setATrabalhar(f.id)
    try { atualizar(await passo(f)) } catch (e) { aviso(e instanceof Error ? e.message : String(e)) } finally { setATrabalhar(null) }
  }
  // ler + procurar no e-Fatura + conferir, de uma vez
  const verificar = (f: FaturaRecebida) => trabalhar(f, async (x) => {
    const lida = x.leitura ? x : await lerFatura(x)
    const registo = await procurarNoEfatura(lida.leitura!)
    const verificacoes = conferir(lida.leitura!, registo)
    return guardarFaturaRecebida({ ...lida, registo, verificacoes, estado: registo && registo.estado !== 'pending' ? 'lancada' : 'conferida' })
  })
  const marcar = (f: FaturaRecebida, estado: FaturaRecebida['estado']) => trabalhar(f, async (x) => {
    const g = await guardarFaturaRecebida({ ...x, estado })
    if (estado === 'lancada') log('Fatura de compra lançada', `${x.leitura?.fornecedor.nome ?? x.ficheiro.nome} · ${x.leitura?.numero ?? ''}`)
    // quando todos os anexos de um email estão tratados, o email sai de «por tratar»
    const email = emails.find((e) => e.id === x.emailId)
    if (email && email.estado === 'nova') {
      const outros = todas.filter((o) => o.emailId === email.id && o.id !== x.id)
      if (outros.every((o) => ['lancada', 'ignorada'].includes(o.estado))) await marcarEmail(email, 'tratada')
    }
    return g
  })

  const carregar = async (fl: FileList | null) => {
    if (!fl) return
    for (const f of Array.from(fl)) {
      try { atualizar(await carregarFatura(f)) } catch (e) { aviso(e instanceof Error ? e.message : String(e)) }
    }
  }

  if (!tocDisponivel) return <><Cabecalho sobre="Financeiro" titulo="Faturas recebidas" /><Vazio>Disponível no site publicado (com servidor).</Vazio></>

  return (
    <>
      <Cabecalho sobre="Financeiro" titulo="Faturas recebidas"
        sub="Faturas e recibos verdes de fornecedores que chegam por email (às 3 contas) ou que carrega aqui. A aplicação lê-os, procura o registo no e-Fatura do TOConline e confere valores, IVA, retenção e vencimento."
        acoes={<>
          <Botao variante="fantasma" icone={<RefreshCw size={15} className={clsx(aVerificar && 'animate-spin')} />} disabled={aVerificar} onClick={() => verificarEmails().then((r) => aviso(r.novos.length ? `${r.novos.length} email(s) novo(s).` : 'Sem emails novos.')).catch(() => aviso('Não foi possível ver os emails.'))}>Ver emails</Botao>
          <Botao variante="primario" icone={<FileUp size={15} />} onClick={() => input.current?.click()}>Carregar faturas</Botao>
          <input ref={input} type="file" hidden multiple accept=".pdf,image/*" onChange={(e) => { void carregar(e.target.files); e.target.value = '' }} />
        </>} />

      <Pilulas className="mb-4" valor={vista} onChange={setVista} opcoes={[
        { id: 'por-lancar', rotulo: `Por lançar${conta('por-lancar') ? ` (${conta('por-lancar')})` : ''}` },
        { id: 'lancada', rotulo: 'Lançadas' },
        { id: 'ignorada', rotulo: 'Ignoradas' },
      ]} />

      <Cartao>
        {!guardadas ? <Vazio>A carregar…</Vazio> : visiveis.length === 0 ? <Vazio>{vista === 'por-lancar' ? 'Nenhuma fatura por lançar.' : 'Nada aqui.'}</Vazio> : (
          <ul className="divide-y divide-linha">
            {visiveis.map((f) => {
              const l = f.leitura, r = f.registo
              const problemas = (f.verificacoes ?? []).filter((v) => v.ok === false).length
              const confirmar = (f.verificacoes ?? []).filter((v) => v.ok === null).length
              return (
                <li key={f.id} className="px-5 py-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    {f.origem === 'email' ? <Mail size={17} className="text-suave mt-0.5" /> : <FileText size={17} className="text-suave mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[15px]">
                        {l ? <>{l.fornecedor.nome} · {l.numero} · {eur(l.total)}</> : f.ficheiro.nome}
                        {r && <span className="text-suave font-normal"> · {NOME_EMPRESA_TOC[r.empresa]}</span>}
                      </p>
                      <p className="text-[13px] text-suave">
                        {l ? `${l.tipoDocumento} · ${l.data.split('-').reverse().join('/')} · NIF ${l.fornecedor.nif}` : f.obs ?? 'Carregada aqui'} · recebida {dataHora(f.recebidaEm)}
                      </p>
                      <button onClick={() => abrirAnexo({ nome: f.ficheiro.nome, caminho: f.ficheiro.caminho, tipo: '', tamanho: 0 }).catch((e) => aviso(e.message))}
                        className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-suave hover:text-tinta"><FileText size={12} />{f.ficheiro.nome}</button>

                      {f.verificacoes && (
                        <table className="mt-3 text-[13px] w-full max-w-2xl">
                          <thead><tr className="text-[11px] uppercase tracking-wider text-suave"><th className="text-left py-1">Verificação</th><th className="text-left">Documento</th><th className="text-left">e-Fatura / esperado</th><th /></tr></thead>
                          <tbody>
                            {f.verificacoes.map((v, i) => (
                              <tr key={i} className="border-t border-linha align-top">
                                <td className="py-1 pr-2">{v.campo}{v.nota && <span className="block text-[11px] text-tenue">{v.nota}</span>}</td>
                                <td className="pr-2">{v.lido}</td><td className="pr-2">{v.efatura}</td>
                                <td>{v.ok === true ? <Etiqueta tom="verde">ok</Etiqueta> : v.ok === false ? <Etiqueta tom="vermelho">diferente</Etiqueta> : <Etiqueta tom="ambar">confirmar</Etiqueta>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {r && r.estado !== 'pending' && <p className="mt-2 text-[13px] text-verde">Já está associada no TOConline{r.documentoLocal ? ` (${r.documentoLocal})` : ''}.</p>}
                      {f.verificacoes && r?.estado === 'pending' && (
                        <p className={clsx('mt-2 text-[13px]', problemas ? 'text-vermelho' : confirmar ? 'text-ambar' : 'text-verde')}>
                          {problemas ? `${problemas} diferença(s): não lançar sem verificar.` : confirmar ? `Tudo bate; ${confirmar} ponto(s) a confirmar.` : 'Tudo bate com o e-Fatura: pronta para «Criar e associar».'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {f.estado !== 'lancada' && f.estado !== 'ignorada' && <>
                        <Botao pequeno variante={f.verificacoes ? 'secundario' : 'primario'} icone={<Search size={14} />} disabled={aTrabalhar === f.id} onClick={() => verificar(f)}>
                          {aTrabalhar === f.id ? 'A verificar…' : f.verificacoes ? 'Verificar de novo' : 'Ler e verificar'}
                        </Botao>
                        {r?.estado === 'pending' && <a href={URL_EFATURA} target="_blank" rel="noreferrer"><Botao pequeno icone={<ExternalLink size={14} />}>e-Fatura</Botao></a>}
                        <Botao pequeno icone={<CircleCheck size={14} />} disabled={aTrabalhar === f.id} onClick={() => marcar(f, 'lancada')}>Lançada</Botao>
                        <Botao pequeno variante="fantasma" icone={<X size={14} />} onClick={() => marcar(f, 'ignorada')}>Ignorar</Botao>
                      </>}
                      {(f.estado === 'lancada' || f.estado === 'ignorada') && <Botao pequeno variante="fantasma" onClick={() => marcar(f, 'conferida')}>Voltar a por lançar</Botao>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Cartao>
    </>
  )
}
