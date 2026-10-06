/**
 * Proventos.gs - 24/09/2026 (Tiago: tela "Proventos" + proventos na Início
 * e nas Carteiras).
 *
 * Fontes, todas lidas da planilha (o site nunca chama nada de fora):
 *  - aba "Proventos" / "Proventos - USA": o que você já recebeu (e o que
 *    você lançou com pagamento futuro). A lista sai de
 *    FluxoCaixaInicio.gs!calcularFluxoCaixaDiario_ (listaProventos) - a MESMA
 *    classe e o MESMO valor em R$ dos campos proventos* do histórico, que as
 *    Carteiras somam;
 *  - aba "B3 - proventos a receber": a exportação "Proventos a receber" da
 *    Área do Investidor da B3/corretora, colada como veio (a partir de A1).
 *    Traz ações E FIIs, com a quantidade e o valor líquido já calculados;
 *  - aba aux_proventos-anunciados: FIIs anunciados no FNet
 *    (FnetProventos.gs, gatilho diário).
 * Um mesmo provento (ticker + dia de pagamento) aparece uma vez só, nesta
 * ordem de preferência: sua aba Proventos > exportação da B3 > FNet.
 */

var ABA_B3_PROVENTOS_A_RECEBER = 'B3 - proventos a receber';

// ---------------------------------------------------------------------------
// Tela Proventos
// ---------------------------------------------------------------------------

function handleProventos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(montarTelaProventosComCache_());
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'proventos', erro: String(erro) });
  }
}

/**
 * { ok, hoje, recebidos, aReceber, pagosNaoLancados, atualizadoB3, ativos, aplicado, aportes12m }
 *  - recebidos: pagos até hoje (aba Proventos/Proventos - USA), com classe
 *    ('acoes'|'fiis'|'acoesEua'), tipo, quantidade, valor por cota e valor em R$;
 *  - aReceber / pagosNaoLancados: ver montarProventosAnunciados_;
 *  - ativos: carteira de hoje (Auxiliar_ativos) - quantidade, preço médio,
 *    preço atual, DY - pro "yield on cost" de cada ativo;
 *  - aplicado / aportes12m: Valor aplicado de hoje e aportes líquidos dos
 *    últimos 365 dias por classe (mesmos campos fluxoAplicado* do histórico).
 */
function montarTelaProventos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = hojeSP_();
  var mapas = mapasDoPatrimonioParaProventos_(ss);
  var fluxo = calcularFluxoCaixaDiario_(mapas.mapaCambioUsd, mapas.classePorTicker);
  var recebidos = (fluxo.listaProventos || []).filter(function (p) { return p.data <= hoje; })
    .sort(function (a, b) { return a.data < b.data ? 1 : (a.data > b.data ? -1 : (a.ticker < b.ticker ? -1 : 1)); });

  var limite12m = diaSP_(new Date(Date.now() - 365 * 86400000));
  var somaMapa = function (mapa, desde) {
    return Object.keys(mapa || {}).reduce(function (s, k) { return (k <= hoje && (!desde || k > desde)) ? s + (Number(mapa[k]) || 0) : s; }, 0);
  };
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var anunciados = montarProventosAnunciados_(null, { mapaCambioUsd: mapas.mapaCambioUsd });
  // 02/10/2026: situação de cada recebido da aba Proventos (R$) perante o
  // extrato da B3 - 'presumido' | 'confirmado' | 'divergente' | 'nao_confirmado';
  // sem o campo = anterior à conferência (CONFERENCIA_PROVENTOS_DESDE)
  var statusPlanilha = anunciados.statusPlanilha || {};
  recebidos.forEach(function (p) {
    if (p.moeda === 'USD') return;
    var s = statusPlanilha[p.ticker + '|' + p.data + '|' + normalizarTipoProvento_(p.tipo)];
    if (!s) return;
    p.conferencia = s.situacao;
    if (s.dataB3) { p.dataB3 = s.dataB3; p.valorB3 = s.valorB3; }
  });

  return {
    ok: true,
    hoje: hoje,
    recebidos: recebidos,
    aReceber: anunciados.aReceber,
    pagosNaoLancados: anunciados.pagosNaoLancados,
    atualizadoB3: anunciados.atualizadoB3,
    conferencia: anunciados.conferencia,
    ativos: ativosParaProventos_(ss),
    aplicado: { acoes: r2(somaMapa(fluxo.acoesAplicado)), fiis: r2(somaMapa(fluxo.fiisAplicado)), acoesEua: r2(somaMapa(fluxo.usaAplicado)) },
    aportes12m: { acoes: r2(somaMapa(fluxo.acoesAplicado, limite12m)), fiis: r2(somaMapa(fluxo.fiisAplicado, limite12m)), acoesEua: r2(somaMapa(fluxo.usaAplicado, limite12m)) }
  };
}

// ---------------------------------------------------------------------------
// Cache da tela (25/09/2026, Tiago: "sinto que está demorando muito pra
// carregar"): montarTelaProventos_ relê Transações, Proventos e o histórico
// de patrimônio inteiros a cada chamada. A resposta fica no CacheService
// (em pedaços - passa de 100KB - mesmos helpers da série da Início) até
// alguma dessas abas mudar de tamanho, virar o dia, ou alguém importar a B3 /
// o FNet gravar anúncio novo / clicar "Limpar cache" (invalidarCacheProventos_).
// ---------------------------------------------------------------------------

var PROP_VERSAO_CACHE_PROVENTOS = 'PROVENTOS_CACHE_VERSAO';

function chaveCacheTelaProventos_(ss) {
  var linhas = function (nome) { var aba = ss.getSheetByName(nome); return aba ? aba.getLastRow() : 0; };
  var versao = '0';
  try { versao = PropertiesService.getScriptProperties().getProperty(PROP_VERSAO_CACHE_PROVENTOS) || '0'; } catch (e) { /* sem versão: só as contagens */ }
  // v2 (02/10/2026): resposta ganhou a conferência com o extrato da B3
  return 'proventos_tela_v2_' + hojeSP_() + '_' + contarLinhasFluxoCaixa_(ss) + '_' +
    [ABA_B3_PROVENTOS_A_RECEBER, 'aux_proventos-anunciados', 'aux_historico-patrimonio', 'Auxiliar_ativos', ABA_CONFERENCIA_PROVENTOS].map(linhas).join('_') + '_' + versao;
}

/** Faz a próxima leitura da tela Proventos (e da meta de Renda Passiva) recalcular. */
function invalidarCacheProventos_() {
  try { PropertiesService.getScriptProperties().setProperty(PROP_VERSAO_CACHE_PROVENTOS, String(Date.now())); } catch (e) { /* cache é só otimização */ }
  // 25/09/2026: a tela de cada ativo também mostra proventos/anúncios (Ativo.gs)
  if (typeof invalidarCacheAtivos_ === 'function') invalidarCacheAtivos_();
}

function montarTelaProventosComCache_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var chave = chaveCacheTelaProventos_(ss);
  var emCache = lerSerieHistoricoCache_(chave);
  if (emCache) {
    console.log('montarTelaProventosComCache_: cache HIT (' + chave + ')');
    return emCache;
  }
  var marca = Date.now();
  var tela = montarTelaProventos_();
  console.log('montarTelaProventosComCache_: cache MISS (' + chave + ') - montou em ' + (Date.now() - marca) + 'ms');
  gravarSerieHistoricoCache_(chave, tela, null, 'proventos_tela'); // A-37: apaga a geração anterior
  return tela;
}

