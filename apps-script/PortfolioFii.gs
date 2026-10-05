/**
 * PortfolioFii.gs - 05/10/2026 (Tiago, Ativos > FIIs: "queria incluir umas
 * novas informações importantes dos FIIs. Portfólio: qual o portfólio do
 * fundo; se for shopping, quais, a divisão disso. Quando é CRI, portfólio,
 * mas também se ele é IPCA ou CDI, qual porcentagem e valor... uma forma
 * inteligente, pra que não precise ficar buscando sempre... atualizar quando
 * tiver algo do tipo em fato relevante").
 *
 * O QUE A CVM (dados abertos) ENTREGA DE FATO - conferido em 05/10/2026:
 *  - inf_trimestral_fii_imovel: LISTA DE IMÓVEIS do fundo (nome, endereço
 *    livre, área, nº de unidades, % vacância, % inadimplência, % das receitas
 *    do fundo, classe: renda acabado / em construção / venda). NÃO tem
 *    coordenadas, nem cidade/UF separadas (saem do endereço, texto livre),
 *    nem o tipo do imóvel (shopping/galpão/laje) - o "segmento" daqui é
 *    ESTIMADO PELO NOME e marcado como tal.
 *  - inf_trimestral_fii_ativo: carteira de papéis e cotas por linha (Tipo:
 *    CRI/CRA, FII, Outras Cotas de FI, LCI/LCA, Ações de Sociedades...; Emissor,
 *    Emissão, Série, Valor). NÃO traz o indexador (IPCA/CDI) do CRI.
 *  - INDEXADOR DO CRI: vem de OUTRO conjunto aberto, o informe mensal das
 *    securitizadoras (SECURIT/DOC/INF_MENSAL_CRI e _CRA: classe -> Taxa_Juros,
 *    ex.: "IPCA + 7,0% a.a.", "100% CDI + 3%"). A ligação é pelo código CETIP
 *    (quando o Emissor do FII o traz, ex. "CRI_24A2518977 - CANAL CIA DE SEC")
 *    ou por securitizadora + nº da emissão + série. Casa ~70-100% do valor
 *    (fundo a fundo - alguns informes trazem emissão/série "0": sem como ligar,
 *    e esse pedaço aparece como "Não identificado", nunca chutado).
 *  - inf_mensal_fii_ativo_passivo: totais por tipo de ativo no último mês
 *    (imóveis, cotas de FII, CRI/CRA, LCI, caixa...) - base do tipo
 *    tijolo/papel/híbrido/FoF e da divisão por tipo.
 *  - Funds Explorer (fundsexplorer.com.br) DESCARTADO: atrás de Cloudflare, a
 *    "Localização dos Ativos" vem de um admin-ajax com nonce (500 sem ele) e é
 *    o MESMO dado da CVM (imóveis do informe trimestral) com endereço pior.
 *
 * COMO FICA "INTELIGENTE" (sem buscar toda hora):
 *  - Aba aux_fii-portfolio (Ticker | JSON | Fonte | Trimestre | Atualizado em
 *    | Fato relevante visto | Conferir | Reprocessar). O site só LÊ essa aba
 *    (action=fiiPortfolio, sem rede na hora).
 *  - Só reprocessa um FII quando: (a) ainda não tem linha; (b) a CVM publicou
 *    informe trimestral novo/reapresentado dele (a checagem barata é um HEAD
 *    no zip trimestral - só baixa se o ETag/tamanho mudou); (c) apareceu um
 *    Fato Relevante novo no FNet (lido de aux_informes-fii, que o gatilho de
 *    informes já atualiza - zero chamadas extras ao FNet): marca "Conferir"
 *    ("pode ter mudado - confira") e põe "Reprocessar" = S, que vale na
 *    PRÓXIMA execução.
 *  - Aba aux_fii-geocache: coordenadas (OpenStreetMap/Nominatim) guardadas pra
 *    sempre - cada endereço é consultado 1 vez, 1 req/s, User-Agent
 *    identificado (Propriedade do script NOMINATIM_CONTATO). Se o Nominatim
 *    recusar o Apps Script, a tela geocodifica no navegador e manda as
 *    coordenadas de volta (action=fiiPortfolioCoords).
 *
 * Depende (mesmo projeto, escopo global) de Fundamentos.gs (fundBaixarZipCvm_,
 * fundUltimasVersoesCvm_, fundNumero_, fundArred_, fundCnpjCvm_, fundChaveDia_),
 * FnetProventos.gs (tickersFiiDaCarteira_, garantirCnpjsFii_,
 * chaveDeCelulaProvento_, dataDeChaveProvento_, FNET_BASE_URL_),
 * FnetInformesFii.gs (ABA_INFORMES_FII) e Sync.gs (gravarRegistroControle_).
 *
 * Etapa secundária da agenda (Agenda.gs, id 'portfolioFii'). Rodar no editor:
 * rodarPortfolioFiiDireto() (só o que precisa), rodarPortfolioFiiTudo()
 * (reprocessa todos) e configurarContatoNominatim('seu@email').
 */

var ABA_FII_PORTFOLIO = 'aux_fii-portfolio';
var CABECALHO_FII_PORTFOLIO = ['Ticker', 'JSON', 'Fonte', 'Trimestre', 'Atualizado em', 'Fato relevante visto', 'Conferir', 'Reprocessar'];
var ABA_FII_GEOCACHE = 'aux_fii-geocache';
var CABECALHO_FII_GEOCACHE = ['Chave', 'Latitude', 'Longitude', 'Precisão', 'Consulta', 'Atualizado em', 'UF', 'Cidade'];
var PORT_CVM_URL_ = 'https://dados.cvm.gov.br/dados/';
var PORT_PROP_ASSINATURA_ = 'PORTFOLIO_FII_ASSINATURA';
var PORT_PROP_CONTATO_ = 'NOMINATIM_CONTATO';
var PORT_LIMITE_MS_ = 5 * 60 * 1000;
var PORT_FOLGA_MS_ = 60 * 1000;
var PORT_GEOCODE_MAX_REQ_ = 120;       // por execução (1 req/s => ~2 min)
var PORT_GEOCODE_INTERVALO_MS_ = 1100; // política do Nominatim: no máximo 1 req/s
var PORT_GEOCODE_REPETIR_DIAS_ = 30;   // endereço que não achou: tenta de novo só depois disso
var PORT_JSON_MAX_ = 45000;            // uma célula guarda 50.000 caracteres
var PORT_UFS_ = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

// ---------------------------------------------------------------------------
// Execução manual / agenda
// ---------------------------------------------------------------------------

/** Roda na hora, pelo editor: só o que precisa (sem linha, informe novo ou fato relevante marcado). */
function rodarPortfolioFiiDireto() {
  var r = atualizarPortfolioFii_('Manual');
  Logger.log(r.status + ' - ' + r.detalhe);
}

/** Reprocessa TODOS os FIIs da carteira (ignora a checagem de novidade). */
function rodarPortfolioFiiTudo() {
  var r = atualizarPortfolioFii_('Manual', { forcar: true });
  Logger.log(r.status + ' - ' + r.detalhe);
}

/** Guarda o e-mail de contato que vai no User-Agent do Nominatim (política de uso do OpenStreetMap). Rodar 1x. */
function configurarContatoNominatim(contato) {
  if (!contato) throw new Error('Passe o e-mail: configurarContatoNominatim("voce@exemplo.com")');
  PropertiesService.getScriptProperties().setProperty(PORT_PROP_CONTATO_, String(contato));
  Logger.log('Contato do Nominatim guardado.');
}

/**
 * Passo da agenda (e do editor). opcoes: { forcar, tickers, limiteMs }.
 * Devolve { status: Sucesso|Atenção|Erro, detalhe, porTempo, atualizados: [...], marcados: [...] }.
 */
