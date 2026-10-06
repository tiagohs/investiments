// Unit tests for assets/js/pages/inicio.js. All the render functions are
// pure DOM builders (given a jsdom document + plain data, never fetch
// anything themselves) - montarPaginaInicio is the one real-world
// orchestrator, exercised here with a fake getHomeImpl instead of a real
// fetch/token, same pattern as shell.test.js's fake fetchImpl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  splitValorExibicao,
  resolverVisao,
  calcularDistribuicaoPorClasse,
  calcularDistribuicaoRendaEmergencial,
  renderDistribuicao,
  filtrarHistoricoPorPeriodo,
  normalizarSerieRentabilidade,
  renderGraficoRentabilidade,
  renderInfoRentabilidade,
  calcularResumoRentabilidade,
  calcularResumoEvolucao,
  renderInfoEvolucao,
  comCamposUsdAcoesEua,
  historicoTemCambioUsd,
  wireGraficoRentabilidade,
  criarAtivoCard,
  wireTooltipAtivos,
  wireGraficoAtivo,
  renderAvisos,
  montarPaginaInicio,
} from '../assets/js/pages/inicio.js';

function makeDom(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

const ATIVO_ACAO_EXEMPLO = {
  classe: 'acoes', ticker: 'BBAS3', nome: 'Banco do Brasil', precoAtual: 22.14, variacaoDia: -0.012,
  vies: 'comprar', descontoPL: '12% (0,88 P/L)',
};

const ATIVO_FII_EXEMPLO = {
  classe: 'fiis', ticker: 'HGRU11', nome: 'CSHG Renda Urbana', tipo: 'Tijolo', precoAtual: 118.4,
  variacaoDia: 0.003, precoMedio: 102.9, quantidade: 37, descontoPVp: '108% (1,08 P/VP)',
};

const ATIVO_RF_EXEMPLO = {
  classe: 'rf', ticker: 'Tesouro Selic · 03/2029', codigo: 'TS-2029', marca: 'longo-prazo',
  nome: 'Tesouro Selic 2029', instituicao: 'CORRETORA EXEMPLO',
  tipoInvestimento: 'Tesouro Selic', indexador: 'Selic', vencimento: '03/2029',
  valorAtualizado: 12480.55, variacaoDia: 0.0004,
};

const ATIVO_USA_EXEMPLO = {
  classe: 'usa', ticker: 'CHTR', precoAtual: 320.5, precoAtualBRL: 1732.5, variacaoDia: 0.008,
  vies: 'aguardar', descontoPL: '-8% (14,2 P/L)',
};

const PATRIMONIO_EXEMPLO = {
  total: 147583.80,
  longoPrazo: 87356.59,
  // 17/09/2026: nacional = longoPrazo - porClasse.acoesEua (mesma fórmula
  // de Home.gs!montarHome_) = 87356.59 - 25227.21.
  nacional: 62129.38,
  rendaEmergencial: 60227.21,
  porClasse: { acoes: 20000, fiis: 15000, rendaFixa: 87356.59, acoesEua: 25227.21 },
};

function gerarHistoricoExemplo(dias = 40) {
  const historico = [];
  for (let i = 0; i < dias; i += 1) {
    const d = new Date(2026, 0, 1 + i);
    historico.push({
      data: d.toISOString().slice(0, 10),
      patrimonio: 100000 + i * 1000,
      longoPrazo: 80000 + i * 800,
      nacional: 60000 + i * 600, // 17/09/2026 #2: base da visão "Patrimônio Nacional"
      rendaEmergencial: 20000 + i * 200,
      indiceCdi: 100 * (1 + i * 0.001),
      indiceSelic: 100 * (1 + i * 0.0009),
      ibovespa: i < 3 ? null : 120000 + i * 500, // simula "antes do 1º pregão da janela"
    });
  }
  return historico;
}

// 06/10/2026 (Onda 3): a grade "Meus ativos" antiga (renderMeusAtivos) saiu do código (a Início usa a lista nova de inicio-painel.js);
// os testes abaixo continuam cobrindo o CARD (criarAtivoCard, ainda usado pelos Favoritos) e o tooltip, então a grade vira este atalho de teste.
function renderMeusAtivos(doc, container, ativos, filtroClasse = 'todos') {
  container.innerHTML = '';
  (ativos || []).filter((a) => filtroClasse === 'todos' || a.classe === filtroClasse).forEach((a) => container.appendChild(criarAtivoCard(doc, a)));
}

// --- splitValorExibicao ------------------------------------------------------

test('splitValorExibicao() splits at the decimal comma for a currency value', () => {
  assert.deepEqual(splitValorExibicao('R$ 5,09'), { principal: 'R$ 5', dec: ',09' });
});

test('splitValorExibicao() splits at the last thousands separator when there is no decimal part', () => {
  assert.deepEqual(splitValorExibicao('185.600'), { principal: '185', dec: '.600' });
});

test('splitValorExibicao() returns the whole string as "principal" when there is no separator at all', () => {
  assert.deepEqual(splitValorExibicao('—'), { principal: '—', dec: '' });
});

// --- criarTileIndice / criarTileCambio --------------------------------------









// --- renderIndicesCambio -----------------------------------------------------





test('resolverVisao() picks the right field + label for each known visão', () => {
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'total').valor, 147583.80);
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'longoPrazo').valor, 87356.59);
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'nacional').valor, 62129.38);
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'rendaEmergencial').valor, 60227.21);
});

test('resolverVisao() falls back to "total" for an unrecognized visão id', () => {
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'algo-inexistente').valor, 147583.80);
});

// ativos usados nos testes de distribuição - 2 posições de Renda Fixa,
// uma "longo-prazo" (Tesouro IPCA) e duas "emergencial" (Tesouro Selic +
// CDB), pra dar pra testar tanto calcularDistribuicaoPorClasse quanto
// calcularDistribuicaoRendaEmergencial com o mesmo fixture.
const ATIVOS_RESUMO_EXEMPLO = [
  { classe: 'acoes', ticker: 'BBAS3', precoAtual: 20, quantidade: 1000 }, // 20.000
  { classe: 'fiis', ticker: 'HGLG11', precoAtual: 150, quantidade: 100 }, // 15.000
  { classe: 'usa', ticker: 'AAPL', precoAtual: 100, quantidade: 50, precoAtualBRL: 550 }, // 27.500 (já convertido)
  { classe: 'rf', ticker: 'Tesouro IPCA · 2035', marca: 'longo-prazo', tipoInvestimento: 'Tesouro IPCA', valorAtualizado: 50000 },
  { classe: 'rf', ticker: 'Tesouro Selic · 2029', marca: 'emergencial', tipoInvestimento: 'Tesouro Selic', valorAtualizado: 30000 },
  { classe: 'rf', ticker: 'CDB Banco X', marca: 'emergencial', tipoInvestimento: 'CDB', valorAtualizado: 10000 },
];

test('calcularDistribuicaoPorClasse() soma o valor de posição de cada classe (Ações/FIIs/RF/EUA)', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5 });
  const porLabel = Object.fromEntries(distrib.map((f) => [f.label, f.valor]));
  assert.equal(porLabel['Ações'], 20000);
  assert.equal(porLabel['FIIs'], 15000);
  assert.equal(porLabel['Renda Fixa'], 90000); // 50.000 (longo prazo) + 30.000 + 10.000 (emergencial)
  assert.equal(porLabel['Ações EUA'], 27500);
});

test('calcularDistribuicaoPorClasse() com excluirEmergencial tira a reserva de emergência de dentro de Renda Fixa', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5, excluirEmergencial: true });
  const porLabel = Object.fromEntries(distrib.map((f) => [f.label, f.valor]));
  assert.equal(porLabel['Renda Fixa'], 50000, 'só a posição marca=longo-prazo (Tesouro IPCA) deveria sobrar');
  assert.equal(porLabel['Ações'], 20000, 'as outras classes não mudam - a reserva de emergência é só Renda Fixa');
});

// 17/09/2026 #2: base da distribuição do novo card/painel "Patrimônio
// Nacional" - mesmo fixture, agora tirando também a classe 'usa' inteira.
test('calcularDistribuicaoPorClasse() com excluirInternacional tira a classe Ações EUA inteira (base do "Patrimônio Nacional")', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5, excluirInternacional: true });
  const porLabel = Object.fromEntries(distrib.map((f) => [f.label, f.valor]));
  assert.equal(porLabel['Ações EUA'], undefined, 'Ações EUA não deveria aparecer nem como fatia zerada');
  assert.equal(porLabel['Ações'], 20000);
  assert.equal(porLabel['FIIs'], 15000);
  assert.equal(porLabel['Renda Fixa'], 90000, 'sozinho, excluirInternacional não mexe na Renda Fixa');
});

test('calcularDistribuicaoPorClasse() com excluirEmergencial + excluirInternacional juntos (Nacional de verdade) só sobra Ações/FIIs/RF não-emergencial', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5, excluirEmergencial: true, excluirInternacional: true });
  const porLabel = Object.fromEntries(distrib.map((f) => [f.label, f.valor]));
  assert.equal(porLabel['Ações EUA'], undefined);
  assert.equal(porLabel['Renda Fixa'], 50000);
  assert.equal(porLabel['Ações'], 20000);
  assert.equal(porLabel['FIIs'], 15000);
});

test('calcularDistribuicaoPorClasse() usa precoAtual×câmbio como fallback quando o ativo EUA não vem com precoAtualBRL', () => {
  const semConversaoPronta = [{ classe: 'usa', ticker: 'AAPL', precoAtual: 100, quantidade: 50 }];
  const distrib = calcularDistribuicaoPorClasse(semConversaoPronta, { cambioUsd: 5 });
  assert.equal(distrib.find((f) => f.label === 'Ações EUA').valor, 25000); // 100 * 50 * 5
});

// 16/09/2026: pedido do Tiago - a fatia de Ações EUA precisa do valor
// em DÓLAR também (não só o BRL já somado acima), pra a legenda (ver
// renderDistribuicao) mostrar "US$ X (R$ Y)" em vez de só R$. Somado
// direto de precoAtual×quantidade (nunca convertido de volta a partir
// do BRL, pra não acumular arredondamento).
test('calcularDistribuicaoPorClasse() também devolve valorUsd (preço unitário em dólar × quantidade) na fatia Ações EUA', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5 });
  const fatiaUsa = distrib.find((f) => f.label === 'Ações EUA');
  assert.equal(fatiaUsa.valorUsd, 5000); // AAPL: 100 * 50
});

