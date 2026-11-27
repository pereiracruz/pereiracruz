import { expect, test } from '../apoio/app'

test('limpar dados de exemplo: cópia antes, confirmação, só o que foi escolhido', async ({ pagina: p }) => {
  await p.goto('/copias')
  const cartao = p.locator('main').getByText('Dados de exemplo', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
  await expect(cartao).toContainText('Longratex · FRQM2026/0130')
  await expect(cartao).toContainText('Shirt Mao Ecru')
  await p.getByRole('button', { name: 'Limpar dados de exemplo…' }).click()

  const janela = p.getByRole('dialog')
  const apagar = janela.getByRole('button', { name: 'Apagar os escolhidos' })
  await expect(apagar).toBeDisabled()
  // o histórico de preços não vem escolhido por omissão
  await expect(janela.locator('label', { hasText: 'Histórico de preços' }).locator('input')).not.toBeChecked()
  await janela.getByPlaceholder('LIMPAR').fill('limpar')
  const [dl] = await Promise.all([p.waitForEvent('download'), apagar.click()])
  expect(dl.suggestedFilename()).toMatch(/^copia-.*\.json$/)

  await p.goto('/fichas')
  await expect(p.locator('main')).toContainText('Encomendas')
  await expect(p.locator('main tbody tr')).toHaveCount(0)
  await p.goto('/compras')
  await expect(p.locator('main')).toContainText(/Por encomendar\s*0/)
  await p.goto('/orcamentos')
  await expect(p.locator('main')).not.toContainText('Shirt Mao')
  await p.goto('/historico')
  await expect(p.locator('main')).toContainText('Shirt Mao') // o histórico ficou
  await p.goto('/dados')
  await expect(p.locator('main tbody tr').first()).toBeVisible() // os dados mestre ficaram
  await p.goto('/atividade')
  await expect(p.locator('main tbody tr').first()).toContainText('Dados de exemplo apagados')
})
