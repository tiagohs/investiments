/**
 * EmagrecerPlanilha.gs - 29/10/2026 (ADR-08 de docs/arquitetura-leitura-cloudflare.md; Tiago: "crie a function para deletar
 * as abas e linhas que ajudariam na performance").
 *
 * A planilha tem ~1,18 milhão de fórmulas, e a maior parte está em linha VAZIA: as abas de lançamentos (Transações,
 * Transações - USA, Transações Renda Fixa, Proventos, Proventos - USA) vêm com ~10 mil linhas com as fórmulas prontas
 * (inclusive ~11 mil HOJE() nos Proventos), e a aba de testes `aux_tests` guarda ~237 mil. Toda leitura e gravação do
 * Apps Script espera esse recálculo, e o getLastRow() dessas abas aponta pra linha 10 mil.
 *
 * O que faz:
 *  - abas de lançamentos: mantém as fórmulas nas linhas com dado + uma MARGEM de linhas vazias (pra digitar direto na
 *    planilha); abaixo disso, apaga só o CONTEÚDO das colunas de fórmula (formato e validação ficam; nenhuma linha é
 *    removida, então referências como 'Transações'!C7:C10800 continuam iguais). Coluna com valor DIGITADO abaixo da
 *    última linha não é tocada (aparece no relatório);
 *  - abas `aux_tests*` (só testes manuais, tests/manual/teste.html): fica só o cabeçalho (linha 1);
 *  - as gravações do site (Lancamentos.gs, ImportB3.gs) completam as fórmulas da linha nova se ela passar da margem
 *    (garantirFormulasLanc_), e rodar esta função de novo repõe a margem.
 *
 * No editor:
 *  1) simularEmagrecerPlanilhaDireto()  - só conta e mostra o que faria (não mexe em nada);
 *  2) emagrecerPlanilhaDireto()         - faz uma CÓPIA de segurança (pasta investiments-dados do Drive) e executa.
 */

var EMAGRECER_MARGEM_LINHAS_ = 300;     // linhas vazias que continuam com fórmula depois da última linha com dado
var EMAGRECER_LINHAS_POR_BLOCO_ = 2000; // leitura em blocos (memória do Apps Script)
var EMAGRECER_PREFIXO_TESTES_ = 'aux_tests';
var EMAGRECER_ABAS_SEM_USO_ = ['[RV] Metas de compra e venda']; // 29/10/2026: o Tiago não usa (os painéis 📈Dash ele usa: ficam)

/** Última linha com algum valor DIGITADO (célula sem fórmula) - 0 se não tiver nenhum. */
function ultimaLinhaDigitada_(aba) {
  var ultimaL = aba.getLastRow(), maxC = Math.max(aba.getLastColumn(), 1), ultima = 0;
  for (var ini = 1; ini <= ultimaL; ini += EMAGRECER_LINHAS_POR_BLOCO_) {
    var n = Math.min(EMAGRECER_LINHAS_POR_BLOCO_, ultimaL - ini + 1);
    var rg = aba.getRange(ini, 1, n, maxC);
    var fs = rg.getFormulas(), vs = rg.getValues();
    for (var i = 0; i < n; i++) for (var j = 0; j < maxC; j++) if (!fs[i][j] && vs[i][j] !== '' && vs[i][j] !== null) { ultima = ini + i; break; }
  }
  return ultima;
}

function simularEmagrecerPlanilhaDireto() {
  var r = emagrecerPlanilha_(SpreadsheetApp.getActiveSpreadsheet(), { executar: false });
  Logger.log(textoRelatorioEmagrecer_(r));
  return r;
}

function emagrecerPlanilhaDireto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var copia = copiaDeSegurancaEmagrecer_(ss);
  var trava = travaRecurso_('carteira', 'emagrecer a planilha');
  trava.waitLock(30000);
  var r;
  try {
    r = emagrecerPlanilha_(ss, { executar: true });
  } finally {
    trava.releaseLock();
    // mesmo se parar no meio, o que já foi apagado mudou a planilha: os caches/publicação precisam saber
    try { if (typeof registrarEscritaPlanilha_ === 'function') registrarEscritaPlanilha_(); } catch (eReg0) { /* só cache */ }
  }
  r.copiaDeSeguranca = copia;
  try { if (typeof registrarEscritaPlanilha_ === 'function') registrarEscritaPlanilha_(); } catch (eReg) { /* cache é só otimização */ }
  try {
    if (typeof gravarRegistroControle_ === 'function') {
      gravarRegistroControle_('Sucesso', 'Manual', 'Planilha emagrecida: ' + r.formulasRemovidas + ' fórmulas removidas (' + r.hojeRemovidos + ' HOJE()); cópia de segurança: ' + copia.nome);
    }
  } catch (eR) { /* ok */ }
  Logger.log(textoRelatorioEmagrecer_(r));
  return r;
}

