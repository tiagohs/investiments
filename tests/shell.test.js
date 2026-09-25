// Unit tests for assets/js/shell.js, using jsdom for the DOM-touching
// pieces (this module injects/queries real elements, unlike theme.js's
// plain-object-friendly design). mountShell() itself is exercised with a
// fake fetch and a fake theme module so no real network/localStorage is
// needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  parseShellPartial,
  injectShell,
  markActiveSection,
  fixNavLinkHrefs,
  resolveSiteRootUrl,
  setupPopovers,
  setupThemeToggle,
  registerServiceWorker,
  setMainVisible,
  redirectParaLogin,
  setupAuthGate,
  setupSyncNowButton,
  setupLimparCacheButton,
  limparCacheLocalNavegador,
  renderSyncStatus,
  renderSyncLog,
  categoriaSync_,
  carregarStatusSync,
  mountShell,
  mountRefreshControl,
} from '../assets/js/shell.js';

/** Espera as promessas pendentes (uma volta da fila de macrotarefas). */
const esvaziarFila = () => new Promise((r) => setTimeout(r, 0));

const SHELL_PARTIAL_HTML = `
  <template id="shell-header-template">
    <div class="topbar"><div class="brand-mark">P</div></div>
    <div class="overlay-backdrop" id="shell-backdrop"></div>
    <div class="sync-wrap">
      <button id="syncBadgeBtn" data-toggle-panel="syncPanel" aria-expanded="false">sync</button>
      <div class="overlay-panel" id="syncPanel">
        <button id="limparCacheBtn" type="button">Limpar cache</button>
        <button id="syncNowBtn" type="button">Sincronizar tudo</button>
        <button type="button" data-sync="ativos">Ativos</button>
        <button type="button" data-sync="rendaFixa">Renda Fixa e índices</button>
        <button type="button" data-sync="proventos">Proventos (FNet)</button>
        <button type="button" data-sync="informes">Informes dos FIIs</button>
        <div class="sync-log" id="syncLog"><div class="hint">Nenhuma sincronização registrada ainda.</div></div>
        <a id="syncSheetLink" href="#">link</a>
      </div>
    </div>
    <div class="outro-wrap">
      <button id="outroBtn" data-toggle-panel="outroPanel" aria-expanded="false">outro</button>
      <div class="overlay-panel" id="outroPanel">outro panel</div>
    </div>
    <nav id="mainnav">
      <div class="nav-item" data-section="inicio"><a class="nav-link" href="index.html" data-section="inicio">Início</a></div>
      <div class="nav-item" data-section="carteiras"><a class="nav-link" href="carteiras/index.html" data-section="carteiras">Carteiras</a></div>
      <div class="nav-item" data-section="distribuicoes"><a class="nav-link" href="distribuicoes-metas.html" data-section="distribuicoes">Distribuições e Metas</a></div>
    </nav>
  </template>
  <template id="shell-footer-template">
    <div class="theme-footer"><button id="themeToggle">tema</button></div>
  </template>
`;

