// tests/ativo-patrimonio.test.js - 05/10/2026: aba "Patrimônio" dos FIIs
// (ativo-patrimonio-calc.js, ativo-patrimonio.js, ativo.js). Dados INVENTADOS
// no formato da resposta de action=fiiPortfolio (PortfolioFii.gs); DOM em
// JSDOM; Leaflet, Nominatim e Apps Script FALSOS (sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  montarVisao, divisaoImoveis, avisoFatoRelevante, resumoImoveis, pontosDoMapa, consultasNavegador, lerRespostaNominatim,
  normalizarNome, pctTexto, baseDisponivel,
} from '../assets/js/pages/ativo-patrimonio-calc.js';
import { patrimonioHtml } from '../assets/js/pages/ativo-patrimonio.js';

const txt = (el) => {
  const partes = [];
  const tw = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};

const IMOVEIS = [
  { nome: 'Shopping Alfa', endereco: 'Av. Brasil, 100 - Centro, Campinas - SP', cidade: 'Campinas', uf: 'SP', area: 30000, pctReceita: 0.6, vacancia: 0.05, inadimplencia: 0.02, classe: 'Renda', segmento: 'Shopping', segmentoFonte: 'nome', k: 'k1', lat: -22.9, lon: -47.06, precisao: 'endereço' },
  { nome: 'Shopping Beta - 50%', endereco: 'Rua das Flores, 200', cidade: 'Curitiba', uf: 'PR', area: 20000, pctReceita: 0.3, vacancia: 0.1, inadimplencia: null, classe: 'Renda', segmento: 'Shopping', segmentoFonte: 'nome', participacao: '50%', k: 'k2' },
  { nome: 'Galpão <b>Gama</b>', endereco: '', cidade: '', uf: '', area: 10000, pctReceita: 0.1, vacancia: 0, inadimplencia: null, classe: 'Renda', segmento: 'Logística', segmentoFonte: 'nome', k: 'k3' },
];
const resposta = (extra = {}) => ({
  ok: true, existe: true, ticker: 'ZZSH11', fonte: 'CVM informe trimestral 2026-06-30 v1 + mensal 2026-08', trimestre: '2026-06-30', atualizadoEm: '2026-10-05T15:00:00.000Z',
  linkFnet: 'https://fnet.exemplo.test/x', conferir: '', reprocessando: false, fatoRelevante: null, faltamCoordenadas: true,
  portfolio: {
    v: 1, ticker: 'ZZSH11', cnpj: '11111111000111', nome: 'FII SHOPPING EXEMPLO', segmentoCvm: 'Shoppings', tipo: 'tijolo',
    ref: { trimestre: '2026-06-30', versao: 1, entrega: '2026-08-13', mensal: '2026-08' },
    composicao: { mes: '2026-08', total: 920, itens: [{ chave: 'imoveis', rotulo: 'Imóveis', valor: 800, pct: 0.87 }, { chave: 'caixa', rotulo: 'Caixa e renda fixa', valor: 20, pct: 0.02 }, { chave: 'outros', rotulo: 'Outros ativos', valor: 0.1, pct: 0.0001 }] },
    porTipoAtivo: [], imoveis: { total: 3, areaTotal: 60000, itens: structuredClone(IMOVEIS) },
  },
  ...extra,
});
const respostaPapel = () => ({
  ok: true, existe: true, ticker: 'ZZPP11', fonte: 'CVM', fatoRelevante: null,
  portfolio: {
    v: 1, ticker: 'ZZPP11', nome: 'FII PAPEL EXEMPLO', segmentoCvm: 'Multicategoria', tipo: 'papel', ref: { trimestre: '2026-06-30', entrega: '2026-08-14' },
    composicao: null, porTipoAtivo: [{ tipo: 'CRI/CRA', valor: 1000, pct: 0.8 }, { tipo: 'FII', valor: 250, pct: 0.2 }],
    papel: {
      total: 1000, n: 3, indexadorFonte: true, identificadoPct: 0.9,
      porIndexador: [{ indexador: 'IPCA', valor: 600, pct: 0.6, n: 1 }, { indexador: 'CDI', valor: 300, pct: 0.3, n: 1 }, { indexador: 'Não identificado', valor: 100, pct: 0.1, n: 1 }],
      titulos: [{ codigo: '24A0000001', securitizadora: 'ALFA SEC', emissao: '80', serie: '1', taxa: 'IPCA + 7,0% a.a.', indexador: 'IPCA', vencimento: '2030-01-15', valor: 600, pct: 0.6 },
        { codigo: '', securitizadora: 'ALFA <i>SEC</i>', emissao: '0', serie: '', taxa: '', indexador: '', vencimento: '', valor: 100, pct: 0.1 }],
      titulosOmitidos: 0,
    },
    cotas: { total: 250, n: 1, itens: [{ ticker: 'ZZSH11', nome: 'FII EXEMPLO SHOPPING', valor: 250, pct: 1 }], omitidos: 0 },
  },
});

