/**
 * worker/src/noticias/coleta.js - 30/10/2026 (tela de Notícias, docs/noticias.md, ADR-N1/N2): o cron do Worker busca as
 * fontes e publica as telas `noticias*` no D1 (as mesmas linhas `publicacao` que o Apps Script usa, com geração
 * `noticias.<ms>`). Grátis: 10 ms de CPU e 50 pedidos externos por execução - por isso cada disparo faz só uma fatia:
 *
 *   disparo (a cada 5 min)   no pregão                                fora do pregão (1 a cada 30 min por tarefa)
 *   ---------------------    --------------------------------------   ------------------------------------------
 *   par                      tempo real + manchetes dos 4 índices     tempo real + manchetes (minuto :00 e :30)
 *   ímpar                    tempo real + 5 canais + 5 ativos         5 canais + 5 ativos (minuto :15 e :45)
 *
 * O que cada fonte trouxe fica em `noticias_fonte` (uma linha por fonte: o tempo real, cada índice, cada canal, cada
 * ativo); as telas são remontadas dali, e só vão ao D1 as que mudaram (hash). Fonte que falhou: fica a última leitura
 * boa, e a tela diz em `avisos`. Nada de Workers AI (Tiago, 30/10/2026: "não usar neurons por agora").
 *
 * Telas publicadas:
 *   noticiasMercado?indice=ibov|ifix|spx|dolar  { ok, indice, atualizadoEm, manchete, tempoReal, noticias, fonteTempoReal, avisos }
 *   noticiasVideos?aba=noticias|especialistas|meus  { ok, aba, atualizadoEm, videos, canais, avisos }
 *   noticiasAtivos                              { ok, atualizadoEm, ativos: { TICKER: [notícia] } }
 * Configuração (canais e ativos da carteira): a tela `noticiasConfig`, que o Apps Script publica (Noticias.gs).
 */
import { extrairTempoRealInfoMoney, urlTempoRealInfoMoney, extrairRss, urlGoogleNoticias, extrairFeedYoutube } from './fontes.js';
import { talvezNoPregao } from '../../../assets/js/leitura-chave.js';

export const INDICES_NOTICIAS = Object.freeze(['ibov', 'ifix', 'spx', 'dolar']);
export const ABAS_VIDEOS = Object.freeze(['noticias', 'especialistas', 'meus']);
export const CANAIS_POR_DISPARO = 5;
export const ATIVOS_POR_DISPARO = 5;
const SLOT_MS = 5 * 60 * 1000;
const TEMPO_MAXIMO_FONTE_MS = 6000;
const MAX_TEMPO_REAL = 30;
const MAX_NOTICIAS = 12;
const MAX_VIDEOS_POR_ABA = 24;
const MAX_POR_ATIVO = 6;

/** Busca do Google Notícias de cada índice (últimas 24 h). */
export const CONSULTAS_INDICE = Object.freeze({
  ibov: 'Ibovespa OR "bolsa brasileira" when:1d',
  ifix: '"fundos imobiliários" OR IFIX OR FIIs when:1d',
  spx: '"Wall Street" OR "S&P 500" OR Nasdaq OR "Federal Reserve" when:1d',
  dolar: 'dólar OR câmbio when:1d',
});
/** Do tempo real do InfoMoney (que é da bolsa toda), o que vale para cada índice. ibov = tudo. */
export const FILTRO_TEMPO_REAL = Object.freeze({
  ibov: null,
  ifix: /\b(fii|fiis|ifix|fundos? imobili[aá]rios?|imobili[aá]ri)/i,
  spx: /(wall street|s&p|nasdaq|dow jones|\bfed\b|federal reserve|treasur|\beua\b|estados unidos|powell|trump|bolsas? (de )?(nova york|americanas?))/i,
  dolar: /(d[oó]lar|c[aâ]mbio|\breal\b|moedas?)/i,
});

