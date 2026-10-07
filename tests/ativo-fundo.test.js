// tests/ativo-fundo.test.js - 07/10/2026 (Tiago: fundo DI guardado pra comprar a chácara). Detalhe de um título de Renda Fixa que é FUNDO,
// montado num DOM de verdade (JSDOM): "Sobre o fundo" (ficha pública de assets/data/fundos.json), "Rentabilidade mensal", o cartão
// "Cota do fundo" (cota real x estimativa + informar uma cota) e o logo. Posição inventada (cotas e valores).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const FUNDOS = JSON.parse(fs.readFileSync(new URL('../assets/data/fundos.json', import.meta.url), 'utf8'));
const NOME = 'Trend DI FC RF Simples RL';
const REF = `rf:${NOME}|CORRETORA X`;

function montarDom(ref = REF, hash = '') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="carteiras">
    <header id="ativoCabecalho"></header>
    <div id="ativoLoading"></div><div id="ativoErro" hidden></div><div id="ativoConteudo" hidden></div></body></html>`,
  { url: `https://exemplo.test/repo/ativo/index.html?ref=${encodeURIComponent(ref)}${hash}`, pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.localStorage = w.localStorage;
  return { dom, doc: w.document, w };
}
const txt = (el) => {
  const partes = [];
  const tw = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};

function respostaFundo({ cotaInformada = null, totalAtualizado = 410, nome = NOME } = {}) {
  return {
    ok: true, hoje: '2026-10-07', tipo: 'rf', ticker: nome, classe: 'rendaFixa', moeda: 'BRL',
    ativo: { nomePersonalizado: nome, tipoInvestimento: 'Fundo de Investimento', indexador: 'CDI', instituicao: 'CORRETORA X', tipoCarteira: 'objetivo',
      quantidade: 250, totalInvestido: 400, totalAtualizado, irSeResgatasseHoje: { impostoSeResgatasseHoje: 1.5, valorLiquidoSeResgatasseHoje: 408.5 } },
    serie: [{ data: '2026-09-01', valor: 400 }, { data: '2026-10-06', valor: 408 }, { data: '2026-10-07', valor: 409 }],
    transacoes: [
      { data: '2026-09-01', tipo: 'Compra', entradaSaida: 'Credito', quantidade: 150, preco: 1.6, total: 240 },
      { data: '2026-09-15', tipo: 'Compra', entradaSaida: 'Credito', quantidade: 100, preco: 1.6, total: 160 },
    ],
    fundo: { cotaInformada, cdiMensal: { '2026-09': 1.1, '2026-08': 1.0, '2025-12': 1.1 } },
    proventos: [], aReceber: [], pagosNaoLancados: [], indices: [{ data: '2026-09-01', cdi: 100, ipca: 50, patrimonio: 1000 }],
  };
}

async function montar({ resposta = respostaFundo(), ref = REF, fundos = FUNDOS, definirCota = null, redesenhos = null } = {}) {
  const { dom, doc, w } = montarDom(ref);
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  const chamadas = { ativo: 0, cota: [] };
  await montarPaginaAtivo('tk', {
    doc,
    getAtivoImpl: async () => { chamadas.ativo += 1; return structuredClone(typeof redesenhos === 'function' ? redesenhos(chamadas.ativo) : resposta); },
    getNoticiasImpl: async () => ({ ok: true, noticias: [] }),
    getTesesImpl: async () => ({ ok: true, configurado: false, teses: [], resumos: [] }),
    getIntradiaImpl: async () => ({ ok: true, resultado: {} }),
    getMetasImpl: async () => ({ ok: false }),
    getMacroImpl: async () => ({ ok: false }),
    carregarEstaticosImpl: async () => ({}),
    carregarFundosImpl: async () => fundos,
    definirCotaImpl: definirCota || (async (t, d) => { chamadas.cota.push(d); return { ok: true }; }),
    agora: () => new Date('2026-10-07T15:00:00Z'),
  });
  await new Promise((r) => setTimeout(r, 0));
  return { dom, doc, w, chamadas };
}

