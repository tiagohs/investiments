// tests/carga-telas.test.js - 06/10/2026 (A-42): cada tela carrega só o que usa, sem build (o site é publicado direto da branch).
//
//  - o router não importa as telas estaticamente (import() por rota) e cada HTML de entrada linka só o CSS da própria aba;
//  - o bloco <link rel="modulepreload"> de cada HTML bate com o grafo de imports (rode `node scripts/gerar-modulepreload.mjs`);
//  - orçamento de módulos/KB por tela (para uma tela não voltar a arrastar o código das outras);
//  - sw.js: versão do cache e estratégias (CSS/imagens em stale-while-revalidate, JS e HTML na rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_DIR, PAGINAS, modulosCriticos, fecho, tamanho, importsDe } from '../scripts/grafo-imports.mjs';
import { blocoEsperado, INICIO, FIM } from '../scripts/gerar-modulepreload.mjs';

const ler = (p) => fs.readFileSync(path.join(ROOT_DIR, p), 'utf8');
const links = (html) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]).filter((h) => !h.startsWith('http'));
const nomesCss = (html) => links(html).map((h) => h.split('/').pop());

test('router.js: nenhuma tela é importada estaticamente (só import() por rota) e as folhas de cada rota existem', async () => {
  const { estaticos, dinamicos } = importsDe(path.join(ROOT_DIR, 'assets/js/router.js'));
  const telas = estaticos.filter((f) => /\/pages\/(?!metas-template)/.test(f));
  assert.deepEqual(telas, [], 'router.js importa tela estaticamente');
  assert.equal(dinamicos.length, 3, 'inicio, distribuicoes-metas e metas por import()');
  const { ROUTES } = await import('../assets/js/router.js');
  for (const rota of ROUTES) {
    assert.equal(typeof rota.carregar, 'function', rota.key);
    assert.ok(rota.css.length >= 1, `${rota.key}: css da aba`);
    for (const css of rota.css) assert.ok(fs.existsSync(path.join(ROOT_DIR, 'assets/css', css)), `${rota.key}: ${css} não existe`);
  }
});

test('HTMLs do router: só as folhas da aba de entrada no <head> (as outras entram com o import() da aba)', async () => {
  const { ROUTES } = await import('../assets/js/router.js');
  const base = ['m3-tokens.css', 'shell.css', 'components.css'];
  for (const [html, chave] of [['index.html', 'inicio'], ['distribuicoes-metas.html', 'distribuicoes'], ['metas.html', 'metas']]) {
    const rota = ROUTES.find((r) => r.key === chave);
    assert.deepEqual(nomesCss(ler(html)), [...base, ...rota.css], `${html}: folhas = base + ROUTES[${chave}].css`);
  }
  // as folhas das outras abas não podem estar na página de entrada
  const outras = { 'index.html': ['distribuicoes-metas.css', 'metas.css'], 'distribuicoes-metas.html': ['inicio.css', 'metas.css'], 'metas.html': ['inicio.css'] };
  for (const [html, proibidas] of Object.entries(outras)) for (const css of proibidas) assert.ok(!nomesCss(ler(html)).includes(css), `${html} linka ${css}`);
});

test('HTMLs: preload das fontes próprias (latin) e bloco modulepreload em dia com o grafo de imports', () => {
  for (const html of PAGINAS) {
    const txt = ler(html);
    // 06/10/2026: fontes servidas pelo próprio site (assets/fonts): sem preconnect a terceiros, preload só do subset latin
    const pref = html.includes('/') ? '../' : '';
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(txt), `${html}: ainda aponta pro Google Fonts`);
    assert.ok(txt.includes(`<link rel="preload" href="${pref}assets/fonts/readex-latin.woff2" as="font" type="font/woff2" crossorigin>`), `${html}: preload Readex Pro`);
    // o login não usa a Roboto Mono (números em coluna só nas telas do app): sem preload à toa
    assert.equal(txt.includes(`<link rel="preload" href="${pref}assets/fonts/robotomono-latin.woff2" as="font" type="font/woff2" crossorigin>`), html !== 'login.html', `${html}: preload Roboto Mono`);
    const i = txt.indexOf(INICIO);
    const j = txt.indexOf(FIM);
    assert.ok(i > 0 && j > i, `${html}: sem bloco modulepreload (node scripts/gerar-modulepreload.mjs)`);
    assert.equal(txt.slice(i, j + FIM.length + 1), blocoEsperado(html), `${html}: modulepreload desatualizado (node scripts/gerar-modulepreload.mjs)`);
  }
});