function makeDom(bodyHtml = '<div id="shell-header"></div><main></main><div id="shell-footer"></div>') {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

function mountedDoc(bodySection) {
  const doc = makeDom();
  if (bodySection) doc.body.dataset.section = bodySection;
  const { headerContent, footerContent } = parseShellPartial(SHELL_PARTIAL_HTML, doc);
  injectShell(doc, { headerContent, footerContent });
  return doc;
}


// --- setMainVisible / redirectParaLogin / setupAuthGate --------------------
// getTokenImpl/redirectImpl are injected fakes here on purpose - the real
// auth.js touches sessionStorage and the real redirectParaLogin does a
// genuine window.location.href navigation, neither of which belongs in a
// unit test. mountShell()'s own tests further down never provide a token,
// so they exercise this same "no token yet" path for free (with the real
// redirectParaLogin, harmlessly assigning href on a jsdom window that never
// actually navigates anywhere).

test('setMainVisible() toggles the hidden attribute on <main>', () => {
  const doc = makeDom();
  setMainVisible(doc, false);
  assert.equal(doc.querySelector('main').hidden, true);
  setMainVisible(doc, true);
  assert.equal(doc.querySelector('main').hidden, false);
});

test('setMainVisible() is a no-op (never throws) when the page has no <main>', () => {
  const doc = makeDom('<div id="shell-header"></div><div id="shell-footer"></div>');
  assert.doesNotThrow(() => setMainVisible(doc, true));
});

test('redirectParaLogin() sends the browser to login.html, remembering the current path+query in ?redirect=', () => {
  let assignedHref = null;
  const fakeWin = { location: { pathname: '/carteiras/acoes.html', search: '?periodo=12m', set href(v) { assignedHref = v; }, get href() { return assignedHref; } } };
  redirectParaLogin(fakeWin, { raizSite: 'https://tiago.github.io/investiments/' });
  assert.equal(assignedHref, 'https://tiago.github.io/investiments/login.html?redirect=%2Fcarteiras%2Facoes.html%3Fperiodo%3D12m');
});

test('redirectParaLogin() de uma página em subpasta (carteiras/, proventos/) vai pra login.html da RAIZ, nunca carteiras/login.html (404)', () => {
  for (const pathname of ['/investiments/carteiras/index.html', '/investiments/proventos/index.html', '/investiments/index.html']) {
    let assignedHref = null;
    const fakeWin = { location: { pathname, search: '', set href(v) { assignedHref = v; }, get href() { return assignedHref; } } };
    redirectParaLogin(fakeWin, { raizSite: 'https://tiago.github.io/investiments/' });
    const url = new URL(assignedHref);
    assert.equal(url.pathname, '/investiments/login.html', pathname);
    assert.equal(url.searchParams.get('redirect'), pathname);
  }
  // sem raizSite: usa a raiz real do site (onde shell.js mora, ../../)
  let href = null;
  redirectParaLogin({ location: { pathname: '/carteiras/index.html', search: '', set href(v) { href = v; } } });
  assert.match(href, /\/login\.html\?redirect=/);
  assert.doesNotMatch(href, /carteiras\/login\.html/);
});

test('setupAuthGate() shows <main> right away and calls onAuthenticated when a token already exists - never redirects', () => {
  const doc = makeDom();
  let calledWith = null;
  setupAuthGate(doc, {
    onAuthenticated: (token) => { calledWith = token; },
    getTokenImpl: () => 'token-existente',
    redirectImpl: () => { throw new Error('não deveria redirecionar - já tinha token'); },
    carregarStatusSyncImpl: () => {},
  });
  assert.equal(doc.querySelector('main').hidden, false);
  assert.equal(calledWith, 'token-existente');
});

test('setupAuthGate() also dispara carregarStatusSyncImpl com o token, quando autenticado', () => {
  const doc = makeDom();
  let calledWith = null;
  setupAuthGate(doc, {
    getTokenImpl: () => 'token-existente',
    redirectImpl: () => { throw new Error('não deveria redirecionar - já tinha token'); },
    carregarStatusSyncImpl: (_doc, { token }) => { calledWith = token; },
  });
  assert.equal(calledWith, 'token-existente');
});

test('setupAuthGate() também liga os botões de sincronização (setupSyncNowButtonImpl) quando autenticado', () => {
  const doc = makeDom();
  let calledWith = null;
  setupAuthGate(doc, {
    getTokenImpl: () => 'token-existente',
    redirectImpl: () => { throw new Error('não deveria redirecionar - já tinha token'); },
    carregarStatusSyncImpl: () => {},
    setupSyncNowButtonImpl: (_doc, { token }) => { calledWith = token; },
  });
  assert.equal(calledWith, 'token-existente');
});

test('setupAuthGate() também liga o botão "Limpar cache" (setupLimparCacheButtonImpl) quando autenticado', () => {
  const doc = makeDom();
  let calledWith = null;
  setupAuthGate(doc, {
    getTokenImpl: () => 'token-existente',
    redirectImpl: () => { throw new Error('não deveria redirecionar - já tinha token'); },
    carregarStatusSyncImpl: () => {},
    setupSyncNowButtonImpl: () => {},
    setupLimparCacheButtonImpl: (_doc, { token }) => { calledWith = token; },
  });
  assert.equal(calledWith, 'token-existente');
});

test('setupAuthGate() nunca liga o botão de sincronizar quando não há token', () => {
  const doc = makeDom();
  let called = false;
  setupAuthGate(doc, {
    getTokenImpl: () => null,
    redirectImpl: () => {},
    setupSyncNowButtonImpl: () => { called = true; },
  });
  assert.equal(called, false);
});

test('setupAuthGate() nunca liga o botão "Limpar cache" quando não há token', () => {
  const doc = makeDom();
  let called = false;
  setupAuthGate(doc, {
    getTokenImpl: () => null,
    redirectImpl: () => {},
    setupLimparCacheButtonImpl: () => { called = true; },
  });
  assert.equal(called, false);
});

test('setupAuthGate() nunca chama carregarStatusSyncImpl quando não há token', () => {
  const doc = makeDom();
  let called = false;
  setupAuthGate(doc, {
    getTokenImpl: () => null,
    redirectImpl: () => {},
    carregarStatusSyncImpl: () => { called = true; },
  });
  assert.equal(called, false);
});

test('setupAuthGate() hides <main> and redirects to login when there is no token yet - never calls onAuthenticated', () => {
  const doc = makeDom();
  let redirected = false;
  setupAuthGate(doc, {
    onAuthenticated: () => { throw new Error('não deveria ser chamado sem login'); },
    getTokenImpl: () => null,
    redirectImpl: () => { redirected = true; },
  });
  assert.equal(doc.querySelector('main').hidden, true);
  assert.equal(redirected, true);
});

test('setupAuthGate() defaults onAuthenticated to a no-op - a page with nothing to fetch yet can omit it', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => setupAuthGate(doc, {
    getTokenImpl: () => 'token-existente',
    redirectImpl: () => { throw new Error('não deveria chamar'); },
    carregarStatusSyncImpl: () => {},
  }));
});

// --- renderSyncStatus / carregarStatusSync --------------------------------

function syncDom() {
  const doc = makeDom();
  const wrap = doc.createElement('div');
  wrap.innerHTML = `
    <div class="refresh-pill" id="refreshPill" title="Cotações atualizadas há --">
      <span id="refreshLabel">--</span>
    </div>
    <button id="syncBadgeBtn" class="sync-badge"><svg><use href="#ico-check"/></svg></button>
    <div id="syncLog"></div>
    <a id="syncSheetLink" href="#"></a>
  `;
  doc.body.appendChild(wrap);
  return doc;
}

test('renderSyncStatus() com "Sem dados" mantém o estado neutro (placeholder, sem classe no badge)', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Sem dados', timestamp: null, origem: '', detalhe: 'Nenhuma sincronização registrada ainda.' });
  const badge = doc.getElementById('syncBadgeBtn');
  assert.equal(badge.classList.contains('good'), false);
  assert.equal(badge.classList.contains('warn'), false);
  assert.equal(badge.classList.contains('bad'), false);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);
});

test('renderSyncStatus() com resultado null (falha ao buscar) também cai no estado neutro', () => {
  const doc = syncDom();
  renderSyncStatus(doc, null);
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('bad'), false);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);
});

test('renderSyncStatus() com status "Sucesso" pinta o badge de "good" e mostra a linha no log', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Sucesso', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: '29 ativos sincronizados' });
  const badge = doc.getElementById('syncBadgeBtn');
  assert.equal(badge.classList.contains('good'), true);
  const log = doc.getElementById('syncLog');
  assert.match(log.textContent, /Sucesso/);
  assert.match(log.textContent, /29 ativos sincronizados/);
});

test('renderSyncStatus() com status "Erro" pinta o badge de "bad"', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Erro', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: 'falhou' });
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('bad'), true);
});

test('renderSyncStatus() troca o ÍCONE do badge (não só a cor) pra bater com o status real da última sincronização', () => {
  const doc = syncDom();
  const icone = () => doc.getElementById('syncBadgeBtn').querySelector('svg use').getAttribute('href');

  // Bug relatado por print (13/09/2026, 3ª rodada): a última sincronização
  // era "Atenção", mas o badge continuava com o ícone de check (hardcoded
  // no shell.html e nunca atualizado aqui) - considera sempre a última
  // sincronização real, não um ícone fixo.
  renderSyncStatus(doc, { status: 'Atenção', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: 'parcial' });
  assert.equal(icone(), '#ico-warn');

  renderSyncStatus(doc, { status: 'Erro', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: 'falhou' });
  assert.equal(icone(), '#ico-bad');

  renderSyncStatus(doc, { status: 'Sucesso', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: 'ok' });
  assert.equal(icone(), '#ico-check');
});

