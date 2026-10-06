/**
 * Incorporacoes.gs - 27/09/2026: tirar DE VEZ da planilha um ticker que foi
 * incorporado por outro (hoje: STR -> VNOM).
 *
 * Tiago: "me diga como resolver o STR, de uma vez por todas. Já é a
 * terceira vez que eu tenho que lidar com isso."
 *
 * O que aconteceu com a STR: a Sitio Royalties foi incorporada pela Viper
 * Energy (VNOM) em 19/08/2025, 0,4855 VNOM por STR, troca de ações sem
 * dinheiro. Na planilha ficaram DUAS representações da mesma posição:
 *   - as 4 compras de STR (9 ações, US$ 166,77) e, pra cada uma, uma
 *     compra "espelho" de VNOM na MESMA data e no MESMO custo (0,4855 VNOM
 *     por STR) - o jeito certo de lançar uma incorporação: o custo e a data
 *     de cada compra passam pro ticker novo;
 *   - uma "Venda" de 9 STR em 19/09/2026 a US$ 147,20 (a cotação de OUTRA
 *     empresa, que hoje usa o ticker STR), só pra zerar a posição.
 * Essa venda nunca existiu: ela cria US$ 1.158,03 de lucro realizado falso
 * (é TODO o "Lucro/Prejuízo de todas suas operações" do topo da aba
 * "Transações - USA", e iria pro IR como ganho de capital) e fazia o
 * gráfico da Início contar uma retirada de milhares de reais. O código já
 * ignorava a STR em vários lugares (TICKERS_FORA_DO_HISTORICO, Sync.gs),
 * mas cada tela nova ou checagem nova esbarrava nela de novo.
 *
 * A solução definitiva é a planilha refletir o que aconteceu: a posição é
 * VNOM desde a 1ª compra (com as compras espelho, que já estão lá). Então:
 *  1. "Transações - USA": saem TODAS as linhas de STR (4 compras + a venda
 *     falsa). Só as colunas manuais (A:F) são reescritas, sem as linhas de
 *     STR e na mesma ordem - as fórmulas das outras colunas ficam onde estão.
 *     Antes de mexer, confere que cada compra de STR tem a compra espelho
 *     de VNOM (mesma data, quantidade × 0,4855, tolerância 1%) e que não há
 *     venda de STR ANTES da incorporação (seria venda de verdade). Se algo
 *     não bater, não mexe em nada e diz o quê.
 *  2. aux_historico-patrimonio: saem as linhas de STR (todas têm o preço da
 *     outra empresa - US$ 156-165 - desde o 1º dia).
 *  3. "Proventos - USA": o dividendo pago pela STR em 19/08/2025 passa a
 *     ser da VNOM (o mesmo que o importador da Interactive Brokers já faz
 *     com provento de ticker incorporado) - o valor não muda.
 *
 * Como rodar (no editor do Apps Script, depois de colar e salvar):
 *   limparStrDefinitivo()         -> SÓ MOSTRA o que vai mudar (no log)
 *   limparStrDefinitivoAplicar()  -> aplica (e grava no Registro de Controle)
 * Rodar de novo depois é seguro: não acha mais nada e não muda nada.
 */

var INCORPORACOES_ = [
  { antigo: 'STR', novo: 'VNOM', fator: 0.4855, data: '2025-08-19', descricao: 'Sitio Royalties (STR) incorporada pela Viper Energy (VNOM), 0,4855 VNOM por STR' }
];

/**
 * 05/10/2026 (A-14): TABELA ÚNICA de aliases de ticker (ticker antigo -> ticker atual). Vínculo de meta,
 * provento antigo e histórico de um ativo que mudou de ticker (renomeação) ou foi incorporado por outro
 * (INCORPORACOES_ acima) deixavam de bater com o ativo de hoje e sumiam em silêncio. Quem precisa
 * reconciliar ticker chama resolverAliasTicker_(ticker) (devolve o ticker ATUAL, em maiúsculas) ou
 * aliasesDoTicker_(ticker) (o ticker atual + todos os antigos que levam a ele). Metas.gs já usa; Proventos.gs,
 * Ativo.gs e o motor de critérios devem usar a mesma função (nada de lista paralela).
 *
 * Pra cadastrar um caso novo: uma linha em RENOMEACOES_TICKER_ (renomeação sem troca de proporção) ou em
 * INCORPORACOES_ (incorporação, com fator). Nenhum dado pessoal aqui - só mudanças públicas de ticker.
 */
