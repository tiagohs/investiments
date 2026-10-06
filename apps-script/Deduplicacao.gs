/**
 * Deduplicacao.gs - 06/10/2026: módulo ÚNICO de idempotência das gravações de movimentação.
 *
 * Tiago: "garanta que se eu reimportar novas transações, movimentações, etc, não se repita na planilha,
 * não importa o ativo." (já houve compra de Tesouro Selic em dobro, com a instituição escrita "S/A" e "S/A.").
 *
 * Regra única, usada por TODO caminho que grava linha de movimentação (Lancamentos.gs, ImportB3.gs, Gastos.gs,
 * Aportes.gs e a gravação de "RF Contratada - Lotes"):
 *  1. Cada linha tem uma CHAVE CANÔNICA por tipo (chaveDedup_): dia + ativo normalizado (ticker pelo
 *     resolverAliasTicker_; Renda Fixa pelo chaveTituloRf_ = título + instituição) + tipo/operação + quantidade
 *     (6 casas) + preço e valor (centavos) + instituição normalizada ("S/A" = "S.A." = "S/A." = "SA", sem
 *     espaço/tab/quebra) + conta/moeda (o tipo entra na chave: Brasil x EUA, R$ x US$).
 *  2. Compara com as linhas JÁ existentes na aba (quem chama lê só até a última linha real - ultimaLinhaReal_)
 *     e também dentro do próprio lote.
 *  3. Contagem por chave: duas compras idênticas no mesmo dia são legítimas, então só entra o EXCEDENTE: o
 *     arquivo traz 3 iguais e a planilha tem 1 -> grava 2. Itens de ARQUIVOS DIFERENTES do mesmo lote com a mesma
 *     chave (extratos que se sobrepõem, ex.: Negociação + Movimentação) valem pela maior contagem de um arquivo
 *     só, não pela soma.
 * Nada aqui apaga linha: relatorioDuplicadasPlanilha() (editor) só LISTA o que já está repetido, pro Tiago
 * revisar à mão.
 */

