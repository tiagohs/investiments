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

/**
 * diagnosticarSplitsELinks — script de uso único (14/09/2026), mesmo
 * padrão do diagnosticarColunasMeusAtivos acima: roda no editor, olha
 * o Log, cola de volta no chat, depois pode apagar.
 *
 * Confirma a estrutura real de 2 coisas novas que o Tiago pediu:
 *  - As 2 tabelas de "distribuição desejada" dentro de cada classe de
 *    ativo (Ações: Nacionais x Internacionais, "inicia em B33"; FIIs:
 *    Tijolo x Híbrido x Papel, "inicia em B72") — a expectativa, pelo
 *    mesmo padrão já confirmado em montarObjetivosCarteira_ (B11:G13 e
 *    B19:G20), é colunas B:G = Tipo / %desejado / %atual / carteira
 *    atual R$ / nova carteira R$ / R$ investir, com uma linha de total
 *    logo após a última linha do bloco — mas isso é suposição até
 *    confirmar aqui.
 *  - Os 4 links de "carteira recomendada" da Suno (C38, C39, C54, C79)
 *    — dump tanto o valor quanto o link (getRichTextValue().getLinkUrl())
 *    pra saber se é hyperlink na própria célula ou só texto/URL puro.
 */
function diagnosticarSplitsELinks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dm = ss.getSheetByName('Distribuição e Metas');
  if (!dm) { Logger.log('ABA NAO ENCONTRADA: "Distribuição e Metas"'); return; }

  function dump(a1) {
    var valores = dm.getRange(a1).getValues();
    Logger.log('=== Distribuição e Metas ! ' + a1 + ' ===');
    valores.forEach(function (linha, i) {
      Logger.log((i) + ': ' + JSON.stringify(linha));
    });
  }

  function dumpLink(celula) {
    var range = dm.getRange(celula);
    var valor = range.getValue();
    var rich = range.getRichTextValue();
    var link = rich ? rich.getLinkUrl() : null;
    Logger.log('=== link ' + celula + ' === valor: ' + JSON.stringify(valor) + ' | link: ' + JSON.stringify(link));
  }

  // Split Ações (Nacionais x Internacionais) — começa um pouco antes de
  // B33 pra pegar título/cabeçalho, e vai até depois da linha 41 (onde
  // já sabemos que começa o cabeçalho do Radar Ações Nacionais) pra
  // pegar os links C38/C39 no meio do caminho.
  dump('B29:H41');

  // Split FIIs (Tijolo/Híbrido/Papel) — mesma lógica, até a linha 81
  // (cabeçalho do Radar FIIs).
  dump('B68:H81');

  // Área da tabela Ações Internacionais (radar header B58) — pra achar
  // o link C54 no contexto.
  dump('B50:H58');

  // Os 4 links, com valor + URL do hyperlink (se houver).
  dumpLink('C38');
  dumpLink('C39');
  dumpLink('C54');
  dumpLink('C79');
}
