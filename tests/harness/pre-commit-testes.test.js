// tests/harness/pre-commit-testes.test.js
//
// 06/10/2026 (A-75): a escolha dos testes do pre-commit (selecionarTestes) e as checagens rápidas, numa árvore INVENTADA
// em pasta temporária - sem fixtures.json, sem git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selecionarTestes, checagensRapidas } from './pre-commit-testes.mjs';

function arvore(arquivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'arvore-'));
  for (const [rel, texto] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.writeFileSync(path.join(raiz, rel), texto);
  }
  return raiz;
}

test('selecionarTestes: teste alterado, fonte citada por teste, ajudante (fecho dos imports), .gs puxa coerência/contrato, .html puxa CSP, docs não puxa nada', () => {
  const raiz = arvore({
    'tests/calc.test.js': "import { x } from '../assets/js/pages/calc.js';",
    'tests/outro.test.js': "import { y } from '../assets/js/pages/calc-extra.js';", // 'calc-extra.js' não é 'calc.js'
    'tests/harness/ajuda.mjs': 'export const a = 1;',
    'tests/harness/usa-ajuda.mjs': "import { a } from './ajuda.mjs';",
    'tests/harness/fim.test.js': "import { a } from './usa-ajuda.mjs';",
    'tests/harness/metas.test.js': "const GS = 'apps-script/Metas.gs';",
    'tests/harness/coerencia-telas.test.mjs': '',
    'tests/harness/abas-contrato.test.js': '',
    'tests/csp-html.test.js': '',
    'assets/js/pages/calc.js': '', 'apps-script/Metas.gs': '', 'docs/nota.md': '', 'pagina.html': '',
  });
  const sel = (...a) => selecionarTestes(a, { raiz }).testes;
  assert.deepEqual(sel('tests/outro.test.js'), ['tests/outro.test.js']);
  assert.deepEqual(sel('assets/js/pages/calc.js'), ['tests/calc.test.js']);
  assert.deepEqual(sel('tests/harness/ajuda.mjs'), ['tests/harness/fim.test.js'], 'ajudante -> quem importa, direta ou indiretamente');
  assert.deepEqual(sel('apps-script/Metas.gs'), ['tests/harness/abas-contrato.test.js', 'tests/harness/coerencia-telas.test.mjs', 'tests/harness/metas.test.js']);
  assert.deepEqual(sel('pagina.html'), ['tests/csp-html.test.js']);
  assert.deepEqual(sel('docs/nota.md'), []);
  assert.deepEqual(sel('assets/js/pages/calc.js', 'tests/outro.test.js'), ['tests/calc.test.js', 'tests/outro.test.js']);
});

test('checagensRapidas: barra dado real, erro de sintaxe e JSON inválido; aceita arquivo bom e arquivo removido no commit', () => {
  const raiz = arvore({ 'bom.mjs': 'export const a = 1;\n', 'ruim.mjs': 'export const = ;\n', 'ok.json': '{"a":1}', 'ruim.json': '{a:', 'f.gs': 'function f() { return 1; }\n', 'g.gs': 'function g( {\n' });
  const p = checagensRapidas(['tests/harness/fixtures.json', 'x.local.json', 'tests/harness/relatorio/a.html', 'bom.mjs', 'ruim.mjs', 'ok.json', 'ruim.json', 'f.gs', 'g.gs', 'removido.js', 'informe.pdf'], { raiz });
  assert.equal(p.filter((m) => /não pode entrar no repositório público/.test(m)).length, 4);
  assert.ok(p.some((m) => m.startsWith('ruim.mjs: erro de sintaxe')));
  assert.ok(p.some((m) => m.startsWith('ruim.json: JSON inválido')));
  assert.ok(p.some((m) => m.startsWith('g.gs: erro de sintaxe')));
  assert.equal(p.filter((m) => /^(bom\.mjs|ok\.json|f\.gs|removido\.js)/.test(m)).length, 0);
});