// ---------------------------------------------------------------------------

test('Patrimônio (conta): divisão por imóvel/segmento/estado, base receita ou área, "Outros" e itens sem peso', () => {
  const v = montarVisao(resposta(), null);
  const porImovel = divisaoImoveis(v.imoveis, { por: 'imovel', base: 'receita' });
  assert.deepEqual(porImovel.itens.map((i) => [i.rotulo, Math.round(i.share * 100)]), [['Shopping Alfa', 60], ['Shopping Beta - 50%', 30], ['Galpão <b>Gama</b>', 10]]);
  const porSeg = divisaoImoveis(v.imoveis, { por: 'segmento', base: 'area' });
  assert.deepEqual(porSeg.itens.map((i) => [i.rotulo, i.n, i.estimado]), [['Shopping', 2, true], ['Logística', 1, true]]);
  const porUf = divisaoImoveis(v.imoveis, { por: 'estado', base: 'receita' });
  assert.deepEqual(porUf.itens.map((i) => i.rotulo), ['SP', 'PR', 'Não identificado'], '"Não identificado" sempre por último');
  assert.ok(Math.abs(porUf.itens.reduce((s, i) => s + i.share, 0) - 1) < 1e-9);
  const muitos = Array.from({ length: 12 }, (_, i) => ({ nome: `I${i}`, pctReceita: 0.1, uf: 'SP' }));
  const d = divisaoImoveis(muitos, { por: 'imovel', base: 'receita', max: 5 });
  assert.equal(d.itens.length, 5);
  assert.deepEqual([d.itens[4].rotulo, d.itens[4].n, d.itens[4].outros], ['Outros (8)', 8, true]);
  assert.deepEqual(divisaoImoveis([{ nome: 'x', pctReceita: null, area: null }], {}).itens, []);
  assert.deepEqual(plainBase(baseDisponivel([{ pctReceita: 0, area: 5 }])), { receita: false, area: true, padrao: 'area' });
  const r = resumoImoveis(v.imoveis);
  assert.equal(r.n, 3); assert.equal(r.area, 60000); assert.equal(r.estados, 2);
  assert.ok(Math.abs(r.vacancia - (30000 * 0.05 + 20000 * 0.1 + 10000 * 0) / 60000) < 1e-9, 'vacância ponderada pela área');
  assert.deepEqual([pontosDoMapa(v.imoveis).pontos.length, pontosDoMapa(v.imoveis).sem], [1, 2]);
  assert.equal(pctTexto(0.1234), '12,3%'); assert.equal(pctTexto(0.0001), '<0,1%'); assert.equal(pctTexto(NaN), '—');
});
const plainBase = (x) => JSON.parse(JSON.stringify(x));

