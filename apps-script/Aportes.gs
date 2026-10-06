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
// 05/10/2026: caixa em dólar (fluxo novo das Ações EUA): envio R$ -> US$ pela
// Remessa Online, aguardando a compra das ações. Aba criada sob demanda no 1º envio.
var ABA_CAIXA_DOLAR = 'aux_caixa_dolar';
var CABECALHO_CAIXA_DOLAR = ['ID', 'Data', 'Tipo', 'US$', 'R$ enviados', 'Cotação comercial', 'VET (R$ por US$)', 'Taxa de conversão', 'Encargos (IOF)', 'Aporte', 'Observação', 'Criado em'];
var TIPOS_CAIXA_DOLAR = { envio: 'Envio', uso: 'Uso', ajuste: 'Ajuste' };
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

/**
 * 06/10/2026 (Tiago: "ainda não vejo no header, ou em algum lugar visível em todo o site, que tenho
 * um carrinho em andamento" - era um aporte "Aguardando valores finais"): GET leve só com os aportes
 * aguardando (aux_aportes), pro aviso do header de todas as telas e de todos os aparelhos.
 */
function handleAportesPendentes(e, auth) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var todos = lerAportes_(ss);
    var aportes = todos.filter(function (a) { return a.status === 'aguardando'; });
    // 05/10/2026 (A-24): o header também avisa "N lançamentos a confirmar" (aporte concluído que a importação da B3 ainda não trouxe)
    return jsonOut({ ok: true, aportes: aportes, aConfirmar: lancamentosAConfirmarDaPlanilha_(ss, todos, null) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'aportesPendentes', erro: String(erro) });
  }
}

/** POST salvarAporte: e.parameter.aporte = JSON { id?, data, status, observacao, itens: [...] }. */
function handleSalvarAporte(e) {
  try {
    var aporte = JSON.parse(e.parameter.aporte || '{}');
    var id = salvarAporte_(aporte);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var aportes = lerAportes_(ss);
    return jsonOut({ ok: true, id: id, aportes: aportes, aConfirmar: lancamentosAConfirmarDaPlanilha_(ss, aportes, null) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'salvarAporte', erro: String(erro) });
  }
}

