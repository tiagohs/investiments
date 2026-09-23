// tests/harness/proventos-usa.test.js
//
// 23/09/2026 #6: a aba "Proventos - USA" está em DÓLAR (igual "Transações -
// USA"). Antes FluxoCaixaInicio.gs somava o valor como se fosse real - nunca
// apareceu porque a aba estava vazia, até o Tiago colar os dividendos da
// IBKR. Este teste injeta um provento FICTÍCIO de US$ 10 nas fixtures reais
// (num dia que tem câmbio no histórico) e confere que:
//   - o fluxo de Ações EUA (e do Total/Longo Prazo) daquele dia cai
//     exatamente US$ 10 × câmbio do dia, nunca R$ 10;
//   - Nacional, Ações, FIIs e Renda Fixa não mudam;
//   - o Valor aplicado não muda (provento nunca entra nele);
//   - o "desde o início" de Ações EUA sobe exatamente esse valor em reais.
// Sem fixtures.json, pula.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { carregarTodasAsTelasComDadosReais, relogioNoFusoParaUtcMs_, FUSO_PLANILHA_XLSX } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
const fmtSp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const chaveSp = (cel) => {
  const m = cel.__date__.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  return fmtSp.format(new Date(relogioNoFusoParaUtcMs_(FUSO_PLANILHA_XLSX, +m[1], +m[2], +m[3], +m[4], +m[5], +m[6])));
};

test('Proventos - USA: provento em US$ entra convertido pelo câmbio do dia (Ações EUA, Total e Longo Prazo), sem mexer em Nacional, Valor aplicado nem nas outras classes', async (t) => {
  if (!fs.existsSync(FIXTURES_PATH)) { t.skip('tests/harness/fixtures.json ausente'); return; }
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  // dia com câmbio conhecido: última linha USA do histórico de preços
  let dia = null, cambio = null;
  for (const l of fixtures['aux_historico-patrimonio'].linhas.slice(1)) {
    if (l[2] === 'USA' && l[0] && l[0].__date__ && typeof l[6] === 'number') { const k = chaveSp(l[0]); if (!dia || k >= dia) { dia = k; cambio = l[6]; } }
  }
  assert.ok(dia && cambio > 1, 'sem câmbio USA nas fixtures');
  const USD = 10;
  const aba = fixtures['Proventos - USA'];
  aba.linhas.push([null, { __date__: `${dia}T00:00:00` }, 'TESTE', 'Dividendo', 1, USD, USD, null, null, null, null, null, null]);
  aba.lastRow = aba.linhas.length;
  const tmp = path.join(os.tmpdir(), `fixtures-proventos-usa-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(fixtures));
  try {
    const [base, com] = await Promise.all([
      carregarTodasAsTelasComDadosReais({ fixturesPath: FIXTURES_PATH }),
      carregarTodasAsTelasComDadosReais({ fixturesPath: tmp }),
    ]);
    const pb = base.home.historico.find((x) => x.data === dia);
    const pc = com.home.historico.find((x) => x.data === dia);
    assert.ok(pb && pc, `dia ${dia} fora da série`);
    const esperado = -USD * cambio;
    const d = (campo) => (pc[campo] || 0) - (pb[campo] || 0);
    t.diagnostic(`dia ${dia}, câmbio ${cambio}: fluxo EUA ${d('fluxoCaixaAcoesEua').toFixed(4)} (esperado ${esperado.toFixed(4)})`);
    for (const campo of ['fluxoCaixaAcoesEua', 'fluxoCaixaPatrimonio', 'fluxoCaixaLongoPrazo']) {
      assert.ok(Math.abs(d(campo) - esperado) < 0.02, `${campo}: mudou ${d(campo)}, esperado ${esperado} (US$ ${USD} × ${cambio})`);
    }
    for (const campo of ['fluxoCaixaNacional', 'fluxoCaixaAcoes', 'fluxoCaixaFiis', 'fluxoCaixaRendaFixaTotal', 'fluxoAplicadoAcoesEua', 'fluxoAplicadoPatrimonio', 'acoesEua', 'patrimonio']) {
      assert.ok(Math.abs(d(campo)) < 0.005, `${campo} não podia mudar (mudou ${d(campo)})`);
    }
    const inicio = await import(pathToFileURL(path.join(ROOT, 'assets/js/pages/inicio.js')).href);
    const g = (r) => inicio.calcularResumoRentabilidade(r.home.patrimonio, r.home.historico, { visaoId: 'carteiraAcoesEua', periodoId: 'tudo' }).ganhoReais;
    assert.ok(Math.abs(g(com) - g(base) - USD * cambio) < 0.01, `"desde o início" de Ações EUA subiu ${g(com) - g(base)}, esperado ${USD * cambio}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});