function atualizarPortfolioFii_(origem, opcoes) {
  opcoes = opcoes || {};
  var inicio = Date.now();
  var limite = opcoes.limiteMs || PORT_LIMITE_MS_;
  var temTempo = function () { return Date.now() - inicio < limite - PORT_FOLGA_MS_; };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var agora = new Date();
  var hoje = fundChaveDia_(agora); // Fundamentos.gs
  var tickers = tickersFiiDaCarteira_(ss); // FnetProventos.gs
  if (opcoes.tickers && opcoes.tickers.length) tickers = tickers.filter(function (t) { return opcoes.tickers.indexOf(t) !== -1; });
  if (!tickers.length) return { status: 'Sucesso', detalhe: 'Portfólio dos FIIs: nenhum FII na carteira', porTempo: false, atualizados: [], marcados: [] };
  var cnpjs = garantirCnpjsFii_(ss, tickers); // FnetProventos.gs
  var linhas = portLerLinhas_(ss);
  var frs = portUltimosFatosRelevantes_(ss);
  var atualizados = [], marcados = [], falhas = [], semCnpj = [], avisos = [], porTempo = false;

  // 1) quem precisa (agora): sem linha, "Reprocessar" que ficou da execução anterior, ou forçado
  var precisa = tickers.filter(function (t) { return cnpjs[t] && (opcoes.forcar || !linhas[t] || linhas[t].reprocessar); });
  tickers.forEach(function (t) { if (!cnpjs[t]) semCnpj.push(t); });

  // 2) a CVM publicou algo novo? (HEAD no zip trimestral: ETag + tamanho)
  var assinatura = null, assinaturaMudou = false;
  try {
    assinatura = portAssinaturaCvm_(hoje);
    var anterior = PropertiesService.getScriptProperties().getProperty(PORT_PROP_ASSINATURA_);
    assinaturaMudou = !!assinatura && assinatura !== anterior;
  } catch (eH) { avisos.push('CVM (HEAD): ' + String(eH).slice(0, 80)); }
  var consultar = tickers.filter(function (t) { return cnpjs[t]; });
  var baixar = precisa.length > 0 || (assinaturaMudou && consultar.length > 0);

  var geoCtx = portCriarContextoGeo_(ss, temTempo);
  if (baixar && temTempo()) {
    try {
      var mapaCnpj = {};
      consultar.forEach(function (t) { var c = fundCnpjCvm_(cnpjs[t]); if (c) mapaCnpj[t] = c; });
      var cvm = portColetarCvm_(mapaCnpj, hoje, temTempo);
      var indice = null;
      consultar.forEach(function (t) {
        var d = cvm.porTicker[t];
        if (!d) { if (precisa.indexOf(t) !== -1) falhas.push(t + ' (sem informe na CVM)'); return; }
        var antes = linhas[t];
        var refNovo = portRefDoFundo_(d);
        var novoInforme = !antes || !antes.json || !antes.json.ref || antes.json.ref.trimestre !== refNovo.trimestre || antes.json.ref.versao !== refNovo.versao;
        if (!(precisa.indexOf(t) !== -1 || novoInforme)) return;
        if (!temTempo()) { porTempo = true; return; }
        if (indice === null) indice = portIndiceCriParaFundos_(cvm.porTicker, hoje, avisos, temTempo);
        var json = portMontarPortfolio_(t, cnpjs[t], d, indice);
        var fr = frs[t];
        var linha = antes || { ticker: t };
        linha.json = json;
        linha.fonte = portTextoFonte_(json);
        linha.trimestre = json.ref.trimestre;
        linha.atualizadoEm = agora;
        linha.reprocessar = false;
        if (fr) linha.frVisto = portChaveFr_(fr);
        if (!antes || novoInforme) linha.conferir = '';
        linhas[t] = linha;
        atualizados.push(t);
      });
      if (assinatura && !porTempo) PropertiesService.getScriptProperties().setProperty(PORT_PROP_ASSINATURA_, assinatura);
    } catch (eC) {
      falhas.push('CVM (' + String(eC).slice(0, 120) + ')');
    }
  } else if (baixar) porTempo = true;

  // 3) coordenadas dos imóveis que ainda não têm (cache permanente; continua de onde parou)
  var gravar = atualizados.length > 0;
  tickers.forEach(function (t) {
    var l = linhas[t];
    if (!l || !l.json || !l.json.imoveis || !l.json.imoveis.itens || !portFaltamCoords_(l.json)) return;
    if (portAplicarGeocache_(l.json, geoCtx)) { l.json = portCompactar_(l.json); gravar = true; }
  });
  portGravarGeocache_(ss, geoCtx);
  if (geoCtx.bloqueado) avisos.push('Nominatim recusou o servidor (' + geoCtx.bloqueado + '): o mapa geocodifica no navegador');
  else if (geoCtx.pendentes) porTempo = true;

  // 4) fato relevante NOVO no FNet depois do que já foi visto: marca pra conferir e reprocessa na próxima execução
  tickers.forEach(function (t) {
    var l = linhas[t], fr = frs[t];
    if (!l || !fr) return;
    var chave = portChaveFr_(fr);
    if (l.frVisto === chave) return;
    if (atualizados.indexOf(t) !== -1) { l.frVisto = chave; return; } // acabou de reprocessar com ele em mãos
    l.frVisto = chave;
    l.reprocessar = true;
    l.conferir = 'Fato relevante de ' + portDataBr_(fr.data) + (fr.assunto ? ' (' + fr.assunto + ')' : '') + ' - pode ter mudado, confira';
    marcados.push(t);
  });

  if (gravar || marcados.length) portGravarLinhas_(ss, linhas);

  var partes = ['Portfólio dos FIIs: ' + atualizados.length + ' atualizado(s)' + (atualizados.length ? ' (' + atualizados.join(', ') + ')' : '')];
  if (marcados.length) partes.push('fato relevante novo - conferir: ' + marcados.join(', '));
  if (geoCtx.requisicoes) partes.push(geoCtx.requisicoes + ' consulta(s) de mapa');
  if (semCnpj.length) partes.push('sem CNPJ (digite na aba ' + ABA_FII_CNPJ + '): ' + semCnpj.join(', '));
  if (falhas.length) partes.push('falhou: ' + falhas.join('; '));
  if (avisos.length) partes.push(avisos.join('; '));
  if (porTempo) partes.push('ficou pra próxima (tempo/limite de consultas)');
  var status = falhas.length && !atualizados.length && precisa.length ? 'Erro' : ((falhas.length || semCnpj.length || avisos.length) ? 'Atenção' : 'Sucesso');
  var detalhe = partes.join(' — ');
  if (atualizados.length || marcados.length || status !== 'Sucesso') {
    try { gravarRegistroControle_(status, origem, detalhe); } catch (eR) { Logger.log('Registro de Controle: ' + eR); }
  }
  return { status: status, detalhe: detalhe, porTempo: porTempo, atualizados: atualizados, marcados: marcados };
}

function portTextoFonte_(json) {
  var r = json.ref || {};
  return 'CVM informe trimestral ' + (r.trimestre || '?') + (r.versao ? ' v' + r.versao : '') +
    (r.mensal ? ' + mensal ' + r.mensal : '') + (json.papel && json.papel.indexadorFonte ? ' + securitizadoras (CRI/CRA)' : '');
}

// ---------------------------------------------------------------------------
// Planilha: aux_fii-portfolio
// ---------------------------------------------------------------------------

