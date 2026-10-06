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
 * round-accumulation logic that used to live inside tests/manual/teste.html's
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
export async function getAtivo(token, ref, { semIndices = false } = {}) {
  // 05/10/2026 (A-38): semIndices - o front já tem a série da Início (home) e monta os índices dela; a resposta vem ~200 KB menor
  return request('GET', 'ativo', token, semIndices ? { ref, semIndices: 1 } : { ref });
}

/** 25/09/2026: notícias recentes do ativo (Google Notícias, cache de 2h no Apps Script). */
export async function getNoticiasAtivo(token, { ticker, nome = '', classe = '' } = {}) {
  return request('GET', 'noticiasAtivo', token, { ticker, nome, classe });
}

/**
 * 05/10/2026: aba "Patrimônio" do FII - portfólio (imóveis, CRI/CRA com indexador,
 * cotas de outros FIIs) já guardado na aba aux_fii-portfolio (PortfolioFii.gs).
 */
export async function getFiiPortfolio(token, ticker) {
  return request('GET', 'fiiPortfolio', token, { ticker });
}

/** 05/10/2026: coordenadas do mapa achadas no navegador (Nominatim recusou o servidor) - o Apps Script guarda no cache permanente. */
export async function salvarCoordenadasFiiPortfolio(token, ticker, coords) {
  return request('POST', 'fiiPortfolioCoords', token, { ticker, coords: JSON.stringify(coords || []) });
}

/**
 * 25/09/2026: vídeos do YouTube dos canais cadastrados (apps-script/Videos.gs).
 * `termos` (tela do ativo): ticker e apelidos; `carteira` (página de uma
 * carteira): acoes, fiis, acoesEua ou rendaFixa.
 */
