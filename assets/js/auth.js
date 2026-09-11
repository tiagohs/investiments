/**
 * auth.js — manages the Google Identity Services token for the session.
 * No DOM, no Google library calls here — this only stores/reads/decodes
 * the token; the actual "Sign in with Google" button and its callback
 * live in shell.js (item 8), which calls setToken() once GIS hands it a
 * credential.
 *
 * Storage strategy (matches docs/plano-implementacao.html, "Autenticação
 * no front-end"): an in-memory variable as the source of truth for the
 * current page load, mirrored into sessionStorage so a plain F5 doesn't
 * force a new login — but it's gone once the tab closes, which is fine
 * for a single-user personal app. sessionStorage access is best-effort:
 * wrapped in try/catch (private browsing, blocked site data, or simply
 * not existing outside a browser all degrade to "no persistence" instead
 * of throwing).
 */

const STORAGE_KEY = 'investiments_auth_token';

let memoryToken = null;

function readStoredToken() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (token) {
      sessionStorage.setItem(STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private mode, blocked site data, quota, etc. — degrade silently.
  }
}

/**
 * Decodes a JWT's payload without verifying the signature — good enough
 * to read `exp` client-side. Verification already happened server-side
 * (Auth.gs, verificarToken, checks the token against Google directly);
 * this is only ever used to decide whether it's still worth sending.
 */
export function decodeTokenPayload(token) {
  try {
    const payloadSegment = token.split('.')[1];
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function'
      ? atob(normalized)
      : Buffer.from(normalized, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** True if the token is missing, malformed, or past its `exp` claim. */
export function isTokenExpired(token) {
  if (!token) return true;
  const payload = decodeTokenPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() >= payload.exp * 1000;
}

/** Called once Google Identity Services hands back a credential. */
export function setToken(token) {
  memoryToken = token;
  writeStoredToken(token);
}

/**
 * Current token, or null if there isn't one / it expired. Falls back to
 * sessionStorage on the first call after a page load (memoryToken starts
 * empty on every navigation, since this isn't a single-page app).
 * Auto-clears an expired token instead of handing it to a caller that
 * would just get rejected by the Apps Script anyway.
 */
export function getToken() {
  if (!memoryToken) {
    memoryToken = readStoredToken();
  }
  if (memoryToken && isTokenExpired(memoryToken)) {
    clearToken();
    return null;
  }
  return memoryToken;
}

/** Logout, or cleanup after a rejected/expired token. */
export function clearToken() {
  memoryToken = null;
  writeStoredToken(null);
}

export function hasValidToken() {
  return getToken() !== null;
}
