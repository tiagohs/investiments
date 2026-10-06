// assets/js/pages/aportes-grafico.js
//
// 27/09/2026: "Suas compras no preço" (Tiago: "gosto do 1, pode incluir
// ele") - o preço de mercado do ativo, com as suas próprias compras marcadas
// em cima (tamanho do ponto = quanto você investiu naquela compra) e o seu
// preço médio corrido como linha tracejada. Aparece quando a aba Lançamentos
// filtra 1 ativo só (ou pelo botão "Ver gráfico do preço" do popover do mapa
// de compras).
//
// 06/10/2026 (Onda 3, kit Figma): o SVG manual saiu - agora é o gráfico de
// linha da biblioteca assets/js/charts (criarGraficoLinha) com tooltip,
// crosshair, teclado, legenda e "Ver como tabela". Três séries: preço de
// mercado, seu preço médio (pontilhada) e "suas compras" (só marcas, opção
// `marcas`/`semLinha`/`raios` de charts/xy.js). O eixo X é por DATA (valor
// numérico); datas de compra que não estão na série de preço entram no eixo
// com o último preço conhecido.

import { formatNumeroBR, formatDMAcurto } from '../format.js';
import { criarGraficoLinha, garantirEstilosCharts } from '../charts/index.js';
import { seriePrecoMedio, comprasNoPeriodo, estatisticasGrafico } from './aportes-grafico-calc.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const ts = (iso) => Date.parse(`${iso}T12:00:00Z`);
const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Prepara os dados do gráfico (puro): datas (série + dias de compra), preço (último conhecido nos dias extras),
 * preço médio corrido (em degraus), preço pago e raio da bolinha por data, e as compras de cada data (tooltip).
 */
export function dadosDoGraficoCompras(serie, compras) {
  const periodo = comprasNoPeriodo(serie, compras);
  const porDataSerie = new Map(serie.map((p) => [p.data, p.preco]));
  const datas = [...new Set([...serie.map((p) => p.data), ...periodo.map((c) => c.data)])].sort();
  let ultimoPreco = null;
  const precos = datas.map((d) => { if (porDataSerie.has(d)) ultimoPreco = porDataSerie.get(d); return ultimoPreco; });
  // preço médio corrido: vale desde a data do ponto até o próximo (linha em degraus)
  const pm = seriePrecoMedio(serie, compras);
  let k = -1;
  const precoMedio = datas.map((d) => { while (k + 1 < pm.length && pm[k + 1].data <= d) k += 1; return k >= 0 ? pm[k].precoMedio : null; });
  const comprasPorData = new Map();
  periodo.forEach((c) => { (comprasPorData.get(c.data) || comprasPorData.set(c.data, []).get(c.data)).push(c); });
  const maxValor = Math.max(...periodo.map((c) => num(c.qtd) * num(c.preco)), 1);
  const pago = []; const raios = [];
  datas.forEach((d, i) => {
    const lista = comprasPorData.get(d);
    if (!lista) { pago.push(null); raios.push(0); return; }
    const q = lista.reduce((t, c) => t + num(c.qtd), 0);
    const v = lista.reduce((t, c) => t + num(c.qtd) * num(c.preco), 0);
    pago.push(q ? v / q : null);
    raios.push(3.5 + 7 * Math.sqrt(Math.max(v, 0) / maxValor));
  });
  return { periodo, datas, precos, precoMedio, pago, raios, comprasPorData };
}

export function renderGraficoCompras(doc, container, { serie, compras, moeda, formatMoeda }) {
  container.textContent = '';
  if (!serie || serie.length < 2) {
    container.innerHTML = '<p class="hint">Sem histórico de preço suficiente ainda pra desenhar o gráfico.</p>';
    return null;
  }
  garantirEstilosCharts(doc);
  const d = dadosDoGraficoCompras(serie, compras);
  const area = doc.createElement('div');
  area.className = 'ag-grafico';
  const stats = doc.createElement('div');
  stats.className = 'ag-stats';
  stats.id = 'agStats';
  container.append(area, stats);

  const grafico = criarGraficoLinha(area, {
    altura: 280, zero: false, suave: false,
    aria: `Preço e suas compras${moeda === 'USD' ? ' (em dólar)' : ''}`,
    eixoX: d.datas.map((data) => ({ valor: ts(data), rotulo: diaMes(data), data })),
    series: [
      { id: 'preco', nome: 'Preço de mercado', cor: 1, principal: true, valores: d.precos },
      { id: 'pm', nome: 'Seu preço médio', cor: 3, pontilhada: true, valores: d.precoMedio },
      { id: 'compras', nome: 'Suas compras (tamanho = valor investido)', cor: 4, marcas: true, semLinha: true, raios: d.raios, valores: d.pago },
    ],
    formatarY: (v) => formatNumeroBR(v, v < 20 ? 2 : 0),
    formatarValor: formatMoeda,
    formatarX: (item) => formatDMAcurto(item.data, ''),
    tooltipExtra: (i) => (d.comprasPorData.get(d.datas[i]) || []).map((c) => ({ nome: 'compra', valor: `${formatNumeroBR(num(c.qtd), c.qtd % 1 ? 4 : 0)} × ${formatMoeda(c.preco)} = ${formatMoeda(num(c.qtd) * num(c.preco))}` })),
  });

  const est = estatisticasGrafico(serie, compras);
  if (!est.n) {
    stats.innerHTML = '<span>Sem compras no período.</span>';
  } else {
    const acima = est.diferenca != null && est.diferenca > 0;
    stats.innerHTML = `
      <span>Compras no período: <b>${est.n}</b></span>
      <span>Preço médio que você pagou: <b>${formatMoeda(est.precoMedioPago)}</b></span>
      <span>Preço médio do ativo no período: <b>${formatMoeda(est.mediaPeriodo)}</b>${est.diferenca != null ? ` → você pagou <b class="${acima ? 'bad' : 'good'}">${formatNumeroBR(Math.abs(est.diferenca) * 100, 1)}% ${acima ? 'acima' : 'abaixo'}</b>` : ''}</span>
      <span><b>${est.abaixoDaMedia} de ${est.n}</b> compras abaixo da média</span>`;
  }
  return grafico;
}
