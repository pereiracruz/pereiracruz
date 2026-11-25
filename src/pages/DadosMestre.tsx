import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useDb, type NomeTabela, type Tabelas } from '../store/db'
import { Botao, Cabecalho, Campo, Chips, Entrada, Etiqueta, Modal, Seletor, Tabela, aviso, type Coluna } from '../components/ui'
import { eur, uid } from '../lib/format'
import { NOME_FOLHA } from '../components/Folhas'

type Linha = Record<string, unknown> & { id: string }
interface Def {
  campo: string; rotulo: string; tipo?: 'texto' | 'numero' | 'lista' | 'tamanhos'; opcoes?: string[]; filtro?: 'texto' | 'lista'
  mostrar?: (l: Linha) => React.ReactNode
}
interface Separador { id: NomeTabela; rotulo: string; desc?: string; defs: Def[]; titulo: (l: Linha) => string }

const FOLHAS = Object.keys(NOME_FOLHA)

const SEPARADORES: Separador[] = [
  { id: 'fornecedores', rotulo: 'Fornecedores', titulo: (l) => String(l.nome), defs: [
    { campo: 'nome', rotulo: 'Fornecedor', filtro: 'texto', mostrar: (l) => <span className="font-medium">{String(l.nome)}</span> },
    { campo: 'tipo', rotulo: 'Tipo', tipo: 'lista', opcoes: ['Tecido', 'Forro', 'Acessórios', 'Embalagem', 'Serviço externo'], filtro: 'lista' },
    { campo: 'fornece', rotulo: 'O que fornece', filtro: 'texto' },
  ] },
  { id: 'tecidos', rotulo: 'Tecidos', desc: 'Tecidos da Pereira & Cruz, com a largura útil usada no corte.', titulo: (l) => String(l.nome), defs: [
    { campo: 'nome', rotulo: 'Tecido', filtro: 'texto', mostrar: (l) => <span className="font-medium">{String(l.nome)}</span> },
    { campo: 'fornecedor', rotulo: 'Fornecedor', filtro: 'lista' },
    { campo: 'composicao', rotulo: 'Composição' },
    { campo: 'larguraUtil', rotulo: 'Largura útil' },
    { campo: 'precoM', rotulo: 'Preço por metro', tipo: 'numero', mostrar: (l) => (l.precoM ? eur(Number(l.precoM)) : <span className="text-tenue">—</span>) },
  ] },
  { id: 'equivalencias', rotulo: 'Equivalências de tecido', desc: 'O tecido do tech pack nunca passa para a ficha: usa-se o equivalente desta tabela ou uma decisão registada.', titulo: (l) => String(l.tecidoCliente), defs: [
    { campo: 'tecidoCliente', rotulo: 'Tecido da cliente', filtro: 'texto' },
    { campo: 'tecidoCasa', rotulo: 'Tecido da Pereira & Cruz', filtro: 'texto', mostrar: (l) => <span className="font-medium">{String(l.tecidoCasa)}</span> },
    { campo: 'ondeUsou', rotulo: 'Onde se usou' },
    { campo: 'estado', rotulo: 'Estado', tipo: 'lista', opcoes: ['A confirmar', 'Confirmada'], filtro: 'lista', mostrar: (l) => <Etiqueta tom={l.estado === 'Confirmada' ? 'verde' : 'ambar'}>{String(l.estado)}</Etiqueta> },
  ] },
  { id: 'lavagens', rotulo: 'Lavagens e tingimentos', titulo: (l) => String(l.nome), defs: [
    { campo: 'sufixo', rotulo: 'Sufixo', mostrar: (l) => <span className="font-mono text-[13px]">{String(l.sufixo)}</span> },
    { campo: 'nome', rotulo: 'Lavagem ou cor', filtro: 'texto' },
    { campo: 'cliente', rotulo: 'Cliente', filtro: 'lista' },
    { campo: 'codigo', rotulo: 'Código para a lavandaria', filtro: 'texto' },
  ] },
  { id: 'acessorios', rotulo: 'Acessórios por cliente', titulo: (l) => String(l.item), defs: [
    { campo: 'cliente', rotulo: 'Cliente', filtro: 'lista' },
    { campo: 'item', rotulo: 'Acessório', filtro: 'texto' },
    { campo: 'fornecedor', rotulo: 'Fornecedor', filtro: 'lista' },
    { campo: 'consumo', rotulo: 'Consumo' },
  ] },
  { id: 'escalas', rotulo: 'Tamanhos', titulo: (l) => String(l.nome), defs: [
    { campo: 'nome', rotulo: 'Escala', mostrar: (l) => <span className="font-medium">{String(l.nome)}</span> },
    { campo: 'tamanhos', rotulo: 'Tamanhos', tipo: 'tamanhos', mostrar: (l) => (l.tamanhos as string[]).join(' · ') },
    { campo: 'usadaEm', rotulo: 'Usada em' },
  ] },
  { id: 'destinatarios', rotulo: 'Destinatários', desc: 'Quem recebe cada folha.', titulo: (l) => String(l.nome), defs: [
    { campo: 'folha', rotulo: 'Folha', tipo: 'lista', opcoes: FOLHAS, mostrar: (l) => NOME_FOLHA[l.folha as keyof typeof NOME_FOLHA] },
    { campo: 'nome', rotulo: 'Destinatário', mostrar: (l) => <span className="font-medium">{String(l.nome)}</span> },
    { campo: 'contacto', rotulo: 'Contacto / departamento' },
  ] },
  { id: 'clientes', rotulo: 'Clientes', desc: 'Margem (fixa ou percentual) e comissão do agente por cliente, usadas na ficha de custo.', titulo: (l) => String(l.nome), defs: [
    { campo: 'nome', rotulo: 'Cliente', mostrar: (l) => <span className="font-medium">{String(l.nome)}</span> },
    { campo: 'idPrefixo', rotulo: 'Prefixo do ID', mostrar: (l) => <span className="font-mono text-[13px]">{String(l.idPrefixo)}</span> },
    { campo: 'margemTipo', rotulo: 'Tipo de margem', tipo: 'lista', opcoes: ['fixa', 'percentual'] },
    { campo: 'margem', rotulo: 'Margem', tipo: 'numero', mostrar: (l) => (l.margemTipo === 'fixa' ? eur(Number(l.margem)) : `${l.margem} %`) },
    { campo: 'comissao', rotulo: 'Comissão do agente (%)', tipo: 'numero', mostrar: (l) => `${l.comissao} %` },
  ] },
  { id: 'precosRef', rotulo: 'Tabela de preços', desc: 'Mão de obra, serviços e valores de referência da ficha de custo.', titulo: (l) => String(l.linha), defs: [
    { campo: 'linha', rotulo: 'Linha', filtro: 'texto', mostrar: (l) => <span className="font-medium">{String(l.linha)}</span> },
    { campo: 'valor', rotulo: 'Valor', tipo: 'numero', mostrar: (l) => eur(Number(l.valor)) },
    { campo: 'unidade', rotulo: 'Unidade' },
    { campo: 'origem', rotulo: 'Origem' },
  ] },
]

