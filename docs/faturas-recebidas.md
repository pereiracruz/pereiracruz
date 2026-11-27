# Faturas recebidas (compras) e e-Fatura

Página **Financeiro → Faturas recebidas** (`src/pages/FaturasRecebidas.tsx`, `src/lib/faturasRecebidas.ts`).

- **Entrada:** emails das 3 contas classificados como fatura pela função `email-encomendas` (palavras no assunto:
  fatura, factura, invoice, recibo, nota de crédito…; no texto: recibo verde, fatura-recibo, segue a fatura…; com anexo
  PDF/Excel) e ficheiros carregados na página (PDF/imagem, bucket `faturas/`).
- **Ler e verificar:** a função `ler-documento` (tipo `fatura`) lê tipo de documento, nº, datas, NIF do fornecedor e do
  cliente, IVA por taxa, totais, retenção e valor a pagar. A aplicação procura o registo no e-Fatura do TOConline
  (`document_associations`, função `toconline`, só leitura) das duas empresas, pelo NIF do fornecedor e pelo nº (ou data
  e total), e confere: contas do documento, IVA × taxa, isenção, nº, data, total, IVA, empresa; nos recibos verdes,
  retenção (valor e taxa) e data de vencimento.
- **Criar e associar:** não existe na API do TOConline (é um pedido interno da sessão do browser,
  `/rus/purchases/efatura/<id>/create`). Faz-se no TOConline (Compras → e-Fatura → registo → Ações → Criar e associar),
  conferindo «Vence a» e «Total Ret.», e carregando o PDF em «Anexos». Depois marca-se «Lançada» na aplicação (se o
  registo já estiver associado, a verificação marca-a sozinha).
- Estados guardados em `documentos/faturasRecebidas`.
