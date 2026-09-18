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
 * Quando grava: NÃO tem gatilho próprio - gravarSnapshotResumoHoje_() é
 * chamada como um passo A MAIS dentro do gatilhoDiario() já existente
 * (Sync.gs, ~10h, seg-sáb) - pedido explícito do Tiago, pra não precisar
 * instalar um gatilho novo nem criar linha nova no Registro de Controle
 * (só loga em Logger.log, igual esta função já fazia). A linha grava com
 * a data do PRÓPRIO DIA em que o gatilho roda (não "ontem") - ex.: o
 * gatilho de terça-feira grava a linha de terça-feira.
 *
 * Ressalva consciente: às ~10h a B3 acabou de abrir, então o valor "ao
 * vivo" de montarHome_() nesse momento ainda está bem próximo do
 * FECHAMENTO DE ONTEM, não do fechamento de hoje (mesma premissa que
 * atualizarHistoricoInterno_, em Sync.gs, já usa pra decidir até que dia
 * fazer backfill - var ontem = ...; ontem.setDate(ontem.getDate()-1)).
 * Na prática isso é uma imprecisão pequena (abertura vs. fechamento
 * anterior costuma variar pouco) e que NÃO ACUMULA de um dia pro outro
 * (cada linha é uma captura nova, independente das anteriores) - bem
 * diferente do bug original (pular um pregão inteiro, ~3-4% de erro
 * real). Se algum dia isso incomodar na prática, dá pra mover a captura
 * pra depois do fechamento (18h) - hoje está assim por pedido explícito
 * do Tiago (18/09/2026), preferindo reaproveitar o gatilho existente.
 *
 * Idempotente por data: se o gatilho já rodou hoje (ou alguém roda a
 * mesma rotina de novo manualmente), sobrescreve a mesma linha em vez de
 * duplicar - e só regrava de fato quando o valor mudou (loga "sem
 * mudança" quando é idêntico ao que já estava salvo).
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

/**
 * Chamada por gatilhoDiario() (Sync.gs), como passo extra do gatilho já
 * existente - ver cabeçalho do arquivo pro motivo de não ter gatilho
 * próprio. Lê os 4 valores ao vivo (montarHome_(), mesma fonte que a
 * tela Início já mostra como "hoje") e grava/atualiza (idempotente por
 * data - seguro rodar mais de uma vez no mesmo dia) 1 linha em
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

  var resultado = gravarLinhaSnapshot_(abaAuxiliar, chaveHoje, p.total, p.longoPrazo, p.nacional, p.rendaEmergencial, pregao);
  Logger.log('gravarSnapshotResumoHoje_: ' + (resultado.mudou ? 'salvo' : 'sem mudança') + ' - ' + JSON.stringify(resultado));
  return resultado;
}

/**
 * Grava (idempotente por data, só regrava de fato se o valor mudou) 1
 * linha do snapshot - função à parte de gravarSnapshotResumoHoje_ pra
 * semearSnapshotManual_ (mais abaixo) poder gravar uma data passada sem
 * duplicar a lógica de "achar a linha certa".
 */
function gravarLinhaSnapshot_(abaAuxiliar, chaveData, total, longoPrazo, nacional, rendaEmergencial, pregao) {
  var busca = encontrarOuReservarLinhaSnapshot_(abaAuxiliar, chaveData);
  var linhaAlvo = busca.linha;

  var mudou = true;
  if (busca.existente) {
    var v = busca.existente;
    mudou = !(v[0] === total && v[1] === longoPrazo && v[2] === nacional && v[3] === rendaEmergencial && v[4] === pregao);
  }

  if (mudou) {
    abaAuxiliar.getRange(linhaAlvo, COLUNA_SNAPSHOT_DATA, 1, 6).setValues([[
      chaveData, total, longoPrazo, nacional, rendaEmergencial, pregao
    ]]);
  }

  return { linha: linhaAlvo, data: chaveData, pregao: pregao, total: total, longoPrazo: longoPrazo, nacional: nacional, rendaEmergencial: rendaEmergencial, mudou: mudou };
}

/**
 * Acha a linha da data pedida se já existe (devolve também os valores
 * atuais dela, pra gravarLinhaSnapshot_ decidir se precisa regravar) ou a
 * próxima linha vazia depois do cabeçalho (pra anexar). Lê a coluna Data
 * + as 5 colunas seguintes de uma vez só (1 chamada), não célula por
 * célula.
 */
function encontrarOuReservarLinhaSnapshot_(abaAuxiliar, chaveData) {
  var bloco = abaAuxiliar.getRange(LINHA_SNAPSHOT_PRIMEIRA_DADO, COLUNA_SNAPSHOT_DATA, LIMITE_LINHAS_SNAPSHOT, 6).getValues();
  for (var i = 0; i < bloco.length; i++) {
    var linha = bloco[i];
    var valor = linha[0];
    if (valor === '' || valor == null) {
      return { linha: LINHA_SNAPSHOT_PRIMEIRA_DADO + i, existente: null }; // primeira linha vazia - anexa aqui
    }
    if (String(valor) === chaveData) {
      return { linha: LINHA_SNAPSHOT_PRIMEIRA_DADO + i, existente: [linha[1], linha[2], linha[3], linha[4], linha[5]] }; // já tem linha dessa data
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
 * antes da 1ª semeadura/gatilho rodar) - Home.gs trata esse caso como
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
 * Semeadura manual, ÚNICA VEZ, pra não esperar o próximo gatilhoDiario
 * automático (Sync.gs, ~10h de amanhã) pra ter um "ontem" já disponível -
 * rodar direto no editor (mesmo padrão de testarHomeDireto/
 * testarHistoricoInicioDireto). 18/09/2026 é um dia especial (pedido do
 * Tiago): semeia ONTEM (17/09) E hoje (18/09) de uma vez, já que o
 * gatilhoDiario de hoje já rodou de manhã, ANTES desse código existir -
 * a partir de segunda (21/09) o fluxo normal (gatilhoDiario, todo dia)
 * assume sozinho. Os valores abaixo são PLACEHOLDER - confirmar os
 * números certos antes de rodar isso. Idempotente por data, então rodar
 * de novo com valores corrigidos simplesmente sobrescreve a mesma linha.
 */
function semearSnapshotManual17E18Setembro_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAuxiliar = ss.getSheetByName(ABA_AUXILIAR_APP_SNAPSHOT);
  if (!abaAuxiliar) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_APP_SNAPSHOT);

  // TODO(Tiago): confirmar os 8 valores (2 dias x 4 campos) antes de rodar esta função.
  var ontem = gravarLinhaSnapshot_(abaAuxiliar, '2026-09-17',
    /* total */ 0,
    /* longoPrazo */ 0,
    /* nacional */ 0,
    /* rendaEmergencial */ 0,
    /* pregao */ true);
  Logger.log('Semeado 17/09: ' + JSON.stringify(ontem));

  var hoje = gravarLinhaSnapshot_(abaAuxiliar, '2026-09-18',
    /* total */ 0,
    /* longoPrazo */ 0,
    /* nacional */ 0,
    /* rendaEmergencial */ 0,
    /* pregao */ true);
  Logger.log('Semeado 18/09: ' + JSON.stringify(hoje));
}
