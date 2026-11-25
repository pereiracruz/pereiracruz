import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { Destinatario, Encomenda, FolhaTipo, LinhaMaterial, Modelo, Variante } from '../types'
import { packingList, soma, totalMaterial, totalVariante } from '../lib/calc'
import { dataCurta, num } from '../lib/format'

export const NOME_FOLHA: Record<FolhaTipo, string> = {
  produto: 'Ficha de produto', corte: 'Corte e confeção', lavandaria: 'Lavandaria', bordador: 'Bordador',
  estampador: 'Estampador', embalamento: 'Embalamento', packing: 'Packing list', medidas: 'Medidas',
}

export function folhasDoModelo(m: Modelo): FolhaTipo[] {
  const f: FolhaTipo[] = ['produto', 'corte']
  if (m.lavagem) f.push('lavandaria')
  if (m.operacoes.some((o) => o.tipo === 'Bordado')) f.push('bordador')
  if (m.operacoes.some((o) => o.tipo === 'Estampado')) f.push('estampador')
  f.push('embalamento', 'packing', 'medidas')
  return f
}

export const idEncomendaVariante = (e: Encomenda, prefixo: string, v: Variante) => {
  const todas = e.modelos.flatMap((m) => m.variantes)
  const i = todas.findIndex((x) => x.id === v.id && x.ref === v.ref) + 1
  return `${prefixo}-${e.colecao.replace(/\W/g, '')}-${String(i).padStart(2, '0')}`
}

const fmtQtd = (l: LinhaMaterial, v: Variante) => {
  const t = totalMaterial(l, v)
  if (t == null) return 'A confirmar'
  return l.unidade === 'm' ? `${num(Math.round(t * 100) / 100)} m` : num(t)
}
const fmtCons = (l: LinhaMaterial) => (l.consumo == null ? 'A confirmar' : l.unidade === 'm' ? `${num(l.consumo)} m` : num(l.consumo))

// ---------- primitivas da folha ----------
const Faixa = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={clsx('bg-folha-faixa text-folha-titulo text-center text-[12px] font-semibold py-1.5 border-b border-[#9fb3cc]', className)}>{children}</div>
)
function T({ cab, linhas, total, destacarUltima }: { cab: string[]; linhas: ReactNode[][]; total?: ReactNode[]; destacarUltima?: boolean }) {
  return (
    <table className="w-full text-[12px] border-collapse">
      <thead><tr className="bg-folha-cab text-white">{cab.map((c, i) => <th key={i} className="px-2 py-2 font-semibold text-center">{c}</th>)}</tr></thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className="border-b border-linha">
            {l.map((c, j) => <td key={j} className={clsx('px-2 py-1.5 text-center num', j === 0 && 'text-left', destacarUltima && j === l.length - 1 && 'font-bold')}>{c}</td>)}
          </tr>
        ))}
        {total && <tr className="border-b border-linha bg-fundo/40">{total.map((c, j) => <td key={j} className="px-2 py-1.5 text-center font-semibold num">{c}</td>)}</tr>}
      </tbody>
    </table>
  )
}
const Obs = ({ titulo, itens }: { titulo: string; itens: string[] }) => (
  <div>
    <Faixa>{titulo}</Faixa>
    <ul className="list-disc pl-7 pr-3 py-2 text-[12px] space-y-0.5 min-h-[40px]">{itens.map((t, i) => <li key={i}>{t}</li>)}</ul>
  </div>
)

function Desenho() {
  return (
    <svg viewBox="0 0 120 90" className="w-28 text-azul/60">
      <path d="M40 10 L52 6 Q60 12 68 6 L80 10 L98 26 L88 36 L82 30 L82 84 L38 84 L38 30 L32 36 L22 26 Z" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.2" />
      <path d="M60 12 L60 84" stroke="currentColor" strokeWidth=".8" strokeDasharray="2 2" />
    </svg>
  )
}

const ROTULO_TOTAL: Record<FolhaTipo, string> = {
  produto: 'TOTAL CORTADO', corte: 'TOTAL CORTADO', bordador: 'TOTAL CORTADO', estampador: 'TOTAL CORTADO', medidas: 'TOTAL CORTADO',
  lavandaria: 'TOTAL CONFECIONADO', embalamento: 'TOTAL EMBALADO', packing: 'TOTAL EMBALADO',
}

export interface FolhaProps {
  enc: Encomenda; m: Modelo; v: Variante; folha: FolhaTipo; idEnc: string; destinatarios: Destinatario[]; dataFicha: string; logo?: string
}