/** POST excluirAporte: e.parameter.id - cancela (aguardando) ou apaga (concluído). */
function handleExcluirAporte(e) {
  try {
    var removidas = excluirAporte_(String(e.parameter.id || ''));
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var aportes = lerAportes_(ss);
    return jsonOut({ ok: true, removidas: removidas, aportes: aportes, aConfirmar: lancamentosAConfirmarDaPlanilha_(ss, aportes, null) });
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
  var cambioHist = mapaCambioHistoricoAporte_(ss);
  var compras = comprasInvestidoComCache_(ss, abas, cambioHist);
  var classes = ativosParaAporte_(ss, abas, aportes, cambioHist);
  var contexto = null;
  try { contexto = enriquecerMomentoAporte_(ss, classes); } catch (eM) { Logger.log('enriquecerMomentoAporte_: ' + eM); }
  return {
    ok: true,
    hoje: chaveDiaISOInicio_(new Date()),
    cambio: cambioHojeAporte_(ss),
    classes: classes,
    metas: contexto ? contexto.metas : null,
    tesouro: contexto ? contexto.tesouroHoje : [], // 05/10/2026: PU de compra de hoje de cada título (mínimo = 1% do PU)
    caixaDolar: lerCaixaDolar_(ss), // 05/10/2026: dólares enviados aguardando compra
    aportes: aportes,
    aConfirmar: lancamentosAConfirmarDaPlanilha_(ss, aportes, abas), // 05/10/2026 (A-24): aporte concluído (B3/RF) sem lançamento
    resumo: resumoDeCompras_(compras),
    // 06/10/2026: "Aportes concluídos" reflete o "Investido por mês": os meses anteriores ao site, DERIVADOS das abas de transações
    // (nada é gravado), saem das MESMAS compras que somam o resumo - os totais batem.
    historicoPlanilha: historicoInvestido_(compras, aportes),
    lancamentos: listaLancamentosTela_(ss, abas, cambioHist)
  };
}

/**
 * 27/09/2026: câmbio USD histórico (1x por chamada de handleTransacoes),
 * reaproveitado pra converter em reais o "último pago" de Ações EUA
 * (ativosParaAporte_), o resumo por mês (resumoInvestido_) e os
 * lançamentos em dólar (listaLancamentosTela_) - sem reler
 * aux_historico-patrimonio 3x na mesma requisição (Tiago, 27/09/2026:
 * "sobre o trxf11... com isso, pode comecar" - mapa de compras + reais
 * no Novo aporte e nos Lançamentos).
 */
function mapaCambioHistoricoAporte_(ss) {
  try {
    var mapa = mapasDoPatrimonioParaProventos_(ss).mapaCambioUsd; // Proventos.gs
    return { mapa: mapa, chaves: Object.keys(mapa).sort() };
  } catch (e) {
    Logger.log('mapaCambioHistoricoAporte_: ' + e);
    return { mapa: {}, chaves: [] };
  }
}

/** Câmbio conhecido na data (ou o dia útil anterior mais próximo) - null se não tiver nenhum. */
function cambioNaDataAporte_(cambioHist, data) {
  if (!cambioHist || !cambioHist.chaves.length || !data) return null;
  var c = cambioUsdParaData_(cambioHist.mapa, cambioHist.chaves, data); // FluxoCaixaInicio.gs
  return typeof c === 'number' && isFinite(c) ? c : null;
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
function ativosParaAporte_(ss, abas, aportes, cambioHist) {
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
  // 27/09/2026: câmbio do dia da compra, pro Novo aporte mostrar o último
  // pago também em reais (conversão do dia + conversão de hoje).
  Object.keys(ultimasUsa).forEach(function (t) {
    var u = ultimasUsa[t];
    if (u && u.data) u.cambioDia = cambioNaDataAporte_(cambioHist, u.data);
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
  var ultimaRfAporte = rf ? ultimaLinhaReal_(rf, [1, 4], 9) : 0; // 05/10/2026 (A-31): última linha REAL da Carteira Renda Fixa
  if (rf && ultimaRfAporte >= 9) {
    var vistos = {};
    lerAbaUmaVez_(rf, 9, ultimaRfAporte - 8, 12).forEach(function (l) {
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

function comprasInvestidoComCache_(ss, abas, cambioHist) {
  var chave = 'tx_compras_v2_' + chaveDiaISOInicio_(new Date()) + '_' +
    ['transacoes', 'transacoesUsa', 'rendaFixa'].map(function (d) { return abas[d].itens.length; }).join('_');
  // 06/10/2026: a lista de compras (uma por linha das abas) passa de 100 KB: o cache em pedaços (CacheRespostas.gs) cuida disso
  if (typeof cacheDeResposta_ === 'function') return cacheDeResposta_('tx_compras', chave, 21600, function () { return comprasDaPlanilha_(ss, abas, cambioHist); });
  return comprasDaPlanilha_(ss, abas, cambioHist);
}

/** Compat.: o resumo por mês com cache. */
function resumoInvestidoComCache_(ss, abas, cambioHist) {
  return resumoDeCompras_(comprasInvestidoComCache_(ss, abas, cambioHist));
}

/** { 'aaaa-mm': { acoes, fiis, acoesEua, acoesEuaUsd, rendaFixa, total } } - só compras/aplicações. */
function resumoInvestido_(ss, abas, cambioHist) {
  return resumoDeCompras_(comprasDaPlanilha_(ss, abas, cambioHist));
}

/**
 * 06/10/2026: UMA fonte pro "Investido por mês" e pros "Aportes concluídos" derivados: as compras/aplicações das abas
 * Transações, Transações - USA (US$ x câmbio do dia da compra) e Transações Renda Fixa, uma por linha:
 * [{ d: 'aaaa-mm-dd', c: classe, a: ativo, i: instituição (RF), q: qtd, v: valor em R$, u: valor em US$ (EUA) }].
 */
function comprasDaPlanilha_(ss, abas, cambioHist) {
  var out = [];
  var add = function (data, classe, ativo, inst, qtd, valor, usd) {
    if (!data || !(valor > 0)) return;
    out.push({ d: data, c: classe, a: ativo, i: inst || '', q: qtd > 0 ? qtd : 0, v: valor, u: usd || 0 });
  };
  var classes = typeof classesDaCarteiraParaProventos_ === 'function' ? classesDaCarteiraParaProventos_(ss) : {};
  abas.transacoes.itens.forEach(function (it) {
    if (!/compra/i.test(it.tipo)) return;
    var classe = classes[it.ticker] === 'fiis' || (!classes[it.ticker] && /11$/.test(it.ticker)) ? 'fiis' : 'acoes';
    add(it.data, classe, it.ticker, '', it.qtd, (it.preco || 0) * (it.qtd || 0) + (it.taxa || 0), 0);
  });
  var ch = cambioHist || mapaCambioHistoricoAporte_(ss);
  abas.transacoesUsa.itens.forEach(function (it) {
    if (!/compra/i.test(it.tipo)) return;
    var usd = (it.preco || 0) * (it.qtd || 0) + (it.taxa || 0);
    var cambio = cambioNaDataAporte_(ch, it.data);
    add(it.data, 'acoesEua', it.ticker, '', it.qtd, usd * (cambio || 0), usd);
  });
  abas.rendaFixa.itens.forEach(function (it) {
    if (/compra|aplica/i.test(it.movimentacao)) add(it.data, 'rendaFixa', it.produto, it.instituicao, 0, it.valor || 0, 0);
  });
  return out;
}

function resumoDeCompras_(compras) {
  var meses = {};
  compras.forEach(function (c) {
    var m = c.d.slice(0, 7);
    var r = meses[m] || (meses[m] = { acoes: 0, fiis: 0, acoesEua: 0, acoesEuaUsd: 0, rendaFixa: 0, total: 0 });
    r[c.c] += c.v;
    r.total += c.v;
    if (c.u) r.acoesEuaUsd += c.u;
  });
  Object.keys(meses).forEach(function (m) {
    Object.keys(meses[m]).forEach(function (k) { meses[m][k] = Math.round(meses[m][k] * 100) / 100; });
  });
  return meses;
}

/**
 * 06/10/2026: "Aportes concluídos" derivado das transações. Tira das compras da planilha a parte que um aporte concluído
 * do site já cobre (mesmo critério do "a confirmar": mesmo ativo, lançamento de 2 dias antes a 10 depois da data do
 * aporte, o aporte mais antigo consome primeiro) e agrupa o resto por dia e classe.
 * -> { dias: [{ data, classe, valor, usd, itens: [{ ativo, inst, qtd, valor, usd }] }] (mais novo primeiro),
 *      cobertoSite: { 'aaaa-mm': valor que os aportes do site já cobrem } }
 * dias + cobertoSite = o "Investido por mês" de cada mês (o teste confere). Não grava nada.
 */
function historicoInvestido_(compras, aportes) {
  var arr = function (v) { return Math.round(v * 100) / 100; };
  var lista = compras.map(function (c) {
    var rf = c.c === 'rendaFixa';
    var medida = rf ? c.v : c.q;
    return {
      c: c, rf: rf, medida: medida, resta: medida, dia: diaDaChaveAporte_(c.d),
      destino: rf ? 'rendaFixa' : (c.c === 'acoesEua' ? 'transacoesUsa' : 'transacoes'),
      chave: rf ? normTextoLanc_(c.a) : String(c.a).trim().toUpperCase(), inst: rf ? normalizarInstituicaoRF_(c.i) : ''
    };
  });
  lista.sort(function (a, b) { return a.dia - b.dia; });
  var pedidos = [];
  (aportes || []).forEach(function (a) {
    if (a.status !== 'concluido') return;
    (a.itens || []).forEach(function (it) {
      if (it.classe === 'rendaFixa') {
        var valor = it.valorFinal > 0 ? it.valorFinal : it.valorPlanejado;
        if (valor > 0) pedidos.push({ data: a.data, destino: 'rendaFixa', chave: normTextoLanc_(it.ativo), inst: normalizarInstituicaoRF_(it.instituicao), medida: valor });
      } else if (it.classe === 'acoes' || it.classe === 'fiis' || it.classe === 'acoesEua') {
        var qtd = it.qtdFinal > 0 ? it.qtdFinal : it.qtdPlanejada;
        if (qtd > 0) pedidos.push({ data: a.data, destino: it.classe === 'acoesEua' ? 'transacoesUsa' : 'transacoes', chave: String(it.ativo).trim().toUpperCase(), medida: qtd });
      }
    });
  });
  pedidos.sort(function (x, y) { return x.data < y.data ? -1 : (x.data > y.data ? 1 : 0); });
  pedidos.forEach(function (p) {
    var dia = diaDaChaveAporte_(p.data);
    var coberto = 0;
    lista.forEach(function (l) {
      if (coberto >= p.medida || l.resta <= 0 || l.destino !== p.destino || l.chave !== p.chave) return;
      if (!(l.dia >= dia - ACONFIRMAR_DIAS_ANTES && l.dia <= dia + ACONFIRMAR_DIAS_DEPOIS)) return;
      if (p.destino === 'rendaFixa' && l.inst && p.inst && l.inst !== p.inst) return;
      var usa = Math.min(l.resta, p.medida - coberto);
      l.resta -= usa;
      coberto += usa;
    });
  });
  var cobertoSite = {};
  var grupos = {};
  lista.forEach(function (l) {
    var c = l.c;
    var fracao = l.medida > 0 ? Math.max(0, l.resta) / l.medida : 1;
    var coberto = c.v * (1 - fracao);
    if (coberto > 0.0049) cobertoSite[c.d.slice(0, 7)] = (cobertoSite[c.d.slice(0, 7)] || 0) + coberto;
    if (fracao <= 0.0001) return;
    var gk = c.d + '|' + c.c;
    var g = grupos[gk] || (grupos[gk] = { data: c.d, classe: c.c, valor: 0, usd: 0, mapa: {}, itens: [] });
    var ik = l.chave + '|' + l.inst;
    var it = g.mapa[ik];
    if (!it) { it = g.mapa[ik] = { ativo: c.a, inst: c.i || '', qtd: 0, valor: 0, usd: 0 }; g.itens.push(it); }
    it.qtd += c.q * fracao; it.valor += c.v * fracao; it.usd += c.u * fracao;
    g.valor += c.v * fracao; g.usd += c.u * fracao;
  });
  var ordemClasse = { acoes: 0, fiis: 1, acoesEua: 2, rendaFixa: 3 };
  var dias = Object.keys(grupos).map(function (k) { return grupos[k]; });
  dias.sort(function (a, b) { return a.data < b.data ? 1 : (a.data > b.data ? -1 : ordemClasse[a.classe] - ordemClasse[b.classe]); });
  dias.forEach(function (g) {
    delete g.mapa;
    g.valor = arr(g.valor); g.usd = arr(g.usd);
    g.itens.forEach(function (it) { it.qtd = Math.round(it.qtd * 1e6) / 1e6; it.valor = arr(it.valor); it.usd = arr(it.usd); });
    g.itens.sort(function (a, b) { return b.valor - a.valor; });
  });
  Object.keys(cobertoSite).forEach(function (m) { cobertoSite[m] = arr(cobertoSite[m]); });
  return { dias: dias, cobertoSite: cobertoSite };
}

// ---------------------------------------------------------------------------
// 05/10/2026 (A-24): lançamentos "a confirmar". Aporte de ação/FII (B3) ou de
// Renda Fixa marcado "Concluído" que ainda não tem o lançamento correspondente
// nas abas de Transações aparece na lista de Lançamentos (e no aviso do header)
// como "a confirmar" (Tiago: "ele só confirma via importação da B3"). Ações EUA
// ficam de fora. NADA é gravado: a lista é DERIVADA (aux_aportes concluídos x o
// que as abas Transações / Transações Renda Fixa têm), então quando a importação
// trouxer o lançamento equivalente o "a confirmar" some sozinho, sem duplicar e
// sem linha falsa na planilha.
// Equivalente = mesmo ativo (RF: mesmo título e instituição), compra dentro da
// janela de dias em volta da data do aporte e quantidade (RF: valor) coberta
// com tolerância. Cada lançamento real cobre no máximo um aporte (consumo).
// ---------------------------------------------------------------------------

var ACONFIRMAR_DIAS_ANTES = 2;   // lançamento real até 2 dias antes da data do aporte (data conferida na mão)
var ACONFIRMAR_DIAS_DEPOIS = 10; // ... e até 10 dias depois (a B3 lança pela data do negócio; o aporte pode ter sido concluído antes)
var ACONFIRMAR_TOLERANCIA = 0.02;

function diaDaChaveAporte_(chave) {
  var p = String(chave || '').split('-');
  return p.length === 3 ? Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000 : NaN;
}

/**
 * aportes (lerAportes_) + abas (lerAbasLanc_ com transacoes e rendaFixa) ->
 * [{ id, aporteId, destino, classe, data, ativo, tipo, qtd, preco, valor, moeda, inst, aConfirmar: true }] (mais novo primeiro).
 */
function lancamentosAConfirmar_(aportes, abas) {
  var arr = function (v, c) { return Math.round(v * Math.pow(10, c)) / Math.pow(10, c); };
  var compras = []; // lançamentos reais de compra, ainda não consumidos
  (abas.transacoes ? abas.transacoes.itens : []).forEach(function (it) {
    if (!/compra/i.test(it.tipo) || !(it.qtd > 0) || !it.data) return;
    compras.push({ destino: 'transacoes', chave: it.ticker, data: it.data, dia: diaDaChaveAporte_(it.data), resta: it.qtd });
  });
  (abas.rendaFixa ? abas.rendaFixa.itens : []).forEach(function (it) {
    if (!/compra|aplica/i.test(it.movimentacao) || !it.data) return;
    var valor = it.valor != null ? it.valor : (it.qtd || 0) * (it.preco || 0);
    if (!(valor > 0)) return;
    compras.push({ destino: 'rendaFixa', chave: normTextoLanc_(it.produto), inst: normalizarInstituicaoRF_(it.instituicao), data: it.data, dia: diaDaChaveAporte_(it.data), resta: valor });
  });
  compras.sort(function (a, b) { return a.dia - b.dia; });

  var pedidos = [];
  aportes.forEach(function (a) {
    if (a.status !== 'concluido') return;
    (a.itens || []).forEach(function (it) {
      if (it.classe === 'rendaFixa') {
        var valor = it.valorFinal > 0 ? it.valorFinal : it.valorPlanejado;
        if (!(valor > 0)) return;
        pedidos.push({ aporte: a, it: it, destino: 'rendaFixa', classe: 'rendaFixa', chave: normTextoLanc_(it.ativo), inst: normalizarInstituicaoRF_(it.instituicao), medida: valor, qtd: null, preco: null });
      } else if (it.classe === 'acoes' || it.classe === 'fiis') {
        var qtd = it.qtdFinal > 0 ? it.qtdFinal : it.qtdPlanejada;
        if (!(qtd > 0)) return;
        var preco = it.precoFinal > 0 ? it.precoFinal : it.precoPlanejado;
        pedidos.push({ aporte: a, it: it, destino: 'transacoes', classe: it.classe, chave: String(it.ativo).trim().toUpperCase(), medida: qtd, qtd: qtd, preco: preco > 0 ? preco : null });
      }
    });
  });
  pedidos.sort(function (x, y) { return x.aporte.data < y.aporte.data ? -1 : (x.aporte.data > y.aporte.data ? 1 : 0); }); // o aporte mais antigo consome primeiro

  var out = [];
  pedidos.forEach(function (p) {
    var dia = diaDaChaveAporte_(p.aporte.data);
    var coberto = 0;
    compras.forEach(function (c) {
      if (coberto >= p.medida || c.resta <= 0 || c.destino !== p.destino || c.chave !== p.chave) return;
      if (!(c.dia >= dia - ACONFIRMAR_DIAS_ANTES && c.dia <= dia + ACONFIRMAR_DIAS_DEPOIS)) return;
      if (p.destino === 'rendaFixa' && c.inst && p.inst && c.inst !== p.inst) return;
      var usa = Math.min(c.resta, p.medida - coberto);
      c.resta -= usa;
      coberto += usa;
    });
    if (coberto >= p.medida * (1 - ACONFIRMAR_TOLERANCIA) - 0.0001) return; // já lançado
    var falta = p.medida - coberto;
    var item = {
      id: 'AC-' + p.aporte.id + '-' + p.classe + '-' + p.it.ativo, aporteId: p.aporte.id, destino: p.destino, classe: p.classe,
      data: p.aporte.data, ativo: p.it.ativo, tipo: 'Compra', moeda: 'BRL', aConfirmar: true
    };
    if (p.destino === 'rendaFixa') {
      item.qtd = null; item.preco = null; item.valor = arr(falta, 2); item.inst = p.it.instituicao || '';
    } else {
      item.qtd = arr(falta, 6); item.preco = p.preco != null ? arr(p.preco, 4) : null; item.valor = p.preco != null ? arr(falta * p.preco, 2) : null;
    }
    out.push(item);
  });
  out.sort(function (x, y) { return x.data < y.data ? 1 : (x.data > y.data ? -1 : 0); });
  return out;
}

/** Igual a lancamentosAConfirmar_, mas lendo as abas aqui e sem nunca derrubar a tela (lista vazia se algo falhar). */
function lancamentosAConfirmarDaPlanilha_(ss, aportes, abas) {
  try {
    var lidas = abas && abas.transacoes && abas.rendaFixa ? abas : lerAbasLanc_(ss, ['transacoes', 'rendaFixa']);
    return lancamentosAConfirmar_(aportes || lerAportes_(ss), lidas);
  } catch (erro) {
    Logger.log('lancamentosAConfirmar_: ' + erro);
    return [];
  }
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
  var trava = travaRecurso_('carteira', 'aportes/lançamentos');
  trava.waitLock(20000);
  var id;
  try {
    var aba = garantirAbaAportes_(ss);
    id = String(aporte.id || '').trim() || ('AP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100));
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
  } finally {
    trava.releaseLock();
  }
  // 05/10/2026: aporte concluído com Ações EUA gasta o caixa em dólar (fora da trava: o caixa tem a sua)
  try { registrarUsoCaixaDolar_(ss, id, aporte); } catch (eC) { Logger.log('registrarUsoCaixaDolar_: ' + eC); }
  return id;
}

function excluirAporte_(id) {
  if (!id) throw new Error('id vazio');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_APORTES);
  if (!aba) return 0;
  var trava = travaRecurso_('carteira', 'aportes/lançamentos');
  trava.waitLock(20000);
  var removidas = 0;
  try {
    var linhas = linhasDoIdAporte_(aba, id);
    for (var i = linhas.length - 1; i >= 0; i--) aba.deleteRow(linhas[i]);
    removidas = linhas.length;
  } finally {
    trava.releaseLock();
  }
  // 05/10/2026: aporte excluído devolve o que tinha gasto do caixa em dólar
  try { registrarUsoCaixaDolar_(ss, id, null); } catch (eC) { Logger.log('registrarUsoCaixaDolar_: ' + eC); }
  return removidas;
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
    // 05/10/2026: cotação do título (PU de compra do dia) - Tesouro Direto; os outros ficam sem
    t.cotacao = p && p.puCompra > 0 ? { pu: p.puCompra, puVenda: p.puVenda, data: p.dataBase } : null;
    t.taxaContratada = contratada[chaveRfAporte_(t.titulo, t.instituicao)] || null;
  });
  // 05/10/2026: tudo que o Tesouro vende hoje (título novo na Renda Fixa: "Tesouro Selic 2032")
  var tesouroHoje = Object.keys(tesouro).map(function (k) {
    var p = tesouro[k];
    return { nome: p.tipo + ' ' + String(p.vencimento).slice(0, 4), tipo: p.tipo, vencimento: p.vencimento, pu: p.puCompra, puVenda: p.puVenda, taxa: p.taxaCompra, data: p.dataBase };
  }).filter(function (t) { return t.pu > 0; }).sort(function (a, b) { return a.nome < b.nome ? -1 : (a.nome > b.nome ? 1 : 0); });
  return { metas: metas, tesouroHoje: tesouroHoje };
}

// ---------------------------------------------------------------------------
// 05/10/2026: caixa em dólar (Tiago: "primeiro envio BRL->USD pela Remessa
// Online (taxas médias e quanto chega), depois divido os dólares entre as
// ações. Às vezes só envio e compro depois"). Aba aux_caixa_dolar (criada no
// 1º envio; você pode olhar/editar na planilha): ID | Data | Tipo (Envio / Uso /
// Ajuste) | US$ | R$ enviados | Cotação comercial | VET | Taxa de conversão |
// Encargos | Aporte | Observação | Criado em.
//  - Envio: dólares que chegaram da Remessa Online (US$ positivo); guarda as
//    taxas usadas, que viram o padrão da próxima estimativa.
//  - Uso: gerado sozinho quando um aporte com Ações EUA é CONCLUÍDO (US$
//    negativo = total pago nas ações); sai se o aporte for excluído.
//  - Ajuste: acerto manual do saldo (ex.: dólar que já estava na corretora).
// Saldo = soma da coluna US$. Sem a aba (nunca usou o fluxo), nada muda.
// ---------------------------------------------------------------------------

/** POST salvarCaixaDolar: e.parameter.mov = JSON { id?, data, tipo: 'envio'|'ajuste', usd, reais?, comercial?, vet?, conversao?, encargos?, observacao? }. */
function handleSalvarCaixaDolar(e) {
  try {
    var mov = JSON.parse(e.parameter.mov || '{}');
    var id = salvarMovimentoCaixaDolar_(mov);
    return jsonOut({ ok: true, id: id, caixaDolar: lerCaixaDolar_(SpreadsheetApp.getActiveSpreadsheet()) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'salvarCaixaDolar', erro: String(erro) });
  }
}

/** POST excluirCaixaDolar: e.parameter.id - só envio/ajuste (o "uso" sai junto com o aporte). */
function handleExcluirCaixaDolar(e) {
  try {
    var removidas = excluirMovimentoCaixaDolar_(String(e.parameter.id || ''));
    return jsonOut({ ok: true, removidas: removidas, caixaDolar: lerCaixaDolar_(SpreadsheetApp.getActiveSpreadsheet()) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'excluirCaixaDolar', erro: String(erro) });
  }
}

function tipoDoTextoCaixa_(s) {
  var t = String(s || '').toLowerCase();
  if (/uso/.test(t)) return 'uso';
  if (/ajuste/.test(t)) return 'ajuste';
  return 'envio';
}

/** { saldoUsd, movimentos: [{ id, data, tipo, usd, reais, comercial, vet, conversao, encargos, aporteId, observacao }] } - mais novo primeiro. */
function lerCaixaDolar_(ss) {
  var aba = ss.getSheetByName(ABA_CAIXA_DOLAR);
  if (!aba || aba.getLastRow() < 2) return { saldoUsd: 0, movimentos: [] };
  var saldo = 0;
  var movimentos = [];
  aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_CAIXA_DOLAR.length).getValues().forEach(function (l) {
    var id = String(l[0] || '').trim();
    var usd = numeroAporte_(l[3]);
    if (!id || usd === null) return;
    saldo += usd;
    movimentos.push({
      id: id, data: chaveDataLanc_(l[1]), tipo: tipoDoTextoCaixa_(l[2]), usd: usd, reais: numeroAporte_(l[4]), comercial: numeroAporte_(l[5]),
      vet: numeroAporte_(l[6]), conversao: numeroAporte_(l[7]), encargos: numeroAporte_(l[8]), aporteId: String(l[9] || '').trim(), observacao: String(l[10] || '')
    });
  });
  movimentos.sort(function (a, b) { return a.data < b.data ? 1 : (a.data > b.data ? -1 : 0); });
  return { saldoUsd: Math.round(saldo * 100) / 100, movimentos: movimentos };
}

function garantirAbaCaixaDolar_(ss) {
  var aba = ss.getSheetByName(ABA_CAIXA_DOLAR);
  if (!aba) {
    aba = ss.insertSheet(ABA_CAIXA_DOLAR);
    aba.getRange(1, 1, 1, CABECALHO_CAIXA_DOLAR.length).setValues([CABECALHO_CAIXA_DOLAR]);
  }
  return aba;
}

function salvarMovimentoCaixaDolar_(mov) {
  if (!mov || typeof mov !== 'object') throw new Error('movimento vazio');
  var tipo = String(mov.tipo || 'envio');
  if (tipo !== 'envio' && tipo !== 'ajuste') throw new Error('tipo inválido: ' + tipo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(mov.data || ''))) throw new Error('data inválida (use aaaa-mm-dd)');
  var usd = numeroAporte_(mov.usd);
  if (usd === null || usd === 0) throw new Error('informe os dólares');
  if (tipo === 'envio' && usd < 0) throw new Error('um envio tem dólar positivo (para tirar, use ajuste)');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trava = travaRecurso_('carteira', 'aportes/lançamentos');
  trava.waitLock(20000);
  try {
    var aba = garantirAbaCaixaDolar_(ss);
    var id = String(mov.id || '').trim() || ('CX-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100));
    var n = function (v) { var x = numeroAporte_(v); return x === null ? '' : x; };
    var linha = [id, dataPlanilhaLanc_(mov.data), TIPOS_CAIXA_DOLAR[tipo], usd, n(mov.reais), n(mov.comercial), n(mov.vet), n(mov.conversao), n(mov.encargos), '', String(mov.observacao || ''), new Date()];
    var existentes = aba.getLastRow() >= 2 ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues() : [];
    var achada = 0;
    existentes.forEach(function (l, i) { if (String(l[0]) === id) achada = i + 2; });
    if (achada) aba.getRange(achada, 1, 1, linha.length).setValues([linha]);
    else aba.getRange(aba.getLastRow() + 1, 1, 1, linha.length).setValues([linha]);
    return id;
  } finally {
    trava.releaseLock();
  }
}

function excluirMovimentoCaixaDolar_(id) {
  if (!id) throw new Error('id vazio');
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_CAIXA_DOLAR);
  if (!aba || aba.getLastRow() < 2) return 0;
  var trava = travaRecurso_('carteira', 'aportes/lançamentos');
  trava.waitLock(20000);
  try {
    var vals = aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_CAIXA_DOLAR.length).getValues();
    var removidas = 0;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]) !== id) continue;
      if (tipoDoTextoCaixa_(vals[i][2]) === 'uso') throw new Error('o uso do caixa sai sozinho quando o aporte é excluído');
      aba.deleteRow(i + 2);
      removidas++;
    }
    return removidas;
  } finally {
    trava.releaseLock();
  }
}

