/**
 * HistoricoInicio.gs — junta os três históricos (Renda Variável, Renda
 * Fixa e Ibovespa) numa série diária única, mais as curvas de CDI e SELIC
 * (base 100, compostas dia a dia) pros benchmarks da Home.
 *
 * Depende de buscarFatoresDiariosBcb_ e formatarDataBcbRF_, que vivem no
 * BackfillRendaFixa.gs — não precisa redefinir, é o mesmo projeto
 * (namespace global compartilhado entre todos os arquivos .gs).
 *
 * Renda Variável (ações/FIIs/USA, via aux_historico-patrimonio) e
 * Ibovespa (via aux_historico-indices) só fecham em dia de pregão, então
 * nos fins de semana/feriados "carrega" o último valor conhecido pra
 * frente (forward-fill). Renda Fixa (via aux_historico-renda-fixa) é
 * calculada dia a dia sem lacuna (o backfill gera uma linha pra cada dia
 * corrido), então usa o valor do próprio dia direto, sem forward-fill.
 *
 * Testado em 12/09/2026: 2090 dias (22/12/2020 -> 11/09/2026), primeiro
 * dia zerado (antes da 1ª movimentação real), último dia com
 * longoPrazo + rendaEmergencial = patrimonio batendo exato.
 */

var ABA_PATRIMONIO_INICIO = 'aux_historico-patrimonio';
var ABA_RENDA_FIXA_INICIO = 'aux_historico-renda-fixa';
var ABA_INDICES_INICIO = 'aux_historico-indices';

function handleHistoricoInicio(e) {
  var auth = verificarToken(e.parameter.token);
  if (!auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth.erro });
  try {
    return jsonOut({ ok: true, serie: montarSerieHistoricoInicio_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'historicoInicio', erro: String(err) });
  }
}

function testarHistoricoInicioDireto() {
  var serie = montarSerieHistoricoInicio_();
  Logger.log('Total de dias: ' + serie.length);
  Logger.log('Primeiro dia: ' + JSON.stringify(serie[0]));
  Logger.log('Último dia: ' + JSON.stringify(serie[serie.length - 1]));
}

