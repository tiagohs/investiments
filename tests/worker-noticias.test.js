// tests/worker-noticias.test.js - 30/10/2026: tela de Notícias no Worker (worker/src/noticias, docs/noticias.md).
// Leitura das fontes com HTML/XML SINTÉTICOS (nenhum conteúdo de terceiros), o agendador do cron (qual fatia roda em
// cada disparo), a coleta gravando no D1 (emulado em node:sqlite) só o que mudou, fonte fora do ar sem apagar a última
// leitura boa, e o site lendo as telas do Worker sem nunca ir ao Apps Script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/src/index.js';
import { hmacBase64Url } from '../worker/src/auth.js';
import { extrairTempoRealInfoMoney, urlTempoRealInfoMoney, extrairRss, extrairFeedYoutube, urlGoogleNoticias, textoLimpo } from '../worker/src/noticias/fontes.js';
import { coletarNoticias, tarefasDoDisparo, montarTelaMercado, montarTelaVideos, proximosDaFila, diaSaoPaulo, horaSaoPaulo, CANAIS_POR_DISPARO, PRODUTOS_IBGE, dataIbge } from '../worker/src/noticias/coleta.js';
import { getNoticiasMercado, getNoticiasVideos, getNoticiasAtivos, esquecerRespostasGuardadas } from '../assets/js/api-client.js';
import { usarMemoriaNoCacheDados } from '../assets/js/cache-dados.js';
import { LEITURA_URL } from '../assets/js/config.js';
import { ACOES_SO_WORKER } from '../assets/js/leitura-chave.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- D1 de mentira (mesma SQL do schema.sql) ----
class Comando {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Comando(this.db, this.sql, args.map((a) => (a instanceof ArrayBuffer ? new Uint8Array(a) : a))); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { this.executar(); return { success: true }; }
  executar() { this.db.prepare(this.sql).run(...this.args); }
}
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(RAIZ, 'worker/schema.sql'), 'utf8'));
  return { db, prepare: (sql) => new Comando(db, sql), async batch(l) { db.exec('BEGIN'); try { l.forEach((c) => c.executar()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return []; } };
}
const linha = (env, chave) => env.DB.db.prepare('SELECT * FROM publicacao WHERE chave = ?').get(chave);
const tela = (env, chave) => { const l = linha(env, chave); return l ? JSON.parse(zlib.gunzipSync(Buffer.from(l.corpo)).toString('utf8')) : null; };

// ---- fontes sintéticas ----
function paginaTempoReal(itens, { manchete = 'Ibovespa Hoje Ao Vivo: bolsa sobe com exterior - InfoMoney', resumo = ['Índice sobe 1%', 'Dólar cai a R$ 5,30'] } = {}) {
  const blocos = itens.map(([hora, id, titulo]) => `<div class="live-container"><span class="live-published"><span class="material-icons live-published-icon">update</span> ${hora} </span><h2 id="${id}" class="live-title" >${titulo}</h2><div class="live-content"><p>texto</p></div></div>`).join('\n');
  const lis = resumo.map((r) => `<li>${r}</li>`).join('');
  return `<html><head><meta property="og:title" content="${manchete}"></head><body><h2 id="h-ibovespa-hoje">Ibovespa hoje</h2><ul>${lis}</ul><h3>Outro</h3>${blocos}${'<p>enchimento</p>'.repeat(10)}</body></html>`;
}
function rss(itens) {
  return `<?xml version="1.0"?><rss><channel><title>Busca</title>${itens.map(([t, fonte, data, link]) => `<item><title>${t} - ${fonte}</title><link>${link || 'https://noticia.exemplo.test/' + encodeURIComponent(t)}</link><pubDate>${new Date(data).toUTCString()}</pubDate><source url="https://f.test">${fonte}</source><description>&lt;a href="x"&gt;${t}&lt;/a&gt;</description></item>`).join('')}</channel></rss>`;
}
function feedYoutube(canal, videos) {
  return `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>${canal}</title>${videos.map(([id, t, data]) => `<entry><id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><title>${t}</title><author><name>${canal}</name></author><published>${data}</published></entry>`).join('')}</feed>`;
}

test('fontes: tempo real do InfoMoney (hora, título, link), manchete e resumo; RSS sem o " - Fonte"; feed do YouTube', () => {
  const url = urlTempoRealInfoMoney('2026-10-30');
  assert.equal(url, 'https://www.infomoney.com.br/mercados/ibovespa-hoje-bolsa-de-valores-ao-vivo-30102026/');
  const lido = extrairTempoRealInfoMoney(paginaTempoReal([['16h01', 'a1', 'Ibovespa renova máxima &amp; dólar cai'], ['9h05', 'a2', '<strong>Abertura</strong>: futuros sobem']]), { url });
  assert.equal(lido.manchete, 'Ibovespa Hoje Ao Vivo: bolsa sobe com exterior');
  assert.deepEqual(lido.resumo, ['Índice sobe 1%', 'Dólar cai a R$ 5,30']);
  assert.deepEqual(lido.itens, [
    { hora: '16h01', titulo: 'Ibovespa renova máxima & dólar cai', link: `${url}#a1` },
    { hora: '9h05', titulo: 'Abertura : futuros sobem', link: `${url}#a2` },
  ]);
  assert.deepEqual(extrairTempoRealInfoMoney('<html>mudou tudo</html>').itens, [], 'formato novo: lista vazia, sem erro');

  const r = extrairRss(rss([['Bolsa sobe', 'Jornal A', '2026-10-30T15:00:00Z'], ['Dólar cai', 'Jornal B', '2026-10-30T14:00:00Z']]));
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { titulo: 'Bolsa sobe', link: 'https://noticia.exemplo.test/Bolsa%20sobe', data: '2026-10-30T15:00:00.000Z', fonte: 'Jornal A', resumo: '' });
  assert.match(urlGoogleNoticias('PETR4 when:1d'), /^https:\/\/news\.google\.com\/rss\/search\?q=PETR4%20when%3A1d&hl=pt-BR/);

  const v = extrairFeedYoutube(feedYoutube('Canal Exemplo', [['abcDEF12345', 'Vídeo 1', '2026-10-30T12:00:00+00:00'], ['x', 'id inválido', '2026-10-30T12:00:00+00:00']]));
  assert.deepEqual(v, [{ id: 'abcDEF12345', titulo: 'Vídeo 1', publicado: '2026-10-30T12:00:00.000Z', canal: 'Canal Exemplo' }]);
  assert.equal(textoLimpo('<![CDATA[a &amp; b &lt;i&gt;c&lt;/i&gt;]]>'), 'a & b c', 'CDATA, entidades e HTML escapado');
});

