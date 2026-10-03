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
import { montarPaginaMetas, TEMPLATE_METAS, parseNumeroBR, graficoProjecaoSvg, heroiHtml, cardMetaHtml } from '../assets/js/pages/metas.js';
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

async function montar({ metas = [], hash = '', historico = { ok: true, hoje: '2026-10-02', metas: {}, indices: [] } } = {}) {
  const { doc, w } = montarDom(hash);
  let servidor = { ...clone(BASE), metas: clone(metas) };
  const salvas = [];
  const arquivadas = [];
  const excluidas = [];
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
    getMetasHistoricoImpl: async () => clone(historico),
    excluirDefinitivoImpl: async (_t, id) => { excluidas.push(id); return { ok: true, id, excluida: true }; },
  });
  await espera();
  return { doc, w, pagina, salvas, arquivadas, excluidas };
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

// 03/10/2026: link "Criar em Metas e Objetivos" dos cards de Metas da carteira
// (Acompanhamento de Ativos) -> metas.html#nova=<tipo>.
test('#nova=renda-passiva abre o assistente no passo Dados com os números da planilha e limpa o endereço', async () => {
  const { doc, w, salvas } = await montar({ metas: [META_VIAGEM], hash: '#nova=renda-passiva' });
  const dlg = doc.getElementById('mtDialogo');
  assert.equal(dlg.hidden, false);
  assert.match(dlg.querySelector('.mt-passos .atual').textContent, /Dados/);
  assert.equal(dlg.querySelector('[data-campo="nome"]').value, 'Renda passiva');
  assert.match(dlg.querySelector('[data-campo="especificos.rendaMensal"]').value, /^1\.000/, 'metaPlanilha da Distribuição e Metas');
  assert.equal(w.location.hash, '', 'fechar ou recarregar não reabre o assistente');
  clique(w, dlg.querySelector('[data-proximo]'));
  clique(w, dlg.querySelector('[data-proximo]'));
  clique(w, dlg.querySelector('[data-salvar]'));
  await espera();
  assert.equal(salvas.length, 1);
  assert.equal(salvas[0].tipo, 'rendaPassiva');
  assert.equal(salvas[0].especificos.rendaMensal, 1000);
});

test('#nova=<tipo> com a meta desse tipo já criada abre o detalhe dela (não duplica); tipo desconhecido só limpa', async () => {
  const { doc, w } = await montar({ metas: [META_VIAGEM, META_RP], hash: '#nova=renda-passiva' });
  assert.equal(doc.getElementById('mtDialogo').hidden, true);
  assert.equal(w.location.hash, '#meta=m2');
  assert.match(doc.getElementById('mtTela').textContent, /Renda Teste/);
  const outro = await montar({ metas: [META_VIAGEM], hash: '#nova=foguete' });
  assert.equal(outro.doc.getElementById('mtDialogo').hidden, true);
  assert.equal(outro.w.location.hash, '');
});

test('#nova=reserva-emergencia e #nova=aposentadoria: tipo certo no assistente', async () => {
  const a = await montar({ hash: '#nova=reserva-emergencia' });
  assert.equal(a.doc.querySelector('#mtDialogo [data-campo="especificos.meses"]').value, '6');
  const b = await montar({ hash: '#nova=aposentadoria' });
  assert.equal(b.doc.querySelector('#mtDialogo [data-campo="nome"]').value, 'Aposentadoria');
  assert.ok(b.doc.querySelector('#mtDialogo [data-campo="especificos.taxaRetirada"]'));
});

// ---------------------------------------------------------------------------
// 03/10/2026: Metas v2 na tela (dados inventados)
// ---------------------------------------------------------------------------
const ATIVO_IR = { id: 'rf:Tesouro X|Banco Y@emergencial', ref: 'rf:Tesouro X|Banco Y', nome: 'Tesouro X', classe: 'rf', marca: 'emergencial', instituicao: 'Banco Y', indexador: 'SELIC', valorBRL: 8000, irResgate: { ir: 120, iof: 0, liquido: 7880 } };
const HIST = {
  ok: true, hoje: '2026-10-02', indices: [{ mes: '2026-06', cdi: 100 }, { mes: '2026-09', cdi: 103 }],
  metas: {
    m2: { meses: [{ mes: '2026-06', valor: 8000, fluxo: 0 }, { mes: '2026-07', valor: 8600, fluxo: 500 }, { mes: '2026-08', valor: 9300, fluxo: 600 }, { mes: '2026-09', valor: 10000, fluxo: 600 }, { mes: '2026-10', valor: 10000, fluxo: 0 }], aporteMedio: 425, aporte3m: 566.67, mesesBase: 4,
      renda: [{ mes: '2026-06', valor: 90 }, { mes: '2026-07', valor: 95 }, { mes: '2026-08', valor: 100 }, { mes: '2026-09', valor: 110 }, { mes: '2026-10', valor: 20 }] },
    r1: { meses: [{ mes: '2026-08', valor: 7000, fluxo: 0 }, { mes: '2026-09', valor: 8000, fluxo: 900 }, { mes: '2026-10', valor: 8000, fluxo: 0 }], aporteMedio: 450, mesesBase: 2 },
  },
};
const META_RESERVA = { id: 'r1', tipo: 'reservaEmergencia', nome: 'Reserva Teste', especificos: { meses: 4, margem: 0, usarDespesasPlanilha: false, despesaMensal: 1990 }, vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }], status: 'ativa' };

