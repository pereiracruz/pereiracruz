import { expect, test } from '@playwright/test'
import { REGRAS_INICIAIS, calcularDia, calcularMes, diasUteis, feriados, horasTexto, juntarRelogio, lerHoras, minutosDia, numeroFolha, type MesFaltas, type Pessoa } from '../../src/lib/faltas'

const r = REGRAS_INICIAIS // 8h–12h e 13h–17h10, tolerância 5 min, horas extra de 16/11 a 23/12/2026 (blocos ≥ 15 min)
const fer = feriados(2026)
const h = (s: string) => s.split(' ').map((x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b })

test.describe('Faltas e relógio de ponto', () => {
  test('feriados (nacionais + 3 de maio, Barcelos) e dias úteis', () => {
    for (const d of ['2026-04-03', '2026-04-05', '2026-05-03', '2026-06-04', '2026-12-08']) expect(fer.has(d), d).toBe(true)
    expect(diasUteis(2026, 11)).toHaveLength(21)
    expect(diasUteis(2026, 12)).toHaveLength(20)
    expect(minutosDia(r)).toBe(490)
  })

  test('dia normal, tolerância na entrada e atraso', () => {
    expect(calcularDia({ data: '2026-11-02', picagens: h('8:00 12:00 13:00 17:10') }, r, fer)).toMatchObject({ falta: 0, trabalho: 490, util: true })
    expect(calcularDia({ data: '2026-11-02', picagens: h('8:04 12:00 13:00 17:10') }, r, fer).falta).toBe(0)
    expect(calcularDia({ data: '2026-11-02', picagens: h('8:10 12:00 13:00 17:10') }, r, fer).falta).toBe(10)
  })

  test('picagens do almoço esquecidas e dia sem picagens', () => {
    const d = calcularDia({ data: '2026-11-02', picagens: h('8:00 17:10') }, r, fer)
    expect(d.falta).toBe(0)
    expect(d.aviso).toMatch(/almoço/)
    expect(calcularDia({ data: '2026-11-02', picagens: [] }, r, fer)).toMatchObject({ semPicagens: true, falta: 490 })
    expect(calcularDia({ data: '2026-11-01', picagens: [] }, r, fer)).toMatchObject({ util: false, falta: 0 }) // domingo
  })

  test('horas extra só no período combinado e em blocos de pelo menos 15 minutos', () => {
    expect(calcularDia({ data: '2026-11-17', picagens: h('8:00 12:00 13:00 17:40') }, r, fer).extra).toBe(30)
    expect(calcularDia({ data: '2026-11-17', picagens: h('8:00 12:00 13:00 17:20') }, r, fer).extra).toBe(0)
    expect(calcularDia({ data: '2026-11-10', picagens: h('8:00 12:00 13:00 17:40') }, r, fer).extra).toBe(0)
    expect(calcularDia({ data: '2026-11-21', picagens: h('8:00 10:00') }, r, fer)).toMatchObject({ sabado: true, extra: 120 })
  })

  test('mês: falta compensada no banco de horas, baixa e subsídio de alimentação', () => {
    const p: Pessoa = { numero: '0007', nome: 'Teste', salarioBase: 900, subsidioDia: 6, taxaIrs: 0, premio: 0, km: 0, bancoAnterior: 60, picaPonto: true, ativa: true }
    const m: MesFaltas = {
      id: '2026-11', ano: 2026, mes: 11, regras: r, pessoas: [p], atualizadoEm: '',
      relogio: [{ numero: '7', nome: 'Teste', dias: [{ data: '2026-11-02', picagens: h('8:30 12:00 13:00 17:10') }, { data: '2026-11-03', picagens: [] }] }],
      ajustes: { '0007': { ausencias: { '2026-11-03': 'baixa' }, confirmados: {} } },
    }
    const [l] = calcularMes(m)
    expect(l.faltaMin).toBe(30)
    expect(l.faltaCompensada).toBe(30)
    expect(l.bancoFinal).toBe(30)
    expect(l.faltasEur).toBe(0)
    expect(l.diasBaixa).toBe(1)
    expect(l.baixaEur).toBe(30)
    expect(l.diasUteisSub).toBe(20)
    expect(l.subsidio).toBe(120)
  })

  test('números, horas e junção de registos do relógio', () => {
    expect(numeroFolha(7)).toBe('0007')
    expect(numeroFolha('80')).toBe('080')
    expect(lerHoras('2h30')).toBe(150)
    expect(lerHoras('1:15')).toBe(75)
    expect(horasTexto(150)).toBe('2h30')
    const j = juntarRelogio([{ numero: '0007', nome: 'A', dias: [{ data: '2026-11-02', picagens: [1] }] }], [{ numero: '7', nome: 'A', dias: [{ data: '2026-11-02', picagens: [2] }, { data: '2026-11-03', picagens: [3] }] }])
    expect(j).toHaveLength(1)
    expect(j[0].dias.map((d) => d.picagens![0])).toEqual([2, 3])
  })
})
