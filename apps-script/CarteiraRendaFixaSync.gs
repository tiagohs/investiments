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
  if (o.textoCsv) return parsearPrecosTesouroCsv_(o.textoCsv);
  // 05/10/2026 (A-51): Fontes.gs - cache de 6 h (mesma chave de antes) -> disjuntor persistente -> fetch -> último
  // bom guardado (o arquivo tem ~20 anos de CSV; o que se guarda é só o último dia, já interpretado). Com o
  // Tesouro Transparente fora do ar a tela abre com os preços do último dia que deu certo (dataBase vai junto em cada título).
  var r = buscarFonte_('tesouro', URL_PRECOS_TESOURO, {
    tipo: 'texto', charset: 'ISO-8859-1', ttl: 21600, cacheChave: 'tesouro_precos_v1',
    validar: function (t) { return typeof t === 'string' && t.length > 0; },
    transformar: parsearPrecosTesouroCsv_
  });
  if (!r.ok) throw new Error('Tesouro Transparente indisponível (' + r.aviso + ')');
  if (r.origem === 'ultimo-bom') Logger.log('precosTesouroDireto_: ' + r.aviso);
  return r.dados;
}

/** CSV do Tesouro Transparente (";", 20 anos) -> só o último dia: { 'TIPO|ANO': { tipo, vencimento, dataBase, puVenda, puCompra, taxaCompra, taxaVenda } }. */
function parsearPrecosTesouroCsv_(texto) {
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
  return porData;
}

function tipoInvestimentoRf_(produto) {
  var s = limparNomeRf_(produto);
  if (/^Tesouro Selic/i.test(s)) return 'Tesouro Selic (LFT)';
  if (/^Tesouro IPCA/i.test(s)) return 'Tesouro IPCA+';
  if (/^Tesouro Prefixado/i.test(s)) return 'Tesouro Prefixado';
  if (/^Tesouro/i.test(s)) return s.replace(/\s+\d{4}$/, '');
  if (/^(LCI|LCA)/i.test(s)) return 'LCI / LCA Pós-fixada';
  // 07/10/2026: os rótulos são os da lista de validação da coluna "Tipo de Investimento" da planilha (CDB Pós-fixado, CDB Pré-fixado, Fundos DI...);
  // escrever fora dela dá erro ("viola as regras de validação") - valorAceitoPelaValidacao_ ainda confere na hora de gravar
  if (/^CDB/i.test(s)) return /pr[eé][\s-]?fixad/i.test(s) ? 'CDB Pré-fixado' : 'CDB Pós-fixado';
  if (/^Deb[eê]nture/i.test(s)) return 'Debênture pós-fixada';
  if (ehFundoRf_(s)) return 'Fundos DI'; // fundo (ex. "Trend DI FC RF Simples RL") - antes caía em 'Renda Fixa' genérico
  return 'Renda Fixa';
}

/**
 * 07/10/2026 (erro do Tiago em completarTitulosRendaFixaDireto: "Os dados inseridos na célula D18 violam o respectivo conjunto de regras de validação
 * de dados"): colunas da Carteira Renda Fixa com validação de dados em lista (Tipo de Investimento, Indexador...) recusam valor fora da lista e a
 * gravação PARA no meio. Devolve o valor se a célula não tem lista (ou a lista só avisa), o item da lista que bate sem acento/maiúscula, ou ''
 * (a célula fica em branco pro Tiago escolher) - nunca quebra a gravação.
 */
function valorAceitoPelaValidacao_(celula, valor) {
  if (valor === '' || valor == null || !celula || typeof celula.getDataValidation !== 'function') return valor;
  var lista = null;
  try {
    var regra = celula.getDataValidation();
    if (!regra || (typeof regra.getAllowInvalid === 'function' && regra.getAllowInvalid())) return valor;
    var criterio = regra.getCriteriaType(), args = regra.getCriteriaValues() || [];
    var tipos = (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.DataValidationCriteria) || {};
    if (String(criterio) === String(tipos.VALUE_IN_LIST || 'VALUE_IN_LIST')) lista = args[0] || [];
    else if (String(criterio) === String(tipos.VALUE_IN_RANGE || 'VALUE_IN_RANGE') && args[0] && args[0].getValues) lista = [].concat.apply([], args[0].getValues());
  } catch (e) { return valor; }
  if (!lista) return valor;
  lista = lista.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(function (x) { return x; });
  if (lista.indexOf(String(valor)) >= 0) return valor;
  var norm = function (t) { return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim(); };
  var alvo = norm(valor);
  for (var i = 0; i < lista.length; i++) if (norm(lista[i]) === alvo) return lista[i];
  for (var j = 0; j < lista.length; j++) if (norm(lista[j]).indexOf(alvo) === 0 || alvo.indexOf(norm(lista[j])) === 0) return lista[j];
  try { Logger.log('Carteira Renda Fixa: "' + valor + '" não está na lista da célula ' + celula.getA1Notation() + ' - deixei em branco'); } catch (eLog) { /* só log */ }
  return '';
}

