import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Plus, Printer, Trash2, X } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Cartao, Entrada, Vazio, aviso } from '../../components/ui'
import { calcularEnvio } from '../../lib/packing'
import { dataCurta, hojeISO, num, uid } from '../../lib/format'
import type { Encomenda, Envio } from '../../types'

const ORDINAIS = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH']

/** Packing list da encomenda, por envio (em inglês, para o cliente). */
export default function PackingList() {
  const { encId } = useParams()
  const { encomendas, atualizarEncomenda, log } = useDb()
  const enc = encomendas.find((e) => e.id === encId)
  const [aAdicionar, setAAdicionar] = useState<string | null>(null)
  if (!enc) return <Navigate to="/fichas" replace />
  const envios = enc.envios ?? []
  const comFicha = enc.modelos.flatMap((m) => m.variantes.filter((v) => v.fichaGerada).map((v) => ({ m, v })))
  const enviados = new Set(envios.flatMap((e) => e.itens.map((i) => i.varianteId + '@' + i.modeloId)))
  const porEnviar = comFicha.filter(({ m, v }) => !enviados.has(v.id + '@' + m.id))

  const guardar = (fn: (e: Encomenda) => Encomenda, d: string) => { atualizarEncomenda(enc.id, fn); log('Packing list alterada', `${enc.cliente} · ${enc.colecao} · ${d}`) }
  const novoEnvio = () => {
    const n = envios.length
    const envio: Envio = { id: uid('env'), nome: `${ORDINAIS[n] ?? `#${n + 1}`} SEND`, data: hojeISO(), itens: [] }
    guardar((e) => ({ ...e, envios: [...(e.envios ?? []), envio] }), `novo envio ${envio.nome}`)
    setAAdicionar(envio.id)
  }
  const mudarEnvio = (id: string, fn: (e: Envio) => Envio, d: string) => guardar((e) => ({ ...e, envios: (e.envios ?? []).map((x) => (x.id === id ? fn(x) : x)) }), d)

  return (
    <>
      <Cabecalho migalhas={[{ rotulo: 'Encomendas', para: '/fichas' }, { rotulo: `${enc.cliente} · ${enc.colecao}`, para: `/fichas/${enc.id}` }, { rotulo: 'Packing list' }]}
        sobre="Fichas de produção" titulo="Packing list" sub="Por envio. As caixas numeram-se seguidas dentro de cada envio; as quantidades são as embaladas (ou confecionadas, ou da encomenda, enquanto não houver)."
        acoes={<>
          <Botao icone={<Printer size={15} />} disabled={!envios.length} onClick={() => window.print()}>Imprimir / PDF</Botao>
          <Botao variante="primario" icone={<Plus size={15} />} disabled={!porEnviar.length} onClick={novoEnvio}>Novo envio</Botao>
        </>} />

      {porEnviar.length > 0 && (
        <p className="text-[13px] text-suave mb-4 no-print">Por enviar: {porEnviar.map(({ m, v }) => `${m.nome} · ${v.nome}`).join(' · ')}</p>
      )}
      {!comFicha.length && <Cartao><Vazio>Esta encomenda ainda não tem fichas.</Vazio></Cartao>}

      <div className="space-y-5">
        {envios.map((envio) => {
          const blocos = calcularEnvio(enc, envio)
          return (
            <div key={envio.id} className="bg-white border border-linha-forte rounded-cartao overflow-hidden print-area print-break">
              <div className="grid grid-cols-[1fr_auto] items-start px-5 py-4 border-b border-linha-forte">
                <div className="text-[13px] grid grid-cols-[100px_1fr] gap-y-0.5">
                  <span className="font-bold">CLIENT</span><span>{enc.cliente.toUpperCase()}</span>
                  <span className="font-bold">REFERENCE</span><span>{enc.colecao}</span>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <Entrada className="h-8 w-40" value={envio.nome} onChange={(e) => mudarEnvio(envio.id, (x) => ({ ...x, nome: e.target.value }), 'nome do envio')} />
                  <Entrada className="h-8 w-40" type="date" value={envio.data} onChange={(e) => mudarEnvio(envio.id, (x) => ({ ...x, data: e.target.value }), 'data do envio')} />
                  <button onClick={() => confirm('Apagar este envio?') && guardar((e) => ({ ...e, envios: (e.envios ?? []).filter((x) => x.id !== envio.id) }), `envio ${envio.nome} apagado`)} className="p-1.5 text-tenue hover:text-vermelho"><Trash2 size={15} /></button>
                </div>
              </div>
              <p className="px-5 py-2 bg-folha-faixa text-folha-titulo font-semibold text-[13px]">{envio.nome} – {dataCurta(envio.data).slice(0, 5)}</p>

              {blocos.map((b) => (
                <div key={b.chave} className="border-t border-linha-forte">
                  <div className="flex items-center justify-between px-5 py-2">
                    <p className="font-semibold text-[13px]">PACKING LIST – {b.titulo}</p>
                    <button className="no-print text-tenue hover:text-tinta text-[12px] flex items-center gap-1" onClick={() => mudarEnvio(envio.id, (x) => ({ ...x, itens: x.itens.filter((i) => !(i.modeloId === b.modeloId && i.varianteId === b.varianteId)) }), `${b.titulo} retirado`)}><X size={12} />retirar</button>
                  </div>
                  <table className="w-full text-[12px] border-collapse">
                    <thead><tr className="bg-folha-cab text-white"><th className="px-2 py-1.5">BOX Nº</th>{b.tamanhos.map((t) => <th key={t} className="px-2">{t}</th>)}<th className="px-2">TOTAL</th>{b.temPeso && <th className="px-2">KG</th>}</tr></thead>
                    <tbody>
                      {b.caixas.map((c) => (
                        <tr key={c.numero} className="border-b border-linha text-center num">
                          <td className="py-1.5 font-medium">{c.numero}</td>{c.qtd.map((q, i) => <td key={i}>{q || ''}</td>)}<td className="font-semibold">{c.total}</td>{b.temPeso && <td>{num(c.peso!)}</td>}
                        </tr>
                      ))}
                      <tr className="bg-fundo/50 font-semibold text-center num"><td className="py-1.5">TOTAL</td>{b.totalPorTamanho.map((q, i) => <td key={i}>{q}</td>)}<td>{b.total}</td>{b.temPeso && <td>{num(b.peso)}</td>}</tr>
                    </tbody>
                  </table>
                  <p className={clsx('px-5 py-1.5 text-[11px] no-print', b.origem === 'encomenda' ? 'text-ambar' : 'text-suave')}>
                    Quantidades: {b.origem === 'embalado' ? 'total embalado' : b.origem === 'confecionado' ? 'total confecionado (ainda sem embalado)' : 'encomenda (ainda sem confecionado nem embalado)'} · caixas de até {b.caixaMax} peças
                  </p>
                </div>
              ))}
              {!blocos.length && <Vazio>Sem referências neste envio.</Vazio>}

              <div className="px-5 py-3 border-t border-linha-forte flex items-center justify-between no-print">
                {aAdicionar === envio.id ? (
                  <div className="flex gap-2 flex-wrap">
                    {porEnviar.map(({ m, v }) => (
                      <Botao key={m.id + v.id} pequeno icone={<Plus size={13} />} onClick={() => mudarEnvio(envio.id, (x) => ({ ...x, itens: [...x.itens, { modeloId: m.id, varianteId: v.id }] }), `${m.nome} · ${v.nome} acrescentado`)}>{m.nome} · {v.nome}</Botao>
                    ))}
                    {!porEnviar.length && <span className="text-[13px] text-suave">Todas as referências já estão num envio.</span>}
                    <Botao pequeno variante="fantasma" onClick={() => setAAdicionar(null)}>Fechar</Botao>
                  </div>
                ) : (
                  <Botao pequeno variante="fantasma" icone={<Plus size={13} />} disabled={!porEnviar.length} onClick={() => setAAdicionar(envio.id)}>Acrescentar referência</Botao>
                )}
                <span className="text-[13px] text-suave">{blocos.reduce((n, b) => n + b.caixas.length, 0)} caixas · {blocos.reduce((n, b) => n + b.total, 0)} peças</span>
              </div>
            </div>
          )
        })}
      </div>
      {envios.length === 0 && comFicha.length > 0 && <Cartao className="p-6 text-center"><p className="text-[14px] text-suave">Ainda não há envios. Crie o primeiro em «Novo envio».</p><Botao className="mt-3" onClick={() => { novoEnvio(); aviso('Envio criado.') }} icone={<Plus size={15} />}>Novo envio</Botao></Cartao>}
    </>
  )
}
