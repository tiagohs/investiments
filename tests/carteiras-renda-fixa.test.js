// Unit tests for assets/js/pages/carteiras-renda-fixa.js — mesmo molde de
// tests/carteiras-acoes.test.js, mas com o formato de ativo bem
// diferente (indexador/vencimento/rentabilidade contratada/IR).
//
// 19/09/2026 #7 (catchup pedido pelo Tiago): reescrito do zero pra cobrir
// o que a tela ganhou nesta rodada - tabela com ordenação por clique,
// tags de Indexador/Rentab. contratada/Rentabilidade/Carteira, % cart.,
// linha de totais, busca + chips de filtro "Todos/Longo Prazo/Reserva de
// Emergência" (igual FIIs), e os 6 gráficos novos (3 Rentabilidade
// acumulada + 3 Evolução do patrimônio, 2 linhas cada no desktop).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasRendaFixa } from '../assets/js/pages/carteiras-renda-fixa.js';
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
    <div class="carteiras-loading" id="rendaFixaLoading"></div>
    <div class="carteiras-erro" id="rendaFixaErro" hidden></div>
    <div id="refreshControlRendaFixa" class="refresh-control"></div>
    <div id="rendaFixaConteudo" hidden></div>
  </body></html>`);
  // movimento reduzido: os números dos KPIs saem finais (sem animação a partir de 0)
  dom.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  return dom.window.document;
}

const CARTEIRA_RF_EXEMPLO = {
  resumo: {
    totalInvestido: 54900.56,
    totalAtualizado: 65700.72,
    lucroPrejuizo: 10800.16,
    percentualLucroPrejuizo: 0.1967,
    quantidadeAtivos: 2,
  },
  benchmarks: { cdi: 0.134, selic: 0.125, ipca: 0.045 },
  distribuicaoPorIndexador: [
    { grupo: 'CDI', totalAtualizado: 40000, percentual: 0.609 },
    { grupo: 'IPCA+', totalAtualizado: 25700.72, percentual: 0.391 },
  ],
  ativos: [
    {
      codigo: 'CDB001', nomePersonalizado: 'CDB Banco X', tipoInvestimento: 'CDB', indexador: 'CDI',
      instituicao: 'Banco X', tipoCarteira: 'longo-prazo', quantidade: 1, vencimento: '03/2028',
      totalInvestido: 30000, totalAtualizado: 40000,
      rentabilidadeContratada: { indice: 'CDI', numeroDeLotes: 1, texto: '112% do CDI' },
      irSeResgatasseHoje: { impostoSeResgatasseHoje: 800, valorLiquidoSeResgatasseHoje: 39200, precisao: 'exata', detalhes: null },
    },
    {
      codigo: 'TES002', nomePersonalizado: 'Tesouro IPCA+ 2035', tipoInvestimento: 'Tesouro IPCA+', indexador: 'IPCA+',
      instituicao: 'Tesouro Direto', tipoCarteira: 'emergencial', quantidade: 1, vencimento: '05/2035',
      totalInvestido: 24900.56, totalAtualizado: 25700.72,
      rentabilidadeContratada: { indice: 'IPCA', numeroDeLotes: 1, texto: 'IPCA + 6,1%' },
      irSeResgatasseHoje: null,
    },
  ],
};

// 19/09/2026 #7: histórico diário (getHome()) pros 6 gráficos novos -
// campos rendaFixaTotal/rendaFixaLongoPrazo/rendaEmergencial (este
// último já existia, reaproveitado da Início) + os fluxos
// correspondentes - ver CAMPO_PRINCIPAL_POR_VISAO/CAMPO_FLUXO_POR_VISAO
// em inicio.js.
function historicoRendaFixaExemplo() {
  const base = ['2026-06-19', '2026-07-19', '2026-08-19', '2026-09-19'];
  return base.map((data, i) => ({
    data,
    rendaFixaTotal: 60000 + i * 1500,
    rendaFixaLongoPrazo: 40000 + i * 1000,
    rendaEmergencial: 20000 + i * 500,
    fluxoCaixaRendaFixaTotal: i === 0 ? 0 : 300,
    fluxoCaixaRendaFixaLongoPrazo: i === 0 ? 0 : 200,
    fluxoCaixaRendaEmergencial: i === 0 ? 0 : 100,
    indiceCdi: 1 + i * 0.003,
    indiceIpca: 1 + i * 0.001,
  }));
}
const GET_HOME_VAZIO = async () => ({ ok: true, historico: [] });

test('montarPaginaCarteirasRendaFixa() renderiza resumo/benchmarks/donut/tabela com os campos próprios de Renda Fixa', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl: GET_HOME_VAZIO });

    assert.equal(doc.getElementById('rendaFixaLoading').hidden, true);
    assert.equal(doc.getElementById('rendaFixaConteudo').hidden, false);
    const html = doc.getElementById('rendaFixaConteudo').innerHTML;
    assert.equal(doc.querySelectorAll('.cc-benchmark-chip').length, 3); // CDI/Selic/IPCA
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
    assert.match(html, /Reserva de Emergência/);
    assert.match(html, /Longo Prazo/);
    assert.match(html, /112% do CDI/);
    assert.match(html, /IPCA \+ 6,1%/);
    assert.match(html, /39\.200,00/); // valor líquido de IR da posição CDB001

    // cabeçalhos novos (Indexador/Rentab. contratada/Rentabilidade/
    // Instituição/Carteira/% cart. entraram) - 19/09/2026 #7.
    const cabecalhos = [...doc.querySelectorAll('.cc-tabela thead th')].map((th) => th.textContent);
    // 25/09/2026: Indexador e Instituição saíram (tabela rolava no desktop) -
    // o indexador fica na Rentab. contratada e a instituição embaixo do título
    assert.ok(!cabecalhos.some((t) => t.includes('Indexador')));
    assert.ok(!cabecalhos.some((t) => t.includes('Instituição')));
    assert.ok(cabecalhos.some((t) => t.includes('Contratada')));
    assert.ok(cabecalhos.some((t) => t.includes('Rentab.')));
    assert.ok(cabecalhos.some((t) => t.includes('Carteira')));
    assert.ok(cabecalhos.some((t) => t.includes('cart.')));

    // tooltips "i" ligadas (cabeçalho/donut) - faltava antes desta rodada.
    assert.ok(doc.querySelectorAll('.info-alvo').length > 0);
    assert.ok(doc.body.querySelector('.info-tooltip'));

    // linha de totais no rodapé, somando os 2 ativos.
    const totalRow = doc.querySelector('.cc-tabela tfoot tr');
    assert.ok(totalRow, 'deveria ter uma linha de totais no tfoot');
    assert.match(totalRow.textContent, /Total \(2 posições\)/);
    assert.match(totalRow.textContent, /65\.700,72/);
  });
});

test('montarPaginaCarteirasRendaFixa(): tags verdes em Rentabilidade e Rentab. contratada; título de CDI sem taxa mostra só "CDI"', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl: GET_HOME_VAZIO });

    const linhaCdb = [...doc.querySelectorAll('.cc-tabela tbody tr')].find((tr) => tr.textContent.includes('CDB Banco X'));
    // "Rentab. contratada" (112% do CDI) e "Rentabilidade" (retorno já
    // realizado, calculado no front - (40000-30000)/30000 = 33,33%)
    // viram chip tonal verde do kit (pedido verbal do Tiago - "tags verdinhas
    // em Rentabilidade e Indexador contratado").
    const pills = [...linhaCdb.querySelectorAll('.chip-tonal.chip-good')];
    assert.ok(pills.some((p) => p.textContent === '112% do CDI'));
    assert.ok(pills.some((p) => /33,3\d%/.test(p.textContent)));
  });
  // sem a taxa na planilha (caso real dos títulos de CDI): só o indexador
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const semTaxa = { ...CARTEIRA_RF_EXEMPLO, ativos: CARTEIRA_RF_EXEMPLO.ativos.map((a) => (a.indexador === 'CDI' ? { ...a, rentabilidadeContratada: null } : a)) };
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl: async () => ({ ok: true, carteira: semTaxa }), getHomeImpl: GET_HOME_VAZIO });
    const linhaCdb = [...doc.querySelectorAll('.cc-tabela tbody tr')].find((tr) => tr.textContent.includes('CDB Banco X'));
    assert.ok([...linhaCdb.querySelectorAll('.chip-tonal.chip-good')].some((p) => p.textContent === 'CDI'));
  });
});

test('montarPaginaCarteirasRendaFixa(): posição sem irSeResgatasseHoje calculado mostra travessão em vez de quebrar', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl: GET_HOME_VAZIO });

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    // ordenado por totalAtualizado desc (padrão): CDB001 (40000) antes de TES002 (25700.72)
    assert.match(linhas[0].textContent, /CDB Banco X/);
    assert.match(linhas[1].textContent, /Tesouro IPCA\+ 2035/);
    assert.match(linhas[1].textContent, /—/); // TES002 não tem irSeResgatasseHoje
  });
});

test('montarPaginaCarteirasRendaFixa(): clicar no cabeçalho de uma coluna ordena a tabela por ela', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl: GET_HOME_VAZIO });

    const thVencimento = doc.querySelector('.cc-tabela thead th[data-campo="vencimento"]');
    assert.ok(thVencimento, 'coluna Vencimento deveria ser ordenável');
    thVencimento.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    // "03/2028" < "05/2035" (string, mesmo formato MM/yyyy) - asc por padrão
    assert.match(linhas[0].textContent, /CDB Banco X/);
    assert.match(linhas[1].textContent, /Tesouro IPCA\+ 2035/);
  });
});

test('montarPaginaCarteirasRendaFixa(): filtro "Reserva de Emergência" filtra a tabela e recalcula os totais', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl: GET_HOME_VAZIO });

    const chips = [...doc.querySelectorAll('.cc-filtro-chips .filter-tab')].map((b) => b.textContent);
    assert.deepEqual(chips, ['Todos', 'Longo Prazo', 'Reserva de Emergência']);

    const chipEmergencia = [...doc.querySelectorAll('.cc-filtro-chips .filter-tab')].find((b) => b.textContent === 'Reserva de Emergência');
    chipEmergencia.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.equal(linhas.length, 1);
    assert.match(linhas[0].textContent, /Tesouro IPCA\+ 2035/);
    const totalRow = doc.querySelector('.cc-tabela tfoot tr');
    assert.match(totalRow.textContent, /Total \(1 posição\)/);
    assert.match(totalRow.textContent, /25\.700,72/);
    assert.ok(chipEmergencia.classList.contains('active'));
  });
});

test('montarPaginaCarteirasRendaFixa(): digitar na busca filtra por título/ticker', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl: GET_HOME_VAZIO });

    const input = doc.querySelector('.cc-busca-input');
    input.value = 'tes002';
    input.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.equal(linhas.length, 1);
    assert.match(linhas[0].textContent, /Tesouro IPCA\+ 2035/);
  });
});

test('montarPaginaCarteirasRendaFixa() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: false, etapa: 'carteirasRendaFixa', erro: 'aba não encontrada' });

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl: GET_HOME_VAZIO });

    assert.equal(doc.getElementById('rendaFixaConteudo').hidden, true);
    assert.equal(doc.getElementById('rendaFixaErro').hidden, false);
    assert.match(doc.getElementById('rendaFixaErro').textContent, /aba não encontrada/);
  });
});

test('montarPaginaCarteirasRendaFixa(): clicar em "Atualizar dados" busca de novo', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadas = 0;
    const getCarteirasRendaFixaImpl = async () => { chamadas += 1; return { ok: true, carteira: CARTEIRA_RF_EXEMPLO }; };

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl: GET_HOME_VAZIO });
    doc.getElementById('refreshControlRendaFixa').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    assert.equal(chamadas, 2);
  });
});

// 19/09/2026 #7: os 6 gráficos (3 Rentabilidade acumulada + 3 Evolução do
// patrimônio) + o filtro de período compartilhado acima do 1º - pedido
// explícito do Tiago sobre o layout em 2 linhas (Carteira total cheia,
// Longo Prazo/Reserva de Emergência lado a lado).
test('montarPaginaCarteirasRendaFixa(): desenha os 6 gráficos (Carteira total/Longo prazo/Reserva de emergência × Rentabilidade/Evolução)', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    const getHomeImpl = async () => ({ ok: true, historico: historicoRendaFixaExemplo() });

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl });

    // 06/10/2026: gráficos da biblioteca (charts/) via criarGraficosCarteira (agruparPor 'tipo'): primeiro as 3 rentabilidades
    // (Carteira total ocupa a linha inteira; Longo prazo e Reserva de emergência dividem a de baixo), depois as 3 evoluções.
    const graficos = doc.getElementById('rendaFixaGraficos');
    const rentab = [...graficos.querySelectorAll('.cg-painel-rentabilidade')];
    const evolucao = [...graficos.querySelectorAll('.cg-painel-evolucao')];
    assert.equal(rentab.length, 3);
    assert.equal(evolucao.length, 3);
    [...rentab, ...evolucao].forEach((p) => assert.ok(p.querySelector('.chart--linha svg'), 'cada painel desenha o seu gráfico'));
    assert.ok(rentab[0].classList.contains('cg-painel-largo') && evolucao[0].classList.contains('cg-painel-largo'), 'Carteira total em linha cheia');
    assert.match(rentab[0].querySelector('.chart-card-rot').textContent, /Carteira total/);
    assert.match(rentab[1].querySelector('.chart-card-rot').textContent, /Longo prazo/);
    assert.match(rentab[2].querySelector('.chart-card-rot').textContent, /Reserva de emergência/);

    // Evolução de Longo prazo/Reserva de emergência mostra só 1 linha (comInvestido:false) - sem "Valor aplicado" na legenda,
    // diferente da Carteira total (que compara com o investido, igual às outras subpáginas).
    assert.match(evolucao[0].querySelector('.chart-legenda').textContent, /Valor aplicado/);
    assert.doesNotMatch(evolucao[1].textContent, /Valor aplicado/);
    assert.doesNotMatch(evolucao[2].textContent, /Valor aplicado/);
    assert.match(rentab[1].querySelector('.chart-legenda').textContent, /Longo prazo/);
    assert.match(rentab[2].querySelector('.chart-legenda').textContent, /Reserva de emergência/);

    // o seletor de período (acima dos gráficos) redesenha os 6 juntos.
    const botao30d = graficos.querySelector('.cg-periodo [data-periodo="30d"]');
    assert.ok(botao30d);
    assert.doesNotThrow(() => botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true })));
    assert.equal(botao30d.getAttribute('aria-pressed'), 'true');
    assert.equal(graficos.querySelectorAll('.chart--linha svg').length, 6);
  });
});

test('montarPaginaCarteirasRendaFixa(): sem histórico (getHome falhou), mostra aviso nos 6 gráficos sem quebrar o resto da página', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    const getHomeImpl = async () => ({ ok: false, etapa: 'home', erro: 'timeout' });

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl });

    assert.equal(doc.getElementById('rendaFixaConteudo').hidden, false);
    const graficos = doc.getElementById('rendaFixaGraficos');
    assert.equal(graficos.querySelector('.chart--linha'), null);
    assert.equal(graficos.querySelectorAll('.chart-card[data-estado="erro"]').length, 6);
    assert.match(graficos.textContent, /Não deu pra carregar os gráficos agora/);
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
  });
});

test('montarPaginaCarteirasRendaFixa(): tabela com imagem do título (igual às outras tabelas) e ↗ de nova aba ao lado do nome', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl: async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO }), getHomeImpl: GET_HOME_VAZIO });
    const linhas = [...doc.querySelectorAll('.cc-tabela tbody tr')];
    const celTesouro = linhas.map((tr) => tr.querySelector('.cel-ativo')).find((c) => c && /Tesouro IPCA/.test(c.textContent));
    assert.ok(celTesouro, 'célula do título com logo');
    assert.match(celTesouro.querySelector('.logo-circulo img').getAttribute('src'), /assets\/imgs\/tesouro-direto\.webp$/);
    const celCdb = linhas.map((tr) => tr.querySelector('.cel-ativo')).find((c) => c && /CDB Banco X/.test(c.textContent));
    assert.equal(celCdb.querySelector('.logo-circulo img'), null, 'sem imagem própria: só as iniciais');
    assert.match(celCdb.querySelector('.logo-circulo').textContent, /^BA$/);
    const novaAba = celTesouro.querySelector('a.link-ativo-nova-aba');
    assert.equal(novaAba.getAttribute('target'), '_blank');
    assert.equal(novaAba.getAttribute('href'), celTesouro.querySelector('a.link-ativo').getAttribute('href'));
  });
});

// 05/10/2026 (Tiago: "Renda Fixa demora muito pra carregar"): o getHome (histórico, bem mais pesado) não pode
// segurar o desenho da carteira - tabela/resumo aparecem assim que a carteira responde, e os gráficos são
// refeitos quando o histórico chega.
test('montarPaginaCarteirasRendaFixa(): a carteira desenha ANTES do getHome responder (gráficos "Carregando" até o histórico chegar)', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let liberarHome;
    const getHomeImpl = () => new Promise((resolve) => { liberarHome = () => resolve({ ok: true, historico: historicoRendaFixaExemplo() }); });
    const pagina = montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl: async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO }), getHomeImpl });
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));

    assert.equal(doc.getElementById('rendaFixaConteudo').hidden, false, 'conteúdo visível sem esperar o histórico');
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2, 'tabela já desenhada');
    assert.equal(doc.querySelectorAll('#rendaFixaGraficos .chart-card[data-estado="carregando"]').length, 6, 'gráficos em "carregando"');
    assert.equal(doc.querySelector('#rendaFixaGraficos .chart--linha'), null);

    liberarHome();
    await pagina;
    assert.equal(doc.querySelectorAll('#rendaFixaGraficos .chart--linha svg').length, 6, 'gráficos desenhados quando o histórico chega');
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
  });
});

test('montarPaginaCarteirasRendaFixa(): com carteira e histórico guardados, desenha tudo na hora (mesmo com o servidor lento)', async () => {
  const store = new Map();
  store.set('carteiras_renda_fixa_v2', JSON.stringify({ dados: CARTEIRA_RF_EXEMPLO, ts: Date.now() - 60000 }));
  store.set('home', JSON.stringify({ dados: { historico: historicoRendaFixaExemplo() }, ts: Date.now() - 60000 }));
  usarMemoriaNoCacheDados(store);
  try {
    await withFakeSessionStorage(async () => {
      const doc = makeDom();
      let liberar;
      const lenta = new Promise((resolve) => { liberar = resolve; });
      const pagina = montarPaginaCarteirasRendaFixa('token-fake', {
        doc,
        getCarteirasRendaFixaImpl: async () => { await lenta; return { ok: false, etapa: 'carteirasRendaFixa', erro: 'timeout' }; },
        getHomeImpl: async () => { await lenta; return { ok: false, etapa: 'home', erro: 'timeout' }; },
      });
      for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
      assert.equal(doc.getElementById('rendaFixaConteudo').hidden, false);
      assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2, 'tabela vinda do cache, sem esperar a rede');
      assert.equal(doc.querySelectorAll('#rendaFixaGraficos .chart--linha svg').length, 6, 'gráficos vindos do histórico guardado');
      liberar();
      await pagina;
      assert.match(doc.getElementById('rendaFixaErro').textContent, /Mostrando os dados guardados/);
      assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
    });
  } finally { usarMemoriaNoCacheDados(null); }
});
