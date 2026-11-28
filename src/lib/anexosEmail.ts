// Regras para os anexos dos emails recolhidos pela função «email-encomendas»:
// o que se guarda, o que a IA lê, o que se ignora (assinaturas, lixo do Mac) e como se abrem os zips.
// O bloco entre os marcadores está COPIADO em supabase/functions/email-encomendas/index.ts (a função é um só ficheiro,
// colado no painel do Supabase). O teste tests/unidade/anexos-email.spec.ts confirma que as duas cópias são iguais.

// ==== INÍCIO anexosEmail ====
/** ler = a IA lê (PDF, Excel, imagens) · zip = abre-se e trata-se cada ficheiro · guardar = fica para descarregar (moldes DXF…) · ignorar */
export type DestinoAnexo = 'ler' | 'zip' | 'guardar' | 'ignorar'
export type AnexoNaoGuardado = { nome: string; tamanho: number; motivo: string }
/** formatos que a IA lê */
export const ANEXO_LIDO = /\.(xlsx|xlsm|xls|csv|pdf|png|jpe?g|webp|gif)$/i
/** anexos que contam como «documento» para uma encomenda ou fatura entrar (os zips podem trazer os PDFs) */
export const DOCUMENTO_EMAIL = /\.(xlsx|xlsm|xls|csv|pdf|zip)$/i
const IMAGEM_ANEXO = /\.(png|jpe?g|webp|gif)$/i
/** lixo do Mac e do Windows, dentro e fora de zips */
export const LIXO_ANEXO = /(^|\/)(__MACOSX\/|\._[^/]*$|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i
/** ficheiros que os programas de email acrescentam e que não são do cliente */
const RUIDO_EMAIL = /^(ATT\d+\.(htm|html|txt)|smime\.p7s|winmail\.dat)$|\.(p7s|vcf|ics)$/i

/** O que fazer com um anexo. Fora de zips, imagens no corpo do email (assinaturas, logótipos) não são anexos. */
export function destinoAnexo(a: { nome: string; disposicao?: string; relacionado?: boolean; dentroDeZip?: boolean }): DestinoAnexo {
  const caminho = (a.nome ?? '').trim()
  const nome = caminho.split('/').pop() ?? ''
  if (!nome || caminho.endsWith('/') || LIXO_ANEXO.test(caminho) || RUIDO_EMAIL.test(nome)) return 'ignorar'
  if (!a.dentroDeZip && IMAGEM_ANEXO.test(nome)
    && (a.relacionado || (a.disposicao ?? '').toLowerCase() !== 'attachment' || /^image\d{3}\.|assinatura|signature|logo/i.test(nome))) return 'ignorar'
  if (/\.zip$/i.test(nome)) return a.dentroDeZip ? 'guardar' : 'zip' // zips dentro de zips ficam inteiros
  return ANEXO_LIDO.test(nome) ? 'ler' : 'guardar'
}

/** Zips feitos no Mac guardam os nomes em UTF-8 sem o indicar: o leitor mostra «CALÃ\u0087AS» em vez de «CALÇAS». */
export function corrigirNomeZip(nome: string): string {
  if (!/[\u0080-ÿ]/.test(nome) || /[^\u0000-ÿ]/.test(nome)) return nome.normalize('NFC')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(nome, (c) => c.charCodeAt(0))).normalize('NFC')
  } catch { return nome.normalize('NFC') }
}

/** Decide, ficheiro a ficheiro, o que se tira de um zip (sem rebentar com a memória do servidor). */
export function filtroZip(limites = { entradas: 300, total: 150 * 1024 * 1024, parte: 30 * 1024 * 1024 }) {
  const recusados: AnexoNaoGuardado[] = []
  let n = 0, total = 0
  const aceitar = (caminho: string, tamanho: number) => {
    if (destinoAnexo({ nome: caminho, dentroDeZip: true }) === 'ignorar') return false
    const nome = corrigirNomeZip(caminho.split('/').pop() ?? caminho)
    if (tamanho > limites.parte) { recusados.push({ nome, tamanho, motivo: 'grande demais' }); return false }
    if (n >= limites.entradas || total + tamanho > limites.total) { recusados.push({ nome, tamanho, motivo: 'o zip é grande demais' }); return false }
    n++; total += tamanho
    return true
  }
  return { aceitar, recusados }
}

/** Pasta de origem de um ficheiro tirado de um zip, para mostrar: «Breedys.zip › 3 CALÇAS (1)». */
export function origemZip(nomeZip: string, caminho: string): string {
  const pastas = corrigirNomeZip(caminho).split('/').slice(0, -1).filter(Boolean)
  // a pasta com o mesmo nome do zip (o Mac cria-a sempre) não acrescenta nada
  if (pastas[0] && pastas[0].toLowerCase() === nomeZip.replace(/\.zip$/i, '').toLowerCase()) pastas.shift()
  return [nomeZip, ...pastas].join(' › ')
}
/** Ficheiro dentro de um zip, lido do diretório central (sem descomprimir nada). */
export type EntradaZip = { caminho: string; metodo: number; comprimido: number; tamanho: number; offset: number }

/** Lê a lista de ficheiros de um zip. Não usa bibliotecas: o servidor tem pouco tempo de processador. */
export function lerDiretorioZip(b: Uint8Array): EntradaZip[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let fim = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { fim = i; break }
  if (fim < 0) throw new Error('não é um zip válido')
  const total = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  if (p === 0xffffffff || total === 0xffff) throw new Error('zip64 (maior que 4 GB) não suportado')
  const r: EntradaZip[] = []
  for (let k = 0; k < total; k++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('zip danificado')
    const flags = v.getUint16(p + 8, true), metodo = v.getUint16(p + 10, true)
    const comprimido = v.getUint32(p + 20, true), tamanho = v.getUint32(p + 24, true)
    const n = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comentario = v.getUint16(p + 32, true)
    const offset = v.getUint32(p + 42, true)
    const bytes = b.subarray(p + 46, p + 46 + n)
    let caminho: string
    try { caminho = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { caminho = String.fromCharCode(...bytes) }
    if (!(flags & 0x800)) caminho = corrigirNomeZip(caminho)
    r.push({ caminho: caminho.normalize('NFC'), metodo, comprimido, tamanho, offset })
    p += 46 + n + extra + comentario
  }
  return r
}

/** Tira um ficheiro de um zip (guardado ou deflate), com a descompressão nativa do servidor/browser. */
export async function extrairDoZip(b: Uint8Array, e: EntradaZip): Promise<Uint8Array> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (v.getUint32(e.offset, true) !== 0x04034b50) throw new Error(`zip danificado em ${e.caminho}`)
  const inicio = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true)
  const dados = b.subarray(inicio, inicio + e.comprimido)
  if (e.metodo === 0) return dados.slice()
  if (e.metodo !== 8) throw new Error(`compressão não suportada em ${e.caminho}`)
  const fluxo = new Blob([dados as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}
// ==== FIM anexosEmail ====
