// tests/radar-ranking.test.js - 27/10/2026 (Tiago: "editar o ranking arrastando o item pra cima ou pra baixo... se coloco em
// primeiro, o item é o 1"). assets/js/pages/radar-ranking.js + a alça na tabela + PosicoesEncerradas.gs. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { ordemDoRanking, mover, rankingsDaOrdem, indiceNaAltura } from '../assets/js/pages/radar-ranking.js';
import { renderRadarOportunidades } from '../assets/js/pages/distribuicoes-metas.js';

const it = (ativo, linha, ranking, extra = {}) => ({ linha, ranking, ativo, precoAtual: 10, precoTeto: 12, vies: 'Comprar', percentualDesejado: 0.1, percentualAtual: 0.1, carteiraAtual: 100, ...extra });

test('mover + rankingsDaOrdem: pôr em 1º vira o nº 1 e os outros descem; só o que muda vai pra planilha', () => {
  const lista = ordemDoRanking([it('CCCC3', 44, 3), it('AAAA3', 42, 1), it('BBBB3', 43, 2), it('DDDD3', 45, 4)]);
  assert.deepEqual(lista.map((x) => x.ativo), ['AAAA3', 'BBBB3', 'CCCC3', 'DDDD3']);
  const nova = mover(lista, 2, 0); // CCCC3 pro topo
  assert.deepEqual(nova.map((x) => x.ativo), ['CCCC3', 'AAAA3', 'BBBB3', 'DDDD3']);
  assert.deepEqual(rankingsDaOrdem(nova), [
    { linha: 44, ativo: 'CCCC3', ranking: 1, de: 3 }, { linha: 42, ativo: 'AAAA3', ranking: 2, de: 1 }, { linha: 43, ativo: 'BBBB3', ranking: 3, de: 2 },
  ]);
  assert.deepEqual(rankingsDaOrdem(lista), [], 'mesma ordem: nada a gravar');
});

test('rankingsDaOrdem: ranking com buraco/empate é renumerado 1..N; encerradas ficam depois (N+1...)', () => {
  const ativos = [it('AAAA3', 42, 2), it('BBBB3', 43, 2), it('CCCC3', 44, 7)];
  const enc = [it('ZZZZ3', 46, 1, { encerrada: {} })];
  assert.deepEqual(rankingsDaOrdem(ativos, enc).map((m) => [m.ativo, m.ranking]), [['AAAA3', 1], ['CCCC3', 3], ['ZZZZ3', 4]]);
});

test('indiceNaAltura: onde o item cai ao soltar (considerando que ele saiu da lista)', () => {
  const meios = [10, 30, 50, 70];
  assert.equal(indiceNaAltura(meios, 5, 2), 0);
  assert.equal(indiceNaAltura(meios, 40, 0), 1);
  assert.equal(indiceNaAltura(meios, 999, 0), 3);
  assert.equal(indiceNaAltura(meios, 45, 2), 2, 'soltou no próprio lugar');
});

const radar = () => ({
  acoesNacionais: { itens: [it('BBBB3', 43, 2), it('AAAA3', 42, 1), it('CCCC3', 44, 3)], total: {} },
  acoesInternacionais: { itens: [it('USA1', 59, 1)], total: {} }, fiis: { itens: [], total: {} },
});
const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test('tela: alça no #, seta pra cima sobe o item, redesenha na hora e grava os rankings que mudaram', async () => {
  const doc = new JSDOM('<!doctype html><html><body><div id="c"></div></body></html>').window.document;
  const c = doc.getElementById('c');
  const salvos = [];
  renderRadarOportunidades(doc, c, radar(), { onSalvarRanking: async (tabela, itens) => { salvos.push([tabela, itens]); } });
  const alcas = c.querySelectorAll('.radar-arrastar');
  assert.equal(alcas.length, 3);
  const alcaC = c.querySelector('.radar-arrastar[data-ativo="CCCC3"]');
  alcaC.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  const ordem = [...c.querySelectorAll('.radar-table tbody tr.radar-linha')].map((tr) => tr.querySelector('.link-ativo').textContent);
  assert.deepEqual(ordem, ['AAAA3', 'CCCC3', 'BBBB3']);
  assert.equal(doc.activeElement && doc.activeElement.dataset.ativo, 'CCCC3', 'o foco fica no item movido');
  await espera(800);
  assert.equal(salvos.length, 1);
  assert.equal(salvos[0][0], 'acoesNacionais');
  assert.deepEqual(salvos[0][1].map((x) => [x.ativo, x.ranking]).sort(), [['BBBB3', 3], ['CCCC3', 2]]);
});

test('tela: ordenado por outra coluna não tem alça (a posição na tela não é o ranking); sem gravação, também não', () => {
  const doc = new JSDOM('<!doctype html><html><body><div id="c"></div></body></html>').window.document;
  const c = doc.getElementById('c');
  renderRadarOportunidades(doc, c, radar(), { onSalvarRanking: async () => {} });
  c.querySelector('.radar-th-btn[data-campo="precoAtual"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(c.querySelectorAll('.radar-arrastar').length, 0);
  assert.match(c.querySelector('.radar-momento-nota').textContent, /ordene pela coluna #/);
  const c2 = doc.createElement('div');
  renderRadarOportunidades(doc, c2, radar(), {});
  assert.equal(c2.querySelectorAll('.radar-arrastar').length, 0);
});

test('GS handleSalvarRankingRadar: grava a coluna B, confere todas as linhas antes (tudo ou nada)', () => {
  const celulas = { C42: 'AAAA3', C43: 'BBBB3' };
  const gravadas = [];
  const dm = { getRange: (a1) => ({ getValue: () => celulas[a1] || '', setValue: (v) => gravadas.push([a1, v]) }) };
  const sb = { console, SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => dm }) }, localDistribuicaoMetas_: () => ({ radarAcoes: 42, radarUsa: 59, radarFiis: 82 }), jsonOut: (o) => o };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(new URL('../apps-script/PosicoesEncerradas.gs', import.meta.url), 'utf8')).runInContext(sb);
  assert.equal(sb.handleSalvarRankingRadar({ parameter: { tabela: 'acoesNacionais', itens: JSON.stringify([{ linha: 42, ativo: 'AAAA3', ranking: 2 }, { linha: 43, ativo: 'BBBB3', ranking: 1 }]) } }).ok, true);
  assert.deepEqual(gravadas, [['B42', 2], ['B43', 1]]);
  gravadas.length = 0;
  assert.equal(sb.handleSalvarRankingRadar({ parameter: { tabela: 'acoesNacionais', itens: JSON.stringify([{ linha: 42, ativo: 'AAAA3', ranking: 1.5 }]) } }).ok, false);
  assert.equal(sb.handleSalvarRankingRadar({ parameter: { tabela: 'acoesNacionais', itens: JSON.stringify([{ linha: 42, ativo: 'AAAA3', ranking: 1 }, { linha: 43, ativo: 'XXXX3', ranking: 2 }]) } }).ok, false);
  assert.deepEqual(gravadas, []);
});
