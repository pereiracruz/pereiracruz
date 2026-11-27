---
name: funcionalidade-nova
description: Fluxo completo para criar ou alterar uma funcionalidade nesta aplicação (ramo, tipos, lógica em src/lib, estado, página, testes, docs, PR). Usar sempre que o pedido mexe em comportamento da aplicação, mesmo que pareça pequeno.
---

# Funcionalidade nova ou alterada

## 0. Antes de escrever código
- `git fetch origin main` e criar ramo a partir do `main` atual (`git checkout -b <nome-curto> origin/main`).
  Outras sessões do Claude também enviam para o `main`: ver `git log HEAD..origin/main`.
- Ler o que já existe na área (`docs/<area>.md`, `src/lib/<area>.ts`, a página). Reutilizar componentes de
  `src/components/ui.tsx` e funções de `src/lib/format.ts` (eur, int, num, dataCurta, hojeISO, uid, slug).
- Se a regra de negócio não está clara (preço, quem paga, que empresa, que estado), **perguntar** — não inventar.
  Consultar a skill `dominio-textil`.
- Se a mudança afeta dados reais ou é difícil de desfazer, dizer ao utilizador o que muda e como se volta atrás antes de começar.

## 1. Ordem de trabalho
1. **Tipos** em `src/types.ts` (comentário curto em PT-PT no que não é óbvio).
2. **Lógica pura** em `src/lib/<area>.ts`: sem React, sem `useDb`, testável em Node. Nada de `import.meta.env` direto
   (usar `import.meta.env?.X`). Bibliotecas pesadas (`xlsx`) com `await import()`.
3. **Estado**: ações em `src/store/db.ts`; dados novos seguem a skill `dados-e-migracoes`.
4. **Página/componentes**: página nova em `lazy()` em `src/main.tsx`, entrada no menu em `src/components/Layout.tsx`,
   alertas no sino se fizer sentido. Seguir a skill `ui-ux` (telemóvel incluído).
5. **Registo de atividade**: `log('Ação', 'detalhe')` em toda a ação que altera dados (o utilizador consulta-o).
6. **Testes** (skill `testes`): unidade para a lógica, app para o fluxo, telemóvel se há página nova.
7. **Docs**: atualizar/criar `docs/<area>.md` (o que faz, o que não faz, como voltar atrás) e `docs/testes.md`.
8. `npm test`, `npm run build`, `npx eslint <ficheiros mexidos>` — tudo sem falhas novas.
9. Commit e PR (skill `publicar`). Não juntar sem o utilizador pedir.

## 2. Princípios
- Mostrar antes de gravar: importações e ações em massa têm prévia (novas / alteradas / iguais / avisos).
- Nada se perde: apagar = cópia de segurança antes + confirmação escrita + atividade; desfazer quando possível.
- Funciona sem servidor (modo local) e sem a migração SQL aplicada (avisa em vez de partir).
- Valores lidos por IA ou importados guardam a origem; o que é dúvida fica assinalado («a confirmar»).
- Sugerir, não decidir: preços, aprovações e documentos fiscais ficam sempre com a pessoa.
- Mensagens ao utilizador curtas, em PT-PT, a dizer o que aconteceu e o próximo passo.
