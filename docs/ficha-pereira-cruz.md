# Formato das fichas da Pereira & Cruz

Analisado a partir do livro Excel real da encomenda Imprevu FW26 (14 folhas). O ficheiro original não fica no repositório.

## Estrutura do livro

Um livro por encomenda, com folhas por variante:

| Folha | Tipo | Quantas |
|---|---|---|
| `June_lightgrey`, `Lexi_blue`, `Roxy`… | **Ficha do produto** (corte e confeção) | 1 por variante (9) |
| `Acabamento_junegrey`, `Acabamento_Roxy`… | **Acabamento** (embalamento) | só algumas variantes (3) |
| `Packing_list` | **Packing list** de toda a encomenda, por envio | 1 (+1 cópia) |

As quantidades de cada ficha do produto são **pré-encomenda + stock** e batem, tamanho a tamanho, com a leitura
automática do Excel da encomenda (9/9).

## Ficha do produto (A1:K28)

- **Cabeçalho**: FICHA DO PRODUTO · Informação Geral da Encomenda · Cliente, Data, Data de entrega, Modelo
  (nome curto: JUNE, LEXI…), Descrição da peça (CALÇA 5 BOLSOS), **ID ENCOMENDA** (`E26-082-3`). Área H1:K5 para o desenho.
- **Distribuição de quantidades por tamanho**: Tecido · Ref. cor · tamanhos · Totais (`SUM`) · linha TOTAL CORTADO.
- **Tecidos** (A–F): P.C. Referência/Item · Fornecedor · Largura útil · Cons/Un · Cor · Total (`=Cons × Totais`).
  O forro aparece sem consumo.
- **Bordados/estampados** (H–K): Operação · Observações (posição) · Fornecedor · Cor.
- **Acessórios** (A–F): linha, fecho, etiqueta de composição, botão, etiqueta tecida, etiqueta de couro,
  autocolante, hangtag, saco. Total `=Cons × K$9` (quantidade da encomenda).
- **Observações para confeção e lavagem** e **Novas observações** (H–K), ex.: «seguir amostra física e enviar do avesso»,
  «Confeção a ser feita na Da. Deolinda», «código aprovado abertura da cor E61416/SN01 opção C».

## Acabamento (A1:K22)

- Cabeçalho igual, com «COLEÇÃO» e **ID ENCOMENDA INTERNO**; Modelo = código da referência (8H260801JU2).
- Quantidades em **três linhas**: ENCOMENDA · **TOTAL CONFECIONADO** · **TOTAL EMBALADO** e, numa versão,
  a diferença confecionado − embalado (sobras) por tamanho.
- **Acessórios de embalamento** com Total `=Cons × TOTAL CONFECIONADO` (não a encomenda).
- **Observações para embalamento** (texto longo, ex.: posição do hangtag).

## Packing list (em inglês, para o cliente)

- CLIENT · REFERENCE (coleção) · blocos por **envio** («FIRST SEND-16/10», «SECOND SEND-20/10»…).
- Dentro de cada envio, um bloco por modelo/variante: BOX Nº · tamanhos · TOTAL; **numeração das caixas contínua
  dentro do envio**; linha TOTAL por tamanho.
- Caixas de **17** (veludo) a **25** peças (denim); enchidas por tamanho, por vezes com dois tamanhos.
- Os totais embalados são os **confecionados** (101, 102, 107…), não os da encomenda (100).
- Numa versão há uma coluna de **peso** por caixa (≈ 0,9 kg por peça).
- Caixas mistas aparecem como texto («14+1stevie32»).

## O que as verificações automáticas apanhariam neste livro (a confirmar)

| Folha | O que se vê | Verificação |
|---|---|---|
| Todas as fichas do produto | **Linha** sem consumo → total 0 | Totais nenhum a zero |
| `Acabamento_junegrey` | Modelo **8H260801JU2** com as quantidades do **JU1** (light grey) | Modelo igual em todas as folhas |
| Folhas de acabamento | Data **13/05/2025** e ID **E26-070-2**, as fichas do produto têm 13/05/2026 e **E26-082-3** | Cabeçalho vem da encomenda |
| `Cópia de Acabamento_Roxy` | **R09** (zero) em vez de **RO9** (letra O) | Referência igual à encomenda |
| `Roxy` | Modelo «ROXI» | Nome do modelo dos dados da encomenda |
| `Lexi_grey`, `Roxy`, `Stevie`… | Largura útil «1,65 cm» (165 cm?) | Unidade da largura |
| `Lexi_grey` / `Lexi_blue` | Ficha: grey = Gigio, blue = Foster; tech pack: LE1 grey = Foster, LE2 blue = Gigio | Divergência tecido ↔ tech pack |
| `Cópia de Packing_list` | Caixa 4 «14+1stevie32» com total escrito à mão (14) | Totais por fórmula |

## Impacto no software

1. A ficha do produto já segue este formato; acertar: ID encomenda interno, nome curto do modelo, desenho no canto,
   forro sem consumo permitido, largura em cm validada.
2. **Folha de acabamento** em vez da folha de embalamento: Encomenda / Total confecionado / Total embalado / sobras,
   acessórios calculados sobre o confecionado.
3. **Packing list por envio**, em inglês, com numeração contínua, tamanho máximo por modelo, peso opcional e
   quantidades a partir do confecionado/embalado.
4. Exportação Excel: um livro por encomenda, uma folha por variante + acabamento + packing list.
