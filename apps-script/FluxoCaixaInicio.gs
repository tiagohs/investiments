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
 *
 * 19/09/2026 (gráficos de "Rentabilidade acumulada" por classe nas 4
 * subpáginas de Carteiras — pedido do Tiago: "TUDO já foi decidido do
 * mockup", incluindo comparar o Portfólio de CADA classe com seu(s)
 * próprio(s) benchmark(s), não só o patrimônio total da Início): o
 * retorno acima (`total`/`rendaEmergencial`/`usa`) já existia, mas era
 * granularidade DEMAIS-GROSSA pra isso — `total` mistura Ações+FIIs+RF+USA
 * numa soma só, sem dar pra neutralizar o fluxo de caixa de SÓ Ações (ou
 * só FIIs) sem contar aporte/retirada das outras classes junto. Ganhou 3
 * baldes novos, TODOS calculados na MESMA passada de leitura de cada aba
 * (nenhuma leitura a mais):
 *  - `acoes`/`fiis`: mesmo bloco de "Transações" (BR) e "Proventos" (BR)
 *    de sempre, agora também separado por classe via
 *    `mapaClassePorTicker` (parâmetro novo, opcional — o MESMO mapa
 *    ticker->'BR'/'FII'/'USA' que montarSerieHistoricoInicio_
 *    (HistoricoInicio.gs) já constrói lendo aux_historico-patrimonio pra
 *    outra coisa, passado aqui pra nunca precisar de uma 2ª fonte de
 *    classificação que pudesse divergir dela). Sem o parâmetro (chamador
 *    antigo que não passa nada), os 2 baldes só ficam vazios — `total`
 *    continua funcionando exatamente como antes.
 *  - `rendaFixaTotal`: MESMO bloco de "Transações Renda Fixa" de sempre,
 *    só que somando TODA posição de RF (não só a fatia Renda Emergencial,
 *    que já tinha seu próprio balde) — a subpágina de Renda Fixa precisa
 *    neutralizar o fluxo da carteira de RF inteira (e, por subtração,
 *    "Longo Prazo" = rendaFixaTotal − rendaEmergencial, mesma conta que
 *    o patrimônio em si já faz em montarSerieHistoricoInicio_).
 * IMPORTANTE: a coluna de Ticker em "Proventos" é a C (linha[2]), NÃO a A
 * como em "Transações" — conferido direto na planilha real do Tiago
 * (Investimentos - Controle 29.xlsx) antes de escrever isso, pra não
 * repetir o tipo de erro de "assumir sem checar" que já causou incidente
 * grave nesta sessão.
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
 * 'yyyy-MM-dd') em três mapas — `total` (tudo), `rendaEmergencial` (só a
 * parte que pertence a Renda Fixa classificada como Renda Emergencial) e
 * `usa` (só Transações - USA / Proventos - USA, já convertido pro câmbio
 * do dia) — pra cada visão da Início poder neutralizar exatamente o
 * fluxo que é dela (longoPrazo = total − rendaEmergencial, nacional =
 * total − rendaEmergencial − usa, mesma conta que
 * montarSerieHistoricoInicio_ já faz pro patrimônio em si).
 *
 * @param {Object} mapaCambioUsd chave 'yyyy-MM-dd' -> câmbio USD/BRL do
 *   dia, já montado por quem chama (montarSerieHistoricoInicio_) na MESMA
 *   passada que lê aux_historico-patrimonio pra outra coisa — evita reler
 *   essa aba aqui.
 * @param {Object} [mapaClassePorTicker] ticker (maiúsculo) -> 'BR'/'FII'/
 *   'USA' — MESMO mapa que montarSerieHistoricoInicio_ já constrói lendo
 *   aux_historico-patrimonio (19/09/2026, ver cabeçalho do arquivo).
 *   Opcional: sem ele, os baldes `acoes`/`fiis` do retorno ficam vazios,
 *   mas `total`/`rendaEmergencial`/`usa` continuam funcionando igual.
 * @return {Object} { total, rendaEmergencial, usa, acoes, fiis,
 *   rendaFixaTotal, primeiraCompraPorTicker } - o último (20/09/2026, ver
 *   cabeçalho do arquivo) é ticker (maiúsculo) -> Date da 1ª Compra
 *   encontrada, usado só por HistoricoInicio.gs pra detectar backfill de
 *   preço atrasado.
 */
