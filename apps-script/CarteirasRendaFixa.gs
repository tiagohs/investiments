/**
 * CarteirasRendaFixa.gs — ação "carteirasRendaFixa": sub-página de Renda
 * Fixa em Carteiras. Junta 3 fontes que já existem, sem duplicar nada:
 *   - "Carteira Renda Fixa"        -> os dados da posição em si
 *   - "RF Contratada - Resumo"     -> Rentabilidade Contratada (média
 *     ponderada, só título do Tesouro por enquanto — ver RendaFixaIR.gs)
 *   - montarIRRendaFixa_() (RendaFixaIR.gs, já testado ✓) -> IR se
 *     resgatasse hoje, por posição
 *
 * Benchmarks (CDI/IPCA/SELIC "de hoje"): buscarCdiSelicAnualizadosHoje_()
 * e buscarIpcaAcumulado12Meses_() (BackfillIndices.gs, 18/09/2026) — ver
 * cabeçalho daquele arquivo pra fonte de cada um.
 *
 * Campo "Status" (viés + preço teto), que existe nas outras 3 sub-páginas:
 * removido daqui (18/09/2026, a pedido do Tiago) — conferido via
 * diagnóstico direto na planilha que "Distribuição e Metas" só tem seção
 * de Radar de oportunidades (viés/preço teto) pra Ações/Ações EUA/FIIs;
 * a seção de Renda Fixa dessa aba (linha 94) é só alocação-alvo por tipo,
 * sem equivalente de viés/preço teto — não faz sentido pra Renda Fixa.
 *
 * Donut por Indexador: agrupa direto pela coluna E (Indexador) de
 * Carteira Renda Fixa, somando Valor Atualizado.
 */

var ABA_CARTEIRA_RF_SUBPAGINA = 'Carteira Renda Fixa';
var LINHA_DADOS_CARTEIRA_RF_SUBPAGINA = 9;
var ABA_RESUMO_RF_SUBPAGINA = 'RF Contratada - Resumo';
var LINHA_DADOS_RESUMO_RF_SUBPAGINA = 2;

function handleCarteirasRendaFixa(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    return jsonOut({ ok: true, carteira: montarCarteirasRendaFixa_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'carteirasRendaFixa', erro: String(err) });
  }
}

function testarCarteirasRendaFixaDireto() {
  Logger.log(JSON.stringify(montarCarteirasRendaFixa_(), null, 2));
}

// ---------------------------------------------------------------------------
// 05/10/2026 (Tiago: "Carteiras: Renda Fixa demora muito pra carregar, tem algo que dê pra
// cachear ou melhorar nesse tempo?"). Medido no harness com as fixtures reais, antes: 7 leituras
// da planilha (~262 mil células: "Carteira Renda Fixa" era lida 2x até a linha 5491 pra achar 9
// posições, aux_historico-indices 2x pro CDI/Selic e 1x de novo pro IPCA) + IPCA no BCB (rede) a
// cada 6h. Agora:
//   1) a carteira é lida em BLOCOS que param no 1º bloco vazio (1 leitura de ~60 linhas), e as
//      abas pequenas (Resumo/Lotes) 1x cada, compartilhadas com o cálculo do IR;
//   2) CDI/Selic/IPCA saem de UMA leitura de aux_historico-indices - NADA de rede no caminho da
//      tela (o BCB é atualizado pela agenda; sem dado, usa o último valor bom guardado);
//   3) o resultado montado vai pro CacheService (em pedaços, como Ativo.gs/Início), com chave que
//      muda sozinha quando o conteúdo das abas pequenas, a contagem de linhas das grandes
//      (Transações Renda Fixa, aux_historico-indices) ou o dia mudam, e uma versão que a
//      sincronização/agenda de Renda Fixa e "Limpar cache" trocam (invalidarCacheCarteirasRf_).
// ---------------------------------------------------------------------------
var PROP_VERSAO_CACHE_CARTEIRAS_RF = 'RF_CARTEIRA_CACHE_VERSAO';
var LINHAS_POR_BLOCO_CARTEIRA_RF_ = 60;

