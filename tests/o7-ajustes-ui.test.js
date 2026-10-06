// 07/10/2026 - testes dos ajustes de UI do Tiago: (2) lista do "Registro de Controle" (ícone de status gigante) e
// (3) "Cards por linha" da Início. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { renderSyncLog } from '../assets/js/shell.js';
import {
  OPCOES_CARDS_POR_LINHA, PADRAO_CARDS_POR_LINHA, CHAVE_CARDS_POR_LINHA, normalizarCardsPorLinha, lerCardsPorLinha,
  salvarCardsPorLinha, colunasEfetivas, aplicarCardsPorLinha, criarControleCardsPorLinha,
} from '../assets/js/pages/inicio-densidade.js';

const shellCss = readFileSync(new URL('../assets/css/shell.css', import.meta.url), 'utf8');
const inicioCss = readFileSync(new URL('../assets/css/inicio.css', import.meta.url), 'utf8');

function storageFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

// ---------------------------------------------------------------------------
// (2) Registro de Controle
// ---------------------------------------------------------------------------

const LISTA = [
  { timestamp: '2026-10-06T10:27:00', origem: 'Automático', status: 'Erro', detalhe: '3 de 40 ativos falharam' },
  { timestamp: '2026-10-06T10:19:00', origem: 'Automático', status: 'Sucesso', detalhe: 'Renda Fixa: 12 títulos atualizados' },
  { timestamp: '2026-10-06T10:10:00', origem: 'Manual', status: 'Atenção', detalhe: '' },
];

function montarPopover() {
  const dom = new JSDOM('<!doctype html><body><div id="syncLog"></div></body>');
  const { document } = dom.window;
  const st = document.createElement('style');
  st.textContent = shellCss;
  document.head.appendChild(st);
  document.body.insertAdjacentHTML('afterbegin', '<svg style="display:none"><symbol id="ico-check"/><symbol id="ico-bad"/><symbol id="ico-warn"/></svg>');
  renderSyncLog(document, LISTA);
  return { dom, document };
}

test('Registro de Controle: linha = chip de status + (etapa · status) + (origem · data/hora), "i" só quando há detalhe', () => {
  const { document } = montarPopover();
  const linhas = [...document.querySelectorAll('.sync-log-row')];
  assert.equal(linhas.length, 3);
  const l0 = linhas[0];
  assert.ok(l0.querySelector('.status-ico.bad svg'));
  assert.match(l0.querySelector('.top-line-text').textContent, /Erro/);
  assert.match(l0.querySelector('.origin').textContent, /^Automático · 06\/10\/2026/);
  assert.ok(l0.querySelector('.sync-info-btn'), 'tem detalhe: botão "i"');
  assert.match(linhas[1].querySelector('.top-line-text').textContent, /^Renda Fixa · Sucesso/);
  assert.equal(linhas[2].querySelector('.sync-info-btn'), null, 'sem detalhe: sem "i"');
  // o "i" abre/fecha o detalhe sem mexer no resto
  const botao = l0.querySelector('.sync-info-btn');
  const detalhe = l0.querySelector('.detail');
  assert.equal(detalhe.hidden, true);
  botao.click();
  assert.equal(detalhe.hidden, false);
  assert.equal(botao.getAttribute('aria-expanded'), 'true');
});

test('Registro de Controle: o ícone de status é um chip pequeno (24px, svg 16px) e a lista não rola de lado', () => {
  const { dom, document } = montarPopover();
  const win = dom.window;
  const chip = document.querySelector('.sync-log-row .status-ico');
  const cs = win.getComputedStyle(chip);
  assert.equal(cs.width, '24px');
  assert.equal(cs.height, '24px');
  assert.equal(cs.flexShrink || cs.flex.split(' ')[1] || '0', '0');
  assert.equal(win.getComputedStyle(chip.querySelector('svg')).width, '16px');
  assert.equal(win.getComputedStyle(chip.querySelector('svg')).height, '16px');
  assert.match(shellCss, /\.sync-log\{[^}]*overflow-y:auto; overflow-x:hidden;/); // jsdom não decompõe overflow-x
  // cores semânticas por status (tokens, nunca hex)
  assert.match(shellCss, /\.sync-log-row \.status-ico\.good\{[^}]*var\(--good-soft\)[^}]*var\(--good-ink\)/);
  assert.match(shellCss, /\.sync-log-row \.status-ico\.warn\{[^}]*var\(--warn-soft\)[^}]*var\(--warn-ink\)/);
  assert.match(shellCss, /\.sync-log-row \.status-ico\.bad\{[^}]*var\(--bad-soft\)[^}]*var\(--bad-ink\)/);
});

// ---------------------------------------------------------------------------
// (3) Cards por linha
// ---------------------------------------------------------------------------

