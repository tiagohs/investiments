/**
 * Consolidacao.gs - 26/09/2026 (Tiago: "Após a inserção e sincronização de um
 * relatório, é importante ter algo parecido com a Kinvo: ele mostra uma
 * notificação 'Consolidação necessária', onde clico, e tudo é atualizado").
 *
 * Por que precisa: aux_historico-patrimonio é append-only - cada dia é gravado
 * uma vez, com as cotas que existiam NAQUELE momento. Uma transação importada
 * depois (a compra de ontem, que só entra hoje pelo relatório da B3) deixa os
 * dias já gravados com a quantidade antiga; um ativo novo nem tem histórico.
 * O mesmo vale pra Renda Fixa (aux_historico-renda-fixa é incremental).
 *
 * Fluxo:
 *  1. Quem grava transação/cadastra ativo chama marcarConsolidacao_ (Lancamentos.gs,
 *     NovoAtivo.gs). A pendência fica em ScriptProperties (sobrevive entre
 *     execuções) - o topo do site mostra o aviso (handleSyncHistorico devolve
 *     `consolidacao`).
 *  2. O clique chama consolidar_ (POST action=consolidar), em rodadas - cada
 *     rodada faz no máximo UMA etapa pesada e devolve continuar=true enquanto
 *     falta algo (o site chama de novo sozinho):
 *       a) patrimônio: recalcula Cotas/Valor/Valor BRL dos dias já gravados a
 *          partir da data da transação (o preço e o câmbio do dia já estão
 *          lá - nada de GOOGLEFINANCE). Ativo sem histórico, ou com transação
 *          anterior ao 1º dia gravado: vai pra etapa b;
 *       b) preços: histórico do ativo novo (atualizarHistoricoInterno_, a
 *          mesma rotina do sync diário; retoma de onde parou);
 *       c) renda fixa: refaz aux_historico-renda-fixa do zero + Carteira Renda
 *          Fixa (quantidade, valor aplicado e valor atualizado - ver
 *          CarteiraRendaFixaSync.gs);
 *       d) fim: limpa os caches e registra no Registro de Controle.
 */

var PROP_CONSOLIDACAO = 'consolidacaoPendente_v1';
var TOLERANCIA_DIAS_INICIO_HISTORICO = 6; // 1ª transação num fim de semana/feriado: o 1º pregão gravado vem alguns dias depois

// ---------------------------------------------------------------------------
// Estado (ScriptProperties)
// ---------------------------------------------------------------------------

function lerConsolidacao_() {
  var p = null;
  try {
    var txt = PropertiesService.getScriptProperties().getProperty(PROP_CONSOLIDACAO);
    p = txt ? JSON.parse(txt) : null;
  } catch (e) { p = null; }
  if (!p || typeof p !== 'object') p = {};
  return {
    ativos: p.ativos && typeof p.ativos === 'object' ? p.ativos : {},
    rf: p.rf || null,
    precos: Array.isArray(p.precos) ? p.precos : [],
    motivos: Array.isArray(p.motivos) ? p.motivos : [],
    desde: p.desde || null,
    feito: Array.isArray(p.feito) ? p.feito : [] // o que as rodadas anteriores já fizeram (vai todo pro Registro de Controle no fim)
  };
}

function consolidacaoPendente_(c) {
  return !!(Object.keys(c.ativos).length || c.rf || c.precos.length);
}

function gravarConsolidacao_(c) {
  var props = PropertiesService.getScriptProperties();
  if (!consolidacaoPendente_(c)) { props.deleteProperty(PROP_CONSOLIDACAO); return; }
  props.setProperty(PROP_CONSOLIDACAO, JSON.stringify({
    ativos: c.ativos, rf: c.rf, precos: c.precos, motivos: c.motivos.slice(-12), desde: c.desde, feito: (c.feito || []).slice(-20)
  }));
}

/** O que o site mostra (aviso no topo). */
function resumoConsolidacao_(c) {
  var estado = c || lerConsolidacao_();
  return {
    pendente: consolidacaoPendente_(estado),
    ativos: Object.keys(estado.ativos).sort(),
    precos: estado.precos.slice(),
    rf: !!estado.rf,
    motivos: estado.motivos.slice(-5).reverse(),
    desde: estado.desde
  };
}

/** '' = "desde sempre" (ganha de qualquer data); null/undefined = sem data. */
function menorDataConsolidacao_(a, b) {
  if (a === '' || b === '') return '';
  if (a == null) return b == null ? '' : b;
  if (b == null) return a;
  return a < b ? a : b;
}

function isoDiaConsolidacao_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