/**
 * 05/10/2026 (auditoria A-19): ÚNICO "hoje" do Apps Script para proventos -
 * o dia de calendário de São Paulo ('yyyy-MM-dd'), seja qual for o fuso do
 * projeto/servidor. Antes cada trecho calculava de um jeito (fuso do script,
 * UTC no front): entre 21h e 24h em SP o UTC já é o dia seguinte e o mês
 * corrente e o "pago/presumido" mudavam de lado à noite. O par no front é
 * assets/js/format.js!hojeSP.
 */
var _formatadorDiaSP_ = null;
function diaSP_(data) {
  // Intl (como chaveDiaISOInicio_, HistoricoInicio.gs): 'en-CA' formata 'yyyy-MM-dd'
  if (!_formatadorDiaSP_) _formatadorDiaSP_ = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return _formatadorDiaSP_.format(data);
}

function hojeSP_() {
  return diaSP_(new Date());
}

/**
 * 05/10/2026 (auditoria A-17): UMA função de janela para "proventos em 12
 * meses". Havia 3 definições (12 meses fechados, 12 meses com o mês corrente
 * e janela rolante de 365 dias) que davam ~4% de diferença entre telas sem
 * dizer qual era qual. Agora toda janela sai daqui, com o rótulo junto:
 *  - 'fechados'    : os N meses que terminam no mês passado (o mês de hoje
 *                    ainda não acabou) - a régua da meta de Renda Passiva, da
 *                    média mensal da tela Proventos e da tela do Ativo;
 *  - 'comMesAtual' : os N meses que terminam no mês de hoje (inclusive, em
 *                    curso) - o total "12 meses" da tela Proventos e das
 *                    Carteiras.
 * Devolve { modo, meses, inicio:'yyyy-MM', fim:'yyyy-MM', rotulo }.
 */
function janelaProventos_(hoje, modo, meses) {
  var n = meses > 0 ? meses : 12;
  var mais = function (anoMes, k) {
    var a = Number(anoMes.slice(0, 4)), m = Number(anoMes.slice(5, 7));
    var t = a * 12 + (m - 1) + k;
    return Math.floor(t / 12) + '-' + ('0' + ((t % 12) + 1)).slice(-2);
  };
  var fechados = modo !== 'comMesAtual';
  var fim = fechados ? mais(hoje.slice(0, 7), -1) : hoje.slice(0, 7);
  var inicio = mais(fim, -(n - 1));
  return {
    modo: fechados ? 'fechados' : 'comMesAtual', meses: n, inicio: inicio, fim: fim,
    rotulo: n + ' meses ' + (fechados ? 'fechados' : 'até o mês atual (em curso)')
  };
}

/**
 * A lista "recebidos" da tela Proventos + o que o front também conta como
 * recebido: os a receber cujo pagamento já chegou e os pagos não lançados
 * (B3/FNet), esses como 'presumido' (menos os que o extrato da B3 não
 * confirmou). É a MESMA regra de assets/js/pages/proventos-calc.js!
 * normalizarPorData - sem isso a média do servidor (só o lançado) ficava
 * abaixo da que a tela mostra. Cada item ganha `conferencia` ('presumido' só
 * nos que não estão na aba Proventos).
 */
function recebidosComPresumidos_(tela) {
  var t = tela || {};
  var hoje = t.hoje || hojeSP_();
  var lista = (t.recebidos || []).slice();
  var comoRecebido = function (p) {
    return { data: p.dataPagamento, dataCom: p.dataCom || '', ticker: p.ticker, classe: p.classe, tipo: p.tipo, quantidade: p.quantidade,
      valorPorCota: p.valorPorCota, liquido: p.valor, moeda: 'BRL', cambio: null, valor: p.valor, fonte: p.fonte || 'Planilha', conferencia: 'presumido' };
  };
  (t.aReceber || []).forEach(function (p) {
    if (p && p.dataPagamento && p.dataPagamento <= hoje) lista.push(comoRecebido(p));
  });
  (t.pagosNaoLancados || []).forEach(function (p) {
    if (p && p.dataPagamento && p.conferencia !== 'nao_confirmado') lista.push(comoRecebido(p));
  });
  return lista;
}

/**
 * Soma dos proventos (R$) numa janela de janelaProventos_ - a ÚNICA conta de
 * "proventos em N meses" do servidor. `recebidos` = itens { data, valor,
 * conferencia? }; os com conferencia 'presumido' entram no total e também
 * aparecem à parte (a Início/Proventos separam o confirmado do presumido).
 * Devolve { media, total, confirmado, presumido, inicio, fim, meses, modo, rotulo }.
 */
function somarProventosJanela_(recebidos, hoje, modo, meses) {
  var j = janelaProventos_(hoje, modo, meses);
  var total = 0, presumido = 0;
  (recebidos || []).forEach(function (p) {
    var m = String(p.data || '').slice(0, 7);
    if (m < j.inicio || m > j.fim || typeof p.valor !== 'number') return;
    if (modo === 'comMesAtual' && String(p.data) > hoje) return; // pago até hoje
    total += p.valor;
    if (p.conferencia === 'presumido') presumido += p.valor;
  });
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  total = r2(total); presumido = r2(presumido);
  return { media: r2(total / j.meses), total: total, confirmado: r2(total - presumido), presumido: presumido,
    inicio: j.inicio, fim: j.fim, meses: j.meses, modo: j.modo, rotulo: j.rotulo };
}

/**
 * Meta de Renda Passiva (Distribuições e Metas): média dos proventos dos 12
 * últimos meses FECHADOS (o mês de hoje fica fora), de TODAS as carteiras
 * (Ações, FIIs e Ações EUA em reais, pelo câmbio do dia do pagamento) - a
 * mesma lista e a mesma régua da tela Proventos
 * (assets/js/pages/proventos-calc.js!mesesFechadosDoPeriodo). Antes vinha da
 * fórmula da planilha (Aux_dash_Proventos), que só via a aba Proventos
 * (sem os dividendos em dólar).
 * Devolve { media, total, inicio: 'yyyy-MM', fim: 'yyyy-MM' } + (05/10/2026,
 * A-17) { confirmado, presumido, rotulo, meses }. Quem tiver a resposta
 * inteira da tela passa `recebidosComPresumidos_(tela)` pra a base ser a
 * mesma da tela.
 */
function mediaRendaPassiva12Meses_(recebidos, hoje) {
  return somarProventosJanela_(recebidos, hoje, 'fechados', 12);
}

/**
 * Câmbio USD por dia e classe de cada ticker, lidos de aux_historico-patrimonio
 * com as MESMAS regras de HistoricoInicio.gs!montarSerieHistoricoInicio_ (o
 * histórico em si fica em cache e não devolve esses mapas).
 */
function mapasDoPatrimonioParaProventos_(ss) {
  if (typeof carregarListasTickersDaPlanilha_ === 'function') carregarListasTickersDaPlanilha_(ss); // FII novo (Planilha.gs)
  // 05/10/2026 (A-33): relia aux_historico-patrimonio inteira (~135 mil células) em toda ação que mostra proventos/aportes
  // (proventos, transacoes, carteirasHome, ativo, metas, salario...). O resultado (câmbio por dia + classe por ticker) é pequeno:
  // fica no CacheService, com chave pela última linha da aba, o dia, a lista de FIIs e o carimbo de escrita.
  var chave = chaveCacheMapasPatrimonio_(ss);
  var emCache = null;
  try { emCache = chave ? lerSerieHistoricoCache_(chave) : null; } catch (eLer) { emCache = null; }
  if (emCache && emCache.mapaCambioUsd && emCache.classePorTicker) return emCache;
  var r = lerMapasDoPatrimonio_(ss);
  if (chave) { try { gravarSerieHistoricoCache_(chave, r); } catch (eGrav) { /* segue sem cache */ } }
  return r;
}

