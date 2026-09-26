/**
 * Lancamentos.gs - 26/09/2026: tela Transações, aba "Lançamentos" (Tiago:
 * "seria o local onde eu enviaria os relatórios da B3 e das minhas
 * corretoras (e da Interactive Brokers), e você cadastraria isso na
 * planilha").
 *
 * O site lê os arquivos no navegador (assets/js/pages/lancamentos-parse.js)
 * e manda aqui uma lista de itens já no formato de cada aba. Este arquivo:
 *  1. confere o que JÁ ESTÁ na planilha (pra mandar o mesmo extrato duas
 *     vezes sem medo) e o que não pode entrar (ativo que não existe na
 *     Carteira) - modo "simular", nada é gravado;
 *  2. grava os itens escolhidos nas colunas manuais de cada aba (as
 *     fórmulas das outras colunas já estão prontas nas linhas de baixo),
 *     põe Transações / Transações - USA / Transações Renda Fixa em ordem de
 *     data (as fórmulas de preço médio dependem disso) e limpa os caches.
 *
 * Duplicado: mesmo ativo + mesmo dia + mesmo tipo (e mesma instituição, na
 * Renda Fixa). Dentro desse grupo, o que chega vai sendo somado (quantidade
 * nas transações, valor em proventos/renda fixa) e é "já lançado" enquanto
 * couber no que a planilha já tem (tolerância de 2%) - assim uma compra que
 * a corretora partiu em 2 ordens e você lançou numa linha só (ou o
 * contrário) não vira lançamento em dobro.
 *
 * Abas e colunas (só as manuais):
 *  - Transações / Transações - USA (dados da linha 7): Ticker | Data | Tipo | Preço | Qtd. | Taxa
 *  - Transações Renda Fixa (linha 7): Produto | Data | Movimentação | Entrada/Saída | Instituição | Quantidade | Preço unitário | Valor da Operação
 *  - Proventos / Proventos - USA (linha 8): Data Com | Data do pagamento | Ticker | Tipo | Núm. de ativos | Provento por ativo | Provento líquido
 *  - RF Contratada - Lotes (linha 2, opcional: só quando a taxa contratada é informada)
 */

var LANC_ABAS = {
  transacoes: { aba: 'Transações', linha: 7, colChave: 1, cols: 6 },
  transacoesUsa: { aba: 'Transações - USA', linha: 7, colChave: 1, cols: 6 },
  rendaFixa: { aba: 'Transações Renda Fixa', linha: 7, colChave: 1, cols: 8 },
  proventos: { aba: 'Proventos', linha: 8, colChave: 3, cols: 7 },
  proventosUsa: { aba: 'Proventos - USA', linha: 8, colChave: 3, cols: 7 }
};
var LANC_ABA_LOTES_RF = 'RF Contratada - Lotes';
var LANC_TOLERANCIA = 0.02;

// ---------------------------------------------------------------------------
// Handlers (Router.gs)
// ---------------------------------------------------------------------------

/**
 * POST importarLancamentos. e.parameter.itens = JSON [item...] (formato de
 * lancamentos-parse.js); simular=1 só classifica. Cada item pode vir com
 * forcar=true (grava mesmo parecendo já lançado) e, na renda fixa,
 * taxaContratada ("IPCA + 8,16%").
 */
function handleImportarLancamentos(e) {
  try {
    var itens = JSON.parse(e.parameter.itens || '[]');
    var simular = String(e.parameter.simular || '') === '1';
    var r = importarLancamentos_(itens, { simular: simular, origem: e.parameter.origem || 'Importação' });
    return jsonOut({ ok: true, resultado: r });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'importarLancamentos', erro: String(erro) });
  }
}

// ---------------------------------------------------------------------------
// Leitura das abas
// ---------------------------------------------------------------------------

