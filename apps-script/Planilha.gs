/**
 * Planilha.gs - 26/09/2026 (Tiago: "Poderíamos criar um processo de adicionar
 * um novo ativo? ... acho importante estarmos preparados pra isso").
 *
 * Pra um ativo novo entrar sem ninguém mexer em código, duas coisas que
 * eram fixas passam a ser lidas da própria planilha:
 *
 * 1) Onde ficam os blocos da aba "Distribuição e Metas". Adicionar um ativo
 *    insere uma linha no Radar de oportunidades (Ações, EUA ou FIIs) - tudo
 *    abaixo desce 1 linha (o dólar de K56, os outros blocos do Radar, os
 *    objetivos de FIIs de B73...). As fórmulas da planilha se ajustam
 *    sozinhas; o Apps Script lia endereços fixos. localDistribuicaoMetas_
 *    acha cada bloco pelo rótulo (cabeçalho "Ranking | Ativo", "Cotação do
 *    dólar hoje:", "⋘ Carteira Recomendada ...") - e cai nos endereços de
 *    sempre se algum rótulo não estiver lá.
 *
 * 2) A lista de tickers da sincronização do patrimônio (Sync.gs: TICKERS_*).
 *    carregarListasTickersDaPlanilha_ acrescenta às listas fixas os ativos
 *    de "Auxiliar_ativos" (ticker de verdade: 4 letras + número no Brasil,
 *    letras nos EUA - recibo de subscrição tipo AXIA15G fica de fora).
 */

var _memoLocalDM_ = null;

/** { radarAcoes, radarUsa, radarFiis (1ª linha de dados), dolar ('K56'), linkUsa, linkFiis, objetivosFiis (1ª linha) } */
function localDistribuicaoMetas_(dm) {
  if (_memoLocalDM_ && _memoLocalDM_.dm === dm) return _memoLocalDM_.local;
  var local = { radarAcoes: 42, radarUsa: 59, radarFiis: 82, dolar: 'K56', linkUsa: 'C56', linkFiis: 'C79', objetivosFiis: 73 };
  try {
    var n = Math.min(dm.getLastRow() || 0, 400);
    if (n > 0) {
      var vals = dm.getRange(1, 1, n, 11).getValues(); // A..K
      var radares = [];
      vals.forEach(function (l, i) {
        var linha = i + 1;
        var b = String(l[1] || '').trim(), c = String(l[2] || '').trim(), j = String(l[9] || '').trim();
        if (b === 'Ranking' && c === 'Ativo') radares.push(linha + 1);
        if (/^cota[cç][aã]o do d[oó]lar/i.test(j)) local.dolar = 'K' + linha;
        if (/carteira recomendada internacional/i.test(c)) local.linkUsa = 'C' + linha;
        if (/carteira recomendada fiis/i.test(c)) local.linkFiis = 'C' + linha;
        if (b === 'Tipo' && c === '% desejado') local.objetivosFiis = linha + 1;
      });
      if (radares.length === 3) { local.radarAcoes = radares[0]; local.radarUsa = radares[1]; local.radarFiis = radares[2]; }
    }
  } catch (e) { /* fica com os endereços de sempre */ }
  _memoLocalDM_ = { dm: dm, local: local };
  return local;
}

/** Esquece as posições (depois de inserir/apagar linha na aba, na mesma execução). */
function esquecerLocalDistribuicaoMetas_() { _memoLocalDM_ = null; }

