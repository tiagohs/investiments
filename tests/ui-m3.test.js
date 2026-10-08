// tests/ui-m3.test.js - 05/10/2026 (Onda 3, base Material 3): módulos de assets/js/ui/ e novas funções do shell.
// Só dados inventados (repositório público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { criarTabs } from '../assets/js/ui/tabs.js';
import { criarBreadcrumb } from '../assets/js/ui/breadcrumb.js';
import { confirmar } from '../assets/js/ui/confirmar.js';
import { toast } from '../assets/js/ui/toast.js';
import { mostrarErroCarga, classificarErroCarga } from '../assets/js/ui/erro-carga.js';
import { formatarTituloPagina, montarCabecalhoPagina } from '../assets/js/ui/pagina.js';
import { buscar, extrairAtivos, coletarAtivosDoCache, normalizar } from '../assets/js/ui/busca.js';
import { criarSwitch } from '../assets/js/ui/switch.js';
import { setupNavDrawer, iniciaisDe, markActiveSection, fixNavLinkHrefs, setupConta, mountRefreshControl } from '../assets/js/shell.js';

function novoDoc(corpo = '<main id="m"></main>') {
  const dom = new JSDOM(`<!doctype html><html><body>${corpo}</body></html>`, { url: 'https://exemplo.test/app/', pretendToBeVisual: true });
  return { dom, doc: dom.window.document, win: dom.window };
}
const tecla = (win, el, key) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true }));

test('criarTabs: pílula com tablist, aria-selected e teclado (setas, Home, End)', () => {
  const { dom, doc, win } = novoDoc('<div id="t"></div>');
  const visto = [];
  const abas = criarTabs(doc.getElementById('t'), { itens: [{ id: 'a', rotulo: 'Ações', contagem: 3 }, { id: 'b', rotulo: 'FIIs' }, { id: 'c', rotulo: 'Renda Fixa' }], aoMudar: (id) => visto.push(id) });
  const t = doc.getElementById('t');
  assert.equal(t.getAttribute('role'), 'tablist');
  assert.ok(t.classList.contains('tabs-pilula'));
  const botoes = [...t.querySelectorAll('[role="tab"]')];
  assert.equal(botoes.length, 3);
  assert.equal(botoes[0].getAttribute('aria-selected'), 'true');
  assert.equal(botoes[0].querySelector('.tab-n').textContent, '3');
  botoes[0].focus(); tecla(win, botoes[0], 'ArrowRight');
  assert.equal(abas.obterAtivo(), 'b');
  tecla(win, botoes[1], 'End');
  assert.equal(abas.obterAtivo(), 'c');
  tecla(win, botoes[2], 'Home');
  assert.equal(abas.obterAtivo(), 'a');
  assert.deepEqual(visto, ['b', 'c', 'a']);
  assert.equal(botoes.filter((b) => b.getAttribute('aria-selected') === 'true').length, 1);
  assert.equal(botoes.filter((b) => b.tabIndex === 0).length, 1, 'roving tabindex');
  dom.window.close();
});

test('criarTabs: sublinhada com links usa aria-current e não vira tablist', () => {
  const { dom, doc } = novoDoc('<div id="t"></div>');
  criarTabs(doc.getElementById('t'), { variante: 'sublinhada', ativo: 'l', itens: [{ id: 'a', rotulo: 'Aportes', href: '#aportes' }, { id: 'l', rotulo: 'Lançamentos', href: '#lancamentos' }] });
  const t = doc.getElementById('t');
  assert.ok(t.classList.contains('tabs-sub'));
  assert.equal(t.getAttribute('role'), 'navigation');
  assert.equal(t.querySelector('a[aria-current="page"]').textContent, 'Lançamentos');
  dom.window.close();
});

test('criarBreadcrumb: último item é a página atual e os anteriores são links', () => {
  const { dom, doc } = novoDoc('<nav id="b"></nav>');
  criarBreadcrumb(doc.getElementById('b'), [{ rotulo: 'Carteiras', href: '/c' }, { rotulo: 'Ações', href: '/c#acoes' }, { rotulo: 'ABCD3' }]);
  const b = doc.getElementById('b');
  assert.equal(b.querySelectorAll('a').length, 2);
  assert.equal(b.querySelector('[aria-current="page"]').textContent, 'ABCD3');
  dom.window.close();
});

test('formatarTituloPagina: "<Subaba> · <Seção> · Patrimônio", omitindo o que falta', () => {
  assert.equal(formatarTituloPagina({ subaba: 'Aportes', secao: 'Transações' }), 'Aportes · Transações · Patrimônio');
  assert.equal(formatarTituloPagina({ secao: 'Início' }), 'Início · Patrimônio');
  assert.equal(formatarTituloPagina({}), 'Patrimônio');
});

