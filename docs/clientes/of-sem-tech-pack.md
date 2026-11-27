# Clientes com ordem de fabrico (OF): Simão e Olgando, GBTX

Estes clientes não mandam tech pack. Com os acessórios entregam uma **ordem de fabrico (OF) em PDF por modelo**.
A Pereira & Cruz trata do tecido, lavandaria, corte e confeção; acessórios e embalagem são do cliente.

Configuração em **Dados mestre › Clientes**: «Documento de cada modelo» = `OF` e «Acessórios» = `Do cliente`
(qualquer outro cliente pode passar a funcionar assim mudando estes dois campos).

Na encomenda (separador *Modelos e fichas*):

1. Cada modelo sem ficha mostra **Falta OF** e o botão **Carregar OF** (só PDF).
2. A OF fica guardada no servidor (bucket `documentos`, pasta `of/`) e é lida com IA (mesma leitura do tech pack).
   Se a leitura falhar, o modelo fica **OF por ler** com o botão **Ler OF** para tentar outra vez.
3. Depois de lida aparece **Gerar ficha**. Na ficha, os acessórios e a embalagem ficam com o fornecedor
   «Fornecido pelo cliente», por isso nas Compras aparecem como enviados pela cliente (não se compram, só se confirma a receção).
4. A OF abre-se a partir do nome do ficheiro na linha do modelo e com **Ver OF** no topo da ficha; pode ser substituída.
