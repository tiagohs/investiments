/**
 * DistribuicoesMetas.gs — ação "distribuicoesMetas" (doGet) e as ações
 * de escrita (doPost): salvarObjetivosCarteira, salvarRadarItem,
 * salvarMetaRendaPassiva, salvarMetaPatrimonio,
 * salvarMesesRendaEmergencial e salvarSplitInterno.
 *
 * 14/09/2026, 6ª fatia (2ª rodada de feedback, com prints da Suno):
 * `montarRadarOportunidades_` agora também enriquece cada item com
 * `variacaoDia` (fração, ex. -0,0409 = -4,09% - mesma escala que
 * format.js já documenta pra "Variação dia") e, só nos FIIs,
 * `segmento` (ex. "Shopping") — nenhum dos dois mora na aba
 * "Distribuição e Metas" (só ranking/preço/desconto/etc. por ticker
 * ficam lá); ambos vêm das abas "Carteira Ações"/"Carteira Ações
 * USA"/"Carteira FIIs", que já têm 1 linha por ticker com essas
 * colunas (usadas pra outras telas do app) - ver
 * lerMapaCarteiraPorTicker_. Também expõe `cotacaoDolar`
 * (Distribuição e Metas!K56, "Cotação do dólar hoje:" - informada
 * manualmente pelo Tiago, não é fórmula) pro front-end converter os
 * valores de Ações Internacionais (que já são em dólar na planilha)
 * pra reais sob demanda. Confirmado célula a célula na planilha real
 * (mesmo arquivo usado na 5ª fatia).
 *
 * 14/09/2026, 5ª fatia (rodada de feedback do Radar): `splitsInternos`
 * e `linksRecomendados` — pedido do Tiago pra 2 tabelas de "distribuição
 * desejada" DENTRO de uma classe de ativo (diferente de `objetivos`,
 * que é o split ENTRE classes — Ações/FIIs/Renda Fixa) e os links de
 * "carteira recomendada" da Suno. Confirmado célula a célula na
 * planilha real (diagnosticarSplitsELinks em DiagnosticoAtivos.gs)
 * antes de escrever isso — mesmo layout de colunas B:G que
 * montarObjetivosCarteira_ já usa (Tipo/%desejado/%atual/carteira
 * atual/nova carteira/R$ investir):
 *   - Ações (Dividendos x Ações Internacionais): cabeçalho B33:G33,
 *     dados B34:G35, total (só carteiraAtual/novaCarteira/valorInvestir)
 *     em E36:G36. Editável (% desejado) grava C34:C35.
 *   - FIIs (Tijolo x Papel x Híbrido): cabeçalho B72:G72, dados
 *     B73:G75, total em E76:F76 — G76 (a coluna R$ Resgatar/investir)
 *     NÃO tem fórmula de total, só o texto "Total:" de novo (esse
 *     split redistribui o que já existe, "Redistribuir" em F71, em vez
 *     de só aportar — a soma líquida é ~0 por construção, o Tiago não
 *     colocou número ali). Editável grava C73:C75.
 * Os 2 blocos, diferente de `radar`, sempre têm um número FIXO de
 * linhas (2 e 3) — não precisa varrer linha a linha tipo lerBlocoRadar_.
 *
 * Links "carteira recomendada" (Suno) — cada um é hyperlink de
 * verdade na própria célula (getRichTextValue().getLinkUrl()), texto
 * com um prefixo decorativo "⋘ " que é removido aqui antes de devolver:
 *   - C38 (Dividendos) e C39 (Valor) — ficam logo antes do cabeçalho
 *     do Radar Ações Nacionais (B41).
 *   - C56 (Internacional) — antes do cabeçalho do Radar Ações
 *     Internacionais (B58). ATENÇÃO: o Tiago tinha citado C54 de
 *     memória, mas C54 está vazia — o link real está em C56
 *     (confirmado no diagnóstico).
 *   - C79 (FIIs) — antes do cabeçalho do Radar FIIs (B81).
 *
 * 14/09/2026: 1ª fatia foi só "Metas da Carteira" (Renda Passiva,
 * Patrimônio, Renda Emergencial). 2ª fatia (mesmo dia) adiciona
 * `objetivos` — a distribuição desejada x atual por classe de ativo. 3ª
 * fatia (mesmo dia, ordem pedida pelo Tiago: Objetivos da Carteira →
 * Radar de oportunidades → Metas da Carteira) adiciona `radar` — as 3
 * tabelas de ranking de ativos (Ações Nacionais, Ações Internacionais,
 * FIIs), todas dentro da própria aba "Distribuição e Metas":
 *   - Ações Nacionais (view "Dividendos"): cabeçalho na linha 41, dados
 *     a partir da linha 42, total logo após o último ticker.
 *   - Ações Internacionais (USA): cabeçalho na linha 58, dados a partir
 *     da linha 59.
 *   - FIIs: cabeçalho na linha 81, dados a partir da linha 82 — única
 *     com a coluna "Tipo" (Tijolo/Papel/Híbrido).
 * Nenhuma tem linhas fixas (Tiago só adiciona ticker no fim, nunca no
 * meio), então a leitura varre linha a linha até achar a coluna Ativo
 * vazia (ver lerBlocoRadar_). 3 campos são manuais em cada linha —
 * Ranking, Preço-teto e % desejado — e são editáveis na tela também,
 * um ticker por vez (doPost action=salvarRadarItem, handler mais
 * abaixo), gravando pela "linha" real da planilha que cada item traz.
 *
 * Objetivos da Carteira: a aba "Distribuição e Metas" guarda 2 blocos de
 * distribuição desejada x atual, ambos B:G — % atual, carteira atual,
 * nova carteira e R$ a investir são fórmula (só leitura aqui). O único
 * campo editável de verdade é "% desejado" (coluna C de cada linha),
 * gravado por doPost action=salvarObjetivosCarteira (handler mais abaixo
 * neste arquivo) — um bloco inteiro por vez, pra manter a soma em 100%:
 *   - B11:G13 — split principal Ações Nacionais e Internacionais / FIIs /
 *     Renda Fixa (título em B8/B9), com totais em E14:G14.
 *   - B19:G20 — split de Renda Fixa em Renda Emergencial / Renda Fixa de
 *     longo prazo (título em B16/B17), com totais em E21:G21.
 * Cada linha tem: Tipo (B), % desejado (C), % atual (D), carteira atual
 * R$ (E), nova carteira R$ (F) e R$ a investir/resgatar (G).
 *
 * Renda Passiva: bloco novo colado em U10:W12 (título em U10, cabeçalho
 * em U11:W11, dados em U12:W12) — meta em U12 (editável, gravada por
 * salvarMetaRendaPassiva), média dos últimos 12 meses FECHADOS em V12
 * (fórmula, já calculada na própria planilha a partir de
 * Aux_dash_Proventos) e % atingido em W12 (fórmula). O handler só lê —
 * nenhum cálculo de agregação acontece aqui.
 *
 * Patrimônio: reaproveita o bloco "Cálculo futuro de patrimônio" que já
 * existia (K17:S19) — Extra (K18), % Reinvestimento (L18) e Rendimento
 * Médio (M18) são os 3 campos manuais, todos editáveis; Patrimônio
 * Desejado (N18) é a meta resultante (fórmula, não se grava direto —
 * muda sozinha quando K18/L18/M18 mudam); carteira atual vem de Q18
 * (mesma célula que a Início já usa). % atingido é calculado aqui no
 * handler (carteiraAtual / meta) — é só a razão entre 2 valores já
 * lidos, não uma agregação, então não precisa de célula nova.
 *
 * Renda Emergencial: já existia inteiro (K8:S12) antes deste arquivo —
 * média de gastos (K11, vem de 'Despesas Essenciais'!C25), meses (L11,
 * editável), meta com a margem de segurança de 10% (M12), carteira
 * atual marcada como "Renda Emergencial" em Carteira Renda Fixa (E19,
 * mesma fórmula que a Distribuição e Metas já usa), e "atingida" quando
 * a carteira atual >= meta (regra que o Tiago descreveu). Não precisa
 * de célula nova nenhuma — só ligar o que já existe.
 */

