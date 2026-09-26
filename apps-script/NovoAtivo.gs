/**
 * NovoAtivo.gs - 26/09/2026 (Tiago: "Poderíamos criar um processo de
 * adicionar um novo ativo? isso estaria na tela de carteiras").
 *
 * Cadastrar um ativo na planilha mexe em 3 abas - o que o Tiago fazia à mão:
 *  1. "Carteira Ações" / "Carteira FIIs" / "Carteira Ações USA": uma linha
 *     nova logo abaixo do último ativo. As colunas manuais (Ticker, Nome,
 *     Tipo, Setor...) vêm do formulário; as de fórmula (quantidade, cotação,
 *     preço médio, DY...) são as MESMAS da linha de cima (copiadas em R1C1,
 *     que é como o "copiar e colar" da planilha faz).
 *  2. "Distribuição e Metas", Radar de oportunidades do bloco da classe:
 *     linha inserida ANTES da última do bloco (assim o SUM do total e as
 *     buscas de Auxiliar_ativos, que vão até a última linha, crescem
 *     sozinhos). Ranking, Ativo, Preço-teto e % desejado vêm do formulário;
 *     as fórmulas são as da linha vizinha, apontando pra linha nova da
 *     Carteira.
 *  3. "Auxiliar_ativos": linha no fim, com as fórmulas de um ativo da mesma
 *     classe (é daqui que o app lê a carteira).
 *
 * Depois disso o ativo já aparece nas telas; a sincronização do patrimônio
 * pega ele sozinha (Planilha.gs!carregarListasTickersDaPlanilha_) e a tela
 * avisa "consolidação necessária" (Consolidacao.gs) pra montar o histórico
 * quando as transações dele entrarem.
 *
 * removerAtivo_ desfaz um cadastro errado - só de ativo sem nenhuma transação.
 */

var CLASSES_NOVO_ATIVO = {
  acoes: { aba: 'Carteira Ações', manuais: ['ticker', 'nome', 'tipoCarteira', 'setor', 'subsetor', 'segmento'], aux: 'Ações', moeda: 'R$', radar: 'radarAcoes', colPct: 'L', db: 'DB-Acoes', padraoTipo: 'Dividendos' },
  fiis: { aba: 'Carteira FIIs', manuais: ['ticker', 'nome', 'tipoFii', 'segmento'], aux: 'FIIs', moeda: 'R$', radar: 'radarFiis', colPct: 'K', db: 'DB-FIIS', padraoTipo: 'Tijolo' },
  acoesEua: { aba: 'Carteira Ações USA', manuais: ['ticker', 'nome', 'tipoCarteira', 'setor', 'subsetor', 'segmento'], aux: 'Ações EUA', moeda: 'US$', radar: 'radarUsa', colPct: 'K', db: 'DB-Stocks', padraoTipo: 'Ações Internacionais' }
};
var LINHA_DADOS_CARTEIRAS_NOVO = 9;

// ---------------------------------------------------------------------------
// Handlers (Router.gs)
// ---------------------------------------------------------------------------

/** GET infoNovoAtivo?classe=&ticker= - já existe? está na base de dados (preço/DY)? opções pros campos. */
function handleInfoNovoAtivo(e, auth) {
  try {
    return jsonOut(infoNovoAtivo_(String(e.parameter.classe || ''), String(e.parameter.ticker || '')));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'infoNovoAtivo', erro: String(erro) });
  }
}

/** POST adicionarAtivo: e.parameter.ativo = JSON { classe, ticker, nome, tipoCarteira|tipoFii, setor, subsetor, segmento, precoTeto, percentualDesejado, ranking }; simular=1 só mostra o plano. */
function handleAdicionarAtivo(e) {
  try {
    var dados = JSON.parse(e.parameter.ativo || '{}');
    return jsonOut({ ok: true, resultado: adicionarAtivo_(dados, { simular: String(e.parameter.simular || '') === '1' }) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'adicionarAtivo', erro: String(erro) });
  }
}

