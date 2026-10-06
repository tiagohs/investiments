/**
 * FundamentosPlanilha.gs - 06/10/2026 (Tiago: "resolva pra mim a questão do P/VP e P/L do GPRK e VNOM").
 *
 * Problema (achado na planilha Controle 18): o P/VP e o P/L que o site mostra (Radar, Meus ativos, Ativo,
 * Carteiras) saem de fórmulas da planilha que usam fontes ruins:
 *  - P/VP ("Distribuição e Metas" col. H) = 'Carteira ...'!J / 'Carteira ...'!AB, e o VPA (AB) vem do
 *    VLOOKUP no DB-Stocks (EUA) / DB-Acoes (BR). GPRK: VPA 0,36 -> P/VP 31,3 (o Yahoo diz ~2). PROSY: VPA 0
 *    -> #DIV/0!.
 *  - P/L (AK nos EUA, AL nas BR) = GOOGLEFINANCE(ticker;"pe"). VNOM: 303,44 (o Yahoo diz ~10,6; o lucro por
 *    ação do GOOGLEFINANCE é o atribuível ao controlador, distorcido).
 * O Fundamentos.gs já escolhe o valor bom (mescla de fontes que descarta o absurdo) e agora o grava na aba
 * aux_fundamentos-resumo (Ticker | P/VP | P/L | VPA | LPA | Fonte | Atualizado em) a cada rodada.
 *
 * corrigirFormulasValuationPlanilha() (rodar no editor, 1x - e de novo sem medo, é idempotente) reescreve SÓ
 * as colunas VPA, LPA e P/L das abas "Carteira Ações USA" e "Carteira Ações" pra:
 *   1. preferir o aux_fundamentos-resumo;
 *   2. cair no DB-Stocks/DB-Acoes (VPA, LPA) ou no GOOGLEFINANCE (P/L) só quando o resumo não tiver o ticker;
 *   3. guarda de plausibilidade: VPA que dê P/VP (cotação ÷ VPA) fora de 0,05-20, ou P/L fora de 0-100,
 *      é descartado e tenta a outra fonte; nenhuma plausível -> vazio (nunca #DIV/0!).
 * Como o P/VP da "Distribuição e Metas" é J/AB e o Auxiliar_ativos lê dali (assim como o P/L, via AK/AL), TODAS as
 * telas do site passam a mostrar o mesmo valor escolhido - sem mexer em mais nenhuma coluna nem no front.
 * Linhas novas de ativo (NovoAtivo.gs copia a fórmula da linha de cima) já nascem com a fórmula corrigida.
 *
 * Fórmulas: ";" como separador e nomes de função em inglês (planilha pt-BR; ver BackfillIndices.gs). Sem número
 * decimal dentro da fórmula (a razão 0,05 vira "cotação >= VPA/20"), pra não depender do locale.
 * O antes/depois por ticker (P/VP, P/L, VPA) vai pro Registro de Controle.
 *
 * Testes: tests/harness/fundamentos-planilha.test.js.
 */

var FP_ORIGEM_ = 'corrigirFormulasValuationPlanilha';
var FP_COL_RESUMO_ = { pvp: 2, pl: 3, vpa: 4, lpa: 5 }; // colunas do aux_fundamentos-resumo (A = Ticker)

// Abas de carteira de ação: onde está o banco do VLOOKUP original (aba, nº de linhas do intervalo, coluna do VPA e do LPA no banco).
var FP_ABAS_ = [
  { aba: 'Carteira Ações USA', rotulo: 'Ações EUA', banco: 'DB-Stocks', bancoLinhas: 11020, bancoVpa: 27, bancoLpa: 28 },
  { aba: 'Carteira Ações', rotulo: 'Ações BR', banco: 'DB-Acoes', bancoLinhas: 1001, bancoVpa: 27, bancoLpa: 28 }
];

/** Letra(s) da coluna (1 -> A, 28 -> AB). */
function fpLetra_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Acha, pelo cabeçalho (linha com "Ticker" na coluna A), a linha do cabeçalho e as colunas Valor atual, VPA, LPA e P/L. Null se faltar algo. */
function fpAcharColunas_(aba) {
  var ate = Math.min(20, aba.getLastRow());
  var larg = aba.getLastColumn();
  if (ate < 1 || larg < 1) return null;
  var linhas = aba.getRange(1, 1, ate, larg).getValues();
  var norm = function (v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase(); };
  for (var i = 0; i < linhas.length; i++) {
    if (norm(linhas[i][0]) !== 'ticker') continue;
    var col = function (nome) { for (var j = 0; j < linhas[i].length; j++) if (norm(linhas[i][j]) === nome) return j + 1; return 0; };
    var c = { cabecalho: i + 1, preco: col('valor atual'), vpa: col('vpa'), lpa: col('lpa'), pl: col('p/l') };
    return c.preco && c.vpa && c.lpa && c.pl ? c : null;
  }
  return null;
}

