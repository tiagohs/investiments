/**
 * FnetInformesFii.gs - 25/09/2026 (Tiago, ponto 2 do feedback da tela do
 * ativo: "nos FIIs, nao tem tese, entao nao precisa disso aqui. MAS, cada
 * FIIS tem sua zona de informes relevantes, atulalizações sobre o fundo.
 * Seria possivel trazer isso?").
 *
 * Mesma fonte e o mesmo desenho de FnetProventos.gs (FNet, sistema de
 * documentos da B3/CVM) - só que aqui pega os documentos GERAIS do fundo
 * (fatos relevantes, comunicados ao mercado, relatórios gerenciais etc.),
 * não o "Aviso aos Cotistas" de proventos (esse já vira a lista de
 * Proventos, via FnetProventos.gs). Reaproveita, do MESMO projeto Apps
 * Script (escopo global, sem import): tickersFiiDaCarteira_,
 * garantirCnpjsFii_, comTentativasFnet_, FNET_BASE_URL_,
 * dataDeChaveProvento_, chaveDeCelulaProvento_ (todos em
 * FnetProventos.gs) e gravarRegistroControle_/chaveDiaISOInicio_.
 *
 * IMPORTANTE (25/09/2026, best-effort): ao contrário do endpoint de
 * proventos (idCategoriaDocumento=14&idTipoDocumento=41, testado e
 * funcionando ao vivo há alguns dias), este busca os documentos do fundo
 * SEM filtro de categoria (o FNet não documenta os IDs das categorias
 * "Fato Relevante"/"Comunicado ao Mercado" em lugar nenhum público que eu
 * achei) e descarta os de proventos pelo texto do tipo. A resposta exata
 * do FNet pra essa consulta mais ampla (quais campos vêm em cada
 * documento) NÃO foi conferida ao vivo ainda - rode
 * rodarInformesFnetDireto() uma vez no editor, confira o Logger e a aba
 * aux_informes-fii, e me avise se os títulos vierem estranhos (ou vazios)
 * pra eu ajustar extrairInformesFnet_/listarInformesFnet_ abaixo.
 *
 * Fluxo (1x por dia, gatilho próprio - ver instalarGatilhoDiarioInformesFnet):
 *  1) FIIs da carteira de hoje (mesma lista de tickersFiiDaCarteira_);
 *  2) os N documentos mais recentes de cada FII, direto da listagem (sem
 *     baixar o XML - o título já vem pronto, diferente dos proventos);
 *  3) grava/substitui aux_informes-fii (a aba inteira, mais simples que
 *     ir mesclando - são poucos documentos por fundo).
 *
 * O site lê só a planilha (Ativo.gs!informesFundoFii_) - rápido, sem
 * chamar o FNet na hora que a página do ativo abre.
 */

var ABA_INFORMES_FII = 'aux_informes-fii';
var CABECALHO_INFORMES_FII = ['Ticker', 'Categoria/Tipo', 'Assunto', 'Data', 'Documento FNet', 'Atualizado em'];
var FNET_INFORMES_POR_FII_ = 8;
var FNET_INFORMES_LIMITE_MS_ = 5 * 60 * 1000;
var FNET_INFORMES_FOLGA_POR_CHAMADA_MS_ = 75 * 1000;
// 05/10/2026 (A-48): a lista de cada FII sai em paralelo (UrlFetchApp.fetchAll em lotes de 10, Fontes.gs) com cota de
// tempo própria; guarda nas Propriedades um HASH da lista de cada FII - lista igual à da última vez = não regrava a aba
// nem apaga o cache das telas de ativo; FII que não respondeu/ficou sem tempo MANTÉM os informes que já estavam na aba
// (antes a aba era refeita só com o que veio, e o fundo "sumia" da tela até a próxima execução boa).
var PROP_FNET_INFORMES_HASH_ = 'FNET_INFORMES_HASH';
var PROP_FNET_PENDENTES_INF_ = 'FNET_PENDENTES_INF';

