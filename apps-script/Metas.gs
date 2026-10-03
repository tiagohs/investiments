/**
 * Metas.gs - 02/10/2026: tela "Metas e Objetivos" (metas.html).
 *
 * Tiago: "novo menu principal Metas e Objetivos, v1 funcional já" - lista de
 * metas com fluxo de criação; cada tipo (renda passiva, viagem, casa, carro,
 * reserva de emergência, aposentadoria e os de "acúmulo até uma data") tem os
 * seus campos; sub-itens de custo; multimoeda (o restante sempre em reais);
 * investimentos vinculados ("esse CDI em tal instituição é dessa meta"), com o
 * progresso andando sozinho pelo valor atual deles; simulador de prazo.
 *
 * Onde mora cada coisa:
 *   'aux_metas'   Id | Meta (JSON) | Atualizado em      (1 linha por meta)
 *       criada no 1º salvamento. Excluir = marcar "arquivada" (nunca apaga).
 *   Lidos de outras telas (nada é recalculado aqui):
 *     montarMeusAtivos_ (MeusAtivos.gs)     valor de hoje de cada ativo - o
 *         mesmo que a Início/Carteiras mostram (RV = preço x quantidade, EUA
 *         pelo dólar da planilha; Renda Fixa = Valor Atualizado, com a marca
 *         "Renda Emergencial" da Carteira Renda Fixa).
 *     lerDespesasOrganizacao_ (Despesas.gs) custo de vida e a reserva da
 *         Distribuição e Metas (meses, sobra, meta, atual).
 *     montarTelaProventosComCache_ + mediaRendaPassiva12Meses_ (Proventos.gs)
 *         a média de renda passiva dos 12 meses fechados - a MESMA da
 *         Distribuição e Metas - e o total de 12 meses por ticker.
 *     montarMetasCarteira_ (DistribuicoesMetas.gs) a meta mensal de renda
 *         passiva da planilha (U12), só como sugestão.
 *   Câmbio: AwesomeAPI (economia.awesomeapi.com.br, sem chave) e, se ela
 *     falhar ou estourar a cota, a PTAX do Banco Central (olinda.bcb.gov.br);
 *     em último caso o dólar da planilha / o euro da Auxiliar_app. Cache de 6h.
 *
 * A conta de cada meta (alvo, quanto falta, aporte necessário, prazo,
 * status) é feita no navegador (assets/js/pages/metas-calc.js), que também
 * serve o simulador e a prévia do fluxo de criação. Aqui só sai o que vem da
 * planilha: as metas, os ativos com valor, o câmbio, as referências e - por
 * meta - o valor resolvido dos investimentos vinculados (progresso.valorVinculado,
 * mesma regra de metas-calc.js!resolverVinculos).
 *
 * GET  action=metas                       { metas, arquivadas, ativos, cambio, referencias, proventos12m, avisos? }
 * POST action=salvarMeta   meta (JSON)    cria (sem id) ou substitui (com id)
 * POST action=excluirMeta  id [, restaurar=1]   arquiva (ou desarquiva)
 *
 * Depois de colar: NOVA VERSÃO da implantação (Router.gs ganhou as 3 ações).
 */

var METAS_ABA_ = 'aux_metas';
var METAS_MAX_JSON_ = 49000;
var METAS_CACHE_CAMBIO_ = 'metas_cambio_v1';
var METAS_CAMBIO_SEGUNDOS_ = 6 * 60 * 60;
var METAS_TIPOS_ = ['rendaPassiva', 'viagemInternacional', 'viagemNacional', 'casa', 'carro', 'reservaEmergencia', 'aposentadoria', 'acumulo'];
var METAS_CATEGORIAS_ = ['projetos', 'educacao', 'equipamentos', 'empreendedorismo', 'hobbies', 'pets', 'eventos', 'assinaturas', 'saude', 'mudancaPais', 'casamento', 'veiculosLazer', 'outros'];
var METAS_MOEDAS_ = ['BRL', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'];
var METAS_DINHEIRO_MAX_ = 1e10;

function handleMetas(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var r = montarTelaMetas_(SpreadsheetApp.getActiveSpreadsheet(), new Date());
    r.ok = true;
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'metas', erro: String(erro) });
  }
}

