// tests/carteiras-proventos-meses.test.js - 06/10/2026: navegação por meses anteriores na lista de proventos das Carteiras
// (carteiras-proventos.js). Dados 100% inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  secaoProventosCarteiraHtml, renderProventosCarteira, definirFonteProventos, reiniciarNavegacaoProventos_, recebidosDoMes, mesesNavegaveis, nomeMesLongo,
} from '../assets/js/pages/carteiras-proventos.js';

const rec = (data, ticker, classe, valor) => ({ data, dataCom: '', ticker, classe, tipo: 'Rendimento', quantidade: 10, valorPorCota: valor / 10, liquido: valor, moeda: 'BRL', cambio: 1, valor });
const HIST = { ok: true, hoje: '2026-09-24', aReceber: [], pagosNaoLancados: [], recebidos: [
  rec('2026-08-10', 'AAAA11', 'fiis', 12), rec('2026-08-20', 'BBBB3', 'acoes', 30), rec('2026-06-05', 'AAAA11', 'fiis', 8), rec('2024-12-01', 'CCCC3', 'acoes', 5),
] };
const aguardar = () => new Promise((r) => setTimeout(r, 5));

test('recebidosDoMes / mesesNavegaveis / nomeMesLongo: filtram por mês e classe; lista vai do mês atual até o mais antigo', () => {
  assert.deepEqual(recebidosDoMes(HIST, '2026-08', ['fiis']).map((p) => p.ticker), ['AAAA11']);
  assert.deepEqual(recebidosDoMes(HIST, '2026-08').map((p) => p.ticker), ['BBBB3', 'AAAA11']); // mais recente primeiro
  const m = mesesNavegaveis(HIST, '2026-09', ['acoes']);
  assert.equal(m[0], '2026-09');
  assert.equal(m[m.length - 1], '2024-12'); // mais antigo que a janela de 12 meses estende a lista
  assert.equal(mesesNavegaveis(null, '2026-09').length, 12);
  assert.equal(nomeMesLongo('2026-03'), 'Março de 2026');
});

test('navegação: ‹ pede a ação de proventos 1x, mostra o mês anterior da classe; › e "Mês atual" voltam; sem dado no mês atual a seção segue visível', async () => {
  reiniciarNavegacaoProventos_();
  let chamadas = 0;
  definirFonteProventos('tok', async (t) => { chamadas++; assert.equal(t, 'tok'); return HIST; });
  const dom = new JSDOM(`<!doctype html><body>${secaoProventosCarteiraHtml('p', { navegacao: true })}</body>`, { url: 'https://exemplo.test/carteiras/index.html' });
  const doc = dom.window.document;
  const secao = doc.getElementById('p');
  const hoje = new Date('2026-09-24T15:00:00Z');
  renderProventosCarteira(doc, secao, { aReceber: [], recebidosNoMes: [], pagosNaoLancados: [] }, { classes: ['fiis'], hoje });
  assert.equal(secao.hidden, false);
  assert.match(secao.textContent, /Nenhum provento neste mês/);
  const q = (k) => secao.querySelector(`[data-prov-nav="${k}"]`);
  assert.equal(q('prox').disabled, true);
  assert.equal(q('atual').hidden, true);
  assert.equal(chamadas, 0);

  q('ant').click(); // agosto/2026 (setembro é o mês atual)
  assert.equal(q('atual').hidden, false);
  await aguardar();
  assert.match(secao.textContent, /AAAA11/);
  assert.doesNotMatch(secao.textContent, /BBBB3/); // outra classe
  assert.match(secao.textContent, /R\$\s*12,00/);
  assert.equal(chamadas, 1);
  assert.equal(q('mes').value, '2026-08');

  q('mes').value = '2026-07'; q('mes').dispatchEvent(new dom.window.Event('change'));
  await aguardar();
  assert.match(secao.textContent, /Nenhum provento recebido em Julho de 2026/);
  q('mes').value = '2026-06'; q('mes').dispatchEvent(new dom.window.Event('change'));
  await aguardar();
  assert.match(secao.textContent, /AAAA11/);
  assert.match(secao.textContent, /R\$\s*8,00/);
  q('atual').click();
  await aguardar();
  assert.match(secao.textContent, /Nenhum provento neste mês/);
  assert.equal(q('prox').disabled, true);
});

test('navegação: falha ao buscar o histórico mostra aviso com "Tentar de novo" (e tenta de novo)', async () => {
  reiniciarNavegacaoProventos_();
  let ok = false;
  definirFonteProventos('tok', async () => (ok ? HIST : { ok: false, erro: 'x' }));
  const dom = new JSDOM(`<!doctype html><body>${secaoProventosCarteiraHtml('p', { navegacao: true })}</body>`, { url: 'https://exemplo.test/carteiras/index.html' });
  const doc = dom.window.document; const secao = doc.getElementById('p');
  renderProventosCarteira(doc, secao, {}, { classes: ['fiis'], hoje: new Date('2026-09-24T15:00:00Z') });
  secao.querySelector('[data-prov-nav="ant"]').click();
  await aguardar();
  assert.match(secao.textContent, /Não deu pra carregar o histórico/);
  ok = true;
  secao.querySelector('[data-prov-tentar]').click();
  await aguardar();
  assert.match(secao.textContent, /AAAA11/);
});
