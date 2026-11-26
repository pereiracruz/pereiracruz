import { Fragment } from 'react'
import clsx from 'clsx'
import { AlertTriangle, Copy, FileSpreadsheet } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cartao, Etiqueta, aviso, type Tom } from '../../components/ui'
import { ESTADOS_COMPRA, MARGEM_COMPRAS, estadoDe, exportarCompras, necessidadesCompra, textoFornecedor, type LinhaCompra } from '../../lib/compras'
import { dataCurta, hojeISO, int, num } from '../../lib/format'
import type { Encomenda, EstadoCompra, EstadoCompraTipo } from '../../types'

export const TOM_COMPRA: Record<EstadoCompraTipo, Tom> = { 'Por encomendar': 'ambar', Encomendado: 'azul', Recebido: 'verde' }

export function useMudarCompra() {
  const { atualizarEncomenda, log } = useDb()
  return (e: Encomenda, ls: LinhaCompra[], x: Partial<EstadoCompra>) => {
    atualizarEncomenda(e.id, (enc) => {
      const atual = enc.compras ?? []
      const novos = ls.map((l) => {
        const antes = atual.find((c) => c.chave === l.chave) ?? { chave: l.chave, estado: 'Por encomendar' as const }
        return { ...antes, ...x, ...(x.estado && x.estado !== antes.estado ? { data: x.estado === 'Por encomendar' ? undefined : hojeISO() } : {}) }
      })
      return { ...enc, compras: [...atual.filter((c) => !ls.some((l) => l.chave === c.chave)), ...novos] }
    })
    if (x.estado) log('Compras', `${e.cliente} · ${e.colecao} · ${ls.length === 1 ? `${ls[0].ref} (${ls[0].fornecedor})` : `${ls.length} materiais de ${ls[0].fornecedor}`}: ${x.estado}`)
  }
}

export function SeletorCompra({ valor, onChange }: { valor: EstadoCompraTipo; onChange: (v: EstadoCompraTipo) => void }) {
  return (
    <select value={valor} onClick={(ev) => ev.stopPropagation()} onChange={(ev) => onChange(ev.target.value as EstadoCompraTipo)}
      className={clsx('h-8 rounded-md border px-2 text-[12.5px] font-medium outline-none', { ambar: 'bg-ambar-fraco border-ambar-borda text-ambar', azul: 'bg-azul-fraco border-azul/30 text-azul', verde: 'bg-verde-fraco border-verde-borda text-verde' }[TOM_COMPRA[valor] as 'ambar' | 'azul' | 'verde'])}>
      {ESTADOS_COMPRA.map((s) => <option key={s}>{s}</option>)}
    </select>
  )
}

const qtd = (l: LinhaCompra, v: number | null) => v == null ? <span className="text-ambar text-[12px]">{l.semConsumo ? 'conforme a encomenda' : 'consumo a confirmar'}</span> : <span className="num">{num(Math.round(v * 100) / 100)} {l.unidade === 'm' ? 'm' : 'un.'}</span>

