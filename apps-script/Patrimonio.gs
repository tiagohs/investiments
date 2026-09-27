/**
 * Patrimonio.gs - 27/09/2026: aba "Patrimônio" da Organização Financeira
 * (organizacao/despesas.html#patrimonio).
 *
 * Tiago: "Qual meu patrimônio total? Investimentos, bens e direitos, bens
 * levando em consideração financiamento (quanto de fato eu tenho), meu
 * histórico, minha meta futura, no meu ritmo atual quanto tempo levaria".
 *
 * Privacidade (pedido do Tiago): os PDFs (IR, FGTS, CTPS, extratos do
 * financiamento e do FIES) são lidos NO NAVEGADOR e só os totais chegam
 * aqui - nada de CPF, PIS, conta, endereço ou número de contrato. Os totais
 * ficam nesta planilha (privada, no Drive dele), que só a sessão logada lê.
 * As declarações do IR podem ser lidas direto da pasta do Drive
 * (Documentos/IR/<ano>/Cópia da Declaração.pdf): o Apps Script entrega o PDF
 * pro navegador da sessão logada, que lê e devolve só os totais.
 *
 * Onde mora cada coisa:
 *   'aux_patrimonio'          Chave | Valor (JSON) | Atualizado em
 *       imovel, financiamento, fies, fgts, carreira, ir, outros, preferencias
 *   'aux_patrimonio-indices'  Mês | FipeZap (cidade) | IVG-R  (+ metadados em E1:H2)
 *       FipeZap: série histórica da FIPE (xlsx, aba da cidade, "Total" de
 *       venda residencial); IVG-R: Banco Central, SGS 21340. Atualiza
 *       sozinho se tiver mais de 15 dias (ou rode atualizarIndicesPatrimonioDireto).
 *   Lidos de outras telas: montarHome_ (investimentos hoje),
 *   montarSerieHistoricoInicio_ (investido mês a mês), lerDespesasOrganizacao_
 *   (despesas e metas da Distribuição e Metas), proventos dos últimos 12 meses.
 *
 * GET  action=patrimonio
 * GET  action=patrimonioIrArquivos           PDFs de declaração na pasta do IR
 * GET  action=patrimonioIrArquivo&id=        um PDF (base64) - só da pasta do IR
 * POST action=salvarPatrimonio  chave, valor (JSON; vazio apaga)
 *
 * Uma vez no editor: configurarPastaIrDireto() (ou com o ID da pasta "IR").
 */

var PATRIMONIO_ABA_ = 'aux_patrimonio';
var PATRIMONIO_ABA_INDICES_ = 'aux_patrimonio-indices';
var PATRIMONIO_CHAVES_ = ['imovel', 'financiamento', 'fies', 'fgts', 'carreira', 'ir', 'outros', 'preferencias'];
var PATRIMONIO_MAX_JSON_ = 49000;
var PATRIMONIO_INDICES_DIAS_ = 15;
var PROP_PASTA_IR = 'PATRIMONIO_PASTA_IR';
var URL_FIPEZAP_ = 'https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx';
var URL_IVGR_ = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.21340/dados?formato=json&dataInicial=01/01/2012';

function handlePatrimonio(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var r = montarTelaPatrimonio_(SpreadsheetApp.getActiveSpreadsheet(), new Date());
    r.ok = true;
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'patrimonio', erro: String(erro) });
  }
}

function handleSalvarPatrimonio(e) {
  var trava = LockService.getScriptLock();
  try { trava.waitLock(20000); } catch (eL) { return jsonOut({ ok: false, etapa: 'patrimonio', erro: 'planilha ocupada, tente de novo em alguns segundos' }); }
  try {
    var p = (e && e.parameter) || {};
    return jsonOut(salvarPatrimonio_(SpreadsheetApp.getActiveSpreadsheet(), p.chave, p.valor, new Date()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'patrimonio', erro: String(erro && erro.message ? erro.message : erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

function handleIrArquivosPatrimonio(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(listarArquivosIrPatrimonio_());
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'patrimonio', erro: String(erro) });
  }
}

function handleIrArquivoPatrimonio(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(arquivoIrPatrimonio_((e && e.parameter && e.parameter.id) || ''));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'patrimonio', erro: String(erro) });
  }
}

// ---------------------------------------------------------------------------
// Configuração (aux_patrimonio)
// ---------------------------------------------------------------------------

