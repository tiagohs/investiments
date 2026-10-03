/**
 * Gastos.gs - 02/10/2026: seção "Gastos" da Organização Financeira
 * (aba "Gastos e Despesas" - organizacao-gastos.js).
 *
 * Tiago: "área rica de gastos a partir dos arquivos no meu Drive:
 * Documentos/Transações/Cartão de Crédito (faturas OuroCard em PDF, com
 * senha) e Documentos/Transações/Extratos (extratos bancários)... quanto eu
 * gastei e gasto em média".
 *
 * Privacidade: os PDFs são lidos NO NAVEGADOR (gastos-import.js). A senha
 * da fatura é pedida na tela na hora de importar (e, se o Tiago quiser,
 * lembrada só naquele navegador) - nunca chega aqui. Aqui chegam só os
 * lançamentos já limpos (data, descrição sem CPF/CNPJ/conta/cartão, valor,
 * categoria) e o registro de quais arquivos já foram importados.
 * O nome das pastas vai pra tela sem o que estiver entre parênteses.
 *
 * Onde mora cada coisa (planilha privada):
 *   'aux_gastos'           Mês | Data | Origem | Fonte | Descrição | Categoria | Valor | Tipo | Parcela | Arquivo | Chave
 *       Valor + = saída/gasto, − = estorno/crédito. Mês = competência (na
 *       fatura, o mês do vencimento). Chave = deduplicação entre arquivos.
 *   'aux_gastos-arquivos'  ID | Nome | Caminho | Fonte | Modificado | Importado em | Meses | Lançamentos | Total | Conferência | Entradas
 *   'aux_gastos-regras'    Padrão | Categoria | Criada em   (recategorização do Tiago)
 *
 * GET  action=gastos                     lançamentos + arquivos importados + regras
 * GET  action=gastosArquivos             PDFs/CSV/OFX das 2 pastas (marca novos e alterados)
 * GET  action=gastosArquivo&id=          um arquivo (base64) - só das 2 pastas
 * POST action=salvarImportacaoGastos     arquivo (JSON), lancamentos (JSON) - substitui os do arquivo
 * POST action=salvarRegraGastos          padrao, categoria (vazia apaga)
 * POST action=excluirArquivoGastos       id - tira o arquivo e os lançamentos dele
 *
 * As pastas são achadas sozinhas (Documentos/Transações/{Cartão de Crédito,
 * Extratos}); se não achar, rode 1 vez no editor configurarPastasGastosDireto()
 * (ou configurarPastasGastosDireto('<id da pasta Transações>')).
 */

var GASTOS_ABA_ = 'aux_gastos';
var GASTOS_ABA_ARQUIVOS_ = 'aux_gastos-arquivos';
var GASTOS_ABA_REGRAS_ = 'aux_gastos-regras';
var GASTOS_CAB_ = ['Mês', 'Data', 'Origem', 'Fonte', 'Descrição', 'Categoria', 'Valor', 'Tipo', 'Parcela', 'Arquivo', 'Chave'];
var GASTOS_CAB_ARQ_ = ['ID', 'Nome', 'Caminho', 'Fonte', 'Modificado', 'Importado em', 'Meses', 'Lançamentos', 'Total', 'Conferência', 'Entradas'];
var GASTOS_CAB_REGRAS_ = ['Padrão', 'Categoria', 'Criada em'];
var GASTOS_CATEGORIAS_ = ['mercado', 'restaurantes', 'transporte', 'combustivel', 'saude', 'assinaturas', 'compras', 'educacao', 'moradia', 'viagem', 'lazer', 'tarifas', 'transferencias', 'outros', 'investimentos', 'ignorar'];
var GASTOS_TIPOS_ = ['compra', 'estorno', 'pagamento_fatura', 'iof', 'anuidade', 'encargo', 'tarifa', 'boleto', 'debito_automatico', 'saque', 'transferencia', 'transferencia_propria', 'investimento', 'resgate', 'receita', 'outro'];
var GASTOS_MAX_POR_ARQUIVO_ = 3000;
var PROP_GASTOS_CARTAO_ = 'GASTOS_PASTA_CARTAO';
var PROP_GASTOS_EXTRATOS_ = 'GASTOS_PASTA_EXTRATOS';

function handleGastos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var r = lerGastos_(SpreadsheetApp.getActiveSpreadsheet());
    r.ok = true;
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'gastos', erro: String(erro) });
  }
}

