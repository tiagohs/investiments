// tests/proventos-conferencia.test.js - 02/10/2026 (Tiago: "Proventos: se a
// data de pagamento já passou, deduz que está pago. Eu mando no final do
// mês [o arquivo da B3] e você faz o check final."): status pelo dia de
// pagamento no fuso de São Paulo, pago presumido nos totais e o resumo da
// conferência com o extrato da B3 (assets/js/pages/proventos-calc.js).
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hojeSaoPaulo, statusPorData, normalizarPorData, resumoConferencia, iconeConferenciaHtml, dicaConferencia,
  resumoConsolidado, historicoMensal, itensAgenda, filtrarAgenda,
} from '../assets/js/pages/proventos-calc.js';
import { separarPorDataInicio } from '../assets/js/pages/inicio-proventos.js';

test('hojeSaoPaulo(): o dia é o de São Paulo, seja qual for o fuso do aparelho (virada às 3h UTC)', () => {
  assert.equal(hojeSaoPaulo(new Date('2026-10-02T02:59:00Z')), '2026-10-01', '23h59 de 01/10 em SP');
  assert.equal(hojeSaoPaulo(new Date('2026-10-02T03:00:00Z')), '2026-10-02', 'meia-noite de 02/10 em SP');
  assert.equal(hojeSaoPaulo(new Date('2026-12-31T23:30:00Z')), '2026-12-31');
});

test('statusPorData(): ontem e hoje = pago; amanhã = a receber; sem data = a definir', () => {
  const hoje = '2026-10-02';
  assert.equal(statusPorData('2026-10-01', hoje), 'pago');
  assert.equal(statusPorData('2026-10-02', hoje), 'pago');
  assert.equal(statusPorData('2026-10-03', hoje), 'aReceber');
  assert.equal(statusPorData('', hoje), 'semData');
  // na virada do ano também (comparação de texto 'yyyy-MM-dd')
  assert.equal(statusPorData('2027-01-01', '2026-12-31'), 'aReceber');
});

const anunciado = (o) => ({ ticker: 'ABCD11', classe: 'fiis', tipo: 'Rendimento', dataCom: '', dataPagamento: '2026-10-02', quantidade: 10, valorPorCota: 1, valor: 10, fonte: 'FNet', jaLancado: false, ...o });
const recebido = (o) => ({ data: '2026-10-01', dataCom: '', ticker: 'EFGH3', classe: 'acoes', tipo: 'Dividendo', quantidade: 1, valorPorCota: 4, liquido: 4, moeda: 'BRL', cambio: null, valor: 4, ...o });

function dadosExemplo() {
  return {
    hoje: '2026-10-01', // resposta do cache de ontem
    recebidos: [recebido({}), recebido({ ticker: 'IJKL3', data: '2026-09-20', valor: 6, conferencia: 'divergente', dataB3: '2026-09-20', valorB3: 5.5 }), recebido({ ticker: 'MNOP3', data: '2026-09-25', valor: 2, conferencia: 'nao_confirmado' })],
    aReceber: [
      anunciado({ ticker: 'HOJE11', dataPagamento: '2026-10-02', valor: 3 }), // passou a ser hoje
      anunciado({ ticker: 'AMAN11', dataPagamento: '2026-10-03', valor: 7 }),
      anunciado({ ticker: 'SEMD11', dataPagamento: '', valor: 1 }),
    ],
    pagosNaoLancados: [
      anunciado({ ticker: 'PRES11', dataPagamento: '2026-09-30', valor: 5, conferencia: 'presumido' }),
      anunciado({ ticker: 'CONF11', dataPagamento: '2026-09-15', valor: 8, conferencia: 'confirmado', dataB3: '2026-09-16', valorB3: 8 }),
      anunciado({ ticker: 'NAOC11', dataPagamento: '2026-09-10', valor: 9, conferencia: 'nao_confirmado' }),
    ],
    conferencia: { periodos: [{ mes: '2026-09', inicio: '2026-09-01', fim: '2026-09-30', conferidoEm: '2026-10-01', confirmados: 3, divergentes: 1, naoConfirmados: 2, extras: 1 }], extras: [{ ticker: 'ZZZZ11', data: '2026-09-25', valor: 1 }] },
  };
}