/** Rodar UMA vez no editor: gatilho diário ~12h20 (depois do de proventos, ~12h). */
function instalarGatilhoDiarioInformesFnet() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'gatilhoDiarioInformesFnet';
  });
  if (jaExiste) { Logger.log('Gatilho já existe, nada a fazer.'); return; }
  ScriptApp.newTrigger('gatilhoDiarioInformesFnet').timeBased().everyDays(1).atHour(12).nearMinute(20).create();
  Logger.log('Gatilho diário de informes de fundo (FNet) instalado - dispara por volta de 12h20.');
}

function gatilhoDiarioInformesFnet() {
  if (new Date().getDay() === 0) { Logger.log('Domingo - nada a fazer.'); return; }
  atualizarInformesFiiFnet_('Automático');
}

/** Roda na hora, pelo editor - rode 1x depois de subir este arquivo pra já ter dado antes do próximo gatilho. */
function rodarInformesFnetDireto() {
  var r = atualizarInformesFiiFnet_('Manual');
  Logger.log(r.status + ' - ' + r.detalhe);
}

/** Botão "Informes dos FIIs" do popover Registro de Controle (ver handleSincronizarProventosFnet). */
function handleSincronizarInformesFnet(e) {
  try {
    return jsonOut({ ok: true, resultado: atualizarInformesFiiFnet_('Manual') });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'sincronizarInformesFnet', erro: String(erro) });
  }
}

function atualizarInformesFiiFnet_(origem) {
  var inicio = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tickers = tickersFiiDaCarteira_(ss); // FnetProventos.gs
  var cnpjs = garantirCnpjsFii_(ss, tickers); // FnetProventos.gs
  var pend = lerListaPropFnet_(PROP_FNET_PENDENTES_INF_); // FnetProventos.gs
  tickers = tickers.filter(function (t) { return pend.indexOf(t) !== -1; }).concat(tickers.filter(function (t) { return pend.indexOf(t) === -1; }));

  var atuais = lerInformesPorTicker_(ss);
  var hashes = lerMapaPropFnet_(PROP_FNET_INFORMES_HASH_);
  var porTicker = {}; // ticker -> [informe]
  var falhas = [], semCnpj = [], naoProcessados = [];
  var motivoFalha = {};
  var agora = new Date();
  var mudaram = 0, iguais = 0;
  var temTempo = function () { return Date.now() - inicio < FNET_INFORMES_LIMITE_MS_ - FNET_INFORMES_FOLGA_POR_CHAMADA_MS_; };

  var comCnpj = [];
  tickers.forEach(function (t) { if (cnpjs[t]) comCnpj.push(t); else semCnpj.push(t); });
  var respostas = fnetBuscarEmLotes_(comCnpj.map(function (t) { return fnetPedidoInformes_(cnpjs[t], FNET_INFORMES_POR_FII_); }), temTempo); // FnetProventos.gs
  respostas.forEach(function (r, i) {
    var ticker = comCnpj[i];
    if (r.pulado && r.porTempo) { naoProcessados.push(ticker); return; }
    if (!r.ok) { falhas.push(ticker); motivoFalha[ticker] = r.erro || 'sem resposta'; return; }
    var docs;
    try { docs = fnetInformesDeTexto_(r.texto, FNET_INFORMES_POR_FII_); } catch (eJ) { falhas.push(ticker); motivoFalha[ticker] = 'resposta ilegível'; return; }
    var h = fonteHash_(JSON.stringify(docs)); // Fontes.gs
    var antes = atuais[ticker];
    if (hashes[ticker] === h && antes && antes.length === docs.length) { // mesma lista da última vez: aproveita o que já está na aba
      porTicker[ticker] = antes; iguais++; return;
    }
    hashes[ticker] = h;
    mudaram++;
    porTicker[ticker] = docs.map(function (d) { return { ticker: ticker, tipo: d.tipo, assunto: d.assunto, data: d.data, documento: d.id, atualizadoEm: agora }; });
  });
  // quem não respondeu (ou ficou sem tempo) mantém o que já estava na aba
  tickers.forEach(function (t) { if (!porTicker[t] && atuais[t]) porTicker[t] = atuais[t]; });
  var informes = [];
  tickers.forEach(function (t) { (porTicker[t] || []).forEach(function (i) { informes.push(i); }); });

  var abaExiste = !!ss.getSheetByName(ABA_INFORMES_FII);
  var removidos = Object.keys(atuais).some(function (t) { return tickers.indexOf(t) === -1; }); // saiu da carteira
  var regravou = mudaram > 0 || removidos || !abaExiste;
  if (regravou) {
    gravarInformesFii_(ss, informes);
    if (typeof invalidarCacheAtivos_ === 'function') invalidarCacheAtivos_(); // Ativo.gs (informes aparecem na tela do FII)
  }
  gravarMapaPropFnet_(PROP_FNET_INFORMES_HASH_, hashes);
  gravarListaPropFnet_(PROP_FNET_PENDENTES_INF_, naoProcessados.concat(falhas)); // FnetProventos.gs

  var partes = ['FNet (informes de fundo): ' + informes.length + ' documento(s) de ' + tickers.length + ' FII(s)' +
    (iguais ? ' (' + iguais + ' FII(s) sem novidade - aba não regravada)' : '')];
  if (semCnpj.length) partes.push('sem CNPJ (digite na aba ' + ABA_FII_CNPJ + '): ' + semCnpj.join(', '));
  if (falhas.length) partes.push('FNet não respondeu para: ' + falhas.map(function (t) { return t + ' (' + String(motivoFalha[t]).slice(0, 80) + ')'; }).join('; ') + ' - tenta de novo amanhã (os informes anteriores ficam na tela)');
  if (naoProcessados.length) partes.push('ficou pra próxima (tempo): ' + naoProcessados.join(', '));
  var status = (falhas.length === tickers.length && tickers.length) ? 'Erro' : ((falhas.length || semCnpj.length || naoProcessados.length) ? 'Atenção' : 'Sucesso');
  var detalhe = partes.join(' — ');
  try { gravarRegistroControle_(status, origem, detalhe); } catch (e) { Logger.log('Registro de Controle: ' + e); }
  return { status: status, detalhe: detalhe, total: informes.length, regravou: regravou };
}