/** Última linha com algo na coluna-chave (as abas têm ~10 mil linhas de fórmula pronta, getLastRow não serve). */
function ultimaLinhaPreenchidaLanc_(aba, cfg) {
  var total = aba.getMaxRows() - cfg.linha + 1;
  if (total < 1) return cfg.linha - 1;
  var col = aba.getRange(cfg.linha, cfg.colChave, total, 1).getValues();
  for (var i = col.length - 1; i >= 0; i--) {
    if (col[i][0] !== '' && col[i][0] !== null) return cfg.linha + i;
  }
  return cfg.linha - 1;
}

function chaveDataLanc_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : chaveDiaISOInicio_(v);
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

function numeroLanc_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v == null ? '' : v).trim();
  if (!s || s === '-') return null;
  s = s.replace(/[^\d,.-]/g, '');
  if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/** Linha da aba -> mesmo formato dos itens que chegam do site. */
function itemDaLinhaLanc_(destino, l) {
  if (destino === 'transacoes' || destino === 'transacoesUsa') {
    return { destino: destino, ticker: String(l[0] || '').trim().toUpperCase(), data: chaveDataLanc_(l[1]), tipo: String(l[2] || '').trim(),
      preco: numeroLanc_(l[3]), qtd: numeroLanc_(l[4]), taxa: numeroLanc_(l[5]) };
  }
  if (destino === 'rendaFixa') {
    return { destino: destino, produto: String(l[0] || '').replace(/\s+/g, ' ').trim(), data: chaveDataLanc_(l[1]), movimentacao: String(l[2] || '').trim(),
      entradaSaida: String(l[3] || '').trim(), instituicao: String(l[4] || '').trim(), qtd: numeroLanc_(l[5]), preco: numeroLanc_(l[6]), valor: numeroLanc_(l[7]) };
  }
  return { destino: destino, dataCom: chaveDataLanc_(l[0]), dataPagamento: chaveDataLanc_(l[1]), ticker: String(l[2] || '').trim().toUpperCase(),
    tipo: String(l[3] || '').trim(), qtd: numeroLanc_(l[4]), valorPorCota: numeroLanc_(l[5]), valor: numeroLanc_(l[6]) };
}

/** { destino: { aba, ultima, itens } } - uma leitura por aba. */
function lerAbasLanc_(ss, destinos) {
  var out = {};
  destinos.forEach(function (d) {
    var cfg = LANC_ABAS[d];
    var aba = ss.getSheetByName(cfg.aba);
    if (!aba) throw new Error('aba não encontrada: ' + cfg.aba);
    var ultima = ultimaLinhaPreenchidaLanc_(aba, cfg);
    var linhas = ultima >= cfg.linha ? aba.getRange(cfg.linha, 1, ultima - cfg.linha + 1, cfg.cols).getValues() : [];
    out[d] = {
      aba: aba, ultima: ultima,
      itens: linhas.filter(function (l) { return l[cfg.colChave - 1] !== '' && l[cfg.colChave - 1] !== null; })
        .map(function (l) { return itemDaLinhaLanc_(d, l); })
    };
  });
  return out;
}

// ---------------------------------------------------------------------------
// Classificação (novo / já lançado / bloqueado)
// ---------------------------------------------------------------------------

function normTextoLanc_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function grupoLanc_(it) {
  if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') return [it.destino, it.ticker, it.data, normTextoLanc_(it.tipo)].join('|');
  if (it.destino === 'rendaFixa') {
    return [it.destino, normTextoLanc_(it.produto), it.data, normTextoLanc_(it.movimentacao), normalizarInstituicaoRF_(it.instituicao)].join('|');
  }
  return [it.destino, it.ticker, it.dataPagamento, normTextoLanc_(it.tipo)].join('|');
}

/** O que se soma dentro do grupo: quantidade (transações), valor (proventos e renda fixa; quantidade na transferência, que não tem valor). */
function medidaLanc_(it) {
  if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') return Math.abs(it.qtd || 0);
  if (it.destino === 'rendaFixa' && it.valor == null) return Math.abs(it.qtd || 0);
  return Math.abs(it.valor || 0);
}

