// tests/harness/macro.test.js
//
// 05/10/2026: Macro.gs (action=macro) - contexto de mercado das análises:
// Selic/Focus/IPCA do BCB, CDI 12m da aba aux_historico-indices, taxas do
// Tesouro (CSV do Tesouro Transparente) e os P/L, P/VP da carteira com a foto
// mensal. UrlFetchApp FALSO e planilha falsa; dados INVENTADOS. O resultado
// passa pelo front (criterios/macro.js) pra provar que os dois lados se entendem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';
import { montarMacro, sinaisMacro } from '../../assets/js/criterios/macro.js';

const AGORA = new Date('2026-10-05T15:00:00Z');

const CSV_TESOURO = [
  'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
  'Tesouro IPCA+;15/05/2035;02/10/2026;7,40;7,52;1.950,10;1.940,00;1.945,00',
  'Tesouro IPCA+;15/05/2029;02/10/2026;7,10;7,22;2.700,00;2.690,00;2.695,00',
  'Tesouro Selic;01/03/2032;02/10/2026;0,10;0,12;17.000,00;16.990,00;16.995,00',
  'Tesouro Prefixado;01/01/2029;02/10/2026;13,20;13,32;700,00;695,00;698,00',
  'Tesouro IPCA+;15/05/2035;01/10/2026;7,00;7,10;1.960,00;1.950,00;1.955,00', // dia anterior: ignorado
].join('\n');

function mes(a, m) { return `${a}-${String(m).padStart(2, '0')}`; }

function montar({ urlFetch = null, semCdi = false } = {}) {
  // 300 dias de CDI diário (0,05% ao dia) terminando em 02/10/2026
  const linhasIndices = [['Data', 'Índice', 'Valor']]; // as datas entram depois, criadas DENTRO do vm (instanceof Date do Apps Script)
  const hist = [['Mês', 'Ticker', 'P/L', 'P/VP', 'DY', 'VP/cota', 'Fonte', 'Gravado em']];
  const fotos = (t, pl, pvp) => { for (let i = 1; i <= 14; i++) { const m = 9 - i + 1; const a = m <= 0 ? 2025 : 2026; hist.push([`'${mes(a, m <= 0 ? m + 12 : m)}`, t, pl, pvp, 0.06, '', 'planilha', AGORA]); } };
  ['AAAA3', 'BBBB3', 'CCCC3'].forEach((t) => fotos(t, 11, 1.2));
  ['AAAA11', 'BBBB11', 'CCCC11'].forEach((t) => fotos(t, '', 0.97));
  const ss = planilhaFalsa({
    Auxiliar_ativos: [
      ['Classe', 'Ticker', 'Nome', 'Tipo', 'Moeda', 'Preço Atual', 'Variação dia', 'Quantidade', 'Preço Médio', 'Preço Teto', 'Viés', 'P/VP', 'Desconto P/VP', 'P/L', 'Desconto P/L', 'Setor/Segmento', 'DY (%)'],
      ['Ações', 'AAAA3', 'A', '', 'R$', 10, 0, 100, 9, 12, '', 1.1, '', 9, '', 'X', 0.06],
      ['Ações', 'BBBB3', 'B', '', 'R$', 20, 0, 50, 18, 25, '', 1.3, '', 9, '', 'X', 0.05],
      ['Ações', 'CCCC3', 'C', '', 'R$', 30, 0, 20, 25, 35, '', 1.0, '', '#DIV/0!', '', 'X', 0.04], // P/L quebrado: cai pro fundamentos (nada) -> sem P/L
      ['Ações', 'DDDD3', 'D', '', 'R$', 5, 0, 0, 0, 0, '', 1, '', 7, '', 'X', 0.1], // sem posição: fora
      ['FIIs', 'AAAA11', 'FA', 'Tijolo', 'R$', 90, 0, 10, 80, 100, '', 0.88, '', '', '', 'Log', 0.1],
      ['FIIs', 'BBBB11', 'FB', 'Tijolo', 'R$', 80, 0, 10, 80, 100, '', 0.88, '', '', '', 'Log', 0.1],
      ['FIIs', 'CCCC11', 'FC', 'Papel', 'R$', 100, 0, 10, 100, 100, '', 0.9, '', '', '', 'Log', 0.1],
    ],
    'aux_historico-indices': linhasIndices,
    'aux_fundamentos-historico': hist,
  });
  const chamadas = [];
  const resp = (texto) => ({ getResponseCode: () => 200, getContentText: () => texto });
  const padrao = (url) => {
    chamadas.push(String(url));
    if (/bcdata\.sgs\.432/.test(url)) return resp(JSON.stringify([{ data: '01/10/2026', valor: '13.75' }]));
    if (/bcdata\.sgs\.433/.test(url)) return resp(JSON.stringify(Array.from({ length: 13 }, (_, i) => ({ data: `01/${String(i % 12 + 1).padStart(2, '0')}/2026`, valor: '0.40' }))));
    if (/ExpectativasMercadoInflacao12Meses/.test(url)) return resp(JSON.stringify({ value: [{ Indicador: 'IPCA', Data: '2026-10-02', Mediana: 4.59 }] }));
    if (/ExpectativasMercadoAnuais/.test(url)) return resp(JSON.stringify({ value: [{ Indicador: 'Selic', DataReferencia: '2027', Mediana: 12.0 }] }));
    if (/tesourotransparente/.test(url)) return resp(CSV_TESOURO);
    return { getResponseCode: () => 404, getContentText: () => '' };
  };
  const { sb, cache } = sandboxGas(ss, { urlFetch: urlFetch || padrao, agora: AGORA });
  const datas = [];
  if (!semCdi) for (let i = 300; i >= 0; i--) datas.push([new sb.Date(AGORA.getTime() - (i + 3) * 86400000), 'CDI', 0.05]);
  datas.push([new sb.Date('2026-09-01T12:00:00-03:00'), 'IPCA', 0.4]);
  ss.aba('aux_historico-indices').getRange(2, 1, datas.length, 3).setValues(datas);
  return { sb, ss, chamadas, cache };
}

