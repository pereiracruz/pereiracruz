---
name: testes
description: Escrever e correr os testes automáticos (Playwright) deste projeto, unidade e browser, com ficheiros fictícios e as armadilhas conhecidas. Usar ao acrescentar comportamento, ao corrigir um erro (primeiro o teste que falha) ou quando o CI falha.
---

# Testes

## Estrutura
- `playwright.config.ts`: projeto `unidade` (`tests/unidade/*.spec.ts`, Node, sem browser) e `app` (`tests/app/*.spec.ts`,
  Chromium 1440×1000). Servidor Vite na porta 5199 em **modo local** (variáveis `VITE_*` vazias) com os dados de exemplo.
- `tests/apoio/app.ts`: fixture `pagina` (já com sessão; falha se houver erro JavaScript), `fichaModelo`, `livroDescarregado`.
- `tests/apoio/*.ts`: geradores de Excel fictícios com a estrutura dos reais (fichas de custo, planeamento).
- CI: `.github/workflows/testes.yml` → `npm ci`, `npx playwright install --with-deps chromium`, `npm test`, `npm run build`.

## Regras
- Lógica nova em `src/lib` → teste de unidade com valores calculados à mão no próprio teste (comentar a conta).
- Fluxo novo → teste de app que faz o que a pessoa faz (clicar, escrever, descarregar) e verifica o resultado visível
  e o registo de atividade. Página nova → acrescentar a `PAGINAS` em `tests/app/telemovel.spec.ts`.
- **Nunca** usar documentos reais de clientes nem dados pessoais. Criar fixtures fictícias em `tests/apoio/`.
- Um erro corrigido leva um teste que falhava antes.
- Não desligar, saltar ou pôr `retries` num teste para ficar verde: encontrar a causa.

## Armadilhas
- Páginas em `lazy()`: logo após `goto` o conteúdo ainda não está lá. Usar `await expect(locator).toContainText(...)`,
  `toHaveCount`, `toBeVisible` — não `innerText()` seguido de `expect(string)`.
- `toContainText` usa `textContent` (sem espaços entre elementos): regex com `\s*` (ex.: `/Por encomendar\s*\d+/`).
- Descrições na ficha de custo são `<input>`: verificar com `main input[value^="..."]`.
- `setInputFiles(caminho)` falha em silêncio se a pasta tiver acentos (o nome do teste entra no caminho): passar
  `{ name, mimeType, buffer }`.
- Teclas globais (Ctrl+K, Escape): esperar pelo foco (`toBeFocused`) antes de carregar.
- Área de transferência: `context.grantPermissions(['clipboard-read', 'clipboard-write'])`.
- Neste ambiente o Chromium está em `/opt/pw-browsers`; `@playwright/test` fica na mesma versão (1.63.0). Não correr `playwright install` localmente.

## Comandos
```bash
npm test                                   # tudo
npx playwright test tests/app/x.spec.ts    # um ficheiro
npx playwright test --repeat-each=3        # procurar testes instáveis
```