function handleDistribuicoesMetas(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }

  var resposta = { ok: true };
  var avisos = {};

  try {
    resposta.metas = montarMetasCarteira_();
  } catch (err) {
    avisos.metas = String(err);
  }

  try {
    resposta.objetivos = montarObjetivosCarteira_();
  } catch (err) {
    avisos.objetivos = String(err);
  }

  try {
    resposta.radar = montarRadarOportunidades_();
  } catch (err) {
    avisos.radar = String(err);
  }

  try {
    resposta.splitsInternos = montarSplitsInternos_();
  } catch (err) {
    avisos.splitsInternos = String(err);
  }

  try {
    resposta.linksRecomendados = montarLinksRecomendados_();
  } catch (err) {
    avisos.linksRecomendados = String(err);
  }

  if (Object.keys(avisos).length > 0) resposta.avisos = avisos;

  return jsonOut(resposta);
}

function testarMetasCarteiraDireto() {
  var dados = montarMetasCarteira_();
  Logger.log(JSON.stringify(dados, null, 2));
}

function montarMetasCarteira_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');

  // Renda Passiva — U12:W12 (meta / média últ. 12 meses / % atingido),
  // todas as 3 já vêm prontas da planilha (U12 é o único valor manual).
  var blocoRendaPassiva = dm.getRange('U12:W12').getValues()[0];
  var rendaPassiva = {
    meta: blocoRendaPassiva[0],
    mediaUlt12Meses: blocoRendaPassiva[1],
    percentualAtingido: blocoRendaPassiva[2]
  };

  // Patrimônio — K18:N18 (Extra / % Reinvestimento / Rendimento Médio /
  // Patrimônio Desejado) + Q18 (carteira atual, mesma célula da Início).
  var blocoPatrimonio = dm.getRange('K18:N18').getValues()[0];
  var carteiraAtualPatrimonio = dm.getRange('Q18').getValue();
  var metaPatrimonio = blocoPatrimonio[3];
  var patrimonio = {
    extra: blocoPatrimonio[0],
    percentualReinvestimento: blocoPatrimonio[1],
    rendimentoMedio: blocoPatrimonio[2],
    meta: metaPatrimonio,
    carteiraAtual: carteiraAtualPatrimonio,
    percentualAtingido: metaPatrimonio ? (carteiraAtualPatrimonio / metaPatrimonio) : ''
  };

  // Renda Emergencial — K11 (média de gastos) / L11 (meses) / M12 (meta
  // com margem de 10%) / E19 (carteira atual marcada Renda Emergencial).
  var mediaGastos = dm.getRange('K11').getValue();
  var meses = dm.getRange('L11').getValue();
  var metaRendaEmergencial = dm.getRange('M12').getValue();
  var carteiraAtualRendaEmergencial = dm.getRange('E19').getValue();
  var rendaEmergencial = {
    mediaGastos: mediaGastos,
    meses: meses,
    meta: metaRendaEmergencial,
    carteiraAtual: carteiraAtualRendaEmergencial,
    percentualAtingido: metaRendaEmergencial ? (carteiraAtualRendaEmergencial / metaRendaEmergencial) : '',
    atingida: carteiraAtualRendaEmergencial >= metaRendaEmergencial
  };

  return {
    rendaPassiva: rendaPassiva,
    patrimonio: patrimonio,
    rendaEmergencial: rendaEmergencial
  };
}

