/**
 * DiagnosticoAtivos.gs — script de uso único (roda no editor, olha o
 * Log, depois pode apagar) pra confirmar, célula a célula, a estrutura
 * real das abas que a nova aba auxiliar consolidada vai precisar ler:
 *
 *  - Distribuição e Metas: as 3 tabelas do Radar de oportunidades
 *    (Ações, Ações EUA, FIIs) — é de lá que vem Preço Teto e Viés.
 *  - Carteira Ações / Carteira FIIs / Carteira Ações USA — de lá vem
 *    Nome, Quantidade, Preço Médio, P/VP, P/L (pra calcular os
 *    "Desconto sobre X" do tooltip) e, no caso de FIIs, o Tipo.
 *
 * Não sei ainda a linha exata do cabeçalho de cada tabela do Radar
 * (só sei o range aproximado, B41:S54 etc., pelas anotações antigas) —
 * por isso o dump começa um pouco antes do range documentado, pra
 * pegar o cabeçalho de qualquer jeito. Roda uma vez, cola o resultado
 * (Ver > Registros / Ctrl+Enter) de volta no chat.
 */
function diagnosticarColunasMeusAtivos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  function dump(nomeAba, a1) {
    var aba = ss.getSheetByName(nomeAba);
    if (!aba) { Logger.log('ABA NAO ENCONTRADA: "' + nomeAba + '"'); return; }
    var valores = aba.getRange(a1).getValues();
    Logger.log('=== ' + nomeAba + ' ! ' + a1 + ' ===');
    valores.forEach(function (linha, i) {
      Logger.log(i + ': ' + JSON.stringify(linha));
    });
  }

  // Radar de oportunidades — Ações, Ações EUA, FIIs (começa um pouco
  // antes do range documentado pra garantir que pega o cabeçalho)
  dump('Distribuição e Metas', 'B38:S46');
  dump('Distribuição e Metas', 'B55:Q62');
  dump('Distribuição e Metas', 'B78:S86');

  // Carteiras — cabeçalho + primeiras linhas de verdade
  dump('Carteira Ações', 'A1:V12');
  dump('Carteira FIIs', 'A1:T12');
  dump('Carteira Ações USA', 'A1:S10');
}
