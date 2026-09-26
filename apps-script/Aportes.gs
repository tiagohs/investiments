/**
 * Aportes.gs - 26/09/2026: tela Transações (menu principal). Duas abas:
 *  - "Aportes": o planejamento do dia de compra, no lugar da aba "Compras
 *    de Investimentos" (Tiago: "O processo de aporte poderia seguir um
 *    processo de 'carrinho de compra'. Eu seleciono o tipo, os ativos,
 *    coloco a quantidade. Quero uma coluna com o valor de quanto paguei
 *    pela última vez naquele ativo... Após eu confirmar as compras, fica um
 *    'aguardando valores finais'... Após isso, confirma a compra... Quero
 *    ter a opção de cancelar um processo de compra ou deletar uma que
 *    acabei confirmando, mas não cheguei a comprar ainda. Vamos incluir
 *    renda fixa também").
 *    É independente das transações: fica só na aba aux_aportes (criada
 *    sozinha no 1º aporte), uma linha por ativo de cada aporte.
 *  - "Lançamentos": importar extratos (Lancamentos.gs).
 *
 * GET transacoes devolve tudo de uma vez: ativos de cada classe pro
 * carrinho (cotação, viés, preço-teto e o último preço pago), os aportes,
 * o resumo do que foi investido por mês (das transações de verdade, com o
 * dólar do dia da compra) e a lista de lançamentos.
 *
 * Aba aux_aportes (você pode olhar/editar na planilha): ID | Data | Status
 * (Aguardando / Concluído) | Classe | Ativo | Instituição | Moeda | Qtd
 * planejada | Preço planejado | Valor planejado | Qtd final | Preço final |
 * Valor final | Observação | Criado em | Atualizado em. Renda fixa usa só
 * os valores (sem quantidade/preço).
 */

var ABA_APORTES = 'aux_aportes';
var CABECALHO_APORTES = ['ID', 'Data', 'Status', 'Classe', 'Ativo', 'Instituição', 'Moeda', 'Qtd planejada', 'Preço planejado', 'Valor planejado',
  'Qtd final', 'Preço final', 'Valor final', 'Observação', 'Criado em', 'Atualizado em'];
var CLASSES_APORTE = ['acoes', 'fiis', 'acoesEua', 'rendaFixa'];
var STATUS_APORTE_TEXTO = { aguardando: 'Aguardando', concluido: 'Concluído' };

// ---------------------------------------------------------------------------
// Handlers (Router.gs)
// ---------------------------------------------------------------------------

function handleTransacoes(e, auth) {
  try {
    return jsonOut(montarTelaTransacoes_());
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'transacoes', erro: String(erro) });
  }
}

/** POST salvarAporte: e.parameter.aporte = JSON { id?, data, status, observacao, itens: [...] }. */
function handleSalvarAporte(e) {
  try {
    var aporte = JSON.parse(e.parameter.aporte || '{}');
    var id = salvarAporte_(aporte);
    return jsonOut({ ok: true, id: id, aportes: lerAportes_(SpreadsheetApp.getActiveSpreadsheet()) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'salvarAporte', erro: String(erro) });
  }
}

/** POST excluirAporte: e.parameter.id - cancela (aguardando) ou apaga (concluído). */
function handleExcluirAporte(e) {
  try {
    var removidas = excluirAporte_(String(e.parameter.id || ''));
    return jsonOut({ ok: true, removidas: removidas, aportes: lerAportes_(SpreadsheetApp.getActiveSpreadsheet()) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'excluirAporte', erro: String(erro) });
  }
}