test('agendador: no pregão o tempo real roda em todo disparo e o resto alterna; fora dele, cada tarefa a cada 30 min', () => {
  const sp = (iso) => Date.parse(iso); // horários em UTC (SP = UTC-3)
  assert.deepEqual(tarefasDoDisparo(sp('2026-10-30T14:00:00Z')), { tempoReal: true, manchetes: true, videos: false, ativos: false, agenda: false }, 'sexta 11:00');
  assert.deepEqual(tarefasDoDisparo(sp('2026-10-30T14:05:00Z')), { tempoReal: true, manchetes: false, videos: true, ativos: true, agenda: true }, 'sexta 11:05 (a agenda só busca se a última leitura tiver mais de 20 h)');
  const sabado = ['00', '05', '10', '15', '20', '25'].map((m) => tarefasDoDisparo(sp(`2026-10-31T14:${m}:00Z`)));
  assert.equal(sabado.filter((x) => x.manchetes).length, 1, 'sábado: manchetes 1x a cada 30 min');
  assert.equal(sabado.filter((x) => x.videos).length, 1, 'sábado: vídeos 1x a cada 30 min');
  assert.equal(sabado.filter((x) => !x.tempoReal && !x.manchetes && !x.videos && !x.ativos && !x.agenda).length, 4, 'os outros disparos não fazem nada');
  assert.equal(diaSaoPaulo(sp('2026-10-31T02:00:00Z')), '2026-10-30', 'dia de São Paulo');
  assert.equal(horaSaoPaulo(sp('2026-10-30T12:05:00Z')), '9h05');
  assert.deepEqual(proximosDaFila(['a', 'b', 'c'], 2, 2), { escolhidos: ['c', 'a'], cursor: 1 });
  assert.deepEqual(proximosDaFila([], 5, 2), { escolhidos: [], cursor: 0 });
});

