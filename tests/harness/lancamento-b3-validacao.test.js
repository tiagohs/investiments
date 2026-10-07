// tests/harness/lancamento-b3-validacao.test.js
//
// 07/10/2026 (Tiago: "enviei o lançamento da B3 ... cliquei em consolidar. O que ocorreu: duplicação da aplicação do LCI,
// e as minhas aplicações ainda continuam como a confirmar"). Causa: a coluna "Movimentação" de Transações Renda Fixa tem
// validação de dados "Compra,Venda" que REJEITA o resto; a B3 manda "APLICAÇÃO" pra LCI e o setValues do Apps Script parou
// na célula C - ficou só Produto+Data (2x, uma por tentativa) e o Tesouro da mesma importação nem entrou. E o "a confirmar"
// da LCI nunca fecharia: o aporte guarda "LCI - BANCO INTER S/A" e a B3 lança "LCI - <código>".
// O harness agora aplica as validações reais da planilha (extrair-fixtures.py!validacoes_por_aba). Este teste refaz o
// caminho do Tiago com a planilha real (fixtures.json): valores tirados das próprias fixtures (os aportes "a confirmar") e
// código de LCI inventado - nenhum número real no arquivo. Sem aporte de Renda Fixa a confirmar nas fixtures, um aporte
// INVENTADO é criado antes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarSandboxGs } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures.json');
const TEM = fs.existsSync(FIXTURES);
const plain = (x) => JSON.parse(JSON.stringify(x));
const pular = (t) => t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
const temValidacao = () => {
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  return ((raw['Transações Renda Fixa'] || {}).validacoes || []).length > 0;
};

function ambiente() {
  const { sandbox: sb } = criarSandboxGs({ fixturesPath: FIXTURES, silencioso: true });
  sb.Logger = { log() {} };
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  return { sb, ss };
}
const maisUmDia = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/** Os "a confirmar" de Renda Fixa; se a planilha não tiver, cria um aporte inventado (LCI + Tesouro) concluído. */
function pendentesRf(sb, ss) {
  let pend = plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).filter((p) => p.destino === 'rendaFixa');
  if (pend.length >= 2 && pend.some((p) => /^LCI/i.test(p.ativo))) return pend;
  sb.salvarAporte_({ data: '2026-10-05', status: 'concluido', observacao: 'teste', itens: [
    { classe: 'rendaFixa', ativo: 'LCI - BANCO TESTE S/A', instituicao: 'BANCO TESTE S/A', moeda: 'BRL', valorPlanejado: 500, valorFinal: 500 },
    { classe: 'rendaFixa', ativo: 'Tesouro Selic 2031', instituicao: 'XP INVESTIMENTOS CCTVM S/A.', moeda: 'BRL', valorPlanejado: 300, valorFinal: 300 },
  ] });
  pend = plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).filter((p) => p.destino === 'rendaFixa');
  return pend;
}

/** Os itens como o parser do extrato da B3 (lancamentos-parse.js) manda: LCI = "APLICAÇÃO" com o CÓDIGO no nome. */
function itensB3(pend) {
  return pend.map((p, i) => (/^LCI/i.test(p.ativo)
    ? { destino: 'rendaFixa', produto: `LCI - 99Z0000000${i}`, data: maisUmDia(p.data), movimentacao: 'APLICAÇÃO', entradaSaida: 'Credito', instituicao: p.inst, qtd: Math.round(p.valor * 100), preco: 0.01, valor: p.valor }
    : { destino: 'rendaFixa', produto: p.ativo, data: maisUmDia(p.data), movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: p.inst, qtd: 0.03, preco: Math.round((p.valor / 0.03) * 100) / 100, valor: p.valor }));
}