/** Faz a próxima abertura da tela de Renda Fixa recalcular (sync/agenda de RF, lançamento, Limpar cache). */
function invalidarCacheCarteirasRf_() {
  try { PropertiesService.getScriptProperties().setProperty(PROP_VERSAO_CACHE_CARTEIRAS_RF, String(Date.now())); } catch (e) { /* cache é só otimização */ }
}

/**
 * Lê as linhas de uma aba de posições em blocos de `tamanho` linhas e para no 1º bloco cuja última linha
 * (ou todas) está sem dado nas colunas-chave (índices 0-based) - a "Carteira Renda Fixa" tem getLastRow()
 * inflado por formatação/fórmulas vazias (5491 linhas pra 9 posições), e ler tudo era o grosso do tempo.
 */
function lerLinhasEmBlocosRf_(aba, linhaInicial, colunas, colunasChave, tamanho) {
  var ultima = aba.getLastRow();
  var saida = [];
  var linha = linhaInicial;
  var passo = tamanho || LINHAS_POR_BLOCO_CARTEIRA_RF_;
  while (linha <= ultima) {
    var n = Math.min(passo, ultima - linha + 1);
    var bloco = aba.getRange(linha, 1, n, colunas).getValues();
    var temDado = function (l) {
      for (var c = 0; c < colunasChave.length; c++) { var v = l[colunasChave[c]]; if (v !== '' && v != null) return true; }
      return false;
    };
    var temAlgum = false;
    for (var i = 0; i < bloco.length && !temAlgum; i++) temAlgum = temDado(bloco[i]);
    if (!temAlgum) break;
    for (var j = 0; j < bloco.length; j++) saida.push(bloco[j]);
    // a última linha do bloco já está vazia: os dados acabaram aqui dentro, não precisa ler o próximo bloco
    if (!temDado(bloco[bloco.length - 1])) break;
    linha += n;
  }
  return saida;
}

/** Linhas de dados de "Carteira Renda Fixa" (A..L), 1 leitura em blocos - compartilhada com montarIRRendaFixa_. */
function lerLinhasCarteiraRf_(ss) {
  var aba = ss.getSheetByName(ABA_CARTEIRA_RF_SUBPAGINA);
  if (!aba) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF_SUBPAGINA);
  return lerLinhasEmBlocosRf_(aba, LINHA_DADOS_CARTEIRA_RF_SUBPAGINA, 12, [0, 3]);
}

/** Linhas de uma aba pequena (Resumo/Lotes) de `linhaInicial` até a última, `colunas` colunas; [] se não existe. */
function lerLinhasAbaPequenaRf_(ss, nomeAba, linhaInicial, colunas) {
  var aba = ss.getSheetByName(nomeAba);
  if (!aba) return [];
  var ultima = aba.getLastRow();
  if (ultima < linhaInicial) return [];
  return aba.getRange(linhaInicial, 1, ultima - linhaInicial + 1, colunas).getValues();
}

function hashTextoRf_(texto) {
  var h1 = 5381, h2 = 52711;
  for (var i = 0; i < texto.length; i++) { var c = texto.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) + c) >>> 0; }
  return h1.toString(36) + h2.toString(36) + texto.length;
}