/** Que fatia roda neste disparo. */
export function tarefasDoDisparo(agoraMs) {
  const slot = Math.floor(agoraMs / SLOT_MS);
  const par = slot % 2 === 0;
  if (talvezNoPregao(agoraMs)) return { tempoReal: true, manchetes: par, videos: !par, ativos: !par };
  const fase = slot % 6;
  return { tempoReal: fase === 0, manchetes: fase === 0, videos: fase === 3, ativos: fase === 3 };
}

/** 'aaaa-mm-dd' de São Paulo. */
export function diaSaoPaulo(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
/** '16h01' de São Paulo. */
export function horaSaoPaulo(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${Number(p.hour)}h${p.minute}`;
}

// ---- D1 ----
const SQL_TABELA = 'CREATE TABLE IF NOT EXISTS noticias_fonte (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, em TEXT NOT NULL)';

async function lerFontes(env) {
  const r = await env.DB.prepare('SELECT chave, valor FROM noticias_fonte').all();
  const out = {};
  (r.results || []).forEach((l) => { try { out[l.chave] = JSON.parse(l.valor); } catch (e) { /* linha estragada: ignora */ } });
  return out;
}

async function gzip(texto) {
  const s = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunzipTexto(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).text();
}
async function hashTexto(texto) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  let s = '';
  for (let i = 0; i < 16; i++) s += String.fromCharCode(d[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function paraBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return Uint8Array.from(v);
  if (v && v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return new Uint8Array(0);
}

/** A configuração que o Apps Script publicou (canais e ativos). Sem ela: listas vazias. */
export async function lerConfigNoticias(env) {
  try {
    const l = await env.DB.prepare('SELECT corpo FROM publicacao WHERE chave = ?').bind('noticiasConfig').first();
    if (!l) return { canais: [], ativos: [] };
    const j = JSON.parse(await gunzipTexto(paraBytes(l.corpo)));
    return { canais: Array.isArray(j.canais) ? j.canais : [], ativos: Array.isArray(j.ativos) ? j.ativos : [] };
  } catch (e) {
    return { canais: [], ativos: [] };
  }
}

// ---- busca ----
async function buscarTexto(url, fetchImpl) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const relogio = ctrl ? setTimeout(() => ctrl.abort(), TEMPO_MAXIMO_FONTE_MS) : null;
  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; investiments-noticias)', 'Accept-Language': 'pt-BR' }, ...(ctrl ? { signal: ctrl.signal } : {}) });
    if (r.status !== 200) return { ok: false, status: r.status };
    return { ok: true, texto: await r.text() };
  } catch (e) {
    return { ok: false, status: 0 };
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

/** Fila circular: os `n` próximos depois do cursor. */
export function proximosDaFila(lista, cursor, n) {
  if (!lista.length) return { escolhidos: [], cursor: 0 };
  const ini = ((Number(cursor) || 0) % lista.length + lista.length) % lista.length;
  const escolhidos = [];
  for (let i = 0; i < Math.min(n, lista.length); i++) escolhidos.push(lista[(ini + i) % lista.length]);
  return { escolhidos, cursor: (ini + escolhidos.length) % lista.length };
}

function consultaDoAtivo(a) {
  const t = String(a.ticker || '').toUpperCase();
  const nome = String(a.nome || '').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim();
  const partes = [`"${t}"`];
  // o nome curto ajuda (Petrobras, Vale); nome genérico demais ("Fundo de Investimento...") só atrapalha
  if (nome && nome.length <= 40 && !/^fundo/i.test(nome)) partes.push(`"${nome}"`);
  return `${partes.join(' OR ')} when:7d`;
}

/** Roda a fatia do disparo. Devolve um resumo (vai pra `estado.noticias_ultima`). */
export async function coletarNoticias(env, { agoraMs = Date.now(), fetchImpl = fetch, tarefas = null } = {}) {
  const t = tarefas || tarefasDoDisparo(agoraMs);
  const agoraIso = new Date(agoraMs).toISOString();
  await env.DB.prepare(SQL_TABELA).run();
  const fontes = await lerFontes(env);
  const novas = {}; // chave -> valor (só o que mudou nesta rodada)
  const falhas = [];
  const pedidos = [];

  if (t.tempoReal) {
    pedidos.push((async () => {
      const url = urlTempoRealInfoMoney(diaSaoPaulo(agoraMs));
      const r = await buscarTexto(url, fetchImpl);
      const lido = r.ok ? extrairTempoRealInfoMoney(r.texto, { url, max: 60 }) : null;
      if (lido && lido.itens.length) novas['tr:infomoney'] = { em: agoraIso, url, ...lido };
      else falhas.push({ fonte: 'tempo real InfoMoney', status: r.ok ? 'formato' : r.status });
    })());
  }
  if (t.manchetes) {
    INDICES_NOTICIAS.forEach((indice) => pedidos.push((async () => {
      const r = await buscarTexto(urlGoogleNoticias(CONSULTAS_INDICE[indice]), fetchImpl);
      const itens = r.ok ? extrairRss(r.texto, { max: 25 }) : [];
      if (itens.length) novas[`gn:${indice}`] = { em: agoraIso, itens };
      else falhas.push({ fonte: `manchetes ${indice}`, status: r.ok ? 'vazio' : r.status });
    })()));
  }
  const config = (t.videos || t.ativos) ? await lerConfigNoticias(env) : { canais: [], ativos: [] };
  if (t.videos) {
    const canais = config.canais.filter((c) => /^UC[\w-]{22}$/.test(String(c.id || '')));
    const fila = proximosDaFila(canais, fontes['cursor:canais'] && fontes['cursor:canais'].i, CANAIS_POR_DISPARO);
    novas['cursor:canais'] = { i: fila.cursor };
    fila.escolhidos.forEach((c) => pedidos.push((async () => {
      const r = await buscarTexto(`https://www.youtube.com/feeds/videos.xml?channel_id=${c.id}`, fetchImpl);
      const itens = r.ok ? extrairFeedYoutube(r.texto, { max: 15 }) : [];
      if (r.ok) novas[`yt:${c.id}`] = { em: agoraIso, itens };
      else falhas.push({ fonte: `canal ${c.nome || c.id}`, status: r.status });
    })()));
  }
  if (t.ativos) {
    const ativos = config.ativos.filter((a) => /^[A-Z0-9.]{3,12}$/.test(String(a.ticker || '').toUpperCase()));
    const fila = proximosDaFila(ativos, fontes['cursor:ativos'] && fontes['cursor:ativos'].i, ATIVOS_POR_DISPARO);
    novas['cursor:ativos'] = { i: fila.cursor };
    fila.escolhidos.forEach((a) => pedidos.push((async () => {
      const r = await buscarTexto(urlGoogleNoticias(consultaDoAtivo(a)), fetchImpl);
      const itens = r.ok ? extrairRss(r.texto, { max: MAX_POR_ATIVO }) : null;
      if (itens) novas[`at:${String(a.ticker).toUpperCase()}`] = { em: agoraIso, itens };
      else falhas.push({ fonte: `notícias ${a.ticker}`, status: r.status });
    })()));
  }
  await Promise.all(pedidos);

  const todas = { ...fontes, ...novas };
  const telas = [];
  if (t.tempoReal || t.manchetes) INDICES_NOTICIAS.forEach((indice) => telas.push([`noticiasMercado?indice=${indice}`, montarTelaMercado(indice, todas, { agoraMs })]));
  if (t.videos) ABAS_VIDEOS.forEach((aba) => telas.push([`noticiasVideos?aba=${aba}`, montarTelaVideos(aba, config, todas, { agoraMs })]));
  if (t.ativos) telas.push(['noticiasAtivos', montarTelaAtivos(config, todas, { agoraMs })]);

  const gravadas = await gravarTelas(env, telas, { agoraMs, agoraIso, novas, falhas, tarefas: t });
  return { ok: true, tarefas: t, fontes: Object.keys(novas).filter((k) => !k.startsWith('cursor:')).length, telas: gravadas, falhas };
}