/** Uma folha no formato da fábrica. Componente puro: também é usado para imprimir/PDF. */
export function Folha({ enc, m, v, folha, idEnc, destinatarios, dataFicha, logo = '/logo-timbrado.png' }: FolhaProps) {
  const tam = m.escala.slice(0, v.qtd.length)
  const total = totalVariante(v)
  const dest = destinatarios.find((d) => d.folha === folha)
  const tecidos = m.materiais.filter((l) => l.folha === 'tecido')
  const conf = m.materiais.filter((l) => l.folha === 'confecao')
  const emb = m.materiais.filter((l) => l.folha === 'embalamento')
  const linhaTec = (l: LinhaMaterial) => [l.ref.toUpperCase(), l.fornecedor.toUpperCase(), l.largura ?? '—', fmtCons(l), l.cor === 'Conforme variante' ? v.nome : l.cor, fmtQtd(l, v)]
  const linhaAc = (l: LinhaMaterial) => [l.ref, l.fornecedor, l.obs, fmtCons(l), l.cor, fmtQtd(l, v)]
  const cabAc = ['Referência / item', 'Fornecedor', 'Observações', 'Cons/un', 'Cor', 'Total']
  const cabTec = ['Referência', 'Fornecedor', 'Largura útil', 'Cons/un', 'Cor', 'Total']
  const qtdLinha = [...v.qtd, total]

  return (
    <div className="bg-white border border-linha-forte rounded-cartao overflow-hidden text-tinta print-area">
      {/* cabeçalho */}
      <div className="grid grid-cols-[220px_1fr_190px] border-b border-linha-forte">
        <div className="grid place-items-center p-3 border-r border-linha-forte"><img src={logo} alt="Pereira & Cruz" className="max-h-24 w-auto" /></div>
        <div>
          <p className="text-center font-bold text-[15px] py-2.5 border-b border-linha-forte">FICHA DO PRODUTO</p>
          <Faixa>Informação geral da encomenda</Faixa>
          <div className="grid grid-cols-[110px_1fr_140px_1fr] text-[12px]">
            {[['CLIENTE:', enc.cliente.toUpperCase(), 'MODELO:', `${m.nome.toUpperCase()} · ${v.nome.toUpperCase()}`],
              ['DATA:', dataCurta(dataFicha), 'DESCRIÇÃO DA PEÇA:', m.descricao],
              ['DATA DE ENTREGA:', dataCurta(enc.entrega), 'ID ENCOMENDA:', idEnc]].map((r, i) => (
              r.map((c, j) => <div key={`${i}${j}`} className={clsx('px-2 py-2 border-b border-r border-linha-forte', j % 2 === 0 && 'font-bold')}>{c}</div>)
            ))}
          </div>
        </div>
        <div className="grid place-items-center border-l border-linha-forte p-2"><Desenho /></div>
      </div>

      {/* quantidades */}
      <Faixa>Distribuição de quantidades por tamanho</Faixa>
      <T cab={['TECIDO', 'Ref. cor', ...tam, 'Totais']} destacarUltima
        linhas={[[(tecidos[0]?.ref ?? m.tecido ?? '—').toUpperCase(), v.refCor, ...qtdLinha]]}
        total={[ROTULO_TOTAL[folha], '', ...qtdLinha]} />

      {dest && folha !== 'produto' && (
        <div className="flex items-center justify-between px-3 py-2 bg-fundo/50 border-y border-linha-forte text-[12px]">
          <span><b>Para:</b> {NOME_FOLHA[folha] === dest.nome ? dest.nome : `${NOME_FOLHA[folha]} · ${dest.nome}`}</span>
          <span className="text-suave">{dest.contacto}</span>
        </div>
      )}

      {folha === 'produto' && (
        <div className="grid grid-cols-[1.6fr_1fr]">
          <div className="border-r border-linha-forte">
            <Faixa>Tecidos</Faixa><T cab={cabTec} linhas={tecidos.map(linhaTec)} />
            <Faixa>Acessórios</Faixa><T cab={cabAc} linhas={[...conf, ...emb].map(linhaAc)} />
          </div>
          <div>
            <Faixa>Bordados / estampados</Faixa>
            <T cab={['Imagem', 'Operação', 'Fornecedor', 'Cor']} linhas={m.operacoes.length ? m.operacoes.map((o) => ['▣', `${o.posicao.toUpperCase()} · ${o.medidas}`, o.fornecedor.toUpperCase(), o.cor]) : [['—', 'Sem bordados nem estampados', '', '']]} />
            <Obs titulo="Observações para confeção e lavagem" itens={m.observacoes} />
            <Obs titulo="Novas observações" itens={m.novasObservacoes} />
          </div>
        </div>
      )}

      {folha === 'corte' && (
        <>
          <Faixa>Tecidos</Faixa><T cab={cabTec} linhas={tecidos.map(linhaTec)} />
          <Faixa>Acessórios de confeção</Faixa><T cab={cabAc} linhas={conf.map(linhaAc)} />
          <Obs titulo="Observações para confeção" itens={[...m.observacoes.filter((o) => !/^Lavagem/i.test(o)), ...m.novasObservacoes]} />
        </>
      )}

      {folha === 'lavandaria' && (
        <>
          <Faixa>Tratamento e código de lavagem por variante</Faixa>
          <p className="px-3 py-2 text-[12px] font-semibold border-b border-linha">Tratamento: {(m.lavagem ?? v.nome).toUpperCase()}</p>
          <T cab={['Cor do cliente', 'Código de lavagem', ...tam, 'Totais']} destacarUltima
            linhas={[[v.refCor.charAt(0) + v.refCor.slice(1).toLowerCase(), v.codigoLavagem, ...qtdLinha]]} total={['TOTAL', '', ...qtdLinha]} />
          <Obs titulo="Observações para a lavandaria" itens={[
            `Lavagem: ${(m.lavagem ?? v.nome).toLowerCase()}, como no tech pack.`,
            m.operacoes.some((o) => o.tipo === 'Bordado') ? 'Enviar a peça confecionada, com o bordado já feito.' : 'Enviar a peça confecionada.',
            'Seguir amostra física para a tonalidade.',
          ]} />
        </>
      )}

      {(folha === 'bordador' || folha === 'estampador') && (() => {
        const tipo = folha === 'bordador' ? 'Bordado' : 'Estampado'
        const ops = m.operacoes.filter((o) => o.tipo === tipo)
        return (
          <>
            <Faixa>{tipo === 'Bordado' ? 'Bordados' : 'Estampados'}</Faixa>
            <T cab={['Imagem', 'Posição', 'Medidas', tipo === 'Bordado' ? 'Cor da linha' : 'Cor', 'Quantidade']} linhas={ops.map((o) => ['▣', o.posicao.toUpperCase(), o.medidas, o.cor, total])} />
            <Obs titulo={`Observações para o ${tipo === 'Bordado' ? 'bordador' : 'estampador'}`} itens={[
              tipo === 'Bordado' ? 'Bordar antes de confecionar a frente.' : 'Estampar antes de confecionar.',
              'A quantidade é a do corte desta variante: confere com a ficha de produto.',
              `Seguir a imagem e a posição do tech pack.`,
            ]} />
          </>
        )
      })()}

      {folha === 'embalamento' && (
        <>
          <Faixa>Acessórios de embalamento</Faixa><T cab={cabAc} linhas={emb.map(linhaAc)} />
          <Obs titulo="Observações para embalamento" itens={['Uma peça por saco, com o autocolante colado no saco.', ...(emb.some((l) => /cliente/i.test(l.fornecedor)) ? ['Acessórios enviados pela cliente: conferir a quantidade à chegada.'] : [])]} />
        </>
      )}

      {folha === 'packing' && (() => {
        const cx = packingList(v.qtd, m.caixaMax)
        return (
          <>
            <Faixa>{cx.length} {cx.length === 1 ? 'caixa' : 'caixas'} de, no máximo, {m.caixaMax} peças</Faixa>
            <T cab={['Caixa nº', ...tam, 'Peças']} destacarUltima linhas={cx.map((c, i) => [i + 1, ...c.map((x) => x || ''), soma(c)])} total={['TOTAL', ...qtdLinha]} />
            <Obs titulo="Notas" itens={['As caixas enchem-se tamanho a tamanho; pode redistribuir antes de imprimir.', 'O total por tamanho é sempre o da encomenda.']} />
          </>
        )
      })()}

      {folha === 'medidas' && (
        m.medidas.length ? (
          <>
            <Faixa>Tabela de medidas e graduação · tamanho base: {m.medidasBase ?? '—'} · medidas em cm</Faixa>
            <T cab={['Ponto de medida', '', ...tam, 'Graduação']}
              linhas={m.medidas.map((md) => [md.ponto, md.techPack ? <span key="t" className="text-[10px] font-bold text-azul bg-azul-fraco px-1 rounded">TECH PACK</span> : '', ...md.valores.map((x) => (x == null ? '—' : num(x))), md.graduacao])} />
            <Obs titulo="Nota" itens={['Só os pontos marcados TECH PACK vêm do documento da cliente; os restantes são da modelista.']} />
          </>
        ) : (
          <div className="p-6 text-center text-[13px] text-vermelho bg-vermelho-fraco">O tech pack não inclui tabela de medidas: medidas por preencher pela modelista.</div>
        )
      )}
    </div>
  )
}
