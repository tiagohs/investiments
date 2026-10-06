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
 *
 * 02/10/2026: canal OFICIAL do ativo (empresa/gestora/Tesouro Direto - lista
 * em assets/js/canais-youtube.js): na tela do ativo, os vídeos recentes dele
 * entram junto, marcados "Canal oficial" (ver mesclarVideosCanalOficial_).
 * Não precisa cadastrar nada na planilha.
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

/**
 * 05/10/2026 (Tiago): 404 ou lista vazia de vídeos de um canal = "sem vídeos disponíveis" - NÃO é erro: não vira
 * Erro/Atenção na execução, só fica registrado (e a tela mostra "sem vídeos disponíveis" no canal).
 */
function erroSemVideos_(mensagem) {
  var e = new Error(mensagem);
  e.semVideos = true;
  return e;
}

var PROP_VIDEOS_SEM_VIDEOS_ = 'YT_CANAIS_SEM_VIDEOS';

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
  if (resp.getResponseCode() === 404) throw erroSemVideos_('canal não encontrado (404): ' + e);
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
  if (resp.getResponseCode() === 404) throw erroSemVideos_('feed HTTP 404');
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
  var falhas = [], semVideos = [], novos = 0;
  canais.forEach(function (c) {
    try {
      var id = resolverCanalYoutube_(c.entrada);
      var doCanal = buscarVideosCanal_(id);
      if (!doCanal.length) semVideos.push(c.entrada + ' (feed vazio)');
      doCanal.forEach(function (v) {
        if (!porId[v.id]) novos++;
        v.carteiras = c.carteiras;
        porId[v.id] = v;
      });
    } catch (erro) {
      // 404 ou lista vazia = "sem vídeos disponíveis": registra, mas não é falha da execução
      if (erro && erro.semVideos) semVideos.push(c.entrada + ' (' + String(erro.message || erro).slice(0, 80) + ')');
      else falhas.push(c.entrada + ' (' + String(erro).slice(0, 80) + ')');
    }
  });
  // a tela lê daqui o "sem vídeos disponíveis" por canal (montarRespostaVideos_)
  try { PropertiesService.getScriptProperties().setProperty(PROP_VIDEOS_SEM_VIDEOS_, JSON.stringify(semVideos.map(function (x) { return x.replace(/ \([^)]*\)$/, ''); }))); } catch (eP) { /* só informativo */ }
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
  // canal sem vídeos disponíveis não conta nem como falha nem como sucesso pra decidir Erro/Atenção
  var consultados = canais.length - semVideos.length;
  var status = !falhas.length ? 'Sucesso' : (falhas.length >= consultados ? 'Erro' : 'Atenção');
  var detalhe = 'YouTube: ' + novos + ' vídeo(s) novo(s), ' + lista.length + ' guardados de ' + canais.length + ' canal(is)' +
    (semVideos.length ? ' — sem vídeos disponíveis: ' + semVideos.join('; ') : '') +
    (falhas.length ? ' — falharam: ' + falhas.join('; ') : '');
  // 05/10/2026 (Tiago): o sucesso também é registrado (antes só entrava falha ou execução manual)
  try { gravarRegistroControle_(status, origem, detalhe); } catch (e) { Logger.log('Registro de Controle: ' + e); }
  return { status: status, detalhe: detalhe, total: lista.length, novos: novos, semVideos: semVideos.length };
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

// ---------------------------------------------------------------------------
// 02/10/2026 (Tiago: "Canais do YouTube por ativo mostrados na página; a
// busca de vídeos tem que considerar os canais"): canal OFICIAL do ativo.
// A lista ticker -> canal é pública e fica no site (assets/js/canais-youtube.js);
// a tela do ativo manda canal=<ID UC...> (ou o link/@nome, se o ID não
// estiver lá) e, pra canal de gestora/corretora que fala de muita coisa,
// canalModo=citam. Aqui: lê o feed RSS do canal (mesmo esquema sem chave de
// API do resto deste arquivo; 3h no CacheService), junta com os vídeos dos
// seus canais (aux_videos) que citam o ativo, sem repetir, marcando
// "oficial", e ordena tudo por data. Ativo sem canal: nada muda.
// ---------------------------------------------------------------------------

var VIDEOS_FEED_CACHE_TTL = 3 * 60 * 60;
var VIDEOS_FEED_CACHE_PREFIXO = 'yt_feed_v1_';
// no máximo metade da lista é do canal oficial quando há vídeos dos seus
// canais pra completar (canal de empresa que posta muito não esconde o resto)
var VIDEOS_MAX_OFICIAIS = 6;

