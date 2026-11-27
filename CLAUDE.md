# Pereira & Cruz · Pereira's Project — aplicação de produção e orçamentação

Aplicação interna de uma confeção têxtil em Portugal (calças, calções, casacos; ganga e sarja; adulto e criança).
Duas empresas trabalham juntas e aparecem em todo o código:
- **Pereira's Project (PP)** — comercial: fala com os clientes, compra tecidos e acessórios, trata da lavandaria
  (Clothius), acabamento, embalagem (Paulo e Marta), guias, faturas e entrega. Faz guias para todos menos para a P&C.
- **Pereira & Cruz (PC)** — produção: corte, confeção, revista (controlo). Linha de costura com ~20 pessoas.

Utilizadores falam **português de Portugal**. Toda a interface, mensagens, commits e documentação em PT-PT
(«ecrã», «ficheiro», «guardar», «carregar», «telemóvel»; nunca PT-BR). Nomes no código também em português.

## Comandos

```bash
npm run dev          # http://localhost:5173 — sem .env.local: modo local, admin / pereira2026
npm test             # Playwright: tests/unidade (sem browser) + tests/app (browser, modo local, porta 5199)
npm run build        # tsc -b && vite build — tem de passar antes de qualquer commit
npx eslint .         # há erros antigos conhecidos; não acrescentar novos nos ficheiros que mexes
```
Servidor de teste sem chaves: `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_GOOGLE_CLIENT_ID= npx vite --port 5174`.
Chromium já instalado neste ambiente: **não** correr `playwright install` (no CI sim).

## Stack
React 19 + TypeScript + Vite 6 + Tailwind v4 (tokens em `src/index.css` `@theme`), React Router 6 (páginas em
`lazy()` em `src/main.tsx`), Zustand com persist, SheetJS `xlsx` 0.18.5, lucide-react. Servidor: Supabase em Frankfurt
(Postgres + Auth + Storage + Edge Functions em Deno). Publicação: Netlify a partir do `main` (`netlify.toml`).
IA: Claude na Google Vertex AI região `eu`, só pela função `ler-documento` (nunca chamar IA do browser).

## Mapa
- `src/types.ts` — todos os tipos de domínio (Encomenda › Modelo › Variante, LinhaMaterial, Pedido, LinhaCusto, OrdemFabrico…).
- `src/store/db.ts` — estado único (`useDb`), coleções, ações, **migrações locais** (`version` + `migrate`).
- `src/store/servidor.ts` — sincronização com o Supabase (tabela `documentos`: coleção/id/dados jsonb),
  `VERSAO_DADOS`, `MESTRE`, `CORRECOES`. `src/lib/juntar.ts` junta alterações feitas em dois aparelhos.
- `src/lib/` — lógica pura e testável (`calc.ts` custos/verificações, `compras.ts`, `prazos.ts`, `lerFichaCusto.ts`,
  `lerEncomendaExcel.ts`, `planeamentoExcel.ts`, `conciliacao.ts`, `faltas.ts`…). Lógica nova vai para aqui, não para as páginas.
- `src/components/ui.tsx` — componentes base (Botao, Cartao, Tabela, Modal, Kpi, Etiqueta, Pilulas, Campo, Entrada, aviso…).
- `src/pages/` — fichas/, orcamentos/, producao/ e páginas de administração. `src/data/seed.ts` — dados mestre e exemplo.
- `supabase/migrations/*.sql` (corridos à mão pelo utilizador no SQL Editor), `supabase/functions/*/index.ts`.
- `docs/` — uma página por área (servidor, ia, toconline, orcamentos, producao, testes…). Atualizar com cada mudança.

## Regras de negócio que não se podem partir
- **Tecido do tech pack nunca passa para a ficha** sem equivalência na tabela ou decisão registada.
- Ficha **aprovada antes de exportar**; qualquer alteração a uma ficha aprovada volta a exigir aprovação
  (quantidades de produção/embalamento não contam). Totais sempre calculados, nunca escritos à mão.
- Cada valor lido por IA tem **origem e confiança**; o que não tem certeza fica «a confirmar», nunca inventado.
- ID interno **E26-082-3** = ano-nº encomenda-nº modelo. Liga fichas, OF do planeamento e pesquisa.
- Custos: corte e confeção vêm juntos numa linha (só se separam com confeção fora). Materiais são sempre da PP.
  Agente = % sobre (custo + N/ comissão) ou € por peça. Objetivo 25 % de margem **sobre o custo**.
  O preço final é **sempre** decidido pela pessoa: a aplicação sugere, nunca fixa sozinha.