function chaveCacheCarteirasRf_(ss, leitura) {
  var versaoRf = '0', versaoAtivos = '0';
  try { versaoRf = PropertiesService.getScriptProperties().getProperty(PROP_VERSAO_CACHE_CARTEIRAS_RF) || '0'; } catch (e) { /* sem versão */ }
  try {
    if (typeof PROP_VERSAO_CACHE_ATIVOS === 'string') versaoAtivos = PropertiesService.getScriptProperties().getProperty(PROP_VERSAO_CACHE_ATIVOS) || '0';
  } catch (e2) { /* sem versão */ }
  var linhas = function (nome) { var aba = ss.getSheetByName(nome); return aba ? aba.getLastRow() : 0; };
  var contagens = [ABA_TRANSACOES_RF, ABA_HISTORICO_INDICES].map(linhas).join('_');
  var conteudo = hashTextoRf_(JSON.stringify([leitura.carteira, leitura.resumo, leitura.lotes]));
  return 'rfcart_v1_' + conteudo + '_' + chaveDiaISOInicio_(new Date()) + '_' + contagens + '_' + versaoRf + '_' + versaoAtivos;
}

/** Resultado montado: do CacheService se a chave (conteúdo/contagens/dia/versão) é a mesma, senão calcula e guarda. */
function montarCarteirasRendaFixa_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var leitura = {
    carteira: lerLinhasCarteiraRf_(ss),
    resumo: lerLinhasAbaPequenaRf_(ss, ABA_RESUMO_RF_SUBPAGINA, LINHA_DADOS_RESUMO_RF_SUBPAGINA, 7),
    lotes: lerLinhasAbaPequenaRf_(ss, ABA_LOTES_RF_IR, LINHA_DADOS_LOTES_RF_IR, 6)
  };
  var chave = null, emCache = null;
  try { chave = chaveCacheCarteirasRf_(ss, leitura); emCache = lerSerieHistoricoCache_(chave); } catch (eChave) { chave = null; emCache = null; }
  if (emCache) return emCache;
  var resultado = calcularCarteirasRendaFixa_(ss, leitura);
  if (chave) { try { gravarSerieHistoricoCache_(chave, resultado, null, 'carteiras_rf'); } catch (eGrava) { /* segue sem cache */ } }
  return resultado;
}

/**
 * 07/10/2026 (Tiago: "reservado para objetivos" - o fundo da chácara): POST definirDestinoRendaFixa.
 * Campos: `titulo` (o nome do título na Carteira Renda Fixa), `instituicao` e `destino` ('emergencial' | 'longo-prazo' | 'objetivo').
 * Grava na COLUNA B da linha do título: "Renda Emergencial" | "Renda Fixa" | "Objetivo" (rotuloColunaBDestinoRf_, Planilha.gs) - a única fonte
 * do destino (destinoRendaFixa_). Título dividido em 2 linhas da mesma instituição (parte reserva, parte longo prazo) não dá pra saber
 * qual é: devolve erro e pede pra editar a coluna B à mão. A aba é a mesma que o Tiago edita; nada de fórmula é mexido.
 */
function handleDefinirDestinoRendaFixa(e) {
  try {
    return jsonOut({ ok: true, resultado: definirDestinoRendaFixa_(SpreadsheetApp.getActiveSpreadsheet(), e.parameter) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'definirDestinoRendaFixa', erro: String(erro && erro.message ? erro.message : erro) });
  }
}

