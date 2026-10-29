// tests/harness/emagrecer-planilha.test.js - 29/10/2026 (ADR-08, apps-script/EmagrecerPlanilha.gs): tirar as fórmulas das
// linhas VAZIAS das abas de lançamentos (com uma margem) e esvaziar as abas aux_tests*, sem perder dado nem fórmula de
// linha com dado; e a gravação do site completa as fórmulas de uma linha nova que passe da margem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const plain = (x) => JSON.parse(JSON.stringify(x));
const D = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

/** Aba falsa com valor E fórmula por célula. Fórmula guardada como texto (o mesmo em A1 e R1C1 - basta pra comparar). */
function abaFalsa(nome, { linhas = [], formulas = {}, maxRows = 60, maxCols = 14 } = {}) {
  const v = linhas.map((l) => [...l]);
  const f = []; // f[r][c]
  let max = maxRows;
  const cols = maxCols;
  Object.entries(formulas).forEach(([k, txt]) => { const [r, c] = k.split(',').map(Number); (f[r - 1] || (f[r - 1] = []))[c - 1] = txt; });
  const val = (r, c) => { const x = (v[r] || [])[c]; return x == null ? '' : x; };
  const form = (r, c) => (f[r] || [])[c] || '';
  const aba = {
    _v: v, _f: f,
    getName: () => nome,
    getMaxRows: () => max,
    getLastColumn: () => cols,
    getLastRow: () => { for (let i = max - 1; i >= 0; i--) for (let j = 0; j < cols; j++) if (val(i, j) !== '' || form(i, j)) return i + 1; return 0; },
    insertRowsAfter: (_, n) => { max += n; },
    deleteRows: (r, n) => { v.splice(r - 1, n); f.splice(r - 1, n); max -= n; },
    deleteRow: (r) => aba.deleteRows(r, 1),
    getRange: (r1, c1, n = 1, nc = 1) => {
      const mapa = (fn) => Array.from({ length: n }, (_, i) => Array.from({ length: nc }, (_, j) => fn(r1 - 1 + i, c1 - 1 + j)));
      const por = (m, fn) => m.forEach((l, i) => l.forEach((x, j) => fn(r1 - 1 + i, c1 - 1 + j, x)));
      return {
        getValues: () => mapa((r, c) => (form(r, c) ? `=${form(r, c)}` : val(r, c))), // fórmula "calcula" pro próprio texto
        getValue: () => val(r1 - 1, c1 - 1),
        getFormulas: () => mapa(form),
        getFormulasR1C1: () => mapa(form),
        setValues: (m) => por(m, (r, c, x) => { (v[r] || (v[r] = []))[c] = x; if (f[r]) f[r][c] = ''; }),
        setFormulasR1C1: (m) => por(m, (r, c, x) => { (f[r] || (f[r] = []))[c] = x; }),
        clearContent: () => por(mapa(() => 0), (r, c) => { if (v[r]) v[r][c] = ''; if (f[r]) f[r][c] = ''; }),
        copyTo: () => {},
        sort: ({ column }) => {
          const k = column - c1;
          const bloco = Array.from({ length: n }, (_, i) => (v[r1 - 1 + i] || []).slice(c1 - 1, c1 - 1 + nc));
          const t = (x) => (x instanceof Date ? x.getTime() : x);
          bloco.sort((a, b) => (t(a[k]) < t(b[k]) ? -1 : t(a[k]) > t(b[k]) ? 1 : 0));
          bloco.forEach((l, i) => l.forEach((x, j) => { (v[r1 - 1 + i] || (v[r1 - 1 + i] = []))[c1 - 1 + j] = x; }));
        },
      };
    },
  };
  return aba;
}

const cab = (n) => Array.from({ length: n }, () => ['']);
/** Transações: cabeçalho na 6, 3 compras (7-9), fórmulas G:N prontas até a linha 200 (como a planilha real até a 10 mil). */
function transacoes({ ate = 200, digitadoEm = null } = {}) {
  const formulas = {};
  for (let r = 7; r <= ate; r++) {
    formulas[`${r},7`] = 'R[0]C[-3]*R[0]C[-2]';
    formulas[`${r},11`] = 'IF(R[0]C[-10]="";0;1)';
    formulas[`${r},13`] = 'IF(R[0]C[-12]="";"";HOJE()-R[0]C[-11])';
  }
  const linhas = [...cab(5), ['Ticker', 'Data', 'Tipo', 'Preço', 'Qtd.', 'Taxa'],
    ['ABCD3', D('2026-08-10'), 'Compra', 20, 10, ''], ['TEST11', D('2026-08-12'), 'Compra', 100, 1, ''], ['TEST11', D('2026-08-13'), 'Compra', 101, 1, '']];
  const aba = abaFalsa('Transações', { linhas, formulas, maxRows: ate, maxCols: 14 });
  if (digitadoEm) aba.getRange(digitadoEm, 14).setValues([['anotação']]);
  return aba;
}

