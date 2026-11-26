import { useRef } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload } from 'lucide-react'
import { useDb } from '../../store/db'
import { Botao, Cabecalho, Etiqueta, Kpi, Tabela, aviso } from '../../components/ui'
import { soma } from '../../lib/calc'
import { dataCurta, eur, hojeISO, int, slug } from '../../lib/format'
import type { PrecoHistorico } from '../../types'

const COLS = ['Cliente', 'Peça', 'Variante', 'Tipo de peça', 'Tecido', 'Tratamento', 'Preço por peça', 'Peças', 'Origem', 'Data']

export default function Historico() {
  const { historico, adicionarHistorico, log } = useDb()
  const input = useRef<HTMLInputElement>(null)

  const comPecas = historico.filter((h) => h.pecas)
  const media = historico.length ? soma(historico.map((h) => h.preco)) / historico.length : 0
  // desvio entre ficha de custo e preço aceite da mesma peça (por tipo de peça + cliente)
  const ficha = historico.find((h) => h.origem === 'Ficha de custo')
  const aceite = ficha && historico.find((h) => h.origem === 'Encomenda' && h.tipoPeca === ficha.tipoPeca && h.cliente === ficha.cliente)
  const desvio = ficha && aceite ? ((aceite.preco - ficha.preco) / ficha.preco) * 100 : null

  const importar = async (f: File) => {
    const wb = XLSX.read(await f.arrayBuffer())
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
    let n = 0
    for (const r of linhas) {
      const get = (k: string) => String(r[k] ?? r[k.toLowerCase()] ?? '').trim()
      const preco = Number(String(r['Preço por peça'] ?? r['Preço'] ?? '').replace('€', '').replace(',', '.'))
      if (!get('Peça') || !Number.isFinite(preco) || preco <= 0) continue
      const pecas = Number(r['Peças']) || null
      const origem = (['Encomenda', 'Ficha de custo', 'Orçamento'].includes(get('Origem')) ? get('Origem') : 'Orçamento') as PrecoHistorico['origem']
      adicionarHistorico({
        id: slug(`imp-${get('Cliente')}-${get('Peça')}-${get('Variante')}-${preco}`), cliente: get('Cliente') || '—', peca: get('Peça'), variante: get('Variante') || '—',
        tipoPeca: get('Tipo de peça') || '—', tecido: get('Tecido') || '—', tratamento: get('Tratamento') || get('Variante') || '—', preco, pecas, origem, data: get('Data') || hojeISO(),
      })
      n++
    }
    log('Histórico importado', `${n} preços de ${f.name}`)
    aviso(n ? `${n} preços importados.` : 'Nenhuma linha válida encontrada. Use o modelo.')
  }

  const modelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([COLS, ['Imprevu', 'Shirt Mao', 'Ecru', 'Camisa', 'Fleeming Ecru', 'Ecru', 30.36, 120, 'Orçamento', '2026-04-10']])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Histórico'); XLSX.writeFile(wb, 'modelo_historico_precos.xlsx')
  }

  return (
    <>
      <Cabecalho sobre="Pré-orçamentação" titulo="Histórico de preços"
        sub={`${historico.length} preços de ${new Set(historico.map((h) => h.cliente)).size} ${new Set(historico.map((h) => h.cliente)).size === 1 ? 'cliente' : 'clientes'} · cresce com cada orçamento validado`}
        acoes={<>
          <Botao variante="fantasma" icone={<Download size={15} />} onClick={modelo}>Modelo Excel</Botao>
          <Botao icone={<Upload size={15} />} onClick={() => input.current?.click()}>Importar orçamentos</Botao>
          <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }} />
        </>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        <Kpi rotulo="Preços guardados" valor={historico.length} />
        <Kpi rotulo="Preço médio por peça" valor={eur(media)} />
        <Kpi rotulo="Peças encomendadas" valor={int(soma(comPecas.map((h) => h.pecas!)))} />
        <Kpi rotulo={ficha ? `${ficha.peca} · ficha de custo vs preço aceite` : 'Ficha de custo vs preço aceite'} valor={desvio == null ? '—' : `${desvio > 0 ? '+' : ''}${desvio.toFixed(1).replace('.', ',')} %`} />
      </div>
      <Tabela<PrecoHistorico> linhas={historico} chave={(h) => h.id}
        colunas={[
          { id: 'cliente', rotulo: 'Cliente', valor: (h) => h.cliente, filtro: 'lista' },
          { id: 'peca', rotulo: 'Peça', valor: (h) => h.peca, filtro: 'texto', render: (h) => <span className="font-medium">{h.peca}</span> },
          { id: 'tipo', rotulo: 'Tipo de peça', valor: (h) => h.tipoPeca, filtro: 'lista' },
          { id: 'tecido', rotulo: 'Tecido', valor: (h) => h.tecido, filtro: 'lista' },
          { id: 'trat', rotulo: 'Tratamento', valor: (h) => h.tratamento, filtro: 'lista' },
          { id: 'var', rotulo: 'Variante', valor: (h) => h.variante, filtro: 'texto' },
          { id: 'preco', rotulo: 'Preço por peça', valor: (h) => h.preco, render: (h) => eur(h.preco), alinhar: 'dir' },
          { id: 'pecas', rotulo: 'Peças', valor: (h) => h.pecas ?? 0, render: (h) => (h.pecas ? int(h.pecas) : '—'), alinhar: 'dir' },
          { id: 'data', rotulo: 'Data', valor: (h) => h.data, render: (h) => dataCurta(h.data), alinhar: 'centro' },
          { id: 'origem', rotulo: 'Origem', valor: (h) => h.origem, filtro: 'lista', alinhar: 'centro', render: (h) => <Etiqueta tom={h.origem === 'Encomenda' ? 'neutro' : h.origem === 'Orçamento' ? 'verde' : 'azul'}>{h.origem}</Etiqueta> },
        ]} />
    </>
  )
}
