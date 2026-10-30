// tests/noticias.test.js - 30/10/2026: tela de Notícias (docs/noticias.md). As contas (noticias-calc.js: fatores do
// RF-09, agenda do RF-06, feed do RF-07, classificador) e a tela montada num DOM de verdade (JSDOM) com dados SINTÉTICOS:
// índice padrão Ibovespa, troca de índice filtrando a classe, tempo real, vídeos com o player só no clique, possíveis
// fatores ao escolher um ativo, e uma fonte fora do ar escondendo só a sua parte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  classificarNoticia, possiveisFatores, agenda, feedDosAtivos, ativosComNoticias, resumoDaSerie, diaUtilAnterior, fatorSetorialDe, haQuanto,
} from '../assets/js/pages/noticias-calc.js';
import { montarPaginaNoticias, linkSeguro } from '../assets/js/pages/noticias.js';
import { formatPctSinal, formatBRL, formatNumeroBR, formatDM } from '../assets/js/format.js';

const fmt = { pct: (f) => formatPctSinal(f, 2), pp: (f) => `${formatNumeroBR(Math.abs(f * 100), 1)} p.p.`, brl: formatBRL };

test('classificador: tema e tom pelo título', () => {
  assert.deepEqual(classificarNoticia('Empresa X tem lucro recorde no 3T26'), { tema: 'resultado', tom: 'positivo' });
  assert.deepEqual(classificarNoticia('Fundo Y anuncia emissão de cotas'), { tema: 'fato relevante', tom: 'neutro' });
  assert.deepEqual(classificarNoticia('Banco rebaixa recomendação da ação Z'), { tema: 'recomendação', tom: 'negativo' });
  assert.equal(classificarNoticia('Copom mantém a Selic').tema, 'macro');
  assert.equal(classificarNoticia('Nova fábrica no interior').tema, 'setor');
});

test('RF-09: FII com data-com ontem de R$ 0,80 e a cota caindo R$ 0,78 -> o 1º fator é a data-com, peso forte', () => {
  const f = possiveisFatores({
    ativo: { ticker: 'TEST11', classe: 'fiis', variacaoDia: -0.78 / 100.78, precoAtual: 100 },
    indice: { nome: 'IFIX', variacao: 0.001 },
    proventos: [{ ticker: 'TEST11', dataCom: '2026-10-29', valorPorCota: 0.8 }],
    hojeISO: '2026-10-30', fmt,
  });
  assert.equal(f.itens[0].tipo, 'provento');
  assert.equal(f.itens[0].peso, 'forte');
  assert.match(f.itens[0].titulo, /Data-com ontem \(R\$\s0,80 por cota\)/);
  assert.match(f.resumo, /provento que saiu da cota/);
});

test('RF-09: ativo sem notícia andando junto com o índice -> "acompanhou o mercado"', () => {
  const f = possiveisFatores({ ativo: { ticker: 'ABCD3', classe: 'acoes', variacaoDia: 0.012 }, indice: { nome: 'Ibovespa', variacao: 0.011 }, hojeISO: '2026-10-30', fmt });
  assert.equal(f.itens[0].tipo, 'mercado');
  assert.match(f.resumo, /acompanhou o mercado \(Ibovespa \+1,10%\), sem notícia própria no dia/);
  assert.equal(possiveisFatores({ ativo: { ticker: 'X', variacaoDia: null }, fmt }), null, 'sem variação: sem fatores');
});

test('RF-09: movimento próprio, commodity e notícia a favor entram ordenados por peso', () => {
  const agoraMs = Date.parse('2026-10-30T18:00:00Z');
  const f = possiveisFatores({
    ativo: { ticker: 'PETR4', classe: 'acoes', variacaoDia: 0.035 },
    indice: { nome: 'Ibovespa', variacao: 0.004 },
    termometro: { BRENT: { variacao: 0.028, nome: 'Petróleo Brent' } },
    noticias: [{ titulo: 'Empresa tem lucro recorde e sobe forte', data: '2026-10-30T15:00:00Z', fonte: 'Jornal' }, { titulo: 'Notícia da semana passada', data: '2026-10-20T15:00:00Z' }],
    hojeISO: '2026-10-30', agoraMs, fmt,
  });
  const pesos = f.itens.map((x) => x.peso);
  assert.deepEqual([...pesos].sort((a, b) => ({ forte: 0, médio: 1, fraco: 2 }[a] - { forte: 0, médio: 1, fraco: 2 }[b])), pesos, 'ordenados');
  assert.ok(f.itens.some((x) => x.tipo === 'setor' && x.peso === 'forte'), 'Brent subindo junto');
  assert.ok(f.itens.some((x) => x.tipo === 'noticia' && x.sinal === '+' && x.peso === 'forte'), 'resultado positivo a favor');
  assert.equal(f.itens.filter((x) => x.tipo === 'noticia').length, 1, 'só as últimas 24 h');
  assert.equal(fatorSetorialDe({ ticker: 'XPTO3', grupo: 'Mineração' }), 'MINERIO');
  assert.equal(diaUtilAnterior('2026-11-02'), '2026-10-30', 'segunda -> sexta');
});