function portLerLinhas_(ss) {
  var aba = ss.getSheetByName(ABA_FII_PORTFOLIO);
  var out = {};
  if (!aba || aba.getLastRow() < 2) return out;
  aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_FII_PORTFOLIO.length).getValues().forEach(function (l) {
    var t = String(l[0] || '').trim().toUpperCase();
    if (!t) return;
    var json = null;
    try { json = l[1] ? JSON.parse(String(l[1])) : null; } catch (e) { json = null; }
    out[t] = {
      ticker: t, json: json, fonte: String(l[2] || ''), trimestre: portDataIso_(l[3]), atualizadoEm: l[4] || '',
      frVisto: String(l[5] || ''), conferir: String(l[6] || ''), reprocessar: /^s/i.test(String(l[7] || '').trim())
    };
  });
  return out;
}

function portGravarLinhas_(ss, linhas) {
  var aba = ss.getSheetByName(ABA_FII_PORTFOLIO) || ss.insertSheet(ABA_FII_PORTFOLIO);
  var chaves = Object.keys(linhas).sort();
  var valores = chaves.map(function (t) {
    var l = linhas[t];
    var json = l.json ? JSON.stringify(portCompactar_(l.json)) : '';
    return [t, json, l.fonte || '', l.trimestre ? dataDeChaveProvento_(l.trimestre) : '', l.atualizadoEm || '', l.frVisto || '', l.conferir || '', l.reprocessar ? 'S' : ''];
  });
  aba.clearContents();
  aba.getRange(1, 1, 1, CABECALHO_FII_PORTFOLIO.length).setValues([CABECALHO_FII_PORTFOLIO]);
  if (valores.length) aba.getRange(2, 1, valores.length, CABECALHO_FII_PORTFOLIO.length).setValues(valores);
}

function portDataIso_(v) {
  if (v instanceof Date) return chaveDeCelulaProvento_(v);
  return chaveDeCelulaProvento_(String(v || ''));
}

function portDataBr_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

// ---------------------------------------------------------------------------
// Fato relevante (lido de aux_informes-fii - o gatilho de informes já o mantém)
// ---------------------------------------------------------------------------

function portUltimosFatosRelevantes_(ss) {
  var aba = ss.getSheetByName(ABA_INFORMES_FII); // FnetInformesFii.gs
  var out = {};
  if (!aba || aba.getLastRow() < 2) return out;
  aba.getRange(2, 1, aba.getLastRow() - 1, 5).getValues().forEach(function (l) {
    var t = String(l[0] || '').trim().toUpperCase();
    if (!t || !/fato\s+relevante/i.test(String(l[1] || '') + ' ' + String(l[2] || ''))) return;
    var data = chaveDeCelulaProvento_(l[3]);
    var id = String(l[4] || '');
    var atual = out[t];
    if (!atual || data > atual.data || (data === atual.data && Number(id) > Number(atual.id))) {
      out[t] = { data: data, assunto: String(l[2] || '').replace(/^fato\s+relevante\s*$/i, '').trim(), id: id };
    }
  });
  return out;
}

function portChaveFr_(fr) { return fr.data + '|' + fr.id; }

// ---------------------------------------------------------------------------
// CVM: baixar e filtrar
// ---------------------------------------------------------------------------

