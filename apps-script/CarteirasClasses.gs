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
 * em "Carteira FIIs" por ticker, só dentro de montarCarteirasFiis_. Em
 * FIIs, o agrupamento/filtro por "setor" (donut + chips da tabela) usa
 * o Tipo (Tijolo/Híbrido/Papel) em vez do Segmento livre de
 * Auxiliar_ativos — ver enriquecerFiisComTipoRadar_ (19/09/2026 #4,
 * pedido do Tiago, confirmado: o Tipo vem da coluna S do bloco de FIIs
 * da própria "Distribuição e Metas", a MESMA fonte que o Radar de
 * oportunidades já usa - não da aba "Carteira FIIs").
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
var ABA_DISTRIBUICAO_METAS_CLASSES = 'Distribuição e Metas';
var LINHA_INICIO_BLOCO_FIIS_RADAR_CLASSES = 82; // mesmo início do bloco de FIIs do Radar de oportunidades - ver DistribuicoesMetas.gs!montarRadarOportunidades_ (colunasFiis: ativo='C', tipo='S').

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
  // 19/09/2026 #2 (correção do Tiago, fiel ao mockup de design): os 3
  // chips de índice de mercado (Ibovespa/IFIX/S&P 500) mostram a
  // VARIAÇÃO DO DIA (.variacaoDia, ver Home.gs!montarHome_), não o
  // valor em pontos do índice (.valor) - o mockup mostra "Ibovespa hoje
  // −0,39%" colorido, não "128.500". CDI continua em fração (a.a.),
  // sem cor - é taxa de referência, não "ganho/perda do dia".
  dados.benchmarks = { ibovespa: home.indices.ibovespa.variacaoDia, cdi: buscarCdiSelicAnualizadosHoje_().cdi };
  return dados;
}

function montarCarteirasFiis_() {
  var home = montarHome_();
  var dados = montarCarteiraClasse_('FIIs');
  // 19/09/2026 #2 (pedido do Tiago - "pode fazer", confirmando a
  // sugestão): FIIs ganhou Ibovespa/CDI junto do IFIX, igual às outras
  // 3 subpáginas já tinham (só IFIX ficava sozinho antes). Mesma
  // correção de variação do dia do comentário acima.
  dados.benchmarks = {
    ifix: home.indices.ifix.variacaoDia,
    ibovespa: home.indices.ibovespa.variacaoDia,
    cdi: buscarCdiSelicAnualizadosHoje_().cdi
  };
  enriquecerAtivosComCarteiraFiis_(dados.ativos);
  enriquecerFiisComTipoRadar_(dados);
  return dados;
}

