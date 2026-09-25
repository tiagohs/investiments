/**
 * Videos.gs - 25/09/2026 (Tiago: "teríamos como incluir uma sessão de vídeos?
 * vindo do youtube? tem canais que gosto e queria filtrar por ativo/carteira").
 *
 * Sem chave de API: cada canal do YouTube tem um feed RSS público com os ~15
 * vídeos mais recentes (youtube.com/feeds/videos.xml?channel_id=...). Um
 * gatilho a cada 6h lê o feed de cada canal cadastrado e ACUMULA os vídeos na
 * aba aux_videos (guarda 1 ano) - assim o histórico vai crescendo além dos 15
 * do feed. O site só lê essa aba (rápido) e filtra:
 *  - tela do ativo: título/descrição que citam o ticker ou um apelido
 *    (ex.: "Petrobras") - o site manda os termos;
 *  - página de uma carteira: vídeos dos canais marcados com aquela carteira
 *    + vídeos de qualquer canal que citem um ticker dela.
 *
 * Os canais ficam na aba aux_videos-canais (você edita na planilha): coluna A
 * = link do canal, @nome ou ID (UC...); coluna B (opcional) = carteiras do
 * canal: acoes, fiis, acoesEua, rendaFixa (separadas por vírgula).
 *
 * Primeira vez: rode configurarVideosDireto() (cria a aba), preencha os
 * canais, rode rodarVideosDireto() e instalarGatilhoVideos().
 */

var ABA_VIDEOS_CANAIS = 'aux_videos-canais';
var ABA_VIDEOS = 'aux_videos';
var CABECALHO_VIDEOS_CANAIS = ['Canal (link, @nome ou ID UC...)', 'Carteiras (opcional: acoes, fiis, acoesEua, rendaFixa)', 'Observação'];
var CABECALHO_VIDEOS = ['ID do vídeo', 'Canal', 'Título', 'Publicado em', 'Descrição', 'Carteiras do canal', 'Atualizado em'];
var VIDEOS_DIAS_GUARDAR = 365;
var VIDEOS_MAX_RESPOSTA = 12;
var CARTEIRAS_VIDEOS = ['acoes', 'fiis', 'acoesEua', 'rendaFixa'];

// ---------------------------------------------------------------------------
// Configuração / gatilho
// ---------------------------------------------------------------------------

/** Rodar 1x: cria a aba de canais (com cabeçalho) se ainda não existe. */
function configurarVideosDireto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_VIDEOS_CANAIS);
  if (!aba) {
    aba = ss.insertSheet(ABA_VIDEOS_CANAIS);
    aba.getRange(1, 1, 1, CABECALHO_VIDEOS_CANAIS.length).setValues([CABECALHO_VIDEOS_CANAIS]);
    Logger.log('Aba ' + ABA_VIDEOS_CANAIS + ' criada. Coloque um canal por linha (link, @nome ou ID) e rode rodarVideosDireto().');
  } else {
    Logger.log('Aba ' + ABA_VIDEOS_CANAIS + ' já existe - ' + Math.max(aba.getLastRow() - 1, 0) + ' canal(is).');
  }
}

/** Rodar 1x: atualiza os vídeos a cada 6 horas. */
function instalarGatilhoVideos() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'gatilhoVideos'; });
  if (jaExiste) { Logger.log('Gatilho já existe, nada a fazer.'); return; }
  ScriptApp.newTrigger('gatilhoVideos').timeBased().everyHours(6).create();
  Logger.log('Gatilho de vídeos instalado (a cada 6 horas).');
}

function gatilhoVideos() { atualizarVideos_('Automático'); }

function rodarVideosDireto() {
  var r = atualizarVideos_('Manual');
  Logger.log(r.status + ' - ' + r.detalhe);
}

/** Botão "Vídeos" do popover Registro de Controle (shell.js). */
function handleSincronizarVideos(e) {
  try {
    return jsonOut({ ok: true, resultado: atualizarVideos_('Manual') });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'sincronizarVideos', erro: String(erro) });
  }
}

// ---------------------------------------------------------------------------
// Atualização (feeds -> aba aux_videos)
// ---------------------------------------------------------------------------

function normalizarCarteirasVideo_(texto) {
  var mapa = { acoes: 'acoes', 'ações': 'acoes', acao: 'acoes', fiis: 'fiis', fii: 'fiis', acoeseua: 'acoesEua', eua: 'acoesEua', internacional: 'acoesEua', rendafixa: 'rendaFixa', rf: 'rendaFixa', 'renda fixa': 'rendaFixa' };
  return String(texto || '').split(/[,;]/).map(function (p) {
    var k = p.trim().toLowerCase();
    return mapa[k] || mapa[k.replace(/\s+/g, '')] || null;
  }).filter(function (c, i, arr) { return c && arr.indexOf(c) === i; });
}

