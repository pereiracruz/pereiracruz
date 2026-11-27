// ---------- Dados mestre ----------
export type TipoFornecedor = 'Tecido' | 'Forro' | 'Acessórios' | 'Embalagem' | 'Serviço externo'

export interface Fornecedor { id: string; nome: string; tipo: TipoFornecedor; fornece: string }
export interface Tecido { id: string; nome: string; fornecedor: string; composicao: string; larguraUtil: string; precoM?: number }
export interface Equivalencia { id: string; tecidoCliente: string; tecidoCasa: string; ondeUsou: string; estado: 'A confirmar' | 'Confirmada' }
export interface Lavagem { id: string; sufixo: string; nome: string; cliente: string; codigo: string }
export interface AcessorioCliente { id: string; cliente: string; item: string; fornecedor: string; consumo: string }
export interface Escala { id: string; nome: string; tamanhos: string[]; usadaEm: string }
export interface Destinatario { id: string; folha: FolhaTipo; nome: string; contacto: string }
/** Tabela de tingimento da Clothius: € por kg, por tipo de corante e cor do labdip (null = não há / orçamento). */
export interface PrecoTingimento {
  id: string; tipo: string
  amostras: number | null; branco: number | null; claras: number | null; medias: number | null; escuras: number | null; preto: number | null; especiais: number | null
  nota?: string
}
/** Tabela de lavandaria (ganga/tecidos) da Clothius: € por peça, por grupo de peça (null = não há / orçamento). */
export interface PrecoLavagem {
  id: string; seccao: 'Lavagem' | 'Secos'; descricao: string
  crianca: number | null; grupoA: number | null; grupoB: number | null; grupoC: number | null
  nota?: string
}
export interface PrecoRef { id: string; linha: string; valor: number; unidade: string; origem: string }
export interface ClienteCfg {
  id: string; nome: string
  margemTipo: 'fixa' | 'percentual'; margem: number
  comissao: number // agente: % sobre (custo + N/ comissão), ou € por peça se comissaoTipo = 'fixa'
  comissaoTipo?: 'percentual' | 'fixa'
  idPrefixo: string
  escala?: string // escala de tamanhos habitual
  notasFixas?: string[] // passam para as observações das fichas
}

// ---------- Fichas de produção ----------
export type ModoServico = 'Produto acabado' | 'A feitio'
export type FolhaTipo = 'produto' | 'corte' | 'lavandaria' | 'bordador' | 'estampador' | 'embalamento' | 'packing' | 'medidas'

export interface LinhaMaterial {
  id: string
  ref: string
  fornecedor: string
  obs: string
  consumo: number | null // por peça; null = a confirmar
  unidade: 'm' | 'un'
  cor: string
  largura?: string
  folha: 'confecao' | 'embalamento' | 'tecido'
  semConsumo?: boolean // ex.: linha — só cor e fornecedor (a espessura depende da encomenda)
  divergencia?: string // diferença face ao tech pack
  justificacao?: string
}
export interface Operacao { id: string; tipo: 'Bordado' | 'Estampado'; posicao: string; medidas: string; fornecedor: string; cor: string }
export interface Medida { ponto: string; valores: (number | null)[]; graduacao: string; techPack: boolean }
export interface Versao { n: number; titulo: string; descricao: string; data: string }

export interface Variante {
  id: string
  ref: string // código na encomenda, ex.: 7E27JANETAW
  nome: string // Acid wash
  refCor: string // AZUL · ACID WASH
  codigoLavagem: string
  qtdEncomenda: number[] // por tamanho, como veio da encomenda
  qtd: number[] // na ficha (deve igualar a encomenda)
  preco: number // preço por peça na encomenda
  fichaGerada: boolean
  qtdConfecionado?: number[] // preenchido depois da confeção
  qtdEmbalado?: number[] // preenchido no embalamento
  qtdStock?: number[] // parte das quantidades que é stock (incluída em qtdEncomenda)
  linhasOrigem?: number // nº de linhas da encomenda juntadas (mesma cor partida em várias linhas)
}

export type EstadoFicha = 'sem-ficha' | 'rascunho' | 'aprovada' | 'enviada'

export interface Modelo {
  id: string
  nome: string
  alias?: string
  refCliente?: string // referência no documento do cliente
  techPackLido?: { ficheiro: string; indice: number } // modelo do tech pack lido pela IA
  linhaEncomenda?: string // nº da linha de encomenda do cliente
  tipoPeca: string
  descricao: string
  escala: string[]
  techPack: boolean
  variantes: Variante[]
  estado: EstadoFicha
  tecido?: string
  lavagem?: string
  materiais: LinhaMaterial[]
  operacoes: Operacao[]
  observacoes: string[]
  novasObservacoes: string[]
  medidas: Medida[]
  medidasBase?: string
  versoes: Versao[]
  caixaMax: number // peças por caixa na packing list (média 20 calças; menos nos modelos de criança)
  pesoPeca?: number // kg por peça, para o peso das caixas (depende do modelo)
  obsEmbalamento?: string[]
  aprovadaEm?: string
}