test('calcularDistribuicaoPorClasse() não adiciona valorUsd nas outras classes (Ações/FIIs/Renda Fixa)', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5 });
  distrib.filter((f) => f.label !== 'Ações EUA').forEach((f) => {
    assert.equal('valorUsd' in f, false);
  });
});

test('calcularDistribuicaoRendaEmergencial() agrupa por tipo de investimento, maior valor primeiro', () => {
  const distrib = calcularDistribuicaoRendaEmergencial(ATIVOS_RESUMO_EXEMPLO);
  assert.deepEqual(distrib.map((f) => f.label), ['Tesouro Selic', 'CDB'], 'só as posições marca=emergencial entram, ordenadas do maior pro menor');
  assert.equal(distrib[0].valor, 30000);
  assert.equal(distrib[1].valor, 10000);
});

test('renderDistribuicao() desenha uma fatia (arco do donut + item de legenda) por entrada', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Ações', cor: 'var(--acoes)', valor: 60 },
    { label: 'FIIs', cor: 'var(--fiis)', valor: 40 },
  ]);
  assert.equal(container.querySelectorAll('.distrib-arco').length, 2);
  assert.equal(container.querySelectorAll('.distrib-item').length, 2);
  assert.match(container.textContent, /60,0%/);
  assert.match(container.textContent, /40,0%/);
});

// 18/09/2026: dot+nome e valor+%+ícone agrupados em 2 wrappers
// (.distrib-nome-wrap/.distrib-valores) - min-width:0 sozinho não
// bastou num celular de verdade (Tiago testou e ainda vazava, mesmo
// depois do card virar item de grid com min-width:0); com os 2 grupos,
// .distrib-item empilha em 2 linhas abaixo de 480px (CSS), então cada
// linha só precisa caber sozinha.
test('renderDistribuicao() agrupa dot+nome (.distrib-nome-wrap) e valor+%+ícone (.distrib-valores) - permite empilhar em 2 linhas no mobile', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Ações', cor: 'var(--acoes)', valor: 60 },
  ]);
  const item = container.querySelector('.distrib-item');
  const nomeWrap = item.querySelector('.distrib-nome-wrap');
  const valores = item.querySelector('.distrib-valores');
  assert.ok(nomeWrap);
  assert.ok(valores);
  assert.ok(nomeWrap.querySelector('.distrib-dot'));
  assert.ok(nomeWrap.querySelector('.distrib-nome'));
  assert.ok(valores.querySelector('.distrib-valor'));
  assert.ok(valores.querySelector('.distrib-pct'));
  assert.ok(valores.querySelector('.info-icon'));
  // os 2 grupos são filhos diretos de .distrib-item, nessa ordem.
  assert.deepEqual(Array.from(item.children).map((el) => el.className), ['distrib-nome-wrap', 'distrib-valores']);
});

test('renderDistribuicao() mostra o valor em R$ de cada fatia, além da porcentagem (Tiago pediu os dois de volta na legenda)', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Ações', cor: 'var(--acoes)', valor: 60000 },
    { label: 'FIIs', cor: 'var(--fiis)', valor: 40000 },
  ]);
  const valores = Array.from(container.querySelectorAll('.distrib-valor')).map((el) => el.textContent);
  assert.deepEqual(valores, ['R$\xa060.000,00', 'R$\xa040.000,00']);
  assert.match(container.textContent, /60,0%/);
  assert.match(container.textContent, /40,0%/);
});

// 16/09/2026: pedido do Tiago - a fatia de Ações EUA (tem valorUsd)
// mostra USD com o equivalente em R$ entre parênteses, menor - as
// outras fatias (sem valorUsd) continuam só em R$, sem mudança.
test('renderDistribuicao() com valorUsd numa fatia mostra USD com o equivalente em R$ numa 2ª linha (Ações EUA)', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Ações', cor: 'var(--acoes)', valor: 60000 },
    { label: 'Ações EUA', cor: 'var(--usa)', valor: 27500, valorUsd: 5000 },
  ]);
  const valores = Array.from(container.querySelectorAll('.distrib-valor'));
  assert.match(valores[0].textContent, /R\$/);
  assert.equal(valores[0].textContent.includes('$5'), false);
  assert.match(valores[1].textContent, /\$5,000\.00|US\$/);
  assert.match(valores[1].textContent, /27\.500,00/);
  // 17/09/2026: o equivalente em R$ virou uma 2ª linha (.distrib-valor-abaixo)
  // embaixo do valor em dólar, em vez de ficar do lado na mesma linha
  // (.moeda-conv) - estourava a largura do card no mobile.
  const abaixo = valores[1].querySelector('.distrib-valor-abaixo');
  assert.ok(abaixo, 'equivalente em R$ vem numa span separada (menor/apagada), numa 2ª linha');
  assert.match(abaixo.textContent, /27\.500,00/);
});

test('renderDistribuicao() mostra um aviso (sem lançar) quando não há dado suficiente', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  assert.doesNotThrow(() => renderDistribuicao(doc, container, []));
  assert.match(container.textContent, /Sem dado/);
});

test('renderDistribuicao() põe um ícone "i" clicável (dataset.tooltip) com nome completo e % com 2 casas em cada item da legenda', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Renda Fixa - Tesouro Selic e afins', cor: 'var(--rf)', valor: 1 },
    { label: 'FIIs', cor: 'var(--fiis)', valor: 2 },
  ]);
  const [item1, item2] = container.querySelectorAll('.distrib-item');
  assert.equal(item1.classList.contains('info-alvo'), true);
  assert.ok(item1.querySelector('.info-icon'));
  assert.match(item1.dataset.tooltip, /Renda Fixa - Tesouro Selic e afins/);
  assert.match(item1.dataset.tooltip, /33,33%/);
  assert.match(item2.dataset.tooltip, /66,67%/);
});

// 19/09/2026 #6 (pedido do Tiago pro donut "Por setor" de Ações EUA, em
// carteiras-classe-comum.js!renderDistribuicaoGrupoCarteiras: "por
// default, mostra em dolar aqui, e no i, mantenha a versao em reais") -
// `formatarValor`/`formatarValorTooltip` deixam o valor principal da
// legenda (.distrib-valor) e o valor entre parênteses da tooltip usarem
// moedas/formatadores diferentes do padrão (formatBRL nos dois) - sem
// passar nada, comportamento idêntico a antes (ver os testes acima).
test('renderDistribuicao() com `formatarValor` mostra o valor principal nessa moeda (mantendo o padrão pra quem não passa nada)', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  const formatarValor = (v) => `US$ ${v.toFixed(2)}`;
  renderDistribuicao(doc, container, [
    { label: 'Financeiro', valor: 1835.11 },
  ], { formatarValor });
  assert.equal(container.querySelector('.distrib-valor').textContent, 'US$ 1835.11');
});

test('renderDistribuicao() sem `formatarValorTooltip` explícito usa o mesmo `formatarValor` também na tooltip', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  const formatarValor = (v) => `US$ ${v.toFixed(2)}`;
  renderDistribuicao(doc, container, [
    { label: 'Financeiro', valor: 1835.11 },
  ], { formatarValor });
  assert.match(container.querySelector('.distrib-item').dataset.tooltip, /US\$ 1835\.11/);
});

test('renderDistribuicao() com `formatarValor` e `formatarValorTooltip` diferentes mostra 1 moeda na legenda e outra na tooltip', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Financeiro', valor: 1835.11 },
  ], {
    formatarValor: (v) => `US$ ${v.toFixed(2)}`,
    formatarValorTooltip: (v) => `R$ ${(v * 5).toFixed(2)}`,
  });
  assert.equal(container.querySelector('.distrib-valor').textContent, 'US$ 1835.11');
  assert.match(container.querySelector('.distrib-item').dataset.tooltip, /R\$ 9175\.55/);
  assert.equal(container.querySelector('.distrib-valor').textContent.includes('R$'), false);
});











test('filtrarHistoricoPorPeriodo() corta os últimos N dias corridos do preset pedido - N variações = N+1 pontos (o 1º é a base)', () => {
  const historico = gerarHistoricoExemplo(40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, '30d').length, 31);
  assert.equal(filtrarHistoricoPorPeriodo(historico, '30d')[0], historico[9]);
});

test('filtrarHistoricoPorPeriodo() com "tudo" (ou preset desconhecido) devolve o array inteiro', () => {
  const historico = gerarHistoricoExemplo(40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, 'tudo').length, 40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, 'nao-existe').length, 40);
});

// 20/09/2026 (pedido do Tiago: "o desde o início de cada carteira varia, é
// sempre a 1ª data que comecei a investir naquele tipo") - Ações EUA/FIIs/
// Renda Fixa (sub-visões) começaram bem depois do início do patrimônio
// total, então "Desde o início" nessas telas tem que cortar pro início
// daquele CAMPO específico, não do historico inteiro.
test('filtrarHistoricoPorPeriodo("tudo", campoDesdeInicio) corta pro 1º dia em que ESSE campo específico tem valor válido', () => {
  const historico = gerarHistoricoExemplo(40); // ibovespa é null nos 3 primeiros dias (ver gerarHistoricoExemplo)
  const janela = filtrarHistoricoPorPeriodo(historico, 'tudo', 'ibovespa');
  assert.equal(janela.length, 37);
  assert.equal(janela[0], historico[3]);
});

test('filtrarHistoricoPorPeriodo("tudo", campoDesdeInicio) não corta nada quando o campo já é válido desde o 1º dia', () => {
  const historico = gerarHistoricoExemplo(40); // patrimonio é válido em todos os 40 dias
  const janela = filtrarHistoricoPorPeriodo(historico, 'tudo', 'patrimonio');
  assert.equal(janela.length, 40);
  assert.equal(janela[0], historico[0]);
});

test('filtrarHistoricoPorPeriodo("tudo") sem campoDesdeInicio continua devolvendo o array inteiro (comportamento antigo, default nunca corta)', () => {
  const historico = gerarHistoricoExemplo(40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, 'tudo').length, 40);
});

test('filtrarHistoricoPorPeriodo() com preset de dias fixos (ex.: "30d") ignora campoDesdeInicio - só "tudo" usa esse corte', () => {
  const historico = gerarHistoricoExemplo(40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, '30d', 'ibovespa').length, 31);
  assert.equal(filtrarHistoricoPorPeriodo(historico, '30d', 'ibovespa')[0], historico[9]);
});

