// tests/ativo.test.js - 25/09/2026: tela Detalhe do ativo (ativo/index.html)
// montada num DOM de verdade (JSDOM) com um ativo inventado: cabeçalho e
// trilha de volta pras Carteiras, resumo da posição, cotação x preço-teto,
// gráficos, mês a mês, proventos, extrato (com filtro e "ver tudo"), tese
// (Drive não configurado / com PDFs), notícias (texto escapado e só links
// http), Sobre e IR da classe, renda fixa e os estados de erro.
// Valores sintéticos: nenhum número real aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function montarDom(ref = 'TEST3', hash = '') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="carteiras">
    <header id="ativoCabecalho"></header>
    <div id="ativoLoading"></div><div id="ativoErro" hidden></div><div id="ativoConteudo" hidden></div></body></html>`,
  { url: `https://exemplo.test/repo/ativo/index.html?ref=${encodeURIComponent(ref)}${hash}`, pretendToBeVisual: true });
  const w = dom.window;
  // movimento reduzido: os números dos KPIs aparecem finais (sem animação a partir de 0)
  w.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.localStorage = w.localStorage;
  return { dom, doc: w.document, w };
}
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
// texto como a gente lê: um espaço entre elementos (textContent cola "totalR$ 5,00")
const txt = (el) => {
  const partes = [];
  const tw = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};

function respostaAcao() {
  return {
    ok: true, hoje: '2026-03-10', tipo: 'rv', ticker: 'TEST3', classe: 'acoes', moeda: 'BRL',
    ativo: { ticker: 'TEST3', nome: 'Teste <b>S.A.</b>', grupo: 'Setor X', quantidade: 20, precoAtual: 13.5, precoMedio: 11, precoTeto: 15, vies: 'Comprar',
      totalComprado: 220, totalAtualizado: 270, proventosTotais: 5, variacaoDia: 0.01, dyPercentual: 0.05, dyValor: 0.6, pvp: 0.9, pl: 7.5,
      descontoPvp: '90% (0,90 P/VP)', descontoPl: '13% (7,5 P/L)' },
    serie: [
      { data: '2026-01-05', cotas: 10, preco: 10, valor: 100, valorBrl: 100 },
      { data: '2026-01-30', cotas: 10, preco: 12, valor: 120, valorBrl: 120 },
      { data: '2026-02-02', cotas: 20, preco: 12, valor: 240, valorBrl: 240 },
      { data: '2026-02-27', cotas: 20, preco: 12.5, valor: 250, valorBrl: 250 },
      { data: '2026-03-09', cotas: 20, preco: 13, valor: 260, valorBrl: 260 },
    ],
    transacoes: [
      { data: '2026-01-05', tipo: 'Compra', preco: 10, quantidade: 10, taxa: 0, total: 100, totalBrl: 100, lucro: null },
      { data: '2026-02-02', tipo: 'Compra', preco: 12, quantidade: 10, taxa: 0, total: 120, totalBrl: 120, lucro: null },
    ],
    proventos: [{ dataCom: '2026-02-05', dataPagamento: '2026-02-15', tipo: 'Dividendo', quantidade: 20, valorPorCota: 0.25, liquido: 5, moeda: 'BRL', valor: 5 }],
    aReceber: [{ ticker: 'TEST3', tipo: 'JCP', dataPagamento: '2026-04-20', valor: 3, fonte: 'B3' }],
    pagosNaoLancados: [],
    faixa52: null,
    indices: [
      { data: '2026-01-02', cdi: 100, ipca: 50, ibovespa: 1000, patrimonio: 1000 },
      { data: '2026-02-27', cdi: 102, ipca: 51, ibovespa: 1020, patrimonio: 1250 },
      { data: '2026-03-09', cdi: 102.5, ipca: 51, ibovespa: 1030, patrimonio: 1350 },
    ],
  };
}

const ESTATICOS = {
  sobre: { ativos: { TEST3: { classe: 'acoes', nome: 'Teste Sociedade Anônima', descricao: 'Empresa de <i>teste</i>.', setor: 'Setor X', cnpj: '00.000.000/0000-00', site: 'https://exemplo.test', ri: 'javascript:alert(1)' } } },
  ir: {
    prazo: 'Até o fim de fevereiro.', atualizadoEm: '2026-09',
    fontes: {
      esc: { nome: 'Escriturador Teste', papel: 'Escriturador', resumo: 'Chega por e-mail.', passos: ['App › Documentos › Informe.'], links: [{ rotulo: 'Portal', url: 'https://escriturador.example' }, { rotulo: 'Ruim', url: 'javascript:alert(1)' }] },
      fii: { nome: 'Administrador de FII', passos: [] },
    },
    porTicker: { TEST3: ['esc'] }, porPrefixo: {}, porInstituicao: [], porClasse: { fiis: ['fii'] }, notas: {},
    declaracao: { acoes: { grupo: '03', grupoNome: 'Participações societárias', codigo: '01', codigoNome: 'Ações (inclusive as listadas em bolsa)', localizacao: '105 - Brasil', negociadoEmBolsa: true } },
  },
};

// 02/10/2026: gráfico do dia (Intradia.gs) - série inventada; por padrão "sem dado"
async function montar({ metas = { ok: false }, resposta = respostaAcao(), noticias = { ok: true, noticias: [] }, teses = { ok: true, configurado: false, teses: [], resumos: [] }, ref = 'TEST3', estaticos = ESTATICOS, hash = '', intradia = (chaves) => ({ ok: true, resultado: Object.fromEntries(chaves.map((c) => [c, null])) }) } = {}) {
  const { dom, doc, w } = montarDom(ref, hash);
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  const chamadas = { ativo: [], noticias: [], teses: [], intradia: [] };
  await montarPaginaAtivo('tk', {
    doc,
    getAtivoImpl: async (t, r, o) => { chamadas.ativo.push(r); (chamadas.opcoesAtivo = chamadas.opcoesAtivo || []).push(o); return structuredClone(resposta); },
    getNoticiasImpl: async (t, p) => { chamadas.noticias.push(p); return noticias; },
    getTesesImpl: async (t, tk) => { chamadas.teses.push(tk); return teses; },
    getIntradiaImpl: async (t, chaves) => { chamadas.intradia.push(chaves); return intradia(chaves); },
    getMetasImpl: async () => metas,
    carregarEstaticosImpl: async () => estaticos,
    agora: () => new Date('2026-03-10T15:00:00Z'),
  });
  await new Promise((r) => setTimeout(r, 0));
  return { dom, doc, w, chamadas };
}

