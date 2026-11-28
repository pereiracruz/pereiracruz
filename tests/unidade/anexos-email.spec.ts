import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { ANEXO_LIDO, DOCUMENTO_EMAIL, corrigirNomeZip, destinoAnexo, filtroZip, origemZip } from '../../src/lib/anexosEmail'

// Nomes fictícios; nenhum ficheiro de cliente entra nos testes.
test.describe('Anexos dos emails (zips, moldes, lixo do Mac)', () => {
  test('o que se lê, o que se abre, o que se guarda e o que se ignora', () => {
    expect(destinoAnexo({ nome: 'Tech pack modelo A.pdf', disposicao: 'attachment' })).toBe('ler')
    expect(destinoAnexo({ nome: 'Encomenda.xlsx', disposicao: 'attachment' })).toBe('ler')
    expect(destinoAnexo({ nome: 'Projeto.zip', disposicao: 'attachment' })).toBe('zip')
    expect(destinoAnexo({ nome: 'MOLDE-001.DXF', disposicao: 'attachment' })).toBe('guardar')
    // imagens do corpo e da assinatura não são anexos; imagens anexadas a sério são
    expect(destinoAnexo({ nome: 'image001.png', disposicao: 'inline' })).toBe('ignorar')
    expect(destinoAnexo({ nome: 'foto.jpg' })).toBe('ignorar')
    expect(destinoAnexo({ nome: 'foto.jpg', disposicao: 'attachment' })).toBe('ler')
    expect(destinoAnexo({ nome: 'logo.png', disposicao: 'attachment' })).toBe('ignorar')
    // ruído dos programas de email
    for (const n of ['ATT00001.htm', 'smime.p7s', 'winmail.dat', 'convite.ics']) expect(destinoAnexo({ nome: n, disposicao: 'attachment' })).toBe('ignorar')
  })

  test('dentro de um zip: imagens contam, lixo do Mac fora, zips dentro de zips ficam inteiros', () => {
    expect(destinoAnexo({ nome: 'Pasta/Etiqueta lavagem.png', dentroDeZip: true })).toBe('ler')
    expect(destinoAnexo({ nome: 'Pasta/logo.png', dentroDeZip: true })).toBe('ler')
    expect(destinoAnexo({ nome: 'Pasta/Moldes antigos.zip', dentroDeZip: true })).toBe('guardar')
    expect(destinoAnexo({ nome: 'Pasta/MOLDE.DXF', dentroDeZip: true })).toBe('guardar')
    for (const n of ['__MACOSX/Pasta/._ficha.pdf', 'Pasta/.DS_Store', 'Pasta/._ficha.pdf', '._x.pdf', 'Pasta/', 'Pasta/Thumbs.db'])
      expect(destinoAnexo({ nome: n, dentroDeZip: true }), n).toBe('ignorar')
  })

  test('um zip conta como documento para o email entrar; o DXF não é lido pela IA', () => {
    expect(DOCUMENTO_EMAIL.test('Projeto.zip')).toBe(true)
    expect(DOCUMENTO_EMAIL.test('foto.png')).toBe(false)
    expect(ANEXO_LIDO.test('MOLDE.DXF')).toBe(false)
    expect(ANEXO_LIDO.test('ficha.PDF')).toBe(true)
  })

  test('nomes de zips feitos no Mac (UTF-8 sem indicação) ficam corretos', () => {
    // «CALÇAS» em UTF-8 decomposto (C + cedilha combinante), lido como latin1
    const estragado = String.fromCharCode(...new TextEncoder().encode('3 CALÇAS (1)'))
    expect(estragado).not.toBe('3 CALÇAS (1)')
    expect(corrigirNomeZip(estragado)).toBe('3 CALÇAS (1)')
    expect(corrigirNomeZip('Ficha técnica.pdf')).toBe('Ficha técnica.pdf') // latin1 verdadeiro que não é UTF-8 fica igual
    expect(corrigirNomeZip('Ficha.pdf')).toBe('Ficha.pdf')
  })

  test('origem mostrada sem a pasta repetida do zip', () => {
    expect(origemZip('Projeto.zip', 'Projeto/Moldes/M1.DXF')).toBe('Projeto.zip › Moldes')
    expect(origemZip('Projeto.zip', 'ficha.pdf')).toBe('Projeto.zip')
    expect(origemZip('Projeto.zip', 'Outra/ficha.pdf')).toBe('Projeto.zip › Outra')
  })

  test('limites do zip: ficheiros grandes demais e zips enormes ficam registados, não rebentam', () => {
    const f = filtroZip({ entradas: 2, total: 100, parte: 60 })
    expect(f.aceitar('P/a.pdf', 50)).toBe(true)
    expect(f.aceitar('__MACOSX/P/._a.pdf', 1)).toBe(false)
    expect(f.aceitar('P/grande.DXF', 70)).toBe(false)
    expect(f.aceitar('P/b.pdf', 40)).toBe(true)
    expect(f.aceitar('P/c.pdf', 5)).toBe(false) // já tem 2 ficheiros
    expect(f.recusados).toEqual([
      { nome: 'grande.DXF', tamanho: 70, motivo: 'grande demais' },
      { nome: 'c.pdf', tamanho: 5, motivo: 'o zip é grande demais' },
    ])
  })

  test('a função do servidor tem a mesma cópia das regras', () => {
    const bloco = (f: string) => {
      const t = readFileSync(f, 'utf8')
      const a = t.indexOf('// ==== INÍCIO anexosEmail ===='), b = t.indexOf('// ==== FIM anexosEmail ====')
      expect(a, f).toBeGreaterThanOrEqual(0)
      return t.slice(a, b)
    }
    expect(bloco('supabase/functions/email-encomendas/index.ts')).toBe(bloco('src/lib/anexosEmail.ts'))
  })
})
