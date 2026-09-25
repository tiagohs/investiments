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
import { clearToken } from './auth.js';

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
    const json = await response.json();
    // 25/09/2026: sessão recusada (expirou/foi encerrada) - esquece o token,
    // e a próxima página já manda pro login em vez de repetir o erro.
    if (json && json.ok === false && json.etapa === 'autenticação') clearToken();
    return json;
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
 * 25/09/2026: botões "Proventos (FNet)" e "Informes dos FIIs" do popover
 * "Registro de Controle" (shell.js!setupSyncNowButton) - forçam na hora as
 * rotinas que os gatilhos diários rodam ~12h/~12h20 (ver
 * apps-script/FnetProventos.gs e FnetInformesFii.gs). Uma rodada só; o FNet
 * é lento, então cada uma pode levar alguns minutos.
 *
 * @param {string} token
 * @return {Promise<Object>} `{ ok, resultado: { status, detalhe } }` or
 *   `{ ok:false, etapa, erro }`.
 */
export async function syncProventosFnet(token) {
  return request('POST', 'sincronizarProventosFnet', token);
}

export async function syncInformesFnet(token) {
  return request('POST', 'sincronizarInformesFnet', token);
}

/**
 * "Limpar cache" (botão no popover "Registro de Controle", topo do app,
 * 17/09/2026 - ver apps-script/HistoricoInicio.gs!limparCacheHistoricoInicio_
 * e shell.js!setupLimparCacheButton). Apaga o cache (CacheService, TTL de
 * 6h) da série combinada que alimenta o gráfico de Rentabilidade - existe
 * pra um caso específico: um valor corrigido DIRETO NA CÉLULA da planilha
 * (sem apagar/inserir linha) não muda a chave do cache sozinho, então o
 * app continua servindo o resultado velho por até 6h até esse botão ser
 * usado (ou o TTL expirar sozinho).
 *
 * @param {string} token
 * @return {Promise<Object>} `{ ok, resultado: { limpou, chave,
 *   pedacosRemovidos? } }` or `{ ok:false, etapa, erro }`.
 */
export async function limparCacheHistorico(token) {
  return request('POST', 'limparCacheHistorico', token);
}

/**
 * Histórico diário de PREÇO de 1 ticker só, na moeda nativa do ativo
 * (action=historicoAtivo) — alimenta o gráfico do popover "Ver gráfico"
 * de cada .ativo-card em Meus Ativos (Início). Sob demanda: só chamado
 * quando o popover de um card abre pela 1ª vez (ver inicio.js!wireGraficoAtivo),
 * não faz parte da chamada única de getHome().
 *
 * @param {string} token
 * @param {string} ticker - mesmo texto exato de ativo.ticker (Auxiliar_ativos col. B).
 * @return {Promise<Object>} `{ ok, resultado: { ticker, serie: [{ data:
 *   'yyyy-MM-dd', preco: number }] } }` or `{ ok:false, etapa, erro }`.
 */
