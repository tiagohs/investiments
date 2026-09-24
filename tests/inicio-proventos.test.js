// tests/inicio-proventos.test.js - 24/09/2026: área "Proventos do mês" da
// Início (assets/js/pages/inicio-proventos.js), com dados de exemplo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderProventosAnunciados, resumirProventosAReceber, resumirProventosDoMes, diaMesDeChave } from '../assets/js/pages/inicio-proventos.js';

function secaoDom() {
  const dom = new JSDOM('<!doctype html><section id="s" hidden><div class="prov-corpo"></div></section>');
  return { dom, doc: dom.window.document, secao: dom.window.document.getElementById('s') };
}
const HOJE = new Date(2026, 8, 24); // 24/09/2026
const item = (o) => ({ ticker: 'ABCD11', classe: 'fiis', tipo: 'Rendimento', dataCom: '2026-09-18', dataPagamento: '2026-09-25', valorPorCota: 0.9, quantidade: 10, valor: 9, jaLancado: false, ...o });

test('diaMesDeChave(): "yyyy-MM-dd" vira "dd/MM" sem virar o dia por fuso', () => {
  assert.equal(diaMesDeChave('2026-09-01'), '01/09');
  assert.equal(diaMesDeChave(''), '—');
});

test('resumirProventosDoMes(): recebido no mês, a receber no mês e depois (sem data definida conta como depois)', () => {
  const r = resumirProventosDoMes({
    recebidosNoMes: [item({ dataPagamento: '2026-09-10', valor: 3.3 }), item({ dataPagamento: '2026-09-02', valor: 1.2 })],
    aReceber: [item({ valor: 9 }), item({ dataPagamento: '2026-09-30', valor: 1.5 }), item({ dataPagamento: '2026-10-15', valor: 4 }), item({ dataPagamento: '', valor: 2 })],
  }, { hoje: HOJE });
  assert.deepEqual(r, { recebido: 4.5, aReceberEsteMes: 10.5, aReceberDepois: 6 });
  assert.deepEqual(resumirProventosAReceber([item({ valor: 9 })], { hoje: HOJE }), { esteMes: 9, depois: 0 });
});

test('renderProventosAnunciados(): resumo do mês, a receber (com "a definir" e selo lançado), recebidos do mês com "ver todos", aviso dos não lançados; some quando vazio', () => {
  const { dom, doc, secao } = secaoDom();
  const recebidos = Array.from({ length: 8 }, (_, i) => item({ ticker: `R${i}AA11`, dataPagamento: `2026-09-${String(10 + i).padStart(2, '0')}`, valor: 1 }));
  renderProventosAnunciados(doc, secao, {
    aReceber: [item({}), item({ ticker: 'EFGH3', classe: 'acoes', tipo: 'Dividendo', dataCom: '', dataPagamento: '', valor: 12, quantidade: 12, valorPorCota: 1, jaLancado: true })],
    recebidosNoMes: recebidos,
    pagosNaoLancados: [item({ ticker: 'IJKL11', dataPagamento: '2026-09-10', valor: 5 })],
  }, { hoje: HOJE });
  assert.equal(secao.hidden, false);
  const txt = () => secao.textContent.replace(/\s+/g, ' ');
  assert.match(txt(), /Recebido em setembro R\$\s*8,00/);
  assert.match(txt(), /A receber em setembro R\$\s*9,00/);
  assert.match(txt(), /Depois R\$\s*12,00/);
  assert.match(txt(), /ABCD11 paga 25\/09 · data com 18\/09 · Rendimento/);
  assert.match(txt(), /EFGH3lançado pagamento a definir · Dividendo/);
  assert.match(txt(), /10 × R\$\s*0,90/);
  assert.equal(secao.querySelectorAll('.prov-selo').length, 1);
  // recebidos: 6 visíveis (mais recentes primeiro) + botão
  assert.match(txt(), /R7AA11 pago 17\/09/);
  assert.ok(!/R0AA11/.test(txt()));
  secao.querySelector('.prov-mais').dispatchEvent(new dom.window.Event('click'));
  assert.match(txt(), /R0AA11 pago 10\/09/);
  assert.match(txt(), /IJKL11 pago 10\/09 · ainda não lançado/);

  renderProventosAnunciados(doc, secao, { aReceber: [], recebidosNoMes: [], pagosNaoLancados: [] }, { hoje: HOJE });
  assert.equal(secao.hidden, true);
  renderProventosAnunciados(doc, secao, undefined, { hoje: HOJE });
  assert.equal(secao.hidden, true);
});
