/**
 * BackfillRendaFixa.gs — projeção diária de Renda Fixa (SELIC/CDI/IPCA) pra
 * aux_historico-renda-fixa, a partir de "Transações Renda Fixa".
 *
 * Renomeado de Backfill.gs (12/09/2026) pra deixar claro que esse arquivo
 * coexiste com BackfillIndices.gs e HistoricoInicio.gs no mesmo projeto —
 * são todos arquivos SEPARADOS, nunca um sobrescrevendo o outro.
 *
 * v5 (12/09/2026): a chave de cruzamento com a Carteira Renda Fixa agora
 * inclui o indexador, não só ano de vencimento + instituição — corrige
 * colisão entre "Tesouro Selic 2029" e "Tesouro IPCA+ 2029" (mesmo ano,
 * mesma instituição XP, mas indexadores diferentes), que fazia uma
 * classificação sobrescrever a outra.
 *
 * v4: normaliza o nome da instituição por palavra-chave (XP/RICO -> "XP",
 * NU -> "NU", INTER -> "INTER") antes de agrupar e de cruzar com a
 * Carteira — corrige fragmentação causada por "Rico" ter virado "XP" e a
 * Nu ter mudado a razão social ao longo dos anos.
 *
 * v3: agrupa por Produto + Instituição (não só Produto) — corrige o caso
 * real de duas posições "Tesouro Selic 2028" distintas (uma na XP marcada
 * Renda Emergencial, outra na NU marcada Renda Fixa) que estavam sendo
 * somadas juntas por engano.
 *
 * Decisões confirmadas com o Tiago:
 * - IPCA+ e LCI/CDB: projeta só pelo índice puro (sem o spread contratado,
 *   que não está na planilha nem no extrato B3) — aproximação aceita.
 * - "Juros" (ex: cupom semestral) NÃO reduz o saldo — sai pra conta,
 *   separado do principal, que continua rendendo.
 * - Tesouro Prefixado (sem índice público): cai no fallback CDI.
 * - Posições já vencidas/vendidas que não existem mais na Carteira Renda
 *   Fixa (sem como saber a classificação de época): caem em "Renda Fixa"
 *   por padrão — só afeta a curva histórica dessas posições já
 *   encerradas, nenhuma conta pro patrimônio de hoje.
 *
 * Índice detectado pelo nome do Produto:
 *   /Selic/i -> SELIC (BCB SGS série 11, taxa diária, só dia útil)
 *   /IPCA/i  -> IPCA  (BCB SGS série 433, % mensal, prorata dia a dia)
 *   default  -> CDI   (BCB SGS série 12, taxa diária, só dia útil)
 *
 * aux_historico-renda-fixa: 6 colunas —
 *   Data | Produto | Instituição | Indexador | Classificação | Valor (BRL)
 * (o cabeçalho da linha 1 dessa aba precisa bater com isso)
 *
 * Duas formas de rodar:
 * - executarBackfillRendaFixa_() / rodarBackfillRendaFixaDireto(): regrava
 *   a aba INTEIRA do zero (limpa + recalcula) — uso manual, pra correção
 *   ou quando a classificação de alguma posição muda retroativamente.
 * - executarBackfillRendaFixaIncremental_() / rodarBackfillRendaFixaIncrementalDireto():
 *   continua cada posição a partir do último dia já salvo, sem recalcular
 *   nada — usada pelo gatilho diário automático (ver BackfillIndices.gs,
 *   gatilhoDiarioRendaFixaEIndices()).
 */

var ABA_TRANSACOES_RF = 'Transações Renda Fixa';
var ABA_HISTORICO_RF = 'aux_historico-renda-fixa';
var ABA_CARTEIRA_RF = 'Carteira Renda Fixa';
var LINHA_CABECALHO_TRANSACOES_RF = 6;
var LINHA_CABECALHO_CARTEIRA_RF = 8;

function handleBackfillRendaFixa(e) {
  var auth = verificarToken(e.parameter.token);
  if (!auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth.erro });
  try {
    return jsonOut({ ok: true, resultado: executarBackfillRendaFixa_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'backfillRendaFixa', erro: String(err) });
  }
}

