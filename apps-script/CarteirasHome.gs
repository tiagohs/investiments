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

  var agSomaRV = {
    'Ações': { comprado: 0, atualizado: 0, qtd: 0 },
    'FIIs': { comprado: 0, atualizado: 0, qtd: 0 },
    'Ações EUA': { comprado: 0, atualizado: 0, qtd: 0 }
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
      var classe = linha[0], ticker = linha[1],
        totalComprado = linha[18], totalAtualizado = linha[19];
      if (!ticker || !agSomaRV[classe]) return;
      agSomaRV[classe].comprado += (totalComprado || 0);
      agSomaRV[classe].atualizado += (totalAtualizado || 0);
      agSomaRV[classe].qtd += 1;
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
    return {
      nome: nome,
      totalAtualizado: arredondarCarteirasHome_(totalAtualizado),
      percentualDoPatrimonio: home.patrimonio.total !== 0 ?
        arredondarCarteirasHome_(totalAtualizado / home.patrimonio.total) : 0,
      totalInvestido: arredondarCarteirasHome_(agSoma.comprado),
      lucroPrejuizo: arredondarCarteirasHome_(lucroPrejuizo),
      rentabilidade: arredondarCarteirasHome_(percLucroPrejuizo),
      quantidadeAtivos: agSoma.qtd
    };
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
    qtd: agSomaRV['Ações EUA'].qtd
  };
  var cardAcoesEua = montarCard_('Ações Internacionais', home.patrimonio.porClasse.acoesEua, agSomaAcoesEuaBrl);
  cardAcoesEua.totalAtualizadoUsd = arredondarCarteirasHome_(agSomaRV['Ações EUA'].atualizado);
  cardAcoesEua.totalInvestidoUsd = arredondarCarteirasHome_(agSomaRV['Ações EUA'].comprado);
  cardAcoesEua.lucroPrejuizoUsd = arredondarCarteirasHome_(agSomaRV['Ações EUA'].atualizado - agSomaRV['Ações EUA'].comprado);
  cardAcoesEua.cambioUsd = cambioUsd;

  return {
    patrimonioTotal: home.patrimonio.total,
    cards: [
      montarCard_('Ações', home.patrimonio.porClasse.acoes, agSomaRV['Ações']),
      montarCard_('FIIs', home.patrimonio.porClasse.fiis, agSomaRV['FIIs']),
      cardAcoesEua,
      montarCard_('Renda Fixa', home.patrimonio.porClasse.rendaFixa, somaRF)
    ]
  };
}

function arredondarCarteirasHome_(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
