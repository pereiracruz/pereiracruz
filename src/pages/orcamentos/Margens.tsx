import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useDb } from '../../store/db'
import { Cabecalho, Cartao, Kpi, Seletor, Tabela } from '../../components/ui'
import { MARGEM_OBJETIVO, calcularCusto, precosSugeridos } from '../../lib/calc'
import { eur } from '../../lib/format'
import type { Pedido } from '../../types'

/** Coleção de um pedido: SS27, FW27… tirada do ficheiro da ficha de custo ou do nome do pedido. */
export function colecaoDe(p: Pedido) {
  const m = `${p.origemFicheiro ?? ''} ${p.peca} ${p.variante}`.toUpperCase().match(/(?:^|[^A-Z0-9])(SS|FW|AW|PV|OI)[\s_-]?(\d{2})(?!\d)/)
  if (m) return `${m[1]}${m[2]}`
  const g = (p.origemFicheiro ?? '').match(/(?:^|[^0-9])(0[1-9]|1[0-2])(20\d{2})(?!\d)/) // ex.: …_092026 → 09/2026
  return g ? `${g[1]}/${g[2]}` : p.criadoEm.slice(0, 4)
}

type Linha = { p: Pedido; colecao: string; custo: number; preco: number; margem: number; pct: number; objetivo: number }
type Grupo = { id: string; n: number; custo: number; preco: number; margem: number; pct: number; min: number; max: number; abaixo: number; prejuizo: number }

const pct = (v: number) => `${v.toFixed(1).replace('.', ',')} %`
const tom = (v: number) => (v < 0 ? 'text-vermelho font-semibold' : v < MARGEM_OBJETIVO ? 'text-ambar' : 'text-verde')

function agrupar(ls: Linha[], chave: (l: Linha) => string): Grupo[] {
  const m = new Map<string, Linha[]>()
  for (const l of ls) m.set(chave(l), [...(m.get(chave(l)) ?? []), l])
  return [...m.entries()].map(([id, g]) => {
    const custo = g.reduce((s, l) => s + l.custo, 0), preco = g.reduce((s, l) => s + l.preco, 0)
    return { id, n: g.length, custo: custo / g.length, preco: preco / g.length, margem: (preco - custo) / g.length, pct: custo ? ((preco - custo) / custo) * 100 : 0,
      min: Math.min(...g.map((l) => l.pct)), max: Math.max(...g.map((l) => l.pct)), abaixo: g.filter((l) => l.pct < MARGEM_OBJETIVO).length, prejuizo: g.filter((l) => l.margem < 0).length }
  }).sort((a, b) => b.n - a.n)
}

function TabelaGrupos({ titulo, grupos }: { titulo: string; grupos: Grupo[] }) {
  return (
    <Cartao>
      <h3 className="font-semibold px-5 pt-5 pb-3">{titulo}</h3>
      <div className="overflow-x-auto"><table className="w-full text-[13.5px] whitespace-nowrap">
        <thead><tr className="text-[11px] uppercase tracking-wider text-suave border-y border-linha bg-fundo/40">
          <th className="text-left px-5 py-2 font-medium" /><th className="text-right px-2 font-medium">Fichas</th><th className="text-right px-2 font-medium">Custo médio</th>
          <th className="text-right px-2 font-medium">Preço médio</th><th className="text-right px-2 font-medium">Margem média</th><th className="text-right px-2 font-medium">Mín · máx</th>
          <th className="text-right px-5 font-medium">Abaixo de {MARGEM_OBJETIVO} %</th></tr></thead>
        <tbody>{grupos.map((g) => (
          <tr key={g.id} className="border-b border-linha">
            <td className="px-5 py-2 font-medium">{g.id}</td><td className="px-2 text-right num">{g.n}</td><td className="px-2 text-right num">{eur(g.custo)}</td>
            <td className="px-2 text-right num">{eur(g.preco)}</td>
            <td className={clsx('px-2 text-right num', tom(g.pct))}>{eur(g.margem)} · {pct(g.pct)}</td>
            <td className="px-2 text-right num text-suave">{pct(g.min)} · {pct(g.max)}</td>
            <td className="px-5 text-right num">{g.abaixo}{g.prejuizo > 0 && <span className="text-vermelho"> ({g.prejuizo} abaixo do custo)</span>}</td>
          </tr>))}</tbody>
      </table></div>
    </Cartao>
  )
}