function chaveCacheMapasPatrimonio_(ss) {
  try {
    var aba = ss.getSheetByName('aux_historico-patrimonio');
    if (!aba) return null;
    var fiis = typeof TICKERS_FIIS_BR !== 'undefined' ? TICKERS_FIIS_BR.join(',') : '', h = 5381;
    for (var i = 0; i < fiis.length; i++) h = ((h * 33) ^ fiis.charCodeAt(i)) >>> 0;
    return 'mapas_pat_v1_' + hojeSP_() + '_' + aba.getLastRow() + '_' + h.toString(36) + fiis.length + '_e' + carimboEscritaPlanilha_();
  } catch (e) { return null; }
}

function lerMapasDoPatrimonio_(ss) {
  var mapaCambioUsd = {}, classePorTicker = {};
  var aba = ss.getSheetByName('aux_historico-patrimonio');
  if (!aba || aba.getLastRow() < 2) return { mapaCambioUsd: mapaCambioUsd, classePorTicker: classePorTicker };
  var hoje = hojeSP_();
  // 05/10/2026 (A-33): mesma faixa (8 colunas) que HistoricoInicio.gs/Ativo.gs leem - 1 leitura por execução
  lerAbaUmaVez_(aba, 2, aba.getLastRow() - 1, 8).forEach(function (linha) {
    if (!(linha[0] instanceof Date)) return;
    var chave = chaveDiaISOInicio_(linha[0]);
    if (chave > hoje) return;
    if (linha[2] === 'USA' && typeof linha[6] === 'number' && linha[6]) mapaCambioUsd[chave] = linha[6];
    var ticker = linha[1];
    if (tickerForaDoHistoricoInicio_(ticker)) return;
    classePorTicker[ticker] = (linha[2] === 'BR' && typeof TICKERS_FIIS_BR !== 'undefined' && TICKERS_FIIS_BR.indexOf(ticker) !== -1) ? 'FII' : linha[2];
  });
  return { mapaCambioUsd: mapaCambioUsd, classePorTicker: classePorTicker };
}

/** Carteira de hoje (Auxiliar_ativos) - só renda variável com quantidade > 0. */
function ativosParaProventos_(ss) {
  var aba = ss.getSheetByName('Auxiliar_ativos');
  if (!aba || aba.getLastRow() < 2) return [];
  var classe = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações EUA': 'acoesEua' };
  return aba.getRange(2, 1, aba.getLastRow() - 1, 17).getValues()
    .filter(function (l) { return classe[l[0]] && l[1] && Number(l[7]) > 0; })
    .map(function (l) {
      return {
        ticker: String(l[1]).trim().toUpperCase(), nome: String(l[2] || ''), classe: classe[l[0]], moeda: String(l[4] || ''),
        precoAtual: Number(l[5]) || null, quantidade: Number(l[7]) || 0, precoMedio: Number(l[8]) || null,
        dy: typeof l[16] === 'number' ? l[16] : null
      };
    });
}

// ---------------------------------------------------------------------------
// A receber / pagos não lançados / recebidos no mês (Home e tela Proventos)
// ---------------------------------------------------------------------------

/**
 * {
 *   aReceber: pagamento de hoje em diante (ou sem data definida), ainda não
 *     recebido - fonte 'Planilha' (lançado por você com data futura), 'B3'
 *     (exportação) ou 'FNet' (FIIs);
 *   pagosNaoLancados: pagos nos últimos 60 dias (B3/FNet) que não estão na
 *     aba Proventos;
 *   recebidosNoMes: aba Proventos/Proventos - USA, pagos neste mês até hoje;
 *   atualizadoB3: data da exportação da B3 (se houver)
 * }
 * Cada item: { ticker, classe, tipo, dataCom, dataPagamento ('' = a definir),
 *   quantidade, valorPorCota, valor (R$, líquido), fonte, jaLancado }.
 * `historico` (opcional, Home): câmbio de cada dia (cambioUsd) pros
 * proventos em dólar do mês; `opcoes.mapaCambioUsd` faz o mesmo sem histórico.
 */
