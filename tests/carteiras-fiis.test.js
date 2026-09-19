// Unit tests for assets/js/pages/carteiras-fiis.js — mesmo molde de
// tests/carteiras-acoes.test.js. Atualizado em 19/09/2026 #3: tabela
// ganhou Status/DY/P-VP/Patrim.fundo (no lugar de "% em caixa", que
// saiu — não tinha equivalente no mockup), tooltips "i" no cabeçalho,
// ordenação por clique no cabeçalho e chips de filtro por segmento +
// busca por ticker/nome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasFiis } from '../assets/js/pages/carteiras-fiis.js';

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
    <div class="carteiras-loading" id="fiisLoading"></div>
    <div class="carteiras-erro" id="fiisErro" hidden></div>
    <div id="refreshControlFiis" class="refresh-control"></div>
    <div id="fiisConteudo" hidden></div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRA_FIIS_EXEMPLO = {
  classe: 'FIIs',
  resumo: {
    totalInvestido: 49571.39,
    totalAtualizado: 47577.49,
    lucroPrejuizo: -1993.9,
    percentualLucroPrejuizo: -0.04023,
    proventosTotais: 1580.2,
    quantidadeAtivos: 2,
  },
  distribuicaoPorGrupo: [
    { grupo: 'Logística', totalAtualizado: 35577.49, percentual: 0.7478 },
    { grupo: 'Shopping', totalAtualizado: 12000, percentual: 0.2522 },
  ],
  ativos: [
    {
      ticker: 'HGLG11', nome: 'CSHG Logística', moeda: 'R$', precoAtual: 162.5, variacaoDia: -0.003,
      quantidade: 218, precoMedio: 179.2, precoTeto: 170, vies: 'Aguardar', pvp: 0.95, descontoPvp: null,
      pl: null, descontoPl: null, grupo: 'Logística', dyPercentual: 0.08, dyValor: 13,
      totalComprado: 39071.39, totalAtualizado: 35577.49, lucroPrejuizo: -3493.9, percentualLucroPrejuizo: -0.0894,
      proventosTotais: 1180.2, liquidezDiaria: 850000, percentualEmCaixa: 0.02, patrimonio: 1200000000,
    },
    {
      ticker: 'XPML11', nome: 'XP Malls', moeda: 'R$', precoAtual: 118, variacaoDia: 0.006,
      quantidade: 100, precoMedio: 105, precoTeto: 115, vies: 'Comprar', pvp: 1.05, descontoPvp: null,
      pl: null, descontoPl: null, grupo: 'Shopping', dyPercentual: 0.09, dyValor: 10.6,
      totalComprado: 10500, totalAtualizado: 12000, lucroPrejuizo: 1500, percentualLucroPrejuizo: 0.1429,
      proventosTotais: 400, liquidezDiaria: 1200000, percentualEmCaixa: 0.01, patrimonio: 450000000,
    },
  ],
  benchmarks: { ifix: -0.39, ibovespa: 0.12, cdi: 0.1075 },
};

test('montarPaginaCarteirasFiis() renderiza resumo/benchmarks/donut/tabela com Status/DY/P-VP/Patrim.fundo e tooltips', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasFiisImpl = async () => ({ ok: true, carteira: CARTEIRA_FIIS_EXEMPLO });

    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });

    assert.equal(doc.getElementById('fiisLoading').hidden, true);
    assert.equal(doc.getElementById('fiisConteudo').hidden, false);
    // Resumo em destaque (19/09/2026 #4): 1 cartão .cc-resumo, com o
    // stat de Lucro/Prejuízo em vermelho (fixture está no prejuízo).
    assert.equal(doc.querySelectorAll('.cc-resumo').length, 1);
    assert.equal(doc.querySelectorAll('.cc-resumo-stat.bad').length, 1);
    assert.equal(doc.querySelectorAll('.cc-benchmark-chip').length, 3);
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);

    // cabeçalhos: Status/DY/P-VP/Patrim.fundo entraram, "% em caixa" saiu
    // (não tinha no mockup) - 19/09/2026 #3.
    const cabecalhos = [...doc.querySelectorAll('.cc-tabela thead th')].map((th) => th.textContent);
    assert.ok(cabecalhos.some((t) => t.includes('Status')));
    assert.ok(cabecalhos.some((t) => t.includes('DY')));
    assert.ok(cabecalhos.some((t) => t.includes('P/VP')));
    assert.ok(cabecalhos.some((t) => t.includes('Patrim. fundo')));
    assert.ok(!cabecalhos.some((t) => t.includes('% em caixa')));
    assert.ok(!cabecalhos.some((t) => t.includes('P/L')));

    // valor compacto do patrimônio do fundo (formatBRLCompacto)
    assert.match(doc.getElementById('fiisConteudo').textContent, /R\$\s1,2\sbi/);
    assert.match(doc.getElementById('fiisConteudo').textContent, /R\$\s450\smi/);

    // botões "i" de ajuda no cabeçalho (Pr.médio/Status/DY/P-VP = 4) - agora
    // via .info-alvo/.info-icon (Pointer Events), não mais <button
    // class="cc-th-info" title>, que não funcionava no toque (19/09/2026 #4).
    assert.equal(doc.querySelectorAll('.cc-tabela thead .info-alvo').length, 4);
    assert.equal(doc.querySelectorAll('.cc-th-info').length, 0);
    assert.ok(doc.body.querySelector('.info-tooltip'), 'wirePointerTooltipCarteiras_ deveria criar a div .info-tooltip no body');

    // ordenado por padrão (totalAtualizado desc): HGLG11 (35577,49) antes de XPML11 (12000)
    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.match(linhas[0].textContent, /HGLG11/);
    assert.match(linhas[1].textContent, /XPML11/);

    // linha de totais no rodapé, somando os 2 ativos
    const totalRow = doc.querySelector('.cc-tabela tfoot tr');
    assert.ok(totalRow, 'deveria ter uma linha de totais no tfoot');
    assert.match(totalRow.textContent, /Total \(2 ativos\)/);
    assert.match(totalRow.textContent, /47\.577,49/);

    // chips de segmento (Todos + Logística + Shopping) - dinâmicos, vêm de distribuicaoPorGrupo
    const chips = [...doc.querySelectorAll('.cc-filtro-chips .filter-tab')].map((b) => b.textContent);
    assert.deepEqual(chips, ['Todos', 'Logística', 'Shopping']);

    // caixa de busca presente
    assert.ok(doc.querySelector('.cc-busca-input'));

    // 19/09/2026 #4: só a célula (<td>) da coluna Ativo fica alinhada à
    // esquerda - o resto centraliza por padrão (CSS), e não sobra nenhuma
    // célula com a classe antiga .right.
    const tdAtivo = doc.querySelector('.cc-tabela tbody tr td');
    assert.ok(tdAtivo.classList.contains('cc-td-esquerda'));
    assert.equal(doc.querySelectorAll('.cc-tabela td.right').length, 0);
  });
});

