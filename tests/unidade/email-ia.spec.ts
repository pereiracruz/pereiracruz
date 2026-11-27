import { expect, test } from '@playwright/test'
import { clienteDoEmail, encomendaDoEmail, pedidosDoEmail, type EmailLido } from '../../src/lib/emailIA'
import * as seed from '../../src/data/seed'

// Leitura fictícia no formato devolvido pela função «ler-email» (OpenRouter, structured outputs)
const leitura = (x: Partial<EmailLido> = {}): EmailLido => ({
  classificacao: { tipo: 'encomenda', confianca: 'alta', motivo: 'Ordem de compra com quantidades por tamanho.' },
  idioma: 'fr', resumo: 'Encomenda da coleção SS27 com 2 cores.',
  cliente: { nome: 'IMPREVU SAS', marca: 'Imprevu', nif: null, email: 'achats@imprevu.example', pais: 'FR', nomeConhecido: 'Imprevu' },
  anexos: [{ nome: 'PO-123.pdf', tipo: 'encomenda', resumo: 'Ordem de compra' }, { nome: 'TP-JANET.pdf', tipo: 'tech_pack', resumo: 'Tech pack Chemise Janet' }],
  encomenda: {
    cliente: 'IMPREVU', numeroDocumento: 'PO-123', dataDocumento: '2026-11-20', dataEntrega: '2027-02-15', tamanhos: ['S', 'M', 'L'],
    linhas: [
      { linhaEncomenda: null, referencia: '7E27JANET', descricao: 'CHEMISE JANET', cor: 'AW - ACID WASH', quantidades: [10, 20, 10], total: 40, preco: 30, pagina: 1, confianca: 'alta' },
      { linhaEncomenda: null, referencia: '7E27JANET', descricao: 'CHEMISE JANET', cor: 'MB - MEDIUM BLUE', quantidades: [5, 10, 5], total: 20, preco: 30, pagina: 1, confianca: 'media' },
    ],
    totaisDocumento: { pecas: 60, valor: 1800, porTamanho: [15, 30, 15] }, notas: ['Oeko-Tex'], perguntas: ['Podem entregar antes?'],
  },
  techpack: { marca: 'Imprevu', colecao: 'SS27', modelos: [{
    referencia: '7E27JANET', nome: 'Chemise Janet', tipoPeca: 'Camisa', paginas: [1], composicao: '100% algodão', tamanhos: ['S', 'M', 'L'],
    campos: [{ campo: 'Lavagem', valor: 'Acid wash', pagina: 2, confianca: 'alta' }],
    tecidos: [{ descricao: 'Denim 8oz', fornecedor: null, consumo: 1.2, unidade: 'm', cor: null, observacoes: null, pagina: 1, confianca: 'media' }],
    acessorios: [], bordadosEstampados: [], medidas: null, pedidos: [], observacoes: [],
  }] },
  pedidoPreco: null, duvidas: ['Confirmar a data de entrega.'], ...x,
})
const dm = { fornecedores: seed.fornecedores, tecidos: seed.tecidos, equivalencias: seed.equivalencias, acessorios: seed.acessoriosCliente, clientes: seed.clientes }

test.describe('Emails lidos com IA (OpenRouter)', () => {
  test('cliente existente pelo nome conhecido, nome ou marca; cliente novo', () => {
    expect(clienteDoEmail(leitura(), seed.clientes).existente?.nome).toBe('Imprevu')
    expect(clienteDoEmail(leitura({ cliente: { nome: 'LONGRATEX S.A.', marca: null, nif: null, email: null, pais: 'PT', nomeConhecido: null } }), seed.clientes).existente?.nome).toBe('Longratex')
    const novo = clienteDoEmail(leitura({ cliente: { nome: 'Malha Nova Lda', marca: null, nif: '500000000', email: null, pais: 'PT', nomeConhecido: null }, encomenda: null }), seed.clientes)
    expect(novo).toEqual({ existente: null, nome: 'Malha Nova Lda' })
  })

  test('encomenda: linhas juntas em modelo e variantes, notas e ficha em rascunho a partir do tech pack', () => {
    const { encomenda, fichas } = encomendaDoEmail(leitura(), 'Imprevu', 'SS27', ['PO-123.pdf', 'TP-JANET.pdf'], dm)
    expect(encomenda.cliente).toBe('Imprevu')
    expect(encomenda.colecao).toBe('SS27')
    expect(encomenda.entrega).toBe('2027-02-15')
    expect(encomenda.modelos).toHaveLength(1)
    expect(encomenda.modelos[0].variantes.map((v) => v.qtd.reduce((a, b) => a + b, 0))).toEqual([40, 20])
    expect(fichas).toBe(1)
    expect(encomenda.modelos[0].estado).toBe('rascunho') // tem de ser aprovada
    expect(encomenda.notas?.join(' ')).toContain('A confirmar: Confirmar a data de entrega.')
    expect(encomenda.notas?.join(' ')).toContain('Pergunta do cliente: Podem entregar antes?')
  })

  test('sem encomenda não cria nada', () => {
    expect(() => encomendaDoEmail(leitura({ encomenda: null }), 'Imprevu', '', [], dm)).toThrow(/não tem uma encomenda/)
  })

  test('pedido de preço: um pedido de orçamento por peça, com a ficha-modelo certa', () => {
    const ps = pedidosDoEmail(leitura({
      classificacao: { tipo: 'pedido_preco', confianca: 'alta', motivo: 'Pede cotação.' }, encomenda: null, techpack: null,
      pedidoPreco: { prazo: '2027-03-01', observacoes: [], pecas: [
        { referencia: 'SHORT-01', descricao: 'Calção chino criança', tipoPeca: 'Calções', tecido: 'Sarja', tratamento: 'Tingido', quantidade: 300, precoAlvo: 9.5, observacoes: null },
        { referencia: null, descricao: 'Jeans 5 bolsos adulto', tipoPeca: null, tecido: 'Denim', tratamento: null, quantidade: null, precoAlvo: null, observacoes: null },
      ] },
    }), 'Longratex')
    expect(ps).toHaveLength(2)
    expect(ps[0]).toMatchObject({ cliente: 'Longratex', peca: 'SHORT-01', tipoPeca: 'Calções', entrega: '2027-03-01', estado: 'Rascunho', origem: 'ia' })
    expect(ps[0].linhas.some((l) => /massa/i.test(l.descricao))).toBe(true) // sarja → botão de massa
    expect(ps[1]).toMatchObject({ tipoPeca: 'Calças', peca: 'Jeans 5 bolsos adulto' })
    expect(ps[1].linhas.some((l) => /Rebites/.test(l.descricao))).toBe(true) // denim → ficha-modelo de ganga (3 rebites)
  })
})