/**
 * Aporte concluído com Ações EUA -> linha "Uso" (US$ negativo, id CX-USO-<aporte>);
 * aporte nulo (excluído) ou sem Ações EUA pagas -> remove a linha. Só mexe se a
 * aba do caixa existe (quem nunca enviou dólar pelo fluxo novo não é afetado).
 */
function registrarUsoCaixaDolar_(ss, aporteId, aporte) {
  var aba = ss.getSheetByName(ABA_CAIXA_DOLAR);
  if (!aba || !aporteId) return;
  var idUso = 'CX-USO-' + aporteId;
  var usd = 0;
  if (aporte && aporte.status === 'concluido') {
    (aporte.itens || []).forEach(function (it) {
      if (it.classe === 'acoesEua' && Number(it.valorFinal) > 0) usd += Math.round(Number(it.valorFinal) * 100) / 100; // 05/10/2026 (A-23): cada ação ao centavo, como a corretora cobra
    });
  }
  usd = Math.round(usd * 100) / 100;
  var trava = travaRecurso_('carteira', 'aportes/lançamentos');
  trava.waitLock(20000);
  try {
    if (aba.getLastRow() >= 2) {
      var ids = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === idUso) aba.deleteRow(i + 2);
    }
    if (usd > 0) {
      aba.getRange(aba.getLastRow() + 1, 1, 1, CABECALHO_CAIXA_DOLAR.length).setValues([[idUso, dataPlanilhaLanc_(aporte.data), TIPOS_CAIXA_DOLAR.uso, -usd, '', '', '', '', '', aporteId, 'Compra de ações EUA (aporte concluído)', new Date()]]);
    }
  } finally {
    trava.releaseLock();
  }
}