function calcularFluxoCaixaDiario_(mapaCambioUsd, mapaClassePorTicker) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var porDia = {};
  var porDiaRendaEmergencial = {};
  var porDiaUsa = {};
  var porDiaAcoes = {};
  var porDiaFiis = {};
  var porDiaRendaFixaTotal = {};
  // 21/09/2026 (pedido do Tiago - print comparando com o Gorila,
  // "quanto investi" saindo muito abaixo do "Valor investido" de lá):
  // "Valor aplicado" tem que ser só capital líquido de Compra/Venda +
  // Renda Fixa - NUNCA reduzido por provento recebido (provento não é
  // "saiu do que eu apliquei", é rendimento à parte). Espelham
  // porDia*/porDiaRendaEmergencial/porDiaUsa/porDiaAcoes/porDiaFiis/
  // porDiaRendaFixaTotal acima, dia a dia, MAS sem passar pelo bloco de
  // Proventos mais abaixo (só esses mapas ficam de fora dele) - usados
  // só pro campo novo fluxoAplicado* (HistoricoInicio.gs), nunca pro TWR
  // da Rentabilidade (que continua em fluxoCaixaPatrimonio, propositalmente
  // deduzindo provento - ver comentário do bloco de Proventos abaixo).
  var porDiaAplicado = {};
  var porDiaAplicadoRendaEmergencial = {};
  var porDiaAplicadoUsa = {};
  var porDiaAplicadoAcoes = {};
  var porDiaAplicadoFiis = {};
  var porDiaAplicadoRendaFixaTotal = {};
  var classes = mapaClassePorTicker || {};
  // 20/09/2026 (bug real, achado com dados reais do Tiago - FIIs "Desde o
  // início" mostrando +229% muito acima do IFIX/CDI): primeira data de
  // Compra de cada ticker (BR e USA), montada na MESMA passada de leitura
  // de Transações/Transações - USA logo abaixo (nenhuma leitura a mais) -
  // usada por HistoricoInicio.gs pra saber se o 1º preço backfillado de
  // um ticker (aux_historico-patrimonio) chegou DEPOIS da compra de
  // verdade (GOOGLEFINANCE às vezes só acha o preço vários dias, ou até
  // semanas, depois - ver "lacuna" no Registro de Controle). Quando isso
  // acontece, o dia em que o preço finalmente aparece não tem fluxo de
  // caixa registrado (a compra já foi contabilizada no dia real da
  // transação), e SEM essa referência, HistoricoInicio.gs contaria a
  // posição inteira como "retorno de mercado" daquele dia só, distorcendo
  // pra sempre a rentabilidade acumulada (TWR composto) da classe.
  var primeiraCompraPorTicker = {};
  var movimentosPorTicker = {}; // 23/09/2026: ticker (maiúsculo) -> [{ chave, delta, preco }] - ver bloco de Transações abaixo
  // 23/09/2026 (achado com o Controle 7): 'Produto|Instituição' -> [{ desde,
  // ate }] - intervalos em que a QUANTIDADE de títulos da posição (coluna
  // F de Transações Renda Fixa) estava zerada. O backfill de Renda Fixa
  // desconta Venda/Resgate pelo VALOR, e quando o valor de venda/resgate é
  // menor que o valor projetado sobra um "resto" eterno - casos reais:
  // Tesouro Prefixado 2023 (resgatado em 02/01/2023, mas com R$ 64,70
  // ainda "rendendo" no histórico em 2026) e Tesouro IPCA+ 2035 (vendido
  // em 15/03/2022, R$ 2,38 fantasmas). HistoricoInicio.gs ignora as linhas
  // do histórico dentro desses intervalos.
  var posicoesRfZeradas = {};
  var qtdPorPosicaoRf = {};
  var primeiraCompraRfPorPosicao = {}; // 23/09/2026: 'Produto|Instituição' -> chave da 1ª Compra/Aplicação (ver HistoricoInicio.gs, alinhamento da Renda Fixa)
  var jurosRfPorDiaValor = {}; // 23/09/2026: 'yyyy-MM-dd|valor' -> é Renda Emergencial? (ver bloco de Proventos)
  var eventosAplicadoRv = []; // 23/09/2026: ver bloco "Valor aplicado" mais abaixo
  var eventosAplicadoRf = [];

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

    aba.getRange(LINHA_DADOS_TRANSACOES_FLUXO, 1, qtd, 11).getValues().forEach(function (linha) {
      // "Transações": coluna A = Ticker (conferido na planilha real, ver
      // cabeçalho do arquivo) — só usado pra separar Ações/FIIs abaixo,
      // "Transações - USA" nem chega a olhar pra isso (tudo vai pro
      // balde USA de qualquer jeito).
      var ticker = String(linha[0] || '').trim().toUpperCase();
      var data = linha[1], tipo = linha[2], totalTaxa = Number(linha[7]);
      if (!(data instanceof Date) || isNaN(totalTaxa)) return;
      // 23/09/2026: STR fica de fora - cada Compra dela já tem a Compra
      // espelho de VNOM na mesma data e valor, e a "Venda" de 19/09/2026
      // não movimentou dinheiro de verdade. Ver TICKERS_FORA_DO_HISTORICO
      // (Sync.gs) pro caso completo.
      if (tickerForaDoHistoricoInicio_(ticker)) return;
      // 23/09/2026: movimento de QUANTIDADE (coluna K "Transação de
      // ações/FIIs (qtd)", já com sinal - mesma coluna que o Sync.gs usa
      // pra gravar "Cotas" em aux_historico-patrimonio) + preço (coluna
      // D) de cada linha - HistoricoInicio.gs passa a calcular a
      // quantidade de cada dia direto daqui (correções feitas depois em
      // Transações, tipo uma bonificação lançada com a data certa, entram
      // no histórico sem precisar regravar aux_historico-patrimonio) e usa
      // os preços que o Tiago REALMENTE pagou pra conferir/corrigir os
      // preços históricos do GOOGLEFINANCE (ver
      // calcularCorrecoesPrecoPorAncoragem_, HistoricoInicio.gs).
      if (ticker && data instanceof Date) {
        var deltaQtd = typeof linha[10] === 'number'
          ? linha[10]
          : (tipo === 'Compra' ? Number(linha[4]) || 0 : (tipo === 'Venda' ? -(Number(linha[4]) || 0) : 0));
        if (deltaQtd) {
          if (!movimentosPorTicker[ticker]) movimentosPorTicker[ticker] = [];
          movimentosPorTicker[ticker].push({ chave: chaveDiaISOInicio_(data), delta: deltaQtd, preco: Number(linha[3]) || 0 });
        }
      }
      // 20/09/2026 (ver comentário de primeiraCompraPorTicker acima) -
      // registra ANTES do "if (!sinal) return" de baixo, mas só importa
      // pra tipo === 'Compra' mesmo (Venda não é "1ª aparição" de nada).
      if (tipo === 'Compra' && ticker && (!primeiraCompraPorTicker[ticker] || data < primeiraCompraPorTicker[ticker])) {
        primeiraCompraPorTicker[ticker] = data;
      }
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
      var classeTicker = info.cambio ? 'USA' : classes[ticker];
      if (info.cambio) {
        somar(porDiaUsa, chave, sinal * valorBrl); // só "Transações - USA"
      } else {
        // 19/09/2026: split Ações/FIIs BR (ver comentário no cabeçalho) -
        // ticker sem classe conhecida (ainda não sincronizado nenhuma vez
        // em aux_historico-patrimonio) fica de fora dos 2 baldes, mas
        // continua contando em `total` normalmente acima.
        if (classeTicker === 'FII') somar(porDiaFiis, chave, sinal * valorBrl);
        else if (classeTicker === 'BR') somar(porDiaAcoes, chave, sinal * valorBrl);
      }
      // 23/09/2026: "Valor aplicado" é calculado depois, em ordem
      // cronológica e por CUSTO (ver bloco "Valor aplicado" mais abaixo).
      eventosAplicadoRv.push({
        data: data, chave: chave, ticker: ticker, classe: classeTicker, sinal: sinal, valorBrl: valorBrl,
        qtd: Math.abs(typeof linha[10] === 'number' ? linha[10] : (Number(linha[4]) || 0))
      });
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
          // 23/09/2026: guarda os "Juros" (cupom) pra reconhecer o MESMO
          // cupom quando ele também foi lançado em "Proventos" - ver bloco
          // de Proventos abaixo.
          if (movimentacao === 'Juros') {
            var instJ = normalizarInstituicaoRF_(instituicao);
            jurosRfPorDiaValor[chaveDiaISOInicio_(data) + '|' + valor.toFixed(2)] =
              classificarPosicaoRF_(produto, instJ, detectarIndexadorRF_(produto), mapaClassificacaoRf) === 'Renda Emergencial';
          }
          return; // Cobrança de Taxa Semestral, Juros - de propósito fora (ver cabeçalho do arquivo)
        }

        var chave = chaveDiaISOInicio_(data);
        // 23/09/2026: quantidade de títulos por posição (Produto|Instituição
        // canônica, a MESMA chave do backfill de Renda Fixa) - ver
        // posicoesRfZeradas no retorno.
        var chavePosicaoRf = produto + '|' + normalizarInstituicaoRF_(instituicao);
        var qtdAntes = qtdPorPosicaoRf[chavePosicaoRf] || 0;
        var qtdDepois = qtdAntes + sinal * (Number(linha[5]) || 0);
        qtdPorPosicaoRf[chavePosicaoRf] = qtdDepois;
        if (!posicoesRfZeradas[chavePosicaoRf]) posicoesRfZeradas[chavePosicaoRf] = [];
        var intervalos = posicoesRfZeradas[chavePosicaoRf];
        var aberto = intervalos.length && intervalos[intervalos.length - 1].ate == null;
        if (qtdDepois <= 0.005 && !aberto) intervalos.push({ desde: chave, ate: null });
        else if (qtdDepois > 0.005 && aberto) intervalos[intervalos.length - 1].ate = chave;
        somar(porDia, chave, sinal * valor);
        somar(porDiaRendaFixaTotal, chave, sinal * valor); // 19/09/2026: RF inteira, ver cabeçalho

        var institCanonica = normalizarInstituicaoRF_(instituicao);
        var indexador = detectarIndexadorRF_(produto);
        var classificacao = classificarPosicaoRF_(produto, institCanonica, indexador, mapaClassificacaoRf);
        if (classificacao === 'Renda Emergencial') {
          somar(porDiaRendaEmergencial, chave, sinal * valor);
        }
        if (sinal > 0 && movimentacao.indexOf('Transfer') !== 0 && (!primeiraCompraRfPorPosicao[chavePosicaoRf] || chave < primeiraCompraRfPorPosicao[chavePosicaoRf])) {
          primeiraCompraRfPorPosicao[chavePosicaoRf] = chave;
        }
        eventosAplicadoRf.push({
          data: data, chave: chave, posicao: chavePosicaoRf, produto: produto,
          tipo: movimentacao.indexOf('Transfer') === 0 ? (sinal > 0 ? 'transfEntrada' : 'transfSaida') : (sinal > 0 ? 'compra' : 'venda'),
          valor: valor, qtd: Math.abs(Number(linha[5]) || 0), emergencial: classificacao === 'Renda Emergencial'
        });
      });
    }
  }

  // --- "Valor aplicado" (23/09/2026, pedido do Tiago comparando com o
  // "Valor investido" do Gorila: "quantos eu apliquei e está investido
  // atualmente, sem subtração de proventos") - é o CUSTO de tudo que está
  // investido em cada dia: Compra soma o que foi pago; Venda/Resgate tira
  // o CUSTO MÉDIO da parte vendida (não o valor recebido - o lucro
  // realizado não é "dinheiro aplicado" que saiu). Provento nunca entra.
  // A versão de 21/09/2026 tirava o valor RECEBIDO nas vendas: na Renda
  // Fixa, onde o Tiago resgata e reaplica títulos há anos, isso deixava o
  // "Valor aplicado" da Renda Fixa em ~R$ 41 mil (Longo Prazo NEGATIVO),
  // contra ~R$ 55 mil de custo dos títulos que ele tem hoje - e o total
  // ~R$ 13 mil abaixo do "Valor investido" do Gorila, que é custo. Por
  // custo, Ações/FIIs batem centavo por centavo com o "Investido" das
  // telas de Carteiras (que vem da própria planilha). Processado em ordem
  // de DATA (a ordem física das linhas nas abas nem sempre é
  // cronológica). Uma venda que deixa menos de 2% da quantidade anterior
  // fecha a posição inteira (resíduo de arredondamento de quantidade de
  // título do Tesouro, ex. real: Tesouro Selic 2026, 1,09 comprado e 1,08
  // vendido - sobrava 0,01 "aplicado" pra sempre).
  function porData(a, b) { return a.data - b.data; }
  function fracaoVendida(qtdAntes, qtdVendida) {
    if (!(qtdAntes > 0)) return 1;
    var resto = qtdAntes - qtdVendida;
    return resto / qtdAntes < 0.02 ? 1 : Math.min(1, qtdVendida / qtdAntes);
  }
  var custoRv = {}; // ticker -> { qtd, custo }
  eventosAplicadoRv.sort(porData).forEach(function (e) {
    var pos = custoRv[e.ticker] || (custoRv[e.ticker] = { qtd: 0, custo: 0 });
    var fluxoAplicado;
    if (e.sinal > 0) {
      pos.qtd += e.qtd; pos.custo += e.valorBrl; fluxoAplicado = e.valorBrl;
    } else {
      var saida = pos.custo * fracaoVendida(pos.qtd, e.qtd);
      pos.custo -= saida; pos.qtd = Math.max(0, pos.qtd - e.qtd); fluxoAplicado = -saida;
    }
    somar(porDiaAplicado, e.chave, fluxoAplicado);
    if (e.classe === 'USA') somar(porDiaAplicadoUsa, e.chave, fluxoAplicado);
    else if (e.classe === 'FII') somar(porDiaAplicadoFiis, e.chave, fluxoAplicado);
    else if (e.classe === 'BR') somar(porDiaAplicadoAcoes, e.chave, fluxoAplicado);
  });
  // Renda Fixa por PEPS (o lote mais antigo sai primeiro) - 23/09/2026 #2,
  // conferido com o Controle 8: é a regra do Tesouro/IR e é o que a B3
  // mostra por lote. Com custo médio (a 1ª versão desta mesma data), o
  // Tesouro Selic 2027 dava R$ 11.851,62 aplicados; por PEPS dá
  // R$ 12.932,28 - os mesmos R$ 12.932,24 dos lotes da B3 em "RF
  // Contratada - Lotes" (idem Selic 2029: R$ 15.391,92 x R$ 15.391,90).
  // Renda Variável continua por custo médio (é o "Investido" da própria
  // planilha, que bate centavo por centavo).
  var custoRfPeps = calcularCustoRendaFixaPeps_(eventosAplicadoRf.sort(porData));
  custoRfPeps.fluxos.forEach(function (f) {
    somar(porDiaAplicado, f.chave, f.valor);
    somar(porDiaAplicadoRendaFixaTotal, f.chave, f.valor);
    if (f.emergencial) somar(porDiaAplicadoRendaEmergencial, f.chave, f.valor);
  });

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
      // "Proventos" (BR): coluna C = Ticker (linha[2]) — DIFERENTE de
      // "Transações", onde é a coluna A. Conferido direto na planilha
      // real do Tiago antes de escrever isso (ver cabeçalho do arquivo).
      // "Proventos - USA" nem chega a olhar pra isso (vai pro balde USA
      // de qualquer jeito, igual "Transações - USA" acima).
      var ticker = String(linha[2] || '').trim().toUpperCase();
      var data = linha[1], liquido = Number(linha[6]);
      if (!(data instanceof Date) || isNaN(liquido)) return;
      var chave = chaveDiaISOInicio_(data);
      if (nomeAba === ABA_PROVENTOS_USA_FLUXO) {
        // 23/09/2026 #6 (Tiago vai colar os dividendos da IBKR, em US$): a
        // aba "Proventos - USA" está em DÓLAR, igual "Transações - USA" -
        // converte pelo câmbio do dia do pagamento, mesma regra da compra
        // (cambioUsdParaData_). Antes somava o US$ como se fosse R$ (nunca
        // apareceu porque a aba estava vazia).
        var cambioProvento = cambioUsdParaData_(mapaCambioUsd || {}, chavesCambio, chave);
        if (!cambioProvento) return;
        var liquidoBrl = liquido * cambioProvento;
        somar(porDia, chave, -liquidoBrl);
        somar(porDiaUsa, chave, -liquidoBrl);
        return;
      }
      somar(porDia, chave, -liquido);
      {
        // 23/09/2026 (achado pelo teste de coerência "Nacional = Ações +
        // FIIs + RF Longo Prazo"): provento com ticker que não existe no
        // histórico entrava no Total/Nacional mas em NENHUMA classe - o
        // gráfico de FIIs/Ações perdia esse rendimento e a soma das
        // classes não fechava com o Nacional. Casos reais: MALL11 (nome
        // antigo do PMLL11, 38 proventos), ELET6/AXIA6 (dividendos da
        // posição de AXIA3 lançados com outro código) e "Erro" (os cupons
        // do Tesouro IPCA+ 2045, que também estão como "Juros" em
        // Transações Renda Fixa). Regra: cupom que bate (dia + valor) com
        // um "Juros" de Transações Renda Fixa -> Renda Fixa; senão, código
        // terminado em 11 -> FIIs; senão -> Ações.
        var classeTicker = classes[ticker];
        var chaveJuros = chave + '|' + liquido.toFixed(2);
        if (!classeTicker) {
          if (Object.prototype.hasOwnProperty.call(jurosRfPorDiaValor, chaveJuros)) classeTicker = jurosRfPorDiaValor[chaveJuros] ? 'RF_EMERGENCIAL' : 'RF';
          else if (/11$/.test(ticker)) classeTicker = 'FII';
          else classeTicker = 'BR';
        }
        if (classeTicker === 'FII') somar(porDiaFiis, chave, -liquido);
        else if (classeTicker === 'BR') somar(porDiaAcoes, chave, -liquido);
        else if (classeTicker === 'RF' || classeTicker === 'RF_EMERGENCIAL') {
          somar(porDiaRendaFixaTotal, chave, -liquido);
          if (classeTicker === 'RF_EMERGENCIAL') somar(porDiaRendaEmergencial, chave, -liquido);
        }
      }
    });
  });

  return {
    total: porDia,
    rendaEmergencial: porDiaRendaEmergencial,
    usa: porDiaUsa,
    acoes: porDiaAcoes,
    fiis: porDiaFiis,
    rendaFixaTotal: porDiaRendaFixaTotal,
    primeiraCompraPorTicker: primeiraCompraPorTicker,
    movimentosPorTicker: movimentosPorTicker,
    posicoesRfZeradas: posicoesRfZeradas,
    primeiraCompraRfPorPosicao: primeiraCompraRfPorPosicao,
    // 21/09/2026 (ver comentário de porDiaAplicado* acima) - mesma forma,
    // sem provento subtraído.
    totalAplicado: porDiaAplicado,
    rendaEmergencialAplicado: porDiaAplicadoRendaEmergencial,
    usaAplicado: porDiaAplicadoUsa,
    acoesAplicado: porDiaAplicadoAcoes,
    fiisAplicado: porDiaAplicadoFiis,
    rendaFixaTotalAplicado: porDiaAplicadoRendaFixaTotal
  };
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