function montarProventosAnunciados_(historico, opcoes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = hojeSP_();
  var mesAtual = hoje.slice(0, 7);
  var limitePassado = diaSP_(new Date(Date.now() - 60 * 86400000));
  var r2 = function (n) { return Math.round(n * 100) / 100; };

  var classes = classesDaCarteiraParaProventos_(ss);
  var classeDe = function (ticker, moeda) {
    if (moeda === 'USD') return 'acoesEua';
    if (classes[ticker]) return classes[ticker];
    // 05/10/2026 (A-18): classe do cadastro (listas/alias) antes do sufixo 11
    var cx = typeof classeProventoSemHistorico_ === 'function' ? classeProventoSemHistorico_(ticker, null) : '';
    if (cx) return cx === 'FII' ? 'fiis' : 'acoes';
    return /11$/.test(ticker) ? 'fiis' : 'acoes';
  };

  var planilha = lerLinhasAbaProventos_(ss);
  // chave = ticker + dia de pagamento + tipo (a mesma ação paga JCP e dividendo no mesmo dia)
  var chaveDe = function (ticker, dia, tipo) { return ticker + '|' + dia + '|' + normalizarTipoProvento_(tipo); };
  // já está na sua aba Proventos? mesmo ticker e dia de pagamento, e mesmo tipo OU mesmo valor
  // (±2%: o nome do tipo na sua aba pode não ser o mesmo da B3 - ex. "Rendimento" x "Dividendo")
  var planilhaPorDia = {}, planilhaPorTicker = {};
  planilha.forEach(function (p) {
    (planilhaPorDia[p.ticker + '|' + p.dataPagamento] = planilhaPorDia[p.ticker + '|' + p.dataPagamento] || []).push(p);
    (planilhaPorTicker[p.ticker] = planilhaPorTicker[p.ticker] || []).push(p);
  });
  var valorPerto = function (a, b) { return Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.02); };
  var foiLancado = function (ticker, dia, tipo, valor) {
    if ((planilhaPorDia[ticker + '|' + dia] || []).some(function (p) {
      return normalizarTipoProvento_(p.tipo) === normalizarTipoProvento_(tipo) || valorPerto(p.liquido, valor);
    })) return true;
    // 02/10/2026: lançado com a data do extrato da B3, que às vezes cai uns
    // dias antes/depois da anunciada - mesmo tipo e mesmo valor até
    // CONFERENCIA_PROVENTOS_DIAS de distância também é "já lançado" (senão
    // contava 2 vezes agora que pago presumido entra nos totais)
    if (!dia) return false;
    return (planilhaPorTicker[ticker] || []).some(function (p) {
      return p.dataPagamento && Math.abs(diasEntreChavesProvento_(p.dataPagamento, dia)) <= CONFERENCIA_PROVENTOS_DIAS &&
        normalizarTipoProvento_(p.tipo) === normalizarTipoProvento_(tipo) && valorPerto(p.liquido, valor);
    });
  };

  // câmbio por dia (proventos em dólar do mês)
  var cambioPorDia = (opcoes && opcoes.mapaCambioUsd) || {};
  (historico || []).forEach(function (p) { if (p && p.cambioUsd) cambioPorDia[p.data] = p.cambioUsd; });
  var chavesCambio = Object.keys(cambioPorDia).sort();
  var cambioDoDia = function (dia) {
    if (!chavesCambio.length) return null;
    return typeof cambioUsdParaData_ === 'function' ? cambioUsdParaData_(cambioPorDia, chavesCambio, dia) : cambioPorDia[chavesCambio[chavesCambio.length - 1]];
  };

  var itens = {}, ordem = [];
  var juntar = function (item) {
    var k = chaveDe(item.ticker, item.dataPagamento, item.tipo) + (item.dataPagamento ? '' : '|' + item.valor);
    var ja = itens[k];
    if (ja) {
      // mesma linha da B3 em 2 contas/corretoras: soma (nunca duplica nem perde)
      if (ja.fonte === 'B3' && item.fonte === 'B3') {
        ja.quantidade += item.quantidade;
        ja.valor = r2(ja.valor + item.valor);
      }
      return;
    }
    itens[k] = item;
    ordem.push(k);
  };

  // 1) sua aba Proventos: lançados com pagamento futuro (BR; os em dólar entram quando pagos)
  planilha.forEach(function (p) {
    if (p.dataPagamento <= hoje || p.moeda !== 'BRL' || p.tipo === 'Juros') return;
    juntar({ ticker: p.ticker, classe: classeDe(p.ticker, p.moeda), tipo: normalizarTipoProvento_(p.tipo), dataCom: p.dataCom, dataPagamento: p.dataPagamento,
      quantidade: p.quantidade, valorPorCota: p.valorPorCota, valor: r2(p.liquido), fonte: 'Planilha', jaLancado: true });
  });

  // 2) exportação da B3 (ações e FIIs, quantidade e valor líquido prontos)
  var b3 = lerProventosB3AReceber_(ss);
  b3.itens.forEach(function (p) {
    if (p.dataPagamento && foiLancado(p.ticker, p.dataPagamento, p.tipo, p.valor)) return; // já na aba Proventos
    juntar({ ticker: p.ticker, classe: classeDe(p.ticker, 'BRL'), tipo: p.tipo, dataCom: '', dataPagamento: p.dataPagamento,
      quantidade: p.quantidade, valorPorCota: p.valorPorCota, valor: r2(p.valor), fonte: 'B3', jaLancado: false });
  });

  // 3) FNet (FIIs): quantidade na data com pelas Transações
  var anunciados = lerProventosAnunciados_(ss);
  if (anunciados.length) {
    var quantidadeNaData = quantidadesNaDataCom_(ss, anunciados.map(function (p) { return p.ticker; }));
    anunciados.forEach(function (p) {
      var quantidade = quantidadeNaData(p.ticker, p.dataCom);
      if (!(quantidade > 0) || !(p.valor > 0)) return;
      if (foiLancado(p.ticker, p.dataPagamento, p.tipo, quantidade * p.valor)) return; // já na aba Proventos
      juntar({ ticker: p.ticker, classe: classeDe(p.ticker, 'BRL'), tipo: p.tipo, dataCom: p.dataCom, dataPagamento: p.dataPagamento,
        quantidade: quantidade, valorPorCota: p.valor, valor: r2(quantidade * p.valor), fonte: 'FNet', jaLancado: false });
    });
  }

  // 02/10/2026 (Tiago: "se a data de pagamento já passou, deduz que está
  // pago"): pagamento até HOJE (inclusive, fuso do projeto =
  // America/Sao_Paulo) já é pago; antes o do próprio dia ainda ficava "a
  // receber". Os pagos que não estão na aba Proventos (B3/FNet) vão em
  // pagosNaoLancados com conferencia 'presumido' - a tela Proventos e a
  // Início contam como recebido - desde CONFERENCIA_PROVENTOS_DESDE (ou nos
  // últimos 60 dias, como antes).
  var aReceber = [], pagosNaoLancados = [];
  ordem.forEach(function (k) {
    var p = itens[k];
    if (!p.dataPagamento || p.dataPagamento > hoje) aReceber.push(p);
    else if (p.fonte !== 'Planilha' && !p.jaLancado && (p.dataPagamento >= limitePassado || p.dataPagamento >= CONFERENCIA_PROVENTOS_DESDE)) pagosNaoLancados.push(p);
  });

  // conferência com o extrato da B3 (ver "Conferência" mais abaixo)
  var conferencia = conferirProventosComExtratoB3_(ss, planilha, pagosNaoLancados, hoje);
  pagosNaoLancados.forEach(function (p, i) {
    var s = conferencia.porId['N' + i];
    p.conferencia = s ? s.situacao : 'presumido';
    if (s && s.dataB3) { p.dataB3 = s.dataB3; p.valorB3 = s.valorB3; }
  });

  // recebidos neste mês (aba Proventos/Proventos - USA)
  var recebidosNoMes = [];
  planilha.forEach(function (p) {
    if (p.dataPagamento > hoje || p.dataPagamento.slice(0, 7) !== mesAtual || p.tipo === 'Juros') return;
    var cambio = p.moeda === 'USD' ? cambioDoDia(p.dataPagamento) : 1;
    if (!cambio) return;
    var item = { ticker: p.ticker, classe: classeDe(p.ticker, p.moeda), tipo: normalizarTipoProvento_(p.tipo), dataCom: p.dataCom, dataPagamento: p.dataPagamento,
      quantidade: p.quantidade, valorPorCota: p.valorPorCota, moeda: p.moeda, valor: r2(p.liquido * cambio), fonte: 'Planilha', jaLancado: true };
    var s = p.moeda === 'BRL' ? conferencia.statusPlanilha[chaveDe(p.ticker, p.dataPagamento, p.tipo)] : null;
    if (s) { item.conferencia = s.situacao; if (s.dataB3) { item.dataB3 = s.dataB3; item.valorB3 = s.valorB3; } }
    recebidosNoMes.push(item);
  });

  var porPagamento = function (a, b) {
    var da = a.dataPagamento || '9999', db = b.dataPagamento || '9999';
    return da < db ? -1 : (da > db ? 1 : (a.ticker < b.ticker ? -1 : 1));
  };
  return {
    aReceber: aReceber.sort(porPagamento),
    pagosNaoLancados: pagosNaoLancados.sort(porPagamento),
    recebidosNoMes: recebidosNoMes.sort(porPagamento),
    atualizadoB3: b3.atualizadoEm || null,
    conferencia: conferencia.resumo,
    statusPlanilha: conferencia.statusPlanilha // a tela Proventos usa e tira (montarTelaProventos_)
  };
}

function normalizarTipoProvento_(tipoBruto) {
  var t = String(tipoBruto || '').toUpperCase();
  if (/JCP|JUROS SOBRE/.test(t)) return 'JCP';
  if (/DIVID/.test(t)) return 'Dividendo';
  if (/RENDIMENTO/.test(t)) return 'Rendimento';
  if (/AMORTIZ/.test(t)) return 'Amortização';
  return String(tipoBruto || '').trim() || 'Outros';
}

/** Auxiliar_ativos: ticker -> 'acoes'|'fiis'|'acoesEua'. */
function classesDaCarteiraParaProventos_(ss) {
  var aba = ss.getSheetByName('Auxiliar_ativos');
  var out = {};
  if (!aba || aba.getLastRow() < 2) return out;
  var classe = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações EUA': 'acoesEua' };
  aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues().forEach(function (l) {
    if (classe[l[0]] && l[1]) out[String(l[1]).trim().toUpperCase()] = classe[l[0]];
  });
  return out;
}

