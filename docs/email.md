# Emails de encomendas (IMAP)

A função do servidor **email-encomendas** vai à caixa de correio (a mesma que o Thunderbird lê) e recolhe os emails de
encomendas com anexo Excel, PDF ou imagem. **Só lê**: abre a pasta em modo de leitura, não marca como lido, não move e
não apaga. No Thunderbird fica tudo como estava.

## Como funciona
- Página **Emails de encomendas** (menu Fichas de produção). Com a aplicação aberta, verifica sozinha ao entrar e de
  10 em 10 minutos. O botão **Ver emails novos** verifica na hora.
- Cada email novo que passa nos filtros fica em **Por tratar**, com os anexos guardados no servidor (bucket
  `documentos`, pasta `email/`). Aparece também no sino e no menu.
- **Criar encomenda** abre a Nova encomenda com os anexos já carregados (Excel lido diretamente; PDF lido com IA).
  Ao criar, o email passa a **Tratado** e fica ligado à encomenda. **Ignorar** tira-o da lista.
- Cada chamada trata no máximo 4 emails novos (limites do Supabase); a aplicação repete sozinha até não haver mais.

## Anexos
- Guardam-se todos os anexos do cliente, um a um (o email pode ter mais de 15 MB): **PDF, Excel e imagens** (a IA lê),
  os restantes (ex.: **moldes DXF**) só para descarregar — aparecem a cinzento, com a indicação de que a IA não os lê.
- **Zips** abrem-se no servidor: cada ficheiro lá dentro passa a ser um anexo, com a origem (ex.: «Projeto.zip › Moldes»).
  O lixo do Mac (`__MACOSX`, `._…`, `.DS_Store`) e os ficheiros dos programas de email (`ATT00001.htm`, `smime.p7s`,
  `winmail.dat`) ficam de fora. Zips dentro de zips ficam inteiros. Nomes com acentos de zips feitos no Mac são corrigidos.
- Limites: 30 MB por ficheiro; por zip, até 300 ficheiros e 150 MB descomprimidos. O que passa disso aparece em
  **«Não guardados (abrir no Thunderbird)»**, com o nome, o tamanho e o motivo — nunca desaparece sem aviso.
- **Buscar anexos outra vez** (em cada email): volta à caixa de correio (só leitura) e recolhe de novo os anexos com estas
  regras — para emails recolhidos antes de a aplicação abrir zips, ou se algum falhou. Substitui a lista e apaga do
  servidor os ficheiros antigos desse email. Depois, «Ler outra vez» para a IA ler os anexos novos. Se o email já foi
  movido ou apagado no Thunderbird, avisa que não o encontrou.
- As regras estão em `src/lib/anexosEmail.ts`, copiadas para a função (o teste `anexos-email.spec.ts` garante que são iguais).