test('Patrimônio (curadoria): link/foto só https, sobrepõe segmento e posição, oculta vendido, extra e indexador manual', () => {
  const manual = {
    tipo: 'hibrido', observacao: 'Texto <b>curto</b>', conferidoEm: '2026-09-01',
    links: [{ rotulo: 'Site do gestor', url: 'https://gestora.exemplo/fundo' }, { rotulo: 'ruim', url: 'javascript:alert(1)' }],
    fotoFundo: { url: 'http://inseguro.exemplo/a.jpg' },
    imoveis: {
      'SHOPPING alfa': { segmento: 'Shopping regional', lat: -22.8, lon: -47.0, link: 'https://alfa.exemplo', foto: { url: 'https://commons.exemplo/alfa.jpg', legenda: 'Fachada', credito: 'Fulano', licenca: 'CC BY-SA 4.0' } },
      'Galpão <b>Gama</b>': { ocultar: true },
    },
    imoveisExtras: [{ nome: 'Novo Delta', cidade: 'Recife', uf: 'PE', area: 5000, pctReceita: 0.05, lat: -8.05, lon: -34.9 }],
  };
  const v = montarVisao(resposta(), manual);
  assert.equal(v.tipo, 'hibrido');
  assert.deepEqual(v.links.map((l) => l.rotulo), ['Site do gestor'], 'javascript: não vira link');
  assert.equal(v.fotoFundo, null, 'foto só https');
  assert.deepEqual(v.imoveis.map((i) => i.nome), ['Shopping Alfa', 'Shopping Beta - 50%', 'Novo Delta']);
  const alfa = v.imoveis[0];
  assert.deepEqual([alfa.segmento, alfa.segmentoFonte, alfa.lat, alfa.precisao, alfa.link, alfa.foto.licenca], ['Shopping regional', 'manual', -22.8, 'manual', 'https://alfa.exemplo', 'CC BY-SA 4.0']);
  assert.equal(v.imoveis[2].extra, true);
  assert.equal(normalizarNome('  Galpão  <B>Gama</B> '), 'galpao b gama b');

  const papel = montarVisao(respostaPapel(), { indexadores: [{ indexador: 'IPCA', pct: 0.7 }, { indexador: 'CDI', pct: 0.3, valor: 111 }, { indexador: 'x', pct: 'lixo' }] });
  assert.deepEqual(papel.papel.porIndexador.map((i) => [i.indexador, i.pct, i.valor]), [['IPCA', 0.7, 700], ['CDI', 0.3, 111]]);
  assert.equal(papel.papel.manual, true);
});

test('Patrimônio (aviso): fato relevante depois do informe usado - some com conferidoEm ou se for anterior', () => {
  const r = resposta({ fatoRelevante: { data: '2026-09-18', assunto: 'Aquisição', link: 'https://fnet.exemplo/doc' } });
  assert.deepEqual(avisoFatoRelevante(r, null), { data: '2026-09-18', assunto: 'Aquisição', link: 'https://fnet.exemplo/doc' });
  assert.equal(avisoFatoRelevante(r, { conferidoEm: '2026-09-20' }), null, 'já conferido');
  assert.notEqual(avisoFatoRelevante(r, { conferidoEm: '2026-09-10' }), null, 'saiu outro depois da conferência');
  assert.equal(avisoFatoRelevante(resposta({ fatoRelevante: { data: '2026-08-01', assunto: '' } }), null), null, 'anterior à entrega do informe: já está refletido');
  assert.equal(avisoFatoRelevante(resposta(), null), null);
});

test('Patrimônio (mapa no navegador): consultas do endereço pra cidade; resposta do Nominatim fora do Brasil ou de outro estado é descartada', () => {
  assert.deepEqual(consultasNavegador(IMOVEIS[0]), [
    { q: 'Av. Brasil, 100, Campinas - SP', p: 'endereço' }, { q: 'Shopping Alfa, Campinas - SP', p: 'nome' }, { q: 'Campinas, SP', p: 'cidade' },
  ]);
  assert.deepEqual(consultasNavegador({ nome: 'Curitiba', endereco: 'Av. Brasil, 2511', cidade: '', uf: '' }), [{ q: 'Av. Brasil, 2511, Curitiba', p: 'nome' }]);
  assert.deepEqual(consultasNavegador({ nome: 'LOJA ATACADÃO 12', endereco: 'Av. Brasil, 25', cidade: '', uf: '' }), [], 'sem cidade/UF nada é chutado');
  const ok = [{ lat: '-22.9', lon: '-47.06', address: { 'ISO3166-2-lvl4': 'BR-SP', city: 'Campinas' } }];
  assert.deepEqual(lerRespostaNominatim(ok, 'SP'), { lat: -22.9, lon: -47.06, u: 'SP', c: 'Campinas' });
  assert.equal(lerRespostaNominatim(ok, 'RJ'), null);
  assert.equal(lerRespostaNominatim([{ lat: '48.8', lon: '2.3' }]), null);
  assert.equal(lerRespostaNominatim([]), null);
});

