// Unit tests for assets/js/pages/distribuicoes-metas.js. Same pattern as
// tests/inicio.test.js: os builders de DOM são funções puras (jsdom
// document + dado plano, nunca buscam nada sozinhos) - montarPaginaDistribuicoesMetas
// é o único orquestrador de verdade, testado aqui com impls falsas em vez
// de fetch/token reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  formatPercentualMeta,
  criarAnelProgresso,
  criarCardMeta,
  renderMetasCarteira,
  renderAvisos,
  montarPaginaDistribuicoesMetas,
  criarLinhaObjetivo,
  criarBlocoObjetivo,
  renderObjetivosCarteira,
  renderRadarOportunidades,
  renderSplitInterno,
} from '../assets/js/pages/distribuicoes-metas.js';

function makeDom(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

const METAS_EXEMPLO = {
  rendaPassiva: { meta: 500, mediaUlt12Meses: 368.8625, percentualAtingido: 0.737725 },
  patrimonio: {
    extra: 4000,
    percentualReinvestimento: 0.25,
    rendimentoMedio: 0.06,
    meta: 3472951.25,
    carteiraAtual: 149247.48,
    percentualAtingido: 0.042974,
  },
  rendaEmergencial: {
    mediaGastos: 9891.805,
    meses: 6,
    meta: 65285.913,
    carteiraAtual: 60945.47,
    percentualAtingido: 0.933516,
    atingida: false,
  },
};

// --- formatPercentualMeta ------------------------------------------------------

test('formatPercentualMeta() arredonda a fração pro inteiro mais próximo', () => {
  assert.equal(formatPercentualMeta(0.7377), '74%');
  assert.equal(formatPercentualMeta(0), '0%');
  assert.equal(formatPercentualMeta(1.3), '130%');
});

test('formatPercentualMeta() devolve travessão pra valor não-finito', () => {
  assert.equal(formatPercentualMeta(undefined), '—');
  assert.equal(formatPercentualMeta(NaN), '—');
  assert.equal(formatPercentualMeta(''), '—');
});

// --- criarAnelProgresso ------------------------------------------------------

test('criarAnelProgresso() monta o SVG com os 2 círculos e o texto central', () => {
  const doc = makeDom('');
  const svg = criarAnelProgresso(doc, { percentual: 0.5, cor: 'var(--acoes)' });

  assert.equal(svg.tagName.toLowerCase(), 'svg');
  const circles = svg.querySelectorAll('circle');
  assert.equal(circles.length, 2);
  assert.equal(circles[1].getAttribute('stroke'), 'var(--acoes)');
  assert.equal(svg.querySelector('text.big').textContent, '50%');
  assert.equal(svg.querySelector('text.small').textContent, 'da meta');
});

test('criarAnelProgresso() nunca deixa o anel visual passar de 100%, mas o texto mostra o valor real', () => {
  const doc = makeDom('');
  const svg = criarAnelProgresso(doc, { percentual: 1.3, cor: 'var(--acoes)' });

  const progresso = svg.querySelectorAll('circle')[1];
  const [dash, total] = progresso.getAttribute('stroke-dasharray').split(' ').map(Number);
  assert.ok(Math.abs(dash - total) < 0.01); // clamped em 100% do círculo
  assert.equal(svg.querySelector('text.big').textContent, '130%'); // texto não é clampado
});

test('criarAnelProgresso() trata percentual ausente/inválido como 0%', () => {
  const doc = makeDom('');
  const svg = criarAnelProgresso(doc, { percentual: undefined, cor: 'var(--fiis)' });
  assert.equal(svg.querySelector('text.big').textContent, '0%');
});

test('criarAnelProgresso() inclui um <title> (tooltip) com o percentual exato, com 2 casas', () => {
  const doc = makeDom('');
  const svg = criarAnelProgresso(doc, { percentual: 0.737725, cor: 'var(--usa)' });
  assert.equal(svg.querySelector('title').textContent, '73,77% da meta');
});


// --- criarCardMeta ------------------------------------------------------

test('criarCardMeta() monta título, badge, stats e o botão Editar', () => {
  const doc = makeDom('');
  const card = criarCardMeta(doc, {
    titulo: 'Renda Emergencial',
    badge: { tipo: 'good', texto: 'atingida' },
    percentual: 0.93,
    cor: 'var(--fiis)',
    stats: [{ k: 'Carteira atual', v: 'R$ 60.945,47' }, { k: 'Meta', v: 'R$ 65.285,91' }],
    campos: [{ nome: 'meses', rotulo: 'Meses', valor: 6, tipo: 'numero' }],
    onSalvar: async () => {},
  });

  assert.equal(card.querySelector('h3').textContent, 'Renda Emergencial');
  assert.equal(card.querySelector('.goal-badge').textContent, 'atingida');
  assert.ok(card.querySelector('.goal-badge').classList.contains('good'));
  assert.equal(card.querySelectorAll('.goal-stats > div').length, 2);
  assert.ok(card.querySelector('.goal-editar-btn'));
  assert.equal(card.querySelector('.goal-edit-form').hidden, true);
});

test('criarCardMeta() sem campos não desenha botão Editar nem formulário', () => {
  const doc = makeDom('');
  const card = criarCardMeta(doc, {
    titulo: 'Sem edição',
    percentual: 0.5,
    cor: 'var(--acoes)',
    stats: [],
    campos: [],
    onSalvar: async () => {},
  });
  assert.equal(card.querySelector('.goal-editar-btn'), null);
  assert.equal(card.querySelector('.goal-edit-form'), null);
});

test('criarCardMeta(): clicar Editar revela o formulário e Cancelar esconde de novo', () => {
  const doc = makeDom('');
  const card = criarCardMeta(doc, {
    titulo: 'Patrimônio',
    percentual: 0.04,
    cor: 'var(--acoes)',
    stats: [],
    campos: [{ nome: 'extra', rotulo: 'Extra', valor: 4000, tipo: 'reais' }],
    onSalvar: async () => {},
  });
  const editarBtn = card.querySelector('.goal-editar-btn');
  const form = card.querySelector('.goal-edit-form');

  editarBtn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(form.hidden, false);
  assert.equal(editarBtn.hidden, true);

  card.querySelector('.goal-edit-acoes button[type="button"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(form.hidden, true);
  assert.equal(editarBtn.hidden, false);
});

test('criarCardMeta(): campo percentual mostra o input em % (0.25 -> 25) e devolve fração ao salvar', async () => {
  const doc = makeDom('');
  let recebido;
  const card = criarCardMeta(doc, {
    titulo: 'Patrimônio',
    percentual: 0.04,
    cor: 'var(--acoes)',
    stats: [],
    campos: [{ nome: 'percentualReinvestimento', rotulo: '% Reinvestimento', valor: 0.25, tipo: 'percentual' }],
    onSalvar: async (valores) => { recebido = valores; },
  });
  const input = card.querySelector('input[name="percentualReinvestimento"]');
  assert.equal(input.value, '25');

  input.value = '30';
  card.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(recebido.percentualReinvestimento, 0.3);
});

test('criarCardMeta(): valor inválido no formulário mostra erro e não chama onSalvar', async () => {
  const doc = makeDom('');
  let chamado = false;
  const card = criarCardMeta(doc, {
    titulo: 'Renda Passiva',
    percentual: 0.5,
    cor: 'var(--usa)',
    stats: [],
    campos: [{ nome: 'valor', rotulo: 'Meta', valor: 500, tipo: 'reais' }],
    onSalvar: async () => { chamado = true; },
  });
  const input = card.querySelector('input[name="valor"]');
  input.value = 'abc';
  card.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();

  assert.equal(chamado, false);
  assert.match(card.querySelector('.goal-edit-status').textContent, /inválido/);
});

test('criarCardMeta(): erro em onSalvar aparece no status e reabilita o botão Salvar', async () => {
  const doc = makeDom('');
  const card = criarCardMeta(doc, {
    titulo: 'Renda Passiva',
    percentual: 0.5,
    cor: 'var(--usa)',
    stats: [],
    campos: [{ nome: 'valor', rotulo: 'Meta', valor: 500, tipo: 'reais' }],
    onSalvar: async () => { throw new Error('token expirado'); },
  });
  card.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.match(card.querySelector('.goal-edit-status').textContent, /token expirado/);
  assert.equal(card.querySelector('button[type="submit"]').disabled, false);
});

test('criarCardMeta() põe um ícone "i" clicável (dataset.tooltip) no stat quando o item vem com `title`', () => {
  const doc = makeDom('');
  const card = criarCardMeta(doc, {
    titulo: 'X',
    percentual: 0.5,
    cor: 'var(--acoes)',
    stats: [
      { k: 'A', v: '1', title: 'explicação de A' },
      { k: 'B', v: '2' },
    ],
  });
  const statDivs = card.querySelectorAll('.goal-stats > div');
  assert.equal(statDivs[0].classList.contains('info-alvo'), true);
  assert.equal(statDivs[0].dataset.tooltip, 'explicação de A');
  assert.ok(statDivs[0].querySelector('.info-icon'));
  assert.equal(statDivs[1].classList.contains('info-alvo'), false);
  assert.equal(statDivs[1].dataset.tooltip, undefined);
  assert.equal(statDivs[1].querySelector('.info-icon'), null);
});


// --- renderMetasCarteira ------------------------------------------------------

test('renderMetasCarteira() desenha os 3 cards quando as 3 metas vêm preenchidas', () => {
  const doc = makeDom('<div id="grid"></div>');
  const container = doc.getElementById('grid');
  renderMetasCarteira(doc, container, METAS_EXEMPLO);

  const cards = container.querySelectorAll('.goal-card');
  assert.equal(cards.length, 3);
  assert.equal(cards[0].querySelector('h3').textContent, 'Renda Passiva');
  assert.equal(cards[1].querySelector('h3').textContent, 'Patrimônio');
  assert.equal(cards[2].querySelector('h3').textContent, 'Renda Emergencial');
});

test('renderMetasCarteira() marca o badge "atingida" só quando rendaEmergencial.atingida é true', () => {
  const doc = makeDom('<div id="grid"></div>');
  const container = doc.getElementById('grid');
  const metas = { ...METAS_EXEMPLO, rendaEmergencial: { ...METAS_EXEMPLO.rendaEmergencial, atingida: true } };
  renderMetasCarteira(doc, container, metas);

  const badge = container.querySelectorAll('.goal-card')[2].querySelector('.goal-badge');
  assert.ok(badge);
  assert.equal(badge.textContent, 'atingida');
});

test('renderMetasCarteira() ignora seção ausente (ex. metas.patrimonio undefined) sem quebrar', () => {
  const doc = makeDom('<div id="grid"></div>');
  const container = doc.getElementById('grid');
  renderMetasCarteira(doc, container, { rendaPassiva: METAS_EXEMPLO.rendaPassiva });

  assert.equal(container.querySelectorAll('.goal-card').length, 1);
});

test('renderMetasCarteira() limpa o container quando metas é null/undefined', () => {
  const doc = makeDom('<div id="grid"><div class="goal-card">antigo</div></div>');
  const container = doc.getElementById('grid');
  renderMetasCarteira(doc, container, null);
  assert.equal(container.innerHTML, '');
});

test('renderMetasCarteira(): salvar em cada card chama o onSalvarX correspondente com o valor certo', async () => {
  const doc = makeDom('<div id="grid"></div>');
  const container = doc.getElementById('grid');
  const chamadas = {};
  renderMetasCarteira(doc, container, METAS_EXEMPLO, {
    onSalvarRendaPassiva: async (valor) => { chamadas.rendaPassiva = valor; },
    onSalvarPatrimonio: async (campos) => { chamadas.patrimonio = campos; },
    onSalvarRendaEmergencial: async (meses) => { chamadas.rendaEmergencial = meses; },
  });

  const cards = container.querySelectorAll('.goal-card');
  for (const card of cards) {
    card.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    card.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  }
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamadas.rendaPassiva, 500);
  assert.equal(chamadas.patrimonio.extra, 4000);
  assert.equal(chamadas.rendaEmergencial, 6);
});

// --- renderAvisos ------------------------------------------------------

test('renderAvisos() esconde o banner quando não há avisos', () => {
  const doc = makeDom('<div id="avisos" class="avisos-banner"></div>');
  const el = doc.getElementById('avisos');
  renderAvisos(el, undefined);
  assert.equal(el.hidden, true);
  assert.equal(el.innerHTML, '');
});

test('renderAvisos() mostra a seção e a mensagem de erro quando há avisos', () => {
  const doc = makeDom('<div id="avisos" class="avisos-banner"></div>');
  const el = doc.getElementById('avisos');
  renderAvisos(el, { metas: 'Error: aba não encontrada' });
  assert.equal(el.hidden, false);
  assert.match(el.textContent, /metas/);
  assert.match(el.textContent, /aba não encontrada/);
});

const OBJETIVOS_EXEMPLO = {
  alocacaoGeral: {
    tipos: [
      { tipo: 'Ações Nacionais e Internacionais', percentualDesejado: 0.5, percentualAtual: 0.5429649038887503, carteiraAtual: 47999.698359495786, novaCarteira: 47999.698359495786, valorInvestir: 0 },
      { tipo: 'FIIs', percentualDesejado: 0.4, percentualAtual: 0.4032444693477339, carteiraAtual: 35648, novaCarteira: 38399.75868759663, valorInvestir: 2751.75868759663 },
      { tipo: 'Renda Fixa', percentualDesejado: 0.1, percentualAtual: 0.05379062676351581, carteiraAtual: 4755.25, novaCarteira: 9599.939671899157, valorInvestir: 4844.6896718991575 },
    ],
    total: { carteiraAtual: 88402.94835949579, novaCarteira: 95999.39671899157, valorInvestir: 7596.448359495787 },
  },
  alocacaoRendaFixa: {
    tipos: [
      { tipo: 'Renda Emergencial', percentualDesejado: 0.9, percentualAtual: 0.9276225587786557, carteiraAtual: 60945.47, novaCarteira: 65285.913, valorInvestir: 4340.442999999999 },
      { tipo: 'Renda Fixa', percentualDesejado: 0.1, percentualAtual: 0.0723774412213443, carteiraAtual: 4755.25, novaCarteira: 9599.939671899157, valorInvestir: 4844.6896718991575 },
    ],
    total: { carteiraAtual: 65700.72, novaCarteira: 74885.85267189916, valorInvestir: 9185.132671899157 },
  },
};

// --- criarLinhaObjetivo ------------------------------------------------------

test('criarLinhaObjetivo() mostra nome, % atual/meta e o valor investido', () => {
  const doc = makeDom('');
  const linha = criarLinhaObjetivo(doc, OBJETIVOS_EXEMPLO.alocacaoGeral.tipos[1]); // FIIs
  assert.match(linha.querySelector('.obj-nome').textContent, /FIIs/);
  assert.equal(linha.querySelector('.obj-pcts b').textContent, '40%');
  assert.equal(linha.querySelector('.obj-meta-pct').textContent, 'meta 40%');
  assert.match(linha.querySelector('.obj-valor-atual').textContent, /35\.648/);
});

test('criarLinhaObjetivo() mostra badge "faltam R$ X" quando valorInvestir é maior que zero', () => {
  const doc = makeDom('');
  const linha = criarLinhaObjetivo(doc, OBJETIVOS_EXEMPLO.alocacaoGeral.tipos[1]); // FIIs, valorInvestir > 0
  const badge = linha.querySelector('.goal-badge');
  assert.match(badge.className, /warn/);
  assert.match(badge.textContent, /faltam/);
  assert.match(badge.textContent, /2\.751,76/);
});

test('criarLinhaObjetivo() mostra badge "na meta" quando já atingiu ou passou do desejado', () => {
  const doc = makeDom('');
  const linha = criarLinhaObjetivo(doc, OBJETIVOS_EXEMPLO.alocacaoGeral.tipos[0]); // Ações, valorInvestir: 0
  const badge = linha.querySelector('.goal-badge');
  assert.match(badge.className, /good/);
  assert.match(badge.textContent, /na meta/);
});

test('criarLinhaObjetivo() ignora valorInvestir residual de arredondamento (< R$ 0,50) como "na meta"', () => {
  const doc = makeDom('');
  const linha = criarLinhaObjetivo(doc, { tipo: 'X', percentualDesejado: 0.5, percentualAtual: 0.5, carteiraAtual: 100, valorInvestir: 0.03 });
  assert.match(linha.querySelector('.goal-badge').textContent, /na meta/);
});

test('criarLinhaObjetivo() usa a cor passada em `cor`, senão a do mapa fixo por tipo', () => {
  const doc = makeDom('');
  const semCor = criarLinhaObjetivo(doc, OBJETIVOS_EXEMPLO.alocacaoGeral.tipos[0]);
  assert.match(semCor.querySelector('.obj-dot').getAttribute('style'), /--acoes/);
  const comCor = criarLinhaObjetivo(doc, { ...OBJETIVOS_EXEMPLO.alocacaoGeral.tipos[0], cor: 'red' });
  assert.match(comCor.querySelector('.obj-dot').getAttribute('style'), /red/);
});

test('criarLinhaObjetivo() põe um ícone "i" clicável em .obj-pcts com % exato (atual e meta) e o valor em R$', () => {
  const doc = makeDom('');
  const linha = criarLinhaObjetivo(doc, OBJETIVOS_EXEMPLO.alocacaoGeral.tipos[1]); // FIIs
  const pcts = linha.querySelector('.obj-pcts');
  assert.equal(pcts.classList.contains('info-alvo'), true);
  assert.ok(pcts.querySelector('.info-icon'));
  const tituloBarra = pcts.dataset.tooltip;
  assert.match(tituloBarra, /40,32%/);
  assert.match(tituloBarra, /35\.648,00/);
  assert.match(tituloBarra, /40,00%/);
});

// 14/09/2026: valorInvestir negativo acontece nos splits internos que
// REDISTRIBUEM o que já existe (ex.: FIIs Tijolo/Papel/Híbrido) - mostra
// "resgatar" em vez de "faltam", e o badge continua "warn" (não é bom
// nem ruim ficar acima OU abaixo da meta nesse tipo de split).
test('criarLinhaObjetivo() mostra badge "resgatar R$ X" quando valorInvestir é negativo (split que redistribui)', () => {
  const doc = makeDom('');
  const linha = criarLinhaObjetivo(doc, { tipo: 'Tijolo', percentualDesejado: 0.4, percentualAtual: 0.42, carteiraAtual: 14801.55, valorInvestir: -673.21 });
  const badge = linha.querySelector('.goal-badge');
  assert.match(badge.className, /warn/);
  assert.match(badge.textContent, /resgatar/);
  assert.match(badge.textContent, /673,21/);
  assert.equal(/faltam/.test(badge.textContent), false);
});

test('criarLinhaObjetivo() ignora valorInvestir residual negativo de arredondamento (> -R$ 0,50) como "na meta"', () => {
  const doc = makeDom('');
  const linha = criarLinhaObjetivo(doc, { tipo: 'X', percentualDesejado: 0.5, percentualAtual: 0.5, carteiraAtual: 100, valorInvestir: -0.02 });
  assert.match(linha.querySelector('.goal-badge').textContent, /na meta/);
});


// --- criarBlocoObjetivo ------------------------------------------------------

test('criarBlocoObjetivo() monta o título, uma linha por tipo e o total', () => {
  const doc = makeDom('');
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'Ações, FIIs e Renda Fixa',
    tipos: OBJETIVOS_EXEMPLO.alocacaoGeral.tipos,
    total: OBJETIVOS_EXEMPLO.alocacaoGeral.total,
  });
  assert.equal(bloco.querySelector('.obj-bloco-titulo').textContent, 'Ações, FIIs e Renda Fixa');
  assert.equal(bloco.querySelectorAll('.obj-linha').length, 3);
  assert.match(bloco.querySelector('.obj-total').textContent, /88\.402,95/);
  assert.match(bloco.querySelector('.obj-total-investir').textContent, /7\.596,45/);
});

