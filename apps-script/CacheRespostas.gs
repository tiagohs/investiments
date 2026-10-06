/**
 * CacheRespostas.gs - 05/10/2026 (auditoria A-36 e A-37, Onda 2): cache da
 * RESPOSTA pronta de uma ação, "gerações" de cache e medição de capacidade.
 *
 * 1) cacheDeResposta_ (A-36): guarda a resposta já montada de uma ação (hoje:
 *    `metas` e `gastos`) no CacheService, em pedaços (os mesmos helpers da
 *    série da Início), com chave = nome + versão. A VERSÃO é o carimbo da
 *    última escrita (Planilha.gs!carimboEscritaPlanilha_, que o Router.gs
 *    renova a cada POST) + o que mais a ação precisar. Resposta que depende de
 *    cotação ao vivo recebe um TTL curto (a tela nunca fica mais que alguns
 *    minutos atrás da planilha); resposta que só muda quando o Tiago grava
 *    algo (gastos) usa as 6 h.
 *
 * 2) Gerações (A-37): uma "geração" é o conjunto de chaves (meta + pedaços)
 *    de UMA resposta cacheada. Cada chave nova (outro dia, outro carimbo, mais
 *    uma linha na planilha) deixava a geração anterior viva até o TTL - até 3
 *    gerações ≈ 510 chaves de um limite de 1.000. Agora gravarCacheGeracao_
 *    guarda em Properties qual é a geração atual de cada FAMÍLIA (ex.: "ativo
 *    PETR4", "proventos_tela") e apaga a anterior ao gravar a nova.
 *
 * 3) Capacidade (A-37): medirCapacidade_ devolve o uso do cache (chaves, bytes,
 *    % do limite de itens) e o % de uso das células de JSON (aux_metas,
 *    aux_patrimonio, aux_fii-portfolio: teto de ~49.000 caracteres por célula).
 *    Roda no pré-aquecimento diário da Agenda (vai pro log da agenda e pro
 *    Registro) e na ação `capacidade` (GET, só leitura). No editor:
 *    diagnosticoCapacidadeDireto().
 */

var CACHE_LIMITE_ITENS_ = 1000;                 // CacheService: 1.000 itens por cache
var CACHE_PROP_GERACAO_ = 'CACHE_GER_';         // + família -> { chave, pedacos, caracteres, bytes, em }
var CACHE_AVISO_PCT_ = 0.8;                     // a partir daqui a medição acusa "perto do limite"

// ---------------------------------------------------------------------------
// Gerações
// ---------------------------------------------------------------------------

function cacheLerGeracao_(familia) {
  try {
    var bruto = PropertiesService.getScriptProperties().getProperty(CACHE_PROP_GERACAO_ + familia);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) { return null; }
}

/** Apaga do cache a meta + os pedaços de uma chave gravada por gravarSerieHistoricoCache_. */
function cacheRemoverChave_(chave, pedacos) {
  try {
    var chaves = [chave + '_meta'];
    for (var i = 0; i < pedacos; i++) chaves.push(chave + '_' + i);
    CacheService.getScriptCache().removeAll(chaves);
  } catch (e) { /* cache é só otimização */ }
}

/**
 * Chamado por gravarSerieHistoricoCache_ (quando recebe `familia`) depois de
 * gravar: guarda qual é a geração atual da família e apaga a ANTERIOR (se a
 * chave mudou). Nunca lança.
 */
function registrarGeracaoCache_(familia, chave, info, ttlSegundos) {
  try {
    var anterior = cacheLerGeracao_(familia);
    if (anterior && anterior.chave && anterior.chave !== chave) cacheRemoverChave_(anterior.chave, anterior.pedacos);
    PropertiesService.getScriptProperties().setProperty(CACHE_PROP_GERACAO_ + familia,
      JSON.stringify({ chave: chave, pedacos: info.pedacos, caracteres: info.caracteres, bytes: info.bytes, em: Date.now(), ttl: ttlSegundos > 0 ? ttlSegundos : CACHE_SERIE_HISTORICO_TTL }));
  } catch (e) { /* sem registro: a geração anterior só expira pelo TTL */ }
}

/** Grava `valor` em `chave` registrando a geração da `familia` (a anterior some). Devolve { pedacos, caracteres, bytes } ou null. */
function gravarCacheGeracao_(familia, chave, valor, ttlSegundos) {
  return gravarSerieHistoricoCache_(chave, valor, ttlSegundos, familia);
}


