// Testes de assets/js/pages/inicio-comparativo.js (02/10/2026 - "Ontem era"
// + os 3 meses anteriores, pedido B do Tiago) e da integração no motor de
// gráficos da Início (período personalizado, comparativo, Análise, IPCA).
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { calcularComparativo, htmlComparativo, periodoAplicaComparativo, ajusteMarcacaoDoCampo } from '../assets/js/pages/inicio-comparativo.js';
import { wireGraficoRentabilidade, filtrarHistoricoPorPeriodo, renderGraficoRentabilidade } from '../assets/js/pages/inicio.js';

/** Histórico diário de 01/06 a 02/10/2026; patrimônio sobe R$ 10/dia; fim de semana sem pregão. */
function historico() {
  const out = [];
  const ini = Date.UTC(2026, 5, 1);
  for (let i = 0; ; i += 1) {
    const dt = new Date(ini + i * 86400000);
    const data = dt.toISOString().slice(0, 10);
    if (data > '2026-10-02') break;
    const dow = dt.getUTCDay();
    out.push({
      data, pregao: dow !== 0 && dow !== 6, patrimonio: 10000 + i * 10, longoPrazo: 6000 + i * 5, rendaEmergencial: 4000 + i * 5, nacional: 5000,
      fluxoCaixaPatrimonio: 0, fluxoCaixaLongoPrazo: 0, fluxoCaixaRendaEmergencial: 0,
      ibovespa: 100000 + i * 50, indiceCdi: 100 + i * 0.04, indiceIpca: 100 + Math.floor(i / 30) * 0.4,
      acoes: 3000 + i * 6, fiis: 1000, acoesEua: 0, rendaFixaTotal: 6000 + i * 4, fluxoCaixaAcoes: 0, fluxoCaixaFiis: 0, fluxoCaixaAcoesEua: 0, fluxoCaixaRendaFixaTotal: 0,
    });
  }
  return out;
}
const valorEm = (h, data) => h.find((p) => p.data === data).patrimonio;

test('periodoAplicaComparativo(): só períodos de até 1 mês', () => {
  assert.equal(periodoAplicaComparativo('mes'), true);
  assert.equal(periodoAplicaComparativo('30d'), true);
  assert.equal(periodoAplicaComparativo('6m'), false);
  assert.equal(periodoAplicaComparativo('3a'), false);
  assert.equal(periodoAplicaComparativo({ inicio: '2026-10-02', fim: '2026-10-24' }), true);
  assert.equal(periodoAplicaComparativo({ inicio: '2026-08-01', fim: '2026-10-02' }), false);
});

test('calcularComparativo(): hoje - ontem = último pregão, meses = fechamento de set/ago/jul', () => {
  const h = historico();
  const c = calcularComparativo(h, 'patrimonio', 'mes', { janela: filtrarHistoricoPorPeriodo(h, 'mes') });
  assert.equal(c.aplica, true);
  assert.equal(c.referencia.data, '2026-10-02');
  assert.equal(c.ontem.data, '2026-10-01');
  assert.equal(c.ontem.ehOntem, true);
  assert.equal(c.ontem.valor, valorEm(h, '2026-10-01'));
  assert.ok(Math.abs(c.ontem.variacao - 10 / valorEm(h, '2026-10-01')) < 1e-12);
  assert.deepEqual(c.meses.map((m) => [m.nome, m.data]), [['Setembro', '2026-09-30'], ['Agosto', '2026-08-31'], ['Julho', '2026-07-31']]);
  assert.equal(c.meses[1].valor, valorEm(h, '2026-08-31'));
});

test('calcularComparativo(): valor ao vivo + "ontem" do back-end; ajuste de marcação da Renda Fixa nos valores passados', () => {
  const h = historico();
  h[h.length - 1].ajusteMarcacaoRendaFixa = 120;
  h[h.length - 1].ajusteMarcacaoRendaEmergencial = 20;
  assert.equal(ajusteMarcacaoDoCampo(h[h.length - 1], 'longoPrazo'), 100);
  assert.equal(ajusteMarcacaoDoCampo(h[h.length - 1], 'acoes'), 0);
  const c = calcularComparativo(h, 'patrimonio', '30d', { janela: filtrarHistoricoPorPeriodo(h, '30d'), valorReferencia: 99999, ontemValor: 11111 });
  assert.equal(c.referencia.valor, 99999);
  assert.equal(c.ontem.valor, 11111, 'ontem pronto do back-end');
  assert.equal(c.meses[0].valor, valorEm(h, '2026-09-30') + 120, 'mesma régua do valor de hoje');
});

test('calcularComparativo(): intervalo personalizado dentro de um mês - "ontem" = véspera do fim; meses anteriores ao mês do fim', () => {
  const h = historico();
  const p = { inicio: '2026-08-03', fim: '2026-08-24' };
  const c = calcularComparativo(h, 'patrimonio', p, { janela: filtrarHistoricoPorPeriodo(h, p), valorReferencia: 1, ontemValor: 2 });
  assert.equal(c.referencia.data, '2026-08-24');
  assert.equal(c.referencia.valor, valorEm(h, '2026-08-24'), 'não é hoje: ignora o valor ao vivo');
  assert.equal(c.ontem.data, '2026-08-21', 'segunda-feira volta pra sexta');
  assert.equal(c.ontem.ehOntem, true);
  assert.deepEqual(c.meses.map((m) => m.nome), ['Julho', 'Junho']);
});

