---
name: ui-ux
description: Padrões de interface e experiência desta aplicação (design system, componentes, texto em PT-PT, telemóvel, acessibilidade, ações perigosas, estados vazios e de erro). Usar ao criar ou alterar qualquer ecrã, componente ou mensagem.
---

# UI e UX

## Linguagem visual (não inventar estilos novos)
- Tokens em `src/index.css` (`@theme`): fundo `fundo`/`fundo-2`, superfícies `papel`, texto `tinta`/`tinta-2`/`suave`/`tenue`,
  linhas `linha`/`linha-forte`, marca `ouro`, estados `verde` (ok), `ambar` (atenção), `vermelho` (erro/atraso), `azul` (informação/ligações),
  cada um com `-fraco` (fundo) e `-borda`. Raios `rounded-cartao`, `rounded-painel`, `rounded-controlo`. Cores da folha da fábrica `folha-*`.
- Componentes de `src/components/ui.tsx`: `Cabecalho` (sobre, título, sub, ações), `Cartao`, `Kpi` (tom), `Tabela` (filtros
  texto/lista/data, ordenação por linha), `Modal` (com rodapé), `Botao` (primario/secundario/fantasma/perigo, pequeno, icone),
  `Etiqueta` (tom), `Pilulas`/`Chips` (separadores), `Campo`+`Entrada`/`Seletor`, `aviso()` (toast). Ícones lucide 15–17 px.
- Números: `eur()`, `int()`, `num()`, datas `dataCurta()`; classe `num` para algarismos tabulares. Percentagens com vírgula («25,4 %»).

## Texto
- PT-PT, frases curtas, verbo no infinitivo nos botões («Importar planeamento», «Marcar como recebido»).
- Dizer o que aconteceu e o próximo passo («Cópia reposta. A gravar no servidor…»). Erros explicam a causa e como resolver.
- Termos do negócio como os usam na fábrica: ficha, OF, tech pack, packing list, labdip, revista, N/ comissão.

## Fluxos
- **Prévia antes de gravar** em importações e ações em massa.
- **Ações perigosas/irreversíveis**: botão `perigo`, descarregar cópia antes, escrever palavra (LIMPAR, DESFAZER, REPOR) para ativar.
  Documentos fiscais: resumo do que vai ser emitido + confirmação.
- **Estados vazios** explicam o que fazer («Ainda não há… Importe…»). Carregamento: texto «A ler…»/«A gravar…» no botão desativado.
- Sugestões (preço, peso, grupo) aparecem como botões a escolher; nunca mudam valores sozinhas.
- Alertas importantes também no sino (`Layout.tsx`) e com contagem no menu.

## Telemóvel (obrigatório — usam a app instalada para marcar coisas)
- Grelhas: `grid-cols-1 sm:…`, `grid-cols-2 lg:grid-cols-4` para KPIs; layouts de duas colunas só a partir de `lg`.
- Tabelas largas dentro de `overflow-x-auto` (com `min-w-[…]`); cabeçalhos com `flex-wrap`.
- Alvos de toque ≥ 32 px; selects nativos para mudar estados; nada que dependa de hover.
- Testar a 390 px: nenhuma página mais larga do que o ecrã (`tests/app/telemovel.spec.ts`).

## Acessibilidade
- `aria-label` em botões só com ícone e em selects sem rótulo visível; foco visível; contraste dos tokens (não usar `tenue` para texto essencial).
- Não comunicar só pela cor: juntar texto («Atrasada 3 dias»).

## Verificar
Abrir a página com Playwright (desktop e 390 px), tirar captura e olhar antes de dizer que está feito.
