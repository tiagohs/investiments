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

function montarDom(ref = 'TEST3') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="carteiras">
    <div id="refreshControlAtivo"></div>
    <div id="ativoLoading"></div><div id="ativoErro" hidden></div><div id="ativoConteudo" hidden></div></body></html>`,
  { url: `https://exemplo.test/repo/ativo/index.html?ref=${encodeURIComponent(ref)}`, pretendToBeVisual: true });
  const w = dom.window;
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
    aviso: 'Resumo informativo.', atualizadoEm: '2026-09',
    classes: { acoes: { titulo: 'Ações brasileiras', regras: [{ titulo: 'Regra A', texto: 'Texto A', fonte: 'https://gov.example/a' }] } },
    proventos: [{ titulo: 'JCP', texto: 'jcp', classes: ['acoes'] }, { titulo: 'Rendimentos de FII', texto: 'fii', classes: ['fiis'] }],
    darf: [], declaracao: [{ titulo: 'Bens e Direitos', texto: 'b' }],
    ondeBaixar: [{ nome: 'B3', oQue: 'informe', url: 'https://b3.example', classes: ['acoes'] }], avisos: [],
  },
};

async function montar({ resposta = respostaAcao(), noticias = { ok: true, noticias: [] }, teses = { ok: true, configurado: false, teses: [], resumos: [] }, ref = 'TEST3', estaticos = ESTATICOS } = {}) {
  const { dom, doc, w } = montarDom(ref);
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  const chamadas = { ativo: [], noticias: [], teses: [] };
  await montarPaginaAtivo('tk', {
    doc,
    getAtivoImpl: async (t, r) => { chamadas.ativo.push(r); return structuredClone(resposta); },
    getNoticiasImpl: async (t, p) => { chamadas.noticias.push(p); return noticias; },
    getTesesImpl: async (t, tk) => { chamadas.teses.push(tk); return teses; },
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
  assert.equal(txt(doc.querySelector('.at-ticker')), 'TEST3');
  assert.match(doc.title, /TEST3/);
  const trilha = doc.querySelectorAll('.at-trilha a');
  assert.match(trilha[1].getAttribute('href'), /\/carteiras\/index\.html#acoes$/);
  assert.equal(txt(trilha[1]), 'Ações');
  assert.match(txt(doc.querySelector('.at-resumo')), /R\$\s*270,00/);
  assert.match(txt(doc.querySelector('.at-resumo')), /Valor aplicado: R\$\s*220,00/);
  assert.match(txt(doc.querySelector('.at-resumo')), /R\$\s*50,00 \+22,73%/);
  assert.match(txt(doc.querySelector('.at-resumo')), /R\$\s*55,00 com proventos/);
  assert.match(txt(doc.querySelector('.at-resumo')), /20,0%/, '270 de 1.350 do patrimônio');
  const faixa = doc.getElementById('at-faixa');
  assert.match(txt(faixa), /10,0% abaixo do seu preço-teto/);
  assert.match(txt(faixa), /Mín\. desde 05\/01\/2026/, 'menos de 1 ano de carteira: avisa');
  assert.ok(faixa.querySelector('.status-pill.good'));
  // o nome veio da planilha com HTML: vira texto, não tag
  assert.equal(doc.querySelector('.at-nome b'), null);
});

test('ativo: gráficos (rentabilidade com o ticker na legenda, aplicado x saldo), mês a mês e proventos', async () => {
  const { doc } = await montar();
  assert.ok(doc.querySelector('#atRentabChart svg.rentab-chart'));
  assert.match(txt(doc.getElementById('atRentabLegenda')), /TEST3/);
  assert.match(txt(doc.getElementById('atRentabLegenda')), /Ibovespa/);
  assert.match(txt(doc.getElementById('atRentabLegenda')), /CDI/);
  assert.ok(doc.querySelector('#atEvolucaoChart svg.rentab-chart'));
  assert.match(txt(doc.getElementById('atEvolucaoInfo')), /Valor aplicado: R\$\s*220,00/);
  const linhas = doc.querySelectorAll('#at-mensal tbody tr');
  assert.equal(linhas.length, 3);
  assert.match(txt(linhas[0]), /mar\/26 R\$\s*270,00 20 \+8,00%/);
  const prov = doc.getElementById('at-proventos');
  assert.match(txt(prov), /Recebidos no total R\$\s*5,00/);
  assert.match(txt(prov), /\+ R\$\s*3,00 a receber/);
  assert.equal(prov.querySelectorAll('.at-lista-receber li').length, 1);
  assert.ok(prov.querySelector('svg.at-barras .at-barra[data-tooltip*="fev/26: R$"]'));
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
  const itens = doc.querySelectorAll('#atNoticiasConteudo .at-noticias li');
  assert.equal(itens.length, 1);
  assert.equal(itens[0].querySelector('img'), null);
  assert.equal(itens[0].querySelector('a').getAttribute('href'), 'https://news.example/1');
  assert.equal(itens[0].querySelector('a').getAttribute('rel'), 'noopener');
  assert.match(txt(itens[0]), /Fonte A · há 3h/);
});

test('ativo: Sobre (só links http) e IR só da classe do ativo', async () => {
  const { doc } = await montar();
  const sobre = doc.getElementById('at-sobre');
  assert.match(txt(sobre), /Teste Sociedade Anônima/);
  assert.equal(sobre.querySelector('i'), null, 'descrição é texto');
  assert.equal(sobre.querySelectorAll('.at-links a').length, 1, 'o link javascript: fica de fora');
  const ir = doc.getElementById('at-ir');
  assert.match(txt(ir), /Ações brasileiras/);
  assert.match(txt(ir), /JCP/);
  assert.doesNotMatch(txt(ir), /Rendimentos de FII/);
  assert.match(txt(ir), /Atualizado em setembro de 2026/);
  assert.equal(ir.querySelector('.at-onde a').getAttribute('href'), 'https://b3.example');
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
  assert.deepEqual(chamadas.teses, []);
  assert.deepEqual(chamadas.noticias, []);
  assert.equal(doc.getElementById('at-faixa'), null);
  assert.equal(doc.getElementById('at-tese'), null);
  assert.match(txt(doc.querySelector('.at-cotacao')), /Saldo bruto R\$\s*210,00/);
  assert.match(txt(doc.getElementById('at-indicadores')), /Características/);
  assert.match(txt(doc.getElementById('at-indicadores')), /SELIC \+ 0,1%/);
  assert.match(txt(doc.querySelector('.at-resumo')), /Se resgatasse hoje R\$\s*208,50 IR de R\$\s*1,50/);
  assert.match(doc.querySelectorAll('.at-trilha a')[1].getAttribute('href'), /\/carteiras\/index\.html#renda-fixa$/);
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
