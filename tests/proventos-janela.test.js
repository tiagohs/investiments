// tests/proventos-janela.test.js - 05/10/2026 (auditoria A-17 e A-19): "hoje"
// único em São Paulo (format.js!hojeSP) e o resumo da tela Proventos com o
// pago presumido separado do confirmado. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hojeSP } from '../assets/js/format.js';
import { hojeSaoPaulo, resumoConsolidado, ultimoMesFechado, mesesFechadosDoPeriodo } from '../assets/js/pages/proventos-calc.js';
import { separarPorDataInicio, resumirProventosDoMes } from '../assets/js/pages/inicio-proventos.js';

test('hojeSP: é o dia de São Paulo - às 22h de SP o UTC já é o dia seguinte e NÃO vale', () => {
  const noite = new Date('2026-10-06T01:30:00Z'); // 05/10 22h30 em SP
  assert.equal(hojeSP(noite), '2026-10-05');
  assert.equal(noite.toISOString().slice(0, 10), '2026-10-06', 'o UTC erraria o dia');
  assert.equal(hojeSP(new Date('2026-10-06T03:00:00Z')), '2026-10-06', 'meia-noite de SP');
  assert.equal(hojeSaoPaulo, hojeSP, 'o nome antigo é o mesmo helper');
  assert.match(hojeSP(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(hojeSP('lixo'), /^\d{4}-\d{2}-\d{2}$/, 'entrada inválida cai pra agora');
});

test('Início: o mês corrente e o "recebido" viram pelo dia de SP, não pelo fuso do aparelho', () => {
  const dados = { aReceber: [{ ticker: 'AAAA11', valor: 10, dataPagamento: '2026-10-05' }], recebidosNoMes: [], pagosNaoLancados: [] };
  // 05/10 às 22h30 em SP (UTC já é 06/10): o pagamento de 05/10 já chegou
  let r = separarPorDataInicio(dados, { hoje: new Date('2026-10-06T01:30:00Z') });
  assert.deepEqual(r.recebidos.map((p) => p.ticker), ['AAAA11']);
  // 30/09 às 22h (UTC já é outubro): continua setembro
  const set = resumirProventosDoMes({ aReceber: [{ valor: 4, dataPagamento: '2026-09-30' }, { valor: 6, dataPagamento: '2026-10-02' }] }, { hoje: new Date('2026-10-01T01:00:00Z') });
  assert.equal(set.aReceberEsteMes, 4);
  assert.equal(set.aReceberDepois, 6);
  r = separarPorDataInicio(dados, { hoje: new Date('2026-10-05T01:00:00Z') }); // 04/10 22h em SP
  assert.deepEqual(r.aReceber.map((p) => p.ticker), ['AAAA11']);
});

test('resumoConsolidado: o recebido do mês separa confirmado e presumido (o total soma os dois)', () => {
  const dados = {
    hoje: '2026-10-20',
    recebidos: [
      { data: '2026-10-02', ticker: 'AAAA3', classe: 'acoes', valor: 30, tipo: 'Dividendo' },
      { data: '2026-10-10', ticker: 'BBBB11', classe: 'fiis', valor: 12.5, tipo: 'Rendimento', conferencia: 'presumido' },
      { data: '2026-09-10', ticker: 'BBBB11', classe: 'fiis', valor: 10, tipo: 'Rendimento', conferencia: 'confirmado' },
    ],
    aReceber: [], aplicado: { acoes: 1000, fiis: 1000, acoesEua: 0 }, aportes12m: {},
  };
  const r = resumoConsolidado(dados, { classe: 'todas', periodoId: '12m' });
  assert.equal(r.rendaMes, 42.5);
  assert.equal(r.rendaMesPresumido, 12.5);
  assert.equal(r.rendaMesConfirmado, 30);
  assert.equal(r.renda12mPresumido, 12.5);
  assert.equal(r.mediaRotulo, 'meses fechados');
  assert.equal(r.media12m, 0.83); // só setembro (10) ÷ 12, o mês corrente fica fora da média
});

// 06/10/2026 (Tiago, Metas > Renda passiva): espelho do front de janelaProventos_ 'fechados'
test('ultimoMesFechado / mesesFechadosDoPeriodo: 12 meses até o último mês fechado; o mês de hoje conta no seu último dia', () => {
  const j = (hoje) => { const m = mesesFechadosDoPeriodo('12m', hoje); return `${m[0]}..${m[m.length - 1]}(${m.length})`; };
  assert.equal(ultimoMesFechado('2026-10-04'), '2026-09');
  assert.equal(j('2026-10-04'), '2025-10..2026-09(12)');
  assert.equal(j('2026-10-01'), '2025-10..2026-09(12)', 'dia 1');
  assert.equal(j('2026-10-30'), '2025-10..2026-09(12)', 'dia 30 de mês de 31');
  assert.equal(j('2026-10-31'), '2025-11..2026-10(12)', 'dia 31');
  assert.equal(j('2026-02-28'), '2025-03..2026-02(12)', 'fev de 28 dias');
  assert.equal(j('2028-02-28'), '2027-02..2028-01(12)', 'fev bissexto, dia 28 ainda não é o último');
  assert.equal(j('2028-02-29'), '2027-03..2028-02(12)', 'fev bissexto, dia 29');
  assert.equal(j('2026-12-31'), '2026-01..2026-12(12)', '31/dez');
  assert.equal(j('2027-01-01'), '2026-01..2026-12(12)', '1/jan');
  assert.deepEqual(mesesFechadosDoPeriodo('ano', '2026-10-31').slice(-1), ['2026-10']);
  assert.deepEqual(mesesFechadosDoPeriodo('ano', '2026-10-30').slice(-1), ['2026-09']);
});