async function montarV2(opcoes) {
  const r = await montar({ historico: HIST, ...opcoes });
  await espera();
  return r;
}

test('v2 reserva: herói com bruto x LÍQUIDO, "Ideal só no bruto", explicação no "i" (toque) e IR no detalhe dos títulos', async () => {
  BASE.ativos[1] = ATIVO_IR;
  try {
    const { doc, w } = await montarV2({ metas: [META_RESERVA], hash: '#meta=r1' });
    const tela = doc.getElementById('mtTela');
    const heroi = tela.querySelector('.mt-heroi-v2');
    assert.match(heroi.textContent, /Líquido hoje/);
    assert.match(heroi.textContent, /7\.880/);
    assert.match(heroi.textContent, /Ideal só no bruto/, 'alvo 7.960: bruto 8.000 passa, líquido 7.880 não');
    assert.match(heroi.textContent, /IR\/IOF −R\$\s120/);
    const info = heroi.querySelector('.mt-status-dica .mt-info');
    clique(w, info);
    const balao = doc.querySelector('.mt-dica-balao');
    assert.ok(balao, 'abre o balão');
    assert.match(balao.textContent, /bruto/);
    assert.equal(info.getAttribute('aria-expanded'), 'true');
    assert.equal(info.getAttribute('aria-describedby'), balao.id);
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(doc.querySelector('.mt-dica-balao'), null, 'Esc fecha');
    assert.match(tela.textContent, /Líquido se resgatasse hoje/);
    assert.match(tela.textContent, /IR se resgatasse hoje/);
    assert.match(tela.textContent, /Seu aporte real/);
    assert.match(tela.textContent, /Seus investimentos combinam\?/);
    assert.match(tela.textContent, /Tesouro Selic/, 'sugestões da reserva');
    assert.ok(tela.querySelector('.mt-fontes a[href^="https://"]'), 'cita as fontes');
  } finally { BASE.ativos[1] = { id: 'rf:Tesouro X|Banco Y@emergencial', ref: 'rf:Tesouro X|Banco Y', nome: 'Tesouro X', classe: 'rf', marca: 'emergencial', instituicao: 'Banco Y', valorBRL: 8000 }; }
});

test('v2 renda passiva: histórico (filtro, tooltip por teclado, análise), renda mês a mês, projeção com análise, velocidade e marcos', async () => {
  const { doc, w } = await montarV2({ metas: [{ ...META_RP, aporteMensal: null }], hash: '#meta=m2' });
  const tela = doc.getElementById('mtTela');
  assert.match(tela.querySelector('.mt-heroi-v2').textContent, /Seu aporte real/);
  assert.match(tela.querySelector('.mt-heroi-v2').textContent, /425/, 'aporte real do histórico, sem digitar');
  const svg = tela.querySelector('#mtHistGrafico svg');
  assert.ok(svg, 'gráfico do histórico');
  svg.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  const tt = tela.querySelector('#mtHistGrafico .mt-tt');
  assert.equal(tt.hidden, false);
  assert.match(tt.textContent, /out\/2026/);
  svg.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.match(tt.textContent, /set\/2026/);
  assert.match(tt.textContent, /Aporte/);
  assert.match(tt.textContent, /Rendimento/);
  assert.ok(tela.querySelector('#mtHistAnalise details.ag'), 'card de análise embaixo do histórico');
  assert.match(tela.querySelector('#mtHistAnalise').textContent, /aportes/);
  const tabs = tela.querySelector('#mtHistBloco .mt-tabs-periodo');
  assert.ok(tabs.querySelector('.fp-chip'), '"Escolher período" no filtro');
  clique(w, tabs.querySelector('[data-periodo="tudo"]'));
  assert.ok(tela.querySelector('#mtHistGrafico svg'));
  clique(w, tela.querySelector('[data-modo-hist="mensal"]'));
  assert.ok(tela.querySelector('#mtHistGrafico svg.mensal'), 'visão mês a mês');
  assert.ok(tela.querySelector('#mtRendaGrafico svg.mt-g-renda'), 'renda mês a mês');
  assert.ok(tela.querySelector('#mtRendaAnalise details.ag'));
  assert.ok(tela.querySelector('#mtGrafico svg'), 'projeção');
  assert.ok(tela.querySelector('#mtProjAnalise details.ag'), 'análise da projeção');
  assert.match(tela.textContent, /Quanto tempo leva/);
  assert.match(tela.textContent, /Em 75% do tempo/i);
  assert.match(tela.textContent, /Em 50% do tempo/i);
  assert.match(tela.textContent, /Como acelerar/i);
  assert.match(tela.textContent, /Marcos até o alvo/);
  assert.match(tela.textContent, /E se a renda fosse menor\?/);
});

