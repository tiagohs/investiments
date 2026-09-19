/**
 * CarteirasHome.gs — ação "carteirasHome": consolidação no topo da tela
 * Carteiras (os cards de Ações/FIIs/Ações Internacionais/Renda Fixa, com
 * nome, % do patrimônio, rentabilidade, total investido+L/P e qtd de
 * ativos — ver print/spec da revisão de 18/09/2026).
 *
 * Reaproveita montarHome_() (Home.gs, já testado ✓) pros totais por
 * classe em BRL e o patrimônio total — não duplica nenhuma célula que
 * a Início já lê. Os +detalhes por card (total investido, lucro/
 * prejuízo, rentabilidade %, qtd de ativos) somam:
 *   - Ações/FIIs/Ações EUA: direto de "Auxiliar_ativos" (Total Comprado
 *     e Total Atualizado por linha, filtrando pela coluna Classe) — a
 *     mesma aba que MeusAtivos.gs já usa.
 *   - Renda Fixa: direto de "Carteira Renda Fixa" (Valor Investido col
 *     I, Valor Atualizado col L), mesma leitura de linha que
 *     MeusAtivos.gs/RendaFixaIR.gs já fazem.
 *
 * Os gráficos de Rentabilidade e Evolução do Patrimônio DESTA tela (a
 * consolidação) reaproveitam a série que "historico_inicio" já devolve
 * (Total/Longo Prazo × Ibovespa+CDI) — confirmado com o Tiago que dá pra
 * reaproveitar, sem precisar de rota nova. O donut "por carteira" usa o
 * campo percentualDoPatrimonio de cada card abaixo.
 *
 * 18/09/2026: card de Ações Internacionais corrigido — agSomaRV['Ações
 * EUA'] vem de Auxiliar_ativos na moeda nativa (US$), mas o
 * totalAtualizado do card (home.patrimonio.porClasse.acoesEua) já vem
 * em BRL, porque precisa somar no patrimonioTotal. Sem converter
 * agSoma também, totalInvestido/lucroPrejuizo do card ficavam em
 * dólar "escondidos" atrás de um totalAtualizado em R$ — o Tiago
 * reparou comparando com a subpágina. Agora o card sai todo em BRL
 * (convertido pelo câmbio de hoje, home.cambio.usd), com os valores
 * originais em dólar à parte em totalAtualizadoUsd/totalInvestidoUsd/
 * lucroPrejuizoUsd, pra quem quiser montar o "US$ X (R$ Y)" que a
 * subpágina (CarteirasClasses.gs) já usa. Pode haver um resíduo de
 * poucos centavos entre totalAtualizado (vindo de home.patrimonio,
 * uma conversão independente) e totalInvestido+lucroPrejuizo (vindos
 * da conversão de agSoma aqui) — é só arredondamento entre as duas
 * fontes, não é bug.
 */

var ABA_AUXILIAR_ATIVOS_CARTEIRAS_HOME = 'Auxiliar_ativos';
var LINHA_DADOS_AUXILIAR_ATIVOS_CARTEIRAS_HOME = 2;
var ABA_CARTEIRA_RF_CARTEIRAS_HOME = 'Carteira Renda Fixa';
var LINHA_DADOS_CARTEIRA_RF_CARTEIRAS_HOME = 9;

function handleCarteirasHome(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    return jsonOut({ ok: true, carteiras: montarCarteirasHome_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'carteirasHome', erro: String(err) });
  }
}

function testarCarteirasHomeDireto() {
  Logger.log(JSON.stringify(montarCarteirasHome_(), null, 2));
}

