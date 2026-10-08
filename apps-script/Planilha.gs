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
var VERSAO_CODIGO_CACHE_ = '20261007h'; // 07/10/2026 (h): validação de dados nas gravações e "a confirmar" de LCI por tipo+instituição; (g): série da Início sem FIIs no cache (lista vazia); (f) fundo DI (cota informada, valor pela cota) e título completo na Carteira RF; antes: terceiro destino da Renda Fixa (`objetivo`)

// ---------------------------------------------------------------------------
// 07/10/2026 (Tiago colou as 20 compras do fundo e as datas ficaram UM DIA ANTES na planilha): FUSO DAS DATAS GRAVADAS.
// O script roda em America/Sao_Paulo e a PLANILHA está em America/New_York. `new Date(a, m-1, d)` é a meia-noite de SÃO PAULO - na
// planilha isso aparece como 22:00/23:00 do dia ANTERIOR, e as fórmulas dela (e quem abre a aba) veem o dia errado. O site lia certo
// porque converte no fuso do script (chaveDiaISOInicio_), por isso ninguém viu. Regra: toda data que o site GRAVA numa aba que o
// Tiago usa é a meia-noite NO FUSO DA PLANILHA, feita aqui (dataNaPlanilha_). A LEITURA não muda (chaveDiaISOInicio_, fuso do script):
// 00:00 em Nova York cai às 01:00/02:00 em São Paulo, o mesmo dia, nos dois fusos. As abas aux_* internas (histórico, snapshot...) ficam
// como estão: só o script lê e a leitura funciona nos dois formatos.
// ---------------------------------------------------------------------------

/** Fuso da planilha (ex. 'America/New_York'); sem a informação (teste, erro) cai no fuso do script. */
function fusoDaPlanilha_(ss) {
  try {
    var tz = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSpreadsheetTimeZone();
    if (tz) return String(tz);
  } catch (e) { /* planilha sem a informação */ }
  return Session.getScriptTimeZone();
}

/** É uma Date? (não usa instanceof: vale também pra Date vinda de outro contexto de execução) */
function ehDataPlanilha_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

// ---------------------------------------------------------------------------
// 07/10/2026 (Tiago: "enviei o lançamento da B3 ... duplicação da aplicação do LCI, e as minhas aplicações continuam
// como a confirmar"): a coluna "Movimentação" de Transações / Transações - USA / Transações Renda Fixa tem VALIDAÇÃO DE
// DADOS em lista ("Compra,Venda") que REJEITA o resto. O setValues do Apps Script grava célula a célula e para no 1º valor
// recusado: a linha da LCI ("APLICAÇÃO", como vem da B3) ficou só com Produto+Data, o Tesouro da mesma importação nem
// entrou, e o erro voltou pro site. Toda escrita de linha em aba com validação passa por aqui ANTES de gravar:
//  - valor que a lista aceita: fica; mesma palavra com outra grafia (acento/maiúscula): vira o item da lista;
//  - sinônimo conhecido (APLICAÇÃO/Subscrição -> Compra; Resgate/Vencimento -> Venda) quando a lista tem o destino;
//  - nada disso: a linha é RECUSADA inteira (com o motivo) e nada dela é gravado - nunca mais linha pela metade.
// ---------------------------------------------------------------------------
var SINONIMOS_VALIDACAO_ = [
  { re: /^(aplica[cç][aã]o|compra|subscri[cç][aã]o)\b/i, para: 'Compra' },
  { re: /^(venda|resgate|vencimento)\b/i, para: 'Venda' }
];

function textoNormalizadoValidacao_(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
}

/** A lista que a célula exige (só quando ela RECUSA o resto), ou null. `regra` = DataValidation do Apps Script (ou null). */
function listaQueRejeita_(regra) {
  if (!regra) return null;
  try {
    if (typeof regra.getAllowInvalid === 'function' && regra.getAllowInvalid()) return null;
    var tipos = (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.DataValidationCriteria) || {};
    var criterio = String(regra.getCriteriaType()), args = regra.getCriteriaValues() || [];
    if (criterio === String(tipos.VALUE_IN_LIST || 'VALUE_IN_LIST')) return (args[0] || []).map(function (x) { return String(x == null ? '' : x).trim(); }).filter(function (x) { return x; });
    if (criterio === String(tipos.VALUE_IN_RANGE || 'VALUE_IN_RANGE') && args[0] && args[0].getValues) {
      return [].concat.apply([], args[0].getValues()).map(function (x) { return String(x == null ? '' : x).trim(); }).filter(function (x) { return x; });
    }
  } catch (e) { return null; }
  return null;
}