/** Pedido (UrlFetchApp) dos documentos do fundo, qualquer categoria: pede 3x `quantos` (o "Aviso aos Cotistas" é filtrado depois). */
function fnetPedidoInformes_(cnpj, quantos) {
  return {
    url: FNET_BASE_URL_ + 'pesquisarGerenciadorDocumentosDados?d=0&s=0&l=' + (quantos * 3) +
      '&o%5B0%5D%5BdataEntrega%5D=desc&tipoFundo=1&cnpjFundo=' + cnpj,
    muteHttpExceptions: true, headers: FNET_CABECALHOS_ // FnetProventos.gs
  };
}

/**
 * Documentos mais recentes do fundo, qualquer categoria - pede 3x
 * `quantos` (a lista vem sem filtro de categoria) e filtra o "Aviso aos
 * Cotistas" (proventos, já mostrado em Proventos) pelo texto do tipo, até
 * ter `quantos`. Ver a nota grande no topo do arquivo sobre os campos.
 * (Uma consulta só; a rotina diária usa fetchAll via fnetPedidoInformes_.)
 */
function listarInformesFnet_(cnpj, quantos) {
  var p = fnetPedidoInformes_(cnpj, quantos);
  var resp = UrlFetchApp.fetch(p.url, { muteHttpExceptions: true, headers: p.headers });
  if (resp.getResponseCode() !== 200) throw new Error('FNet HTTP ' + resp.getResponseCode());
  return fnetInformesDeTexto_(resp.getContentText(), quantos);
}

