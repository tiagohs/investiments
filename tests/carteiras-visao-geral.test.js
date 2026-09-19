// Unit tests for assets/js/pages/carteiras-visao-geral.js. Mesmo padrão
// de tests/carteiras-acoes.test.js, mais os pedaços específicos desta
// página: reaproveita renderDistribuicao/renderInfoRentabilidade/
// wireGraficoRentabilidade de inicio.js (de verdade, não mockadas -
// queremos garantir que a integração funciona) e
// renderBenchmarksClasseCarteiras de carteiras-classe-comum.js, soma 2
// chamadas em paralelo (carteirasHome + home), e desenha o gráfico de
// Evolução do patrimônio (o único código novo desta página, com 2
// séries - patrimônio e investido acumulado - legenda e hover/touch).
//
// 19/09/2026 (revisão pós-teste do Tiago): reescrito pra bater com o
// novo DOM - hero virou 2 cartões (#vgResumo com Investido/Lucro-
// Prejuízo/Rentabilidade + #vgBenchmarks com os chips de Ibovespa/CDI,
// no lugar da linha "Patrimônio total" duplicada; #vgInfoRentabilidade
// saiu do hero e foi pro cartão de Rentabilidade acumulada), os badges
// %  da sidebar saíram (menu lateral só mostra o título agora -
// carteiras-sidebar.js foi removido), e o gráfico de Evolução ganhou
// legenda (#vgEvolucaoLegenda) e uma 2ª linha ("quanto investi").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasVisaoGeral } from '../assets/js/pages/carteiras-visao-geral.js';

function withFakeSessionStorage(run) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  return run(store).finally(() => { delete globalThis.sessionStorage; });
}

function makeDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button class="side-item" type="button" data-page="acoes"></button>

    <div class="carteiras-loading" id="vgLoading"></div>
    <div class="carteiras-erro" id="vgErro" hidden></div>
    <div id="vgConteudo" hidden>
      <div id="refreshControlVisaoGeral" class="refresh-control"></div>
      <div class="avisos-banner" id="vgAvisos" hidden></div>

      <div class="cg-hero-grid">
        <div class="cg-hero-card">
          <div class="cg-hero-valor" id="vgPatrimonioTotal">—</div>
          <div class="cg-hero-stats" id="vgResumo"></div>
          <div id="vgBenchmarks" class="cc-benchmarks"></div>
        </div>
        <div class="cg-hero-card cg-hero-donut" id="vgDonut"></div>
      </div>

      <div class="filter-tabs" id="vgPeriodoTabs">
        <button class="filter-tab" type="button" data-periodo="30d">30 dias</button>
        <button class="filter-tab active" type="button" data-periodo="12m">12 meses</button>
        <button class="filter-tab" type="button" data-periodo="tudo">Desde o início</button>
      </div>

      <div id="vgEvolucaoChart"></div>
      <div class="chart-legend2" id="vgEvolucaoLegenda"></div>

      <div class="rentab-card-info" id="vgInfoRentabilidade"></div>
      <div id="vgRentabChart"></div>
      <div class="chart-legend2" id="vgRentabLegenda"></div>

      <div class="cg-cards-grid" id="vgCardsGrid"></div>
    </div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRAS_HOME_EXEMPLO = {
  patrimonioTotal: 148234.71,
  benchmarks: { cdi: 0.1075 },
  cards: [
    {
      nome: 'Ações', totalAtualizado: 29968.4, percentualDoPatrimonio: 0.2022, totalInvestido: 25657.39, lucroPrejuizo: 4311.01, rentabilidade: 0.168, quantidadeAtivos: 14,
      comprar: 3, aguardar: 11,
    },
    { nome: 'FIIs', totalAtualizado: 35577.49, percentualDoPatrimonio: 0.24, totalInvestido: 39071.39, lucroPrejuizo: -3493.9, rentabilidade: -0.0894, quantidadeAtivos: 10, comprar: 4, aguardar: 6 },
    {
      nome: 'Ações Internacionais', totalAtualizado: 16988.1, percentualDoPatrimonio: 0.1146, totalInvestido: 15435.49, lucroPrejuizo: 1552.61, rentabilidade: 0.1006, quantidadeAtivos: 1,
      totalAtualizadoUsd: 3303.79, totalInvestidoUsd: 3001.85, lucroPrejuizoUsd: 301.94, cambioUsd: 5.142, comprar: 1, aguardar: 0,
    },
    { nome: 'Renda Fixa', totalAtualizado: 65700.72, percentualDoPatrimonio: 0.4432, totalInvestido: 54900.56, lucroPrejuizo: 10800.16, rentabilidade: 0.1967, quantidadeAtivos: 9 },
  ],
};

