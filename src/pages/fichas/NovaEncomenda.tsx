import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, Check, ChevronDown, CircleCheck, FilePlus2, FileSpreadsheet, FileText, Pencil, X } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Cartao, Confianca, Etiqueta, EtiquetaIA, Passos, Seletor, aviso } from '../../components/ui'
import { TechPack } from '../../components/TechPack'
import { encomendaImprevu, gerarFichaJanet, leituraShirtMao, type DecisaoIA } from '../../data/seed'
import { pecasModelo, referenciasEncomenda, valorEncomenda } from '../../lib/calc'
import { eur, int } from '../../lib/format'
import type { ModoServico } from '../../types'

type Ficheiro = { nome: string; tamanho: string; tipo: 'excel' | 'pdf' | 'outro'; url?: string; exemplo?: boolean }
type Escolha = { estado: 'pendente' | 'aceite' | 'alterada'; valor?: string }

const PASSOS = ['Carregar', 'A IA lê', 'Ligação', 'Rever e gerar']
const ETAPAS = ['Encomenda', 'Tech pack', 'Ligação', 'Fichas']

export default function NovaEncomenda() {
  const nav = useNavigate()
  const { encomendas, tecidos, adicionarEncomenda, log } = useDb()
  const [passo, setPasso] = useState(0)
  const [ficheiros, setFicheiros] = useState<Ficheiro[]>([])
  const [modo, setModo] = useState<ModoServico>('Produto acabado')
  const [etapa, setEtapa] = useState(0)
  const [pagina, setPagina] = useState(2)
  const [destaque, setDestaque] = useState(false)
  const [ligacoes, setLigacoes] = useState<Record<string, string>>({})
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({})
  const [escolhas, setEscolhas] = useState<Record<DecisaoIA['id'], Escolha>>({ tecido: { estado: 'pendente' }, botoes: { estado: 'pendente' }, variante: { estado: 'pendente' } })
  const [porque, setPorque] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const exemplo = ficheiros.some((f) => f.exemplo)
  const enc = useMemo(() => encomendaImprevu(), [])
  const pdf = ficheiros.find((f) => f.tipo === 'pdf')
  const pendentes = Object.values(escolhas).filter((e) => e.estado === 'pendente').length

  // leitura (simulada até ligar o servidor)
  useEffect(() => {
    if (passo !== 1) return
    setEtapa(0)
    const t = [700, 1500, 2300, 3000].map((ms, i) => setTimeout(() => setEtapa(i + 1), ms))
    const fim = setTimeout(() => {
      setLigacoes(Object.fromEntries(enc.modelos.map((m) => [m.id, m.techPack ? 'SHIRT MAO.pdf' : ''])))
      setPasso(2)
    }, 3400)
    return () => { t.forEach(clearTimeout); clearTimeout(fim) }
  }, [passo, enc])

  const adicionar = (fl: FileList | null) => {
    if (!fl) return
    const novos: Ficheiro[] = Array.from(fl).map((f) => ({
      nome: f.name,
      tamanho: f.size > 1e6 ? `${(f.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1e3))} KB`,
      tipo: /\.(xlsx?|csv)$/i.test(f.name) ? 'excel' : /\.pdf$/i.test(f.name) ? 'pdf' : 'outro',
      url: /\.pdf$/i.test(f.name) ? URL.createObjectURL(f) : undefined,
    }))
    setFicheiros((a) => [...a.filter((x) => !x.exemplo), ...novos])
  }

  const usarExemplo = () => setFicheiros([
    { nome: 'PEREIRACRUZ_SS27.xlsx', tamanho: '21 KB', tipo: 'excel', exemplo: true },
    { nome: 'SHIRT MAO.pdf', tamanho: '991 KB', tipo: 'pdf', exemplo: true },
  ])

  const escolher = (id: DecisaoIA['id'], e: Escolha) => setEscolhas((s) => ({ ...s, [id]: e }))

  const gerar = useCallback(() => {
    const final = { ...escolhas }
    for (const k of Object.keys(final) as DecisaoIA['id'][]) if (final[k].estado === 'pendente') final[k] = { estado: 'aceite' }
    let id = 'imprevu-ss27'; let n = 2
    while (encomendas.some((e) => e.id === id)) id = `imprevu-ss27-${n++}`
    const nova = encomendaImprevu(id)
    nova.modoServico = modo
    nova.ficheiros = ficheiros.map((f) => f.nome)
    nova.modelos = nova.modelos.map((m) => ({ ...m, techPack: !!ligacoes[m.id] }))
    nova.modelos[0] = gerarFichaJanet(nova.modelos[0], {
      tecido: final.tecido.estado === 'aceite' ? 'Adotrec' : final.tecido.valor || 'Adotrec',
      botoes: final.botoes.estado === 'aceite' ? 'madreperola' : 'latao',
      variante: final.variante.estado === 'aceite',
    })
    adicionarEncomenda(nova)
    log('Encomenda carregada', `${nova.cliente} · ${nova.colecao} · ${int(1357)} peças`)
    log('Fichas geradas', `${nova.modelos[0].nome} · ${nova.modelos[0].variantes.filter((v) => v.fichaGerada).length} variantes (por aprovar)`)
    aviso('Fichas geradas. Reveja e aprove antes de exportar.')
    nav(`/fichas/${id}/${nova.modelos[0].id}`)
  }, [escolhas, encomendas, modo, ficheiros, ligacoes, adicionarEncomenda, log, nav])

  useEffect(() => {
    if (passo !== 3) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) gerar() }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [passo, gerar])

  return (
    <>
      <Cabecalho migalhas={[{ rotulo: 'Encomendas', para: '/fichas' }, { rotulo: 'Nova encomenda' }]} sobre="Fichas de produção" titulo="Nova encomenda"
        acoes={passo === 3 && <>
          <Botao variante="fantasma" onClick={() => nav('/fichas')}>Descartar</Botao>
          <Botao variante="primario" icone={<CircleCheck size={16} />} onClick={gerar}>
            {pendentes ? 'Aceitar tudo e gerar fichas' : 'Gerar fichas'} <kbd className="text-[11px] opacity-60 ml-1">⌘↵</kbd>
          </Botao>
        </>} />
      <Passos passos={PASSOS} atual={passo} />

      {/* ---------- 1. Carregar ---------- */}
      {passo === 0 && (
        <div className="grid grid-cols-[1fr_440px] gap-5 items-start">
          <div>
            <button onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); adicionar(e.dataTransfer.files) }}
              className="w-full flex items-center gap-4 p-5 rounded-cartao border border-dashed border-linha-forte bg-papel/60 hover:bg-papel text-left">
              <span className="size-10 rounded-lg bg-fundo-2 grid place-items-center text-suave"><FilePlus2 size={18} /></span>
              <span><span className="block text-[15px] font-medium">Largue aqui a encomenda e o tech pack</span><span className="block text-[13px] text-suave">Excel, PDF, PowerPoint ou imagens · até 25 MB</span></span>
            </button>
            <input ref={inputRef} type="file" multiple hidden accept=".xlsx,.xls,.csv,.pdf,.ppt,.pptx,image/*" onChange={(e) => adicionar(e.target.files)} />

            {ficheiros.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-4">
                {ficheiros.map((f) => (
                  <div key={f.nome} className="relative w-[200px] bg-papel border border-linha rounded-cartao p-3">
                    <button onClick={() => setFicheiros(ficheiros.filter((x) => x !== f))} className="absolute top-2 right-2 text-tenue hover:text-tinta"><X size={14} /></button>
                    <div className={clsx('h-20 rounded-lg grid place-items-center', f.tipo === 'excel' ? 'bg-verde-fraco text-verde' : 'bg-vermelho-fraco text-vermelho')}>
                      {f.tipo === 'excel' ? <FileSpreadsheet size={22} /> : <FileText size={22} />}
                    </div>
                    <p className="text-[13px] font-medium mt-2 truncate">{f.nome}</p>
                    <p className="text-[12px] text-suave">{f.tamanho} · <span className="text-verde">carregado</span></p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-5 gap-4 flex-wrap">
              <button onClick={usarExemplo} className="flex items-center gap-2 text-[14px] text-suave hover:text-tinta"><FileText size={15} />Usar o exemplo da Imprevu</button>
              <div className="flex items-center gap-3">
                <Seletor className="w-48" valor={modo} onChange={(v) => setModo(v as ModoServico)} opcoes={['Produto acabado', 'A feitio']} />
                <Botao variante="primario" disabled={!ficheiros.length} onClick={() => setPasso(1)} icone={<EtiquetaIA />}>Preparar fichas</Botao>
              </div>
            </div>
            {ficheiros.length > 0 && !exemplo && (
              <p className="mt-4 text-[13px] text-ambar bg-ambar-fraco border border-ambar-borda rounded-controlo px-3 py-2">
                A leitura automática de documentos reais fica ativa quando ligarmos o servidor e a IA. Até lá, o resultado mostrado é o do exemplo da Imprevu.
              </p>
            )}
          </div>
          <Cartao className="p-5">
            <h3 className="text-[16px] font-semibold mb-3">Fica pronto</h3>
            <ul className="space-y-2 text-[14px] text-tinta-2">
              {['Referências, variantes e quantidades por tamanho', 'Tecido, bordado, gola e botões do tech pack', 'Tecido equivalente, acessórios e lavagens dos dados mestre', 'Uma ficha por variante e as folhas de cada destinatário'].map((t) => (
                <li key={t} className="flex gap-2.5"><span className="mt-2 size-1.5 rounded-full bg-ouro shrink-0" />{t}</li>
              ))}
            </ul>
            <p className="text-[12px] text-tenue mt-4">O modo de serviço define os materiais que aparecem na ficha.</p>
          </Cartao>
        </div>
      )}

      {/* ---------- 2. A IA lê ---------- */}
      {passo === 1 && (
        <div className="grid grid-cols-[1fr_1.15fr] gap-5 items-start">
          <TechPack nome={pdf?.nome ?? 'SHIRT MAO.pdf'} url={exemplo ? undefined : pdf?.url} pagina={Math.min(7, etapa * 2 + 1)} setPagina={() => {}} />
          <Cartao className="p-6">
            <div className="flex items-center gap-3">
              <EtiquetaIA />
              <div><p className="font-semibold">A ler {ETAPAS[Math.min(etapa, 3)].toLowerCase()}…</p><p className="text-[13px] text-suave">30 a 60 segundos com documentos reais</p></div>
            </div>
            <div className="h-1 rounded-full bg-fundo-2 mt-5 overflow-hidden"><div className="h-full bg-ouro transition-all duration-700" style={{ width: `${(etapa / 4) * 100}%` }} /></div>
            <ol className="mt-6 space-y-3">
              {ETAPAS.map((e, i) => (
                <li key={e} className="flex items-center gap-3 text-[14px]">
                  {i < etapa ? <span className="size-5 rounded-full bg-tinta text-white grid place-items-center"><Check size={12} /></span>
                    : <span className={clsx('size-5 rounded-full border-2', i === etapa ? 'border-ouro animate-pulse' : 'border-linha-forte')} />}
                  <span className={i <= etapa ? 'text-tinta' : 'text-tenue'}>{e}</span>
                  <span className="ml-auto text-[13px] text-suave">
                    {i === 0 && etapa > 0 && `${referenciasEncomenda(enc)} referências em ${enc.modelos.length} modelos`}
                    {i === 1 && etapa > 1 && '6 campos · 7 páginas'}
                    {i === 2 && etapa > 2 && '1 modelo com tech pack'}
                    {i === 3 && etapa > 3 && '3 decisões'}
                  </span>
                </li>
              ))}
            </ol>
          </Cartao>
        </div>
      )}

      {/* ---------- 3. Ligação ---------- */}
      {passo === 2 && (
        <div className="grid grid-cols-[1fr_1.15fr] gap-5 items-start">
          <TechPack nome={pdf?.nome ?? 'SHIRT MAO.pdf'} url={exemplo ? undefined : pdf?.url} pagina={1} setPagina={setPagina} />
          <div className="space-y-4">
            <ResumoEncomenda enc={enc} />
            <Cartao>
              <div className="px-5 pt-5 pb-3">
                <h3 className="text-[16px] font-semibold">Ligação encomenda ↔ tech pack</h3>
                <p className="text-[13px] text-suave">A IA propõe a que modelo pertence cada tech pack. Confirme ou corrija.</p>
              </div>
              <div className="divide-y divide-linha">
                {enc.modelos.map((m) => (
                  <div key={m.id} className="grid grid-cols-[1fr_90px_190px] items-center gap-3 px-5 py-2.5">
                    <div><p className="text-[14px]">{m.nome}{m.alias && <span className="text-suave"> ({m.alias})</span>}</p><p className="text-[12px] text-tenue">{m.variantes.map((v) => v.ref).join(' · ')}</p></div>
                    <span className="text-[13px] text-suave num text-right">{int(pecasModelo(m))} peças</span>
                    <Seletor className="[&_select]:h-8 [&_select]:text-[13px]" valor={ligacoes[m.id] ?? ''} onChange={(v) => setLigacoes({ ...ligacoes, [m.id]: v })}
                      vazio="Sem tech pack" opcoes={ficheiros.filter((f) => f.tipo === 'pdf').map((f) => f.nome)} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end px-5 py-4 border-t border-linha">
                <Botao variante="primario" icone={<Check size={15} />} onClick={() => { setPasso(3); setPagina(2) }}>Confirmar ligação</Botao>
              </div>
            </Cartao>
          </div>
        </div>
      )}

      {/* ---------- 4. Rever e gerar ---------- */}
      {passo === 3 && (
        <div className="grid grid-cols-[1fr_1.15fr] gap-5 items-start">
          <TechPack nome={pdf?.nome ?? 'SHIRT MAO.pdf'} url={exemplo ? undefined : pdf?.url} pagina={pagina} setPagina={setPagina} destaque={destaque} />
          <div className="space-y-4">
            {pendentes > 0
              ? <div className="rounded-cartao border border-ambar-borda bg-ambar-fraco px-5 py-4 flex gap-3"><AlertTriangle size={17} className="text-ambar mt-0.5" /><div><p className="font-semibold text-[14px]">{pendentes} {pendentes === 1 ? 'decisão' : 'decisões'} por tomar.</p><p className="text-[13px] text-tinta-2">Já vêm sugeridas. Aceite ou altere antes de gerar as fichas.</p></div></div>
              : <div className="rounded-cartao border border-verde-borda bg-verde-fraco px-5 py-4 flex gap-3"><CircleCheck size={17} className="text-verde mt-0.5" /><p className="font-semibold text-[14px]">Decisões tomadas. Pode gerar as fichas.</p></div>}

            <ResumoEncomenda enc={enc} ligacoes={ligacoes} />

            <Cartao className="p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h3 className="text-[16px] font-semibold">Chemise Janet · lido do tech pack</h3>
                <span className="text-[12px] text-suave">{Object.values(confirmados).filter(Boolean).length} / {leituraShirtMao.campos.length} confirmados</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                {leituraShirtMao.campos.map((c) => {
                  const pag = Number(c.pagina.match(/\d+/)?.[0] ?? 1)
                  const ok = confirmados[c.campo]
                  return (
                    <div key={c.campo} onMouseEnter={() => { setPagina(pag); setDestaque(true) }} onMouseLeave={() => setDestaque(false)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-medium">{c.campo}</span>
                        <span className="flex items-center gap-2 text-[12px] text-tenue">{c.pagina}<Confianca nivel={c.confianca} /></span>
                      </div>
                      <div className={clsx('flex items-center gap-2 h-10 pl-3 pr-2 rounded-controlo border bg-papel',
                        ok ? 'border-verde-borda' : c.confianca === 'baixa' ? 'border-vermelho-borda' : 'border-ouro/50')}>
                        <span className="flex-1 text-[14px] truncate" title={c.valor}>{c.valor}</span>
                        <EtiquetaIA />
                        <button onClick={() => setConfirmados({ ...confirmados, [c.campo]: !ok })} title="Confirmar"
                          className={clsx('size-6 rounded grid place-items-center', ok ? 'bg-verde text-white' : 'text-tenue hover:text-tinta')}><Check size={13} /></button>
                      </div>
                      {c.confianca === 'baixa' && !ok && <p className="text-[12px] text-vermelho mt-1">A IA não tem a certeza — confirme com o documento.</p>}
                    </div>
                  )
                })}
              </div>
            </Cartao>

            <div>
              <h3 className="text-[16px] font-semibold">Decisões</h3>
              <p className="text-[13px] text-suave mb-3">Onde o tech pack e a produção não coincidem.</p>
              <div className="space-y-3">
                {leituraShirtMao.decisoes.map((d) => {
                  const e = escolhas[d.id]
                  return (
                    <div key={d.id} className={clsx('rounded-cartao border p-4', e.estado === 'pendente' ? 'bg-ouro-fraco/60 border-ouro/40' : 'bg-papel border-linha')}>
                      <div className="flex items-start gap-3">
                        <EtiquetaIA />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-[14px] font-semibold">{d.titulo}</p>
                            <span className="flex items-center gap-1.5 text-[12px] text-suave"><Confianca nivel={d.confianca} />Confiança {d.confianca === 'media' ? 'média' : d.confianca}{d.confianca === 'baixa' && ' — rever'}</span>
                          </div>
                          <p className="text-[13px] text-tinta-2 mt-1">{d.explicacao}</p>
                          <p className="text-[12px] text-suave mt-2">Fonte: <span className="text-tinta-2 font-medium">{d.fonte}</span>
                            <button onClick={() => setPorque(porque === d.id ? null : d.id)} className="ml-3 inline-flex items-center gap-0.5 hover:text-tinta">Porquê <ChevronDown size={12} /></button></p>
                          {porque === d.id && <p className="text-[13px] text-tinta-2 mt-2 pl-3 border-l-2 border-ouro">{d.porque}</p>}

                          {e.estado === 'pendente' ? (
                            <div className="flex items-center gap-2 mt-3">
                              <Botao pequeno variante="primario" icone={<Check size={14} />} onClick={() => escolher(d.id, { estado: 'aceite' })}>Aceitar</Botao>
                              {d.id === 'tecido' ? (
                                <Seletor className="w-56 [&_select]:h-8 [&_select]:text-[13px]" valor="" vazio="Alterar: outro tecido…" onChange={(v) => v && escolher('tecido', { estado: 'alterada', valor: v })} opcoes={tecidos.map((t) => t.nome)} />
                              ) : (
                                <Botao pequeno variante="fantasma" icone={<Pencil size={13} />} onClick={() => escolher(d.id, { estado: 'alterada' })}>{d.alternativa}</Botao>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 mt-3 text-[13px]">
                              <Etiqueta tom={e.estado === 'aceite' ? 'verde' : 'azul'}>{e.estado === 'aceite' ? 'Aceite' : `Alterada${e.valor ? `: ${e.valor}` : `: ${d.alternativa.toLowerCase()}`}`}</Etiqueta>
                              <button onClick={() => escolher(d.id, { estado: 'pendente' })} className="text-suave hover:text-tinta">Desfazer</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ResumoEncomenda({ enc, ligacoes }: { enc: ReturnType<typeof encomendaImprevu>; ligacoes?: Record<string, string> }) {
  const total = enc.preEncomenda + enc.stock
  return (
    <Cartao className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[16px] font-semibold">Encomenda {enc.cliente} · {enc.colecao}</h3>
          <p className="text-[13px] text-suave">{referenciasEncomenda(enc)} referências · {int(enc.preEncomenda)} pré-encomenda + {enc.stock} stock · {eur(valorEncomenda(enc)).replace(',00', '')}</p>
        </div>
        <Etiqueta tom="azul">{int(total)} peças</Etiqueta>
      </div>
      {ligacoes && (
        <div className="mt-3 divide-y divide-linha">
          {enc.modelos.map((m) => (
            <div key={m.id} className="grid grid-cols-[1fr_100px_90px_130px] items-center py-2 text-[14px]">
              <span>{m.nome}{m.alias && ` (${m.alias})`}</span>
              <span className="text-[13px] text-suave text-right">{m.variantes.length} {m.variantes.length === 1 ? 'referência' : 'referências'}</span>
              <span className="text-[13px] text-suave text-right num">{int(pecasModelo(m))} peças</span>
              <span className="text-right">{ligacoes[m.id] ? <Etiqueta tom="verde">Tech pack ligado</Etiqueta> : <Etiqueta>Sem tech pack</Etiqueta>}</span>
            </div>
          ))}
        </div>
      )}
    </Cartao>
  )
}
