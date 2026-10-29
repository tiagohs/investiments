/**
 * Publicacao.gs - 29/10/2026: camada de leitura no Cloudflare (docs/arquitetura-leitura-cloudflare.md).
 *
 * O Apps Script continua calculando tudo (ADR-02): aqui as respostas das telas são montadas pelas MESMAS funções do
 * doGet (handleHome, handleCarteirasAcoes...) e enviadas prontas, em gzip, ao Worker de leitura - que só as entrega.
 * Só vai o que mudou desde a última publicação (hash = a etag do doGet, Auth.gs!etagDoTexto_).
 *
 * Quando publica:
 *   - etapa "publicarLeitura" da agenda diária (Agenda.gs), depois das atualizações do dia: todas as telas;
 *   - gatilho a cada 30 min no pregão (gatilhoPublicacaoPregao; dia útil da B3, 10:00-18:30 SP): telas com cotação.
 *     29/10/2026: era 15 min; a 1ª publicação completa levou ~2,5 min (Início ~20 s) - a cota de gatilhos do Google é de
 *     90 min/dia. Volta pra 15 quando a planilha emagrecer (F0) e os tempos (resumo.tempos) caírem;
 *   - POST action=publicarLeitura, que o site chama em segundo plano depois de cada gravação.
 *
 * Configuração (Propriedades do script, nunca no repositório): LEITURA_URL (endereço do Worker) e LEITURA_SEGREDO
 * (o mesmo PUBLICACAO_SEGREDO do Worker). Sem as duas, nada é publicado e o site segue lendo do Apps Script.
 * Passo a passo: npm run worker:configurar (scripts/worker.mjs) - no fim ele mostra os 2 valores pra pôr em Propriedades do
 * script; depois, no editor, publicarLeituraDireto() e instalarGatilhoPublicacaoDireto().
 */

var LEITURA_PROP_URL_ = 'LEITURA_URL';
var LEITURA_PROP_SEGREDO_ = 'LEITURA_SEGREDO';
var LEITURA_PROP_HASHES_ = 'LEITURA_HASHES';   // { chave: hash } do que o Worker já tem
var LEITURA_PROP_ULTIMA_ = 'LEITURA_ULTIMA';   // resumo da última publicação (saúde)
var LEITURA_PREGAO_INICIO_ = '10:00';
var LEITURA_PREGAO_FIM_ = '18:30';

/**
 * As telas publicadas. `cotacao`: muda com o preço (republicada no pregão). As ações e os parâmetros são exatamente os
 * que o site pede hoje (assets/js/api-client.js). Função (e não var) pra ler os handlers na hora da chamada.
 */
function familiasLeitura_() {
  // 29/10/2026: a ordem é a ordem de envio (cada tela vai ao Worker assim que fica pronta). Primeiro as telas que o
  // Tiago abre e atualiza mais - home, Transações (e o carrinho de aportes) e os gastos da Organização.
  return [
    { acao: 'home', fn: handleHome, cotacao: true },
    { acao: 'transacoes', fn: handleTransacoes, cotacao: true },
    { acao: 'aportesPendentes', fn: handleAportesPendentes, cotacao: false },
    { acao: 'despesas', fn: handleDespesas, cotacao: false },
    { acao: 'gastos', fn: handleGastos, cotacao: false },
    { acao: 'distribuicoesMetas', fn: handleDistribuicoesMetas, cotacao: true },
    { acao: 'carteirasHome', fn: handleCarteirasHome, cotacao: true },
    { acao: 'carteirasAcoes', fn: handleCarteirasAcoes, cotacao: true },
    { acao: 'carteirasFiis', fn: handleCarteirasFiis, cotacao: true },
    { acao: 'carteirasAcoesEua', fn: handleCarteirasAcoesEua, cotacao: true },
    { acao: 'carteirasRendaFixa', fn: handleCarteirasRendaFixa, cotacao: true },
    { acao: 'metas', fn: handleMetas, cotacao: true },
    { acao: 'patrimonio', fn: handlePatrimonio, cotacao: true },
    { acao: 'macro', fn: handleMacro, cotacao: true },
    { acao: 'proventos', fn: handleProventos, cotacao: false },
    { acao: 'inflacaoPessoal', fn: handleInflacaoPessoal, cotacao: false },
    { acao: 'salario', fn: handleSalario, cotacao: false },
    { acao: 'metasHistorico', fn: handleMetasHistorico, cotacao: false }
  ];
}

