/**
 * noticias-agora.js - 30/10/2026: o "Atualizar dados" da tela de Notícias buscando nas fontes (docs/noticias.md, RF-10).
 * Fora do api-client.js de propósito: só a tela de Notícias usa, e o api-client entra no carregamento de todas as telas.
 */
import { APPS_SCRIPT_URL, LEITURA_URL } from './config.js';

/**
 * 30/10/2026 ("Atualizar" da tela de Notícias): o Worker busca na hora o tempo real e os vídeos da aba aberta
 * (POST /v1/noticias/agora; 1 a cada 45 s). soGoogle: só junta as notícias do Google que o Apps Script acabou de publicar.
 */
export async function forcarNoticias(token, { aba = 'noticias', soGoogle = false, tempoMaximoMs = 10000 } = {}) {
  if (!LEITURA_URL || !String(token || '').startsWith('s1.') || typeof fetch !== 'function') return { ok: false, erro: 'sem Worker' };
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const relogio = ctrl ? setTimeout(() => ctrl.abort(), tempoMaximoMs) : null;
  try {
    const q = new URLSearchParams({ aba, ...(soGoogle ? { so: 'google' } : {}) });
    const res = await fetch(`${LEITURA_URL}/v1/noticias/agora?${q}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, ...(ctrl ? { signal: ctrl.signal } : {}) });
    return res.status === 200 ? JSON.parse(await res.text()) : { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, erro: String((e && e.message) || e) };
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

const CHAVE_GOOGLE_PEDIDO = 'investiments_noticias_google_pedido_em';
export const INTERVALO_GOOGLE_AGORA_MS = 5 * 60 * 1000;
/**
 * Manchetes e notícias dos ativos (Google, que só responde ao Apps Script): pede ao Apps Script a publicação de
 * `noticiasGoogle` sem o cache - no máximo 1 vez a cada 5 min por aparelho. Devolve a resposta (ou null quando não pediu).
 */
export async function pedirNoticiasGoogleAgora(token) {
  if (!token || typeof fetch !== 'function') return null;
  try {
    const ultimo = Number(typeof localStorage !== 'undefined' && localStorage.getItem(CHAVE_GOOGLE_PEDIDO)) || 0;
    if (Date.now() - ultimo < INTERVALO_GOOGLE_AGORA_MS) return null;
    localStorage.setItem(CHAVE_GOOGLE_PEDIDO, String(Date.now()));
  } catch (e) { /* sem armazenamento: segue (o Apps Script também segura: 1 a cada 4 min) */ }
  try {
    const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: new URLSearchParams({ action: 'publicarLeitura', token, familias: 'noticiasGoogle', forcarNoticias: '1' }) });
    return JSON.parse(await r.text());
  } catch (e) { return null; }
}

