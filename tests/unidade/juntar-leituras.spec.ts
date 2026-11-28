import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { juntarLeituras, resumoParcial } from '../../src/lib/juntarLeituras'

// Leituras fictícias, já com a forma do esquema
const modelo = (referencia: string, nome: string) => ({ referencia, nome, tipoPeca: 'Calça', paginas: [1], composicao: '98% algodão', tamanhos: ['44', '46'],
  campos: [{ campo: 'Lavagem', valor: 'Sem lavagem', pagina: 2, confianca: 'alta' }], tecidos: [{ descricao: 'Sarja', fornecedor: null, consumo: 1.3, unidade: 'm', cor: null, observacoes: null, pagina: 1, confianca: 'media' }],
  acessorios: [], bordadosEstampados: [], medidas: null, pedidos: [], observacoes: [] })
const parcial = (nome: string, ref: string, duvidas: string[] = []) => ({
  classificacao: { tipo: 'tech_pack', confianca: 'alta', motivo: '' }, idioma: 'en', resumo: `Tech pack ${ref}`,
  cliente: { nome: null, marca: 'Marca X', nif: null, email: null, pais: 'DE', nomeConhecido: null },
  anexos: [{ nome, tipo: 'tech_pack', resumo: `Ficha ${ref}` }], encomenda: null,
  techpack: { marca: 'Marca X', colecao: null, modelos: [modelo(ref, `Modelo ${ref}`)] }, pedidoPreco: null, duvidas,
})
const final = {
  classificacao: { tipo: 'pedido_preco', confianca: 'alta', motivo: 'Pede cotação' }, idioma: 'pt', resumo: 'Pedido de cotação de 3 calças',
  cliente: { nome: 'Cliente Y', marca: null, nif: null, email: 'a@cliente.example', pais: null, nomeConhecido: null },
  anexos: [{ nome: 'A.pdf', tipo: 'outro', resumo: 'genérico' }, { nome: 'hangtag.png', tipo: 'imagem', resumo: 'Hangtag' }],
  encomenda: null, techpack: null,
  pedidoPreco: { pecas: [{ referencia: 'A', descricao: 'Calça A', tipoPeca: 'Calça', tecido: null, tratamento: null, quantidade: 100, precoAlvo: null, observacoes: null }], prazo: null, observacoes: [] },
  duvidas: ['Confirmar a quantidade por cor.', 'Falta o preço dos botões.'],
}

test.describe('Leitura de email por partes: juntar', () => {
  test('modelos de todos os documentos, classificação e pedido da leitura final', () => {
    const r = juntarLeituras(final, [parcial('A.pdf', 'A', ['Falta o preço dos botões.']), parcial('B.pdf', 'B', ['Sem tabela de medidas.'])]) as Record<string, any>
    expect(r.classificacao.tipo).toBe('pedido_preco')
    expect(r.resumo).toBe('Pedido de cotação de 3 calças')
    expect(r.techpack.modelos.map((m: { referencia: string }) => m.referencia)).toEqual(['A', 'B'])
    expect(r.techpack.marca).toBe('Marca X')
    expect(r.pedidoPreco.pecas).toHaveLength(1)
    // cliente da final completado pelas parciais
    expect(r.cliente).toEqual({ nome: 'Cliente Y', marca: 'Marca X', nif: null, email: 'a@cliente.example', pais: 'DE', nomeConhecido: null })
    // anexos: a descrição do próprio documento ganha; sem repetidos
    expect(r.anexos.map((a: { nome: string; resumo: string }) => `${a.nome}:${a.resumo}`)).toEqual(['A.pdf:Ficha A', 'B.pdf:Ficha B', 'hangtag.png:Hangtag'])
    // dúvidas sem repetidos
    expect(r.duvidas).toEqual(['Confirmar a quantidade por cor.', 'Falta o preço dos botões.', 'Sem tabela de medidas.'])
  })

  test('encomendas em vários documentos juntam as linhas; sem tech packs fica null', () => {
    const enc = (ref: string) => ({ cliente: 'X', numeroDocumento: 'PO-1', dataDocumento: null, dataEntrega: null, tamanhos: ['S'], linhas: [{ referencia: ref, quantidades: [5] }], totaisDocumento: { pecas: null, valor: null, porTamanho: null }, notas: ['Oeko-Tex'], perguntas: [] })
    const r = juntarLeituras({ ...final, pedidoPreco: null }, [{ ...parcial('1.pdf', 'A'), techpack: null, encomenda: enc('A') }, { ...parcial('2.pdf', 'B'), techpack: null, encomenda: enc('B') }]) as Record<string, any>
    expect(r.encomenda.linhas.map((l: { referencia: string }) => l.referencia)).toEqual(['A', 'B'])
    expect(r.encomenda.notas).toEqual(['Oeko-Tex'])
    expect(r.techpack).toBe(null)
    expect(r.pedidoPreco).toBe(null)
  })

  test('resumo parcial para a leitura final', () => {
    expect(resumoParcial('A.pdf', parcial('A.pdf', 'A', ['x']))).toEqual({
      anexo: 'A.pdf', resumo: 'Tech pack A', linhasEncomenda: 0, duvidas: ['x'],
      modelos: [{ referencia: 'A', nome: 'Modelo A', tipoPeca: 'Calça', composicao: '98% algodão', tamanhos: ['44', '46'], tecidos: ['Sarja'], acessorios: [], lavagem: ['Sem lavagem'] }],
    })
  })

  test('a função do servidor tem a mesma cópia', () => {
    const bloco = (f: string) => {
      const t = readFileSync(f, 'utf8')
      const a = t.indexOf('// ==== INÍCIO juntarLeituras ===='), b = t.indexOf('// ==== FIM juntarLeituras ====')
      expect(a, f).toBeGreaterThanOrEqual(0)
      return t.slice(a, b)
    }
    expect(bloco('supabase/functions/ler-email/index.ts')).toBe(bloco('src/lib/juntarLeituras.ts'))
  })
})
