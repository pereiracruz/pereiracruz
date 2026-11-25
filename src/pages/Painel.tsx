import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, ClipboardList, Receipt, RotateCcw } from 'lucide-react'
import { useDb } from '../store/db'
import { Botao, Cartao, Pilulas, aviso } from '../components/ui'
import { calcularCusto, fichasGeradas, fichasPorAprovar, pecasModelo, soma } from '../lib/calc'
import { dataLonga, eur, int } from '../lib/format'
import { modoServidor } from '../lib/supabase'

export default function Painel() {
  const [sep, setSep] = useState<'fichas' | 'orc'>('fichas')
  const { encomendas, pedidos, clientes, repor } = useDb()
  const nav = useNavigate()

  const ultima = encomendas[0]
  const modelos = ultima ? [...ultima.modelos].sort((a, b) => pecasModelo(b) - pecasModelo(a)) : []
  const maxPecas = modelos.length ? pecasModelo(modelos[0]) : 1
  const totalPecas = soma(modelos.map(pecasModelo))

  const precos = pedidos.map((p) => p.precoMin ?? calcularCusto(p.linhas, clientes.find((c) => c.nome === p.cliente)).final)

  return (
    <>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-[32px] font-semibold tracking-[-0.02em]">Painel</h1>
        <div className="flex items-center gap-4">
          <span className="text-[14px] text-tenue">{dataLonga()}</span>
          {!modoServidor && <Botao variante="fantasma" icone={<RotateCcw size={15} />} onClick={() => {
            if (confirm('Repor os dados de exemplo? As alterações feitas neste browser perdem-se.')) { repor(); aviso('Dados de exemplo repostos.') }
          }}>Repor exemplo</Botao>}
          <Botao variante="primario" onClick={() => nav('/fichas/nova')}>Nova encomenda</Botao>
        </div>
      </div>

      <Pilulas className="mb-5" valor={sep} onChange={setSep} opcoes={[{ id: 'fichas', rotulo: 'Fichas de produção' }, { id: 'orc', rotulo: 'Pré-orçamentação' }]} />

      {sep === 'fichas' ? (
        <Cartao>
          <Cab icone={<ClipboardList size={17} />} titulo="Encomendas" sub="Fichas geradas a partir da encomenda e do tech pack" link="/fichas" linkTxt="Abrir encomendas" />
          <div className="grid grid-cols-3 border-y border-linha">
            <Num v={encomendas.length} r="encomendas" />
            <Num v={soma(encomendas.map(fichasGeradas))} r="fichas geradas" />
            <Num v={soma(encomendas.map(fichasPorAprovar))} r="por aprovar" />
          </div>
          {ultima && (
            <div className="p-6">
              <div className="flex items-center justify-between max-w-[540px] mb-4">
                <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-suave">Peças por modelo · {ultima.cliente} {ultima.colecao}</p>
                <p className="text-[12px] text-tenue">{int(totalPecas)} peças</p>
              </div>
              <div className="space-y-2.5 max-w-[540px]">
                {modelos.map((m) => (
                  <Link key={m.id} to={`/fichas/${ultima.id}`} className="grid grid-cols-[140px_1fr_50px] items-center gap-4 group">
                    <span className="text-[14px] truncate group-hover:underline">{m.nome}</span>
                    <span className="h-1.5 rounded-full bg-fundo-2 overflow-hidden"><span className="block h-full bg-tinta rounded-full" style={{ width: `${(pecasModelo(m) / maxPecas) * 100}%` }} /></span>
                    <span className="text-[13px] text-suave text-right num">{int(pecasModelo(m))}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Cartao>
      ) : (
        <Cartao>
          <Cab icone={<Receipt size={17} />} titulo="Pré-orçamentação" sub="Ficha de custo, peças parecidas e intervalo de preço" link="/orcamentos" linkTxt="Abrir pedidos" />
          <div className="grid grid-cols-3 border-y border-linha">
            <Num v={pedidos.length} r="pedidos" />
            <Num v={pedidos.filter((p) => p.estado === 'Por validar').length} r="por validar" />
            <Num v={precos.length ? eur(soma(precos) / precos.length) : '—'} r="preço médio por peça" />
          </div>
          <div className="p-6 max-w-[540px]">
            <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-suave mb-4">Preço por peça · mais recente primeiro</p>
            {pedidos.map((p, i) => (
              <Link key={p.id} to={`/orcamentos/${p.id}`} className="flex justify-between py-2 border-b border-linha last:border-0 hover:underline">
                <span className="text-[14px]">{p.peca} · {p.variante}</span><span className="text-[14px] num">{eur(precos[i])}</span>
              </Link>
            ))}
          </div>
        </Cartao>
      )}
    </>
  )
}

const Cab = ({ icone, titulo, sub, link, linkTxt }: { icone: React.ReactNode; titulo: string; sub: string; link: string; linkTxt: string }) => (
  <div className="flex items-start justify-between px-6 py-5">
    <div className="flex gap-3"><span className="text-suave mt-1">{icone}</span><div><h2 className="text-[18px] font-semibold">{titulo}</h2><p className="text-[13px] text-suave">{sub}</p></div></div>
    <Link to={link} className="text-[14px] text-tinta-2 hover:text-tinta flex items-center gap-1">{linkTxt} <ArrowUpRight size={14} /></Link>
  </div>
)
const Num = ({ v, r }: { v: React.ReactNode; r: string }) => (
  <div className="px-6 py-5 border-r border-linha last:border-0"><p className="text-[30px] font-semibold tracking-tight num">{v}</p><p className="text-[12px] text-suave">{r}</p></div>
)