test('ativo: cabeçalho, trilha de volta pra Carteiras › Ações, resumo da posição e cotação x preço-teto', async () => {
  const { doc, chamadas } = await montar();
  assert.deepEqual(chamadas.ativo, ['TEST3'], 'o ref vem do endereço (?ref=)');
  assert.equal(doc.getElementById('ativoConteudo').hidden, false);
  assert.equal(doc.getElementById('ativoLoading').hidden, true);
  // 06/10/2026 (Onda 3): cabeçalho padrão (ui/pagina.js): título = ticker, subtítulo = nome, breadcrumb "Carteiras › Ações › TEST3"
  assert.equal(txt(doc.querySelector('#ativoCabecalho .pagina-titulo')), 'TEST3');
  assert.equal(doc.title, 'TEST3 · Carteiras · Patrimônio');
  const trilha = doc.querySelectorAll('#ativoCabecalho nav a');
  assert.match(trilha[0].getAttribute('href'), /\/carteiras\/index\.html$/);
  assert.match(trilha[1].getAttribute('href'), /\/carteiras\/index\.html#acoes$/);
  assert.equal(txt(trilha[1]), 'Ações');
  assert.equal(txt(doc.querySelector('#ativoCabecalho nav [aria-current="page"]')), 'TEST3');
  const resumo = txt(doc.getElementById('atResumo'));
  assert.match(resumo, /R\$\s*270,00/);
  assert.match(resumo, /Valor aplicado: R\$\s*220,00/);
  assert.match(resumo, /R\$\s*50,00/);
  assert.match(resumo, /\+22,73%/);
  assert.match(resumo, /R\$\s*55,00 com proventos/);
  assert.match(txt(doc.querySelector('.at-hero')), /20,0% do patrimônio/, '270 de 1.350 do patrimônio');
  const faixa = doc.getElementById('at-faixa');
  assert.match(txt(faixa), /10,0% abaixo do seu preço-teto/);
  assert.match(txt(faixa), /Mín\. desde 05\/01\/2026/, 'menos de 1 ano de carteira: avisa');
  assert.ok(faixa.querySelector('.chip-tonal.chip-good'));
  // o nome veio da planilha com HTML: vira texto, não tag
  assert.equal(doc.querySelector('#ativoCabecalho .pagina-sub b'), null);
  assert.equal(txt(doc.querySelector('#ativoCabecalho .pagina-sub')), 'Teste Sociedade Anônima', 'nome do "Sobre" tem prioridade');
  const sem = await montar({ estaticos: {} });
  assert.equal(sem.doc.querySelector('#ativoCabecalho .pagina-sub b'), null);
  assert.match(txt(sem.doc.querySelector('#ativoCabecalho .pagina-sub')), /Teste <b>S\.A\.<\/b>/, 'sem o "Sobre": o nome da planilha entra como texto');
});

test('ativo: gráficos (rentabilidade com o ticker na legenda, aplicado x saldo), mês a mês e proventos', async () => {
  const { doc } = await montar();
  // 06/10/2026 (Onda 3): os gráficos vêm da biblioteca (charts/) pelo criarGraficosCarteira, com o seletor de período padrão
  const graficos = doc.getElementById('atGraficos');
  assert.ok(graficos.querySelector('.cg-painel-rentabilidade .chart--linha svg'));
  assert.ok(graficos.querySelector('.chart-seg [data-periodo="12m"]'), 'seletor de período canônico');
  const leg = [...graficos.querySelectorAll('.chart-legenda')].map((l) => txt(l));
  assert.match(leg[0], /TEST3/);
  assert.match(leg[0], /Ibovespa/);
  assert.match(leg[0], /CDI/);
  assert.match(txt(graficos.querySelector('.cg-painel-rentabilidade .chart-card-rot')), /Rentabilidade · TEST3/);
  assert.match(leg[1], /Valor aplicado/);
  const evolucao = [...graficos.querySelectorAll('.chart-card-rot')].map((e) => txt(e)).find((t) => /Valor aplicado/.test(t));
  assert.ok(evolucao, 'card de evolução: valor aplicado x saldo');
  const linhas = doc.querySelectorAll('#at-mensal tbody tr');
  assert.equal(linhas.length, 3);
  assert.match(txt(linhas[0]), /mar\/26 R\$\s*270,00 20 \+8,00%/);
  const prov = doc.getElementById('at-proventos');
  assert.match(txt(prov), /Recebidos no total R\$\s*5,00/);
  assert.match(txt(prov), /\+ R\$\s*3,00 a receber/);
  assert.equal(prov.querySelectorAll('.at-lista-receber li').length, 1);
  assert.ok(prov.querySelector('#atBarrasProventos .chart--barras-simples svg'));
  assert.match(txt(prov.querySelector('.chart-tabela')), /fev\/26 R\$\s*5,00/, 'valor do mês de fev/26 na tabela de apoio do gráfico');
});

test('ativo: extrato com filtro (compras e vendas / proventos)', async () => {
  const { doc, w } = await montar();
  const linhas = () => Array.from(doc.querySelectorAll('#atExtratoTabela tbody tr'));
  assert.equal(linhas().length, 3);
  assert.match(txt(linhas()[0]), /15\/02\/2026 data com 05\/02\/2026 Dividendo 20/);
  clique(w, doc.querySelector('#atExtratoFiltros [data-filtro="movimentacao"]'));
  assert.equal(linhas().length, 2);
  assert.ok(linhas().every((l) => /Compra/.test(txt(l))));
  clique(w, doc.querySelector('#atExtratoFiltros [data-filtro="provento"]'));
  assert.equal(linhas().length, 1);
});

test('ativo: tese sem a pasta do Drive configurada explica o que fazer; com PDFs, "Ler aqui" abre o preview do Drive', async () => {
  const { doc } = await montar();
  assert.match(txt(doc.getElementById('atTeseConteudo')), /configurarPastaTesesDireto/);

  const { doc: doc2, w: w2 } = await montar({ teses: { ok: true, configurado: true,
    teses: [{ data: '2026-03-02', nome: '02:03:2026.pdf', preview: 'https://drive.google.com/file/d/ABC/preview', abrir: 'https://drive.google.com/file/d/ABC/view' }],
    resumos: [{ dataPublicacao: '2026-03-02', recomendacao: 'Comprar', precoTeto: 14, moeda: 'BRL', resumo: 'Resumo <script>x</script>', pontosFortes: ['a'], riscos: ['b'] }] } });
  const tese = doc2.getElementById('atTeseConteudo');
  assert.match(txt(tese), /Teto da Suno R\$\s*14,00 · o seu: R\$\s*15,00/);
  assert.equal(tese.querySelector('script'), null);
  assert.match(txt(tese), /02\/03\/2026 mais recente/);
  clique(w2, tese.querySelector('[data-acao="tese-ler"]'));
  const iframe = tese.querySelector('.at-tese-pdf iframe');
  assert.equal(iframe.getAttribute('src'), 'https://drive.google.com/file/d/ABC/preview');
  assert.equal(tese.querySelector('.at-tese-pdf').hidden, false);
});

test('ativo: notícias escapadas, só links http(s), com fonte e há quanto tempo', async () => {
  const { doc, chamadas } = await montar({ noticias: { ok: true, noticias: [
    { titulo: 'Título <img src=x onerror=alert(1)>', link: 'https://news.example/1', fonte: 'Fonte A', data: '2026-03-10T12:00:00Z' },
    { titulo: 'Link ruim', link: 'javascript:alert(1)', fonte: 'X', data: null },
  ] } });
  assert.deepEqual(chamadas.noticias, [{ ticker: 'TEST3', nome: 'Teste <b>S.A.</b>', classe: 'acoes' }]);
  const itens = doc.querySelectorAll('#atNoticiasConteudo a.at-noticia');
  assert.equal(itens.length, 1);
  assert.equal(itens[0].querySelector('.at-noticia-titulo img'), null, 'título é texto');
  assert.match(itens[0].querySelector('.at-noticia-titulo').textContent, /<img src=x/);
  assert.equal(itens[0].getAttribute('href'), 'https://news.example/1');
  assert.equal(itens[0].getAttribute('rel'), 'noopener');
  assert.equal(itens[0].getAttribute('target'), '_blank');
  assert.match(txt(itens[0].querySelector('.at-noticia-meta')), /há 3h · Fonte A/);
  assert.ok(itens[0].querySelector('.at-noticia-ph'), 'sem imagem: placeholder');
  assert.equal(itens[0].querySelector('.at-noticia-foto'), null);
});

test('ativo: notícias em cartões - imagem quando vem (só https), favicon da fonte no placeholder, 6 visíveis + "ver mais"', async () => {
  const noticias = Array.from({ length: 8 }, (_, i) => ({
    titulo: `Notícia ${i + 1}`, link: `https://news.example/${i + 1}`, fonte: 'Jornal Teste', fonteUrl: 'https://www.jornal.example',
    data: '2026-03-10T12:00:00Z', imagem: i === 0 ? 'https://img.example/1.jpg' : (i === 1 ? 'http://inseguro/2.jpg' : null),
  }));
  const { doc, w } = await montar({ noticias: { ok: true, noticias } });
  const cartoes = [...doc.querySelectorAll('#atNoticiasConteudo a.at-noticia')];
  assert.equal(cartoes.length, 8);
  assert.equal(cartoes[0].querySelector('.at-noticia-foto').getAttribute('src'), 'https://img.example/1.jpg');
  assert.equal(cartoes[1].querySelector('.at-noticia-foto'), null, 'http não entra');
  assert.match(cartoes[2].querySelector('.at-noticia-favicon').getAttribute('src'), /s2\/favicons\?domain=jornal\.example/);
  assert.equal(doc.querySelectorAll('.at-noticia-extra').length, 2);
  const caixa = doc.getElementById('atNoticiasConteudo');
  const btn = caixa.querySelector('[data-acao="noticias-todas"]');
  assert.match(btn.textContent, /Ver mais 2 notícias/);
  clique(w, btn);
  assert.ok(caixa.classList.contains('at-noticias-todas'));
  assert.equal(btn.textContent, 'Mostrar menos');
});

test('ativo: Sobre (só links http) e IR = onde baixar o informe deste ativo', async () => {
  const { doc } = await montar();
  const sobre = doc.getElementById('at-sobre');
  assert.match(txt(sobre), /Teste Sociedade Anônima/);
  assert.equal(sobre.querySelector('i'), null, 'descrição é texto');
  assert.equal(sobre.querySelectorAll('.at-links a').length, 1, 'o link javascript: fica de fora');
  const ir = doc.getElementById('at-ir');
  assert.match(txt(ir), /Onde baixar o informe/);
  assert.match(txt(ir), /Escriturador Teste/);
  assert.match(txt(ir), /App › Documentos › Informe\./);
  assert.doesNotMatch(txt(ir), /Administrador de FII/, 'fonte de outra classe não aparece');
  assert.match(txt(ir), /Atualizado em setembro de 2026/);
  const links = [...ir.querySelectorAll('.at-ir-link')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['https://escriturador.example'], 'o link javascript: fica de fora');
});

test('ativo: renda fixa - sem tese/notícias/faixa, com características e o saldo bruto no topo', async () => {
  const rf = {
    ok: true, hoje: '2026-01-10', tipo: 'rf', ticker: 'Tesouro Teste 2030', classe: 'rendaFixa', moeda: 'BRL',
    ativo: { nomePersonalizado: 'Tesouro Teste 2030', tipoInvestimento: 'Tesouro Selic', indexador: 'SELIC', instituicao: 'CORRETORA X', tipoCarteira: 'emergencial',
      quantidade: 1.5, vencimento: '03/2030', totalInvestido: 200, totalAtualizado: 210, rentabilidadeContratada: { texto: 'SELIC + 0,1%' },
      irSeResgatasseHoje: { impostoSeResgatasseHoje: 1.5, valorLiquidoSeResgatasseHoje: 208.5 } },
    serie: [{ data: '2026-01-02', valor: 200 }, { data: '2026-01-09', valor: 209 }],
    transacoes: [{ data: '2026-01-02', tipo: 'Compra', entradaSaida: 'Credito', quantidade: 1.5, preco: 133.33, total: 200 }],
    proventos: [], aReceber: [], pagosNaoLancados: [], indices: [{ data: '2026-01-01', cdi: 100, ipca: 50, patrimonio: 1000 }],
  };
  const { doc, chamadas } = await montar({ resposta: rf, ref: 'rf:Tesouro Teste 2030|CORRETORA X' });
  assert.deepEqual(chamadas.ativo, ['rf:Tesouro Teste 2030|CORRETORA X']);
  // 02/10/2026: renda fixa não tem pregão (sem gráfico do dia); título do Tesouro ganha a seção de vídeos com o canal Tesouro Direto
  assert.equal(doc.querySelector('.at-dia'), null);
  assert.deepEqual(chamadas.intradia, []);
  assert.match(doc.querySelector('#at-videos .vd-canal-oficial').getAttribute('href'), /@TesouroDiretoOficial$/);
  assert.deepEqual(chamadas.teses, []);
  assert.deepEqual(chamadas.noticias, []);
  assert.equal(doc.getElementById('at-faixa'), null);
  assert.equal(doc.getElementById('at-tese'), null);
  assert.match(txt(doc.querySelector('.at-cotacao')), /Saldo bruto R\$\s*210,00/);
  assert.match(txt(doc.getElementById('at-indicadores')), /Características/);
  assert.match(txt(doc.getElementById('at-indicadores')), /SELIC \+ 0,1%/);
  assert.match(txt(doc.getElementById('atResumo')), /Se resgatasse hoje R\$\s*208,50 IR de R\$\s*1,50/);
  assert.match(doc.querySelectorAll('#ativoCabecalho nav a')[1].getAttribute('href'), /\/carteiras\/index\.html#renda-fixa$/);
  assert.match(txt(doc.getElementById('atExtratoTabela')), /Aplicação/);
});

test('ativo: fora da carteira avisa; erro do Apps Script e endereço sem ?ref= mostram a mensagem', async () => {
  const nunca = { ...respostaAcao(), ativo: null, serie: [], transacoes: [], proventos: [], aReceber: [] };
  const { doc } = await montar({ resposta: nunca });
  assert.match(txt(doc.querySelector('.at-aviso')), /ainda não tem TEST3/);

  const { doc: doc2 } = await montar({ resposta: { ok: false, etapa: 'ativo', erro: 'falhou' } });
  assert.equal(doc2.getElementById('ativoErro').hidden, false);
  assert.match(txt(doc2.getElementById('ativoErro')), /TEST3.*falhou/);

  const { doc: doc3 } = montarDom('');
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  await montarPaginaAtivo('tk', { doc: doc3, ref: '', getAtivoImpl: async () => { throw new Error('não devia chamar'); }, carregarEstaticosImpl: async () => ({}) });
  assert.match(txt(doc3.getElementById('ativoErro')), /Nenhum ativo informado/);
});

test('ativo: links relevantes - sem B3; TradingView e Google Finance (Brasil: BMFBOVESPA/BVMF; EUA: bolsa do "Sobre")', async () => {
  const { doc } = await montar();
  const hrefs = [...doc.querySelectorAll('#at-links a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.includes('https://www.tradingview.com/symbols/BMFBOVESPA-TEST3/'));
  assert.ok(hrefs.includes('https://www.google.com/finance/quote/TEST3:BVMF'));
  assert.ok(!hrefs.some((h) => /b3\.com\.br/.test(h)), 'sem links da B3');

  const { tradingViewUrl, googleFinanceUrl } = await import('../assets/js/pages/ativo.js');
  const eua = (bolsa) => ({ ticker: 'TSTU', classe: 'acoesEua', sobre: bolsa ? { bolsa } : null });
  assert.equal(tradingViewUrl(eua('NYSE')), 'https://www.tradingview.com/symbols/NYSE-TSTU/');
  assert.equal(googleFinanceUrl(eua('NASDAQ')), 'https://www.google.com/finance/quote/TSTU:NASDAQ');
  assert.equal(googleFinanceUrl(eua('OTC')), 'https://www.google.com/finance/quote/TSTU:OTCMKTS');
  assert.equal(tradingViewUrl(eua('OTC')), 'https://www.tradingview.com/symbols/OTC-TSTU/');
  assert.equal(tradingViewUrl(eua(null)), 'https://www.tradingview.com/symbols/TSTU/', 'sem bolsa: deixa o TradingView achar');
  assert.equal(tradingViewUrl({ ticker: 'Tesouro X', ehRf: true }), null, 'renda fixa não tem');
});

test('ativo: IR "Na declaração" - ficha 03/01 com CNPJ, discriminação de 31/12 do ano passado e prévia de hoje, botão copia o texto', async () => {
  const { doc, w } = await montar();
  const decl = doc.querySelector('#at-ir .at-ir-declaracao');
  assert.ok(decl, 'bloco Na declaração');
  assert.match(txt(decl), /Grupo 03 - Participações societárias/);
  assert.match(txt(decl), /Código 01 - Ações/);
  assert.match(txt(decl), /CNPJ 00\.000\.000\/0000-00/);
  const textos = [...decl.querySelectorAll('.at-ir-texto')].map((p) => p.textContent);
  assert.ok(textos.length >= 1);
  assert.ok(textos.every((t) => /CÓDIGO DE NEGOCIAÇÃO TEST3/.test(t)));
  assert.match(txt(decl), /Hoje \(prévia de 31\/12\/2026\)/);

  let copiado = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copiado = t; } }, configurable: true });
  const btn = decl.querySelector('.at-ir-copiar');
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(copiado, doc.getElementById(btn.dataset.copiar).textContent);
  assert.equal(btn.textContent, 'Copiado ✓');
});