/**
 * Anota o que precisa ser consolidado (junta com o que já estava pendente,
 * guardando a MENOR data por ativo).
 * p = { ativos: [{ ticker, classe: 'BR'|'USA', desde: 'yyyy-mm-dd'|'' }], rf: true|{desde}, motivo }
 */
function marcarConsolidacao_(p) {
  var c = lerConsolidacao_();
  ((p && p.ativos) || []).forEach(function (a) {
    var t = String((a && a.ticker) || '').trim().toUpperCase();
    if (!t) return;
    var desde = a.desde == null ? '' : isoDiaConsolidacao_(a.desde);
    var atual = c.ativos[t];
    c.ativos[t] = { classe: a.classe === 'USA' ? 'USA' : 'BR', desde: atual ? menorDataConsolidacao_(atual.desde, desde) : desde };
  });
  if (p && p.rf) {
    var d = p.rf === true || p.rf.desde == null ? '' : isoDiaConsolidacao_(p.rf.desde);
    c.rf = { desde: c.rf ? menorDataConsolidacao_(c.rf.desde, d) : d };
  }
  var agora = new Date().toISOString();
  if (p && p.motivo) c.motivos.push({ quando: agora, texto: String(p.motivo).slice(0, 200) });
  if (!c.desde) c.desde = agora;
  gravarConsolidacao_(c);
  return resumoConsolidacao_(c);
}

// ---------------------------------------------------------------------------
// Handlers (Router.gs)
// ---------------------------------------------------------------------------

/** GET consolidacao: só o estado (o aviso também vem junto do syncHistorico). */
function handleConsolidacaoStatus(e) {
  try { return jsonOut({ ok: true, resultado: resumoConsolidacao_() }); }
  catch (erro) { return jsonOut({ ok: false, etapa: 'consolidacao', erro: String(erro) }); }
}

/**
 * POST consolidar: uma rodada (o site repete enquanto resultado.continuar).
 * tudo=1 (só na 1ª rodada): antes, marca TODOS os ativos do histórico desde o
 * início + a Renda Fixa - "Recalcular histórico" no Registro de Controle.
 */
function handleConsolidar(e) {
  try {
    var tudo = e && e.parameter && String(e.parameter.tudo || '') === '1';
    if (tudo) marcarConsolidacaoCompleta_('Recalcular todo o histórico (pedido no site)');
    return jsonOut({ ok: true, resultado: consolidar_({ origem: tudo ? 'Consolidação completa' : 'Consolidação' }) });
  } catch (erro) { return jsonOut({ ok: false, etapa: 'consolidar', erro: String(erro) }); }
}

/**
 * Marca todos os ativos de aux_historico-patrimonio (desde o início) + Renda
 * Fixa. 26/09/2026: rodando isso nos dados reais, 2 ativos tinham dias com a
 * quantidade errada no histórico (transação lançada/corrigida depois do dia
 * já gravado: uma bonificação de EGIE3 e uma compra de TRXF11) - recalcular
 * não busca preço nenhum, só refaz Cotas/Valor com as transações de hoje.
 */
function marcarConsolidacaoCompleta_(motivo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(NOME_ABA_HISTORICO);
  var n = aba ? Math.max(aba.getLastRow() - 1, 0) : 0;
  var vistos = {};
  var ativos = [];
  if (n) aba.getRange(2, 2, n, 2).getValues().forEach(function (l) {
    var t = String(l[0] || '').trim().toUpperCase();
    if (!t || vistos[t]) return;
    vistos[t] = true;
    ativos.push({ ticker: t, classe: l[1] === 'USA' ? 'USA' : 'BR', desde: '' });
  });
  return marcarConsolidacao_({ ativos: ativos, rf: true, motivo: motivo || 'Recalcular todo o histórico' });
}

/** Roda direto no editor: marca tudo e consolida (uma vez, pra corrigir o passado). */
function consolidarTudoDireto() {
  marcarConsolidacaoCompleta_('Recalcular todo o histórico (editor)');
  rodarConsolidacaoDireto();
}

/** Roda direto no editor (todas as rodadas até acabar ou ~5 min). */
function rodarConsolidacaoDireto() {
  var r, n = 0;
  do { r = consolidar_({ origem: 'Consolidação (editor)' }); Logger.log(JSON.stringify(r)); n++; } while (r.continuar && r.status !== 'ocupado' && n < 6);
}

// ---------------------------------------------------------------------------
// Consolidar
// ---------------------------------------------------------------------------

