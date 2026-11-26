import clsx from 'clsx'
import { AlertTriangle, CalendarClock, Check } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cartao, Etiqueta, aviso } from '../../components/ui'
import { ETAPAS, PRAZO_HABITUAL, dataEncomenda, diasAte, entregaHabitual, planear, prazoDe, situacaoPrazos } from '../../lib/prazos'
import { dataCurta, hojeISO } from '../../lib/format'
import type { Encomenda, Etapa, Prazo } from '../../types'

export const textoDias = (d: number) => (d === 0 ? 'hoje' : d > 0 ? `daqui a ${d} dia${d > 1 ? 's' : ''}` : `há ${-d} dia${d < -1 ? 's' : ''}`)

export default function PrazosEncomenda({ enc }: { enc: Encomenda }) {
  const { atualizarEncomenda, log } = useDb()
  const sit = situacaoPrazos(enc)
  const hoje = hojeISO()
  const mudar = (etapa: Etapa, x: Partial<Prazo>) => atualizarEncomenda(enc.id, (e) => ({ ...e, prazos: ETAPAS.map(({ etapa: et }) => (et === etapa ? { ...prazoDe(e, et), ...x } : prazoDe(e, et))) }))
  const emFalta = ETAPAS.some(({ etapa }) => !prazoDe(enc, etapa).data)

  return (
    <Cartao>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Prazos</h3>
          <p className="text-[13px] text-suave">{enc.entrega ? <>Entrega a <b>{dataCurta(enc.entrega)}</b> ({textoDias(diasAte(enc.entrega))}).</> : <>Sem data de entrega: vem no email do cliente.{entregaHabitual(enc) && <> Com o prazo habitual de 4 semanas seria a <b>{dataCurta(entregaHabitual(enc))}</b>.</>}</>} Datas previstas de cada etapa; marque quando estiver feita.</p>
          {enc.entrega && dataEncomenda(enc) && diasAte(enc.entrega, dataEncomenda(enc)) < PRAZO_HABITUAL && <p className="text-[12.5px] text-ambar mt-0.5">Prazo de {diasAte(enc.entrega, dataEncomenda(enc))} dias desde a encomenda ({dataCurta(dataEncomenda(enc))}): mais curto do que as 4 semanas habituais.</p>}
        </div>
        <Botao pequeno icone={<CalendarClock size={14} />} disabled={!enc.entrega || !emFalta} title={!enc.entrega ? 'Falta a data de entrega' : emFalta ? '' : 'Todas as etapas já têm data'}
          onClick={() => { atualizarEncomenda(enc.id, (e) => ({ ...e, prazos: planear(e) })); log('Prazos planeados', `${enc.cliente} · ${enc.colecao} · a partir da entrega ${dataCurta(enc.entrega)}`); aviso('Datas em falta preenchidas a partir da entrega. Ajuste o que for preciso.') }}>
          Planear a partir da entrega</Botao>
      </div>
      {sit.alertas.length > 0 && <div className={clsx('mx-5 mb-3 text-[13px] rounded-controlo px-3 py-2 border flex gap-2', sit.nivel === 'atrasada' ? 'text-vermelho bg-vermelho-fraco border-vermelho/30' : 'text-ambar bg-ambar-fraco border-ambar-borda')}>
        <AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{sit.alertas.join(' · ')}</span></div>}
      <table className="w-full text-[13.5px]">
        <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-y border-linha bg-fundo/40">
          <th className="text-left px-5 py-2 font-medium">Etapa</th><th className="text-left px-2 font-medium">Quem</th><th className="text-left px-2 font-medium w-44">Data prevista</th>
          <th className="text-left px-2 font-medium">Situação</th><th className="text-right px-5 font-medium">Feita</th></tr></thead>
        <tbody>
          {ETAPAS.map(({ etapa, quem, diasAntes, opcoesQuem }) => {
            const p = prazoDe(enc, etapa)
            const d = p.data ? diasAte(p.data, hoje) : null
            return (
              <tr key={etapa} className="border-b border-linha">
                <td className="px-5 py-2.5 font-medium">{etapa}</td>
                <td className="px-2 py-2 text-suave">{opcoesQuem ? (
                  <select value={p.quem ?? quem} onChange={(ev) => { mudar(etapa, { quem: ev.target.value === quem ? undefined : ev.target.value }); log('Responsável da etapa', `${enc.cliente} · ${enc.colecao} · ${etapa}: ${ev.target.value}`) }}
                    className="h-8 px-2 rounded-md border border-linha bg-papel text-[13px] text-tinta outline-none focus:border-tinta-2">
                    {opcoesQuem.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>) : quem}</td>
                <td className="px-2 py-1.5"><input type="date" value={p.data ?? ''} onChange={(ev) => mudar(etapa, { data: ev.target.value || undefined })}
                  className="h-8 px-2 rounded-md border border-linha bg-papel text-[13px] outline-none focus:border-tinta-2" />
                  {!p.data && enc.entrega && <p className="text-[11px] text-tenue">sugestão: {diasAntes ? `${diasAntes} dias antes da entrega` : 'dia da entrega'}</p>}</td>
                <td className="px-2 py-2">{p.feito ? <Etiqueta tom="verde">Feita a {dataCurta(p.feito)}</Etiqueta>
                  : d == null ? <span className="text-tenue">—</span>
                    : d < 0 ? <Etiqueta tom="vermelho">Atrasada {-d} dia{d < -1 ? 's' : ''}</Etiqueta>
                      : d <= 3 ? <Etiqueta tom="ambar">{textoDias(d)}</Etiqueta> : <span className="text-suave">{textoDias(d)}</span>}</td>
                <td className="px-5 py-2 text-right">
                  <button onClick={() => { mudar(etapa, { feito: p.feito ? undefined : hoje }); if (!p.feito) log('Etapa concluída', `${enc.cliente} · ${enc.colecao} · ${etapa}`) }}
                    className={clsx('size-7 rounded-md border inline-grid place-items-center', p.feito ? 'bg-verde text-white border-verde' : 'border-linha text-transparent hover:text-tenue')} title={p.feito ? 'Desmarcar' : 'Marcar como feita hoje'}><Check size={15} /></button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-5 py-3 text-[12px] text-tenue">Prazo habitual: 4 semanas, mas depende do modelo, da lavagem e do planeamento anterior. O planeamento automático usa, dentro dessas 4 semanas, materiais 24 dias antes da entrega, corte 21, confeção 12, lavandaria 6 e embalamento 2: ajuste em cada encomenda.</p>
    </Cartao>
  )
}
