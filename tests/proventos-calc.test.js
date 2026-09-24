// tests/proventos-calc.test.js - 24/09/2026: contas da tela Proventos
// (assets/js/pages/proventos-calc.js), com dados de exemplo (sintéticos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  somarMeses, somarDias, rotuloMes, mesesDoPeriodo, resumoConsolidado, historicoMensal, rankingPorAtivo,
  receitaFutura, itensAgenda, anosDaAgenda, contagemPorMes, filtrarAgenda, previaExportacaoB3,
} from '../assets/js/pages/proventos-calc.js';

import { DADOS } from './proventos-exemplo.mjs';

test('datas: meses e dias por aritmética de calendário (sem fuso), rótulo "set/26"', () => {
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  assert.equal(somarMeses('2026-12', 1), '2027-01');
  assert.equal(somarMeses('2026-09', -11), '2025-10');
  assert.equal(somarDias('2026-09-24', 30), '2026-10-24');
  assert.equal(somarDias('2024-02-28', 1), '2024-02-29');
  assert.equal(rotuloMes('2026-09'), 'set/26');
});

test('mesesDoPeriodo(): sempre termina no mês de hoje; 12 meses = 12 barras; no ano = de janeiro; desde o início = do 1º provento', () => {
  assert.equal(mesesDoPeriodo('12m', '2026-09-24').length, 12);
  assert.equal(mesesDoPeriodo('12m', '2026-09-24')[0], '2025-10');
  assert.equal(mesesDoPeriodo('24m', '2026-09-24').length, 24);
  assert.deepEqual(mesesDoPeriodo('ano', '2026-03-02'), ['2026-01', '2026-02', '2026-03']);
  assert.equal(mesesDoPeriodo('inicio', '2026-09-24', '2024-03-10')[0], '2024-03');
  assert.equal(mesesDoPeriodo('inicio', '2026-09-24', '2024-03-10').length, 31);
  assert.deepEqual(mesesDoPeriodo('inicio', '2026-09-24', null), ['2026-09']);
});

test('resumoConsolidado(): aplicado e aportes por classe, renda do período e de 12 meses, média, YoC e a receber', () => {
  const t = resumoConsolidado(DADOS, { classe: 'todas', periodoId: '12m' });
  assert.equal(t.aplicado, 1200);
  assert.equal(t.aportes12m, 300);
  assert.equal(t.renda, 57); // 10+4+10+5+20+8 (o de 30/09/2025 fica fora)
  assert.equal(t.renda12m, 57);
  assert.equal(t.media, 4.75);
  assert.equal(t.yoc.toFixed(4), (57 / 1200 * 100).toFixed(4));
  assert.equal(t.aReceber, 20);
  assert.equal(t.aReceberEsteMes, 3);
  const f = resumoConsolidado(DADOS, { classe: 'fiis', periodoId: 'ano' });
  assert.equal(f.aplicado, 900);
  assert.equal(f.renda, 20);
  assert.equal(f.meses, 9);
  assert.equal(f.media, 2.22);
  assert.equal(f.renda12m, 28);
  assert.equal(f.aReceber, 10);
  const i = resumoConsolidado(DADOS, { classe: 'todas', periodoId: 'inicio' });
  assert.equal(i.renda, 65);
  assert.equal(i.meses, 31);
});

test('historicoMensal(): barras por classe, tipo (ordem fixa) e ativo (os maiores do período + Outros); totais = soma das partes', () => {
  const h = historicoMensal(DADOS, { periodoId: '12m', agrupar: 'classe' });
  assert.equal(h.meses.length, 12);
  assert.deepEqual(h.grupos.map((g) => [g.id, g.cor]), [['acoes', '--acoes'], ['fiis', '--fiis'], ['acoesEua', '--usa']]);
  const iSet = h.meses.indexOf('2026-09');
  const iAgo = h.meses.indexOf('2026-08');
  assert.equal(h.valores.fiis[iSet], 10);
  assert.equal(h.valores.acoes[iSet], 4);
  assert.equal(h.totais[iAgo], 15);
  assert.equal(h.totais.reduce((a, b) => a + b, 0), 57);
  const t = historicoMensal(DADOS, { periodoId: 'inicio', agrupar: 'tipo' });
  assert.deepEqual(t.grupos.map((g) => [g.id, g.cor]), [['Dividendo', '--cat-1'], ['JCP', '--cat-2'], ['Rendimento', '--cat-3'], ['Reembolso', '--cat-5']]);
  // ativo: os maiores DO PERÍODO (DDDD3, só de 2024, não aparece em 12 meses)
  const a1 = historicoMensal(DADOS, { periodoId: 'inicio', agrupar: 'ativo' });
  const a2 = historicoMensal(DADOS, { periodoId: '12m', agrupar: 'ativo' });
  const cor = (h2, id) => (h2.grupos.find((g) => g.id === id) || {}).cor;
  assert.equal(cor(a1, 'AAAA11'), '--cat-1');
  assert.equal(cor(a2, 'AAAA11'), '--cat-1');
  assert.equal(cor(a1, 'BBBB3'), cor(a2, 'BBBB3'));
  assert.ok(!a2.grupos.some((g) => g.id === 'DDDD3'), 'ativo sem provento no período sai da legenda');
  assert.deepEqual(a2.grupos.map((g) => g.id), ['AAAA11', 'BBBB3', 'CCCC']);
  const t2 = historicoMensal(DADOS, { periodoId: 'ano', agrupar: 'ativo' });
  assert.deepEqual(t2.grupos.map((g) => g.id), ['BBBB3', 'AAAA11', 'CCCC'], 'no ano, BBBB3 (24) passa AAAA11 (20)');
});

