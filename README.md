# Pereira & Cruz · Fichas de produção e pré-orçamentação

Aplicação: **https://pereiracruz.netlify.app** (Netlify, publica a cada envio para `main`) · dados no Supabase (UE, Frankfurt).

Aplicação web para gerar as fichas de produção a partir da encomenda e do tech pack, e para preparar os orçamentos.
Requisitos: `../LEVANTAMENTO.md` (demo analisada + Descrição Funcional PEC/2026/01).

## Correr

```bash
npm install
npm run dev
```

Abrir http://localhost:5173.

- **Modo servidor** (Supabase): criar `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (ver `docs/servidor.md`); entrar com o email e a palavra-passe criados no Supabase.
- **Modo local** (sem `.env.local`): utilizador `admin` · palavra-passe inicial `pereira2026`.

**Testes automáticos:** `npm test` (ver `docs/testes.md`). No GitHub correm sozinhos em cada pedido de alteração.

## Estado (fase 1: frontend)

- Com Supabase os dados ficam na base de dados (UE); sem configuração ficam no browser.
- A leitura de documentos pela IA está **simulada** com o exemplo da Imprevu (SHIRT MAO). A leitura real entra com o servidor.
- Exportação: **Excel** real (um separador por folha, totais em fórmula) e **PDF** (janela de impressão). Google Sheets entra com o servidor.

## Estrutura

```
src/
  types.ts            modelo de dados
  data/seed.ts        dados mestre e exemplos (Imprevu, Dr. Collectors, Shirt Mao)
  store/db.ts         estado global persistido + registo de atividade + sessão
  lib/calc.ts         totais, verificações, packing list, ficha de custo, peças parecidas
  lib/exportar.ts     Excel (SheetJS) e PDF
  components/         layout, componentes de UI, folhas da ficha, visualizador do tech pack
  pages/              Painel, Encomendas, Nova encomenda, Ficha, Dados mestre,
                      Pedidos, Novo pedido, Histórico, Registo de atividade, Conta
```

## Regras implementadas (Descrição Funcional)

- Cada campo lido mostra a página de origem e a confiança; os de baixa confiança ficam assinalados.
- Totais sempre por fórmula (consumo × peças); nunca zero onde há quantidades.
- O tecido do tech pack nunca passa para a ficha sem equivalente ou decisão registada.
- Divergências de material face ao tech pack exigem justificação para aprovar.
- Uma ficha por variante; medidas em falta ficam assinaladas.
- Nenhuma ficha se exporta sem aprovação; alterar uma ficha aprovada obriga a nova aprovação.
- Verificações: quantidades vs encomenda, soma por cor vs total por tamanho, variantes sem ficha, totais a zero.
- Ficha de custo por regras (sem IA): margem fixa ou percentual e comissão do agente por cliente.
- Intervalo de preço só com casos parecidos suficientes (mínimo 2), com a justificação.
- Nenhum preço é válido sem validação; o email é só rascunho (não envia nada).
- Registo de atividade: acessos, aprovações, exportações, validações e alterações aos dados mestre.

## Próximas fases

1. Servidor: autenticação, base de dados, ficheiros, cópias de segurança (alojamento UE).
2. IA de leitura (tech pack PDF/PowerPoint em inglês/francês, encomenda Excel) com processamento na UE.
3. Exportação para Google Sheets (conta Google da empresa).
4. Afinar o formato das folhas com as fichas reais da Pereira & Cruz.
