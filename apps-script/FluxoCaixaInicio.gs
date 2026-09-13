/**
 * FluxoCaixaInicio.gs — fluxo de caixa líquido diário (aporte/retirada),
 * calculado a partir de Transações / Transações - USA / Transações Renda
 * Fixa / Proventos / Proventos - USA, pra "neutralizar" esse efeito do
 * cálculo de Rentabilidade da Início (ver normalizarSerieRentabilidade,
 * assets/js/pages/inicio.js).
 *
 * Por que isso existe (13/09/2026, feedback do Tiago com print comparando
 * com o Gorilla): historico[i].patrimonio (HistoricoInicio.gs) é só a
 * soma do valor de mercado das posições — não existe "caixa" nenhum
 * rastreado. Rentabilidade = (valor_hoje / valor_base − 1) trata TODO
 * aporte novo como se fosse ganho, e toda venda/retirada/provento
 * recebido como se fosse perda — o que infla muito qualquer janela longa
 * (quase 6 anos de aportes acumulados iam junto como "retorno" desde o
 * início). O fluxo calculado aqui entra em historico[i].fluxoCaixa* (ver
 * montarSerieHistoricoInicio_, HistoricoInicio.gs), e
 * normalizarSerieRentabilidade (front-end) usa isso pra montar um
 * retorno "time-weighted" (TWR) de verdade — comparável com Ibovespa/CDI/
 * Selic sem o efeito de quanto dinheiro entrou ou saiu.
 *
 * O que CONTA como fluxo a neutralizar (positivo = entra no patrimônio
 * rastreado, negativo = sai):
 *  - Transações (Ações/FIIs BR) e Transações - USA: toda Compra (+) e
 *    Venda (−), "Total + Taxa" de cada linha. USA convertido pro câmbio
 *    do dia via o parâmetro mapaCambioUsd (câmbio que aux_historico-
 *    patrimonio já grava por dia pra cada ticker de classe USA — quem
 *    chama, montarSerieHistoricoInicio_, já está lendo essa aba mesmo pra
 *    outra coisa, então monta esse mapa na MESMA passada em vez de reler
 *    a aba aqui — dispensa um backfill de câmbio histórico à parte).
 *  - Transações Renda Fixa: Compra/APLICAÇÃO (+), Venda/Resgate (−),
 *    Transferência (sinal pelo Entrada/Saída) — "Valor da Operação".
 *    Classificação (Renda Emergencial x Renda Fixa) reaproveita
 *    montarMapaClassificacaoRF_ / classificarPosicaoRF_ /
 *    normalizarInstituicaoRF_ / detectarIndexadorRF_ (BackfillRendaFixa.gs)
 *    — a MESMA lógica que já classifica o resto do app, em vez de
 *    reinventar um "match" novo que pudesse divergir dela.
 *  - "Cobrança de Taxa Semestral" e "Juros" ficam de FORA de propósito:
 *    taxa é custo de verdade (deve continuar aparecendo como perda real
 *    na rentabilidade, por menor que seja); Juros já está embutido no
 *    crescimento diário do Valor Atualizado de cada posição (Tiago
 *    confirmou, 13/09/2026) — contar separado seria contar a mesma coisa
 *    duas vezes.
 *  - Proventos / Proventos - USA: todo provento pago (coluna "Provento
 *    líquido", na "Data do pagamento") sai (−) do patrimônio rastreado —
 *    vira dinheiro em espécie que não é nenhuma posição rastreada, até o
 *    Tiago reinvestir (o que já entra como uma Compra nova, e essa Compra
 *    já é neutralizada acima — então o provento nem soma nem subtrai do
 *    retorno final, só evita o "dente" de queda-depois-repique que
 *    aparecia antes na sequência recebe → reinveste).
 */

var ABA_TRANSACOES_BR_FLUXO = 'Transações';
var ABA_TRANSACOES_USA_FLUXO = 'Transações - USA';
// Igual Sync.gs!carregarTodosHistoricosTransacoes_ (cabeçalho na linha 6,
// dados a partir da linha 7 — ver também ImportB3.gs) — mesma constante
// "de fato", não reinventada, pra nunca divergir se a estrutura da aba
// mudar de novo.
var LINHA_DADOS_TRANSACOES_FLUXO = 7;
var ABA_PROVENTOS_BR_FLUXO = 'Proventos';
var ABA_PROVENTOS_USA_FLUXO = 'Proventos - USA';

