// tests/harness/relatorio-telas.test.js
//
// 23/09/2026 #4 (pedido do Tiago): a cada `npm test`, gera de novo o
// relatório de conferência das telas (tests/harness/relatorio/
// conferencia-telas.html, com data de geração e planilha base no topo) e
// transforma cada checagem dele num teste. Assim o HTML e os testes nunca
// divergem: é a mesma conta. Ver relatorio-telas.mjs.
//
// Sem fixtures.json, tudo aqui é pulado - ver README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gerarRelatorioTelas, FIXTURES_PATH } from './relatorio-telas.mjs';

const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);
const rel = TEM_FIXTURES ? await gerarRelatorioTelas() : null;

if (!rel) {
  test('[RELATÓRIO] conferência das telas', (t) => t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'));
} else {
  test('[RELATÓRIO] HTML gerado agora, com data de geração e planilha base no topo', () => {
    const html = fs.readFileSync(rel.htmlPath, 'utf8');
    assert.ok(fs.statSync(rel.htmlPath).mtimeMs > Date.now() - 10 * 60 * 1000, 'o HTML não foi regravado nesta rodada');
    assert.ok(html.includes(rel.dados.meta.geradoEm), 'data de geração no topo');
    assert.ok(rel.dados.meta.ultimoSyncPrecos && html.includes(rel.dados.meta.ultimoSyncPrecos), 'data dos dados da planilha no topo');
    assert.ok(rel.dados.meta.planilha, 'fixtures.json sem o nome da planilha - extraia de novo com extrair-fixtures.py');
    assert.ok(html.includes(rel.dados.meta.planilha), 'nome da planilha no topo');
  });
  for (const c of rel.dados.checagens) {
    test(`[RELATÓRIO] ${c.grupo} · ${c.nome}`, () => {
      assert.ok(c.ok, `${c.totalErros} problema(s):\n${c.erros.join('\n')}`);
    });
  }
}
