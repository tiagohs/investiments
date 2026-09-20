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
 *
 * IFIX / S&P 500 / IPCA (19/09/2026): backfill de histórico adicionado pros
 * 3, pedido do Tiago pra viabilizar o gráfico "Rentabilidade acumulada" nas
 * 4 telas de Carteiras (só Ações×Ibovespa e Renda Fixa×CDI já tinham
 * histórico suficiente; FIIs×IFIX, Ações EUA×S&P 500 e Renda Fixa×IPCA
 * estavam bloqueados por falta de série histórica). IFIX e S&P 500 usam a
 * MESMA técnica de pedaços do GOOGLEFINANCE que já existia pro Ibovespa
 * (buscarHistoricoGoogleFinanceEmPedacos_, agora genérica via
 * executarBackfillIndiceGoogleFinance_ — ver TICKERS_INDICES_GOOGLEFINANCE).
 * Tickers CONFIRMADOS direto na planilha real que o Tiago mandou
 * (Auxiliar_app!B9 = IFIX, B15 = S&P 500) — essas fórmulas só existem na UI
 * da planilha, não em nenhum .gs, então não dava pra saber sem confirmar.
 * IPCA usa a mesma API BCB/SGS que CDI/SELIC já usavam
 * (buscarTaxasBcbComoLinhas_, série 433 — a mesma que
 * buscarIpcaAcumulado12Meses_ já usa pro valor "de hoje"), só que com
 * granularidade MENSAL em vez de diária (1 linha por mês, não por dia
 * útil). Rodar 1x cada, manualmente, depois de colar este arquivo:
 * rodarBackfillIfixDireto(), rodarBackfillSp500Direto(),
 * rodarBackfillTaxasBcbDireto() (esta última já existia, agora também traz
 * IPCA junto com CDI/SELIC). O gatilho diário (atualizarIndicesIncremental_)
 * já foi generalizado pra manter os 3 do GOOGLEFINANCE em dia sozinho dali
 * em diante — só não faz nada por um índice que ainda não teve o backfill
 * inicial rodado (não derruba o gatilho por causa disso).
 */

var ABA_HISTORICO_INDICES = 'aux_historico-indices';
var ABA_AUXILIAR_APP = 'Auxiliar_app';
var CELULA_RASCUNHO_GOOGLEFINANCE = 'AZ1';
var DIAS_POR_PEDACO_INDICE = 180;
var DATA_INICIO_HISTORICO_INDICES = new Date(2020, 11, 22); // mesmo início do restante do histórico (aux_historico-renda-fixa começa 22/12/2020)
var INDICES_TAXA_BCB = { CDI: 12, SELIC: 11, IPCA: 433 }; // nome persistido -> código da série SGS/BCB (IPCA: variação mensal, série 433 — mesma que buscarIpcaAcumulado12Meses_ já usa pro "hoje")
var TICKERS_INDICES_GOOGLEFINANCE = { Ibovespa: 'INDEXBVMF:IBOV', IFIX: 'INDEXBVMF:IFIX', 'S&P 500': 'INDEXSP:.INX' }; // nome persistido -> ticker GOOGLEFINANCE (confirmado com Tiago via planilha real, 19/09/2026: Auxiliar_app!B9 e B15)

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

/** Roda direto no editor, pra popular CDI/SELIC/IPCA do zero (rodar 1x depois de colar este arquivo). */
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

/**
 * Regrava aux_historico-indices INTEIRA do zero pra UM índice via
 * GOOGLEFINANCE (Ibovespa/IFIX/S&P 500), preservando os demais índices já
 * salvos (CDI/SELIC/IPCA e os outros 2 desta família) — uso manual.
 *
 * 19/09/2026: generalizado a partir do executarBackfillIndices_() original
 * (que só fazia Ibovespa) pra popular IFIX e S&P 500 do zero também — ver
 * nota no cabeçalho do arquivo. Cada índice roda como sua PRÓPRIA execução
 * manual (rodarBackfillIfixDireto/rodarBackfillSp500Direto/
 * rodarBackfillIndicesDireto, abaixo) em vez de tudo numa chamada só, pra
 * não estourar o limite de 6min de execução do Apps Script — ~12 pedaços de
 * 180 dias cada um, só de 1 índice, já é o que o Ibovespa levava sozinho.
 */
