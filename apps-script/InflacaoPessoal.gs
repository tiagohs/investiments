/**
 * InflacaoPessoal.gs - 28/10/2026 (Tiago, depois da live da Suno sobre "confisco inflacionário": "quero ainda o IPCA real lá,
 * mas em paralelo, quero essa ideia do IPCA real [a minha inflação]"; a parcela do apê é corrigida pela TR).
 *
 * MINHA INFLAÇÃO = média da inflação de cada despesa (aba Despesas Essenciais), ponderada pelo quanto ela pesa no gasto do mês.
 * O IPCA oficial continua em todo lugar; a minha inflação aparece EM PARALELO.
 *
 * Fontes (atualizadas 1x por dia pela agenda - etapa 'inflacaoPessoal', Agenda.gs - e na 1ª leitura sem dado):
 *   - IPCA por subitem: IBGE SIDRA, tabela 7060, variável 63 (variação mensal, %), os últimos 37 meses, todos os itens;
 *     cada índice do catálogo (INFLACAO_CATALOGO_) é resolvido pelo código do IBGE ou pelo nome, com o grupo de reserva.
 *   - TR: BCB SGS 226 (TR do período que começa no dia 1º de cada mês, % ao mês) - financiamento corrigido pela TR.
 *   - Juro em dólar: FRED DTB3 (T-bill de 3 meses, % a.a.) - dólar de equilíbrio em Aportes.
 * Guardado na aba aux_inflacao-indices (1 linha por índice: id | nome no IBGE | série JSON {'aaaa-mm': fração} | atualizado).
 * O índice de cada despesa fica na aba aux_inflacao-cesta (Despesa | Índice | Atualizado); sem linha = sugestão do site
 * (assets/js/inflacao-pessoal.js!sugerirIndice). Config (prêmio do retorno mínimo, % em dólar desejado): Propriedades.
 *
 * GET  action=inflacaoPessoal                 -> { catalogo, series, ultimoMes, cesta: { itens, mapa }, config, juroUsd }
 * POST action=salvarInflacaoPessoal           mapa (JSON { despesa: índice }), config (JSON, opcional)
 * Testes: tests/inflacao-pessoal.test.js.
 */

var INFLACAO_ABA_INDICES_ = 'aux_inflacao-indices';
var INFLACAO_ABA_CESTA_ = 'aux_inflacao-cesta';
var INFLACAO_PROP_CONFIG_ = 'inflacao_pessoal_config_v1';
var INFLACAO_MESES_ = 37;
var INFLACAO_CONFIG_PADRAO_ = { premio: 0.05, metaDolar: 0.30 };

/**
 * Catálogo de índices. `codigo`: código do IBGE (sem o ponto: '2202003' = Energia elétrica residencial); `nome`: regex no
 * nome do IBGE, quando o código não é conhecido aqui; `grupo`: código de reserva se nenhum dos dois achar.
 * Especiais: 'fixo' (0% - parcela que não muda), 'tr' (BCB), 'ipca' (índice geral).
 */
