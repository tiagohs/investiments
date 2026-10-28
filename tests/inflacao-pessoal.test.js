// tests/inflacao-pessoal.test.js - 28/10/2026 (Tiago: "quero ainda o IPCA real lá, mas em paralelo, quero essa ideia do IPCA
// real" - a minha inflação). assets/js/inflacao-pessoal.js, InflacaoPessoal.gs e a seção da tela. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
  sugerirIndice, calcularMinhaInflacao, mesesAte, composto, taxaDoMes, ganhoReal, retornoMinimo, dolarEquilibrio, corrigir,
} from '../assets/js/inflacao-pessoal.js';
import { montarMinhaInflacao, linhasRendeDeVerdade, vereditoInflacao } from '../assets/js/pages/organizacao-inflacao.js';

const perto = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const MESES = mesesAte('2026-09', 14);
const serieConst = (t) => Object.fromEntries(MESES.map((m) => [m, t]));
const DADOS = {
  ok: true, ultimoMes: '2026-09',
  catalogo: [{ id: 'ipca', rotulo: 'IPCA (geral)' }, { id: 'fixo', rotulo: 'Fixo' }, { id: 'tr', rotulo: 'TR' }, { id: 'energia', rotulo: 'Energia' }, { id: 'alimentacaoCasa', rotulo: 'Supermercado' }],
  series: { ipca: serieConst(0.004), energia: serieConst(0.01), alimentacaoCasa: serieConst(0.002), tr: serieConst(0.001) },
  cesta: {
    itens: [
      { nome: 'Parcela do Apartamento', valor: 2000, frequencia: 'Mensal', categoria: 'Moradia' },
      { nome: 'Empréstimo', valor: 500, frequencia: 'Mensal', categoria: 'Dívidas e parcelas' },
      { nome: 'Luz', valor: 300, frequencia: 'Mensal', categoria: 'Contas da casa' },
      { nome: 'Supermercado', valor: 1200, frequencia: 'Mensal', categoria: 'Alimentação' },
      { nome: 'Seguro anual', valor: 1200, frequencia: 'Anual', categoria: 'Outros' },
    ],
    mapa: {},
  },
};

test('sugerirIndice: nome primeiro (financiamento = TR, parcela/empréstimo = fixo, contas da casa pelo item), categoria depois', () => {
  assert.equal(sugerirIndice({ nome: 'Parcela Apartamento' }), 'tr');
  assert.equal(sugerirIndice({ nome: 'FIES' }), 'fixo');
  assert.equal(sugerirIndice({ nome: 'Condomínio' }), 'condominio');
  assert.equal(sugerirIndice({ nome: 'Luz' }), 'energia');
  assert.equal(sugerirIndice({ nome: 'Água' }), 'agua');
  assert.equal(sugerirIndice({ nome: 'Gás' }), 'gasEncanado');
  assert.equal(sugerirIndice({ nome: 'Uber Assinatura' }), 'streaming', 'assinatura antes do transporte');
  assert.equal(sugerirIndice({ nome: 'Uber' }), 'aplicativo');
  assert.equal(sugerirIndice({ nome: 'Diarista' }), 'empregadoDomestico');
  assert.equal(sugerirIndice({ nome: 'Supermercado' }), 'alimentacaoCasa');
  assert.equal(sugerirIndice({ nome: 'Cartão de Crédito', categoria: 'Outros' }), 'ipca');
  assert.equal(sugerirIndice({ nome: 'Coisa X', categoria: 'Saúde' }), 'saude');
});

test('calcularMinhaInflacao: peso × inflação de 12 meses de cada índice; fixo = 0; anual vira /12', () => {
  const r = calcularMinhaInflacao(DADOS);
  const tot = 2000 + 500 + 300 + 1200 + 100;
  assert.equal(r.total, tot);
  const i12 = (t) => (1 + t) ** 12 - 1;
  const esperado = (2000 * i12(0.001) + 300 * i12(0.01) + 1200 * i12(0.002) + 100 * i12(0.004)) / tot;
  perto(r.minha, esperado);
  perto(r.ipca, i12(0.004));
  assert.equal(r.periodo.de, '2025-10');
  assert.equal(r.periodo.ate, '2026-09');
  perto(r.grupos.fixo, 500 / tot);
  perto(r.grupos.tr, 2000 / tot);
  perto(r.grupos.precos, 1600 / tot);
  perto(r.semParcelas, (300 * i12(0.01) + 1200 * i12(0.002) + 100 * i12(0.004)) / 1600);
  perto(r.impactoMensal, esperado * tot, 1e-6);
  assert.equal(r.porItem[0].nome, 'Parcela do Apartamento', 'maior primeiro');
  assert.equal(r.porItem.find((p) => p.nome === 'Seguro anual').mensal, 100);
});

