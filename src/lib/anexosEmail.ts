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
// ==== FIM anexosEmail ====
