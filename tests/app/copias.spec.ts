import fs from 'node:fs'
import { expect, test } from '../apoio/app'

test('cópia de segurança: descarregar, recusar ficheiro inválido e repor', async ({ pagina: p }, info) => {
  await p.goto('/copias')
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Descarregar cópia de segurança' }).click()])
  const copia = info.outputPath(dl.suggestedFilename())
  await dl.saveAs(copia)
  expect(JSON.parse(fs.readFileSync(copia, 'utf8')).colecoes.encomendas.length).toBe(2)

  // apagar uma encomenda
  await p.goto('/fichas/dr-collectors-ss27')
  await p.getByRole('button', { name: 'Apagar' }).click()
  await expect(p).toHaveURL(/\/fichas$/)
  await expect(p.locator('tbody tr')).toHaveCount(1)

  // ficheiro que não é uma cópia
  // (os ficheiros vão da memória: o Playwright não envia ficheiros de pastas com acentos, como a deste teste)
  const json = (nome: string, conteudo: string) => ({ name: nome, mimeType: 'application/json', buffer: Buffer.from(conteudo) })
  await p.goto('/copias')
  await p.getByRole('button', { name: 'Escolher ficheiro de cópia…' }).waitFor()
  await p.locator('main input[type=file]').setInputFiles(json('invalido.json', JSON.stringify({ app: 'outra' })))
  await expect(p.locator('main')).toContainText('não é uma cópia de segurança')

  // repor: só depois de escrever REPOR
  await p.locator('main input[type=file]').setInputFiles(json(dl.suggestedFilename(), fs.readFileSync(copia, 'utf8')))
  const repor = p.getByRole('dialog').getByRole('button', { name: /Repor os dados/ })
  await expect(repor).toBeDisabled()
  await p.getByRole('dialog').locator('input').fill('repor')
  await repor.click()
  await p.goto('/fichas')
  await expect(p.locator('tbody')).toContainText('Dr. Collectors')
  await p.goto('/atividade')
  await expect(p.locator('tbody tr').first()).toContainText('Cópia de segurança reposta')
})
