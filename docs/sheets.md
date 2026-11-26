# Exportação para o Google Sheets

- **Função:** `supabase/functions/exportar-sheets/index.ts` (ficheiro único).
- **O que cria:** uma folha de cálculo por exportação, na pasta indicada do Google Drive da empresa,
  com as mesmas folhas do livro Excel (uma por variante: corte e confeção + embalamento; packing list) e os totais
  em fórmula. Cabeçalhos das tabelas a azul, títulos de secção a vermelho, larguras das colunas.
- **Na aplicação:** Encomenda → **Google Sheets** (todas as fichas aprovadas + packing list) ou, na ficha,
  **Exportar → Google Sheets**. O link da última exportação fica guardado na encomenda.
- Usa a **mesma conta de serviço** da leitura com IA (`GOOGLE_SERVICE_ACCOUNT_JSON`). Não depende da quota do Claude.

## Onde ficam os ficheiros (importante)

As contas de serviço do Google não têm espaço próprio no Drive. Há duas formas de resolver:

| Opção | Requisito | Dono dos ficheiros |
|---|---|---|
| **A. Drive partilhado** (recomendado) | Google Workspace com Drives partilhados | O Drive partilhado da empresa |
| **B. Delegação em todo o domínio** | Google Workspace + administrador | O utilizador indicado em `GOOGLE_IMPERSONATE_EMAIL` |

Com uma conta Gmail pessoal (`@gmail.com`) nenhuma das duas é possível.

## Configuração (opção A)

1. **Google Cloud → APIs e serviços → Ativar APIs**: ativar **Google Sheets API** e **Google Drive API** no projeto `pereiracruz-fichas`.
2. **Google Drive → Drives partilhados → Novo** (ex.: «Fichas de produção»).
3. Nesse Drive partilhado: **Gerir membros** → adicionar o email da conta de serviço
   (`fichas-ia@pereiracruz-fichas.iam.gserviceaccount.com`, ou o `client_email` do ficheiro JSON) como **Gestor de conteúdos**.
4. Abrir o Drive partilhado (ou uma pasta dentro dele) e copiar o **id** do endereço:
   `https://drive.google.com/drive/folders/`**`ESTE_É_O_ID`**
5. **Supabase → Edge Functions → Secrets**: `GOOGLE_DRIVE_FOLDER_ID` = esse id.
6. **Supabase → Edge Functions → Deploy a new function → Via Editor**: nome `exportar-sheets`, colar
   `supabase/functions/exportar-sheets/index.ts`, **Deploy**, «Verify JWT» ligado.

## Opção B (delegação)

1. Google Cloud → conta de serviço `fichas-ia` → **Detalhes** → copiar o **ID de cliente** (número).
2. **admin.google.com → Segurança → Controlo de acesso e dados → Controlos de API → Delegação em todo o domínio →
   Adicionar novo**: ID de cliente + âmbitos `https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/spreadsheets`.
3. Segredo `GOOGLE_IMPERSONATE_EMAIL` = email da empresa em nome de quem se criam os ficheiros;
   `GOOGLE_DRIVE_FOLDER_ID` = pasta do Drive desse utilizador.

## Problemas comuns

| Mensagem | Causa |
|---|---|
| «A conta de serviço não tem espaço próprio no Drive…» | A pasta está num «O meu Drive»: usar um Drive partilhado (opção A) ou a delegação (B) |
| «Pasta do Drive não encontrada…» | Id errado, ou a conta de serviço não é membro do Drive partilhado |
| «Ative a Google Sheets API e a Google Drive API…» | Passo 1 |
| «Falta o segredo GOOGLE_DRIVE_FOLDER_ID» | Passo 5 |
