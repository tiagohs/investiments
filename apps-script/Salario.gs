/**
 * Salario.gs - 26/09/2026: aba "Salário e investimentos" da Organização
 * Financeira (organizacao/despesas.html#salario).
 *
 * Tiago: "quero editar... pode pegar o salário do holerite mas eu posso
 * editar, quero editar quanto eu gostaria de investir, aí pode cruzar a média
 * de investimento mensal (considerando ou não proventos) vs minha meta mensal".
 *
 * Onde mora cada coisa:
 *   'Distribuição e Metas'  N11 salário líquido (a base das contas - já existia)
 *                           Q11 % pra investir, S11 = N11*Q11 (meta mensal em R$)
 *                           K18/L18/M18/N18/Q18 patrimônio (pra projeção)
 *   'Salário' (aba nova, criada no 1º salvamento) - um pagamento por linha:
 *     Mês | Tipo | Status | Data de crédito | Salário base | Outros vencimentos |
 *     Total vencimentos | INSS | IRRF | Outros descontos | Total descontos |
 *     Líquido | FGTS | Base IRRF | % para investir | Itens (JSON) | Atualizado em
 *     Tipo: Mensal, 13º (1ª/2ª parcela), Férias, PLR, Bônus, Outro.
 *     Status: Recebido (holerite) ou Previsto (planejamento dos extras do ano).
 *     Chave: Mês + Tipo (salvar de novo o mesmo mês/tipo substitui a linha).
 *   Investido por mês: a mesma série da Início (fluxoCaixa* de
 *     montarSerieHistoricoInicio_ - compras menos vendas, por dia) somada por
 *     mês; proventos recebidos por mês vêm da tela Proventos (mesma lista).
 *
 * GET  action=salario
 * POST action=salvarSalarioBase        liquido, percentual (fração 0-1)
 * POST action=salvarPagamentoSalario   pagamento (JSON), usarComoBase ('1')
 * POST action=excluirPagamentoSalario  mes, tipo
 */

var SALARIO_ABA_ = 'Salário';
var SALARIO_CAB_ = ['Mês', 'Tipo', 'Status', 'Data de crédito', 'Salário base', 'Outros vencimentos', 'Total vencimentos', 'INSS', 'IRRF',
  'Outros descontos', 'Total descontos', 'Líquido', 'FGTS', 'Base IRRF', '% para investir', 'Itens (JSON)', 'Atualizado em'];
var SALARIO_TIPOS_ = ['Mensal', '13º (1ª parcela)', '13º (2ª parcela)', 'Férias', 'PLR', 'Bônus', 'Outro'];
var SALARIO_MESES_SERIE_ = 36;

function handleSalario(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var r = montarTelaSalario_(SpreadsheetApp.getActiveSpreadsheet(), new Date());
    r.ok = true;
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'salario', erro: String(erro) });
  }
}

function handleSalvarSalarioBase(e) {
  return comTravaSalario_(function () {
    var p = (e && e.parameter) || {};
    return salvarSalarioBase_(SpreadsheetApp.getActiveSpreadsheet(), p.liquido, p.percentual);
  });
}

function handleSalvarPagamentoSalario(e) {
  return comTravaSalario_(function () {
    var p = (e && e.parameter) || {};
    var pag;
    try { pag = JSON.parse(p.pagamento || '{}'); } catch (eJ) { return { ok: false, etapa: 'salario', erro: 'pagamento inválido (JSON)' }; }
    return salvarPagamentoSalario_(SpreadsheetApp.getActiveSpreadsheet(), pag, { usarComoBase: p.usarComoBase === '1' || p.usarComoBase === 'true' }, new Date());
  });
}

function handleExcluirPagamentoSalario(e) {
  return comTravaSalario_(function () {
    var p = (e && e.parameter) || {};
    return excluirPagamentoSalario_(SpreadsheetApp.getActiveSpreadsheet(), p.mes, p.tipo, new Date());
  });
}

