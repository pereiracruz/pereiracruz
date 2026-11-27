import { expect, test } from '../apoio/app'

// Em modo local (sem servidor) estas páginas não ligam ao Supabase, ao Gmail, ao TOConline nem à IA:
// verifica-se que abrem sem erros e mostram o título.
const PAGINAS: [string, RegExp][] = [
  ['/conciliacao', /Conciliação bancária/], ['/faturas', /Faturas recebidas/], ['/producao-diaria', /Produção diária/],
  ['/faltas', /Faltas/], ['/emails', /.+/], ['/emails-pedidos', /.+/],
]

test('páginas novas abrem sem erros em modo local', async ({ pagina: p }) => {
  for (const [url, titulo] of PAGINAS) {
    await p.goto(url)
    await expect(p.locator('main h1').first(), url).toHaveText(titulo)
  }
})

test('pesquisa geral: Ctrl+K, por nome do modelo e por nº interno, Enter abre', async ({ pagina: p }) => {
  await p.goto('/fichas')
  await expect(p.locator('main h1').first()).toBeVisible()
  await p.keyboard.press('Control+k')
  const janela = p.getByRole('dialog', { name: 'Pesquisa' })
  const caixa = janela.getByPlaceholder('Encomenda, modelo, referência, OF…')
  await expect(caixa).toBeFocused()
  await caixa.fill('Patachou')
  await expect(janela).toContainText('Básicos Patachou')
  await caixa.fill('xyzzy')
  await expect(janela).toContainText('Nada encontrado')
  await caixa.fill('E26-070')
  await expect(janela).toContainText('Dr. Collectors')
  await caixa.press('Enter')
  await expect(p).toHaveURL(/\/fichas\/dr-collectors-ss27/)
  await expect(janela).toBeHidden()

  // «/» também abre; Escape fecha
  await p.locator('main h1').first().click()
  await p.keyboard.press('/')
  await expect(janela).toBeVisible()
  await p.keyboard.press('Escape')
  await expect(janela).toBeHidden()
})
