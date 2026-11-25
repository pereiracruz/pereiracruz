# Levantamento: Fichas de produção · Pereira & Cruz

Levantamento feito a partir da demonstração completa (34 passos) e da navegação por todos os ecrãs.
Capturas em `referencia/capturas/` e texto integral de cada ecrã em `referencia/textos/`.

## 1. O que é

Aplicação web interna para uma confeção têxtil (escritório com 2 pessoas). Resolve três tarefas:

| Fase | Módulo | Problema que resolve |
|---|---|---|
| 1 | **Fichas de produção** | Hoje cada encomenda é copiada à mão para fichas (uma por modelo × variante × destinatário). A IA lê a encomenda (Excel) e o tech pack (PDF), gera as fichas e confere-as. |
| 2 | **Orçamentação** | Hoje cada orçamento começa do zero. A IA lê o tech pack, preenche a ficha de custo, compara com preços anteriores e propõe um intervalo. A direção valida e sai o email. |
| 3 | **Stock** | O consumo sai das fichas, o stock são contagens. O sistema diz o que falta comprar. |

Princípio de produto: **a IA sugere e a pessoa decide**. Nada se grava sem aprovação. Cada valor mostra de onde veio (página do tech pack, encomenda, ficha anterior) e com que confiança.

## 2. Stack observada

- SPA React + Tailwind CSS v4 (Vite). Na demo todos os dados ficam em `localStorage` (não há API).
- Tipos de letra: **Inter** (UI), **Instrument Serif**, **JetBrains Mono**.
- Paleta (tokens em português):
  - fundo `bege #F2EFE9`, papel `#FFF`, tinta `#1D1C1A`, suave `#5C574F`, ténue `#8C867B`, linha `#E0DBD1`
  - ouro (destaque) `#D9B030`, verde `#2F7D4F`, âmbar `#9A6212`, vermelho `#A8443B`, azul `#2F5E9E` (cada um com variante "fraco" e "borda")
  - raios: cartão 12px, painel 16px, controlo 8px
- A ficha de produto imita a folha Excel da fábrica: cabeçalhos azul-escuro, faixas azul-claro e títulos de secção a vermelho.

## 3. Estrutura e navegação

**Login** (`/login`): utilizador, palavra-passe e "Entrar". Cartão central com filete dourado no topo.

**Barra lateral** (recolhível):
- Logótipo + nome · sino de notificações com contador
- Painel · Contas
- **Fichas de produção**: Encomendas · Dados mestre
- **Orçamentação · Fase 2**: Pedidos · Histórico de preços
- **Stock · Fase 3**: Stock
- A minha conta · Suporte (estado online) · utilizador (avatar, nome, perfil) · Sair

**Padrões de UI comuns**
- Migalhas de pão → sobretítulo do módulo → título grande → ação principal (botão preto) à direita
- Fila de 3 cartões KPI clicáveis, que filtram a tabela
- Tabelas com filtro por coluna logo abaixo do cabeçalho: texto com lupa, e listas para datas ("Próximos 7 dias", "Este mês", "Já passou", "Escolher dia…") e para estados
- Etiquetas de estado com ponto colorido (Concluída, Fichas geradas, Falta tech pack, Pronta…)
- Indicador de passos (Carregar → A IA lê → Rever e gerar)
- Cartões "Decisão IA": título, nível de confiança (alta/média/baixa), explicação, fonte, "Porquê" expansível, Aceitar ↵ / Alterar
- Atalhos de teclado (↵ aceitar, ⌘↵ aceitar tudo)
- Modo demonstração guiada (balões com anterior/seguinte e painel "n/34" no canto)

## 4. Ecrãs em detalhe