test('ativo: abas - Visão geral aberta; Extrato e Sobre escondidas; clique troca o painel e guarda no endereço; setas do teclado navegam', async () => {
  const { doc, w } = await montar();
  const painel = (id) => doc.getElementById(`at-aba-${id}`);
  assert.equal(painel('visao').hidden, false);
  assert.equal(painel('extrato').hidden, true);
  assert.equal(painel('sobre').hidden, true);
  assert.ok(painel('visao').querySelector('#at-graficos') && painel('visao').querySelector('#at-proventos') && painel('visao').querySelector('#at-noticias') && painel('visao').querySelector('#at-tese'));
  assert.ok(painel('extrato').querySelector('#at-mensal') && painel('extrato').querySelector('#at-extrato'));
  assert.ok(painel('sobre').querySelector('#at-sobre') && painel('sobre').querySelector('#at-ir'));
  const ordem = [...painel('visao').querySelectorAll('.at-col-principal > [id]')].map((s) => s.id);
  assert.deepEqual(ordem, ['at-graficos', 'at-proventos', 'at-noticias', 'at-videos', 'at-tese'], 'notícias logo abaixo de proventos, depois vídeos; tese no corpo');

  const aba = (id) => doc.querySelector(`#ativoCabecalho .tabs [data-tab="${id}"]`);
  clique(w, aba('extrato'));
  assert.equal(painel('extrato').hidden, false);
  assert.equal(painel('visao').hidden, true);
  assert.equal(aba('extrato').getAttribute('aria-selected'), 'true');
  assert.equal(w.location.hash, '#extrato');
  aba('extrato').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(painel('sobre').hidden, false);
  assert.equal(w.location.hash, '#sobre');
  clique(w, aba('visao'));
  assert.equal(w.location.hash, '');
});

