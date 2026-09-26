// tests/harness/planilha-falsa.mjs
//
// 26/09/2026: planilha falsa "de verdade" pros testes de cadastro de ativo,
// consolidação e Carteira Renda Fixa - guarda valor E fórmula por célula
// (A1 e R1C1), insere/apaga linha deslocando o resto, getRange em A1 ou
// numérico, sort, copyTo. Não calcula fórmula nenhuma: o teste confere o
// que o Apps Script ESCREVEU (e o valor que ele leu é o que o teste pôs).
// + sandboxGas(ss): carrega TODOS os apps-script/*.gs num vm, como o Apps
// Script faz (um escopo global só). Dados sempre inventados.
// o Apps Script roda no fuso do projeto (America/Sao_Paulo): datas "meia-noite"
// da planilha só caem no dia certo (chaveDiaISOInicio_ usa Intl nesse fuso) se o
// processo do teste estiver no mesmo fuso
process.env.TZ = 'America/Sao_Paulo';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

function colIdx(letras) { let n = 0; for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function parseA1(a1) {
  const m = String(a1).replace(/\$/g, '').match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m) throw new Error('A1 não suportado: ' + a1);
  const c1 = colIdx(m[1]); const r1 = Number(m[2]);
  const c2 = m[3] ? colIdx(m[3]) : c1; const r2 = m[4] ? Number(m[4]) : r1;
  return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
}
const vazio = (v) => v === '' || v == null;

/** Célula: { v, f (A1), r1c1 }. Na criação: valor puro, ou { f, r1c1, v }. */
function celula(x) {
  if (x && typeof x === 'object' && !(x instanceof Date) && ('f' in x || 'r1c1' in x)) return { v: x.v ?? '', f: x.f || '', r1c1: x.r1c1 || '' };
  return { v: x ?? '', f: '', r1c1: '' };
}

export class AbaFalsa {
  constructor(nome, linhas = [], { maxRows = 0 } = {}) {
    this.nome = nome;
    this.l = linhas.map((row) => (row || []).map(celula));
    this.max = Math.max(maxRows, this.l.length, 50);
    this.log = [];
  }
  c(r, col) { const row = this.l[r - 1] || (this.l[r - 1] = []); return row[col - 1] || (row[col - 1] = celula('')); }
  peek(r, col) { const row = this.l[r - 1]; return row && row[col - 1] ? row[col - 1] : celula(''); }
  valor(a1) { const [r, c] = parseA1(a1); return this.peek(r, c).v; }
  formula(a1) { const [r, c] = parseA1(a1); const x = this.peek(r, c); return x.f || x.r1c1; }
  linha(r) { return (this.l[r - 1] || []).map((x) => (x ? (x.f || x.r1c1 ? { f: x.f, r1c1: x.r1c1 } : x.v) : '')); }
  valores(r) { return (this.l[r - 1] || []).map((x) => (x ? x.v : '')); }
  getName() { return this.nome; }
  getMaxRows() { return this.max; }
  getLastRow() { for (let i = this.l.length - 1; i >= 0; i--) if ((this.l[i] || []).some((x) => x && (!vazio(x.v) || x.f || x.r1c1))) return i + 1; return 0; }
  getLastColumn() { return Math.max(0, ...this.l.map((row) => { let n = 0; (row || []).forEach((x, j) => { if (x && (!vazio(x.v) || x.f || x.r1c1)) n = j + 1; }); return n; })); }
  insertRowsAfter(_, n) { this.max += n; }
  insertRowBefore(r) { this.l.splice(r - 1, 0, []); this.max += 1; this.log.push(['insertRowBefore', r]); }
  insertRowAfter(r) { this.l.splice(r, 0, []); this.max += 1; this.log.push(['insertRowAfter', r]); }
  deleteRow(r) { this.l.splice(r - 1, 1); this.log.push(['deleteRow', r]); }
  deleteRows(r, n) { this.l.splice(r - 1, n); this.log.push(['deleteRows', r, n]); }
  clearContents() { this.l = []; }
  getRange(a, b, c, d) {
    let r1, c1, nr, nc;
    if (typeof a === 'string') [r1, c1, nr, nc] = parseA1(a); else { r1 = a; c1 = b; nr = c ?? 1; nc = d ?? 1; }
    return new RangeFalso(this, r1, c1, nr, nc);
  }
}

