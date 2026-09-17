// Unit tests for assets/js/pages/inicio.js. All the render functions are
// pure DOM builders (given a jsdom document + plain data, never fetch
// anything themselves) - montarPaginaInicio is the one real-world
// orchestrator, exercised here with a fake getHomeImpl instead of a real
// fetch/token, same pattern as shell.test.js's fake fetchImpl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  splitValorExibicao,
  criarTileIndice,
  criarTileCambio,
  renderIndicesCambio,
  resolverVisao,
  calcularDistribuicaoPorClasse,
  calcularDistribuicaoRendaEmergencial,
  renderDistribuicao,
  renderResumoPatrimonio,
  filtrarHistoricoPorPeriodo,
  normalizarSerieRentabilidade,
  renderGraficoRentabilidade,
  renderInfoRentabilidade,
  wireGraficoRentabilidade,
  criarAtivoCard,
  renderMeusAtivos,
  wireFiltroAtivos,
  wireTooltipAtivos,
  renderAvisos,
  montarPaginaInicio,
} from '../assets/js/pages/inicio.js';

function makeDom(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

// --- splitValorExibicao ------------------------------------------------------

test('splitValorExibicao() splits at the decimal comma for a currency value', () => {
  assert.deepEqual(splitValorExibicao('R$ 5,09'), { principal: 'R$ 5', dec: ',09' });
});

test('splitValorExibicao() splits at the last thousands separator when there is no decimal part', () => {
  assert.deepEqual(splitValorExibicao('185.600'), { principal: '185', dec: '.600' });
});

test('splitValorExibicao() returns the whole string as "principal" when there is no separator at all', () => {
  assert.deepEqual(splitValorExibicao('—'), { principal: '—', dec: '' });
});

// --- criarTileIndice / criarTileCambio --------------------------------------

test('criarTileIndice() renders the value, label, and a "good" (up) delta for a non-negative variação', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'Ibovespa', valor: 185600, variacaoDia: 1.2, extLinkHref: 'https://example.com' });
  assert.match(tile.querySelector('.widget-value').textContent, /185/);
  assert.match(tile.querySelector('.widget-label').textContent, /Ibovespa/);
  assert.equal(tile.querySelector('.widget-delta').textContent, '+1,20% hoje');
  assert.ok(tile.querySelector('.arrow-badge.good'));
});

test('criarTileIndice() com extLinkHref vira o cartão inteiro clicável (<a>), não um link solto dentro dele', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'Ibovespa', valor: 185600, variacaoDia: 1.2, extLinkHref: 'https://example.com/ibov' });
  assert.equal(tile.tagName, 'A');
  assert.equal(tile.getAttribute('href'), 'https://example.com/ibov');
  assert.equal(tile.getAttribute('target'), '_blank');
  assert.equal(tile.getAttribute('rel'), 'noopener');
  assert.equal(tile.querySelector('.ext-link'), null);
});

test('criarTileIndice() sem extLinkHref não vira link (fica <div>, nunca um <a> sem destino)', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'S&P 500', valor: 6500 });
  assert.equal(tile.tagName, 'DIV');
});

test('criarTileIndice() renders a "bad" (down) delta for a negative variação', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'IFIX', valor: 3761.37, variacaoDia: -0.9 });
  assert.equal(tile.querySelector('.widget-delta').textContent, '-0,90% hoje');
  assert.ok(tile.querySelector('.arrow-badge.bad'));
});

test('criarTileIndice() degrades gracefully (no arrow, em-dash delta) when variação is missing', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'S&P 500', valor: 6500 });
  assert.equal(tile.querySelector('.arrow-badge'), null);
  assert.equal(tile.querySelector('.widget-delta').textContent, '—');
});

test('criarTileCambio() renders the BRL value and a neutral "câmbio" delta, no arrow', () => {
  const doc = makeDom('');
  const tile = criarTileCambio(doc, { label: 'Dólar (USD/BRL)', valor: 5.09 });
  assert.match(tile.querySelector('.widget-value').textContent, /5/);
  assert.equal(tile.querySelector('.widget-delta').textContent, 'câmbio');
  assert.equal(tile.querySelector('.arrow-badge'), null);
});

test('criarTileCambio() com extLinkHref também vira o cartão inteiro clicável', () => {
  const doc = makeDom('');
  const tile = criarTileCambio(doc, { label: 'Euro (EUR/BRL)', valor: 5.92, extLinkHref: 'https://example.com/eur' });
  assert.equal(tile.tagName, 'A');
  assert.equal(tile.getAttribute('href'), 'https://example.com/eur');
});

// 16/09/2026: pedido do Tiago - o valor do câmbio é em reais (1 unidade
// da moeda = X reais), mas o SÍMBOLO mostrado tem que ser o da própria
// moeda do card (US$/€), não "R$" - antes usava formatBRL sempre,
// então o card do Dólar (e o do Euro) mostravam "R$" por engano.
test('criarTileCambio() usa o símbolo passado (US$/€) em vez de "R$" quando informado', () => {
  const doc = makeDom('');
  const tileUsd = criarTileCambio(doc, { label: 'Dólar (USD/BRL)', valor: 5.09, simbolo: 'US$' });
  assert.match(tileUsd.querySelector('.widget-value').textContent, /US\$/);
  assert.equal(tileUsd.querySelector('.widget-value').textContent.includes('R$'), false);

  const tileEur = criarTileCambio(doc, { label: 'Euro (EUR/BRL)', valor: 5.92, simbolo: '€' });
  assert.match(tileEur.querySelector('.widget-value').textContent, /€/);
  assert.equal(tileEur.querySelector('.widget-value').textContent.includes('R$'), false);
});

// --- renderIndicesCambio -----------------------------------------------------

test('renderIndicesCambio() renders one tile per field present, in order', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderIndicesCambio(doc, grid, {
    indices: { ibovespa: { valor: 185600, variacaoDia: -0.9 }, spx: { valor: 6500, variacaoDia: 0.4 } },
    cambio: { usd: 5.09 },
  });
  const labels = Array.from(grid.querySelectorAll('.widget-label')).map((el) => el.textContent.trim().split(' ')[0]);
  assert.equal(grid.querySelectorAll('.widget-tile').length, 3);
  assert.match(labels[0], /Ibovespa/);
});

test('renderIndicesCambio() shows a hint instead of a blank grid when nothing came back at all', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderIndicesCambio(doc, grid, {});
  assert.equal(grid.querySelectorAll('.widget-tile').length, 0);
  assert.match(grid.textContent, /Sem dado/);
});

test('renderIndicesCambio() clears previous content before re-rendering', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderIndicesCambio(doc, grid, { indices: { ibovespa: { valor: 1, variacaoDia: 1 } } });
  renderIndicesCambio(doc, grid, { cambio: { eur: 5.9 } });
  assert.equal(grid.querySelectorAll('.widget-tile').length, 1);
  assert.match(grid.querySelector('.widget-label').textContent, /Euro/);
});

test('renderIndicesCambio() monta o card do Dólar com símbolo US$ e o do Euro com €, nunca R$', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderIndicesCambio(doc, grid, { cambio: { usd: 5.09, eur: 5.92 } });
  const valores = Array.from(grid.querySelectorAll('.widget-value')).map((el) => el.textContent);
  assert.ok(valores.some((v) => v.includes('US$')));
  assert.ok(valores.some((v) => v.includes('€')));
  assert.equal(valores.some((v) => v.includes('R$')), false);
});

// --- resolverVisao / renderResumoPatrimonio -----------------------------------

const PATRIMONIO_EXEMPLO = {
  total: 147583.80,
  longoPrazo: 87356.59,
  rendaEmergencial: 60227.21,
  porClasse: { acoes: 20000, fiis: 15000, rendaFixa: 87356.59, acoesEua: 25227.21 },
};