/** Dólar de hoje (célula "Cotação do dólar hoje:" da Distribuição e Metas). */
function cotacaoDolarHoje_(ss) {
  var dm = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName('Distribuição e Metas');
  if (!dm) return null;
  var v = dm.getRange(localDistribuicaoMetas_(dm).dolar).getValue();
  return typeof v === 'number' && v > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// 05/10/2026 (auditoria A-31/A-32, Onda 2): "última linha real" das abas com
// fórmula pré-preenchida até ~10.800 (Transações, Transações - USA,
// Transações Renda Fixa, Carteira Renda Fixa). getLastRow() nelas é sempre
// ~10.800 (as colunas K/M/P têm fórmula até lá) mesmo com ~100-400 linhas
// de verdade: ler "até getLastRow()" custava ~65% das células de um `home`
// frio, e a chave de cache feita com getLastRow() nunca mudava quando o
// Tiago digitava um aporte direto na planilha.
// ---------------------------------------------------------------------------

var LINHAS_POR_BLOCO_ULTIMA_REAL_ = 500;

/**
 * Última linha (>= primeiraLinha) com algo nas colunas-chave `colunas` (número
 * 1-based ou lista; lê o intervalo contíguo do menor ao maior). Lê em blocos de
 * 500 linhas só das colunas-chave e para no 1º bloco cuja última linha está
 * vazia - então uma sequência de linhas em branco que atravesse o fim de um bloco
 * encerra a busca (as abas crescem sempre na 1ª linha vazia, ver
 * proximaLinhaVaziaTransacoes_, então não há buracos desse tamanho).
 * Devolve primeiraLinha - 1 quando não há nada. Nunca passa de getLastRow().
 */
function ultimaLinhaReal_(aba, colunas, primeiraLinha) {
  var ini = primeiraLinha || 1;
  var lista = [].concat(colunas || 1);
  var c0 = Math.min.apply(null, lista), c1 = Math.max.apply(null, lista);
  var teto = aba.getLastRow();
  var ultima = ini - 1;
  var linha = ini;
  while (linha <= teto) {
    var n = Math.min(LINHAS_POR_BLOCO_ULTIMA_REAL_, teto - linha + 1);
    var bloco = aba.getRange(linha, c0, n, c1 - c0 + 1).getValues();
    var achou = false;
    for (var i = bloco.length - 1; i >= 0 && !achou; i--) {
      for (var c = 0; c < lista.length; c++) {
        var v = bloco[i][lista[c] - c0];
        if (v !== '' && v != null) { achou = true; break; }
      }
      if (achou) ultima = linha + i;
    }
    if (!achou || ultima < linha + n - 1) break; // a última linha do bloco já está vazia: os dados acabaram aqui dentro
    linha += n;
  }
  return ultima;
}

/** Última linha real das 4 abas de lançamentos por nome - chaves A:B (ticker/produto + data), Carteira RF A:D (0 se a aba não existe). */
function ultimaLinhaRealPorNome_(ss, nome) {
  var aba = ss.getSheetByName(nome);
  if (!aba) return 0;
  var ini = nome === 'Carteira Renda Fixa' ? LINHA_CABECALHO_CARTEIRA_RF + 1
    : (nome === 'Transações Renda Fixa' ? LINHA_CABECALHO_TRANSACOES_RF + 1 : LINHA_DADOS_TRANSACOES_FLUXO);
  return nome === 'Carteira Renda Fixa' ? ultimaLinhaReal_(aba, [1, 4], ini) : ultimaLinhaReal_(aba, [1, 2], ini);
}

var PROP_CARIMBO_ESCRITA_PLANILHA_ = 'PLANILHA_CARIMBO_ESCRITA';

/**
 * Carimbo da última escrita (feita pelo app ou por edição manual avisada por
 * aoEditarPlanilha_) - entra nas chaves de cache da série/ativo/proventos junto
 * com a última linha real, então corrigir um valor NO LUGAR (mesma linha) também
 * invalida, não só uma linha nova.
 */
/**
 * 07/10/2026 (Tiago publicou a versão nova e a tela continuou recebendo a resposta de `gastos` da versão ANTERIOR - sem
 * fontesEncerradas - porque a chave do cache não muda com o código, só com escrita na planilha): a VERSÃO DO CÓDIGO entra
 * no carimbo, então toda resposta em cache (gastos, metas, série, proventos...) vira chave nova quando o formato muda.
 * Suba este valor sempre que um .gs mudar o FORMATO de uma resposta cacheada.
 */
var VERSAO_CODIGO_CACHE_ = '20261007b';

function carimboEscritaPlanilha_() {
  var c = '0';
  try { c = PropertiesService.getScriptProperties().getProperty(PROP_CARIMBO_ESCRITA_PLANILHA_) || '0'; } catch (e) { c = '0'; }
  return VERSAO_CODIGO_CACHE_ + '.' + c;
}

/** Marca "a planilha mudou agora" (chamado ao fim de lançamentos/importações/Limpar cache). */
function registrarEscritaPlanilha_() {
  esquecerLeituraUnica_();
  try { PropertiesService.getScriptProperties().setProperty(PROP_CARIMBO_ESCRITA_PLANILHA_, String(Date.now())); } catch (e) { /* cache é só otimização */ }
}

var ABAS_QUE_INVALIDAM_CACHE_ = ['Transações', 'Transações - USA', 'Transações Renda Fixa', 'Carteira Renda Fixa', 'Proventos', 'Proventos - USA'];

/**
 * OPCIONAL: gatilho instalável "Ao editar" (instalarGatilhoCarimboEdicao, rodar 1x no editor).
 * Só carimba quando a edição é numa das abas-fonte do fluxo de caixa - edição manual de
 * aporte/provento passa a refletir no app sem esperar o dia virar nem o "Limpar cache".
 */
function aoEditarPlanilha_(e) {
  try {
    var nome = e && e.range && e.range.getSheet().getName();
    if (nome && ABAS_QUE_INVALIDAM_CACHE_.indexOf(nome) !== -1) registrarEscritaPlanilha_();
  } catch (erro) { /* nunca atrapalha a edição */ }
}

function instalarGatilhoCarimboEdicao() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'aoEditarPlanilha_'; });
  if (jaExiste) { Logger.log('Gatilho já existe, nada a fazer.'); return; }
  ScriptApp.newTrigger('aoEditarPlanilha_').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  Logger.log('Gatilho "Ao editar" (carimbo de escrita) instalado.');
}

