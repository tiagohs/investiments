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
 *    (ex.: "Petrobras" - apelidos em assets/data/ativos-sobre.json, o site
 *    manda) + os termos extras da aba aux_videos-termos;
 *  - página de uma carteira (26/09/2026, Tiago: "em ações não veio nada..
 *    mas internamente, algumas ações têm vídeos"): 1º os vídeos que citam
 *    QUALQUER ativo da carteira (mesma regra da tela do ativo - ticker +
 *    apelidos + extras), com o ticker marcado no cartão; depois os "do
 *    tema" - canal marcado com a carteira ou termo do tema NO TÍTULO
 *    ("fundos imobiliários", "Ibovespa", "renda fixa"...).
 *
 * Regra de comparação: palavra inteira, sem diferenciar acentos. Sigla em
 * maiúsculas (PETR4, CDB, IFIX) só casa em maiúsculas; nome ("Petrobras")
 * casa de qualquer jeito. Termo do tema só vale no título (a descrição tem
 * patrocínio, links e texto padrão do canal - "ações", "bolsa" aparecem em
 * quase todas).
 *
 * Os canais ficam na aba aux_videos-canais (você edita na planilha): coluna A
 * = link do canal, @nome ou ID (UC...); coluna B (opcional) = carteiras do
 * canal: acoes, fiis, acoesEua, rendaFixa (separadas por vírgula).
 * Ajuste fino (opcional) na aba aux_videos-termos: por ativo (ticker) ou
 * carteira, termos a mais e termos que descartam o vídeo; a linha "todos"
 * descarta em todo lugar. As linhas das carteiras já vêm com o tema padrão.
 *
 * Primeira vez: rode configurarVideosDireto() (cria as abas), preencha os
 * canais, rode rodarVideosDireto() e instalarGatilhoVideos().
 */

var ABA_VIDEOS_CANAIS = 'aux_videos-canais';
var ABA_VIDEOS = 'aux_videos';
var CABECALHO_VIDEOS_CANAIS = ['Canal (link, @nome ou ID UC...)', 'Carteiras (opcional: acoes, fiis, acoesEua, rendaFixa)', 'Observação'];
var CABECALHO_VIDEOS = ['ID do vídeo', 'Canal', 'Título', 'Publicado em', 'Descrição', 'Carteiras do canal', 'Atualizado em'];
var VIDEOS_DIAS_GUARDAR = 365;
var VIDEOS_MAX_RESPOSTA = 12;
var CARTEIRAS_VIDEOS = ['acoes', 'fiis', 'acoesEua', 'rendaFixa'];
var ABA_VIDEOS_TERMOS = 'aux_videos-termos';
var CABECALHO_VIDEOS_TERMOS = ['Ativo ou carteira (ticker, acoes, fiis, acoesEua, rendaFixa ou todos)', 'Termos a mais (separados por vírgula)', 'Descartar vídeos que citam (separados por vírgula)', 'Observação'];
// Tema de cada carteira - só no TÍTULO. Vale enquanto a linha da carteira na
// aba aux_videos-termos não existir ou estiver com a coluna B vazia.
var TEMAS_VIDEOS_PADRAO = {
  acoes: ['ações', 'Ibovespa', 'bolsa brasileira', 'bolsa de valores', 'small caps', 'dividendos de ações'],
  fiis: ['FII', 'FIIs', 'fundo imobiliário', 'fundos imobiliários', 'IFIX'],
  acoesEua: ['ações americanas', 'bolsa americana', 'stocks', 'S&P 500', 'Nasdaq', 'Wall Street', 'investir no exterior'],
  rendaFixa: ['renda fixa', 'Tesouro Direto', 'Tesouro IPCA', 'Tesouro Selic', 'Tesouro Reserva', 'Tesouro Prefixado', 'CDB', 'LCI', 'LCA', 'CRI', 'CRA', 'debêntures', 'Selic', 'CDI']
};

// ---------------------------------------------------------------------------
// Configuração / gatilho
// ---------------------------------------------------------------------------

/**
 * Rodar 1x (pode rodar de novo, não apaga nada): cria a aba de canais e a de
 * termos (esta já com o tema padrão de cada carteira, pra você ver e editar).
 */
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
  if (!ss.getSheetByName(ABA_VIDEOS_TERMOS)) {
    var termos = ss.insertSheet(ABA_VIDEOS_TERMOS);
    var linhas = [CABECALHO_VIDEOS_TERMOS].concat(CARTEIRAS_VIDEOS.map(function (c) {
      return [c, TEMAS_VIDEOS_PADRAO[c].join(', '), '', 'Tema da carteira (só no título do vídeo)'];
    })).concat([
      ['todos', '', '', 'Coluna C: vídeos que citam isso somem de todas as telas'],
      ['PETR4', '', '', 'Exemplo: termos a mais pra um ativo (o ticker e o nome já entram sozinhos)']
    ]);
    termos.getRange(1, 1, linhas.length, CABECALHO_VIDEOS_TERMOS.length).setValues(linhas);
    Logger.log('Aba ' + ABA_VIDEOS_TERMOS + ' criada com o tema padrão de cada carteira.');
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

function semAcentoVideo_(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function listaTermosVideo_(texto) {
  return String(texto || '').split(/[,;\n]/).map(function (t) { return t.trim(); }).filter(Boolean);
}

/**
 * Termo -> RegExp de palavra inteira, sem acento. Sigla toda em maiúsculas
 * (PETR4, CDB, IFIX) exige maiúsculas no texto; nome ignora maiúsculas.
 */
function regexTermoVideo_(termo) {
  var t = semAcentoVideo_(String(termo || '').trim());
  if (t.length < 2) return null;
  var sigla = /^[A-Z0-9&]{2,8}$/.test(t) && /[A-Z]/.test(t);
  var escapado = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp('(^|[^A-Za-z0-9])' + escapado + '($|[^A-Za-z0-9])', sigla ? '' : 'i');
}

/** Aba aux_videos-termos -> { PETR4: {termos, descartar}, acoes: {...}, todos: {...} }. */
function lerTermosVideos_(ss) {
  var out = {};
  var aba = ss.getSheetByName(ABA_VIDEOS_TERMOS);
  if (!aba || aba.getLastRow() < 2) return out;
  aba.getRange(2, 1, aba.getLastRow() - 1, 3).getValues().forEach(function (l) {
    var bruto = String(l[0] || '').trim();
    if (!bruto) return;
    var chave = bruto.toLowerCase() === 'todos' ? 'todos' : (normalizarCarteirasVideo_(bruto)[0] || bruto.toUpperCase());
    var atual = out[chave] || (out[chave] = { termos: [], descartar: [] });
    atual.termos = atual.termos.concat(listaTermosVideo_(l[1]));
    atual.descartar = atual.descartar.concat(listaTermosVideo_(l[2]));
  });
  return out;
}

/** "PETR4:Petrobras,Petróleo;AXIA3:Eletrobras" (o site manda) -> { PETR4: [...], AXIA3: [...] }. */
function lerApelidosVideo_(texto) {
  var out = {};
  String(texto || '').split(';').forEach(function (par) {
    var i = par.indexOf(':');
    if (i < 1) return;
    out[par.slice(0, i).trim().toUpperCase()] = listaTermosVideo_(par.slice(i + 1));
  });
  return out;
}

/**
 * opcoes:
 *  - alvos: [{ ticker, termos, descartar }] - vídeo que cita um termo do
 *    alvo (título ou descrição) entra no 1º grupo, com o ticker marcado;
 *  - carteira + tema: 2º grupo - canal marcado com a carteira ou termo do
 *    tema no título;
 *  - descartar: termos que tiram o vídeo de qualquer grupo.
 * Devolve até opcoes.max vídeos: 1º grupo, depois o 2º; mais novo primeiro.
 */
function filtrarVideos_(videos, opcoes) {
  var o = opcoes || {};
  var rx = function (lista) { return (lista || []).map(regexTermoVideo_).filter(Boolean); };
  var alvos = (o.alvos || []).map(function (a) {
    return { ticker: a.ticker, termos: rx(a.termos), descartar: rx(a.descartar) };
  }).filter(function (a) { return a.termos.length; });
  var tema = rx(o.tema);
  var descartar = rx(o.descartar);
  var saida = [];
  videos.forEach(function (v) {
    var titulo = semAcentoVideo_(v.titulo);
    var descricao = semAcentoVideo_(v.descricao);
    var cita = function (lista, soTitulo) {
      return lista.some(function (r) { return r.test(titulo) || (!soTitulo && r.test(descricao)); });
    };
    if (descartar.length && cita(descartar)) return;
    var ativos = alvos.filter(function (a) { return cita(a.termos) && !(a.descartar.length && cita(a.descartar)); })
      .map(function (a) { return a.ticker; });
    var doTema = !ativos.length && ((o.carteira && (v.carteiras || []).indexOf(o.carteira) !== -1) || (tema.length && cita(tema, true)));
    if (!ativos.length && !doTema) return;
    saida.push({ v: v, ativos: ativos, grupo: ativos.length ? 0 : 1 });
  });
  saida.sort(function (a, b) {
    if (a.grupo !== b.grupo) return a.grupo - b.grupo;
    return a.v.publicado < b.v.publicado ? 1 : (a.v.publicado > b.v.publicado ? -1 : 0);
  });
  return saida.slice(0, o.max || VIDEOS_MAX_RESPOSTA).map(function (x) {
    return { id: x.v.id, canal: x.v.canal, titulo: x.v.titulo, publicado: x.v.publicado, ativos: x.ativos, motivo: x.grupo === 0 ? 'ativo' : 'tema' };
  });
}

/** Monta as opções do filtro a partir da requisição + aba de termos. */
function opcoesFiltroVideos_(ss, p) {
  var termosAba = lerTermosVideos_(ss);
  var extra = function (chave) { return termosAba[chave] || { termos: [], descartar: [] }; };
  var carteira = CARTEIRAS_VIDEOS.indexOf(p.carteira) !== -1 ? p.carteira : null;
  if (carteira) {
    var apelidos = lerApelidosVideo_(p.apelidos);
    var tickers = [];
    if (carteira !== 'rendaFixa') {
      var classes = classesDaCarteiraParaProventos_(ss); // Proventos.gs
      tickers = Object.keys(classes).filter(function (t) { return classes[t] === carteira; });
    }
    var cfg = extra(carteira);
    return {
      carteira: carteira,
      alvos: tickers.map(function (t) {
        return { ticker: t, termos: [t].concat(apelidos[t] || [], extra(t).termos), descartar: extra(t).descartar };
      }),
      tema: cfg.termos.length ? cfg.termos : TEMAS_VIDEOS_PADRAO[carteira],
      descartar: extra('todos').descartar.concat(cfg.descartar)
    };
  }
  var termos = String(p.termos || '').split('|').map(function (t) { return t.trim(); }).filter(Boolean);
  var ticker = String(p.ticker || termos[0] || '').trim().toUpperCase();
  if (!ticker) return { alvos: [] };
  return {
    alvos: [{ ticker: ticker, termos: [ticker].concat(termos, extra(ticker).termos), descartar: extra(ticker).descartar }],
    descartar: extra('todos').descartar
  };
}

function handleVideos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var p = (e && e.parameter) || {};
    var configurado = lerCanaisVideos_(ss).length > 0;
    var videos = lerVideos_(ss);
    var opcoes = opcoesFiltroVideos_(ss, p);
    return jsonOut({
      ok: true, configurado: configurado, totalGuardados: videos.length,
      carteira: opcoes.carteira || null,
      videos: filtrarVideos_(videos, opcoes)
    });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'videos', erro: String(erro) });
  }
}
