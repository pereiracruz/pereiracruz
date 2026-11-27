# Produção diária (folha escrita à mão → Google Sheets)

Página **Fichas de produção → Produção diária** (`src/pages/Producao.tsx`, `src/lib/producao.ts`).

- **Carregar folha:** fotografia(s) da folha escrita à mão; a função `ler-documento` (tipo `producao`) lê, por dia, as
  peças em cada hora (8h-9h … 17h-18h), o(s) modelo(s), o total escrito (para conferir) e o fim de modelo.
- **Rever:** grelha editável; a bandeira marca o fim de um modelo nessa hora; linhas a amarelo = leitura com dúvidas;
  aviso se o total escrito não bater com a soma.
- **Passar para o Google Sheets:** escreve na folha « É ESTE!!! Produção2026» (Drive), na folha do mês (Janeiro …
  Dezembro), na linha da data (coluna A): horas pelo cabeçalho (8h-9h…), «Produção» com `=SUM(…)` da linha e «Modelo».
  O fim de modelo fica a laranja (#FCE5CD) nessa hora. Avisa se o dia já tinha valores. Id da folha em
  `documentos/configuracao/producao` (`folhaGoogle`).
