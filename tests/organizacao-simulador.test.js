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

async function montar({ ctx = CTX, storage = memoria(), aoMudar = null } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="s"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const { montarSimuladorDividas } = await import('../assets/js/pages/organizacao-simulador.js');
  const el = doc.getElementById('s');
  const sec = montarSimuladorDividas(el, { ctx, doc, storage, aoMudar });
  return { dom, doc, w: dom.window, el, sec, storage };
}
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const mudar = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };

test('abre já simulado com as dívidas de hoje: cards, veredito, gráficos, tabela, vídeo e referências', async () => {
  const { el, sec, doc } = await montar();
  // 03/10/2026: o mínimo que tira 2 parcelas por mês do apê (2 × R$ 1.000 corrigidos pela TR, pra cima de 10 em 10)
  assert.equal(el.querySelector('#sdValor').value, '2.010');
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
  assert.equal(sec.simulacao.params.valor, 2010);
  assert.equal(sec.params.valorManual, false);
});

test('trocar pra "fim do ano" mantém o total do ano; prazo/parcela, perfil e horizonte recalculam; escolhas ficam salvas', async () => {
  const { el, w, sec, storage } = await montar();
  const pat0 = sec.simulacao.resumo.patrimonio.amortizar;
  clique(w, el.querySelector('[data-sd-seg="frequencia"] [data-v="anual"]'));
  assert.equal(sec.params.frequencia, 'anual');
  assert.equal(el.querySelector('#sdValor').value, '24.120', 'o padrão no anual: 12 × o mínimo mensal');
  assert.match(txt(el.querySelector('#sdValorNota')), /em dezembro = 12 × o mínimo mensal/);
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
  assert.equal(salvo.valorManual, true);
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

// ---------------------------------------------------------------------------
// 03/10/2026: valor padrão = mínimo pra matar 2 parcelas; "matar 2, 3, 4"
// ---------------------------------------------------------------------------

test('valor padrão explicado; valor digitado mostra o mínimo e "usar o mínimo" volta', async () => {
  const chamadas = [];
  const { el, w, sec } = await montar({ aoMudar: (sim, p) => chamadas.push([sim, p.valor]) });
  assert.ok(chamadas.length >= 1 && chamadas[0][0].resumo, 'avisa quem está de fora (o herói) a cada simulação');
  assert.match(txt(el.querySelector('#sdValorNota')), /R\$ 2\.010 por mês tira 2 parcelas do fim do contrato do apê a cada mês - o mínimo pra isso \(2 × a amortização de R\$ 1\.002, já com a TR\)/);
  mudar(w, el.querySelector('#sdValor'), '1.000');
  assert.equal(sec.params.valorManual, true);
  const nota = txt(el.querySelector('#sdValorNota'));
  assert.match(nota, /Você escolheu R\$ 1\.000 por mês: tira ~1 parcela do apê por mês/);
  assert.match(nota, /O mínimo pra tirar 2 por mês é R\$ 2\.010/);
  assert.equal(chamadas[chamadas.length - 1][1], 1000);
  clique(w, el.querySelector('[data-sd-acao="minimo"]'));
  assert.equal(sec.params.valor, 2010);
  assert.equal(sec.params.valorManual, false);
  // digitar o próprio mínimo = continua "padrão"
  mudar(w, el.querySelector('#sdValor'), '2.010');
  assert.equal(sec.params.valorManual, false);
  // o padrão acompanha a dívida escolhida
  clique(w, el.querySelector('[data-sd-seg="alvo"] [data-v="fies"]'));
  assert.ok(sec.params.valor < 2010 && sec.params.valor > 0);
  assert.match(txt(el.querySelector('#sdValorNota')), /tira 2 parcelas do fim do contrato do FIES/);
  assert.match(txt(el.querySelector('#sdValorNota')), /o principal das 2 últimas parcelas/);
});

test('"Quanto amortizar pra matar 2, 3 ou 4 parcelas": um card por dívida, linha atual marcada e "simular este" põe no formulário', async () => {
  const { el, w, sec } = await montar();
  const cards = el.querySelectorAll('#sdParcelas .sd-matar-card');
  assert.deepEqual([...cards].map((c) => c.dataset.sdDivida), ['financiamento', 'fies']);
  cards.forEach((c) => assert.equal(c.querySelectorAll('.sd-matar-li').length, 3));
  const ape = cards[0].querySelectorAll('.sd-matar-li');
  assert.ok(ape[0].classList.contains('atual'), 'o padrão (2 parcelas do apê) é o que está simulando');
  assert.match(txt(ape[0]), /2\s?parcelas\/mês/);
  assert.match(txt(ape[0]), /R\$ 2\.010/);
  assert.match(txt(ape[0]), /Quita em/);
  assert.match(txt(ape[0]), /Juros \+ seguro/);
  assert.match(txt(ape[0]), /Patrimônio em 2035/);
  assert.match(txt(ape[2]), /R\$ 4\.010/, '4 parcelas = 4 × a amortização corrigida');
  assert.match(txt(cards[1].querySelector('.pt-card-cab')), /menos que a inflação/);
  // FIES, 3 parcelas
  const btn = cards[1].querySelectorAll('[data-sd-matar]')[1];
  const valor = Number(btn.dataset.sdMatar.split(':')[1]);
  clique(w, btn);
  assert.equal(sec.params.alvo, 'fies');
  assert.equal(sec.params.valor, valor);
  assert.equal(sec.params.modo, 'prazo');
  assert.equal(sec.params.frequencia, 'mensal');
  assert.equal(sec.params.valorManual, true, '3 parcelas não é o padrão (2)');
  assert.ok(el.querySelectorAll('#sdParcelas .sd-matar-card')[1].querySelectorAll('.sd-matar-li')[1].classList.contains('atual'));
  assert.match(txt(el.querySelector('.sd-card.amort')), /Amortizar o FIES/);
  assert.ok(el.querySelector('#sdForm').classList.contains('sd-piscar'));
});

test('escolha antiga salva no navegador: o padrão antigo (10% do salário) vira o mínimo novo; um valor digitado fica', async () => {
  const s1 = memoria();
  s1.setItem('simuladorDividas:v1', JSON.stringify({ valor: 800, frequencia: 'mensal', perfil: 'fii' }));
  const a = await montar({ storage: s1 });
  assert.equal(a.sec.params.valor, 2010);
  assert.equal(a.sec.params.perfil, 'fii', 'as outras escolhas continuam');
  const s2 = memoria();
  s2.setItem('simuladorDividas:v1', JSON.stringify({ valor: 1500, frequencia: 'mensal' }));
  const b = await montar({ storage: s2 });
  assert.equal(b.sec.params.valor, 1500);
  assert.equal(b.sec.params.valorManual, true);
  assert.match(txt(b.el.querySelector('#sdValorNota')), /O mínimo pra tirar 2 por mês é R\$ 2\.010/);
});