function lerCanaisVideos_(ss) {
  var aba = ss.getSheetByName(ABA_VIDEOS_CANAIS);
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues()
    .map(function (l) { return { entrada: String(l[0] || '').trim(), carteiras: normalizarCarteirasVideo_(l[1]) }; })
    .filter(function (c) { return c.entrada; });
}

/** ID do canal (UC...) a partir de link, @nome ou do próprio ID - guardado nas propriedades do script. */
function resolverCanalYoutube_(entrada) {
  var e = String(entrada || '').trim();
  var direto = e.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:$|[/?#])/);
  if (direto) return direto[1];
  var props = PropertiesService.getScriptProperties();
  var chaveProp = 'YT_CANAL_' + e.toLowerCase().replace(/[^a-z0-9@._-]/g, '').slice(0, 60);
  var salvo = props.getProperty(chaveProp);
  if (salvo) return salvo;
  var url;
  if (/^https?:\/\//i.test(e)) url = e;
  else if (e.charAt(0) === '@') url = 'https://www.youtube.com/' + encodeURIComponent(e).replace('%40', '@');
  else url = 'https://www.youtube.com/@' + encodeURIComponent(e);
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pt-BR' } });
  if (resp.getResponseCode() !== 200) throw new Error('canal não encontrado (' + resp.getResponseCode() + '): ' + e);
  var id = extrairIdCanalDoHtml_(resp.getContentText());
  if (!id) throw new Error('não achei o ID do canal na página: ' + e);
  props.setProperty(chaveProp, id);
  return id;
}

function extrairIdCanalDoHtml_(html) {
  var padroes = [
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    /<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{22})"/,
    /"externalId":"(UC[\w-]{22})"/,
    /"channelId":"(UC[\w-]{22})"/,
    /youtube\.com\/channel\/(UC[\w-]{22})/
  ];
  for (var i = 0; i < padroes.length; i++) {
    var m = String(html || '').match(padroes[i]);
    if (m) return m[1];
  }
  return null;
}

function buscarVideosCanal_(channelId) {
  var resp = UrlFetchApp.fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (resp.getResponseCode() !== 200) throw new Error('feed HTTP ' + resp.getResponseCode());
  return extrairVideosDoFeed_(resp.getContentText());
}

/** Lê o Atom do YouTube sem XmlService (texto simples, testável). */
function extrairVideosDoFeed_(xml) {
  var tira = function (s) {
    return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  };
  var campo = function (bloco, tag) {
    var m = bloco.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
    return m ? tira(m[1]) : '';
  };
  var canalFeed = campo(String(xml || '').split('<entry>')[0], 'title');
  var out = [];
  var re = /<entry>([\s\S]*?)<\/entry>/g, m;
  while ((m = re.exec(String(xml || ''))) !== null) {
    var b = m[1];
    var id = campo(b, 'yt:videoId');
    var data = new Date(campo(b, 'published'));
    if (!/^[\w-]{11}$/.test(id) || isNaN(data.getTime())) continue;
    out.push({
      id: id,
      canal: campo(b, 'name') || canalFeed,
      titulo: campo(b, 'title'),
      publicado: data.toISOString(),
      descricao: campo(b, 'media:description').slice(0, 600)
    });
  }
  return out;
}

function lerVideos_(ss) {
  var aba = ss.getSheetByName(ABA_VIDEOS);
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_VIDEOS.length).getValues()
    .filter(function (l) { return l[0]; })
    .map(function (l) {
      return {
        id: String(l[0]), canal: String(l[1] || ''), titulo: String(l[2] || ''),
        publicado: Object.prototype.toString.call(l[3]) === '[object Date]' ? l[3].toISOString() : String(l[3] || ''),
        descricao: String(l[4] || ''), carteiras: normalizarCarteirasVideo_(l[5])
      };
    });
}