export default function DadosMestre() {
  const db = useDb()
  const [sep, setSep] = useState<NomeTabela>('fornecedores')
  const [edit, setEdit] = useState<Linha | null>(null)
  const [nova, setNova] = useState(false)
  const s = SEPARADORES.find((x) => x.id === sep)!
  const linhas = db[sep] as unknown as Linha[]

  const colunas: Coluna<Linha>[] = s.defs.map((d) => ({
    id: d.campo, rotulo: d.rotulo, filtro: d.filtro,
    valor: (l) => (Array.isArray(l[d.campo]) ? (l[d.campo] as string[]).join(' ') : String(l[d.campo] ?? '')),
    render: d.mostrar,
  }))

  const abrirNova = () => {
    const l: Linha = { id: uid(sep.slice(0, 3)) }
    s.defs.forEach((d) => { l[d.campo] = d.tipo === 'numero' ? 0 : d.tipo === 'tamanhos' ? [] : d.opcoes?.[0] ?? '' })
    setEdit(l); setNova(true)
  }

  return (
    <>
      <Cabecalho sobre="Fichas de produção" titulo="Dados mestre" sub="Tudo o que a ficha usa e que não muda de encomenda para encomenda. Edita-se aqui uma vez; cada alteração fica registada."
        acoes={<Botao variante="primario" icone={<Plus size={16} />} onClick={abrirNova}>Nova linha</Botao>} />
      <div className="mb-4"><Chips valor={sep} onChange={setSep} opcoes={SEPARADORES.map((x) => ({ id: x.id, rotulo: x.rotulo }))} /></div>
      {s.desc && <p className="text-[13px] text-suave mb-3">{s.desc}</p>}
      <Tabela<Linha> key={sep} linhas={linhas} chave={(l) => l.id} colunas={colunas} onLinha={(l) => { setEdit({ ...l }); setNova(false) }} />

      <Modal aberto={!!edit} onFechar={() => setEdit(null)} titulo={nova ? `Nova linha · ${s.rotulo}` : s.titulo(edit ?? { id: '' })}
        rodape={<>
          {!nova && <Botao variante="perigo" className="mr-auto" icone={<Trash2 size={14} />} onClick={() => {
            if (edit && confirm('Apagar esta linha?')) { db.apagarLinha(sep, edit.id, `${s.rotulo}: ${s.titulo(edit)}`); setEdit(null); aviso('Linha apagada.') }
          }}>Apagar</Botao>}
          <Botao variante="fantasma" onClick={() => setEdit(null)}>Cancelar</Botao>
          <Botao variante="primario" onClick={() => {
            if (!edit) return
            db.guardarLinha(sep, edit as unknown as Tabelas[typeof sep][number], `${s.rotulo}: ${s.titulo(edit)}`)
            setEdit(null); aviso('Guardado.')
          }}>Guardar</Botao>
        </>}>
        {edit && (
          <div className="space-y-4">
            {s.defs.map((d) => (
              <Campo key={d.campo} rotulo={d.rotulo} ajuda={d.tipo === 'tamanhos' ? 'Separe os tamanhos com espaços ou vírgulas.' : undefined}>
                {d.tipo === 'lista' ? (
                  <Seletor valor={String(edit[d.campo] ?? '')} onChange={(v) => setEdit({ ...edit, [d.campo]: v })} opcoes={d.opcoes ?? []} />
                ) : d.tipo === 'tamanhos' ? (
                  <Entrada defaultValue={(edit[d.campo] as string[]).join(' ')} onChange={(e) => setEdit({ ...edit, [d.campo]: e.target.value.split(/[\s,·]+/).filter(Boolean) })} />
                ) : (
                  <Entrada type={d.tipo === 'numero' ? 'number' : 'text'} step="any" value={String(edit[d.campo] ?? '')}
                    onChange={(e) => setEdit({ ...edit, [d.campo]: d.tipo === 'numero' ? Number(e.target.value) : e.target.value })} />
                )}
              </Campo>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}
