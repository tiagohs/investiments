// tests/harness/carteiras-real.test.js
//
// 20/09/2026 - testes de regressão "fonte da verdade" pras telas de
// Carteiras (Visão Geral + Ações/FIIs/Ações EUA/Renda Fixa), pedidos pelo
// Tiago depois de reparar que o card do topo ("Patrimônio em Carteiras")
// e o gráfico "Evolução do patrimônio" da MESMA tela mostravam números
// diferentes pro que deveria ser a mesma coisa ("veja se os números lá
// batem também, e veja se os gráficos de patrimônio também estão de
// acordo com o patrimônio que aparece na tela... Lembre-se de ter os
// testes unitários de todos esses casos também").
//
// Achado confirmado (ver relatório enviado ao Tiago em 20/09/2026): os 2
// números vêm de FONTES DIFERENTES por desenho -
//   - o card do topo de cada página (patrimonioTotal/resumo.totalAtualizado)
//     vem de uma leitura LIVE da planilha (montarHome_/montarCarteiraClasse_/
//     montarCarteirasRendaFixa_, direto de Auxiliar_ativos/Carteira Renda
//     Fixa/📊Dash Geral - fresco a cada chamada)
//   - o gráfico "Evolução do patrimônio" plota o ÚLTIMO PONTO de
//     `historico` (montarSerieHistoricoInicio_, HistoricoInicio.gs), uma
//     série BACKFILLADA (roda 1x/dia via gatilho + cache de até 6h)
// então uma pequena diferença entre os dois é ESPERADA (não é bug em
// nenhum dos dois lados isoladamente) - os testes abaixo não exigem
// igualdade exata entre live e backfill, só:
//   1) que cada PÁGINA seja internamente consistente (a soma das partes
//      bate com o total que a própria página mostra);
//   2) que a diferença live-vs-backfill fique dentro de uma faixa
//      plausível de variação de preço/timing (não indique um erro grosseiro
//      de fonte errada ou ticker fantasma);
//   3) que todo ticker que o backfill (aux_historico-patrimonio, via
//      Sync.gs!TICKERS_BR/TICKERS_USA) ainda está sincronizando corresponda
//      a uma posição realmente viva na tabela/card LIVE da classe
//      correspondente (Auxiliar_ativos) - achado real com os dados do
//      Tiago, CORRIGIDO em 20/09/2026 (1ª versão deste comentário dizia
//      "falta de cadastro manual" - estava ERRADO, ver correção abaixo):
//      o ticker USA "STR" (Sitio Royalties) foi incorporado pela Viper
//      Energy (NASDAQ: VNOM) num merge all-stock fechado em 19/08/2025
//      (razão de troca 0,4855 VNOM por 1 STR - conferido: as 4 primeiras
//      linhas de "Compra" de VNOM em "Transações - USA" têm exatamente as
//      mesmas 4 datas das 4 compras de STR, em quantidade STR×0,4855). A
//      posição JÁ FOI corretamente migrada pro ticker novo (VNOM) na
//      planilha - "Carteira Ações USA"/Auxiliar_ativos está CERTA, sem
//      STR e com o total de VNOM já incluindo a conversão. O bug real é
//      que 'STR' nunca saiu de Sync.gs!TICKERS_USA, então o sync diário
//      seguiu gravando "preço" (na prática, cotação congelada/desatualizada
//      de um papel já delistado) pra ela em aux_historico-patrimonio - o
//      backfill soma esse valor fantasma JUNTO com o valor real de VNOM,
//      SUPERESTIMANDO "Ações Internacionais" (e o patrimônio total) no
//      gráfico "Evolução do patrimônio" - o card do topo (live) não tem
//      esse problema, porque lê direto de Auxiliar_ativos, que nunca teve
//      linha de STR. Este teste (3) fica VERMELHO até 'STR' sair de
//      TICKERS_USA (feito em 20/09/2026) E a série ganhar um evento de
//      "fechamento" (Valor BRL = 0) pra esse ticker em
//      aux_historico-patrimonio - só parar de sincronizar congela o
//      fantasma no último preço, não soma ele para fora da série (ver
//      relatório enviado ao Tiago pra como fazer isso). O teste continua
//      VERMELHO até essa segunda parte acontecer - é o comportamento
//      esperado, não um teste quebrado. E o achado vale em geral: QUALQUER
//      ticker vendido, incorporado numa fusão/troca de nome, ou delistado
//      sem sair de TICKERS_BR/TICKERS_USA cai no mesmo bug - é para isso
//      que este teste existe.
//
// Roda só se tests/harness/fixtures.json existir (dado financeiro real,
// não commitado - ver .gitignore e README.md deste diretório). Sem
// fixture, os testes aqui são pulados (t.skip) em vez de falhar - CI e
// clones novos do repositório não têm a planilha do Tiago.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarCarteirasComDadosReais } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);