function testarTransacoesDireto() {
  var inicio = Date.now();
  var t = montarTelaTransacoes_();
  Logger.log('montarTelaTransacoes_: ' + (Date.now() - inicio) + 'ms - ' + t.aportes.length + ' aporte(s), ' + t.lancamentos.length + ' lançamento(s)');
  CLASSES_APORTE.forEach(function (c) { Logger.log(c + ': ' + t.classes[c].length + ' ativo(s)'); });
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

function montarTelaTransacoes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abas = lerAbasLanc_(ss, Object.keys(LANC_ABAS)); // Lancamentos.gs
  var aportes = lerAportes_(ss);
  var classes = ativosParaAporte_(ss, abas, aportes);
  var contexto = null;
  try { contexto = enriquecerMomentoAporte_(ss, classes); } catch (eM) { Logger.log('enriquecerMomentoAporte_: ' + eM); }
  return {
    ok: true,
    hoje: chaveDiaISOInicio_(new Date()),
    cambio: cambioHojeAporte_(ss),
    classes: classes,
    metas: contexto ? contexto.metas : null,
    aportes: aportes,
    resumo: resumoInvestidoComCache_(ss, abas),
    lancamentos: listaLancamentosTela_(ss, abas)
  };
}

function cambioHojeAporte_(ss) {
  try {
    return cotacaoDolarHoje_(ss); // Planilha.gs
  } catch (e) { return null; }
}

function numeroAporte_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var n = Number(String(v == null ? '' : v).replace(',', '.'));
  return String(v == null ? '' : v).trim() !== '' && isFinite(n) ? n : null;
}

/** Compra mais recente de cada ticker nas transações: { TICKER: { preco, data, origem } }. */
function ultimasComprasAporte_(itens) {
  var out = {};
  itens.forEach(function (it) {
    if (!/compra/i.test(it.tipo) || !(it.preco > 0) || !it.data) return;
    var atual = out[it.ticker];
    if (!atual || it.data >= atual.data) out[it.ticker] = { preco: it.preco, qtd: it.qtd, data: it.data, origem: 'transacao' };
  });
  return out;
}

function chaveRfAporte_(titulo, instituicao) {
  return normTextoLanc_(titulo) + '|' + normalizarInstituicaoRF_(instituicao); // Lancamentos.gs / BackfillRendaFixa.gs
}