/** Roda direto no editor (sem precisar de token/URL), pra teste manual. */
function rodarBackfillRendaFixaDireto() {
  Logger.log(JSON.stringify(executarBackfillRendaFixa_(), null, 2));
}

function executarBackfillRendaFixa_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaTransacoes = ss.getSheetByName(ABA_TRANSACOES_RF);
  if (!abaTransacoes) throw new Error('aba não encontrada: ' + ABA_TRANSACOES_RF);
  var abaHistorico = ss.getSheetByName(ABA_HISTORICO_RF);
  if (!abaHistorico) throw new Error('aba não encontrada: ' + ABA_HISTORICO_RF);
  var abaCarteira = ss.getSheetByName(ABA_CARTEIRA_RF);
  if (!abaCarteira) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF);

  var mapaClassificacao = montarMapaClassificacaoRF_(abaCarteira);

  var ultimaLinha = abaTransacoes.getLastRow();
  var qtdLinhas = ultimaLinha - LINHA_CABECALHO_TRANSACOES_RF;
  var dados = qtdLinhas > 0
    ? abaTransacoes.getRange(LINHA_CABECALHO_TRANSACOES_RF + 1, 1, qtdLinhas, 8).getValues()
    : [];

  // Agrupa por Produto + Instituição (normalizada) — não só Produto.
  var porPosicao = {};
  dados.forEach(function (linha) {
    var produto = linha[0];
    var data = linha[1];
    if (!produto || !(data instanceof Date)) return;
    var movimentacao = linha[2];
    var institCanonica = normalizarInstituicaoRF_(linha[4]);
    var valor = linha[7];
    var chave = produto + '|' + institCanonica;
    if (!(chave in porPosicao)) {
      porPosicao[chave] = { produto: produto, instituicao: institCanonica, eventos: [] };
    }
    porPosicao[chave].eventos.push({ data: data, movimentacao: String(movimentacao || ''), valor: Number(valor) || 0 });
  });

  var chaves = Object.keys(porPosicao);
  chaves.forEach(function (chave) {
    porPosicao[chave].eventos.sort(function (a, b) { return a.data - b.data; });
  });

  if (chaves.length === 0) {
    var linhasAntigasVazio = abaHistorico.getLastRow() - 1;
    if (linhasAntigasVazio > 0) abaHistorico.getRange(2, 1, linhasAntigasVazio, 6).clearContent();
    return { linhasGravadas: 0, posicoes: 0 };
  }

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var dataMaisAntiga = null;
  chaves.forEach(function (chave) {
    var primeira = porPosicao[chave].eventos[0].data;
    if (!dataMaisAntiga || primeira < dataMaisAntiga) dataMaisAntiga = primeira;
  });

  var indexadorPorChave = {};
  var classificacaoPorChave = {};
  var tiposUsados = {};
  chaves.forEach(function (chave) {
    var posicao = porPosicao[chave];
    var tipo = detectarIndexadorRF_(posicao.produto);
    indexadorPorChave[chave] = tipo;
    tiposUsados[tipo] = true;
    classificacaoPorChave[chave] = classificarPosicaoRF_(posicao.produto, posicao.instituicao, tipo, mapaClassificacao);
  });

  // Busca cada índice UMA vez (não por posição), cobrindo a data mais antiga -> hoje.
  var fatoresDiariosPorTipo = {};
  Object.keys(tiposUsados).forEach(function (tipo) {
    fatoresDiariosPorTipo[tipo] = (tipo === 'IPCA')
      ? buscarFatoresDiariosIpca_(dataMaisAntiga, hoje)
      : buscarFatoresDiariosBcb_(tipo === 'SELIC' ? 11 : 12, dataMaisAntiga, hoje);
  });

  var linhasSaida = [];
  chaves.forEach(function (chave) {
    var posicao = porPosicao[chave];
    var tipo = indexadorPorChave[chave];
    var classificacao = classificacaoPorChave[chave];
    var fatores = fatoresDiariosPorTipo[tipo];
    var eventos = posicao.eventos;
    var saldo = 0;
    var cursor = new Date(eventos[0].data);
    cursor.setHours(0, 0, 0, 0);
    var idxEvento = 0;

    while (cursor <= hoje) {
      while (idxEvento < eventos.length && mesmoDiaRF_(eventos[idxEvento].data, cursor)) {
        var ev = eventos[idxEvento];
        var tipoMov = ev.movimentacao.toUpperCase();
        if (tipoMov.indexOf('VENDA') >= 0 || tipoMov.indexOf('RESGATE') >= 0 || tipoMov.indexOf('TAXA') >= 0) {
          // Venda, Resgate, Cobrança de Taxa Semestral (custódia B3): saem do saldo.
          saldo -= ev.valor;
        } else if (tipoMov.indexOf('JUROS') >= 0 || tipoMov.indexOf('TRANSFER') >= 0) {
          // Juros: sai pra conta, não afeta o principal.
          // Transferência: par Débito+Crédito sem valor monetário, não afeta o saldo.
        } else {
          // Compra, Aplicação, etc.
          saldo += ev.valor;
        }
        idxEvento++;
      }

      if (saldo > 0.01) {
        linhasSaida.push([new Date(cursor), posicao.produto, posicao.instituicao, tipo, classificacao, arredondar2RF_(saldo)]);
      }

      var chaveDia = Utilities.formatDate(cursor, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      var fatorDoDia = fatores[chaveDia];
      if (fatorDoDia) saldo = saldo * fatorDoDia;

      cursor.setDate(cursor.getDate() + 1);
    }
  });

  var linhasAntigas = abaHistorico.getLastRow() - 1;
  if (linhasAntigas > 0) abaHistorico.getRange(2, 1, linhasAntigas, 6).clearContent();
  if (linhasSaida.length > 0) abaHistorico.getRange(2, 1, linhasSaida.length, 6).setValues(linhasSaida);

  return {
    linhasGravadas: linhasSaida.length,
    posicoes: chaves.length,
    detalhe: chaves.map(function (chave) {
      return { posicao: chave, indexador: indexadorPorChave[chave], classificacao: classificacaoPorChave[chave] };
    })
  };
}

