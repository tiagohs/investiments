/**
 * Ativo.gs - 25/09/2026: tela "Detalhe do ativo" (ativo/index.html).
 *
 * action=ativo&ref=<ticker>        - ações, FIIs, ações EUA
 * action=ativo&ref=rf:<nome>|<inst> - um título de renda fixa
 * action=noticiasAtivo&ticker=&nome= - notícias (Google Notícias, RSS), com cache
 * action=tesesAtivo&ticker=         - teses salvas no Google Drive (pasta privada)
 *
 * Tudo sai das MESMAS abas que o resto do app já usa - a tela só junta,
 * por ativo, o que as Carteiras/Proventos mostram por classe:
 *  - posição e indicadores: Auxiliar_ativos (via montarCarteiraClasse_,
 *    igual à tabela de Carteiras - preço-teto e viés inclusive) e, pra renda
 *    fixa, montarCarteirasRendaFixa_;
 *  - série diária do ativo: aux_historico-patrimonio (cotas, preço, valor,
 *    câmbio) / aux_historico-renda-fixa (valor do título);
 *  - extrato: Transações / Transações - USA / Transações Renda Fixa e a aba
 *    Proventos / Proventos - USA;
 *  - a receber: montarProventosAnunciados_ (B3 + FNet + lançados futuros);
 *  - índices (CDI, IPCA, Ibovespa, IFIX, S&P 500, dólar): a série da Início
 *    (montarSerieHistoricoInicio_, em cache).
 * Os cálculos (rentabilidade no período, aplicado x saldo, histórico mensal)
 * ficam no front (assets/js/pages/ativo-calc.js), testados.
 */

var ATIVO_CACHE_NOTICIAS_TTL = 2 * 60 * 60; // 2h
var ATIVO_CACHE_NOTICIAS_PREFIXO = 'noticias_v2_'; // chave = prefixo + TICKER (ver limparCacheNoticiasAtivos_). v2 (25/09/2026): + imagem e fonteUrl
var PROP_PASTA_TESES = 'TESES_PASTA_ID';

function handleAtivo(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var ref = String((e.parameter && e.parameter.ref) || '').trim();
    if (!ref) return jsonOut({ ok: false, etapa: 'ativo', erro: 'parâmetro "ref" obrigatório' });
    return jsonOut(montarTelaAtivo_(ref));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'ativo', erro: String(erro) });
  }
}

function handleNoticiasAtivo(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut({ ok: true, noticias: buscarNoticiasAtivo_(e.parameter.ticker, e.parameter.nome, e.parameter.classe) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'noticias', erro: String(erro) });
  }
}

function handleTesesAtivo(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(montarTesesAtivo_(e.parameter.ticker));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'teses', erro: String(erro) });
  }
}