function lerConfigPatrimonio_(ss) {
  var cfg = {};
  var atualizado = {};
  var aba = ss.getSheetByName(PATRIMONIO_ABA_);
  if (!aba) return { config: cfg, atualizado: atualizado };
  var ultima = aba.getLastRow();
  if (ultima < 2) return { config: cfg, atualizado: atualizado };
  aba.getRange(2, 1, ultima - 1, 3).getValues().forEach(function (l) {
    var chave = String(l[0] || '').trim();
    if (PATRIMONIO_CHAVES_.indexOf(chave) < 0 || !l[1]) return;
    try { cfg[chave] = JSON.parse(String(l[1]).replace(/^'/, '')); } catch (eJ) { return; }
    var d = l[2];
    atualizado[chave] = d && typeof d.getTime === 'function' ? d.toISOString() : (d ? String(d) : null);
  });
  return { config: cfg, atualizado: atualizado };
}

function garantirAbaPatrimonio_(ss) {
  var aba = ss.getSheetByName(PATRIMONIO_ABA_);
  if (aba) return aba;
  aba = ss.insertSheet(PATRIMONIO_ABA_);
  aba.getRange(1, 1, 1, 3).setValues([['Chave', 'Valor (JSON)', 'Atualizado em']]);
  if (aba.setFrozenRows) aba.setFrozenRows(1);
  return aba;
}

function salvarPatrimonio_(ss, chave, valorJson, agora) {
  chave = String(chave || '').trim();
  if (PATRIMONIO_CHAVES_.indexOf(chave) < 0) return { ok: false, etapa: 'patrimonio', erro: 'chave inválida: ' + chave };
  var valor = null;
  if (valorJson !== undefined && valorJson !== null && String(valorJson).trim() !== '') {
    try { valor = JSON.parse(valorJson); } catch (eJ) { return { ok: false, etapa: 'patrimonio', erro: 'valor inválido (JSON)' }; }
    valor = normalizarPatrimonio_(chave, valor);
  }
  var texto = valor === null ? '' : JSON.stringify(valor);
  if (texto.length > PATRIMONIO_MAX_JSON_) return { ok: false, etapa: 'patrimonio', erro: 'dados grandes demais pra uma célula (' + texto.length + ' caracteres)' };
  var aba = garantirAbaPatrimonio_(ss);
  var ultima = aba.getLastRow();
  var linha = 0;
  if (ultima >= 2) {
    var chaves = aba.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < chaves.length; i++) if (String(chaves[i][0]).trim() === chave) { linha = i + 2; break; }
  }
  if (valor === null) {
    if (linha) aba.deleteRow(linha);
  } else {
    if (!linha) linha = Math.max(ultima, 1) + 1;
    aba.getRange(linha, 1, 1, 3).setValues([[chave, texto, agora || new Date()]]);
  }
  SpreadsheetApp.flush();
  var lido = lerConfigPatrimonio_(ss);
  return { ok: true, chave: chave, valor: valor, config: lido.config, atualizado: lido.atualizado };
}

// --- normalização (só os campos conhecidos, números conferidos) ------------

function numPat_(v, min, max, campo) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  if (!isFinite(n)) throw new Error('número inválido em ' + campo);
  if ((min !== null && min !== undefined && n < min) || (max !== null && max !== undefined && n > max)) throw new Error('valor fora do esperado em ' + campo + ': ' + v);
  return Math.round(n * 1e8) / 1e8;
}
function txtPat_(v, max) { return v === null || v === undefined ? '' : String(v).replace(/^[=+\-@\s]+/, '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max || 80); }
function mesPat_(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})/); return m ? m[1] + '-' + m[2] : null; }
function dataPat_(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : mesPat_(v); }
function boolPat_(v, padrao) { return v === true || v === false ? v : padrao; }
function listaPat_(v, max, fn) { return Array.isArray(v) ? v.slice(0, max).map(fn).filter(function (x) { return x !== null; }) : []; }
var DINHEIRO_MAX_ = 1e9;

