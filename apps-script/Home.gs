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
 *   3) Cada etapa agora loga quanto tempo levou (console.log — trocado de
 *      Logger.log em 13/09/2026 porque o Logger clássico não estava
 *      sincronizando de forma confiável com "Registros do Cloud" pra
 *      chamadas vindas de fora, via Web App; console.log vai direto pro
 *      Cloud Logging e aparece ali com muito mais consistência) — assim
 *      dá pra confirmar depois do deploy se o gargalo real era o fetch do
 *      BCB, a leitura duplicada, ou só o overhead normal do Apps
 *      Script/Sheets, em vez de continuar no achismo.
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
 *   - Carteira Renda Fixa!N6 = Renda Emergencial — valor atualizado só
 *     das posições marcadas "Renda Emergencial" na coluna B (o restante
 *     de Renda Fixa está marcado "Renda Fixa", que no app é a parte
 *     "Longo Prazo" dessa classe). Fórmula já existia na planilha —
 *     não precisou criar nada novo aqui.
 *     [19/09/2026] Era M6 até o Tiago inserir uma coluna nova na aba
 *     "Carteira Renda Fixa" (mesmo padrão do bug corrigido no commit
 *     c71eca5): M6 passou a ser só o rótulo de texto "Renda
 *     Emergencial:" e o valor numérico empurrou pra N6. Ajustado aqui
 *     pra ler N6 — conferido direto na planilha real antes de mexer.
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
  console.log('handleHome: montarHome_ levou ' + (Date.now() - marca) + 'ms');

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
  console.log('handleHome: leitura de aux_historico-renda-fixa levou ' + (Date.now() - marca) + 'ms');

  marca = Date.now();
  try {
    resposta.historico = montarSerieHistoricoInicio_(dadosRendaFixaCache);
  } catch (err) {
    avisos.historico = String(err);
  }
  console.log('handleHome: montarSerieHistoricoInicio_ levou ' + (Date.now() - marca) + 'ms');

  // 21/09/2026 (a pedido do Tiago - "quero que os números que mostram no
  // resumo de carteira seja coerente com o numero apresentado na
  // evolucao do patrimonio. O correto deve aparecer em ambos"):
  // resposta.historico (montarSerieHistoricoInicio_, acima) só enxerga
  // até o último SYNC (aux_historico-*, gatilho diário ~10h - ver
  // HistoricoInicio.gs!montarSerieHistoricoInicio_, comentário de
  // ultimaData) - resposta.patrimonio/indices (montarHome_, alguns
  // parágrafos acima) é uma leitura AO VIVO da planilha (GOOGLEFINANCE,
  // atualiza a cada carregamento). As duas fontes sempre puderam
  // divergir um pouco (preço muda entre o sync das 10h e o momento em
  // que o Tiago abre o app) - com ultimaData agora sempre alcançando
  // "hoje" (ver comentário lá), o ÚLTIMO PONTO de resposta.historico
  // (o que os gráficos de Evolução/Rentabilidade tratam como "hoje") já
  // existe sempre, e este bloco sobrescreve só os campos de VALOR desse
  // último ponto com os mesmos números ao vivo do card - nunca os de
  // fluxo de caixa (fluxoCaixa*, já ao vivo de verdade - ver comentário
  // de ultimaData) nem CDI/Selic/IPCA (taxas oficiais sem "intraday",
  // ver Ibovespa/IFIX/S&P 500 abaixo que SÃO sobrescritos por terem
  // valor ao vivo disponível em montarHome_).
  if (dadosHome && resposta.historico && resposta.historico.length) {
    try {
      sincronizarUltimoPontoHistoricoComAoVivo_(resposta.historico, dadosHome);
    } catch (err) {
      avisos.historicoAoVivo = String(err);
    }
  }

  marca = Date.now();
  try {
    resposta.ativos = montarMeusAtivos_(dadosRendaFixaCache);
  } catch (err) {
    avisos.ativos = String(err);
  }
  console.log('handleHome: montarMeusAtivos_ levou ' + (Date.now() - marca) + 'ms');

  // 18/09/2026: "ontem" pro comparativo "ontem era" (resumo cards) passou
  // a vir do snapshot diário (SnapshotResumoDiario.gs), não mais da série
  // histórica combinada (historico, acima) - ver cabeçalho daquele arquivo
  // pro motivo (série combinada tem 3 fontes com gatilhos em horários
  // diferentes, dia mais recente pode sair incompleto sem erro nenhum).
  // null é resultado válido (app novo, ou antes do 1º snapshot existir) -
  // front-end já trata "sem ontem" mostrando o card em branco, mesmo
  // comportamento de antes.
  marca = Date.now();
  try {
    resposta.ontem = obterUltimoSnapshotPregao_();
  } catch (err) {
    avisos.ontem = String(err);
  }
  console.log('handleHome: obterUltimoSnapshotPregao_ levou ' + (Date.now() - marca) + 'ms');

  console.log('handleHome: TOTAL ' + (Date.now() - inicioTudo) + 'ms');

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

  var rendaEmergencial = carteiraRF.getRange('N6').getValue();
  var longoPrazo = total - rendaEmergencial;
  // Nacional = Longo Prazo sem os investimentos internacionais (Ações
  // EUA) - pedido do Tiago em 17/09/2026. Mesma fórmula, dia a dia, em
  // HistoricoInicio.gs!montarSerieHistoricoInicio_ (campo `nacional`).
  var nacional = longoPrazo - acoesEua;

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
      nacional: nacional,
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

