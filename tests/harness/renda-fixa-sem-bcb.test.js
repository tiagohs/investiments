// 04/10/2026 (Tiago): "Não deu pra carregar Renda Fixa agora (carteirasRendaFixa): Exception: Erro de DNS:
// https://api.bcb.gov.br/..." - o IPCA 12m é só benchmark: com o BCB fora do ar a tela tem que abrir,
// usando o IPCA mensal já salvo na aba aux_historico-indices (ou o último valor bom guardado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarSandboxPrevia } from './previa.mjs';

const temFixtures = fs.existsSync(new URL('./fixtures.json', import.meta.url));

test('Renda Fixa abre com o BCB fora do ar (erro de DNS): IPCA 12m vem da aba / cache', { skip: !temFixtures && 'sem fixtures.json' }, () => {
  const sb = montarSandboxPrevia();
  sb.UrlFetchApp = { fetch() { throw new Error('Exception: Erro de DNS: https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/13?formato=json'); } };
  const props = {};
  sb.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) };
  sb.CacheService = { getScriptCache: () => ({ get: () => null, put() {} }) };
  const r = sb.montarCarteirasRendaFixa_();
  assert.ok(r && Array.isArray(r.ativos) && r.ativos.length > 0, 'a carteira monta');
  const ipca = r.benchmarks.ipca;
  assert.ok(typeof ipca === 'number' && ipca > 0 && ipca < 0.3, `IPCA 12m plausível pela aba: ${ipca}`);
  assert.equal(Number(props.benchmark_ipca12m), ipca, 'guarda o último valor bom');

  // nem a aba nem a API: usa o último valor bom guardado
  sb.ipca12MesesDaAba_ = () => null;
  assert.equal(sb.buscarIpcaAcumulado12Meses_(), ipca);
});

test('IPCA 12m: acumula os 12 últimos meses (fração) e exige 12 meses', () => {
  const sb = montarSandboxPrevia();
  assert.equal(sb.ipca12MesesDeValores_(Array(13).fill(0.5)), Math.round((1.005 ** 12 - 1) * 10000) / 10000);
  assert.equal(sb.ipca12MesesDeValores_([0.5, 0.4]), null);
});
