// tests/charts-eixos.test.js - o que os gráficos desenham de verdade (jsdom): eixos, rótulos, legenda, tabela acessível,
// card padrão e estados. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, MESES, SERIES_LINHA } from './charts-helper.mjs';
import { criarGraficoLinha, criarGraficoArea, criarGraficoBarras, criarGraficoPilulas, criarAnel, criarAnelProgresso, criarSparkline, sparklineHtml, criarCardGrafico, criarKpi, criarBarraProgresso, criarBarraComposicao } from '../assets/js/charts/index.js';

const textos = (el, sel) => [...el.querySelectorAll(sel)].map((n) => n.textContent.replace(/\u00a0/g, ' '));

test('linha: eixo Y com ticks redondos formatados por formatarY, eixo X com os rótulos, 1 path por série, principal e pontilhada', () => {
  const a = criarAmbiente({ reduzido: true });
  const g = criarGraficoLinha(a.novo(), { series: SERIES_LINHA, eixoX: MESES, formatarY: (v) => `${v} u`, altura: 200 });
  const y = textos(a.raiz, '.chart-eixo-y');
  assert.ok(y.length >= 3 && y.every((t) => /^\d+ u$/.test(t)), `ticks Y: ${y}`);
  assert.deepEqual(textos(a.raiz, '.chart-eixo-x').slice(0, 2), ['jan', 'fev']);
  assert.equal(a.raiz.querySelectorAll('.chart-linha').length, 2);
  assert.equal(a.raiz.querySelectorAll('.chart-linha.is-pont').length, 1, 'comparativo pontilhado');
  assert.equal(a.raiz.querySelectorAll('.chart-linha.is-princ').length, 1);
  assert.match(a.raiz.querySelector('.chart-linha').getAttribute('d'), /^M[\d.]+,[\d.]+L/);
  assert.equal(a.raiz.querySelector('svg').getAttribute('viewBox'), '0 0 640 200');
  g.destruir();
});

test('linha: cores só por variável CSS (--_cN, token por baixo) e ordem fixa por posição', () => {
  const a = criarAmbiente({ reduzido: true });
  criarGraficoLinha(a.novo(), { series: [{ id: 'x', nome: 'X', valores: [1, 2] }, { id: 'y', nome: 'Y', valores: [2, 1] }, { id: 'z', nome: 'Z', valores: [1, 1] }], eixoX: ['a', 'b'] });
  const cores = [...a.raiz.querySelectorAll('.chart-linha')].map((p) => p.getAttribute('stroke'));
  assert.deepEqual(cores, ['var(--_c1)', 'var(--_c2)', 'var(--_c3)']);
});

test('legenda: aparece só com 2+ séries, uma bolinha por série; 1 série não ganha legenda', () => {
  const a = criarAmbiente({ reduzido: true });
  criarGraficoLinha(a.novo(), { series: SERIES_LINHA, eixoX: MESES });
  assert.equal(a.raiz.querySelectorAll('.chart-leg-dot').length, 2);
  const b = criarAmbiente({ reduzido: true });
  criarGraficoLinha(b.novo(), { series: [SERIES_LINHA[0]], eixoX: MESES });
  assert.equal(b.raiz.querySelectorAll('.chart-leg-item').length, 0);
});

test('tabela acessível: caption, cabeçalhos por série e uma linha por ponto, valores formatados em pt-BR', () => {
  const a = criarAmbiente({ reduzido: true });
  criarGraficoLinha(a.novo(), { series: [{ id: 'a', nome: 'Carteira', valores: [1234.5, 2000] }], eixoX: ['jan', 'fev'], aria: 'Evolução' });
  const t = a.raiz.querySelector('.chart-tabela table');
  assert.ok(t, 'tabela existe (fora da tela até o usuário pedir)');
  assert.equal(t.querySelector('caption').textContent, 'Evolução');
  assert.deepEqual(textos(t, 'thead th'), ['', 'Carteira']);
  assert.deepEqual(textos(t, 'tbody tr:first-child > *'), ['jan', 'R$ 1.234,50']);
  assert.ok(a.raiz.querySelector('.chart-tabela').classList.contains('chart-sr'));
  const botao = a.raiz.querySelector('.chart-tabbtn'); botao.click();
  assert.equal(a.raiz.querySelector('.chart-tabela').classList.contains('chart-sr'), false, 'botão mostra a tabela');
  assert.equal(a.raiz.querySelector('.chart-corpo').hidden, true, 'e esconde o gráfico');
});