function historicoExemplo() {
  const base = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-09-18'];
  return base.map((data, i) => ({
    data,
    patrimonio: 135000 + i * 4400,
    fluxoCaixaPatrimonio: i === 0 ? 0 : 500,
    ibovespa: 124000 + i * 900,
    indiceCdi: 1 + i * 0.003,
  }));
}

const HOME_EXEMPLO = {
  ok: true,
  patrimonio: { total: 148234.71, longoPrazo: 148234.71, nacional: 100000, rendaEmergencial: 20000 },
  historico: historicoExemplo(),
  indices: { ibovespa: { valor: 128500, variacaoDia: 0.85 }, ifix: { valor: 3100, variacaoDia: -0.2 }, spx: { valor: 5600, variacaoDia: 0.4 } },
};

test('montarPaginaCarteirasVisaoGeral() renderiza os 2 cartões do hero, donut, cards e gráficos, e esconde o loading no sucesso', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasHomeImpl = async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO });
    const getHomeImpl = async () => HOME_EXEMPLO;

    await montarPaginaCarteirasVisaoGeral('token-fake', { doc, getCarteirasHomeImpl, getHomeImpl });

    assert.equal(doc.getElementById('vgLoading').hidden, true);
    assert.equal(doc.getElementById('vgConteudo').hidden, false);
    assert.equal(doc.getElementById('vgErro').hidden, true);
    assert.equal(doc.getElementById('vgAvisos').hidden, true);

    // cartão 1: valor do patrimônio + resumo (Investido/Resultado desde o
    // início/Rentabilidade) + benchmarks - SEM repetir o mesmo valor 2x.
    //
    // 19/09/2026 (bug relatado pelo Tiago): o resumo NÃO soma mais
    // card.totalInvestido/lucroPrejuizo (isso é só a posição atual, sem
    // realizado/proventos - ficava muito menor que o "desde o início" de
    // verdade) - agora vem de calcularResumoRentabilidade (inicio.js,
    // periodoId:'tudo'), a MESMA conta TWR já validada contra o Gorila.
    // Com o historicoExemplo()/HOME_EXEMPLO deste arquivo (ver acima):
    // ganhoReais=11.700 (valor bruto final 148.200 − base 135.000 − fluxo
    // acumulado 1.500), investido = valorAtual(148.234,71) − 11.700 =
    // 136.534,71, rentabilidade ≈ +8,64% (TWR composto, não uma divisão
    // simples) - conferido calculando a série à mão em Python.
    assert.match(doc.getElementById('vgPatrimonioTotal').textContent, /148\.234,71/);
    const resumoTexto = doc.getElementById('vgResumo').textContent;
    assert.match(resumoTexto, /Investido/);
    assert.match(resumoTexto, /136\.534,71/);
    assert.match(resumoTexto, /Resultado \(desde o início\)/);
    assert.match(resumoTexto, /\+R\$\s*11\.700,00/);
    assert.match(resumoTexto, /Rentabilidade/);
    assert.match(resumoTexto, /\+8,6\d%/);
    const chipsBenchmark = doc.querySelectorAll('#vgBenchmarks .cc-benchmark-chip');
    assert.equal(chipsBenchmark.length, 2); // Ibovespa hoje + CDI a.a.
    assert.match(doc.getElementById('vgBenchmarks').textContent, /Ibovespa hoje/);
    assert.match(doc.getElementById('vgBenchmarks').textContent, /CDI/);

    // cartão 2: donut, num cartão SEPARADO do hero-stats (bug reportado:
    // "os 2 cards do topo deveriam estar separados").
    assert.equal(doc.querySelectorAll('#vgDonut .distrib-item').length, 4);

    assert.equal(doc.querySelectorAll('#vgCardsGrid .cg-card').length, 4);

    // 19/09/2026 (pedido do Tiago pós-teste): cada card de classe também
    // mostra o rodapé de benchmarks (mesmos 2 valores globais do hero).
    doc.querySelectorAll('#vgCardsGrid .cg-card').forEach((card) => {
      const benchmarksCard = card.querySelector('.cg-card-benchmarks');
      assert.ok(benchmarksCard, `card "${card.querySelector('.cg-card-nome').textContent}" deveria ter o rodapé de benchmarks`);
      assert.match(benchmarksCard.textContent, /Ibovespa/);
      assert.match(benchmarksCard.textContent, /CDI/);
    });

    // Evolução do patrimônio: 2 séries (patrimônio + investido) + legenda.
    const evolucaoSvg = doc.getElementById('vgEvolucaoChart').querySelector('svg');
    assert.ok(evolucaoSvg);
    assert.equal(evolucaoSvg.querySelectorAll('path').length, 3); // área + linha investido (tracejada) + linha patrimônio
    const legendaEvolucao = doc.querySelectorAll('#vgEvolucaoLegenda .li');
    assert.equal(legendaEvolucao.length, 2);
    assert.match(doc.getElementById('vgEvolucaoLegenda').textContent, /Quanto tenho hoje/);
    assert.match(doc.getElementById('vgEvolucaoLegenda').textContent, /Quanto investi/);

    // vgInfoRentabilidade agora mora junto do gráfico de Rentabilidade,
    // não duplicado no hero - e continua sendo preenchido de verdade.
    assert.notEqual(doc.getElementById('vgInfoRentabilidade').textContent.trim(), '');
    assert.ok(doc.getElementById('vgRentabChart').querySelector('svg'));
    assert.equal(doc.querySelectorAll('#vgRentabLegenda .li').length, 3); // Portfólio + Ibovespa + CDI
  });
});