test('criarBlocoObjetivo() "Total investido"/"Pra atingir a meta" ganham ícone "i" clicável (dataset.tooltip) em vez de title nativo', () => {
  const doc = makeDom('');
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'Ações, FIIs e Renda Fixa',
    tipos: OBJETIVOS_EXEMPLO.alocacaoGeral.tipos,
    total: OBJETIVOS_EXEMPLO.alocacaoGeral.total,
  });
  const totalKs = bloco.querySelectorAll('.obj-total-k');
  assert.equal(totalKs.length, 2);
  totalKs.forEach((k) => {
    assert.equal(k.classList.contains('info-alvo'), true);
    assert.ok(k.querySelector('.info-icon'));
    assert.ok(k.dataset.tooltip);
  });
  assert.match(totalKs[0].dataset.tooltip, /Soma da carteira atual/);
  assert.match(totalKs[1].dataset.tooltip, /Aporte novo/);
});

test('criarBlocoObjetivo() omite "pra atingir a meta" no total quando nada falta investir', () => {
  const doc = makeDom('');
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'Tudo na meta',
    tipos: [{ tipo: 'X', percentualDesejado: 0.5, percentualAtual: 0.5, carteiraAtual: 100, valorInvestir: 0 }],
    total: { carteiraAtual: 100, valorInvestir: 0 },
  });
  assert.equal(bloco.querySelector('.obj-total-investir'), null);
});

