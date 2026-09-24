/**
 * Ativo.gs - 25/09/2026: tela "Detalhe do ativo" (ativo/index.html).
 *
 * action=ativo&ref=<ticker>        - ações, FIIs, ações EUA
 * action=ativo&ref=rf:<nome>|<inst> - um título de renda fixa
 * action=noticiasAtivo&ticker=&nome= - notícias (Google Notícias, RSS), com cache
 * action=tesesAtivo&ticker=         - teses salvas no Google Drive (pasta privada)
 *
 * Tudo sai das MESMAS abas que o resto do app já usa - a tela só junta,
 * por ativo, o que as Carteiras/Proventos mostram por classe:
 *  - posição e indicadores: Auxiliar_ativos (via montarCarteiraClasse_,
 *    igual à tabela de Carteiras - preço-teto e viés inclusive) e, pra renda
 *    fixa, montarCarteirasRendaFixa_;
 *  - série diária do ativo: aux_historico-patrimonio (cotas, preço, valor,
 *    câmbio) / aux_historico-renda-fixa (valor do título);
 *  - extrato: Transações / Transações - USA / Transações Renda Fixa e a aba
 *    Proventos / Proventos - USA;
 *  - a receber: montarProventosAnunciados_ (B3 + FNet + lançados futuros);
 *  - índices (CDI, IPCA, Ibovespa, IFIX, S&P 500, dólar): a série da Início
 *    (montarSerieHistoricoInicio_, em cache).
 * Os cálculos (rentabilidade no período, aplicado x saldo, histórico mensal)
 * ficam no front (assets/js/pages/ativo-calc.js), testados.
 */

var ATIVO_CACHE_NOTICIAS_TTL = 2 * 60 * 60; // 2h
var PROP_PASTA_TESES = 'TESES_PASTA_ID';

function handleAtivo(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var ref = String((e.parameter && e.parameter.ref) || '').trim();
    if (!ref) return jsonOut({ ok: false, etapa: 'ativo', erro: 'parâmetro "ref" obrigatório' });
    return jsonOut(montarTelaAtivo_(ref));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'ativo', erro: String(erro) });
  }
}

function handleNoticiasAtivo(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut({ ok: true, noticias: buscarNoticiasAtivo_(e.parameter.ticker, e.parameter.nome, e.parameter.classe) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'noticias', erro: String(erro) });
  }
}

function handleTesesAtivo(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(montarTesesAtivo_(e.parameter.ticker));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'teses', erro: String(erro) });
  }
}

// ---------------------------------------------------------------------------
// Tela do ativo
// ---------------------------------------------------------------------------

function montarTelaAtivo_(ref) {
  if (/^rf:/i.test(ref)) return montarTelaAtivoRendaFixa_(ref.slice(3));
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ticker = ref.toUpperCase();
  var hoje = chaveDiaISOInicio_(new Date());
  var classes = classesDaCarteiraParaProventos_(ss);
  var classe = classes[ticker] || null;

  // posição de hoje (mesma linha da tabela de Carteiras)
  var ativo = null;
  var nomesClasse = { acoes: 'Ações', fiis: 'FIIs', acoesEua: 'Ações EUA' };
  var ordem = classe ? [classe] : ['acoes', 'fiis', 'acoesEua'];
  for (var i = 0; i < ordem.length && !ativo; i++) {
    try {
      var dados = montarCarteiraClasse_(nomesClasse[ordem[i]]);
      if (ordem[i] === 'fiis') { try { enriquecerAtivosComCarteiraFiis_(dados.ativos); } catch (eF) { /* extras opcionais */ } }
      var achado = (dados.ativos || []).filter(function (a) { return String(a.ticker).toUpperCase() === ticker; })[0];
      if (achado) { ativo = achado; classe = ordem[i]; }
    } catch (eC) { /* classe sem aba: segue */ }
  }

  var mapas = mapasDoPatrimonioParaProventos_(ss);
  var serie = serieDoAtivo_(ss, ticker);
  if (!classe) {
    var linhaClasse = serie.length ? serie[0].classeBruta : null;
    classe = linhaClasse === 'USA' ? 'acoesEua' : (/11$/.test(ticker) ? 'fiis' : 'acoes');
  }
  var emDolar = classe === 'acoesEua';
  var transacoes = transacoesDoAtivo_(ss, ticker, emDolar, mapas.mapaCambioUsd);
  var proventos = proventosDoAtivo_(ss, ticker, mapas.mapaCambioUsd);
  var anunciados = { aReceber: [], pagosNaoLancados: [] };
  try {
    var a = montarProventosAnunciados_(null, { mapaCambioUsd: mapas.mapaCambioUsd });
    anunciados.aReceber = a.aReceber.filter(function (p) { return p.ticker === ticker; });
    anunciados.pagosNaoLancados = a.pagosNaoLancados.filter(function (p) { return p.ticker === ticker; });
  } catch (eA) { /* sem anúncios */ }

  var faixa52 = null;
  if (classe === 'fiis') { try { faixa52 = faixa52DaCarteiraFiis_(ss, ticker); } catch (eF52) { faixa52 = null; } }

  var primeiraData = serie.length ? serie[0].data : (transacoes.length ? transacoes[0].data : hoje);
  return {
    ok: true,
    hoje: hoje,
    tipo: 'rv',
    ticker: ticker,
    classe: classe,
    moeda: emDolar ? 'USD' : 'BRL',
    ativo: ativo,
    serie: serie.map(function (p) { return { data: p.data, cotas: p.cotas, preco: p.preco, valor: p.valor, cambio: p.cambio, valorBrl: p.valorBrl }; }),
    transacoes: transacoes,
    proventos: proventos,
    aReceber: anunciados.aReceber,
    pagosNaoLancados: anunciados.pagosNaoLancados,
    faixa52: faixa52,
    indices: indicesDesde_(primeiraData)
  };
}

