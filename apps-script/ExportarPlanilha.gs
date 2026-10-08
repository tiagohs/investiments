/**
 * ExportarPlanilha.gs — 08/10/2026 (Tiago: "teria alguma forma de você se conectar à planilha atualizada sem que eu
 * precise ficar enviando aqui manualmente?").
 *
 * Uma planilha do Google no Drive para desktop vira só um atalho .gsheet no Mac (sem dado nenhum). Aqui o script gera uma
 * CÓPIA .xlsx de verdade da planilha numa pasta do Drive ("investiments-dados"), todo dia e quando chamado. O Drive para
 * desktop sincroniza esse arquivo pro Mac, onde os testes e o Claude leem (tests/harness/extrair-fixtures.py) - sem
 * exportar à mão.
 *
 * Tudo pela API REST do Drive (UrlFetchApp + ScriptApp.getOAuthToken), com o escopo drive.file: o script só enxerga e
 * altera o que ELE criou (a pasta e o .xlsx) - nunca os seus outros arquivos. O mesmo arquivo é atualizado no lugar
 * (mesmo ID), então o Drive não enche de cópias nem a lixeira.
 *
 *   exportarCopiaXlsxDireto()     roda agora (o log mostra o tamanho e onde ficou)
 *   instalarCopiaDiariaDireto()   1x: gatilho diário (~13h, depois das sincronizações da manhã)
 */

var COPIA_PASTA_NOME_ = 'investiments-dados';
var COPIA_ARQUIVO_NOME_ = 'Investimentos - Controle.xlsx';
var PROP_COPIA_PASTA_ID_ = 'COPIA_XLSX_PASTA_ID';
var PROP_COPIA_ARQUIVO_ID_ = 'COPIA_XLSX_ARQUIVO_ID';
var MIME_XLSX_ = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 08/10/2026: 403 "insufficient authentication scopes" = o projeto ainda não tem (ou não foi autorizado com) o drive.file. */
function erroDriveCopia_(acao, resposta) {
  var txt = resposta.getContentText();
  if (resposta.getResponseCode() === 403 && /insufficient|scope/i.test(txt)) {
    return new Error('Falta a permissão "drive.file" pra ' + acao + '. No editor, rode autorizarProjetoDireto e aceite TODAS as caixas (o log diz o que o Google deu), e tente de novo.');
  }
  return new Error('Não consegui ' + acao + ': ' + txt.slice(0, 300));
}

function cabecalhoAuthDrive_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

/** Metadados de um arquivo/pasta pelo ID (null se sumiu, foi pra lixeira ou o script não enxerga mais). */
function metadadosDrive_(id) {
  if (!id) return null;
  var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,name,trashed,size,modifiedTime',
    { headers: cabecalhoAuthDrive_(), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  var m = JSON.parse(r.getContentText());
  return m.trashed ? null : m;
}

/** A pasta "investiments-dados" (criada pelo script na raiz do Meu Drive na 1ª vez; o ID fica nas Propriedades). */
function pastaCopiaXlsx_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_COPIA_PASTA_ID_);
  if (metadadosDrive_(id)) return id;
  var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'post', contentType: 'application/json', headers: cabecalhoAuthDrive_(), muteHttpExceptions: true,
    payload: JSON.stringify({ name: COPIA_PASTA_NOME_, mimeType: 'application/vnd.google-apps.folder' })
  });
  if (r.getResponseCode() !== 200) throw erroDriveCopia_('criar a pasta "' + COPIA_PASTA_NOME_ + '" no Drive', r);
  id = JSON.parse(r.getContentText()).id;
  props.setProperty(PROP_COPIA_PASTA_ID_, id);
  props.deleteProperty(PROP_COPIA_ARQUIVO_ID_); // pasta nova: o arquivo antigo (se havia) era de outra pasta
  return id;
}