test('resolverVisao() picks the right field + label for each known visão', () => {
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'total').valor, 147583.80);
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'longoPrazo').valor, 87356.59);
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'rendaEmergencial').valor, 60227.21);
});

test('resolverVisao() falls back to "total" for an unrecognized visão id', () => {
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'algo-inexistente').valor, 147583.80);
});

// ativos usados nos testes de distribuição - 2 posições de Renda Fixa,
// uma "longo-prazo" (Tesouro IPCA) e duas "emergencial" (Tesouro Selic +
// CDB), pra dar pra testar tanto calcularDistribuicaoPorClasse quanto
// calcularDistribuicaoRendaEmergencial com o mesmo fixture.
const ATIVOS_RESUMO_EXEMPLO = [
  { classe: 'acoes', ticker: 'BBAS3', precoAtual: 20, quantidade: 1000 }, // 20.000
  { classe: 'fiis', ticker: 'HGLG11', precoAtual: 150, quantidade: 100 }, // 15.000
  { classe: 'usa', ticker: 'AAPL', precoAtual: 100, quantidade: 50, precoAtualBRL: 550 }, // 27.500 (já convertido)
  { classe: 'rf', ticker: 'Tesouro IPCA · 2035', marca: 'longo-prazo', tipoInvestimento: 'Tesouro IPCA', valorAtualizado: 50000 },
  { classe: 'rf', ticker: 'Tesouro Selic · 2029', marca: 'emergencial', tipoInvestimento: 'Tesouro Selic', valorAtualizado: 30000 },
  { classe: 'rf', ticker: 'CDB Banco X', marca: 'emergencial', tipoInvestimento: 'CDB', valorAtualizado: 10000 },
];

test('calcularDistribuicaoPorClasse() soma o valor de posição de cada classe (Ações/FIIs/RF/EUA)', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5 });
  const porLabel = Object.fromEntries(distrib.map((f) => [f.label, f.valor]));
  assert.equal(porLabel['Ações'], 20000);
  assert.equal(porLabel['FIIs'], 15000);
  assert.equal(porLabel['Renda Fixa'], 90000); // 50.000 (longo prazo) + 30.000 + 10.000 (emergencial)
  assert.equal(porLabel['Ações EUA'], 27500);
});

test('calcularDistribuicaoPorClasse() com excluirEmergencial tira a reserva de emergência de dentro de Renda Fixa', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5, excluirEmergencial: true });
  const porLabel = Object.fromEntries(distrib.map((f) => [f.label, f.valor]));
  assert.equal(porLabel['Renda Fixa'], 50000, 'só a posição marca=longo-prazo (Tesouro IPCA) deveria sobrar');
  assert.equal(porLabel['Ações'], 20000, 'as outras classes não mudam - a reserva de emergência é só Renda Fixa');
});

test('calcularDistribuicaoPorClasse() usa precoAtual×câmbio como fallback quando o ativo EUA não vem com precoAtualBRL', () => {
  const semConversaoPronta = [{ classe: 'usa', ticker: 'AAPL', precoAtual: 100, quantidade: 50 }];
  const distrib = calcularDistribuicaoPorClasse(semConversaoPronta, { cambioUsd: 5 });
  assert.equal(distrib.find((f) => f.label === 'Ações EUA').valor, 25000); // 100 * 50 * 5
});

// 16/09/2026: pedido do Tiago - a fatia de Ações EUA precisa do valor
// em DÓLAR também (não só o BRL já somado acima), pra a legenda (ver
// renderDistribuicao) mostrar "US$ X (R$ Y)" em vez de só R$. Somado
// direto de precoAtual×quantidade (nunca convertido de volta a partir
// do BRL, pra não acumular arredondamento).
test('calcularDistribuicaoPorClasse() também devolve valorUsd (preço unitário em dólar × quantidade) na fatia Ações EUA', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5 });
  const fatiaUsa = distrib.find((f) => f.label === 'Ações EUA');
  assert.equal(fatiaUsa.valorUsd, 5000); // AAPL: 100 * 50
});

test('calcularDistribuicaoPorClasse() não adiciona valorUsd nas outras classes (Ações/FIIs/Renda Fixa)', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5 });
  distrib.filter((f) => f.label !== 'Ações EUA').forEach((f) => {
    assert.equal('valorUsd' in f, false);
  });
});

test('calcularDistribuicaoRendaEmergencial() agrupa por tipo de investimento, maior valor primeiro', () => {
  const distrib = calcularDistribuicaoRendaEmergencial(ATIVOS_RESUMO_EXEMPLO);
  assert.deepEqual(distrib.map((f) => f.label), ['Tesouro Selic', 'CDB'], 'só as posições marca=emergencial entram, ordenadas do maior pro menor');
  assert.equal(distrib[0].valor, 30000);
  assert.equal(distrib[1].valor, 10000);
});

test('renderDistribuicao() desenha uma fatia (arco do donut + item de legenda) por entrada', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Ações', cor: 'var(--acoes)', valor: 60 },
    { label: 'FIIs', cor: 'var(--fiis)', valor: 40 },
  ]);
  assert.equal(container.querySelectorAll('.distrib-arco').length, 2);
  assert.equal(container.querySelectorAll('.distrib-item').length, 2);
  assert.match(container.textContent, /60,0%/);
  assert.match(container.textContent, /40,0%/);
});

test('renderDistribuicao() mostra o valor em R$ de cada fatia, além da porcentagem (Tiago pediu os dois de volta na legenda)', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Ações', cor: 'var(--acoes)', valor: 60000 },
    { label: 'FIIs', cor: 'var(--fiis)', valor: 40000 },
  ]);
  const valores = Array.from(container.querySelectorAll('.distrib-valor')).map((el) => el.textContent);
  assert.deepEqual(valores, ['R$\xa060.000,00', 'R$\xa040.000,00']);
  assert.match(container.textContent, /60,0%/);
  assert.match(container.textContent, /40,0%/);
});

// 16/09/2026: pedido do Tiago - a fatia de Ações EUA (tem valorUsd)
// mostra USD com o equivalente em R$ entre parênteses, menor - as
// outras fatias (sem valorUsd) continuam só em R$, sem mudança.
test('renderDistribuicao() com valorUsd numa fatia mostra USD com o equivalente em R$ numa 2ª linha (Ações EUA)', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Ações', cor: 'var(--acoes)', valor: 60000 },
    { label: 'Ações EUA', cor: 'var(--usa)', valor: 27500, valorUsd: 5000 },
  ]);
  const valores = Array.from(container.querySelectorAll('.distrib-valor'));
  assert.match(valores[0].textContent, /R\$/);
  assert.equal(valores[0].textContent.includes('$5'), false);
  assert.match(valores[1].textContent, /\$5,000\.00|US\$/);
  assert.match(valores[1].textContent, /27\.500,00/);
  // 17/09/2026: o equivalente em R$ virou uma 2ª linha (.distrib-valor-abaixo)
  // embaixo do valor em dólar, em vez de ficar do lado na mesma linha
  // (.moeda-conv) - estourava a largura do card no mobile.
  const abaixo = valores[1].querySelector('.distrib-valor-abaixo');
  assert.ok(abaixo, 'equivalente em R$ vem numa span separada (menor/apagada), numa 2ª linha');
  assert.match(abaixo.textContent, /27\.500,00/);
});

test('renderDistribuicao() mostra um aviso (sem lançar) quando não há dado suficiente', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  assert.doesNotThrow(() => renderDistribuicao(doc, container, []));
  assert.match(container.textContent, /Sem dado/);
});

