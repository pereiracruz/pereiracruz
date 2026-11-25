import * as XLSX from 'xlsx'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { Destinatario, Encomenda, FolhaTipo, Modelo, Variante } from '../types'
import { Folha, NOME_FOLHA } from '../components/Folhas'
import { packingList, soma } from './calc'
import { dataCurta, slug } from './format'

type Celula = string | number | { f: string; v: number } | null
const F = (f: string, v: number) => ({ f, v })
const col = (i: number) => XLSX.utils.encode_col(i)

/** Constrói o separador de uma folha. Os totais são fórmulas (nunca valores fixos). */
function separador(enc: Encomenda, m: Modelo, v: Variante, folha: FolhaTipo, idEnc: string, dataFicha: string, dest?: Destinatario) {
  const tam = m.escala.slice(0, v.qtd.length)
  const L: Celula[][] = []
  const push = (...r: Celula[]) => { L.push(r); return L.length } // devolve nº da linha (1-based)

  push('FICHA DO PRODUTO')
  push('CLIENTE:', enc.cliente.toUpperCase(), 'MODELO:', `${m.nome.toUpperCase()} · ${v.nome.toUpperCase()}`)
  push('DATA:', dataCurta(dataFicha), 'DESCRIÇÃO DA PEÇA:', m.descricao)
  push('DATA DE ENTREGA:', dataCurta(enc.entrega), 'ID ENCOMENDA:', idEnc)
  if (dest && folha !== 'produto') push('PARA:', `${NOME_FOLHA[folha]} · ${dest.nome}`)
  push()
  push('DISTRIBUIÇÃO DE QUANTIDADES POR TAMANHO')
  push('TECIDO', 'Ref. cor', ...tam, 'Totais')
  const tecido = m.materiais.find((l) => l.folha === 'tecido')
  const c0 = 2, cN = 2 + tam.length - 1
  const rq = L.length + 1
  const tot = soma(v.qtd)
  push((tecido?.ref ?? m.tecido ?? '').toUpperCase(), v.refCor, ...v.qtd, F(`SUM(${col(c0)}${rq}:${col(cN)}${rq})`, tot))
  const totalRef = `$${col(cN + 1)}$${rq}`
  const rt = L.length + 1
  push('TOTAL', '', ...tam.map((_, i) => F(`${col(c0 + i)}${rq}`, v.qtd[i])), F(`SUM(${col(c0)}${rt}:${col(cN)}${rt})`, tot))
  push()

  const tabelaMat = (titulo: string, filtro: (f: string) => boolean, tec = false) => {
    const ls = m.materiais.filter((l) => filtro(l.folha))
    if (!ls.length) return
    push(titulo.toUpperCase())
    push(...(tec ? ['Referência', 'Fornecedor', 'Largura útil', 'Cons/un', 'Unidade', 'Cor', 'Total'] : ['Referência / item', 'Fornecedor', 'Observações', 'Cons/un', 'Unidade', 'Cor', 'Total']))
    for (const l of ls) {
      const r = L.length + 1
      push(tec ? l.ref.toUpperCase() : l.ref, l.fornecedor, tec ? (l.largura ?? '') : l.obs, l.consumo ?? 'A confirmar', l.unidade, l.cor === 'Conforme variante' ? v.nome : l.cor,
        l.consumo == null ? 'A confirmar' : F(`D${r}*${totalRef}`, Math.round(l.consumo * tot * 1000) / 1000))
    }
    push()
  }
  const obs = (titulo: string, itens: string[]) => { if (!itens.length) return; push(titulo.toUpperCase()); itens.forEach((t) => push(`• ${t}`)); push() }

  switch (folha) {
    case 'produto':
      tabelaMat('Tecidos', (f) => f === 'tecido', true)
      tabelaMat('Acessórios', (f) => f !== 'tecido')
      if (m.operacoes.length) { push('BORDADOS / ESTAMPADOS'); push('Operação', 'Posição', 'Medidas', 'Fornecedor', 'Cor'); m.operacoes.forEach((o) => push(o.tipo, o.posicao, o.medidas, o.fornecedor, o.cor)); push() }
      obs('Observações para confeção e lavagem', m.observacoes)
      obs('Novas observações', m.novasObservacoes)
      break
    case 'corte':
      tabelaMat('Tecidos', (f) => f === 'tecido', true)
      tabelaMat('Acessórios de confeção', (f) => f === 'confecao')
      obs('Observações para confeção', [...m.observacoes, ...m.novasObservacoes])
      break
    case 'lavandaria': {
      push(`TRATAMENTO: ${(m.lavagem ?? v.nome).toUpperCase()}`)
      push('Cor do cliente', 'Código de lavagem', ...tam, 'Totais')
      const r = L.length + 1
      push(v.refCor, v.codigoLavagem, ...tam.map((_, i) => F(`${col(c0 + i)}${rq}`, v.qtd[i])), F(`SUM(${col(c0)}${r}:${col(cN)}${r})`, tot))
      push(); obs('Observações para a lavandaria', [`Lavagem: ${(m.lavagem ?? v.nome).toLowerCase()}, como no tech pack.`, 'Seguir amostra física para a tonalidade.'])
      break
    }
    case 'bordador': case 'estampador': {
      const tipo = folha === 'bordador' ? 'Bordado' : 'Estampado'
      push('Posição', 'Medidas', 'Cor', 'Fornecedor', 'Quantidade')
      m.operacoes.filter((o) => o.tipo === tipo).forEach((o) => push(o.posicao, o.medidas, o.cor, o.fornecedor, F(totalRef, tot)))
      push(); obs('Observações', ['A quantidade é a do corte desta variante: confere com a ficha de produto.'])
      break
    }
    case 'embalamento':
      tabelaMat('Acessórios de embalamento', (f) => f === 'embalamento')
      obs('Observações para embalamento', ['Uma peça por saco, com o autocolante colado no saco.'])
      break
    case 'packing': {
      const cx = packingList(v.qtd, m.caixaMax)
      push(`${cx.length} caixas de, no máximo, ${m.caixaMax} peças`)
      push('Caixa nº', ...tam, 'Peças')
      const r1 = L.length + 1
      cx.forEach((c, i) => { const r = L.length + 1; push(i + 1, ...c, F(`SUM(B${r}:${col(tam.length)}${r})`, soma(c))) })
      const r2 = L.length
      push('TOTAL', ...tam.map((_, i) => F(`SUM(${col(1 + i)}${r1}:${col(1 + i)}${r2})`, v.qtd[i])), F(`SUM(B${L.length + 1}:${col(tam.length)}${L.length + 1})`, tot))
      break
    }
    case 'medidas':
      if (!m.medidas.length) { push('Medidas por preencher: o tech pack não inclui tabela de medidas.'); break }
      push(`Tamanho base: ${m.medidasBase ?? ''} · medidas em cm`)
      push('Ponto de medida', 'Origem', ...tam, 'Graduação')
      m.medidas.forEach((md) => push(md.ponto, md.techPack ? 'TECH PACK' : '', ...md.valores.map((x) => x ?? ''), md.graduacao))
      break
  }

  const ws = XLSX.utils.aoa_to_sheet(L.map((r) => r.map((c) => (c && typeof c === 'object' ? { t: 'n', f: c.f, v: c.v } : c))))
  ws['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 22 }, ...Array(12).fill({ wch: 10 })]
  return ws
}

export function exportarExcel(enc: Encomenda, m: Modelo, variantes: Variante[], folhas: FolhaTipo[], ids: Record<string, string>, dataFicha: string, dest: Destinatario[]) {
  const nomes: string[] = []
  for (const v of variantes) {
    const wb = XLSX.utils.book_new()
    for (const f of folhas) {
      XLSX.utils.book_append_sheet(wb, separador(enc, m, v, f, ids[v.id], dataFicha, dest.find((d) => d.folha === f)), NOME_FOLHA[f].slice(0, 31))
    }
    const nome = `${slug(enc.cliente)}_${slug(enc.colecao)}_${slug(m.nome)}_${slug(v.nome)}.xlsx`.toUpperCase()
    XLSX.writeFile(wb, nome)
    nomes.push(nome)
  }
  return nomes
}

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