test('Patrimônio (HTML): tijolo mostra composição, divisão, mapa e cards; texto escapado; só https nos links', () => {
  const visao = montarVisao(resposta({ fatoRelevante: { data: '2026-09-18', assunto: 'Aquisição', link: 'https://fnet.exemplo/doc' }, linkFnet: 'https://fnet.exemplo/x' }), { links: [{ rotulo: 'Site', url: 'https://gestora.exemplo' }] });
  const html = patrimonioHtml({ fase: 'ok', visao, por: 'imovel', base: null, expandido: false });
  const doc = new JSDOM(html).window.document;
  const t = txt(doc.body);
  assert.match(t, /Tijolo/); assert.match(t, /Shoppings/); assert.match(t, /Informe de 30\/06\/2026/);
  assert.match(t, /Fato relevante novo - conferir/); assert.match(t, /18\/09\/2026 \(Aquisição\)/);
  assert.match(t, /Onde o fundo está investido/); assert.match(t, /Imóveis 87,0%/);
  assert.ok(!/Outros ativos/.test(t), 'fatia minúscula não vira linha');
  assert.match(t, /Divisão dos imóveis/); assert.match(t, /Shopping Alfa 60,0%/);
  assert.equal(doc.querySelectorAll('.pf-imovel').length, 3);
  assert.ok(doc.getElementById('pfMapa'), 'contêiner do mapa');
  assert.equal(doc.getElementById('pfMapa').hidden, false, 'há 1 ponto');
  assert.match(t, /1 de 3 imóveis no mapa/);
  assert.equal(doc.querySelectorAll('[data-pf-ver]').length, 1, 'só quem tem ponto tem "Ver no mapa"');
  assert.match(t, /Sem posição no mapa/);
  assert.ok(!doc.querySelector('.pf-lista b'), 'HTML do nome não entra');
  assert.match(t, /Galpão <b>Gama<\/b>/);
  assert.match(t, /Fonte: CVM informe trimestral 2026-06-30/); assert.match(t, /atualizado em 05\/10\/2026/);
  assert.equal(doc.querySelector('.pf-rodape a[href="https://fnet.exemplo/x"]').textContent, 'Ver no FNet');
  assert.ok(doc.querySelector('.pf-rodape a[href="https://gestora.exemplo"]'));
  assert.ok([...doc.querySelectorAll('a')].every((a) => a.getAttribute('href') === '#' || /^https:/.test(a.getAttribute('href'))), 'todo link externo é https');
});

test('Patrimônio (HTML): papel mostra indexador em % e R$, "Não identificado", principais papéis e cotas; mobile vira cartões (data-rot)', () => {
  const html = patrimonioHtml({ fase: 'ok', visao: montarVisao(respostaPapel(), null), por: 'imovel', base: null, expandido: false });
  const doc = new JSDOM(html).window.document;
  const t = txt(doc.body);
  assert.match(t, /Papel/); assert.match(t, /Carteira de papel \(CRI\/CRA\)/);
  assert.match(t, /IPCA 1 papel 60,0% R\$ 600/); assert.match(t, /CDI 1 papel 30,0%/); assert.match(t, /Não identificado/);
  assert.match(t, /90% do valor ligado ao informe da securitizadora; 10% sem como identificar/);
  assert.match(t, /IPCA IPCA \+ 7,0% a\.a\./); assert.match(t, /24A0000001 · 80ª emissão · série 1/);
  assert.match(t, /não identificada/);
  assert.match(t, /Cotas de outros FIIs/); assert.match(t, /ZZSH11 FII EXEMPLO SHOPPING/);
  assert.match(t, /Por tipo de ativo/);
  assert.ok(!doc.getElementById('pf-imoveis'), 'sem imóveis, sem bloco de imóveis');
  assert.ok(doc.querySelector('td[data-rot="Valor"]'));
  assert.ok(doc.body.innerHTML.indexOf('ALFA <i>SEC') === -1, 'escapado');
  // ordem: papel antes de imóveis nos fundos de papel
  assert.ok(doc.getElementById('pf-papel').compareDocumentPosition(doc.getElementById('pf-cotas')) & 4);
});

