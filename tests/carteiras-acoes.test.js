// Unit tests for assets/js/pages/carteiras-acoes.js. Mesmo padrão de
// tests/distribuicoes-metas.test.js: DOM mínimo com os ids reais de
// carteiras/index.html, impls falsas em vez de fetch/token de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasAcoes } from '../assets/js/pages/carteiras-acoes.js';
import { usarMemoriaNoCacheDados } from '../assets/js/cache-dados.js';

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
    <div class="carteiras-loading" id="acoesLoading"></div>
    <div class="carteiras-erro" id="acoesErro" hidden></div>
    <div id="refreshControlAcoes" class="refresh-control"></div>
    <div id="acoesConteudo" hidden></div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRA_ACOES_EXEMPLO = {
  classe: 'Ações',
  resumo: {
    totalInvestido: 25657.39,
    totalAtualizado: 29968.4,
    lucroPrejuizo: 4311.01,
    percentualLucroPrejuizo: 0.168,
    proventosTotais: 812.5,
    quantidadeAtivos: 2,
  },
  distribuicaoPorGrupo: [
    { grupo: 'Bancos', totalAtualizado: 18000, percentual: 0.6 },
    { grupo: 'Energia', totalAtualizado: 11968.4, percentual: 0.4 },
  ],
  ativos: [
    {
      ticker: 'BBAS3', nome: 'Banco do Brasil', moeda: 'R$', precoAtual: 28.5, variacaoDia: 0.012,
      quantidade: 300, precoMedio: 24.1, precoTeto: 30, vies: 'Comprar', pvp: 0.9, descontoPvp: null,
      pl: 5.2, descontoPl: null, grupo: 'Bancos', dyPercentual: 0.09, dyValor: 2.5,
      totalComprado: 7230, totalAtualizado: 8550, lucroPrejuizo: 1320, percentualLucroPrejuizo: 0.1826, proventosTotais: 400,
    },
    {
      ticker: 'EGIE3', nome: 'Engie Brasil', moeda: 'R$', precoAtual: 42.1, variacaoDia: -0.004,
      quantidade: 500, precoMedio: 36.85, precoTeto: 40, vies: 'Aguardar', pvp: 2.1, descontoPvp: null,
      pl: 14.3, descontoPl: null, grupo: 'Energia', dyPercentual: 0.06, dyValor: 2.5,
      totalComprado: 18425, totalAtualizado: 21050, lucroPrejuizo: 2625, percentualLucroPrejuizo: 0.1425, proventosTotais: 412.5,
    },
  ],
  benchmarks: { ibovespa: -0.39, cdi: 0.134 }, // ibovespa em variação do dia (%), não pontos (19/09/2026 #2)
};

// 19/09/2026 #7: histórico diário (getHome()) que alimenta os 2 gráficos
// novos (Rentabilidade acumulada/Evolução do patrimônio) - campos
// "acoes"/"fluxoCaixaAcoes" são os que CAMPO_PRINCIPAL_POR_VISAO/
// CAMPO_FLUXO_POR_VISAO (inicio.js) mapeiam pra visaoId:"carteiraAcoes".
function historicoAcoesExemplo() {
  const base = ['2026-06-19', '2026-07-19', '2026-08-19', '2026-09-19'];
  return base.map((data, i) => ({
    data,
    acoes: 26000 + i * 1000,
    fluxoCaixaAcoes: i === 0 ? 0 : 200,
    ibovespa: 124000 + i * 900,
    indiceCdi: 1 + i * 0.003,
  }));
}
const GET_HOME_VAZIO = async () => ({ ok: true, historico: [] });

