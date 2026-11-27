import { expect, test } from '../apoio/app'
import { livroImprevu, livroLongratex } from '../apoio/fichasCusto'

const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

test('importar fichas de custo e ver as margens por cliente e coleção', async ({ pagina: p }) => {
  for (const [nome, buf, n] of [['IMPREVU_SS27.xlsx', livroImprevu(), 3], ['LONGRATEX_SS27.xlsx', livroLongratex(), 3]] as const) {
    await p.goto('/orcamentos')
    await p.locator('main input[type=file]').first().setInputFiles({ name: nome, mimeType: xlsx, buffer: Buffer.from(buf) })
    const importar = p.getByRole('dialog').getByRole('button', { name: new RegExp(`^Importar ${n} fichas`) })
    await expect(importar).toBeVisible()
    await importar.click()
  }
  await p.goto('/orcamentos')
  for (const nome of ['June', 'Melody', 'Stevie', 'Boy Cruise', 'Boy Hamptons']) await expect(p.locator('tbody')).toContainText(nome)

  // a ficha com agente mostra-o sobre o custo (ficha antiga)
  await p.locator('tbody tr', { hasText: 'June' }).click()
  await expect(p.locator('main')).toContainText('sobre o custo')

  await p.goto('/margens')
  const main = p.locator('main')
  await expect(main).toContainText('Imprevu · SS27')
  await expect(main).toContainText('Longratex · SS27')
  await expect(main).toContainText('Margem média sobre o custo')
  await expect(main).toContainText(/Preço para 25 %/i)
})
