import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarCarteirasComDadosReais } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);

/**
 * Testes de COERÊNCIA AUTOMATIZADA entre hero/cards e gráficos, em TODAS
 * as telas (Início + as 4 subpáginas de Carteiras), a pedido explícito do
 * Tiago em 21/09/2026: "sempre quando rodarmos os testes, quero que voce
 * gere esses numeros, compare-os, garanta que nada esta incoerente, em
 * todas as telas e graficos. Quero isso automatizado." — formaliza em
 * teste permanente (roda toda vez que `npm test` rodar, sozinho, sem
 * precisar pedir de novo) a verificação manual que já tinha sido feita
 * uma vez por pedido dele antes (câmbio/duplicatas de
 * aux_historico-patrimonio, "V" da Renda Fixa em 23-24/03).
 *
 * Duas camadas complementares, porque as fontes por trás de cada número
 * mudam de dia pra dia:
 *
 * 1) CRUZAMENTO DE FONTES INDEPENDENTES (roda SEMPRE, não depende da data
 *    do fixture nem do dia em que os testes rodam): Home.gs!montarHome_()
 *    lê os totais por classe de "📊Dash Geral" (fórmulas da planilha);
 *    CarteirasClasses.gs/CarteirasRendaFixa.gs somam os mesmos totais
 *    direto da tabela ao vivo (Auxiliar_ativos/Carteira Renda Fixa) em
 *    código. São 2 caminhos DIFERENTES pro mesmo número — se divergem
 *    além do arredondamento normal, é bug real (fórmula desatualizada,
 *    ticker fantasma, câmbio errado etc.), não só timing.
 *
 * 2) HERO (ao vivo) vs ÚLTIMO PONTO DO GRÁFICO (backfill) — só dá pra
 *    provar IGUALDADE EXATA quando o último ponto do gráfico é de HOJE.
 *    O "empalme ao vivo" (sincronizarUltimoPontoHistoricoComAoVivo_,
 *    Home.gs) só sobrescreve o último ponto da série quando a data dele
 *    bate com o dia de hoje de verdade — em produção isso é sempre
 *    verdade (o backfill roda todo dia), mas tests/harness/fixtures.json
 *    é uma FOTO estática de um dia específico, então só bate quando os
 *    testes rodarem no MESMO dia em que o fixture foi gerado. Quando
 *    bate, prova a igualdade exata (até ~2 centavos de arredondamento
 *    duplo) em TODAS as telas de uma vez. Quando o fixture "envelhece"
 *    (testes rodando num dia depois), esta camada PULA (t.skip, não
 *    falha) em vez de acusar uma diferença de timing normal e esperada
 *    como se fosse bug — a camada 1 acima continua cobrindo esses dias
 *    normalmente, sem depender de data nenhuma.
 *
 * Pra atualizar o fixture com dados de hoje (e destravar a camada 2):
 * ver tests/harness/README.md.
 */

const CENTAVO = 0.011; // 1 centavo de folga p/ arredondamento (mesma tolerância de carteiras-real.test.js)
const DUAS_FONTES = 0.02; // 2 pipelines/arredondamentos independentes pro mesmo número (mesma moeda) — até 2 centavos de folga
const DUAS_FONTES_CAMBIO = 0.05; // idem, mas com 1 conversão USD->BRL no meio (câmbio arredondado de 1 lado) — até 5 centavos de folga

function diffMsg(nome, a, b, diff) {
  return `${nome}: ${a} vs ${b} (diferença R$ ${diff.toFixed(4)})`;
}

// Ações EUA é o único caso que precisa de conversão antes de comparar:
// CarteirasClasses.gs!montarCarteiraClasse_('Ações EUA') soma a coluna
// "Total atualizado" de Auxiliar_ativos, que pra tickers USA fica em
// DÓLAR NATIVO (o front-end, carteiras-acoes-eua.js, é quem multiplica
// por `dados.benchmarks.dolar` pra mostrar o equivalente em R$ ao lado -
// ver `equivalenteBrlHtml_`/`formatComConversao` lá). Já
// home.patrimonio.porClasse.acoesEua (📊Dash Geral!I19) e o campo
// `acoesEua` do gráfico (aux_historico-patrimonio, coluna "Valor BRL" -
// a mesma coluna do reparo de câmbio feito nesta sessão) já vêm
// convertidos pra REAL. `home.cambio.usd` é a MESMA cotação que
// `dados.benchmarks.dolar` reaproveita (CarteirasClasses.gs linha 125),
// então dá pra converter aqui sem introduzir uma 3ª fonte de câmbio.
function acoesEuaEmBrl_(carteirasAcoesEua, home) {
  var cambio = home.cambio && home.cambio.usd;
  if (typeof cambio !== 'number') return null;
  return carteirasAcoesEua.resumo.totalAtualizado * cambio;
}