test('tela do índice: IFIX e Exterior filtram o tempo real e completam com as notícias das últimas 12 h; sem tempo real, avisa', () => {
  const agoraMs = Date.parse('2026-10-30T18:00:00Z');
  const fontes = {
    'tr:infomoney': { em: '2026-10-30T17:59:00Z', url: urlTempoRealInfoMoney('2026-10-30'), manchete: 'Manchete do dia', resumo: ['r1'], itens: [
      { hora: '14h50', titulo: 'IFIX sobe com fundos imobiliários de papel', link: 'l1' },
      { hora: '14h40', titulo: 'Wall Street abre em alta com balanços', link: 'l2' },
      { hora: '14h30', titulo: 'Dólar recua a R$ 5,30', link: 'l3' },
      { hora: '14h20', titulo: 'Petrobras puxa o Ibovespa', link: 'l4' },
    ] },
    'gn:ifix': { em: '2026-10-30T17:50:00Z', itens: [{ titulo: 'FII anuncia rendimento', link: 'g1', data: '2026-10-30T16:00:00Z', fonte: 'Site X', resumo: '' }, { titulo: 'Notícia velha', link: 'g2', data: '2026-10-28T16:00:00Z', fonte: 'Site Y', resumo: '' }] },
  };
  const ibov = montarTelaMercado('ibov', fontes, { agoraMs });
  assert.equal(ibov.tempoReal.length, 4, 'Ibovespa: o tempo real inteiro');
  assert.deepEqual(ibov.manchete, { titulo: 'Manchete do dia', link: fontes['tr:infomoney'].url, resumo: ['r1'], fonte: 'InfoMoney' });
  assert.ok(ibov.avisos.includes('Manchetes indisponíveis agora.'));
  const ifix = montarTelaMercado('ifix', fontes, { agoraMs });
  assert.deepEqual(ifix.tempoReal.map((x) => x.titulo), ['IFIX sobe com fundos imobiliários de papel', 'FII anuncia rendimento'], 'filtro + a notícia das últimas 12 h, pela hora');
  assert.equal(ifix.tempoReal[1].hora, '13h00', '16:00 UTC = 13h00 de São Paulo');
  assert.equal(ifix.manchete.titulo, 'FII anuncia rendimento');
  assert.deepEqual(ifix.noticias.map((n) => n.titulo), ['Notícia velha'], 'a manchete não repete na lista');
  assert.deepEqual(montarTelaMercado('spx', fontes, { agoraMs }).tempoReal.map((x) => x.link), ['l2']);
  assert.deepEqual(montarTelaMercado('dolar', fontes, { agoraMs }).tempoReal.map((x) => x.link), ['l3']);
  const semLive = montarTelaMercado('ibov', {}, { agoraMs });
  assert.deepEqual(semLive.tempoReal, []);
  assert.ok(semLive.avisos.includes('Tempo real indisponível agora.'));
  const ontem = montarTelaMercado('ibov', { 'tr:infomoney': { ...fontes['tr:infomoney'], em: '2026-10-29T21:00:00Z', url: urlTempoRealInfoMoney('2026-10-29') } }, { agoraMs });
  assert.ok(ontem.avisos.some((a) => /ainda não saiu/.test(a)), 'tempo real de ontem: avisa');
});