/** POST removerAtivo: classe, ticker - só ativo sem transação (desfazer cadastro errado). */
function handleRemoverAtivo(e) {
  try {
    return jsonOut({ ok: true, resultado: removerAtivo_(String(e.parameter.classe || ''), String(e.parameter.ticker || '')) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'removerAtivo', erro: String(erro) });
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

function normalizarTickerNovo_(classe, ticker) {
  var t = String(ticker || '').trim().toUpperCase();
  if (classe !== 'acoesEua' && /^[A-Z]{4}\d{1,2}F$/.test(t)) t = t.slice(0, -1); // fracionário
  return t;
}

function tickerValidoNovo_(classe, t) {
  if (classe === 'acoesEua') return /^[A-Z]{1,5}(\.[A-Z])?$/.test(t);
  if (classe === 'fiis') return /^[A-Z]{4}11[A-Z]?$/.test(t);
  return /^[A-Z]{4}\d{1,2}$/.test(t);
}

/** Última linha com ticker na coluna A de uma aba de Carteira (os dados começam na linha 9). */
function ultimaLinhaCarteiraNovo_(aba) {
  var total = Math.max(aba.getLastRow() - LINHA_DADOS_CARTEIRAS_NOVO + 1, 0);
  if (!total) return LINHA_DADOS_CARTEIRAS_NOVO - 1;
  var col = aba.getRange(LINHA_DADOS_CARTEIRAS_NOVO, 1, total, 1).getValues();
  for (var i = col.length - 1; i >= 0; i--) if (String(col[i][0] || '').trim()) return LINHA_DADOS_CARTEIRAS_NOVO + i;
  return LINHA_DADOS_CARTEIRAS_NOVO - 1;
}

function linhaDoTickerNaColuna_(aba, colLetraOuIndice, ticker, primeira) {
  var col = typeof colLetraOuIndice === 'number' ? colLetraOuIndice : colunaParaIndiceNovo_(colLetraOuIndice);
  var ini = primeira || 1;
  var n = aba.getLastRow() - ini + 1;
  if (n < 1) return 0;
  var vals = aba.getRange(ini, col, n, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0] || '').trim().toUpperCase() === ticker) return ini + i;
  return 0;
}

function colunaParaIndiceNovo_(letras) {
  var n = 0;
  for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
  return n;
}

/** Onde o ticker já aparece (Carteira da classe, Auxiliar_ativos, Radar, Transações). */
function ondeTickerExiste_(ss, classe, t) {
  var cfg = CLASSES_NOVO_ATIVO[classe];
  var onde = [];
  var carteira = ss.getSheetByName(cfg.aba);
  if (carteira && linhaDoTickerNaColuna_(carteira, 1, t, LINHA_DADOS_CARTEIRAS_NOVO)) onde.push(cfg.aba);
  var aux = ss.getSheetByName('Auxiliar_ativos');
  if (aux && linhaDoTickerNaColuna_(aux, 2, t, 2)) onde.push('Auxiliar_ativos');
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (dm) {
    var bloco = lerBlocoRadar_(dm, localDistribuicaoMetas_(dm)[cfg.radar], { ativo: 'C' });
    if (bloco.itens.some(function (it) { return String(it.ativo || '').trim().toUpperCase() === t; })) onde.push('Radar de oportunidades');
  }
  return onde;
}

function infoNovoAtivo_(classe, ticker) {
  var cfg = CLASSES_NOVO_ATIVO[classe];
  if (!cfg) throw new Error('classe inválida: ' + classe);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var t = normalizarTickerNovo_(classe, ticker);
  var out = { ok: true, classe: classe, ticker: t, valido: tickerValidoNovo_(classe, t), existe: [], base: null, opcoes: opcoesNovoAtivo_(ss, classe) };
  if (!t) return out;
  out.existe = ondeTickerExiste_(ss, classe, t);
  // base de dados da planilha (DB-Acoes / DB-FIIS / DB-Stocks): confirma que o ticker existe e mostra preço/DY/P-VP
  var db = ss.getSheetByName(cfg.db);
  if (db && db.getLastRow() >= 3) {
    var linhas = db.getRange(1, 1, db.getLastRow(), Math.min(db.getLastColumn() || 14, 14)).getValues();
    var cab = null;
    for (var i = 0; i < linhas.length; i++) {
      var a = String(linhas[i][0] || '').trim().toUpperCase();
      if (a === 'TICKER') { cab = linhas[i].map(function (c) { return String(c || '').trim().toUpperCase(); }); continue; }
      if (cab && a === t) {
        var campo = function (nome) { var k = cab.indexOf(nome); return k === -1 ? null : (typeof linhas[i][k] === 'number' ? linhas[i][k] : null); };
        var texto = function (nomes) { for (var n = 0; n < nomes.length; n++) { var k = cab.indexOf(nomes[n]); if (k !== -1 && String(linhas[i][k] || '').trim()) return String(linhas[i][k]).trim(); } return null; };
        out.base = { preco: campo('PRECO'), dy: campo('DY'), pvp: campo('P/VP'), pl: campo('P/L'), gestao: texto(['GESTAO']), nome: texto(['NOME', 'EMPRESA', 'RAZAO SOCIAL', 'FUNDO']) };
        break;
      }
    }
  }
  return out;
}

