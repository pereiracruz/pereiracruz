# Imprevu

Os documentos originais do cliente **não** ficam no repositório (são confidenciais).

## Encomenda FW26 (Excel)

- Folha única («Feuil1», Excel em francês), tabela simples com cabeçalho na linha 1:
  `Style | Description | Color | 25 … 32 | Qty | FABRIC`.
- Escala de cintura 25–32. A coluna **Qty** é fórmula (`SUM`) → serve para conferir cada linha.
- **Linhas «stock»**: a mesma referência aparece numa segunda linha com `Color = stock`. Somam à referência
  (850 pré-encomenda + 93 stock = 943 peças).
- **Código da referência**: `8H26 0801 JU 1` → modelo (JU = June, LE = Lexi, RO = Roxy, ST = Stevie, SV = Swiggy)
  + variante no último carácter. 9 referências → 5 modelos.
- **Sem preços** e **sem data de entrega** (vem no email).
- A coluna **FABRIC** mistura indicação de tecido («CONTACT SIDOGRAS REF PCRL P707 1020 WASHED») com
  **perguntas do cliente** («POSSIBLE TO PRODUCE THIS QUANTITY?», «DO YOU HAVE AN IDEA OF THE MOST SIMILAR SWATCH…?»).
  O leitor separa as perguntas (terminam em «?») e deixa-as na encomenda para responder.
- A coluna Color é genérica (GREY/BLUE/BROWN) e às vezes não bate com a descrição
  (RO9 «USED BORDEAUX» com Color BROWN).

**Leitor implementado** (`src/lib/lerEncomendaExcel.ts`, sem IA): deteta o cabeçalho e as colunas por nome
(PT/EN/FR), lê os tamanhos, junta stock, agrupa por modelo, confere com a coluna de quantidade.
Testado com este ficheiro: 13 linhas, 0 diferenças.

## Tech pack FW26 «IMPREVU DENIM · PRODUCTION FW26» (PowerPoint exportado para PDF, 10 páginas)

- Uma página por referência: **código + nome**, **uma linha de tecido** e **3 fotografias** (frente, detalhe, costas).
  Não tem medidas, acessórios nem lavagem descrita: a informação está nas fotos e nas fichas anteriores.
- Tecidos indicados:

| Ref. | Nome | Tecido |
|---|---|---|
| JU1 | Denim June Clean Light Grey | Sidogras PCRL P707 1020 washed |
| JU2 | Denim June Velvet Light Blue | Sidogras PECO P705 washed B |
| JU9 | Denim June Light Brown Grey | Sidogras PCRL P707 1045 washed |
| LE1 | Denim Lexi Bicolore Grey | Foster / FJ Magalhães |
| LE2 | Denim Lexi Bicolore Blue | Gigio cor grey / FJ Magalhães |
| LE3 | Denim Lexi Vintage | Foster / FJ Magalhães · cor light dirty blue |
| RO9 | Denim Roxy Balloon Used Bordeaux | Options · cor brown 19-1521 TPG · Troficolor F19-S7 (Santos-S) + foto da etiqueta do tecido (ref. SA0012/6DBL136, 100% CO, 400 g/m², larg. 145) |
| ST1 | Denim Stevie Medium Grey | «Find fabric with EA (ref. Epheusus Bob)» → pedido à Pereira & Cruz |
| SV9 | Denim Swiggy Velvet Brown | Sidogras PCRL P2019-00 50 |

### O que isto pede à leitura

- **Ligação pelo código** (8H260801JU1…) entre tech pack e Excel: todas as 9 referências do Excel estão no tech pack.
- **Texto dentro de imagens** (etiqueta do tecido do RO9) → precisa de leitura com visão (IA).
- **Modelos repetidos de outras coleções**: Lexi, Roxy e Swiggy já existiam na SS27 → propor a ficha anterior do
  mesmo modelo como ponto de partida (materiais, acessórios, observações).
- **Pedidos ao fornecedor/produção** escritos no tech pack («find fabric with EA») → decisão a tomar, não um campo.
- Tecidos com fornecedor indicado pela cliente (Sidogras não está nos fornecedores) → confirmar se se compra
  ao fornecedor indicado ou se se usa equivalente da Pereira & Cruz.

### Perguntas em aberto

1. Os tecidos Sidogras compram-se mesmo à Sidogras (acrescentar aos fornecedores) ou há equivalente vosso?
2. «Bicolore»: são dois tecidos (corpo + faixa lateral)? Qual é o segundo tecido do LE1/LE2?
3. As fichas da Imprevu partem da ficha anterior do mesmo modelo quando existe (Lexi, Roxy, Swiggy)?
4. Como respondem hoje às perguntas do cliente (quantidade mínima, tecido parecido)? Basta ficarem registadas na encomenda?
