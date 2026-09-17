/**
 * HistoricoAtivo.gs — histórico diário de PREÇO de UM ticker só, na moeda
 * nativa do ativo (R$ pra Ações BR/FIIs, US$ pra Ações EUA) — alimenta o
 * botão "Ver gráfico" de cada .ativo-card em Meus Ativos (Início — pedido
 * do Tiago em 17/09/2026, ver inicio.js!wireGraficoAtivo).
 *
 * Lê a MESMA aba que HistoricoInicio.gs já usa pro patrimônio combinado
 * (aux_historico-patrimonio, ABA_PATRIMONIO_INICIO — ver esse arquivo),
 * mas aqui filtrado por Ticker e sem forward-fill: diferente da série
 * combinada (que "carrega" o último valor conhecido nos dias sem pregão,
 * porque soma vários tickers com calendários diferentes), aqui é 1 ticker
 * só — um degrau artificial nos fins de semana/feriados enganaria o
 * formato do gráfico ("caiu" quando na verdade só não teve pregão), então
 * a série devolvida só tem os dias em que aquele ticker REALMENTE fechou.
 *
 * SOB DEMANDA (ação própria, doGet, nunca embutida na resposta de "home"):
 * só uns poucos dos ~30 tickers de Meus Ativos são abertos numa sessão
 * típica — mandar o histórico dos 30 de uma vez, toda carga da Início,
 * seria desperdício de payload e de leitura de planilha. O popover
 * (wireGraficoAtivo) busca 1 vez por ticker aberto, na hora do clique.
 *
 * Sem cache próprio (ao contrário de montarSerieHistoricoInicio_): o
 * volume por ticker é pequeno (algumas centenas/milhares de linhas, não
 * o combinado de todos) e a chamada é rara o bastante (só quando o
 * popover abre) pra não justificar a complexidade extra de outra chave
 * de CacheService.
 */

function handleHistoricoAtivo(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    var ticker = e.parameter.ticker;
    if (!ticker) {
      return jsonOut({ ok: false, etapa: 'historicoAtivo', erro: 'parâmetro "ticker" obrigatório' });
    }
    return jsonOut({ ok: true, resultado: montarHistoricoAtivo_(ticker) });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'historicoAtivo', erro: String(err) });
  }
}

/**
 * `serie` é `[{ data: 'yyyy-MM-dd', preco: number }]`, em ordem
 * cronológica (aux_historico-patrimonio é append-only por ticker — ver
 * Sync.gs!gravarLinhasHistorico_ —, mas ordena de novo aqui mesmo assim:
 * é barato pra 1 ticker só, e não depende de nenhuma outra parte do
 * código manter esse invariante pra sempre). `preco` é sempre a coluna E
 * (Preço) crua — a MESMA moeda que Meus Ativos já usa pro preço atual
 * desse ticker (ativo.precoAtual/formatBRL ou formatUSD, conforme
 * ativo.classe) — nunca convertido aqui, quem decide formatBRL/formatUSD
 * é o front-end, que já sabe a classe pelo card.
 */
function montarHistoricoAtivo_(ticker) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_PATRIMONIO_INICIO);
  if (!aba) throw new Error('aba não encontrada: ' + ABA_PATRIMONIO_INICIO);

  var ultimaLinha = Math.max(aba.getLastRow() - 1, 0);
  var serie = [];
  if (ultimaLinha > 0) {
    // Só até a coluna E (Preço) — Valor/Câmbio/Valor BRL (F/G/H) não
    // interessam aqui, ao contrário de montarSerieHistoricoInicio_.
    aba.getRange(2, 1, ultimaLinha, 5).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      if (linha[1] !== ticker) return;
      var preco = Number(linha[4]);
      if (isNaN(preco)) return;
      serie.push({ data: chaveDiaISOInicio_(data), preco: arredondar2Inicio_(preco) });
    });
  }
  serie.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });

  return { ticker: ticker, serie: serie };
}

/** Roda direto no editor, pra conferir o histórico de 1 ticker sem precisar do front-end. */
function testarHistoricoAtivoDireto() {
  var resultado = montarHistoricoAtivo_('PETR4');
  Logger.log('Total de dias: ' + resultado.serie.length);
  if (resultado.serie.length) {
    Logger.log('Primeiro dia: ' + JSON.stringify(resultado.serie[0]));
    Logger.log('Último dia: ' + JSON.stringify(resultado.serie[resultado.serie.length - 1]));
  }
}