function executarBackfillIndiceGoogleFinance_(nomeIndice, ticker) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_HISTORICO_INDICES);
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP);

  var dataInicio = new Date(2020, 11, 23);
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var linhasNovas = buscarHistoricoGoogleFinanceEmPedacos_(abaAuxiliar, ticker, dataInicio, hoje, nomeIndice);

  // Preserva os demais índices (CDI/SELIC/IPCA e os outros 2 do
  // GOOGLEFINANCE) já salvos — só substitui as linhas deste índice
  // (12/09/2026: antes regravava a aba inteira, apagando CDI/SELIC se
  // rodado de novo depois do backfill de taxas).
  var linhasMantidas = lerTodasLinhasIndices_(abaIndices).filter(function (linha) {
    return linha[1] !== nomeIndice;
  });
  var linhasFinal = linhasMantidas.concat(linhasNovas);

  var linhasAntigasCount = Math.max(abaIndices.getLastRow() - 1, 0);
  if (linhasAntigasCount > 0) abaIndices.getRange(2, 1, linhasAntigasCount, 3).clearContent();
  if (linhasFinal.length > 0) abaIndices.getRange(2, 1, linhasFinal.length, 3).setValues(linhasFinal);

  return { linhasGravadas: linhasNovas.length, totalNaAba: linhasFinal.length };
}

/** Regrava aux_historico-indices INTEIRA do zero pro Ibovespa (2020-12-23 até hoje) — uso manual. */
function executarBackfillIndices_() {
  return executarBackfillIndiceGoogleFinance_('Ibovespa', TICKERS_INDICES_GOOGLEFINANCE.Ibovespa);
}

/** Roda direto no editor, pra popular IFIX do zero (rodar 1x). */
function rodarBackfillIfixDireto() {
  Logger.log(JSON.stringify(executarBackfillIndiceGoogleFinance_('IFIX', TICKERS_INDICES_GOOGLEFINANCE.IFIX), null, 2));
}

/** Roda direto no editor, pra popular S&P 500 do zero (rodar 1x). */
function rodarBackfillSp500Direto() {
  Logger.log(JSON.stringify(executarBackfillIndiceGoogleFinance_('S&P 500', TICKERS_INDICES_GOOGLEFINANCE['S&P 500']), null, 2));
}