function consolidar_(opcoes) {
  var o = opcoes || {};
  var inicio = Date.now();
  var agora = o.agora || Date.now; // injetável nos testes
  var trava = LockService.getScriptLock();
  var conseguiu = false;
  try { conseguiu = trava.tryLock(15000); } catch (eL) { conseguiu = false; }
  if (!conseguiu) {
    return { status: 'ocupado', continuar: true, feito: [], detalhe: 'Uma sincronização está rodando agora - a consolidação continua assim que ela terminar.', consolidacao: resumoConsolidacao_() };
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var c = lerConsolidacao_();
    var feito = [];
    var avisos = [];
    if (!consolidacaoPendente_(c)) {
      return { status: 'concluido', continuar: false, feito: ['Nada pendente - tudo já estava consolidado.'], avisos: [], consolidacao: resumoConsolidacao_(c) };
    }
    _listasTickersCarregadas_ = false;
    carregarListasTickersDaPlanilha_(ss);

    // a) patrimônio: recalcula os dias já gravados
    if (Object.keys(c.ativos).length) {
      var r = recalcularHistoricoPatrimonio_(ss, c.ativos);
      if (r.linhas) feito.push('Histórico do patrimônio: ' + r.linhas + ' dia(s) recalculado(s) em ' + r.tickers.join(', '));
      else if (r.tickers.length) feito.push('Histórico do patrimônio de ' + r.tickers.join(', ') + ' já estava certo');
      if (r.refazer.length) feito.push('Histórico refeito do zero (transação anterior ao 1º dia salvo): ' + r.refazer.join(', '));
      if (r.semTransacao.length) avisos.push('Sem transação ainda (o histórico começa na 1ª compra): ' + r.semTransacao.join(', '));
      c.precos = unicosConsolidacao_(c.precos.concat(r.semHistorico, r.refazer));
      c.ativos = {};
      gravarConsolidacao_(c);
    }

    // b) preços do ativo novo (GOOGLEFINANCE) - etapa pesada
    var pesada = false;
    if (c.precos.length && agora() - inicio < 60000) {
      pesada = true;
      var rs = atualizarHistoricoInterno_(o.origem || 'Consolidação', c.precos.slice());
      if (rs.ok.length) feito.push('Histórico de preços: ' + rs.ok.join(', '));
      (rs.falharam || []).forEach(function (f) { avisos.push('Histórico de ' + f.ticker + ' falhou: ' + f.erro); });
      (rs.lacunas || []).forEach(function (l) { avisos.push('Sem cotação no período: ' + l); });
      c.precos = (rs.naoProcessados || []).slice();
      if (c.precos.length) feito.push('Continua na próxima rodada: ' + c.precos.join(', '));
      gravarConsolidacao_(c);
    }

    // c) renda fixa - etapa pesada (uma por rodada)
    if (c.rf && !pesada && agora() - inicio < 90000) {
      var rb = executarBackfillRendaFixa_();
      feito.push('Histórico da Renda Fixa refeito' + (rb && rb.linhasGravadas != null ? ' (' + rb.linhasGravadas + ' linhas)' : ''));
      if (typeof sincronizarCarteiraRendaFixa_ === 'function') {
        try {
          var rc = sincronizarCarteiraRendaFixa_({});
          feito.push('Carteira Renda Fixa: ' + rc.resumo);
          (rc.avisos || []).forEach(function (a) { avisos.push(a); });
        } catch (eRc) { avisos.push('Carteira Renda Fixa não foi atualizada: ' + eRc); }
      }
      c.rf = null;
      gravarConsolidacao_(c);
    }

    var continuar = consolidacaoPendente_(c);
    var todasRodadas = (c.feito || []).concat(feito, avisos);
    if (!continuar) {
      limparCachesConsolidacao_();
      c.motivos = [];
      c.desde = null;
      c.feito = [];
      gravarConsolidacao_(c);
      try { gravarRegistroControle_(avisos.length ? 'Atenção' : 'Sucesso', o.origem || 'Consolidação', (todasRodadas.join(' · ') || 'Consolidado')); } catch (eR) { Logger.log('gravarRegistroControle_: ' + eR); }
    } else {
      c.feito = todasRodadas;
      gravarConsolidacao_(c);
    }
    return { status: continuar ? 'parcial' : 'concluido', continuar: continuar, feito: feito, avisos: avisos, consolidacao: resumoConsolidacao_(c) };
  } finally {
    trava.releaseLock();
  }
}

function unicosConsolidacao_(lista) {
  var visto = {};
  return lista.filter(function (t) { if (!t || visto[t]) return false; visto[t] = true; return true; });
}

function limparCachesConsolidacao_() {
  try { if (typeof limparCacheHistoricoInicio_ === 'function') limparCacheHistoricoInicio_(); } catch (e1) { Logger.log('limparCacheHistoricoInicio_: ' + e1); }
  try { if (typeof invalidarCacheProventos_ === 'function') invalidarCacheProventos_(); } catch (e2) { /* só cache */ }
  try { if (typeof invalidarCacheAtivos_ === 'function') invalidarCacheAtivos_(); } catch (e3) { /* só cache */ }
}

