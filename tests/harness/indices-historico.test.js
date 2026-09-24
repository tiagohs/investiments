// tests/harness/indices-historico.test.js
//
// 23/09/2026 #8 (Tiago: "veja como está gravado os históricos de índices e
// veja se tá tudo certo ... veja o ipca, ibovespa, etc"). Prova, com a
// planilha real, que cada índice da série do app (home.historico) é
// EXATAMENTE o que está gravado em aux_historico-indices:
//  - Ibovespa / IFIX / S&P 500: valor do dia (ou o último pregão antes
//    dele) - só o último ponto (hoje) pode vir da cotação ao vivo;
//  - CDI / Selic: o fator de cada dia é 1 + a taxa DAQUELE dia (sem +1 dia
//    de fuso) e o índice fica parado em dia sem taxa;
//  - IPCA: o mês fecha com a taxa gravada do mês, espalhada pro rata pelos
//    dias do próprio mês (não mais de uma vez no dia 1º).
// Sem fixtures.json, tudo aqui é pulado - ver README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { carregarTodasAsTelasComDadosReais, relogioNoFusoParaUtcMs_, FUSO_PLANILHA_XLSX, FUSO_PROJETO_APPS_SCRIPT } from './gas-vm-harness.mjs';
import { FIXTURES_PATH } from './relatorio-telas.mjs';

const TEM = fs.existsSync(FIXTURES_PATH);
let _d = null;
async function dados() {
  if (_d) return _d;
  const fx = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  const r = await carregarTodasAsTelasComDadosReais();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_PROJETO_APPS_SCRIPT, year: 'numeric', month: '2-digit', day: '2-digit' });
  const bruto = {};
  for (const l of (fx['aux_historico-indices']?.linhas || []).slice(1)) {
    const iso = l[0] && l[0].__date__;
    if (!iso || typeof l[2] !== 'number') continue;
    const [y, mo, d, h, mi, s] = iso.match(/^(\d+)-(\d+)-(\d+)T(\d+):(\d+):(\d+)/).slice(1).map(Number);
    const dia = fmt.format(new Date(relogioNoFusoParaUtcMs_(FUSO_PLANILHA_XLSX, y, mo, d, h, mi, s)));
    (bruto[l[1]] ??= {})[dia] = l[2];
  }
  _d = { serie: JSON.parse(JSON.stringify(r.home.historico)), bruto, rf: JSON.parse(JSON.stringify(r.carteirasRendaFixa)) };
  return _d;
}
const pular = (t) => { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); };

for (const [campo, nome] of [['ibovespa', 'Ibovespa'], ['ifix', 'IFIX'], ['sp500', 'S&P 500']]) {
  test(`índices: ${nome} da série = aux_historico-indices (último pregão até o dia)`, async (t) => {
    if (!TEM) return pular(t);
    const { serie, bruto } = await dados();
    assert.ok(bruto[nome] && Object.keys(bruto[nome]).length > 100, `${nome} sem histórico na aba`);
    const erros = [];
    let ultimo = null;
    serie.slice(0, -1).forEach((p) => { // o último ponto (hoje) usa a cotação ao vivo
      if (bruto[nome][p.data] != null) ultimo = bruto[nome][p.data];
      if (ultimo != null && p[campo] !== ultimo) erros.push(`${p.data}: série ${p[campo]}, aba ${ultimo}`);
    });
    assert.deepEqual(erros.slice(0, 5), []);
  });
}

for (const [campo, nome] of [['indiceCdi', 'CDI'], ['indiceSelic', 'SELIC']]) {
  test(`índices: ${nome} - fator de cada dia = 1 + taxa DO MESMO dia; parado em dia sem taxa`, async (t) => {
    if (!TEM) return pular(t);
    const { serie, bruto } = await dados();
    const erros = [];
    for (let i = 1; i < serie.length; i += 1) {
      const taxa = bruto[nome][serie[i].data];
      const esperado = taxa != null ? 1 + taxa / 100 : 1;
      const fator = serie[i][campo] / serie[i - 1][campo];
      if (Math.abs(fator - esperado) > 2e-6) erros.push(`${serie[i].data}: fator ${fator}, taxa do dia ${taxa ?? '(nenhuma)'}`);
    }
    assert.deepEqual(erros.slice(0, 5), []);
  });
}