/** Fórmula do VPA da linha: resumo (se P/VP plausível) -> banco (se P/VP plausível) -> vazio. */
function fpFormulaVpa_(cfg, c, linha) {
  var resumo = "'" + ABA_FUNDAMENTOS_RESUMO + "'!$A:$G";
  var preco = '$' + fpLetra_(c.preco) + linha;
  var plausivel = function (v) { return 'AND(' + v + '>0;OR(preco<=0;AND(20*preco>=' + v + ';preco<=20*' + v + ')))'; };
  return '=IFERROR(LET(preco;N(' + preco + ');' +
    'resumo;N(IFERROR(VLOOKUP($A' + linha + ';' + resumo + ';' + FP_COL_RESUMO_.vpa + ';0);0));' +
    "banco;N(IFERROR(VLOOKUP($A" + linha + ";'" + cfg.banco + "'!$1:$" + cfg.bancoLinhas + ';' + cfg.bancoVpa + ';0);0));' +
    'IF(' + plausivel('resumo') + ';resumo;IF(' + plausivel('banco') + ';banco;"")));"")';
}

/** Fórmula do LPA da linha: resumo -> banco -> vazio (o resumo já traz o LPA coerente com o P/L escolhido). */
function fpFormulaLpa_(cfg, c, linha) {
  var resumo = "'" + ABA_FUNDAMENTOS_RESUMO + "'!$A:$G";
  return '=IFERROR(LET(' +
    'resumo;IFERROR(VLOOKUP($A' + linha + ';' + resumo + ';' + FP_COL_RESUMO_.lpa + ';0);"");' +
    "banco;IFERROR(VLOOKUP($A" + linha + ";'" + cfg.banco + "'!$1:$" + cfg.bancoLinhas + ';' + cfg.bancoLpa + ';0);"");' +
    'IF(ISNUMBER(resumo);resumo;IF(ISNUMBER(banco);banco;"")));"")';
}

/** Fórmula do P/L da linha: resumo (0 < P/L <= 100) -> GOOGLEFINANCE "pe" (idem) -> vazio. */
function fpFormulaPl_(cfg, c, linha) {
  var resumo = "'" + ABA_FUNDAMENTOS_RESUMO + "'!$A:$G";
  var plausivel = function (v) { return 'AND(' + v + '>0;' + v + '<=100)'; };
  return '=IF($A' + linha + '="";"";IFERROR(LET(' +
    'resumo;N(IFERROR(VLOOKUP($A' + linha + ';' + resumo + ';' + FP_COL_RESUMO_.pl + ';0);0));' +
    'google;N(IFERROR(GOOGLEFINANCE($A' + linha + ';"pe");0));' +
    'IF(' + plausivel('resumo') + ';resumo;IF(' + plausivel('google') + ';google;"")));""))';
}

