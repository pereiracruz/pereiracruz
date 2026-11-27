import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ChevronDown, ChevronRight, Download, ExternalLink, FileUp, RefreshCw, Save, Users } from 'lucide-react'
import { Botao, Cabecalho, Cartao, Modal, Vazio, aviso } from '../components/ui'
import { lerComIA } from '../lib/ia'
import { sheetsDisponivel } from '../lib/sheets'
import {
  MESES, REGRAS_INICIAIS, abrirFaltas, calcularMes, daLeituraIA, diaSemana, diasUteis, escreverFaltas, folhaFaltas, guardarMes,
  horasTexto, juntarRelogio, lerHoras, lerMes, lerResumoRelogio, nomeFolhaMes, periodoRelogio, pessoasDaFolha,
  type AjustePessoa, type LinhaFaltas, type LivroFaltas, type MesFaltas, type PicagensLidas, type TipoAusencia,
} from '../lib/faltas'
import { modoServidor } from '../lib/supabase'
import { useDb } from '../store/db'

const eur = (n: number) => `${n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const ddmm = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const numero = (s: string) => { const n = Number(s.replace(/[^\d,.-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

function mesAnterior(ano: number, mes: number) { return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 } }
function mesPorOmissao() { const d = new Date(); return d.getDate() >= 20 ? { ano: d.getFullYear(), mes: d.getMonth() + 1 } : mesAnterior(d.getFullYear(), d.getMonth() + 1) }
const idMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`

/** Cabeçalho igual ao da folha «Faltas- 2026» (colunas A…AE). */
const CABECALHO = ['Nº', 'NOME', 'Faltas', 'Horas- Semana', 'Horas- Sábado', 'Balanço a Contabilizar', 'Falta', 'Tipo de hora', 'Valor', 'Extras', 'Banco de horas', 'Observações', 'Dias', 'Prémio', 'Salário base', 'Salário/hora', 'Faltas', 'Subs. Alimentação', 'Dias úteis', 'Total', 'Taxa retenção irs', 'Retenção irs', 'Contribuição SS (11%)', 'SS- Encargo Empresa (23,75%)', 'Vencimento líquido', 'A pagar', 'Mapa KM', 'Baixa', 'Valor baixa', 'Custo para a empresa', 'Acidentes de Trabalho']

