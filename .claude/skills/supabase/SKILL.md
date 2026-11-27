---
name: supabase
description: Trabalhar com o Supabase deste projeto — sincronização de documentos, RLS, migrações SQL, Storage, Edge Functions (ler-documento, toconline, email-encomendas), segredos e como pedir ao utilizador para publicar. Usar ao mexer em src/store/servidor.ts, src/lib/supabase.ts, supabase/migrations ou supabase/functions.
---

# Supabase (Frankfurt, UE)

## Peças
- Projeto `gupydoryatnbfakegbzo` (Central EU). Chave **pública** (`sb_publishable_…`) em `.env.production` — pode estar no repositório.
  A chave **secreta** nunca: nem no código, nem no chat, nem em variáveis `VITE_*`.
- Tabelas: `perfis` (papel, ativo), `documentos` (colecao, id, dados jsonb, atualizado_em/por), `atividade` (só insert),
  cópias automáticas semanais (pg_cron). Bucket privado `documentos` (PDFs, Excel, imagens de assinaturas).
- RLS: tudo exige `utilizador_ativo()`; `anon` sem permissões. Ver `supabase/migrations/`.
- Cliente no browser: `src/lib/supabase.ts` (`supabase` é `null` em modo local — tratar sempre esse caso).

## Edge Functions (Deno, um ficheiro `index.ts` cada)
- `ler-documento`: IA (Claude na Vertex AI, região `eu`) para encomendas, tech packs, OF, extratos, faturas, produção, picagens.
  Esquemas JSON de saída; valores com confiança. Quota da Google pode faltar (erro 429): a app tem de avisar, não partir.
- `toconline`: OAuth por empresa (`TOC_PP_*`, `TOC_PC_*`), leitura (`testar`, `consultar` com lista branca de recursos)
  e guias (`criar_guia`, `finalizar_guia`, `enviar_email`, `apagar_rascunho`). Ver skill `documentos-fiscais`.
- `email-encomendas`: lê caixas de correio (IMAP), classifica pedidos/faturas/encomendas, responde (SMTP).
- `ler-email`: lê um email e anexos com IA pelo OpenRouter (`OPENROUTER_*`), structured outputs; ver agente `especialista-openrouter`.
- Padrão obrigatório: CORS, só `POST`, **verificar o JWT dentro da função** (`supabase.auth.getUser(token)`) e o perfil ativo,
  erros em PT-PT com a causa provável, nunca devolver segredos. Chamar do browser com `supabase.functions.invoke`.

## Publicar (é o utilizador que faz)
- Função: Supabase → Edge Functions → função → editar/colar o `index.ts` → Deploy. Dar o nome exato e o ficheiro.
- Segredos: Edge Functions → Secrets (nomes exatos; valores só o utilizador cola). Nunca pedir valores no chat.
- SQL: SQL Editor → New query → colar o ficheiro de `supabase/migrations/` → Run. Esperar «Success».
- Este ambiente não tem a chave secreta: não é possível testar funções com sessão daqui; testar a lógica em unidade e
  pedir ao utilizador para experimentar no site (ou criar um painel de teste só de leitura).

## Cuidados
- Plano gratuito: pausa ao fim de 7 dias sem uso; limites de recursos nas funções (tratar em lotes pequenos e repetir).
- A pré-visualização do Netlify usa este mesmo projeto: dados gravados lá são reais.
