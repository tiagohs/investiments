/**
 * FnetProventos.gs - 24/09/2026 (Tiago: "seguiremos então com o grátis,
 * usando FNet" - proventos a receber, confirmados, dos FIIs).
 *
 * Todo FII é obrigado a publicar no FNet (sistema de documentos da B3) um
 * "Aviso aos Cotistas - Estruturado" a cada rendimento/amortização: um XML
 * padronizado com o ticker (CodNegociacao), a data base (= data com), o
 * valor por cota e a data de pagamento. É a fonte OFICIAL e gratuita - a
 * mesma que os sites de proventos usam.
 *
 * Fluxo (1x por dia, gatilho próprio - ver instalarGatilhoDiarioProventosFnet):
 *  1) FIIs da carteira de hoje (Auxiliar_ativos, classe "FIIs", quantidade > 0);
 *  2) CNPJ de cada um (o FNet pesquisa por CNPJ): aba aux_fii-cnpj - criada
 *     sozinha com os conhecidos (CNPJ_FII_CONHECIDOS_); FII novo tenta o
 *     cadastro aberto da CVM (ISIN) e, se não achar com certeza, avisa no
 *     Registro de Controle pra você digitar o CNPJ nessa aba;
 *  3) os 3 documentos estruturados mais recentes de cada FII - cada
 *     documento é baixado UMA vez só (ids guardados nas Propriedades do
 *     script), então o custo diário é ~1 consulta por FII;
 *  4) grava/atualiza aux_proventos-anunciados (1 linha por provento; um
 *     documento mais novo - retificação - substitui o valor).
 *
 * O site lê só a planilha (Proventos.gs!montarProventosAnunciados_):
 * quantidade na data com (pelas Transações) x valor por cota = quanto você
 * recebe, e marca o que já está lançado na aba Proventos.
 *
 * O FNet é lento e às vezes não responde (visto em 24/09/2026: consultas
 * de 60s+ sem resposta) - cada FII tem 2 tentativas e a rotina para com
 * folga antes do limite de 6min do Apps Script; o que faltar fica pro dia
 * seguinte (só documentos novos são baixados, então nada se perde).
 *
 * Sem XmlService de propósito: o XML é pequeno e fixo, e lendo com
 * expressões simples o MESMO código roda no harness de testes (Node).
 */

var ABA_PROVENTOS_ANUNCIADOS = 'aux_proventos-anunciados';
var CABECALHO_PROVENTOS_ANUNCIADOS = ['Ticker', 'Tipo', 'Data com', 'Data pagamento', 'Valor por cota', 'Isento IR', 'Documento FNet', 'Atualizado em'];
var ABA_FII_CNPJ = 'aux_fii-cnpj';
var CABECALHO_FII_CNPJ = ['Ticker', 'CNPJ', 'Origem', 'Atualizado em'];
var FNET_BASE_URL_ = 'https://fnet.bmfbovespa.com.br/fnet/publico/';
var FNET_DOCS_POR_FII_ = 3;
var FNET_LIMITE_MS_ = 5 * 60 * 1000;
// uma chamada ao FNet que não responde pode segurar ~1 min: só começa outra
// se ainda sobrar esse tanto antes do limite (e a aba é salva a cada FII,
// então nem uma execução interrompida perde o que já leu)
var FNET_FOLGA_POR_CHAMADA_MS_ = 75 * 1000;
var PROP_FNET_DOCS_PROCESSADOS_ = 'FNET_DOCS_PROCESSADOS';

// CNPJs conferidos em 24/09/2026 (o XML do FNet de cada um traz o próprio
// ticker em CodNegociacao). Dado público do fundo - pode ficar no código.
var CNPJ_FII_CONHECIDOS_ = {
  BTLG11: '11839593000109',
  GARE11: '37295919000160',
  PMLL11: '26499833000132',
  VGIP11: '34197811000146',
  TRXF11: '28548288000152',
  RECR11: '28152272000126',
  RBRY11: '30166700000111',
  KNUQ11: '42754362000118',
  HGRU11: '29641226000153',
  XPML11: '28757546000100'
};

// ---------------------------------------------------------------------------
// Gatilho / execução manual
// ---------------------------------------------------------------------------

