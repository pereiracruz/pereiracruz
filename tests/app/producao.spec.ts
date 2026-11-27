import { expect, test } from '../apoio/app'
import { livroPlaneamento } from '../apoio/planeamento'

const xlsm = { name: 'P0C_PLAN_RENT_teste.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(livroPlaneamento()) }

test('produção: importar o planeamento, mudar o estado, ver na encomenda e desfazer', async ({ pagina: p }) => {
  await p.goto('/producao')
  await expect(p.locator('main')).toContainText('Ainda não há ordens de fabrico')
  await p.locator('main input[type=file]').setInputFiles(xlsm)
  const previa = p.getByRole('dialog')
  await expect(previa).toContainText('folha PLAN_RENT')
  await expect(previa).toContainText('1 encomenda(s) da aplicação ficam ligadas')
  await expect(previa).toContainText('E26-070-1 (IMPREVU no Excel, Dr. Collectors na aplicação)') // mesmo nº, outro cliente
  await previa.getByRole('button', { name: 'Importar 4 ordens' }).click()

  // por estado (as faturadas ficam escondidas)
  const main = p.locator('main')
  await expect(main).toContainText(/Em curso\s*3/)
  await expect(main).toContainText('BOY CRUISE BEGE')
  await expect(main).not.toContainText('CHINO')
  await p.getByLabel('Estado de E26-081').first().selectOption('05. Corte')
  await expect(p.getByLabel('Estado de E26-081').first()).toHaveValue('05. Corte')

  // lista com filtro e as faturadas
  await p.getByRole('button', { name: 'Lista' }).click()
  await p.getByText('Mostrar entregues e faturadas').click()
  await expect(main.locator('tbody tr')).toHaveCount(4)

  // na encomenda ligada (Longratex, E26-081): só consulta
  await p.goto('/fichas/longratex-frqm2026-0130')
  await expect(main).toContainText('Produção · planeamento da linha (2 ordens de fabrico)')
  await expect(main).toContainText('BOY CRUISE')

  // desfazer: cópia antes e confirmação
  await p.goto('/producao')
  await p.getByRole('button', { name: 'Importações' }).click()
  await p.getByRole('button', { name: 'Desfazer…' }).click()
  const apagar = p.getByRole('button', { name: 'Apagar 4 ordens' })
  await expect(apagar).toBeDisabled()
  await p.getByPlaceholder('DESFAZER').fill('desfazer')
  const [dl] = await Promise.all([p.waitForEvent('download'), apagar.click()])
  expect(dl.suggestedFilename()).toMatch(/^copia-/)
  await expect(main).toContainText('Ainda não há ordens de fabrico')
  // as encomendas não foram tocadas
  await p.goto('/fichas/longratex-frqm2026-0130')
  await expect(main).toContainText('Longratex')
  await expect(main).not.toContainText('Produção · planeamento da linha')
  await p.goto('/atividade')
  await expect(main.locator('tbody tr').first()).toContainText('Importação do planeamento desfeita')
})

test('dados mestre: estados de produção e categorias de peça', async ({ pagina: p }) => {
  await p.goto('/dados')
  await p.getByText('Estados de produção').click()
  await expect(p.locator('main tbody tr')).toHaveCount(17)
  await p.getByText('Categorias de peça').click()
  await expect(p.locator('main tbody tr')).toHaveCount(33)
})