var INFLACAO_CATALOGO_ = [
  { id: 'ipca', rotulo: 'IPCA (geral)', codigo: 'geral' },
  { id: 'fixo', rotulo: 'Fixo em reais (não sobe com a inflação)', especial: true },
  { id: 'tr', rotulo: 'TR (financiamento)', especial: true },
  { id: 'alimentacaoCasa', rotulo: 'Alimentação em casa (supermercado)', codigo: '11', grupo: '1' },
  { id: 'alimentacaoFora', rotulo: 'Alimentação fora (restaurante, delivery)', codigo: '12', grupo: '1' },
  { id: 'aluguel', rotulo: 'Aluguel', codigo: '2101001', grupo: '2' },
  { id: 'condominio', rotulo: 'Condomínio', codigo: '2101002', grupo: '2' },
  { id: 'agua', rotulo: 'Água e esgoto', codigo: '2101004', grupo: '2' },
  { id: 'energia', rotulo: 'Energia elétrica', codigo: '2202003', grupo: '2' },
  { id: 'gasEncanado', rotulo: 'Gás encanado', codigo: '2201005', grupo: '2' },
  { id: 'gasBotijao', rotulo: 'Gás de botijão', codigo: '2201004', grupo: '2' },
  { id: 'limpeza', rotulo: 'Artigos de limpeza', codigo: '2104', grupo: '2' },
  { id: 'reparos', rotulo: 'Reparos da casa', codigo: '2103', grupo: '2' },
  { id: 'artigosResidencia', rotulo: 'Artigos de residência (móveis, eletro)', codigo: '3' },
  { id: 'vestuario', rotulo: 'Roupas e calçados', codigo: '4' },
  { id: 'transportes', rotulo: 'Transportes (geral)', codigo: '5' },
  { id: 'aplicativo', rotulo: 'Transporte por aplicativo (Uber, 99)', nome: /transporte por aplicativo/i, grupo: '5' },
  { id: 'transportePublico', rotulo: 'Transporte público', codigo: '5101', grupo: '5' },
  { id: 'passagemAerea', rotulo: 'Passagem aérea', codigo: '5101010', grupo: '5' },
  { id: 'gasolina', rotulo: 'Gasolina', codigo: '5104001', grupo: '5' },
  { id: 'seguroAuto', rotulo: 'Seguro do carro', codigo: '5102005', grupo: '5' },
  { id: 'saude', rotulo: 'Saúde e cuidados pessoais (geral)', codigo: '6' },
  { id: 'planoSaude', rotulo: 'Plano de saúde', nome: /^plano de sa[uú]de$/i, grupo: '6' },
  { id: 'remedios', rotulo: 'Remédios', nome: /^produtos farmac[eê]uticos$/i, grupo: '6' },
  { id: 'consultas', rotulo: 'Consultas e exames', nome: /^servi[cç]os m[eé]dicos e dent[aá]rios$/i, grupo: '6' },
  { id: 'higiene', rotulo: 'Higiene pessoal', nome: /^higiene pessoal$/i, grupo: '6' },
  { id: 'despesasPessoais', rotulo: 'Despesas pessoais (geral)', codigo: '7' },
  { id: 'empregadoDomestico', rotulo: 'Diarista / empregado doméstico', nome: /^empregado dom[eé]stico$/i, grupo: '7' },
  { id: 'recreacao', rotulo: 'Lazer (recreação)', nome: /^recrea[cç][aã]o$/i, grupo: '7' },
  { id: 'viagem', rotulo: 'Viagem (hospedagem, pacotes)', nome: /^hospedagem$/i, grupo: '7' },
  { id: 'academia', rotulo: 'Academia / atividade física', nome: /atividades? f[ií]sicas?/i, grupo: '7' },
  { id: 'animal', rotulo: 'Animal de estimação', nome: /^animal dom[eé]stico$/i, grupo: '7' },
  { id: 'educacao', rotulo: 'Educação (geral)', codigo: '8' },
  { id: 'cursos', rotulo: 'Cursos e faculdade', nome: /^cursos regulares$/i, grupo: '8' },
  { id: 'cursosLivres', rotulo: 'Cursos livres (idiomas etc.)', nome: /^cursos diversos$/i, grupo: '8' },
  { id: 'comunicacao', rotulo: 'Comunicação (geral)', codigo: '9' },
  { id: 'celular', rotulo: 'Plano de celular', nome: /plano de telefonia m[oó]vel/i, grupo: '9' },
  { id: 'internet', rotulo: 'Internet / combo com TV', nome: /combo de telefonia|acesso [àa] internet/i, grupo: '9' },
  { id: 'streaming', rotulo: 'Streaming e assinaturas digitais', nome: /streaming/i, grupo: '9' }
];

function handleInflacaoPessoal(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(montarInflacaoPessoal_(SpreadsheetApp.getActiveSpreadsheet()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'inflacaoPessoal', erro: String(erro) });
  }
}

function montarInflacaoPessoal_(ss, opcoes) {
  var o = opcoes || {};
  var guardado = lerIndicesInflacao_(ss);
  // sem nada guardado ainda (1ª vez): busca agora (a agenda mantém em dia depois)
  if (!guardado.series.ipca && o.buscarSeFaltar !== false) {
    try { atualizarIndicesInflacao_(ss, o); guardado = lerIndicesInflacao_(ss); } catch (eA) { guardado.aviso = String(eA).slice(0, 200); }
  }
  var desp = null;
  try { desp = lerDespesasOrganizacao_(ss).despesas; } catch (eD) { desp = { itens: [] }; }
  var r = {
    ok: true,
    catalogo: INFLACAO_CATALOGO_.map(function (c) { return { id: c.id, rotulo: c.rotulo, nomeIbge: guardado.nomes[c.id] || null }; }),
    series: guardado.series,
    ultimoMes: ultimoMesSerie_(guardado.series.ipca),
    atualizado: guardado.atualizado,
    cesta: {
      itens: (desp.itens || []).map(function (it) { return { nome: it.nome, valor: it.valor, frequencia: it.frequencia, categoria: it.categoria }; }),
      mapa: lerCestaInflacao_(ss)
    },
    config: lerConfigInflacao_(),
    juroUsd: guardado.juroUsd
  };
  if (guardado.aviso) r.aviso = guardado.aviso;
  return r;
}