## Filtros (na própria página, «Filtros e ligação»)
- **Remetentes**: partes do endereço ou do nome (ex.: `whitecotton`, `@cliente.pt`).
- **Palavras no assunto**: ex.: `encomenda`, `order`, `pedido`.
- **Palavras no texto da mensagem** (pesquisa feita pelo servidor de email): só as inequívocas, ex.: `encomenda`, `tech pack`. Palavras comuns («pedido», «project» — está no nome Pereira's Project) trazem emails a mais.
- **Dias**: só procura nos últimos N dias (1 a 90; por omissão 14).
- Um email entra se tiver anexo útil (Excel, PDF ou zip) **e** coincidir com um remetente **ou** uma palavra. Sem filtros, entram todos
  os emails com anexo útil.

## Instalar (uma vez)
1. **Dados do servidor**: no Thunderbird, **Definições da conta → Definições do servidor**: nome do servidor (IMAP),
   porta (normalmente 993, SSL/TLS) e nome de utilizador.
2. **Palavra-passe**: se o fornecedor permitir, criar uma **palavra-passe de aplicação** só para isto
   (Gmail e Microsoft 365 exigem-na quando há verificação em dois passos).
3. Supabase → **Edge Functions → Secrets**, uma série por conta (até 9 contas):

   | | 1.ª conta | 2.ª conta | 3.ª conta |
   |---|---|---|---|
   | Servidor | `EMAIL_IMAP_HOST` | `EMAIL_2_IMAP_HOST` | `EMAIL_3_IMAP_HOST` |
   | Utilizador | `EMAIL_USER` | `EMAIL_2_USER` | `EMAIL_3_USER` |
   | Palavra-passe | `EMAIL_PASSWORD` | `EMAIL_2_PASSWORD` | `EMAIL_3_PASSWORD` |
   | Porta (só se não for 993) | `EMAIL_IMAP_PORT` | `EMAIL_2_IMAP_PORT` | `EMAIL_3_IMAP_PORT` |
   | Pasta (só se não for INBOX) | `EMAIL_PASTA` | `EMAIL_2_PASTA` | `EMAIL_3_PASTA` |

   Se uma conta falhar, as outras são lidas na mesma e o erro aparece na página.
4. Supabase → **Edge Functions → Deploy a new function → Via Editor**, nome **email-encomendas**, colar
   `supabase/functions/email-encomendas/index.ts` → **Deploy**.
5. No site: **Emails de encomendas → Filtros e ligação → Testar ligação ao email**, preencher os filtros e
   **Guardar filtros**; depois **Ver emails novos**.

## Dados
- Tabela `documentos`, coleção `emails` (um registo por email: remetente, assunto, data, texto, anexos, estado) e
  `configuracao/email` (filtros). Não entram nas cópias de segurança; os anexos ficam no bucket.

## Responder a partir da aplicação
- Botão **Responder** em cada email: a resposta sai da conta onde o email chegou, só para o remetente (ou o
  «Responder para» do email), com o assunto «RE: …», ligada à conversa (In-Reply-To / References), com a assinatura
  dessa conta e o email original citado. Fica uma cópia na pasta **Enviados** da conta (aparece no Thunderbird) e o
  registo da resposta no próprio email.
- **Assinaturas** (Filtros e ligação → Assinaturas das respostas): nome do remetente, texto e imagem por conta. A imagem
  fica no bucket (`assinaturas/`) e vai embutida no email.
- **Servidor de envio**: por omissão o mesmo do IMAP, porta 465 (SSL/TLS), mesmo utilizador e palavra-passe. Se for
  diferente: `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` (e `EMAIL_2_SMTP_HOST`, …). O Supabase bloqueia a porta 587.

## Emails de pedidos (Pré-orçamentação → Emails de pedidos)
- A mesma verificação das 3 caixas também apanha **pedidos de preço / cotação** de produção ou amostra (tipo `pedido`), com ou sem anexo.
- Palavras no assunto (por omissão): pedido, cotação, orçamento, preço, price, quotation, quote, RFQ, costing, amostra, sample, devis, presupuesto…;
  no texto: pedido de cotação/orçamento/preço/amostra, preço, qual o preço, quanto custa, best price, target price, please quote, request for quotation…
  Editáveis em «Filtros e ligação» da página (guardadas em `palavrasPedidos` / `palavrasPedidosTexto`).
- **Excluir:** assuntos com fatura, invoice, liquidação, pagamento, recibo, documentação, apoios, newsletter, promoção, status update… nunca são pedidos (`palavrasPedidosExcluir`); os que já estavam por tratar passam a ignorados na verificação seguinte desta página.
- Se o assunto tiver uma palavra de encomenda «forte» (as de encomenda que não são de pedido, ex.: encomenda, order) e um Excel/PDF, fica como encomenda.
- Ao verificar a partir desta página, os emails antigos guardados como encomenda (sem encomenda criada e não tratados) que tenham estas palavras passam para pedidos (por tratar).