function comTravaSalario_(fn) {
  var trava = travaRecurso_('salario', 'salvar salário');
  try { trava.waitLock(20000); } catch (eL) { return jsonOut({ ok: false, etapa: 'salario', erro: 'planilha ocupada, tente de novo em alguns segundos' }); }
  try {
    return jsonOut(fn());
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'salario', erro: String(erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

function numSalario_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    var s = v.replace(/R\$|\s/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  return null;
}

/** 'yyyy-MM' de um texto ("2026-08", "08/2026") ou de uma data da planilha. */
function mesSalario_(v) {
  if (v instanceof Date || (v && typeof v.getFullYear === 'function')) {
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2);
  }
  var s = String(v == null ? '' : v).replace(/^'/, '').trim();
  var m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return m[2] + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function dataIsoSalario_(v) {
  if (v instanceof Date || (v && typeof v.getFullYear === 'function')) {
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  }
  var s = String(v == null ? '' : v).replace(/^'/, '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

function lerPagamentosSalario_(ss) {
  var aba = ss.getSheetByName(SALARIO_ABA_);
  if (!aba) return [];
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];
  var vals = aba.getRange(2, 1, ultima - 1, SALARIO_CAB_.length).getValues();
  var out = [];
  vals.forEach(function (l, i) {
    var mes = mesSalario_(l[0]);
    if (!mes) return;
    var itens = [];
    try { itens = l[15] ? JSON.parse(l[15]) : []; } catch (e) { itens = []; }
    out.push({
      linha: i + 2,
      mes: mes,
      tipo: String(l[1] || 'Mensal').trim() || 'Mensal',
      status: /previst/i.test(String(l[2] || '')) ? 'Previsto' : 'Recebido',
      dataCredito: dataIsoSalario_(l[3]),
      salarioBase: numSalario_(l[4]),
      outrosVencimentos: numSalario_(l[5]),
      totalVencimentos: numSalario_(l[6]),
      inss: numSalario_(l[7]),
      irrf: numSalario_(l[8]),
      outrosDescontos: numSalario_(l[9]),
      totalDescontos: numSalario_(l[10]),
      liquido: numSalario_(l[11]),
      fgts: numSalario_(l[12]),
      baseIrrf: numSalario_(l[13]),
      percentualInvestir: numSalario_(l[14]),
      itens: Array.isArray(itens) ? itens : []
    });
  });
  out.sort(function (a, b) { return a.mes < b.mes ? 1 : (a.mes > b.mes ? -1 : SALARIO_TIPOS_.indexOf(a.tipo) - SALARIO_TIPOS_.indexOf(b.tipo)); });
  return out;
}

/**
 * Investido por mês (compras - vendas, em reais) - a mesma série da Início -
 * e proventos recebidos por mês. Devolve os últimos `quantos` meses até o mês
 * de `hoje` (o mês corrente vai junto, marcado como parcial).
 */
function investimentoMensalSalario_(serie, recebidos, hoje, quantos) {
  var mesHoje = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2);
  var meses = [];
  var d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  for (var i = 0; i < quantos; i++) {
    meses.unshift(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2));
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }
  var idx = {};
  var out = meses.map(function (m, k) { idx[m] = k; return { mes: m, total: 0, longoPrazo: 0, reserva: 0, proventos: 0, parcial: m === mesHoje }; });
  (serie || []).forEach(function (p) {
    var k = idx[String(p.data || '').slice(0, 7)];
    if (k === undefined) return;
    out[k].total += Number(p.fluxoCaixaPatrimonio) || 0;
    out[k].longoPrazo += Number(p.fluxoCaixaLongoPrazo) || 0;
    out[k].reserva += Number(p.fluxoCaixaRendaEmergencial) || 0;
  });
  (recebidos || []).forEach(function (p) {
    var k = idx[String(p.data || '').slice(0, 7)];
    if (k === undefined) return;
    out[k].proventos += Number(p.valor) || 0;
  });
  out.forEach(function (o) {
    ['total', 'longoPrazo', 'reserva', 'proventos'].forEach(function (c) { o[c] = Math.round(o[c] * 100) / 100; });
  });
  return out;
}

function montarTelaSalario_(ss, hoje) {
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
  var b = dm.getRange('K10:S19').getValues();
  var c = function (linha, col) { return numSalario_(b[linha - 10][col.charCodeAt(0) - 75]); };
  var avisos = {};

  var despesas = null;
  try {
    var d = lerDespesasOrganizacao_(ss); // Despesas.gs
    // 27/09/2026: se o Total da aba estiver com erro, usa a soma das próprias
    // despesas (anual /12) - a mesma conta da tela de Despesas - e avisa
    var somaItens = (d.despesas.itens || []).reduce(function (s, it) {
      var v = typeof it.valor === 'number' && isFinite(it.valor) ? it.valor : 0;
      return s + (/anual/i.test(it.frequencia || '') ? v / 12 : v);
    }, 0);
    var real = d.despesas.totalReal;
    var usaSoma = real === null || d.despesas.erroFormula;
    despesas = {
      totalReal: usaSoma ? Math.round(somaItens * 100) / 100 : real,
      totalComFolga: usaSoma ? Math.round(somaItens * (1 + (d.despesas.folga || 0)) * 100) / 100 : d.despesas.totalComFolga,
      reservaAtual: d.reserva.atual, metaReserva: d.reserva.meta,
      erroFormula: d.despesas.erroFormula || null
    };
  } catch (eD) { avisos.despesas = String(eD); }

  var mensal = [];
  try {
    var serie = montarSerieHistoricoInicio_(); // HistoricoInicio.gs (cache)
    var recebidos = [];
    try { recebidos = montarTelaProventosComCache_().recebidos || []; } catch (eP) { avisos.proventos = String(eP); }
    mensal = investimentoMensalSalario_(serie, recebidos, hoje, SALARIO_MESES_SERIE_);
  } catch (eS) { avisos.investimentos = String(eS); }

  var r = {
    hoje: hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2),
    base: { liquido: c(11, 'N'), percentualInvestir: c(11, 'Q'), aporteMeta: c(11, 'S') },
    patrimonio: { atual: c(18, 'Q'), desejado: c(18, 'N'), rendimento: c(18, 'M'), extra: c(18, 'K'), reinvestimento: c(18, 'L') },
    despesas: despesas,
    pagamentos: lerPagamentosSalario_(ss),
    mensal: mensal
  };
  if (Object.keys(avisos).length) r.avisos = avisos;
  return r;
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

function salvarSalarioBase_(ss, liquido, percentual) {
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (!dm) throw new Error('aba não encontrada: Distribuição e Metas');
  var mexeu = false;
  if (liquido !== undefined && liquido !== null && liquido !== '') {
    var l = Number(liquido);
    if (!isFinite(l) || l <= 0 || l > 10000000) return { ok: false, etapa: 'salario', erro: 'salário líquido inválido: ' + liquido };
    dm.getRange('N11').setValue(Math.round(l * 100) / 100);
    mexeu = true;
  }
  if (percentual !== undefined && percentual !== null && percentual !== '') {
    var pc = Number(percentual);
    if (!isFinite(pc) || pc < 0 || pc > 1) return { ok: false, etapa: 'salario', erro: '% pra investir inválido (use fração 0-1): ' + percentual };
    dm.getRange('Q11').setValue(Math.round(pc * 10000) / 10000);
    mexeu = true;
  }
  if (!mexeu) return { ok: false, etapa: 'salario', erro: 'nada pra salvar' };
  SpreadsheetApp.flush();
  var b = dm.getRange('N11:S11').getValues()[0];
  return { ok: true, base: { liquido: numSalario_(b[0]), percentualInvestir: numSalario_(b[3]), aporteMeta: numSalario_(b[5]) } };
}

function normalizarPagamentoSalario_(p) {
  p = p || {};
  var mes = mesSalario_(p.mes);
  if (!mes) return { erro: 'mês inválido (use aaaa-mm): ' + p.mes };
  var tipo = String(p.tipo || 'Mensal').trim();
  if (SALARIO_TIPOS_.indexOf(tipo) < 0) return { erro: 'tipo inválido: ' + tipo };
  var n = function (v) { if (v === null || v === undefined || v === '') return ''; var x = Number(v); return isFinite(x) ? Math.round(x * 100) / 100 : NaN; };
  var campos = ['salarioBase', 'outrosVencimentos', 'totalVencimentos', 'inss', 'irrf', 'outrosDescontos', 'totalDescontos', 'liquido', 'fgts', 'baseIrrf'];
  var out = { mes: mes, tipo: tipo, status: p.status === 'Previsto' ? 'Previsto' : 'Recebido', dataCredito: dataIsoSalario_(p.dataCredito) };
  for (var i = 0; i < campos.length; i++) {
    var v = n(p[campos[i]]);
    if (typeof v === 'number' && (isNaN(v) || v < 0)) return { erro: 'valor inválido em ' + campos[i] };
    out[campos[i]] = v;
  }
  if (out.liquido === '' || !(out.liquido > 0)) return { erro: 'informe o valor líquido' };
  var pct = p.percentualInvestir;
  if (pct === null || pct === undefined || pct === '') out.percentualInvestir = '';
  else {
    pct = Number(pct);
    if (!isFinite(pct) || pct < 0 || pct > 1) return { erro: '% para investir inválido (use fração 0-1)' };
    out.percentualInvestir = Math.round(pct * 10000) / 10000;
  }
  var itens = Array.isArray(p.itens) ? p.itens.slice(0, 60).map(function (it) {
    return {
      codigo: String(it.codigo || '').slice(0, 10),
      descricao: String(it.descricao || '').replace(/^[=+\-@]+/, '').slice(0, 80),
      quantidade: isFinite(Number(it.quantidade)) ? Number(it.quantidade) : null,
      vencimento: Number(it.vencimento) || 0,
      desconto: Number(it.desconto) || 0,
      outros: Number(it.outros) || 0
    };
  }) : [];
  out.itens = itens;
  return { pagamento: out };
}

function garantirAbaSalario_(ss) {
  var aba = ss.getSheetByName(SALARIO_ABA_);
  if (aba) return aba;
  aba = ss.insertSheet(SALARIO_ABA_);
  aba.getRange(1, 1, 1, SALARIO_CAB_.length).setValues([SALARIO_CAB_]);
  if (aba.setFrozenRows) aba.setFrozenRows(1);
  return aba;
}

function linhaDoPagamentoSalario_(aba, mes, tipo) {
  var ultima = aba.getLastRow();
  if (ultima < 2) return 0;
  var vals = aba.getRange(2, 1, ultima - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (mesSalario_(vals[i][0]) === mes && String(vals[i][1] || 'Mensal').trim() === tipo) return i + 2;
  }
  return 0;
}

function salvarPagamentoSalario_(ss, pagamento, opcoes, agora) {
  var norm = normalizarPagamentoSalario_(pagamento);
  if (norm.erro) return { ok: false, etapa: 'salario', erro: norm.erro };
  var p = norm.pagamento;
  var aba = garantirAbaSalario_(ss);
  var linha = linhaDoPagamentoSalario_(aba, p.mes, p.tipo) || (Math.max(aba.getLastRow(), 1) + 1);
  aba.getRange(linha, 1, 1, SALARIO_CAB_.length).setValues([[
    "'" + p.mes, p.tipo, p.status, p.dataCredito ? "'" + p.dataCredito : '', p.salarioBase, p.outrosVencimentos, p.totalVencimentos,
    p.inss, p.irrf, p.outrosDescontos, p.totalDescontos, p.liquido, p.fgts, p.baseIrrf, p.percentualInvestir,
    JSON.stringify(p.itens), agora || new Date()
  ]]);
  if (opcoes && opcoes.usarComoBase && p.status === 'Recebido') {
    var rb = salvarSalarioBase_(ss, p.liquido, null);
    if (!rb.ok) return rb;
  }
  SpreadsheetApp.flush();
  var r = montarTelaSalario_(ss, agora || new Date());
  r.ok = true;
  return r;
}

function excluirPagamentoSalario_(ss, mes, tipo, agora) {
  var aba = ss.getSheetByName(SALARIO_ABA_);
  var m = mesSalario_(mes);
  var t = String(tipo || 'Mensal').trim();
  var linha = aba && m ? linhaDoPagamentoSalario_(aba, m, t) : 0;
  if (!linha) return { ok: false, etapa: 'salario', erro: 'pagamento não encontrado: ' + mes + ' / ' + tipo };
  aba.deleteRow(linha);
  SpreadsheetApp.flush();
  var r = montarTelaSalario_(ss, agora || new Date());
  r.ok = true;
  return r;
}

// ---------------------------------------------------------------------------
// 05/10/2026: holerites direto do Drive - "Documentos/Trabalho/<EMPRESA>/Holerite/<ANO>/MES-ANO.pdf"
// ---------------------------------------------------------------------------
//
// Tiago: "holerites ficarão em Drive Documentos/Trabalho/NOME_EMPRESA/Holerite/
// ANO/MES-ANO.pdf (já tem 2 meses de 2026 da empresa atual lá)". Mesmo desenho
// do IR (Patrimonio.gs) e dos gastos (Gastos.gs): o Apps Script LISTA os PDFs
// (e entrega um por vez em base64); quem LÊ o PDF é o navegador (holerite.js,
// o mesmo leitor do botão "Importar holerite"); aqui só chegam os valores já
// lidos e o REGISTRO de quais arquivos já foram importados.
//
//   'aux_holerites-arquivos'  ID | Nome | Empresa | Mês | Modificado | Importado em | Tipo | Situação | Problema
//       Situação = ok | aviso (entrou, mas o leitor avisou algo - ex.: soma não bate) | erro (não deu pra ler:
//       fica registrado só pra tela não insistir até o arquivo mudar). Um arquivo só volta a ser "novo" se
//       o modifiedTime do Drive mudou desde a importação. Reimportar o mesmo mês/tipo substitui a linha da aba Salário.
//
// GET  action=holeritesArquivos     PDFs achados (marca novos/alterados/com problema)
// GET  action=holeriteArquivo&id=   um PDF (base64) - só os da lista
// POST action=salvarHoleriteDrive   pagamento (JSON), arquivo (JSON), usarComoBase - grava o pagamento e registra o arquivo
//                                   (arquivo.situacao 'erro' + arquivo.problema: só registra a falha)
//
// A pasta "Trabalho" (de preferência dentro de "Documentos") é achada sozinha; se não achar (ou houver mais de
// uma), rode 1 vez no editor configurarPastaHoleritesDireto('<id da pasta Trabalho>').

var HOLERITE_ABA_ARQUIVOS_ = 'aux_holerites-arquivos';
var HOLERITE_CAB_ARQ_ = ['ID', 'Nome', 'Empresa', 'Mês', 'Modificado', 'Importado em', 'Tipo', 'Situação', 'Problema'];
var HOLERITE_SITUACOES_ = ['ok', 'aviso', 'erro'];
var PROP_PASTA_HOLERITES_ = 'HOLERITES_PASTA_TRABALHO';
var HOLERITE_MAX_BYTES_ = 8 * 1024 * 1024;

function handleHoleritesArquivos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(listarArquivosHolerites_(SpreadsheetApp.getActiveSpreadsheet()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'holerites', erro: String(erro) });
  }
}

function handleHoleriteArquivo(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(arquivoHolerite_(SpreadsheetApp.getActiveSpreadsheet(), (e && e.parameter && e.parameter.id) || ''));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'holerites', erro: String(erro) });
  }
}

