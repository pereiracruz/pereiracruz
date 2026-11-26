import type {
  AcessorioCliente, Atividade, ClienteCfg, Destinatario, Encomenda, Equivalencia, Escala, Fornecedor, Lavagem,
  LinhaCusto, LinhaMaterial, Medida, Modelo, Pedido, PrecoHistorico, PrecoRef, Tecido, Variante, PrecoTingimento, PrecoLavagem,
} from '../types'
import { distribuir } from '../lib/calc'
import { slug } from '../lib/format'

// ======================= Dados mestre =======================
export const fornecedores: Fornecedor[] = [
  { id: 'f1', nome: 'Troficolor', tipo: 'Tecido', fornece: 'Hempcot, Rustic, Adair, Dinant, Adotrec' },
  { id: 'f2', nome: 'Somelos', tipo: 'Tecido', fornece: 'Varadero' },
  { id: 'f3', nome: 'FJ Magalhães', tipo: 'Tecido', fornece: 'Cânhamo, Fleeming Ecru, Foster, Gigio, Sarja PPT' },
  { id: 'f4', nome: 'Traços Reguilas', tipo: 'Forro', fornece: 'Forro 65% / 35%' },
  { id: 'f5', nome: 'Realfio / Crafil', tipo: 'Acessórios', fornece: 'Linha' },
  { id: 'f6', nome: 'Paulo Araújo', tipo: 'Acessórios', fornece: 'Elástico, botões, cordões, terminais' },
  { id: 'f7', nome: 'Louropel', tipo: 'Acessórios', fornece: 'Molas' },
  { id: 'f8', nome: 'Fibratex', tipo: 'Acessórios', fornece: 'Etiqueta de composição' },
  { id: 'f9', nome: 'Etisatos', tipo: 'Acessórios', fornece: 'Etiqueta de tamanho, "Teddy Forever"' },
  { id: 'f10', nome: 'Nastrotex', tipo: 'Acessórios', fornece: 'Fitas de nastro' },
  { id: 'f11', nome: 'Plásrio / Plasbritos', tipo: 'Embalagem', fornece: 'Sacos' },
  { id: 'f12', nome: 'Hugo Carneiro', tipo: 'Acessórios', fornece: 'Hangtag, etiqueta de couro' },
  { id: 'f13', nome: 'Amazon', tipo: 'Embalagem', fornece: 'Autocolantes' },
  { id: 'f14', nome: 'Clothius', tipo: 'Serviço externo', fornece: 'Lavandaria e tingimento' },
  { id: 'f15', nome: 'Hugo Gomes', tipo: 'Serviço externo', fornece: 'Bordados' },
  { id: 'f16', nome: 'Neivacor', tipo: 'Serviço externo', fornece: 'Estampados' },
  { id: 'f17', nome: 'Sidogras', tipo: 'Tecido', fornece: 'Denim e veludo (indicados pela Imprevu)' },
  { id: 'f18', nome: 'Botifechos', tipo: 'Acessórios', fornece: 'Fechos' },
  { id: 'f19', nome: 'Staples', tipo: 'Embalagem', fornece: 'Autocolantes' },
]

export const tecidos: Tecido[] = [
  { id: 't1', nome: 'Adotrec', fornecedor: 'Troficolor', composicao: '100% CO', larguraUtil: 'A confirmar' },
  { id: 't2', nome: 'Hempcot', fornecedor: 'Troficolor', composicao: '55% CA 45% CO', larguraUtil: '145 cm' },
  { id: 't3', nome: 'Rustic', fornecedor: 'Troficolor', composicao: '100% CO', larguraUtil: '150 cm' },
  { id: 't4', nome: 'Adair', fornecedor: 'Troficolor', composicao: '100% CO', larguraUtil: '148 cm' },
  { id: 't5', nome: 'Dinant', fornecedor: 'Troficolor', composicao: '98% CO 2% EA', larguraUtil: '140 cm' },
  { id: 't6', nome: 'Varadero', fornecedor: 'Somelos', composicao: '100% CO', larguraUtil: '150 cm' },
  { id: 't7', nome: 'Cânhamo', fornecedor: 'FJ Magalhães', composicao: '100% CA', larguraUtil: '148 cm' },
  { id: 't8', nome: 'Fleeming Ecru', fornecedor: 'FJ Magalhães', composicao: '100% CO', larguraUtil: '150 cm', precoM: 4.5 },
  { id: 't9', nome: 'Forro 65% / 35%', fornecedor: 'Traços Reguilas', composicao: '65% PES 35% CO', larguraUtil: '150 cm' },
  { id: 't10', nome: 'PCRL P707 1020 washed', fornecedor: 'Sidogras', composicao: 'A confirmar', larguraUtil: 'A confirmar' },
  { id: 't11', nome: 'PECO P705 washed B', fornecedor: 'Sidogras', composicao: 'A confirmar', larguraUtil: 'A confirmar' },
  { id: 't12', nome: 'PCRL P707 1045 washed', fornecedor: 'Sidogras', composicao: 'A confirmar', larguraUtil: 'A confirmar' },
  { id: 't13', nome: 'PCRL P2019-00 50', fornecedor: 'Sidogras', composicao: 'A confirmar', larguraUtil: 'A confirmar' },
  { id: 't14', nome: 'Sarja PPT', fornecedor: 'FJ Magalhães', composicao: '97% CO 3% EL', larguraUtil: 'A confirmar' },
]

export const equivalencias: Equivalencia[] = [
  { id: 'e1', tecidoCliente: 'Casmik ART 52129 · 55% CO 45% LYO · 10,25 oz', tecidoCasa: 'Adotrec (Troficolor)', ondeUsou: 'Chemise Janet · acid wash', estado: 'A confirmar' },
  { id: 'e2', tecidoCliente: 'Casmik / Jove TAIF ECRU · 100% CO · 285 g', tecidoCasa: 'Fleeming Ecru (FJ Magalhães)', ondeUsou: 'Shirt Mao · ecru (ficha de custo)', estado: 'A confirmar' },
]

export const lavagens: Lavagem[] = [
  { id: 'l1', sufixo: 'AW', nome: 'Acid wash', cliente: 'Imprevu', codigo: 'A definir com a Clothius' },
  { id: 'l2', sufixo: 'MB', nome: 'Medium blue', cliente: 'Imprevu', codigo: 'A definir com a Clothius' },
  { id: 'l3', sufixo: 'LB', nome: 'Light blue', cliente: 'Imprevu', codigo: 'A definir com a Clothius' },
  { id: 'l4', sufixo: 'VI', nome: 'Vintage', cliente: 'Imprevu', codigo: 'A definir com a Clothius' },
  { id: 'l5', sufixo: 'WH', nome: 'Natural', cliente: 'Imprevu', codigo: 'A definir com a Clothius' },
  { id: 'l6', sufixo: '80', nome: '80s wash', cliente: 'Imprevu', codigo: 'A definir com a Clothius' },
  { id: 'l7', sufixo: 'LI', nome: 'Rayure', cliente: 'Imprevu', codigo: 'A definir com a Clothius' },
  { id: 'l8', sufixo: '—', nome: 'Army Green', cliente: 'Dr. Collectors', codigo: 'E503011/KX01 opção A' },
  { id: 'l9', sufixo: '—', nome: 'Smoke Black', cliente: 'Dr. Collectors', codigo: 'Preto direto' },
  { id: 'l10', sufixo: '—', nome: 'Off White', cliente: 'Dr. Collectors', codigo: 'Lavagem vintage 100001.26' },
  { id: 'l11', sufixo: '—', nome: 'Terracotta', cliente: 'Dr. Collectors', codigo: 'M701493/KX01 opção A' },
  { id: 'l12', sufixo: '—', nome: 'Steel', cliente: 'Dr. Collectors', codigo: 'M503810/KX01 opção A' },
  ...([['000', 'White'], ['313', 'Light blue'], ['852', 'Brown'], ['656', 'Ocean green'], ['120', 'Bege'], ['360', 'Marine'], ['391', 'Multicolor']] as const)
    .map(([c, n], i) => ({ id: `l${13 + i}`, sufixo: c, nome: `Tingimento ${n}`, cliente: 'Longratex', codigo: 'Sem código (tingimento na Clothius)' })),
]