/** Rodar UMA vez no editor: gatilho diário ~12h (depois dos de 10h/11h). */
function instalarGatilhoDiarioProventosFnet() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'gatilhoDiarioProventosFnet';
  });
  if (jaExiste) { Logger.log('Gatilho já existe, nada a fazer.'); return; }
  ScriptApp.newTrigger('gatilhoDiarioProventosFnet').timeBased().everyDays(1).atHour(12).nearMinute(1).create();
  Logger.log('Gatilho diário de proventos (FNet) instalado - dispara por volta de 12h.');
}

function gatilhoDiarioProventosFnet() {
  if (new Date().getDay() === 0) { Logger.log('Domingo - nada a fazer.'); return; }
  atualizarProventosAnunciadosFii_('Automático');
}

/** Roda na hora, pelo editor. */
function rodarProventosFnetDireto() {
  var r = atualizarProventosAnunciadosFii_('Manual');
  Logger.log(r.status + ' - ' + r.detalhe);
}

// ---------------------------------------------------------------------------
// Rotina diária
// ---------------------------------------------------------------------------

function atualizarProventosAnunciadosFii_(origem) {
  var inicio = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tickers = tickersFiiDaCarteira_(ss);
  var cnpjs = garantirCnpjsFii_(ss, tickers);
  var processados = lerDocsFnetProcessados_();

  var anunciados = lerProventosAnunciados_(ss);
  var porChave = {};
  anunciados.forEach(function (p, i) { porChave[chaveProventoAnunciado_(p)] = i; });

  var novos = 0, atualizados = 0, docsLidos = 0;
  var falhas = [], semCnpj = [], naoProcessados = [];
  var agora = new Date();

  var temTempo = function () { return Date.now() - inicio < FNET_LIMITE_MS_ - FNET_FOLGA_POR_CHAMADA_MS_; };
  tickers.forEach(function (ticker) {
    if (!temTempo()) { naoProcessados.push(ticker); return; }
    var cnpj = cnpjs[ticker];
    if (!cnpj) { semCnpj.push(ticker); return; }
    var mudou = false;
    try {
      var docs = comTentativasFnet_(function () { return listarDocumentosFnet_(cnpj, FNET_DOCS_POR_FII_); }, temTempo);
      docs.forEach(function (doc) {
        if (processados[doc.id]) return;
        if (!temTempo()) { if (naoProcessados.indexOf(ticker) === -1) naoProcessados.push(ticker); return; }
        var xml = comTentativasFnet_(function () { return baixarDocumentoFnet_(doc.id); }, temTempo);
        docsLidos++;
        extrairProventosDoXmlFnet_(xml, ticker).forEach(function (p) {
          p.documento = doc.id;
          p.atualizadoEm = agora;
          var chave = chaveProventoAnunciado_(p);
          if (porChave.hasOwnProperty(chave)) {
            var atual = anunciados[porChave[chave]];
            if (Number(doc.id) >= Number(atual.documento || 0)) { // retificação: o documento mais novo vale
              if (atual.valor !== p.valor || atual.isento !== p.isento) atualizados++;
              anunciados[porChave[chave]] = p;
            }
          } else {
            porChave[chave] = anunciados.length;
            anunciados.push(p);
            novos++;
          }
        });
        processados[doc.id] = 1;
        mudou = true;
      });
    } catch (erro) {
      falhas.push(ticker + ' (' + String(erro).slice(0, 80) + ')');
    }
    if (mudou) {
      gravarProventosAnunciados_(ss, anunciados);
      gravarDocsFnetProcessados_(processados);
    }
  });

  var partes = ['FNet (proventos de FIIs): ' + novos + ' novo(s), ' + atualizados + ' atualizado(s), ' + docsLidos + ' documento(s) lido(s) de ' + tickers.length + ' FII(s)'];
  if (semCnpj.length) partes.push('sem CNPJ (digite na aba ' + ABA_FII_CNPJ + '): ' + semCnpj.join(', '));
  if (falhas.length) partes.push('FNet não respondeu para: ' + falhas.join('; ') + ' - tenta de novo amanhã');
  if (naoProcessados.length) partes.push('ficou pra próxima (tempo): ' + naoProcessados.join(', '));
  var status = (falhas.length === tickers.length && tickers.length) ? 'Erro' : ((falhas.length || semCnpj.length || naoProcessados.length) ? 'Atenção' : 'Sucesso');
  var detalhe = partes.join(' — ');
  try { gravarRegistroControle_(status, origem, detalhe); } catch (e) { Logger.log('Registro de Controle: ' + e); }
  if (status === 'Erro') notificarFalhaSincronizacao_(origem, detalhe);
  return { status: status, detalhe: detalhe, novos: novos, atualizados: atualizados };
}