/**
 * Versão incremental do backfill de Renda Fixa — usada pelo gatilho diário.
 * Pra cada posição, acha o último dia (e saldo) já salvo em
 * aux_historico-renda-fixa e continua a curva só a partir dali — nunca
 * recalcula um dia já gravado. Posição nova (nunca salva antes) recebe
 * backfill completo, do 1º evento em diante, só ela.
 *
 * Diferente de executarBackfillRendaFixa_() (que limpa e regrava tudo do
 * zero — mantida pra backfill manual/correção), essa função só ANEXA
 * linhas novas.
 *
 * Detalhe importante: o saldo salvo numa linha já reflete os eventos
 * daquele dia, mas ainda NÃO reflete o crescimento daquele dia (o
 * crescimento só é aplicado depois de gravar a linha, preparando o saldo
 * de entrada do dia seguinte). Por isso, pra retomar corretamente, busca
 * o fator do próprio último dia salvo (não só a partir do dia seguinte) e
 * aplica esse crescimento pendente antes de continuar.
 */
function executarBackfillRendaFixaIncremental_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaTransacoes = ss.getSheetByName(ABA_TRANSACOES_RF);
  if (!abaTransacoes) throw new Error('aba não encontrada: ' + ABA_TRANSACOES_RF);
  var abaHistorico = ss.getSheetByName(ABA_HISTORICO_RF);
  if (!abaHistorico) throw new Error('aba não encontrada: ' + ABA_HISTORICO_RF);
  var abaCarteira = ss.getSheetByName(ABA_CARTEIRA_RF);
  if (!abaCarteira) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF);

  var mapaClassificacao = montarMapaClassificacaoRF_(abaCarteira);

  // 1) agrupa as transações por posição — mesma lógica do backfill completo
  var ultimaLinhaTransacoes = abaTransacoes.getLastRow();
  var qtdLinhasTransacoes = ultimaLinhaTransacoes - LINHA_CABECALHO_TRANSACOES_RF;
  var dadosTransacoes = qtdLinhasTransacoes > 0
    ? abaTransacoes.getRange(LINHA_CABECALHO_TRANSACOES_RF + 1, 1, qtdLinhasTransacoes, 8).getValues()
    : [];

  var porPosicao = {};
  dadosTransacoes.forEach(function (linha) {
    var produto = linha[0];
    var data = linha[1];
    if (!produto || !(data instanceof Date)) return;
    var movimentacao = linha[2];
    var institCanonica = normalizarInstituicaoRF_(linha[4]);
    var valor = linha[7];
    var chave = produto + '|' + institCanonica;
    if (!(chave in porPosicao)) {
      porPosicao[chave] = { produto: produto, instituicao: institCanonica, eventos: [] };
    }
    porPosicao[chave].eventos.push({ data: data, movimentacao: String(movimentacao || ''), valor: Number(valor) || 0 });
  });
  var chaves = Object.keys(porPosicao);
  chaves.forEach(function (chave) {
    porPosicao[chave].eventos.sort(function (a, b) { return a.data - b.data; });
  });

  if (chaves.length === 0) {
    return { linhasGravadas: 0, posicoes: 0 };
  }

  // 2) último dia + saldo já salvo, por posição (Produto|Instituição)
  var ultimoSalvoPorChave = {};
  var ultimaLinhaHistorico = abaHistorico.getLastRow();
  if (ultimaLinhaHistorico > 1) {
    var dadosHistorico = abaHistorico.getRange(2, 1, ultimaLinhaHistorico - 1, 6).getValues();
    dadosHistorico.forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      var dataNormalizada = new Date(data);
      dataNormalizada.setHours(0, 0, 0, 0);
      var chave = linha[1] + '|' + linha[2]; // Produto|Instituição
      var atual = ultimoSalvoPorChave[chave];
      if (!atual || dataNormalizada > atual.data) {
        ultimoSalvoPorChave[chave] = { data: dataNormalizada, saldo: Number(linha[5]) || 0 };
      }
    });
  }

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // 3) pra cada posição, decide de onde ela precisa retomar
  var indexadorPorChave = {};
  var classificacaoPorChave = {};
  var referenciaPorChave = {}; // posição nova: dia do 1º evento. posição existente: último dia salvo.
  var saldoInicialPorChave = {};
  var tiposUsados = {};
  var dataMaisAntigaNecessaria = null;

  chaves.forEach(function (chave) {
    var posicao = porPosicao[chave];
    var tipo = detectarIndexadorRF_(posicao.produto);
    indexadorPorChave[chave] = tipo;
    tiposUsados[tipo] = true;
    classificacaoPorChave[chave] = classificarPosicaoRF_(posicao.produto, posicao.instituicao, tipo, mapaClassificacao);

    var salvo = ultimoSalvoPorChave[chave];
    if (!salvo) {
      var inicio = new Date(posicao.eventos[0].data);
      inicio.setHours(0, 0, 0, 0);
      referenciaPorChave[chave] = inicio;
      saldoInicialPorChave[chave] = 0;
      if (!dataMaisAntigaNecessaria || inicio < dataMaisAntigaNecessaria) dataMaisAntigaNecessaria = inicio;
    } else if (salvo.data < hoje) {
      referenciaPorChave[chave] = salvo.data;
      saldoInicialPorChave[chave] = salvo.saldo;
      if (!dataMaisAntigaNecessaria || salvo.data < dataMaisAntigaNecessaria) dataMaisAntigaNecessaria = salvo.data;
    } else {
      referenciaPorChave[chave] = null; // já em dia
    }
  });

  if (!dataMaisAntigaNecessaria) {
    return { linhasGravadas: 0, posicoes: chaves.length, detalhe: 'todas as posições já estavam em dia' };
  }

  // 4) busca cada índice UMA vez, cobrindo só o intervalo que falta de verdade
  var fatoresDiariosPorTipo = {};
  Object.keys(tiposUsados).forEach(function (tipo) {
    fatoresDiariosPorTipo[tipo] = (tipo === 'IPCA')
      ? buscarFatoresDiariosIpca_(dataMaisAntigaNecessaria, hoje)
      : buscarFatoresDiariosBcb_(tipo === 'SELIC' ? 11 : 12, dataMaisAntigaNecessaria, hoje);
  });

  // 5) roda o loop dia a dia, só a partir de onde cada posição precisa
  var linhasNovas = [];
  chaves.forEach(function (chave) {
    var referencia = referenciaPorChave[chave];
    if (!referencia) return; // já estava em dia

    var posicao = porPosicao[chave];
    var tipo = indexadorPorChave[chave];
    var classificacao = classificacaoPorChave[chave];
    var fatores = fatoresDiariosPorTipo[tipo];
    var eventos = posicao.eventos;
    var jaTinhaHistorico = chave in ultimoSalvoPorChave;
    var saldo = saldoInicialPorChave[chave];
    var cursor, idxEvento;

    if (jaTinhaHistorico) {
      // aplica o crescimento pendente do último dia já salvo, antes de
      // entrar no dia seguinte
      var chaveDiaRef = Utilities.formatDate(referencia, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      var fatorRef = fatores[chaveDiaRef];
      if (fatorRef) saldo = saldo * fatorRef;

      cursor = new Date(referencia);
      cursor.setDate(cursor.getDate() + 1);
      idxEvento = 0;
      while (idxEvento < eventos.length && antesDoDiaRF_(eventos[idxEvento].data, cursor)) idxEvento++;
    } else {
      cursor = new Date(referencia);
      idxEvento = 0;
    }

    while (cursor <= hoje) {
      while (idxEvento < eventos.length && mesmoDiaRF_(eventos[idxEvento].data, cursor)) {
        var ev = eventos[idxEvento];
        var tipoMov = ev.movimentacao.toUpperCase();
        if (tipoMov.indexOf('VENDA') >= 0 || tipoMov.indexOf('RESGATE') >= 0 || tipoMov.indexOf('TAXA') >= 0) {
          saldo -= ev.valor;
        } else if (tipoMov.indexOf('JUROS') >= 0 || tipoMov.indexOf('TRANSFER') >= 0) {
          // não afeta o principal
        } else {
          saldo += ev.valor;
        }
        idxEvento++;
      }

      if (saldo > 0.01) {
        linhasNovas.push([new Date(cursor), posicao.produto, posicao.instituicao, tipo, classificacao, arredondar2RF_(saldo)]);
      }

      var chaveDia = Utilities.formatDate(cursor, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      var fatorDoDia = fatores[chaveDia];
      if (fatorDoDia) saldo = saldo * fatorDoDia;

      cursor.setDate(cursor.getDate() + 1);
    }
  });

  if (linhasNovas.length > 0) {
    var primeiraLinhaNova = abaHistorico.getLastRow() + 1;
    abaHistorico.getRange(primeiraLinhaNova, 1, linhasNovas.length, 6).setValues(linhasNovas);
  }

  return { linhasGravadas: linhasNovas.length, posicoes: chaves.length };
}

/** Roda direto no editor, pra testar a versão incremental manualmente. */
function rodarBackfillRendaFixaIncrementalDireto() {
  Logger.log(JSON.stringify(executarBackfillRendaFixaIncremental_(), null, 2));
}

/** Compara só a data (ignora hora), pra pular eventos já consumidos em execuções anteriores. */
function antesDoDiaRF_(data, referencia) {
  var d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  var r = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  return d < r;
}

/**
 * Lê a Carteira Renda Fixa e monta um mapa "anoVencimento|instituicaoNormalizada|indexador"
 * -> Marca (Renda Emergencial / Renda Fixa). LCI/LCA entram com chave especial
 * "LCI|instituicaoNormalizada", já que não tem um "ano" isolado no nome do
 * jeito que Tesouro tem.
 */
function montarMapaClassificacaoRF_(abaCarteira) {
  var ultimaLinha = abaCarteira.getLastRow();
  var qtdLinhas = ultimaLinha - LINHA_CABECALHO_CARTEIRA_RF;
  var mapa = {};
  if (qtdLinhas <= 0) return mapa;

  var dados = abaCarteira.getRange(LINHA_CABECALHO_CARTEIRA_RF + 1, 1, qtdLinhas, 13).getValues();
  dados.forEach(function (linha) {
    var marca = linha[1]; // B: Renda Emergencial / Renda Fixa
    var tipo = linha[2]; // C: Tipo de Investimento
    var indexador = linha[3]; // D: SELIC / CDI / IPCA
    var instituicao = linha[4]; // E: Instituição
    var vencimento = linha[9]; // J: Vencimento
    if (!marca || !instituicao) return;

    var institNorm = normalizarInstituicaoRF_(instituicao);
    var indexadorNorm = String(indexador || '').toUpperCase().trim();
    var chave;
    if (tipo && /lci|lca/i.test(tipo)) {
      chave = 'LCI|' + institNorm;
    } else if (vencimento instanceof Date) {
      chave = vencimento.getFullYear() + '|' + institNorm + '|' + indexadorNorm;
    } else {
      return;
    }
    mapa[chave] = marca;
  });
  return mapa;
}

function classificarPosicaoRF_(produto, institCanonica, indexador, mapaClassificacao) {
  var chave;
  if (/^lci/i.test(produto)) {
    chave = 'LCI|' + institCanonica;
  } else {
    var match = produto.match(/(\d{4})/);
    if (!match) return 'Renda Fixa'; // sem ano identificável: fallback
    chave = match[1] + '|' + institCanonica + '|' + indexador;
  }
  return mapaClassificacao[chave] || 'Renda Fixa'; // não achou (já vencida/vendida): fallback combinado
}

function normalizarInstituicaoRF_(instituicao) {
  var s = String(instituicao || '').toUpperCase();
  if (s.indexOf('XP') >= 0) return 'XP';
  if (s.indexOf('RICO') >= 0) return 'XP'; // Rico foi incorporada ao grupo XP
  if (s.indexOf('NU') === 0 || s.indexOf('NUBANK') >= 0) return 'NU';
  if (s.indexOf('INTER') >= 0) return 'INTER';
  // fallback genérico pra qualquer outra corretora que aparecer no futuro
  return s.replace(/[^A-Z0-9]/g, '').substring(0, 15);
}

function detectarIndexadorRF_(produto) {
  if (/selic/i.test(produto)) return 'SELIC';
  if (/ipca/i.test(produto)) return 'IPCA';
  return 'CDI'; // LCI, Prefixado (fallback), CDB, etc.
}

/** SELIC (11) e CDI (12): taxa diária real, só publicada em dia útil. */
function buscarFatoresDiariosBcb_(codigoSerie, dataInicial, dataFinal) {
  var url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + codigoSerie +
    '/dados?formato=json&dataInicial=' + formatarDataBcbRF_(dataInicial) +
    '&dataFinal=' + formatarDataBcbRF_(dataFinal);
  var resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var dados = JSON.parse(resposta.getContentText());
  var mapa = {};
  dados.forEach(function (item) {
    mapa[item.data] = 1 + (parseFloat(item.valor) / 100);
  });
  return mapa;
}

/** IPCA (433): % mensal — faz o prorata dia a dia dentro de cada mês. */
function buscarFatoresDiariosIpca_(dataInicial, dataFinal) {
  var url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json' +
    '&dataInicial=' + formatarDataBcbRF_(dataInicial) +
    '&dataFinal=' + formatarDataBcbRF_(dataFinal);
  var resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var dadosMensais = JSON.parse(resposta.getContentText());
  var valorPorMes = {}; // "AAAA-MM" -> % do mês
  dadosMensais.forEach(function (item) {
    var partes = item.data.split('/'); // dd/mm/aaaa
    var chaveMes = partes[2] + '-' + partes[1];
    valorPorMes[chaveMes] = parseFloat(item.valor);
  });

  var mapa = {};
  var cursor = new Date(dataInicial);
  cursor.setHours(0, 0, 0, 0);
  var fim = new Date(dataFinal);
  while (cursor <= fim) {
    var ano = cursor.getFullYear();
    var mes = cursor.getMonth(); // 0-indexado
    var chaveMes = ano + '-' + ('0' + (mes + 1)).slice(-2);
    var valorMes = valorPorMes[chaveMes];
    if (valorMes !== undefined) {
      var diasNoMes = new Date(ano, mes + 1, 0).getDate();
      var fatorDiario = Math.pow(1 + valorMes / 100, 1 / diasNoMes);
      var chaveDia = Utilities.formatDate(cursor, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      mapa[chaveDia] = fatorDiario;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return mapa;
}

function formatarDataBcbRF_(data) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function mesmoDiaRF_(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function arredondar2RF_(n) {
  return Math.round(n * 100) / 100;
}