/**
 * Cópia de segurança ANTES de mexer, na pasta "investiments-dados" (ExportarPlanilha.gs). { id, nome, url, tipo }.
 * 29/10/2026 (Tiago: "DriveApp.File.makeCopy precisa de https://www.googleapis.com/auth/drive"): o projeto só tem
 * drive.readonly + drive.file - sem escopo novo (que daria acesso a TODO o Drive). Tenta a cópia nativa pela API REST do
 * Drive (planilha do Google, com fórmulas e GOOGLEFINANCE); se o Google recusar, grava um .xlsx NOVO (não o da cópia diária).
 * Sem cópia, não executa. (O histórico de versões da planilha também guarda o estado de antes.)
 */
function copiaDeSegurancaEmagrecer_(ss) {
  var quando = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm');
  var nome = ss.getName() + ' - cópia antes de emagrecer ' + quando;
  var pastaId = pastaCopiaXlsx_();
  var c = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(ss.getId()) + '/copy?fields=id,webViewLink', {
    method: 'post', contentType: 'application/json', headers: cabecalhoAuthDrive_(), muteHttpExceptions: true,
    payload: JSON.stringify({ name: nome, parents: [pastaId] })
  });
  if (c.getResponseCode() === 200) {
    var m = JSON.parse(c.getContentText());
    return { id: m.id, nome: nome, url: m.webViewLink || ('https://docs.google.com/spreadsheets/d/' + m.id), tipo: 'planilha do Google' };
  }
  Logger.log('Cópia nativa recusada (' + c.getResponseCode() + '): ' + c.getContentText().slice(0, 200) + ' - gravando .xlsx');
  var cr = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'post', contentType: 'application/json', headers: cabecalhoAuthDrive_(), muteHttpExceptions: true,
    payload: JSON.stringify({ name: nome + '.xlsx', parents: [pastaId], mimeType: MIME_XLSX_ })
  });
  if (cr.getResponseCode() !== 200) throw erroDriveCopia_('criar a cópia de segurança', cr);
  var arq = JSON.parse(cr.getContentText());
  var blob = blobXlsxDaPlanilha_();
  blob.setContentType(MIME_XLSX_);
  var up = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(arq.id) + '?uploadType=media&fields=id,size', {
    method: 'patch', contentType: MIME_XLSX_, headers: cabecalhoAuthDrive_(), payload: blob, muteHttpExceptions: true
  });
  if (up.getResponseCode() !== 200) throw erroDriveCopia_('gravar a cópia de segurança', up);
  if (!(Number(JSON.parse(up.getContentText()).size) > 0)) throw new Error('A cópia de segurança ficou vazia - nada foi alterado.');
  return { id: arq.id, nome: nome + '.xlsx', url: arq.webViewLink || '', tipo: '.xlsx' };
}

/**
 * O núcleo (testado em tests/harness/emagrecer-planilha.test.js). opcoes: { executar, margem }.
 * Devolve { executado, margem, abas: [...], testes: [...], formulasRemovidas, hojeRemovidos }.
 */
function emagrecerPlanilha_(ss, opcoes) {
  var o = opcoes || {};
  var margem = o.margem == null ? EMAGRECER_MARGEM_LINHAS_ : Math.max(0, Number(o.margem) || 0);
  var saida = { executado: !!o.executar, margem: margem, abas: [], testes: [], formulasRemovidas: 0, hojeRemovidos: 0 };
  Object.keys(LANC_ABAS).forEach(function (k) {
    var cfg = LANC_ABAS[k];
    var aba = ss.getSheetByName(cfg.aba);
    if (!aba) return;
    var r = emagrecerAbaLancamentos_(aba, cfg, margem, !!o.executar);
    saida.abas.push(r);
    saida.formulasRemovidas += r.formulasRemovidas;
    saida.hojeRemovidos += r.hojeRemovidos;
  });
  // 29/10/2026 (Tiago: "[RV] Metas de compra e venda? não uso"): abas sem uso - fórmula só até a última linha com valor
  // DIGITADO, sem margem (a aba tinha dado até a linha 9 e fórmula até a 100: ~360 GOOGLEFINANCE em linha vazia)
  EMAGRECER_ABAS_SEM_USO_.forEach(function (nome) {
    var aba = ss.getSheetByName(nome);
    if (!aba) return;
    var r = emagrecerAbaLancamentos_(aba, { aba: nome, linha: 1, cols: 0, ultima: ultimaLinhaDigitada_(aba) }, 0, !!o.executar);
    r.semUso = true;
    saida.abas.push(r);
    saida.formulasRemovidas += r.formulasRemovidas;
    saida.hojeRemovidos += r.hojeRemovidos;
  });
  ss.getSheets().forEach(function (aba) {
    if (String(aba.getName()).indexOf(EMAGRECER_PREFIXO_TESTES_) !== 0) return;
    var r = emagrecerAbaTestes_(aba, !!o.executar);
    saida.testes.push(r);
    saida.formulasRemovidas += r.formulasRemovidas;
  });
  return saida;
}

