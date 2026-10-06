// Teste de ARQUITETURA (05/10/2026, auditoria A-68): formatação de número/dinheiro/data e escape de HTML
// moram em UM lugar (assets/js/format.js e assets/js/util/). Se alguém voltar a escrever o próprio `esc`,
// a própria lista de meses ou chamar `toLocaleString('pt-BR'` direto num módulo, este teste falha e aponta o arquivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_JS = join(fileURLToPath(new URL('..', import.meta.url)), 'assets', 'js');

function arquivosJs(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivosJs(caminho) : (nome.endsWith('.js') ? [caminho] : []);
  });
}

// só format.js e util/ podem ter essas coisas
const PERMITIDO = (rel) => rel === 'format.js' || rel.startsWith(`util${sep}`) || rel.startsWith('util/');

// tira comentários (os comentários citam os nomes antigos de propósito)
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const PROIBIDOS = [
  { re: /\bconst\s+(esc|escAttr|escHtml|escapeHtml)\s*=/, motivo: 'escape de HTML próprio: importe `esc`/`escAttr` de util/html.js' },
  { re: /\bfunction\s+(esc|escAttr|escHtml|escapeHtml)\s*\(/, motivo: 'escape de HTML próprio: importe `esc`/`escAttr` de util/html.js' },
  { re: /\bconst\s+MESES\w*\s*=\s*\[/, motivo: 'lista de meses própria: importe MESES_CURTOS/MESES_LONGOS (e variantes) de format.js' },
  { re: /\bconst\s+usd\s*=/, motivo: 'formatador de dólar próprio: use formatUSD de format.js' },
  { re: /toLocale(Date|Time)?String\(\s*['"]pt-BR['"]/, motivo: "toLocaleString('pt-BR'...) direto: use formatNumeroPt/formatNumeroBR/formatBRL/formatDateBR... de format.js" },
  { re: /new\s+Intl\.(NumberFormat|DateTimeFormat)\(\s*['"]pt-BR['"]/, motivo: "Intl pt-BR direto: use os formatadores de format.js" },
];

test('nenhum módulo de assets/js (fora de format.js e util/) reimplementa escape, meses ou formato pt-BR', () => {
  const achados = [];
  for (const arquivo of arquivosJs(RAIZ_JS)) {
    const rel = relative(RAIZ_JS, arquivo);
    if (PERMITIDO(rel)) continue;
    const codigo = semComentarios(readFileSync(arquivo, 'utf8'));
    for (const { re, motivo } of PROIBIDOS) {
      if (re.test(codigo)) achados.push(`${rel}: ${motivo}`);
    }
  }
  assert.deepEqual(achados, [], `Helpers duplicados fora de format.js/util:\n${achados.join('\n')}`);
});

test('util/html.js: esc e escAttr escapam & < > " e aspas simples (A-68)', async () => {
  const { esc, escAttr } = await import('../assets/js/util/html.js');
  assert.equal(esc(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(escAttr(`o'neil "x"`), 'o&#39;neil &quot;x&quot;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
  assert.deepEqual(['a&b', "c'd"].map(esc), ['a&amp;b', 'c&#39;d']); // serve direto em .map
});
