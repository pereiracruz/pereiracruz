import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import clsx from 'clsx'

const PAGINAS_EXEMPLO = [
  { t: 'Capa · SHIRT MAO', d: 'Desenho frente e costas · acid wash e ecru' },
  { t: 'Lavagem', d: 'Acid wash · tonalidade conforme amostra' },
  { t: 'Bordado', d: 'Peito esquerdo · 3 cm · linha cognac · desenho técnico com 3 cotas' },
  { t: 'Etiqueta do tecido', d: 'Casmik ART 52129 · 55% CO 45% LYO · 10,25 oz' },
  { t: 'Gola', d: 'Gola mao 5 cm · pesponto a cada 1 cm' },
  { t: 'Lavagem · detalhe', d: 'Acid wash: wash the fabric to make it soft' },
  { t: 'Botões', d: 'Mother of pearl snaps · 8 per shirt' },
]

/** Visualizador do tech pack: mostra o PDF real (se carregado) ou a pré-visualização do exemplo. */
export function TechPack({ nome, url, pagina, setPagina, total = 7, destaque }: {
  nome: string; url?: string; pagina: number; setPagina: (n: number) => void; total?: number; destaque?: boolean
}) {
  const p = PAGINAS_EXEMPLO[pagina - 1]
  return (
    <div className={clsx('bg-papel border rounded-cartao overflow-hidden sticky top-4 transition-shadow', destaque ? 'border-ouro ring-2 ring-ouro/30' : 'border-linha')}>
      <div className="flex items-center justify-between px-4 h-12 border-b border-linha">
        <span className="flex items-center gap-2 text-[14px] font-medium truncate"><FileText size={15} className="text-vermelho" />{nome}</span>
        <span className="flex items-center gap-2 text-[13px] text-suave num">
          <button onClick={() => setPagina(Math.max(1, pagina - 1))} className="p-1 hover:text-tinta"><ChevronLeft size={15} /></button>
          {pagina} / {total}
          <button onClick={() => setPagina(Math.min(total, pagina + 1))} className="p-1 hover:text-tinta"><ChevronRight size={15} /></button>
        </span>
      </div>
      {url ? (
        <iframe key={pagina} title={nome} src={`${url}#page=${pagina}&toolbar=0`} className="w-full h-[460px] bg-fundo" />
      ) : (
        <div className="h-[320px] p-6 flex flex-col bg-[linear-gradient(180deg,#fff,#faf8f4)]">
          <p className="text-[11px] uppercase tracking-[0.14em] text-tenue">Página {pagina}</p>
          <p className="text-[22px] font-light tracking-tight mt-1">{p?.t}</p>
          <div className="flex-1 my-4 rounded-lg border border-dashed border-linha-forte grid place-items-center">
            <svg viewBox="0 0 120 90" className="w-40 text-azul/50">
              <path d="M40 10 L52 6 Q60 12 68 6 L80 10 L98 26 L88 36 L82 30 L82 84 L38 84 L38 30 L32 36 L22 26 Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.2" />
              <path d="M60 12 L60 84" stroke="currentColor" strokeWidth=".8" strokeDasharray="2 2" />
              <rect x="46" y="30" width="6" height="6" fill="currentColor" fillOpacity=".7" />
            </svg>
          </div>
          <p className="text-[12px] text-suave">{p?.d}</p>
        </div>
      )}
    </div>
  )
}