const CENTAVO = 0.011; // tolerância de arredondamento (1 centavo, com folga p/ float)

function somaCampo(lista, campo) {
  return lista.reduce((acc, item) => acc + (item[campo] || 0), 0);
}

test('Visão Geral: soma dos 4 cards (Ações/FIIs/Ações EUA/Renda Fixa) bate com patrimonioTotal (dados reais)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
    return;
  }
  const { carteirasHome } = await carregarCarteirasComDadosReais({ fixturesPath: FIXTURES_PATH });
  const somaCards = somaCampo(carteirasHome.cards, 'totalAtualizado');
  const diff = Math.abs(somaCards - carteirasHome.patrimonioTotal);
  assert.ok(
    diff <= CENTAVO,
    `soma dos 4 cards (${somaCards.toFixed(2)}) deveria bater com patrimonioTotal (${carteirasHome.patrimonioTotal}) a menos de 1 centavo de arredondamento - diff real: R$ ${diff.toFixed(2)}`
  );
});

test('Ações/FIIs/Ações EUA: distribuicaoPorGrupo soma bate com resumo.totalAtualizado da própria subpágina (dados reais)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
    return;
  }
  const { carteirasAcoes, carteirasFiis, carteirasAcoesEua } = await carregarCarteirasComDadosReais({ fixturesPath: FIXTURES_PATH });
  for (const [nome, dados] of [['Ações', carteirasAcoes], ['FIIs', carteirasFiis], ['Ações EUA', carteirasAcoesEua]]) {
    const soma = somaCampo(dados.distribuicaoPorGrupo, 'totalAtualizado');
    const diff = Math.abs(soma - dados.resumo.totalAtualizado);
    assert.ok(
      diff <= CENTAVO,
      `${nome}: soma de distribuicaoPorGrupo (${soma.toFixed(2)}) deveria bater com resumo.totalAtualizado (${dados.resumo.totalAtualizado}) a menos de 1 centavo - diff real: ${diff.toFixed(2)}`
    );
  }
});

test('Renda Fixa: distribuicaoPorIndexador soma bate com resumo.totalAtualizado (dados reais)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
    return;
  }
  const { carteirasRendaFixa } = await carregarCarteirasComDadosReais({ fixturesPath: FIXTURES_PATH });
  const soma = somaCampo(carteirasRendaFixa.distribuicaoPorIndexador, 'totalAtualizado');
  const diff = Math.abs(soma - carteirasRendaFixa.resumo.totalAtualizado);
  assert.ok(
    diff <= CENTAVO,
    `soma de distribuicaoPorIndexador (${soma.toFixed(2)}) deveria bater com resumo.totalAtualizado (${carteirasRendaFixa.resumo.totalAtualizado}) a menos de 1 centavo - diff real: ${diff.toFixed(2)}`
  );
});

// Faixa de tolerância pra diferença live (card do topo) vs backfill
// (último ponto do gráfico) - generosa o bastante pra nunca disparar só
// por causa da variação normal de preço entre "o backfill rodou" e
// "agora" (a folga de 1 dia útil de bolsa raramente move uma carteira
// diversificada mais que alguns %), mas apertada o bastante pra pegar um
// erro grosseiro de fonte errada/ticker fantasma/conversão de moeda
// dobrada. Ver comentário no topo do arquivo - isto NUNCA deveria ser 0%
// (são fontes diferentes por desenho), só limitado.
const FAIXA_PLAUSIVEL_PCT = 12;

function ultimoValido(serie, campo) {
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    if (typeof serie[i][campo] === 'number' && Number.isFinite(serie[i][campo])) return serie[i][campo];
  }
  return null;
}

