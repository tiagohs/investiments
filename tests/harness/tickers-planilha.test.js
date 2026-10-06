// tests/harness/tickers-planilha.test.js - 06/10/2026: a lista de tickers e a data da 1ª compra saíram do código (Sync.gs):
// vêm da planilha (Auxiliar_ativos = "Meus Ativos"; menor data de "Transações"/"Transações - USA"/"Transações Renda Fixa"), com cache.
// O repositório é público: tudo aqui é inventado. Todos os .gs carregados de verdade em planilha falsa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planilhaFalsa, AbaFalsa, sandboxGas, D, iso, plain, ROOT } from './planilha-falsa.mjs';

const CAB_AUX = ['Classe', 'Ticker', 'Nome', 'Tipo', 'Moeda', 'Preço Atual'];
const cabTx = (n) => Array.from({ length: n }, () => ['']);

function montar({ ativos, agora = new Date(2026, 9, 6, 12, 0, 0) } = {}) {
  const ss = planilhaFalsa({});
  const ctx = sandboxGas(ss, { agora });
  const { sb } = ctx;
  const add = (nome, linhas) => { ss.abas[nome] = new AbaFalsa(nome, linhas); return ss.abas[nome]; };
  add('Auxiliar_ativos', [CAB_AUX, ...(ativos || [
    ['Ações', 'AAAA3', 'A'], ['Ações', 'AAAA3', 'A de novo (repetido)'], ['Ações', 'AAAA7', 'A pref.'], ['FIIs', 'BBBB11', 'B'], ['FIIs', 'bbbc11', 'B2 (minúsculo)'],
    ['Ações EUA', 'CCC', 'C'], ['Ações EUA', 'STR', 'incorporado (TICKERS_FORA_DO_HISTORICO)'], ['Ações', 'DDDD15G', 'direito de subscrição (formato inválido)'], ['Cripto', 'EEEE3', 'classe que não sincroniza'], ['', '', ''],
  ])]);
  return { ss, add, ...ctx };
}