test('ativo: abre direto na aba do endereço (#sobre)', async () => {
  const { doc } = await montar({ hash: '#sobre' });
  assert.equal(doc.getElementById('at-aba-sobre').hidden, false);
  assert.equal(doc.getElementById('at-aba-visao').hidden, true);
  assert.equal(doc.querySelector('#ativoCabecalho .tabs [data-tab="sobre"]').getAttribute('aria-selected'), 'true');
});

test('ativo: mês a mês - ordena pelo título da coluna, rodapé com o acumulado e alternador Tabela/Gráfico', async () => {
  const { doc, w } = await montar({ hash: '#extrato' });
  const meses = () => [...doc.querySelectorAll('#atMensalTabela tbody tr')].map((tr) => txt(tr.querySelector('td')));
  assert.deepEqual(meses(), ['mar/26', 'fev/26', 'jan/26'], 'mais recente primeiro');
  const thMes = [...doc.querySelectorAll('#atMensalTabela th.cc-th-ordenavel')].find((th) => /Mês/.test(th.textContent));
  clique(w, thMes);
  assert.deepEqual(meses(), ['jan/26', 'fev/26', 'mar/26']);
  assert.match(txt(doc.querySelector('#atMensalTabela tfoot')), /Desde o início \(3 meses\) · rentab\./);
  assert.ok(doc.querySelector('#atMensalTabela .var'), 'rentabilidade com seta e cor');
  clique(w, doc.querySelector('#atMensalVista [data-vista="grafico"]'));
  assert.equal(doc.getElementById('atMensalTabela').hidden, true);
  assert.ok(doc.querySelector('#atMensalGrafico .chart--barras-agrupadas svg'));
  assert.match(txt(doc.getElementById('atMensalGrafico')), /TEST3 \(rentab\. no mês\)/);
});

test('ativo: extrato - tags por tipo, ordenação pelo título, filtro por ano e rodapé com as somas', async () => {
  const resposta = respostaAcao();
  resposta.transacoes.unshift({ data: '2025-11-03', tipo: 'Compra', preco: 9, quantidade: 5, taxa: 0, total: 45, totalBrl: 45, lucro: null });
  resposta.transacoes.push({ data: '2026-03-02', tipo: 'Venda', preco: 13, quantidade: 5, taxa: 0, total: 65, totalBrl: 65, lucro: 8 });
  const { doc, w } = await montar({ resposta, hash: '#extrato' });
  const linhas = () => [...doc.querySelectorAll('#atExtratoTabela tbody tr')];
  assert.equal(linhas().length, 5);
  assert.ok(linhas()[0].querySelector('.chip-tonal.chip-warn'), 'venda = tag de saída');
  assert.match(txt(doc.querySelector('#atExtratoTabela tfoot')), /5 lançamentos · compras R\$\s*265,00 · vendas R\$\s*65,00 · proventos R\$\s*5,00/);
  const thTotal = [...doc.querySelectorAll('#atExtratoTabela th.cc-th-ordenavel')].find((th) => /Total/.test(th.textContent));
  clique(w, thTotal);
  assert.match(txt(linhas()[0]), /R\$\s*120,00/, 'maior total primeiro');
  const selAno = doc.getElementById('atExtratoAno');
  assert.deepEqual([...selAno.options].map((o) => o.value), ['', '2026', '2025'], 'filtro de ano do lado direito do título');
  assert.ok(selAno.closest('.at-controles'));
  selAno.value = '2025';
  selAno.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(linhas().length, 1);
  assert.match(txt(linhas()[0]), /03\/11\/2025/);
  clique(w, doc.querySelector('#atExtratoFiltros [data-filtro="provento"]'));
  assert.match(txt(doc.getElementById('atExtratoTabela')), /Nada por aqui/);
});