var DEDUP_CASAS_QTD_ = 6;
var DEDUP_MAX_EXEMPLOS_ = 5;

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/** 'yyyy-MM-dd' de Date (fuso do script) ou texto 'aaaa-mm-dd' / 'dd/mm/aaaa'; '' se não for data. */
function dedupDia_(v) {
  if (v && typeof v.getTime === 'function') {
    if (isNaN(v.getTime())) return '';
    if (typeof chaveDiaISOInicio_ === 'function') return chaveDiaISOInicio_(v);
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  }
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

/** Maiúsculo, sem acento, espaços/tab/quebra colapsados. */
function dedupTexto_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Só letras e números (pontuação, espaço, tab e quebra somem). */
function dedupAlfanum_(s) {
  return dedupTexto_(s).replace(/[^A-Z0-9]/g, '');
}

/** Número arredondado a `casas` (inteiro escalado, em texto); '' pra vazio/'-'/inválido. `abs` ignora o sinal. */
function dedupNum_(v, casas, abs) {
  var n = typeof v === 'number' ? v : (typeof numeroLanc_ === 'function' ? numeroLanc_(v) : Number(String(v == null ? '' : v).replace(',', '.')));
  if (n === null || n === undefined || !isFinite(n)) return '';
  if (abs) n = Math.abs(n);
  var f = Math.pow(10, casas);
  var r = Math.round(n * f + (n >= 0 ? 1e-7 : -1e-7));
  return String(r === 0 ? 0 : r);
}

function dedupCentavos_(v, abs) { return dedupNum_(v, 2, abs); }
function dedupQtd_(v) { return dedupNum_(v, DEDUP_CASAS_QTD_, true); }

/** Ticker ATUAL (alias de renomeação/incorporação), maiúsculo. */
function dedupTicker_(t) {
  return typeof resolverAliasTicker_ === 'function' ? resolverAliasTicker_(t) : String(t == null ? '' : t).trim().toUpperCase();
}

/** Instituição sem pontuação/espaço, agrupando as grafias da mesma corretora (XP/Rico, NU, Inter) como o resto do projeto. */
function dedupInstituicao_(s) {
  if (typeof normalizarInstituicaoRF_ === 'function') return normalizarInstituicaoRF_(s);
  return dedupAlfanum_(s);
}

/** Título de Renda Fixa + instituição (chaveTituloRf_, RendaFixaIR.gs); sem ela, nome normalizado + instituição. */
function dedupTituloRf_(produto, instituicao) {
  if (typeof chaveTituloRf_ === 'function') return chaveTituloRf_(produto, instituicao);
  return dedupTexto_(produto) + '|' + dedupInstituicao_(instituicao);
}

// ---------------------------------------------------------------------------
// Chave canônica
// ---------------------------------------------------------------------------

/**
 * tipo: 'transacoes' | 'transacoesUsa' | 'rendaFixa' | 'proventos' | 'proventosUsa' | 'lotesRf' | 'gastos' | 'caixaDolar' | 'aporte'.
 * x: o item no formato de itemDaLinhaLanc_ (Lancamentos.gs) ou, nos outros tipos, o objeto descrito em cada ramo.
 */
function chaveDedup_(tipo, x) {
  x = x || {};
  switch (tipo) {
    case 'transacoes':
    case 'transacoesUsa':
      // a taxa não entra: a mesma ordem vem com taxa num extrato e sem taxa na linha lançada à mão
      return [tipo, dedupDia_(x.data), dedupTicker_(x.ticker), dedupTexto_(x.tipo), dedupQtd_(x.qtd), dedupCentavos_(x.preco, true)].join('|');
    case 'rendaFixa':
      return [tipo, dedupDia_(x.data), dedupTituloRf_(x.produto, x.instituicao), dedupAlfanum_(x.movimentacao),
        dedupQtd_(x.qtd), dedupCentavos_(x.preco, true), dedupCentavos_(x.valor, true)].join('|');
    case 'lotesRf':
      return [tipo, dedupDia_(x.data), dedupTituloRf_(x.produto, x.instituicao), dedupQtd_(x.qtd), dedupCentavos_(x.preco, true), dedupCentavos_(x.valor, true)].join('|');
    case 'proventos':
    case 'proventosUsa':
      // a quantidade fica de fora: a planilha guarda "-" quando o extrato não traz (ativo + dia de pagamento + tipo + valor já identificam)
      return [tipo, dedupDia_(x.dataPagamento), dedupTicker_(x.ticker), dedupAlfanum_(x.tipo), dedupCentavos_(x.valor, true)].join('|');
    case 'gastos':
      return [tipo, dedupAlfanum_(x.origem), dedupAlfanum_(x.fonte), dedupDia_(x.data), dedupCentavos_(x.valor, false), dedupAlfanum_(x.descricao)].join('|');
    case 'caixaDolar':
      return [tipo, dedupDia_(x.data), dedupAlfanum_(x.tipo), dedupCentavos_(x.usd, false), dedupCentavos_(x.reais, false)].join('|');
    case 'aporte':
      return [tipo, dedupDia_(x.data), (x.itens || []).map(function (it) {
        return [dedupAlfanum_(it.classe), dedupTicker_(it.ativo), dedupQtd_(it.qtdFinal), dedupCentavos_(it.valorFinal, true)].join(':');
      }).sort().join(';')].join('|');
  }
  throw new Error('tipo de linha desconhecido para deduplicar: ' + tipo);
}

/** { chave: quantas } das linhas existentes. */
function contarChavesDedup_(lista, tipo) {
  var c = {};
  (lista || []).forEach(function (it) { var k = chaveDedup_(tipo, it); c[k] = (c[k] || 0) + 1; });
  return c;
}

// ---------------------------------------------------------------------------
// Filtro com contagem
// ---------------------------------------------------------------------------

/**
 * existentesPorTipo: { tipo: [item...] } - o que a planilha já tem. Devolve { testar(tipo, item) }, que vai
 * consumindo: '' = linha nova (entra), 'planilha' = já estava na planilha, 'lote' = repetida de outro arquivo
 * do mesmo lote. Chame na ordem do lote, só pra item válido (o que não vai ser gravado não consome contagem).
 * O arquivo vem de item.arquivo (itens sem arquivo formam um arquivo só).
 */
function criarDedupLote_(existentesPorTipo) {
  var jaTem = {};
  Object.keys(existentesPorTipo || {}).forEach(function (t) {
    var c = contarChavesDedup_(existentesPorTipo[t], t);
    Object.keys(c).forEach(function (k) { jaTem[k] = (jaTem[k] || 0) + c[k]; });
  });
  var vistoNoArquivo = {}, reivindicado = {};
  return {
    testar: function (tipo, it) {
      var k = chaveDedup_(tipo, it);
      var ka = k + '\u0001' + String((it && it.arquivo) || '');
      var ocorrencia = vistoNoArquivo[ka] = (vistoNoArquivo[ka] || 0) + 1; // 1ª, 2ª, 3ª igual DENTRO do arquivo
      if (ocorrencia <= (jaTem[k] || 0)) return 'planilha';
      var kk = k + '\u0001' + ocorrencia;
      if (reivindicado[kk]) return 'lote'; // a mesma ocorrência já entrou vinda de outro arquivo
      reivindicado[kk] = true;
      return '';
    }
  };
}

/**
 * Atalho pra quem não precisa de situação por item. opcoes.forcar(item) = true deixa o item passar (escolha
 * explícita do Tiago no lançamento manual). Devolve { novos, duplicadas, ignoradasDuplicadas, exemplos }
 * (novos/duplicadas mantêm a ordem de entrada; exemplos = até 5 frases humanas).
 */
function filtrarDuplicadasDedup_(tipo, existentes, novos, opcoes) {
  var o = opcoes || {};
  var m = {};
  m[tipo] = existentes || [];
  var dedup = criarDedupLote_(m);
  var out = { novos: [], duplicadas: [], ignoradasDuplicadas: 0, exemplos: [] };
  (novos || []).forEach(function (it) {
    var onde = o.forcar && o.forcar(it) ? '' : dedup.testar(tipo, it);
    if (!onde) out.novos.push(it); else out.duplicadas.push(it);
  });
  out.ignoradasDuplicadas = out.duplicadas.length;
  out.exemplos = exemplosDuplicadasDedup_(tipo, out.duplicadas);
  return out;
}

// ---------------------------------------------------------------------------
// Texto humano
// ---------------------------------------------------------------------------

function dedupDataBr_(chave) {
  var m = String(chave || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

function dedupDinheiro_(v, moeda) {
  var n = typeof v === 'number' ? v : (typeof numeroLanc_ === 'function' ? numeroLanc_(v) : Number(v));
  if (n === null || n === undefined || !isFinite(n)) return '';
  var partes = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + (moeda === 'USD' ? 'US$ ' : 'R$ ') + partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + partes[1];
}

/** "ABCD3 · Compra · 10/08/2026 · 10 × R$ 20,00" - uma linha por duplicada, pra tela e pro log. */
function descricaoLinhaDedup_(tipo, x) {
  x = x || {};
  var usd = tipo === 'transacoesUsa' || tipo === 'proventosUsa';
  var partes = [];
  if (tipo === 'transacoes' || tipo === 'transacoesUsa') {
    partes = [x.ticker, x.tipo, dedupDataBr_(dedupDia_(x.data)), (x.qtd != null && x.qtd !== '' ? x.qtd + ' × ' : '') + dedupDinheiro_(x.preco, usd ? 'USD' : 'BRL')];
  } else if (tipo === 'rendaFixa' || tipo === 'lotesRf') {
    var valor = x.valor != null && x.valor !== '' ? x.valor : (Number(x.qtd) * Number(x.preco));
    partes = [x.produto, x.movimentacao || 'Compra', dedupDataBr_(dedupDia_(x.data)), dedupDinheiro_(valor, 'BRL'), x.instituicao];
  } else if (tipo === 'proventos' || tipo === 'proventosUsa') {
    partes = [x.ticker, x.tipo, dedupDataBr_(dedupDia_(x.dataPagamento)), dedupDinheiro_(x.valor, usd ? 'USD' : 'BRL')];
  } else if (tipo === 'gastos') {
    partes = [x.descricao, dedupDataBr_(dedupDia_(x.data)), dedupDinheiro_(x.valor, 'BRL')];
  } else if (tipo === 'caixaDolar') {
    partes = ['Caixa em dólar', x.tipo, dedupDataBr_(dedupDia_(x.data)), dedupDinheiro_(x.usd, 'USD')];
  } else if (tipo === 'aporte') {
    partes = ['Aporte', dedupDataBr_(dedupDia_(x.data)), (x.itens || []).length + ' ativo(s)'];
  }
  return partes.filter(function (p) { return p !== '' && p != null; }).join(' · ');
}

function exemplosDuplicadasDedup_(tipo, duplicadas, max) {
  return (duplicadas || []).slice(0, max || DEDUP_MAX_EXEMPLOS_).map(function (it) { return descricaoLinhaDedup_(it.destino || tipo, it); });
}

/** "3 linhas já estavam na planilha e foram ignoradas." (singular/plural certos). */
function textoIgnoradasDedup_(n) {
  if (!n) return '';
  return n === 1 ? '1 linha já estava na planilha e foi ignorada.' : n + ' linhas já estavam na planilha e foram ignoradas.';
}

// ---------------------------------------------------------------------------
// Relatório (editor) - só LISTA, não apaga
// ---------------------------------------------------------------------------

/**
 * Abas de movimentação varridas pelo relatório: nome, primeira linha de dados, colunas lidas, coluna-chave de
 * "linha preenchida", tipo da chave e como montar o item.
 */
function abasRelatorioDedup_() {
  var L = typeof LANC_ABAS !== 'undefined' ? LANC_ABAS : {};
  var lista = [];
  ['transacoes', 'transacoesUsa', 'rendaFixa', 'proventos', 'proventosUsa'].forEach(function (d) {
    if (L[d]) lista.push({ tipo: d, aba: L[d].aba, linha: L[d].linha, cols: L[d].cols, colChave: L[d].colChave, item: function (l) { return itemDaLinhaLanc_(d, l); } });
  });
  lista.push({
    tipo: 'lotesRf', aba: typeof LANC_ABA_LOTES_RF !== 'undefined' ? LANC_ABA_LOTES_RF : 'RF Contratada - Lotes', linha: 2, cols: 6, colChave: 1,
    item: function (l) { return { produto: String(l[0] || '').replace(/\s+/g, ' ').trim(), instituicao: String(l[1] || '').trim(), data: dedupDia_(l[2]), qtd: l[3], preco: l[4], valor: l[5] }; }
  });
  lista.push({
    tipo: 'gastos', aba: typeof GASTOS_ABA_ !== 'undefined' ? GASTOS_ABA_ : 'aux_gastos', linha: 2, cols: 11, colChave: 5,
    item: function (l) { return { origem: l[2], fonte: l[3], data: dedupDia_(l[1]), descricao: l[4], valor: l[6] }; }
  });
  return lista;
}

/**
 * Função de editor. Varre as abas de movimentação e LISTA as linhas repetidas (mesma chave canônica) com aba e
 * número da linha - não apaga nada. Repetição pode ser legítima (duas compras idênticas no mesmo dia): o Tiago
 * confere na planilha. Vai pro log do editor e pro Registro de Controle. Devolve { total, grupos: [...] }.
 */
function relatorioDuplicadasPlanilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var grupos = [];
  abasRelatorioDedup_().forEach(function (cfg) {
    var aba = ss.getSheetByName(cfg.aba);
    if (!aba) return;
    var ultima = ultimaLinhaReal_(aba, cfg.colChave, cfg.linha);
    if (ultima < cfg.linha) return;
    var valores = aba.getRange(cfg.linha, 1, ultima - cfg.linha + 1, cfg.cols).getValues();
    var porChave = {}, ordem = [];
    valores.forEach(function (l, i) {
      if (l[cfg.colChave - 1] === '' || l[cfg.colChave - 1] === null) return;
      var it = cfg.item(l);
      var k = chaveDedup_(cfg.tipo, it);
      if (!porChave[k]) { porChave[k] = { aba: cfg.aba, linhas: [], descricao: descricaoLinhaDedup_(cfg.tipo, it) }; ordem.push(k); }
      porChave[k].linhas.push(cfg.linha + i);
    });
    ordem.forEach(function (k) { if (porChave[k].linhas.length > 1) grupos.push(porChave[k]); });
  });
  var linhasLog = grupos.map(function (g) { return g.aba + ' linhas ' + g.linhas.join(', ') + ' (' + g.linhas.length + 'x): ' + g.descricao; });
  var resumo = grupos.length
    ? grupos.length + ' grupo(s) de linhas repetidas (nada foi apagado; pode ser compra igual legítima, confira): ' + linhasLog.join(' | ')
    : 'Nenhuma linha repetida nas abas de movimentação.';
  Logger.log(grupos.length ? grupos.length + ' grupo(s) de linhas repetidas - nada foi apagado:\n' + linhasLog.join('\n') : resumo);
  try {
    if (typeof gravarRegistroControle_ === 'function') gravarRegistroControle_(grupos.length ? 'Atenção' : 'Sucesso', 'Duplicadas', resumo.slice(0, 45000));
  } catch (eReg) { Logger.log('gravarRegistroControle_: ' + eReg); }
  return { total: grupos.length, grupos: grupos };
}
