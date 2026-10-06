/**
 * Fontes.gs - 05/10/2026 (auditoria A-49 + A-51 + A-52, Onda 2C/2D).
 *
 * UMA peça só para tudo o que o Apps Script busca fora da planilha (BCB, Yahoo,
 * FNet, Tesouro, SEC, CVM...). Antes cada arquivo tinha o seu fetch, o seu
 * "se falhar, tenta de novo" e o seu jeito de contar erro; quando o Yahoo
 * passou a recusar o IP (403/429), cada execução e cada abertura de tela
 * insistia de novo, pagava a espera inteira e ainda gravava "Atenção".
 *
 * 1) DISJUNTOR PERSISTENTE por fonte (Propriedades do script, vale em TODAS as
 *    execuções - gatilho, botão, tela - e não só naquela em que o erro veio):
 *      - 401/403/451 (bloqueio)  -> pausa de FONTE_HORAS_BLOQUEIO_ (12 h);
 *      - 429 (limite)            -> pausa de FONTE_MINUTOS_LIMITE_ (60 min);
 *      - 5xx / DNS / tempo esgotado: depois de FONTE_FALHAS_PARA_ABRIR_ (3)
 *        falhas seguidas -> pausa curta de FONTE_MINUTOS_INSTAVEL_ (5 min:
 *        protege a tela de pagar a mesma espera várias vezes, sem atrasar a
 *        sincronização, que tenta de novo 10 min depois);
 *      - 404/400 NÃO contam (a fonte respondeu: o recurso é que não existe,
 *        ex.: ticker desconhecido no Yahoo);
 *      - passou a pausa: a próxima chamada é a "sonda" - se der certo fecha o
 *        disjuntor; se falhar abre de novo na hora.
 *
 * 2) buscarFonte_(nome, url, opcoes): cache -> disjuntor -> fetch -> validação
 *    (HTTP 200, JSON, opcoes.validar antes de qualquer .map) -> ÚLTIMO BOM
 *    guardado nas Propriedades com a data. Fonte fora do ar não derruba a tela:
 *    devolve o último dado bom com `aviso: 'dado de DD/MM ...'`. Lista vazia
 *    (fim de semana/feriado sem publicação) é `ok: true, vazio: true`, nunca erro.
 *    NUNCA lança exceção.
 *
 *    LIMITE REAL DO APPS SCRIPT: UrlFetchApp.fetch NÃO tem parâmetro de timeout
 *    (a chamada fica até ~60 s se o servidor não responde). O "timeout curto" daqui
 *    é, portanto, indireto: 1 tentativa só (sem sleep/retry no caminho da tela),
 *    cache negativo (opcoes.ttlNegativo) e o disjuntor, que faz as chamadas
 *    seguintes falharem em milissegundos em vez de esperar de novo.
 *
 * 3) fonteFetchEmLotes_(nome, pedidos, opcoes): UrlFetchApp.fetchAll em lotes
 *    (10), com o mesmo disjuntor e uma cota de tempo (opcoes.temTempo) - usado
 *    pelo FNet (FnetProventos.gs / FnetInformesFii.gs) e disponível pro resto.
 *
 * Estado nas Propriedades (nada de dado pessoal; são só nomes de fonte e datas):
 *    FONTE_ESTADO_<nome>  = { falhas, ate (ms), desde (ms), motivo, tipo }
 *    FONTE_BOM_<chave>    = { dia: 'aaaa-mm-dd', n: nº de pedaços } + FONTE_BOM_<chave>~<i> (texto JSON)
 * Função pro editor: estadoFontes() (loga o estado de cada fonte conhecida);
 * limparDisjuntoresFontes() (religa todas à mão).
 *
 * Testes: tests/harness/fontes.test.js.
 */

