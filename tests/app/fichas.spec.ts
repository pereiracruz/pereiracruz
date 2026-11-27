import { expect, livroDescarregado, test } from '../apoio/app'

test('encomenda de exemplo → fichas → aprovar → produção → packing list → livro Excel', async ({ pagina: p }) => {
  await p.goto('/fichas/nova')
  await p.getByText('Usar o exemplo da Imprevu').click()
  await p.getByRole('button', { name: 'Preparar fichas' }).click()
  await p.getByRole('button', { name: 'Confirmar ligação' }).click({ timeout: 20_000 })
  await p.getByRole('button', { name: 'Aceitar tudo e gerar fichas' }).click()
  await expect(p).toHaveURL(/\/fichas\/imprevu-ss27\//)
  await p.getByRole('button', { name: 'Aprovar ficha' }).click()
  await expect(p.locator('main').getByText('Aprovada', { exact: true }).first()).toBeVisible()

  // produção: quantidades confecionadas e embaladas (não obrigam a nova aprovação)
  await p.locator('main button', { hasText: /^Embalamento$/ }).click()
  const conf = p.getByText('Total confecionado').locator('..').locator('input')
  const emb = p.getByText('Total embalado').locator('..').locator('input')
  for (const [i, q] of [12, 14, 14, 10, 4].entries()) await conf.nth(i).fill(String(q))
  for (const [i, q] of [11, 13, 14, 10, 4].entries()) await emb.nth(i).fill(String(q))
  await expect(p.locator('main').getByText('Aprovada', { exact: true }).first()).toBeVisible()

  // packing list
  await p.goto('/fichas/imprevu-ss27')
  await expect(p.locator('main')).toContainText(/E\d\d-\d{3}/)
  await p.getByRole('button', { name: 'Packing list' }).click()
  await p.locator('main button', { hasText: 'Novo envio' }).first().click()
  const add = p.locator('main button', { hasText: 'Chemise Janet' })
  while (await add.count()) await add.first().click()
  await expect(p.locator('main')).toContainText('PACKING LIST – CHEMISE JANET')
  await expect(p.locator('main')).toContainText(/\d+ caixas · \d+ peças/)

  // livro Excel: folhas de produto e embalamento, com o TOTAL CORTADO em fórmulas
  await p.goto('/fichas/imprevu-ss27')
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Livro Excel' }).click()])
  expect(dl.suggestedFilename()).toMatch(/^FichaProduto_imprevu_ss27_.*\.xlsx$/)
  const wb = await livroDescarregado(dl)
  expect(wb.SheetNames.length).toBeGreaterThanOrEqual(2)
  const formulas = wb.SheetNames.flatMap((n) => Object.values(wb.Sheets[n]).filter((c) => typeof c === 'object' && c && 'f' in c))
  expect(formulas.length).toBeGreaterThan(0)
})

test('nº interno das encomendas no ID (E26-070)', async ({ pagina: p }) => {
  await p.goto('/fichas/dr-collectors-ss27')
  await expect(p.locator('main')).toContainText('E26-070')
})
