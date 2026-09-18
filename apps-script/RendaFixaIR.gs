/**
 * RendaFixaIR.gs — cálculo de "IR se resgatasse hoje" por posição de Renda
 * Fixa, pra tela de Carteiras (sub-página Renda Fixa). Regra: tabela
 * regressiva de IR sobre renda fixa (Lei 11.033/2004) — até 180 dias 22,5%;
 * 181–360 dias 20%; 361–720 dias 17,5%; acima de 720 dias 15% — aplicada
 * sobre o RENDIMENTO (valor atual do lote − valor investido do lote), nunca
 * sobre o valor total. LCI/LCA são isentas de IR pra pessoa física — sempre
 * retorna imposto 0.
 *
 * Calcula por LOTE sempre que possível (cada aporte tem sua própria data e
 * cai numa faixa de alíquota diferente), usando a aba "RF Contratada -
 * Lotes" (criada em 18/09/2026 a partir dos extratos do Tesouro Direto —
 * só cobre títulos do Tesouro, não CDB/LCI, por decisão do Tiago). Uma
 * posição sem lotes nessa aba (CDB, ou Tesouro sem extrato importado ainda)
 * cai pro modo aproximado: 1 "lote" só, usando Data de Emissão + Valor
 * Investido da própria linha em Carteira Renda Fixa — menos preciso
 * (mistura aportes de datas diferentes numa faixa só de alíquota), mas
 * nunca fica sem número. O campo "precisao" no retorno diz qual dos dois
 * modos foi usado em cada posição.
 *
 * Preço atual do título = Valor Atualizado da posição ÷ Quantidade (ambos
 * da própria linha em Carteira Renda Fixa) — assume um preço de mercado só
 * por título, multiplicado pela quantidade de cada lote pra achar o valor
 * atual daquele lote especificamente.

 *
 * 18/09/2026: handleIRRendaFixa(e, auth) recebe "auth" já validado pelo
 * Router (mesmo padrão de Home.gs/MeusAtivos.gs desde 13/09/2026), em vez
 * de chamar verificarToken() de novo aqui dentro.
 */

var ABA_CARTEIRA_RF_IR = 'Carteira Renda Fixa';
var LINHA_DADOS_CARTEIRA_RF_IR = 9;
var ABA_LOTES_RF_IR = 'RF Contratada - Lotes';
var LINHA_DADOS_LOTES_RF_IR = 2;

function handleIRRendaFixa(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    return jsonOut({ ok: true, posicoes: montarIRRendaFixa_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'irRendaFixa', erro: String(err) });
  }
}

/** Roda só o cálculo, direto no editor, pra conferir os números antes de ligar na rota. */
function testarIRRendaFixaDireto() {
  var posicoes = montarIRRendaFixa_();
  Logger.log('Total: ' + posicoes.length);
  Logger.log(JSON.stringify(posicoes, null, 2));
}

/** Tabela regressiva do IR (Lei 11.033/2004), aplicada sobre o rendimento. */
function aliquotaIRRendaFixa_(diasCorridos) {
  if (diasCorridos <= 180) return 0.225;
  if (diasCorridos <= 360) return 0.20;
  if (diasCorridos <= 720) return 0.175;
  return 0.15;
}