/** Tickers aceitos em cada destino (Carteira + o que já tem transação). */
function tickersValidosLanc_(ss, abas) {
  var br = {}, usa = {};
  (typeof carregarTickersValidosB3_ === 'function' ? carregarTickersValidosB3_(ss) : []).forEach(function (t) { br[t] = true; });
  var aux = ss.getSheetByName('Auxiliar_ativos');
  if (aux && aux.getLastRow() >= 2) {
    aux.getRange(2, 1, aux.getLastRow() - 1, 2).getValues().forEach(function (l) {
      var t = String(l[1] || '').trim().toUpperCase();
      if (!t) return;
      if (l[0] === 'Ações EUA') usa[t] = true; else if (l[0] === 'Ações' || l[0] === 'FIIs') br[t] = true;
    });
  }
  if (abas.transacoes) abas.transacoes.itens.forEach(function (it) { br[it.ticker] = true; });
  if (abas.transacoesUsa) abas.transacoesUsa.itens.forEach(function (it) { usa[it.ticker] = true; });
  return { br: br, usa: usa };
}

function bloqueioLanc_(it, validos) {
  if (it.destino === 'transacoes' && !validos.br[it.ticker]) return it.ticker + ' ainda não está cadastrado: adicione o ativo em Carteiras (Adicionar ativo) antes de importar.';
  if (it.destino === 'transacoesUsa' && !validos.usa[it.ticker]) return it.ticker + ' ainda não está cadastrado em Ações EUA: adicione o ativo em Carteiras (Adicionar ativo) antes de importar.';
  if (it.destino === 'proventos' && !validos.br[it.ticker]) return 'Nenhuma transação de ' + it.ticker + ' na planilha.';
  if (it.destino === 'proventosUsa' && !validos.usa[it.ticker]) return 'Nenhuma transação de ' + it.ticker + ' na planilha.';
  return '';
}

function validarItemLanc_(it) {
  if (!it || !LANC_ABAS[it.destino]) return 'destino desconhecido';
  if (it.destino === 'rendaFixa') {
    if (!it.produto || !it.data || !it.movimentacao) return 'faltou produto, data ou movimentação';
    return '';
  }
  if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') {
    if (!it.ticker || !it.data || (it.tipo !== 'Compra' && it.tipo !== 'Venda')) return 'faltou ativo, data ou tipo (Compra/Venda)';
    if (!(Number(it.qtd) > 0) || !(Number(it.preco) >= 0)) return 'quantidade ou preço inválido';
    return '';
  }
  if (!it.ticker || !it.dataPagamento || !it.tipo || !(Number(it.valor) > 0)) return 'faltou ativo, data de pagamento, tipo ou valor';
  return '';
}

/**
 * itens (com uid) -> [{ uid, situacao: 'novo'|'lancado'|'parecido'|'bloqueado'|'invalido', motivo }]
 * `abas` = lerAbasLanc_ dos destinos envolvidos.
 */