/** Só aceita o que é canal do YouTube: ID UC..., @nome ou link youtube.com (o servidor nunca busca outro endereço). */
function entradaCanalOficialValida_(texto) {
  var e = String(texto || '').trim();
  if (/^UC[\w-]{22}$/.test(e)) return e;
  if (/^@[\w.\-]{2,60}$/.test(e)) return e;
  if (/^https:\/\/(www\.|m\.)?youtube\.com\/(@[\w.\-]{2,60}|channel\/UC[\w-]{22}|c\/[\w.\-]{1,80}|user\/[\w.\-]{1,80}|[\w.\-]{1,80})\/?$/i.test(e)) return e;
  return null;
}

/**
 * Vídeos recentes do canal oficial: { id (UC...), nome, videos: [...] }.
 * opcoes.fetch (testes) substitui o UrlFetchApp.fetch; opcoes.semCache ignora o cache.
 */
function videosCanalOficial_(entrada, opcoes) {
  var o = opcoes || {};
  var valida = entradaCanalOficialValida_(entrada);
  if (!valida) throw new Error('canal inválido: ' + String(entrada).slice(0, 80));
  var id;
  try {
    id = /^UC[\w-]{22}$/.test(valida) ? valida : resolverCanalYoutube_(valida); // resolvido 1x e guardado nas propriedades do script
  } catch (eRes) {
    if (eRes && eRes.semVideos) return { id: '', nome: '', videos: [], semVideos: true }; // 404 = sem vídeos disponíveis
    throw eRes;
  }
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e1) { cache = null; }
  if (cache && !o.semCache) {
    try {
      var guardado = cache.get(VIDEOS_FEED_CACHE_PREFIXO + id);
      if (guardado) return JSON.parse(guardado);
    } catch (e2) { /* refaz */ }
  }
  var buscar = o.fetch || function (url, params) { return UrlFetchApp.fetch(url, params); };
  var resp = buscar('https://www.youtube.com/feeds/videos.xml?channel_id=' + id, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (resp.getResponseCode() === 404) return { id: id, nome: '', videos: [], semVideos: true }; // 404 = sem vídeos disponíveis (não é erro)
  if (resp.getResponseCode() !== 200) throw new Error('feed do canal oficial HTTP ' + resp.getResponseCode());
  var xml = resp.getContentText();
  var titulo = String(xml || '').split('<entry>')[0].match(/<title>([\s\S]*?)<\/title>/);
  var saida = {
    id: id,
    nome: titulo ? titulo[1].replace(/&amp;/g, '&').trim() : '',
    videos: extrairVideosDoFeed_(xml).map(function (v) { return { id: v.id, canal: v.canal, titulo: v.titulo, publicado: v.publicado, descricao: String(v.descricao || '').slice(0, 300) }; })
  };
  if (!saida.videos.length) saida.semVideos = true; // lista vazia = sem vídeos disponíveis
  if (cache) { try { cache.put(VIDEOS_FEED_CACHE_PREFIXO + id, JSON.stringify(saida), VIDEOS_FEED_CACHE_TTL); } catch (e3) { /* só otimização */ } }
  return saida;
}

/**
 * Junta os vídeos dos seus canais que citam o ativo (já filtrados) com os do
 * canal oficial. opcoes: { soQueCitam, alvos, descartar, max, maxOficiais }.
 *  - canal oficial: todos os vídeos (canal da empresa) ou, com soQueCitam,
 *    só os que citam o ativo (mesma regra de filtrarVideos_); os termos de
 *    "descartar" valem igual;
 *  - vídeo que já veio dos seus canais e também é do oficial (mesmo id, ou
 *    o canal oficial cadastrado em aux_videos-canais) aparece 1 vez só,
 *    marcado oficial;
 *  - o oficial sempre entra: até maxOficiais quando há vídeos dos seus
 *    canais pra completar (mais, se faltar); tudo junto ordenado por data
 *    (mais novo primeiro), até max.
 */