function contarGfEmagrecer_(f) {
  var m = String(f).toUpperCase().match(/\bGOOGLEFINANCE\s*\(/g);
  return m ? m.length : 0;
}

function contarHojeEmagrecer_(f) {
  var m = String(f).toUpperCase().match(/\b(HOJE|TODAY)\s*\(/g);
  return m ? m.length : 0;
}

function emagrecerAbaLancamentos_(aba, cfg, margem, executar) {
  var colunas = [];
  for (var c = 1; c <= cfg.cols; c++) colunas.push(c);
  var ultima = cfg.ultima != null ? cfg.ultima : ultimaLinhaReal_(aba, colunas, cfg.linha);
  var corte = Math.max(ultima, cfg.linha - 1) + margem; // da linha corte+1 pra baixo, sem fórmula
  var maxLinhas = aba.getMaxRows();
  var maxCols = aba.getLastColumn();
  var r = { aba: cfg.aba, ultimaLinhaComDado: ultima, manterAte: Math.min(corte, maxLinhas), linhasNaAba: maxLinhas,
    formulasRemovidas: 0, hojeRemovidos: 0, hojeQueFicam: 0, colunas: [], colunasComValorDigitado: [] };
  // HOJE() nas linhas que continuam com fórmula (com dado + margem): só conta - é o próximo passo, se ainda pesar
  for (var a = cfg.linha; a <= Math.min(corte, maxLinhas) && maxCols > 0; a += EMAGRECER_LINHAS_POR_BLOCO_) {
    var na = Math.min(EMAGRECER_LINHAS_POR_BLOCO_, Math.min(corte, maxLinhas) - a + 1);
    aba.getRange(a, 1, na, maxCols).getFormulas().forEach(function (l) { l.forEach(function (f) { if (f) r.hojeQueFicam += contarHojeEmagrecer_(f); }); });
  }
  if (corte >= maxLinhas || maxCols < 1) return r;
  var porColuna = [];
  for (var j = 0; j < maxCols; j++) porColuna.push({ formulas: 0, hoje: 0, gf: 0, digitados: 0, exemplo: '' });
  for (var ini = corte + 1; ini <= maxLinhas; ini += EMAGRECER_LINHAS_POR_BLOCO_) {
    var n = Math.min(EMAGRECER_LINHAS_POR_BLOCO_, maxLinhas - ini + 1);
    var rg = aba.getRange(ini, 1, n, maxCols);
    var fs = rg.getFormulas();
    var vs = rg.getValues();
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < maxCols; k++) {
        var p = porColuna[k];
        if (fs[i][k]) {
          p.formulas++;
          p.hoje += contarHojeEmagrecer_(fs[i][k]);
          p.gf += contarGfEmagrecer_(fs[i][k]);
          if (!p.exemplo) p.exemplo = fs[i][k];
        } else if (vs[i][k] !== '' && vs[i][k] !== null) {
          p.digitados++;
        }
      }
    }
  }
  var limpar = [];
  porColuna.forEach(function (p, k) {
    if (!p.formulas) return;
    var letra = letraColunaEmagrecer_(k + 1);
    if (p.digitados) { r.colunasComValorDigitado.push({ coluna: letra, formulas: p.formulas, digitados: p.digitados }); return; }
    r.colunas.push({ coluna: letra, formulas: p.formulas, hoje: p.hoje, gf: p.gf, exemplo: String(p.exemplo).slice(0, 120) });
    r.formulasRemovidas += p.formulas;
    r.hojeRemovidos += p.hoje;
    limpar.push(k + 1);
  });
  if (executar) {
    // colunas vizinhas numa chamada só
    var i0 = 0;
    while (i0 < limpar.length) {
      var i1 = i0;
      while (i1 + 1 < limpar.length && limpar[i1 + 1] === limpar[i1] + 1) i1++;
      aba.getRange(corte + 1, limpar[i0], maxLinhas - corte, limpar[i1] - limpar[i0] + 1).clearContent();
      i0 = i1 + 1;
    }
  }
  return r;
}