// ---------------------------------------------------------------------------
// Tela do ativo
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 25/09/2026 (Tiago: "tem demorado mais de 15 segundos na primeira vez que
// entro em um ativo"): a parte pesada da resposta (série diária, transações,
// proventos, anúncios, índices) vai pro CacheService por ativo, com chave que
// muda sozinha quando alguma aba ganha linha nova (contagens) ou quando o dia
// vira, e uma versão que "Limpar cache"/FNet/importação B3 trocam. A posição
// de hoje (cotação ao vivo) continua sendo lida a cada abertura. Um gatilho a
// cada 2h pré-aquece todos os ativos da carteira (instalarGatilhoPreAquecerAtivos),
// então nem a 1ª abertura do dia espera o cálculo inteiro.
// ---------------------------------------------------------------------------

var PROP_VERSAO_CACHE_ATIVOS = 'ATIVO_CACHE_VERSAO';
var ATIVO_PREAQUECER_LIMITE_MS_ = 4.5 * 60 * 1000;

/** Memória da EXECUÇÃO atual (o pré-aquecimento lê cada aba grande 1 vez só, não 1 vez por ativo). */
var MEMO_ATIVO_ = {};
function memoAtivo_(chave, fn) {
  if (!Object.prototype.hasOwnProperty.call(MEMO_ATIVO_, chave)) MEMO_ATIVO_[chave] = fn();
  return MEMO_ATIVO_[chave];
}

/** Faz a próxima abertura de qualquer ativo recalcular (Limpar cache, FNet, importação B3). */
function invalidarCacheAtivos_() {
  try { PropertiesService.getScriptProperties().setProperty(PROP_VERSAO_CACHE_ATIVOS, String(Date.now())); } catch (e) { /* cache é só otimização */ }
}

function chaveCacheAtivo_(ss, ref) {
  var linhas = function (nome) { var aba = ss.getSheetByName(nome); return aba ? aba.getLastRow() : 0; };
  var versao = '0';
  try { versao = PropertiesService.getScriptProperties().getProperty(PROP_VERSAO_CACHE_ATIVOS) || '0'; } catch (e) { /* sem versão */ }
  var contagens = memoAtivo_('contagens', function () {
    return [ABA_PATRIMONIO_INICIO, ABA_TRANSACOES_BR_FLUXO, ABA_TRANSACOES_USA_FLUXO, 'Proventos', 'Proventos - USA', 'Auxiliar_ativos',
      ABA_HISTORICO_RF, 'Transações Renda Fixa'].map(linhas).join('_');
  });
  // hash curto do ref (título de renda fixa tem espaço e pode ser longo; chave do cache tem limite de tamanho)
  var texto = String(ref).toUpperCase(), h1 = 5381, h2 = 52711;
  for (var i = 0; i < texto.length; i++) { var c = texto.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) + c) >>> 0; }
  return 'ativo_v1_' + h1.toString(36) + h2.toString(36) + texto.length + '_' + chaveDiaISOInicio_(new Date()) + '_' + contagens + '_' + versao;
}

/** Lê do cache ou calcula e grava (mesmos helpers em pedaços da série da Início - passa de 100KB). */
function comCacheAtivo_(ss, ref, fn) {
  var chave = chaveCacheAtivo_(ss, ref);
  var emCache = null;
  try { emCache = lerSerieHistoricoCache_(chave); } catch (e) { emCache = null; }
  if (emCache) return emCache;
  var r = fn();
  if (r && r.ok) { try { gravarSerieHistoricoCache_(chave, r); } catch (e) { /* segue sem cache */ } }
  return r;
}

/** Rodar UMA vez no editor: pré-aquece o cache de todos os ativos a cada 2 horas. */
function instalarGatilhoPreAquecerAtivos() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'gatilhoPreAquecerAtivos'; });
  if (jaExiste) { Logger.log('Gatilho já existe, nada a fazer.'); return; }
  ScriptApp.newTrigger('gatilhoPreAquecerAtivos').timeBased().everyHours(2).create();
  Logger.log('Gatilho de pré-aquecimento dos ativos instalado (a cada 2 horas).');
}

function gatilhoPreAquecerAtivos() { preAquecerCacheAtivos_(); }

/** Roda na hora, pelo editor (mostra quanto tempo levou). */
function rodarPreAquecerAtivosDireto() {
  var r = preAquecerCacheAtivos_();
  Logger.log(JSON.stringify(r));
}

function preAquecerCacheAtivos_() {
  var inicio = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var refs = Object.keys(classesDaCarteiraParaProventos_(ss));
  try {
    (montarCarteirasRendaFixa_().ativos || []).forEach(function (a) {
      if (a.nomePersonalizado) refs.push('rf:' + String(a.nomePersonalizado).trim() + '|' + String(a.instituicao || '').trim());
    });
  } catch (e) { /* sem renda fixa */ }
  var feitos = 0, jaEstavam = 0, falhas = [], faltaram = 0;
  refs.forEach(function (ref) {
    if (Date.now() - inicio > ATIVO_PREAQUECER_LIMITE_MS_) { faltaram++; return; }
    try {
      var chave = chaveCacheAtivo_(ss, ref);
      if (lerSerieHistoricoCache_(chave)) { jaEstavam++; return; }
      var r = /^rf:/i.test(ref) ? montarTelaAtivoRendaFixa_(ref.slice(3)) : montarBaseAtivo_(ss, ref.toUpperCase());
      if (r && r.ok) { gravarSerieHistoricoCache_(chave, r); feitos++; }
    } catch (e) { falhas.push(ref + ': ' + String(e).slice(0, 60)); }
  });
  return { ativos: refs.length, calculados: feitos, jaEmCache: jaEstavam, faltaramPorTempo: faltaram, falhas: falhas, ms: Date.now() - inicio };
}