var RENOMEACOES_TICKER_ = [
  { antigo: 'ELET3', novo: 'AXIA3', descricao: 'Eletrobras renomeada Axia Energia (ON)' },
  { antigo: 'ELET6', novo: 'AXIA6', descricao: 'Eletrobras renomeada Axia Energia (PNB)' },
  { antigo: 'MALL11', novo: 'PMLL11', descricao: 'Malls Brasil Plural (FII) renomeado Pátria Malls (PMLL11); na planilha os proventos antigos ainda estão como MALL11 e as transações/histórico já como PMLL11' }
];

/** { 'ANTIGO': 'NOVO', ... } - renomeações + incorporações. */
function tabelaAliasesTicker_() {
  var mapa = {};
  RENOMEACOES_TICKER_.concat(INCORPORACOES_).forEach(function (x) {
    if (x && x.antigo && x.novo) mapa[String(x.antigo).trim().toUpperCase()] = String(x.novo).trim().toUpperCase();
  });
  return mapa;
}

/** Ticker ATUAL de um ticker (segue a cadeia antigo -> novo, no máximo 5 saltos); sem alias devolve ele mesmo (maiúsculo, sem espaços). */
function resolverAliasTicker_(ticker) {
  var t = String(ticker === null || ticker === undefined ? '' : ticker).trim().toUpperCase();
  if (!t) return '';
  var mapa = tabelaAliasesTicker_();
  for (var i = 0; i < 5 && mapa[t]; i++) t = mapa[t];
  return t;
}

/** [ticker atual, ...antigos que levam a ele] - pra buscar histórico/proventos de um ativo pelos dois nomes. */
function aliasesDoTicker_(ticker) {
  var atual = resolverAliasTicker_(ticker);
  var mapa = tabelaAliasesTicker_();
  var out = atual ? [atual] : [];
  Object.keys(mapa).forEach(function (antigo) { if (resolverAliasTicker_(antigo) === atual && out.indexOf(antigo) < 0) out.push(antigo); });
  return out;
}