function classificarLanc_(itens, abas, validos) {
  var somaExistente = {}, exatos = {};
  Object.keys(abas).forEach(function (d) {
    abas[d].itens.forEach(function (it) {
      var g = grupoLanc_(it);
      somaExistente[g] = (somaExistente[g] || 0) + medidaLanc_(it);
      var ex = g + '|' + Math.round(medidaLanc_(it) * 10000);
      exatos[ex] = (exatos[ex] || 0) + 1;
    });
  });
  var consumido = {};
  return itens.map(function (it) {
    var invalido = validarItemLanc_(it);
    if (invalido) return { uid: it.uid, situacao: 'invalido', motivo: invalido };
    var bloqueio = bloqueioLanc_(it, validos);
    if (bloqueio) return { uid: it.uid, situacao: 'bloqueado', motivo: bloqueio };
    var g = grupoLanc_(it);
    var medida = medidaLanc_(it);
    var ex = g + '|' + Math.round(medida * 10000);
    if (exatos[ex] > 0) {
      exatos[ex]--;
      consumido[g] = (consumido[g] || 0) + medida;
      return { uid: it.uid, situacao: 'lancado', motivo: 'Já está na planilha.' };
    }
    var existente = somaExistente[g] || 0;
    var depois = (consumido[g] || 0) + medida;
    if (existente > 0 && depois <= existente * (1 + LANC_TOLERANCIA) + 0.0001) {
      consumido[g] = depois;
      return { uid: it.uid, situacao: 'parecido', motivo: 'A planilha já tem lançamento do mesmo ativo, dia e tipo com essa quantidade/valor (talvez em outra divisão de linhas).' };
    }
    return { uid: it.uid, situacao: 'novo', motivo: '' };
  });
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

function dataPlanilhaLanc_(chave) {
  if (!chave) return '';
  var p = String(chave).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function linhaDoItemLanc_(it) {
  var n = function (v) { return (v === null || v === undefined || v === '') ? '' : Number(v); };
  if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') {
    return [it.ticker, dataPlanilhaLanc_(it.data), it.tipo, n(it.preco), n(it.qtd), Number(it.taxa) > 0 ? Number(it.taxa) : ''];
  }
  if (it.destino === 'rendaFixa') {
    var ouTraco = function (v) { return (v === null || v === undefined || v === '') ? '-' : Number(v); };
    return [it.produto, dataPlanilhaLanc_(it.data), it.movimentacao, it.entradaSaida || '', it.instituicao || '', ouTraco(it.qtd), ouTraco(it.preco), ouTraco(it.valor)];
  }
  return [dataPlanilhaLanc_(it.dataCom), dataPlanilhaLanc_(it.dataPagamento), it.ticker, it.tipo,
    Number(it.qtd) > 0 ? Number(it.qtd) : '-', n(it.valorPorCota) || 0, n(it.valor)];
}

/** "IPCA + 8,16%" / "8,16" / "SELIC + 0,05%" -> { indice, spread (fração), texto }. */
function taxaContratadaLanc_(texto, produto) {
  var s = String(texto || '').trim();
  if (!s) return null;
  var indice = /selic/i.test(s) ? 'SELIC' : (/ipca/i.test(s) ? 'IPCA' : (/cdi/i.test(s) ? 'CDI' : (/pr[eé]/i.test(s) ? 'PRE' : '')));
  if (!indice) indice = /selic/i.test(produto) ? 'SELIC' : (/ipca/i.test(produto) ? 'IPCA' : (/prefixado/i.test(produto) ? 'PRE' : 'CDI'));
  var m = s.match(/(-?\d+(?:[.,]\d+)?)\s*%?\s*$/);
  var spread = m ? Number(m[1].replace(',', '.')) / 100 : null;
  return { indice: indice, spread: spread, texto: s };
}

function gravarLotesRfLanc_(ss, itens) {
  var lotes = itens.filter(function (it) {
    return it.destino === 'rendaFixa' && it.taxaContratada && /compra|aplica/i.test(it.movimentacao);
  });
  if (!lotes.length) return 0;
  var aba = ss.getSheetByName(LANC_ABA_LOTES_RF);
  if (!aba) return 0;
  var linhas = lotes.map(function (it) {
    var t = taxaContratadaLanc_(it.taxaContratada, it.produto);
    return [it.produto, it.instituicao || '', dataPlanilhaLanc_(it.data), Number(it.qtd) || '', Number(it.preco) || '', Number(it.valor) || '',
      t.indice, t.spread == null ? '' : t.spread, t.texto];
  });
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, 9).setValues(linhas);
  return linhas.length;
}