/** Ações GET que ficam SÓ no Apps Script (dependem de fonte externa na hora, do Drive, ou de parâmetro livre). */
var LEITURA_SO_APPS_SCRIPT_ = ['ping', 'syncStatus', 'syncHistorico', 'historico_inicio', 'meusAtivos', 'historicoAtivo', 'irRendaFixa',
  'ativo', 'noticiasAtivo', 'tesesAtivo', 'fundamentos', 'fiiPortfolio', 'videos', 'infoNovoAtivo', 'patrimonioIrArquivos',
  'patrimonioIrArquivo', 'holeritesArquivos', 'holeriteArquivo', 'gastosArquivos', 'gastosArquivo', 'intradia',
  'consolidacao', 'capacidade'];

/** A chave canônica - o MESMO formato de assets/js/leitura-chave.js!chaveLeitura (testado nos dois lados). */
function chaveLeitura_(acao, params) {
  var p = params || {};
  var nomes = Object.keys(p).filter(function (n) { return p[n] !== undefined && p[n] !== null && p[n] !== ''; }).sort();
  if (!nomes.length) return String(acao);
  return acao + '?' + nomes.map(function (n) { return encodeURIComponent(n) + '=' + encodeURIComponent(String(p[n])); }).join('&');
}

function configLeitura_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty(LEITURA_PROP_URL_) || '').replace(/\/+$/, '');
  var segredo = String(props.getProperty(LEITURA_PROP_SEGREDO_) || '');
  return { url: url, segredo: segredo, ok: /^https:\/\//.test(url) && segredo.length >= 32 };
}

/** HMAC-SHA256 em base64url sem "=" - o mesmo do Worker (worker/src/auth.js!hmacBase64Url). */
function assinaturaLeitura_(segredo, dados) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(dados, segredo)).replace(/=+$/, '');
}

/**
 * O JSON da tela, idêntico ao do doGet sem _etag/_ms: a mesma função, com o _REQ_ desligado enquanto monta
 * (Auth.gs!jsonOut só acrescenta _etag/_ms numa requisição GET em andamento).
 */
function montarTextoLeitura_(familia, auth) {
  var req = typeof _REQ_ !== 'undefined' ? _REQ_ : null;
  if (typeof _REQ_ !== 'undefined') _REQ_ = null;
  try {
    var saida = familia.fn({ parameter: familia.params || {} }, auth);
    return saida.getContent();
  } finally {
    if (typeof _REQ_ !== 'undefined') _REQ_ = req;
  }
}

/**
 * Monta e envia. opcoes: { familias: 'tudo' | 'cotacao' | ['home', ...], forcar: bool, origem }.
 * Devolve { ok, configurado, geracao, publicadas, iguais, erros: [{ acao, erro }], ms }. Nunca lança.
 */
var LEITURA_PROP_PENDENTE_ = 'LEITURA_PENDENTE';

/**
 * 29/10/2026: a trava é um recurso nomeado (Planilha.gs!travaRecurso_), NÃO o lock do script - as gravações usam o lock do
 * script como seção crítica curta, e uma publicação de 1 minuto segurando ele faria gravação falhar. Se outra publicação
 * estiver rodando, esta só deixa o pedido anotado (LEITURA_PENDENTE) e a que está rodando faz mais uma volta no fim.
 */
function publicarLeitura_(opcoes) {
  var o = opcoes || {};
  if (!configLeitura_().ok) return { ok: false, configurado: false, erro: 'LEITURA_URL/LEITURA_SEGREDO não configurados' };
  var props = PropertiesService.getScriptProperties();
  var trava = travaRecurso_('leitura-publicacao', 'Publicação da leitura (' + (o.origem || 'Manual') + ')', { ttlMs: 5 * 60 * 1000, leitura: true });
  if (!trava.tryLock(0)) {
    props.setProperty(LEITURA_PROP_PENDENTE_, JSON.stringify({ familias: o.familias || 'tudo', em: Date.now() }));
    return { ok: true, configurado: true, adiada: true, publicadas: 0, iguais: 0, erros: [] };
  }
  try {
    var r = publicarLeituraSemTrava_(o);
    for (var volta = 0; volta < 2; volta++) {
      var pend = props.getProperty(LEITURA_PROP_PENDENTE_);
      if (!pend) break;
      props.deleteProperty(LEITURA_PROP_PENDENTE_);
      var p = {};
      try { p = JSON.parse(pend) || {}; } catch (eP) { p = {}; }
      var r2 = publicarLeituraSemTrava_({ familias: p.familias || 'tudo', origem: o.origem });
      r.publicadas += r2.publicadas || 0;
      r.erros = (r.erros || []).concat(r2.erros || []);
    }
    return r;
  } finally {
    trava.releaseLock();
  }
}