test('filtrarHistoricoPorPeriodo() sem histórico (ou vazio) devolve array vazio, nunca lança', () => {
  assert.deepEqual(filtrarHistoricoPorPeriodo(undefined, '30d'), []);
  assert.deepEqual(filtrarHistoricoPorPeriodo([], '30d'), []);
});

test('filtrarHistoricoPorPeriodo("mes") recorta o MÊS-CALENDÁRIO do último dia de historico, não "os últimos 30 dias corridos"', () => {
  const historico = gerarHistoricoExemplo(40); // 01/01/2026 .. 09/02/2026 (o último dia é 09/02)
  const janela = filtrarHistoricoPorPeriodo(historico, 'mes');
  // 23/09/2026: + o último dia de janeiro como BASE (0% do gráfico), igual
  // o Gorila ("31 ago" no começo do Mês atual) - senão a variação do dia 1
  // ficava de fora da rentabilidade do mês.
  assert.equal(janela.length, 10, 'base (31/01) + os dias de fevereiro (01 a 09)');
  assert.equal(janela[0].data, '2026-01-31');
  assert.equal(janela[1].data, '2026-02-01');
  assert.equal(janela[janela.length - 1].data, historico[historico.length - 1].data);
});

test('normalizarSerieRentabilidade() calcula "% desde o início" a partir do 1º valor válido', () => {
  const janela = gerarHistoricoExemplo(5); // patrimonio: 100000,101000,102000,103000,104000
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio');
  assert.equal(serie[0], 0);
  assert.match(String(serie[4]), /4/); // (104000/100000 - 1) * 100 = 4
});

test('normalizarSerieRentabilidade() pula valores null (ibovespa antes do 1º pregão) sem quebrar - usa o 1º válido como base', () => {
  const janela = gerarHistoricoExemplo(5); // ibovespa: null,null,null,121500,122000
  const serie = normalizarSerieRentabilidade(janela, 'ibovespa');
  assert.equal(serie[0], null);
  assert.equal(serie[1], null);
  assert.equal(serie[2], null);
  assert.equal(serie[3], 0); // primeiro valor válido vira a base (0%)
});

test('normalizarSerieRentabilidade() sem nenhum valor válido na janela devolve tudo null (nunca divide por zero)', () => {
  const janela = [{ data: '2026-01-01', patrimonio: 0 }, { data: '2026-01-02', patrimonio: 0 }];
  assert.deepEqual(normalizarSerieRentabilidade(janela, 'patrimonio'), [null, null]);
});

// --- normalizarSerieRentabilidade() com campoFluxo (TWR - correção Gorilla) -

