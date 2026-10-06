// tests/charts-sem-title.test.js - 06/10/2026 (Tiago: "dois tooltips nos gráficos"): nenhum elemento de gráfico da biblioteca
// pode ter atributo `title` nem <title> (o navegador mostra o texto nativo POR CIMA do nosso tooltip). A descrição acessível vai
// em aria-label/aria-describedby. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, MESES, SERIES_LINHA } from './charts-helper.mjs';
import {
  criarGraficoLinha, criarGraficoArea, criarGraficoBarras, criarGraficoPilulas, criarAnel, criarAnelProgresso, criarSparkline,
  sparklineHtml, criarCardGrafico, criarKpi, criarBarraProgresso, criarBarraComposicao,
} from '../assets/js/charts/index.js';

const semTitle = (raiz, nome) => {
  assert.equal(raiz.querySelectorAll('title').length, 0, `${nome}: tem <title>`);
  assert.equal(raiz.querySelectorAll('[title]').length, 0, `${nome}: tem atributo title`);
};

test('nenhum criador da biblioteca de gráficos usa title (tooltip nativo duplicado)', () => {
  const a = criarAmbiente({ reduzido: true });
  const fatias = [{ id: 'a', nome: 'Ações', valor: 750 }, { id: 'b', nome: 'FIIs', valor: 250 }];
  const criar = {
    linha: () => criarGraficoLinha(a.novo(), { series: SERIES_LINHA, eixoX: MESES, aria: 'Evolução do patrimônio', card: { rotulo: 'x', valor: 'R$ 1', delta: { texto: '+R$ 1 ganho no período', sinal: 1, info: 'sem contar os aportes' } } }),
    area: () => criarGraficoArea(a.novo(), { series: SERIES_LINHA, eixoX: MESES }),
    barras: () => criarGraficoBarras(a.novo(), { modo: 'simples', categorias: MESES, series: [{ nome: 'S', valores: [1, 2, 3, 4, 5, 6] }] }),
    pilulas: () => criarGraficoPilulas(a.novo(), { categorias: MESES, series: [{ nome: 'S', valores: [1, 2, 3, 4, 5, 6] }] }),
    anel: () => criarAnel(a.novo(), { fatias, centro: { rotulo: 'Total' } }),
    anelProgresso: () => criarAnelProgresso(a.novo(), { valor: 0.95, valor2: 0.98, rotulo: '95%', subrotulo: 'da meta', aria: 'Reserva' }),
    spark: () => criarSparkline(a.novo(), { valores: [1, 3, 2, 5], hover: true }),
    card: () => criarCardGrafico(a.novo(), { rotulo: 'r', valor: 'v', delta: { texto: 't', sinal: -1, info: 'i' } }),
    kpi: () => criarKpi(a.novo(), { rotulo: 'KPI', valor: 10, info: 'Explicação do indicador', spark: { valores: [1, 2, 3] } }),
    progresso: () => criarBarraProgresso(a.novo(), { valor: 0.4, meta: 0.6, rotulo: 'Reserva' }),
    composicao: () => criarBarraComposicao(a.novo(), { fatias }),
  };
  for (const [nome, fn] of Object.entries(criar)) {
    const g = fn();
    semTitle(a.raiz, nome);
    if (g && g.destruir) g.destruir();
  }
  const h = a.novo(); h.innerHTML = sparklineHtml([1, 2, 3], { aria: 'Tendência' }); semTitle(h, 'sparklineHtml');
});

test('o gráfico de linha descreve em aria-label/aria-describedby (não em <title>)', () => {
  const a = criarAmbiente({ reduzido: true });
  criarGraficoLinha(a.novo(), { series: SERIES_LINHA, eixoX: MESES, aria: 'Evolução do patrimônio' });
  const svg = a.raiz.querySelector('svg.chart-svg');
  assert.match(svg.getAttribute('aria-label'), /Evolução do patrimônio: 2 séries, \d+ pontos/);
  assert.ok(a.raiz.querySelector(`#${svg.getAttribute('aria-describedby')}`), 'aria-describedby aponta pra um elemento existente');
  assert.equal(svg.getAttribute('aria-labelledby'), null);
});

test('barra de composição: hover usa o nosso tooltip, sem title', () => {
  const a = criarAmbiente({ reduzido: true });
  criarBarraComposicao(a.novo(), { fatias: [{ id: 'a', nome: 'Ações', valor: 3 }, { id: 'b', nome: 'FIIs', valor: 1 }] });
  const seg = a.raiz.querySelector('.chart-comp-seg');
  assert.equal(seg.getAttribute('data-nome'), 'Ações');
  seg.dispatchEvent(new a.win.Event('pointerover', { bubbles: true }));
  const tip = a.raiz.querySelector('.chart-tip');
  assert.ok(tip.classList.contains('is-on'));
  assert.match(tip.textContent, /Ações/);
  semTitle(a.raiz, 'composicao em hover');
});
