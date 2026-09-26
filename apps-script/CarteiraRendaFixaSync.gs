/**
 * CarteiraRendaFixaSync.gs - 26/09/2026 (Tiago: "Já siga também com a parte
 * da renda fixa").
 *
 * A aba "Carteira Renda Fixa" era 100% manual: quantidade, valor investido e
 * "Valor Atualizado (manual)" copiados da corretora. Agora:
 *  - Quantidade (G) e Valor Investido (I): posição e custo PEPS de hoje, das
 *    próprias Transações Renda Fixa (custoRendaFixaPepsHoje_ - o mesmo número
 *    que a tela já mostrava como "Valor aplicado").
 *  - Valor Atualizado (L):
 *      Tesouro Direto = quantidade x PU de venda do dia (preço de mercado,
 *        o mesmo que a corretora mostra), do CSV público do Tesouro
 *        Transparente;
 *      LCI/LCA/CDB = último valor de aux_historico-renda-fixa (curva do
 *        CDI, montada pelo BackfillRendaFixa.gs).
 *  - Título comprado que ainda não tem linha: linha nova no fim da lista
 *    (Renda Fixa; se for reserva, é só trocar pra "Renda Emergencial" na
 *    coluna B).
 *  - Título zerado (vendeu/venceu tudo): a linha sai - só quando pedido
 *    (opcoes.remover, na consolidação), nunca no gatilho diário.
 *
 * Duas linhas com o mesmo título na mesma instituição (ex.: parte reserva,
 * parte longo prazo) não dá pra dividir sozinho: ficam como estão (aviso).
 */

var URL_PRECOS_TESOURO = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';