test('calcularMinhaInflacao: escolha da cesta vence a sugestão; índice sem série usa o IPCA (marcado como estimado)', () => {
  const r = calcularMinhaInflacao({ ...DADOS, cesta: { ...DADOS.cesta, mapa: { Luz: 'ipca' } } });
  const luz = r.porItem.find((p) => p.nome === 'Luz');
  assert.equal(luz.indice, 'ipca');
  assert.equal(luz.sugerido, false);
  const r2 = calcularMinhaInflacao(DADOS, { mapa: { Luz: 'aluguel' } });
  assert.equal(r2.porItem.find((p) => p.nome === 'Luz').estimada, true);
  assert.equal(r2.estimada, true);
  assert.equal(calcularMinhaInflacao({ series: {} }), null);
});

test('série mensal e 12 meses móveis (pesos de hoje)', () => {
  const r = calcularMinhaInflacao(DADOS);
  assert.equal(r.mensal.length, 14);
  assert.equal(r.acumulado12.length, 3);
  perto(r.acumulado12[r.acumulado12.length - 1].minha, r.minha, 1e-12);
});

test('ganho real, retorno mínimo, correção e dólar de equilíbrio', () => {
  perto(ganhoReal(0.149, 0.0458, 0.15), (1 + 0.149 * 0.85) / 1.0458 - 1);
  assert.equal(ganhoReal(null, 0.04), null);
  const m = retornoMinimo(0.02, 0.05, 0.15);
  perto(m.liquido, 1.02 * 1.05 - 1);
  perto(m.bruto, (1.02 * 1.05 - 1) / 0.85);
  perto(corrigir(1000, 0.1, 12), 1100);
  const d = dolarEquilibrio({ dolar: 5, cdi: 0.14, juroUsd: 0.04, ir: 0.15 });
  perto(d.valor, 5 * (1 + 0.14 * 0.85) / (1 + 0.04 * 0.85));
  assert.ok(d.alta > 0.08 && d.alta < 0.09);
  perto(composto([0.1, 0.1]), 0.21);
  assert.deepEqual(taxaDoMes({ ipca: { '2026-09': 0.01 } }, 'fixo', '2026-09'), { taxa: 0, estimada: false });
});

test('linhasRendeDeVerdade: parado perde a inflação inteira; CDI líquido contra as duas inflações', () => {
  const linhas = linhasRendeDeVerdade({ juros: { selic: 0.15, ipcaEsperado: 0.04 }, ntnb: { longa: { nome: 'Tesouro IPCA+ 2035', taxa: 0.07 } } }, { minha: 0.02, ipca: 0.05, prefixado: { nome: 'Tesouro Prefixado 2032', taxa: 0.14 } });
  assert.deepEqual(linhas.map((l) => l.id), ['parado', 'poupanca', 'cdi', 'ntnb', 'pre']);
  perto(linhas[0].realMinha, 1 / 1.02 - 1);
  const cdi = linhas.find((l) => l.id === 'cdi');
  perto(cdi.liquido, 0.149 * 0.85);
  assert.ok(cdi.realMinha > cdi.realIpca);
  assert.deepEqual(linhasRendeDeVerdade(null, { minha: 0.02, ipca: 0.05 }), []);
});

