// tests/videos.test.js
//
// 26/09/2026: seção Vídeos na página da carteira - apelidos dos ativos vão
// junto na busca, cartões com o ticker citado e os 2 grupos (ativos x tema).
// Vídeos e tickers inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { videosHtml, criarCarregadorVideos, secaoVideosHtml, carregarApelidosPadrao } from '../assets/js/videos.js';

const agora = new Date('2026-09-26T12:00:00Z');
const v = (id, extra) => ({ id: id.padEnd(11, 'x'), canal: 'Canal', titulo: `Vídeo ${id}`, publicado: '2026-09-25T12:00:00Z', ...extra });

test('Vídeos (carteira): grupos "Citam seus ativos" e "Sobre o tema", ticker vira link pra tela do ativo', () => {
  const dom = new JSDOM(`<div id="r">${videosHtml({ ok: true, configurado: true, carteira: 'acoes', videos: [
    v('a1', { ativos: ['TEST3', 'OUTR4'], motivo: 'ativo' }),
    v('t1', { ativos: [], motivo: 'tema' }),
  ] }, agora)}</div>`);
  const d = dom.window.document;
  assert.deepEqual([...d.querySelectorAll('.vd-grupo-titulo')].map((h) => h.textContent), ['Citam seus ativos', 'Sobre o tema da carteira']);
  const links = [...d.querySelectorAll('.vd-grupo')[0].querySelectorAll('a.vd-ativo')];
  assert.deepEqual(links.map((a) => a.textContent), ['TEST3', 'OUTR4']);
  assert.match(links[0].getAttribute('href'), /ativo\/index\.html\?ref=TEST3$/);
  assert.equal(d.querySelectorAll('.vd-grupo')[1].querySelector('.vd-ativos'), null);
});

test('Vídeos: só um tipo -> grade única; tela do ativo não repete o ticker; vazio explica onde ajustar', () => {
  const soTema = videosHtml({ ok: true, configurado: true, carteira: 'fiis', videos: [v('t1', { motivo: 'tema', ativos: [] })] }, agora);
  assert.doesNotMatch(soTema, /vd-grupo/);
  const doAtivo = videosHtml({ ok: true, configurado: true, carteira: null, videos: [v('a1', { motivo: 'ativo', ativos: ['TEST3'] })] }, agora);
  assert.doesNotMatch(doAtivo, /vd-ativo"/);
  assert.match(videosHtml({ ok: true, configurado: true, carteira: 'acoes', videos: [] }, agora), /cita ativos desta carteira[\s\S]*aux_videos-termos/);
  assert.match(videosHtml({ ok: true, configurado: true, videos: [] }, agora), /deste ativo[\s\S]*aux_videos-termos/);
});

test('Vídeos (carteira): busca manda os apelidos dos ativos da carteira; renda fixa não precisa', async () => {
  const pedidos = [];
  const getVideosImpl = async (t, p) => { pedidos.push(p); return { ok: true, configurado: true, carteira: p.carteira, videos: [] }; };
  const dom = new JSDOM(`<body>${secaoVideosHtml('sec')}${secaoVideosHtml('sec2')}</body>`);
  let cb = null;
  dom.window.IntersectionObserver = class { constructor(f) { cb = f; } observe() {} disconnect() {} };
  const carregarApelidosImpl = async (c) => (c === 'acoes' ? { TEST3: ['Teste Energia'] } : {});
  criarCarregadorVideos('tk', { carteira: 'acoes' }, { getVideosImpl, carregarApelidosImpl, agora: () => agora })(dom.window.document.getElementById('sec'));
  cb([{ isIntersecting: true }]);
  await new Promise((r) => setTimeout(r, 0));
  criarCarregadorVideos('tk', { carteira: 'rendaFixa' }, { getVideosImpl, carregarApelidosImpl: () => { throw new Error('não devia'); }, agora: () => agora })(dom.window.document.getElementById('sec2'));
  cb([{ isIntersecting: true }]);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(pedidos, [{ carteira: 'acoes', apelidos: { TEST3: ['Teste Energia'] } }, { carteira: 'rendaFixa' }]);
});

test('Vídeos: carregarApelidosPadrao lê ativos-sobre.json 1x e filtra pela carteira', async () => {
  let chamadas = 0;
  const fetchImpl = async () => { chamadas++; return { ok: true, json: async () => ({ ativos: { TEST3: { classe: 'acoes', apelidos: ['Teste'] }, FUND11: { classe: 'fiis', apelidos: ['Fundo'] }, SEM3: { classe: 'acoes', apelidos: [] } } }) }; };
  assert.deepEqual(await carregarApelidosPadrao('acoes', fetchImpl), { TEST3: ['Teste'] });
  assert.deepEqual(await carregarApelidosPadrao('fiis', fetchImpl), { FUND11: ['Fundo'] });
  assert.equal(chamadas, 1);
});