test('criarBlocoObjetivo() sem blocoId/onSalvarPercentuais não desenha o botão de editar % desejado', () => {
  const doc = makeDom('');
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'X',
    tipos: OBJETIVOS_EXEMPLO.alocacaoGeral.tipos,
    total: OBJETIVOS_EXEMPLO.alocacaoGeral.total,
  });
  assert.equal(bloco.querySelector('.goal-editar-btn'), null);
});

test('criarBlocoObjetivo(): "Editar % desejado" revela um input por tipo, pré-preenchido em %', () => {
  const doc = makeDom('');
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'X',
    tipos: OBJETIVOS_EXEMPLO.alocacaoGeral.tipos,
    total: OBJETIVOS_EXEMPLO.alocacaoGeral.total,
    blocoId: 'geral',
    onSalvarPercentuais: async () => {},
  });
  bloco.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const inputs = bloco.querySelectorAll('.goal-edit-field input');
  assert.equal(inputs.length, 3);
  assert.equal(inputs[0].value, '50');
  assert.equal(inputs[1].value, '40');
  assert.equal(inputs[2].value, '10');
});

test('criarBlocoObjetivo(): salvar chama onSalvarPercentuais(blocoId, [frações]) na mesma ordem dos tipos', async () => {
  const doc = makeDom('');
  let chamou;
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'X',
    tipos: OBJETIVOS_EXEMPLO.alocacaoGeral.tipos,
    total: OBJETIVOS_EXEMPLO.alocacaoGeral.total,
    blocoId: 'geral',
    onSalvarPercentuais: async (bloco, percentuais) => { chamou = { bloco, percentuais }; },
  });
  bloco.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const inputs = bloco.querySelectorAll('.goal-edit-field input');
  inputs[0].value = '55';
  inputs[1].value = '35';
  inputs[2].value = '10';
  bloco.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamou.bloco, 'geral');
  assert.deepEqual(chamou.percentuais, [0.55, 0.35, 0.1]);
});

test('criarBlocoObjetivo(): soma diferente de 100% mostra erro e não chama onSalvarPercentuais', async () => {
  const doc = makeDom('');
  let chamou = false;
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'X',
    tipos: OBJETIVOS_EXEMPLO.alocacaoGeral.tipos,
    total: OBJETIVOS_EXEMPLO.alocacaoGeral.total,
    blocoId: 'geral',
    onSalvarPercentuais: async () => { chamou = true; },
  });
  bloco.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const inputs = bloco.querySelectorAll('.goal-edit-field input');
  inputs[0].value = '50';
  inputs[1].value = '30';
  inputs[2].value = '10';
  bloco.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();

  assert.equal(chamou, false);
  assert.match(bloco.querySelector('.goal-edit-status').textContent, /somar 100%/);
});

test('criarBlocoObjetivo(): campo em branco mostra erro e não chama onSalvarPercentuais', async () => {
  const doc = makeDom('');
  let chamou = false;
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'X',
    tipos: OBJETIVOS_EXEMPLO.alocacaoGeral.tipos,
    total: OBJETIVOS_EXEMPLO.alocacaoGeral.total,
    blocoId: 'geral',
    onSalvarPercentuais: async () => { chamou = true; },
  });
  bloco.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const inputs = bloco.querySelectorAll('.goal-edit-field input');
  inputs[0].value = '';
  bloco.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();

  assert.equal(chamou, false);
  assert.match(bloco.querySelector('.goal-edit-status').textContent, /preencha/);
});

test('criarBlocoObjetivo(): Cancelar esconde o formulário de novo e limpa o status', () => {
  const doc = makeDom('');
  const bloco = criarBlocoObjetivo(doc, {
    titulo: 'X',
    tipos: OBJETIVOS_EXEMPLO.alocacaoGeral.tipos,
    total: OBJETIVOS_EXEMPLO.alocacaoGeral.total,
    blocoId: 'geral',
    onSalvarPercentuais: async () => {},
  });
  bloco.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(bloco.querySelector('form').hidden, false);
  bloco.querySelector('.goal-edit-acoes button[type="button"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(bloco.querySelector('form').hidden, true);
  assert.equal(bloco.querySelector('.goal-editar-btn').hidden, false);
});


// --- renderObjetivosCarteira ------------------------------------------------------

test('renderObjetivosCarteira() desenha os 2 blocos (alocacaoGeral e alocacaoRendaFixa)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderObjetivosCarteira(doc, container, OBJETIVOS_EXEMPLO);
  const blocos = container.querySelectorAll('.obj-bloco');
  assert.equal(blocos.length, 2);
  assert.match(blocos[0].querySelector('.obj-bloco-titulo').textContent, /Ações, FIIs e Renda Fixa/);
  assert.match(blocos[1].querySelector('.obj-bloco-titulo').textContent, /Dentro da Renda Fixa/);
});

test('renderObjetivosCarteira() limpa o container quando objetivos é null/undefined', () => {
  const doc = makeDom('<div id="c"><span>lixo antigo</span></div>');
  const container = doc.getElementById('c');
  renderObjetivosCarteira(doc, container, null);
  assert.equal(container.innerHTML, '');
});

test('renderObjetivosCarteira() ignora bloco ausente (ex. só alocacaoGeral) sem quebrar', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderObjetivosCarteira(doc, container, { alocacaoGeral: OBJETIVOS_EXEMPLO.alocacaoGeral });
  assert.equal(container.querySelectorAll('.obj-bloco').length, 1);
});

test('renderObjetivosCarteira() não quebra quando container é null', () => {
  const doc = makeDom('');
  assert.doesNotThrow(() => renderObjetivosCarteira(doc, null, OBJETIVOS_EXEMPLO));
});

test('renderObjetivosCarteira() repassa onSalvarPercentuais pros 2 blocos, com o blocoId certo', async () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const chamadas = [];
  renderObjetivosCarteira(doc, container, OBJETIVOS_EXEMPLO, {
    onSalvarPercentuais: async (bloco) => { chamadas.push(bloco); },
  });
  const blocos = container.querySelectorAll('.obj-bloco');
  blocos[0].querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  blocos[0].querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  blocos[1].querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  blocos[1].querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(chamadas, ['geral', 'rendaFixa']);
});

// pedido do Tiago (16/09/2026), continuação: os stats de Meta e a
// barra/total de Objetivos da Carteira também usavam `title` nativo -
// agora usam o mesmo tooltip por toque (wirePointerTooltipInfo_,
// mesma técnica do Radar) via .info-alvo/.info-icon/.info-tooltip.
test('renderObjetivosCarteira() no toque, tocar no ícone "i" da barra abre a tooltip; 2º toque fecha; toque fora fecha', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderObjetivosCarteira(doc, container, OBJETIVOS_EXEMPLO);
  const alvo = container.querySelector('.obj-pcts');

  alvo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 20, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  const tooltip = doc.querySelector('.info-tooltip');
  assert.equal(tooltip.hidden, false);
  assert.match(tooltip.textContent, /Atual:/);

  alvo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 20, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.querySelector('.info-tooltip').hidden, true);
});

test('renderMetasCarteira() no toque, tocar no ícone "i" de um stat abre a tooltip, e pointerleave (fim do toque) não fecha sozinho', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderMetasCarteira(doc, container, METAS_EXEMPLO);
  const alvo = container.querySelector('.info-alvo');
  assert.ok(alvo, 'algum stat de Meta tem tooltip (Média últ. 12 meses etc.)');

  alvo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 20, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.querySelector('.info-tooltip').hidden, false);

  container.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true, pointerType: 'touch' }));
  assert.equal(doc.querySelector('.info-tooltip').hidden, false, 'pointerleave no toque não esconde mais');
});

test('renderObjetivosCarteira() redesenhar o mesmo container não duplica a div .info-tooltip nem os listeners', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderObjetivosCarteira(doc, container, OBJETIVOS_EXEMPLO);
  renderObjetivosCarteira(doc, container, OBJETIVOS_EXEMPLO);
  assert.equal(doc.querySelectorAll('.info-tooltip').length, 1);
});

// --- renderSplitInterno ------------------------------------------------------

// Dados reais confirmados na planilha (diagnosticarSplitsELinks,
// 14/09/2026) - FIIs tem valorInvestir negativo de propósito (Tijolo
// está acima da meta, precisa "resgatar", não "investir" - ver os
// testes de criarLinhaObjetivo() acima pro mesmo caso isolado).
const SPLITS_INTERNOS_EXEMPLO = {
  acoes: {
    itens: [
      { tipo: 'Dividendos', percentualDesejado: 0.6, percentualAtual: 0.6257188358, carteiraAtual: 29975.54, novaCarteira: 29975.54, valorInvestir: 0 },
      { tipo: 'Ações Internacionais', percentualDesejado: 0.4, percentualAtual: 0.3742811642, carteiraAtual: 17930.23, novaCarteira: 19983.69, valorInvestir: 2053.47 },
    ],
    total: { carteiraAtual: 47905.77, novaCarteira: 49959.23, valorInvestir: 2053.47 },
  },
  fiis: {
    itens: [
      { tipo: 'Tijolo', percentualDesejado: 0.4, percentualAtual: 0.4183682114, carteiraAtual: 14913.99, novaCarteira: 14259.2, valorInvestir: -654.79 },
      { tipo: 'Papel', percentualDesejado: 0.3, percentualAtual: 0.3138675382, carteiraAtual: 11188.75, novaCarteira: 10694.4, valorInvestir: -494.35 },
      { tipo: 'Híbrido', percentualDesejado: 0.3, percentualAtual: 0.2677642504, carteiraAtual: 9545.26, novaCarteira: 10694.4, valorInvestir: 1149.14 },
    ],
    total: { carteiraAtual: 35648, novaCarteira: 35648, valorInvestir: null }, // G76 é texto "Total:" na planilha, não fórmula - ver DistribuicoesMetas.gs
  },
};

const LINKS_RECOMENDADOS_EXEMPLO = {
  acoesDividendos: { texto: 'Carteira Recomendada Dividendos', url: 'https://investidor.suno.com.br/carteiras/dividendos' },
  acoesValor: { texto: 'Carteira Recomendada Valor', url: 'https://investidor.suno.com.br/carteiras/valor' },
  acoesInternacional: { texto: 'Carteira Recomendada Internacional', url: 'https://investidor.suno.com.br/carteiras/internacional' },
  fiis: { texto: 'Carteira Recomendada FIIS', url: 'https://investidor.suno.com.br/carteiras/fiis' },
};

