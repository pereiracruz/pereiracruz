import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { ANEXO_LIDO, DOCUMENTO_EMAIL, corrigirNomeZip, destinoAnexo, extrairDoZip, filtroZip, lerDiretorioZip, origemZip } from '../../src/lib/anexosEmail'

/** Zip fictício feito à mão (formato PKZIP): nomes em bytes, guardado (0) ou deflate (8), com ou sem a marca UTF-8. */
function fazerZip(ficheiros: { nome: Uint8Array; dados: Uint8Array; deflate?: boolean; utf8?: boolean }[]) {
  const locais: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const f of ficheiros) {
    const corpo = f.deflate ? deflateRawSync(f.dados) : Buffer.from(f.dados)
    const flags = f.utf8 ? 0x800 : 0, metodo = f.deflate ? 8 : 0
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(flags, 6); l.writeUInt16LE(metodo, 8)
    l.writeUInt32LE(corpo.length, 18); l.writeUInt32LE(f.dados.length, 22); l.writeUInt16LE(f.nome.length, 26)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(metodo, 10)
    c.writeUInt32LE(corpo.length, 20); c.writeUInt32LE(f.dados.length, 24); c.writeUInt16LE(f.nome.length, 28); c.writeUInt32LE(offset, 42)
    locais.push(l, Buffer.from(f.nome), corpo); central.push(c, Buffer.from(f.nome))
    offset += 30 + f.nome.length + corpo.length
  }
  const dir = Buffer.concat(central)
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(ficheiros.length, 8); fim.writeUInt16LE(ficheiros.length, 10)
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locais, dir, fim]))
}
const bytes = (s: string) => new TextEncoder().encode(s)

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

  test('zips lidos sem bibliotecas: nomes do Mac, guardado e deflate, lixo filtrado', async () => {
    const pdf = bytes('%PDF-1.4 ficha fictícia '.repeat(200))
    const zip = fazerZip([
      { nome: bytes('Projeto/3 CALC\u0327AS/M1.DXF'), dados: bytes('0\nSECTION\n'.repeat(500)), deflate: true }, // Mac: UTF-8 sem marca
      { nome: bytes('Projeto/Fichas/Ficha A.pdf'), dados: pdf, utf8: true },
      { nome: bytes('__MACOSX/Projeto/._Ficha A.pdf'), dados: bytes('lixo') },
    ])
    const es = lerDiretorioZip(zip)
    expect(es.map((e) => e.caminho)).toEqual(['Projeto/3 CALÇAS/M1.DXF', 'Projeto/Fichas/Ficha A.pdf', '__MACOSX/Projeto/._Ficha A.pdf'])
    const f = filtroZip()
    const uteis = es.filter((e) => f.aceitar(e.caminho, e.tamanho))
    expect(uteis).toHaveLength(2)
    expect(new TextDecoder().decode(await extrairDoZip(zip, uteis[0]))).toBe('0\nSECTION\n'.repeat(500))
    expect(await extrairDoZip(zip, uteis[1])).toEqual(pdf)
    expect(origemZip('Projeto.zip', uteis[0].caminho)).toBe('Projeto.zip › 3 CALÇAS')
    expect(() => lerDiretorioZip(bytes('não é zip nenhum'))).toThrow('não é um zip válido')
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
