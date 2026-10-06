/**
 * SnapshotPrecos.gs — A-56 em MODO SOMBRA (06/10/2026): snapshot diário de PREÇO, gravado numa aba nova
 * ("aux_snapshot-precos"), SEM mudar a série atual (aux_historico-patrimonio continua sendo gerada pelo
 * GOOGLEFINANCE em chunks, como sempre).
 *
 * POR QUE: a série atual pede o preço de cada ticker ao GOOGLEFINANCE com a função de histórico (uma fórmula por pedaço
 * de 180 dias, célula de rascunho, flush e espera) — é o que faz a sincronização gastar até 4,5 min e falhar em ticker sem
 * cobertura. O preço do DIA já está pronto, de graça, na coluna "Preço Atual" de Auxiliar_ativos (GOOGLEFINANCE ao vivo da
 * própria planilha). Gravar esse valor todo dia, depois do fechamento, dá a mesma série sem nenhum pedaço de histórico —
 * mas só dá pra trocar uma pela outra depois de COMPARAR as duas por alguns dias, sem risco: este arquivo só LÊ a série
 * atual e só ESCREVE em aux_snapshot-precos (e, na comparação, no Registro de Controle).
 *
 * COMO RODA: etapa "snapshotPrecos" da Agenda (Agenda.gs), depois de "ativos" e NÃO ANTES das 18:30 (SP) — o preço de
 * Auxiliar_ativos é o do momento; depois do fechamento é o fechamento do dia (a série atual grava o fechamento). 1 getValues
 * de Auxiliar_ativos + 1 setValues (mais uma leitura minúscula da cauda da aba, pra regravar o mesmo dia sem duplicar).
 *
 * ABA aux_snapshot-precos (criada na 1ª execução; 1 linha por ticker por dia, em ordem cronológica):
 *   A Data | B Ticker | C Classe | D Moeda | E Preço | F Variação dia | G Gravado em
 *
 * PRA DECIDIR A TROCA (depois de 1-2 semanas): rode compararSnapshotPrecos() no editor. Ela cruza cada (dia, ticker) do
 * snapshot com a linha do MESMO dia em aux_historico-patrimonio e escreve o resumo no Registro de Controle (origem "Manual",
 * etapa "snapshotPrecos"): totais, diferença por dia e por ticker (os piores). O dia de hoje só tem par amanhã (a série atual
 * grava até "ontem"). Diferença abaixo de 0,5% conta como igual (arredondamento; o snapshot sai do preço ao vivo).
 *
 * Funções do editor: gravarSnapshotPrecosAgora() (grava hoje na hora), compararSnapshotPrecos().
 */

var ABA_SNAPSHOT_PRECOS = 'aux_snapshot-precos';
var SNAPSHOT_PRECOS_CABECALHO_ = ['Data', 'Ticker', 'Classe', 'Moeda', 'Preço', 'Variação dia', 'Gravado em'];
var SNAPSHOT_PRECOS_TOLERANCIA_ = 0.005; // 0,5%: abaixo disso o snapshot e a série atual "batem"
var SNAPSHOT_PRECOS_MAX_TICKERS_REGISTRO_ = 8;
var SNAPSHOT_PRECOS_MAX_DIAS_REGISTRO_ = 10;

