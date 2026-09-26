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
  var trava = LockService.getScriptLock();
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
    despesas = { totalReal: d.despesas.totalReal, totalComFolga: d.despesas.totalComFolga, reservaAtual: d.reserva.atual, metaReserva: d.reserva.meta };
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
