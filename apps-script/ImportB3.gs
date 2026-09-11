/**
 * ImportB3.gs — Importação do extrato da B3 (Compra/Venda) direto pra
 * aba "Transações". Recebe o lote JÁ VALIDADO no navegador (teste.html
 * lê o .xlsx com SheetJS, filtra Compra/Venda, e já confere o ticker
 * contra a Carteira antes de mandar pra cá).
 *
 * Esse arquivo faz a MESMA conferência de ticker de novo, como segunda
 * camada de segurança (a cópia da Carteira no navegador pode estar
 * desatualizada) — nunca confia só na validação do front-end.
 *
 * Chamado pelo Router.gs: doPost, action=importarTransacoesB3, campo de
 * formulário "transacoes" com uma STRING JSON:
 *   [
 *     {"ticker":"BBAS3","data":"2026-09-02","tipo":"Compra","preco":22.08,"qtd":50,"taxa":1.90},
 *     {"ticker":"VALE3","data":"2026-09-03","tipo":"Compra","preco":78.10,"qtd":10,"taxa":1.90}
 *   ]
 *
 * PREMISSAS:
 * - "Transações" tem cabeçalho na linha 6 e dados a partir da linha 7,
 *   colunas A-F manuais (Ticker/Data/Tipo/Preço/Qtd./Taxa).
 * - "Carteira Ações" e "Carteira FIIs" têm o Ticker na coluna A.
 * - Só Ações e FIIs Brasil passam por aqui — Ações EUA e Renda Fixa
 *   continuam com lançamento manual (fora de escopo deste arquivo).
 *
 * MODO TESTE: e.parameter.opcoesTeste = '{"abaTransacoesNome":"aux_tests"}'
 * grava numa cópia da aba (mesma estrutura de "Transações": cabeçalho
 * linha 6, dados a partir da linha 7, colunas A-F) em vez da real —
 * usado pelos testes de "Gravação em lote" e "Rejeição parcial" no
 * teste.html, pra nunca escrever uma transação de teste na planilha
 * de verdade. A validação de ticker continua contra a Carteira REAL
 * (só leitura).
 */

/**
 * Handler chamado pelo Router (doPost).
 * e.parameter.opcoesTeste (opcional): JSON { abaTransacoesNome } — modo
 * teste, grava em "aux_tests" (ou o nome que vier aí) em vez de
 * "Transações" de verdade. Validação de ticker continua contra a
 * Carteira real (só leitura, nunca escreve lá) — o que muda é só o
 * destino da escrita.
 */
