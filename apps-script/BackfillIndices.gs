/**
 * BackfillIndices.gs — histórico diário do Ibovespa (GOOGLEFINANCE, em
 * pedaços de 180 dias) pra aux_historico-indices, mais o gatilho diário
 * que mantém Renda Fixa e Índices sincronizados (ver seção final).
 *
 * Arquivo SEPARADO do BackfillRendaFixa.gs — os dois coexistem no mesmo
 * projeto Apps Script (mesmo namespace global), nunca um sobrescrevendo
 * o outro.
 *
 * Taxas de CDI/SELIC (12/09/2026): resolvendo a lentidão de ~30-60s da
 * ação "home", que vinha (entre outras causas) de montarSerieHistoricoInicio_
 * (HistoricoInicio.gs) buscar CDI e SELIC DIRETO do BCB, cobrindo o
 * histórico inteiro (~2090 dias), TODA VEZ que a Início é aberta — mesmo
 * taxa de um dia que já passou nunca mudando. A correção segue o MESMO
 * padrão que já existia aqui pro Ibovespa: persiste em aux_historico-indices
 * (Índice = 'CDI'/'SELIC', Valor = taxa diária em %, igual ao que a API do
 * BCB devolve) e só cresce incrementalmente pelo gatilho diário — a Início
 * passa a só LER a aba, nunca mais chamar o BCB (ver
 * atualizarTaxasBcbIncremental_ abaixo e lerFatoresIndiceSalvos_ removida
 * de HistoricoInicio.gs, que agora lê tudo de aux_historico-indices numa
 * passada só). GOOGLEFINANCE não tem CDI/SELIC (não são tickers de bolsa),
 * então o BCB continua sendo a única fonte — só deixou de ser chamado na
 * hora da requisição.
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
var DATA_INICIO_HISTORICO_INDICES = new Date(2020, 11, 22); // mesmo início do restante do histórico (aux_historico-renda-fixa começa 22/12/2020)
var INDICES_TAXA_BCB = { CDI: 12, SELIC: 11 }; // nome persistido -> código da série SGS/BCB

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

/** Roda direto no editor, pra popular CDI/SELIC do zero (rodar 1x depois de colar este arquivo). */
function rodarBackfillTaxasBcbDireto() {
  Logger.log(JSON.stringify(executarBackfillTaxasBcb_(), null, 2));
}

/**
 * Lê aux_historico-indices inteira (Data | Índice | Valor), pulando linhas
 * sem Data. Existe à parte porque tanto o backfill do Ibovespa quanto o de
 * CDI/SELIC precisam preservar as linhas UM DO OUTRO ao regravar a aba do
 * zero (ela guarda os 3 índices juntos, uma linha por dia por índice).
 */
function lerTodasLinhasIndices_(abaIndices) {
  var ultimaLinha = Math.max(abaIndices.getLastRow() - 1, 0);
  if (ultimaLinha === 0) return [];
  return abaIndices.getRange(2, 1, ultimaLinha, 3).getValues().filter(function (linha) {
    return linha[0] instanceof Date;
  });
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

  var linhasIbovespa = buscarHistoricoGoogleFinanceEmPedacos_(abaAuxiliar, 'INDEXBVMF:IBOV', dataInicio, hoje, 'Ibovespa');

  // Preserva CDI/SELIC (ou qualquer outro índice) já salvos — só substitui
  // as linhas de Ibovespa (12/09/2026: antes regravava a aba inteira,
  // apagando CDI/SELIC se rodado de novo depois do backfill de taxas).
  var linhasMantidas = lerTodasLinhasIndices_(abaIndices).filter(function (linha) {
    return linha[1] !== 'Ibovespa';
  });
  var linhasFinal = linhasMantidas.concat(linhasIbovespa);

  var linhasAntigasCount = Math.max(abaIndices.getLastRow() - 1, 0);
  if (linhasAntigasCount > 0) abaIndices.getRange(2, 1, linhasAntigasCount, 3).clearContent();
  if (linhasFinal.length > 0) abaIndices.getRange(2, 1, linhasFinal.length, 3).setValues(linhasFinal);

  return { linhasGravadas: linhasIbovespa.length, totalNaAba: linhasFinal.length };
}

/**
 * Regrava as taxas diárias de CDI e SELIC (Índice = 'CDI'/'SELIC', Valor =
 * taxa % do dia, do jeito que a API do BCB devolve) em aux_historico-indices,
 * do zero, de 22/12/2020 até ontem — uso manual, rodar 1x (rodarBackfillTaxasBcbDireto())
 * depois de colar este arquivo pra já deixar a Início rápida na 1ª chamada.
 * Preserva as linhas de Ibovespa (ou qualquer outro índice) já salvas.
 */