test('Macro.gs: juros do BCB (Selic, IPCA 12m, Focus) + CDI 12m da aba + Tesouro (só o último dia, IPCA+ e prefixado)', () => {
  const { sb } = montar();
  const m = plain(sb.montarMacro_(sb.SpreadsheetApp.getActiveSpreadsheet(), AGORA, { semCache: true }));
  assert.equal(m.hoje, '2026-10-05');
  assert.equal(m.juros.selic, 0.1375);
  assert.equal(m.juros.ipcaEsperado12m, 0.0459);
  assert.equal(m.juros.selicEsperadaAnoSeguinte, 0.12);
  assert.ok(Math.abs(m.juros.ipca12m - 0.0491) < 0.0002, 'IPCA 12m = 12 meses de 0,40%');
  assert.ok(Math.abs(m.juros.cdi12m - (1.0005 ** 301 - 1)) < 0.001, 'CDI 12m composto dos 301 dias salvos');
  assert.deepEqual(m.tesouro.map((t) => t.nome), ['Tesouro Prefixado 2029', 'Tesouro IPCA+ 2029', 'Tesouro IPCA+ 2035'], 'por vencimento');
  assert.ok(m.tesouro.some((t) => t.nome === 'Tesouro IPCA+ 2035' && t.taxa === 7.4), 'último dia (7,40), não o anterior (7,00)');
  assert.ok(!m.tesouro.some((t) => /Selic/.test(t.nome)), 'Selic não entra (sem prêmio)');
  assert.deepEqual(m.avisos, []);
});