/** Linhas das abas Proventos (R$) e Proventos - USA (US$), colunas A..G. */
function lerLinhasAbaProventos_(ss) {
  var out = [];
  [['Proventos', 'BRL'], ['Proventos - USA', 'USD']].forEach(function (par) {
    var aba = ss.getSheetByName(par[0]);
    if (!aba || aba.getLastRow() < 1) return;
    lerAbaUmaVez_(aba, 1, aba.getLastRow(), 7).forEach(function (l) {
      if (!(l[1] instanceof Date)) return;
      var ticker = String(l[2] || '').trim().toUpperCase();
      var liquido = Number(l[6]);
      if (!ticker || !isFinite(liquido)) return;
      out.push({
        ticker: ticker, moeda: par[1], tipo: String(l[3] || '').trim(),
        dataCom: l[0] instanceof Date ? chaveDiaISOInicio_(l[0]) : '',
        dataPagamento: chaveDiaISOInicio_(l[1]),
        quantidade: Number(l[4]) || 0, valorPorCota: Number(l[5]) || 0, liquido: liquido
      });
    });
  });
  return out;
}

/** Quantidade de cada ticker numa data (soma da coluna K de Transações até o dia, inclusive). */
function quantidadesNaDataCom_(ss, tickersLista) {
  var tickers = {};
  (tickersLista || []).forEach(function (t) { tickers[t] = 1; });
  var movimentos = {};
  var abaT = ss.getSheetByName('Transações');
  // 05/10/2026 (A-31/A-33): última linha REAL (Transações tem fórmula até ~10.800) e a mesma leitura de 12 colunas do fluxo/Ativo
  var ultimaT = abaT ? ultimaLinhaReal_(abaT, [1, 2], LINHA_DADOS_TRANSACOES_FLUXO) : 0;
  if (abaT && ultimaT >= LINHA_DADOS_TRANSACOES_FLUXO) {
    lerAbaUmaVez_(abaT, LINHA_DADOS_TRANSACOES_FLUXO, ultimaT - LINHA_DADOS_TRANSACOES_FLUXO + 1, 12).forEach(function (l) {
      var t = String(l[0] || '').trim().toUpperCase();
      if (!tickers[t] || !(l[1] instanceof Date)) return;
      var q = Number(l[10]);
      if (!isFinite(q) || !q) return;
      (movimentos[t] = movimentos[t] || []).push({ dia: chaveDiaISOInicio_(l[1]), q: q });
    });
  }
  return function (t, dia) {
    return (movimentos[t] || []).reduce(function (s, m) { return m.dia <= dia ? s + m.q : s; }, 0);
  };
}

/**
 * Aba "B3 - proventos a receber": a exportação da Área do Investidor colada
 * como veio (ou importada pela tela Proventos - handleImportarProventosB3).
 * Devolve { itens: [{ ticker, tipo, dataPagamento, quantidade, valorPorCota, valor }], atualizadoEm }.
 */
function lerProventosB3AReceber_(ss) {
  var aba = ss.getSheetByName(ABA_B3_PROVENTOS_A_RECEBER);
  if (!aba || aba.getLastRow() < 2) return { itens: [], atualizadoEm: null };
  var largura = Math.min(Math.max(aba.getLastColumn(), 9), 20);
  return extrairProventosB3DeLinhas_(aba.getRange(1, 1, aba.getLastRow(), largura).getValues());
}

/**
 * Lê a matriz da exportação "Proventos a receber" da B3. Procura o
 * cabeçalho ("Produto" ... "Valor líquido") nas 15 primeiras linhas;
 * "Produto" = "TICKER - NOME"; "Previsão de pagamento" dd/mm/aaaa (texto ou
 * data) ou "-" (sem data definida). Linha de total e linhas vazias são
 * ignoradas. `atualizadoEm`: célula abaixo de "Importado em" (o app grava
 * isso ao importar) - opcional.
 */
function extrairProventosB3DeLinhas_(linhas) {
  var norm = function (s) { return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
  var cab = -1, idx = {}, atualizadoEm = null;
  for (var i = 0; i < Math.min(linhas.length, 15) && cab === -1; i++) {
    var nomes = linhas[i].map(norm);
    if (nomes.indexOf('produto') !== -1 && nomes.some(function (n) { return n.indexOf('valor liquido') === 0; })) {
      cab = i;
      nomes.forEach(function (n, j) { if (n && idx[n] === undefined) idx[n] = j; });
    }
  }
  if (cab === -1) return { itens: [], atualizadoEm: null };
  if (idx['importado em'] !== undefined && linhas[cab + 1]) {
    var carimbo = linhas[cab + 1][idx['importado em']];
    atualizadoEm = carimbo instanceof Date ? chaveDiaISOInicio_(carimbo) : (chaveDeCelulaProvento_(carimbo) || null);
  }
  var col = function (prefixo) {
    var k = Object.keys(idx).filter(function (n) { return n.indexOf(prefixo) === 0; })[0];
    return k === undefined ? -1 : idx[k];
  };
  var cProduto = col('produto'), cEvento = col('tipo de evento'), cPag = col('previsao de pagamento'),
    cQtd = col('quantidade'), cPreco = col('preco unitario'), cValor = col('valor liquido');
  var numero = function (v) {
    if (typeof v === 'number') return v;
    var s = String(v || '').replace(/[^\d,.-]/g, '');
    if (/,\d{1,}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  };
  var itens = [];
  for (var r = cab + 1; r < linhas.length; r++) {
    var l = linhas[r];
    var produto = String(l[cProduto] || '').trim();
    if (!produto) continue;
    var ticker = produto.split(' - ')[0].trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}\d{0,2}$/.test(ticker)) continue;
    var pag = cPag === -1 ? '' : l[cPag];
    var dataPagamento = pag instanceof Date ? chaveDiaISOInicio_(pag) : chaveDeCelulaProvento_(pag);
    var valor = numero(l[cValor]);
    if (!(valor > 0)) continue;
    itens.push({
      ticker: ticker, tipo: normalizarTipoProvento_(cEvento === -1 ? '' : l[cEvento]), dataPagamento: dataPagamento || '',
      quantidade: cQtd === -1 ? 0 : (numero(l[cQtd]) || 0), valorPorCota: cPreco === -1 ? 0 : (numero(l[cPreco]) || 0), valor: valor
    });
  }
  return { itens: itens, atualizadoEm: atualizadoEm };
}

// ---------------------------------------------------------------------------
// Importar a exportação da B3 pela tela Proventos (doPost importarProventosB3)
// ---------------------------------------------------------------------------

/**
 * e.parameter.linhas: STRING JSON com a matriz da planilha exportada (lida no
 * navegador com SheetJS, como veio - ver assets/js/pages/proventos.js).
 * A exportação é uma foto de TUDO o que está a receber, então substitui o
 * conteúdo da aba (não acumula). Datas "dd/mm/aaaa" viram data de verdade
 * (meio-dia, sem virar o dia por fuso); "-" continua "-".
 */
function handleImportarProventosB3(e) {
  try {
    return jsonOut(importarProventosB3_(e.parameter.linhas));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'importarProventosB3', erro: String(erro) });
  }
}