function montarIRRendaFixa_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = new Date();

  // ---- pré-carrega os lotes reais (Tesouro), agrupados por título+instituição ----
  var abaLotes = ss.getSheetByName(ABA_LOTES_RF_IR);
  var lotesPorChave = {};
  if (abaLotes) {
    var ultimaLoteLinha = abaLotes.getLastRow();
    if (ultimaLoteLinha >= LINHA_DADOS_LOTES_RF_IR) {
      var dadosLotes = abaLotes.getRange(
        LINHA_DADOS_LOTES_RF_IR, 1,
        ultimaLoteLinha - LINHA_DADOS_LOTES_RF_IR + 1, 6
      ).getValues();
      dadosLotes.forEach(function (linha) {
        var titulo = linha[0], instituicao = linha[1], data = linha[2],
          quantidade = linha[3], valorInvestido = linha[5];
        if (!titulo || !data) return;
        var chave = normalizarChaveRfIr_(titulo, instituicao);
        if (!lotesPorChave[chave]) lotesPorChave[chave] = [];
        lotesPorChave[chave].push({ data: data, valorInvestido: valorInvestido, quantidade: quantidade });
      });
    }
  }

  // ---- percorre as posições de Carteira Renda Fixa ----
  var abaCarteira = ss.getSheetByName(ABA_CARTEIRA_RF_IR);
  if (!abaCarteira) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF_IR);
  var ultimaLinha = abaCarteira.getLastRow();
  var resultado = [];
  if (ultimaLinha < LINHA_DADOS_CARTEIRA_RF_IR) return resultado;

  var dados = abaCarteira.getRange(
    LINHA_DADOS_CARTEIRA_RF_IR, 1,
    ultimaLinha - LINHA_DADOS_CARTEIRA_RF_IR + 1, 12
  ).getValues();

  dados.forEach(function (linha) {
    var codigo = linha[0], nome = linha[2], tipo = linha[3],
      instituicao = linha[5], quantidade = linha[6],
      valorInvestidoTotal = linha[8], dataEmissao = linha[9],
      valorAtualizado = linha[11];
    if (!codigo && !tipo) return;

    var isento = /LCI|LCA/i.test(tipo || '');
    var precoAtual = (quantidade && valorAtualizado) ? (valorAtualizado / quantidade) : null;

    var nomeLimpo = String(nome || tipo || '').trim();
    var chave = normalizarChaveRfIr_(nomeLimpo, instituicao);
    var lotesReais = lotesPorChave[chave];
    var usouLotesReais = !!lotesReais;
    var lotes = lotesReais || [{ data: dataEmissao, valorInvestido: valorInvestidoTotal, quantidade: quantidade }];

    var detalhes = [];
    var impostoTotal = 0;
    var rendimentoTotal = 0;

    lotes.forEach(function (lote) {
      if (!lote.data || !(lote.data instanceof Date)) return;
      var diasCorridos = Math.floor((hoje - lote.data) / 86400000);
      var valorAtualLote = (!isento && precoAtual !== null && lote.quantidade != null) ?
        lote.quantidade * precoAtual : null;
      var rendimentoLote = (!isento && valorAtualLote != null && lote.valorInvestido != null) ?
        Math.max(0, valorAtualLote - lote.valorInvestido) : 0;
      var aliquota = isento ? 0 : aliquotaIRRendaFixa_(diasCorridos);
      var impostoLote = isento ? 0 : rendimentoLote * aliquota;

      rendimentoTotal += rendimentoLote;
      impostoTotal += impostoLote;

      detalhes.push({
        dataAplicacao: Utilities.formatDate(lote.data, Session.getScriptTimeZone(), 'dd/MM/yyyy'),
        diasCorridos: diasCorridos,
        valorInvestido: lote.valorInvestido || null,
        valorAtual: valorAtualLote != null ? arredondarIR_(valorAtualLote) : null,
        rendimento: arredondarIR_(rendimentoLote),
        aliquota: aliquota,
        imposto: arredondarIR_(impostoLote)
      });
    });

    resultado.push({
      titulo: nomeLimpo || codigo,
      instituicao: instituicao || null,
      isento: isento,
      precisao: usouLotesReais ? 'por-lote' : 'aproximado',
      rendimentoTotal: arredondarIR_(rendimentoTotal),
      impostoSeResgatasseHoje: arredondarIR_(impostoTotal),
      valorLiquidoSeResgatasseHoje: valorAtualizado != null ? arredondarIR_(valorAtualizado - impostoTotal) : null,
      detalhes: detalhes
    });
  });

  return resultado;
}

function normalizarChaveRfIr_(titulo, instituicao) {
  return String(titulo || '').trim().toUpperCase() + '|' + String(instituicao || '').trim().toUpperCase();
}

function arredondarIR_(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
