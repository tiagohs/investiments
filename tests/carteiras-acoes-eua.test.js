// Unit tests for assets/js/pages/carteiras-acoes-eua.js — mesmo molde de
// tests/carteiras-acoes.test.js. Atualizado em 19/09/2026 #3: página
// ganhou dupla moeda (US$ com "(R$ ...)" do lado nos valores grandes -
// Total/Lucro - e um botão "i" com o equivalente nos valores menores -
// Pr.médio/teto), Status/DY/P-VP com tooltip "i", ordenação por clique
// no cabeçalho e busca por ticker/nome (sem chips de segmento, que são
// só de FIIs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasAcoesEua } from '../assets/js/pages/carteiras-acoes-eua.js';

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
    <div class="carteiras-loading" id="acoesEuaLoading"></div>
    <div class="carteiras-erro" id="acoesEuaErro" hidden></div>
    <div id="refreshControlAcoesEua" class="refresh-control"></div>
    <div id="acoesEuaConteudo" hidden></div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRA_ACOES_EUA_EXEMPLO = {
  classe: 'Ações EUA',
  resumo: {
    totalInvestido: 3701.85,
    totalAtualizado: 4103.79,
    lucroPrejuizo: 401.94,
    percentualLucroPrejuizo: 0.1086,
    proventosTotais: 0,
    quantidadeAtivos: 2,
  },
  distribuicaoPorGrupo: [
    { grupo: 'Tecnologia', totalAtualizado: 3303.79, percentual: 0.8051 },
    { grupo: 'Energia', totalAtualizado: 800, percentual: 0.1949 },
  ],
  ativos: [
    {
      ticker: 'AAPL', nome: 'Apple Inc.', moeda: 'US$', precoAtual: 220.25, variacaoDia: 0.008,
      quantidade: 15, precoMedio: 200.12, precoTeto: null, vies: null, pvp: 45.2, descontoPvp: null,
      pl: null, descontoPl: null, grupo: 'Tecnologia', dyPercentual: 0.005, dyValor: 1.1,
      totalComprado: 3001.85, totalAtualizado: 3303.79, lucroPrejuizo: 301.94, percentualLucroPrejuizo: 0.1006, proventosTotais: 0,
    },
    {
      ticker: 'GPRK', nome: 'GeoPark Limited', moeda: 'US$', precoAtual: 25.5, variacaoDia: -0.011,
      quantidade: 30, precoMedio: 23.33, precoTeto: 30, vies: 'Comprar', pvp: 1.1, descontoPvp: null,
      pl: null, descontoPl: null, grupo: 'Energia', dyPercentual: 0.02, dyValor: 0.5,
      totalComprado: 700, totalAtualizado: 800, lucroPrejuizo: 100, percentualLucroPrejuizo: 0.1429, proventosTotais: 0,
    },
  ],
  benchmarks: { dolar: 5.142, ibovespa: -0.39, spx: 0.54 },
};

// 19/09/2026 #7: histórico diário (getHome()) pros 2 gráficos novos -
// campo "acoesEua" mapeia pra visaoId:"carteiraAcoesEua" (valor em BRL,
// mesmo padrão do histórico geral - ver comentário em carteiras-acoes-eua.js).
function historicoAcoesEuaExemplo() {
  const base = ['2026-06-19', '2026-07-19', '2026-08-19', '2026-09-19'];
  return base.map((data, i) => ({
    data,
    acoesEua: 15000 + i * 500,
    fluxoCaixaAcoesEua: i === 0 ? 0 : 100,
    ibovespa: 124000 + i * 900,
    sp500: 5500 + i * 20,
  }));
}
const GET_HOME_VAZIO = async () => ({ ok: true, historico: [] });