/** Valores que já existem nas colunas manuais (pra sugerir no formulário). */
function opcoesNovoAtivo_(ss, classe) {
  var cfg = CLASSES_NOVO_ATIVO[classe];
  var aba = ss.getSheetByName(cfg.aba);
  var out = {};
  if (!aba) return out;
  var ultima = ultimaLinhaCarteiraNovo_(aba);
  if (ultima < LINHA_DADOS_CARTEIRAS_NOVO) return out;
  var vals = aba.getRange(LINHA_DADOS_CARTEIRAS_NOVO, 1, ultima - LINHA_DADOS_CARTEIRAS_NOVO + 1, cfg.manuais.length).getValues();
  cfg.manuais.forEach(function (campo, j) {
    if (campo === 'ticker' || campo === 'nome') return;
    var set = {};
    vals.forEach(function (l) { var v = String(l[j] || '').trim(); if (v) set[v] = true; });
    out[campo] = Object.keys(set).sort();
  });
  return out;
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/** Copia as fórmulas (R1C1) de uma linha pra outra, só nas células da linha-modelo que têm fórmula; `ajustar` pode reescrever cada fórmula. */
function copiarFormulasLinha_(aba, linhaModelo, linhaNova, colInicio, colFim, ajustar) {
  if (colFim < colInicio) return 0;
  var formulas = aba.getRange(linhaModelo, colInicio, 1, colFim - colInicio + 1).getFormulasR1C1()[0];
  var n = 0, i = 0;
  while (i < formulas.length) {
    if (!formulas[i]) { i++; continue; }
    var j = i;
    var trecho = [];
    while (j < formulas.length && formulas[j]) { trecho.push(ajustar ? ajustar(formulas[j]) : formulas[j]); j++; }
    aba.getRange(linhaNova, colInicio + i, 1, trecho.length).setFormulasR1C1([trecho]);
    n += trecho.length;
    i = j;
  }
  return n;
}

function copiarFormatoLinha_(aba, linhaModelo, linhaNova, ultimaCol) {
  try {
    aba.getRange(linhaModelo, 1, 1, ultimaCol).copyTo(aba.getRange(linhaNova, 1, 1, ultimaCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  } catch (e) { /* formato é só aparência */ }
}

function validarNovoAtivo_(d) {
  var cfg = CLASSES_NOVO_ATIVO[d.classe];
  if (!cfg) throw new Error('classe inválida (acoes, fiis ou acoesEua): ' + d.classe);
  var t = normalizarTickerNovo_(d.classe, d.ticker);
  if (!tickerValidoNovo_(d.classe, t)) throw new Error('ticker inválido pra ' + cfg.aux + ': ' + d.ticker);
  if (!String(d.nome || '').trim()) throw new Error('informe o nome do ativo');
  var teto = Number(d.precoTeto);
  if (!(teto > 0)) throw new Error('informe o preço-teto (é ele que define o viés Comprar/Aguardar no Radar)');
  var pct = d.percentualDesejado == null || d.percentualDesejado === '' ? 0 : Number(d.percentualDesejado);
  if (!(pct >= 0 && pct <= 1)) throw new Error('% desejado precisa ser uma fração entre 0 e 1');
  return { cfg: cfg, ticker: t, precoTeto: teto, pct: pct };
}

/**
 * Cadastra o ativo nas 3 abas. opcoes.simular = só devolve o plano (linhas
 * que seriam usadas), sem escrever nada.
 */
function adicionarAtivo_(dados, opcoes) {
  var o = opcoes || {};
  var v = validarNovoAtivo_(dados || {});
  var cfg = v.cfg, t = v.ticker, classe = dados.classe;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trava = null;
  if (!o.simular) { trava = LockService.getScriptLock(); trava.waitLock(30000); }
  try {
    var ja = ondeTickerExiste_(ss, classe, t);
    if (ja.length) throw new Error(t + ' já está cadastrado (' + ja.join(', ') + ')');

    var carteira = ss.getSheetByName(cfg.aba);
    var aux = ss.getSheetByName('Auxiliar_ativos');
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (!carteira || !aux || !dm) throw new Error('aba não encontrada (' + [cfg.aba, 'Auxiliar_ativos', 'Distribuição e Metas'].join(', ') + ')');

    var ultimaCarteira = ultimaLinhaCarteiraNovo_(carteira);
    if (ultimaCarteira < LINHA_DADOS_CARTEIRAS_NOVO) throw new Error('a aba ' + cfg.aba + ' não tem nenhum ativo pra servir de modelo');
    var linhaCarteira = ultimaCarteira + 1;

    var local = localDistribuicaoMetas_(dm);
    var bloco = lerBlocoRadar_(dm, local[cfg.radar], { ativo: 'C', ranking: 'B' });
    if (!bloco.itens.length) throw new Error('bloco do Radar de ' + cfg.aux + ' vazio (não achei o modelo)');
    var ultimaRadar = bloco.linhaTotal - 1;
    var ranking = Number(dados.ranking) > 0 ? Number(dados.ranking)
      : bloco.itens.reduce(function (m, it) { return Math.max(m, Number(it.ranking) || 0); }, 0) + 1;

    var auxDados = aux.getRange(2, 1, Math.max(aux.getLastRow() - 1, 1), 2).getValues();
    var modeloAux = 0;
    auxDados.forEach(function (l, i) { if (String(l[0] || '').trim() === cfg.aux) modeloAux = i + 2; });
    if (!modeloAux) throw new Error('Auxiliar_ativos não tem nenhum ativo de ' + cfg.aux + ' pra servir de modelo');
    var linhaAux = aux.getLastRow() + 1;

    var plano = {
      ticker: t, classe: classe,
      carteira: { aba: cfg.aba, linha: linhaCarteira, modelo: ultimaCarteira },
      radar: { linha: ultimaRadar, modelo: ultimaRadar + 1, ranking: ranking },
      auxiliar: { linha: linhaAux, modelo: modeloAux }
    };
    if (o.simular) return plano;

    // 1) Carteira
    var valoresManuais = cfg.manuais.map(function (campo) {
      if (campo === 'ticker') return t;
      if (campo === 'tipoCarteira' || campo === 'tipoFii') return String(dados[campo] || cfg.padraoTipo).trim();
      return String(dados[campo] || '').trim();
    });
    if (linhaCarteira > carteira.getMaxRows()) carteira.insertRowsAfter(carteira.getMaxRows(), 5);
    var ultimaColCarteira = carteira.getLastColumn();
    copiarFormatoLinha_(carteira, ultimaCarteira, linhaCarteira, ultimaColCarteira);
    carteira.getRange(linhaCarteira, 1, 1, valoresManuais.length).setValues([valoresManuais]);
    copiarFormulasLinha_(carteira, ultimaCarteira, linhaCarteira, valoresManuais.length + 1, ultimaColCarteira);

    // 2) Radar: linha nova ANTES da última do bloco (total e buscas crescem sozinhos)
    dm.insertRowBefore(ultimaRadar);
    esquecerLocalDistribuicaoMetas_();
    var modeloRadar = ultimaRadar + 1;
    var reCarteira = /('Carteira [^']+'!)R(\[-?\d+\]|\d+)/g;
    copiarFormatoLinha_(dm, modeloRadar, ultimaRadar, 19);
    copiarFormulasLinha_(dm, modeloRadar, ultimaRadar, 2, 19, function (f) {
      return f.replace(reCarteira, function (m, aba) { return aba + 'R' + linhaCarteira; });
    });
    dm.getRange('B' + ultimaRadar).setValue(ranking);
    dm.getRange('C' + ultimaRadar).setValue(t);
    dm.getRange('E' + ultimaRadar).setValue(v.precoTeto);
    dm.getRange(cfg.colPct + ultimaRadar).setValue(v.pct);

    // 3) Auxiliar_ativos: fórmulas (A1) do modelo, trocando a própria linha (B<n>) pela nova
    var ultimaColAux = aux.getLastColumn();
    var formulasAux = aux.getRange(modeloAux, 1, 1, ultimaColAux).getFormulas()[0];
    var reLinha = new RegExp('(^|[(,;\\s])(\\$?)B(\\$?)' + modeloAux + '(?![0-9])', 'g');
    copiarFormatoLinha_(aux, modeloAux, linhaAux, ultimaColAux);
    aux.getRange(linhaAux, 1, 1, 2).setValues([[cfg.aux, t]]);
    formulasAux.forEach(function (f, j) {
      if (!f || j < 2) return;
      aux.getRange(linhaAux, j + 1).setFormula(f.replace(reLinha, function (m, antes, d1, d2) { return antes + d1 + 'B' + d2 + linhaAux; }));
    });
    var colMoeda = 5; // E: Moeda
    if (!formulasAux[colMoeda - 1]) aux.getRange(linhaAux, colMoeda).setValue(cfg.moeda);

    // depois: caches, listas da sincronização e aviso de consolidação
    _listasTickersCarregadas_ = false;
    try { if (typeof limparCacheHistoricoInicio_ === 'function') limparCacheHistoricoInicio_(); } catch (eC) { Logger.log('limparCacheHistoricoInicio_: ' + eC); }
    try { if (typeof marcarConsolidacao_ === 'function') plano.consolidacao = marcarConsolidacao_({ ativos: [{ ticker: t, classe: classe === 'acoesEua' ? 'USA' : 'BR', desde: '' }], motivo: 'Ativo novo: ' + t }); } catch (eM) { Logger.log('marcarConsolidacao_: ' + eM); }
    try { if (typeof gravarRegistroControle_ === 'function') gravarRegistroControle_('Sucesso', 'Carteiras', 'Ativo novo cadastrado: ' + t + ' (' + cfg.aux + ') - ' + cfg.aba + ' linha ' + linhaCarteira + ', Radar linha ' + ultimaRadar + ', Auxiliar_ativos linha ' + linhaAux); } catch (eR) { Logger.log('gravarRegistroControle_: ' + eR); }
    return plano;
  } finally {
    if (trava) trava.releaseLock();
  }
}

/** Desfaz o cadastro: só pra ativo sem nenhuma transação (cadastrado por engano). */
function removerAtivo_(classe, ticker) {
  var cfg = CLASSES_NOVO_ATIVO[classe];
  if (!cfg) throw new Error('classe inválida: ' + classe);
  var t = normalizarTickerNovo_(classe, ticker);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaTransacoes = ss.getSheetByName(classe === 'acoesEua' ? 'Transações - USA' : 'Transações');
  if (abaTransacoes && typeof LANC_ABAS !== 'undefined') {
    var cfgT = LANC_ABAS[classe === 'acoesEua' ? 'transacoesUsa' : 'transacoes'];
    var ult = ultimaLinhaPreenchidaLanc_(abaTransacoes, cfgT);
    if (ult >= cfgT.linha && abaTransacoes.getRange(cfgT.linha, 1, ult - cfgT.linha + 1, 1).getValues().some(function (l) { return String(l[0] || '').trim().toUpperCase() === t; })) {
      throw new Error(t + ' tem transações: não dá pra remover o cadastro (apague as transações antes, na planilha)');
    }
  }
  var trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    var removidas = [];
    var dm = ss.getSheetByName('Distribuição e Metas');
    if (dm) {
      var bloco = lerBlocoRadar_(dm, localDistribuicaoMetas_(dm)[cfg.radar], { ativo: 'C' });
      var item = bloco.itens.filter(function (it) { return String(it.ativo || '').trim().toUpperCase() === t; })[0];
      if (item) {
        if (bloco.itens.length < 2) throw new Error('é o único ativo do bloco do Radar - remova direto na planilha');
        dm.deleteRow(item.linha);
        esquecerLocalDistribuicaoMetas_();
        removidas.push('Radar linha ' + item.linha);
      }
    }
    var aux = ss.getSheetByName('Auxiliar_ativos');
    var la = aux ? linhaDoTickerNaColuna_(aux, 2, t, 2) : 0;
    if (la) { aux.deleteRow(la); removidas.push('Auxiliar_ativos linha ' + la); }
    var carteira = ss.getSheetByName(cfg.aba);
    var lc = carteira ? linhaDoTickerNaColuna_(carteira, 1, t, LINHA_DADOS_CARTEIRAS_NOVO) : 0;
    if (lc) { carteira.deleteRow(lc); removidas.push(cfg.aba + ' linha ' + lc); }
    if (!removidas.length) throw new Error(t + ' não está cadastrado');
    try { if (typeof limparCacheHistoricoInicio_ === 'function') limparCacheHistoricoInicio_(); } catch (eC) { /* só cache */ }
    try { if (typeof gravarRegistroControle_ === 'function') gravarRegistroControle_('Sucesso', 'Carteiras', 'Cadastro removido: ' + t + ' (' + removidas.join(', ') + ')'); } catch (eR) { /* ok */ }
    return { ticker: t, removidas: removidas };
  } finally {
    trava.releaseLock();
  }
}
