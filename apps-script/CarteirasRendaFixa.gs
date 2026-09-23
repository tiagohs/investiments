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

function montarCarteirasRendaFixa_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- pré-carrega a Rentabilidade Contratada (por título+instituição) ----
  var abaResumo = ss.getSheetByName(ABA_RESUMO_RF_SUBPAGINA);
  var resumoPorChave = {};
  if (abaResumo) {
    var ultimaResumo = abaResumo.getLastRow();
    if (ultimaResumo >= LINHA_DADOS_RESUMO_RF_SUBPAGINA) {
      var dadosResumo = abaResumo.getRange(
        LINHA_DADOS_RESUMO_RF_SUBPAGINA, 1,
        ultimaResumo - LINHA_DADOS_RESUMO_RF_SUBPAGINA + 1, 7
      ).getValues();
      dadosResumo.forEach(function (linha) {
        var titulo = linha[0], instituicao = linha[1];
        if (!titulo) return;
        resumoPorChave[normalizarChaveRfSubpagina_(titulo, instituicao)] = {
          indice: linha[2],
          numeroDeLotes: linha[3],
          rentabilidadeContratadaTexto: linha[6]
        };
      });
    }
  }

  // ---- pré-carrega o IR se resgatasse hoje (já calcula por posição) ----
  var irPorChave = {};
  montarIRRendaFixa_().forEach(function (posicaoIr) {
    irPorChave[normalizarChaveRfSubpagina_(posicaoIr.titulo, posicaoIr.instituicao)] = posicaoIr;
  });

  // ---- 23/09/2026 #2: "Valor aplicado" = custo PEPS das Transações ----
  // (ver custoRendaFixaPepsHoje_, FluxoCaixaInicio.gs) - a coluna manual
  // "Valor Investido" da Carteira Renda Fixa só é usada quando o título não
  // é encontrado nas Transações.
  var custoPeps = {};
  try { custoPeps = custoRendaFixaPepsHoje_(); } catch (errPeps) { custoPeps = {}; }
  function custoPepsDoTitulo(nome, instituicao) { return custoPepsDoTituloRf_(custoPeps, nome, instituicao); }

  // ---- percorre as posições de Carteira Renda Fixa ----
  var abaCarteira = ss.getSheetByName(ABA_CARTEIRA_RF_SUBPAGINA);
  if (!abaCarteira) throw new Error('aba não encontrada: ' + ABA_CARTEIRA_RF_SUBPAGINA);
  var ultimaCarteira = abaCarteira.getLastRow();
  var ativos = [];
  var porIndexador = {};
  var somaComprado = 0, somaAtualizado = 0;

  if (ultimaCarteira >= LINHA_DADOS_CARTEIRA_RF_SUBPAGINA) {
    var dadosCarteira = abaCarteira.getRange(
      LINHA_DADOS_CARTEIRA_RF_SUBPAGINA, 1,
      ultimaCarteira - LINHA_DADOS_CARTEIRA_RF_SUBPAGINA + 1, 12
    ).getValues();

    dadosCarteira.forEach(function (linha) {
      var codigo = linha[0], marca = linha[1], nome = linha[2], tipo = linha[3],
        indexador = linha[4], instituicao = linha[5], quantidade = linha[6],
        valorInvestido = linha[8], vencimento = linha[10], valorAtualizado = linha[11];
      if (!codigo && !tipo) return;

      var nomeLimpo = String(nome || tipo || '').trim();
      var custo = custoPepsDoTitulo(nomeLimpo, instituicao);
      // sem arredondar aqui (só na saída) - arredondar título a título fazia o
      // total sair 1 centavo diferente do card/gráfico (23/09/2026 #3)
      if (custo != null) valorInvestido = custo;
      var chave = normalizarChaveRfSubpagina_(nomeLimpo, instituicao);
      var rentabilidadeContratada = resumoPorChave[chave] || null;
      var ir = irPorChave[chave] || null;

      somaComprado += (valorInvestido || 0);
      somaAtualizado += (valorAtualizado || 0);
      var grupo = indexador || 'Outro';
      porIndexador[grupo] = (porIndexador[grupo] || 0) + (valorAtualizado || 0);

      ativos.push({
        codigo: codigo || null,
        nomePersonalizado: nomeLimpo || null,
        tipoInvestimento: tipo || null,
        indexador: indexador || null,
        instituicao: instituicao || null,
        tipoCarteira: marca === 'Renda Emergencial' ? 'emergencial' : 'longo-prazo',
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
    benchmarks: (function () {
      var cdiSelic = buscarCdiSelicAnualizadosHoje_();
      return { cdi: cdiSelic.cdi, selic: cdiSelic.selic, ipca: buscarIpcaAcumulado12Meses_() };
    })(),
    distribuicaoPorIndexador: distribuicaoPorIndexador,
    ativos: ativos
  };
}

function normalizarChaveRfSubpagina_(titulo, instituicao) {
  return String(titulo || '').trim().toUpperCase() + '|' + String(instituicao || '').trim().toUpperCase();
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
