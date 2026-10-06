/**
 * Fundamentos.gs - 03/10/2026 (Tiago: "Tenha um largo banco de dados de
 * critérios, para no site ser dinâmico as decisões e análises").
 *
 * Busca os FUNDAMENTOS de cada ativo da carteira em fontes gratuitas, sem
 * chave, e guarda numa aba (aux_fundamentos) que a tela do ativo e o Radar
 * leem SEM chamar a internet (rápido, nunca bloqueia a página). Quem enche
 * a aba é a agenda diária (Agenda.gs, etapa secundária "Fundamentos") ou a
 * função atualizarFundamentosDireto() no editor.
 *
 * Fontes (todas conferidas com curl em 03/10/2026):
 *  - Fundamentus (HTML latin-1): ações BR (múltiplos, margens, dívida,
 *    LPA/VPA, 52 semanas, proventos desde os anos 90) e FIIs (P/VP, VP/cota,
 *    DY, vacância média, imóveis, gestão). detalhes.php e proventos.php.
 *  - CVM dados abertos: FIIs (inf_mensal_fii / inf_trimestral_fii: cotistas,
 *    PL, VP/cota mês a mês, taxa de adm., caixa, alavancagem, vacância e
 *    inadimplência por imóvel, resultado x distribuído, vencimentos e
 *    indexadores) e ações BR (fca_cia_aberta: segmento de listagem, controle
 *    estatal). Zip + CSV ";" latin-1, filtrado pelos CNPJs/tickers da
 *    carteira. Atualiza 1x por MÊS.
 *  - Yahoo (sem chave): chart (preço, 52 semanas, bolsa NYSE/NASDAQ/OTC,
 *    dividendos desde sempre, volume) e fundamentals-timeseries (P/L, P/VP,
 *    EV/EBITDA, receita, lucro, FCL, dívida... já ajustados ao ADR).
 *  - SEC companyfacts (JSON, User-Agent genérico obrigatório): histórico
 *    anual pra CAGR 5 anos e anos com lucro (e reserva quando o Yahoo
 *    falhar). Não cobre PROSY (ADR nível 1, sem registro na SEC). 1x/semana.
 *  - Planilha (GOOGLEFINANCE): bloco de fórmulas na aba aux_fundamentos-gf
 *    (pe, eps, high52, low52, beta, volumeavg, marketcap, shares) - reserva
 *    quando as fontes de fora falham. Lido 1x por dia.
 *
 * Abas:
 *  - aux_fundamentos: Ticker | Fonte | JSON | Atualizado em (uma linha por
 *    ticker x fonte; JSON = { valores, historico?, avisos, ref? }).
 *  - aux_fundamentos-historico: Mês | Ticker | P/L | P/VP | DY | VP/cota |
 *    Fonte | Gravado em - "foto mensal" (a última do mês fica) do P/L, P/VP
 *    e DY da Auxiliar_ativos, pro motor comparar o ativo com a média dele.
 *  - aux_fundamentos-gf: fórmulas GOOGLEFINANCE (o script escreve).
 *
 * Cache: Fundamentus/Yahoo/planilha no máximo 1x por dia por ticker; SEC 1x
 * por semana; CVM 1x por mês. Cada execução para em ~4,5 min (limite de 6
 * min do Apps Script) e a próxima continua de onde parou (o que já está
 * fresco é pulado).
 *
 * Sanidade: valor absurdo (P/VP > 50, P/L > 200 ou < -200, "#DIV/0!",
 * percentual que veio como 850% etc.) é descartado com aviso.
 *
 * Contrato com o front (scratchpad/criterios/contrato-fundamentos.md):
 * resposta.fundamentos = { fonte, atualizadoEm, valores, historico, avisos }
 * - percentuais SEMPRE como fração (0.085 = 8,5%), dinheiro na moeda do
 * ativo, datas ISO. Ver lerFundamentosDoAtivo_ e anexarFundamentosAoRadar_.
 *
 * Funções pro editor (rodar 1x depois de colar):
 *   atualizarFundamentosDireto() - busca tudo agora (o que estiver vencido).
 *   estadoFundamentos() - cobertura por ticker/fonte, idade e avisos.
 * Testes: tests/harness/fundamentos.test.js.
 */

var ABA_FUNDAMENTOS = 'aux_fundamentos';
var CABECALHO_FUNDAMENTOS = ['Ticker', 'Fonte', 'JSON', 'Atualizado em'];
var ABA_FUNDAMENTOS_HIST = 'aux_fundamentos-historico';
var CABECALHO_FUNDAMENTOS_HIST = ['Mês', 'Ticker', 'P/L', 'P/VP', 'DY', 'VP/cota', 'Fonte', 'Gravado em'];
var ABA_FUNDAMENTOS_GF = 'aux_fundamentos-gf';
// GOOGLEFINANCE por classe (FII não tem P/L nem beta que prestem) - poucas fórmulas pra não pesar a planilha
var FUND_GF_ATRIBUTOS_ = ['pe', 'high52', 'low52', 'beta', 'volumeavg', 'marketcap'];
var FUND_GF_SO_FII_ = ['high52', 'low52', 'volumeavg'];

// SEC exige um User-Agent com contato - genérico de propósito (o repositório é público)
var FUND_UA_SEC_ = 'investiments-app contato@exemplo.com';
var FUND_UA_ = 'Mozilla/5.0';
var FUND_LIMITE_MS_ = 4.5 * 60 * 1000;
var FUND_FOLGA_MS_ = 40 * 1000;
// 05/10/2026 (A-49): Yahoo/Fundamentus de 1 -> 7 dias (cai ~85% das chamadas ao Yahoo, que é a fonte única de fato e não
// tem SLA nem autorização de uso); "planilha" fica em 1 dia porque é só leitura do GOOGLEFINANCE, sem rede.
var FUND_VALIDADE_DIAS_ = { fundamentus: 7, yahoo: 7, planilha: 1, sec: 7 }; // cvm: mês do calendário
// dado mais velho que isto, com a fonte em pausa, deixa de ser "dado de DD/MM" informativo e vira "Atenção" no Registro
var FUND_DADO_ANTIGO_DIAS_ = 14;
// 04/10/2026 (Tiago: "falharam: WIZC3|fundamentus (Error: HTTP 403 ...); isso rolou em todos"):
// o Fundamentus bloqueia (403) qualquer User-Agent que contenha "Google-Apps-Script" - e o
// UrlFetchApp SEMPRE acrescenta isso ao User-Agent, não tem como contornar daqui. As ações
// BR e os FIIs passam a usar o Yahoo (ticker + ".SA": múltiplos, balanço, proventos, 52s,
// volume) + CVM; o Fundamentus fica desligado (código mantido caso um dia haja um proxy).
var FUND_USAR_FUNDAMENTUS_ = false;
var FUND_ORDEM_FONTES_ = {
  acoes: ['cvm', 'yahoo', 'fundamentus', 'planilha'],
  fiis: ['cvm', 'yahoo', 'fundamentus', 'planilha'],
  acoesEua: ['yahoo', 'sec', 'planilha']
};
var FUND_CLASSES_PLANILHA_ = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações EUA': 'acoesEua' };

// Dado público e estático (não tem fonte gratuita estruturada): ADR, país-sede.
// PAM = ADR nível 2/3 na NYSE (1 ADS = 25 ações); PROSY = ADR nível 1 (OTC).
var FUND_INFO_EUA_ = {
  PAM: { adr: true, paisSede: 'Argentina' },
  PROSY: { adr: true, paisSede: 'Holanda' },
  GPRK: { adr: false, paisSede: 'Bermudas' }
};

// Ficam na aba (servem pras contas e pra conferir) mas NÃO vão pro site: não são do
// contrato e o motor do front trataria valor grande (ativo total em R$) como erro de dado
var FUND_CHAVES_INTERNAS_ = ['dividaLiquida', 'ativoTotal', 'ebit12m', 'acoes', 'cotacao', 'rendimento12m', 'cotas'];

// Chaves que são fração (0.085 = 8,5%): passou de 5 (500%) é unidade errada
var FUND_CHAVES_FRACAO_ = ['dy', 'dy12m', 'dyMedio5a', 'payout', 'roe', 'roic', 'roa', 'margemBruta', 'margemEbitda', 'margemEbit',
  'margemLiquida', 'cagrReceita5a', 'cagrLucro5a', 'earningsYield', 'fcfYield', 'vacanciaFisica', 'vacanciaFinanceira',
  'inadimplencia', 'taxaAdministracao', 'custoRelativo', 'pctCaixa', 'alavancagem', 'distribuicaoSobreResultado',
  'freeFloat', 'tagAlong', 'maiorInquilinoPct', 'contratosAtipicosPct', 'capRate', 'ffoYield', 'vencimentos12mPct'];

// ---------------------------------------------------------------------------
// Funções 1x (editor) e rotas do site
// ---------------------------------------------------------------------------

/** Rodar no editor: busca agora tudo o que está vencido (pode rodar de novo pra continuar se parar no tempo). */
function atualizarFundamentosDireto() {
  var r = atualizarFundamentos_('Manual', {});
  Logger.log(r.status + ' - ' + r.detalhe);
  return r;
}

/** Rodar no editor: cobertura por ticker (fontes, idade, nº de indicadores, avisos). */
function estadoFundamentos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var agora = new Date();
  var ativos = fundAtivosDaCarteira_(ss);
  var tabela = fundLerTabela_(ss);
  var linhas = [];
  var semNada = [];
  ativos.forEach(function (a) {
    var partes = [];
    var total = 0;
    (FUND_ORDEM_FONTES_[a.classe] || []).forEach(function (fonte) {
      var l = tabela.mapa[a.ticker + '|' + fonte];
      if (!l) { partes.push(fonte + ': -'); return; }
      var n = Object.keys((l.dados && l.dados.valores) || {}).length;
      total += n;
      partes.push(fonte + ': ' + n + ' (' + (l.atualizadoEm ? fundChaveDia_(l.atualizadoEm) : '?') +
        (fundEstaFresco_(fonte, l.atualizadoEm, agora) ? '' : ', vencido') + ')');
    });
    var montado = fundMontarDoTicker_(tabela, a.ticker, a.classe);
    if (!montado) semNada.push(a.ticker);
    linhas.push(a.ticker + ' [' + a.classe + '] ' + (montado ? Object.keys(montado.valores).length : 0) + ' indicador(es) — ' +
      partes.join(' · ') + (montado && montado.avisos.length ? ' — avisos: ' + montado.avisos.join(' | ') : ''));
  });
  var texto = 'Fundamentos (' + ativos.length + ' ativos; sem nenhum dado: ' + (semNada.join(', ') || 'nenhum') + ')\n' + linhas.join('\n');
  Logger.log(texto);
  return { texto: texto, semDados: semNada };
}

/** GET action=fundamentos&ticker=XXXX - os fundamentos já guardados (não busca na internet). */
function handleFundamentos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var ticker = String((e.parameter && e.parameter.ticker) || '').trim().toUpperCase();
    if (!ticker) return jsonOut({ ok: false, etapa: 'fundamentos', erro: 'parâmetro "ticker" obrigatório' });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ativo = fundAtivosDaCarteira_(ss).filter(function (a) { return a.ticker === ticker; })[0];
    var classe = ativo ? ativo.classe : (/11$/.test(ticker) ? 'fiis' : (/\d$/.test(ticker) ? 'acoes' : 'acoesEua'));
    return jsonOut({ ok: true, ticker: ticker, classe: classe, fundamentos: lerFundamentosDoAtivo_(ss, ticker, classe, null) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'fundamentos', erro: String(erro) });
  }
}

/** POST action=atualizarFundamentos[&ticker=XXXX][&forcar=1] - roda a coleta agora. */
function handleAtualizarFundamentos(e) {
  try {
    var p = e.parameter || {};
    var opcoes = {};
    if (p.ticker) opcoes.tickers = String(p.ticker).toUpperCase().split(',');
    if (p.forcar === '1' || p.forcar === 'true') opcoes.forcar = true;
    return jsonOut({ ok: true, resultado: atualizarFundamentos_('Manual', opcoes) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'atualizarFundamentos', erro: String(erro) });
  }
}

// ---------------------------------------------------------------------------
// Coleta (agenda diária / editor)
// ---------------------------------------------------------------------------

/**
 * Busca o que estiver vencido e grava aux_fundamentos (aos poucos - uma
 * execução interrompida não perde o que já leu) e a foto mensal.
 * opcoes: { tickers: [..] (só esses), forcar: true (ignora a validade), limiteMs }
 * Devolve { status: Sucesso|Atenção|Erro, detalhe, pendentes: [ticker|fonte], falhas, porTempo }.
 */