function inicioDoDiaConsolidacao_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Etapa a. ativos = { TICKER: { classe, desde: 'yyyy-mm-dd'|'' } }.
 * Reescreve só Cotas | Valor | Valor BRL (D, F, H) das linhas que mudaram,
 * num único setValues do trecho D:H entre a 1ª e a última linha alterada.
 */
function recalcularHistoricoPatrimonio_(ss, ativos) {
  var aba = ss.getSheetByName(NOME_ABA_HISTORICO);
  if (!aba) throw new Error('aba não encontrada: ' + NOME_ABA_HISTORICO);
  var out = { linhas: 0, tickers: [], semHistorico: [], refazer: [], semTransacao: [] };
  var tickers = Object.keys(ativos);
  if (!tickers.length) return out;

  var n = Math.max(aba.getLastRow() - 1, 0);
  var dados = n ? aba.getRange(2, 1, n, 8).getValues() : [];
  var porTicker = {};
  dados.forEach(function (l, i) {
    var t = String(l[1] || '').trim().toUpperCase();
    if (ativos[t] && l[0] instanceof Date) (porTicker[t] = porTicker[t] || []).push(i);
  });
  var classes = unicosConsolidacao_(tickers.map(function (t) {
    var idx = porTicker[t];
    var c = idx && idx.length ? String(dados[idx[0]][2] || '') : '';
    ativos[t].classeHist = c === 'USA' || c === 'BR' ? c : ativos[t].classe;
    return ativos[t].classeHist;
  }));
  var mapaTx = carregarTodosHistoricosTransacoes_(ss, classes);

  var refazer = [];
  var minI = Infinity, maxI = -1;
  tickers.forEach(function (t) {
    var a = ativos[t];
    var pontos = (mapaTx[a.classeHist] || {})[t] || [];
    var idx = porTicker[t] || [];
    if (!pontos.length) { if (!idx.length) out.semTransacao.push(t); }
    if (!idx.length) { if (pontos.length) out.semHistorico.push(t); return; }
    var desde = a.desde ? new Date(Number(a.desde.slice(0, 4)), Number(a.desde.slice(5, 7)) - 1, Number(a.desde.slice(8, 10))) : null;
    // transação nova ANTERIOR ao 1º dia gravado (ex.: importou um extrato
    // antigo): os dias que faltam no começo não existem - refaz o ativo inteiro
    var primeiroDia = idx.reduce(function (m, i) { return dados[i][0] < m ? dados[i][0] : m; }, dados[idx[0]][0]);
    if (desde && (inicioDoDiaConsolidacao_(primeiroDia) - desde) / 86400000 > TOLERANCIA_DIAS_INICIO_HISTORICO) {
      refazer.push(t);
      return;
    }
    var mudou = 0;
    idx.forEach(function (i) {
      var l = dados[i];
      if (desde && inicioDoDiaConsolidacao_(l[0]) < desde) return;
      var preco = Number(l[4]);
      if (!(preco > 0)) return;
      var cotas = quantidadeNaData_(pontos, l[0]);
      var valor = cotas * preco;
      var cambio = Number(l[6]);
      var valorBrl = a.classeHist === 'USA' ? (cambio > 0 ? valor * cambio : l[7]) : valor;
      if (Math.abs((Number(l[3]) || 0) - cotas) < 1e-9 && Math.abs((Number(l[5]) || 0) - valor) < 1e-6 && (valorBrl === l[7] || Math.abs((Number(l[7]) || 0) - valorBrl) < 1e-6)) return;
      l[3] = cotas; l[5] = valor; l[7] = valorBrl;
      mudou++;
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
    });
    out.linhas += mudou;
    out.tickers.push(t);
  });
  if (maxI >= 0) {
    aba.getRange(2 + minI, 4, maxI - minI + 1, 5).setValues(dados.slice(minI, maxI + 1).map(function (l) { return [l[3], l[4], l[5], l[6], l[7]]; }));
  }

  // transação anterior ao 1º dia salvo: apaga as linhas do ativo (a etapa b refaz do zero)
  if (refazer.length) {
    var tirar = {};
    refazer.forEach(function (t) { tirar[t] = true; });
    var fica = dados.filter(function (l) { return !tirar[String(l[1] || '').trim().toUpperCase()]; });
    var sai = dados.length - fica.length;
    if (fica.length) aba.getRange(2, 1, fica.length, 8).setValues(fica);
    if (sai) aba.getRange(2 + fica.length, 1, sai, 8).clearContent();
    out.refazer = refazer;
  }
  return out;
}