function definirDestinoRendaFixa_(ss, params) {
  var destino = String((params && params.destino) || '');
  if (DESTINOS_RENDA_FIXA_.indexOf(destino) < 0) throw new Error('destino inválido: use emergencial, longo-prazo ou objetivo');
  var titulo = String((params && params.titulo) || '').replace(/\s+/g, ' ').trim();
  if (!titulo) throw new Error('título não informado');
  var aba = ss.getSheetByName('Carteira Renda Fixa');
  if (!aba) throw new Error('aba não encontrada: Carteira Renda Fixa');
  var ini = LINHA_CABECALHO_CARTEIRA_RF + 1;
  var ultima = ultimaLinhaReal_(aba, [1, 4], ini);
  if (ultima < ini) throw new Error('a Carteira Renda Fixa está vazia');
  var dados = aba.getRange(ini, 1, ultima - ini + 1, 6).getValues();
  var chaveAlvo = chaveTituloRf_(titulo, (params && params.instituicao) || '');
  var achadas = [];
  dados.forEach(function (l, i) {
    if (!l[0] && !l[3]) return;
    var nome = String(l[2] || l[3] || '').replace(/\s+/g, ' ').trim();
    if (chaveTituloRf_(nome, l[5], l[0]) === chaveAlvo || chaveTituloRf_(nome, l[5]) === chaveAlvo) achadas.push(ini + i);
  });
  if (!achadas.length) throw new Error('não achei esse título na Carteira Renda Fixa');
  if (achadas.length > 1) throw new Error('esse título aparece em mais de uma linha da mesma instituição; troque a coluna B à mão (escreva "Objetivo", "Renda Emergencial" ou "Renda Fixa")');
  var rotulo = rotuloColunaBDestinoRf_(destino);
  aba.getRange(achadas[0], 2).setValue(rotulo);
  try { if (typeof registrarEscritaPlanilha_ === 'function') registrarEscritaPlanilha_(); } catch (eReg) { /* cache é só otimização */ }
  try { invalidarCacheCarteirasRf_(); } catch (eInv) { /* idem */ }
  return { linha: achadas[0], destino: destino, coluna: rotulo };
}

