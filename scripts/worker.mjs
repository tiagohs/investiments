#!/usr/bin/env node
/**
 * scripts/worker.mjs - 29/10/2026: configura e publica o Worker de leitura (docs/arquitetura-leitura-cloudflare.md).
 * Rode no Terminal do Mac, na pasta do projeto:  npm run worker:configurar
 *
 * 1. confere o login do wrangler (se faltar: npx wrangler login)
 * 2. cria o banco D1 "investiments-leitura" (se não existir) e grava o id no worker/wrangler.toml
 * 3. aplica worker/schema.sql no banco
 * 4. segredos (nunca no repositório): PUBLICACAO_SEGREDO é gerado aqui e guardado em worker/.segredos.local (fora do git);
 *    SESSAO_SEGREDO e EMAILS_AUTORIZADOS são perguntados (o 1º sai do editor do Apps Script: mostrarSegredoSessaoParaWorkerDireto)
 * 5. publica o Worker e mostra o que rodar no editor do Apps Script
 * Rodar de novo é seguro: o que já existe é mantido (use --trocar-segredos pra perguntar tudo de novo).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(RAIZ, 'worker');
const TOML = path.join(PASTA, 'wrangler.toml');
const SEGREDOS = path.join(PASTA, '.segredos.local');
const BANCO = 'investiments-leitura';
const trocar = process.argv.includes('--trocar-segredos');

const wrangler = (args, { entrada = null, mostrar = false } = {}) => {
  const r = spawnSync('npx', ['--yes', 'wrangler@4', ...args], { cwd: PASTA, input: entrada ?? undefined, encoding: 'utf8', stdio: [entrada == null ? 'inherit' : 'pipe', 'pipe', 'pipe'] });
  if (mostrar && r.stdout) process.stdout.write(r.stdout);
  return { ok: r.status === 0, saida: `${r.stdout || ''}${r.stderr || ''}` };
};
const sair = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };

console.log('1/5 login do Cloudflare…');
const quem = wrangler(['whoami']);
if (!quem.ok || /not authenticated/i.test(quem.saida)) sair('Faça o login uma vez: cd worker && npx wrangler login (abre o navegador) e rode de novo.');

console.log('2/5 banco D1…');
let toml = fs.readFileSync(TOML, 'utf8');
if (/database_id = "PREENCHER/.test(toml)) {
  const lista = wrangler(['d1', 'list', '--json']);
  let id = null;
  try { id = (JSON.parse(lista.saida.slice(lista.saida.indexOf('['))).find((d) => d.name === BANCO) || {}).uuid || null; } catch (e) { id = null; }
  if (!id) {
    const criado = wrangler(['d1', 'create', BANCO]);
    const m = criado.saida.match(/"?database_id"?\s*[=:]\s*"([0-9a-f-]{36})"/);
    if (!m) sair(`não consegui criar o D1:\n${criado.saida}`);
    id = m[1];
  }
  toml = toml.replace(/database_id = "[^"]*"/, `database_id = "${id}"`);
  fs.writeFileSync(TOML, toml);
  console.log(`   id ${id} gravado no worker/wrangler.toml (pode ir pro git: não é segredo)`);
} else console.log('   já configurado');

console.log('3/5 tabelas…');
const esquema = wrangler(['d1', 'execute', BANCO, '--remote', '--file=schema.sql', '--yes']);
if (!esquema.ok) sair(`schema.sql falhou:\n${esquema.saida}`);

console.log('4/5 segredos…');
const existentes = wrangler(['secret', 'list', '--format', 'json']);
let nomes = [];
try { nomes = JSON.parse(existentes.saida.slice(existentes.saida.indexOf('['))).map((s) => s.name); } catch (e) { nomes = []; }
const local = fs.existsSync(SEGREDOS) ? JSON.parse(fs.readFileSync(SEGREDOS, 'utf8')) : {};
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
async function garantir(nome, obter) {
  if (nomes.includes(nome) && !trocar) { console.log(`   ${nome}: já existe`); return; }
  const valor = await obter();
  const r = wrangler(['secret', 'put', nome], { entrada: valor });
  if (!r.ok) sair(`${nome}: ${r.saida}`);
  console.log(`   ${nome}: gravado`);
}
await garantir('PUBLICACAO_SEGREDO', async () => {
  local.PUBLICACAO_SEGREDO = crypto.randomBytes(36).toString('base64url');
  fs.writeFileSync(SEGREDOS, JSON.stringify(local, null, 2), { mode: 0o600 });
  return local.PUBLICACAO_SEGREDO;
});
await garantir('SESSAO_SEGREDO', async () => (await rl.question('   Cole o segredo da sessão (editor do Apps Script › rode mostrarSegredoSessaoParaWorkerDireto › Registro de execução): ')).trim());
await garantir('EMAILS_AUTORIZADOS', async () => (await rl.question('   E-mails autorizados, separados por vírgula (os mesmos do site): ')).trim());
rl.close();

console.log('5/5 publicando o Worker…');
const dep = wrangler(['deploy']);
if (!dep.ok) sair(`deploy falhou:\n${dep.saida}`);
const url = (dep.saida.match(/https:\/\/[\w.-]+\.workers\.dev/) || [])[0] || '(veja a saída acima)';
console.log(`\n✓ Worker no ar: ${url}`);
const seg = local.PUBLICACAO_SEGREDO ? local.PUBLICACAO_SEGREDO : '(o PUBLICACAO_SEGREDO de worker/.segredos.local)';
console.log(`\nAgora, no editor do Apps Script (uma vez):
  1. Configurações do projeto (engrenagem) › Propriedades do script › adicione:
       LEITURA_URL     = ${url}
       LEITURA_SEGREDO = ${seg}
  2. Rode publicarLeituraDireto()  (1ª publicação de todas as telas)
  3. Rode instalarGatilhoPublicacaoDireto()  (pregão, a cada 15 min)
`);