test('montarPaginaCarteirasAcoes() renderiza resumo/benchmarks/donut/tabela e esconde o loading no sucesso', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EXEMPLO });

    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl, getHomeImpl: GET_HOME_VAZIO });

    assert.equal(doc.getElementById('acoesLoading').hidden, true);
    assert.equal(doc.getElementById('acoesConteudo').hidden, false);
    assert.equal(doc.getElementById('acoesErro').hidden, true);
    // Resumo em destaque (19/09/2026 #4): 1 cartão .cc-resumo (Total
    // atualizado em destaque + Total investido embaixo) com 3 stats do
    // lado (Lucro/Prejuízo, Ativos na carteira, Proventos recebidos via
    // extras) - substituiu a grade antiga de .cc-tile.
    assert.equal(doc.querySelectorAll('.cc-resumo').length, 1);
    assert.equal(doc.querySelectorAll('.cc-resumo-stat').length, 3);
    const textoResumo = doc.getElementById('acoesResumo').textContent;
    assert.match(textoResumo, /29\.968,40/);
    assert.match(textoResumo, /Valor aplicado:\sR\$\s25\.657,39/);
    assert.match(textoResumo, /Proventos recebidos/);
    assert.equal(doc.querySelectorAll('.cc-benchmark-chip').length, 2);
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
    // ordenado por totalAtualizado desc: EGIE3 (21050) antes de BBAS3 (8550)
    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.match(linhas[0].textContent, /EGIE3/);
    assert.match(linhas[1].textContent, /BBAS3/);
    // status "Comprar"/"Aguardar" aparecem na tabela (coluna Status, com
    // o preço-teto abaixo do badge - 19/09/2026 #2: não é mais coluna
    // separada de "Preço teto")
    const htmlTabela = doc.getElementById('acoesConteudo').innerHTML;
    assert.match(htmlTabela, /Comprar/);
    assert.match(htmlTabela, /Aguardar/);
    assert.match(doc.getElementById('acoesConteudo').textContent, /teto R\$\s?30,00/);
    // cabeçalhos das colunas novas (P\/L, P\/VP, % cart.) - 19/09/2026 #2
    const cabecalhos = [...doc.querySelectorAll('.cc-tabela thead th')].map((th) => th.textContent);
    assert.ok(cabecalhos.some((t) => t.includes('P/L')));
    assert.ok(cabecalhos.some((t) => t.includes('P/VP')));
    assert.ok(cabecalhos.some((t) => t.includes('cart.')));
    assert.ok(cabecalhos.some((t) => t.includes('Status')));
    assert.ok(cabecalhos.some((t) => t.includes('DY')));
    assert.ok(!cabecalhos.some((t) => t.includes('Preço teto')));
    // logo do ativo (LOGOS_ATIVOS/fallback de iniciais) - 19/09/2026 #2
    assert.equal(doc.querySelectorAll('.cc-logo').length, 2);
    // linha de totais no rodapé (19/09/2026 #2 - "você não trouxe os totais")
    // - somada a partir da lista de ativos EXIBIDA (não de dados.resumo
    // direto), pra continuar batendo quando a busca filtra a tabela
    // (19/09/2026 #3) - por isso o valor aqui (8550+21050=29.600,00) é
    // diferente do resumo.totalAtualizado do fixture (29.968,40, testado
    // separadamente no tile "Total atualizado" acima) - a divergência
    // proposital entre os dois no fixture é o que garante que cada parte
    // está mesmo lendo a fonte certa.
    const totalRow = doc.querySelector('.cc-tabela tfoot tr');
    assert.ok(totalRow, 'deveria ter uma linha de totais no tfoot');
    assert.match(totalRow.textContent, /Total \(2 ativos\)/);
    assert.match(totalRow.textContent, /29\.600,00/);
    assert.match(totalRow.textContent, /3\.945,00/);
  });
});