test('fundo: "Sobre o fundo" com a ficha pública (gestora, administrador, CNPJ, liquidez, taxas, tributação com o come-cotas, objetivo) e o logo', async () => {
  const { doc } = await montar();
  const sobre = doc.getElementById('at-sobre-fundo');
  assert.ok(sobre, 'seção Sobre o fundo');
  assert.equal(sobre.tagName, 'DETAILS', 'recolhível (celular)');
  const t = txt(sobre);
  assert.match(t, /TREND DI FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO RENDA FIXA SIMPLES/);
  assert.match(t, /Referenciado DI Soberano/);
  assert.match(t, /CVM: Renda Fixa/);
  assert.match(t, /Benchmark CDI/);
  assert.match(t, /CNPJ 45\.278\.833\/0001-57/);
  assert.match(t, /Gestora XP Vista Asset Management LTDA/);
  assert.match(t, /Administrador Modal DTVM/);
  assert.match(t, /Custodiante Modal DTVM/);
  assert.match(t, /Auditor PwC/);
  assert.match(t, /Distribuidor XP Investimentos CCTVM S\.A\./);
  assert.match(t, /Início 13\/09\/2022/);
  assert.match(t, /Aplicação mínima R\$\s*100,00/);
  assert.match(t, /Cota de aplicação D\+0/);
  assert.match(t, /Cota de resgate D\+0/);
  assert.match(t, /Liquidação do resgate D\+0 \(dia útil\)/);
  assert.match(t, /Taxa de administração 0,00% a\.a\. \(máxima 0,02%\)/);
  assert.match(t, /Taxa de performance Não tem/);
  assert.match(t, /Taxa de saída Não tem/);
  assert.match(t, /Tributação: longo prazo\. Come-cotas semestral \(maio e novembro\)/);
  assert.match(t, /22,5% até 180 dias/);
  assert.match(t, /Aplicar no mínimo 95% em cotas do TREND PÓS-FIXADO MASTER FI RF SIMPLES/);
  assert.match(t, /Patrimônio líquido R\$\s*4,48 bi \(set\/2026\)/);
  assert.match(t, /XP Serviços Financeiros DTVM LTDA.*23\/08\/2022.*vale a lâmina/, 'a divergência do app da corretora é dita');
  assert.match(sobre.querySelector('.logo-circulo img').getAttribute('src'), /assets\/imgs\/fundos\/TrendDIFCRFSimplesRL\.png$/);
  // o hero também ganha o logo e a classificação
  assert.match(doc.querySelector('.at-hero .logo-circulo img').getAttribute('src'), /TrendDIFCRFSimplesRL\.png$/);
  assert.match(txt(doc.querySelector('.at-hero')), /Referenciado DI Soberano/);
  // a aba "Sobre" tem o nome do fundo
  assert.match(txt(doc.querySelector('#ativoCabecalho')), /Sobre o fundo e IR/);
  assert.ok(doc.getElementById('at-aba-sobre').contains(sobre));
});

test('fundo: tabela "Rentabilidade mensal" (anos x meses, no ano, acumulada, % do CDI com a série do site) recolhível', async () => {
  const { doc } = await montar();
  const card = doc.getElementById('at-rent-fundo');
  assert.ok(card);
  assert.equal(card.tagName, 'DETAILS', 'recolhível (no celular as seções começam fechadas: aplicarEstadoSecoes)');
  assert.equal(card.dataset.secao, 'rent-fundo');
  const linhas = [...card.querySelectorAll('tbody tr')];
  assert.deepEqual(linhas.map((l) => l.querySelector('th').textContent.replace(/\s+/g, ' ').trim().split(' ')[0]), ['2026', '2025', '2024', '2023', '2022']);
  const a26 = txt(linhas[0]);
  assert.match(a26, /até set/);
  assert.match(a26, /1,18/);
  assert.match(a26, /10,54/);
  assert.match(a26, /65,02/);
  const cab = txt(card.querySelector('thead'));
  assert.match(cab, /Ano jan fev mar abr mai jun jul ago set out nov dez No ano Acumulada % do CDI/);
  // CDI do site (cdiMensal da resposta): setembro 1,04 / 1,10 = 95% do mês
  const set26 = linhas[0].querySelector('td[data-r="set"]');
  assert.match(txt(set26), /1,04\s*95%/);
  assert.match(txt(linhas[3]), /13,13/);
  assert.equal(linhas[4].querySelector('td[data-r="% do CDI"]').textContent.trim(), '—', 'ano de início sem comparação');
});

test('fundo: cartão "Cota do fundo" - valor pela última cota conhecida x estimativa do site e a diferença', async () => {
  const { doc } = await montar();
  const card = doc.getElementById('at-cota-fundo');
  assert.ok(card, 'cartão da cota');
  const t = txt(card);
  assert.match(t, /Última cota conhecida R\$\s*1,65430189/);
  assert.match(t, /de 07\/10\/2026 · lâmina \/ app da corretora/);
  assert.match(t, /Suas cotas 250,00000000/);
  // 250 x 1,65430189 = 413,5754725 -> 413,58
  assert.match(t, /Valor pela cota R\$\s*413,58/);
  assert.match(t, /Estimativa do site R\$\s*409,00/);
  assert.match(t, /100% do CDI desde cada compra, em 07\/10\/2026/);
  assert.match(t, /Diferença \+R\$\s*4,58 \(\+1,12%\)/);
  assert.doesNotMatch(t, /Valor do título no site/, 'sem cota informada o valor do título é a estimativa: não repete');
  assert.ok(card.querySelector('form[data-cota-fundo] input[name="cota"]'));
  assert.equal(card.querySelector('input[name="data"]').getAttribute('max'), '2026-10-07');
});

