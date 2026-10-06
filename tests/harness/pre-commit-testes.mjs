// tests/harness/pre-commit-testes.mjs
//
// 06/10/2026 (A-75): o pre-commit rodava verificar.mjs (a suíte inteira, ~3-5 min) - commit lento é commit evitado.
// Agora o gancho (.githooks/pre-commit) chama este script, que:
//   1. barra o commit de arquivo com dado real (fixtures.json, *.local.json, relatorio/, _to_delete/) - repositório PÚBLICO;
//   2. checagens rápidas: `node --check` em cada .js/.mjs/.gs do commit e JSON.parse em cada .json;
//   3. roda SÓ os testes dos arquivos afetados (selecionarTestes) - a suíte completa fica pro `npm test` / `npm run verificar`.
// Falha de teste "[DADO DA PLANILHA]" (alerta de lançamento na planilha) e `todo` não bloqueiam, como no verificar.mjs.
//
//   node tests/harness/pre-commit-testes.mjs                    # arquivos do stage (git diff --cached)
//   node tests/harness/pre-commit-testes.mjs --arquivos a b ... # simula (não olha o git)
//   node tests/harness/pre-commit-testes.mjs --so-listar        # só mostra os testes escolhidos
//   PRE_COMMIT_COMPLETO=1 git commit ...                        # a suíte inteira + relatório (verificar.mjs)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..', '..');
const PREFIXO_DADO = '[DADO DA PLANILHA]';
const PROIBIDOS = [
  [/(^|\/)tests\/harness\/fixtures\.json$/, 'fixtures.json tem a planilha real'],
  [/\.local\.json$/, 'arquivo *.local.json tem número real (referências externas)'],
  [/(^|\/)tests\/harness\/relatorio\//, 'o relatório das telas tem dado real'],
  [/(^|\/)tests\/harness\/_to_delete\//, '_to_delete tem cópias de dado real'],
  [/(^|\/)documents\//, 'documents/ tem material de assinante com marca d\'água'],
  [/\.pdf$/i, 'PDF (informe de rendimentos/extratos têm CPF e valores)'],
];

function listarArquivos(dir, aceita, saida = []) {
  if (!fs.existsSync(dir)) return saida;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '_to_delete', 'relatorio', '__pycache__', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listarArquivos(p, aceita, saida);
    else if (aceita(p)) saida.push(p);
  }
  return saida;
}

const ehTeste = (rel) => /^tests\/.*\.test\.m?js$/.test(rel);
const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Quais testes rodar pra esses arquivos alterados (caminhos relativos à raiz, com /).
 *  - o próprio arquivo, se for teste;
 *  - módulo/ajudante dentro de tests/: todo teste que o importa, direta ou indiretamente (fecho do grafo de imports);
 *  - código-fonte (assets/, apps-script/, html, css, sw.js): testes cujo texto cita o arquivo (`/nome.js`, `'nome.js'`);
 *  - qualquer .gs: também a coerência entre telas e o contrato das abas; qualquer .html: a CSP.
 * Devolve { testes: [relativos], motivos: { teste: [por quê] } }.
 */
export function selecionarTestes(alterados, { raiz = RAIZ } = {}) {
  const abs = (rel) => path.join(raiz, rel);
  const todos = listarArquivos(path.join(raiz, 'tests'), (p) => /\.m?js$/.test(p)).map((p) => path.relative(raiz, p).split(path.sep).join('/'));
  const textos = new Map(todos.map((r) => [r, fs.readFileSync(abs(r), 'utf8')]));
  const cita = (rel, base) => new RegExp(`[/'"\`]${escapa(base)}['"\`:?#\\s]`).test(textos.get(rel));
  const motivos = {};
  const marca = (teste, porque) => { if (!ehTeste(teste) || !textos.has(teste)) return; (motivos[teste] = motivos[teste] || []).push(porque); };

  for (const rel of alterados) {
    const base = path.posix.basename(rel);
    if (ehTeste(rel)) { marca(rel, 'foi alterado'); continue; }
    if (/^tests\//.test(rel) && /\.m?js$/.test(rel)) {
      // ajudante de teste: fecho dos que importam (direta ou indiretamente)
      const vistos = new Set([rel]);
      const fila = [rel];
      while (fila.length) {
        const atual = fila.shift();
        for (const outro of todos) {
          if (vistos.has(outro) || !cita(outro, path.posix.basename(atual))) continue;
          vistos.add(outro); fila.push(outro);
          marca(outro, `importa ${base}`);
        }
      }
      continue;
    }
    if (/^(docs|ativo\/docs)\//.test(rel) || /\.(md|png|jpe?g|svg|ico|webmanifest)$/i.test(rel)) continue; // nada a testar
    for (const t of todos) if (ehTeste(t) && cita(t, base)) marca(t, `cita ${base}`);
    if (rel.endsWith('.gs')) {
      marca('tests/harness/coerencia-telas.test.mjs', `${base} alterado (coerência entre telas)`);
      marca('tests/harness/abas-contrato.test.js', `${base} alterado (abas/cabeçalhos que o código usa)`);
    }
    if (rel.endsWith('.html')) marca('tests/csp-html.test.js', `${base} alterado (CSP)`);
  }
  return { testes: Object.keys(motivos).sort(), motivos };
}

/** Problemas "baratos" dos arquivos do commit: dado real, sintaxe, JSON inválido. */
export function checagensRapidas(alterados, { raiz = RAIZ } = {}) {
  const problemas = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-'));
  try {
    for (const rel of alterados) {
      for (const [re, porque] of PROIBIDOS) if (re.test(rel)) problemas.push(`${rel}: não pode entrar no repositório público (${porque})`);
      const arq = path.join(raiz, rel);
      if (!fs.existsSync(arq)) continue; // removido no commit
      if (/\.(m?js|gs)$/.test(rel)) {
        // .js/.mjs do projeto são módulos ES (package.json "type": "module"): checa no lugar. .gs é script comum: copia pra um .js fora do projeto.
        let alvo = arq;
        if (rel.endsWith('.gs')) { alvo = path.join(tmp, `${path.basename(rel).replace(/[^\w.-]/g, '_')}.js`); fs.copyFileSync(arq, alvo); }
        const r = spawnSync(process.execPath, ['--check', alvo], { encoding: 'utf8', cwd: tmp });
        if (r.status !== 0) problemas.push(`${rel}: erro de sintaxe\n${String(r.stderr || r.stdout).split('\n').slice(0, 6).join('\n')}`);
      } else if (/\.json$/.test(rel)) {
        try { JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { problemas.push(`${rel}: JSON inválido (${e.message})`); }
      }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return problemas;
}

function arquivosDoStage() {
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'], { cwd: RAIZ, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

function rodar(testes) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testes], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 1 << 28 });
  const saida = `${r.stdout}\n${r.stderr}`;
  const falhas = [], pendentes = [];
  let ok = 0, pulados = 0;
  for (const linha of saida.split('\n')) {
    const m = linha.match(/^(not ok|ok) \d+ - (.*)$/);
    if (!m) continue;
    if (/#\s*SKIP/.test(m[2])) pulados += 1;
    else if (/#\s*TODO/.test(m[2])) pendentes.push(m[2]);
    else if (m[1] === 'ok') ok += 1;
    else falhas.push(m[2]);
  }
  return { ok, pulados, falhas, pendentes, saida };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--arquivos');
  const alterados = (i >= 0 ? args.slice(i + 1).filter((a) => !a.startsWith('--')) : arquivosDoStage()).map((a) => a.replace(/\\/g, '/'));
  const soListar = args.includes('--so-listar');

  if (process.env.PRE_COMMIT_COMPLETO === '1' && i < 0 && !soListar) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'verificar.mjs')], { cwd: RAIZ, stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
  const inicio = Date.now();
  const problemas = checagensRapidas(alterados);
  if (problemas.length) {
    console.log('pre-commit: o commit foi barrado nas checagens rápidas:');
    problemas.forEach((p) => console.log(`  ✗ ${p}`));
    process.exit(1);
  }
  const { testes, motivos } = selecionarTestes(alterados);
  if (!testes.length) { console.log(`pre-commit: ${alterados.length} arquivo(s), checagens rápidas ok, nenhum teste afetado.`); process.exit(0); }
  console.log(`pre-commit: ${alterados.length} arquivo(s), checagens rápidas ok; ${testes.length} arquivo(s) de teste afetado(s) (a suíte completa fica pro \`npm test\`; \`PRE_COMMIT_COMPLETO=1 git commit\` roda tudo):`);
  testes.forEach((t) => console.log(`  - ${t}  (${motivos[t].slice(0, 2).join('; ')})`));
  if (soListar) process.exit(0);
  const r = rodar(testes);
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  const bloqueiam = r.falhas.filter((n) => !n.startsWith(PREFIXO_DADO));
  const alertas = r.falhas.filter((n) => n.startsWith(PREFIXO_DADO));
  console.log(`pre-commit: ${r.ok} ok · ${bloqueiam.length} falha(s) · ${alertas.length} alerta(s) de dado da planilha · ${r.pendentes.length} pendente(s) · ${r.pulados} pulado(s) · ${segundos}s`);
  alertas.forEach((n) => console.log(`  ! ${n.slice(PREFIXO_DADO.length + 1)}`));
  if (bloqueiam.length) {
    console.log('\n✗ FALHAS (corrija antes de commitar; `git commit --no-verify` pula uma vez):');
    bloqueiam.forEach((n) => console.log(`  ✗ ${n}`));
    process.exit(1);
  }
}
