---
name: documentos-fiscais
description: Regras para guias de transporte, faturas e comunicação à AT através do TOConline (Pereira's Project e Pereira & Cruz). Usar antes de criar, mudar ou testar qualquer coisa que emita, finalize, comunique ou envie documentos fiscais.
---

# Documentos fiscais (TOConline, AT)

## Princípios
- O TOConline é o software certificado: a aplicação **só envia dados**; o TOConline numera, finaliza, comunica à AT e gera o PDF.
- Documento finalizado **não se apaga** (só se anula no TOConline). Por isso: rascunho primeiro, resumo do que vai ser
  emitido, confirmação explícita da pessoa, registo de atividade. Nunca finalizar em testes automáticos.
- **Não há ambiente de testes** no TOConline: o primeiro documento real serve de teste — combinar com o utilizador.
- Credenciais da API e do Portal das Finanças (subutilizador só para documentos de transporte) só em segredos do Supabase.

## Circuito confirmado
- PP faz guias para todos (clientes e fornecedores) exceto para a PC (mesma morada). Viatura: «V/ viatura» ou «BD-35-HS».
- PP: FP → GT → FT; PC: GT → FT. A fatura converte-se a partir da guia; linha de descritivo «Artigos p/ armazém»
  (PC: «Artigos confecionados a feitio p/armazém»); artigo PP **CONF** com o modelo/OF na descrição; mini packing list por tamanho opcional.
- Guias levam só quantidades (preço 0); o preço é na fatura. Ids de série, cliente, artigo, IVA e unidade são **de cada empresa**:
  ler sempre da API da empresa certa (`docs/toconline.md` tem a estrutura real lida das guias existentes).

## API (referência completa em `referencia-api.md`, nesta pasta; agente `especialista-toconline`)
- OAuth: `GET {OAUTH_URL}/auth` (código no `Location` do 302, sem seguir) → `POST {OAUTH_URL}/token` com Basic(client_id:secret).
  Access token 4 h; refresh 8 h (pedir novo quando expira). Pedidos JSON:API com `Content-Type: application/vnd.api+json`.
- v1 `POST commercial_sales_documents` cria **já finalizado**; a API anterior (sem `v1`) permite rascunho + linhas + `PATCH status: 1`.
- Comunicação AT: `send_document_at_webservice` (credenciais do Portal) — preferir a configuração automática do TOConline.
- PDF: `url_for_print/{id}` → `public-file/...`. Email: `PATCH email/document/{id}`.

## Checklist antes de enviar código que emite documentos
- [ ] Só cria rascunhos sem confirmação; finalizar exige ação explícita na interface.
- [ ] Mostra empresa, destinatário, moradas, viatura, linhas e totais antes de emitir.
- [ ] Erros do TOConline aparecem tal como vêm, em PT-PT, sem esconder.
- [ ] Atividade regista número do documento e código AT.
- [ ] Nada de credenciais em código, logs ou mensagens.
