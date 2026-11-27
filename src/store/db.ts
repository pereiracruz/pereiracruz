import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { modoServidor, supabase } from '../lib/supabase'
import type {
  AcessorioCliente, Atividade, ClienteCfg, Destinatario, Encomenda, Equivalencia, Escala, Fornecedor, Lavagem,
  Modelo, Pedido, PrecoHistorico, PrecoLavagem, PrecoRef, PrecoTingimento, Tecido,
} from '../types'
import * as seed from '../data/seed'
import { agoraISO, uid } from '../lib/format'
import { mesmoCliente } from '../lib/of'

export interface Tabelas {
  fornecedores: Fornecedor[]
  tecidos: Tecido[]
  equivalencias: Equivalencia[]
  lavagens: Lavagem[]
  acessorios: AcessorioCliente[]
  escalas: Escala[]
  destinatarios: Destinatario[]
  precosRef: PrecoRef[]
  precosTingimento: PrecoTingimento[]
  precosLavagem: PrecoLavagem[]
  clientes: ClienteCfg[]
}
export type NomeTabela = keyof Tabelas

/** Coleções guardadas na tabela «documentos» do servidor. */
export const COLECOES = ['encomendas', 'pedidos', 'historico', 'fornecedores', 'tecidos', 'equivalencias', 'lavagens', 'acessorios', 'escalas', 'destinatarios', 'precosRef', 'precosTingimento', 'precosLavagem', 'clientes'] as const
export type Colecao = (typeof COLECOES)[number]