test('renderSplitInterno() na aba "acoesNacionais" mostra o bloco de Ações e os links de Dividendos + Valor', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderSplitInterno(doc, container, {
    splitsInternos: SPLITS_INTERNOS_EXEMPLO,
    linksRecomendados: LINKS_RECOMENDADOS_EXEMPLO,
    abaAtiva: 'acoesNacionais',
  });
  assert.match(container.querySelector('.obj-bloco-titulo').textContent, /Ações/);
  assert.equal(container.querySelectorAll('.obj-linha').length, 2);
  const links = container.querySelectorAll('.split-link');
  assert.equal(links.length, 2);
  assert.match(links[0].textContent, /Dividendos/);
  assert.match(links[1].textContent, /Valor/);
  assert.equal(links[0].href, 'https://investidor.suno.com.br/carteiras/dividendos');
});

test('renderSplitInterno() na aba "acoesInternacionais" mostra o MESMO bloco de Ações, mas só o link Internacional', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderSplitInterno(doc, container, {
    splitsInternos: SPLITS_INTERNOS_EXEMPLO,
    linksRecomendados: LINKS_RECOMENDADOS_EXEMPLO,
    abaAtiva: 'acoesInternacionais',
  });
  assert.match(container.querySelector('.obj-bloco-titulo').textContent, /Ações/);
  assert.equal(container.querySelectorAll('.obj-linha').length, 2);
  const links = container.querySelectorAll('.split-link');
  assert.equal(links.length, 1);
  assert.match(links[0].textContent, /Internacional/);
});

test('renderSplitInterno() na aba "fiis" mostra o bloco de FIIs (3 tipos) e o link FIIs', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderSplitInterno(doc, container, {
    splitsInternos: SPLITS_INTERNOS_EXEMPLO,
    linksRecomendados: LINKS_RECOMENDADOS_EXEMPLO,
    abaAtiva: 'fiis',
  });
  assert.match(container.querySelector('.obj-bloco-titulo').textContent, /FIIs/);
  const linhas = container.querySelectorAll('.obj-linha');
  assert.equal(linhas.length, 3);
  assert.match(linhas[0].textContent, /Tijolo/);
  const links = container.querySelectorAll('.split-link');
  assert.equal(links.length, 1);
  assert.match(links[0].textContent, /FIIS/);
});

test('renderSplitInterno() mostra "resgatar" (não "faltam") pro tipo de FII acima da meta', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderSplitInterno(doc, container, { splitsInternos: SPLITS_INTERNOS_EXEMPLO, linksRecomendados: LINKS_RECOMENDADOS_EXEMPLO, abaAtiva: 'fiis' });
  const linhaTijolo = container.querySelectorAll('.obj-linha')[0];
  assert.match(linhaTijolo.querySelector('.goal-badge').textContent, /resgatar/);
});

test('renderSplitInterno() sem splitsInternos limpa o container e não quebra', () => {
  const doc = makeDom('<div id="c"><p>antigo</p></div>');
  const container = doc.getElementById('c');
  renderSplitInterno(doc, container, { splitsInternos: null, abaAtiva: 'fiis' });
  assert.equal(container.innerHTML, '');
});

test('renderSplitInterno() sem container não quebra', () => {
  const doc = makeDom('');
  assert.doesNotThrow(() => renderSplitInterno(doc, null, { splitsInternos: SPLITS_INTERNOS_EXEMPLO, abaAtiva: 'fiis' }));
});

test('renderSplitInterno() repassa onSalvarPercentuais com o blocoId certo ("acoes"/"fiis")', async () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const chamadas = [];
  renderSplitInterno(doc, container, {
    splitsInternos: SPLITS_INTERNOS_EXEMPLO,
    abaAtiva: 'fiis',
    onSalvarPercentuais: async (bloco) => { chamadas.push(bloco); },
  });
  container.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  container.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(chamadas, ['fiis']);
});


// --- renderRadarOportunidades ------------------------------------------------------

// WIZC3 (linha 42, ranking 1) intencionalmente listado DEPOIS de VAMO3
// (linha 43, ranking 2) no array - assim um teste de "ordena por Ranking
// crescente por padrao" so passa se a ordenacao de verdade acontecer (o
// array de entrada, fora de ordem, nao passaria sozinho).
const RADAR_EXEMPLO = {
  acoesNacionais: {
    itens: [
      { linha: 43, ranking: 2, ativo: 'VAMO3', precoAtual: 3.27, precoTeto: 7.86, vies: 'Comprar', precoMedio: 2.94, pvp: 1.21, pl: 11.66, descontoPvp: '121% (1,21 P/VP)', descontoPl: '8,58% (5,67% abaixo - retorno em 11,66 anos)', percentualDesejado: 0.1, percentualAtual: 0.0565, carteiraAtual: 1569.6, percentualDiferenca: -0.0435, novaCarteira: 5336.26, valorInvestir: 3766.66, tipo: null },
      { linha: 42, ranking: 1, ativo: 'WIZC3', precoAtual: 7.82, precoTeto: 10, vies: 'Comprar', precoMedio: 7.61, pvp: 1.69, pl: 6.3, descontoPvp: '169% (1,69 P/VP)', descontoPl: '15,87% (1,62% acima - retorno em 6,30 anos)', percentualDesejado: 0.11, percentualAtual: 0.0338, carteiraAtual: 938.4, percentualDiferenca: -0.0762, novaCarteira: 5869.89, valorInvestir: 4931.49, tipo: null },
    ],
    total: { carteiraAtual: 2508, novaCarteira: 11206.15, valorInvestir: 8698.15 },
  },
  acoesInternacionais: {
    itens: [
      { linha: 59, ranking: 1, ativo: 'GPRK', precoAtual: 11.48, precoTeto: 10.35, vies: 'Aguardar', precoMedio: 7.04, pvp: 31.89, pl: null, descontoPvp: '3189% (31,89 P/VP)', descontoPl: null, percentualDesejado: 0.15, percentualAtual: 0.159, carteiraAtual: 557.7, percentualDiferenca: 0.009, novaCarteira: 600, valorInvestir: 42.3, tipo: null },
    ],
    total: { carteiraAtual: 557.7, novaCarteira: 600, valorInvestir: 42.3 },
  },
  fiis: {
    itens: [
      { linha: 82, ranking: 1, ativo: 'PMLL11', precoAtual: 95, precoTeto: 100, vies: 'Comprar', precoMedio: 90, pvp: 0.95, pl: null, descontoPvp: '95% (0,95 P/VP)', descontoPl: null, percentualDesejado: 0.2, percentualAtual: 0.18, carteiraAtual: 3000, percentualDiferenca: -0.02, novaCarteira: 3500, valorInvestir: 500, tipo: 'Tijolo' },
    ],
    total: { carteiraAtual: 3000, novaCarteira: 3500, valorInvestir: 500 },
  },
};

test('renderRadarOportunidades() desenha as 3 abas e a tabela da aba ativa (Ações Nacionais) ordenada por Ranking crescente por padrão', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const abas = container.querySelectorAll('.filter-tab');
  assert.equal(abas.length, 3);
  assert.equal(abas[0].classList.contains('active'), true);
  const linhas = container.querySelectorAll('.radar-table tbody tr');
  assert.equal(linhas.length, 2);
  assert.match(linhas[0].textContent, /WIZC3/);
  assert.match(linhas[1].textContent, /VAMO3/);
});

test('renderRadarOportunidades(): clicar na aba "FIIs" troca a tabela mostrada', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const abas = container.querySelectorAll('.filter-tab');
  abas[2].dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(abas[2].classList.contains('active'), true);
  assert.equal(abas[0].classList.contains('active'), false);
  assert.match(container.querySelector('.radar-table tbody').textContent, /PMLL11/);
});

// 14/09/2026: onTrocarAba existe pra sincronizar renderSplitInterno
// (mostrado ACIMA desta tabela) com a aba ativa do Radar.
test('renderRadarOportunidades() chama onTrocarAba uma vez no desenho inicial, com a aba default', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const chamadas = [];
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO, { onTrocarAba: (aba) => chamadas.push(aba) });
  assert.deepEqual(chamadas, ['acoesNacionais']);
});

test('renderRadarOportunidades() chama onTrocarAba de novo a cada troca de aba (não ao só reordenar)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const chamadas = [];
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO, { onTrocarAba: (aba) => chamadas.push(aba) });

  container.querySelector('.radar-th-btn[data-campo="ativo"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.deepEqual(chamadas, ['acoesNacionais']); // ordenar não chama de novo

  container.querySelectorAll('.filter-tab')[2].dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.deepEqual(chamadas, ['acoesNacionais', 'fiis']);
});

test('renderRadarOportunidades(): clicar no cabeçalho "Ativo" ordena por ele; clicar de novo inverte', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);

  container.querySelector('.radar-th-btn[data-campo="ativo"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  let linhas = container.querySelectorAll('.radar-table tbody tr');
  assert.match(linhas[0].textContent, /VAMO3/);
  assert.match(linhas[1].textContent, /WIZC3/);

  container.querySelector('.radar-th-btn[data-campo="ativo"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  linhas = container.querySelectorAll('.radar-table tbody tr');
  assert.match(linhas[0].textContent, /WIZC3/);
  assert.match(linhas[1].textContent, /VAMO3/);
});

test('renderRadarOportunidades() sem onSalvarItem não desenha botão "Editar"', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  assert.equal(container.querySelector('.radar-editar-btn'), null);
});

test('renderRadarOportunidades(): "Editar" revela inputs pré-preenchidos de Ranking/Preço-teto/% desejado', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO, { onSalvarItem: async () => {} });
  const primeiraLinha = container.querySelector('.radar-table tbody tr'); // WIZC3, ranking 1
  primeiraLinha.querySelector('.radar-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const inputs = primeiraLinha.querySelectorAll('.radar-edit-input');
  assert.equal(inputs.length, 3);
  assert.equal(inputs[0].value, '1');
  assert.equal(inputs[1].value, '10');
  assert.equal(inputs[2].value, '11');
});

test('renderRadarOportunidades(): "Salvar" chama onSalvarItem(tabela, item) com linha/ativo/ranking/precoTeto/percentualDesejado corretos', async () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  let chamou;
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO, {
    onSalvarItem: async (tabela, item) => { chamou = { tabela, item }; },
  });
  const primeiraLinha = container.querySelector('.radar-table tbody tr');
  primeiraLinha.querySelector('.radar-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const inputs = primeiraLinha.querySelectorAll('.radar-edit-input');
  inputs[0].value = '3';
  inputs[1].value = '12.5';
  inputs[2].value = '15';
  primeiraLinha.querySelector('.radar-salvar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamou.tabela, 'acoesNacionais');
  assert.equal(chamou.item.linha, 42);
  assert.equal(chamou.item.ativo, 'WIZC3');
  assert.equal(chamou.item.ranking, 3);
  assert.equal(chamou.item.precoTeto, 12.5);
  assert.equal(chamou.item.percentualDesejado, 0.15);
});