/**
 * Lê os 2 blocos de "Objetivos da Carteira" (distribuição desejada x
 * atual) — puro read-only, nenhum cálculo de agregação aqui, tudo já
 * vem pronto por fórmula da própria planilha.
 */
function montarObjetivosCarteira_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');

  function linhaParaObjeto_(linha) {
    return {
      tipo: linha[0],
      percentualDesejado: linha[1],
      percentualAtual: linha[2],
      carteiraAtual: linha[3],
      novaCarteira: linha[4],
      valorInvestir: linha[5]
    };
  }

  // Split principal — Ações Nacionais e Internacionais / FIIs / Renda Fixa.
  var linhasGeral = dm.getRange('B11:G13').getValues();
  var totalGeral = dm.getRange('E14:G14').getValues()[0];
  var alocacaoGeral = {
    tipos: linhasGeral.map(linhaParaObjeto_),
    total: { carteiraAtual: totalGeral[0], novaCarteira: totalGeral[1], valorInvestir: totalGeral[2] }
  };

  // Split de Renda Fixa — Renda Emergencial / Renda Fixa de longo prazo.
  var linhasRendaFixa = dm.getRange('B19:G20').getValues();
  var totalRendaFixa = dm.getRange('E21:G21').getValues()[0];
  var alocacaoRendaFixa = {
    tipos: linhasRendaFixa.map(linhaParaObjeto_),
    total: { carteiraAtual: totalRendaFixa[0], novaCarteira: totalRendaFixa[1], valorInvestir: totalRendaFixa[2] }
  };

  return { alocacaoGeral: alocacaoGeral, alocacaoRendaFixa: alocacaoRendaFixa };
}

function testarObjetivosCarteiraDireto() {
  var dados = montarObjetivosCarteira_();
  Logger.log(JSON.stringify(dados, null, 2));
}

