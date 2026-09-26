// tests/salario.test.js
//
// 26/09/2026: aba "Salário e investimentos" da Organização Financeira -
// leitura do holerite (holerite.js), contas (salario-calc.js) e a aba montada
// num DOM de verdade (organizacao-salario.js). Tudo inventado: empresa,
// verbas e valores fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { lerHolerite, numBR } from '../assets/js/pages/holerite.js';
import {
  valorDoMes, metaMensal, mediaInvestida, mesesAteAlvo, trajetoria, ultimoHolerite, orcamentoSalario, extrasDoAno, historicoSalario,
} from '../assets/js/pages/salario-calc.js';

const perto = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

// holerite fictício, no mesmo formato de linhas que o pdf.js devolve
const LINHAS = [
  'Demonstrativo de Pagamento',
  'Data de Crédito: 05/03/2026',
  'REFERENTE A FEVEREIRO DE 2026',
  'EMPRESA EXEMPLO LTDA  C.N.P.J.: 00.000.000/0001-00',
  'BANCO:  000-Banco Teste  AGÊNCIA:  0000  CONTA CORRENTE:  00000-0',
  'CÓDIGO  DESCRIÇÃO  QUANTIDADE  VENCIMENTOS  DESCONTOS  OUTROS',
  '1  Salário  30  10.000,00  0,00  0,00',
  '50  Vale Cultura  0  100,00  0,00  0,00',
  '239  Imposto de Renda  27,50  0,00  1.500,00  0,00',
  '270  Inss  11,65  0,00  900,00  0,00',
  '300  Plano de Saude  0  0,00  250,00  0,00',
  '1680  INSS - Alíq. Progressiva 7,5%  7,50  0,00  0,00  100,00',
  'Data.: _____  TOTAL DE VENCIMENTOS: R$ 10.100,00  TOTAL DE DESCONTOS: R$ 2.650,00',
  'RECEBI O VALOR LIQUIDO AO LADO  VALOR LÍQUIDO: R$ 7.450,00',
  'SALÁRIO  SAL.CONTR.  BASE CÁLCULO  FGTS DO MÊS  BASE CÁLCULO I.R.R.F  BASE I.R.R.F. PLR  FAIXA I.R.R.F',
  'I.N.S.S.  FGTS',
  '10.000,00  8.000,00  10.000,00  800,00  9.100,00  0,00  0,00',
];

test('lerHolerite(): mês, crédito, verbas, totais, FGTS; INSS "progressiva" (coluna Outros) não conta como desconto', () => {
  const h = lerHolerite(LINHAS);
  assert.equal(h.mes, '2026-02');
  assert.equal(h.tipo, 'Mensal');
  assert.equal(h.dataCredito, '2026-03-05');
  assert.equal(h.salarioBase, 10000);
  assert.equal(h.outrosVencimentos, 100);
  assert.equal(h.inss, 900);
  assert.equal(h.irrf, 1500);
  assert.equal(h.outrosDescontos, 250);
  assert.equal(h.totalVencimentos, 10100);
  assert.equal(h.totalDescontos, 2650);
  assert.equal(h.liquido, 7450);
  assert.equal(h.fgts, 800);
  assert.equal(h.baseIrrf, 9100);
  assert.equal(h.itens.length, 6);
  assert.deepEqual(h.itens[2], { codigo: '239', descricao: 'Imposto de Renda', quantidade: 27.5, vencimento: 0, desconto: 1500, outros: 0 });
  assert.deepEqual(h.avisos, []);
  assert.equal(JSON.stringify(h).includes('Banco Teste'), false, 'dado bancário não entra');
  // mesmo texto com colunas por espaços (pdftotext) também serve
  assert.equal(lerHolerite(LINHAS.join('\n').replace(/ {2}/g, '      ')).liquido, 7450);
});

test('lerHolerite(): tipo pelo cabeçalho (13º, férias, PLR) e avisos quando não confere', () => {
  assert.equal(lerHolerite(['REFERENTE A 13 SALARIO - 1A PARCELA NOVEMBRO DE 2026']).tipo, '13º (1ª parcela)');
  assert.equal(lerHolerite(['REFERENTE A FÉRIAS JANEIRO DE 2027']).tipo, 'Férias');
  assert.equal(lerHolerite(['REFERENTE A PLR MARCO DE 2026']).tipo, 'PLR');
  const ruim = lerHolerite([...LINHAS.slice(0, 13), 'VALOR LÍQUIDO: R$ 7.000,00']);
  assert.ok(ruim.avisos.some((a) => /não bate com o líquido/.test(a)));
  const vazio = lerHolerite('texto qualquer');
  assert.ok(vazio.avisos.length >= 3);
  assert.equal(numBR('1.234,56'), 1234.56);
});