/**
 * 23/09/2026 #2: custo de Renda Fixa por PEPS (primeiro que entra,
 * primeiro que sai) - ver bloco "Valor aplicado" de
 * calcularFluxoCaixaDiario_. `eventos` já em ordem de data: [{ chave,
 * posicao ('Produto|Instituição'), produto, tipo ('compra'|'venda'|
 * 'transfSaida'|'transfEntrada'), valor, qtd, emergencial }]. Devolve
 * { fluxos: [{ chave, valor, emergencial }] (+ custo na compra, − custo
 * PEPS dos títulos que saíram na venda), porPosicao: { posicao: { qtd,
 * custo } } (o que sobrou) }. Venda que deixa menos de 2% da quantidade
 * fecha a posição inteira (resíduo de arredondamento de título do Tesouro,
 * ex. real: Selic 2026, 1,09 comprado e 1,08 vendido).
 */
function calcularCustoRendaFixaPeps_(eventos) {
  var lotes = {}; // posicao -> [{ qtd, custo }]
  var emTransferencia = {}; // produto -> lotes que saíram numa Transferência (Débito)
  var fluxos = [];
  function retirar(posicao, qtd) {
    var fila = lotes[posicao] || [];
    var total = fila.reduce(function (s, l) { return s + l.qtd; }, 0);
    if (!(total > 0)) return [];
    if ((total - qtd) / total < 0.02) qtd = total;
    var saiu = [];
    while (qtd > 1e-9 && fila.length) {
      var l = fila[0];
      if (l.qtd <= qtd + 1e-9) { saiu.push(l); qtd -= l.qtd; fila.shift(); }
      else { var c = l.custo * qtd / l.qtd; saiu.push({ qtd: qtd, custo: c }); l.custo -= c; l.qtd -= qtd; qtd = 0; }
    }
    return saiu;
  }
  eventos.forEach(function (e) {
    var fila = lotes[e.posicao] || (lotes[e.posicao] = []);
    if (e.tipo === 'compra') {
      fila.push({ qtd: e.qtd, custo: e.valor });
      fluxos.push({ chave: e.chave, valor: e.valor, emergencial: e.emergencial });
    } else if (e.tipo === 'venda') {
      var custoSaida = retirar(e.posicao, e.qtd).reduce(function (s, l) { return s + l.custo; }, 0);
      if (custoSaida) fluxos.push({ chave: e.chave, valor: -custoSaida, emergencial: e.emergencial });
    } else if (e.tipo === 'transfSaida') {
      emTransferencia[e.produto] = (emTransferencia[e.produto] || []).concat(retirar(e.posicao, e.qtd));
    } else if (e.tipo === 'transfEntrada') {
      Array.prototype.push.apply(fila, emTransferencia[e.produto] || []);
      emTransferencia[e.produto] = [];
    }
  });
  var porPosicao = {};
  Object.keys(lotes).forEach(function (p) {
    porPosicao[p] = {
      qtd: lotes[p].reduce(function (s, l) { return s + l.qtd; }, 0),
      custo: lotes[p].reduce(function (s, l) { return s + l.custo; }, 0)
    };
  });
  return { fluxos: fluxos, porPosicao: porPosicao };
}

