import { expect, test } from '@playwright/test'
import { compararPlaneamento, dataCelula, lerPlaneamento } from '../../src/lib/planeamentoExcel'
import { atrasada, encomendaDaOrdem, mesmoClienteOrdem, ordensDaEncomenda } from '../../src/lib/producao-ordens'
import { encomendaLongratex } from '../../src/data/seed'
import type { OrdemFabrico } from '../../src/types'
import { livroPlaneamento } from '../apoio/planeamento'

const comImportacao = (o: Omit<OrdemFabrico, 'importacao' | 'ficheiro' | 'importadoEm'>): OrdemFabrico => ({ ...o, importacao: 'imp-1', ficheiro: 'plan.xlsm', importadoEm: '2026-11-27' })

test.describe('Importação do planeamento (Excel PLAN_RENT)', () => {
  test('lê só a folha do planeamento, com datas, nº repetidos e erros do Excel', async () => {
    const l = await lerPlaneamento(livroPlaneamento())
    expect(l.folha).toBe('PLAN_RENT') // a folha de salários (DMRs) não é lida
    expect(JSON.stringify(l)).not.toContain('Pessoa Fictícia')
    expect(l.ordens.map((o) => o.id)).toEqual(['E26-081·1', 'E26-081·2', 'E26-070-1·1', 'E26-040·1'])
    expect(l.ordens[0]).toMatchObject({ numero: 'E26-081', cliente: 'LONGRATEX', of: 'OF-1', ref: 'BOY CRUISE', qtd: 300, precoUnit: 7, valor: 2100, estado: '01. Espera tecido', prioridade: 1,
      dtEncomenda: '2026-10-01', dtEntregaSolic: '2026-12-18', dtEntregaPrev: '2026-12-10', dtEntregaComunicada: '2026-12-12', dtEntregaReal: '', amostra: '' })
    expect(l.ordens[1].dtEntregaComunicada).toBe('') // data vazia (0) no Excel
    expect(l.ordens[2].dtEntregaPrev).toBe('') // só hora
    expect(l.ignoradas).toBe(1)
    expect(l.avisos.some((a) => /E26-081 × 2/.test(a))).toBe(true)
  })

  test('datas: nº de série, texto e células vazias', () => {
    expect(dataCelula(46022)).toBe('2025-12-31')
    expect(dataCelula(46022.71)).toBe('2025-12-31')
    expect(dataCelula('05/01/2026')).toBe('2026-01-05')
    expect(dataCelula(1)).toBe('')
    expect(dataCelula(null)).toBe('')
  })

  test('comparação com o que já está na aplicação', async () => {
    const l = await lerPlaneamento(livroPlaneamento())
    const atuais = l.ordens.slice(0, 2).map((o, i) => comImportacao(i === 0 ? { ...o, estado: '05. Corte' } : o))
    const c = compararPlaneamento(l.ordens, atuais)
    expect(c.novas.map((o) => o.id)).toEqual(['E26-070-1·1', 'E26-040·1'])
    expect(c.alteradas.map((o) => o.id)).toEqual(['E26-081·1'])
    expect(c.estadoMuda).toHaveLength(1)
    expect(c.iguais).toBe(1)
  })

  test('liga às encomendas pelo nº interno e pelo cliente; entrega atrasada', async () => {
    const ordens = (await lerPlaneamento(livroPlaneamento())).ordens.map(comImportacao)
    const lgx = encomendaLongratex() // nº interno 81 → E26-081
    expect(ordensDaEncomenda(lgx, ordens).map((o) => o.id)).toEqual(['E26-081·1', 'E26-081·2'])
    expect(encomendaDaOrdem(ordens[0], [lgx])?.id).toBe(lgx.id)
    // mesmo nº, outro cliente: não liga
    expect(encomendaDaOrdem({ ...ordens[0], cliente: 'IMPREVU' }, [lgx])).toBeUndefined()
    expect(mesmoClienteOrdem("T'S IN THE BOX ", "T's in the box")).toBe(true)
    expect(mesmoClienteOrdem('DR COLLECTORS', 'Dr. Collectors')).toBe(true)
    expect(atrasada(ordens[0], '2026-12-13')).toBe(true)
    expect(atrasada(ordens[3], '2026-12-13')).toBe(false) // faturada
  })
})