function fpNumeroOuNull_(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

/** Foto (P/VP = J/VPA, P/L, VPA) de cada linha-alvo - usada antes e depois da troca das fórmulas. */
function fpFotoLinhas_(aba, c, linhas) {
  var foto = {};
  linhas.forEach(function (l) {
    var preco = fpNumeroOuNull_(aba.getRange(l.linha, c.preco).getValue());
    var vpa = aba.getRange(l.linha, c.vpa).getValue();
    var pl = aba.getRange(l.linha, c.pl).getValue();
    var n = fpNumeroOuNull_(vpa);
    foto[l.ticker] = { pvp: preco != null && n ? preco / n : (typeof vpa === 'string' && /^#/.test(vpa) ? vpa : null), pl: pl, vpa: vpa };
  });
  return foto;
}

function fpTexto_(v) {
  if (v == null || v === '') return 'vazio';
  if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
  return String(v);
}

/**
 * Rodar no editor, DEPOIS de atualizarFundamentosDireto() (que enche a aba aux_fundamentos-resumo). Idempotente.
 * Devolve { status, detalhe, abas: [{ aba, linhas, alteradas, antesDepois }] } e grava o mesmo detalhe no Registro de Controle.
 */
function corrigirFormulasValuationPlanilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var avisos = [];
  var abasInfo = [];
  var partes = [];
  var totalAlteradas = 0;

  // o resumo precisa existir (senão a fórmula aponta pra uma aba que não há): cria já com o que o aux_fundamentos tem
  var resumo = ss.getSheetByName(ABA_FUNDAMENTOS_RESUMO);
  if (!resumo || resumo.getLastRow() < 2) {
    try { fundGravarResumo_(ss, fundLerTabela_(ss), new Date()); } catch (eR) { avisos.push('não montou ' + ABA_FUNDAMENTOS_RESUMO + ': ' + String(eR).slice(0, 100)); }
    resumo = ss.getSheetByName(ABA_FUNDAMENTOS_RESUMO);
    if (!resumo || resumo.getLastRow() < 2) avisos.push('a aba ' + ABA_FUNDAMENTOS_RESUMO + ' está vazia - rode atualizarFundamentosDireto() e depois esta função de novo (por ora vale o DB/GOOGLEFINANCE com a guarda de plausibilidade)');
  }

  FP_ABAS_.forEach(function (cfg) {
    var aba = ss.getSheetByName(cfg.aba);
    if (!aba) { avisos.push('aba "' + cfg.aba + '" não encontrada'); return; }
    var c = fpAcharColunas_(aba);
    if (!c) { avisos.push('"' + cfg.aba + '": cabeçalho (Ticker, Valor atual, VPA, LPA, P/L) não encontrado - não mexi'); return; }
    var ultima = aba.getLastRow();
    var linhas = [];
    for (var r = c.cabecalho + 1; r <= ultima; r++) {
      var ticker = String(aba.getRange(r, 1).getValue() || '').trim().toUpperCase();
      var formulaAtual = String(aba.getRange(r, c.vpa).getFormulas()[0][0] || '');
      if (ticker || formulaAtual) linhas.push({ linha: r, ticker: ticker || '(linha ' + r + ')', formulaVpa: formulaAtual });
    }
    var antes = fpFotoLinhas_(aba, c, linhas);
    var alteradas = 0;
    linhas.forEach(function (l) {
      var novas = [
        [c.vpa, fpFormulaVpa_(cfg, c, l.linha)],
        [c.lpa, fpFormulaLpa_(cfg, c, l.linha)],
        [c.pl, fpFormulaPl_(cfg, c, l.linha)]
      ];
      var mexeu = false;
      novas.forEach(function (n) {
        var cel = aba.getRange(l.linha, n[0]);
        if (String(cel.getFormulas()[0][0] || '') === n[1]) return; // já está assim (idempotente)
        cel.setFormula(n[1]);
        mexeu = true;
      });
      if (mexeu) alteradas++;
    });
    if (alteradas && typeof SpreadsheetApp.flush === 'function') SpreadsheetApp.flush();
    var depois = fpFotoLinhas_(aba, c, linhas);
    var antesDepois = [];
    linhas.forEach(function (l) {
      var a = antes[l.ticker], d = depois[l.ticker];
      var mudou = ['pvp', 'pl', 'vpa'].some(function (k) { return fpTexto_(a[k]) !== fpTexto_(d[k]); });
      if (mudou) antesDepois.push(l.ticker + ' P/VP ' + fpTexto_(a.pvp) + ' -> ' + fpTexto_(d.pvp) + ', P/L ' + fpTexto_(a.pl) + ' -> ' + fpTexto_(d.pl) + ', VPA ' + fpTexto_(a.vpa) + ' -> ' + fpTexto_(d.vpa));
    });
    totalAlteradas += alteradas;
    abasInfo.push({ aba: cfg.aba, linhas: linhas.length, alteradas: alteradas, antesDepois: antesDepois });
    partes.push(cfg.rotulo + ' ("' + cfg.aba + '"): ' + linhas.length + ' linha(s), ' + alteradas + ' com fórmula reescrita' +
      (antesDepois.length ? '. Antes -> depois: ' + antesDepois.join('; ') : (alteradas ? '. Nenhum valor mudou (ou o GOOGLEFINANCE ainda está calculando - confira em 1 minuto)' : ' (já estava corrigido)')));
  });

  var detalhe = 'Fórmulas de VPA/LPA/P/L reescritas pra preferir ' + ABA_FUNDAMENTOS_RESUMO + ' (guarda: P/VP 0,05-20, P/L 0-100). ' +
    (partes.join(' | ') || 'nada feito') + (avisos.length ? ' | Atenção: ' + avisos.join('; ') : '');
  var status = (avisos.length || !abasInfo.length) ? 'Atenção' : 'Sucesso';
  try { if (typeof gravarRegistroControle_ === 'function') gravarRegistroControle_(status, FP_ORIGEM_, detalhe); } catch (eReg) { Logger.log('Registro de Controle: ' + eReg); }
  Logger.log(detalhe);
  return { status: status, detalhe: detalhe, alteradas: totalAlteradas, abas: abasInfo };
}