test('Patrimônio (HTML): estados - carregando, vazio, erro e "sem nada na CVM"', () => {
  const d = (e) => new JSDOM(patrimonioHtml(e)).window.document;
  assert.ok(d({ fase: 'carregando' }).querySelector('.skel'));
  assert.match(txt(d({ fase: 'vazio', mensagem: 'Ainda não foi montado.' }).body), /Portfólio ainda não montado Ainda não foi montado\./);
  const erro = d({ fase: 'erro', erro: 'network' });
  assert.match(txt(erro.body), /Não deu pra carregar o patrimônio deste fundo agora \(network\)/);
  assert.ok(erro.getElementById('pfTentar'));
  const vazio = resposta(); vazio.portfolio.imoveis = undefined; vazio.portfolio.composicao = null;
  assert.match(txt(d({ fase: 'ok', visao: montarVisao(vazio, null), por: 'imovel' }).body), /A CVM não trouxe imóveis nem papéis/);
});

// ---------------------------------------------------------------------------
// A aba dentro da tela do ativo (ativo.js)
// ---------------------------------------------------------------------------

function respostaFii() {
  return {
    ok: true, hoje: '2026-03-10', tipo: 'rv', ticker: 'ZZSH11', classe: 'fiis', moeda: 'BRL',
    ativo: { ticker: 'ZZSH11', nome: 'FII Shopping Exemplo', grupo: 'Shoppings', quantidade: 20, precoAtual: 13.5, precoMedio: 11, precoTeto: 15, vies: 'Comprar', totalComprado: 220, totalAtualizado: 270, proventosTotais: 5, variacaoDia: 0.01, dyPercentual: 0.08, dyValor: 1, pvp: 0.9 },
    serie: [{ data: '2026-01-05', cotas: 10, preco: 10, valor: 100, valorBrl: 100 }, { data: '2026-03-09', cotas: 20, preco: 13, valor: 260, valorBrl: 260 }],
    transacoes: [{ data: '2026-01-05', tipo: 'Compra', preco: 10, quantidade: 10, taxa: 0, total: 100, totalBrl: 100, lucro: null }],
    proventos: [], aReceber: [], pagosNaoLancados: [], faixa52: null, indices: [],
  };
}

