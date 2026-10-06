// tests/harness/abas-contrato.test.js
//
// 06/10/2026 (A-74): contrato das abas da planilha. Um teste por aba que o código (apps-script/*.gs) usa:
//  - a aba está em fixtures.json? Se não: modo normal pula DIZENDO qual aba; CI_ESTRITO=1 falha. Aba que o código
//    cria sozinho no 1º uso (insertSheet) ou marcada `opcional` pode faltar sem falhar;
//  - os cabeçalhos/rótulos batem com contrato-abas.mjs? (troca de planilha - Controle N+1 - que mexe numa coluna
//    aparece aqui com a célula exata, em vez de números deslocados nas telas);
//  - toda aba usada pelo código tem entrada no contrato (aba nova no .gs obriga a atualizar o contrato e o extrator).
// Sem fixtures.json, só o último teste (código x contrato) roda: ele não precisa de dado nenhum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abasDoCodigo, abasNasFixtures, exigirFixtures, CI_ESTRITO, TEM_FIXTURES } from './fixtures-exigidas.mjs';
import { CONTRATO_ABAS, divergenciasDoContrato } from './contrato-abas.mjs';
import { lerFixturesRaw_ } from './gas-vm-harness.mjs';
import { FIXTURES_PATH } from './fixtures-exigidas.mjs';

const doCodigo = abasDoCodigo();

test('toda aba que o código usa tem entrada em tests/harness/contrato-abas.mjs (aba nova: acrescente lá e confira o extrair-fixtures.py)', () => {
  const semContrato = Object.keys(doCodigo).filter((n) => !(n in CONTRATO_ABAS))
    .map((n) => `"${n}" (usada em ${doCodigo[n].arquivos.join(', ')})`);
  assert.deepEqual(semContrato, [], 'aba(s) usada(s) no código sem contrato');
  const sobrando = Object.keys(CONTRATO_ABAS).filter((n) => !(n in doCodigo));
  assert.deepEqual(sobrando, [], 'contrato de aba que nenhum .gs usa mais - remova de contrato-abas.mjs');
});

for (const [nome, info] of Object.entries(doCodigo).sort(([a], [b]) => a.localeCompare(b))) {
  test(`aba "${nome}": existe em fixtures.json e os cabeçalhos batem com o contrato (${info.arquivos.slice(0, 3).join(', ')})`, (t) => {
    const contrato = CONTRATO_ABAS[nome] || {};
    const pode_faltar = info.criadaPeloCodigo || contrato.opcional;
    const tem = TEM_FIXTURES && abasNasFixtures().includes(nome);
    if (!tem) {
      if (pode_faltar && TEM_FIXTURES) { t.diagnostic(`aba "${nome}" ainda não existe na planilha exportada (o código cria no 1º uso) - nada a conferir`); return; }
      if (!exigirFixtures(t, [nome])) return; // pula (ou falha em CI_ESTRITO) dizendo qual aba falta
    }
    const aba = lerFixturesRaw_(FIXTURES_PATH)[nome];
    assert.deepEqual(divergenciasDoContrato(nome, aba, contrato), []);
  });
}

test('contrato: divergenciasDoContrato aponta a célula, o esperado e o que veio (dados inventados)', () => {
  const aba = { linhas: [['Data', 'Ticker', 'Classe'], ['x']] };
  const contrato = { cabecalho: { linha: 1, colunas: ['Data', 'Ticker', 'Classe', 'Cotas'] }, rotulos: [[2, 1, 'Y']] };
  assert.deepEqual(divergenciasDoContrato('aba inventada', aba, contrato), [
    'aba "aba inventada", célula D1: esperava o cabeçalho "Cotas" e veio null',
    'aba "aba inventada", célula A2: esperava o rótulo "Y" e veio "x"',
  ]);
  assert.deepEqual(divergenciasDoContrato('ok', { linhas: [[' PREÇO  atual ']] }, { cabecalho: { linha: 1, colunas: ['Preço Atual'] } }), []);
  assert.equal(typeof CI_ESTRITO, 'boolean');
});
