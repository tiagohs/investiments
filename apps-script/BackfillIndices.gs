/**
 * BackfillIndices.gs — histórico diário do Ibovespa (GOOGLEFINANCE, em
 * pedaços de 180 dias) pra aux_historico-indices, mais o gatilho diário
 * que mantém Renda Fixa e Índices sincronizados (ver seção final).
 *
 * Arquivo SEPARADO do BackfillRendaFixa.gs — os dois coexistem no mesmo
 * projeto Apps Script (mesmo namespace global), nunca um sobrescrevendo
 * o outro.
 *
 * GOTCHA DE LOCALE (importante, custou algumas rodadas de debug): a
 * planilha está em locale pt-BR, e Range.setFormula() nesse locale exige
 * ";" como separador de argumento (porque "," é separador decimal no
 * pt-BR) — só que NÃO traduz o nome da função pro alias localizado. Ou
 * seja:
 *   - "," + DATE  -> #ERROR! (separador errado pro locale)
 *   - ";" + DATA  -> #NAME?  (alias localizado não existe no motor que
 *                              o setFormula() usa)
 *   - ";" + DATE  -> funciona (combinação certa: separador do locale,
 *                              nome de função em inglês)
 * Qualquer fórmula nova escrita via setFormula() nessa planilha precisa
 * seguir esse padrão.
 *
 * GOTCHA DE ASSINCRONIA: SpreadsheetApp.flush() força a escrita mas não
 * garante que o GOOGLEFINANCE (cálculo externo assíncrono) já terminou
 * de calcular antes da leitura seguinte — por isso o polling com várias
 * tentativas (até 10x, com espera e novo flush a cada uma) antes de
 * desistir de um pedaço.
 */

var ABA_HISTORICO_INDICES = 'aux_historico-indices';
var ABA_AUXILIAR_APP = 'Auxiliar_app';
var CELULA_RASCUNHO_GOOGLEFINANCE = 'AZ1';
var DIAS_POR_PEDACO_INDICE = 180;

function rodarBackfillIndicesDireto() {
  Logger.log(JSON.stringify(executarBackfillIndices_(), null, 2));
}

function handleBackfillIndices(e) {
  var auth = verificarToken(e.parameter.token);
  if (!auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth.erro });
  try {
    return jsonOut({ ok: true, resultado: executarBackfillIndices_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'backfillIndices', erro: String(err) });
  }
}

/** Regrava aux_historico-indices INTEIRA do zero (2020-12-23 até hoje) — uso manual. */
function executarBackfillIndices_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_HISTORICO_INDICES);
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP);

  var dataInicio = new Date(2020, 11, 23);
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var linhas = buscarHistoricoGoogleFinanceEmPedacos_(abaAuxiliar, 'INDEXBVMF:IBOV', dataInicio, hoje, 'Ibovespa');

  var linhasAntigas = abaIndices.getLastRow() - 1;
  if (linhasAntigas > 0) abaIndices.getRange(2, 1, linhasAntigas, 3).clearContent();
  if (linhas.length > 0) abaIndices.getRange(2, 1, linhas.length, 3).setValues(linhas);

  return { linhasGravadas: linhas.length };
}

function buscarHistoricoGoogleFinanceEmPedacos_(abaAuxiliar, ticker, dataInicio, dataFim, nomeIndice) {
  var linhas = [];
  var celula = abaAuxiliar.getRange(CELULA_RASCUNHO_GOOGLEFINANCE);
  var inicioPedaco = new Date(dataInicio);

  while (inicioPedaco <= dataFim) {
    var fimPedaco = new Date(inicioPedaco);
    fimPedaco.setDate(fimPedaco.getDate() + DIAS_POR_PEDACO_INDICE);
    if (fimPedaco > dataFim) fimPedaco = new Date(dataFim);

    // pt-BR: ";" como separador de argumento, mas "DATE" em inglês (ver
    // gotcha de locale no cabeçalho do arquivo).
    var formula = '=GOOGLEFINANCE("' + ticker + '";"close";DATE(' +
      inicioPedaco.getFullYear() + ';' + (inicioPedaco.getMonth() + 1) + ';' + inicioPedaco.getDate() + ');DATE(' +
      fimPedaco.getFullYear() + ';' + (fimPedaco.getMonth() + 1) + ';' + fimPedaco.getDate() + '))';

    celula.setFormula(formula);
    SpreadsheetApp.flush();

    var valores = [];
    var tentativas = 0;
    var maxTentativas = 10;
    while (tentativas < maxTentativas) {
      Utilities.sleep(1500);
      SpreadsheetApp.flush();
      var faixa = abaAuxiliar.getRange(celula.getRow(), celula.getColumn(), 400, 2);
      var brutos = faixa.getValues();

      var primeiraCelula = brutos[0][0];
      if (typeof primeiraCelula === 'string' && primeiraCelula.indexOf('#') === 0) {
        throw new Error('GOOGLEFINANCE devolveu erro pra ' + ticker + ' (' + formatarDataIndice_(inicioPedaco) +
          ' - ' + formatarDataIndice_(fimPedaco) + '): ' + primeiraCelula);
      }

      valores = brutos.filter(function (linha) {
        return linha[0] !== '' && linha[0] !== null && linha[0] instanceof Date;
      });

      if (valores.length > 0) break;
      tentativas++;
    }

    if (valores.length === 0) {
      Logger.log('AVISO: nenhum dado pra ' + ticker + ' entre ' + formatarDataIndice_(inicioPedaco) +
        ' e ' + formatarDataIndice_(fimPedaco) + ' depois de ' + maxTentativas + ' tentativas — registrando como lacuna.');
    }

    valores.forEach(function (linha) {
      linhas.push([linha[0], nomeIndice, linha[1]]);
    });

    celula.clearContent();
    SpreadsheetApp.flush();
    inicioPedaco = new Date(fimPedaco);
    inicioPedaco.setDate(inicioPedaco.getDate() + 1);
  }

  return linhas;
}

