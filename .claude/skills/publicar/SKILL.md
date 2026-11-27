---
name: publicar
description: Commits, ramos, pedidos de alteração (PR), CI e publicação no Netlify deste repositório, incluindo o trabalho em paralelo com outras sessões do Claude. Usar ao fazer commit, push, abrir/atualizar/juntar um PR ou quando o utilizador pergunta se o site está atualizado.
---

# Publicar

## Ramos e commits
- Um ramo por mudança, a partir do `main` atual. Mensagens em PT-PT: primeira linha curta («Produção, fase 1: …»), depois
  lista do que muda. Terminar com as linhas de atribuição que o ambiente indicar (Co-Authored-By, Claude-Session).
- Antes do commit: `npm test`, `npm run build`, `npx eslint <ficheiros>`; `git status` sem ficheiros de clientes, cópias
  de segurança, `test-results/`, `undefined/` ou `.env*` (exceto `.env.production`, que só tem chaves públicas).
- Nunca `--force` no `main`. Reescrever histórico só com autorização explícita.

## Outras sessões
- Outras sessões do Claude enviam PRs para o mesmo repositório. Antes de enviar: `git fetch origin main`;
  se andou, `git merge origin/main` (ou rebase no próprio ramo), correr os testes outra vez e só depois `git push`.
- Se uma alteração de outra sessão contradiz o que fizeste (ex.: nomes na interface), alinhar e avisar o utilizador.

## Pedido de alteração (PR)
- Criar pelo REST: `gh api repos/pereiracruz/pereiracruz/pulls -f title=… -f head=<ramo> -f base=main -F body=@ficheiro.md`
  (o GraphQL do `gh pr create` está bloqueado). Corpo: o que muda, testes, como voltar atrás; terminar com a linha
  «🤖 Generated with [Claude Code](https://claude.com/claude-code)» e o link da sessão.
- Acompanhar o CI («testes»): `gh api repos/pereiracruz/pereiracruz/commits/<sha>/check-runs`. Vermelho → encontrar a causa e corrigir.
- **Juntar só quando o utilizador pede**: `gh api -X PUT repos/pereiracruz/pereiracruz/pulls/<n>/merge -f merge_method=merge`.
  Depois atualizar o `main` local e deixar de acompanhar o PR.

## Netlify
- Cada envio para o `main` publica https://pereiracruz.netlify.app (1–2 min). Cada PR tem pré-visualização
  `deploy-preview-<n>--pereirasproject.netlify.app` — **usa o Supabase real** (avisar o utilizador).
- Daqui não se abre o site (rede bloqueia `*.netlify.app`); o Netlify não reporta ao GitHub. Para confirmar, pedir ao
  utilizador para ver no site ou em app.netlify.com → Deploys.
- Mudanças que precisam de passos manuais (SQL, segredos, publicar função) vão escritas no PR e na resposta, com os passos exatos.
