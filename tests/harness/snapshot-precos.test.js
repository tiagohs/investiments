// tests/harness/snapshot-precos.test.js - 06/10/2026 (A-56, modo sombra): SnapshotPrecos.gs grava o preço do dia numa aba
// nova (aux_snapshot-precos) sem tocar na série atual, e compararSnapshotPrecos() cruza as duas e escreve o resumo no
// Registro de Controle. Todos os .gs carregados de verdade em planilha falsa; dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, AbaFalsa, sandboxGas, D, iso, plain } from './planilha-falsa.mjs';

const cab = ['Classe', 'Ticker', 'Nome', 'Tipo', 'Moeda', 'Preço Atual', 'Variação dia', 'Quantidade'];
const CAB_HIST = ['Data', 'Ticker', 'Classe', 'Cotas', 'Preço', 'Valor', 'Câmbio', 'Valor BRL'];

function montar(agoraIso, { ativos, historico } = {}) {
  const ss = planilhaFalsa({});
  const ctx = sandboxGas(ss, { agora: new Date(agoraIso) });
  const add = (nome, linhas) => { ss.abas[nome] = new AbaFalsa(nome, linhas); return ss.abas[nome]; };
  add('Auxiliar_ativos', [cab, ...(ativos || [
    ['Ações', 'AAAA3', 'Empresa A', '', 'R$', 10.5, 0.01, 100],
    ['FIIs', 'BBBB11', 'Fundo B', '', 'R$', 100, -0.002, 10],
    ['Ações EUA', 'CCC', 'Empresa C', '', 'US$', 20.25, 0.03, 5],
    ['Ações', 'DDDD3', 'Sem preço', '', 'R$', '#N/A', '', 1],
  ])]);
  add('Registro de Controle', [['Timestamp', 'Origem', 'Status', 'Detalhe']]);
  if (historico) add('aux_historico-patrimonio', [CAB_HIST, ...historico(ctx.sb)]);
  return { ss, ...ctx };
}

const snap = (ss) => {
  const aba = ss.aba('aux_snapshot-precos');
  const out = [];
  for (let r = 2; r <= aba.getLastRow(); r += 1) { const l = aba.valores(r); if (l[0] !== '') out.push({ dia: iso(l[0]), ticker: l[1], classe: l[2], moeda: l[3], preco: l[4], variacao: l[5] }); }
  return out;
};

test('SnapshotPrecos: cria a aba, grava 1 linha por ativo com preço (ignora #N/A) e é idempotente no mesmo dia', () => {
  const { ss, sb } = montar('2026-10-06T21:40:00Z');
  const r = plain(sb.gravarSnapshotPrecosHoje_());
  assert.equal(r.dia, '2026-10-06');
  assert.equal(r.gravados, 3);
  assert.deepEqual(r.ignorados, ['DDDD3']);
  assert.deepEqual(ss.aba('aux_snapshot-precos').valores(1), ['Data', 'Ticker', 'Classe', 'Moeda', 'Preço', 'Variação dia', 'Gravado em']);
  assert.deepEqual(snap(ss), [
    { dia: '2026-10-06', ticker: 'AAAA3', classe: 'Ações', moeda: 'R$', preco: 10.5, variacao: 0.01 },
    { dia: '2026-10-06', ticker: 'BBBB11', classe: 'FIIs', moeda: 'R$', preco: 100, variacao: -0.002 },
    { dia: '2026-10-06', ticker: 'CCC', classe: 'Ações EUA', moeda: 'US$', preco: 20.25, variacao: 0.03 },
  ]);
  // roda de novo no mesmo dia, com preço mudado: regrava as mesmas linhas, sem duplicar
  ss.aba('Auxiliar_ativos').getRange(2, 6).setValue(10.7);
  const r2 = plain(sb.gravarSnapshotPrecosHoje_());
  assert.equal(r2.regravou, true);
  assert.equal(snap(ss).length, 3);
  assert.equal(snap(ss)[0].preco, 10.7);
  // outro dia: acrescenta no fim, em ordem cronológica
  const b = montar('2026-10-07T21:40:00Z');
  b.ss.abas['aux_snapshot-precos'] = ss.aba('aux_snapshot-precos');
  b.sb.gravarSnapshotPrecosHoje_();
  const dias = snap(b.ss).map((x) => x.dia);
  assert.deepEqual(dias, ['2026-10-06', '2026-10-06', '2026-10-06', '2026-10-07', '2026-10-07', '2026-10-07']);
});

test('SnapshotPrecos: regravar o mesmo dia com MENOS ativos limpa as linhas que sobraram', () => {
  const { ss, sb } = montar('2026-10-06T21:40:00Z');
  sb.gravarSnapshotPrecosHoje_();
  ss.aba('Auxiliar_ativos').getRange(3, 6).setValue('#N/A');
  sb.gravarSnapshotPrecosHoje_();
  assert.deepEqual(snap(ss).map((x) => x.ticker), ['AAAA3', 'CCC']);
});