test('Visão Geral/Ações/FIIs/Renda Fixa: diferença entre o card do topo (live) e o último ponto do gráfico (backfill) fica numa faixa plausível (dados reais)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
    return;
  }
  const { serie, home, carteirasAcoes, carteirasFiis, carteirasRendaFixa } = await carregarCarteirasComDadosReais({ fixturesPath: FIXTURES_PATH });

  // Ações EUA fica de fora desta comparação de propósito - ver o teste
  // dedicado de ticker fantasma abaixo, que já cobre (e explica) a causa
  // raiz específica dela (ticker STR ainda sincronizando em TICKERS_USA
  // mesmo após virar VNOM num merge - ver cabeçalho do arquivo). Comparar
  // Ações EUA aqui só duplicaria o mesmo alarme sem acrescentar
  // diagnóstico novo.
  const casos = [
    ['Visão Geral (patrimônio total)', home.patrimonio.total, ultimoValido(serie, 'patrimonio')],
    ['Ações', carteirasAcoes.resumo.totalAtualizado, ultimoValido(serie, 'acoes')],
    ['FIIs', carteirasFiis.resumo.totalAtualizado, ultimoValido(serie, 'fiis')],
    ['Renda Fixa (carteira total)', carteirasRendaFixa.resumo.totalAtualizado, ultimoValido(serie, 'rendaFixaTotal')],
  ];

  const foraDaFaixa = [];
  for (const [nome, live, backfill] of casos) {
    if (backfill == null || backfill === 0) continue;
    const diffPct = 100 * Math.abs(live - backfill) / Math.abs(backfill);
    if (diffPct > FAIXA_PLAUSIVEL_PCT) {
      foraDaFaixa.push(`${nome}: live=${live.toFixed(2)} backfill=${backfill.toFixed(2)} (${diffPct.toFixed(2)}%)`);
    }
  }

  assert.deepEqual(
    foraDaFaixa,
    [],
    `diferença live-vs-backfill maior que a faixa plausível (${FAIXA_PLAUSIVEL_PCT}%) - provável bug de fonte errada, não só timing normal de backfill: ${foraDaFaixa.join(' | ')}`
  );
});

// Achado real (ver cabeçalho do arquivo, correção de 20/09/2026): todo
// ticker que o backfill (aux_historico-patrimonio, via Sync.gs!TICKERS_BR/
// TICKERS_USA) ainda está sincronizando deveria corresponder a uma posição
// realmente viva na tabela LIVE da classe correspondente (Auxiliar_ativos)
// - senão o backfill está somando um ticker "fantasma" (vendido,
// incorporado numa fusão/troca de ticker, ou delistado sem nunca ter sido
// removido da lista de sincronização) e SUPERESTIMA o patrimônio no
// gráfico, mesmo com o card do topo (live) certo. Caso real confirmado:
// STR (Sitio Royalties) virou VNOM (Viper Energy) num merge fechado em
// 19/08/2025 - a conversão já está corretamente registrada em
// "Transações - USA" (linhas de VNOM na razão 0,4855), mas 'STR' ficou
// esquecido em TICKERS_USA até esta correção.
const TICKERS_FIIS_BR = ['BTLG11', 'GARE11', 'PMLL11', 'VGIP11', 'TRXF11', 'RECR11', 'RBRY11', 'KNUQ11', 'HGRU11', 'XPML11']; // cópia de apps-script/Sync.gs!TICKERS_FIIS_BR - manter em sincronia se a lista mudar lá