function atualizarVideos_(origem) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var canais = lerCanaisVideos_(ss);
  if (!canais.length) return { status: 'Atenção', detalhe: 'Nenhum canal na aba ' + ABA_VIDEOS_CANAIS + ' (rode configurarVideosDireto() e cadastre os canais).', total: 0 };
  var porId = {};
  lerVideos_(ss).forEach(function (v) { porId[v.id] = v; });
  var falhas = [], novos = 0;
  canais.forEach(function (c) {
    try {
      var id = resolverCanalYoutube_(c.entrada);
      buscarVideosCanal_(id).forEach(function (v) {
        if (!porId[v.id]) novos++;
        v.carteiras = c.carteiras;
        porId[v.id] = v;
      });
    } catch (erro) {
      falhas.push(c.entrada + ' (' + String(erro).slice(0, 80) + ')');
    }
  });
  var limite = new Date(Date.now() - VIDEOS_DIAS_GUARDAR * 86400000).toISOString();
  var lista = Object.keys(porId).map(function (k) { return porId[k]; })
    .filter(function (v) { return v.publicado >= limite; })
    .sort(function (a, b) { return a.publicado < b.publicado ? 1 : -1; });
  var aba = ss.getSheetByName(ABA_VIDEOS) || ss.insertSheet(ABA_VIDEOS);
  aba.clearContents();
  aba.getRange(1, 1, 1, CABECALHO_VIDEOS.length).setValues([CABECALHO_VIDEOS]);
  var agora = new Date();
  if (lista.length) {
    aba.getRange(2, 1, lista.length, CABECALHO_VIDEOS.length).setValues(lista.map(function (v) {
      return [v.id, v.canal, v.titulo, new Date(v.publicado), v.descricao, (v.carteiras || []).join(', '), agora];
    }));
  }
  var status = falhas.length === canais.length ? 'Erro' : (falhas.length ? 'Atenção' : 'Sucesso');
  var detalhe = 'YouTube: ' + novos + ' vídeo(s) novo(s), ' + lista.length + ' guardados de ' + canais.length + ' canal(is)' +
    (falhas.length ? ' — falharam: ' + falhas.join('; ') : '');
  // só entra no Registro de Controle quando algo deu errado ou foi rodado à mão (a cada 6h seria só ruído)
  if (status !== 'Sucesso' || origem !== 'Automático') {
    try { gravarRegistroControle_(status, origem, detalhe); } catch (e) { Logger.log('Registro de Controle: ' + e); }
  }
  return { status: status, detalhe: detalhe, total: lista.length, novos: novos };
}

// ---------------------------------------------------------------------------
// Leitura pro site
// ---------------------------------------------------------------------------

function regexTermoVideo_(termo) {
  var t = String(termo || '').trim();
  if (t.length < 2) return null;
  var escapado = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^A-Za-z0-9À-ÿ])' + escapado + '($|[^A-Za-z0-9À-ÿ])', 'i');
}

/**
 * termos: ticker/apelidos (tela do ativo). carteira + tickersCarteira: página
 * de uma carteira (canal marcado com ela OU vídeo que cita um ticker dela).
 */
function filtrarVideos_(videos, opcoes) {
  var o = opcoes || {};
  var regexes = (o.termos || []).map(regexTermoVideo_).filter(Boolean);
  var regexTickers = (o.tickersCarteira || []).map(regexTermoVideo_).filter(Boolean);
  var cita = function (v, lista) {
    var texto = v.titulo + '\n' + v.descricao;
    return lista.some(function (r) { return r.test(texto); });
  };
  return videos.filter(function (v) {
    if (o.carteira) return (v.carteiras || []).indexOf(o.carteira) !== -1 || cita(v, regexTickers);
    return regexes.length ? cita(v, regexes) : false;
  }).slice(0, o.max || VIDEOS_MAX_RESPOSTA);
}

function handleVideos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var p = (e && e.parameter) || {};
    var configurado = lerCanaisVideos_(ss).length > 0;
    var videos = lerVideos_(ss);
    var termos = String(p.termos || p.ticker || '').split('|').map(function (t) { return t.trim(); }).filter(Boolean);
    var carteira = CARTEIRAS_VIDEOS.indexOf(p.carteira) !== -1 ? p.carteira : null;
    var tickersCarteira = [];
    if (carteira && carteira !== 'rendaFixa') {
      var classes = classesDaCarteiraParaProventos_(ss); // Proventos.gs
      tickersCarteira = Object.keys(classes).filter(function (t) { return classes[t] === carteira; });
    }
    var lista = filtrarVideos_(videos, { termos: termos, carteira: carteira, tickersCarteira: tickersCarteira });
    return jsonOut({
      ok: true, configurado: configurado, totalGuardados: videos.length,
      videos: lista.map(function (v) { return { id: v.id, canal: v.canal, titulo: v.titulo, publicado: v.publicado }; })
    });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'videos', erro: String(erro) });
  }
}