/** O .xlsx da planilha inteira, como o Google exporta (o mesmo que Arquivo › Fazer download › .xlsx). */
function blobXlsxDaPlanilha_() {
  var id = SpreadsheetApp.getActiveSpreadsheet().getId();
  var r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
    { headers: cabecalhoAuthDrive_(), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('O Google não exportou a planilha (' + r.getResponseCode() + ')');
  return r.getBlob();
}

/**
 * Grava `blob` no .xlsx da pasta: atualiza o mesmo arquivo (mesmo ID) ou, na 1ª vez, cria o arquivo vazio e envia o
 * conteúdo. O blob vai direto como corpo (sem copiar os ~13 MB pra uma lista de bytes). Devolve { id, size, modifiedTime }.
 */
function gravarCopiaXlsx_(blob, pastaId) {
  var props = PropertiesService.getScriptProperties();
  var arquivoId = props.getProperty(PROP_COPIA_ARQUIVO_ID_);
  if (!metadadosDrive_(arquivoId)) {
    var cr = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'post', contentType: 'application/json', headers: cabecalhoAuthDrive_(), muteHttpExceptions: true,
      payload: JSON.stringify({ name: COPIA_ARQUIVO_NOME_, parents: [pastaId], mimeType: MIME_XLSX_ })
    });
    if (cr.getResponseCode() !== 200) throw erroDriveCopia_('criar a cópia no Drive', cr);
    arquivoId = JSON.parse(cr.getContentText()).id;
    props.setProperty(PROP_COPIA_ARQUIVO_ID_, arquivoId);
  }
  blob.setContentType(MIME_XLSX_);
  var up = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(arquivoId) + '?uploadType=media&fields=id,size,modifiedTime', {
    method: 'patch', contentType: MIME_XLSX_, headers: cabecalhoAuthDrive_(), payload: blob, muteHttpExceptions: true
  });
  if (up.getResponseCode() !== 200) throw erroDriveCopia_('gravar a cópia no Drive', up);
  return JSON.parse(up.getContentText());
}

/** Gera a cópia agora. Devolve { pasta, arquivo, bytes, quando }. */
function exportarCopiaXlsx_() {
  var pastaId = pastaCopiaXlsx_();
  var blob = blobXlsxDaPlanilha_();
  var r = gravarCopiaXlsx_(blob, pastaId);
  return { pasta: COPIA_PASTA_NOME_, arquivo: COPIA_ARQUIVO_NOME_, id: r.id, bytes: Number(r.size) || 0, quando: r.modifiedTime || new Date().toISOString() };
}

/** 08/10/2026: no editor, se o drive.file (ou a internet) ainda não foi aceito, abre a janela de permissão em vez de dar 403. */
function pedirPermissoesCopia_() {
  if (typeof ScriptApp.requireScopes === 'function') {
    ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/script.external_request']);
  }
}

function exportarCopiaXlsxDireto() {
  pedirPermissoesCopia_();
  var r = exportarCopiaXlsx_();
  Logger.log('Cópia gravada: Meu Drive/' + r.pasta + '/' + r.arquivo + ' (' + Math.round(r.bytes / 1024 / 1024 * 10) / 10 + ' MB, ' + r.quando + ')');
  return r;
}

/** Gatilho diário (não grava na planilha - não mexe na geração dos dados). */
function gatilhoCopiaXlsxDiaria() {
  try { exportarCopiaXlsx_(); } catch (e) { Logger.log('gatilhoCopiaXlsxDiaria: ' + e); }
}

function instalarCopiaDiariaDireto() {
  pedirPermissoesCopia_();
  var existe = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'gatilhoCopiaXlsxDiaria'; });
  if (!existe) ScriptApp.newTrigger('gatilhoCopiaXlsxDiaria').timeBased().everyDays(1).atHour(13).nearMinute(10).create();
  Logger.log(existe ? 'O gatilho da cópia diária já existia.' : 'Gatilho instalado: cópia .xlsx todo dia ~13h.');
  return exportarCopiaXlsxDireto();
}