function formatarDataIndice_(data) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

// --- Sincronização diária de Renda Fixa + Índices ---
// Renda Fixa: recálculo incremental (retoma do último dia salvo por
// posição — ver executarBackfillRendaFixaIncremental_() no
// BackfillRendaFixa.gs). Índices: idem, incremental (só o que falta desde
// a última data salva), pra não repetir os pedaços de 180 dias da
// história inteira desde 2020 toda vez.
//
// Roda num gatilho SEPARADO do gatilho de ações/FIIs/USA (gatilhoDiario()
// em Sync.gs), 1h depois, pra não competir pelo orçamento de 6min de
// execução quando o de ações já está ocupado (isso aconteceu de verdade
// em 12/09/2026: 7 tickers USA ficaram incompletos numa execução e se
// resolveram sozinhos na seguinte — comportamento esperado).

function instalarGatilhoDiarioRendaFixaEIndices() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'gatilhoDiarioRendaFixaEIndices';
  });
  if (jaExiste) {
    Logger.log('Gatilho já existe, nada a fazer.');
    return;
  }
  ScriptApp.newTrigger('gatilhoDiarioRendaFixaEIndices')
    .timeBased()
    .everyDays(1)
    .atHour(11) // 1h depois do gatilho de ações/FIIs/USA (~10h), pra não competir por quota
    .nearMinute(1)
    .create();
  Logger.log('Gatilho diário de Renda Fixa + Índices instalado (dispara por volta de 11h).');
}

function gatilhoDiarioRendaFixaEIndices() {
  if (new Date().getDay() === 0) { // domingo
    Logger.log('Hoje é domingo, gatilho não faz nada.');
    return;
  }
  atualizarRendaFixaEIndicesDiario_();
}

/** Roda a mesma rotina do gatilho, na hora, pra testar direto no editor. */
function rodarRendaFixaEIndicesDiretoDireto() {
  atualizarRendaFixaEIndicesDiario_();
  Logger.log('Rodado — confira o Registro de Controle.');
}

function atualizarRendaFixaEIndicesDiario_() {
  var partes = [];
  var status = 'Sucesso';

  try {
    var resultadoRf = executarBackfillRendaFixaIncremental_();
    partes.push('Renda Fixa: ' + resultadoRf.linhasGravadas + ' linha(s) nova(s) (' + resultadoRf.posicoes + ' posições)');
  } catch (erro) {
    status = 'Erro';
    partes.push('Renda Fixa falhou: ' + String(erro));
  }

  try {
    var resultadoIndices = atualizarIndicesIncremental_();
    partes.push('Índices: ' + resultadoIndices.linhasNovas + ' linha(s) nova(s)' +
      (resultadoIndices.jaEstavaEmDia ? ' (já estava em dia)' : ''));
  } catch (erro) {
    status = (status === 'Erro') ? 'Erro' : 'Atenção';
    partes.push('Índices falharam: ' + String(erro));
  }

  gravarRegistroControle_(status, 'Automático', partes.join(' — '));
}

/**
 * Atualiza aux_historico-indices de forma incremental: acha a última data
 * salva do Ibovespa e busca só o que falta até ontem — evita repetir a
 * história inteira desde 2020 a cada execução diária. Se nunca rodou o
 * backfill completo ainda, lança erro (rode rodarBackfillIndicesDireto()
 * manualmente primeiro).
 */
function atualizarIndicesIncremental_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_HISTORICO_INDICES);
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP);

  var ultimaData = ultimaDataIndiceSalvo_(abaIndices, 'Ibovespa');
  if (!ultimaData) {
    throw new Error('nenhum dado em ' + ABA_HISTORICO_INDICES + ' ainda — rode rodarBackfillIndicesDireto() primeiro.');
  }

  var ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(0, 0, 0, 0);

  var inicio = new Date(ultimaData);
  inicio.setDate(inicio.getDate() + 1);

  if (inicio > ontem) {
    return { linhasNovas: 0, jaEstavaEmDia: true };
  }

  var linhas = buscarHistoricoGoogleFinanceEmPedacos_(abaAuxiliar, 'INDEXBVMF:IBOV', inicio, ontem, 'Ibovespa');
  if (linhas.length > 0) {
    var primeiraLinhaNova = abaIndices.getLastRow() + 1;
    abaIndices.getRange(primeiraLinhaNova, 1, linhas.length, 3).setValues(linhas);
  }

  return { linhasNovas: linhas.length, jaEstavaEmDia: false };
}

function ultimaDataIndiceSalvo_(aba, nomeIndice) {
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return null;
  var dados = aba.getRange(2, 1, ultimaLinha - 1, 2).getValues(); // A=Data, B=Índice
  var ultima = null;
  for (var i = 0; i < dados.length; i++) {
    if (dados[i][1] === nomeIndice && dados[i][0] instanceof Date) {
      if (!ultima || dados[i][0] > ultima) ultima = dados[i][0];
    }
  }
  return ultima;
}