test('textos vindos de dado entram como texto (nada de HTML): nome de série e rótulo com <img onerror>', () => {
  const a = criarAmbiente({ reduzido: true });
  const g = criarGraficoLinha(a.novo(), { series: [{ id: 'a', nome: '<img src=x onerror=alert(1)>', valores: [1, 2] }, { id: 'b', nome: 'B', valores: [2, 1] }], eixoX: ['<b>x</b>', 'y'] });
  g.selecionar(0);
  assert.equal(a.raiz.querySelectorAll('img').length, 0);
  assert.equal(a.raiz.querySelectorAll('b:not(.chart-tip-val):not(.chart-leg-val)').length, 0);
  assert.ok(a.raiz.querySelector('.chart-tip').textContent.includes('<img src=x onerror=alert(1)>'));
});

test('área empilhada: camadas com rampa tonal (--_t) e total na tooltip; sem linha de contorno visível', () => {
  const a = criarAmbiente({ reduzido: true });
  criarGraficoArea(a.novo(), { series: [{ id: 'a', nome: 'A', valores: [3, 4, 5] }, { id: 'b', nome: 'B', valores: [1, 2, 3] }, { id: 'c', nome: 'C', valores: [1, 1, 1] }], eixoX: ['x', 'y', 'z'], total: true });
  const fills = [...a.raiz.querySelectorAll('.chart-area')].map((p) => p.getAttribute('fill'));
  assert.deepEqual(fills, ['var(--_t1)', 'var(--_t3)', 'var(--_t5)']);
  assert.equal(a.raiz.querySelectorAll('.chart-linha.is-camada').length, 3, 'o CSS esconde o traço das camadas');
  assert.match(a.raiz.querySelector('.chart-area').getAttribute('d'), /C/, 'curva suave');
});

test('barras: rótulos de categoria, ticks e legenda; destaque atenua as outras; horizontais não amontoam ticks', () => {
  const a = criarAmbiente({ reduzido: true });
  criarGraficoBarras(a.novo(), { modo: 'simples', categorias: MESES, series: [{ nome: 'S', valores: [1, 2, 3, 4, 5, 6] }], destaque: 2 });
  assert.deepEqual(textos(a.raiz, '.chart-eixo-x'), MESES);
  assert.equal(a.raiz.querySelectorAll('.chart-barra.is-suave').length, 5);
  assert.equal(a.raiz.querySelectorAll('.chart-valor').length, 1, 'só a destacada leva rótulo de valor');
  const b = criarAmbiente({ reduzido: true });
  b.raiz.style.width = '300px';
  criarGraficoBarras(b.novo(), { orientacao: 'horizontal', categorias: ['Banco A', 'Varejo B', 'Energia C'], series: [{ nome: 'P', valores: [18400, 14100, 3900] }], formatarY: (v) => `R$ ${v}`, largura: 300 });
  const ticks = textos(b.raiz, '.chart-eixo-x');
  assert.ok(ticks.length <= 4, `ticks do eixo de valores em tela estreita: ${ticks}`);
  assert.equal(b.raiz.querySelectorAll('.chart-eixo-cat').length, 3);
});

