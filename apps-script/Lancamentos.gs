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
 *     Carteira) - modo "simular", nada é gravado (02/10/2026: exceto as
 *     linhas de provento dos extratos da B3, guardadas em
 *     aux_proventos-conferencia pra conferência - ver Proventos.gs);
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
 * taxaContratada ("IPCA + 8,16%") e, 07/10/2026, destinoRf ('emergencial' | 'longo-prazo' | 'objetivo': destino do título NOVO, que ganha a
 * linha na Carteira Renda Fixa com a coluna B certa - garantirTitulosCarteiraRfLanc_). `origem` 'Colado' = tabela colada na tela.
 */
function handleImportarLancamentos(e) {
  try {
    var itens = JSON.parse(e.parameter.itens || '[]');
    var simular = String(e.parameter.simular || '') === '1';
    var r = importarLancamentos_(itens, { simular: simular, origem: e.parameter.origem || 'Importação' });
    // 05/10/2026 (A-24): o que ainda sobra "a confirmar" depois da importação (Aportes.gs; derivado, nada gravado)
    var aConfirmar = !simular && typeof lancamentosAConfirmarDaPlanilha_ === 'function' ? lancamentosAConfirmarDaPlanilha_(SpreadsheetApp.getActiveSpreadsheet(), null, null) : null;
    return jsonOut({ ok: true, resultado: r, aConfirmar: aConfirmar });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'importarLancamentos', erro: String(erro) });
  }
}

// ---------------------------------------------------------------------------
// Leitura das abas
// ---------------------------------------------------------------------------