const MENSAL = [
  { mes: '2026-01', total: 3000, longoPrazo: 2500, reserva: 500, proventos: 200 },
  { mes: '2026-02', total: 1000, longoPrazo: 1000, reserva: 0, proventos: 250 },
  { mes: '2026-03', total: -4000, longoPrazo: 1000, reserva: -5000, proventos: 300 },
  { mes: '2026-04', total: 2000, longoPrazo: 2000, reserva: 0, proventos: 100, parcial: true },
];
const BASE = { liquido: 10000, percentualInvestir: 0.2, aporteMeta: 2000 };

test('salario-calc: valor do mês (tudo/longo prazo, com/sem proventos), média só de meses fechados e contra a meta', () => {
  assert.equal(valorDoMes(MENSAL[0]), 3000);
  assert.equal(valorDoMes(MENSAL[0], { base: 'longoPrazo', descontarProventos: true }), 2300);
  assert.equal(metaMensal(BASE), 2000);
  const m = mediaInvestida(MENSAL, { janela: 12, meta: 2000, liquido: 10000 });
  assert.equal(m.n, 3, 'abril (parcial) fica fora');
  assert.equal(m.media, 0);
  assert.equal(m.acima, 1);
  assert.equal(m.mesAtual.valor, 2000);
  const lp = mediaInvestida(MENSAL, { base: 'longoPrazo', descontarProventos: true, meta: 2000, liquido: 10000 });
  assert.ok(perto(lp.media, (2300 + 750 + 700) / 3));
  assert.ok(perto(lp.pctDaMeta, lp.media / 2000));
  assert.ok(perto(lp.taxaPoupanca, lp.media / 10000));
  assert.equal(lp.maior.mes, '2026-01');
  assert.equal(mediaInvestida(MENSAL, { janela: 2 }).n, 2);
  assert.equal(mediaInvestida([], {}).media, null);
});

test('salario-calc: meses até o alvo e trajetória (juros mensais equivalentes ao anual)', () => {
  assert.equal(mesesAteAlvo({ atual: 100, alvo: 50, rendimentoAnual: 0.06, aporte: 0 }), 0);
  assert.equal(mesesAteAlvo({ atual: 0, alvo: 1200, rendimentoAnual: 0, aporte: 100 }), 12);
  assert.equal(mesesAteAlvo({ atual: 100, alvo: 1000, rendimentoAnual: 0, aporte: 0 }), null);
  // 1000 a 12% a.a. sem aporte dobra em ~6,1 anos
  const m = mesesAteAlvo({ atual: 1000, alvo: 2000, rendimentoAnual: 0.12, aporte: 0 });
  assert.ok(m >= 72 && m <= 74, String(m));
  const t = trajetoria({ atual: 1000, alvo: 2000, rendimentoAnual: 0.12, aporte: 0 }, 40);
  assert.ok(perto(t[1].valor, 1120, 0.01));
  assert.ok(t[t.length - 1].valor >= 2000);
});

const PAGS = [
  { mes: '2026-02', tipo: 'Mensal', status: 'Recebido', salarioBase: 10000, outrosVencimentos: 100, totalVencimentos: 10100, inss: 900, irrf: 1500, outrosDescontos: 250, liquido: 7450, fgts: 800 },
  { mes: '2026-01', tipo: 'Mensal', status: 'Recebido', salarioBase: 9500, totalVencimentos: 9500, inss: 850, irrf: 1400, liquido: 7250, fgts: 760 },
  { mes: '2026-12', tipo: '13º (2ª parcela)', status: 'Previsto', liquido: 3000, percentualInvestir: 0.5 },
];

