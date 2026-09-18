/**
 * SnapshotResumoDiario.gs — snapshot diário dos 4 valores de patrimônio
 * (Total/Longo Prazo/Nacional/Renda Emergencial) que Home.gs já calcula
 * "ao vivo" (montarHome_(), leitura direta de 📊Dash Geral/Carteira Renda
 * Fixa) - guardado numa aba auxiliar pra virar a referência de "ontem" do
 * comparativo "ontem era" (resumo cards, tela Início).
 *
 * Correção de 18/09/2026 (a pedido do Tiago, depois de DOIS fixes seguidos
 * na série histórica combinada - montarSerieHistoricoInicio_, em
 * HistoricoInicio.gs - que ou deixavam o "ontem" um dia atrasado, ou
 * corrigiam isso mas quebravam o gráfico de Rentabilidade junto): aquela
 * série depende de casar 3 fontes com gatilhos em horários diferentes
 * (aux_historico-patrimonio às ~10h, aux_historico-renda-fixa e
 * aux_historico-indices às ~11h) - qualquer dia em que as 3 ainda não
 * sincronizaram sai incompleto SEM ERRO NENHUM (rendaFixaHoje/
 * rendaEmergencialHoje, em montarSerieHistoricoInicio_, não têm
 * forward-fill - usam só o valor do próprio dia, que cai pra 0 se a aba
 * de Renda Fixa ainda não tiver a linha daquele dia). Em vez de mexer de
 * novo naquela conta complexa (2 tentativas já quebraram alguma coisa),
 * o Tiago pediu um caminho separado e bem mais simples só pro "ontem
 * era": gravar 1x por dia os MESMOS 4 números que montarHome_() já lê ao
 * vivo (o cálculo que ele confirmou bater com o Gorilla e outras
 * referências) - guardados como estão, sem reconstrução nenhuma. O
 * gráfico de Rentabilidade CONTINUA usando montarSerieHistoricoInicio_ -
 * este arquivo não mexe nele.
 *
 * Onde: aba "Auxiliar_app", colunas E:J (linha 1 = cabeçalho, linha 2+ =
 * 1 linha por dia, em ordem cronológica) - área nova, sem sobrepor o que
 * já existe nessa aba (B7:B16 = índices/câmbio ao vivo, ver Home.gs;
 * AZ1:BA4000 = rascunho transiente do backfill, ver Sync.gs).
 *   E = Data (yyyy-MM-dd, fuso do script)
 *   F = Total
 *   G = Longo Prazo
 *   H = Nacional
 *   I = Renda Emergencial
 *   J = Pregão (TRUE = dia útil seg-sex - aproximação simples, sem
 *       calendário de feriados da B3; um feriado no meio da semana só
 *       grava um valor igual ao do dia anterior, então não distorce nada
 *       - ver obterUltimoSnapshotPregao_ mais abaixo)
 *
 * Gatilho: roda 1x por dia às ~21h (depois do fechamento da B3, 18h, E
 * depois do gatilho de Renda Fixa/Índices, às ~11h, já ter rodado no
 * mesmo dia - então quando ESTE gatilho roda, os 4 valores de
 * montarHome_() já refletem o fechamento OFICIAL do dia inteiro, não um
 * valor parcial de manhã). Mesmo padrão dos outros 2 gatilhos diários já
 * existentes (gatilhoDiario, Sync.gs, ~10h; gatilhoDiarioRendaFixaEIndices,
 * BackfillIndices.gs, ~11h) - só que à noite, e também só pula domingo
 * (trigger time-driven do Apps Script não tem opção nativa "seg-sáb").
 *
 * "Ontem" pro comparativo: SEMPRE o último snapshot com Pregão=TRUE e
 * Data anterior a hoje (obterUltimoSnapshotPregao_) - cobre
 * sábado/domingo/segunda voltando pra sexta, do jeito que o Tiago pediu
 * explicitamente, sem depender de calendário nem da série histórica.
 */

