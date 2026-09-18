/**
 * MeusAtivos.gs — handler novo pra grade "Meus Ativos" da Início (e,
 * mais pra frente, Carteiras/Detalhe do Ativo, que reaproveitam o
 * mesmo consolidado). Ações/FIIs/Ações EUA vêm da aba "Auxiliar_ativos"
 * (uma linha por ativo, populada por fórmula — ver docs/Auxiliar_ativos.xlsx,
 * uma planilha pronta pra importar como aba nova: no Sheets, Arquivo >
 * Importar > selecionar o arquivo > "Inserir nova(s) planilha(s)" — as
 * fórmulas (gravadas em inglês dentro do .xlsx) já chegam traduzidas pro
 * pt-BR sozinhas). Renda Fixa não precisa de aba auxiliar — lê direto de
 * "Carteira Renda Fixa", que já é fonte única.
 *
 * Câmbio de Ações EUA: reaproveita 'Distribuição e Metas'!K56, mesma
 * célula que o Home.gs já usa — não existe coluna BRL na planilha.
 *
 * Variação dia de Renda Fixa (12/09/2026): não existe como coluna em
 * Carteira Renda Fixa, então é calculada comparando os 2 últimos dias de
 * aux_historico-renda-fixa. O pareamento entre as duas abas NÃO pode ser
 * por "Tipo de Investimento" cru (ex.: "Tesouro Selic (LFT)"), porque
 * esse texto não inclui o ano e várias posições compartilham o mesmo
 * Tipo — usamos a MESMA chave que BackfillRendaFixa.gs já usa pra achar
 * a Classificação de cada posição histórica: ano do Vencimento +
 * Instituição (normalizada) + Indexador, ou "LCI|Instituição" pra
 * LCI/LCA (ver classificarPosicaoRF_/montarMapaClassificacaoRF_ nesse
 * arquivo — mesma ideia, chave em formato compatível). Se uma posição
 * não tiver histórico ainda (recém-cadastrada) ou a chave não bater,
 * volta null — nunca inventa número.
 *
 * Otimização de 12/09/2026 (lentidão de ~30-60s na ação "home"):
 * montarMeusAtivos_/montarVariacoesDiaRF_ agora aceitam um parâmetro
 * opcional dadosRendaFixaCache (linhas já lidas de
 * aux_historico-renda-fixa), pra não ler essa aba de novo quando
 * handleHome (Home.gs) já leu uma vez pra passar também pra
 * montarSerieHistoricoInicio_ (HistoricoInicio.gs) — as duas usavam a
 * MESMA aba, cada uma lendo por conta própria. Chamando essa função
 * sozinha (ação "meusAtivos" via Router.gs) continua igual, sem passar
 * nada — só lê a aba ela mesma (ver lerLinhasHistoricoRendaFixa_, em
 * BackfillRendaFixa.gs).
 *
 * Otimização de 12/09/2026 #2: montarVariacoesDiaRF_ parou de chamar
 * Utilities.formatDate direto (uma vez por LINHA de
 * aux_historico-renda-fixa — pode ser milhares) e passou a usar
 * chaveDiaISOInicio_ (HistoricoInicio.gs), que cacheia o formatador — ver
 * "Otimização #3" no cabeçalho de HistoricoInicio.gs pro raciocínio
 * completo (Utilities.formatDate é uma chamada de serviço do Apps Script,
 * cara em volume alto; Intl.DateTimeFormat, criado uma vez, é JS puro).
 *
 * 13/09/2026: handleMeusAtivos(e, auth) passou a receber "auth" já
 * validado pelo Router, em vez de chamar verificarToken() de novo aqui
 * dentro (mesmo ajuste feito em Home.gs/HistoricoInicio.gs). E o
 * vencimento (MM/yyyy) de cada posição de RF trocou o
 * Utilities.formatDate direto por formatarMesAnoAtivos_ (mesmo padrão
 * cacheado) — aqui o volume é baixo (uma linha por posição de RF, ~9-15),
 * mas a troca custa nada e mantém o projeto inteiro consistente.
 */

