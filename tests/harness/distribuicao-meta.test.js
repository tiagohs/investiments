// tests/harness/distribuicao-meta.test.js - 06/10/2026: meta "Distribuição da carteira" no Apps Script
// (Metas.gs + DistribuicoesMetas.gs). Planilha falsa em memória (dados inventados - o repositório é público): validação de 100%
// por grupo, gravação dos pesos nas células de sempre, migração automática (idempotente) a partir dos % da planilha e a regra
// de uma meta ativa só.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const colNum = (L) => L.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

function aba() {
  const cel = new Map();
  const rng = (r0, c0, nr, nc) => ({
    getValues() { const o = []; for (let r = r0; r < r0 + nr; r++) { const l = []; for (let c = c0; c < c0 + nc; c++) l.push(cel.has(`${r},${c}`) ? cel.get(`${r},${c}`) : ''); o.push(l); } return o; },
    setValues(v) { v.forEach((l, i) => l.forEach((x, j) => cel.set(`${r0 + i},${c0 + j}`, x))); },
  });
  return {
    cel, escritas: 0,
    getLastRow() { let m = 0; for (const [k, v] of cel) if (v !== '' && v != null) m = Math.max(m, Number(k.split(',')[0])); return m; },
    getRange(a, b, c, d) {
      if (typeof a === 'string') {
        const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
        const c0 = colNum(m[1]); const r0 = Number(m[2]); const c1 = m[3] ? colNum(m[3]) : c0; const r1 = m[4] ? Number(m[4]) : r0;
        const base = rng(r0, c0, r1 - r0 + 1, c1 - c0 + 1);
        const sv = base.setValues; base.setValues = (v) => { this.escritas += 1; sv(v); };
        return base;
      }
      return rng(a, b, c || 1, d || 1);
    },
    setFrozenRows() {},
  };
}