test('v2 aposentadoria: o prazo aparece e salva (bug), a conta da planilha passo a passo muda ao editar o extra', async () => {
  const ref = { reserva: { custoDeVida: 5000, meses: 6, sobra: 0 }, patrimonio: { extra: 1000, reinvestimento: 0.2, rendimento: 0.06, desejado: 1440000 }, rendaPassiva: {} };
  const meta = { id: 'p1', tipo: 'aposentadoria', nome: 'Apos', dataAlvo: '2050-12', rendimentoAnual: 0.06, especificos: { modoAlvo: 'calculado', usarDespesasPlanilha: true, extra: 1000, reinvestimento: 0.2, taxaRetirada: 0.06 }, vinculos: [], status: 'ativa' };
  const antes = BASE.referencias;
  BASE.referencias = ref;
  try {
    const { doc, w, salvas } = await montarV2({ metas: [meta], hash: '#meta=p1' });
    const tela = doc.getElementById('mtTela');
    assert.match(tela.textContent, /1\.440\.000/);
    assert.match(tela.textContent, /= Renda ideal por mês/);
    clique(w, tela.querySelector('[data-editar]'));
    const dlg = doc.getElementById('mtDialogo');
    const prazo = dlg.querySelector('[data-campo="dataAlvo"]');
    assert.ok(prazo, 'campo de prazo na aposentadoria');
    digitar(w, prazo, '2045-06', 'change');
    const conta = () => dlg.querySelector('#mtContaApos').textContent;
    assert.match(conta(), /7\.200/);
    digitar(w, dlg.querySelector('[data-campo="especificos.extra"]'), '2.000');
    assert.match(conta(), /8\.400/, '(5.000 + 2.000) x 1,2');
    assert.match(conta(), /1\.680\.000/);
    digitar(w, dlg.querySelector('[data-campo="especificos.reinvestimento"]'), '25');
    assert.match(conta(), /1\.750\.000/);
    clique(w, dlg.querySelector('[data-passo="4"]'));
    clique(w, dlg.querySelector('[data-salvar]'));
    await espera();
    const s = salvas[salvas.length - 1];
    assert.deepEqual([s.dataAlvo, s.especificos.extra, s.especificos.reinvestimento], ['2045-06', 2000, 0.25]);
  } finally { BASE.referencias = antes; }
});

test('v2 viagem: destinos (dias x gasto diário) e itens fixos no assistente; saldo em conta no passo 3', async () => {
  const { doc, w, salvas } = await montarV2({ metas: [] });
  clique(w, doc.getElementById('mtNova'));
  const dlg = doc.getElementById('mtDialogo');
  clique(w, dlg.querySelector('[data-tipo="viagemInternacional"]'));
  clique(w, dlg.querySelector('[data-dest-add]'));
  digitar(w, dlg.querySelector('[data-dest="0"][data-dest-campo="cidade"]'), 'Cidade A');
  digitar(w, dlg.querySelector('[data-dest="0"][data-dest-campo="dias"]'), '4');
  digitar(w, dlg.querySelector('[data-dest="0"][data-dest-campo="gastos.alimentacao"]'), '50');
  digitar(w, dlg.querySelector('[data-dest="0"][data-dest-campo="gastos.transporte"]'), '25');
  assert.match(dlg.querySelector('[data-dest-total="0"]').textContent, /€\s75\/dia · total €\s300/);
  assert.match(dlg.querySelector('#mtResumoViagem').textContent, /€\s330/, '+10% de margem');
  clique(w, dlg.querySelector('[data-fixo-add]'));
  digitar(w, dlg.querySelector('[data-fixo="0"][data-fixo-campo="nome"]'), 'Passagem');
  digitar(w, dlg.querySelector('[data-fixo="0"][data-fixo-campo="valor"]'), '1.200');
  digitar(w, dlg.querySelector('[data-fixo="0"][data-fixo-campo="parcelas"]'), '6');
  assert.match(dlg.querySelector('#mtPrevia').textContent, /1\.980/, '€ 330 x 6');
  clique(w, dlg.querySelector('[data-proximo]'));
  clique(w, dlg.querySelector('[data-saldo-add]'));
  digitar(w, dlg.querySelector('[data-saldo-campo="instituicao"]'), 'Conta X');
  digitar(w, dlg.querySelector('[data-saldo-campo="saldo"]'), '100');
  assert.match(dlg.querySelector('.mt-saldo-brl').textContent, /600/);
  clique(w, dlg.querySelector('[data-proximo]'));
  clique(w, dlg.querySelector('[data-salvar]'));
  await espera();
  const s = salvas[0];
  assert.equal(s.especificos.destinos[0].cidade, 'Cidade A');
  assert.equal(s.especificos.destinos[0].gastos.alimentacao, 50);
  assert.deepEqual([s.especificos.fixos[0].nome, s.especificos.fixos[0].valor, s.especificos.fixos[0].parcelas], ['Passagem', 1200, 6]);
  assert.deepEqual(s.vinculos.map((v) => [v.tipo, v.instituicao, v.moeda, v.saldo]), [['saldo', 'Conta X', 'EUR', 100]]);
  const tela = doc.getElementById('mtTela');
  assert.match(tela.textContent, /Destinos/);
  assert.match(tela.textContent, /já trocado/);
  assert.match(tela.textContent, /Saldo em conta · Conta X/);
});

