/**
 * Despesas.gs - 26/09/2026: tela Organização Financeira (organizacao/despesas.html).
 *
 * Tiago: "quero ter uma relação dos meus gastos, pra me auxiliar na ideia de
 * quantos eu preciso ter na renda emergencial... adicionar novas despesas ou
 * remover, isso influencia na soma e na meta da renda emergencial, tudo tem
 * que estar bem conectado".
 *
 * A planilha já liga tudo; aqui só lemos e gravamos nos mesmos lugares:
 *
 *   'Despesas Essenciais'
 *     C5            Ajuste de Segurança (folga, fração - 0.1 = 10%)
 *     A6:E6         cabeçalho (Despesas | Média de Gastos | Total | Categoria | Frequência)
 *     A7:E{n}       uma despesa por linha: nome, valor, valor c/ folga (fórmula),
 *                   categoria e frequência (Mensal/Anual - anual vira /12).
 *                   D e E são colunas novas (26/09/2026, pedido do Tiago).
 *     A{n+1} Total: B = gasto real do mês (sem folga), C = custo de vida c/ folga
 *   'Distribuição e Metas'
 *     K11 = 'Despesas Essenciais'!C{total}  (média de gastos)
 *     L11 meses, M11 = K11*L11, L12 sobra, M12 = M11*(1+L12) (meta da reserva)
 *     E19 reserva atual (Carteira Renda Fixa marcada Renda Emergencial)
 *     N11 salário líquido, Q11 % pra investir, S11 = N11*Q11
 *     K18 extra, L18 % reinvestimento, M18 rendimento, M19 renda desejada,
 *     N18 patrimônio desejado = M19*12/M18 (e M19 = (K11+K18)*(1+L18))
 *
 * As linhas de despesa se movem (inserir/remover); o Sheets ajusta sozinho a
 * referência de K11 ao total. Depois de gravar, as fórmulas de C e do total
 * são reescritas cobrindo o intervalo inteiro (inserir logo acima do "Total:"
 * não entra no SUM antigo).
 *
 * Histórico: cada gravação acrescenta 1 linha em 'aux_historico-despesas'
 * (criada no 1º salvamento; nessa 1ª vez grava antes o estado anterior, pra
 * a linha do tempo já nascer com o "antes" e o "depois").
 *
 * GET  action=despesas                   -> estado (lerDespesasOrganizacao_)
 * POST action=salvarDespesas             itens (JSON), folga, meses, sobra, assinatura
 */

var DESPESAS_ABA_ = 'Despesas Essenciais';
var DESPESAS_ABA_DM_ = 'Distribuição e Metas';
var DESPESAS_ABA_HIST_ = 'aux_historico-despesas';
var DESPESAS_MAX_ITENS_ = 100;

function handleDespesas(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var r = lerDespesasOrganizacao_(ss);
    r.ok = true;
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'despesas', erro: String(erro) });
  }
}