test('montarPaginaCarteirasAcoes(): tooltips "i" funcionam por Pointer Events (não mais title nativo) e alinhamento da tabela (só Ativo à esquerda)', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EXEMPLO });
    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl, getHomeImpl: GET_HOME_VAZIO });

    // 19/09/2026 #4: "as tooltips não estão funcionando" - os ícones "i"
    // (cabeçalho de coluna, legenda do donut) agora usam o marcador
    // .info-alvo/.info-icon (não <button title>), com 1 <div
    // class="info-tooltip"> criado e anexado ao body pelo wiring.
    assert.ok(doc.querySelectorAll('.info-alvo').length > 0, 'deveria ter pelo menos 1 marcador .info-alvo (cabeçalho/donut)');
    assert.equal(doc.querySelectorAll('.cc-th-info').length, 0, 'não deveria sobrar nenhum ícone antigo .cc-th-info');
    assert.ok(doc.body.querySelector('.info-tooltip'), 'wirePointerTooltipCarteiras_ deveria criar a div .info-tooltip no body');

    // hover (mouse) num ícone "i" do cabeçalho mostra a tooltip
    const icone = doc.querySelector('.cc-tabela thead .info-alvo');
    assert.ok(icone, 'cabeçalho deveria ter pelo menos um ícone de ajuda');
    icone.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: 10, clientY: 10 }));
    assert.equal(doc.body.querySelector('.info-tooltip').hidden, false);

    // clicar no ícone "i" dentro do <th> ordenável NÃO deve disparar
    // ordenação (19/09/2026 #4 - guarda closest('.info-alvo') no listener
    // de clique do cabeçalho).
    const linhasAntes = [...doc.querySelectorAll('.cc-tabela tbody tr')].map((tr) => tr.textContent);
    icone.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    const linhasDepois = [...doc.querySelectorAll('.cc-tabela tbody tr')].map((tr) => tr.textContent);
    assert.deepEqual(linhasDepois, linhasAntes, 'clicar no ícone de ajuda não deveria reordenar a tabela');

    // 19/09/2026 #4: "todas as colunas, tirando o Ativo, centralize o
    // conteúdo. Em ativo, só centralize o título" - só a célula (<td>) da
    // coluna Ativo tem a classe de alinhamento à esquerda; o <th> nunca
    // tem (fica centralizado por padrão, igual as outras colunas).
    const thAtivo = doc.querySelector('.cc-tabela thead th');
    assert.ok(!thAtivo.classList.contains('cc-td-esquerda'));
    const tdAtivo = doc.querySelector('.cc-tabela tbody tr td');
    assert.ok(tdAtivo.classList.contains('cc-td-esquerda'));
    assert.equal(doc.querySelectorAll('.cc-tabela td.right').length, 0, 'não deveria sobrar nenhuma célula com a classe antiga .right');
  });
});

test('montarPaginaCarteirasAcoes() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesImpl = async () => ({ ok: false, etapa: 'carteirasAcoes', erro: 'aba não encontrada' });

    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl, getHomeImpl: GET_HOME_VAZIO });

    assert.equal(doc.getElementById('acoesLoading').hidden, true);
    assert.equal(doc.getElementById('acoesConteudo').hidden, true);
    assert.equal(doc.getElementById('acoesErro').hidden, false);
    assert.match(doc.getElementById('acoesErro').textContent, /aba não encontrada/);
  });
});

test('montarPaginaCarteirasAcoes() grava no cache no sucesso e reaproveita numa 2ª montagem (stale-while-revalidate)', async () => {
  usarMemoriaNoCacheDados(new Map()); // 25/09/2026: cache em IndexedDB no navegador; aqui, um Map
  await withFakeSessionStorage(async () => {
    const doc1 = makeDom();
    let chamadas = 0;
    const getCarteirasAcoesImpl = async () => {
      chamadas += 1;
      return { ok: true, carteira: CARTEIRA_ACOES_EXEMPLO };
    };
    await montarPaginaCarteirasAcoes('token-fake', { doc: doc1, getCarteirasAcoesImpl, getHomeImpl: GET_HOME_VAZIO });
    assert.equal(chamadas, 1);

    // "2ª visita" (documento novo, mesmo sessionStorage) - o cache da 1ª
    // chamada já deveria estar disponível ANTES do fetch fresco responder.
    const doc2 = makeDom();
    let resolverFetch;
    const getCarteirasAcoesImplLento = () => new Promise((resolve) => { resolverFetch = resolve; });

    const montagem = montarPaginaCarteirasAcoes('token-fake', { doc: doc2, getCarteirasAcoesImpl: getCarteirasAcoesImplLento, getHomeImpl: GET_HOME_VAZIO });
    // 25/09/2026: a leitura do cache é assíncrona (IndexedDB; aqui, o sessionStorage falso)
    await new Promise((r) => setTimeout(r, 0));

    // Cache já desenhado, mesmo com o fetch novo ainda pendente.
    assert.equal(doc2.getElementById('acoesConteudo').hidden, false);
    assert.equal(doc2.querySelectorAll('.cc-tabela tbody tr').length, 2);

    resolverFetch({ ok: true, carteira: CARTEIRA_ACOES_EXEMPLO });
    await montagem;
  });
  usarMemoriaNoCacheDados(null);
});