/**
 * Coração da importação. opcoes.simular = só classifica.
 * Devolve { itens: [{ uid, situacao, motivo }], gravados: { destino: n }, lotesRf, total }.
 */
function importarLancamentos_(itens, opcoes) {
  var o = opcoes || {};
  if (!Array.isArray(itens)) throw new Error('itens precisa ser uma lista');
  itens.forEach(function (it, i) { if (it && it.uid === undefined) it.uid = i; });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var destinos = Object.keys(LANC_ABAS).filter(function (d) { return itens.some(function (it) { return it && it.destino === d; }); });
  var trava = null;
  if (!o.simular) { trava = LockService.getScriptLock(); trava.waitLock(30000); }
  try {
    // proventos só entram de ativo que já tem transação: lê as abas de transações também
    var leitura = destinos.slice();
    if (leitura.indexOf('proventos') !== -1 && leitura.indexOf('transacoes') === -1) leitura.push('transacoes');
    if (leitura.indexOf('proventosUsa') !== -1 && leitura.indexOf('transacoesUsa') === -1) leitura.push('transacoesUsa');
    var abas = lerAbasLanc_(ss, leitura);
    var validos = tickersValidosLanc_(ss, abas);
    var classes = classificarLanc_(itens, abas, validos);
    var porUid = {};
    classes.forEach(function (c) { porUid[c.uid] = c; });
    var resultado = { itens: classes, gravados: {}, lotesRf: 0, total: 0 };
    if (o.simular) return resultado;

    var gravar = itens.filter(function (it) {
      var c = porUid[it.uid];
      return c && (c.situacao === 'novo' || ((c.situacao === 'lancado' || c.situacao === 'parecido') && it.forcar === true));
    });
    destinos.forEach(function (d) {
      var lista = gravar.filter(function (it) { return it.destino === d; });
      if (!lista.length) return;
      var ordenar = d !== 'proventos' && d !== 'proventosUsa';
      if (ordenar) lista.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
      var cfg = LANC_ABAS[d];
      var info = abas[d];
      var inicio = info.ultima + 1;
      if (inicio + lista.length - 1 > info.aba.getMaxRows()) info.aba.insertRowsAfter(info.aba.getMaxRows(), lista.length + 10);
      info.aba.getRange(inicio, 1, lista.length, cfg.cols).setValues(lista.map(linhaDoItemLanc_));
      var ultimaData = info.itens.reduce(function (m, x) { return x.data > m ? x.data : m; }, '');
      if (ordenar && ultimaData && lista[0].data < ultimaData) {
        info.aba.getRange(cfg.linha, 1, inicio + lista.length - cfg.linha, cfg.cols).sort({ column: 2, ascending: true });
      }
      resultado.gravados[d] = lista.length;
      resultado.total += lista.length;
      lista.forEach(function (it) { porUid[it.uid].situacao = 'gravado'; porUid[it.uid].motivo = ''; });
    });
    resultado.lotesRf = gravarLotesRfLanc_(ss, gravar);

    if (resultado.total) {
      // 26/09/2026: os dias já gravados do histórico ficam com a quantidade
      // antiga até a consolidação (Consolidacao.gs) - o topo do site avisa.
      try {
        if (typeof marcarConsolidacao_ === 'function') {
          var consolidar = { ativos: [], rf: null, motivo: '' };
          var porTickerLanc = {};
          gravar.forEach(function (it) {
            if (porUid[it.uid].situacao !== 'gravado') return;
            if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') {
              var ch = it.ticker;
              if (!porTickerLanc[ch] || it.data < porTickerLanc[ch].desde) porTickerLanc[ch] = { ticker: it.ticker, classe: it.destino === 'transacoesUsa' ? 'USA' : 'BR', desde: it.data };
            } else if (it.destino === 'rendaFixa') {
              if (!consolidar.rf || it.data < consolidar.rf.desde) consolidar.rf = { desde: it.data };
            }
          });
          consolidar.ativos = Object.keys(porTickerLanc).map(function (k) { return porTickerLanc[k]; });
          if (consolidar.ativos.length || consolidar.rf) {
            var qtdTx = (resultado.gravados.transacoes || 0) + (resultado.gravados.transacoesUsa || 0);
            var partesMotivo = [];
            if (qtdTx) partesMotivo.push(qtdTx + ' transação(ões) de ' + consolidar.ativos.map(function (a) { return a.ticker; }).join(', '));
            if (resultado.gravados.rendaFixa) partesMotivo.push(resultado.gravados.rendaFixa + ' movimentação(ões) de Renda Fixa');
            consolidar.motivo = (o.origem || 'Importação') + ': ' + partesMotivo.join(' e ');
            resultado.consolidacao = marcarConsolidacao_(consolidar);
          }
        }
      } catch (eCons) { Logger.log('marcarConsolidacao_: ' + eCons); }
      try { if (typeof limparCacheHistoricoInicio_ === 'function') limparCacheHistoricoInicio_(); } catch (eCache) { Logger.log('limparCacheHistoricoInicio_: ' + eCache); }
      try { if (typeof invalidarCacheProventos_ === 'function') invalidarCacheProventos_(); } catch (eProv) { /* só cache */ }
      try {
        if (typeof gravarRegistroControle_ === 'function') {
          var partes = Object.keys(resultado.gravados).map(function (d) { return resultado.gravados[d] + ' em ' + LANC_ABAS[d].aba; });
          gravarRegistroControle_('Sucesso', o.origem || 'Importação', 'Lançamentos: ' + partes.join(', ') + (resultado.lotesRf ? ' + ' + resultado.lotesRf + ' lote(s) de RF Contratada' : ''));
        }
      } catch (eReg) { Logger.log('gravarRegistroControle_: ' + eReg); }
    }
    return resultado;
  } finally {
    if (trava) trava.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Lista pra tela (todos os lançamentos, mais novo primeiro)
// ---------------------------------------------------------------------------

/**
 * [{ destino, data, ativo, tipo, qtd, preco, valor, moeda, inst }] das 5 abas.
 * `abas` opcional (reaproveita a leitura de quem chama).
 */
function listaLancamentosTela_(ss, abas) {
  var a = abas || lerAbasLanc_(ss, Object.keys(LANC_ABAS));
  var out = [];
  var arr = function (v, c) { return typeof v === 'number' ? Math.round(v * Math.pow(10, c)) / Math.pow(10, c) : null; };
  Object.keys(LANC_ABAS).forEach(function (d) {
    if (!a[d]) return;
    a[d].itens.forEach(function (it) {
      if (d === 'transacoes' || d === 'transacoesUsa') {
        out.push({ destino: d, data: it.data, ativo: it.ticker, tipo: it.tipo, qtd: arr(it.qtd, 6), preco: arr(it.preco, 4),
          valor: arr((it.qtd || 0) * (it.preco || 0), 2), taxa: arr(it.taxa, 4), moeda: d === 'transacoesUsa' ? 'USD' : 'BRL' });
      } else if (d === 'rendaFixa') {
        out.push({ destino: d, data: it.data, ativo: it.produto, tipo: it.movimentacao, qtd: arr(it.qtd, 6), preco: arr(it.preco, 2),
          valor: arr(it.valor, 2), moeda: 'BRL', inst: it.instituicao });
      } else {
        out.push({ destino: d, data: it.dataPagamento, dataCom: it.dataCom, ativo: it.ticker, tipo: it.tipo, qtd: arr(it.qtd, 6),
          preco: arr(it.valorPorCota, 6), valor: arr(it.valor, 2), moeda: d === 'proventosUsa' ? 'USD' : 'BRL' });
      }
    });
  });
  out.sort(function (x, y) { return x.data < y.data ? 1 : (x.data > y.data ? -1 : 0); });
  return out;
}