function publicarLeituraSemTrava_(opcoes) {
  var o = opcoes || {};
  var inicio = Date.now();
  var cfg = configLeitura_();
  try {
    if (typeof iniciarExecucao_ === 'function') iniciarExecucao_();
    if (typeof ativarLeituraUnica_ === 'function') ativarLeituraUnica_();
    // a geração ANTES de ler (ADR-05). 29/10/2026 (bug): era o carimbo da última GRAVAÇÃO - mas o site exige, depois de
    // gravar, uma geração >= o relógio do fim da gravação (_agora, Auth.gs!jsonOut), e o carimbo da gravação é sempre
    // ANTERIOR a esse relógio: depois de qualquer gravação o site nunca mais aceitava o Worker (tudo voltava ao Apps Script).
    // Agora a geração é o instante em que esta montagem começou a ler a planilha: tudo o que foi gravado antes dele está aqui.
    var geracao = VERSAO_CODIGO_CACHE_ + '.' + String(Date.now()) + 'pub';
    var props = PropertiesService.getScriptProperties();
    var hashes = {};
    try { hashes = JSON.parse(props.getProperty(LEITURA_PROP_HASHES_) || '{}') || {}; } catch (eH) { hashes = {}; }
    var escolhidas = familiasLeitura_().filter(function (f) {
      if (o.familias === 'cotacao') return f.cotacao;
      if (Array.isArray(o.familias)) return o.familias.indexOf(f.acao) !== -1;
      return true;
    });
    var auth = { ok: true, email: typeof emailAutorizado_ === 'function' ? emailAutorizado_() : '', tipo: 'publicacao' };
    var itens = [], erros = [], iguais = 0, tempos = {}, publicadas = 0;
    // 29/10/2026: cada tela vai assim que fica pronta (a 1ª publicação levou ~2,5 min: a Início chega ao Worker em segundos,
    // não no fim de tudo)
    // 29/10/2026: tela IGUAL à do Worker não reenvia o corpo, mas CONFIRMA a geração nova (chave + hash) - senão ela ficava
    // com a geração antiga e o site, depois de uma gravação em outra tela, a recusava pra sempre. Vai junto do próximo envio.
    var confirmar = [], confirmadas = 0;
    function enviar(lote) {
      var conf = confirmar; confirmar = [];
      var r = enviarLoteLeitura_(cfg, { geracao: geracao, itens: lote, confirmar: conf });
      var recusadas = (r.recusadas || []).map(function (x) { return x.chave; });
      if (!r.enviado) { lote.concat(conf).forEach(function (it) { erros.push({ acao: it.chave, erro: r.erro }); }); return; }
      confirmadas += conf.length;
      lote.forEach(function (it) {
        if (recusadas.indexOf(it.chave) === -1) { hashes[it.chave] = it.hash; publicadas++; } else erros.push({ acao: it.chave, erro: 'recusada pelo Worker' });
      });
    }
    escolhidas.forEach(function (f) {
      var t0 = Date.now();
      try {
        var texto = montarTextoLeitura_(f, auth);
        var obj = JSON.parse(texto);
        if (!obj || obj.ok !== true) { erros.push({ acao: f.acao, erro: String((obj && (obj.erro || obj.etapa)) || 'resposta sem ok') }); return; }
        var chave = chaveLeitura_(f.acao, f.params);
        var hash = etagDoTexto_(texto);
        if (!o.forcar && hashes[chave] === hash) { iguais++; confirmar.push({ chave: chave, hash: hash }); return; }
        var gz = Utilities.gzip(Utilities.newBlob(texto, 'application/json'));
        var bytes = gz.getBytes();
        var item = { chave: chave, hash: hash, bytes: bytes.length, gz: Utilities.base64Encode(bytes) };
        itens.push(item);
        enviar([item]);
      } catch (eF) {
        erros.push({ acao: f.acao, erro: String(eF) });
      } finally {
        tempos[f.acao] = Date.now() - t0;
      }
    });
    if (confirmar.length) enviar([]);
    props.setProperty(LEITURA_PROP_HASHES_, JSON.stringify(hashes));
    var resumo = { ok: erros.length === 0, configurado: true, geracao: geracao, publicadas: publicadas, iguais: iguais, confirmadas: confirmadas, erros: erros,
      ms: Date.now() - inicio, tempos: tempos, origem: o.origem || 'Manual', em: new Date().toISOString() };
    props.setProperty(LEITURA_PROP_ULTIMA_, JSON.stringify(resumo).slice(0, 8000));
    if (erros.length && typeof gravarRegistroControle_ === 'function') {
      try { gravarRegistroControle_('Atenção', o.origem || 'Manual', 'Publicação da leitura (Cloudflare): ' + erros.length + ' tela(s) com erro - ' + erros.slice(0, 3).map(function (x) { return x.acao + ': ' + x.erro; }).join(' | ')); } catch (eR) { /* ok */ }
    }
    return resumo;
  } catch (e) {
    return { ok: false, configurado: true, erro: String(e), ms: Date.now() - inicio, publicadas: 0, erros: [{ acao: '*', erro: String(e) }] };
  }
}