/**
 * Regrava as taxas/índices de CDI, SELIC e IPCA (Índice = 'CDI'/'SELIC'/'IPCA',
 * Valor = taxa % do dia (CDI/SELIC) ou variação % do mês (IPCA, série 433),
 * do jeito que a API do BCB devolve) em aux_historico-indices, do zero, de
 * 22/12/2020 até ontem — uso manual, rodar 1x (rodarBackfillTaxasBcbDireto())
 * depois de colar este arquivo pra já deixar a Início rápida na 1ª chamada
 * (e os gráficos de Rentabilidade acumulada × IPCA, 19/09/2026, com dado
 * disponível). Preserva as linhas de Ibovespa/IFIX/S&P 500 (ou qualquer
 * outro índice fora de INDICES_TAXA_BCB) já salvas.
 *
 * 19/09/2026: IPCA adicionado a INDICES_TAXA_BCB (série 433, igual à que
 * buscarIpcaAcumulado12Meses_ já usa pro valor "de hoje", só que aqui com
 * range dataInicial/dataFinal em vez de /dados/ultimos/13) — pedido do
 * Tiago, pra viabilizar o gráfico de Rentabilidade acumulada × IPCA em
 * Renda Fixa. A granularidade é MENSAL (1 linha por mês, não por dia útil
 * como CDI/SELIC) — quem consumir esta série (task de gráficos) precisa
 * tratar isso, mesmo padrão de forward-fill que já existe pra dias
 * não-úteis em montarSerieHistoricoInicio_ resolve igual, só que com
 * lacunas maiores entre pontos.
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
    return !INDICES_TAXA_BCB.hasOwnProperty(linha[1]);
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
  // 14/09/2026 (revisado no mesmo dia): a 1ª versão disto lançava um erro
  // quando o BCB devolvia algo que não é lista (era um "TypeError:
  // dados.map is not a function" ainda menos claro antes desta checagem
  // existir). Só que, na prática (confirmado pelo comRetry_ errando IGUAL
  // antes e depois de 3 tentativas de 20s), essa resposta "estranha" do
  // BCB é o jeito dele dizer "não tem nenhum dia útil nesse período" -
  // CDI/SELIC só são publicados em dia útil, e a sincronização incremental
  // diária pode perfeitamente pedir um intervalo que é só fim de semana.
  // Não é transitório, então retry não resolve - trata como "sem dado
  // disponível pro período" (mesmo padrão já usado pros ativos individuais
  // em Sync.gs), só logando o corpo bruto pra quem quiser investigar um
  // erro de fonte externa de verdade nas Execuções do Apps Script.
  if (!Array.isArray(dados)) {
    Logger.log('AVISO: BCB devolveu resposta inesperada (não é lista) pra ' + nomeIndice + ' entre ' +
      formatarDataIndice_(dataInicial) + ' e ' + formatarDataIndice_(dataFinal) + ': ' +
      resposta.getContentText().slice(0, 200) + ' — tratando como sem dado disponível no período.');
    return [];
  }
  return dados.map(function (item) {
    var partes = item.data.split('/'); // dd/mm/aaaa
    var dataBruta = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
    var data = new Date(dataBruta.getTime() + 24 * 60 * 60 * 1000);
    return [data, nomeIndice, parseFloat(item.valor)];
  });
}

function buscarHistoricoGoogleFinanceEmPedacos_(abaAuxiliar, ticker, dataInicio, dataFim, nomeIndice, valorAnteriorConhecido) {
  var linhas = [];
  var celula = abaAuxiliar.getRange(CELULA_RASCUNHO_GOOGLEFINANCE);
  var inicioPedaco = new Date(dataInicio);
  // 17/09/2026: guarda de sanidade - Tiago reportou o gráfico de
  // Rentabilidade "explodindo" pra +100%/-100% no dia 16/09/2026; a causa
  // foi um valor absurdo (114.3) que o GOOGLEFINANCE devolveu pro
  // Ibovespa naquele dia (o normal na época era ~186.500 pontos - 114.3 é
  // claramente um soluço pontual da fonte externa, não um pregão real, o
  // índice nunca despenca >99% num dia só). Esse valor passava direto
  // pelo "valores.forEach" antigo (só checava se linha[0] era Date, nunca
  // se linha[1] fazia sentido) e ia pra aux_historico-indices intacto,
  // quebrando normalizarSerieRentabilidade (inicio.js), que usa esse
  // ponto como base/fim de "% desde o início do período". `anterior`
  // guarda o último valor ACEITO (começa no último já salvo na planilha,
  // se veio via valorAnteriorConhecido) - uma linha nova mais de 2x maior
  // ou menor que ele é rejeitada (log + "registrando como lacuna", mesmo
  // caminho já usado pra #N/A) em vez de gravada - a lacuna se
  // autocorrige sozinha no próximo sync (forward-fill em
  // HistoricoInicio.gs carrega o último valor bom pra frente até lá).
  var anterior = (typeof valorAnteriorConhecido === 'number' && Number.isFinite(valorAnteriorConhecido)) ? valorAnteriorConhecido : null;

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
    var erroExplicito = null;
    while (tentativas < maxTentativas) {
      Utilities.sleep(1500);
      SpreadsheetApp.flush();
      var faixa = abaAuxiliar.getRange(celula.getRow(), celula.getColumn(), 400, 2);
      var brutos = faixa.getValues();

      var primeiraCelula = brutos[0][0];
      if (typeof primeiraCelula === 'string' && primeiraCelula.indexOf('#') === 0) {
        // 14/09/2026: antes disso, uma célula de erro aqui (tipicamente
        // #N/A) lançava um erro que derrubava a sincronização de Índices
        // inteira. Só que #N/A é a resposta NORMAL e DETERMINÍSTICA do
        // GOOGLEFINANCE quando o pedaço pedido não tem NENHUM pregão -
        // o caso mais comum sendo justamente um fim de semana, que é
        // exatamente o tipo de intervalo que a sincronização incremental
        // diária pede (1-3 dias, não os 180 de um pedaço de backfill).
        // Retry não ajuda aqui (comRetry_ confirmou isso na prática -
        // errou igual antes e depois de 3 tentativas de 20s) porque não é
        // transitório - é uma resposta correta pra uma pergunta sem
        // resposta (não teve pregão). Trata igual ao caminho de baixo
        // ("sem dado" depois de todas as tentativas): loga o valor bruto
        // (útil se for mesmo um erro de fonte externa) mas não derruba a
        // sincronização - resolvia sozinho na 2ª feira seguinte de
        // qualquer jeito, só que gritando "Atenção" toda vez.
        erroExplicito = primeiraCelula;
        break;
      }

      valores = brutos.filter(function (linha) {
        return linha[0] !== '' && linha[0] !== null && linha[0] instanceof Date;
      });

      if (valores.length > 0) break;
      tentativas++;
    }

    if (valores.length === 0) {
      Logger.log('AVISO: nenhum dado pra ' + ticker + ' entre ' + formatarDataIndice_(inicioPedaco) +
        ' e ' + formatarDataIndice_(fimPedaco) +
        (erroExplicito ? ' (GOOGLEFINANCE devolveu ' + erroExplicito + ', provável ausência de pregão no período)'
                        : ' depois de ' + maxTentativas + ' tentativas') +
        ' — registrando como lacuna.');
    }

    valores.forEach(function (linha) {
      var valor = linha[1];
      if (anterior && (valor < anterior * 0.5 || valor > anterior * 2)) {
        Logger.log('AVISO: valor implausível pra ' + nomeIndice + ' em ' + formatarDataIndice_(linha[0]) +
          ' (' + valor + ', esperado perto de ' + anterior + ') - provável soluço do GOOGLEFINANCE, registrando como lacuna.');
        return;
      }
      linhas.push([linha[0], nomeIndice, valor]);
      anterior = valor;
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

  // 20/09/2026: MESMA trava de Sync.gs!atualizarHistorico (ver o
  // comentário lá pro bug real que motivou isso) — LockService é por
  // SCRIPT inteiro, então essa chamada e a de Sync.gs brigam pelo MESMO
  // lock, nunca rodam junto. As duas escrevem na MESMA célula de
  // rascunho do GOOGLEFINANCE (Auxiliar_app!AZ1), então rodar ao mesmo
  // tempo é o que corrompia preço (ex.: BBAS3 com R$5,1256 em vez de
  // ~R$22,78 em 17/09/2026, achado comparando com dados reais do
  // Tiago).
  var lock = LockService.getScriptLock();
  var conseguiuLock = false;
  try {
    conseguiuLock = lock.tryLock(10000);
  } catch (erroLock) {
    conseguiuLock = false;
  }
  if (!conseguiuLock) {
    var detalheOcupado = 'Já existe uma sincronização de preços rodando agora (gatilho automático ou o botão "Sincronizar agora") — pulado de propósito pra não arriscar corromper preço nenhum (as duas usam a MESMA célula de rascunho do GOOGLEFINANCE). Tenta de novo em alguns segundos, ou espera a próxima chamada automática.';
    gravarRegistroControle_('Atenção', origem, detalheOcupado);
    return { status: 'Atenção', detalhe: detalheOcupado };
  }

  var partes = [];
  var status = 'Sucesso';

  // trava por finally (lock.releaseLock() lá embaixo, fecha só depois do
  // "return { status: status, detalhe: detalhe };") engloba TODO o corpo
  // dali pra baixo — os try/catch de cada passo (Renda Fixa/Índices/
  // Taxas) continuam existindo do jeito que já estavam, cada um dentro
  // deste try externo novo.
  try {
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
        (resultadoIndices.jaEstavaEmDia ? ' (já estava em dia)' :
          (resultadoIndices.linhasNovas === 0 ? ' (sem pregão no período)' : '')));
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
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza aux_historico-indices de forma incremental pros 3 índices de
 * TICKERS_INDICES_GOOGLEFINANCE (Ibovespa/IFIX/S&P 500): pra cada um, acha
 * a última data salva e busca só o que falta até ontem — evita repetir a
 * história inteira desde 2020 a cada execução diária.
 *
 * 19/09/2026: generalizado (só fazia Ibovespa antes) pra também manter
 * IFIX/S&P 500 em dia sozinho, depois que o backfill inicial de cada um
 * rodar (rodarBackfillIfixDireto()/rodarBackfillSp500Direto()). Diferente
 * do Ibovespa (lança erro se não tem backfill — nunca deveria acontecer em
 * produção, já roda há tempos), IFIX/S&P 500 sem backfill ainda NÃO
 * derrubam o gatilho — só ficam de fora do resultado (com "sem backfill
 * ainda" no detalhe) até o Tiago rodar o backfill manual de cada um.
 */
