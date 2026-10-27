/**
 * PosicoesEncerradas.gs - 27/10/2026 (Tiago, depois de vender todo o WIZC3: "não quero que ele seja mais considerado no
 * ranking do Acompanhamento... pense em uma forma de lidar com esse caso").
 *
 * Posição ENCERRADA = ativo do Radar (Distribuição e Metas) com quantidade 0 na Carteira e pelo menos uma venda nas
 * Transações no último ciclo (a quantidade voltou a zero numa venda). Automático: comprou de novo, volta a ser ativo.
 * Nunca comprado (só observando) não é encerrado - continua no ranking.
 *
 * Leitura: montarRadarOportunidades_ (DistribuicoesMetas.gs) chama anexarPosicoesEncerradasRadar_, que põe em cada item
 * encerrado `encerrada` = o resumo do ciclo (de quando comprou até a venda que zerou: compras, vendas, proventos,
 * resultado). Só lê Transações/Proventos se algum item do Radar está com quantidade 0 (memo de Ativo.gs, 1 leitura).
 * Preferências (por ticker): 'acompanhar' (continua no ranking, como observação) ou 'oculta' (some até do bloco de
 * encerradas) - ScriptProperties, doPost action=salvarPosicaoEncerrada.
 * Gravação do % desejado: doPost action=salvarPercentuaisRadar (vários tickers de um bloco de uma vez - zerar o
 * encerrado e redistribuir; o front calcula o plano em assets/js/pages/radar-encerradas.js).
 * Testes: tests/posicoes-encerradas.test.js.
 */

var PROP_PREFS_ENCERRADAS_ = 'radar_encerradas_prefs_v1';
var DIAS_PROVENTO_APOS_VENDA_ = 120; // provento com data-com dentro do ciclo pode pagar meses depois da venda

/**
 * Resumo do ÚLTIMO ciclo de um ativo (pura). `transacoes` = transacoesDoAtivo_ (ordenadas; { data, tipo, preco,
 * quantidade, total }), `proventos` = [{ dataCom, dataPagamento, liquido }] do ticker. null se a posição não zerou
 * numa venda (nunca comprou, ainda tem cotas ou só tem compras).
 */
function resumoCicloEncerrado_(transacoes, proventos, precoAtual) {
  var saldo = 0, inicio = null, ciclo = [];
  (transacoes || []).forEach(function (t) {
    var q = Number(t.quantidade) || 0;
    if (!(q > 0)) return;
    if (saldo <= 1e-9 && t.tipo === 'Compra') { inicio = t.data; ciclo = []; }
    ciclo.push(t);
    saldo += t.tipo === 'Venda' ? -q : q;
    if (saldo < 1e-9) saldo = 0;
  });
  if (!ciclo.length || saldo > 1e-6) return null;
  var ultima = ciclo[ciclo.length - 1];
  if (ultima.tipo !== 'Venda') return null;
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var compras = 0, vendas = 0, qtdCompra = 0, qtdVenda = 0;
  ciclo.forEach(function (t) {
    var total = typeof t.total === 'number' ? t.total : (Number(t.preco) || 0) * (Number(t.quantidade) || 0);
    if (t.tipo === 'Venda') { vendas += total; qtdVenda += Number(t.quantidade) || 0; } else { compras += total; qtdCompra += Number(t.quantidade) || 0; }
  });
  var fim = ultima.data;
  var limitePg = somarDiasIsoEncerrada_(fim, DIAS_PROVENTO_APOS_VENDA_);
  var prov = 0;
  (proventos || []).forEach(function (p) {
    var dc = p.dataCom || p.dataPagamento;
    if (dc && dc >= inicio && dc <= fim && p.dataPagamento <= limitePg) prov += Number(p.liquido) || 0;
  });
  var lucro = vendas - compras;
  var resultado = lucro + prov;
  var pmVenda = qtdVenda > 0 ? vendas / qtdVenda : null;
  var preco = typeof precoAtual === 'number' && isFinite(precoAtual) && precoAtual > 0 ? precoAtual : null;
  return {
    inicio: inicio, fim: fim, dias: Math.round((Date.parse(fim + 'T12:00:00Z') - Date.parse(inicio + 'T12:00:00Z')) / 86400000),
    quantidade: qtdCompra, compras: r2(compras), vendas: r2(vendas), precoMedioCompra: qtdCompra > 0 ? r2(compras / qtdCompra) : null,
    precoMedioVenda: pmVenda != null ? r2(pmVenda) : null, lucroRealizado: r2(lucro), proventos: r2(prov), resultado: r2(resultado),
    resultadoPct: compras > 0 ? Math.round((resultado / compras) * 10000) / 10000 : null,
    // a cotação de hoje contra o preço médio da venda: > 0 = subiu depois que você saiu
    desdeAVenda: preco && pmVenda ? Math.round((preco / pmVenda - 1) * 10000) / 10000 : null,
    operacoes: ciclo.length
  };
}