function planilha(abas) {
  const porNome = Object.fromEntries(abas.map((a) => [a.getName(), a]));
  return { getSheetByName: (n) => porNome[n] || null, getSheets: () => abas, insertSheet: (n) => (porNome[n] = abaFalsa(n)) };
}

function sandbox(ss) {
  const sb = {
    console: { log() {} }, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: { formatDate: () => '20261029-101010', parseDate: (t) => { const [a, b, c] = String(t).slice(0, 10).split('-').map(Number); return new Date(a, b - 1, c); } },
    chaveDiaISOInicio_: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    normalizarInstituicaoRF_: (i) => String(i || '').toUpperCase(),
    classesDaCarteiraParaProventos_: () => ({ ABCD3: 'acoes', TEST11: 'fiis' }),
    gravarRegistroControle_: () => {}, limparCacheHistoricoInicio_: () => {}, jsonOut: (x) => x,
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  new vm.Script(['Planilha.gs', 'ImportB3.gs', 'Lancamentos.gs', 'Aportes.gs', 'Deduplicacao.gs', 'CarteirasHome.gs', 'NovoAtivo.gs', 'ExportarPlanilha.gs', 'EmagrecerPlanilha.gs']
    .map((f) => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8')).join('\n'), { filename: 'emagrecer.gs' }).runInContext(sb);
  return sb;
}

const formulasEm = (aba, r) => aba.getRange(r, 1, 1, 14).getFormulas()[0].filter(Boolean).length;

test('simulação: conta o que sairia (abaixo dos dados + margem), inclusive HOJE(); não mexe em nada', () => {
  const aba = transacoes();
  const ss = planilha([aba]);
  const sb = sandbox(ss);
  const r = plain(sb.emagrecerPlanilha_(ss, { executar: false, margem: 10 }));
  const t = r.abas.find((a) => a.aba === 'Transações');
  assert.equal(t.ultimaLinhaComDado, 9);
  assert.equal(t.manterAte, 19, '9 + margem de 10');
  assert.equal(t.formulasRemovidas, (200 - 19) * 3);
  assert.equal(t.hojeRemovidos, 200 - 19);
  assert.equal(t.hojeQueFicam, 19 - 6, 'os HOJE() das linhas que ficam só são contados');
  assert.deepEqual(t.colunas.map((c) => c.coluna), ['G', 'K', 'M']);
  assert.equal(formulasEm(aba, 150), 3, 'simulação não apaga');
  assert.equal(aba.getLastRow(), 200);
  assert.match(sb.textoRelatorioEmagrecer_(r), /SIMULAÇÃO/);
});

test('executar: linhas com dado e a margem ficam como estavam; abaixo, só as fórmulas saem (nenhuma linha removida)', () => {
  const aba = transacoes();
  const ss = planilha([aba]);
  const sb = sandbox(ss);
  const antes = aba.getRange(7, 1, 3, 14).getValues().map((l) => l.map(String));
  const r = plain(sb.emagrecerPlanilha_(ss, { executar: true, margem: 10 }));
  assert.equal(r.executado, true);
  assert.equal(r.formulasRemovidas, (200 - 19) * 3);
  assert.deepEqual(aba.getRange(7, 1, 3, 14).getValues().map((l) => l.map(String)), antes, 'linhas com dado intactas');
  assert.equal(formulasEm(aba, 19), 3, 'a margem continua com fórmula');
  assert.equal(formulasEm(aba, 20), 0);
  assert.equal(formulasEm(aba, 200), 0);
  assert.equal(aba.getMaxRows(), 200, 'nenhuma linha removida (as referências das outras abas não mudam)');
  assert.equal(aba.getLastRow(), 19, 'getLastRow cai pra margem - as leituras param ali');
  // rodar de novo não tira mais nada
  assert.equal(plain(sb.emagrecerPlanilha_(ss, { executar: true, margem: 10 })).formulasRemovidas, 0);
});

test('coluna com valor DIGITADO abaixo dos dados não é tocada (e aparece no relatório)', () => {
  const aba = transacoes({ digitadoEm: 150 });
  aba.getRange(100, 14).setFormulasR1C1([['R[0]C[-1]']]);
  const ss = planilha([aba]);
  const sb = sandbox(ss);
  const r = plain(sb.emagrecerPlanilha_(ss, { executar: true, margem: 10 }));
  const t = r.abas[0];
  assert.deepEqual(t.colunasComValorDigitado.map((c) => c.coluna), ['N']);
  assert.equal(aba.getRange(150, 14).getValue(), 'anotação');
  assert.equal(aba.getRange(100, 14, 1, 1).getFormulas()[0][0], 'R[0]C[-1]', 'a fórmula da coluna N também fica');
  assert.match(sb.textoRelatorioEmagrecer_(r), /N: NÃO mexi/);
});

test('aux_tests*: fica só o cabeçalho (os testes manuais continuam gravando logo abaixo); outras abas nem são lidas', () => {
  const formulas = {};
  for (let r = 2; r <= 300; r++) for (let c = 1; c <= 8; c++) formulas[`${r},${c}`] = 'R[-1]C[0]+1';
  const testes = abaFalsa('aux_tests', { linhas: [['Data', 'Ticker', 'Classe', 'Cotas', 'Preço', 'Valor', 'Câmbio', 'Valor BRL']], formulas, maxRows: 300, maxCols: 8 });
  const outra = abaFalsa('aux_historico-patrimonio', { linhas: [['Data']], formulas: { '2,1': 'X' }, maxRows: 5, maxCols: 8 });
  const ss = planilha([testes, outra]);
  const sb = sandbox(ss);
  const r = plain(sb.emagrecerPlanilha_(ss, { executar: true }));
  assert.deepEqual(r.testes.map((t) => [t.aba, t.formulasRemovidas, t.linhasRemovidas]), [['aux_tests', 299 * 8, 298]]);
  assert.equal(testes.getMaxRows(), 2);
  assert.equal(testes.getRange(1, 1).getValue(), 'Data');
  assert.equal(testes.getLastRow(), 1);
  assert.equal(outra.getRange(2, 1, 1, 1).getFormulas()[0][0], 'X', 'aba que não começa com aux_tests fica como está');
});

test('aux_tests com linhas congeladas (bug 29/10/2026: "Não é possível excluir todas as linhas não congeladas"): fica 1 linha livre', () => {
  const formulas = {};
  for (let r = 3; r <= 50; r++) formulas[`${r},1`] = 'R[-1]C[0]+1';
  const testes = abaFalsa('aux_tests', { linhas: [['Data'], ['Sub']], formulas, maxRows: 50, maxCols: 8 });
  testes.getFrozenRows = () => 2;
  const del = testes.deleteRows;
  testes.deleteRows = (r, n) => { if (r + n - 1 >= testes.getMaxRows() && r <= 3) throw new Error('Não é possível excluir todas as linhas não congeladas.'); return del(r, n); };
  const ss = planilha([testes]);
  const sb = sandbox(ss);
  const r = plain(sb.emagrecerPlanilha_(ss, { executar: true }));
  assert.equal(testes.getMaxRows(), 3, '2 congeladas + 1 livre');
  assert.equal(r.testes[0].linhasRemovidas, 47);
  assert.equal(testes.getRange(1, 1).getValue(), 'Data');
  assert.equal(testes.getRange(2, 1).getValue(), 'Sub', 'linha congelada (cabeçalho) não é apagada');
  assert.equal(testes.getLastRow(), 2);
});

test('gravação do site depois do emagrecimento: linha além da margem ganha as fórmulas da linha de cima', () => {
  const aba = transacoes();
  const ss = planilha([aba, abaFalsa('Carteira Ações', { linhas: [['Ticker'], ['ABCD3']] }), abaFalsa('Carteira FIIs', { linhas: [['Ticker'], ['TEST11']] }),
    abaFalsa('Auxiliar_ativos', { linhas: [['Classe', 'Ticker'], ['Ações', 'ABCD3'], ['FIIs', 'TEST11']] })]);
  const sb = sandbox(ss);
  sb.emagrecerPlanilha_(ss, { executar: true, margem: 0 }); // sem margem: a próxima linha (10) já não tem fórmula
  assert.equal(formulasEm(aba, 10), 0);
  const r = plain(sb.importarLancamentos_([{ destino: 'transacoes', ticker: 'ABCD3', data: '2026-09-01', tipo: 'Compra', preco: 21, qtd: 2, taxa: 0 }], { origem: 'Teste' }));
  assert.equal(r.gravados.transacoes, 1, JSON.stringify(r));
  assert.equal(aba.getRange(10, 1).getValue(), 'ABCD3');
  assert.deepEqual(aba.getRange(10, 1, 1, 14).getFormulas()[0].filter(Boolean), ['R[0]C[-3]*R[0]C[-2]', 'IF(R[0]C[-10]="";0;1)', 'IF(R[0]C[-12]="";"";HOJE()-R[0]C[-11])']);
  // linha que já tem fórmula (dentro da margem): nada é copiado
  assert.equal(sb.garantirFormulasLanc_(aba, sb.LANC_ABAS.transacoes, 10, 10), 0);
});

/** Drive pela API REST (o projeto só tem drive.readonly + drive.file - DriveApp.makeCopy pedia o escopo "drive" inteiro). */
function comDrive(sb, { copia = 200, criar = 200, upload = 200 } = {}) {
  const chamadas = [];
  const props = new Map([['COPIA_XLSX_PASTA_ID', 'PASTA1']]);
  sb.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) };
  sb.ScriptApp = { getOAuthToken: () => 'tk' };
  sb.DriveApp = { getFileById: () => { throw new Error('não deveria usar DriveApp'); } };
  const resp = (code, corpo) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(corpo), getBlob: () => ({ setContentType() {} }) });
  sb.UrlFetchApp = {
    fetch: (url, op = {}) => {
      chamadas.push({ url, metodo: op.method || 'get', corpo: op.payload });
      if (/\/files\/PASTA1\?/.test(url)) return resp(200, { id: 'PASTA1' });
      if (/\/copy\?/.test(url)) return resp(copia, copia === 200 ? { id: 'COPIA1', webViewLink: 'https://docs.google.com/x' } : { error: { message: 'insufficient' } });
      if (/\/export\?format=xlsx/.test(url)) return resp(200, {});
      if (/upload\/drive/.test(url)) return resp(upload, { id: 'X1', size: upload === 200 ? '123' : '0' });
      if (/\/drive\/v3\/files\?/.test(url)) return resp(criar, { id: 'X1', webViewLink: 'https://drive/x1' });
      return resp(404, {});
    },
  };
  return chamadas;
}