/** Linha da tabela de Carteiras do ativo (posição e cotação de HOJE - nunca vem do cache). */
function posicaoAtualDoAtivo_(ss, ticker, classeConhecida) {
  var nomesClasse = { acoes: 'Ações', fiis: 'FIIs', acoesEua: 'Ações EUA' };
  var ordem = classeConhecida ? [classeConhecida] : ['acoes', 'fiis', 'acoesEua'];
  for (var i = 0; i < ordem.length; i++) {
    try {
      var dados = memoAtivo_('carteira_' + ordem[i], function () {
        var d = montarCarteiraClasse_(nomesClasse[ordem[i]]);
        if (ordem[i] === 'fiis') { try { enriquecerAtivosComCarteiraFiis_(d.ativos); } catch (eF) { /* extras opcionais */ } }
        return d;
      });
      var achado = (dados.ativos || []).filter(function (a) { return String(a.ticker).toUpperCase() === ticker; })[0];
      if (achado) return { ativo: achado, classe: ordem[i] };
    } catch (eC) { /* classe sem aba: segue */ }
  }
  return { ativo: null, classe: classeConhecida || null };
}

function montarTelaAtivo_(ref) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (/^rf:/i.test(ref)) return comCacheAtivo_(ss, ref, function () { return montarTelaAtivoRendaFixa_(ref.slice(3)); });
  var ticker = ref.toUpperCase();
  var classes = memoAtivo_('classes', function () { return classesDaCarteiraParaProventos_(ss); });
  var atual = posicaoAtualDoAtivo_(ss, ticker, classes[ticker] || null);
  var base = comCacheAtivo_(ss, ticker, function () { return montarBaseAtivo_(ss, ticker, atual.classe); });
  if (!base || !base.ok) return base;
  base.ativo = atual.ativo;
  base.hoje = chaveDiaISOInicio_(new Date());
  return base;
}

/** Tudo do ativo menos a posição de hoje (é o que vai pro cache). */
function montarBaseAtivo_(ss, ticker, classeConhecida) {
  var hoje = chaveDiaISOInicio_(new Date());
  var classe = classeConhecida || memoAtivo_('classes', function () { return classesDaCarteiraParaProventos_(ss); })[ticker] || null;

  var mapas = memoAtivo_('mapas', function () { return mapasDoPatrimonioParaProventos_(ss); });
  var serie = serieDoAtivo_(ss, ticker);
  if (!classe) {
    var linhaClasse = serie.length ? serie[0].classeBruta : null;
    classe = linhaClasse === 'USA' ? 'acoesEua' : (/11$/.test(ticker) ? 'fiis' : 'acoes');
  }
  var emDolar = classe === 'acoesEua';
  var transacoes = transacoesDoAtivo_(ss, ticker, emDolar, mapas.mapaCambioUsd);
  var proventos = proventosDoAtivo_(ss, ticker, mapas.mapaCambioUsd);
  var anunciados = { aReceber: [], pagosNaoLancados: [] };
  try {
    var a = memoAtivo_('anunciados', function () { return montarProventosAnunciados_(null, { mapaCambioUsd: mapas.mapaCambioUsd }); });
    anunciados.aReceber = a.aReceber.filter(function (p) { return p.ticker === ticker; });
    anunciados.pagosNaoLancados = a.pagosNaoLancados.filter(function (p) { return p.ticker === ticker; });
  } catch (eA) { /* sem anúncios */ }

  var faixa52 = null;
  if (classe === 'fiis') { try { faixa52 = faixa52DaCarteiraFiis_(ss, ticker); } catch (eF52) { faixa52 = null; } }

  // 25/09/2026 (Tiago, ponto 2): FIIs não têm tese da Suno - em vez disso,
  // os informes/atualizações do fundo (FNet), lidos de uma aba já
  // atualizada 1x por dia (rápido - ver FnetInformesFii.gs).
  var informesFundo = null;
  if (classe === 'fiis') {
    try { informesFundo = lerInformesFundoFii_(ss, ticker); } catch (eInf) { informesFundo = { ok: false, etapa: 'informesFundo', erro: String(eInf) }; }
  }

  var primeiraData = serie.length ? serie[0].data : (transacoes.length ? transacoes[0].data : hoje);
  return {
    ok: true,
    hoje: hoje,
    tipo: 'rv',
    ticker: ticker,
    classe: classe,
    moeda: emDolar ? 'USD' : 'BRL',
    ativo: null, // montarTelaAtivo_ põe a posição de hoje (fora do cache)
    serie: serie.map(function (p) { return { data: p.data, cotas: p.cotas, preco: p.preco, valor: p.valor, cambio: p.cambio, valorBrl: p.valorBrl }; }),
    transacoes: transacoes,
    proventos: proventos,
    aReceber: anunciados.aReceber,
    pagosNaoLancados: anunciados.pagosNaoLancados,
    faixa52: faixa52,
    informesFundo: informesFundo,
    indices: indicesDesde_(primeiraData),
    referencias: referenciasDeMercado_()
  };
}