function limparStrDefinitivo() {
  var r = limparIncorporacao_(SpreadsheetApp.getActiveSpreadsheet(), INCORPORACOES_[0], false);
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

function limparStrDefinitivoAplicar() {
  var trava = travaRecurso_(['precos', 'carteira'], 'incorporação de ticker (editor)', { ttlMs: 6.5 * 60 * 1000 });
  if (!trava.tryLock(20000)) throw new Error('Tem uma sincronização rodando - espera terminar e roda de novo.');
  try {
    var r = limparIncorporacao_(SpreadsheetApp.getActiveSpreadsheet(), INCORPORACOES_[0], true);
    Logger.log(JSON.stringify(r, null, 2));
    return r;
  } finally {
    trava.releaseLock();
  }
}

function isoIncorp_(v) {
  if (v && typeof v.getFullYear === 'function') {
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  }
  var s = String(v || '');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

/**
 * inc = { antigo, novo, fator, data: 'aaaa-mm-dd' }. aplicar=false só simula.
 * Devolve { ok, aplicado, transacoes: {removidas:[...]}, historico: {removidas}, proventos: {trocados}, problemas: [...] }.
 */
function limparIncorporacao_(ss, inc, aplicar) {
  var out = { ok: true, aplicado: false, incorporacao: inc.descricao || (inc.antigo + ' -> ' + inc.novo), transacoes: { removidas: [] }, historico: { removidas: 0 }, proventos: { trocados: [] }, problemas: [] };

  // --- 1. Transações - USA (colunas manuais A:F, dados a partir da linha 7)
  var abaT = ss.getSheetByName('Transações - USA');
  var linhasT = [];
  var primeira = 7;
  if (abaT && abaT.getLastRow() >= primeira) {
    linhasT = abaT.getRange(primeira, 1, abaT.getLastRow() - primeira + 1, 6).getValues();
    while (linhasT.length && String(linhasT[linhasT.length - 1][0] || '').trim() === '') linhasT.pop();
  }
  var tk = function (l) { return String(l[0] || '').trim().toUpperCase(); };
  var antigas = [];
  var espelhos = linhasT.filter(function (l) { return tk(l) === inc.novo && String(l[2]).trim() === 'Compra'; })
    .map(function (l) { return { data: isoIncorp_(l[1]), qtd: Number(l[4]) || 0, usado: false }; });
  linhasT.forEach(function (l, i) {
    if (tk(l) !== inc.antigo) return;
    var item = { linha: primeira + i, data: isoIncorp_(l[1]), tipo: String(l[2] || '').trim(), preco: Number(l[3]) || 0, qtd: Number(l[4]) || 0 };
    antigas.push(item);
    if (item.tipo === 'Compra') {
      var alvo = item.qtd * inc.fator;
      var e = espelhos.filter(function (x) { return !x.usado && x.data === item.data && Math.abs(x.qtd - alvo) <= Math.max(0.0001, alvo * 0.01); })[0];
      if (e) { e.usado = true; item.espelho = inc.novo + ' ' + e.qtd; }
      else out.problemas.push('Compra de ' + inc.antigo + ' em ' + item.data + ' (' + item.qtd + ') sem a compra espelho de ' + inc.novo + ' (' + (Math.round(alvo * 10000) / 10000) + ') na mesma data - lance a de ' + inc.novo + ' antes de limpar.');
    } else if (item.tipo === 'Venda') {
      if (item.data < inc.data) out.problemas.push('Venda de ' + inc.antigo + ' em ' + item.data + ', ANTES da incorporação (' + inc.data + '): é uma venda de verdade, não mexo.');
      else item.vendaFalsa = true;
    } else {
      out.problemas.push('Linha de ' + inc.antigo + ' em ' + item.data + ' com tipo "' + item.tipo + '" - confira à mão.');
    }
  });
  out.transacoes.removidas = antigas;

  // --- 2. aux_historico-patrimonio (ticker na coluna B)
  var abaH = ss.getSheetByName(typeof NOME_ABA_HISTORICO !== 'undefined' ? NOME_ABA_HISTORICO : 'aux_historico-patrimonio');
  var dadosH = null;
  var larguraH = 8;
  if (abaH && abaH.getLastRow() >= 2) {
    dadosH = abaH.getRange(2, 1, abaH.getLastRow() - 1, larguraH).getValues();
    out.historico.removidas = dadosH.filter(function (l) { return String(l[1] || '').trim().toUpperCase() === inc.antigo; }).length;
  }

  // --- 3. Proventos - USA (ticker na coluna C, dados a partir da linha 8)
  var abaP = ss.getSheetByName('Proventos - USA');
  var linhasP = [];
  if (abaP && abaP.getLastRow() >= 8) {
    linhasP = abaP.getRange(8, 3, abaP.getLastRow() - 7, 1).getValues();
    linhasP.forEach(function (l, i) { if (String(l[0] || '').trim().toUpperCase() === inc.antigo) out.proventos.trocados.push(8 + i); });
  }

  if (out.problemas.length) { out.ok = false; return out; }
  if (!aplicar) return out;

  if (antigas.length) {
    var ficam = linhasT.filter(function (l) { return tk(l) !== inc.antigo; });
    while (ficam.length < linhasT.length) ficam.push(['', '', '', '', '', '']);
    abaT.getRange(primeira, 1, ficam.length, 6).setValues(ficam);
  }
  if (dadosH && out.historico.removidas) {
    var ficamH = dadosH.filter(function (l) { return String(l[1] || '').trim().toUpperCase() !== inc.antigo; });
    var vazias = dadosH.length - ficamH.length;
    for (var k = 0; k < vazias; k++) ficamH.push(['', '', '', '', '', '', '', '']);
    abaH.getRange(2, 1, ficamH.length, larguraH).setValues(ficamH);
  }
  out.proventos.trocados.forEach(function (linha) { abaP.getRange(linha, 3, 1, 1).setValues([[inc.novo]]); });
  SpreadsheetApp.flush();
  try { if (typeof limparCacheHistoricoInicio_ === 'function') limparCacheHistoricoInicio_(); } catch (eC) { /* ok */ }
  out.aplicado = true;
  try {
    if (typeof gravarRegistroControle_ === 'function') {
      gravarRegistroControle_('Sucesso', 'Manual', 'Incorporação ' + inc.antigo + ' -> ' + inc.novo + ': ' + antigas.length + ' linha(s) de ' + inc.antigo + ' tiradas de "Transações - USA", ' +
        out.historico.removidas + ' de aux_historico-patrimonio, ' + out.proventos.trocados.length + ' provento(s) passados pra ' + inc.novo + '.');
    }
  } catch (eR) { /* ok */ }
  return out;
}
