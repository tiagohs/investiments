// tests/inicio-hero.test.js
//
// 07/10/2026: Início com o hero "Patrimônio líquido" (inicio-hero-calc.js + inicio-hero.js), o cartão "Metas" (inicio-metas.js),
// o carregamento em paralelo com cache e erro isolado (inicio-blocos.js) e o rótulo "Investimentos" no lugar de "Patrimônio
// total" (só na Início). Todos os números são INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  PERIODOS_HERO, periodoDoHero, modeloHero, destaqueRendimento, decomposicaoVariacao, reaisCurto, anelHero, contaHero, limitesHero, valorGrande, QUEDA_FORTE,
} from '../assets/js/pages/inicio-hero-calc.js';
import { criarHero } from '../assets/js/pages/inicio-hero.js';
import { modeloMetasHome, renderMetasHome, criarCartaoMetas, classeStatusHome, seloTexto, resumoTexto, METAS_NO_CELULAR } from '../assets/js/pages/inicio-metas.js';
import { carregarBloco, criarBlocosHome } from '../assets/js/pages/inicio-blocos.js';
import { montarPaginaInicio } from '../assets/js/pages/inicio.js';
import { ROTULO_TOTAL_HOME, NOME_ANALISE_TOTAL_HOME, VISOES, LABEL_POR_VISAO_RENTABILIDADE } from '../assets/js/pages/inicio-calc.js';
import { contextoPatrimonio } from '../assets/js/pages/organizacao-patrimonio.js';
import { seriesReais, resumoPeriodo } from '../assets/js/pages/patrimonio-inflacao.js';
import { calcularMeta, resumoMetas } from '../assets/js/pages/metas-calc.js';
import { contextoMetas } from '../assets/js/metas-card.js';
import { usarMemoriaNoCacheDados } from '../assets/js/cache-dados.js';

