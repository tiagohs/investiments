// tests/videos.test.js
//
// 26/09/2026: seção Vídeos na página da carteira - apelidos dos ativos vão
// junto na busca, cartões com o ticker citado e os 2 grupos (ativos x tema).
// Vídeos e tickers inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { videosHtml, criarCarregadorVideos, secaoVideosHtml, carregarApelidosPadrao, canalOficialHtml, ligarPlayerVideos, paginasVisiveis } from '../assets/js/videos.js';

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

// 02/10/2026: canal oficial do ativo (canais-youtube.js) na seção Vídeos
test('Vídeos (canal oficial): bloco no topo da seção só com link do YouTube; etiqueta nos vídeos do oficial; vazio cita o canal', () => {
  const canal = { nome: 'Empresa <Teste>', handle: '@empresa.teste', url: 'https://www.youtube.com/@empresa.teste' };
  const dom = new JSDOM(`<body>${secaoVideosHtml('sec', { canal })}</body>`);
  const a = dom.window.document.querySelector('#sec .vd-topo a.vd-canal-oficial');
  assert.equal(a.getAttribute('href'), 'https://www.youtube.com/@empresa.teste');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.querySelector('.vd-canal-nome').textContent.trim(), 'Empresa <Teste> @empresa.teste', 'texto escapado');
  assert.equal(canalOficialHtml({ ...canal, url: 'javascript:alert(1)' }), '');
  assert.equal(canalOficialHtml({ ...canal, url: 'https://exemplo.test/@x' }), '');
  assert.equal(canalOficialHtml(null), '');
  assert.doesNotMatch(secaoVideosHtml('s2'), /vd-canal-oficial/, 'carteira/ativo sem canal: igual antes');

  const html = videosHtml({ ok: true, configurado: true, videos: [v('of1', { oficial: true }), v('m1')] }, agora);
  const d = new JSDOM(`<div>${html}</div>`).window.document;
  assert.deepEqual([...d.querySelectorAll('.vd-card')].map((c) => !!c.querySelector('.vd-oficial')), [true, false]);
  assert.match(videosHtml({ ok: true, configurado: true, canalOficial: { nome: 'X' }, videos: [] }, agora), /nem do canal oficial/);
  assert.match(videosHtml({ ok: true, configurado: false, videos: [] }, agora), /Nenhum canal cadastrado/);
});

test('Vídeos (05/10/2026): canal sem vídeos (404/lista vazia) mostra "sem vídeos disponíveis" por canal, sem tratar como erro', () => {
  const dom = new JSDOM(`<div id="r">${videosHtml({
    ok: true, configurado: true, videos: [v('a1', { motivo: 'ativo' })],
    canalOficial: { id: 'UCxxxxxxxxxxxxxxxxxxxxxx', nome: 'Gestora Teste', recentes: 0, semVideos: true },
    canaisSemVideos: ['@canalvazio'],
  }, agora)}</div>`);
  const t = dom.window.document.querySelector('.vd-sem-videos').textContent;
  assert.match(t, /Canal oficial \(Gestora Teste\): sem vídeos disponíveis/);
  assert.match(t, /@canalvazio: sem vídeos disponíveis/);
  assert.equal(dom.window.document.querySelectorAll('.vd-card').length, 1, 'os vídeos dos outros canais seguem aparecendo');
  const ok = new JSDOM(`<div>${videosHtml({ ok: true, configurado: true, videos: [v('a1')] }, agora)}</div>`);
  assert.equal(ok.window.document.querySelector('.vd-sem-videos'), null);
  const erro = new JSDOM(`<div>${videosHtml({ ok: false, erro: 'x' }, agora)}</div>`);
  assert.equal(erro.window.document.querySelector('.vd-sem-videos'), null);
});

// 06/10/2026 (Tiago: "exibe de 3 em 3, com paginação, carregando aos poucos, e eu conseguir ver a lista inteira")
test('Vídeos: 3 por página, só a página atual entra no DOM (miniaturas lazy, sem iframe) e o paginador navega a lista inteira', () => {
  const videos = Array.from({ length: 8 }, (_, i) => v(`p${i}`, { motivo: 'ativo', ativos: [] }));
  const dom = new JSDOM('<body>' + secaoVideosHtml('sec') + '</body>');
  const d = dom.window.document;
  const alvo = d.querySelector('.vd-conteudo');
  const resposta = { ok: true, configurado: true, videos };
  alvo._vdResposta = resposta; alvo._vdAgora = agora;
  alvo.innerHTML = videosHtml(resposta, agora);
  ligarPlayerVideos(d.getElementById('sec'));
  assert.equal(alvo.querySelectorAll('.vd-card').length, 3, 'só 3 cartões na 1ª página');
  assert.equal(alvo.querySelectorAll('iframe').length, 0, 'nenhum iframe montado');
  assert.ok([...alvo.querySelectorAll('.vd-thumb img')].every((i) => i.getAttribute('loading') === 'lazy'));
  assert.equal(alvo.querySelector('.vd-pag-info').textContent, '1–3 de 8');
  assert.equal(alvo.querySelectorAll('.vd-pag[data-pagina]:not(.vd-pag-nav)').length, 3, '3 páginas numeradas (8 vídeos)');
  assert.ok(alvo.querySelector('.vd-pag-nav[data-pagina="-1"]').disabled);
  const todos = new Set();
  for (let p = 0; p < 3; p += 1) {
    alvo.querySelectorAll('.vd-thumb[data-video]').forEach((b) => todos.add(b.dataset.video));
    const prox = alvo.querySelector('.vd-pag-mais');
    if (!prox.disabled) prox.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  }
  assert.equal(todos.size, 8, 'navegando, a lista inteira é alcançável');
  assert.equal(alvo.querySelector('.vd-pag-info').textContent, '7–8 de 8');
  assert.equal(alvo.querySelectorAll('.vd-card').length, 2);
  assert.ok(alvo.querySelector('.vd-pag-mais').disabled);
  // até 3 vídeos: sem paginador
  assert.doesNotMatch(videosHtml({ ok: true, configurado: true, videos: videos.slice(0, 3) }, agora), /vd-pager/);
  assert.deepEqual(paginasVisiveis(0, 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(paginasVisiveis(5, 12), [0, '…', 4, 5, 6, '…', 11]);
});

test('Vídeos (carteira, 2 grupos): o título do grupo aparece na página onde ele entra', () => {
  const lista = [...[1, 2, 3, 4].map((i) => v(`a${i}`, { motivo: 'ativo', ativos: [] })), ...[1, 2].map((i) => v(`t${i}`, { motivo: 'tema', ativos: [] }))];
  const r = { ok: true, configurado: true, carteira: 'acoes', videos: lista };
  const titulos = (html) => [...new JSDOM(`<body>${html}</body>`).window.document.querySelectorAll('.vd-grupo-titulo')].map((h) => h.textContent);
  assert.deepEqual(titulos(videosHtml(r, agora, 0)), ['Citam seus ativos']);
  assert.deepEqual(titulos(videosHtml(r, agora, 1)), ['Citam seus ativos', 'Sobre o tema da carteira']);
});