test('renderSyncStatus() com "Sem dados" mantém o ícone do badge em check (estado neutro)', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Sem dados', timestamp: null, origem: '', detalhe: '' });
  assert.equal(doc.getElementById('syncBadgeBtn').querySelector('svg use').getAttribute('href'), '#ico-check');
});

test('renderSyncStatus() preenche o refresh-pill (antes um "--" estático) com a hora relativa da última sincronização', () => {
  const doc = syncDom();
  const agora = new Date('2026-09-13T10:20:00.000Z');
  renderSyncStatus(doc, { status: 'Sucesso', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: '' }, agora);

  const label = doc.getElementById('refreshLabel');
  const pill = doc.getElementById('refreshPill');
  assert.equal(label.textContent, 'há 20min');
  assert.match(pill.title, /há 20min/);
});

test('renderSyncStatus() mantém o refresh-pill em "--" quando não há sincronização registrada ainda', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Sem dados', timestamp: null, origem: '', detalhe: '' });
  assert.equal(doc.getElementById('refreshLabel').textContent, '--');
});

test('renderSyncStatus() sempre aponta o link "ver todas" pra planilha real (SPREADSHEET_URL)', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Sucesso', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: '' });
  assert.match(doc.getElementById('syncSheetLink').href, /docs\.google\.com\/spreadsheets/);
});

test('carregarStatusSync() busca com o token e renderiza o resultado (badge + lista completa)', async () => {
  const doc = syncDom();
  let tokenRecebido = null;
  await carregarStatusSync(doc, {
    token: 'tok-123',
    getSyncHistoricoImpl: async (token) => {
      tokenRecebido = token;
      return {
        ok: true,
        resultado: [
          { status: 'Sucesso', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: '29 de 29 ativos atualizados' },
          { status: 'Atenção', timestamp: '2026-09-12T10:00:00.000Z', origem: 'app', detalhe: 'Renda Fixa: 1 linha(s) nova(s)' },
        ],
      };
    },
  });
  assert.equal(tokenRecebido, 'tok-123');
  // Badge/pill refletem a MAIS RECENTE (lista[0]).
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('good'), true);
  // A lista completa (não só a mais recente) chega no log.
  const log = doc.getElementById('syncLog');
  assert.match(log.textContent, /29 de 29 ativos atualizados/);
  assert.match(log.textContent, /Renda Fixa: 1 linha\(s\) nova\(s\)/);
});

test('carregarStatusSync() sem token não busca nada', async () => {
  const doc = syncDom();
  let chamou = false;
  await carregarStatusSync(doc, { token: null, getSyncHistoricoImpl: async () => { chamou = true; return { ok: true, resultado: [] }; } });
  assert.equal(chamou, false);
});

test('carregarStatusSync() trata falha (ok:false ou exceção) caindo no estado neutro, sem lançar', async () => {
  const doc = syncDom();
  await assert.doesNotReject(carregarStatusSync(doc, {
    token: 'tok-123',
    getSyncHistoricoImpl: async () => { throw new Error('rede fora'); },
  }));
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('bad'), false);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);
});

test('carregarStatusSync() com lista vazia (nenhuma sincronização ainda) cai no estado neutro', async () => {
  const doc = syncDom();
  await carregarStatusSync(doc, {
    token: 'tok-123',
    getSyncHistoricoImpl: async () => ({ ok: true, resultado: [] }),
  });
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('good'), false);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);
});

// --- categoriaSync_ ---------------------------------------------------

test('categoriaSync_() reconhece o formato de Renda Fixa/Índices ("Renda Fixa: ...")', () => {
  assert.equal(categoriaSync_('Renda Fixa: 0 linha(s) nova(s) (14 posições) — Índices: 0 linha(s) nova(s)'), 'Renda Fixa');
});

test('categoriaSync_() reconhece o formato de Renda Variável/Patrimônio ("<N> de <M> ativos...")', () => {
  assert.equal(categoriaSync_('29 de 29 ativos atualizados'), 'Renda Variável (Patrimônio)');
  assert.equal(categoriaSync_('0 de 2 ativos atualizados — 2 falharam: A, B'), 'Renda Variável (Patrimônio)');
});

test('categoriaSync_() devolve null pra mensagem desconhecida, vazia ou ausente', () => {
  assert.equal(categoriaSync_('algo inesperado'), null);
  assert.equal(categoriaSync_(''), null);
  assert.equal(categoriaSync_(undefined), null);
});

// --- renderSyncLog ------------------------------------------------------

test('renderSyncLog() com lista vazia ou null mostra o texto neutro', () => {
  const doc = syncDom();
  renderSyncLog(doc, []);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);

  renderSyncLog(doc, null);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);
});

test('renderSyncLog() renderiza UMA linha por item da lista (não só a mais recente)', () => {
  const doc = syncDom();
  renderSyncLog(doc, [
    { status: 'Sucesso', timestamp: '2026-09-16T10:10:00.000Z', origem: 'Manual', detalhe: '29 de 29 ativos atualizados' },
    { status: 'Sucesso', timestamp: '2026-09-16T09:52:00.000Z', origem: 'Automático', detalhe: 'Renda Fixa: 11 linha(s) nova(s)' },
    { status: 'Atenção', timestamp: '2026-09-15T09:10:00.000Z', origem: 'Automático', detalhe: '19 de 29 ativos atualizados — 10 incompletos' },
  ]);
  const linhas = doc.querySelectorAll('#syncLog .sync-log-row');
  assert.equal(linhas.length, 3);
});

test('renderSyncLog() mostra a categoria (Renda Fixa / Renda Variável) no título de cada linha', () => {
  const doc = syncDom();
  renderSyncLog(doc, [
    { status: 'Sucesso', timestamp: '2026-09-16T10:10:00.000Z', origem: 'Manual', detalhe: '29 de 29 ativos atualizados' },
    { status: 'Sucesso', timestamp: '2026-09-16T09:52:00.000Z', origem: 'Automático', detalhe: 'Renda Fixa: 11 linha(s) nova(s)' },
  ]);
  const linhas = doc.querySelectorAll('#syncLog .sync-log-row');
  assert.match(linhas[0].querySelector('.top-line').textContent, /Renda Variável \(Patrimônio\)/);
  assert.match(linhas[1].querySelector('.top-line').textContent, /Renda Fixa/);
});