### 4.1 Painel (`/dashboard`)
- Data por extenso · "Reiniciar" (repõe os dados da demo) · "Ver demonstração" (Completa / Só fichas / Só Fase 2)
- Separadores: Fichas de produção | Orçamentação · Fase 2 | Stock · Fase 3
  - **Fichas**: n.º de encomendas, fichas geradas e por rever, mais um gráfico de barras horizontais "Peças por modelo" da última encomenda
  - **Orçamentação**: n.º de pedidos, por validar, preço médio por peça e lista de preços por peça
  - **Stock**: n.º de materiais e em falta, com uma explicação

### 4.2 Encomendas (`/dashboard/fichas`)
- KPIs: Fichas por rever · Fichas geradas · Concluídas
- Tabela: Cliente · Coleção · Modelos · Referências · Peças · Data de entrega · Estado · [Abrir]
- Botão "+ Nova encomenda"

### 4.3 Nova encomenda (`/dashboard/fichas/nova`): o fluxo principal
1. **Carregar**: zona de arrastar ("Excel, PDF ou imagens · até 25 MB"), cartões dos ficheiros carregados e o painel "Fica pronto" com o que vai ser gerado. Botão "Preparar fichas".
2. **A IA lê**: visualizador do PDF à esquerda; à direita, o progresso (Encomenda → Tech pack → Ligação → Fichas) com contadores que vão aparecendo ("30 a 60 segundos").
3. **Rever e gerar**:
   - aviso "3 decisões por tomar"
   - resumo da encomenda: referências, pré-encomenda + stock, valor (€) e peças; lista de modelos com n.º de referências, peças e etiqueta "Tech pack ligado" ou "Sem tech pack"
   - cartão "<Modelo> · lido do tech pack": campos Tecido, Lavagem, Bordado, Gola, Botões e Medidas, cada um com a página de origem, barra de confiança e visto de confirmação. Passar o rato num campo mostra a página do PDF de onde veio. Campos com pouca confiança aparecem a vermelho: "A IA não tem a certeza — confirme com o documento."
   - **Decisões** (onde o tech pack e a produção não coincidem):
     - Tecido: usar o equivalente da casa em vez do tecido da cliente (confiança média, fonte: ficha anterior)
     - Botões: o tech pack diz madrepérola e a ficha anterior dizia latão (alta)
     - Variante sem descrição no tech pack: assume a mesma base com outra lavagem (baixa, rever)
   - "Descartar" | "Aceitar tudo e gerar fichas ⌘↵"

### 4.4 Detalhe da encomenda (`/dashboard/fichas/:encomenda`)
- Título "Cliente · Coleção" + tipo ("Produto acabado"), resumo e "Descarregar fichas"
- KPIs: Modelos · Referências · Peças (+ valor €) · Fichas geradas (x de y variantes)
- Tabela: Modelo · Tipo de peça · Variantes · Peças · Ficha (Pronta / Falta tech pack) · ação (Abrir fichas / carregar Tech pack)
- Variante "concluída" (Dr. Collectors): Modelo · Peças · Fichas por destinatário · Estado (Entregue)

### 4.5 Fichas do modelo (`/dashboard/fichas/:encomenda/:modelo`)
- Título + estado ("Pronta a enviar" / "Entregue") · **Exportar** · **Enviar à produção**
- Separadores de variante com contador de peças (Acid wash 49 | Medium blue 23)
- "Folhas por destinatário": **Ficha de produto · Corte e confeção · Lavandaria · Bordador · Embalamento · Packing list · Medidas** (o conjunto muda conforme o modelo, por exemplo "Estampado")
- Barra **Conferido** (validações automáticas): quantidades iguais à encomenda, modelo e variante iguais em todas as folhas, totais calculados e nenhum a zero, botões iguais ao tech pack
- **Cabeçalho comum a todas as folhas**: logótipo, FICHA DO PRODUTO, Cliente, Modelo, Data, Descrição da peça, Data de entrega, ID encomenda, desenho; depois a "Distribuição de quantidades por tamanho" (Tecido, Ref. cor, tamanhos, Totais) e uma linha de total que muda com a folha (TOTAL CORTADO / CONFECIONADO / EMBALADO)
- Conteúdo de cada folha:
  - **Ficha de produto**: Tecidos (Ref., Fornecedor, Largura útil, Cons/un, Cor, Total = cons × peças), Acessórios (Item, Fornecedor, Observações, Cons/un, Cor, Total), Bordados/estampados (Imagem, Operação, Fornecedor, Cor), Observações para confeção e lavagem, Novas observações
  - **Corte e confeção**: tecidos, acessórios de confeção e observações
  - **Lavandaria** (fornecedor): tratamento, cor do cliente, código de lavagem ("A definir com…") e quantidades por tamanho
  - **Bordador**: imagem, posição, medidas, cor da linha, quantidade e observações
  - **Embalamento**: acessórios de embalagem e observações
  - **Packing list**: caixas de no máximo N peças, enchidas tamanho a tamanho, com totais
  - **Medidas** (modelista): tamanho base, pontos de medida por tamanho, graduação, e marca "TECH PACK" nas cotas que vêm do documento