/**
 * Primeira linha (1-based) com uma Date de verdade na coluna `colData` -
 * Proventos/Proventos - USA não têm uma constante de cabeçalho já
 * pronta em nenhum outro arquivo (só "Transações Renda Fixa" e
 * "Transações"/"Transações - USA" têm — ver LINHA_CABECALHO_TRANSACOES_RF
 * em BackfillRendaFixa.gs e LINHA_DADOS_TRANSACOES_FLUXO acima), então
 * detecta procurando a primeira linha com DATA de verdade na coluna
 * certa — mais estável que fixar um número de linha decorativa, que pode
 * mudar se o Tiago editar o texto de instrução da aba. Varre no máximo
 * 40 linhas (nenhum cabeçalho decorativo chega perto disso) — devolve
 * null se não achar (aba vazia, só cabeçalho).
 */
function primeiraLinhaDeDadosFluxo_(sheet, colData) {
  var max = Math.min(sheet.getLastRow(), 40);
  for (var linha = 1; linha <= max; linha++) {
    var valor = sheet.getRange(linha, colData).getValue();
    if (valor instanceof Date) return linha;
  }
  return null;
}

/** Câmbio conhecido (chave 'yyyy-MM-dd' -> número) mais próximo, igual ou
 * anterior a `chaveData` — mesmo espírito de forward-fill já usado no
 * resto do historico (HistoricoInicio.gs); se a transação for mais
 * antiga que qualquer câmbio conhecido, usa o mais antigo disponível em
 * vez de deixar sem conversão nenhuma. */
function cambioUsdParaData_(mapaCambio, chavesOrdenadas, chaveData) {
  if (mapaCambio[chaveData] != null) return mapaCambio[chaveData];
  var melhor = null;
  for (var i = 0; i < chavesOrdenadas.length; i++) {
    if (chavesOrdenadas[i] > chaveData) break;
    melhor = chavesOrdenadas[i];
  }
  if (melhor == null && chavesOrdenadas.length) melhor = chavesOrdenadas[chavesOrdenadas.length - 1];
  return melhor != null ? mapaCambio[melhor] : null;
}

/**
 * Lê Transações / Transações - USA / Transações Renda Fixa / Proventos /
 * Proventos - USA e devolve o fluxo de caixa líquido POR DIA (chave
 * 'yyyy-MM-dd') em dois mapas — `total` (tudo) e `rendaEmergencial` (só a
 * parte que pertence a Renda Fixa classificada como Renda Emergencial) —
 * pra cada visão da Início poder neutralizar exatamente o fluxo que é
 * dela (longoPrazo = total − rendaEmergencial, mesma conta que
 * montarSerieHistoricoInicio_ já faz pro patrimônio em si).
 *
 * @param {Object} mapaCambioUsd chave 'yyyy-MM-dd' -> câmbio USD/BRL do
 *   dia, já montado por quem chama (montarSerieHistoricoInicio_) na MESMA
 *   passada que lê aux_historico-patrimonio pra outra coisa — evita reler
 *   essa aba aqui.
 */
