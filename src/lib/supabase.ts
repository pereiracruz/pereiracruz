import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Cliente Supabase (null = modo local, dados só no browser). */
export const supabase = url && chave ? createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true } }) : null
export const modoServidor = !!supabase