test('renderDistribuicao() põe um ícone "i" clicável (dataset.tooltip) com nome completo e % com 2 casas em cada item da legenda', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Renda Fixa - Tesouro Selic e afins', cor: 'var(--rf)', valor: 1 },
    { label: 'FIIs', cor: 'var(--fiis)', valor: 2 },
  ]);
  const [item1, item2] = container.querySelectorAll('.distrib-item');
  assert.equal(item1.classList.contains('info-alvo'), true);
  assert.ok(item1.querySelector('.info-icon'));
  assert.match(item1.dataset.tooltip, /Renda Fixa - Tesouro Selic e afins/);
  assert.match(item1.dataset.tooltip, /33,33%/);
  assert.match(item2.dataset.tooltip, /66,67%/);
});

test('renderResumoPatrimonio() mostra as 3 divisões juntas, sem precisar de clique nenhum', () => {
  const doc = makeDom('<div id="resumo"></div>');
  const resumo = doc.getElementById('resumo');
  renderResumoPatrimonio(doc, resumo, { patrimonio: PATRIMONIO_EXEMPLO, ativos: ATIVOS_RESUMO_EXEMPLO, cambio: { usd: 5 } });

  const cards = resumo.querySelectorAll('.resumo-card');
  assert.equal(cards.length, 3, 'Total + Longo Prazo + Renda Emergencial de cara, nenhuma aba pra clicar');
  assert.match(resumo.textContent, /147\.583/);
  assert.match(resumo.textContent, /87\.356/);
  assert.match(resumo.textContent, /60\.227/);
});

test('renderResumoPatrimonio() mostra a distribuição (donut) nos 3 cartões - Total/Longo Prazo por classe, Renda Emergencial por tipo', () => {
  const doc = makeDom('<div id="resumo"></div>');
  const resumo = doc.getElementById('resumo');
  renderResumoPatrimonio(doc, resumo, { patrimonio: PATRIMONIO_EXEMPLO, ativos: ATIVOS_RESUMO_EXEMPLO, cambio: { usd: 5 } });

  const cardTotal = resumo.querySelector('.resumo-card-total');
  assert.match(cardTotal.textContent, /Renda Fixa/);
  assert.ok(cardTotal.querySelector('.distrib-arco'), 'total deveria mostrar o donut de distribuição por classe');

  const outrosCards = Array.from(resumo.querySelectorAll('.resumo-card')).filter((c) => c !== cardTotal);
  const [cardLongoPrazo, cardRendaEmergencial] = outrosCards;
  assert.ok(cardLongoPrazo.querySelector('.distrib-arco'), 'Longo Prazo também mostra o donut agora');
  assert.match(cardRendaEmergencial.textContent, /Tesouro Selic/, 'Renda Emergencial mostra por tipo de investimento, não por classe');
});

test('renderResumoPatrimonio() shows a hint instead of throwing when patrimonio is missing', () => {
  const doc = makeDom('<div id="resumo"></div>');
  const resumo = doc.getElementById('resumo');
  renderResumoPatrimonio(doc, resumo, {});
  assert.match(resumo.textContent, /Sem dado/);
});

// pedido do Tiago (16/09/2026), continuação: a legenda do donut também
// usava `title` nativo - agora usa o mesmo tooltip por toque de
// wireTooltipAtivos (mesma técnica), ligado 1x no container ESTÁVEL de
// renderResumoPatrimonio (#resumoPatrimonio), não no de cada card.
test('renderResumoPatrimonio() no toque, tocar no ícone "i" de um item da legenda abre a tooltip; 2º toque fecha; toque fora fecha', () => {
  const doc = makeDom('<div id="resumo"></div>');
  const resumo = doc.getElementById('resumo');
  renderResumoPatrimonio(doc, resumo, { patrimonio: PATRIMONIO_EXEMPLO, ativos: ATIVOS_RESUMO_EXEMPLO, cambio: { usd: 5 } });

  const alvo = resumo.querySelector('.distrib-item');
  alvo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 20, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  const tooltip = doc.querySelector('.info-tooltip');
  assert.equal(tooltip.hidden, false);

  alvo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 20, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.querySelector('.info-tooltip').hidden, true);
});

test('renderResumoPatrimonio() redesenhar o mesmo container não duplica a div .info-tooltip', () => {
  const doc = makeDom('<div id="resumo"></div>');
  const resumo = doc.getElementById('resumo');
  renderResumoPatrimonio(doc, resumo, { patrimonio: PATRIMONIO_EXEMPLO, ativos: ATIVOS_RESUMO_EXEMPLO, cambio: { usd: 5 } });
  renderResumoPatrimonio(doc, resumo, { patrimonio: PATRIMONIO_EXEMPLO, ativos: ATIVOS_RESUMO_EXEMPLO, cambio: { usd: 5 } });
  assert.equal(doc.querySelectorAll('.info-tooltip').length, 1);
});

// --- filtrarHistoricoPorPeriodo / normalizarSerieRentabilidade / gráfico ----

/** 40 dias corridos, patrimonio crescendo 1000/dia, ibovespa e indiceCdi/indiceSelic
 * também subindo de forma previsível - dá pra calcular a mão o que cada teste espera. */
function gerarHistoricoExemplo(dias = 40) {
  const historico = [];
  for (let i = 0; i < dias; i += 1) {
    const d = new Date(2026, 0, 1 + i);
    historico.push({
      data: d.toISOString().slice(0, 10),
      patrimonio: 100000 + i * 1000,
      longoPrazo: 80000 + i * 800,
      rendaEmergencial: 20000 + i * 200,
      indiceCdi: 100 * (1 + i * 0.001),
      indiceSelic: 100 * (1 + i * 0.0009),
      ibovespa: i < 3 ? null : 120000 + i * 500, // simula "antes do 1º pregão da janela"
    });
  }
  return historico;
}

test('filtrarHistoricoPorPeriodo() corta os últimos N dias corridos do preset pedido', () => {
  const historico = gerarHistoricoExemplo(40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, '30d').length, 30);
  assert.equal(filtrarHistoricoPorPeriodo(historico, '30d')[0], historico[10]);
});

test('filtrarHistoricoPorPeriodo() com "tudo" (ou preset desconhecido) devolve o array inteiro', () => {
  const historico = gerarHistoricoExemplo(40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, 'tudo').length, 40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, 'nao-existe').length, 40);
});

test('filtrarHistoricoPorPeriodo() sem histórico (ou vazio) devolve array vazio, nunca lança', () => {
  assert.deepEqual(filtrarHistoricoPorPeriodo(undefined, '30d'), []);
  assert.deepEqual(filtrarHistoricoPorPeriodo([], '30d'), []);
});

test('filtrarHistoricoPorPeriodo("mes") recorta o MÊS-CALENDÁRIO do último dia de historico, não "os últimos 30 dias corridos"', () => {
  const historico = gerarHistoricoExemplo(40); // 01/01/2026 .. 09/02/2026 (o último dia é 09/02)
  const janela = filtrarHistoricoPorPeriodo(historico, 'mes');
  assert.equal(janela.length, 9, 'só os dias de fevereiro (01 a 09) - fevereiro só tem 9 dias corridos até aqui');
  assert.equal(janela[0].data, '2026-02-01');
  assert.equal(janela[janela.length - 1].data, historico[historico.length - 1].data);
});

test('normalizarSerieRentabilidade() calcula "% desde o início" a partir do 1º valor válido', () => {
  const janela = gerarHistoricoExemplo(5); // patrimonio: 100000,101000,102000,103000,104000
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio');
  assert.equal(serie[0], 0);
  assert.match(String(serie[4]), /4/); // (104000/100000 - 1) * 100 = 4
});