test('normalizarSerieRentabilidade() com campoFluxo NEUTRALIZA um aporte - depósito não aparece como ganho', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 110000, fluxoCaixaPatrimonio: 10000 }, // aporte de 10.000, 0 de ganho orgânico
    { data: '2026-01-03', patrimonio: 110000, fluxoCaixaPatrimonio: 0 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1]) < 1e-9, `esperado ~0%, veio ${serie[1]}`);
  assert.ok(Math.abs(serie[2]) < 1e-9, `esperado ~0%, veio ${serie[2]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo NEUTRALIZA uma retirada/venda - não aparece como perda', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 90000, fluxoCaixaPatrimonio: -10000 }, // retirada de 10.000, 0 de perda orgânica
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1]) < 1e-9, `esperado ~0%, veio ${serie[1]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo mede só o ganho ORGÂNICO quando aporte e ganho acontecem juntos', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    // 100.000 * 1,02 + aporte de 10.000 = 112.000 (2% de ganho orgânico + aporte)
    { data: '2026-01-02', patrimonio: 112000, fluxoCaixaPatrimonio: 10000 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.ok(Math.abs(serie[1] - 2) < 1e-9, `esperado 2%, veio ${serie[1]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo encadeia (compõe) retornos diários em vez de somar', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 110000, fluxoCaixaPatrimonio: 0 }, // +10%
    { data: '2026-01-03', patrimonio: 121000, fluxoCaixaPatrimonio: 0 }, // +10% de novo
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  // 1,10 * 1,10 - 1 = 0,21 -> 21%, não 20% (10% + 10% somado ingenuamente)
  assert.ok(Math.abs(serie[2] - 21) < 1e-9, `esperado 21% (composto), veio ${serie[2]}`);
});

test('normalizarSerieRentabilidade() sem campoFluxo mantém o cálculo antigo (compatibilidade com os benchmarks)', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000 },
    { data: '2026-01-02', patrimonio: 110000 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1] - 10) < 1e-9);
});

// 20/09/2026 (bug real achado com dados reais do Tiago via tests/harness/ -
// "Desde o início" travado perto de -100% pra sempre em Total/Longo Prazo/
// Nacional/Renda Fixa Total/Renda Emergencial, -101% em Carteira de Ações e
// -126% em Carteira de Ações EUA) - quando `fluxo` de um único dia é grande
// o bastante perto do `v` daquele dia (fontes desalinhadas - Transações e
// aux_historico-* não nasceram no mesmo instante), o retorno diário bruto
// vira algo tipo "-99,99%", e como o cálculo é COMPOSTO (multiplicativo),
// esse único dia trava o acumulado perto de -100% PRA SEMPRE, mesmo que
// todo o resto da série seja positivo. O clamp de sanidade em
// normalizarSerieRentabilidade neutraliza (retorno = 0%) qualquer dia fora
// da faixa fisicamente plausível pra uma carteira diversificada
// (-50% a +100%) em vez de deixar contaminar o resto da série.
test('normalizarSerieRentabilidade() com campoFluxo NEUTRALIZA um dia com fluxo desalinhado (bug real: trava perto de -100% pra sempre)', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    // fluxo (100.000) quase do tamanho do patrimonio anterior (100.000) -
    // sem o clamp, retornoDiaBruto = (100050 - 100000) / 100000 - 1 = -99,95%
    { data: '2026-01-02', patrimonio: 100050, fluxoCaixaPatrimonio: 100000 },
    // dia seguinte, totalmente normal (+~4,95% orgânico, sem fluxo)
    { data: '2026-01-03', patrimonio: 105000, fluxoCaixaPatrimonio: 0 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1]) < 1e-9, `dia com fluxo desalinhado devia virar 0% (neutro), veio ${serie[1]}`);
  // sem o clamp, isso ficaria travado em ~-99,95% - com o clamp, o ganho
  // orgânico do dia 3 aparece normalmente por cima do 0% do dia 2
  // (105000 / 100050 - 1 = 4,9475...%)
  assert.ok(Math.abs(serie[2] - 4.9475) < 1e-2, `esperado ~4,9475% (não mais travado perto de -100%), veio ${serie[2]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo NEUTRALIZA um dia com retorno bruto abaixo de -100% (fluxo maior que o próprio saldo)', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    // retornoDiaBruto = (50000 - 160000) / 100000 - 1 = -2,10 (-210%) - caso
    // real: Carteira de Ações em 19/01/2023 (retornoDia = -101,12%)
    { data: '2026-01-02', patrimonio: 50000, fluxoCaixaPatrimonio: 160000 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1]) < 1e-9, `retorno bruto < -100% devia virar 0% (neutro), veio ${serie[1]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo NEUTRALIZA um dia com retorno bruto acima de +100% (fluxo negativo desalinhado)', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    // retornoDiaBruto = (100000 - (-150000)) / 100000 - 1 = 1,50 (+150%)
    { data: '2026-01-02', patrimonio: 100000, fluxoCaixaPatrimonio: -150000 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1]) < 1e-9, `retorno bruto > +100% devia virar 0% (neutro), veio ${serie[1]}`);
});

test('normalizarSerieRentabilidade() com campoFluxo NÃO mexe num dia ruim de verdade (queda de mercado plausível, dentro da faixa)', () => {
  // o "Black Monday" de 1987 (pior dia de bolsa já registrado) foi -20,5% -
  // a faixa do clamp (-50% a +100%) tem que deixar isso passar ileso
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 80000, fluxoCaixaPatrimonio: 0 }, // -20% real, sem fluxo
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie[0], 0);
  assert.ok(Math.abs(serie[1] - (-20)) < 1e-9, `queda real de -20% não devia ser clampada, veio ${serie[1]}`);
});

// 05/10/2026 (A-20, auditoria): o dia fora da faixa continua neutro no % (senão trava em -100%), mas
// deixa de ser silencioso: fica em `suspeitos` e a tela avisa que % e ganho em R$ podem divergir.
test('A-20: dia fora da faixa plausível é registrado em `suspeitos` (não enumerável) e o resumo devolve diasSuspeitos', () => {
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 100050, fluxoCaixaPatrimonio: 100000 }, // fluxo desalinhado: retorno bruto -99,95%
    { data: '2026-01-03', patrimonio: 105000, fluxoCaixaPatrimonio: 0 },
  ];
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio', 'fluxoCaixaPatrimonio');
  assert.equal(serie.suspeitos.length, 1);
  assert.equal(serie.suspeitos[0].data, '2026-01-02');
  assert.ok(Math.abs(serie.suspeitos[0].retorno - (-99.95)) < 1e-6);
  assert.deepEqual(Object.keys(serie), ['0', '1', '2'], 'a propriedade não aparece em iteração/deepEqual');
  assert.deepEqual(normalizarSerieRentabilidade(janela.slice(0, 1).concat([{ data: '2026-01-02', patrimonio: 80000, fluxoCaixaPatrimonio: 0 }]), 'patrimonio', 'fluxoCaixaPatrimonio').suspeitos, [], 'queda real de -20% não é suspeita');
  const r = calcularResumoRentabilidade(undefined, janela, { visaoId: 'total', periodoId: 'tudo' });
  assert.equal(r.diasSuspeitos.length, 1);
  assert.equal(r.diasSuspeitos[0].data, '2026-01-02');
});

test('A-20: o cartão de rentabilidade avisa dos dias suspeitos (e não mostra aviso quando não há)', () => {
  const doc = makeDom('<div id="info"></div>');
  const janela = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    { data: '2026-01-02', patrimonio: 100050, fluxoCaixaPatrimonio: 100000 },
    { data: '2026-01-03', patrimonio: 105000, fluxoCaixaPatrimonio: 0 },
  ];
  const container = doc.getElementById('info');
  renderInfoRentabilidade(doc, container, { historico: janela, visaoId: 'total', periodoId: 'tudo' });
  const aviso = container.querySelector('.rentab-card-aviso');
  assert.ok(aviso, 'avisa');
  assert.match(aviso.textContent, /1 dia com variação fora do normal/);
  assert.match(aviso.textContent, /02\/01\/2026/);
  assert.match(aviso.textContent, /ganho em R\$ não/);
  renderInfoRentabilidade(doc, container, { historico: janela.slice(0, 1).concat([{ data: '2026-01-02', patrimonio: 101000, fluxoCaixaPatrimonio: 0 }]), visaoId: 'total', periodoId: 'tudo' });
  assert.equal(container.querySelector('.rentab-card-aviso'), null);
});

test('renderGraficoRentabilidade() desenha um <svg> com uma linha principal + 2 benchmarks pra visão "total"', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'total', periodoId: '30d' });
  const svg = container.querySelector('svg.chart-svg'); // 06/10/2026 (Onda 3): gráfico da biblioteca
  assert.ok(svg);
  assert.equal(svg.querySelectorAll('path.chart-linha').length, 3); // portfólio + ibovespa + cdi
});

test('renderGraficoRentabilidade() troca os benchmarks pra CDI+Selic na visão "rendaEmergencial"', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'rendaEmergencial', periodoId: '30d', legendaContainer: legenda });
  assert.match(legenda.textContent, /Selic/);
  assert.doesNotMatch(legenda.textContent, /Ibovespa/);
});

// 17/09/2026 #2: a visão "nacional" usa os MESMOS benchmarks de "total"
// (Ibovespa+CDI) - decisão registrada em BENCHMARKS_POR_VISAO.
test('renderGraficoRentabilidade() visão "nacional" desenha a linha do portfólio + Ibovespa+CDI (mesmos benchmarks de "total")', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'nacional', periodoId: '30d', legendaContainer: legenda });
  const svg = container.querySelector('svg.chart-svg');
  assert.ok(svg);
  assert.equal(svg.querySelectorAll('path.chart-linha').length, 3); // portfólio + ibovespa + cdi
  assert.match(legenda.textContent, /Ibovespa/);
  assert.match(legenda.textContent, /CDI/);
  assert.doesNotMatch(legenda.textContent, /Selic/);
});

test('renderGraficoRentabilidade() mostra, junto do nome de cada benchmark, o quanto o PORTFÓLIO ganhou ou perdeu EM RELAÇÃO a ele (não o retorno absoluto do benchmark)', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  // patrimonio sobe 1000/dia (base 100000) e indiceCdi sobe 0.1%/dia (base 100) -
  // o portfólio cresce MUITO mais rápido que o CDI na janela, então a %
  // ao lado do CDI (portfólio − CDI) tem que ser positiva e grande - bem
  // diferente do retorno absoluto do próprio CDI (que seria só uns 2-3%).
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'total', periodoId: '30d', legendaContainer: legenda });
  assert.match(legenda.textContent, /CDI\s*\+2[0-9],/, 'CDI deveria vir com a diferença (~+23%), não o retorno absoluto dele (~+2,9%)');
  assert.ok(legenda.querySelector('.chart-leg-val.is-up'), 'delta positivo (portfólio bateu o benchmark) usa a cor "good"');
});

test('renderGraficoRentabilidade() mostra NEGATIVO quando o portfólio fica ATRÁS do benchmark (bug real reportado pelo Tiago)', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  // Portfólio sobe só 0,8% na janela; Ibovespa sobe 20% - o portfólio fica
  // NITIDAMENTE atrás do Ibovespa, então a % ao lado dele tem que ser
  // negativa (não "+20%" - isso pareceria um ganho, quando na real é uma
  // perda relativa. Esse era exatamente o problema apontado no print: um
  // "+12,03%" verde do lado do Ibovespa enquanto o portfólio só subiu 5%).
  const historico = [
    { data: '2026-01-01', patrimonio: 100000, ibovespa: 100000, indiceCdi: 100 },
    { data: '2026-01-02', patrimonio: 100200, ibovespa: 105000, indiceCdi: 100.1 },
    { data: '2026-01-03', patrimonio: 100400, ibovespa: 110000, indiceCdi: 100.2 },
    { data: '2026-01-04', patrimonio: 100600, ibovespa: 115000, indiceCdi: 100.3 },
    { data: '2026-01-05', patrimonio: 100800, ibovespa: 120000, indiceCdi: 100.4 },
  ];
  renderGraficoRentabilidade(doc, container, { historico, visaoId: 'total', periodoId: 'tudo', legendaContainer: legenda });
  assert.match(legenda.textContent, /Ibovespa\s*−1[0-9],/, 'portfólio (+0,8%) muito atrás do Ibovespa (+20%) - diferença negativa, por volta de -19%');
  assert.ok(legenda.querySelector('.chart-leg-val.is-down'), 'delta negativo (portfólio atrás do benchmark) usa a cor "bad", nunca "good"');
});

test('renderGraficoRentabilidade() mostra um aviso (sem lançar) quando não há histórico suficiente', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  assert.doesNotThrow(() => renderGraficoRentabilidade(doc, container, { historico: [], visaoId: 'total', periodoId: '30d' }));
  assert.match(container.textContent, /Sem histórico/);
});

// --- Hover/touch do gráfico (13/09/2026, 3ª rodada - antes não tinha
// NENHUMA interação ligada ao SVG: mouse/touch não mostravam nada) -----------

// 5 dias corridos, com Ibovespa/CDI também variando, pra dar pra checar a
// tooltip trazendo o valor de cada série no mesmo dia.
const HISTORICO_HOVER_EXEMPLO = [
  { data: '2026-01-01', patrimonio: 100000, ibovespa: 100000, indiceCdi: 100 },
  { data: '2026-01-02', patrimonio: 101000, ibovespa: 101000, indiceCdi: 100.1 },
  { data: '2026-01-03', patrimonio: 102000, ibovespa: 102000, indiceCdi: 100.2 },
  { data: '2026-01-04', patrimonio: 103000, ibovespa: 103000, indiceCdi: 100.3 },
  { data: '2026-01-05', patrimonio: 104000, ibovespa: 104000, indiceCdi: 100.4 },
];

// 06/10/2026 (Onda 3): o hover é o da biblioteca (charts/xy.js): tooltip escura multilinha (.chart-tip) + linha-guia (.chart-cruz).
// jsdom não tem layout: damos uma caixa de 640px ao <svg> pra o clientX virar posição dentro do gráfico.
function prepararHover_(container) {
  const svg = container.querySelector('svg.chart-svg');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 240, right: 640, bottom: 240, x: 0, y: 0 });
  return svg;
}
const ponteiro_ = (doc, tipo, init) => new doc.defaultView.MouseEvent(tipo, { bubbles: true, cancelable: true, ...init });

test('renderGraficoRentabilidade() esconde a tooltip e a linha-guia antes de qualquer interação', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  assert.equal(container.querySelector('.chart-tip').classList.contains('is-on'), false);
  assert.equal(container.querySelector('.chart-cruz').classList.contains('is-on'), false);
});

test('renderGraficoRentabilidade() pointermove sobre o gráfico mostra a tooltip com a data e o valor de cada série', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });
  const svg = prepararHover_(container);
  svg.dispatchEvent(ponteiro_(doc, 'pointermove', { clientX: 330, clientY: 50 }));

  const tooltip = container.querySelector('.chart-tip');
  assert.equal(tooltip.classList.contains('is-on'), true);
  assert.match(tooltip.textContent, /03\/01\/2026/);
  assert.match(tooltip.textContent, /Portfólio/);
  assert.match(tooltip.textContent, /Ibovespa/);
  assert.match(tooltip.textContent, /CDI/);
  assert.equal(container.querySelector('.chart-cruz').classList.contains('is-on'), true, 'linha-guia aparece junto com a tooltip');
});

test('renderGraficoRentabilidade() pointerdown (toque, sem "arrastar" o dedo antes) também mostra a tooltip', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });
  prepararHover_(container).dispatchEvent(ponteiro_(doc, 'pointerdown', { clientX: 200, clientY: 50 }));

  assert.equal(container.querySelector('.chart-tip').classList.contains('is-on'), true);
});

test('renderGraficoRentabilidade() pointerleave esconde a tooltip e a linha-guia de novo', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });
  const svg = prepararHover_(container);
  svg.dispatchEvent(ponteiro_(doc, 'pointermove', { clientX: 330, clientY: 50 }));
  assert.equal(container.querySelector('.chart-tip').classList.contains('is-on'), true);

  svg.dispatchEvent(ponteiro_(doc, 'pointerleave', {}));
  assert.equal(container.querySelector('.chart-tip').classList.contains('is-on'), false);
  assert.equal(container.querySelector('.chart-cruz').classList.contains('is-on'), false);
});

// --- renderInfoRentabilidade -------------------------------------------------

const PATRIMONIO_RENTAB_EXEMPLO = { total: 104000, longoPrazo: 90000, nacional: 70000, rendaEmergencial: 14000 };

test('renderInfoRentabilidade() mostra o valor atual + o R$ ganho/perdido + a variação em % no período (mesmo par de pontos que alimenta a linha do gráfico)', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  renderInfoRentabilidade(doc, container, {
    patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
    historico: gerarHistoricoExemplo(5), // patrimonio: 100000..104000 -> +R$4.000, +4% no período
    visaoId: 'total',
    periodoId: 'tudo',
  });
  assert.match(container.querySelector('.rentab-card-value').textContent, /104\.000/);
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /\+R\$\s*4\.000,00/, 'precisa mostrar o valor em R$ ganho, não só a %');
  assert.match(textoDelta, /\+4,00%/);
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('good'), true);
});

test('renderInfoRentabilidade() mostra o R$ PERDIDO (com sinal de menos, sem duplicar) quando o período é negativo', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  const historico = [
    { data: '2026-01-01', patrimonio: 104000 },
    { data: '2026-01-02', patrimonio: 102000 },
    { data: '2026-01-03', patrimonio: 100000 },
  ];
  renderInfoRentabilidade(doc, container, {
    patrimonio: { total: 100000 },
    historico,
    visaoId: 'total',
    periodoId: 'tudo',
  });
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /−R\$\s*4\.000,00/, 'perda de R$4.000 (104.000 -> 100.000), sinal único');
  assert.doesNotMatch(textoDelta, /-R\$\s*-/, 'nunca dois sinais de menos juntos');
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('bad'), true);
});

test('renderInfoRentabilidade() desconta o fluxo de caixa (aporte) também do R$ ganho, não só da % (correção Gorilla)', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  const historico = [
    { data: '2026-01-01', patrimonio: 100000, fluxoCaixaPatrimonio: 0 },
    // +2.000 de ganho orgânico + aporte de 10.000 = 112.000 brutos, mas só 2.000 é ganho de verdade
    { data: '2026-01-02', patrimonio: 112000, fluxoCaixaPatrimonio: 10000 },
  ];
  renderInfoRentabilidade(doc, container, {
    patrimonio: { total: 112000 },
    historico,
    visaoId: 'total',
    periodoId: 'tudo',
  });
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /\+R\$\s*2\.000,00/, 'o aporte de 10.000 não pode contar como ganho - só os 2.000 orgânicos');
  assert.doesNotMatch(textoDelta, /12\.000,00/, 'não pode mostrar o delta bruto (112.000-100.000) sem descontar o aporte');
});

test('renderInfoRentabilidade() sem histórico suficiente no período mostra o valor mas nenhuma variação (nunca lança)', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  assert.doesNotThrow(() => renderInfoRentabilidade(doc, container, { patrimonio: PATRIMONIO_RENTAB_EXEMPLO, historico: [], visaoId: 'total' }));
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('na'), true);
});

// 17/09/2026 #2: visão "nacional" - rótulo certo + usa o campo `nacional`
// (não `longoPrazo`) do historico pra calcular a % do período.
test('renderInfoRentabilidade() visão "nacional" mostra o rótulo "Patrimônio Nacional" e calcula a partir do campo `nacional` do historico', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  const historico = [
    { data: '2026-01-01', nacional: 60000, fluxoCaixaNacional: 0 },
    { data: '2026-01-02', nacional: 63000, fluxoCaixaNacional: 0 },
  ];
  renderInfoRentabilidade(doc, container, {
    patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
    historico,
    visaoId: 'nacional',
    periodoId: 'tudo',
  });
  assert.match(container.querySelector('.rentab-card-label').textContent, /Patrimônio Nacional/);
  assert.match(container.querySelector('.rentab-card-value').textContent, /70\.000/, 'valor atual vem de patrimonio.nacional, não do historico');
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /\+R\$\s*3\.000,00/);
  assert.match(textoDelta, /\+5,00%/);
});

// --- wireGraficoRentabilidade -------------------------------------------------

test('wireGraficoRentabilidade() renderiza os 3 painéis de cara (sempre visíveis, sem precisar de clique) e reage ao período em todos ao mesmo tempo', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="periodoTabs">
      <button class="filter-tab" data-periodo="30d">30 dias</button>
      <button class="filter-tab active" data-periodo="12m">12 meses</button>
    </div>
    <div id="infoTotal"></div><div id="chartTotal"></div><div id="legendaTotal"></div>
    <div id="infoRE"></div><div id="chartRE"></div><div id="legendaRE"></div>
  `);
  const historico = gerarHistoricoExemplo(40);
  const paineis = [
    { visaoId: 'total', infoContainer: doc.getElementById('infoTotal'), chartContainer: doc.getElementById('chartTotal'), legendaContainer: doc.getElementById('legendaTotal') },
    { visaoId: 'rendaEmergencial', infoContainer: doc.getElementById('infoRE'), chartContainer: doc.getElementById('chartRE'), legendaContainer: doc.getElementById('legendaRE') },
  ];

  wireGraficoRentabilidade(doc, {
    patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
    historico,
    periodoTabsContainer: doc.getElementById('periodoTabs'),
    paineis,
    periodoInicial: '12m',
  });

  assert.ok(doc.getElementById('chartTotal').querySelector('svg'), 'já renderiza de cara, sem esperar clique nenhum');
  assert.ok(doc.getElementById('chartRE').querySelector('svg'));
  assert.match(doc.getElementById('legendaRE').textContent, /Selic/, 'painel de Renda Emergencial já usa os benchmarks certos de cara');

  doc.getElementById('periodoTabs').querySelector('[data-periodo="30d"]')
    .dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  assert.equal(doc.getElementById('periodoTabs').querySelector('[data-periodo="30d"]').classList.contains('active'), true);
  assert.ok(doc.getElementById('chartTotal').querySelector('svg'), 'os dois painéis continuam atualizados no mesmo clique de período');
  assert.ok(doc.getElementById('chartRE').querySelector('svg'));
});

test('wireGraficoRentabilidade() sem periodoInicial explícito usa "mes" (o pill marcado active no HTML) como padrão', () => {
  // Compara o resultado sem periodoInicial contra o resultado com
  // periodoInicial:'mes' explícito - se os dois cartões renderizarem
  // idêntico, o default é mesmo 'mes' (14/09/2026, pedido do Tiago: trocar
  // o período padrão da Rentabilidade de "12 meses" pra "Mês atual").
  const historico = gerarHistoricoExemplo(400);

  function montarERetornarHtml(periodoInicial) {
    const doc = makeDom(`
      <div class="filter-tabs" id="periodoTabs">
        <button class="filter-tab active" data-periodo="mes">Mês atual</button>
        <button class="filter-tab" data-periodo="12m">12 meses</button>
      </div>
      <div id="infoTotal"></div><div id="chartTotal"></div><div id="legendaTotal"></div>
    `);
    wireGraficoRentabilidade(doc, {
      patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
      historico,
      periodoTabsContainer: doc.getElementById('periodoTabs'),
      paineis: [{ visaoId: 'total', infoContainer: doc.getElementById('infoTotal'), chartContainer: doc.getElementById('chartTotal'), legendaContainer: doc.getElementById('legendaTotal') }],
      ...(periodoInicial ? { periodoInicial } : {}),
    });
    return doc.getElementById('infoTotal').innerHTML;
  }

  const htmlSemPeriodoInicial = montarERetornarHtml(undefined);
  const htmlComMesExplicito = montarERetornarHtml('mes');
  const htmlCom12mExplicito = montarERetornarHtml('12m');

  assert.equal(htmlSemPeriodoInicial, htmlComMesExplicito);
  assert.notEqual(htmlSemPeriodoInicial, htmlCom12mExplicito);
});


test('criarAtivoCard() de Ações vira o cartão inteiro clicável, com viés e desconto', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_ACAO_EXEMPLO);
  assert.equal(card.tagName, 'A');
  // 25/09/2026: tela Detalhe do ativo (link-ativo.js) - endereço absoluto a partir da raiz do site
  assert.match(card.getAttribute('href'), /\/ativo\/index\.html\?ref=BBAS3$/);
  assert.match(card.querySelector('.ativo-ticker').textContent, /BBAS3/);
  assert.ok(card.querySelector('.vies-badge.comprar'));
  assert.equal(card.querySelector('.ativo-delta').classList.contains('bad'), true); // variação negativa
  assert.match(card.querySelector('.ativo-detalhe').textContent, /12%/);
});