// ---------------------------------------------------------------------------
// Cache da resposta de uma ação
// ---------------------------------------------------------------------------

/**
 * Resposta cacheada pela chave `chave` (família `familia`), ou `montar()` e
 * grava. `montar` devolve o objeto da resposta (sem `ok`; quem chama põe).
 * Falha de cache nunca derruba a resposta. TTL em segundos (padrão 6 h).
 */
function cacheDeResposta_(familia, chave, ttlSegundos, montar) {
  var emCache = null;
  try { emCache = lerSerieHistoricoCache_(chave); } catch (e) { emCache = null; }
  if (emCache) return emCache;
  var r = montar();
  try { gravarCacheGeracao_(familia, chave, r, ttlSegundos); } catch (e2) { /* segue sem cache */ }
  return r;
}

// ---------------------------------------------------------------------------
// Medição de capacidade
// ---------------------------------------------------------------------------

var CACHE_CELULAS_JSON_ = [
  { id: 'metas', nome: 'Metas', aba: 'aux_metas', coluna: 2, linhaInicial: 2, teto: function () { return typeof METAS_MAX_JSON_ !== 'undefined' ? METAS_MAX_JSON_ : 49000; } },
  { id: 'patrimonio', nome: 'Patrimônio', aba: 'aux_patrimonio', coluna: 2, linhaInicial: 2, teto: function () { return typeof PATRIMONIO_MAX_JSON_ !== 'undefined' ? PATRIMONIO_MAX_JSON_ : 49000; } },
  { id: 'fiiPortfolio', nome: 'Portfólio dos FIIs', aba: 'aux_fii-portfolio', coluna: 2, linhaInicial: 2, teto: function () { return typeof PORT_JSON_MAX_ !== 'undefined' ? PORT_JSON_MAX_ : 45000; } }
];

/**
 * { cache: { familias, chaves, caracteres, bytes, limiteItens, pctItens, aviso },
 *   celulas: [{ id, nome, aba, linhas, maior, teto, pct, aviso }], aviso }.
 * Só enxerga as famílias gravadas por gravarCacheGeracao_ (o CacheService não
 * lista chaves). `bytes` é UTF-8 (o que o limite de 100 KB por chave conta).
 */
function medirCapacidade_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var cache = { familias: 0, chaves: 0, caracteres: 0, bytes: 0, limiteItens: CACHE_LIMITE_ITENS_, pctItens: 0, aviso: false };
  var nomes = [];
  try { nomes = typeof props.getKeys === 'function' ? props.getKeys() : Object.keys(props.getProperties ? props.getProperties() : {}); } catch (e) { nomes = []; }
  nomes.forEach(function (n) {
    if (n.indexOf(CACHE_PROP_GERACAO_) !== 0) return;
    var g = cacheLerGeracao_(n.slice(CACHE_PROP_GERACAO_.length));
    if (!g) return;
    cache.familias += 1;
    cache.chaves += (g.pedacos || 0) + 1;
    cache.caracteres += g.caracteres || 0;
    cache.bytes += g.bytes || 0;
  });
  cache.pctItens = Math.round(cache.chaves / CACHE_LIMITE_ITENS_ * 1000) / 1000;
  cache.aviso = cache.pctItens >= CACHE_AVISO_PCT_;

  var celulas = [];
  CACHE_CELULAS_JSON_.forEach(function (c) {
    var teto = c.teto();
    var item = { id: c.id, nome: c.nome, aba: c.aba, linhas: 0, maior: 0, teto: teto, pct: 0, aviso: false };
    try {
      var aba = ss.getSheetByName(c.aba);
      if (aba && aba.getLastRow() >= c.linhaInicial) {
        var valores = aba.getRange(c.linhaInicial, c.coluna, aba.getLastRow() - c.linhaInicial + 1, 1).getValues();
        valores.forEach(function (l) {
          var t = String(l[0] === null || l[0] === undefined ? '' : l[0]);
          if (!t) return;
          item.linhas += 1;
          if (t.length > item.maior) item.maior = t.length;
        });
      }
    } catch (e) { item.erro = String(e); }
    item.pct = Math.round(item.maior / teto * 1000) / 1000;
    item.aviso = item.pct >= CACHE_AVISO_PCT_;
    celulas.push(item);
  });
  return { cache: cache, celulas: celulas, aviso: cache.aviso || celulas.some(function (c) { return c.aviso; }) };
}

