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

## Instalar a função (uma vez)
1. TOConline, em cada empresa: **Empresa → Configurações → Dados API** → integrador com o email da empresa →
   abrir o link do email (72 h): client_id, secret, endereço OAuth, endereço da API (e endereço de retorno, se houver).
2. Supabase → **Edge Functions → Secrets**: `TOC_PP_CLIENT_ID`, `TOC_PP_CLIENT_SECRET`, `TOC_PP_OAUTH_URL`,
   `TOC_PP_API_URL` (e `TOC_PP_REDIRECT_URL` se vier no email); o mesmo com `TOC_PC_…` para a Pereira & Cruz.
3. Supabase → **Edge Functions → Deploy a new function → Via Editor**, nome **toconline**, colar
   `supabase/functions/toconline/index.ts` → **Deploy**.
4. No site: **A minha conta → Ligação ao TOConline → Testar ligação**.