/**
 * Lê os 3 blocos do "Radar de oportunidades" — ranking de ativos por
 * classe (Ações Nacionais "Dividendos", Ações Internacionais, FIIs).
 * Cada linha é um ticker com ranking, preço-teto, viés (fórmula:
 * "Aguardar" se preço atual >= preço-teto, senão "Comprar"), desconto
 * sobre P/VP (e, só nas Nacionais, sobre P/L), % desejado/atual por
 * ticker e quanto falta investir pra chegar na meta dele. 3 campos são
 * manuais na planilha (ranking, preço-teto, % desejado) e editáveis na
 * tela — cada item vem com "linha" (o número real da linha na
 * planilha), usado por handleSalvarRadarItem (mais abaixo) pra gravar
 * sem ambiguidade mesmo se a tela estiver ordenada por outra coluna.
 * Validado contra a planilha real (mesmo padrão usado pra Objetivos da
 * Carteira).
 *
 * As 3 tabelas ficam todas na aba "Distribuição e Metas", cada uma com
 * layout de coluna um pouco diferente (a de Ações Nacionais tem 2
 * colunas de P/L que as outras duas não têm, o que desloca onde "%
 * desejado" começa):
 *   - Ações Nacionais (view "Dividendos" da carteira): cabeçalho
 *     B41:S41, dados a partir de B42.
 *   - Ações Internacionais (USA): cabeçalho B58:R58, dados a partir de
 *     B59.
 *   - FIIs: cabeçalho B81:S81, dados a partir de B82 - única com a
 *     coluna extra "Tipo" (Tijolo/Papel/Híbrido).
 * Nenhuma das 3 tem um número fixo de linhas (Tiago só adiciona ticker
 * no fim, nunca no meio) - por isso lerBlocoRadar_ varre linha a linha
 * até achar a coluna Ativo vazia, em vez de usar um range fixo tipo
 * B42:S53. A linha em que ela para É a linha de total de cada bloco
 * (confirmado na planilha real: logo após o último ticker).
 */
function lerBlocoRadar_(sheet, primeiraLinha, colunas) {
  var itens = [];
  var linha = primeiraLinha;
  while (true) {
    var ativo = sheet.getRange(colunas.ativo + linha).getValue();
    if (!ativo) break;
    var item = { linha: linha };
    for (var campo in colunas) {
      var col = colunas[campo];
      item[campo] = col ? sheet.getRange(col + linha).getValue() : null;
    }
    itens.push(item);
    linha++;
  }
  return { itens: itens, linhaTotal: linha };
}

/**
 * Lê uma aba "Carteira X" (Ações/FIIs/Ações USA) inteira de uma vez
 * (getValues, 1 chamada em vez de 1 por linha) e monta um mapa
 * ticker -> {variacaoDia, segmento} — essas 3 abas têm cabeçalho na
 * linha 8 e dados a partir da linha 9, MAS 'Carteira Ações' tem uma
 * linha 9 em branco antes do primeiro ticker (confirmado na planilha
 * real) — por isso aqui PULA linha com ticker vazio em vez de parar
 * nela, diferente de lerBlocoRadar_ (que para no primeiro Ativo
 * vazio, porque ali o fim da lista É o primeiro vazio; aqui não dá
 * pra confiar nisso).
 *   - 'Carteira Ações' e 'Carteira Ações USA': A=Ticker, F=Segmento,
 *     K=Variação dia.
 *   - 'Carteira FIIs': A=Ticker, D=Segmento, I=Variação dia (o "Tipo"
 *     - Tijolo/Híbrido/Papel - já vem de outro lugar, a coluna S do
 *     bloco de FIIs na própria Distribuição e Metas, não daqui).
 */
function lerMapaCarteiraPorTicker_(sheet, colTicker, colVariacao, colSegmento) {
  var mapa = {};
  if (!sheet) return mapa;
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 9) return mapa;
  var numCols = Math.max(colTicker, colVariacao, colSegmento || 0);
  var valores = sheet.getRange(9, 1, ultimaLinha - 9 + 1, numCols).getValues();
  for (var i = 0; i < valores.length; i++) {
    var linha = valores[i];
    var ticker = linha[colTicker - 1];
    if (!ticker) continue;
    mapa[ticker] = {
      variacaoDia: linha[colVariacao - 1],
      segmento: colSegmento ? linha[colSegmento - 1] : null
    };
  }
  return mapa;
}

/** Copia variacaoDia/segmento (quando existir) do mapa pra cada item, por ticker (item.ativo). */
function enriquecerRadarComCarteira_(itens, mapa) {
  itens.forEach(function (item) {
    var info = mapa[item.ativo];
    item.variacaoDia = info && typeof info.variacaoDia === 'number' ? info.variacaoDia : null;
    if (info && info.segmento) item.segmento = info.segmento;
  });
}

