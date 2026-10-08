// tests/harness/geracao-cache.test.js
//
// 08/10/2026 (Etapa 0 - "geração" dos dados; Tiago: "o cache às vezes dá falsos positivos"). Regra única: TODO cache
// derivado da planilha muda de chave quando a geração (carimbo de escrita, Planilha.gs!registrarEscritaPlanilha_) sobe.
// Pra cada tela: 1ª chamada (a frio) lê N células; a 2ª (cache) lê menos; depois de subir a geração, a 3ª tem de RECALCULAR
// (ler de novo ~N) - senão algum cache está preso a outra pista (contagem de linhas, dia...) e mostraria dado velho.
// Também: soltar uma trava de escrita sobe a geração; a leitura dos Gastos ({ leitura: true }) não; edição à mão
// (gatilhos "Ao editar"/"Ao alterar") sobe. Planilha real (fixtures.json) só como volume - nenhum número no arquivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarSandboxPrevia } from './previa.mjs';
import { instanteDasFixtures } from './gas-vm-harness.mjs';
import { exigirFixtures } from './fixtures-exigidas.mjs';

function medidor(sb) {
  const c = { celulas: 0 };
  const ssOrig = sb.SpreadsheetApp.getActiveSpreadsheet();
  const ss = {
    ...ssOrig,
    getSheetByName(nome) {
      const s = ssOrig.getSheetByName(nome);
      if (!s) return s;
      return new Proxy(s, {
        get(t, p) {
          if (p !== 'getRange') { const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; }
          return (...a) => {
            const r = t.getRange(...a);
            const nr = typeof a[0] === 'string' ? 1 : (a[2] ?? 1);
            const nc = typeof a[0] === 'string' ? 1 : (a[3] ?? 1);
            return new Proxy(r, { get(rt, rp) { if (rp === 'getValues') return () => { c.celulas += nr * nc; return rt.getValues(); }; const v = rt[rp]; return typeof v === 'function' ? v.bind(rt) : v; } });
          };
        },
      });
    },
    getSpreadsheetTimeZone: () => ssOrig.getSpreadsheetTimeZone(),
    insertSheet: (n) => ssOrig.insertSheet(n),
  };
  sb.SpreadsheetApp.getActiveSpreadsheet = () => ss; sb.SpreadsheetApp.getActive = () => ss;
  sb.UrlFetchApp = { fetch() { throw new Error('rede indisponível no teste'); }, fetchAll() { throw new Error('rede indisponível no teste'); } };
  return (acao, params = {}) => {
    c.celulas = 0;
    const texto = sb.doGet({ parameter: { action: acao, token: 'x', ...params } }).getContent();
    return { celulas: c.celulas, texto };
  };
}

const ACOES = [
  ['home'], ['ativo', { ref: 'PETR4' }], ['proventos'], ['metas'], ['metasHistorico'], ['distribuicoesMetas'], ['patrimonio'],
  ['salario'], ['gastos'], ['meusAtivos'], ['carteirasHome'], ['carteirasAcoes'], ['carteirasFiis'], ['carteirasAcoesEua'],
  ['carteirasRendaFixa'], ['transacoes'],
];

for (const [acao, params] of ACOES) {
  test(`geração: "${acao}" recalcula depois que a geração sobe (nenhum cache preso a outra pista)`, (t) => {
    if (!exigirFixtures(t)) return;
    const sb = montarSandboxPrevia({ agora: instanteDasFixtures() });
    const medir = medidor(sb);
    const frio = medir(acao, params);
    const quente = medir(acao, params);
    sb.registrarEscritaPlanilha_();
    // ÚNICA exceção: o IPCA 12 meses do benchmark (benchmark_ipca12m) vem do Banco Central/aba de índices e só muda na
    // sincronização diária - recalcular a cada gravação gastaria rede e ~26 mil células à toa. Ele sai do cache aqui pra
    // a conta comparar só o resto.
    sb.CacheService.getScriptCache().remove('benchmark_ipca12m');
    const depois = medir(acao, params);
    t.diagnostic(`${acao}: frio ${frio.celulas}, cache ${quente.celulas}, depois da geração ${depois.celulas}`);
    if (quente.celulas < frio.celulas * 0.9) {
      assert.ok(depois.celulas >= frio.celulas * 0.9, `${acao}: depois da geração leu ${depois.celulas} de ${frio.celulas} células - algum cache não seguiu a geração`);
    }
    assert.equal(JSON.parse(depois.texto).ok, JSON.parse(frio.texto).ok);
  });
}

test('geração: soltar trava de escrita sobe; trava de leitura (Gastos) não; gatilhos "Ao editar"/"Ao alterar" sobem', (t) => {
  if (!exigirFixtures(t)) return;
  const sb = montarSandboxPrevia({ agora: instanteDasFixtures() });
  const g = () => sb.carimboEscritaPlanilha_();
  let antes = g();
  const espera = () => { const t0 = Date.now(); while (Date.now() === t0) { /* o carimbo é Date.now() */ } };
  espera();
  const tr = sb.travaRecurso_('carteira', 'teste'); tr.waitLock(1000); tr.releaseLock();
  assert.notEqual(g(), antes, 'trava de escrita');
  antes = g(); espera();
  const lt = sb.travaRecurso_('gastos', 'teste', { leitura: true }); lt.waitLock(1000); lt.releaseLock();
  assert.equal(g(), antes, 'trava só de leitura');
  espera(); sb.aoEditarPlanilha_({ range: null });
  assert.notEqual(g(), antes, 'Ao editar');
  antes = g(); espera(); sb.aoAlterarPlanilha_({ changeType: 'EDIT' });
  assert.equal(g(), antes, '"Ao alterar" de EDIT já foi contado pelo "Ao editar"');
  sb.aoAlterarPlanilha_({ changeType: 'INSERT_ROW' });
  assert.notEqual(g(), antes, 'Ao alterar (linha inserida)');
});