test('vídeos: cada canal na sua aba, mais novos primeiro, no máximo 6 de um canal; canal ainda não lido aparece em aviso', () => {
  const config = { canais: [
    { id: 'UC' + 'a'.repeat(22), nome: 'uol', tela: 'noticias' },
    { id: 'UC' + 'b'.repeat(22), nome: 'infomoney', tela: 'noticias' },
    { id: 'UC' + 'c'.repeat(22), nome: 'ProfessorBaroni', tela: 'especialistas' },
  ] };
  const vids = (n, canal, base) => Array.from({ length: n }, (_, i) => ({ id: `${canal}${String(i).padStart(9, '0')}`, titulo: `${canal} ${i}`, publicado: new Date(Date.parse(base) - i * 3600e3).toISOString(), canal }));
  const fontes = { [`yt:${config.canais[0].id}`]: { itens: vids(10, 'UOL', '2026-10-30T15:00:00Z') }, [`yt:${config.canais[1].id}`]: { itens: vids(2, 'InfoMoney', '2026-10-30T14:30:00Z') } };
  const t = montarTelaVideos('noticias', config, fontes);
  assert.equal(t.videos.length, 8, '6 da UOL + 2 do InfoMoney');
  assert.equal(t.videos[0].canal, 'UOL');
  assert.equal(t.videos[1].canal, 'InfoMoney', '14h30 vem antes das 14h da UOL');
  assert.deepEqual(t.canais, ['UOL', 'InfoMoney'], 'nome do feed');
  const esp = montarTelaVideos('especialistas', config, fontes);
  assert.deepEqual(esp.videos, []);
  assert.deepEqual(esp.avisos, ['Ainda lendo: ProfessorBaroni.']);
});

/** fetch falso: devolve cada fonte sintética pela URL. */
function fetchFalso(mapa, pedidos = []) {
  return async (url) => {
    pedidos.push(String(url));
    for (const [teste, resp] of mapa) {
      if (teste(String(url))) {
        if (resp instanceof Error) throw resp;
        if (typeof resp === 'number') return new Response('', { status: resp });
        return new Response(resp, { status: 200 });
      }
    }
    return new Response('', { status: 404 });
  };
}

/** Uma tela publicada pelo Apps Script (noticiasConfig, noticiasGoogle) direto no D1 de mentira. */
function publicarDoAppsScript(env, chave, obj, em = '2026-10-30T10:00:00Z') {
  const z = zlib.gzipSync(Buffer.from(JSON.stringify({ ok: true, ...obj })));
  env.DB.db.prepare(`INSERT INTO publicacao (chave, geracao, geracao_ms, hash, publicado_em, bytes, corpo) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET corpo = excluded.corpo, publicado_em = excluded.publicado_em`).run(chave, 'v.1700000000000', 1700000000000, `hash${chave}`, em, z.length, z);
}
const publicarConfig = async (env, config) => publicarDoAppsScript(env, 'noticiasConfig', config);
const itemGas = (titulo, data) => ({ titulo, link: `https://noticia.exemplo.test/${encodeURIComponent(titulo)}`, fonte: 'Jornal A', data, imagem: null, fonteUrl: null });

