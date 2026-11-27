import { supabase } from './supabase'
import { slug } from './format'
import type { ClienteCfg } from '../types'

/**
 * Clientes que trabalham com ordem de fabrico (OF) em vez de tech pack (ex.: Simão e Olgando, GBTX):
 * entregam os acessórios e uma OF em PDF por modelo; a Pereira & Cruz trata do tecido, lavandaria, corte e confeção.
 */
const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*&\s*/g, ' e ').replace(/\s+/g, ' ').trim()

export const mesmoCliente = (a: string, b: string) => norm(a) === norm(b)
export const cfgCliente = (clientes: ClienteCfg[], nome: string) => clientes.find((c) => norm(c.nome) === norm(nome))
export const usaOF = (clientes: ClienteCfg[], nome: string) => cfgCliente(clientes, nome)?.documentoModelo === 'OF'
/** Nome do documento de cada modelo deste cliente, para os textos («tech pack» ou «OF»). */
export const nomeDocumento = (clientes: ClienteCfg[], nome: string) => (usaOF(clientes, nome) ? 'OF' : 'tech pack')

/** Fornecedor que se põe nos acessórios dados pelo cliente (as compras tratam-nos como «enviado pela cliente»). */
export const FORNECIDO_CLIENTE = 'Fornecido pelo cliente'

/** Guarda a OF no bucket privado «documentos» e devolve o caminho. */
export async function guardarOF(ficheiro: File): Promise<string> {
  if (!supabase) throw new Error('Guardar a OF precisa do servidor (Supabase).')
  const { data: sessao } = await supabase.auth.getUser()
  const ponto = ficheiro.name.lastIndexOf('.')
  const nome = ponto > 0 ? `${slug(ficheiro.name.slice(0, ponto))}${ficheiro.name.slice(ponto).toLowerCase()}` : slug(ficheiro.name)
  const caminho = `${sessao.user?.id ?? 'anon'}/of/${Date.now().toString(36)}-${nome}`
  const { error } = await supabase.storage.from('documentos').upload(caminho, ficheiro, { contentType: ficheiro.type || 'application/pdf' })
  if (error) throw new Error(`Não foi possível guardar a OF: ${error.message}`)
  return caminho
}

/** Abre a OF guardada num separador novo (ligação temporária). */
export async function abrirOF(caminho: string) {
  if (!supabase) return
  const janela = window.open('', '_blank') // abre já, para o navegador não bloquear
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(caminho, 3600)
  if (error || !data) { janela?.close(); alert(`Não foi possível abrir a OF: ${error?.message ?? ''}`); return }
  if (janela) janela.location.href = data.signedUrl
  else window.open(data.signedUrl, '_blank')
}
