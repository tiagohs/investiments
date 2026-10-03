// tests/canais-youtube.test.js - 02/10/2026: canal oficial no YouTube por
// ativo (assets/js/canais-youtube.js) - lista pública de canais (Tiago:
// "Canais do YouTube por ativo mostrados na página; a busca de vídeos tem que
// considerar os canais"). Só links de canais; nenhum número aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANAIS_YOUTUBE, CANAL_TESOURO_DIRETO, canalDoAtivo, ehTituloTesouro, familiaTesouro, parametrosCanalVideos,
} from '../assets/js/canais-youtube.js';

// a lista que o Tiago mandou (ticker -> link)
const LISTA = {
  WIZC3: 'https://www.youtube.com/@wizco.', VAMO3: 'https://www.youtube.com/channel/UCAjWofuI6Pi5gTpL_AHOYYQ',
  BBSE3: 'https://www.youtube.com/bbseguros', B3SA3: 'https://www.youtube.com/user/bmfbovespa', BBAS3: 'https://www.youtube.com/user/bancodobrasil',
  SEER3: 'https://www.youtube.com/c/GrupoSerEducacional_0', VALE3: 'https://www.youtube.com/user/Vale', PETR4: 'https://www.youtube.com/petrobras',
  AXIA7: 'https://www.youtube.com/@axiaenergia', TUPY3: 'https://www.youtube.com/@TupySA', AGRO3: 'https://www.youtube.com/c/BrasilAgro_Oficial',
  EGIE3: 'https://www.youtube.com/@ENGIEBrasil', PMLL11: 'https://www.youtube.com/@patriainvestments', BTLG11: 'https://www.youtube.com/@btgpactualassetmanagement',
  TRXF11: 'https://www.youtube.com/@trxinvestimentos2945', XPML11: 'https://www.youtube.com/@XP_Oficial', HGRU11: 'https://www.youtube.com/@patriainvestments',
  RBRY11: 'https://www.youtube.com/c/RBRAssetManagement', KNUQ11: 'https://www.youtube.com/@KineaInvestimentos', PAM: 'https://www.youtube.com/@PampaEnergia',
  CHTR: 'https://www.youtube.com/chartercommunications', PROSY: 'https://www.youtube.com/channel/UC4Yj3qrCYB7On4T58f2BEDQ', EWBC: 'https://www.youtube.com/@eastwestbancorp',
};

test('canais: cada ticker da lista do Tiago aponta pro link dele, com nome, @handle e ID UC... válidos', () => {
  for (const [ticker, url] of Object.entries(LISTA)) {
    const c = canalDoAtivo({ ticker, classe: 'acoes' });
    assert.ok(c, ticker);
    assert.equal(c.url, url, ticker);
    assert.match(c.channelId, /^UC[\w-]{22}$/, ticker);
    assert.match(c.handle, /^@[\w.-]+$/, ticker);
    assert.ok(c.nome, ticker);
  }
  // todo canal da lista tem link https://www.youtube.com/ (é o que o bloco "Canal oficial" aceita)
  Object.values(CANAIS_YOUTUBE).forEach((c) => assert.match(c.url, /^https:\/\/www\.youtube\.com\//));
});

test('canais: @wizco. (com ponto) é o canal da Wiz Co; mesma gestora = mesmo canal; minúsculas e espaços', () => {
  assert.equal(canalDoAtivo({ ticker: 'WIZC3' }).handle, '@wizco.');
  assert.equal(canalDoAtivo({ ticker: ' pmll11 ' }), canalDoAtivo({ ticker: 'HGRU11' }));
  assert.equal(canalDoAtivo({ ticker: 'AXIA3' }).channelId, canalDoAtivo({ ticker: 'AXIA7' }).channelId);
  assert.equal(canalDoAtivo({ ticker: 'SEMCANAL3' }), null);
  assert.equal(canalDoAtivo({ ticker: '' }), null);
  assert.equal(canalDoAtivo({ ticker: 'constructor' }), null, 'nada de propriedade herdada');
});

test('canais: gestora/corretora só traz os vídeos que citam o fundo; empresa traz todos', () => {
  for (const t of ['PMLL11', 'HGRU11', 'BTLG11', 'TRXF11', 'XPML11', 'RBRY11', 'KNUQ11']) assert.equal(canalDoAtivo({ ticker: t }).soQueCitam, true, t);
  for (const t of ['PETR4', 'VALE3', 'WIZC3', 'CHTR']) assert.ok(!canalDoAtivo({ ticker: t }).soQueCitam, t);
  assert.deepEqual(parametrosCanalVideos(canalDoAtivo({ ticker: 'PETR4' })), { canal: 'UC4_m_Lx5ngLtVq8eOXPdF_w' });
  assert.deepEqual(parametrosCanalVideos(canalDoAtivo({ ticker: 'XPML11' })), { canal: 'UCf15n72n6pV0RK6-GOi1s1Q', canalModo: 'citam' });
  assert.deepEqual(parametrosCanalVideos({ url: 'https://www.youtube.com/@novo' }), { canal: 'https://www.youtube.com/@novo' }, 'sem ID: manda o link (o servidor resolve)');
  assert.deepEqual(parametrosCanalVideos(null), {});
});

test('canais: renda fixa - só título do Tesouro tem canal (Tesouro Direto); família do título pra busca', () => {
  assert.equal(canalDoAtivo({ ticker: 'Tesouro Selic 2029', ehRf: true }), CANAL_TESOURO_DIRETO);
  assert.equal(canalDoAtivo({ ticker: 'Meu título', classe: 'rendaFixa', ativo: { tipoInvestimento: 'Tesouro IPCA+' } }), CANAL_TESOURO_DIRETO);
  assert.equal(canalDoAtivo({ ticker: 'CDB Banco X 2027', ehRf: true, ativo: { tipoInvestimento: 'CDB', instituicao: 'Banco X' } }), null);
  assert.equal(canalDoAtivo({ ticker: 'PETR4', ehRf: true }), null, 'renda fixa nunca usa a lista de ações');
  assert.equal(ehTituloTesouro({ ticker: 'Tesouraria' }), false);
  assert.equal(familiaTesouro('Tesouro IPCA+ com Juros Semestrais 2045'), 'Tesouro IPCA+');
  assert.equal(familiaTesouro('Tesouro Selic 2029'), 'Tesouro Selic');
  assert.equal(familiaTesouro('TESOURO PREFIXADO 2031'), 'Tesouro Prefixado');
  assert.equal(familiaTesouro('Tesouro Renda+ 2065'), 'Tesouro Renda+');
  assert.equal(familiaTesouro('CDB'), '');
  assert.match(CANAL_TESOURO_DIRETO.url, /@TesouroDiretoOficial$/);
});