test('montarPaginaCarteirasAcoesEua() formata Total/Lucro em US$ com o equivalente em R$ do lado, e mostra dólar/Ibovespa/SPX', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesEuaImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EUA_EXEMPLO });

    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl, getHomeImpl: GET_HOME_VAZIO });

    assert.equal(doc.getElementById('acoesEuaLoading').hidden, true);
    assert.equal(doc.getElementById('acoesEuaConteudo').hidden, false);
    const html = doc.getElementById('acoesEuaConteudo').innerHTML;
    assert.match(html, /\$3,303\.79/); // Total do AAPL em US$
    assert.match(html, /class="moeda-conv">\(R\$&nbsp;16\.988,09\)/); // equivalente em R\$ do Total (câmbio 5,142) - innerHTML serializa NBSP (U+00A0) como &nbsp; (não U+00A0 cru)
    assert.equal(doc.querySelectorAll('.cc-benchmark-chip').length, 3);
    assert.match(html, /R\$ 5,14/); // dólar hoje, formatado em BRL
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);

    // Resumo em destaque (19/09/2026 #4), mas em US$ (formatarValor:
    // formatUSD - página inteira é em dólar) - sem "Proventos recebidos"
    // (Ações EUA não traz esse dado à parte).
    assert.equal(doc.querySelectorAll('.cc-resumo').length, 1);
    const textoResumo = doc.getElementById('acoesEuaResumo').textContent;
    assert.match(textoResumo, /\$4,103\.79/);
    assert.match(textoResumo, /Investido: \$3,701\.85/);
    assert.ok(!textoResumo.includes('Proventos recebidos'));
    assert.equal(doc.querySelectorAll('.cc-resumo-stat').length, 2); // só Lucro/Prejuízo + Ativos na carteira

    // cabeçalhos novos (Status/DY/P-VP com tooltip) - sem P/L (EUA nunca teve)
    const cabecalhos = [...doc.querySelectorAll('.cc-tabela thead th')].map((th) => th.textContent);
    assert.ok(cabecalhos.some((t) => t.includes('Status')));
    assert.ok(cabecalhos.some((t) => t.includes('DY')));
    assert.ok(cabecalhos.some((t) => t.includes('P/VP')));
    assert.ok(!cabecalhos.some((t) => t.includes('P/L')));
    // botões "i" de ajuda no cabeçalho (Status/DY/P-VP = 3) - agora via
    // .info-alvo/.info-icon (Pointer Events), não mais <button
    // class="cc-th-info" title>, que não funcionava no toque (19/09/2026 #4).
    assert.equal(doc.querySelectorAll('.cc-tabela thead .info-alvo').length, 3);
    assert.equal(doc.querySelectorAll('.cc-th-info').length, 0);
    assert.ok(doc.body.querySelector('.info-tooltip'), 'wirePointerTooltipCarteiras_ deveria criar a div .info-tooltip no body');

    // Pr. médio: só US$ no corpo da célula + ícone "i" com o equivalente
    // (não escrito por extenso) - o texto da tooltip fica em
    // data-tooltip, não mais em `title`.
    const linhaAapl = [...doc.querySelectorAll('.cc-tabela tbody tr')].find((tr) => tr.textContent.includes('AAPL'));
    assert.match(linhaAapl.innerHTML, /\$200\.12/);
    const iconePrecoMedio = linhaAapl.querySelector('td:nth-child(4) .info-alvo');
    assert.ok(iconePrecoMedio, 'célula de Pr. médio deveria ter o ícone de equivalente em reais');
    assert.match(iconePrecoMedio.dataset.tooltip, /Equivalente em reais:\sR\$\s1\.029,02/);
    assert.ok(iconePrecoMedio.querySelector('.info-icon.cc-info-icon-sm'));

    // sem chips de segmento (só FIIs tem) - mas a busca continua presente
    assert.equal(doc.querySelectorAll('.cc-filtro-chips').length, 0);
    assert.ok(doc.querySelector('.cc-busca-input'));

    // 19/09/2026 #4: só a célula (<td>) da coluna Ativo fica alinhada à
    // esquerda - resto centraliza por padrão, sem sobrar .right.
    const tdAtivo = doc.querySelector('.cc-tabela tbody tr td');
    assert.ok(tdAtivo.classList.contains('cc-td-esquerda'));
    assert.equal(doc.querySelectorAll('.cc-tabela td.right').length, 0);

    // ordenado por padrão (totalAtualizado desc): AAPL (3303,79) antes de GPRK (800)
    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.match(linhas[0].textContent, /AAPL/);
    assert.match(linhas[1].textContent, /GPRK/);

    // linha de totais no rodapé, com conversão também
    const totalRow = doc.querySelector('.cc-tabela tfoot tr');
    assert.ok(totalRow, 'deveria ter uma linha de totais no tfoot');
    assert.match(totalRow.textContent, /Total \(2 ativos\)/);
    assert.match(totalRow.innerHTML, /\$4,103\.79/);
    assert.match(totalRow.innerHTML, /moeda-conv/);
  });
});