function handleSalvarHoleriteDrive(e) {
  return comTravaSalario_(function () {
    var p = (e && e.parameter) || {};
    var pag, arq;
    try { pag = JSON.parse(p.pagamento || '{}'); arq = JSON.parse(p.arquivo || '{}'); } catch (eJ) { return { ok: false, etapa: 'holerites', erro: 'dados inválidos (JSON)' }; }
    return salvarHoleriteDrive_(SpreadsheetApp.getActiveSpreadsheet(), pag, arq, { usarComoBase: p.usarComoBase === '1' || p.usarComoBase === 'true' }, new Date());
  });
}

/** Minúsculas, sem acento e sem espaços nas pontas ("Holerite", "HOLERITES", "holeríte" -> 'holerite(s)'). */
function semAcentoHolerite_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

var HOLERITE_MESES_NOME_ = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6,
  julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12
};

/**
 * 'aaaa-mm' que o NOME do arquivo diz: "01-2026", "1_2026", "2026-01", "JANEIRO-2026", "jan 2026". Sem mês
 * reconhecível devolve '' (quem manda é o conteúdo do PDF; o nome só ordena e aparece na lista). `anoPasta`
 * completa um nome que só tem o mês ("janeiro.pdf" dentro da pasta 2026).
 */
function mesDoNomeHolerite_(nome, anoPasta) {
  var n = semAcentoHolerite_(nome).replace(/\.pdf$/, '');
  var m = n.match(/(?:^|[^0-9])(\d{1,2})\s*[-_.\/ ]\s*(20\d{2})(?:[^0-9]|$)/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return m[2] + '-' + ('0' + Number(m[1])).slice(-2);
  m = n.match(/(?:^|[^0-9])(20\d{2})\s*[-_.\/ ]\s*(\d{1,2})(?:[^0-9]|$)/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return m[1] + '-' + ('0' + Number(m[2])).slice(-2);
  var nomes = Object.keys(HOLERITE_MESES_NOME_).sort(function (a, b) { return b.length - a.length; }).join('|');
  m = n.match(new RegExp('(?:^|[^a-z])(' + nomes + ')(?:[^a-z0-9]*)(20\\d{2})?(?:[^a-z]|$)'));
  if (m) {
    var ano = m[2] || (anoPasta && /^20\d{2}$/.test(String(anoPasta)) ? String(anoPasta) : '');
    if (ano) return ano + '-' + ('0' + HOLERITE_MESES_NOME_[m[1]]).slice(-2);
  }
  m = n.match(new RegExp('(20\\d{2})[^a-z0-9]*(' + nomes + ')(?:[^a-z]|$)'));
  if (m) return m[1] + '-' + ('0' + HOLERITE_MESES_NOME_[m[2]]).slice(-2);
  return '';
}

/** Acha "Trabalho" (de preferência dentro de "Documentos"). */
function acharPastaTrabalhoHolerites_(idOpcional) {
  if (idOpcional) return DriveApp.getFolderById(idOpcional);
  var it = DriveApp.searchFolders("title contains 'Trabalho'");
  var cands = [];
  while (it.hasNext()) { var f = it.next(); if (semAcentoHolerite_(f.getName()) === 'trabalho') cands.push(f); }
  var achada = null;
  cands.forEach(function (p) {
    if (achada) return;
    var pais = p.getParents();
    while (pais.hasNext()) { if (/^documentos?$/.test(semAcentoHolerite_(pais.next().getName()))) { achada = p; return; } }
  });
  if (!achada && cands.length === 1) achada = cands[0];
  return achada;
}

/**
 * Rode 1 vez no editor: acha Documentos/Trabalho, guarda o ID e pede a autorização de leitura do Drive.
 * Com mais de uma pasta "Trabalho": configurarPastaHoleritesDireto('<id>').
 */
function configurarPastaHoleritesDireto(idOpcional) {
  var pasta = acharPastaTrabalhoHolerites_(idOpcional || null);
  if (!pasta) throw new Error('Não achei Documentos/Trabalho no seu Drive - rode configurarPastaHoleritesDireto("<id da pasta Trabalho>")');
  PropertiesService.getScriptProperties().setProperty(PROP_PASTA_HOLERITES_, pasta.getId());
  var r = listarArquivosHolerites_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log('Pasta dos holerites configurada: ' + pasta.getName() + ' - ' + r.arquivos.length + ' PDF(s), ' + r.novos + ' novo(s): ' +
    r.arquivos.map(function (a) { return a.empresa + '/' + a.nome; }).join(', '));
  return r;
}

/** ID da pasta "Trabalho" (guardado; ou achado e guardado na 1ª vez). '' = não achou. */
function pastaTrabalhoHolerites_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_PASTA_HOLERITES_);
  if (id) return id;
  var p = acharPastaTrabalhoHolerites_(null);
  if (!p) return '';
  props.setProperty(PROP_PASTA_HOLERITES_, p.getId());
  return p.getId();
}