/** Uma linha de texto com a medição (log). */
function resumoCapacidade_(m) {
  var pct = function (x) { return Math.round(x * 100) + '%'; };
  return 'cache ' + m.cache.chaves + ' chaves (' + pct(m.cache.pctItens) + ' do limite, ' + Math.round(m.cache.bytes / 1024) + ' KB em ' + m.cache.familias + ' famílias); JSON em célula: ' +
    m.celulas.map(function (c) { return c.nome + ' ' + pct(c.pct) + ' (maior ' + c.maior + ' de ' + c.teto + ')'; }).join(', ') + (m.aviso ? ' - ATENÇÃO: perto do limite' : '');
}

/** Versão curta (cabe no detalhe de 200 caracteres da Agenda/Registro). */
function resumoCapacidadeCurto_(m) {
  var pct = function (x) { return Math.round(x * 100) + '%'; };
  return 'cache ' + pct(m.cache.pctItens) + ' (' + m.cache.chaves + ' chaves); JSON ' +
    m.celulas.map(function (c) { return c.id + ' ' + pct(c.pct); }).join(' ') + (m.aviso ? ' ATENÇÃO: perto do limite' : '');
}

/** GET action=capacidade (somente leitura). */
function handleCapacidade(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var m = medirCapacidade_(SpreadsheetApp.getActiveSpreadsheet());
    m.ok = true;
    return jsonOut(m);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'capacidade', erro: String(erro) });
  }
}

/** Pro editor: mostra no log o uso do cache e das células de JSON. */
function diagnosticoCapacidadeDireto() {
  var m = medirCapacidade_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log(resumoCapacidade_(m));
  Logger.log(JSON.stringify(m, null, 2));
  return m;
}

// ---------------------------------------------------------------------------
// Pré-aquecimento (etapa da Agenda, depois de tudo que mexe nos dados do dia)
// ---------------------------------------------------------------------------

/**
 * 05/10/2026 (A-36): deixa quente o que a 1ª abertura do dia pagaria: `macro`
 * (5 fontes externas: BCB, Tesouro...), as peças lentas de `metas` (proventos,
 * câmbio, ativos, referências) e mede a capacidade (A-37). É só otimização:
 * nunca falha a etapa - o que deu errado vai no detalhe (e no log da Agenda).
 * Devolve { ok: true, detalhe, capacidade }.
 */
function preAquecerMetasEMacro_() {
  var inicio = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var partes = [];
  var problemas = [];
  var passo = function (nome, fn) {
    var t0 = Date.now();
    try { fn(); partes.push(nome + ' ' + Math.round((Date.now() - t0) / 100) / 10 + 's'); } catch (e) { problemas.push(nome + ': ' + String(e && e.message ? e.message : e).slice(0, 120)); }
  };
  if (typeof montarMacro_ === 'function') passo('macro', function () { montarMacro_(ss, new Date()); }); // cache de 6 h: só refaz o que expirou (nova tentativa da etapa não repete as 5 fontes)
  if (typeof montarTelaMetas_ === 'function') {
    // calcula direto (as peças lentas ficam nos caches delas) e grava a resposta pronta pra 1ª abertura
    passo('metas', function () {
      var agora = new Date();
      var r = montarTelaMetas_(ss, agora);
      if (typeof chaveCacheRespostaMetas_ === 'function') gravarCacheGeracao_('metas_resposta', chaveCacheRespostaMetas_(ss, agora), r, METAS_RESPOSTA_SEGUNDOS_);
    });
  }
  var cap = null;
  passo('capacidade', function () { cap = medirCapacidade_(ss); });
  var detalhe = 'metas/macro ' + Math.round((Date.now() - inicio) / 100) / 10 + 's' +
    (problemas.length ? ' (problema: ' + problemas.join('; ').slice(0, 60) + ')' : '') + (cap ? '; ' + resumoCapacidadeCurto_(cap) : '');
  if (cap) Logger.log('preAquecerMetasEMacro_: ' + resumoCapacidade_(cap));
  if (problemas.length) Logger.log('preAquecerMetasEMacro_: problemas - ' + problemas.join(' | '));
  return { ok: true, detalhe: detalhe, capacidade: cap };
}

/** Pro editor: roda o pré-aquecimento agora e mostra no log. */
function rodarPreAquecerMetasEMacroDireto() {
  var r = preAquecerMetasEMacro_();
  Logger.log(r.detalhe);
  return r;
}