function calcularCarteirasRendaFixa_(ss, leitura) {
  // ---- Rentabilidade Contratada (por título+instituição), já lida ----
  var resumoPorChave = {};
  leitura.resumo.forEach(function (linha) {
    var titulo = linha[0], instituicao = linha[1];
    if (!titulo) return;
    resumoPorChave[chaveTituloRf_(titulo, instituicao)] = {
      indice: linha[2],
      numeroDeLotes: linha[3],
      rentabilidadeContratadaTexto: linha[6]
    };
  });

  // ---- pré-carrega o IR se resgatasse hoje (já calcula por posição) - reaproveita as leituras ----
  var irPorChave = {};
  montarIRRendaFixa_({ carteira: leitura.carteira, lotes: leitura.lotes }).forEach(function (posicaoIr) {
    irPorChave[chaveTituloRf_(posicaoIr.titulo, posicaoIr.instituicao)] = posicaoIr;
  });

  // ---- 23/09/2026 #2: "Valor aplicado" = custo PEPS das Transações ----
  // (ver custoRendaFixaPepsHoje_, FluxoCaixaInicio.gs) - a coluna manual
  // "Valor Investido" da Carteira Renda Fixa só é usada quando o título não
  // é encontrado nas Transações.
  var custoPeps = {};
  try { custoPeps = custoRendaFixaPepsHoje_(); } catch (errPeps) { custoPeps = {}; }
  function custoPepsDoTitulo(nome, instituicao) { return custoPepsDoTituloRf_(custoPeps, nome, instituicao); }

  // ---- percorre as posições de Carteira Renda Fixa (já lidas) ----
  var ativos = [];
  var porIndexador = {};
  var somaComprado = 0, somaAtualizado = 0;

  if (leitura.carteira.length) {
    var idsEstaveis = idsEstaveisCarteiraRf_(leitura.carteira); // 06/10/2026 (A-71): ISIN + instituição
    leitura.carteira.forEach(function (linha, iLinha) {
      var codigo = linha[0], marca = linha[1], nome = linha[2], tipo = linha[3],
        indexador = linha[4], instituicao = linha[5], quantidade = linha[6],
        valorInvestido = linha[8], vencimento = linha[10], valorAtualizado = linha[11];
      if (!codigo && !tipo) return;

      var nomeLimpo = String(nome || tipo || '').trim();
      var custo = custoPepsDoTitulo(nomeLimpo, instituicao);
      // sem arredondar aqui (só na saída) - arredondar título a título fazia o
      // total sair 1 centavo diferente do card/gráfico (23/09/2026 #3)
      if (custo != null) valorInvestido = custo;
      var chave = chaveTituloRf_(nomeLimpo, instituicao);
      var rentabilidadeContratada = resumoPorChave[chave] || null;
      var ir = irPorChave[chave] || null;

      somaComprado += (valorInvestido || 0);
      somaAtualizado += (valorAtualizado || 0);
      var grupo = indexador || 'Outro';
      porIndexador[grupo] = (porIndexador[grupo] || 0) + (valorAtualizado || 0);

      ativos.push({
        codigo: codigo || null,
        idEstavel: idsEstaveis[iLinha] || null,
        nomePersonalizado: nomeLimpo || null,
        tipoInvestimento: tipo || null,
        indexador: indexador || null,
        instituicao: instituicao || null,
        tipoCarteira: destinoRendaFixa_(marca), // 07/10/2026: 'emergencial' | 'longo-prazo' | 'objetivo' (Planilha.gs)
        quantidade: quantidade,
        vencimento: vencimento instanceof Date ?
          Utilities.formatDate(vencimento, Session.getScriptTimeZone(), 'MM/yyyy') : (vencimento || null),
        totalInvestido: typeof valorInvestido === 'number' ? arredondarCarteirasRf_(valorInvestido) : valorInvestido,
        totalAtualizado: valorAtualizado,
        rentabilidadeContratada: rentabilidadeContratada ? {
          indice: rentabilidadeContratada.indice,
          numeroDeLotes: rentabilidadeContratada.numeroDeLotes,
          texto: rentabilidadeContratada.rentabilidadeContratadaTexto
        } : null,
        irSeResgatasseHoje: ir ? {
          impostoSeResgatasseHoje: ir.impostoSeResgatasseHoje,
          iofSeResgatasseHoje: ir.iofSeResgatasseHoje, // 05/10/2026 (A-13): parte do imposto que é IOF (primeiros 30 dias)
          valorLiquidoSeResgatasseHoje: ir.valorLiquidoSeResgatasseHoje,
          precisao: ir.precisao,
          detalhes: ir.detalhes
        } : null
      });
    });
  }

  var lucroPrejuizoTotal = somaAtualizado - somaComprado;
  var distribuicaoPorIndexador = Object.keys(porIndexador).map(function (grupo) {
    return {
      grupo: grupo,
      totalAtualizado: arredondarCarteirasRf_(porIndexador[grupo]),
      percentual: somaAtualizado !== 0 ? arredondarCarteirasRf_(porIndexador[grupo] / somaAtualizado) : 0
    };
  }).sort(function (a, b) { return b.totalAtualizado - a.totalAtualizado; });

  return {
    resumo: {
      totalInvestido: arredondarCarteirasRf_(somaComprado),
      totalAtualizado: arredondarCarteirasRf_(somaAtualizado),
      lucroPrejuizo: arredondarCarteirasRf_(lucroPrejuizoTotal),
      percentualLucroPrejuizo: somaComprado !== 0 ? arredondarFracaoCarteirasRf_(lucroPrejuizoTotal / somaComprado) : 0,
      quantidadeAtivos: ativos.length
    },
    // 04/10/2026: benchmark nunca derruba a tela; 05/10/2026: e nunca vai à rede (só aba/cache/último valor bom)
    benchmarks: benchmarksRendaFixaSemRede_(ss),
    distribuicaoPorIndexador: distribuicaoPorIndexador,
    ativos: ativos
  };
}

/**
 * CDI/Selic (anualizados) e IPCA 12m de uma leitura só de aux_historico-indices - sem rede.
 * Mesma regra de buscarCdiSelicAnualizadosHoje_ (último valor por data) e ipca12MesesDaAba_ (BackfillIndices.gs).
 * IPCA sem dado na aba: cache (6h, chave do buscarIpcaAcumulado12Meses_) e por último o último valor bom guardado.
 * Nunca lança: benchmark não derruba a tela.
 */
