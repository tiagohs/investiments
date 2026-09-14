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
 * atualizarTaxasBcbIncremental_ abaixo; em HistoricoInicio.gs, a leitura de
 * CDI/SELIC foi inserida direto no MESMO loop que já lia Ibovespa dessa aba
 * — não existe uma função separada "lerFatoresIndiceSalvos_", é tudo lido
 * numa passada só de getValues() dentro de montarSerieHistoricoInicio_).
 * GOOGLEFINANCE não tem CDI/SELIC (não são tickers de bolsa), então o BCB
 * continua sendo a única fonte — só deixou de ser chamado na hora da
 * requisição.
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
 *
 * BUG DE DATA NO CDI/SELIC (13/09/2026): auditoria pedida pelo usuário
 * depois da correção da Renda Fixa (BackfillRendaFixa.gs) encontrou o
 * MESMO tipo de bug aqui, em buscarTaxasBcbComoLinhas_ — mas 1 dia
 * ADIANTADO em vez de atrasado. Corrigido com o mesmo "+24h" (ver
 * comentário na função). É PRECISO rodar rodarBackfillTaxasBcbDireto()
 * de novo depois de colar este arquivo pra regravar CDI/SELIC com a data
 * certa (ele preserva as linhas de Ibovespa, só regrava CDI/SELIC).
 */

var ABA_HISTORICO_INDICES = 'aux_historico-indices';
var ABA_AUXILIAR_APP = 'Auxiliar_app';
var CELULA_RASCUNHO_GOOGLEFINANCE = 'AZ1';
var DIAS_POR_PEDACO_INDICE = 180;
var DATA_INICIO_HISTORICO_INDICES = new Date(2020, 11, 22); // mesmo início do restante do histórico (aux_historico-renda-fixa começa 22/12/2020)
var INDICES_TAXA_BCB = { CDI: 12, SELIC: 11 }; // nome persistido -> código da série SGS/BCB

/**
 * Roda fn() até funcionar, tentando de novo em caso de erro. Usado pelos
 * passos externos mais frágeis do gatilho diário de Renda Fixa/Índices
 * (GOOGLEFINANCE pro Ibovespa, API do BCB pra CDI/SELIC) — ver
 * atualizarRendaFixaEIndicesDiario_ abaixo.
 *
 * 14/09/2026: pedido do Tiago depois de ver a sincronização automática de
 * 14/09 registrar "Atenção" com Índices e Taxas CDI/SELIC falhando (um
 * soluço pontual do GOOGLEFINANCE - #N/A pro Ibovespa - e outro do BCB -
 * resposta que não veio como lista, virando "dados.map is not a
 * function") — nenhum dos dois é um bug de conta, são falhas transitórias
 * de fonte externa que numa tentativa seguinte, alguns segundos depois,
 * tendem a se resolver sozinhas. Antes disso, uma falha assim virava
 * "Atenção" na primeira tentativa e ficava assim até o próximo gatilho no
 * dia seguinte, mesmo quando o problema já tinha passado minutos depois.
 * 3 tentativas, 20s de espera entre elas — chega pra um soluço pontual
 * sem seguer o orçamento de 6min de execução do Apps Script (pior caso:
 * 3 chamadas + 2 esperas de 20s = bem menos que 1min).
 */
function comRetry_(fn, contexto) {
  var MAX_TENTATIVAS = 3;
  var ESPERA_MS = 20 * 1000;
  var ultimoErro = null;
  for (var tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      return fn();
    } catch (erro) {
      ultimoErro = erro;
      Logger.log(contexto + ': tentativa ' + tentativa + '/' + MAX_TENTATIVAS + ' falhou - ' + erro);
      if (tentativa < MAX_TENTATIVAS) Utilities.sleep(ESPERA_MS);
    }
  }
  throw ultimoErro;
}

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

/**
 * Handler chamado pelo Router (doPost) — ação SEPARADA de
 * "sincronizarAgora" (Sync.gs, cuida só de ações/FIIs/USA) de propósito.
 * 14/09/2026: rodar as duas coisas dentro da MESMA requisição (dentro de
 * handleSincronizarAgora) foi tentado e revertido no mesmo dia - com um
 * backlog de vários dias, ações/FIIs/USA sozinho já usa quase todo o
 * orçamento de tempo pensado pra caber no limite de execução do Apps
 * Script; somar Renda Fixa/Índices por cima estourava esse limite quase
 * toda vez, matando a execução inteira em silêncio (ver comentário em
 * Sync.gs!handleSincronizarAgora). O botão "Sincronizar agora"
 * (shell.js!setupSyncNowButton) agora chama esta ação numa requisição
 * própria, DEPOIS que a de ações/FIIs/USA já convergiu sozinha - cada
 * uma com seu próprio orçamento só pra si.
 */