test('v2 saldo em conta: "Atualizar saldo" no detalhe salva o novo saldo com a data de hoje', async () => {
  const meta = { ...META_VIAGEM, vinculos: [{ tipo: 'saldo', id: 's1', instituicao: 'Conta X', moeda: 'EUR', saldo: 100, atualizadoEm: '2026-09-01', historico: [{ data: '2026-09-01', saldo: 100 }] }] };
  const { doc, w, salvas } = await montarV2({ metas: [meta], hash: '#meta=m1' });
  const tela = doc.getElementById('mtTela');
  clique(w, tela.querySelector('[data-saldo-editar="s1"]'));
  digitar(w, doc.getElementById('mtSaldoNovo'), '250');
  clique(w, tela.querySelector('[data-saldo-salvar="s1"]'));
  await espera();
  const v = salvas[salvas.length - 1].vinculos[0];
  assert.deepEqual([v.saldo, v.atualizadoEm], [250, '2026-10-02']);
});

test('v2 arquivada: "Excluir definitivamente" (com confirmação) apaga e volta pra lista', async () => {
  const { doc, w, excluidas } = await montar({ metas: [META_VIAGEM] });
  const tela = doc.getElementById('mtTela');
  clique(w, tela.querySelector('[data-abrir="m1"]'));
  clique(w, tela.querySelector('[data-arquivar]'));
  await espera();
  clique(w, tela.querySelector('[data-filtro-status="arquivadas"]'));
  clique(w, tela.querySelector('[data-abrir="m1"]'));
  assert.ok(tela.querySelector('[data-excluir-definitivo]'));
  clique(w, tela.querySelector('[data-excluir-definitivo]'));
  await espera();
  assert.deepEqual(excluidas, ['m1']);
  assert.ok(!tela.querySelector('[data-abrir="m1"]'));
});

// 03/10/2026 (revisão): viagem com o dinheiro de lá já juntado e só parcelas
// (passagem no cartão) correndo - o status é "no ritmo", então o herói e o
// card não podem pintar o aporte de vermelho comparando com as parcelas.
test('v2 viagem: parcelas correndo à parte - herói e card comparam o aporte com o que falta JUNTAR', () => {
  const meta = {
    id: 'v1', tipo: 'viagemInternacional', nome: 'Viagem Parcelas', moeda: 'EUR', dataAlvo: '2027-05', rendimentoAnual: 0, status: 'ativa', itens: [],
    especificos: { margem: 0, destinos: [{ id: 'd1', cidade: 'Cidade A', moeda: 'EUR', dias: 2, gastos: { alimentacao: 50 } }],
      fixos: [{ id: 'f1', nome: 'Passagem', valor: 1200, moeda: 'BRL', parte: 1, parcelas: 6, inicio: '2026-08' }] },
    vinculos: [{ tipo: 'saldo', id: 's1', instituicao: 'Conta X', moeda: 'EUR', saldo: 100 }],
  };
  const c = calcularMeta(meta, { ...clone(BASE), historico: {} });
  assert.equal(c.falta, 0, 'o dinheiro de lá já está guardado');
  assert.ok(c.parcelasCorrendo > 0);
  assert.equal(c.status, 'no-ritmo');
  const h = heroiHtml(meta, c);
  assert.match(h, /nada a juntar · \+ <b>R\$\s200<\/b>\/mês de parcelas/);
  assert.doesNotMatch(h, /mt-num-heroi[^"]*ruim[^>]*>[\s\S]{0,200}Seu aporte/, 'aporte não fica vermelho');
  const card = cardMetaHtml(meta, c);
  assert.match(card, /class="mt-aporte ok"/);
  assert.match(card, /necessário \(R\$\s200 de parcelas\)/);
});