var FONTE_PROP_ESTADO_ = 'FONTE_ESTADO_';
var FONTE_PROP_BOM_ = 'FONTE_BOM_';
var FONTE_FALHAS_PARA_ABRIR_ = 3;
var FONTE_HORAS_BLOQUEIO_ = 12;
var FONTE_MINUTOS_LIMITE_ = 60;
var FONTE_MINUTOS_INSTAVEL_ = 5;
var FONTE_TAMANHO_LOTE_ = 10;
var FONTE_TTL_PADRAO_ = 6 * 60 * 60;
var FONTE_TTL_NEGATIVO_PADRAO_ = 120;
var FONTE_BOM_PEDACO_ = 8000;       // limite de 9 KB por propriedade
var FONTE_BOM_MAX_PEDACOS_ = 5;
var FONTES_CONHECIDAS_ = ['bcb', 'olinda', 'tesouro', 'fnet', 'yahoo-query1', 'yahoo-query2', 'sec', 'cvm', 'fundamentus'];

// ---------------------------------------------------------------------------
// Utilidades pequenas (sem depender de outros arquivos)
// ---------------------------------------------------------------------------

/** Hash curto e estável de um texto (djb2 + tamanho) - chave de cache/propriedade e "já vi este conteúdo". */
function fonteHash_(texto) {
  var s = String(texto == null ? '' : texto);
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36) + '.' + s.length.toString(36);
}