test('montarCabecalhoPagina: título, abas e document.title; trocar de aba atualiza o título', () => {
  const { dom, doc } = novoDoc('<div id="c"></div>');
  const cab = montarCabecalhoPagina(doc.getElementById('c'), { secao: 'Transações', subaba: 'Aportes', titulo: 'Transações', abas: { pilula: { itens: [{ id: 'aportes', rotulo: 'Aportes' }, { id: 'lancamentos', rotulo: 'Lançamentos' }], ativo: 'aportes' } } });
  assert.equal(doc.title, 'Aportes · Transações · Patrimônio');
  assert.equal(doc.querySelector('.pagina-titulo').textContent, 'Transações');
  assert.ok(cab.abas && cab.abas.pilula);
  dom.window.close();
});

test('confirmar(): resolve true no botão de confirmar, false em Cancelar e em Esc; perigo foca "Cancelar"', async () => {
  const { dom, doc, win } = novoDoc();
  let p = confirmar({ titulo: 'Excluir?', mensagem: 'Não dá pra desfazer.', confirmarTexto: 'Excluir', perigo: true, doc });
  const caixa = doc.querySelector('[role="alertdialog"], [role="dialog"]');
  assert.ok(caixa, 'diálogo aberto');
  assert.ok(caixa.textContent.includes('Excluir?'));
  assert.equal(doc.activeElement.textContent.trim(), 'Cancelar');
  [...doc.querySelectorAll('.dialogo button')].find((b) => b.textContent.trim() === 'Excluir').click();
  assert.equal(await p, true);
  assert.equal(doc.querySelector('.dialogo'), null, 'fechou');
  p = confirmar({ titulo: 'Seguir?', doc });
  [...doc.querySelectorAll('.dialogo button')].find((b) => b.textContent.trim() === 'Cancelar').click();
  assert.equal(await p, false);
  p = confirmar({ titulo: 'Seguir?', doc });
  tecla(win, doc.querySelector('.dialogo'), 'Escape');
  assert.equal(await p, false);
  dom.window.close();
});

test('toast(): região única (cada aviso é status/alert), máximo de 3, ação "Desfazer" e fechar', () => {
  const { dom, doc } = novoDoc();
  let desfeito = 0;
  toast.ok('Salvo', { doc, duracaoMs: 0 });
  toast.erro('Falhou', { doc });
  toast.info('Info 1', { doc, duracaoMs: 0 });
  toast('Com ação', { doc, desfazer: () => { desfeito += 1; } });
  const regiao = doc.getElementById('toasts');
  assert.ok(regiao && regiao.getAttribute('role') === 'region');
  assert.equal(regiao.querySelectorAll('.toast').length, 3, 'máximo de 3 na pilha');
  regiao.querySelector('.toast-acao').click();
  assert.equal(desfeito, 1);
  assert.equal(regiao.querySelectorAll('.toast').length, 2);
  dom.window.close();
});

test('classificarErroCarga e mostrarErroCarga: mensagem humana, detalhes técnicos e "Tentar de novo"', () => {
  assert.equal(classificarErroCarga({ resposta: { ok: false, etapa: 'network', erro: 'Failed to fetch' } }), 'rede');
  assert.equal(classificarErroCarga({ resposta: { ok: false, erro: 'Token expirado' } }), 'sessao');
  assert.equal(classificarErroCarga({ online: false }), 'offline');
  assert.equal(classificarErroCarga({ resposta: { ok: false, erro: 'boom' } }), 'servidor');
  const { dom, doc } = novoDoc('<div id="e"></div>');
  let tentou = 0;
  mostrarErroCarga(doc.getElementById('e'), { tela: 'Carteiras', resposta: { ok: false, etapa: 'getHome', erro: 'boom' }, aoTentar: () => { tentou += 1; } });
  const e = doc.getElementById('e');
  assert.ok(e.textContent.includes('Carteiras'));
  assert.ok(e.querySelector('details').textContent.includes('getHome'));
  [...e.querySelectorAll('button')].find((b) => /Tentar de novo/.test(b.textContent)).click();
  assert.equal(tentou, 1);
  dom.window.close();
});

test('criarSwitch: checkbox com role="switch" e aoMudar', () => {
  const { dom, doc } = novoDoc('<div id="s"></div>');
  const visto = [];
  criarSwitch(doc.getElementById('s'), { rotulo: 'Mostrar valores', marcado: false, aoMudar: (v) => visto.push(v) });
  const sw = doc.querySelector('[role="switch"]');
  assert.equal(sw.checked, false);
  sw.click();
  assert.equal(sw.checked, true);
  assert.deepEqual(visto, [true]);
  dom.window.close();
});