/** O valor que a lista aceita no lugar de `valor` (ele mesmo, a grafia da lista ou o sinônimo), ou undefined se nenhum. */
function valorNaListaValidacao_(lista, valor) {
  if (valor === '' || valor === null || valor === undefined) return valor;
  var texto = String(valor);
  if (lista.indexOf(texto) >= 0) return valor;
  var alvo = textoNormalizadoValidacao_(texto);
  for (var i = 0; i < lista.length; i++) if (textoNormalizadoValidacao_(lista[i]) === alvo) return lista[i];
  for (var j = 0; j < SINONIMOS_VALIDACAO_.length; j++) {
    var s = SINONIMOS_VALIDACAO_[j];
    if (s.re.test(texto.trim()) && lista.indexOf(s.para) >= 0) return s.para;
  }
  return undefined;
}

/**
 * Ajusta `linhas` (que vão ser gravadas a partir de linha/coluna em `aba`) às validações em lista da planilha. As regras
 * são lidas da 1ª linha de destino (a validação vale pra coluna inteira); `linhaCabecalho` (opcional) dá o nome da coluna no motivo. Devolve { linhas, recusadas: [{ indice, motivo }] }
 * - `linhas` já sem as recusadas, na mesma ordem. Nunca grava nada.
 */
function linhasAceitasPelaValidacao_(aba, linha, coluna, linhas, linhaCabecalho) {
  var saida = { linhas: [], recusadas: [], indicesAceitos: [] };
  if (!linhas || !linhas.length) return saida;
  var largura = linhas[0].length;
  var regras = null;
  try {
    var rng = aba.getRange(linha, coluna, 1, largura);
    regras = typeof rng.getDataValidations === 'function' ? rng.getDataValidations()[0] : null;
  } catch (e) { regras = null; }
  var listas = (regras || []).map(listaQueRejeita_);
  var cab = null;
  linhas.forEach(function (l, i) {
    var nova = l.slice(), motivo = '';
    for (var c = 0; c < nova.length && !motivo; c++) {
      var lista = listas[c];
      if (!lista || !lista.length) continue;
      var aceito = valorNaListaValidacao_(lista, nova[c]);
      if (aceito === undefined) {
        if (cab === null) { try { cab = linhaCabecalho > 0 ? aba.getRange(linhaCabecalho, coluna, 1, largura).getValues()[0] : []; } catch (eCab) { cab = []; } }
        var nomeCol = String((cab && cab[c]) || '').trim() || ('coluna ' + (coluna + c));
        motivo = '"' + nova[c] + '" não é aceito em "' + nomeCol + '" da aba ' + aba.getName() + ' (a planilha só aceita: ' + lista.join(', ') + ')';
      } else nova[c] = aceito;
    }
    if (motivo) saida.recusadas.push({ indice: i, motivo: motivo });
    else { saida.linhas.push(nova); saida.indicesAceitos.push(i); }
  });
  return saida;
}

/**
 * Date à MEIA-NOITE, no fuso da planilha, do dia 'aaaa-mm-dd' (ou de uma Date - vale o dia dela no fuso do script). '' se vazio.
 * `ss` pode ser null (usa a planilha ativa).
 */