function preparar({ planilha = true } = {}) {
  const abas = new Map();
  const dm = aba();
  abas.set('Distribuição e Metas', dm);
  if (planilha) {
    // C11:C13 (grupos), C19:C20 (RF), C34:C35 (ações), B73:C75 (FIIs: rótulo + %)
    [[0.5], [0.4], [0.1]].forEach((v, i) => dm.cel.set(`${11 + i},3`, v[0]));
    dm.cel.set('19,3', 0.9); dm.cel.set('20,3', 0.1);
    dm.cel.set('34,3', 0.6); dm.cel.set('35,3', 0.4);
    [['Tijolo', 0.4], ['Papel', 0.3], ['Híbrido', 0.3]].forEach(([t, p], i) => { dm.cel.set(`${73 + i},2`, t); dm.cel.set(`${73 + i},3`, p); });
  }
  const ss = {
    getSheetByName: (n) => abas.get(n) || null,
    insertSheet: (n) => { const a = aba(); abas.set(n, a); return a; },
  };
  const sb = {
    console: { ...console, log() {} },
    SpreadsheetApp: { flush() {}, getActiveSpreadsheet: () => ss },
    Utilities: { getUuid: (() => { let n = 0; return () => `${String(++n).padStart(6, '0')}-aaaa`; })() }, // 6 primeiros caracteres distintos (o id da meta usa só eles)
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    UrlFetchApp: { fetch: () => { throw new Error('sem rede'); } },
    Logger: { log() {} },
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  for (const f of ['Metas.gs', 'DistribuicoesMetas.gs']) new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  sb.travaRecurso_ = () => ({ waitLock() {}, releaseLock() {} });
  sb.localDistribuicaoMetas_ = () => ({ objetivosFiis: 73 });
  sb.jsonOut = (o) => o;
  return { sb, ss, dm, abas };
}
const json = (o) => JSON.parse(JSON.stringify(o));
const PESOS = { grupos: { acoes: 0.45, fiis: 0.4, rf: 0.15 }, acoes: { nacionais: 0.7, internacionais: 0.3 }, fiis: { tijolo: 0.5, hibrido: 0.2, papel: 0.3 }, rf: { emergencial: 0.8, rendaFixa: 0.2 } };

test('normalizarPesosDistribuicao_: aceita 100% por grupo e acusa o grupo que não fecha', () => {
  const { sb } = preparar();
  assert.deepEqual(json(sb.normalizarPesosDistribuicao_(PESOS)), PESOS);
  const ruim = json(PESOS); ruim.fiis.papel = 0.2;
  assert.throws(() => sb.normalizarPesosDistribuicao_(ruim), /FIIs.*somar 100%.*90%/);
  assert.throws(() => sb.normalizarPesosDistribuicao_(null), /pesos/);
  const neg = json(PESOS); neg.grupos.acoes = 1.5;
  assert.throws(() => sb.normalizarPesosDistribuicao_(neg), /inválido/);
});

test('lerPesosPlanilhaDistribuicao_ lê as células de sempre (FIIs pelo rótulo) e gravarPesos... escreve nelas', () => {
  const { sb, ss, dm } = preparar();
  const lidos = json(sb.lerPesosPlanilhaDistribuicao_(ss));
  assert.deepEqual(lidos.fiis, { tijolo: 0.4, hibrido: 0.3, papel: 0.3 });
  assert.deepEqual(lidos.grupos, { acoes: 0.5, fiis: 0.4, rf: 0.1 });
  sb.gravarPesosPlanilhaDistribuicao_(ss, PESOS);
  assert.deepEqual(dm.getRange('C11:C13').getValues(), [[0.45], [0.4], [0.15]]);
  assert.deepEqual(dm.getRange('C19:C20').getValues(), [[0.8], [0.2]]);
  assert.deepEqual(dm.getRange('C34:C35').getValues(), [[0.7], [0.3]]);
  assert.deepEqual(dm.getRange('C73:C75').getValues(), [[0.5], [0.3], [0.2]], 'ordem da planilha: Tijolo, Papel, Híbrido');
});

test('gravarPesos...: soma errada não escreve NENHUMA célula', () => {
  const { sb, ss, dm } = preparar();
  const ruim = json(PESOS); ruim.rf.emergencial = 0.5;
  assert.throws(() => sb.gravarPesosPlanilhaDistribuicao_(ss, ruim), /Renda Fixa/);
  assert.equal(dm.escritas, 0);
});

test('migração: sem meta do tipo, nasce dos % da planilha; chamar de novo não duplica nem regrava a planilha', () => {
  const { sb, ss, dm } = preparar();
  const m1 = json(sb.garantirMetaDistribuicao_(ss, new Date('2026-10-06T12:00:00Z')));
  assert.equal(m1.tipo, 'distribuicaoCarteira');
  assert.equal(m1.nome, 'Distribuição da carteira');
  assert.deepEqual(m1.especificos.pesos.fiis, { tijolo: 0.4, hibrido: 0.3, papel: 0.3 });
  assert.equal(dm.escritas, 0, 'a migração não mexe na planilha');
  const m2 = json(sb.garantirMetaDistribuicao_(ss, new Date()));
  assert.equal(m2.id, m1.id);
  assert.equal(json(sb.lerMetas_(ss)).filter((m) => m.tipo === 'distribuicaoCarteira').length, 1);
});

test('migração: meta arquivada conta como existente (arquivar é decisão dele); planilha com soma errada não cria', () => {
  const { sb, ss, dm } = preparar();
  const m = sb.garantirMetaDistribuicao_(ss, new Date());
  sb.arquivarMeta_(ss, m.id, false, new Date());
  assert.equal(sb.garantirMetaDistribuicao_(ss, new Date()), null);
  assert.equal(json(sb.lerMetas_(ss, { arquivadas: true })).length, 1);
  assert.equal(json(sb.lerMetas_(ss)).length, 0);
  const outra = preparar();
  outra.dm.cel.set('11,3', 0.9); // 90% + 40% + 10%
  assert.throws(() => outra.sb.garantirMetaDistribuicao_(outra.ss, new Date()), /somar 100%/);
  assert.equal(json(outra.sb.lerMetas_(outra.ss)).length, 0);
});

test('salvarMeta_: grava os pesos na planilha (site manda), valida, e só uma meta ativa do tipo', () => {
  const { sb, ss, dm } = preparar();
  const r = json(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'distribuicaoCarteira', nome: 'Distribuição da carteira', especificos: { pesos: PESOS } }), new Date()));
  assert.equal(r.ok, true);
  assert.deepEqual(dm.getRange('C11:C13').getValues(), [[0.45], [0.4], [0.15]]);
  assert.deepEqual(r.meta.vinculos, []);
  // segunda ativa: recusada
  const r2 = json(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'distribuicaoCarteira', nome: 'Outra', especificos: { pesos: PESOS } }), new Date()));
  assert.equal(r2.ok, false);
  assert.match(r2.erro, /já existe/);
  // editar a mesma (com id) funciona e atualiza a planilha
  const novos = json(PESOS); novos.grupos = { acoes: 0.6, fiis: 0.3, rf: 0.1 };
  const r3 = json(sb.salvarMeta_(ss, JSON.stringify({ id: r.id, tipo: 'distribuicaoCarteira', nome: 'Distribuição da carteira', especificos: { pesos: novos } }), new Date()));
  assert.equal(r3.ok, true);
  assert.deepEqual(dm.getRange('C11:C13').getValues(), [[0.6], [0.3], [0.1]]);
  // pesos inválidos: lança antes de gravar a meta e a planilha fica como estava
  const ruim = json(PESOS); ruim.acoes.nacionais = 0.1;
  assert.throws(() => sb.salvarMeta_(ss, JSON.stringify({ id: r.id, tipo: 'distribuicaoCarteira', nome: 'x', especificos: { pesos: ruim } }), new Date()), /Ações/);
  assert.deepEqual(dm.getRange('C11:C13').getValues(), [[0.6], [0.3], [0.1]]);
});

test('GET metas (cache miss): 1ª leitura cria a meta e devolve o "atual" da distribuição; as duas telas convergem na mesma meta', () => {
  const { sb, ss } = preparar();
  sb.montarTelaMetas_ = (s) => ({ metas: sb.lerMetas_(s), arquivadas: [], ativos: [] });
  const r = json(sb.montarTelaMetasComDistribuicao_(ss, new Date()));
  assert.equal(r.metas.filter((m) => m.tipo === 'distribuicaoCarteira').length, 1);
  assert.deepEqual(r.distribuicaoAtual.objetivos.alocacaoGeral.tipos.map((t) => t.tipo), ['', '', '']); // planilha falsa sem rótulos/valores
  assert.equal(r.distribuicaoAtual.splitsInternos.fiis.itens[0].tipo, 'Tijolo');
  const m = sb.garantirMetaDistribuicao_(ss, new Date());
  assert.equal(json(m).id, r.metas[0].id, 'idempotente entre as duas telas');
  assert.equal(json(sb.montarTelaMetasComDistribuicao_(ss, new Date())).metas.length, 1, 'não duplica');
});
