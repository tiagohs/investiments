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
var LEITURA_PROP_COTACAO_EM_ = 'LEITURA_COTACAO_EM'; // 29/10/2026: quando COMEÇOU a última montagem com as telas de cotação (ms)
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
    { acao: 'metasHistorico', fn: handleMetasHistorico, cotacao: false },
    // 30/10/2026: canais e ativos da tela de Notícias - quem lê é o cron do Worker (worker/src/noticias/coleta.js)
    { acao: 'noticiasConfig', fn: handleNoticiasConfig, cotacao: false },
    // 30/10/2026 (2): buscas do Google Notícias da tela de Notícias (o Google recusa o Cloudflare) - vai com as cotações
    // (a cada 30 min no pregão), sem ser preço
    { acao: 'noticiasGoogle', fn: handleNoticiasGoogle, cotacao: true, preco: false },
    // 29/10/2026: o Registro de Controle do topo de TODA tela (3-4 s no Apps Script). Vai junto de cada publicação de
    // cotação (`cotacao: true`, mas `preco: false` - não é preço: não pede cotação nova nem muda o "Cotações de HH:MM"); o
    // site só aceita a cópia com até 10 min (leitura-chave.js!IDADE_MAXIMA_LEITURA_MS) - mais velha, vai ao Apps Script.
    { acao: 'syncHistorico', params: { limite: '1' }, fn: handleSyncHistorico, cotacao: true, preco: false },
    { acao: 'syncHistorico', params: { limite: '20' }, fn: handleSyncHistorico, cotacao: true, preco: false },
    { acao: 'syncStatus', fn: handleSyncStatus, cotacao: true, preco: false }
  ];
}

/** Ações GET que ficam SÓ no Apps Script (dependem de fonte externa na hora, do Drive, ou de parâmetro livre). */
var LEITURA_SO_APPS_SCRIPT_ = ['ping', 'historico_inicio', 'meusAtivos', 'historicoAtivo', 'irRendaFixa',
  'noticiasAtivo', 'tesesAtivo', 'fundamentos', 'fiiPortfolio', 'videos', 'infoNovoAtivo', 'patrimonioIrArquivos',
  'patrimonioIrArquivo', 'holeritesArquivos', 'holeriteArquivo', 'gastosArquivos', 'gastosArquivo', 'intradia',
  'consolidacao', 'capacidade'];

/**
 * 29/10/2026 (Tiago: "as telas de ativos individuais ainda são lentas"): telas publicadas POR ATIVO (fora de
 * familiasLeitura_, que é uma lista fixa). Renda variável: 'ativoBase?ref=TICKER' (a tela sem a posição de hoje - o site
 * junta a linha da Carteira publicada). Renda fixa: 'ativo?ref=rf:...&semIndices=1' (a tela inteira, como o doGet).
 * Vão nas publicações completas ('tudo': agenda, depois de gravar, manual) - não no gatilho de cotação. Ativo que não está
 * no cache do Apps Script só é calculado enquanto houver tempo (LEITURA_ATIVOS_ORCAMENTO_MS_); o resto fica pra próxima.
 */
var LEITURA_POR_ATIVO_ = ['ativo', 'ativoBase'];
var LEITURA_ATIVOS_ORCAMENTO_MS_ = 120000;

function itensAtivosLeitura_(ss) {
  return refsDosAtivosDaCarteira_(ss).map(function (ref) {
    if (/^rf:/i.test(ref)) {
      return { acao: 'ativo', params: { ref: ref, semIndices: '1' }, montar: function (o) { return montarTelaAtivo_(ref, { semIndices: true, soCache: o.soCache }); } };
    }
    var ticker = ref.toUpperCase();
    return { acao: 'ativoBase', params: { ref: ticker }, montar: function (o) {
      var classes = memoAtivo_('classes', function () { return classesDaCarteiraParaProventos_(ss); });
      return telaAtivoSemPosicao_(ss, ticker, classes[ticker] || null, { semIndices: true, soCache: o.soCache });
    } };
  });
}

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
    // 29/10/2026: o site agora pede só as telas que a gravação mudou - pedidos anotados se JUNTAM (nunca um tira o outro)
    var anterior = null;
    try { anterior = JSON.parse(props.getProperty(LEITURA_PROP_PENDENTE_) || 'null'); } catch (eA) { anterior = null; }
    props.setProperty(LEITURA_PROP_PENDENTE_, JSON.stringify({ familias: juntarFamiliasLeitura_(anterior && anterior.familias, o.familias || 'tudo'), em: Date.now() }));
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