export async function getVideos(token, { termos = [], ticker = '', carteira = '', apelidos = null, canal = '', canalModo = '' } = {}) {
  const params = {};
  if (termos.length) params.termos = termos.join('|');
  if (ticker) params.ticker = ticker;
  if (carteira) params.carteira = carteira;
  // 02/10/2026: canal oficial do ativo (canais-youtube.js) - ID UC... ou link; canalModo=citam pra canal de gestora
  if (canal) params.canal = canal;
  if (canalModo) params.canalModo = canalModo;
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

/**
 * 26/09/2026: tela Transações (action=transacoes) - ativos pro carrinho de
 * aportes, aportes, resumo investido por mês e a lista de lançamentos
 * (apps-script/Aportes.gs + Lancamentos.gs).
 */
export async function getTransacoes(token) {
  return request('GET', 'transacoes', token);
}

/** 06/10/2026: só os aportes "aguardando valores finais" (leve) - aviso do header em todas as telas. */
export async function getAportesPendentes(token) {
  return request('GET', 'aportesPendentes', token);
}

/** Grava (ou regrava pelo id) um aporte: { id?, data, status: 'aguardando'|'concluido', observacao, itens }. */
export async function salvarAporte(token, aporte) {
  return request('POST', 'salvarAporte', token, { aporte: JSON.stringify(aporte) });
}

/**
 * 07/10/2026: "Lançar agora" (Lançamentos): grava em Transações - USA as compras de Ações EUA de aportes concluídos que
 * ainda não estão lá (aporteId opcional: só desse aporte). Devolve { gravadas, lancados, naoLancados, aportes, aConfirmar }.
 */
export async function lancarAportesEua(token, aporteId) {
  return request('POST', 'lancarAportesEua', token, aporteId ? { aporteId } : {});
}

/** Cancela um aporte em andamento ou apaga um concluído. */
export async function excluirAporte(token, id) {
  return request('POST', 'excluirAporte', token, { id });
}

/**
 * 05/10/2026: caixa em dólar das Ações EUA (Aportes.gs, aba aux_caixa_dolar). Grava (ou regrava pelo id)
 * um envio da Remessa Online ou um ajuste de saldo: { id?, data, tipo: 'envio'|'ajuste', usd, reais?, comercial?, vet?, conversao?, encargos?, observacao? }.
 * Resposta: { ok, id, caixaDolar: { saldoUsd, movimentos } }.
 */
export async function salvarCaixaDolar(token, mov) {
  return request('POST', 'salvarCaixaDolar', token, { mov: JSON.stringify(mov) });
}

/** Apaga um envio/ajuste do caixa em dólar. */
export async function excluirCaixaDolar(token, id) {
  return request('POST', 'excluirCaixaDolar', token, { id });
}

/**
 * Itens lidos dos extratos (lancamentos-parse.js). simular=true só confere o
 * que já está na planilha; false grava os novos (e os marcados com forcar).
 */
export async function importarLancamentos(token, itens, { simular = false, origem = 'Importação' } = {}) {
  return request('POST', 'importarLancamentos', token, { itens: JSON.stringify(itens), simular: simular ? '1' : '0', origem });
}

/**
 * 26/09/2026: Carteiras - adicionar ativo (apps-script/NovoAtivo.gs).
 * infoNovoAtivo: o ticker já existe? está na base da planilha (preço/DY/P-VP)?
 * + sugestões pros campos (setores, tipos...).
 */
export async function getInfoNovoAtivo(token, classe, ticker = '') {
  return request('GET', 'infoNovoAtivo', token, { classe, ticker });
}

/** Cadastra o ativo (Carteira + Radar + Auxiliar_ativos). simular=true só devolve o plano (linhas). */
export async function adicionarAtivo(token, ativo, { simular = false } = {}) {
  return request('POST', 'adicionarAtivo', token, { ativo: JSON.stringify(ativo), simular: simular ? '1' : '0' });
}

/** Desfaz um cadastro errado (só ativo sem nenhuma transação). */
export async function removerAtivo(token, classe, ticker) {
  return request('POST', 'removerAtivo', token, { classe, ticker });
}

/**
 * 26/09/2026: série do dia (velas de 5 min) pro gráfico dos favoritos e dos
 * índices da Início (apps-script/Intradia.gs). chaves: 'IBOV', 'IFIX', 'SPX',
 * 'USD', 'EUR' ou 'classe:TICKER' (acoes/fiis/usa). { ok, resultado: { chave: serie|null } }
 */
export async function getIntradia(token, chaves) {
  return request('GET', 'intradia', token, { simbolos: (chaves || []).join(',') });
}

/**
 * Uma rodada da consolidação (recalcula o histórico com as transações novas,
 * monta o histórico de ativo novo, refaz a Renda Fixa). Enquanto
 * resultado.continuar, chama de novo - onRodada(resultado, n) a cada volta.
 */
export async function consolidar(token, { tudo = false, onRodada = null, maxRodadas = 8, esperaOcupadoMs = 8000, esperar = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let ultima = null;
  const feito = [];
  const avisos = [];
  let marcouTudo = false;
  for (let n = 1; n <= maxRodadas; n += 1) {
    // tudo=true ("Recalcular histórico"): marca todos os ativos só na 1ª rodada
    const resposta = await request('POST', 'consolidar', token, tudo && !marcouTudo ? { tudo: '1' } : {});
    if (resposta && resposta.ok) marcouTudo = true; // o servidor marca antes de tentar a trava
    if (!resposta || !resposta.ok) return resposta || { ok: false, erro: 'sem resposta' };
    ultima = resposta.resultado || {};
    feito.push(...(ultima.feito || []));
    avisos.push(...(ultima.avisos || []));
    if (onRodada) onRodada(ultima, n);
    if (!ultima.continuar) return { ok: true, resultado: { ...ultima, feito, avisos, rodadas: n } };
    if (ultima.status === 'ocupado') await esperar(esperaOcupadoMs);
  }
  return { ok: true, resultado: { ...ultima, feito, avisos, rodadas: maxRodadas, incompleto: true } };
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

/** 26/09/2026: tela Organização Financeira - despesas essenciais + reserva (Despesas.gs). */
export async function getDespesas(token) {
  return request('GET', 'despesas', token);
}

/**
 * Grava a lista inteira de despesas (+ folga, meses e sobra da reserva) de uma
 * vez. `assinatura` é a que veio no getDespesas: se a aba mudou nesse meio
 * tempo o back-end recusa ({ ok:false, conflito:true }) em vez de atropelar.
 */
export async function salvarDespesas(token, { itens, folga, meses, sobra, assinatura }) {
  return request('POST', 'salvarDespesas', token, {
    itens: JSON.stringify(itens || []),
    folga: folga == null ? '' : String(folga),
    meses: meses == null ? '' : String(meses),
    sobra: sobra == null ? '' : String(sobra),
    assinatura: assinatura || '',
  });
}

/** 26/09/2026: aba Salário e investimentos da Organização Financeira (Salario.gs). */
export async function getSalario(token) {
  return request('GET', 'salario', token);
}

/** Salário líquido (DM!N11) e/ou % pra investir (fração 0-1, DM!Q11). */
export async function salvarSalarioBase(token, { liquido, percentual }) {
  return request('POST', 'salvarSalarioBase', token, {
    liquido: liquido == null ? '' : String(liquido),
    percentual: percentual == null ? '' : String(percentual),
  });
}

/** Grava (ou substitui, mesmo mês + tipo) um pagamento na aba 'Salário'. */
export async function salvarPagamentoSalario(token, pagamento, { usarComoBase = false } = {}) {
  return request('POST', 'salvarPagamentoSalario', token, { pagamento: JSON.stringify(pagamento || {}), usarComoBase: usarComoBase ? '1' : '' });
}

export async function excluirPagamentoSalario(token, mes, tipo) {
  return request('POST', 'excluirPagamentoSalario', token, { mes: mes || '', tipo: tipo || '' });
}

/** 05/10/2026: holerites em Documentos/Trabalho/<EMPRESA>/Holerite/<ANO> no Drive (Salario.gs) - lista (marca os novos). */
export async function getArquivosHolerites(token) {
  return request('GET', 'holeritesArquivos', token);
}

/** Um PDF de holerite do Drive, em base64 (lido no navegador - holerite.js). */
export async function getArquivoHolerite(token, id) {
  return request('GET', 'holeriteArquivo', token, { id: id || '' });
}

/**
 * Grava 1 holerite lido do Drive (pagamento, como salvarPagamentoSalario) e registra o arquivo (id + modifiedTime) pra
 * não importar de novo; `arquivo.situacao` 'erro' só registra a falha.
 */
export async function salvarHoleriteDrive(token, pagamento, arquivo, { usarComoBase = false } = {}) {
  return request('POST', 'salvarHoleriteDrive', token, { pagamento: JSON.stringify(pagamento || {}), arquivo: JSON.stringify(arquivo || {}), usarComoBase: usarComoBase ? '1' : '' });
}

/** 27/09/2026: aba Patrimônio da Organização Financeira (Patrimonio.gs). */
export async function getPatrimonio(token) {
  return request('GET', 'patrimonio', token);
}

/**
 * Grava um bloco da aba Patrimônio (imovel, financiamento, fies, fgts,
 * carreira, ir, outros, preferencias). `valor` null apaga o bloco. Só vão
 * totais - os PDFs são lidos no navegador (patrimonio-import.js).
 */
export async function salvarPatrimonio(token, chave, valor) {
  return request('POST', 'salvarPatrimonio', token, { chave: chave || '', valor: valor == null ? '' : JSON.stringify(valor) });
}

/** Declarações do IR ("Cópia da Declaração") na pasta do Drive configurada. */
export async function getArquivosIrPatrimonio(token) {
  return request('GET', 'patrimonioIrArquivos', token);
}

/** Um PDF da pasta do IR, em base64 (o Apps Script só entrega arquivos daquela pasta). */
export async function getArquivoIrPatrimonio(token, id) {
  return request('GET', 'patrimonioIrArquivo', token, { id: id || '' });
}

/**
 * 02/10/2026: tela Metas e Objetivos (Metas.gs). `{ ok, metas, arquivadas,
 * ativos, cambio, referencias, proventos12m, hoje, avisos? }` - a conta de
 * cada meta é feita no navegador (pages/metas-calc.js).
 */
export async function getMetas(token) {
  return request('GET', 'metas', token);
}

/** 05/10/2026: contexto de mercado das análises (Macro.gs): juros, Tesouro, termômetro da bolsa. { ok, macro } */
export async function getMacro(token, { atualizar = false } = {}) {
  return request('GET', 'macro', token, atualizar ? { atualizar: '1' } : {});
}

/** Cria (meta sem id) ou substitui (com id) uma meta - o objeto inteiro vai em JSON. */
export async function salvarMeta(token, meta) {
  return request('POST', 'salvarMeta', token, { meta: JSON.stringify(meta || {}) });
}

/** "Excluir" = arquivar (a linha fica na aba aux_metas). `restaurar` desarquiva. */
export async function excluirMeta(token, id, { restaurar = false } = {}) {
  return request('POST', 'excluirMeta', token, { id: id || '', restaurar: restaurar ? '1' : '' });
}

/**
 * 03/10/2026: histórico mês a mês das metas (Metas.gs!montarHistoricoMetas_) -
 * `{ ok, hoje, metas: { <id>: { meses: [{ mes, valor, fluxo }], renda?: [{ mes, valor }], aporteMedio, ... } } }`.
 * `id` opcional (sem id = todas as ativas).
 */
export async function getMetasHistorico(token, id = '') {
  return request('GET', 'metasHistorico', token, id ? { id } : {});
}

/** 03/10/2026: apaga de verdade uma meta JÁ ARQUIVADA (a linha sai da aba aux_metas). */
export async function excluirMetaDefinitivamente(token, id) {
  return request('POST', 'excluirMetaDefinitivo', token, { id: id || '' });
}

/** 02/10/2026: Organização Financeira - Gastos (Gastos.gs): lançamentos, arquivos importados e regras. */
export async function getGastos(token, { de, ate } = {}) {
  // 05/10/2026 (A-35): sem parâmetro o servidor devolve os últimos 12 meses (+1 de margem); `de` = 'aaaa-mm' (ou 'tudo').
  const params = {};
  if (de) params.de = de;
  if (ate) params.ate = ate;
  return request('GET', 'gastos', token, params);
}

/** Faturas/extratos em Documentos/Transações no Drive (marca novos e alterados). */
export async function getArquivosGastos(token) {
  return request('GET', 'gastosArquivos', token);
}

/** Um arquivo das pastas de gastos, em base64 (lido no navegador - gastos-import.js). */
export async function getArquivoGastos(token, id) {
  return request('GET', 'gastosArquivo', token, { id: id || '' });
}

/**
 * Grava os lançamentos (já limpos) de um arquivo - substitui os que vieram
 * dele antes. A senha do PDF nunca vai junto: o PDF é aberto no navegador.
 */
export async function salvarImportacaoGastos(token, arquivo, lancamentos) {
  return request('POST', 'salvarImportacaoGastos', token, { arquivo: JSON.stringify(arquivo || {}), lancamentos: JSON.stringify(lancamentos || []) });
}

/** Regra de categoria ("contém o padrão" -> categoria); categoria vazia apaga. */
export async function salvarRegraGastos(token, padrao, categoria) {
  return request('POST', 'salvarRegraGastos', token, { padrao: padrao || '', categoria: categoria || '' });
}

export async function excluirArquivoGastos(token, id) {
  return request('POST', 'excluirArquivoGastos', token, { id: id || '' });
}