/** Ativos de cada classe pro carrinho, com o último preço pago. */
function ativosParaAporte_(ss, abas, aportes) {
  var mapaClasse = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações EUA': 'acoesEua' };
  var out = { acoes: [], fiis: [], acoesEua: [], rendaFixa: [] };
  var ultimas = ultimasComprasAporte_(abas.transacoes.itens);
  var ultimasUsa = ultimasComprasAporte_(abas.transacoesUsa.itens);
  var ultimasRf = {};
  abas.rendaFixa.itens.forEach(function (it) {
    if (!/compra|aplica/i.test(it.movimentacao) || !it.data) return;
    var k = chaveRfAporte_(it.produto, it.instituicao);
    if (!ultimasRf[k] || it.data >= ultimasRf[k].data) ultimasRf[k] = { valor: it.valor, preco: it.preco, qtd: it.qtd, data: it.data, origem: 'transacao' };
  });
  // aporte concluído mais novo que a última transação (comprou e ainda não importou) vale como "último pago"
  aportes.forEach(function (a) {
    if (a.status !== 'concluido') return;
    a.itens.forEach(function (it) {
      if (it.classe === 'rendaFixa') {
        var k = chaveRfAporte_(it.ativo, it.instituicao);
        if (it.valorFinal > 0 && (!ultimasRf[k] || a.data > ultimasRf[k].data)) ultimasRf[k] = { valor: it.valorFinal, data: a.data, origem: 'aporte' };
        return;
      }
      var mapa = it.classe === 'acoesEua' ? ultimasUsa : ultimas;
      if (it.precoFinal > 0 && it.qtdFinal > 0 && (!mapa[it.ativo] || a.data > mapa[it.ativo].data)) mapa[it.ativo] = { preco: it.precoFinal, qtd: it.qtdFinal, data: a.data, origem: 'aporte' };
    });
  });

  var aux = ss.getSheetByName('Auxiliar_ativos');
  if (aux && aux.getLastRow() >= 2) {
    aux.getRange(2, 1, aux.getLastRow() - 1, 20).getValues().forEach(function (l) {
      var classe = mapaClasse[l[0]];
      var ticker = String(l[1] || '').trim().toUpperCase();
      if (!classe || !ticker) return;
      out[classe].push({
        ticker: ticker, nome: String(l[2] || '').trim(), moeda: classe === 'acoesEua' ? 'USD' : 'BRL',
        precoAtual: numeroAporte_(l[5]), variacaoDia: numeroAporte_(l[6]), quantidade: numeroAporte_(l[7]) || 0,
        precoMedio: numeroAporte_(l[8]), precoTeto: numeroAporte_(l[9]), vies: String(l[10] || '').trim() || null,
        totalAtualizado: numeroAporte_(l[19]) || 0,
        ultimoPago: (classe === 'acoesEua' ? ultimasUsa : ultimas)[ticker] || null
      });
    });
  }
  ['acoes', 'fiis', 'acoesEua'].forEach(function (c) {
    var soma = out[c].reduce(function (s, a) { return s + (a.totalAtualizado || 0); }, 0);
    out[c].forEach(function (a) { a.peso = soma > 0 ? Math.round((a.totalAtualizado / soma) * 10000) / 10000 : 0; });
  });

  var rf = ss.getSheetByName('Carteira Renda Fixa');
  if (rf && rf.getLastRow() >= 9) {
    var vistos = {};
    rf.getRange(9, 1, rf.getLastRow() - 8, 12).getValues().forEach(function (l) {
      var titulo = String(l[2] || '').replace(/\s+/g, ' ').trim();
      if (!titulo) return;
      var instituicao = String(l[5] || '').trim();
      var k = chaveRfAporte_(titulo, instituicao);
      if (vistos[k]) return;
      vistos[k] = true;
      out.rendaFixa.push({
        titulo: titulo, instituicao: instituicao, categoria: String(l[1] || '').trim(), tipo: String(l[3] || '').trim(),
        indexador: String(l[4] || '').trim(), vencimento: Object.prototype.toString.call(l[10]) === '[object Date]' ? chaveDiaISOInicio_(l[10]) : '',
        valorAtualizado: numeroAporte_(l[11]), valorInvestido: numeroAporte_(l[8]), ultimoPago: ultimasRf[k] || null
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resumo: quanto foi investido por mês (transações de verdade)
// ---------------------------------------------------------------------------

function resumoInvestidoComCache_(ss, abas) {
  var chave = 'tx_resumo_v1_' + chaveDiaISOInicio_(new Date()) + '_' +
    ['transacoes', 'transacoesUsa', 'rendaFixa'].map(function (d) { return abas[d].itens.length; }).join('_');
  var cache = null;
  try { cache = CacheService.getScriptCache(); var v = cache.get(chave); if (v) return JSON.parse(v); } catch (e) { cache = null; }
  var r = resumoInvestido_(ss, abas);
  try { if (cache) cache.put(chave, JSON.stringify(r), 21600); } catch (e2) { /* só otimização */ }
  return r;
}

/** { 'aaaa-mm': { acoes, fiis, acoesEua, acoesEuaUsd, rendaFixa, total } } - só compras/aplicações. */
function resumoInvestido_(ss, abas) {
  var meses = {};
  var somar = function (data, classe, valor, usd) {
    if (!data || !(valor > 0)) return;
    var m = data.slice(0, 7);
    var r = meses[m] || (meses[m] = { acoes: 0, fiis: 0, acoesEua: 0, acoesEuaUsd: 0, rendaFixa: 0, total: 0 });
    r[classe] += valor;
    r.total += valor;
    if (usd) r.acoesEuaUsd += usd;
  };
  var classes = typeof classesDaCarteiraParaProventos_ === 'function' ? classesDaCarteiraParaProventos_(ss) : {};
  abas.transacoes.itens.forEach(function (it) {
    if (!/compra/i.test(it.tipo)) return;
    var classe = classes[it.ticker] === 'fiis' || (!classes[it.ticker] && /11$/.test(it.ticker)) ? 'fiis' : 'acoes';
    somar(it.data, classe, (it.preco || 0) * (it.qtd || 0) + (it.taxa || 0));
  });
  var mapaCambio = {}, chaves = [];
  if (abas.transacoesUsa.itens.length && typeof mapasDoPatrimonioParaProventos_ === 'function') {
    mapaCambio = mapasDoPatrimonioParaProventos_(ss).mapaCambioUsd; // Proventos.gs
    chaves = Object.keys(mapaCambio).sort();
  }
  abas.transacoesUsa.itens.forEach(function (it) {
    if (!/compra/i.test(it.tipo)) return;
    var usd = (it.preco || 0) * (it.qtd || 0) + (it.taxa || 0);
    var cambio = chaves.length && typeof cambioUsdParaData_ === 'function' ? cambioUsdParaData_(mapaCambio, chaves, it.data) : null;
    somar(it.data, 'acoesEua', usd * (cambio || 0), usd);
  });
  abas.rendaFixa.itens.forEach(function (it) {
    if (/compra|aplica/i.test(it.movimentacao)) somar(it.data, 'rendaFixa', it.valor || 0);
  });
  Object.keys(meses).forEach(function (m) {
    Object.keys(meses[m]).forEach(function (k) { meses[m][k] = Math.round(meses[m][k] * 100) / 100; });
  });
  return meses;
}

// ---------------------------------------------------------------------------
// aux_aportes
// ---------------------------------------------------------------------------

function garantirAbaAportes_(ss) {
  var aba = ss.getSheetByName(ABA_APORTES);
  if (!aba) {
    aba = ss.insertSheet(ABA_APORTES);
    aba.getRange(1, 1, 1, CABECALHO_APORTES.length).setValues([CABECALHO_APORTES]);
  }
  return aba;
}

function statusDoTextoAporte_(s) {
  return /conclu/i.test(String(s || '')) ? 'concluido' : 'aguardando';
}

/** Aportes (mais novo primeiro), cada um com seus itens. */
function lerAportes_(ss) {
  var aba = ss.getSheetByName(ABA_APORTES);
  if (!aba || aba.getLastRow() < 2) return [];
  var porId = {}, ordem = [];
  var quando = function (v) { return Object.prototype.toString.call(v) === '[object Date]' ? v.toISOString() : String(v || ''); };
  aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_APORTES.length).getValues().forEach(function (l) {
    var id = String(l[0] || '').trim();
    if (!id) return;
    var a = porId[id];
    if (!a) {
      a = porId[id] = {
        id: id, data: chaveDataLanc_(l[1]), status: statusDoTextoAporte_(l[2]), observacao: String(l[13] || ''),
        criadoEm: quando(l[14]), atualizadoEm: quando(l[15]), itens: []
      };
      ordem.push(id);
    }
    a.itens.push({
      classe: String(l[3] || ''), ativo: String(l[4] || '').trim(), instituicao: String(l[5] || '').trim(), moeda: String(l[6] || 'BRL'),
      qtdPlanejada: numeroAporte_(l[7]), precoPlanejado: numeroAporte_(l[8]), valorPlanejado: numeroAporte_(l[9]),
      qtdFinal: numeroAporte_(l[10]), precoFinal: numeroAporte_(l[11]), valorFinal: numeroAporte_(l[12])
    });
  });
  return ordem.map(function (id) { return porId[id]; }).sort(function (x, y) {
    if (x.data !== y.data) return x.data < y.data ? 1 : -1;
    return x.criadoEm < y.criadoEm ? 1 : (x.criadoEm > y.criadoEm ? -1 : 0);
  });
}

function linhasDoIdAporte_(aba, id) {
  if (aba.getLastRow() < 2) return [];
  var ids = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues();
  var out = [];
  ids.forEach(function (l, i) { if (String(l[0]) === id) out.push(i + 2); });
  return out;
}

function validarAporte_(a) {
  if (!a || typeof a !== 'object') throw new Error('aporte vazio');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.data || ''))) throw new Error('data inválida (use aaaa-mm-dd)');
  if (!STATUS_APORTE_TEXTO[a.status]) throw new Error('status inválido: ' + a.status);
  if (!Array.isArray(a.itens) || !a.itens.length) throw new Error('o aporte não tem nenhum ativo');
  a.itens.forEach(function (it) {
    if (CLASSES_APORTE.indexOf(it.classe) === -1) throw new Error('classe inválida: ' + it.classe);
    if (!String(it.ativo || '').trim()) throw new Error('ativo sem nome');
  });
}

/** Grava (ou regrava, com o mesmo id) um aporte. Concluído: ativo com valor final 0 sai (não comprou). */
function salvarAporte_(aporte) {
  validarAporte_(aporte);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    var aba = garantirAbaAportes_(ss);
    var id = String(aporte.id || '').trim() || ('AP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100));
    var existentes = linhasDoIdAporte_(aba, id);
    var criadoEm = existentes.length ? aba.getRange(existentes[0], 15).getValue() : new Date();
    var n = function (v) { var x = numeroAporte_(v); return x === null ? '' : x; };
    var itens = aporte.itens;
    if (aporte.status === 'concluido') {
      itens = itens.filter(function (it) { return Number(it.valorFinal) > 0; });
      if (!itens.length) throw new Error('nenhum ativo com valor pago: para desistir do aporte inteiro, use "Cancelar aporte"');
    }
    var agora = new Date();
    var linhas = itens.map(function (it) {
      return [id, dataPlanilhaLanc_(aporte.data), STATUS_APORTE_TEXTO[aporte.status], it.classe, String(it.ativo).trim(), String(it.instituicao || '').trim(),
        it.classe === 'acoesEua' ? 'USD' : 'BRL', n(it.qtdPlanejada), n(it.precoPlanejado), n(it.valorPlanejado),
        n(it.qtdFinal), n(it.precoFinal), n(it.valorFinal), String(aporte.observacao || ''), criadoEm || agora, agora];
    });
    for (var i = existentes.length - 1; i >= 0; i--) aba.deleteRow(existentes[i]);
    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, CABECALHO_APORTES.length).setValues(linhas);
    return id;
  } finally {
    trava.releaseLock();
  }
}

function excluirAporte_(id) {
  if (!id) throw new Error('id vazio');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_APORTES);
  if (!aba) return 0;
  var trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    var linhas = linhasDoIdAporte_(aba, id);
    for (var i = linhas.length - 1; i >= 0; i--) aba.deleteRow(linhas[i]);
    return linhas.length;
  } finally {
    trava.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// 26/09/2026: "momento de aporte" (Tiago: "Inclua uma área abaixo de cada
// ativo, em aportes, um resumo se é um bom momento ou não de aporte, segundo
// os indicadores, viés, e outras variáveis"). Aqui só junta os dados que a
// PRÓPRIA planilha já tem - Radar de oportunidades (P/VP, P/L, % desejado x
// atual, R$ a investir) e Objetivos da carteira; pra Renda Fixa, a taxa de
// hoje do Tesouro x a taxa média contratada. A leitura (bom/neutro/esperar)
// é feita no navegador (aportes-calc.js!momentoAporte).
// ---------------------------------------------------------------------------

/** Linha da planilha -> objeto de meta { desejado, atual, carteiraAtual, novaCarteira, valorInvestir }. */
function metaDaLinhaAporte_(l) {
  if (!l) return null;
  var n = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
  if (n(l[2]) === null && n(l[3]) === null) return null;
  return { desejado: n(l[2]), atual: n(l[3]), carteiraAtual: n(l[4]), novaCarteira: n(l[5]), valorInvestir: n(l[6]) };
}

/** Um bloco do Radar (lido de uma vez só): { TICKER: {...} }. cols = índices (0 = coluna A). */
function radarEmLoteAporte_(vals, primeiraLinha, cols) {
  var out = {};
  for (var i = primeiraLinha - 1; i < vals.length; i++) {
    var l = vals[i];
    var t = String(l[2] || '').trim().toUpperCase();
    if (!t) break;
    var n = function (k) { return cols[k] == null ? null : (typeof l[cols[k]] === 'number' && isFinite(l[cols[k]]) ? l[cols[k]] : null); };
    out[t] = {
      ranking: n('ranking'), pvp: n('pvp'), pl: n('pl'),
      descontoPl: cols.descontoPl == null ? null : String(l[cols.descontoPl] || '').trim() || null,
      percentualDesejado: n('desejado'), percentualAtual: n('atual'), valorInvestir: n('investir'),
      tipo: cols.tipo == null ? null : String(l[cols.tipo] || '').trim() || null
    };
  }
  return out;
}

function enriquecerMomentoAporte_(ss, classes) {
  var metas = {};
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (dm) {
    var local = localDistribuicaoMetas_(dm);
    var vals = dm.getRange(1, 1, Math.min(dm.getLastRow() || 1, 400), 19).getValues(); // A..S
    var radar = {
      acoes: radarEmLoteAporte_(vals, local.radarAcoes, { ranking: 1, pvp: 7, pl: 8, descontoPl: 10, desejado: 11, atual: 12, investir: 18 }),
      acoesEua: radarEmLoteAporte_(vals, local.radarUsa, { ranking: 1, pvp: 7, desejado: 10, atual: 11, investir: 16 }),
      fiis: radarEmLoteAporte_(vals, local.radarFiis, { ranking: 1, pvp: 7, desejado: 10, atual: 11, investir: 16, tipo: 18 })
    };
    ['acoes', 'fiis', 'acoesEua'].forEach(function (c) {
      (classes[c] || []).forEach(function (a) { a.radar = radar[c][a.ticker] || null; });
    });
    var linha = function (r) { return vals[r - 1] || null; };
    metas.acoesENacionais = metaDaLinhaAporte_(linha(11));
    metas.fiis = metaDaLinhaAporte_(linha(12));
    metas.rendaFixa = metaDaLinhaAporte_(linha(13));
    metas.rfEmergencial = metaDaLinhaAporte_(linha(19));
    metas.rfLongoPrazo = metaDaLinhaAporte_(linha(20));
    metas.acoes = metaDaLinhaAporte_(linha(34));
    metas.acoesEua = metaDaLinhaAporte_(linha(35));
    metas.fiisPorTipo = {};
    for (var k = 0; k < 3; k++) {
      var lf = linha(local.objetivosFiis + k);
      var tipo = lf ? String(lf[1] || '').trim() : '';
      if (tipo) metas.fiisPorTipo[tipo] = metaDaLinhaAporte_(lf);
    }
    var gastos = linha(11);
    if (gastos && typeof gastos[10] === 'number' && typeof gastos[11] === 'number') metas.reserva = { gastoMensal: gastos[10], meses: gastos[11], alvo: gastos[10] * gastos[11] };
  }

  // Renda Fixa: taxa de hoje (Tesouro) x taxa média contratada (RF Contratada - Resumo)
  var tesouro = {};
  try { tesouro = precosTesouroDireto_(); } catch (eT) { Logger.log('precosTesouroDireto_: ' + eT); }
  var contratada = {};
  var resumo = ss.getSheetByName(typeof ABA_RESUMO_RF_SUBPAGINA !== 'undefined' ? ABA_RESUMO_RF_SUBPAGINA : 'RF Contratada - Resumo');
  if (resumo && resumo.getLastRow() >= 2) {
    resumo.getRange(2, 1, resumo.getLastRow() - 1, 7).getValues().forEach(function (l) {
      if (!l[0]) return;
      contratada[chaveRfAporte_(String(l[0]).replace(/\s+/g, ' ').trim(), l[1])] = { indice: String(l[2] || '').trim(), taxa: typeof l[5] === 'number' ? l[5] : null, texto: String(l[6] || '').trim() || null };
    });
  }
  (classes.rendaFixa || []).forEach(function (t) {
    var chT = typeof chaveTesouro_ === 'function' ? chaveTesouro_(t.titulo) : null;
    var p = chT ? tesouro[chT] : null;
    t.taxaHoje = p && p.taxaCompra != null ? { taxa: p.taxaCompra / 100, pu: p.puCompra, data: p.dataBase } : null;
    t.taxaContratada = contratada[chaveRfAporte_(t.titulo, t.instituicao)] || null;
  });
  return { metas: metas };
}