function montarRadarOportunidades_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');

  var colunasNacionais = {
    ranking: 'B', ativo: 'C', precoAtual: 'D', precoTeto: 'E', vies: 'F',
    precoMedio: 'G', pvp: 'H', pl: 'I', descontoPvp: 'J', descontoPl: 'K',
    percentualDesejado: 'L', percentualAtual: 'M', carteiraAtual: 'N',
    percentualDiferenca: 'O', novaCarteira: 'Q', valorInvestir: 'S', tipo: null
  };
  var colunasInternacionais = {
    ranking: 'B', ativo: 'C', precoAtual: 'D', precoTeto: 'E', vies: 'F',
    precoMedio: 'G', pvp: 'H', pl: null, descontoPvp: 'J', descontoPl: null,
    percentualDesejado: 'K', percentualAtual: 'L', carteiraAtual: 'M',
    percentualDiferenca: 'O', novaCarteira: 'N', valorInvestir: 'Q', tipo: null
  };
  var colunasFiis = {
    ranking: 'B', ativo: 'C', precoAtual: 'D', precoTeto: 'E', vies: 'F',
    precoMedio: 'G', pvp: 'H', pl: null, descontoPvp: 'J', descontoPl: null,
    percentualDesejado: 'K', percentualAtual: 'L', carteiraAtual: 'M',
    percentualDiferenca: 'O', novaCarteira: 'N', valorInvestir: 'Q', tipo: 'S'
  };

  var nacionais = lerBlocoRadar_(dm, 42, colunasNacionais);
  var internacionais = lerBlocoRadar_(dm, 59, colunasInternacionais);
  var fiis = lerBlocoRadar_(dm, 82, colunasFiis);

  var mapaAcoes = lerMapaCarteiraPorTicker_(ss.getSheetByName('Carteira Ações'), 1, 11, 6);
  var mapaAcoesUsa = lerMapaCarteiraPorTicker_(ss.getSheetByName('Carteira Ações USA'), 1, 11, 6);
  var mapaFiis = lerMapaCarteiraPorTicker_(ss.getSheetByName('Carteira FIIs'), 1, 9, 4);
  enriquecerRadarComCarteira_(nacionais.itens, mapaAcoes);
  enriquecerRadarComCarteira_(internacionais.itens, mapaAcoesUsa);
  enriquecerRadarComCarteira_(fiis.itens, mapaFiis);

  function total_(linhaTotal, colCarteiraAtual, colNovaCarteira, colValorInvestir) {
    return {
      carteiraAtual: dm.getRange(colCarteiraAtual + linhaTotal).getValue(),
      novaCarteira: dm.getRange(colNovaCarteira + linhaTotal).getValue(),
      valorInvestir: dm.getRange(colValorInvestir + linhaTotal).getValue()
    };
  }

  return {
    acoesNacionais: { itens: nacionais.itens, total: total_(nacionais.linhaTotal, 'N', 'Q', 'S') },
    acoesInternacionais: { itens: internacionais.itens, total: total_(internacionais.linhaTotal, 'M', 'N', 'Q') },
    fiis: { itens: fiis.itens, total: total_(fiis.linhaTotal, 'M', 'N', 'Q') },
    cotacaoDolar: dm.getRange('K56').getValue()
  };
}

function testarRadarOportunidadesDireto() {
  var dados = montarRadarOportunidades_();
  Logger.log(JSON.stringify(dados, null, 2));
}

/**
 * Lê os 2 blocos de "distribuição desejada" DENTRO de uma classe de
 * ativo (Ações: Dividendos x Ações Internacionais; FIIs: Tijolo x
 * Papel x Híbrido) — ver o comentário no topo do arquivo pra estrutura
 * completa confirmada na planilha real. Mesmo formato de item que
 * montarObjetivosCarteira_ (linhaParaObjeto_ local, mesma forma).
 */
function montarSplitsInternos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');

  function linhaParaObjeto_(linha) {
    return {
      tipo: linha[0],
      percentualDesejado: linha[1],
      percentualAtual: linha[2],
      carteiraAtual: linha[3],
      novaCarteira: linha[4],
      valorInvestir: linha[5]
    };
  }

  var linhasAcoes = dm.getRange('B34:G35').getValues();
  var totalAcoes = dm.getRange('E36:G36').getValues()[0];
  var acoes = {
    itens: linhasAcoes.map(linhaParaObjeto_),
    total: { carteiraAtual: totalAcoes[0], novaCarteira: totalAcoes[1], valorInvestir: totalAcoes[2] }
  };

  var linhasFiis = dm.getRange('B73:G75').getValues();
  var totalFiis = dm.getRange('E76:G76').getValues()[0];
  var fiis = {
    itens: linhasFiis.map(linhaParaObjeto_),
    total: {
      carteiraAtual: totalFiis[0],
      novaCarteira: totalFiis[1],
      // G76 é o texto "Total:" na planilha, não uma fórmula numérica
      // (ver comentário no topo do arquivo) — só expõe se um dia virar
      // número de verdade lá.
      valorInvestir: typeof totalFiis[2] === 'number' ? totalFiis[2] : null
    }
  };

  return { acoes: acoes, fiis: fiis };
}