export default function ComprasEncomenda({ enc }: { enc: Encomenda }) {
  const { atualizarEncomenda } = useDb()
  const mudar = useMudarCompra()
  const linhas = necessidadesCompra(enc)
  const margem = enc.margemCompras ?? MARGEM_COMPRAS
  const semFicha = enc.modelos.filter((m) => !m.materiais.length)
  const fornecedores = [...new Set(linhas.map((l) => (l.daCliente ? '' : l.fornecedor)))].filter(Boolean)
  const daCliente = linhas.filter((l) => l.daCliente)
  const porEncomendar = linhas.filter((l) => !l.daCliente && estadoDe(enc, l.chave).estado === 'Por encomendar').length
  const porReceber = linhas.filter((l) => estadoDe(enc, l.chave).estado !== 'Recebido').length

  const grupo = (titulo: React.ReactNode, ls: LinhaCompra[], acoes?: React.ReactNode) => (
    <Fragment key={String(titulo)}>
      <tr className="bg-fundo/60 border-y border-linha"><td colSpan={8} className="px-5 py-2">
        <div className="flex items-center justify-between gap-3 flex-wrap"><span className="font-semibold">{titulo}</span><span className="flex gap-2">{acoes}</span></div>
      </td></tr>
      {ls.map((l) => {
        const est = estadoDe(enc, l.chave)
        return (
          <tr key={l.chave} className="border-b border-linha align-top">
            <td className="px-5 py-2"><p>{l.ref}</p><p className="text-[12px] text-tenue">{l.tipo} · {l.modelos.join(', ')}</p></td>
            <td className="px-2 py-2 text-[13px]">{l.cor}</td>
            <td className="px-2 py-2 text-right num">{int(l.pecas)}</td>
            <td className="px-2 py-2 text-right text-suave">{qtd(l, l.qtd)}</td>
            <td className="px-2 py-2 text-right font-semibold">{l.qtdComprar == null ? '—' : qtd(l, l.qtdComprar)}{l.aConfirmar && l.qtd != null && <p className="text-[11px] text-ambar font-normal">há consumos por confirmar</p>}</td>
            <td className="px-2 py-1.5"><SeletorCompra valor={est.estado} onChange={(v) => mudar(enc, [l], { estado: v })} />{est.data && <p className="text-[11px] text-tenue mt-0.5">{dataCurta(est.data)}</p>}</td>
            <td className="px-5 py-1.5"><input key={est.nota} defaultValue={est.nota} placeholder="Nota (ex.: nº do pedido)" onBlur={(ev) => ev.target.value !== (est.nota ?? '') && mudar(enc, [l], { nota: ev.target.value || undefined })}
              className="w-full h-8 px-2 rounded-md border border-linha bg-papel text-[12.5px] outline-none focus:border-tinta-2" /></td>
          </tr>
        )
      })}
    </Fragment>
  )

  return (
    <Cartao>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Compras · Pereira's Project</h3>
          <p className="text-[13px] text-suave">Materiais das fichas × peças de cada variante, por fornecedor. {linhas.length} materiais · {porEncomendar} por encomendar · {porReceber} por receber.</p>
        </div>
        <div className="flex items-center gap-3 text-[13px] flex-wrap">
          <span className="text-suave">Margem de quebra:</span>
          {(['tecido', 'acessorios'] as const).map((k) => (
            <label key={k} className="flex items-center gap-1">{k === 'tecido' ? 'tecido' : 'acessórios'}
              <input type="number" min={0} step={0.5} value={margem[k]} onChange={(ev) => atualizarEncomenda(enc.id, (x) => ({ ...x, margemCompras: { ...margem, [k]: Number(ev.target.value) || 0 } }))}
                className="w-14 h-8 px-2 rounded-md border border-linha bg-papel text-right outline-none focus:border-tinta-2" /> %</label>
          ))}
          <Botao pequeno icone={<FileSpreadsheet size={14} />} disabled={!linhas.length} onClick={() => aviso(`${exportarCompras(enc)} descarregado.`)}>Excel</Botao>
        </div>
      </div>
      {semFicha.length > 0 && <p className="mx-5 mb-3 text-[13px] text-ambar bg-ambar-fraco border border-ambar-borda rounded-controlo px-3 py-2 flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />
        {semFicha.length} modelo(s) ainda sem ficha ({semFicha.map((m) => m.nome).join(', ')}): os materiais desses modelos ainda não entram nas compras.</p>}
      {!linhas.length ? <p className="px-5 pb-5 text-[14px] text-tenue">Ainda não há materiais: gere as fichas dos modelos.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px] min-w-[760px]">
            <thead><tr className="text-[11px] uppercase tracking-wider text-suave">
              <th className="text-left px-5 py-2 font-medium">Material</th><th className="text-left px-2 font-medium">Cor</th><th className="text-right px-2 font-medium">Peças</th>
              <th className="text-right px-2 font-medium">Necessário</th><th className="text-right px-2 font-medium">A comprar</th><th className="text-left px-2 font-medium w-36">Estado</th><th className="text-left px-5 font-medium">Nota</th></tr></thead>
            <tbody>
              {fornecedores.map((f) => {
                const ls = linhas.filter((l) => l.fornecedor === f && !l.daCliente)
                return grupo(f, ls, <>
                  <Botao pequeno variante="fantasma" icone={<Copy size={13} />} onClick={() => { const t = textoFornecedor(enc, f, linhas); navigator.clipboard?.writeText(t).then(() => aviso(`Pedido para ${f} copiado.`), () => window.prompt('Copie o pedido:', t)) }}>Copiar pedido</Botao>
                  {ls.some((l) => estadoDe(enc, l.chave).estado === 'Por encomendar') && <Botao pequeno onClick={() => mudar(enc, ls.filter((l) => estadoDe(enc, l.chave).estado === 'Por encomendar'), { estado: 'Encomendado' })}>Marcar como encomendado</Botao>}
                </>)
              })}
              {daCliente.length > 0 && grupo(<span>Enviado pela cliente <Etiqueta ponto={false}>não se compra · confirmar a receção</Etiqueta></span>, daCliente)}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  )
}