test('coleta: publica as telas no D1 (gzip + hash), não regrava o que não mudou, e fonte fora do ar mantém a última leitura', async () => {
  const env = { DB: d1() };
  await publicarConfig(env, {
    canais: Array.from({ length: 7 }, (_, i) => ({ id: `UC${String(i).repeat(22)}`, nome: `canal${i}`, tela: i < 2 ? 'noticias' : 'meus' })),
    ativos: [{ ticker: 'ABCD3', classe: 'acoes', nome: 'Empresa Exemplo' }, { ticker: 'WXYZ11', classe: 'fiis', nome: 'Fundo de Investimento Imobiliário Exemplo' }],
  });
  // o Google Notícias recusa o Cloudflare: as buscas vêm do Apps Script (noticiasGoogle)
  publicarDoAppsScript(env, 'noticiasGoogle', {
    indices: { ibov: [itemGas('Mercado anima', '2026-10-30T13:30:00Z')], ifix: [], spx: [itemGas('Wall Street sobe', '2026-10-30T13:00:00Z')], dolar: [] },
    ativos: { ABCD3: [itemGas('Empresa Exemplo lucra', '2026-10-30T12:00:00Z')], WXYZ11: [] },
  });
  const manha = Date.parse('2026-10-30T14:00:00Z'); // sexta 11:00, slot par: tempo real + manchetes
  const live = paginaTempoReal([['10h55', 'b1', 'Ibovespa abre em alta'], ['10h10', 'b0', 'Dólar recua']]);
  const pedidos = [];
  const mapa = [
    [(u) => u.includes('ao-vivo-30102026'), live],
    [(u) => u.includes('youtube.com/feeds'), feedYoutube('Canal', [['vid00000001', 'Vídeo', '2026-10-30T12:00:00Z']])],
  ];
  const PAR = { tempoReal: true, manchetes: true, videos: false, ativos: false };
  const IMPAR = { tempoReal: false, manchetes: false, videos: true, ativos: true };
  const r1 = await coletarNoticias(env, { agoraMs: manha, tarefas: PAR, fetchImpl: fetchFalso(mapa, pedidos) });
  assert.deepEqual(r1.falhas, []);
  assert.deepEqual(pedidos.length, 1, 'só o tempo real: o Google vem do Apps Script, sem pedido daqui');
  assert.ok(!pedidos.some((u) => u.includes('news.google.com')), 'nunca pede ao Google Notícias (ele recusa o Cloudflare)');
  assert.equal(tela(env, 'noticiasMercado?indice=ibov').noticias[0].titulo, 'Mercado anima', 'manchetes do Apps Script');
  assert.equal(tela(env, 'noticiasMercado?indice=spx').manchete.titulo, 'Wall Street sobe');
  assert.equal(r1.telas, 4);
  const ibov = tela(env, 'noticiasMercado?indice=ibov');
  assert.equal(ibov.ok, true);
  assert.deepEqual(ibov.tempoReal.map((x) => x.titulo), ['Ibovespa abre em alta', 'Dólar recua']);
  assert.equal(linha(env, 'noticiasMercado?indice=ibov').geracao, `noticias.${manha}`);
  assert.match(linha(env, 'noticiasMercado?indice=ibov').hash, /^[A-Za-z0-9_-]{8,64}$/, 'o mesmo formato de hash que o Worker aceita');

  // mesmo conteúdo 10 min depois: nada é regravado
  const r2 = await coletarNoticias(env, { agoraMs: manha + 10 * 60e3, tarefas: PAR, fetchImpl: fetchFalso(mapa) });
  assert.equal(r2.telas, 0);
  assert.equal(linha(env, 'noticiasMercado?indice=ibov').geracao, `noticias.${manha}`);

  // o InfoMoney fora do ar: a tela continua com o último tempo real; a falha fica no estado
  const r3 = await coletarNoticias(env, { agoraMs: manha + 20 * 60e3, tarefas: PAR, fetchImpl: fetchFalso([[(u) => u.includes('infomoney'), 503], ...mapa.slice(1)]) });
  assert.deepEqual(r3.falhas, [{ fonte: 'tempo real InfoMoney', status: 503 }]);
  assert.equal(tela(env, 'noticiasMercado?indice=ibov').tempoReal.length, 2);
  const estado = JSON.parse(env.DB.db.prepare("SELECT valor FROM estado WHERE chave = 'noticias_ultima'").get().valor);
  assert.equal(estado.falhas.length, 1);

  // disparo ímpar: 5 canais (fila circular) + os 2 ativos
  const p4 = [];
  const r4 = await coletarNoticias(env, { agoraMs: manha + 5 * 60e3, tarefas: IMPAR, fetchImpl: fetchFalso(mapa, p4) });
  assert.equal(p4.filter((u) => u.includes('youtube')).length, CANAIS_POR_DISPARO);
  assert.equal(p4.filter((u) => u.includes('news.google.com')).length, 0);
  assert.ok(r4.telas >= 3);
  assert.equal(tela(env, 'noticiasVideos?aba=noticias').videos.length, 2, 'os 2 canais da aba Notícias, 1 vídeo cada');
  assert.deepEqual(tela(env, 'noticiasAtivos').ativos.ABCD3.map((n) => n.titulo), ['Empresa Exemplo lucra'], 'notícias do ativo do Apps Script');
  // sem a tela do Google publicada: a falha aparece, e as notícias guardadas continuam
  env.DB.db.prepare("DELETE FROM publicacao WHERE chave = 'noticiasGoogle'").run();
  const rSem = await coletarNoticias(env, { agoraMs: manha + 25 * 60e3, tarefas: IMPAR, fetchImpl: fetchFalso(mapa) });
  assert.deepEqual(rSem.falhas, [{ fonte: 'Google Notícias (Apps Script)', status: 'não publicado' }]);
  assert.equal(tela(env, 'noticiasAtivos').ativos.ABCD3.length, 1);
  const p5 = [];
  await coletarNoticias(env, { agoraMs: manha + 15 * 60e3, tarefas: IMPAR, fetchImpl: fetchFalso(mapa, p5) });
  const canais5 = p5.filter((u) => u.includes('youtube')).map((u) => u.split('=')[1].slice(2, 3));
  assert.deepEqual(canais5, ['3', '4', '5', '6', '0'], 'a fila continua de onde parou (2 disparos ímpares depois do 1º)');
});