function importarProventosB3_(linhasJson) {
  var linhas = JSON.parse(linhasJson || '[]');
  if (!Array.isArray(linhas) || !linhas.length) return { ok: false, erro: 'arquivo vazio' };
  if (linhas.length > 2000) return { ok: false, erro: 'arquivo grande demais (' + linhas.length + ' linhas)' };
  var largura = 0;
  linhas = linhas.map(function (l) {
    var linha = (Array.isArray(l) ? l : []).slice(0, 18).map(function (v) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number' || typeof v === 'boolean') return v;
      var t = String(v).slice(0, 200);
      var m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : t;
    });
    largura = Math.max(largura, linha.length);
    return linha;
  });
  var lido = extrairProventosB3DeLinhas_(linhas);
  if (!lido.itens.length) return { ok: false, erro: 'não achei a tabela "Proventos a receber" da B3 (cabeçalho com Produto e Valor líquido) nem nenhum provento com valor' };

  // carimbo "Importado em" 2 colunas depois da tabela, na linha do cabeçalho
  var cab = 0;
  for (var i = 0; i < Math.min(linhas.length, 15); i++) {
    if (linhas[i].some(function (v) { return String(v).trim().toLowerCase() === 'produto'; })) { cab = i; break; }
  }
  var colCarimbo = largura + 1;
  var total = largura + 2;
  var matriz = linhas.map(function (l, r) {
    var linha = l.slice();
    while (linha.length < total) linha.push('');
    if (r === cab) linha[colCarimbo] = 'Importado em';
    if (r === cab + 1) linha[colCarimbo] = new Date();
    return linha;
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_B3_PROVENTOS_A_RECEBER) || ss.insertSheet(ABA_B3_PROVENTOS_A_RECEBER);
  aba.clearContents();
  aba.getRange(1, 1, matriz.length, total).setValues(matriz);
  invalidarCacheProventos_();
  var soma = lido.itens.reduce(function (s, p) { return s + p.valor; }, 0);
  return { ok: true, importados: lido.itens.length, total: Math.round(soma * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Conferência com o extrato da B3 (02/10/2026)
// ---------------------------------------------------------------------------
//
// Tiago: "Proventos: se a data de pagamento já passou, deduz que está pago.
// Eu mando no final do mês [o arquivo da B3] e você faz o check final."
//
// 1) Pago presumido: todo provento com pagamento até hoje conta como
//    recebido. Os em R$ a partir de CONFERENCIA_PROVENTOS_DESDE (lançados na
//    aba Proventos ou só anunciados pela B3/FNet) ficam 'presumido' até a
//    conferência - a tela mostra um ícone discreto.
// 2) Check final: quando o extrato da B3 (Movimentação ou Proventos
//    recebidos) passa pela tela Transações > Lançamentos, as linhas de
//    provento dele ficam guardadas em aux_proventos-conferencia
//    (registrarExtratoB3Proventos_, chamado por Lancamentos.gs - já na
//    conferência, antes de gravar, pra valer mesmo quando tudo já estava
//    lançado). A situação de cada provento é recalculada a cada leitura
//    (conciliarProventosB3_), sem tocar na aba Proventos:
//     - 'confirmado': o extrato tem o mesmo ativo, pagamento a até
//       CONFERENCIA_PROVENTOS_DIAS dias e valor dentro da tolerância
//       (arredondamento: 2% ou R$ 0,05; JCP: também o valor com 15% de IR);
//     - 'divergente': achou no extrato (mesmo ativo/tipo, data perto), mas o
//       valor não bate - conta como recebido, a tela mostra os 2 valores;
//     - 'nao_confirmado': o mês já foi conferido e o extrato não tem - pode
//       ter atrasado ou não ter sido pago. Lançado na aba Proventos continua
//       contando (a aba é a fonte - apague a linha se não veio); só
//       anunciado (B3/FNet) sai dos totais (o extrato vira linha nova na aba
//       e contaria 2 vezes);
//     - linha do extrato que não bate com nada: "extra" - é o que a
//       importação propõe como novo, como sempre.
//
// aux_proventos-conferencia (criada sozinha; pode apagar e reimportar):
//   Linha | Ticker / mês | Tipo | Data pagamento | Valor líquido | Quantidade | Arquivo | Registrado em
//   - 'B3': uma linha de provento do extrato (a mesma linha 2x = 2 contas);
//   - 'Mês conferido': mês ('yyyy-MM') coberto pelo extrato e o último dia
//     conferido (mês que já acabou quando o extrato chegou = mês inteiro; o
//     mês corrente = até a última data do extrato).
// Mandar o mesmo extrato de novo não duplica nada.

var ABA_CONFERENCIA_PROVENTOS = 'aux_proventos-conferencia';
var CABECALHO_CONFERENCIA_PROVENTOS = ['Linha', 'Ticker / mês', 'Tipo', 'Data pagamento', 'Valor líquido', 'Quantidade', 'Arquivo', 'Registrado em'];
var LINHA_CONFERENCIA_B3 = 'B3';
var LINHA_CONFERENCIA_MES = 'Mês conferido';
// Proventos em R$ pagos a partir desse dia ficam "presumidos" até a
// conferência; os anteriores já estavam na planilha antes da conferência
// existir (sem ícone). O extrato de um mês anterior também é conferido.
var CONFERENCIA_PROVENTOS_DESDE = '2026-10-01';
var CONFERENCIA_PROVENTOS_DIAS = 5;
var CONFERENCIA_PROVENTOS_TOLERANCIA = 0.02;
var CONFERENCIA_PROVENTOS_TOLERANCIA_MIN = 0.05;
var CONFERENCIA_PROVENTOS_IR_JCP = 0.15;

/** Dias de a até b ('yyyy-MM-dd'), calendário puro. */
function diasEntreChavesProvento_(a, b) {
  var ms = function (k) { return Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10))); };
  return Math.round((ms(b) - ms(a)) / 86400000);
}

/** Último dia do mês 'yyyy-MM' -> 'yyyy-MM-dd'. */
function ultimoDiaMesProvento_(anoMes) {
  var a = Number(anoMes.slice(0, 4)), m = Number(anoMes.slice(5, 7));
  var d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return anoMes + '-' + ('0' + d).slice(-2);
}

/** { linhas: [{ ticker, tipo, data, valor, quantidade, arquivo }], periodos: [{ mes, inicio, fim, conferidoEm }] } */
function lerConferenciaB3Proventos_(ss) {
  var out = { linhas: [], periodos: [] };
  var aba = ss.getSheetByName(ABA_CONFERENCIA_PROVENTOS);
  if (!aba || aba.getLastRow() < 2) return out;
  aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_CONFERENCIA_PROVENTOS.length).getValues().forEach(function (l) {
    var tipoLinha = String(l[0] || '').trim();
    if (tipoLinha === LINHA_CONFERENCIA_B3) {
      var ticker = String(l[1] || '').trim().toUpperCase();
      var data = chaveDeCelulaProvento_(l[3]);
      var valor = Number(l[4]);
      if (!ticker || !data || !isFinite(valor)) return;
      out.linhas.push({ ticker: ticker, tipo: normalizarTipoProvento_(l[2]), data: data, valor: Math.round(valor * 100) / 100,
        quantidade: Number(l[5]) || 0, arquivo: String(l[6] || ''), registradoEm: l[7] || '' });
    } else if (tipoLinha === LINHA_CONFERENCIA_MES) {
      var mes = String(l[1] || '').trim();
      var fim = chaveDeCelulaProvento_(l[3]);
      if (!/^\d{4}-\d{2}$/.test(mes) || !fim) return;
      out.periodos.push({ mes: mes, inicio: mes + '-01', fim: fim, conferidoEm: l[7] instanceof Date ? chaveDiaISOInicio_(l[7]) : chaveDeCelulaProvento_(l[7]) });
    }
  });
  out.periodos.sort(function (a, b) { return a.mes < b.mes ? -1 : 1; });
  return out;
}

/**
 * Concilia o que o site sabe (conhecidos) com as linhas do extrato da B3.
 * Função pura (testada em tests/harness/proventos-conferencia.test.js).
 *  conhecidos: [{ id, ticker, tipo, data, valor, fonte }] - pagos até hoje;
 *  extrato: [{ ticker, tipo, data, valor }];
 *  periodos: [{ mes, inicio, fim }] já conferidos.
 * Mesmo ativo + dia + tipo é somado dos 2 lados antes (2 contas, 2 linhas
 * de JCP no mesmo dia). Os pares saem do mais parecido pro menos: valor
 * que bate, mesmo tipo, menos dias de diferença, menor diferença de valor.
 * Devolve { porId: { id: { situacao, dataB3, valorB3, previsto, diferenca, ir } }, extras: [grupo do extrato sem par] }.
 */