export default function Faltas() {
  const log = useDb((s) => s.log)
  const [{ ano, mes }, setMes] = useState(mesPorOmissao)
  const [m, setM] = useState<MesFaltas | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const [aLer, setALer] = useState('')
  const [erro, setErro] = useState('')
  const [alterado, setAlterado] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [livro, setLivro] = useState<LivroFaltas | null>(null)
  const [aEscrever, setAEscrever] = useState(false)
  const [link, setLink] = useState('')
  const [verPessoas, setVerPessoas] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setACarregar(true); setErro(''); setM(null); setAlterado(false)
    void lerMes(idMes(ano, mes)).then((x) => { setM(x); setACarregar(false) })
  }, [ano, mes])

  const linhas = useMemo(() => (m ? calcularMes(m) : []), [m])
  const periodo = m ? periodoRelogio(m) : null
  const uteis = diasUteis(ano, mes)
  const ultimoUtil = uteis[uteis.length - 1]
  const avisos = linhas.reduce((s, l) => s + l.avisos.length, 0)

  const mudar = (f: (x: MesFaltas) => MesFaltas) => { setM((x) => (x ? f(x) : x)); setAlterado(true) }
  const ajustar = (numero: string, f: (a: AjustePessoa) => AjustePessoa) =>
    mudar((x) => ({ ...x, ajustes: { ...x.ajustes, [numero]: f(x.ajustes[numero] ?? { ausencias: {}, confirmados: {} }) } }))

  const guardar = async (x = m) => {
    if (!x) return
    try { setM(await guardarMes(x)); setAlterado(false) } catch (e) { aviso(`Não foi possível guardar: ${e instanceof Error ? e.message : String(e)}`) }
  }

  // começar o mês: as pessoas (salário, subsídio, taxa de IRS, banco de horas) vêm da folha do mês anterior
  const comecar = async () => {
    setErro('')
    try {
      const l = await abrirFaltas(await folhaFaltas())
      const ant = mesAnterior(ano, mes)
      const nomeAnt = nomeFolhaMes(ant.ano, ant.mes)
      if (!l.folhas.some((f) => f.nome === nomeAnt)) throw new Error(`Não encontrei a folha «${nomeAnt}» em «${l.titulo}».`)
      const pessoas = await pessoasDaFolha(l, nomeAnt)
      const novo: MesFaltas = { id: idMes(ano, mes), ano, mes, regras: { ...REGRAS_INICIAIS }, pessoas, relogio: m?.relogio ?? [], ajustes: m?.ajustes ?? {}, atualizadoEm: '' }
      setM(novo); await guardar(novo)
      log('Faltas: mês iniciado', `${MESES[mes - 1]} ${ano} · ${pessoas.length} pessoas de «${nomeAnt}»`)
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }

  const lerRelogio = async (fl: FileList | null) => {
    if (!fl?.length || !m) return
    setErro('')
    let rel = m.relogio
    for (const f of Array.from(fl)) {
      try {
        if (/\.(xls|xlsx|csv)$/i.test(f.name)) {
          setALer(`A ler ${f.name}…`)
          rel = juntarRelogio(rel, await lerResumoRelogio(f))
        } else {
          setALer(`A ler as picagens de ${f.name} com IA…`)
          const r = await lerComIA<PicagensLidas>(f, 'picagens', `Mês: ${MESES[mes - 1]} ${ano}.`)
          rel = juntarRelogio(rel, daLeituraIA(r.dados))
        }
        log('Faltas: relógio de ponto lido', `${f.name} · ${MESES[mes - 1]} ${ano}`)
      } catch (e) { setErro(`${f.name}: ${e instanceof Error ? e.message : String(e)}`) }
    }
    setALer('')
    const novo = { ...m, relogio: rel }
    setM(novo); await guardar(novo)
  }

  const preparar = async () => {
    try { setLink(''); setLivro(await abrirFaltas(await folhaFaltas())) } catch (e) { aviso(e instanceof Error ? e.message : String(e)) }
  }
  const escrever = async () => {
    if (!livro || !m) return
    setAEscrever(true)
    try {
      const ant = mesAnterior(ano, mes)
      const url = await escreverFaltas(livro, ano, mes, linhas, nomeFolhaMes(ant.ano, ant.mes))
      setLink(url)
      await guardar(m)
      log('Faltas passadas para o Google Sheets', `${nomeFolhaMes(ano, mes)} · ${linhas.length} pessoas`)
    } catch (e) { aviso(`Não foi possível escrever: ${e instanceof Error ? e.message : String(e)}`) } finally { setAEscrever(false) }
  }

  if (!modoServidor) return <><Cabecalho sobre="Financeiro" titulo="Faltas" /><Vazio>Disponível no site publicado (com servidor).</Vazio></>

  const totais = {
    Q: linhas.reduce((s, l) => s + l.faltasEur, 0), T: linhas.reduce((s, l) => s + l.subsidio, 0), V: linhas.reduce((s, l) => s + l.irs, 0),
    W: linhas.reduce((s, l) => s + l.ss, 0), X: linhas.reduce((s, l) => s + l.ssEmpresa, 0), Y: linhas.reduce((s, l) => s + l.liquido, 0),
    AA: linhas.reduce((s, l) => s + l.km, 0), AC: linhas.reduce((s, l) => s + l.baixaEur, 0), AD: linhas.reduce((s, l) => s + l.custo, 0),
    AE: linhas.reduce((s, l) => s + l.acidentes, 0), N: linhas.reduce((s, l) => s + l.premio, 0), O: linhas.reduce((s, l) => s + l.salarioBase, 0),
  }

  return (
    <>
      <Cabecalho sobre="Financeiro" titulo="Faltas"
        sub="Carregue a exportação do relógio de ponto (Excel) ou o relatório de picagens (PDF). A aplicação calcula faltas, banco de horas e vencimentos, mostra a folha do mês tal como fica no Drive e só escreve quando confirmar."
        acoes={<>
          <select value={`${ano}-${mes}`} onChange={(e) => { const [a, b] = e.target.value.split('-').map(Number); setMes({ ano: a, mes: b }) }}
            className="h-10 px-3 rounded-controlo border border-linha bg-papel text-[14px]">
            {Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1 - i); return { a: d.getFullYear(), b: d.getMonth() + 1 } })
              .map(({ a, b }) => <option key={`${a}-${b}`} value={`${a}-${b}`}>{MESES[b - 1]} {a}</option>)}
          </select>
          {m && <Botao icone={<Users size={15} />} onClick={() => setVerPessoas(true)}>Pessoas</Botao>}
          {m && <Botao variante="primario" icone={<FileUp size={15} />} disabled={!!aLer} onClick={() => input.current?.click()}>Carregar relógio</Botao>}
          <input ref={input} type="file" hidden multiple accept=".xls,.xlsx,.csv,.pdf,image/*" onChange={(e) => { void lerRelogio(e.target.files); e.target.value = '' }} />
        </>} />

      {aLer && <p className="mb-4 text-[13px] text-tinta-2 flex items-center gap-2"><RefreshCw size={13} className="animate-spin" />{aLer}</p>}
      {erro && <p className="mb-4 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}

      {aCarregar ? <Cartao><Vazio>A carregar…</Vazio></Cartao> : !m ? (
        <Cartao className="p-6 text-[14px] space-y-3">
          <p>Ainda não há faltas de <b>{MESES[mes - 1]} {ano}</b> na aplicação.</p>
          <p className="text-suave">Para começar, a aplicação lê as pessoas da folha <b>{nomeFolhaMes(mesAnterior(ano, mes).ano, mesAnterior(ano, mes).mes)}</b> (número, nome, salário base, subsídio de alimentação, taxa de IRS e banco de horas). Depois carrega o relógio de ponto.</p>
          {sheetsDisponivel ? <Botao variante="primario" icone={<Download size={15} />} onClick={comecar}>Começar {MESES[mes - 1]}</Botao> : <p className="text-ambar">O acesso ao Google não está configurado neste site.</p>}
        </Cartao>
      ) : (
        <>
          <Cartao className="p-4 mb-4 text-[13px] flex flex-wrap gap-x-6 gap-y-2 items-center">
            <span><b>{uteis.length}</b> dias úteis em {MESES[mes - 1].toLowerCase()}</span>
            <span>Relógio: {periodo ? <>de <b>{ddmm(periodo[0])}</b> a <b>{ddmm(periodo[1])}</b></> : <span className="text-ambar">por carregar</span>}
              {periodo && periodo[1] < ultimoUtil && <span className="text-ambar"> (o mês vai até {ddmm(ultimoUtil)}: carregue o resto quando tiver)</span>}</span>
            <label className="flex items-center gap-1.5">Horas extra de
              <input type="date" value={m.regras.extraDe ?? ''} onChange={(e) => mudar((x) => ({ ...x, regras: { ...x.regras, extraDe: e.target.value || null } }))} className="border border-linha rounded px-1.5 py-0.5" />
              a <input type="date" value={m.regras.extraAte ?? ''} onChange={(e) => mudar((x) => ({ ...x, regras: { ...x.regras, extraAte: e.target.value || null } }))} className="border border-linha rounded px-1.5 py-0.5" />
            </label>
            <label className="flex items-center gap-1.5">Tolerância
              <input inputMode="numeric" value={m.regras.tolerancia} onChange={(e) => mudar((x) => ({ ...x, regras: { ...x.regras, tolerancia: Number(e.target.value.replace(/\D/g, '')) || 0 } }))} className="w-10 border border-linha rounded px-1.5 py-0.5 text-center" /> min
            </label>
            {avisos > 0 && <span className="text-ambar flex items-center gap-1"><AlertTriangle size={14} />{avisos} picagem(ns) a confirmar (abra a pessoa)</span>}
            <span className="flex-1" />
            {alterado && <Botao pequeno icone={<Save size={14} />} onClick={() => guardar()}>Guardar</Botao>}
          </Cartao>

          <Cartao className="overflow-x-auto">
            <table className="text-[12px] whitespace-nowrap border-collapse">
              <thead>
                <tr><th colSpan={CABECALHO.length + 1} className="text-left px-3 py-2 text-[14px] font-semibold">Faltas {MESES[mes - 1]} {ano}</th></tr>
                <tr className="bg-fundo text-[11px] text-tinta-2">
                  <th />{CABECALHO.map((c, i) => <th key={i} className="border border-linha px-2 py-1.5 font-semibold text-center">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => <LinhaFolha key={l.pessoa.numero} l={l} aberta={aberta === l.pessoa.numero} abrir={() => setAberta(aberta === l.pessoa.numero ? null : l.pessoa.numero)}
                  ajuste={m.ajustes[l.pessoa.numero] ?? { ausencias: {}, confirmados: {} }} ajustar={(f) => ajustar(l.pessoa.numero, f)} />)}
                <tr><td colSpan={CABECALHO.length + 1} className="h-4" /></tr>
                <tr className="font-semibold bg-fundo">
                  <td /><td className="border border-linha px-2" /><td className="border border-linha px-2">TOTAIS</td>
                  {Array.from({ length: 11 }, (_, i) => <td key={i} className="border border-linha" />)}
                  <C v={eur(totais.N)} /><C v={eur(totais.O)} /><td className="border border-linha" /><C v={eur(totais.Q)} /><td className="border border-linha" /><td className="border border-linha" />
                  <C v={eur(totais.T)} /><td className="border border-linha" /><C v={eur(totais.V)} /><C v={eur(totais.W)} /><C v={eur(totais.X)} /><C v={eur(totais.Y)} /><td className="border border-linha" />
                  <C v={eur(totais.AA)} /><td className="border border-linha" /><C v={eur(totais.AC)} /><C v={eur(totais.AD)} /><C v={eur(totais.AE)} />
                </tr>
              </tbody>
            </table>
          </Cartao>
          <p className="text-[12px] text-tenue mt-2">Clique no nome para ver os dias, confirmar picagens esquecidas e marcar ausências como baixa, férias ou falta justificada. Os campos com contorno (prémio, salário, subsídio, taxa de IRS, KM, baixa, observações) podem ser alterados.</p>
          <div className="mt-4 flex gap-2">
            {sheetsDisponivel && <Botao variante="primario" disabled={!linhas.length} onClick={preparar}>Passar para o Drive</Botao>}
          </div>
        </>
      )}

      {verPessoas && m && (
        <Modal aberto largura="max-w-2xl" onFechar={() => setVerPessoas(false)} titulo="Pessoas do mês" sub="Quem entra nas contas e quem não pica o ponto (conta como presente)"
          rodape={<Botao variante="primario" onClick={() => { setVerPessoas(false); void guardar() }}>Fechar</Botao>}>
          <table className="w-full text-[13px]">
            <thead><tr className="text-[11px] uppercase text-suave border-b border-linha"><th className="text-left py-1.5">Nº</th><th className="text-left">Nome</th><th>Conta</th><th>Pica o ponto</th></tr></thead>
            <tbody>{m.pessoas.map((p, i) => (
              <tr key={p.numero} className="border-b border-linha last:border-0">
                <td className="py-1.5 num">{p.numero}</td><td>{p.nome}</td>
                <td className="text-center"><input type="checkbox" checked={p.ativa} onChange={(e) => mudar((x) => ({ ...x, pessoas: x.pessoas.map((y, k) => (k === i ? { ...y, ativa: e.target.checked } : y)) }))} /></td>
                <td className="text-center"><input type="checkbox" checked={p.picaPonto} onChange={(e) => mudar((x) => ({ ...x, pessoas: x.pessoas.map((y, k) => (k === i ? { ...y, picaPonto: e.target.checked } : y)) }))} /></td>
              </tr>
            ))}</tbody>
          </table>
          {m.relogio.filter((r) => !m.pessoas.some((p) => parseInt(p.numero, 10) === parseInt(r.numero, 10))).length > 0 && (
            <p className="mt-3 text-[13px] text-ambar">No relógio mas não na folha: {m.relogio.filter((r) => !m.pessoas.some((p) => parseInt(p.numero, 10) === parseInt(r.numero, 10))).map((r) => `${r.numero} ${r.nome}`).join(', ')}.</p>
          )}
        </Modal>
      )}

      {livro && m && (
        <Modal aberto onFechar={() => setLivro(null)} titulo="Passar para o Drive" sub={livro.titulo}
          rodape={link ? <>
            <Botao variante="fantasma" onClick={() => setLivro(null)}>Fechar</Botao>
            <a href={link} target="_blank" rel="noreferrer"><Botao variante="primario" icone={<ExternalLink size={15} />}>Abrir a folha</Botao></a>
          </> : <>
            <Botao variante="fantasma" onClick={() => setLivro(null)}>Cancelar</Botao>
            <Botao variante="primario" disabled={aEscrever} onClick={escrever}>{aEscrever ? 'A escrever…' : `Escrever ${linhas.length} pessoas`}</Botao>
          </>}>
          {link ? <p className="text-[14px]">A folha «{nomeFolhaMes(ano, mes)}» ficou preenchida, com as fórmulas e os totais.</p> : (
            <div className="text-[14px] space-y-2">
              {livro.folhas.some((f) => f.nome === nomeFolhaMes(ano, mes))
                ? <p className="text-ambar flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />A folha «{nomeFolhaMes(ano, mes)}» já existe: as linhas das pessoas e os totais serão substituídos.</p>
                : <p>Vai criar a folha «{nomeFolhaMes(ano, mes)}» a partir de «{nomeFolhaMes(mesAnterior(ano, mes).ano, mesAnterior(ano, mes).mes)}» (mesma formatação) e preenchê-la com {linhas.length} pessoas.</p>}
              {avisos > 0 && <p className="text-ambar">Há {avisos} picagem(ns) por confirmar.</p>}
              {periodo && periodo[1] < ultimoUtil && <p className="text-ambar">O relógio só vai até {ddmm(periodo[1])}.</p>}
              <p className="text-[13px] text-suave">O Google guarda o histórico de versões (Ficheiro → Histórico de versões), se for preciso voltar atrás.</p>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

const C = ({ v, className }: { v: ReactNode; className?: string }) => <td className={clsx('border border-linha px-2 py-1 text-right num', className)}>{v}</td>

function Editavel({ valor, onChange, largura = 'w-16', texto }: { valor: string; onChange: (v: string) => void; largura?: string; texto?: boolean }) {
  const [v, setV] = useState(valor)
  useEffect(() => setV(valor), [valor])
  return <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== valor && onChange(v)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    className={clsx(largura, 'border border-ouro/50 rounded px-1 py-0.5 bg-transparent', !texto && 'text-right num')} />
}
const n2 = (n: number) => n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function LinhaFolha({ l, aberta, abrir, ajuste, ajustar }: { l: LinhaFaltas; aberta: boolean; abrir: () => void; ajuste: AjustePessoa; ajustar: (f: (a: AjustePessoa) => AjustePessoa) => void }) {
  const balanco = l.extraSemana + l.extraSabado - l.faltaMin
  const td = 'border border-linha px-2 py-1'
  return (
    <>
      <tr className={clsx('hover:bg-fundo/60', l.avisos.length > 0 && 'bg-ambar-fraco/40')}>
        <td className="px-1"><button onClick={abrir} className="text-tenue">{aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
        <td className={clsx(td, 'num')}>{l.pessoa.numero}</td>
        <td className={td}><button onClick={abrir} className="hover:underline text-left">{l.pessoa.nome}</button>{!l.pessoa.picaPonto && <span className="ml-1 text-[10px] text-tenue">(não pica)</span>}{l.avisos.length > 0 && <AlertTriangle size={12} className="inline ml-1 text-ambar" />}</td>
        <td className={td}>{l.faltaMin > 0 ? horasTexto(l.faltaMin) : 's/faltas'}</td>
        <td className={td}>{l.extraSemana > 0 ? horasTexto(l.extraSemana) : '-'}</td>
        <td className={td}>{l.extraSabado > 0 ? horasTexto(l.extraSabado) : ''}</td>
        <td className={td}>{balanco === 0 ? '-' : `${balanco < 0 ? '-' : ''}${horasTexto(Math.abs(balanco))}`}</td>
        <C v={l.horasFalta > 0 ? n2(l.horasFalta) : ''} />
        <td className={td}>{l.extraSemana + l.extraSabado > 0 ? 'Banco de horas' : 'N/A'}</td>
        <td className={td}>-</td><td className={td}>-</td>
        <td className={td}>{horasTexto(l.bancoFinal)}</td>
        <td className={td}><Editavel texto largura="w-56" valor={l.obs} onChange={(v) => ajustar((a) => ({ ...a, obs: v }))} /></td>
        <C v="30" />
        <C v={<Editavel valor={n2(l.premio)} onChange={(v) => ajustar((a) => ({ ...a, premio: numero(v) }))} />} />
        <C v={<Editavel largura="w-20" valor={n2(l.salarioBase)} onChange={(v) => ajustar((a) => ({ ...a, salarioBase: numero(v) }))} />} />
        <C v={n2(l.salarioHora)} />
        <C v={eur(l.faltasEur)} className={l.faltasEur > 0 ? 'text-vermelho' : ''} />
        <C v={<Editavel largura="w-14" valor={n2(l.subsidioDia)} onChange={(v) => ajustar((a) => ({ ...a, subsidioDia: numero(v) }))} />} />
        <C v={l.diasUteisSub} />
        <C v={eur(l.subsidio)} />
        <C v={<Editavel largura="w-14" valor={`${n2(l.taxaIrs * 100)}%`} onChange={(v) => ajustar((a) => ({ ...a, taxaIrs: numero(v) / 100 }))} />} />
        <C v={eur(l.irs)} /><C v={eur(l.ss)} /><C v={eur(l.ssEmpresa)} />
        <C v={eur(l.liquido)} className="font-semibold" />
        <td className={td} />
        <C v={<Editavel valor={n2(l.km)} onChange={(v) => ajustar((a) => ({ ...a, km: numero(v) }))} />} />
        <C v={<Editavel largura="w-10" valor={String(l.diasBaixa)} onChange={(v) => ajustar((a) => ({ ...a, diasBaixaExtra: Math.max(0, numero(v) - (l.diasBaixa - (a.diasBaixaExtra ?? 0))) }))} />} />
        <C v={eur(l.baixaEur)} /><C v={eur(l.custo)} /><C v={eur(l.acidentes)} />
      </tr>
      {aberta && (
        <tr><td />
          <td colSpan={CABECALHO.length} className="border border-linha bg-fundo/50 px-3 py-3">
            {!l.pessoa.picaPonto ? <p className="text-[13px] text-suave">Não pica o ponto: conta como presente todos os dias úteis.</p> : !l.dias.length ? <p className="text-[13px] text-ambar">Sem registos do relógio neste mês.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {l.dias.map((d) => {
                  const tipo = ajuste.ausencias[d.data]
                  const temAviso = d.aviso && !ajuste.confirmados[d.data]
                  if (!d.util && !d.trabalho) return null
                  return (
                    <div key={d.data} className={clsx('rounded border px-2 py-1 text-[11px] min-w-[96px]', d.semPicagens || tipo ? 'border-vermelho-borda bg-vermelho-fraco' : temAviso ? 'border-ambar bg-ambar-fraco' : d.falta > 0 ? 'border-ambar/50 bg-papel' : 'border-linha bg-papel', !d.util && 'opacity-80')}>
                      <div className="font-semibold">{SEMANA[diaSemana(d.data)]} {ddmm(d.data)}</div>
                      {d.picagens?.length ? <div className="num text-tinta-2">{d.picagens.map(hhmm).join(' ')}</div> : !d.semPicagens && <div className="text-suave">trab. {horasTexto(d.trabalho)}</div>}
                      {d.falta > 0 && !d.semPicagens && <div className="text-vermelho">falta {horasTexto(d.falta)}</div>}
                      {d.extra > 0 && <div className="text-verde">+{horasTexto(d.extra)} banco</div>}
                      {(d.semPicagens || tipo) && (
                        <select value={tipo ?? 'falta'} onChange={(e) => ajustar((a) => ({ ...a, ausencias: { ...a.ausencias, [d.data]: e.target.value as TipoAusencia } }))} className="mt-0.5 w-full bg-transparent">
                          <option value="falta">Falta</option><option value="baixa">Baixa</option><option value="ferias">Férias</option><option value="justificada">Falta justificada</option>
                        </select>
                      )}
                      {temAviso && (
                        <div className="text-ambar mt-0.5">{d.aviso}
                          <button className="block underline" onClick={() => ajustar((a) => ({ ...a, confirmados: { ...a.confirmados, [d.data]: true } }))}>confirmar presença</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {l.avisos.filter((a) => !a.data).map((a, i) => <p key={i} className="text-[13px] text-ambar mt-1">{a.texto}</p>)}
            <div className="mt-2 text-[12px] text-suave flex flex-wrap gap-4">
              <span>Banco do mês anterior: <b>{horasTexto(l.pessoa.bancoAnterior)}</b></span>
              <span>Extra no mês: <b>{horasTexto(l.extraSemana + l.extraSabado)}</b></span>
              <span>Faltas compensadas no banco: <b>{horasTexto(l.faltaCompensada)}</b></span>
              <span>Banco final: <b>{horasTexto(l.bancoFinal)}</b></span>
              <label className="flex items-center gap-1">Corrigir total de faltas:
                <Editavel texto largura="w-16" valor={ajuste.faltaManual != null ? horasTexto(ajuste.faltaManual) : ''} onChange={(v) => ajustar((a) => ({ ...a, faltaManual: v.trim() ? lerHoras(v) : undefined }))} />
              </label>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
