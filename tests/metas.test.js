// tests/metas.test.js
//
// 02/10/2026: tela Metas e Objetivos (assets/js/pages/metas.js) montada num
// DOM de verdade (JSDOM) com uma API falsa - estado vazio com sugestões de 1
// clique, cards, filtros, detalhe por #meta=, assistente de criação (tipo ->
// dados -> vínculos -> revisar -> salvar), sub-itens, simulador, arquivar - e o
// card de renda passiva que a Carteiras usa (metas-card.js). Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaMetas, TEMPLATE_METAS, parseNumeroBR, graficoProjecaoSvg } from '../assets/js/pages/metas.js';
import { cardMetaRendaPassiva, carregarMetasParaCard, formatMoeda } from '../assets/js/metas-card.js';
import { calcularMeta } from '../assets/js/pages/metas-calc.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE = {
  ok: true, hoje: '2026-10-02', arquivadas: [],
  ativos: [
    { id: 'AAAA11', ref: 'AAAA11', nome: 'AAAA11', classe: 'fiis', valorBRL: 10000 },
    { id: 'rf:Tesouro X|Banco Y@emergencial', ref: 'rf:Tesouro X|Banco Y', nome: 'Tesouro X', classe: 'rf', marca: 'emergencial', instituicao: 'Banco Y', valorBRL: 8000 },
  ],
  cambio: { EUR: { valor: 6, fonte: 'teste' }, USD: { valor: 5, fonte: 'teste' } },
  referencias: { reserva: { custoDeVida: 2000, meses: 6, sobra: 0.1 }, rendaPassiva: { media12m: 300, metaPlanilha: 1000 }, patrimonio: { rendimento: 0.08 } },
  proventos12m: { porTicker: { AAAA11: 1200 } },
};
const META_VIAGEM = {
  id: 'm1', tipo: 'viagemInternacional', nome: 'Viagem Teste', moeda: 'EUR', valorAlvo: 2000, dataAlvo: '2027-10', aporteMensal: 100, rendimentoAnual: 0,
  itens: [], vinculos: [{ tipo: 'ativo', id: 'AAAA11', modo: 'valor', valor: 3000 }], especificos: { destino: 'Lugar' }, status: 'ativa',
};
const META_RP = { id: 'm2', tipo: 'rendaPassiva', nome: 'Renda Teste', dataAlvo: '2036-10', especificos: { rendaMensal: 500, dyAnual: 0.1 }, vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'total' }], exibirNaCarteira: true, aporteMensal: 500, status: 'ativa' };

function montarDom(hash = '') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="metas"><main>${TEMPLATE_METAS}</main></body></html>`,
    { url: `https://exemplo.test/metas.html${hash}`, pretendToBeVisual: true });
  dom.window.confirm = () => true;
  dom.window.alert = () => {};
  return { doc: dom.window.document, w: dom.window };
}
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const digitar = (w, el, valor, tipo = 'input') => { el.value = valor; el.dispatchEvent(new w.Event(tipo, { bubbles: true })); };
const espera = () => new Promise((r) => setTimeout(r, 0));

async function montar({ metas = [], hash = '' } = {}) {
  const { doc, w } = montarDom(hash);
  let servidor = { ...clone(BASE), metas: clone(metas) };
  const salvas = [];
  const arquivadas = [];
  let n = 0;
  const pagina = await montarPaginaMetas('tk', {
    doc, win: w, usarCache: false,
    getMetasImpl: async () => clone(servidor),
    salvarMetaImpl: async (_t, meta) => {
      salvas.push(clone(meta));
      const m = { ...clone(meta), id: meta.id || `novo${++n}` };
      servidor = { ...servidor, metas: [...servidor.metas.filter((x) => x.id !== m.id), m] };
      return { ok: true, id: m.id, meta: m };
    },
    excluirMetaImpl: async (_t, id, { restaurar }) => { arquivadas.push([id, restaurar]); return { ok: true, id }; },
  });
  return { doc, w, pagina, salvas, arquivadas };
}

test('parseNumeroBR: formatos digitados', () => {
  assert.equal(parseNumeroBR('1.234,56'), 1234.56);
  assert.equal(parseNumeroBR('R$ 5.000'), 5000);
  assert.equal(parseNumeroBR('10,5'), 10.5);
  assert.equal(parseNumeroBR('2500.75'), 2500.75);
  assert.equal(parseNumeroBR(''), null);
});