function conciliarProventosB3_(conhecidos, extrato, periodos, opcoes) {
  var o = opcoes || {};
  var dias = o.dias != null ? o.dias : CONFERENCIA_PROVENTOS_DIAS;
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var agrupar = function (lista, comFonte) {
    var grupos = {}, ordem = [];
    (lista || []).forEach(function (p, i) {
      if (!p || !p.ticker || !p.data) return;
      var tipo = normalizarTipoProvento_(p.tipo);
      var k = p.ticker + '|' + p.data + '|' + tipo + (comFonte ? '|' + (p.fonte || '') : '');
      var g = grupos[k];
      if (!g) { g = grupos[k] = { ticker: p.ticker, data: p.data, tipo: tipo, valor: 0, ids: [], fonte: p.fonte || '' }; ordem.push(k); }
      g.valor = r2(g.valor + (Number(p.valor) || 0));
      g.ids.push(p.id != null ? p.id : i);
    });
    return ordem.map(function (k) { return grupos[k]; });
  };
  var K = agrupar(conhecidos, true);
  var E = agrupar(extrato, false);
  var avaliar = function (k, e) {
    var tol = Math.max(CONFERENCIA_PROVENTOS_TOLERANCIA_MIN, Math.abs(k.valor) * CONFERENCIA_PROVENTOS_TOLERANCIA);
    if (Math.abs(e.valor - k.valor) <= tol) return 'ok';
    if (k.tipo === 'JCP' || e.tipo === 'JCP') {
      var liq = 1 - CONFERENCIA_PROVENTOS_IR_JCP;
      if (Math.abs(e.valor - k.valor * liq) <= tol || Math.abs(k.valor - e.valor * liq) <= tol) return 'ir';
    }
    return 'diverge';
  };
  var pares = [];
  K.forEach(function (k, ik) {
    E.forEach(function (e, ie) {
      if (e.ticker !== k.ticker) return;
      var dd = Math.abs(diasEntreChavesProvento_(k.data, e.data));
      if (dd > dias) return;
      var av = avaliar(k, e);
      var mesmoTipo = k.tipo === e.tipo;
      if (!mesmoTipo && av === 'diverge') return; // tipo diferente só com o valor batendo
      pares.push({ ik: ik, ie: ie, av: av, s: [av === 'diverge' ? 1 : 0, mesmoTipo ? 0 : 1, dd, Math.abs(e.valor - k.valor)] });
    });
  });
  pares.sort(function (a, b) {
    for (var i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return a.s[i] - b.s[i];
    return a.ik - b.ik || a.ie - b.ie;
  });
  var usadoK = {}, usadoE = {}, porId = {};
  pares.forEach(function (p) {
    if (usadoK[p.ik] || usadoE[p.ie]) return;
    usadoK[p.ik] = usadoE[p.ie] = true;
    var k = K[p.ik], e = E[p.ie];
    k.ids.forEach(function (id) {
      porId[id] = { situacao: p.av === 'diverge' ? 'divergente' : 'confirmado', dataB3: e.data, valorB3: e.valor, previsto: k.valor,
        diferenca: r2(e.valor - k.valor), ir: p.av === 'ir' };
    });
  });
  var noPeriodo = function (data) { return (periodos || []).some(function (pr) { return data >= pr.inicio && data <= pr.fim; }); };
  K.forEach(function (k, ik) {
    if (usadoK[ik] || !noPeriodo(k.data)) return;
    k.ids.forEach(function (id) { porId[id] = { situacao: 'nao_confirmado' }; });
  });
  var extras = E.filter(function (e, ie) { return !usadoE[ie]; });
  return { porId: porId, extras: extras };
}

/**
 * Situação de tudo o que foi pago até hoje, pra montarProventosAnunciados_.
 * planilha = lerLinhasAbaProventos_; presumidos = pagos não lançados (B3/FNet).
 * Devolve { porId ('N' + índice em presumidos), statusPlanilha (ticker|dia|tipo -> { situacao, dataB3, valorB3 }), resumo }.
 */
function conferirProventosComExtratoB3_(ss, planilha, presumidos, hoje) {
  var conf = { linhas: [], periodos: [] };
  try { conf = lerConferenciaB3Proventos_(ss); } catch (e) { console.log('conferência B3: ' + e); }
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  // linhas da aba que entram: desde a conferência ou desde o 1º mês conferido (com folga de dias)
  var inicio = CONFERENCIA_PROVENTOS_DESDE;
  conf.periodos.forEach(function (p) { if (p.inicio < inicio) inicio = p.inicio; });
  var minimo = inicio;
  try { minimo = chaveDiaISOInicio_(new Date(Date.UTC(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)) - 1, Number(inicio.slice(8, 10)) - CONFERENCIA_PROVENTOS_DIAS, 12))); } catch (e) { /* fica o início */ }
  var conhecidos = [];
  (planilha || []).forEach(function (p, i) {
    if (p.moeda !== 'BRL' || p.tipo === 'Juros' || !p.dataPagamento || p.dataPagamento > hoje || p.dataPagamento < minimo) return;
    conhecidos.push({ id: 'P' + i, ticker: p.ticker, tipo: p.tipo, data: p.dataPagamento, valor: p.liquido, fonte: 'Planilha' });
  });
  (presumidos || []).forEach(function (p, i) {
    conhecidos.push({ id: 'N' + i, ticker: p.ticker, tipo: p.tipo, data: p.dataPagamento, valor: p.valor, fonte: p.fonte });
  });
  var c = conciliarProventosB3_(conhecidos, conf.linhas, conf.periodos);

  var statusPlanilha = {};
  conhecidos.forEach(function (k) {
    if (k.fonte !== 'Planilha') return;
    var s = c.porId[k.id];
    if (!s && k.data < CONFERENCIA_PROVENTOS_DESDE) return; // anterior à conferência e fora dos meses conferidos
    var chave = k.ticker + '|' + k.data + '|' + normalizarTipoProvento_(k.tipo);
    var item = { situacao: s ? s.situacao : 'presumido' };
    if (s && s.dataB3) { item.dataB3 = s.dataB3; item.valorB3 = s.valorB3; }
    statusPlanilha[chave] = item;
  });

  // resumo pra tela: por mês conferido + listas do que pede atenção
  var periodos = conf.periodos.map(function (p) {
    return { mes: p.mes, inicio: p.inicio, fim: p.fim, conferidoEm: p.conferidoEm || '', confirmados: 0, divergentes: 0, naoConfirmados: 0, extras: 0 };
  });
  var periodoDe = function (data) { return periodos.filter(function (p) { return data >= p.inicio && data <= p.fim; })[0] || null; };
  var divergencias = [], naoConfirmados = [];
  var presumidos2 = { quantidade: 0, total: 0 };
  conhecidos.forEach(function (k) {
    var s = c.porId[k.id];
    if (!s) {
      if (k.fonte !== 'Planilha' || k.data >= CONFERENCIA_PROVENTOS_DESDE) { presumidos2.quantidade += 1; presumidos2.total = r2(presumidos2.total + (Number(k.valor) || 0)); }
      return;
    }
    if (s.situacao === 'nao_confirmado') {
      var pn = periodoDe(k.data);
      if (pn) pn.naoConfirmados += 1;
      naoConfirmados.push({ ticker: k.ticker, tipo: normalizarTipoProvento_(k.tipo), data: k.data, valor: r2(Number(k.valor) || 0), fonte: k.fonte });
      return;
    }
    var pc = periodoDe(s.dataB3) || periodoDe(k.data);
    if (pc) { if (s.situacao === 'divergente') pc.divergentes += 1; else pc.confirmados += 1; }
    if (s.situacao === 'divergente') {
      divergencias.push({ ticker: k.ticker, tipo: normalizarTipoProvento_(k.tipo), data: k.data, valor: r2(Number(k.valor) || 0), dataB3: s.dataB3, valorB3: s.valorB3, diferenca: s.diferenca, fonte: k.fonte });
    }
  });
  var extras = c.extras.map(function (e) {
    var pe = periodoDe(e.data);
    if (pe) pe.extras += 1;
    return { ticker: e.ticker, tipo: e.tipo, data: e.data, valor: e.valor };
  });
  var porData = function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : (a.ticker < b.ticker ? -1 : 1)); };
  return {
    porId: c.porId,
    statusPlanilha: statusPlanilha,
    resumo: {
      desde: CONFERENCIA_PROVENTOS_DESDE,
      periodos: periodos,
      presumidos: presumidos2,
      divergencias: divergencias.sort(porData),
      naoConfirmados: naoConfirmados.sort(porData),
      extras: extras.sort(porData)
    }
  };
}