test('SnapshotPrecos: 1 getValues em Auxiliar_ativos e 1 setValues por execução (mais a leitura da cauda da aba)', () => {
  const { ss, sb } = montar('2026-10-06T21:40:00Z');
  sb.gravarSnapshotPrecosHoje_(); // cria a aba
  const contagem = { getValuesAtivos: 0, setValuesSnap: 0 };
  const origAtivos = ss.abas['Auxiliar_ativos'].getRange.bind(ss.abas['Auxiliar_ativos']);
  ss.abas['Auxiliar_ativos'].getRange = (...a) => { const r = origAtivos(...a); const g = r.getValues.bind(r); r.getValues = () => { contagem.getValuesAtivos += 1; return g(); }; return r; };
  const origSnap = ss.abas['aux_snapshot-precos'].getRange.bind(ss.abas['aux_snapshot-precos']);
  ss.abas['aux_snapshot-precos'].getRange = (...a) => { const r = origSnap(...a); const s = r.setValues.bind(r); r.setValues = (v) => { contagem.setValuesSnap += 1; return s(v); }; return r; };
  sb.gravarSnapshotPrecosHoje_();
  assert.deepEqual(contagem, { getValuesAtivos: 1, setValuesSnap: 1 });
});

test('SnapshotPrecos: sem nenhum preço em Auxiliar_ativos, lança erro (a etapa da agenda falha em vez de gravar vazio)', () => {
  const { sb } = montar('2026-10-06T21:40:00Z', { ativos: [['Ações', 'AAAA3', 'A', '', 'R$', '#N/A', '', 1]] });
  assert.throws(() => sb.gravarSnapshotPrecosHoje_(), /nenhum ativo com preço/);
});

test('compararSnapshotPrecos: cruza (dia, ticker) com aux_historico-patrimonio e escreve o resumo no Registro', () => {
  const historico = (sb) => [
    // 06/10: AAAA3 igual, BBBB11 igual (dentro de 0,5%), CCC bem diferente; 05/10 tem linhas só do histórico (sem snapshot)
    [D(sb, '2026-10-06', 16, 56), 'AAAA3', 'BR', 100, 10.5, 1050, '', 1050],
    [D(sb, '2026-10-06', 16, 56), 'BBBB11', 'BR', 10, 100.2, 1002, '', 1002],
    [D(sb, '2026-10-06', 16, 0), 'CCC', 'USA', 5, 22, 110, 5.5, 605],
    [D(sb, '2026-10-05', 16, 56), 'AAAA3', 'BR', 100, 10.4, 1040, '', 1040],
    // 07/10 (snapshot de outro dia): AAAA3 diferente 3%
    [D(sb, '2026-10-07', 16, 56), 'AAAA3', 'BR', 100, 10.2, 1020, '', 1020],
  ];
  const { ss, sb } = montar('2026-10-06T21:40:00Z', { historico });
  sb.gravarSnapshotPrecosHoje_(); // 06/10
  // dia 07: dois preços e um ticker (EEEE3) sem linha no histórico
  const aba = ss.aba('aux_snapshot-precos');
  const prox = aba.getLastRow() + 1;
  aba.getRange(prox, 1, 3, 5).setValues([
    [D(sb, '2026-10-07'), 'AAAA3', 'Ações', 'R$', 10.5],
    [D(sb, '2026-10-07'), 'EEEE3', 'Ações', 'R$', 3.3],
    [D(sb, '2026-10-08'), 'AAAA3', 'Ações', 'R$', 10.5], // dia 08: ainda sem linha na série (hoje só tem par amanhã)
  ]);
  const r = plain(sb.compararSnapshotPrecos());
  assert.equal(r.dias, 3);
  assert.equal(r.pares, 4);       // 06/10 x3 + 07/10 AAAA3
  assert.equal(r.iguais, 2);      // AAAA3 e BBBB11 em 06/10
  assert.equal(r.diferentes, 2);  // CCC em 06/10 e AAAA3 em 07/10
  assert.equal(r.semHistorico, 2); // EEEE3 em 07/10 e AAAA3 em 08/10
  const reg = ss.aba('Registro de Controle');
  const linhas = []; for (let i = 2; i <= reg.getLastRow(); i += 1) linhas.push(reg.valores(i));
  assert.ok(linhas.length >= 4, 'resumo + por dia + 2 tickers');
  assert.match(linhas[0][3], /Snapshot de preços x série atual .*3 dia\(s\), 4 par\(es\) ticker\/dia, 2 igual\(is\).*2 diferente\(s\), 2 sem linha na série/);
  assert.match(linhas[1][3], /^Por dia: 06\/10 2\/3 iguais \(maior CCC -7,95%\); 07\/10 0\/1 iguais \(maior AAAA3 \+2,94%\)/);
  assert.match(linhas[2][3], /^CCC: 1\/1 dia\(s\) diferem; maior em 06\/10 - snapshot 20,25 x série atual 22 \(-7,95%\)/); // o pior ticker primeiro
  assert.ok(linhas.some((l) => /^AAAA3: 1\/2 dia\(s\) diferem; maior em 07\/10/.test(l[3])));
  assert.ok(linhas.every((l) => l[1] === 'Manual' && l[4] === 'snapshotPrecos'));
  // não mexeu na série atual
  assert.equal(ss.aba('aux_historico-patrimonio').getLastRow(), 6);
});

test('compararSnapshotPrecos: sem snapshot (ou sem dia em comum) avisa no Registro em vez de dar erro', () => {
  const { ss, sb } = montar('2026-10-06T21:40:00Z', { historico: () => [] });
  const r = plain(sb.compararSnapshotPrecos());
  assert.equal(r.pares, 0);
  assert.match(ss.aba('Registro de Controle').valores(2)[3], /nenhum par \(dia, ticker\) comparável ainda/);
});