/** ETag + tamanho do zip trimestral do ano (HEAD, sem baixar). */
function portAssinaturaCvm_(hoje) {
  var url = PORT_CVM_URL_ + 'FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_' + hoje.slice(0, 4) + '.zip';
  var resp = UrlFetchApp.fetch(url, { method: 'head', muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;
  var h = resp.getHeaders() || {};
  var pega = function (nome) { var k = Object.keys(h).filter(function (x) { return x.toLowerCase() === nome; })[0]; return k ? String(h[k]) : ''; };
  var sig = pega('etag') + '|' + pega('content-length') + '|' + pega('last-modified');
  return sig === '||' ? null : sig;
}

/**
 * Baixa trimestral (imovel, ativo, geral) e mensal (ativo_passivo) filtrando
 * pelos CNPJs. Devolve { porTicker: { TICKER: { geral, ativo, imovel, mensalAp } } }.
 * O arquivo do ano novo só existe depois do 1º informe: 404 nele não é erro.
 */
function portColetarCvm_(mapaCnpj, hoje, temTempo) {
  var termos = Object.keys(mapaCnpj).map(function (t) { return mapaCnpj[t]; });
  var ano = Number(hoje.slice(0, 4));
  var tri = {}, men = {}, erros = [], baixados = 0;
  var juntar = function (destino, url, soArquivos) {
    var arquivos;
    try { arquivos = fundBaixarZipCvm_(url, termos, soArquivos); baixados++; } catch (e) { erros.push(url.replace(/^.*\//, '') + ': ' + String(e).slice(0, 60)); return; }
    Object.keys(arquivos).forEach(function (nome) {
      var chave = nome.replace(/_\d{4}\.csv$/i, '');
      destino[chave] = (destino[chave] || []).concat(arquivos[nome]);
    });
  };
  var arquivosTri = ['_imovel_2', '_ativo_2', '_geral_2'];
  var temGeral = function () { return termos.every(function (c) { return fundUltimasVersoesCvm_(tri.inf_trimestral_fii_geral, c).length; }); };
  [ano, ano - 1].forEach(function (a) {
    if (a === ano - 1 && (temGeral() || !temTempo())) return;
    juntar(tri, PORT_CVM_URL_ + 'FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_' + a + '.zip', arquivosTri);
  });
  var temMensal = function () { return termos.every(function (c) { return fundUltimasVersoesCvm_(men.inf_mensal_fii_ativo_passivo, c).length; }); };
  [ano, ano - 1].forEach(function (a) {
    if (a === ano - 1 && (temMensal() || !temTempo())) return;
    juntar(men, PORT_CVM_URL_ + 'FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_' + a + '.zip', ['_ativo_passivo_']);
  });
  if (!baixados) throw new Error('CVM não respondeu (' + erros.join('; ') + ')');
  var porTicker = {};
  Object.keys(mapaCnpj).forEach(function (t) {
    var c = mapaCnpj[t];
    var geral = fundUltimasVersoesCvm_(tri.inf_trimestral_fii_geral, c);
    var ativo = fundUltimasVersoesCvm_(tri.inf_trimestral_fii_ativo, c);
    var imovel = fundUltimasVersoesCvm_(tri.inf_trimestral_fii_imovel, c);
    var ap = fundUltimasVersoesCvm_(men.inf_mensal_fii_ativo_passivo, c);
    if (!geral.length && !ativo.length && !imovel.length && !ap.length) return;
    porTicker[t] = { cnpj: c, geral: geral, ativo: ativo, imovel: imovel, mensalAp: ap };
  });
  return { porTicker: porTicker };
}

/** Trimestre de referência (e versão) do informe mais novo do fundo. */
function portRefDoFundo_(d) {
  var datas = [];
  ['geral', 'ativo', 'imovel'].forEach(function (k) { (d[k] || []).forEach(function (x) { datas.push(x.data); }); });
  datas.sort();
  var tri = datas.length ? datas[datas.length - 1] : '';
  var versao = 0;
  ['geral', 'ativo', 'imovel'].forEach(function (k) {
    (d[k] || []).forEach(function (x) { if (x.data === tri) x.linhas.forEach(function (l) { versao = Math.max(versao, Number(l.Versao) || 0); }); });
  });
  return { trimestre: tri, versao: versao || null };
}

function portLinhasDaData_(lista, data) {
  var achou = (lista || []).filter(function (x) { return x.data === data; })[0];
  return achou ? achou.linhas : [];
}

// ---------------------------------------------------------------------------
// CRI/CRA: indexador pelo informe mensal das securitizadoras
// ---------------------------------------------------------------------------

/** "2773542000122" (a CVM tira o zero da esquerda no informe do FII) -> "02.773.542/0001-22". */
function portCnpjFormatado_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (!d || d.length > 14) return null;
  while (d.length < 14) d = '0' + d;
  return fundCnpjCvm_(d);
}

/** Código CETIP (ex. 24A2518977) dentro do texto do emissor ("CRI_24A2518977_DU2 - OPEA SEC"). */
function portExtrairCetip_(emissor) {
  var m = String(emissor || '').toUpperCase().match(/(?:^|[^0-9A-Z])(\d{2}[A-Z]\d{7})(?![0-9A-Z])/);
  return m ? m[1] : null;
}

/** Texto livre da taxa -> IPCA | CDI | IGP-M | INCC | TR | Pré | Outro. */
function portClassificarTaxa_(texto) {
  var s = String(texto || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s) return 'Outro';
  if (/IPCA/.test(s)) return 'IPCA';
  if (/\bCDI\b|\bDI\b|SELIC|C\.D\.I/.test(s)) return 'CDI';
  if (/IGP/.test(s)) return 'IGP-M';
  if (/INCC/.test(s)) return 'INCC';
  if (/INPC|\bIPC\b/.test(s)) return 'Inflação (outro)';
  if (/\bTR\b/.test(s)) return 'TR';
  if (/PR[EÉ]-?\s?FIX|(?:^|[^A-Z])PR[EÉ](?![A-Z])|\bFIXO\b/.test(s)) return 'Pré'; // \b não vale com o É
  var resto = s.replace(/A\.?\s?A\.?|AO ANO|\(AA\)|\(AO ANO\)|%|[0-9.,\s+]/g, '');
  if (!resto) return 'Pré';
  return 'Outro';
}

function portDigitos_(v) { return String(v || '').replace(/\D/g, '').replace(/^0+/, ''); }

/**
 * Índices dos CRI/CRA citados pelos fundos: { cetip: {...}, serie: { 'cnpj|emissao|serie': [...] } }.
 * Baixa o zip mensal das securitizadoras (CRI e CRA) do ano de referência e do seguinte
 * (um CRI de 2025 ainda aparece em 2026), filtrando só as securitizadoras envolvidas.
 */
function portIndiceCriParaFundos_(porTicker, hoje, avisos, temTempo) {
  var cnpjs = {}, anos = {}, temCri = false;
  Object.keys(porTicker).forEach(function (t) {
    var d = porTicker[t];
    var ref = portRefDoFundo_(d).trimestre;
    if (ref) { anos[ref.slice(0, 4)] = 1; if (Number(ref.slice(0, 4)) < Number(hoje.slice(0, 4))) anos[String(Number(ref.slice(0, 4)) + 1)] = 1; }
    portLinhasDaData_(d.ativo, ref).forEach(function (l) {
      if (!/^CR[IA]/i.test(l.Tipo || '') || !(fundNumero_(l.Valor) > 0)) return;
      var c = portCnpjFormatado_(l.CNPJ_Emissor);
      if (c) cnpjs[c] = 1;
      temCri = true;
    });
  });
  var indice = { cetip: {}, serie: {}, baixou: false };
  var termos = Object.keys(cnpjs);
  if (!temCri || !termos.length) return indice;
  var geral = {};
  var erros = [];
  Object.keys(anos).sort().forEach(function (ano) {
    ['cri', 'cra'].forEach(function (tipo) {
      if (!temTempo()) return;
      var url = PORT_CVM_URL_ + 'SECURIT/DOC/INF_MENSAL_' + tipo.toUpperCase() + '/DADOS/inf_mensal_' + tipo + '_' + ano + '.zip';
      var arq;
      try { arq = fundBaixarZipCvm_(url, termos, ['_' + tipo + '_classe_', '_' + tipo + '_geral_']); indice.baixou = true; } catch (e) { erros.push(tipo + ' ' + ano + ': ' + String(e).slice(0, 50)); return; }
      Object.keys(arq).forEach(function (nome) {
        if (/_geral_/.test(nome)) {
          arq[nome].forEach(function (l) {
            var k = l.CNPJ_Emissora + '|' + l.Codigo_Identificacao_Certificado;
            if (!geral[k] || l.Data_Referencia >= geral[k].data) geral[k] = { data: l.Data_Referencia, emissao: String(l.Numero_Emissao || '').trim() };
          });
        }
      });
      Object.keys(arq).forEach(function (nome) {
        if (!/_classe_/.test(nome)) return;
        arq[nome].forEach(function (l) {
          var taxa = String(l.Taxa_Juros || '').trim();
          var g = geral[l.CNPJ_Emissora + '|' + l.Codigo_Identificacao_Certificado];
          var reg = { data: l.Data_Referencia, taxa: taxa, classe: String(l.Classe || ''), vencimento: portDataIso_(l.Data_Vencimento), cetip: String(l.Codigo_CETIP || '').trim().toUpperCase() };
          if (reg.cetip) {
            var a = indice.cetip[reg.cetip];
            if (!a || reg.data >= a.data) indice.cetip[reg.cetip] = reg;
          }
          if (g && g.emissao) {
            var ks = portDigitos_(l.CNPJ_Emissora) + '|' + portDigitos_(g.emissao) + '|' + portDigitos_(l.Numero_Serie);
            var lista = indice.serie[ks] = indice.serie[ks] || [];
            var i = -1;
            lista.forEach(function (x, j) { if (x.cetip === reg.cetip && x.classe === reg.classe) i = j; });
            if (i === -1) lista.push(reg); else if (reg.data >= lista[i].data) lista[i] = reg;
          }
        });
      });
    });
  });
  if (!indice.baixou && erros.length) avisos.push('indexador dos CRI indisponível (' + erros.join('; ') + ')');
  return indice;
}

/** CRI/CRA do informe do FII -> registro da securitizadora (ou null). */
function portCasarCri_(linha, indice) {
  var cetip = portExtrairCetip_(linha.Emissor);
  if (cetip && indice.cetip[cetip]) return indice.cetip[cetip];
  var emissao = portDigitos_(linha.Emissao), serie = portDigitos_(linha.Serie);
  if (emissao && serie) {
    var lista = indice.serie[portDigitos_(linha.CNPJ_Emissor) + '|' + emissao + '|' + serie];
    if (lista && lista.length) {
      var senior = lista.filter(function (x) { return /s[eê]nior/i.test(x.classe) && x.taxa; })[0];
      return senior || lista.filter(function (x) { return x.taxa; })[0] || lista[0];
    }
  }
  return null;
}

/** "CRI_24A2518977 - CANAL CIA DE SEC" / "TRUE SEC S.A. - CRI - 24F1345887" -> nome da securitizadora. */
function portNomeSecuritizadora_(emissor) {
  var s = String(emissor || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/CR[IA]_[0-9A-Z]{10}(?:_[A-Z0-9]+)?\s*-?\s*/i, '').replace(/\s*-\s*CR[IA]\s*-\s*[0-9A-Z]{10}\s*$/i, '').replace(/\s*-\s*[0-9]{2}[A-Z][0-9]{7}\s*$/i, '');
  return s.replace(/^[\s\-]+|[\s\-]+$/g, '');
}

// ---------------------------------------------------------------------------
// Montagem do JSON de portfólio
// ---------------------------------------------------------------------------

function portPct_(x) {
  var y = fundNumero_(x);
  if (y == null) return null;
  return y > 1.0001 ? y / 100 : y;
}

/** 'Imóveis para renda acabados' -> 'Renda' etc. */
function portClasseImovel_(classe) {
  var s = String(classe || '').toLowerCase();
  if (/constru/.test(s)) return 'Em construção';
  if (/venda/.test(s)) return 'Para venda';
  if (/renda/.test(s)) return 'Renda';
  return String(classe || '').trim();
}

/** Endereço livre da CVM -> { endereco, cidade, uf } (cidade/UF só quando dá pra ter certeza). */
function portParseEndereco_(texto) {
  var s = String(texto || '').replace(/\s+/g, ' ').replace(/^[\s:;,.\-]+/, '').trim();
  var out = { endereco: s, cidade: '', uf: '' };
  if (!s) return out;
  var cepFim = /[\s,\-–]*\b\d{5}\s*-?\s*\d{3}\b\s*\.?\s*$/;
  var t = s.replace(cepFim, '').replace(/[\s,.\-]*\bbrasil\b[\s,.]*$/i, '').replace(cepFim, '').replace(/[\s,\-–.]+$/, '');
  var m = t.match(/(?:^|[\s,\-–\/(])([A-Z]{2})\s*\)?$/);
  if (!m || PORT_UFS_.indexOf(m[1]) === -1) return out; // só UF em maiúsculas ("Sé" não é UF)
  out.uf = m[1];
  var resto = t.slice(0, t.length - m[0].length).replace(/[\s,\-–\/.]+$/, '');
  var partes = resto.split(/\s*,\s*|\s+-\s+|\s+–\s+|\s*\/\s*/);
  var cid = (partes[partes.length - 1] || '').trim();
  if (cid && !/\d/.test(cid) && !/^(r|rua|av|avenida|rod|rodovia|estr|estrada|al|alameda|pça|praça|pc|trav|travessa|tv|lgo|largo|br|km|sem complemento)\b\.?/i.test(cid) && cid.length >= 3) out.cidade = cid;
  return out;
}

/** Logradouro e número do endereço livre ("Av. X, 2511 - Bairro" / "EST Y Nº 655 Z") -> { logradouro, numero }. */
function portLogradouroNumero_(endereco) {
  var s = String(endereco || '').replace(/\s+/g, ' ').trim();
  var m = s.match(/^(.*?),\s*(?:n[º°o.]*\s*)?(\d[\d.]*)\b/i) || s.match(/^(.*?)\s+n[º°o.]+\s*(\d[\d.]*)/i);
  if (m && m[1].length >= 3) return { logradouro: m[1].trim(), numero: m[2].replace(/\.$/, '') };
  var primeira = s.split(/\s*,\s*/)[0] || '';
  return { logradouro: primeira.replace(/\s+-\s+.*$/, '').trim(), numero: '' };
}

/** Consultas ao Nominatim, da mais precisa pra menos: [{ q, p: 'endereço' | 'nome' }]. */
function portConsultasImovel_(im) {
  var out = [];
  var ln = portLogradouroNumero_(im.endereco);
  var nome = String(im.nome || '').replace(/\s+-\s+\d+%$/, '').trim();
  var local = im.cidade && im.uf ? im.cidade + ' - ' + im.uf : '';
  var umaCidade = nome && !/[\d\/]/.test(nome) && nome.length <= 25 && nome.split(/\s+/).length <= 2 && !/^(loja|galp|shopping|torre|edif)/i.test(nome);
  if (ln.logradouro && local) out.push({ q: ln.logradouro + (ln.numero ? ', ' + ln.numero : '') + ', ' + local, p: 'endereço' });
  else if (ln.logradouro && im.uf) out.push({ q: ln.logradouro + (ln.numero ? ', ' + ln.numero : '') + ', ' + im.uf, p: 'endereço' }); // só a UF (o nome do imóvel trazia "/BA")
  else if (ln.logradouro && umaCidade) out.push({ q: ln.logradouro + (ln.numero ? ', ' + ln.numero : '') + ', ' + nome, p: 'nome' }); // nome que é a própria cidade ("Curitiba")
  if (nome && local) out.push({ q: nome + ', ' + local, p: 'nome' });
  return out;
}

/** Tipo do imóvel pelo NOME (a CVM não informa) - sempre marcado como estimado. */
function portSegmentoPeloNome_(nome) {
  var s = String(nome || '').toLowerCase();
  if (/shopping|\bmall\b|outlet/.test(s)) return 'Shopping';
  if (/galp|log[ií]stic|\bcd\b|centro de distribui|condom[ií]nio empresarial|\bpark\b.*(log|ind)|industrial|armaz/.test(s)) return 'Logística';
  if (/hospital|cl[ií]nica|sa[uú]de/.test(s)) return 'Saúde';
  if (/ag[eê]ncia|bradesco|ita[uú]|santander|banco do brasil|\bbb\b|caixa econ/.test(s)) return 'Agência bancária';
  if (/hotel|resort/.test(s)) return 'Hotel';
  if (/faculdade|universidade|escola|campus|educa/.test(s)) return 'Educação';
  if (/supermercado|atacad|varejo|loja|\bstore\b|drogaria/.test(s)) return 'Varejo';
  if (/torre|edif[ií]cio|\bed\.|laje|corporativ|escrit[oó]rio|\bplaza\b|tower|building|sala|andar|conjunto|office|\bcenter\b|centro empresarial/.test(s)) return 'Lajes corporativas';
  return '';
}

/** Linhas do informe trimestral (imovel) -> imóveis do JSON. */
function portMontarImoveis_(linhas) {
  var vistos = {}, itens = [];
  (linhas || []).forEach(function (l) {
    var nome = String(l.Nome_Imovel || '').replace(/\s+/g, ' ').trim();
    var end = portParseEndereco_(l.Endereco);
    var chave = (nome + '|' + end.endereco).toLowerCase();
    if (!nome && !end.endereco) return;
    if (vistos[chave]) return;
    vistos[chave] = 1;
    var area = fundNumero_(l.Area), vac = portPct_(l.Percentual_Vacancia), inad = portPct_(l.Percentual_Inadimplencia), rec = portPct_(l.Percentual_Receitas_FII);
    if (!end.uf) { var mu = nome.match(/\/\s*([A-Z]{2})\s*$/); if (mu && PORT_UFS_.indexOf(mu[1]) !== -1) end.uf = mu[1]; }
    var seg = portSegmentoPeloNome_(nome);
    var im = {
      nome: nome || end.endereco,
      endereco: end.endereco,
      cidade: end.cidade,
      uf: end.uf,
      area: area > 0 ? fundArred_(area, 2) : null,
      unidades: fundNumero_(l.Numero_Unidades) > 1 ? fundNumero_(l.Numero_Unidades) : null,
      pctReceita: rec != null && rec >= 0 ? fundArred_(rec, 5) : null,
      vacancia: vac != null && vac >= 0 && vac <= 1 ? fundArred_(vac, 4) : null,
      inadimplencia: inad != null && inad > 0 && inad <= 1 ? fundArred_(inad, 4) : null,
      classe: portClasseImovel_(l.Classe),
      segmento: seg,
      segmentoFonte: seg ? 'nome' : '',
      k: portChaveGeo_({ nome: nome, endereco: end.endereco, cidade: end.cidade, uf: end.uf })
    };
    var obs = String(l.Outras_Caracteristicas_Relevantes || '').replace(/\s+/g, ' ').trim();
    var fr = obs.match(/fra[cç][aã]o ideal de ([\d.,]+\s*%)/i);
    if (fr) im.participacao = fr[1].replace(/\s+/g, '');
    itens.push(im);
  });
  itens.sort(function (a, b) { return (b.pctReceita || 0) - (a.pctReceita || 0) || (b.area || 0) - (a.area || 0); });
  var area = 0;
  itens.forEach(function (i) { area += i.area || 0; });
  return { total: itens.length, areaTotal: area > 0 ? fundArred_(area, 2) : null, itens: itens };
}

/** Cota de FII: "BTML11 - FII BR MALLS" -> { ticker, nome }. */
function portNomeCotaFii_(emissor) {
  var s = String(emissor || '').replace(/\s+/g, ' ').trim();
  var m = s.match(/^([A-Z]{4}\d{2})\s*-\s*(.*)$/);
  return m ? { ticker: m[1], nome: m[2].trim() } : { ticker: '', nome: s };
}

/** Linhas do informe trimestral (ativo) -> blocos de papel, cotas e por tipo. */
function portMontarCarteira_(linhas, indice) {
  var porTipo = {}, totalGeral = 0;
  var cri = {}, criTotal = 0, criIdent = 0;
  var cotas = {}, cotasTotal = 0;
  (linhas || []).forEach(function (l) {
    var v = fundNumero_(l.Valor);
    if (!(v > 0)) return;
    var tipo = String(l.Tipo || 'Outros').trim() || 'Outros';
    porTipo[tipo] = (porTipo[tipo] || 0) + v;
    totalGeral += v;
    if (/^CR[IA]/i.test(tipo)) {
      var reg = indice ? portCasarCri_(l, indice) : null;
      var cetip = portExtrairCetip_(l.Emissor) || (reg && reg.cetip) || '';
      var nomeSec = portNomeSecuritizadora_(l.Emissor);
      var emissao = portDigitos_(l.Emissao), serie = portDigitos_(l.Serie);
      var chave = cetip || (nomeSec + '|' + emissao + '|' + serie);
      var item = cri[chave] = cri[chave] || { codigo: cetip, securitizadora: nomeSec, emissao: emissao || '', serie: serie || '', taxa: reg ? reg.taxa : '', indexador: reg && reg.taxa ? portClassificarTaxa_(reg.taxa) : '', vencimento: reg ? reg.vencimento : '', valor: 0 };
      item.valor += v;
      criTotal += v;
      if (item.indexador) criIdent += v;
    } else if (/^FII$/i.test(tipo)) {
      var c = portNomeCotaFii_(l.Emissor);
      var kc = c.ticker || c.nome;
      var ci = cotas[kc] = cotas[kc] || { ticker: c.ticker, nome: c.nome, valor: 0 };
      ci.valor += v;
      cotasTotal += v;
    }
  });
  var out = { totalClasses: totalGeral };
  out.porTipo = Object.keys(porTipo).map(function (k) { return { tipo: k, valor: fundArred_(porTipo[k], 2), pct: totalGeral > 0 ? fundArred_(porTipo[k] / totalGeral, 5) : 0 }; })
    .sort(function (a, b) { return b.valor - a.valor; });
  if (criTotal > 0) {
    var titulos = Object.keys(cri).map(function (k) { return cri[k]; }).sort(function (a, b) { return b.valor - a.valor; });
    var porIdx = {};
    titulos.forEach(function (t) {
      var k = t.indexador || 'Não identificado';
      var g = porIdx[k] = porIdx[k] || { indexador: k, valor: 0, n: 0 };
      g.valor += t.valor; g.n += 1;
    });
    out.papel = {
      total: fundArred_(criTotal, 2),
      n: titulos.length,
      indexadorFonte: !!(indice && indice.baixou),
      identificadoPct: fundArred_(criIdent / criTotal, 4),
      porIndexador: Object.keys(porIdx).map(function (k) { return { indexador: k, valor: fundArred_(porIdx[k].valor, 2), pct: fundArred_(porIdx[k].valor / criTotal, 5), n: porIdx[k].n }; })
        .sort(function (a, b) { return (a.indexador === 'Não identificado') - (b.indexador === 'Não identificado') || b.valor - a.valor; }),
      titulos: titulos.slice(0, 25).map(function (t) { return { codigo: t.codigo, securitizadora: t.securitizadora, emissao: t.emissao, serie: t.serie, taxa: t.taxa, indexador: t.indexador, vencimento: t.vencimento, valor: fundArred_(t.valor, 2), pct: fundArred_(t.valor / criTotal, 5) }; }),
      titulosOmitidos: Math.max(0, titulos.length - 25)
    };
  }
  if (cotasTotal > 0) {
    var lista = Object.keys(cotas).map(function (k) { return cotas[k]; }).sort(function (a, b) { return b.valor - a.valor; });
    out.cotas = {
      total: fundArred_(cotasTotal, 2),
      n: lista.length,
      itens: lista.slice(0, 20).map(function (c) { return { ticker: c.ticker, nome: c.nome, valor: fundArred_(c.valor, 2), pct: fundArred_(c.valor / cotasTotal, 5) }; }),
      omitidos: Math.max(0, lista.length - 20)
    };
  }
  return out;
}

/** Informe mensal (ativo_passivo, último mês) -> composição por tipo de ativo + base do tipo do fundo. */
function portMontarComposicao_(mensalAp) {
  if (!mensalAp || !mensalAp.length) return null;
  var ult = mensalAp[mensalAp.length - 1];
  var l = ult.linhas[0];
  var n = function (k) { var x = fundNumero_(l[k]); return x > 0 ? x : 0; };
  var imoveis = n('Direitos_Bens_Imoveis') || (n('Terrenos') + n('Imoveis_Renda_Acabados') + n('Imoveis_Renda_Construcao') + n('Imoveis_Venda_Acabados') + n('Imoveis_Venda_Construcao'));
  var sociedades = n('Acoes_Sociedades_Atividades_FII') + n('Cotas_Sociedades_Atividades_FII');
  var cotasFii = n('FII');
  var papel = (n('CRI_CRA') || n('CRI')) + (n('LCI_LCA') || n('LCI')) + n('LIG') + n('Letras_Hipotecarias');
  var investido = n('Total_Investido');
  var caixa = n('Total_Necessidades_Liquidez');
  var outros = Math.max(0, investido - imoveis - sociedades - cotasFii - papel);
  var soma = investido > 0 ? investido : (imoveis + sociedades + cotasFii + papel + outros);
  if (!(soma > 0)) return null;
  var total = soma + caixa;
  var itens = [
    { chave: 'imoveis', rotulo: 'Imóveis', valor: imoveis },
    { chave: 'sociedades', rotulo: 'Sociedades de imóveis (SPEs)', valor: sociedades },
    { chave: 'cotasFii', rotulo: 'Cotas de outros FIIs', valor: cotasFii },
    { chave: 'papel', rotulo: 'CRI, CRA, LCI e letras', valor: papel },
    { chave: 'outros', rotulo: 'Outros ativos', valor: outros },
    { chave: 'caixa', rotulo: 'Caixa e renda fixa', valor: caixa }
  ].filter(function (i) { return i.valor > 0; }).map(function (i) { return { chave: i.chave, rotulo: i.rotulo, valor: fundArred_(i.valor, 2), pct: fundArred_(i.valor / total, 5) }; });
  return {
    mes: ult.data.slice(0, 7), total: fundArred_(total, 2), itens: itens,
    pctTijolo: fundArred_((imoveis + sociedades) / soma, 4), pctPapel: fundArred_(papel / soma, 4), pctFof: fundArred_(cotasFii / soma, 4)
  };
}

/** tijolo | papel | fof | hibrido (60% ou mais num tipo). */
function portTipoDoFundo_(comp, carteira, nImoveis) {
  var t = 0, p = 0, f = 0;
  if (comp) { t = comp.pctTijolo; p = comp.pctPapel; f = comp.pctFof; }
  else {
    var total = carteira && carteira.totalClasses || 0;
    var papelV = carteira && carteira.papel ? carteira.papel.total : 0;
    var fofV = carteira && carteira.cotas ? carteira.cotas.total : 0;
    if (total > 0) { p = papelV / total; f = fofV / total; t = nImoveis > 0 ? Math.max(0, 1 - p - f) : 0; }
  }
  if (t >= 0.6) return 'tijolo';
  if (p >= 0.6) return 'papel';
  if (f >= 0.6) return 'fof';
  if (t + p + f <= 0) return 'indefinido';
  return 'hibrido';
}

/** Dados da CVM de UM fundo (+ índice dos CRI) -> o JSON guardado em aux_fii-portfolio. */
function portMontarPortfolio_(ticker, cnpjDigitos, d, indice) {
  var ref = portRefDoFundo_(d);
  var tri = ref.trimestre;
  var geral = portLinhasDaData_(d.geral, tri)[0] || (d.geral && d.geral.length ? d.geral[d.geral.length - 1].linhas[0] : {}) || {};
  var carteira = portMontarCarteira_(portLinhasDaData_(d.ativo, tri), indice);
  var imoveis = portMontarImoveis_(portLinhasDaData_(d.imovel, tri));
  var comp = portMontarComposicao_(d.mensalAp);
  var json = {
    v: 1,
    ticker: ticker,
    cnpj: String(cnpjDigitos || '').replace(/\D/g, ''),
    nome: String(geral.Nome_Fundo_Classe || '').trim(),
    segmentoCvm: String(geral.Segmento_Atuacao || '').trim(),
    mandato: String(geral.Mandato || '').trim(),
    tipo: portTipoDoFundo_(comp, carteira, imoveis.total),
    ref: { trimestre: tri, versao: ref.versao, entrega: portDataIso_(geral.Data_Entrega), mensal: comp ? comp.mes : '' },
    composicao: comp,
    porTipoAtivo: carteira.porTipo
  };
  if (imoveis.total) json.imoveis = imoveis;
  if (carteira.papel) json.papel = carteira.papel;
  if (carteira.cotas) json.cotas = carteira.cotas;
  return portCompactar_(json);
}

/** Cabe numa célula (50 mil caracteres): tira endereços e corta a lista de imóveis se preciso. */
function portCompactar_(json) {
  var s = JSON.stringify(json);
  if (s.length <= PORT_JSON_MAX_) return json;
  if (json.imoveis && json.imoveis.itens) {
    json.imoveis.itens.forEach(function (i) { delete i.endereco; });
    s = JSON.stringify(json);
    if (s.length > PORT_JSON_MAX_) {
      var corte = Math.max(10, Math.floor(json.imoveis.itens.length * (PORT_JSON_MAX_ / s.length) * 0.9));
      json.imoveis.omitidos = json.imoveis.itens.length - corte;
      json.imoveis.itens = json.imoveis.itens.slice(0, corte);
    }
  }
  return json;
}

// ---------------------------------------------------------------------------
// Geocodificação (OpenStreetMap / Nominatim) - cache permanente em aux_fii-geocache
// ---------------------------------------------------------------------------

function portNormalizar_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 160);
}

/** Chave estável do imóvel no cache (igual no servidor e no navegador, que usa o `k` do JSON). */
function portChaveGeo_(im) {
  var end = String(im.endereco || '');
  if (/\d/.test(end) || end.length > 12) return portNormalizar_(end + ' ' + (im.cidade || '') + ' ' + (im.uf || ''));
  return portNormalizar_((im.nome || '') + ' ' + (im.cidade || '') + ' ' + (im.uf || ''));
}

function portCriarContextoGeo_(ss, temTempo) {
  var cache = {};
  var aba = ss.getSheetByName(ABA_FII_GEOCACHE);
  if (aba && aba.getLastRow() >= 2) {
    aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_FII_GEOCACHE.length).getValues().forEach(function (l) {
      var k = String(l[0] || '');
      if (!k) return;
      var lat = fundNumero_(l[1]), lon = fundNumero_(l[2]);
      cache[k] = { lat: lat != null && lon != null ? lat : null, lon: lat != null && lon != null ? lon : null, precisao: String(l[3] || ''), consulta: String(l[4] || ''), data: portDataIso_(l[5]), uf: String(l[6] || ''), cidade: String(l[7] || '') };
    });
  }
  var contato = '';
  try { contato = PropertiesService.getScriptProperties().getProperty(PORT_PROP_CONTATO_) || ''; } catch (e) { /* sem propriedades */ }
  return { cache: cache, novos: [], requisicoes: 0, pendentes: 0, bloqueado: '', temTempo: temTempo, ultimaReq: 0, contato: contato, hoje: fundChaveDia_(new Date()) };
}

function portGravarGeocache_(ss, ctx) {
  if (!ctx.novos.length) return;
  var aba = ss.getSheetByName(ABA_FII_GEOCACHE) || ss.insertSheet(ABA_FII_GEOCACHE);
  if (aba.getLastRow() < 1) aba.getRange(1, 1, 1, CABECALHO_FII_GEOCACHE.length).setValues([CABECALHO_FII_GEOCACHE]);
  // quem já estava na aba (falha antiga que deu certo agora) vira linha nova: vale a última da chave
  var inicio = aba.getLastRow() + 1;
  aba.getRange(inicio, 1, ctx.novos.length, CABECALHO_FII_GEOCACHE.length).setValues(ctx.novos.map(function (n) {
    return [n.chave, n.lat == null ? '' : n.lat, n.lon == null ? '' : n.lon, n.precisao, n.consulta, dataDeChaveProvento_(n.data), n.uf || '', n.cidade || ''];
  }));
  ctx.novos = [];
}

function portCoordsValidas_(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && lat >= -34 && lat <= 6 && lon >= -74 && lon <= -34;
}

function portFaltamCoords_(json) {
  return !!(json && json.imoveis && json.imoveis.itens && json.imoveis.itens.some(function (i) { return typeof i.lat !== 'number'; }));
}

/** Uma consulta ao Nominatim (1 req/s). Devolve { lat, lon } | null; marca ctx.bloqueado se o servidor recusar. */
function portNominatim_(q, ctx, ufEsperada) {
  if (ctx.bloqueado || ctx.requisicoes >= PORT_GEOCODE_MAX_REQ_ || !ctx.temTempo()) return undefined; // undefined = nem tentou
  var espera = PORT_GEOCODE_INTERVALO_MS_ - (Date.now() - ctx.ultimaReq);
  if (ctx.ultimaReq && espera > 0) Utilities.sleep(espera);
  ctx.ultimaReq = Date.now();
  ctx.requisicoes++;
  var ua = 'ControleInvestimentos-PortfolioFii/1.0 (app pessoal, Google Apps Script; contato: ' + (ctx.contato || 'defina a propriedade ' + PORT_PROP_CONTATO_) + ')';
  var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&addressdetails=1&accept-language=pt-BR&q=' + encodeURIComponent(q);
  var resp;
  try { resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': ua } }); } catch (e) { ctx.bloqueado = 'rede: ' + String(e).slice(0, 60); return undefined; }
  var code = resp.getResponseCode();
  if (code !== 200) { ctx.bloqueado = 'HTTP ' + code; return undefined; }
  var lista;
  try { lista = JSON.parse(resp.getContentText()); } catch (e2) { ctx.bloqueado = 'resposta inválida'; return undefined; }
  if (!lista || !lista.length) return null;
  var lat = Number(lista[0].lat), lon = Number(lista[0].lon);
  if (!portCoordsValidas_(lat, lon)) return null;
  var ad = lista[0].address || {};
  var uf = String(ad['ISO3166-2-lvl4'] || '').replace(/^BR-/, '');
  if (ufEsperada && uf && uf !== ufEsperada) return null; // achou outro estado: descarta
  return { lat: fundArred_(lat, 6), lon: fundArred_(lon, 6), uf: PORT_UFS_.indexOf(uf) !== -1 ? uf : '', cidade: String(ad.city || ad.town || ad.municipality || ad.village || '') };
}

function portRecente_(data, hoje) {
  if (!data) return false;
  return (Date.parse(hoje + 'T12:00:00Z') - Date.parse(data + 'T12:00:00Z')) / 86400000 < PORT_GEOCODE_REPETIR_DIAS_;
}

/** Coloca lat/lon (e precisão) nos imóveis do JSON, consultando o Nominatim só pro que não está no cache. Devolve quantos ganharam coordenada. */
function portAplicarGeocache_(json, ctx) {
  var ganhou = 0;
  json.imoveis.itens.forEach(function (im) {
    if (typeof im.lat === 'number') return;
    var k = im.k || portChaveGeo_(im);
    var c = ctx.cache[k];
    var usar = function (x, precisao) {
      im.lat = x.lat; im.lon = x.lon; im.precisao = precisao || x.precisao;
      if (!im.uf && x.uf) im.uf = x.uf;
      if (!im.cidade && x.cidade) im.cidade = x.cidade;
      ganhou++;
    };
    if (c && c.lat != null) { usar(c); return; }
    if (!(c && portRecente_(c.data, ctx.hoje))) {
      var achou = null, tentou = false;
      var consultas = portConsultasImovel_(im);
      for (var i = 0; i < consultas.length && !achou; i++) {
        var r = portNominatim_(consultas[i].q, ctx, im.uf);
        if (r === undefined) { ctx.pendentes++; return; } // sem tempo/limite/bloqueado: fica pra próxima, sem gravar falha
        tentou = true;
        if (r) { achou = r; achou.precisao = consultas[i].p; achou.consulta = consultas[i].q; }
      }
      if (achou) {
        ctx.cache[k] = { lat: achou.lat, lon: achou.lon, precisao: achou.precisao, consulta: achou.consulta, data: ctx.hoje, uf: achou.uf, cidade: achou.cidade };
        ctx.novos.push({ chave: k, lat: achou.lat, lon: achou.lon, precisao: achou.precisao, consulta: achou.consulta, data: ctx.hoje, uf: achou.uf, cidade: achou.cidade });
        usar(ctx.cache[k]);
        return;
      }
      if (tentou || !consultas.length) {
        ctx.cache[k] = { lat: null, lon: null, precisao: 'falhou', consulta: '', data: ctx.hoje };
        ctx.novos.push({ chave: k, lat: null, lon: null, precisao: 'falhou', consulta: '', data: ctx.hoje });
      }
    }
    // 3) só a cidade (ponto aproximado, marcado como tal)
    if (im.cidade && im.uf) {
      var kc = 'cidade ' + portNormalizar_(im.cidade + ' ' + im.uf);
      var cc = ctx.cache[kc];
      if (!cc || (cc.lat == null && !portRecente_(cc.data, ctx.hoje))) {
        var rc = portNominatim_(im.cidade + ', ' + im.uf, ctx, im.uf);
        if (rc === undefined) { ctx.pendentes++; return; }
        cc = ctx.cache[kc] = rc ? { lat: rc.lat, lon: rc.lon, precisao: 'cidade', consulta: im.cidade + ', ' + im.uf, data: ctx.hoje, uf: rc.uf, cidade: rc.cidade } : { lat: null, lon: null, precisao: 'falhou', consulta: '', data: ctx.hoje };
        ctx.novos.push({ chave: kc, lat: cc.lat, lon: cc.lon, precisao: cc.precisao, consulta: cc.consulta, data: cc.data, uf: cc.uf || '', cidade: cc.cidade || '' });
      }
      if (cc.lat != null) usar(cc, 'cidade');
    }
  });
  return ganhou;
}

// ---------------------------------------------------------------------------
// Leitura pro site (action=fiiPortfolio) e coordenadas vindas do navegador
// ---------------------------------------------------------------------------

function handleFiiPortfolio(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(montarRespostaPortfolioFii_(SpreadsheetApp.getActiveSpreadsheet(), e.parameter.ticker));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'fiiPortfolio', erro: String(erro) });
  }
}