test('índices: IPCA - cada mês fecha com a taxa gravada, pro rata pelos dias do próprio mês', async (t) => {
  if (!TEM) return pular(t);
  const { serie, bruto } = await dados();
  const porMes = {};
  for (const [dia, taxa] of Object.entries(bruto.IPCA || {})) {
    assert.equal(dia.slice(8), '01', `IPCA gravado fora do dia 1º: ${dia}`);
    porMes[dia.slice(0, 7)] = taxa;
  }
  const idx = Object.fromEntries(serie.map((p) => [p.data, p.indiceIpca]));
  const erros = [];
  let mesesConferidos = 0;
  for (const [mes, taxa] of Object.entries(porMes)) {
    const [y, m] = mes.split('-').map(Number);
    const fimAnterior = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (idx[fimAnterior] == null || idx[fim] == null) continue; // mês fora (ou incompleto) da série
    mesesConferidos += 1;
    const acumulado = (idx[fim] / idx[fimAnterior] - 1) * 100;
    if (Math.abs(acumulado - taxa) > 0.001) erros.push(`${mes}: série ${acumulado.toFixed(4)}%, aba ${taxa}%`);
    const meio = `${mes}-15`, vespera = `${mes}-14`;
    const esperadoDia = Math.pow(1 + taxa / 100, 1 / new Date(Date.UTC(y, m, 0)).getUTCDate());
    if (Math.abs(idx[meio] / idx[vespera] - esperadoDia) > 2e-6) erros.push(`${mes}: dia 15 não andou pro rata (${idx[meio] / idx[vespera]} vs ${esperadoDia})`);
  }
  assert.ok(mesesConferidos >= 12, `só ${mesesConferidos} meses de IPCA conferidos`);
  assert.deepEqual(erros.slice(0, 5), []);
});

test('índices: Ibovespa/IFIX/S&P 500 da aba sem buraco de mais de 6 dias nem salto de mais de 15% num pregão', async (t) => {
  if (!TEM) return pular(t);
  const { bruto } = await dados();
  const erros = [];
  for (const nome of ['Ibovespa', 'IFIX', 'S&P 500']) {
    const pts = Object.entries(bruto[nome]).sort(([a], [b]) => (a < b ? -1 : 1));
    for (let i = 1; i < pts.length; i += 1) {
      const dias = (Date.parse(pts[i][0]) - Date.parse(pts[i - 1][0])) / 864e5;
      if (dias > 6) erros.push(`${nome}: nada entre ${pts[i - 1][0]} e ${pts[i][0]}`);
      const v = pts[i][1] / pts[i - 1][1] - 1;
      if (Math.abs(v) > 0.15) erros.push(`${nome}: ${pts[i][0]} ${(v * 100).toFixed(1)}% num pregão`);
    }
  }
  assert.deepEqual(erros, []);
});

test('índices: "IPCA (12m)" da Renda Fixa = os 12 últimos IPCAs mensais acumulados (a API do BCB, no harness, devolve os da aba)', async (t) => {
  if (!TEM) return pular(t);
  const { bruto, rf } = await dados();
  const meses = Object.entries(bruto.IPCA).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-12);
  const esperado = meses.reduce((f, [, v]) => f * (1 + v / 100), 1) - 1;
  assert.equal(meses.length, 12);
  assert.ok(Math.abs(rf.benchmarks.ipca - Math.round(esperado * 10000) / 10000) < 1e-9, `tela ${rf.benchmarks.ipca} x ${esperado}`);
});
