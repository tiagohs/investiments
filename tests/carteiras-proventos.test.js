// tests/carteiras-proventos.test.js - 25/09/2026: proventos nas Carteiras
// (assets/js/pages/carteiras-proventos.js) com dados de exemplo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { proventosMesE12Meses, statProventosHero, secaoProventosCarteiraHtml, renderProventosCarteira } from '../assets/js/pages/carteiras-proventos.js';

const ponto = (data, o = {}) => ({ data, proventosAcoes: 0, proventosFiis: 0, proventosAcoesEua: 0, cambioUsd: 5, ...o });
const HIST = [
  ponto('2025-09-30', { proventosFiis: 7 }), // fora dos 12 meses (out/25 a set/26)
  ponto('2025-10-01', { proventosFiis: 8 }),
  ponto('2026-01-10', { proventosAcoes: 20 }),
  ponto('2026-08-20', { proventosAcoesEua: 5 }),
  ponto('2026-09-05', { proventosAcoes: 4 }),
  ponto('2026-09-15', { proventosFiis: 10 }),
  ponto('2026-09-24'),
];

test('proventosMesE12Meses(): mês do último ponto, 12 meses terminando nele e desde o início; dólar = reais ÷ câmbio do dia', () => {
  assert.deepEqual(proventosMesE12Meses(HIST, ['proventosAcoes', 'proventosFiis', 'proventosAcoesEua']), { mes: 14, doze: 47, desdeInicio: 54, mesAtual: '2026-09', inicio12: '2025-10' });
  assert.equal(proventosMesE12Meses(HIST, ['proventosFiis']).doze, 18);
  assert.equal(proventosMesE12Meses(HIST, ['proventosAcoesEuaUsd']).doze, 1);
  assert.equal(proventosMesE12Meses([], ['proventosAcoes']), null);
  assert.equal(proventosMesE12Meses(null, ['proventosAcoes']), null);
});

test('statProventosHero(): valor do mês, "em 12 meses" embaixo e o total desde o início no "i"', () => {
  const fmt = (v) => `R$ ${v.toFixed(2)}`;
  const s = statProventosHero(HIST, ['proventosAcoes'], { formatar: fmt, botaoInfoHtml: (t) => `<i data-t="${t}"></i>` });
  assert.equal(s.label, 'Proventos no mês');
  assert.match(s.valor, /^R\$ 4\.00/);
  assert.match(s.valor, /R\$ 24\.00 em 12 meses/);
  assert.match(s.valor, /Desde o início: R\$ 24\.00/);
  assert.equal(statProventosHero([], ['proventosAcoes'], { formatar: fmt }), null);
});

test('renderProventosCarteira(): só a classe da página; Visão geral = todas; some quando não há nada', () => {
  const dom = new JSDOM(`<!doctype html><body>${secaoProventosCarteiraHtml('p')}</body>`, { url: 'https://exemplo.test/carteiras/index.html' });
  const doc = dom.window.document;
  const secao = doc.getElementById('p');
  const item = (ticker, classe, valor, dataPagamento = '2026-09-28') => ({ ticker, classe, tipo: 'Dividendo', dataCom: '', dataPagamento, quantidade: 1, valorPorCota: valor, valor, jaLancado: false });
  const dados = {
    aReceber: [item('AAAA3', 'acoes', 3), item('BBBB11', 'fiis', 5)],
    recebidosNoMes: [item('CCCC', 'acoesEua', 2, '2026-09-02')],
    pagosNaoLancados: [],
  };
  const hoje = new Date(2026, 8, 24);
  renderProventosCarteira(doc, secao, dados, { classes: ['acoes'], hoje });
  assert.equal(secao.hidden, false);
  assert.match(secao.textContent, /AAAA3/);
  assert.doesNotMatch(secao.textContent, /BBBB11|CCCC/);
  renderProventosCarteira(doc, secao, dados, { hoje });
  assert.match(secao.textContent, /AAAA3/);
  assert.match(secao.textContent, /BBBB11/);
  assert.match(secao.textContent, /CCCC/);
  renderProventosCarteira(doc, secao, dados, { classes: ['rendaFixa'], hoje });
  assert.equal(secao.hidden, true);
  assert.match(secao.querySelector('.cc-proventos-link').getAttribute('href'), /proventos\/index\.html$/);
});
