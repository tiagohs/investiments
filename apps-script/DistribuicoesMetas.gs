/**
 * DistribuicoesMetas.gs — ação "distribuicoesMetas" (doGet) e as ações
 * de escrita de Metas da Carteira (doPost): salvarMetaRendaPassiva,
 * salvarMetaPatrimonio e salvarMesesRendaEmergencial.
 *
 * 14/09/2026: 1ª fatia foi só "Metas da Carteira" (Renda Passiva,
 * Patrimônio, Renda Emergencial). 2ª fatia (mesmo dia, ordem pedida pelo
 * Tiago: Objetivos da Carteira → Radar de oportunidades → Metas da
 * Carteira) adiciona `objetivos` — a distribuição desejada x atual por
 * classe de ativo. O Radar de oportunidades (tabelas Ações Nacionais/
 * EUA/FIIs com viés, preço-teto etc.) ainda não entra aqui — ver TODO em
 * handleDistribuicoesMetas.
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

  // TODO (próxima rodada): resposta.radar = montarRadarOportunidades_();

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
