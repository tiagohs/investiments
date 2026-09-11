/**
 * Macros.gs — macros gravadas manualmente na planilha (fora do Web App).
 */

function ordemcrono() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('B7').activate();
  spreadsheet.getActiveSheet().getFilter().sort(2, true);
};