test('rankingPorAtivo(): total e % no período, quantidade/preço médio de hoje, YoC de 12 meses na moeda do ativo, DY e vendidos', () => {
  const r = rankingPorAtivo(DADOS, { periodoId: '12m' });
  assert.deepEqual(r.map((x) => x.ticker), ['AAAA11', 'BBBB3', 'CCCC']);
  const a = r[0];
  assert.equal(a.total, 28);
  assert.equal(a.pct.toFixed(4), (28 / 57 * 100).toFixed(4));
  assert.equal(a.totalDesdeInicio, 35);
  assert.equal(a.yoc12m.toFixed(4), (28 / 900 * 100).toFixed(4));
  assert.equal(a.dy, 10);
  const c = r[2];
  assert.equal(c.moeda, 'USD');
  assert.equal(c.yoc12m, 10, 'US$ 1 ÷ (1 × US$ 10)');
  const tudo = rankingPorAtivo(DADOS, { periodoId: 'inicio' });
  const d = tudo.find((x) => x.ticker === 'DDDD3');
  assert.equal(d.naCarteira, false);
  assert.equal(d.yoc12m, null);
});

test('receitaFutura(): 30 dias, 3 meses, 12 meses a partir de hoje, sem data à parte, e as datas com que ainda vêm', () => {
  const f = receitaFutura(DADOS);
  assert.equal(f.d30, 13);
  assert.equal(f.d90, 13);
  assert.equal(f.d365, 15);
  assert.equal(f.semData, 5);
  assert.deepEqual(f.datasComFuturas.map((p) => p.ticker), ['AAAA11']);
  assert.deepEqual(f.proximos.map((p) => p.dataPagamento), ['2026-09-30', '2026-10-14', '2027-03-01']);
  assert.equal(receitaFutura(DADOS, { classe: 'acoesEua' }).d365, 0);
});

test('Agenda: recebidos + não lançados + a receber + sem data numa lista só; anos, contagem por mês e filtros Realizado / A realizar', () => {
  const itens = itensAgenda(DADOS);
  assert.equal(itens.length, 8 + 1 + 4);
  assert.deepEqual(anosDaAgenda(itens, DADOS.hoje), [2027, 2026, 2025, 2024]);
  const c = contagemPorMes(itens, 2026);
  assert.equal(c.meses[8], 4); // set: 2 pagos + 1 não lançado + 1 a receber
  assert.equal(c.meses[9], 1);
  assert.equal(c.semData, 1);
  assert.equal(contagemPorMes(itens, 2026, 'realizado').meses[8], 3);
  assert.equal(contagemPorMes(itens, 2026, 'aRealizar').meses[8], 1);
  const set = filtrarAgenda(itens, { ano: 2026, mes: 9 });
  assert.equal(set.total, 22);
  assert.deepEqual(set.itens.map((p) => p.status), ['pago', 'naoLancado', 'pago', 'aReceber']);
  assert.equal(filtrarAgenda(itens, { ano: 2026, mes: 9, status: 'aRealizar' }).total, 3);
  assert.equal(filtrarAgenda(itens, { ano: 2026, mes: 'semData' }).itens[0].ticker, 'EEEE3');
  assert.equal(filtrarAgenda(itens, { ano: 2026 }).itens.length, 8);
  const usd = itens.find((p) => p.ticker === 'CCCC');
  assert.equal(usd.moeda, 'USD');
  assert.equal(itensAgenda(DADOS, { classe: 'acoesEua' }).length, 1);
});

test('previaExportacaoB3(): acha o cabeçalho da B3, ignora a linha de total e o que não é ticker; arquivo errado não passa', () => {
  const m = [
    ['Produto', 'Tipo', 'Tipo de Evento', 'Previsão de pagamento', 'Instituição', 'Conta', 'Quantidade', 'Preço unitário', 'Valor líquido'],
    ['ABCD11 - FUNDO', 'Fundo', 'RENDIMENTO', '25/09/2026', 'X', '1', '10', 0.9, 9],
    ['EFGH3 - EMPRESA', 'ON', 'DIVIDENDO', '-', 'X', '1', '5', 1, '5,50'],
    ['', '', '', '', '', '', '', 'Total líquido', 14.5],
  ];
  const p = previaExportacaoB3(m);
  assert.equal(p.ok, true);
  assert.deepEqual(p.itens.map((x) => [x.ticker, x.valor]), [['ABCD11', 9], ['EFGH3', 5.5]]);
  assert.equal(p.total, 14.5);
  assert.equal(previaExportacaoB3([['Data', 'Ativo'], ['1', 'ABCD11']]).ok, false);
  assert.equal(previaExportacaoB3(null).ok, false);
});
