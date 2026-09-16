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

/** Up to `limite` most recent rows of "Registro de Controle" (default 20) —
 * feeds the full sync history list in the popover (action=syncHistorico),
 * as opposed to getSyncStatus() above which only returns the latest one. */
export async function getSyncHistorico(token, limite = 20) {
  return request('GET', 'syncHistorico', token, { limite });
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
 * Runs "sincronizarRendaFixaEIndices" (action=sincronizarRendaFixaEIndices
 * — ver apps-script/BackfillIndices.gs!handleSincronizarRendaFixaEIndices).
 * Chamada de UMA rodada só (sem loop de retomada - Renda Fixa/Índices não
 * tem o mesmo mecanismo de "naoProcessados" de syncNow(), incremental já
 * é suficiente pra caber numa única execução).
 *
 * 14/09/2026: ação SEPARADA de syncNow() de propósito - as duas rodando
 * dentro da MESMA requisição (tentado e revertido no mesmo dia) estourava
 * o limite de execução do Apps Script sempre que havia backlog, matando
 * a sincronização inteira em silêncio. shell.js!setupSyncNowButton chama
 * as duas em sequência, cada uma na sua própria requisição.
 *
 * @param {string} token
 * @return {Promise<Object>} `{ ok, resultado: { status, detalhe } }` or
 *   `{ ok:false, etapa, erro }`.
 */
export async function syncRendaFixaEIndices(token) {
  return request('POST', 'sincronizarRendaFixaEIndices', token);
}

/**
 * Chamada única da tela Distribuições e Metas (action=distribuicoesMetas)
 * — ver apps-script/DistribuicoesMetas.gs pra estrutura completa de
 * cada fatia. Além de `metas`, hoje também traz `objetivos` (split
 * entre classes de ativo), `radar` (as 3 tabelas de ranking),
 * `splitsInternos` (split dentro de Ações e dentro de FIIs, mostrado
 * acima da tabela do Radar) e `linksRecomendados` (os 4 links de
 * "carteira recomendada" da Suno) — qualquer seção que falhar aparece
 * em `avisos` em vez de quebrar a resposta inteira.
 *
 * @return {Promise<Object>} `{ ok, metas: { rendaPassiva: { meta,
 *   mediaUlt12Meses, percentualAtingido }, patrimonio: { extra,
 *   percentualReinvestimento, rendimentoMedio, meta, carteiraAtual,
 *   percentualAtingido }, rendaEmergencial: { mediaGastos, meses, meta,
 *   carteiraAtual, percentualAtingido, atingida } }, objetivos, radar,
 *   splitsInternos: { acoes: { itens, total }, fiis: { itens, total } },
 *   linksRecomendados: { acoesDividendos, acoesValor, acoesInternacional,
 *   fiis } (cada um `{ texto, url } | null`), avisos? }` or
 *   `{ ok:false, etapa, erro }`.
 */
export async function getDistribuicoesMetas(token) {
  return request('GET', 'distribuicoesMetas', token);
}

/**
 * Grava a meta mensal de Renda Passiva (action=salvarMetaRendaPassiva).
 * @param {string} token
 * @param {number} valor - R$ por mês.
 */
export async function salvarMetaRendaPassiva(token, valor) {
  return request('POST', 'salvarMetaRendaPassiva', token, { valor });
}

/**
 * Grava um ou mais dos 3 campos manuais do bloco de Patrimônio
 * (action=salvarMetaPatrimonio) — passe só o(s) que mudou(aram), os
 * outros ficam como estavam.
 * @param {string} token
 * @param {{extra?: number, percentualReinvestimento?: number, rendimentoMedio?: number}} campos
 *   percentualReinvestimento e rendimentoMedio são frações 0-1 (0.25 = 25%).
 */
export async function salvarMetaPatrimonio(token, campos) {
  return request('POST', 'salvarMetaPatrimonio', token, campos);
}

/**
 * Grava a quantidade de meses de reserva desejados pra Renda Emergencial
 * (action=salvarMesesRendaEmergencial).
 * @param {string} token
 * @param {number} meses
 */
export async function salvarMesesRendaEmergencial(token, meses) {
  return request('POST', 'salvarMesesRendaEmergencial', token, { meses });
}

/**
 * Grava os "% desejado" de um bloco inteiro de Objetivos da Carteira
 * (action=salvarObjetivosCarteira) — sempre o bloco todo de uma vez, na
 * mesma ordem em que getDistribuicoesMetas devolveu os tipos desse
 * bloco (o back-end grava por posição, não por nome).
 * @param {string} token
 * @param {'geral'|'rendaFixa'} bloco
 * @param {number[]} percentuais - frações 0-1, uma por tipo do bloco, devem somar ~1.
 */
export async function salvarObjetivosCarteira(token, bloco, percentuais) {
  return request('POST', 'salvarObjetivosCarteira', token, { bloco, percentuais: percentuais.join(',') });
}

/**
 * Grava os "% desejado" de um dos 2 splits internos por classe de
 * ativo (action=salvarSplitInterno) — Ações (Dividendos x Ações
 * Internacionais) ou FIIs (Tijolo x Papel x Híbrido), mostrados acima
 * da tabela do Radar. Mesmo formato de salvarObjetivosCarteira: bloco
 * inteiro de uma vez, na mesma ordem em que getDistribuicoesMetas
 * devolveu os tipos desse bloco.
 * @param {string} token
 * @param {'acoes'|'fiis'} bloco
 * @param {number[]} percentuais - frações 0-1, uma por tipo do bloco, devem somar ~1.
 */
export async function salvarSplitInterno(token, bloco, percentuais) {
  return request('POST', 'salvarSplitInterno', token, { bloco, percentuais: percentuais.join(',') });
}

/**
 * Grava os 3 campos manuais de UM ticker do Radar de oportunidades
 * (action=salvarRadarItem): Ranking, Preço-teto e % desejado. "linha" e
 * "ativo" vêm do próprio item devolvido por getDistribuicoesMetas
 * (resposta.radar.<tabela>.itens[i].linha) — o back-end confere que o
 * ativo ainda é o mesmo nessa linha antes de gravar.
 * @param {string} token
 * @param {'acoesNacionais'|'acoesInternacionais'|'fiis'} tabela
 * @param {{linha: number, ativo: string, ranking: number, precoTeto: number, percentualDesejado: number}} item
 */
export async function salvarRadarItem(token, tabela, item) {
  return request('POST', 'salvarRadarItem', token, {
    tabela,
    linha: item.linha,
    ativo: item.ativo,
    ranking: item.ranking,
    precoTeto: item.precoTeto,
    percentualDesejado: item.percentualDesejado,
  });
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