test('renderSyncLog() esconde o Detalhe atrás de um botão "i" até o clique', () => {
  const doc = syncDom();
  renderSyncLog(doc, [
    { status: 'Sucesso', timestamp: '2026-09-16T10:10:00.000Z', origem: 'Manual', detalhe: '29 de 29 ativos atualizados' },
  ]);
  const linha = doc.querySelector('#syncLog .sync-log-row');
  const detalhe = linha.querySelector('.detail');
  const botaoInfo = linha.querySelector('.sync-info-btn');

  assert.ok(botaoInfo, 'botão "i" deveria existir quando há detalhe');
  assert.equal(detalhe.hidden, true);
  assert.equal(botaoInfo.getAttribute('aria-expanded'), 'false');

  botaoInfo.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(detalhe.hidden, false);
  assert.equal(botaoInfo.getAttribute('aria-expanded'), 'true');

  botaoInfo.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(detalhe.hidden, true);
  assert.equal(botaoInfo.getAttribute('aria-expanded'), 'false');
});

test('renderSyncLog() não desenha o botão "i" quando a linha não tem Detalhe', () => {
  const doc = syncDom();
  renderSyncLog(doc, [
    { status: 'Sucesso', timestamp: '2026-09-16T10:10:00.000Z', origem: 'Manual', detalhe: '' },
  ]);
  const linha = doc.querySelector('#syncLog .sync-log-row');
  assert.equal(linha.querySelector('.sync-info-btn'), null);
  assert.equal(linha.querySelector('.detail'), null);
});

// --- setupSyncNowButton ---------------------------------------------------
// 14/09/2026: cada sincronização é uma chamada SEPARADA (nunca combinadas
// numa mesma requisição - ver api-client.js!syncRendaFixaEIndices).
// 25/09/2026: 4 sincronizações (ativos, Renda Fixa/Índices, proventos e
// informes dos FIIs no FNet) - "Sincronizar tudo" roda as 4 em sequência e
// cada botão [data-sync] força só a sua.

function fakesSync(chamadas, extra = {}) {
  return {
    token: 'token-abc',
    syncNowImpl: async (token) => { chamadas.push(['ativos', token]); return { ok: true }; },
    syncRendaFixaEIndicesImpl: async (token) => { chamadas.push(['rendaFixa', token]); return { ok: true }; },
    syncProventosFnetImpl: async (token) => { chamadas.push(['proventos', token]); return { ok: true }; },
    syncInformesFnetImpl: async (token) => { chamadas.push(['informes', token]); return { ok: true }; },
    carregarStatusSyncImpl: async () => { chamadas.push(['status']); },
    ...extra,
  };
}
const clicar = (doc, el) => el.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

test('setupSyncNowButton(): "Sincronizar tudo" chama as 4 sincronizações com o token, em sequência, e recarrega o status ao final', async () => {
  const doc = mountedDoc();
  const chamadas = [];
  setupSyncNowButton(doc, fakesSync(chamadas));

  clicar(doc, doc.getElementById('syncNowBtn'));
  await esvaziarFila();

  assert.deepEqual(chamadas, [
    ['ativos', 'token-abc'],
    ['rendaFixa', 'token-abc'],
    ['proventos', 'token-abc'],
    ['informes', 'token-abc'],
    ['status'],
  ]);
});

for (const [id, esperado] of [['ativos', 'ativos'], ['rendaFixa', 'rendaFixa'], ['proventos', 'proventos'], ['informes', 'informes']]) {
  test(`setupSyncNowButton(): botão "${id}" força SÓ essa sincronização e recarrega o status`, async () => {
    const doc = mountedDoc();
    const chamadas = [];
    setupSyncNowButton(doc, fakesSync(chamadas));

    clicar(doc, doc.querySelector(`[data-sync="${id}"]`));
    await esvaziarFila();

    assert.deepEqual(chamadas, [[esperado, 'token-abc'], ['status']]);
  });
}

test('setupSyncNowButton(): enquanto uma sincronização roda, TODOS os botões ficam desabilitados, o clicado mostra o progresso, e voltam ao normal no final', async () => {
  const doc = mountedDoc();
  const resolvedores = [];
  const pendente = () => new Promise((r) => { resolvedores.push(r); });
  setupSyncNowButton(doc, {
    token: 'token-abc',
    syncNowImpl: pendente,
    syncRendaFixaEIndicesImpl: pendente,
    syncProventosFnetImpl: pendente,
    syncInformesFnetImpl: pendente,
    carregarStatusSyncImpl: async () => {},
  });

  const btn = doc.getElementById('syncNowBtn');
  const chip = doc.querySelector('[data-sync="proventos"]');
  const textos = [btn.textContent, chip.textContent];
  clicar(doc, btn);
  await esvaziarFila();

  assert.equal(btn.disabled, true);
  assert.equal(chip.disabled, true);
  assert.equal(btn.textContent, 'Sincronizando 1/4…');

  resolvedores[0]({ ok: true });
  await esvaziarFila();
  assert.equal(btn.textContent, 'Sincronizando 2/4…');

  resolvedores[1]({ ok: true });
  await esvaziarFila();
  resolvedores[2]({ ok: true });
  await esvaziarFila();
  assert.equal(btn.textContent, 'Sincronizando 4/4…');
  resolvedores[3]({ ok: true });
  await esvaziarFila();

  assert.equal(btn.disabled, false);
  assert.equal(chip.disabled, false);
  assert.deepEqual([btn.textContent, chip.textContent], textos);
});

test('setupSyncNowButton(): botão individual mostra "Sincronizando…" (sem contador)', async () => {
  const doc = mountedDoc();
  let resolver;
  setupSyncNowButton(doc, fakesSync([], { syncInformesFnetImpl: () => new Promise((r) => { resolver = r; }) }));
  const chip = doc.querySelector('[data-sync="informes"]');
  clicar(doc, chip);
  await esvaziarFila();
  assert.equal(chip.textContent, 'Sincronizando…');
  resolver({ ok: true });
  await esvaziarFila();
  assert.equal(chip.textContent, 'Informes dos FIIs');
});

test('setupSyncNowButton(): clicar em outro botão enquanto uma sincronização roda não dispara nada novo', async () => {
  const doc = mountedDoc();
  const chamadas = [];
  let resolver;
  setupSyncNowButton(doc, fakesSync(chamadas, { syncNowImpl: () => { chamadas.push(['ativos']); return new Promise((r) => { resolver = r; }); } }));

  clicar(doc, doc.getElementById('syncNowBtn'));
  clicar(doc, doc.getElementById('syncNowBtn'));
  clicar(doc, doc.querySelector('[data-sync="proventos"]'));
  await esvaziarFila();

  assert.deepEqual(chamadas, [['ativos']]);
  resolver({ ok: true });
  await esvaziarFila();
});