function ultimoMesSerie_(serie) {
  var ms = Object.keys(serie || {}).sort();
  return ms.length ? ms[ms.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Atualização (agenda diária)
// ---------------------------------------------------------------------------

/** Etapa da agenda: atualiza IPCA por subitem, TR e juro em dólar. { status, detalhe }. */
function atualizarInflacaoPessoal_(origem) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var r = atualizarIndicesInflacao_(ss, {});
    return { status: r.avisos.length ? 'Atenção' : 'Sucesso', detalhe: r.detalhe + (r.avisos.length ? ' | ' + r.avisos.join('; ') : '') };
  } catch (e) {
    return { status: 'Erro', detalhe: String(e).slice(0, 300) };
  }
}

/** Rodar no editor pra conferir. */
function atualizarInflacaoPessoalDireto() { Logger.log(JSON.stringify(atualizarInflacaoPessoal_('Manual'))); }

function atualizarIndicesInflacao_(ss, opcoes) {
  var o = opcoes || {};
  var fetch = o.fetch || function (url) { return UrlFetchApp.fetch(url, { muteHttpExceptions: true }); };
  var avisos = [];
  var linhas = {}; // id -> { nome, serie }
  // 1) IPCA (todos os itens, últimos 37 meses)
  var url = 'https://apisidra.ibge.gov.br/values/t/7060/n1/1/v/63/p/last%20' + INFLACAO_MESES_ + '/c315/all';
  var resp = fetch(url);
  var codigoHttp = typeof resp.getResponseCode === 'function' ? resp.getResponseCode() : 200;
  if (codigoHttp !== 200) throw new Error('IBGE (SIDRA) respondeu HTTP ' + codigoHttp);
  var registros = JSON.parse(resp.getContentText());
  var porCodigo = itensSidraPorCodigo_(registros);
  INFLACAO_CATALOGO_.forEach(function (c) {
    if (c.especial) return;
    var achado = resolverIndiceSidra_(c, porCodigo);
    if (achado) linhas[c.id] = achado;
    else avisos.push('sem ' + c.id);
  });
  if (!linhas.ipca) throw new Error('IBGE (SIDRA): veio sem o índice geral');
  // 2) TR (BCB SGS 226): o período que começa no dia 1º de cada mês
  try {
    var hoje = new Date();
    var ini = new Date(hoje.getFullYear() - 3, hoje.getMonth(), 1);
    var urlTr = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados?formato=json&dataInicial=' + Utilities.formatDate(ini, 'America/Sao_Paulo', 'dd/MM/yyyy');
    var rTr = typeof buscarFonte_ === 'function' && !o.fetch
      ? buscarFonte_('bcb', urlTr, { ttl: 0, validar: Array.isArray })
      : { ok: true, dados: JSON.parse(fetch(urlTr).getContentText()) };
    if (rTr.ok) linhas.tr = { nome: 'TR (BCB 226)', serie: trMensal_(rTr.dados) };
    else avisos.push('TR indisponível');
  } catch (eTr) { avisos.push('TR: ' + String(eTr).slice(0, 80)); }
  // 3) juro em dólar (FRED DTB3, % a.a.)
  var juroUsd = null;
  try {
    var desde = Utilities.formatDate(new Date(Date.now() - 40 * 86400000), 'UTC', 'yyyy-MM-dd');
    var csv = fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3&cosd=' + desde).getContentText();
    juroUsd = ultimoValorFred_(csv);
    if (!juroUsd) avisos.push('juro em dólar indisponível');
  } catch (eUsd) { avisos.push('juro em dólar: ' + String(eUsd).slice(0, 80)); }
  gravarIndicesInflacao_(ss, linhas, juroUsd);
  var n = Object.keys(linhas).length;
  return { detalhe: n + ' índice(s) até ' + ultimoMesSerie_(linhas.ipca.serie), avisos: avisos };
}

