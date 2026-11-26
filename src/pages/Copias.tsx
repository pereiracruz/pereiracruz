import { useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CircleCheck, Download, Upload } from 'lucide-react'
import { COLECOES, useDb, type Colecao } from '../store/db'
import { Botao, Cabecalho, Cartao, Entrada, Modal, aviso } from '../components/ui'
import { compararCopia, criarCopia, descarregarCopia, lerCopia, type Copia, type Diferenca } from '../lib/copias'
import { dataHora } from '../lib/format'
import { modoServidor } from '../lib/supabase'

const NOMES: Record<Colecao, string> = {
  encomendas: 'Encomendas (com as fichas)', pedidos: 'Pedidos de orçamento', historico: 'Histórico de preços',
  fornecedores: 'Fornecedores', tecidos: 'Tecidos', equivalencias: 'Equivalências de tecido', lavagens: 'Lavagens e tingimentos',
  acessorios: 'Acessórios por cliente', escalas: 'Tamanhos', destinatarios: 'Destinatários', precosRef: 'Tabela de preços', clientes: 'Clientes',
}
const DIAS_AVISO = 7

export default function Copias() {
  const estado = useDb()
  const { atividade, log, aGuardar } = estado
  const input = useRef<HTMLInputElement>(null)
  const [copia, setCopia] = useState<Copia | null>(null)
  const [difs, setDifs] = useState<Diferenca[]>([])
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')

  const ultima = atividade.find((a) => a.acao === 'Cópia de segurança descarregada')
  const dias = ultima ? Math.floor((Date.now() - new Date(ultima.data).getTime()) / 864e5) : null
  const emFalta = dias == null || dias >= DIAS_AVISO
  const contagem = (c: Colecao) => (estado[c] as unknown[]).length

  const descarregar = () => {
    const c = criarCopia(estado as unknown as Parameters<typeof criarCopia>[0])
    const nome = descarregarCopia(c)
    const total = COLECOES.reduce((n, col) => n + c.colecoes[col].length, 0)
    log('Cópia de segurança descarregada', `${nome} · ${total} registos`)
    aviso('Cópia de segurança descarregada.')
  }

  const escolher = async (f: File) => {
    setErro(''); setConfirmacao('')
    try {
      const c = await lerCopia(f)
      setCopia(c)
      setDifs(compararCopia(estado as unknown as Record<Colecao, { id: string }[]>, c))
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }

  const repor = () => {
    if (!copia) return
    useDb.setState(Object.fromEntries(COLECOES.map((c) => [c, copia.colecoes[c] ?? []])) as Partial<ReturnType<typeof useDb.getState>>)
    log('Cópia de segurança reposta', `Cópia de ${dataHora(copia.criadaEm)} · ${difs.reduce((n, d) => n + d.novos + d.alterados + d.removidos, 0)} alterações`)
    setCopia(null)
    aviso(modoServidor ? 'Cópia reposta. A gravar no servidor…' : 'Cópia reposta.')
  }

  const mudancas = difs.reduce((n, d) => n + d.novos + d.alterados + d.removidos, 0)

  return (
    <>
      <Cabecalho sobre="Administração" titulo="Cópias de segurança"
        sub="Um ficheiro com todos os dados: encomendas e fichas, dados mestre, orçamentos, histórico e registo de atividade. Guarde-o fora deste computador (por exemplo, no Google Drive)." />

      <div className={clsx('rounded-cartao border px-5 py-4 mb-5 flex gap-3', emFalta ? 'bg-ambar-fraco border-ambar-borda' : 'bg-verde-fraco/60 border-verde-borda')}>
        {emFalta ? <AlertTriangle size={18} className="text-ambar mt-0.5" /> : <CircleCheck size={18} className="text-verde mt-0.5" />}
        <div className="text-[14px]">
          <p className="font-semibold">{ultima ? `Última cópia: ${dataHora(ultima.data)}${dias != null ? ` (há ${dias === 0 ? 'menos de um dia' : dias === 1 ? '1 dia' : `${dias} dias`})` : ''}` : 'Ainda não foi feita nenhuma cópia de segurança.'}</p>
          <p className="text-[13px] text-tinta-2">{emFalta ? `Recomenda-se uma cópia por semana (o plano gratuito do Supabase não faz cópias automáticas).` : 'Em dia. Próxima cópia recomendada daqui a uma semana.'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 items-start">
        <Cartao className="p-5">
          <h3 className="font-semibold mb-1">Descarregar cópia</h3>
          <p className="text-[13px] text-suave mb-4">Ficheiro JSON com o estado atual. Os PDFs e Excel originais guardados no servidor não entram na cópia.</p>
          <div className="divide-y divide-linha border border-linha rounded-controlo mb-4">
            {COLECOES.map((c) => (
              <div key={c} className="flex justify-between px-3 py-1.5 text-[13px]"><span>{NOMES[c]}</span><span className="num text-suave">{contagem(c)}</span></div>
            ))}
            <div className="flex justify-between px-3 py-1.5 text-[13px]"><span>Registo de atividade</span><span className="num text-suave">{atividade.length}</span></div>
          </div>
          <Botao variante="primario" icone={<Download size={15} />} disabled={aGuardar > 0} onClick={descarregar} title={aGuardar ? 'A gravar alterações no servidor…' : ''}>Descarregar cópia de segurança</Botao>
        </Cartao>

        <Cartao className="p-5">
          <h3 className="font-semibold mb-1">Repor a partir de uma cópia</h3>
          <p className="text-[13px] text-suave mb-4">Substitui os dados atuais pelos da cópia. Antes de repor, é mostrado o que muda. O registo de atividade não é apagado.</p>
          <Botao icone={<Upload size={15} />} onClick={() => input.current?.click()}>Escolher ficheiro de cópia…</Botao>
          <input ref={input} type="file" hidden accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolher(f); e.target.value = '' }} />
          {erro && <p className="mt-3 text-[13px] text-vermelho bg-vermelho-fraco border border-vermelho-borda rounded-controlo px-3 py-2">{erro}</p>}
        </Cartao>
      </div>

      <Modal aberto={!!copia} onFechar={() => setCopia(null)} titulo="Repor cópia de segurança" largura="max-w-2xl"
        sub={copia ? `Cópia de ${dataHora(copia.criadaEm)}${copia.origem ? ` · ${copia.origem.replace(/^https?:\/\//, '')}` : ''}` : ''}
        rodape={<>
          <Botao variante="fantasma" onClick={() => setCopia(null)}>Cancelar</Botao>
          <Botao variante="perigo" disabled={confirmacao.trim().toUpperCase() !== 'REPOR' || mudancas === 0} onClick={repor}>Repor os dados</Botao>
        </>}>
        {copia && (
          <>
            <table className="w-full text-[13px] mb-4">
              <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-b border-linha">
                <th className="text-left py-1.5">Dados</th><th className="text-right">Agora</th><th className="text-right">Na cópia</th><th className="text-right">Novos</th><th className="text-right">Alterados</th><th className="text-right">Retirados</th></tr></thead>
              <tbody>
                {difs.map((d) => (
                  <tr key={d.colecao} className={clsx('border-b border-linha num', d.novos + d.alterados + d.removidos === 0 && 'text-tenue')}>
                    <td className="py-1.5">{NOMES[d.colecao]}</td><td className="text-right">{d.atual}</td><td className="text-right">{d.copia}</td>
                    <td className="text-right">{d.novos || ''}</td><td className="text-right">{d.alterados || ''}</td><td className={clsx('text-right', d.removidos && 'text-vermelho font-semibold')}>{d.removidos || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mudancas === 0
              ? <p className="text-[14px] text-verde">Os dados atuais são iguais aos da cópia. Não há nada a repor.</p>
              : <>
                <p className="text-[13px] text-ambar bg-ambar-fraco border border-ambar-borda rounded-controlo px-3 py-2 mb-3">
                  O que foi criado ou alterado depois desta cópia perde-se. Se tiver dúvidas, descarregue primeiro uma cópia do estado atual.
                </p>
                <label className="block text-[13px] mb-1.5">Para confirmar, escreva <b>REPOR</b>:</label>
                <Entrada value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder="REPOR" />
              </>}
          </>
        )}
      </Modal>
    </>
  )
}