function calcularFluxoCaixaDiario_(mapaCambioUsd) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var porDia = {};
  var porDiaRendaEmergencial = {};

  function somar(mapa, chave, valor) {
    if (!valor) return;
    mapa[chave] = (mapa[chave] || 0) + valor;
  }

  // --- Transações (Ações/FIIs BR) e Transações - USA ---
  var chavesCambio = Object.keys(mapaCambioUsd || {}).sort();
  [
    { nome: ABA_TRANSACOES_BR_FLUXO, cambio: false },
    { nome: ABA_TRANSACOES_USA_FLUXO, cambio: true }
  ].forEach(function (info) {
    var aba = ss.getSheetByName(info.nome);
    if (!aba) return;
    var qtd = aba.getLastRow() - LINHA_DADOS_TRANSACOES_FLUXO + 1;
    if (qtd <= 0) return;

    aba.getRange(LINHA_DADOS_TRANSACOES_FLUXO, 1, qtd, 8).getValues().forEach(function (linha) {
      var data = linha[1], tipo = linha[2], totalTaxa = Number(linha[7]);
      if (!(data instanceof Date) || isNaN(totalTaxa)) return;
      var sinal = tipo === 'Compra' ? 1 : (tipo === 'Venda' ? -1 : 0);
      if (!sinal) return;

      var chave = chaveDiaISOInicio_(data);
      var valorBrl = totalTaxa;
      if (info.cambio) {
        var cambio = cambioUsdParaData_(mapaCambioUsd || {}, chavesCambio, chave);
        if (!cambio) return; // sem NENHUM câmbio conhecido - nunca deveria acontecer com posição USA de verdade
        valorBrl = totalTaxa * cambio;
      }
      somar(porDia, chave, sinal * valorBrl);
    });
  });

  // --- Transações Renda Fixa (reaproveita a classificação de BackfillRendaFixa.gs) ---
  var abaRf = ss.getSheetByName(ABA_TRANSACOES_RF);
  var abaCarteiraRf = ss.getSheetByName(ABA_CARTEIRA_RF);
  if (abaRf && abaCarteiraRf) {
    var mapaClassificacaoRf = montarMapaClassificacaoRF_(abaCarteiraRf);
    var qtdRf = abaRf.getLastRow() - LINHA_CABECALHO_TRANSACOES_RF;
    if (qtdRf > 0) {
      abaRf.getRange(LINHA_CABECALHO_TRANSACOES_RF + 1, 1, qtdRf, 8).getValues().forEach(function (linha) {
        var produto = linha[0], data = linha[1], movimentacao = String(linha[2] || ''),
            entradaSaida = String(linha[3] || ''), instituicao = linha[4], valor = Number(linha[7]);
        if (!produto || !(data instanceof Date) || isNaN(valor)) return;

        var sinal;
        if (movimentacao === 'Compra' || movimentacao === 'APLICAÇÃO') {
          sinal = 1;
        } else if (movimentacao === 'Venda' || movimentacao === 'Resgate') {
          sinal = -1;
        } else if (movimentacao.indexOf('Transfer') === 0) {
          // "Transferência"/"Transferencia" (com ou sem acento) aparece
          // nos dois sentidos - o sinal vem de Entrada/Saída, não de um
          // valor fixo.
          sinal = entradaSaida.indexOf('Credit') === 0 ? 1 : -1;
        } else {
          return; // Cobrança de Taxa Semestral, Juros - de propósito fora (ver cabeçalho do arquivo)
        }

        var chave = chaveDiaISOInicio_(data);
        somar(porDia, chave, sinal * valor);

        var institCanonica = normalizarInstituicaoRF_(instituicao);
        var indexador = detectarIndexadorRF_(produto);
        var classificacao = classificarPosicaoRF_(produto, institCanonica, indexador, mapaClassificacaoRf);
        if (classificacao === 'Renda Emergencial') somar(porDiaRendaEmergencial, chave, sinal * valor);
      });
    }
  }

  // --- Proventos / Proventos - USA - some do rastreado quando é PAGO,
  // até virar uma Compra nova (que já é neutralizada acima). Sem
  // separação de Renda Emergencial aqui de propósito - Renda Fixa não
  // gera "provento" nesse sentido (rendimento de RF já vem embutido no
  // Valor Atualizado, igual a Juros acima).
  [ABA_PROVENTOS_BR_FLUXO, ABA_PROVENTOS_USA_FLUXO].forEach(function (nomeAba) {
    var aba = ss.getSheetByName(nomeAba);
    if (!aba) return;
    var linhaInicio = primeiraLinhaDeDadosFluxo_(aba, 2);
    if (!linhaInicio) return;
    var qtd = aba.getLastRow() - linhaInicio + 1;
    if (qtd <= 0) return;
    aba.getRange(linhaInicio, 1, qtd, 7).getValues().forEach(function (linha) {
      var data = linha[1], liquido = Number(linha[6]);
      if (!(data instanceof Date) || isNaN(liquido)) return;
      somar(porDia, chaveDiaISOInicio_(data), -liquido);
    });
  });

  return { total: porDia, rendaEmergencial: porDiaRendaEmergencial };
}

/** Contagem de linhas das 5 abas-fonte do fluxo de caixa, pra entrar na
 * chave de cache de montarSerieHistoricoInicio_ (HistoricoInicio.gs) -
 * getLastRow() em cada uma, nunca getValues() (barato, mesmo padrão já
 * usado pras outras 3 abas-fonte do historico). */
function contarLinhasFluxoCaixa_(ss) {
  function linhas(nome) {
    var aba = ss.getSheetByName(nome);
    return aba ? aba.getLastRow() : 0;
  }
  return [
    linhas(ABA_TRANSACOES_BR_FLUXO),
    linhas(ABA_TRANSACOES_USA_FLUXO),
    linhas(ABA_TRANSACOES_RF),
    linhas(ABA_PROVENTOS_BR_FLUXO),
    linhas(ABA_PROVENTOS_USA_FLUXO)
  ].join('_');
}
