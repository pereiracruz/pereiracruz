import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AcessorioCliente, Atividade, ClienteCfg, Destinatario, Encomenda, Equivalencia, Escala, Fornecedor, Lavagem,
  Modelo, Pedido, PrecoHistorico, PrecoRef, Tecido,
} from '../types'
import * as seed from '../data/seed'
import { agoraISO, uid } from '../lib/format'

export interface Tabelas {
  fornecedores: Fornecedor[]
  tecidos: Tecido[]
  equivalencias: Equivalencia[]
  lavagens: Lavagem[]
  acessorios: AcessorioCliente[]
  escalas: Escala[]
  destinatarios: Destinatario[]
  precosRef: PrecoRef[]
  clientes: ClienteCfg[]
}
export type NomeTabela = keyof Tabelas

interface Estado extends Tabelas {
  encomendas: Encomenda[]
  pedidos: Pedido[]
  historico: PrecoHistorico[]
  atividade: Atividade[]
  // auth (local até haver servidor)
  sessao: string | null
  nomeUtilizador: string
  passHash: string

  log: (acao: string, detalhe: string) => void
  guardarLinha: <K extends NomeTabela>(t: K, linha: Tabelas[K][number], descricao: string) => void
  apagarLinha: (t: NomeTabela, id: string, descricao: string) => void

  adicionarEncomenda: (e: Encomenda) => void
  apagarEncomenda: (id: string) => void
  atualizarEncomenda: (id: string, fn: (e: Encomenda) => Encomenda) => void
  atualizarModelo: (encId: string, modId: string, fn: (m: Modelo) => Modelo) => void

  guardarPedido: (p: Pedido) => void
  adicionarHistorico: (h: PrecoHistorico) => void

  entrar: (utilizador: string, pass: string) => Promise<boolean>
  sair: () => void
  mudarPass: (atual: string, nova: string) => Promise<boolean>
  repor: () => void
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Palavra-passe inicial (só no modo local, até haver servidor): "pereira2026" */
const PASS_INICIAL_HASH = 'fbd70a4c75b221f2bb44dc036b5ae116e487343847b00ae6df0b5496a7a781d9'

const dadosIniciais = () => ({
  fornecedores: seed.fornecedores,
  tecidos: seed.tecidos,
  equivalencias: seed.equivalencias,
  lavagens: seed.lavagens,
  acessorios: seed.acessoriosCliente,
  escalas: seed.escalas,
  destinatarios: seed.destinatarios,
  precosRef: seed.precosRef,
  clientes: seed.clientes,
  encomendas: seed.encomendasIniciais(),
  pedidos: seed.pedidosIniciais(),
  historico: seed.historicoInicial(),
  atividade: seed.atividadeInicial(),
})

export const useDb = create<Estado>()(
  persist(
    (set, get) => ({
      ...dadosIniciais(),
      sessao: null,
      nomeUtilizador: 'Admin',
      passHash: PASS_INICIAL_HASH,

      log: (acao, detalhe) =>
        set((s) => ({ atividade: [{ id: uid('a'), data: agoraISO(), acao, detalhe }, ...s.atividade].slice(0, 500) })),

      guardarLinha: (t, linha, descricao) => {
        const lista = get()[t] as { id: string }[]
        const existe = lista.some((x) => x.id === (linha as { id: string }).id)
        set({ [t]: existe ? lista.map((x) => (x.id === (linha as { id: string }).id ? linha : x)) : [...lista, linha] } as Partial<Estado>)
        get().log(existe ? 'Dados mestre alterados' : 'Dados mestre: nova linha', descricao)
      },
      apagarLinha: (t, id, descricao) => {
        set({ [t]: (get()[t] as { id: string }[]).filter((x) => x.id !== id) } as Partial<Estado>)
        get().log('Dados mestre: linha apagada', descricao)
      },

      adicionarEncomenda: (e) => set((s) => ({ encomendas: [e, ...s.encomendas.filter((x) => x.id !== e.id)] })),
      apagarEncomenda: (id) => set((s) => ({ encomendas: s.encomendas.filter((x) => x.id !== id) })),
      atualizarEncomenda: (id, fn) => set((s) => ({ encomendas: s.encomendas.map((e) => (e.id === id ? fn(e) : e)) })),
      atualizarModelo: (encId, modId, fn) =>
        set((s) => ({
          encomendas: s.encomendas.map((e) =>
            e.id !== encId ? e : { ...e, modelos: e.modelos.map((m) => (m.id === modId ? fn(m) : m)) },
          ),
        })),

      guardarPedido: (p) => set((s) => ({ pedidos: s.pedidos.some((x) => x.id === p.id) ? s.pedidos.map((x) => (x.id === p.id ? p : x)) : [p, ...s.pedidos] })),
      adicionarHistorico: (h) => set((s) => ({ historico: [h, ...s.historico.filter((x) => x.id !== h.id)] })),

      entrar: async (utilizador, pass) => {
        const ok = utilizador.trim().toLowerCase() === 'admin' && (await sha256(pass)) === get().passHash
        if (ok) { set({ sessao: 'admin' }); get().log('Início de sessão', 'admin') }
        else get().log('Tentativa de acesso falhada', utilizador || '(vazio)')
        return ok
      },
      sair: () => { get().log('Fim de sessão', 'admin'); set({ sessao: null }) },
      mudarPass: async (atual, nova) => {
        if ((await sha256(atual)) !== get().passHash) return false
        set({ passHash: await sha256(nova) })
        get().log('Palavra-passe alterada', 'admin')
        return true
      },
      repor: () => { set(dadosIniciais()); get().log('Dados repostos', 'Dados de exemplo repostos') },
    }),
    {
      name: 'pc-fichas-v1', version: 2,
      // novos dados de exemplo: repõe os dados, mantém a sessão e a palavra-passe
      migrate: (antigo) => {
        const a = antigo as Partial<Estado>
        return { ...dadosIniciais(), sessao: a.sessao ?? null, passHash: a.passHash ?? PASS_INICIAL_HASH, nomeUtilizador: a.nomeUtilizador ?? 'Admin' } as Estado
      },
    },
  ),
)