test('Cards por linha: opções 4..7, padrão 5, normalização', () => {
  assert.deepEqual(OPCOES_CARDS_POR_LINHA, [4, 5, 6, 7]);
  assert.equal(PADRAO_CARDS_POR_LINHA, 5);
  assert.equal(normalizarCardsPorLinha('6'), 6);
  assert.equal(normalizarCardsPorLinha(7), 7);
  assert.equal(normalizarCardsPorLinha(3), null);
  assert.equal(normalizarCardsPorLinha('abc'), null);
  assert.equal(normalizarCardsPorLinha(null), null);
});

test('Cards por linha: localStorage com try/catch e valor inválido cai no padrão', () => {
  const st = storageFalso();
  assert.equal(lerCardsPorLinha(st), 5);
  assert.equal(salvarCardsPorLinha(7, st), true);
  assert.equal(st._m.get(CHAVE_CARDS_POR_LINHA), '7');
  assert.equal(lerCardsPorLinha(st), 7);
  assert.equal(salvarCardsPorLinha(9, st), false);
  assert.equal(lerCardsPorLinha(storageFalso({ [CHAVE_CARDS_POR_LINHA]: '99' })), 5);
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.equal(lerCardsPorLinha(quebrado), 5);
  assert.equal(salvarCardsPorLinha(6, quebrado), false);
  assert.equal(lerCardsPorLinha(null), 5);
});

test('Cards por linha: limite automático (máx. 3 até 1024px, 2 até 600px; desktop respeita a escolha)', () => {
  assert.equal(colunasEfetivas(7, 1280), 7);
  assert.equal(colunasEfetivas(4, 1025), 4);
  assert.equal(colunasEfetivas(7, 1024), 3);
  assert.equal(colunasEfetivas(6, 820), 3);
  assert.equal(colunasEfetivas(7, 600), 2);
  assert.equal(colunasEfetivas(7, 390), 2);
  assert.equal(colunasEfetivas(4, 390), 2);
  assert.equal(colunasEfetivas(undefined, 1400), 5);
});

test('Cards por linha: o CSS repete os limites (var no desktop, 3 colunas em <=1024px, container query pra fonte/gráfico)', () => {
  assert.match(inicioCss, /\.mkt-faixa\{[^}]*grid-template-columns:repeat\(var\(--cards-por-linha,5\)/);
  assert.match(inicioCss, /@media \(max-width:1024\.98px\)\{ \.mkt-faixa\{ grid-template-columns:repeat\(3,/);
  assert.match(inicioCss, /@media \(max-width:1024\.98px\)\{ \.mkt-secao, \.favoritos-secao\{ --n-cards:3; \}/);
  assert.match(inicioCss, /\.favoritos-grid\{ grid-template-columns:repeat\(var\(--n-cards\),minmax\(0,1fr\)\)/);
  assert.match(inicioCss, /container: cards \/ inline-size/);
  assert.match(inicioCss, /@container cards \(max-width:\d+px\)/);
  assert.match(inicioCss, /\.cards-linha\{ display:none; \}/);
  // nada de fonte abaixo de 12px nas escalas por largura (A-64)
  [...inicioCss.matchAll(/clamp\((\d+)px,/g)].forEach((m) => assert.ok(Number(m[1]) >= 12, `clamp(${m[1]}px...)`));
});

test('Cards por linha: aplicar() grava a variável e o atributo; o controle marca/salva/avisa e anda com as setas', () => {
  const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>');
  const { document } = dom.window;
  const alvo = document.getElementById('c');
  assert.equal(aplicarCardsPorLinha(alvo, 6), 6);
  assert.equal(alvo.style.getPropertyValue('--cards-por-linha'), '6');
  assert.equal(alvo.getAttribute('data-cards-por-linha'), '6');
  assert.equal(aplicarCardsPorLinha(alvo, 'x'), 5);
  assert.equal(aplicarCardsPorLinha(null, 7), 7);

  const st = storageFalso();
  const avisos = [];
  const ctl = criarControleCardsPorLinha(document, { valor: 6, aoMudar: (n) => avisos.push(n), storage: st });
  document.body.appendChild(ctl);
  const botoes = [...ctl.querySelectorAll('[role=radio]')];
  assert.deepEqual(botoes.map((b) => b.textContent), ['4', '5', '6', '7']);
  assert.deepEqual(botoes.map((b) => b.getAttribute('aria-checked')), ['false', 'false', 'true', 'false']);
  assert.equal(ctl.querySelector('[role=radiogroup]').getAttribute('aria-labelledby'), 'cardsLinhaRotulo');
  botoes[3].click();
  assert.deepEqual(avisos, [7]);
  assert.equal(st._m.get(CHAVE_CARDS_POR_LINHA), '7');
  assert.equal(botoes[3].getAttribute('aria-checked'), 'true');
  assert.equal(botoes[2].getAttribute('aria-checked'), 'false');
  botoes[3].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.deepEqual(avisos, [7, 6]);
  assert.equal(botoes[2].getAttribute('aria-checked'), 'true');
});