/**
 * 25/09/2026 (conclusões dos indicadores): CDI dos últimos 12 meses (%), pra
 * comparar com o DY - da série da Início (mesma régua dos gráficos).
 */
function referenciasDeMercado_() {
  var serie = [];
  try { serie = memoAtivo_('serieInicio', function () { return montarSerieHistoricoInicio_(); }); } catch (e) { return {}; }
  var pts = serie.filter(function (p) { return typeof p.indiceCdi === 'number' && p.indiceCdi > 0; });
  if (pts.length < 2) return {};
  var ult = pts[pts.length - 1];
  var alvo = somarDiasChaveAtivo_(ult.data, -365);
  var base = null;
  for (var i = pts.length - 1; i >= 0; i--) { if (pts[i].data <= alvo) { base = pts[i]; break; } }
  if (!base) return {};
  return { cdi12m: Math.round((ult.indiceCdi / base.indiceCdi - 1) * 10000) / 100, cdi12mAte: ult.data };
}

/**
 * Mín./máx. de 52 semanas que a própria aba "Carteira FIIs" já traz (colunas
 * O e P). Ações e ações EUA não têm isso na planilha: o front calcula pela
 * série do período em carteira (e avisa quando é menos de 1 ano).
 */
function faixa52DaCarteiraFiis_(ss, ticker) {
  var aba = ss.getSheetByName(ABA_CARTEIRA_FIIS_CLASSES);
  if (!aba || aba.getLastRow() < LINHA_DADOS_CARTEIRA_FIIS_CLASSES) return null;
  var linhas = aba.getRange(LINHA_DADOS_CARTEIRA_FIIS_CLASSES, 1, aba.getLastRow() - LINHA_DADOS_CARTEIRA_FIIS_CLASSES + 1, 16).getValues();
  for (var i = 0; i < linhas.length; i++) {
    if (String(linhas[i][0] || '').trim().toUpperCase() !== ticker) continue;
    var min = linhas[i][14], max = linhas[i][15];
    if (typeof min !== 'number' || typeof max !== 'number' || !(min > 0) || !(max >= min)) return null;
    return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, fonte: 'Carteira FIIs' };
  }
  return null;
}

/** aux_historico-patrimonio de 1 ticker, 1 ponto por dia (o último do dia), em ordem. */
function serieDoAtivo_(ss, ticker) {
  var aba = ss.getSheetByName(ABA_PATRIMONIO_INICIO);
  if (!aba || aba.getLastRow() < 2) return [];
  var porDia = {};
  var linhasAba = memoAtivo_('linhasPatrimonio', function () { return aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues(); });
  linhasAba.forEach(function (l) {
    if (String(l[1] || '').trim().toUpperCase() !== ticker || !(l[0] instanceof Date)) return;
    var chave = chaveDiaISOInicio_(l[0]);
    var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
    var r2 = function (v) { return v == null ? null : Math.round(v * 100) / 100; };
    // valores com 2 casas (a planilha guarda dízimas longas - só pesam na resposta)
    porDia[chave] = { data: chave, classeBruta: l[2], cotas: num(l[3]), preco: num(l[4]), valor: r2(num(l[5])), cambio: num(l[6]), valorBrl: r2(num(l[7])) };
  });
  var hoje = chaveDiaISOInicio_(new Date());
  return Object.keys(porDia).filter(function (k) { return k <= hoje; }).sort().map(function (k) { return porDia[k]; });
}