test('tela: KPIs minha × IPCA, tabela por despesa e trocar o índice + salvar grava a cesta inteira', async () => {
  const doc = new JSDOM('<!doctype html><html><body><div id="c"></div></body></html>').window.document;
  const el = doc.getElementById('c');
  const salvos = [];
  montarMinhaInflacao(el, {
    obterDados: async () => JSON.parse(JSON.stringify(DADOS)), doc,
    salvar: async (m) => { salvos.push(m); return { ok: true, mapa: m }; },
    obterReserva: () => ({ meta: 10000 }),
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.match(el.textContent, /Minha inflação \(12 meses\)/);
  assert.match(el.textContent, /IPCA oficial \(12 meses\)/);
  assert.match(el.textContent, /precisa de R\$/);
  assert.ok(el.querySelector('.og-inf-veredito'), 'o veredito aparece logo abaixo dos KPIs');
  const sel = el.querySelector('select[data-indice="Luz"]');
  sel.value = 'ipca';
  sel.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  const btn = el.querySelector('[data-acao="salvar-indices"]');
  assert.equal(btn.disabled, false);
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(salvos[0].Luz, 'ipca');
  assert.equal(salvos[0]['Parcela do Apartamento'], 'tr', 'o sugerido vira escolha');
});

test('veredito (28/10/2026): bem abaixo do IPCA, no ritmo ou acima; atenção quando o que acompanha preços passa do IPCA', () => {
  const base = { minha: 0.0401, ipca: 0.0458, impactoMensal: 200, impactoIpca: 230, grupos: { fixo: 0.096, tr: 0.47, precos: 0.434 }, semParcelas: 0.072,
    porItem: [
      { nome: 'Plano de saúde', indice: 'planoSaude', mensal: 800, variacao: 0.12 },
      { nome: 'Mercado', indice: 'alimentacaoCasa', mensal: 1500, variacao: 0.06 },
      { nome: 'Luz', indice: 'energia', mensal: 200, variacao: 0.02 },
      { nome: 'Parcela do Apartamento', indice: 'tr', mensal: 3000, variacao: 0.02 },
    ] };
  const v = vereditoInflacao(base, { linhas: [{ id: 'cdi', realMinha: 0.08 }] });
  assert.equal(v.tom, 'bom');
  assert.match(v.titulo, /Você está bem/);
  assert.match(v.titulo, /0,6 p\.p\. abaixo do IPCA/);
  assert.match(v.texto, /R\$\s?30,00 a menos/);
  assert.match(v.texto, /47% na TR e 10% fixo em reais/);
  assert.match(v.atencao, /7,2%/);
  assert.match(v.atencao, /Plano de saúde \+12,0%, Mercado \+6,0%/, 'os que mais puxaram, por R$ acima do IPCA; Luz (abaixo) e a TR ficam de fora');
  assert.match(v.atencao, /Quando as parcelas acabarem/);
  assert.match(v.texto, /CDI \(líquido\) o dinheiro rende 8,0% acima/);
  assert.equal(vereditoInflacao({ ...base, minha: 0.046 }).tom, 'neutro');
  const ruim = vereditoInflacao({ ...base, minha: 0.06, grupos: { fixo: 0, tr: 0, precos: 1 }, semParcelas: 0.06 });
  assert.equal(ruim.tom, 'ruim');
  assert.match(ruim.titulo, /Atenção: .* acima do IPCA/);
  assert.doesNotMatch(ruim.atencao, /parcelas acabarem/, 'sem parcelas, não promete mudança');
  assert.equal(vereditoInflacao(null), null);
});

// ---- Apps Script ----
function gs(extra = {}) {
  const sb = { console, Logger: { log() {} }, ...extra };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(new URL('../apps-script/InflacaoPessoal.gs', import.meta.url), 'utf8')).runInContext(sb);
  return sb;
}

test('GS: SIDRA -> séries por código; catálogo resolvido por código, nome (subitem mais longo) ou grupo; TR do dia 1º; FRED', () => {
  const sb = gs();
  const reg = [{ D4N: 'cabeçalho' },
    { D3C: '202608', V: '0.50', D4N: 'Índice geral' }, { D3C: '202609', V: '0.82', D4N: 'Índice geral' },
    { D3C: '202609', V: '2.74', D4N: '2202003.Energia elétrica residencial' },
    { D3C: '202609', V: '0.40', D4N: '7.Despesas pessoais' },
    { D3C: '202609', V: '0.90', D4N: '7101003.Empregado doméstico' },
    { D3C: '202609', V: '...', D4N: '7101099.Item sem dado' }];
  const por = sb.itensSidraPorCodigo_(reg);
  assert.equal(por.geral.serie['2026-09'], 0.0082);
  assert.equal(por['2202003'].nome, 'Energia elétrica residencial');
  assert.equal(por['7101099'], undefined, '"..." não é número');
  const cat = sb.INFLACAO_CATALOGO_;
  const achar = (id) => sb.resolverIndiceSidra_(cat.find((c) => c.id === id), por);
  assert.equal(achar('energia').serie['2026-09'], 0.0274);
  assert.equal(achar('empregadoDomestico').nome, 'Empregado doméstico');
  assert.match(achar('recreacao').nome, /\(grupo\)$/, 'sem o subitem: o grupo de reserva');
  assert.deepEqual(JSON.parse(JSON.stringify(sb.trMensal_([{ data: '01/09/2026', valor: '0.1467' }, { data: '02/09/2026', valor: '0.2' }]))), { '2026-09': 0.001467 });
  assert.deepEqual(JSON.parse(JSON.stringify(sb.ultimoValorFred_('observation_date,DTB3\n2026-10-20,4.01\n2026-10-21,.\n'))), { taxa: 0.0401, data: '2026-10-20' });
});

test('GS: salvarInflacaoPessoal valida o índice e a config', () => {
  const linhas = [];
  const aba = { getLastRow: () => 1 + linhas.length, getRange: () => ({ clearContent() {}, setValues: (v) => { linhas.length = 0; linhas.push(...v); }, getValues: () => linhas.map((l) => [l[0], l[1]]) }) };
  const props = {};
  const sb = gs({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => aba, insertSheet: () => aba }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    jsonOut: (o) => o,
  });
  const r = sb.handleSalvarInflacaoPessoal({ parameter: { mapa: JSON.stringify({ Luz: 'energia', Lixo: 'nao-existe' }), config: JSON.stringify({ premio: 0.04 }) } });
  assert.equal(r.ok, true);
  assert.deepEqual(linhas.map((l) => [l[0], l[1]]), [['Luz', 'energia']]);
  assert.equal(r.config.premio, 0.04);
  assert.equal(sb.handleSalvarInflacaoPessoal({ parameter: { config: JSON.stringify({ premio: 0.9 }) } }).ok, false);
});

