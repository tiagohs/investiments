// tests/inicio-proventos.test.js - 24/09/2026: área "Proventos a receber"
// da Início (assets/js/pages/inicio-proventos.js), com dados de exemplo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderProventosAnunciados, resumirProventosAReceber, diaMesDeChave } from '../assets/js/pages/inicio-proventos.js';

function secaoDom() {
  const dom = new JSDOM('<!doctype html><section id="s" hidden><div class="prov-corpo"></div></section>');
  return { doc: dom.window.document, secao: dom.window.document.getElementById('s') };
}
const HOJE = new Date(2026, 8, 24); // 24/09/2026
const item = (o) => ({ ticker: 'ABCD11', tipo: 'Rendimento', dataCom: '2026-09-18', dataPagamento: '2026-09-25', valorPorCota: 0.9, quantidade: 10, valor: 9, isento: 'Sim', jaLancado: false, ...o });

test('diaMesDeChave(): "yyyy-MM-dd" vira "dd/MM" sem virar o dia por fuso', () => {
  assert.equal(diaMesDeChave('2026-09-01'), '01/09');
  assert.equal(diaMesDeChave(''), '—');
});

test('resumirProventosAReceber(): soma o que paga este mês e o que paga depois', () => {
  const r = resumirProventosAReceber([item({ valor: 9 }), item({ dataPagamento: '2026-09-30', valor: 1.5 }), item({ dataPagamento: '2026-10-15', valor: 4 })], { hoje: HOJE });
  assert.deepEqual(r, { esteMes: 10.5, depois: 4 });
});

test('renderProventosAnunciados(): lista a receber com quantidade × valor, selo "lançado", aviso dos pagos não lançados; some quando vazio', () => {
  const { doc, secao } = secaoDom();
  renderProventosAnunciados(doc, secao, {
    aReceber: [item({}), item({ ticker: 'EFGH11', dataPagamento: '2026-10-14', valor: 12, quantidade: 12, valorPorCota: 1, jaLancado: true })],
    pagosNaoLancados: [item({ ticker: 'IJKL11', dataPagamento: '2026-09-10', valor: 5 })],
  }, { hoje: HOJE });
  assert.equal(secao.hidden, false);
  const txt = secao.textContent.replace(/\s+/g, ' ');
  assert.match(txt, /Este mês R\$\s*9,00/);
  assert.match(txt, /Depois R\$\s*12,00/);
  assert.match(txt, /ABCD11 paga 25\/09 · data com 18\/09/);
  assert.match(txt, /10 cotas × R\$\s*0,90/);
  assert.equal(secao.querySelectorAll('.prov-selo').length, 1);
  assert.match(txt, /ainda não lançados na aba Proventos: IJKL11 pago em 10\/09/);

  renderProventosAnunciados(doc, secao, { aReceber: [], pagosNaoLancados: [] }, { hoje: HOJE });
  assert.equal(secao.hidden, true);
  renderProventosAnunciados(doc, secao, undefined, { hoje: HOJE });
  assert.equal(secao.hidden, true);
});