/** 'tudo' ganha de qualquer lista; 'cotacao' vira a lista das telas de cotação; listas se unem. */
function juntarFamiliasLeitura_(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  if (a === 'tudo' || b === 'tudo') return 'tudo';
  var lista = function (x) { return x === 'cotacao' ? familiasLeitura_().filter(function (f) { return f.cotacao; }).map(function (f) { return f.acao; }) : [].concat(x); };
  var out = [];
  lista(a).concat(lista(b)).forEach(function (f) { if (out.indexOf(f) === -1) out.push(f); });
  return out;
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
        tempos[chaveLeitura_(f.acao, f.params)] = Date.now() - t0;
      }
    });
    if (confirmar.length) enviar([]);
    // 29/10/2026: as telas de cada ativo (só nas publicações completas)
    var ativos = null;
    if (o.familias === 'tudo' && o.ativos !== false) {
      ativos = { publicadas: 0, iguais: 0, semCache: 0, ms: 0 };
      var t0a = Date.now();
      var antesPub = publicadas, antesConf = confirmadas;
      var ssA = SpreadsheetApp.getActiveSpreadsheet();
      var listaA = [];
      try { listaA = itensAtivosLeitura_(ssA); } catch (eL) { erros.push({ acao: 'ativos', erro: String(eL) }); }
      listaA.forEach(function (a) {
        var chaveA = chaveLeitura_(a.acao, a.params);
        try {
          // sem calcular ativo novo quando o orçamento dos ativos acabou OU a execução já passou de 4 min (limite de 6 min)
          var soCache = Date.now() - t0a > LEITURA_ATIVOS_ORCAMENTO_MS_ || Date.now() - inicio > 4 * 60 * 1000;
          var resp = a.montar({ soCache: soCache });
          if (!resp) { ativos.semCache++; return; }
          if (resp.ok !== true) { erros.push({ acao: chaveA, erro: String(resp.erro || resp.etapa || 'resposta sem ok') }); return; }
          var textoA = montarTextoLeitura_({ fn: function () { return jsonOut(resp); } }, auth);
          var hashA = etagDoTexto_(textoA);
          if (!o.forcar && hashes[chaveA] === hashA) { ativos.iguais++; confirmar.push({ chave: chaveA, hash: hashA }); return; }
          var bytesA = Utilities.gzip(Utilities.newBlob(textoA, 'application/json')).getBytes();
          enviar([{ chave: chaveA, hash: hashA, bytes: bytesA.length, gz: Utilities.base64Encode(bytesA) }]);
        } catch (eA) {
          erros.push({ acao: chaveA, erro: String(eA) });
        }
      });
      if (confirmar.length) enviar([]);
      ativos.publicadas = publicadas - antesPub;
      ativos.confirmadas = confirmadas - antesConf;
      publicadas = antesPub; confirmadas = antesConf; // os totais de cima continuam sendo das telas fixas
      ativos.ms = Date.now() - t0a;
      tempos.ativos = ativos.ms;
    }
    props.setProperty(LEITURA_PROP_HASHES_, JSON.stringify(hashes));
    var resumo = { ok: erros.length === 0, configurado: true, geracao: geracao, publicadas: publicadas, iguais: iguais, confirmadas: confirmadas, ativos: ativos, erros: erros,
      ms: Date.now() - inicio, tempos: tempos, origem: o.origem || 'Manual', em: new Date().toISOString() };
    props.setProperty(LEITURA_PROP_ULTIMA_, JSON.stringify(resumo).slice(0, 8000));
    // 29/10/2026: todas as telas de cotação foram (re)confirmadas com esta geração
    var todasCotacao = familiasLeitura_().filter(function (f) { return f.cotacao && f.preco !== false; }).every(function (f) { return escolhidas.some(function (e) { return e.acao === f.acao; }); });
    if (todasCotacao && !erros.length) props.setProperty(LEITURA_PROP_COTACAO_EM_, String(instanteDaGeracaoLeitura_(geracao)));
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
/** Instante (ms) de uma geração "<versão>.<ms>..." - o mesmo de assets/js/leitura-chave.js!instanteDaGeracao. */
function instanteDaGeracaoLeitura_(g) {
  var m = String(g || '').match(/\.(\d{10,})[a-z0-9]*$/);
  return m ? Number(m[1]) : 0;
}

/**
 * 29/10/2026 (Tiago: "sempre que eu entro no site, o valor da cotação naquele momento seja o último disponível"): o site,
 * ao ler do Worker uma tela de cotação com mais de 5 min no pregão, pede action=publicarLeitura&familias=cotacao&
 * seMaisVelhaQueMin=5. Aqui só publica se ainda for preciso: no pregão e com a última montagem de cotação mais velha que
 * isso (vários aparelhos/telas pedindo ao mesmo tempo = 1 publicação). É uma execução do Web App, não de gatilho: não
 * gasta a cota diária de gatilhos (por isso o gatilho do pregão continua de 30 em 30 min).
 */
function cotacaoPrecisaPublicar_(minutos, agora) {
  var t = agora || new Date();
  if (!dentroDoPregaoLeitura_(t)) return { precisa: false, motivo: 'fora do pregão' };
  var em = Number(PropertiesService.getScriptProperties().getProperty(LEITURA_PROP_COTACAO_EM_)) || 0;
  if (t.getTime() - em < minutos * 60000) return { precisa: false, motivo: 'publicada há menos de ' + minutos + ' min', em: em };
  return { precisa: true, em: em };
}

function handlePublicarLeitura(e) {
  var f = String((e && e.parameter && e.parameter.familias) || 'tudo');
  var seMin = Number(e && e.parameter && e.parameter.seMaisVelhaQueMin);
  if (f === 'cotacao' && seMin > 0) {
    var p = cotacaoPrecisaPublicar_(seMin);
    if (!p.precisa) return jsonOut({ ok: true, pulado: p.motivo, cotacaoEm: p.em || null });
  }
  var familias = f === 'tudo' || f === 'cotacao' ? f : f.split(',').map(function (x) { return x.trim(); }).filter(String);
  // 30/10/2026: "Atualizar" da tela de Notícias - busca o Google de novo, sem o cache (Noticias.gs!noticiasForcadoAgora_)
  if (e && e.parameter && e.parameter.forcarNoticias === '1') noticiasForcadoAgora_();
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