test('normalizarSerieRentabilidade() pula valores null (ibovespa antes do 1º pregão) sem quebrar - usa o 1º válido como base', () => {
  const janela = gerarHistoricoExemplo(5); // ibovespa: null,null,null,121500,122000
  const serie = normalizarSerieRentabilidade(janela, 'ibovespa');
  assert.equal(serie[0], null);
  assert.equal(serie[1], null);
  assert.equal(serie[2], null);
  assert.equal(serie[3], 0); // primeiro valor válido vira a base (0%)
});

test('normalizarSerieRentabilidade() sem nenhum valor válido na janela devolve tudo null (nunca divide por zero)', () => {
  const janela = [{ data: '2026-01-01', patrimonio: 0 }, { data: '2026-01-02', patrimonio: 0 }];
  assert.deepEqual(normalizarSerieRentabilidade(janela, 'patrimonio'), [null, null]);
});

// --- normalizarSerieRentabilidade() com campoFluxo (TWR - correção Gorilla) -

test('normalizarSerieRentabilidade() com campoFluxo NEUTRALIZA um aporte - depósito não aparece como ganho', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 110000, fluxoCaixaPatrimonio: 10000 }, // aporte de 10.000, 0 de ganho orgânico
    { data: '2026-01-03', patrimonio: 110000, fluxoCaixaPatrimonio: 0 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1]) < 1e-9, `esperado ~0%, veio ${serie[1]}`);
  assert.ok(Math.abs(serie[2]) < 1e-9, `esperado ~0%, veio ${serie[2]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo NEUTRALIZA uma retirada/venda - não aparece como perda', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 90000, fluxoCaixaPatrimonio: -10000 }, // retirada de 10.000, 0 de perda orgânica
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1]) < 1e-9, `esperado ~0%, veio ${serie[1]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo mede só o ganho ORGÂNICO quando aporte e ganho acontecem juntos', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    // 100.000 * 1,02 + aporte de 10.000 = 112.000 (2% de ganho orgânico + aporte)
    { data: '2026-01-02', patrimonio: 112000, fluxoCaixaPatrimonio: 10000 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.ok(Math.abs(serie[1] - 2) < 1e-9, `esperado 2%, veio ${serie[1]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo encadeia (compõe) retornos diários em vez de somar', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 110000, fluxoCaixaPatrimonio: 0 }, // +10%
    { data: '2026-01-03', patrimonio: 121000, fluxoCaixaPatrimonio: 0 }, // +10% de novo
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  // 1,10 * 1,10 - 1 = 0,21 -> 21%, não 20% (10% + 10% somado ingenuamente)
  assert.ok(Math.abs(serie[2] - 21) < 1e-9, `esperado 21% (composto), veio ${serie[2]}`);
});

test('normalizarSerieRentabilidade() sem campoFluxo mantém o cálculo antigo (compatibilidade com os benchmarks)', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000 },
    { data: '2026-01-02', patrimonio: 110000 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1] - 10) < 1e-9);
});

test('renderGraficoRentabilidade() desenha um <svg> com uma linha principal + 2 benchmarks pra visão "total"', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'total', periodoId: '30d' });
  const svg = container.querySelector('svg.rentab-chart');
  assert.ok(svg);
  assert.equal(svg.querySelectorAll('path').length, 3); // portfólio + ibovespa + cdi
});

test('renderGraficoRentabilidade() troca os benchmarks pra CDI+Selic na visão "rendaEmergencial"', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'rendaEmergencial', periodoId: '30d', legendaContainer: legenda });
  assert.match(legenda.textContent, /Selic/);
  assert.doesNotMatch(legenda.textContent, /Ibovespa/);
});

test('renderGraficoRentabilidade() mostra, junto do nome de cada benchmark, o quanto o PORTFÓLIO ganhou ou perdeu EM RELAÇÃO a ele (não o retorno absoluto do benchmark)', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  // patrimonio sobe 1000/dia (base 100000) e indiceCdi sobe 0.1%/dia (base 100) -
  // o portfólio cresce MUITO mais rápido que o CDI na janela, então a %
  // ao lado do CDI (portfólio − CDI) tem que ser positiva e grande - bem
  // diferente do retorno absoluto do próprio CDI (que seria só uns 2-3%).
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'total', periodoId: '30d', legendaContainer: legenda });
  assert.match(legenda.textContent, /CDI\s*\+2[0-9],/, 'CDI deveria vir com a diferença (~+23%), não o retorno absoluto dele (~+2,9%)');
  assert.ok(legenda.querySelector('.li-delta.good'), 'delta positivo (portfólio bateu o benchmark) usa a cor "good"');
});

test('renderGraficoRentabilidade() mostra NEGATIVO quando o portfólio fica ATRÁS do benchmark (bug real reportado pelo Tiago)', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  // Portfólio sobe só 0,8% na janela; Ibovespa sobe 20% - o portfólio fica
  // NITIDAMENTE atrás do Ibovespa, então a % ao lado dele tem que ser
  // negativa (não "+20%" - isso pareceria um ganho, quando na real é uma
  // perda relativa. Esse era exatamente o problema apontado no print: um
  // "+12,03%" verde do lado do Ibovespa enquanto o portfólio só subiu 5%).
  const historico = [
    { data: '2026-01-01', patrimonio: 100000, ibovespa: 100000, indiceCdi: 100 },
    { data: '2026-01-02', patrimonio: 100200, ibovespa: 105000, indiceCdi: 100.1 },
    { data: '2026-01-03', patrimonio: 100400, ibovespa: 110000, indiceCdi: 100.2 },
    { data: '2026-01-04', patrimonio: 100600, ibovespa: 115000, indiceCdi: 100.3 },
    { data: '2026-01-05', patrimonio: 100800, ibovespa: 120000, indiceCdi: 100.4 },
  ];
  renderGraficoRentabilidade(doc, container, { historico, visaoId: 'total', periodoId: 'tudo', legendaContainer: legenda });
  assert.match(legenda.textContent, /Ibovespa\s*-1[0-9],/, 'portfólio (+0,8%) muito atrás do Ibovespa (+20%) - diferença negativa, por volta de -19%');
  assert.ok(legenda.querySelector('.li-delta.bad'), 'delta negativo (portfólio atrás do benchmark) usa a cor "bad", nunca "good"');
});

test('renderGraficoRentabilidade() mostra um aviso (sem lançar) quando não há histórico suficiente', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  assert.doesNotThrow(() => renderGraficoRentabilidade(doc, container, { historico: [], visaoId: 'total', periodoId: '30d' }));
  assert.match(container.textContent, /Sem histórico/);
});

// --- Hover/touch do gráfico (13/09/2026, 3ª rodada - antes não tinha
// NENHUMA interação ligada ao SVG: mouse/touch não mostravam nada) -----------

// 5 dias corridos, com Ibovespa/CDI também variando, pra dar pra checar a
// tooltip trazendo o valor de cada série no mesmo dia.
const HISTORICO_HOVER_EXEMPLO = [
  { data: '2026-01-01', patrimonio: 100000, ibovespa: 100000, indiceCdi: 100 },
  { data: '2026-01-02', patrimonio: 101000, ibovespa: 101000, indiceCdi: 100.1 },
  { data: '2026-01-03', patrimonio: 102000, ibovespa: 102000, indiceCdi: 100.2 },
  { data: '2026-01-04', patrimonio: 103000, ibovespa: 103000, indiceCdi: 100.3 },
  { data: '2026-01-05', patrimonio: 104000, ibovespa: 104000, indiceCdi: 100.4 },
];

test('renderGraficoRentabilidade() esconde a tooltip e os pontos de hover antes de qualquer interação', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  assert.equal(container.querySelector('.rentab-tooltip').hidden, true);
  assert.equal(container.querySelector('.rentab-hover').hasAttribute('hidden'), true);
});

test('renderGraficoRentabilidade() pointermove sobre a área do gráfico mostra a tooltip com a data e o valor de cada série', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  const hitarea = container.querySelector('.rentab-hitarea');
  // Sem layout de verdade (jsdom), a largura do cartão cai no fallback de
  // 640px (ver larguraReal_) - padL=44, padR=8 -> plotW=588. O meio exato
  // da janela de 5 dias (índice 2, "03/01/2026") fica em clientX = padL +
  // plotW*0.5 = 338 (getBoundingClientRect também é 0 em jsdom, então
  // clientX já É a posição dentro do próprio <svg>).
  hitarea.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 338, clientY: 50, bubbles: true }));

  const tooltip = container.querySelector('.rentab-tooltip');
  assert.equal(tooltip.hidden, false);
  assert.match(tooltip.textContent, /03\/01\/2026/);
  assert.match(tooltip.textContent, /Portfólio/);
  assert.match(tooltip.textContent, /Ibovespa/);
  assert.match(tooltip.textContent, /CDI/);
  assert.equal(container.querySelector('.rentab-hover').hasAttribute('hidden'), false, 'linha-guia + pontos aparecem junto com a tooltip');
});

test('renderGraficoRentabilidade() pointerdown (toque, sem "arrastar" o dedo antes) também mostra a tooltip', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  container.querySelector('.rentab-hitarea')
    .dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', { clientX: 200, clientY: 50, bubbles: true }));

  assert.equal(container.querySelector('.rentab-tooltip').hidden, false);
});

test('renderGraficoRentabilidade() pointerleave esconde a tooltip e os pontos de novo', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  const hitarea = container.querySelector('.rentab-hitarea');
  hitarea.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 338, clientY: 50, bubbles: true }));
  assert.equal(container.querySelector('.rentab-tooltip').hidden, false);

  hitarea.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true }));
  assert.equal(container.querySelector('.rentab-tooltip').hidden, true);
  assert.equal(container.querySelector('.rentab-hover').hasAttribute('hidden'), true);
});

// --- renderInfoRentabilidade -------------------------------------------------

const PATRIMONIO_RENTAB_EXEMPLO = { total: 104000, longoPrazo: 90000, rendaEmergencial: 14000 };

test('renderInfoRentabilidade() mostra o valor atual + o R$ ganho/perdido + a variação em % no período (mesmo par de pontos que alimenta a linha do gráfico)', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  renderInfoRentabilidade(doc, container, {
    patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
    historico: gerarHistoricoExemplo(5), // patrimonio: 100000..104000 -> +R$4.000, +4% no período
    visaoId: 'total',
    periodoId: 'tudo',
  });
  assert.match(container.querySelector('.rentab-card-value').textContent, /104\.000/);
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /\+R\$\s*4\.000,00/, 'precisa mostrar o valor em R$ ganho, não só a %');
  assert.match(textoDelta, /\+4,00%/);
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('good'), true);
});

test('renderInfoRentabilidade() mostra o R$ PERDIDO (com sinal de menos, sem duplicar) quando o período é negativo', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  const historico = [
    { data: '2026-01-01', patrimonio: 104000 },
    { data: '2026-01-02', patrimonio: 102000 },
    { data: '2026-01-03', patrimonio: 100000 },
  ];
  renderInfoRentabilidade(doc, container, {
    patrimonio: { total: 100000 },
    historico,
    visaoId: 'total',
    periodoId: 'tudo',
  });
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /-R\$\s*4\.000,00/, 'perda de R$4.000 (104.000 -> 100.000), sinal único');
  assert.doesNotMatch(textoDelta, /-R\$\s*-/, 'nunca dois sinais de menos juntos');
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('bad'), true);
});

test('renderInfoRentabilidade() desconta o fluxo de caixa (aporte) também do R$ ganho, não só da % (correção Gorilla)', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  const historico = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    // +2.000 de ganho orgânico + aporte de 10.000 = 112.000 brutos, mas só 2.000 é ganho de verdade
    { data: '2026-01-02', patrimonio: 112000, fluxoCaixaPatrimonio: 10000 },
  ];
  renderInfoRentabilidade(doc, container, {
    patrimonio: { total: 112000 },
    historico,
    visaoId: 'total',
    periodoId: 'tudo',
  });
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /\+R\$\s*2\.000,00/, 'o aporte de 10.000 não pode contar como ganho - só os 2.000 orgânicos');
  assert.doesNotMatch(textoDelta, /12\.000,00/, 'não pode mostrar o delta bruto (112.000-100.000) sem descontar o aporte');
});

test('renderInfoRentabilidade() sem histórico suficiente no período mostra o valor mas nenhuma variação (nunca lança)', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  assert.doesNotThrow(() => renderInfoRentabilidade(doc, container, { patrimonio: PATRIMONIO_RENTAB_EXEMPLO, historico: [], visaoId: 'total' }));
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('na'), true);
});

// --- wireGraficoRentabilidade -------------------------------------------------

test('wireGraficoRentabilidade() renderiza os 3 painéis de cara (sempre visíveis, sem precisar de clique) e reage ao período em todos ao mesmo tempo', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="periodoTabs">
      <button class="filter-tab" data-periodo="30d">30 dias</button>
      <button class="filter-tab active" data-periodo="12m">12 meses</button>
    </div>
    <div id="infoTotal"></div><div id="chartTotal"></div><div id="legendaTotal"></div>
    <div id="infoRE"></div><div id="chartRE"></div><div id="legendaRE"></div>
  `);
  const historico = gerarHistoricoExemplo(40);
  const paineis = [
    { visaoId: 'total', infoContainer: doc.getElementById('infoTotal'), chartContainer: doc.getElementById('chartTotal'), legendaContainer: doc.getElementById('legendaTotal') },
    { visaoId: 'rendaEmergencial', infoContainer: doc.getElementById('infoRE'), chartContainer: doc.getElementById('chartRE'), legendaContainer: doc.getElementById('legendaRE') },
  ];

  wireGraficoRentabilidade(doc, {
    patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
    historico,
    periodoTabsContainer: doc.getElementById('periodoTabs'),
    paineis,
    periodoInicial: '12m',
  });

  assert.ok(doc.getElementById('chartTotal').querySelector('svg'), 'já renderiza de cara, sem esperar clique nenhum');
  assert.ok(doc.getElementById('chartRE').querySelector('svg'));
  assert.match(doc.getElementById('legendaRE').textContent, /Selic/, 'painel de Renda Emergencial já usa os benchmarks certos de cara');

  doc.getElementById('periodoTabs').querySelector('[data-periodo="30d"]')
    .dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  assert.equal(doc.getElementById('periodoTabs').querySelector('[data-periodo="30d"]').classList.contains('active'), true);
  assert.ok(doc.getElementById('chartTotal').querySelector('svg'), 'os dois painéis continuam atualizados no mesmo clique de período');
  assert.ok(doc.getElementById('chartRE').querySelector('svg'));
});

test('wireGraficoRentabilidade() sem periodoInicial explícito usa "mes" (o pill marcado active no HTML) como padrão', () => {
  // Compara o resultado sem periodoInicial contra o resultado com
  // periodoInicial:'mes' explícito - se os dois cartões renderizarem
  // idêntico, o default é mesmo 'mes' (14/09/2026, pedido do Tiago: trocar
  // o período padrão da Rentabilidade de "12 meses" pra "Mês atual").
  const historico = gerarHistoricoExemplo(400);

  function montarERetornarHtml(periodoInicial) {
    const doc = makeDom(`
      <div class="filter-tabs" id="periodoTabs">
        <button class="filter-tab active" data-periodo="mes">Mês atual</button>
        <button class="filter-tab" data-periodo="12m">12 meses</button>
      </div>
      <div id="infoTotal"></div><div id="chartTotal"></div><div id="legendaTotal"></div>
    `);
    wireGraficoRentabilidade(doc, {
      patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
      historico,
      periodoTabsContainer: doc.getElementById('periodoTabs'),
      paineis: [{ visaoId: 'total', infoContainer: doc.getElementById('infoTotal'), chartContainer: doc.getElementById('chartTotal'), legendaContainer: doc.getElementById('legendaTotal') }],
      ...(periodoInicial ? { periodoInicial } : {}),
    });
    return doc.getElementById('infoTotal').innerHTML;
  }

  const htmlSemPeriodoInicial = montarERetornarHtml(undefined);
  const htmlComMesExplicito = montarERetornarHtml('mes');
  const htmlCom12mExplicito = montarERetornarHtml('12m');

  assert.equal(htmlSemPeriodoInicial, htmlComMesExplicito);
  assert.notEqual(htmlSemPeriodoInicial, htmlCom12mExplicito);
});

// 14/09/2026 (botão "Atualizar dados" + timer automático - ver
// shell.js!mountRefreshControl): montarPaginaInicio agora pode chamar
// wireGraficoRentabilidade de novo (1x por carga de dado novo) no MESMO
// periodoTabsContainer - religar teria duplicado o listener de clique/
// resize. O teste central aqui não é só "não quebra" - é que o clique
// depois do refresh usa o dado NOVO, não fica preso na 1ª chamada.
test('wireGraficoRentabilidade() chamada de novo no mesmo periodoTabsContainer (refresh) atualiza com o dado novo sem religar o clique', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="periodoTabs">
      <button class="filter-tab" data-periodo="30d">30 dias</button>
      <button class="filter-tab active" data-periodo="12m">12 meses</button>
    </div>
    <div id="infoTotal"></div><div id="chartTotal"></div><div id="legendaTotal"></div>
  `);
  const periodoTabsContainer = doc.getElementById('periodoTabs');
  const paineis = [{ visaoId: 'total', infoContainer: doc.getElementById('infoTotal'), chartContainer: doc.getElementById('chartTotal'), legendaContainer: doc.getElementById('legendaTotal') }];

  wireGraficoRentabilidade(doc, {
    patrimonio: { total: 100000 },
    historico: gerarHistoricoExemplo(40),
    periodoTabsContainer,
    paineis,
    periodoInicial: '12m',
  });
  assert.match(doc.getElementById('infoTotal').querySelector('.rentab-card-value').textContent, /100\.000/);

  // "refresh": patrimônio novo, mesmo container.
  wireGraficoRentabilidade(doc, {
    patrimonio: { total: 250000 },
    historico: gerarHistoricoExemplo(40),
    periodoTabsContainer,
    paineis,
    periodoInicial: '12m',
  });
  assert.match(doc.getElementById('infoTotal').querySelector('.rentab-card-value').textContent, /250\.000/, 'a 2ª chamada precisa redesenhar com o patrimônio novo');

  // Clicar no período DEPOIS do refresh também precisa usar o dado novo -
  // se o clique tivesse ficado preso na 1ª chamada (closure antiga), isso
  // voltaria a mostrar 100.000.
  periodoTabsContainer.querySelector('[data-periodo="30d"]')
    .dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.match(doc.getElementById('infoTotal').querySelector('.rentab-card-value').textContent, /250\.000/);
});

// --- criarAtivoCard / renderMeusAtivos / wireFiltroAtivos -------------------

const ATIVO_ACAO_EXEMPLO = {
  classe: 'acoes', ticker: 'BBAS3', nome: 'Banco do Brasil', precoAtual: 22.14, variacaoDia: -0.012,
  vies: 'comprar', descontoPL: '12% (0,88 P/L)',
};

const ATIVO_USA_EXEMPLO = {
  classe: 'usa', ticker: 'CHTR', precoAtual: 320.5, precoAtualBRL: 1732.5, variacaoDia: 0.008,
  vies: 'aguardar', descontoPL: '-8% (14,2 P/L)',
};

const ATIVO_RF_EXEMPLO = {
  classe: 'rf', ticker: 'Tesouro Selic · 03/2029', codigo: 'TS-2029', marca: 'longo-prazo',
  tipoInvestimento: 'Tesouro Selic', indexador: 'Selic', vencimento: '03/2029',
  valorAtualizado: 12480.55, variacaoDia: 0.0004,
};

const ATIVO_FII_EXEMPLO = {
  classe: 'fiis', ticker: 'HGRU11', nome: 'CSHG Renda Urbana', tipo: 'Tijolo', precoAtual: 118.4,
  variacaoDia: 0.003, precoMedio: 102.9, quantidade: 37, descontoPVp: '108% (1,08 P/VP)',
};

test('criarAtivoCard() de Ações vira o cartão inteiro clicável, com viés e desconto', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_ACAO_EXEMPLO);
  assert.equal(card.tagName, 'A');
  assert.equal(card.getAttribute('href'), 'ativo.html?ref=BBAS3&classe=acoes');
  assert.match(card.querySelector('.ativo-ticker').textContent, /BBAS3/);
  assert.ok(card.querySelector('.vies-badge.comprar'));
  assert.equal(card.querySelector('.ativo-delta').classList.contains('bad'), true); // variação negativa
  assert.match(card.querySelector('.ativo-detalhe').textContent, /12%/);
});

test('criarAtivoCard() de Ações EUA mostra o preço convertido pra BRL ao lado do preço em USD', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_USA_EXEMPLO);
  assert.match(card.querySelector('.ativo-price').textContent, /320/);
  assert.match(card.querySelector('.ativo-price-conv').textContent, /1\.732/);
});

test('criarAtivoCard() de Renda Fixa usa "codigo" (não o rótulo composto) como ref, e mostra indexador+vencimento no lugar do desconto', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_RF_EXEMPLO);
  assert.equal(card.getAttribute('href'), 'ativo.html?ref=TS-2029&classe=rf');
  assert.equal(card.querySelector('.vies-badge'), null, 'Renda Fixa não tem preço-teto, então não tem viés');
  assert.match(card.querySelector('.ativo-detalhe').textContent, /Selic/);
  assert.match(card.querySelector('.ativo-detalhe').textContent, /03\/2029/);
  assert.match(card.querySelector('.ativo-price').textContent, /12\.480/);
});

test('renderMeusAtivos() filtra por classe e mostra um aviso pra categoria vazia', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  const ativos = [ATIVO_ACAO_EXEMPLO, ATIVO_USA_EXEMPLO, ATIVO_RF_EXEMPLO];

  renderMeusAtivos(doc, grid, ativos, 'todos');
  assert.equal(grid.querySelectorAll('.ativo-card').length, 3);

  renderMeusAtivos(doc, grid, ativos, 'fiis');
  assert.match(grid.textContent, /Nenhum ativo/);
});

test('wireFiltroAtivos() re-renderiza a grade filtrada e alterna a classe active', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="tabs">
      <button class="filter-tab active" data-classe="todos">Todos</button>
      <button class="filter-tab" data-classe="rf">Renda Fixa</button>
    </div>
    <div id="grid"></div>
  `);
  const tabs = doc.getElementById('tabs');
  const grid = doc.getElementById('grid');
  const ativos = [ATIVO_ACAO_EXEMPLO, ATIVO_RF_EXEMPLO];
  renderMeusAtivos(doc, grid, ativos, 'todos');
  wireFiltroAtivos(doc, tabs, grid, ativos);

  tabs.querySelector('[data-classe="rf"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  assert.equal(grid.querySelectorAll('.ativo-card').length, 1);
  assert.equal(tabs.querySelector('[data-classe="rf"]').classList.contains('active'), true);
});