function handleSalvarDespesas(e) {
  var trava = LockService.getScriptLock();
  try {
    trava.waitLock(20000);
  } catch (eL) {
    return jsonOut({ ok: false, etapa: 'salvarDespesas', erro: 'planilha ocupada, tente de novo em alguns segundos' });
  }
  try {
    var p = (e && e.parameter) || {};
    var itens;
    try { itens = JSON.parse(p.itens || '[]'); } catch (eJ) { return jsonOut({ ok: false, etapa: 'salvarDespesas', erro: 'itens inválidos (JSON)' }); }
    var r = salvarDespesasOrganizacao_(SpreadsheetApp.getActiveSpreadsheet(), {
      itens: itens,
      folga: p.folga,
      meses: p.meses,
      sobra: p.sobra,
      assinatura: p.assinatura
    }, new Date());
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'salvarDespesas', erro: String(erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

function numDespesa_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    var n = Number(v.replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  return null;
}

function frequenciaDespesa_(v) {
  return String(v || '').trim().toLowerCase().indexOf('anual') === 0 ? 'Anual' : 'Mensal';
}

/** Onde estão a folga, o cabeçalho e o "Total:" (a aba pode ganhar/perder linhas). */
function layoutDespesas_(valores) {
  var folgaLinha = null;
  var cab = null;
  var total = null;
  for (var i = 0; i < valores.length; i++) {
    var a = String(valores[i][0] || '').trim().toLowerCase();
    var b = String(valores[i][1] || '').trim().toLowerCase();
    if (folgaLinha === null && cab === null && b.indexOf('ajuste de seguran') === 0) folgaLinha = i + 1;
    if (cab === null && a === 'despesas') { cab = i + 1; continue; }
    if (cab !== null && total === null && a.indexOf('total') === 0) { total = i + 1; break; }
  }
  if (cab === null) throw new Error("aba 'Despesas Essenciais': não achei o cabeçalho (\"Despesas\" na coluna A)");
  if (total === null) throw new Error("aba 'Despesas Essenciais': não achei a linha \"Total:\" na coluna A");
  return { linhaFolga: folgaLinha || 5, linhaCabecalho: cab, primeira: cab + 1, linhaTotal: total };
}

function itensDaAbaDespesas_(valores, layout) {
  var itens = [];
  for (var r = layout.primeira; r < layout.linhaTotal; r++) {
    var l = valores[r - 1] || [];
    var nome = String(l[0] == null ? '' : l[0]).trim();
    var valor = numDespesa_(l[1]);
    if (!nome && valor === null) continue;
    itens.push({
      linha: r,
      nome: nome,
      valor: valor === null ? 0 : valor,
      comFolga: numDespesa_(l[2]),
      categoria: String(l[3] == null ? '' : l[3]).trim(),
      frequencia: frequenciaDespesa_(l[4])
    });
  }
  return itens;
}

/** Texto que identifica o estado lido - a gravação só acontece se a aba ainda estiver igual. */
function assinaturaDespesas_(itens, folga) {
  var partes = itens.map(function (it) {
    return [it.nome, Math.round(Number(it.valor || 0) * 100) / 100, it.categoria || '', it.frequencia || 'Mensal'].join('␟');
  });
  return (Math.round(Number(folga || 0) * 10000) / 10000) + '␞' + partes.join('␞');
}

function lerDespesasOrganizacao_(ss) {
  var aba = ss.getSheetByName(DESPESAS_ABA_);
  if (!aba) throw new Error('aba não encontrada: ' + DESPESAS_ABA_);
  var ultima = Math.max(aba.getLastRow(), 8);
  var valores = aba.getRange(1, 1, ultima, 5).getValues();
  var layout = layoutDespesas_(valores);
  var folga = numDespesa_(valores[layout.linhaFolga - 1][2]);
  if (folga === null) folga = 0;
  var itens = itensDaAbaDespesas_(valores, layout);
  var linhaTotal = valores[layout.linhaTotal - 1];

  var dm = ss.getSheetByName(DESPESAS_ABA_DM_);
  if (!dm) throw new Error('aba não encontrada: ' + DESPESAS_ABA_DM_);
  var b = dm.getRange('K10:S19').getValues();
  var c = function (linha, col) { return numDespesa_(b[linha - 10][col.charCodeAt(0) - 75]); };
  var reservaAtual = numDespesa_(dm.getRange('E19').getValue());

  return {
    despesas: {
      folga: folga,
      itens: itens,
      totalReal: numDespesa_(linhaTotal[1]),
      totalComFolga: numDespesa_(linhaTotal[2]),
      linhaTotal: layout.linhaTotal
    },
    reserva: {
      mediaGastos: c(11, 'K'),
      meses: c(11, 'L'),
      base: c(11, 'M'),
      sobra: c(12, 'L'),
      meta: c(12, 'M'),
      atual: reservaAtual
    },
    salario: {
      liquido: c(11, 'N'),
      percentualInvestir: c(11, 'Q'),
      aporte: c(11, 'S')
    },
    patrimonio: {
      extra: c(18, 'K'),
      reinvestimento: c(18, 'L'),
      rendimento: c(18, 'M'),
      desejado: c(18, 'N'),
      atual: c(18, 'Q'),
      rendaDesejada: c(19, 'M')
    },
    historico: lerHistoricoDespesas_(ss),
    assinatura: assinaturaDespesas_(itens, folga)
  };
}

function lerHistoricoDespesas_(ss) {
  var aba = ss.getSheetByName(DESPESAS_ABA_HIST_);
  if (!aba) return [];
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];
  var ini = Math.max(2, ultima - 199);
  var vals;
  try { vals = aba.getRange(ini, 1, ultima - ini + 1, 8).getValues(); } catch (e) { return []; }
  return vals.filter(function (l) { return l[0] !== '' && l[0] != null; }).map(function (l) {
    var d = l[0];
    return {
      data: (d instanceof Date) ? d.toISOString() : String(d),
      totalReal: numDespesa_(l[1]),
      totalComFolga: numDespesa_(l[2]),
      folga: numDespesa_(l[3]),
      meses: numDespesa_(l[4]),
      sobra: numDespesa_(l[5]),
      meta: numDespesa_(l[6]),
      qtd: numDespesa_(l[7])
    };
  });
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

/** Valida e normaliza o que veio da tela. Devolve { itens } ou { erro }. */
function normalizarItensDespesas_(itens) {
  if (!Array.isArray(itens) || !itens.length) return { erro: 'a lista precisa ter pelo menos 1 despesa' };
  if (itens.length > DESPESAS_MAX_ITENS_) return { erro: 'no máximo ' + DESPESAS_MAX_ITENS_ + ' despesas' };
  var out = [];
  for (var i = 0; i < itens.length; i++) {
    var it = itens[i] || {};
    var nome = String(it.nome == null ? '' : it.nome).replace(/\s+/g, ' ').trim();
    var valor = Number(it.valor);
    if (!nome) return { erro: 'despesa ' + (i + 1) + ' sem nome' };
    if (nome.length > 80) return { erro: 'nome muito longo: ' + nome.slice(0, 30) + '…' };
    if (/^total/i.test(nome) || /^despesas$/i.test(nome)) return { erro: 'nome reservado da planilha: ' + nome };
    if (/^[=+\-@]/.test(nome)) nome = "'" + nome; // não vira fórmula
    if (!isFinite(valor) || valor < 0) return { erro: 'valor inválido em "' + nome + '"' };
    var categoria = String(it.categoria == null ? '' : it.categoria).replace(/\s+/g, ' ').trim().slice(0, 40);
    if (/^[=+\-@]/.test(categoria)) categoria = "'" + categoria;
    out.push({ nome: nome, valor: Math.round(valor * 100) / 100, categoria: categoria, frequencia: frequenciaDespesa_(it.frequencia) });
  }
  return { itens: out };
}

function fracaoOuNull_(v, max) {
  if (v === undefined || v === null || v === '') return null;
  var n = Number(v);
  if (!isFinite(n) || n < 0 || n > max) return NaN;
  return n;
}

/**
 * O que muda na aba (puro - testável): quantas linhas inserir/remover e o
 * conteúdo final das linhas de despesa e do total.
 */
function planoGravacaoDespesas_(layout, nAtual, itens, celulaFolga) {
  var nNovo = itens.length;
  var primeira = layout.primeira;
  var ultima = primeira + nNovo - 1;
  var folgaAbs = celulaFolga.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
  return {
    inserir: Math.max(0, nNovo - nAtual),
    remover: Math.max(0, nAtual - nNovo),
    linhaInsercao: primeira + nAtual, // = linha do "Total:" hoje (quando há nAtual linhas)
    primeira: primeira,
    ultima: ultima,
    linhaTotal: ultima + 1,
    ab: itens.map(function (it) { return [it.nome, it.valor]; }),
    de: itens.map(function (it) { return [it.categoria, it.frequencia]; }),
    c: itens.map(function (it, i) {
      var r = primeira + i;
      return ['=IF(E' + r + '="Anual",B' + r + '/12,B' + r + ')*(1+' + folgaAbs + ')'];
    }),
    totalB: '=SUMIF(E' + primeira + ':E' + ultima + ',"<>Anual",B' + primeira + ':B' + ultima + ')+SUMIF(E' + primeira + ':E' + ultima + ',"Anual",B' + primeira + ':B' + ultima + ')/12',
    totalC: '=SUM(C' + primeira + ':C' + ultima + ')'
  };
}

function salvarDespesasOrganizacao_(ss, payload, agora) {
  var norm = normalizarItensDespesas_(payload.itens);
  if (norm.erro) return { ok: false, etapa: 'salvarDespesas', erro: norm.erro };
  var folga = fracaoOuNull_(payload.folga, 1);
  var sobra = fracaoOuNull_(payload.sobra, 1);
  var meses = fracaoOuNull_(payload.meses, 60);
  if (isNaN(folga)) return { ok: false, etapa: 'salvarDespesas', erro: 'folga inválida (use fração 0-1): ' + payload.folga };
  if (isNaN(sobra)) return { ok: false, etapa: 'salvarDespesas', erro: 'sobra inválida (use fração 0-1): ' + payload.sobra };
  if (isNaN(meses) || meses === 0) return { ok: false, etapa: 'salvarDespesas', erro: 'meses inválido: ' + payload.meses };

  var aba = ss.getSheetByName(DESPESAS_ABA_);
  if (!aba) throw new Error('aba não encontrada: ' + DESPESAS_ABA_);
  var dm = ss.getSheetByName(DESPESAS_ABA_DM_);
  if (!dm) throw new Error('aba não encontrada: ' + DESPESAS_ABA_DM_);

  var antes = lerDespesasOrganizacao_(ss);
  if (payload.assinatura && payload.assinatura !== antes.assinatura) {
    return {
      ok: false, etapa: 'salvarDespesas', conflito: true,
      erro: 'A aba Despesas Essenciais mudou desde que a tela carregou (alguém editou direto na planilha). Recarregue e refaça a alteração.'
    };
  }

  var valores = aba.getRange(1, 1, Math.max(aba.getLastRow(), 8), 5).getValues();
  var layout = layoutDespesas_(valores);
  var nAtual = layout.linhaTotal - layout.primeira;
  var celulaFolga = 'C' + layout.linhaFolga;
  var plano = planoGravacaoDespesas_(layout, nAtual, norm.itens, celulaFolga);

  if (plano.inserir > 0) {
    aba.insertRowsBefore(layout.linhaTotal, plano.inserir);
    if (nAtual > 0 && aba.getRange(layout.primeira, 1, 1, 5).copyFormatToRange) {
      aba.getRange(layout.primeira, 1, 1, 5).copyFormatToRange(aba, 1, 5, layout.linhaTotal, layout.linhaTotal + plano.inserir - 1);
    }
  } else if (plano.remover > 0) {
    aba.deleteRows(layout.primeira + norm.itens.length, plano.remover);
  }

  var n = norm.itens.length;
  if (!String(valores[layout.linhaCabecalho - 1][3] || '').trim()) aba.getRange(layout.linhaCabecalho, 4).setValue('Categoria');
  if (!String(valores[layout.linhaCabecalho - 1][4] || '').trim()) aba.getRange(layout.linhaCabecalho, 5).setValue('Frequência');
  aba.getRange(plano.primeira, 1, n, 2).setValues(plano.ab);
  aba.getRange(plano.primeira, 4, n, 2).setValues(plano.de);
  aba.getRange(plano.primeira, 3, n, 1).setFormulas(plano.c);
  aba.getRange(plano.linhaTotal, 2).setFormula(plano.totalB);
  aba.getRange(plano.linhaTotal, 3).setFormula(plano.totalC);
  if (folga !== null) aba.getRange(celulaFolga).setValue(folga);
  if (meses !== null) dm.getRange('L11').setValue(meses);
  if (sobra !== null) dm.getRange('L12').setValue(sobra);
  SpreadsheetApp.flush();

  var depois = lerDespesasOrganizacao_(ss);
  try {
    registrarHistoricoDespesas_(ss, antes, depois, agora || new Date());
    depois.historico = lerHistoricoDespesas_(ss);
  } catch (eH) {
    depois.avisoHistorico = String(eH);
  }
  depois.ok = true;
  return depois;
}

function linhaHistoricoDespesas_(estado, quando) {
  var d = estado.despesas;
  var r = estado.reserva;
  return [
    quando, d.totalReal, d.totalComFolga, d.folga, r.meses, r.sobra, r.meta, d.itens.length,
    JSON.stringify(d.itens.map(function (it) { return [it.nome, it.valor, it.categoria, it.frequencia]; }))
  ];
}

function registrarHistoricoDespesas_(ss, antes, depois, agora) {
  var aba = ss.getSheetByName(DESPESAS_ABA_HIST_);
  var novas = [];
  if (!aba) {
    aba = ss.insertSheet(DESPESAS_ABA_HIST_);
    novas.push(['Data', 'Gasto real (mês)', 'Custo de vida c/ folga (mês)', 'Folga', 'Meses', 'Sobra', 'Meta da reserva', 'Qtd despesas', 'Despesas (JSON)']);
  }
  var ultima = aba.getLastRow();
  if (ultima < 2) novas.push(linhaHistoricoDespesas_(antes, new Date(agora.getTime() - 1000)));
  novas.push(linhaHistoricoDespesas_(depois, agora));
  aba.getRange(Math.max(ultima, 0) + 1, 1, novas.length, 9).setValues(novas);
}
