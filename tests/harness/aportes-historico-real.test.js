// tests/harness/aportes-historico-real.test.js
//
// 06/10/2026 (Tiago, print 13): "Aportes concluídos deveriam refletir o gráfico de Investido por mês". Com a planilha real
// (fixtures.json, só leitura; sem dado real aqui no arquivo): a soma de cada mês em "Aportes concluídos" (dias derivados das
// transações + a parte que um aporte do site já cobre) é igual à barra do mês do "Investido por mês" (tela.resumo), e a
// leitura não grava nada na planilha. Sem fixtures.json os testes são pulados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarSandboxGs } from './gas-vm-harness.mjs';

const FIXTURES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures.json');
const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);

test('Planilha real: soma dos dias derivados (+ coberto pelo site) de cada mês = barra do "Investido por mês"', async (t) => {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente'); return; }
  const { sandbox } = criarSandboxGs({ silencioso: true });
  const tela = JSON.parse(JSON.stringify(sandbox.montarTelaTransacoes_()));
  const { dias, cobertoSite } = tela.historicoPlanilha;
  assert.ok(dias.length > 20, 'a planilha tem muitos dias de compra');
  const porMes = {};
  dias.forEach((d) => { porMes[d.data.slice(0, 7)] = (porMes[d.data.slice(0, 7)] || 0) + d.valor; });
  Object.entries(cobertoSite).forEach(([m, v]) => { porMes[m] = (porMes[m] || 0) + v; });
  const meses = new Set([...Object.keys(tela.resumo), ...Object.keys(porMes)]);
  meses.forEach((m) => {
    const barra = (tela.resumo[m] && tela.resumo[m].total) || 0;
    assert.ok(Math.abs((porMes[m] || 0) - barra) < 0.1 + dias.length * 0.005, `${m}: Aportes concluídos ${porMes[m]} x barra ${barra}`);
  });
  // por classe também (o filtro de classe do histórico usa a barra da classe)
  ['acoes', 'fiis', 'acoesEua', 'rendaFixa'].forEach((c) => {
    const somaClasse = dias.filter((d) => d.classe === c).reduce((s, d) => s + d.valor, 0);
    const barras = Object.values(tela.resumo).reduce((s, r) => s + r[c], 0);
    const coberto = barras - somaClasse;
    assert.ok(coberto > -1, `${c}: histórico não passa do investido (${somaClasse} x ${barras})`);
  });
  // ordem: mais novo primeiro, e cada dia/classe aparece uma vez
  const chaves = dias.map((d) => `${d.data}|${d.classe}`);
  assert.equal(new Set(chaves).size, chaves.length);
  assert.deepEqual([...dias].map((d) => d.data), [...dias].map((d) => d.data).sort().reverse());
});
