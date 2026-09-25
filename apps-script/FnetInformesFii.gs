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

function atualizarInformesFiiFnet_(origem) {
  var inicio = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tickers = tickersFiiDaCarteira_(ss); // FnetProventos.gs
  var cnpjs = garantirCnpjsFii_(ss, tickers); // FnetProventos.gs

  var informes = [];
  var falhas = [], semCnpj = [], naoProcessados = [];
  var agora = new Date();
  var temTempo = function () { return Date.now() - inicio < FNET_INFORMES_LIMITE_MS_ - FNET_INFORMES_FOLGA_POR_CHAMADA_MS_; };

  tickers.forEach(function (ticker) {
    if (!temTempo()) { naoProcessados.push(ticker); return; }
    var cnpj = cnpjs[ticker];
    if (!cnpj) { semCnpj.push(ticker); return; }
    try {
      var docs = comTentativasFnet_(function () { return listarInformesFnet_(cnpj, FNET_INFORMES_POR_FII_); }, temTempo); // FnetProventos.gs
      docs.forEach(function (d) {
        informes.push({ ticker: ticker, tipo: d.tipo, assunto: d.assunto, data: d.data, documento: d.id, atualizadoEm: agora });
      });
    } catch (erro) {
      falhas.push(ticker + ' (' + String(erro).slice(0, 80) + ')');
    }
  });

  gravarInformesFii_(ss, informes);

  var partes = ['FNet (informes de fundo): ' + informes.length + ' documento(s) de ' + tickers.length + ' FII(s)'];
  if (semCnpj.length) partes.push('sem CNPJ (digite na aba ' + ABA_FII_CNPJ + '): ' + semCnpj.join(', '));
  if (falhas.length) partes.push('FNet não respondeu para: ' + falhas.join('; ') + ' - tenta de novo amanhã');
  if (naoProcessados.length) partes.push('ficou pra próxima (tempo): ' + naoProcessados.join(', '));
  var status = (falhas.length === tickers.length && tickers.length) ? 'Erro' : ((falhas.length || semCnpj.length || naoProcessados.length) ? 'Atenção' : 'Sucesso');
  var detalhe = partes.join(' — ');
  try { gravarRegistroControle_(status, origem, detalhe); } catch (e) { Logger.log('Registro de Controle: ' + e); }
  return { status: status, detalhe: detalhe, total: informes.length };
}

/**
 * Documentos mais recentes do fundo, qualquer categoria - pede 3x
 * `quantos` (a lista vem sem filtro de categoria) e filtra o "Aviso aos
 * Cotistas" (proventos, já mostrado em Proventos) pelo texto do tipo, até
 * ter `quantos`. Ver a nota grande no topo do arquivo sobre os campos.
 */
function listarInformesFnet_(cnpj, quantos) {
  var url = FNET_BASE_URL_ + 'pesquisarGerenciadorDocumentosDados?d=0&s=0&l=' + (quantos * 3) +
    '&o%5B0%5D%5BdataEntrega%5D=desc&tipoFundo=1&cnpjFundo=' + cnpj;
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (resp.getResponseCode() !== 200) throw new Error('FNet HTTP ' + resp.getResponseCode());
  var json = JSON.parse(resp.getContentText());
  return (json.data || [])
    .filter(function (d) { return !/aviso.*cotista/i.test(String(d.tipoDocumento || d.categoriaDocumento || '')); })
    .slice(0, quantos)
    .map(function (d) {
      return {
        id: String(d.id),
        tipo: String(d.categoriaDocumento || d.tipoDocumento || '').trim(),
        assunto: String(d.assuntos || d.descricaoFundo || '').trim(),
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