/** FIIs com quantidade > 0 hoje (Auxiliar_ativos: A=Classe, B=Ticker, H=Quantidade). */
function tickersFiiDaCarteira_(ss) {
  var aba = ss.getSheetByName('Auxiliar_ativos');
  if (!aba || aba.getLastRow() < 2) return [];
  var vistos = {};
  return aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues().filter(function (l) {
    var t = String(l[1] || '').trim().toUpperCase();
    if (l[0] !== 'FIIs' || !t || !(Number(l[7]) > 0) || vistos[t]) return false;
    vistos[t] = 1;
    return true;
  }).map(function (l) { return String(l[1]).trim().toUpperCase(); });
}

// ---------------------------------------------------------------------------
// CNPJ de cada FII (aba aux_fii-cnpj)
// ---------------------------------------------------------------------------

function garantirCnpjsFii_(ss, tickers) {
  var aba = ss.getSheetByName(ABA_FII_CNPJ) || ss.insertSheet(ABA_FII_CNPJ);
  var mapa = {}, linhas = [];
  if (aba.getLastRow() >= 2) {
    aba.getRange(2, 1, aba.getLastRow() - 1, 4).getValues().forEach(function (l) {
      var t = String(l[0] || '').trim().toUpperCase();
      var c = String(l[1] || '').replace(/\D/g, '');
      if (!t) return;
      linhas.push(l);
      if (c.length === 14) mapa[t] = c;
    });
  }
  var faltando = tickers.filter(function (t) { return !mapa[t]; });
  var novos = [];
  faltando.forEach(function (t) {
    if (CNPJ_FII_CONHECIDOS_[t]) { mapa[t] = CNPJ_FII_CONHECIDOS_[t]; novos.push([t, mapa[t], 'Conferido no FNet', new Date()]); }
  });
  faltando = faltando.filter(function (t) { return !mapa[t]; });
  if (faltando.length) {
    try {
      var daCvm = cnpjsFiiPeloIsinCvm_(faltando);
      Object.keys(daCvm).forEach(function (t) { mapa[t] = daCvm[t]; novos.push([t, daCvm[t], 'CVM (ISIN) - confira', new Date()]); });
    } catch (erro) {
      Logger.log('CNPJ pela CVM falhou: ' + erro);
    }
  }
  if (novos.length || aba.getLastRow() < 1) {
    var todas = linhas.filter(function (l) { return !novos.some(function (n) { return n[0] === String(l[0]).trim().toUpperCase(); }); }).concat(novos);
    aba.clearContents();
    aba.getRange(1, 1, 1, CABECALHO_FII_CNPJ.length).setValues([CABECALHO_FII_CNPJ]);
    if (todas.length) aba.getRange(2, 1, todas.length, 4).setValues(todas);
  }
  return mapa;
}

/**
 * FII que não está em CNPJ_FII_CONHECIDOS_: procura no informe mensal
 * aberto da CVM o fundo cujo ISIN tem o mesmo código do ticker
 * (BR + XPML + CTF...). Só aceita quando há UM fundo só com esse código -
 * visto em 24/09/2026 que o ISIN do informe às vezes está desatualizado
 * (PMLL11 ainda com o código antigo) ou é compartilhado por engano.
 */
