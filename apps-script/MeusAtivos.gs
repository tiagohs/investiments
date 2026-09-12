/**
 * MeusAtivos.gs — handler novo pra grade "Meus Ativos" da Início (e,
 * mais pra frente, Carteiras/Detalhe do Ativo, que reaproveitam o
 * mesmo consolidado). Ações/FIIs/Ações EUA vêm da aba "Auxiliar_ativos"
 * (uma linha por ativo, populada por fórmula — ver docs/Auxiliar_ativos.xlsx,
 * uma planilha pronta pra importar como aba nova: no Sheets, Arquivo >
 * Importar > selecionar o arquivo > "Inserir nova(s) planilha(s)" — as
 * fórmulas (gravadas em inglês dentro do .xlsx) já chegam traduzidas pro
 * pt-BR sozinhas). Renda Fixa
 * não precisa de aba auxiliar — lê direto de "Carteira Renda Fixa",
 * que já é fonte única.
 *
 * Câmbio de Ações EUA: reaproveita 'Distribuição e Metas'!K56, mesma
 * célula que o Home.gs já usa — não existe coluna BRL na planilha.
 *
 * Em aberto (ver conversa): "variação dia" de Renda Fixa não existe
 * como coluna — teria que vir de aux_historico-renda-fixa (comparar
 * hoje vs ontem por posição). Por enquanto volta null.
 */

var ABA_AUXILIAR_ATIVOS = 'Auxiliar_ativos';
var ABA_CARTEIRA_RF_MEUSATIVOS = 'Carteira Renda Fixa';
var LINHA_DADOS_CARTEIRA_RF_MEUSATIVOS = 9;

function handleMeusAtivos(e) {
  var auth = verificarToken(e.parameter.token);
  if (!auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth.erro });
  try {
    return jsonOut({ ok: true, ativos: montarMeusAtivos_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'meusAtivos', erro: String(err) });
  }
}

function testarMeusAtivosDireto() {
  var ativos = montarMeusAtivos_();
  Logger.log('Total: ' + ativos.length);
  Logger.log(JSON.stringify(ativos, null, 2));
}

function montarMeusAtivos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lista = [];

  // ---- Ações / FIIs / Ações EUA — via Auxiliar_ativos ----
  var abaAux = ss.getSheetByName(ABA_AUXILIAR_ATIVOS);
  if (!abaAux) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_ATIVOS);
  var ultimaLinhaAux = abaAux.getLastRow();
  if (ultimaLinhaAux >= 2) {
    var cambioUsd = Number(ss.getSheetByName('Distribuição e Metas').getRange('K56').getValue()) || 0;
    var dados = abaAux.getRange(2, 1, ultimaLinhaAux - 1, 15).getValues();
    dados.forEach(function (linha) {
      var ticker = linha[1];
      if (!ticker) return; // linha em branco no fim da aba

      var classeBruta = linha[0]; // 'Ações' | 'FIIs' | 'Ações EUA'
      var classe = classeBruta === 'Ações' ? 'acoes' : classeBruta === 'FIIs' ? 'fiis' : 'usa';
      var viesBruto = linha[10];

      var item = {
        classe: classe,
        ticker: ticker,
        nome: linha[2] || null,
        tipo: linha[3] || null, // só FIIs (Tijolo/Papel/Híbrido)
        moeda: linha[4],
        precoAtual: numeroOuNulo_(linha[5]),
        variacaoDia: numeroOuNulo_(linha[6]),
        quantidade: numeroOuNulo_(linha[7]),
        precoMedio: numeroOuNulo_(linha[8]),
        precoTeto: numeroOuNulo_(linha[9]),
        vies: viesBruto === 'Comprar' ? 'comprar' : (viesBruto === 'Aguardar' ? 'aguardar' : null),
        pVp: numeroOuNulo_(linha[11]),
        descontoPVp: linha[12] || null, // texto pronto tipo "173% (1,73 P/VP)"
        pL: numeroOuNulo_(linha[13]),   // só Ações BR — Ações EUA não tem P/L na planilha hoje
        descontoPL: linha[14] || null   // idem
      };

      if (classe === 'usa' && cambioUsd) {
        if (item.precoAtual != null) item.precoAtualBRL = arredondarMeusAtivos_(item.precoAtual * cambioUsd);
        if (item.precoMedio != null) item.precoMedioBRL = arredondarMeusAtivos_(item.precoMedio * cambioUsd);
        if (item.precoTeto != null) item.precoTetoBRL = arredondarMeusAtivos_(item.precoTeto * cambioUsd);
      }

      lista.push(item);
    });
  }

  // ---- Renda Fixa — direto da Carteira Renda Fixa (já é fonte única) ----
  var abaRF = ss.getSheetByName(ABA_CARTEIRA_RF_MEUSATIVOS);
  if (!abaRF) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF_MEUSATIVOS);
  var ultimaLinhaRF = abaRF.getLastRow();
  if (ultimaLinhaRF >= LINHA_DADOS_CARTEIRA_RF_MEUSATIVOS) {
    var dadosRF = abaRF.getRange(
      LINHA_DADOS_CARTEIRA_RF_MEUSATIVOS, 1,
      ultimaLinhaRF - LINHA_DADOS_CARTEIRA_RF_MEUSATIVOS + 1, 11
    ).getValues();
    dadosRF.forEach(function (linha, i) {
      var codigo = linha[0];
      var tipoInvestimento = linha[2];
      if (!codigo && !tipoInvestimento) return; // linha em branco no fim da aba

      var marca = linha[1];       // 'Renda Emergencial' | 'Renda Fixa' (a nossa "Longo Prazo")
      var indexador = linha[3];
      var vencimento = linha[9];
      var vencimentoTexto = vencimento instanceof Date
        ? Utilities.formatDate(vencimento, Session.getScriptTimeZone(), 'MM/yyyy')
        : (vencimento || null);

      lista.push({
        classe: 'rf',
        // Código se repete entre linhas (a mesma posição pode estar
        // dividida entre Renda Emergencial e Longo Prazo) — o par
        // tipo+marca+vencimento é o que realmente identifica o cartão.
        ticker: (tipoInvestimento || codigo) + (vencimentoTexto ? ' · ' + vencimentoTexto : ''),
        codigo: codigo || null,
        marca: marca === 'Renda Emergencial' ? 'emergencial' : 'longo-prazo',
        tipoInvestimento: tipoInvestimento || null,
        indexador: indexador || null,
        quantidade: numeroOuNulo_(linha[5]),
        vencimento: vencimentoTexto,
        valorAtualizado: numeroOuNulo_(linha[10]),
        moeda: 'R$'
      });
    });
  }

  return lista;
}

function numeroOuNulo_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function arredondarMeusAtivos_(n) {
  return Math.round(n * 100) / 100;
}