test('renderRadarOportunidades(): campo em branco ao salvar mostra erro e não chama onSalvarItem', async () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  let chamou = false;
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO, {
    onSalvarItem: async () => { chamou = true; },
  });
  const primeiraLinha = container.querySelector('.radar-table tbody tr');
  primeiraLinha.querySelector('.radar-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const inputs = primeiraLinha.querySelectorAll('.radar-edit-input');
  inputs[0].value = '';
  primeiraLinha.querySelector('.radar-salvar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  await Promise.resolve();

  assert.equal(chamou, false);
  assert.match(primeiraLinha.querySelector('.radar-edit-status').textContent, /preencha/);
});

test('renderRadarOportunidades(): "Cancelar" reverte a linha pro estado original (sem inputs)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO, { onSalvarItem: async () => {} });
  let primeiraLinha = container.querySelector('.radar-table tbody tr');
  primeiraLinha.querySelector('.radar-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(container.querySelectorAll('.radar-edit-input').length, 3);
  container.querySelector('.radar-cancelar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(container.querySelectorAll('.radar-edit-input').length, 0);
  primeiraLinha = container.querySelector('.radar-table tbody tr');
  assert.notEqual(primeiraLinha.querySelector('.radar-editar-btn'), null);
});

test('renderRadarOportunidades() limpa o container quando radar é null/undefined', () => {
  const doc = makeDom('<div id="c"><span>lixo antigo</span></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, null);
  assert.equal(container.innerHTML, '');
});

test('renderRadarOportunidades() mostra aviso quando a tabela ativa não tem itens', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, {
    acoesNacionais: { itens: [], total: {} },
    acoesInternacionais: RADAR_EXEMPLO.acoesInternacionais,
    fiis: RADAR_EXEMPLO.fiis,
  });
  assert.match(container.textContent, /Nenhum ativo/);
});

// 14/09/2026 (rodada de feedback): Desconto P/VP e P/L viraram coluna,
// Ranking/Preço-teto/linha "Aguardar" ganharam destaque visual, e o
// tooltip do Ativo/badges/ícone "i" passaram de `title` nativo pra um
// tooltip por Pointer Events (funciona em toque, não só mouse — ver
// wirePointerTooltipRadar_ no arquivo de origem).

test('renderRadarOportunidades() mostra as colunas de Desconto sobre P/VP e P/L com o cabeçalho certo', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const rotulos = Array.from(container.querySelectorAll('.radar-th-btn')).map((b) => b.textContent);
  assert.ok(rotulos.some((r) => r.includes('Desc. P/VP')));
  assert.ok(rotulos.some((r) => r.includes('Desc. P/L')));
});

// 14/09/2026 (2ª rodada de feedback): o badge deixou de mostrar a
// porcentagem crua ("169%", ambígua - a mesma fórmula da planilha usa
// esse formato tanto pra desconto quanto pra ágio/caro) e passou a
// mostrar o veredito direto - "Com desconto" ou "Está caro" - com cor
// verde/vermelha (mesma paleta do Viés Comprar/Aguardar). O texto cru
// continua só no tooltip.
test('renderRadarOportunidades(): célula de Desconto sobre P/VP mostra "Está caro" (vermelho) quando o P/VP calculado é >= 1', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  // WIZC3 (ranking 1, 1ª linha por default): pvp 1.69 (>= 1), descontoPvp '169% (1,69 P/VP)'.
  const primeiraLinha = container.querySelector('.radar-table tbody tr');
  const badgePvp = primeiraLinha.querySelector('.radar-desconto-badge');
  assert.equal(badgePvp.textContent, 'Está caro');
  assert.equal(badgePvp.classList.contains('bad'), true);
  assert.equal(badgePvp.classList.contains('good'), false);
  assert.equal(badgePvp.dataset.tooltip, '169% (1,69 P/VP)');
  assert.equal(badgePvp.classList.contains('radar-info-alvo'), true);
});

test('renderRadarOportunidades(): célula de Desconto sobre P/VP mostra "Com desconto" (verde) quando o P/VP calculado é < 1', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  // PMLL11 (FIIs): pvp 0.95 (< 1).
  container.querySelector('[data-tabela="fiis"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const linha = container.querySelector('.radar-table tbody tr');
  const badgePvp = linha.querySelector('.radar-desconto-badge');
  assert.equal(badgePvp.textContent, 'Com desconto');
  assert.equal(badgePvp.classList.contains('good'), true);
});

test('renderRadarOportunidades(): célula de Desconto sobre P/L segue a palavra "acima"/"abaixo" que a planilha já calcula (comparado com a taxa de renda fixa)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const linhas = container.querySelectorAll('.radar-table tbody tr');
  // WIZC3 (ranking 1): descontoPl '15,87% (1,62% acima - retorno em 6,30 anos)' -> caro.
  const badgeWizc3 = linhas[0].querySelectorAll('.radar-desconto-badge')[1];
  assert.equal(badgeWizc3.textContent, 'Está caro');
  assert.equal(badgeWizc3.classList.contains('bad'), true);
  // VAMO3 (ranking 2): descontoPl '8,58% (5,67% abaixo - retorno em 11,66 anos)' -> com desconto.
  const badgeVamo3 = linhas[1].querySelectorAll('.radar-desconto-badge')[1];
  assert.equal(badgeVamo3.textContent, 'Com desconto');
  assert.equal(badgeVamo3.classList.contains('good'), true);
});

test('renderRadarOportunidades(): cabeçalho de Desconto sobre P/VP e P/L vira alvo de tooltip com o detalhe da conta', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const thPvp = container.querySelector('.radar-th-btn[data-campo="descontoPvp"]').closest('th');
  const thPl = container.querySelector('.radar-th-btn[data-campo="descontoPl"]').closest('th');
  assert.equal(thPvp.classList.contains('radar-info-alvo'), true);
  assert.match(thPvp.dataset.tooltip, /menor que 1/);
  assert.equal(thPl.classList.contains('radar-info-alvo'), true);
  assert.match(thPl.dataset.tooltip, /taxa de renda fixa/);
});

// 14/09/2026 (3ª rodada de feedback): uma rodada anterior tinha
// passado a pintar a célula do Viés inteira (Comprar) e a linha
// inteira (Aguardar) - Tiago achou feio e pediu pra voltar atrás
// ("vamos manter como antes, tag verde/amarela"). O badge
// (.goal-badge good/warn, sempre existiu) já É essa tag - o teste
// agora confirma que NENHUM fundo extra de célula/linha é adicionado,
// só a tag colorida continua ali.
test('renderRadarOportunidades(): "Comprar"/"Aguardar" mostram só a tag (badge) verde/amarela - sem pintar célula ou linha', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const primeiraLinha = container.querySelector('.radar-table tbody tr'); // WIZC3, Comprar
  const celulaVies = Array.from(primeiraLinha.children).find((td) => td.querySelector('.goal-badge'));
  assert.equal(celulaVies.classList.contains('radar-vies-comprar'), false);
  assert.equal(primeiraLinha.classList.contains('radar-linha-aguardar'), false);
  assert.equal(celulaVies.querySelector('.goal-badge').classList.contains('good'), true);

  container.querySelector('[data-tabela="acoesInternacionais"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const linhaGprk = container.querySelector('.radar-table tbody tr'); // GPRK, Aguardar
  assert.equal(linhaGprk.classList.contains('radar-linha-aguardar'), false);
  const celulaViesGprk = Array.from(linhaGprk.children).find((td) => td.querySelector('.goal-badge'));
  assert.equal(celulaViesGprk.classList.contains('radar-vies-comprar'), false);
  assert.equal(celulaViesGprk.querySelector('.goal-badge').classList.contains('warn'), true);
});

test('renderRadarOportunidades(): Desconto sobre P/L "—" (sem badge/tooltip) quando a planilha não tem esse dado', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  container.querySelector('[data-tabela="acoesInternacionais"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const linhaGprk = container.querySelector('.radar-table tbody tr'); // só tem 1 item nessa tabela no fixture
  const colunas = Array.from(linhaGprk.children).map((td) => td.textContent.trim());
  assert.ok(colunas.includes('—'));
  assert.equal(linhaGprk.querySelectorAll('.radar-desconto-badge').length, 1); // só o de P/VP, P/L é '—'
});

test('renderRadarOportunidades(): Ranking tem badge próprio e Preço-teto fica com classe de destaque (negrito)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const primeiraLinha = container.querySelector('.radar-table tbody tr');
  const badgeRank = primeiraLinha.querySelector('.radar-rank-badge');
  assert.equal(badgeRank.textContent, '1');
  assert.match(primeiraLinha.querySelector('.radar-preco-teto').textContent, /10,00/); // formatBRL usa espaço não-quebrável entre "R$" e o número
});


test('renderRadarOportunidades(): R$ investir/resgatar ganha um ícone "i" com "Nova carteira" no dataset.tooltip', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const primeiraLinha = container.querySelector('.radar-table tbody tr'); // WIZC3, novaCarteira: 5869.89
  // índice 9 = "R$ investir/resgatar" (0 ranking, 1 ativo, ... 8 carteira atual) -
  // Ativo (1) e "% atual x meta" (7) também ganharam ícone "i" nesta
  // rodada, então não dá mais pra pegar só o 1º .radar-info-icon da linha.
  const icone = primeiraLinha.children[9].querySelector('.radar-info-icon');
  assert.ok(icone);
  assert.match(icone.dataset.tooltip, /Nova carteira/);
  assert.match(icone.dataset.tooltip, /5\.869,89/);
});

test('renderRadarOportunidades(): pointermove sobre a célula do Ativo mostra o tooltip com Preço médio e % de diferença (funciona em toque, não só title)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const celulaAtivo = container.querySelector('.radar-table tbody tr td'); // 1ª célula = ranking, mas o alvo certo é a 2ª
  const celulaAtivoReal = container.querySelectorAll('.radar-table tbody tr td')[1];
  assert.equal(celulaAtivoReal.classList.contains('radar-info-alvo'), true);

  celulaAtivoReal.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
  const tooltip = doc.querySelector('.radar-tooltip');
  assert.equal(tooltip.hidden, false);
  assert.match(tooltip.textContent, /Preço médio/);
  assert.match(tooltip.textContent, /Diferença vs\. meta/);

  container.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true }));
  assert.equal(doc.querySelector('.radar-tooltip').hidden, true);
});

