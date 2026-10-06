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

/**
 * 05/10/2026 (A-13): IOF regressivo dos primeiros 30 dias (Decreto 6.306/2007,
 * anexo), % do RENDIMENTO - módulo único de IR/IOF no GS (Metas.gs usa esta
 * mesma função em vez de ter outra cópia da tabela). Incide ANTES do IR: o IR é
 * sobre (rendimento - IOF).
 */
var TABELA_IOF_RENDA_FIXA_ = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0];
function aliquotaIofRendaFixa_(diasCorridos) {
  if (!(diasCorridos >= 1)) return diasCorridos === 0 ? 0.96 : 0;
  if (diasCorridos >= 30) return 0;
  return TABELA_IOF_RENDA_FIXA_[diasCorridos - 1] / 100;
}

/**
 * 05/10/2026: `leitura` (opcional) = { carteira, lotes } - as linhas JÁ LIDAS de "Carteira Renda Fixa" (A..L, a
 * partir da linha 9) e de "RF Contratada - Lotes" (A..F, a partir da 2): montarCarteirasRendaFixa_ lê as duas 1 vez
 * só e reaproveita aqui. Sem `leitura`, lê sozinho (Metas.gs, ação irRendaFixa) - mesma assinatura de antes.
 */
function montarIRRendaFixa_(leitura) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = new Date();

  // ---- pré-carrega os lotes reais (Tesouro), agrupados por título+instituição ----
  var dadosLotes = leitura && leitura.lotes ? leitura.lotes : lerLinhasAbaPequenaRf_(ss, ABA_LOTES_RF_IR, LINHA_DADOS_LOTES_RF_IR, 6);
  var lotesPorChave = {};
  dadosLotes.forEach(function (linha) {
    var titulo = linha[0], instituicao = linha[1], data = linha[2],
      quantidade = linha[3], valorInvestido = linha[5];
    if (!titulo || !data) return;
    var chave = normalizarChaveRfIr_(titulo, instituicao);
    if (!lotesPorChave[chave]) lotesPorChave[chave] = [];
    lotesPorChave[chave].push({ data: data, valorInvestido: valorInvestido, quantidade: quantidade });
  });

  // ---- percorre as posições de Carteira Renda Fixa ----
  var resultado = [];
  var dados = leitura && leitura.carteira ? leitura.carteira : lerLinhasCarteiraRf_(ss);
  if (!dados.length) return resultado;

  // 05/10/2026 (A-13): o mesmo título+instituição pode aparecer em 2 linhas (uma por marca: Renda
  // Emergencial e Longo Prazo). Os lotes são do título TODO, então cada linha pegava o IR do total
  // (IR em dobro). Agora as linhas de mesma chave viram UMA posição (quantidade/valores somados) e
  // quem divide por marca (Metas.gs!irResgateDoAtivo_) reparte o IR pela fração de cada uma.
  var agrupadas = [];
  var indicePorChave = {};
  dados.forEach(function (linha) {
    var chaveG = normalizarChaveRfIr_(String(linha[2] || linha[3] || '').trim(), linha[5]);
    if (!(linha[0] || linha[3]) || indicePorChave[chaveG] === undefined) {
      if (linha[0] || linha[3]) indicePorChave[chaveG] = agrupadas.length;
      agrupadas.push(linha.slice());
      return;
    }
    var base = agrupadas[indicePorChave[chaveG]];
    base[6] = (Number(base[6]) || 0) + (Number(linha[6]) || 0);
    base[8] = (Number(base[8]) || 0) + (Number(linha[8]) || 0);
    base[11] = (Number(base[11]) || 0) + (Number(linha[11]) || 0);
  });

  agrupadas.forEach(function (linha) {
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
    var iofTotal = 0;
    var rendimentoTotal = 0;

    lotes.forEach(function (lote) {
      if (!lote.data || !(lote.data instanceof Date)) return;
      var diasCorridos = Math.floor((hoje - lote.data) / 86400000);
      var valorAtualLote = (!isento && precoAtual !== null && lote.quantidade != null) ?
        lote.quantidade * precoAtual : null;
      var rendimentoLote = (!isento && valorAtualLote != null && lote.valorInvestido != null) ?
        Math.max(0, valorAtualLote - lote.valorInvestido) : 0;
      var aliquota = isento ? 0 : aliquotaIRRendaFixa_(diasCorridos);
      // 05/10/2026 (A-13): IOF dos primeiros 30 dias incide primeiro; o IR é sobre o que sobra do rendimento
      var iofLote = isento ? 0 : rendimentoLote * aliquotaIofRendaFixa_(diasCorridos);
      var irLote = isento ? 0 : Math.max(0, rendimentoLote - iofLote) * aliquota;
      var impostoLote = irLote + iofLote;

      rendimentoTotal += rendimentoLote;
      impostoTotal += impostoLote;
      iofTotal += iofLote;

      detalhes.push({
        dataAplicacao: Utilities.formatDate(lote.data, Session.getScriptTimeZone(), 'dd/MM/yyyy'),
        diasCorridos: diasCorridos,
        valorInvestido: lote.valorInvestido || null,
        valorAtual: valorAtualLote != null ? arredondarIR_(valorAtualLote) : null,
        rendimento: arredondarIR_(rendimentoLote),
        aliquota: aliquota,
        iof: arredondarIR_(iofLote),
        imposto: arredondarIR_(impostoLote)
      });
    });

    resultado.push({
      titulo: nomeLimpo || codigo,
      instituicao: instituicao || null,
      isento: isento,
      precisao: usouLotesReais ? 'por-lote' : 'aproximado',
      rendimentoTotal: arredondarIR_(rendimentoTotal),
      // 05/10/2026 (A-13): `impostoSeResgatasseHoje` = IR + IOF (o que ele realmente perde); o IOF vai separado também
      impostoSeResgatasseHoje: arredondarIR_(impostoTotal),
      iofSeResgatasseHoje: arredondarIR_(iofTotal),
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