/** Resposta da listagem -> [{ id, tipo, assunto, data }] (lança se não for o JSON esperado). */
function fnetInformesDeTexto_(texto, quantos) {
  var json = JSON.parse(texto);
  if (!json || (json.data != null && !Array.isArray(json.data))) throw new Error('FNet: resposta inesperada');
  // 03/10/2026 (conferido ao vivo no FNet): o aviso de provento vem como
  // categoriaDocumento "Aviso aos Cotistas - Estruturado" + tipoDocumento
  // "Rendimentos e Amortizações". O filtro antigo testava SÓ o tipo quando
  // ele existia (tipoDocumento || categoriaDocumento) - o aviso de provento
  // passava e virava "informe". Agora testa a categoria E o tipo.
  // E "assuntos" vem null: o título caía no nome do fundo (descricaoFundo)
  // em todos os documentos - agora usa o tipo (ex.: "Relatório Gerencial").
  return (json.data || [])
    .filter(function (d) {
      var cat = String(d.categoriaDocumento || ''), tipo = String(d.tipoDocumento || '');
      return !/aviso.*cotista/i.test(cat + ' | ' + tipo) && !/rendimentos?\s+e\s+amortiza/i.test(tipo);
    })
    .slice(0, quantos)
    .map(function (d) {
      var cat = String(d.categoriaDocumento || '').trim(), tipo = String(d.tipoDocumento || '').trim();
      return {
        id: String(d.id),
        tipo: cat || tipo,
        assunto: String(d.assuntos || tipo || cat || '').trim(),
        data: chaveDeCelulaProvento_(d.dataEntrega || d.dataReferencia) // FnetProventos.gs (aceita string dd/mm/aaaa e aaaa-mm-dd)
      };
    });
}

function gravarInformesFii_(ss, lista) {
  var aba = ss.getSheetByName(ABA_INFORMES_FII) || ss.insertSheet(ABA_INFORMES_FII);
  var ordenada = lista.slice().sort(function (a, b) {
    return (a.data || '') < (b.data || '') ? 1 : ((a.data || '') > (b.data || '') ? -1 : (a.ticker < b.ticker ? -1 : 1));
  });
  aba.clearContents();
  aba.getRange(1, 1, 1, CABECALHO_INFORMES_FII.length).setValues([CABECALHO_INFORMES_FII]);
  if (!ordenada.length) return;
  aba.getRange(2, 1, ordenada.length, CABECALHO_INFORMES_FII.length).setValues(ordenada.map(function (i) {
    return [i.ticker, i.tipo, i.assunto, dataDeChaveProvento_(i.data), i.documento, i.atualizadoEm]; // FnetProventos.gs
  }));
}

/**
 * Leitura pro site (Ativo.gs) - só os informes do ticker pedido, direto
 * da aba já atualizada (rápido, sem chamar o FNet na hora que a página
 * do ativo abre).
 */
function lerInformesFundoFii_(ss, ticker) {
  var aba = ss.getSheetByName(ABA_INFORMES_FII);
  if (!aba || aba.getLastRow() < 2) return { ok: true, itens: [] };
  var linhas = aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_INFORMES_FII.length).getValues();
  var itens = linhas.filter(function (l) { return String(l[0] || '').trim().toUpperCase() === String(ticker).toUpperCase(); })
    .map(function (l) {
      return {
        titulo: l[2] || l[1] || 'Documento do fundo',
        tipo: l[1] || '',
        data: chaveDeCelulaProvento_(l[3]), // FnetProventos.gs
        link: l[4] ? (FNET_BASE_URL_ + 'downloadDocumento?id=' + l[4]) : null
      };
    });
  return { ok: true, itens: itens };
}

/** Lê aux_informes-fii inteira, agrupada por ticker: { TICKER: [{ ticker, tipo, assunto, data, documento, atualizadoEm }] }. */
function lerInformesPorTicker_(ss) {
  var aba = ss.getSheetByName(ABA_INFORMES_FII);
  var out = {};
  if (!aba || aba.getLastRow() < 2) return out;
  aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_INFORMES_FII.length).getValues().forEach(function (l) {
    var t = String(l[0] || '').trim().toUpperCase();
    if (!t) return;
    (out[t] = out[t] || []).push({ ticker: t, tipo: String(l[1] || ''), assunto: String(l[2] || ''), data: chaveDeCelulaProvento_(l[3]), documento: String(l[4] || ''), atualizadoEm: l[5] }); // FnetProventos.gs
  });
  return out;
}

function lerMapaPropFnet_(chave) {
  try {
    var bruto = PropertiesService.getScriptProperties().getProperty(chave);
    var m = bruto ? JSON.parse(bruto) : {};
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) { return {}; }
}

function gravarMapaPropFnet_(chave, mapa) {
  try { PropertiesService.getScriptProperties().setProperty(chave, JSON.stringify(mapa || {})); } catch (e) { Logger.log('Propriedades: ' + e); }
}