test('montarPaginaCarteirasVisaoGeral(): card de Ações mostra o badge de rentabilidade e a barra comprar/aguardar (vies)', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    const cards = doc.querySelectorAll('#vgCardsGrid .cg-card');
    const cardAcoes = Array.from(cards).find((c) => c.textContent.includes('Ações') && !c.textContent.includes('Internacionais'));
    assert.ok(cardAcoes);
    assert.ok(cardAcoes.querySelector('.cg-card-rentab'), 'deveria ter o badge de rentabilidade');
    assert.match(cardAcoes.querySelector('.cg-card-rentab').textContent, /16,8%|16,80%/);
    assert.ok(cardAcoes.querySelector('.cg-card-vies-bar'), 'deveria ter a barra comprar/aguardar');
    assert.match(cardAcoes.querySelector('.cg-card-vies-legenda').textContent, /3 comprar/);
    assert.match(cardAcoes.querySelector('.cg-card-vies-legenda').textContent, /11 aguardar/);
    assert.ok(cardAcoes.querySelector('.cg-card-ver-detalhes'));
  });
});

test('montarPaginaCarteirasVisaoGeral(): card de Renda Fixa (sem Vies) não desenha a barra comprar/aguardar', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    const cards = doc.querySelectorAll('#vgCardsGrid .cg-card');
    const cardRf = Array.from(cards).find((c) => c.textContent.includes('Renda Fixa'));
    assert.ok(cardRf);
    assert.equal(cardRf.querySelector('.cg-card-vies-bar'), null);
    assert.ok(cardRf.querySelector('.cg-card-rentab'));
  });
});

test('montarPaginaCarteirasVisaoGeral(): card de Ações Internacionais mostra o sub-valor em US$', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    const cards = doc.querySelectorAll('#vgCardsGrid .cg-card');
    const cardEua = Array.from(cards).find((c) => c.textContent.includes('Ações Internacionais'));
    assert.ok(cardEua);
    assert.match(cardEua.querySelector('.cg-card-usd').textContent, /US\$ 3,303\.79/);
  });
});

test('montarPaginaCarteirasVisaoGeral(): clicar num card leva pra sidebar da classe correspondente', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    let cliqueSidebar = 0;
    doc.querySelector('.side-item[data-page="acoes"]').addEventListener('click', () => { cliqueSidebar += 1; });

    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    const cardAcoes = Array.from(doc.querySelectorAll('#vgCardsGrid .cg-card')).find((c) => c.dataset.irPara === 'acoes');
    cardAcoes.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    assert.equal(cliqueSidebar, 1);
  });
});