function montarRespostaPortfolioFii_(ss, tickerBruto) {
  var ticker = String(tickerBruto || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,7}$/.test(ticker)) return { ok: false, etapa: 'fiiPortfolio', erro: 'ticker inválido' };
  var linhas = portLerLinhas_(ss);
  var l = linhas[ticker];
  if (!l || !l.json) return { ok: true, ticker: ticker, existe: false, mensagem: 'O portfólio deste FII ainda não foi montado (roda junto com a agenda diária).' };
  var fr = portUltimosFatosRelevantes_(ss)[ticker] || null;
  var cnpj = l.json.cnpj || '';
  return {
    ok: true,
    ticker: ticker,
    existe: true,
    portfolio: l.json,
    fonte: l.fonte,
    trimestre: l.trimestre,
    atualizadoEm: l.atualizadoEm instanceof Date ? l.atualizadoEm.toISOString() : String(l.atualizadoEm || ''),
    conferir: l.conferir || '',
    reprocessando: !!l.reprocessar,
    fatoRelevante: fr ? { data: fr.data, assunto: fr.assunto, link: fr.id ? FNET_BASE_URL_ + 'downloadDocumento?id=' + fr.id : null } : null,
    linkFnet: cnpj ? FNET_BASE_URL_ + 'abrirGerenciadorDocumentosCVM?cnpjFundo=' + cnpj : null,
    faltamCoordenadas: portFaltamCoords_(l.json)
  };
}