/** Grava a linha inteira passando Tipo (D) e Indexador (E) pela validação da própria célula. */
function linhaAceitaPelaValidacaoRf_(aba, linha, valores) {
  var out = valores.slice();
  [3, 4].forEach(function (i) { if (i < out.length) out[i] = valorAceitoPelaValidacao_(aba.getRange(linha, i + 1), out[i]); });
  return out;
}

/**
 * 07/10/2026 (Tiago: fundo DI guardado pra chácara): o nome é de um FUNDO de investimento? (FIC, FC, FI, FIRF, "RF Simples", "Fundo..."). Tesouro,
 * CDB e LCI/LCA nunca casam. Espelho no front: assets/js/fundos-rf.js!ehFundoRf.
 */
function ehFundoRf_(nome) {
  var s = limparNomeRf_(nome);
  if (!s || /^(Tesouro|LCI|LCA|CDB)\b/i.test(s)) return false;
  return /(^|[^A-Za-z0-9])(FIC|FC|FI|FIRF|FIF|FIM|FIA|FUNDO|FUNDOS)([^A-Za-z0-9]|$)|\bRF\s+(SIMPLES|REFERENCIADO|CURTO|LONGO|CR|LP)\b|\bREFERENCIADO\s+DI\b/i.test(s);
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

  // 07/10/2026 (Tiago colou as compras do fundo e a linha da Carteira ficou só com o nome): linha INCOMPLETA - sem instituição, tipo ou
  // indexador. Sem a instituição a chave (nome|instituição) não casava com as Transações/histórico (saldo 0, detalhe do título sem extrato) e o
  // 3º passo abaixo criaria uma linha NOVA em duplicidade. Aqui a linha adota a instituição das Transações (se for UMA só com esse nome e ainda
  // sem linha) e completa SÓ os vazios (tipo, indexador, instituição) - nunca troca o que o Tiago preencheu, nem a coluna B (destino).
  var completar = {};
  posicoes.forEach(function (p) {
    var l = dados[p.linha - L0] || [];
    var nomeUp = limparNomeRf_(p.nome).toUpperCase();
    if (!nomeUp) return;
    var difs = [];
    if (!l[5]) {
      var candidatas = Object.keys(peps).filter(function (k) { return k.split('|')[0] === nomeUp && !(contagem[k] > 0); });
      if (candidatas.length === 1) {
        var instNova = candidatas[0].split('|')[1];
        contagem[p.chave] = (contagem[p.chave] || 1) - 1;
        p.chave = candidatas[0]; p.instNorm = instNova; contagem[p.chave] = 1;
        difs.push({ col: 6, v: instRawTx[instNova] || instRaw[instNova] || instNova });
      } else if (candidatas.length > 1) {
        avisos.push(p.nome + ' está sem instituição e as Transações têm mais de uma - preencha a coluna Instituição à mão');
      }
    }
    if (!l[3]) difs.push({ col: 4, v: tipoInvestimentoRf_(p.nome) });
    if (!l[4]) difs.push({ col: 5, v: indexadorCarteiraRf_(p.nome) });
    if (difs.length) completar[p.linha] = { nome: p.nome, difs: difs };
  });
  var hojeChaveRf = chaveDiaISOInicio_(agora);
  var cotasInformadas = lerCotasFundosRf_();
  var cdiDiario = null; // lido 1 vez, só se algum fundo tiver cota informada

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
      // 07/10/2026: fundo - a quantidade é a de COTAS (soma das Transações) e, se o Tiago informou uma cota (detalhe do título), o valor é
      // cotas x cota informada corrigida pelo CDI até hoje (no lugar da estimativa 100% do CDI do histórico). Tudo que lê a coluna L
      // (Home, Carteiras, Patrimônio, Metas) passa a ver esse valor - um lugar só.
      if (ehFundoRf_(p.nome)) {
        var ppF = peps[p.chave];
        if (ppF && ppF.qtd > 0.00000001) {
          novo.qtd = Math.round(ppF.qtd * 1e8) / 1e8;
          if (cotasInformadas[normalizarNomeRf_(p.nome)] && !cdiDiario) cdiDiario = lerCdiDiarioRf_(ss);
          var vCota = valorPelaCotaInformadaRf_(p.nome, novo.qtd, hojeChaveRf, cotasInformadas, cdiDiario);
          if (vCota != null) novo.atualizado = vCota;
        }
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
  // 07/10/2026: o que a linha incompleta ganhou (instituição, tipo, indexador) entra junto das mudanças dela
  Object.keys(completar).forEach(function (linha) {
    var c = completar[linha];
    var m = mudancas.filter(function (x) { return x.linha === Number(linha); })[0];
    if (!m) {
      m = { linha: Number(linha), dif: [] };
      mudancas.push(m);
      atualizadas.push({ nome: c.nome, linha: Number(linha), antes: {}, depois: {} });
    }
    c.difs.forEach(function (d) { m.dif.push(d); });
    atualizadas.filter(function (a) { return a.linha === Number(linha); }).forEach(function (a) { a.depois.completou = c.difs.map(function (d) { return { col: d.col, v: d.v }; }); });
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
    var ehFundoNovo = ehFundoRf_(pp.produto);
    if (ehFundoNovo) {
      // 07/10/2026: fundo novo - cotas e, se houver cota informada, o valor pela cota (senão o do histórico, como antes)
      qtd = Math.round(pp.qtd * 1e8) / 1e8;
      if (cotasInformadas[normalizarNomeRf_(pp.produto)] && !cdiDiario) cdiDiario = lerCdiDiarioRf_(ss);
      var vCotaNovo = valorPelaCotaInformadaRf_(pp.produto, qtd, hojeChaveRf, cotasInformadas, cdiDiario);
      if (vCotaNovo != null) valor = vCotaNovo;
    }
    var venc = '';
    if (preco) venc = dataNaPlanilha_(ss, preco.vencimento.slice(0, 10)); // 07/10/2026: meia-noite no fuso da PLANILHA (a coluna "Mês/Ano vencimento" dela vira o mês certo)
    novas.push({
      nome: pp.produto,
      linha: [pp.produto, 'Renda Fixa', pp.produto, tipoInvestimentoRf_(pp.produto), indexadorCarteiraRf_(pp.produto), instRaw[inst] || instRawTx[inst] || inst,
        (chaveT || ehFundoNovo) ? qtd : '', '', arred2Rf_(pp.custo), '', venc, valor == null ? '' : valor]
    });
  });

  var resumo = atualizadas.length + ' título(s) atualizado(s)' + (novas.length ? ', ' + novas.length + ' novo(s)' : '') + (removidas.length ? ', ' + removidas.length + ' zerado(s) removido(s)' : '');
  var saida = { resumo: resumo, atualizadas: atualizadas, novas: novas.map(function (x) { return { nome: x.nome, valores: x.linha }; }), removidas: removidas.map(function (p) { return { nome: p.nome, linha: p.linha }; }), avisos: avisos, dataPrecos: dataPrecos };
  if (o.simular) return saida;

  mudancas.forEach(function (m) {
    m.dif.forEach(function (d) {
      var cel = aba.getRange(m.linha, d.col);
      cel.setValue(d.col === 4 || d.col === 5 ? valorAceitoPelaValidacao_(cel, d.v) : d.v); // 07/10/2026: lista de validação da planilha
    });
  });
  var proxima = ultimaPosicao + 1;
  novas.forEach(function (x) {
    if (proxima > aba.getMaxRows()) aba.insertRowsAfter(aba.getMaxRows(), 5);
    var modelo = ultimaPosicao >= L0 ? ultimaPosicao : 0;
    if (modelo) {
      copiarFormatoLinha_(aba, modelo, proxima, Math.max(aba.getLastColumn(), 15));
      var jaTem = aba.getRange(proxima, 13, 1, 3).getFormulas()[0].some(function (f) { return !!f; });
      if (!jaTem) copiarFormulasLinha_(aba, modelo, proxima, 13, Math.max(aba.getLastColumn(), 15));
    }
    aba.getRange(proxima, 1, 1, 12).setValues([linhaAceitaPelaValidacaoRf_(aba, proxima, x.linha)]);
    x.linhaPlanilha = proxima;
    proxima++;
  });
  removidas.slice().sort(function (a, b) { return b.linha - a.linha; }).forEach(function (p) { aba.deleteRow(p.linha); });
  // 05/10/2026: a Carteira Renda Fixa mudou - a tela de Renda Fixa (cache do resultado montado) recalcula na próxima abertura
  try { if (typeof invalidarCacheCarteirasRf_ === 'function') invalidarCacheCarteirasRf_(); } catch (eInv) { /* cache é só otimização */ }
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


// ---------------------------------------------------------------------------
// 07/10/2026 (Tiago: fundo DI da chácara - "cota real x estimativa"): COTA INFORMADA de um fundo.
// O site estima o fundo como 100% do CDI desde cada compra (aproximação: sem taxa de administração/come-cotas). A cota de verdade
// (do app da corretora) o Tiago informa no detalhe do título (cota + data) e fica numa Script Property pequena, `COTAS_FUNDOS_RF`:
// { 'NOME DO FUNDO': { cota, data: 'aaaa-mm-dd', em: ISO do registro } } - chave só pelo NOME (a instituição é a custódia; completar a
// instituição da linha não perde a cota). Com cota informada, a sincronização grava na coluna L: cotas x cota x CDI acumulado desde a data da
// cota até hoje. Sem cota informada nada muda (continua a estimativa do histórico).
// ---------------------------------------------------------------------------

var PROP_COTAS_FUNDOS_RF_ = 'COTAS_FUNDOS_RF';

function lerCotasFundosRf_() {
  try {
    var bruto = PropertiesService.getScriptProperties().getProperty(PROP_COTAS_FUNDOS_RF_);
    var obj = bruto ? JSON.parse(bruto) : {};
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch (e) { return {}; }
}

/** { cota, data, em } do fundo (pelo nome) ou null. */
function cotaInformadaFundoRf_(nome) {
  var c = lerCotasFundosRf_()[normalizarNomeRf_(nome)];
  return c && Number(c.cota) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(c.data || '')) ? { cota: Number(c.cota), data: String(c.data), em: c.em || null } : null;
}

/** Série diária do CDI (% ao dia) de aux_historico-indices: [{ dia: 'aaaa-mm-dd', taxa }] em ordem. Vazia se a aba não existe. */
function lerCdiDiarioRf_(ss) {
  var out = [];
  try {
    var aba = ss.getSheetByName(ABA_HISTORICO_INDICES);
    if (!aba || aba.getLastRow() < 2) return out;
    aba.getRange(2, 1, aba.getLastRow() - 1, 3).getValues().forEach(function (l) {
      if (l[1] !== 'CDI' || !ehDataPlanilha_(l[0]) || typeof l[2] !== 'number') return;
      out.push({ dia: chaveDiaISOInicio_(l[0]), taxa: l[2] });
    });
    out.sort(function (a, b) { return a.dia < b.dia ? -1 : (a.dia > b.dia ? 1 : 0); });
  } catch (e) { /* sem a série: só a cota, sem correção */ }
  return out;
}

/** { 'aaaa-mm': % do CDI acumulado no mês } dos meses COMPLETOS da série diária (não traz o mês de hoje); a tela compara a rentabilidade mensal do fundo. */
function cdiMensalRf_(ss, hoje) {
  var fator = {}, saida = {};
  lerCdiDiarioRf_(ss).forEach(function (x) { var k = x.dia.slice(0, 7); fator[k] = (fator[k] || 1) * (1 + x.taxa / 100); });
  Object.keys(fator).forEach(function (k) { if (k < String(hoje).slice(0, 7)) saida[k] = Math.round((fator[k] - 1) * 1e6) / 1e4; });
  return saida;
}

/** Fator do CDI nos dias APÓS `diaCota` até `hoje` (inclusive) - a cota de um dia já traz o CDI desse dia. */
function fatorCdiDesdeRf_(cdiDiario, diaCota, hoje) {
  var f = 1;
  (cdiDiario || []).forEach(function (x) { if (x.dia > diaCota && x.dia <= hoje) f *= 1 + x.taxa / 100; });
  return f;
}

/** cotas x cota informada x CDI desde a data da cota; null se o fundo não tem cota informada. */
function valorPelaCotaInformadaRf_(nome, cotas, hoje, cotasInformadas, cdiDiario) {
  var c = (cotasInformadas || {})[normalizarNomeRf_(nome)];
  if (!c || !(Number(c.cota) > 0) || !(cotas > 0)) return null;
  return arred2Rf_(cotas * Number(c.cota) * fatorCdiDesdeRf_(cdiDiario, String(c.data), hoje));
}

/**
 * POST definirCotaFundoRf: `titulo`, `cota` (número; aceita vírgula) e `data` ('aaaa-mm-dd', padrão hoje). Guarda a cota, refaz a coluna L da
 * Carteira Renda Fixa (sincronização sem rede) e limpa os caches. Cota mais antiga que a já informada é recusada (a mais nova vale).
 */
function handleDefinirCotaFundoRf(e) {
  try {
    return jsonOut({ ok: true, resultado: definirCotaFundoRf_(SpreadsheetApp.getActiveSpreadsheet(), e.parameter) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'definirCotaFundoRf', erro: String(erro && erro.message ? erro.message : erro) });
  }
}

function numeroDaCotaRf_(valor) {
  var t = String(valor == null ? '' : valor).replace(/\s|R\$/g, '');
  // "1.234,5678" (pt-BR) -> 1234.5678; "1,6543" -> 1.6543; "1.6543" (ponto decimal) fica
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  return Number(t);
}

function definirCotaFundoRf_(ss, params) {
  var titulo = limparNomeRf_(params && params.titulo);
  if (!titulo) throw new Error('título não informado');
  var cota = numeroDaCotaRf_(params && params.cota);
  if (!isFinite(cota) || !(cota > 0) || cota >= 1000000) throw new Error('cota inválida: informe o valor da cota em reais (ex. 1,6543)');
  var hoje = chaveDiaISOInicio_(new Date());
  var data = String((params && params.data) || hoje).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('data inválida (use aaaa-mm-dd)');
  if (data > hoje) throw new Error('a data da cota não pode ser no futuro');
  var trava = typeof travaRecurso_ === 'function' ? travaRecurso_('carteira', 'cota do fundo') : null;
  if (trava) trava.waitLock(30000);
  try {
    var todas = lerCotasFundosRf_();
    var chave = normalizarNomeRf_(titulo);
    var atual = todas[chave];
    if (atual && String(atual.data) > data) throw new Error('já existe uma cota mais recente (' + String(atual.data).split('-').reverse().join('/') + ') - informe uma cota de data igual ou posterior');
    todas[chave] = { cota: cota, data: data, em: new Date().toISOString() };
    PropertiesService.getScriptProperties().setProperty(PROP_COTAS_FUNDOS_RF_, JSON.stringify(todas));
    var sync = null;
    try { sync = sincronizarCarteiraRendaFixa_({ precos: {} }); } catch (eSync) { sync = { erro: String(eSync) }; }
    try { if (typeof registrarEscritaPlanilha_ === 'function') registrarEscritaPlanilha_(); } catch (eReg) { /* cache é só otimização */ }
    try { if (typeof invalidarCacheCarteirasRf_ === 'function') invalidarCacheCarteirasRf_(); } catch (eInv) { /* idem */ }
    try { if (typeof invalidarCacheAtivos_ === 'function') invalidarCacheAtivos_(); } catch (eAt) { /* idem */ }
    return { titulo: titulo, cota: cota, data: data, sincronizacao: sync && sync.resumo ? sync.resumo : (sync && sync.erro) || '' };
  } finally {
    if (trava) trava.releaseLock();
  }
}

/**
 * Função para rodar 1x no editor (07/10/2026): completa as linhas INCOMPLETAS da Carteira Renda Fixa (instituição, tipo e indexador vazios;
 * e a quantidade, o valor investido e o valor atualizado) pela mesma sincronização do dia a dia, sem rede (não mexe nos preços do Tesouro).
 * Nunca troca o que já está preenchido nem a coluna B (destino). `completarTitulosRendaFixaDireto({ simular: true })` só mostra.
 */
function completarTitulosRendaFixaDireto(opcoes) {
  var r = sincronizarCarteiraRendaFixa_({ precos: {}, simular: !!(opcoes && opcoes.simular === true) });
  Logger.log(r.resumo + (r.avisos && r.avisos.length ? ' | avisos: ' + r.avisos.join('; ') : ''));
  Logger.log(JSON.stringify(r.atualizadas.filter(function (a) { return a.depois && a.depois.completou; }), null, 2));
  return r;
}