function textoIsoHolerite_(v) {
  if (v && typeof v.getTime === 'function') return v.toISOString();
  return v ? String(v) : '';
}

function textoMesHolerite_(v) {
  if (v && typeof v.getFullYear === 'function') return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2);
  var m = String(v || '').match(/^(\d{4})-(\d{2})/);
  return m ? m[1] + '-' + m[2] : '';
}

/** Texto seguro pra célula (sem fórmula, sem controle, sem CPF/CNPJ). */
function textoSeguroHolerite_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/^[=+\-@]+/, '').replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '•••').replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '•••').slice(0, max || 160);
}

/** O registro da aba 'aux_holerites-arquivos' (um por arquivo importado ou que falhou). */
function lerArquivosImportadosHolerites_(ss) {
  var aba = ss.getSheetByName(HOLERITE_ABA_ARQUIVOS_);
  if (!aba || aba.getLastRow() < 2) return [];
  var linhas = aba.getRange(2, 1, aba.getLastRow() - 1, HOLERITE_CAB_ARQ_.length).getValues();
  return linhas.filter(function (l) { return String(l[0] || '').trim(); }).map(function (l) {
    var sit = HOLERITE_SITUACOES_.indexOf(String(l[7] || '')) >= 0 ? String(l[7]) : 'ok';
    return {
      id: String(l[0]), nome: String(l[1] || ''), empresa: String(l[2] || ''), mes: textoMesHolerite_(l[3]),
      modificado: textoIsoHolerite_(l[4]), importadoEm: textoIsoHolerite_(l[5]), tipo: String(l[6] || ''), situacao: sit, problema: String(l[8] || '')
    };
  });
}

