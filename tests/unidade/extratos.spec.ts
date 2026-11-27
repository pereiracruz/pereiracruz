import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'
import { lerExtratoFicheiro } from '../../src/lib/extratoFicheiro'

const ficheiro = (conteudo: BlobPart, nome: string, tipo = 'text/csv') => new File([conteudo], nome, { type: tipo })

test.describe('Extratos bancários lidos sem IA', () => {
  test('CSV com débito e crédito, números portugueses e o mais recente primeiro', async () => {
    const csv = [
      'Extrato de conta;;;;',
      'Saldo contabilístico inicial;2.010,81;;;',
      'Data mov.;Data valor;Descrição;Débito;Crédito;Saldo',
      '05/11/2026;05/11/2026;TRF IMPREVU SAS;;1.500,00;3.390,81',
      '03/11/2026;03/11/2026;"TRF CLOTHIUS; TECELAGEM";120,00;;1.890,81',
    ].join('\r\n')
    const e = await lerExtratoFicheiro(ficheiro(csv, 'cgd.csv'))
    expect(e).not.toBeNull()
    expect(e!.movimentos.map((m) => [m.data, m.valor])).toEqual([['2026-11-03', -120], ['2026-11-05', 1500]])
    expect(e!.movimentos[0].descricao).toBe('TRF CLOTHIUS; TECELAGEM')
    expect(e!.saldoInicial).toBe(2010.81)
    expect(e!.saldoFinal).toBe(3390.81)
    expect([e!.dataInicio, e!.dataFim]).toEqual(['2026-11-03', '2026-11-05'])
  })

  test('Excel com uma coluna de montante (com sinal)', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Data', 'Descritivo', 'Montante', 'Saldo'], ['2026-11-02', 'COMPRA STAPLES', -45.9, 954.1], ['2026-11-04', 'TRF LONGRATEX', 800, 1754.1]])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Movimentos')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const e = await lerExtratoFicheiro(ficheiro(buf, 'extrato.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
    expect(e!.movimentos.map((m) => m.valor)).toEqual([-45.9, 800])
    expect(e!.saldoInicial).toBe(1000) // saldo da 1.ª linha − o seu movimento
  })

  test('formato desconhecido: devolve null (a aplicação usa a leitura com IA)', async () => {
    expect(await lerExtratoFicheiro(ficheiro('isto não é um extrato\n1;2;3', 'x.csv'))).toBeNull()
  })
})