function dataNaPlanilha_(ss, chave) {
  if (chave === '' || chave === null || chave === undefined) return '';
  var dia = ehDataPlanilha_(chave) ? Utilities.formatDate(chave, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(chave).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return '';
  return Utilities.parseDate(dia, fusoDaPlanilha_(ss), 'yyyy-MM-dd');
}

/** Abas e colunas de data que o site grava (linha = primeira linha de dados). */
var ABAS_DATAS_GRAVADAS_PELO_SITE_ = [
  { aba: 'Transações', linha: 7, cols: [2] }, { aba: 'Transações - USA', linha: 7, cols: [2] },
  { aba: 'Transações Renda Fixa', linha: 7, cols: [2] },
  { aba: 'Proventos', linha: 8, cols: [1, 2] }, { aba: 'Proventos - USA', linha: 8, cols: [1, 2] },
  { aba: 'RF Contratada - Lotes', linha: 2, cols: [3] },
  { aba: 'aux_aportes', linha: 2, cols: [2] }, { aba: 'aux_aportes_eua', linha: 2, cols: [3] }, { aba: 'aux_caixa_dolar', linha: 2, cols: [2] }
];

/**
 * Função para rodar 1x no editor (07/10/2026): conserta as datas que o site já gravou como meia-noite de SÃO PAULO (22:00/23:00 do dia
 * anterior no fuso da planilha) e as regrava como meia-noite do dia certo NO FUSO DA PLANILHA. Só as colunas de data de cada aba
 * (ABAS_DATAS_GRAVADAS_PELO_SITE_). Idempotente: depois de corrigida a data está em 00:00 no fuso da planilha e não casa mais; datas à
 * mão (00:00 na planilha), fórmulas e carimbos de hora de verdade nunca são tocados. Loga quantas mudou por aba.
 * `opcoes.simular` só conta (testarCorrigirDatasGravadasNoFusoDireto).
 */
function corrigirDatasGravadasNoFusoDireto(opcoes) {
  var simular = !!(opcoes && opcoes.simular === true);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fusoScript = Session.getScriptTimeZone();
  var fusoPlan = fusoDaPlanilha_(ss);
  var resumo = { fusoScript: fusoScript, fusoPlanilha: fusoPlan, abas: {}, total: 0, simulado: simular };
  if (fusoScript === fusoPlan) {
    Logger.log('Planilha e script no mesmo fuso (' + fusoPlan + '): nada a corrigir.');
    return resumo;
  }
  ABAS_DATAS_GRAVADAS_PELO_SITE_.forEach(function (alvo) {
    var aba = ss.getSheetByName(alvo.aba);
    var feitas = 0;
    if (aba && aba.getLastRow() >= alvo.linha) {
      var n = aba.getLastRow() - alvo.linha + 1;
      alvo.cols.forEach(function (col) {
        var rng = aba.getRange(alvo.linha, col, n, 1);
        var vals = rng.getValues();
        var formulas = rng.getFormulas();
        var novos = vals.map(function (l, i) {
          var v = l[0];
          var ehFormula = formulas[i] && formulas[i][0];
          if (!ehFormula && ehDataPlanilha_(v) && Utilities.formatDate(v, fusoScript, 'HH:mm:ss') === '00:00:00' && Utilities.formatDate(v, fusoPlan, 'HH:mm:ss') !== '00:00:00') {
            feitas++;
            return [Utilities.parseDate(Utilities.formatDate(v, fusoScript, 'yyyy-MM-dd'), fusoPlan, 'yyyy-MM-dd')];
          }
          return [v];
        });
        if (simular) return;
        // grava só o que mudou, em blocos contínuos (linhas com fórmula ou valor intacto ficam como estão)
        var i2 = 0;
        while (i2 < vals.length) {
          if (novos[i2][0] === vals[i2][0]) { i2++; continue; }
          var j2 = i2;
          while (j2 + 1 < vals.length && novos[j2 + 1][0] !== vals[j2 + 1][0]) j2++;
          aba.getRange(alvo.linha + i2, col, j2 - i2 + 1, 1).setValues(novos.slice(i2, j2 + 1));
          i2 = j2 + 1;
        }
      });
    }
    resumo.abas[alvo.aba] = feitas;
    resumo.total += feitas;
    Logger.log((simular ? '[simulação] ' : '') + alvo.aba + (aba ? ': ' + feitas + ' data(s) ' + (simular ? 'a corrigir' : 'corrigida(s)') : ': aba não existe'));
  });
  if (resumo.total && !simular) {
    try { registrarEscritaPlanilha_(); } catch (eReg) { /* cache é só otimização */ }
    try { if (typeof invalidarCacheCarteirasRf_ === 'function') invalidarCacheCarteirasRf_(); } catch (eInv) { /* idem */ }
  }
  Logger.log('Total: ' + resumo.total + ' data(s) ' + (simular ? 'a corrigir' : 'corrigida(s)') + ' (script ' + fusoScript + ', planilha ' + fusoPlan + ').');
  return resumo;
}

/** Só conta o que a correção mudaria (não grava nada) - rode antes da corrigirDatasGravadasNoFusoDireto. */
function testarCorrigirDatasGravadasNoFusoDireto() {
  return corrigirDatasGravadasNoFusoDireto({ simular: true });
}


// ---------------------------------------------------------------------------
// 07/10/2026 (Tiago: fundo guardado pra comprar a chácara com amigos): DESTINO de um título da Renda Fixa.
// UM conceito, UMA fonte: coluna B da aba "Carteira Renda Fixa" -> 'emergencial' | 'longo-prazo' | 'objetivo'.
//   "Renda Emergencial"                                              -> emergencial
//   "Objetivo" / "Reservado" / "Reservado para objetivos" / "Meta"   -> objetivo (sem acento/maiúscula; "Objetivos"/"Metas" também)
//   qualquer outra coisa (ex. "Renda Fixa", vazio)                   -> longo-prazo
// O título 'objetivo' ENTRA no total investido/patrimônio, mas NÃO é Renda Fixa de longo prazo (nem Distribuição da
// carteira, rebalanceamento, aposentadoria). As fórmulas da PLANILHA (ex. N6 = SOMASE "Renda Emergencial") não mudam: nela
// o título 'objetivo' continua aparecendo como longo prazo - no site vale o destino novo. Todo .gs que decide emergencial x
// longo prazo x objetivo chama destinoRendaFixa_ (nunca compara o texto da coluna B direto). O espelho no front é
// assets/js/destino-renda-fixa.js.
// ---------------------------------------------------------------------------

var DESTINOS_RENDA_FIXA_ = ['emergencial', 'longo-prazo', 'objetivo'];
/** O que se grava na coluna B da Carteira Renda Fixa pra cada destino. */
var ROTULO_COLUNA_B_DESTINO_RF_ = { 'emergencial': 'Renda Emergencial', 'longo-prazo': 'Renda Fixa', 'objetivo': 'Objetivo' };

function destinoRendaFixa_(valorColunaB) {
  var t = String(valorColunaB == null ? '' : valorColunaB).toLowerCase();
  try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (eNorm) { /* sem normalize: segue com acento */ }
  t = t.replace(/\s+/g, ' ').trim();
  if (t === 'renda emergencial') return 'emergencial';
  if (t === 'objetivo' || t === 'objetivos' || t === 'reservado' || t === 'reservado para objetivo' || t === 'reservado para objetivos' ||
      t === 'meta' || t === 'metas') return 'objetivo';
  return 'longo-prazo';
}

/** Texto da coluna B (e da Classificação em aux_historico-renda-fixa) pra um destino: 'Renda Emergencial' | 'Objetivo' | 'Renda Fixa'. */
function rotuloColunaBDestinoRf_(destino) {
  return ROTULO_COLUNA_B_DESTINO_RF_[destino] || ROTULO_COLUNA_B_DESTINO_RF_['longo-prazo'];
}

/**
 * Valor atualizado (coluna L) da Carteira Renda Fixa somado por destino (coluna B): { emergencial, 'longo-prazo', objetivo, total }.
 * Uma leitura só (B e L das linhas reais). Aba ausente/ilegível -> zeros e `ok: false`.
 */
function somarCarteiraRendaFixaPorDestino_(ss) {
  var out = { emergencial: 0, 'longo-prazo': 0, objetivo: 0, total: 0, ok: false };
  try {
    var aba = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName('Carteira Renda Fixa');
    if (!aba) return out;
    var ini = LINHA_CABECALHO_CARTEIRA_RF + 1;
    var ultima = ultimaLinhaReal_(aba, [1, 4], ini);
    out.ok = true;
    if (ultima < ini) return out;
    lerAbaUmaVez_(aba, ini, ultima - ini + 1, 12).forEach(function (l) {
      if (!l[0] && !l[3]) return;
      var v = Number(l[11]);
      if (!isFinite(v)) return;
      out[destinoRendaFixa_(l[1])] += v;
      out.total += v;
    });
  } catch (e) { out.ok = false; }
  return out;
}

function carimboEscritaPlanilha_() {
  var c = '0';
  try { c = PropertiesService.getScriptProperties().getProperty(PROP_CARIMBO_ESCRITA_PLANILHA_) || '0'; } catch (e) { c = '0'; }
  return VERSAO_CODIGO_CACHE_ + '.' + c;
}

/** Marca "a planilha mudou agora" = sobe a GERAÇÃO dos dados (chamado por toda escrita - ver aoEditarPlanilha_ e travaRecurso_). */
function registrarEscritaPlanilha_() {
  esquecerLeituraUnica_();
  // 08/10/2026: + sufixo aleatório - 2 escritas no mesmo milissegundo também mudam a geração
  try { PropertiesService.getScriptProperties().setProperty(PROP_CARIMBO_ESCRITA_PLANILHA_, String(Date.now()) + Math.random().toString(36).slice(2, 6)); } catch (e) { /* cache é só otimização */ }
}

/**
 * 08/10/2026: começo de cada execução do Web App (Router.gs!doGet/doPost). No Apps Script cada execução já nasce com as
 * variáveis globais zeradas; isto deixa explícito (e vale no harness, que reaproveita o mesmo contexto entre chamadas):
 * memória de cálculo de uma execução nunca atravessa pra outra - o que atravessa é só o CacheService, chaveado pela geração.
 */
function iniciarExecucao_() {
  if (typeof MEMO_ATIVO_ !== 'undefined') MEMO_ATIVO_ = {};
  if (typeof _listasTickersCarregadas_ !== 'undefined') _listasTickersCarregadas_ = false;
  if (typeof _tickersPlanilhaLeituras_ !== 'undefined') _tickersPlanilhaLeituras_ = 0;
  _leituraUnica_ = null;
}

/**
 * 08/10/2026 (Etapa 0 - "geração" dos dados; Tiago: "o cache às vezes dá falsos positivos"): a geração (o carimbo de
 * escrita) sobe em TODA mudança - gravação pelo site (Router.gs!doPost), trava de escrita solta (gatilhos de sincronização,
 * consolidação...) e EDIÇÃO À MÃO na planilha (estes gatilhos instaláveis: "Ao editar" pega valores; "Ao alterar" pega
 * linha/aba inserida ou apagada). Edição feita pelo próprio script não dispara gatilho - essa já carimba pela trava.
 * Rode instalarGatilhoCarimboEdicao() 1x no editor.
 */
function aoEditarPlanilha_(e) {
  try { registrarEscritaPlanilha_(); } catch (erro) { /* nunca atrapalha a edição */ }
}

function aoAlterarPlanilha_(e) {
  try {
    var tipo = e && e.changeType ? String(e.changeType) : '';
    if (tipo === 'EDIT') return; // o "Ao editar" já carimbou
    registrarEscritaPlanilha_();
  } catch (erro) { /* nunca atrapalha a edição */ }
}

function instalarGatilhoCarimboEdicao() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existentes = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var feitos = [];
  if (existentes.indexOf('aoEditarPlanilha_') === -1) { ScriptApp.newTrigger('aoEditarPlanilha_').forSpreadsheet(ss).onEdit().create(); feitos.push('Ao editar'); }
  if (existentes.indexOf('aoAlterarPlanilha_') === -1) { ScriptApp.newTrigger('aoAlterarPlanilha_').forSpreadsheet(ss).onChange().create(); feitos.push('Ao alterar'); }
  Logger.log(feitos.length ? 'Gatilhos instalados: ' + feitos.join(', ') + ' - edição à mão na planilha passa a atualizar o site na hora.' : 'Os 2 gatilhos já existiam, nada a fazer.');
  return feitos;
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
      // 08/10/2026 (Etapa 0 - "geração" dos dados): soltar uma trava de ESCRITA = a planilha pode ter mudado. Carimba aqui,
      // num lugar só, em vez de cada gravação lembrar (gatilhos de sincronização, consolidação, agenda...). A leitura que
      // só espera a escrita terminar (Gastos) passa { leitura: true } e não carimba.
      if (!(opcoes && opcoes.leitura) && typeof registrarEscritaPlanilha_ === 'function') { try { registrarEscritaPlanilha_(); } catch (eReg) { /* só cache */ } }
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