test('setupSyncNowButton(): uma sincronização falhar não impede as seguintes nem trava os botões', async () => {
  const doc = mountedDoc();
  const chamadas = [];
  setupSyncNowButton(doc, fakesSync(chamadas, {
    syncNowImpl: async () => { throw new Error('rede caiu'); },
    syncProventosFnetImpl: async () => { throw new Error('FNet fora do ar'); },
  }));

  const btn = doc.getElementById('syncNowBtn');
  clicar(doc, btn);
  await esvaziarFila();

  assert.deepEqual(chamadas, [['rendaFixa', 'token-abc'], ['informes', 'token-abc'], ['status']]);
  assert.equal(btn.disabled, false);
  assert.equal(doc.querySelector('[data-sync="ativos"]').disabled, false);
});

test('setupSyncNowButton() sem token nao liga nada (clicar nao chama nenhuma sincronização)', () => {
  const doc = mountedDoc();
  const chamadas = [];
  setupSyncNowButton(doc, { ...fakesSync(chamadas), token: null });

  clicar(doc, doc.getElementById('syncNowBtn'));
  clicar(doc, doc.querySelector('[data-sync="ativos"]'));
  assert.deepEqual(chamadas, []);
});

test('setupSyncNowButton() nao quebra quando a pagina nao tem #syncNowBtn', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => setupSyncNowButton(doc, { token: 'token-abc' }));
});

// --- setupLimparCacheButton ------------------------------------------------
// 17/09/2026: botão "Limpar cache" - ação SEPARADA de setupSyncNowButton
// (chama limparCacheHistoricoImpl sozinho, nunca junto de syncNowImpl/
// syncRendaFixaEIndicesImpl) - ver comentário da função em shell.js pro
// motivo (a maioria dos syncs não precisa disso).

test('setupLimparCacheButton() chama limparCacheHistoricoImpl com o token, mostra confirmação e agenda o reload', async () => {
  const doc = mountedDoc();
  let chamadoCom = null;
  let reloadChamado = false;
  const fakeWin = { location: { reload: () => { reloadChamado = true; } } };
  let callbackAgendado = null;
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: async (token) => { chamadoCom = token; return { ok: true, resultado: { limpou: true, chave: 'historico_serie_v4_1_2_3_4' } }; },
    win: fakeWin,
    setTimeoutImpl: (cb) => { callbackAgendado = cb; },
  });

  const btn = doc.getElementById('limparCacheBtn');
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await esvaziarFila();

  assert.equal(chamadoCom, 'token-abc');
  assert.equal(btn.textContent, 'Cache limpo ✓');
  assert.equal(btn.disabled, true); // ainda desabilitado - só o reload (agendado) resolveria isso
  assert.ok(callbackAgendado, 'deveria ter agendado o reload via setTimeoutImpl');

  callbackAgendado();
  assert.equal(reloadChamado, true);
});

test('setupLimparCacheButton() quando o servidor já estava sem cache, ainda confirma (o do aparelho foi limpo) e agenda o reload', async () => {
  const doc = mountedDoc();
  let callbackAgendado = null;
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: async () => ({ ok: true, resultado: { limpou: false, motivo: 'já estava frio' } }),
    win: { location: { reload: () => {} } },
    setTimeoutImpl: (cb) => { callbackAgendado = cb; },
  });

  const btn = doc.getElementById('limparCacheBtn');
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await esvaziarFila();

  assert.equal(btn.textContent, 'Cache limpo ✓');
  assert.ok(callbackAgendado);
});

test('setupLimparCacheButton() desabilita o botao e troca o texto enquanto esta em voo', async () => {
  const doc = mountedDoc();
  let resolver;
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: () => new Promise((r) => { resolver = r; }),
    win: { location: { reload: () => {} } },
    setTimeoutImpl: () => {},
  });

  const btn = doc.getElementById('limparCacheBtn');
  const textoOriginal = btn.textContent;
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await Promise.resolve();

  assert.equal(btn.disabled, true);
  assert.equal(btn.textContent, 'Limpando…');

  resolver({ ok: true, resultado: { limpou: true } });
  await Promise.resolve();
  await Promise.resolve();

  assert.notEqual(btn.textContent, textoOriginal); // ficou na mensagem de confirmação, esperando o reload
});

test('setupLimparCacheButton() clique duplo enquanto ja esta em voo nao chama limparCacheHistoricoImpl 2 vezes', async () => {
  const doc = mountedDoc();
  let chamadas = 0;
  let resolver;
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: () => { chamadas += 1; return new Promise((r) => { resolver = r; }); },
    win: { location: { reload: () => {} } },
    setTimeoutImpl: () => {},
  });

  const btn = doc.getElementById('limparCacheBtn');
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await Promise.resolve();

  assert.equal(chamadas, 1);
  resolver({ ok: true, resultado: { limpou: true } });
});

test('setupLimparCacheButton() trata falha sem lancar, mostra mensagem de erro e reabilita o botao (sem agendar reload)', async () => {
  const doc = mountedDoc();
  let reloadChamado = false;
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: async () => { throw new Error('rede caiu'); },
    win: { location: { reload: () => { reloadChamado = true; } } },
    setTimeoutImpl: () => { reloadChamado = true; },
  });

  const btn = doc.getElementById('limparCacheBtn');
  const textoOriginal = btn.textContent;
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await esvaziarFila();

  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, textoOriginal);
  assert.equal(reloadChamado, false);
});

test('setupLimparCacheButton() sem win/setTimeoutImpl nao agenda reload - so restaura o botao', async () => {
  const doc = mountedDoc();
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: async () => ({ ok: true, resultado: { limpou: true } }),
    win: undefined,
    setTimeoutImpl: undefined,
  });

  const btn = doc.getElementById('limparCacheBtn');
  const textoOriginal = btn.textContent;
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await esvaziarFila();

  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, textoOriginal);
});

test('setupLimparCacheButton() sem token nao liga nada (clicar nao chama limparCacheHistoricoImpl)', () => {
  const doc = mountedDoc();
  let chamado = false;
  setupLimparCacheButton(doc, {
    token: null,
    limparCacheHistoricoImpl: async () => { chamado = true; },
  });

  const btn = doc.getElementById('limparCacheBtn');
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(chamado, false);
});