/**
 * Mín./máx. de 52 semanas que a própria aba "Carteira FIIs" já traz (colunas
 * O e P). Ações e ações EUA não têm isso na planilha: o front calcula pela
 * série do período em carteira (e avisa quando é menos de 1 ano).
 */
function faixa52DaCarteiraFiis_(ss, ticker) {
  var aba = ss.getSheetByName(ABA_CARTEIRA_FIIS_CLASSES);
  if (!aba || aba.getLastRow() < LINHA_DADOS_CARTEIRA_FIIS_CLASSES) return null;
  var linhas = aba.getRange(LINHA_DADOS_CARTEIRA_FIIS_CLASSES, 1, aba.getLastRow() - LINHA_DADOS_CARTEIRA_FIIS_CLASSES + 1, 16).getValues();
  for (var i = 0; i < linhas.length; i++) {
    if (String(linhas[i][0] || '').trim().toUpperCase() !== ticker) continue;
    var min = linhas[i][14], max = linhas[i][15];
    if (typeof min !== 'number' || typeof max !== 'number' || !(min > 0) || !(max >= min)) return null;
    return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, fonte: 'Carteira FIIs' };
  }
  return null;
}

/** aux_historico-patrimonio de 1 ticker, 1 ponto por dia (o último do dia), em ordem. */
function serieDoAtivo_(ss, ticker) {
  var aba = ss.getSheetByName(ABA_PATRIMONIO_INICIO);
  if (!aba || aba.getLastRow() < 2) return [];
  var porDia = {};
  aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues().forEach(function (l) {
    if (String(l[1] || '').trim().toUpperCase() !== ticker || !(l[0] instanceof Date)) return;
    var chave = chaveDiaISOInicio_(l[0]);
    var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
    var r2 = function (v) { return v == null ? null : Math.round(v * 100) / 100; };
    // valores com 2 casas (a planilha guarda dízimas longas - só pesam na resposta)
    porDia[chave] = { data: chave, classeBruta: l[2], cotas: num(l[3]), preco: num(l[4]), valor: r2(num(l[5])), cambio: num(l[6]), valorBrl: r2(num(l[7])) };
  });
  var hoje = chaveDiaISOInicio_(new Date());
  return Object.keys(porDia).filter(function (k) { return k <= hoje; }).sort().map(function (k) { return porDia[k]; });
}

/**
 * Compras e vendas do ticker (Transações ou Transações - USA), na moeda do
 * ativo. `totalBrl`: o total em reais (em dólar: x câmbio do dia, o mesmo
 * de FluxoCaixaInicio.gs) - é o que entra no gráfico de rentabilidade.
 */