export async function getHistoricoAtivo(token, ticker) {
  return request('GET', 'historicoAtivo', token, { ticker });
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
 * Chamada única da tela Carteiras > Home consolidada (action=carteirasHome)
 * — ver apps-script/CarteirasHome.gs!montarCarteirasHome_. Devolve o
 * patrimônio total em Carteiras e um card por classe (Ações/FIIs/Ações
 * Internacionais/Renda Fixa) com totalAtualizado/totalInvestido/
 * lucroPrejuizo/rentabilidade/percentualDoPatrimonio/quantidadeAtivos,
 * todos em BRL (18/09/2026: o card de Ações Internacionais também traz
 * totalAtualizadoUsd/totalInvestidoUsd/lucroPrejuizoUsd/cambioUsd, pra
 * montar o "US$ X (R$ Y)" sem chamada extra). Não traz índices/câmbio
 * nem a série histórica pros gráficos — a página de Carteiras > Home
 * busca esses dois pedaços com getHome() (mesmos campos indices/cambio/
 * historico que a Início já usa) em paralelo, sem endpoint novo.
 *
 * @return {Promise<Object>} `{ ok, carteiras: { patrimonioTotal, cards:
 *   Array<{ nome, totalAtualizado, percentualDoPatrimonio, totalInvestido,
 *   lucroPrejuizo, rentabilidade, quantidadeAtivos, totalAtualizadoUsd?,
 *   totalInvestidoUsd?, lucroPrejuizoUsd?, cambioUsd? }> } }` or
 *   `{ ok:false, etapa, erro }`.
 */
export async function getCarteirasHome(token) {
  return request('GET', 'carteirasHome', token);
}

/**
 * Chamada da subpágina Carteiras > Ações (action=carteirasAcoes) — ver
 * apps-script/CarteirasClasses.gs!montarCarteirasAcoes_.
 * @return {Promise<Object>} `{ ok, carteira: { classe, resumo: {
 *   totalInvestido, totalAtualizado, lucroPrejuizo, percentualLucroPrejuizo,
 *   proventosTotais, quantidadeAtivos }, distribuicaoPorGrupo: Array<{
 *   grupo, totalAtualizado, percentual }>, ativos: Array<Object>,
 *   benchmarks: { ibovespa, cdi } } }` or `{ ok:false, etapa, erro }`.
 */
export async function getCarteirasAcoes(token) {
  return request('GET', 'carteirasAcoes', token);
}

/**
 * Chamada da subpágina Carteiras > FIIs (action=carteirasFiis) — ver
 * apps-script/CarteirasClasses.gs!montarCarteirasFiis_. Mesmo formato de
 * getCarteirasAcoes(), com benchmarks: { ifix } e cada ativo trazendo
 * também liquidezDiaria/percentualEmCaixa/patrimonio (só em FIIs).
 */
export async function getCarteirasFiis(token) {
  return request('GET', 'carteirasFiis', token);
}

/**
 * Chamada da subpágina Carteiras > Ações Internacionais
 * (action=carteirasAcoesEua) — ver
 * apps-script/CarteirasClasses.gs!montarCarteirasAcoesEua_. Mesmo
 * formato de getCarteirasAcoes(), com benchmarks: { dolar, ibovespa,
 * spx } e valores de resumo/ativos em US$ (moeda nativa dos ativos).
 */
export async function getCarteirasAcoesEua(token) {
  return request('GET', 'carteirasAcoesEua', token);
}

/**
 * Chamada da subpágina Carteiras > Renda Fixa (action=carteirasRendaFixa)
 * — ver apps-script/CarteirasRendaFixa.gs!montarCarteirasRendaFixa_.
 * @return {Promise<Object>} `{ ok, carteira: { resumo: { totalInvestido,
 *   totalAtualizado, lucroPrejuizo, percentualLucroPrejuizo,
 *   quantidadeAtivos }, benchmarks: { cdi, selic, ipca },
 *   distribuicaoPorIndexador: Array<{ grupo, totalAtualizado, percentual }>,
 *   ativos: Array<{ ..., tipoCarteira: 'longo-prazo'|'emergencial',
 *   rentabilidadeContratada, irSeResgatasseHoje }> } }` or
 *   `{ ok:false, etapa, erro }`.
 */
export async function getCarteirasRendaFixa(token) {
  return request('GET', 'carteirasRendaFixa', token);
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
/** 23/09/2026: lista INTEIRA de favoritos da Início, na ordem (Favoritos.gs). */
export async function salvarFavoritos(token, ids) {
  return request('POST', 'salvarFavoritos', token, { ids: JSON.stringify(ids) });
}

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

/**
 * 24/09/2026: importa a exportação "Proventos a receber" da B3 - a matriz
 * da planilha lida no navegador (SheetJS), como veio. Substitui a aba
 * "B3 - proventos a receber" (Proventos.gs!handleImportarProventosB3).
 */
export async function importarProventosB3(token, linhas) {
  return request('POST', 'importarProventosB3', token, { linhas: JSON.stringify(linhas) });
}

/**
 * 24/09/2026: tela Proventos (action=proventos) - ver
 * apps-script/Proventos.gs!montarTelaProventos_.
 */
export async function getProventos(token) {
  return request('GET', 'proventos', token);
}

/**
 * 25/09/2026: tela Detalhe do ativo (action=ativo) - ver
 * apps-script/Ativo.gs!montarTelaAtivo_. `ref` é o ticker (ações, FIIs,
 * ações EUA) ou `rf:<nome>|<instituição>` (um título de renda fixa).
 */
export async function getAtivo(token, ref) {
  return request('GET', 'ativo', token, { ref });
}

/** 25/09/2026: notícias recentes do ativo (Google Notícias, cache de 2h no Apps Script). */
export async function getNoticiasAtivo(token, { ticker, nome = '', classe = '' } = {}) {
  return request('GET', 'noticiasAtivo', token, { ticker, nome, classe });
}

/**
 * 25/09/2026: vídeos do YouTube dos canais cadastrados (apps-script/Videos.gs).
 * `termos` (tela do ativo): ticker e apelidos; `carteira` (página de uma
 * carteira): acoes, fiis, acoesEua ou rendaFixa.
 */
export async function getVideos(token, { termos = [], ticker = '', carteira = '', apelidos = null } = {}) {
  const params = {};
  if (termos.length) params.termos = termos.join('|');
  if (ticker) params.ticker = ticker;
  if (carteira) params.carteira = carteira;
  // 26/09/2026: página da carteira manda os apelidos de cada ativo ("PETR4:Petrobras;AXIA3:Axia Energia,Eletrobras")
  if (apelidos && typeof apelidos === 'object') {
    const txt = Object.entries(apelidos).filter(([, l]) => Array.isArray(l) && l.length)
      .map(([t, l]) => `${t}:${l.map((a) => String(a).replace(/[;:,|]/g, ' ')).join(',')}`).join(';');
    if (txt) params.apelidos = txt;
  }
  return request('GET', 'videos', token, params);
}

/** Botão "Vídeos" do popover Registro de Controle - atualiza os vídeos agora. */
export async function syncVideos(token) {
  return request('POST', 'sincronizarVideos', token);
}

/** 25/09/2026: teses do ativo no Google Drive privado (PDFs + resumos). */
export async function getTesesAtivo(token, ticker) {
  return request('GET', 'tesesAtivo', token, { ticker });
}

/**
 * 25/09/2026: troca o token do Google (vale 1 hora) por uma sessão do Apps
 * Script de vários dias (Auth.gs!handleCriarSessao). `{ ok, token, exp, dias }`.
 */
export async function criarSessao(tokenGoogle) {
  return request('POST', 'criarSessao', tokenGoogle);
}
