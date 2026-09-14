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

test('criarCardMeta() põe um tooltip (title) no stat quando o item vem com `title`', () => {
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
  assert.equal(statDivs[0].title, 'explicação de A');
  assert.equal(statDivs[1].title, '');
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

test('criarLinhaObjetivo() põe um tooltip (title) na barra com % exato (atual e meta) e o valor em R$', () => {
  const doc = makeDom('');
  const linha = criarLinhaObjetivo(doc, OBJETIVOS_EXEMPLO.alocacaoGeral.tipos[1]); // FIIs
  const tituloBarra = linha.querySelector('.obj-barra').title;
  assert.match(tituloBarra, /40,32%/);
  assert.match(tituloBarra, /35\.648,00/);
  assert.match(tituloBarra, /40,00%/);
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


// --- montarPaginaDistribuicoesMetas ------------------------------------------------------

function makePaginaDom() {
  return makeDom(`
    <div class="metas-loading" id="metasLoading"></div>
    <div class="metas-erro" id="metasErro" hidden></div>
    <div id="metasConteudo" hidden>
      <div class="avisos-banner" id="metasAvisos" hidden></div>
      <div id="objetivosCarteiraGrid"></div>
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
