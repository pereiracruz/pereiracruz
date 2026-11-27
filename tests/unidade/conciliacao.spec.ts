import { expect, test } from '@playwright/test'
import { candidatas, cruzar, idConciliacao, nomeFolha, saldoCalculado, semelhancaNome, type Conciliacao, type DocTOC, type Movimento } from '../../src/lib/conciliacao'

const doc = (id: string, tipo: DocTOC['tipo'], entidade: string, total: number, data = '2026-11-03', pendente: number | null = null): DocTOC =>
  ({ id, tipo, docType: tipo === 'venda' ? 'FT' : 'FC', numero: `FT ${id}`, data, total, pendente, entidade, nif: '' })
const mov = (id: string, descricao: string, valor: number, data = '2026-11-10', estado: Movimento['estado'] = 'por-conciliar'): Movimento =>
  ({ id, data, descricao, valor, saldoBanco: null, faturas: [], obs: '', estado })

test.describe('Conciliação bancária', () => {
  test('nome da entidade no descritivo do banco (cortado, sem «Lda»)', () => {
    expect(semelhancaNome('TRF IMEDIATA CLOTHIUS TECEL', 'Clothius - Tecelagem, Lda')).toBeGreaterThanOrEqual(0.5)
    expect(semelhancaNome('PAGAMENTO SERVICOS 12345', 'Clothius - Tecelagem, Lda')).toBe(0)
  })

  test('candidatas: valor e nome iguais primeiro; recebimentos só com faturas de venda', () => {
    const docs = [doc('1', 'compra', 'Clothius - Tecelagem, Lda', 120.5), doc('2', 'compra', 'FJ Magalhães', 120.5), doc('3', 'venda', 'Clothius - Tecelagem, Lda', 120.5)]
    const p = candidatas(mov('m', 'TRF CLOTHIUS TECELAGEM', -120.5), docs)
    expect(p[0].docs.map((d) => d.id)).toEqual(['1'])
    expect(p[0].motivo).toContain('valor igual')
    expect(p.flatMap((x) => x.docs).some((d) => d.tipo === 'venda')).toBe(false)
  })

  test('valor único no período conta como forte indício, mesmo sem nome', () => {
    const p = candidatas(mov('m', 'CCONFIRMING 998877', -333.33), [doc('1', 'compra', 'Botifechos', 333.33), doc('2', 'compra', 'Staples', 50)])
    expect(p[0].docs[0].id).toBe('1')
    expect(p[0].motivo).toContain('única fatura com este valor')
  })

  test('várias faturas da mesma entidade que somam o valor', () => {
    const docs = [doc('1', 'compra', 'Louropel', 100), doc('2', 'compra', 'Louropel', 50.25, '2026-11-04'), doc('3', 'compra', 'Louropel', 80)]
    const p = candidatas(mov('m', 'TRF LOUROPEL', -150.25), docs)
    expect(p.some((x) => x.docs.length === 2 && x.docs.map((d) => d.id).sort().join() === '1,2')).toBe(true)
  })

  test('cruzar: cada fatura só uma vez; os confirmados não mudam; saldo calculado', () => {
    const c: Conciliacao = {
      id: idConciliacao('PP', 'CGD Ordem', 2026, 11), empresa: 'PP', conta: 'CGD Ordem', ano: 2026, mes: 11, saldoInicial: 1000, saldoFinalExtrato: null, atualizadoEm: '',
      movimentos: [
        { ...mov('a', 'TRF CLOTHIUS TECELAGEM', -200), estado: 'confirmado', faturas: [{ id: '9', numero: 'FT 9' }] },
        mov('b', 'TRF CLOTHIUS TECELAGEM', -120.5),
        mov('c', 'TRF CLOTHIUS TECELAGEM', -120.5),
        mov('d', 'IMPREVU SAS', 2500),
      ],
    }
    const r = cruzar(c, [doc('1', 'compra', 'Clothius - Tecelagem, Lda', 120.5), doc('9', 'compra', 'Clothius - Tecelagem, Lda', 200), doc('5', 'venda', 'Imprevu', 2500)])
    expect(r.movimentos[0]).toEqual(c.movimentos[0])
    const usadas = r.movimentos.slice(1).flatMap((m) => m.faturas.map((f) => f.id))
    expect(usadas.filter((x) => x === '1')).toHaveLength(1)
    expect(r.movimentos.find((m) => m.id === 'd')).toMatchObject({ estado: 'proposto', faturas: [{ id: '5' }] })
    expect(saldoCalculado(r)).toBe(1000 - 200 - 120.5 - 120.5 + 2500)
    expect(c.id).toBe('PP-cgdordem-2026-11')
    expect(nomeFolha(c, 'CGD')).toBe('11_2026_CGD')
  })
})