/** aux_tests*: fica só o cabeçalho (linha 1) - os testes manuais gravam logo abaixo dele. */
function emagrecerAbaTestes_(aba, executar) {
  var maxLinhas = aba.getMaxRows();
  var maxCols = Math.max(aba.getLastColumn(), 1);
  var r = { aba: aba.getName(), linhasNaAba: maxLinhas, formulasRemovidas: 0, linhasRemovidas: 0 };
  for (var ini = 2; ini <= maxLinhas; ini += EMAGRECER_LINHAS_POR_BLOCO_) {
    var n = Math.min(EMAGRECER_LINHAS_POR_BLOCO_, maxLinhas - ini + 1);
    aba.getRange(ini, 1, n, maxCols).getFormulas().forEach(function (l) { l.forEach(function (f) { if (f) r.formulasRemovidas++; }); });
  }
  // 29/10/2026 (bug: "Não é possível excluir todas as linhas não congeladas"): a aba tem linhas congeladas - o Sheets
  // exige ao menos 1 linha NÃO congelada. Ficam as congeladas + 1 (vazia).
  var congeladas = typeof aba.getFrozenRows === 'function' ? (Number(aba.getFrozenRows()) || 0) : 0;
  var ficam = Math.max(2, congeladas + 1);
  if (maxLinhas > ficam) r.linhasRemovidas = maxLinhas - ficam;
  var limparDe = Math.max(2, congeladas + 1); // linhas congeladas = cabeçalho: não apaga
  if (executar && maxLinhas >= limparDe) {
    aba.getRange(limparDe, 1, maxLinhas - limparDe + 1, maxCols).clearContent();
    if (maxLinhas > ficam) aba.deleteRows(ficam + 1, maxLinhas - ficam);
  }
  return r;
}

function letraColunaEmagrecer_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function textoRelatorioEmagrecer_(r) {
  var l = [(r.executado ? 'FEITO' : 'SIMULAÇÃO (nada foi alterado)') + ' - margem de ' + r.margem + ' linhas vazias com fórmula',
    'Fórmulas a remover: ' + r.formulasRemovidas + ' (HOJE(): ' + r.hojeRemovidos + ')'];
  r.abas.forEach(function (a) {
    l.push('- ' + a.aba + ': dados até a linha ' + a.ultimaLinhaComDado + ', fórmulas ficam até a ' + a.manterAte + ' (a aba tem ' + a.linhasNaAba + ' linhas); remove ' + a.formulasRemovidas);
    a.colunas.forEach(function (c) { l.push('    ' + c.coluna + ': ' + c.formulas + (c.hoje ? ' (HOJE: ' + c.hoje + ')' : '') + (c.gf ? ' (GOOGLEFINANCE: ' + c.gf + ')' : '') + '  ex.: ' + c.exemplo); });
    a.colunasComValorDigitado.forEach(function (c) { l.push('    ' + c.coluna + ': NÃO mexi - ' + c.digitados + ' valor(es) digitado(s) abaixo da última linha'); });
  });
  r.testes.forEach(function (t) { l.push('- ' + t.aba + ': fica só o cabeçalho; remove ' + t.formulasRemovidas + ' fórmulas e ' + t.linhasRemovidas + ' linhas'); });
  if (r.copiaDeSeguranca) l.push('Cópia de segurança (' + r.copiaDeSeguranca.tipo + ', pasta investiments-dados): ' + r.copiaDeSeguranca.nome + ' - ' + r.copiaDeSeguranca.url);
  return l.join('\n');
}

/**
 * Linhas recém-gravadas (primeira..ultima) que ficaram sem as fórmulas das colunas calculadas (depois de cfg.cols) recebem
 * as da linha com fórmula mais próxima acima. Com a margem do emagrecimento, normalmente não faz nada.
 */