test('estado vazio: sugestões com os números da planilha; 1 clique cria a meta e abre o detalhe', async () => {
  const { doc, w, salvas } = await montar();
  const tela = doc.getElementById('mtTela');
  assert.equal(tela.hidden, false);
  assert.match(tela.textContent, /Comece por uma meta/);
  const sug = [...tela.querySelectorAll('[data-sugestao]')];
  assert.ok(sug.length >= 3);
  const reserva = sug.find((b) => /Reserva de emergência/.test(b.textContent));
  assert.match(reserva.textContent, /13\.200/, '6 x R$ 2.000 x 1,1');
  clique(w, reserva);
  await espera();
  assert.equal(salvas.length, 1);
  assert.equal(salvas[0].tipo, 'reservaEmergencia');
  assert.deepEqual(salvas[0].vinculos, [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }]);
  assert.match(w.location.hash, /meta=novo1/);
  assert.match(tela.textContent, /Saldo ideal/);
  assert.match(tela.textContent, /Tesouro X|Renda Emergencial/);
});

test('lista: cards com progresso, falta, prazo e aporte; filtros por status e tipo; detalhe por clique e por #meta=', async () => {
  const { doc, w } = await montar({ metas: [META_VIAGEM, META_RP] });
  const tela = doc.getElementById('mtTela');
  const cards = tela.querySelectorAll('.mt-card');
  assert.equal(cards.length, 2);
  const viagem = [...cards].find((c) => /Viagem Teste/.test(c.textContent));
  assert.match(viagem.textContent, /3\.000/);
  assert.match(viagem.textContent, /12\.000/, '€ 2.000 x 6');
  assert.match(viagem.textContent, /out\/2027/);
  assert.match(viagem.textContent, /Atrasada/, 'aporte R$ 100 < R$ 750 necessários');
  clique(w, tela.querySelector('[data-filtro-status="atrasadas"]'));
  assert.equal(tela.querySelectorAll('.mt-card').length, 1);
  clique(w, tela.querySelector('[data-filtro-status="todas"]'));
  clique(w, tela.querySelector('[data-filtro-tipo="rendaPassiva"]'));
  assert.deepEqual([...tela.querySelectorAll('.mt-card strong')].map((s) => s.textContent), ['Renda Teste']);
  clique(w, tela.querySelector('[data-abrir="m2"]'));
  assert.match(tela.textContent, /Renda média \(12 meses\)/);
  assert.match(tela.textContent, /Patrimônio necessário|patrimônio/i);
  clique(w, tela.querySelector('[data-voltar]'));
  assert.equal(tela.querySelectorAll('.mt-card').length, 1, 'volta pra lista com o filtro');

  const direto = await montar({ metas: [META_VIAGEM], hash: '#meta=m1' });
  const t2 = direto.doc.getElementById('mtTela');
  assert.match(t2.textContent, /Viagem Teste/);
  assert.ok(t2.querySelector('#mtGrafico svg'), 'gráfico de evolução');
  assert.match(t2.textContent, /Lugar/);
});

test('detalhe: sub-itens salvam a meta; simulador nos 2 sentidos; arquivar', async () => {
  const { doc, w, salvas, arquivadas } = await montar({ metas: [META_VIAGEM], hash: '#meta=m1' });
  const tela = doc.getElementById('mtTela');
  clique(w, tela.querySelector('[data-item-add]'));
  const valor = tela.querySelector('[data-item-valor="0"]');
  digitar(w, valor, '500');
  const moeda = tela.querySelector('[data-item-moeda="0"]');
  digitar(w, moeda, 'EUR', 'change');
  await espera();
  const ultima = salvas[salvas.length - 1];
  assert.deepEqual([ultima.itens.length, ultima.itens[0].valor, ultima.itens[0].moeda], [1, 500, 'EUR']);

  const sim = doc.getElementById('mtSimulador');
  digitar(w, sim.querySelector('[data-sim="alvo"]'), '5.000');
  digitar(w, sim.querySelector('[data-sim="atual"]'), '0');
  digitar(w, sim.querySelector('[data-sim="rendimento"]'), '0');
  digitar(w, sim.querySelector('[data-sim="data"]'), '2027-10', 'change');
  assert.match(sim.textContent, /aporte R\$\s2\.500,00 por mês/, '€ 5.000 = R$ 30.000 em 12 meses');
  clique(w, sim.querySelector('[data-sim-modo="aporte"]'));
  digitar(w, sim.querySelector('[data-sim="aporte"]'), '3.000');
  assert.match(sim.textContent, /ago\/2027/, 'R$ 30.000 / R$ 3.000 = 10 meses');

  clique(w, tela.querySelector('[data-arquivar]'));
  await espera();
  assert.deepEqual(arquivadas, [['m1', false]]);
  assert.match(tela.textContent, /Arquivadas/);
});

