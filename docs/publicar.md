# Pôr a aplicação online (Netlify)

A configuração está em `netlify.toml` (construção, rotas e cabeçalhos de segurança).
Cada envio para o ramo `main` no GitHub volta a publicar a aplicação automaticamente.

## Passos (uma vez)

1. Entrar em **app.netlify.com** com a conta GitHub da empresa (**Sign up with GitHub**).
2. **Add new site → Import an existing project → GitHub** → autorizar o Netlify → escolher **pereiracruz/pereiracruz**.
3. No ecrã de configuração deixar o que vem preenchido (vem do `netlify.toml`):
   - Branch: `main` · Build command: `npm run build` · Publish directory: `dist`
4. **Variáveis: não é preciso fazer nada.** A configuração pública do Supabase está no ficheiro `.env.production`
   do repositório e o Netlify usa-a ao construir. (Se um dia quiser mudar de projeto Supabase, muda-se esse ficheiro.)
5. **Deploy**. Ao fim de 1–2 minutos fica com um endereço do tipo `https://nome-aleatorio.netlify.app`
   (pode mudar-se em **Site configuration → Change site name**, ex.: `pereiracruz-fichas.netlify.app`).

## Depois de publicado

- No **Supabase → Authentication → URL Configuration**, pôr o endereço do Netlify em **Site URL**
  (serve para os emails de recuperação de palavra-passe).
- Entrar com o email e a palavra-passe criados no Supabase. Na primeira entrada a base de dados recebe os dados iniciais.
- **Endereço próprio** (opcional): Netlify → Domain management → `fichas.pereirasproject.com`, e um registo CNAME no
  fornecedor do domínio.

## Problemas comuns

| Sintoma | Causa |
|---|---|
| Ecrã de entrada pede «Utilizador» (e não «Email») | A versão publicada é anterior ao `.env.production` → Deploys → Trigger deploy → Deploy site |
| «Sem permissões nas tabelas» | Falta correr `supabase/migrations/20261125000100_permissoes.sql` |
| «Email ou palavra-passe incorretos» | Utilizador não criado/confirmado no Supabase (Authentication → Users) |