function somarDiasIsoEncerrada_(iso, dias) {
  return new Date(Date.parse(iso + 'T12:00:00Z') + dias * 86400000).toISOString().slice(0, 10);
}

/** { TICKER: 'acompanhar' | 'oculta' } (vazio se nunca salvou). */
function lerPrefsEncerradas_() {
  try {
    var bruto = PropertiesService.getScriptProperties().getProperty(PROP_PREFS_ENCERRADAS_);
    var p = bruto ? JSON.parse(bruto) : {};
    return p && typeof p === 'object' ? p : {};
  } catch (e) { return {}; }
}

/**
 * Marca os itens encerrados de cada bloco do Radar. `blocos` = [{ classe: 'acoes'|'acoesEua'|'fiis', itens }]; cada item
 * já passou por enriquecerRadarComCarteira_ (tem `quantidadeCarteira`). Devolve as prefs (vão na resposta).
 */
function anexarPosicoesEncerradasRadar_(ss, blocos) {
  var candidatos = [];
  blocos.forEach(function (b) {
    b.itens.forEach(function (it) {
      if (it.quantidadeCarteira === 0 || (it.quantidadeCarteira != null && it.quantidadeCarteira <= 0)) candidatos.push({ classe: b.classe, item: it });
    });
  });
  var prefs = lerPrefsEncerradas_();
  if (!candidatos.length) return prefs;
  var proventos = null;
  candidatos.forEach(function (c) {
    var ticker = String(c.item.ativo || '').trim().toUpperCase();
    if (!ticker) return;
    var tx = transacoesDoAtivo_(ss, ticker, c.classe === 'acoesEua', {});
    if (!tx.some(function (t) { return t.tipo === 'Venda'; })) return; // nunca vendeu: só observando
    if (proventos === null) {
      try { proventos = memoAtivo_('linhasProventos', function () { return lerLinhasAbaProventos_(ss); }); } catch (eP) { proventos = []; }
    }
    var resumo = resumoCicloEncerrado_(tx, proventos.filter(function (p) { return p.ticker === ticker; }), Number(c.item.precoAtual));
    if (!resumo) return;
    resumo.moeda = c.classe === 'acoesEua' ? 'USD' : 'BRL';
    resumo.preferencia = prefs[ticker] || null;
    c.item.encerrada = resumo;
  });
  return prefs;
}

/** doPost action=salvarPosicaoEncerrada: ticker + preferencia ('acompanhar' | 'oculta' | '' pra voltar ao padrão). */
function handleSalvarPosicaoEncerrada(e) {
  try {
    var ticker = String(e.parameter.ticker || '').trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,15}$/.test(ticker)) return jsonOut({ ok: false, erro: 'ticker inválido: ' + e.parameter.ticker });
    var pref = String(e.parameter.preferencia || '').trim();
    if (pref && pref !== 'acompanhar' && pref !== 'oculta') return jsonOut({ ok: false, erro: 'preferência inválida: ' + pref });
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var prefs = lerPrefsEncerradas_();
      if (pref) prefs[ticker] = pref; else delete prefs[ticker];
      PropertiesService.getScriptProperties().setProperty(PROP_PREFS_ENCERRADAS_, JSON.stringify(prefs));
      return jsonOut({ ok: true, prefs: prefs });
    } finally { lock.releaseLock(); }
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * doPost action=salvarPercentuaisRadar: grava o % desejado de vários tickers de UM bloco do Radar de uma vez (zerar o
 * encerrado e redistribuir entre os outros). `tabela` = acoesNacionais|acoesInternacionais|fiis; `itens` = JSON
 * [{ linha, ativo, percentualDesejado }]. Confere TODAS as linhas antes de gravar a primeira (tudo ou nada).
 */
