# Exportação para o Google Sheets

- **Onde ficam:** no Google Drive de quem autoriza (ex.: `pereiracruz.lda@gmail.com`), na pasta
  **«Fichas de produção · Pereira & Cruz»**, criada pela aplicação na primeira exportação.
- **Como:** no browser, com «Iniciar sessão com Google» (Google Identity Services), âmbito **`drive.file`**:
  a aplicação só vê e altera os ficheiros que ela própria cria. Código: `src/lib/sheets.ts`.
- **O que cria:** as mesmas folhas do livro Excel (corte e confeção + embalamento por variante, packing list),
  totais em fórmula, cabeçalhos a azul, títulos de secção a vermelho, larguras das colunas.
- **Na aplicação:** Encomenda → **Google Sheets** (fichas aprovadas + packing list) ou ficha → **Exportar → Google Sheets**.
  O link da última exportação fica na encomenda.
- Não depende do Supabase nem da quota do Claude.

## Configuração (uma vez, no projeto Google Cloud `pereiracruz-fichas`)

1. **APIs e serviços → Ativar APIs**: **Google Sheets API** e **Google Drive API**.
2. **APIs e serviços → Ecrã de consentimento OAuth** (ou *Google Auth Platform → Branding*):
   - Tipo de utilizador: **Externo**.
   - Nome da aplicação: `Fichas Pereira & Cruz`; email de apoio: `pereiracruz.lda@gmail.com`.
   - Domínio autorizado: `netlify.app`.
   - Âmbitos (*Data access*): acrescentar `.../auth/drive.file`.
   - **Utilizadores de teste** (*Audience*): acrescentar `pereiracruz.lda@gmail.com` (e quem mais for exportar).
3. **APIs e serviços → Credenciais → Criar credenciais → ID de cliente OAuth** (*Clients → Create client*):
   - Tipo: **Aplicação Web**; nome: `Fichas Pereira & Cruz`.
   - **Origens JavaScript autorizadas:** `https://pereiracruz.netlify.app` (e `http://localhost:5173` para desenvolvimento).
   - Criar e copiar o **ID de cliente** (`….apps.googleusercontent.com`). O ID de cliente é público;
     o «segredo do cliente» não é preciso e não se partilha.
4. Pôr o ID de cliente em `.env.production` como `VITE_GOOGLE_CLIENT_ID=…` e publicar.

Enquanto a aplicação estiver em modo «Teste» no Google, só os utilizadores de teste podem autorizar e o Google
mostra um aviso «A Google não validou esta app» → **Continuar**. Para uso interno é suficiente.

## Problemas comuns

| Mensagem | Causa |
|---|---|
| «Error 400: redirect_uri_mismatch» / «origin_mismatch» | Falta a origem `https://pereiracruz.netlify.app` no passo 3 |
| «Acesso bloqueado: a app não concluiu a verificação» | A conta não está em «Utilizadores de teste» (passo 2) |
| «O browser bloqueou a janela do Google» | Autorizar janelas pop-up para pereiracruz.netlify.app |
| «Ative a Google Sheets API e a Google Drive API…» | Passo 1 |