function atualizarFundamentos_(origem, opcoes) {
  opcoes = opcoes || {};
  var inicio = Date.now();
  var limite = opcoes.limiteMs || FUND_LIMITE_MS_;
  var temTempo = function () { return Date.now() - inicio < limite - FUND_FOLGA_MS_; };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var agora = new Date();
  var ativos = fundAtivosDaCarteira_(ss);
  if (opcoes.tickers && opcoes.tickers.length) ativos = ativos.filter(function (a) { return opcoes.tickers.indexOf(a.ticker) !== -1; });
  var tabela = fundLerTabela_(ss);
  var ctx = { agora: agora, hoje: fundChaveDia_(agora), temTempo: temTempo, tabela: tabela, cache: {} };
  var vencido = function (ticker, fonte) {
    if (opcoes.forcar) return true;
    var l = tabela.mapa[ticker + '|' + fonte];
    return !l || !fundEstaFresco_(fonte, l.atualizadoEm, agora);
  };
  var ok = [], falhas = [], pendentes = [], avisosGerais = [];
  var salvar = function (ticker, fonte, dados) {
    fundSanidade_(dados.valores || {}, dados.avisos || (dados.avisos = []), { fundamentus: 'Fundamentus', cvm: 'CVM', yahoo: 'Yahoo', sec: 'SEC', planilha: 'GOOGLEFINANCE' }[fonte]);
    tabela.mapa[ticker + '|' + fonte] = { ticker: ticker, fonte: fonte, dados: dados, atualizadoEm: agora };
    ok.push(ticker + '|' + fonte);
  };
  var gravarAgora = function () { try { fundGravarTabela_(ss, tabela); } catch (eG) { avisosGerais.push('não gravou a aba: ' + eG); } };

  // 1) planilha (GOOGLEFINANCE) - barato, sem rede: lê o que já calculou e mantém as fórmulas em dia
  try {
    var gf = fundColetarPlanilhaGf_(ss, ativos);
    Object.keys(gf).forEach(function (t) { if (vencido(t, 'planilha')) salvar(t, 'planilha', gf[t]); });
  } catch (eGf) { avisosGerais.push('GOOGLEFINANCE: ' + String(eGf).slice(0, 120)); }

  // 2) CVM (1x por mês, todos os FIIs / todas as ações de uma vez - 1 download por arquivo)
  var fiisCvm = ativos.filter(function (a) { return a.classe === 'fiis' && vencido(a.ticker, 'cvm'); });
  if (fiisCvm.length && temTempo()) {
    try {
      var cvmFii = fundColetarCvmFiis_(ss, fiisCvm, ctx);
      fiisCvm.forEach(function (a) {
        if (cvmFii[a.ticker]) salvar(a.ticker, 'cvm', cvmFii[a.ticker]);
        else falhas.push(a.ticker + '|cvm (sem CNPJ ou sem informe)');
      });
    } catch (eCf) { fiisCvm.forEach(function (a) { falhas.push(a.ticker + '|cvm (' + String(eCf).slice(0, 80) + ')'); }); }
    gravarAgora();
  } else if (fiisCvm.length) fiisCvm.forEach(function (a) { pendentes.push(a.ticker + '|cvm'); });
  var acoesCvm = ativos.filter(function (a) { return a.classe === 'acoes' && vencido(a.ticker, 'cvm'); });
  if (acoesCvm.length && temTempo()) {
    try {
      var cvmAcoes = fundColetarCvmAcoes_(acoesCvm, ctx);
      acoesCvm.forEach(function (a) {
        if (cvmAcoes[a.ticker]) salvar(a.ticker, 'cvm', cvmAcoes[a.ticker]);
        else falhas.push(a.ticker + '|cvm (não está no FCA)');
      });
    } catch (eCa) { acoesCvm.forEach(function (a) { falhas.push(a.ticker + '|cvm (' + String(eCa).slice(0, 80) + ')'); }); }
    gravarAgora();
  } else if (acoesCvm.length) acoesCvm.forEach(function (a) { pendentes.push(a.ticker + '|cvm'); });

  // 3) por ticker: Yahoo (BR com ".SA" e EUA) + SEC (EUA); Fundamentus só se religado (ver FUND_USAR_FUNDAMENTUS_)
  // 05/10/2026 (A-49): fonte que bloqueia (403/429) abre o DISJUNTOR PERSISTENTE (Fontes.gs): vale em todas as
  // execuções por 12 h (403) / 1 h (429), não só nesta. Enquanto pausada, o ticker mantém o último dado bom
  // ("dado de DD/MM") em vez de virar "falhou" - e a fonte nem é consultada (sem espera, sem cota).
  var emPausa = {};      // fonte -> descrição da pausa (1 por fonte, vai pro Registro)
  var mantidos = {};     // fonte -> [{ ticker, dia }] com dado anterior mantido
  var semDadoPausa = []; // ticker|fonte em pausa SEM nenhum dado anterior (aí sim é problema)
  var avisosPausa = [];  // informativos: não mudam o status (a menos que o dado fique velho demais)
  // contador honesto (A-49): conta ATIVOS, não "fonte x ativo" (antes saía "53/60 de 30 ativos")
  var atualizadosPor = {}; // ticker -> true: recebeu dado novo de fonte externa (a planilha/GOOGLEFINANCE não conta: é leitura local)
  var precisou = {};       // ticker -> true: tinha alguma fonte externa vencida
  var consultas = 0;
  ok.forEach(function (k) { var p = k.split('|'); if (p[1] !== 'planilha') { atualizadosPor[p[0]] = true; precisou[p[0]] = true; } });
  ativos.forEach(function (a) { if (vencido(a.ticker, 'cvm') && a.classe !== 'acoesEua') precisou[a.ticker] = true; });
  ativos.forEach(function (a) {
    var fontes = a.classe === 'acoesEua' ? ['yahoo', 'sec'] : (FUND_USAR_FUNDAMENTUS_ ? ['yahoo', 'fundamentus'] : ['yahoo']);
    fontes.forEach(function (fonte) {
      if (!vencido(a.ticker, fonte)) return;
      precisou[a.ticker] = true;
      var pausa = fundFontePausada_(fonte);
      if (pausa) {
        emPausa[fonte] = pausa;
        var ant = tabela.mapa[a.ticker + '|' + fonte];
        var dia = ant && ant.atualizadoEm && typeof ant.atualizadoEm.getTime === 'function' ? fundChaveDia_(ant.atualizadoEm) : null;
        if (dia) (mantidos[fonte] = mantidos[fonte] || []).push({ ticker: a.ticker, dia: dia });
        else semDadoPausa.push(a.ticker + '|' + fonte);
        return;
      }
      if (!temTempo()) { pendentes.push(a.ticker + '|' + fonte); return; }
      consultas++;
      try {
        var dados = fonte === 'fundamentus' ? fundColetarFundamentus_(a, ctx)
          : (fonte === 'yahoo' ? fundColetarYahoo_(a, ctx) : fundColetarSec_(a, ctx));
        if (dados) { salvar(a.ticker, fonte, dados); atualizadosPor[a.ticker] = true; }
        else falhas.push(a.ticker + '|' + fonte + ' (sem dado na fonte)');
      } catch (eT) {
        var pausaAgora = fundFontePausada_(fonte); // o próprio fundBuscar_ registrou a falha no disjuntor (Fontes.gs)
        if (pausaAgora && /HTTP (401|403|429|451)/.test(String(eT))) emPausa[fonte] = pausaAgora; // 1 aviso por fonte, não 1 falha por ticker
        else falhas.push(a.ticker + '|' + fonte + ' (' + String(eT).slice(0, 80) + ')');
      }
      gravarAgora();
    });
  });
  // linhas "dado de DD/MM" por fonte em pausa (informativo; só vira Atenção se o dado ficou velho demais)
  var dadoAntigo = false;
  Object.keys(emPausa).forEach(function (fonte) {
    var rotulo = ({ sec: 'SEC', fundamentus: 'Fundamentus', yahoo: 'Yahoo' }[fonte] || fonte);
    var m = mantidos[fonte] || [];
    var dias = m.map(function (x) { return x.dia; }).sort();
    var txt = rotulo + ' em pausa: ' + emPausa[fonte] + '.';
    if (m.length) txt += ' Mantido o dado de ' + (dias[0] === dias[dias.length - 1] ? fundDiaBr_(dias[0]) : fundDiaBr_(dias[0]) + ' a ' + fundDiaBr_(dias[dias.length - 1])) + ' em ' + m.length + ' ativo(s).';
    if (dias.length && fundDiasEntre_(dias[0], ctx.hoje) > FUND_DADO_ANTIGO_DIAS_) dadoAntigo = true;
    avisosPausa.push(txt);
  });
  semDadoPausa.forEach(function (k) { falhas.push(k + ' (fonte em pausa e sem dado anterior)'); });

  // 4) foto mensal (P/L, P/VP, DY) - barato
  try { fundGravarFotoMensal_(ss, ativos, tabela, agora); } catch (eH) { avisosGerais.push('foto mensal: ' + String(eH).slice(0, 120)); }
  gravarAgora();

  var nAtualizados = Object.keys(atualizadosPor).length;
  var nEmDia = ativos.filter(function (a) { return !precisou[a.ticker]; }).length;
  var partes = ['Fundamentos: ' + nAtualizados + ' de ' + ativos.length + ' ativo(s) com dado novo agora (' + ok.length + ' fonte(s) gravada(s), ' + consultas + ' consulta(s) a Yahoo/SEC); ' +
    nEmDia + ' ainda dentro da validade (Yahoo/SEC ' + FUND_VALIDADE_DIAS_.yahoo + ' dias, CVM até virar o mês)'];
  if (falhas.length) partes.push('falharam: ' + falhas.join('; '));
  if (pendentes.length) partes.push('ficou pra próxima (tempo): ' + pendentes.join(', '));
  if (avisosPausa.length) partes.push(avisosPausa.join(' '));
  if (avisosGerais.length) partes.push(avisosGerais.join('; '));
  var totalTentado = ok.length + falhas.length;
  var status = (totalTentado && !ok.length) ? 'Erro' : ((falhas.length || pendentes.length || avisosGerais.length || dadoAntigo) ? 'Atenção' : 'Sucesso');
  var detalhe = partes.join(' — ');
  try { if (typeof gravarRegistroControle_ === 'function') gravarRegistroControle_(status, origem, detalhe); } catch (eR) { Logger.log('Registro de Controle: ' + eR); }
  return { status: status, detalhe: detalhe, atualizados: ok, falhas: falhas, pendentes: pendentes, porTempo: pendentes.length > 0 };
}

