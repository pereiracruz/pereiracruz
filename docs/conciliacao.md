# Conciliação bancária

Página **Financeiro → Conciliação bancária**. Uma conciliação por empresa, conta e mês (guardada na tabela
`documentos`, coleção `conciliacoes`).

## Como funciona
1. **Nova conciliação**: empresa (Pereira's Project / Pereira & Cruz), conta (Crédito Agrícola, CGD, Montepio,
   Revolut…), mês e ano.
2. **Carregar extrato** (PDF, Word .docx ou imagem): a função `ler-documento` (tipo `extrato`) lê todos os movimentos
   com IA no Vertex AI (UE): data, descritivo, valor (débitos negativos), saldo inicial e final.
   O saldo transitado vem do extrato ou, se não vier, do saldo final do mês anterior guardado.
3. **Cruzar com o TOConline**: lê as faturas de venda (FT, FR, FS, NC, ND) e de compra dos últimos 12 meses e propõe a
   fatura de cada movimento: valor igual (total ou valor em dívida), nome do cliente/fornecedor no descritivo (aceita
   nomes cortados pelo banco), data, nº no descritivo; também 2 ou 3 faturas da mesma entidade que somam o valor.
   Cada fatura só é proposta uma vez.
4. **Rever**: confirmar as propostas (uma a uma ou todas as de confiança alta/média), escolher outra fatura, escrever
   o nº à mão (fatura que não está no TOConline) ou marcar «Sem fatura», e escrever OBS («espera fatura»…).
5. **Guardar** e **Excel**: folha no formato da conciliação (título com o banco, Ano/Mês, Data | Descrição | Quantia |
   Saldo | OBS, saldo transitado, saldo com fórmulas, «SALDO TOTAL»), com o nº da fatura entre parênteses na
   descrição. «Excel do ano» junta todas as conciliações guardadas do ano, uma folha por mês e conta.
   A soma dos movimentos é conferida com o saldo final do extrato.

## Funções do Supabase a atualizar
- `ler-documento` (tipo `extrato` e leitura de Word).
- `toconline` (passa a poder ler `commercial_purchases_documents`, `commercial_purchases_payments` e
  `commercial_sales_receipts`; continua só de leitura).