test('cron: o scheduled do Worker roda a coleta com o horário do disparo', async (t) => {
  const env = { DB: d1() };
  const esperas = [];
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await worker.scheduled({ scheduledTime: Date.parse('2026-10-30T14:00:00Z'), cron: '*/5 * * * *' }, env, { waitUntil: (p) => esperas.push(p) });
  await Promise.all(esperas);
  const estado = JSON.parse(env.DB.db.prepare("SELECT valor FROM estado WHERE chave = 'noticias_ultima'").get().valor);
  assert.deepEqual(estado.tarefas, ['tempoReal', 'manchetes']);
  assert.equal(estado.falhas.length, 2, 'tempo real + Google não publicado');
  const toml = fs.readFileSync(path.join(RAIZ, 'worker/wrangler.toml'), 'utf8');
  assert.match(toml, /\[triggers\]\s*crons = \["\*\/5 \* \* \* \*"\]/, 'um cron só (5 por conta no plano grátis)');
});

test('CPU: ler uma página de tempo real do tamanho da real (~700 KB, 180 atualizações) leva poucos ms', () => {
  const itens = Array.from({ length: 180 }, (_, i) => [`${10 + Math.floor(i / 20)}h${String(i % 60).padStart(2, '0')}`, `id-${i}`, `Atualização número ${i} do mercado`]);
  let html = paginaTempoReal(itens);
  html = html.replace('</body>', `${'<p>texto de corpo da matéria com bastante conteúdo</p>'.repeat(11000)}</body>`);
  assert.ok(html.length > 600000);
  const tempos = [];
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); const r = extrairTempoRealInfoMoney(html, { max: 60 }); tempos.push(performance.now() - t0); assert.equal(r.itens.length, 60); }
  tempos.sort((a, b) => a - b);
  // teto de 10 ms de CPU por execução no plano grátis; a mediana em Node fica bem abaixo
  assert.ok(tempos[2] < 8, `mediana ${tempos[2].toFixed(2)} ms`);
});