var ABA_AUXILIAR_APP_SNAPSHOT = 'Auxiliar_app';
var COLUNA_SNAPSHOT_DATA = 5;   // E
var COLUNA_SNAPSHOT_TOTAL = 6;  // F
var COLUNA_SNAPSHOT_LONGO_PRAZO = 7; // G
var COLUNA_SNAPSHOT_NACIONAL = 8;    // H
var COLUNA_SNAPSHOT_RENDA_EMERGENCIAL = 9; // I
var COLUNA_SNAPSHOT_PREGAO = 10; // J
var LINHA_SNAPSHOT_PRIMEIRA_DADO = 2; // linha 1 = cabeçalho
var LIMITE_LINHAS_SNAPSHOT = 3650; // ~10 anos de linhas diárias - folga generosa, mesmo espírito do CELULA_RASCUNHO_SAIDA (Sync.gs)

/** Instala o gatilho diário — rodar UMA VEZ, manualmente, no editor. */
function instalarGatilhoSnapshotResumoDiario() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'gatilhoSnapshotResumoDiario';
  });
  if (jaExiste) {
    Logger.log('Gatilho já existe, nada a fazer.');
    return;
  }
  ScriptApp.newTrigger('gatilhoSnapshotResumoDiario')
    .timeBased()
    .everyDays(1)
    .atHour(21)
    .nearMinute(1)
    .create();
  Logger.log('Gatilho diário do snapshot de resumo instalado (dispara por volta de 21h, todo dia — domingo é ignorado dentro da própria função).');
}

/** Chamada pelo gatilho — só filtra domingo, mesmo padrão de gatilhoDiario (Sync.gs). */
function gatilhoSnapshotResumoDiario() {
  if (new Date().getDay() === 0) { // 0 = domingo
    Logger.log('Hoje é domingo, gatilho do snapshot não faz nada.');
    return;
  }
  try {
    gravarSnapshotResumoHoje_();
  } catch (erro) {
    Logger.log('gatilhoSnapshotResumoDiario: falhou - ' + erro);
  }
}

/** Roda a mesma rotina do gatilho, na hora, pra testar/forçar direto no editor. */
function rodarSnapshotResumoDiretoDireto() {
  var resultado = gravarSnapshotResumoHoje_();
  Logger.log('Snapshot gravado: ' + JSON.stringify(resultado));
}

/**
 * Lê os 4 valores ao vivo (montarHome_(), mesma fonte que a tela Início já
 * mostra como "hoje") e grava (ou sobrescreve, se já rodou hoje - seguro
 * rodar mais de uma vez no mesmo dia, nunca duplica) 1 linha em
 * Auxiliar_app!E:J com a data de hoje.
 */
function gravarSnapshotResumoHoje_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP_SNAPSHOT);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP_SNAPSHOT);

  var hoje = new Date();
  var chaveHoje = chaveDiaISOInicio_(hoje); // reaproveita o formatador de HistoricoInicio.gs (mesmo fuso, mesmo formato "yyyy-MM-dd")
  var diaSemana = hoje.getDay(); // 0=domingo .. 6=sábado
  var pregao = diaSemana >= 1 && diaSemana <= 5; // seg-sex - ver comentário no cabeçalho do arquivo

  var dadosHome = montarHome_();
  var p = dadosHome.patrimonio;

  return gravarLinhaSnapshot_(abaAuxiliar, chaveHoje, p.total, p.longoPrazo, p.nacional, p.rendaEmergencial, pregao);
}

/**
 * Grava (idempotente por data) 1 linha do snapshot - função à parte de
 * gravarSnapshotResumoHoje_ pra semearSnapshotManual_ (mais abaixo) poder
 * gravar uma data passada sem duplicar a lógica de "achar a linha certa".
 */
function gravarLinhaSnapshot_(abaAuxiliar, chaveData, total, longoPrazo, nacional, rendaEmergencial, pregao) {
  var linhaAlvo = encontrarOuReservarLinhaSnapshot_(abaAuxiliar, chaveData);
  abaAuxiliar.getRange(linhaAlvo, COLUNA_SNAPSHOT_DATA, 1, 6).setValues([[
    chaveData, total, longoPrazo, nacional, rendaEmergencial, pregao
  ]]);
  return { linha: linhaAlvo, data: chaveData, pregao: pregao, total: total, longoPrazo: longoPrazo, nacional: nacional, rendaEmergencial: rendaEmergencial };
}