test('criarAtivoCard() de Ações EUA mostra o preço convertido pra BRL ao lado do preço em USD', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_USA_EXEMPLO);
  assert.match(card.querySelector('.ativo-price').textContent, /320/);
  assert.match(card.querySelector('.ativo-price-conv').textContent, /1\.732/);
});

test('criarAtivoCard() de Renda Fixa usa nome + instituição (não o rótulo composto) como ref, e mostra indexador+vencimento no lugar do desconto', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_RF_EXEMPLO);
  assert.equal(new URL(card.getAttribute('href')).searchParams.get('ref'), 'rf:Tesouro Selic 2029|CORRETORA EXEMPLO');
  assert.equal(card.querySelector('.vies-badge'), null, 'Renda Fixa não tem preço-teto, então não tem viés');
  assert.match(card.querySelector('.ativo-detalhe').textContent, /Selic/);
  assert.match(card.querySelector('.ativo-detalhe').textContent, /03\/2029/);
  assert.match(card.querySelector('.ativo-price').textContent, /12\.480/);
});

test('wireTooltipAtivos() no pointermove sobre um cartão de Ação mostra Nome, Quantidade, Preço Teto/Médio e os descontos', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  const ativo = { ...ATIVO_ACAO_EXEMPLO, quantidade: 140, precoMedio: 18.9, precoTeto: 26.4, descontoPVp: '132% (1,32 P/VP)' };
  renderMeusAtivos(doc, grid, [ativo], 'todos');
  wireTooltipAtivos(doc, grid);

  const card = grid.querySelector('.ativo-card');
  card.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));

  const tooltip = doc.body.querySelector('.ativo-tooltip');
  assert.equal(tooltip.hidden, false);
  assert.match(tooltip.textContent, /BBAS3/);
  assert.match(tooltip.textContent, /Banco do Brasil/);
  assert.match(tooltip.textContent, /Quantidade de ações/);
  assert.match(tooltip.textContent, /140/);
  assert.match(tooltip.textContent, /Preço teto/);
  assert.match(tooltip.textContent, /Preço médio/);
  assert.match(tooltip.textContent, /Desconto sobre P\/L/);
  assert.match(tooltip.textContent, /12% \(0,88 P\/L\)/);
});

test('wireTooltipAtivos() de FII mostra Tipo (Tijolo/Papel) em vez de Desconto sobre P/L, e a Quantidade de cotas', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_FII_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  grid.querySelector('.ativo-card')
    .dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));

  const tooltip = doc.body.querySelector('.ativo-tooltip');
  assert.match(tooltip.textContent, /CSHG Renda Urbana/);
  assert.match(tooltip.textContent, /Tijolo/);
  assert.match(tooltip.textContent, /Quantidade de cotas/);
  assert.match(tooltip.textContent, /37/);
  assert.match(tooltip.textContent, /108% \(1,08 P\/VP\)/);
  assert.doesNotMatch(tooltip.textContent, /P\/L/, 'FII não tem P/L, mostra Tipo no lugar');
});

test('wireTooltipAtivos() de Ações EUA mostra Preço Teto/Médio em US$ com o equivalente em R$, e omite Desconto sobre P/L quando a planilha não tem esse dado', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  const ativo = {
    classe: 'usa', ticker: 'CHTR', nome: 'Charter Communications', precoAtual: 320.5, precoAtualBRL: 1732.5,
    variacaoDia: 0.008, vies: 'aguardar', quantidade: 12, precoTeto: 340, precoTetoBRL: 1836,
    precoMedio: 280, precoMedioBRL: 1512, descontoPVp: '95% (0,95 P/VP)',
  };
  renderMeusAtivos(doc, grid, [ativo], 'todos');
  wireTooltipAtivos(doc, grid);

  grid.querySelector('.ativo-card')
    .dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));

  const tooltip = doc.body.querySelector('.ativo-tooltip');
  assert.match(tooltip.textContent, /Charter Communications/);
  assert.match(tooltip.textContent, /US\$\s340,00/, 'preço teto em USD (formatUSD: "US$", vírgula decimal)');
  assert.match(tooltip.textContent, /R\$.1\.836,00/, 'equivalente em R$ (formatBRL) entre parênteses ao lado');
  assert.match(tooltip.textContent, /95% \(0,95 P\/VP\)/);
  assert.doesNotMatch(tooltip.textContent, /P\/L/, 'Ações EUA ainda não tem P\/L na planilha - linha omitida, não "—"');
});