/**
 * Os PDFs de "Trabalho/<EMPRESA>/Holerite/<ANO>/..." (a pasta "Holerite" de cada empresa, sem ligar pra
 * maiúsculas/acento nem pro plural; PDF direto nela ou numa subpasta de ano, até 3 níveis). Cada arquivo:
 * { id, nome, empresa, ano, mes ('aaaa-mm' do nome, ou ''), tamanho, modificado, importado, alterado, situacao,
 * problema, novo }. `novo` = ainda não importado, ou o modifiedTime mudou desde a importação.
 */
function listarArquivosHolerites_(ss) {
  var idRaiz = pastaTrabalhoHolerites_();
  if (!idRaiz) return { ok: true, configurado: false, arquivos: [], novos: 0, falhos: 0 };
  var raiz = DriveApp.getFolderById(idRaiz);
  var reg = {};
  lerArquivosImportadosHolerites_(ss).forEach(function (a) { reg[a.id] = a; });
  var arquivos = [];
  var coletar = function (pasta, empresa, ano, nivel) {
    var fs = pasta.getFiles();
    while (fs.hasNext()) {
      var f = fs.next();
      var nome = f.getName();
      if (!(/pdf$/i.test(f.getMimeType() || '') || /\.pdf$/i.test(nome))) continue;
      var mod = f.getLastUpdated().toISOString();
      var imp = reg[f.getId()] || null;
      var mudou = !!imp && !!imp.modificado && imp.modificado !== mod;
      arquivos.push({
        id: f.getId(), nome: textoSeguroHolerite_(nome, 120), empresa: empresa, ano: ano, mes: mesDoNomeHolerite_(nome, ano),
        tamanho: f.getSize(), modificado: mod,
        importado: !!imp && imp.situacao !== 'erro', alterado: mudou && imp.situacao !== 'erro',
        situacao: imp ? imp.situacao : '', problema: imp ? imp.problema : '',
        novo: !imp || mudou
      });
    }
    if (nivel >= 3) return;
    var subs = pasta.getFolders();
    while (subs.hasNext()) {
      var s = subs.next();
      var nm = String(s.getName() || '').trim();
      coletar(s, empresa, /^20\d{2}$/.test(nm) ? nm : ano, nivel + 1);
    }
  };
  var empresas = raiz.getFolders();
  while (empresas.hasNext()) {
    var emp = empresas.next();
    var nomeEmp = String(emp.getName() || '').trim();
    var subs = emp.getFolders();
    while (subs.hasNext()) {
      var h = subs.next();
      if (/^holerites?$/.test(semAcentoHolerite_(h.getName()))) coletar(h, nomeEmp, '', 1);
    }
  }
  arquivos.sort(function (a, b) {
    var x = (a.mes || a.ano || '') + '|' + a.empresa + '|' + a.nome; var y = (b.mes || b.ano || '') + '|' + b.empresa + '|' + b.nome;
    return x < y ? -1 : (x > y ? 1 : 0);
  });
  return {
    ok: true, configurado: true, arquivos: arquivos,
    novos: arquivos.filter(function (a) { return a.novo; }).length,
    falhos: arquivos.filter(function (a) { return a.situacao === 'erro' || a.situacao === 'aviso'; }).length
  };
}

