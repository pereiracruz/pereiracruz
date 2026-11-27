# Testes automáticos

```bash
npm test              # todos (60 testes, ~30 s)
npm run test:unidade  # só cálculos e leitores de ficheiros (sem browser)
npm run test:app      # só a aplicação no browser
```

- Corre com o **Playwright**. O servidor de desenvolvimento arranca sozinho na porta 5199, em **modo local**
  (sem Supabase nem Google; utilizador `admin` / `pereira2026`) e com os dados de exemplo.
- No GitHub, `.github/workflows/testes.yml` corre `npm ci`, instala o Chromium, `npm test` e `npm run build` em cada
  pedido de alteração e em cada envio para o `main`. Se falhar, o relatório fica nos «Artifacts» da execução.
- Primeira vez num computador novo: `npx playwright install chromium`.

## O que está coberto

| Ficheiro | O quê |
|---|---|
| `tests/unidade/calculos.spec.ts` | Preço final: agente sobre custo + N/ comissão, agente em € por peça, fichas antigas, margem em %, preço fixado; preços sugeridos (regra do cliente e objetivo de 25 %); empresa de cada linha; grupos da lavandaria; fórmulas; caixas da packing list |
| `tests/unidade/fichas-custo.spec.ts` | Importação de fichas de custo (formatos Imprevu e Longratex): N/ comissão, agente, preço à mão, corte e confeção juntos, total escrito à mão, mesmo código noutro modelo, consumo de tecido baixo |
| `tests/unidade/compras-prazos.spec.ts` | Compras (consumo × peças, 5 % de quebra, linha sem consumo, pedido ao fornecedor) e prazos (planeamento em 4 semanas, situação) |
| `tests/app/fichas.spec.ts` | Encomenda de exemplo → fichas → aprovar → produção → packing list → livro Excel; nº interno no ID |
| `tests/app/copias.spec.ts` | Cópia de segurança: descarregar, ficheiro inválido, repor com confirmação |
| `tests/app/orcamentos.spec.ts` | Ficha-modelo (ganga e sarja), fórmulas, preço sugerido, empresas, duplicar, botão de massa, falta do peso |
| `tests/app/importar-margens.spec.ts` | Importar fichas de custo no site e ver as margens por cliente e coleção |
| `tests/app/clothius.spec.ts` | Tabela da Clothius: tingimento ao kg e lavagem à peça; dados mestre |
| `tests/app/peso.spec.ts` | Peso da peça vindo da ficha de produção e de outros orçamentos do mesmo modelo |
| `tests/app/compras-prazos.spec.ts` | Compras (marcar encomendado, copiar pedido, Excel) e prazos (planear, etapa feita, página Prazos) |
| `tests/app/telemovel.spec.ts` | Ecrã de telemóvel: nenhuma página mais larga do que o ecrã; menu ☰; marcar recebido e etapa feita |
| `tests/unidade/conciliacao.spec.ts` | Conciliação bancária: nome no descritivo, candidatas (valor, valor único, várias faturas), cruzar sem repetir faturas, saldo |
| `tests/unidade/extratos.spec.ts` | Extratos em CSV e Excel lidos sem IA (débito/crédito, montante, números portugueses, ordem, saldos); formato desconhecido |
| `tests/unidade/faltas.spec.ts` | Feriados e dias úteis, tolerância, picagens esquecidas, horas extra (período e blocos de 15 min), banco de horas, baixa, subsídio |
| `tests/unidade/faturas-juntar-producao.spec.ts` | Conferência de faturas com o e-Fatura e recibos verdes; junção de alterações de dois aparelhos; grelha da produção diária |
| `tests/app/modulos-novos.spec.ts` | Conciliação, faturas, produção diária, faltas e emails abrem sem erros; pesquisa geral (Ctrl+K, «/», Enter, Escape) |
| `tests/unidade/planeamento.spec.ts` | Importação do planeamento (folha PLAN_RENT, salários não lidos, datas, nº repetidos), comparação, ligação às encomendas pelo nº e cliente |
| `tests/app/producao.spec.ts` | Página Produção: importar, mudar o estado, ver na encomenda, desfazer com cópia; estados e categorias nos dados mestre |
| `tests/unidade/email-ia.spec.ts` | Emails lidos com IA: cliente existente/novo, encomenda e ficha em rascunho a partir da leitura, pedidos de orçamento por peça |
| `tests/app/dados-exemplo.spec.ts` | Limpar dados de exemplo: cópia antes, confirmação com LIMPAR, só o que foi escolhido |

Em modo local, as partes que dependem do servidor (Gmail, TOConline, leitura com IA, Google Sheets) só se testam pelas funções
de cálculo e por abrirem sem erros: as ligações externas não são chamadas nos testes.

As fichas de custo dos testes são **fictícias** (`tests/apoio/fichasCusto.ts`), com a estrutura das reais: os ficheiros
dos clientes não vão para o repositório.