test('fundo: com cota informada mais nova, ela vale (informada por você) e o valor do título aparece pela cota corrigida pelo CDI', async () => {
  const { doc } = await montar({ resposta: respostaFundo({ cotaInformada: { cota: 1.7, data: '2026-10-07' }, totalAtualizado: 425 }) });
  const t = txt(doc.getElementById('at-cota-fundo'));
  assert.match(t, /Última cota conhecida R\$\s*1,70000000/);
  assert.match(t, /informada por você/);
  assert.match(t, /Valor pela cota R\$\s*425,00/);
  assert.match(t, /Valor do título no site R\$\s*425,00 cotas × cota informada, corrigida pelo CDI desde 07\/10\/2026/);
  // uma informada mais velha que a pública não vale
  const velha = await montar({ resposta: respostaFundo({ cotaInformada: { cota: 1.5, data: '2026-09-01' } }) });
  assert.match(txt(velha.doc.getElementById('at-cota-fundo')), /Última cota conhecida R\$\s*1,65430189/);
});

test('fundo: informar uma cota - valida, manda título + cota + data, e a tela recarrega com o dado novo', async () => {
  let chamadasAtivo = 0;
  const salvas = [];
  const { doc, w, chamadas } = await montar({
    redesenhos: () => { chamadasAtivo += 1; return chamadasAtivo === 1 ? respostaFundo() : respostaFundo({ cotaInformada: { cota: 1.7, data: '2026-10-07' }, totalAtualizado: 425 }); },
    definirCota: async (t, d) => { salvas.push({ t, ...d }); return { ok: true }; },
  });
  const form = doc.querySelector('form[data-cota-fundo]');
  const enviar = () => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const msg = () => form.querySelector('[data-cota-msg]');
  // cota vazia/inválida: não pede nada
  enviar(); await new Promise((r) => setTimeout(r, 0));
  assert.match(msg().textContent, /Informe a cota em reais/);
  form.elements.cota.value = 'abc'; enviar(); await new Promise((r) => setTimeout(r, 0));
  assert.match(msg().textContent, /Informe a cota em reais/);
  // data no futuro
  form.elements.cota.value = '1,70'; form.elements.data.value = '2026-12-31'; enviar(); await new Promise((r) => setTimeout(r, 0));
  assert.match(msg().textContent, /Informe a data da cota/);
  assert.deepEqual(salvas, []);
  // ok
  form.elements.data.value = '2026-10-07'; enviar();
  for (let i = 0; i < 20 && salvas.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(salvas, [{ t: 'tk', titulo: NOME, cota: '1,70', data: '2026-10-07' }]);
  for (let i = 0; i < 40 && chamadasAtivo < 2; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(chamadasAtivo >= 2, true, 'recarregou a tela depois de salvar');
  await new Promise((r) => setTimeout(r, 20));
  assert.match(txt(doc.getElementById('at-cota-fundo')), /Valor pela cota R\$\s*425,00/);
  void chamadas;
});

test('fundo: se o Apps Script recusar a cota, a mensagem aparece e o botão volta', async () => {
  const { doc, w } = await montar({ definirCota: async () => ({ ok: false, erro: 'já existe uma cota mais recente (07/10/2026)' }) });
  const form = doc.querySelector('form[data-cota-fundo]');
  form.elements.cota.value = '1,60'; form.elements.data.value = '2026-10-01';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 20 && !/Não consegui/.test(form.querySelector('[data-cota-msg]').textContent); i++) await new Promise((r) => setTimeout(r, 5));
  assert.match(form.querySelector('[data-cota-msg]').textContent, /Não consegui salvar: já existe uma cota mais recente/);
  assert.equal(form.querySelector('button').disabled, false);
});

test('fundo sem o fundos.json (falha de rede): a ficha pública some mas a cota e o resto da tela funcionam; título comum não ganha nada', async () => {
  const sem = await montar({ fundos: null });
  assert.equal(sem.doc.getElementById('at-sobre-fundo'), null);
  assert.equal(sem.doc.getElementById('at-rent-fundo'), null);
  assert.ok(sem.doc.getElementById('at-cota-fundo'), 'o Apps Script marcou como fundo: a cota continua');
  assert.match(txt(sem.doc.querySelector('#ativoCabecalho')), /Imposto de renda/);
  const tesouro = {
    ok: true, hoje: '2026-10-07', tipo: 'rf', ticker: 'Tesouro Teste 2030', classe: 'rendaFixa', moeda: 'BRL',
    ativo: { nomePersonalizado: 'Tesouro Teste 2030', tipoInvestimento: 'Tesouro Selic', indexador: 'SELIC', instituicao: 'CORRETORA X', tipoCarteira: 'emergencial', quantidade: 1, totalInvestido: 200, totalAtualizado: 210 },
    fundo: null, serie: [{ data: '2026-10-01', valor: 205 }], transacoes: [{ data: '2026-10-01', tipo: 'Compra', entradaSaida: 'Credito', quantidade: 1, total: 200 }],
    proventos: [], aReceber: [], pagosNaoLancados: [], indices: [],
  };
  const comum = await montar({ resposta: tesouro, ref: 'rf:Tesouro Teste 2030|CORRETORA X' });
  ['at-sobre-fundo', 'at-rent-fundo', 'at-cota-fundo'].forEach((id) => assert.equal(comum.doc.getElementById(id), null, id));
  assert.equal(comum.doc.querySelector('.at-hero .logo-circulo img') === null || !/fundos\//.test(comum.doc.querySelector('.at-hero .logo-circulo img').getAttribute('src')), true);
});

test('fundo: o seletor "Destino deste título" aparece com "Reservado para objetivos" e usa o nome e a instituição do título', async () => {
  const { doc } = await montar();
  const sel = doc.getElementById('atDestinoRf');
  assert.ok(sel);
  assert.equal(sel.value, 'objetivo');
  assert.equal(sel.dataset.titulo, NOME);
  assert.equal(sel.dataset.instituicao, 'CORRETORA X');
  assert.ok([...sel.options].some((o) => /Reservado para objetivos/.test(o.textContent) && o.selected));
});

test('logo do fundo nas listas: Carteiras › Renda Fixa, Aportes/Lançamentos (nome em tipoInvestimento) e Meus ativos da Início (com o nome do fundo como título)', async () => {
  const { logoCirculoRendaFixaHtml, logoRendaFixaHtml } = await import('../assets/js/pages/carteiras-pecas.js');
  const fundo = { nomePersonalizado: NOME, tipoInvestimento: 'Fundo de Investimento', indexador: 'CDI', instituicao: 'Rico' };
  assert.match(logoCirculoRendaFixaHtml(fundo), /<img src="[^"]*assets\/imgs\/fundos\/TrendDIFCRFSimplesRL\.png"/);
  assert.match(logoRendaFixaHtml({ indexador: '', tipoInvestimento: NOME, instituicao: 'Rico' }), /fundos\/TrendDIFCRFSimplesRL\.png/);
  // os outros títulos mantêm as regras de antes (Selic, IPCA, banco)
  assert.match(logoRendaFixaHtml({ indexador: 'SELIC', tipoInvestimento: 'Tesouro Selic 2029' }), /tesouro-selic\.webp/);
  assert.doesNotMatch(logoRendaFixaHtml({ indexador: 'CDI', tipoInvestimento: 'CDB X', instituicao: 'Outro' }), /<img/);
  // Início › Meus ativos: o cartão do fundo mostra o NOME (o tipo é genérico) e o logo
  const { dom, doc } = montarDom();
  const { renderListaAtivos } = await import('../assets/js/pages/inicio-painel.js');
  const lista = doc.createElement('div');
  doc.body.appendChild(lista);
  renderListaAtivos(doc, lista, [
    { classe: 'rf', ticker: NOME, nome: NOME, tipoInvestimento: 'Fundo de Investimento', indexador: 'CDI', instituicao: 'Rico', marca: 'objetivo', valorAtualizado: 410 },
    { classe: 'rf', ticker: 'Tesouro Selic (LFT) · 03/2029', nome: 'Tesouro Selic 2029', tipoInvestimento: 'Tesouro Selic (LFT)', indexador: 'SELIC', instituicao: 'XP', marca: 'emergencial', valorAtualizado: 500, vencimento: '03/2029' },
  ]);
  const itens = [...lista.querySelectorAll('.al-item')];
  assert.equal(itens.length, 2);
  assert.equal(txt(itens[0].querySelector('.al-ticker')), NOME);
  assert.match(itens[0].querySelector('.logo-circulo img').getAttribute('src'), /TrendDIFCRFSimplesRL\.png$/);
  assert.match(txt(itens[1].querySelector('.al-ticker')), /^Tesouro Selic \(LFT\)/, 'o Tesouro continua com o tipo como título');
  dom.window.close();
});