async function gravarTelas(env, telas, { agoraMs, agoraIso, novas, falhas, tarefas }) {
  const comandos = Object.entries(novas).map(([chave, valor]) => env.DB.prepare(
    'INSERT INTO noticias_fonte (chave, valor, em) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, em = excluded.em',
  ).bind(chave, JSON.stringify(valor), agoraIso));
  const hashes = {};
  if (telas.length) {
    const r = await env.DB.prepare("SELECT chave, hash FROM publicacao WHERE chave LIKE 'noticias%'").all();
    (r.results || []).forEach((l) => { hashes[l.chave] = l.hash; });
  }
  const geracao = `noticias.${agoraMs}`;
  let gravadas = 0;
  for (const [chave, tela] of telas) {
    const { atualizadoEm, ...semData } = tela; // o hash não muda só porque o relógio andou
    const hash = await hashTexto(JSON.stringify(semData));
    if (hashes[chave] === hash) continue;
    const texto = JSON.stringify(tela);
    const corpo = await gzip(texto);
    gravadas++;
    comandos.push(env.DB.prepare(
      `INSERT INTO publicacao (chave, geracao, geracao_ms, hash, publicado_em, bytes, corpo) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET geracao = excluded.geracao, geracao_ms = excluded.geracao_ms, hash = excluded.hash,
         publicado_em = excluded.publicado_em, bytes = excluded.bytes, corpo = excluded.corpo`,
    ).bind(chave, geracao, agoraMs, hash, agoraIso, corpo.length, corpo.buffer));
  }
  comandos.push(env.DB.prepare(
    "INSERT INTO estado (chave, valor) VALUES ('noticias_ultima', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
  ).bind(JSON.stringify({ em: agoraIso, tarefas: Object.keys(tarefas).filter((k) => tarefas[k]), telas: gravadas, falhas: falhas.slice(0, 10) })));
  await env.DB.batch(comandos);
  return gravadas;
}