// ---- usos em paralelo ao IPCA e as regras de análise da live ----
import { repasseDeInflacao } from '../assets/js/pages/setor-inflacao.js';
import { sinalPiso } from '../assets/js/pages/aportes-calc.js';
import { avaliarAtivo } from '../assets/js/criterios/motor.js';
import { dolarEquilibrioHtml, percentualEmDolar } from '../assets/js/pages/aportes-eua.js';
import { analisarPrefixado, resumoMacro } from '../assets/js/criterios/macro.js';
import { poderDeCompraHtml } from '../assets/js/pages/metas.js';
import { seriesReais, resumoPeriodo, htmlTiles } from '../assets/js/pages/patrimonio-inflacao.js';
import { pisoDaResposta } from '../assets/js/inflacao-pessoal.js';

test('repasseDeInflacao: energia/saneamento e bancos repassam; varejo não; FII pelo tipo (shopping depende do varejo)', () => {
  assert.equal(repasseDeInflacao({ setor: 'Utilidade Pública', segmento: 'Energia Elétrica' }).nivel, 'repassa');
  assert.equal(repasseDeInflacao({ setor: 'Financeiro', segmento: 'Bancos' }).nivel, 'repassa');
  assert.equal(repasseDeInflacao({ setor: 'Consumo Cíclico', segmento: 'Varejo' }).nivel, 'dificil');
  assert.equal(repasseDeInflacao({ setor: 'Materiais Básicos', segmento: 'Mineração' }).nivel, 'parcial');
  assert.equal(repasseDeInflacao({ tipo: 'Papel' }, 'fiis').nivel, 'repassa');
  assert.equal(repasseDeInflacao({ tipo: 'Tijolo', segmento: 'Shoppings' }, 'fiis').nivel, 'parcial');
  assert.equal(repasseDeInflacao({}), null);
});

test('retorno mínimo: pisoDaResposta; sinalPiso compara DY do FII e 1/P/L da ação', () => {
  const p = pisoDaResposta({ ...DADOS, config: { premio: 0.05 } });
  perto(p.liquido, (1 + p.inflacao) * 1.05 - 1);
  const s1 = []; sinalPiso(s1, { dy: 0.12 }, 'fiis', { liquido: 0.08, inflacao: 0.03, premio: 0.05 });
  assert.equal(s1[0].tom, 'bom');
  const s2 = []; sinalPiso(s2, { radar: { pl: 20 } }, 'acoes', { liquido: 0.08, inflacao: 0.03, premio: 0.05 });
  assert.equal(s2[0].tom, 'ruim', '1/20 = 5% < 8%');
  const s3 = []; sinalPiso(s3, { radar: {} }, 'acoes', { liquido: 0.08, inflacao: 0.03, premio: 0.05 });
  assert.equal(s3.length, 0);
});

test('Análise do ativo (motor): "Seu retorno mínimo" e "Repasse de inflação" entram como pontos, fora da nota', () => {
  const base = { classe: 'acoes', ticker: 'ZZZZ3', nome: 'Zeta', setor: 'Utilidade Pública', segmento: 'Energia Elétrica', moeda: 'BRL', indicadores: { precoAtual: 10, pl: 8, pvp: 1.2, dy: 0.06 } };
  const sem = avaliarAtivo(base);
  const com = avaliarAtivo({ ...base, piso: { liquido: 0.08, inflacao: 0.03, premio: 0.05 } });
  const piso = com.pontos.find((x) => x.criterioId === 'carteira_piso');
  assert.equal(piso.tom, 'bom', '1/8 = 12,5% > 8%');
  assert.ok(com.pontos.find((x) => x.criterioId === 'qualidade_repasse_inflacao'));
  assert.equal(com.nota, sem.nota, 'não mexe na nota de fundamentos');
});

