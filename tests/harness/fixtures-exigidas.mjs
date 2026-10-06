// tests/harness/fixtures-exigidas.mjs
//
// 06/10/2026 (A-74): "t.skip silencioso" - 22 arquivos de teste pulavam quando fixtures.json (ou uma aba dele) faltava e
// a suíte ficava "verde" cobrindo menos do que parece. Este módulo:
//  - exigirFixtures(t, abas): devolve true se dá pra rodar; senão, no modo normal dá t.skip dizendo QUAL aba falta e,
//    com CI_ESTRITO=1, FALHA (lança) com a mesma mensagem;
//  - abasDoCodigo(): toda aba que apps-script/*.gs usa (varredura do texto; extrair-fixtures.py faz a mesma conta);
//  - CI_ESTRITO: `npm run test:estrito` (reporter-estrito.mjs cobre os t.skip antigos que ainda não usam este módulo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerFixturesRaw_ } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
export const GAS_DIR = path.join(__dirname, '..', '..', 'apps-script');
export const CI_ESTRITO = process.env.CI_ESTRITO === '1';
export const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);

/** Nomes das abas presentes em fixtures.json ([] sem o arquivo). */
export function abasNasFixtures() {
  if (!TEM_FIXTURES) return [];
  return Object.keys(lerFixturesRaw_(FIXTURES_PATH)).filter((k) => !k.startsWith('_'));
}

/** Mensagem do que falta ('' = nada falta). */
export function faltaNasFixtures(abas = []) {
  if (!TEM_FIXTURES) return 'tests/harness/fixtures.json ausente - rode extrair-fixtures.py com um export .xlsx da planilha (ver tests/harness/README.md)';
  const tem = new Set(abasNasFixtures());
  const faltam = abas.filter((a) => !tem.has(a));
  if (!faltam.length) return '';
  return `fixtures.json não tem a(s) aba(s) ${faltam.map((a) => `"${a}"`).join(', ')} - rode extrair-fixtures.py com a planilha atual (a aba pode ainda não existir nela)`;
}

/**
 * Use no começo de um teste que depende de fixtures.json: `if (!exigirFixtures(t, ['Transações'])) return;`
 * Sem o que falta: modo normal = t.skip (com a mensagem); CI_ESTRITO=1 = falha.
 */
export function exigirFixtures(t, abas = []) {
  const falta = faltaNasFixtures(abas);
  if (!falta) return true;
  if (CI_ESTRITO) throw new Error(`[CI_ESTRITO] ${falta}`);
  t.skip(falta);
  return false;
}

function semComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

/**
 * { 'Nome da aba': { arquivos: ['Metas.gs', ...], criadaPeloCodigo: boolean } } - constantes `var ...ABA... = '...'`,
 * getSheetByName('...'|CONST), insertSheet('...'|CONST) e `aba: '...'`. criadaPeloCodigo = algum insertSheet (o código cria
 * a aba no 1º uso, então ela pode não existir na planilha). Mesma regra de extrair-fixtures.py!abas_usadas_no_codigo.
 */
export function abasDoCodigo(gasDir = GAS_DIR) {
  const achadas = {};
  for (const arq of fs.readdirSync(gasDir).filter((f) => f.endsWith('.gs')).sort()) {
    const codigo = semComentarios(fs.readFileSync(path.join(gasDir, arq), 'utf8'));
    const constantes = {};
    for (const m of codigo.matchAll(/\b(?:var|const|let)\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^'\n]+)'/g)) constantes[m[1]] = m[2];
    const registrar = (nome, cria = false) => {
      if (!nome || nome.startsWith('http')) return;
      const d = achadas[nome] || (achadas[nome] = { arquivos: [], criadaPeloCodigo: false });
      if (!d.arquivos.includes(arq)) d.arquivos.push(arq);
      d.criadaPeloCodigo = d.criadaPeloCodigo || cria;
    };
    for (const [nome, valor] of Object.entries(constantes)) if (nome.includes('ABA') || nome.includes('SHEET')) registrar(valor);
    for (const m of codigo.matchAll(/\b(?:getSheetByName|insertSheet)\(\s*('([^'\n]+)'|([A-Z][A-Z0-9_]*))\s*\)/g)) registrar(m[2] || constantes[m[3]], m[0].includes('insertSheet'));
    for (const m of codigo.matchAll(/\baba:\s*'([^'\n]+)'/g)) registrar(m[1]);
  }
  delete achadas['aux_tests']; // aba-sandbox do modo teste da importação B3
  return achadas;
}