function benchmarksRendaFixaSemRede_(ss) {
  var cdi = null, selic = null, ipca = null;
  var linhas = null;
  try {
    var aba = ss.getSheetByName(ABA_HISTORICO_INDICES);
    if (aba && aba.getLastRow() >= 2) linhas = aba.getRange(2, 1, aba.getLastRow() - 1, 3).getValues(); // A=Data, B=Índice, C=Valor
  } catch (eAba) { linhas = null; }
  if (linhas) {
    try {
      var ultimo = { CDI: { data: null, valor: null }, SELIC: { data: null, valor: null } };
      for (var i = 0; i < linhas.length; i++) {
        var u = ultimo[linhas[i][1]];
        var data = linhas[i][0];
        if (!u || !(data instanceof Date)) continue;
        if (!u.data || data > u.data) { u.data = data; u.valor = Number(linhas[i][2]); }
      }
      var diario = function (x) { return (typeof x.valor === 'number' && isFinite(x.valor)) ? arredondarBenchmarkRf_(anualizarTaxaDiariaBcb_(x.valor)) : null; };
      cdi = diario(ultimo.CDI);
      selic = diario(ultimo.SELIC);
    } catch (eCdi) { cdi = null; selic = null; }
    try { ipca = ipca12MesesDeLinhas_(linhas); } catch (eIpca) { ipca = null; }
  }

  var props = null;
  try { props = PropertiesService.getScriptProperties(); } catch (eP) { props = null; }
  if (ipca != null) {
    // guarda o último valor bom (se mudou) pra um dia sem dado na aba
    try { if (props && props.getProperty(CHAVE_IPCA12M_) !== String(ipca)) props.setProperty(CHAVE_IPCA12M_, String(ipca)); } catch (eS) { /* ok */ }
  } else {
    try {
      var emCache = CacheService.getScriptCache().get(CHAVE_IPCA12M_);
      if (emCache != null && emCache !== '' && isFinite(Number(emCache))) ipca = Number(emCache);
    } catch (eC) { /* segue */ }
    if (ipca == null) {
      try {
        var guardado = props && props.getProperty(CHAVE_IPCA12M_);
        if (guardado != null && guardado !== '' && isFinite(Number(guardado))) ipca = Number(guardado);
      } catch (eG) { /* ok */ }
    }
  }
  return { cdi: cdi, selic: selic, ipca: ipca };
}

/** 23/09/2026 #3: custo PEPS de um título da "Carteira Renda Fixa" dentro
 * de custoRendaFixaPepsHoje_() (FluxoCaixaInicio.gs) - compartilhado com
 * CarteirasHome.gs (card de Renda Fixa da Visão geral), pra os dois nunca
 * mostrarem "Valor aplicado" diferente. null = não achou nas Transações. */
function custoPepsDoTituloRf_(custoPeps, nome, instituicao) {
  var inst = normalizarInstituicaoRF_(instituicao);
  var exato = custoPeps[nome + '|' + inst];
  if (exato && exato.qtd > 0) return exato.custo;
  // LCI/LCA/CDB: na Carteira o nome é livre ("LCI - BANCO INTER S/A"), nas
  // Transações é o código ("LCI - 26I02621944") - casa pelo tipo + instituição.
  var tipo = String(nome).split(/[\s-]/)[0].toUpperCase();
  if (['LCI', 'LCA', 'CDB'].indexOf(tipo) === -1) return null;
  var soma = 0, achou = false;
  Object.keys(custoPeps).forEach(function (k) {
    var partes = k.split('|');
    if (partes[1] === inst && partes[0].toUpperCase().indexOf(tipo) === 0 && custoPeps[k].qtd > 0) { soma += custoPeps[k].custo; achou = true; }
  });
  return achou ? soma : null;
}

/** % com 4 casas (0,1657 = 16,57%) - arredondarCarteirasRf_ (2 casas)
 * arredondava o % pro inteiro mais próximo (23/09/2026 #3). */
function arredondarFracaoCarteirasRf_(valor) {
  return Math.round((valor + Number.EPSILON) * 10000) / 10000;
}

function arredondarCarteirasRf_(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