test('salario-calc: último holerite, orçamento (do bruto e do líquido), extras do ano com estimativa e histórico', () => {
  assert.equal(ultimoHolerite(PAGS).mes, '2026-02');
  const o = orcamentoSalario({ holerite: ultimoHolerite(PAGS), base: BASE, despesasReal: 5000 });
  assert.ok(perto(o.bruto.aliquotaIR, 1500 / 10100));
  assert.ok(perto(o.bruto.aliquotaImpostos, 2400 / 10100));
  assert.equal(o.bruto.pacote, 10900);
  assert.equal(o.liquido.livre, 3000);
  assert.ok(perto(o.liquido.pctEssenciais, 0.5));

  const ex = extrasDoAno(PAGS, 2026, { holerite: ultimoHolerite(PAGS), percentualPadrao: 0.2 });
  const l1 = ex.linhas.find((l) => l.tipo === '13º (1ª parcela)');
  assert.equal(l1.estimativa, 5000);
  assert.equal(l1.mes, '2026-11');
  const l2 = ex.linhas.find((l) => l.tipo === '13º (2ª parcela)');
  assert.equal(l2.valor, 3000);
  assert.equal(l2.investir, 1500);
  assert.equal(l2.status, 'Previsto');
  assert.equal(ex.total, 3000);
  assert.equal(ex.totalInvestir, 1500);
  assert.deepEqual(historicoSalario(PAGS).map((h) => h.mes), ['2026-01', '2026-02']);
});

// --- aba montada ---------------------------------------------------------------

const RESPOSTA = {
  ok: true, hoje: '2026-04-15',
  base: BASE,
  patrimonio: { atual: 100000, desejado: 1000000, rendimento: 0.06, extra: 1000, reinvestimento: 0.25 },
  despesas: { totalReal: 5000, totalComFolga: 5500 },
  pagamentos: PAGS.slice(0, 1),
  mensal: MENSAL,
};

async function montarAba(extra = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="s"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html#salario', pretendToBeVisual: true });
  globalThis.localStorage = dom.window.localStorage;
  dom.window.localStorage.clear();
  const doc = dom.window.document;
  const { montarAbaSalario } = await import('../assets/js/pages/organizacao-salario.js');
  const chamadas = { base: [], pag: [], excluir: [] };
  let servidor = JSON.parse(JSON.stringify(RESPOSTA));
  const aba = montarAbaSalario({
    doc, el: doc.getElementById('s'), token: 'tk',
    getSalarioImpl: async () => JSON.parse(JSON.stringify(servidor)),
    salvarBaseImpl: async (_t, b) => { chamadas.base.push(b); servidor.base = { liquido: b.liquido, percentualInvestir: b.percentual, aporteMeta: b.liquido * b.percentual }; return { ok: true, base: servidor.base }; },
    salvarPagamentoImpl: async (_t, p, o) => { chamadas.pag.push({ p, o }); servidor = { ...servidor, pagamentos: [{ ...p, status: p.status || 'Recebido' }, ...servidor.pagamentos.filter((x) => !(x.mes === p.mes && x.tipo === p.tipo))] }; return { ...JSON.parse(JSON.stringify(servidor)), ok: true }; },
    excluirPagamentoImpl: async (_t, mes, tipo) => { chamadas.excluir.push([mes, tipo]); servidor = { ...servidor, pagamentos: servidor.pagamentos.filter((x) => !(x.mes === mes && x.tipo === tipo)) }; return { ...servidor, ok: true }; },
    carregarPdf: async () => ({}),
    lerPdf: async () => LINHAS,
    confirmar: () => true,
    ...extra,
  });
  await aba.pronto;
  return { dom, doc, w: dom.window, el: doc.getElementById('s'), chamadas, aba };
}
const txt = (el) => {
  const partes = [];
  const tw = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ').replace(/ (,\d{2})(?!\d)/g, '$1').replace(/ \/mês/g, '/mês');
};
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const esperar = () => new Promise((r) => setTimeout(r, 0));

test('Aba Salário: topo (líquido, meta, média vs meta), gráfico mês a mês, holerite, orçamento, projeção e extras', async () => {
  const { el } = await montarAba();
  const hero = el.querySelector('#slHero');
  assert.match(txt(hero), /R\$ 10\.000,00\/mês/);
  assert.match(txt(hero), /R\$ 2\.000,00\/mês/);
  assert.match(txt(hero), /Você investe em média .*R\$ 0,00\/mês/);
  assert.match(txt(hero), /holerite de fev\/26: R\$ 7\.450,00 · base acima em R\$ 2\.550,00/);
  assert.equal(el.querySelectorAll('#slGrafico .sl-bar.neg').length, 1, 'mês com resgate aparece pra baixo');
  assert.match(txt(el.querySelector('#slStats')), /Meses na meta 1 de 3/);
  assert.match(txt(el.querySelector('#slStats')), /Resgate da reserva em mar\/26/);
  assert.match(txt(el.querySelector('#slHolerite')), /= Líquido R\$ 7\.450,00/);
  assert.match(txt(el.querySelector('#slOrcamento')), /Livre R\$ 3\.000,00/);
  assert.match(txt(el.querySelector('#slProjecao')), /No seu ritmo/);
  assert.equal(el.querySelectorAll('#slExtras form.sl-extra').length, 5);
});

