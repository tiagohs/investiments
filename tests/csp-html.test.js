// tests/csp-html.test.js
//
// 05/10/2026 (A-44): todas as páginas do app trazem uma Content-Security-Policy
// (meta). Como os <script type="module"> de cada página são inline, a CSP os
// libera por HASH - se alguém editar o script e esquecer de atualizar o hash,
// a página para de carregar no navegador. Este teste pega isso (e confere que
// o que o site usa continua liberado: Google Fonts, GSI do login, Apps Script).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const RAIZ = new URL('..', import.meta.url);
const PAGINAS = ['index.html', 'distribuicoes-metas.html', 'metas.html', 'login.html', 'ativo/index.html', 'carteiras/index.html', 'organizacao/despesas.html', 'proventos/index.html', 'transacoes/index.html'];
const ler = (p) => fs.readFileSync(new URL(p, RAIZ), 'utf8');
const hash = (t) => `'sha256-${crypto.createHash('sha256').update(t, 'utf8').digest('base64')}'`;
function csp(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  assert.ok(m, 'sem meta CSP');
  const dir = {};
  m[1].split(';').map((x) => x.trim()).filter(Boolean).forEach((d) => { const [nome, ...v] = d.split(/\s+/); dir[nome] = v; });
  return dir;
}

for (const pagina of PAGINAS) {
  test(`CSP ${pagina}: libera os <script> inline por hash e tudo que a página usa`, () => {
    const html = ler(pagina);
    const d = csp(html);
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
    assert.ok(inline.length >= 1);
    inline.forEach((s) => assert.ok(d['script-src'].includes(hash(s)), `hash do <script> inline desatualizado em ${pagina}`));
    assert.ok(!d['script-src'].includes("'unsafe-inline'") && !d['script-src'].includes("'unsafe-eval'"), 'sem unsafe-inline/eval nos scripts');
    // onerror="this.remove()" gerado pelos módulos
    assert.ok(d['script-src'].includes("'unsafe-hashes'") && d['script-src'].includes(hash('this.remove()')) && d['script-src'].includes(hash("this.closest('figure').remove()")));
    // todo <script src> e <link stylesheet> externo está coberto
    for (const [, url] of html.matchAll(/<script[^>]*\bsrc="(https:\/\/[^"]+)"/g)) assert.ok(d['script-src'].some((o) => url.startsWith(o)), url);
    assert.ok(d['style-src'].includes('https://fonts.googleapis.com'), 'Google Fonts (css)');
    assert.ok(d['font-src'].includes('https://fonts.gstatic.com'), 'Google Fonts (arquivos)');
    assert.ok(d['connect-src'].includes('https://script.google.com') && d['connect-src'].includes('https://script.googleusercontent.com'), 'Apps Script (redireciona pro googleusercontent)');
    assert.deepEqual(d['object-src'], ["'none'"]);
    assert.deepEqual(d['base-uri'], ["'self'"]);
  });
}

test('CSP login.html: libera o Google Identity Services (script, botão em iframe, estilo e conexão)', () => {
  const d = csp(ler('login.html'));
  assert.ok(d['script-src'].includes('https://accounts.google.com/gsi/client'));
  assert.ok(d['frame-src'].includes('https://accounts.google.com/gsi/'));
  assert.ok(d['connect-src'].includes('https://accounts.google.com/gsi/'));
  assert.ok(d['style-src'].includes('https://accounts.google.com/gsi/style'));
});

test('CSP: o que o código do front chama de fora está liberado (BCB, Nominatim, Leaflet/PDF.js/SheetJS no cdnjs, YouTube, Drive)', () => {
  const d = csp(ler('transacoes/index.html'));
  assert.ok(d['connect-src'].includes('https://api.bcb.gov.br') && d['connect-src'].includes('https://nominatim.openstreetmap.org'));
  assert.ok(d['script-src'].includes('https://cdnjs.cloudflare.com') && d['worker-src'].includes('https://cdnjs.cloudflare.com'));
  assert.ok(d['style-src'].includes('https://cdnjs.cloudflare.com'));
  assert.ok(d['frame-src'].includes('https://www.youtube-nocookie.com') && d['frame-src'].includes('https://drive.google.com'));
  assert.ok(d['img-src'].includes('https:'), 'imagens de notícias/mapa/miniaturas');
});

// 05/10/2026 (Onda 3, base Material 3): toda página carrega Readex Pro + tokens -> shell -> componentes, nessa ordem,
// ANTES dos CSS de página (os CSS de página sobrescrevem a base, não o contrário).
for (const pagina of PAGINAS) {
  test(`Head ${pagina}: fonte Readex Pro e CSS m3-tokens -> shell -> components antes dos CSS de página`, () => {
    const html = ler(pagina);
    assert.ok(/fonts\.googleapis\.com\/css2\?family=Readex\+Pro/.test(html), 'Readex Pro');
    assert.ok(!/Fraunces|Public\+Sans|IBM\+Plex/.test(html), 'fontes antigas fora');
    const css = [...html.matchAll(/<link rel="stylesheet" href="((?:\.\.\/)?assets\/css\/[^"]+)"/g)].map((m) => m[1].replace('../', ''));
    const pos = (n) => css.indexOf(`assets/css/${n}.css`);
    assert.ok(pos('m3-tokens') >= 0 && pos('m3-tokens') < pos('shell') && pos('shell') < pos('components'), 'ordem tokens -> shell -> components');
    css.filter((c) => !/m3-tokens|shell|components/.test(c)).forEach((c) => assert.ok(css.indexOf(c) > pos('components'), `${c} depois dos componentes`));
    assert.ok(/<meta name="theme-color" content="#F8FAFC" media="\(prefers-color-scheme: light\)">/.test(html) && /<meta name="theme-color" content="#0F172A" media="\(prefers-color-scheme: dark\)">/.test(html), 'theme-color M3');
  });
}