function executarBackfillTaxasBcb_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_HISTORICO_INDICES);

  var ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(0, 0, 0, 0);

  var linhasNovas = [];
  Object.keys(INDICES_TAXA_BCB).forEach(function (nome) {
    linhasNovas = linhasNovas.concat(buscarTaxasBcbComoLinhas_(nome, DATA_INICIO_HISTORICO_INDICES, ontem));
  });

  var linhasMantidas = lerTodasLinhasIndices_(abaIndices).filter(function (linha) {
    return !(linha[1] === 'CDI' || linha[1] === 'SELIC');
  });
  var linhasFinal = linhasMantidas.concat(linhasNovas);

  var linhasAntigasCount = Math.max(abaIndices.getLastRow() - 1, 0);
  if (linhasAntigasCount > 0) abaIndices.getRange(2, 1, linhasAntigasCount, 3).clearContent();
  if (linhasFinal.length > 0) abaIndices.getRange(2, 1, linhasFinal.length, 3).setValues(linhasFinal);

  return { linhasGravadas: linhasNovas.length, totalNaAba: linhasFinal.length };
}

/**
 * Busca a série diária de CDI ou SELIC no BCB (SGS) e devolve linhas
 * prontas pra gravar em aux_historico-indices: [Data, nomeIndice, taxa%].
 * Não confundir com buscarFatoresDiariosBcb_ (BackfillRendaFixa.gs), que
 * devolve um MAPA de fatores (usado pela projeção de posições de Renda
 * Fixa) — esta aqui devolve LINHAS, pro backfill/incremental persistir.
 */
function buscarTaxasBcbComoLinhas_(nomeIndice, dataInicial, dataFinal) {
  if (dataInicial > dataFinal) return [];
  var codigoSerie = INDICES_TAXA_BCB[nomeIndice];
  var url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + codigoSerie +
    '/dados?formato=json&dataInicial=' + formatarDataBcbRF_(dataInicial) +
    '&dataFinal=' + formatarDataBcbRF_(dataFinal);
  var resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var dados = JSON.parse(resposta.getContentText());
  return dados.map(function (item) {
    var partes = item.data.split('/'); // dd/mm/aaaa
    var data = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
    return [data, nomeIndice, parseFloat(item.valor)];
  });
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
// BackfillRendaFixa.gs). Índices (Ibovespa) e Taxas (CDI/SELIC): idem,
// incremental (só o que falta desde a última data salva de cada um), pra
// não repetir a história inteira desde 2020 toda vez.
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

  try {
    var resultadoTaxas = atualizarTaxasBcbIncremental_();
    partes.push('Taxas CDI/SELIC: ' + resultadoTaxas.linhasNovas + ' linha(s) nova(s) (' + resultadoTaxas.detalhe + ')');
  } catch (erro) {
    status = (status === 'Erro') ? 'Erro' : 'Atenção';
    partes.push('Taxas CDI/SELIC falharam: ' + String(erro));
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

/**
 * Atualiza os fatores diários de CDI e SELIC salvos em aux_historico-indices,
 * de forma incremental (só o que falta desde a última data salva de cada
 * índice até ontem) — usado pelo gatilho diário, junto com Renda Fixa e
 * Ibovespa. Se ainda não existir nenhuma linha de um dos dois (1ª vez),
 * faz o backfill completo dele desde 22/12/2020 automaticamente — não
 * PRECISA rodar rodarBackfillTaxasBcbDireto() manual antes, mas rodar
 * manualmente uma vez (fora do horário do gatilho) é mais rápido pra ver
 * o resultado sem esperar o próximo disparo das 11h.
 */
function atualizarTaxasBcbIncremental_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_HISTORICO_INDICES);

  var ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(0, 0, 0, 0);

  var linhasNovas = [];
  var detalhe = [];
  Object.keys(INDICES_TAXA_BCB).forEach(function (nome) {
    var ultimaData = ultimaDataIndiceSalvo_(abaIndices, nome);
    var inicio = ultimaData
      ? new Date(ultimaData.getFullYear(), ultimaData.getMonth(), ultimaData.getDate() + 1)
      : new Date(DATA_INICIO_HISTORICO_INDICES);

    if (inicio > ontem) {
      detalhe.push(nome + ': já em dia');
      return;
    }
    var linhas = buscarTaxasBcbComoLinhas_(nome, inicio, ontem);
    linhasNovas = linhasNovas.concat(linhas);
    detalhe.push(nome + ': ' + linhas.length + ' linha(s) nova(s)');
  });

  if (linhasNovas.length > 0) {
    var primeiraLinhaNova = abaIndices.getLastRow() + 1;
    abaIndices.getRange(primeiraLinhaNova, 1, linhasNovas.length, 3).setValues(linhasNovas);
  }

  return { linhasNovas: linhasNovas.length, detalhe: detalhe.join(', ') };
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