test('modulepreload: cada módulo listado existe e cobre o fecho do script inline da página', () => {
  for (const html of PAGINAS) {
    const base = path.dirname(path.join(ROOT_DIR, html));
    const hrefs = [...ler(html).matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => path.resolve(base, m[1]));
    assert.ok(hrefs.length >= 5, html);
    hrefs.forEach((f) => assert.ok(fs.existsSync(f), `${html}: ${f}`));
    const inline = ler(html).match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    for (const m of inline.matchAll(/from\s+'(\.[^']+)'/g)) assert.ok(hrefs.includes(path.resolve(base, m[1])), `${html}: ${m[1]} fora do modulepreload`);
  }
});

// Orçamento do caminho crítico (módulos estáticos de cada HTML, KB sem compressão). Folga de ~5% sobre o medido em 06/10/2026;
// se estourar, ou a tela voltou a importar algo que não usa (consertar), ou cresceu de verdade (subir o teto de propósito).
const ORCAMENTO = {
  'index.html': { modulos: 58, kb: 830 },
  'distribuicoes-metas.html': { modulos: 58, kb: 930 },
  'metas.html': { modulos: 54, kb: 1010 },
  'carteiras/index.html': { modulos: 61, kb: 1010 },
  'ativo/index.html': { modulos: 62, kb: 1190 },
  'transacoes/index.html': { modulos: 58, kb: 830 },
  'proventos/index.html': { modulos: 46, kb: 680 },
  'organizacao/despesas.html': { modulos: 66, kb: 1460 },
  'login.html': { modulos: 6, kb: 50 },
};
for (const [html, teto] of Object.entries(ORCAMENTO)) {
  test(`orçamento de carga: ${html} ≤ ${teto.modulos} módulos e ≤ ${teto.kb} KB`, () => {
    const mods = modulosCriticos(html);
    const kb = tamanho(mods).bruto / 1024;
    assert.ok(mods.length <= teto.modulos, `${mods.length} módulos (teto ${teto.modulos})`);
    assert.ok(kb <= teto.kb, `${kb.toFixed(0)} KB (teto ${teto.kb})`);
  });
}

test('separação por tela: Início, Acompanhamento e Metas não carregam o código uma da outra; Proventos não carrega inicio.js; Ativo/Transações não carregam metas-calc', () => {
  const alvo = (f) => path.join(ROOT_DIR, 'assets/js', f);
  const tem = (html, ...arqs) => { const s = new Set(modulosCriticos(html)); return arqs.filter((a) => s.has(alvo(a))); };
  assert.deepEqual(tem('index.html', 'pages/distribuicoes-metas.js', 'pages/metas.js', 'pages/metas-calc-plano.js', 'pages/metas-viagem.js'), []);
  assert.deepEqual(tem('distribuicoes-metas.html', 'pages/inicio.js', 'pages/inicio-calc.js', 'pages/metas.js', 'pages/metas-viagem.js', 'pages/metas-calc-analise.js'), []);
  assert.deepEqual(tem('metas.html', 'pages/inicio.js', 'pages/inicio-calc.js', 'pages/distribuicoes-metas.js', 'pages/momento-aporte.js'), []);
  assert.deepEqual(tem('proventos/index.html', 'pages/inicio.js', 'pages/inicio-ativos.js', 'pages/inicio-rentabilidade.js', 'pages/carteiras-classe-comum.js'), []);
  for (const html of ['ativo/index.html', 'transacoes/index.html']) {
    assert.deepEqual(tem(html, 'pages/inicio.js', 'pages/metas-calc.js', 'pages/metas-calc-plano.js', 'pages/metas-calc-viagem.js', 'pages/metas-calc-analise.js', 'metas-card.js'), [], html);
  }
  assert.deepEqual(tem('transacoes/index.html', 'pages/lancamentos.js'), [], 'Lançamentos só ao abrir a aba');
  assert.deepEqual(tem('ativo/index.html', 'pages/ativo-patrimonio.js'), [], 'Patrimônio dos FIIs só quando o ativo é FII');
  // o motor de critérios só precisa do núcleo leve de Metas
  assert.deepEqual([...fecho([alvo('criterios/motor.js')])].filter((f) => /metas-calc/.test(f)).map((f) => path.basename(f)), ['metas-calc-nucleo.js']);
});

