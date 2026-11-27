# Referência da API do TOConline (lida a 27/11/2026)

Fonte: https://api-docs.toconline.pt/ (índice em `llms.txt`; cada página em Markdown acrescentando `.md`; OpenAPI no SwaggerHub
`toconline.pt/toc-online_open_api/1.0.0`). A API segue **JSON:API** (jsonapi.org): `data.type`, `data.id`, `data.attributes`,
`relationships`; filtros `filter[campo]=valor`, paginação `page[size]`, ordenação `sort=-date`, `include=lines`.

## Acesso
- Credenciais por **empresa**: TOConline → Empresa → Configurações → **Dados API** (só administrador/«Empresário») → integrador
  recebe email com link de 72 h: `client_id`, `secret`, `OAUTH_URL`, `API_URL` (+ ficheiro Postman). Redirect pré-fixado pelo TOConline.
- Requer licença **GC** ativa (os GET funcionam mesmo com a licença expirada).
- Token: `GET {OAUTH_URL}/auth?client_id=…&redirect_uri=…&response_type=code&scope=commercial` → 302, `code` no `Location`
  (não seguir o redirect) → `POST {OAUTH_URL}/token` (form: `grant_type=authorization_code&code=…&scope=commercial`;
  `Authorization: Basic base64(client_id:secret)`) → `access_token` (4 h) + `refresh_token` (8 h).
  Renovar: `grant_type=refresh_token&refresh_token=…`. 401 → token expirado.
- Cabeçalhos de todos os pedidos: `Content-Type: application/vnd.api+json`, `Accept: application/json`, `Authorization: Bearer <token>`.
- Rotas: `{API_URL}/api/v1/…` (versão atual) ou `{API_URL}/api/…` (versão anterior, com rascunhos).

## Vendas
| Ação | Rota | Notas |
|---|---|---|
| Criar documento (FT, FS, FR) | `POST /api/v1/commercial_sales_documents` | cabeçalho + `lines` num pedido; **fica finalizado** |
| Ler / listar | `GET /api/v1/commercial_sales_documents/{id}` · `GET …/?filter=…` | ex.: `filter="documents.pending_total>0"` |
| Rascunho (versão anterior) | `POST /api/commercial_sales_documents` → `POST /api/commercial_sales_document_lines` | permite guias (GT) e faturas por partes |
| Alterar rascunho / linha | `PATCH /api/commercial_sales_documents/{id}` · `PATCH /api/commercial_sales_document_lines` | |
| Apagar rascunho / linha | `DELETE /api/commercial_sales_documents/{id}` · `DELETE …_lines/{id}` | só antes de finalizar |
| Finalizar | `PATCH /api/commercial_sales_documents/{id}` com `status: 1` | depois não se altera nem apaga |
| Anular | `PATCH …/{id}` com `status: 4` | único caminho depois de finalizado |
| Retificativos (NC, ND) | `POST /api/v1/commercial_sales_documents` com `parent_documents_ids` | |
| Recibos | `POST /api/v1/commercial_sales_receipts` (linhas `receivable_type: Document`, `receivable_id`, `received_value`) · `PATCH …/{id}` · `PATCH …/{id}/void` | FR cria o recibo ao finalizar |
| PDF | `GET /api/url_for_print/{id}?filter[type]=Document&filter[copies]=1` → `scheme://host/path` (`/public-file/…`) | só finalizados |
| Email | `PATCH /api/email/document` com `data.type: email/document`, `id`, `attributes.type` (Document/Receipt), `to_email`, `subject`, `from_name` | |
| Comunicar à AT | `PATCH /send_document_at_webservice` (`document_type`: sales_document · shipment_document · purchases_shipment_document; `entity_username/password` do Portal das Finanças) → `communication_code` (código AT das guias) | |

Cabeçalho: `document_type`, `date`, `document_series_id`/`document_series_prefix`, `customer_id` ou `customer_tax_registration_number`
+ `customer_business_name` (obrigatório), morada/código postal `0000-000`/cidade/país, `due_date`, `settlement_expression` ("3+5"),
`payment_mechanism`, `vat_included_prices`, `tax_exemption_reason_id`, `operation_country`, moeda, `notes`, `external_reference`.
Campos de transporte vistos em documentos reais: `vehicle_registration`, `shipment_address_detail`/`postcode`/`city`/`country`,
`shipment_from_*`, `shipment_loading_time`, `expected_shipment_unloading_time`, `acts_as_shipment_document`, `communication_status`.
Linha: `item_type` (Product · Service · TaxDescriptor), `item_id`/`item_code`, `description` (obrigatório), `quantity`, `unit_price`,
`unit_of_measure_id`, `settlement_expression`, `tax_id`/`tax_code` (NOR…)/`tax_percentage`/`tax_country_region`.

## Compras
`POST/GET /api/v1/commercial_purchases_documents` (FC, DSP; fornecedor por id ou NIF, criado se não existir) ·
`PATCH …/{id}/finalize` · `PATCH …/{id}/void` · pagamentos `POST /api/v1/commercial_purchases_payments` (+ `…_payment_lines`) ·
PDF `url_for_print/{id}` · e-Fatura: `document_associations` (só leitura, ver `src/lib/faturasRecebidas.ts`).

## Empresa e tabelas auxiliares
Clientes `/api/customers` (GET/POST/PATCH/DELETE; `filter[tax_registration_number]`), moradas `/api/addresses`, contactos `/api/contacts`,
fornecedores `/api/suppliers`, produtos `/api/products` e serviços `/api/services` (`item_code`, `item_description`, `sales_price`,
`tax_code`; `filter[item_code]`), séries `/api/commercial_document_series?filter[document_type]=GT&filter[prefix]=…`,
IVA `/api/taxes?filter[tax_code]=NOR&filter[tax_country_region]=PT`, isenções `/api/tax_exemption_reasons?filter[code]=`,
unidades `/api/units_of_measure`, países `/api/countries`, moedas `/api/currencies`, famílias `/api/item_families`,
contas bancárias `/api/bank_accounts` · `/api/company_bank_accounts?filter[iban]=`, caixa `/api/cash_accounts`, categorias de despesa `/api/expense_categories`.

## Como as duas empresas usam (ver `docs/toconline.md`, estrutura lida dos documentos reais)
- PP: FP → GT → FT; linha «Artigos p/armazém»; artigo **CONF** (id 36) com o modelo na descrição.
- PC: GT → FT; linha «Artigos confecionados a feitio p/armazém»; artigo por tipo de peça (ex.: «Calças», id 2) com a OF.
- IVA NOR = id 1, unidade id 2 — mas **ids são por empresa**: ler sempre da API da empresa certa.
- Guias criadas pela app levam só quantidades (preço 0); `pending_quantity` diferente da quantidade ainda por confirmar.
