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

## O que a verificação encontrou (a confirmar pela Pereira & Cruz)

| Folha | O quê |
|---|---|
| Vaqueiro | Corte a 7,00 € e Confeção a 0,00 € (nas outras: corte 0,25 €, confeção 6,25–7,00 €) → valores trocados? O total não muda. |
| Calção chino e Calção vaqueiro | Linha do botão: total escrito à mão 0,11 € quando consumo × valor dá 0,07 € → os totais da ficha têm +0,04 € (12,58 € em vez de 12,54 €; 10,20 € em vez de 10,16 €). |
| Calção vaqueiro | «Ref.» diz CALÇÃO CHINO num modelo vaqueiro; tecido 3,952/150 = 0,026 m (nas outras 0,4 m). |
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
