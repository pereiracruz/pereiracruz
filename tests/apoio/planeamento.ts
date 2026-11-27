import * as XLSX from 'xlsx'

/**
 * Planeamento fictício com a estrutura do Excel real (PLAN_RENT): título na linha 1, cabeçalho na linha 3,
 * datas como nº de série, uma data vazia (0), uma só com hora, o mesmo nº em duas linhas e erros «#VALUE!».
 * Inclui uma folha de salários inventada (DMRs) que a aplicação não pode ler.
 */
const serie = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 864e5) + 25569
export function livroPlaneamento(): ArrayBuffer {
  const cab = ['ID', 'DT_ENCOMENDA', 'CLIENTE', 'CATEGORIA', 'O.F.', 'REF_DESC', 'QTD', 'PRECO_UNIT', 'VALOR_ENCOMENDA', 'DT_ENTREGA_SOLIC', 'EMBAL', 'ESTADO', 'PRIORIDADE', 'DAR_FORA',
    'CUSTO_UNIT', 'DT_ENTREGA_PREV', 'DT_ENTREGA_COMUNICADA', 'DT_ENTREGA_REAL', 'SALDO', 'AMOSTRA?']
  const l = (id: string, cli: string, of: string, ref: string, qtd: number, preco: number, estado: string, prio: number, prev: number | string, com: number) =>
    [id, serie('2026-10-01'), cli, 'Calça Vaqueiro Criança', of, ref, qtd, preco, qtd * preco, serie('2026-12-18'), 'Marta', estado, prio, 'Não', 12.3, prev, com, null, -100, '-']
  const plan = XLSX.utils.aoa_to_sheet([
    ['0_ADVICEBIZ', '#VALUE!', null, null, 'Planeamento-Produção'], [],
    cab,
    l('E26-081', 'LONGRATEX', 'OF-1', 'BOY CRUISE', 300, 7, '01. Espera tecido', 1, serie('2026-12-10') + 17 / 24, serie('2026-12-12')),
    l('E26-081', 'LONGRATEX', 'OF-2', 'BOY CRUISE BEGE', 137, 7, '05. Corte', 2, serie('2026-12-11'), 0),
    l('E26-070-1', 'IMPREVU', 'SS27', 'LEXI GREY', 120, 21, '07. Para entrar na linha', 3, 0.7, serie('2026-12-20')), // só hora: sem data prevista
    l('E26-040', 'SERGIL', 'P1', 'CHINO', 80, 9, '18. Faturado', 4, serie('2026-06-01'), serie('2026-06-02')),
    [null, null, null, null, null, 'linha em branco com texto'],
  ])
  const dmrs = XLSX.utils.aoa_to_sheet([['NISS', 'Nome do Trabalhador', 'Ano/Mês Ref.', 'Valor'], ['00000000000', 'Pessoa Fictícia', '2026-10', 999]])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, dmrs, 'DMRs')
  XLSX.utils.book_append_sheet(wb, plan, 'PLAN_RENT')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
