// tests/harness/proventos-janela.test.js - 05/10/2026 (auditoria A-17, A-18, A-19):
// Proventos.gs / FluxoCaixaInicio.gs - "hoje" de São Paulo, janela única de
// proventos (fechados x com o mês atual, confirmado x presumido) e classe do
// ticker de provento sem histórico (cadastro antes do sufixo 11). Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function sandbox(extra = '') {
  const sb = { console: { ...console, log() {} }, Logger: { log() {} } };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  for (const f of ['Proventos.gs', 'FluxoCaixaInicio.gs']) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  if (extra) new vm.Script(extra).runInContext(sb);
  return sb;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test('diaSP_: dia de calendário de São Paulo (22h de SP não vira o dia seguinte do UTC)', () => {
  const sb = sandbox();
  assert.equal(sb.diaSP_(new sb.Date('2026-10-06T01:30:00Z')), '2026-10-05');
  assert.equal(sb.diaSP_(new sb.Date('2026-10-06T03:00:00Z')), '2026-10-06');
  assert.match(sb.hojeSP_(), /^\d{4}-\d{2}-\d{2}$/);
});

test('janelaProventos_ / somarProventosJanela_: 12 meses fechados x até o mês atual, com rótulo e presumido à parte', () => {
  const sb = sandbox();
  const hoje = '2026-10-05';
  assert.deepEqual(plain(sb.janelaProventos_(hoje, 'fechados', 12)), { modo: 'fechados', meses: 12, inicio: '2025-10', fim: '2026-09', rotulo: '12 meses fechados' });
  const atual = plain(sb.janelaProventos_(hoje, 'comMesAtual', 12));
  assert.equal(atual.inicio, '2025-11');
  assert.equal(atual.fim, '2026-10');
  assert.match(atual.rotulo, /mês atual/);
  const recebidos = [
    { data: '2025-09-30', valor: 999 }, // fora das duas janelas
    { data: '2025-10-15', valor: 12 }, // só na fechada
    { data: '2026-09-10', valor: 24, conferencia: 'presumido' },
    { data: '2026-10-03', valor: 6 }, // só na com mês atual
    { data: '2026-10-20', valor: 50 }, // futuro: nunca entra
  ];
  const f = plain(sb.somarProventosJanela_(recebidos, hoje, 'fechados', 12));
  assert.deepEqual([f.total, f.presumido, f.confirmado, f.media], [36, 24, 12, 3]);
  const a = plain(sb.somarProventosJanela_(recebidos, hoje, 'comMesAtual', 12));
  assert.deepEqual([a.total, a.presumido, a.confirmado], [30, 24, 6]);
  // a função antiga continua devolvendo a mesma conta, agora com o rótulo
  const m = plain(sb.mediaRendaPassiva12Meses_(recebidos, hoje));
  assert.equal(m.media, 3);
  assert.equal(m.inicio, '2025-10');
  assert.equal(m.rotulo, '12 meses fechados');
});

test('recebidosComPresumidos_: lançados + a receber que já chegou + pagos não lançados (menos os não confirmados) - mesma regra do front', () => {
  const sb = sandbox();
  const tela = {
    hoje: '2026-10-05',
    recebidos: [{ data: '2026-09-01', ticker: 'AAAA3', valor: 10 }],
    aReceber: [{ ticker: 'BBBB11', dataPagamento: '2026-10-05', valor: 5 }, { ticker: 'CCCC11', dataPagamento: '2026-10-06', valor: 7 }, { ticker: 'SEMD11', valor: 1 }],
    pagosNaoLancados: [{ ticker: 'DDDD11', dataPagamento: '2026-09-20', valor: 3, conferencia: 'presumido' }, { ticker: 'EEEE11', dataPagamento: '2026-09-21', valor: 9, conferencia: 'nao_confirmado' }],
  };
  const l = plain(sb.recebidosComPresumidos_(tela));
  assert.deepEqual(l.map((p) => p.ticker), ['AAAA3', 'BBBB11', 'DDDD11']);
  assert.deepEqual(l.map((p) => p.conferencia || null), [null, 'presumido', 'presumido']);
  assert.equal(l[1].data, '2026-10-05');
});