test('RF-06: agenda de hoje e da semana - proventos da carteira com o selo, Copom, Focus na segunda e feriado', () => {
  const proventos = [{ ticker: 'TEST11', dataCom: '2026-10-30', dataPagamento: '2026-11-13', valorPorCota: 0.8, valor: 80, moeda: 'BRL' }, { ticker: 'WXYZ3', dataCom: '2026-10-01', dataPagamento: '2026-11-03', valor: 12, moeda: 'BRL' }];
  const fmtValor = (v) => formatBRL(v);
  const hoje = agenda({ proventos, hojeISO: '2026-10-30', periodo: 'hoje', fmtDM: formatDM, fmtValor });
  assert.equal(hoje.length, 1);
  assert.equal(hoje[0].grupo, 'Hoje');
  assert.equal(hoje[0].itens[0].titulo, 'TEST11: data-com');
  assert.match(hoje[0].itens[0].detalhe, /R\$\s0,80 por cota · na sua carteira/);
  const semana = agenda({ proventos, hojeISO: '2026-10-30', periodo: 'semana', fmtDM: formatDM, fmtValor });
  assert.deepEqual(semana.map((g) => g.grupo), ['Hoje', '02/11', '03/11', '04/11']);
  assert.ok(semana[1].itens.some((e) => e.titulo === 'Boletim Focus') && semana[1].itens.some((e) => /Finados/.test(e.titulo)));
  assert.equal(semana[2].itens[0].titulo, 'WXYZ3: pagamento', 'carteira antes do Copom no mesmo dia');
  assert.ok(semana[3].itens.some((e) => e.titulo === 'Copom: decisão da Selic'));
  const comExtras = agenda({ proventos: [], vencimentos: [{ nome: 'Tesouro Exemplo', dia: '2026-11-06', valor: 50 }], extras: [{ dia: '2026-11-06', hora: '9h00', titulo: 'PIB', detalhe: 'IBGE', tag: 'macro' }], hojeISO: '2026-11-06', periodo: 'hoje', fmtDM: formatDM, fmtValor });
  assert.deepEqual(comExtras[0].itens.map((e) => e.titulo), ['Tesouro Exemplo: vencimento', 'PIB', 'Payroll (emprego nos EUA)'], 'carteira, IBGE e EUA no mesmo dia');
});

test('RF-07: feed dos ativos por classe, ativo e ordem', () => {
  const carteira = [{ ticker: 'AAAA3', classe: 'acoes', totalAtualizado: 100, variacaoDia: 0.01 }, { ticker: 'BBBB11', classe: 'fiis', totalAtualizado: 900, variacaoDia: -0.03 }];
  const ativos = ativosComNoticias(carteira, { AAAA3: [{ titulo: 'a1', data: '2026-10-30T12:00:00Z' }], BBBB11: [{ titulo: 'b1', data: '2026-10-29T12:00:00Z' }] });
  assert.deepEqual(feedDosAtivos(ativos).map((n) => n.titulo), ['a1', 'b1']);
  assert.deepEqual(feedDosAtivos(ativos, { ordem: 'posicao' }).map((n) => n.titulo), ['b1', 'a1']);
  assert.deepEqual(feedDosAtivos(ativos, { classe: 'fiis' }).map((n) => n.ticker), ['BBBB11']);
  assert.deepEqual(feedDosAtivos(ativos, { ticker: 'AAAA3' }).map((n) => n.ticker), ['AAAA3']);
  assert.equal(haQuanto('2026-10-30T11:30:00Z', Date.parse('2026-10-30T12:00:00Z'), formatDM), 'há 30 min');
  assert.deepEqual(resumoDaSerie({ v: [10, 12, 9, 11], preco: 11, variacao: 0.1, fechamentoAnterior: 10 }), { valor: 11, variacao: 0.1, anterior: 10, abertura: 10, maxima: 12, minima: 9, dia: '' });
  assert.equal(linkSeguro('javascript:alert(1)'), '#');
  assert.equal(linkSeguro('https://ok.test/a'), 'https://ok.test/a');
});