test('montarPaginaCarteirasFiis(): clicar num chip de segmento filtra a tabela e recalcula os totais', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasFiisImpl = async () => ({ ok: true, carteira: CARTEIRA_FIIS_EXEMPLO });
    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });

    const chipShopping = [...doc.querySelectorAll('.cc-filtro-chips .filter-tab')].find((b) => b.textContent === 'Shopping');
    chipShopping.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.equal(linhas.length, 1);
    assert.match(linhas[0].textContent, /XPML11/);
    const totalRow = doc.querySelector('.cc-tabela tfoot tr');
    assert.match(totalRow.textContent, /Total \(1 ativo\)/);
    assert.match(totalRow.textContent, /12\.000,00/);
    assert.ok(chipShopping.classList.contains('active'));
  });
});

test('montarPaginaCarteirasFiis(): digitar na busca filtra por ticker', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasFiisImpl = async () => ({ ok: true, carteira: CARTEIRA_FIIS_EXEMPLO });
    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });

    const input = doc.querySelector('.cc-busca-input');
    input.value = 'hglg';
    input.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.equal(linhas.length, 1);
    assert.match(linhas[0].textContent, /HGLG11/);
  });
});

test('montarPaginaCarteirasFiis(): clicar no cabeçalho de uma coluna ordena a tabela por ela', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasFiisImpl = async () => ({ ok: true, carteira: CARTEIRA_FIIS_EXEMPLO });
    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });

    // Preço/dia: XPML11 (118) < HGLG11 (162,5) - clicar ordena asc por padrão
    const thPreco = doc.querySelector('.cc-tabela thead th[data-campo="precoAtual"]');
    thPreco.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

    let linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.match(linhas[0].textContent, /XPML11/);
    assert.match(linhas[1].textContent, /HGLG11/);
    assert.match(doc.querySelector('.cc-tabela thead th[data-campo="precoAtual"]').textContent, /▲/);

    // clicar de novo no mesmo cabeçalho inverte pra desc
    thPreco.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.match(linhas[0].textContent, /HGLG11/);
    assert.match(linhas[1].textContent, /XPML11/);
    assert.match(doc.querySelector('.cc-tabela thead th[data-campo="precoAtual"]').textContent, /▼/);
  });
});

test('montarPaginaCarteirasFiis() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasFiisImpl = async () => ({ ok: false, etapa: 'carteirasFiis', erro: 'falha ao ler Carteira FIIs' });

    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });

    assert.equal(doc.getElementById('fiisConteudo').hidden, true);
    assert.equal(doc.getElementById('fiisErro').hidden, false);
    assert.match(doc.getElementById('fiisErro').textContent, /falha ao ler Carteira FIIs/);
  });
});

test('montarPaginaCarteirasFiis(): clicar em "Atualizar dados" busca de novo', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadas = 0;
    const getCarteirasFiisImpl = async () => { chamadas += 1; return { ok: true, carteira: CARTEIRA_FIIS_EXEMPLO }; };

    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });
    doc.getElementById('refreshControlFiis').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    assert.equal(chamadas, 2);
  });
});
