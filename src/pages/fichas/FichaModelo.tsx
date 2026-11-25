import { Fragment, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, Check, CircleCheck, FileSpreadsheet, FileText, Pencil, Plus, Send, Sheet, Trash2, Upload, X } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Cartao, Entrada, Etiqueta, Modal, Seletor, aviso, type Tom } from '../../components/ui'
import { Folha, NOME_FOLHA, folhasDoModelo, idEncomendaVariante } from '../../components/Folhas'
import { soma, totalVariante, verificarFicha } from '../../lib/calc'
import { exportarExcel, exportarPDF } from '../../lib/exportar'
import { hojeISO, parseNum, uid, num } from '../../lib/format'
import type { EstadoFicha, FolhaTipo, LinhaMaterial, Modelo } from '../../types'

export const ESTADO_FICHA: Record<EstadoFicha, { rotulo: string; tom: Tom }> = {
  'sem-ficha': { rotulo: 'Sem ficha', tom: 'neutro' },
  rascunho: { rotulo: 'Por aprovar', tom: 'ambar' },
  aprovada: { rotulo: 'Aprovada', tom: 'verde' },
  enviada: { rotulo: 'Enviada à produção', tom: 'azul' },
}

export default function FichaModelo() {
  const { encId, modId } = useParams()
  const nav = useNavigate()
  const { encomendas, destinatarios, clientes, fornecedores, atualizarModelo, atualizarEncomenda, log } = useDb()
  const enc = encomendas.find((e) => e.id === encId)
  const m = enc?.modelos.find((x) => x.id === modId)
  const comFicha = m?.variantes.filter((v) => v.fichaGerada) ?? []
  const [varId, setVarId] = useState(comFicha[0]?.id)
  const [folha, setFolha] = useState<FolhaTipo>('produto')
  const [editar, setEditar] = useState(false)
  const [exportar, setExportar] = useState(false)
  const [novaObs, setNovaObs] = useState('')

  const prefixo = clientes.find((c) => c.nome === enc?.cliente)?.idPrefixo ?? 'ENC'
  const ids = useMemo(() => (enc && m ? Object.fromEntries(m.variantes.map((v) => [v.id, idEncomendaVariante(enc, prefixo, v)])) : {}), [enc, m, prefixo])

  if (!enc || !m) return <Navigate to="/fichas" replace />
  const v = comFicha.find((x) => x.id === varId) ?? comFicha[0]
  const folhas = folhasDoModelo(m)
  const verif = v ? verificarFicha(m, v) : []
  const bloqueios = verif.filter((x) => !x.ok && !x.texto.startsWith('Medidas'))
  const dataFicha = m.versoes[m.versoes.length - 1]?.data ?? enc.criadaEm

  /** Qualquer alteração a uma ficha aprovada obriga a nova aprovação. */
  const alterar = (fn: (m: Modelo) => Modelo, descricao: string) => {
    atualizarModelo(enc.id, m.id, (atual) => {
      const novo = fn(atual)
      if (atual.estado === 'aprovada' || atual.estado === 'enviada') {
        return { ...novo, estado: 'rascunho', versoes: [{ n: atual.versoes.length + 1, titulo: 'alterada depois de aprovada', descricao: `${descricao} Exige nova aprovação.`, data: hojeISO() }, ...novo.versoes] }
      }
      return novo
    })
    if (m.estado === 'aprovada' || m.estado === 'enviada') aviso('Ficha alterada: precisa de nova aprovação.')
  }
  const alterarMaterial = (id: string, p: Partial<LinhaMaterial>) =>
    alterar((x) => ({ ...x, materiais: x.materiais.map((l) => (l.id === id ? { ...l, ...p } : l)) }), 'Material alterado.')

  const aprovar = () => {
    atualizarModelo(enc.id, m.id, (x) => ({ ...x, estado: 'aprovada', aprovadaEm: hojeISO(), versoes: [{ n: x.versoes.length + 1, titulo: 'aprovada', descricao: 'Aprovada por Admin. Pronta a exportar.', data: hojeISO() }, ...x.versoes] }))
    atualizarEncomenda(enc.id, (e) => {
      const todas = e.modelos.map((x) => (x.id === m.id ? { ...x, estado: 'aprovada' as EstadoFicha } : x))
      const pronta = todas.filter((x) => x.estado !== 'sem-ficha').every((x) => x.estado === 'aprovada' || x.estado === 'enviada')
      return { ...e, estado: e.estado === 'Concluída' ? e.estado : pronta ? 'Fichas geradas' : 'Em revisão' }
    })
    log('Ficha aprovada', `${enc.cliente} · ${enc.colecao} · ${m.nome}`)
    setEditar(false)
    aviso('Ficha aprovada.')
  }

  return (
    <>
      <Cabecalho
        migalhas={[{ rotulo: 'Encomendas', para: '/fichas' }, { rotulo: `${enc.cliente} · ${enc.colecao}`, para: `/fichas/${enc.id}` }, { rotulo: m.nome }]}
        sobre="Fichas de produção" titulo={m.nome} extra={<Etiqueta tom={ESTADO_FICHA[m.estado].tom}>{ESTADO_FICHA[m.estado].rotulo}</Etiqueta>}
        acoes={m.estado !== 'sem-ficha' && <>
          <Botao variante={editar ? 'primario' : 'secundario'} icone={editar ? <Check size={15} /> : <Pencil size={15} />} onClick={() => setEditar(!editar)}>{editar ? 'Concluir edição' : 'Editar'}</Botao>
          {m.estado === 'rascunho' && <Botao variante="primario" icone={<CircleCheck size={16} />} disabled={bloqueios.length > 0} onClick={aprovar}
            title={bloqueios.length ? 'Resolva os pontos assinalados antes de aprovar' : ''}>Aprovar ficha</Botao>}
          {(m.estado === 'aprovada' || m.estado === 'enviada') && <Botao icone={<Upload size={15} />} onClick={() => setExportar(true)}>Exportar</Botao>}
          {m.estado === 'aprovada' && <Botao variante="primario" icone={<Send size={15} />} onClick={() => {
            atualizarModelo(enc.id, m.id, (x) => ({ ...x, estado: 'enviada' })); log('Ficha marcada como enviada à produção', `${enc.cliente} · ${m.nome}`); aviso('Marcada como enviada à produção.')
          }}>Marcar como enviada</Botao>}
        </>} />

      {m.estado === 'sem-ficha' || !v ? (
        <Cartao className="p-8 text-center">
          <p className="font-semibold">Este modelo ainda não tem ficha.</p>
          <p className="text-[14px] text-suave mt-1">{m.techPack ? 'Gere a ficha a partir do tech pack ligado.' : 'Falta o tech pack. Carregue-o numa nova leitura da encomenda.'}</p>
          <Botao className="mt-5" onClick={() => nav(`/fichas/${enc.id}`)}>Voltar à encomenda</Botao>
        </Cartao>
      ) : (
        <>
          {/* variantes */}
          <div className="flex items-end gap-6 border-b border-linha mb-4 no-print">
            {m.variantes.map((x) => (
              x.fichaGerada ? (
                <button key={x.id} onClick={() => setVarId(x.id)} className={clsx('pb-3 -mb-px border-b-2 text-[15px] flex items-center gap-2', x.id === v.id ? 'border-tinta text-tinta' : 'border-transparent text-suave hover:text-tinta')}>
                  {x.nome}<span className={clsx('text-[11px] font-semibold px-1.5 rounded', x.id === v.id ? 'bg-tinta text-white' : 'bg-fundo-2 text-suave')}>{totalVariante(x)}</span>
                </button>
              ) : (
                <button key={x.id} onClick={() => {
                  alterar((mm) => ({ ...mm, estado: 'rascunho', variantes: mm.variantes.map((y) => (y.id === x.id ? { ...y, fichaGerada: true } : y)), versoes: [{ n: mm.versoes.length + 1, titulo: `ficha ${x.nome} gerada`, descricao: 'Mesma base, outra lavagem.', data: hojeISO() }, ...mm.versoes] }), 'Variante acrescentada.')
                  log('Ficha de variante gerada', `${m.nome} · ${x.nome}`); setVarId(x.id)
                }} className="pb-3 text-[14px] text-tenue hover:text-tinta flex items-center gap-1.5" title="Esta variante não tem ficha">
                  <Plus size={13} />{x.nome} <span className="text-[11px]">sem ficha</span>
                </button>
              )
            ))}
          </div>

          {/* folhas */}
          <div className="flex items-center gap-2 flex-wrap mb-4 no-print">
            <span className="text-[13px] text-suave mr-1">Folhas por destinatário</span>
            {folhas.map((f) => (
              <button key={f} onClick={() => setFolha(f)} className={clsx('h-8 px-3 rounded-md border text-[14px]', folha === f ? 'bg-tinta border-tinta text-white' : 'bg-papel border-linha text-tinta-2 hover:border-linha-forte')}>{NOME_FOLHA[f]}</button>
            ))}
          </div>

          {/* verificações */}
          <div className={clsx('rounded-cartao border px-4 py-3 mb-4 flex items-center gap-x-6 gap-y-2 flex-wrap text-[13px] no-print', bloqueios.length ? 'bg-ambar-fraco border-ambar-borda' : 'bg-verde-fraco/60 border-verde-borda')}>
            <span className="font-semibold">{bloqueios.length ? 'A rever' : 'Conferido'}</span>
            {verif.map((x) => (
              <span key={x.texto} className={clsx('flex items-center gap-1.5', !x.ok && 'text-vermelho')} title={x.detalhe}>
                {x.ok ? <Check size={14} className="text-verde" /> : <AlertTriangle size={14} />}{x.texto}
              </span>
            ))}
          </div>

          {editar && <EditorFicha m={m} v={v} fornecedores={fornecedores.map((f) => f.nome)} alterar={alterar} alterarMaterial={alterarMaterial} />}

          <Folha enc={enc} m={m} v={v} folha={folha} idEnc={ids[v.id]} destinatarios={destinatarios} dataFicha={dataFicha} />

          {editar && (
            <div className="mt-3 flex gap-2 no-print">
              <Entrada value={novaObs} onChange={(e) => setNovaObs(e.target.value)} placeholder="Nova observação (fica no bloco «Novas observações»)" />
              <Botao icone={<Plus size={15} />} disabled={!novaObs.trim()} onClick={() => { alterar((x) => ({ ...x, novasObservacoes: [...x.novasObservacoes, novaObs.trim()] }), 'Nova observação.'); setNovaObs('') }}>Acrescentar</Botao>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mt-6 no-print">
            <Cartao className="p-5">
              <h3 className="font-semibold mb-4">Versões da ficha</h3>
              <ol className="space-y-4">
                {m.versoes.map((x, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={clsx('mt-1.5 size-2 rounded-full shrink-0', i === 0 ? 'bg-verde' : 'bg-linha-forte')} />
                    <div className="flex-1"><div className="flex justify-between gap-2"><p className="text-[14px] font-medium">Versão {x.n} · {x.titulo}</p><span className="text-[12px] text-tenue">{x.data === hojeISO() ? 'hoje' : x.data.split('-').reverse().join('/')}</span></div><p className="text-[13px] text-suave">{x.descricao}</p></div>
                  </li>
                ))}
              </ol>
            </Cartao>
            <Cartao className="p-5">
              <h3 className="font-semibold mb-4">Quem recebe cada folha</h3>
              {folhas.map((f) => {
                const d = destinatarios.find((x) => x.folha === f)
                return <div key={f} className="flex justify-between py-2 text-[14px] border-b border-linha last:border-0"><span>{NOME_FOLHA[f]}</span><span className="text-suave">{d ? `${d.nome}` : '—'}</span></div>
              })}
            </Cartao>
          </div>

          <ModalExportar aberto={exportar} onFechar={() => setExportar(false)} folhas={folhas} variantes={comFicha} onExportar={(formato, fs, vs) => {
            const variantes = comFicha.filter((x) => vs.includes(x.id))
            if (formato === 'excel') {
              const nomes = exportarExcel(enc, m, variantes, fs, ids, dataFicha, destinatarios)
              aviso(`${nomes.length} ${nomes.length === 1 ? 'ficheiro Excel descarregado' : 'ficheiros Excel descarregados'}.`)
            } else if (!exportarPDF({ enc, m, variantes, folhas: fs, ids, dataFicha, dest: destinatarios })) {
              alert('O browser bloqueou a janela de impressão. Autorize janelas pop-up para este site.')
            }
            log(`Fichas exportadas (${formato === 'excel' ? 'Excel' : 'PDF'})`, `${enc.cliente} · ${m.nome} · ${fs.length} folhas × ${variantes.length} variantes`)
            setExportar(false)
          }} />
        </>
      )}
    </>
  )
}

// ---------------- Editor ----------------
function EditorFicha({ m, v, fornecedores, alterar, alterarMaterial }: {
  m: Modelo; v: Modelo['variantes'][number]; fornecedores: string[]
  alterar: (fn: (m: Modelo) => Modelo, d: string) => void; alterarMaterial: (id: string, p: Partial<LinhaMaterial>) => void
}) {
  const tam = m.escala.slice(0, v.qtd.length)
  return (
    <Cartao className="p-5 mb-4 no-print border-ouro/60">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold">Editar ficha · {v.nome}</h3>
        <span className="text-[12px] text-tenue">Os totais recalculam sozinhos. Alterar uma ficha aprovada obriga a nova aprovação.</span>
      </div>

      <p className="text-[13px] font-medium mb-2">Quantidades por tamanho</p>
      <div className="flex gap-2 mb-1 flex-wrap">
        {tam.map((t, i) => (
          <label key={t} className="w-16 text-center">
            <span className="block text-[11px] text-suave">{t}</span>
            <Entrada className={clsx('h-9 text-center px-1', v.qtd[i] !== v.qtdEncomenda[i] && 'border-vermelho text-vermelho')} value={v.qtd[i]}
              onChange={(e) => { const n = Math.max(0, Math.round(parseNum(e.target.value) ?? 0)); alterar((x) => ({ ...x, variantes: x.variantes.map((y) => (y.id === v.id ? { ...y, qtd: y.qtd.map((q, j) => (j === i ? n : q)) } : y)) }), 'Quantidades alteradas.') }} />
          </label>
        ))}
        <div className="w-20 text-center"><span className="block text-[11px] text-suave">Total</span><p className="h-9 grid place-items-center font-semibold num">{soma(v.qtd)}</p></div>
      </div>
      <p className="text-[12px] text-tenue mb-5">Encomenda: {v.qtdEncomenda.join(' · ')} ({soma(v.qtdEncomenda)})</p>

      <p className="text-[13px] font-medium mb-2">Materiais</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-suave"><th className="py-1.5 pr-2">Folha</th><th className="pr-2">Referência / item</th><th className="pr-2">Fornecedor</th><th className="pr-2">Observações</th><th className="pr-2 w-20">Cons/un</th><th className="pr-2 w-14">Un.</th><th className="pr-2 w-28">Cor</th><th /></tr></thead>
          <tbody>
            {m.materiais.map((l) => (
              <Fragment key={l.id}>
                <tr className="border-t border-linha">
                  <td className="py-1.5 pr-2 text-[12px] text-suave whitespace-nowrap">{l.folha === 'tecido' ? 'Tecido' : l.folha === 'confecao' ? 'Confeção' : 'Embalamento'}</td>
                  <td className="pr-2"><Entrada className="h-8" value={l.ref} onChange={(e) => alterarMaterial(l.id, { ref: e.target.value })} /></td>
                  <td className="pr-2"><Seletor className="[&_select]:h-8 [&_select]:text-[13px] min-w-36" valor={l.fornecedor} onChange={(f) => alterarMaterial(l.id, { fornecedor: f })} opcoes={[...new Set([l.fornecedor, 'Enviada pela cliente', ...fornecedores])]} /></td>
                  <td className="pr-2"><Entrada className="h-8" value={l.obs} onChange={(e) => alterarMaterial(l.id, { obs: e.target.value })} /></td>
                  <td className="pr-2"><Entrada className={clsx('h-8 text-right', l.consumo == null && 'border-vermelho')} defaultValue={l.consumo == null ? '' : num(l.consumo)} placeholder="?" onBlur={(e) => alterarMaterial(l.id, { consumo: parseNum(e.target.value) })} /></td>
                  <td className="pr-2"><Seletor className="[&_select]:h-8 [&_select]:text-[13px]" valor={l.unidade} onChange={(u) => alterarMaterial(l.id, { unidade: u as 'm' | 'un' })} opcoes={['un', 'm']} /></td>
                  <td className="pr-2"><Entrada className="h-8" value={l.cor} onChange={(e) => alterarMaterial(l.id, { cor: e.target.value })} /></td>
                  <td><button onClick={() => alterar((x) => ({ ...x, materiais: x.materiais.filter((y) => y.id !== l.id) }), `Material ${l.ref} removido.`)} className="p-1 text-tenue hover:text-vermelho"><Trash2 size={14} /></button></td>
                </tr>
                {l.divergencia && (
                  <tr><td /><td colSpan={7} className="pb-2">
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="text-ambar flex items-center gap-1 whitespace-nowrap"><AlertTriangle size={12} />{l.divergencia}</span>
                      <Entrada className={clsx('h-8 text-[12px]', !l.justificacao?.trim() && 'border-vermelho')} placeholder="Justificação obrigatória" value={l.justificacao ?? ''} onChange={(e) => alterarMaterial(l.id, { justificacao: e.target.value })} />
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-3">
        {(['tecido', 'confecao', 'embalamento'] as const).map((f) => (
          <Botao key={f} pequeno variante="fantasma" icone={<Plus size={13} />} onClick={() => alterar((x) => ({ ...x, materiais: [...x.materiais, { id: uid('m'), ref: 'Novo material', fornecedor: '', obs: '', consumo: null, unidade: f === 'tecido' ? 'm' : 'un', cor: '', folha: f }] }), 'Material acrescentado.')}>
            {f === 'tecido' ? 'Tecido' : f === 'confecao' ? 'Acessório de confeção' : 'Acessório de embalamento'}
          </Botao>
        ))}
        <label className="ml-auto flex items-center gap-2 text-[13px] text-suave">Peças por caixa
          <Entrada className="h-8 w-16 text-center" value={m.caixaMax} onChange={(e) => alterar((x) => ({ ...x, caixaMax: Math.max(1, Math.round(parseNum(e.target.value) ?? 1)) }), 'Packing list alterada.')} />
        </label>
      </div>
    </Cartao>
  )
}

// ---------------- Exportar ----------------
function ModalExportar({ aberto, onFechar, folhas, variantes, onExportar }: {
  aberto: boolean; onFechar: () => void; folhas: FolhaTipo[]; variantes: Modelo['variantes']
  onExportar: (formato: 'excel' | 'pdf', folhas: FolhaTipo[], variantes: string[]) => void
}) {
  const [formato, setFormato] = useState<'excel' | 'pdf'>('excel')
  const [sel, setSel] = useState<FolhaTipo[]>(folhas)
  const [vs, setVs] = useState<string[]>(variantes.map((v) => v.id))
  const dest = useDb((s) => s.destinatarios)
  const toggle = <T,>(a: T[], x: T) => (a.includes(x) ? a.filter((y) => y !== x) : [...a, x])
  const formatos = [
    { id: 'gs', icone: <Sheet size={17} />, t: 'Google Sheets', d: 'Precisa da conta Google (com o servidor)', off: true },
    { id: 'excel', icone: <FileSpreadsheet size={17} />, t: 'Excel', d: 'Um separador por folha, totais em fórmula' },
    { id: 'pdf', icone: <FileText size={17} />, t: 'PDF', d: 'Imprimir / guardar como PDF' },
  ] as const
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Exportar fichas" sub="Escolha as folhas e o formato. O que sai é a ficha que a fábrica já conhece." largura="max-w-xl"
      rodape={<><Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao><Botao variante="primario" disabled={!sel.length || !vs.length} onClick={() => onExportar(formato, folhas.filter((f) => sel.includes(f)), vs)}>Exportar</Botao></>}>
      <p className="text-[13px] font-medium mb-2">Formato</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {formatos.map((f) => (
          <button key={f.id} disabled={'off' in f} onClick={() => setFormato(f.id as 'excel' | 'pdf')}
            className={clsx('text-left p-3 rounded-controlo border disabled:opacity-45 disabled:cursor-not-allowed', formato === f.id ? 'border-tinta bg-fundo' : 'border-linha hover:border-linha-forte')}>
            <span className="text-suave">{f.icone}</span><p className="text-[14px] font-medium mt-2">{f.t}</p><p className="text-[12px] text-suave leading-snug">{f.d}</p>
          </button>
        ))}
      </div>
      {variantes.length > 1 && <>
        <p className="text-[13px] font-medium mb-2">Variantes</p>
        <div className="flex gap-2 mb-5">{variantes.map((v) => (
          <button key={v.id} onClick={() => setVs(toggle(vs, v.id))} className={clsx('h-8 px-3 rounded-md border text-[13px] flex items-center gap-1.5', vs.includes(v.id) ? 'border-tinta bg-fundo' : 'border-linha text-suave')}>
            {vs.includes(v.id) ? <Check size={13} /> : <X size={13} />}{v.nome}</button>
        ))}</div>
      </>}
      <p className="text-[13px] font-medium mb-2">Folhas</p>
      <div className="divide-y divide-linha border border-linha rounded-controlo">
        {folhas.map((f) => (
          <label key={f} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-fundo/60">
            <input type="checkbox" checked={sel.includes(f)} onChange={() => setSel(toggle(sel, f))} className="accent-[#1c1b19] size-4" />
            <span className="flex-1 text-[14px]">{NOME_FOLHA[f]}</span>
            <span className="text-[13px] text-suave">{dest.find((d) => d.folha === f)?.nome}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
