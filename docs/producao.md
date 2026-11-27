# Produção: ordens de fabrico (planeamento da linha)

Fase 1 da integração do Excel de planeamento e rentabilidade da Pereira & Cruz (`P0C_PLAN_RENT_…xlsm`).

## O que faz
- Página **Produção** (Fichas de produção → Produção): as ordens de fabrico do planeamento, com cliente, OF, referência,
  quantidade, preço, valor, datas (pedida, prevista, comunicada, real), prioridade, «dar fora» e **estado**.
- Duas vistas: **por estado** (colunas 01 Espera tecido … 18 Faturado; muda-se o estado num clique) e **lista** com filtros.
  As entregues/faturadas ficam escondidas por omissão.
- **Importar planeamento (Excel)**: lê só a folha com o cabeçalho ID · CLIENTE · REF_DESC (PLAN_RENT). Mostra antes
  o que é novo, alterado e igual, as encomendas que ficam ligadas e os avisos. Reimportar substitui pelo id
  (nº + ordem da linha, ex.: `E26-019-A·2`): o estado do Excel substitui o escolhido na aplicação (é avisado).
- **Ligação às encomendas**: pelo nº interno (E26-081, ou E26-087 para E26-087-1) **e** pelo cliente. Na encomenda
  aparece o quadro «Produção · planeamento da linha», só para consulta. Mesmo nº com outro cliente não liga (é avisado).
- Dados mestre: **Estados de produção** (17) e **Categorias de peça** (33), editáveis.

## O que não entra
Salários, nomes de trabalhadores, NISS (folhas DMRs e CUSTO-HR), custos, planeamento calculado e Gantt.
As encomendas, fichas, compras, prazos e orçamentos não são alterados.

## Voltar atrás
- **Dados**: Produção → **Importações** → **Desfazer…** apaga as ordens que essa importação trouxe ou atualizou
  (escrever DESFAZER; antes é descarregada uma cópia de segurança). Fica no registo de atividade.
- **Código**: reverter o pedido de alteração desta fase no GitHub. A página Produção desaparece; os registos já
  guardados nas coleções `ordensFabrico`, `estadosProducao` e `categoriasPeca` deixam de ser usados.

## Próximas fases
2. Planeamento automático da linha e Gantt · 3. Rentabilidade da fábrica (custo/hora por totais) · 4. Ligações à
produção diária, faltas e TOConline. Cada fase num pedido de alteração próprio.