- Lavandaria Clothius: ganga lava-se à peça (grupos A/B/C/criança); sarja tinge-se ao kg pelo labdip × peso do modelo.
- Documentos fiscais (TOConline) ficam finalizados e **não se apagam**: confirmação explícita antes de criar.
- Detalhe e glossário: skill `dominio-textil`.

## Dados e segurança
- **Nunca** pôr no repositório nem no chat: chave secreta do Supabase (`service_role`/`secret`), JSON de contas de
  serviço Google, credenciais TOConline/Portal das Finanças, `.env.local`. Segredos só em Supabase → Edge Functions → Secrets.
- **Documentos de clientes** (PDF, Excel, tech packs) e **dados pessoais** (NISS, salários, nomes de trabalhadores)
  nunca entram no repositório nem em testes. Testes usam ficheiros fictícios gerados em `tests/apoio/`.
- Importações de Excel leem só as folhas necessárias; o resto (ex.: DMRs com salários) é ignorado de propósito.
- Ação destrutiva = descarregar cópia de segurança antes + escrever uma palavra para confirmar + registo de atividade.
- A pré-visualização do Netlify de cada PR usa o **mesmo Supabase de produção**: o que lá se grava é real.

## Mudanças nos dados (ver skill `dados-e-migracoes`)
Coleção nova ou dado mestre novo exige, no mesmo commit: tipo em `types.ts`, `COLECOES`/`Tabelas` e `dadosIniciais`
em `db.ts`, subir `version` com passo em `migrate`, subir `VERSAO_DADOS` (e `MESTRE`/`CORRECOES`) em `servidor.ts`,
nome em `pages/Copias.tsx`. Nunca alterar dados existentes do utilizador sem condição «ainda tem o valor antigo».

## Testes (ver skill `testes`)
- Todo o comportamento novo leva teste: lógica em `tests/unidade/`, ecrãs em `tests/app/` (incluir o telemóvel em
  `telemovel.spec.ts` se for página nova). Correr `npm test` e `npm run build` antes do commit.
- Páginas carregam em `lazy`: usar asserções que esperam (`await expect(locator).toContainText()`), nunca `innerText()` logo após `goto`.
- `setInputFiles` não envia ficheiros de pastas com acentos: passar `{ name, mimeType, buffer }`.

## Git e PR (ver skill `publicar`)
- Um ramo e um PR por mudança; **nunca juntar ao `main` sem o utilizador pedir**. O CI (`.github/workflows/testes.yml`) tem de passar.
- Há outras sessões do Claude a trabalhar no mesmo repositório: `git fetch` antes de começar e antes de enviar;
  se o `main` andou, juntar/rebasear e voltar a correr os testes.
- PR pelo REST (`gh api repos/pereiracruz/pereiracruz/pulls …`); o GraphQL do `gh` não funciona aqui.
- Commits terminam com as linhas de atribuição indicadas pelo ambiente (Co-Authored-By e Claude-Session).

## Armadilhas conhecidas
- SheetJS: ao escrever fórmulas, a célula precisa de `{ f, v }` (sem `v` desaparece). Ao ler datas, usar o nº de série
  (sem `cellDates`) e tratar datas < 2000 como vazias. Importar `xlsx` com `await import('xlsx')` (pesa 420 KB).
- Supabase: a tabela `documentos` aceita qualquer nome de coleção `^[a-zA-Z]{2,40}$`; migrações SQL são corridas pelo
  utilizador, por isso o código tem de funcionar (com aviso) se a migração ainda não foi aplicada.
- Edge Functions verificam o JWT dentro da função (não depender de «Verify JWT»); são publicadas pelo utilizador no painel.
- Netlify não reporta estado ao GitHub; a rede deste ambiente bloqueia `*.netlify.app` (não dá para abrir o site daqui).
- O modo local guarda tudo em `localStorage` (`pc-fichas-v1`); o modo servidor não guarda dados no browser.

## Skills e agentes (`.claude/`)
Skills: `funcionalidade-nova`, `dados-e-migracoes`, `testes`, `ficheiros-de-clientes`, `ui-ux`, `dominio-textil`, `supabase`,
`documentos-fiscais` (com `referencia-api.md` do TOConline), `publicar`.
Agentes: `revisor-codigo`, `testador`, `revisor-ui`, `guardiao-seguranca`, `especialista-textil`, `especialista-toconline`,
`analista-ficheiros`. Usar o revisor e o guardião antes de PRs que mexem em dados, servidor ou documentos fiscais.
