import { expect, fichaModelo, test } from '../apoio/app'

test('lavandaria pela tabela da Clothius: tingimento ao kg e lavagem à peça', async ({ pagina: p }) => {
  await fichaModelo(p, { cliente: 'Longratex', peca: 'Sarja teste', tipo: 'Calças', tecido: 'Sarja' })
  await p.getByRole('button', { name: 'Tabela Clothius' }).click()
  await expect(p.getByRole('button', { name: 'Usar na ficha' })).toBeDisabled() // sem peso
  await p.getByPlaceholder('ex.: 0,35').fill('0,35')
  await p.getByRole('button', { name: /^Escura/ }).click()
  await expect(p.getByRole('dialog')).toContainText('0,35 kg × 3,55 € = 1,24 € por peça')
  await p.getByRole('button', { name: 'Usar na ficha' }).click()
  await expect(p.locator('input[value="Lavandaria - Clothius (tingimento reativo, cor escura)"]')).toHaveCount(1)

  await fichaModelo(p, { cliente: 'Imprevu', peca: 'Ganga teste', tipo: 'Calções', tecido: 'Ganga' })
  await p.getByRole('button', { name: 'Tabela Clothius' }).click()
  for (const t of ['Lavagem normal', 'Stone wash', 'Bigodes lixa 1 (frente)']) await p.getByRole('dialog').locator('label', { hasText: t }).first().locator('input').check()
  await expect(p.getByRole('dialog')).toContainText('1,80 € por peça')
  await p.getByRole('button', { name: 'Usar na ficha' }).click()
  await expect(p.locator('input[value*="Clothius (lavagem normal + stone wash"]')).toHaveCount(1)
})

test('dados mestre: tabelas da Clothius', async ({ pagina: p }) => {
  await p.goto('/dados')
  await p.getByText('Clothius · tingimento').click()
  await expect(p.locator('tbody tr')).toHaveCount(14)
  await p.getByText('Clothius · lavandaria').click()
  await expect(p.locator('tbody tr')).toHaveCount(35)
})