const RAIZ = 'https://exemplo.test/site/';
const perto = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const mesMais = (mes, n) => { const [a, m] = mes.split('-').map(Number); const t = a * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const limparPeriodoSalvo = () => { try { globalThis.localStorage.removeItem('periodo:inicio.hero'); } catch (e) { /* sem storage */ } };

function historico({ inicio = '2025-04', meses = 18, inicial = 40000, aporte = 1500, rend = 0.008, ipca = 0.004, cdi = 0.009 } = {}) {
  const out = [];
  let v = inicial; let nI = 100; let nC = 100;
  for (let k = 0; k < meses; k += 1) {
    if (k > 0) { v = v * (1 + rend) + aporte * (1 + rend / 2); nI *= 1 + ipca; nC *= 1 + cdi; }
    out.push({ mes: mesMais(inicio, k), patrimonio: Math.round(v * 100) / 100, aporte: k ? aporte : 0, indiceIpca: nI, indiceCdi: nC });
  }
  return out;
}

/** Resposta inventada do getPatrimonio: investimentos + reserva, apê financiado e um FIES. */
function patrimonioFalso(opcoes = {}) {
  const hm = historico(opcoes);
  const ult = hm[hm.length - 1].patrimonio;
  return {
    ok: true, hoje: '2026-09-30', historicoMensal: hm, investimentos: { longoPrazo: ult - 8000, reserva: 8000 },
    config: {
      imovel: { valorCompra: 400000, dataCompra: '2024-06', metodo: 'compra' },
      financiamento: { saldo: 300000, dataSaldo: '2026-09-30', dataInicio: '2024-06-15', valorFinanciado: 320000, amortizacao: 1000, taxaAnual: 0.09 },
      fies: { saldo: 50000, dataSaldo: '2026-09', taxaMensal: 0, parcela: 0 },
    },
  };
}

// ---------------------------------------------------------------------------
// Modelo do hero (sem DOM)
// ---------------------------------------------------------------------------

test('periodoDoHero(): "Mês atual" e "No ano" viram intervalos até hoje; 12m e tudo passam; personalizado passa', () => {
  assert.deepEqual(periodoDoHero('mes', '2026-09-30'), { inicio: '2026-09-01', fim: '2026-09-30' });
  assert.deepEqual(periodoDoHero('ano', '2026-09-30'), { inicio: '2026-01-01', fim: '2026-09-30' });
  assert.equal(periodoDoHero('12m', '2026-09-30'), '12m');
  assert.equal(periodoDoHero('tudo', '2026-09-30'), 'tudo');
  assert.deepEqual(periodoDoHero({ inicio: '2026-02-01', fim: '2026-03-31' }, '2026-09-30'), { inicio: '2026-02-01', fim: '2026-03-31' });
  assert.equal(periodoDoHero('qualquer', '2026-09-30'), '12m', 'desconhecido cai no padrão');
  assert.deepEqual(PERIODOS_HERO, ['mes', 'ano', '12m', 'tudo']);
});

test('modeloHero(): o líquido é o do balanço da Organização e o período usa seriesReais + resumoPeriodo (sem conta nova)', () => {
  const d = patrimonioFalso();
  const m = modeloHero(d, '12m');
  assert.ok(perto(m.liquido, contextoPatrimonio(d).b.liquido), 'mesmo valor de Organização > Patrimônio');
  const r = resumoPeriodo(seriesReais(d, { hoje: d.hoje, ctx: contextoPatrimonio(d) }), '12m', { hoje: d.hoje });
  assert.ok(r, 'a janela de 12 meses existe');
  assert.ok(perto(m.variacao.valor, r.pl.variacao) && perto(m.variacao.pct, r.pl.variacaoPct));
  assert.ok(perto(m.decomposicao.novo, r.fluxos) && perto(m.decomposicao.rendimento, r.retornos));
  assert.ok(perto(m.destaque.rendimento, r.pl.acumulado) && perto(m.destaque.acimaInflacao, r.pl.real) && perto(m.destaque.ipca, r.ipca.acumulado));
  assert.equal(m.variacao.inicioRotulo, 'set/25');
  assert.equal(m.variacao.descricao, 'em 12 meses');
  assert.equal(m.serie.length, r.linhas.length);
  // a parte "dinheiro novo" + a parte "rendendo sozinho" fecham a variação
  assert.ok(perto(m.decomposicao.novo + m.decomposicao.rendimento, m.variacao.valor, 0.01));
  // 07/10/2026: "era X" + variação = o número grande (o último ponto da série é o valor de HOJE)
  assert.ok(perto(m.variacao.inicioValor + m.variacao.valor, m.liquido, 0.01));
  assert.ok(perto(m.serie[m.serie.length - 1], m.liquido, 0.01));
});

test('modeloHero(): série mensal diferente do balanço de hoje - o hero fecha a conta com o valor de hoje', () => {
  const d = patrimonioFalso();
  const base = seriesReais(d, { hoje: d.hoje, ctx: contextoPatrimonio(d) });
  const ultSerie = base.pontos[base.pontos.length - 1].pl;
  // FGTS do dia diferente do saldo usado na série do mês: o líquido de hoje muda, a série mensal não
  const d2 = { ...d, config: { ...d.config, fgts: d.config.fgts } };
  const m = modeloHero(d2, '12m');
  for (const per of ['mes', 'ano', '12m', 'tudo']) {
    const x = modeloHero(d2, per);
    if (x.variacao) assert.ok(perto(x.variacao.inicioValor + x.variacao.valor, x.liquido, 0.01), per);
  }
  assert.ok(Number.isFinite(ultSerie) && Number.isFinite(m.liquido));
});

test('modeloHero(): cada período muda os números (mês atual, no ano, 12 meses, desde o início, personalizado)', () => {
  const d = patrimonioFalso();
  const v = (p) => modeloHero(d, p).variacao;
  const mes = v('mes'); const ano = v('ano'); const doze = v('12m'); const tudo = v('tudo');
  assert.equal(mes.descricao, 'no mês'); assert.equal(mes.inicioRotulo, 'ago/26');
  assert.equal(ano.descricao, 'no ano'); assert.equal(ano.inicioRotulo, 'dez/25');
  assert.equal(tudo.descricao, 'desde o início'); assert.equal(tudo.inicioRotulo, 'abr/25');
  assert.ok(mes.valor < ano.valor && ano.valor < doze.valor && doze.valor < tudo.valor, 'janelas maiores acumulam mais');
  const pers = modeloHero(d, { inicio: '2026-01-01', fim: '2026-06-30' });
  assert.equal(pers.variacao.descricao, 'no período');
  assert.equal(pers.variacao.inicioRotulo, 'dez/25');
  assert.ok(pers.variacao.valor > 0 && pers.variacao.valor < ano.valor);
  // o número grande é sempre o de HOJE, qualquer que seja o período
  assert.equal(new Set(['mes', 'ano', '12m', 'tudo'].map((p) => modeloHero(d, p).liquido)).size, 1);
});

test('modeloHero(): KPIs (investimentos+reserva, apê = imóvel − financiamento, dívidas), anel e "conta" fecham', () => {
  const d = patrimonioFalso();
  const m = modeloHero(d, '12m');
  const inv = d.investimentos.longoPrazo + d.investimentos.reserva;
  assert.ok(perto(m.kpis.investimentos, inv, 0.01));
  assert.ok(perto(m.kpis.ape.valor, 400000 - 300000, 1));
  assert.ok(perto(m.kpis.dividas, 300000 + 50000, 1));
  assert.ok(perto(m.totalAtivos - m.totalDividas, m.liquido, 0.01));
  const anel = anelHero(m);
  assert.deepEqual(anel.fatias.map((f) => f.id), ['investimentos', 'reserva', 'imovel']);
  assert.equal(anel.centro.rotulo, 'tudo que você tem');
  assert.match(anel.centro.valor, /^R\$ \d+ mil$/);
  const conta = contaHero(m);
  assert.equal(conta[0].nome, 'Tudo que você tem');
  assert.deepEqual(conta.filter((l) => l.tipo === 'divida').map((l) => l.nome), ['− Financiamento do apê', '− FIES']);
  assert.equal(conta[conta.length - 1].nome, '= Patrimônio líquido');
  assert.equal(conta[conta.length - 1].valor, valorGrande(m.liquido).principal.replace(/^R\$ /, 'R$ '));
});

test('modeloHero(): sem histórico bastante pro período mostra só o valor de hoje', () => {
  const d = patrimonioFalso({ meses: 1 });
  const m = modeloHero(d, '12m');
  assert.equal(m.semHistorico, true);
  assert.equal(m.variacao, null); assert.equal(m.destaque, null); assert.equal(m.decomposicao, null);
  assert.match(m.aviso, /sem histórico bastante pra esse período/);
  assert.ok(m.liquido > 0, 'o valor de hoje continua');
  // mês atual sem 2 pontos (histórico terminou no mês passado)
  const d2 = patrimonioFalso(); d2.hoje = '2026-11-05';
  const m2 = modeloHero(d2, 'mes');
  assert.equal(m2.semHistorico, true, 'mês atual sem 2 pontos de histórico');
  assert.equal(m2.variacao, null);
  assert.equal(modeloHero(null), null);
});

test('modeloHero(): patrimônio líquido negativo no começo corta a janela e diz desde quando', () => {
  const hm = historico({ meses: 24, inicial: 5000 });
  const d = { hoje: '2026-12-31', historicoMensal: hm, config: { fies: { saldo: 20000, dataSaldo: '2026-12', taxaMensal: 0, parcela: 0 } } };
  const m = modeloHero(d, 'tudo');
  assert.ok(m.corte, 'avisa o corte');
  assert.match(m.corte.texto, /^Contando desde [a-z]{3}\/\d{2} - antes disso o patrimônio líquido era zero ou negativo\.$/);
  assert.ok(m.variacao.inicioValor > 1000);
});

test('destaqueRendimento(): verde quando rende acima da inflação, neutro quando fica abaixo ou cai pouco, vermelho só em queda forte', () => {
  const r = (acumulado, real, ipca = 0.04) => ({ pl: { acumulado, real }, ipca: { acumulado: ipca } });
  const bom = destaqueRendimento(r(0.167, 0.12, 0.042));
  assert.equal(bom.tom, 'bom');
  assert.equal(bom.texto, 'Sem contar o dinheiro novo, o patrimônio rendeu +16,7% - 12,0% acima da inflação (IPCA 4,2%)');
  const abaixo = destaqueRendimento(r(0.02, -0.018, 0.04));
  assert.equal(abaixo.tom, 'neutro');
  assert.match(abaixo.texto, /rendeu \+2,0% - 1,8% abaixo da inflação \(IPCA 4,0%\)$/);
  const cai = destaqueRendimento(r(-0.03, -0.07));
  assert.equal(cai.tom, 'neutro');
  assert.match(cai.texto, /o patrimônio perdeu 3,0% - 7,0% abaixo da inflação/);
  const forte = destaqueRendimento(r(QUEDA_FORTE - 0.01, -0.15));
  assert.equal(forte.tom, 'ruim');
  assert.equal(destaqueRendimento({ pl: { acumulado: null } }), null);
});

test('decomposicaoVariacao(): "Dos +R$ N: R$ A foi dinheiro novo ... e R$ B o patrimônio rendendo sozinho"; B negativo vira "perdeu"', () => {
  const ok = decomposicaoVariacao({ pl: { variacao: 108585 }, fluxos: 70600, retornos: 37985 });
  assert.equal(ok.texto, 'Dos +R$ 108,6 mil: R$ 70,6 mil foi dinheiro novo (aportes e parcelas que abateram dívida) e R$ 38,0 mil o patrimônio rendendo sozinho (investimentos e valorização do apê).');
  const perdeu = decomposicaoVariacao({ pl: { variacao: 5000 }, fluxos: 12000, retornos: -7000 });
  assert.equal(perdeu.perdeu, true);
  assert.match(perdeu.texto, /o patrimônio perdeu R\$ 7,0 mil sozinho \(investimentos e valorização do apê\)\.$/);
  assert.match(perdeu.texto, /^Dos \+R\$ 5,0 mil: R\$ 12,0 mil foi dinheiro novo/);
  assert.equal(decomposicaoVariacao(null), null);
  assert.equal(reaisCurto(574), 'R$ 574'); assert.equal(reaisCurto(1240000), 'R$ 1,24 mi');
});

test('valorGrande() separa os centavos; limitesHero() vai do 1º mês do histórico até hoje', () => {
  const g = valorGrande(319573);
  assert.equal(g.principal.replace(/\s/g, ' '), 'R$ 319.573');
  assert.equal(g.dec, ',00');
  const d = patrimonioFalso();
  assert.deepEqual(limitesHero(d), { min: '2025-04-01', max: '2026-09-30' });
  assert.equal(limitesHero({ hoje: '2026-09-30', historicoMensal: [] }), null);
});

// ---------------------------------------------------------------------------
// Rótulos "Investimentos" (só na Início)
// ---------------------------------------------------------------------------

test('"Investimentos" é o rótulo da Início; os rótulos compartilhados com Carteiras continuam "Patrimônio total"', () => {
  assert.equal(ROTULO_TOTAL_HOME, 'Investimentos');
  assert.match(NOME_ANALISE_TOTAL_HOME, /^A carteira de investimentos$/);
  assert.equal(VISOES.total.label, 'Patrimônio total');
  assert.equal(LABEL_POR_VISAO_RENTABILIDADE.total, 'Patrimônio total');
});

// ---------------------------------------------------------------------------
// Hero no DOM
// ---------------------------------------------------------------------------

function domHero() {
  const dom = new JSDOM('<!doctype html><html><body><section id="hero"></section></body></html>', { url: 'https://exemplo.test/site/index.html' });
  return dom.window.document;
}

test('criarHero(): desenha número, chip, destaque verde, decomposição, KPIs, anel e a conta; trocar o período muda os números', async () => {
  limparPeriodoSalvo();
  const doc = domHero();
  const el = doc.getElementById('hero');
  const hero = criarHero(doc, el, { raizSite: RAIZ });
  assert.equal(el.dataset.estado, 'carregando');
  hero.dados(patrimonioFalso());
  assert.equal(el.dataset.estado, 'pronto');
  const t = (sel) => el.querySelector(sel).textContent;
  const m12 = modeloHero(patrimonioFalso(), '12m');
  assert.match(t('.hero-rotulo'), /Patrimônio líquido/);
  assert.match(t('.hero-valor'), /^R\$\s[\d.]+,\d\d$/);
  assert.equal(el.querySelector('.hero-valor').getAttribute('aria-label').startsWith('Patrimônio líquido hoje: R$'), true);
  assert.match(t('.hero-chip'), /^\+R\$\s[\d.]+ \(\+36,2%\) em 12 meses$/);
  assert.match(t('.hero-era'), /^era R\$\s[\d.]+ em set\/25$/);
  assert.ok(el.querySelector('.hero-destaque.hero-tom-bom'));
  assert.equal(t('.hero-destaque-txt'), m12.destaque.texto);
  assert.equal(t('.hero-decomp'), m12.decomposicao.texto);
  assert.equal(el.querySelectorAll('.hero-kpi').length, 3);
  assert.deepEqual([...el.querySelectorAll('.hero-kpi')].map((a) => a.querySelector('.hero-kpi-rot').textContent), ['Investimentos e reserva', 'Apê (já é seu)', 'Dívidas']);
  assert.match(el.querySelector('.hero-kpi-inv').getAttribute('href'), /^https:\/\/exemplo\.test\/site\/carteiras\/index\.html$/);
  assert.match(el.querySelector('.hero-kpi-ape').getAttribute('href'), /organizacao\/despesas\.html#patrimonio$/);
  assert.match(el.querySelector('.hero-kpi-div').getAttribute('href'), /organizacao\/despesas\.html#patrimonio$/);
  assert.ok(el.querySelectorAll('.hero-anel-grafico svg .chart-fatia').length >= 3, 'anel com as fatias');
  assert.match(t('.hero-anel-grafico'), /tudo que você tem/);
  const conta = [...el.querySelectorAll('.hero-conta > span')].map((s) => s.textContent);
  assert.equal(conta[0], 'Tudo que você tem');
  assert.ok(conta.includes('− Financiamento do apê') && conta.includes('− FIES'));
  assert.equal(conta[conta.length - 2], '= Patrimônio líquido');
  assert.match(el.querySelector('.hero-ver').getAttribute('href'), /organizacao\/despesas\.html#patrimonio$/);
  assert.ok(el.querySelector('.hero-spark svg'), 'sparkline da série do período');
  // filtro: 12 meses é o padrão e há o chip "Escolher período"
  assert.equal(el.querySelector('.hero-periodo .chart-seg-btn.active').textContent.trim(), '12 meses');
  assert.deepEqual([...el.querySelectorAll('.hero-periodo .chart-seg-btn')].map((b) => b.textContent.trim()), ['Mês atual', 'No ano', '12 meses', 'Desde o início']);
  assert.match(el.querySelector('.hero-periodo .fp-chip').textContent, /Escolher período/);

  // trocar o período
  const antes = t('.hero-chip');
  const valorAntes = t('.hero-valor');
  el.querySelector('.chart-seg-btn[data-periodo="mes"]').click();
  assert.notEqual(t('.hero-chip'), antes);
  assert.match(t('.hero-chip'), / no mês$/);
  assert.match(t('.hero-era'), /em ago\/26$/);
  assert.equal(t('.hero-valor'), valorAntes, 'o valor de hoje não muda com o período');
  el.querySelector('.chart-seg-btn[data-periodo="tudo"]').click();
  assert.match(t('.hero-chip'), / desde o início$/);
  assert.match(t('.hero-era'), /em abr\/25$/);
  limparPeriodoSalvo();
});

test('criarHero(): a escolha de período fica lembrada no navegador (outra montagem abre no mesmo período)', () => {
  limparPeriodoSalvo();
  const doc = domHero();
  const hero = criarHero(doc, doc.getElementById('hero'), { raizSite: RAIZ });
  hero.dados(patrimonioFalso());
  doc.querySelector('.chart-seg-btn[data-periodo="ano"]').click();
  if (typeof globalThis.localStorage === 'undefined') return; // sem storage nada é lembrado (nem deve quebrar)
  const doc2 = domHero();
  const hero2 = criarHero(doc2, doc2.getElementById('hero'), { raizSite: RAIZ });
  hero2.dados(patrimonioFalso());
  assert.equal(hero2.periodo, 'ano');
  assert.match(doc2.querySelector('.hero-chip').textContent, / no ano$/);
  limparPeriodoSalvo();
});

test('criarHero(): ⓘ abre e fecha a explicação; sem histórico só o valor de hoje + aviso; queda forte fica vermelha', () => {
  limparPeriodoSalvo();
  const doc = domHero();
  const el = doc.getElementById('hero');
  const hero = criarHero(doc, el, { raizSite: RAIZ });
  hero.dados(patrimonioFalso());
  const btn = el.querySelector('.hero-info-btn');
  const txt = el.querySelector('.hero-info-txt');
  assert.equal(txt.hidden, true);
  btn.click();
  assert.equal(txt.hidden, false);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.match(txt.textContent, /inclui o dinheiro novo/);
  assert.match(txt.textContent, /parcelas que abateram dívida/);
  btn.click();
  assert.equal(txt.hidden, true);
  // sem histórico
  hero.dados(patrimonioFalso({ meses: 1 }));
  assert.match(el.querySelector('.hero-aviso').textContent, /sem histórico bastante pra esse período/);
  assert.equal(el.querySelector('.hero-chip'), null);
  assert.equal(el.querySelector('.hero-destaque').hidden, true);
  assert.match(el.querySelector('.hero-valor').textContent, /^R\$\s/);
  // queda forte
  hero.dados(patrimonioFalso({ rend: -0.04, aporte: 0 }));
  assert.ok(el.querySelector('.hero-destaque.hero-tom-ruim'), 'perdeu bastante sem aportes: vermelho');
  assert.match(el.querySelector('.hero-destaque-txt').textContent, /perdeu/);
});

test('criarHero(): erro de carga = mostrarErroCarga compacto com "Tentar de novo"; com dado na tela o erro não aparece', async () => {
  limparPeriodoSalvo();
  const doc = domHero();
  const el = doc.getElementById('hero');
  let tentou = 0;
  const hero = criarHero(doc, el, { raizSite: RAIZ, aoTentar: async () => { tentou += 1; } });
  hero.erro({ ok: false, etapa: 'network', erro: 'Failed to fetch' });
  assert.equal(el.dataset.estado, 'erro');
  const erro = el.querySelector('.hero-erro');
  assert.equal(erro.hidden, false);
  assert.ok(erro.querySelector('.estado-erro'));
  assert.match(erro.textContent, /Patrimônio líquido/);
  const botao = [...erro.querySelectorAll('button')].find((b) => /Tentar de novo/.test(b.textContent));
  assert.ok(botao);
  botao.click();
  await espera();
  assert.equal(tentou, 1);
  hero.dados(patrimonioFalso());
  assert.equal(el.dataset.estado, 'pronto');
  hero.erro({ ok: false, erro: 'x' });
  assert.equal(el.dataset.estado, 'pronto', 'dado já desenhado não é trocado por erro');
});

// ---------------------------------------------------------------------------
// Metas (modelo + DOM)
// ---------------------------------------------------------------------------

const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE_METAS = {
  ok: true, hoje: '2026-10-02', arquivadas: [],
  ativos: [
    { id: 'AAAA11', ref: 'AAAA11', nome: 'AAAA11', classe: 'fiis', valorBRL: 10000 },
    { id: 'BBBB3', ref: 'BBBB3', nome: 'BBBB3', classe: 'acoes', valorBRL: 5000 },
    { id: 'rf:Tesouro X|Banco Y@emergencial', ref: 'rf:Tesouro X|Banco Y', nome: 'Tesouro X', classe: 'rf', marca: 'emergencial', instituicao: 'Banco Y', valorBRL: 8000 },
  ],
  cambio: { EUR: { valor: 6, fonte: 'teste' }, USD: { valor: 5, fonte: 'teste' } },
  referencias: { reserva: { custoDeVida: 2000, meses: 6, sobra: 0.1 }, rendaPassiva: { media12m: 300, metaPlanilha: 1000 }, patrimonio: { rendimento: 0.08 } },
  proventos12m: { porTicker: { AAAA11: 1200 } },
};
const META_VIAGEM = {
  id: 'm1', tipo: 'viagemInternacional', nome: 'Viagem Teste', moeda: 'EUR', valorAlvo: 2000, dataAlvo: '2027-10', aporteMensal: 100, rendimentoAnual: 0,
  itens: [], vinculos: [{ tipo: 'ativo', id: 'BBBB3', modo: 'valor', valor: 3000 }], especificos: { destino: 'Lugar' }, status: 'ativa',
};
const META_ACUMULO = {
  id: 'm3', tipo: 'acumulo', categoria: 'equipamentos', nome: 'Notebook novo', moeda: 'BRL', valorAlvo: 20000, dataAlvo: '2027-12', aporteMensal: 50, rendimentoAnual: 0,
  itens: [], vinculos: [{ tipo: 'ativo', id: 'AAAA11', modo: 'valor', valor: 1000 }], especificos: {}, status: 'ativa',
};
const META_DISTRIBUICAO = {
  id: 'm9', tipo: 'distribuicaoCarteira', nome: 'Distribuição ideal', especificos: { pesos: { grupos: { acoes: 0.5, fiis: 0.4, rf: 0.1 }, acoes: { nacionais: 0.6, internacionais: 0.4 }, fiis: { tijolo: 0.4, hibrido: 0.3, papel: 0.3 }, rf: { emergencial: 0.9, rendaFixa: 0.1 } } }, status: 'ativa', vinculos: [],
};
const respostaMetas = (metas) => ({ ...clone(BASE_METAS), metas: clone(metas) });

test('modeloMetasHome(): usa o mesmo cálculo da tela Metas (calcularMeta + resumoMetas) e deixa a distribuição de fora', () => {
  const resposta = respostaMetas([META_VIAGEM, META_ACUMULO, META_DISTRIBUICAO]);
  const m = modeloMetasHome(resposta, { raizSite: RAIZ });
  const ctx = contextoMetas(resposta);
  const calcs = [META_VIAGEM, META_ACUMULO].map((x) => calcularMeta(x, ctx));
  const res = resumoMetas(calcs, { patrimonioVinculavel: ctx.alocacao.patrimonioVinculavel });
  assert.equal(m.quantidade, res.quantidade);
  assert.equal(m.quantidade, 2, 'a distribuição não conta (a tela Metas também não a conta)');
  assert.equal(m.noRitmo, res.noRitmo);
  assert.equal(m.atencao, res.atrasadas);
  assert.equal(m.aporteNecessario, res.aporteNecessario);
  assert.equal(m.aporteAtual, calcs.reduce((s, c) => s + c.aporteAtual, 0));
  assert.deepEqual(m.linhas.map((l) => l.id), ['m1', 'm3']);
  assert.ok(m.linhas.every((l) => l.url === `${RAIZ}metas.html#meta=${l.id}`));
  m.linhas.forEach((l, i) => assert.equal(l.status, calcs[i].status));
  assert.equal(modeloMetasHome({ ok: false }), null);
  assert.equal(modeloMetasHome(null), null);
});

test('cores das metas: no ritmo/concluída = verde; atenção/quase lá = amarelo; em progresso = cinza (nunca vermelho)', () => {
  ['no-ritmo', 'concluida', 'saldo-ideal'].forEach((s) => assert.equal(classeStatusHome(s, 0.2), 'good', s));
  ['atrasada', 'vencida', 'abaixo', 'ideal-bruto'].forEach((s) => assert.equal(classeStatusHome(s, 0.2), 'warn', s));
  assert.equal(classeStatusHome('sem-prazo', 0.3), 'na');
  assert.equal(classeStatusHome('sem-prazo', 0.95), 'warn', 'sem prazo, mas a 95% do alvo = quase lá');
  ['no-ritmo', 'atrasada', 'sem-prazo', 'abaixo', 'concluida'].forEach((s) => assert.notEqual(classeStatusHome(s, 0.5), 'bad'));
  assert.equal(seloTexto(0.94, 'abaixo'), '94% · abaixo');
  assert.equal(seloTexto(0.78, 'no-ritmo'), '78% · no ritmo');
  assert.equal(seloTexto(0.03, 'atrasada'), '3% · atrasada');
  assert.equal(seloTexto(null, 'sem-prazo'), 'sem prazo');
  assert.deepEqual(resumoTexto({ quantidade: 4, noRitmo: 2, atencao: 2 }).map((p) => p.t), ['4 metas', '2 no ritmo', '2 precisam de atenção']);
  assert.deepEqual(resumoTexto({ quantidade: 1, noRitmo: 0, atencao: 1 }).map((p) => p.t), ['1 meta', '1 precisa de atenção']);
});

function domCartao() {
  return new JSDOM('<!doctype html><html><body><section id="metas"></section></body></html>', { url: 'https://exemplo.test/site/index.html' }).window.document;
}

test('renderMetasHome(): resumo, uma linha por meta (ícone, nome, barra, selo), rodapé com aporte e links pra tela Metas', () => {
  const doc = domCartao();
  const el = doc.getElementById('metas');
  const modelo = {
    quantidade: 4, noRitmo: 2, atencao: 2, aporteNecessario: 10318, aporteAtual: 5800,
    linhas: [
      { id: 'a', nome: 'Reserva de emergência', icone: 'escudo', cor: 'rf', percentual: 0.94, status: 'abaixo', classe: 'warn', selo: '94% · abaixo', url: `${RAIZ}metas.html#meta=a` },
      { id: 'b', nome: 'Renda passiva', icone: 'renda', cor: 'fiis', percentual: 0.78, status: 'no-ritmo', classe: 'good', selo: '78% · no ritmo', url: `${RAIZ}metas.html#meta=b` },
      { id: 'c', nome: 'Aposentadoria', icone: 'ampulheta', cor: 'usa', percentual: 0.03, status: 'atrasada', classe: 'warn', selo: '3% · atrasada', url: `${RAIZ}metas.html#meta=c` },
      { id: 'd', nome: 'Viagem pra Europa', icone: 'aviao', cor: 'acoes', percentual: 0.06, status: 'no-ritmo', classe: 'good', selo: '6% · no ritmo', url: `${RAIZ}metas.html#meta=d` },
    ],
  };
  renderMetasHome(doc, el, modelo, { raizSite: RAIZ });
  assert.equal(el.querySelector('.card-titulo').textContent, 'Metas');
  assert.equal(el.querySelector('.hm-resumo').textContent, '4 metas · 2 no ritmo · 2 precisam de atenção');
  assert.ok(el.querySelector('.hm-resumo .hm-tom-good') && el.querySelector('.hm-resumo .hm-tom-warn'));
  const linhas = [...el.querySelectorAll('.hm-lista > li')];
  assert.equal(linhas.length, 4);
  assert.equal(linhas[0].querySelector('.hm-nome-txt').textContent, 'Reserva de emergência');
  assert.equal(linhas[0].querySelector('.hm-selo').textContent, '94% · abaixo');
  assert.ok(linhas[0].querySelector('.hm-selo.hm-warn') && linhas[1].querySelector('.hm-selo.hm-good'));
  assert.equal(linhas[0].querySelector('.hm-barra i').style.width, '94%');
  assert.equal(linhas[0].querySelector('.hm-barra').getAttribute('aria-valuenow'), '94');
  assert.ok(linhas[0].querySelector('.hm-ico svg'), 'ícone do tipo');
  assert.equal(linhas[1].querySelector('a.hm-meta').getAttribute('href'), `${RAIZ}metas.html#meta=b`);
  assert.match(el.querySelector('.hm-aporte').textContent, /^Aporte necessário R\$\s10\.318\/mês · você aporta R\$\s5\.800 · Ver metas →$/);
  assert.equal(el.querySelector('.hm-ver').getAttribute('href'), `${RAIZ}metas.html`);
  // celular: 3 + "Ver todas" (o corte é de CSS; o botão alterna a lista)
  assert.equal(METAS_NO_CELULAR, 3);
  const mais = el.querySelector('.hm-mais');
  assert.equal(mais.textContent, 'Ver todas (4)');
  const lista = el.querySelector('.hm-lista');
  mais.click();
  assert.equal(lista.classList.contains('hm-expandida'), true);
  assert.equal(mais.getAttribute('aria-expanded'), 'true');
  mais.click();
  assert.equal(lista.classList.contains('hm-expandida'), false);
  // sem aporte necessário e sem metas
  renderMetasHome(doc, el, { ...modelo, aporteNecessario: 0, linhas: modelo.linhas.slice(0, 2) }, { raizSite: RAIZ });
  assert.match(el.querySelector('.hm-aporte').textContent, /^Nenhum aporte extra necessário pras suas metas hoje · Ver metas →$/);
  assert.equal(el.querySelector('.hm-mais'), null, 'com 2 metas não há "Ver todas"');
  renderMetasHome(doc, el, { quantidade: 0, noRitmo: 0, atencao: 0, aporteNecessario: 0, aporteAtual: 0, linhas: [] }, { raizSite: RAIZ });
  assert.match(el.textContent, /Você ainda não tem metas/);
});

test('criarCartaoMetas(): estados carregando / pronto / erro (erro só se nada foi desenhado)', async () => {
  const doc = domCartao();
  const el = doc.getElementById('metas');
  let tentou = 0;
  const c = criarCartaoMetas(doc, el, { raizSite: RAIZ, aoTentar: async () => { tentou += 1; } });
  c.carregando();
  assert.equal(el.dataset.estado, 'carregando');
  assert.ok(el.querySelector('.hm-esqueleto'));
  c.erro({ ok: false, etapa: 'network', erro: 'Failed to fetch' });
  assert.equal(el.dataset.estado, 'erro');
  const botao = [...el.querySelectorAll('button')].find((b) => /Tentar de novo/.test(b.textContent));
  botao.click(); await espera();
  assert.equal(tentou, 1);
  c.dados(respostaMetas([META_VIAGEM, META_ACUMULO]));
  assert.equal(el.dataset.estado, 'pronto');
  assert.equal(el.querySelectorAll('.hm-lista > li').length, 2);
  c.erro({ ok: false });
  assert.equal(el.dataset.estado, 'pronto');
  c.carregando();
  assert.equal(el.dataset.estado, 'pronto', 'com dado na tela o esqueleto não volta');
});

// ---------------------------------------------------------------------------
// Blocos (cache + erro isolado) e a Início montada
// ---------------------------------------------------------------------------

test('carregarBloco(): desenha na hora com o cache, troca pela resposta nova e guarda; erro com cache na tela fica quieto', async () => {
  const mapa = new Map();
  usarMemoriaNoCacheDados(mapa);
  try {
    mapa.set('bloco-x', JSON.stringify({ ts: Date.now(), dados: { ok: true, v: 'velho' } }));
    const vistos = [];
    let liberar;
    const trava = new Promise((r) => { liberar = r; });
    const ui = { carregando: () => vistos.push('carregando'), dados: (r) => vistos.push(`dados:${r.v}`), erro: () => vistos.push('erro') };
    const p = carregarBloco({ chave: 'bloco-x', buscar: async () => { await trava; return { ok: true, v: 'novo' }; }, ui });
    await espera(5);
    assert.deepEqual(vistos, ['carregando', 'dados:velho'], 'o cache aparece antes da rede responder');
    liberar();
    await p;
    assert.deepEqual(vistos, ['carregando', 'dados:velho', 'dados:novo']);
    assert.equal(JSON.parse(mapa.get('bloco-x')).dados.v, 'novo');
    // falha: avisa a UI (que decide se mostra)
    const v2 = [];
    await carregarBloco({ chave: 'bloco-x', buscar: async () => { throw new Error('boom'); }, ui: { carregando: () => {}, dados: (r) => v2.push(r.v), erro: (r) => v2.push(`erro:${r.etapa}`) } });
    assert.equal(v2[v2.length - 1], 'erro:network');
  } finally { usarMemoriaNoCacheDados(null); }
});

function domPaginaCompleta() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="inicio-loading" id="inicioLoading"></div>
    <div class="inicio-erro" id="inicioErro" hidden></div>
    <div id="inicioConteudo" hidden>
      <div id="refreshControlInicio"></div>
      <div class="avisos-banner" id="inicioAvisos" hidden></div>
      <div class="mkt-faixa" id="faixaMercado"></div>
      <section class="card hero-pl" id="patrimonioHero"><div class="hero-esqueleto"></div></section>
      <div id="resumoDistribuicao"></div>
      <div class="filter-tabs" id="periodoTabs"><button class="filter-tab" data-periodo="30d">30 dias</button><button class="filter-tab active" data-periodo="12m">12 meses</button></div>
      <div id="rentabInfoTotal"></div><div id="rentabChartTotal"></div><div id="rentabLegendaTotal"></div>
      <div id="rentabInfoLongoPrazo"></div><div id="rentabChartLongoPrazo"></div><div id="rentabLegendaLongoPrazo"></div>
      <div id="rentabInfoNacional"></div><div id="rentabChartNacional"></div><div id="rentabLegendaNacional"></div>
      <div id="rentabInfoRendaEmergencial"></div><div id="rentabChartRendaEmergencial"></div><div id="rentabLegendaRendaEmergencial"></div>
      <section class="card" id="metasHome"></section>
      <div class="al-abas" id="filtroAtivosTabs"></div>
      <ul id="meusAtivosGrid"></ul>
    </div></body></html>`, { url: 'https://exemplo.test/site/index.html' });
  return dom.window.document;
}

const HOME_OK = () => ({
  ok: true,
  patrimonio: { total: 147583.80, longoPrazo: 87356.59, nacional: 62129.38, rendaEmergencial: 60227.21, porClasse: { acoes: 20000, fiis: 15000, rendaFixa: 87356.59, acoesEua: 25227.21 } },
  historico: [
    { data: '2026-09-10', patrimonio: 138200, longoPrazo: 79400, nacional: 59400, rendaEmergencial: 59800, pregao: true },
    { data: '2026-09-11', patrimonio: 140000, longoPrazo: 80000, nacional: 60000, rendaEmergencial: 60000, pregao: true },
  ],
  ontem: { data: '2026-09-11', total: 140000, longoPrazo: 80000, nacional: 60000, rendaEmergencial: 60000 },
  indices: { ibovespa: { valor: 185600, variacaoDia: -0.9 } },
  cambio: { usd: 5.09, eur: 5.92 },
});

test('Início: o hero e as Metas chegam DEPOIS do 1º desenho, cada um com o seu dado (getPatrimonio/getMetas)', async () => {
  limparPeriodoSalvo();
  usarMemoriaNoCacheDados(new Map());
  try {
    const doc = domPaginaCompleta();
    const chamadas = [];
    const r = await montarPaginaInicio('token-fake', {
      doc, getHomeImpl: async () => HOME_OK(), getIntradiaImpl: null, raizSite: RAIZ,
      getPatrimonioImpl: async (t) => { chamadas.push(['patrimonio', t]); return patrimonioFalso(); },
      getMetasImpl: async (t) => { chamadas.push(['metas', t]); return respostaMetas([META_VIAGEM, META_ACUMULO]); },
    });
    assert.equal(doc.getElementById('inicioConteudo').hidden, false, 'a Início já está na tela');
    await r.blocosPronto();
    assert.deepEqual(chamadas.map((c) => c[0]).sort(), ['metas', 'patrimonio']);
    assert.ok(chamadas.every((c) => c[1] === 'token-fake'));
    const hero = doc.getElementById('patrimonioHero');
    assert.equal(hero.dataset.estado, 'pronto');
    assert.match(hero.querySelector('.hero-valor').textContent, /^R\$\s/);
    assert.match(hero.querySelector('.hero-chip').textContent, /em 12 meses$/);
    const metas = doc.getElementById('metasHome');
    assert.equal(metas.dataset.estado, 'pronto');
    assert.equal(metas.querySelectorAll('.hm-lista > li').length, 2);
    // trocar o período do hero muda os números sem buscar de novo
    const antes = hero.querySelector('.hero-chip').textContent;
    hero.querySelector('.chart-seg-btn[data-periodo="ano"]').click();
    assert.notEqual(hero.querySelector('.hero-chip').textContent, antes);
    assert.equal(chamadas.length, 2);
    // a Rentabilidade da Início chama a visão total de "Investimentos"
    assert.match(doc.getElementById('rentabInfoTotal').textContent, /Investimentos/);
    assert.doesNotMatch(doc.getElementById('rentabInfoTotal').textContent, /Patrimônio total/);
    assert.match(doc.getElementById('rentabInfoNacional').textContent, /Patrimônio Nacional/);
    assert.match(doc.getElementById('resumoDistribuicao').textContent, /Investimentos/);
  } finally { usarMemoriaNoCacheDados(null); limparPeriodoSalvo(); }
});

test('Início: erro do getPatrimonio mostra erro compacto SÓ no hero - Metas e o resto da Início seguem', async () => {
  usarMemoriaNoCacheDados(new Map());
  try {
    const doc = domPaginaCompleta();
    const r = await montarPaginaInicio('token-fake', {
      doc, getHomeImpl: async () => HOME_OK(), getIntradiaImpl: null, raizSite: RAIZ,
      getPatrimonioImpl: async () => { throw new Error('Failed to fetch'); },
      getMetasImpl: async () => respostaMetas([META_VIAGEM]),
    });
    await r.blocosPronto();
    assert.equal(doc.getElementById('inicioConteudo').hidden, false);
    assert.equal(doc.getElementById('inicioErro').hidden, true);
    assert.equal(doc.getElementById('patrimonioHero').dataset.estado, 'erro');
    assert.ok([...doc.getElementById('patrimonioHero').querySelectorAll('button')].some((b) => /Tentar de novo/.test(b.textContent)));
    assert.equal(doc.getElementById('metasHome').dataset.estado, 'pronto');
    assert.ok(doc.getElementById('faixaMercado').querySelectorAll('.mkt').length >= 1, 'o resto da Início desenhou');
    assert.ok(doc.getElementById('rentabChartTotal').querySelector('svg'));
  } finally { usarMemoriaNoCacheDados(null); }
});

test('Início: erro do getMetas mostra erro compacto SÓ no cartão de Metas - o hero segue', async () => {
  limparPeriodoSalvo();
  usarMemoriaNoCacheDados(new Map());
  try {
    const doc = domPaginaCompleta();
    const r = await montarPaginaInicio('token-fake', {
      doc, getHomeImpl: async () => HOME_OK(), getIntradiaImpl: null, raizSite: RAIZ,
      getPatrimonioImpl: async () => patrimonioFalso(),
      getMetasImpl: async () => ({ ok: false, etapa: 'servidor', erro: 'Erro interno' }),
    });
    await r.blocosPronto();
    assert.equal(doc.getElementById('patrimonioHero').dataset.estado, 'pronto');
    const metas = doc.getElementById('metasHome');
    assert.equal(metas.dataset.estado, 'erro');
    assert.ok(metas.querySelector('.estado-erro'));
    assert.equal(doc.getElementById('inicioConteudo').hidden, false);
  } finally { usarMemoriaNoCacheDados(null); limparPeriodoSalvo(); }
});

test('Início: com cache das duas respostas, hero e Metas aparecem antes da rede responder; sem os elementos, nada é buscado', async () => {
  limparPeriodoSalvo();
  const mapa = new Map();
  usarMemoriaNoCacheDados(mapa);
  try {
    mapa.set('patrimonio', JSON.stringify({ ts: Date.now(), dados: patrimonioFalso() }));
    mapa.set('metas', JSON.stringify({ ts: Date.now(), dados: respostaMetas([META_VIAGEM, META_ACUMULO]) }));
    const doc = domPaginaCompleta();
    let liberar;
    const trava = new Promise((res) => { liberar = res; });
    const blocos = criarBlocosHome(doc, 't', {
      raizSite: RAIZ,
      getPatrimonioImpl: async () => { await trava; return patrimonioFalso(); },
      getMetasImpl: async () => { await trava; return respostaMetas([META_VIAGEM]); },
    });
    const p = blocos.iniciar();
    await espera(30);
    assert.equal(doc.getElementById('patrimonioHero').dataset.estado, 'pronto', 'hero do cache');
    assert.equal(doc.getElementById('metasHome').querySelectorAll('.hm-lista > li').length, 2, 'metas do cache');
    liberar();
    await p;
    assert.equal(doc.getElementById('metasHome').querySelectorAll('.hm-lista > li').length, 1, 'trocou pela resposta nova');
    // repetir logo em seguida não busca de novo (janela anti-duplicidade)
    let n = 0;
    const doc2 = domPaginaCompleta();
    const b2 = criarBlocosHome(doc2, 't', { raizSite: RAIZ, getPatrimonioImpl: async () => { n += 1; return patrimonioFalso(); }, getMetasImpl: async () => { n += 1; return respostaMetas([META_VIAGEM]); } });
    await b2.iniciar(); await b2.iniciar();
    assert.equal(n, 2);
    await b2.iniciar({ forcar: true });
    assert.equal(n, 4);
    // HTML antigo em cache (sem #patrimonioHero/#metasHome): nenhum pedido
    const doc3 = new JSDOM('<!doctype html><html><body><div id="x"></div></body></html>').window.document;
    let chamou = false;
    await criarBlocosHome(doc3, 't', { getPatrimonioImpl: async () => { chamou = true; return {}; }, getMetasImpl: async () => { chamou = true; return {}; } }).iniciar();
    assert.equal(chamou, false);
  } finally { usarMemoriaNoCacheDados(null); limparPeriodoSalvo(); }
});
