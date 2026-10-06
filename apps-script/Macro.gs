/**
 * Macro.gs - 05/10/2026 (Tiago: "Análises: reavalie as análises... considere o
 * macroeconômico, se for possível, se a bolsa está cara ou barata, a situação
 * daquele ativo etc.").
 *
 * GET action=macro -> { ok, macro: { hoje, juros, tesouro, carteira, avisos, fontes } }.
 * Só reúne os NÚMEROS; quem interpreta ("juro real alto", "bolsa barata") é o
 * front (assets/js/criterios/macro.js, testado lá). Cache de 6h; qualquer fonte
 * que falhar vira aviso e a resposta segue com o resto (nunca derruba a tela).
 *
 *  - juros: Selic meta (BCB SGS 432), CDI 12m (soma do CDI diário já salvo em
 *    aux_historico-indices), IPCA 12m (buscarIpcaAcumulado12Meses_, BackfillIndices.gs)
 *    e as EXPECTATIVAS do boletim Focus (BCB Olinda, sem chave): IPCA dos
 *    próximos 12 meses e Selic de fim do ano seguinte. Todos em fração (0.1375).
 *  - tesouro: títulos IPCA+ e Prefixados à venda hoje (precosTesouroDireto_,
 *    CarteiraRendaFixaSync.gs - CSV do Tesouro Transparente): { nome, tipo,
 *    vencimento, taxa (% a.a.) }. O prêmio da NTN-B é a taxa do IPCA+.
 *  - carteira: ações BR, FIIs e ações EUA que o Tiago TEM (quantidade > 0 na
 *    Auxiliar_ativos): valor (peso), P/L e P/VP de hoje e a foto mensal
 *    (aux_fundamentos-historico, Fundamentos.gs) dos últimos 60 meses.
 *    "Bolsa cara ou barata" = P/L (harmônico, ponderado pelo valor) da carteira
 *    hoje x o mesmo cálculo na média histórica da própria foto mensal.
 *
 * Descartado (documentado): P/L do Ibovespa. Nenhuma fonte gratuita e estável
 * sem chave: o Yahoo não traz P/L de índice/ETF (quote exige "crumb"), a B3 só
 * publica a composição teórica e o resto (Investing, Trading Economics) é
 * bloqueado ou pago. A carteira do Tiago é o termômetro.
 *
 * Função pro editor: testarMacroDireto() (loga o JSON; não escreve nada).
 * Testes: tests/harness/macro.test.js.
 */

var MACRO_CACHE_CHAVE_ = 'macro_v1';
var MACRO_CACHE_SEGUNDOS_ = 6 * 60 * 60;
var MACRO_MESES_HISTORICO_ = 60;

/** Roda no editor pra conferir os números (não escreve na planilha). */
function testarMacroDireto() {
  Logger.log(JSON.stringify(montarMacro_(SpreadsheetApp.getActiveSpreadsheet(), new Date(), { semCache: true }), null, 2));
}

function handleMacro(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var semCache = !!(e && e.parameter && (e.parameter.atualizar === '1' || e.parameter.atualizar === 'true'));
    return jsonOut({ ok: true, macro: montarMacro_(SpreadsheetApp.getActiveSpreadsheet(), new Date(), { semCache: semCache }) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'macro', erro: String(erro) });
  }
}

function montarMacro_(ss, agora, opcoes) {
  var o = opcoes || {};
  var cache = null;
  if (!o.semCache) {
    try { cache = CacheService.getScriptCache(); var c = cache.get(MACRO_CACHE_CHAVE_); if (c) return JSON.parse(c); } catch (e0) { cache = null; }
  }
  var avisos = [];
  var out = {
    hoje: fundChaveDia_(agora),
    juros: macroJuros_(ss, agora, avisos),
    tesouro: macroTesouro_(avisos),
    carteira: macroCarteiraRv_(ss, avisos),
    avisos: avisos,
    fontes: ['BCB (SGS 432 Selic, SGS 433 IPCA, Focus/Olinda)', 'Tesouro Transparente (taxas do Tesouro Direto)', 'aux_historico-indices', 'aux_fundamentos-historico']
  };
  try {
    if (!cache) cache = CacheService.getScriptCache();
    var json = JSON.stringify(out);
    // com aviso (alguma fonte caiu e o macro usou dado antigo ou ficou sem o número) o cache é curto: volta a tentar logo
    if (json.length < 95000) cache.put(MACRO_CACHE_CHAVE_, json, avisos.length ? 900 : MACRO_CACHE_SEGUNDOS_);
  } catch (e1) { /* só otimização */ }
  return out;
}

