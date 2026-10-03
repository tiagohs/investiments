// tests/organizacao-simulador.test.js
//
// 02/10/2026: seção "Amortizar ou investir?" montada num DOM de verdade
// (jsdom) - organizacao-simulador.js. Contexto inventado no formato do
// contextoPatrimonio (aba Patrimônio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function memoria() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }

const CTX = {
  d: { hoje: '2025-03-10', cdi: 0.11, metas: { salarioLiquido: 8340, reservaMeta: 30000 }, investimentos: { reserva: 35000 }, despesas: { totalComFolga: 5000 } },
  cfg: {
    financiamento: { saldo: 210000, dataSaldo: '2025-01-05', taxaAnual: 0.09, amortizacao: 1000, prazoRestante: 210, seguroTaxas: 70, indexador: 'TR' },
    fies: { saldo: 30000, dataSaldo: '2025-01-05', parcela: 400, taxaMensal: 0.0025, fim: '2032-12' },
  },
  b: { liquido: 123456 },
  fgts: null,
};

async function montar({ ctx = CTX, storage = memoria() } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="s"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const { montarSimuladorDividas } = await import('../assets/js/pages/organizacao-simulador.js');
  const el = doc.getElementById('s');
  const sec = montarSimuladorDividas(el, { ctx, doc, storage });
  return { dom, doc, w: dom.window, el, sec, storage };
}
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const mudar = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };

test('abre já simulado com as dívidas de hoje: cards, veredito, gráficos, tabela, vídeo e referências', async () => {
  const { el, sec, doc } = await montar();
  assert.equal(el.querySelector('#sdValor').value, '800'); // 10% do salário líquido
  const cards = el.querySelectorAll('.sd-card');
  assert.equal(cards.length, 2);
  assert.match(txt(cards[0]), /Amortizar o apê/);
  assert.match(txt(cards[0]), /Apê quita/);
  assert.match(txt(cards[0]), /Juros \+ seguro economizados/);
  assert.match(txt(cards[1]), /Investir em 100% do CDI/);
  assert.match(txt(cards[1]), /Renda passiva/);
  assert.equal(el.querySelectorAll('.sd-card.ganha').length, 1);
  assert.match(txt(el.querySelector('#sdVer')), /Veredito/);
  assert.ok(el.querySelector('#sdGPat svg path.sd-linha'));
  assert.equal(el.querySelectorAll('#sdGPat .sd-linha').length, 4);
  assert.ok(el.querySelector('#sdGDif svg rect'));
  assert.ok(el.querySelector('#sdGDiv svg'));
  assert.equal(el.querySelectorAll('#sdTabela tbody tr').length, 11);
  assert.equal(el.querySelectorAll('#sdPerfis [data-sd-perfil]').length, 4);
  assert.ok(el.querySelectorAll('.sd-estrategias li').length >= 6);
  assert.ok([...el.querySelectorAll('.sd-refs a')].every((a) => /^https:/.test(a.href)));
  assert.ok(doc.head.querySelector('link[data-sd-css]'), 'liga o simulador.css sozinho');
  assert.equal(sec.simulacao.params.valor, 800);
});

test('trocar pra "fim do ano" mantém o total do ano; prazo/parcela, perfil e horizonte recalculam; escolhas ficam salvas', async () => {
  const { el, w, sec, storage } = await montar();
  const pat0 = sec.simulacao.resumo.patrimonio.amortizar;
  clique(w, el.querySelector('[data-sd-seg="frequencia"] [data-v="anual"]'));
  assert.equal(sec.params.frequencia, 'anual');
  assert.equal(el.querySelector('#sdValor').value, '9.600');
  assert.notEqual(sec.simulacao.resumo.patrimonio.amortizar, pat0);
  clique(w, el.querySelector('[data-sd-seg="modo"] [data-v="parcela"]'));
  assert.equal(sec.params.modo, 'parcela');
  assert.match(txt(el.querySelector('.sd-card.amort')), /Parcelas no 1º ano/);
  clique(w, el.querySelector('[data-sd-perfil="fii"]'));
  assert.equal(sec.params.perfil, 'fii');
  assert.match(txt(el.querySelector('.sd-card.inv')), /Fundos imobiliários/);
  assert.match(txt(el.querySelector('.sd-card.inv')), /isenta de IR/);
  mudar(w, el.querySelector('#sdHorizonte'), '20');
  assert.equal(el.querySelectorAll('#sdTabela tbody tr').length, 21);
  mudar(w, el.querySelector('#sdValor'), '1.500');
  assert.equal(sec.params.valor, 1500);
  const salvo = JSON.parse(storage.getItem('simuladorDividas:v1'));
  assert.equal(salvo.frequencia, 'anual');
  assert.equal(salvo.perfil, 'fii');
  assert.equal(salvo.horizonteAnos, 20);
  // remonta com o que ficou salvo
  const outra = await montar({ storage });
  assert.equal(outra.sec.params.perfil, 'fii');
  assert.equal(outra.sec.params.valor, 1500);
  // voltar ao padrão
  clique(outra.w, outra.el.querySelector('[data-sd-acao="padrao"]'));
  assert.equal(outra.sec.params.perfil, 'cdi100');
  assert.equal(storage.getItem('simuladorDividas:v1'), null);
});

test('premissas editáveis e FIES como alvo; balão do gráfico por ano', async () => {
  const { el, w, sec } = await montar();
  mudar(w, el.querySelector('#sdCdi'), '15,00');
  assert.equal(sec.params.taxas.cdi, 0.15);
  assert.match(txt(el.querySelector('.sd-prem summary')), /CDI 15,00%/);
  clique(w, el.querySelector('[data-sd-seg="alvo"] [data-v="fies"]'));
  assert.match(txt(el.querySelector('.sd-card.amort')), /Amortizar o FIES/);
  assert.match(txt(el.querySelector('#sdVer')), /FIES: não antecipe/);
  const hit = el.querySelector('#sdGPat .sd-hit[data-i="3"]');
  hit.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
  const tt = el.querySelector('#sdGPat .pt-tt');
  assert.equal(tt.hidden, false);
  assert.match(txt(tt), /Fim de 2028/);
  assert.match(txt(tt), /Só as parcelas/);
  assert.match(txt(tt), /Investir − amortizar/);
});

test('sem dívida cadastrada: avisa e não quebra', async () => {
  const { el } = await montar({ ctx: { d: { hoje: '2025-03-10' }, cfg: {}, b: { liquido: 1000 } } });
  assert.match(txt(el.querySelector('#sdCards')), /Cadastre o financiamento ou o FIES/);
  assert.match(txt(el.querySelector('#sdVer')), /Sem dívida/);
});