/** Registros do SIDRA (1º = cabeçalho) -> { codigo: { nome, serie: { 'aaaa-mm': fração } } }. Código do índice geral = 'geral'. */
function itensSidraPorCodigo_(registros) {
  var out = {};
  (registros || []).slice(1).forEach(function (r) {
    var rotulo = String(r.D4N || '');
    var m = rotulo.match(/^(\d+)\.(.*)$/);
    var codigo = m ? m[1] : (/geral/i.test(rotulo) ? 'geral' : null);
    var v = Number(String(r.V).replace(',', '.'));
    var per = String(r.D3C || '');
    if (!codigo || !/^\d{6}$/.test(per) || !isFinite(v) || String(r.V).trim() === '' || r.V === '...' || r.V === '-') return;
    if (!out[codigo]) out[codigo] = { nome: m ? m[2].trim() : rotulo, serie: {} };
    out[codigo].serie[per.slice(0, 4) + '-' + per.slice(4)] = Math.round(v * 100) / 10000; // % -> fração (4 casas do %)
  });
  return out;
}

/** Índice do catálogo -> { nome, serie } pelo código, pelo nome (o subitem de código mais longo) ou pelo grupo. */
function resolverIndiceSidra_(c, porCodigo) {
  if (c.codigo && porCodigo[c.codigo]) return { nome: porCodigo[c.codigo].nome, serie: porCodigo[c.codigo].serie };
  if (c.nome) {
    var melhor = null;
    Object.keys(porCodigo).forEach(function (k) {
      if (k === 'geral' || !c.nome.test(porCodigo[k].nome)) return;
      if (c.grupo && k.charAt(0) !== c.grupo) return;
      if (!melhor || k.length > melhor.length) melhor = k;
    });
    if (melhor) return { nome: porCodigo[melhor].nome, serie: porCodigo[melhor].serie };
  }
  if (c.grupo && porCodigo[c.grupo]) return { nome: porCodigo[c.grupo].nome + ' (grupo)', serie: porCodigo[c.grupo].serie };
  return null;
}

/** BCB SGS 226 ([{ data, datafim, valor }]) -> { 'aaaa-mm': fração } do período que começa no dia 1º. */
function trMensal_(lista) {
  var out = {};
  (lista || []).forEach(function (x) {
    var m = String(x && x.data || '').match(/^01\/(\d{2})\/(\d{4})$/);
    var v = Number(String(x && x.valor).replace(',', '.'));
    if (m && isFinite(v)) out[m[2] + '-' + m[1]] = Math.round(v * 10000) / 1000000;
  });
  return out;
}

