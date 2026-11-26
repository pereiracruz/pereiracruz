# Pré-orçamentação: fichas de custo da Pereira & Cruz

Analisado a partir de `SS27.xlsx` (Longratex: Vaqueiro, Calção chino, Calção vaqueiro). O ficheiro não fica no repositório.

## Formato das fichas atuais

- Uma folha por modelo + uma folha «Preços» com o preço final de cada modelo.
- Cabeçalho: Cliente · Ref. (tipo de peça) · nome do modelo + variante · código (ex.: 4033311).
- Tabela: **Descrição · Unidade · Consumo · Valor Unitário · Valor Total (s/ IVA)**, com `Total = Consumo × Valor`.
- 15 linhas fixas: Corte, Plano de corte, Confeção, Forro, Tecido, Lavandaria, Botão/molas, Botões de elástico, Fechos,
  Bordado, Elástico, Saco etiqueta, Saco embalamento, Revista, Acabamento.
- Consumos e valores escritos como fórmulas: plano de corte `3/32` (metros de plano ÷ peças por plano),
  molas `140.8/1000` (preço por milheiro), saco `31.7/2000`, elástico `0.46+0.08`.
- **Preço final escrito à mão** e **Margem total = Preço final − Total** (não há comissão de agente nestas fichas).
- Corte e confeção vêm **juntos** numa linha (ainda não há forma de custear o corte por modelo); só se separam quando a confeção é feita fora.

## O que a verificação encontrou (a confirmar pela Pereira & Cruz)

| Folha | O quê |
|---|---|
| Vaqueiro | Corte 7,00 € e Confeção 0,00 €: **corte e confeção juntos** (confirmado, não é erro). |
| Calção chino e Calção vaqueiro | Linha do botão: total escrito à mão 0,11 € quando consumo × valor dá 0,07 € → os totais da ficha têm +0,04 € (12,58 € em vez de 12,54 €; 10,20 € em vez de 10,16 €). |
| Calção vaqueiro | «Ref.» diz CALÇÃO CHINO num modelo vaqueiro; tecido 0,026 m: deve rondar 0,7 m × 4,10 € = 2,87 € (por excesso), **confirmar nos mini planos**. |
| Preços | Coluna «Preço SS26» num ficheiro SS27; no chino o preço é `12,9 + 0,65`. |

## No software

- **Importar fichas de custo** (Pedidos): lê cada folha, guarda as fórmulas, recalcula os totais e mostra os avisos;
  cada ficha passa a pedido fechado (preço final fixado) e entra no histórico de preços. Reimportar substitui.
- **Ficha-modelo** (Novo pedido): as 15 linhas com os valores de referência (Dados mestre → Tabela de preços).
- **Ficha de custo:** coluna de unidade; consumos e valores aceitam fórmulas; acrescentar/apagar linhas;
  **preço final fixado** (margem total em € e %) ou calculado (margem + comissão do cliente).
- **Duplicar** uma ficha para orçamentar uma peça parecida.
- Com servidor, os valores de referência novos juntam-se aos dados mestre do Supabase na próxima entrada.

## Outros formatos (Imprevu FW27/SS27, GBTX)

- Cabeçalho com **Cliente / Marca / Ref.** (à direita ou por baixo); sem cabeçalho, o nome vem da folha
  (`Melody_acidwash` → Melody · acidwash). Cliente desconhecido é criado automaticamente (ex.: GBTX).
- Fim da ficha: **Total · N/ Comissão** (margem fixa em €: Imprevu 3,00 €, GBTX 2,25 €) **· Comissão agente**
  (percentagem, ex.: `E28*0.07`) **· Preço final**. A ficha importada guarda a margem e a comissão próprias.
- Avisos novos: preço final à mão diferente do cálculo, linha sem consumo, cor da folha ≠ nome,
  mesmo código ou nome de cabeçalho noutra folha (cabeçalho copiado?), preço abaixo do custo.

## As duas empresas