// ---------------------------------------------------------------------------
// 05/10/2026 (auditoria A-33): leitura única por execução. `metasHistorico`,
// `salario`, `patrimonio` e `ativo` montam a série da Início E a tela Proventos
// (e o fluxo de caixa 2x): cada passada relia Transações (3 abas), Carteira Renda
// Fixa e aux_historico-* do zero (1,28 M de células a frio, 43-51 abas abertas).
// Num doGet (Router.gs liga a memória com ativarLeituraUnica_) a MESMA faixa
// da MESMA aba é lida 1 vez e devolvida às outras passadas. Só valores de
// leitura: quem recebe NÃO pode alterar as linhas. Fora do doGet (gatilhos,
// sincronização, doPost, que gravam nessas abas) fica DESLIGADA - lê direto.
// ---------------------------------------------------------------------------

var _leituraUnica_ = null;

/** Liga (e zera) a memória de leituras - chamada no começo de cada doGet. */
function ativarLeituraUnica_() { _leituraUnica_ = {}; }

/** Desliga e esquece (rodar depois de qualquer escrita nessas abas, na mesma execução). */
function esquecerLeituraUnica_() { _leituraUnica_ = null; }

/**
 * aba.getRange(linha, 1, qtdLinhas, colunas).getValues() 1 vez por execução (ligada). Se outra
 * passada pedir MAIS colunas da mesma faixa, relê com o maior número e passa a devolver esse.
 * As linhas podem vir com colunas a mais do que as pedidas: quem usa só lê por índice.
 */
function lerAbaUmaVez_(aba, linha, qtdLinhas, colunas) {
  var nome = _leituraUnica_ && typeof aba.getName === 'function' ? aba.getName() : null;
  if (!nome) return aba.getRange(linha, 1, qtdLinhas, colunas).getValues();
  var chave = nome + '|' + linha + '|' + qtdLinhas;
  var guardado = _leituraUnica_[chave];
  if (guardado && guardado.colunas >= colunas) return guardado.valores;
  var valores = aba.getRange(linha, 1, qtdLinhas, colunas).getValues();
  _leituraUnica_[chave] = { colunas: colunas, valores: valores };
  return valores;
}

var _listasTickersCarregadas_ = false;
var RE_TICKER_BR_ = /^[A-Z]{4}\d{1,2}$/;
var RE_TICKER_USA_ = /^[A-Z]{1,5}(\.[A-Z])?$/;

/**
 * Preenche as listas de Sync.gs (TICKERS_ACOES_BR, TICKERS_FIIS_BR, TICKERS_BR, TICKERS_USA - hoje vazias no código) com os
 * ativos de Auxiliar_ativos (Sync.gs!carregarTickersDaPlanilha_, com cache). Mexe nos próprios arrays (quem já guardou a
 * referência enxerga). 1x por execução (zerar _listasTickersCarregadas_ força reler).
 */
function carregarListasTickersDaPlanilha_(ss) {
  if (_listasTickersCarregadas_) return;
  _listasTickersCarregadas_ = true;
  // 06/10/2026: as listas nascem vazias em Sync.gs e são lidas da Auxiliar_ativos (com cache) por carregarTickersDaPlanilha_
  if (typeof carregarTickersDaPlanilha_ !== 'function') return;
  try { carregarTickersDaPlanilha_(ss); } catch (e) { Logger.log('carregarListasTickersDaPlanilha_: ' + e); }
}