function transacoesDoAtivo_(ss, ticker, emDolar, mapaCambioUsd) {
  var chavesCambio = Object.keys(mapaCambioUsd || {}).sort();
  var aba = ss.getSheetByName(emDolar ? ABA_TRANSACOES_USA_FLUXO : ABA_TRANSACOES_BR_FLUXO);
  if (!aba || aba.getLastRow() < LINHA_DADOS_TRANSACOES_FLUXO) return [];
  var out = [];
  aba.getRange(LINHA_DADOS_TRANSACOES_FLUXO, 1, aba.getLastRow() - LINHA_DADOS_TRANSACOES_FLUXO + 1, 12).getValues().forEach(function (l) {
    if (String(l[0] || '').trim().toUpperCase() !== ticker || !(l[1] instanceof Date)) return;
    var tipo = String(l[2] || '').trim();
    if (!/compra|venda/i.test(tipo)) return;
    var qtd = Number(l[4]) || 0;
    var preco = Number(l[3]) || 0;
    var taxa = Number(l[5]) || 0;
    var total = typeof l[7] === 'number' ? l[7] : preco * qtd + taxa;
    var chave = chaveDiaISOInicio_(l[1]);
    var cambio = emDolar ? (chavesCambio.length ? cambioUsdParaData_(mapaCambioUsd, chavesCambio, chave) : null) : 1;
    out.push({
      data: chave, tipo: /venda/i.test(tipo) ? 'Venda' : 'Compra', preco: preco, quantidade: qtd, taxa: taxa,
      total: Math.round(total * 100) / 100,
      cambio: emDolar ? cambio : null,
      totalBrl: cambio ? Math.round(total * cambio * 100) / 100 : null,
      lucro: typeof l[11] === 'number' ? Math.round(l[11] * 100) / 100 : null
    });
  });
  return out.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
}

/** Proventos recebidos do ticker (aba Proventos / Proventos - USA), com o valor em reais. */
function proventosDoAtivo_(ss, ticker, mapaCambioUsd) {
  var hoje = chaveDiaISOInicio_(new Date());
  var chaves = Object.keys(mapaCambioUsd || {}).sort();
  return lerLinhasAbaProventos_(ss).filter(function (p) { return p.ticker === ticker && p.dataPagamento <= hoje && p.tipo !== 'Juros'; })
    .map(function (p) {
      var cambio = p.moeda === 'USD' ? (chaves.length ? cambioUsdParaData_(mapaCambioUsd, chaves, p.dataPagamento) : null) : 1;
      var liquido = Math.round(p.liquido * 100) / 100;
      return {
        dataCom: p.dataCom, dataPagamento: p.dataPagamento, tipo: normalizarTipoProvento_(p.tipo),
        quantidade: p.quantidade, valorPorCota: p.valorPorCota, liquido: liquido, moeda: p.moeda,
        cambio: p.moeda === 'USD' ? cambio : null,
        valor: cambio ? Math.round(liquido * cambio * 100) / 100 : null
      };
    })
    .sort(function (a, b) { return a.dataPagamento < b.dataPagamento ? -1 : (a.dataPagamento > b.dataPagamento ? 1 : 0); });
}

/** Índices da série da Início (em cache) a partir de uma data. */
function indicesDesde_(dataInicial) {
  var serie = [];
  try { serie = montarSerieHistoricoInicio_(); } catch (e) { return []; }
  var desde = dataInicial ? somarDiasChaveAtivo_(dataInicial, -7) : '0000-00-00';
  return serie.filter(function (p) { return p.data >= desde; }).map(function (p) {
    return { data: p.data, cdi: p.indiceCdi, ipca: p.indiceIpca, ibovespa: p.ibovespa, ifix: p.ifix, sp500: p.sp500, cambioUsd: p.cambioUsd, patrimonio: p.patrimonio };
  });
}

function somarDiasChaveAtivo_(chave, dias) {
  var p = chave.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]) + dias * 86400000);
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

// ---------------------------------------------------------------------------
// Renda fixa: 1 título (nome | instituição)
// ---------------------------------------------------------------------------

