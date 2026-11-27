import { expect, fichaModelo, test, textoMain } from '../apoio/app'

test('ficha-modelo (ganga, calções): linhas, fórmulas, preço sugerido, empresas e duplicar', async ({ pagina: p }) => {
  await fichaModelo(p, { cliente: 'Imprevu', peca: 'Bradley teste', tipo: 'Calções', tecido: 'Ganga' })
  // as descrições das linhas são campos editáveis
  for (const linha of ['Corte e confeção', 'Rebites', 'Molas (meses) / botão (anos)', 'Lavandaria - Clothius', 'Botões elástico']) await expect(p.locator(`main input[value^="${linha}"]`)).toHaveCount(1)
  const main = p.locator('main')
  await expect(main).toContainText('Regra do cliente (+3,00 €)')
  await expect(main).toContainText(/Objetivo 25 %: [\d,]+ €/)
  // subtotais por empresa
  await expect(main).toContainText(/Pereira & Cruz · corte e confeção\s*[\d,]+ €/)
  await expect(main).toContainText("Pereira's Project · materiais")
  await expect(p.locator('button', { hasText: /^P&C$/ }).first()).toBeVisible()

  // fórmula no consumo do plano de corte (2.ª linha)
  const consumo = p.locator('tbody tr').nth(1).locator('input').nth(2)
  await consumo.fill('2/17')
  await consumo.press('Tab')
  await expect(p.locator('tbody tr').nth(1).locator('td').nth(4)).toContainText('0,29 €')

  // escolher o objetivo de 25 %: margem a verde, sem aviso de objetivo
  await p.getByRole('button', { name: /Objetivo 25 %/ }).click()
  await expect(p.locator('main')).toContainText('Margem total')
  expect(await textoMain(p)).not.toContain('abaixo do objetivo')

  await p.getByRole('button', { name: 'Duplicar' }).click()
  await expect(p.locator('h1')).toContainText('(cópia)')
})

test('ficha-modelo (sarja): tingimento sem peso e botão de massa a 40,85 € o milheiro', async ({ pagina: p }) => {
  await fichaModelo(p, { cliente: 'Longratex', peca: 'Chino teste', tipo: 'Calções', tecido: 'Sarja' })
  await expect(p.locator('main')).toContainText('Falta o peso da peça')
  await expect(p.locator('main')).toContainText('40,85 € o milheiro.')
  await expect(p.locator('input[value="40.85/1000"]')).toHaveCount(1)
})