test('Cruzamento de fontes independentes: card do Home (📊Dash Geral) bate com o resumo da própria subpágina de Carteiras, por classe (dados reais)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
    return;
  }
  const { home, carteirasAcoes, carteirasFiis, carteirasAcoesEua, carteirasRendaFixa } =
    await carregarCarteirasComDadosReais({ fixturesPath: FIXTURES_PATH });

  const casos = [
    ['Ações', home.patrimonio.porClasse.acoes, carteirasAcoes.resumo.totalAtualizado, DUAS_FONTES],
    ['FIIs', home.patrimonio.porClasse.fiis, carteirasFiis.resumo.totalAtualizado, DUAS_FONTES],
    ['Ações EUA (convertido p/ R$ pelo câmbio do Home)', home.patrimonio.porClasse.acoesEua, acoesEuaEmBrl_(carteirasAcoesEua, home), DUAS_FONTES_CAMBIO],
    ['Renda Fixa', home.patrimonio.porClasse.rendaFixa, carteirasRendaFixa.resumo.totalAtualizado, DUAS_FONTES],
  ];

  const incoerentes = [];
  for (const [nome, viaHome, viaCarteira, tolerancia] of casos) {
    if (typeof viaHome !== 'number' || typeof viaCarteira !== 'number') {
      incoerentes.push(`${nome}: valor ausente ou não-numérico (home=${viaHome}, carteira=${viaCarteira})`);
      continue;
    }
    const diff = Math.abs(viaHome - viaCarteira);
    if (diff > tolerancia) {
      incoerentes.push(diffMsg(nome, viaHome.toFixed(2), viaCarteira.toFixed(2), diff));
    }
  }

  assert.deepEqual(
    incoerentes,
    [],
    `card do Home e resumo da própria Carteira deveriam bater (são 2 fontes independentes pro mesmo número) - diferença real além do arredondamento esperado: ${incoerentes.join(' | ')}`
  );
});

test('Hero (ao vivo) vs último ponto do gráfico: Início + as 4 Carteiras batem exatamente quando o backfill já tem o dia de hoje (dados reais)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
    return;
  }
  const { serie, home, sandbox, carteirasAcoes, carteirasFiis, carteirasAcoesEua, carteirasRendaFixa } =
    await carregarCarteirasComDadosReais({ fixturesPath: FIXTURES_PATH });

  const ultimo = serie[serie.length - 1];
  const chaveHoje = sandbox.chaveDiaISOInicio_(new Date());
  if (!ultimo || ultimo.data !== chaveHoje) {
    t.skip(
      `fixture não tem hoje (${chaveHoje}) como último ponto do gráfico (último ponto real do fixture: ${ultimo ? ultimo.data : 'nenhum'}) - ` +
      'o empalme ao vivo (sincronizarUltimoPontoHistoricoComAoVivo_) só se aplica no dia exato do backfill mais recente, então a prova de ' +
      'igualdade exata não é aplicável hoje (gere um fixture novo pra destravar esta camada - ver tests/harness/README.md); o cruzamento de ' +
      'fontes independentes do teste anterior continua rodando normalmente, sem depender de data'
    );
    return;
  }

  // aplica o MESMO empalme que handleHome() aplica em produção (ver
  // gas-vm-harness.mjs - carregarCarteirasComDadosReais não chama
  // handleHome, então isso replica manualmente o comportamento real do
  // endpoint action=home antes de comparar)
  sandbox.sincronizarUltimoPontoHistoricoComAoVivo_(serie, home);

  const casos = [
    ['Início: patrimônio total', ultimo.patrimonio, home.patrimonio.total, DUAS_FONTES],
    ['Início: longo prazo', ultimo.longoPrazo, home.patrimonio.longoPrazo, DUAS_FONTES],
    ['Início: nacional', ultimo.nacional, home.patrimonio.nacional, DUAS_FONTES],
    ['Início: renda emergencial', ultimo.rendaEmergencial, home.patrimonio.rendaEmergencial, DUAS_FONTES],
    ['Início: índice Ibovespa', ultimo.ibovespa, home.indices.ibovespa && home.indices.ibovespa.valor, DUAS_FONTES],
    ['Início: índice IFIX', ultimo.ifix, home.indices.ifix && home.indices.ifix.valor, DUAS_FONTES],
    ['Início: índice S&P 500', ultimo.sp500, home.indices.spx && home.indices.spx.valor, DUAS_FONTES],
    ['Carteira Ações: gráfico vs hero da própria tela', ultimo.acoes, carteirasAcoes.resumo.totalAtualizado, DUAS_FONTES],
    ['Carteira FIIs: gráfico vs hero da própria tela', ultimo.fiis, carteirasFiis.resumo.totalAtualizado, DUAS_FONTES],
    ['Carteira Ações EUA: gráfico vs hero da própria tela (convertido p/ R$ pelo câmbio do Home)', ultimo.acoesEua, acoesEuaEmBrl_(carteirasAcoesEua, home), DUAS_FONTES_CAMBIO],
    ['Carteira Renda Fixa: gráfico vs hero da própria tela', ultimo.rendaFixaTotal, carteirasRendaFixa.resumo.totalAtualizado, DUAS_FONTES],
  ];

  const incoerentes = [];
  for (const [nome, valorGrafico, valorHero, tolerancia] of casos) {
    if (typeof valorGrafico !== 'number' || typeof valorHero !== 'number') {
      incoerentes.push(`${nome}: valor ausente ou não-numérico (gráfico=${valorGrafico}, hero=${valorHero})`);
      continue;
    }
    const diff = Math.abs(valorGrafico - valorHero);
    if (diff > tolerancia) {
      incoerentes.push(diffMsg(nome, valorGrafico.toFixed(2), valorHero.toFixed(2), diff));
    }
  }

  assert.deepEqual(
    incoerentes,
    [],
    `hero e último ponto do gráfico deveriam bater exatamente hoje (empalme ao vivo já aplicado) - incoerência real: ${incoerentes.join(' | ')}`
  );
});