// pedido do Tiago (16/09/2026): "Os cards de ativos em radar de
// oportunidade estão com o header todo clicável, mas se eu clico no i,
// o tooltip aparece e some" - no toque (pointerType "touch"/"pen"), o
// pointerdown precisa alternar (não só mostrar) e o fim do toque
// (pointerleave, que o próprio toque dispara ao "sair" da tela) não pode
// mais fechar sozinho - só um toque fora fecha.
test('renderRadarOportunidades(): no toque, tocar na célula do Ativo abre a tooltip e o pointerleave (fim do toque) não fecha mais sozinho', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const celulaAtivo = container.querySelectorAll('.radar-table tbody tr td')[1];

  celulaAtivo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 50, clientY: 50, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.querySelector('.radar-tooltip').hidden, false);

  container.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true, pointerType: 'touch' }));
  assert.equal(doc.querySelector('.radar-tooltip').hidden, false, 'pointerleave no toque não esconde mais (era o bug "aparece e some")');
});

test('renderRadarOportunidades(): no toque, tocar de novo na mesma célula do Ativo fecha a tooltip (alterna)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const celulaAtivo = container.querySelectorAll('.radar-table tbody tr td')[1];

  celulaAtivo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 50, clientY: 50, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.querySelector('.radar-tooltip').hidden, false);

  celulaAtivo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 50, clientY: 50, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.querySelector('.radar-tooltip').hidden, true);
});

test('renderRadarOportunidades(): no toque, tocar fora da célula aberta fecha a tooltip ("se eu clico fora, o tooltip some")', () => {
  const doc = makeDom('<div id="c"></div><div id="fora">Fora da tabela</div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const celulaAtivo = container.querySelectorAll('.radar-table tbody tr td')[1];

  celulaAtivo.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 50, clientY: 50, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.querySelector('.radar-tooltip').hidden, false);

  doc.getElementById('fora').dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 900, clientY: 900, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.querySelector('.radar-tooltip').hidden, true);
});

test('renderRadarOportunidades(): redesenhar o mesmo container (ex.: depois de "Atualizar dados") não duplica o tooltip nem os listeners', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO); // simula um 2º carregamento
  assert.equal(doc.querySelectorAll('.radar-tooltip').length, 1);
});

// 14/09/2026 ("estilo Suno mobile"): cada <td> ganha data-label (usado
// só via CSS, content:attr(data-label), no card do celular - ver o
// media query em distribuicoes-metas.css) e Ranking/Ativo (sempre as 2
// primeiras colunas) ganham .radar-card-topo pra virarem o "topo" do
// card em vez de uma linha rótulo:valor comum.
test('renderRadarOportunidades(): cada célula tem data-label (pro card do mobile) igual ao rótulo da coluna', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const primeiraLinha = container.querySelector('.radar-table tbody tr');
  const celulas = Array.from(primeiraLinha.children);
  assert.equal(celulas[0].dataset.label, '#'); // ranking
  assert.equal(celulas[1].dataset.label, 'Ativo');
  assert.equal(celulas[3].dataset.label, 'Preço-teto');
  assert.equal(celulas[5].dataset.label, 'Desc. P/VP');
});

test('renderRadarOportunidades(): Ranking e Ativo têm a classe radar-card-topo (topo do card no mobile); as outras colunas não', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const primeiraLinha = container.querySelector('.radar-table tbody tr');
  const celulas = Array.from(primeiraLinha.children);
  assert.equal(celulas[0].classList.contains('radar-card-topo'), true); // ranking
  assert.equal(celulas[1].classList.contains('radar-card-topo'), true); // ativo
  assert.equal(celulas[2].classList.contains('radar-card-topo'), false); // precoAtual
  assert.equal(celulas[4].classList.contains('radar-card-topo'), false); // vies
});

test('renderRadarOportunidades(): célula do Ativo mostra o logo (assets/imgs/, via logos-ativos.js) quando o ticker tem um mapeado', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const primeiraLinha = container.querySelector('.radar-table tbody tr'); // WIZC3, tem logo em assets/imgs/acoes/WIZC3.png
  const logo = primeiraLinha.querySelector('.radar-logo');
  assert.ok(logo);
  assert.equal(logo.classList.contains('radar-logo-fallback'), false);
  assert.match(logo.querySelector('img').src, /WIZC3\.png$/);
  assert.match(primeiraLinha.querySelectorAll('.radar-table tbody tr td, td')[1]?.textContent || primeiraLinha.children[1].textContent, /WIZC3/);
});

test('renderRadarOportunidades(): sem logo mapeado (ou se a imagem falha ao carregar) cai no círculo com as iniciais do ticker', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const semLogo = {
    acoesNacionais: {
      itens: [{ ...RADAR_EXEMPLO.acoesNacionais.itens[1], ativo: 'ZZZZ9', linha: 99 }],
      total: {},
    },
    acoesInternacionais: { itens: [], total: {} },
    fiis: { itens: [], total: {} },
  };
  renderRadarOportunidades(doc, container, semLogo);
  const logo = container.querySelector('.radar-logo');
  assert.equal(logo.classList.contains('radar-logo-fallback'), true);
  assert.equal(logo.textContent, 'ZZ');
  assert.equal(logo.querySelector('img'), null);
});

test('renderRadarOportunidades(): imagem do logo que falha ao carregar (evento "error") também cai no círculo de iniciais', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const primeiraLinha = container.querySelector('.radar-table tbody tr'); // WIZC3
  const img = primeiraLinha.querySelector('.radar-logo img');
  img.dispatchEvent(new doc.defaultView.Event('error'));
  const logo = primeiraLinha.querySelector('.radar-logo');
  assert.equal(logo.classList.contains('radar-logo-fallback'), true);
  assert.equal(logo.textContent, 'WI');
  assert.equal(logo.querySelector('img'), null);
});

// 14/09/2026 (2ª rodada de feedback, com prints da Suno): variação % do
// dia embaixo do Preço atual; "% desejado"/"% atual" viraram 1 coluna
// só com barra visual; "Editar" virou ícone; Ações Internacionais
// mostram Carteira atual/R$ investir em dólar (com ícone "i" pra
// reais) + banner de cotação; FIIs ganham cor de linha + legenda +
// segmento no tooltip do Ativo.

test('renderRadarOportunidades(): Preço atual mostra a variação % do dia embaixo, verde quando positiva e vermelha quando negativa', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const dados = {
    acoesNacionais: {
      itens: [
        { ...RADAR_EXEMPLO.acoesNacionais.itens[1], variacaoDia: -0.0021 }, // WIZC3
        { ...RADAR_EXEMPLO.acoesNacionais.itens[0], variacaoDia: 0.0134 }, // VAMO3
      ],
      total: {},
    },
    acoesInternacionais: { itens: [], total: {} },
    fiis: { itens: [], total: {} },
  };
  renderRadarOportunidades(doc, container, dados);
  const linhas = container.querySelectorAll('.radar-table tbody tr');
  const variacaoWizc3 = linhas[0].querySelector('.radar-preco-variacao');
  assert.match(variacaoWizc3.textContent, /-0,21%/);
  assert.equal(variacaoWizc3.classList.contains('bad'), true);
  const variacaoVamo3 = linhas[1].querySelector('.radar-preco-variacao');
  assert.match(variacaoVamo3.textContent, /\+1,34%/);
  assert.equal(variacaoVamo3.classList.contains('good'), true);
});

test('renderRadarOportunidades(): sem variacaoDia (null) não desenha o span de variação', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO); // itens do fixture não têm variacaoDia
  const primeiraLinha = container.querySelector('.radar-table tbody tr');
  assert.equal(primeiraLinha.querySelector('.radar-preco-variacao'), null);
});

test('renderRadarOportunidades(): "% desejado" e "% atual" viram 1 coluna só ("% atual x meta") com barra visual, ainda editável', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const rotulos = Array.from(container.querySelectorAll('.radar-th-btn')).map((b) => b.textContent);
  assert.ok(rotulos.some((r) => r.includes('% atual x meta')));
  assert.equal(rotulos.some((r) => r.includes('% desejado')), false);
  assert.equal(rotulos.some((r) => r === '% atual'), false);

  const primeiraLinha = container.querySelector('.radar-table tbody tr'); // WIZC3: 3%/11%
  const barra = primeiraLinha.querySelector('.radar-pct-wrap');
  assert.ok(barra);
  assert.match(barra.querySelector('.radar-pct-label b').textContent, /3%/);
  assert.match(barra.querySelector('.radar-pct-meta-label').textContent, /11%/);
  assert.match(barra.querySelector('.radar-pct-bar-fill').style.width, /3\.4%|3%/);
  assert.match(barra.querySelector('.radar-pct-bar-meta').style.left, /11/);

  // continua editável (edita só % desejado) - "Editar" ainda revela os
  // mesmos 3 inputs de sempre (Ranking/Preço-teto/% desejado).
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO, { onSalvarItem: async () => {} });
  const linhaEditavel = container.querySelector('.radar-table tbody tr');
  linhaEditavel.querySelector('.radar-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(linhaEditavel.querySelectorAll('.radar-edit-input').length, 3);
});

test('renderRadarOportunidades(): "Editar" é um ícone (sem texto "Editar" visível), com aria-label pra acessibilidade', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO, { onSalvarItem: async () => {} });
  const btn = container.querySelector('.radar-editar-btn');
  assert.equal(btn.getAttribute('aria-label'), 'Editar');
  assert.ok(btn.querySelector('svg'));
  assert.equal(btn.textContent.trim(), '');
});

test('renderRadarOportunidades(): Ações Internacionais mostram Carteira atual e R$ investir em dólar (não mais "R$")', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  container.querySelector('[data-tabela="acoesInternacionais"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const linha = container.querySelector('.radar-table tbody tr'); // GPRK: carteiraAtual 557.7, valorInvestir 42.3
  const celulas = Array.from(linha.children);
  assert.match(celulas[8].textContent, /\$557\.70/); // carteira atual
  assert.match(celulas[9].textContent, /\$42\.30/); // r$ investir/resgatar
  assert.equal(celulas[8].textContent.includes('R$'), false);
});

test('renderRadarOportunidades(): banner de cotação do dólar aparece só na aba Ações Internacionais, quando radar.cotacaoDolar vem preenchido', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const dados = { ...RADAR_EXEMPLO, cotacaoDolar: 5.1218 };
  renderRadarOportunidades(doc, container, dados);
  assert.equal(container.querySelector('.radar-cotacao-dolar'), null); // Ações Nacionais é a aba default
  container.querySelector('[data-tabela="acoesInternacionais"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const banner = container.querySelector('.radar-cotacao-dolar');
  assert.ok(banner);
  assert.match(banner.textContent, /5,12/);
});