test('ativo: Sobre com seções longas e imagens (https ou assets/ do site; o resto fica de fora)', async () => {
  const estaticos = structuredClone(ESTATICOS);
  Object.assign(estaticos.sobre.ativos.TEST3, {
    imagem: { url: 'https://img.example/fabrica.jpg', legenda: 'Fábrica', credito: 'Foto: Exemplo' },
    secoes: [
      { titulo: 'História', texto: 'Primeiro parágrafo.\n\nSegundo parágrafo.', imagem: { url: 'assets/imgs/teste.webp', legenda: 'Sede' } },
      { titulo: 'Negócio', texto: 'Texto.', imagem: { url: 'javascript:alert(1)' } },
    ],
    fontes: ['https://fonte.example/a', 'javascript:alert(1)'],
  });
  const { doc } = await montar({ estaticos });
  const sobre = doc.getElementById('at-sobre');
  const imgs = [...sobre.querySelectorAll('figure img')].map((i) => i.getAttribute('src'));
  assert.equal(imgs.length, 2, 'javascript: fica de fora');
  assert.equal(imgs[0], 'https://img.example/fabrica.jpg');
  assert.match(imgs[1], /\/assets\/imgs\/teste\.webp$/, 'caminho do site vira endereço absoluto');
  assert.equal(sobre.querySelectorAll('.at-sobre-secao').length, 2);
  assert.equal(sobre.querySelectorAll('.at-sobre-secao')[0].querySelectorAll('p').length, 2);
  assert.match(txt(sobre), /Foto: Exemplo/);
  assert.deepEqual([...sobre.querySelectorAll('.at-fonte a')].map((a) => a.textContent), ['fonte.example']);
});

test('ativo: exportar CSV - extrato e mês a mês com o filtro atual (separador ";", vírgula decimal, BOM)', async () => {
  const { csvDe, csvExtrato, csvMensal } = await import('../assets/js/pages/ativo.js');
  const csv = csvDe(['A', 'B'], [[1.5, 'texto; com "aspas"'], [null, 2]]);
  assert.equal(csv, '﻿A;B\r\n1,5;"texto; com ""aspas"""\r\n;2');
  const { doc, w } = await montar({ hash: '#extrato' });
  const baixados = [];
  w.URL.createObjectURL = (blob) => { baixados.push(blob); return 'blob:x'; };
  w.URL.revokeObjectURL = () => {};
  const nomes = [];
  w.HTMLAnchorElement.prototype.click = function () { nomes.push(this.download); };
  clique(w, doc.querySelector('#atExtratoFiltros [data-filtro="provento"]'));
  clique(w, doc.getElementById('atExtratoCsv'));
  clique(w, doc.getElementById('atMensalCsv'));
  assert.deepEqual(nomes, ['TEST3-extrato.csv', 'TEST3-mes-a-mes.csv']);
  const texto = await baixados[0].text();
  const linhas = texto.replace('﻿', '').split('\r\n');
  assert.equal(linhas[0], 'Data;Data com;Tipo;Quantidade;Preço / por cota;Moeda;Total;Total (R$);Lucro/prejuízo');
  assert.equal(linhas.length, 2, 'só o provento (filtro atual)');
  assert.equal(linhas[1], '15/02/2026;05/02/2026;Dividendo;20;0,25;BRL;5;5;');
  const mensal = (await baixados[1].text()).split('\r\n');
  assert.match(mensal[0].replace(/^\ufeff/, ''), /^Mês;Saldo \(R\$\);Quantidade;Rentabilidade no mês \(%\);Ibovespa \(%\)/);
  assert.equal(mensal.length, 4);
  assert.ok(typeof csvExtrato === 'function' && typeof csvMensal === 'function');
});

test('ativo: indicadores com uma conclusão embaixo de cada um (DY x CDI, P/VP, P/L, preço-teto)', async () => {
  const resposta = respostaAcao();
  resposta.referencias = { cdi12m: 10 };
  const { doc } = await montar({ resposta });
  const ind = doc.getElementById('at-indicadores');
  const conclusoes = [...ind.querySelectorAll('.at-ind-conclusao')].map((p) => txt(p));
  assert.ok(conclusoes.some((t) => /Só em proventos, rendeu 5,0% em 12 meses: 50% do CDI do período \(10,0%\)\./.test(t)), conclusoes.join(' | '));
  assert.ok(conclusoes.some((t) => /R\$ 0,90 por R\$ 1,00 de patrimônio: 10,0% abaixo do valor patrimonial/.test(t)));
  assert.ok(conclusoes.some((t) => /7,5 anos do lucro atual - um lucro de 13,3% ao ano sobre a cotação \(o CDI rendeu 10,0% em 12 meses\)/.test(t)));
  assert.ok(conclusoes.some((t) => /A cotação está 10,0% abaixo do seu preço-teto \(margem de segurança\)\./.test(t)));
  assert.ok(ind.querySelector('.at-ind-conclusao b.good'), 'destaque verde quando favorável');
});