interface Estado extends Tabelas {
  encomendas: Encomenda[]
  pedidos: Pedido[]
  historico: PrecoHistorico[]
  atividade: Atividade[]
  // auth (local até haver servidor)
  sessao: string | null
  nomeUtilizador: string
  passHash: string
  // servidor
  aCarregar: boolean
  aGuardar: number
  erroServidor: string | null

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

/**
 * Junta os clientes de origem aos existentes, pelo nome (o mesmo cliente pode ter sido criado à mão com outro id):
 * os que faltam entram; nos que já existem só se preenchem os campos de origem que ainda não estão definidos.
 */
export function juntarClientes(atuais: ClienteCfg[], origem: ClienteCfg[]): ClienteCfg[] {
  const out = atuais.map((c) => {
    const o = origem.find((x) => x.id === c.id || mesmoCliente(x.nome, c.nome))
    if (!o) return c
    const novos = Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id' && k !== 'nome' && (c as unknown as Record<string, unknown>)[k] === undefined))
    return Object.keys(novos).length ? { ...c, ...novos } : c
  })
  for (const o of origem) if (!out.some((c) => c.id === o.id || mesmoCliente(c.nome, o.nome))) out.push(o)
  return out
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Palavra-passe inicial (só no modo local, até haver servidor): "pereira2026" */
const PASS_INICIAL_HASH = 'fbd70a4c75b221f2bb44dc036b5ae116e487343847b00ae6df0b5496a7a781d9'

export const dadosIniciais = () => ({
  fornecedores: seed.fornecedores,
  tecidos: seed.tecidos,
  equivalencias: seed.equivalencias,
  lavagens: seed.lavagens,
  acessorios: seed.acessoriosCliente,
  escalas: seed.escalas,
  destinatarios: seed.destinatarios,
  precosRef: seed.precosRef,
  precosTingimento: seed.precosTingimento,
  precosLavagem: seed.precosLavagem,
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
      aCarregar: false,
      aGuardar: 0,
      erroServidor: null,

      log: (acao, detalhe) => {
        set((s) => ({ atividade: [{ id: uid('a'), data: agoraISO(), acao, detalhe }, ...s.atividade].slice(0, 500) }))
        if (supabase && get().sessao) void supabase.from('atividade').insert({ acao, detalhe }).then(({ error }) => error && console.error('atividade', error))
      },

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

      adicionarEncomenda: (e) => set((s) => {
        // nº interno sequencial (E26-082-…) se ainda não tiver
        const proximo = Math.max(0, ...s.encomendas.map((x) => x.numeroInterno ?? 0)) + 1
        const nova = e.numeroInterno != null ? e : { ...e, numeroInterno: proximo }
        return { encomendas: [nova, ...s.encomendas.filter((x) => x.id !== e.id)] }
      }),
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
        if (supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({ email: utilizador.trim(), password: pass })
          if (error || !data.session) return false
          void supabase.from('atividade').insert({ acao: 'Início de sessão', detalhe: data.user.email ?? '' })
          return true // os dados carregam em store/servidor.ts
        }
        const ok = utilizador.trim().toLowerCase() === 'admin' && (await sha256(pass)) === get().passHash
        if (ok) { set({ sessao: 'admin' }); get().log('Início de sessão', 'admin') }
        else get().log('Tentativa de acesso falhada', utilizador || '(vazio)')
        return ok
      },
      sair: () => {
        get().log('Fim de sessão', get().sessao ?? '')
        if (supabase) void supabase.auth.signOut()
        set({ sessao: null })
      },
      mudarPass: async (atual, nova) => {
        if (supabase) {
          const email = get().sessao ?? ''
          const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: atual })
          if (e1) return false
          const { error } = await supabase.auth.updateUser({ password: nova })
          if (error) return false
          get().log('Palavra-passe alterada', email)
          return true
        }
        if ((await sha256(atual)) !== get().passHash) return false
        set({ passHash: await sha256(nova) })
        get().log('Palavra-passe alterada', 'admin')
        return true
      },
      repor: () => { if (modoServidor) return; set(dadosIniciais()); get().log('Dados repostos', 'Dados de exemplo repostos') },
    }),
    {
      name: 'pc-fichas-v1', version: 13,
      // com servidor, os dados vêm da base de dados: nada fica guardado no browser
      storage: createJSONStorage(() => (modoServidor ? { getItem: () => null, setItem: () => {}, removeItem: () => {} } : localStorage)),
      migrate: (antigo, versao) => {
        const a = antigo as Estado
        // v1 → v2: novos dados de exemplo; repõe os dados, mantém a sessão e a palavra-passe
        if (versao < 2) return { ...dadosIniciais(), sessao: a.sessao ?? null, passHash: a.passHash ?? PASS_INICIAL_HASH, nomeUtilizador: a.nomeUtilizador ?? 'Admin' } as Estado
        // v2 → v3: acrescenta dados mestre novos (Sidogras) sem apagar o que existe
        const juntar = <T extends { id: string }>(atual: T[], novos: T[]) => [...atual, ...novos.filter((n) => !atual.some((x) => x.id === n.id))]
        let b: Estado = versao < 3 ? { ...a, fornecedores: juntar(a.fornecedores, seed.fornecedores), tecidos: juntar(a.tecidos, seed.tecidos) } : a
        // v3 → v4: nº interno das encomendas e linha sem consumo (só cor e fornecedor)
        if (versao < 4) {
          let n = 80
          b = { ...b, encomendas: [...b.encomendas].reverse().map((e) => ({
            ...e, numeroInterno: e.numeroInterno ?? (e.id === 'dr-collectors-ss27' ? 70 : e.id.startsWith('longratex') ? 81 : ++n + 1),
            modelos: e.modelos.map((m) => ({ ...m, materiais: m.materiais.map((l) => (/^linha$/i.test(l.ref.trim()) ? { ...l, semConsumo: true, consumo: null } : l)) })),
          })).reverse() }
        }
        // v4 → v5: ficha Longratex 1033350, Botifechos/Staples, Sarja PPT, tingimentos Longratex
        if (versao < 5) {
          b = { ...b, fornecedores: juntar(b.fornecedores, seed.fornecedores), tecidos: juntar(b.tecidos, seed.tecidos), lavagens: juntar(b.lavagens, seed.lavagens),
            encomendas: b.encomendas.map((e) => (!e.id.startsWith('longratex') ? e : { ...e, modelos: e.modelos.map((m) => (m.refCliente === 'PAP/CAL1033350' && m.estado === 'sem-ficha' ? seed.fichaLongratex1033350(m) : m)) })) }
        }
        // v5 → v6: Sarja PPT da FJ Magalhães, etiqueta de marca e hangtag da cliente, 40 peças por caixa (criança)
        if (versao < 6) {
          const ficha = seed.fichaLongratex1033350
          b = { ...b, tecidos: b.tecidos.map((t) => (t.id === 't14' && t.fornecedor === 'A confirmar' ? { ...t, fornecedor: 'FJ Magalhães' } : t)),
            encomendas: b.encomendas.map((e) => (!e.id.startsWith('longratex') ? e : { ...e, modelos: e.modelos.map((m) => {
              if (m.refCliente === 'PAP/CAL1033350' && m.estado === 'rascunho' && m.materiais.some((l) => l.fornecedor === 'A confirmar')) return ficha({ ...m, estado: 'sem-ficha' })
              return m.caixaMax === 20 ? { ...m, caixaMax: 40 } : m
            }) })) }
        }
        // v6 → v7: acessórios da Longratex (etiqueta de marca e hangtag da cliente)
        if (versao < 7) b = { ...b, acessorios: juntar(b.acessorios, seed.acessoriosCliente) }
        // v7 → v8: tabela de preços das fichas de custo da Longratex
        if (versao < 8) b = { ...b, precosRef: juntar(b.precosRef, seed.precosRef) }
        // v8 → v9: a agente da Imprevu já não existe (SS27 e FW27)
        // v9 → v10: tabelas de preços da Clothius
        if (versao < 10) b = { ...b, precosTingimento: juntar(b.precosTingimento ?? [], seed.precosTingimento), precosLavagem: juntar(b.precosLavagem ?? [], seed.precosLavagem) }
        // v10 → v11: botão de massa do chino na tabela de preços
        if (versao < 11) b = { ...b, precosRef: juntar(b.precosRef, seed.precosRef) }
        // v11 → v12: o embalamento é tratado pelo Paulo e pela Marta
        if (versao < 12) b = { ...b, destinatarios: b.destinatarios.map((d) => (d.id === 'd6' && d.nome === 'Embalamento' ? { ...d, nome: 'Paulo e Marta', contacto: 'Embalamento' } : d)) }
        // v12 → v13: Simão e Olgando e GBTX trabalham com OF (sem tech pack) e dão os acessórios
        if (versao < 13) b = { ...b, clientes: juntarClientes(b.clientes, seed.clientes) }
        if (versao < 9) b = { ...b, clientes: b.clientes.map((c) => (c.id === 'c1' && c.comissao === 7 ? { ...c, comissao: 0 } : c)) }
        return b
      },
    },
  ),
)