/** CSV do FRED ("observation_date,DTB3") -> { taxa (fração a.a.), data } do último dia com valor. */
function ultimoValorFred_(csv) {
  var linhas = String(csv || '').trim().split(/\r?\n/).slice(1);
  for (var i = linhas.length - 1; i >= 0; i--) {
    var p = linhas[i].split(',');
    var v = Number(p[1]);
    if (p.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && isFinite(v) && String(p[1]).trim() !== '' && p[1] !== '.') return { taxa: Math.round(v * 100) / 10000, data: p[0] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

function abaInflacao_(ss, nome, cab) {
  var aba = ss.getSheetByName(nome);
  if (!aba) { aba = ss.insertSheet(nome); aba.getRange(1, 1, 1, cab.length).setValues([cab]); }
  return aba;
}

function gravarIndicesInflacao_(ss, linhas, juroUsd) {
  var aba = abaInflacao_(ss, INFLACAO_ABA_INDICES_, ['Índice', 'Nome no IBGE', 'Série (JSON)', 'Atualizado']);
  var agora = new Date();
  var vals = Object.keys(linhas).map(function (id) { return [id, linhas[id].nome, JSON.stringify(linhas[id].serie), agora]; });
  if (juroUsd) vals.push(['juroUsd', 'FRED DTB3 (T-bill 3 meses)', JSON.stringify(juroUsd), agora]);
  var ultima = aba.getLastRow();
  if (ultima > 1) aba.getRange(2, 1, ultima - 1, 4).clearContent();
  if (vals.length) aba.getRange(2, 1, vals.length, 4).setValues(vals);
}

function lerIndicesInflacao_(ss) {
  var out = { series: {}, nomes: {}, juroUsd: null, atualizado: null };
  var aba = ss.getSheetByName(INFLACAO_ABA_INDICES_);
  if (!aba || aba.getLastRow() < 2) return out;
  aba.getRange(2, 1, aba.getLastRow() - 1, 4).getValues().forEach(function (l) {
    var id = String(l[0] || '').trim();
    if (!id) return;
    var dado = null;
    try { dado = JSON.parse(String(l[2] || '')); } catch (e) { dado = null; }
    if (!dado) return;
    if (id === 'juroUsd') out.juroUsd = dado;
    else { out.series[id] = dado; out.nomes[id] = String(l[1] || '') || null; }
    if (l[3] instanceof Date && (!out.atualizado || l[3].toISOString() > out.atualizado)) out.atualizado = l[3].toISOString();
  });
  return out;
}

function lerCestaInflacao_(ss) {
  var mapa = {};
  var aba = ss.getSheetByName(INFLACAO_ABA_CESTA_);
  if (!aba || aba.getLastRow() < 2) return mapa;
  aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues().forEach(function (l) {
    var nome = String(l[0] || '').trim();
    var id = String(l[1] || '').trim();
    if (nome && id) mapa[nome] = id;
  });
  return mapa;
}

function lerConfigInflacao_() {
  var cfg = { premio: INFLACAO_CONFIG_PADRAO_.premio, metaDolar: INFLACAO_CONFIG_PADRAO_.metaDolar };
  try {
    var bruto = PropertiesService.getScriptProperties().getProperty(INFLACAO_PROP_CONFIG_);
    var p = bruto ? JSON.parse(bruto) : {};
    if (typeof p.premio === 'number' && p.premio >= 0 && p.premio <= 0.3) cfg.premio = p.premio;
    if (typeof p.metaDolar === 'number' && p.metaDolar >= 0 && p.metaDolar <= 1) cfg.metaDolar = p.metaDolar;
  } catch (e) { /* padrão */ }
  return cfg;
}

/** doPost action=salvarInflacaoPessoal: mapa (JSON { despesa: índice }) substitui a cesta inteira; config opcional. */
function handleSalvarInflacaoPessoal(e) {
  try {
    var p = (e && e.parameter) || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var validos = {};
    INFLACAO_CATALOGO_.forEach(function (c) { validos[c.id] = true; });
    if (p.mapa != null) {
      var mapa;
      try { mapa = JSON.parse(p.mapa || '{}'); } catch (eJ) { return jsonOut({ ok: false, erro: 'mapa inválido (JSON)' }); }
      var linhas = [];
      var agora = new Date();
      Object.keys(mapa || {}).forEach(function (nome) {
        var id = String(mapa[nome] || '').trim();
        if (String(nome).trim() && validos[id]) linhas.push([String(nome).trim().slice(0, 120), id, agora]);
      });
      if (linhas.length > 200) return jsonOut({ ok: false, erro: 'despesas demais (máx. 200)' });
      var aba = abaInflacao_(ss, INFLACAO_ABA_CESTA_, ['Despesa', 'Índice', 'Atualizado']);
      var ultima = aba.getLastRow();
      if (ultima > 1) aba.getRange(2, 1, ultima - 1, 3).clearContent();
      if (linhas.length) aba.getRange(2, 1, linhas.length, 3).setValues(linhas);
    }
    if (p.config != null) {
      var cfg;
      try { cfg = JSON.parse(p.config || '{}'); } catch (eC) { return jsonOut({ ok: false, erro: 'config inválida (JSON)' }); }
      var atual = lerConfigInflacao_();
      if (typeof cfg.premio === 'number') { if (!(cfg.premio >= 0 && cfg.premio <= 0.3)) return jsonOut({ ok: false, erro: 'prêmio entre 0% e 30%' }); atual.premio = cfg.premio; }
      if (typeof cfg.metaDolar === 'number') { if (!(cfg.metaDolar >= 0 && cfg.metaDolar <= 1)) return jsonOut({ ok: false, erro: '% em dólar entre 0% e 100%' }); atual.metaDolar = cfg.metaDolar; }
      PropertiesService.getScriptProperties().setProperty(INFLACAO_PROP_CONFIG_, JSON.stringify(atual));
    }
    return jsonOut({ ok: true, mapa: lerCestaInflacao_(ss), config: lerConfigInflacao_() });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}