var ABA_AUXILIAR_ATIVOS = 'Auxiliar_ativos';
var ABA_CARTEIRA_RF_MEUSATIVOS = 'Carteira Renda Fixa';
var LINHA_DADOS_CARTEIRA_RF_MEUSATIVOS = 9;

function handleMeusAtivos(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    return jsonOut({ ok: true, ativos: montarMeusAtivos_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'meusAtivos', erro: String(err) });
  }
}

function testarMeusAtivosDireto() {
  var ativos = montarMeusAtivos_();
  Logger.log('Total: ' + ativos.length);
  Logger.log(JSON.stringify(ativos, null, 2));
}

/** Roda só o cálculo de variação dia de RF, direto no editor, pra conferir as chaves batendo. */
function testarVariacoesDiaRfDireto() {
  Logger.log(JSON.stringify(montarVariacoesDiaRF_(), null, 2));
}

/**
 * @param {Array} dadosRendaFixaCache opcional — ver comentário no topo do
 *   arquivo e handleHome (Home.gs).
 */
function montarMeusAtivos_(dadosRendaFixaCache) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lista = [];

  // ---- Ações / FIIs / Ações EUA — via Auxiliar_ativos ----
  var abaAux = ss.getSheetByName(ABA_AUXILIAR_ATIVOS);
  if (!abaAux) throw new Error('aba não encontrada: ' + ABA_AUXILIAR_ATIVOS);
  var ultimaLinhaAux = abaAux.getLastRow();
  if (ultimaLinhaAux >= 2) {
    var cambioUsd = Number(ss.getSheetByName('Distribuição e Metas').getRange('K56').getValue()) || 0;
    var dados = abaAux.getRange(2, 1, ultimaLinhaAux - 1, 15).getValues();
    dados.forEach(function (linha) {
      var ticker = linha[1];
      if (!ticker) return; // linha em branco no fim da aba

      var classeBruta = linha[0]; // 'Ações' | 'FIIs' | 'Ações EUA'
      var classe = classeBruta === 'Ações' ? 'acoes' : classeBruta === 'FIIs' ? 'fiis' : 'usa';
      var viesBruto = linha[10];

      var item = {
        classe: classe,
        ticker: ticker,
        nome: linha[2] || null,
        tipo: linha[3] || null, // só FIIs (Tijolo/Papel/Híbrido)
        moeda: linha[4],
        precoAtual: numeroOuNulo_(linha[5]),
        variacaoDia: numeroOuNulo_(linha[6]),
        quantidade: numeroOuNulo_(linha[7]),
        precoMedio: numeroOuNulo_(linha[8]),
        precoTeto: numeroOuNulo_(linha[9]),
        vies: viesBruto === 'Comprar' ? 'comprar' : (viesBruto === 'Aguardar' ? 'aguardar' : null),
        pVp: numeroOuNulo_(linha[11]),
        descontoPVp: linha[12] || null, // texto pronto tipo "173% (1,73 P/VP)"
        pL: numeroOuNulo_(linha[13]),   // só Ações BR — Ações EUA não tem P/L na planilha hoje
        descontoPL: linha[14] || null   // idem
      };

      if (classe === 'usa' && cambioUsd) {
        if (item.precoAtual != null) item.precoAtualBRL = arredondarMeusAtivos_(item.precoAtual * cambioUsd);
        if (item.precoMedio != null) item.precoMedioBRL = arredondarMeusAtivos_(item.precoMedio * cambioUsd);
        if (item.precoTeto != null) item.precoTetoBRL = arredondarMeusAtivos_(item.precoTeto * cambioUsd);
      }

      lista.push(item);
    });
  }

  // ---- Renda Fixa — direto da Carteira Renda Fixa (já é fonte única) ----
  var abaRF = ss.getSheetByName(ABA_CARTEIRA_RF_MEUSATIVOS);
  if (!abaRF) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF_MEUSATIVOS);
  var variacoesRF = montarVariacoesDiaRF_(dadosRendaFixaCache);
  var ultimaLinhaRF = abaRF.getLastRow();
  if (ultimaLinhaRF >= LINHA_DADOS_CARTEIRA_RF_MEUSATIVOS) {
    // 18/09/2026: Tiago inseriu uma coluna nova ("Nome") logo depois de
    // Marca (nova coluna C) em Carteira Renda Fixa — todo o resto (Tipo
    // de Investimento em diante) deslocou 1 posição pra direita. Faixa
    // de leitura cresceu de 11 pra 12 colunas (A até L, pra alcançar
    // Valor Atualizado que virou L) e os índices abaixo foram todos
    // corrigidos pra bater com o novo layout real da aba.
    var dadosRF = abaRF.getRange(
      LINHA_DADOS_CARTEIRA_RF_MEUSATIVOS, 1,
      ultimaLinhaRF - LINHA_DADOS_CARTEIRA_RF_MEUSATIVOS + 1, 12
    ).getValues();
    dadosRF.forEach(function (linha, i) {
      var codigo = linha[0];
      var tipoInvestimento = linha[3];
      if (!codigo && !tipoInvestimento) return; // linha em branco no fim da aba

      var marca = linha[1];       // 'Renda Emergencial' | 'Renda Fixa' (a nossa "Longo Prazo")
      var nome = linha[2] || null; // C: Nome personalizado (coluna nova, 18/09/2026)
      var indexador = linha[4];
      var instituicao = linha[5]; // Instituição (mesma coluna que Transações Renda Fixa usa)
      var vencimento = linha[10];
      var vencimentoTexto = vencimento instanceof Date
        ? formatarMesAnoAtivos_(vencimento)
        : (vencimento || null);

      var instituicaoNorm = normalizarInstituicaoRF_(instituicao);
      var chaveVariacao = chaveVariacaoRF_(tipoInvestimento, instituicaoNorm, indexador, vencimento);

      lista.push({
        classe: 'rf',
        // Código se repete entre linhas (a mesma posição pode estar
        // dividida entre Renda Emergencial e Longo Prazo) — o par
        // tipo+marca+vencimento é o que realmente identifica o cartão.
        // Continua usando tipoInvestimento (não nome) pro título do
        // cartão de propósito — troca de exibição fica pra quando o
        // Tiago confirmar (ver conversa de 18/09/2026); nome já vai
        // no payload pra quem quiser usar.
        ticker: (tipoInvestimento || codigo) + (vencimentoTexto ? ' · ' + vencimentoTexto : ''),
        codigo: codigo || null,
        nome: nome,
        marca: marca === 'Renda Emergencial' ? 'emergencial' : 'longo-prazo',
        tipoInvestimento: tipoInvestimento || null,
        indexador: indexador || null,
        quantidade: numeroOuNulo_(linha[6]),
        vencimento: vencimentoTexto,
        valorAtualizado: numeroOuNulo_(linha[11]),
        variacaoDia: (chaveVariacao && chaveVariacao in variacoesRF) ? variacoesRF[chaveVariacao] : null,
        moeda: 'R$'
      });
    });
  }

  return lista;
}