function montarTelaAtivoRendaFixa_(chave) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = chaveDiaISOInicio_(new Date());
  var partes = String(chave).split('|');
  var nome = String(partes[0] || '').trim();
  var inst = normalizarInstituicaoRF_(partes[1] || '');
  var carteira = montarCarteirasRendaFixa_();
  var ativo = (carteira.ativos || []).filter(function (a) {
    return String(a.nomePersonalizado || '').trim().toUpperCase() === nome.toUpperCase() && normalizarInstituicaoRF_(a.instituicao) === inst;
  })[0] || null;
  var casa = function (produto, instituicao) { return casaTituloRf_(nome, inst, produto, instituicao); };

  // série diária do título (aux_historico-renda-fixa)
  var serie = [];
  var aba = ss.getSheetByName(ABA_HISTORICO_RF);
  if (aba && aba.getLastRow() >= 2) {
    var porDia = {};
    aba.getRange(2, 1, aba.getLastRow() - 1, 6).getValues().forEach(function (l) {
      if (!(l[0] instanceof Date) || !casa(l[1], l[2])) return;
      var k = chaveDiaISOInicio_(l[0]);
      if (k > hoje || typeof l[5] !== 'number') return;
      porDia[k] = (porDia[k] || 0) + l[5];
    });
    serie = Object.keys(porDia).sort().map(function (k) { return { data: k, valor: Math.round(porDia[k] * 100) / 100 }; });
  }

  // movimentações (Transações Renda Fixa)
  var transacoes = [];
  var abaT = ss.getSheetByName('Transações Renda Fixa');
  if (abaT && abaT.getLastRow() >= 7) {
    abaT.getRange(7, 1, abaT.getLastRow() - 6, 8).getValues().forEach(function (l) {
      if (!(l[1] instanceof Date) || !casa(l[0], l[4])) return;
      var mov = String(l[2] || '').trim();
      var valor = Number(l[7]) || 0;
      transacoes.push({
        data: chaveDiaISOInicio_(l[1]), tipo: mov || String(l[3] || ''), entradaSaida: String(l[3] || ''),
        quantidade: Number(l[5]) || 0, preco: Number(l[6]) || 0, total: Math.round(valor * 100) / 100
      });
    });
    transacoes.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
  }

  var primeira = serie.length ? serie[0].data : (transacoes.length ? transacoes[0].data : hoje);
  return {
    ok: true, hoje: hoje, tipo: 'rf', ticker: nome, classe: 'rendaFixa', moeda: 'BRL',
    ativo: ativo, benchmarks: carteira.benchmarks || null,
    serie: serie, transacoes: transacoes, proventos: [], aReceber: [], pagosNaoLancados: [],
    indices: indicesDesde_(primeira)
  };
}

/**
 * O título da Carteira Renda Fixa é o mesmo produto do histórico/Transações?
 * Tesouro: mesmo nome + mesma instituição. LCI/LCA/CDB: na Carteira o nome é
 * livre ("LCI - BANCO INTER S/A") e nas Transações é o código
 * ("LCI - 26I02621944") - casa pelo tipo + instituição, igual a
 * custoPepsDoTituloRf_ (CarteirasRendaFixa.gs).
 */
function casaTituloRf_(nomeCarteira, instCarteiraNorm, produto, instituicao) {
  if (normalizarInstituicaoRF_(instituicao) !== instCarteiraNorm) return false;
  var a = String(nomeCarteira || '').trim().toUpperCase(), b = String(produto || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  var tipo = a.split(/[\s-]/)[0];
  return ['LCI', 'LCA', 'CDB'].indexOf(tipo) >= 0 && b.split(/[\s-]/)[0] === tipo;
}

// ---------------------------------------------------------------------------
// Notícias (Google Notícias - RSS público), 2h de cache por ticker
// ---------------------------------------------------------------------------

function buscarNoticiasAtivo_(ticker, nome, classe) {
  ticker = String(ticker || '').trim().toUpperCase();
  if (!ticker) return [];
  var cache = CacheService.getScriptCache();
  var chave = 'noticias_v1_' + ticker;
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);
  var nomeLimpo = String(nome || '').replace(/\b(S\.?A\.?|Inc\.?|Ltd\.?|N\.V\.|FII|Fundo de Investimento Imobili[aá]rio)\b/gi, '').replace(/\s+/g, ' ').trim();
  var termo = nomeLimpo ? ('"' + ticker + '" OR "' + nomeLimpo + '"') : ('"' + ticker + '"');
  var emIngles = classe === 'acoesEua';
  var url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(termo + ' when:60d') +
    (emIngles ? '&hl=en-US&gl=US&ceid=US:en' : '&hl=pt-BR&gl=BR&ceid=BR:pt-419');
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) return [];
  var itens = extrairItensRss_(resp.getContentText()).slice(0, 10);
  try { cache.put(chave, JSON.stringify(itens), ATIVO_CACHE_NOTICIAS_TTL); } catch (e) { /* cache é só otimização */ }
  return itens;
}

