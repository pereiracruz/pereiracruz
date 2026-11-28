# Emails lidos com IA (OpenRouter)

Nas páginas **Emails** e **Emails de pedidos**, cada email tem o botão **«Ler com IA»**: a função `ler-email` envia o texto
e os anexos (PDF, imagens, Excel) ao OpenRouter e devolve, num JSON validado por esquema (*structured outputs*):
- **classificação** (encomenda, pedido de preço, tech pack/OF, alteração, fatura, outro), confiança e motivo;
- **cliente** (nome, marca, NIF, email; e o cliente da aplicação se for conhecido);
- **encomenda** (linhas por referência/cor/tamanho, preços, totais do documento para conferência, notas e perguntas);
- **tech pack / OF** (tecidos, lavagem, bordados, acessórios, medidas) e **pedido de preço** (peças, quantidades, preço alvo);
- **dúvidas** a confirmar com o cliente.

Com a leitura:
- **Criar encomenda (e fichas)**: cria a encomenda com os modelos e variantes; os modelos com tech pack/OF ficam com a ficha
  **em rascunho** (regras de sempre: tecido só com equivalência, aprovar antes de exportar). As dúvidas e perguntas vão para as notas.
- **Criar pedido(s) de orçamento**: um por peça, com a ficha-modelo certa (ganga/sarja; calças/calções…).
- **Criar cliente** quando não existe (margem 20 % por omissão, a rever em Dados mestre).
A leitura fica guardada no email (não se volta a pagar para a ver); «Ler outra vez» repete.

A IA recebe a lista de **todos** os anexos (incluindo os que vinham num zip e os que não lê, como moldes DXF ou ficheiros
grandes demais) e não pode dizer que «não veio anexo» quando a lista tem ficheiros. Lê primeiro os PDF, depois Excel e
imagens; os formatos que não lê nem se descarregam (não gastam o limite de 18 MB por leitura).

Fornecedores: por omissão só `anthropic`, `claude-on-aws`, `azure` e `amazon-bedrock`, por esta ordem (segredo opcional
`OPENROUTER_FORNECEDORES`). O Google (Vertex) fica de fora porque recusa o esquema («compiled grammar is too large»).
Não se envia `temperature`: o Claude Opus 5.5 não a aceita e, com `require_parameters`, nenhum fornecedor servia.
Se o pedido falhar por encaminhamento ou erro do fornecedor, a função tenta de novo: sem exigir todos os parâmetros
(o JSON continua pedido e é validado) e depois com os PDF por OCR (Mistral, 2 $/1000 páginas). Nunca abdica de
`data_collection: 'deny'`. A tentativa usada aparece nas notas da leitura; os erros (com o fornecedor e a mensagem
original) ficam nos registos da função.

## Instalar (uma vez)
1. Criar conta em openrouter.ai, carregar crédito e criar uma **API key** (Settings → Keys). Em **Settings → Privacy**:
   desligar o registo de prompts e a utilização de dados; se quiser, ativar ZDR («Zero Data Retention»).
2. Supabase → Edge Functions → **Secrets**: `OPENROUTER_API_KEY` (obrigatório). Opcionais: `OPENROUTER_MODELO`
   (omissão `anthropic/claude-opus-5.5`), `OPENROUTER_PDF` (`native` · `mistral-ocr` para digitalizações · `cloudflare-ai`),
   `OPENROUTER_ZDR=1`, `OPENROUTER_URL=https://eu.openrouter.ai/api/v1` (só planos Business/Enterprise).
3. Supabase → Edge Functions → nova função **ler-email** → colar `supabase/functions/ler-email/index.ts` → Deploy.

## Privacidade
- Pedidos com `data_collection: 'deny'` (só fornecedores que não guardam dados) e, com `OPENROUTER_ZDR=1`, só retenção zero.
- Sem plano Business/Enterprise, o processamento **não fica garantidamente na UE** (ao contrário da função `ler-documento`,
  na Vertex AI região `eu`). Para manter tudo na UE: plano Business com `eu.openrouter.ai`.
- A chave fica só no Supabase; o browser nunca fala com o OpenRouter.

## Custos (referência, 27/11/2026)
Claude Opus 5.5: 4 $/M tokens de entrada, 20 $/M de saída (um email com um PDF de 5 páginas ≈ 0,05–0,15 $).
OCR Mistral: 2 $ por 1000 páginas. Cada leitura mostra o custo em baixo.

Documentação: https://openrouter.ai/docs/llms.txt (structured-outputs, multimodal/pdfs, routing/provider-selection, zdr,
in-region-routing, plugins/response-healing). Agente: `.claude/agents/especialista-openrouter.md`.
