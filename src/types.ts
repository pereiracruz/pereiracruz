// ---------- Dados mestre ----------
export type TipoFornecedor = 'Tecido' | 'Forro' | 'Acessórios' | 'Embalagem' | 'Serviço externo'

export interface Fornecedor { id: string; nome: string; tipo: TipoFornecedor; fornece: string }
export interface Tecido { id: string; nome: string; fornecedor: string; composicao: string; larguraUtil: string; precoM?: number }
export interface Equivalencia { id: string; tecidoCliente: string; tecidoCasa: string; ondeUsou: string; estado: 'A confirmar' | 'Confirmada' }
export interface Lavagem { id: string; sufixo: string; nome: string; cliente: string; codigo: string }
export interface AcessorioCliente { id: string; cliente: string; item: string; fornecedor: string; consumo: string }
export interface Escala { id: string; nome: string; tamanhos: string[]; usadaEm: string }
export interface Destinatario { id: string; folha: FolhaTipo; nome: string; contacto: string }
export interface PrecoRef { id: string; linha: string; valor: number; unidade: string; origem: string }
export interface ClienteCfg {
  id: string; nome: string
  margemTipo: 'fixa' | 'percentual'; margem: number
  comissao: number // % do agente sobre o total de custos
  idPrefixo: string
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
}

export type EstadoFicha = 'sem-ficha' | 'rascunho' | 'aprovada' | 'enviada'

export interface Modelo {
  id: string
  nome: string
  alias?: string
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
  caixaMax: number
  aprovadaEm?: string
}

export type EstadoEncomenda = 'Em revisão' | 'Fichas geradas' | 'Concluída'

export interface Encomenda {
  id: string
  cliente: string
  colecao: string
  modoServico: ModoServico
  entrega: string // ISO
  criadaEm: string
  estado: EstadoEncomenda
  preEncomenda: number
  stock: number
  ficheiros: string[]
  modelos: Modelo[]
}

// ---------- Orçamentação ----------
export type OrigemCusto = 'Segura' | 'Estimada' | 'Confirmar'
export interface LinhaCusto { id: string; descricao: string; consumo: number; valor: number; origem: OrigemCusto; nota?: string; confirmado?: boolean }
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
}
export interface PrecoHistorico {
  id: string; cliente: string; peca: string; variante: string; tipoPeca: string; tecido: string; tratamento: string
  preco: number; pecas: number | null; origem: 'Encomenda' | 'Ficha de custo' | 'Orçamento'; data: string
}

// ---------- Sistema ----------
export interface Atividade { id: string; data: string; acao: string; detalhe: string }
