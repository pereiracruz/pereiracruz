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
- Cada chamada trata no máximo 15 emails novos; os restantes entram na seguinte.

## Filtros (na própria página, «Filtros e ligação»)
- **Remetentes**: partes do endereço ou do nome (ex.: `whitecotton`, `@cliente.pt`).
- **Palavras no assunto**: ex.: `encomenda`, `order`, `PO`.
- **Dias**: só procura nos últimos N dias (1 a 90; por omissão 14).
- Um email entra se tiver anexo útil **e** coincidir com um remetente **ou** uma palavra. Sem filtros, entram todos
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