test('dólar de equilíbrio e % em dólar (Aportes › EUA)', () => {
  const classes = { acoes: [{ totalAtualizado: 6000 }], fiis: [], rendaFixa: [{ valorAtualizado: 2000 }], acoesEua: [{ totalAtualizado: 400 }] };
  const pd = percentualEmDolar(classes, 5);
  perto(pd.pct, 2000 / 10000);
  const html = dolarEquilibrioHtml({ macro: { juros: { selic: 0.15 } }, inflacao: { juroUsd: { taxa: 0.04 }, config: { metaDolar: 0.3 } } }, { cambio: 5, classes });
  assert.match(html, /Dólar de equilíbrio em 12 meses: <b>R\$ 5,4\d<\/b>/);
  assert.match(html, /20,0%<\/b> da carteira em dólar \(sua meta: 30%; faltam R\$/);
  assert.equal(dolarEquilibrioHtml({}, { cambio: 5 }), '');
});

test('curva longa: o prefixado mais longo (sem cupom) vira chip no contexto de mercado', () => {
  const t = [{ nome: 'Tesouro Prefixado 2029', tipo: 'Tesouro Prefixado', vencimento: '2029-01-01', taxa: 13.5 }, { nome: 'Tesouro Prefixado 2032', tipo: 'Tesouro Prefixado', vencimento: '2032-01-01', taxa: 13.9 }, { nome: 'Tesouro Prefixado com Juros Semestrais 2035', tipo: 'Tesouro Prefixado com Juros Semestrais', vencimento: '2035-01-01', taxa: 14 }];
  const pf = analisarPrefixado(t, '2026-10-28');
  assert.equal(pf.nome, 'Tesouro Prefixado 2032');
  perto(pf.taxa, 0.139);
  const chips = resumoMacro({ juros: { selic: 0.15, real: 0.1, nivel: 'alto' }, prefixado: pf, bolsa: {} });
  assert.ok(chips.some((c) => c.id === 'prefixado'));
});

test('Metas: "poder de compra" do alvo pelas duas inflações (data da meta; reserva em 12 meses)', () => {
  const html = poderDeCompraHtml({ tipo: 'acumulo' }, { alvoBRL: 100000, mesesRestantes: 24, dataAlvo: '2028-10' }, { minha: 0.02, ipca: 0.05 });
  assert.match(html, /R\$\s104\.040.*pela sua inflação.*R\$\s110\.250.*pelo IPCA/);
  assert.match(poderDeCompraHtml({ tipo: 'reservaEmergencia' }, { alvoBRL: 10000, mesesRestantes: null }, { minha: 0.02, ipca: 0.05 }), /daqui a 12 meses/);
  assert.equal(poderDeCompraHtml({ tipo: 'acumulo' }, { alvoBRL: 1000, mesesRestantes: 5 }, null), '');
});

test('Patrimônio vs. inflação: a linha "Aportes + minha inflação" e o tile ao lado do IPCA', () => {
  const hm = []; let nI = 100;
  for (let k = 0; k < 14; k++) { const m = mesesAte('2026-09', 14)[k]; if (k) nI *= 1.004; hm.push({ mes: m, patrimonio: 50000 + k * 1000, aporte: k ? 1000 : 0, indiceIpca: nI, indiceCdi: nI }); }
  const minha = Object.fromEntries(hm.map((p) => [p.mes, 0.001]));
  const r = resumoPeriodo(seriesReais({ hoje: '2026-09-30', historicoMensal: hm }, { minha }), 'tudo');
  assert.ok(r.minha && r.minha.acumulado < r.ipca.acumulado);
  assert.ok(r.linhas.every((l) => typeof l.minha === 'number'));
  assert.ok(r.benchmarks.excessoMinha > r.benchmarks.excessoIpca, 'inflação menor = mais acima dela');
  assert.match(htmlTiles(r), /Acima da sua inflação/);
  const semMinha = resumoPeriodo(seriesReais({ hoje: '2026-09-30', historicoMensal: hm }), 'tudo');
  assert.equal(semMinha.minha, null);
  assert.doesNotMatch(htmlTiles(semMinha), /sua inflação/);
});