test('wireTooltipAtivos() de Renda Fixa mostra Tipo de investimento, Indexador, Vencimento e Valor atualizado (não Nome/Quantidade)', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_RF_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  grid.querySelector('.ativo-card')
    .dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));

  const tooltip = doc.body.querySelector('.ativo-tooltip');
  assert.match(tooltip.textContent, /Tipo de investimento/);
  assert.match(tooltip.textContent, /Tesouro Selic/);
  assert.match(tooltip.textContent, /Indexador/);
  assert.match(tooltip.textContent, /Vencimento/);
  assert.match(tooltip.textContent, /03\/2029/);
  assert.match(tooltip.textContent, /Valor atualizado/);
  assert.match(tooltip.textContent, /12\.480,55/);
  assert.doesNotMatch(tooltip.textContent, /Quantidade/);
});

test('wireTooltipAtivos() pointerdown (toque) também mostra a tooltip, e pointerleave esconde de novo', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const card = grid.querySelector('.ativo-card');
  card.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false);

  grid.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, true);
});

test('wireTooltipAtivos() chamada de novo no mesmo container (refresh) não duplica a div de tooltip nem os listeners', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);
  wireTooltipAtivos(doc, grid); // simula um refresh (montarPaginaInicio chamando de novo)

  assert.equal(doc.body.querySelectorAll('.ativo-tooltip').length, 1);

  const card = grid.querySelector('.ativo-card');
  card.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false);
});

// pedido do Tiago (16/09/2026): "quando é mobile, todos os lugares que
// possuem um tooltip, faça com que tenha um i do lado, clicável... Se eu
// clico fora, o tooltip some" - no toque (pointerType 'touch'/'pen'), só
// o ícone .ativo-info-icon abre/fecha a tooltip (o cartão inteiro é um
// link, não pode virar gatilho de toque sem disparar a navegação junto).

test('wireTooltipAtivos() no toque (pointerType "touch"), só o ícone "i" abre a tooltip - tocar no resto do cartão não faz nada', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const card = grid.querySelector('.ativo-card');
  card.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 50, clientY: 50, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, true, 'tocar fora do ícone "i" não abre nada');

  const icone = card.querySelector('.ativo-info-icon');
  icone.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 52, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false, 'tocar no ícone "i" abre a tooltip');
});

test('wireTooltipAtivos() no toque, tocar de novo no mesmo ícone "i" fecha (alterna) - e pointerleave sozinho não fecha mais', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const icone = grid.querySelector('.ativo-card .ativo-info-icon');
  icone.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 52, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false);

  // No toque, o fim do toque já dispara pointerleave (o dedo "sai" da
  // tela) - isso NÃO pode fechar a tooltip sozinho, senão é o bug
  // relatado pelo Tiago ("o tooltip aparece e some").
  grid.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true, pointerType: 'touch' }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false, 'pointerleave no toque não esconde');

  icone.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 52, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, true, '2º toque no mesmo ícone fecha (alterna)');
});

test('wireTooltipAtivos() no toque, tocar fora do cartão aberto fecha a tooltip', () => {
  const doc = makeDom('<div id="grid"></div><div id="fora">Fora do cartão</div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO, ATIVO_FII_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const icone = grid.querySelectorAll('.ativo-card .ativo-info-icon')[0];
  icone.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 52, clientY: 20, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, false);

  doc.getElementById('fora').dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', {
    clientX: 900, clientY: 900, bubbles: true, pointerType: 'touch',
  }));
  assert.equal(doc.body.querySelector('.ativo-tooltip').hidden, true, 'toque fora do cartão fecha a tooltip aberta');
});

test('wireTooltipAtivos() clicar no ícone "i" nunca navega (preventDefault/stopPropagation), mesmo no mouse', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);

  const icone = grid.querySelector('.ativo-card .ativo-info-icon');
  const evento = new doc.defaultView.Event('click', { bubbles: true, cancelable: true });
  icone.dispatchEvent(evento);
  assert.equal(evento.defaultPrevented, true);
});

// --- criarAtivoCard(): rodapé de ações (17/09/2026) --------------------------
// Reorganização dos 3 "gatilhos" do cartão (clique geral -> Detalhe do
// Ativo, ícone "i" -> info rápida, novo ícone de gráfico) numa linha de
// ações dedicada no rodapé, a pedido do Tiago.

test('criarAtivoCard() tem um rodapé de ações com os ícones de info e de gráfico, fora de .ativo-id', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_ACAO_EXEMPLO);
  const rodape = card.querySelector('.ativo-card-acoes');
  assert.ok(rodape);
  assert.ok(rodape.querySelector('.ativo-info-icon'));
  assert.ok(rodape.querySelector('.ativo-grafico-icon'));
  // os 2 ícones saíram de dentro de .ativo-id (perto do ticker) - só o ticker/badge de classe continuam lá.
  assert.equal(card.querySelector('.ativo-id .ativo-info-icon'), null);
  assert.equal(card.querySelector('.ativo-id .ativo-grafico-icon'), null);
});

// --- wireGraficoAtivo() -------------------------------------------------------
// Popover ("alertinha") do gráfico de preço - sempre clique/toque pra
// abrir e fechar (nos 2), ao contrário do ícone "i" (que no mouse já
// mostra com hover) - por isso 1 listener de `click` só cobre mouse e o
// clique sintético do toque, sem precisar checar pointerType.
//
// getHistoricoAtivoImpl é injetável (mesmo padrão de getHomeImpl em
// montarPaginaInicio) - os testes que só checam abrir/fechar o popover
// usam implHistoricoFake_() (resolve rápido, sem se importar com o
// conteúdo) pra não depender de fetch/rede de verdade; os testes da
// próxima seção (17/09/2026, 2ª rodada) exercitam a busca em si
// (token/ticker passados certos, cache, troca de período, Renda Fixa,
// resposta que chega atrasada).

// 3ª data dentro do Mês atual (setembro/2026, mesmo mês da última linha) -
// o filtro padrão ('mes') só mantém dias do MESMO mês da última data (ver
// filtrarHistoricoPorPeriodo) - com 1 dia só em setembro a janela ficaria
// com <2 pontos e o gráfico cairia no aviso "sem histórico suficiente" em
// vez de desenhar, o que quebraria os testes que esperam ver o <svg>.
const SERIE_ATIVO_EXEMPLO = [
  { data: '2026-07-01', preco: 20.10 },
  { data: '2026-08-01', preco: 21.50 },
  { data: '2026-09-01', preco: 21.80 },
  { data: '2026-09-15', preco: 22.14 },
];

function implHistoricoFake_(serie = SERIE_ATIVO_EXEMPLO) {
  return async () => ({ ok: true, resultado: { ticker: 'BBAS3', serie } });
}


test('wireGraficoAtivo() clicar no ícone de gráfico abre o popover com o ticker do ativo, sem navegar', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });

  const icone = grid.querySelector('.ativo-card .ativo-grafico-icon');
  const evento = new doc.defaultView.Event('click', { bubbles: true, cancelable: true });
  icone.dispatchEvent(evento);

  assert.equal(evento.defaultPrevented, true, 'nunca navega pro Detalhe do Ativo');
  const popover = doc.body.querySelector('.ativo-grafico-popover');
  assert.ok(popover);
  assert.equal(popover.hidden, false);
  assert.match(popover.querySelector('.ativo-grafico-popover-ticker').textContent, /BBAS3/);
});

test('wireGraficoAtivo() clicar de novo no mesmo ícone fecha o popover (alterna)', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });

  const icone = grid.querySelector('.ativo-card .ativo-grafico-icon');
  icone.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(doc.body.querySelector('.ativo-grafico-popover').hidden, false);

  icone.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(doc.body.querySelector('.ativo-grafico-popover').hidden, true);
});

test('wireGraficoAtivo() o botão "×" do popover fecha', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });

  grid.querySelector('.ativo-card .ativo-grafico-icon').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  const popover = doc.body.querySelector('.ativo-grafico-popover');
  assert.equal(popover.hidden, false);

  popover.querySelector('.ativo-grafico-popover-fechar').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(popover.hidden, true);
});

test('wireGraficoAtivo() clicar fora do cartão aberto (e fora do popover) fecha', () => {
  const doc = makeDom('<div id="grid"></div><div id="fora">Fora do cartão</div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });

  grid.querySelector('.ativo-card .ativo-grafico-icon').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(doc.body.querySelector('.ativo-grafico-popover').hidden, false);

  doc.getElementById('fora').dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', { clientX: 900, clientY: 900, bubbles: true }));
  assert.equal(doc.body.querySelector('.ativo-grafico-popover').hidden, true);
});

test('wireGraficoAtivo() abrir o gráfico de outro cartão troca o popover (fecha o anterior, abre o novo)', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO, ATIVO_FII_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });

  const icones = grid.querySelectorAll('.ativo-card .ativo-grafico-icon');
  icones[0].dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  const popover = doc.body.querySelector('.ativo-grafico-popover');
  assert.match(popover.querySelector('.ativo-grafico-popover-ticker').textContent, /BBAS3/);

  icones[1].dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(popover.hidden, false);
  assert.match(popover.querySelector('.ativo-grafico-popover-ticker').textContent, /HGRU11/);
});

test('wireGraficoAtivo() clicar no ícone "i" não abre o popover de gráfico (cada ícone com seu próprio gatilho)', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireTooltipAtivos(doc, grid);
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });

  grid.querySelector('.ativo-card .ativo-info-icon').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(doc.body.querySelector('.ativo-grafico-popover').hidden, true);
});

test('wireGraficoAtivo() religar no mesmo container (ex.: depois de "Atualizar dados") não duplica o popover nem os listeners', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos'); // simula o redesenho de "Atualizar dados"
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });

  assert.equal(doc.body.querySelectorAll('.ativo-grafico-popover').length, 1);

  const icone = grid.querySelector('.ativo-card .ativo-grafico-icon');
  icone.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(doc.body.querySelector('.ativo-grafico-popover').hidden, false);
});

