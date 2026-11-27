import { expect, test } from '@playwright/test'
import { lerFichasCusto } from '../../src/lib/lerFichaCusto'
import { livroImprevu, livroLongratex } from '../apoio/fichasCusto'

const clientes = ['Imprevu', 'Longratex', 'Dr. Collectors']

test.describe('Importação de fichas de custo (Excel)', () => {
  test('formato Imprevu: N/ comissão, agente sobre o total, preço à mão sem aviso', () => {
    const fichas = lerFichasCusto(livroImprevu(), clientes)
    expect(fichas.map((f) => f.folha)).toEqual(['June_naturel', 'Melody_blanc', 'Stevie_blue'])
    const [june, melody, stevie] = fichas
    expect(june).toMatchObject({ cliente: 'Imprevu', marca: 'Imprevu', tipoPeca: 'Calças', nome: 'JUNE NATUREL', margemFixa: 3, comissaoPct: 7, comissaoSobreCusto: true })
    expect(june.totalCalculado).toBeCloseTo(18.73585, 5)
    expect(june.valorTotal).toBeCloseTo(18.73585 * 1.07 + 3, 5)
    expect(june.avisos).toEqual([])
    // preço final escrito à mão: fica registado, mas já não é aviso
    expect(melody.precoAjustado).toBe(true)
    expect(melody.precoFinal).toBe(24.5)
    expect(melody.avisos.some((a) => /à mão/.test(a))).toBe(false)
    // consumo de tecido muito baixo
    expect(stevie.avisos.some((a) => /mini planos/.test(a))).toBe(true)
  })

  test('formato Longratex: corte e confeção juntos, total à mão, mesmo código noutro modelo', () => {
    const [vaqueiro, chino, hamptons] = lerFichasCusto(livroLongratex(), clientes)
    expect(vaqueiro).toMatchObject({ cliente: 'Longratex', nome: 'BOY CRUISE VAQUEIRO', codigo: '4033311', precoFinal: 14.2 })
    // corte 7,00 € e confeção 0,00 €: não é erro, fica uma nota
    expect(vaqueiro.avisos).toEqual([])
    expect(vaqueiro.linhas.find((l) => /^Corte/.test(l.descricao))?.nota).toMatch(/juntos/)
    // plano de corte guardado como fórmula
    expect(vaqueiro.linhas.find((l) => /Plano/.test(l.descricao))).toMatchObject({ consumoExpr: '3/32' })
    expect(chino.avisos.some((a) => /Botão.*escrito à mão.*0\.11/.test(a))).toBe(true)
    expect(chino.avisos.some((a) => /Mesmo código \(4033312\)/.test(a))).toBe(true)
    expect(hamptons.avisos.some((a) => /Mesmo código \(4033312\)/.test(a))).toBe(true)
    expect(chino.tipoPeca).toBe('Calções')
  })
})
