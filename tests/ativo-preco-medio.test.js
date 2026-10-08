// tests/ativo-preco-medio.test.js - 08/10/2026: "Para ficar no lucro" na tela do ativo (assets/js/pages/ativo-preco-medio.js):
// resumo no card "Cotação × preço-teto", tabela compra × lucro, gráfico e simulador (cotas <-> preço médio desejado).
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function montarDom() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="carteiras">
    <header id="ativoCabecalho"></header>
    <div id="ativoLoading"></div><div id="ativoErro" hidden></div><div id="ativoConteudo" hidden></div></body></html>`,
  { url: 'https://exemplo.test/repo/ativo/index.html?ref=TEST3', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.localStorage = w.localStorage;
  return { doc: w.document, w };
}
const txt = (el) => {
  const partes = [];
  const tw = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};

function resposta({ precoMedio = 18, precoAtual = 13.5, moeda = 'BRL', classe = 'acoes', ticker = 'TEST3' } = {}) {
  return {
    ok: true, hoje: '2026-03-10', tipo: 'rv', ticker, classe, moeda,
    ativo: { ticker, nome: 'Teste S.A.', grupo: 'Setor X', quantidade: 20, precoAtual, precoMedio, precoTeto: 15, vies: 'Comprar',
      totalComprado: 20 * precoMedio, totalAtualizado: 20 * precoAtual, proventosTotais: 0, variacaoDia: 0.01 },
    serie: [
      { data: '2026-01-05', cotas: 20, preco: 17, valor: 340, valorBrl: 340 },
      { data: '2026-02-02', cotas: 20, preco: 15, valor: 300, valorBrl: 300 },
      { data: '2026-03-09', cotas: 20, preco: 13.5, valor: 270, valorBrl: 270 },
    ],
    transacoes: [{ data: '2026-01-05', tipo: 'Compra', preco: precoMedio, quantidade: 20, taxa: 0, total: 20 * precoMedio, totalBrl: 20 * precoMedio, lucro: null }],
    proventos: [], aReceber: [], pagosNaoLancados: [], faixa52: null,
    indices: [{ data: '2026-01-02', cdi: 100, ipca: 50, ibovespa: 1000, patrimonio: 1000 }, { data: '2026-03-09', cdi: 102, ipca: 51, ibovespa: 1030, patrimonio: 1350 }],
  };
}

async function montar(r) {
  const { doc, w } = montarDom();
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  await montarPaginaAtivo('tk', {
    doc,
    getAtivoImpl: async () => structuredClone(r),
    getNoticiasImpl: async () => ({ ok: true, noticias: [] }),
    getTesesImpl: async () => ({ ok: true, configurado: false, teses: [], resumos: [] }),
    getIntradiaImpl: async (t, chaves) => ({ ok: true, resultado: Object.fromEntries(chaves.map((c) => [c, null])) }),
    getMetasImpl: async () => ({ ok: false }),
    carregarEstaticosImpl: async () => ({}),
    agora: () => new Date('2026-03-10T15:00:00Z'),
  });
  await new Promise((res) => setTimeout(res, 0));
  return { doc, w };
}

test('no lucro (cotação acima do preço médio): nem resumo nem seção', async () => {
  const { doc } = await montar(resposta({ precoMedio: 11 }));
  assert.equal(doc.getElementById('at-pm'), null);
  assert.equal(doc.querySelector('#at-faixa .at-pm-resumo'), null);
});

test('no prejuízo: resumo no card de cotação + seção com tabela, gráfico e simulador', async () => {
  const { doc, w } = await montar(resposta());
  // 20 cotas a 18, cotação 13,50: precisa subir 33,3%; compra hoje -> lucro com +10% (14,85): 20 × 3,15 / 1,35 = 46,7 -> 47
  const resumo = txt(doc.querySelector('#at-faixa .at-pm-resumo'));
  assert.match(resumo, /a cota precisa subir 33,3% \(até R\$\s18,00\)/);
  assert.match(resumo, /compre 47 cotas hoje \(R\$\s635\)/);
  assert.match(resumo, /lucro com a cota a R\$\s14,85 \(\+10%\)/);
  const sec = doc.getElementById('at-pm');
  assert.ok(sec, 'seção no corpo');
  assert.ok(doc.querySelector('.at-col-principal #at-pm'), 'fica na coluna principal');
  const linhas = [...sec.querySelectorAll('.at-pm-tabela tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => txt(td)));
  assert.equal(linhas.length, 3);
  assert.match(linhas[2][0], /não chega/, 'comprar hoje nunca põe no lucro com a cota parada');
  assert.match(linhas[2][1], /^47 cotas R\$\s635/);
  assert.ok(sec.querySelector('.at-pm-cel.destaque'), 'a compra de hoje com +10% em destaque');
  assert.ok(sec.querySelector('#atPmGrafico svg'), 'gráfico desenhado');
  // simulador: começa na compra de hoje com 47 cotas
  const preco = doc.getElementById('atPmPreco'); const cotas = doc.getElementById('atPmCotas'); const alvo = doc.getElementById('atPmAlvo');
  assert.equal(preco.value, '13,50');
  assert.equal(cotas.value, '47');
  assert.match(txt(doc.getElementById('atPmResultado')), /Novo preço médio R\$\s14,84/);
  // pede o PM desejado: 12 cotas a 12,15 (10% mais barata) levam a 16? 20×(18−16)/(16−12,15) = 10,4 -> 11
  doc.querySelector('[data-pm-preco="12.15"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(preco.value, '12,15');
  alvo.value = '16';
  alvo.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(cotas.value, '11');
  assert.match(txt(doc.getElementById('atPmResultado')), /Aporte R\$\s134/);
  // alvo abaixo do preço da compra: explica por que não dá
  alvo.value = '12';
  alvo.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.match(txt(doc.getElementById('atPmResultado')), /nunca chega a R\$\s12,00/);
  assert.equal(cotas.value, '');
  // cotas grandes o bastante: já no lucro hoje
  cotas.value = '200';
  cotas.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.match(txt(doc.getElementById('atPmResultado')), /já estaria no lucro/);
});

test('ação dos EUA: valores em dólar e o aporte com o equivalente em reais', async () => {
  const r = resposta({ moeda: 'USD', classe: 'acoesEua', ticker: 'TSTX' });
  r.cambio = 5;
  r.serie = r.serie.map((p) => ({ ...p, cambio: 5, valorBrl: p.valor * 5 }));
  const { doc } = await montar(r);
  assert.match(txt(doc.querySelector('#at-faixa .at-pm-resumo')), /US\$\s18,00/);
  assert.match(txt(doc.querySelector('.at-pm-tabela')), /US\$\s13,50/);
});
