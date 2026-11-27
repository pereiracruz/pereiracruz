import { expect, test } from '@playwright/test'
import { conferir, type FaturaLida, type RegistoEfatura } from '../../src/lib/faturasRecebidas'
import { iguais, juntar } from '../../src/lib/juntar'
import { INTERVALOS, normalizarDia, totalDia } from '../../src/lib/producao'

const fatura = (x: Partial<FaturaLida> = {}): FaturaLida => ({
  tipoDocumento: 'fatura', numero: 'FT 2026/123', data: '2026-11-05', vencimento: null,
  fornecedor: { nome: 'Clothius', nif: '500000000' }, cliente: { nome: "Pereira's Project", nif: '516204475' },
  linhasIva: [{ taxa: 23, base: 100, iva: 23, motivoIsencao: null }], totalSemIva: 100, totalIva: 23, total: 123,
  retencao: null, taxaRetencao: null, aPagar: null, descricao: null, observacoes: [], confianca: 'alta', ...x,
})
const efatura: RegistoEfatura = { id: '1', empresa: 'PP', nif: '500000000', fornecedor: 'Clothius', tipo: 'FT', numero: 'FT 2026/123', data: '2026-11-05', total: 123, iva: 23, estado: 'Registado', documentoLocal: null }

test.describe('Faturas recebidas: conferência com o e-Fatura', () => {
  test('tudo certo', () => {
    expect(conferir(fatura(), efatura).every((v) => v.ok)).toBe(true)
  })
  test('IVA que não corresponde à taxa e total diferente do e-Fatura', () => {
    const v = conferir(fatura({ linhasIva: [{ taxa: 23, base: 100, iva: 21, motivoIsencao: null }], totalIva: 21, total: 121 }), efatura)
    expect(v.find((x) => x.campo === 'IVA a 23 %')?.ok).toBe(false)
    expect(v.find((x) => x.campo === 'Total')?.ok).toBe(false)
  })
  test('não encontrada no e-Fatura', () => {
    expect(conferir(fatura(), null).find((x) => x.campo === 'e-Fatura')?.ok).toBe(false)
  })
  test('recibo verde: retenção de 25 % e valor a pagar', () => {
    const v = conferir(fatura({ tipoDocumento: 'recibo verde', linhasIva: [{ taxa: 0, base: 400, iva: 0, motivoIsencao: 'Artigo 53.º' }], totalSemIva: 400, totalIva: 0, total: 400, retencao: 100, taxaRetencao: 25, aPagar: 300, vencimento: '2026-11-30' }), null)
    expect(v.find((x) => x.campo === 'Retenção na fonte')?.ok).toBe(true)
    expect(v.find((x) => x.campo === 'Valor a pagar')?.ok).toBe(true)
  })
})

test.describe('Alterações ao mesmo tempo em dois aparelhos', () => {
  test('campos alterados de cada lado juntam-se; o mesmo campo alterado nos dois conta como conflito', () => {
    const base = { entrega: '', notas: 'a', estado: 'Em revisão' }
    const r = juntar(base, { ...base, entrega: '2027-01-15', estado: 'Concluída' }, { ...base, notas: 'b', estado: 'Fichas geradas' })
    expect(r.valor).toEqual({ entrega: '2027-01-15', notas: 'b', estado: 'Concluída' })
    expect(r.conflitos).toEqual(['estado'])
  })
  test('listas com id: registos acrescentados nos dois aparelhos ficam os dois', () => {
    const base = { compras: [{ chave: 'fecho', estado: 'Por encomendar' }] }
    const r = juntar(base,
      { compras: [{ chave: 'fecho', estado: 'Encomendado' }, { chave: 'botao', estado: 'Encomendado' }] },
      { compras: [{ chave: 'fecho', estado: 'Por encomendar' }, { chave: 'linha', estado: 'Recebido' }] })
    expect(r.conflitos).toEqual([])
    expect(r.valor.compras.map((c) => `${c.chave}:${c.estado}`).sort()).toEqual(['botao:Encomendado', 'fecho:Encomendado', 'linha:Recebido'])
    expect(iguais({ a: 1, b: undefined }, { a: 1 })).toBe(true)
  })
})

test.describe('Produção diária', () => {
  test('a grelha tem sempre as mesmas horas e o total do dia soma as peças', () => {
    const d = normalizarDia({ horas: [{ intervalo: '8h - 9h', pecas: 12, fimModelo: false }, { intervalo: '14h-15h', pecas: 20, fimModelo: true }] } as never)
    // uma linha por hora, pela ordem da grelha (o texto lido, ex. «8h - 9h», fica como estava)
    expect(d.horas).toHaveLength(INTERVALOS.length)
    expect(d.horas.map((x) => x.pecas)).toEqual([12, null, null, null, null, 20, null, null, null])
    expect(d.horas[5].fimModelo).toBe(true)
    expect(totalDia(d)).toBe(32)
  })
})
