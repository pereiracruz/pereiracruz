import { expect, livroDescarregado, test } from '../apoio/app'

test('compras: lista, marcar encomendado, pedido ao fornecedor e Excel', async ({ pagina: p, context }) => {
  await p.goto('/compras')
  await expect(p.locator('main')).toContainText(/Por encomendar\s*\d+/)
  await p.locator('tbody tr').first().click()
  await expect(p).toHaveURL(/\?aba=compras/)
  await p.getByRole('button', { name: 'Marcar como encomendado' }).first().click()
  await expect(p.locator('select').filter({ hasText: 'Encomendado' }).first()).toHaveValue('Encomendado')

  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await p.getByRole('button', { name: 'Copiar pedido' }).first().click()
  await expect.poll(() => p.evaluate(() => navigator.clipboard.readText())).toContain('precisamos de')

  // Excel (a biblioteca carrega só quando é precisa)
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('button').filter({ hasText: /^Excel$/ }).click()])
  expect(dl.suggestedFilename()).toMatch(/^Compras_longratex/)
  const wb = await livroDescarregado(dl)
  const XLSX = await import('xlsx')
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets.Compras)
  expect(csv).toContain('margem de quebra: tecido 5 %')
  expect(csv).toMatch(/FJ Magalhães,Tecido,Sarja PPT.*,437,174\.8,184,m/)
  expect(csv).toContain('Encomendado')
})

test('prazos: planear a partir da entrega, marcar etapa feita e página de prazos', async ({ pagina: p }) => {
  await p.goto('/fichas/longratex-frqm2026-0130?aba=prazos')
  const planear = p.getByRole('button', { name: 'Planear a partir da entrega' })
  await expect(planear).toBeDisabled() // ainda sem data de entrega
  await p.locator('input[type=date]').first().fill('2099-01-15')
  await planear.click()
  await expect(p.locator('tbody input[type=date]').first()).toHaveValue('2098-12-22') // materiais: 24 dias antes
  await p.getByTitle('Marcar como feita hoje').first().click()
  await expect(p.locator('main')).toContainText('Feita a')

  await p.goto('/prazos')
  const main = p.locator('main')
  await expect(main).toContainText('Longratex · FRQM2026/0130')
  await expect(main).toContainText('15/01/2099')
  await expect(main).toContainText('Dentro do prazo')
})
