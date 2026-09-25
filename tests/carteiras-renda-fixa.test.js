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
    // viram status-pill verde (pedido verbal do Tiago - "tags verdinhas
    // em Rentabilidade e Indexador contratado").
    const pills = [...linhaCdb.querySelectorAll('.status-pill.good')];
    assert.ok(pills.some((p) => p.textContent === '112% do CDI'));
    assert.ok(pills.some((p) => /33,3\d%/.test(p.textContent)));
  });
  // sem a taxa na planilha (caso real dos títulos de CDI): só o indexador
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const semTaxa = { ...CARTEIRA_RF_EXEMPLO, ativos: CARTEIRA_RF_EXEMPLO.ativos.map((a) => (a.indexador === 'CDI' ? { ...a, rentabilidadeContratada: null } : a)) };
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl: async () => ({ ok: true, carteira: semTaxa }), getHomeImpl: GET_HOME_VAZIO });
    const linhaCdb = [...doc.querySelectorAll('.cc-tabela tbody tr')].find((tr) => tr.textContent.includes('CDB Banco X'));
    assert.ok([...linhaCdb.querySelectorAll('.status-pill.good')].some((p) => p.textContent === 'CDI'));
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

    // Rentabilidade: Carteira total (row 1) + Longo prazo/Reserva de
    // emergência (row 2, lado a lado).
    assert.ok(doc.getElementById('rfRentabTotalChart').querySelector('svg'));
    assert.ok(doc.getElementById('rfRentabLongoChart').querySelector('svg'));
    assert.ok(doc.getElementById('rfRentabEmergChart').querySelector('svg'));
    // Evolução: mesma estrutura.
    assert.ok(doc.getElementById('rfEvolucaoTotalChart').querySelector('svg'));
    assert.ok(doc.getElementById('rfEvolucaoLongoChart').querySelector('svg'));
    assert.ok(doc.getElementById('rfEvolucaoEmergChart').querySelector('svg'));

    // row 2 (Longo prazo + Reserva de emergência) fica lado a lado no
    // mesmo `.cc-charts-par` - 2 grids (1 na seção Rentabilidade, 1 na
    // Evolução).
    assert.equal(doc.querySelectorAll('.cc-charts-par').length, 2);

    // Evolução de Longo prazo/Reserva de emergência mostra só 1 linha
    // (comInvestido:false) - sem "Valor aplicado" na legenda, diferente
    // da Carteira total (que compara com o investido, igual às outras
    // subpáginas).
    assert.match(doc.getElementById('rfEvolucaoTotalLegenda').textContent, /Valor aplicado/);
    assert.doesNotMatch(doc.getElementById('rfEvolucaoLongoLegenda').textContent, /Valor aplicado/);
    assert.match(doc.getElementById('rfEvolucaoLongoLegenda').textContent, /Longo prazo/);
    assert.doesNotMatch(doc.getElementById('rfEvolucaoEmergLegenda').textContent, /Valor aplicado/);
    assert.match(doc.getElementById('rfEvolucaoEmergLegenda').textContent, /Reserva de emergência/);

    // filtro de período (acima da 1ª seção) redesenha os 6 gráficos juntos.
    const periodoTabs = doc.getElementById('rendaFixaPeriodoTabs');
    assert.ok(periodoTabs);
    const botao30d = periodoTabs.querySelector('.filter-tab[data-periodo="30d"]');
    assert.doesNotThrow(() => botao30d.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true })));
    assert.ok(doc.getElementById('rfRentabTotalChart').querySelector('svg'));
    assert.ok(doc.getElementById('rfEvolucaoEmergChart').querySelector('svg'));
  });
});

test('montarPaginaCarteirasRendaFixa(): sem histórico (getHome falhou), mostra aviso nos 6 gráficos sem quebrar o resto da página', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    const getHomeImpl = async () => ({ ok: false, etapa: 'home', erro: 'timeout' });

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl, getHomeImpl });

    assert.equal(doc.getElementById('rendaFixaConteudo').hidden, false);
    assert.equal(doc.getElementById('rfRentabTotalChart').querySelector('svg'), null);
    assert.match(doc.getElementById('rfRentabTotalChart').textContent, /Não deu pra carregar/);
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
  });
});

test('montarPaginaCarteirasRendaFixa(): tabela com imagem do título (igual às outras tabelas) e ↗ de nova aba ao lado do nome', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl: async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO }), getHomeImpl: GET_HOME_VAZIO });
    const linhas = [...doc.querySelectorAll('.cc-tabela tbody tr')];
    const celTesouro = linhas.map((tr) => tr.querySelector('.cc-ativo-cel')).find((c) => c && /Tesouro IPCA/.test(c.textContent));
    assert.ok(celTesouro, 'célula do título com logo');
    assert.match(celTesouro.querySelector('.cc-logo img').getAttribute('src'), /assets\/imgs\/tesouro-direto\.webp$/);
    const celCdb = linhas.map((tr) => tr.querySelector('.cc-ativo-cel')).find((c) => c && /CDB Banco X/.test(c.textContent));
    assert.ok(celCdb.querySelector('.cc-logo-fallback'), 'sem imagem própria: iniciais');
    const novaAba = celTesouro.querySelector('a.link-ativo-nova-aba');
    assert.equal(novaAba.getAttribute('target'), '_blank');
    assert.equal(novaAba.getAttribute('href'), celTesouro.querySelector('b a.link-ativo').getAttribute('href'));
  });
});