test('montarPaginaCarteirasVisaoGeral(): trocar o período redesenha os 2 gráficos (Evolução e Rentabilidade) sem lançar', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    const botao30d = doc.querySelector('#vgPeriodoTabs .filter-tab[data-periodo="30d"]');
    assert.doesNotThrow(() => botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true })));

    assert.equal(botao30d.classList.contains('active'), true);
    assert.ok(doc.getElementById('vgEvolucaoChart').querySelector('svg'));
    assert.ok(doc.getElementById('vgRentabChart').querySelector('svg'));
  });
});

test('montarPaginaCarteirasVisaoGeral(): trocar o período 2 vezes não dobra os listeners do gráfico de Evolução (idempotência)', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    const botao30d = doc.querySelector('#vgPeriodoTabs .filter-tab[data-periodo="30d"]');
    const botao12m = doc.querySelector('#vgPeriodoTabs .filter-tab[data-periodo="12m"]');
    assert.doesNotThrow(() => {
      botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
      botao12m.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
      botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    });
    assert.ok(doc.getElementById('vgEvolucaoChart').querySelector('svg'));
  });
});

test('montarPaginaCarteirasVisaoGeral(): quando getHome() falha, mostra avisos mas mantém os cards e o hero (que caem pro método antigo - só posição atual)', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => ({ ok: false, etapa: 'home', erro: 'timeout' }),
    });

    assert.equal(doc.getElementById('vgConteudo').hidden, false);
    assert.equal(doc.getElementById('vgAvisos').hidden, false);
    assert.equal(doc.querySelectorAll('#vgCardsGrid .cg-card').length, 4);
    // Sem `home`, calcularResumoRentabilidade (que precisa de historico)
    // não roda - renderHeroStats_ cai pro fallback (soma de
    // card.totalInvestido/lucroPrejuizo, ver comentário na função) -
    // pior que o cálculo "desde o início" de verdade, mas melhor que
    // mostrar nada.
    const resumoTexto = doc.getElementById('vgResumo').textContent;
    assert.match(resumoTexto, /135\.064,83/); // soma dos 4 totalInvestido dos cards
    assert.match(resumoTexto, /Resultado \(desde o início\)/);
    assert.match(resumoTexto, /\+R\$\s*13\.169,88/); // soma dos 4 lucroPrejuizo dos cards
    // Sem home, o benchmark "Ibovespa hoje" (hero E cada card) cai pro
    // placeholder "—", mas o chip de CDI (que só depende de
    // carteirasHome) continua nos dois lugares.
    assert.match(doc.getElementById('vgBenchmarks').textContent, /CDI/);
    assert.match(doc.getElementById('vgBenchmarks').textContent, /—/);
    const primeiroCard = doc.querySelector('#vgCardsGrid .cg-card');
    assert.match(primeiroCard.querySelector('.cg-card-benchmarks').textContent, /—/);
    assert.match(primeiroCard.querySelector('.cg-card-benchmarks').textContent, /CDI/);
    assert.equal(doc.getElementById('vgEvolucaoChart').querySelector('svg'), null);
  });
});

test('montarPaginaCarteirasVisaoGeral() mostra o estado de erro quando carteirasHome falha', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: false, etapa: 'carteirasHome', erro: 'token expirado' }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    assert.equal(doc.getElementById('vgConteudo').hidden, true);
    assert.equal(doc.getElementById('vgErro').hidden, false);
    assert.match(doc.getElementById('vgErro').textContent, /token expirado/);
  });
});

test('montarPaginaCarteirasVisaoGeral(): clicar em "Atualizar dados" busca as 2 chamadas de novo', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadasCarteiras = 0;
    let chamadasHome = 0;
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => { chamadasCarteiras += 1; return { ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }; },
      getHomeImpl: async () => { chamadasHome += 1; return HOME_EXEMPLO; },
    });

    doc.getElementById('refreshControlVisaoGeral').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    assert.equal(chamadasCarteiras, 2);
    assert.equal(chamadasHome, 2);
  });
});