export const acessoriosCliente: AcessorioCliente[] = [
  { id: 'a1', cliente: 'Imprevu', item: 'Etiqueta tecida "Imprevu"', fornecedor: 'Enviada pela cliente', consumo: '1 por peça' },
  { id: 'a2', cliente: 'Imprevu', item: 'Hangtag', fornecedor: 'Enviada pela cliente', consumo: '1 por peça' },
  { id: 'a3', cliente: 'Imprevu', item: 'Etiqueta de couro azul', fornecedor: 'Hugo Carneiro', consumo: '1 por peça' },
  { id: 'a4', cliente: 'Imprevu', item: 'Molas de madrepérola', fornecedor: 'Louropel', consumo: '8 por camisa' },
  { id: 'a5', cliente: 'Dr. Collectors', item: 'Etiqueta "Teddy Forever"', fornecedor: 'Etisatos', consumo: '1 por peça' },
  { id: 'a6', cliente: 'Dr. Collectors', item: 'Fita de nastro (7 × 1,5 cm)', fornecedor: 'Nastrotex', consumo: '1 por peça' },
  { id: 'a7', cliente: 'Dr. Collectors', item: 'Fita de nastro (14 × 2,5 cm)', fornecedor: 'Nastrotex', consumo: '1 por peça' },
  { id: 'a8', cliente: 'Longratex', item: 'Etiqueta de marca Patachou', fornecedor: 'Enviada pela cliente', consumo: '1 por peça' },
  { id: 'a9', cliente: 'Longratex', item: 'Hangtag', fornecedor: 'Enviada pela cliente', consumo: '1 por peça' },
]

export const LETRAS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
export const CINTURA = ['25', '26', '27', '28', '29', '30', '31', '32']
export const BEBE = ['6M', '9M', '12M', '18M', '2Y', '3Y', '4Y', '5Y', '6Y', '8Y']
export const escalas: Escala[] = [
  { id: 's1', nome: 'Letras', tamanhos: LETRAS, usadaEm: 'Camisas, casacos, calças com elástico' },
  { id: 's2', nome: 'Cintura', tamanhos: CINTURA, usadaEm: 'Denim e calções (Imprevu)' },
  { id: 's3', nome: 'Comprimento de perna', tamanhos: ['L32', 'L34'], usadaEm: 'Denim (Imprevu)' },
  { id: 's4', nome: 'Bebé e criança', tamanhos: BEBE, usadaEm: 'Longratex' },
]

export const destinatarios: Destinatario[] = [
  { id: 'd1', folha: 'produto', nome: 'Escritório', contacto: 'Sofia · Gilmar' },
  { id: 'd2', folha: 'corte', nome: 'Corte e confeção', contacto: 'Corte · Confeção' },
  { id: 'd3', folha: 'lavandaria', nome: 'Clothius', contacto: 'Lavandaria' },
  { id: 'd4', folha: 'bordador', nome: 'Hugo Gomes', contacto: 'Bordados' },
  { id: 'd5', folha: 'estampador', nome: 'Neivacor', contacto: 'Estampados' },
  { id: 'd6', folha: 'embalamento', nome: 'Embalamento', contacto: 'Pereira & Cruz' },
  { id: 'd7', folha: 'packing', nome: 'Expedição', contacto: 'Packing list' },
  { id: 'd8', folha: 'medidas', nome: 'Modelista', contacto: 'Pereira & Cruz' },
]


// ---------------- Tabelas de preços da Clothius (tingimento e lavandaria), enviadas pela Pereira's Project ----------------
/** Tabela de tingimento de 01/04/2023. Inclui anti-pilling; GOTS +15 %; amostras faturadas com mínimo de 1 kg. */
export const TINGIMENTO_DATA = '01/04/2023'
export const precosTingimento: PrecoTingimento[] = ([
  ['Reativo', 7.5, 2.25, 2.85, 3.2, 3.55, 3.75, 4.1],
  ['Direto', 7.5, null, 2.85, 3.2, 3.55, 3.75, 4.1],
  ['Poliamida', 7.5, 2.55, 2.85, 3.2, 3.55, 3.75, 4.1],
  ['Acrílico', 7.5, 2.65, 2.95, 3.3, 3.7, 3.75, 4.2],
  ['2 Fibras', 7.5, 2.9, 4.95, 5.65, 6.75, 7.0, null],
  ['Retro Dye', 10, null, 4.35, 4.6, 4.8, 5.05, 6.0],
  ['Retro Dye Especial', 10, null, 4.6, 5.0, 5.15, 5.65, 6.6],
  ['Vegetal', 10, null, 5.7, 6.0, 6.3, 6.6, 7.5],
  ['Pigmentos', 10, null, 5.0, 5.0, 5.5, 5.5, 7.2],
  ['Sedas', 10, 5.05, 9.85, 11.3, 12.25, 13.95, 15.0],
] as [string, ...(number | null)[]][]).map(([tipo, amostras, branco, claras, medias, escuras, preto, especiais], i): PrecoTingimento => ({ id: `ting${i + 1}`, tipo, amostras, branco, claras, medias, escuras, preto, especiais }))
  .concat([
    { id: 'ting11', tipo: 'Pigmentos verdadeiros', amostras: null, branco: null, claras: null, medias: null, escuras: null, preto: null, especiais: null, nota: '7,20 €/kg (FX)' },
    { id: 'ting12', tipo: 'Tingimento termosensível', amostras: null, branco: null, claras: null, medias: null, escuras: null, preto: null, especiais: null, nota: '36,00 €/kg' },
    { id: 'ting13', tipo: 'Moffo', amostras: null, branco: null, claras: 8.05, medias: 8.05, escuras: 8.05, preto: 8.05, especiais: 8.05, nota: '8,05 €/kg todas as cores' },
    { id: 'ting14', tipo: 'Meio branco · descarregar cor', amostras: null, branco: 1.45, claras: null, medias: null, escuras: null, preto: null, especiais: null, nota: '1,45 €/kg' },
  ])

/** Tabela de lavandaria ganga/tecidos (molhados e secos), € por peça. Grupo A: top, calção, saia curta; B: calça, vestido curto,
 * bermudas, saia comprida, camisa manga curta, jardineira curta; C: parka, blusão, gabardina, vestido comprido, sweatshirt, camisa, jardineira comprida. */
