// tests/verificar-projeto-gs.test.js
//
// 07/10/2026: apps-script/VerificarProjeto.gs (gerado por scripts/gerar-verificacao-gs.mjs) tem a impressão digital de cada
// função do repositório; no editor do Apps Script, verificarProjetoDireto() aponta arquivo desatualizado ou cópia antiga
// sobrando em outro arquivo (o caso real: uma cópia velha do HistoricoInicio dentro do arquivo "HistoricoAtivo").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { mapaDoRepositorio, gerarCodigo, ARQUIVO_SAIDA } from '../scripts/gerar-verificacao-gs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS = path.resolve(__dirname, '..', 'apps-script');

function projeto(extras = []) {
  const sb = { Logger: { log() {} } };
  vm.createContext(sb);
  const arquivos = fs.readdirSync(GAS).filter((f) => f.endsWith('.gs')).sort();
  for (const f of arquivos) new vm.Script(fs.readFileSync(path.join(GAS, f), 'utf8'), { filename: f }).runInContext(sb);
  for (const [nome, codigo] of extras) new vm.Script(codigo, { filename: nome }).runInContext(sb);
  return sb;
}

test(`${ARQUIVO_SAIDA} está em dia com os .gs (rode node scripts/gerar-verificacao-gs.mjs depois de mudar um .gs)`, () => {
  assert.equal(fs.readFileSync(path.join(GAS, ARQUIVO_SAIDA), 'utf8'), gerarCodigo(mapaDoRepositorio()));
});

test('verificarProjetoDireto: projeto igual ao repositório não acusa nada', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(projeto().verificarProjetoDireto())), []);
});

test('verificarProjetoDireto: cópia antiga de uma função em outro arquivo (carregada depois) e arquivo que falta aparecem', () => {
  const velha = "function montarChaveCacheSerie_(a, b, c, d) { return 'historico_serie_v13_' + a; }";
  const sb = projeto([['HistoricoAtivo.gs', velha]]);
  delete sb.handleHistoricoAtivo; // como se o HistoricoAtivo de verdade tivesse sido sobrescrito
  const problemas = JSON.parse(JSON.stringify(sb.verificarProjetoDireto()));
  assert.ok(problemas.some((p) => /^HistoricoInicio\.gs: .*DIFERENTES 1 \(montarChaveCacheSerie_\)/.test(p)), problemas.join('\n'));
  assert.ok(problemas.some((p) => /^HistoricoAtivo\.gs: FALTAM 1 \(handleHistoricoAtivo\)/.test(p)), problemas.join('\n'));
});
