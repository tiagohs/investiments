/**
 * Worker de leitura - 29/10/2026 (docs/arquitetura-leitura-cloudflare.md).
 * Só entrega o que o Apps Script publicou (ADR-02): nenhuma regra de negócio aqui.
 *
 *   GET  /v1/tela/:acao?params   resposta publicada da tela (Authorization: Bearer s1...), gzip, ETag = hash, 304 se igual
 *   GET  /v1/estado              idade e tamanho de cada publicação (saúde, RF-10)
 *   GET  /v1/intradia?simbolos=  gráfico do dia direto do Yahoo (29/10/2026, intradia.js) - o resto do app não muda
 *   POST /v1/publicar            lote do Apps Script, assinado (X-Carimbo, X-Assinatura) - ADR-06
 *   cron (a cada 5 min)          telas noticias* (30/10/2026, noticias/coleta.js, docs/noticias.md) - mesmas linhas do D1
 *
 * Ambiente: DB (D1), SESSAO_SEGREDO, PUBLICACAO_SEGREDO e EMAILS_AUTORIZADOS (secrets), ORIGENS (vars do wrangler.toml).
 */
import { verificarSessao, verificarPublicacao, base64ParaBytes } from './auth.js';
import { chaveLeitura, ACAO_VALIDA, instanteDaGeracao } from '../../assets/js/leitura-chave.js';
import { intradiaWorker } from './intradia.js';
import { coletarNoticias } from './noticias/coleta.js';

/** Teto de um corpo comprimido: a linha do D1 aceita 2.000.000 bytes no total. */
export const MAX_CORPO_BYTES = 1900000;
const CHAVE_VALIDA = /^[A-Za-z][A-Za-z0-9_]{0,63}(\?[A-Za-z0-9_.~%=&-]{1,300})?$/;
const HASH_VALIDO = /^[A-Za-z0-9_-]{8,64}$/;

function origensPermitidas(env) {
  return String(env.ORIGENS || '').split(',').map((o) => o.trim()).filter(Boolean);
}