test('renderRadarOportunidades(): Carteira atual/Investir-resgatar em Ações Internacionais mostram dólar com o equivalente em reais entre parênteses', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const dados = { ...RADAR_EXEMPLO, cotacaoDolar: 5 };
  renderRadarOportunidades(doc, container, dados);
  container.querySelector('[data-tabela="acoesInternacionais"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const linha = container.querySelector('.radar-table tbody tr'); // GPRK: carteiraAtual 557.7, valorInvestir 42.3
  const celulas = Array.from(linha.children);
  assert.match(celulas[8].textContent, /\$557\.70/);
  assert.match(celulas[8].textContent, /R\$\s*2\.788,50/); // 557.7 * 5
  assert.ok(celulas[8].querySelector('.moeda-conv'));
  assert.match(celulas[9].textContent, /\$42\.30/);
  assert.match(celulas[9].textContent, /R\$\s*211,50/); // 42.3 * 5
  assert.ok(celulas[9].querySelector('.moeda-conv'));
});

test('renderRadarOportunidades(): sem cotacaoDolar, Ações Internacionais não ganham ícone de conversão nem banner', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO); // sem cotacaoDolar no fixture
  container.querySelector('[data-tabela="acoesInternacionais"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(container.querySelector('.radar-cotacao-dolar'), null);
  const linha = container.querySelector('.radar-table tbody tr');
  assert.equal(Array.from(linha.children)[8].querySelector('.radar-info-icon'), null);
});

// 14/09/2026 (3ª rodada de feedback): pintar a LINHA inteira "ficou
// feio" (Tiago) - agora só a célula do Ativo ganha a cor por Tipo (o
// CSS espalha isso pra área do header inteira no card do mobile, via
// :has(), sem precisar de mais classe nenhuma aqui no JS).
test('renderRadarOportunidades(): célula do Ativo (só ela, não a linha) ganha classe de cor pelo Tipo do FII (Tijolo/Híbrido/Papel)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const dados = {
    acoesNacionais: { itens: [], total: {} },
    acoesInternacionais: { itens: [], total: {} },
    fiis: {
      itens: [
        { ...RADAR_EXEMPLO.fiis.itens[0], tipo: 'Tijolo' },
        { ...RADAR_EXEMPLO.fiis.itens[0], linha: 83, ativo: 'TRXF11', tipo: 'Híbrido' },
        { ...RADAR_EXEMPLO.fiis.itens[0], linha: 84, ativo: 'RECR11', tipo: 'Papel' },
      ],
      total: {},
    },
  };
  renderRadarOportunidades(doc, container, dados);
  container.querySelector('[data-tabela="fiis"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const linhas = container.querySelectorAll('.radar-table tbody tr');
  assert.equal(linhas[0].classList.contains('radar-linha-fii-tijolo'), false); // linha não pinta mais
  const celulaAtivo0 = linhas[0].children[1]; // ranking(0), ativo(1)
  assert.equal(celulaAtivo0.classList.contains('radar-fii-cor-tijolo'), true);
  assert.equal(linhas[1].children[1].classList.contains('radar-fii-cor-hibrido'), true);
  assert.equal(linhas[2].children[1].classList.contains('radar-fii-cor-papel'), true);
  // outras células da linha (ex. ranking) não ganham a cor.
  assert.equal(linhas[0].children[0].classList.contains('radar-fii-cor-tijolo'), false);
});

test('renderRadarOportunidades(): legenda de tipo de FII aparece só na aba FIIs', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  assert.equal(container.querySelector('.radar-fii-legenda'), null);
  container.querySelector('[data-tabela="fiis"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const legenda = container.querySelector('.radar-fii-legenda');
  assert.ok(legenda);
  const itens = legenda.querySelectorAll('.radar-fii-legenda-item');
  assert.equal(itens.length, 3);
  assert.match(legenda.textContent, /Tijolo/);
  assert.match(legenda.textContent, /Híbrido/);
  assert.match(legenda.textContent, /Papel/);
});

// 14/09/2026 (4ª rodada de feedback): "pode remover a coluna tipo" -
// deixou de existir coluna própria pro Tipo do FII, só a cor da
// célula do Ativo + a legenda (clicável, ver os 2 testes seguintes).
test('renderRadarOportunidades(): não existe mais coluna "Tipo" (nem cabeçalho, nem célula própria) - só a cor da célula do Ativo', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  container.querySelector('[data-tabela="fiis"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const rotulos = Array.from(container.querySelectorAll('.radar-th-btn')).map((b) => b.textContent);
  assert.equal(rotulos.includes('Tipo'), false);
  const linha = container.querySelector('.radar-table tbody tr');
  assert.equal(Array.from(linha.children).some((td) => td.dataset.label === 'Tipo'), false);
});

const RADAR_FIIS_3_TIPOS = {
  acoesNacionais: { itens: [], total: {} },
  acoesInternacionais: { itens: [], total: {} },
  fiis: {
    itens: [
      { ...RADAR_EXEMPLO.fiis.itens[0], ativo: 'PMLL11', tipo: 'Tijolo' },
      { ...RADAR_EXEMPLO.fiis.itens[0], linha: 83, ativo: 'TRXF11', tipo: 'Híbrido' },
      { ...RADAR_EXEMPLO.fiis.itens[0], linha: 84, ativo: 'RECR11', tipo: 'Papel' },
    ],
    total: {},
  },
};

test('renderRadarOportunidades(): clicar num tipo na legenda filtra a tabela de FIIs; clicar de novo no mesmo tipo volta a mostrar todos', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_FIIS_3_TIPOS);
  container.querySelector('[data-tabela="fiis"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(container.querySelectorAll('.radar-table tbody tr').length, 3);

  const btnTijolo = container.querySelector('.radar-fii-legenda-tijolo');
  btnTijolo.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  let linhas = container.querySelectorAll('.radar-table tbody tr');
  assert.equal(linhas.length, 1);
  assert.match(linhas[0].textContent, /PMLL11/);
  assert.equal(container.querySelector('.radar-fii-legenda-tijolo').classList.contains('active'), true);

  // clicar de novo no mesmo tipo desliga o filtro.
  container.querySelector('.radar-fii-legenda-tijolo').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  linhas = container.querySelectorAll('.radar-table tbody tr');
  assert.equal(linhas.length, 3);
  assert.equal(container.querySelector('.radar-fii-legenda-tijolo').classList.contains('active'), false);

  // trocar pra outro tipo troca o filtro (não acumula).
  container.querySelector('.radar-fii-legenda-hibrido').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  linhas = container.querySelectorAll('.radar-table tbody tr');
  assert.equal(linhas.length, 1);
  assert.match(linhas[0].textContent, /TRXF11/);
  assert.equal(container.querySelector('.radar-fii-legenda-tijolo').classList.contains('active'), false);
  assert.equal(container.querySelector('.radar-fii-legenda-hibrido').classList.contains('active'), true);
});

test('renderRadarOportunidades(): trocar de aba reseta o filtro de tipo de FII', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_FIIS_3_TIPOS);
  container.querySelector('[data-tabela="fiis"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  container.querySelector('.radar-fii-legenda-papel').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(container.querySelectorAll('.radar-table tbody tr').length, 1);

  container.querySelector('[data-tabela="acoesNacionais"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  container.querySelector('[data-tabela="fiis"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(container.querySelectorAll('.radar-table tbody tr').length, 3);
  assert.equal(container.querySelector('.radar-fii-legenda-papel').classList.contains('active'), false);
});

// "Tudo que envolver tooltip, coloca o botão i" (Tiago, 14/09/2026, 4ª
// rodada) - a célula do Ativo e a barra "% atual x meta" já tinham
// tooltip (preço médio/diferença vs. meta e Atual/Meta, respectivamente)
// mas nenhuma pista visual de que dava pra tocar/passar o mouse.
test('renderRadarOportunidades(): célula do Ativo e a barra "% atual x meta" ganham o ícone "i" (mesmo tooltip de antes, agora com uma pista visual)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO);
  const primeiraLinha = container.querySelector('.radar-table tbody tr');
  const celulaAtivo = primeiraLinha.children[1];
  assert.ok(celulaAtivo.querySelector('.radar-info-icon'));
  const celulaPct = primeiraLinha.children[7];
  assert.ok(celulaPct.querySelector('.radar-pct-wrap .radar-info-icon'));
});

test('renderRadarOportunidades(): tooltip do Ativo, nos FIIs, acrescenta "Segmento (Tipo)" (ex. "Shopping (Tijolo)")', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  const dados = {
    acoesNacionais: { itens: [], total: {} },
    acoesInternacionais: { itens: [], total: {} },
    fiis: { itens: [{ ...RADAR_EXEMPLO.fiis.itens[0], tipo: 'Tijolo', segmento: 'Shopping' }], total: {} },
  };
  renderRadarOportunidades(doc, container, dados);
  container.querySelector('[data-tabela="fiis"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const celulaAtivo = container.querySelectorAll('.radar-table tbody tr td')[1];
  assert.match(celulaAtivo.dataset.tooltip, /Shopping \(Tijolo\)/);
});

test('renderRadarOportunidades(): tooltip do Ativo não quebra quando o item não tem segmento (Ações, ou FIIs sem esse dado)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  renderRadarOportunidades(doc, container, RADAR_EXEMPLO); // WIZC3 (Nacionais), sem segmento
  const celulaAtivo = container.querySelectorAll('.radar-table tbody tr td')[1];
  assert.equal(celulaAtivo.dataset.tooltip.includes('undefined'), false);
});



// --- montarPaginaDistribuicoesMetas ------------------------------------------------------

function makePaginaDom() {
  return makeDom(`
    <div class="metas-loading" id="metasLoading"></div>
    <div class="metas-erro" id="metasErro" hidden></div>
    <div id="metasConteudo" hidden>
      <div class="avisos-banner" id="metasAvisos" hidden></div>
      <div id="objetivosCarteiraGrid"></div>
      <div id="splitInternoGrid"></div>
      <div id="radarOportunidadesGrid"></div>
      <div id="metasCarteiraGrid"></div>
    </div>
  `);
}

test('montarPaginaDistribuicoesMetas() renderiza os 3 cards e esconde o loading no sucesso', async () => {
  const doc = makePaginaDom();
  const getDistribuicoesMetasImpl = async () => ({ ok: true, metas: METAS_EXEMPLO });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl });

  assert.equal(doc.getElementById('metasLoading').hidden, true);
  assert.equal(doc.getElementById('metasConteudo').hidden, false);
  assert.equal(doc.getElementById('metasErro').hidden, true);
  assert.equal(doc.getElementById('metasCarteiraGrid').querySelectorAll('.goal-card').length, 3);
});

test('montarPaginaDistribuicoesMetas() também desenha os blocos de Objetivos da Carteira quando vêm na resposta', async () => {
  const doc = makePaginaDom();
  const getDistribuicoesMetasImpl = async () => ({
    ok: true,
    metas: METAS_EXEMPLO,
    objetivos: {
      alocacaoGeral: {
        tipos: [{ tipo: 'FIIs', percentualDesejado: 0.4, percentualAtual: 0.4, carteiraAtual: 1000, valorInvestir: 0 }],
        total: { carteiraAtual: 1000, valorInvestir: 0 },
      },
    },
  });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl });

  assert.equal(doc.getElementById('objetivosCarteiraGrid').querySelectorAll('.obj-bloco').length, 1);
});

