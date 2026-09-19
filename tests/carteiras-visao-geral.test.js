// Unit tests for assets/js/pages/carteiras-visao-geral.js. Mesmo padrão
// de tests/carteiras-acoes.test.js, mais os pedaços específicos desta
// página: reaproveita renderGraficoRentabilidade/renderDistribuicao de
// inicio.js (de verdade, não mockadas - queremos garantir que a
// integração funciona), soma 2 chamadas em paralelo (carteirasHome +
// home), atualiza os badges % da sidebar, e desenha o gráfico de
// Evolução do patrimônio (o único código novo desta página).
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
    <span id="sidePct-acoes"></span>
    <span id="sidePct-fiis"></span>
    <span id="sidePct-acoes-eua"></span>
    <span id="sidePct-renda-fixa"></span>

    <div class="carteiras-loading" id="vgLoading"></div>
    <div class="carteiras-erro" id="vgErro" hidden></div>
    <div id="vgConteudo" hidden>
      <div id="refreshControlVisaoGeral" class="refresh-control"></div>
      <div class="avisos-banner" id="vgAvisos" hidden></div>
      <div id="vgPatrimonioTotal">—</div>
      <div id="vgInfoRentabilidade"></div>
      <div id="vgDonut"></div>
      <div id="vgEvolucaoChart"></div>
      <div class="filter-tabs" id="vgPeriodoTabs">
        <button class="filter-tab" type="button" data-periodo="30d">30 dias</button>
        <button class="filter-tab active" type="button" data-periodo="12m">12 meses</button>
        <button class="filter-tab" type="button" data-periodo="tudo">Desde o início</button>
      </div>
      <div id="vgRentabChart"></div>
      <div class="chart-legend2" id="vgRentabLegenda"></div>
      <div id="vgCardsGrid"></div>
    </div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRAS_HOME_EXEMPLO = {
  patrimonioTotal: 148234.71,
  cards: [
    { nome: 'Ações', totalAtualizado: 29968.4, percentualDoPatrimonio: 0.2022, totalInvestido: 25657.39, lucroPrejuizo: 4311.01, rentabilidade: 0.168, quantidadeAtivos: 14 },
    { nome: 'FIIs', totalAtualizado: 35577.49, percentualDoPatrimonio: 0.24, totalInvestido: 39071.39, lucroPrejuizo: -3493.9, rentabilidade: -0.0894, quantidadeAtivos: 10 },
    {
      nome: 'Ações Internacionais', totalAtualizado: 16988.1, percentualDoPatrimonio: 0.1146, totalInvestido: 15435.49, lucroPrejuizo: 1552.61, rentabilidade: 0.1006, quantidadeAtivos: 1,
      totalAtualizadoUsd: 3303.79, totalInvestidoUsd: 3001.85, lucroPrejuizoUsd: 301.94, cambioUsd: 5.142,
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
};

test('montarPaginaCarteirasVisaoGeral() renderiza hero/donut/cards/gráficos e esconde o loading no sucesso', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasHomeImpl = async () => ({ ok: true, carteiras: CARTEIRAS_HOME_EXEMPLO });
    const getHomeImpl = async () => HOME_EXEMPLO;

    await montarPaginaCarteirasVisaoGeral('token-fake', { doc, getCarteirasHomeImpl, getHomeImpl });

    assert.equal(doc.getElementById('vgLoading').hidden, true);
    assert.equal(doc.getElementById('vgConteudo').hidden, false);
    assert.equal(doc.getElementById('vgErro').hidden, true);
    assert.equal(doc.getElementById('vgAvisos').hidden, true);

    assert.match(doc.getElementById('vgPatrimonioTotal').textContent, /148\.234,71/);
    assert.equal(doc.querySelectorAll('#vgDonut .distrib-item').length, 4);
    assert.equal(doc.querySelectorAll('#vgCardsGrid .cg-card').length, 4);
    assert.ok(doc.getElementById('vgEvolucaoChart').querySelector('svg'));
    assert.ok(doc.getElementById('vgEvolucaoChart').querySelector('path'));
    assert.ok(doc.getElementById('vgRentabChart').querySelector('svg'));
    assert.equal(doc.querySelectorAll('#vgRentabLegenda .li').length, 3); // Portfólio + Ibovespa + CDI

    // badges da sidebar preenchidos a partir dos mesmos cards
    assert.equal(doc.getElementById('sidePct-acoes').textContent, '20%');
    assert.equal(doc.getElementById('sidePct-renda-fixa').textContent, '44%');
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

test('montarPaginaCarteirasVisaoGeral(): trocar o período redesenha os 2 gráficos sem lançar', () => {
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
  });
});

test('montarPaginaCarteirasVisaoGeral(): quando getHome() falha, mostra avisos mas mantém os cards (que só dependem de carteirasHome)', () => {
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