function montarCarteirasHome_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var home = montarHome_(); // Home.gs — já testado ✓, reaproveita patrimônio total e por classe

  // 19/09/2026: comprar/aguardar por classe (barra "9 comprar · 5 aguardar"
  // nos 4 cards da Visão geral, a pedido do Tiago) - mesma coluna Vies
  // (linha[10]) que CarteirasClasses.gs!montarCarteiraClasse_ já lê pra
  // cada subpágina, só que agregada aqui em vez de por ativo. Não existe
  // pra Renda Fixa (sem coluna Vies em "Carteira Renda Fixa") - o card
  // de Renda Fixa fica sem essa barra, de propósito.
  var agSomaRV = {
    'Ações': { comprado: 0, atualizado: 0, qtd: 0, comprar: 0, aguardar: 0 },
    'FIIs': { comprado: 0, atualizado: 0, qtd: 0, comprar: 0, aguardar: 0 },
    'Ações EUA': { comprado: 0, atualizado: 0, qtd: 0, comprar: 0, aguardar: 0 }
  };

  var abaAux = ss.getSheetByName(ABA_AUXILIAR_ATIVOS_CARTEIRAS_HOME);
  if (!abaAux) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_ATIVOS_CARTEIRAS_HOME);
  var ultimaAux = abaAux.getLastRow();
  if (ultimaAux >= LINHA_DADOS_AUXILIAR_ATIVOS_CARTEIRAS_HOME) {
    var dadosAux = abaAux.getRange(
      LINHA_DADOS_AUXILIAR_ATIVOS_CARTEIRAS_HOME, 1,
      ultimaAux - LINHA_DADOS_AUXILIAR_ATIVOS_CARTEIRAS_HOME + 1, 23
    ).getValues();
    dadosAux.forEach(function (linha) {
      var classe = linha[0], ticker = linha[1], vies = linha[10],
        totalComprado = linha[18], totalAtualizado = linha[19];
      if (!ticker || !agSomaRV[classe]) return;
      agSomaRV[classe].comprado += (totalComprado || 0);
      agSomaRV[classe].atualizado += (totalAtualizado || 0);
      agSomaRV[classe].qtd += 1;
      var viesTexto = (vies || '').toString().toLowerCase();
      if (viesTexto === 'comprar') agSomaRV[classe].comprar += 1;
      else if (viesTexto === 'aguardar') agSomaRV[classe].aguardar += 1;
    });
  }

  var somaRF = { comprado: 0, atualizado: 0, qtd: 0 };
  var abaRF = ss.getSheetByName(ABA_CARTEIRA_RF_CARTEIRAS_HOME);
  if (!abaRF) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF_CARTEIRAS_HOME);
  var ultimaRF = abaRF.getLastRow();
  if (ultimaRF >= LINHA_DADOS_CARTEIRA_RF_CARTEIRAS_HOME) {
    var dadosRF = abaRF.getRange(
      LINHA_DADOS_CARTEIRA_RF_CARTEIRAS_HOME, 1,
      ultimaRF - LINHA_DADOS_CARTEIRA_RF_CARTEIRAS_HOME + 1, 12
    ).getValues();
    dadosRF.forEach(function (linha) {
      var codigo = linha[0], tipo = linha[3], valorInvestido = linha[8], valorAtualizado = linha[11];
      if (!codigo && !tipo) return;
      somaRF.comprado += (valorInvestido || 0);
      somaRF.atualizado += (valorAtualizado || 0);
      somaRF.qtd += 1;
    });
  }

  function montarCard_(nome, totalAtualizado, agSoma) {
    var lucroPrejuizo = agSoma.atualizado - agSoma.comprado;
    var percLucroPrejuizo = agSoma.comprado !== 0 ? (lucroPrejuizo / agSoma.comprado) : 0;
    var card = {
      nome: nome,
      totalAtualizado: arredondarCarteirasHome_(totalAtualizado),
      percentualDoPatrimonio: home.patrimonio.total !== 0 ?
        arredondarCarteirasHome_(totalAtualizado / home.patrimonio.total) : 0,
      totalInvestido: arredondarCarteirasHome_(agSoma.comprado),
      lucroPrejuizo: arredondarCarteirasHome_(lucroPrejuizo),
      rentabilidade: arredondarCarteirasHome_(percLucroPrejuizo),
      quantidadeAtivos: agSoma.qtd
    };
    // só RV tem Vies (agSomaRV acima) - Renda Fixa (somaRF) não passa
    // comprar/aguardar, e o card sai sem esses 2 campos de propósito.
    if (typeof agSoma.comprar === 'number' || typeof agSoma.aguardar === 'number') {
      card.comprar = agSoma.comprar || 0;
      card.aguardar = agSoma.aguardar || 0;
    }
    return card;
  }

  // Ações EUA: converte agSoma (US$, nativo de Auxiliar_ativos) pra
  // BRL antes de montar o card, pro card sair coerente com
  // totalAtualizado (que já vem em BRL de home.patrimonio). Guarda os
  // valores originais em dólar à parte (ver comentário no topo do
  // arquivo).
  var cambioUsd = home.cambio.usd;
  var agSomaAcoesEuaBrl = {
    comprado: agSomaRV['Ações EUA'].comprado * cambioUsd,
    atualizado: agSomaRV['Ações EUA'].atualizado * cambioUsd,
    qtd: agSomaRV['Ações EUA'].qtd,
    comprar: agSomaRV['Ações EUA'].comprar,
    aguardar: agSomaRV['Ações EUA'].aguardar
  };

  // 19/09/2026 #2 (Tiago corrigiu o pedido anterior - cada card deve
  // mostrar os benchmarks DA PRÓPRIA classe, não o Ibovespa/CDI globais
  // repetidos nos 4): CDI/Selic (buscarCdiSelicAnualizadosHoje_(),
  // BackfillIndices.gs) e IPCA (buscarIpcaAcumulado12Meses_(), mesmo
  // arquivo, já usada por CarteirasRendaFixa.gs) calculados 1 vez só
  // aqui e reaproveitados nos cards que precisam - Ibovespa/IFIX/S&P
  // 500 já vêm de home.indices (Home.gs), sem custo extra nenhum.
  // Mesmos campos/nomes que cada subpágina de detalhe já usa nos
  // próprios benchmarks (CarteirasClasses.gs/CarteirasRendaFixa.gs) -
  // pra "Ver detalhes" nunca mostrar um número diferente do card.
  //
  // 19/09/2026 #3 (Tiago corrigiu de novo, fiel ao mockup de design):
  // Ibovespa/IFIX/S&P 500 aqui viram VARIAÇÃO DO DIA (.variacaoDia, %
  // em pontos - mesma escala do chip "Ibovespa hoje" do hero), não o
  // valor em pontos do índice (.valor) - o mockup mostra "Ibovespa hoje
  // −0,39%"/"IFIX hoje +0,12%" coloridos, não "128.500". Front formata
  // com formatPercentFromPoints + verde/vermelho (ver
  // formatarBenchmarksCard_ em carteiras-visao-geral.js).
  var cdiSelic = buscarCdiSelicAnualizadosHoje_();
  var ipca = buscarIpcaAcumulado12Meses_();

  var cardAcoes = montarCard_('Ações', home.patrimonio.porClasse.acoes, agSomaRV['Ações']);
  cardAcoes.benchmarks = { ibovespa: home.indices.ibovespa.variacaoDia, cdi: cdiSelic.cdi };

  var cardFiis = montarCard_('FIIs', home.patrimonio.porClasse.fiis, agSomaRV['FIIs']);
  cardFiis.benchmarks = { ifix: home.indices.ifix.variacaoDia, ibovespa: home.indices.ibovespa.variacaoDia, cdi: cdiSelic.cdi };

  var cardAcoesEua = montarCard_('Ações Internacionais', home.patrimonio.porClasse.acoesEua, agSomaAcoesEuaBrl);
  cardAcoesEua.totalAtualizadoUsd = arredondarCarteirasHome_(agSomaRV['Ações EUA'].atualizado);
  cardAcoesEua.totalInvestidoUsd = arredondarCarteirasHome_(agSomaRV['Ações EUA'].comprado);
  cardAcoesEua.lucroPrejuizoUsd = arredondarCarteirasHome_(agSomaRV['Ações EUA'].atualizado - agSomaRV['Ações EUA'].comprado);
  cardAcoesEua.cambioUsd = cambioUsd;
  cardAcoesEua.benchmarks = { spx: home.indices.spx.variacaoDia, ibovespa: home.indices.ibovespa.variacaoDia };

  var cardRendaFixa = montarCard_('Renda Fixa', home.patrimonio.porClasse.rendaFixa, somaRF);
  cardRendaFixa.benchmarks = { cdi: cdiSelic.cdi, selic: cdiSelic.selic, ipca: ipca };

  return {
    patrimonioTotal: home.patrimonio.total,
    cards: [cardAcoes, cardFiis, cardAcoesEua, cardRendaFixa],
    // 19/09/2026: "vs CDI (a.a.)" no hero da Visão geral (a pedido do
    // Tiago) - reaproveita cdiSelic calculado acima. O "vs Ibovespa
    // hoje" do HERO (diferente dos benchmarks por card acima - esse é
    // em % de variação do dia, não em pontos) NÃO precisa de campo novo
    // aqui - o front usa home.indices.ibovespa.variacaoDia, que a
    // própria tela já busca via getHome() em paralelo (ver
    // carteiras-visao-geral.js).
    benchmarks: { cdi: cdiSelic.cdi }
  };
}

function arredondarCarteirasHome_(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