function testarSplitsInternosDireto() {
  var dados = montarSplitsInternos_();
  Logger.log(JSON.stringify(dados, null, 2));
}

/**
 * Lê os 4 links de "carteira recomendada" da Suno (hyperlink de
 * verdade na célula, não texto/URL solto — ver comentário no topo do
 * arquivo). Devolve null pro link que não tiver hyperlink (planilha
 * mudou/célula ficou vazia), em vez de quebrar a resposta inteira.
 */
function montarLinksRecomendados_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');

  function link_(celula) {
    var range = dm.getRange(celula);
    var rich = range.getRichTextValue();
    var url = rich ? rich.getLinkUrl() : null;
    if (!url) return null;
    var texto = String(range.getValue() || '').replace(/^⋘\s*/, '').trim();
    return { texto: texto, url: url };
  }

  return {
    acoesDividendos: link_('C38'),
    acoesValor: link_('C39'),
    acoesInternacional: link_('C56'),
    fiis: link_('C79')
  };
}

function testarLinksRecomendadosDireto() {
  var dados = montarLinksRecomendados_();
  Logger.log(JSON.stringify(dados, null, 2));
}

/**
 * doPost, action=salvarRadarItem. Grava, pra UM ticker de UMA das 3
 * tabelas do Radar de oportunidades, os 3 campos manuais: Ranking,
 * Preço-teto e % desejado (% atual, carteira atual, nova carteira, R$
 * investir e viés são fórmula e recalculam sozinhos a partir desses 3).
 * Campos do formulário:
 *   - "tabela": "acoesNacionais" | "acoesInternacionais" | "fiis".
 *   - "linha": número da linha real na planilha (o item devolvido por
 *     montarRadarOportunidades_ já traz isso em "linha") — grava direto
 *     nela, não depende da ordem em que a tela está mostrando a tabela.
 *   - "ativo": o ticker esperado nessa linha — conferido contra a
 *     coluna Ativo antes de gravar, só pra evitar gravar na linha
 *     errada se a planilha mudou de tamanho entre a leitura e o salvar
 *     (ex.: Tiago adicionou/removeu um ticker nesse meio-tempo).
 *   - "ranking": inteiro positivo.
 *   - "precoTeto": número positivo.
 *   - "percentualDesejado": fração 0-1.
 * Não valida soma de % desejado entre tickers (diferente de Objetivos
 * da Carteira) porque aqui não é um split fechado em 100% — cada
 * ticker tem sua fatia dentro do bloco maior da classe de ativo.
 */