// ---- a tela ----
function montarDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body data-section="noticias"><main><div id="ntCabecalho"></div><div id="ntConteudo"></div></main></body></html>', { url: 'https://exemplo.test/noticias/index.html', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.localStorage = w.localStorage; globalThis.sessionStorage = w.sessionStorage;
  w.localStorage.clear();
  return { doc: w.document, w };
}
const serie = (base, varia) => ({ preco: base * (1 + varia), fechamentoAnterior: base, variacao: varia, dia: '2026-10-30', inicio: 0, fim: 420 * 60, t: [0, 60, 120, 180], v: [base, base * (1 + varia / 2), base * (1 + varia * 1.2), base * (1 + varia)] });
const AGORA = Date.parse('2026-10-30T17:00:00Z');

function apisFalsas({ mercadoFora = false } = {}) {
  const pedidos = { mercado: [], videos: [] };
  return {
    pedidos,
    apis: {
      getNoticiasMercado: async (tk, indice) => { pedidos.mercado.push(indice); if (mercadoFora) return { ok: false, erro: 'fora' }; return { ok: true, indice, manchete: { titulo: `Manchete ${indice}`, link: 'https://n.test/m', resumo: ['tópico 1'] }, tempoReal: [{ hora: '13h55', titulo: `Atualização ${indice}`, link: 'https://n.test/t' }], noticias: [{ titulo: 'Notícia A', link: 'https://n.test/a', data: '2026-10-30T16:00:00Z', fonte: 'Fonte A' }, { titulo: 'Notícia B', link: 'javascript:x', data: '2026-10-30T15:00:00Z', fonte: 'Fonte B' }], fonteTempoReal: 'InfoMoney', avisos: [] }; },
      getNoticiasVideos: async (tk, aba) => { pedidos.videos.push(aba); return { ok: true, aba, videos: [{ id: 'vid0000001a', titulo: 'Vídeo 1', publicado: '2026-10-30T12:00:00Z', canal: 'Canal Um' }], canais: ['Canal Um'], avisos: [] }; },
      getNoticiasAtivos: async () => ({ ok: true, ativos: { TEST11: [{ titulo: 'FII anuncia rendimento', data: '2026-10-30T14:00:00Z', fonte: 'F', link: 'https://n.test/f' }], ABCD3: [{ titulo: 'Empresa sobe', data: '2026-10-30T13:00:00Z', fonte: 'G', link: 'https://n.test/g' }] } }),
      getIntradia: async (tk, chaves) => ({ ok: true, resultado: Object.fromEntries(chaves.map((c) => [c, c === 'MINERIO' ? null : serie(c === 'USD' ? 5.3 : 100, c === 'IFIX' ? -0.002 : 0.008)])) }),
      getCarteirasAcoes: async () => ({ ok: true, carteira: { ativos: [{ ticker: 'ABCD3', quantidade: 10, variacaoDia: 0.009, totalAtualizado: 500 }] } }),
      getCarteirasFiis: async () => ({ ok: true, carteira: { ativos: [{ ticker: 'TEST11', quantidade: 100, variacaoDia: -0.0077, precoAtual: 100, totalAtualizado: 10000 }, { ticker: 'VEND11', quantidade: 0 }] } }),
      getCarteirasAcoesEua: async () => { throw new Error('rede'); },
      getNoticiasAgenda: async () => ({ ok: true, eventos: [{ dia: '2026-10-30', hora: '9h00', titulo: 'IPCA-15 (ref. 10/2026)', detalhe: 'IBGE', tag: 'macro' }] }),
      getCarteirasRendaFixa: async () => ({ ok: true, carteira: { ativos: [{ nomePersonalizado: 'CDB Exemplo', vencimentoData: '2026-10-30', totalAtualizado: 1000 }, { nomePersonalizado: 'Sem data' }] } }),
      getProventos: async () => ({ ok: true, aReceber: [{ ticker: 'TEST11', dataCom: '2026-10-29', dataPagamento: '2026-11-13', valorPorCota: 0.8, valor: 80 }], recebidos: [] }),
    },
  };
}