/**
 * Compras e vendas do ticker (Transações ou Transações - USA), na moeda do
 * ativo. `totalBrl`: o total em reais (em dólar: x câmbio do dia, o mesmo
 * de FluxoCaixaInicio.gs) - é o que entra no gráfico de rentabilidade.
 */
function transacoesDoAtivo_(ss, ticker, emDolar, mapaCambioUsd) {
  var chavesCambio = Object.keys(mapaCambioUsd || {}).sort();
  var aba = ss.getSheetByName(emDolar ? ABA_TRANSACOES_USA_FLUXO : ABA_TRANSACOES_BR_FLUXO);
  if (!aba || aba.getLastRow() < LINHA_DADOS_TRANSACOES_FLUXO) return [];
  var out = [];
  memoAtivo_('transacoes_' + (emDolar ? 'usa' : 'br'), function () {
    return aba.getRange(LINHA_DADOS_TRANSACOES_FLUXO, 1, aba.getLastRow() - LINHA_DADOS_TRANSACOES_FLUXO + 1, 12).getValues();
  }).forEach(function (l) {
    if (String(l[0] || '').trim().toUpperCase() !== ticker || !(l[1] instanceof Date)) return;
    var tipo = String(l[2] || '').trim();
    if (!/compra|venda/i.test(tipo)) return;
    var qtd = Number(l[4]) || 0;
    var preco = Number(l[3]) || 0;
    var taxa = Number(l[5]) || 0;
    var total = typeof l[7] === 'number' ? l[7] : preco * qtd + taxa;
    var chave = chaveDiaISOInicio_(l[1]);
    var cambio = emDolar ? (chavesCambio.length ? cambioUsdParaData_(mapaCambioUsd, chavesCambio, chave) : null) : 1;
    out.push({
      data: chave, tipo: /venda/i.test(tipo) ? 'Venda' : 'Compra', preco: preco, quantidade: qtd, taxa: taxa,
      total: Math.round(total * 100) / 100,
      cambio: emDolar ? cambio : null,
      totalBrl: cambio ? Math.round(total * cambio * 100) / 100 : null,
      lucro: typeof l[11] === 'number' ? Math.round(l[11] * 100) / 100 : null
    });
  });
  return out.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
}

/** Proventos recebidos do ticker (aba Proventos / Proventos - USA), com o valor em reais. */
function proventosDoAtivo_(ss, ticker, mapaCambioUsd) {
  var hoje = chaveDiaISOInicio_(new Date());
  var chaves = Object.keys(mapaCambioUsd || {}).sort();
  return memoAtivo_('linhasProventos', function () { return lerLinhasAbaProventos_(ss); }).filter(function (p) { return p.ticker === ticker && p.dataPagamento <= hoje && p.tipo !== 'Juros'; })
    .map(function (p) {
      var cambio = p.moeda === 'USD' ? (chaves.length ? cambioUsdParaData_(mapaCambioUsd, chaves, p.dataPagamento) : null) : 1;
      var liquido = Math.round(p.liquido * 100) / 100;
      return {
        dataCom: p.dataCom, dataPagamento: p.dataPagamento, tipo: normalizarTipoProvento_(p.tipo),
        quantidade: p.quantidade, valorPorCota: p.valorPorCota, liquido: liquido, moeda: p.moeda,
        cambio: p.moeda === 'USD' ? cambio : null,
        valor: cambio ? Math.round(liquido * cambio * 100) / 100 : null
      };
    })
    .sort(function (a, b) { return a.dataPagamento < b.dataPagamento ? -1 : (a.dataPagamento > b.dataPagamento ? 1 : 0); });
}