function cabecalhosCors(request, env) {
  const origem = request.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (origem && origensPermitidas(env).includes(origem)) {
    h['Access-Control-Allow-Origin'] = origem;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, If-None-Match, Content-Type';
    h['Access-Control-Expose-Headers'] = 'ETag, X-Geracao, X-Publicado-Em';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** O D1 pode devolver BLOB como ArrayBuffer, Uint8Array ou lista de números: sempre Uint8Array. */
export function paraBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return Uint8Array.from(v);
  if (v && v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return new Uint8Array(0);
}

async function autenticar(request, env) {
  const cab = request.headers.get('Authorization') || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
  return verificarSessao(token, { segredo: env.SESSAO_SEGREDO, emails: env.EMAILS_AUTORIZADOS });
}

async function lerTela(request, env, cors, acao, url) {
  if (!ACAO_VALIDA.test(acao)) return json({ ok: false, erro: 'ação inválida' }, 400, cors);
  const params = {};
  url.searchParams.forEach((v, k) => { params[k] = v; });
  const chave = chaveLeitura(acao, params);
  const linha = await env.DB.prepare('SELECT geracao, hash, publicado_em, corpo FROM publicacao WHERE chave = ?').bind(chave).first();
  if (!linha) return json({ ok: false, erro: 'não publicado', chave }, 404, cors);
  const etag = `"${linha.hash}"`;
  const comuns = { ...cors, ETag: etag, 'X-Geracao': linha.geracao, 'X-Publicado-Em': linha.publicado_em, 'Cache-Control': 'private, no-cache' };
  const pedida = request.headers.get('If-None-Match');
  if (pedida && pedida.split(',').map((s) => s.trim()).includes(etag)) return new Response(null, { status: 304, headers: comuns });
  // o corpo já está em gzip: vai como está (sem descomprimir aqui, ADR-03)
  return new Response(paraBytes(linha.corpo), {
    status: 200,
    headers: { ...comuns, 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip' },
    encodeBody: 'manual',
  });
}

async function lerEstado(env, cors) {
  const linhas = await env.DB.prepare('SELECT chave, geracao, hash, publicado_em, bytes FROM publicacao ORDER BY chave').all();
  const estado = await env.DB.prepare('SELECT chave, valor FROM estado').all();
  return json({ ok: true, publicacoes: linhas.results || [], estado: Object.fromEntries((estado.results || []).map((e) => [e.chave, e.valor])) }, 200, cors);
}

/** Valida e grava um lote: { geracao, itens: [{ chave, hash, bytes, gz (base64) }] }. Exportada para os testes. */
export async function gravarLote(env, lote, agoraIso) {
  if (!lote || typeof lote.geracao !== 'string' || !Array.isArray(lote.itens)) return { ok: false, erro: 'lote inválido' };
  const geracaoMs = instanteDaGeracao(lote.geracao);
  const comandos = [];
  const recusadas = [];
  for (const it of lote.itens) {
    if (!it || !CHAVE_VALIDA.test(String(it.chave)) || !HASH_VALIDO.test(String(it.hash))) { recusadas.push({ chave: it && it.chave, motivo: 'chave ou hash inválido' }); continue; }
    let corpo;
    try { corpo = base64ParaBytes(it.gz); } catch (e) { recusadas.push({ chave: it.chave, motivo: 'gzip inválido' }); continue; }
    if (corpo.length < 18 || corpo[0] !== 0x1f || corpo[1] !== 0x8b) { recusadas.push({ chave: it.chave, motivo: 'não é gzip' }); continue; }
    if (corpo.length > MAX_CORPO_BYTES) { recusadas.push({ chave: it.chave, motivo: `corpo de ${corpo.length} bytes (máximo ${MAX_CORPO_BYTES})` }); continue; }
    comandos.push(env.DB.prepare(
      `INSERT INTO publicacao (chave, geracao, geracao_ms, hash, publicado_em, bytes, corpo) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET geracao = excluded.geracao, geracao_ms = excluded.geracao_ms, hash = excluded.hash,
         publicado_em = excluded.publicado_em, bytes = excluded.bytes, corpo = excluded.corpo
       WHERE excluded.geracao_ms >= publicacao.geracao_ms`,
    ).bind(String(it.chave), lote.geracao, geracaoMs, String(it.hash), agoraIso, Number(it.bytes) || corpo.length, corpo.buffer)); // D1: ArrayBuffer vira BLOB
  }
  // 29/10/2026: telas que não mudaram - o Apps Script confirma (chave + hash) que o corpo guardado vale pra esta geração.
  // Só vale se o hash for o mesmo (o corpo é aquele) e a geração for mais nova.
  const confirmar = Array.isArray(lote.confirmar) ? lote.confirmar : [];
  let confirmadas = 0;
  for (const c of confirmar) {
    if (!c || !CHAVE_VALIDA.test(String(c.chave)) || !HASH_VALIDO.test(String(c.hash))) { recusadas.push({ chave: c && c.chave, motivo: 'confirmação inválida' }); continue; }
    confirmadas++;
    comandos.push(env.DB.prepare(
      'UPDATE publicacao SET geracao = ?, geracao_ms = ?, publicado_em = ? WHERE chave = ? AND hash = ? AND geracao_ms <= ?',
    ).bind(lote.geracao, geracaoMs, agoraIso, String(c.chave), String(c.hash), geracaoMs));
  }
  comandos.push(env.DB.prepare(
    `INSERT INTO estado (chave, valor) VALUES ('ultima_publicacao', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
  ).bind(JSON.stringify({ em: agoraIso, geracao: lote.geracao, itens: lote.itens.length, confirmadas, recusadas: recusadas.length })));
  await env.DB.batch(comandos);
  return { ok: recusadas.length === 0, gravadas: comandos.length - 1 - confirmadas, confirmadas, recusadas };
}

async function publicar(request, env, cors) {
  const corpo = await request.text();
  const v = await verificarPublicacao(corpo, {
    carimbo: request.headers.get('X-Carimbo'), assinatura: request.headers.get('X-Assinatura'), segredo: env.PUBLICACAO_SEGREDO,
  });
  if (!v.ok) return json({ ok: false, erro: v.erro }, 401, cors);
  let lote;
  try { lote = JSON.parse(corpo); } catch (e) { return json({ ok: false, erro: 'JSON inválido' }, 400, cors); }
  const r = await gravarLote(env, lote, new Date().toISOString());
  return json(r, r.erro ? 400 : 200, cors);
}

export default {
  async fetch(request, env) {
    const cors = cabecalhosCors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/v1/publicar') return await publicar(request, env, cors);
      if (request.method === 'GET' && (url.pathname.startsWith('/v1/tela/') || url.pathname === '/v1/estado' || url.pathname === '/v1/intradia')) {
        const sessao = await autenticar(request, env);
        if (!sessao.ok) return json({ ok: false, etapa: 'autenticação', erro: sessao.erro }, 401, cors);
        if (url.pathname === '/v1/intradia') return json(await intradiaWorker(String(url.searchParams.get('simbolos') || '').split(',')), 200, cors);
        if (url.pathname === '/v1/estado') return await lerEstado(env, cors);
        return await lerTela(request, env, cors, decodeURIComponent(url.pathname.slice('/v1/tela/'.length)), url);
      }
      return json({ ok: false, erro: 'rota não encontrada' }, 404, cors);
    } catch (e) {
      return json({ ok: false, erro: 'erro interno' }, 500, cors);
    }
  },
  // 30/10/2026: tela de Notícias - o cron busca as fontes (uma fatia por disparo) e publica no D1
  async scheduled(event, env, ctx) {
    ctx.waitUntil(coletarNoticias(env, { agoraMs: event.scheduledTime || Date.now() }).catch(() => null));
  },
};