function atualizarIndicesIncremental_(mapaUltimasDatasCache) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_HISTORICO_INDICES);
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP);

  var ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(0, 0, 0, 0);

  var linhasNovasTotal = [];
  var detalhe = [];
  var algumSemBackfill = false;

  Object.keys(TICKERS_INDICES_GOOGLEFINANCE).forEach(function (nomeIndice) {
    var ticker = TICKERS_INDICES_GOOGLEFINANCE[nomeIndice];
    var ultimaData = ultimaDataIndiceSalvo_(abaIndices, nomeIndice, mapaUltimasDatasCache);
    if (!ultimaData) {
      if (nomeIndice === 'Ibovespa') {
        throw new Error('nenhum dado de Ibovespa em ' + ABA_HISTORICO_INDICES + ' ainda — rode rodarBackfillIndicesDireto() primeiro.');
      }
      algumSemBackfill = true;
      detalhe.push(nomeIndice + ': sem backfill ainda');
      return;
    }

    var inicio = new Date(ultimaData);
    inicio.setDate(inicio.getDate() + 1);
    // 16/09/2026: normaliza pra meia-noite — "ontem" (acima) já é, mas "inicio"
    // não era, e buscarHistoricoGoogleFinanceEmPedacos_ compara os dois direto
    // (while (inicioPedaco <= dataFim)) com timestamps completos. Mesmo bug do
    // Sync.gs!buscarPrecoHistorico_, um nível abaixo do gate depoisPorDia_.
    inicio.setHours(0, 0, 0, 0);

    // Correção de 16/09/2026 (mesmo bug do Sync.gs!depoisPorDia_): "inicio"
    // herda a hora fixa da última linha salva (16:56), "ontem" é meia-noite
    // — comparar Date completos fazia essa checagem dar TRUE pro MESMO dia
    // de calendário sempre que o sync rodasse de manhã, marcando "já em
    // dia" sem nunca buscar o índice daquele dia.
    if (depoisPorDia_(inicio, ontem)) {
      detalhe.push(nomeIndice + ': já em dia');
      return;
    }

    // 17/09/2026: último valor JÁ SALVO deste índice, só pra alimentar a
    // guarda de sanidade (buscarHistoricoGoogleFinanceEmPedacos_) - sem
    // isso, a 1ª linha nova de cada sync incremental não teria "anterior"
    // pra comparar (o backfill completo também não tem, mas ali faz
    // sentido: é o início da série, não tem valor prévio mesmo).
    var valorAnterior = ultimoValorIndiceSalvo_(abaIndices, nomeIndice);
    var linhas = buscarHistoricoGoogleFinanceEmPedacos_(abaAuxiliar, ticker, inicio, ontem, nomeIndice, valorAnterior);
    linhasNovasTotal = linhasNovasTotal.concat(linhas);
    detalhe.push(nomeIndice + ': ' + linhas.length + ' linha(s) nova(s)');
  });

  if (linhasNovasTotal.length > 0) {
    var primeiraLinhaNova = abaIndices.getLastRow() + 1;
    abaIndices.getRange(primeiraLinhaNova, 1, linhasNovasTotal.length, 3).setValues(linhasNovasTotal);
  }

  return {
    linhasNovas: linhasNovasTotal.length,
    jaEstavaEmDia: linhasNovasTotal.length === 0 && !algumSemBackfill,
    detalhe: detalhe.join(', '),
  };
}