test('assistente: tipo -> dados -> vínculos -> revisar -> criar', async () => {
  const { doc, w, salvas } = await montar({ metas: [META_RP] });
  clique(w, doc.getElementById('mtNova'));
  const dlg = doc.getElementById('mtDialogo');
  assert.equal(dlg.hidden, false);
  clique(w, dlg.querySelector('[data-tipo="acumulo"][data-categoria="equipamentos"]'));
  digitar(w, dlg.querySelector('[data-campo="nome"]'), 'Notebook');
  digitar(w, dlg.querySelector('[data-campo="moeda"]'), 'USD', 'change');
  digitar(w, dlg.querySelector('[data-campo="valorAlvo"]'), '1.000');
  digitar(w, dlg.querySelector('[data-campo="dataAlvo"]'), '2027-10', 'change');
  digitar(w, dlg.querySelector('[data-campo="rendimentoAnual"]'), '0');
  assert.match(dlg.querySelector('#mtPrevia').textContent, /5\.000/, 'US$ 1.000 x 5');
  clique(w, dlg.querySelector('[data-proximo]'));
  const marca = dlg.querySelector('[data-vinc-ativo="rf:Tesouro X|Banco Y@emergencial"]');
  marca.checked = true;
  marca.dispatchEvent(new w.Event('change', { bubbles: true }));
  digitar(w, dlg.querySelector('[data-vinc-modo="rf:Tesouro X|Banco Y@emergencial"]'), 'fracao', 'change');
  digitar(w, dlg.querySelector('[data-vinc-qtd="rf:Tesouro X|Banco Y@emergencial"]'), '25');
  assert.match(dlg.querySelector('.mt-v-total').textContent, /2\.000/);
  clique(w, dlg.querySelector('[data-proximo]'));
  assert.match(dlg.textContent, /Notebook/);
  assert.match(dlg.textContent, /40%/, 'R$ 2.000 de R$ 5.000');
  clique(w, dlg.querySelector('[data-salvar]'));
  await espera();
  assert.equal(salvas.length, 1);
  const m = salvas[0];
  assert.deepEqual([m.tipo, m.categoria, m.moeda, m.valorAlvo, m.dataAlvo], ['acumulo', 'equipamentos', 'USD', 1000, '2027-10']);
  assert.deepEqual(m.vinculos, [{ tipo: 'ativo', id: 'rf:Tesouro X|Banco Y@emergencial', nome: 'Tesouro X', modo: 'fracao', fracao: 0.25 }]);
  assert.equal(dlg.hidden, true);
  assert.match(doc.getElementById('mtTela').textContent, /Notebook/);
});

test('card de renda passiva (Carteiras): carregarMetasParaCard + cardMetaRendaPassiva com link pro detalhe', async () => {
  const { doc } = montarDom();
  const r = await carregarMetasParaCard('tk', { doc, getMetasImpl: async () => ({ ...clone(BASE), metas: [clone(META_VIAGEM), clone(META_RP)] }) });
  assert.equal(r.ok, true);
  assert.equal(r.rendaPassiva.id, 'm2');
  assert.ok(doc.querySelector('link[data-metas-css]'), 'injeta metas.css');
  const html = cardMetaRendaPassiva(r.rendaPassiva, { raizSite: 'https://exemplo.test/' });
  assert.match(html, /Renda Teste/);
  assert.match(html, /R\$\s100/, 'proventos 12m 1.200 / 12');
  assert.match(html, /20%/);
  assert.match(html, /href="https:\/\/exemplo\.test\/metas\.html#meta=m2"/);
  assert.equal(cardMetaRendaPassiva(null), '');
  assert.equal(formatMoeda(5000, 'EUR', { casas: 0 }).replace(/\s/g, ' '), '€ 5.000');
});

test('gráfico: SVG com as curvas e a linha do alvo', () => {
  const c = calcularMeta(META_VIAGEM, { ...BASE });
  const svg = graficoProjecaoSvg(c, { largura: 600, hoje: '2026-10-02' });
  assert.match(svg, /class="mt-g-ritmo"/);
  assert.match(svg, /class="mt-g-necessaria"/);
  assert.match(svg, /alvo R\$/);
});

test('router: a rota "metas" existe e o conteúdo vem do próprio TEMPLATE_METAS (sem template em pages.html)', async () => {
  const { ROUTES, parsePagesPartial } = await import('../assets/js/router.js');
  const rota = ROUTES.find((r) => r.key === 'metas');
  assert.equal(rota.href, 'metas.html');
  const { doc } = montarDom();
  const templates = parsePagesPartial('<template id="outro"></template>', doc, [rota]);
  const div = doc.createElement('div');
  div.appendChild(templates.metas.cloneNode(true));
  assert.ok(div.querySelector('#mtTela'));
  assert.ok(div.querySelector('#mtNova'));
});