function cnpjsFiiPeloIsinCvm_(tickers) {
  var ano = new Date().getFullYear();
  var texto = null;
  [ano, ano - 1].some(function (a) {
    var resp = UrlFetchApp.fetch('https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_' + a + '.zip', { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return false;
    var arquivos = Utilities.unzip(resp.getBlob());
    for (var i = 0; i < arquivos.length; i++) {
      if (/geral/.test(arquivos[i].getName())) { texto = arquivos[i].getDataAsString('ISO-8859-1'); return true; }
    }
    return false;
  });
  if (!texto) return {};
  var linhas = Utilities.parseCsv(texto, ';');
  var cab = linhas[0];
  var iCnpj = cab.indexOf('CNPJ_Fundo_Classe'), iIsin = cab.indexOf('Codigo_ISIN');
  var porRaiz = {};
  for (var j = 1; j < linhas.length; j++) {
    var isin = String(linhas[j][iIsin] || '');
    if (isin.length < 6) continue;
    var raiz = isin.slice(2, 6);
    (porRaiz[raiz] = porRaiz[raiz] || {})[String(linhas[j][iCnpj]).replace(/\D/g, '')] = 1;
  }
  var out = {};
  tickers.forEach(function (t) {
    var cands = Object.keys(porRaiz[t.slice(0, 4)] || {});
    if (cands.length === 1) out[t] = cands[0];
  });
  return out;
}

// ---------------------------------------------------------------------------
// FNet
// ---------------------------------------------------------------------------

/** 2 tentativas (a 2ª só se ainda houver tempo - `temTempo` opcional). */
function comTentativasFnet_(fn, temTempo) {
  try { return fn(); } catch (e1) {
    if (temTempo && !temTempo()) throw e1;
    Utilities.sleep(5000);
    return fn();
  }
}

/** Documentos "Aviso aos Cotistas - Estruturado" mais recentes de um FII: [{ id, dataEntrega }]. */
function listarDocumentosFnet_(cnpj, quantos) {
  var url = FNET_BASE_URL_ + 'pesquisarGerenciadorDocumentosDados?d=0&s=0&l=' + quantos +
    '&o%5B0%5D%5BdataEntrega%5D=desc&tipoFundo=1&idCategoriaDocumento=14&idTipoDocumento=41&cnpjFundo=' + cnpj;
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (resp.getResponseCode() !== 200) throw new Error('FNet HTTP ' + resp.getResponseCode());
  var json = JSON.parse(resp.getContentText());
  return (json.data || []).map(function (d) { return { id: String(d.id), dataEntrega: d.dataEntrega }; });
}

function baixarDocumentoFnet_(id) {
  var resp = UrlFetchApp.fetch(FNET_BASE_URL_ + 'downloadDocumento?id=' + id, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (resp.getResponseCode() !== 200) throw new Error('FNet documento ' + id + ' HTTP ' + resp.getResponseCode());
  var texto = resp.getContentText('UTF-8');
  // alguns documentos vêm em base64 em vez do XML direto
  if (texto.indexOf('<') === -1) {
    try { texto = Utilities.newBlob(Utilities.base64Decode(texto.trim())).getDataAsString('UTF-8'); } catch (e) { /* segue como veio */ }
  }
  return texto;
}

/**
 * Proventos do `ticker` num XML estruturado do FNet:
 * [{ ticker, tipo: 'Rendimento'|'Amortização', dataCom: 'yyyy-MM-dd',
 *    dataPagamento: 'yyyy-MM-dd', valor: número, isento: 'Sim'|'Não'|'' }].
 * Um documento pode ter mais de um ticker (ex.: PMLL11 e o recibo PMLL13) -
 * só o do ticker pedido entra.
 */
function extrairProventosDoXmlFnet_(xml, ticker) {
  var out = [];
  var tag = function (bloco, nome) {
    var m = String(bloco).match(new RegExp('<' + nome + '>\\s*([^<]*?)\\s*</' + nome + '>'));
    return m ? m[1] : '';
  };
  var data = function (s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/) || String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return '';
    return m[1].length === 4 ? m[1] + '-' + m[2] + '-' + m[3] : m[3] + '-' + m[2] + '-' + m[1];
  };
  var numero = function (s) {
    var t = String(s || '').trim();
    if (/,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    var n = Number(t);
    return isFinite(n) ? n : NaN;
  };
  var provs = String(xml || '').match(/<Provento>[\s\S]*?<\/Provento>/g) || [];
  provs.forEach(function (bloco) {
    if (tag(bloco, 'CodNegociacao').toUpperCase() !== String(ticker).toUpperCase()) return;
    [['Rendimento', 'Rendimento'], ['Amortizacao', 'Amortização']].forEach(function (par) {
      (bloco.match(new RegExp('<' + par[0] + '>[\\s\\S]*?</' + par[0] + '>', 'g')) || []).forEach(function (b) {
        var valor = numero(tag(b, 'ValorProvento'));
        var dataCom = data(tag(b, 'DataBase'));
        var dataPagamento = data(tag(b, 'DataPagamento'));
        if (!(valor > 0) || !dataCom || !dataPagamento) return;
        out.push({ ticker: String(ticker).toUpperCase(), tipo: par[1], dataCom: dataCom, dataPagamento: dataPagamento, valor: valor, isento: tag(b, 'RendimentoIsentoIR') || '' });
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Aba aux_proventos-anunciados
// ---------------------------------------------------------------------------

function chaveProventoAnunciado_(p) {
  return [p.ticker, p.tipo, p.dataCom, p.dataPagamento].join('|');
}

/** Data 'yyyy-MM-dd' -> Date ao meio-dia (evita virar o dia por causa de fuso). */
function dataDeChaveProvento_(chave) {
  var m = String(chave).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : '';
}

function chaveDeCelulaProvento_(v) {
  if (v instanceof Date) return chaveDiaISOInicio_(v);
  var s = String(v || '');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

function lerProventosAnunciados_(ss) {
  var aba = ss.getSheetByName(ABA_PROVENTOS_ANUNCIADOS);
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_PROVENTOS_ANUNCIADOS.length).getValues()
    .filter(function (l) { return l[0]; })
    .map(function (l) {
      return {
        ticker: String(l[0]).trim().toUpperCase(),
        tipo: String(l[1] || ''),
        dataCom: chaveDeCelulaProvento_(l[2]),
        dataPagamento: chaveDeCelulaProvento_(l[3]),
        valor: Number(l[4]),
        isento: String(l[5] || ''),
        documento: String(l[6] || ''),
        atualizadoEm: l[7]
      };
    });
}

function gravarProventosAnunciados_(ss, lista) {
  var aba = ss.getSheetByName(ABA_PROVENTOS_ANUNCIADOS) || ss.insertSheet(ABA_PROVENTOS_ANUNCIADOS);
  var ordenada = lista.slice().sort(function (a, b) {
    return a.dataPagamento < b.dataPagamento ? 1 : (a.dataPagamento > b.dataPagamento ? -1 : (a.ticker < b.ticker ? -1 : 1));
  });
  aba.clearContents();
  aba.getRange(1, 1, 1, CABECALHO_PROVENTOS_ANUNCIADOS.length).setValues([CABECALHO_PROVENTOS_ANUNCIADOS]);
  if (typeof invalidarCacheProventos_ === 'function') invalidarCacheProventos_(); // Proventos.gs
  if (!ordenada.length) return;
  aba.getRange(2, 1, ordenada.length, CABECALHO_PROVENTOS_ANUNCIADOS.length).setValues(ordenada.map(function (p) {
    return [p.ticker, p.tipo, dataDeChaveProvento_(p.dataCom), dataDeChaveProvento_(p.dataPagamento), p.valor, p.isento, p.documento, p.atualizadoEm || new Date()];
  }));
}

function lerDocsFnetProcessados_() {
  try {
    var bruto = PropertiesService.getScriptProperties().getProperty(PROP_FNET_DOCS_PROCESSADOS_);
    var lista = bruto ? JSON.parse(bruto) : [];
    var mapa = {};
    lista.forEach(function (id) { mapa[String(id)] = 1; });
    return mapa;
  } catch (e) { return {}; }
}

function gravarDocsFnetProcessados_(mapa) {
  // guarda os 500 ids mais recentes (os ids do FNet são crescentes)
  var ids = Object.keys(mapa).sort(function (a, b) { return Number(b) - Number(a); }).slice(0, 500);
  try { PropertiesService.getScriptProperties().setProperty(PROP_FNET_DOCS_PROCESSADOS_, JSON.stringify(ids)); } catch (e) { Logger.log('Propriedades: ' + e); }
}

// A leitura pro site (a receber, pagos não lançados, recebidos no mês) mora em
// Proventos.gs!montarProventosAnunciados_ - junta FNet, a exportação da B3 e a aba Proventos.