- **Versões da ficha** (linha do tempo: v1 gerada, v2 decisão de tecido, v3 alteração de material)
- **Quem recebe cada folha** (folha → destinatário)
- **Modal Exportar**: formato (Google Sheets "como as fichas de hoje" / Excel "um separador por folha" / PDF "um ficheiro por destinatário") e caixas para escolher as folhas → "N ficheiros prontos"

### 4.6 Dados mestre (`/dashboard/dados`)
Separadores, cada um com uma tabela e filtros:
- **Fornecedores**: Fornecedor · Tipo (Tecido, Forro, Acessórios, Embalagem, Serviço externo) · O que fornece
- **Equivalências de tecido**: Tecido da cliente → Tecido da casa · Onde se usou · Estado (A confirmar)
- **Lavagens e tingimentos**: Sufixo (AW, MB…) · Lavagem/cor · Cliente · Código para a lavandaria
- **Acessórios por cliente**: Cliente · Acessório · Fornecedor · Consumo
- **Tamanhos**: Escala (Letras / Cintura / Comprimento de perna) · Tamanhos · Usada em
- **Preços de referência**: Linha (Corte, Plano de corte, Confeção…, Margem) · Valor · Unidade · Origem

### 4.7 Pedidos de orçamento (`/dashboard/orcamentos`)
- KPIs: Por validar · Enviados · Fechados
- Tabela: Cliente · Peça · Preço por peça · Data de entrega · Validado por · Estado

### 4.8 Novo pedido (`/dashboard/orcamentos/novo`)
Passos: **Carregar → A IA lê → Ficha de custo → Validação → Email**
- **Ficha de custo** (editável, recalcula na hora): Descrição · Consumo · Valor unitário · Total s/ IVA · Origem (Segura / Estimada / Confirmar), com uma nota explicativa por linha
  - Linhas: Corte, Plano de corte, Confeção, Tecido, Lavandaria, Etiqueta de couro, Etiquetas, Molas, Rebites, Bordado, Saco, Autocolante, Caixa, Saco da etiqueta, Revista, Acabamento
  - **Total** + margem fixa ("N/ comissão" 3,00 €) + **comissão de agente 7 %** = **Preço final**
    - exemplo da demo: a comissão é 7 % sobre o total de custos (7 % × 25,57 = 1,79), logo 25,57 + 3,00 + 1,79 = 30,36 €
  - Deteção de incoerências (ex.: a ficha de produto leva uma etiqueta de couro e o consumo está a 0), com botão "Corrigir para 1"
- **Peças parecidas**: preços já calculados ou aceites (origem: Ficha de custo / Encomenda)
- **Preço proposto**: intervalo (mín.–máx.), confiança, data de entrega e "preço final depois do protótipo"
- "Enviar à <validador>" → **Validação**: a validadora vê só os valores a confirmar (Confirmar / Ajustar) e carrega em "Validar preço"
- **Email**: rascunho em EN / FR / PT, editável, com "Copiar" e "Marcar como enviado"