/**
 * Compara os 2 últimos dias de aux_historico-renda-fixa por posição,
 * agrupando pela MESMA chave (ano+instituição+indexador, ou
 * LCI|instituição) que BackfillRendaFixa.gs usa pra classificar — não
 * pelo texto cru do Produto, que pode se repetir entre posições
 * diferentes na mesma instituição (por isso soma por dia dentro da
 * chave antes de comparar, em vez de pegar só a última linha bruta).
 * Devolve { chave: variação (fração, ex.: 0.0012) }.
 *
 * @param {Array} dadosRendaFixaCache opcional — linhas já lidas de
 *   aux_historico-renda-fixa (ver comentário no topo do arquivo).
 */
function montarVariacoesDiaRF_(dadosRendaFixaCache) {
  var linhas = dadosRendaFixaCache || lerLinhasHistoricoRendaFixa_();
  if (!linhas.length) return {};

  var porChaveEDia = {}; // chave -> { 'yyyy-MM-dd': soma valor }

  linhas.forEach(function (linha) {
    var data = linha[0];
    if (!(data instanceof Date)) return;
    var produto = linha[1];
    var instituicao = linha[2]; // já normalizada, gravada pelo próprio backfill
    var indexador = linha[3];
    var valor = Number(linha[5]) || 0;

    var chave = chaveVariacaoRF_(produto, instituicao, indexador, null);
    if (!chave) return;

    // chaveDiaISOInicio_ (HistoricoInicio.gs) em vez de Utilities.formatDate
    // direto — mesmo formato ('yyyy-MM-dd'), mas com o formatador
    // Intl.DateTimeFormat cacheado, sem repetir a chamada de serviço a
    // cada linha (ver "Otimização #3" no cabeçalho de HistoricoInicio.gs;
    // essa aba pode ter milhares de linhas).
    var diaIso = chaveDiaISOInicio_(data);
    if (!porChaveEDia[chave]) porChaveEDia[chave] = {};
    porChaveEDia[chave][diaIso] = (porChaveEDia[chave][diaIso] || 0) + valor;
  });

  var variacoes = {};
  Object.keys(porChaveEDia).forEach(function (chave) {
    var dias = Object.keys(porChaveEDia[chave]).sort();
    if (dias.length < 2) return; // posição nova, só 1 dia de histórico ainda
    var valorUltimo = porChaveEDia[chave][dias[dias.length - 1]];
    var valorPenultimo = porChaveEDia[chave][dias[dias.length - 2]];
    if (!valorPenultimo) return;
    variacoes[chave] = arredondarVariacaoRF_((valorUltimo - valorPenultimo) / valorPenultimo);
  });
  return variacoes;
}