test('fonte da verdade: todo ticker comprado e nunca vendido aparece na Carteira/Auxiliar_ativos da classe correspondente (dados reais)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
    return;
  }
  const fixturesRaw = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  const { carteirasAcoes, carteirasFiis, carteirasAcoesEua, sandbox } = await carregarCarteirasComDadosReais({ fixturesPath: FIXTURES_PATH });
  // 23/09/2026: tickers que o próprio app ignora de propósito no histórico
  // (Sync.gs!TICKERS_FORA_DO_HISTORICO - hoje só STR, ver o motivo lá) não
  // são "fantasma": montarSerieHistoricoInicio_ nunca soma as linhas
  // deles. Lido do .gs de verdade (nunca uma cópia aqui).
  const foraDoHistorico = new Set(sandbox.TICKERS_FORA_DO_HISTORICO || []);

  // Ticker -> classe (BR/FII/USA), reclassificando BR contra
  // TICKERS_FIIS_BR (mesma regra de HistoricoInicio.gs, ver comentário de
  // 20/09/2026 lá) + último valor BRL conhecido, direto do fixture cru
  // (sem passar pelo código sob teste - é uma releitura independente, só
  // pra achar QUAL ticker está sobrando/faltando, já que
  // montarSerieHistoricoInicio_ só expõe a SOMA por classe, não por
  // ticker).
  const patrimonioLinhas = (fixturesRaw['aux_historico-patrimonio']?.linhas || []).slice(1);
  const classePorTicker = {};
  const ultimoValorPorTicker = {};
  // 20/09/2026 (correção real - ver caso do fechamento da STR): precisa
  // comparar por DATA da linha, não pela ORDEM em que ela aparece na
  // planilha. Uma linha de "fechamento" (fusão/venda/delisting, Valor
  // BRL=0) inserida manualmente no FIM da aba, mas com uma data mais
  // ANTIGA que linhas de sync que já existiam antes dela, não pode
  // "vencer" só por estar fisicamente por último - senão o teste dá falso
  // positivo (aconteceu de verdade: a linha de fechamento da STR foi
  // datada 19/08/2026, mas já existiam ~30 linhas de sync reais entre
  // 19/08/2026 e 18/09/2026 - sem esta comparação por data, o teste achava
  // que o último valor da STR era 0, quando na prática o backfill de
  // produção (que processa em ordem CRONOLÓGICA, não de planilha) segue
  // contando o valor de 18/09/2026 até hoje).
  const ultimaDataPorTicker = {};
  for (const linha of patrimonioLinhas) {
    const [dataCel, ticker, classeBruta, , , , , valorBrl] = linha;
    if (!ticker || valorBrl === '' || valorBrl == null) continue;
    const dataStr = dataCel && dataCel.__date__;
    if (!dataStr) continue;
    const dataAnterior = ultimaDataPorTicker[ticker];
    if (dataAnterior && dataStr <= dataAnterior) continue; // linha mais antiga que a que já temos pra esse ticker - ignora
    const classe = (classeBruta === 'BR' && TICKERS_FIIS_BR.indexOf(ticker) !== -1) ? 'FII' : classeBruta;
    classePorTicker[ticker] = classe;
    ultimoValorPorTicker[ticker] = valorBrl;
    ultimaDataPorTicker[ticker] = dataStr;
  }

  // Tickers atualmente listados nas tabelas LIVE (o que os cards de
  // Carteiras realmente somam), por classe.
  const tickersLiveAcoes = new Set(carteirasAcoes.ativos.map((a) => a.ticker));
  const tickersLiveFiis = new Set(carteirasFiis.ativos.map((a) => a.ticker));
  const tickersLiveUsa = new Set(carteirasAcoesEua.ativos.map((a) => a.ticker));
  const TICKERS_LIVE_POR_CLASSE = { BR: tickersLiveAcoes, FII: tickersLiveFiis, USA: tickersLiveUsa };
  const LABEL_POR_CLASSE = { BR: 'Ações', FII: 'FIIs', USA: 'Ações EUA' };

  // Só entra na checagem quem tem valor de verdade não-trivial no
  // backfill (> R$1) - ruído de ticker com 1 linha residual/valor
  // arredondado não deveria travar o teste.
  const fantasmas = [];
  for (const ticker of Object.keys(ultimoValorPorTicker)) {
    const classe = classePorTicker[ticker];
    const valor = ultimoValorPorTicker[ticker];
    if (!classe || !TICKERS_LIVE_POR_CLASSE[classe] || valor <= 1) continue;
    if (foraDoHistorico.has(ticker)) continue;
    if (!TICKERS_LIVE_POR_CLASSE[classe].has(ticker)) {
      fantasmas.push(`${ticker} (${LABEL_POR_CLASSE[classe]}): último valor no backfill = R$ ${valor.toFixed(2)}, ausente da tabela live`);
    }
  }

  assert.deepEqual(
    fantasmas,
    [],
    `ticker(s) com valor real no backfill mas ausente(s) da tabela live da classe (provável ticker fantasma: vendido, incorporado numa fusão/troca de ticker, ou delistado sem sair de TICKERS_BR/TICKERS_USA em Sync.gs - ver cabeçalho do arquivo pro caso do STR->VNOM já confirmado): ${fantasmas.join(' | ')}`
  );
});