function normalizarPatrimonio_(chave, v) {
  if (v === null || typeof v !== 'object') throw new Error('valor inválido pra ' + chave);
  var n = function (x, campo, min, max) { return numPat_(x, min === undefined ? 0 : min, max === undefined ? DINHEIRO_MAX_ : max, campo); };
  if (chave === 'imovel') {
    var metodo = ['media', 'fipezap', 'ivgr', 'manual', 'compra'].indexOf(v.metodo) >= 0 ? v.metodo : 'media';
    var compra = n(v.valorCompra, 'valorCompra');
    if (!(compra > 0)) throw new Error('informe o valor de compra do imóvel');
    if (!mesPat_(v.dataCompra)) throw new Error('informe o mês da compra (aaaa-mm)');
    return {
      nome: txtPat_(v.nome, 60), cidade: txtPat_(v.cidade || 'São Paulo', 40), area: n(v.area, 'area', 0, 100000),
      valorCompra: compra, dataCompra: mesPat_(v.dataCompra), entrada: n(v.entrada, 'entrada'),
      valorManual: n(v.valorManual, 'valorManual'), dataValorManual: dataPat_(v.dataValorManual), metodo: metodo
    };
  }
  if (chave === 'financiamento') {
    return {
      banco: txtPat_(v.banco, 40), sistema: v.sistema === 'Price' ? 'Price' : 'SAC',
      saldo: n(v.saldo, 'saldo'), dataSaldo: dataPat_(v.dataSaldo), taxaAnual: numPat_(v.taxaAnual, 0, 0.5, 'taxaAnual'),
      amortizacao: n(v.amortizacao, 'amortizacao'), prazoTotal: numPat_(v.prazoTotal, 0, 600, 'prazoTotal'),
      prazoRestante: numPat_(v.prazoRestante, 0, 600, 'prazoRestante'), seguroTaxas: n(v.seguroTaxas, 'seguroTaxas'),
      parcela: n(v.parcela, 'parcela'), jurosMes: n(v.jurosMes, 'jurosMes'), indexador: txtPat_(v.indexador, 10),
      proximaParcela: v.proximaParcela && typeof v.proximaParcela === 'object' ? { vencimento: dataPat_(v.proximaParcela.vencimento), valor: n(v.proximaParcela.valor, 'proximaParcela') } : null,
      dataInicio: mesPat_(v.dataInicio), valorFinanciado: n(v.valorFinanciado, 'valorFinanciado'),
      saldosConhecidos: listaPat_(v.saldosConhecidos, 40, function (s) { return s && dataPat_(s.data) && isFinite(Number(s.saldo)) ? { data: dataPat_(s.data), saldo: n(s.saldo, 'saldosConhecidos') } : null; }),
      amortizacoesExtras: listaPat_(v.amortizacoesExtras, 40, function (s) { return s && dataPat_(s.data) && isFinite(Number(s.valor)) ? { data: dataPat_(s.data), valor: n(s.valor, 'amortizacoesExtras'), origem: txtPat_(s.origem || 'manual', 10) } : null; }),
      usarFgtsComoExtra: boolPat_(v.usarFgtsComoExtra, true)
    };
  }
  if (chave === 'fies') {
    return {
      banco: txtPat_(v.banco, 40), sistema: 'Price', saldo: n(v.saldo, 'saldo'), dataSaldo: dataPat_(v.dataSaldo),
      parcela: n(v.parcela, 'parcela'), taxaMensal: numPat_(v.taxaMensal, 0, 0.05, 'taxaMensal'),
      restantes: numPat_(v.restantes, 0, 600, 'restantes'), fim: mesPat_(v.fim), inicioAmortizacao: mesPat_(v.inicioAmortizacao),
      contratacao: mesPat_(v.contratacao), valorContratado: n(v.valorContratado, 'valorContratado')
    };
  }
  if (chave === 'fgts') {
    return {
      contas: listaPat_(v.contas, 20, function (c) {
        if (!c || typeof c !== 'object') return null;
        var saques = {};
        Object.keys(c.saques || {}).slice(0, 10).forEach(function (k) { saques[txtPat_(k, 20)] = n(c.saques[k], 'saques'); });
        return {
          empregador: txtPat_(c.empregador, 80), admissao: dataPat_(c.admissao), afastamento: dataPat_(c.afastamento),
          saldo: n(c.saldo, 'saldo'), dataSaldo: dataPat_(c.dataSaldo),
          mensal: listaPat_(c.mensal, 600, function (p) { return Array.isArray(p) && mesPat_(p[0]) && isFinite(Number(p[1])) ? [mesPat_(p[0]), numPat_(p[1], -DINHEIRO_MAX_, DINHEIRO_MAX_, 'mensal')] : null; }),
          depositos: n(c.depositos, 'depositos'), jam: n(c.jam, 'jam'), lucros: n(c.lucros, 'lucros'),
          transfEntrada: n(c.transfEntrada, 'transfEntrada'), transfSaida: n(c.transfSaida, 'transfSaida'), saques: saques,
          usosMoradia: listaPat_(c.usosMoradia, 40, function (u) { return u && dataPat_(u.data) ? { data: dataPat_(u.data), valor: n(u.valor, 'usosMoradia') } : null; }),
          saquesAniversario: listaPat_(c.saquesAniversario, 40, function (u) { return u && dataPat_(u.data) ? { data: dataPat_(u.data), valor: n(u.valor, 'saquesAniversario') } : null; })
        };
      })
    };
  }
  if (chave === 'carreira') {
    return {
      nascimento: mesPat_(v.nascimento),
      contratos: listaPat_(v.contratos, 20, function (c) {
        if (!c || typeof c !== 'object') return null;
        return {
          empregador: txtPat_(c.empregador, 80), inicio: dataPat_(c.inicio), fim: dataPat_(c.fim),
          cargos: listaPat_(c.cargos, 20, function (x) { return x ? { inicio: dataPat_(x.inicio), fim: dataPat_(x.fim), cargo: txtPat_(x.cargo, 60) } : null; }),
          salarios: listaPat_(c.salarios, 60, function (x) { return x && dataPat_(x.data) ? { data: dataPat_(x.data), valor: n(x.valor, 'salario') } : null; }),
          salarioContratual: n(c.salarioContratual, 'salarioContratual')
        };
      })
    };
  }
  if (chave === 'ir') {
    return {
      anos: listaPat_(v.anos, 40, function (a) {
        if (!a || !isFinite(Number(a.ano))) return null;
        var grupos = {};
        Object.keys(a.grupos || {}).slice(0, 15).forEach(function (k) {
          var g = a.grupos[k] || {};
          grupos[txtPat_(k, 4)] = { anterior: numPat_(g.anterior, -DINHEIRO_MAX_, DINHEIRO_MAX_, 'grupo'), atual: numPat_(g.atual, -DINHEIRO_MAX_, DINHEIRO_MAX_, 'grupo'), qtd: numPat_(g.qtd, 0, 1000, 'qtd') };
        });
        return {
          exercicio: numPat_(a.exercicio, 1990, 2100, 'exercicio'), ano: numPat_(a.ano, 1990, 2100, 'ano'),
          bens: n(a.bens, 'bens'), bensAnterior: n(a.bensAnterior, 'bensAnterior'), dividas: n(a.dividas, 'dividas'), dividasAnterior: n(a.dividasAnterior, 'dividasAnterior'),
          grupos: grupos, conferido: boolPat_(a.conferido, false),
          tributaveis: n(a.tributaveis, 'tributaveis'), isentos: n(a.isentos, 'isentos'), exclusivos: n(a.exclusivos, 'exclusivos'),
          impostoDevido: n(a.impostoDevido, 'impostoDevido'), impostoPago: n(a.impostoPago, 'impostoPago'), restituir: n(a.restituir, 'restituir'), pagar: n(a.pagar, 'pagar')
        };
      }).sort(function (a, b) { return a.ano - b.ano; })
    };
  }
  if (chave === 'outros') {
    var lista = Array.isArray(v) ? v : v.itens;
    return listaPat_(lista, 50, function (o) {
      if (!o || !txtPat_(o.nome, 60)) return null;
      return { id: txtPat_(o.id || Utilities.getUuid(), 40), nome: txtPat_(o.nome, 60), tipo: o.tipo === 'divida' ? 'divida' : 'bem', valor: n(o.valor, 'valor'), data: dataPat_(o.data), obs: txtPat_(o.obs, 120) };
    });
  }
  if (chave === 'preferencias') {
    return {
      incluirReservaNaAposentadoria: boolPat_(v.incluirReservaNaAposentadoria, false),
      parcelasViramAporte: boolPat_(v.parcelasViramAporte, true),
      descontar: Array.isArray(v.descontar) ? v.descontar.slice(0, 40).map(function (x) { return txtPat_(x, 80); }) : null,
      taxaSaque: numPat_(v.taxaSaque, 0.01, 0.2, 'taxaSaque'),
      rendimentoReal: numPat_(v.rendimentoReal, -0.05, 0.3, 'rendimentoReal'),
      aporteModo: ['ritmo', 'meta', 'manual'].indexOf(v.aporteModo) >= 0 ? v.aporteModo : 'ritmo',
      aporteManual: n(v.aporteManual, 'aporteManual'),
      idadeAlvo: numPat_(v.idadeAlvo, 30, 90, 'idadeAlvo'),
      nascimento: mesPat_(v.nascimento)
    };
  }
  throw new Error('chave inválida: ' + chave);
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

function dataIsoPatrimonio_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

/** Patrimônio e aportes por mês a partir da série diária da Início (último dia do mês / soma do mês). */
function historicoMensalPatrimonio_(serie) {
  var porMes = {};
  var ordem = [];
  (serie || []).forEach(function (p) {
    var m = String(p.data || '').slice(0, 7);
    if (!m) return;
    if (!porMes[m]) { porMes[m] = { mes: m, patrimonio: null, reserva: null, aporte: 0, aporteLongoPrazo: 0, aporteReserva: 0 }; ordem.push(m); }
    var o = porMes[m];
    if (typeof p.patrimonio === 'number') o.patrimonio = p.patrimonio;
    if (typeof p.rendaEmergencial === 'number') o.reserva = p.rendaEmergencial;
    o.aporte += Number(p.fluxoCaixaPatrimonio) || 0;
    o.aporteLongoPrazo += Number(p.fluxoCaixaLongoPrazo) || 0;
    o.aporteReserva += Number(p.fluxoCaixaRendaEmergencial) || 0;
  });
  ordem.sort();
  return ordem.map(function (m) {
    var o = porMes[m];
    ['aporte', 'aporteLongoPrazo', 'aporteReserva'].forEach(function (c) { o[c] = Math.round(o[c] * 100) / 100; });
    return o;
  });
}

function montarTelaPatrimonio_(ss, hoje, opcoes) {
  opcoes = opcoes || {};
  var avisos = {};
  var lido = lerConfigPatrimonio_(ss);
  var r = { hoje: dataIsoPatrimonio_(hoje), config: lido.config, atualizado: lido.atualizado };

  try {
    var h = montarHome_(); // Home.gs
    var p = h.patrimonio || {};
    var pc = p.porClasse || {};
    r.investimentos = {
      total: p.total, longoPrazo: p.longoPrazo, reserva: p.rendaEmergencial,
      porClasse: {
        acoes: pc.acoes, fiis: pc.fiis, acoesEua: pc.acoesEua, rendaFixa: pc.rendaFixa,
        rendaFixaLongoPrazo: typeof pc.rendaFixa === 'number' && typeof p.rendaEmergencial === 'number' ? Math.round((pc.rendaFixa - p.rendaEmergencial) * 100) / 100 : null
      }
    };
  } catch (eH) { avisos.investimentos = String(eH); }

  try { r.historicoMensal = historicoMensalPatrimonio_(montarSerieHistoricoInicio_()); } catch (eS) { avisos.historico = String(eS); r.historicoMensal = []; }

  try {
    var d = lerDespesasOrganizacao_(ss); // Despesas.gs
    var soma = (d.despesas.itens || []).reduce(function (s, it) {
      var v = typeof it.valor === 'number' && isFinite(it.valor) ? it.valor : 0;
      return s + (/anual/i.test(it.frequencia || '') ? v / 12 : v);
    }, 0);
    var usaSoma = d.despesas.totalReal === null || d.despesas.erroFormula;
    r.despesas = {
      itens: (d.despesas.itens || []).map(function (it) { return { nome: it.nome, valor: it.valor, frequencia: it.frequencia, categoria: it.categoria }; }),
      folga: d.despesas.folga,
      totalReal: usaSoma ? Math.round(soma * 100) / 100 : d.despesas.totalReal,
      totalComFolga: usaSoma ? Math.round(soma * (1 + (d.despesas.folga || 0)) * 100) / 100 : d.despesas.totalComFolga
    };
    r.metas = {
      extra: d.patrimonio.extra, reinvestimento: d.patrimonio.reinvestimento, rendimento: d.patrimonio.rendimento,
      desejado: d.patrimonio.desejado, rendaDesejada: d.patrimonio.rendaDesejada,
      aporteMeta: d.salario.aporte, salarioLiquido: d.salario.liquido,
      reservaMeta: d.reserva.meta, reservaAtual: d.reserva.atual
    };
  } catch (eD) { avisos.despesas = String(eD); }

  try {
    var rec = (montarTelaProventosComCache_().recebidos) || [];
    var corte = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
    var corteIso = dataIsoPatrimonio_(corte);
    r.proventos12m = Math.round(rec.reduce(function (s, x) { return s + (String(x.data || '') > corteIso ? (Number(x.valor) || 0) : 0); }, 0) * 100) / 100;
  } catch (eP) { avisos.proventos = String(eP); }

  try { r.cdi = buscarCdiSelicAnualizadosHoje_().cdi; } catch (eC) { r.cdi = null; }

  var cidade = (lido.config.imovel && lido.config.imovel.cidade) || 'São Paulo';
  try { r.indices = lerIndicesPatrimonio_(ss, cidade, hoje, opcoes.buscarIndices); } catch (eI) { avisos.indices = String(eI); r.indices = null; }
  if (r.indices && r.indices.aviso) avisos.indices = r.indices.aviso;

  try { r.pastaIrConfigurada = !!PropertiesService.getScriptProperties().getProperty(PROP_PASTA_IR); } catch (eProp) { r.pastaIrConfigurada = false; }
  if (Object.keys(avisos).length) r.avisos = avisos;
  return r;
}

// ---------------------------------------------------------------------------
// Índices de preço de imóvel (FipeZap da cidade + IVG-R)
// ---------------------------------------------------------------------------

function semAcentoPatrimonio_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Serial de data do Excel -> 'aaaa-mm'. */
function mesDoSerialExcel_(serial) {
  var d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(serial)) * 86400000);
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
}