function macroNum_(v) {
  var n = typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(',', '.'));
  return typeof n === 'number' && isFinite(n) && String(v).trim() !== '' ? n : null;
}

function macroArred_(x, casas) { var f = Math.pow(10, casas); return Math.round(x * f) / f; }

/**
 * GET JSON de uma API pública (A-51: Fontes.gs - disjuntor persistente por fonte, valida HTTP e o formato ANTES do
 * .map, e cai no último dado bom guardado com a data). Falha total vira null (o aviso é de quem chamou); dado
 * antigo vira um aviso "dado de DD/MM" em `avisos` e a resposta segue com ele. Sem cache próprio: o macro inteiro já
 * é cacheado por MACRO_CACHE_SEGUNDOS_.
 */
function macroJson_(url, avisos, rotulo, validar) {
  var r = buscarFonte_(fonteNomeDaUrl_(url), url, { ttl: 0, validar: validar || Array.isArray });
  if (!r.ok) return null;
  if (r.origem === 'ultimo-bom' && avisos) avisos.push((rotulo || 'Fonte') + ': ' + r.aviso + '.');
  return r.dados;
}

/** Resposta do Olinda (BCB): { value: [...] }. */
function macroValidaOlinda_(d) { return !!d && typeof d === 'object' && Array.isArray(d.value); }

/** CDI dos últimos 365 dias (fração; null sem 200+ dias). 06/10/2026 (A-77): fonte única = cdiAcumulado12m_ (BackfillIndices.gs). */
function macroCdi12m_(ss, agora) {
  var r = cdiAcumulado12m_(ss, agora);
  return r ? macroArred_(r.fracao, 4) : null;
}

function macroJuros_(ss, agora, avisos) {
  var j = { selic: null, cdi12m: null, ipca12m: null, ipcaMensal: [], ipcaEsperado12m: null, selicEsperadaAnoSeguinte: null };
  var s = macroJson_('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', avisos, 'Selic meta (BCB)');
  var meta = s && s.length ? macroNum_(s[s.length - 1].valor) : null;
  if (meta != null && meta > 0 && meta < 60) j.selic = macroArred_(meta / 100, 4);
  if (j.selic == null) {
    try { var a = buscarCdiSelicAnualizadosHoje_(); if (a && a.selic != null) j.selic = a.selic; } catch (e1) { /* sem Selic */ }
    if (j.selic == null) avisos.push('Selic meta indisponível (BCB).');
  }
  try { j.cdi12m = macroCdi12m_(ss, agora); } catch (e2) { j.cdi12m = null; }
  if (j.cdi12m == null) avisos.push('CDI 12m indisponível (aux_historico-indices com menos de 200 dias).');
  try { j.ipca12m = buscarIpcaAcumulado12Meses_(); } catch (e3) { j.ipca12m = null; }
  // 06/10/2026 (A-78): IPCA mensal dos últimos 36 meses (BCB 433, já salvo na aba) - alimenta a tabela de inflação da Renda
  try { j.ipcaMensal = ipcaMensalDaAba_(ss).slice(-36); } catch (e4) { j.ipcaMensal = []; }
  if (j.ipca12m == null) avisos.push('IPCA 12m indisponível.');
  var ano = Number(fundChaveDia_(agora).slice(0, 4));
  var f1 = macroJson_('https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoInflacao12Meses?$top=1&$orderby=Data%20desc&$filter=Indicador%20eq%20%27IPCA%27%20and%20Suavizada%20eq%20%27S%27%20and%20baseCalculo%20eq%200&$format=json', avisos, 'Focus IPCA (BCB)', macroValidaOlinda_);
  var m1 = f1 && f1.value && f1.value.length ? macroNum_(f1.value[0].Mediana) : null;
  if (m1 != null && m1 > -5 && m1 < 40) j.ipcaEsperado12m = macroArred_(m1 / 100, 4);
  var f2 = macroJson_('https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=1&$orderby=Data%20desc&$filter=Indicador%20eq%20%27Selic%27%20and%20DataReferencia%20eq%20%27' + (ano + 1) + '%27&$format=json&$select=Indicador,Data,DataReferencia,Mediana', avisos, 'Focus Selic (BCB)', macroValidaOlinda_);
  var m2 = f2 && f2.value && f2.value.length ? macroNum_(f2.value[0].Mediana) : null;
  if (m2 != null && m2 > 0 && m2 < 60) j.selicEsperadaAnoSeguinte = macroArred_(m2 / 100, 4);
  if (j.ipcaEsperado12m == null || j.selicEsperadaAnoSeguinte == null) avisos.push('Expectativas do Focus (BCB) indisponíveis agora: o juro real usa só o IPCA já realizado.');
  return j;
}