/** Ativos da Auxiliar_ativos (A=Classe, B=Ticker, C=Nome, F=Preço, L=P/VP, N=P/L, P=Setor, Q=DY) das 3 classes de renda variável. */
function fundAtivosDaCarteira_(ss) {
  var aba = ss.getSheetByName('Auxiliar_ativos');
  if (!aba || aba.getLastRow() < 2) return [];
  var vistos = {};
  var out = [];
  aba.getRange(2, 1, aba.getLastRow() - 1, 17).getValues().forEach(function (l) {
    var classe = FUND_CLASSES_PLANILHA_[String(l[0] || '').trim()];
    var t = String(l[1] || '').trim().toUpperCase();
    if (!classe || !t || vistos[t]) return;
    // direito de subscrição (AXIA15G...) e recibos não têm fundamentos próprios
    if (classe !== 'acoesEua' && !/^[A-Z0-9]{4}\d{1,2}$/.test(t)) return;
    if (classe === 'acoesEua' && !/^[A-Z][A-Z.\-]{0,6}$/.test(t)) return;
    vistos[t] = 1;
    out.push({ ticker: t, classe: classe, nome: String(l[2] || ''), preco: fundNumero_(l[5]), pvp: l[11], pl: l[13], setor: String(l[15] || ''), dy: l[16] });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Aba aux_fundamentos
// ---------------------------------------------------------------------------

function fundLerTabela_(ss) {
  var mapa = {};
  var aba = ss.getSheetByName(ABA_FUNDAMENTOS);
  if (aba && aba.getLastRow() >= 2) {
    aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_FUNDAMENTOS.length).getValues().forEach(function (l) {
      var t = String(l[0] || '').trim().toUpperCase();
      var f = String(l[1] || '').trim();
      if (!t || !f) return;
      var dados = null;
      try { dados = JSON.parse(String(l[2] || '{}')); } catch (e) { dados = null; }
      if (!dados || typeof dados !== 'object') return;
      var quando = l[3] instanceof Date ? l[3] : (l[3] ? new Date(l[3]) : null);
      mapa[t + '|' + f] = { ticker: t, fonte: f, dados: dados, atualizadoEm: quando && !isNaN(quando.getTime()) ? quando : null };
    });
  }
  return { mapa: mapa };
}

function fundGravarTabela_(ss, tabela) {
  var aba = ss.getSheetByName(ABA_FUNDAMENTOS) || ss.insertSheet(ABA_FUNDAMENTOS);
  var linhas = Object.keys(tabela.mapa).sort().map(function (k) {
    var l = tabela.mapa[k];
    var json = JSON.stringify(l.dados);
    if (json.length > 49000) json = JSON.stringify({ valores: l.dados.valores, avisos: (l.dados.avisos || []).concat(['histórico cortado (limite da célula)']) });
    return [l.ticker, l.fonte, json, l.atualizadoEm || ''];
  });
  aba.clearContents();
  aba.getRange(1, 1, 1, CABECALHO_FUNDAMENTOS.length).setValues([CABECALHO_FUNDAMENTOS]);
  if (linhas.length) aba.getRange(2, 1, linhas.length, CABECALHO_FUNDAMENTOS.length).setValues(linhas);
}

/** Validade: CVM vale até virar o mês; Yahoo/Fundamentus/SEC 7 dias; planilha 1 dia (dia do calendário de SP). */
function fundEstaFresco_(fonte, atualizadoEm, agora) {
  if (!(atualizadoEm instanceof Date) || isNaN(atualizadoEm.getTime())) return false;
  var d1 = fundChaveDia_(atualizadoEm), d2 = fundChaveDia_(agora);
  if (fonte === 'cvm') return d1.slice(0, 7) === d2.slice(0, 7);
  var dias = FUND_VALIDADE_DIAS_[fonte] || 1;
  if (dias <= 1) return d1 === d2;
  return agora.getTime() - atualizadoEm.getTime() < dias * 86400000;
}

// ---------------------------------------------------------------------------
// Leitura pro site (Ativo.gs e Radar) - só a planilha, nunca a internet
// ---------------------------------------------------------------------------

/**
 * Junta as fontes de um ticker numa resposta do contrato:
 * { fonte, atualizadoEm, valores, historico, avisos } - ou null sem dado.
 * serie (opcional) = série diária do ativo [{data, preco}] (Ativo.gs) - nos
 * FIIs vira o P/VP mês a mês (preço do fim do mês ÷ VP/cota da CVM).
 */
function lerFundamentosDoAtivo_(ss, ticker, classe, serie) {
  ticker = String(ticker || '').toUpperCase();
  var tabela = fundLerTabela_(ss);
  var montado = fundMontarDoTicker_(tabela, ticker, classe);
  var historico = fundHistoricoDoAtivo_(ss, tabela, ticker, classe, serie);
  if (!montado && !Object.keys(historico).length) return null;
  montado = montado || { fontes: [], atualizadoEm: null, valores: {}, avisos: [] };
  var out = {
    fonte: montado.fontes.length === 1 ? montado.fontes[0] : montado.fontes,
    atualizadoEm: montado.atualizadoEm,
    valores: montado.valores,
    avisos: montado.avisos
  };
  if (Object.keys(historico).length) out.historico = historico;
  return out;
}

/** Radar (DistribuicoesMetas.gs): item.fundamentos = { fonte, atualizadoEm, valores } por ticker (sem histórico). */
function anexarFundamentosAoRadar_(ss, grupos) {
  var tabela = fundLerTabela_(ss);
  grupos.forEach(function (g) {
    (g.itens || []).forEach(function (item) {
      var t = String(item.ativo || '').trim().toUpperCase();
      if (!t) return;
      var m = fundMontarDoTicker_(tabela, t, g.classe);
      if (!m || !Object.keys(m.valores).length) return;
      item.fundamentos = { fonte: m.fontes.length === 1 ? m.fontes[0] : m.fontes, atualizadoEm: m.atualizadoEm, valores: m.valores };
    });
  });
}

/** Mescla as fontes de um ticker na ordem de prioridade da classe (a 1ª que tiver a chave ganha). */
function fundMontarDoTicker_(tabela, ticker, classe) {
  var ordem = FUND_ORDEM_FONTES_[classe] || ['fundamentus', 'cvm', 'yahoo', 'sec', 'planilha'];
  var valores = {}, fontes = [], avisos = [], ultima = null, cotacao = null;
  ordem.forEach(function (fonte) {
    var l = tabela.mapa[ticker + '|' + fonte];
    if (!l || !l.dados) return;
    var v = l.dados.valores || {};
    if (cotacao == null && v.cotacao > 0) cotacao = v.cotacao;
    var usou = false;
    Object.keys(v).forEach(function (k) {
      if (v[k] == null || valores[k] != null || FUND_CHAVES_INTERNAS_.indexOf(k) !== -1) return;
      // 05/10/2026 (A-26): P/VP absurdo vindo só da planilha não entra (sem outra fonte pra comparar, vale o teto de 10 em BR)
      if (k === 'pvp' && fonte === 'planilha') { var mp = fundPvpPlanilhaSuspeito_(v[k], null, classe); if (mp) { avisos.push('P/VP da planilha descartado: ' + mp + '.'); return; } }
      valores[k] = v[k];
      usou = true;
    });
    if (!usou) return;
    fontes.push(fonte);
    (l.dados.avisos || []).forEach(function (a) { if (avisos.indexOf(a) === -1) avisos.push(a); });
    if (l.atualizadoEm && (!ultima || l.atualizadoEm > ultima)) ultima = l.atualizadoEm;
  });
  if (!fontes.length) return null;
  // 04/10/2026: histórico anual da SEC (10 anos) é melhor que o anual do Yahoo (~4 anos) quando existe
  var lSec = tabela.mapa[ticker + '|sec'];
  if (lSec && lSec.dados && lSec.dados.valores) ['cagrReceita5a', 'cagrLucro5a', 'anosComLucro'].forEach(function (k) {
    if (lSec.dados.valores[k] != null) valores[k] = lSec.dados.valores[k];
  });
  // 04/10/2026: FII sem Fundamentus - P/VP = cotação (Yahoo) ÷ VP/cota (CVM)
  if (classe === 'fiis' && valores.pvp == null && valores.vpCota > 0 && cotacao > 0) valores.pvp = Math.round(cotacao / valores.vpCota * 100) / 100;
  fundSanidade_(valores, avisos); // defensivo: linha antiga gravada antes de uma regra nova
  return { fontes: fontes, atualizadoEm: ultima ? fundChaveDia_(ultima) : null, valores: valores, avisos: avisos };
}

/** historico: { pl, pvp, dy|dy12m, vpCota: [{data:'AAAA-MM', valor}] } - foto mensal + CVM (+ P/VP derivado nos FIIs). */
function fundHistoricoDoAtivo_(ss, tabela, ticker, classe, serie) {
  var ehFii = classe === 'fiis';
  var chaveDy = ehFii ? 'dy12m' : 'dy';
  var mapas = { pl: {}, pvp: {}, vpCota: {} };
  mapas[chaveDy] = {};
  fundLerHistorico_(ss, ticker).forEach(function (h) {
    if (!ehFii && h.pl != null) mapas.pl[h.mes] = h.pl;
    if (h.pvp != null) mapas.pvp[h.mes] = h.pvp;
    if (h.dy != null) mapas[chaveDy][h.mes] = h.dy;
    if (ehFii && h.vpCota != null) mapas.vpCota[h.mes] = h.vpCota;
  });
  var cvm = tabela.mapa[ticker + '|cvm'];
  var hvp = cvm && cvm.dados && cvm.dados.historico && cvm.dados.historico.vpCota;
  if (ehFii && hvp && hvp.length) {
    hvp.forEach(function (p) { if (p && /^\d{4}-\d{2}$/.test(p.data) && p.valor > 0) mapas.vpCota[p.data] = p.valor; });
    // P/VP de cada mês = preço do último pregão do mês ÷ VP/cota daquele mês
    var precoFimMes = {};
    (serie || []).forEach(function (p) {
      if (!p || !(p.preco > 0) || typeof p.data !== 'string') return;
      precoFimMes[p.data.slice(0, 7)] = p.preco; // série em ordem crescente: fica o último do mês
    });
    Object.keys(mapas.vpCota).forEach(function (mes) {
      if (mapas.pvp[mes] != null || !(precoFimMes[mes] > 0)) return;
      mapas.pvp[mes] = Math.round(precoFimMes[mes] / mapas.vpCota[mes] * 10000) / 10000;
    });
  }
  var out = {};
  Object.keys(mapas).forEach(function (k) {
    var meses = Object.keys(mapas[k]).sort();
    if (!meses.length) return;
    out[k] = meses.map(function (m) { return { data: m, valor: mapas[k][m] }; });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Foto mensal (aux_fundamentos-historico)
// ---------------------------------------------------------------------------

/** Atualiza a linha (mês atual, ticker) com P/L, P/VP e DY da Auxiliar_ativos (ou dos fundamentos, se a planilha não tiver). */
function fundGravarFotoMensal_(ss, ativos, tabela, agora) {
  var aba = ss.getSheetByName(ABA_FUNDAMENTOS_HIST) || ss.insertSheet(ABA_FUNDAMENTOS_HIST);
  var mes = fundChaveDia_(agora).slice(0, 7);
  var linhas = aba.getLastRow() >= 2 ? aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_FUNDAMENTOS_HIST.length).getValues() : [];
  var indice = {};
  linhas.forEach(function (l, i) { indice[fundMesDeCelula_(l[0]) + '|' + String(l[1] || '').toUpperCase()] = i; });
  ativos.forEach(function (a) {
    var m = fundMontarDoTicker_(tabela, a.ticker, a.classe);
    var v = (m && m.valores) || {};
    var ehFii = a.classe === 'fiis';
    var lixo = [];
    var limpo = function (x, chave) {
      var n = fundNumero_(x);
      if (n == null) return null;
      var o = {}; o[chave] = n;
      fundSanidade_(o, lixo);
      return o[chave] == null ? null : n;
    };
    var pl = ehFii ? null : (limpo(a.pl, 'pl') != null ? limpo(a.pl, 'pl') : limpo(v.pl, 'pl'));
    var pvpPlanilha = limpo(a.pvp, 'pvp');
    var pvpOutras = limpo(v.pvp, 'pvp');
    // 05/10/2026 (auditoria A-26): P/VP da planilha absurdo (> 10 em BR) ou > 50% distante do das outras fontes é
    // descartado (foi gravado ~30 contra ~2 do Yahoo) - vira aviso no log e a foto usa a outra fonte.
    var motivoPvp = fundPvpPlanilhaSuspeito_(pvpPlanilha, pvpOutras, a.classe);
    if (motivoPvp) { Logger.log('Foto mensal: P/VP de ' + a.ticker + ' na planilha descartado - ' + motivoPvp + '.'); pvpPlanilha = null; }
    var pvp = pvpPlanilha != null ? pvpPlanilha : pvpOutras;
    var dyPl = limpo(a.dy, 'dy');
    var dy = dyPl != null && dyPl > 0 ? dyPl : limpo(ehFii ? v.dy12m : v.dy, 'dy');
    var vp = ehFii ? limpo(v.vpCota, 'vpCota') : null;
    if (pl == null && pvp == null && dy == null && vp == null) return;
    var fonte = (pvpPlanilha != null) || (a.pl != null && a.pl !== '') ? 'planilha' : ((m && m.fontes[0]) || '');
    var linha = ["'" + mes, a.ticker, pl == null ? '' : pl, pvp == null ? '' : pvp, dy == null ? '' : dy, vp == null ? '' : vp, fonte, agora];
    var k = mes + '|' + a.ticker;
    if (indice[k] != null) linhas[indice[k]] = linha;
    else { indice[k] = linhas.length; linhas.push(linha); }
  });
  aba.getRange(1, 1, 1, CABECALHO_FUNDAMENTOS_HIST.length).setValues([CABECALHO_FUNDAMENTOS_HIST]);
  if (linhas.length) aba.getRange(2, 1, linhas.length, CABECALHO_FUNDAMENTOS_HIST.length).setValues(linhas);
}

function fundLerHistorico_(ss, ticker) {
  var aba = ss.getSheetByName(ABA_FUNDAMENTOS_HIST);
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_FUNDAMENTOS_HIST.length).getValues()
    .filter(function (l) { return String(l[1] || '').trim().toUpperCase() === ticker && /^\d{4}-\d{2}$/.test(fundMesDeCelula_(l[0])); })
    .map(function (l) { return { mes: fundMesDeCelula_(l[0]), pl: fundNumero_(l[2]), pvp: fundNumero_(l[3]), dy: fundNumero_(l[4]), vpCota: fundNumero_(l[5]) }; });
}

/** A célula "Mês" pode voltar como texto "2026-10" ou como Date (o Sheets converte). */
function fundMesDeCelula_(v) {
  if (v instanceof Date) return fundChaveDia_(v).slice(0, 7);
  var s = String(v || '').trim().replace(/^'/, '');
  var m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return m[1] + '-' + m[2];
  m = s.match(/^(\d{2})\/(\d{4})$/);
  return m ? m[2] + '-' + m[1] : s;
}

// ---------------------------------------------------------------------------
// Fonte: Fundamentus (ações BR e FIIs)
// ---------------------------------------------------------------------------

function fundColetarFundamentus_(ativo, ctx) {
  var ehFii = ativo.classe === 'fiis';
  var campos = fundParseFundamentusDetalhes_(fundBuscarTexto_('https://www.fundamentus.com.br/detalhes.php?papel=' + ativo.ticker, 'ISO-8859-1'));
  var ref = null;
  var avisos = [];
  if (!campos && !ehFii) {
    // classe nova sem página própria (ex.: AXIA7): dados DA EMPRESA pela outra classe (mesmo radical)
    var raiz = ativo.ticker.slice(0, 4);
    var irmaos = ['3', '4', '11', '5', '6'].map(function (s) { return raiz + s; }).filter(function (t) { return t !== ativo.ticker; });
    for (var i = 0; i < irmaos.length && !campos && ctx.temTempo(); i++) {
      campos = fundParseFundamentusDetalhes_(fundBuscarTexto_('https://www.fundamentus.com.br/detalhes.php?papel=' + irmaos[i], 'ISO-8859-1'));
      if (campos) ref = irmaos[i];
    }
  }
  if (!campos) return null;
  var valores = ehFii ? fundMapearFundamentusFii_(campos) : fundMapearFundamentusAcao_(campos);
  if (ref) {
    // múltiplos que dependem do preço são da OUTRA classe: refaz com o preço deste ticker (planilha) ou descarta
    ['pl', 'pvp', 'psr', 'evEbitda', 'evEbit', 'dy', 'maxima52s', 'minima52s', 'volumeMedio2m', 'earningsYield', 'payout'].forEach(function (k) { delete valores[k]; });
    if (ativo.preco > 0 && valores.lpa) valores.pl = Math.round(ativo.preco / valores.lpa * 100) / 100;
    if (ativo.preco > 0 && valores.vpa > 0) valores.pvp = Math.round(ativo.preco / valores.vpa * 100) / 100;
    avisos.push(ativo.ticker + ' não tem página no Fundamentus: dados da empresa via ' + ref + ' (P/L e P/VP refeitos com o preço de ' + ativo.ticker + ').');
  }
  // proventos (histórico completo): anos pagando/aumentando, DPA 12m, payout real
  if (ctx.temTempo()) {
    try {
      var pagina = ehFii ? 'fii_proventos.php' : 'proventos.php';
      var prov = fundParseFundamentusProventos_(fundBuscarTexto_('https://www.fundamentus.com.br/' + pagina + '?papel=' + (ref || ativo.ticker) + '&tipo=2', 'ISO-8859-1'));
      var r = fundResumoProventos_(prov, ctx.hoje);
      if (ehFii) {
        if (r.ultimo != null) valores.ultimoRendimento = r.ultimo;
        if (r.porMes12m != null && valores.rendimentoMedio12m == null) valores.rendimentoMedio12m = r.porMes12m;
      } else if (!ref) {
        if (r.anosPagando != null) valores.anosPagandoDividendos = r.anosPagando;
        if (r.anosAumentando != null) valores.anosAumentandoDividendos = r.anosAumentando;
        if (r.soma12m != null) {
          valores.dpa12m = r.soma12m;
          if (valores.lpa > 0) valores.payout = Math.round(r.soma12m / valores.lpa * 10000) / 10000;
          if (valores.acoes > 0) valores.dividendosPagos12m = Math.round(r.soma12m * valores.acoes);
        }
      }
    } catch (eP) { avisos.push('proventos do Fundamentus não vieram: ' + String(eP).slice(0, 80)); }
  }
  if (!ehFii) { valores.bolsa = 'B3'; valores.adr = false; valores.paisSede = 'Brasil'; }
  return { valores: valores, avisos: avisos, ref: ref || undefined, dataRef: campos['Últ balanço processado'] || campos['Relatório'] || undefined };
}

/** Rótulo -> texto da célula de dados (2ª ocorrência do mesmo rótulo = últimos 3 meses, vira "Rótulo (3m)"). null = página sem papel. */
function fundParseFundamentusDetalhes_(html) {
  if (!html || /Nenhum papel encontrado/i.test(html)) return null;
  var campos = {};
  var re = /<td\b[^>]*class="(label|data)[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  var m, rotulo = null, n = 0;
  while ((m = re.exec(html))) {
    var txt = fundTextoHtml_(m[2]);
    if (m[1].toLowerCase() === 'label') { rotulo = txt.replace(/^\?\s*/, '').trim(); continue; }
    if (rotulo) {
      if (Object.prototype.hasOwnProperty.call(campos, rotulo)) campos[rotulo + ' (3m)'] = txt;
      else campos[rotulo] = txt;
      n++;
    }
    rotulo = null;
  }
  return n >= 3 ? campos : null;
}

function fundMapearFundamentusAcao_(c) {
  var v = {};
  var pega = function (chave, rotulo) { var x = fundNumeroBr_(c[rotulo]); if (x != null) v[chave] = x; };
  pega('pl', 'P/L'); pega('pvp', 'P/VP'); pega('psr', 'PSR'); pega('dy', 'Div. Yield');
  pega('evEbitda', 'EV / EBITDA'); pega('evEbit', 'EV / EBIT'); pega('roe', 'ROE'); pega('roic', 'ROIC');
  pega('margemBruta', 'Marg. Bruta'); pega('margemEbit', 'Marg. EBIT'); pega('margemLiquida', 'Marg. Líquida');
  pega('liquidezCorrente', 'Liquidez Corr'); pega('dividaLiquidaPl', 'Dív Líq / Patrim'); pega('cagrReceita5a', 'Cres. Rec (5a)');
  pega('lpa', 'LPA'); pega('vpa', 'VPA'); pega('volumeMedio2m', 'Vol $ méd (2m)'); pega('valorMercado', 'Valor de mercado');
  pega('minima52s', 'Min 52 sem'); pega('maxima52s', 'Max 52 sem'); pega('receitaLiquida12m', 'Receita Líquida');
  pega('lucroLiquido12m', 'Lucro Líquido'); pega('ebit12m', 'EBIT'); pega('patrimonioLiquido', 'Patrim. Líq');
  pega('dividaLiquida', 'Dív. Líquida'); pega('acoes', 'Nro. Ações'); pega('ativoTotal', 'Ativo');
  var firma = fundNumeroBr_(c['Valor da firma']);
  if (c.Setor) v.setor = c.Setor;
  if (c.Subsetor) v.subsetor = c.Subsetor;
  var banco = c['Result Int Financ'] != null || c['Cart. de Crédito'] != null;
  if (!(v.receitaLiquida12m > 0)) {
    // holding (ex.: seguridade) aparece com receita 0 e margens "0,0%": não é margem zero, é sem receita
    ['receitaLiquida12m', 'margemBruta', 'margemEbit', 'margemLiquida', 'psr', 'evEbitda', 'evEbit'].forEach(function (k) { delete v[k]; });
    if (v.dividaLiquida === 0) delete v.dividaLiquida;
  }
  if (banco) {
    // página de banco: sem receita/EBIT - margens "0,0%" e EV não têm sentido
    ['margemBruta', 'margemEbit', 'margemLiquida', 'evEbitda', 'evEbit', 'psr', 'liquidezCorrente', 'dividaLiquidaPl', 'roic'].forEach(function (k) { delete v[k]; });
  } else {
    if (firma > 0 && v.evEbitda > 0) {
      v.ebitda12m = Math.round(firma / v.evEbitda);
      if (v.receitaLiquida12m > 0) v.margemEbitda = fundArred_(v.ebitda12m / v.receitaLiquida12m, 4);
      if (v.dividaLiquida != null) v.dividaLiquidaEbitda = fundArred_(v.dividaLiquida / v.ebitda12m, 2);
    }
  }
  if (v.lucroLiquido12m != null && v.ativoTotal > 0) v.roa = fundArred_(v.lucroLiquido12m / v.ativoTotal, 4);
  if (v.pl > 0) v.earningsYield = fundArred_(1 / v.pl, 4);
  return v;
}

function fundMapearFundamentusFii_(c) {
  var v = {};
  var pega = function (chave, rotulo) { var x = fundNumeroBr_(c[rotulo]); if (x != null) v[chave] = x; };
  pega('pvp', 'P/VP'); pega('vpCota', 'VP/Cota'); pega('dy12m', 'Div. Yield'); pega('rendimento12m', 'Dividendo/cota');
  pega('liquidezDiaria', 'Vol $ méd (2m)'); pega('valorMercado', 'Valor de mercado'); pega('patrimonioLiquido', 'Patrim Líquido');
  pega('numeroImoveis', 'Qtd imóveis'); pega('capRate', 'Cap Rate'); pega('ffoYield', 'FFO Yield');
  pega('minima52s', 'Min 52 sem'); pega('maxima52s', 'Max 52 sem'); pega('cotas', 'Nro. Cotas');
  var vac = fundNumeroBr_(c['Vacância Média']);
  if (vac != null && v.numeroImoveis > 0) v.vacanciaFisica = vac; // fundo de papel aparece com 0% - não é vacância
  if (v.rendimento12m > 0) v.rendimentoMedio12m = fundArred_(v.rendimento12m / 12, 4);
  var ffo = fundNumeroBr_(c.FFO), dist = fundNumeroBr_(c['Rend. Distribuído']);
  if (ffo > 0 && dist != null) v.distribuicaoSobreFfo = fundArred_(dist / ffo, 4);
  var gestao = String(c['Gestão'] || '').trim().toLowerCase();
  if (/ativa|passiva/.test(gestao)) v.tipoGestao = /passiva/.test(gestao) ? 'passiva' : 'ativa';
  if (c.Segmento) v.segmentoFonte = c.Segmento; // texto da fonte; "segmento" (régua do motor) fica com a planilha
  if (c.Mandato) v.mandato = c.Mandato;
  return v;
}

/** Tabela de proventos: [{ dataCom:'AAAA-MM-DD', valor (por ação), tipo }]. Ações: Data|Valor|Tipo|Pagamento|Por quantas; FIIs: Data com|Tipo|Pagamento|Valor. */
function fundParseFundamentusProventos_(html) {
  var out = [];
  var corpo = String(html || '');
  var i = corpo.indexOf('<tbody');
  if (i === -1) return out;
  corpo = corpo.slice(i);
  var reTr = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, mTr;
  while ((mTr = reTr.exec(corpo))) {
    var cel = [], reTd = /<td\b[^>]*>([\s\S]*?)<\/td>/gi, mTd;
    while ((mTd = reTd.exec(mTr[1]))) cel.push(fundTextoHtml_(mTd[1]));
    if (cel.length < 4) continue;
    var data = fundDataBr_(cel[0]);
    if (!data) continue;
    var valor, tipo;
    if (fundNumeroBr_(cel[1]) != null) { // ação
      valor = fundNumeroBr_(cel[1]);
      var por = fundNumeroBr_(cel[4]);
      if (por > 1) valor = valor / por;
      tipo = cel[2];
    } else { // FII
      valor = fundNumeroBr_(cel[3]);
      tipo = cel[1];
    }
    if (valor == null || valor <= 0) continue;
    out.push({ dataCom: data, valor: valor, tipo: tipo });
  }
  return out;
}

/**
 * anosPagando: anos-calendário completos SEGUIDOS (até o ano passado) com
 * algum provento; anosAumentando: anos seguidos com soma maior que a do
 * ano anterior; soma12m: soma por ação com data-com nos últimos 12 meses;
 * porMes12m = soma12m/12; ultimo = o provento mais recente.
 */
function fundResumoProventos_(lista, hojeIso) {
  var r = { anosPagando: null, anosAumentando: null, soma12m: null, porMes12m: null, ultimo: null };
  if (!lista || !lista.length) return lista ? { anosPagando: 0, anosAumentando: 0, soma12m: 0, porMes12m: 0, ultimo: null } : r;
  var porAno = {};
  var corte = fundSomarDiasIso_(hojeIso, -365);
  var soma12 = 0, ultimo = null;
  lista.forEach(function (p) {
    var ano = Number(p.dataCom.slice(0, 4));
    porAno[ano] = (porAno[ano] || 0) + p.valor;
    if (p.dataCom > corte && p.dataCom <= hojeIso) soma12 += p.valor;
    if (!ultimo || p.dataCom > ultimo.dataCom) ultimo = p;
  });
  var anoPassado = Number(hojeIso.slice(0, 4)) - 1;
  var pagando = 0;
  for (var a = anoPassado; porAno[a] > 0; a--) pagando++;
  var aumentando = 0;
  for (var b = anoPassado; porAno[b] > 0 && porAno[b - 1] > 0 && porAno[b] > porAno[b - 1] * 1.0001; b--) aumentando++;
  r.anosPagando = pagando;
  r.anosAumentando = aumentando;
  r.soma12m = fundArred_(soma12, 6);
  r.porMes12m = fundArred_(soma12 / 12, 6);
  r.ultimo = ultimo ? fundArred_(ultimo.valor, 6) : null;
  return r;
}

// ---------------------------------------------------------------------------
// Fonte: Yahoo (EUA) - chart + fundamentals-timeseries
// ---------------------------------------------------------------------------

var FUND_YAHOO_TIPOS_ = ['trailingPeRatio', 'trailingPbRatio', 'trailingPsRatio', 'trailingPegRatio', 'trailingEnterprisesValueEBITDARatio',
  'trailingMarketCap', 'trailingTotalRevenue', 'trailingNetIncome', 'trailingEBITDA', 'trailingEBIT', 'trailingGrossProfit',
  'trailingOperatingIncome', 'trailingFreeCashFlow', 'trailingCashDividendsPaid', 'trailingRepurchaseOfCapitalStock',
  'trailingInterestExpense', 'trailingDilutedEPS', 'quarterlyStockholdersEquity', 'quarterlyTotalDebt', 'quarterlyCashAndCashEquivalents',
  'quarterlyNetDebt', 'quarterlyCurrentAssets', 'quarterlyCurrentLiabilities', 'quarterlyTotalAssets', 'quarterlyOrdinarySharesNumber',
  'annualTotalRevenue', 'annualNetIncome'];

function fundColetarYahoo_(ativo, ctx) {
  var br = ativo.classe === 'acoes' || ativo.classe === 'fiis';
  var ehFii = ativo.classe === 'fiis';
  var t = encodeURIComponent(fundSimboloYahoo_(ativo));
  var valores = {}, avisos = [], algum = false;
  try {
    var chart = JSON.parse(fundBuscarTexto_('https://query1.finance.yahoo.com/v8/finance/chart/' + t + '?range=max&interval=1mo&events=div'));
    var c = fundMapearYahooChart_(chart, ctx.hoje);
    // ticker novo (ex.: AXIA7, classe criada há pouco): sem histórico, "0 anos pagando / DY 0" seria mentira
    var nMeses = (((chart.chart || {}).result || [])[0] || {}).timestamp;
    // ou o Yahoo não tem NENHUM provento da classe (aconteceu com AXIA7): a planilha/aba Proventos valem mais
    var semDivs = !Object.keys(((((chart.chart || {}).result || [])[0] || {}).events || {}).dividends || {}).length;
    if (br && !ehFii && ((nMeses && nMeses.length < 24 && !c.dpa12m) || semDivs)) {
      ['dy', 'dpa12m', 'anosPagandoDividendos', 'anosAumentandoDividendos'].forEach(function (k) { delete c[k]; });
      avisos.push(ativo.ticker + ': o Yahoo não tem histórico de proventos desta classe - DY e anos pagando vêm da planilha.');
    }
    if (ehFii) c = fundYahooChartParaFii_(c, chart, ctx.hoje);
    Object.keys(c).forEach(function (k) { valores[k] = c[k]; });
    algum = true;
  } catch (e1) { avisos.push('Yahoo (preço/dividendos) não respondeu: ' + String(e1).slice(0, 80)); }
  // FII não tem balanço no Yahoo (vem da CVM)
  if (!ehFii && ctx.temTempo()) {
    try {
      var agoraS = Math.floor(ctx.agora.getTime() / 1000);
      var url = 'https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/' + t + '?type=' + FUND_YAHOO_TIPOS_.join(',') +
        '&period1=' + (agoraS - 6 * 366 * 86400) + '&period2=' + agoraS;
      var ts = fundMapearYahooTimeseries_(JSON.parse(fundBuscarTexto_(url)), br ? null : FUND_INFO_EUA_[ativo.ticker]);
      Object.keys(ts).forEach(function (k) { if (valores[k] == null) valores[k] = ts[k]; });
      if (br && valores.dy == null && valores.dpa12m != null && valores.cotacao > 0) valores.dy = fundArred_(valores.dpa12m / valores.cotacao, 4);
      // classe sem múltiplos prontos no Yahoo (ex.: AXIA7): P/L e P/VP pelo preço da própria classe
      if (br && valores.cotacao > 0) {
        if (valores.pl == null && valores.lpa > 0) valores.pl = fundArred_(valores.cotacao / valores.lpa, 2);
        if (valores.pvp == null && valores.vpa > 0) valores.pvp = fundArred_(valores.cotacao / valores.vpa, 2);
        if (valores.earningsYield == null && valores.pl > 0) valores.earningsYield = fundArred_(1 / valores.pl, 4);
        // o "diluted EPS" do Yahoo pra B3 às vezes vem fora de escala (PETR4: 1,98 com P/L 4,8 a R$ 51):
        // LPA/VPA coerentes com o P/L e o P/VP do próprio Yahoo
        var lpaPl = valores.pl > 0 ? valores.cotacao / valores.pl : null;
        if (lpaPl && (!(valores.lpa > 0) || Math.abs(valores.lpa / lpaPl - 1) > 0.2)) valores.lpa = fundArred_(lpaPl, 4);
        var vpaPvp = valores.pvp > 0 ? valores.cotacao / valores.pvp : null;
        if (vpaPvp && (!(valores.vpa > 0) || Math.abs(valores.vpa / vpaPvp - 1) > 0.2)) valores.vpa = fundArred_(vpaPvp, 4);
      }
      algum = true;
    } catch (e2) { avisos.push('Yahoo (balanço) não respondeu: ' + String(e2).slice(0, 80)); }
  }
  if (!algum) throw new Error(avisos.join(' / '));
  var info = br ? null : FUND_INFO_EUA_[ativo.ticker];
  if (info) { valores.adr = info.adr; valores.paisSede = info.paisSede; }
  if (br) valores.paisSede = 'Brasil';
  return { valores: valores, avisos: avisos };
}

/** Símbolo no Yahoo: ações BR e FIIs ganham ".SA" (B3); EUA ficam como estão. */
function fundSimboloYahoo_(ativo) {
  var t = String(ativo.ticker || '').trim().toUpperCase();
  return (ativo.classe === 'acoes' || ativo.classe === 'fiis') && !/\.SA$/.test(t) ? t + '.SA' : t;
}

/** FII: o chart do Yahoo dá rendimentos e liquidez - traduz pras chaves de FII do contrato. */
function fundYahooChartParaFii_(c, json, hojeIso) {
  var v = {};
  if (c.bolsa) v.bolsa = c.bolsa;
  if (c.cotacao) v.cotacao = c.cotacao;
  if (c.maxima52s) v.maxima52s = c.maxima52s;
  if (c.minima52s) v.minima52s = c.minima52s;
  if (c.dy != null) v.dy12m = c.dy;
  if (c.volumeMedio2m != null) v.liquidezDiaria = c.volumeMedio2m;
  var r = json.chart.result[0];
  var divs = (r.events && r.events.dividends) || {};
  var lista = Object.keys(divs).map(function (k) { return divs[k]; })
    .filter(function (d) { return d && d.amount > 0 && d.date > 0; })
    .map(function (d) { return { dataCom: new Date(d.date * 1000).toISOString().slice(0, 10), valor: d.amount }; });
  var res = fundResumoProventos_(lista, hojeIso);
  if (res.ultimo != null) v.ultimoRendimento = res.ultimo;
  if (res.porMes12m != null) v.rendimentoMedio12m = res.porMes12m;
  return v;
}

/** chart (range=max, interval=1mo, events=div): preço, 52s, bolsa, dividendos (anos pagando/aumentando, DPA 12m, DY), volume médio 2m (US$). */
function fundMapearYahooChart_(json, hojeIso) {
  var r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.meta) throw new Error((json && json.chart && json.chart.error && json.chart.error.description) || 'chart sem resultado');
  var m = r.meta, v = {};
  var bolsa = fundBolsaYahoo_(m.exchangeName, m.fullExchangeName);
  if (bolsa) v.bolsa = bolsa;
  if (m.fiftyTwoWeekHigh > 0) v.maxima52s = m.fiftyTwoWeekHigh;
  if (m.fiftyTwoWeekLow > 0) v.minima52s = m.fiftyTwoWeekLow;
  var preco = m.regularMarketPrice > 0 ? m.regularMarketPrice : null;
  if (preco) v.cotacao = preco;
  var divs = (r.events && r.events.dividends) || {};
  var lista = Object.keys(divs).map(function (k) { return divs[k]; })
    .filter(function (d) { return d && d.amount > 0 && d.date > 0; })
    .map(function (d) { return { dataCom: new Date(d.date * 1000).toISOString().slice(0, 10), valor: d.amount }; });
  var res = fundResumoProventos_(lista, hojeIso);
  v.anosPagandoDividendos = res.anosPagando;
  v.anosAumentandoDividendos = res.anosAumentando;
  v.dpa12m = res.soma12m;
  if (preco && res.soma12m != null) v.dy = fundArred_(res.soma12m / preco, 4);
  // volume: barras mensais -> média diária dos 2 últimos meses fechados (~21 pregões/mês) x preço
  var vols = (((r.indicators || {}).quote || [])[0] || {}).volume || [];
  var ts = r.timestamp || [];
  var mesHoje = hojeIso.slice(0, 7), soma = 0, n = 0;
  for (var i = ts.length - 1; i >= 0 && n < 2; i--) {
    if (new Date(ts[i] * 1000).toISOString().slice(0, 7) >= mesHoje) continue;
    if (vols[i] > 0) { soma += vols[i]; n++; }
  }
  if (n === 2 && preco) v.volumeMedio2m = Math.round(soma / 42 * preco);
  return v;
}

function fundBolsaYahoo_(codigo, nome) {
  var c = String(codigo || '').toUpperCase(), n = String(nome || '').toUpperCase();
  if (c === 'SAO' || /S[AÃ]O PAULO|BOVESPA/.test(n)) return 'B3';
  if (/^(PNK|OTC|OQB|OQX|OEM|OPI)$/.test(c) || /OTC|PINK/.test(n)) return 'OTC';
  if (/^(NMS|NGM|NCM|NAS)$/.test(c) || /NASDAQ/.test(n)) return 'NASDAQ';
  if (/^(NYQ|ASE|PCX|NYS)$/.test(c) || /NYSE/.test(n)) return 'NYSE';
  return null;
}

/** timeseries -> chaves do contrato. ADR (info.adr): sem LPA/VPA (por ação ORDINÁRIA, não por ADR). */
function fundMapearYahooTimeseries_(json, info) {
  var res = (json && json.timeseries && json.timeseries.result) || [];
  var ult = {}, anual = {};
  res.forEach(function (r) {
    var tipo = r && r.meta && r.meta.type && r.meta.type[0];
    var pts = (tipo && r[tipo]) || [];
    pts.forEach(function (p) {
      if (!p || !p.reportedValue || typeof p.reportedValue.raw !== 'number' || !isFinite(p.reportedValue.raw)) return;
      if (!ult[tipo] || p.asOfDate > ult[tipo].data) ult[tipo] = { data: p.asOfDate, valor: p.reportedValue.raw };
      if (/^annual/.test(tipo)) (anual[tipo] = anual[tipo] || []).push({ data: p.asOfDate, valor: p.reportedValue.raw });
    });
  });
  var g = function (k) { return ult[k] ? ult[k].valor : null; };
  var v = {};
  var put = function (k, x, casas) { if (x != null && isFinite(x)) v[k] = casas == null ? x : fundArred_(x, casas); };
  put('pl', g('trailingPeRatio'), 2); put('pvp', g('trailingPbRatio'), 2); put('psr', g('trailingPsRatio'), 2);
  put('peg', g('trailingPegRatio'), 2); put('evEbitda', g('trailingEnterprisesValueEBITDARatio'), 2);
  put('valorMercado', g('trailingMarketCap')); put('receitaLiquida12m', g('trailingTotalRevenue'));
  put('lucroLiquido12m', g('trailingNetIncome')); put('ebitda12m', g('trailingEBITDA')); put('fcf12m', g('trailingFreeCashFlow'));
  var ebit = g('trailingEBIT') != null ? g('trailingEBIT') : g('trailingOperatingIncome');
  put('ebit12m', ebit);
  if (g('trailingCashDividendsPaid') != null) put('dividendosPagos12m', Math.abs(g('trailingCashDividendsPaid')));
  if (g('trailingRepurchaseOfCapitalStock') != null) put('recompras12m', Math.abs(g('trailingRepurchaseOfCapitalStock')));
  if (!(info && info.adr)) put('lpa', g('trailingDilutedEPS'), 4);
  if (!(info && info.adr) && v.lpa == null && g('trailingNetIncome') != null && g('quarterlyOrdinarySharesNumber') > 0) put('lpa', g('trailingNetIncome') / g('quarterlyOrdinarySharesNumber'), 4);
  var rec = g('trailingTotalRevenue'), ll = g('trailingNetIncome'), pl = g('quarterlyStockholdersEquity'), ativo = g('quarterlyTotalAssets');
  var ebitda = g('trailingEBITDA'), divLiq = g('quarterlyNetDebt'), juros = g('trailingInterestExpense'), mc = g('trailingMarketCap');
  if (divLiq == null && g('quarterlyTotalDebt') != null && g('quarterlyCashAndCashEquivalents') != null) divLiq = g('quarterlyTotalDebt') - g('quarterlyCashAndCashEquivalents');
  if (ll != null && pl > 0) put('roe', ll / pl, 4);
  if (ll != null && ativo > 0) put('roa', ll / ativo, 4);
  if (rec > 0) {
    if (g('trailingGrossProfit') != null) put('margemBruta', g('trailingGrossProfit') / rec, 4);
    if (ebit != null) put('margemEbit', ebit / rec, 4);
    if (ebitda != null) put('margemEbitda', ebitda / rec, 4);
    if (ll != null) put('margemLiquida', ll / rec, 4);
  }
  if (divLiq != null && ebitda > 0) put('dividaLiquidaEbitda', divLiq / ebitda, 2);
  if (divLiq != null && pl > 0) put('dividaLiquidaPl', divLiq / pl, 2);
  if (g('quarterlyCurrentAssets') != null && g('quarterlyCurrentLiabilities') > 0) put('liquidezCorrente', g('quarterlyCurrentAssets') / g('quarterlyCurrentLiabilities'), 2);
  if (ebit != null && juros > 0) put('coberturaJuros', ebit / juros, 2);
  if (g('trailingFreeCashFlow') != null && mc > 0) put('fcfYield', g('trailingFreeCashFlow') / mc, 4);
  if (mc > 0 && divLiq != null && ebit > 0) put('evEbit', (mc + divLiq) / ebit, 2);
  // classe sem P/L/P/VP prontos (ex.: AXIA7): refaz pelo valor de mercado da empresa
  if (v.pl == null && mc > 0 && ll > 0) put('pl', mc / ll, 2);
  if (v.pvp == null && mc > 0 && pl > 0) put('pvp', mc / pl, 2);
  if (v.pl > 0) put('earningsYield', 1 / v.pl, 4);
  if (v.dividendosPagos12m != null && ll > 0) put('payout', v.dividendosPagos12m / ll, 4);
  if (!(info && info.adr) && pl > 0 && g('quarterlyOrdinarySharesNumber') > 0) put('vpa', pl / g('quarterlyOrdinarySharesNumber'), 4);
  // 04/10/2026: anuais do Yahoo (até ~4 anos) - CAGR e anos com lucro quando a SEC não responde / ações BR
  var ord = function (k) { return (anual[k] || []).sort(function (a, b) { return a.data < b.data ? -1 : 1; }); };
  var recs = ord('annualTotalRevenue'), lls = ord('annualNetIncome');
  if (recs.length >= 3 && recs[0].valor > 0 && recs[recs.length - 1].valor > 0) {
    var anos = (Date.parse(recs[recs.length - 1].data) - Date.parse(recs[0].data)) / (365.25 * 86400000);
    if (anos >= 2) put('cagrReceita5a', Math.pow(recs[recs.length - 1].valor / recs[0].valor, 1 / anos) - 1, 4);
  }
  if (lls.length >= 3 && lls[0].valor > 0 && lls[lls.length - 1].valor > 0) {
    var anosL = (Date.parse(lls[lls.length - 1].data) - Date.parse(lls[0].data)) / (365.25 * 86400000);
    if (anosL >= 2) put('cagrLucro5a', Math.pow(lls[lls.length - 1].valor / lls[0].valor, 1 / anosL) - 1, 4);
  }
  if (lls.length) { var n = 0; for (var i = lls.length - 1; i >= 0 && lls[i].valor > 0; i--) n++; v.anosComLucro = n; }
  return v;
}

// ---------------------------------------------------------------------------
// Fonte: SEC companyfacts (EUA) - histórico anual e reserva do Yahoo
// ---------------------------------------------------------------------------

var FUND_SEC_CONCEITOS_ = {
  receita: { 'us-gaap': ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'], 'ifrs-full': ['Revenue', 'RevenueFromContractsWithCustomers'] },
  lucro: { 'us-gaap': ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'], 'ifrs-full': ['ProfitLossAttributableToOwnersOfParent', 'ProfitLoss'] },
  patrimonio: { 'us-gaap': ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], 'ifrs-full': ['EquityAttributableToOwnersOfParent', 'Equity'] },
  fco: { 'us-gaap': ['NetCashProvidedByUsedInOperatingActivities'], 'ifrs-full': ['CashFlowsFromUsedInOperatingActivities'] },
  capex: { 'us-gaap': ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], 'ifrs-full': ['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', 'PurchaseOfPropertyPlantAndEquipment'] },
  dividendos: { 'us-gaap': ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'], 'ifrs-full': ['DividendsPaidClassifiedAsFinancingActivities', 'DividendsPaid'] },
  recompras: { 'us-gaap': ['PaymentsForRepurchaseOfCommonStock'], 'ifrs-full': ['PaymentsToAcquireOrRedeemEntitysShares', 'PurchaseOfTreasuryShares'] },
  ebit: { 'us-gaap': ['OperatingIncomeLoss'], 'ifrs-full': ['ProfitLossFromOperatingActivities'] },
  juros: { 'us-gaap': ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'], 'ifrs-full': ['FinanceCosts', 'InterestExpense'] },
  ativo: { 'us-gaap': ['Assets'], 'ifrs-full': ['Assets'] },
  ativoCirc: { 'us-gaap': ['AssetsCurrent'], 'ifrs-full': ['CurrentAssets'] },
  passivoCirc: { 'us-gaap': ['LiabilitiesCurrent'], 'ifrs-full': ['CurrentLiabilities'] }
};

function fundColetarSec_(ativo, ctx) {
  var anterior = ctx.tabela.mapa[ativo.ticker + '|sec'];
  var cik = anterior && anterior.dados && anterior.dados.cik;
  if (!cik) {
    if (!ctx.cache.secCiks) ctx.cache.secCiks = fundMapaCiksSec_(JSON.parse(fundBuscarTexto_('https://www.sec.gov/files/company_tickers.json', null, FUND_UA_SEC_)));
    cik = ctx.cache.secCiks[ativo.ticker.replace('.', '-')] || ctx.cache.secCiks[ativo.ticker];
  }
  if (!cik) return { valores: {}, avisos: [ativo.ticker + ' não tem registro na SEC (ADR nível 1/OTC) - fundamentos só pelo Yahoo.'], cik: null };
  var url = 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + ('0000000000' + cik).slice(-10) + '.json';
  var facts = JSON.parse(fundBuscarTexto_(url, null, FUND_UA_SEC_));
  var r = fundMapearSec_(facts, ctx.hoje);
  return { valores: r.valores, avisos: r.avisos, cik: cik, dataRef: r.dataRef };
}

function fundMapaCiksSec_(json) {
  var mapa = {};
  Object.keys(json || {}).forEach(function (k) {
    var x = json[k];
    if (x && x.ticker && x.cik_str) mapa[String(x.ticker).toUpperCase()] = Number(x.cik_str);
  });
  return mapa;
}

/** Fatos de um conceito: { unidade, pontos:[{start,end,val,form,filed}] } - a unidade com o dado mais recente (USD primeiro). */
function fundFatosSec_(facts, conceito) {
  var todos = (facts && facts.facts) || {};
  var melhor = null;
  ['us-gaap', 'ifrs-full'].forEach(function (tax) {
    var nomes = (FUND_SEC_CONCEITOS_[conceito] || {})[tax] || [];
    nomes.forEach(function (nome) {
      var f = todos[tax] && todos[tax][nome];
      if (!f || !f.units) return;
      Object.keys(f.units).forEach(function (u) {
        if (/\//.test(u)) return; // USD/shares etc.
        var pts = f.units[u] || [];
        var fim = pts.reduce(function (m, p) { return p.end > m ? p.end : m; }, '');
        var bonus = u === 'USD' ? '1' : '0';
        if (!melhor || fim + bonus > melhor.fim + melhor.bonus) melhor = { unidade: u, pontos: pts, fim: fim, bonus: bonus };
      });
    });
  });
  return melhor;
}

function fundDiasEntre_(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

/** Valores anuais (duração ~1 ano, 10-K/20-F/40-F) por ano do fim: { 'AAAA': val } (o arquivamento mais novo ganha). */
function fundAnuaisSec_(fatos) {
  var out = {}, quando = {};
  ((fatos && fatos.pontos) || []).forEach(function (p) {
    if (!p.start || !p.end || typeof p.val !== 'number') return;
    var d = fundDiasEntre_(p.start, p.end);
    if (d < 340 || d > 380) return;
    var ano = p.end.slice(0, 4);
    if (!quando[ano] || String(p.filed || '') >= quando[ano]) { out[ano] = p.val; quando[ano] = String(p.filed || ''); }
  });
  return out;
}

/** Últimos 12 meses de um fluxo: anual que termina no último fim; senão anual anterior + acumulado do ano - acumulado do ano passado. */
function fundTtmSec_(fatos) {
  var pts = ((fatos && fatos.pontos) || []).filter(function (p) { return p.start && p.end && typeof p.val === 'number'; });
  if (!pts.length) return null;
  var ultimoFim = pts.reduce(function (m, p) { return p.end > m ? p.end : m; }, '');
  var noFim = pts.filter(function (p) { return p.end === ultimoFim; });
  var anual = noFim.filter(function (p) { var d = fundDiasEntre_(p.start, p.end); return d >= 340 && d <= 380; })[0];
  if (anual) return { valor: anual.val, fim: ultimoFim };
  var ytd = noFim.sort(function (a, b) { return a.start < b.start ? -1 : 1; })[0]; // o período mais longo que termina no último fim
  var durYtd = fundDiasEntre_(ytd.start, ytd.end);
  var anoAntes = pts.filter(function (p) {
    var d = fundDiasEntre_(p.start, p.end);
    return d >= 340 && d <= 380 && Math.abs(fundDiasEntre_(p.end, ytd.start)) <= 5;
  })[0];
  var ytdAntes = pts.filter(function (p) {
    return Math.abs(fundDiasEntre_(p.start, p.end) - durYtd) <= 5 && Math.abs(fundDiasEntre_(p.end, ytd.end) - 365) <= 7;
  })[0];
  if (anoAntes && ytdAntes) return { valor: anoAntes.val + ytd.val - ytdAntes.val, fim: ultimoFim };
  if (anoAntes) return { valor: anoAntes.val, fim: anoAntes.end };
  return null;
}

/** Saldo mais recente (balanço). */
function fundSaldoSec_(fatos) {
  var pts = ((fatos && fatos.pontos) || []).filter(function (p) { return p.end && typeof p.val === 'number' && !p.start; });
  if (!pts.length) return null;
  var u = pts.reduce(function (m, p) { return !m || p.end > m.end || (p.end === m.end && String(p.filed) > String(m.filed)) ? p : m; }, null);
  return { valor: u.val, fim: u.end };
}

function fundMapearSec_(facts, hojeIso) {
  var v = {}, avisos = [];
  var f = {};
  Object.keys(FUND_SEC_CONCEITOS_).forEach(function (k) { f[k] = fundFatosSec_(facts, k); });
  var moeda = f.receita ? f.receita.unidade : (f.lucro ? f.lucro.unidade : 'USD');
  if (moeda !== 'USD') avisos.push('SEC: balanço em ' + moeda + ' (não em US$) - valores absolutos ficaram de fora, só as razões.');
  var ttm = function (k) { var x = fundTtmSec_(f[k]); return x ? x.valor : null; };
  var saldo = function (k) { var x = fundSaldoSec_(f[k]); return x ? x.valor : null; };
  var rec = ttm('receita'), ll = ttm('lucro'), pl = saldo('patrimonio'), fco = ttm('fco'), capex = ttm('capex');
  var ebit = ttm('ebit'), juros = ttm('juros'), ativo = saldo('ativo');
  if (moeda === 'USD') {
    if (rec != null) v.receitaLiquida12m = rec;
    if (ll != null) v.lucroLiquido12m = ll;
    if (fco != null && capex != null) v.fcf12m = fco - Math.abs(capex);
    if (ttm('dividendos') != null) v.dividendosPagos12m = Math.abs(ttm('dividendos'));
    if (ttm('recompras') != null) v.recompras12m = Math.abs(ttm('recompras'));
    if (ebit != null) v.ebit12m = ebit;
  }
  if (ll != null && pl > 0) v.roe = fundArred_(ll / pl, 4);
  if (ll != null && ativo > 0) v.roa = fundArred_(ll / ativo, 4);
  if (rec > 0 && ll != null) v.margemLiquida = fundArred_(ll / rec, 4);
  if (rec > 0 && ebit != null) v.margemEbit = fundArred_(ebit / rec, 4);
  if (ebit != null && juros > 0) v.coberturaJuros = fundArred_(ebit / juros, 2);
  if (saldo('ativoCirc') != null && saldo('passivoCirc') > 0) v.liquidezCorrente = fundArred_(saldo('ativoCirc') / saldo('passivoCirc'), 2);
  if (ttm('dividendos') != null && ll > 0) v.payout = fundArred_(Math.abs(ttm('dividendos')) / ll, 4);
  // histórico anual: CAGR 5 anos e anos com lucro (dos últimos 5)
  var recA = fundAnuaisSec_(f.receita), llA = fundAnuaisSec_(f.lucro);
  var cagr = function (serie) {
    var anos = Object.keys(serie).sort();
    if (!anos.length) return null;
    var ult = anos[anos.length - 1], ini = String(Number(ult) - 5);
    if (!(serie[ult] > 0) || !(serie[ini] > 0)) return null;
    return fundArred_(Math.pow(serie[ult] / serie[ini], 1 / 5) - 1, 4);
  };
  var cr = cagr(recA), cl = cagr(llA);
  if (cr != null) v.cagrReceita5a = cr;
  if (cl != null) v.cagrLucro5a = cl;
  var anosLl = Object.keys(llA).sort().slice(-5);
  if (anosLl.length >= 3) v.anosComLucro = anosLl.filter(function (a) { return llA[a] > 0; }).length;
  var fimBal = fundSaldoSec_(f.patrimonio) || fundSaldoSec_(f.ativo);
  return { valores: v, avisos: avisos, dataRef: fimBal ? fimBal.fim : undefined };
}

// ---------------------------------------------------------------------------
// Fonte: CVM dados abertos (FIIs: informes mensal/trimestral; ações: FCA)
// ---------------------------------------------------------------------------

var FUND_CVM_URL_ = 'https://dados.cvm.gov.br/dados/';

/** Formata 14 dígitos como na CVM: 11.839.593/0001-09. */
function fundCnpjCvm_(digitos) {
  var d = String(digitos || '').replace(/\D/g, '');
  if (d.length !== 14) return null;
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
}

/** Baixa um zip da CVM: { nomeDoCsv: texto } (só os arquivos cujo nome contém um dos pedaços de soArquivos). */
function fundBaixarZipBrutoCvm_(url, soArquivos) {
  var resp = fundBuscar_(url, null);
  var blob = resp.getBlob();
  try { blob.setContentType('application/zip'); } catch (e) { /* alguns ambientes não precisam */ }
  var out = {};
  Utilities.unzip(blob).forEach(function (b) {
    var nome = String(b.getName() || '');
    if (soArquivos && !soArquivos.some(function (s) { return nome.indexOf(s) !== -1; })) return;
    out[nome] = b.getDataAsString('ISO-8859-1');
  });
  return out;
}

/** Zip da CVM -> { nomeDoCsv: [linhas que contêm um dos termos, como objetos] }. */
function fundBaixarZipCvm_(url, termos, soArquivos) {
  var bruto = fundBaixarZipBrutoCvm_(url, soArquivos);
  var out = {};
  Object.keys(bruto).forEach(function (nome) { out[nome] = fundFiltrarCsv_(bruto[nome], termos); });
  return out;
}

/** CSV ";" -> [{coluna: valor}] só das linhas que contêm algum dos termos (CNPJ/ticker). */
function fundFiltrarCsv_(texto, termos) {
  var linhas = String(texto || '').split(/\r?\n/);
  if (!linhas.length) return [];
  var cab = fundLinhaCsv_(linhas[0]);
  var out = [];
  for (var i = 1; i < linhas.length; i++) {
    var l = linhas[i];
    if (!l) continue;
    var tem = false;
    for (var j = 0; j < termos.length && !tem; j++) if (l.indexOf(termos[j]) !== -1) tem = true;
    if (!tem) continue;
    var cel = fundLinhaCsv_(l);
    var obj = {};
    cab.forEach(function (c, k) { obj[c] = cel[k] == null ? '' : cel[k]; });
    out.push(obj);
  }
  return out;
}

/** Uma linha CSV com ";" e aspas (o "" dentro de aspas vira "). */
function fundLinhaCsv_(linha) {
  var out = [], atual = '', aspas = false;
  for (var i = 0; i < linha.length; i++) {
    var ch = linha.charAt(i);
    if (aspas) {
      if (ch === '"') { if (linha.charAt(i + 1) === '"') { atual += '"'; i++; } else aspas = false; }
      else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') { out.push(atual); atual = ''; }
    else atual += ch;
  }
  out.push(atual);
  return out;
}

/** Linhas de um CNPJ, só a maior Versao de cada Data_Referencia, em ordem de data. */
function fundUltimasVersoesCvm_(linhas, cnpj) {
  var porData = {};
  (linhas || []).forEach(function (l) {
    if (String(l.CNPJ_Fundo_Classe || l.CNPJ_Fundo || l.CNPJ_Companhia || '').trim() !== cnpj) return;
    var d = String(l.Data_Referencia || '');
    var ver = Number(l.Versao) || 0;
    if (!porData[d] || ver > porData[d].ver) porData[d] = { ver: ver, linhas: [l] };
    else if (ver === porData[d].ver) porData[d].linhas.push(l);
  });
  return Object.keys(porData).sort().map(function (d) { return { data: d, linhas: porData[d].linhas }; });
}

function fundColetarCvmFiis_(ss, fiis, ctx) {
  var cnpjs = typeof garantirCnpjsFii_ === 'function' ? garantirCnpjsFii_(ss, fiis.map(function (a) { return a.ticker; })) : {}; // FnetProventos.gs
  var porTicker = {};
  fiis.forEach(function (a) { var c = fundCnpjCvm_(cnpjs[a.ticker]); if (c) porTicker[a.ticker] = c; });
  var termos = Object.keys(porTicker).map(function (t) { return porTicker[t]; });
  if (!termos.length) return {};
  var ano = Number(ctx.hoje.slice(0, 4));
  var mensal = {}, trimestral = {}, erros = [], baixados = 0;
  // o arquivo do ano novo só aparece depois do 1º informe (janeiro/fevereiro): 404 nele não é erro
  var juntar = function (destino, url, soArquivos) {
    var arquivos;
    try { arquivos = fundBaixarZipCvm_(url, termos, soArquivos); baixados++; } catch (e) { erros.push(url.replace(/^.*\//, '') + ': ' + String(e).slice(0, 60)); return; }
    Object.keys(arquivos).forEach(function (nome) {
      var chave = nome.replace(/_\d{4}\.csv$/i, '');
      destino[chave] = (destino[chave] || []).concat(arquivos[nome]);
    });
  };
  [ano - 1, ano].forEach(function (a) {
    if (ctx.temTempo()) juntar(mensal, FUND_CVM_URL_ + 'FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_' + a + '.zip', null);
  });
  var arquivosTri = ['_imovel_2', '_resultado_contabil_financeiro_', '_complemento_'];
  [ano, ano - 1].forEach(function (a) {
    if (!ctx.temTempo()) return;
    if (a === ano - 1 && termos.every(function (c) { return fundUltimasVersoesCvm_(trimestral.inf_trimestral_fii_resultado_contabil_financeiro, c).length; })) return;
    juntar(trimestral, FUND_CVM_URL_ + 'FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_' + a + '.zip', arquivosTri);
  });
  if (!baixados) throw new Error('CVM não respondeu (' + erros.join('; ') + ')');
  var out = {};
  Object.keys(porTicker).forEach(function (t) {
    var r = fundMapearCvmFii_(mensal, trimestral, porTicker[t]);
    if (r) out[t] = r;
  });
  return out;
}

/** Informes da CVM de UM fundo -> { valores, historico: { vpCota }, avisos, dataRef }. */
function fundMapearCvmFii_(mensal, trimestral, cnpj) {
  var comp = fundUltimasVersoesCvm_(mensal.inf_mensal_fii_complemento, cnpj);
  var ap = fundUltimasVersoesCvm_(mensal.inf_mensal_fii_ativo_passivo, cnpj);
  var geral = fundUltimasVersoesCvm_(mensal.inf_mensal_fii_geral, cnpj);
  if (!comp.length && !ap.length) return null;
  var n = fundNumero_;
  var v = {}, avisos = [];
  var hist = [];
  comp.forEach(function (c) {
    var vp = n(c.linhas[0].Valor_Patrimonial_Cotas);
    if (vp > 0) hist.push({ data: c.data.slice(0, 7), valor: fundArred_(vp, 4) });
  });
  var ultComp = comp.length ? comp[comp.length - 1].linhas[0] : null;
  if (ultComp) {
    if (n(ultComp.Total_Numero_Cotistas) > 0) v.numeroCotistas = n(ultComp.Total_Numero_Cotistas);
    if (n(ultComp.Patrimonio_Liquido) > 0) v.patrimonioLiquido = n(ultComp.Patrimonio_Liquido);
    if (n(ultComp.Valor_Patrimonial_Cotas) > 0) v.vpCota = fundArred_(n(ultComp.Valor_Patrimonial_Cotas), 4);
    // taxa de adm.: % do PL no mês -> soma dos últimos 12 meses (ou média x 12)
    var taxas = comp.slice(-12).map(function (c) { return n(c.linhas[0].Percentual_Despesas_Taxa_Administracao); }).filter(function (x) { return x != null && x >= 0; });
    if (taxas.length) v.taxaAdministracao = fundArred_(taxas.reduce(function (s, x) { return s + x; }, 0) / taxas.length * 12, 5);
  }
  var ultAp = ap.length ? ap[ap.length - 1].linhas[0] : null;
  var plAp = ultComp ? n(ultComp.Patrimonio_Liquido) : null;
  if (ultAp && plAp > 0) {
    var liq = n(ultAp.Total_Necessidades_Liquidez);
    if (liq == null) liq = ['Disponibilidades', 'Titulos_Publicos', 'Titulos_Privados', 'Fundos_Renda_Fixa'].reduce(function (s, k) { return s + (n(ultAp[k]) || 0); }, 0);
    v.pctCaixa = fundArred_(liq / plAp, 4);
    var passivo = n(ultAp.Total_Passivo);
    if (passivo != null) {
      var naoDivida = (n(ultAp.Rendimentos_Distribuir) || 0) + (n(ultAp.Taxa_Administracao_Pagar) || 0) + (n(ultAp.Taxa_Performance_Pagar) || 0);
      v.alavancagem = fundArred_(Math.max(0, passivo - naoDivida) / plAp, 4);
    }
  }
  var ultGeral = geral.length ? geral[geral.length - 1].linhas[0] : null;
  if (ultGeral) {
    if (ultGeral.Segmento_Atuacao) v.segmentoFonte = ultGeral.Segmento_Atuacao;
    if (ultGeral.Mandato) v.mandato = ultGeral.Mandato;
    var g = String(ultGeral.Tipo_Gestao || '').toLowerCase();
    if (/ativa|passiva/.test(g)) v.tipoGestao = /passiva/.test(g) ? 'passiva' : 'ativa';
    if (v.numeroCotistas != null) v.isencaoIr = v.numeroCotistas >= 100 && String(ultGeral.Mercado_Negociacao_Bolsa || '').toUpperCase() === 'S';
  }
  // trimestral: imóveis (vacância por área, inadimplência por receita), resultado x distribuído, vencimentos/indexadores
  var imoveis = fundUltimasVersoesCvm_(trimestral.inf_trimestral_fii_imovel, cnpj);
  if (imoveis.length) {
    var ult = imoveis[imoveis.length - 1].linhas.filter(function (l) { return /renda/i.test(l.Classe || ''); });
    var acabados = ult.filter(function (l) { return /acabad/i.test(l.Classe || ''); });
    if (ult.length) v.numeroImoveis = ult.length;
    var pct = function (x) { var y = n(x); return y == null ? null : (y > 1.0001 ? y / 100 : y); };
    var somaA = 0, somaVac = 0, somaR = 0, somaInad = 0, vacs = [], inads = [];
    acabados.forEach(function (l) {
      var area = n(l.Area), vac = pct(l.Percentual_Vacancia), inad = pct(l.Percentual_Inadimplencia), rec = pct(l.Percentual_Receitas_FII);
      if (vac != null) { vacs.push(vac); if (area > 0) { somaA += area; somaVac += area * vac; } }
      if (inad != null) { inads.push(inad); if (rec > 0) { somaR += rec; somaInad += rec * inad; } }
    });
    if (vacs.length) v.vacanciaFisica = fundArred_(somaA > 0 ? somaVac / somaA : vacs.reduce(function (s, x) { return s + x; }, 0) / vacs.length, 4);
    if (inads.length) v.inadimplencia = fundArred_(somaR > 0 ? somaInad / somaR : inads.reduce(function (s, x) { return s + x; }, 0) / inads.length, 4);
  }
  var res = fundUltimasVersoesCvm_(trimestral.inf_trimestral_fii_resultado_contabil_financeiro, cnpj);
  if (res.length) {
    var r = res[res.length - 1].linhas[0];
    var dist = n(r.Percentual_Resultado_Financeiro_Liquido_Declarado);
    if (dist != null && dist > 0) v.distribuicaoSobreResultado = fundArred_(dist > 5 ? dist / 100 : dist, 4);
    var acum = n(r.Resultado_Financeiro_Liquido_Acumulado), decl = n(r.Rendimentos_Declarados);
    if (acum != null && decl != null) v.resultadoAcumulado = Math.round(acum - decl); // + sobrou (reserva), - distribuiu mais que gerou no semestre
    var desp = n(r.Total_Receitas_Despesas_Financeiro), resTri = n(r.Resultado_Trimestral_Liquido_Financeiro);
    if (desp != null && resTri != null && desp <= 0 && resTri - desp > 0) v.custoRelativo = fundArred_(-desp / (resTri - desp), 4);
  }
  var compT = fundUltimasVersoesCvm_(trimestral.inf_trimestral_fii_complemento, cnpj);
  if (compT.length) {
    var ct = compT[compT.length - 1].linhas[0];
    var faixas12 = ['Ate_3Meses', '3a6Meses', '6a9Meses', '9a12Meses'];
    var vence = faixas12.map(function (f) { return n(ct['Percentual_Vencimento_Receita_FII_Faixa_' + f]); });
    if (vence.some(function (x) { return x != null; })) v.vencimentos12mPct = fundArred_(vence.reduce(function (s, x) { return s + (x || 0); }, 0), 4);
    var idx = { igpm: 'IGPM', inpc: 'INPC', ipca: 'IPCA', incc: 'INCC' }, maior = null;
    Object.keys(idx).forEach(function (k) {
      var x = n(ct['Percentual_Indexador_Receita_FII_' + idx[k]]);
      if (x != null && x > 0 && (!maior || x > maior.x)) maior = { k: k, x: x };
    });
    if (maior && maior.x >= 0.3) v.indexadorPrincipal = maior.k;
  }
  var dataRef = comp.length ? comp[comp.length - 1].data : (ap.length ? ap[ap.length - 1].data : undefined);
  return { valores: v, historico: hist.length ? { vpCota: hist } : undefined, avisos: avisos, cnpj: cnpj, dataRef: dataRef };
}

/** FCA (ações BR): segmento de listagem, controle estatal e tag along - 1 download por mês pra todas. */
function fundColetarCvmAcoes_(acoes, ctx) {
  var ano = Number(ctx.hoje.slice(0, 4));
  var tickers = acoes.map(function (a) { return a.ticker; });
  var termos = tickers.map(function (t) { return ';' + t + ';'; });
  var out = {};
  [ano, ano - 1].forEach(function (a) {
    var faltam = tickers.filter(function (t) { return !out[t]; });
    if (!faltam.length || !ctx.temTempo()) return;
    var url = FUND_CVM_URL_ + 'CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_' + a + '.zip';
    var bruto;
    try { bruto = fundBaixarZipBrutoCvm_(url, ['_valor_mobiliario_', '_geral_']); } catch (e) {
      // o FCA do ano novo pode ainda não existir: tenta o do ano passado; só é erro se nenhum dos dois veio
      if (a === ano - 1 && !Object.keys(out).filter(function (k) { return k !== '__erro'; }).length) throw e;
      out.__erro = String(e);
      return;
    }
    var linhasVm = [], linhasGeral = [];
    Object.keys(bruto).forEach(function (nome) {
      if (nome.indexOf('_valor_mobiliario_') !== -1) linhasVm = linhasVm.concat(fundFiltrarCsv_(bruto[nome], termos));
    });
    var cnpjs = {};
    linhasVm.forEach(function (l) { if (faltam.indexOf(String(l.Codigo_Negociacao || '').trim()) !== -1) cnpjs[l.CNPJ_Companhia] = 1; });
    Object.keys(bruto).forEach(function (nome) {
      if (nome.indexOf('_geral_') !== -1 && Object.keys(cnpjs).length) linhasGeral = linhasGeral.concat(fundFiltrarCsv_(bruto[nome], Object.keys(cnpjs)));
    });
    faltam.forEach(function (t) {
      var r = fundMapearFca_(linhasVm, linhasGeral, t);
      if (r) out[t] = r;
    });
  });
  delete out.__erro;
  return out;
}

function fundMapearFca_(linhasVm, linhasGeral, ticker) {
  var doTicker = (linhasVm || []).filter(function (l) { return String(l.Codigo_Negociacao || '').trim() === ticker && !String(l.Data_Fim_Negociacao || '').trim(); });
  if (!doTicker.length) return null;
  var vm = doTicker.reduce(function (m, l) { return !m || String(l.Data_Referencia) + (Number(l.Versao) || 0) > String(m.Data_Referencia) + (Number(m.Versao) || 0) ? l : m; }, null);
  var v = {};
  var seg = String(vm.Segmento || '').toLowerCase();
  v.segmentoListagem = /novo mercado/.test(seg) ? 'Novo Mercado' : (/n[ií]vel 2/.test(seg) ? 'N2' : (/n[ií]vel 1/.test(seg) ? 'N1' : 'Tradicional'));
  var ehOn = /ordin/i.test(vm.Valor_Mobiliario || '') || /3$/.test(ticker);
  if (v.segmentoListagem === 'Novo Mercado' || v.segmentoListagem === 'N2') v.tagAlong = 1;
  else if (ehOn) v.tagAlong = 0.8; // mínimo da lei (o estatuto pode dar mais)
  var cnpj = vm.CNPJ_Companhia;
  var ger = (linhasGeral || []).filter(function (l) { return l.CNPJ_Companhia === cnpj; })
    .reduce(function (m, l) { return !m || String(l.Data_Referencia) + (Number(l.Versao) || 0) > String(m.Data_Referencia) + (Number(m.Versao) || 0) ? l : m; }, null);
  if (ger) {
    var ctrl = String(ger.Especie_Controle_Acionario || '');
    if (ctrl) v.estatal = /estatal/i.test(ctrl);
    if (ger.Setor_Atividade) v.setorCvm = ger.Setor_Atividade;
  }
  return { valores: v, avisos: [], cnpj: cnpj };
}

// ---------------------------------------------------------------------------
// Fonte: planilha (GOOGLEFINANCE) - aba aux_fundamentos-gf
// ---------------------------------------------------------------------------

/** Mantém 1 linha de fórmulas por ticker e lê o que o Sheets já calculou: { ticker: { valores, avisos } }. */
function fundColetarPlanilhaGf_(ss, ativos) {
  var aba = ss.getSheetByName(ABA_FUNDAMENTOS_GF) || ss.insertSheet(ABA_FUNDAMENTOS_GF);
  var cab = ['Ticker', 'Símbolo'].concat(FUND_GF_ATRIBUTOS_);
  var desejados = ativos.map(function (a) { return [a.ticker, (a.classe === 'acoesEua' ? '' : 'BVMF:') + a.ticker, a.classe, a.preco]; });
  var atuais = aba.getLastRow() >= 2 ? aba.getRange(2, 1, aba.getLastRow() - 1, cab.length).getValues() : [];
  var mesmaLista = atuais.length === desejados.length && atuais.every(function (l, i) { return String(l[1]) === desejados[i][1]; });
  if (!mesmaLista) {
    aba.clearContents();
    aba.getRange(1, 1, 1, cab.length).setValues([cab]);
    if (desejados.length) {
      aba.getRange(2, 1, desejados.length, 2).setValues(desejados.map(function (d) { return [d[0], d[1]]; }));
      var formulas = desejados.map(function (d, i) {
        return FUND_GF_ATRIBUTOS_.map(function (at) {
          if (d[2] === 'fiis' && FUND_GF_SO_FII_.indexOf(at) === -1) return '';
          return '=IFERROR(GOOGLEFINANCE($B' + (i + 2) + ';"' + at + '");"")';
        });
      });
      aba.getRange(2, 3, desejados.length, FUND_GF_ATRIBUTOS_.length).setFormulas(formulas);
    }
    return {}; // o Sheets calcula em segundo plano - lê na próxima execução
  }
  var out = {};
  atuais.forEach(function (l, i) {
    var x = {};
    FUND_GF_ATRIBUTOS_.forEach(function (at, j) { var n = fundNumero_(l[2 + j]); if (n != null) x[at] = n; });
    var v = {};
    var classe = desejados[i][2];
    if (x.pe != null && x.pe !== 0 && classe !== 'fiis') v.pl = fundArred_(x.pe, 2);
    if (x.high52 > 0) v.maxima52s = x.high52;
    if (x.low52 > 0) v.minima52s = x.low52;
    if (x.beta != null && classe !== 'fiis') v.beta = fundArred_(x.beta, 3);
    if (x.marketcap > 0) v.valorMercado = x.marketcap;
    if (x.volumeavg > 0 && desejados[i][3] > 0) v[classe === 'fiis' ? 'liquidezDiaria' : 'volumeMedio2m'] = Math.round(x.volumeavg * desejados[i][3]);
    if (Object.keys(v).length) out[String(l[0]).toUpperCase()] = { valores: v, avisos: [] };
  });
  return out;
}

// ---------------------------------------------------------------------------
// Sanidade, números, HTTP
// ---------------------------------------------------------------------------

var FUND_NOMES_ = { pl: 'P/L', pvp: 'P/VP', dy: 'DY', dy12m: 'DY 12m', payout: 'Payout', roe: 'ROE', roic: 'ROIC', roa: 'ROA',
  margemBruta: 'Margem bruta', margemEbit: 'Margem EBIT', margemEbitda: 'Margem EBITDA', margemLiquida: 'Margem líquida',
  vacanciaFisica: 'Vacância', taxaAdministracao: 'Taxa de administração', alavancagem: 'Alavancagem', pctCaixa: '% em caixa' };

/**
 * 05/10/2026 (A-26): o P/VP que veio da planilha (Auxiliar_ativos / GOOGLEFINANCE) é suspeito? Devolve o motivo (texto)
 * ou null. Suspeito = acima de 10 numa ação/FII brasileiro (nas ações dos EUA o P/VP alto é normal, só vale a
 * comparação) ou mais de 50% distante do P/VP das outras fontes (Yahoo, Fundamentus, CVM).
 */
function fundPvpPlanilhaSuspeito_(pvpPlanilha, pvpOutras, classe) {
  if (pvpPlanilha == null || !isFinite(pvpPlanilha)) return null;
  if (pvpOutras != null && isFinite(pvpOutras) && pvpOutras > 0 && Math.abs(pvpPlanilha - pvpOutras) / pvpOutras > 0.5) {
    return 'P/VP ' + fundArred_(pvpPlanilha, 2) + ' contra ' + fundArred_(pvpOutras, 2) + ' das outras fontes (diferença acima de 50%)';
  }
  if (classe !== 'acoesEua' && pvpPlanilha > 10) return 'P/VP ' + fundArred_(pvpPlanilha, 2) + ' acima de 10';
  return null;
}

/** Descarta o absurdo (com aviso): P/VP > 50, P/L fora de ±200, NaN, "#DIV/0!", fração que veio em % (> 500%). fonte: só pro texto do aviso. */
function fundSanidade_(valores, avisos, fonte) {
  var de = fonte ? ' (' + fonte + ')' : '';
  Object.keys(valores).forEach(function (k) {
    var x = valores[k];
    var nome = FUND_NOMES_[k] || k;
    if (typeof x === 'string' && /^\s*#/.test(x)) { avisos.push(nome + de + ' veio como "' + x.trim() + '" - descartado.'); delete valores[k]; return; }
    if (typeof x !== 'number') return;
    var motivo = null;
    if (!isFinite(x)) motivo = 'não é número';
    else if (k === 'pvp' && (x > 50 || x < -50)) motivo = 'P/VP fora de ±50';
    else if (k === 'pl' && (x > 200 || x < -200)) motivo = 'P/L fora de ±200 (lucro perto de zero)';
    else if (FUND_CHAVES_FRACAO_.indexOf(k) !== -1 && Math.abs(x) > 5) motivo = 'percentual acima de 500% (unidade errada?)';
    if (motivo) {
      var ehFracao = FUND_CHAVES_FRACAO_.indexOf(k) !== -1;
      var txt = !isFinite(x) ? String(x) : (ehFracao ? fundArred_(x * 100, 0) + '%' : String(fundArred_(x, 2)).replace('.', ','));
      avisos.push(nome + ' de ' + txt + de + ' descartado: ' + motivo + '.');
      delete valores[k];
    }
  });
  return valores;
}

/** Número de célula da planilha (number, "12,5", "8,5%", "#DIV/0!" -> null). */
function fundNumero_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null || v === '' || typeof v === 'boolean' || v instanceof Date) return null;
  var s = String(v).trim();
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) return Number(s); // CSV da CVM: ponto decimal / notação científica
  return fundNumeroBr_(s);
}

/** Texto pt-BR: "1.279.020.000", "1,37", "50,6%", "-2,3%", "-" -> número (% vira fração). */
function fundNumeroBr_(s) {
  if (typeof s === 'number') return isFinite(s) ? s : null;
  var t = String(s == null ? '' : s).replace(/\s| |R\$|US\$/g, '');
  if (!t || /^[-–—]+$/.test(t) || /^#/.test(t)) return null;
  var pct = /%$/.test(t);
  t = t.replace(/%$/, '');
  if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  var n = Number(t);
  if (!isFinite(n)) return null;
  return pct ? fundArred_(n / 100, 6) : n;
}

function fundDataBr_(s) {
  var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
}

function fundTextoHtml_(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, function (_, c) { return String.fromCharCode(Number(c)); })
    .replace(/\s+/g, ' ').trim();
}

function fundArred_(x, casas) { var f = Math.pow(10, casas); return Math.round(x * f) / f; }

function fundSomarDiasIso_(iso, dias) {
  return new Date(Date.parse(iso + 'T12:00:00Z') + dias * 86400000).toISOString().slice(0, 10);
}

function fundChaveDia_(d) {
  var fuso = 'America/Sao_Paulo';
  try { fuso = Session.getScriptTimeZone() || fuso; } catch (e) { /* padrão */ }
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** 'aaaa-mm-dd' -> 'DD/MM'. */
function fundDiaBr_(iso) {
  var m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? m[2] + '/' + m[1] : '';
}

/** Nome da fonte no disjuntor (Fontes.gs): chart e timeseries do Yahoo saem pelo mesmo host (query1). */
function fundNomeDisjuntor_(fonte) { return fonte === 'yahoo' ? 'yahoo-query1' : fonte; }

/** null = fonte liberada; texto = "HTTP 403 desde 03/10; nova tentativa 04/10 às 02:00" (disjuntor persistente aberto). */
function fundFontePausada_(fonte) {
  if (typeof fonteAberta_ !== 'function') return null;
  var est = fonteAberta_(fundNomeDisjuntor_(fonte));
  if (!est) return null;
  return (est.motivo || 'falhas seguidas') + (est.desde ? ' desde ' + fundDiaBr_(fundChaveDia_(new Date(est.desde))) : '') + '; nova tentativa ' + fonteHoraBr_(est.ate);
}

/**
 * GET com 1 nova tentativa em 5xx (429 não: é limite, o disjuntor cuida). Erro (HTTP != 200) vira exceção com o host.
 * 05/10/2026 (A-49): passa pelo disjuntor persistente (Fontes.gs) - fonte em pausa falha na hora, sem rede,
 * e 401/403/429/451/erro de rede registram a pausa para as PRÓXIMAS execuções também.
 */
function fundBuscar_(url, userAgent) {
  var nome = typeof fonteNomeDaUrl_ === 'function' ? fonteNomeDaUrl_(url) : null;
  if (nome) {
    var aberta = fonteAberta_(nome);
    if (aberta) throw new Error('Fonte ' + fonteDescreverPausa_(nome, aberta));
  }
  var opcoes = { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': userAgent || FUND_UA_ } };
  var resp, code;
  try {
    resp = UrlFetchApp.fetch(url, opcoes);
    code = resp.getResponseCode();
    if (code >= 500) {
      Utilities.sleep(2000);
      resp = UrlFetchApp.fetch(url, opcoes);
      code = resp.getResponseCode();
    }
  } catch (eRede) {
    if (nome) fonteFalhou_(nome, { erro: String(eRede) });
    throw eRede;
  }
  if (nome) {
    if (code === 200 || !fonteClassificar_(code, null)) fonteDeuCerto_(nome);
    else fonteFalhou_(nome, { codigo: code });
  }
  if (code !== 200) throw new Error('HTTP ' + code + ' (' + String(url).replace(/^https?:\/\/([^/]+).*$/, '$1') + ')');
  return resp;
}

function fundBuscarTexto_(url, charset, userAgent) {
  var resp = fundBuscar_(url, userAgent);
  return charset ? resp.getContentText(charset) : resp.getContentText();
}