### 4.9 Histórico de preços (`/dashboard/historico`)
- KPIs: Preços guardados · Preço médio por peça · Peças encomendadas · desvio entre ficha de custo e preço aceite (%)
- Tabela: Cliente · Peça · Variante · Preço por peça · Peças · Origem (Encomenda / Ficha de custo)

### 4.10 Stock (`/dashboard/stock`)
- KPIs: Materiais · Em falta · A encomendar
- Tabela: Material · Fornecedor · Necessário (consumo × peças das fichas) · Em stock · A comprar · Estado (Chega / Em falta)

### 4.11 Contas, A minha conta e Suporte
- **Contas**: KPIs (Ativas, Administradores, Por ativar, Desativadas), lista por perfil (Administradores / Utilizadores) e "Nova conta"
- **A minha conta**: avatar, nome, perfil, email; alterar a palavra-passe com regras ao vivo (8+ caracteres, uma maiúscula, as duas iguais)
- **Suporte**: formulário (Título, Descrição 0/5000, anexar até 10 prints com colar ou arrastar, Tipo: Problema/Pedido/Dúvida, Urgência: Baixa…Urgente, Contacto) e lista "Os meus pedidos" com a conversa. Respostas aparecem também no sino.

## 5. Modelo de dados (proposta)

```
Utilizador(id, nome, email, perfil[admin|utilizador], estado, criadoEm)
Cliente(id, nome)
Fornecedor(id, nome, tipo, fornece)
EquivalenciaTecido(id, tecidoCliente, tecidoCasa, fornecedorId, ondeUsou, estado)
Lavagem(id, sufixo, nome, clienteId, codigoLavandaria)
AcessorioCliente(id, clienteId, item, fornecedorId, consumo, unidade)
EscalaTamanhos(id, nome, tamanhos[], usadaEm)
PrecoReferencia(id, linha, valor, unidade, origem)

Encomenda(id, clienteId, colecao, tipo, entrega, estado, valor, ficheiros[])
Modelo(id, encomendaId, nome, alias, tipoPeca, techPackId?, desenho)
Variante(id, modeloId, referencia, cor, lavagem, comprimento?, qtdPorTamanho{}, precoCompra)
Ficha(id, varianteId, versao, estado, tecidos[], acessorios[], bordados[], observacoes[], medidas[])
FolhaDestinatario(tipo[produto|corte|lavandaria|bordador|embalamento|packing|medidas|estampado], destinatarioId)
VersaoFicha(id, fichaId, n, titulo, descricao, data, autor)
DecisaoIA(id, contexto, titulo, confianca, explicacao, fonte, porque, estado[pendente|aceite|alterada])
CampoExtraido(id, campo, valor, pagina, confianca, confirmado)

PedidoOrcamento(id, clienteId, peca, variante, entrega, estado, validadoPor, precoMin, precoMax)
LinhaCusto(id, pedidoId, descricao, consumo, valorUnit, origem[segura|estimada|confirmar], nota)
PrecoHistorico(id, clienteId, peca, variante, preco, pecas, origem)
Stock(id, material, fornecedorId, unidade, quantidade)
PedidoSuporte(id, titulo, descricao, tipo, urgencia, anexos[], mensagens[])
Notificacao(id, utilizadorId, texto, lida, link)
```

Regras de cálculo:
- Total da linha da ficha = consumo/un × total de peças da variante
- Necessidade de stock = soma(consumo × peças) por material, sobre as fichas em aberto; a comprar = max(0, necessário − stock)
- Preço final = total de custos + margem fixa + comissão do agente (% sobre o total)
- Packing list = caixas de no máximo N peças, enchidas tamanho a tamanho

## 6. Proposta de implementação (frontend primeiro)

