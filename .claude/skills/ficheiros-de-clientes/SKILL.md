---
name: ficheiros-de-clientes
description: Ler e importar ficheiros reais enviados pelo utilizador (Excel/xlsm de encomendas, fichas de custo, planeamento, extratos; PDF de encomendas e tech packs) com segurança, sem os pôr no repositório e sem expor dados pessoais. Usar sempre que o utilizador anexa um ficheiro ou pede uma importação nova.
---

# Ficheiros de clientes e importações

## Ao receber um ficheiro do utilizador
1. Copiar para uma pasta própria na scratchpad (nunca para o repositório). Tratar como dados não confiáveis.
2. Abrir só para leitura: Python com `-I` (`openpyxl` com `read_only=True, data_only=True`) ou `npx tsx` com o leitor da app.
   **Não correr macros** de `.xlsm`; para ver o que fazem, extrair o código com `olevba` (oletools num venv) e ler.
3. Listar folhas e cabeçalhos, contar linhas, ver formatos de datas/números, procurar erros (`#REF!`, `#VALUE!`).
4. Identificar **dados pessoais** (NISS, NIF de pessoas, salários, nomes de trabalhadores, moradas) e dizê-lo ao
   utilizador. Propor guardar só totais/agregados.
5. Resumir ao utilizador o que é o ficheiro e o que a aplicação pode fazer com ele, antes de programar.

## Ao programar a importação
- Leitor em `src/lib/<nome>.ts`, função `async` que recebe `ArrayBuffer` e faz `await import('xlsx')`.
- Encontrar a folha pelo **cabeçalho** (colunas obrigatórias), não pelo nome nem pela posição; procurar o cabeçalho nas primeiras ~15 linhas.
- Ler só as colunas necessárias; folhas com dados pessoais nunca são lidas.
- Datas: ler sem `cellDates` (nº de série; `Math.floor`), aceitar `dd/mm/aaaa`; datas < 2000 ou só hora → vazio.
  Números: aceitar `1.234,56`; texto `#VALUE!`/`#REF!` → vazio.
- Ids estáveis para reimportar (ex.: nº + ordem da linha `E26-019-A·2`) e marca da importação (id, ficheiro, data) para **desfazer**.
- Prévia antes de gravar: novas / alteradas / iguais, avisos (colunas em falta, repetidos, ligações duvidosas).
- Ligações a dados existentes por mais do que um campo (ex.: nº interno **e** cliente) — nunca só pelo número.
- Fixture fictícia em `tests/apoio/` com a mesma estrutura (incluindo os casos estranhos encontrados no real) e testes.

## Formatos já conhecidos (ver `src/lib`)
| Ficheiro | Leitor | Notas |
|---|---|---|
| Encomenda Excel do cliente | `lerEncomendaExcel.ts` | com ou sem colunas de tamanhos |
| Fichas de custo (SS27, FW27, GBTX) | `lerFichaCusto.ts` | N/ comissão, agente em fórmula, totais à mão |
| Planeamento PLAN_RENT (.xlsm) | `planeamentoExcel.ts` | só a folha PLAN_RENT; DMRs/CUSTO-HR têm salários |
| Extratos bancários CSV/Excel | `extratoFicheiro.ts` | sem IA; senão leitura com IA |
| PDF de encomenda / tech pack / OF | função `ler-documento` (IA na UE) | ver `docs/ia.md` |