class RangeFalso {
  constructor(aba, r, c, nr, nc) { Object.assign(this, { aba, r, c, nr, nc }); }
  mapa(fn) { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => fn(this.aba.peek(this.r + i, this.c + j)))); }
  getValues() { return this.mapa((x) => x.v); }
  getValue() { return this.aba.peek(this.r, this.c).v; }
  getFormulas() { return this.mapa((x) => x.f || ''); }
  getFormulasR1C1() { return this.mapa((x) => x.r1c1 || ''); }
  getRow() { return this.r; }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((l) => l.length !== this.nc)) throw new Error(`setValues: ${vals.length}x${vals[0] && vals[0].length} num range ${this.nr}x${this.nc} (${this.aba.nome})`);
    vals.forEach((l, i) => l.forEach((v, j) => { const x = this.aba.c(this.r + i, this.c + j); x.v = v; x.f = ''; x.r1c1 = ''; }));
    return this;
  }
  setValue(v) { const x = this.aba.c(this.r, this.c); x.v = v; x.f = ''; x.r1c1 = ''; return this; }
  setFormula(f) { const x = this.aba.c(this.r, this.c); x.f = f; x.r1c1 = ''; x.v = ''; return this; }
  setFormulasR1C1(fs2) { fs2.forEach((l, i) => l.forEach((f, j) => { const x = this.aba.c(this.r + i, this.c + j); x.r1c1 = f; x.f = ''; x.v = ''; })); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const row = this.aba.l[this.r - 1 + i]; if (row && row[this.c - 1 + j]) row[this.c - 1 + j] = celula(''); } return this; }
  setNumberFormat() { return this; }
  copyTo(destino) { this.aba.log.push(['copyTo', this.r, destino.r]); }
  sort({ column, ascending = true }) {
    const bloco = Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => ({ ...this.aba.peek(this.r + i, this.c + j) })));
    const k = column - this.c;
    const val = (x) => (x.v instanceof Date ? x.v.getTime() : x.v);
    bloco.sort((a, b) => (val(a[k]) < val(b[k]) ? -1 : val(a[k]) > val(b[k]) ? 1 : 0) * (ascending ? 1 : -1));
    bloco.forEach((l, i) => l.forEach((x, j) => { this.aba.l[this.r - 1 + i] = this.aba.l[this.r - 1 + i] || []; this.aba.l[this.r - 1 + i][this.c - 1 + j] = x; }));
  }
  getRichTextValue() { return null; }
}

export function planilhaFalsa(abas) {
  const mapa = {};
  Object.entries(abas).forEach(([n, linhas]) => { mapa[n] = linhas instanceof AbaFalsa ? linhas : new AbaFalsa(n, linhas); });
  return {
    abas: mapa,
    getSheetByName: (n) => mapa[n] || null,
    insertSheet: (n) => (mapa[n] = new AbaFalsa(n, [])),
    aba: (n) => mapa[n],
  };
}

/** Carrega todos os .gs num vm com serviços falsos. Devolve { sb, props, registro, fetches }. */
export function sandboxGas(ss, { urlFetch = null, agora = null } = {}) {
  const props = new Map();
  const cache = new Map();
  const registro = [];
  const sb = {
    console: { log() {}, error() {} },
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getActive: () => ss, CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT' } },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo', getEffectiveUser: () => ({ getEmail: () => 'x@x' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k), removeAll: (ks) => ks.forEach((k) => cache.delete(k)), getAll: () => ({}), putAll: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k) }) },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        if (fmt === 'yyyy-MM-dd') return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        if (fmt === 'MM/yyyy') return `${p(d.getMonth() + 1)}/${d.getFullYear()}`;
        if (fmt === 'dd/MM/yyyy') return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
        return d.toISOString();
      },
      sleep() {},
    },
    UrlFetchApp: { fetch: (url) => { if (!urlFetch) throw new Error('rede desligada no teste: ' + url); return urlFetch(url); } },
    MailApp: { sendEmail() {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date; this.Object = Object; this.Array = Array; this.JSON = JSON; this.Math = Math;').runInContext(sb);
  if (agora) {
    // relógio fixo dentro do vm (new Date() sem argumento = agora)
    new vm.Script(`(function(){ var D = Date; var T = ${agora.getTime()}; function F(){ if (!(this instanceof F)) return new D(T).toString(); var a = arguments; if (!a.length) return new D(T); return new (Function.prototype.bind.apply(D, [null].concat([].slice.call(a))))(); } F.prototype = D.prototype; F.now = function(){ return T; }; F.UTC = D.UTC; F.parse = D.parse; this.Date = F; }).call(this);`).runInContext(sb);
  }
  const dir = path.join(ROOT, 'apps-script');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f }).runInContext(sb);
  }
  sb.jsonOut = (x) => x;
  const original = sb.gravarRegistroControle_;
  sb.gravarRegistroControle_ = (...a) => { registro.push(a); if (ss.getSheetByName('Registro de Controle')) original(...a); };
  return { sb, props, registro, cache };
}

/** Data local (meia-noite) a partir de 'aaaa-mm-dd', do mesmo "realm" do vm. */
export const D = (sb, s, h = 0, mi = 0) => new sb.Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), h, mi);
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const plain = (x) => JSON.parse(JSON.stringify(x));
