import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ExternalLink, FileUp, Flag, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Botao, Cabecalho, Cartao, Modal, Vazio, aviso } from '../components/ui'
import { lerComIA } from '../lib/ia'
import { sheetsDisponivel } from '../lib/sheets'
import {
  INTERVALOS, abrirProducao, escreverProducao, folhaProducao, jaPreenchidos, normalizarDia, totalDia,
  type DiaProducao, type Livro,
} from '../lib/producao'
import { modoServidor } from '../lib/supabase'
import { useDb } from '../store/db'

const diaSemana = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'short' })
const hojeISO = () => new Date().toISOString().slice(0, 10)

export default function Producao() {
  const log = useDb((s) => s.log)
  const [dias, setDias] = useState<DiaProducao[]>([])
  const [aLer, setALer] = useState('')
  const [erro, setErro] = useState('')
  const [livro, setLivro] = useState<Livro | null>(null)
  const [existentes, setExistentes] = useState<Record<string, number>>({})
  const [aEscrever, setAEscrever] = useState(false)
  const [feito, setFeito] = useState<{ link: string; escritos: string[]; semLinha: string[] } | null>(null)
  const [idFolha, setIdFolha] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { void folhaProducao().then(setIdFolha) }, [])

  const ler = async (fl: FileList | null) => {
    if (!fl?.length) return
    setErro(''); setFeito(null)
    const novos: DiaProducao[] = []
    for (const f of Array.from(fl)) {
      setALer(`A ler ${f.name} com IA…`)
      try {
        const r = await lerComIA<{ dias: DiaProducao[] }>(f, 'producao', `Ano: ${new Date().getFullYear()}. Hoje: ${hojeISO()}.`)
        novos.push(...r.dados.dias.map(normalizarDia))
      } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
    }
    setALer('')
    setDias((d) => [...d.filter((x) => !novos.some((n) => n.data === x.data)), ...novos].sort((a, b) => a.data.localeCompare(b.data)))
    if (novos.length) log('Folha de produção lida', `${novos.length} dia(s): ${novos.map((d) => d.data).join(', ')}`)
  }

  const mudarDia = (i: number, f: (d: DiaProducao) => DiaProducao) => setDias((ds) => ds.map((d, k) => (k === i ? f(d) : d)))
  const novoDia = () => setDias((ds) => [...ds, normalizarDia({ data: hojeISO(), horas: [], modelos: '', totalEscrito: null, observacoes: [], confianca: 'alta' })])

  // abrir a folha Google (no clique) e ver se os dias já têm valores
  const preparar = async () => {
    if (!idFolha) return
    try {
      const l = await abrirProducao(idFolha)
      setLivro(l)
      setExistentes(await jaPreenchidos(l, dias))
    } catch (e) { aviso(e instanceof Error ? e.message : String(e)) }
  }
  const escrever = async () => {
    if (!livro) return
    setAEscrever(true)
    try {
      const r = await escreverProducao(livro, dias)
      setFeito(r)
      log('Produção passada para o Google Sheets', `${livro.titulo} · ${r.escritos.length} dia(s)`)
    } catch (e) { aviso(`Não foi possível escrever: ${e instanceof Error ? e.message : String(e)}`) } finally { setAEscrever(false) }
  }

  if (!modoServidor) return <><Cabecalho sobre="Produção" titulo="Produção diária" /><Vazio>Disponível no site publicado (com servidor).</Vazio></>

  return (
    <>
      <Cabecalho sobre="Produção" titulo="Produção diária"
        sub="Carregue a fotografia da folha escrita à mão: a IA lê as peças por hora e os modelos de cada dia. Reveja e passe para a folha Google da produção."
        acoes={<>
          <Botao icone={<Plus size={15} />} onClick={novoDia}>Dia à mão</Botao>
          <Botao variante="primario" icone={<FileUp size={15} />} disabled={!!aLer} onClick={() => input.current?.click()}>Carregar folha</Botao>
          <input ref={input} type="file" hidden multiple accept="image/*,.pdf" onChange={(e) => { void ler(e.target.files); e.target.value = '' }} />
        </>} />

      {aLer && <p className="mb-4 text-[13px] text-tinta-2 flex items-center gap-2"><RefreshCw size={13} className="animate-spin" />{aLer}</p>}
      {erro && <p className="mb-4 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}

      {dias.length === 0 ? <Cartao><Vazio>Carregue a fotografia da folha de produção (pode ser mais do que uma).</Vazio></Cartao> : (
        <>
          <Cartao className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-b border-linha">
                <th className="text-left px-4 py-2.5">Data</th>
                {INTERVALOS.map((i) => <th key={i} className="text-center px-1">{i}</th>)}
                <th className="text-right px-2">Produção</th><th className="text-left px-2">Modelo</th><th />
              </tr></thead>
              <tbody>
                {dias.map((d, i) => {
                  const total = totalDia(d)
                  const difere = d.totalEscrito != null && d.totalEscrito !== total
                  return (
                    <tr key={i} className={clsx('border-b border-linha last:border-0', d.confianca === 'baixa' && 'bg-ambar-fraco/40')}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <input type="date" value={d.data} onChange={(e) => mudarDia(i, (x) => ({ ...x, data: e.target.value }))} className="bg-transparent outline-none" />
                        <span className="block text-[11px] text-tenue">{diaSemana(d.data)}{existentes[d.data] ? ` · já tem ${existentes[d.data]} peças` : ''}</span>
                      </td>
                      {d.horas.map((h, k) => (
                        <td key={k} className="px-1 py-2 text-center">
                          <div className={clsx('inline-flex flex-col items-center rounded', h.fimModelo && 'bg-[#fce5cd]')}>
                            <input inputMode="numeric" value={h.pecas ?? ''} onChange={(e) => mudarDia(i, (x) => ({ ...x, horas: x.horas.map((y, j) => (j === k ? { ...y, pecas: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) } : y)) }))}
                              className="w-12 text-center bg-transparent border border-linha rounded px-1 py-0.5 num" />
                            <button title="Fim de modelo nesta hora (laranja)" onClick={() => mudarDia(i, (x) => ({ ...x, horas: x.horas.map((y, j) => (j === k ? { ...y, fimModelo: !y.fimModelo } : y)) }))}
                              className={clsx('mt-0.5', h.fimModelo ? 'text-[#c0661a]' : 'text-tenue/50 hover:text-tenue')}><Flag size={11} /></button>
                          </div>
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right num font-medium">
                        {total}
                        {difere && <span className="block text-[11px] text-vermelho" title="O total escrito na folha não bate com a soma das horas">folha: {d.totalEscrito}</span>}
                      </td>
                      <td className="px-2 py-2"><input value={d.modelos} onChange={(e) => mudarDia(i, (x) => ({ ...x, modelos: e.target.value }))} className="w-56 bg-transparent border border-linha rounded px-2 py-0.5" /></td>
                      <td className="pr-3"><button onClick={() => setDias((ds) => ds.filter((_, k) => k !== i))} className="text-tenue hover:text-vermelho"><Trash2 size={14} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Cartao>
          <p className="text-[12px] text-tenue mt-2">A bandeira marca o fim de um modelo nessa hora (fica a laranja na folha). Linhas a amarelo: leitura com dúvidas, conferir com a folha.</p>
          <div className="mt-4 flex gap-2">
            {sheetsDisponivel && <Botao variante="primario" disabled={!idFolha} onClick={preparar}>Passar para o Google Sheets</Botao>}
          </div>
        </>
      )}

      {livro && (
        <Modal aberto onFechar={() => { setLivro(null); setFeito(null) }} titulo="Passar para o Google Sheets" sub={livro.titulo}
          rodape={feito ? <>
            <Botao variante="fantasma" onClick={() => { setLivro(null); setFeito(null) }}>Fechar</Botao>
            <a href={feito.link} target="_blank" rel="noreferrer"><Botao variante="primario" icone={<ExternalLink size={15} />}>Abrir a folha</Botao></a>
          </> : <>
            <Botao variante="fantasma" onClick={() => setLivro(null)}>Cancelar</Botao>
            <Botao variante="primario" disabled={aEscrever} onClick={escrever}>{aEscrever ? 'A escrever…' : `Escrever ${dias.length} dia(s)`}</Botao>
          </>}>
          {feito ? (
            <div className="text-[14px] space-y-2">
              <p>Escritos {feito.escritos.length} dia(s) na folha do mês.</p>
              {feito.semLinha.length > 0 && <p className="text-ambar">Sem linha na folha para: {feito.semLinha.join(', ')} (fim de semana ou dia que não existe na folha).</p>}
            </div>
          ) : (
            <div className="text-[14px] space-y-2">
              <p>Vai escrever, na folha de cada mês, as peças por hora, o modelo e o total de: {dias.map((d) => d.data.split('-').reverse().slice(0, 2).join('/')).join(', ')}.</p>
              {Object.keys(existentes).length > 0 && (
                <p className="text-ambar flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />Já há valores em {Object.keys(existentes).map((k) => k.split('-').reverse().slice(0, 2).join('/')).join(', ')}: serão substituídos.</p>
              )}
              <p className="text-[13px] text-suave">O Google guarda o histórico de versões (Ficheiro → Histórico de versões), se for preciso voltar atrás.</p>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