test('wireFiltroAtivos() chamada de novo no mesmo tabsContainer (refresh) redesenha com os ativos novos, mantendo a aba ativa, sem religar o clique', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="tabs">
      <button class="filter-tab" data-classe="todos">Todos</button>
      <button class="filter-tab active" data-classe="rf">Renda Fixa</button>
    </div>
    <div id="grid"></div>
  `);
  const tabs = doc.getElementById('tabs');
  const grid = doc.getElementById('grid');
  const ativoRfNovo = { ...ATIVO_RF_EXEMPLO, codigo: 'TS-2031' };

  // Mesmo padrão de uso real (montarPaginaInicio): renderMeusAtivos desenha
  // a grade 1ª vez, wireFiltroAtivos só liga o clique - não redesenha nada
  // sozinho na 1ª chamada.
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO, ATIVO_RF_EXEMPLO], 'rf'); // aba "Renda Fixa" já ativa no HTML
  wireFiltroAtivos(doc, tabs, grid, [ATIVO_ACAO_EXEMPLO, ATIVO_RF_EXEMPLO]);
  assert.equal(grid.querySelectorAll('.ativo-card').length, 1);

  // "refresh": ativos novos (RF trocado), mesmo container - continua na
  // aba ativa (Renda Fixa) e mostra o RF novo, não o antigo.
  wireFiltroAtivos(doc, tabs, grid, [ATIVO_ACAO_EXEMPLO, ativoRfNovo]);
  assert.equal(grid.querySelectorAll('.ativo-card').length, 1);
  assert.equal(grid.querySelector('.ativo-card').getAttribute('href'), 'ativo.html?ref=TS-2031&classe=rf');

  // Clicar numa aba DEPOIS do refresh também usa os ativos novos (prova
  // que o clique não ficou preso na 1ª chamada).
  tabs.querySelector('[data-classe="todos"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(grid.querySelectorAll('.ativo-card').length, 2);
  assert.ok(Array.from(grid.querySelectorAll('.ativo-card')).some((c) => c.getAttribute('href').includes('TS-2031')));
});

// --- wireTooltipAtivos -------------------------------------------------------
// Tooltip de hover/touch de cada .ativo-card (Nome, Quantidade, Preço
// Teto/Médio, Descontos sobre P/VP e P/L, ou os campos de Renda Fixa) -
// desenhado em docs/direcao-visual.html, decisão em docs/mapa-paginas.html.
// Tiago apontou (13/09/2026, 3ª rodada) que essa tooltip nunca tinha saído
// do mockup pro código de verdade.

test('wireTooltipAtivos() no pointermove sobre um cartão de Ação mostra Nome, Quantidade, Preço Teto/Médio e os descontos', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  const ativo = { ...ATIVO_ACAO_EXEMPLO, quantidade: 140, precoMedio: 18.9, precoTeto: 26.4, descontoPVp: '132% (1,32 P/VP)' };
  renderMeusAtivos(doc, grid, [ativo], 'todos');
  wireTooltipAtivos(doc, grid);

  const card = grid.querySelector('.ativo-card');
  card.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));

  const tooltip = doc.body.querySelector('.ativo-tooltip');
  assert.equal(tooltip.hidden, false);
  assert.match(tooltip.textContent, /BBAS3/);
  assert.match(tooltip.textContent, /Banco do Brasil/);
  assert.match(tooltip.textContent, /Quantidade de ações/);
  assert.match(tooltip.textContent, /140/);
  assert.match(tooltip.textContent, /Preço teto/);
  assert.match(tooltip.textContent, /Preço médio/);
  assert.match(tooltip.textContent, /Desconto sobre P\/L/);
  assert.match(tooltip.textContent, /12% \(0,88 P\/L\)/);
});

test('wireTooltipAtivos() de FII mostra Tipo (Tijolo/Papel) em vez de Desconto sobre P/L, e a Quantidade de cotas', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_FII_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  grid.querySelector('.ativo-card')
    .dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));

  const tooltip = doc.body.querySelector('.ativo-tooltip');
  assert.match(tooltip.textContent, /CSHG Renda Urbana/);
  assert.match(tooltip.textContent, /Tijolo/);
  assert.match(tooltip.textContent, /Quantidade de cotas/);
  assert.match(tooltip.textContent, /37/);
  assert.match(tooltip.textContent, /108% \(1,08 P\/VP\)/);
  assert.doesNotMatch(tooltip.textContent, /P\/L/, 'FII não tem P/L, mostra Tipo no lugar');
});

test('wireTooltipAtivos() de Ações EUA mostra Preço Teto/Médio em US$ com o equivalente em R$, e omite Desconto sobre P/L quando a planilha não tem esse dado', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  const ativo = {
    classe: 'usa', ticker: 'CHTR', nome: 'Charter Communications', precoAtual: 320.5, precoAtualBRL: 1732.5,
    variacaoDia: 0.008, vies: 'aguardar', quantidade: 12, precoTeto: 340, precoTetoBRL: 1836,
    precoMedio: 280, precoMedioBRL: 1512, descontoPVp: '95% (0,95 P/VP)',
  };
  renderMeusAtivos(doc, grid, [ativo], 'todos');
  wireTooltipAtivos(doc, grid);

  grid.querySelector('.ativo-card')
    .dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));

  const tooltip = doc.body.querySelector('.ativo-tooltip');
  assert.match(tooltip.textContent, /Charter Communications/);
  assert.match(tooltip.textContent, /\$340\.00/, 'preço teto em USD (formatUSD - símbolo "$", ponto decimal)');
  assert.match(tooltip.textContent, /R\$.1\.836,00/, 'equivalente em R$ (formatBRL) entre parênteses ao lado');
  assert.match(tooltip.textContent, /95% \(0,95 P\/VP\)/);
  assert.doesNotMatch(tooltip.textContent, /P\/L/, 'Ações EUA ainda não tem P\/L na planilha - linha omitida, não "—"');
});

test('wireTooltipAtivos() de Renda Fixa mostra Tipo de investimento, Indexador, Vencimento e Valor atualizado (não Nome/Quantidade)', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_RF_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  grid.querySelector('.ativo-card')
    .dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));

  const tooltip = doc.body.querySelector('.ativo-tooltip');
  assert.match(tooltip.textContent, /Tipo de investimento/);
  assert.match(tooltip.textContent, /Tesouro Selic/);
  assert.match(tooltip.textContent, /Indexador/);
  assert.match(tooltip.textContent, /Vencimento/);
  assert.match(tooltip.textContent, /03\/2029/);
  assert.match(tooltip.textContent, /Valor atualizado/);
  assert.match(tooltip.textContent, /12\.480,55/);
  assert.doesNotMatch(tooltip.textContent, /Quantidade/);
});

test('wireTooltipAtivos() pointerdown (toque) também mostra a tooltip, e pointerleave esconde de novo', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const card = grid.querySelector('.ativo-card');
  card.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false);

  grid.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, true);
});

test('wireTooltipAtivos() chamada de novo no mesmo container (refresh) não duplica a div de tooltip nem os listeners', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);
  wireTooltipAtivos(doc, grid); // simula um refresh (montarPaginaInicio chamando de novo)

  assert.equal(doc.body.querySelectorAll('.ativo-tooltip').length, 1);

  const card = grid.querySelector('.ativo-card');
  card.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false);
});

// pedido do Tiago (16/09/2026): "quando é mobile, todos os lugares que
// possuem um tooltip, faça com que tenha um i do lado, clicável... Se eu
// clico fora, o tooltip some" - no toque (pointerType 'touch'/'pen'), só
// o ícone .ativo-info-icon abre/fecha a tooltip (o cartão inteiro é um
// link, não pode virar gatilho de toque sem disparar a navegação junto).

test('wireTooltipAtivos() no toque (pointerType "touch"), só o ícone "i" abre a tooltip - tocar no resto do cartão não faz nada', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const card = grid.querySelector('.ativo-card');
  card.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 50, clientY: 50, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, true, 'tocar fora do ícone "i" não abre nada');

  const icone = card.querySelector('.ativo-info-icon');
  icone.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 52, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false, 'tocar no ícone "i" abre a tooltip');
});

test('wireTooltipAtivos() no toque, tocar de novo no mesmo ícone "i" fecha (alterna) - e pointerleave sozinho não fecha mais', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const icone = grid.querySelector('.ativo-card .ativo-info-icon');
  icone.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 52, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false);

  // No toque, o fim do toque já dispara pointerleave (o dedo "sai" da
  // tela) - isso NÃO pode fechar a tooltip sozinho, senão é o bug
  // relatado pelo Tiago ("o tooltip aparece e some").
  grid.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true, pointerType: 'touch' }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false, 'pointerleave no toque não esconde');

  icone.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 52, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, true, '2º toque no mesmo ícone fecha (alterna)');
});

test('wireTooltipAtivos() no toque, tocar fora do cartão aberto fecha a tooltip', () => {
  const doc = makeDom('<div id="grid"></div><div id="fora">Fora do cartão</div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO, ATIVO_FII_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const icone = grid.querySelectorAll('.ativo-card .ativo-info-icon')[0];
  icone.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 52, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false);

  doc.getElementById('fora').dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 900, clientY: 900, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, true, 'toque fora do cartão fecha a tooltip aberta');
});

test('wireTooltipAtivos() clicar no ícone "i" nunca navega (preventDefault/stopPropagation), mesmo no mouse', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const icone = grid.querySelector('.ativo-card .ativo-info-icon');
  const evento = new doc.defaultView.Event('click', { bubbles: true, cancelable: true });
  icone.dispatchEvent(evento);
  assert.equal(evento.defaultPrevented, true);
});

// --- renderAvisos ------------------------------------------------------------

test('renderAvisos() hides the banner when there are no avisos', () => {
  const doc = makeDom('<div id="avisos"></div>');
  const banner = doc.getElementById('avisos');
  renderAvisos(banner, undefined);
  assert.equal(banner.hidden, true);
  renderAvisos(banner, {});
  assert.equal(banner.hidden, true);
});

test('renderAvisos() shows every failed section', () => {
  const doc = makeDom('<div id="avisos"></div>');
  const banner = doc.getElementById('avisos');
  renderAvisos(banner, { historico: 'Error: aba não encontrada', ativos: 'Error: timeout' });
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /historico/);
  assert.match(banner.textContent, /ativos/);
});

// --- montarPaginaInicio -------------------------------------------------------

function makePaginaDom() {
  return makeDom(`
    <div class="inicio-loading" id="inicioLoading"></div>
    <div class="inicio-erro" id="inicioErro" hidden></div>
    <div id="inicioConteudo" hidden>
      <div id="refreshControlInicio"></div>
      <div class="avisos-banner" id="inicioAvisos" hidden></div>
      <div class="widget-grid" id="indicesCambioGrid"></div>
      <div id="resumoPatrimonio"></div>
      <div class="filter-tabs" id="periodoTabs">
        <button class="filter-tab" data-periodo="30d">30 dias</button>
        <button class="filter-tab active" data-periodo="12m">12 meses</button>
      </div>
      <div id="rentabInfoTotal"></div><div id="rentabChartTotal"></div><div id="rentabLegendaTotal"></div>
      <div id="rentabInfoLongoPrazo"></div><div id="rentabChartLongoPrazo"></div><div id="rentabLegendaLongoPrazo"></div>
      <div id="rentabInfoRendaEmergencial"></div><div id="rentabChartRendaEmergencial"></div><div id="rentabLegendaRendaEmergencial"></div>
      <div class="filter-tabs" id="filtroAtivosTabs">
        <button class="filter-tab active" data-classe="todos">Todos</button>
        <button class="filter-tab" data-classe="rf">Renda Fixa</button>
      </div>
      <div id="meusAtivosGrid"></div>
    </div>
  `);
}

test('montarPaginaInicio() renders every section and hides the loading state on success', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({
    ok: true,
    patrimonio: PATRIMONIO_EXEMPLO,
    indices: { ibovespa: { valor: 185600, variacaoDia: -0.9 } },
    cambio: { usd: 5.09, eur: 5.92 },
  });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl });

  assert.equal(doc.getElementById('inicioLoading').hidden, true);
  assert.equal(doc.getElementById('inicioConteudo').hidden, false);
  assert.equal(doc.getElementById('indicesCambioGrid').querySelectorAll('.widget-tile').length, 3); // ibovespa + usd + eur
  assert.ok(doc.getElementById('resumoPatrimonio').querySelector('.resumo-value'));
  assert.equal(doc.getElementById('inicioErro').hidden, true);
});

test('montarPaginaInicio() shows the error state (and keeps the content hidden) when the back-end rejects the call', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({ ok: false, etapa: 'autenticação', erro: 'token expirado' });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl });

  assert.equal(doc.getElementById('inicioLoading').hidden, true);
  assert.equal(doc.getElementById('inicioConteudo').hidden, true);
  assert.equal(doc.getElementById('inicioErro').hidden, false);
  assert.match(doc.getElementById('inicioErro').textContent, /token expirado/);
});

test('montarPaginaInicio() surfaces avisos (partial section failure) without hiding the rest', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({
    ok: true,
    patrimonio: PATRIMONIO_EXEMPLO,
    indices: {},
    cambio: {},
    avisos: { historico: 'Error: algo falhou' },
  });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl });

  assert.equal(doc.getElementById('inicioConteudo').hidden, false);
  assert.equal(doc.getElementById('inicioAvisos').hidden, false);
  assert.match(doc.getElementById('inicioAvisos').textContent, /historico/);
});

// 14/09/2026 (pedido do Tiago: botão de atualizar + timer, sem mostrar
// skeleton de novo ao clicar): monta o botão "Atualizar dados" e clicar
// nele busca de novo (getHomeImpl 2ª vez) e redesenha - sem voltar a
// mostrar o skeleton (inicioLoading fica escondido o tempo todo depois
// da 1ª carga) e sem duplicar os widgets (prova que
// wireGraficoRentabilidade/wireFiltroAtivos/wireTooltipAtivos, chamados
// de novo dentro de carregarERedesenhar, não religam listener nem
// tooltip).
test('montarPaginaInicio(): clicar em "Atualizar dados" busca de novo e redesenha, sem mostrar o skeleton de novo', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  const getHomeImpl = async () => {
    chamadasGet += 1;
    return {
      ok: true,
      patrimonio: { ...PATRIMONIO_EXEMPLO, total: chamadasGet === 1 ? 100000 : 250000 },
      indices: { ibovespa: { valor: 185600, variacaoDia: -0.9 } },
      cambio: { usd: 5.09, eur: 5.92 },
    };
  };

  await montarPaginaInicio('token-fake', { doc, getHomeImpl });
  assert.equal(chamadasGet, 1);
  assert.equal(doc.getElementById('inicioLoading').hidden, true);
  assert.match(doc.getElementById('resumoPatrimonio').textContent, /100\.000/);

  const btn = doc.getElementById('refreshControlInicio').querySelector('.refresh-btn');
  assert.ok(btn, 'montarPaginaInicio precisa montar o botão de atualizar em #refreshControlInicio');
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamadasGet, 2);
  assert.equal(doc.getElementById('inicioLoading').hidden, true, 'skeleton nunca reaparece num refresh');
  assert.equal(doc.getElementById('indicesCambioGrid').querySelectorAll('.widget-tile').length, 3, 'widgets não duplicam');
  assert.match(doc.getElementById('resumoPatrimonio').textContent, /250\.000/, 'redesenha com o patrimônio novo');
});
