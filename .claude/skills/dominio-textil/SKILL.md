---
name: dominio-textil
description: Conhecimento do negócio de confeção têxtil desta empresa — glossário, fluxo de produção, regras de custos e preços, clientes, lavandaria, fichas técnicas e boas práticas de ERP têxtil. Usar antes de mexer em fichas, encomendas, custos, compras, prazos, produção ou documentos, e para validar se uma regra faz sentido.
---

# Domínio: confeção têxtil (Pereira & Cruz / Pereira's Project)

## Quem faz o quê
- **Pereira's Project (PP)**: vende, compra (tecidos, acessórios — tudo, mesmo quando a ficha antiga diz «Pereira & Cruz»),
  coordena prazos, lavandaria, acabamento, embalamento, guias e faturas. Guias para todos exceto a P&C (mesma morada).
  Viatura nas guias: «V/ viatura» se o fornecedor/cliente levanta; «BD-35-HS» se somos nós a levar.
- **Pereira & Cruz (PC)**: corte, confeção e revista. Linha com ~20 pessoas; horário 8h–12h e 13h–17h10; custo/hora da
  fábrica ~250–265 €/h (folha de salários + custos gerais).
- **Clothius**: lavandaria (ganga, à peça) e tinturaria (sarja, ao kg). **Hugo Gomes**: bordados. **Neivacor**: estampados.
  **Paulo e Marta**: embalamento. Fornecedores: FJ Magalhães (Sarja PPT pronto a tingir), Sidogras, Louropel, Botifechos, Fibratex…

## Fluxo de uma encomenda
1. Encomenda do cliente (PDF ou Excel; varia por cliente) → modelos, variantes (cor/lavagem), tamanhos, quantidades,
   pré-encomenda vs stock, preço por peça. Mesma cor partida em várias linhas → juntar numa variante.
2. Tech pack (ou **OF em PDF** para clientes sem tech pack, ex.: Simão & Olgando, GBTX) → ficha de produção.
3. Ficha por variante: produto (corte e confeção), embalamento, lavandaria, bordador/estampador, medidas.
   Materiais com consumo por peça; linha de coser só cor e fornecedor (sem consumo).
4. Aprovar → exportar (Excel/PDF/Google Sheets) → produção: corte → confeção → fase final → revista → lavandaria →
   acabamento → embalamento → packing list (caixas: ~20 calças adulto, ~40 criança; peso por modelo) → guia → fatura.
5. Planeamento da linha (Excel PLAN_RENT → página Produção): estados 01 Espera tecido … 18 Faturado, prioridade,
   entrega pedida / prevista / comunicada / real, «dar fora» (CONF; CONF + ACAB + Revista).

## Regras que a aplicação garante
- Tecido do tech pack nunca copiado sem equivalência ou decisão registada; divergências do tech pack registadas com justificação.
- Totais calculados; aprovação antes de exportar; alteração depois de aprovada → nova aprovação (produção não conta).
- IDs: encomenda E26-082, modelo E26-082-3; o nº interno é o elo entre fichas, planeamento e pesquisa.
- Quebra nas compras: 5 % tecido e acessórios (editável por encomenda), arredondado para cima.
- Prazos: 4 semanas habituais (depende do modelo, lavagem e planeamento anterior); etapas Materiais 24, Corte 21,
  Confeção 12, Lavandaria 6, Embalamento 2 dias antes da entrega.

## Custos e preço (pré-orçamentação)
- Ficha de custo: Descrição · Unidade · Consumo · Valor unitário · Total; consumos/valores aceitam fórmulas (3/32, 140.8/1000).
- **Corte e confeção numa linha** (ainda não há custo de corte por modelo); separar só com confeção fora.
- Materiais e serviços → PP; corte, confeção, revista → PC; também FORA (subcontratado) e CLIENTE (fornecido pelo cliente).
- N/ comissão: fixa por peça (Imprevu 3,00 €, GBTX 2,25 €) ou % sobre o custo (outros ~20 %; Longratex pouco).
- Agente: % sobre (custo + N/ comissão), ou € por peça; fichas antigas com % só sobre o custo mantêm-se. Imprevu já sem agente.
- Objetivo 25 % de margem **sobre o custo**; o preço final é decidido à mão (a app sugere regra do cliente e objetivo).
- Plano de corte = metros de plano ÷ peças por plano; tecido confirmado nos **mini planos**. Calção vaqueiro ~0,7 m × 4,10 €.
- Acessórios: chino → botão de massa (40,85 €/milheiro); vaqueiro → molas (meses) / botão (anos) + 3 rebites; ambos botões de elástico.
- Lavandaria Clothius: ganga à peça por grupo (A top/calção/saia curta, B calça/bermuda/camisa manga curta, C casaco/camisa,
  criança); sarja ao kg = labdip (branco, clara, média, escura, preto, especial) × peso do modelo; GOTS +15 %; amostras mín. 1 kg.

## Clientes (ver `docs/clientes/`)
Imprevu (FR; coleções SS/FW; tech pack; fichas de custo com N/ comissão), Longratex/Patachou (criança, Oeko-Tex/REACH,
etiqueta de marca e hangtag fornecidas), Dr. Collectors, GBTX, Simão & Olgando (ALEC; OF em PDF), T's in the Box,
Sergil, Head Jeans, Mermaid Cotton, Perfect Jeans, Dacon, CM Borges… O formato dos documentos varia por cliente.

## Glossário
**Tech pack** — dossiê técnico do cliente (desenho, medidas, materiais). **OF** — ordem de fabrico (do cliente ou interna).
**Ficha de produção/produto** — documento interno para a fábrica. **Variante** — cor/lavagem de um modelo. **Escala** — tamanhos
(letras, cintura 25–32, bebé 6M–8Y). **Consumo** — quantidade por peça. **Largura útil** — largura de tecido aproveitável.
**Plano/risco de corte**, **mini planos** — estudo de encaixe e consumo. **Encolhimento** — teste/espera antes do corte.
**Fase final da linha** — remates/acabamento na linha. **Revista** — controlo de qualidade. **Labdip** — amostra de cor
aprovada. **Lavagem vs tingimento vs secos** (bigodes, jatos, rotos). **Hangtag**, **etiqueta de composição**, **saco**,
**autocolante**. **Produto acabado vs a feitio** (CMT). **Dar fora** — subcontratar. **Pré-encomenda / stock**.
**Packing list** — caixas por envio. **Guia de transporte** — documento AT do transporte. **N/ comissão** — margem da PP.

## Boas práticas de ERP têxtil (referência)
- Matriz **estilo · cor · tamanho** em tudo (encomenda, ficha, compras, packing): quantidades sempre por tamanho.
- **BOM** (lista de materiais) por variante com consumo e quebra; compras = consumo × peças × (1 + quebra).
- Tempos por operação (**SAM/SMV**) e **eficiência** = minutos padrão produzidos ÷ minutos disponíveis — base para
  capacidade, custo e prazos (hoje a fábrica estima horas pelo valor da encomenda ÷ custo/hora).
- Rastreabilidade do lote (OF) por fase; estado sempre atual; datas prevista vs comunicada vs real para medir o cumprimento.
- Qualidade: aprovação de amostra/protótipo e labdip antes da produção; inspeção na linha e na revista; normas
  Oeko-Tex/REACH (criança), GOTS quando pedido.
Validar com a fábrica antes de transformar uma boa prática genérica em regra da aplicação.