/** Um PDF da lista, em base64 - recusa qualquer id que não esteja nas pastas de holerite. */
function arquivoHolerite_(ss, id) {
  if (!id) return { ok: false, etapa: 'holerites', erro: 'id vazio' };
  var lista = listarArquivosHolerites_(ss);
  if (!lista.configurado) return { ok: false, etapa: 'holerites', erro: 'pasta dos holerites não encontrada (rode configurarPastaHoleritesDireto no editor)' };
  var achado = lista.arquivos.filter(function (a) { return a.id === id; })[0];
  if (!achado) return { ok: false, etapa: 'holerites', erro: 'arquivo fora das pastas de holerite' };
  if (achado.tamanho > HOLERITE_MAX_BYTES_) return { ok: false, etapa: 'holerites', erro: 'PDF grande demais (' + Math.round(achado.tamanho / 1024) + ' KB)' };
  var bytes = DriveApp.getFileById(id).getBlob().getBytes();
  return { ok: true, id: id, nome: achado.nome, empresa: achado.empresa, mes: achado.mes, modificado: achado.modificado, base64: Utilities.base64Encode(bytes) };
}

/** Grava (ou troca) o registro de um arquivo na aba 'aux_holerites-arquivos'. */
function registrarArquivoHolerite_(ss, arquivo, agora) {
  var id = String(arquivo.id || '').slice(0, 200);
  var aba = ss.getSheetByName(HOLERITE_ABA_ARQUIVOS_);
  if (!aba) {
    aba = ss.insertSheet(HOLERITE_ABA_ARQUIVOS_);
    aba.getRange(1, 1, 1, HOLERITE_CAB_ARQ_.length).setValues([HOLERITE_CAB_ARQ_]);
    if (aba.setFrozenRows) aba.setFrozenRows(1);
  }
  var existentes = aba.getLastRow() >= 2 ? aba.getRange(2, 1, aba.getLastRow() - 1, HOLERITE_CAB_ARQ_.length).getValues() : [];
  var outras = existentes.filter(function (l) { return String(l[0] || '').trim() && String(l[0]) !== id; }).map(function (l) {
    return [String(l[0]), String(l[1] || ''), String(l[2] || ''), textoMesHolerite_(l[3]), textoIsoHolerite_(l[4]), textoIsoHolerite_(l[5]), String(l[6] || ''), String(l[7] || ''), String(l[8] || '')];
  });
  var sit = HOLERITE_SITUACOES_.indexOf(String(arquivo.situacao || 'ok')) >= 0 ? String(arquivo.situacao || 'ok') : 'ok';
  outras.push([
    id, textoSeguroHolerite_(arquivo.nome, 120), textoSeguroHolerite_(arquivo.empresa, 80), textoMesHolerite_(arquivo.mes),
    String(arquivo.modificado || '').slice(0, 40), (agora || new Date()).toISOString(), textoSeguroHolerite_(arquivo.tipo, 30), sit,
    sit === 'ok' ? '' : textoSeguroHolerite_(arquivo.problema, 160)
  ]);
  var antes = Math.max(aba.getLastRow(), 1);
  if (antes > 1) aba.getRange(2, 1, antes - 1, HOLERITE_CAB_ARQ_.length).clearContent();
  [4, 5, 6].forEach(function (c) { aba.getRange(2, c, outras.length, 1).setNumberFormat('@'); });
  aba.getRange(2, 1, outras.length, HOLERITE_CAB_ARQ_.length).setValues(outras);
}

