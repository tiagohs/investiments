/**
 * CarteirasClasses.gs — ações "carteirasAcoes" / "carteirasFiis" /
 * "carteirasAcoesEua": as 3 sub-páginas de renda variável de Carteiras.
 * As 3 compartilham quase tudo (mesma tabela vindo de "Auxiliar_ativos",
 * mesmo jeito de agrupar por Setor/Segmento pro donut), então tem um
 * montador genérico (montarCarteiraClasse_) parametrizado por classe, e
 * cada ação só passa o parâmetro certo.
 *
 * Tabela de ativos: "Auxiliar_ativos" já tem quase todo campo que a
 * tabela de cada sub-página pede (ticker, nome, setor/segmento, preço
 * atual, preço médio, quantidade, viés + preço teto pro "Status", DY
 * (%/valor), P/VP, P/L, total comprado/atualizado, lucro/prejuízo (R$/%),
 * proventos totais) — não precisou ler as abas Carteira Ações/FIIs/USA
 * de novo aqui.
 *
 * Exceção: os 3 campos que só existem em FIIs (Liquidez Diária, % em
 * caixa, Patrimônio) não estão em Auxiliar_ativos — são buscados direto
 * em "Carteira FIIs" por ticker, só dentro de montarCarteirasFiis_.
 *
 * Benchmarks (valor de HOJE): reaproveita as mesmas células que Home.gs
 * já lê (Auxiliar_app!B7/B9/B15 pra Ibovespa/IFIX/S&P 500, Distribuição
 * e Metas!K56 pro dólar) — não duplica nada novo. O card de CDI (que o
 * Tiago pediu junto do Ibovespa em Ações) fica de fora por enquanto:
 * não achei nenhuma célula pronta com o CDI "de hoje" na planilha — ver
 * observação no fim do arquivo.
 *
 * Gráficos de Rentabilidade/Evolução POR CLASSE (Ações sozinha, FIIs
 * sozinho, etc.) ainda não têm histórico backfillado — hoje só existe o
 * histórico combinado de Renda Variável (Ações+FIIs+USA juntos, em
 * aux_historico-patrimonio). Fica como pendência separada, não bloqueia
 * o resto desta tela.
 */

var ABA_AUXILIAR_ATIVOS_CLASSES = 'Auxiliar_ativos';
var LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES = 2;
var ABA_CARTEIRA_FIIS_CLASSES = 'Carteira FIIs';
var LINHA_DADOS_CARTEIRA_FIIS_CLASSES = 9;

function handleCarteirasAcoes(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    return jsonOut({ ok: true, carteira: montarCarteirasAcoes_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'carteirasAcoes', erro: String(err) });
  }
}

function handleCarteirasFiis(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    return jsonOut({ ok: true, carteira: montarCarteirasFiis_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'carteirasFiis', erro: String(err) });
  }
}

function handleCarteirasAcoesEua(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    return jsonOut({ ok: true, carteira: montarCarteirasAcoesEua_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'carteirasAcoesEua', erro: String(err) });
  }
}

function testarCarteirasAcoesDireto() {
  Logger.log(JSON.stringify(montarCarteirasAcoes_(), null, 2));
}
function testarCarteirasFiisDireto() {
  Logger.log(JSON.stringify(montarCarteirasFiis_(), null, 2));
}
function testarCarteirasAcoesEuaDireto() {
  Logger.log(JSON.stringify(montarCarteirasAcoesEua_(), null, 2));
}

function montarCarteirasAcoes_() {
  var home = montarHome_();
  var dados = montarCarteiraClasse_('Ações');
  // 19/09/2026: home.indices.X é um objeto ({valor, variacaoDia} -
  // ver Home.gs!montarHome_) desde que os índices ganharam variação do
  // dia (Fase 2), mas os 3 benchmarks aqui embaixo sempre foram
  // consumidos como número puro no front (carteiras-acoes.js/
  // carteiras-fiis.js/carteiras-acoes-eua.js, com formatNumeroBR) -
  // ficou faltando o ".valor" nessa atribuição, então os 3 chips
  // ("Ibovespa hoje"/"IFIX hoje"/"S&P 500 hoje") vinham mostrando
  // "—" (formatNumeroBR rejeita não-número). Tiago reportou. Sem
  // teste automatizado pegando isso porque os mocks usavam número
  // solto direto (não bateram com o formato real) - corrigidos junto.
  dados.benchmarks = { ibovespa: home.indices.ibovespa.valor, cdi: buscarCdiSelicAnualizadosHoje_().cdi };
  return dados;
}

function montarCarteirasFiis_() {
  var home = montarHome_();
  var dados = montarCarteiraClasse_('FIIs');
  dados.benchmarks = { ifix: home.indices.ifix.valor };
  enriquecerAtivosComCarteiraFiis_(dados.ativos);
  return dados;
}

