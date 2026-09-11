/**
 * Home.gs — ação "home" (doGet): dados da tela Início.
 *
 * Devolve patrimônio nas 3 visões (Total / Longo Prazo / Renda
 * Emergencial) e índices & câmbio. A série histórica de Rentabilidade
 * e a grade "Meus Ativos" ainda NÃO entram aqui — ver
 * docs/plano-implementacao.html, Fase 2, pra status.
 *
 * Todas as células abaixo foram confirmadas direto na planilha real
 * (rodamos TesteFase2Inicio.gs/diagnosticarInicio antes de escrever
 * isto, com dado de verdade, não suposição):
 *   - 📊Dash Geral!E4  = Patrimônio total
 *   - 📊Dash Geral!I16 = Ações (BRL)
 *   - 📊Dash Geral!I17 = Fundos imobiliários (BRL)
 *   - 📊Dash Geral!I18 = Renda fixa (BRL) — mesmo valor de
 *     Carteira Renda Fixa!K6 ("Total atualizado"), os dois batem
 *   - 📊Dash Geral!I19 = Bolsa americana (BRL, já convertida)
 *   - Carteira Renda Fixa!M6 = Renda Emergencial — valor atualizado só
 *     das posições marcadas "Renda Emergencial" na coluna B (o restante
 *     de Renda Fixa está marcado "Renda Fixa", que no app é a parte
 *     "Longo Prazo" dessa classe). Fórmula já existia na planilha —
 *     não precisou criar nada novo aqui.
 *   - Patrimônio Longo Prazo = Total − Renda Emergencial. Ações, FIIs e
 *     Ações EUA são sempre Longo Prazo; dentro de Renda Fixa, tudo que
 *     NÃO está marcado "Renda Emergencial" é Longo Prazo — por isso a
 *     subtração do total resolve isso sem precisar somar de novo.
 *   - Auxiliar_app!B7/B8   = Ibovespa (valor / variação dia)
 *   - Auxiliar_app!B9/B10  = IFIX (valor / variação dia)
 *   - Auxiliar_app!B11     = Cotação do euro hoje
 *   - Auxiliar_app!B15/B16 = S&P 500 (valor / variação dia)
 *   - Distribuição e Metas!K56 = Cotação do dólar hoje (mesma célula
 *     que a tela de Distribuições e Metas já usa — uma fonte só)
 *
 * As variações dia (Ibovespa/IFIX/S&P 500) vêm do GOOGLEFINANCE
 * changepct, já em pontos percentuais (-0.56 = -0,56%) — o front-end
 * usa format.js!formatPercentFromPoints pra essas, nunca
 * formatPercentFromFraction (ver o risco de escala documentado lá).
 */

function handleHome(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var dashGeral = ss.getSheetByName('📊Dash Geral');
    if (!dashGeral) return jsonOut({ ok: false, etapa: 'home', erro: 'aba não encontrada: 📊Dash Geral' });

    var carteiraRF = ss.getSheetByName('Carteira Renda Fixa');
    if (!carteiraRF) return jsonOut({ ok: false, etapa: 'home', erro: 'aba não encontrada: Carteira Renda Fixa' });

    var auxiliarApp = ss.getSheetByName('Auxiliar_app');
    if (!auxiliarApp) return jsonOut({ ok: false, etapa: 'home', erro: 'aba não encontrada: Auxiliar_app' });

    var distribuicaoMetas = ss.getSheetByName('Distribuição e Metas');
    if (!distribuicaoMetas) return jsonOut({ ok: false, etapa: 'home', erro: 'aba não encontrada: Distribuição e Metas' });

    var total = dashGeral.getRange('E4').getValue();
    var rendaEmergencial = carteiraRF.getRange('M6').getValue();
    var longoPrazo = total - rendaEmergencial;

    return jsonOut({
      ok: true,
      patrimonio: {
        total: total,
        longoPrazo: longoPrazo,
        rendaEmergencial: rendaEmergencial,
        porClasse: {
          acoes: dashGeral.getRange('I16').getValue(),
          fiis: dashGeral.getRange('I17').getValue(),
          rendaFixa: dashGeral.getRange('I18').getValue(),
          acoesEua: dashGeral.getRange('I19').getValue()
        }
      },
      indices: {
        ibovespa: { valor: auxiliarApp.getRange('B7').getValue(), variacaoDia: auxiliarApp.getRange('B8').getValue() },
        ifix: { valor: auxiliarApp.getRange('B9').getValue(), variacaoDia: auxiliarApp.getRange('B10').getValue() },
        spx: { valor: auxiliarApp.getRange('B15').getValue(), variacaoDia: auxiliarApp.getRange('B16').getValue() }
      },
      cambio: {
        usd: distribuicaoMetas.getRange('K56').getValue(),
        eur: auxiliarApp.getRange('B11').getValue()
      }
    });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'home', erro: String(err) });
  }
}
