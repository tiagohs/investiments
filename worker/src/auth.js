/**
 * auth.js - verificação da sessão "s1" do site, a MESMA que o Apps Script emite (Auth.gs!criarTokenSessao_):
 *   s1.<payload base64url sem "=">.<HMAC-SHA256(payload, segredo) base64url sem "=">, payload = {"email","iat","exp"}.
 * O segredo é o da propriedade do script (Auth.gs!segredoSessao_), guardado no Worker como `wrangler secret` (SESSAO_SEGREDO).
 * A lista de e-mails segue as regras do Auth.gs!emailsAutorizados_ (separados por vírgula, ponto e vírgula ou espaço;
 * sem lista, ninguém entra). Também a assinatura das publicações vindas do Apps Script (PUBLICACAO_SEGREDO).
 */

const codificador = new TextEncoder();
const chavesHmac = new Map();

export function base64UrlSemPadding(bytes) {
  let s = '';
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64ParaBytes(b64) {
  let s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function chaveHmac(segredo) {
  if (!chavesHmac.has(segredo)) {
    chavesHmac.set(segredo, crypto.subtle.importKey('raw', codificador.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  }
  return chavesHmac.get(segredo);
}

export async function hmacBase64Url(segredo, dados) {
  const assinatura = await crypto.subtle.sign('HMAC', await chaveHmac(segredo), codificador.encode(String(dados)));
  return base64UrlSemPadding(new Uint8Array(assinatura));
}

/** Comparação sem sair no 1º caractere diferente. */
export function iguais(a, b) {
  const x = String(a); const y = String(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) dif |= x.charCodeAt(i) ^ (y.charCodeAt(i) || 0);
  return dif === 0;
}

export function listaDeEmails(bruto) {
  const out = [];
  String(bruto || '').split(/[,;\s]+/).forEach((e) => { const v = e.trim().toLowerCase(); if (v && !out.includes(v)) out.push(v); });
  return out;
}

/** { ok: true, email } ou { ok: false, erro }. */
export async function verificarSessao(token, { segredo, emails, agoraMs = Date.now() }) {
  if (!segredo) return { ok: false, erro: 'Worker sem SESSAO_SEGREDO' };
  const partes = String(token || '').split('.');
  if (partes.length !== 3 || partes[0] !== 's1') return { ok: false, erro: 'sessão inválida' };
  const esperada = await hmacBase64Url(segredo, partes[1]);
  if (!iguais(esperada, partes[2])) return { ok: false, erro: 'sessão inválida (assinatura)' };
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(base64ParaBytes(partes[1]))); } catch (e) { return { ok: false, erro: 'sessão inválida' }; }
  if (!(Number(payload.exp) * 1000 > agoraMs)) return { ok: false, erro: 'sessão expirada' };
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || !listaDeEmails(emails).includes(email)) return { ok: false, erro: 'e-mail não autorizado' };
  return { ok: true, email };
}

/** Janela do carimbo de uma publicação (contra repetir uma publicação antiga). */
export const JANELA_PUBLICACAO_MS = 10 * 60 * 1000;

/** Publicação: X-Assinatura = HMAC(PUBLICACAO_SEGREDO, carimbo + "." + corpo); carimbo em ms, no máximo 10 min de diferença. */
export async function verificarPublicacao(corpo, { carimbo, assinatura, segredo, agoraMs = Date.now() }) {
  if (!segredo) return { ok: false, erro: 'Worker sem PUBLICACAO_SEGREDO' };
  const c = Number(carimbo);
  if (!Number.isFinite(c) || Math.abs(agoraMs - c) > JANELA_PUBLICACAO_MS) return { ok: false, erro: 'carimbo fora da janela' };
  const esperada = await hmacBase64Url(segredo, `${carimbo}.${corpo}`);
  if (!iguais(esperada, assinatura || '')) return { ok: false, erro: 'assinatura inválida' };
  return { ok: true };
}