async function montarTela({ hash = '', portfolio = resposta(), manual = null, leaflet = null, nominatim = null } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="carteiras"><header id="ativoCabecalho"></header><div id="ativoLoading"></div><div id="ativoErro" hidden></div><div id="ativoConteudo" hidden></div></body></html>`,
    { url: `https://exemplo.test/repo/ativo/index.html?ref=ZZSH11${hash}`, pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.sessionStorage = w.sessionStorage; globalThis.localStorage = w.localStorage;
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  const chamadas = { portfolio: [], coords: [], leaflet: 0, manual: 0 };
  const salvos = [];
  await montarPaginaAtivo('tk', {
    doc: w.document,
    getAtivoImpl: async () => structuredClone(respostaFii()),
    getNoticiasImpl: async () => ({ ok: true, noticias: [] }),
    getTesesImpl: async () => ({ ok: true, configurado: false, teses: [], resumos: [] }),
    getIntradiaImpl: async () => ({ ok: true, resultado: {} }),
    getMetasImpl: async () => ({ ok: false }),
    getMacroImpl: async () => ({ ok: false }),
    carregarEstaticosImpl: async () => ({}),
    getFiiPortfolioImpl: async (t, tk) => { chamadas.portfolio.push(tk); return typeof portfolio === 'function' ? portfolio() : structuredClone(portfolio); },
    salvarCoordsImpl: async (t, tk, coords) => { salvos.push([tk, coords]); return { ok: true }; },
    carregarManualPatrimonioImpl: async () => { chamadas.manual += 1; return manual; },
    agora: () => new Date('2026-03-10T15:00:00Z'),
  });
  await new Promise((r) => setTimeout(r, 0));
  return { doc: w.document, w, chamadas, salvos };
}
const espera = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test('ativo FII: aba "Patrimônio" fica antes de "Sobre e IR", só carrega quando abre e guarda o hash; ação (não-FII) não ganha a aba', async () => {
  const { doc, w, chamadas } = await montarTela();
  const rotulos = [...doc.querySelectorAll('#ativoCabecalho .tabs [data-tab]')].map((b) => [b.dataset.tab, txt(b)]);
  assert.deepEqual(rotulos, [['visao', 'Visão geral'], ['extrato', 'Extrato'], ['patrimonio', 'Patrimônio'], ['sobre', 'Sobre e IR']]);
  assert.equal(doc.getElementById('at-aba-patrimonio').hidden, true);
  assert.deepEqual(chamadas.portfolio, [], 'nada buscado até abrir a aba');
  doc.querySelector('#ativoCabecalho .tabs [data-tab="patrimonio"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await espera();
  assert.deepEqual(chamadas.portfolio, ['ZZSH11']);
  assert.equal(doc.getElementById('at-aba-patrimonio').hidden, false);
  assert.equal(w.location.hash, '#patrimonio');
  const t = txt(doc.getElementById('at-aba-patrimonio'));
  assert.match(t, /Patrimônio do fundo/); assert.match(t, /Shopping Alfa/);
  // abrir de novo não busca de novo
  doc.querySelector('#ativoCabecalho .tabs [data-tab="visao"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  doc.querySelector('#ativoCabecalho .tabs [data-tab="patrimonio"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await espera();
  assert.equal(chamadas.portfolio.length, 1);
});

test('ativo FII: endereço #patrimonio abre direto a aba e já carrega; curadoria manual entra por cima; falha mostra "tentar de novo"', async () => {
  const { doc, chamadas } = await montarTela({ hash: '#patrimonio', manual: { fiis: { ZZSH11: { links: [{ rotulo: 'Site do gestor', url: 'https://gestora.exemplo' }], imoveis: { 'Shopping Alfa': { segmento: 'Shopping regional' } } } } } });
  await espera();
  assert.equal(doc.getElementById('at-aba-patrimonio').hidden, false);
  assert.deepEqual(chamadas.portfolio, ['ZZSH11']);
  const t = txt(doc.getElementById('at-aba-patrimonio'));
  assert.match(t, /Shopping regional/); assert.match(t, /Site do gestor/);

  const { doc: doc2 } = await montarTela({ hash: '#patrimonio', portfolio: { ok: false, etapa: 'network', erro: 'sem rede' } });
  await espera();
  assert.match(txt(doc2.getElementById('at-aba-patrimonio')), /Não deu pra carregar o patrimônio deste fundo agora \(sem rede\)/);
  assert.ok(doc2.getElementById('pfTentar'));

  const { doc: doc3 } = await montarTela({ hash: '#patrimonio', portfolio: { ok: true, existe: false, mensagem: 'Ainda não foi montado.' } });
  await espera();
  assert.match(txt(doc3.getElementById('at-aba-patrimonio')), /Portfólio ainda não montado/);
});

test('ativo FII: mapa só quando a aba abre (Leaflet carregado na hora), com 1 marcador por imóvel com ponto; sem Leaflet a lista segue', async () => {
  const marcadores = [];
  const L = {
    map: () => { const m = { setView: () => m, on: () => m, fitBounds: () => m, invalidateSize() {}, remove() {}, getZoom: () => 4, scrollWheelZoom: { enable() {} } }; return m; },
    tileLayer: (url, op) => { L.tile = { url, op }; return { addTo: () => null }; },
    layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
    circleMarker: (pos) => { const m = { pos, bindPopup: (h) => { m.html = h; return m; }, addTo: () => { marcadores.push(m); return m; } }; return m; },
    latLngBounds: (p) => p,
  };
  const dom = new JSDOM('<!doctype html><html><body><div class="at-aba"><div id="x"></div></div></body></html>', { pretendToBeVisual: true });
  const { criarControladorPatrimonio } = await import('../assets/js/pages/ativo-patrimonio.js');
  let carregouLeaflet = 0;
  const c = criarControladorPatrimonio({
    doc: dom.window.document, token: 'tk', ticker: 'ZZSH11',
    getFiiPortfolioImpl: async () => resposta({ faltamCoordenadas: false }),
    carregarLeafletImpl: async () => { carregouLeaflet += 1; return L; },
    fetchImpl: null, storage: null,
  });
  c.desenhar(dom.window.document.getElementById('x'));
  assert.equal(carregouLeaflet, 0, 'nada até a aba abrir');
  await c.mostrar();
  await espera();
  assert.equal(carregouLeaflet, 1);
  assert.equal(marcadores.length, 1, 'só o imóvel com ponto');
  assert.match(marcadores[0].html, /<strong>Shopping Alfa<\/strong>/);
  assert.equal(L.tile.url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.match(L.tile.op.attribution, /OpenStreetMap/, 'atribuição do OSM');

  const dom2 = new JSDOM('<!doctype html><html><body><div class="at-aba"><div id="x"></div></div></body></html>', { pretendToBeVisual: true });
  const c2 = criarControladorPatrimonio({ doc: dom2.window.document, token: 'tk', ticker: 'ZZSH11', getFiiPortfolioImpl: async () => resposta(), carregarLeafletImpl: async () => { throw new Error('offline'); }, fetchImpl: null, storage: null });
  c2.desenhar(dom2.window.document.getElementById('x'));
  await c2.mostrar(); await espera();
  assert.match(txt(dom2.window.document.getElementById('pfMapa')), /Mapa indisponível agora/);
  assert.equal(dom2.window.document.querySelectorAll('.pf-imovel').length, 3, 'a lista continua');
});

test('ativo FII: imóvel sem ponto é geocodificado no navegador (1 req/s, cache no aparelho) e as coordenadas voltam pro servidor', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div class="at-aba"><div id="x"></div></div></body></html>', { pretendToBeVisual: true, url: 'https://exemplo.test/' });
  const L = {
    map: () => { const m = { setView: () => m, on: () => m, fitBounds: () => m, invalidateSize() {}, remove() {}, getZoom: () => 4, scrollWheelZoom: { enable() {} } }; return m; },
    tileLayer: () => ({ addTo: () => null }), layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
    circleMarker: () => { const m = { bindPopup: () => m, addTo: () => m }; return m; }, latLngBounds: (p) => p,
  };
  const { criarControladorPatrimonio } = await import('../assets/js/pages/ativo-patrimonio.js');
  const urls = [], esperas = [], salvos = [];
  const fetchImpl = async (url) => {
    urls.push(decodeURIComponent(url.replace(/^.*[?&]q=/, '')));
    const q = urls[urls.length - 1];
    const lista = /Rua das Flores, 200, Curitiba - PR/.test(q) ? [{ lat: '-25.43', lon: '-49.27', address: { 'ISO3166-2-lvl4': 'BR-PR', city: 'Curitiba' } }] : [];
    return { ok: true, json: async () => lista };
  };
  const storage = dom.window.localStorage;
  const c = criarControladorPatrimonio({
    doc: dom.window.document, token: 'tk', ticker: 'ZZSH11',
    getFiiPortfolioImpl: async () => resposta(), carregarLeafletImpl: async () => L,
    salvarCoordsImpl: async (t, tk, coords) => { salvos.push([tk, coords]); return { ok: true }; },
    fetchImpl, storage, esperar: async (ms) => { esperas.push(ms); },
  });
  c.desenhar(dom.window.document.getElementById('x'));
  await c.mostrar();
  await espera(60);
  assert.ok(urls.includes('Rua das Flores, 200, Curitiba - PR'), 'pede só o que falta (o Alfa já tem ponto)');
  assert.ok(!urls.some((q) => /Brasil, 100|Campinas/.test(q)));
  assert.ok(esperas.length >= urls.length - 1 && esperas.every((ms) => ms >= 1000), 'espera ≥ 1 s entre consultas');
  assert.equal(salvos.length, 1);
  assert.deepEqual(salvos[0][1], [{ k: 'k2', lat: -25.43, lon: -49.27, p: 'endereço', u: 'PR', c: 'Curitiba' }]);
  const guardado = JSON.parse(storage.getItem('fiiportfolio_geo_v1'));
  assert.equal(guardado.k2.lat, -25.43);
  assert.equal(guardado.k3.falhou, true, 'o que não achou também fica guardado (não repete)');
  assert.equal(dom.window.document.querySelectorAll('[data-pf-ver]').length, 2, 'agora 2 imóveis com ponto');
});