/** Lê <item> de um RSS 2.0 sem depender de XmlService (texto simples, testável). */
function extrairItensRss_(xml) {
  var itens = [];
  var tira = function (s) {
    return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  };
  var campo = function (bloco, tag) {
    var m = bloco.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
    return m ? tira(m[1]) : '';
  };
  var re = /<item>([\s\S]*?)<\/item>/g, m;
  while ((m = re.exec(String(xml || ''))) !== null) {
    var bloco = m[1];
    var titulo = campo(bloco, 'title');
    var fonte = campo(bloco, 'source');
    if (fonte && titulo.slice(-(fonte.length + 3)) === ' - ' + fonte) titulo = titulo.slice(0, -(fonte.length + 3));
    var data = new Date(campo(bloco, 'pubDate'));
    var link = campo(bloco, 'link');
    if (!titulo || !/^https?:\/\//.test(link)) continue;
    itens.push({ titulo: titulo, link: link, fonte: fonte || null, data: isNaN(data.getTime()) ? null : data.toISOString() });
  }
  return itens.sort(function (a, b) { return (b.data || '') < (a.data || '') ? -1 : 1; });
}

// ---------------------------------------------------------------------------
// Teses (Google Drive privado): <pasta>/<TICKER>/<dd:mm:aaaa>.pdf + resumos.json
// ---------------------------------------------------------------------------

/**
 * Rode 1 vez no editor do Apps Script depois de subir a pasta "teses" pro
 * seu Google Drive: acha a pasta (pelo nome, ou pelo ID que você passar),
 * guarda o ID e pede a autorização de leitura do Drive. Mostra no log o que
 * achou.
 */
function configurarPastaTesesDireto(idOpcional) {
  var pasta = null;
  if (idOpcional) pasta = DriveApp.getFolderById(idOpcional);
  else {
    var it = DriveApp.getFoldersByName('teses');
    if (it.hasNext()) pasta = it.next();
  }
  if (!pasta) throw new Error('Não achei a pasta "teses" no seu Drive. Suba a pasta ou rode configurarPastaTesesDireto("<id da pasta>").');
  PropertiesService.getScriptProperties().setProperty(PROP_PASTA_TESES, pasta.getId());
  var sub = pasta.getFolders(), n = 0;
  while (sub.hasNext()) { var s = sub.next(); var f = s.getFiles(), q = 0; while (f.hasNext()) { f.next(); q++; } Logger.log(s.getName() + ': ' + q + ' arquivo(s)'); n++; }
  Logger.log('Pasta de teses configurada: ' + pasta.getName() + ' (' + n + ' ativos)');
}

function montarTesesAtivo_(ticker) {
  ticker = String(ticker || '').trim().toUpperCase();
  var id = PropertiesService.getScriptProperties().getProperty(PROP_PASTA_TESES);
  if (!id) return { ok: true, configurado: false, teses: [], resumos: [] };
  var pasta = DriveApp.getFolderById(id);
  var teses = [];
  var sub = pasta.getFoldersByName(ticker);
  if (sub.hasNext()) {
    var arquivos = sub.next().getFiles();
    while (arquivos.hasNext()) {
      var f = arquivos.next();
      if (!/pdf$/i.test(f.getMimeType()) && !/\.pdf$/i.test(f.getName())) continue;
      teses.push({ data: dataDoNomeTese_(f.getName()), nome: f.getName(), id: f.getId(),
        preview: 'https://drive.google.com/file/d/' + f.getId() + '/preview',
        abrir: 'https://drive.google.com/file/d/' + f.getId() + '/view' });
    }
  }
  teses.sort(function (a, b) { return (b.data || '') < (a.data || '') ? -1 : 1; });
  var resumos = [];
  var r = pasta.getFilesByName('resumos.json');
  if (r.hasNext()) {
    try { resumos = (JSON.parse(r.next().getBlob().getDataAsString('UTF-8')).teses || {})[ticker] || []; } catch (e) { resumos = []; }
  }
  return { ok: true, configurado: true, teses: teses, resumos: resumos };
}

/** "21:08:2026.pdf" / "21/08/2026.pdf" / "21-08-2026.pdf" / "2026-08-21.pdf" -> "2026-08-21". */
function dataDoNomeTese_(nome) {
  var s = String(nome || '');
  var m = s.match(/(\d{2})[:\/._-](\d{2})[:\/._-](\d{4})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = s.match(/(\d{4})[:\/._-](\d{2})[:\/._-](\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}
