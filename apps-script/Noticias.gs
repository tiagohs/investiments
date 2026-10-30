/**
 * Noticias.gs - 30/10/2026 (Tiago: tela dedicada a notícias - docs/noticias.md, ADR-N1/N4).
 *
 * O Worker do Cloudflare busca as notícias e os vídeos sozinho (worker/src/noticias/coleta.js). Daqui sai só o que
 * mora na planilha: a tela `noticiasConfig`, publicada com as outras (Publicacao.gs!familiasLeitura_):
 *  - canais: aux_videos-canais (a mesma aba dos vídeos dos ativos). Coluna D (opcional) = em que aba da tela de
 *    Notícias o canal entra: "noticias", "especialistas" ou "meus" ("não" = fica fora). Vazia: @infomoney e @uol vão
 *    para Notícias, @ProfessorBaroni e @josekoborioficial para Especialistas, o resto para Meus canais.
 *  - ativos: os da carteira com posição (Auxiliar_ativos), com o nome - o Worker busca as notícias de cada um.
 * O ID do canal (UC...) sai de resolverCanalYoutube_ (Videos.gs), guardado nas propriedades depois da 1ª vez.
 *
 * 30/10/2026 (2): `noticiasGoogle` - o Google Notícias recusa os pedidos do Cloudflare (503/sem resposta), então as buscas
 * dele saem daqui: as manchetes de cada índice (24 h) e as notícias de cada ativo da carteira (as MESMAS da tela do ativo,
 * com o mesmo cache de 2 h - buscarNoticiasAtivo_). Só busca o que não está em cache, tudo num fetchAll. Vai junto da
 * publicação das cotações (a cada 30 min no pregão); o cron do Worker junta nas telas noticiasMercado e noticiasAtivos.
 */

var NOTICIAS_TELA_PADRAO_ = { '@infomoney': 'noticias', '@uol': 'noticias', '@professorbaroni': 'especialistas', '@josekoborioficial': 'especialistas' };
var NOTICIAS_CABECALHO_TELA_ = 'Tela de notícias (noticias, especialistas, meus ou não)';

/** Rodar 1x (opcional): põe o título da coluna D na aba aux_videos-canais. */
function configurarNoticiasDireto() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_VIDEOS_CANAIS);
  if (!aba) { Logger.log('Aba ' + ABA_VIDEOS_CANAIS + ' não existe: rode configurarVideosDireto() antes.'); return; }
  var celula = aba.getRange(1, 4);
  if (!String(celula.getValue() || '').trim()) celula.setValue(NOTICIAS_CABECALHO_TELA_);
  Logger.log('Coluna D de ' + ABA_VIDEOS_CANAIS + ': ' + NOTICIAS_CABECALHO_TELA_);
}

/** Texto da coluna D (ou o padrão pelo @nome) -> 'noticias' | 'especialistas' | 'meus' | null (fora da tela). */
function telaNoticiasDoCanal_(entrada, texto) {
  var t = semAcentoVideo_(String(texto || '').trim().toLowerCase());
  if (t) {
    if (/^(nao|fora|nenhuma?)$/.test(t)) return null;
    if (/^noticia/.test(t) || t === 'uol') return 'noticias';
    if (/^especialista/.test(t)) return 'especialistas';
    return 'meus';
  }
  var e = String(entrada || '').trim().toLowerCase();
  var arroba = e.match(/@[\w.-]+/);
  return NOTICIAS_TELA_PADRAO_[arroba ? arroba[0] : e] || 'meus';
}