/** Última linha com algo na coluna-chave (as abas têm ~10 mil linhas de fórmula pronta, getLastRow não serve). */
function ultimaLinhaPreenchidaLanc_(aba, cfg) {
  // 06/10/2026: a leitura da aba pára na última linha REAL (Planilha.gs!ultimaLinhaReal_, em blocos), não varre as ~10 mil de fórmula
  if (typeof ultimaLinhaReal_ === 'function') return ultimaLinhaReal_(aba, cfg.colChave, cfg.linha);
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
  if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') return [it.destino, dedupTicker_(it.ticker), it.data, normTextoLanc_(it.tipo)].join('|');
  if (it.destino === 'rendaFixa') {
    return [it.destino, dedupTituloRf_(it.produto, it.instituicao), it.data, normTextoLanc_(it.movimentacao)].join('|');
  }
  return [it.destino, dedupTicker_(it.ticker), it.dataPagamento, normTextoLanc_(it.tipo)].join('|');
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
  var somaExistente = {}, existentes = {};
  Object.keys(abas).forEach(function (d) {
    existentes[d] = abas[d].itens;
    abas[d].itens.forEach(function (it) {
      var g = grupoLanc_(it);
      somaExistente[g] = (somaExistente[g] || 0) + medidaLanc_(it);
    });
  });
  // 06/10/2026 (Tiago: "garanta que se eu reimportar... não se repita na planilha, não importa o ativo"): o "já lançado"
  // vem da chave canônica única (Deduplicacao.gs: dia + ativo + tipo + quantidade + preço/valor + instituição normalizada),
  // contada - só o excedente é novo. A soma com tolerância de 2% abaixo continua só pra "parecido" (outra divisão de linhas).
  var dedup = criarDedupLote_(existentes);
  var consumido = {};
  return itens.map(function (it) {
    var invalido = validarItemLanc_(it);
    if (invalido) return { uid: it.uid, situacao: 'invalido', motivo: invalido };
    var bloqueio = bloqueioLanc_(it, validos);
    if (bloqueio) return { uid: it.uid, situacao: 'bloqueado', motivo: bloqueio };
    var g = grupoLanc_(it);
    var medida = medidaLanc_(it);
    var onde = dedup.testar(it.destino, it);
    if (onde) {
      consumido[g] = (consumido[g] || 0) + medida;
      return { uid: it.uid, situacao: 'lancado', motivo: onde === 'lote' ? 'Repetida em outro arquivo desta importação.' : 'Já está na planilha.' };
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
  // 07/10/2026: "100% do CDI" é percentual do índice, não spread somado a ele (o spread entra como (1+spread)^(1/252) na projeção): fica sem spread
  if (/%\s*(do|de)\s*cdi/i.test(s)) spread = null;
  return { indice: indice, spread: spread, texto: s };
}

/**
 * Lotes de RF Contratada (só compra com taxa contratada informada). 06/10/2026: passa pela mesma deduplicação
 * (Deduplicacao.gs, tipo 'lotesRf': dia + título/instituição + quantidade + preço + valor) contra os lotes que a aba
 * já tem (lê só até a última linha real) e dentro do próprio lote - o mesmo Tesouro não vira 2 lotes.
 * `saida` (opcional) acumula { ignoradasDuplicadas, exemplos }; `manual` = lançamento manual (forcar vale).
 */
function gravarLotesRfLanc_(ss, itens, saida, manual) {
  var lotes = itens.filter(function (it) {
    return it.destino === 'rendaFixa' && it.taxaContratada && /compra|aplica/i.test(it.movimentacao);
  });
  if (!lotes.length) return 0;
  var aba = ss.getSheetByName(LANC_ABA_LOTES_RF);
  if (!aba) return 0;
  var ultima = typeof ultimaLinhaReal_ === 'function' ? ultimaLinhaReal_(aba, [1, 3], 2) : Math.max(aba.getLastRow(), 1);
  var existentes = ultima >= 2 ? aba.getRange(2, 1, ultima - 1, 6).getValues().filter(function (l) { return l[0] !== '' && l[0] !== null; }).map(function (l) {
    return { produto: l[0], instituicao: l[1], data: dedupDia_(l[2]), qtd: l[3], preco: l[4], valor: l[5] };
  }) : [];
  var f = filtrarDuplicadasDedup_('lotesRf', existentes, lotes, { forcar: function (it) { return !!manual && it.forcar === true; } });
  if (saida) {
    saida.ignoradasDuplicadas = (saida.ignoradasDuplicadas || 0) + f.ignoradasDuplicadas;
    saida.exemplos = (saida.exemplos || []).concat(f.duplicadas.map(function (it) { return 'Lote de RF Contratada: ' + descricaoLinhaDedup_('lotesRf', it); }));
  }
  if (!f.novos.length) return 0;
  var linhas = f.novos.map(function (it) {
    var t = taxaContratadaLanc_(it.taxaContratada, it.produto);
    return [it.produto, it.instituicao || '', dataPlanilhaLanc_(it.data), Number(it.qtd) || '', Number(it.preco) || '', Number(it.valor) || '',
      t.indice, t.spread == null ? '' : t.spread, t.texto];
  });
  aba.getRange(ultima + 1, 1, linhas.length, 9).setValues(linhas);
  return linhas.length;
}

/**
 * 07/10/2026 (Tiago: tabela colada do fundo da chácara): título de Renda Fixa NOVO que vem com `destinoRf` ('emergencial' | 'longo-prazo' |
 * 'objetivo') ganha a linha na "Carteira Renda Fixa" já com o destino certo na COLUNA B (rotuloColunaBDestinoRf_, Planilha.gs) - a única fonte
 * do destino. Mesmo desenho da linha nova da sincronização (CarteiraRendaFixaSync.gs): código/nome/tipo/indexador/instituição, o valor aplicado
 * da compra e as fórmulas copiadas da linha de cima; quantidade e valor atualizado a sincronização/consolidação preenche. Título que já tem
 * linha NÃO é mexido (o destino dele muda no detalhe do título). Só roda nas movimentações gravadas agora (nunca na simulação).
 * Devolve [{ titulo, instituicao, destino, linha }] (só os criados).
 */
function garantirTitulosCarteiraRfLanc_(ss, itens) {
  var porChave = {}, ordem = [];
  itens.forEach(function (it) {
    if (!it || it.destino !== 'rendaFixa' || !it.destinoRf || !/compra|aplica/i.test(it.movimentacao || '')) return;
    if (typeof DESTINOS_RENDA_FIXA_ === 'undefined' || DESTINOS_RENDA_FIXA_.indexOf(it.destinoRf) < 0) return;
    var nome = String(it.produto || '').replace(/\s+/g, ' ').trim();
    if (!nome) return;
    var k = chaveTituloRf_(nome, it.instituicao || '');
    if (!porChave[k]) { porChave[k] = { chave: k, nome: nome, instituicao: String(it.instituicao || '').trim(), destino: it.destinoRf, investido: 0, taxa: '' }; ordem.push(k); }
    porChave[k].investido += Number(it.valor) || 0;
    if (it.taxaContratada && !porChave[k].taxa) porChave[k].taxa = String(it.taxaContratada);
  });
  if (!ordem.length) return [];
  var aba = ss.getSheetByName(ABA_CARTEIRA_RF);
  if (!aba) return [];
  var ini = LINHA_CABECALHO_CARTEIRA_RF + 1;
  var ultima = ultimaLinhaReal_(aba, [1, 4], ini);
  var existentes = {};
  if (ultima >= ini) {
    aba.getRange(ini, 1, ultima - ini + 1, 6).getValues().forEach(function (l) {
      if (!l[0] && !l[3]) return;
      var nome = String(l[2] || l[3] || '').replace(/\s+/g, ' ').trim();
      existentes[chaveTituloRf_(nome, l[5])] = true;
      if (l[0]) existentes[chaveTituloRf_(nome, l[5], l[0])] = true;
    });
  }
  var criados = [];
  var proxima = Math.max(ultima, ini - 1) + 1;
  ordem.forEach(function (k) {
    var t = porChave[k];
    if (existentes[k]) return;
    if (proxima > aba.getMaxRows()) aba.insertRowsAfter(aba.getMaxRows(), 5);
    var modelo = ultima >= ini ? ultima : 0;
    if (modelo) {
      try { copiarFormatoLinha_(aba, modelo, proxima, Math.max(aba.getLastColumn(), 15)); } catch (eFmt) { /* formato é só aparência */ }
      try {
        var jaTem = aba.getRange(proxima, 13, 1, 3).getFormulas()[0].some(function (f) { return !!f; });
        if (!jaTem) copiarFormulasLinha_(aba, modelo, proxima, 13, Math.max(aba.getLastColumn(), 15));
      } catch (eFor) { /* sem fórmula pra copiar */ }
    }
    var indexador = t.taxa && /cdi/i.test(t.taxa) ? 'CDI' : indexadorCarteiraRf_(t.nome);
    aba.getRange(proxima, 1, 1, 12).setValues([[t.nome, rotuloColunaBDestinoRf_(t.destino), t.nome, tipoInvestimentoRf_(t.nome), indexador, t.instituicao,
      '', '', Math.round(t.investido * 100) / 100, '', '', '']]);
    criados.push({ titulo: t.nome, instituicao: t.instituicao, destino: t.destino, linha: proxima });
    existentes[k] = true;
    proxima++;
  });
  if (criados.length) {
    try { if (typeof registrarEscritaPlanilha_ === 'function') registrarEscritaPlanilha_(); } catch (eReg) { /* cache é só otimização */ }
    try { if (typeof invalidarCacheCarteirasRf_ === 'function') invalidarCacheCarteirasRf_(); } catch (eInv) { /* idem */ }
  }
  return criados;
}

/**
 * Coração da importação. opcoes.simular = só classifica.
 * Devolve { itens: [{ uid, situacao, motivo }], gravados: { destino: n }, lotesRf, total, gravadas, ignoradasDuplicadas, exemplos }
 * (06/10/2026: ignoradasDuplicadas = linhas que a planilha já tinha e foram ignoradas; exemplos = até 5 frases humanas).
 */
function importarLancamentos_(itens, opcoes) {
  var o = opcoes || {};
  if (!Array.isArray(itens)) throw new Error('itens precisa ser uma lista');
  itens.forEach(function (it, i) { if (it && it.uid === undefined) it.uid = i; });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var destinos = Object.keys(LANC_ABAS).filter(function (d) { return itens.some(function (it) { return it && it.destino === d; }); });
  var trava = null;
  if (!o.simular) { trava = travaRecurso_('carteira', 'lançamentos/importação'); trava.waitLock(30000); }
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
    var resultado = { itens: classes, gravados: {}, lotesRf: 0, total: 0, gravadas: 0, ignoradasDuplicadas: 0, exemplos: [] };
    // 06/10/2026: "já lançado" só se grava com forcar no lançamento MANUAL (uma 2ª operação idêntica de verdade); na importação de arquivo nunca
    var manual = String(o.origem || '') === 'Manual' || o.permitirForcar === true; // 07/10/2026: permitirForcar = chamada interna (Aportes.gs, compra de Ações EUA do aporte concluído) que já conferiu a duplicidade
    var contarIgnoradas = function () {
      var ign = itens.filter(function (it) { var c = porUid[it.uid]; return c && c.situacao === 'lancado'; });
      resultado.ignoradasDuplicadas += ign.length;
      resultado.exemplos = exemplosDuplicadasDedup_(null, ign).concat(resultado.exemplos).slice(0, DEDUP_MAX_EXEMPLOS_);
    };
    // 02/10/2026 (Tiago: "Eu mando no final do mês [o arquivo da B3] e você
    // faz o check final"): as linhas de provento do extrato da B3 ficam
    // guardadas pra conferência (Proventos.gs!registrarExtratoB3Proventos_ -
    // só na aba aux_proventos-conferencia, nunca na aba Proventos). Já na
    // conferência (simular), que recebe o extrato INTEIRO - quando tudo já
    // estava lançado nem há gravação. resultado.conferenciaProventos = resumo.
    var conferirProventos = function (semTrava) {
      if (destinos.indexOf('proventos') === -1 || typeof registrarExtratoB3Proventos_ !== 'function') return;
      try { resultado.conferenciaProventos = registrarExtratoB3Proventos_(itens, { semTrava: semTrava }); } catch (eConf) { Logger.log('registrarExtratoB3Proventos_: ' + eConf); }
    };
    if (o.simular) { contarIgnoradas(); conferirProventos(false); return resultado; }

    var gravar = itens.filter(function (it) {
      var c = porUid[it.uid];
      return c && (c.situacao === 'novo' || (c.situacao === 'parecido' && it.forcar === true) || (c.situacao === 'lancado' && it.forcar === true && manual));
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
    // quem ficou como "já lançado" não grava (nem o lote de RF): conta como ignorada
    var ignoradasLote = { ignoradasDuplicadas: 0, exemplos: [] };
    contarIgnoradas();
    resultado.lotesRf = gravarLotesRfLanc_(ss, gravar, ignoradasLote, manual);
    resultado.ignoradasDuplicadas += ignoradasLote.ignoradasDuplicadas;
    resultado.lotesRfIgnoradas = ignoradasLote.ignoradasDuplicadas; // lotes de RF Contratada que já existiam (a tela soma aos "já lançados")
    resultado.exemplos = resultado.exemplos.concat(ignoradasLote.exemplos).slice(0, DEDUP_MAX_EXEMPLOS_);
    resultado.gravadas = resultado.total;
    try { resultado.titulosRfCriados = garantirTitulosCarteiraRfLanc_(ss, gravar.filter(function (it) { return porUid[it.uid].situacao === 'gravado'; })); } catch (eTit) { Logger.log('garantirTitulosCarteiraRfLanc_: ' + eTit); resultado.titulosRfCriados = []; resultado.titulosRfErro = String(eTit); }

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
    conferirProventos(true); // 02/10/2026: resumo de novo, já com o que acabou de entrar na aba Proventos
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
function listaLancamentosTela_(ss, abas, cambioHist) {
  var a = abas || lerAbasLanc_(ss, Object.keys(LANC_ABAS));
  // 27/09/2026: câmbio do dia de cada lançamento em dólar (Transações -
  // USA / Proventos - USA), pra tela de Lançamentos mostrar a conversão
  // em reais sem recalcular no navegador (mesmo mapa de
  // mapaCambioHistoricoAporte_, Aportes.gs - passado por quem já tem).
  var ch = cambioHist || (typeof mapaCambioHistoricoAporte_ === 'function' ? mapaCambioHistoricoAporte_(ss) : null);
  var cambioEm = function (data) { return ch && typeof cambioNaDataAporte_ === 'function' ? cambioNaDataAporte_(ch, data) : null; };
  var out = [];
  var arr = function (v, c) { return typeof v === 'number' ? Math.round(v * Math.pow(10, c)) / Math.pow(10, c) : null; };
  Object.keys(LANC_ABAS).forEach(function (d) {
    if (!a[d]) return;
    a[d].itens.forEach(function (it) {
      if (d === 'transacoes' || d === 'transacoesUsa') {
        var valor = arr((it.qtd || 0) * (it.preco || 0), 2);
        var item = { destino: d, data: it.data, ativo: it.ticker, tipo: it.tipo, qtd: arr(it.qtd, 6), preco: arr(it.preco, 4),
          valor: valor, taxa: arr(it.taxa, 4), moeda: d === 'transacoesUsa' ? 'USD' : 'BRL' };
        if (d === 'transacoesUsa') {
          var cambio = cambioEm(it.data);
          item.cambio = cambio;
          item.valorBRL = cambio != null && valor != null ? arr(valor * cambio, 2) : null;
        }
        out.push(item);
      } else if (d === 'rendaFixa') {
        out.push({ destino: d, data: it.data, ativo: it.produto, tipo: it.movimentacao, qtd: arr(it.qtd, 6), preco: arr(it.preco, 2),
          valor: arr(it.valor, 2), moeda: 'BRL', inst: it.instituicao });
      } else {
        var item2 = { destino: d, data: it.dataPagamento, dataCom: it.dataCom, ativo: it.ticker, tipo: it.tipo, qtd: arr(it.qtd, 6),
          preco: arr(it.valorPorCota, 6), valor: arr(it.valor, 2), moeda: d === 'proventosUsa' ? 'USD' : 'BRL' };
        if (d === 'proventosUsa') {
          var cambioP = cambioEm(it.dataPagamento);
          item2.cambio = cambioP;
          item2.valorBRL = cambioP != null && item2.valor != null ? arr(item2.valor * cambioP, 2) : null;
        }
        out.push(item2);
      }
    });
  });
  out.sort(function (x, y) { return x.data < y.data ? 1 : (x.data > y.data ? -1 : 0); });
  return out;
}