function handleSalvarRadarItem(e) {
  try {
    var COLUNAS_RADAR_ESCRITA = {
      acoesNacionais: { primeiraLinha: 42, ativo: 'C', ranking: 'B', precoTeto: 'E', percentualDesejado: 'L' },
      acoesInternacionais: { primeiraLinha: 59, ativo: 'C', ranking: 'B', precoTeto: 'E', percentualDesejado: 'K' },
      fiis: { primeiraLinha: 82, ativo: 'C', ranking: 'B', precoTeto: 'E', percentualDesejado: 'K' }
    };

    var tabela = e.parameter.tabela;
    var cols = COLUNAS_RADAR_ESCRITA[tabela];
    if (!cols) {
      return jsonOut({ ok: false, erro: 'tabela inválida: ' + tabela });
    }

    var linha = parseInt(e.parameter.linha, 10);
    if (isNaN(linha) || linha < cols.primeiraLinha) {
      return jsonOut({ ok: false, erro: 'linha inválida: ' + e.parameter.linha });
    }

    var ranking = Number(e.parameter.ranking);
    if (isNaN(ranking) || ranking <= 0) {
      return jsonOut({ ok: false, erro: 'ranking inválido: ' + e.parameter.ranking });
    }
    var precoTeto = Number(e.parameter.precoTeto);
    if (isNaN(precoTeto) || precoTeto <= 0) {
      return jsonOut({ ok: false, erro: 'preço-teto inválido: ' + e.parameter.precoTeto });
    }
    var percentualDesejado = Number(e.parameter.percentualDesejado);
    if (isNaN(percentualDesejado) || percentualDesejado < 0 || percentualDesejado > 1) {
      return jsonOut({ ok: false, erro: 'percentual desejado inválido (use fração 0-1): ' + e.parameter.percentualDesejado });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');

    var ativoNaPlanilha = String(dm.getRange(cols.ativo + linha).getValue() || '').trim();
    var ativoEsperado = String(e.parameter.ativo || '').trim();
    if (!ativoNaPlanilha || ativoNaPlanilha.toUpperCase() !== ativoEsperado.toUpperCase()) {
      return jsonOut({ ok: false, erro: 'linha ' + linha + ' não é mais o ativo ' + ativoEsperado + ' (agora é "' + ativoNaPlanilha + '") — recarregue a tela e tente de novo' });
    }

    dm.getRange(cols.ranking + linha).setValue(ranking);
    dm.getRange(cols.precoTeto + linha).setValue(precoTeto);
    dm.getRange(cols.percentualDesejado + linha).setValue(percentualDesejado);

    return jsonOut({ ok: true });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * doPost, action=salvarObjetivosCarteira. Grava os "% desejado" de um
 * dos 2 blocos de Objetivos da Carteira (a única coisa editável nessa
 * seção — % atual, carteira atual, nova carteira e R$ a investir são
 * fórmula e recalculam sozinhas a partir do % desejado que muda aqui).
 * Campos do formulário:
 *   - "bloco": "geral" (Ações Nacionais e Internacionais / FIIs / Renda
 *     Fixa → grava C11:C13) ou "rendaFixa" (Renda Emergencial / Renda
 *     Fixa de longo prazo → grava C19:C20).
 *   - "percentuais": valores separados por vírgula, uma fração (0-1)
 *     por linha, NA MESMA ORDEM que montarObjetivosCarteira_ devolve
 *     esse bloco (senão grava o % errado na linha errada).
 * Valida cada valor (0-1) e que a soma do bloco feche perto de 100%
 * (margem de 1 ponto percentual, só pra pegar erro de digitação sem
 * atrapalhar arredondamento normal).
 */
function handleSalvarObjetivosCarteira(e) {
  try {
    var bloco = e.parameter.bloco;
    var range;
    if (bloco === 'geral') {
      range = 'C11:C13';
    } else if (bloco === 'rendaFixa') {
      range = 'C19:C20';
    } else {
      return jsonOut({ ok: false, erro: 'bloco inválido: ' + bloco });
    }

    var percentuaisStr = String(e.parameter.percentuais || '');
    var percentuais = percentuaisStr.split(',').map(function (s) { return Number(s.trim()); });

    var linhasEsperadas = bloco === 'geral' ? 3 : 2;
    if (percentuais.length !== linhasEsperadas) {
      return jsonOut({ ok: false, erro: 'esperava ' + linhasEsperadas + ' valores, recebi ' + percentuais.length });
    }
    for (var i = 0; i < percentuais.length; i++) {
      if (isNaN(percentuais[i]) || percentuais[i] < 0 || percentuais[i] > 1) {
        return jsonOut({ ok: false, erro: 'percentual inválido (use fração 0-1): ' + percentuaisStr });
      }
    }
    var soma = percentuais.reduce(function (a, b) { return a + b; }, 0);
    if (Math.abs(soma - 1) > 0.01) {
      return jsonOut({ ok: false, erro: 'os percentuais desse bloco precisam somar 100% (soma atual: ' + Math.round(soma * 100) + '%)' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
    dm.getRange(range).setValues(percentuais.map(function (v) { return [v]; }));

    return jsonOut({ ok: true });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * doPost, action=salvarSplitInterno. Grava os "% desejado" de um dos 2
 * splits internos por classe de ativo (novo bloco pedido pelo Tiago,
 * 14/09/2026, mostrado acima da tabela do Radar — mesmo padrão de
 * handleSalvarObjetivosCarteira, só muda o range):
 *   - "bloco": "acoes" (Dividendos / Ações Internacionais → grava
 *     C34:C35) ou "fiis" (Tijolo / Papel / Híbrido → grava C73:C75).
 *   - "percentuais": valores separados por vírgula, uma fração (0-1)
 *     por linha, NA MESMA ORDEM que montarSplitsInternos_ devolve esse
 *     bloco (senão grava o % errado na linha errada).
 * Valida cada valor (0-1) e que a soma do bloco feche perto de 100%
 * (mesma margem de 1 ponto percentual usada em Objetivos da Carteira).
 */
function handleSalvarSplitInterno(e) {
  try {
    var bloco = e.parameter.bloco;
    var range;
    if (bloco === 'acoes') {
      range = 'C34:C35';
    } else if (bloco === 'fiis') {
      range = 'C73:C75';
    } else {
      return jsonOut({ ok: false, erro: 'bloco inválido: ' + bloco });
    }

    var percentuaisStr = String(e.parameter.percentuais || '');
    var percentuais = percentuaisStr.split(',').map(function (s) { return Number(s.trim()); });

    var linhasEsperadas = bloco === 'acoes' ? 2 : 3;
    if (percentuais.length !== linhasEsperadas) {
      return jsonOut({ ok: false, erro: 'esperava ' + linhasEsperadas + ' valores, recebi ' + percentuais.length });
    }
    for (var i = 0; i < percentuais.length; i++) {
      if (isNaN(percentuais[i]) || percentuais[i] < 0 || percentuais[i] > 1) {
        return jsonOut({ ok: false, erro: 'percentual inválido (use fração 0-1): ' + percentuaisStr });
      }
    }
    var soma = percentuais.reduce(function (a, b) { return a + b; }, 0);
    if (Math.abs(soma - 1) > 0.01) {
      return jsonOut({ ok: false, erro: 'os percentuais desse bloco precisam somar 100% (soma atual: ' + Math.round(soma * 100) + '%)' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
    dm.getRange(range).setValues(percentuais.map(function (v) { return [v]; }));

    return jsonOut({ ok: true });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * doPost, action=salvarMetaRendaPassiva. Campo de formulário "valor"
 * (número, R$ por mês). Grava direto em U12 — não mexe em V12/W12
 * (são fórmulas, recalculam sozinhas).
 */
function handleSalvarMetaRendaPassiva(e) {
  try {
    var valor = Number(e.parameter.valor);
    if (isNaN(valor) || valor < 0) {
      return jsonOut({ ok: false, erro: 'valor inválido: ' + e.parameter.valor });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
    dm.getRange('U12').setValue(valor);
    return jsonOut({ ok: true });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * doPost, action=salvarMesesRendaEmergencial. Campo de formulário "meses"
 * (número inteiro de meses de reserva desejados). Grava direto em L11 —
 * o resto do bloco (média de gastos em K11, meta com margem em M12,
 * carteira atual em E19) recalcula sozinho.
 */
function handleSalvarMesesRendaEmergencial(e) {
  try {
    var meses = Number(e.parameter.meses);
    if (isNaN(meses) || meses <= 0) {
      return jsonOut({ ok: false, erro: 'meses inválido: ' + e.parameter.meses });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
    dm.getRange('L11').setValue(meses);
    return jsonOut({ ok: true });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * doPost, action=salvarMetaPatrimonio. Campos de formulário opcionais —
 * manda só o(s) que mudou(aram): "extra" (R$), "percentualReinvestimento"
 * e "rendimentoMedio" (ambos como fração 0-1, ex. 0.25 = 25%). Grava só
 * o que veio preenchido, sem mexer nos outros dois nem no resultado
 * (N18, que é fórmula e recalcula sozinha).
 */
function handleSalvarMetaPatrimonio(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');

    if (e.parameter.extra !== undefined && e.parameter.extra !== '') {
      var extra = Number(e.parameter.extra);
      if (isNaN(extra) || extra < 0) return jsonOut({ ok: false, erro: 'extra inválido: ' + e.parameter.extra });
      dm.getRange('K18').setValue(extra);
    }
    if (e.parameter.percentualReinvestimento !== undefined && e.parameter.percentualReinvestimento !== '') {
      var pct = Number(e.parameter.percentualReinvestimento);
      if (isNaN(pct) || pct < 0 || pct > 1) return jsonOut({ ok: false, erro: '% reinvestimento inválido (use fração 0-1): ' + e.parameter.percentualReinvestimento });
      dm.getRange('L18').setValue(pct);
    }
    if (e.parameter.rendimentoMedio !== undefined && e.parameter.rendimentoMedio !== '') {
      var rend = Number(e.parameter.rendimentoMedio);
      if (isNaN(rend) || rend < 0 || rend > 1) return jsonOut({ ok: false, erro: 'rendimento médio inválido (use fração 0-1): ' + e.parameter.rendimentoMedio });
      dm.getRange('M18').setValue(rend);
    }

    return jsonOut({ ok: true });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}
