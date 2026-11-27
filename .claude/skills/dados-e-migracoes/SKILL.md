---
name: dados-e-migracoes
description: Como acrescentar ou mudar coleções, dados mestre, seeds e migrações (localStorage, Supabase documentos, SQL) sem perder dados do utilizador. Usar ao mexer em src/types.ts, src/store/db.ts, src/store/servidor.ts, src/data/seed.ts ou supabase/migrations.
---

# Dados e migrações

## Como os dados vivem
- **Modo local** (sem `VITE_SUPABASE_*`): `useDb` persiste em `localStorage` (`pc-fichas-v1`), com `version` e `migrate`.
- **Modo servidor**: tabela `documentos (colecao, id, dados jsonb)` no Supabase; `src/store/servidor.ts` carrega tudo,
  grava cada alteração (upsert com espera) e apaga o que sai do estado. Tempo real + `src/lib/juntar.ts` juntam
  alterações de dois aparelhos (campo a campo; listas por `id`/`chave`/`etapa`).
- Cada registo tem `id` estável. Listas dentro de documentos devem ter `id` para a junção funcionar.

## Checklist — coleção nova
1. Tipo em `src/types.ts`.
2. `src/store/db.ts`: em `COLECOES`; em `Tabelas` se for dado mestre editável em Dados mestre; no `interface Estado`
   se não for; em `dadosIniciais()`; ações próprias se precisar.
3. Subir `version` do persist e acrescentar passo `if (versao < N) b = { ...b, nova: juntar(b.nova ?? [], seed.nova) }`.
4. `src/store/servidor.ts`: subir `VERSAO_DADOS`; se for dado mestre, pôr em `MESTRE` (entra no servidor só o que falta).
5. `src/pages/Copias.tsx`: nome legível em `NOMES` (o TypeScript obriga). Cópias antigas sem a coleção ficam como estão.
6. Dados mestre: separador em `src/pages/DadosMestre.tsx` (`SEPARADORES`, `defs`).
7. Testes: migração a partir de dados antigos (simular `version` anterior no `localStorage`) quando houver transformação.

## Corrigir um valor que já existe
- Local: passo no `migrate` com condição «só se ainda tiver o valor antigo» (ex.: `c.id === 'c1' && c.comissao === 7`).
- Servidor: entrada em `CORRECOES` (`{ colecao, id, antes, depois }`) + subir `VERSAO_DADOS`. Nunca sobrescrever o que o utilizador mudou.

## SQL no Supabase
- Ficheiro novo `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`, idempotente (`if exists`, `create or replace`, `drop policy if exists`).
- É o utilizador quem corre (SQL Editor → New query → Run). Dar-lhe o SQL e os passos; documentar em `docs/servidor.md`.
- O código tem de detetar a falta da migração e avisar (ex.: mensagem com o nome do ficheiro), sem bloquear a entrada.
- RLS: tudo exige `utilizador_ativo()`; nunca abrir a `anon`. `atividade` só se acrescenta.

## Seeds (`src/data/seed.ts`)
- Dados mestre reais (clientes, tecidos, tabelas Clothius, estados) podem estar no seed; documentos de clientes não.
- Dados de exemplo são identificados em `src/lib/exemplo.ts` (botão «Limpar dados de exemplo»): ids novos de exemplo vão para lá.