/** Índices da série da Início (em cache) a partir de uma data. */
function indicesDesde_(dataInicial) {
  var serie = [];
  try { serie = memoAtivo_('serieInicio', function () { return montarSerieHistoricoInicio_(); }); } catch (e) { return []; }
  var desde = dataInicial ? somarDiasChaveAtivo_(dataInicial, -7) : '0000-00-00';
  return serie.filter(function (p) { return p.data >= desde; }).map(function (p) {
    return { data: p.data, cdi: p.indiceCdi, ipca: p.indiceIpca, ibovespa: p.ibovespa, ifix: p.ifix, sp500: p.sp500, cambioUsd: p.cambioUsd, patrimonio: p.patrimonio };
  });
}

function somarDiasChaveAtivo_(chave, dias) {
  var p = chave.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]) + dias * 86400000);
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

// ---------------------------------------------------------------------------
// Renda fixa: 1 título (nome | instituição)
// ---------------------------------------------------------------------------

function montarTelaAtivoRendaFixa_(chave) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = chaveDiaISOInicio_(new Date());
  var partes = String(chave).split('|');
  var nome = String(partes[0] || '').trim();
  var inst = normalizarInstituicaoRF_(partes[1] || '');
  var carteira = memoAtivo_('carteiraRf', function () { return montarCarteirasRendaFixa_(); });
  var ativo = (carteira.ativos || []).filter(function (a) {
    return String(a.nomePersonalizado || '').trim().toUpperCase() === nome.toUpperCase() && normalizarInstituicaoRF_(a.instituicao) === inst;
  })[0] || null;
  var casa = function (produto, instituicao) { return casaTituloRf_(nome, inst, produto, instituicao); };

  // série diária do título (aux_historico-renda-fixa)
  var serie = [];
  var aba = ss.getSheetByName(ABA_HISTORICO_RF);
  if (aba && aba.getLastRow() >= 2) {
    var porDia = {};
    aba.getRange(2, 1, aba.getLastRow() - 1, 6).getValues().forEach(function (l) {
      if (!(l[0] instanceof Date) || !casa(l[1], l[2])) return;
      var k = chaveDiaISOInicio_(l[0]);
      if (k > hoje || typeof l[5] !== 'number') return;
      porDia[k] = (porDia[k] || 0) + l[5];
    });
    serie = Object.keys(porDia).sort().map(function (k) { return { data: k, valor: Math.round(porDia[k] * 100) / 100 }; });
  }

  // movimentações (Transações Renda Fixa)
  var transacoes = [];
  var abaT = ss.getSheetByName('Transações Renda Fixa');
  if (abaT && abaT.getLastRow() >= 7) {
    abaT.getRange(7, 1, abaT.getLastRow() - 6, 8).getValues().forEach(function (l) {
      if (!(l[1] instanceof Date) || !casa(l[0], l[4])) return;
      var mov = String(l[2] || '').trim();
      var valor = Number(l[7]) || 0;
      transacoes.push({
        data: chaveDiaISOInicio_(l[1]), tipo: mov || String(l[3] || ''), entradaSaida: String(l[3] || ''),
        quantidade: Number(l[5]) || 0, preco: Number(l[6]) || 0, total: Math.round(valor * 100) / 100
      });
    });
    transacoes.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
  }

  var primeira = serie.length ? serie[0].data : (transacoes.length ? transacoes[0].data : hoje);
  return {
    ok: true, hoje: hoje, tipo: 'rf', ticker: nome, classe: 'rendaFixa', moeda: 'BRL',
    ativo: ativo, benchmarks: carteira.benchmarks || null,
    serie: serie, transacoes: transacoes, proventos: [], aReceber: [], pagosNaoLancados: [],
    indices: indicesDesde_(primeira)
  };
}

/**
 * O título da Carteira Renda Fixa é o mesmo produto do histórico/Transações?
 * Tesouro: mesmo nome + mesma instituição. LCI/LCA/CDB: na Carteira o nome é
 * livre ("LCI - BANCO INTER S/A") e nas Transações é o código
 * ("LCI - 26I02621944") - casa pelo tipo + instituição, igual a
 * custoPepsDoTituloRf_ (CarteirasRendaFixa.gs).
 */