test('Aba Salário: alternar "Só longo prazo" / "Do bolso" / janela recalcula a média e lembra a escolha', async () => {
  const { el, w } = await montarAba();
  clique(w, el.querySelector('#slBaseTabs [data-base="longoPrazo"]'));
  clique(w, el.querySelector('#slProvTabs [data-desc="1"]'));
  assert.match(txt(el.querySelector('#slHero')), /R\$ 1\.250,00\/mês/);
  assert.equal(w.localStorage.getItem('salario.base'), 'longoPrazo');
  clique(w, el.querySelector('#slJanTabs [data-jan="6"]'));
  assert.equal(el.querySelector('#slJanTabs [data-jan="6"]').getAttribute('aria-pressed'), 'true');
});

test('Aba Salário: editar a base - % e R$ andam juntos; salvar grava líquido e fração', async () => {
  const { el, w, chamadas } = await montarAba();
  clique(w, el.querySelector('[data-acao="editar-base"]'));
  const f = el.querySelector('#slBaseForm');
  const digitar = (inp, v) => { inp.value = v; inp.dispatchEvent(new w.Event('input', { bubbles: true })); };
  digitar(f.querySelector('#slValor'), '2.500,00');
  assert.equal(f.querySelector('#slPct').value, '25,0');
  clique(w, f.querySelector('[data-acao="usar-holerite"]'));
  assert.equal(f.querySelector('#slLiquido').value, '7.450,00');
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar();
  assert.deepEqual(chamadas.base, [{ liquido: 7450, percentual: 0.25 }]);
  assert.equal(el.querySelector('#slBaseForm'), null, 'fecha depois de salvar');
  assert.match(txt(el.querySelector('#slHero')), /R\$ 7\.450,00\/mês/);
});

test('Aba Salário: importar holerite (PDF) abre a conferência já preenchida; salvar manda o pagamento e o "usar como base"', async () => {
  const { el, w, chamadas } = await montarAba({ getSalarioImpl: async () => ({ ...JSON.parse(JSON.stringify(RESPOSTA)), pagamentos: [] }) });
  const input = el.querySelector('#slArquivo');
  Object.defineProperty(input, 'files', { value: [{ name: 'holerite.pdf', arrayBuffer: async () => new ArrayBuffer(8) }] });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await esperar(); await esperar();
  const f = el.querySelector('#slPagForm');
  assert.ok(f, 'formulário de conferência');
  assert.equal(f.elements.mes.value, '2026-02');
  assert.equal(f.elements.liquido.value, '7.450,00');
  assert.match(txt(f), /Confere: R\$ 10\.100,00 − R\$ 2\.650,00 = R\$ 7\.450,00/);
  assert.equal(f.elements.usarComoBase.checked, true);
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar(); await esperar();
  assert.equal(chamadas.pag.length, 1);
  const { p, o } = chamadas.pag[0];
  assert.equal(p.mes, '2026-02');
  assert.equal(p.liquido, 7450);
  assert.equal(p.irrf, 1500);
  assert.equal(p.itens.length, 6);
  assert.deepEqual(o, { usarComoBase: true });
  assert.equal(el.querySelector('#slPagForm'), null);
});

test('Aba Salário: extra do ano salva como Previsto com o % a investir; excluir pagamento pede confirmação', async () => {
  const { el, w, chamadas } = await montarAba();
  const f = el.querySelector('#slExtras form.sl-extra[data-tipo="PLR"]');
  f.elements.mes.value = '2026-06';
  f.elements.valor.value = '8.000,00';
  f.elements.pct.value = '50';
  f.elements.pct.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.match(txt(f), /= R\$ 4\.000,00/);
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar();
  assert.deepEqual(chamadas.pag[0].p, { mes: '2026-06', tipo: 'PLR', status: 'Previsto', liquido: 8000, percentualInvestir: 0.5 });
  assert.match(txt(el.querySelector('#slExtras')), /PLR previsto/);

  clique(w, el.querySelector('.sl-pags li[data-tipo="Mensal"] [data-acao="excluir-pagamento"]'));
  await esperar();
  assert.deepEqual(chamadas.excluir, [['2026-02', 'Mensal']]);
});
