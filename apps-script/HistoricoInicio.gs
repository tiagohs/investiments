/**
 * HistoricoInicio.gs — junta os três históricos (Renda Variável, Renda
 * Fixa e Ibovespa) numa série diária única, mais as curvas de CDI e SELIC
 * (base 100, compostas dia a dia) pros benchmarks da Home.
 *
 * Depende de formatarDataBcbRF_ e lerLinhasHistoricoRendaFixa_, que vivem
 * no BackfillRendaFixa.gs — não precisa redefinir, é o mesmo projeto
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
 *
 * Otimização de 12/09/2026 #1 (lentidão de ~30-60s na ação "home"):
 * montarSerieHistoricoInicio_ agora aceita um parâmetro opcional
 * dadosRendaFixaCache — as linhas já lidas de aux_historico-renda-fixa,
 * pra não ler essa aba de novo quando handleHome (Home.gs) já leu uma vez
 * pra passar também pra montarVariacoesDiaRF_ (MeusAtivos.gs). Chamando
 * essa função sozinha (ação "historico_inicio" via Router.gs) ela continua
 * funcionando igual, sem passar nada — só lê a aba ela mesma.
 *
 * Otimização de 12/09/2026 #2 (a #1 sozinha não bastava — o Tiago apontou
 * que os fatores de CDI/SELIC ainda vinham de 2 fetches diretos pro BCB
 * cobrindo o histórico inteiro TODA chamada, o que não devia ser
 * necessário já que taxa de dia passado não muda): os fatores de CDI/SELIC
 * pararam de vir de buscarFatoresDiariosBcb_ (fetch ao vivo) e passaram a
 * vir de aux_historico-indices (Índice = 'CDI'/'SELIC', Valor = taxa % do
 * dia) — mesmo padrão já usado pelo Ibovespa nessa aba, mantido em dia
 * pelo gatilho diário (ver atualizarTaxasBcbIncremental_, em
 * BackfillIndices.gs). Lidas na MESMA passada de getValues() que já lia o
 * Ibovespa, então não é uma leitura a mais. IMPORTANTE: pra essa aba ter
 * dado de CDI/SELIC, rodarBackfillTaxasBcbDireto() (BackfillIndices.gs)
 * precisa ter rodado pelo menos uma vez — sem isso, os mapas vêm vazios e
 * as curvas de CDI/SELIC ficam em 100 (não erra, só fica sem dado).
 *
 * Otimização de 12/09/2026 #3 (as #1 e #2 derrubaram de ~78s pra ~42s, mas
 * ainda é lento demais pra só ler planilha): o gargalo restante era
 * chaveDiaISOInicio_ chamando Utilities.formatDate(data,
 * Session.getScriptTimeZone(), ...) — e isso é chamado UMA VEZ POR LINHA
 * de aux_historico-patrimonio (dezenas de milhares de linhas: 1 por
 * ticker por dia de pregão) + 1x por linha de aux_historico-renda-fixa +
 * 1x por linha de aux_historico-indices + 2x por dia no loop final
 * (~2090 dias) — total na casa de 60-70 mil chamadas. Utilities.formatDate
 * (e Session.getScriptTimeZone(), chamado de novo a cada vez dentro dela)
 * é uma chamada de SERVIÇO do Apps Script (cruza pro backend, não é JS
 * puro) — em loop isso é um gargalo clássico e conhecido do Apps Script,
 * bem mais caro que o equivalente em JS puro. Troquei por um
 * Intl.DateTimeFormat (nativo do V8, sem cruzar pro backend) criado UMA
 * vez só (cacheado em variável de módulo) e reaproveitado em toda
 * chamada — mesmo fuso (Session.getScriptTimeZone(), lido uma única vez),
 * mesmo formato de saída, só que ordens de grandeza mais rápido em volume
 * alto.
 */

var ABA_PATRIMONIO_INICIO = 'aux_historico-patrimonio';
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

/**
 * @param {Array} dadosRendaFixaCache opcional — linhas de aux_historico-renda-fixa
 *   já lidas por quem chamou (ver handleHome, Home.gs). Se não vier, lê a
 *   aba aqui mesmo (comportamento antigo, usado pela ação "historico_inicio"
 *   sozinha).
 */
function montarSerieHistoricoInicio_(dadosRendaFixaCache) {
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
  // precisa de forward-fill, ao contrário da Renda Variável e do Ibovespa).
  // Reaproveita a leitura de quem chamou, se veio pronta (ver comentário
  // do parâmetro acima) — senão lê aqui mesmo, igual antes.
  var linhasRendaFixa = dadosRendaFixaCache || lerLinhasHistoricoRendaFixa_();
  linhasRendaFixa.forEach(function (linha) {
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

  // 3) aux_historico-indices — Ibovespa (Valor = pontos) e, na MESMA
  // leitura, CDI/SELIC (Valor = taxa % do dia) — ver otimização #2 no
  // cabeçalho do arquivo. Uma passada só de getValues() pros 3.
  var abaIndices = ss.getSheetByName(ABA_INDICES_INICIO);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_INDICES_INICIO);
  var fatoresCdi = {};
  var fatoresSelic = {};
  var linhasIndices = Math.max(abaIndices.getLastRow() - 1, 0);
  if (linhasIndices > 0) {
    abaIndices.getRange(2, 1, linhasIndices, 3).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      var nomeIndice = linha[1];
      var valor = Number(linha[2]);
      if (nomeIndice === 'Ibovespa') {
        var chave = chaveDiaISOInicio_(data);
        porDiaIbovespa[chave] = isNaN(valor) ? null : valor;
      } else if (nomeIndice === 'CDI' && !isNaN(valor)) {
        fatoresCdi[formatarDataBcbRF_(data)] = 1 + (valor / 100);
      } else if (nomeIndice === 'SELIC' && !isNaN(valor)) {
        fatoresSelic[formatarDataBcbRF_(data)] = 1 + (valor / 100);
      }
    });
  }

  var todasAsChaves = Object.keys(porDiaVariavel)
    .concat(Object.keys(porDiaRendaFixaTotal))
    .concat(Object.keys(porDiaIbovespa));
  if (todasAsChaves.length === 0) return [];
  todasAsChaves.sort();

  var primeiraData = new Date(todasAsChaves[0]);
  var ultimaData = new Date(todasAsChaves[todasAsChaves.length - 1]);

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

// Cacheado (lazy) — ver "Otimização #3" no cabeçalho do arquivo: criar o
// Intl.DateTimeFormat UMA vez (em vez de chamar Utilities.formatDate a
// cada linha) é o que faz essa função parar de ser o gargalo em volumes
// de dezenas de milhares de chamadas.
var _formatadorChaveDiaISOInicio_;
function chaveDiaISOInicio_(data) {
  if (!_formatadorChaveDiaISOInicio_) {
    _formatadorChaveDiaISOInicio_ = new Intl.DateTimeFormat('en-CA', {
      timeZone: Session.getScriptTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit'
    });
  }
  return _formatadorChaveDiaISOInicio_.format(data); // "yyyy-MM-dd" (en-CA formata assim)
}

function arredondar2Inicio_(n) {
  return Math.round(n * 100) / 100;
}
