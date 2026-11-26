import * as XLSX from 'xlsx'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { Destinatario, Encomenda, FolhaTipo, Modelo, Variante } from '../types'
import { Folha, NOME_FOLHA } from '../components/Folhas'
import { idInterno, soma } from './calc'
import { calcularEnvio } from './packing'
import { dataCurta, slug } from './format'

type Celula = string | number | { f: string; v: number } | null
const F = (f: string, v: number) => ({ f, v })
const col = (i: number) => XLSX.utils.encode_col(i)

/** Constrói o separador de uma folha. Os totais são fórmulas (nunca valores fixos). */
function grelha(enc: Encomenda, m: Modelo, v: Variante, folha: FolhaTipo, idEnc: string, dataFicha: string, dest?: Destinatario): Celula[][] {
  const tam = m.escala.slice(0, v.qtd.length)
  const L: Celula[][] = []
  const push = (...r: Celula[]) => { L.push(r); return L.length } // devolve nº da linha (1-based)
  const emb = folha === 'embalamento'

  push('FICHA DO PRODUTO')
  push(emb ? `COLEÇÃO ${enc.colecao}` : 'Informação Geral da Encomenda')
  push('CLIENTE:', enc.cliente.toUpperCase(), 'MODELO:', emb ? v.ref : `${m.nome.toUpperCase()} · ${v.nome.toUpperCase()}`)
  push('DATA:', dataCurta(dataFicha), 'DESCRIÇÃO DA PEÇA:', m.descricao)
  push('DATA DE ENTREGA:', enc.entrega ? dataCurta(enc.entrega) : 'A confirmar', emb ? 'ID ENCOMENDA INTERNO:' : 'ID ENCOMENDA:', idEnc)
  if (dest && folha !== 'produto' && !emb) push('PARA:', `${NOME_FOLHA[folha]} · ${dest.nome}`)
  push()
  push('Distribuição de Quantidades por Tamanho')
  push('TECIDO', 'Ref. Cor', ...tam, 'Totais')
  const tecido = m.materiais.find((l) => l.folha === 'tecido')
  const c0 = 2, cN = 2 + tam.length - 1
  const somaLinha = (r: number, v2: number) => F(`SUM(${col(c0)}${r}:${col(cN)}${r})`, v2)
  const rq = L.length + 1
  const tot = soma(v.qtd)
  push((tecido?.ref ?? m.tecido ?? '').toUpperCase(), emb ? 'ENCOMENDA' : v.refCor, ...v.qtd, somaLinha(rq, tot))
  let totalRef = `$${col(cN + 1)}$${rq}`
  let base = tot
  if (emb) {
    const rc = L.length + 1
    push('', 'TOTAL CONFECIONADO', ...(v.qtdConfecionado ?? tam.map(() => '')), v.qtdConfecionado ? somaLinha(rc, soma(v.qtdConfecionado)) : '')
    const re = L.length + 1
    push('', 'TOTAL EMBALADO', ...(v.qtdEmbalado ?? tam.map(() => '')), v.qtdEmbalado ? somaLinha(re, soma(v.qtdEmbalado)) : '')
    if (v.qtdConfecionado && v.qtdEmbalado) {
      push('', 'SOBRAS', ...tam.map((_, i) => F(`${col(c0 + i)}${rc}-${col(c0 + i)}${re}`, v.qtdConfecionado![i] - v.qtdEmbalado![i])))
    }
    // acessórios de embalamento sobre o confecionado (se houver)
    if (v.qtdConfecionado) { totalRef = `$${col(cN + 1)}$${rc}`; base = soma(v.qtdConfecionado) }
  } else {
    // linha de total (igual à da aplicação): por tamanho = quantidades da encomenda, total = soma; tudo em fórmula
    const rotulo = folha === 'lavandaria' ? 'TOTAL CONFECIONADO' : 'TOTAL CORTADO'
    const rt = L.length + 1
    push('', rotulo, ...tam.map((_, i) => F(`${col(c0 + i)}${rq}`, v.qtd[i])), somaLinha(rt, tot))
  }
  push()

  const tabelaMat = (titulo: string, filtro: (f: string) => boolean, tec = false) => {
    const ls = m.materiais.filter((l) => filtro(l.folha))
    if (!ls.length) return
    push(titulo)
    push(...(tec ? ['P.C. Referência / Item', 'FORNECEDOR', 'LARGURA ÚTIL', 'Cons/Un', 'Un.', 'Cor', 'Total'] : ['P.C. Referência / Item', 'FORNECEDOR', 'Observações', 'Cons/Un', 'Un.', 'Cor', 'Total']))
    for (const l of ls) {
      const r = L.length + 1
      const cons: Celula = l.semConsumo ? '' : l.consumo ?? 'A confirmar'
      const total: Celula = l.semConsumo ? '' : l.consumo == null ? 'A confirmar' : F(`D${r}*${totalRef}`, Math.round(l.consumo * base * 1000) / 1000)
      push(tec ? l.ref.toUpperCase() : l.ref, l.fornecedor.toUpperCase(), tec ? (l.largura ?? '') : l.obs, cons, l.semConsumo ? '' : l.unidade, l.cor === 'Conforme variante' ? v.nome : l.cor, total)
    }
    push()
  }
  const obs = (titulo: string, itens: string[]) => { if (!itens.length) return; push(titulo.toUpperCase()); itens.forEach((t) => push(t)); push() }

  switch (folha) {
    case 'produto':
      tabelaMat('TECIDOS', (f) => f === 'tecido', true)
      if (m.operacoes.length) { push('BORDADOS/ESTAMPADOS'); push('P.C. Referência / Nome Operação', 'Observações', 'FORNECEDOR', 'Cor'); m.operacoes.forEach((o) => push(o.tipo, `${o.posicao} · ${o.medidas}`, o.fornecedor.toUpperCase(), o.cor)); push() }
      tabelaMat('Acessórios', (f) => f !== 'tecido')
      obs('Observações para confeção e lavagem', m.observacoes)
      obs('Novas observações', m.novasObservacoes)
      break
    case 'corte':
      tabelaMat('TECIDOS', (f) => f === 'tecido', true)
      tabelaMat('Acessórios de confeção', (f) => f === 'confecao')
      obs('Observações para confeção', [...m.observacoes, ...m.novasObservacoes])
      break
    case 'lavandaria': {
      push(`TRATAMENTO: ${(m.lavagem ?? v.nome).toUpperCase()}`)
      push('Cor do cliente', 'Código de lavagem', ...tam, 'Totais')
      const r = L.length + 1
      push(v.refCor, v.codigoLavagem, ...tam.map((_, i) => F(`${col(c0 + i)}${rq}`, v.qtd[i])), somaLinha(r, tot))
      push(); obs('Observações para a lavandaria', [`Lavagem: ${(m.lavagem ?? v.nome).toLowerCase()}, como no tech pack.`, 'Seguir amostra física para a tonalidade.'])
      break
    }
    case 'bordador': case 'estampador': {
      const tipo = folha === 'bordador' ? 'Bordado' : 'Estampado'
      push('Posição', 'Medidas', 'Cor', 'Fornecedor', 'Quantidade')
      m.operacoes.filter((o) => o.tipo === tipo).forEach((o) => push(o.posicao, o.medidas, o.cor, o.fornecedor, F(totalRef, tot)))
      push(); obs('Observações', ['A quantidade é a do corte desta variante: confere com a ficha do produto.'])
      break
    }
    case 'embalamento':
      tabelaMat('Acessórios', (f) => f === 'embalamento')
      obs('Observações para embalamento', m.obsEmbalamento?.length ? m.obsEmbalamento : ['Uma peça por saco, com o autocolante colado no saco.'])
      break
    case 'packing': case 'medidas':
      if (folha === 'packing' || !m.medidas.length) { push('Medidas por preencher: o tech pack não inclui tabela de medidas.'); break }
      push(`Tamanho base: ${m.medidasBase ?? ''} · medidas em cm`)
      push('Ponto de medida', 'Origem', ...tam, 'Graduação')
      m.medidas.forEach((md) => push(md.ponto, md.techPack ? 'TECH PACK' : '', ...md.valores.map((x) => x ?? ''), md.graduacao))
      break
  }

  return L
}