/**
 * Atualiza os fatores/variações de CDI, SELIC e IPCA salvos em
 * aux_historico-indices, de forma incremental (só o que falta desde a
 * última data salva de cada índice até ontem) — usado pelo gatilho diário,
 * junto com Renda Fixa e os 3 índices do GOOGLEFINANCE. Se ainda não
 * existir nenhuma linha de um deles (1ª vez), faz o backfill completo dele
 * desde 22/12/2020 automaticamente — não PRECISA rodar
 * rodarBackfillTaxasBcbDireto() manual antes, mas rodar manualmente uma vez
 * (fora do horário do gatilho) é mais rápido pra ver o resultado sem
 * esperar o próximo disparo das 11h.
 *
 * 19/09/2026: IPCA entrou no loop de graça (Object.keys(INDICES_TAXA_BCB)
 * já era genérico) ao ser adicionado em INDICES_TAXA_BCB — só o texto do
 * detalhe abaixo foi ajustado, já que "sem pregão" é uma framing
 * específica de CDI/SELIC (dia não-útil); pro IPCA (mensal) o motivo mais
 * comum de "0 linhas novas" é o mês corrente ainda não ter sido publicado.
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
    detalhe.push(nome + ': ' + linhas.length + ' linha(s) nova(s)' + (linhas.length === 0 ? ' (sem dado publicado no período)' : ''));
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
 * Último VALOR salvo pra UM índice (par de ultimaDataIndiceSalvo_, que só
 * devolve a data) - usado pela guarda de sanidade do Ibovespa (17/09/2026,
 * ver buscarHistoricoGoogleFinanceEmPedacos_) pra saber "quanto era o
 * valor esperado" antes de aceitar uma linha nova do GOOGLEFINANCE.
 */