export const precosLavagem: PrecoLavagem[] = ([
  ['Lavagem', 'Desencolado', 0.3, 0.4, 0.45, 0.55],
  ['Lavagem', 'Lavagem normal', 0.25, 0.3, 0.4, 0.5],
  ['Lavagem', 'Anti-pilling', 0.55, 0.8, 0.8, 1.0],
  ['Lavagem', 'Anti-óleo', 0.25, 0.3, 0.45, 0.5],
  ['Lavagem', 'Lavagem normal c/ silicone', 0.45, 0.55, 0.55, 0.75],
  ['Lavagem', 'Stone wash', 0.6, 0.75, 0.85, 1.1],
  ['Lavagem', 'Super stone wash', 0.7, 1.0, 1.2, 1.6],
  ['Lavagem', 'Stone bleach', 0.75, 1.0, 1.2, 1.7],
  ['Lavagem', 'Super stone bleach', 1.0, 1.35, 1.55, 2.15],
  ['Lavagem', 'Trapo / fade out', null, 1.2, 1.8, 2.4],
  ['Lavagem', 'Cubos', null, 1.8, 2.4, 3.0],
  ['Lavagem', 'Tencel stone wash', null, 1.4, 1.8, 2.2],
  ['Lavagem', 'Tencel stone bleach', null, 1.95, 2.2, 2.55],
  ['Lavagem', 'Resina integral total', 1.2, 1.2, 1.2, 1.2],
  ['Lavagem', 'Resina spray total', 1.6, 1.6, 1.6, 1.6],
  ['Lavagem', 'Mergulho permanganato', null, 2.1, 2.1, 2.1],
  ['Lavagem', 'Over dye', 0.45, 0.6, 0.85, 1.1],
  ['Secos', 'Bigodes lixa 1 (frente)', 0.5, 0.75, 0.85, 1.4],
  ['Secos', 'Bigodes lixa 2 (frente/trás)', 0.75, 0.85, 1.1, 1.8],
  ['Secos', 'Jato lixa 1 (frente e trás)', 0.7, 0.8, 0.9, 1.45],
  ['Secos', 'Jato lixa 2 (total)', 0.8, 1.0, 1.2, 1.8],
  ['Secos', 'Jato areia 1 (frente/trás)', 0.75, 0.75, 0.85, 1.1],
  ['Secos', 'Jato químico 1 (frente/trás)', 0.5, 0.6, 0.85, 1.2],
  ['Secos', 'Jato químico 2 (integral c/ trincha)', 0.6, 0.75, 1.2, 1.8],
  ['Secos', 'Jato químico 3 (total c/ trincha)', 0.75, 1.0, 1.8, 2.2],
  ['Secos', 'Bigodes 3D 1 (só frente)', 1.5, 1.5, 1.5, 1.5],
  ['Secos', 'Bigodes 3D 2 (frente e joelho)', 2.1, 2.1, 2.1, 2.1],
  ['Secos', 'Bigodes 3D 3 (frente, trás e joelho)', 2.7, 2.7, 2.7, 2.7],
  ['Secos', 'Krinkel', 0.5, 0.6, 0.75, 1.2],
  ['Secos', 'Estrias', 0.5, 0.6, 0.75, 1.2],
  ['Secos', 'Pinos (cada)', 0.15, 0.15, 0.15, 0.15],
  ['Secos', 'Roto 1 (bolsos/bainhas)', 0.5, 0.5, 0.5, 0.7],
  ['Secos', 'Roto 2 (bolsos e bainhas + 2R)', 0.75, 0.75, 0.75, 0.75],
  ['Secos', 'Roto 3 (bolsos e bainhas + 4R)', 0.9, 0.9, 0.9, 0.9],
  ['Secos', 'Abraçadeiras (cada)', 0.3, 0.3, 0.3, 0.3],
] as ['Lavagem' | 'Secos', string, ...(number | null)[]][]).map(([seccao, descricao, crianca, grupoA, grupoB, grupoC], i): PrecoLavagem => ({ id: `lav${i + 1}`, seccao, descricao, crianca, grupoA, grupoB, grupoC }))
/* Sujeito a orçamento (não entram na tabela): stone bleach ao kg, coating, bigodes lixa 3, jato areia 2, rotos especiais,
   cores especiais, acabamentos especiais (silicone, antioxidante, cheiro…), tingimento degradé (t-shirt 2,10/4,20 €, sweat 3,85/7,70 €). */

