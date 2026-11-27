import { expect, test } from '@playwright/test'
import { necessidadesCompra, resumoCompras, textoFornecedor } from '../../src/lib/compras'
import { ETAPAS, PRAZO_HABITUAL, entregaHabitual, planear, situacaoPrazos, somarDias } from '../../src/lib/prazos'
import { encomendaLongratex } from '../../src/data/seed'

test.describe('Compras', () => {
  test('materiais × peças por fornecedor, com 5 % de quebra', () => {
    const e = encomendaLongratex()
    const linhas = necessidadesCompra(e)
    const sarja = linhas.find((l) => l.tipo === 'Tecido')!
    expect(sarja.pecas).toBe(437)
    expect(sarja.qtd).toBeCloseTo(437 * 0.4, 6)
    expect(sarja.qtdComprar).toBe(Math.ceil(437 * 0.4 * 1.05))
    const fecho = linhas.find((l) => /fecho/i.test(l.ref))!
    expect(fecho.qtdComprar).toBe(Math.ceil(437 * 1.05))
    // linha de coser: sem consumo (conforme a encomenda)
    expect(linhas.find((l) => /^linha$/i.test(l.ref))).toMatchObject({ semConsumo: true, qtdComprar: null })
    expect(resumoCompras(e).porEncomendar).toBeGreaterThan(0)
  })
  test('margem de quebra por encomenda', () => {
    const e = { ...encomendaLongratex(), margemCompras: { tecido: 0, acessorios: 0 } }
    expect(necessidadesCompra(e).find((l) => l.tipo === 'Tecido')!.qtdComprar).toBe(Math.ceil(437 * 0.4))
  })
  test('pedido ao fornecedor', () => {
    const e = encomendaLongratex()
    const t = textoFornecedor(e, 'Botifechos', necessidadesCompra(e))
    expect(t).toContain('Longratex')
    expect(t).toMatch(/Fecho.*un\./)
  })
})

test.describe('Prazos', () => {
  const e = { ...encomendaLongratex(), entrega: '2027-01-15' }
  test('planear a partir da entrega (4 semanas habituais)', () => {
    const p = planear(e)
    expect(p.map((x) => x.etapa)).toEqual(ETAPAS.map((x) => x.etapa))
    expect(p.find((x) => x.etapa === 'Corte')!.data).toBe(somarDias('2027-01-15', -21))
    expect(p.find((x) => x.etapa === 'Expedição')!.data).toBe('2027-01-15')
    expect(entregaHabitual(encomendaLongratex())).toBe(somarDias('2026-09-14', PRAZO_HABITUAL))
  })
  test('situação: dentro do prazo, atenção e atrasada', () => {
    const planeada = { ...e, prazos: planear(e) }
    expect(situacaoPrazos(planeada, '2026-12-01').nivel).toBe('ok')
    expect(situacaoPrazos(planeada, '2027-01-10').nivel).toBe('atrasada') // etapas anteriores sem estarem feitas
    const tudoFeito = { ...planeada, prazos: planeada.prazos.map((p) => (p.etapa === 'Expedição' ? p : { ...p, feito: p.data })) }
    expect(situacaoPrazos(tudoFeito, '2027-01-10').nivel).toBe('urgente') // entrega daqui a 5 dias
    expect(situacaoPrazos({ ...e, prazos: [{ etapa: 'Expedição', feito: '2027-01-15' }] }, '2027-02-01').nivel).toBe('concluida')
    expect(situacaoPrazos({ ...e, entrega: '' }).nivel).toBe('sem-data')
  })
})
