// scripts/grafo-imports.mjs - 06/10/2026 (A-42): grafo de imports do front por tela.
//   node scripts/grafo-imports.mjs            -> tabela: módulos e KB (bruto/gz) carregados por HTML (estáticos + modulepreload)
//   node scripts/grafo-imports.mjs --dinamicos -> lista também os import() dinâmicos (por tela)
// Só lê arquivos; não precisa de servidor. Segue `import ... from './x.js'`, `export ... from` e import() literais.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = ROOT;
export const PAGINAS = ['index.html', 'distribuicoes-metas.html', 'metas.html', 'carteiras/index.html', 'ativo/index.html',
  'transacoes/index.html', 'proventos/index.html', 'organizacao/despesas.html', 'login.html'];

const RE_ESTATICO = /(?:^|[\s;}])(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
const RE_DINAMICO = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;

export function importsDe(arquivo) {
  const src = fs.readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const pega = (re) => [...src.matchAll(re)].map((m) => path.resolve(path.dirname(arquivo), m[1]));
  return { estaticos: pega(RE_ESTATICO), dinamicos: pega(RE_DINAMICO) };
}

export function fecho(entradas, { dinamicos = false } = {}) {
  const vistos = new Set();
  const pilha = [...entradas];
  while (pilha.length) {
    const f = pilha.pop();
    if (vistos.has(f) || !fs.existsSync(f)) continue;
    vistos.add(f);
    const { estaticos, dinamicos: din } = importsDe(f);
    pilha.push(...estaticos);
    if (dinamicos) pilha.push(...din);
  }
  return vistos;
}

/**
 * Telas/abas que o HTML abre com import() mas que são a de ENTRADA daquele HTML (ex.: o <script> inline do router só importa shell.js e
 * router.js): o caminho crítico delas inclui o módulo da tela, então o modulepreload também.
 */
export const TELA_DE_ENTRADA = {
  'index.html': ['assets/js/pages/inicio.js'],
  'distribuicoes-metas.html': ['assets/js/pages/distribuicoes-metas.js'],
  'metas.html': ['assets/js/pages/metas.js'],
  'carteiras/index.html': ['assets/js/pages/carteiras-visao-geral.js'], // subpágina padrão (as outras 4 entram ao abrir a aba)
  'transacoes/index.html': ['assets/js/pages/aportes.js'], // aba padrão (Lançamentos entra em segundo plano)
};

/** Módulos (caminhos absolutos) do caminho crítico de um HTML: fecho estático do <script> inline + da tela de entrada. */
export function modulosCriticos(html) {
  const { rel } = entradasDoHtml(html);
  const extra = (TELA_DE_ENTRADA[html] || []).map((f) => path.join(ROOT, f));
  return [...fecho([...rel, ...extra])].sort();
}

export function entradasDoHtml(html) {
  const txt = fs.readFileSync(path.join(ROOT, html), 'utf8');
  const base = path.dirname(path.join(ROOT, html));
  const inline = [...txt.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const rel = [...inline.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => path.resolve(base, m[1]));
  const dyn = [...inline.matchAll(/import\(\s*'(\.[^']+)'\s*\)/g)].map((m) => path.resolve(base, m[1]));
  const pre = [...txt.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => path.resolve(base, m[1]));
  return { rel, dyn, pre };
}

export function tamanho(arquivos) {
  let bruto = 0; let gz = 0;
  for (const f of arquivos) { const b = fs.readFileSync(f); bruto += b.length; gz += zlib.gzipSync(b).length; }
  return { bruto, gz };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const comDin = process.argv.includes('--dinamicos');
  console.log('| HTML | módulos no caminho crítico | KB | KB gz |');
  console.log('|---|---|---|---|');
  for (const h of PAGINAS) {
    const set = modulosCriticos(h);
    const t = tamanho(set);
    console.log(`| ${h} | ${set.length} | ${(t.bruto / 1024).toFixed(0)} | ${(t.gz / 1024).toFixed(0)} |`);
    if (comDin) {
      const { rel } = entradasDoHtml(h);
      const total = fecho([...rel, ...(TELA_DE_ENTRADA[h] || []).map((f) => path.join(ROOT, f))], { dinamicos: true });
      const t2 = tamanho(total);
      console.log(`|   (+ todo import() dinâmico alcançável) | ${total.size} | ${(t2.bruto / 1024).toFixed(0)} | ${(t2.gz / 1024).toFixed(0)} |`);
    }
  }
}