test('cópia de segurança (bug 29/10/2026): sem DriveApp/escopo novo - cópia nativa pela API; se recusada, .xlsx novo; sem cópia nada é alterado', () => {
  const ss = { ...planilha([transacoes()]), getId: () => 'PLAN1', getName: () => 'Investimentos' };
  let sb = sandbox(ss);
  let ch = comDrive(sb);
  const nativa = plain(sb.copiaDeSegurancaEmagrecer_(ss));
  assert.equal(nativa.tipo, 'planilha do Google');
  assert.ok(ch.some((c) => /files\/PLAN1\/copy/.test(c.url) && JSON.parse(c.corpo).parents[0] === 'PASTA1'));

  sb = sandbox(ss);
  ch = comDrive(sb, { copia: 403 });
  const xlsx = plain(sb.copiaDeSegurancaEmagrecer_(ss));
  assert.equal(xlsx.tipo, '.xlsx');
  assert.match(xlsx.nome, /antes de emagrecer .*\.xlsx$/);
  assert.ok(ch.some((c) => /upload\/drive\/v3\/files\/X1/.test(c.url)), 'conteúdo enviado ao arquivo novo');

  // sem cópia: lança e a planilha fica como estava
  const aba = transacoes();
  const ss2 = { ...planilha([aba]), getId: () => 'PLAN1', getName: () => 'Investimentos' };
  sb = sandbox(ss2);
  comDrive(sb, { copia: 403, upload: 500 });
  sb.SpreadsheetApp = { getActiveSpreadsheet: () => ss2 };
  assert.throws(() => sb.emagrecerPlanilhaDireto(), /cópia de segurança/);
  assert.equal(formulasEm(aba, 150), 3, 'nada foi apagado');
});