test('montarPaginaCarteirasAcoes(): clicar em "Atualizar dados" busca de novo e redesenha', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadas = 0;
    const getCarteirasAcoesImpl = async () => {
      chamadas += 1;
      return {
        ok: true,
        carteira: {
          ...CARTEIRA_ACOES_EXEMPLO,
          resumo: { ...CARTEIRA_ACOES_EXEMPLO.resumo, quantidadeAtivos: chamadas === 1 ? 2 : 3 },
        },
      };
    };

    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl, getHomeImpl: GET_HOME_VAZIO });
    assert.equal(chamadas, 1);

    doc.getElementById('refreshControlAcoes').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(chamadas, 2);
    assert.match(doc.getElementById('acoesConteudo').innerHTML, /3/);
  });
});

// 19/09/2026 #7: os 2 gráficos novos (Rentabilidade acumulada/Evolução do
// patrimônio) + o filtro de período compartilhado acima deles (mesmo
// padrão "igual a home" das outras 3 subpáginas - ver
// wireGraficosClasseCarteiras em carteiras-classe-comum.js).
test('montarPaginaCarteirasAcoes(): desenha os gráficos de Rentabilidade/Evolução e o filtro de período troca os 2 juntos', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EXEMPLO });
    const getHomeImpl = async () => ({ ok: true, historico: historicoAcoesExemplo() });

    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl, getHomeImpl });

    assert.ok(doc.getElementById('acoesRentabChart').querySelector('svg'), 'deveria desenhar o SVG de Rentabilidade acumulada');
    assert.ok(doc.getElementById('acoesEvolucaoChart').querySelector('svg'), 'deveria desenhar o SVG de Evolução do patrimônio');
    assert.match(doc.getElementById('acoesRentabLegenda').textContent, /Portfólio/);
    assert.match(doc.getElementById('acoesRentabLegenda').textContent, /Ibovespa/);
    assert.match(doc.getElementById('acoesEvolucaoLegenda').textContent, /Portfólio/);
    assert.match(doc.getElementById('acoesEvolucaoLegenda').textContent, /Valor aplicado/);

    // O filtro de período fica acima do 1º gráfico (Rentabilidade
    // acumulada) e afeta os 2 - mesmo botão redesenha as 2 séries.
    const periodoTabs = doc.getElementById('acoesPeriodoTabs');
    assert.ok(periodoTabs, 'deveria ter #acoesPeriodoTabs acima do 1º gráfico');
    const botao3a = periodoTabs.querySelector('.filter-tab[data-periodo="3a"]');
    assert.doesNotThrow(() => botao3a.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true })));
    assert.equal(botao3a.classList.contains('active'), true);
    assert.ok(doc.getElementById('acoesRentabChart').querySelector('svg'));
    assert.ok(doc.getElementById('acoesEvolucaoChart').querySelector('svg'));

    // Tooltip do gráfico de Evolução mostra o período (data) ao passar o
    // mouse - pedido explícito do Tiago ("quero ver o periodo").
    const hitarea = doc.getElementById('acoesEvolucaoChart').querySelector('.rentab-hitarea');
    hitarea.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: 10, clientY: 10 }));
    const tooltip = doc.getElementById('acoesEvolucaoChart').querySelector('.rentab-tooltip');
    assert.equal(tooltip.hidden, false);
    assert.ok(tooltip.querySelector('.rentab-tooltip-data').textContent.length > 0);
  });
});

test('montarPaginaCarteirasAcoes(): sem histórico (getHome falhou), mostra aviso nos 2 gráficos sem quebrar o resto da página', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EXEMPLO });
    const getHomeImpl = async () => ({ ok: false, etapa: 'home', erro: 'timeout' });

    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl, getHomeImpl });

    assert.equal(doc.getElementById('acoesConteudo').hidden, false);
    assert.equal(doc.getElementById('acoesRentabChart').querySelector('svg'), null);
    assert.match(doc.getElementById('acoesRentabChart').textContent, /Não deu pra carregar/);
    // resto da página (resumo/tabela) continua normal mesmo sem home.
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
  });
});