function montarCarteirasAcoesEua_() {
  var home = montarHome_();
  var dados = montarCarteiraClasse_('Ações EUA');
  // Dólar fica como cotação (R$ x,xxxx), não variação - mesma correção
  // de Ibovespa/S&P 500 dos comentários acima.
  dados.benchmarks = { dolar: home.cambio.usd, ibovespa: home.indices.ibovespa.variacaoDia, spx: home.indices.spx.variacaoDia };
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
      percentualLucroPrejuizo: somaComprado !== 0 ? Math.round((lucroPrejuizoTotal / somaComprado) * 10000) / 10000 : 0, // 4 casas (23/09/2026 #3)
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

/**
 * Reclassifica os FIIs por "Tipo" (Tijolo/Híbrido/Papel) em vez do
 * Segmento livre de Auxiliar_ativos (19/09/2026 #4, pedido do Tiago:
 * "em FIIs, o filtro e divisão de setor deve usar como referência a
 * coluna C [Tipo]" - confirmado depois, junto com ele, que o Tipo vem
 * da coluna S do bloco de FIIs da própria "Distribuição e Metas" (linha
 * 82 em diante), a MESMA fonte que o Radar de oportunidades já usa pra
 * colorir por tipo (ver DistribuicoesMetas.gs!montarRadarOportunidades_/
 * chaveTipoFii_ no front-end) - não a coluna C da aba "Carteira FIIs"
 * (essa é o Ticker, não o Tipo).
 *
 * Sobrescreve `ativo.grupo` (usado pelo filtro de chips e pelo donut
 * "por setor" da página) só quando o ticker tem um Tipo reconhecido lá;
 * um FII sem ranking no Radar (raro, mas possível - ex.: recém
 * comprado, ainda não incluído na lista) mantém o Segmento de
 * Auxiliar_ativos como retaguarda, em vez de sumir de todo
 * agrupamento. A normalização acento-insensível (normalizarTipoFii_)
 * resolve de brinde a duplicidade "Híbrido"/"Hibrido" que aparecia
 * como 2 segmentos separados antes (mesmo texto, acentuação
 * inconsistente em Auxiliar_ativos).
 */
function enriquecerFiisComTipoRadar_(dados) {
  var mapaTipo = lerMapaTipoFiisPorTicker_();
  dados.ativos.forEach(function (ativo) {
    var tipo = mapaTipo[ativo.ticker];
    if (tipo) ativo.grupo = tipo;
  });
  dados.distribuicaoPorGrupo = recomputarDistribuicaoPorGrupoClasses_(dados.ativos, dados.resumo.totalAtualizado);
}

/** ticker -> "Tijolo"/"Híbrido"/"Papel", lido do bloco de FIIs da
 * própria "Distribuição e Metas" (reaproveita lerBlocoRadar_, de
 * DistribuicoesMetas.gs - mesmas colunas/linha inicial que
 * montarRadarOportunidades_ usa pra esse bloco). {} se a aba não
 * existir (não deveria bloquear o resto da página). */
function lerMapaTipoFiisPorTicker_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dm = ss.getSheetByName(ABA_DISTRIBUICAO_METAS_CLASSES);
  if (!dm) return {};
  var bloco = lerBlocoRadar_(dm, typeof localDistribuicaoMetas_ === 'function' ? localDistribuicaoMetas_(dm).radarFiis : LINHA_INICIO_BLOCO_FIIS_RADAR_CLASSES, { ativo: 'C', tipo: 'S' });
  var mapa = {};
  bloco.itens.forEach(function (item) {
    var tipo = normalizarTipoFii_(item.tipo);
    if (tipo) mapa[item.ativo] = tipo;
  });
  return mapa;
}

/** Normaliza o texto bruto da coluna Tipo (acentuação inconsistente às
 * vezes, ex.: "Hibrido" vs "Híbrido") pro rótulo canônico - mesma
 * lógica de chaveTipoFii_ no front-end (distribuicoes-metas.js), só que
 * devolvendo o rótulo acentuado pra exibição (grupo do donut/chip) em
 * vez da chave em minúsculo (usada lá só pra classe CSS). null quando
 * não reconhece (fica de fora do reagrupamento, mantém o Segmento). */
function normalizarTipoFii_(tipoBruto) {
  var normalizado = String(tipoBruto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
  if (normalizado === 'tijolo') return 'Tijolo';
  if (normalizado === 'hibrido') return 'Híbrido';
  if (normalizado === 'papel') return 'Papel';
  return null;
}

/** Reconstrói distribuicaoPorGrupo a partir do `grupo` ATUAL de cada
 * ativo (usado depois de enriquecerFiisComTipoRadar_ sobrescrever
 * `grupo` pro Tipo - o distribuicaoPorGrupo que montarCarteiraClasse_
 * calculou antes ainda reflete o Segmento antigo). */
function recomputarDistribuicaoPorGrupoClasses_(ativos, totalAtualizado) {
  var porGrupo = {};
  ativos.forEach(function (ativo) {
    var grupo = ativo.grupo || 'Sem classificação';
    porGrupo[grupo] = (porGrupo[grupo] || 0) + (ativo.totalAtualizado || 0);
  });
  return Object.keys(porGrupo).map(function (grupo) {
    return {
      grupo: grupo,
      totalAtualizado: arredondarCarteirasClasses_(porGrupo[grupo]),
      percentual: totalAtualizado ? arredondarCarteirasClasses_(porGrupo[grupo] / totalAtualizado) : 0
    };
  }).sort(function (a, b) { return b.totalAtualizado - a.totalAtualizado; });
}

function arredondarCarteirasClasses_(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