function handleArquivosGastos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(listarArquivosGastos_(SpreadsheetApp.getActiveSpreadsheet()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'gastos', erro: String(erro) });
  }
}

function handleArquivoGastos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(arquivoGastos_((e && e.parameter && e.parameter.id) || ''));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'gastos', erro: String(erro) });
  }
}

function comTravaGastos_(fn) {
  var trava = LockService.getScriptLock();
  try { trava.waitLock(25000); } catch (eL) { return jsonOut({ ok: false, etapa: 'gastos', erro: 'planilha ocupada, tente de novo em alguns segundos' }); }
  try {
    return jsonOut(fn(SpreadsheetApp.getActiveSpreadsheet()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'gastos', erro: String(erro && erro.message ? erro.message : erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

function handleSalvarImportacaoGastos(e) {
  var p = (e && e.parameter) || {};
  return comTravaGastos_(function (ss) {
    var arquivo, lancamentos;
    try { arquivo = JSON.parse(p.arquivo || '{}'); lancamentos = JSON.parse(p.lancamentos || '[]'); } catch (eJ) { return { ok: false, etapa: 'gastos', erro: 'dados inválidos (JSON)' }; }
    return salvarImportacaoGastos_(ss, arquivo, lancamentos, new Date());
  });
}

function handleSalvarRegraGastos(e) {
  var p = (e && e.parameter) || {};
  return comTravaGastos_(function (ss) { return salvarRegraGastos_(ss, p.padrao, p.categoria, new Date()); });
}

function handleExcluirArquivoGastos(e) {
  var p = (e && e.parameter) || {};
  return comTravaGastos_(function (ss) { return excluirArquivoGastos_(ss, p.id); });
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

function garantirAbaGastos_(ss, nome, cab) {
  var aba = ss.getSheetByName(nome);
  if (aba) return aba;
  aba = ss.insertSheet(nome);
  aba.getRange(1, 1, 1, cab.length).setValues([cab]);
  if (aba.setFrozenRows) aba.setFrozenRows(1);
  return aba;
}

function linhasAbaGastos_(ss, nome, nCols) {
  var aba = ss.getSheetByName(nome);
  if (!aba) return [];
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];
  return aba.getRange(2, 1, ultima - 1, nCols).getValues();
}

/** Reescreve a aba inteira (cabeçalho + linhas) - texto puro nas colunas de data. */
function reescreverAbaGastos_(ss, nome, cab, linhas, colunasTexto) {
  var aba = garantirAbaGastos_(ss, nome, cab);
  var antes = Math.max(aba.getLastRow(), 1);
  if (antes > 1) aba.getRange(2, 1, antes - 1, cab.length).clearContent();
  if (!linhas.length) return;
  (colunasTexto || []).forEach(function (c) { aba.getRange(2, c, linhas.length, 1).setNumberFormat('@'); });
  aba.getRange(2, 1, linhas.length, cab.length).setValues(linhas);
}

function textoMesGastos_(v) {
  if (v && typeof v.getTime === 'function') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd').slice(0, 7);
  var m = String(v || '').match(/^(\d{4})-(\d{2})/);
  return m ? m[1] + '-' + m[2] : '';
}
function textoDataGastos_(v) {
  if (v && typeof v.getTime === 'function') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}
function textoIsoGastos_(v) {
  if (v && typeof v.getTime === 'function') return v.toISOString();
  return v ? String(v) : '';
}

/** Tudo que a tela precisa. Lançamentos em arrays (payload menor). */
function lerGastos_(ss) {
  var lancs = linhasAbaGastos_(ss, GASTOS_ABA_, GASTOS_CAB_.length).filter(function (l) { return l[0] !== '' || l[4] !== ''; }).map(function (l) {
    return [textoMesGastos_(l[0]), textoDataGastos_(l[1]), String(l[2] || ''), String(l[3] || ''), String(l[4] || ''), String(l[5] || ''), Number(l[6]) || 0, String(l[7] || ''), String(l[8] || '').replace(/^'/, ''), String(l[9] || '')];
  });
  return {
    colunas: ['mes', 'data', 'origem', 'fonte', 'descricao', 'categoria', 'valor', 'tipo', 'parcela', 'arquivo'],
    lancamentos: lancs,
    arquivos: lerArquivosImportadosGastos_(ss),
    regras: linhasAbaGastos_(ss, GASTOS_ABA_REGRAS_, 3).filter(function (l) { return String(l[0] || '').trim(); }).map(function (l) {
      return { padrao: String(l[0]).trim(), categoria: String(l[1] || '').trim(), criada: textoIsoGastos_(l[2]) };
    }),
    pastasConfiguradas: !!PropertiesService.getScriptProperties().getProperty(PROP_GASTOS_CARTAO_)
  };
}

function lerArquivosImportadosGastos_(ss) {
  return linhasAbaGastos_(ss, GASTOS_ABA_ARQUIVOS_, GASTOS_CAB_ARQ_.length).filter(function (l) { return String(l[0] || '').trim(); }).map(function (l) {
    var conf = null;
    try { conf = l[9] ? JSON.parse(String(l[9])) : null; } catch (eJ) { conf = null; }
    return {
      id: String(l[0]), nome: String(l[1] || ''), caminho: String(l[2] || ''), fonte: String(l[3] || ''),
      modificado: textoIsoGastos_(l[4]), importadoEm: textoIsoGastos_(l[5]),
      meses: String(l[6] || '').split(/[,;\s]+/).filter(function (m) { return /^\d{4}-\d{2}$/.test(m); }),
      lancamentos: Number(l[7]) || 0, total: l[8] === '' ? null : Number(l[8]), conferencia: conf,
      entradas: l[10] === '' || l[10] === undefined ? null : Number(l[10])
    };
  });
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

/** Texto seguro pra célula: sem fórmula, sem controle, sem CPF/CNPJ/sequências longas de dígitos. */
function textoGastos_(v, max) {
  var s = v === null || v === undefined ? '' : String(v);
  s = s.replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[•*]{2,}[\d.\-•*]*/g, ' ')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-?\d{0,2}/g, ' ')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[=+\-@\s]+/, '')
    .trim();
  return s.slice(0, max || 80);
}

function normalizarLancamentoGastos_(l) {
  if (!l || typeof l !== 'object') return null;
  var mes = String(l.mes || '').match(/^(\d{4})-(\d{2})$/);
  var data = String(l.data || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var valor = Number(l.valor);
  if (!mes || !data || !isFinite(valor) || Math.abs(valor) > 1e7) return null;
  var origem = l.origem === 'cartao' ? 'cartao' : 'conta';
  var tipo = GASTOS_TIPOS_.indexOf(l.tipo) >= 0 ? l.tipo : 'outro';
  var categoria = GASTOS_CATEGORIAS_.indexOf(l.categoria) >= 0 ? l.categoria : 'outros';
  var parcela = /^\d{1,2}\/\d{1,2}$/.test(String(l.parcela || '')) ? String(l.parcela) : '';
  var descricao = textoGastos_(l.descricao, 80);
  if (!descricao) return null;
  return {
    mes: mes[0], data: data[0], origem: origem, fonte: textoGastos_(l.fonte, 30), descricao: descricao, categoria: categoria,
    valor: Math.round(valor * 100) / 100, tipo: tipo, parcela: parcela, chave: String(l.chaveDedup || '').slice(0, 160)
  };
}

/**
 * Substitui os lançamentos de um arquivo (mesmo id) e registra o arquivo.
 * Lançamento que já veio de OUTRO arquivo (mesma chave - extratos que se
 * sobrepõem) é pulado.
 */
function salvarImportacaoGastos_(ss, arquivo, lancamentos, agora) {
  arquivo = arquivo || {};
  var id = String(arquivo.id || '').slice(0, 200);
  if (!id) return { ok: false, etapa: 'gastos', erro: 'arquivo sem id' };
  if (!Array.isArray(lancamentos)) return { ok: false, etapa: 'gastos', erro: 'lançamentos inválidos' };
  if (lancamentos.length > GASTOS_MAX_POR_ARQUIVO_) return { ok: false, etapa: 'gastos', erro: 'lançamentos demais num arquivo (' + lancamentos.length + ')' };
  var novos = [];
  for (var i = 0; i < lancamentos.length; i++) {
    var n = normalizarLancamentoGastos_(lancamentos[i]);
    if (n) novos.push(n);
  }
  var existentes = linhasAbaGastos_(ss, GASTOS_ABA_, GASTOS_CAB_.length).filter(function (l) { return l[0] !== '' || l[4] !== ''; });
  var outros = existentes.filter(function (l) { return String(l[9]) !== id; });
  var chavesOutros = {};
  outros.forEach(function (l) { if (l[10]) chavesOutros[String(l[10])] = true; });
  var pulados = 0;
  var linhasNovas = [];
  novos.forEach(function (n) {
    if (n.chave && chavesOutros[n.chave]) { pulados++; return; }
    linhasNovas.push([n.mes, n.data, n.origem, n.fonte, n.descricao, n.categoria, n.valor, n.tipo, n.parcela ? "'" + n.parcela : '', id, n.chave]);
  });
  var todas = outros.map(function (l) {
    return [textoMesGastos_(l[0]), textoDataGastos_(l[1]), l[2], l[3], l[4], l[5], l[6], l[7], l[8] ? "'" + String(l[8]).replace(/^'/, '') : '', l[9], l[10]];
  }).concat(linhasNovas);
  todas.sort(function (a, b) { return a[1] < b[1] ? -1 : (a[1] > b[1] ? 1 : 0); });
  reescreverAbaGastos_(ss, GASTOS_ABA_, GASTOS_CAB_, todas, [1, 2]);

  // registro do arquivo
  var meses = (Array.isArray(arquivo.meses) ? arquivo.meses : []).filter(function (m) { return /^\d{4}-\d{2}$/.test(String(m)); }).slice(0, 240);
  var conf = arquivo.conferencia && typeof arquivo.conferencia === 'object' ? JSON.stringify({
    ok: !!arquivo.conferencia.ok, diferenca: Number(arquivo.conferencia.diferenca) || 0, regra: textoGastos_(arquivo.conferencia.regra, 120)
  }) : '';
  var regs = linhasAbaGastos_(ss, GASTOS_ABA_ARQUIVOS_, GASTOS_CAB_ARQ_.length).filter(function (l) { return String(l[0] || '').trim() && String(l[0]) !== id; });
  regs.push([
    id, textoGastos_(arquivo.nome, 120), textoGastos_(arquivo.caminho, 160), textoGastos_(arquivo.fonte, 30),
    String(arquivo.modificado || '').slice(0, 40), agora.toISOString(), meses.join(','), linhasNovas.length,
    isFinite(Number(arquivo.total)) && arquivo.total !== null && arquivo.total !== '' ? Math.round(Number(arquivo.total) * 100) / 100 : '',
    conf, isFinite(Number(arquivo.entradas)) && arquivo.entradas !== null && arquivo.entradas !== '' ? Math.round(Number(arquivo.entradas) * 100) / 100 : ''
  ]);
  reescreverAbaGastos_(ss, GASTOS_ABA_ARQUIVOS_, GASTOS_CAB_ARQ_, regs, [5, 6, 7]);
  if (SpreadsheetApp.flush) SpreadsheetApp.flush();
  return { ok: true, id: id, gravados: linhasNovas.length, pulados: pulados, descartados: lancamentos.length - novos.length };
}

function excluirArquivoGastos_(ss, id) {
  id = String(id || '');
  if (!id) return { ok: false, etapa: 'gastos', erro: 'id vazio' };
  var lancs = linhasAbaGastos_(ss, GASTOS_ABA_, GASTOS_CAB_.length).filter(function (l) { return (l[0] !== '' || l[4] !== '') && String(l[9]) !== id; }).map(function (l) {
    return [textoMesGastos_(l[0]), textoDataGastos_(l[1]), l[2], l[3], l[4], l[5], l[6], l[7], l[8] ? "'" + String(l[8]).replace(/^'/, '') : '', l[9], l[10]];
  });
  reescreverAbaGastos_(ss, GASTOS_ABA_, GASTOS_CAB_, lancs, [1, 2]);
  var regs = linhasAbaGastos_(ss, GASTOS_ABA_ARQUIVOS_, GASTOS_CAB_ARQ_.length).filter(function (l) { return String(l[0] || '').trim() && String(l[0]) !== id; });
  reescreverAbaGastos_(ss, GASTOS_ABA_ARQUIVOS_, GASTOS_CAB_ARQ_, regs, [5, 6, 7]);
  return { ok: true, id: id };
}

// ---------------------------------------------------------------------------
// Regras (recategorização)
// ---------------------------------------------------------------------------

function chaveDescricaoGastos_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[-–]?\s*PARC(?:ELA)?\.?\s*\d{1,2}\s*(?:\/|DE)\s*\d{1,2}/g, ' ')
    .replace(/\s\d{2}\/\d{2}\s*$/, ' ')
    .replace(/[^A-Z&·]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Grava (ou apaga, categoria vazia) a regra e já recategoriza os lançamentos que batem. */
function salvarRegraGastos_(ss, padrao, categoria, agora) {
  var chave = chaveDescricaoGastos_(padrao);
  if (chave.length < 3) return { ok: false, etapa: 'gastos', erro: 'padrão curto demais' };
  categoria = String(categoria || '').trim();
  if (categoria && GASTOS_CATEGORIAS_.indexOf(categoria) < 0) return { ok: false, etapa: 'gastos', erro: 'categoria inválida: ' + categoria };
  var regras = linhasAbaGastos_(ss, GASTOS_ABA_REGRAS_, 3).filter(function (l) { return String(l[0] || '').trim() && chaveDescricaoGastos_(l[0]) !== chave; });
  if (categoria) regras.push([chave, categoria, agora]);
  reescreverAbaGastos_(ss, GASTOS_ABA_REGRAS_, GASTOS_CAB_REGRAS_, regras, [1]);
  var mudou = 0;
  if (categoria) {
    var aba = ss.getSheetByName(GASTOS_ABA_);
    var linhas = linhasAbaGastos_(ss, GASTOS_ABA_, GASTOS_CAB_.length);
    var coluna = linhas.map(function (l) {
      if (chaveDescricaoGastos_(l[4]).indexOf(chave) >= 0 && l[5] !== categoria) { mudou++; return [categoria]; }
      return [l[5]];
    });
    if (mudou) aba.getRange(2, 6, coluna.length, 1).setValues(coluna);
  }
  return { ok: true, padrao: chave, categoria: categoria, recategorizados: mudou, regras: lerGastos_(ss).regras };
}

// ---------------------------------------------------------------------------
// Drive: Documentos/Transações/{Cartão de Crédito, Extratos}
// ---------------------------------------------------------------------------

function semAcentoGastos_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
/** Nome de pasta pra tela/planilha: sem o que estiver entre parênteses. */
function nomePastaGastos_(s) { return String(s || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); }

/** Acha Transações (de preferência dentro de Documentos) e as 2 subpastas. */
function acharPastasGastos_(idTransacoes) {
  var raiz = null;
  if (idTransacoes) raiz = DriveApp.getFolderById(idTransacoes);
  else {
    var it = DriveApp.searchFolders("title contains 'Transa'");
    var cands = [];
    while (it.hasNext()) { var f = it.next(); if (semAcentoGastos_(f.getName()) === 'transacoes') cands.push(f); }
    cands.forEach(function (p) {
      if (raiz) return;
      var pais = p.getParents();
      while (pais.hasNext()) { if (/^documentos?$/.test(semAcentoGastos_(pais.next().getName()))) { raiz = p; return; } }
    });
    if (!raiz && cands.length === 1) raiz = cands[0];
    if (!raiz) return null;
  }
  var cartao = null; var extratos = null;
  var subs = raiz.getFolders();
  while (subs.hasNext()) {
    var s = subs.next(); var n = semAcentoGastos_(s.getName());
    if (!cartao && /cart/.test(n)) cartao = s;
    else if (!extratos && /extrato/.test(n)) extratos = s;
  }
  if (!cartao && !extratos) return null;
  return { raiz: raiz, cartao: cartao, extratos: extratos };
}

/**
 * Rode 1 vez no editor se a tela disser que não achou as pastas: acha
 * "Transações" (dentro de Documentos), guarda o ID das subpastas e pede a
 * autorização de leitura do Drive. Com mais de uma, passe o ID da pasta
 * Transações: configurarPastasGastosDireto('<id>').
 */
function configurarPastasGastosDireto(idOpcional) {
  var p = acharPastasGastos_(idOpcional || null);
  if (!p) throw new Error('Não achei Documentos/Transações (com "Cartão de Crédito" e "Extratos") - rode configurarPastasGastosDireto("<id da pasta Transações>")');
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_GASTOS_CARTAO_, p.cartao ? p.cartao.getId() : '');
  props.setProperty(PROP_GASTOS_EXTRATOS_, p.extratos ? p.extratos.getId() : '');
  var r = listarArquivosGastos_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log('Pastas de gastos configuradas: ' + r.arquivos.length + ' arquivo(s), ' + r.novos + ' novo(s).');
}

function pastasGastos_() {
  var props = PropertiesService.getScriptProperties();
  var c = props.getProperty(PROP_GASTOS_CARTAO_);
  var x = props.getProperty(PROP_GASTOS_EXTRATOS_);
  if (c === null && x === null) {
    var p = acharPastasGastos_(null);
    if (!p) return null;
    c = p.cartao ? p.cartao.getId() : '';
    x = p.extratos ? p.extratos.getId() : '';
    props.setProperty(PROP_GASTOS_CARTAO_, c);
    props.setProperty(PROP_GASTOS_EXTRATOS_, x);
  }
  return { cartao: c || '', extratos: x || '' };
}

function ehArquivoGastos_(nome, mime) {
  return /pdf$/i.test(mime || '') || /\.(pdf|csv|ofx)$/i.test(nome || '');
}

/** Arquivos das 2 pastas (até 3 níveis: banco/ano/arquivo), marcando novos e alterados. */
function listarArquivosGastos_(ss) {
  var pastas = pastasGastos_();
  if (!pastas) return { ok: true, configurado: false, arquivos: [], novos: 0 };
  var importados = {};
  lerArquivosImportadosGastos_(ss).forEach(function (a) { importados[a.id] = a; });
  var arquivos = [];
  var olhar = function (pasta, caminho, origem, banco, nivel) {
    var fs = pasta.getFiles();
    while (fs.hasNext()) {
      var f = fs.next();
      var nome = f.getName();
      if (!ehArquivoGastos_(nome, f.getMimeType())) continue;
      var mod = f.getLastUpdated().toISOString();
      var imp = importados[f.getId()] || null;
      arquivos.push({
        id: f.getId(), nome: nome, caminho: caminho, origem: origem, banco: banco, tamanho: f.getSize(), modificado: mod,
        importado: !!imp, alterado: !!imp && !!imp.modificado && imp.modificado !== mod
      });
    }
    if (nivel >= 3) return;
    var subs = pasta.getFolders();
    while (subs.hasNext()) {
      var s = subs.next();
      var n = nomePastaGastos_(s.getName());
      olhar(s, caminho + '/' + n, origem, nivel === 0 ? n : banco, nivel + 1);
    }
  };
  if (pastas.cartao) { var pc = DriveApp.getFolderById(pastas.cartao); olhar(pc, nomePastaGastos_(pc.getName()), 'cartao', '', 0); }
  if (pastas.extratos) { var px = DriveApp.getFolderById(pastas.extratos); olhar(px, nomePastaGastos_(px.getName()), 'conta', '', 0); }
  arquivos.sort(function (a, b) { var x = a.caminho + '/' + a.nome; var y = b.caminho + '/' + b.nome; return x < y ? -1 : (x > y ? 1 : 0); });
  return { ok: true, configurado: true, arquivos: arquivos, novos: arquivos.filter(function (a) { return !a.importado || a.alterado; }).length };
}

/** Um arquivo das pastas de gastos em base64 - recusa o que estiver fora delas. */
function arquivoGastos_(id) {
  var pastas = pastasGastos_();
  if (!pastas) return { ok: false, etapa: 'gastos', erro: 'pastas de gastos não encontradas (rode configurarPastasGastosDireto no editor)' };
  if (!id) return { ok: false, etapa: 'gastos', erro: 'id vazio' };
  var raizes = [pastas.cartao, pastas.extratos].filter(String);
  var f = DriveApp.getFileById(id);
  var dentro = false;
  var nivel = [f];
  for (var k = 0; k < 5 && !dentro && nivel.length; k++) {
    var prox = [];
    nivel.forEach(function (x) {
      var pais = x.getParents();
      while (pais.hasNext()) { var p = pais.next(); if (raizes.indexOf(p.getId()) >= 0) dentro = true; prox.push(p); }
    });
    nivel = prox;
  }
  if (!dentro) return { ok: false, etapa: 'gastos', erro: 'arquivo fora das pastas de gastos' };
  if (!ehArquivoGastos_(f.getName(), f.getMimeType())) return { ok: false, etapa: 'gastos', erro: 'tipo de arquivo não suportado' };
  if (f.getSize() > 8 * 1024 * 1024) return { ok: false, etapa: 'gastos', erro: 'arquivo grande demais (' + Math.round(f.getSize() / 1024) + ' KB)' };
  return { ok: true, id: id, nome: f.getName(), modificado: f.getLastUpdated().toISOString(), base64: Utilities.base64Encode(f.getBlob().getBytes()) };
}