function mesclarVideosCanalOficial_(filtrados, canal, opcoes) {
  var o = opcoes || {};
  var max = o.max || VIDEOS_MAX_RESPOSTA;
  var maxOficiais = o.maxOficiais || VIDEOS_MAX_OFICIAIS;
  var nomeCanal = semAcentoVideo_(canal && canal.nome).toLowerCase();
  var oficiais;
  // mesmo prazo da aba aux_videos (1 ano): canal que quase não posta não traz vídeo velho
  var limite = new Date((o.agora ? o.agora.getTime() : Date.now()) - VIDEOS_DIAS_GUARDAR * 86400000).toISOString();
  var lista = ((canal && canal.videos) || []).filter(function (v) { return String(v.publicado || '') >= limite; });
  if (o.soQueCitam) {
    oficiais = filtrarVideos_(lista, { alvos: o.alvos, descartar: o.descartar, max: 1000 });
  } else {
    var termosDescartar = (o.descartar || []).slice();
    (o.alvos || []).forEach(function (a) { termosDescartar = termosDescartar.concat(a.descartar || []); });
    var descartar = termosDescartar.map(regexTermoVideo_).filter(Boolean);
    oficiais = lista.filter(function (v) {
      var t = semAcentoVideo_(v.titulo), d = semAcentoVideo_(v.descricao);
      return !descartar.some(function (r) { return r.test(t) || r.test(d); });
    }).map(function (v) { return { id: v.id, canal: v.canal, titulo: v.titulo, publicado: v.publicado, ativos: [], motivo: 'ativo' }; });
  }
  var porId = {};
  var outros = [];
  (filtrados || []).forEach(function (v) {
    if (porId[v.id]) return;
    var copia = {};
    Object.keys(v).forEach(function (k) { copia[k] = v[k]; });
    if (nomeCanal && semAcentoVideo_(v.canal).toLowerCase() === nomeCanal) copia.oficial = true;
    porId[v.id] = copia;
    outros.push(copia);
  });
  var soOficiais = [];
  oficiais.forEach(function (v) {
    if (porId[v.id]) { porId[v.id].oficial = true; return; }
    var copia = { id: v.id, canal: v.canal || (canal && canal.nome) || '', titulo: v.titulo, publicado: v.publicado, ativos: v.ativos || [], motivo: 'ativo', oficial: true };
    porId[v.id] = copia;
    soOficiais.push(copia);
  });
  var maisNovo = function (a, b) { return a.publicado < b.publicado ? 1 : (a.publicado > b.publicado ? -1 : 0); };
  soOficiais.sort(maisNovo);
  outros.sort(maisNovo);
  // o oficial sempre aparece (até maxOficiais, mais se faltar vídeo dos seus canais); o resto da lista é dos seus canais
  var nOficiais = Math.min(soOficiais.length, Math.max(maxOficiais, max - outros.length));
  var nOutros = Math.min(outros.length, max - nOficiais);
  return soOficiais.slice(0, nOficiais).concat(outros.slice(0, nOutros)).sort(maisNovo);
}

function handleVideos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(montarRespostaVideos_((e && e.parameter) || {}));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'videos', erro: String(erro) });
  }
}

/** Resposta de action=videos (separada do handler pros testes). opcoes: fetch (ver videosCanalOficial_), agora (Date). */
function montarRespostaVideos_(p, opcoes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configurado = lerCanaisVideos_(ss).length > 0;
  var videos = lerVideos_(ss);
  var filtro = opcoesFiltroVideos_(ss, p);
  var resposta = {
    ok: true, configurado: configurado, totalGuardados: videos.length,
    carteira: filtro.carteira || null,
    videos: filtrarVideos_(videos, filtro)
  };
  // 05/10/2026: canais de aux_videos-canais que a última atualização achou sem vídeos disponíveis (404 / feed vazio)
  try {
    var semV = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_VIDEOS_SEM_VIDEOS_) || '[]');
    if (Array.isArray(semV) && semV.length) resposta.canaisSemVideos = semV.map(function (x) { return String(x).slice(0, 80); }).slice(0, 30);
  } catch (eS) { /* sem a lista, a tela só não avisa */ }
  if (!filtro.carteira && p.canal) {
    try {
      var canal = videosCanalOficial_(p.canal, opcoes);
      resposta.canalOficial = { id: canal.id, nome: canal.nome, recentes: canal.videos.length };
      if (canal.semVideos || !canal.videos.length) resposta.canalOficial.semVideos = true; // a tela mostra "sem vídeos disponíveis"

      // pede mais dos seus canais (o corte final é depois de juntar com o oficial)
      var maisFiltrados = filtrarVideos_(videos, { alvos: filtro.alvos, descartar: filtro.descartar, max: VIDEOS_MAX_RESPOSTA * 2 });
      resposta.videos = mesclarVideosCanalOficial_(maisFiltrados, canal, {
        soQueCitam: p.canalModo === 'citam', alvos: filtro.alvos, descartar: filtro.descartar, agora: opcoes && opcoes.agora
      });
    } catch (erroCanal) {
      resposta.erroCanalOficial = String(erroCanal).slice(0, 200); // sem o canal, segue só com os seus canais
    }
  }
  return resposta;
}
