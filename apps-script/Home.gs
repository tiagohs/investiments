/**
 * Home.gs — ação "home" (doGet): chamada única da tela Início.
 *
 * Decisão de 12/09/2026: pra não multiplicar chamadas do front-end (uma
 * pra patrimônio/índices, outra pro histórico, outra pra Meus Ativos),
 * handleHome(e) virou o orquestrador — chama os 3 montadores (cada um
 * já vivia no seu próprio arquivo, e continua lá) e devolve tudo junto
 * numa resposta só:
 *   - montarHome_()               (neste arquivo)     -> patrimonio/indices/cambio
 *   - montarSerieHistoricoInicio_() (HistoricoInicio.gs) -> historico
 *   - montarMeusAtivos_()          (MeusAtivos.gs)      -> ativos
 *
 * Cada montador roda no seu próprio try/catch: se um falhar, os outros
 * dois ainda voltam normalmente, e o problema aparece em "avisos" (por
 * seção) em vez de derrubar a resposta inteira — mesmo padrão de
 * resiliência parcial já usado em atualizarRendaFixaEIndicesDiario_
 * (BackfillIndices.gs). "avisos" só aparece na resposta quando alguma
 * seção falhou.
 *
 * As ações "historico_inicio" e "meusAtivos" continuam existindo à
 * parte no Router.gs — não removidas, só deixaram de ser necessárias
 * pra tela Início. Ficam disponíveis caso outra tela (Carteiras,
 * Detalhe do Ativo) precise buscar só um pedaço sem os outros dois.
 *
 * Otimização de 12/09/2026 (lentidão de ~30-60s relatada na ação "home"):
 *   1) aux_historico-renda-fixa era lida INTEIRA duas vezes na mesma
 *      chamada (uma por montarSerieHistoricoInicio_, outra por
 *      montarMeusAtivos_/montarVariacoesDiaRF_) — agora handleHome lê
 *      essa aba UMA vez (lerLinhasHistoricoRendaFixa_, em
 *      BackfillRendaFixa.gs) e passa o resultado pros dois.
 *   2) buscarFatoresDiariosBcb_ (BackfillRendaFixa.gs) ganhou cache de 6h
 *      (CacheService) — os 2 fetches externos pro BCB (CDI e SELIC,
 *      cobrindo ~2090 dias) só rodam de fato na 1ª chamada da janela;
 *      chamadas seguintes reaproveitam o cache. Isso resolve
 *      especificamente o "rodei de novo e continuou lento".
 *   3) Cada etapa agora loga quanto tempo levou (Logger.log, visível em
 *      Execuções no editor do Apps Script) — assim dá pra confirmar
 *      depois do deploy se o gargalo real era o fetch do BCB, a leitura
 *      duplicada, ou só o overhead normal do Apps Script, em vez de
 *      continuar no achismo.
 *
 * Todas as células de montarHome_() foram confirmadas direto na
 * planilha real (rodamos TesteFase2Inicio.gs/diagnosticarInicio antes
 * de escrever isto, com dado de verdade, não suposição):
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
 *
 * Otimização de 13/09/2026: handleHome(e, auth) passou a receber "auth"
 * já validado pelo Router (em vez de chamar verificarToken() de novo aqui
 * dentro) e montarHome_() passou a ler cada aba em 1 bloco (getRange +
 * índice no array) em vez de 1 getValue() por célula — 10 chamadas
 * viraram 4. Nenhuma das duas mudanças altera os dados devolvidos, só
 * reduz quantas vezes a gente cruza pro backend do Sheets/Google por
 * chamada.
 */