/** Packing list da encomenda (em inglês), por envio, com totais em fórmula. */
function grelhaPacking(enc: Encomenda): Celula[][] {
  const L: Celula[][] = []
  const push = (...r: Celula[]) => { L.push(r); return L.length }
  push('', '', 'CLIENT', '', '', enc.cliente.toUpperCase())
  push('', '', 'REFERENCE', '', '', enc.colecao)
  for (const envio of enc.envios ?? []) {
    push(`${envio.nome}-${dataCurta(envio.data).slice(0, 5)}`)
    for (const b of calcularEnvio(enc, envio)) {
      const nT = b.tamanhos.length
      push(`PACKING LIST- ${b.titulo}`)
      push('BOX Nº', ...b.tamanhos, 'TOTAL', ...(b.temPeso ? ['KG'] : []))
      const r1 = L.length + 1
      for (const c of b.caixas) {
        const r = L.length + 1
        push(c.numero, ...c.qtd.map((q) => q || ''), F(`SUM(B${r}:${col(nT)}${r})`, c.total), ...(b.temPeso ? [c.peso!] : []))
      }
      const r2 = L.length
      push('TOTAL', ...b.tamanhos.map((_, i) => F(`SUM(${col(1 + i)}${r1}:${col(1 + i)}${r2})`, b.totalPorTamanho[i])), F(`SUM(${col(nT + 1)}${r1}:${col(nT + 1)}${r2})`, b.total))
      push()
    }
  }
  return L
}