export interface Envio { id: string; nome: string; data: string; itens: { modeloId: string; varianteId: string }[] }

export type EstadoCompraTipo = 'Por encomendar' | 'Encomendado' | 'Recebido'
export interface EstadoCompra { chave: string; estado: EstadoCompraTipo; data?: string; nota?: string }
export type Etapa = 'Materiais' | 'Corte' | 'Confeção' | 'Lavandaria' | 'Embalamento' | 'Expedição'
export interface Prazo { etapa: Etapa; data?: string; feito?: string; quem?: string } // quem: escolhido na encomenda (ex.: confeção feita fora)

/** Guia de transporte criada no TOConline a partir da encomenda (começa como rascunho; finaliza-se no TOConline). */
export interface GuiaTOC {
  id: string // id do documento no TOConline
  empresa: 'PP' | 'PC'
  criadaEm: string
  destinatario: string
  pecas: number
  viatura: string
  estado: 'rascunho' | 'finalizada' | 'apagada'
  numero?: string // ex.: GT 2026/345 (só depois de finalizada)
  codigoAT?: string
  linhas?: { chave: string; descricao: string; quantidade: number }[] // chave = modeloId:varianteId (para o preço da fatura)
  fatura?: { numero: string; total?: number } // fatura convertida desta guia no TOConline
}

export type EstadoEncomenda = 'Em revisão' | 'Fichas geradas' | 'Concluída'

export interface Encomenda {
  id: string
  cliente: string
  colecao: string
  modoServico: ModoServico
  entrega: string // ISO; vazio = a confirmar
  numeroDocumento?: string
  dataDocumento?: string
  notas?: string[] // notas do documento (normas, cuidados)
  totaisDocumento?: { pecas: number; valor: number; porTamanho?: number[] }
  numeroInterno?: number // nº da encomenda na Pereira & Cruz (E26-082-…)
  ficheirosGuardados?: { nome: string; caminho: string }[] // no bucket «documentos»
  linkSheets?: { url: string; data: string; titulo: string } // última exportação para o Google Sheets
  techPacks?: { ficheiro: string; caminho: string; dados: unknown }[] // leitura da IA (TechPackLido)
  envios?: Envio[]
  compras?: EstadoCompra[] // estado de cada material a comprar (pela Pereira's Project)
  margemCompras?: { tecido: number; acessorios: number } // % de quebra a acrescentar
  prazos?: Prazo[] // datas planeadas e concluídas de cada etapa até à entrega
  guias?: GuiaTOC[] // guias de transporte criadas no TOConline
  criadaEm: string
  estado: EstadoEncomenda
  preEncomenda: number
  stock: number
  ficheiros: string[]
  modelos: Modelo[]
}

// ---------- Orçamentação ----------
export type OrigemCusto = 'Segura' | 'Estimada' | 'Confirmar'
export interface LinhaCusto {
  id: string; descricao: string; consumo: number; valor: number; origem: OrigemCusto; nota?: string; confirmado?: boolean
  unidade?: string // €, mts, kg…
  consumoExpr?: string // como foi escrito (ex.: «3/32» = 3 m de plano para 32 peças)
  valorExpr?: string // ex.: «140.8/1000» = preço por milheiro
  empresa?: Empresa // quem assume o custo (por omissão: o que diz a descrição, ou a regra por tipo de linha)
}
/** PC = Pereira & Cruz (corte e confeção); PP = Pereira's Project (materiais, lavandaria, acabamento, entrega); FORA = confeção subcontratada; CLIENTE = corte ou material do cliente. */
export type Empresa = 'PC' | 'PP' | 'FORA' | 'CLIENTE'
export type EstadoPedido = 'Rascunho' | 'Por validar' | 'Validado' | 'Enviado' | 'Fechado'
export interface Pedido {
  id: string
  cliente: string
  peca: string
  variante: string
  tipoPeca: string
  tecido: string
  tratamento: string
  entrega: string
  linhas: LinhaCusto[]
  precoMin?: number
  precoMax?: number
  prazo?: string
  estado: EstadoPedido
  validadoPor?: string
  criadoEm: string
  precoFinal?: number // preço fixado pela Pereira & Cruz; a margem = preço final − custo
  referencia?: string // código do modelo na ficha de custo
  origemFicheiro?: string // ficha de custo importada (ficheiro · folha)
  origem?: 'ia' | 'modelo' | 'importado' // como foi criada a ficha de custo
  margemFixa?: number // «N/ comissão» desta ficha (sobrepõe-se à do cliente)
  comissaoPct?: number // comissão do agente desta ficha, % sobre o custo (sobrepõe-se à do cliente)
  comissaoFixa?: number // agente em € por peça (em vez de %)
  comissaoSobreCusto?: boolean // fichas antigas: a % do agente era só sobre o custo
}
export interface PrecoHistorico {
  id: string; cliente: string; peca: string; variante: string; tipoPeca: string; tecido: string; tratamento: string
  preco: number; pecas: number | null; origem: 'Encomenda' | 'Ficha de custo' | 'Orçamento'; data: string
}

// ---------- Sistema ----------
export interface Atividade { id: string; data: string; acao: string; detalhe: string }