function handleHome(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }

  var inicioTudo = Date.now();
  var resposta = { ok: true };
  var avisos = {};

  var marca = Date.now();
  try {
    var dadosHome = montarHome_();
    resposta.patrimonio = dadosHome.patrimonio;
    resposta.indices = dadosHome.indices;
    resposta.cambio = dadosHome.cambio;
  } catch (err) {
    avisos.home = String(err);
  }
  Logger.log('handleHome: montarHome_ levou ' + (Date.now() - marca) + 'ms');

  // Lê aux_historico-renda-fixa UMA vez só e passa pros dois montadores
  // que precisam dela (historico e ativos) — ver otimização no cabeçalho.
  marca = Date.now();
  var dadosRendaFixaCache = null;
  try {
    dadosRendaFixaCache = lerLinhasHistoricoRendaFixa_();
  } catch (err) {
    // Não interrompe: cada montador cai no fallback de ler sozinho e,
    // se a aba realmente não existir, reporta o próprio erro em avisos.
    dadosRendaFixaCache = null;
  }
  Logger.log('handleHome: leitura de aux_historico-renda-fixa levou ' + (Date.now() - marca) + 'ms');

  marca = Date.now();
  try {
    resposta.historico = montarSerieHistoricoInicio_(dadosRendaFixaCache);
  } catch (err) {
    avisos.historico = String(err);
  }
  Logger.log('handleHome: montarSerieHistoricoInicio_ levou ' + (Date.now() - marca) + 'ms');

  marca = Date.now();
  try {
    resposta.ativos = montarMeusAtivos_(dadosRendaFixaCache);
  } catch (err) {
    avisos.ativos = String(err);
  }
  Logger.log('handleHome: montarMeusAtivos_ levou ' + (Date.now() - marca) + 'ms');

  Logger.log('handleHome: TOTAL ' + (Date.now() - inicioTudo) + 'ms');

  if (Object.keys(avisos).length > 0) resposta.avisos = avisos;

  return jsonOut(resposta);
}

function testarHomeDireto() {
  var dados = montarHome_();
  Logger.log(JSON.stringify(dados, null, 2));
}

function montarHome_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var dashGeral = ss.getSheetByName('📊Dash Geral');
  if (!dashGeral) throw new Error('aba não encontrada: 📊Dash Geral');

  var carteiraRF = ss.getSheetByName('Carteira Renda Fixa');
  if (!carteiraRF) throw new Error('aba não encontrada: Carteira Renda Fixa');

  var auxiliarApp = ss.getSheetByName('Auxiliar_app');
  if (!auxiliarApp) throw new Error('aba não encontrada: Auxiliar_app');

  var distribuicaoMetas = ss.getSheetByName('Distribuição e Metas');
  if (!distribuicaoMetas) throw new Error('aba não encontrada: Distribuição e Metas');

  // 13/09/2026: lê cada aba em UM bloco só (cobrindo todas as células que
  // essa função precisa dela), em vez de uma chamada getValue() isolada por
  // célula — eram 10 idas ao backend do Sheets (uma por célula), agora são
  // 4 (uma por aba envolvida). Índices dos arrays abaixo = posição da
  // célula dentro do bloco lido (linha 0 = primeira linha do range).
  var blocoDash = dashGeral.getRange('E4:I19').getValues(); // colunas E(0)..I(4), linhas 4(0)..19(15)
  var total = blocoDash[0][0]; // E4
  var acoes = blocoDash[12][4]; // I16
  var fiis = blocoDash[13][4]; // I17
  var rendaFixaClasse = blocoDash[14][4]; // I18
  var acoesEua = blocoDash[15][4]; // I19

  var rendaEmergencial = carteiraRF.getRange('M6').getValue();
  var longoPrazo = total - rendaEmergencial;

  var blocoAux = auxiliarApp.getRange('B7:B16').getValues(); // coluna B, linhas 7(0)..16(9)
  var ibovespaValor = blocoAux[0][0]; // B7
  var ibovespaVar = blocoAux[1][0]; // B8
  var ifixValor = blocoAux[2][0]; // B9
  var ifixVar = blocoAux[3][0]; // B10
  var eur = blocoAux[4][0]; // B11
  var spxValor = blocoAux[8][0]; // B15
  var spxVar = blocoAux[9][0]; // B16

  var usd = distribuicaoMetas.getRange('K56').getValue();

  return {
    patrimonio: {
      total: total,
      longoPrazo: longoPrazo,
      rendaEmergencial: rendaEmergencial,
      porClasse: {
        acoes: acoes,
        fiis: fiis,
        rendaFixa: rendaFixaClasse,
        acoesEua: acoesEua
      }
    },
    indices: {
      ibovespa: { valor: ibovespaValor, variacaoDia: ibovespaVar },
      ifix: { valor: ifixValor, variacaoDia: ifixVar },
      spx: { valor: spxValor, variacaoDia: spxVar }
    },
    cambio: {
      usd: usd,
      eur: eur
    }
  };
}