test('busca global: telas por nome sem acento e ativos do cache local (dados inventados)', async () => {
  assert.equal(normalizar('Ações'), 'acoes');
  const telas = buscar('lancamentos').telas.map((t) => t.rotulo);
  assert.ok(telas.includes('Lançamentos'));
  const dados = { acoes: [{ ticker: 'abcd3', nome: 'Empresa Alfa' }, { ticker: 'WXYZ4', empresa: 'Empresa Beta' }] };
  assert.deepEqual(extrairAtivos(dados, 'Ações').map((a) => a.ticker), ['ABCD3', 'WXYZ4']);
  const ativos = await coletarAtivosDoCache(async (chave) => (chave === 'carteiras_acoes_v2' ? { dados } : null));
  assert.equal(ativos.length, 2);
  assert.equal(buscar('abc', ativos).ativos[0].ticker, 'ABCD3');
  assert.equal(buscar('beta', ativos).ativos[0].ticker, 'WXYZ4');
  assert.deepEqual(buscar('', ativos).ativos, []);
});

test('iniciaisDe: duas letras do nome/e-mail, "P" sem nada', () => {
  assert.equal(iniciaisDe('maria.souza@exemplo.test'), 'MS');
  assert.equal(iniciaisDe('previa@exemplo.test'), 'PR');
  assert.equal(iniciaisDe(''), 'P');
});

const SHELL_FALSO = `
  <header id="topbar"><button id="navToggleTopo" aria-expanded="false"></button><div id="shellSecaoTitulo">Patrimônio</div>
    <img data-src-raiz="assets/img/logo.svg"><a class="brand" data-href-raiz="index.html" href="#">m</a>
    <span id="contaAvatar"></span><b id="contaNome"></b><small id="contaSub"></small><a id="planilhaLink" href="#"></a></header>
  <div class="nav-scrim" id="navScrim"></div>
  <nav id="mainnav"><button id="navToggle" aria-expanded="false"></button>
    <div class="nav-item" data-section="inicio"><a class="nav-link" href="index.html" data-section="inicio"></a></div>
    <div class="nav-item" data-section="carteiras"><a class="nav-link" href="carteiras/index.html" data-section="carteiras"></a></div></nav>
  <aside id="navDrawer" data-aberto="false"><button id="navFechar"></button>
    <div class="nav-item" data-section="inicio"><a class="nav-link" href="index.html" data-section="inicio"><span class="nav-label">Início</span></a></div>
    <div class="nav-item" data-section="carteiras"><a class="nav-link" href="carteiras/index.html" data-section="carteiras"><span class="nav-label">Carteiras</span></a></div></aside>`;

test('markActiveSection/fixNavLinkHrefs: trilho e gaveta, aria-current e título da seção na top bar', () => {
  const { dom, doc } = novoDoc(SHELL_FALSO);
  fixNavLinkHrefs(doc, 'https://exemplo.test/app/');
  assert.equal(doc.querySelector('#navDrawer a[data-section="carteiras"]').href, 'https://exemplo.test/app/carteiras/index.html');
  assert.equal(doc.querySelector('.brand').href, 'https://exemplo.test/app/index.html');
  markActiveSection(doc, 'carteiras');
  assert.equal(doc.querySelectorAll('[aria-current="page"]').length, 2, 'um no trilho e um na gaveta');
  assert.equal(doc.getElementById('shellSecaoTitulo').textContent, 'Carteiras');
  markActiveSection(doc, null);
  assert.equal(doc.querySelectorAll('[aria-current="page"]').length, 0);
  dom.window.close();
});

test('setupNavDrawer: ☰ abre/fecha, Esc fecha por cima, estado lembrado só no desktop; sem elementos não quebra', () => {
  const guardado = {};
  const storage = { getItem: (k) => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = v; } };
  const { dom, doc, win } = novoDoc(SHELL_FALSO);
  Object.defineProperty(win, 'innerWidth', { value: 1300, configurable: true });
  const g = setupNavDrawer(doc, { win, storage });
  assert.equal(doc.body.dataset.nav, 'fechado', 'largura < 1440 sem preferência: começa recolhida');
  doc.getElementById('navToggle').click();
  assert.equal(doc.body.dataset.nav, 'aberto');
  assert.equal(doc.getElementById('navDrawer').getAttribute('data-aberto'), 'true');
  assert.equal(doc.getElementById('navToggle').getAttribute('aria-expanded'), 'true');
  assert.equal(guardado.investiments_nav_expandido, '1');
  doc.getElementById('navFechar').click();
  assert.equal(doc.body.dataset.nav, 'fechado');
  assert.equal(guardado.investiments_nav_expandido, '0');
  g.abrir();
  assert.equal(g.estaAberta(), true);
  dom.window.close();

  // celular: modal, com scrim; Esc fecha; não grava preferência
  const m = novoDoc(SHELL_FALSO);
  Object.defineProperty(m.win, 'innerWidth', { value: 390, configurable: true });
  const guardado2 = {};
  const g2 = setupNavDrawer(m.doc, { win: m.win, storage: { getItem: () => null, setItem: (k, v) => { guardado2[k] = v; } } });
  m.doc.getElementById('navToggleTopo').click();
  assert.ok(m.doc.getElementById('navScrim').classList.contains('open'));
  tecla(m.win, m.doc, 'Escape');
  assert.equal(g2.estaAberta(), false);
  assert.deepEqual(guardado2, {});
  m.dom.window.close();

  const vazio = novoDoc('<p>sem shell</p>');
  assert.doesNotThrow(() => setupNavDrawer(vazio.doc, { win: vazio.win }));
  vazio.dom.window.close();
});