function garantirFormulasLanc_(aba, cfg, primeira, ultima) {
  try {
    var maxCols = aba.getLastColumn();
    var c0 = cfg.cols + 1;
    if (maxCols < c0 || ultima < primeira) return 0;
    var nCols = maxCols - c0 + 1;
    var fs = aba.getRange(primeira, c0, ultima - primeira + 1, nCols).getFormulas();
    var vazias = [];
    fs.forEach(function (l, i) { if (l.every(function (f) { return !f; })) vazias.push(primeira + i); });
    if (!vazias.length) return 0;
    var modelo = 0;
    var topo = Math.max(cfg.linha, primeira - 1 - 200);
    if (primeira - 1 >= topo) {
      var acima = aba.getRange(topo, c0, primeira - topo, nCols).getFormulas();
      for (var i = acima.length - 1; i >= 0 && !modelo; i--) if (acima[i].some(function (f) { return !!f; })) modelo = topo + i;
    }
    if (!modelo) return 0;
    vazias.forEach(function (linha) { copiarFormulasLinha_(aba, modelo, linha, c0, maxCols); });
    return vazias.length;
  } catch (e) {
    Logger.log('garantirFormulasLanc_: ' + e);
    return 0;
  }
}

/**
 * 29/10/2026 (próximo passo do ADR-08: "a DB-Stocks ainda tem ~145 mil fórmulas"): SÓ LÊ. Conta, por aba, as fórmulas,
 * as funções que recalculam sozinhas (HOJE/AGORA/GOOGLEFINANCE/IMPORT...) e quantas fórmulas estão abaixo da última
 * linha com valor digitado (candidatas a sair). Rode no editor e mande o log.
 */
function diagnosticarFormulasPlanilhaDireto() {
  var r = diagnosticarFormulasPlanilha_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log(textoDiagnosticoFormulas_(r));
  return r;
}

var EMAGRECER_VOLATEIS_ = /\b(HOJE|TODAY|AGORA|NOW|GOOGLEFINANCE|IMPORTXML|IMPORTHTML|IMPORTDATA|IMPORTRANGE|IMPORTFEED|ALEATÓRIO|RAND|RANDBETWEEN|ALEATÓRIOENTRE|INDIRETO|INDIRECT|DESLOC|OFFSET)\s*\(/gi;

function diagnosticarFormulasPlanilha_(ss) {
  var abas = ss.getSheets().map(function (aba) {
    var maxL = aba.getMaxRows(), maxC = Math.max(aba.getLastColumn(), 1), ultimaL = aba.getLastRow();
    var r = { aba: aba.getName(), linhas: maxL, colunas: maxC, ultimaLinha: ultimaL, formulas: 0, volateis: {}, ultimaComDigitado: 0, formulasAbaixoDoDigitado: 0 };
    var porLinha = []; // fórmulas por linha (pra contar as que ficam abaixo da última linha digitada)
    for (var ini = 1; ini <= ultimaL; ini += EMAGRECER_LINHAS_POR_BLOCO_) {
      var n = Math.min(EMAGRECER_LINHAS_POR_BLOCO_, ultimaL - ini + 1);
      var rg = aba.getRange(ini, 1, n, maxC);
      var fs = rg.getFormulas(), vs = rg.getValues();
      for (var i = 0; i < n; i++) {
        var nf = 0, digitado = false;
        for (var j = 0; j < maxC; j++) {
          var f = fs[i][j];
          if (f) {
            nf++;
            var m = String(f).match(EMAGRECER_VOLATEIS_);
            if (m) m.forEach(function (x) { var k = x.replace(/\s*\($/, '').toUpperCase(); r.volateis[k] = (r.volateis[k] || 0) + 1; });
          } else if (vs[i][j] !== '' && vs[i][j] !== null) digitado = true;
        }
        r.formulas += nf;
        porLinha.push(nf);
        if (digitado) r.ultimaComDigitado = ini + i;
      }
    }
    for (var k = r.ultimaComDigitado; k < porLinha.length; k++) r.formulasAbaixoDoDigitado += porLinha[k];
    return r;
  });
  abas.sort(function (a, b) { return b.formulas - a.formulas; });
  var total = abas.reduce(function (s, a) { return s + a.formulas; }, 0);
  return { total: total, abas: abas };
}

function textoDiagnosticoFormulas_(r) {
  var l = ['Fórmulas na planilha: ' + r.total + ' (só leitura - nada foi alterado)'];
  r.abas.filter(function (a) { return a.formulas > 0; }).forEach(function (a) {
    var vol = Object.keys(a.volateis).map(function (k) { return k + ' ' + a.volateis[k]; }).join(', ');
    l.push('- ' + a.aba + ': ' + a.formulas + ' fórmulas; ' + a.linhas + ' linhas (dados até a ' + a.ultimaLinha + ', digitado até a ' + a.ultimaComDigitado + ')' +
      (a.formulasAbaixoDoDigitado ? '; ' + a.formulasAbaixoDoDigitado + ' abaixo do último digitado' : '') + (vol ? '; recalculam sozinhas: ' + vol : ''));
  });
  return l.join('\n');
}