test('site: lê as telas de notícias do Worker (sem Apps Script, sem geração mínima); sem publicação, a cópia guardada ou erro', async (t) => {
  const env = { DB: d1(), SESSAO_SEGREDO: 's', EMAILS_AUTORIZADOS: 'a@b.test', ORIGENS: '' };
  const memoria = new Map([['investiments_geracao_minima', JSON.stringify({ '*': Date.now() + 3600e3 })]]); // gravou "agora": não vale pra notícia
  globalThis.localStorage = { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k) };
  usarMemoriaNoCacheDados(new Map());
  esquecerRespostasGuardadas();
  let fora = false;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (!String(url).startsWith(LEITURA_URL)) throw new Error(`foi a outro lugar: ${url}`);
    if (fora) throw new Error('rede');
    const r = await worker.fetch(new Request(String(url), init), env);
    if (r.headers.get('Content-Encoding') !== 'gzip') return r;
    const h = new Headers(r.headers); h.delete('Content-Encoding');
    return new Response(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())), { status: r.status, headers: h });
  });
  const payload = Buffer.from(JSON.stringify({ email: 'a@b.test', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const token = `s1.${payload}.${await hmacBase64Url('s', payload)}`;
  assert.equal((await getNoticiasMercado(token, 'ibov')).ok, false, 'ainda não publicado: erro, sem Apps Script');
  publicarDoAppsScript(env, 'noticiasGoogle', { indices: { ibov: [itemGas('Mercado anima', new Date().toISOString())] }, ativos: {} });
  await coletarNoticias(env, { agoraMs: Date.now(), tarefas: { tempoReal: true, manchetes: true, videos: true, ativos: true }, fetchImpl: fetchFalso([
    [(u) => u.includes('infomoney'), paginaTempoReal([['11h00', 'c1', 'Bolsa sobe']])],
  ]) });
  const m = await getNoticiasMercado(token, 'ibov');
  assert.equal(m._fonte, 'leitura');
  assert.equal(m.tempoReal[0].titulo, 'Bolsa sobe');
  assert.equal((await getNoticiasVideos(token, 'noticias')).ok, true);
  assert.equal((await getNoticiasAtivos(token)).ok, true);
  const de304 = await getNoticiasMercado(token, 'ibov');
  assert.equal(de304._naoMudou, true, 'segunda leitura: 304 com a cópia guardada');
  fora = true;
  const velha = await getNoticiasMercado(token, 'ibov');
  assert.equal(velha._velha, true, 'Worker fora: a última cópia');
  assert.equal(velha.tempoReal[0].titulo, 'Bolsa sobe');
  assert.deepEqual([...ACOES_SO_WORKER], ['noticiasMercado', 'noticiasVideos', 'noticiasAtivos', 'noticiasAgenda']);
});

test('agenda do IBGE: 1 leitura por dia (7 pesquisas), hora de São Paulo, publicada em noticiasAgenda; falha não apaga a anterior', async () => {
  const env = { DB: d1() };
  const agoraMs = Date.parse('2026-10-30T14:05:00Z');
  const json = (id) => JSON.stringify({ items: [{ data_divulgacao: '12/11/2026 12:00:00', mes_referencia_fim: 10, ano_referencia_fim: 2026, produto_id: Number(id) }, { data_divulgacao: 'quebrado' }] });
  const pedidos = [];
  const SO_AGENDA = { tempoReal: false, manchetes: false, videos: false, ativos: false, agenda: true };
  await coletarNoticias(env, { agoraMs, tarefas: SO_AGENDA, fetchImpl: (async (u) => { pedidos.push(String(u)); const id = String(u).match(/calendario\/(\d+)/)[1]; return new Response(json(id), { status: 200 }); }) });
  assert.equal(pedidos.length, Object.keys(PRODUTOS_IBGE).length);
  const ag = tela(env, 'noticiasAgenda');
  assert.equal(ag.eventos.length, 7);
  assert.deepEqual(ag.eventos.find((e) => e.titulo.startsWith('IPCA (')), { dia: '2026-11-12', hora: '9h00', titulo: 'IPCA (ref. 10/2026)', detalhe: 'IBGE', tag: 'macro' }, '12:00 UTC = 9h de São Paulo');
  assert.deepEqual(dataIbge('05/11/2026 13:00:00'), { dia: '2026-11-05', hora: '10h00' });
  // 1 h depois: não busca de novo
  const p2 = [];
  await coletarNoticias(env, { agoraMs: agoraMs + 3600e3, tarefas: SO_AGENDA, fetchImpl: async (u) => { p2.push(u); return new Response('', { status: 500 }); } });
  assert.equal(p2.length, 0, 'leitura de menos de 20 h vale');
  // no dia seguinte, o IBGE fora do ar: a agenda continua com a leitura de ontem
  const r3 = await coletarNoticias(env, { agoraMs: agoraMs + 24 * 3600e3, tarefas: SO_AGENDA, fetchImpl: async () => new Response('', { status: 500 }) });
  assert.deepEqual(r3.falhas, [{ fonte: 'agenda IBGE', status: '7 de 7' }]);
  assert.equal(tela(env, 'noticiasAgenda').eventos.length, 7);
});