// 19/09/2026 #6 (pedido do Tiago, 3 prints): "coloque um i com a
// conversao" nos 3 valores em dólar do resumo (Total atualizado/
// Investido/Lucro-Prejuízo) e na coluna Preço/dia da tabela; no donut
// "Por setor", "por default, mostra em dolar aqui, e no i, mantenha a
// versao em reais" (antes mostrava "R$" na frente de um número que já
// era dólar - bug de rótulo, não só de preferência).
test('montarPaginaCarteirasAcoesEua() acrescenta o "i" com o equivalente em reais no resumo (Total/Investido/Lucro) e na coluna Preço/dia, e o donut "Por setor" mostra US$ com o "i" trazendo o equivalente em reais', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesEuaImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EUA_EXEMPLO });
    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl, getHomeImpl: GET_HOME_VAZIO });

    // Resumo: Total atualizado + Total investido (bloco .cc-resumo-principal)
    // e o stat de Lucro/Prejuízo ganham cada um o seu próprio "i".
    const resumoEl = doc.getElementById('acoesEuaResumo');
    const iconesPrincipal = resumoEl.querySelector('.cc-resumo-principal').querySelectorAll('.info-alvo');
    assert.equal(iconesPrincipal.length, 2);
    assert.match(iconesPrincipal[0].dataset.tooltip, /R\$\s21\.101,69/); // Total atualizado (4103,79 * 5,142)
    assert.match(iconesPrincipal[1].dataset.tooltip, /R\$\s19\.034,91/); // Total investido (3701,85 * 5,142)
    const statLucro = resumoEl.querySelectorAll('.cc-resumo-stat')[0];
    assert.match(statLucro.querySelector('.info-alvo').dataset.tooltip, /R\$\s2\.066,78/); // Lucro/Prejuízo (401,94 * 5,142)

    // Tabela: coluna Preço/dia (2ª coluna) ganha o mesmo botão "i" que já
    // existia em Pr. médio/teto.
    const linhaAapl = [...doc.querySelectorAll('.cc-tabela tbody tr')].find((tr) => tr.textContent.includes('AAPL'));
    const iconePrecoDia = linhaAapl.querySelector('td:nth-child(2) .info-alvo');
    assert.ok(iconePrecoDia, 'célula de Preço/dia deveria ter o ícone de equivalente em reais');
    assert.match(iconePrecoDia.dataset.tooltip, /R\$\s1\.132,53/); // 220,25 * 5,142

    // Donut "Por setor": valor principal em US$ (não mais "R$" na frente
    // de um número que já era dólar), com o equivalente em reais no "i"
    // de cada item da legenda.
    const distribEl = doc.getElementById('acoesEuaDistribuicao');
    const valores = [...distribEl.querySelectorAll('.distrib-valor')].map((el) => el.textContent);
    assert.ok(valores.some((v) => v.includes('$3,303.79')), 'Tecnologia deveria aparecer em US$');
    assert.equal(valores.some((v) => v.includes('R$')), false, 'a legenda não deveria mais mostrar "R$" na frente de um valor que é dólar');
    const itemTecnologia = [...distribEl.querySelectorAll('.distrib-item')].find((el) => el.textContent.includes('Tecnologia'));
    assert.match(itemTecnologia.dataset.tooltip, /R\$\s16\.988,09/); // 3303,79 * 5,142
  });
});