test('setupLimparCacheButton() nao quebra quando a pagina nao tem #limparCacheBtn', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => setupLimparCacheButton(doc, { token: 'token-abc' }));
});

test('setupLimparCacheButton() também limpa o cache DESTE aparelho (IndexedDB: telas de ativo etc.) antes de agendar o reload', async () => {
  const doc = mountedDoc();
  const ordem = [];
  let callbackAgendado = null;
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: async () => { ordem.push('servidor'); return { ok: true, resultado: { limpou: true } }; },
    limparCacheLocalImpl: async () => { await esvaziarFila(); ordem.push('aparelho'); },
    win: { location: { reload: () => {} } },
    setTimeoutImpl: (cb) => { ordem.push('reload agendado'); callbackAgendado = cb; },
  });

  doc.getElementById('limparCacheBtn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await esvaziarFila();
  await esvaziarFila();

  assert.deepEqual(ordem, ['servidor', 'aparelho', 'reload agendado']);
  assert.ok(callbackAgendado);
});

test('setupLimparCacheButton() limpa o cache do aparelho mesmo quando o servidor falha', async () => {
  const doc = mountedDoc();
  let limpouAparelho = false;
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: async () => { throw new Error('rede caiu'); },
    limparCacheLocalImpl: async () => { limpouAparelho = true; },
    win: { location: { reload: () => {} } },
    setTimeoutImpl: () => {},
  });

  doc.getElementById('limparCacheBtn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await esvaziarFila();

  assert.equal(limpouAparelho, true);
});

test('setupLimparCacheButton() resposta ok:false do servidor conta como falha (sem reload)', async () => {
  const doc = mountedDoc();
  let agendou = false;
  setupLimparCacheButton(doc, {
    token: 'token-abc',
    limparCacheHistoricoImpl: async () => ({ ok: false, erro: 'x' }),
    limparCacheLocalImpl: async () => {},
    win: { location: { reload: () => {} } },
    setTimeoutImpl: () => { agendou = true; },
  });
  const btn = doc.getElementById('limparCacheBtn');
  const textoOriginal = btn.textContent;
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await esvaziarFila();

  assert.equal(agendou, false);
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, textoOriginal);
});

test('limparCacheLocalNavegador() apaga o IndexedDB (cache-dados) e todo o Cache Storage; nunca lança', async () => {
  let limpouDados = false;
  const apagados = [];
  await limparCacheLocalNavegador({
    limparCacheDadosImpl: async () => { limpouDados = true; },
    cachesImpl: { keys: async () => ['patrimonio-shell-v2', 'outro'], delete: async (n) => { apagados.push(n); return true; } },
  });
  assert.equal(limpouDados, true);
  assert.deepEqual(apagados, ['patrimonio-shell-v2', 'outro']);

  await assert.doesNotReject(limparCacheLocalNavegador({
    limparCacheDadosImpl: async () => { throw new Error('quota'); },
    cachesImpl: { keys: async () => { throw new Error('bloqueado'); }, delete: async () => true },
  }));
  await assert.doesNotReject(limparCacheLocalNavegador({ limparCacheDadosImpl: async () => {}, cachesImpl: undefined }));
});

// --- parseShellPartial ---------------------------------------------------

test('parseShellPartial() finds both templates and exposes their content', () => {
  const doc = makeDom();
  const { headerContent, footerContent } = parseShellPartial(SHELL_PARTIAL_HTML, doc);
  assert.ok(headerContent.querySelector('#mainnav'));
  assert.ok(footerContent.querySelector('#themeToggle'));
});

test('parseShellPartial() throws a clear error when a template is missing', () => {
  const doc = makeDom();
  assert.throws(
    () => parseShellPartial('<template id="shell-header-template"></template>', doc),
    /shell-footer-template/,
  );
});

// --- injectShell ----------------------------------------------------------

test('injectShell() clones header and footer content into their mount points', () => {
  const doc = mountedDoc();
  assert.ok(doc.getElementById('shell-header').querySelector('#mainnav'));
  assert.ok(doc.getElementById('shell-footer').querySelector('#themeToggle'));
});

test('injectShell() logs but does not throw when a mount point is missing', () => {
  const doc = makeDom('<main></main>'); // no #shell-header / #shell-footer at all
  const { headerContent, footerContent } = parseShellPartial(SHELL_PARTIAL_HTML, doc);
  assert.doesNotThrow(() => injectShell(doc, { headerContent, footerContent }));
});

// --- markActiveSection ------------------------------------------------

test('markActiveSection() marks the matching nav-item current and its link active', () => {
  const doc = mountedDoc();
  markActiveSection(doc, 'carteiras');

  const carteirasItem = doc.querySelector('.nav-item[data-section="carteiras"]');
  const inicioItem = doc.querySelector('.nav-item[data-section="inicio"]');
  assert.equal(carteirasItem.classList.contains('current'), true);
  assert.equal(carteirasItem.querySelector('.nav-link').classList.contains('active'), true);
  assert.equal(inicioItem.classList.contains('current'), false);
  assert.equal(inicioItem.querySelector('.nav-link').classList.contains('active'), false);
});

test('markActiveSection() leaves every item inactive when sectionKey matches nothing', () => {
  const doc = mountedDoc();
  markActiveSection(doc, 'pagina-que-nao-existe');
  doc.querySelectorAll('.nav-item').forEach((item) => {
    assert.equal(item.classList.contains('current'), false);
  });
});

test('markActiveSection() leaves every item inactive when sectionKey is null', () => {
  const doc = mountedDoc();
  markActiveSection(doc, null);
  doc.querySelectorAll('.nav-item').forEach((item) => {
    assert.equal(item.classList.contains('current'), false);
  });
});

// --- fixNavLinkHrefs / resolveSiteRootUrl -------------------------------

test('fixNavLinkHrefs() resolves every #mainnav .nav-link href against the given root, fixing nested-page relative paths', () => {
  const doc = mountedDoc();
  const root = 'https://tiago.github.io/investiments/';

  fixNavLinkHrefs(doc, root);

  const hrefs = Array.from(doc.querySelectorAll('#mainnav .nav-link')).map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, [
    'https://tiago.github.io/investiments/index.html',
    'https://tiago.github.io/investiments/carteiras/index.html',
    'https://tiago.github.io/investiments/distribuicoes-metas.html',
  ]);
});