function casaTituloRf_(nomeCarteira, instCarteiraNorm, produto, instituicao) {
  if (normalizarInstituicaoRF_(instituicao) !== instCarteiraNorm) return false;
  var a = String(nomeCarteira || '').trim().toUpperCase(), b = String(produto || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  var tipo = a.split(/[\s-]/)[0];
  return ['LCI', 'LCA', 'CDB'].indexOf(tipo) >= 0 && b.split(/[\s-]/)[0] === tipo;
}

// ---------------------------------------------------------------------------
// Notícias (Google Notícias - RSS público), 2h de cache por ticker
// ---------------------------------------------------------------------------

function buscarNoticiasAtivo_(ticker, nome, classe) {
  ticker = String(ticker || '').trim().toUpperCase();
  if (!ticker) return [];
  var cache = CacheService.getScriptCache();
  var chave = ATIVO_CACHE_NOTICIAS_PREFIXO + ticker;
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);
  var nomeLimpo = String(nome || '').replace(/\b(S\.?A\.?|Inc\.?|Ltd\.?|N\.V\.|FII|Fundo de Investimento Imobili[aá]rio)\b/gi, '').replace(/\s+/g, ' ').trim();
  var termo = nomeLimpo ? ('"' + ticker + '" OR "' + nomeLimpo + '"') : ('"' + ticker + '"');
  var emIngles = classe === 'acoesEua';
  var url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(termo + ' when:60d') +
    (emIngles ? '&hl=en-US&gl=US&ceid=US:en' : '&hl=pt-BR&gl=BR&ceid=BR:pt-419');
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) return [];
  var itens = extrairItensRss_(resp.getContentText()).slice(0, 10);
  try { cache.put(chave, JSON.stringify(itens), ATIVO_CACHE_NOTICIAS_TTL); } catch (e) { /* cache é só otimização */ }
  return itens;
}

/**
 * 25/09/2026 (Tiago: "ao clicar em limpar cache, ainda to recebendo cache
 * de quando entro em uma tela de ativo"): o botão "Limpar cache" também
 * apaga as notícias guardadas (2h) de cada ativo da carteira. O
 * CacheService não lista chaves, então monta a chave de cada ticker da aba
 * Auxiliar_ativos (coluna B) - apagar chave que não existe não dá erro.
 */
function limparCacheNoticiasAtivos_(ss) {
  var aba = ss.getSheetByName('Auxiliar_ativos');
  if (!aba || aba.getLastRow() < 2) return 0;
  var chaves = aba.getRange(2, 2, aba.getLastRow() - 1, 1).getValues()
    .map(function (l) { return String(l[0] || '').trim().toUpperCase(); })
    .filter(function (t) { return t; })
    .map(function (t) { return ATIVO_CACHE_NOTICIAS_PREFIXO + t; });
  if (chaves.length) CacheService.getScriptCache().removeAll(chaves);
  return chaves.length;
}

/** Lê <item> de um RSS 2.0 sem depender de XmlService (texto simples, testável). */
function extrairItensRss_(xml) {
  var itens = [];
  var tira = function (s) {
    return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  };
  var campo = function (bloco, tag) {
    var m = bloco.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
    return m ? tira(m[1]) : '';
  };
  var re = /<item>([\s\S]*?)<\/item>/g, m;
  while ((m = re.exec(String(xml || ''))) !== null) {
    var bloco = m[1];
    var titulo = campo(bloco, 'title');
    var fonte = campo(bloco, 'source');
    if (fonte && titulo.slice(-(fonte.length + 3)) === ' - ' + fonte) titulo = titulo.slice(0, -(fonte.length + 3));
    var data = new Date(campo(bloco, 'pubDate'));
    var link = campo(bloco, 'link');
    if (!titulo || !/^https?:\/\//.test(link)) continue;
    // 25/09/2026 (Tiago: "teria como mostrar as imagens se disponível?"): o
    // Google Notícias quase nunca manda imagem no RSS - mas se vier
    // (media:content / media:thumbnail / enclosure / <img> na descrição),
    // aproveita; sem imagem o site mostra um placeholder com o ícone do site
    // da fonte (fonteUrl).
    var mImg = bloco.match(/<media:(?:content|thumbnail)[^>]*\burl="([^"]+)"/) ||
      bloco.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/) ||
      bloco.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').match(/<img[^>]*\bsrc="(https?:[^"]+)"/);
    var imagem = mImg && /^https:\/\//.test(mImg[1].replace(/&amp;/g, '&')) ? mImg[1].replace(/&amp;/g, '&') : null;
    var mFonte = bloco.match(/<source[^>]*\burl="(https?:[^"]+)"/);
    itens.push({
      titulo: titulo, link: link, fonte: fonte || null, data: isNaN(data.getTime()) ? null : data.toISOString(),
      imagem: imagem, fonteUrl: mFonte ? mFonte[1].replace(/&amp;/g, '&') : null
    });
  }
  return itens.sort(function (a, b) { return (b.data || '') < (a.data || '') ? -1 : 1; });
}