/**
 * Importa 1 holerite lido do Drive: grava o pagamento (aba Salário, mesma chave mês+tipo - reimportar substitui)
 * e registra o arquivo. Com arquivo.situacao 'erro' só registra a falha (nada muda na aba Salário).
 * O arquivo só vale se o id estiver na lista do Drive (ninguém registra id inventado).
 */
function salvarHoleriteDrive_(ss, pagamento, arquivo, opcoes, agora) {
  arquivo = arquivo || {};
  var id = String(arquivo.id || '').slice(0, 200);
  if (!id) return { ok: false, etapa: 'holerites', erro: 'arquivo sem id' };
  if (arquivo.situacao === 'erro') {
    registrarArquivoHolerite_(ss, arquivo, agora);
    return { ok: true, id: id, falha: true };
  }
  var r = salvarPagamentoSalario_(ss, pagamento, opcoes || {}, agora);
  if (!r || !r.ok) return r;
  registrarArquivoHolerite_(ss, { id: id, nome: arquivo.nome, empresa: arquivo.empresa, mes: pagamento && pagamento.mes, modificado: arquivo.modificado,
    tipo: pagamento && pagamento.tipo, situacao: arquivo.situacao === 'aviso' ? 'aviso' : 'ok', problema: arquivo.problema }, agora);
  SpreadsheetApp.flush();
  r.holerite = { id: id, situacao: arquivo.situacao === 'aviso' ? 'aviso' : 'ok' };
  return r;
}