test('setupConta: avatar/nome a partir do token (sem chamada de rede) e link da planilha', () => {
  const { dom, doc } = novoDoc(SHELL_FALSO);
  const payload = Buffer.from(JSON.stringify({ email: 'maria.souza@exemplo.test' })).toString('base64').replace(/=+$/, '');
  setupConta(doc, { token: `x.${payload}.y`, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit' });
  assert.equal(doc.getElementById('contaAvatar').textContent, 'MS');
  assert.equal(doc.getElementById('contaSub').textContent, 'maria.souza@exemplo.test');
  assert.equal(doc.getElementById('planilhaLink').getAttribute('href'), 'https://docs.google.com/spreadsheets/d/abc/edit');
  setupConta(doc, { token: null });
  assert.equal(doc.getElementById('contaAvatar').textContent, 'P');
  dom.window.close();
});

test('mountRefreshControl: falha (resultado false ou exceção) mostra "Falhou ao atualizar" e não registra horário', async () => {
  const { dom, doc } = novoDoc('<div id="r"></div>');
  const r = doc.getElementById('r');
  let modo = 'falha';
  const ctrl = mountRefreshControl(doc, r, async () => { if (modo === 'excecao') throw new Error('x'); return modo === 'falha' ? false : undefined; }, { intervaloMs: 0, agora: () => new Date(2026, 9, 5, 8, 7) });
  await ctrl.atualizar();
  assert.equal(r.querySelector('.refresh-status').textContent, 'Falhou ao atualizar');
  assert.ok(r.querySelector('.refresh-status').classList.contains('erro'));
  modo = 'excecao';
  await ctrl.atualizar();
  assert.equal(r.querySelector('.refresh-status').textContent, 'Falhou ao atualizar');
  modo = 'ok';
  await ctrl.atualizar();
  assert.equal(r.querySelector('.refresh-status').textContent, 'Atualizado às 08:07');
  assert.ok(!r.querySelector('.refresh-status').classList.contains('erro'));
  dom.window.close();
});

// 08/10/2026 (Tiago: "Você não tem permissão para chamar SpreadsheetApp.getActiveSpreadsheet" vez ou outra): isso é o Apps
// Script sem autorização (não é sessão do site, não é rede) - a mensagem diz o que fazer (autorizarProjetoDireto no editor).
test('erro de autorização do Apps Script: tela de erro e aviso parcial dizem pra rodar autorizarProjetoDireto (não "sessão expirou")', async () => {
  const ERRO = 'Exception: Você não tem permissão para chamar SpreadsheetApp.getActiveSpreadsheet. Permissões necessárias: (https://www.googleapis.com/auth/spreadsheets.currentonly || https://www.googleapis.com/auth/spreadsheets).';
  assert.equal(classificarErroCarga({ resposta: { ok: false, etapa: 'home', erro: ERRO } }), 'autorizacao');
  assert.equal(classificarErroCarga({ resposta: { ok: false, erro: 'Exception: You do not have permission to call UrlFetchApp.fetch' } }), 'autorizacao');
  assert.equal(classificarErroCarga({ resposta: { ok: false, etapa: 'autenticação', erro: 'token expirado' } }), 'sessao', 'sessão do site continua sessão');
  const { window } = new JSDOM('<div id="e"></div><div id="a" hidden></div>');
  const d = window.document;
  mostrarErroCarga(d.getElementById('e'), { tela: 'Início', resposta: { ok: false, erro: ERRO }, aoTentar: () => {} });
  assert.match(d.getElementById('e').textContent, /perdeu a autorização do Google.*autorizarProjetoDireto/);
  const { renderAvisosParciais } = await import('../assets/js/pages/avisos-parciais.js');
  renderAvisosParciais(d.getElementById('a'), { home: ERRO, historico: ERRO }, { home: 'dados gerais', historico: 'histórico' });
  assert.match(d.getElementById('a').textContent, /perdeu a autorização do Google.*autorizarProjetoDireto.*dados gerais, histórico/);
  renderAvisosParciais(d.getElementById('a'), { home: 'Timeout' }, {});
  assert.match(d.getElementById('a').textContent, /Algumas partes não carregaram agora/);
});