// ---------------------------------------------------------------------------
// Teses (Google Drive privado): <pasta>/<TICKER>/<dd:mm:aaaa>.pdf + resumos.json
// ---------------------------------------------------------------------------

/**
 * Rode 1 vez no editor do Apps Script depois de subir a pasta "teses" pro
 * seu Google Drive: acha a pasta (pelo nome, ou pelo ID que você passar),
 * guarda o ID e pede a autorização de leitura do Drive. Mostra no log o que
 * achou.
 */
function configurarPastaTesesDireto(idOpcional) {
  var pasta = null;
  if (idOpcional) pasta = DriveApp.getFolderById(idOpcional);
  else {
    var it = DriveApp.getFoldersByName('teses');
    if (it.hasNext()) pasta = it.next();
  }
  if (!pasta) throw new Error('Não achei a pasta "teses" no seu Drive. Suba a pasta ou rode configurarPastaTesesDireto("<id da pasta>").');
  PropertiesService.getScriptProperties().setProperty(PROP_PASTA_TESES, pasta.getId());
  var sub = pasta.getFolders(), n = 0;
  while (sub.hasNext()) { var s = sub.next(); var f = s.getFiles(), q = 0; while (f.hasNext()) { f.next(); q++; } Logger.log(s.getName() + ': ' + q + ' arquivo(s)'); n++; }
  Logger.log('Pasta de teses configurada: ' + pasta.getName() + ' (' + n + ' ativos)');
}

function montarTesesAtivo_(ticker) {
  ticker = String(ticker || '').trim().toUpperCase();
  var id = PropertiesService.getScriptProperties().getProperty(PROP_PASTA_TESES);
  if (!id) return { ok: true, configurado: false, teses: [], resumos: [] };
  var pasta = DriveApp.getFolderById(id);
  var teses = [];
  var sub = pasta.getFoldersByName(ticker);
  if (sub.hasNext()) {
    var arquivos = sub.next().getFiles();
    while (arquivos.hasNext()) {
      var f = arquivos.next();
      if (!/pdf$/i.test(f.getMimeType()) && !/\.pdf$/i.test(f.getName())) continue;
      teses.push({ data: dataDoNomeTese_(f.getName()), nome: f.getName(), id: f.getId(),
        preview: 'https://drive.google.com/file/d/' + f.getId() + '/preview',
        abrir: 'https://drive.google.com/file/d/' + f.getId() + '/view' });
    }
  }
  teses.sort(function (a, b) { return (b.data || '') < (a.data || '') ? -1 : 1; });
  var resumos = [];
  var r = pasta.getFilesByName('resumos.json');
  if (r.hasNext()) {
    try { resumos = (JSON.parse(r.next().getBlob().getDataAsString('UTF-8')).teses || {})[ticker] || []; } catch (e) { resumos = []; }
  }
  return { ok: true, configurado: true, teses: teses, resumos: resumos };
}

/** "21:08:2026.pdf" / "21/08/2026.pdf" / "21-08-2026.pdf" / "2026-08-21.pdf" -> "2026-08-21". */
function dataDoNomeTese_(nome) {
  var s = String(nome || '');
  var m = s.match(/(\d{2})[:\/._-](\d{2})[:\/._-](\d{4})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = s.match(/(\d{4})[:\/._-](\d{2})[:\/._-](\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}