test('B3 › Renda Fixa: "APLICAÇÃO" (recusada pela validação "Compra,Venda") entra como Compra, linha COMPLETA; o Tesouro do mesmo arquivo também', (t) => {
  if (!TEM) return pular(t);
  if (!temValidacao()) return t.skip('fixtures sem as validações (extraia de novo com extrair-fixtures.py)');
  const { sb, ss } = ambiente();
  const pend = pendentesRf(sb, ss);
  assert.ok(pend.length >= 2, 'há aplicações de Renda Fixa a confirmar');
  const itens = itensB3(pend);

  const conf = plain(sb.importarLancamentos_(plain(itens), { simular: true, origem: 'Importação' }));
  assert.deepEqual(conf.itens.map((c) => c.situacao), itens.map(() => 'novo'), 'conferência: tudo novo, nada bloqueado');

  const r = plain(sb.importarLancamentos_(plain(itens), { origem: 'Importação' }));
  assert.equal(r.gravados.rendaFixa, itens.length);
  assert.equal((r.recusadas || []).length, 0);
  const aba = ss.getSheetByName('Transações Renda Fixa');
  const ultima = sb.ultimaLinhaPreenchidaLanc_(aba, sb.LANC_ABAS ? sb.LANC_ABAS.rendaFixa : { linha: 7, colChave: 1, cols: 8 });
  const linhas = plain(aba.getRange(ultima - itens.length + 1, 1, itens.length, 8).getValues());
  linhas.forEach((l) => {
    assert.equal(l[2], 'Compra', 'APLICAÇÃO vira Compra (a lista da planilha)');
    assert.ok(l.slice(3).every((v) => v !== '' && v !== null), `linha completa: ${JSON.stringify(l.slice(0, 1))}`);
  });

  // "a confirmar" fecha: a LCI com o código da B3 casa com o aporte "LCI - <instituição>" (tipo + instituição)
  const depois = plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).filter((p) => p.destino === 'rendaFixa');
  pend.forEach((p) => assert.ok(!depois.some((d) => d.id === p.id), `${p.ativo} saiu do "a confirmar"`));

  // importar o MESMO arquivo de novo não duplica (a planilha guardou "Compra"; o arquivo diz "APLICAÇÃO")
  const de2 = plain(sb.importarLancamentos_(plain(itens), { origem: 'Importação' }));
  assert.equal(de2.total, 0, 'reimportar não grava nada');
  assert.equal(de2.ignoradasDuplicadas, itens.length);
});

test('B3 › Renda Fixa: movimentação que a planilha não aceita (ex. "Juros") fica BLOQUEADA na conferência e nada da linha é gravado; o resto entra', (t) => {
  if (!TEM) return pular(t);
  if (!temValidacao()) return t.skip('fixtures sem as validações');
  const { sb, ss } = ambiente();
  const aba = ss.getSheetByName('Transações Renda Fixa');
  const cfg = { linha: 7, colChave: 1, cols: 8 };
  const antes = sb.ultimaLinhaPreenchidaLanc_(aba, cfg);
  const itens = [
    { destino: 'rendaFixa', produto: 'CDB - 99Z0000009', data: '2026-10-06', movimentacao: 'Juros', entradaSaida: 'Credito', instituicao: 'BANCO TESTE S/A', qtd: 1, preco: 12.34, valor: 12.34 },
    { destino: 'rendaFixa', produto: 'CDB - 99Z0000008', data: '2026-10-06', movimentacao: 'Resgate', entradaSaida: 'Debito', instituicao: 'BANCO TESTE S/A', qtd: 1, preco: 100, valor: 100 },
  ];
  const conf = plain(sb.importarLancamentos_(plain(itens), { simular: true }));
  assert.equal(conf.itens[0].situacao, 'bloqueado');
  assert.match(conf.itens[0].motivo, /Juros.*Movimentação.*Compra, Venda/);
  assert.equal(conf.itens[1].situacao, 'novo', 'Resgate vira Venda');
  const r = plain(sb.importarLancamentos_(plain(itens), {}));
  assert.equal(r.total, 1);
  assert.equal(sb.ultimaLinhaPreenchidaLanc_(aba, cfg), antes + 1, 'só a linha aceita (nenhuma pela metade)');
  assert.equal(plain(aba.getRange(antes + 1, 1, 1, 8).getValues())[0][2], 'Venda');
});