test('carteiras-router.js: as 5 subpáginas são importadas sob demanda', () => {
  const { estaticos, dinamicos } = importsDe(path.join(ROOT_DIR, 'assets/js/carteiras-router.js'));
  assert.deepEqual(estaticos.filter((f) => /\/pages\/carteiras-/.test(f)), []);
  assert.equal(dinamicos.length, 5);
});

// sw.js roda num "self" falso: confere versão e estratégias sem navegador.
function rodarSw({ cacheado = null } = {}) {
  const codigo = ler('sw.js');
  const ouvintes = {};
  const chamadas = [];
  const guardados = [];
  const sb = {
    self: { addEventListener: (t, f) => { ouvintes[t] = f; }, location: { origin: 'https://x.test' }, skipWaiting() {}, registration: {} },
    caches: { open: async () => ({ put: async (req) => { guardados.push(req.url); } }), match: async () => cacheado, keys: async () => [] },
    fetch: async (req, init) => { chamadas.push({ destino: req.destination || req.mode, init }); return { ok: true, clone() { return this; } }; },
    URL,
  };
  vm.createContext(sb);
  vm.runInContext(codigo, sb);
  const disparar = async (req) => {
    let p; const esperas = [];
    ouvintes.fetch({ request: { method: 'GET', url: 'https://x.test/a', ...req }, respondWith: (x) => { p = x; }, waitUntil: (x) => esperas.push(x) });
    const resp = await p; await Promise.all(esperas);
    return resp;
  };
  return { disparar, chamadas, guardados, codigo };
}

test('sw.js: CACHE_VERSION v6 (ou maior) com a divisão por rota', () => {
  const { codigo } = rodarSw();
  const v = Number(codigo.match(/const CACHE_VERSION = 'v(\d+)'/)[1]);
  assert.ok(v >= 6, `CACHE_VERSION v${v}`);
});

test('sw.js: CSS e imagens em stale-while-revalidate (cache na hora + atualiza em segundo plano); JS vai à rede revalidando', async () => {
  const copia = { ok: true, from: 'cache' };
  const com = rodarSw({ cacheado: copia });
  assert.equal(await com.disparar({ destination: 'style' }), copia, 'CSS vem do cache');
  assert.equal(await com.disparar({ destination: 'image' }), copia, 'imagem vem do cache');
  assert.equal(com.chamadas.length, 2, 'e atualiza em segundo plano');
  assert.ok(com.chamadas.every((c) => c.init && c.init.cache === 'no-cache'));
  assert.equal(com.guardados.length, 2);
  // JS nunca sai do cache quando a rede responde (versões de módulos não podem se misturar - ver o cabeçalho do sw.js)
  const js = rodarSw({ cacheado: copia });
  const r = await js.disparar({ destination: 'script' });
  assert.notEqual(r, copia);
  assert.equal(js.chamadas[0].init.cache, 'no-cache');
  // sem cópia: vai à rede
  const vazio = rodarSw();
  assert.equal((await vazio.disparar({ destination: 'style' })).ok, true);
  assert.equal(vazio.chamadas.length, 1);
});