function montarCarteirasAcoesEua_() {
  var home = montarHome_();
  var dados = montarCarteiraClasse_('Ações EUA');
  dados.benchmarks = { dolar: home.cambio.usd, ibovespa: home.indices.ibovespa.valor, spx: home.indices.spx.valor };
  return dados;
}

/** Monta tabela + resumo + donut por Setor/Segmento pra uma classe, direto de Auxiliar_ativos. */
function montarCarteiraClasse_(classe) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAux = ss.getSheetByName(ABA_AUXILIAR_ATIVOS_CLASSES);
  if (!abaAux) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_ATIVOS_CLASSES);

  var ultimaAux = abaAux.getLastRow();
  var ativos = [];
  var porGrupo = {}; // Setor/Segmento -> totalAtualizado
  var somaComprado = 0, somaAtualizado = 0, somaProventos = 0;

  if (ultimaAux >= LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES) {
    var dadosAux = abaAux.getRange(
      LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES, 1,
      ultimaAux - LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES + 1, 23
    ).getValues();

    dadosAux.forEach(function (linha) {
      var linhaClasse = linha[0], ticker = linha[1];
      if (!ticker || linhaClasse !== classe) return;

      var grupo = linha[15] || 'Sem classificação';
      var totalComprado = linha[18] || 0;
      var totalAtualizado = linha[19] || 0;
      var proventosTotais = linha[22] || 0;

      somaComprado += totalComprado;
      somaAtualizado += totalAtualizado;
      somaProventos += proventosTotais;
      porGrupo[grupo] = (porGrupo[grupo] || 0) + totalAtualizado;

      ativos.push({
        ticker: ticker,
        nome: linha[2] || null,
        moeda: linha[4] || 'R$',
        precoAtual: linha[5],
        variacaoDia: linha[6],
        quantidade: linha[7],
        precoMedio: linha[8],
        precoTeto: linha[9],
        vies: linha[10] || null,
        pvp: linha[11],
        descontoPvp: linha[12] || null,
        pl: linha[13],
        descontoPl: linha[14] || null,
        grupo: grupo,
        dyPercentual: linha[16],
        dyValor: linha[17],
        totalComprado: totalComprado,
        totalAtualizado: totalAtualizado,
        lucroPrejuizo: linha[20],
        percentualLucroPrejuizo: linha[21],
        proventosTotais: proventosTotais
      });
    });
  }

  var lucroPrejuizoTotal = somaAtualizado - somaComprado;
  var distribuicaoPorGrupo = Object.keys(porGrupo).map(function (grupo) {
    return {
      grupo: grupo,
      totalAtualizado: arredondarCarteirasClasses_(porGrupo[grupo]),
      percentual: somaAtualizado !== 0 ? arredondarCarteirasClasses_(porGrupo[grupo] / somaAtualizado) : 0
    };
  }).sort(function (a, b) { return b.totalAtualizado - a.totalAtualizado; });

  return {
    classe: classe,
    resumo: {
      totalInvestido: arredondarCarteirasClasses_(somaComprado),
      totalAtualizado: arredondarCarteirasClasses_(somaAtualizado),
      lucroPrejuizo: arredondarCarteirasClasses_(lucroPrejuizoTotal),
      percentualLucroPrejuizo: somaComprado !== 0 ? arredondarCarteirasClasses_(lucroPrejuizoTotal / somaComprado) : 0,
      proventosTotais: arredondarCarteirasClasses_(somaProventos),
      quantidadeAtivos: ativos.length
    },
    distribuicaoPorGrupo: distribuicaoPorGrupo,
    ativos: ativos
  };
}

/** Só pra FIIs: acrescenta Liquidez Diária / % em caixa / Patrimônio, lidos direto de Carteira FIIs por ticker. */
function enriquecerAtivosComCarteiraFiis_(ativos) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaFiis = ss.getSheetByName(ABA_CARTEIRA_FIIS_CLASSES);
  if (!abaFiis) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_FIIS_CLASSES);

  var ultimaFiis = abaFiis.getLastRow();
  var porTicker = {};
  if (ultimaFiis >= LINHA_DADOS_CARTEIRA_FIIS_CLASSES) {
    var dadosFiis = abaFiis.getRange(
      LINHA_DADOS_CARTEIRA_FIIS_CLASSES, 1,
      ultimaFiis - LINHA_DADOS_CARTEIRA_FIIS_CLASSES + 1, 30
    ).getValues();
    dadosFiis.forEach(function (linha) {
      var ticker = linha[0];
      if (!ticker) return;
      porTicker[ticker] = {
        liquidezDiaria: linha[21],
        percentualEmCaixa: linha[22],
        patrimonio: linha[23]
      };
    });
  }

  ativos.forEach(function (ativo) {
    var extra = porTicker[ativo.ticker];
    ativo.liquidezDiaria = extra ? extra.liquidezDiaria : null;
    ativo.percentualEmCaixa = extra ? extra.percentualEmCaixa : null;
    ativo.patrimonio = extra ? extra.patrimonio : null;
  });
}

function arredondarCarteirasClasses_(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