function handleSincronizarRendaFixaEIndices(e) {
  try {
    return jsonOut({ ok: true, resultado: atualizarRendaFixaEIndicesDiario_('Manual') });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
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
 *
 * 13/09/2026: "new Date(ano, mes-1, dia)" sofre do MESMO problema de fuso
 * já corrigido em BackfillRendaFixa.gs (ver cabeçalho daquele arquivo) —
 * só que aqui o desvio saía pro lado OPOSTO (1 dia ADIANTADO, não
 * atrasado). Prova, sem precisar bater com o BCB de novo: nos dados já
 * gravados em aux_historico-indices, CDI/SELIC apareciam em ~286 domingos
 * e NUNCA numa sexta-feira, além de aparecerem em feriados (Tiradentes,
 * Independência, Natal) — impossível, já que o BCB não publica CDI/SELIC
 * em dia não útil. Somando 1 dia em cada linha faz os domingos, as
 * "sextas faltando" e os feriados indevidos desaparecerem por completo —
 * ficando idêntico ao padrão do Ibovespa (que nunca erra, pois vem direto
 * do GOOGLEFINANCE). Mesma correção "+24h" já usada na Renda Fixa.
 */
function buscarTaxasBcbComoLinhas_(nomeIndice, dataInicial, dataFinal) {
  if (dataInicial > dataFinal) return [];
  var codigoSerie = INDICES_TAXA_BCB[nomeIndice];
  var url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + codigoSerie +
    '/dados?formato=json&dataInicial=' + formatarDataBcbRF_(dataInicial) +
    '&dataFinal=' + formatarDataBcbRF_(dataFinal);
  var resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var dados = JSON.parse(resposta.getContentText());
  // 14/09/2026: o BCB às vezes devolve algo que não é uma lista (erro,
  // manutenção, rate limit) - sem essa checagem virava um "TypeError:
  // dados.map is not a function" bem menos claro de diagnosticar (foi o
  // que apareceu no Registro de Controle em 14/09). Mensagem melhor +
  // ainda é um erro comum, então comRetry_ (chamado por quem chama esta
  // função) trata igual.
  if (!Array.isArray(dados)) {
    throw new Error('BCB devolveu resposta inesperada (não é lista) pra ' + nomeIndice + ': ' +
      resposta.getContentText().slice(0, 200));
  }
  return dados.map(function (item) {
    var partes = item.data.split('/'); // dd/mm/aaaa
    var dataBruta = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
    var data = new Date(dataBruta.getTime() + 24 * 60 * 60 * 1000);
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

/**
 * 13/09/2026: passou a delegar pro formatador cacheado de
 * BackfillRendaFixa.gs (mesmo formato "dd/MM/yyyy") em vez de chamar
 * Utilities.formatDate direto. Volume baixo aqui (só usada por PEDAÇO de
 * 180 dias no backfill do Ibovespa, não por dia/linha — bem menos crítico
 * que os loops diários de BackfillRendaFixa.gs), mas reaproveitar o mesmo
 * Intl.DateTimeFormat já cacheado custa nada e mantém o projeto
 * consistente (só existe 1 formatador "dd/MM/yyyy" no lugar de 2).
 */
function formatarDataIndice_(data) {
  return formatarDataBcbRF_(data);
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
  var resultado = atualizarRendaFixaEIndicesDiario_('Manual');
  Logger.log('Rodado (' + resultado.status + ') — ' + resultado.detalhe);
}

function atualizarRendaFixaEIndicesDiario_(origem) {
  origem = origem || 'Automático';
  var partes = [];
  var status = 'Sucesso';

  try {
    var resultadoRf = comRetry_(function () { return executarBackfillRendaFixaIncremental_(); }, 'Renda Fixa');
    partes.push('Renda Fixa: ' + resultadoRf.linhasGravadas + ' linha(s) nova(s) (' + resultadoRf.posicoes + ' posições)');
  } catch (erro) {
    status = 'Erro';
    partes.push('Renda Fixa falhou: ' + String(erro));
  }

  // 13/09/2026: lê aux_historico-indices UMA vez aqui (mapa índice -> última
  // data salva) e passa pros dois passos abaixo — antes, Índices (Ibovespa)
  // e Taxas (CDI+SELIC) reliam a aba inteira cada um por conta própria (até
  // 3 leituras completas da mesma aba nesta única execução do gatilho).
  var mapaUltimasDatasIndices = null;
  try {
    var abaIndicesCache = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_HISTORICO_INDICES);
    if (abaIndicesCache) mapaUltimasDatasIndices = carregarTodasUltimasDatasIndices_(abaIndicesCache);
  } catch (erro) {
    mapaUltimasDatasIndices = null; // cada passo abaixo cai no fallback de ler sozinho
  }

  // 14/09/2026: os dois passos abaixo (GOOGLEFINANCE pro Ibovespa, BCB pra
  // CDI/SELIC) agora tentam de novo em caso de erro (comRetry_, 3x, 20s de
  // espera) antes de desistir e virar "Atenção"/"Erro" - ver comentário de
  // comRetry_ no topo do arquivo.
  try {
    var resultadoIndices = comRetry_(function () { return atualizarIndicesIncremental_(mapaUltimasDatasIndices); }, 'Índices');
    partes.push('Índices: ' + resultadoIndices.linhasNovas + ' linha(s) nova(s)' +
      (resultadoIndices.jaEstavaEmDia ? ' (já estava em dia)' : ''));
  } catch (erro) {
    status = (status === 'Erro') ? 'Erro' : 'Atenção';
    partes.push('Índices falharam: ' + String(erro));
  }

  try {
    var resultadoTaxas = comRetry_(function () { return atualizarTaxasBcbIncremental_(mapaUltimasDatasIndices); }, 'Taxas CDI/SELIC');
    partes.push('Taxas CDI/SELIC: ' + resultadoTaxas.linhasNovas + ' linha(s) nova(s) (' + resultadoTaxas.detalhe + ')');
  } catch (erro) {
    status = (status === 'Erro') ? 'Erro' : 'Atenção';
    partes.push('Taxas CDI/SELIC falharam: ' + String(erro));
  }

  var detalhe = partes.join(' — ');
  gravarRegistroControle_(status, origem, detalhe);
  // notificarFalhaSincronizacao_ (Sync.gs) já só envia e-mail quando
  // origem === 'Automático' - seguro chamar sempre aqui, mesmo quando
  // origem é 'Manual' (clique no botão "Sincronizar agora").
  if (status === 'Erro') notificarFalhaSincronizacao_(origem, detalhe);
  return { status: status, detalhe: detalhe };
}

/**
 * Atualiza aux_historico-indices de forma incremental: acha a última data
 * salva do Ibovespa e busca só o que falta até ontem — evita repetir a
 * história inteira desde 2020 a cada execução diária. Se nunca rodou o
 * backfill completo ainda, lança erro (rode rodarBackfillIndicesDireto()
 * manualmente primeiro).
 */
function atualizarIndicesIncremental_(mapaUltimasDatasCache) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_HISTORICO_INDICES);
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP);

  var ultimaData = ultimaDataIndiceSalvo_(abaIndices, 'Ibovespa', mapaUltimasDatasCache);
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
function atualizarTaxasBcbIncremental_(mapaUltimasDatasCache) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_HISTORICO_INDICES);

  var ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(0, 0, 0, 0);

  var linhasNovas = [];
  var detalhe = [];
  Object.keys(INDICES_TAXA_BCB).forEach(function (nome) {
    var ultimaData = ultimaDataIndiceSalvo_(abaIndices, nome, mapaUltimasDatasCache);
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

/**
 * Última data salva pra UM índice (Ibovespa/CDI/SELIC). mapaCache
 * (opcional) é o resultado de carregarTodasUltimasDatasIndices_, montado
 * 1x por execução por quem chama em lote (ver
 * atualizarRendaFixaEIndicesDiario_) — sem ele, relê a aba inteira sozinho
 * (uso isolado, ex.: rodando uma função direto no editor).
 */
function ultimaDataIndiceSalvo_(aba, nomeIndice, mapaCache) {
  var mapa = mapaCache || carregarTodasUltimasDatasIndices_(aba);
  return mapa[nomeIndice] || null;
}

/**
 * Última data salva de CADA índice, numa passada só pela aba — em vez de
 * ultimaDataIndiceSalvo_ reler a aba inteira uma vez por índice (13/09/2026:
 * antes disso, atualizarRendaFixaEIndicesDiario_ relia aux_historico-indices
 * até 3 vezes na mesma execução: 1x pro Ibovespa, 1x pro CDI, 1x pro SELIC).
 */
function carregarTodasUltimasDatasIndices_(aba) {
  var mapa = {};
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return mapa;
  var dados = aba.getRange(2, 1, ultimaLinha - 1, 2).getValues(); // A=Data, B=Índice
  for (var i = 0; i < dados.length; i++) {
    var nomeIndice = dados[i][1];
    var data = dados[i][0];
    if (data instanceof Date && (!mapa[nomeIndice] || data > mapa[nomeIndice])) {
      mapa[nomeIndice] = data;
    }
  }
  return mapa;
}
