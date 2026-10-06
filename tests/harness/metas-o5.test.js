// tests/harness/metas-o5.test.js - 06/10/2026 (revisão do Tiago, Metas): Apps Script - o que a meta salva no site sobrescreve na
// planilha (reserva: L11/L12; aposentadoria: K18/L18/M18, M19 modo renda, N18 modo montante), "ignorar este aviso" persistido
// na meta e a exceção reserva x aposentadoria na alocação do servidor. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const plain = (o) => JSON.parse(JSON.stringify(o));

function criarFalsa(dm = {}) {
  const abas = new Map();
  const nova = (nome) => {
    const cel = new Map();
    return {
      nome, cel,
      getLastRow() { let m = 0; for (const [k, v] of cel) if (v !== '' && v != null) m = Math.max(m, Number(k.split(',')[0])); return m; },
      getRange(r0, c0, nr = 1, nc = 1) {
        return {
          getValues() { const o = []; for (let r = r0; r < r0 + nr; r++) { const l = []; for (let c = c0; c < c0 + nc; c++) l.push(cel.get(`${r},${c}`) ?? ''); o.push(l); } return o; },
          setValues(v) { v.forEach((l, i) => l.forEach((x, j) => cel.set(`${r0 + i},${c0 + j}`, x))); },
        };
      },
      setFrozenRows() {},
    };
  };
  const ss = { abas, getSheetByName: (n) => abas.get(n) || null, insertSheet: (n) => { const a = nova(n); abas.set(n, a); return a; } };
  const aba = ss.insertSheet('Distribuição e Metas');
  Object.entries(dm).forEach(([k, v]) => aba.cel.set(k, v)); // 'linha,coluna' -> valor
  return ss;
}

function sandbox() {
  const sb = {
    console: { ...console, log() {} }, Logger: { log() {} }, SpreadsheetApp: { flush() {} },
    Utilities: { getUuid: (() => { let n = 0; return () => `0000000${++n}-aaaa`; })() },
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  for (const f of ['Metas.gs', 'Proventos.gs', 'RendaFixaIR.gs', 'Incorporacoes.gs']) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  return sb;
}

const AGORA = new Date('2026-10-06T12:00:00Z');

test('salvar reserva: meses e sobra do site sobrescrevem L11 e L12 da planilha (só se mudaram)', () => {
  const sb = sandbox();
  const ss = criarFalsa({ '11,12': 6, '12,12': 0.1 });
  let r = plain(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'reservaEmergencia', nome: 'Reserva', especificos: { meses: 8, margem: 0.1 } }), AGORA));
  assert.equal(r.ok, true);
  const dm = ss.abas.get('Distribuição e Metas');
  assert.equal(dm.cel.get('11,12'), 8, 'L11 = meses do site');
  assert.equal(dm.cel.get('12,12'), 0.1, 'L12 igual: não regravou');
  assert.deepEqual(r.planilha.atualizadas.map((x) => [x.celula, x.antes, x.depois]), [['L11', 6, 8]]);
  // vazio = segue a planilha: não toca
  r = plain(sb.salvarMeta_(ss, JSON.stringify({ id: r.id, tipo: 'reservaEmergencia', nome: 'Reserva', especificos: {} }), AGORA));
  assert.deepEqual(r.planilha.atualizadas, []);
  assert.equal(dm.cel.get('11,12'), 8);
});

test('salvar aposentadoria: taxa de retirada, extra e % de reinvestimento vão pra M18, K18 e L18; modo "renda" grava M19; "montante" grava N18', () => {
  const sb = sandbox();
  const ss = criarFalsa({ '18,11': 500, '18,12': 0.2, '18,13': 0.06, '19,13': 9000, '18,14': 3000000 });
  const dm = ss.abas.get('Distribuição e Metas');
  let r = plain(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'aposentadoria', nome: 'Apos', valorAlvo: 3500000,
    especificos: { modoAlvo: 'calculado', taxaRetirada: 0.065, extra: 800, reinvestimento: 0.25, rendaDesejada: 12000 } }), AGORA));
  assert.deepEqual(r.planilha.atualizadas.map((x) => x.celula).sort(), ['K18', 'L18', 'M18']);
  assert.equal(dm.cel.get('18,13'), 0.065);
  assert.equal(dm.cel.get('18,11'), 800);
  assert.equal(dm.cel.get('19,13'), 9000, 'modo calculado não mexe na renda desejada (M19) nem no patrimônio (N18)');
  assert.equal(dm.cel.get('18,14'), 3000000);
  r = plain(sb.salvarMeta_(ss, JSON.stringify({ id: r.id, tipo: 'aposentadoria', nome: 'Apos', valorAlvo: 3500000, especificos: { modoAlvo: 'renda', taxaRetirada: 0.065, extra: 800, reinvestimento: 0.25, rendaDesejada: 12000 } }), AGORA));
  assert.deepEqual(r.planilha.atualizadas.map((x) => x.celula), ['M19']);
  assert.equal(dm.cel.get('19,13'), 12000);
  r = plain(sb.salvarMeta_(ss, JSON.stringify({ id: r.id, tipo: 'aposentadoria', nome: 'Apos', valorAlvo: 3500000, especificos: { modoAlvo: 'montante', taxaRetirada: 0.065 } }), AGORA));
  assert.deepEqual(r.planilha.atualizadas.map((x) => x.celula), ['N18']);
  assert.equal(dm.cel.get('18,14'), 3500000);
});

test('salvar: meta arquivada/outros tipos não tocam a planilha; sem a aba, salva a meta e avisa em `planilha.erro` (nunca falha o salvamento)', () => {
  const sb = sandbox();
  const ss = criarFalsa({ '11,12': 6 });
  let r = plain(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'reservaEmergencia', nome: 'R', status: 'arquivada', especificos: { meses: 12 } }), AGORA));
  assert.deepEqual(r.planilha.atualizadas, []);
  r = plain(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'Z', valorAlvo: 10 }), AGORA));
  assert.deepEqual(r.planilha.atualizadas, []);
  assert.equal(ss.abas.get('Distribuição e Metas').cel.get('11,12'), 6);
  const sem = criarFalsa();
  sem.abas.delete('Distribuição e Metas');
  r = plain(sb.salvarMeta_(sem, JSON.stringify({ tipo: 'reservaEmergencia', nome: 'R', especificos: { meses: 7 } }), AGORA));
  assert.equal(r.ok, true);
  assert.match(r.planilha.erro, /aba não encontrada/);
});

test('"ignorar este aviso" é persistido na meta (só valores conhecidos, sem repetir)', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const r = plain(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'aposentadoria', nome: 'A', ignorarAvisos: ['sobreposicao', 'sobreposicao', 'outro'] }), AGORA));
  assert.deepEqual(r.meta.ignorarAvisos, ['sobreposicao']);
  assert.deepEqual(plain(sb.lerMetas_(ss))[0].ignorarAvisos, ['sobreposicao']);
});
