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
   Depois, numa nova query, `supabase/migrations/20261125000100_permissoes.sql` → **Run**
   (os projetos novos não dão permissões automáticas às tabelas).
   Depois, `supabase/migrations/20261126000000_colecoes.sql` (aceita as coleções novas, ex.: tabelas da Clothius).
   Depois, `supabase/migrations/20261127000000_tempo_real.sql` (alterações ao mesmo tempo no telemóvel e no computador).
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

## Como a aplicação usa o servidor

- Sem `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: **modo local** (dados no browser, utilizador `admin`).
- Com as variáveis: **modo servidor** (`src/store/servidor.ts`):
  - entrada com **email e palavra-passe** (Supabase Auth); nada fica guardado no browser além da sessão;
  - ao entrar carrega todos os documentos; se a base de dados estiver vazia, carrega os dados iniciais
    (clientes, dados mestre, encomendas de exemplo);
  - cada alteração é guardada automaticamente (indicador «A guardar… / Guardado» na barra lateral);
  - o registo de atividade fica na tabela `atividade` (não se altera nem apaga);
  - **vários aparelhos ao mesmo tempo** (telemóvel e computador):
    - o que se grava num aparelho aparece logo nos outros, sem recarregar (Supabase Realtime); ao voltar à aplicação
      (telemóvel acordado, rede de volta) a aplicação confere o que mudou entretanto;
    - cada documento tem uma **versão** que sobe a cada gravação; só se grava sobre a versão que o aparelho leu.
      Se a encomenda mudou entretanto noutro aparelho, as duas alterações **juntam-se** (ex.: «Recebido» marcado no
      telemóvel + prazo mudado no computador ficam os dois). Se o mesmo campo foi mudado nos dois, fica o do último
      aparelho e aparece um aviso;
    - sem o script `20261127000000_tempo_real.sql` a aplicação funciona como antes (a última gravação ganha) e avisa ao entrar;
  - «Repor exemplo» não existe no modo servidor.

Projeto: `https://gupydoryatnbfakegbzo.supabase.co` · região Central EU (Frankfurt), confirmada.

## Cópias de segurança

O plano gratuito do Supabase **não faz cópias automáticas**. Na aplicação: **Cópias de segurança**
(barra lateral, com um ponto âmbar quando passou mais de uma semana desde a última).

- **Descarregar cópia de segurança:** ficheiro JSON com encomendas e fichas, pedidos, histórico, dados mestre e
  registo de atividade. Guardar fora do computador (ex.: Google Drive). Os PDFs/Excel originais do bucket não entram.
- **Repor a partir de uma cópia:** valida o ficheiro, mostra por tipo de dados o que é novo, alterado ou retirado,
  e só repõe depois de escrever «REPOR». O registo de atividade não é apagado; a reposição fica registada.
- Alternativa: plano Pro do Supabase (cópias diárias automáticas).