function montarSerieHistoricoInicio_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var porDiaVariavel = {};         // chave -> soma Valor BRL (Ações/FIIs/USA)
  var porDiaRendaFixaTotal = {};   // chave -> soma Valor BRL (todas as posições RF)
  var porDiaRendaEmergencial = {}; // chave -> soma Valor BRL (só Classificação = Renda Emergencial)
  var porDiaIbovespa = {};         // chave -> valor do Ibovespa

  // 1) aux_historico-patrimonio (Renda Variável: Ações/FIIs/USA)
  var abaPatrimonio = ss.getSheetByName(ABA_PATRIMONIO_INICIO);
  if (!abaPatrimonio) throw new Error('aba não encontrada: ' + ABA_PATRIMONIO_INICIO);
  var linhasPatrimonio = Math.max(abaPatrimonio.getLastRow() - 1, 0);
  if (linhasPatrimonio > 0) {
    abaPatrimonio.getRange(2, 1, linhasPatrimonio, 8).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      var chave = chaveDiaISOInicio_(data);
      var valorBrl = Number(linha[7]) || 0;
      porDiaVariavel[chave] = (porDiaVariavel[chave] || 0) + valorBrl;
    });
  }

  // 2) aux_historico-renda-fixa (calculado dia a dia, sem lacunas — não
  // precisa de forward-fill, ao contrário da Renda Variável e do Ibovespa)
  var abaRendaFixa = ss.getSheetByName(ABA_RENDA_FIXA_INICIO);
  if (!abaRendaFixa) throw new Error('aba não encontrada: ' + ABA_RENDA_FIXA_INICIO);
  var linhasRendaFixa = Math.max(abaRendaFixa.getLastRow() - 1, 0);
  if (linhasRendaFixa > 0) {
    abaRendaFixa.getRange(2, 1, linhasRendaFixa, 6).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      var chave = chaveDiaISOInicio_(data);
      var classificacao = linha[4];
      var valorBrl = Number(linha[5]) || 0;
      porDiaRendaFixaTotal[chave] = (porDiaRendaFixaTotal[chave] || 0) + valorBrl;
      if (classificacao === 'Renda Emergencial') {
        porDiaRendaEmergencial[chave] = (porDiaRendaEmergencial[chave] || 0) + valorBrl;
      }
    });
  }

  // 3) aux_historico-indices (só Ibovespa por enquanto)
  var abaIndices = ss.getSheetByName(ABA_INDICES_INICIO);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_INDICES_INICIO);
  var linhasIndices = Math.max(abaIndices.getLastRow() - 1, 0);
  if (linhasIndices > 0) {
    abaIndices.getRange(2, 1, linhasIndices, 3).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      if (linha[1] !== 'Ibovespa') return;
      var chave = chaveDiaISOInicio_(data);
      porDiaIbovespa[chave] = Number(linha[2]) || null;
    });
  }

  var todasAsChaves = Object.keys(porDiaVariavel)
    .concat(Object.keys(porDiaRendaFixaTotal))
    .concat(Object.keys(porDiaIbovespa));
  if (todasAsChaves.length === 0) return [];
  todasAsChaves.sort();

  var primeiraData = new Date(todasAsChaves[0]);
  var ultimaData = new Date(todasAsChaves[todasAsChaves.length - 1]);

  // 4) fatores diários de CDI e SELIC via BCB (reaproveita função do BackfillRendaFixa.gs)
  var fatoresCdi = buscarFatoresDiariosBcb_(12, primeiraData, ultimaData);
  var fatoresSelic = buscarFatoresDiariosBcb_(11, primeiraData, ultimaData);

  var serie = [];
  var indiceCdi = 100;
  var indiceSelic = 100;
  var ultimoVariavel = 0;
  var ultimoIbovespa = null;

  var dataAtual = new Date(primeiraData);
  while (dataAtual <= ultimaData) {
    var chaveAtual = chaveDiaISOInicio_(dataAtual);

    // Renda Variável e Ibovespa: fecham só em dia de pregão, então "carrega"
    // o último valor conhecido nos fins de semana/feriados.
    if (chaveAtual in porDiaVariavel) ultimoVariavel = porDiaVariavel[chaveAtual];
    if (chaveAtual in porDiaIbovespa) ultimoIbovespa = porDiaIbovespa[chaveAtual];

    // Renda Fixa: já vem calculada dia a dia (todo santo dia, sem lacuna),
    // então usa o valor do próprio dia direto, sem forward-fill.
    var rendaFixaHoje = porDiaRendaFixaTotal[chaveAtual] || 0;
    var rendaEmergencialHoje = porDiaRendaEmergencial[chaveAtual] || 0;

    var chaveBcb = formatarDataBcbRF_(dataAtual);
    var fatorCdi = fatoresCdi[chaveBcb];
    var fatorSelic = fatoresSelic[chaveBcb];
    if (fatorCdi) indiceCdi *= fatorCdi;
    if (fatorSelic) indiceSelic *= fatorSelic;

    var patrimonioTotal = ultimoVariavel + rendaFixaHoje;

    serie.push({
      data: chaveAtual,
      patrimonio: arredondar2Inicio_(patrimonioTotal),
      longoPrazo: arredondar2Inicio_(patrimonioTotal - rendaEmergencialHoje),
      rendaEmergencial: arredondar2Inicio_(rendaEmergencialHoje),
      indiceCdi: arredondar2Inicio_(indiceCdi),
      indiceSelic: arredondar2Inicio_(indiceSelic),
      ibovespa: ultimoIbovespa
    });

    dataAtual.setDate(dataAtual.getDate() + 1);
  }

  return serie;
}

function chaveDiaISOInicio_(data) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function arredondar2Inicio_(n) {
  return Math.round(n * 100) / 100;
}