/** "\t\nTesouro Selic 2029" -> "Tesouro Selic 2029" */
function limparNomeRf_(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

/** "Tesouro IPCA+ com Juros Semestrais 2045" -> "TESOURO IPCA+ COM JUROS SEMESTRAIS|2045" (null se não for Tesouro). */
function chaveTesouro_(nome) {
  var s = limparNomeRf_(nome);
  var m = s.match(/^(Tesouro .*?)\s+(\d{4})$/i);
  return m ? m[1].toUpperCase() + '|' + m[2] : null;
}

function numeroBr_(s) {
  var v = Number(String(s == null ? '' : s).trim().replace(/\./g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
}

/**
 * Preços do Tesouro Direto do último dia publicado:
 * { 'TESOURO SELIC|2029': { tipo, vencimento: 'yyyy-mm-dd', dataBase, puVenda, puCompra, taxaCompra, taxaVenda } }
 * (taxa em % a.a.; no Selic é o ágio/deságio sobre a Selic). Cache de 6h.
 * opcoes.textoCsv: conteúdo pronto (testes).
 */
function precosTesouroDireto_(opcoes) {
  var o = opcoes || {};
  var cache = null;
  var chaveCache = 'tesouro_precos_v1';
  if (!o.textoCsv) {
    try { cache = CacheService.getScriptCache(); var c = cache.get(chaveCache); if (c) return JSON.parse(c); } catch (e) { cache = null; }
  }
  var texto = o.textoCsv;
  if (!texto) {
    var resp = UrlFetchApp.fetch(URL_PRECOS_TESOURO, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) throw new Error('Tesouro Transparente respondeu ' + resp.getResponseCode());
    texto = resp.getContentText('ISO-8859-1');
  }
  var linhas = texto.split(/\r?\n/);
  var maior = '';
  var porData = {};
  for (var i = 1; i < linhas.length; i++) {
    var c2 = linhas[i].split(';');
    if (c2.length < 7) continue;
    var d = c2[2].split('/');
    if (d.length !== 3) continue;
    var iso = d[2] + '-' + d[1] + '-' + d[0];
    if (iso < maior) continue; // o arquivo tem ~20 anos: só interessa o último dia
    if (iso > maior) { maior = iso; porData = {}; }
    var v = c2[1].split('/');
    var tipo = c2[0].trim();
    porData[tipo.toUpperCase() + '|' + v[2]] = {
      tipo: tipo, vencimento: v[2] + '-' + v[1] + '-' + v[0], dataBase: iso,
      taxaCompra: numeroBr_(c2[3]), taxaVenda: numeroBr_(c2[4]), puCompra: numeroBr_(c2[5]), puVenda: numeroBr_(c2[6])
    };
  }
  if (cache) { try { cache.put(chaveCache, JSON.stringify(porData), 21600); } catch (e2) { /* só otimização */ } }
  return porData;
}

function tipoInvestimentoRf_(produto) {
  var s = limparNomeRf_(produto);
  if (/^Tesouro Selic/i.test(s)) return 'Tesouro Selic (LFT)';
  if (/^Tesouro IPCA/i.test(s)) return 'Tesouro IPCA+';
  if (/^Tesouro Prefixado/i.test(s)) return 'Tesouro Prefixado';
  if (/^Tesouro/i.test(s)) return s.replace(/\s+\d{4}$/, '');
  if (/^(LCI|LCA)/i.test(s)) return 'LCI / LCA Pós-fixada';
  if (/^CDB/i.test(s)) return 'CDB';
  return 'Renda Fixa';
}

function indexadorCarteiraRf_(produto) {
  if (/prefixado/i.test(produto)) return 'PRÉ';
  return detectarIndexadorRF_(produto);
}

function arred2Rf_(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

/** Último valor de cada posição em aux_historico-renda-fixa (só as vivas no último dia gravado). */
function ultimosValoresHistoricoRf_() {
  var linhas = [];
  try { linhas = lerLinhasHistoricoRendaFixa_(); } catch (e) { return { data: null, porPosicao: {} }; }
  var maior = null;
  linhas.forEach(function (l) { if (l[0] instanceof Date && (!maior || l[0] > maior)) maior = l[0]; });
  var porPosicao = {};
  if (!maior) return { data: null, porPosicao: porPosicao };
  linhas.forEach(function (l) {
    if (!(l[0] instanceof Date) || l[0].getTime() !== maior.getTime()) return;
    var k = limparNomeRf_(l[1]).toUpperCase() + '|' + normalizarInstituicaoRF_(l[2]);
    porPosicao[k] = (porPosicao[k] || 0) + (Number(l[5]) || 0);
  });
  return { data: maior, porPosicao: porPosicao };
}

/** Soma de um mapa { 'PRODUTO|INST': v } pelos produtos do mesmo tipo (LCI/LCA/CDB) na instituição. */
function somaPorTipoInstRf_(mapa, nome, inst) {
  var tipo = limparNomeRf_(nome).split(/[\s-]/)[0].toUpperCase();
  if (['LCI', 'LCA', 'CDB'].indexOf(tipo) === -1) return null;
  var soma = 0, achou = false;
  Object.keys(mapa).forEach(function (k) {
    var p = k.split('|');
    if (p[1] === inst && p[0].indexOf(tipo) === 0) { soma += Number(mapa[k]) || 0; achou = true; }
  });
  return achou ? soma : null;
}

/**
 * opcoes: { simular, remover, precos (mapa pronto - testes), agora (Date - testes) }
 * Devolve { resumo, atualizadas, novas, removidas, avisos, dataPrecos }.
 */
function sincronizarCarteiraRendaFixa_(opcoes) {
  var o = opcoes || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_CARTEIRA_RF);
  if (!aba) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF);
  var agora = o.agora || new Date();
  var avisos = [];

  var precos = o.precos;
  if (!precos) {
    try { precos = precosTesouroDireto_(); } catch (eP) { precos = {}; avisos.push('Preços do Tesouro indisponíveis agora (' + eP + ') - valores do Tesouro não foram mexidos'); }
  }
  var dataPrecos = null;
  Object.keys(precos).some(function (k) { dataPrecos = precos[k].dataBase; return true; });

  var peps = {};
  try {
    var bruto = custoRendaFixaPepsHoje_();
    Object.keys(bruto).forEach(function (k) {
      var partes = k.split('|');
      var kk = limparNomeRf_(partes[0]).toUpperCase() + '|' + partes[1];
      var a = peps[kk] || { qtd: 0, custo: 0, produto: limparNomeRf_(partes[0]) };
      a.qtd += bruto[k].qtd;
      a.custo += bruto[k].custo;
      peps[kk] = a;
    });
  } catch (ePeps) { avisos.push('Não consegui ler as Transações Renda Fixa: ' + ePeps); }
  // nome da instituição como está nas Transações (pra linha nova)
  var instRawTx = {};
  try {
    var abaTx = ss.getSheetByName(ABA_TRANSACOES_RF);
    var nTx = abaTx ? abaTx.getLastRow() - LINHA_CABECALHO_TRANSACOES_RF : 0;
    if (nTx > 0) abaTx.getRange(LINHA_CABECALHO_TRANSACOES_RF + 1, 5, nTx, 1).getValues().forEach(function (l) {
      if (l[0]) instRawTx[normalizarInstituicaoRF_(l[0])] = String(l[0]).trim();
    });
  } catch (eInst) { /* só o nome bonito */ }
  var hist = ultimosValoresHistoricoRf_();
  var histRecente = hist.data && (agora - hist.data) / 86400000 <= 7;

  var L0 = LINHA_CABECALHO_CARTEIRA_RF + 1;
  var n = Math.max(aba.getLastRow() - L0 + 1, 0);
  var dados = n ? aba.getRange(L0, 1, n, 12).getValues() : [];
  var posicoes = [];
  var ultimaPosicao = L0 - 1;
  var contagem = {};
  var instRaw = {};
  dados.forEach(function (l, i) {
    var nome = limparNomeRf_(l[2]) || limparNomeRf_(l[3]);
    if (!l[0] && !l[3]) return;
    ultimaPosicao = L0 + i;
    var instNorm = normalizarInstituicaoRF_(l[5]);
    if (l[5]) instRaw[instNorm] = instRaw[instNorm] || String(l[5]);
    var chave = limparNomeRf_(l[2]).toUpperCase() + '|' + instNorm;
    contagem[chave] = (contagem[chave] || 0) + 1;
    posicoes.push({ linha: L0 + i, nome: nome, chave: chave, instNorm: instNorm, qtd: l[6], investido: l[8], atualizado: l[11] });
  });

  var atualizadas = [], novas = [], removidas = [], cobertas = {};
  var mudancas = [];
  posicoes.forEach(function (p) {
    var ehTesouro = !!chaveTesouro_(p.nome);
    if (contagem[p.chave] > 1) {
      cobertas[p.chave] = true;
      avisos.push(p.nome + ' aparece em mais de uma linha da mesma instituição - não mexi (divida à mão)');
      return;
    }
    var novo = {};
    if (ehTesouro) {
      var pp = peps[p.chave];
      cobertas[p.chave] = true;
      var qtd = pp ? Math.round(pp.qtd * 100) / 100 : Number(p.qtd);
      if (pp && qtd <= 0.001) {
        if (o.remover) removidas.push(p);
        else avisos.push(p.nome + ' está zerado nas Transações (a consolidação remove a linha)');
        return;
      }
      if (pp) { novo.qtd = qtd; novo.investido = arred2Rf_(pp.custo); }
      var preco = precos[chaveTesouro_(p.nome)];
      if (preco && preco.puVenda > 0 && qtd > 0) novo.atualizado = arred2Rf_(qtd * preco.puVenda);
      else if (Object.keys(precos).length) avisos.push('Sem preço do Tesouro pra ' + p.nome);
    } else {
      var custo = typeof custoPepsDoTituloRf_ === 'function' ? custoPepsDoTituloRf_(peps2Original_(peps), p.nome, p.instNorm) : null;
      if (custo != null) novo.investido = arred2Rf_(custo);
      Object.keys(peps).forEach(function (k) {
        var partes = k.split('|');
        if (partes[1] === p.instNorm && partes[0].indexOf(limparNomeRf_(p.nome).split(/[\s-]/)[0].toUpperCase()) === 0) cobertas[k] = true;
      });
      if (histRecente) {
        var v = hist.porPosicao[p.chave];
        if (v == null) v = somaPorTipoInstRf_(hist.porPosicao, p.nome, p.instNorm);
        if (v != null && v > 0) novo.atualizado = arred2Rf_(v);
      }
    }
    var dif = [];
    if (novo.qtd != null && Math.abs((Number(p.qtd) || 0) - novo.qtd) > 1e-6) dif.push({ col: 7, v: novo.qtd });
    if (novo.investido != null && Math.abs((Number(p.investido) || 0) - novo.investido) > 0.005) dif.push({ col: 9, v: novo.investido });
    if (novo.atualizado != null && Math.abs((Number(p.atualizado) || 0) - novo.atualizado) > 0.005) dif.push({ col: 12, v: novo.atualizado });
    if (dif.length) {
      mudancas.push({ linha: p.linha, dif: dif });
      atualizadas.push({ nome: p.nome, linha: p.linha, antes: { qtd: p.qtd, investido: p.investido, atualizado: p.atualizado }, depois: novo });
    }
  });

  // títulos com posição nas Transações e sem linha na Carteira
  Object.keys(peps).forEach(function (k) {
    var pp = peps[k];
    if (cobertas[k] || pp.qtd <= 0.001) return;
    var inst = k.split('|')[1];
    var chaveT = chaveTesouro_(pp.produto);
    var preco = chaveT ? precos[chaveT] : null;
    var qtd = Math.round(pp.qtd * 100) / 100;
    var valor = null;
    if (preco && preco.puVenda > 0) valor = arred2Rf_(qtd * preco.puVenda);
    else if (histRecente && hist.porPosicao[k] != null) valor = arred2Rf_(hist.porPosicao[k]);
    var venc = '';
    if (preco) venc = new Date(Number(preco.vencimento.slice(0, 4)), Number(preco.vencimento.slice(5, 7)) - 1, Number(preco.vencimento.slice(8, 10)));
    novas.push({
      nome: pp.produto,
      linha: [pp.produto, 'Renda Fixa', pp.produto, tipoInvestimentoRf_(pp.produto), indexadorCarteiraRf_(pp.produto), instRaw[inst] || instRawTx[inst] || inst,
        chaveT ? qtd : '', '', arred2Rf_(pp.custo), '', venc, valor == null ? '' : valor]
    });
  });

  var resumo = atualizadas.length + ' título(s) atualizado(s)' + (novas.length ? ', ' + novas.length + ' novo(s)' : '') + (removidas.length ? ', ' + removidas.length + ' zerado(s) removido(s)' : '');
  var saida = { resumo: resumo, atualizadas: atualizadas, novas: novas.map(function (x) { return { nome: x.nome, valores: x.linha }; }), removidas: removidas.map(function (p) { return { nome: p.nome, linha: p.linha }; }), avisos: avisos, dataPrecos: dataPrecos };
  if (o.simular) return saida;

  mudancas.forEach(function (m) { m.dif.forEach(function (d) { aba.getRange(m.linha, d.col).setValue(d.v); }); });
  var proxima = ultimaPosicao + 1;
  novas.forEach(function (x) {
    if (proxima > aba.getMaxRows()) aba.insertRowsAfter(aba.getMaxRows(), 5);
    var modelo = ultimaPosicao >= L0 ? ultimaPosicao : 0;
    if (modelo) {
      copiarFormatoLinha_(aba, modelo, proxima, Math.max(aba.getLastColumn(), 15));
      var jaTem = aba.getRange(proxima, 13, 1, 3).getFormulas()[0].some(function (f) { return !!f; });
      if (!jaTem) copiarFormulasLinha_(aba, modelo, proxima, 13, Math.max(aba.getLastColumn(), 15));
    }
    aba.getRange(proxima, 1, 1, 12).setValues([x.linha]);
    x.linhaPlanilha = proxima;
    proxima++;
  });
  removidas.slice().sort(function (a, b) { return b.linha - a.linha; }).forEach(function (p) { aba.deleteRow(p.linha); });
  return saida;
}

/** peps normalizado (acima) de volta pro formato de custoPepsDoTituloRf_ ({ 'Produto|INST': { qtd, custo } }). */
function peps2Original_(peps) {
  var out = {};
  Object.keys(peps).forEach(function (k) { var p = k.split('|'); out[peps[k].produto + '|' + p[1]] = { qtd: peps[k].qtd, custo: peps[k].custo }; });
  return out;
}

/** Roda direto no editor: mostra o que mudaria (não grava). */
function simularCarteiraRendaFixaDireto() {
  Logger.log(JSON.stringify(sincronizarCarteiraRendaFixa_({ simular: true }), null, 2));
}