test('fixNavLinkHrefs() makes a link from a page nested under carteiras/ resolve to the site root, not the current page', () => {
  const doc = mountedDoc();
  // simulates being on .../carteiras/index.html: without the fix, the
  // browser would resolve "distribuicoes-metas.html" relative to
  // carteiras/, landing on the 404'd carteiras/distribuicoes-metas.html.
  const root = 'https://tiago.github.io/investiments/';
  fixNavLinkHrefs(doc, root);

  const distribuicoesLink = doc.querySelector('.nav-item[data-section="distribuicoes"] .nav-link');
  assert.equal(distribuicoesLink.getAttribute('href'), 'https://tiago.github.io/investiments/distribuicoes-metas.html');
});

test('fixNavLinkHrefs() does not throw and touches nothing when there is no #mainnav yet', () => {
  const doc = makeDom(); // un-injected, no #mainnav
  assert.doesNotThrow(() => fixNavLinkHrefs(doc, 'https://example.com/'));
});

test('resolveSiteRootUrl() returns a URL (the exact value depends on where shell.js itself is served from)', () => {
  const url = resolveSiteRootUrl();
  assert.equal(typeof url, 'string');
  assert.ok(url.endsWith('/'));
});

// --- setupPopovers ------------------------------------------------------

test('setupPopovers() opens a panel and the backdrop on trigger click, closes on backdrop click', () => {
  const doc = mountedDoc();
  setupPopovers(doc);

  const syncBtn = doc.getElementById('syncBadgeBtn');
  const syncPanel = doc.getElementById('syncPanel');
  const backdrop = doc.getElementById('shell-backdrop');

  syncBtn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(syncPanel.classList.contains('open'), true);
  assert.equal(backdrop.classList.contains('open'), true);
  assert.equal(syncBtn.getAttribute('aria-expanded'), 'true');

  backdrop.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(syncPanel.classList.contains('open'), false);
  assert.equal(backdrop.classList.contains('open'), false);
  assert.equal(syncBtn.getAttribute('aria-expanded'), 'false');
});

test('setupPopovers() opening one panel closes another that was already open', () => {
  const doc = mountedDoc();
  setupPopovers(doc);

  const syncBtn = doc.getElementById('syncBadgeBtn');
  const outroBtn = doc.getElementById('outroBtn');
  const syncPanel = doc.getElementById('syncPanel');
  const outroPanel = doc.getElementById('outroPanel');
  const click = (el) => el.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  click(syncBtn);
  assert.equal(syncPanel.classList.contains('open'), true);

  click(outroBtn);
  assert.equal(outroPanel.classList.contains('open'), true);
  assert.equal(syncPanel.classList.contains('open'), false);
});

test('setupPopovers() clicking an open trigger again toggles its panel closed', () => {
  const doc = mountedDoc();
  setupPopovers(doc);
  const syncBtn = doc.getElementById('syncBadgeBtn');
  const syncPanel = doc.getElementById('syncPanel');
  const click = () => syncBtn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  click();
  assert.equal(syncPanel.classList.contains('open'), true);
  click();
  assert.equal(syncPanel.classList.contains('open'), false);
});

test('setupPopovers() closes every open panel on Escape', () => {
  const doc = mountedDoc();
  setupPopovers(doc);
  const syncBtn = doc.getElementById('syncBadgeBtn');
  const syncPanel = doc.getElementById('syncPanel');
  syncBtn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(syncPanel.classList.contains('open'), true);

  doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(syncPanel.classList.contains('open'), false);
});

// --- setupThemeToggle ----------------------------------------------------

test('setupThemeToggle() calls initTheme once on setup with the root element', () => {
  const doc = mountedDoc();
  let initedWith = null;
  setupThemeToggle(doc, { initTheme: (root) => { initedWith = root; }, toggleTheme: () => {} });
  assert.equal(initedWith, doc.documentElement);
});

test('setupThemeToggle() calls toggleTheme with the root element when the button is clicked', () => {
  const doc = mountedDoc();
  let toggledWith = null;
  setupThemeToggle(doc, { initTheme: () => {}, toggleTheme: (root) => { toggledWith = root; return 'dark'; } });

  doc.getElementById('themeToggle').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(toggledWith, doc.documentElement);
});

test('setupThemeToggle() does not throw when the page has no theme toggle button', () => {
  const doc = makeDom('<div id="shell-header"></div><main></main>'); // no footer mount, no button
  assert.doesNotThrow(() => setupThemeToggle(doc, { initTheme: () => {}, toggleTheme: () => {} }));
});

// --- registerServiceWorker -------------------------------------------

test('registerServiceWorker() does nothing when the browser has no serviceWorker support', async () => {
  await assert.doesNotReject(registerServiceWorker('sw.js', {}));
  await assert.doesNotReject(registerServiceWorker('sw.js', undefined));
});

test('registerServiceWorker() calls navigator.serviceWorker.register() with the given url', async () => {
  let registeredWith = null;
  const fakeNavigator = { serviceWorker: { register: async (url) => { registeredWith = url; } } };
  await registerServiceWorker('fake://sw.js', fakeNavigator);
  assert.equal(registeredWith, 'fake://sw.js');
});

test('registerServiceWorker() logs but does not throw when register() rejects', async () => {
  const fakeNavigator = { serviceWorker: { register: async () => { throw new Error('nope'); } } };
  await assert.doesNotReject(registerServiceWorker('fake://sw.js', fakeNavigator));
});

// --- mountShell (the real-world glue, with fakes for fetch/document) ------

test('mountShell() fetches the partial, injects it, marks the section, and wires theme', async () => {
  const doc = makeDom(); // fresh, un-injected document
  doc.body.dataset.section = 'carteiras';

  const fetchImpl = async (url) => ({
    ok: true,
    text: async () => SHELL_PARTIAL_HTML,
  });

  await mountShell({ document: doc, fetchImpl, partialUrl: 'fake://shell.html' });

  assert.ok(doc.getElementById('mainnav'), 'header content should be injected');
  const carteirasItem = doc.querySelector('.nav-item[data-section="carteiras"]');
  assert.equal(carteirasItem.classList.contains('current'), true);
});