export const precosRef: PrecoRef[] = [
  { id: 'p1', linha: 'Corte', valor: 0.5, unidade: 'por peça', origem: 'Ficha de custo Shirt Mao' },
  { id: 'p2', linha: 'Plano de corte', valor: 2.6, unidade: 'por m (0,065 por peça)', origem: 'Ficha de custo Shirt Mao' },
  { id: 'p3', linha: 'Confeção · camisa com gola mao', valor: 14, unidade: 'por peça', origem: 'Ficha de custo Shirt Mao' },
  { id: 'p4', linha: 'Confeção · calça 5 bolsos', valor: 8.5, unidade: 'por peça (corte e confeção)', origem: 'Reunião de 30/09' },
  { id: 'p5', linha: 'Acabamento', valor: 2.2, unidade: 'por peça', origem: 'Ficha de custo Shirt Mao' },
  { id: 'p6', linha: 'Revista', valor: 0.15, unidade: 'por peça', origem: 'Ficha de custo Shirt Mao' },
  { id: 'p7', linha: 'Lavandaria · lavagem simples', valor: 0.55, unidade: 'por peça', origem: 'Ficha de custo Shirt Mao' },
  { id: 'p8', linha: 'Bordado do peito', valor: 0.34, unidade: 'por peça', origem: 'Ficha de custo Shirt Mao' },
  { id: 'p9', linha: 'Corte (Longratex)', valor: 0.25, unidade: 'por peça', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p10', linha: 'Plano de corte (Longratex)', valor: 2.5, unidade: 'por m de plano ÷ peças por plano', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p11', linha: 'Confeção · calça 5 bolsos (criança)', valor: 7, unidade: 'por peça', origem: 'Ficha de custo Longratex SS27' },
  { id: 'p12', linha: 'Confeção · calção chino (criança)', valor: 7, unidade: 'por peça', origem: 'Ficha de custo Longratex SS27' },
  { id: 'p13', linha: 'Confeção · calção vaqueiro (criança)', valor: 6.25, unidade: 'por peça', origem: 'Ficha de custo Longratex SS27' },
  { id: 'p14', linha: 'Forro', valor: 1.4, unidade: 'por m', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p15', linha: 'Lavandaria Clothius', valor: 3.5, unidade: 'por kg (3,50–4,10)', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p16', linha: 'Fecho', valor: 0.199, unidade: 'por peça', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p17', linha: 'Botões de elástico', valor: 0.012, unidade: 'por unidade', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p18', linha: 'Botão latão ref. 0335', valor: 0.07, unidade: 'por unidade (70 € o milheiro)', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p19', linha: 'Molas latão ref. 0481B', valor: 0.1408, unidade: 'por unidade (140,80 € o milheiro)', origem: 'Ficha de custo Longratex SS27' },
  { id: 'p20', linha: 'Bordado (criança)', valor: 0.3, unidade: 'por peça (0,30–0,35)', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p21', linha: 'Elástico', valor: 0.12, unidade: 'por m (0,12–0,15)', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p22', linha: 'Saco de embalamento', valor: 0.01585, unidade: 'por peça (31,70 € / 2000)', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p23', linha: 'Saco da etiqueta', valor: 0.01, unidade: 'por peça', origem: 'Fichas de custo Longratex SS27' },
  { id: 'p24', linha: 'Acabamento (Longratex)', valor: 1, unidade: 'por peça', origem: 'Fichas de custo Longratex SS27' },
]

/** Ficha de custo-modelo da Pereira & Cruz (as 15 linhas das fichas de custo atuais), com valores de referência. */
/**
 * Ficha-modelo. Corte e confeção numa só linha (só se separam quando a confeção é feita fora).
 * Ganga (vaqueiro): lava-se, à peça; molas nos tamanhos de meses, botão nos de anos, 3 rebites.
 * Sarja (chino): tinge-se, ao kg conforme o labdip; botão de massa. Ambos levam botões de elástico.
 */
export function linhasModeloPC(tipoPeca: string, tecido: 'Ganga' | 'Sarja' | 'Outro' = 'Outro'): LinhaCusto[] {
  const calcao = /cal[çc][õo]es|cal[çc][ãa]o/i.test(tipoPeca)
  const ganga = tecido === 'Ganga', sarja = tecido === 'Sarja'
  const L = (descricao: string, unidade: string, consumo: number, valor: number, origem: LinhaCusto['origem'], extra: Partial<LinhaCusto> = {}): LinhaCusto =>
    ({ id: `c${Math.random().toString(36).slice(2, 8)}`, descricao, unidade, consumo, valor, origem, ...extra })
  return [
    L('Corte e confeção - Pereira & Cruz', '€', 1, calcao ? 6.5 : 7.25, 'Confirmar', { nota: 'Corte e confeção juntos (valor de referência: confirmar para este modelo). Separar só se a confeção for feita fora.' }),
    L("Plano de corte - Pereira's Project", '€', 3 / 32, 2.5, 'Segura', { consumoExpr: '3/32', nota: 'Metros de plano ÷ peças por plano.' }),
    L('Forro', '€', 0.2, 1.4, 'Segura'),
    ganga && calcao
      ? L('Tecido', 'mts', 0.7, 4.1, 'Estimada', { nota: 'Média por excesso (0,7 m × 4,10 €): confirmar nos mini planos.' })
      : L('Tecido', 'mts', 0.4, 4, 'Estimada', { nota: 'Confirmar tecido e preço por metro; consumo nos mini planos.' }),
    ganga ? L('Lavandaria - Clothius (lavagem normal)', 'un', 1, calcao ? 0.3 : 0.4, 'Estimada', { nota: `Ganga lava-se: à peça, grupo ${calcao ? 'A' : 'B'} da tabela Clothius. Escolher as lavagens e secos em «Tabela Clothius».` })
      : sarja ? L('Lavandaria - Clothius (tingimento reativo, cor média)', 'kg', 0.3, 3.2, 'Estimada', { nota: 'Sarja tinge-se: ao kg conforme o labdip × peso da peça. Confirmar cor e peso em «Tabela Clothius».' })
        : L('Lavandaria - Clothius', 'kg', 0.3, 3.5, 'Estimada', { nota: 'Ganga: à peça (lavagem). Sarja: ao kg conforme o labdip (tingimento).' }),
    ...(ganga ? [
      L('Molas (meses) / botão (anos)', '€', 1, 0.1408, 'Confirmar', { valorExpr: '140.8/1000', nota: 'Molas nos tamanhos de meses; botão (70 € o milheiro) nos tamanhos de anos.' }),
      L('Rebites', '€', 3, 0.082, 'Confirmar', { nota: '3 rebites (meses e anos).' }),
    ] : sarja ? [L('Botão de massa', '€', 1, 0, 'Confirmar', { nota: 'Preço do botão de massa por confirmar (diferente do botão do vaqueiro).' })]
      : [L('Botão / molas', '€', 1, 0.07, 'Confirmar', { valorExpr: '70/1000' })]),
    L('Botões elástico', '€', calcao ? 2 : 1, 0.012, 'Segura'),
    L('Fechos', '€', 1, 0.199, 'Segura'),
    L('Bordado', '€', 1, 0.3, 'Confirmar'),
    L('Elástico', 'mts', 0.5, 0.12, 'Confirmar'),
    L('Saco etiqueta', '€', 0, 0.01, 'Segura'),
    L('Saco embalamento', '€', 1, 31.7 / 2000, 'Segura', { valorExpr: '31.7/2000' }),
    L('Revista', '€', 1, 0.15, 'Segura'),
    L('Acabamento', '€', 1, 1, 'Segura'),
  ]
}

export const clientes: ClienteCfg[] = [
  { id: 'c1', nome: 'Imprevu', margemTipo: 'fixa', margem: 3, comissao: 0, idPrefixo: 'IMP' },
  { id: 'c2', nome: 'Dr. Collectors', margemTipo: 'fixa', margem: 3, comissao: 0, idPrefixo: 'DRC' },
  {
    id: 'c3', nome: 'Longratex', margemTipo: 'fixa', margem: 0, comissao: 0, idPrefixo: 'LGX', escala: 'Bebé e criança',
    notasFixas: [
      'Respeitar as normas Oeko-Tex e Reach: artigos de bebé e criança.',
      'Contraste com branco e cores claras: atenção à solidez da cor.',
      'Artigos para bebé com menos de 3 anos: isentos de formaldeídos (OEKO-TEX®).',
    ],
  },
]

// ======================= Helpers =======================
let n = 0
const lid = () => `m${++n}`
const mat = (p: Omit<LinhaMaterial, 'id' | 'unidade'> & { unidade?: 'm' | 'un' }): LinhaMaterial => ({ id: lid(), unidade: 'un', ...p })

const PESOS_CINTURA = [1, 2, 3, 3.5, 3.5, 3, 2, 1]

function variante(ref: string, nome: string, refCor: string, qtd: number[], preco: number, codigo = 'A definir com a Clothius'): Variante {
  return { id: slug(nome), ref, nome, refCor, codigoLavagem: codigo, qtdEncomenda: [...qtd], qtd: [...qtd], preco, fichaGerada: false }
}

function modeloVazio(p: Partial<Modelo> & Pick<Modelo, 'nome' | 'tipoPeca' | 'escala' | 'variantes'>): Modelo {
  return {
    id: slug(p.nome), descricao: p.tipoPeca.toUpperCase(), techPack: false, estado: 'sem-ficha',
    materiais: [], operacoes: [], observacoes: [], novasObservacoes: [], medidas: [], versoes: [], caixaMax: 20,
    ...p,
  }
}

// ======================= Encomenda Imprevu (exemplo para "Nova encomenda") =======================
export const MEDIDAS_JANET: Medida[] = [
  { ponto: 'Comprimento total', valores: [60, 61.5, 63, 64.5, 66], graduacao: '+1,5 / tam.', techPack: true },
  { ponto: 'Altura da gola mao', valores: [5, 5, 5, 5, 5], graduacao: 'fixa', techPack: true },
  { ponto: 'Meia largura do peito', valores: [50, 52, 54, 56, 58], graduacao: '+2 / tam.', techPack: true },
  { ponto: 'Largura dos ombros', valores: [43, 44.5, 46, 47.5, 49], graduacao: '+1,5 / tam.', techPack: false },
  { ponto: 'Comprimento da manga', valores: [23, 23.5, 24, 24.5, 25], graduacao: '+0,5 / tam.', techPack: false },
  { ponto: 'Largura da cava', valores: [21, 22, 23, 24, 25], graduacao: '+1 / tam.', techPack: false },
]

const W = (t: number) => distribuir(t, PESOS_CINTURA)

/** Encomenda Imprevu SS27 tal como sai da leitura do Excel (sem fichas). */
export function encomendaImprevu(id = 'imprevu-ss27'): Encomenda {
  const L5 = LETRAS.slice(0, 5)
  return {
    id, cliente: 'Imprevu', colecao: 'SS27', modoServico: 'Produto acabado',
    entrega: '2026-11-30', criadaEm: new Date().toISOString().slice(0, 10), estado: 'Em revisão',
    preEncomenda: 1225, stock: 132, ficheiros: ['PEREIRACRUZ_SS27.xlsx', 'SHIRT MAO.pdf'],
    modelos: [
      modeloVazio({
        nome: 'Chemise Janet', alias: 'Shirt Mao', tipoPeca: 'Camisa', descricao: 'CAMISA', escala: L5, techPack: true,
        variantes: [
          variante('7E27JANETAW', 'Acid wash', 'AZUL · ACID WASH', [11, 13, 13, 9, 3], 34.89),
          variante('7E27JANETMB', 'Medium blue', 'AZUL MÉDIO', [3, 6, 6, 5, 3], 34.89),
        ],
      }),
      modeloVazio({ nome: 'Short Bradley', tipoPeca: 'Calções', escala: CINTURA, variantes: [variante('7E27BRADAW', 'Acid wash', 'ACID WASH', W(31), 21.48)] }),
      modeloVazio({ nome: 'Bermuda Lison', tipoPeca: 'Calções', escala: CINTURA, variantes: [
        variante('7E27LISONAW', 'Acid wash', 'ACID WASH', W(89), 27.97),
        variante('7E27LISONMB', 'Medium blue', 'MEDIUM BLUE', W(41), 27.97),
        variante('7E27LISONWH', 'Natural', 'NATURAL', W(35), 27.97),
      ] }),
      modeloVazio({ nome: 'Denim Lexi', tipoPeca: 'Calças', escala: CINTURA, variantes: [
        variante('7E27LEXIVI32', 'Vintage · L32', 'VINTAGE', W(42), 26.08),
        variante('7E27LEXIVI34', 'Vintage · L34', 'VINTAGE', W(66), 26.08),
      ] }),
      modeloVazio({ nome: 'Denim Rio', tipoPeca: 'Calças', escala: CINTURA, variantes: [
        variante('7E27RIOAW', 'Acid wash', 'ACID WASH', W(14), 33.53),
        variante('7E27RIOMB', 'Medium blue', 'MEDIUM BLUE', W(149), 33.48),
        variante('7E27RIOWH', 'Natural', 'NATURAL', W(93), 28.37),
      ] }),
      modeloVazio({ nome: 'Denim Melody', tipoPeca: 'Calças', escala: CINTURA, variantes: [
        variante('7E27MELAW', 'Acid wash', 'ACID WASH', W(23), 24.37),
        variante('7E27MELLB', 'Light blue', 'LIGHT BLUE', W(14), 25.22),
        variante('7E27MELVI', 'Vintage', 'VINTAGE', W(91), 27.68),
        variante('7E27MELWH', 'Natural', 'NATURAL', W(67), 24.38),
      ] }),
      modeloVazio({ nome: 'Denim Roxy', tipoPeca: 'Calças', escala: CINTURA, variantes: [
        variante('7E27ROX80', '80s wash', '80S WASH', W(115), 26.94),
        variante('7E27ROXLB', 'Light blue', 'LIGHT BLUE', W(79), 25.23),
        variante('7E27ROXLI', 'Rayure', 'RAYURE', W(31), 26.67),
        variante('7E27ROXMB', 'Medium blue', 'MEDIUM BLUE', W(9), 25.23),
        variante('7E27ROXWH', 'Natural', 'NATURAL', W(59), 25.3),
      ] }),
      modeloVazio({ nome: 'Denim Swiggy', tipoPeca: 'Calças', escala: CINTURA, variantes: [
        variante('7E27SWILB32', 'Light blue · L32', 'LIGHT BLUE', W(31), 26.08),
        variante('7E27SWILB34', 'Light blue · L34', 'LIGHT BLUE', W(67), 26.08),
        variante('7E27SWIMB32', 'Medium blue · L32', 'MEDIUM BLUE', W(35), 23.3),
        variante('7E27SWIMB34', 'Medium blue · L34', 'MEDIUM BLUE', W(104), 23.3),
      ] }),
    ],
  }
}

/** Resultado (simulado) da leitura do tech pack SHIRT MAO.pdf. */
export interface CampoLido { campo: string; valor: string; pagina: string; confianca: 'alta' | 'media' | 'baixa' }
export interface DecisaoIA {
  id: 'tecido' | 'botoes' | 'variante'
  titulo: string; confianca: 'alta' | 'media' | 'baixa'; explicacao: string; fonte: string; porque: string
  alternativa: string
}
export const leituraShirtMao: { campos: CampoLido[]; decisoes: DecisaoIA[]; paginas: number } = {
  paginas: 7,
  campos: [
    { campo: 'Tecido pedido', valor: 'Casmik 52129 · 55% CO 45% LYO · 10,25 oz', pagina: 'pág. 4, etiqueta', confianca: 'alta' },
    { campo: 'Lavagem', valor: 'Acid wash', pagina: 'pág. 2 e 6', confianca: 'alta' },
    { campo: 'Bordado', valor: 'Peito · 3 cm · linha cognac', pagina: 'pág. 3', confianca: 'alta' },
    { campo: 'Gola', valor: 'Mao 5 cm · pesponto cada 1 cm', pagina: 'pág. 5', confianca: 'alta' },
    { campo: 'Botões', valor: 'Molas de madrepérola', pagina: 'pág. 7', confianca: 'media' },
    { campo: 'Medidas', valor: '3 cotas · sem tabela', pagina: 'pág. 3, desenho', confianca: 'baixa' },
  ],
  decisoes: [
    {
      id: 'tecido', titulo: 'Tecido: usar Adotrec (Troficolor) em vez do Casmik 52129', confianca: 'media',
      explicacao: 'O tech pack pede um tecido que não compramos. Na ficha anterior desta camisa usou-se o Adotrec.',
      fonte: 'Ficha de produto anterior · Shirt Mao',
      porque: 'A cliente indica o tecido da marca. A produção usa um equivalente nosso, e é o que a ficha de produto anterior da Shirt Mao já tinha.',
      alternativa: 'Escolher outro tecido',
    },
    {
      id: 'botoes', titulo: 'Botões: molas de madrepérola, 8 por camisa', confianca: 'alta',
      explicacao: 'O tech pack pede madrepérola. A ficha anterior dizia "molas de latão ref. 8100/10 mm".',
      fonte: 'Tech pack, pág. 7',
      porque: 'Quando o tech pack e a ficha anterior divergem num material, o tech pack manda. A alteração fica registada nas observações.',
      alternativa: 'Manter molas de latão',
    },
    {
      id: 'variante', titulo: 'Medium blue: mesma base do acid wash, outra lavagem', confianca: 'baixa',
      explicacao: 'O tech pack só descreve o acid wash. Há 23 peças de medium blue na encomenda.',
      fonte: 'Encomenda, 7E27JANETMB',
      porque: 'A referência da encomenda termina em MB (medium blue). Assume-se o mesmo modelo e tecido, com outra lavagem.',
      alternativa: 'Não gerar ficha do medium blue',
    },
  ],
}

/** Gera a ficha da Chemise Janet a partir das decisões tomadas. */
export function gerarFichaJanet(
  m: Modelo,
  d: { tecido: string; botoes: 'madreperola' | 'latao'; variante: boolean },
): Modelo {
  const madre = d.botoes === 'madreperola'
  const tecidoNome = d.tecido.toUpperCase()
  const tec = tecidos.find((t) => t.nome.toUpperCase() === tecidoNome)
  const hoje = new Date().toISOString().slice(0, 10)
  const versoes = [{ n: 1, titulo: 'gerada da encomenda e do tech pack', descricao: `${m.variantes.reduce((s, v) => s + v.qtd.reduce((a, b) => a + b, 0), 0)} peças por tamanho, desenho e bordado.`, data: hoje }]
  if (tecidoNome !== 'CASMIK') versoes.push({ n: 2, titulo: `tecido ${d.tecido}`, descricao: `Casmik substituído pelo tecido da Pereira & Cruz (decisão registada).`, data: hoje })
  versoes.push({ n: versoes.length + 1, titulo: madre ? 'molas de madrepérola' : 'molas de latão', descricao: madre ? 'Alteração de material: o tech pack manda sobre a ficha anterior. Fica no bloco «Novas observações».' : 'Mantidas as molas de latão da ficha anterior; divergência do tech pack justificada.', data: hoje })
  return {
    ...m,
    estado: 'rascunho',
    tecido: d.tecido,
    lavagem: 'Acid wash',
    variantes: m.variantes.map((v) => ({ ...v, fichaGerada: v.nome === 'Acid wash' ? true : d.variante })),
    materiais: [
      mat({ ref: tecidoNome, fornecedor: tec?.fornecedor ?? 'A confirmar', obs: '', consumo: 1.2, unidade: 'm', cor: 'Conforme variante', largura: tec?.larguraUtil ?? 'A confirmar', folha: 'tecido', divergencia: 'Tech pack: Casmik 52129', justificacao: 'Equivalente da Pereira & Cruz (tabela de equivalências).' }),
      mat({ ref: 'Linha', fornecedor: 'Crafil', obs: '', consumo: null, semConsumo: true, cor: 'PPT', folha: 'confecao' }),
      mat({ ref: 'Etiqueta de composição', fornecedor: 'Fibratex', obs: 'Costura lateral', consumo: 1, cor: 'Cetim', folha: 'confecao' }),
      madre
        ? mat({ ref: 'Molas de madrepérola', fornecedor: 'Louropel', obs: 'Ver amostra física', consumo: 8, cor: 'Pérola', folha: 'confecao' })
        : mat({ ref: 'Molas de latão ref. 8100/10 mm', fornecedor: 'Louropel', obs: 'Ver amostra física', consumo: 8, cor: 'Latão', folha: 'confecao', divergencia: 'Tech pack, pág. 7: molas de madrepérola', justificacao: '' }),
      mat({ ref: 'Etiqueta tecida "Imprevu"', fornecedor: 'Enviada pela cliente', obs: 'Ver amostra física', consumo: 1, cor: 'N/A', folha: 'confecao' }),
      mat({ ref: 'Etiqueta de couro azul', fornecedor: 'Hugo Carneiro', obs: 'Ver amostra física', consumo: 1, cor: 'Azul', folha: 'confecao' }),
      mat({ ref: 'Autocolante', fornecedor: 'Amazon', obs: 'Colado no saco', consumo: 1, cor: 'Branco', folha: 'embalamento' }),
      mat({ ref: 'Hangtag', fornecedor: 'Enviada pela cliente', obs: 'Ver amostra física', consumo: 1, cor: 'Branco', folha: 'embalamento' }),
      mat({ ref: 'Saco plástico', fornecedor: 'Plasbritos', obs: '', consumo: 1, cor: 'N/A', folha: 'embalamento' }),
    ],
    operacoes: [{ id: 'o1', tipo: 'Bordado', posicao: 'Peito esquerdo', medidas: '3 cm de altura · a 15 cm do HSP', fornecedor: 'Hugo Gomes', cor: 'Cognac' }],
    observacoes: [
      'Seguir amostra física.',
      'Lavagem: acid wash (ver código de lavagem).',
      'Gola mao de 5 cm · pesponto a cada 1 cm · linha cognac.',
      'Bordado: Peito · 3 cm de altura, a 15 cm do HSP · linha cognac.',
    ],
    novasObservacoes: madre ? ['Molas de madrepérola (não latão), como no tech pack.'] : [],
    medidas: MEDIDAS_JANET,
    medidasBase: 'M',
    versoes: versoes.reverse(),
  }
}

// ======================= Encomenda Dr. Collectors (concluída) =======================
function drc(): Encomenda {
  const pesosPeq = [0, 1, 2, 2, 1, 0, 0]
  const q = (t: number) => distribuir(t, pesosPeq)
  const v = (nome: string, cor: string, qtd: number[], codigo = '—') => ({ ...variante(`DRC-${slug(nome)}`, nome, cor, qtd, 0, codigo), fichaGerada: true })
  const base = (nome: string, desc: string, tecido: string, forn: string, larg: string, cor: string, extra: Partial<Modelo> = {}): Modelo => ({
    ...modeloVazio({
      nome, tipoPeca: desc.split(' ')[0], descricao: desc.toUpperCase(), escala: LETRAS, techPack: true,
      variantes: [v(cor, `${tecido.toUpperCase()} ${cor.toUpperCase()}`, q(extra.caixaMax ?? 0))],
    }),
    estado: 'enviada', tecido, aprovadaEm: '2026-08-20',
    materiais: [
      mat({ ref: tecido, fornecedor: forn, obs: '', consumo: 1.3, unidade: 'm', cor, largura: larg, folha: 'tecido' }),
      mat({ ref: 'Linha', fornecedor: 'Realfio', obs: '100% CO', consumo: null, semConsumo: true, cor: 'PPT', folha: 'confecao' }),
      mat({ ref: 'Etiquetas de composição', fornecedor: 'Fibratex', obs: '', consumo: 1, cor: 'Cetim', folha: 'confecao' }),
      mat({ ref: 'Etiquetas "Teddy Forever"', fornecedor: 'Etisatos', obs: 'Ver amostra física', consumo: 1, cor: 'N/A', folha: 'confecao' }),
      mat({ ref: 'Saco plástico', fornecedor: 'Plasbritos', obs: '', consumo: 1, cor: 'N/A', folha: 'embalamento' }),
    ],
    observacoes: ['Seguir amostra física.'],
    versoes: [{ n: 1, titulo: 'gerada da encomenda e do tech pack', descricao: 'Aprovada e enviada à produção.', data: '2026-08-14' }],
    ...extra,
  })
  const fix = (m: Modelo, total: number) => {
    const qtd = distribuir(total, pesosPeq)
    m.variantes = m.variantes.map((x) => ({ ...x, qtd: [...qtd], qtdEncomenda: [...qtd] }))
    return m
  }
  const p38 = base('P38', 'Calça com elástico', 'Cânhamo', 'FJ Magalhães', '148 cm', 'Off White', {
    lavagem: 'Off White',
    operacoes: [{ id: 'o1', tipo: 'Estampado', posicao: 'A definir', medidas: 'À espera das indicações', fornecedor: 'Neivacor', cor: 'A definir' }],
  })
  p38.nome = 'P38 · Calça com elástico'
  p38.variantes = [{ ...v('Off White', 'CÂNHAMO PPT', [0, 0, 6, 0, 0, 0, 0], 'Lavagem vintage 100001.26') }]
  p38.materiais.splice(1, 0,
    mat({ ref: 'Forro 65% / 35%', fornecedor: 'Traços Reguilas', obs: '', consumo: 0.4, unidade: 'm', cor: 'Bege', largura: '150 cm', folha: 'tecido' }),
  )
  p38.materiais.push(
    mat({ ref: 'Elástico 4 cm', fornecedor: 'Paulo Araújo', obs: 'Branco', consumo: 0.8, unidade: 'm', cor: 'Branco', folha: 'confecao' }),
    mat({ ref: 'Etiqueta em fita de nastro (7 × 1,5 cm)', fornecedor: 'Nastrotex', obs: 'Bolso traseiro direito', consumo: 1, cor: 'PPT', folha: 'confecao' }),
    mat({ ref: 'Etiqueta em fita de nastro (14 × 2,5 cm)', fornecedor: 'Nastrotex', obs: 'No cinto, com pesponto vermelho', consumo: 1, cor: 'PPT', folha: 'confecao' }),
  )
  p38.observacoes = ['Seguir amostra física.', 'À espera das indicações para o estampado.']
  p38.id = 'p38'

  const bord = (cor: string) => [{ id: 'o1', tipo: 'Bordado' as const, posicao: 'Peito', medidas: 'Ver amostra', fornecedor: 'Hugo Gomes', cor }]
  const est = [{ id: 'o1', tipo: 'Estampado' as const, posicao: 'Costas', medidas: 'Ver amostra', fornecedor: 'Neivacor', cor: 'Ver amostra' }]
  const modelos = [
    p38,
    fix(base('P40 Z Boy', 'Calça 5 bolsos', 'Hempcot', 'Troficolor', '145 cm', 'Army Green', { lavagem: 'Army Green' }), 16),
    fix(base('P43 Kyoto', 'Calça larga', 'Rustic', 'Troficolor', '150 cm', 'Terracotta', { lavagem: 'Terracotta' }), 16),
    fix(base('P83 Sailor', 'Calça marinheiro', 'Adair', 'Troficolor', '148 cm', 'Steel', { lavagem: 'Steel', operacoes: bord('Branco') }), 8),
    fix(base('P85 HBT Wide Legs', 'Calça larga', 'Dinant', 'Troficolor', '140 cm', 'Smoke Black', { operacoes: bord('Preto') }), 4),
    fix(base('P89 New Carpenter', 'Calça carpinteiro', 'Varadero', 'Somelos', '150 cm', 'Natural'), 5),
    fix(base('Saigon', 'Casaco', 'Cânhamo', 'FJ Magalhães', '148 cm', 'Natural', { operacoes: est }), 9),
    fix(base('Traveller Japan Jacket', 'Casaco', 'Varadero', 'Somelos', '150 cm', 'Indigo'), 5),
  ]
  // códigos de lavagem a partir dos dados mestre
  for (const m of modelos) {
    const lav = lavagens.find((l) => l.nome === m.lavagem)
    if (lav) m.variantes = m.variantes.map((x) => ({ ...x, codigoLavagem: lav.codigo }))
  }
  return {
    id: 'dr-collectors-ss27', cliente: 'Dr. Collectors', colecao: 'SS/27', modoServico: 'A feitio',
    entrega: '2026-10-15', criadaEm: '2026-08-14', estado: 'Concluída', preEncomenda: 69, stock: 0, numeroInterno: 70,
    ficheiros: ['DR COLLECTORS SS27.xlsx', 'DRC_TECHPACK_SS27.pdf'], modelos,
  }
}

// ======================= Ficha Longratex 1033350 (tech pack FW 27 «Mini Boy Soft Blue») =======================
/**
 * Ficha gerada a partir do tech pack da coleção + regras confirmadas pela Pereira & Cruz:
 * tecido Sarja PPT comprado pronto a tingir; cor por tingimento da peça na Clothius (sem código);
 * bordado Hugo Gomes; acessórios gerais da ficha do produto da Pereira & Cruz (os de marca ficam a confirmar).
 */
export function fichaLongratex1033350(m: Modelo): Modelo {
  const hoje = '2026-11-25'
  return {
    ...m,
    techPack: true, estado: 'rascunho', descricao: 'CALÇA', tecido: 'Sarja PPT', lavagem: 'Tingimento da peça (PPT)', caixaMax: 40,
    variantes: m.variantes.map((v) => ({ ...v, fichaGerada: true, codigoLavagem: 'Sem código' })),
    materiais: [
      mat({ ref: 'Sarja PPT · 97% CO 3% EL', fornecedor: 'FJ Magalhães', obs: 'Exterior · pronto a tingir', consumo: 0.4, unidade: 'm', cor: 'PPT', largura: 'A confirmar', folha: 'tecido' }),
      mat({ ref: 'Linha', fornecedor: 'Realfio', obs: 'Pronto a tingir', consumo: null, semConsumo: true, cor: 'PPT', folha: 'confecao' }),
      mat({ ref: 'Fecho', fornecedor: 'Botifechos', obs: '', consumo: 1, cor: 'PPT', folha: 'confecao' }),
      mat({ ref: 'Etiqueta de composição', fornecedor: 'Fibratex', obs: 'Costura lateral · 97% CO 3% EA', consumo: 1, cor: 'Cetim', folha: 'confecao' }),
      mat({ ref: 'Botão', fornecedor: 'Louropel', obs: 'Confirmar referência para a Patachou', consumo: 1, cor: 'A confirmar', folha: 'confecao' }),
      mat({ ref: 'Etiqueta de marca Patachou', fornecedor: 'Enviada pela cliente', obs: 'Ver amostra física', consumo: 1, cor: 'N/A', folha: 'confecao' }),
      mat({ ref: 'Hangtag', fornecedor: 'Enviada pela cliente', obs: 'Ver amostra física', consumo: 1, cor: 'N/A', folha: 'embalamento' }),
      mat({ ref: 'Autocolante', fornecedor: 'Staples', obs: 'Colado no saco', consumo: 1, cor: 'Branco', folha: 'embalamento' }),
      mat({ ref: 'Saco plástico', fornecedor: 'Plasbritos', obs: '', consumo: 1, cor: 'Transparente', folha: 'embalamento' }),
    ],
    operacoes: [{ id: 'o1', tipo: 'Bordado', posicao: 'Bolso', medidas: 'Logótipo Patachou · 2 cm', fornecedor: 'Hugo Gomes', cor: 'Ver tech pack' }],
    observacoes: [
      'Seguir o tech pack FW 27 · ref. 1033350 (Mini Boy Soft Blue) · fabricação externa.',
      'Tecido e linha prontos a tingir: a cor sai do tingimento da peça na Clothius (sem código).',
      'Composição: 97% CO 3% EA.',
      'Cuidados: lavar a 30° · não usar lixívia · passar a ferro a baixa temperatura · limpeza a seco P · não secar na máquina.',
      'Cabide: seguir a regra geral.',
      'Tamanhos do tech pack: 24M = 2Y · 36M = 3Y · 48M = 4Y.',
      'Respeitar as normas Oeko-Tex e Reach: artigos de bebé e criança.',
      'Contraste com branco e cores claras: atenção à solidez da cor.',
      'Artigos para bebé com menos de 3 anos: isentos de formaldeídos (OEKO-TEX®).',
    ],
    novasObservacoes: [],
    medidas: [],
    versoes: [{ n: 1, titulo: 'gerada da encomenda e do tech pack da coleção', descricao: 'Sarja PPT (FJ Magalhães), tingimento Clothius, bordado Hugo Gomes; etiqueta de marca e hangtag enviados pela cliente.', data: hoje }],
  }
}

// ======================= Encomenda Longratex (PDF Macwin, lida e conferida) =======================
/** Requisição FRQM2026/0130. A mesma cor partida em várias linhas junta-se numa só variante. */
export function encomendaLongratex(): Encomenda {
  const somar = (...ls: number[][]) => ls[0].map((_, i) => ls.reduce((s, l) => s + l[i], 0))
  const cor = (codigo: string, nome: string, linhas: number[][], preco: number): Variante => ({
    ...variante(codigo, `${codigo} - ${nome}`, nome.toUpperCase(), somar(...linhas), preco, 'A definir'),
    id: slug(`${codigo}-${nome}`), linhasOrigem: linhas.length,
  })
  const mod = (linha: string, ref: string, nome: string, tipoPeca: string, variantes: Variante[]): Modelo => ({
    ...modeloVazio({ nome, tipoPeca, descricao: tipoPeca.toUpperCase(), escala: BEBE, variantes, caixaMax: 40 }),
    id: slug(ref), refCliente: ref, linhaEncomenda: linha,
  })
  return {
    id: 'longratex-frqm2026-0130', cliente: 'Longratex', colecao: 'FRQM2026/0130', modoServico: 'Produto acabado',
    entrega: '', criadaEm: '2026-09-14', estado: 'Em revisão', preEncomenda: 1030, stock: 0, numeroInterno: 81,
    numeroDocumento: 'FRQM2026/0130', dataDocumento: '2026-09-14',
    ficheiros: ['encomenda.pdf'],
    notas: [
      'Os artigos fornecidos devem respeitar as normas Oeko Tex e Reach (artigos de bebé e criança).',
      'Os produtos vão fazer contraste com branco/cores claras: atenção à solidez da cor.',
      'Artigos para bebé inferiores a 3 anos: isentos de formaldeídos e respeitar as normas OEKO-TEX®.',
      'Data de entrega: vem no email do cliente.',
    ],
    totaisDocumento: { pecas: 1030, valor: 13044.85, porTamanho: [27, 21, 61, 75, 164, 148, 164, 111, 138, 121] },
    modelos: [
      fichaLongratex1033350(mod('P261273', 'PAP/CAL1033350', 'Calça vaqueiro 3933311 · Básicos Patachou', 'Calças', [
        cor('000', 'White', [[0, 0, 1, 1, 3, 5, 5, 2, 5, 5]], 12.95),
        cor('313', 'Light blue', [[7, 6, 9, 11, 53, 52, 54, 47, 51, 49]], 12.95),
        cor('852', 'Brown', [[9, 2, 11, 9, 10, 5, 9, 5, 6, 5]], 12.95),
      ])),
      mod('P261274', 'PAP/CAL1033370', 'Calção vaqueiro de rapaz · Boy Hamptons', 'Calções', [
        cor('000', 'White', [[2, 1, 0, 3, 6, 7, 8, 5, 7, 5]], 11.9),
        cor('313', 'Light blue', [[0, 0, 3, 6, 10, 11, 11, 3, 8, 5]], 11.9),
        cor('656', 'Ocean green', [[4, 4, 10, 11, 16, 13, 17, 12, 16, 12]], 11.9),
      ]),
      mod('P261286', 'PAP/CL1033372', 'Calção chino com cinto · Básicos Patachou', 'Calções', [
        cor('000', 'White', [[1, 0, 5, 5, 8, 10, 9, 7, 5, 4]], 12.9),
        cor('120', 'Bege', [[0, 0, 4, 4, 7, 7, 7, 7, 8, 8], [4, 7, 11, 17, 28, 20, 24, 9, 19, 15]], 12.9),
        cor('360', 'Marine', [[0, 1, 7, 8, 15, 10, 12, 6, 5, 5]], 12.9),
      ]),
      mod('P261364', 'PAP/CON4433817', 'Calção 1033370 · cor 656 · entregar sem etiq. c…', 'Calções', [
        cor('391', 'Multicolor', [[0, 0, 0, 0, 8, 8, 8, 8, 8, 8]], 11.9),
      ]),
    ],
  }
}

export const encomendasIniciais = (): Encomenda[] => [encomendaLongratex(), drc()]

// ======================= Orçamentação =======================
export const linhasShirtMao = (): LinhaCusto[] => [
  { id: 'c1', descricao: 'Corte · Pereira & Cruz', consumo: 1, valor: 0.5, origem: 'Segura' },
  { id: 'c2', descricao: 'Plano de corte', consumo: 0.065, valor: 2.6, origem: 'Segura' },
  { id: 'c3', descricao: 'Confeção · Pereira & Cruz', consumo: 1, valor: 14, origem: 'Confirmar', nota: 'Camisa de manga curta com gola mao e bordado: confirmar o valor da tabela.' },
  { id: 'c4', descricao: 'Tecido · Adotrec (Troficolor)', consumo: 1.2, valor: 4.5, origem: 'Estimada', nota: 'Sem preço do Adotrec: usado o do Fleeming Ecru (4,50 €/m) da ficha anterior.' },
  { id: 'c5', descricao: 'Lavandaria · lavagem', consumo: 1, valor: 0.55, origem: 'Estimada', nota: 'O acid wash pode custar mais do que a lavagem simples. Confirme com a Clothius.' },
  { id: 'c6', descricao: 'Etiqueta de couro', consumo: 0, valor: 0.14, origem: 'Confirmar', nota: 'A ficha de produto leva 1 etiqueta de couro azul; aqui o consumo é 0.' },
  { id: 'c7', descricao: 'Etiquetas', consumo: 1, valor: 0.15, origem: 'Segura' },
  { id: 'c8', descricao: 'Molas de madrepérola', consumo: 8, valor: 0.225, origem: 'Confirmar', nota: 'O tech pack pede molas de madrepérola; 8 por camisa, como na ficha anterior.' },
  { id: 'c9', descricao: 'Rebites', consumo: 0, valor: 0.08, origem: 'Segura' },
  { id: 'c10', descricao: 'Bordado do peito', consumo: 1, valor: 0.34, origem: 'Confirmar' },
  { id: 'c11', descricao: 'Saco de embalagem', consumo: 1, valor: 0.15, origem: 'Segura' },
  { id: 'c12', descricao: 'Etiqueta autocolante', consumo: 1, valor: 0.1, origem: 'Segura' },
  { id: 'c13', descricao: 'Caixa de embalamento', consumo: 0.05, valor: 1.09, origem: 'Segura' },
  { id: 'c14', descricao: 'Saco da etiqueta · Pereira & Cruz', consumo: 1, valor: 0.01, origem: 'Segura' },
  { id: 'c15', descricao: 'Revista', consumo: 1, valor: 0.15, origem: 'Segura' },
  { id: 'c16', descricao: 'Acabamento', consumo: 1, valor: 2.2, origem: 'Segura' },
]

export const pedidosIniciais = (): Pedido[] => [
  {
    id: 'ped-shirt-mao-ecru', cliente: 'Imprevu', peca: 'Shirt Mao', variante: 'Ecru', tipoPeca: 'Camisa', tecido: 'Fleeming Ecru', tratamento: 'Ecru',
    entrega: '2026-05-30', linhas: linhasShirtMao().map((l) => (l.id === 'c4' ? { ...l, descricao: 'Tecido · Fleeming Ecru (FJ Magalhães)', origem: 'Segura', nota: undefined } : { ...l, confirmado: true })),
    precoMin: 30.36, precoMax: 30.36, prazo: '30/05/2026', estado: 'Fechado', validadoPor: 'Admin', criadoEm: '2026-04-10',
  },
]

const H = (peca: string, variante: string, tipoPeca: string, tecido: string, preco: number, pecas: number): PrecoHistorico => ({
  id: slug(`${peca}-${variante}`), cliente: 'Imprevu', peca, variante, tipoPeca, tecido, tratamento: variante.split(' · ')[0], preco, pecas, origem: 'Encomenda', data: '2026-11-01',
})
export const historicoInicial = (): PrecoHistorico[] => [
  { id: 'shirt-mao-ecru', cliente: 'Imprevu', peca: 'Shirt Mao', variante: 'Ecru', tipoPeca: 'Camisa', tecido: 'Fleeming Ecru', tratamento: 'Ecru', preco: 30.36, pecas: null, origem: 'Ficha de custo', data: '2026-04-10' },
  H('Chemise Janet', 'Acid wash', 'Camisa', 'Adotrec', 34.89, 49),
  H('Chemise Janet', 'Medium blue', 'Camisa', 'Adotrec', 34.89, 23),
  H('Short Bradley', 'Acid wash', 'Calções', 'Denim', 21.48, 31),
  H('Denim Lexi', 'Vintage · L32', 'Calças', 'Denim', 26.08, 42),
  H('Denim Lexi', 'Vintage · L34', 'Calças', 'Denim', 26.08, 66),
  H('Bermuda Lison', 'Acid wash', 'Calções', 'Denim', 27.97, 89),
  H('Bermuda Lison', 'Medium blue', 'Calções', 'Denim', 27.97, 41),
  H('Bermuda Lison', 'Natural', 'Calções', 'Denim', 27.97, 35),
  H('Denim Rio', 'Acid wash', 'Calças', 'Denim', 33.53, 14),
  H('Denim Rio', 'Medium blue', 'Calças', 'Denim', 33.48, 149),
  H('Denim Rio', 'Natural', 'Calças', 'Denim', 28.37, 93),
  H('Denim Melody', 'Acid wash', 'Calças', 'Denim', 24.37, 23),
  H('Denim Melody', 'Light blue', 'Calças', 'Denim', 25.22, 14),
  H('Denim Melody', 'Vintage', 'Calças', 'Denim', 27.68, 91),
  H('Denim Melody', 'Natural', 'Calças', 'Denim', 24.38, 67),
  H('Denim Roxy', '80s wash', 'Calças', 'Denim', 26.94, 115),
  H('Denim Roxy', 'Light blue', 'Calças', 'Denim', 25.23, 79),
  H('Denim Roxy', 'Rayure', 'Calças', 'Denim', 26.67, 31),
  H('Denim Roxy', 'Medium blue', 'Calças', 'Denim', 25.23, 9),
  H('Denim Roxy', 'Natural', 'Calças', 'Denim', 25.3, 59),
  H('Denim Swiggy', 'Light blue · L32', 'Calças', 'Denim', 26.08, 31),
  H('Denim Swiggy', 'Light blue · L34', 'Calças', 'Denim', 26.08, 67),
  H('Denim Swiggy', 'Medium blue · L32', 'Calças', 'Denim', 23.3, 35),
  H('Denim Swiggy', 'Medium blue · L34', 'Calças', 'Denim', 23.3, 104),
]

export const atividadeInicial = (): Atividade[] => [
  { id: 'a0', data: '2026-08-14T10:12:00Z', acao: 'Encomenda carregada', detalhe: 'Dr. Collectors · SS/27' },
  { id: 'a1', data: '2026-08-20T16:40:00Z', acao: 'Fichas aprovadas', detalhe: 'Dr. Collectors · SS/27 · 8 modelos' },
  { id: 'a2', data: '2026-08-21T09:05:00Z', acao: 'Fichas enviadas à produção', detalhe: 'Dr. Collectors · SS/27' },
]