function handleImportarTransacoesB3(e) {
  try {
    var opcoes = null;
    if (e.parameter.opcoesTeste) {
      var opcoesTeste = JSON.parse(e.parameter.opcoesTeste);
      opcoes = { abaTransacoesNome: opcoesTeste.abaTransacoesNome || 'aux_tests' };
    }
    var resultado = importarTransacoesB3_(e.parameter, opcoes);
    return jsonOut({ ok: true, resultado: resultado });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * @param {Object} params - params.transacoes é a string JSON descrita acima.
 * @param {Object|null} opcoes - uso exclusivo dos testes: { abaTransacoesNome }.
 *   Fora de teste, sempre null — grava em "Transações" normalmente.
 * @return {Object} { gravadas: [tickers], rejeitadas: [{ticker, motivo}] }
 */
function importarTransacoesB3_(params, opcoes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var transacoes;
  try {
    transacoes = JSON.parse(params.transacoes);
  } catch (erro) {
    throw new Error('Campo "transacoes" não é um JSON válido: ' + erro);
  }
  if (!transacoes || !transacoes.length) {
    throw new Error('Nenhuma transação recebida.');
  }

  var tickersValidos = carregarTickersValidosB3_(ss);
  var nomeAbaTransacoes = (opcoes && opcoes.abaTransacoesNome) || 'Transações';
  var abaTransacoes = ss.getSheetByName(nomeAbaTransacoes);
  if (!abaTransacoes) throw new Error('Aba "' + nomeAbaTransacoes + '" não encontrada.');

  var resultado = { gravadas: [], rejeitadas: [] };

  transacoes.forEach(function (t) {
    var ticker = String(t.ticker || '').trim().toUpperCase();

    if (!ticker || !t.data || !t.tipo || t.qtd === undefined || t.preco === undefined) {
      resultado.rejeitadas.push({ ticker: ticker || '(vazio)', motivo: 'Linha incompleta (faltou ticker, data, tipo, qtd ou preço)' });
      return;
    }
    if (t.tipo !== 'Compra' && t.tipo !== 'Venda') {
      resultado.rejeitadas.push({ ticker: ticker, motivo: 'Tipo "' + t.tipo + '" não é Compra nem Venda — não deveria ter chegado aqui' });
      return;
    }
    if (tickersValidos.indexOf(ticker) === -1) {
      resultado.rejeitadas.push({ ticker: ticker, motivo: 'Ticker não existe na Carteira — inclua o ativo antes de importar' });
      return;
    }

    // Acha a próxima linha vazia A CADA transação (não antes do loop) —
    // assim, se o lote tiver duas linhas do mesmo dia, a segunda não
    // tenta escrever em cima da primeira que acabou de ser gravada.
    var linha = proximaLinhaVaziaTransacoes_(abaTransacoes);

    // Colunas A-F, na ordem real da aba:
    // A Ticker | B Data Transação | C Tipo da transação | D Preço | E Qtd. | F Taxa transação
    abaTransacoes.getRange(linha, 1, 1, 6).setValues([[
      ticker,
      normalizarData_(t.data),
      t.tipo,
      Number(t.preco),
      Number(t.qtd),
      Number(t.taxa || 0)
    ]]);

    resultado.gravadas.push(ticker);
  });

  return resultado;
}

/**
 * Tickers já cadastrados em Carteira Ações + Carteira FIIs — as duas
 * abas que a importação B3 (Brasil) pode alimentar.
 */
function carregarTickersValidosB3_(ss) {
  var tickers = [];
  ['Carteira Ações', 'Carteira FIIs'].forEach(function (nomeAba) {
    var aba = ss.getSheetByName(nomeAba);
    if (!aba) return;
    var ultimaLinha = aba.getLastRow();
    if (ultimaLinha < 1) return;
    var coluna = aba.getRange(1, 1, ultimaLinha, 1).getValues();
    coluna.forEach(function (linha) {
      var v = String(linha[0] || '').trim().toUpperCase();
      if (v && v !== 'TICKER') tickers.push(v);
    });
  });
  return tickers;
}

/**
 * Acha a primeira linha vazia da coluna A de "Transações", varrendo
 * célula a célula a partir da linha 7 (onde os dados começam).
 *
 * IMPORTANTE: nunca usar getLastRow() aqui — a aba tem ~10.800 linhas
 * com fórmula pré-preenchida da coluna G em diante, mesmo nas linhas
 * sem nenhuma transação de verdade, então getLastRow() sempre devolve
 * algo perto do fim da planilha, não a última linha com dado real.
 */
function proximaLinhaVaziaTransacoes_(aba) {
  var primeiraLinhaDados = 7;
  var maxLinhas = aba.getMaxRows();
  var coluna = aba.getRange(primeiraLinhaDados, 1, maxLinhas - primeiraLinhaDados + 1, 1).getValues();
  for (var i = 0; i < coluna.length; i++) {
    if (coluna[i][0] === '' || coluna[i][0] === null) {
      return i + primeiraLinhaDados;
    }
  }
  throw new Error('Não sobrou nenhuma linha vazia em "Transações" — a aba precisa de mais linhas de buffer antes de continuar.');
}

/**
 * O front-end (teste.html) manda a data já normalizada como
 * "YYYY-MM-DD". Aceita também um objeto Date, por segurança.
 */
function normalizarData_(dataStr) {
  if (dataStr instanceof Date) return dataStr;
  var partes = String(dataStr).split('-');
  return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
}
