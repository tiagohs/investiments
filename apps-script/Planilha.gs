/**
 * Planilha.gs - 26/09/2026 (Tiago: "Poderíamos criar um processo de adicionar
 * um novo ativo? ... acho importante estarmos preparados pra isso").
 *
 * Pra um ativo novo entrar sem ninguém mexer em código, duas coisas que
 * eram fixas passam a ser lidas da própria planilha:
 *
 * 1) Onde ficam os blocos da aba "Distribuição e Metas". Adicionar um ativo
 *    insere uma linha no Radar de oportunidades (Ações, EUA ou FIIs) - tudo
 *    abaixo desce 1 linha (o dólar de K56, os outros blocos do Radar, os
 *    objetivos de FIIs de B73...). As fórmulas da planilha se ajustam
 *    sozinhas; o Apps Script lia endereços fixos. localDistribuicaoMetas_
 *    acha cada bloco pelo rótulo (cabeçalho "Ranking | Ativo", "Cotação do
 *    dólar hoje:", "⋘ Carteira Recomendada ...") - e cai nos endereços de
 *    sempre se algum rótulo não estiver lá.
 *
 * 2) A lista de tickers da sincronização do patrimônio (Sync.gs: TICKERS_*).
 *    carregarListasTickersDaPlanilha_ acrescenta às listas fixas os ativos
 *    de "Auxiliar_ativos" (ticker de verdade: 4 letras + número no Brasil,
 *    letras nos EUA - recibo de subscrição tipo AXIA15G fica de fora).
 */

var _memoLocalDM_ = null;

/** { radarAcoes, radarUsa, radarFiis (1ª linha de dados), dolar ('K56'), linkUsa, linkFiis, objetivosFiis (1ª linha) } */
function localDistribuicaoMetas_(dm) {
  if (_memoLocalDM_ && _memoLocalDM_.dm === dm) return _memoLocalDM_.local;
  var local = { radarAcoes: 42, radarUsa: 59, radarFiis: 82, dolar: 'K56', linkUsa: 'C56', linkFiis: 'C79', objetivosFiis: 73 };
  try {
    var n = Math.min(dm.getLastRow() || 0, 400);
    if (n > 0) {
      var vals = dm.getRange(1, 1, n, 11).getValues(); // A..K
      var radares = [];
      vals.forEach(function (l, i) {
        var linha = i + 1;
        var b = String(l[1] || '').trim(), c = String(l[2] || '').trim(), j = String(l[9] || '').trim();
        if (b === 'Ranking' && c === 'Ativo') radares.push(linha + 1);
        if (/^cota[cç][aã]o do d[oó]lar/i.test(j)) local.dolar = 'K' + linha;
        if (/carteira recomendada internacional/i.test(c)) local.linkUsa = 'C' + linha;
        if (/carteira recomendada fiis/i.test(c)) local.linkFiis = 'C' + linha;
        if (b === 'Tipo' && c === '% desejado') local.objetivosFiis = linha + 1;
      });
      if (radares.length === 3) { local.radarAcoes = radares[0]; local.radarUsa = radares[1]; local.radarFiis = radares[2]; }
    }
  } catch (e) { /* fica com os endereços de sempre */ }
  _memoLocalDM_ = { dm: dm, local: local };
  return local;
}

/** Esquece as posições (depois de inserir/apagar linha na aba, na mesma execução). */
function esquecerLocalDistribuicaoMetas_() { _memoLocalDM_ = null; }

/** Dólar de hoje (célula "Cotação do dólar hoje:" da Distribuição e Metas). */
function cotacaoDolarHoje_(ss) {
  var dm = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName('Distribuição e Metas');
  if (!dm) return null;
  var v = dm.getRange(localDistribuicaoMetas_(dm).dolar).getValue();
  return typeof v === 'number' && v > 0 ? v : null;
}

var _listasTickersCarregadas_ = false;
var RE_TICKER_BR_ = /^[A-Z]{4}\d{1,2}$/;
var RE_TICKER_USA_ = /^[A-Z]{1,5}(\.[A-Z])?$/;

/**
 * Acrescenta às listas fixas de Sync.gs (TICKERS_ACOES_BR, TICKERS_FIIS_BR,
 * TICKERS_BR, TICKERS_USA) os ativos cadastrados em Auxiliar_ativos. Mexe
 * nos próprios arrays (quem já guardou a referência enxerga). 1x por execução.
 */
function carregarListasTickersDaPlanilha_(ss) {
  if (_listasTickersCarregadas_) return;
  _listasTickersCarregadas_ = true;
  if (typeof TICKERS_BR === 'undefined' || typeof TICKERS_USA === 'undefined') return;
  try {
    var aba = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName('Auxiliar_ativos');
    if (!aba || aba.getLastRow() < 2) return;
    var fora = typeof TICKERS_FORA_DO_HISTORICO !== 'undefined' ? TICKERS_FORA_DO_HISTORICO : [];
    aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues().forEach(function (l) {
      var classe = String(l[0] || '').trim();
      var t = String(l[1] || '').trim().toUpperCase();
      if (!t || fora.indexOf(t) !== -1) return;
      if (classe === 'Ações EUA') {
        if (RE_TICKER_USA_.test(t) && TICKERS_USA.indexOf(t) === -1) TICKERS_USA.push(t);
        return;
      }
      if ((classe !== 'Ações' && classe !== 'FIIs') || !RE_TICKER_BR_.test(t) || TICKERS_BR.indexOf(t) !== -1) return;
      TICKERS_BR.push(t);
      if (classe === 'FIIs') TICKERS_FIIS_BR.push(t); else TICKERS_ACOES_BR.push(t);
    });
  } catch (e) { Logger.log('carregarListasTickersDaPlanilha_: ' + e); }
}