/** Nome curto do canal pra mostrar enquanto o feed não foi lido (o Worker troca pelo nome do feed). */
function nomeCurtoCanalNoticias_(entrada) {
  var e = String(entrada || '').trim();
  var arroba = e.match(/@([\w.-]+)/);
  if (arroba) return arroba[1];
  return e.replace(/^https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|user\/)?/i, '').replace(/[/?#].*$/, '') || e;
}

function lerCanaisNoticias_(ss) {
  var aba = ss.getSheetByName(ABA_VIDEOS_CANAIS);
  if (!aba || aba.getLastRow() < 2) return [];
  var largura = Math.max(Math.min(aba.getLastColumn(), 4), 1);
  var out = [];
  aba.getRange(2, 1, aba.getLastRow() - 1, largura).getValues().forEach(function (l) {
    var entrada = String(l[0] || '').trim();
    if (!entrada) return;
    var tela = telaNoticiasDoCanal_(entrada, largura >= 4 ? l[3] : '');
    if (!tela) return;
    var id = null;
    try { id = resolverCanalYoutube_(entrada); } catch (e) { id = null; }
    out.push({ entrada: entrada, id: id, nome: nomeCurtoCanalNoticias_(entrada), tela: tela });
  });
  return out;
}

function lerAtivosNoticias_(ss) {
  var aba = ss.getSheetByName(ABA_AUXILIAR_ATIVOS_CLASSES);
  if (!aba || aba.getLastRow() < LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES) return [];
  var classe = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações EUA': 'acoesEua' };
  var vistos = {};
  var out = [];
  aba.getRange(LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES, 1, aba.getLastRow() - LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES + 1, 8).getValues().forEach(function (l) {
    var c = classe[l[0]];
    var ticker = String(l[1] || '').trim().toUpperCase();
    if (!c || !ticker || vistos[ticker] || !(Number(l[7]) > 0)) return;
    vistos[ticker] = true;
    out.push({ ticker: ticker, classe: c, nome: String(l[2] || '').trim() || null });
  });
  return out;
}

function handleNoticiasConfig(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return jsonOut({ ok: true, canais: lerCanaisNoticias_(ss), ativos: lerAtivosNoticias_(ss) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'noticiasConfig', erro: String(erro) });
  }
}

var NOTICIAS_CONSULTAS_INDICE_ = {
  ibov: 'Ibovespa OR "bolsa brasileira" when:1d',
  ifix: '"fundos imobiliários" OR IFIX OR FIIs when:1d',
  spx: '"Wall Street" OR "S&P 500" OR Nasdaq OR "Federal Reserve" when:1d',
  dolar: 'dólar OR câmbio when:1d'
};
// Calendário do IBGE (a API não responde ao Cloudflare): as pesquisas que mexem com o mercado - a lista e os nomes são os
// de worker/src/noticias/coleta.js!PRODUTOS_IBGE (o teste confere). Cache de 12 h.
var NOTICIAS_PRODUTOS_IBGE_ = ['9256', '9260', '9300', '9171', '9227', '9229', '9294'];
var NOTICIAS_TTL_IBGE_ = 12 * 60 * 60;
var NOTICIAS_CACHE_INDICE_ = 'noticias_indice_v1_';
// "Atualizar" da tela de Notícias: nesta execução o Google é buscado de novo (sem o cache) - no máximo 1 vez a cada 4 min
var NOTICIAS_FORCAR_ = false;
var NOTICIAS_PROP_FORCADO_ = 'NOTICIAS_FORCADO_EM';
var NOTICIAS_INTERVALO_FORCAR_MS_ = 4 * 60 * 1000;

/** Liga o "sem cache" nesta execução se o último forçado tiver mais de 4 min. Devolve se ligou. */
function noticiasForcadoAgora_(agoraMs) {
  var agora = agoraMs || Date.now();
  var props = PropertiesService.getScriptProperties();
  var antes = Number(props.getProperty(NOTICIAS_PROP_FORCADO_)) || 0;
  if (agora - antes < NOTICIAS_INTERVALO_FORCAR_MS_) return false;
  props.setProperty(NOTICIAS_PROP_FORCADO_, String(agora));
  NOTICIAS_FORCAR_ = true;
  return true;
}
var NOTICIAS_TTL_INDICE_ = 20 * 60;

function urlGoogleNoticiasIndice_(indice) {
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(NOTICIAS_CONSULTAS_INDICE_[indice]) + '&hl=pt-BR&gl=BR&ceid=BR:pt-419';
}

