# Ligação ao TOConline

API: https://api-docs.toconline.pt/ (JSON:API, OAuth). Duas empresas, credenciais separadas:
**PP** = Pereira's Project, **PC** = Pereira & Cruz.

## Circuito (confirmado pela Pereira & Cruz)
- A **Pereira's Project** faz as guias para todos (clientes e fornecedores: Clothius, bordador, estampador…),
  exceto para a Pereira & Cruz (mesma morada).
- **Viatura:** «V/ viatura» quando o fornecedor/cliente levanta; **BD-35-HS** quando somos nós a levar.
- **Fatura ao cliente:** converte-se a guia de transporte em fatura. Linha de descritivo «Artigos p/ armazém»;
  produto **Confeção**; no descritivo vai a **ordem de fabrico (OF)** e pode ir um mini packing list (peças por tamanho).

## Fases
1. **Só leitura (atual):** função `toconline` com `testar` (séries e últimos documentos) e `consultar` (GET de
   documentos, séries, clientes, fornecedores e artigos). Painel em **A minha conta → Ligação ao TOConline**.
   Serve para copiar a estrutura exata de uma guia e de uma fatura reais antes de criar documentos.
2. **Criar guias** a partir dos envios (packing list) e das saídas para fornecedores, comunicar à AT e guardar
   o número, o código AT e o PDF.
3. **Converter guia em fatura** (por encomenda ou por envio).

Documentos criados pela API ficam **finalizados** (não se apagam, só se anulam): o software pede sempre confirmação.
A comunicação de guias à AT pela API pede o utilizador e a palavra-passe do Portal das Finanças
(aconselhado: subutilizador só com permissão para documentos de transporte), guardados nos segredos.

## Fase 2 (em curso): rascunhos de guias
- Separador **Guias** em cada encomenda: escolhe-se a empresa (PP/PC), o destinatário (clientes do TOConline), a viatura,
  a hora de carga, as moradas e as linhas (artigo do TOConline, descrição, quantidade, preço). Valores habituais de cada
  empresa vêm das guias reais (secção abaixo).
- A função `toconline` (`acao: 'criar_guia'`) cria a guia como **rascunho** pela API anterior (`/api/…`, sem `v1`),
  cabeçalho JSON:API em `commercial_sales_documents` e linhas em `commercial_sales_document_lines`. Se uma linha
  falhar, apaga o rascunho. `apagar_rascunho` só apaga GT com `status` 0.
- **Gravar e finalizar:** `finalizar_guia` (ou `criar_guia` com `finalizar: true`) faz `PATCH commercial_sales_documents/{id}` com `status: 1` (só GT em rascunho). A comunicação à AT segue a configuração do TOConline; se não houver código AT, comunica-se lá e «Atualizar» traz o código.
- **Enviar por email:** `enviar_email` (só GT finalizada) faz `PATCH email/document/{id}` (`type` Document; `to_email` opcional, por omissão o email do cliente no TOConline). Ao criar com finalização, a opção «Enviar a guia por email ao cliente» envia logo; nas guias finalizadas há o botão «Enviar por email».
- A API não documenta a criação de GT: os nomes dos campos de transporte foram tirados das guias reais. O primeiro
  rascunho serve de teste; se o TOConline recusar algum campo, a mensagem de erro aparece no separador.

## Instalar a função (uma vez)
1. TOConline, em cada empresa: **Empresa → Configurações → Dados API** → integrador com o email da empresa →
   abrir o link do email (72 h): client_id, secret, endereço OAuth, endereço da API (e endereço de retorno, se houver).
2. Supabase → **Edge Functions → Secrets**: `TOC_PP_CLIENT_ID`, `TOC_PP_CLIENT_SECRET`, `TOC_PP_OAUTH_URL`,
   `TOC_PP_API_URL` (e `TOC_PP_REDIRECT_URL` se vier no email); o mesmo com `TOC_PC_…` para a Pereira & Cruz.
3. Supabase → **Edge Functions → Deploy a new function → Via Editor**, nome **toconline**, colar
   `supabase/functions/toconline/index.ts` → **Deploy**.
4. No site: **A minha conta → Ligação ao TOConline → Testar ligação**.

