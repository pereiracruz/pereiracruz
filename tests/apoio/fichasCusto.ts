import * as XLSX from 'xlsx'

/**
 * Fichas de custo fictícias, com a mesma estrutura das fichas reais (as reais, dos clientes, não vão para o repositório).
 * - Formato Imprevu: Cliente / Marca / Ref., tabela, Total, N/ Comissão, Comissão do agente (fórmula sobre o total), Preço Final.
 * - Formato Longratex: Cliente / Ref. (tipo de peça), nome e código, tabela, Total e Preço final escrito à mão.
 */
type Linha = [descricao: string, unidade: string, consumo: number | string | null, valor: number | string]
const cel = (v: number | string | null) => (typeof v === 'string' && /^[\d.]+[/+*][\d.]+$/.test(v) ? { f: v, v: Function(`return (${v})`)() as number } : v == null ? null : { v })

type Fim = (r: number, total: number) => (string | number | { f: string; v: number } | null)[][]
/** Folha com a tabela; `fixos` escreve à mão o total de algumas linhas (índice → valor), como acontece nas fichas reais. */
function folha(cabecalho: (string | number | null)[][], linhas: Linha[], fim: Fim, fixos: Record<number, number> = {}) {
  const aoa: unknown[][] = [...cabecalho, [], ['Descrição', 'Unidade', 'Consumo', 'Valor Unitário', 'Valor Total (s/ IVA)']]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  let r = aoa.length
  const r0 = r
  let soma = 0
  for (const [i, [d, u, c, v]] of linhas.entries()) {
    XLSX.utils.sheet_add_aoa(ws, [[d, u]], { origin: { r, c: 0 } })
    const consumo = cel(c), valor = cel(v)
    if (consumo) ws[XLSX.utils.encode_cell({ r, c: 2 })] = { t: 'n', ...consumo }
    if (valor) ws[XLSX.utils.encode_cell({ r, c: 3 })] = { t: 'n', ...valor }
    const tot = (Number(consumo?.v ?? 0)) * Number(valor?.v ?? 0)
    ws[XLSX.utils.encode_cell({ r, c: 4 })] = i in fixos ? { t: 'n', v: fixos[i] } : { t: 'n', f: `C${r + 1}*D${r + 1}`, v: tot }
    soma += i in fixos ? fixos[i] : tot
    r++
  }
  const total = { t: 'n', f: `SUM(E${r0 + 1}:E${r})`, v: soma }
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: 's', v: 'Total' }
  ws[XLSX.utils.encode_cell({ r, c: 4 })] = total
  const linhasFim = fim(r + 1, soma) // nº (1-based) da linha do Total e o seu valor
  linhasFim.forEach((l, i) => l.forEach((x, c) => {
    if (x == null) return
    ws[XLSX.utils.encode_cell({ r: r + 1 + i, c })] = typeof x === 'object' ? { t: 'n', ...x } : typeof x === 'number' ? { t: 'n', v: x } : { t: 's', v: x }
  }))
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 1 + linhasFim.length, c: 5 } })
  return ws
}

const linhasImprevu = (tecido: number): Linha[] => [
  ['Corte- Pereira & Cruz', '€', 1, 0.5],
  ['Confeção- Pereira & Cruz', '€', 1, 9],
  ['Tecido - Fleeming', 'mts', tecido, 6],
  ['Lavandaria -Lavagem', '€', 1, 1.2],
  ['Botão', '€', 1, '70/1000'],
  ['Saco Embalagem', '€', 1, '31.7/2000'],
  ['Revista', '€', 1, 0.15],
]

/** Livro com 3 folhas da Imprevu: com agente a 7 % (sobre o total), sem agente, e preço ajustado à mão. */
export function livroImprevu(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const cab = (nome: string) => [['Cliente', 'Imprevu', null, 'Marca', 'Imprevu'], ['Ref.', 'CALÇAS'], [nome]]
  XLSX.utils.book_append_sheet(wb, folha(cab('JUNE NATUREL'), linhasImprevu(1.3), (t, tot) => [
    [null, null, null, 'N/ Comissão', 3],
    [null, null, null, 'Comissão Agente', { f: `E${t}*0.07`, v: tot * 0.07 }],
    [null, null, null, 'Valor total', { f: `E${t}+E${t + 1}+E${t + 2}`, v: tot * 1.07 + 3 }],
    [null, null, null, 'Preço Final', { f: `E${t + 3}`, v: tot * 1.07 + 3 }],
  ]), 'June_naturel')
  XLSX.utils.book_append_sheet(wb, folha(cab('MELODY BLANC'), linhasImprevu(1.1), (t, tot) => [
    [null, null, null, 'N/ Comissão', 3],
    [null, null, null, 'Valor total', { f: `E${t}+E${t + 1}`, v: tot + 3 }],
    [null, null, null, 'Preço Final', 24.5],
  ]), 'Melody_blanc')
  XLSX.utils.book_append_sheet(wb, folha(cab('STEVIE BLUE'), linhasImprevu(0.026), (t, tot) => [
    [null, null, null, 'N/ Comissão', 3],
    [null, null, null, 'Valor total', { f: `E${t}+E${t + 1}`, v: tot + 3 }],
    [null, null, null, 'Preço Final', { f: `E${t + 2}`, v: tot + 3 }],
  ]), 'Stevie_blue')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/** Livro da Longratex: Vaqueiro (corte e confeção juntos), Chino com total do botão escrito à mão, e o mesmo código noutra folha. */
export function livroLongratex(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const cab = (ref: string, nome: string, cod: string) => [['Cliente', 'Longratex', null, 'Ref.', ref], [nome, null, null, cod]]
  const base: Linha[] = [['Plano de corte -Pereira\'s Project', '€', '3/32', 2.5], ['Tecido - Sarja PPT', 'mts', 0.4, 4.1], ['Lavandaria -Tingimento', 'kg', 0.3, 3.5], ['Botões elástico- Pereira & Cruz', '€', 2, 0.012]]
  XLSX.utils.book_append_sheet(wb, folha(cab('CALÇA VAQUEIRO', 'BOY CRUISE VAQUEIRO', '4033311'), [['Corte- Pereira & Cruz', '€', 1, 7], ['Confeção- Pereira & Cruz', '€', 1, 0], ...base], (t, tot) => [
    [null, null, null, 'Preço Final', 14.2], [null, null, null, 'Margem total', { f: `E${t + 1}-E${t}`, v: 14.2 - tot }],
  ]), 'Vaqueiro')
  // total do botão escrito à mão (0,11 € em vez de 0,07 €)
  XLSX.utils.book_append_sheet(wb, folha(cab('CALÇÃO CHINO', 'BOY CRUISE CHINO', '4033312'), [['Corte- Pereira & Cruz', '€', 1, 0.25], ['Confeção- Pereira & Cruz', '€', 1, 7], ['Botão- Pereira & Cruz', '€', 1, '70/1000'], ...base], () => [
    [null, null, null, 'Preço Final', 13.55],
  ], { 2: 0.11 }), 'Calção_chino')
  // outro modelo com o mesmo código (cabeçalho copiado)
  XLSX.utils.book_append_sheet(wb, folha(cab('CALÇÃO CHINO', 'BOY HAMPTONS CHINO', '4033312'), [['Corte- Pereira & Cruz', '€', 1, 0.25], ['Confeção- Pereira & Cruz', '€', 1, 6.5], ...base], () => [
    [null, null, null, 'Preço Final', 12.9],
  ]), 'Hamptons')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