/**
 * Sobrescreve o ÚLTIMO PONTO de `serie` (montarSerieHistoricoInicio_) com
 * os valores AO VIVO de `dadosHome` (montarHome_()) - ver comentário em
 * handleHome, acima, pro motivo (pedido do Tiago, 21/09/2026: cards e
 * gráfico de Evolução/Rentabilidade têm que mostrar o MESMO número).
 *
 * Só sobrescreve campos que TÊM uma versão ao vivo de verdade disponível
 * em montarHome_() - patrimônio total/por visão/por classe e os 3
 * índices de mercado (Ibovespa/IFIX/S&P 500). NUNCA mexe em:
 *   - fluxoCaixa* - calcularFluxoCaixaDiario_ (FluxoCaixaInicio.gs) já lê
 *     as abas de Transações direto a cada chamada (independente do sync
 *     diário rodar ou não), então já são "ao vivo" no sentido que
 *     importa (refletem toda transação já registrada).
 *   - indiceCdi/indiceSelic/indiceIpca - taxas oficiais (BCB) sem
 *     "intraday" de verdade, não têm uma versão "ao vivo" mais nova que
 *     o último fator já aplicado pra hoje.
 *   - pregao - continua refletindo se HOUVE sincronização de verdade
 *     hoje (não confundir com "os cards têm dado ao vivo", que é sempre
 *     verdade independente de pregão).
 *
 * ultimaData (HistoricoInicio.gs) já garante que o último ponto de
 * `serie` nunca fica ANTES de hoje - por isso este bloco só PRECISA
 * sobrescrever (nunca criar/acrescentar linha), mas confere a data mesmo
 * assim (defensivo - nunca mexe num ponto que não seja de hoje).
 */
function sincronizarUltimoPontoHistoricoComAoVivo_(serie, dadosHome) {
  var chaveHoje = chaveDiaISOInicio_(new Date());
  var ultimo = serie[serie.length - 1];
  if (!ultimo || ultimo.data !== chaveHoje) return;

  var patrimonio = dadosHome.patrimonio || {};
  var porClasse = patrimonio.porClasse || {};
  var indices = dadosHome.indices || {};

  var camposAoVivo = {
    patrimonio: patrimonio.total,
    longoPrazo: patrimonio.longoPrazo,
    nacional: patrimonio.nacional,
    rendaEmergencial: patrimonio.rendaEmergencial,
    acoes: porClasse.acoes,
    fiis: porClasse.fiis,
    acoesEua: porClasse.acoesEua,
    rendaFixaTotal: porClasse.rendaFixa
  };
  if (typeof porClasse.rendaFixa === 'number' && typeof patrimonio.rendaEmergencial === 'number') {
    camposAoVivo.rendaFixaLongoPrazo = porClasse.rendaFixa - patrimonio.rendaEmergencial;
  }
  if (indices.ibovespa && typeof indices.ibovespa.valor === 'number') camposAoVivo.ibovespa = indices.ibovespa.valor;
  if (indices.ifix && typeof indices.ifix.valor === 'number') camposAoVivo.ifix = indices.ifix.valor;
  if (indices.spx && typeof indices.spx.valor === 'number') camposAoVivo.sp500 = indices.spx.valor;

  for (var campo in camposAoVivo) {
    var v = camposAoVivo[campo];
    if (typeof v === 'number' && Number.isFinite(v)) ultimo[campo] = arredondar2Inicio_(v);
  }
}