- **Pereira's Project** (comercial): fala com os clientes, compra tecidos e acessórios, coordena prazos,
  lavandaria, acabamento, embalagem e entrega.
- **Pereira & Cruz** (produção): corte, confeção e controlo das peças.

Na ficha de custo, cada linha tem a empresa que a assume (P&C ou PP, clica-se para trocar) e o total do
custo mostra a parte de cada uma. Regra: a empresa escrita na descrição («Corte- Pereira & Cruz»); sem nada escrito,
corte, confeção e revista são da Pereira & Cruz e o resto da Pereira's Project.
Na SS27 (Longratex) há botão, bordado, elástico, botões de elástico e saco etiqueta escritos «Pereira & Cruz» (a confirmar).

## Regras de preço (respostas da Pereira & Cruz, 26/11/2026)

- **Objetivo: 25 % de margem sobre o custo**, nem sempre possível. O preço final é decidido à mão a partir do custo.
  Regras por cliente: Imprevu margem fixa (N/ comissão 3,00 €); outros 20 %; Longratex margem pequena.
- **Com agente:** preço = custo + N/ comissão + % do agente × (custo + N/ comissão). O agente pode também ser um valor
  fixo por peça (ex.: 1–2 € quando a cliente tem preços target). Fichas antigas com a % só sobre o custo
  (`E28*0.07`) são importadas como estão.
- **Imprevu:** a agente saiu; não há agente na SS27 nem na FW27 (comissão do cliente passou a 0).
- **No software:** a ficha de custo sugere dois preços (regra do cliente e objetivo de 25 %), mostra a margem real
  sobre o custo (verde ≥ 25 %, âmbar abaixo, vermelho abaixo do custo) e o preço só muda quando o utilizador escolhe
  ou escreve. A importação já não avisa preços finais à mão.

## Acessórios e lavandaria por tipo de tecido

| | Ganga (vaqueiro) | Sarja (chino) |
|---|---|---|
| Lavandaria (Clothius) | lavagem, **à peça** | tingimento, **ao kg** conforme o labdip (branco, clara, média, escura, preto, especial) |
| Fecho da cintura | molas nos tamanhos de meses, botão nos de anos | botão de massa, 40,85 € o milheiro |
| Rebites | 3 (meses e anos) | — |
| Botões de elástico | sim | sim |

A ficha-modelo pede o tecido (Ganga / Sarja / Outro) e monta as linhas assim.

## Tabelas da Clothius (Dados mestre)

- **Clothius · tingimento** (tabela de 01/04/2023, em vigor, para a Pereira's Project): € por kg por tipo (reativo, direto,
  poliamida, acrílico, 2 fibras, retro dye, vegetal, pigmentos, sedas…) e cor do labdip (amostras, branco, clara,
  média, escura, preto, especial). Inclui anti-pilling; GOTS +15 %; amostras com mínimo de 1 kg.
- **Clothius · lavandaria** (ganga/tecidos): € por peça, lavagens (molhados) e secos, por grupo
  (criança; A: top, calção, saia curta; B: calça, bermudas, camisa manga curta…; C: casaco, blusão, camisa…).
- Fora das tabelas (sujeito a orçamento): stone bleach ao kg, coating, bigodes lixa 3, jato areia 2, rotos especiais,
  cores e acabamentos especiais; tingimento degradé (t-shirt 2,10/4,20 €, sweat 3,85/7,70 €).
- **Na ficha de custo**, a linha da lavandaria tem «Tabela Clothius»: tingimento (tipo, cor do labdip, peso da peça,
  GOTS) → kg × €/kg; ou lavagem e secos (grupo escolhido pelo tipo de peça; criança se o cliente usa a escala de
  bebé e criança) → soma por peça, com a fórmula guardada (ex.: 0.3+0.75+0.75).

Empresas na ficha: **P&C**, **PP**, **FORA** (confeção subcontratada, separada do corte) e **CLIENTE**
(corte ou material dado pelo cliente).