/** Dia 'aaaa-mm-dd' em São Paulo de um instante (ms ou Date). */
function fonteDia_(instante) {
  var ms = typeof instante === 'number' ? instante : (instante && typeof instante.getTime === 'function' ? instante.getTime() : Date.now());
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** 'aaaa-mm-dd' -> 'DD/MM'. */
function fonteDiaBr_(iso) {
  var m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? m[2] + '/' + m[1] : '';
}

function fonteHoraBr_(ms) {
  var p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  return p.replace(',', ' às');
}

function fontePropriedades_() {
  try { return PropertiesService.getScriptProperties(); } catch (e) { return null; }
}

/** Nome da fonte de uma URL (o disjuntor é por fonte/host: um 403 do Yahoo vale para todo o Yahoo). */
function fonteNomeDaUrl_(url) {
  var h = String(url || '').replace(/^https?:\/\/([^/?#]+).*$/i, '$1').toLowerCase();
  if (/^query([12])\.finance\.yahoo\.com$/.test(h)) return 'yahoo-query' + h.charAt(5);
  if (/(^|\.)finance\.yahoo\.com$/.test(h)) return 'yahoo-query1';
  if (/(^|\.)sec\.gov$/.test(h)) return 'sec';
  if (/(^|\.)fundamentus\.com\.br$/.test(h)) return 'fundamentus';
  if (/^dados\.cvm\.gov\.br$/.test(h)) return 'cvm';
  if (/^api\.bcb\.gov\.br$/.test(h)) return 'bcb';
  if (/^olinda\.bcb\.gov\.br$/.test(h)) return 'olinda';
  if (/tesourotransparente\.gov\.br$/.test(h)) return 'tesouro';
  if (/bmfbovespa\.com\.br$/.test(h)) return 'fnet';
  return h || 'desconhecida';
}

// ---------------------------------------------------------------------------
// Disjuntor persistente
// ---------------------------------------------------------------------------

function fonteLerEstado_(nome) {
  var p = fontePropriedades_();
  if (!p) return null;
  try {
    var bruto = p.getProperty(FONTE_PROP_ESTADO_ + nome);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) { return null; }
}

function fonteGravarEstado_(nome, estado) {
  var p = fontePropriedades_();
  if (!p) return;
  try { p.setProperty(FONTE_PROP_ESTADO_ + nome, JSON.stringify(estado)); } catch (e) { Logger.log('Disjuntor ' + nome + ': ' + e); }
}

/** null = fonte liberada; { ate, desde, motivo, tipo, falhas } = disjuntor aberto agora. */
function fonteAberta_(nome, agora) {
  var est = fonteLerEstado_(nome);
  var ms = agora == null ? Date.now() : (typeof agora === 'number' ? agora : agora.getTime());
  return est && est.ate && est.ate > ms ? est : null;
}

/** Texto curto pra Registro de Controle/aviso: "Yahoo em pausa (HTTP 403 desde 03/10; nova tentativa 04/10 às 02:00)". */
function fonteDescreverPausa_(nome, est) {
  return nome + ' em pausa (' + (est.motivo || 'falhas seguidas') + (est.desde ? ' desde ' + fonteDiaBr_(fonteDia_(est.desde)) : '') +
    '; nova tentativa ' + fonteHoraBr_(est.ate) + ')';
}

/** Classifica uma falha: 'bloqueio' | 'limite' | 'instavel' | null (a fonte respondeu: não conta). */
function fonteClassificar_(codigo, erro) {
  if (codigo == null) return erro ? 'instavel' : null;
  if (codigo === 401 || codigo === 403 || codigo === 451) return 'bloqueio';
  if (codigo === 429) return 'limite';
  if (codigo >= 500) return 'instavel';
  return null;
}

/**
 * Registra uma falha da fonte. info = { codigo, erro }. Devolve o estado novo
 * (ou null se a falha não conta - ex.: 404). Abre o disjuntor conforme o tipo.
 */
function fonteFalhou_(nome, info, agora) {
  var tipo = fonteClassificar_(info && info.codigo, info && info.erro);
  if (!tipo) return null;
  var ms = agora == null ? Date.now() : (typeof agora === 'number' ? agora : agora.getTime());
  var est = fonteLerEstado_(nome) || { falhas: 0 };
  var motivo = info.codigo != null ? 'HTTP ' + info.codigo : String(info.erro || 'sem resposta').replace(/^Exception:\s*/, '').slice(0, 60);
  est.falhas = (est.falhas || 0) + 1;
  if (!est.desde) est.desde = ms;
  est.motivo = motivo;
  est.tipo = tipo;
  if (tipo === 'bloqueio') est.ate = ms + FONTE_HORAS_BLOQUEIO_ * 3600000;
  else if (tipo === 'limite') est.ate = ms + FONTE_MINUTOS_LIMITE_ * 60000;
  else if (est.falhas >= FONTE_FALHAS_PARA_ABRIR_) est.ate = ms + FONTE_MINUTOS_INSTAVEL_ * 60000;
  fonteGravarEstado_(nome, est);
  return est;
}

/** A fonte respondeu bem: fecha o disjuntor e zera a contagem (só grava se havia algo a limpar). */
function fonteDeuCerto_(nome) {
  var est = fonteLerEstado_(nome);
  if (est && (est.falhas || est.ate)) fonteGravarEstado_(nome, { falhas: 0, ate: 0, ultimaOk: Date.now() });
}

/** Rodar no editor: estado de cada fonte conhecida. */
function estadoFontes() {
  var linhas = FONTES_CONHECIDAS_.map(function (n) {
    var est = fonteLerEstado_(n);
    if (!est || (!est.falhas && !est.ate)) return n + ': ok';
    return n + ': ' + (fonteAberta_(n) ? fonteDescreverPausa_(n, est) : 'liberada (sonda na próxima chamada; ' + (est.falhas || 0) + ' falha(s) seguida(s), última: ' + (est.motivo || '?') + ')');
  });
  Logger.log(linhas.join('\n'));
  return linhas;
}

/** Rodar no editor: religa todas as fontes (use depois de resolver um bloqueio). */
function limparDisjuntoresFontes() {
  FONTES_CONHECIDAS_.forEach(function (n) { fonteGravarEstado_(n, { falhas: 0, ate: 0 }); });
  Logger.log('Disjuntores religados: ' + FONTES_CONHECIDAS_.join(', '));
}

// ---------------------------------------------------------------------------
// Último bom (Propriedades, com data) e cache (CacheService)
// ---------------------------------------------------------------------------

/** Guarda `dados` (JSON) como último bom da chave, em até FONTE_BOM_MAX_PEDACOS_ propriedades. false se não coube. */
function fonteGuardarBom_(chave, dados, dia) {
  var p = fontePropriedades_();
  if (!p) return false;
  try {
    var txt = JSON.stringify(dados);
    var n = Math.ceil(txt.length / FONTE_BOM_PEDACO_) || 1;
    if (n > FONTE_BOM_MAX_PEDACOS_) return false;
    for (var i = 0; i < n; i++) p.setProperty(FONTE_PROP_BOM_ + chave + '~' + i, txt.slice(i * FONTE_BOM_PEDACO_, (i + 1) * FONTE_BOM_PEDACO_));
    p.setProperty(FONTE_PROP_BOM_ + chave, JSON.stringify({ dia: dia, n: n }));
    return true;
  } catch (e) { return false; }
}

/** { dados, dia } do último bom, ou null. */
function fonteLerBom_(chave) {
  var p = fontePropriedades_();
  if (!p) return null;
  try {
    var meta = p.getProperty(FONTE_PROP_BOM_ + chave);
    if (!meta) return null;
    meta = JSON.parse(meta);
    var txt = '';
    for (var i = 0; i < meta.n; i++) {
      var parte = p.getProperty(FONTE_PROP_BOM_ + chave + '~' + i);
      if (parte == null) return null;
      txt += parte;
    }
    return { dados: JSON.parse(txt), dia: meta.dia };
  } catch (e) { return null; }
}

function fonteCacheLer_(chave) {
  try {
    var t = CacheService.getScriptCache().get(chave);
    return t ? JSON.parse(t) : null;
  } catch (e) { return null; }
}

function fonteCacheGravar_(chave, obj, ttl) {
  try {
    var t = JSON.stringify(obj);
    if (t.length < 95000) CacheService.getScriptCache().put(chave, t, ttl);
  } catch (e) { /* cache é só otimização */ }
}

// ---------------------------------------------------------------------------
// buscarFonte_
// ---------------------------------------------------------------------------

/**
 * Busca uma URL com a cadeia cache -> disjuntor -> fetch -> validação -> último bom.
 * Nunca lança. Devolve:
 *   { ok, dados, vazio, origem: 'cache'|'rede'|'ultimo-bom'|null, dataDado: 'aaaa-mm-dd'|null, aviso, codigo }
 *   - ok:false só quando NÃO há nem resposta nem último bom (aviso diz o motivo);
 *   - origem 'ultimo-bom': a fonte falhou e `dados` é o último dado bom, com `aviso: 'dado de DD/MM (...)'`.
 * opcoes:
 *   tipo         'json' (padrão) | 'texto'
 *   charset      pro getContentText (ex.: 'ISO-8859-1')
 *   headers, followRedirects   repassados ao UrlFetchApp
 *   validar      function(dados) -> boolean, chamada ANTES de qualquer uso (ex.: Array.isArray)
 *   semListaComoVazio  true: resposta que não passa em `validar` (HTTP 200) vira "vazio", não erro
 *                      (o BCB responde objeto de erro, não lista, quando o intervalo só tem fim de semana)
 *   transformar  function(dados) -> o que será devolvido, cacheado e guardado como último bom
 *   ttl          segundos de cache (padrão 6 h; 0 = sem cache)
 *   ttlNegativo  segundos sem refazer depois de uma falha (padrão 120; 0 = sempre tenta)
 *   ultimoBom    false: não guarda/usa último bom (ex.: janela de datas que muda a cada chamada)
 *   cacheChave   chave de cache própria (padrão: derivada do nome + URL)
 *   semCache     ignora o cache de leitura (o resultado novo ainda é gravado)
 *   temTempo     function() -> boolean: sem tempo, nem tenta a rede
 *   fetch, agora (testes)
 */
function buscarFonte_(nome, url, opcoes) {
  var o = opcoes || {};
  var agora = o.agora || new Date();
  var ttl = o.ttl == null ? FONTE_TTL_PADRAO_ : o.ttl;
  var ttlNeg = o.ttlNegativo == null ? FONTE_TTL_NEGATIVO_PADRAO_ : o.ttlNegativo;
  var chave = nome + '_' + fonteHash_(url);
  var chaveCache = o.cacheChave || ('fonte_v1_' + chave);
  var chaveNeg = chaveCache + '_neg';
  var res = { ok: false, dados: null, vazio: false, origem: null, dataDado: null, aviso: null, codigo: null };

  // 1) cache
  if (ttl > 0 && !o.semCache) {
    var c = fonteCacheLer_(chaveCache);
    if (c && c.ok) { res.ok = true; res.dados = c.d; res.vazio = !!c.v; res.origem = 'cache'; res.dataDado = c.dia || null; return res; }
  }

  // 2) disjuntor / cache negativo / tempo
  var motivo = null;
  var aberta = fonteAberta_(nome, agora);
  if (aberta) motivo = fonteDescreverPausa_(nome, aberta);
  else if (o.temTempo && !o.temTempo()) motivo = nome + ': sem tempo nesta execução';
  else if (ttlNeg > 0 && fonteCacheLer_(chaveNeg)) motivo = nome + ': falhou há pouco (nova tentativa em breve)';

  // 3) rede
  if (!motivo) {
    try {
      var params = { muteHttpExceptions: true, followRedirects: o.followRedirects !== false };
      if (o.headers) params.headers = o.headers;
      var resp = o.fetch ? o.fetch(url, params) : UrlFetchApp.fetch(url, params);
      var codigo = typeof resp.getResponseCode === 'function' ? resp.getResponseCode() : 200;
      res.codigo = codigo;
      if (codigo !== 200) {
        if (fonteClassificar_(codigo, null)) fonteFalhou_(nome, { codigo: codigo }, agora);
        else fonteDeuCerto_(nome); // 404/400: o servidor respondeu (o recurso é que não existe)
        motivo = nome + ': HTTP ' + codigo;
      } else {
        fonteDeuCerto_(nome);
        var texto = o.charset ? resp.getContentText(o.charset) : resp.getContentText();
        var dados = texto;
        var legivel = true;
        if (o.tipo !== 'texto') { try { dados = JSON.parse(texto); } catch (eJ) { legivel = false; } }
        if (!legivel) motivo = nome + ': resposta ilegível (não é JSON)';
        else if (o.validar && !o.validar(dados)) {
          if (o.semListaComoVazio) { try { Logger.log('AVISO: ' + nome + ' devolveu resposta que não é lista: ' + String(texto).slice(0, 200) + ' - tratada como sem dado no período.'); } catch (eL) { /* log é opcional */ } res.ok = true; res.vazio = true; res.dados = []; res.origem = 'rede'; if (ttl > 0) fonteCacheGravar_(chaveCache, { ok: true, d: [], v: true, dia: null }, Math.min(ttl, 1800)); return res; }
          motivo = nome + ': resposta inesperada';
        } else {
          if (o.transformar) dados = o.transformar(dados);
          var vazio = Array.isArray(dados) ? !dados.length : (dados == null || dados === '' || (typeof dados === 'object' && !Object.keys(dados).length));
          var dia = fonteDia_(agora);
          res.ok = true; res.dados = dados; res.vazio = vazio; res.origem = 'rede'; res.dataDado = vazio ? null : dia;
          // vazio (fim de semana/feriado sem publicação) não é erro e não apaga o último bom
          if (ttl > 0) fonteCacheGravar_(chaveCache, { ok: true, d: dados, v: vazio, dia: res.dataDado }, vazio ? Math.min(ttl, 1800) : ttl);
          if (!vazio && o.ultimoBom !== false) fonteGuardarBom_(chave, dados, dia);
          return res;
        }
      }
    } catch (e) {
      var info = { erro: String(e) };
      fonteFalhou_(nome, info, agora);
      motivo = nome + ': ' + String(e).replace(/^Exception:\s*/, '').slice(0, 80);
    }
  }

  // 4) falhou: cache negativo + último bom
  if (ttlNeg > 0 && !aberta) fonteCacheGravar_(chaveNeg, { f: 1 }, ttlNeg);
  if (o.ultimoBom !== false) {
    var bom = fonteLerBom_(chave);
    if (bom) {
      res.ok = true; res.dados = bom.dados; res.vazio = Array.isArray(bom.dados) && !bom.dados.length;
      res.origem = 'ultimo-bom'; res.dataDado = bom.dia;
      res.aviso = 'dado de ' + fonteDiaBr_(bom.dia) + ' (' + motivo + ')';
      return res;
    }
  }
  res.aviso = motivo;
  return res;
}

// ---------------------------------------------------------------------------
// fetchAll em lotes (com disjuntor e cota de tempo)
// ---------------------------------------------------------------------------

/**
 * Faz `pedidos` ([{ url, headers, ... }]) em lotes de FONTE_TAMANHO_LOTE_ com UrlFetchApp.fetchAll.
 * Devolve, na mesma ordem, [{ ok, codigo, texto, erro, pulado, porTempo, transitorio }]:
 *   ok         HTTP 200 (texto = corpo);
 *   pulado     não foi feito (disjuntor aberto ou sem tempo; porTempo=true quando foi o tempo);
 *   transitorio  vale tentar de novo depois (exceção/5xx/429).
 * opcoes: { temTempo, tamanhoLote, fetchAll, fetch (testes) }
 */
function fonteFetchEmLotes_(nome, pedidos, opcoes) {
  var o = opcoes || {};
  var tam = o.tamanhoLote || FONTE_TAMANHO_LOTE_;
  var out = pedidos.map(function () { return { ok: false, codigo: null, texto: null, erro: null, pulado: true, porTempo: false, transitorio: false }; });
  var aberta = nome ? fonteAberta_(nome) : null;
  if (aberta) {
    var msg = fonteDescreverPausa_(nome, aberta);
    out.forEach(function (r) { r.erro = msg; });
    return out;
  }
  var simples = function (p) { return o.fetch ? o.fetch(p.url, p) : UrlFetchApp.fetch(p.url, p); };
  for (var i = 0; i < pedidos.length; i += tam) {
    if (o.temTempo && !o.temTempo()) {
      for (var k = i; k < pedidos.length; k++) { out[k].erro = 'sem tempo nesta execução'; out[k].porTempo = true; }
      break;
    }
    var lote = pedidos.slice(i, i + tam).map(function (p) {
      var q = {}; Object.keys(p).forEach(function (c) { q[c] = p[c]; });
      if (q.muteHttpExceptions == null) q.muteHttpExceptions = true;
      return q;
    });
    var resps = null;
    try {
      if (o.fetchAll) resps = o.fetchAll(lote);
      else if (!o.fetch && typeof UrlFetchApp.fetchAll === 'function') resps = UrlFetchApp.fetchAll(lote);
    } catch (eLote) { resps = null; } // uma URL com exceção derruba o lote inteiro: refaz uma a uma (parando cedo se a rede caiu)
    if (!resps) {
      var seguidas = 0;
      resps = lote.map(function (p) {
        if (seguidas >= 2) return { __erro: 'sem resposta (rede)' };
        try { var r1 = simples(p); seguidas = 0; return r1; } catch (e2) { seguidas++; return { __erro: String(e2) }; }
      });
    }
    var algumaRespondeu = false, ultimaFalha = null;
    resps.forEach(function (resp, j) {
      var r = out[i + j];
      r.pulado = false;
      if (resp && resp.__erro != null) { r.erro = String(resp.__erro).replace(/^Exception:\s*/, '').slice(0, 100); r.transitorio = true; ultimaFalha = { erro: r.erro }; return; }
      var cod = resp.getResponseCode();
      r.codigo = cod;
      if (cod === 200) { r.ok = true; r.texto = resp.getContentText(); algumaRespondeu = true; return; }
      r.erro = 'HTTP ' + cod;
      var tipo = fonteClassificar_(cod, null);
      r.transitorio = tipo === 'instavel' || tipo === 'limite';
      if (!tipo) { algumaRespondeu = true; return; } // 404 etc.: a fonte respondeu
      ultimaFalha = { codigo: cod };
    });
    if (nome) {
      if (algumaRespondeu) fonteDeuCerto_(nome);
      else if (ultimaFalha) fonteFalhou_(nome, ultimaFalha);
      if (!algumaRespondeu && fonteAberta_(nome)) { // abriu no meio: não insiste nos lotes que faltam
        var m2 = fonteDescreverPausa_(nome, fonteAberta_(nome));
        for (var q2 = i + tam; q2 < pedidos.length; q2++) out[q2].erro = m2;
        break;
      }
    }
  }
  return out;
}
