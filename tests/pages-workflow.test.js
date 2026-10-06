// tests/pages-workflow.test.js - 06/10/2026: o workflow .github/workflows/pages.yml publica SÓ o que o site usa.
// Quando uma página nova nasce numa pasta nova, o workflow tem que ganhar a pasta (senão a página some do site no dia em que o
// Tiago trocar Settings > Pages > Source para "GitHub Actions"); e nada interno (tests, docs, scripts, apps-script) pode entrar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const yml = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'pages.yml'), 'utf8');
const lista = (nome) => {
  const m = yml.match(new RegExp(`^\\s*${nome}:\\s*"([^"]*)"`, 'm'));
  assert.ok(m, `${nome} não encontrado no workflow`);
  return m[1].split(/\s+/).filter(Boolean);
};
const INTERNAS = ['tests', 'docs', 'scripts', 'apps-script', 'node_modules', '.git', '.github', '.githooks', 'documents'];

function paginasEmPastas() {
  return fs.readdirSync(RAIZ, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !INTERNAS.includes(e.name) && !e.name.startsWith('.'))
    .filter((e) => fs.readdirSync(path.join(RAIZ, e.name)).some((f) => f.endsWith('.html')))
    .map((e) => e.name);
}

test('pages.yml: dispara no push da branch principal e manualmente, e o deploy não derruba o workflow enquanto o Source for "branch"', () => {
  assert.match(yml, /on:\s*\n\s*push:\s*\n\s*branches: \[main, master\]/);
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /actions\/deploy-pages@v4/);
  assert.match(yml, /publicar:[\s\S]*continue-on-error: true[\s\S]*actions\/deploy-pages@v4/, 'job publicar com continue-on-error');
});

test('pages.yml: toda pasta com páginas HTML (e assets/) é copiada; nada interno é copiado', () => {
  const pastas = lista('PASTAS_DE_PAGINAS');
  assert.ok(pastas.includes('assets'), 'assets/ é do site');
  for (const p of paginasEmPastas()) assert.ok(pastas.includes(p), `pasta de páginas "${p}" fora de PASTAS_DE_PAGINAS (pages.yml)`);
  for (const p of pastas) {
    assert.ok(fs.existsSync(path.join(RAIZ, p)), `PASTAS_DE_PAGINAS lista "${p}", que não existe`);
    assert.ok(!INTERNAS.includes(p), `"${p}" é interna e não pode ser publicada`);
  }
});

test('pages.yml: arquivos soltos da raiz (manifest, sw.js, favicon) existem e o ícone/manifest/SW apontam pro que é copiado', () => {
  const arquivos = lista('ARQUIVOS_RAIZ');
  for (const a of ['favicon.ico', 'manifest.json', 'sw.js']) assert.ok(arquivos.includes(a), a);
  for (const a of arquivos) assert.ok(fs.existsSync(path.join(RAIZ, a)), a);
  // o que as páginas da raiz linkam (css/js/imagens/manifest) está dentro do que é copiado
  const pastas = lista('PASTAS_DE_PAGINAS');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  for (const [, href] of html.matchAll(/(?:href|src)="((?!https?:|data:|#)[^"]+)"/g)) {
    const topo = href.split('/')[0].split('?')[0];
    assert.ok(pastas.includes(topo) || arquivos.includes(topo) || topo.endsWith('.html'), `index.html usa "${href}", que o workflow não copia`);
  }
});

test('pages.yml: a conferência do workflow proíbe as pastas internas', () => {
  for (const p of ['tests', 'docs', 'scripts', 'apps-script']) assert.match(yml, new RegExp(`for proibido in [^\\n]*\\b${p}\\b`), `${p} na lista de proibidos`);
});