// ---- montagem das telas (puras) ----
const msDe = (iso) => { const n = Date.parse(iso || ''); return Number.isFinite(n) ? n : 0; };

/** Tela de um índice: tempo real (InfoMoney filtrado + Google Notícias recentes) e manchetes. */
export function montarTelaMercado(indice, fontes, { agoraMs = Date.now() } = {}) {
  const avisos = [];
  const live = fontes['tr:infomoney'];
  const hoje = diaSaoPaulo(agoraMs);
  const liveDeHoje = live && diaSaoPaulo(msDe(live.em)) === hoje && live.url && live.url.includes(hoje.split('-').reverse().join(''));
  const gn = fontes[`gn:${indice}`];
  const noticias = (gn && gn.itens ? gn.itens : []).slice().sort((a, b) => msDe(b.data) - msDe(a.data));
  let tempoReal = [];
  let fonteTempoReal = 'Google Notícias';
  if (live && live.itens) {
    const filtro = FILTRO_TEMPO_REAL[indice];
    tempoReal = live.itens.filter((it) => !filtro || filtro.test(it.titulo)).map((it) => ({ hora: it.hora, titulo: it.titulo, link: it.link, fonte: 'InfoMoney' }));
    if (tempoReal.length) fonteTempoReal = 'InfoMoney';
    if (!liveDeHoje) avisos.push('O tempo real de hoje do InfoMoney ainda não saiu: mostrando o último.');
  } else if (indice === 'ibov' || indice === 'dolar') {
    avisos.push('Tempo real indisponível agora.');
  }
  if (indice !== 'ibov' && tempoReal.length < 8) {
    // completa com as notícias das últimas 12 h (com a hora delas)
    const vistos = new Set(tempoReal.map((x) => x.titulo));
    noticias.filter((n) => msDe(n.data) > agoraMs - 12 * 3600 * 1000 && !vistos.has(n.titulo)).forEach((n) => {
      tempoReal.push({ hora: horaSaoPaulo(msDe(n.data)), titulo: n.titulo, link: n.link, fonte: n.fonte || 'Google Notícias', _ms: msDe(n.data) });
    });
    if (tempoReal.some((x) => x._ms)) tempoReal.sort((a, b) => minutosDe(b.hora) - minutosDe(a.hora));
    tempoReal = tempoReal.map(({ _ms, ...x }) => x);
  }
  if (!noticias.length) avisos.push('Manchetes indisponíveis agora.');
  const manchete = indice === 'ibov' && live && live.manchete
    ? { titulo: live.manchete, link: live.url, resumo: live.resumo || [], fonte: 'InfoMoney' }
    : (noticias[0] ? { titulo: noticias[0].titulo, link: noticias[0].link, resumo: noticias[0].resumo ? [noticias[0].resumo] : [], fonte: noticias[0].fonte, data: noticias[0].data } : null);
  return {
    ok: true, indice, atualizadoEm: new Date(agoraMs).toISOString(),
    manchete,
    tempoReal: tempoReal.slice(0, MAX_TEMPO_REAL),
    noticias: noticias.filter((n) => !manchete || n.titulo !== manchete.titulo).slice(0, MAX_NOTICIAS),
    fonteTempoReal,
    avisos,
  };
}
function minutosDe(hora) { const m = String(hora || '').match(/^(\d{1,2})h(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; }

/** Uma aba de vídeos: os canais daquela aba, os mais novos primeiro. */
export function montarTelaVideos(aba, config, fontes, { agoraMs = Date.now() } = {}) {
  const canais = (config.canais || []).filter((c) => c.tela === aba);
  const videos = [];
  const semLeitura = [];
  const nomes = {};
  canais.forEach((c) => {
    const f = fontes[`yt:${c.id}`];
    if (!f) { semLeitura.push(c.nome || c.entrada || c.id); return; }
    f.itens.forEach((v) => videos.push({ ...v, canal: v.canal || c.nome, canalId: c.id }));
    if (f.itens[0] && f.itens[0].canal) nomes[c.id] = f.itens[0].canal;
  });
  videos.sort((a, b) => msDe(b.publicado) - msDe(a.publicado));
  // no máximo 6 de um mesmo canal na aba (a UOL posta muito e engoliria os outros)
  const porCanal = {};
  const escolhidos = videos.filter((v) => { porCanal[v.canalId] = (porCanal[v.canalId] || 0) + 1; return porCanal[v.canalId] <= 6; }).slice(0, MAX_VIDEOS_POR_ABA);
  return {
    ok: true, aba, atualizadoEm: new Date(agoraMs).toISOString(),
    videos: escolhidos,
    canais: canais.map((c) => nomes[c.id] || c.nome || c.entrada || c.id),
    avisos: semLeitura.length ? [`Ainda lendo: ${semLeitura.join(', ')}.`] : [],
  };
}

/** Notícias de cada ativo da carteira (até 6 por ativo, das últimas leituras). */
export function montarTelaAtivos(config, fontes, { agoraMs = Date.now() } = {}) {
  const ativos = {};
  (config.ativos || []).forEach((a) => {
    const t = String(a.ticker || '').toUpperCase();
    const f = fontes[`at:${t}`];
    if (f) ativos[t] = f.itens.slice().sort((x, y) => msDe(y.data) - msDe(x.data)).slice(0, MAX_POR_ATIVO);
  });
  return { ok: true, atualizadoEm: new Date(agoraMs).toISOString(), ativos };
}
