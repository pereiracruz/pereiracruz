import { expect, test } from '../apoio/app'

// ecrã de telemóvel (iPhone 13), no Chromium
test.use({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })

const PAGINAS = ['/', '/fichas', '/fichas/longratex-frqm2026-0130', '/fichas/longratex-frqm2026-0130?aba=compras', '/fichas/longratex-frqm2026-0130?aba=prazos',
  '/compras', '/prazos', '/orcamentos', '/margens', '/historico', '/dados', '/conta', '/copias', '/orcamentos/novo',
  '/conciliacao', '/faturas', '/producao-diaria', '/faltas']

test('telemóvel: nenhuma página passa a largura do ecrã', async ({ pagina: p }) => {
  for (const url of PAGINAS) {
    await p.goto(url)
    await expect(p.locator('main')).toBeVisible()
    await p.waitForTimeout(150)
    const r = await p.evaluate(() => { const m = document.querySelector('main')!; return { doc: document.documentElement.scrollWidth, vw: innerWidth, main: m.scrollWidth, mainW: m.clientWidth } })
    expect.soft(r.doc, `${url}: página mais larga do que o ecrã`).toBeLessThanOrEqual(r.vw)
    expect.soft(r.main, `${url}: conteúdo mais largo do que o ecrã`).toBeLessThanOrEqual(r.mainW + 1)
  }
})

test('telemóvel: menu ☰, marcar compra recebida e etapa feita', async ({ pagina: p }) => {
  await p.goto('/')
  await p.getByRole('button', { name: 'Abrir o menu' }).click()
  await p.locator('nav').getByText('Prazos', { exact: true }).click()
  await expect(p).toHaveURL(/\/prazos$/)

  await p.goto('/fichas/longratex-frqm2026-0130?aba=compras')
  const estado = p.locator('select').filter({ hasText: 'Por encomendar' }).first()
  await estado.selectOption('Recebido')
  await expect(p.locator('select').first()).toHaveValue('Recebido')

  await p.goto('/fichas/longratex-frqm2026-0130?aba=prazos')
  await p.getByTitle('Marcar como feita hoje').first().click()
  await expect(p.locator('main')).toContainText('Feita a')
})
