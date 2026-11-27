import { expect, test as base, type Page } from '@playwright/test'

/** Página com sessão iniciada (modo local) e registo de erros JavaScript, que fazem falhar o teste. */
export const test = base.extend<{ pagina: Page }>({
  pagina: async ({ page }, usar) => {
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(e.message))
    page.on('dialog', (d) => void d.accept())
    await entrar(page)
    await usar(page)
    expect(erros, 'erros JavaScript na página').toEqual([])
  },
})
export { expect }

export async function entrar(page: Page) {
  await page.goto('/login')
  await page.locator('input[autocomplete=username]').fill('admin')
  await page.locator('input[type=password]').fill('pereira2026')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('button', { name: /Sair/ }).or(page.locator('[aria-label="Sair"]')).first()).toBeAttached()
}

/** Texto visível da área principal. */
export const textoMain = async (page: Page) => (await page.locator('main').innerText()).replace(/\u00a0/g, ' ')

/** Lê um ficheiro descarregado como livro Excel. */
export async function livroDescarregado(download: import('@playwright/test').Download) {
  const XLSX = await import('xlsx')
  const caminho = await download.path()
  const fs = await import('node:fs')
  return XLSX.read(fs.readFileSync(caminho), { cellFormula: true })
}

/** Cria um pedido de orçamento a partir da ficha-modelo da Pereira & Cruz. */
export async function fichaModelo(page: Page, o: { cliente: string; peca: string; tipo?: string; tecido?: 'Ganga' | 'Sarja' | 'Outro'; variante?: string }) {
  await page.goto('/orcamentos/novo')
  await page.locator('select').filter({ hasText: 'Escolher' }).selectOption(o.cliente)
  await page.getByPlaceholder('ex.: Mini Boy City').fill(o.peca)
  if (o.variante) await page.getByPlaceholder('ex.: Vaqueiro').fill(o.variante)
  if (o.tipo) await page.locator('select').filter({ hasText: 'Calças' }).selectOption(o.tipo)
  if (o.tecido) await page.locator('select').filter({ hasText: 'Ganga' }).selectOption(o.tecido)
  await page.getByRole('button', { name: 'Criar ficha de custo' }).click()
  await expect(page).toHaveURL(/\/orcamentos\/ped-/)
}