// ---------------------------------------------------------------------------
// 05/10/2026 (A-45): TRAVA POR RECURSO, no lugar do LockService.getScriptLock()
// único. Antes, a sincronização de preços segurava o lock do SCRIPT inteiro por
// até 5,5 min (das 10:01 às ~10:07) e os 22 handlers de escrita (salvar aporte,
// meta, despesa, favorito...) esperavam nesse mesmo lock (8-30 s) e respondiam
// "planilha ocupada". O Apps Script só tem 3 locks (script/usuário/documento),
// nenhum com nome, então aqui cada RECURSO ganha um "aluguel" gravado nas
// Propriedades do script (chave TRAVA_<recurso> = {id, dono, desde, ate}) e o
// lock do script só protege a seção crítica de ler/gravar esse aluguel
// (milissegundos), nunca o trabalho em si.
//
// Recursos usados:
//   'precos'   - célula de rascunho do GOOGLEFINANCE (Auxiliar_app!AZ1) e as abas
//                aux_historico-* (sync de preços, Renda Fixa/Índices, reparos,
//                consolidação)
//   'carteira' - Transações, Proventos, Auxiliar_ativos e abas das carteiras
//                (aportes, lançamentos/importações, ativo novo, consolidação)
//   'metas', 'despesas', 'gastos', 'patrimonio', 'salario', 'favoritos' - uma
//                aba/tela cada
//
// Mesma interface do objeto do LockService (tryLock/waitLock/releaseLock/
// hasLock), então quem usava getScriptLock() só troca a 1ª linha. Cada aluguel
// tem validade (ttlMs; padrão 90 s): se a execução morrer sem soltar, o recurso
// volta sozinho. O dono ("Sync de preços (Automático)" etc.) fica na chave, e
// donoAtual() devolve quem está segurando - vai pro Registro de Controle.
// Sem PropertiesService (testes/ambiente estranho) cai no lock de script antigo.
// ---------------------------------------------------------------------------

var TRAVA_PREFIXO_ = 'TRAVA_';
var TRAVA_TTL_PADRAO_MS_ = 90 * 1000;

function travaDescreverBloqueio_(b) {
  if (!b) return 'outra operação';
  var quando = '';
  try { quando = Utilities.formatDate(new Date(b.desde), 'America/Sao_Paulo', 'HH:mm:ss'); } catch (e) { quando = ''; }
  return (b.dono || 'outra operação') + (quando ? ' (desde ' + quando + ')' : '');
}

/** Quem segura o recurso agora ({dono, desde, ate, recurso}), ou null se está livre. */
function donoDaTrava_(recurso) {
  try {
    var bruto = PropertiesService.getScriptProperties().getProperty(TRAVA_PREFIXO_ + recurso);
    if (!bruto) return null;
    var b = JSON.parse(bruto);
    if (!b || !(b.ate > Date.now())) return null;
    b.recurso = recurso;
    return b;
  } catch (e) { return null; }
}

/**
 * @param {string|Array<string>} recursos - um ou mais recursos; pega TODOS ou nenhum.
 * @param {string} [dono] - texto que aparece no Registro quando alguém esbarra nesta trava.
 * @param {{ttlMs:number}} [opcoes] - validade do aluguel (padrão 90 s; a sync usa 6,5 min).
 */