const PROIBIDOS = new Set(['[', ']', ':', '*', '?', '/', '\\'])
const nomeSeparador = (s: string, usados: Set<string>) => {
  const limpo = Array.from(s).filter((c) => !PROIBIDOS.has(c)).join('')
  let n = limpo.slice(0, 31)
  let k = 2
  while (usados.has(n)) n = `${limpo.slice(0, 28)}_${k++}`
  usados.add(n)
  return n
}

export interface EntradaLivro { m: Modelo; v: Variante; folhas: FolhaTipo[] }
export interface FolhaLivro { nome: string; linhas: Celula[][]; larguras: number[] }

/** Conteúdo do livro da encomenda (igual para Excel e Google Sheets): uma folha por variante e destinatário + packing list. */
export function montarLivro(enc: Encomenda, entradas: EntradaLivro[], dataFicha: (m: Modelo) => string, dest: Destinatario[], comPacking: boolean): FolhaLivro[] {
  const usados = new Set<string>()
  const curto = (s: string) => s.split(' · ')[0].split(' ').join('_')
  const out: FolhaLivro[] = []
  for (const { m, v, folhas } of entradas) {
    for (const f of folhas) {
      const prefixo = f === 'produto' ? '' : f === 'embalamento' ? 'Embalamento_' : `${NOME_FOLHA[f]}_`
      out.push({
        nome: nomeSeparador(`${prefixo}${curto(m.nome)}_${v.nome.split(' ').join('')}`, usados),
        linhas: grelha(enc, m, v, f, idInterno(enc, m), dataFicha(m), dest.find((d) => d.folha === f)),
        larguras: [30, 22, 22, ...Array(12).fill(10)],
      })
    }
  }
  if (comPacking && enc.envios?.length) out.push({ nome: nomeSeparador('Packing_list', usados), linhas: grelhaPacking(enc), larguras: [30, ...Array(14).fill(8)] })
  return out
}

export const nomeLivro = (enc: Encomenda, entradas: EntradaLivro[]) => {
  const umModelo = entradas.length > 0 && new Set(entradas.map((e) => e.m.id)).size === 1
  return `FichaProduto_${slug(enc.cliente)}_${slug(enc.colecao)}${umModelo ? `_${slug(entradas[0].m.nome)}` : ''}`
}

/** Um livro Excel por encomenda, como as fichas de hoje. Totais em fórmula. */
export function exportarLivro(enc: Encomenda, entradas: EntradaLivro[], dataFicha: (m: Modelo) => string, dest: Destinatario[], comPacking: boolean) {
  const wb = XLSX.utils.book_new()
  for (const f of montarLivro(enc, entradas, dataFicha, dest, comPacking)) {
    const ws = XLSX.utils.aoa_to_sheet(f.linhas.map((r) => r.map((c) => (c && typeof c === 'object' ? { t: 'n', f: c.f, v: c.v } : c))))
    ws['!cols'] = f.larguras.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, f.nome)
  }
  const nome = `${nomeLivro(enc, entradas)}.xlsx`
  XLSX.writeFile(wb, nome)
  return nome
}

/** Folhas para o Google Sheets: as fórmulas vão como texto «=…» (o Sheets calcula-as). */
export const paraSheets = (folhas: FolhaLivro[]) =>
  folhas.map((f) => ({
    nome: f.nome,
    larguras: f.larguras,
    linhas: f.linhas.map((r) => r.map((c) => (c && typeof c === 'object' ? `=${c.f}` : c ?? ''))),
  }))

/** Abre uma janela de impressão com as folhas escolhidas (guardar como PDF). */
export function exportarPDF(props: { enc: Encomenda; m: Modelo; variantes: Variante[]; folhas: FolhaTipo[]; ids: Record<string, string>; dataFicha: string; dest: Destinatario[] }) {
  const logo = `${location.origin}/logo-timbrado.png`
  const corpo = props.variantes.flatMap((v) => props.folhas.map((f) =>
    `<section class="pagina">${renderToStaticMarkup(createElement(Folha, { enc: props.enc, m: props.m, v, folha: f, idEnc: props.ids[v.id], destinatarios: props.dest, dataFicha: props.dataFicha, logo }))}</section>`,
  )).join('')
  const estilos = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((n) => n.outerHTML).join('')
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${props.enc.cliente} ${props.enc.colecao} · ${props.m.nome}</title>${estilos}
    <style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact} body{background:#fff;padding:0;margin:0} .pagina{padding:8mm;break-after:page} .pagina:last-child{break-after:auto} @page{size:A4 landscape;margin:6mm}</style></head>
    <body>${corpo}<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`)
  w.document.close()
  return true
}