## Estrutura real dos documentos (lida pela API a 26/11/2026)

Lido com a função `toconline` (só leitura). Serve de modelo para criar guias e faturas na fase 2.

### Pereira's Project (PP): FP → GT → FT
Exemplo: **FP 2026/48 → GT 2026/328 → FT 2026/198** (Moldisar, 20/11/2026). Esta guia trazia preços da pró-forma, mas as guias criadas pela aplicação levam **só quantidades** (o preço é só na fatura).

**Guia GT 2026/328** (id 2466)
- `document_type` "GT", `document_area` "GR", série id 290; `parent_document_type` "FP" (`parent_documents_ids` [2366]), `child_documents_ids` [2467].
- Cliente id 127 (MOLDISAR, NIF 505538148).
- Transporte: `vehicle_registration` "V/carro"; `shipment_loading_time` "2026-11-23 08:00:00";
  carga `shipment_from_*` RUA DA AGRA, N.º 70 · 4775-205 · NEGREIROS; descarga `shipment_*` = morada do cliente.
- AT: `communication_status` "success", `communication_code` preenchido.
- Linhas:
  1. texto "Importado da FP 2026/48 de 28/10/2026" (sem artigo; tax NOR 23; unidade 2)
  2. texto **"Artigos p/armazém"** (`original_document_no` "FP 2026/48")
  3. artigo: produto id 36, `item_code` **"CONF"**, descrição = modelo ("Calção CARLO"), quantidade 406, preço 12, NOR 23 %, unidade 2

**Fatura FT 2026/198** (id 2467)
- `document_type` "FT", série id 282; `parent_document_type` "GT", `parent_documents_ids` [2466]; sem campos de transporte.
- Linhas: "Importado da GT 2026/328 de 20/11/2026"; "Importado da FP 2026/48 de 28/10/2026"; "Artigos p/armazém"; o mesmo artigo CONF.
  Todas exceto a primeira com `original_document_no` "GT 2026/328".
- Uma fatura pode juntar várias guias (ex.: FT 2026/196, GBTX, a partir de duas GT).

### Pereira & Cruz (PC): GT → FT
Exemplo: **GT 2026/237 → FT 2026/105** (Sergil, 25/11/2026). A guia vai a 0 €; os preços entram na fatura.

**Guia GT 2026/237** (id 2723)
- `document_type` "GT", `document_area` "GR", série id 245; `child_documents_ids` [2724].
- Cliente id 10 (SERGIL, NIF 501325948).
- Transporte: `vehicle_registration` "v/carro"; carga Rua da Agra, nº40 · 4775-205 · Negreiros; descarga = morada do cliente.
- AT: "success", `communication_code` preenchido.
- Linhas:
  1. texto **"Artigos confecionados a feitio p/armazém"**
  2. artigo: produto id 2, `item_code` **"Calças"**, descrição em 3 linhas (`\r\n`): tipo de peça, modelo, **OF** (ex.: "CALÇAS ADULTO / BARREL LEG PANT / P260339"), quantidade 105, preço 0, NOR 23 %, unidade 2

**Fatura FT 2026/105** (id 2724)
- `document_type` "FT", série id 237; `parent_document_type` "GT", `parent_documents_ids` [2723]; vencimento a 30 dias.
- Linhas: "Importado da GT 2026/237 de 25/11/2026"; "Artigos confecionados a feitio p/armazém"; o mesmo artigo com preço (105 × 11,80 €),
  `original_document_no` "GT 2026/237".

### Diferenças a ter em conta
- Texto da linha: PP "Artigos p/armazém"; PC "Artigos confecionados a feitio p/armazém".
- Artigo: PP **CONF** (id 36) com o modelo na descrição; PC artigo por tipo de peça ("Calças", id 2) com a OF na descrição.
- Preços na guia: as guias criadas pela aplicação levam só quantidades (preço 0); o preço é só na fatura.
- As linhas de artigo mostram `pending_quantity` diferente da quantidade (ex.: 115 para 105): confirmar o significado antes de criar documentos.
- Os ids de série, cliente, artigo, imposto (NOR = id 1) e unidade (id 2) são de cada empresa: ler sempre da API da empresa certa.
