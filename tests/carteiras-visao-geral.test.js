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

// 06/10/2026 (Onda 3): DOM mínimo com os ids reais da seção "Visão geral" de carteiras/index.html; o cabeçalho (abas) é do router.
function makeDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <header id="carteirasCabecalho"><div class="pagina-abas"><button class="tab" type="button" data-tab="acoes"></button></div><div id="refreshControlVisaoGeral" class="refresh-control"></div></header>
    <div class="cart-esq" id="vgLoading" aria-hidden="true"></div>
    <div id="vgErro" hidden></div>
    <div id="vgConteudo" hidden>
      <div id="vgAvisos" class="avisos-banner" role="status" hidden></div>
      <div id="vgResumo"></div>
      <div id="vgBenchmarks" class="cc-benchmarks"></div>
      <div class="vg-topo">
        <section class="card vg-composicao"><div id="vgDonut" class="cc-distribuicao"></div></section>
        <div class="vg-cards" id="vgCardsGrid"></div>
      </div>
      <div id="vgGraficos" class="cc-graficos"></div>
      <div id="vgMetaRenda" class="vg-meta-renda" hidden></div>
      <div id="vgProventosWrap"></div>
    </div>
  </body></html>`);
  // movimento reduzido: os números dos KPIs saem finais (sem animação a partir de 0)
  dom.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  return dom.window.document;
}

const CARTEIRAS_HOME_EXEMPLO = {
  patrimonioTotal: 148234.71,
  benchmarks: { cdi: 0.1075 },
  cards: [
    {
      nome: 'Ações', totalAtualizado: 29968.4, percentualDoPatrimonio: 0.2022, totalInvestido: 25657.39, lucroPrejuizo: 4311.01, rentabilidade: 0.168, quantidadeAtivos: 14,
      comprar: 3, aguardar: 11,
      // 19/09/2026 #3: ibovespa/ifix/spx viraram variação do dia (% em
      // pontos, não o valor em pontos do índice) - fiel ao mockup.
      benchmarks: { ibovespa: -0.41, cdi: 0.1075 },
    },
    {
      nome: 'FIIs', totalAtualizado: 35577.49, percentualDoPatrimonio: 0.24, totalInvestido: 39071.39, lucroPrejuizo: -3493.9, rentabilidade: -0.0894, quantidadeAtivos: 10, comprar: 4, aguardar: 6,
      benchmarks: { ifix: 0.18, ibovespa: -0.41, cdi: 0.1075 },
    },
    {
      nome: 'Ações Internacionais', totalAtualizado: 16988.1, percentualDoPatrimonio: 0.1146, totalInvestido: 15435.49, lucroPrejuizo: 1552.61, rentabilidade: 0.1006, quantidadeAtivos: 1,
      totalAtualizadoUsd: 3303.79, totalInvestidoUsd: 3001.85, lucroPrejuizoUsd: 301.94, cambioUsd: 5.142, comprar: 1, aguardar: 0,
      benchmarks: { spx: 0.72, ibovespa: -0.41 },
    },
    {
      nome: 'Renda Fixa', totalAtualizado: 65700.72, percentualDoPatrimonio: 0.4432, totalInvestido: 54900.56, lucroPrejuizo: 10800.16, rentabilidade: 0.1967, quantidadeAtivos: 9,
      benchmarks: { cdi: 0.1075, selic: 0.1090, ipca: 0.045 },
    },
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

    // 06/10/2026 (kit): o resumo é uma grade de KPIs - Patrimônio em carteiras (com o valor aplicado embaixo), Resultado desde o início
    // (com a rentabilidade) e Proventos no mês. Os números vêm de calcularResumoRentabilidade (inicio.js, periodoId:'tudo'), a MESMA
    // conta TWR já validada contra o Gorila: ganhoReais=11.700 (valor bruto final 148.200 − base 135.000 − fluxo acumulado 1.500),
    // investido = valorAtual(148.234,71) − 11.700 = 136.534,71, rentabilidade ≈ +8,64% (TWR composto).
    const resumo = doc.getElementById('vgResumo');
    assert.ok(resumo.classList.contains('grid-kpi'));
    const kpis = [...resumo.querySelectorAll('.card-kpi')];
    assert.equal(kpis[0].querySelector('.chart-kpi-rot').textContent, 'Patrimônio em carteiras');
    assert.match(kpis[0].querySelector('.chart-kpi-val').textContent, /148\.234,71/);
    const resumoTexto = resumo.textContent;
    assert.match(resumoTexto, /Valor aplicado/);
    assert.match(resumoTexto, /136\.534,71/);
    assert.match(resumoTexto, /Resultado desde o início/);
    assert.match(resumoTexto, /\+R\$\s*11\.700,00/);
    assert.match(resumoTexto, /\+8,6\d%/);
    assert.ok(kpis[1].querySelector('.chart-kpi-delta.is-up'));
    const chipsBenchmark = doc.querySelectorAll('#vgBenchmarks .cc-benchmark-chip');
    assert.equal(chipsBenchmark.length, 2); // Ibovespa hoje + CDI a.a.
    assert.match(doc.getElementById('vgBenchmarks').textContent, /Ibovespa hoje/);
    assert.match(doc.getElementById('vgBenchmarks').textContent, /CDI/);

    // composição: anel da biblioteca (charts/anel.js) com a legenda dele
    assert.ok(doc.querySelector('#vgDonut .chart--anel svg'));
    assert.equal(doc.querySelectorAll('#vgDonut .chart-leg-item').length, 4);

    assert.equal(doc.querySelectorAll('#vgCardsGrid .vg-card').length, 4);

    // 19/09/2026 #2 (correção do Tiago: cada carteira tem seus próprios
    // índices, não o Ibovespa/CDI globais repetidos nos 4) - confere o
    // rodapé de benchmarks de CADA card contra a lista específica da
    // classe (mesma que CarteirasHome.gs manda em card.benchmarks).
    const cardsPorNome = {};
    doc.querySelectorAll('#vgCardsGrid .vg-card').forEach((card) => {
      cardsPorNome[card.querySelector('.vg-card-nome').textContent] = card;
    });

    // 19/09/2026 #3: valores agora são variação do dia (%), coloridos
    // verde/vermelho (bad quando negativo) - CDI/Selic/IPCA continuam
    // sem cor (taxa de referência, não "ganho/perda do dia").
    const cardAcoesEl = cardsPorNome['Ações'];
    const bmAcoes = cardAcoesEl.querySelector('.vg-card-bm').textContent;
    assert.match(bmAcoes, /Ibovespa/);
    assert.match(bmAcoes, /\u22120,41%/);
    assert.match(bmAcoes, /CDI/);
    assert.doesNotMatch(bmAcoes, /IFIX|S&P|Selic|IPCA/);
    assert.ok(cardAcoesEl.querySelector('.vg-card-bm b.bad')); // Ibovespa negativo hoje

    const cardFiisEl = cardsPorNome['FIIs'];
    const bmFiis = cardFiisEl.querySelector('.vg-card-bm').textContent;
    assert.match(bmFiis, /IFIX/);
    assert.match(bmFiis, /\+0,18%/);
    assert.match(bmFiis, /Ibovespa/);
    assert.match(bmFiis, /CDI/);
    assert.ok(cardFiisEl.querySelector('.vg-card-bm b.good')); // IFIX positivo hoje
    assert.ok(cardFiisEl.querySelector('.vg-card-bm b.bad')); // Ibovespa negativo hoje

    const bmAcoesEua = cardsPorNome['Ações Internacionais'].querySelector('.vg-card-bm').textContent;
    assert.match(bmAcoesEua, /S&P 500/);
    assert.match(bmAcoesEua, /\+0,72%/);
    assert.match(bmAcoesEua, /Ibovespa/);
    assert.doesNotMatch(bmAcoesEua, /CDI|IFIX|Selic|IPCA/);

    const bmRendaFixa = cardsPorNome['Renda Fixa'].querySelector('.vg-card-bm').textContent;
    assert.match(bmRendaFixa, /CDI/);
    assert.match(bmRendaFixa, /Selic/);
    assert.match(bmRendaFixa, /IPCA/);
    assert.doesNotMatch(bmRendaFixa, /Ibovespa|IFIX|S&P/);

    // Gráficos (06/10/2026): da biblioteca (charts/) via criarGraficosCarteira, no #vgGraficos - Rentabilidade acumulada (Portfólio +
    // Ibovespa + CDI + IPCA) e Evolução do patrimônio (Portfólio + Valor aplicado), com o seletor de período canônico.
    const graficos = doc.getElementById('vgGraficos');
    assert.ok(graficos.querySelector('.cg-painel-evolucao .chart--linha svg'));
    const legendaEvolucao = graficos.querySelector('.cg-painel-evolucao .chart-legenda');
    assert.equal(legendaEvolucao.querySelectorAll('.chart-leg-item').length, 2);
    assert.match(legendaEvolucao.textContent, /Portfólio/);
    assert.match(legendaEvolucao.textContent, /Valor aplicado/);
    assert.ok(graficos.querySelector('.cg-painel-rentabilidade .chart--linha svg'));
    // 02/10/2026 (pedido D): + IPCA no Patrimônio total de Carteiras
    const legendaRentab = graficos.querySelector('.cg-painel-rentabilidade .chart-legenda');
    assert.equal(legendaRentab.querySelectorAll('.chart-leg-item').length, 4); // Portfólio + Ibovespa + CDI + IPCA
    assert.match(legendaRentab.textContent, /IPCA/);
    assert.match(graficos.querySelector('.cg-painel-rentabilidade .chart-card-val').textContent, /R\$/);
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

    const cards = doc.querySelectorAll('#vgCardsGrid .vg-card');
    const cardAcoes = Array.from(cards).find((c) => c.textContent.includes('Ações') && !c.textContent.includes('Internacionais'));
    assert.ok(cardAcoes);
    assert.ok(cardAcoes.querySelector('.vg-card-rentab .var.sobe'), 'deveria ter a rentabilidade com seta e cor');
    assert.match(cardAcoes.querySelector('.vg-card-rentab').textContent, /16,8%|16,80%/);
    assert.ok(cardAcoes.querySelector('.cc-vies'), 'deveria ter a barra comprar/aguardar');
    assert.match(cardAcoes.querySelector('.vg-card-vies-legenda').textContent, /3 comprar/);
    assert.match(cardAcoes.querySelector('.vg-card-vies-legenda').textContent, /11 aguardar/);
    assert.ok(cardAcoes.querySelector('.vg-card-ver'));
  });
});

test('montarPaginaCarteirasVisaoGeral(): card de Renda Fixa (sem Vies) desenha uma faixa neutra (cinza, sem legenda comprar/aguardar)', () => {
  // 19/09/2026 #3 (pedido do Tiago pós-teste): Renda Fixa não tem Vies
  // mesmo, mas ganhou uma faixa CINZA (sem proporção/legenda) só pra
  // manter o mesmo ritmo visual dos outros 3 cards - antes este teste
  // checava que NÃO tinha faixa nenhuma; agora checa que tem a faixa
  // neutra e não a colorida (comprar/aguardar).
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    const cards = doc.querySelectorAll('#vgCardsGrid .vg-card');
    const cardRf = Array.from(cards).find((c) => c.textContent.includes('Renda Fixa'));
    assert.ok(cardRf);
    assert.ok(cardRf.querySelector('.vg-card-rentab'));
    assert.equal(cardRf.querySelector('.cc-vies .comprar'), null, 'sem viés: nada de faixa comprar/aguardar');
    assert.equal(cardRf.querySelector('.vg-card-vies-legenda'), null);
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

    const cards = doc.querySelectorAll('#vgCardsGrid .vg-card');
    const cardEua = Array.from(cards).find((c) => c.textContent.includes('Ações Internacionais'));
    assert.ok(cardEua);
    assert.match(cardEua.textContent, /US\$\s3\.303,79/);
  });
});

test('montarPaginaCarteirasVisaoGeral(): clicar num card leva pra aba da classe correspondente', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    let cliqueAba = 0;
    doc.querySelector('.pagina-abas [data-tab="acoes"]').addEventListener('click', () => { cliqueAba += 1; });

    await montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: async () => HOME_EXEMPLO,
    });

    const cardAcoes = Array.from(doc.querySelectorAll('#vgCardsGrid .vg-card')).find((c) => c.dataset.irPara === 'acoes');
    cardAcoes.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    assert.equal(cliqueAba, 1, 'o clique no card aciona a aba da classe no cabeçalho');
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

    const botao30d = doc.querySelector('#vgGraficos .cg-periodo [data-periodo="30d"]');
    assert.doesNotThrow(() => botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true })));

    assert.equal(botao30d.getAttribute('aria-pressed'), 'true');
    assert.ok(doc.querySelector('#vgGraficos .cg-painel-evolucao .chart--linha svg'));
    assert.ok(doc.querySelector('#vgGraficos .cg-painel-rentabilidade .chart--linha svg'));
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

    const botao30d = doc.querySelector('#vgGraficos .cg-periodo [data-periodo="30d"]');
    const botao12m = doc.querySelector('#vgGraficos .cg-periodo [data-periodo="12m"]');
    assert.doesNotThrow(() => {
      botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
      botao12m.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
      botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    });
    assert.equal(doc.querySelectorAll('#vgGraficos .cg-painel-evolucao .chart--linha svg').length, 1);
    assert.equal(doc.querySelectorAll('#vgGraficos .cg-periodo').length, 1);
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
    assert.equal(doc.querySelectorAll('#vgCardsGrid .vg-card').length, 4);
    // Sem `home`, calcularResumoRentabilidade (que precisa de historico)
    // não roda - renderHeroStats_ cai pro fallback (soma de
    // card.totalInvestido/lucroPrejuizo, ver comentário na função) -
    // pior que o cálculo "desde o início" de verdade, mas melhor que
    // mostrar nada.
    const resumoTexto = doc.getElementById('vgResumo').textContent;
    assert.match(resumoTexto, /135\.064,83/); // soma dos 4 totalInvestido dos cards
    assert.match(resumoTexto, /Resultado desde o início/);
    assert.match(resumoTexto, /\+R\$\s*13\.169,88/); // soma dos 4 lucroPrejuizo dos cards
    // Sem home, o benchmark "Ibovespa hoje" (hero E cada card) cai pro
    // placeholder "—", mas o chip de CDI (que só depende de
    // carteirasHome) continua nos dois lugares.
    assert.match(doc.getElementById('vgBenchmarks').textContent, /CDI/);
    assert.match(doc.getElementById('vgBenchmarks').textContent, /—/);
    // Os benchmarks POR CARD vêm inteiramente de carteirasHome
    // (card.benchmarks), então não dependem de getHome() - mesmo com
    // getHome() falhando, o card de Ações mostra os valores reais da
    // fixture (Ibovespa e CDI), não "—".
    const primeiroCard = doc.querySelector('#vgCardsGrid .vg-card');
    assert.match(primeiroCard.querySelector('.vg-card-bm').textContent, /Ibovespa/);
    assert.match(primeiroCard.querySelector('.vg-card-bm').textContent, /\u22120,41%/);
    assert.match(primeiroCard.querySelector('.vg-card-bm').textContent, /CDI/);
    assert.match(primeiroCard.querySelector('.vg-card-bm').textContent, /\+10,75%/);
    assert.doesNotMatch(primeiroCard.querySelector('.vg-card-bm').textContent, /—/);
    assert.equal(doc.querySelector('#vgGraficos .chart--linha'), null);
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

// 02/10/2026: card da meta de renda passiva (metas-card.js) na Visão geral,
// carregado em paralelo; sem meta, só o convite discreto; erro, nada.
const RESPOSTA_METAS = {
  ok: true, hoje: '2026-10-02', arquivadas: [],
  ativos: [{ id: 'AAAA11', ref: 'AAAA11', nome: 'AAAA11', classe: 'fiis', valorBRL: 10000 }],
  cambio: {}, referencias: { rendaPassiva: { media12m: 100 } },
  proventos12m: { porTicker: { AAAA11: 1200 } },
  metas: [{ id: 'm9', tipo: 'rendaPassiva', nome: 'Renda Inventada', dataAlvo: '2036-10', especificos: { rendaMensal: 500, dyAnual: 0.1 }, vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'total' }], exibirNaCarteira: true, status: 'ativa' }],
};

async function montarComMeta(respostaMetas) {
  const { carregarMetasParaCard } = await import('../assets/js/metas-card.js');
  const doc = makeDom();
  let liberar;
  const segurar = new Promise((r) => { liberar = r; });
  const chamadas = [];
  await withFakeSessionStorage(() => montarPaginaCarteirasVisaoGeral('token-fake', {
    doc,
    getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
    getHomeImpl: async () => HOME_EXEMPLO,
    carregarMetasImpl: (token, opcoes) => {
      chamadas.push(token);
      return carregarMetasParaCard(token, { ...opcoes, getMetasImpl: async () => { await segurar; return typeof respostaMetas === 'function' ? respostaMetas() : JSON.parse(JSON.stringify(respostaMetas)); } });
    },
  }));
  return { doc, chamadas, liberar };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

test('montarPaginaCarteirasVisaoGeral(): card da meta de renda passiva chega em paralelo (não segura a página) e leva pro detalhe da meta', async () => {
  const { doc, chamadas, liberar } = await montarComMeta(RESPOSTA_METAS);
  // a página já desenhou com as metas ainda pendentes
  assert.equal(doc.getElementById('vgConteudo').hidden, false);
  assert.ok(doc.querySelector('#vgCardsGrid .vg-card'));
  assert.equal(doc.getElementById('vgMetaRenda').hidden, true);
  assert.deepEqual(chamadas, ['token-fake'], 'mesmo token da página');
  liberar();
  await esperar(); await esperar();
  const slot = doc.getElementById('vgMetaRenda');
  assert.equal(slot.hidden, false);
  assert.match(slot.textContent, /Renda passiva/);
  assert.match(slot.textContent, /Renda Inventada/);
  const link = slot.querySelector('a.mt-card-rp-link');
  assert.match(link.getAttribute('href'), /metas\.html#meta=m9$/);
});

test('montarPaginaCarteirasVisaoGeral(): sem meta de renda passiva só um convite discreto; erro no GET de metas não mostra nada', async () => {
  const semMeta = await montarComMeta({ ...RESPOSTA_METAS, metas: [] });
  semMeta.liberar();
  await esperar(); await esperar();
  const slot = semMeta.doc.getElementById('vgMetaRenda');
  assert.equal(slot.hidden, false);
  assert.equal(slot.querySelector('.mt-card-rp'), null);
  const convite = slot.querySelector('a');
  assert.match(convite.textContent, /Criar meta de renda passiva/);
  assert.match(convite.getAttribute('href'), /metas\.html$/);

  const erro = await montarComMeta({ ok: false, erro: 'Ação desconhecida: metas' });
  erro.liberar();
  await esperar(); await esperar();
  assert.equal(erro.doc.getElementById('vgMetaRenda').hidden, true);
  assert.equal(erro.doc.getElementById('vgMetaRenda').innerHTML, '');
});

// 05/10/2026 (A-41): os cards pintam com carteirasHome; resultado e gráficos, quando o home chega
test('montarPaginaCarteirasVisaoGeral(): cards pintam sem esperar o getHome (resultado e gráficos em "carregando") e completam quando ele chega', () => {
  return withFakeSessionStorage(async () => {
    const doc = makeDom();
    let resolverHome;
    const montagem = montarPaginaCarteirasVisaoGeral('token-fake', {
      doc,
      getCarteirasHomeImpl: async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO }),
      getHomeImpl: () => new Promise((resolve) => { resolverHome = resolve; }),
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(doc.getElementById('vgConteudo').hidden, false);
    assert.equal(doc.querySelectorAll('#vgCardsGrid .vg-card').length, 4);
    assert.match(doc.getElementById('vgResumo').textContent, /Calculando/);
    assert.equal(doc.querySelectorAll('#vgGraficos .chart-card[data-estado="carregando"]').length, 2, 'gráficos em "carregando"');
    resolverHome(HOME_EXEMPLO);
    await montagem;
    assert.doesNotMatch(doc.getElementById('vgResumo').textContent, /Calculando/);
    assert.match(doc.getElementById('vgResumo').textContent, /Valor aplicado/);
    assert.ok(doc.querySelector('#vgGraficos .cg-painel-rentabilidade .chart--linha svg'));
    assert.equal(doc.getElementById('vgAvisos').hidden, true);
  });
});