test('Macro.gs: carteira = só ativo com posição; P/L quebrado fica sem P/L; foto mensal dos últimos meses por ticker', () => {
  const { sb } = montar();
  const m = plain(sb.montarMacro_(sb.SpreadsheetApp.getActiveSpreadsheet(), AGORA, { semCache: true }));
  assert.deepEqual(m.carteira.map((x) => x.ticker), ['AAAA3', 'BBBB3', 'CCCC3', 'AAAA11', 'BBBB11', 'CCCC11']);
  const a = m.carteira[0];
  assert.deepEqual([a.classe, a.valor, a.pl, a.pvp], ['acoes', 1000, 9, 1.1]);
  assert.equal(m.carteira[2].pl, null, '#DIV/0! descartado');
  assert.equal(a.historico.pl.length, 14);
  assert.deepEqual(a.historico.pl[13], ['2026-09', 11]);
  assert.deepEqual(m.carteira[3].historico.pl, [], 'FII não tem P/L');
  assert.equal(m.carteira[3].historico.pvp.length, 14);
});

test('Macro.gs + front: o JSON do Apps Script vira contexto (juro real muito alto, NTN-B alta, FIIs baratos, ações com P/L abaixo da média)', () => {
  const { sb } = montar();
  const resposta = JSON.parse(JSON.stringify({ ok: true, macro: sb.montarMacro_(sb.SpreadsheetApp.getActiveSpreadsheet(), AGORA, { semCache: true }) }));
  const ctx = montarMacro(resposta);
  assert.equal(ctx.juros.nivel, 'muito-alto');
  assert.equal(ctx.ntnb.nivel, 'alto');
  assert.equal(ctx.bolsa.fiis.nivel, 'barato');
  // P/L: AAAA3 e BBBB3 em 9 (CCCC3 sem P/L: cobertura = 1500/2600 -> 57% < 60%) => sem termômetro de ações
  assert.equal(ctx.bolsa.acoes, undefined, 'cobertura insuficiente: não opina');
  assert.ok(sinaisMacro(ctx, 'fiis').some((x) => /mercado barato no geral/.test(x.texto)));
});

test('Macro.gs: cache de 6h (2ª chamada não busca de novo) e "atualizar" ignora o cache', () => {
  const { sb, chamadas } = montar();
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  sb.montarMacro_(ss, AGORA, {});
  const n = chamadas.length;
  assert.ok(n >= 4);
  sb.montarMacro_(ss, AGORA, {});
  assert.equal(chamadas.length, n, 'veio do cache');
  sb.montarMacro_(ss, AGORA, { semCache: true });
  assert.ok(chamadas.length > n, 'atualizar busca de novo');
});

test('Macro.gs: BCB e Tesouro fora do ar = avisos, nunca erro; Selic cai pro CDI/Selic salvos; sem CDI suficiente também vira aviso', () => {
  const { sb } = montar({ urlFetch: () => { throw new Error('DNS'); }, semCdi: true });
  const m = plain(sb.montarMacro_(sb.SpreadsheetApp.getActiveSpreadsheet(), AGORA, { semCache: true }));
  assert.equal(m.juros.selic, null);
  assert.equal(m.juros.cdi12m, null);
  assert.deepEqual(m.tesouro, []);
  assert.ok(m.avisos.some((a) => /Selic meta indisponível/.test(a)));
  assert.ok(m.avisos.some((a) => /CDI 12m indisponível/.test(a)));
  assert.ok(m.avisos.some((a) => /Taxas do Tesouro indisponíveis/.test(a)));
  assert.ok(m.avisos.some((a) => /Focus/.test(a)));
  assert.equal(m.carteira.length, 6, 'a carteira (da planilha) segue');
  assert.equal(montarMacro({ ok: true, macro: { ...m, carteira: [] } }), null, 'sem juros, sem Tesouro e sem carteira o front não tem contexto');
});

test('Macro.gs: handleMacro exige autenticação e devolve { ok, macro }', () => {
  const { sb } = montar();
  assert.equal(sb.handleMacro({ parameter: {} }, { ok: false, erro: 'sem token' }).ok, false);
  const r = sb.handleMacro({ parameter: { atualizar: '1' } }, { ok: true });
  assert.equal(r.ok, true);
  assert.equal(r.macro.juros.selic, 0.1375);
});