test('repararLancamentosIncompletosDireto: limpa só linha com Produto+Data e o resto vazio; simular não mexe', (t) => {
  if (!TEM) return pular(t);
  const { sb, ss } = ambiente();
  const aba = ss.getSheetByName('Transações Renda Fixa');
  const cfg = { linha: 7, colChave: 1, cols: 8 };
  sb.repararLancamentosIncompletosDireto({}); // a planilha real pode já ter linhas pela metade (o caso do Tiago): parte limpa
  const ult = sb.ultimaLinhaPreenchidaLanc_(aba, cfg);
  const data = new sb.Date(2026, 9, 6);
  aba.getRange(ult + 1, 1, 2, 2).setValues([['LCI - 99Z0000007', data], ['LCI - 99Z0000007', data]]);
  const sim = plain(sb.repararLancamentosIncompletosDireto({ simular: true }));
  const minhas = sim.filter((a) => a.ativo === 'LCI - 99Z0000007');
  assert.equal(minhas.length, 2);
  assert.equal(sb.ultimaLinhaPreenchidaLanc_(aba, cfg), ult + 2, 'simular não limpa');
  sb.repararLancamentosIncompletosDireto({});
  assert.equal(sb.ultimaLinhaPreenchidaLanc_(aba, cfg), ult, 'as 2 linhas pela metade saíram');
  assert.ok(plain(aba.getRange(ult, 1, 1, 8).getValues())[0].slice(2).some((v) => v !== ''), 'a linha completa de antes ficou');
});

// 07/10/2026 (Tiago: "em transações, na área de aporte, a soma mensal parece errada... desconsiderando os investimentos em
// renda fixa"): o cache das compras do "Investido por mês" era chaveado só pelo NÚMERO de linhas de cada aba - limpar as 2
// linhas pela metade e reimportar as 2 completas não mudava a contagem, e o mês seguia sem a LCI e o Tesouro.
test('Transações › Aportes: depois de limpar as linhas pela metade e reimportar (mesma contagem de linhas), o mês soma a Renda Fixa nova', (t) => {
  if (!TEM) return pular(t);
  if (!temValidacao()) return t.skip('fixtures sem as validações');
  const { sb, ss } = ambiente();
  const pend = pendentesRf(sb, ss);
  const itens = itensB3(pend);
  const mes = itens[0].data.slice(0, 7);
  const aba = ss.getSheetByName('Transações Renda Fixa');
  const cfg = { linha: 7, colChave: 1, cols: 8 };
  // o estado do Tiago: N linhas pela metade no fim da aba (uma por item da importação que falhou)
  sb.repararLancamentosIncompletosDireto({});
  const ult = sb.ultimaLinhaPreenchidaLanc_(aba, cfg);
  const dataPlan = sb.dataNaPlanilha_(ss, itens[0].data);
  aba.getRange(ult + 1, 1, itens.length, 2).setValues(itens.map((it) => [it.produto, dataPlan]));
  const totalMes = () => { const r = plain(sb.montarTelaTransacoes_()); return (r.resumo[mes] || {}).rendaFixa || 0; };
  const antes = totalMes(); // fica no cache
  sb.repararLancamentosIncompletosDireto({});
  const r = plain(sb.importarLancamentos_(plain(itens), { origem: 'Importação' }));
  assert.equal(r.gravados.rendaFixa, itens.length);
  assert.equal(sb.ultimaLinhaPreenchidaLanc_(aba, cfg), ult + itens.length, 'mesma contagem de linhas de antes');
  const soma = itens.reduce((s, it) => s + it.valor, 0);
  assert.ok(Math.abs(totalMes() - (antes + soma)) < 0.01, `Renda Fixa do mês: ${antes} + ${soma}`);
});