/**
 * Coordenadas achadas no navegador (quando o Nominatim recusa o Apps Script):
 * ticker + coords = JSON [{k, lat, lon, p, u, c}] (p = precisão, u = UF, c = cidade). Só aceita pontos dentro do Brasil e
 * chaves que existem no JSON do fundo; grava no cache permanente e no portfólio.
 */
function handleFiiPortfolioCoords(e) {
  try {
    var ticker = String(e.parameter.ticker || '').trim().toUpperCase();
    var coords = JSON.parse(String(e.parameter.coords || '[]'));
    if (!/^[A-Z0-9]{4,7}$/.test(ticker) || !Array.isArray(coords)) return jsonOut({ ok: false, etapa: 'fiiPortfolioCoords', erro: 'parâmetros inválidos' });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var linhas = portLerLinhas_(ss);
    var l = linhas[ticker];
    if (!l || !l.json || !l.json.imoveis) return jsonOut({ ok: false, etapa: 'fiiPortfolioCoords', erro: 'FII sem portfólio' });
    var porK = {};
    l.json.imoveis.itens.forEach(function (i) { porK[i.k] = i; });
    var ctx = { novos: [] }, salvos = 0, hoje = fundChaveDia_(new Date());
    coords.slice(0, 200).forEach(function (c) {
      var im = c && porK[c.k];
      if (!im || !portCoordsValidas_(c.lat, c.lon)) return;
      var precisao = /^(endereço|nome|cidade)$/.test(String(c.p || '')) ? c.p : 'endereço';
      im.lat = fundArred_(c.lat, 6); im.lon = fundArred_(c.lon, 6); im.precisao = precisao;
      var uf = PORT_UFS_.indexOf(String(c.u || '')) !== -1 ? c.u : '', cid = String(c.c || '').slice(0, 80);
      if (!im.uf && uf) im.uf = uf;
      if (!im.cidade && cid) im.cidade = cid;
      ctx.novos.push({ chave: c.k, lat: im.lat, lon: im.lon, precisao: precisao, consulta: 'navegador', data: hoje, uf: uf, cidade: cid });
      salvos++;
    });
    if (salvos) {
      portGravarGeocache_(ss, ctx);
      portGravarLinhas_(ss, linhas);
    }
    return jsonOut({ ok: true, salvos: salvos });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'fiiPortfolioCoords', erro: String(erro) });
  }
}