/** POST /v1/publicar assinado. { enviado, recusadas, erro }. */
function enviarLoteLeitura_(cfg, lote) {
  try {
    var corpo = JSON.stringify(lote);
    var carimbo = String(Date.now());
    var resp = UrlFetchApp.fetch(cfg.url + '/v1/publicar', {
      method: 'post', contentType: 'application/json', payload: corpo, muteHttpExceptions: true,
      headers: { 'X-Carimbo': carimbo, 'X-Assinatura': assinaturaLeitura_(cfg.segredo, carimbo + '.' + corpo) }
    });
    var codigo = resp.getResponseCode();
    var json = {};
    try { json = JSON.parse(resp.getContentText() || '{}'); } catch (eJ) { json = {}; }
    if (codigo !== 200) return { enviado: false, erro: 'Worker HTTP ' + codigo + (json.erro ? ' - ' + json.erro : '') };
    return { enviado: true, recusadas: json.recusadas || [] };
  } catch (e) {
    return { enviado: false, erro: String(e) };
  }
}

/** POST action=publicarLeitura (o site chama depois de gravar, em segundo plano). e.parameter.familias: 'tudo' (padrão) ou lista "a,b". */
function handlePublicarLeitura(e) {
  var f = String((e && e.parameter && e.parameter.familias) || 'tudo');
  var familias = f === 'tudo' || f === 'cotacao' ? f : f.split(',').map(function (x) { return x.trim(); }).filter(String);
  var r = publicarLeitura_({ familias: familias, origem: 'Site' });
  return jsonOut({ ok: r.ok !== false || r.configurado === false, publicacao: r });
}

/** Etapa da agenda diária: publica tudo depois das atualizações do dia. */
function publicarLeituraAgenda_() {
  return publicarLeitura_({ familias: 'tudo', origem: 'Automático' });
}

/** Gatilho de 30 em 30 min: só no pregão (dia útil da B3, 10:00-18:30 em São Paulo) e só as telas com cotação. */
function gatilhoPublicacaoPregao() {
  var agora = new Date();
  if (!dentroDoPregaoLeitura_(agora)) return { ok: true, pulado: true };
  return publicarLeitura_({ familias: 'cotacao', origem: 'Automático' });
}

function dentroDoPregaoLeitura_(agora) {
  var dia = agendaChaveDia_(agora);
  if (!agendaClassificarDia_(dia).util) return false;
  var hora = agendaFormatar_(agora, 'HH:mm');
  return hora >= LEITURA_PREGAO_INICIO_ && hora <= LEITURA_PREGAO_FIM_;
}

// ---------------------------------------------------------------------------
// No editor (1x)
// ---------------------------------------------------------------------------

function configurarLeituraDireto(url, segredo) {
  if (!/^https:\/\//.test(String(url || ''))) throw new Error('Passe o endereço do Worker (https://...)');
  if (String(segredo || '').length < 32) throw new Error('O segredo precisa ter pelo menos 32 caracteres (o mesmo PUBLICACAO_SEGREDO do Worker)');
  var props = PropertiesService.getScriptProperties();
  props.setProperty(LEITURA_PROP_URL_, String(url).replace(/\/+$/, ''));
  props.setProperty(LEITURA_PROP_SEGREDO_, String(segredo));
  props.deleteProperty(LEITURA_PROP_HASHES_); // Worker novo: publica tudo de novo
  Logger.log('Leitura configurada. Rode publicarLeituraDireto() para a 1ª publicação.');
}

function publicarLeituraDireto() {
  var r = publicarLeitura_({ familias: 'tudo', forcar: true, origem: 'Manual' });
  Logger.log(JSON.stringify(r));
  return r;
}

function instalarGatilhoPublicacaoDireto() {
  ScriptApp.getProjectTriggers().forEach(function (g) { if (g.getHandlerFunction() === 'gatilhoPublicacaoPregao') ScriptApp.deleteTrigger(g); });
  ScriptApp.newTrigger('gatilhoPublicacaoPregao').timeBased().everyMinutes(30).create();
  Logger.log('Gatilho do pregão instalado (a cada 30 min; fora do pregão ele só sai).');
}

/** O segredo da sessão s1, pra copiar no Worker (npx wrangler secret put SESSAO_SEGREDO). Só no editor, só no seu Log. */
function mostrarSegredoSessaoParaWorkerDireto() {
  Logger.log(segredoSessao_());
}

/** A última publicação (tempo de cada tela, erros) - a tela de Propriedades do editor não mostra tudo. */
function mostrarUltimaPublicacaoDireto() {
  var r = PropertiesService.getScriptProperties().getProperty(LEITURA_PROP_ULTIMA_);
  Logger.log(r || 'nenhuma publicação ainda');
  return r;
}