test('normalizarPorData(): pagamento até hoje (SP) vira pago presumido e entra nos recebidos; não confirmado (só anunciado) fica fora dos totais; idempotente', () => {
  const n = normalizarPorData(dadosExemplo(), '2026-10-02');
  assert.equal(n.hoje, '2026-10-02');
  assert.deepEqual(n.aReceber.map((p) => p.ticker), ['AMAN11', 'SEMD11']);
  const porTicker = Object.fromEntries(n.recebidos.map((p) => [p.ticker, p]));
  assert.equal(porTicker.HOJE11.conferencia, 'presumido');
  assert.equal(porTicker.HOJE11.data, '2026-10-02');
  assert.equal(porTicker.PRES11.conferencia, 'presumido');
  assert.equal(porTicker.CONF11.conferencia, 'confirmado');
  assert.equal(porTicker.NAOC11, undefined, 'anunciado não confirmado sai dos totais');
  assert.equal(porTicker.MNOP3.conferencia, 'nao_confirmado', 'lançado na aba continua contando');
  assert.deepEqual(n.naoConfirmados.map((p) => p.ticker), ['NAOC11']);
  assert.deepEqual(n.pagosNaoLancados, []);
  assert.equal(normalizarPorData(n, '2026-12-31'), n, '2ª vez não muda nada');
  // hoje local mais velho que o do servidor: vale o do servidor
  assert.equal(normalizarPorData(dadosExemplo(), '2026-09-30').hoje, '2026-10-01');
  assert.equal(normalizarPorData(dadosExemplo(), '2026-10-01').aReceber.length, 3, 'ontem: o de hoje ainda era a receber');

  // totais: outubro = 4 (lançado) + 3 (presumido de hoje)
  const r = resumoConsolidado(n, { periodoId: '12m' });
  assert.equal(r.rendaMes, 7);
  assert.equal(r.aReceber, 8);
  const h = historicoMensal(n, { periodoId: '12m' });
  assert.equal(h.totais.at(-1), 7);
  assert.equal(h.presumidos.at(-1), 3);
  assert.equal(h.totais.at(-2), 6 + 2 + 5 + 8, 'setembro: divergente, não confirmado lançado, presumido e confirmado');
  assert.equal(h.presumidos.at(-2), 5);
});

test('Agenda e resumo da conferência: presumido é "pago" (com a situação), o não confirmado só anunciado aparece à parte; resumo conta presumidos e lista o que pede atenção', () => {
  const n = normalizarPorData(dadosExemplo(), '2026-10-02');
  const itens = itensAgenda(n);
  const set = filtrarAgenda(itens, { ano: 2026, mes: 9 }).itens;
  assert.deepEqual(set.map((p) => [p.ticker, p.status, p.conferencia || null]), [
    ['NAOC11', 'naoConfirmado', 'nao_confirmado'], ['CONF11', 'pago', 'confirmado'], ['IJKL3', 'pago', 'divergente'], ['MNOP3', 'pago', 'nao_confirmado'], ['PRES11', 'pago', 'presumido'],
  ]);
  assert.equal(filtrarAgenda(itens, { ano: 2026, mes: 9, status: 'realizado' }).itens.length, 5);
  const c = resumoConferencia(n);
  assert.deepEqual(c.presumidos, { quantidade: 2, total: 8 });
  assert.equal(c.confirmados, 1);
  assert.deepEqual(c.divergentes.map((d) => [d.ticker, d.valor, d.valorB3, d.diferenca]), [['IJKL3', 6, 5.5, -0.5]]);
  assert.deepEqual(c.naoConfirmados.map((d) => [d.ticker, d.contando]), [['NAOC11', false], ['MNOP3', true]]);
  assert.equal(c.ultimoPeriodo.mes, '2026-09');
  assert.equal(c.extras.length, 1);
  assert.equal(resumoConferencia(n, { classe: 'acoes' }).presumidos.quantidade, 0);
  // resposta antiga (sem conferência): nada quebra
  const velha = resumoConferencia(normalizarPorData({ hoje: '2026-10-02', recebidos: [], aReceber: [] }, '2026-10-02'));
  assert.equal(velha.ultimoPeriodo, null);
});

test('ícone da situação: discreto, com explicação no tooltip (e os 2 valores quando diverge); sem situação não mostra nada', () => {
  assert.match(iconeConferenciaHtml({ conferencia: 'presumido' }), /title="Pago presumido pela data de pagamento: falta conferir com o extrato da B3\."/);
  assert.match(iconeConferenciaHtml({ conferencia: 'confirmado' }), /--good-ink/);
  assert.match(dicaConferencia({ conferencia: 'divergente', valor: 6, valorB3: 5.5, dataB3: '2026-09-20' }), /B3: R\$ 5,50 em 20\/09 · previsto R\$ 6,00/);
  assert.equal(iconeConferenciaHtml({}), '');
  assert.equal(iconeConferenciaHtml({ conferencia: null }), '');
});

test('Início: pago não lançado deste mês e a receber que já chegou contam no recebido; os de meses anteriores e os não confirmados ficam no aviso', () => {
  const hoje = new Date(2026, 9, 2); // 02/10/2026 (local)
  const r = separarPorDataInicio({
    aReceber: [anunciado({ ticker: 'HOJE11', dataPagamento: '2026-10-02' }), anunciado({ ticker: 'AMAN11', dataPagamento: '2026-10-03' })],
    recebidosNoMes: [{ ...anunciado({ ticker: 'LANC3', fonte: 'Planilha', dataPagamento: '2026-10-01' }) }],
    pagosNaoLancados: [anunciado({ ticker: 'OUTB11', dataPagamento: '2026-10-01' }), anunciado({ ticker: 'SETB11', dataPagamento: '2026-09-28' }), anunciado({ ticker: 'NAOC11', dataPagamento: '2026-10-01', conferencia: 'nao_confirmado' })],
  }, { hoje });
  assert.deepEqual(r.aReceber.map((p) => p.ticker), ['AMAN11']);
  assert.deepEqual(r.recebidos.map((p) => [p.ticker, p.conferencia || null]), [['LANC3', null], ['HOJE11', 'presumido'], ['OUTB11', 'presumido']]);
  assert.deepEqual(r.avisos.map((p) => p.ticker), ['SETB11', 'NAOC11']);
});
