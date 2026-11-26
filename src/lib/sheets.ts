import { supabase } from './supabase'
import type { FolhaLivro } from './exportar'
import { paraSheets } from './exportar'

/** Cria a folha de cálculo no Google Drive da empresa (função «exportar-sheets») e devolve o link. */
export async function exportarSheets(titulo: string, folhas: FolhaLivro[]): Promise<string> {
  if (!supabase) throw new Error('A exportação para o Google Sheets precisa do servidor.')
  const { data, error } = await supabase.functions.invoke('exportar-sheets', { body: { titulo, folhas: paraSheets(folhas) } })
  if (error) {
    let motivo = error.message
    try { const corpo = await (error as { context?: Response }).context?.json(); if (corpo?.erro) motivo = corpo.erro } catch { /* sem corpo */ }
    throw new Error(motivo)
  }
  if (!data?.ok) throw new Error(data?.erro ?? 'A exportação falhou.')
  return data.url as string
}