function travaRecurso_(recursos, dono, opcoes) {
  var lista = (Array.isArray(recursos) ? recursos : [recursos]).map(String).filter(function (r, i, a) { return r && a.indexOf(r) === i; });
  var ttl = (opcoes && opcoes.ttlMs) || TRAVA_TTL_PADRAO_MS_;
  var donoTxt = dono || ('escrita em ' + lista.join(' + '));
  var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var segura = false;
  var ultimoBloqueio = null;
  var legado = null; // lock de script antigo, só se as Propriedades não estiverem disponíveis

  function esperar(ms) {
    if (typeof Utilities === 'undefined' || typeof Utilities.sleep !== 'function') return false;
    Utilities.sleep(ms);
    return true;
  }

  // 1 tentativa, tudo-ou-nada, dentro de uma seção crítica curta no lock do script
  function tentarUma() {
    var mutex = LockService.getScriptLock();
    try { mutex.waitLock(10000); } catch (eM) { ultimoBloqueio = { dono: 'trava interna do script (ocupada)', desde: Date.now() }; return false; }
    try {
      var props = PropertiesService.getScriptProperties();
      var agora = Date.now();
      var atuais = lista.map(function (r) {
        var b = null;
        try { var s = props.getProperty(TRAVA_PREFIXO_ + r); b = s ? JSON.parse(s) : null; } catch (eP) { b = null; }
        return b;
      });
      for (var i = 0; i < lista.length; i++) {
        var b = atuais[i];
        if (b && b.id !== id && b.ate > agora) { ultimoBloqueio = { dono: b.dono, desde: b.desde, recurso: lista[i] }; return false; }
      }
      lista.forEach(function (r, i) {
        var desde = atuais[i] && atuais[i].id === id ? atuais[i].desde : agora;
        props.setProperty(TRAVA_PREFIXO_ + r, JSON.stringify({ id: id, dono: donoTxt, desde: desde, ate: agora + ttl }));
      });
      return true;
    } finally {
      mutex.releaseLock();
    }
  }

  var obj = {
    recursos: lista,
    tryLock: function (ms) {
      if (typeof PropertiesService === 'undefined') {
        legado = legado || LockService.getScriptLock();
        if (typeof legado.tryLock === 'function') segura = !!legado.tryLock(ms); else { legado.waitLock(ms); segura = true; }
        return segura;
      }
      var limite = Date.now() + (ms || 0);
      var maxVoltas = Math.ceil((ms || 0) / 400) + 1; // teto por contagem também (relógio parado em teste não trava)
      for (var volta = 0; volta < maxVoltas; volta++) {
        if (tentarUma()) { segura = true; return true; }
        var restante = limite - Date.now();
        if (restante <= 0 || !esperar(Math.min(400, restante))) return false;
      }
      return false;
    },
    waitLock: function (ms) {
      if (!obj.tryLock(ms)) throw new Error('Não deu pra obter a trava de ' + lista.join(' + ') + ' em ' + ms + ' ms - ocupada por ' + obj.donoAtual());
    },
    releaseLock: function () {
      if (!segura) return;
      segura = false;
      if (legado) { legado.releaseLock(); return; }
      var mutex = null, tem = false;
      try { mutex = LockService.getScriptLock(); mutex.waitLock(5000); tem = true; } catch (eM) { tem = false; }
      try {
        var props = PropertiesService.getScriptProperties();
        lista.forEach(function (r) {
          try {
            var s = props.getProperty(TRAVA_PREFIXO_ + r);
            var b = s ? JSON.parse(s) : null;
            if (b && b.id === id) { if (typeof props.deleteProperty === 'function') props.deleteProperty(TRAVA_PREFIXO_ + r); else props.setProperty(TRAVA_PREFIXO_ + r, ''); }
          } catch (eR) { /* o aluguel expira sozinho */ }
        });
      } finally {
        if (tem) mutex.releaseLock();
      }
    },
    hasLock: function () { return segura; },
    /** Texto de quem segurava quando esta trava não foi obtida ("Sync de preços (Automático) (desde 10:01:03)"). */
    donoAtual: function () { return travaDescreverBloqueio_(ultimoBloqueio); }
  };
  return obj;
}

/** Rodar no editor SÓ se uma trava ficar presa (ex.: execução morta há menos de 6,5 min): solta todos os recursos. */
function liberarTravasForcado() {
  var props = PropertiesService.getScriptProperties();
  var soltas = [];
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf(TRAVA_PREFIXO_) === 0) { props.deleteProperty(k); soltas.push(k.slice(TRAVA_PREFIXO_.length)); }
  });
  Logger.log('Travas liberadas: ' + (soltas.join(', ') || 'nenhuma'));
  return soltas;
}

/**
 * 06/10/2026 (A-80): `opcoesTeste` (modo de teste de ImportB3.gs/Sync.gs) só pode apontar pra uma aba
 * cujo nome COMECE com "aux_tests" - nunca pra uma aba real. Devolve o nome ou lança erro.
 */
function nomeAbaTesteValido_(nome) {
  var n = String(nome == null || nome === '' ? 'aux_tests' : nome);
  if (n.indexOf('aux_tests') !== 0) throw new Error('opcoesTeste: o nome da aba de teste precisa começar com "aux_tests" (recebido: ' + n + ')');
  return n;
}