test('ativo: vídeos - seção na visão geral; busca com ticker + apelidos só quando aparece na tela; toca no próprio cartão', async () => {
  const pedidos = [];
  const estaticos = structuredClone(ESTATICOS);
  estaticos.sobre.ativos.TEST3.apelidos = ['Teste SA'];
  const { dom, doc, w } = montarDom('TEST3');
  let observado = null;
  w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { observado = { cb: this.cb, el }; } disconnect() {} };
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  await montarPaginaAtivo('tk', {
    doc,
    getAtivoImpl: async () => structuredClone(respostaAcao()),
    getNoticiasImpl: async () => ({ ok: true, noticias: [] }),
    getTesesImpl: async () => ({ ok: true, configurado: false }),
    getVideosImpl: async (t, p) => { pedidos.push(p); return { ok: true, configurado: true, videos: [{ id: 'abcdefghijk', canal: 'Canal X', titulo: 'TEST3 <b>vale?</b>', publicado: '2026-03-09T12:00:00Z' }] }; },
    getIntradiaImpl: async () => ({ ok: true, resultado: {} }),
    getMetasImpl: async () => ({ ok: false }),
    carregarEstaticosImpl: async () => estaticos,
    agora: () => new Date('2026-03-10T15:00:00Z'),
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(pedidos, [], 'ainda não apareceu na tela');
  assert.equal(observado.el.id, 'at-videos');
  observado.cb([{ isIntersecting: true }]);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(pedidos, [{ termos: ['TEST3', 'Teste SA'], ticker: 'TEST3' }]);
  const card = doc.querySelector('#at-videos .vd-card');
  assert.match(card.querySelector('img').getAttribute('src'), /i\.ytimg\.com\/vi\/abcdefghijk\//);
  assert.equal(card.querySelector('.vd-titulo').textContent, 'TEST3 <b>vale?</b>', 'título é texto');
  assert.match(txt(card.querySelector('.vd-meta')), /Canal X · há 1d/);
  clique(w, card.querySelector('.vd-thumb'));
  assert.match(card.querySelector('iframe.vd-player').getAttribute('src'), /youtube-nocookie\.com\/embed\/abcdefghijk/);
  dom.window.close();
});

// ---------------------------------------------------------------------------
// 02/10/2026 (Tiago: "gráfico de variação diária igual da home; do lado do
// hero no desktop, embaixo no mobile. Clicando no gráfico abre o Google
// Finance" + "Canais do YouTube por ativo mostrados na página").
// ---------------------------------------------------------------------------

const SERIE_DIA = { preco: 10.2, fechamentoAnterior: 10, variacao: 0.02, dia: '2026-03-10', inicio: 0, fim: 420 * 60, t: [0, 60, 120, 180], v: [10.05, 9.9, 10.1, 10.2], moeda: 'BRL' };

test('ativo: gráfico do dia ao lado do cabeçalho - pede a chave do ativo, desenha a linha do pregão (verde) e o fechamento anterior, e abre o Google Finance', async () => {
  const { doc, chamadas } = await montar({ intradia: (chaves) => ({ ok: true, resultado: { [chaves[0]]: SERIE_DIA } }) });
  assert.deepEqual(chamadas.intradia, [['acoes:TEST3']]);
  const caixa = doc.querySelector('.at-hero a.at-dia');
  assert.ok(caixa, 'gráfico no cabeçalho, entre o ativo e a cotação');
  assert.equal(caixa.nextElementSibling.className, 'at-cotacao');
  assert.equal(caixa.getAttribute('href'), 'https://www.google.com/finance/quote/TEST3:BVMF');
  assert.equal(caixa.getAttribute('target'), '_blank');
  assert.equal(caixa.getAttribute('rel'), 'noopener');
  assert.ok(!caixa.classList.contains('carregando') && !caixa.classList.contains('sem-dado'));
  // 06/10/2026: o gráfico do dia é a sparkline da biblioteca (inicio-intradia.js); a direção fica em data-intradia-dir
  assert.ok(caixa.querySelector('.at-dia-grafico .chart-spark svg, .at-dia-grafico svg'), 'linha do pregão desenhada');
  assert.equal(caixa.querySelector('.at-dia-grafico').dataset.intradiaDir, 'sobe');
  assert.equal(caixa.querySelector('.intradia-dia'), null, 'pregão de hoje: sem rótulo de data');
  assert.match(txt(caixa), /Variação do dia Google Finance ↗/);
});

test('ativo: gráfico do dia - esqueleto enquanto carrega, aviso discreto sem série, pregão de outro dia com a data; FII e EUA com a chave certa', async () => {
  const { chaveIntradiaAtivo, graficoDiaHtml, preencherGraficoDia } = await import('../assets/js/pages/ativo.js');
  assert.equal(chaveIntradiaAtivo({ ticker: 'FUND11', classe: 'fiis' }), 'fiis:FUND11');
  assert.equal(chaveIntradiaAtivo({ ticker: 'tstu', classe: 'acoesEua' }), 'usa:TSTU');
  assert.equal(chaveIntradiaAtivo({ ticker: 'Tesouro X', classe: 'rendaFixa', ehRf: true }), null);

  const dom = new JSDOM(`<div id="r">${graficoDiaHtml({ ticker: 'TSTU', classe: 'acoesEua', chaveIntradia: 'usa:TSTU', sobre: { bolsa: 'NYSE' } })}</div>`);
  const r = dom.window.document.getElementById('r');
  const caixa = r.querySelector('.at-dia');
  assert.equal(caixa.getAttribute('href'), 'https://www.google.com/finance/quote/TSTU:NYSE');
  assert.ok(caixa.classList.contains('carregando') && caixa.querySelector('.skel'), 'esqueleto');
  preencherGraficoDia(r, 'usa:TSTU', null, { agora: new Date('2026-03-10T15:00:00Z') });
  assert.ok(caixa.classList.contains('sem-dado') && !caixa.classList.contains('carregando'));
  assert.match(txt(caixa), /Gráfico do dia indisponível agora/);
  assert.equal(caixa.getAttribute('href'), 'https://www.google.com/finance/quote/TSTU:NYSE', 'continua abrindo o Google Finance');
  preencherGraficoDia(r, 'usa:TSTU', { ...SERIE_DIA, dia: '2026-03-09', v: [10, 9.8, 9.7, 9.6] }, { agora: new Date('2026-03-10T15:00:00Z') });
  assert.ok(!caixa.classList.contains('sem-dado'));
  assert.equal(caixa.querySelector('.at-dia-grafico').dataset.intradiaDir, 'desce', 'abaixo do fechamento anterior: vermelho');
  assert.equal(caixa.querySelector('.intradia-dia').textContent, 'pregão 09/03');

  // falha na busca: tira o esqueleto e avisa (sem quebrar a página)
  const { doc } = await montar({ intradia: () => { throw new Error('rede'); } });
  assert.ok(doc.querySelector('.at-dia.sem-dado'));
  assert.ok(doc.getElementById('atResumo'), 'resto da página ok');
});

test('ativo: Google Finance - ações e FIIs na BVMF; EUA na bolsa do "Sobre" (sem bolsa: busca); renda fixa não tem', async () => {
  const { googleFinanceUrl } = await import('../assets/js/pages/ativo.js');
  assert.equal(googleFinanceUrl({ ticker: 'test3', classe: 'acoes' }), 'https://www.google.com/finance/quote/TEST3:BVMF');
  assert.equal(googleFinanceUrl({ ticker: 'FUND11', classe: 'fiis' }), 'https://www.google.com/finance/quote/FUND11:BVMF');
  assert.equal(googleFinanceUrl({ ticker: 'TSTU', classe: 'acoesEua', sobre: { bolsa: 'nasdaq' } }), 'https://www.google.com/finance/quote/TSTU:NASDAQ');
  // /finance/quote/TSTU sem a bolsa cai na página inicial do Google Finance; a busca acha o papel
  assert.equal(googleFinanceUrl({ ticker: 'TSTU', classe: 'acoesEua', sobre: null }), 'https://www.google.com/finance?q=TSTU');
  assert.equal(googleFinanceUrl({ ticker: 'Tesouro X', ehRf: true }), null);
});

test('ativo: canal oficial - bloco no topo dos vídeos (nova aba) e a busca de vídeos manda o canal; ativo sem canal fica igual', async () => {
  const resposta = respostaAcao();
  resposta.ticker = 'VALE3'; // ticker com canal na lista pública (canais-youtube.js); números inventados
  resposta.ativo.ticker = 'VALE3';
  const pedidos = [];
  const { dom, doc, w } = montarDom('VALE3');
  let observado = null;
  w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { observado = { cb: this.cb, el }; } disconnect() {} };
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  await montarPaginaAtivo('tk', {
    doc,
    getAtivoImpl: async () => structuredClone(resposta),
    getNoticiasImpl: async () => ({ ok: true, noticias: [] }),
    getTesesImpl: async () => ({ ok: true, configurado: false }),
    getIntradiaImpl: async () => ({ ok: true, resultado: {} }),
    getMetasImpl: async () => ({ ok: false }),
    getVideosImpl: async (t, p) => {
      pedidos.push(p);
      return { ok: true, configurado: false, canalOficial: { id: 'UCMDd2zfFdlupOwg_KyqpQWQ', nome: 'Vale' }, videos: [
        { id: 'oficial0001', canal: 'Vale', titulo: 'Novidade', publicado: '2026-03-09T12:00:00Z', oficial: true },
        { id: 'meucanal001', canal: 'Canal X', titulo: 'VALE3 hoje', publicado: '2026-03-08T12:00:00Z' },
      ] };
    },
    carregarEstaticosImpl: async () => ESTATICOS,
    agora: () => new Date('2026-03-10T15:00:00Z'),
  });
  await new Promise((r) => setTimeout(r, 0));
  const bloco = doc.querySelector('#at-videos .vd-topo a.vd-canal-oficial');
  assert.equal(bloco.getAttribute('href'), 'https://www.youtube.com/user/Vale');
  assert.equal(bloco.getAttribute('target'), '_blank');
  assert.match(txt(bloco), /Canal oficial Vale @ValenoBrasil/);
  observado.cb([{ isIntersecting: true }]);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(pedidos, [{ termos: ['VALE3'], ticker: 'VALE3', canal: 'UCMDd2zfFdlupOwg_KyqpQWQ' }]);
  const cards = [...doc.querySelectorAll('#at-videos .vd-card')];
  assert.equal(cards.length, 2, 'sem canal cadastrado na planilha, mas com o oficial: mostra os vídeos');
  assert.equal(cards[0].querySelector('.vd-oficial').textContent, 'Canal oficial');
  assert.equal(cards[1].querySelector('.vd-oficial'), null);
  dom.window.close();

  const { doc: doc2 } = await montar();
  assert.equal(doc2.querySelector('.vd-canal-oficial'), null, 'TEST3 não tem canal');
});

// 02/10/2026: integração - "Escolher período" nos gráficos, card de Análise
// (rentabilidade e proventos por mês), "Ontem era" e o menu renomeado.
test('ativo: "Escolher período" no filtro dos gráficos - chip abre o calendário; intervalo redesenha os 2 gráficos e o chip mostra o intervalo', async () => {
  const { doc, w } = await montar();
  const tabs = doc.querySelector('#atGraficos .cg-periodo');
  const chip = tabs.querySelector('.fp-chip');
  assert.ok(chip, 'chip no fim do filtro');
  assert.match(chip.textContent, /Escolher período/);
  clique(w, chip);
  const pop = doc.querySelector('.fp-camada .fp-pop[role="dialog"]');
  assert.ok(pop, 'calendário aberto');
  // dias fora do histórico (antes da 1ª compra / depois de hoje) desabilitados
  assert.equal(pop.querySelector('[data-dia="2026-03-12"]')?.getAttribute('aria-disabled'), 'true');
  clique(w, pop.querySelector('[data-acao="cancelar"]'));
  assert.equal(doc.querySelector('.fp-camada'), null);

  const filtro = tabs._filtroPeriodo;
  assert.ok(filtro.definir({ inicio: '2026-01-30', fim: '2026-02-27' }));
  assert.match(chip.textContent, /30 jan–27 fev/);
  assert.equal(chip.getAttribute('aria-pressed'), 'true');
  assert.equal(tabs.querySelector('[data-periodo="mes"]').getAttribute('aria-pressed'), 'false');
  // período que termina antes de hoje: o valor mostrado é o do fim do intervalo
  const rotulos = [...doc.querySelectorAll('#atGraficos .chart-card-rot')].map((e) => txt(e));
  assert.equal(rotulos.length, 2);
  rotulos.forEach((t) => assert.match(t, /em 27\/02\/2026/));
  assert.ok(doc.querySelector('#atGraficos .cg-painel-rentabilidade .chart--linha svg'));
  // lembra a escolha (uma chave pra todos os ativos)
  assert.match(w.localStorage.getItem('periodo:ativo'), /2026-01-30/);
});

test('ativo: card de Análise embaixo da Rentabilidade (ativo x índices) e dos proventos por mês; "Ontem era" no saldo', async () => {
  const { doc } = await montar();
  const ag = doc.querySelector('#atGraficos .cg-analise details.ag');
  assert.ok(ag, 'card de análise da rentabilidade');
  assert.match(txt(ag), /TEST3 (rendeu|recuou)/);
  assert.match(txt(ag), /Ibovespa|CDI/);
  assert.match(txt(ag), /Não é recomendação/);
  // "Ontem era" + meses anteriores no bloco do saldo (Mês atual)
  assert.ok(doc.querySelector('#atGraficos .cg-painel-evolucao .cg-cmp'), 'comparativo no bloco do saldo');
  assert.match(txt(doc.querySelector('#atGraficos .cg-painel-evolucao .cg-cmp')), /era/);
  // proventos: 1 pagamento inventado (fev) - média do mês fechado
  const prov = doc.querySelector('#atProvAnalise details.ag');
  assert.ok(prov, 'card de análise dos proventos');
  assert.match(txt(prov), /Média de R\$\s*5,00\/mês em fev\/26/);
  // sem nenhum provento nos últimos 12 meses: sem card
  const semProv = respostaAcao();
  semProv.proventos = [];
  const { doc: doc2 } = await montar({ resposta: semProv });
  assert.equal(doc2.getElementById('atProvAnalise').hidden, true);
  assert.equal(doc2.querySelector('#atProvAnalise details'), null);
});

test('ativo: textos e link apontam pra "Acompanhamento de Ativos" (menu renomeado; o arquivo continua distribuicoes-metas.html)', async () => {
  const { doc } = await montar();
  const conteudo = doc.getElementById('ativoConteudo');
  assert.doesNotMatch(conteudo.innerHTML, /Distribuições e Metas/);
  const link = doc.querySelector('#at-faixa a.at-link-acomp');
  assert.ok(link);
  assert.equal(link.textContent, 'Acompanhamento de Ativos');
  assert.match(link.getAttribute('href'), /distribuicoes-metas\.html$/);
});

// ---- 03/10/2026: "Análise do ativo" (criterios/motor.js) + metas de Metas e Objetivos ----

test('ativo: card "Análise do ativo" - nota, veredito, até 5 pontos, todos os critérios por grupo (faixa e fonte) e o selo do motor nas conclusões', async () => {
  const resposta = respostaAcao();
  resposta.referencias = { cdi12m: 10 };
  const { doc } = await montar({ resposta });
  const card = doc.getElementById('at-analise');
  assert.ok(card, 'card na lateral');
  assert.equal(card.previousElementSibling && card.previousElementSibling.id, 'at-indicadores', 'logo depois dos indicadores');
  assert.match(txt(card.querySelector('.at-card-titulo')), /Análise do ativo \d+ critérios/);
  const nota = Number(card.querySelector('.at-an-nota .chart-anel-valor').textContent);
  assert.ok(nota >= 0 && nota <= 100);
  assert.match(card.querySelector('.at-an-nota').getAttribute('aria-label'), new RegExp(`Nota ${nota} de 100`));
  assert.ok(card.querySelector('.at-an-veredito strong').textContent.length > 3);
  const pontos = card.querySelectorAll('.at-an-pontos > .at-an-ponto');
  assert.ok(pontos.length >= 3 && pontos.length <= 6, `${pontos.length} pontos visíveis`);
  const todos = card.querySelector('details.at-an-todos');
  assert.ok(!todos.open, 'todos os critérios ficam recolhidos');
  assert.match(txt(todos.querySelector('summary')), /Ver todos os critérios \(\d+\)/);
  assert.ok(todos.querySelectorAll('.at-an-grupo-bloco h3').length >= 2, 'agrupado');
  const pl = [...todos.querySelectorAll('.at-an-crit')].find((li) => /^P\/L$/.test(li.querySelector('.at-an-crit-nome').textContent));
  assert.match(txt(pl), /7,5x/);
  assert.match(txt(pl), /bom: 3x a 10x/);
  assert.ok([...pl.querySelectorAll('.at-an-crit-meta a')].every((a) => /^https:/.test(a.getAttribute('href')) && a.target === '_blank'));
  assert.ok(card.querySelector('details.at-an-faltam'), 'dados que faltam, discreto');
  assert.match(txt(card), /Não é recomendação/);
  // conclusões dos indicadores: selo + frase do motor, e a conta de antes como complemento
  const ind = doc.getElementById('at-indicadores');
  const conclPl = [...ind.querySelectorAll('.at-ind')].find((x) => /P\/L/.test(x.querySelector('.at-ind-label').textContent)).querySelector('.at-ind-conclusao');
  assert.ok(conclPl.querySelector('.at-tom.tom-bom'));
  assert.match(txt(conclPl), /^bom P\/L de 7,5x/);
  assert.match(txt(conclPl), /7,5 anos do lucro atual/);
  // preço abaixo do PM? (13,5 > 11): neutro, fica nos critérios da carteira
  assert.match(txt(todos), /acima do seu preço médio R\$ 11,00/);
});

test('ativo: análise com metas - renda fixa marcada Renda Emergencial mostra "investir R$ X aqui completa a meta"; sem metas, sem card', async () => {
  const rf = {
    ok: true, hoje: '2026-01-10', tipo: 'rf', ticker: 'Tesouro Teste 2030', classe: 'rendaFixa', moeda: 'BRL',
    ativo: { nomePersonalizado: 'Tesouro Teste 2030', tipoInvestimento: 'Tesouro Selic', indexador: 'SELIC', instituicao: 'CORRETORA X', tipoCarteira: 'emergencial',
      quantidade: 1.5, vencimento: '03/2030', totalInvestido: 200, totalAtualizado: 210, rentabilidadeContratada: { texto: 'SELIC + 0,1%' } },
    serie: [{ data: '2026-01-02', valor: 200 }, { data: '2026-01-09', valor: 209 }],
    transacoes: [], proventos: [], aReceber: [], pagosNaoLancados: [], indices: [{ data: '2026-01-01', cdi: 100, ipca: 50, patrimonio: 1000 }],
  };
  const metas = {
    ok: true, hoje: '2026-01-10',
    metas: [{ id: 'm1', tipo: 'reservaEmergencia', nome: 'Reserva', status: 'ativa', moeda: 'BRL', especificos: { meses: 3, despesaMensal: 100, usarDespesasPlanilha: false, margem: 0 },
      vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }] }],
    ativos: [{ id: 'rf:Tesouro Teste 2030|CORRETORA X@emergencial', ref: 'rf:Tesouro Teste 2030|CORRETORA X', classe: 'rf', marca: 'emergencial', valorBRL: 210 }],
  };
  const sem = await montar({ resposta: structuredClone(rf), ref: 'rf:Tesouro Teste 2030|CORRETORA X' });
  assert.equal(sem.doc.getElementById('at-analise'), null, 'renda fixa sem meta: sem card');
  const { doc } = await montar({ resposta: rf, ref: 'rf:Tesouro Teste 2030|CORRETORA X', metas });
  await new Promise((r) => setTimeout(r, 30));
  const card = doc.getElementById('at-analise');
  assert.ok(card, 'as metas chegam e o card aparece');
  assert.match(txt(card), /Análise do título/);
  assert.match(txt(card), /Faltam R\$ 90,00 pra meta "Reserva"; investir R\$ 90,00 aqui completa a meta\./);
});

