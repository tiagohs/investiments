// assets/js/pages/aportes-grafico.js
//
// 27/09/2026: "Suas compras no preço" (Tiago: "gosto do 1, pode incluir
// ele") - o preço de mercado do ativo nos últimos ~12 meses, com as suas
// próprias compras marcadas em cima (tamanho do ponto = quanto você
// investiu naquela compra) e o seu preço médio corrido como linha
// tracejada. Aparece quando a aba Lançamentos filtra 1 ativo só (ou pelo
// botão "Ver gráfico do preço" do popover do mapa de compras).
//
// Desenho manual em SVG (sem lib), no mesmo espírito do gráfico de preço
// bruto do popover "Ver gráfico" da Início (inicio.js!renderGraficoPrecoAtivo_):
// paleta e proporções da mesma tela, eixo à esquerda, rótulos de mês
// embaixo. Cada ponto de compra tem um <title> nativo (tooltip do
// navegador) - suficiente pra um punhado de pontos por ativo, sem
// precisar duplicar a lógica de crosshair/hover das outras telas.

import { formatNumeroBR } from '../format.js';
import { seriePrecoMedio, comprasNoPeriodo, estatisticasGrafico } from './aportes-grafico-calc.js';

const dma = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(2, 4)}` : '');
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function larguraReal(container) {
  const w = container.clientWidth || (container.getBoundingClientRect && container.getBoundingClientRect().width) || 0;
  return w > 40 ? Math.round(w) : 640;
}

function pathDaLinha(pontos, x, y) {
  let d = '';
  pontos.forEach((v, i) => {
    if (v == null) return;
    d += `${i === 0 ? 'M' : 'L'}${x(i, pontos.length).toFixed(1)} ${y(v).toFixed(1)} `;
  });
  return d.trim();
}

/** A linha do preço médio é em "degraus" (só muda no dia de cada compra) - H/V em vez de L. */
function pathDoPrecoMedio(pontosPm, x) {
  let d = '';
  pontosPm.forEach((p) => {
    if (p.precoMedio == null) return;
    const xx = x(p.x).toFixed(1);
    const yy = p.y.toFixed(1);
    d += d ? `H${xx}V${yy}` : `M${xx},${yy}`;
  });
  return d;
}

export function renderGraficoCompras(doc, container, { serie, compras, moeda, formatMoeda }) {
  if (!serie || serie.length < 2) {
    container.innerHTML = '<p class="hint">Sem histórico de preço suficiente ainda pra desenhar o gráfico.</p>';
    return;
  }
  const W = larguraReal(container);
  const H = 260;
  const padL = 8, padR = 58, padT = 14, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const t0 = new Date(`${serie[0].data}T00:00:00`).getTime();
  const t1 = new Date(`${serie[serie.length - 1].data}T00:00:00`).getTime();
  const dur = Math.max(t1 - t0, 1);
  const xData = (data) => padL + ((new Date(`${data}T00:00:00`).getTime() - t0) / dur) * plotW;

  const periodo = comprasNoPeriodo(serie, compras);
  const pmPontos = seriePrecoMedio(serie, compras);

  const precos = serie.map((p) => p.preco);
  const pmValores = pmPontos.map((p) => p.precoMedio).filter((v) => v != null);
  const todosValores = [...precos, ...periodo.map((c) => c.preco), ...pmValores];
  let minV = Math.min(...todosValores);
  let maxV = Math.max(...todosValores);
  const folga = (maxV - minV) * 0.1 || Math.abs(maxV) * 0.05 || 1;
  minV -= folga; maxV += folga;
  const y = (v) => padT + plotH * (1 - (v - minV) / (maxV - minV));
  const xIdx = (i, n) => padL + plotW * (n > 1 ? i / (n - 1) : 0);

  const ticks = 4;
  let eixoSvg = '';
  for (let t = 0; t <= ticks; t += 1) {
    const v = minV + (maxV - minV) * (t / ticks);
    const yy = y(v);
    eixoSvg += `<line class="ag-grade" x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    eixoSvg += `<text class="ag-eixo" x="${W - padR + 6}" y="${(yy + 3).toFixed(1)}">${formatNumeroBR(v, v < 20 ? 2 : 0)}</text>`;
  }
  let mesesSvg = '';
  for (let d = new Date(t0); d.getTime() <= t1; d.setMonth(d.getMonth() + 2)) {
    mesesSvg += `<text class="ag-eixo" x="${xData(d.toISOString().slice(0, 10)).toFixed(1)}" y="${H - 6}" text-anchor="middle">${MESES_CURTOS[d.getMonth()]}</text>`;
  }

  const linhaSvg = `<path class="ag-linha" d="${pathDaLinha(precos, xIdx, y)}"/>`;
  const pmComXY = pmPontos.filter((p) => p.precoMedio != null).map((p) => ({ x: p.data, y: y(p.precoMedio) }));
  const pmSvg = pmComXY.length ? `<path class="ag-pm" d="${pathDoPrecoMedio(pmComXY, xData)}"/>` : '';

  const maxValorCompra = Math.max(...periodo.map((c) => c.qtd * c.preco), 1);
  const pontosSvg = periodo.map((c) => {
    const valor = c.qtd * c.preco;
    const r = 3.5 + 7 * Math.sqrt(Math.max(valor, 0) / maxValorCompra);
    return `<circle class="ag-ponto" cx="${xData(c.data).toFixed(1)}" cy="${y(c.preco).toFixed(1)}" r="${r.toFixed(1)}"><title>${dma(c.data)} · ${formatNumeroBR(c.qtd, c.qtd % 1 ? 4 : 0)} × ${formatMoeda(c.preco)} = ${formatMoeda(valor)}</title></circle>`;
  }).join('');

  const ultimo = serie[serie.length - 1];
  const rotuloHoje = `<text class="ag-rot" x="${W - padR + 6}" y="${(y(ultimo.preco) - 6).toFixed(1)}">hoje ${formatMoeda(ultimo.preco)}</text>`;

  container.innerHTML = `
    <svg class="ag-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Preço e suas compras">
      ${eixoSvg}${mesesSvg}${linhaSvg}${pmSvg}${pontosSvg}${rotuloHoje}
    </svg>
    <div class="ag-leg">
      <span><i class="ag-i" style="border-color:var(--ink-muted)"></i>preço de mercado</span>
      <span><i class="ag-i ag-i-c"></i>suas compras (tamanho = valor investido)</span>
      <span><i class="ag-i" style="border-color:var(--rf);border-top-style:dashed"></i>seu preço médio</span>
    </div>
    <div class="ag-stats" id="agStats"></div>`;

  const stats = estatisticasGrafico(serie, compras);
  const statsEl = container.querySelector('#agStats');
  if (!stats.n) {
    statsEl.innerHTML = '<span>Sem compras no período.</span>';
  } else {
    const acima = stats.diferenca != null && stats.diferenca > 0;
    statsEl.innerHTML = `
      <span>Compras no período: <b>${stats.n}</b></span>
      <span>Preço médio que você pagou: <b>${formatMoeda(stats.precoMedioPago)}</b></span>
      <span>Preço médio do ativo no período: <b>${formatMoeda(stats.mediaPeriodo)}</b>${stats.diferenca != null ? ` → você pagou <b class="${acima ? 'bad' : 'good'}">${formatNumeroBR(Math.abs(stats.diferenca) * 100, 1)}% ${acima ? 'acima' : 'abaixo'}</b>` : ''}</span>
      <span><b>${stats.abaixoDaMedia} de ${stats.n}</b> compras abaixo da média</span>`;
  }
}
