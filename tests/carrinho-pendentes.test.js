// 06/10/2026: aporte "Aguardando valores finais" visível no header de todas as telas (dados inventados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resumoPendentes, publicarAportesPendentes, setupCarrinhoHeader, CHAVE_PENDENTES } from '../assets/js/carrinho-header.js';

const APORTES = [
  { id: 'a1', data: '2026-10-05', status: 'aguardando', itens: [{ moeda: 'BRL', valorPlanejado: 500, valorFinal: 0 }, { moeda: 'BRL', valorPlanejado: 300, valorFinal: 310 }] },
  { id: 'a2', data: '2026-10-01', status: 'concluido', itens: [{ moeda: 'BRL', valorPlanejado: 100 }] },
];

function memoria() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }
function montarDom() {
  const dom = new JSDOM(`<body data-section="inicio"><nav id="mainnav"><a class="nav-link" data-section="transacoes" href="https://x.test/transacoes/">T</a></nav>
    <div id="carrinhoWrap" hidden><button id="carrinhoBtn"></button><span id="carrinhoBadge"></span><span id="carrinhoTotal"></span><div id="carrinhoPanelConteudo"></div></div><div id="carrinhoAviso" hidden></div></body>`, { url: 'https://x.test/' });
  return dom;
}

test('resumoPendentes: só os aguardando; usa o valor final quando informado', () => {
  assert.deepEqual(resumoPendentes(APORTES), [{ id: 'a1', data: '2026-10-05', n: 2, totalBrl: 810, totalUsd: 0 }]);
});

test('header mostra o aporte aguardando mesmo sem carrinho e busca no servidor com o login', async () => {
  const dom = montarDom();
  const storage = memoria();
  let chamadas = 0;
  const h = setupCarrinhoHeader(dom.window.document, { win: dom.window, storage, setIntervalImpl: null,
    getAportesPendentesImpl: async () => { chamadas++; return { ok: true, aportes: APORTES }; } });
  const wrap = dom.window.document.getElementById('carrinhoWrap');
  assert.equal(wrap.hidden, true, 'sem nada, escondido');
  h.definirToken('tok');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chamadas, 1);
  assert.equal(wrap.hidden, false);
  assert.equal(dom.window.document.getElementById('carrinhoBadge').textContent, '1');
  const html = dom.window.document.getElementById('carrinhoPanelConteudo').innerHTML;
  assert.match(html, /Aguardando valores finais/);
  assert.match(html, /Aporte de 05\/10/);
  assert.match(html, /transacoes\/#andamento/);
  // a tela Transações publica que concluiu: o aviso some
  publicarAportesPendentes([{ ...APORTES[0], status: 'concluido' }], { win: dom.window, storage });
  assert.equal(wrap.hidden, true);
  assert.ok(JSON.parse(storage.getItem(CHAVE_PENDENTES)).lista.length === 0);
});