/**
 * Monta a chave de cruzamento entre Carteira Renda Fixa e
 * aux_historico-renda-fixa. Duas formas de chamar:
 *  - a partir de uma linha da Carteira: passa tipoInvestimento,
 *    instituicaoNormalizada, indexador e o objeto Date de vencimento.
 *  - a partir de uma linha do histórico: passa produto (texto cru, ex.
 *    "Tesouro Selic 2029"), instituicaoNormalizada, indexador e null no
 *    lugar do vencimento — o ano sai do próprio texto do produto (regex),
 *    igual classificarPosicaoRF_ já faz em BackfillRendaFixa.gs.
 */
function chaveVariacaoRF_(textoOuTipo, instituicaoNorm, indexador, vencimento) {
  var indexadorNorm = String(indexador || '').toUpperCase().trim();
  if (/lci|lca/i.test(String(textoOuTipo || ''))) {
    return 'LCI|' + instituicaoNorm;
  }
  var ano = null;
  if (vencimento instanceof Date) {
    ano = vencimento.getFullYear();
  } else {
    var match = String(textoOuTipo || '').match(/(\d{4})/);
    if (match) ano = match[1];
  }
  if (!ano) return null;
  return ano + '|' + instituicaoNorm + '|' + indexadorNorm;
}

function arredondarVariacaoRF_(n) {
  return Math.round(n * 10000) / 10000;
}

// Cacheado (lazy) — mesmo padrão de chaveDiaISOInicio_ (HistoricoInicio.gs)
// e formatarDataBcbRF_ (BackfillRendaFixa.gs): Utilities.formatDate cruza pro
// backend do Apps Script a cada chamada, então mesmo um volume baixo (essa
// função roda no máximo 1x por posição de Renda Fixa, ~9-15 linhas) ganha em
// criar o Intl.DateTimeFormat uma vez só e reaproveitar, em vez de reservar
// uma exceção "porque o volume é pequeno" — consistente com o resto do
// projeto (ver "corrija tudo... performance prioridade em todos os fluxos").
var _formatadorMesAnoAtivos_;
function formatarMesAnoAtivos_(data) {
  if (!_formatadorMesAnoAtivos_) {
    _formatadorMesAnoAtivos_ = new Intl.DateTimeFormat('pt-BR', {
      timeZone: Session.getScriptTimeZone(), month: '2-digit', year: 'numeric'
    });
  }
  return _formatadorMesAnoAtivos_.format(data); // "MM/yyyy" (pt-BR formata mês/ano assim)
}

function numeroOuNulo_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function arredondarMeusAtivos_(n) {
  return Math.round(n * 100) / 100;
}