test('mountShell() also fixes the main-nav hrefs against the site root, using the given siteRootUrl', async () => {
  const doc = makeDom();
  const fetchImpl = async () => ({ ok: true, text: async () => SHELL_PARTIAL_HTML });

  await mountShell({
    document: doc,
    fetchImpl,
    partialUrl: 'fake://shell.html',
    siteRootUrl: 'https://tiago.github.io/investiments/',
  });

  const distribuicoesLink = doc.querySelector('.nav-item[data-section="distribuicoes"] .nav-link');
  assert.equal(distribuicoesLink.getAttribute('href'), 'https://tiago.github.io/investiments/distribuicoes-metas.html');
});

test('mountShell() logs and does not throw when the fetch fails', async () => {
  const doc = makeDom();
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });

  await assert.doesNotReject(mountShell({ document: doc, fetchImpl, partialUrl: 'fake://missing.html' }));
  assert.equal(doc.getElementById('shell-header').children.length, 0);
});

test('mountShell() also registers the service worker, using the given navigator/serviceWorkerUrl', async () => {
  const doc = makeDom();
  const fetchImpl = async () => ({ ok: true, text: async () => SHELL_PARTIAL_HTML });
  let registeredWith = null;
  const fakeNavigator = { serviceWorker: { register: async (url) => { registeredWith = url; } } };

  await mountShell({
    document: doc,
    fetchImpl,
    partialUrl: 'fake://shell.html',
    serviceWorkerUrl: 'fake://sw.js',
    navigator: fakeNavigator,
  });

  assert.equal(registeredWith, 'fake://sw.js');
});

test('mountShell() still registers the service worker even when the shell fetch fails', async () => {
  const doc = makeDom();
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => '' });
  let registeredWith = null;
  const fakeNavigator = { serviceWorker: { register: async (url) => { registeredWith = url; } } };

  await mountShell({
    document: doc,
    fetchImpl,
    partialUrl: 'fake://shell.html',
    serviceWorkerUrl: 'fake://sw.js',
    navigator: fakeNavigator,
  });

  assert.equal(registeredWith, 'fake://sw.js');
});

// --- mountRefreshControl -------------------------------------------------------
// Pedido do Tiago (14/09/2026): botão de atualizar + "atualizado às HH:MM" +
// timer automático, reaproveitado pela Início e por Distribuições e Metas.
// Clicar não pode mostrar skeleton de novo — por isso o teste central aqui é
// que os dados atuais nunca somem: quem chama (a própria página) é quem
// decide o que redesenhar dentro de `aoAtualizar`, este módulo só cuida do
// botão/status/timer.

test('mountRefreshControl() desenha o botão "Atualizar dados" e chama aoAtualizar ao clicar, registrando o horário', async () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  let chamadas = 0;
  const aoAtualizar = async () => { chamadas += 1; };
  const agoraFixo = () => new Date(2026, 8, 14, 9, 5);

  mountRefreshControl(doc, container, aoAtualizar, { intervaloMs: 0, agora: agoraFixo });

  const btn = container.querySelector('.refresh-btn');
  assert.equal(btn.textContent, 'Atualizar dados');
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamadas, 1);
  assert.match(container.querySelector('.refresh-status').textContent, /Atualizado às 09:05/);
});

test('mountRefreshControl(): botão vira "Atualizando…" e fica desabilitado enquanto aoAtualizar está em voo', async () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  let resolver;
  const aoAtualizar = () => new Promise((r) => { resolver = r; });

  mountRefreshControl(doc, container, aoAtualizar, { intervaloMs: 0 });

  const btn = container.querySelector('.refresh-btn');
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await Promise.resolve();

  assert.equal(btn.textContent, 'Atualizando…');
  assert.equal(btn.disabled, true);

  resolver();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(btn.textContent, 'Atualizar dados');
  assert.equal(btn.disabled, false);
});

test('mountRefreshControl(): clique duplo enquanto já está atualizando não chama aoAtualizar 2 vezes', async () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  let chamadas = 0;
  let resolver;
  const aoAtualizar = () => { chamadas += 1; return new Promise((r) => { resolver = r; }); };

  mountRefreshControl(doc, container, aoAtualizar, { intervaloMs: 0 });

  const btn = container.querySelector('.refresh-btn');
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await Promise.resolve();

  assert.equal(chamadas, 1);
  resolver();
});

test('mountRefreshControl(): marcarAtualizado() registra o horário sem chamar aoAtualizar (reflete a carga inicial que a página já fez)', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  let chamadas = 0;
  const aoAtualizar = async () => { chamadas += 1; };
  const agoraFixo = () => new Date(2026, 8, 14, 8, 0);

  const controle = mountRefreshControl(doc, container, aoAtualizar, { intervaloMs: 0, agora: agoraFixo });
  controle.marcarAtualizado();

  assert.equal(chamadas, 0);
  assert.match(container.querySelector('.refresh-status').textContent, /Atualizado às 08:00/);
});

test('mountRefreshControl(): liga um timer automático que chama aoAtualizar sozinho, e pararTimer() desliga', () => {
  const doc = makeDom('<div id="c"></div>');
  const container = doc.getElementById('c');
  let chamadas = 0;
  const aoAtualizar = async () => { chamadas += 1; };
  const chamadasTimer = [];
  const setIntervalImpl = (fn, ms) => { chamadasTimer.push(ms); return { fn }; };
  let limpou = false;
  const clearIntervalImpl = () => { limpou = true; };

  const controle = mountRefreshControl(doc, container, aoAtualizar, {
    intervaloMs: 300000,
    setIntervalImpl,
    clearIntervalImpl,
  });

  assert.deepEqual(chamadasTimer, [300000]);
  controle.pararTimer();
  assert.equal(limpou, true);
});

test('mountRefreshControl() sem container não quebra (só devolve no-ops)', async () => {
  const doc = makeDom('<div id="c"></div>');
  const controle = mountRefreshControl(doc, null, async () => {});
  await controle.atualizar();
  controle.pararTimer();
});

// 25/09/2026: botão Sair do topo
test('setupLogoutButton(): clicar em Sair apaga o token e manda pro login', async () => {
  const { JSDOM } = await import('jsdom');
  const { setupLogoutButton } = await import('../assets/js/shell.js');
  const doc = new JSDOM('<button id="logoutBtn"></button>').window.document;
  const passos = [];
  setupLogoutButton(doc, { clearTokenImpl: () => passos.push('limpou'), redirectImpl: () => passos.push('login') });
  doc.getElementById('logoutBtn').click();
  assert.deepEqual(passos, ['limpou', 'login']);
});