test('barras agrupadas/empilhadas/pílulas: uma barra por série e categoria; pílulas com pontas arredondadas e base flutuante', () => {
  const a = criarAmbiente({ reduzido: true });
  const series = [{ id: 'a', nome: 'A', valores: [1, 2] }, { id: 'b', nome: 'B', valores: [2, 1] }];
  criarGraficoBarras(a.novo(), { modo: 'agrupadas', categorias: ['x', 'y'], series });
  assert.equal(a.raiz.querySelectorAll('.chart-barra').length, 4);
  const p = criarAmbiente({ reduzido: true });
  criarGraficoPilulas(p.novo(), { categorias: ['x', 'y'], series: [series[0]], base: [5, 0] });
  const d = p.raiz.querySelector('.chart-barra').getAttribute('d');
  assert.equal((d.match(/A/g) || []).length, 4, 'pílula: 4 cantos arredondados');
});

test('anel: legenda com valor e %, soma 100%, centro com o total; anel de progresso mostra o texto', () => {
  const a = criarAmbiente({ reduzido: true });
  criarAnel(a.novo(), { fatias: [{ nome: 'A', valor: 750 }, { nome: 'B', valor: 250 }], centro: { rotulo: 'Total' } });
  assert.equal(a.raiz.querySelectorAll('.chart-fatia').length, 2);
  const leg = textos(a.raiz, '.chart-leg-val');
  assert.equal(leg.length, 2); assert.ok(leg[0].includes('75,0%') && leg[1].includes('25,0%'), leg.join('|'));
  assert.equal(a.raiz.querySelector('.chart-anel-valor').textContent.replace(/\u00a0/g, ' '), 'R$ 1.000,00');
  const p = criarAmbiente({ reduzido: true });
  criarAnelProgresso(p.novo(), { valor: 0.5, rotulo: '50%', subrotulo: 'da meta' });
  assert.equal(p.raiz.querySelector('.chart-anel-valor').textContent, '50%');
  assert.match(p.raiz.querySelector('.chart-anel-arco').getAttribute('d'), /^M/);
});

test('sparkline: criarSparkline pela direção; sparklineHtml é string de <svg> com aria escapado; <2 pontos vira traço vazio', () => {
  const a = criarAmbiente({ reduzido: true });
  const s = criarSparkline(a.novo(), { valores: [1, 2, 3] });
  assert.equal(s.direcao, 'up');
  assert.equal(a.raiz.querySelector('.chart-spark-linha').getAttribute('stroke'), 'var(--_up)');
  s.atualizar([3, 2, 1]);
  assert.equal(a.raiz.querySelector('.chart-spark-linha').getAttribute('stroke'), 'var(--_down)');
  const html = sparklineHtml([1, 3, 2], { aria: 'Alta "forte" <b>' });
  assert.match(html, /^<svg class="chart-spark chart-spark--anima" data-dir="up"/);
  assert.ok(html.includes('aria-label="Alta &quot;forte&quot; &lt;b&gt;"'));
  assert.ok(sparklineHtml([1]).includes('chart-spark--vazio'));
  assert.ok(sparklineHtml([3, 1], { cor: 'up' }).includes('color:var(--_up)'));
});