function ultimoValorIndiceSalvo_(aba, nomeIndice) {
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return null;
  var dados = aba.getRange(2, 1, ultimaLinha - 1, 3).getValues(); // A=Data, B=Índice, C=Valor
  var ultimaData = null;
  var ultimoValor = null;
  for (var i = 0; i < dados.length; i++) {
    var data = dados[i][0];
    if (dados[i][1] !== nomeIndice || !(data instanceof Date)) continue;
    if (!ultimaData || data > ultimaData) {
      ultimaData = data;
      ultimoValor = Number(dados[i][2]);
    }
  }
  return (typeof ultimoValor === 'number' && Number.isFinite(ultimoValor)) ? ultimoValor : null;
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

/**
 * Benchmarks "de hoje" de CDI/SELIC/IPCA (pedido pelo Tiago em Carteiras ->
 * Renda Fixa, e no card de CDI ao lado do Ibovespa em Carteiras -> Ações,
 * 18/09/2026).
 *
 * CDI/SELIC: reaproveita o ÚLTIMO valor diário já cacheado em
 * aux_historico-indices (mesma fonte que a ação "home" usa pro histórico
 * — ver nota em BackfillRendaFixa.gs — sem fazer fetch novo ao BCB) via
 * ultimoValorIndiceSalvo_ (já existe neste arquivo), convertido de taxa
 * DIÁRIA pra taxa ANUALIZADA (252 dias úteis) — formato padrão do
 * mercado ("CDI: 13,25% a.a."), não a taxa diária crua (~0,04%) que fica
 * salva na aba.
 *
 * IPCA: não tem cache diário (só é usado projetado mês a mês dentro da
 * Renda Fixa, nunca como "hoje" isolado) — busca direto os últimos 13
 * valores mensais da série 433 do BCB (endpoint /dados/ultimos/13, sem
 * precisar montar range de datas) e acumula os últimos 12, formato
 * padrão "IPCA: 4,50% em 12 meses" (a 13ª entrada é só margem, caso o
 * mês corrente ainda não tenha sido publicado quando isso roda).
 */
function buscarCdiSelicAnualizadosHoje_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaIndices = ss.getSheetByName(ABA_HISTORICO_INDICES);
  var cdiDiario = abaIndices ? ultimoValorIndiceSalvo_(abaIndices, 'CDI') : null;
  var selicDiario = abaIndices ? ultimoValorIndiceSalvo_(abaIndices, 'SELIC') : null;
  return {
    cdi: cdiDiario != null ? arredondarBenchmarkRf_(anualizarTaxaDiariaBcb_(cdiDiario)) : null,
    selic: selicDiario != null ? arredondarBenchmarkRf_(anualizarTaxaDiariaBcb_(selicDiario)) : null
  };
}

function buscarIpcaAcumulado12Meses_() {
  var url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/13?formato=json';
  var resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var dados = JSON.parse(resposta.getContentText());
  if (!Array.isArray(dados) || dados.length === 0) return null;
  var ultimos12 = dados.slice(-12);
  var fator = ultimos12.reduce(function (acumulado, item) {
    return acumulado * (1 + parseFloat(item.valor) / 100);
  }, 1);
  return arredondarBenchmarkRf_(fator - 1);
}

/** Taxa diária do BCB (formato "% do dia", ex.: 0.043) -> taxa anualizada (252 dias úteis, fração). */
function anualizarTaxaDiariaBcb_(taxaDiariaPercentual) {
  return Math.pow(1 + (taxaDiariaPercentual / 100), 252) - 1;
}

function arredondarBenchmarkRf_(n) {
  return Math.round(n * 10000) / 10000;
}

/** Roda direto no editor, pra conferir os 3 valores antes de plugar nas Carteiras. */
function testarBenchmarksRendaFixaHojeDireto() {
  Logger.log(JSON.stringify({
    cdiSelic: buscarCdiSelicAnualizadosHoje_(),
    ipca: buscarIpcaAcumulado12Meses_()
  }, null, 2));
}