/**
 * 23/09/2026 #2: custo PEPS de cada posição de Renda Fixa HOJE, lido direto
 * de "Transações Renda Fixa" - usado pela tela Carteiras > Renda Fixa
 * (CarteirasRendaFixa.gs) pro "Valor aplicado", que antes vinha da coluna
 * manual "Valor Investido" da Carteira Renda Fixa (com erros de digitação
 * reais no Controle 8: IPCA+ 2032 com R$ 3.131,36 - que é o custo do
 * Selic 2031 -, Selic 2031 com R$ 708,52, Selic 2027 com R$ 16.930,85
 * contra R$ 12.932,24 dos lotes da B3). Mesma conta do "Valor aplicado"
 * da Início/Visão geral - o número da tela de Renda Fixa e o da Visão
 * geral saem da MESMA função.
 */
function custoRendaFixaPepsHoje_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaRf = ss.getSheetByName(ABA_TRANSACOES_RF);
  if (!abaRf) return {};
  var qtdRf = abaRf.getLastRow() - LINHA_CABECALHO_TRANSACOES_RF;
  if (qtdRf <= 0) return {};
  var eventos = [];
  abaRf.getRange(LINHA_CABECALHO_TRANSACOES_RF + 1, 1, qtdRf, 8).getValues().forEach(function (linha) {
    var produto = linha[0], data = linha[1], movimentacao = String(linha[2] || ''),
        entradaSaida = String(linha[3] || ''), valor = Number(linha[7]);
    if (!produto || !(data instanceof Date) || isNaN(valor)) return;
    var tipo;
    if (movimentacao === 'Compra' || movimentacao === 'APLICAÇÃO') tipo = 'compra';
    else if (movimentacao === 'Venda' || movimentacao === 'Resgate') tipo = 'venda';
    else if (movimentacao.indexOf('Transfer') === 0) tipo = entradaSaida.indexOf('Credit') === 0 ? 'transfEntrada' : 'transfSaida';
    else return;
    eventos.push({
      data: data, chave: chaveDiaISOInicio_(data), posicao: produto + '|' + normalizarInstituicaoRF_(linha[4]),
      produto: produto, tipo: tipo, valor: valor, qtd: Math.abs(Number(linha[5]) || 0), emergencial: false
    });
  });
  eventos.sort(function (a, b) { return a.data - b.data; });
  return calcularCustoRendaFixaPeps_(eventos).porPosicao;
}