test('card padrão: rótulo/valor/delta, seletor de período com ✓ (aria-pressed), menu "•••" com tabela, estados vazio/carregando/erro/recarregando', () => {
  const a = criarAmbiente({ reduzido: true });
  let periodo = null; let tentou = 0;
  const g = criarGraficoLinha(a.novo(), {
    series: SERIES_LINHA, eixoX: MESES,
    card: { rotulo: 'Evolução', valor: 'R$ 10', delta: { texto: '+1,5%', sinal: 1 }, periodos: [{ id: '6m', rotulo: '6m' }, { id: '12m', rotulo: '12m' }], periodo: '6m', aoMudarPeriodo: (id, gr) => { periodo = id; assert.equal(gr, g); }, aoTentarNovamente: () => { tentou++; } },
  });
  const card = g.card;
  assert.equal(a.raiz.querySelector('.chart-card-rot').textContent, 'Evolução');
  assert.ok(a.raiz.querySelector('.chart-card-delta.is-up'));
  const btns = a.raiz.querySelectorAll('.chart-seg-btn');
  assert.deepEqual([...btns].map((b) => b.getAttribute('aria-pressed')), ['true', 'false']);
  assert.ok(btns[0].querySelector('.chart-seg-ck'), 'check no ativo');
  btns[1].click();
  assert.equal(periodo, '12m');
  assert.deepEqual([...btns].map((b) => b.getAttribute('aria-pressed')), ['false', 'true']);
  const mais = a.raiz.querySelector('.chart-card-mais');
  mais.click();
  assert.equal(mais.getAttribute('aria-expanded'), 'true');
  a.raiz.querySelector('.chart-card-menu-item').click();
  assert.equal(a.raiz.querySelector('.chart-corpo').hidden, true, '"Ver como tabela" do menu mostra a tabela');
  card.definirEstado('carregando');
  assert.equal(a.raiz.querySelectorAll('.chart-sk-barra').length, 6);
  assert.equal(card.raiz.getAttribute('aria-busy'), 'true');
  card.definirEstado('vazio', 'Nada por aqui');
  assert.equal(a.raiz.querySelector('.chart-card-estado-txt').textContent, 'Nada por aqui');
  card.definirEstado('erro');
  a.raiz.querySelector('.chart-card-retry').click();
  assert.equal(tentou, 1);
  card.definirEstado('ok');
  assert.equal(card.corpo.hidden, false);
  card.recarregando(true);
  assert.ok(card.raiz.classList.contains('is-recarregando'));
  g.destruir();
  assert.equal(a.raiz.querySelector('.chart-card'), null);
});

test('KPI, barra de progresso e barra de composição montam e atualizam', () => {
  const a = criarAmbiente({ reduzido: true });
  const k = criarKpi(a.novo(), { rotulo: 'Total', valor: 1500, formatar: (v) => `R$ ${Math.round(v)}`, delta: { texto: '1%', sinal: -1 }, info: 'ajuda' });
  assert.equal(a.raiz.querySelector('.chart-kpi-val').textContent, 'R$ 1500');
  assert.ok(a.raiz.querySelector('.chart-kpi-delta.is-down'));
  k.atualizar({ valor: 2000 });
  assert.equal(a.raiz.querySelector('.chart-kpi-val').textContent, 'R$ 2000');
  const b = criarAmbiente({ reduzido: true });
  const bp = criarBarraProgresso(b.novo(), { valor: 0.4, meta: 0.6, rotulo: 'Reserva' });
  assert.equal(b.raiz.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '40');
  bp.atualizar({ valor: 0.8 });
  assert.equal(b.raiz.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '80');
  const c = criarAmbiente({ reduzido: true });
  criarBarraComposicao(c.novo(), { fatias: [{ nome: 'A', valor: 3 }, { nome: 'B', valor: 1 }] });
  assert.equal(c.raiz.querySelectorAll('.chart-comp-seg').length, 2);
  assert.equal(c.raiz.querySelector('.chart-comp').getAttribute('aria-label'), 'A 75,0%, B 25,0%');
});

test('legenda clicável alterna a série (e o eixo reescala); a última série visível não some', () => {
  const a = criarAmbiente({ reduzido: true });
  const g = criarGraficoLinha(a.novo(), { series: [{ id: 'p', nome: 'Pequena', valores: [1, 2, 3] }, { id: 'g', nome: 'Grande', valores: [1000, 2000, 3000] }], eixoX: ['a', 'b', 'c'], formatarY: String });
  const maxY = () => Math.max(...textos(a.raiz, '.chart-eixo-y').map(Number));
  assert.ok(maxY() >= 3000);
  a.raiz.querySelectorAll('.chart-leg-item')[1].click();
  assert.ok(maxY() <= 5, `com "Grande" oculta o eixo reescala (max ${maxY()})`);
  assert.equal(a.raiz.querySelectorAll('.chart-leg-item')[1].getAttribute('aria-pressed'), 'false');
  a.raiz.querySelectorAll('.chart-leg-item')[0].click();
  assert.equal(a.raiz.querySelectorAll('.chart-leg-item')[0].getAttribute('aria-pressed'), 'true', 'a única visível não pode ser desligada');
  g.destruir();
});