// --- wireGraficoAtivo(): busca do histórico de preço (17/09/2026, 2ª rodada) --
// Pedido do Tiago após a 1ª rodada (placeholder "chegando em breve"):
// "continue com os gráficos dos cards". O período padrão segue o mesmo
// filtro da Rentabilidade ("Siga o filtro que usamos na sessao
// Rentabilidade, onde o default é mes atual") e o gráfico plota
// "Preço bruto (R$ ou US$, conforme o ativo)" - as 2 respostas do
// Tiago às perguntas de esclarecimento desta feature.

test('wireGraficoAtivo() ao abrir, busca o histórico com o token e o ticker do ativo, mostrando "Carregando…" antes da resposta chegar', async () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');

  const chamadas = [];
  let resolver;
  const promessa = new Promise((r) => { resolver = r; });
  wireGraficoAtivo(doc, grid, {
    token: 'tok-123',
    getHistoricoAtivoImpl: async (token, ticker) => { chamadas.push([token, ticker]); return promessa; },
  });

  grid.querySelector('.ativo-card .ativo-grafico-icon').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(chamadas, [['tok-123', 'BBAS3']]);
  assert.match(doc.body.querySelector('.ativo-grafico-popover-corpo').textContent, /Carregando/);

  resolver({ ok: true, resultado: { ticker: 'BBAS3', serie: SERIE_ATIVO_EXEMPLO } });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const corpo = doc.body.querySelector('.ativo-grafico-popover-corpo');
  assert.ok(corpo.querySelector('.ativo-grafico-periodo'), 'monta o filtro de período');
  assert.ok(corpo.querySelector('svg.chart-svg'), 'desenha o gráfico');
});

test('wireGraficoAtivo() o filtro de período vem com os mesmos 6 presets da Rentabilidade, "Mês atual" ativo por padrão', async () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, { token: 'tok', getHistoricoAtivoImpl: implHistoricoFake_() });

  grid.querySelector('.ativo-card .ativo-grafico-icon').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const pills = Array.from(doc.body.querySelectorAll('.ativo-grafico-periodo .chart-seg-btn[data-periodo]'));
  assert.deepEqual(pills.map((p) => p.dataset.periodo), ['mes', '30d', '6m', '12m', '3a', 'tudo']);
  assert.equal(pills.find((p) => p.dataset.periodo === 'mes').classList.contains('active'), true);
  // 02/10/2026: + o chip "Escolher período" no fim (periodo-personalizado.js)
  assert.ok(doc.body.querySelector('.ativo-grafico-periodo .fp-chip:last-child'));
});

test('wireGraficoAtivo() trocar de período redesenha o gráfico sem nova busca de rede', async () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  let chamadas = 0;
  wireGraficoAtivo(doc, grid, {
    token: 'tok',
    getHistoricoAtivoImpl: async () => { chamadas += 1; return { ok: true, resultado: { ticker: 'BBAS3', serie: SERIE_ATIVO_EXEMPLO } }; },
  });

  grid.querySelector('.ativo-card .ativo-grafico-icon').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const pill12m = doc.body.querySelector('.chart-seg-btn[data-periodo="12m"]');
  pill12m.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));

  assert.equal(pill12m.classList.contains('active'), true);
  assert.equal(doc.body.querySelector('.chart-seg-btn[data-periodo="mes"]').classList.contains('active'), false);
  assert.equal(chamadas, 1, 'trocar de período não bate na API de novo');
});

test('wireGraficoAtivo() reabrir o MESMO card não busca de novo (cache no próprio card)', async () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  let chamadas = 0;
  wireGraficoAtivo(doc, grid, {
    token: 'tok',
    getHistoricoAtivoImpl: async () => { chamadas += 1; return { ok: true, resultado: { ticker: 'BBAS3', serie: SERIE_ATIVO_EXEMPLO } }; },
  });

  const icone = grid.querySelector('.ativo-card .ativo-grafico-icon');
  icone.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true })); // abre
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  icone.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true })); // fecha
  icone.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true })); // abre de novo
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  assert.equal(chamadas, 1);
  assert.ok(doc.body.querySelector('svg.chart-svg'), 'redesenha o gráfico na 2ª abertura, do cache');
});

test('wireGraficoAtivo() ativo de Renda Fixa mostra aviso de indisponível, sem tentar buscar', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_RF_EXEMPLO], 'todos');
  let chamado = false;
  wireGraficoAtivo(doc, grid, {
    token: 'tok',
    getHistoricoAtivoImpl: async () => { chamado = true; return { ok: true, resultado: { ticker: 'x', serie: [] } }; },
  });

  grid.querySelector('.ativo-card .ativo-grafico-icon').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));

  assert.equal(chamado, false);
  assert.match(doc.body.querySelector('.ativo-grafico-popover-corpo').textContent, /Renda Fixa/);
});

test('wireGraficoAtivo() resposta de erro do back-end mostra aviso, sem quebrar', async () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, {
    token: 'tok',
    getHistoricoAtivoImpl: async () => ({ ok: false, etapa: 'historicoAtivo', erro: 'boom' }),
  });

  grid.querySelector('.ativo-card .ativo-grafico-icon').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  assert.match(doc.body.querySelector('.ativo-grafico-popover-corpo').textContent, /Não deu pra carregar/);
});

test('wireGraficoAtivo() troca de card antes da resposta chegar descarta a resposta antiga (não sobrescreve o card novo)', async () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO, ATIVO_FII_EXEMPLO], 'todos');

  let resolverLenta;
  const promessaLenta = new Promise((r) => { resolverLenta = r; });
  wireGraficoAtivo(doc, grid, {
    token: 'tok',
    getHistoricoAtivoImpl: async (token, ticker) => {
      if (ticker === 'BBAS3') return promessaLenta; // fica pendurada
      return { ok: true, resultado: { ticker, serie: SERIE_ATIVO_EXEMPLO } };
    },
  });

  const icones = grid.querySelectorAll('.ativo-card .ativo-grafico-icon');
  icones[0].dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true })); // abre BBAS3 (fica "Carregando…")
  icones[1].dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true })); // troca pra HGRU11 antes da 1ª resposta
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  assert.match(doc.body.querySelector('.ativo-grafico-popover-ticker').textContent, /HGRU11/);
  assert.ok(doc.body.querySelector('svg.chart-svg'), 'HGRU11 já mostra o gráfico normalmente');

  // Resposta antiga (BBAS3) chega tarde - não pode sobrescrever o corpo do HGRU11.
  resolverLenta({ ok: true, resultado: { ticker: 'BBAS3', serie: SERIE_ATIVO_EXEMPLO } });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  assert.match(doc.body.querySelector('.ativo-grafico-popover-ticker').textContent, /HGRU11/, 'continua mostrando o card que está aberto de verdade');
});

test('wireGraficoAtivo() hover no gráfico mostra o tooltip com o preço formatado na moeda do ativo (R$ pra Ações, US$ pra USA)', async () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderMeusAtivos(doc, grid, [ATIVO_ACAO_EXEMPLO, ATIVO_USA_EXEMPLO], 'todos');
  wireGraficoAtivo(doc, grid, {
    token: 'tok',
    getHistoricoAtivoImpl: async (token, ticker) => ({ ok: true, resultado: { ticker, serie: SERIE_ATIVO_EXEMPLO } }),
  });

  const icones = grid.querySelectorAll('.ativo-card .ativo-grafico-icon');
  icones[0].dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true })); // BBAS3 (acoes)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  // 06/10/2026 (Onda 3): hover da biblioteca (.chart-tip); jsdom não tem layout, então damos 640px de caixa ao <svg>
  const hover_ = () => {
    const svg = doc.body.querySelector('.ativo-grafico-popover svg.chart-svg');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 240, right: 640, bottom: 240, x: 0, y: 0 });
    svg.dispatchEvent(new doc.defaultView.MouseEvent('pointermove', { clientX: 330, clientY: 50, bubbles: true }));
    return doc.body.querySelector('.ativo-grafico-popover .chart-tip').textContent;
  };
  assert.match(hover_(), /R\$/);

  icones[1].dispatchEvent(new doc.defaultView.Event('click', { bubbles: true, cancelable: true })); // CHTR (usa)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const tooltipUsd = hover_();
  assert.match(tooltipUsd, /\$/);
  assert.doesNotMatch(tooltipUsd, /R\$/);
});

// --- renderAvisos ------------------------------------------------------------

test('renderAvisos() hides the banner when there are no avisos', () => {
  const doc = makeDom('<div id="avisos"></div>');
  const banner = doc.getElementById('avisos');
  renderAvisos(banner, undefined);
  assert.equal(banner.hidden, true);
  renderAvisos(banner, {});
  assert.equal(banner.hidden, true);
});

test('renderAvisos() shows every failed section', () => {
  const doc = makeDom('<div id="avisos"></div>');
  const banner = doc.getElementById('avisos');
  renderAvisos(banner, { historico: 'Error: aba não encontrada', ativos: 'Error: timeout' });
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /historico/);
  assert.match(banner.textContent, /ativos/);
});

// --- montarPaginaInicio -------------------------------------------------------

function makePaginaDom() {
  return makeDom(`
    <div class="inicio-loading" id="inicioLoading"></div>
    <div class="inicio-erro" id="inicioErro" hidden></div>
    <div id="inicioConteudo" hidden>
      <div id="refreshControlInicio"></div>
      <div class="avisos-banner" id="inicioAvisos" hidden></div>
      <div class="mkt-faixa" id="faixaMercado"></div>
      <div id="resumoPatrimonio"></div>
      <div class="filter-tabs" id="periodoTabs">
        <button class="filter-tab" data-periodo="30d">30 dias</button>
        <button class="filter-tab active" data-periodo="12m">12 meses</button>
      </div>
      <div id="rentabInfoTotal"></div><div id="rentabChartTotal"></div><div id="rentabLegendaTotal"></div>
      <div id="rentabInfoLongoPrazo"></div><div id="rentabChartLongoPrazo"></div><div id="rentabLegendaLongoPrazo"></div>
      <div id="rentabInfoNacional"></div><div id="rentabChartNacional"></div><div id="rentabLegendaNacional"></div>
      <div id="rentabInfoRendaEmergencial"></div><div id="rentabChartRendaEmergencial"></div><div id="rentabLegendaRendaEmergencial"></div>
      <div class="al-abas" id="filtroAtivosTabs"></div>
      <ul id="meusAtivosGrid"></ul>
    </div>
  `);
}

