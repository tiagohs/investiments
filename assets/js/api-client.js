/**
 * api-client.js — pure JS client for the Apps Script Web App. No DOM, no
 * UI — every function here takes plain data in and returns plain data
 * out, so it can be unit-tested by mocking `fetch` and reused by any
 * page/shell module without depending on how the page renders results.
 *
 * Mirrors the backend contract from apps-script/Router.gs: every
 * response is `{ ok: true, ... }` or `{ ok: false, etapa, erro }`. A
 * network failure (fetch throwing, e.g. offline) is normalized into
 * that same `{ ok: false, etapa: 'network', erro }` shape, so callers
 * only ever need to check `response.ok` once.
 */

import { APPS_SCRIPT_URL } from './config.js';

/**
 * Low-level request helper — GET for read actions, POST (form-encoded,
 * matching what Router.gs/doPost expects) for write actions.
 */
async function request(method, action, token, params = {}) {
  try {
    let response;
    if (method === 'GET') {
      const url = new URL(APPS_SCRIPT_URL);
      url.searchParams.set('action', action);
      url.searchParams.set('token', token);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      response = await fetch(url.toString(), { method: 'GET' });
    } else {
      const body = new URLSearchParams({ action, token, ...params });
      response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body });
    }
    return await response.json();
  } catch (err) {
    return { ok: false, etapa: 'network', erro: String(err) };
  }
}

/** Confirms login + Apps Script + spreadsheet connection (action=ping). */
export async function ping(token) {
  return request('GET', 'ping', token);
}

/** Last row of "Registro de Controle" — feeds the sync status badge (action=syncStatus). */
export async function getSyncStatus(token) {
  return request('GET', 'syncStatus', token);
}

/**
 * Chamada única da tela Início (action=home) — desde 12/09/2026 devolve
 * patrimônio+índices+câmbio, a série histórica e a grade "Meus Ativos"
 * juntos, pra evitar 3 chamadas separadas no carregamento da página. See
 * apps-script/Home.gs (handleHome/montarHome_) for exactly which cells
 * each field comes from and how as 3 seções são montadas.
 *
 * Cada seção (home/historico/ativos) roda no seu próprio try/catch no
 * back-end: se uma falhar, as outras ainda voltam — o problema aparece
 * em `avisos` (por seção) em vez de derrubar a resposta inteira. Front-end
 * deve tratar cada campo (`patrimonio`/`historico`/`ativos`) como
 * possivelmente ausente, não só a resposta como um todo.
 *
 * @return {Promise<Object>} `{ ok, patrimonio: { total, longoPrazo,
 *   rendaEmergencial, porClasse: { acoes, fiis, rendaFixa, acoesEua } },
 *   indices: { ibovespa, ifix, spx }, cambio: { usd, eur },
 *   historico: Array<{ data, patrimonio, longoPrazo, rendaEmergencial,
 *   indiceCdi, indiceSelic, ibovespa }>, ativos: Array<Object>,
 *   avisos?: { home?, historico?, ativos? } }` or
 *   `{ ok:false, etapa, erro }`. As ações "historico_inicio" e
 *   "meusAtivos" continuam existindo à parte no Router.gs, pra quem
 *   precisar buscar só um pedaço sem os outros dois.
 */
export async function getHome(token) {
  return request('GET', 'home', token);
}

/**
 * Runs "sincronizarAgora", automatically resuming rounds until
 * `naoProcessados` is empty (or a round fails outright) — this is the
 * round-accumulation logic that used to live inside teste.html's
 * `executarSincronizacao`.
 *
 * @param {string} token
 * @param {Object} [options]
 * @param {Array<string>|null} [options.tickers] - null = all 29 assets
 * @param {Object|null} [options.testOptions] - test-mode only, forwarded as
 *   `opcoesTeste` (see Sync.gs): { abaHistoricoNome, tickersParaFalhar }
 * @param {(round: Object) => void} [options.onRound] - called after each
 *   round with { round, result, accumulatedOk, accumulatedFailed }, so a
 *   page can show progress without waiting for the whole thing to finish
 * @return {Promise<Object>} accumulated result across all rounds
 */
export async function syncNow(token, { tickers = null, testOptions = null, onRound = null } = {}) {
  let pending = tickers;
  let round = 0;
  let lastResult = null;
  const accumulatedOk = [];
  const accumulatedFailed = [];

  while (true) {
    round += 1;
    const params = {};
    if (pending) params.tickers = JSON.stringify(pending);
    if (testOptions) params.opcoesTeste = JSON.stringify(testOptions);

    const data = await request('POST', 'sincronizarAgora', token, params);
    if (!data.ok) {
      return {
        ok: false,
        step: data.etapa || null,
        error: data.erro || 'unknown error',
        rounds: round,
        okList: accumulatedOk,
        failed: accumulatedFailed,
      };
    }

    lastResult = data.resultado;
    const notProcessed = lastResult.naoProcessados || [];
    accumulatedOk.push(...(lastResult.ok || []));
    accumulatedFailed.push(...(lastResult.falharam || []));

    if (onRound) {
      onRound({
        round,
        result: lastResult,
        accumulatedOk: [...accumulatedOk],
        accumulatedFailed: [...accumulatedFailed],
      });
    }

    if (notProcessed.length === 0) break;
    pending = notProcessed;
  }

  return {
    ok: true,
    status: lastResult.status,
    rounds: round,
    okList: accumulatedOk,
    failed: accumulatedFailed,
    gaps: lastResult.lacunas || [],
  };
}

/**
 * Runs "importarTransacoesB3" — a single batch, no round logic (unlike
 * syncNow, a batch import never partially times out and resumes).
 *
 * @param {string} token
 * @param {Array<Object>} transactions - see ImportB3.gs header for the
 *   expected shape: { ticker, data, tipo, preco, qtd, taxa }
 * @param {Object|null} [testOptions] - test-mode only: { abaTransacoesNome }
 */
export async function importB3Transactions(token, transactions, testOptions = null) {
  const params = { transacoes: JSON.stringify(transactions) };
  if (testOptions) params.opcoesTeste = JSON.stringify(testOptions);

  const data = await request('POST', 'importarTransacoesB3', token, params);
  if (!data.ok) {
    return { ok: false, step: data.etapa || null, error: data.erro || 'unknown error' };
  }
  return { ok: true, written: data.resultado.gravadas, rejected: data.resultado.rejeitadas };
}