test('montarPaginaDistribuicoesMetas() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  const doc = makePaginaDom();
  const getDistribuicoesMetasImpl = async () => ({ ok: false, etapa: 'autenticação', erro: 'token expirado' });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl });

  assert.equal(doc.getElementById('metasLoading').hidden, true);
  assert.equal(doc.getElementById('metasConteudo').hidden, true);
  assert.equal(doc.getElementById('metasErro').hidden, false);
  assert.match(doc.getElementById('metasErro').textContent, /token expirado/);
});

test('montarPaginaDistribuicoesMetas() mostra avisos de falha parcial sem esconder o resto', async () => {
  const doc = makePaginaDom();
  const getDistribuicoesMetasImpl = async () => ({
    ok: true,
    metas: { rendaPassiva: METAS_EXEMPLO.rendaPassiva },
    avisos: { metas: 'Error: falha ao ler Patrimônio' },
  });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl });

  assert.equal(doc.getElementById('metasConteudo').hidden, false);
  assert.equal(doc.getElementById('metasAvisos').hidden, false);
  assert.match(doc.getElementById('metasAvisos').textContent, /Patrimônio/);
});

test('montarPaginaDistribuicoesMetas(): salvar a meta de Renda Passiva grava e recarrega os dados', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  let valorSalvo;
  const getDistribuicoesMetasImpl = async () => {
    chamadasGet += 1;
    return {
      ok: true,
      metas: {
        ...METAS_EXEMPLO,
        rendaPassiva: { ...METAS_EXEMPLO.rendaPassiva, meta: chamadasGet === 1 ? 500 : 600 },
      },
    };
  };
  const salvarMetaRendaPassivaImpl = async (token, valor) => {
    valorSalvo = valor;
    return { ok: true };
  };

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl, salvarMetaRendaPassivaImpl });

  const rendaPassivaCard = doc.getElementById('metasCarteiraGrid').querySelectorAll('.goal-card')[0];
  rendaPassivaCard.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  const input = rendaPassivaCard.querySelector('input[name="valor"]');
  input.value = '600';
  rendaPassivaCard.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(valorSalvo, 600);
  assert.equal(chamadasGet, 2); // busca inicial + recarregar após salvar
  const cardAtualizado = doc.getElementById('metasCarteiraGrid').querySelectorAll('.goal-card')[0];
  assert.match(cardAtualizado.querySelector('.goal-stats').textContent, /600/);
});

test('montarPaginaDistribuicoesMetas(): erro ao salvar não impede tentar de novo (mostra erro no card, sem recarregar)', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  const getDistribuicoesMetasImpl = async () => {
    chamadasGet += 1;
    return { ok: true, metas: METAS_EXEMPLO };
  };
  const salvarMesesRendaEmergencialImpl = async () => ({ ok: false, erro: 'meses inválido' });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl, salvarMesesRendaEmergencialImpl });

  const rendaEmergencialCard = doc.getElementById('metasCarteiraGrid').querySelectorAll('.goal-card')[2];
  rendaEmergencialCard.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  rendaEmergencialCard.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamadasGet, 1); // não recarregou, porque salvar falhou
  assert.match(rendaEmergencialCard.querySelector('.goal-edit-status').textContent, /meses inválido/);
});

test('montarPaginaDistribuicoesMetas(): salvar % desejado de um bloco de Objetivos grava e recarrega os dados', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  const getDistribuicoesMetasImpl = async () => {
    chamadasGet += 1;
    return { ok: true, metas: METAS_EXEMPLO, objetivos: OBJETIVOS_EXEMPLO };
  };
  let salvo;
  const salvarObjetivosCarteiraImpl = async (token, bloco, percentuais) => {
    salvo = { bloco, percentuais };
    return { ok: true };
  };

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl, salvarObjetivosCarteiraImpl });

  const blocoGeral = doc.getElementById('objetivosCarteiraGrid').querySelectorAll('.obj-bloco')[0];
  blocoGeral.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  blocoGeral.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(salvo.bloco, 'geral');
  assert.equal(chamadasGet, 2); // busca inicial + recarregar após salvar
});

test('montarPaginaDistribuicoesMetas(): erro ao salvar % desejado mostra erro no bloco (sem recarregar)', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  const getDistribuicoesMetasImpl = async () => {
    chamadasGet += 1;
    return { ok: true, metas: METAS_EXEMPLO, objetivos: OBJETIVOS_EXEMPLO };
  };
  const salvarObjetivosCarteiraImpl = async () => ({ ok: false, erro: 'soma inválida' });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl, salvarObjetivosCarteiraImpl });

  const blocoGeral = doc.getElementById('objetivosCarteiraGrid').querySelectorAll('.obj-bloco')[0];
  blocoGeral.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  blocoGeral.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamadasGet, 1);
  assert.match(blocoGeral.querySelector('.goal-edit-status').textContent, /soma inválida/);
});

test('montarPaginaDistribuicoesMetas(): salvar um item do Radar de oportunidades grava e recarrega os dados', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  const getDistribuicoesMetasImpl = async () => {
    chamadasGet += 1;
    return { ok: true, metas: METAS_EXEMPLO, objetivos: OBJETIVOS_EXEMPLO, radar: RADAR_EXEMPLO };
  };
  let salvo;
  const salvarRadarItemImpl = async (token, tabela, item) => {
    salvo = { tabela, item };
    return { ok: true };
  };

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl, salvarRadarItemImpl });

  const primeiraLinha = doc.getElementById('radarOportunidadesGrid').querySelector('.radar-table tbody tr');
  primeiraLinha.querySelector('.radar-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  primeiraLinha.querySelector('.radar-salvar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(salvo.tabela, 'acoesNacionais');
  assert.equal(salvo.item.ativo, 'WIZC3');
  assert.equal(chamadasGet, 2); // busca inicial + recarregar após salvar
});

test('montarPaginaDistribuicoesMetas(): erro ao salvar item do Radar mostra erro na linha (sem recarregar)', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  const getDistribuicoesMetasImpl = async () => {
    chamadasGet += 1;
    return { ok: true, metas: METAS_EXEMPLO, objetivos: OBJETIVOS_EXEMPLO, radar: RADAR_EXEMPLO };
  };
  const salvarRadarItemImpl = async () => ({ ok: false, erro: 'linha mudou de ativo' });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl, salvarRadarItemImpl });

  const primeiraLinha = doc.getElementById('radarOportunidadesGrid').querySelector('.radar-table tbody tr');
  primeiraLinha.querySelector('.radar-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  primeiraLinha.querySelector('.radar-salvar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamadasGet, 1);
  assert.match(primeiraLinha.querySelector('.radar-edit-status').textContent, /linha mudou de ativo/);
});

test('montarPaginaDistribuicoesMetas(): desenha o bloco de split interno sincronizado com a aba inicial do Radar (Ações Nacionais)', async () => {
  const doc = makePaginaDom();
  const getDistribuicoesMetasImpl = async () => ({
    ok: true,
    metas: METAS_EXEMPLO,
    radar: RADAR_EXEMPLO,
    splitsInternos: SPLITS_INTERNOS_EXEMPLO,
    linksRecomendados: LINKS_RECOMENDADOS_EXEMPLO,
  });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl });

  const splitGrid = doc.getElementById('splitInternoGrid');
  assert.match(splitGrid.querySelector('.obj-bloco-titulo').textContent, /Ações/);
  assert.equal(splitGrid.querySelectorAll('.split-link').length, 2); // Dividendos + Valor
});

test('montarPaginaDistribuicoesMetas(): trocar pra aba "FIIs" no Radar troca o bloco de split interno junto', async () => {
  const doc = makePaginaDom();
  const getDistribuicoesMetasImpl = async () => ({
    ok: true,
    metas: METAS_EXEMPLO,
    radar: RADAR_EXEMPLO,
    splitsInternos: SPLITS_INTERNOS_EXEMPLO,
    linksRecomendados: LINKS_RECOMENDADOS_EXEMPLO,
  });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl });

  doc.getElementById('radarOportunidadesGrid').querySelectorAll('.filter-tab')[2]
    .dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  const splitGrid = doc.getElementById('splitInternoGrid');
  assert.match(splitGrid.querySelector('.obj-bloco-titulo').textContent, /FIIs/);
  const links = splitGrid.querySelectorAll('.split-link');
  assert.equal(links.length, 1);
  assert.match(links[0].textContent, /FIIS/);
});

test('montarPaginaDistribuicoesMetas(): salvar % desejado do split interno (bloco "fiis") grava e recarrega os dados', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  const getDistribuicoesMetasImpl = async () => {
    chamadasGet += 1;
    return {
      ok: true,
      metas: METAS_EXEMPLO,
      radar: RADAR_EXEMPLO,
      splitsInternos: SPLITS_INTERNOS_EXEMPLO,
      linksRecomendados: LINKS_RECOMENDADOS_EXEMPLO,
    };
  };
  let salvo;
  const salvarSplitInternoImpl = async (token, bloco, percentuais) => {
    salvo = { bloco, percentuais };
    return { ok: true };
  };

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl, salvarSplitInternoImpl });

  doc.getElementById('radarOportunidadesGrid').querySelectorAll('.filter-tab')[2]
    .dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  const splitGrid = doc.getElementById('splitInternoGrid');
  splitGrid.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  splitGrid.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(salvo.bloco, 'fiis');
  assert.equal(chamadasGet, 2); // busca inicial + recarregar após salvar
});

test('montarPaginaDistribuicoesMetas(): erro ao salvar % desejado do split interno mostra erro no bloco (sem recarregar)', async () => {
  const doc = makePaginaDom();
  let chamadasGet = 0;
  const getDistribuicoesMetasImpl = async () => {
    chamadasGet += 1;
    return {
      ok: true,
      metas: METAS_EXEMPLO,
      radar: RADAR_EXEMPLO,
      splitsInternos: SPLITS_INTERNOS_EXEMPLO,
      linksRecomendados: LINKS_RECOMENDADOS_EXEMPLO,
    };
  };
  const salvarSplitInternoImpl = async () => ({ ok: false, erro: 'soma inválida' });

  await montarPaginaDistribuicoesMetas('token-fake', { doc, getDistribuicoesMetasImpl, salvarSplitInternoImpl });

  const splitGrid = doc.getElementById('splitInternoGrid');
  splitGrid.querySelector('.goal-editar-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  splitGrid.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamadasGet, 1);
  assert.match(splitGrid.querySelector('.goal-edit-status').textContent, /soma inválida/);
});
