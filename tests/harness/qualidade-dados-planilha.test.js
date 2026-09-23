// tests/harness/qualidade-dados-planilha.test.js
//
// 23/09/2026 - testes de QUALIDADE DOS DADOS DA PLANILHA (não do código).
// Separados de propósito de telas-heroes-graficos.test.js: aqueles provam
// que o app calcula e mostra certo; estes apontam lançamento faltando ou
// com data errada na planilha - coisas que só o Tiago pode corrigir (o app
// já se protege de cada uma delas, mas o número fica mais exato quando o
// dado está certo). Cada falha diz exatamente o que corrigir e onde.
//
// 23/09/2026 #4: a lógica de cada checagem mora em qualidade-dados.mjs
// (também usada pelo relatório de conferência das telas) - aqui é um
// teste por checagem, todos com o prefixo [DADO DA PLANILHA] (o
// verificar.mjs usa esse prefixo pra separar "alerta de dado" de "bug no
// código").
//
// Sem fixtures.json, tudo aqui é pulado (t.skip) - ver README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarTodasAsTelasComDadosReais } from './gas-vm-harness.mjs';
import { CHECAGENS_QUALIDADE } from './qualidade-dados.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);
let _dados = null;
async function dados() {
  if (!_dados) _dados = await carregarTodasAsTelasComDadosReais({ fixturesPath: FIXTURES_PATH });
  return _dados;
}

for (const c of CHECAGENS_QUALIDADE) {
  test(`[DADO DA PLANILHA] ${c.titulo}`, async (t) => {
    if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
    assert.deepEqual(c.rodar(await dados()), []);
  });
}