/** { ok, em, indices: { ibov: [...] }, ativos: { TICKER: [...] }, ibge: { produto: { items } }, buscadas, falhas }. opcoes.fetchAll troca o UrlFetchApp nos testes. */
function noticiasGoogle_(opcoes) {
  var o = opcoes || {};
  var fetchAll = o.fetchAll || function (pedidos) { return UrlFetchApp.fetchAll(pedidos); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = CacheService.getScriptCache();
  var alvos = Object.keys(NOTICIAS_CONSULTAS_INDICE_).map(function (i) {
    return { tipo: 'indice', id: i, chave: NOTICIAS_CACHE_INDICE_ + i, url: urlGoogleNoticiasIndice_(i), max: 25, ttl: NOTICIAS_TTL_INDICE_ };
  }).concat(NOTICIAS_PRODUTOS_IBGE_.map(function (id) {
    return { tipo: 'ibge', id: id, chave: 'noticias_ibge_v1_' + id, url: 'https://servicodados.ibge.gov.br/api/v3/calendario/' + id + '?qtd=4', ttl: NOTICIAS_TTL_IBGE_ };
  })).concat(lerAtivosNoticias_(ss).map(function (a) {
    return { tipo: 'ativo', id: a.ticker, chave: ATIVO_CACHE_NOTICIAS_PREFIXO + a.ticker, url: urlNoticiasAtivo_(a.ticker, a.nome, a.classe), max: 10, ttl: ATIVO_CACHE_NOTICIAS_TTL };
  }));
  var guardadas = {};
  var forcar = o.forcar || NOTICIAS_FORCAR_;
  // forçado: índices e ativos de novo; o IBGE (muda 1x por mês) continua do cache
  if (forcar) alvos.filter(function (x) { return x.tipo === 'ibge'; }).forEach(function (x) { try { var g = cache.get(x.chave); if (g) guardadas[x.chave] = g; } catch (e) { /* busca */ } });
  else try { guardadas = cache.getAll(alvos.map(function (x) { return x.chave; })) || {}; } catch (e) { guardadas = {}; }
  var out = { ok: true, em: new Date().toISOString(), indices: {}, ativos: {}, ibge: {}, buscadas: 0, falhas: 0 };
  var pr = function (x, itens) { if (x.tipo === 'indice') out.indices[x.id] = itens; else if (x.tipo === 'ibge') out.ibge[x.id] = itens; else out.ativos[x.id] = itens; };
  var faltam = [];
  alvos.forEach(function (x) {
    var g = guardadas[x.chave];
    if (g) { try { pr(x, JSON.parse(g)); return; } catch (e) { /* busca de novo */ } }
    faltam.push(x);
  });
  if (faltam.length) {
    var respostas = [];
    try {
      respostas = fetchAll(faltam.map(function (x) { return { url: x.url, muteHttpExceptions: true, followRedirects: true }; }));
    } catch (e) { respostas = []; }
    faltam.forEach(function (x, i) {
      var r = respostas[i];
      out.buscadas++;
      if (!r || r.getResponseCode() !== 200) { out.falhas++; return; }
      var itens;
      if (x.tipo === 'ibge') {
        // só o que o Worker usa (a descrição do produto tem HTML e passa de 1 KB)
        try {
          itens = { items: (JSON.parse(r.getContentText()).items || []).map(function (i) {
            return { data_divulgacao: i.data_divulgacao, mes_referencia_fim: i.mes_referencia_fim, ano_referencia_fim: i.ano_referencia_fim };
          }) };
        } catch (e) { out.falhas++; return; }
      } else itens = extrairItensRss_(r.getContentText()).slice(0, x.max);
      pr(x, itens);
      try { cache.put(x.chave, JSON.stringify(itens), x.ttl); } catch (e) { /* cache é só otimização */ }
    });
  }
  return out;
}

function handleNoticiasGoogle(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var r = noticiasGoogle_();
    delete r.em; delete r.buscadas; // o hash da publicação só muda quando as notícias mudam
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'noticiasGoogle', erro: String(erro) });
  }
}
