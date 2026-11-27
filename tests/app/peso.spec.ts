import { expect, fichaModelo, test } from '../apoio/app'

test('peso da peça: vem da ficha de produção e de outros orçamentos do mesmo modelo', async ({ pagina: p }) => {
  // peso escrito na ficha de produção
  await p.goto('/fichas/longratex-frqm2026-0130')
  await p.locator('tbody tr', { has: p.getByRole('button', { name: 'Abrir fichas' }) }).first().getByRole('button', { name: 'Abrir fichas' }).click()
  await p.locator('main button', { hasText: /^Embalamento$/ }).first().click()
  const peso = p.locator('label', { hasText: 'Peso por peça' }).locator('input')
  await peso.fill('0,32')
  await peso.press('Tab')

  await fichaModelo(p, { cliente: 'Longratex', peca: 'Calça Básicos Patachou', tecido: 'Sarja' })
  await p.getByRole('button', { name: 'Tabela Clothius' }).click()
  await expect(p.getByPlaceholder('ex.: 0,35')).toHaveValue('0,32')
  await expect(p.getByRole('dialog')).toContainText('ficha de produção')
  await p.getByRole('button', { name: /^Escura/ }).click()
  await p.getByRole('button', { name: 'Usar na ficha' }).click()

  // outro orçamento do mesmo modelo propõe o mesmo peso
  await fichaModelo(p, { cliente: 'Longratex', peca: 'Básicos Patachou bege', tecido: 'Sarja' })
  await p.getByRole('button', { name: 'Tabela Clothius' }).click()
  await expect(p.getByRole('dialog')).toContainText('Pesos deste modelo')
  await expect(p.getByRole('dialog')).toContainText('0,32 kg')
})