function handleSalvarMeta(e) {
  var trava = LockService.getScriptLock();
  try { trava.waitLock(20000); } catch (eL) { return jsonOut({ ok: false, etapa: 'metas', erro: 'planilha ocupada, tente de novo em alguns segundos' }); }
  try {
    var p = (e && e.parameter) || {};
    return jsonOut(salvarMeta_(SpreadsheetApp.getActiveSpreadsheet(), p.meta, new Date()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'metas', erro: String(erro && erro.message ? erro.message : erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

function handleExcluirMeta(e) {
  var trava = LockService.getScriptLock();
  try { trava.waitLock(20000); } catch (eL) { return jsonOut({ ok: false, etapa: 'metas', erro: 'planilha ocupada, tente de novo em alguns segundos' }); }
  try {
    var p = (e && e.parameter) || {};
    return jsonOut(arquivarMeta_(SpreadsheetApp.getActiveSpreadsheet(), p.id, p.restaurar === '1' || p.restaurar === 'true', new Date()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'metas', erro: String(erro && erro.message ? erro.message : erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

/** Pra conferir no editor: Logger com o que a tela recebe. */
function testarMetasDireto() {
  Logger.log(JSON.stringify(montarTelaMetas_(SpreadsheetApp.getActiveSpreadsheet(), new Date()), null, 2));
}

// ---------------------------------------------------------------------------
// aux_metas: ler / gravar / arquivar
// ---------------------------------------------------------------------------

/** Todas as linhas da aba (inclusive arquivadas): [{ meta, linha, atualizadoEm }]. */
function lerLinhasMetas_(ss) {
  var aba = ss.getSheetByName(METAS_ABA_);
  if (!aba) return [];
  var ultima = aba.getLastRow();
  if (!(ultima >= 2)) return [];
  var out = [];
  aba.getRange(2, 1, ultima - 1, 3).getValues().forEach(function (l, i) {
    var id = String(l[0] || '').trim();
    if (!id || !l[1]) return;
    var meta;
    try { meta = JSON.parse(String(l[1]).replace(/^'/, '')); } catch (eJ) { return; }
    if (!meta || typeof meta !== 'object') return;
    meta.id = id;
    var d = l[2];
    out.push({ meta: meta, linha: i + 2, atualizadoEm: d && typeof d.getTime === 'function' ? d.toISOString() : (d ? String(d) : null) });
  });
  return out;
}

/** Metas não arquivadas (ou só as arquivadas), na ordem da aba. */
function lerMetas_(ss, opcoes) {
  var arquivadas = !!(opcoes && opcoes.arquivadas);
  return lerLinhasMetas_(ss).filter(function (x) { return (x.meta.status === 'arquivada') === arquivadas; }).map(function (x) {
    x.meta.atualizadoEm = x.atualizadoEm;
    return x.meta;
  });
}

function garantirAbaMetas_(ss) {
  var aba = ss.getSheetByName(METAS_ABA_);
  if (aba && aba.getLastRow() >= 1) return aba;
  if (!aba || typeof aba.getRange !== 'function') aba = ss.insertSheet(METAS_ABA_);
  aba.getRange(1, 1, 1, 3).setValues([['Id', 'Meta (JSON)', 'Atualizado em']]);
  if (aba.setFrozenRows) aba.setFrozenRows(1);
  return aba;
}

function novoIdMeta_() {
  var aleatorio = (typeof Utilities !== 'undefined' && Utilities.getUuid) ? Utilities.getUuid().replace(/-/g, '').slice(0, 6) : Math.random().toString(36).slice(2, 8);
  return 'm' + Date.now().toString(36) + aleatorio;
}

function salvarMeta_(ss, metaJson, agora) {
  if (metaJson === undefined || metaJson === null || String(metaJson).trim() === '') return { ok: false, etapa: 'metas', erro: 'meta vazia' };
  var bruta;
  try { bruta = JSON.parse(metaJson); } catch (eJ) { return { ok: false, etapa: 'metas', erro: 'meta inválida (JSON)' }; }
  var meta = normalizarMeta_(bruta);
  var linhas = lerLinhasMetas_(ss);
  var existente = null;
  if (meta.id) {
    for (var i = 0; i < linhas.length; i++) if (linhas[i].meta.id === meta.id) { existente = linhas[i]; break; }
    if (!existente) return { ok: false, etapa: 'metas', erro: 'meta não encontrada: ' + meta.id };
    meta.criadaEm = existente.meta.criadaEm || meta.criadaEm;
  } else {
    meta.id = novoIdMeta_();
    meta.criadaEm = isoDiaMeta_(agora || new Date());
  }
  var id = meta.id;
  var copia = JSON.parse(JSON.stringify(meta));
  delete copia.id; delete copia.atualizadoEm; delete copia.progresso;
  var texto = JSON.stringify(copia);
  if (texto.length > METAS_MAX_JSON_) return { ok: false, etapa: 'metas', erro: 'meta grande demais pra uma célula (' + texto.length + ' caracteres)' };
  var aba = garantirAbaMetas_(ss);
  var linha = existente ? existente.linha : Math.max(aba.getLastRow(), 1) + 1;
  aba.getRange(linha, 1, 1, 3).setValues([[id, texto, agora || new Date()]]);
  if (SpreadsheetApp.flush) SpreadsheetApp.flush();
  return { ok: true, id: id, meta: meta, metas: lerMetas_(ss) };
}

function arquivarMeta_(ss, id, restaurar, agora) {
  id = String(id || '').trim();
  if (!id) return { ok: false, etapa: 'metas', erro: 'informe o id da meta' };
  var linhas = lerLinhasMetas_(ss);
  var achada = null;
  for (var i = 0; i < linhas.length; i++) if (linhas[i].meta.id === id) { achada = linhas[i]; break; }
  if (!achada) return { ok: false, etapa: 'metas', erro: 'meta não encontrada: ' + id };
  var meta = achada.meta;
  meta.status = restaurar ? 'ativa' : 'arquivada';
  if (restaurar) delete meta.arquivadaEm; else meta.arquivadaEm = isoDiaMeta_(agora || new Date());
  var copia = JSON.parse(JSON.stringify(meta));
  delete copia.id;
  var aba = garantirAbaMetas_(ss);
  aba.getRange(achada.linha, 1, 1, 3).setValues([[id, JSON.stringify(copia), agora || new Date()]]);
  if (SpreadsheetApp.flush) SpreadsheetApp.flush();
  return { ok: true, id: id, status: meta.status, metas: lerMetas_(ss) };
}

// ---------------------------------------------------------------------------
// Normalização: só os campos conhecidos, números conferidos, texto sem fórmula
// ---------------------------------------------------------------------------

function isoDiaMeta_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function numMeta_(v, min, max, campo) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  if (!isFinite(n)) throw new Error('número inválido em ' + campo);
  if ((min !== null && n < min) || (max !== null && n > max)) throw new Error('valor fora do esperado em ' + campo + ': ' + v);
  return Math.round(n * 1e6) / 1e6;
}
function txtMeta_(v, max) { return v === null || v === undefined ? '' : String(v).replace(/^[=+\-@\s]+/, '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max || 80); }
function mesMeta_(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})/); return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? m[1] + '-' + m[2] : null; }
function moedaMeta_(v) { var m = String(v || 'BRL').toUpperCase(); return METAS_MOEDAS_.indexOf(m) >= 0 ? m : 'BRL'; }
function idCurtoMeta_(v) { var s = String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24); return s || Math.random().toString(36).slice(2, 10); }

function normalizarMeta_(v) {
  if (!v || typeof v !== 'object') throw new Error('meta inválida');
  var tipo = METAS_TIPOS_.indexOf(v.tipo) >= 0 ? v.tipo : null;
  if (!tipo) throw new Error('tipo de meta inválido: ' + v.tipo);
  var nome = txtMeta_(v.nome, 80).trim();
  if (!nome) throw new Error('dê um nome pra meta');
  var d = function (x, campo) { return numMeta_(x, 0, METAS_DINHEIRO_MAX_, campo); };
  var meta = {
    id: v.id ? idCurtoMeta_(v.id) : null,
    tipo: tipo,
    categoria: tipo === 'acumulo' ? (METAS_CATEGORIAS_.indexOf(v.categoria) >= 0 ? v.categoria : 'outros') : null,
    nome: nome,
    notas: txtMeta_(v.notas, 400),
    status: ['ativa', 'arquivada', 'pausada'].indexOf(v.status) >= 0 ? v.status : 'ativa',
    moeda: moedaMeta_(v.moeda),
    valorAlvo: d(v.valorAlvo, 'valorAlvo'),
    dataAlvo: mesMeta_(v.dataAlvo),
    valorInicial: d(v.valorInicial, 'valorInicial'),
    aporteMensal: d(v.aporteMensal, 'aporteMensal'),
    rendimentoAnual: numMeta_(v.rendimentoAnual, -0.5, 1, 'rendimentoAnual'),
    contribuicao: v.contribuicao === 'recorrente' ? 'recorrente' : 'acumulo',
    recorrente: null,
    contaMensal: null,
    exibirNaCarteira: v.exibirNaCarteira === true,
    criadaEm: /^\d{4}-\d{2}-\d{2}$/.test(String(v.criadaEm || '')) ? String(v.criadaEm) : null,
    especificos: {},
    itens: [],
    vinculos: []
  };
  if (meta.contribuicao === 'recorrente' && v.recorrente && typeof v.recorrente === 'object') {
    meta.recorrente = {
      parcela: d(v.recorrente.parcela, 'parcela'),
      totalParcelas: numMeta_(v.recorrente.totalParcelas, 1, 600, 'totalParcelas'),
      inicio: mesMeta_(v.recorrente.inicio),
      parcelasPagas: numMeta_(v.recorrente.parcelasPagas, 0, 600, 'parcelasPagas')
    };
  }
  if (v.contaMensal && typeof v.contaMensal === 'object' && Number(v.contaMensal.valor) > 0) {
    meta.contaMensal = {
      descricao: txtMeta_(v.contaMensal.descricao, 60),
      valor: d(v.contaMensal.valor, 'contaMensal'),
      meses: numMeta_(v.contaMensal.meses, 1, 600, 'contaMensal.meses'),
      inicio: mesMeta_(v.contaMensal.inicio)
    };
  }
  var e = v.especificos && typeof v.especificos === 'object' ? v.especificos : {};
  if (tipo === 'rendaPassiva') {
    meta.especificos = { rendaMensal: d(e.rendaMensal, 'rendaMensal'), dyAnual: numMeta_(e.dyAnual, 0, 1, 'dyAnual') };
  } else if (tipo === 'viagemInternacional' || tipo === 'viagemNacional') {
    meta.especificos = { destino: txtMeta_(e.destino, 60), dataViagem: mesMeta_(e.dataViagem) };
  } else if (tipo === 'casa') {
    meta.especificos = { valorImovel: d(e.valorImovel, 'valorImovel'), entradaPct: numMeta_(e.entradaPct, 0, 1, 'entradaPct'), custosPct: numMeta_(e.custosPct, 0, 0.5, 'custosPct') };
  } else if (tipo === 'carro') {
    meta.especificos = { valorCarro: d(e.valorCarro, 'valorCarro'), entradaPct: numMeta_(e.entradaPct, 0, 1, 'entradaPct') };
  } else if (tipo === 'reservaEmergencia') {
    meta.especificos = { meses: numMeta_(e.meses, 0, 120, 'meses'), margem: numMeta_(e.margem, 0, 2, 'margem'), despesaMensal: d(e.despesaMensal, 'despesaMensal'), usarDespesasPlanilha: e.usarDespesasPlanilha !== false };
  } else if (tipo === 'aposentadoria') {
    meta.especificos = { rendaDesejada: d(e.rendaDesejada, 'rendaDesejada'), taxaRetirada: numMeta_(e.taxaRetirada, 0, 0.5, 'taxaRetirada') };
  }
  if (Array.isArray(v.itens)) {
    meta.itens = v.itens.slice(0, 60).map(function (it) {
      if (!it || typeof it !== 'object') return null;
      var nomeItem = txtMeta_(it.nome, 60).trim();
      if (!nomeItem) return null;
      return { id: idCurtoMeta_(it.id), nome: nomeItem, valor: d(it.valor, 'item ' + nomeItem) || 0, moeda: moedaMeta_(it.moeda || meta.moeda), concluido: it.concluido === true };
    }).filter(function (x) { return x; });
  }
  if (Array.isArray(v.vinculos)) {
    meta.vinculos = v.vinculos.slice(0, 80).map(function (x) {
      if (!x || typeof x !== 'object') return null;
      var tipoV = ['ativo', 'classe', 'marca'].indexOf(x.tipo) >= 0 ? x.tipo : 'ativo';
      var modo = ['total', 'fracao', 'valor'].indexOf(x.modo) >= 0 ? x.modo : 'total';
      var o = { tipo: tipoV, modo: modo };
      if (tipoV === 'ativo') { o.id = txtMeta_(x.id, 160); o.nome = txtMeta_(x.nome, 80); if (!o.id) return null; }
      if (tipoV === 'classe') { o.classe = ['acoes', 'fiis', 'usa', 'rf'].indexOf(x.classe) >= 0 ? x.classe : null; if (!o.classe) return null; }
      if (tipoV === 'marca') { o.marca = x.marca === 'longo-prazo' ? 'longo-prazo' : 'emergencial'; }
      if (modo === 'fracao') o.fracao = numMeta_(x.fracao, 0, 1, 'fração do vínculo');
      if (modo === 'valor') o.valor = d(x.valor, 'valor do vínculo');
      return o;
    }).filter(function (x) { return x; });
  }
  return meta;
}

// ---------------------------------------------------------------------------
// Tela: metas + ativos com valor + câmbio + referências
// ---------------------------------------------------------------------------

/**
 * opcoes (testes): { ativos: [...] (pula montarMeusAtivos_), buscarCambio: fn(moedas) -> {EUR: n, ...},
 *   referencias: {...}, proventos: { recebidos, hoje } }
 */
function montarTelaMetas_(ss, agora, opcoes) {
  opcoes = opcoes || {};
  var avisos = {};
  var metas = lerMetas_(ss);
  var arquivadas = lerMetas_(ss, { arquivadas: true });

  var ativos = [];
  try {
    ativos = opcoes.ativos || ativosParaMetas_(ss);
  } catch (eA) { avisos.ativos = String(eA); }

  var moedas = { USD: true, EUR: true };
  metas.concat(arquivadas).forEach(function (m) {
    moedas[m.moeda || 'BRL'] = true;
    (m.itens || []).forEach(function (it) { moedas[it.moeda || 'BRL'] = true; });
  });
  delete moedas.BRL;
  var cambio = {};
  try {
    cambio = cambioMetas_(ss, Object.keys(moedas), agora, opcoes.buscarCambio);
  } catch (eC) { avisos.cambio = String(eC); }

  var referencias = opcoes.referencias || null;
  var proventos12m = {};
  if (!referencias) {
    referencias = {};
    try {
      var desp = lerDespesasOrganizacao_(ss);
      referencias.reserva = {
        custoDeVida: desp.despesas.totalComFolga, gastoReal: desp.despesas.totalReal, folga: desp.despesas.folga,
        meses: desp.reserva.meses, sobra: desp.reserva.sobra, meta: desp.reserva.meta, atual: desp.reserva.atual
      };
      referencias.patrimonio = { rendimento: desp.patrimonio.rendimento, desejado: desp.patrimonio.desejado, atual: desp.patrimonio.atual };
    } catch (eD) { avisos.reserva = String(eD); }
    try {
      var rp = montarMetasCarteira_().rendaPassiva;
      referencias.rendaPassiva = { metaPlanilha: typeof rp.meta === 'number' ? rp.meta : null, media12m: typeof rp.mediaUlt12Meses === 'number' ? rp.mediaUlt12Meses : null, meses: rp.mesesMedia || null };
    } catch (eR) { avisos.rendaPassiva = String(eR); }
  }
  try {
    var tela = opcoes.proventos || montarTelaProventosComCache_();
    proventos12m = proventos12mPorTicker_(tela.recebidos, tela.hoje);
  } catch (eP) { avisos.proventos = String(eP); }

  metas.forEach(function (m) { m.progresso = progressoVinculosMeta_(m, ativos); });

  var r = { metas: metas, arquivadas: arquivadas, ativos: ativos, cambio: cambio, referencias: referencias, proventos12m: proventos12m, hoje: isoDiaMeta_(agora || new Date()) };
  if (Object.keys(avisos).length) r.avisos = avisos;
  return r;
}

/**
 * Ativos que podem ser vinculados, com o valor de hoje em reais - a lista da
 * Início (montarMeusAtivos_). `id` é único (a mesma posição de Renda Fixa
 * pode estar dividida entre Renda Emergencial e Longo Prazo); `ref` é o da
 * tela do ativo (link-ativo.js!refAtivo).
 */
function ativosParaMetas_(ss) {
  var cambioUsd = Number(cotacaoDolarHoje_(ss)) || 0;
  var vistos = {};
  var out = [];
  montarMeusAtivos_().forEach(function (a) {
    var valor = null;
    if (a.classe === 'rf') valor = typeof a.valorAtualizado === 'number' ? a.valorAtualizado : null;
    else if (typeof a.quantidade === 'number' && typeof a.precoAtual === 'number') valor = a.quantidade * a.precoAtual * (a.classe === 'usa' ? cambioUsd : 1);
    if (!(valor > 0)) return;
    var ref, nome;
    if (a.classe === 'rf') {
      var nomeRf = String(a.nome || a.tipoInvestimento || a.ticker || '').trim();
      ref = 'rf:' + nomeRf + '|' + String(a.instituicao || '').trim();
      nome = (a.nome || a.tipoInvestimento || a.ticker) + (a.vencimento && !a.nome ? '' : (a.vencimento ? ' · ' + a.vencimento : ''));
    } else {
      ref = String(a.ticker || '').trim().toUpperCase();
      nome = ref;
    }
    var id = a.classe === 'rf' ? ref + '@' + a.marca : ref;
    if (vistos[id]) { vistos[id] += 1; id = id + '#' + vistos[id]; } else vistos[id] = 1;
    out.push({
      id: id, ref: ref, nome: nome, classe: a.classe, marca: a.classe === 'rf' ? a.marca : null,
      instituicao: a.instituicao || null, indexador: a.indexador || null, vencimento: a.vencimento || null,
      descricao: a.classe === 'rf' ? (a.tipoInvestimento || null) : (a.nome || null),
      valorBRL: Math.round(valor * 100) / 100
    });
  });
  return out;
}

/** Total de proventos dos 12 meses fechados por ticker (mesma janela de mediaRendaPassiva12Meses_). */
function proventos12mPorTicker_(recebidos, hoje) {
  var janela = mediaRendaPassiva12Meses_([], hoje || isoDiaMeta_(new Date()));
  var porTicker = {};
  (recebidos || []).forEach(function (p) {
    var m = String(p.data || '').slice(0, 7);
    if (m < janela.inicio || m > janela.fim || typeof p.valor !== 'number' || !p.ticker) return;
    var t = String(p.ticker).toUpperCase();
    porTicker[t] = Math.round(((porTicker[t] || 0) + p.valor) * 100) / 100;
  });
  return { inicio: janela.inicio, fim: janela.fim, porTicker: porTicker };
}

/** Mesma regra de assets/js/pages/metas-calc.js!resolverVinculos. */
function progressoVinculosMeta_(meta, ativos) {
  var total = 0;
  var itens = (meta.vinculos || []).map(function (v) {
    var alvo = (ativos || []).filter(function (a) {
      if (v.tipo === 'ativo') return a.id === v.id;
      if (v.tipo === 'classe') return a.classe === v.classe;
      if (v.tipo === 'marca') return a.classe === 'rf' && a.marca === v.marca;
      return false;
    });
    var base = alvo.reduce(function (s, a) { return s + (Number(a.valorBRL) || 0); }, 0);
    var valor = base;
    if (v.modo === 'fracao') valor = base * (Number(v.fracao) || 0);
    if (v.modo === 'valor') valor = Math.min(base, Number(v.valor) || 0);
    valor = Math.round(valor * 100) / 100;
    total += valor;
    return { tipo: v.tipo, id: v.id || null, classe: v.classe || null, marca: v.marca || null, base: Math.round(base * 100) / 100, valorBRL: valor, encontrado: alvo.length > 0 };
  });
  return { valorVinculado: Math.round(total * 100) / 100, vinculos: itens };
}

// ---------------------------------------------------------------------------
// Câmbio (moeda -> reais), cache de 6h
// ---------------------------------------------------------------------------

/**
 * { EUR: { valor, fonte, data }, ... } pra cada moeda pedida. `buscar` (testes)
 * substitui a rede: fn(moedas) -> { EUR: 6.1, ... }.
 */
function cambioMetas_(ss, moedas, agora, buscar) {
  moedas = (moedas || []).filter(function (m) { return m && m !== 'BRL' && METAS_MOEDAS_.indexOf(m) >= 0; });
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (eC) { cache = null; }
  var guardado = {};
  if (cache) {
    try { guardado = JSON.parse(cache.get(METAS_CACHE_CAMBIO_) || '{}') || {}; } catch (eJ) { guardado = {}; }
  }
  // cotação da planilha (as APIs falharam) vale por 30 min antes de tentar a rede de novo
  var agoraMs = (agora || new Date()).getTime();
  var recente = guardado._falhaEm && agoraMs - guardado._falhaEm < 30 * 60 * 1000;
  var faltam = moedas.filter(function (m) { return !(guardado[m] && guardado[m].valor > 0 && (guardado[m].fonte !== 'planilha' || recente)); });
  if (faltam.length) {
    delete guardado._falhaEm;
    var achados = {};
    if (buscar) {
      try { achados = buscar(faltam) || {}; } catch (eB) { achados = {}; }
      Object.keys(achados).forEach(function (m) { if (achados[m] > 0) guardado[m] = { valor: achados[m], fonte: 'teste', data: isoDiaMeta_(agora) }; });
    } else {
      var awesome = cambioAwesomeApiMetas_(faltam);
      Object.keys(awesome).forEach(function (m) { guardado[m] = awesome[m]; });
      faltam.filter(function (m) { return !awesome[m]; }).forEach(function (m) {
        var ptax = cambioPtaxMetas_(m, agora);
        if (ptax) guardado[m] = ptax;
      });
    }
    var planilha = cambioPlanilhaMetas_(ss);
    faltam.forEach(function (m) {
      if (guardado[m] && guardado[m].valor > 0 && guardado[m].fonte !== 'planilha') return;
      guardado._falhaEm = agoraMs;
      if (planilha[m]) guardado[m] = { valor: planilha[m], fonte: 'planilha', data: isoDiaMeta_(agora) };
    });
    if (cache) { try { cache.put(METAS_CACHE_CAMBIO_, JSON.stringify(guardado), METAS_CAMBIO_SEGUNDOS_); } catch (eP) { /* ok */ } }
  }
  var out = {};
  moedas.forEach(function (m) { if (guardado[m]) out[m] = guardado[m]; });
  return out;
}

function cambioAwesomeApiMetas_(moedas) {
  var out = {};
  try {
    var url = 'https://economia.awesomeapi.com.br/json/last/' + moedas.map(function (m) { return m + '-BRL'; }).join(',');
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (typeof resp.getResponseCode === 'function' && resp.getResponseCode() !== 200) return out;
    var json = JSON.parse(resp.getContentText());
    moedas.forEach(function (m) {
      var x = json && json[m + 'BRL'];
      var v = x ? Number(x.bid) : NaN;
      if (v > 0) out[m] = { valor: v, fonte: 'AwesomeAPI', data: x.create_date ? String(x.create_date).slice(0, 10) : null };
    });
  } catch (e) { /* cai pra PTAX */ }
  return out;
}

function cambioPtaxMetas_(moeda, agora) {
  try {
    var fim = agora || new Date();
    var ini = new Date(fim.getTime() - 10 * 86400000);
    var fmt = function (d) { return ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + '-' + d.getFullYear(); };
    var url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'
      + "?@moeda='" + moeda + "'&@dataInicial='" + fmt(ini) + "'&@dataFinalCotacao='" + fmt(fim) + "'&$format=json&$select=cotacaoVenda,dataHoraCotacao";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (typeof resp.getResponseCode === 'function' && resp.getResponseCode() !== 200) return null;
    var lista = (JSON.parse(resp.getContentText()) || {}).value || [];
    var ult = lista[lista.length - 1];
    if (!ult || !(Number(ult.cotacaoVenda) > 0)) return null;
    return { valor: Number(ult.cotacaoVenda), fonte: 'PTAX (BCB)', data: String(ult.dataHoraCotacao || '').slice(0, 10) };
  } catch (e) {
    return null;
  }
}

/** Último recurso: dólar da Distribuição e Metas e euro da Auxiliar_app (B11), os mesmos da Início. */
function cambioPlanilhaMetas_(ss) {
  var out = {};
  try { var usd = cotacaoDolarHoje_(ss); if (usd > 0) out.USD = usd; } catch (e1) { /* ok */ }
  try { var eur = Number(ss.getSheetByName('Auxiliar_app').getRange('B11').getValue()); if (eur > 0) out.EUR = eur; } catch (e2) { /* ok */ }
  return out;
}