/** Caminho (dentro do xlsx) da aba da cidade no FipeZap: workbook.xml (nome -> r:id) + rels (r:id -> arquivo). */
function caminhoAbaFipezap_(workbookXml, relsXml, cidade) {
  var alvo = semAcentoPatrimonio_(cidade);
  var rid = null;
  var reSheet = /<sheet\b[^>]*>/g;
  var m;
  while ((m = reSheet.exec(workbookXml || ''))) {
    var nome = ((m[0].match(/name="([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&');
    if (semAcentoPatrimonio_(nome) === alvo) { rid = (m[0].match(/r:id="([^"]*)"/) || [])[1]; break; }
  }
  if (!rid) throw new Error('FipeZap: não achei a aba da cidade "' + cidade + '"');
  var rel = (relsXml || '').match(new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*>'));
  var alvoArq = rel ? (rel[0].match(/Target="([^"]*)"/) || [])[1] : null;
  if (!alvoArq) throw new Error('FipeZap: aba da cidade sem arquivo');
  return 'xl/' + alvoArq.replace(/^\/?xl\//, '').replace(/^\//, '');
}

/**
 * Lê a aba de uma cidade do FipeZap: coluna B = data (serial do Excel),
 * C = índice "Total" de venda residencial, R = preço médio R$/m² (o "." de
 * mês sem dado vem como texto e fica de fora).
 */
function lerAbaFipezapXml_(xml, cidade) {
  var serie = [];
  var precoM2 = null;
  var mesPreco = null;
  var reRow = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  var celula = function (linhaXml, col, r) {
    var c = linhaXml.match(new RegExp('<c\\b[^>]*\\br="' + col + r + '"([^>]*)>(?:<f>[^<]*</f>)?<v>([^<]*)</v>'));
    if (!c || /\bt="s"/.test(c[1]) || /\bt="str"/.test(c[1])) return null;
    var v = Number(c[2]);
    return isFinite(v) ? v : null;
  };
  var rr;
  while ((rr = reRow.exec(xml || ''))) {
    var r = rr[1];
    var serial = celula(rr[2], 'B', r);
    var idx = celula(rr[2], 'C', r);
    if (serial === null || idx === null || serial < 20000) continue;
    var mes = mesDoSerialExcel_(serial);
    serie.push([mes, Math.round(idx * 1e6) / 1e6]);
    var pr = celula(rr[2], 'R', r);
    if (pr !== null) { precoM2 = Math.round(pr * 100) / 100; mesPreco = mes; }
  }
  if (!serie.length) throw new Error('FipeZap: nenhuma linha com índice na aba de ' + cidade);
  serie.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  return { serie: serie, precoM2: precoM2, mesPreco: mesPreco };
}

/** xlsx do FipeZap já aberto ({ caminho: texto }) -> série da cidade. */
function lerFipezapXlsx_(arquivos, cidade) {
  var caminho = caminhoAbaFipezap_(arquivos['xl/workbook.xml'], arquivos['xl/_rels/workbook.xml.rels'], cidade);
  if (!arquivos[caminho]) throw new Error('FipeZap: arquivo da aba não encontrado (' + caminho + ')');
  return lerAbaFipezapXml_(arquivos[caminho], cidade);
}

function baixarFipezap_(cidade) {
  var resp = UrlFetchApp.fetch(URL_FIPEZAP_, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) throw new Error('FipeZap: HTTP ' + resp.getResponseCode());
  var porNome = {};
  Utilities.unzip(resp.getBlob().setContentType('application/zip')).forEach(function (b) { porNome[b.getName()] = b; });
  var texto = function (nome) { return porNome[nome] ? porNome[nome].getDataAsString('UTF-8') : ''; };
  // só o workbook, os rels e a aba da cidade viram texto (o arquivo tem ~50 abas)
  var caminho = caminhoAbaFipezap_(texto('xl/workbook.xml'), texto('xl/_rels/workbook.xml.rels'), cidade);
  if (!porNome[caminho]) throw new Error('FipeZap: arquivo da aba não encontrado (' + caminho + ')');
  return lerAbaFipezapXml_(texto(caminho), cidade);
}

/** SGS do Banco Central ([{data:'dd/mm/aaaa', valor:'783.90'}]) -> [['aaaa-mm', 783.9]]. */
function serieIvgrDeJson_(lista) {
  return (lista || []).map(function (x) {
    var m = String(x && x.data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    var v = Number(String(x && x.valor || '').replace(',', '.'));
    return m && isFinite(v) ? [m[3] + '-' + m[2], v] : null;
  }).filter(function (x) { return x; }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
}

function baixarIvgr_() {
  var resp = UrlFetchApp.fetch(URL_IVGR_, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('IVG-R: HTTP ' + resp.getResponseCode());
  return serieIvgrDeJson_(JSON.parse(resp.getContentText()));
}

function lerAbaIndicesPatrimonio_(ss) {
  var aba = ss.getSheetByName(PATRIMONIO_ABA_INDICES_);
  if (!aba) return null;
  var ultima = aba.getLastRow();
  if (ultima < 2) return null;
  var meta = aba.getRange(2, 5, 1, 4).getValues()[0];
  var fipezap = [];
  var ivgr = [];
  if (ultima >= 2) {
    aba.getRange(2, 1, ultima - 1, 3).getValues().forEach(function (l) {
      var mes = mesPat_(String(l[0] || '').replace(/^'/, ''));
      if (!mes) return;
      if (typeof l[1] === 'number' && isFinite(l[1])) fipezap.push([mes, l[1]]);
      if (typeof l[2] === 'number' && isFinite(l[2])) ivgr.push([mes, l[2]]);
    });
  }
  var at = meta[1];
  return {
    cidade: String(meta[0] || ''), atualizadoEm: at && typeof at.getTime === 'function' ? at.toISOString() : (at ? String(at) : null),
    precoM2: typeof meta[2] === 'number' ? meta[2] : null, mesPrecoM2: mesPat_(String(meta[3] || '').replace(/^'/, '')),
    fipezap: fipezap, ivgr: ivgr
  };
}

function gravarAbaIndicesPatrimonio_(ss, dados, agora) {
  var aba = ss.getSheetByName(PATRIMONIO_ABA_INDICES_);
  if (!aba) aba = ss.insertSheet(PATRIMONIO_ABA_INDICES_);
  var meses = {};
  (dados.fipezap || []).forEach(function (p) { meses[p[0]] = meses[p[0]] || ['', '']; meses[p[0]][0] = p[1]; });
  (dados.ivgr || []).forEach(function (p) { meses[p[0]] = meses[p[0]] || ['', '']; meses[p[0]][1] = p[1]; });
  var chaves = Object.keys(meses).sort();
  var ultima = aba.getLastRow();
  if (ultima >= 2) aba.getRange(2, 1, ultima - 1, 3).setValues(Array.apply(null, Array(ultima - 1)).map(function () { return ['', '', '']; }));
  aba.getRange(1, 1, 1, 8).setValues([['Mês', 'FipeZap ' + dados.cidade, 'IVG-R', '', 'Cidade (FipeZap)', 'Atualizado em', 'Preço médio (R$/m²)', 'Mês do preço']]);
  aba.getRange(2, 5, 1, 4).setValues([[dados.cidade, agora, dados.precoM2 === null ? '' : dados.precoM2, dados.mesPrecoM2 ? "'" + dados.mesPrecoM2 : '']]);
  if (chaves.length) aba.getRange(2, 1, chaves.length, 3).setValues(chaves.map(function (m) { return ["'" + m, meses[m][0], meses[m][1]]; }));
}

/**
 * Índices do imóvel: usa a aba se estiver fresca (menos de 15 dias e da
 * mesma cidade); senão busca de novo. Se a busca falhar, fica com o que já
 * tinha e avisa. `buscar` (testes): { fipezap: fn(cidade), ivgr: fn() }.
 */
function lerIndicesPatrimonio_(ss, cidade, agora, buscar, forcar) {
  var salvo = lerAbaIndicesPatrimonio_(ss);
  var idade = salvo && salvo.atualizadoEm ? (agora.getTime() - new Date(salvo.atualizadoEm).getTime()) / 86400000 : Infinity;
  var mesmaCidade = salvo && semAcentoPatrimonio_(salvo.cidade) === semAcentoPatrimonio_(cidade);
  if (!forcar && salvo && mesmaCidade && idade < PATRIMONIO_INDICES_DIAS_ && (salvo.fipezap.length || salvo.ivgr.length)) return salvo;
  buscar = buscar || { fipezap: baixarFipezap_, ivgr: baixarIvgr_ };
  var erros = [];
  var fz = null;
  var iv = null;
  try { fz = buscar.fipezap(cidade); } catch (eF) { erros.push(String(eF)); }
  try { iv = buscar.ivgr(); } catch (eV) { erros.push(String(eV)); }
  if (!fz && !iv) {
    if (salvo) { salvo.aviso = 'índices não atualizaram (' + erros.join('; ') + ') - usando os de ' + (salvo.atualizadoEm || '?').slice(0, 10); return salvo; }
    return { cidade: cidade, fipezap: [], ivgr: [], precoM2: null, mesPrecoM2: null, atualizadoEm: null, aviso: erros.join('; ') };
  }
  var dados = {
    cidade: cidade,
    fipezap: fz ? fz.serie : (mesmaCidade && salvo ? salvo.fipezap : []),
    ivgr: iv || (salvo ? salvo.ivgr : []),
    precoM2: fz ? fz.precoM2 : (mesmaCidade && salvo ? salvo.precoM2 : null),
    mesPrecoM2: fz ? fz.mesPreco : (mesmaCidade && salvo ? salvo.mesPrecoM2 : null)
  };
  gravarAbaIndicesPatrimonio_(ss, dados, agora);
  var out = lerAbaIndicesPatrimonio_(ss) || dados;
  if (erros.length) out.aviso = erros.join('; ');
  return out;
}

/** Rode no editor pra forçar a atualização dos índices (FipeZap + IVG-R). */
function atualizarIndicesPatrimonioDireto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = lerConfigPatrimonio_(ss).config;
  var cidade = (cfg.imovel && cfg.imovel.cidade) || 'São Paulo';
  var r = lerIndicesPatrimonio_(ss, cidade, new Date(), null, true);
  var ultimo = function (s) { return s && s.length ? s[s.length - 1].join(' = ') : '—'; };
  Logger.log('FipeZap ' + cidade + ': ' + r.fipezap.length + ' meses (último ' + ultimo(r.fipezap) + ') · IVG-R: ' + r.ivgr.length + ' meses (último ' + ultimo(r.ivgr) + ')' + (r.aviso ? ' · aviso: ' + r.aviso : ''));
  return r;
}

// ---------------------------------------------------------------------------
// Declarações do IR direto do Drive (pasta "IR" com uma subpasta por ano)
// ---------------------------------------------------------------------------

/**
 * Rode 1 vez no editor: acha a pasta "IR" (de preferência a que está dentro
 * de "Documentos"), guarda o ID e pede a autorização de leitura do Drive.
 * Se tiver mais de uma pasta "IR", passe o ID: configurarPastaIrDireto('<id>').
 */
function configurarPastaIrDireto(idOpcional) {
  var pasta = null;
  if (idOpcional) pasta = DriveApp.getFolderById(idOpcional);
  else {
    var it = DriveApp.getFoldersByName('IR');
    var candidatas = [];
    while (it.hasNext()) candidatas.push(it.next());
    candidatas.forEach(function (p) {
      if (pasta) return;
      var pais = p.getParents();
      while (pais.hasNext()) { if (/^documentos$/i.test(pais.next().getName())) { pasta = p; return; } }
    });
    if (!pasta && candidatas.length === 1) pasta = candidatas[0];
    if (!pasta) throw new Error(candidatas.length ? 'Achei ' + candidatas.length + ' pastas "IR" - rode configurarPastaIrDireto("<id da pasta>")' : 'Não achei a pasta "IR" no seu Drive.');
  }
  PropertiesService.getScriptProperties().setProperty(PROP_PASTA_IR, pasta.getId());
  var r = listarArquivosIrPatrimonio_();
  Logger.log('Pasta do IR configurada: ' + pasta.getName() + ' - ' + r.arquivos.length + ' declaração(ões): ' + r.arquivos.map(function (a) { return a.pasta + '/' + a.nome; }).join(', '));
}

function listarArquivosIrPatrimonio_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_PASTA_IR);
  if (!id) return { ok: true, configurado: false, arquivos: [] };
  var raiz = DriveApp.getFolderById(id);
  var arquivos = [];
  var olhar = function (pasta, nomePasta, nivel) {
    var fs = pasta.getFiles();
    while (fs.hasNext()) {
      var f = fs.next();
      var nome = f.getName();
      var ehPdf = /pdf$/i.test(f.getMimeType()) || /\.pdf$/i.test(nome);
      if (ehPdf && /declara/i.test(semAcentoPatrimonio_(nome))) {
        arquivos.push({ id: f.getId(), nome: nome, pasta: nomePasta, tamanho: f.getSize(), modificado: f.getLastUpdated().toISOString() });
      }
    }
    if (nivel >= 2) return;
    var subs = pasta.getFolders();
    while (subs.hasNext()) { var s = subs.next(); olhar(s, s.getName(), nivel + 1); }
  };
  olhar(raiz, raiz.getName(), 0);
  arquivos.sort(function (a, b) { return a.pasta < b.pasta ? -1 : (a.pasta > b.pasta ? 1 : 0); });
  return { ok: true, configurado: true, arquivos: arquivos };
}

/** Um PDF da pasta do IR em base64 - recusa qualquer arquivo que não esteja na lista. */
function arquivoIrPatrimonio_(id) {
  var lista = listarArquivosIrPatrimonio_();
  if (!lista.configurado) return { ok: false, etapa: 'patrimonio', erro: 'pasta do IR não configurada (rode configurarPastaIrDireto no editor)' };
  var achado = lista.arquivos.filter(function (a) { return a.id === id; })[0];
  if (!achado) return { ok: false, etapa: 'patrimonio', erro: 'arquivo fora da pasta do IR' };
  if (achado.tamanho > 8 * 1024 * 1024) return { ok: false, etapa: 'patrimonio', erro: 'PDF grande demais (' + Math.round(achado.tamanho / 1024) + ' KB)' };
  var bytes = DriveApp.getFileById(id).getBlob().getBytes();
  return { ok: true, id: id, nome: achado.nome, pasta: achado.pasta, base64: Utilities.base64Encode(bytes) };
}