test('calcularComparativo(): período longo não se aplica; buraco na série vira "Em dd/mm era"', () => {
  const h = historico();
  assert.equal(calcularComparativo(h, 'patrimonio', '12m', { janela: h }).aplica, false);
  assert.match(htmlComparativo(calcularComparativo(h, 'patrimonio', '6m', { janela: h })), /cmp-na[\s\S]*Ontem era[\s\S]*>—</);
  h.forEach((p) => { if (p.data >= '2026-09-26' && p.data < '2026-10-02') p.pregao = false; });
  const c = calcularComparativo(h, 'patrimonio', 'mes', { janela: filtrarHistoricoPorPeriodo(h, 'mes') });
  assert.equal(c.ontem.data, '2026-09-25');
  assert.equal(c.ontem.ehOntem, false);
  const html = htmlComparativo(c);
  assert.match(html, /Em 25\/09 era/);
  assert.match(html, /Setembro era/);
  assert.match(html, /cmp-var good/);
});

test('htmlComparativo(): "Ontem era" com seta e % do lado e os meses em paralelo', () => {
  const h = historico();
  const html = htmlComparativo(calcularComparativo(h, 'patrimonio', 'mes', { janela: filtrarHistoricoPorPeriodo(h, 'mes') }));
  const doc = new JSDOM(`<div>${html}</div>`).window.document;
  const itens = [...doc.querySelectorAll('.cmp-item')].map((e) => e.querySelector('.cmp-rot').textContent);
  assert.deepEqual(itens, ['Ontem era', 'Setembro era', 'Agosto era', 'Julho era']);
  assert.equal(doc.querySelectorAll('.cmp-meses .cmp-item').length, 3);
  assert.match(doc.querySelector('.cmp-item').textContent, /R\$\s11\.220,00▲0,09%/);
});

// --- integração no motor de gráficos -----------------------------------------

function domInicio() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="filter-tabs" id="periodoTabs">
      <button class="filter-tab active" data-periodo="mes">Mês atual</button>
      <button class="filter-tab" data-periodo="12m">12 meses</button>
    </div>
    <div class="rentab-card"><div id="info"></div><div id="chart"></div><div id="legenda"></div></div>
  </body></html>`);
  Object.defineProperty(dom.window, 'innerWidth', { value: 1200, configurable: true });
  return dom.window.document;
}

test('wireGraficoRentabilidade(): chip "Escolher período", comparativo e card de Análise; período personalizado redesenha tudo', () => {
  const doc = domInicio();
  const h = historico();
  wireGraficoRentabilidade(doc, {
    patrimonio: { total: h[h.length - 1].patrimonio },
    historico: h,
    periodoTabsContainer: doc.getElementById('periodoTabs'),
    periodoPersonalizado: { chave: 'teste.inicio' },
    ontem: { total: h[h.length - 2].patrimonio },
    paineis: [{ visaoId: 'total', infoContainer: doc.getElementById('info'), chartContainer: doc.getElementById('chart'), legendaContainer: doc.getElementById('legenda'), comparativo: true, analise: true }],
  });
  const tabs = doc.getElementById('periodoTabs');
  assert.ok(tabs.querySelector('.fp-chip'));
  assert.match(doc.getElementById('info').textContent, /Ontem era/);
  assert.match(doc.getElementById('info').textContent, /Setembro era/);
  const slot = doc.querySelector('#legenda + .ag-slot');
  assert.ok(slot && slot.querySelector('details.ag'), 'card de Análise logo depois da legenda');

  tabs._filtroPeriodo.definir({ inicio: '2026-08-03', fim: '2026-08-24' });
  assert.match(doc.getElementById('info').querySelector('.rentab-card-label').textContent, /em 24\/08\/2026/);
  assert.match(doc.getElementById('info').textContent, /Julho era/);
  const svgTexto = doc.getElementById('chart').textContent;
  assert.match(svgTexto, /24\/08/); // (a biblioteca rotula o eixo e a tabela acessível com dd/mm)
  assert.match(slot.querySelector('.ag-resumo').textContent, /de 03\/08 a 24\/08/);
  assert.equal(doc.querySelectorAll('.ag-slot').length, 1, 'não duplica o slot ao redesenhar');

  tabs.querySelector('[data-periodo="12m"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.match(doc.getElementById('info').querySelector('.rentab-cmp').textContent, /—/, '12 meses: só "—"');
});

test('renderGraficoRentabilidade(): benchmarksExtra acrescenta a linha do IPCA (Visão geral de Carteiras)', () => {
  const doc = domInicio();
  renderGraficoRentabilidade(doc, doc.getElementById('chart'), {
    historico: historico(), visaoId: 'total', periodoId: '12m', legendaContainer: doc.getElementById('legenda'),
    benchmarksExtra: [{ campo: 'indiceIpca', label: 'IPCA', cor: '--rf', dash: '3 3' }],
  });
  assert.deepEqual([...doc.querySelectorAll('#legenda .chart-leg-nome')].map((e) => e.textContent.trim()), ['Portfólio', 'Ibovespa', 'CDI', 'IPCA']);
  assert.ok(doc.querySelector('#chart path[stroke="var(--rf)"]'));
});