test('tela: Ibovespa por padrão, tempo real, termômetro, vídeos, agenda e as notícias dos ativos; troca de índice filtra a classe', async () => {
  const { doc, w } = montarDom();
  const { apis, pedidos } = apisFalsas();
  const { estado, controle } = await montarPaginaNoticias('s1.x.y', { doc, apis, agora: () => AGORA });
  controle.pararTimer();
  assert.equal(doc.querySelector('#ntIndices [aria-selected="true"]').dataset.id, 'ibov');
  assert.equal(doc.getElementById('ntTituloMercado').textContent, 'Manchete ibov');
  assert.match(doc.getElementById('ntTempoReal').textContent, /13h55\s*Atualização ibov/);
  assert.match(doc.getElementById('ntValor').textContent, /Ibovespa\s*101\s*pts\s*\+0,80%/);
  assert.ok(doc.querySelector('#ntGrafico svg'), 'gráfico do dia desenhado');
  assert.match(doc.getElementById('ntTermo').textContent, /Petróleo Brent/);
  assert.doesNotMatch(doc.getElementById('ntTermo').textContent, /Minério/, 'sem série: o item some');
  assert.match(doc.getElementById('ntTermo').textContent, /Juro 10 anos EUA\s*100,80%\s*\+0,80 p\.p\./, 'juro em p.p.');
  assert.equal(doc.querySelectorAll('#ntTrilho .nt-video').length, 1);
  assert.ok(!doc.querySelector('#ntTrilho iframe'), 'player só no clique');
  doc.querySelector('.nt-video-capa').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.match(doc.querySelector('#ntTrilho iframe').src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/vid0000001a/);
  assert.match(doc.getElementById('ntAgenda').textContent, /CDB Exemplo: vencimento\s*R\$\s1\.000,00 · na sua carteira/, 'vencimento da renda fixa');
  assert.match(doc.getElementById('ntAgenda').textContent, /9h00\s*IPCA-15 \(ref\. 10\/2026\)\s*IBGE/, 'IBGE do Worker');
  assert.equal(doc.querySelector('#ntRecentes a').getAttribute('href'), '#', 'link que não é http(s) não vira link');
  assert.deepEqual([...doc.querySelectorAll('#ntTickers [data-ticker]')].map((b) => b.dataset.ticker), ['ABCD3', 'TEST11'], 'só com posição; a classe que falhou fica de fora');
  assert.equal(doc.querySelectorAll('#ntFeed .nt-noticia').length, 2);

  // IFIX: filtra os FIIs e busca o tempo real do IFIX
  doc.querySelector('#ntIndices [data-id="ifix"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(estado.classe, 'fiis');
  assert.deepEqual(pedidos.mercado, ['ibov', 'ifix']);
  assert.equal(doc.getElementById('ntTituloMercado').textContent, 'Manchete ifix');
  assert.deepEqual([...doc.querySelectorAll('#ntTickers [data-ticker]')].map((b) => b.dataset.ticker), ['TEST11']);

  // escolher o FII: possíveis fatores (data-com ontem de R$ 0,80)
  doc.querySelector('#ntTickers [data-ticker="TEST11"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const fat = doc.getElementById('ntFatores');
  assert.equal(fat.hidden, false);
  assert.match(fat.textContent, /Possíveis fatores hoje/);
  assert.match(fat.querySelector('.nt-fatores-lista li').textContent, /Data-com ontem/);
  assert.match(fat.textContent, /Não é recomendação nem certeza de causa/);
  assert.equal(doc.querySelectorAll('#ntFeed .nt-noticia').length, 1);

  // aba de vídeos: busca a aba pedida
  doc.querySelector('#ntAbasVideo [data-id="especialistas"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(pedidos.videos, ['noticias', 'especialistas']);
  assert.equal(JSON.parse(w.localStorage.getItem('noticias.prefs.v1')).aba, 'especialistas', 'lembra a aba');
});

test('tela: notícias do mercado fora do ar escondem só a parte delas (RNF-05)', async () => {
  const { doc } = montarDom();
  const { apis } = apisFalsas({ mercadoFora: true });
  const { controle } = await montarPaginaNoticias('s1.x.y', { doc, apis, agora: () => AGORA });
  controle.pararTimer();
  assert.match(doc.getElementById('ntTempoReal').textContent, /Tempo real indisponível agora/);
  assert.match(doc.getElementById('ntPrincipal').textContent, /Manchetes indisponíveis agora/);
  assert.ok(doc.querySelector('#ntGrafico svg'), 'o gráfico continua');
  assert.equal(doc.querySelectorAll('#ntTrilho .nt-video').length, 1, 'os vídeos continuam');
  assert.equal(doc.querySelector('.refresh-status').textContent, 'Falhou ao atualizar');
});

test('CSS (bug 30/10/2026): o cartão de fatores tinha display:grid e aparecia vazio mesmo com hidden - [hidden] vence', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../assets/css/noticias.css', import.meta.url), 'utf8');
  assert.match(css, /\.nt-conteudo \[hidden\]\{ display:none !important; \}/);
  const { doc } = montarDom();
  const { apis } = apisFalsas();
  const { controle } = await montarPaginaNoticias('s1.x.y', { doc, apis, agora: () => AGORA });
  controle.pararTimer();
  assert.equal(doc.getElementById('ntFatores').hidden, true, 'sem ativo escolhido: escondido');
});

test('listas (Tiago, 30/10/2026): 10 notícias e "Ver mais" (+10) na própria tela; tirar o ativo escolhido volta para Todos e esconde os fatores', async () => {
  const { doc, w } = montarDom();
  const { apis } = apisFalsas();
  const muitas = (n, pre) => Array.from({ length: n }, (_, i) => ({ titulo: `${pre} ${i}`, link: `https://n.test/${pre}${i}`, data: new Date(AGORA - i * 60000).toISOString(), fonte: 'F' }));
  apis.getNoticiasMercado = async (tk, indice) => ({ ok: true, indice, manchete: null, tempoReal: [], noticias: muitas(24, 'm'), avisos: [] });
  apis.getNoticiasAtivos = async () => ({ ok: true, ativos: { TEST11: muitas(8, 'f'), ABCD3: muitas(7, 'a') } });
  const { estado, controle } = await montarPaginaNoticias('s1.x.y', { doc, apis, agora: () => AGORA });
  controle.pararTimer();
  const clique = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  // Mais recentes: a 1ª vira a principal; 23 sobram -> 10, depois 20, depois 23
  assert.equal(doc.querySelectorAll('#ntRecentes .nt-recente').length, 10);
  assert.equal(doc.getElementById('ntRecentesMais').textContent, 'Ver mais (13)');
  clique(doc.getElementById('ntRecentesMais'));
  clique(doc.getElementById('ntRecentesMais'));
  assert.equal(doc.querySelectorAll('#ntRecentes .nt-recente').length, 23);
  assert.equal(doc.getElementById('ntRecentesMais').hidden, true);
  // ativos: 15 notícias -> 10 + "Ver mais"
  assert.equal(doc.querySelectorAll('#ntFeed .nt-noticia').length, 10);
  assert.equal(doc.getElementById('ntFeedMais').textContent, 'Ver mais notícias (5)');
  clique(doc.getElementById('ntFeedMais'));
  assert.equal(doc.querySelectorAll('#ntFeed .nt-noticia').length, 15);
  // escolhe um FII na aba FIIs e tira: volta para Todos, fatores escondidos e vazios
  clique(doc.querySelector('#ntClasses [data-classe="fiis"]'));
  clique(doc.querySelector('#ntTickers [data-ticker="TEST11"]'));
  assert.equal(doc.getElementById('ntFatores').hidden, false);
  assert.equal(doc.querySelectorAll('#ntFeed .nt-noticia').length, 8);
  clique(doc.querySelector('#ntTickers [data-ticker="TEST11"]'));
  assert.equal(estado.ticker, null);
  assert.equal(estado.classe, 'todos');
  assert.equal(doc.querySelector('#ntClasses [aria-pressed="true"]').dataset.classe, 'todos');
  assert.equal(doc.getElementById('ntFatores').hidden, true);
  assert.equal(doc.getElementById('ntFatores').innerHTML, '');
  assert.equal(doc.querySelectorAll('#ntFeed .nt-noticia').length, 10, 'de novo 10 de todos');
});