/**
 * Acha a linha da data pedida se já existe (pra sobrescrever, idempotente)
 * ou a próxima linha vazia depois do cabeçalho (pra anexar). Lê a coluna
 * Data inteira de uma vez só (1 chamada), não célula por célula.
 */
function encontrarOuReservarLinhaSnapshot_(abaAuxiliar, chaveData) {
  var coluna = abaAuxiliar.getRange(LINHA_SNAPSHOT_PRIMEIRA_DADO, COLUNA_SNAPSHOT_DATA, LIMITE_LINHAS_SNAPSHOT, 1).getValues();
  for (var i = 0; i < coluna.length; i++) {
    var valor = coluna[i][0];
    if (valor === '' || valor == null) {
      return LINHA_SNAPSHOT_PRIMEIRA_DADO + i; // primeira linha vazia - anexa aqui
    }
    if (String(valor) === chaveData) {
      return LINHA_SNAPSHOT_PRIMEIRA_DADO + i; // já tem linha dessa data - sobrescreve
    }
  }
  throw new Error('encontrarOuReservarLinhaSnapshot_: limite de ' + LIMITE_LINHAS_SNAPSHOT + ' linhas atingido, precisa aumentar LIMITE_LINHAS_SNAPSHOT');
}

/**
 * "Ontem" pro comparativo "ontem era": o snapshot mais recente com
 * Pregão=TRUE e Data anterior a hoje - cobre sábado/domingo/segunda
 * voltando pra sexta (pedido explícito do Tiago em 18/09/2026), sem
 * depender da série histórica combinada nem dos horários dos outros
 * gatilhos. null se ainda não há nenhum snapshot gravado (app novo, ou
 * antes do 1º gatilho/semeadura rodar) - Home.gs trata esse caso como
 * "sem aviso, ontem só ainda não existe" (ver handleHome).
 */
function obterUltimoSnapshotPregao_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP_SNAPSHOT);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP_SNAPSHOT);

  var chaveHoje = chaveDiaISOInicio_(new Date());
  var bloco = abaAuxiliar.getRange(LINHA_SNAPSHOT_PRIMEIRA_DADO, COLUNA_SNAPSHOT_DATA, LIMITE_LINHAS_SNAPSHOT, 6).getValues();

  var ultimo = null;
  for (var i = 0; i < bloco.length; i++) {
    var linha = bloco[i];
    var data = linha[0];
    if (data === '' || data == null) break; // fim dos dados gravados (linhas em ordem cronológica)
    var chaveLinha = String(data);
    var pregao = linha[5] === true;
    if (pregao && chaveLinha < chaveHoje) {
      ultimo = { data: chaveLinha, total: linha[1], longoPrazo: linha[2], nacional: linha[3], rendaEmergencial: linha[4] };
    }
  }
  return ultimo;
}

/**
 * Semeadura manual, ÚNICA VEZ, pra não esperar até o gatilho de 21h de
 * hoje pra ter um "ontem" já disponível - rodar direto no editor
 * (mesmo padrão de testarHomeDireto/testarHistoricoInicioDireto). Os 4
 * valores de 17/09 abaixo são PLACEHOLDER - o Tiago ainda precisa
 * confirmar os números certos antes de rodar isso (ver conversa) -
 * idempotente por data, então rodar de novo com os valores corrigidos
 * simplesmente sobrescreve a mesma linha.
 */
function semearSnapshot17Setembro_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP_SNAPSHOT);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP_SNAPSHOT);

  // TODO(Tiago): confirmar estes 4 valores antes de rodar esta função.
  var resultado = gravarLinhaSnapshot_(abaAuxiliar, '2026-09-17',
    /* total */ 0,
    /* longoPrazo */ 0,
    /* nacional */ 0,
    /* rendaEmergencial */ 0,
    /* pregao */ true);
  Logger.log('Semeado: ' + JSON.stringify(resultado));
}