test('classeProventoSemHistorico_: classe do cadastro antes do sufixo 11 (unit de ação e FII sem sufixo); sem cadastro devolve vazio', () => {
  const sb = sandbox("var TICKERS_FIIS_BR = ['FFFF11', 'FFFF12']; var TICKERS_ACOES_BR = ['UUUU11', 'AAAA3'];");
  assert.equal(sb.classeProventoSemHistorico_('UUUU11', {}), 'BR', 'unit de ação termina em 11 mas é ação');
  assert.equal(sb.classeProventoSemHistorico_('ffff12', {}), 'FII', 'FII sem o sufixo 11');
  assert.equal(sb.classeProventoSemHistorico_('XXXX11', {}), '', 'sem cadastro: quem chama decide (sufixo é só o último recurso)');
  assert.equal(sb.classeProventoSemHistorico_('AAAA3', { AAAA3: 'FII' }), 'FII', 'o mapa do histórico manda primeiro');
  assert.equal(sb.tickerAtualPorAlias_(' abcd3 '), 'ABCD3');
});

test('classeProventoSemHistorico_: ticker antigo (renomeado/incorporado) herda a classe do ticker atual pela tabela de alias', () => {
  const sb = sandbox("var TICKERS_FIIS_BR = ['NOVO11']; var TICKERS_ACOES_BR = ['NEWA3'];\n"
    + "var tabela = { OLDA11: 'NOVO11', OLDB3: 'NEWA3' };\n"
    + 'function resolverAliasTicker_(t) { t = String(t).trim().toUpperCase(); return tabela[t] || t; }');
  assert.equal(sb.tickerAtualPorAlias_('olda11'), 'NOVO11');
  assert.equal(sb.classeProventoSemHistorico_('OLDA11', {}), 'FII');
  assert.equal(sb.classeProventoSemHistorico_('OLDB3', {}), 'BR');
  assert.equal(sb.classeProventoSemHistorico_('OLDC11', {}), '');
});

// 06/10/2026 (Tiago, Metas > Renda passiva): 12 meses terminando no último mês FECHADO; o mês corrente só conta no seu último dia
test('janelaProventos_ fechados: o mês de hoje conta como fechado só no ÚLTIMO dia (bordas: dia 1, dia 30 de mês de 31, fev 28/29, 31/dez)', () => {
  const sb = sandbox();
  const j = (hoje) => { const r = plain(sb.janelaProventos_(hoje, 'fechados', 12)); return `${r.inicio}..${r.fim}`; };
  assert.equal(j('2026-10-04'), '2025-10..2026-09');
  assert.equal(j('2026-10-01'), '2025-10..2026-09', 'dia 1: o mês passado');
  assert.equal(j('2026-10-30'), '2025-10..2026-09', 'dia 30 de um mês de 31 dias ainda é o mês em curso');
  assert.equal(j('2026-10-31'), '2025-11..2026-10', 'dia 31: outubro já fechou');
  assert.equal(j('2026-11-29'), '2025-11..2026-10');
  assert.equal(j('2026-11-30'), '2025-12..2026-11', 'dia 30 de novembro (último)');
  assert.equal(j('2026-02-27'), '2025-02..2026-01');
  assert.equal(j('2026-02-28'), '2025-03..2026-02', 'fev/2026 (28 dias): dia 28 é o último');
  assert.equal(j('2028-02-28'), '2027-02..2028-01', 'fev/2028 (bissexto): dia 28 ainda não é o último');
  assert.equal(j('2028-02-29'), '2027-03..2028-02', 'fev/2028 (bissexto): dia 29 é o último');
  assert.equal(j('2026-12-30'), '2025-12..2026-11');
  assert.equal(j('2026-12-31'), '2026-01..2026-12', '31/dez: o ano inteiro');
  assert.equal(j('2027-01-01'), '2026-01..2026-12', '1/jan: dezembro passou');
  // 'comMesAtual' não muda
  assert.equal(plain(sb.janelaProventos_('2026-10-31', 'comMesAtual', 12)).fim, '2026-10');
  // a soma acompanha a janela: no dia 31 os proventos do próprio mês entram
  const rec = [{ data: '2026-10-10', valor: 10 }, { data: '2025-10-10', valor: 5 }, { data: '2026-09-10', valor: 1 }];
  assert.equal(sb.somarProventosJanela_(rec, '2026-10-30', 'fechados', 12).total, 6);
  assert.equal(sb.somarProventosJanela_(rec, '2026-10-31', 'fechados', 12).total, 11);
});
