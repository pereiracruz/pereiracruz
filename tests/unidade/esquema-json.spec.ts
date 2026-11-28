import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { ajustarAoEsquema, type EsquemaJson } from '../../src/lib/esquemaJson'

// Esquema pequeno com a mesma forma do da leitura de emails (strict: tudo obrigatório, null quando não existe)
const confianca = { type: 'string', enum: ['alta', 'media', 'baixa'] }
const ESQ: EsquemaJson = {
  type: 'object', properties: {
    classificacao: { type: 'object', properties: { tipo: { type: 'string', enum: ['encomenda', 'pedido_preco', 'outro'] }, confianca, motivo: { type: 'string' } } },
    resumo: { type: 'string' },
    encomenda: { type: ['object', 'null'], properties: {
      tamanhos: { type: 'array', items: { type: 'string' } },
      linhas: { type: 'array', items: { type: 'object', properties: { referencia: { type: 'string' }, quantidades: { type: 'array', items: { type: 'integer' } }, total: { type: ['integer', 'null'] }, preco: { type: ['number', 'null'] }, confianca } } },
    } },
    duvidas: { type: 'array', items: { type: 'string' } },
  },
}

test.describe('Resposta da IA acertada ao esquema (sem modo estrito)', () => {
  test('campos em falta ficam vazios ou null; confiança em falta fica «baixa»; extras saem', () => {
    expect(ajustarAoEsquema({ resumo: 'Pedido de cotação', extra: 1 }, ESQ)).toEqual({
      classificacao: { tipo: 'outro', confianca: 'baixa', motivo: '' }, resumo: 'Pedido de cotação', encomenda: null, duvidas: [],
    })
  })

  test('números em texto, enums com maiúsculas e linhas incompletas', () => {
    const r = ajustarAoEsquema({
      classificacao: { tipo: 'Pedido_Preco', confianca: 'ALTA', motivo: 'Pede preços' },
      encomenda: { tamanhos: ['S', 'M'], linhas: [{ referencia: 'REF1', quantidades: ['10', 5.6], total: '15', preco: '12,50' }, { referencia: 7 }] },
      duvidas: 'não é lista',
    }, ESQ) as { classificacao: unknown; encomenda: { linhas: unknown[] }; duvidas: unknown }
    expect(r.classificacao).toEqual({ tipo: 'pedido_preco', confianca: 'alta', motivo: 'Pede preços' })
    expect(r.encomenda.linhas).toEqual([
      { referencia: 'REF1', quantidades: [10, 6], total: 15, preco: 12.5, confianca: 'baixa' },
      { referencia: '7', quantidades: [], total: null, preco: null, confianca: 'baixa' },
    ])
    expect(r.duvidas).toEqual([])
  })

  test('valor que não é número fica null (ou 0 se não pode ser null); enum desconhecido fica no último', () => {
    expect(ajustarAoEsquema('cerca de cem', { type: ['integer', 'null'] })).toBe(null)
    expect(ajustarAoEsquema('x', { type: 'integer' })).toBe(0)
    expect(ajustarAoEsquema('talvez', confianca)).toBe('baixa')
  })

  test('a função do servidor tem a mesma cópia', () => {
    const bloco = (f: string) => {
      const t = readFileSync(f, 'utf8')
      const a = t.indexOf('// ==== INÍCIO ajustarAoEsquema ===='), b = t.indexOf('// ==== FIM ajustarAoEsquema ====')
      expect(a, f).toBeGreaterThanOrEqual(0)
      return t.slice(a, b)
    }
    expect(bloco('supabase/functions/ler-email/index.ts')).toBe(bloco('src/lib/esquemaJson.ts'))
  })
})
