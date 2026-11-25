# Servidor (Supabase, UE)

## Arquitetura

- **Supabase**, região **Central EU (Frankfurt)**: base de dados PostgreSQL, autenticação, ficheiros e funções.
- **Aplicação** (React) alojada à parte (Netlify ou Cloudflare Pages), a falar com o Supabase pela chave pública.
- A segurança está na base de dados (Row Level Security): sem sessão iniciada não se lê nem escreve nada.

## Tabelas (`supabase/migrations/20261125000000_inicial.sql`)

| Tabela | Conteúdo |
|---|---|
| `perfis` | Um por utilizador: nome, papel (administrador / equipa / validador / consulta), ativo |
| `documentos` | Encomendas (com as fichas), pedidos, histórico de preços e dados mestre, em JSON por (coleção, id); guarda quem e quando alterou |
| `atividade` | Registo de atividade: só se acrescenta, não se altera nem apaga |
| bucket `documentos` | Ficheiros privados: tech packs, encomendas, fichas exportadas |

## Passos no painel do Supabase (uma vez)

1. **Projeto** criado na região **Central EU (Frankfurt)** (Project Settings → General → Region).
2. **SQL Editor → New query** → colar `supabase/migrations/20261125000000_inicial.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: desligar **«Allow new users to sign up»** (só a Pereira & Cruz cria contas).
4. **Authentication → Users → Add user → Create new user**: email e palavra-passe do Admin, com «Auto Confirm User».
5. **Project Settings → API** (ou «Data API» / «API Keys»): copiar
   - **Project URL** (`https://xxxx.supabase.co`)
   - **chave pública** (`anon` / `publishable`).
   A chave **secreta** (`service_role` / `secret`) **nunca** se partilha nem vai para a aplicação.

## Configuração da aplicação

Ficheiro `.env.local` (não vai para o GitHub):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=chave-publica
```