test('Sync.gs não traz mais lista de tickers nem a data da 1ª compra (listas nascem vazias)', () => {
  const sync = fs.readFileSync(`${ROOT}/apps-script/Sync.gs`, 'utf8');
  for (const nome of ['TICKERS_ACOES_BR', 'TICKERS_FIIS_BR', 'TICKERS_BR', 'TICKERS_USA']) assert.match(sync, new RegExp(`^var ${nome} = \\[\\];$`, 'm'), nome);
  assert.ok(!/\b[A-Z]{4}\d{1,2}'/.test(sync.split('\n').filter((l) => /^var TICKERS_/.test(l)).join('\n')), 'nenhum ticker literal nas listas');
  assert.ok(!/new Date\(2020, 11, 22\)/.test(fs.readFileSync(`${ROOT}/apps-script/BackfillIndices.gs`, 'utf8')), 'início do histórico de índices fixo (22/12/2020) saiu');
  const { sb } = montar();
  assert.deepEqual([sb.TICKERS_ACOES_BR.length, sb.TICKERS_FIIS_BR.length, sb.TICKERS_BR.length, sb.TICKERS_USA.length], [0, 0, 0, 0], 'antes de carregar, vazias');
});

test('carregarTickersDaPlanilha_: Auxiliar_ativos -> Ações / FIIs / EUA, sem repetidos, sem formato inválido e sem TICKERS_FORA_DO_HISTORICO', () => {
  const { ss, sb } = montar();
  const refBr = sb.TICKERS_BR; const refUsa = sb.TICKERS_USA;
  const r = plain(sb.carregarTickersDaPlanilha_(ss));
  assert.deepEqual(r, { acoes: ['AAAA3', 'AAAA7'], fiis: ['BBBB11', 'BBBC11'], usa: ['CCC'] });
  assert.deepEqual(plain(sb.TICKERS_ACOES_BR), ['AAAA3', 'AAAA7']);
  assert.deepEqual(plain(sb.TICKERS_FIIS_BR), ['BBBB11', 'BBBC11']);
  assert.deepEqual(plain(sb.TICKERS_BR), ['AAAA3', 'AAAA7', 'BBBB11', 'BBBC11'], 'BR = Ações e depois FIIs (a mesma união de antes)');
  assert.deepEqual(plain(sb.TICKERS_USA), ['CCC']);
  assert.equal(sb.TICKERS_BR, refBr, 'mesmo array (quem guardou a referência enxerga)'); assert.equal(sb.TICKERS_USA, refUsa);
});

test('carregarListasTickersDaPlanilha_ (Planilha.gs) delega, 1x por execução; zerar _listasTickersCarregadas_ força reler e renova o cache', () => {
  const { ss, sb, cache } = montar();
  let leituras = 0;
  const aux = ss.abas.Auxiliar_ativos; const orig = aux.getRange.bind(aux);
  aux.getRange = (...a) => { leituras += 1; return orig(...a); };
  sb.carregarListasTickersDaPlanilha_(ss);
  sb.carregarListasTickersDaPlanilha_(ss);
  assert.equal(leituras, 1, '2 chamadas na mesma execução, 1 leitura');
  assert.ok(cache.get('SYNC_TICKERS_PLANILHA_V1'), 'cache gravado');
  // ativo novo cadastrado (NovoAtivo/Consolidação zeram a flag): aparece na hora, sem esperar o cache vencer
  aux.l.push(['Ações', 'FFFF3', 'novo'].map((v) => ({ v, f: '', r1c1: '' })));
  sb._listasTickersCarregadas_ = false;
  sb.carregarListasTickersDaPlanilha_(ss);
  assert.ok(sb.TICKERS_BR.includes('FFFF3') && sb.TICKERS_ACOES_BR.includes('FFFF3'));
  assert.equal(JSON.parse(cache.get('SYNC_TICKERS_PLANILHA_V1')).acoes.includes('FFFF3'), true, 'cache renovado');
});

test('carregarTickersDaPlanilha_: numa execução NOVA usa o cache (não lê a planilha) até ele vencer', () => {
  const { ss, sb, cache } = montar();
  sb.carregarTickersDaPlanilha_(ss);
  sb._tickersPlanilhaLeituras_ = 0; // execução nova do Apps Script (as globais recomeçam)
  sb.TICKERS_ACOES_BR.length = 0; sb.TICKERS_FIIS_BR.length = 0; sb.TICKERS_BR.length = 0; sb.TICKERS_USA.length = 0;
  let leituras = 0;
  const aux = ss.abas.Auxiliar_ativos; const orig = aux.getRange.bind(aux);
  aux.getRange = (...a) => { leituras += 1; return orig(...a); };
  sb.carregarTickersDaPlanilha_(ss);
  assert.equal(leituras, 0, 'veio do cache');
  assert.deepEqual(plain(sb.TICKERS_BR), ['AAAA3', 'AAAA7', 'BBBB11', 'BBBC11']);
  cache.delete('SYNC_TICKERS_PLANILHA_V1'); sb._tickersPlanilhaLeituras_ = 0;
  sb.carregarTickersDaPlanilha_(ss);
  assert.equal(leituras, 1, 'cache vazio: lê de novo');
});

test('Auxiliar_ativos vazia/ausente: listas vazias e atualizarHistorico explica o motivo em vez de "sucesso" sem nada', () => {
  const { ss, sb, add } = montar({ ativos: [] });
  assert.deepEqual(plain(sb.carregarTickersDaPlanilha_(ss)), { acoes: [], fiis: [], usa: [] });
  add('aux_historico-patrimonio', [['Data', 'Ticker', 'Classe', 'Cotas', 'Preço', 'Valor', 'Câmbio', 'Valor BRL']]);
  sb._listasTickersCarregadas_ = false;
  assert.throws(() => sb.atualizarHistoricoInterno_('Manual', null, null), /Nenhum ativo em "Auxiliar_ativos"/);
  delete ss.abas.Auxiliar_ativos;
  assert.deepEqual(plain(sb.lerTickersAuxiliarAtivos_(ss)), { acoes: [], fiis: [], usa: [] });
});

test('primeiraDataTransacao_: menor data entre Transações, Transações - USA e Transações Renda Fixa (só células de data), com cache', () => {
  const { ss, sb, add, cache } = montar();
  add('Transações', [...cabTx(5), ['Ticker', 'Data Transação'], ['AAAA3', D(sb, '2024-03-10')], ['BBBB11', D(sb, '2024-01-15')], ['', 'texto solto'], ['AAAA3', D(sb, '2025-02-01')]]);
  add('Transações - USA', [...cabTx(5), ['Ticker', 'Data Transação'], ['CCC', D(sb, '2025-06-11')]]);
  add('Transações Renda Fixa', [...cabTx(5), ['Produto', 'Data'], ['Título X', D(sb, '2023-12-20')], ['Título Y', D(sb, '2024-05-02')]]);
  const d = sb.primeiraDataTransacao_(ss);
  assert.equal(iso(d), '2023-12-20');
  assert.ok(cache.get('SYNC_PRIMEIRA_TRANSACAO_V1'), 'cache de 6 h gravado');
  // sem reler: apaga a aba e continua devolvendo o valor em cache
  delete ss.abas['Transações Renda Fixa'];
  assert.equal(iso(sb.primeiraDataTransacao_(ss)), '2023-12-20');
  cache.delete('SYNC_PRIMEIRA_TRANSACAO_V1');
  assert.equal(iso(sb.primeiraDataTransacao_(ss)), '2024-01-15', 'sem a aba de RF, a menor passa a ser a de Transações');
});

test('dataInicioHistoricoIndices_: 1 dia antes da 1ª transação (mesma regra do backfill de preços); sem transação: 5 anos atrás', () => {
  const { ss, sb, add, cache } = montar();
  add('Transações Renda Fixa', [...cabTx(5), ['Produto', 'Data'], ['Título X', D(sb, '2023-12-20')]]);
  assert.equal(iso(sb.dataInicioHistoricoIndices_(ss)), '2023-12-19');
  delete ss.abas['Transações Renda Fixa']; cache.delete('SYNC_PRIMEIRA_TRANSACAO_V1');
  assert.equal(iso(sb.dataInicioHistoricoIndices_(ss)), '2021-10-06', '5 anos antes do "hoje" fixo do teste');
});
