# Leitura de documentos com IA (UE)

- **Modelo:** Claude Opus 5.5 (`claude-opus-5-5`), esforço `high`, saída estruturada (JSON schema).
- **Onde corre:** Google Cloud **Vertex AI**, endpoint multi-região **`eu`** → o processamento fica em regiões da UE.
  (A API direta da Anthropic só permite fixar EUA ou global; por isso usa-se o Vertex AI.)
- **Função:** `supabase/functions/ler-documento/index.ts` (Supabase Edge Function, ficheiro único).
- **Fluxo:** a aplicação guarda o ficheiro no bucket privado `documentos` → chama a função com a sessão do utilizador →
  a função envia o PDF/imagem ao Claude → devolve JSON → a aplicação confere com os totais do documento e mostra a revisão.
- **Encomendas em Excel** continuam a ser lidas sem IA (`src/lib/lerEncomendaExcel.ts`).
- **Tech packs em PowerPoint:** exportar para PDF antes de carregar.
- **Custo estimado:** ~0,15–0,40 € por documento (preço do Vertex AI, +10 % do endpoint UE).

## Configuração (uma vez)

### 1. Google Cloud (conta Google da empresa)

1. Entrar em **console.cloud.google.com** com a conta Google da empresa.
2. **Criar projeto** (ex.: `pereiracruz-fichas`) e associar uma **conta de faturação** (Billing).
3. **APIs e serviços → Ativar APIs** → procurar **Vertex AI API** (pode aparecer como *Agent Platform*) → **Ativar**.
4. **Model Garden** → procurar **Claude Opus 5.5** → **Ativar** (aceitar os termos da Anthropic).
   Confirmar que está disponível na localização **eu** (multi-região).
5. **IAM e administração → Contas de serviço → Criar conta de serviço**: nome `fichas-ia`, papel **Vertex AI User**
   (`roles/aiplatform.user`).
6. Na conta de serviço criada: **Chaves → Adicionar chave → Criar nova chave → JSON**. Descarrega um ficheiro `.json`.
   **Este ficheiro é secreto:** não se envia por email nem por chat e não vai para o GitHub.

### 2. Supabase

1. **Edge Functions → Secrets → Add new secret**:
   - Nome `GOOGLE_SERVICE_ACCOUNT_JSON`, valor = **todo o conteúdo** do ficheiro `.json` do passo 1.6.
2. **Edge Functions → Deploy a new function → Via Editor**:
   - Nome: `ler-documento`
   - Apagar o código de exemplo e colar o conteúdo de `supabase/functions/ler-documento/index.ts`.
   - **Deploy**. Deixar ligado «Verify JWT» (só utilizadores com sessão podem chamar a função).
3. Opcional: segredos `VERTEX_REGION` (por omissão `eu`) e `CLAUDE_MODEL` (por omissão `claude-opus-5-5`).

## Na aplicação

- **Nova encomenda:** carregar o PDF da encomenda e/ou o Excel e os tech packs; cada PDF marca-se como
  «Encomenda» ou «Tech pack». «Ler encomenda» → a IA lê (30–90 s por documento) → ligação encomenda ↔ tech pack
  (automática pelo número da referência) → revisão com as verificações → **Criar encomenda**.
- **Encomenda → Gerar ficha** nos modelos com tech pack lido: gera a ficha por aprovar com as regras
  (tecido da tabela ou decisão registada, acessórios do cliente, bordados, notas fixas, valores duvidosos assinalados).

## Problemas comuns

| Mensagem | Causa |
|---|---|
| «Falta o segredo GOOGLE_SERVICE_ACCOUNT_JSON» | Passo 2.1 |
| «Failed to send a request to the Edge Function» / 404 | Função não publicada com o nome `ler-documento` (passo 2.2) |
| Erro 403 / permission denied do Google | Conta de serviço sem o papel Vertex AI User, ou API não ativada (passos 1.3 e 1.5) |
| Erro 404 do modelo | Claude Opus 5.5 não ativado no Model Garden ou não disponível em `eu` (passo 1.4) |
| «Não consegui abrir o ficheiro guardado» | Falta o script de permissões do Supabase (`20261125000100_permissoes.sql`) |
