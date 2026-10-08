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
 *     dados B34:G35 (+ H35/I35 pro valor em dólar da linha "Ações
 *     Internacionais" - ver a nota de 16/09/2026 mais abaixo), total
 *     (só carteiraAtual/novaCarteira/valorInvestir) em E36:G36.
 *     Editável (% desejado) grava C34:C35.
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
 *
 * 16/09/2026: `splitsInternos.acoes.itens` ganhou 2 colunas novas, H e
 * I (B34:I35 em vez de B34:G35) — só na linha "Ações Internacionais"
 * (B35). B:G daquela linha SEMPRE foi o valor já convertido pra reais
 * (precisa ser reais pra somar certo com "Dividendos" no total de
 * E36:G36) - o Tiago descobriu isso testando o app ("radar de
 * oportunidade continua mostrando reais") e criou H35 (carteira atual
 * em dólar, bruto, sem a conversão) e I35 (valor a investir em dólar)
 * na própria planilha pra resolver. "Dividendos" (B34) não tem H/I
 * preenchido de propósito - ver linhaParaObjeto_ em
 * montarSplitsInternos_ pra como isso vira carteiraAtualUsd/
 * valorInvestirUsd só no item que tem o dado.
 *
 * 06/10/2026 (Tiago: "Faz sentido os objetivos da carteira ser um tipo de
 * meta? E ser enviado para a tela de Metas e Objetivos?"; "dividendos -
 * renomearia para nacionais"): os blocos de Objetivos (B11:G13 e B19:G20) e a
 * distribuição desejada de Ações (B34:G35) e FIIs viraram UMA meta,
 * "Distribuição da carteira" (tipo 'distribuicaoCarteira' em aux_metas). O
 * site é a fonte da verdade: ao salvar a meta, Metas.gs chama
 * gravarPesosPlanilhaDistribuicao_ (aqui, no fim do arquivo) e os % vão pras
 * mesmas células de sempre (as fórmulas da planilha seguem iguais). A resposta
 * de `distribuicoesMetas` ganha `metaDistribuicao` (a meta; criada na 1ª
 * leitura a partir dos % da planilha, idempotente). Funções novas:
 * normalizarPesosDistribuicao_, lerPesosPlanilhaDistribuicao_,
 * gravarPesosPlanilhaDistribuicao_, garantirMetaDistribuicao_,
 * montarDistribuicaoAtual_. As ações salvarObjetivosCarteira/
 * salvarSplitInterno continuam existindo (compatibilidade), mas a tela não
 * chama mais.
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

  // 06/10/2026: os objetivos da carteira viraram a meta "Distribuição da carteira" (Metas e Objetivos). 1ª leitura sem
  // a meta = ela nasce dos % da planilha (garantirMetaDistribuicao_, idempotente).
  try {
    resposta.metaDistribuicao = garantirMetaDistribuicao_(SpreadsheetApp.getActiveSpreadsheet(), new Date());
  } catch (err) {
    avisos.metaDistribuicao = String(err);
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

function montarMetasCarteira_(opcoes) {
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
  // 25/09/2026 (Tiago viu a média daqui diferente da tela Proventos): a
  // fórmula da planilha (V12, Aux_dash_Proventos) só enxerga a aba
  // Proventos - sem os dividendos em dólar. Agora a média sai da MESMA lista
  // da tela Proventos (todas as carteiras, 12 últimos meses fechados - ver
  // Proventos.gs!mediaRendaPassiva12Meses_); só a meta (U12) continua vindo
  // da planilha. Se a conta falhar, fica o valor da planilha.
  try {
    var telaProventos = montarTelaProventosComCache_();
    // 05/10/2026 (A-17): mesma base da tela Proventos (lançados + pagos
    // presumidos pela data) e rótulo/separação confirmado x presumido junto
    var media = mediaRendaPassiva12Meses_(recebidosComPresumidos_(telaProventos), telaProventos.hoje);
    rendaPassiva.mediaUlt12Meses = media.media;
    rendaPassiva.mesesMedia = { inicio: media.inicio, fim: media.fim, rotulo: media.rotulo };
    rendaPassiva.total12Meses = media.total;
    rendaPassiva.confirmado12Meses = media.confirmado;
    rendaPassiva.presumido12Meses = media.presumido;
    var meta = Number(rendaPassiva.meta);
    rendaPassiva.percentualAtingido = meta > 0 ? media.media / meta : '';
  } catch (erroMedia) {
    console.log('montarMetasCarteira_: média de Renda Passiva pela planilha (' + erroMedia + ')');
  }

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
  var carteiraBrutaRendaEmergencial = dm.getRange('E19').getValue();
  // 05/10/2026 (A-10): E19 é BRUTO (sem IR/IOF), enquanto a engine de Metas e a
  // Carteira RF medem a reserva pelo LÍQUIDO (o que ele realmente resgata). Agora
  // o % atingido e o "atingida" usam o líquido (E19 - IR/IOF estimados por
  // Metas.gs!impostoReservaMetas_); sem a estimativa, fica o bruto e o front rotula.
  var impostoRendaEmergencial = null;
  if (!(opcoes && opcoes.semReserva)) {
    try { impostoRendaEmergencial = impostoReservaMetas_(opcoes && opcoes.ativos ? opcoes.ativos : ativosParaMetas_(ss)); } catch (eImp) { impostoRendaEmergencial = null; }
  }
  var temLiquidoRendaEmergencial = typeof carteiraBrutaRendaEmergencial === 'number' && typeof impostoRendaEmergencial === 'number';
  var carteiraAtualRendaEmergencial = temLiquidoRendaEmergencial
    ? Math.round(Math.max(0, carteiraBrutaRendaEmergencial - impostoRendaEmergencial) * 100) / 100
    : carteiraBrutaRendaEmergencial;
  var rendaEmergencial = {
    mediaGastos: mediaGastos,
    meses: meses,
    meta: metaRendaEmergencial,
    carteiraAtual: carteiraAtualRendaEmergencial,
    carteiraBruta: carteiraBrutaRendaEmergencial,
    impostoEstimado: temLiquidoRendaEmergencial ? impostoRendaEmergencial : null,
    base: temLiquidoRendaEmergencial ? 'liquido' : 'bruto',
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

  // 07/10/2026 (Tiago: fundo guardado pra chácara): a planilha enxerga o título 'Objetivo' como Renda Fixa de longo prazo; no site a base
  // da distribuição NÃO conta o que está reservado pra objetivos (pesos, "% atual" e "aporte que falta" saem sem ele).
  var reservado = 0;
  try { reservado = Number(somarCarteiraRendaFixaPorDestino_(ss).objetivo) || 0; } catch (eRes) { reservado = 0; }
  if (reservado > 0.005) descontarObjetivosDosBlocos_(alocacaoGeral, alocacaoRendaFixa, reservado);

  return { alocacaoGeral: alocacaoGeral, alocacaoRendaFixa: alocacaoRendaFixa, reservadoObjetivos: Math.round(reservado * 100) / 100 };
}

/**
 * 07/10/2026: tira `reservado` (R$ de Renda Fixa 'objetivo') da Renda Fixa dos 2 blocos de "Objetivos da Carteira" e refaz o que a
 * planilha deriva dela (mesma conta das fórmulas B11:G14 e B19:G21, conferida nos dados reais: o total ideal é o MAIOR "atual / peso"
 * - só se compra, nunca se vende -, nova carteira = peso x total ideal, R$ investir = nova - atual). Linha "Renda Emergencial" do 2º
 * bloco: nova carteira e R$ investir continuam os da planilha (vêm da meta da reserva).
 */
function descontarObjetivosDosBlocos_(alocacaoGeral, alocacaoRendaFixa, reservado) {
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : 0; };
  var tiposG = alocacaoGeral.tipos;
  var rfG = tiposG.filter(function (t) { return /renda fixa/i.test(String(t.tipo || '')); })[0] || tiposG[2];
  if (rfG) rfG.carteiraAtual = Math.max(0, num(rfG.carteiraAtual) - reservado);
  var totalG = 0; tiposG.forEach(function (t) { totalG += num(t.carteiraAtual); });
  var ideal = 0;
  tiposG.forEach(function (t) { if (num(t.percentualDesejado) > 0) ideal = Math.max(ideal, num(t.carteiraAtual) / t.percentualDesejado); });
  if (!(ideal > 0)) ideal = totalG;
  var novaG = 0, investirG = 0;
  tiposG.forEach(function (t) {
    t.percentualAtual = totalG > 0 ? num(t.carteiraAtual) / totalG : 0;
    t.novaCarteira = num(t.percentualDesejado) > 0 ? t.percentualDesejado * ideal : num(t.carteiraAtual);
    t.valorInvestir = t.novaCarteira - num(t.carteiraAtual);
    novaG += t.novaCarteira; investirG += t.valorInvestir;
  });
  alocacaoGeral.total = { carteiraAtual: r2(totalG), novaCarteira: r2(novaG), valorInvestir: r2(investirG) };

  var tiposR = alocacaoRendaFixa.tipos;
  var longo = tiposR.filter(function (t) { return !/emergenc/i.test(String(t.tipo || '')); })[0] || tiposR[1];
  if (longo) {
    longo.carteiraAtual = Math.max(0, num(longo.carteiraAtual) - reservado);
    if (rfG) { longo.novaCarteira = rfG.novaCarteira; longo.valorInvestir = rfG.novaCarteira - longo.carteiraAtual; }
  }
  var totalR = 0, novaR = 0, investirR = 0;
  tiposR.forEach(function (t) { totalR += num(t.carteiraAtual); });
  tiposR.forEach(function (t) {
    t.percentualAtual = totalR > 0 ? num(t.carteiraAtual) / totalR : 0;
    novaR += num(t.novaCarteira); investirR += num(t.valorInvestir);
  });
  alocacaoRendaFixa.total = { carteiraAtual: r2(totalR), novaCarteira: r2(novaR), valorInvestir: r2(investirR) };
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
  // 05/10/2026 (A-34 da auditoria): antes era 1 getRange().getValue() por
  // CÉLULA (~500 chamadas por abertura da tela, mesmo com tudo em cache).
  // Agora lê em pedaços de LINHAS_PEDACO_RADAR_ linhas, só das colunas
  // usadas (da menor à maior), com 1 getValues por pedaço - normalmente 1
  // chamada por bloco. O resultado é idêntico ao da leitura célula a
  // célula (para na primeira linha com Ativo vazio, que É a linha de total).
  var itens = [];
  var indices = {};
  var menor = 0, maior = 0;
  for (var campo in colunas) {
    var col = colunas[campo];
    if (!col) continue;
    var idx = indiceColunaRadar_(col);
    indices[campo] = idx;
    if (!menor || idx < menor) menor = idx;
    if (idx > maior) maior = idx;
  }
  var idxAtivo = indices.ativo;
  var maxLinhas = typeof sheet.getMaxRows === 'function' ? sheet.getMaxRows() : 0;
  var linha = primeiraLinha;
  var fim = false;
  while (!fim) {
    var qtd = LINHAS_PEDACO_RADAR_;
    if (maxLinhas) qtd = Math.min(qtd, maxLinhas - linha + 1);
    if (qtd <= 0) break;
    var pedaco = sheet.getRange(linha, menor, qtd, maior - menor + 1).getValues();
    for (var i = 0; i < pedaco.length; i++) {
      var valores = pedaco[i];
      if (!valores[idxAtivo - menor]) { fim = true; break; }
      var item = { linha: linha };
      for (var nome in colunas) {
        item[nome] = colunas[nome] ? valores[indices[nome] - menor] : null;
      }
      itens.push(item);
      linha++;
    }
  }
  return { itens: itens, linhaTotal: linha };
}

/** Linhas lidas por chamada em lerBlocoRadar_ (os blocos do Radar têm ~10-25 linhas). */
var LINHAS_PEDACO_RADAR_ = 40;

/** 'B' -> 2, 'S' -> 19, 'AA' -> 27 (índice 1-based da coluna). */
function indiceColunaRadar_(letras) {
  var n = 0;
  var s = String(letras).toUpperCase();
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
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
function lerMapaCarteiraPorTicker_(sheet, colTicker, colVariacao, colSegmento, colQuantidade) {
  var mapa = {};
  if (!sheet) return mapa;
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 9) return mapa;
  var numCols = Math.max(colTicker, colVariacao, colSegmento || 0, colQuantidade || 0);
  var valores = sheet.getRange(9, 1, ultimaLinha - 9 + 1, numCols).getValues();
  for (var i = 0; i < valores.length; i++) {
    var linha = valores[i];
    var ticker = linha[colTicker - 1];
    if (!ticker) continue;
    mapa[ticker] = {
      variacaoDia: linha[colVariacao - 1],
      segmento: colSegmento ? linha[colSegmento - 1] : null,
      // 08/10/2026: "Quantidade de cotas" - pra conta de quantas cotas comprar pra ficar no lucro (preco-medio-lucro.js)
      quantidade: colQuantidade ? linha[colQuantidade - 1] : null
    };
  }
  return mapa;
}

/** Copia variacaoDia/segmento/quantidade (quando existir) do mapa pra cada item, por ticker (item.ativo). */
function enriquecerRadarComCarteira_(itens, mapa) {
  itens.forEach(function (item) {
    var info = mapa[item.ativo];
    item.variacaoDia = info && typeof info.variacaoDia === 'number' ? info.variacaoDia : null;
    if (info && info.segmento) item.segmento = info.segmento;
    item.quantidade = info && typeof info.quantidade === 'number' && info.quantidade > 0 ? info.quantidade : null;
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

  // 26/09/2026: linha inicial de cada bloco achada pelo cabeçalho (Planilha.gs) -
  // adicionar um ativo insere linha no Radar e empurra os blocos de baixo
  var local = localDistribuicaoMetas_(dm);
  var nacionais = lerBlocoRadar_(dm, local.radarAcoes, colunasNacionais);
  var internacionais = lerBlocoRadar_(dm, local.radarUsa, colunasInternacionais);
  var fiis = lerBlocoRadar_(dm, local.radarFiis, colunasFiis);

  // quantidade: G nas abas de Ações (BR e USA), E na de FIIs
  var mapaAcoes = lerMapaCarteiraPorTicker_(ss.getSheetByName('Carteira Ações'), 1, 11, 6, 7);
  var mapaAcoesUsa = lerMapaCarteiraPorTicker_(ss.getSheetByName('Carteira Ações USA'), 1, 11, 6, 7);
  var mapaFiis = lerMapaCarteiraPorTicker_(ss.getSheetByName('Carteira FIIs'), 1, 9, 4, 5);
  enriquecerRadarComCarteira_(nacionais.itens, mapaAcoes);
  enriquecerRadarComCarteira_(internacionais.itens, mapaAcoesUsa);
  enriquecerRadarComCarteira_(fiis.itens, mapaFiis);
  // 03/10/2026: resumo dos fundamentos por item (Fundamentos.gs - só lê a aba
  // aux_fundamentos, 1 leitura pros 3 blocos) pro motor de critérios do Radar
  if (typeof anexarFundamentosAoRadar_ === 'function') {
    try {
      anexarFundamentosAoRadar_(ss, [
        { classe: 'acoes', itens: nacionais.itens }, { classe: 'acoesEua', itens: internacionais.itens }, { classe: 'fiis', itens: fiis.itens }
      ]);
    } catch (eFund) { /* sem fundamentos: o Radar segue só com a planilha */ }
  }

  function total_(linhaTotal, colCarteiraAtual, colNovaCarteira, colValorInvestir) {
    // 05/10/2026 (A-34): 1 leitura da linha de total (A:S) em vez de 3 getValue
    var linhaVal = dm.getRange(linhaTotal, 1, 1, 19).getValues()[0];
    return {
      carteiraAtual: linhaVal[indiceColunaRadar_(colCarteiraAtual) - 1],
      novaCarteira: linhaVal[indiceColunaRadar_(colNovaCarteira) - 1],
      valorInvestir: linhaVal[indiceColunaRadar_(colValorInvestir) - 1]
    };
  }

  return {
    acoesNacionais: { itens: nacionais.itens, total: total_(nacionais.linhaTotal, 'N', 'Q', 'S') },
    acoesInternacionais: { itens: internacionais.itens, total: total_(internacionais.linhaTotal, 'M', 'N', 'Q') },
    fiis: { itens: fiis.itens, total: total_(fiis.linhaTotal, 'M', 'N', 'Q') },
    cotacaoDolar: dm.getRange(local.dolar).getValue()
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
    var obj = {
      tipo: linha[0],
      percentualDesejado: linha[1],
      percentualAtual: linha[2],
      carteiraAtual: linha[3],
      novaCarteira: linha[4],
      valorInvestir: linha[5]
    };
    // 16/09/2026: colunas H/I novas, só na linha "Ações Internacionais"
    // (B35) - o Tiago criou na planilha com o valor BRUTO em dólar de
    // carteira atual/valor a investir (H35/I35), sem a conversão pra
    // reais que B:G já tem (necessária pra somar com "Dividendos" no
    // total - por isso B:G continua em reais, sem mudar). "Dividendos"
    // (B34) não tem H/I preenchido, então essas 2 chaves só aparecem no
    // item que realmente tem o dado - linhaParaObjeto_ é a mesma função
    // usada pra FIIs (B73:G75, só 6 colunas, sem H/I) - linha[6]/[7] lá
    // vêm undefined, então o if abaixo nunca adiciona nada nesse caso.
    if (typeof linha[6] === 'number') obj.carteiraAtualUsd = linha[6];
    if (typeof linha[7] === 'number') obj.valorInvestirUsd = linha[7];
    return obj;
  }

  var linhasAcoes = dm.getRange('B34:I35').getValues();
  var totalAcoes = dm.getRange('E36:G36').getValues()[0];
  var acoes = {
    itens: linhasAcoes.map(linhaParaObjeto_),
    total: { carteiraAtual: totalAcoes[0], novaCarteira: totalAcoes[1], valorInvestir: totalAcoes[2] }
  };

  var linhaFiis = localDistribuicaoMetas_(dm).objetivosFiis; // 26/09/2026: era fixo em 73
  var linhasFiis = dm.getRange('B' + linhaFiis + ':G' + (linhaFiis + 2)).getValues();
  var totalFiis = dm.getRange('E' + (linhaFiis + 3) + ':G' + (linhaFiis + 3)).getValues()[0];
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
    acoesInternacional: link_(localDistribuicaoMetas_(dm).linkUsa),
    fiis: link_(localDistribuicaoMetas_(dm).linkFiis)
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
    // 26/09/2026: 1ª linha do bloco pelo cabeçalho (ver Planilha.gs)
    var localRadar = localDistribuicaoMetas_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Distribuição e Metas'));
    cols.primeiraLinha = { acoesNacionais: localRadar.radarAcoes, acoesInternacionais: localRadar.radarUsa, fiis: localRadar.radarFiis }[tabela];

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
      var linhaObj = localDistribuicaoMetas_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Distribuição e Metas')).objetivosFiis;
      range = 'C' + linhaObj + ':C' + (linhaObj + 2); // era C73:C75 (26/09/2026)
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

// ---------------------------------------------------------------------------
// 06/10/2026 (Tiago: "faz sentido os objetivos da carteira ser um tipo de
// meta? E ser enviado para a tela de Metas e Objetivos?"): a distribuição
// desejada da carteira virou a meta "Distribuição da carteira"
// (tipo 'distribuicaoCarteira' em aux_metas - Metas.gs). O SITE é a fonte da
// verdade dos %: a meta guarda os pesos e, a cada salvamento, eles são
// gravados nas células da planilha de onde as fórmulas leem (nada de fórmula
// mudou lá). Células (aba "Distribuição e Metas"), as mesmas de sempre:
//   grupos (Ações Nacionais e Internacionais / FIIs / Renda Fixa)  C11:C13
//   Renda Fixa (Renda Emergencial / Renda Fixa)                    C19:C20
//   Ações (Dividendos = "Nacionais" / Ações Internacionais)        C34:C35
//   FIIs (Tijolo / Papel / Híbrido - pelo rótulo da coluna B)      C73:C75
//         (1ª linha achada pelo cabeçalho: localDistribuicaoMetas_)
// Na 1ª leitura sem nenhuma meta desse tipo (nem arquivada), a meta nasce dos
// % que estão na planilha (garantirMetaDistribuicao_ - idempotente).
// ---------------------------------------------------------------------------

var DM_TIPO_META_DISTRIBUICAO_ = 'distribuicaoCarteira';
var DM_GRUPOS_PESOS_ = {
  grupos: { rotulo: 'Ações, FIIs e Renda Fixa', chaves: ['acoes', 'fiis', 'rf'] },
  acoes: { rotulo: 'Ações (Nacionais e Internacionais)', chaves: ['nacionais', 'internacionais'] },
  fiis: { rotulo: 'FIIs (Tijolo, Híbrido e Papel)', chaves: ['tijolo', 'hibrido', 'papel'] },
  rf: { rotulo: 'Renda Fixa (Renda Emergencial e Renda Fixa)', chaves: ['emergencial', 'rendaFixa'] }
};
var DM_TOLERANCIA_SOMA_ = 0.0005; // 0,05 ponto percentual (arredondamento de 33,33 + 33,33 + 33,34)

/** Pesos (frações 0-1) validados: cada grupo soma 100%. Lança Error com o grupo que não fecha. */
function normalizarPesosDistribuicao_(pesos) {
  if (!pesos || typeof pesos !== 'object') throw new Error('informe os pesos da distribuição da carteira');
  var out = {};
  Object.keys(DM_GRUPOS_PESOS_).forEach(function (g) {
    var cfg = DM_GRUPOS_PESOS_[g];
    var bruto = pesos[g] && typeof pesos[g] === 'object' ? pesos[g] : {};
    var soma = 0;
    out[g] = {};
    cfg.chaves.forEach(function (k) {
      var n = bruto[k] === null || bruto[k] === undefined || bruto[k] === '' ? 0 : Number(bruto[k]);
      if (!isFinite(n) || n < 0 || n > 1) throw new Error('peso inválido em ' + cfg.rotulo + ' (' + k + '): use de 0% a 100%');
      n = Math.round(n * 10000) / 10000;
      out[g][k] = n;
      soma += n;
    });
    if (Math.abs(soma - 1) > DM_TOLERANCIA_SOMA_) throw new Error('os pesos de "' + cfg.rotulo + '" precisam somar 100% (soma atual: ' + Math.round(soma * 10000) / 100 + '%)');
  });
  return out;
}

function chaveFiiDistribuicao_(rotulo) {
  var t = String(rotulo || '').toLowerCase();
  if (/tijolo/.test(t)) return 'tijolo';
  if (/papel/.test(t)) return 'papel';
  if (/h[ií]brid/.test(t)) return 'hibrido';
  return null;
}

/** Os % desejados que estão hoje na planilha, no formato `especificos.pesos` da meta (sem validar a soma). */
function lerPesosPlanilhaDistribuicao_(ss) {
  var dm = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
  var n = function (v) { return typeof v === 'number' && isFinite(v) ? v : 0; };
  var geral = dm.getRange('C11:C13').getValues();
  var rf = dm.getRange('C19:C20').getValues();
  var acoes = dm.getRange('C34:C35').getValues();
  var linhaFiis = localDistribuicaoMetas_(dm).objetivosFiis;
  var fiisLinhas = dm.getRange('B' + linhaFiis + ':C' + (linhaFiis + 2)).getValues();
  var fiis = { tijolo: 0, hibrido: 0, papel: 0 };
  fiisLinhas.forEach(function (l, i) {
    var chave = chaveFiiDistribuicao_(l[0]) || ['tijolo', 'papel', 'hibrido'][i];
    fiis[chave] = n(l[1]);
  });
  return {
    grupos: { acoes: n(geral[0][0]), fiis: n(geral[1][0]), rf: n(geral[2][0]) },
    acoes: { nacionais: n(acoes[0][0]), internacionais: n(acoes[1][0]) },
    fiis: fiis,
    rf: { emergencial: n(rf[0][0]), rendaFixa: n(rf[1][0]) }
  };
}

/**
 * Grava os pesos da meta nas células da planilha (as fórmulas de % atual / R$ investir dependem delas).
 * Valida de novo (soma 100% em cada grupo) antes de escrever qualquer célula.
 */
function gravarPesosPlanilhaDistribuicao_(ss, pesos) {
  var p = normalizarPesosDistribuicao_(pesos);
  var dm = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
  var col = function (lista) { return lista.map(function (v) { return [v]; }); };
  var linhaFiis = localDistribuicaoMetas_(dm).objetivosFiis;
  var rotulosFiis = dm.getRange('B' + linhaFiis + ':B' + (linhaFiis + 2)).getValues();
  var ordemFiis = ['tijolo', 'papel', 'hibrido'];
  var valoresFiis = rotulosFiis.map(function (l, i) { return [p.fiis[chaveFiiDistribuicao_(l[0]) || ordemFiis[i]]]; });
  dm.getRange('C11:C13').setValues(col([p.grupos.acoes, p.grupos.fiis, p.grupos.rf]));
  dm.getRange('C19:C20').setValues(col([p.rf.emergencial, p.rf.rendaFixa]));
  dm.getRange('C34:C35').setValues(col([p.acoes.nacionais, p.acoes.internacionais]));
  dm.getRange('C' + linhaFiis + ':C' + (linhaFiis + 2)).setValues(valoresFiis);
  return p;
}

/** A meta de distribuição (ativa) e se existe alguma (inclusive arquivada) - 1 leitura só da aba aux_metas. */
function acharMetaDistribuicao_(ss) {
  var doTipo = lerLinhasMetas_(ss).filter(function (x) { return x.meta.tipo === DM_TIPO_META_DISTRIBUICAO_; });
  var ativa = doTipo.filter(function (x) { return x.meta.status !== 'arquivada'; })[0] || null;
  if (ativa) ativa.meta.atualizadoEm = ativa.atualizadoEm;
  return { ativa: ativa ? ativa.meta : null, existe: doTipo.length > 0 };
}

/**
 * Migração automática e idempotente: se não existe nenhuma meta "Distribuição da carteira" (nem arquivada - arquivar é uma
 * decisão dele), cria uma a partir dos % da planilha. Devolve a meta ativa (ou null). Nunca regrava a planilha aqui.
 */
function garantirMetaDistribuicao_(ss, agora) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var achada = acharMetaDistribuicao_(ss);
  if (achada.existe) return achada.ativa;
  var pesos = normalizarPesosDistribuicao_(lerPesosPlanilhaDistribuicao_(ss)); // planilha com soma errada: não cria (lança)
  var trava = travaRecurso_('metas', 'migrar objetivos da carteira');
  try { trava.waitLock(20000); } catch (eL) { return null; }
  try {
    achada = acharMetaDistribuicao_(ss); // outra chamada pode ter criado enquanto esperava a trava
    if (achada.existe) return achada.ativa;
    var r = salvarMeta_(ss, JSON.stringify({
      tipo: DM_TIPO_META_DISTRIBUICAO_, nome: 'Distribuição da carteira', status: 'ativa',
      notas: 'Criada a partir dos % que estavam na planilha (Distribuição e Metas).', especificos: { pesos: pesos }
    }), agora || new Date(), { semPlanilha: true });
    return r && r.ok ? r.meta : null;
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

/**
 * O "atual" da distribuição, como a planilha calcula (carteira atual em R$ de cada tipo), no mesmo formato dos blocos da tela de
 * Acompanhamento (objetivos + splitsInternos) - só rótulo e carteira atual (4 leituras: B:E de cada bloco). Quem compara com os
 * pesos da meta é o navegador (metas-distribuicao.js).
 */
function montarDistribuicaoAtual_() {
  var dm = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
  var tipos = function (a1) { return dm.getRange(a1).getValues().map(function (l) { return { tipo: l[0], carteiraAtual: l[3] }; }); };
  var linhaFiis = localDistribuicaoMetas_(dm).objetivosFiis;
  var geral = tipos('B11:E13');
  var rfBloco = tipos('B19:E20');
  // 07/10/2026: a base da distribuição não conta o que está 'Reservado para objetivos' (a planilha conta como longo prazo)
  try {
    var reservado = Number(somarCarteiraRendaFixaPorDestino_(SpreadsheetApp.getActiveSpreadsheet()).objetivo) || 0;
    if (reservado > 0.005) {
      var rfLinha = geral.filter(function (t) { return /renda fixa/i.test(String(t.tipo || '')); })[0] || geral[2];
      if (rfLinha && typeof rfLinha.carteiraAtual === 'number') rfLinha.carteiraAtual = Math.max(0, rfLinha.carteiraAtual - reservado);
      var longoLinha = rfBloco.filter(function (t) { return !/emergenc/i.test(String(t.tipo || '')); })[0] || rfBloco[1];
      if (longoLinha && typeof longoLinha.carteiraAtual === 'number') longoLinha.carteiraAtual = Math.max(0, longoLinha.carteiraAtual - reservado);
    }
  } catch (eRes) { /* sem o desconto: fica o que a planilha calcula */ }
  return {
    objetivos: { alocacaoGeral: { tipos: geral }, alocacaoRendaFixa: { tipos: rfBloco } },
    splitsInternos: { acoes: { itens: tipos('B34:E35') }, fiis: { itens: tipos('B' + linhaFiis + ':E' + (linhaFiis + 2)) } }
  };
}