test('montarPaginaCarteirasAcoesEua(): digitar na busca filtra por ticker e recalcula os totais', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesEuaImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EUA_EXEMPLO });
    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl, getHomeImpl: GET_HOME_VAZIO });

    const input = doc.querySelector('.cc-busca-input');
    input.value = 'gprk';
    input.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.equal(linhas.length, 1);
    assert.match(linhas[0].textContent, /GPRK/);
    const totalRow = doc.querySelector('.cc-tabela tfoot tr');
    assert.match(totalRow.textContent, /Total \(1 ativo\)/);
    assert.match(totalRow.innerHTML, /\$800\.00/);
  });
});

test('montarPaginaCarteirasAcoesEua(): clicar no cabeçalho de uma coluna ordena a tabela por ela', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesEuaImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EUA_EXEMPLO });
    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl, getHomeImpl: GET_HOME_VAZIO });

    // Qtd: AAPL (15) < GPRK (30) - clicar ordena asc por padrão
    const thQtd = doc.querySelector('.cc-tabela thead th[data-campo="quantidade"]');
    thQtd.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.match(linhas[0].textContent, /AAPL/);
    assert.match(linhas[1].textContent, /GPRK/);
    assert.match(doc.querySelector('.cc-tabela thead th[data-campo="quantidade"]').textContent, /▲/);
  });
});

test('montarPaginaCarteirasAcoesEua() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesEuaImpl = async () => ({ ok: false, etapa: 'carteirasAcoesEua', erro: 'câmbio indisponível' });

    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl, getHomeImpl: GET_HOME_VAZIO });

    assert.equal(doc.getElementById('acoesEuaConteudo').hidden, true);
    assert.equal(doc.getElementById('acoesEuaErro').hidden, false);
    assert.match(doc.getElementById('acoesEuaErro').textContent, /câmbio indisponível/);
  });
});

test('montarPaginaCarteirasAcoesEua(): clicar em "Atualizar dados" busca de novo', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadas = 0;
    const getCarteirasAcoesEuaImpl = async () => { chamadas += 1; return { ok: true, carteira: CARTEIRA_ACOES_EUA_EXEMPLO }; };

    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl, getHomeImpl: GET_HOME_VAZIO });
    doc.getElementById('refreshControlAcoesEua').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    assert.equal(chamadas, 2);
  });
});

// 19/09/2026 #7: gráficos de Rentabilidade acumulada/Evolução do
// patrimônio + filtro de período compartilhado (mesmo padrão de
// carteiras-acoes.test.js).
test('montarPaginaCarteirasAcoesEua(): desenha os gráficos de Rentabilidade/Evolução e o filtro de período troca os 2 juntos', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesEuaImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EUA_EXEMPLO });
    const getHomeImpl = async () => ({ ok: true, historico: historicoAcoesEuaExemplo() });

    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl, getHomeImpl });

    assert.ok(doc.getElementById('acoesEuaRentabChart').querySelector('svg'));
    assert.ok(doc.getElementById('acoesEuaEvolucaoChart').querySelector('svg'));
    assert.match(doc.getElementById('acoesEuaRentabLegenda').textContent, /S&P 500/);

    const periodoTabs = doc.getElementById('acoesEuaPeriodoTabs');
    assert.ok(periodoTabs);
    const botao30d = periodoTabs.querySelector('.filter-tab[data-periodo="30d"]');
    assert.doesNotThrow(() => botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true })));
    assert.ok(doc.getElementById('acoesEuaRentabChart').querySelector('svg'));
    assert.ok(doc.getElementById('acoesEuaEvolucaoChart').querySelector('svg'));
  });
});
