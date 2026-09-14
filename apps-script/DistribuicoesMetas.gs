/**
 * DistribuicoesMetas.gs — ação "distribuicoesMetas" (doGet) e as 2 ações
 * de escrita de Metas da Carteira (doPost): salvarMetaRendaPassiva e
 * salvarMetaPatrimonio.
 *
 * 14/09/2026: primeira fatia construída é só "Metas da Carteira" (Renda
 * Passiva, Patrimônio, Renda Emergencial) — Objetivos da Carteira e o
 * Radar de oportunidades (Ações/EUA/FIIs) ainda não entram aqui, entram
 * numa próxima rodada, dentro do mesmo action de leitura (ver TODOs em
 * handleDistribuicoesMetas).
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

  // TODO (próxima rodada): resposta.objetivos = montarObjetivosCarteira_();
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