/** Date à meia-noite (fuso do script) da chave 'yyyy-MM-dd'. */
function snapshotPrecosDataDaChave_(chave) {
  var p = String(chave).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** Chave 'yyyy-MM-dd' de uma célula de data (Date de verdade ou texto que o Sheets não converteu). */
function snapshotPrecosChave_(valor) {
  if (valor instanceof Date) return chaveDiaISOInicio_(valor); // HistoricoInicio.gs (mesmo fuso/formato das outras séries)
  var m = String(valor == null ? '' : valor).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/**
 * Grava (idempotente por dia) o preço de cada ativo de Auxiliar_ativos em aux_snapshot-precos.
 * Devolve { dia, gravados, ignorados: [tickers sem preço], regravou, detalhe }.
 */
function gravarSnapshotPrecosHoje_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAtivos = ss.getSheetByName('Auxiliar_ativos');
  if (!abaAtivos || abaAtivos.getLastRow() < 2) throw new Error('aba "Auxiliar_ativos" vazia ou não encontrada');
  var agora = new Date();
  var dia = chaveDiaISOInicio_(agora);

  // 1 leitura: Classe(A) Ticker(B) Nome(C) Tipo(D) Moeda(E) Preço Atual(F) Variação dia(G)
  var dados = abaAtivos.getRange(2, 1, abaAtivos.getLastRow() - 1, 7).getValues();
  var dataDia = snapshotPrecosDataDaChave_(dia);
  var linhas = [];
  var ignorados = [];
  var vistos = {};
  dados.forEach(function (l) {
    var ticker = String(l[1] || '').trim().toUpperCase();
    if (!ticker || vistos[ticker]) return;
    vistos[ticker] = true;
    var preco = typeof l[5] === 'number' ? l[5] : NaN;
    if (!(preco > 0) || !isFinite(preco)) { ignorados.push(ticker); return; } // #N/A, vazio, 0: sem preço hoje
    var variacao = typeof l[6] === 'number' && isFinite(l[6]) ? l[6] : '';
    linhas.push([dataDia, ticker, String(l[0] || '').trim(), String(l[4] || '').trim(), preco, variacao, agora]);
  });
  if (!linhas.length) throw new Error('nenhum ativo com preço em Auxiliar_ativos (todos #N/A ou vazios)');

  var aba = ss.getSheetByName(ABA_SNAPSHOT_PRECOS);
  if (!aba) {
    aba = ss.insertSheet(ABA_SNAPSHOT_PRECOS);
    aba.getRange(1, 1, 1, SNAPSHOT_PRECOS_CABECALHO_.length).setValues([SNAPSHOT_PRECOS_CABECALHO_]);
    try { aba.getRange(2, 1, Math.max(aba.getMaxRows() - 1, 1), 1).setNumberFormat('yyyy-mm-dd'); } catch (eFmt) { /* só aparência */ }
  }

  // onde escrever: se hoje já foi gravado (a mesma execução rodou de novo), regrava a partir da 1ª linha de hoje; senão, no fim
  var ultima = aba.getLastRow();
  var inicioEscrita = Math.max(ultima, 1) + 1;
  var existentes = 0;
  if (ultima >= 2) {
    var n = Math.min(ultima - 1, linhas.length * 2 + 10);
    var cauda = aba.getRange(ultima - n + 1, 1, n, 1).getValues();
    for (var i = 0; i < cauda.length; i++) {
      if (snapshotPrecosChave_(cauda[i][0]) === dia) { inicioEscrita = ultima - n + 1 + i; existentes = ultima - inicioEscrita + 1; break; }
    }
  }
  aba.getRange(inicioEscrita, 1, linhas.length, SNAPSHOT_PRECOS_CABECALHO_.length).setValues(linhas);
  if (existentes > linhas.length) aba.getRange(inicioEscrita + linhas.length, 1, existentes - linhas.length, SNAPSHOT_PRECOS_CABECALHO_.length).clearContent();

  var detalhe = linhas.length + ' preço(s) gravado(s) em ' + ABA_SNAPSHOT_PRECOS + ' (' + dia + ')' + (existentes ? ' - regravado' : '') +
    (ignorados.length ? '; sem preço: ' + ignorados.join(', ') : '');
  Logger.log('gravarSnapshotPrecosHoje_: ' + detalhe);
  return { dia: dia, gravados: linhas.length, ignorados: ignorados, regravou: existentes > 0, detalhe: detalhe };
}

/** Editor: grava o snapshot de hoje agora (a Agenda faz isso sozinha depois das 18:30). */
function gravarSnapshotPrecosAgora() {
  return gravarSnapshotPrecosHoje_();
}

function snapshotPrecosFmtPct_(x) {
  var s = (Math.round(x * 10000) / 100).toFixed(2).replace('.', ',');
  return (x > 0 ? '+' : '') + s + '%';
}

function snapshotPrecosFmtNum_(x) { return (Math.round(x * 10000) / 10000).toString().replace('.', ','); }

/** 'dd/MM' de uma chave 'yyyy-MM-dd'. */
function snapshotPrecosDiaCurto_(chave) { return chave.slice(8, 10) + '/' + chave.slice(5, 7); }

/**
 * Cruza aux_snapshot-precos com a série atual (aux_historico-patrimonio) e devolve
 * { pares, iguais, diferentes, semHistorico, porDia: {dia: {pares, diferentes, maior}}, porTicker: {t: {pares, diferentes, maior}} }.
 * Só LÊ. `maior` = a maior diferença relativa do grupo { pct, dia, ticker, snapshot, historico }.
 */
function compararSnapshotPrecosCalcular_(ss, tolerancia) {
  tolerancia = tolerancia == null ? SNAPSHOT_PRECOS_TOLERANCIA_ : tolerancia;
  var res = { pares: 0, iguais: 0, diferentes: 0, semHistorico: 0, dias: 0, porDia: {}, porTicker: {} };
  var abaSnap = ss.getSheetByName(ABA_SNAPSHOT_PRECOS);
  if (!abaSnap || abaSnap.getLastRow() < 2) return res;
  var snap = abaSnap.getRange(2, 1, abaSnap.getLastRow() - 1, 5).getValues();
  var abaHist = ss.getSheetByName(NOME_ABA_HISTORICO); // Sync.gs: aux_historico-patrimonio
  var hist = abaHist && abaHist.getLastRow() >= 2 ? abaHist.getRange(2, 1, abaHist.getLastRow() - 1, 5).getValues() : [];

  var precisos = {}; // 'dia|ticker' -> true (só indexa o que o snapshot pede)
  var itens = [];
  snap.forEach(function (l) {
    var dia = snapshotPrecosChave_(l[0]);
    var ticker = String(l[1] || '').trim().toUpperCase();
    var preco = typeof l[4] === 'number' ? l[4] : NaN;
    if (!dia || !ticker || !(preco > 0)) return;
    precisos[dia + '|' + ticker] = true;
    itens.push({ dia: dia, ticker: ticker, preco: preco });
  });
  var serie = {};
  hist.forEach(function (l) {
    if (!(l[0] instanceof Date)) return;
    var chave = chaveDiaISOInicio_(l[0]) + '|' + String(l[1] || '').trim().toUpperCase();
    if (precisos[chave] && typeof l[4] === 'number') serie[chave] = l[4];
  });

  var diasVistos = {};
  itens.forEach(function (it) {
    diasVistos[it.dia] = true;
    var h = serie[it.dia + '|' + it.ticker];
    if (h == null || !(h > 0)) { res.semHistorico++; return; }
    var pct = (it.preco - h) / h;
    var difere = Math.abs(pct) > tolerancia && Math.abs(it.preco - h) >= 0.01;
    res.pares++;
    if (difere) res.diferentes++; else res.iguais++;
    var d = res.porDia[it.dia] || (res.porDia[it.dia] = { pares: 0, diferentes: 0, maior: null });
    var t = res.porTicker[it.ticker] || (res.porTicker[it.ticker] = { pares: 0, diferentes: 0, maior: null });
    [d, t].forEach(function (g) {
      g.pares++;
      if (difere) g.diferentes++;
      if (!g.maior || Math.abs(pct) > Math.abs(g.maior.pct)) g.maior = { pct: pct, dia: it.dia, ticker: it.ticker, snapshot: it.preco, historico: h };
    });
  });
  res.dias = Object.keys(diasVistos).length;
  return res;
}

/**
 * Editor (rodar depois de 1-2 semanas de snapshot): compara o snapshot com a série atual e escreve o resumo no Registro de
 * Controle - 1 linha de totais, 1 com a diferença por dia e até 8 com os tickers que mais diferem (dia, snapshot x série atual).
 * Não muda nada além do Registro. Devolve o mesmo resumo (também no log).
 */
function compararSnapshotPrecos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = compararSnapshotPrecosCalcular_(ss, SNAPSHOT_PRECOS_TOLERANCIA_);
  var linhas = [];
  if (!r.pares) {
    linhas.push('Snapshot de preços x série atual: nenhum par (dia, ticker) comparável ainda - ' + r.semHistorico + ' preço(s) do snapshot sem linha do mesmo dia em aux_historico-patrimonio (o dia de hoje só tem par amanhã).');
  } else {
    linhas.push('Snapshot de preços x série atual (aux_historico-patrimonio): ' + r.dias + ' dia(s), ' + r.pares + ' par(es) ticker/dia, ' + r.iguais + ' igual(is) (até ' +
      (SNAPSHOT_PRECOS_TOLERANCIA_ * 100).toFixed(1).replace('.', ',') + '%), ' + r.diferentes + ' diferente(s)' + (r.semHistorico ? ', ' + r.semHistorico + ' sem linha na série' : '') + '.');
    var dias = Object.keys(r.porDia).sort().slice(-SNAPSHOT_PRECOS_MAX_DIAS_REGISTRO_);
    linhas.push('Por dia: ' + dias.map(function (d) {
      var g = r.porDia[d];
      return snapshotPrecosDiaCurto_(d) + ' ' + (g.pares - g.diferentes) + '/' + g.pares + ' iguais' + (g.diferentes ? ' (maior ' + g.maior.ticker + ' ' + snapshotPrecosFmtPct_(g.maior.pct) + ')' : '');
    }).join('; ') + '.');
    var tickers = Object.keys(r.porTicker).filter(function (t) { return r.porTicker[t].diferentes > 0; }).sort(function (a, b) {
      return Math.abs(r.porTicker[b].maior.pct) - Math.abs(r.porTicker[a].maior.pct);
    });
    tickers.slice(0, SNAPSHOT_PRECOS_MAX_TICKERS_REGISTRO_).forEach(function (t) {
      var g = r.porTicker[t];
      linhas.push(t + ': ' + g.diferentes + '/' + g.pares + ' dia(s) diferem; maior em ' + snapshotPrecosDiaCurto_(g.maior.dia) + ' - snapshot ' + snapshotPrecosFmtNum_(g.maior.snapshot) +
        ' x série atual ' + snapshotPrecosFmtNum_(g.maior.historico) + ' (' + snapshotPrecosFmtPct_(g.maior.pct) + ').');
    });
    if (tickers.length > SNAPSHOT_PRECOS_MAX_TICKERS_REGISTRO_) linhas.push('(+' + (tickers.length - SNAPSHOT_PRECOS_MAX_TICKERS_REGISTRO_) + ' ticker(s) com diferença não listados)');
    if (!tickers.length) linhas.push('Nenhum ticker diferiu: o snapshot reproduz a série atual nos dias comparados.');
  }
  // Registro de Controle: a linha nova entra sempre no TOPO; grava de trás pra frente pro resumo ficar em cima
  for (var i = linhas.length - 1; i >= 0; i--) {
    try { gravarRegistroControle_('Sucesso', 'Manual', linhas[i], { etapa: 'snapshotPrecos', fonte: 'Snapshot de preços' }); } catch (e) { Logger.log('compararSnapshotPrecos: Registro - ' + e); }
  }
  linhas.forEach(function (l) { Logger.log(l); });
  return { resumo: linhas, pares: r.pares, iguais: r.iguais, diferentes: r.diferentes, semHistorico: r.semHistorico, dias: r.dias };
}