/**
 * Guarda as linhas de provento do extrato da B3 em aux_proventos-conferencia
 * e marca os meses como conferidos. itens = os da importação de Lançamentos
 * (destino 'proventos', vindos de arquivo: { ticker, tipo, dataPagamento,
 * valor, qtd, arquivo }). A mesma linha em 2 arquivos do mesmo lote (Movimentação
 * + Proventos recebidos) conta 1 vez; mandar o mesmo extrato de novo (ou um
 * pedaço dele) não acrescenta nada.
 * Devolve o resumo da conferência dos meses desse extrato:
 * { ok, meses, confirmados, divergentes, naoConfirmados, extras, divergencias, naoConfirmadosLista, extrasLista }.
 */
function registrarExtratoB3Proventos_(itens, opcoes) {
  var o = opcoes || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = hojeSP_();
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var linhas = (itens || []).filter(function (it) {
    return it && it.destino === 'proventos' && it.arquivo && it.ticker && /^\d{4}-\d{2}-\d{2}$/.test(String(it.dataPagamento || '')) && Number(it.valor) > 0 && String(it.dataPagamento) <= hoje;
  }).map(function (it) {
    return { ticker: String(it.ticker).trim().toUpperCase(), tipo: normalizarTipoProvento_(it.tipo), data: String(it.dataPagamento), valor: r2(Number(it.valor)),
      quantidade: Number(it.qtd) || 0, arquivo: String(it.arquivo || '').slice(0, 120) };
  });
  if (!linhas.length) return null;
  var chave = function (l) { return l.ticker + '|' + l.data + '|' + l.tipo + '|' + l.valor.toFixed(2); };

  var trava = null;
  if (!o.semTrava) { try { trava = travaRecurso_('carteira', 'proventos'); trava.waitLock(20000); } catch (e) { trava = null; } } // semTrava: quem chama já segura
  try {
    var atual = lerConferenciaB3Proventos_(ss);
    // quantas vezes cada linha aparece: maior contagem entre os arquivos do lote
    var porArquivo = {};
    linhas.forEach(function (l) {
      var m = porArquivo[l.arquivo] = porArquivo[l.arquivo] || {};
      m[chave(l)] = (m[chave(l)] || 0) + 1;
    });
    var noLote = {}, exemplo = {};
    Object.keys(porArquivo).forEach(function (a) {
      Object.keys(porArquivo[a]).forEach(function (k) { noLote[k] = Math.max(noLote[k] || 0, porArquivo[a][k]); });
    });
    linhas.forEach(function (l) { if (!exemplo[chave(l)]) exemplo[chave(l)] = l; });
    var jaTem = {};
    atual.linhas.forEach(function (l) { jaTem[chave(l)] = (jaTem[chave(l)] || 0) + 1; });
    var novas = [];
    Object.keys(noLote).forEach(function (k) {
      for (var n = jaTem[k] || 0; n < noLote[k]; n++) novas.push(exemplo[k]);
    });

    // meses cobertos: mês que já acabou = inteiro; o mês de hoje = até a última data do extrato
    var mesHoje = hoje.slice(0, 7);
    var meses = {};
    linhas.forEach(function (l) {
      var mes = l.data.slice(0, 7);
      var fim = mes < mesHoje ? ultimoDiaMesProvento_(mes) : l.data;
      if (!meses[mes] || fim > meses[mes]) meses[mes] = fim;
    });
    var periodos = {};
    atual.periodos.forEach(function (p) { periodos[p.mes] = { fim: p.fim, conferidoEm: p.conferidoEm }; });
    Object.keys(meses).forEach(function (m) {
      var antes = periodos[m];
      periodos[m] = { fim: antes && antes.fim > meses[m] ? antes.fim : meses[m], conferidoEm: hoje };
    });

    var agora = new Date();
    var nomesArquivos = Object.keys(porArquivo).join(', ').slice(0, 200);
    var matriz = [CABECALHO_CONFERENCIA_PROVENTOS];
    atual.linhas.concat(novas).sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : (a.ticker < b.ticker ? -1 : 1)); })
      .forEach(function (l) {
        matriz.push([LINHA_CONFERENCIA_B3, l.ticker, l.tipo, dataDeChaveProvento_(l.data), l.valor, l.quantidade || '', l.arquivo, l.registradoEm || agora]);
      });
    Object.keys(periodos).sort().forEach(function (m) {
      var p = periodos[m];
      matriz.push([LINHA_CONFERENCIA_MES, m, '', dataDeChaveProvento_(p.fim), '', '', meses[m] ? nomesArquivos : '', meses[m] ? agora : dataDeChaveProvento_(p.conferidoEm)]);
    });
    var aba = ss.getSheetByName(ABA_CONFERENCIA_PROVENTOS) || ss.insertSheet(ABA_CONFERENCIA_PROVENTOS);
    aba.clearContents();
    aba.getRange(1, 1, matriz.length, CABECALHO_CONFERENCIA_PROVENTOS.length).setValues(matriz);
  } finally {
    if (trava) { try { trava.releaseLock(); } catch (e) { /* nada */ } }
  }
  invalidarCacheProventos_();

  // resumo dos meses desse extrato
  var res = montarProventosAnunciados_(null, { mapaCambioUsd: o.mapaCambioUsd || {} }).conferencia;
  var doLote = function (data) { return !!meses[String(data || '').slice(0, 7)]; };
  var listaMeses = Object.keys(meses).sort();
  var periodosLote = res.periodos.filter(function (p) { return meses[p.mes]; });
  var soma = function (campo) { return periodosLote.reduce(function (s, p) { return s + p[campo]; }, 0); };
  return {
    ok: true,
    meses: listaMeses,
    linhasNovas: novas.length,
    confirmados: soma('confirmados'),
    divergentes: soma('divergentes'),
    naoConfirmados: soma('naoConfirmados'),
    extras: soma('extras'),
    divergencias: res.divergencias.filter(function (d) { return doLote(d.dataB3) || doLote(d.data); }),
    naoConfirmadosLista: res.naoConfirmados.filter(function (d) { return doLote(d.data); }),
    extrasLista: res.extras.filter(function (d) { return doLote(d.data); })
  };
}