export default function Margens() {
  const nav = useNavigate()
  const pedidos = useDb((s) => s.pedidos)
  const clientes = useDb((s) => s.clientes)
  const [cliente, setCliente] = useState('')
  const [colecao, setColecao] = useState('')
  const todas: Linha[] = useMemo(() => pedidos
    .filter((p) => p.precoFinal != null || ['Validado', 'Enviado', 'Fechado'].includes(p.estado))
    .map((p) => {
      const cfg = clientes.find((x) => x.nome === p.cliente)
      const c = calcularCusto(p.linhas, cfg, p.precoFinal, p)
      return { p, colecao: colecaoDe(p), custo: c.total, preco: c.final, margem: c.margem, pct: c.margemPct, objetivo: precosSugeridos(p.linhas, cfg, p).objetivo }
    }).filter((l) => l.custo > 0), [pedidos, clientes])
  const linhas = todas.filter((l) => (!cliente || l.p.cliente === cliente) && (!colecao || l.colecao === colecao))
  const total = agrupar(linhas, () => 'Total')[0]

  return (
    <>
      <Cabecalho sobre="Pré-orçamentação" titulo="Margens"
        sub={`Margem sobre o custo de cada ficha de custo com preço final, comparada com o objetivo de ${MARGEM_OBJETIVO} %. Inclui fichas importadas e orçamentos validados.`}
        acoes={<div className="flex gap-2">
          <Seletor valor={cliente} onChange={setCliente} vazio="Todos os clientes" opcoes={[...new Set(todas.map((l) => l.p.cliente))].sort()} />
          <Seletor valor={colecao} onChange={setColecao} vazio="Todas as coleções" opcoes={[...new Set(todas.map((l) => l.colecao))].sort()} />
        </div>} />
      {!total ? <Cartao className="p-6 text-[14px] text-tenue">Ainda não há fichas de custo com preço final. Importe as fichas em Pedidos → Importar fichas de custo.</Cartao> : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-5">
          <Kpi rotulo="Fichas" valor={total.n} sub={`${new Set(linhas.map((l) => l.p.cliente)).size} cliente(s) · ${new Set(linhas.map((l) => l.colecao)).size} coleção(ões)`} />
          <Kpi rotulo="Margem média sobre o custo" valor={pct(total.pct)} sub={`${eur(total.margem)} por peça`} tom={total.pct >= MARGEM_OBJETIVO ? 'verde' : total.pct < 0 ? 'vermelho' : 'ambar'} />
          <Kpi rotulo={`Abaixo do objetivo (${MARGEM_OBJETIVO} %)`} valor={total.abaixo} sub={`de ${total.n} fichas`} tom={total.abaixo ? 'ambar' : 'verde'} />
          <Kpi rotulo="Abaixo do custo" valor={total.prejuizo} tom={total.prejuizo ? 'vermelho' : undefined} />
        </div>
        <div className="space-y-4 mb-5">
          <TabelaGrupos titulo="Por cliente" grupos={agrupar(linhas, (l) => l.p.cliente)} />
          <TabelaGrupos titulo="Por coleção" grupos={agrupar(linhas, (l) => `${l.p.cliente} · ${l.colecao}`)} />
        </div>
        <Tabela<Linha> linhas={[...linhas].sort((a, b) => a.pct - b.pct)} chave={(l) => l.p.id} onLinha={(l) => nav(`/orcamentos/${l.p.id}`)}
          colunas={[
            { id: 'peca', rotulo: 'Peça', filtro: 'texto', valor: (l) => `${l.p.peca} ${l.p.variante}`, render: (l) => <div><p className="font-medium">{l.p.peca}{l.p.variante && ` · ${l.p.variante}`}</p><p className="text-[12px] text-tenue">{l.p.tipoPeca}{l.p.origemFicheiro && ` · ${l.p.origemFicheiro}`}</p></div> },
            { id: 'cli', rotulo: 'Cliente', valor: (l) => l.p.cliente },
            { id: 'col', rotulo: 'Coleção', valor: (l) => l.colecao },
            { id: 'custo', rotulo: 'Custo', alinhar: 'dir', valor: (l) => l.custo, render: (l) => eur(l.custo) },
            { id: 'preco', rotulo: 'Preço final', alinhar: 'dir', valor: (l) => l.preco, render: (l) => eur(l.preco) },
            { id: 'margem', rotulo: 'Margem', alinhar: 'dir', valor: (l) => l.pct, render: (l) => <span className={tom(l.pct)}>{eur(l.margem)} · {pct(l.pct)}</span> },
            { id: 'falta', rotulo: `Preço para ${MARGEM_OBJETIVO} %`, alinhar: 'dir', valor: (l) => l.objetivo,
              render: (l) => l.pct >= MARGEM_OBJETIVO ? <span className="text-tenue">—</span> : <span className="num">{eur(l.objetivo)} <span className="text-tenue text-[12px]">(+{eur(l.objetivo - l.preco)})</span></span> },
          ]} />
      </>}
    </>
  )
}