/** Títulos IPCA+ e Prefixados à venda hoje: [{ nome, tipo, vencimento, taxa (% a.a.) }]. */
function macroTesouro_(avisos) {
  var precos = {};
  try { precos = precosTesouroDireto_(); } catch (e) { avisos.push('Taxas do Tesouro indisponíveis agora (' + e + ').'); return []; }
  return Object.keys(precos).map(function (k) { return precos[k]; })
    .filter(function (p) { return /^Tesouro (IPCA\+|Prefixado)/i.test(p.tipo) && typeof p.taxaCompra === 'number' && p.taxaCompra > 0; })
    .map(function (p) { return { nome: p.tipo + ' ' + String(p.vencimento).slice(0, 4), tipo: p.tipo, vencimento: p.vencimento, taxa: p.taxaCompra }; })
    .sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
}

/** Lê aux_fundamentos-historico UMA vez: { 'TICKER': { pl: [[mes, v]], pvp: [[mes, v]] } } (ordem do mês). */
function macroHistoricoFotos_(ss) {
  var aba = ss.getSheetByName(typeof ABA_FUNDAMENTOS_HIST !== 'undefined' ? ABA_FUNDAMENTOS_HIST : 'aux_fundamentos-historico');
  var por = {};
  if (!aba || aba.getLastRow() < 2) return por;
  aba.getRange(2, 1, aba.getLastRow() - 1, 6).getValues().forEach(function (l) {
    var t = String(l[1] || '').trim().toUpperCase();
    var mes = fundMesDeCelula_(l[0]);
    if (!t || !/^\d{4}-\d{2}$/.test(mes)) return;
    var x = por[t] || (por[t] = { pl: {}, pvp: {} });
    var pl = fundNumero_(l[2]); var pvp = fundNumero_(l[3]);
    if (pl != null) x.pl[mes] = pl;
    if (pvp != null) x.pvp[mes] = pvp;
  });
  Object.keys(por).forEach(function (t) {
    ['pl', 'pvp'].forEach(function (k) {
      var mapa = por[t][k];
      por[t][k] = Object.keys(mapa).sort().slice(-MACRO_MESES_HISTORICO_).map(function (m) { return [m, mapa[m]]; });
    });
  });
  return por;
}

/** Ativos de renda variável em carteira (quantidade > 0) com valor, P/L, P/VP de hoje e a foto mensal. */
function macroCarteiraRv_(ss, avisos) {
  var aba = ss.getSheetByName('Auxiliar_ativos');
  if (!aba || aba.getLastRow() < 2) { avisos.push('Auxiliar_ativos sem dados: sem termômetro de bolsa.'); return []; }
  var fotos = {};
  try { fotos = macroHistoricoFotos_(ss); } catch (e) { avisos.push('Histórico de fundamentos ilegível (' + e + '): bolsa só pelo valor de hoje.'); }
  var tabela = null;
  try { tabela = fundLerTabela_(ss); } catch (e2) { tabela = null; }
  var vistos = {};
  var out = [];
  aba.getRange(2, 1, aba.getLastRow() - 1, 17).getValues().forEach(function (l) {
    var classe = FUND_CLASSES_PLANILHA_[String(l[0] || '').trim()];
    var t = String(l[1] || '').trim().toUpperCase();
    var qtd = fundNumero_(l[7]); var preco = fundNumero_(l[5]);
    if (!classe || !t || vistos[t] || !(qtd > 0) || !(preco > 0)) return;
    vistos[t] = 1;
    var v = {};
    try { v = (tabela && fundMontarDoTicker_(tabela, t, classe) || {}).valores || {}; } catch (e3) { v = {}; }
    var limpo = function (x, chave) {
      var n = fundNumero_(x);
      if (n == null) return null;
      var o = {}; o[chave] = n;
      fundSanidade_(o, []);
      return o[chave] == null ? null : n;
    };
    var pl = classe === 'fiis' ? null : (limpo(l[13], 'pl') != null ? limpo(l[13], 'pl') : limpo(v.pl, 'pl'));
    var pvp = limpo(l[11], 'pvp') != null ? limpo(l[11], 'pvp') : limpo(v.pvp, 'pvp');
    var f = fotos[t] || { pl: [], pvp: [] };
    out.push({ ticker: t, classe: classe, valor: macroArred_(qtd * preco, 2), pl: pl, pvp: pvp, historico: { pl: classe === 'fiis' ? [] : f.pl, pvp: f.pvp } });
  });
  return out;
}