test('montarPaginaInicio() renders every section and hides the loading state on success', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({
    ok: true,
    patrimonio: PATRIMONIO_EXEMPLO,
    indices: { ibovespa: { valor: 185600, variacaoDia: -0.9 } },
    cambio: { usd: 5.09, eur: 5.92 },
  });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl, getIntradiaImpl: null });

  assert.equal(doc.getElementById('inicioLoading').hidden, true);
  assert.equal(doc.getElementById('inicioConteudo').hidden, false);
  assert.equal(doc.getElementById('faixaMercado').querySelectorAll('.mkt').length, 3); // ibovespa + usd + eur
  assert.ok(doc.getElementById('resumoPatrimonio').querySelector('.rc-visao-total .chart-kpi-val'));
  assert.equal(doc.getElementById('inicioErro').hidden, true);
});

// 17/09/2026 #2: painel de Rentabilidade Nacional (#rentabChartNacional)
// e a 4ª visão do resumo (Patrimônio Nacional - desde 26/09 uma aba do
// resumo compacto, não mais um card) precisam vir montados de
// cara, junto com os outros 3 já existentes - mesmo fio (PAINEIS_RENTABILIDADE/
// ORDEM_RESUMO) que já monta Total/Longo Prazo/Renda Emergencial.
test('montarPaginaInicio() monta também o painel de Rentabilidade Nacional e a 4ª visão do resumo', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({
    ok: true,
    patrimonio: PATRIMONIO_EXEMPLO,
    historico: [
      { data: '2026-09-10', patrimonio: 138200, longoPrazo: 79400, nacional: 59400, rendaEmergencial: 59800, pregao: true },
      { data: '2026-09-11', patrimonio: 140000, longoPrazo: 80000, nacional: 60000, rendaEmergencial: 60000, pregao: true },
    ],
    ontem: { data: '2026-09-11', total: 140000, longoPrazo: 80000, nacional: 60000, rendaEmergencial: 60000 },
    indices: { ibovespa: { valor: 185600, variacaoDia: -0.9 } },
    cambio: { usd: 5.09, eur: 5.92 },
  });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl, getIntradiaImpl: null });

  assert.ok(doc.getElementById('rentabChartNacional').querySelector('svg'), 'painel de Rentabilidade Nacional precisa desenhar de cara, igual aos outros 3');
  assert.match(doc.getElementById('rentabInfoNacional').textContent, /Patrimônio Nacional/);
  assert.equal(doc.getElementById('resumoPatrimonio').querySelectorAll('.rc-kpi').length, 4);
  // 03/10/2026 (revisão do pedido "Patrimônio total: incluir o índice IPCA"):
  // a linha do IPCA entra só no Patrimônio total
  assert.match(doc.getElementById('rentabLegendaTotal').textContent, /IPCA/);
  assert.doesNotMatch(doc.getElementById('rentabLegendaNacional').textContent, /IPCA/);
});

test('montarPaginaInicio() shows the error state (and keeps the content hidden) when the back-end rejects the call', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({ ok: false, etapa: 'autenticação', erro: 'token expirado' });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl, getIntradiaImpl: null });

  assert.equal(doc.getElementById('inicioLoading').hidden, true);
  assert.equal(doc.getElementById('inicioConteudo').hidden, true);
  assert.equal(doc.getElementById('inicioErro').hidden, false);
  assert.match(doc.getElementById('inicioErro').textContent, /token expirado/);
});

test('montarPaginaInicio() surfaces avisos (partial section failure) without hiding the rest', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({
    ok: true,
    patrimonio: PATRIMONIO_EXEMPLO,
    indices: {},
    cambio: {},
    avisos: { historico: 'Error: algo falhou' },
  });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl, getIntradiaImpl: null });

  assert.equal(doc.getElementById('inicioConteudo').hidden, false);
  assert.equal(doc.getElementById('inicioAvisos').hidden, false);
  assert.match(doc.getElementById('inicioAvisos').textContent, /historico/);
});


// --- 23/09/2026 #8: valores em cima dos gráficos das Carteiras ---------------

test('calcularResumoEvolucao(): pontas das 2 linhas (fim, fim − começo, aplicado e distância pro aplicado), ignorando buracos', () => {
  const r = calcularResumoEvolucao([null, 100, 120, null, 150], [0, 90, 100, 100, 130]);
  assert.deepEqual(r, { inicial: 100, final: 150, variacao: 50, percentual: 50, aplicado: 130, diferencaAplicado: 20 });
  assert.equal(calcularResumoEvolucao([null, 5], [1, 2]), null);
  assert.equal(calcularResumoEvolucao([0, 10]).percentual, null); // linha nasce do zero: sem %
  assert.equal(calcularResumoEvolucao([10, 8], null).aplicado, null);
});

test('renderInfoEvolucao(): R$ de hoje, ±R$ no período (sem %) e "Valor aplicado · ±R$ ±x% acima/abaixo do aplicado"', () => {
  const doc = makeDom('<div id="a"></div><div id="b"></div><div id="c"></div>');
  renderInfoEvolucao(doc, doc.getElementById('a'), { label: 'Patrimônio em Ações', valores: [1000, 900], investidos: [950, 1000] });
  const a = doc.getElementById('a');
  assert.equal(a.querySelector('.rentab-card-label').textContent, 'Patrimônio em Ações');
  assert.match(a.querySelector('.rentab-card-value').textContent.replace(/\s+/g, ' '), /900,00/);
  assert.equal(a.querySelector('.rentab-card-delta').className, 'rentab-card-delta bad');
  assert.match(a.querySelector('.rentab-card-delta').textContent, /^−R\$\s*100,00 no período$/);
  assert.match(a.querySelector('.rentab-card-sub').textContent, /Valor aplicado: R\$\s*1\.000,00 · −R\$\s*100,00 −10,00% abaixo do aplicado/);
  renderInfoEvolucao(doc, doc.getElementById('b'), { valores: [10, 20] });
  assert.equal(doc.getElementById('b').querySelector('.rentab-card-delta').className, 'rentab-card-delta good');
  assert.equal(doc.getElementById('b').querySelector('.rentab-card-sub').textContent, 'com aportes e retiradas');
  renderInfoEvolucao(doc, doc.getElementById('c'), { valores: [10] });
  assert.match(doc.getElementById('c').textContent, /sem histórico suficiente/);
});

test('calcularResumoRentabilidade() sem `patrimonio` (subpáginas de Carteiras): valor atual = último ponto da série da visão', () => {
  const historico = [
    { data: '2026-01-01', acoes: 100, fluxoCaixaAcoes: 0 },
    { data: '2026-01-02', acoes: 110, fluxoCaixaAcoes: 0 },
  ];
  const r = calcularResumoRentabilidade(undefined, historico, { visaoId: 'carteiraAcoes', periodoId: 'tudo' });
  assert.equal(r.valorAtual, 110);
});

// --- 24/09/2026: cor própria do R$ e da % / Ações EUA em dólar ---------------

test('renderInfoRentabilidade(): R$ negativo fica vermelho mesmo com % positiva (cada parte com a cor do próprio sinal)', () => {
  const doc = makeDom('<div id="i"></div>');
  // aporte grande no fim: % positiva (rendeu bem com pouco dinheiro), R$ negativo (perdeu depois do aporte)
  const historico = [
    { data: '2026-01-01', acoes: 100, fluxoCaixaAcoes: 0 },
    { data: '2026-01-02', acoes: 200, fluxoCaixaAcoes: 0 },
    { data: '2026-01-03', acoes: 1200, fluxoCaixaAcoes: 1000 },
    { data: '2026-01-04', acoes: 1050, fluxoCaixaAcoes: 0 },
  ];
  renderInfoRentabilidade(doc, doc.getElementById('i'), { historico, visaoId: 'carteiraAcoes', periodoId: 'tudo' });
  const delta = doc.querySelector('#i .rentab-card-delta');
  assert.match(delta.textContent, /^−R\$\s*50,00 \+75,00% no período$/);
  assert.ok(delta.querySelector('.delta-reais').classList.contains('bad'));
  assert.ok(delta.querySelector('.delta-pct').classList.contains('good'));
  assert.ok(delta.classList.contains('misto'));
});

test('comCamposUsdAcoesEua(): valor, fluxo e aplicado em dólar = campo em reais ÷ câmbio do dia; sem câmbio fica null', () => {
  const h = comCamposUsdAcoesEua([
    { data: 'a', acoesEua: 0 },
    { data: 'b', acoesEua: 550, fluxoCaixaAcoesEua: 550, fluxoAplicadoAcoesEua: 550, cambioUsd: 5.5 },
    { data: 'c', acoesEua: 520, fluxoCaixaAcoesEua: 0, fluxoAplicadoAcoesEua: 0, cambioUsd: 5.2 },
  ]);
  assert.equal(h[0].acoesEuaUsd, null);
  assert.deepEqual([h[1].acoesEuaUsd, h[1].fluxoCaixaAcoesEuaUsd, h[1].fluxoAplicadoAcoesEuaUsd], [100, 100, 100]);
  assert.equal(h[2].acoesEuaUsd, 100); // o dólar caiu, a carteira em US$ ficou igual
  assert.equal(historicoTemCambioUsd(h), true);
  assert.equal(historicoTemCambioUsd([{ acoesEua: 1 }]), false);
});

// 26/09/2026: HTML antigo em cache (sem #faixaMercado) com o JS novo - a faixa
// de índices desenha no lugar dos cartões antigos em vez de sumir.
test('montarPaginaInicio(): partial antigo em cache (só #indicesCambioGrid) ainda mostra os índices', async () => {
  const doc = makePaginaDom();
  const faixa = doc.getElementById('faixaMercado');
  faixa.id = 'indicesCambioGrid';
  const getHomeImpl = async () => ({ ok: true, patrimonio: PATRIMONIO_EXEMPLO, indices: { ibovespa: { valor: 100000, variacaoDia: 0.5 } }, cambio: { usd: 5, eur: 6 } });
  await montarPaginaInicio('token-fake', { doc, getHomeImpl, getIntradiaImpl: null });
  const antigo = doc.getElementById('indicesCambioGrid');
  assert.equal(antigo.querySelectorAll('.mkt').length, 3);
  assert.ok(antigo.classList.contains('mkt-faixa'));
});
