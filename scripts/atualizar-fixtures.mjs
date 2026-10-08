#!/usr/bin/env node
// scripts/atualizar-fixtures.mjs - 08/10/2026: atualiza tests/harness/fixtures.json (os testes com a planilha real) a partir
// da cópia .xlsx que o Apps Script grava todo dia no Drive (ExportarPlanilha.gs) e o Google Drive para desktop sincroniza:
//   ~/Library/CloudStorage/GoogleDrive-<sua conta>/Meu Drive/investiments-dados/Investimentos - Controle.xlsx
//
//   npm run fixtures:atualizar                 acha a cópia sozinho
//   npm run fixtures:atualizar -- <arquivo>    usa outro .xlsx
//
// fixtures.json fica fora do git (dado financeiro real). Precisa de python3 com openpyxl (pip3 install openpyxl).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');
const NOME = 'Investimentos - Controle.xlsx';
const PASTA = 'investiments-dados';

/** Caminhos possíveis da cópia no Drive para desktop (macOS/Windows; "Meu Drive" ou "My Drive"). */
export function candidatos(home = os.homedir(), listar = (p) => (fs.existsSync(p) ? fs.readdirSync(p) : [])) {
  const out = [];
  const cloud = path.join(home, 'Library', 'CloudStorage');
  for (const conta of listar(cloud).filter((n) => /^GoogleDrive/i.test(n))) {
    for (const meu of ['Meu Drive', 'My Drive']) out.push(path.join(cloud, conta, meu, PASTA, NOME));
  }
  for (const raiz of [path.join(home, 'Google Drive'), 'G:\\']) for (const meu of ['Meu Drive', 'My Drive']) out.push(path.join(raiz, meu, PASTA, NOME));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  const arquivo = arg || candidatos().find((p) => fs.existsSync(p));
  if (!arquivo || !fs.existsSync(arquivo)) {
    console.error(`✗ Não achei a cópia "${NOME}" na pasta "${PASTA}" do Drive para desktop.\n  No editor do Apps Script rode instalarCopiaDiariaDireto (1x) e espere o Drive sincronizar,\n  ou passe o caminho: npm run fixtures:atualizar -- "/caminho/arquivo.xlsx"`);
    process.exit(1);
  }
  const quando = fs.statSync(arquivo).mtime;
  console.log(`Usando ${arquivo}\n  (atualizado em ${quando.toLocaleString('pt-BR')})`);
  const r = spawnSync('python3', [path.join(RAIZ, 'tests', 'harness', 'extrair-fixtures.py'), arquivo], { stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    console.error('✗ A extração falhou. Precisa de python3 com openpyxl: pip3 install openpyxl');
    process.exit(1);
  }
  console.log('✓ tests/harness/fixtures.json atualizado.');
}
