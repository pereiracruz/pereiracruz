import { expect, test } from '@playwright/test'
import { avaliarExpr, calcularCusto, empresaDaLinha, grupoLavandaria, packingList, precosSugeridos, totaisPorEmpresa } from '../../src/lib/calc'
import type { ClienteCfg, LinhaCusto } from '../../src/types'

const linha = (descricao: string, consumo: number, valor: number, extra: Partial<LinhaCusto> = {}): LinhaCusto => ({ id: descricao, descricao, consumo, valor, origem: 'Segura', ...extra })
const custo24 = [linha('Tecido', 1, 24.16)]
const imprevu: ClienteCfg = { id: 'c1', nome: 'Imprevu', margemTipo: 'fixa', margem: 3, comissao: 0, idPrefixo: 'IMP' }

test.describe('Ficha de custo: preço final', () => {
  test('agente em % sobre custo + N/ comissão', () => {
    const c = calcularCusto(custo24, { ...imprevu, comissao: 7 })
    expect(c.comissao).toBeCloseTo(27.16 * 0.07, 6)
    expect(c.final).toBeCloseTo(29.06, 2)
  })
  test('agente em € por peça', () => {
    expect(calcularCusto(custo24, { ...imprevu, comissaoTipo: 'fixa', comissao: 1.5 }).final).toBeCloseTo(28.66, 6)
  })
  test('fichas antigas: % do agente só sobre o custo', () => {
    expect(calcularCusto(custo24, imprevu, undefined, { margemFixa: 3, comissaoPct: 7, comissaoSobreCusto: true }).final).toBeCloseTo(24.16 * 1.07 + 3, 6)
  })
  test('cliente com margem em % (sobre o custo)', () => {
    const c = calcularCusto(custo24, { ...imprevu, margemTipo: 'percentual', margem: 20 })
    expect(c.final).toBeCloseTo(24.16 * 1.2, 6)
    expect(c.margemPct).toBeCloseTo(20, 6)
  })
  test('preço final fixado à mão: margem real sobre o custo', () => {
    const c = calcularCusto(custo24, imprevu, 30)
    expect(c.fixado).toBe(true)
    expect(c.margem).toBeCloseTo(5.84, 6)
    expect(c.margemPct).toBeCloseTo((5.84 / 24.16) * 100, 6)
    expect(c.ajuste).toBeCloseTo(30 - 27.16, 6)
  })
  test('preços sugeridos: regra do cliente e objetivo de 25 %, arredondados ao cêntimo para cima', () => {
    expect(precosSugeridos(custo24, imprevu)).toEqual({ regra: 27.16, objetivo: 30.2, custo: 24.16 })
  })
})

test.describe('Empresas e lavandaria', () => {
  test('corte, confeção e revista são da Pereira & Cruz; materiais da Pereira\'s Project, mesmo com outro nome escrito', () => {
    expect(empresaDaLinha({ descricao: 'Corte- Pereira & Cruz' })).toBe('PC')
    expect(empresaDaLinha({ descricao: 'Confeção' })).toBe('PC')
    expect(empresaDaLinha({ descricao: 'Revista' })).toBe('PC')
    expect(empresaDaLinha({ descricao: 'Botão- Pereira & Cruz' })).toBe('PP')
    expect(empresaDaLinha({ descricao: 'Lavandaria - Clothius' })).toBe('PP')
    expect(empresaDaLinha({ descricao: 'Confeção fora' })).toBe('FORA')
    expect(empresaDaLinha({ descricao: 'Tecido', empresa: 'CLIENTE' })).toBe('CLIENTE')
    const t = totaisPorEmpresa([linha('Corte', 1, 7), linha('Tecido', 0.5, 4), linha('Botão- Pereira & Cruz', 2, 0.1)])
    expect(t.PC).toBeCloseTo(7, 6)
    expect(t.PP).toBeCloseTo(2.2, 6)
  })
  test('grupo da tabela de lavandaria da Clothius', () => {
    expect(grupoLavandaria('Calções')).toBe('grupoA')
    expect(grupoLavandaria('Calças')).toBe('grupoB')
    expect(grupoLavandaria('Camisa')).toBe('grupoC')
    expect(grupoLavandaria('Casaco')).toBe('grupoC')
    expect(grupoLavandaria('Calças', true)).toBe('crianca')
  })
})

test.describe('Fórmulas e caixas', () => {
  test('fórmulas simples nos consumos e valores', () => {
    expect(avaliarExpr('3/32')).toBeCloseTo(0.09375, 9)
    expect(avaliarExpr('0,46+0,08')).toBeCloseTo(0.54, 9)
    expect(avaliarExpr('140.8/1000')).toBeCloseTo(0.1408, 9)
    expect(avaliarExpr('2 x 3')).toBe(6)
    expect(avaliarExpr('abc')).toBeNull()
    expect(avaliarExpr('alert(1)')).toBeNull()
  })
  test('packing list: caixas sem passar o máximo e com todas as peças', () => {
    const caixas = packingList([12, 14, 14, 10, 4], 20)
    expect(caixas.every((c) => c.reduce((a, b) => a + b, 0) <= 20)).toBe(true)
    expect(caixas.flat().reduce((a, b) => a + b, 0)).toBe(54)
  })
})