// 05/10/2026 (A-18): a janela dos "12 meses" aparece escrita (os 12 meses fechados da meta de Renda Passiva)
test('ativo: proventos - o card "Últimos 12 meses" diz quais meses entram (12 meses fechados, mês a mês)', async () => {
  const { doc } = await montar();
  const card = txt(doc.querySelector('.at-prov-stats'));
  assert.match(card, /Últimos 12 meses/);
  assert.match(card, /12 meses fechados: 03\/2025 a 02\/2026/);
});

// 05/10/2026 (A-38): os índices (CDI, Ibovespa...) vêm da home guardada no IndexedDB quando ela é de hoje
test('ativo: com a home de hoje guardada pede o ativo sem `indices` e monta os índices dela; sem home (ou velha) pede completo', async () => {
  const { usarMemoriaNoCacheDados, gravarCacheDados } = await import('../assets/js/cache-dados.js');
  const completa = respostaAcao();
  const enxuta = { ...structuredClone(completa), indicesDesde: '2026-01-05' };
  delete enxuta.indices;
  const historico = (ultimoDia) => [
    { data: '2025-12-20', indiceCdi: 90, indiceIpca: 40, ibovespa: 900, patrimonio: 900 }, // antes da janela (5/1 - 7 dias): fica de fora
    { data: '2026-01-02', indiceCdi: 100, indiceIpca: 50, ibovespa: 1000, ifix: null, sp500: null, cambioUsd: null, patrimonio: 1000 },
    { data: '2026-02-27', indiceCdi: 102, indiceIpca: 51, ibovespa: 1020, patrimonio: 1250 },
    { data: ultimoDia, indiceCdi: 102.5, indiceIpca: 51, ibovespa: 1030, patrimonio: 1350 },
  ];
  try {
    // home de hoje no cache: pede sem índices e o resumo sai igual ao de antes (20,0% = 270 de 1.350)
    usarMemoriaNoCacheDados(new Map());
    await gravarCacheDados('home', { ok: true, historico: historico('2026-03-10') });
    const comHome = await montar({ resposta: enxuta });
    assert.deepEqual(comHome.chamadas.opcoesAtivo, [{ semIndices: true }]);
    assert.match(txt(comHome.doc.querySelector('.at-hero')), /20,0%/);
    // home de ontem: não serve (a série tem que chegar até hoje) -> pede completo
    usarMemoriaNoCacheDados(new Map());
    await gravarCacheDados('home', { ok: true, historico: historico('2026-03-09') });
    const velha = await montar({ resposta: completa });
    assert.deepEqual(velha.chamadas.opcoesAtivo, [undefined]);
    // sem home nenhuma: idem
    usarMemoriaNoCacheDados(new Map());
    const sem = await montar({ resposta: completa });
    assert.deepEqual(sem.chamadas.opcoesAtivo, [undefined]);
  } finally {
    usarMemoriaNoCacheDados(null);
  }
});
