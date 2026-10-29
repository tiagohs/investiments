/**
 * GET /v1/intradia?simbolos=IBOV,acoes:PETR4,... - 29/10/2026 (Tiago: gráficos do dia em fila no Apps Script, 2-12 s).
 * O Worker pede o gráfico público do Yahoo direto (velas de 5 min) e devolve o MESMO formato do Apps Script
 * (Intradia.gs): { ok, resultado: { CHAVE: serie | null }, falhas: [CHAVE] }. `falhas` = o Yahoo não respondeu (bloqueio,
 * erro, demora) - o site pede essas ao Apps Script. Memória do isolate guarda 5 min (o Cache API não vale no workers.dev).
 */
import { simboloYahooIntradia, serieIntradiaDoYahoo } from '../../assets/js/intradia-yahoo.js';

export const INTRADIA_WORKER_MAX = 15; // símbolos por pedido (10 ms de CPU no plano grátis: ~15 JSONs do Yahoo cabem)
const TTL_MS = 5 * 60 * 1000;
const TTL_NEGATIVO_MS = 3 * 60 * 1000;
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const memoria = new Map(); // chave -> { serie, ate }

export function esquecerIntradiaWorker() { memoria.clear(); }

async function buscarUm(simbolo, fetchImpl) {
  for (const host of HOSTS) {
    try {
      const r = await fetchImpl(`https://${host}/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1d&interval=5m&includePrePost=false`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.status === 200) return { serie: serieIntradiaDoYahoo(await r.json()), respondeu: true };
      if (r.status === 404) return { serie: null, respondeu: true }; // o Yahoo respondeu: não tem esse símbolo
    } catch (e) { /* tenta o outro host */ }
  }
  return { serie: null, respondeu: false };
}

export async function intradiaWorker(chaves, { fetchImpl = fetch, agoraMs = Date.now() } = {}) {
  const lista = [...new Set(chaves.map((c) => String(c || '').trim()).filter(Boolean))].slice(0, INTRADIA_WORKER_MAX);
  const resultado = {};
  const falhas = [];
  await Promise.all(lista.map(async (c) => {
    const simbolo = simboloYahooIntradia(c);
    if (!simbolo) { resultado[c] = null; return; }
    const guardado = memoria.get(c);
    if (guardado && guardado.ate > agoraMs) { resultado[c] = guardado.serie; return; }
    const r = await buscarUm(simbolo, fetchImpl);
    if (!r.respondeu) { falhas.push(c); return; }
    resultado[c] = r.serie;
    memoria.set(c, { serie: r.serie, ate: agoraMs + (r.serie ? TTL_MS : TTL_NEGATIVO_MS) });
  }));
  return { ok: true, resultado, falhas };
}