**Stack**: React 18 + TypeScript + Vite + Tailwind v4 + React Router + Zustand (estado) com persistência local enquanto não houver servidor; TanStack Table nas tabelas; pdf.js para ver o tech pack; SheetJS para ler e exportar Excel. A IA e o servidor entram numa fase posterior, atrás de uma camada `api/` com dados de exemplo, para depois ligar ao backend sem mexer nos ecrãs.

**Ordem**:
1. Base: tokens de design, layout (barra lateral, cabeçalho), componentes (botão, cartão KPI, tabela com filtros, etiqueta de estado, passos, modal, cartão de decisão IA), login
2. Dados mestre (CRUD)
3. Encomendas: lista, detalhe e fichas do modelo, com as 7 folhas, validações, versões e exportação
4. Nova encomenda: carregar, leitura (simulada) e rever/gerar
5. Orçamentação: pedidos, novo pedido com ficha de custo editável, validação, email, histórico
6. Stock
7. Contas, A minha conta, Suporte, notificações
8. Visita guiada (opcional)
9. Servidor: autenticação, base de dados, ficheiros, IA de extração (Claude), exportação para Google Sheets/Excel/PDF

## 7. Pontos em aberto (para o PDF / decisão tua)
- Quantos utilizadores e que perfis (Sofia, Maria José, Gilmar…)? Quem valida preços?
- Formato real das encomendas Excel de cada cliente (para o leitor)
- Regra para trocar o tecido da cliente pelo da casa (a própria demo diz "Falta a regra")
- O que a modelista recebe hoje (a folha Medidas da demo é ilustrativa)
- Tabela completa de preços de referência (confeção por tipo de peça, etc.)
- Exportação para Google Sheets: conta Google da empresa?
- Incluir ou não a visita guiada e o "Reiniciar demo"
- Marca: nome, logótipo e cores próprias, sem "Powered by BeyX"

## 8. O que o PDF (Descrição Funcional v1, PEC/2026/01) acrescenta ou muda

**Âmbito do PDF**: 2 módulos, Fichas de produção e Pré-orçamentação. Stock fica **excluído**.

**Excluído no PDF, mas presente na demo**: tabelas de medidas e graduações, versões das fichas, rascunho do email ao cliente, prazo calculado pela capacidade, stock, envio a fornecedores e clientes, entrada por email.

**No PDF e não na demo (ou só esboçado)**:
- 4 perfis (Equipa de fichas, Validador, Consulta, Administrador) com uma matriz de permissões por ecrã e por ação
- Registo de atividade: acessos e ações sensíveis, consultável pelo administrador; cada alteração aos dados mestre fica registada
- Dados mestre: tecidos com **largura útil** e **destinatários** como tabelas próprias
- **Modo de serviço** (a feitio / produto acabado), que define os materiais que aparecem na ficha
- Passo explícito de **ligação encomenda ↔ modelos**, confirmada pela equipa
- Leitura da encomenda: cabeçalhos, escalas diferentes, separadores pré-encomenda / stock / total, variante escrita no código (ex.: 7E27JANETMB)
- Destinatários: modelista, corte, confeção, lavandaria, bordador, **estampador**, embalamento
- Verificações: quantidades contra a encomenda, **soma por cor contra o total por tamanho**, **variantes sem ficha**, totais fixos ou a zero
- **Aprovação** antes de exportar; alterar uma ficha aprovada obriga a **nova aprovação**
- Divergência de material face ao tech pack **exige justificação**; o tecido do tech pack nunca é copiado
- Medidas sem tabela no tech pack: ficam por preencher e assinaladas
- Orçamentação: **importação de orçamentos passados**, histórico **pesquisável por cliente, tipo de peça, tecido e tratamento**, margem fixa **ou** percentual e comissão **por cliente**, intervalo de preço **e prazo** só quando há casos parecidos suficientes, ficha de custo **reproduzida ao cêntimo**
- IA com processamento na UE, sem treino com os documentos; ficha de custo e verificações por regras, sem IA
- Exportação para Google Sheets (pasta indicada; precisa de conta Google e autorização do titular), Excel e PDF