function handleSalvarPercentuaisRadar(e) {
  try {
    var colunaPct = { acoesNacionais: 'L', acoesInternacionais: 'K', fiis: 'K' }[e.parameter.tabela];
    if (!colunaPct) return jsonOut({ ok: false, erro: 'tabela inválida: ' + e.parameter.tabela });
    var itens;
    try { itens = JSON.parse(e.parameter.itens || '[]'); } catch (eJ) { return jsonOut({ ok: false, erro: 'itens inválidos (JSON)' }); }
    if (!Array.isArray(itens) || !itens.length || itens.length > 60) return jsonOut({ ok: false, erro: 'informe de 1 a 60 itens' });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
    var local = localDistribuicaoMetas_(dm);
    var primeira = { acoesNacionais: local.radarAcoes, acoesInternacionais: local.radarUsa, fiis: local.radarFiis }[e.parameter.tabela];
    var validos = [];
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i] || {};
      var linha = parseInt(it.linha, 10);
      var pct = Number(it.percentualDesejado);
      if (isNaN(linha) || linha < primeira) return jsonOut({ ok: false, erro: 'linha inválida: ' + it.linha });
      if (!isFinite(pct) || pct < 0 || pct > 1) return jsonOut({ ok: false, erro: '% desejado inválido (fração 0-1) em ' + it.ativo });
      var naPlanilha = String(dm.getRange('C' + linha).getValue() || '').trim().toUpperCase();
      if (!naPlanilha || naPlanilha !== String(it.ativo || '').trim().toUpperCase()) {
        return jsonOut({ ok: false, erro: 'linha ' + linha + ' não é mais o ativo ' + it.ativo + ' (agora é "' + naPlanilha + '") — recarregue a tela e tente de novo' });
      }
      validos.push({ linha: linha, pct: Math.round(pct * 10000) / 10000 });
    }
    validos.forEach(function (v) { dm.getRange(colunaPct + v.linha).setValue(v.pct); });
    return jsonOut({ ok: true, gravados: validos.length });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * 27/10/2026 (Tiago: "editar o ranking arrastando o item pra cima ou pra baixo"): doPost action=salvarRankingRadar grava
 * o Ranking (coluna B) de vários tickers de UM bloco do Radar de uma vez. `itens` = JSON [{ linha, ativo, ranking }];
 * confere TODAS as linhas (o ativo ainda é o mesmo) antes de gravar a primeira. A ordem vem de
 * assets/js/pages/radar-ranking.js!rankingsDaOrdem.
 */
function handleSalvarRankingRadar(e) {
  try {
    var tabela = e.parameter.tabela;
    if (['acoesNacionais', 'acoesInternacionais', 'fiis'].indexOf(tabela) === -1) return jsonOut({ ok: false, erro: 'tabela inválida: ' + tabela });
    var itens;
    try { itens = JSON.parse(e.parameter.itens || '[]'); } catch (eJ) { return jsonOut({ ok: false, erro: 'itens inválidos (JSON)' }); }
    if (!Array.isArray(itens) || !itens.length || itens.length > 80) return jsonOut({ ok: false, erro: 'informe de 1 a 80 itens' });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
    var local = localDistribuicaoMetas_(dm);
    var primeira = { acoesNacionais: local.radarAcoes, acoesInternacionais: local.radarUsa, fiis: local.radarFiis }[tabela];
    var validos = [];
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i] || {};
      var linha = parseInt(it.linha, 10);
      var ranking = Number(it.ranking);
      if (isNaN(linha) || linha < primeira) return jsonOut({ ok: false, erro: 'linha inválida: ' + it.linha });
      if (!(ranking >= 1) || Math.floor(ranking) !== ranking || ranking > 500) return jsonOut({ ok: false, erro: 'ranking inválido em ' + it.ativo + ': ' + it.ranking });
      var naPlanilha = String(dm.getRange('C' + linha).getValue() || '').trim().toUpperCase();
      if (!naPlanilha || naPlanilha !== String(it.ativo || '').trim().toUpperCase()) {
        return jsonOut({ ok: false, erro: 'linha ' + linha + ' não é mais o ativo ' + it.ativo + ' (agora é "' + naPlanilha + '") — recarregue a tela e tente de novo' });
      }
      validos.push({ linha: linha, ranking: ranking });
    }
    validos.forEach(function (v) { dm.getRange('B' + v.linha).setValue(v.ranking); });
    return jsonOut({ ok: true, gravados: validos.length });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}
