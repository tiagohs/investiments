// tests/organizacao-abas.test.js
//
// 03/10/2026: reorganização da Organização Financeira (Tiago: "Reorganizar
// conteúdo das três abas atuais e renomear ... eu tenho que saber quais
// documentos preciso enviar mensalmente ou de vez em quando, e o que dá pra
// ser automatizado"): a página inteira (organizacao/despesas.html) montada
// num DOM de verdade - abas Patrimônio | Gastos e Despesas | Renda e
// Orçamentos, endereços antigos, peças movidas, respostas compartilhadas e o
// painel Documentos. Tudo inventado (o repositório é público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'organizacao', 'despesas.html'), 'utf8');
const MAIN = HTML.slice(HTML.indexOf('<main'), HTML.indexOf('</main>') + 7);
const clone = (o) => JSON.parse(JSON.stringify(o));

const DESPESAS = {
  ok: true,
  despesas: { folga: 0.1, itens: [{ linha: 7, nome: 'Aluguel Teste', valor: 1000, comFolga: 1100, categoria: 'Moradia', frequencia: 'Mensal' }, { linha: 8, nome: 'Mercado Teste', valor: 500, comFolga: 550, categoria: 'Alimentação', frequencia: 'Mensal' }], totalReal: 1500, totalComFolga: 1650, linhaTotal: 9 },
  reserva: { mediaGastos: 1650, meses: 6, base: 9900, sobra: 0.1, meta: 10890, atual: 9000 },
  salario: { liquido: 5000, percentualInvestir: 0.2, aporte: 1000 },
  patrimonio: { extra: 1000, reinvestimento: 0.25, rendimento: 0.06, desejado: 690000, atual: 50000, rendaDesejada: 3450 },
  historico: [], assinatura: 'ass-1',
};

const PATRIMONIO = {
  ok: true, hoje: '2025-09-15', pastaIrConfigurada: false, atualizado: { carreira: '2025-01-10T12:00:00Z' },
  config: {
    imovel: { nome: 'Apê teste', cidade: 'Cidade X', valorCompra: 300000, dataCompra: '2023-06', entrada: 60000, metodo: 'media' },
    financiamento: { banco: 'Banco Z', sistema: 'SAC', saldo: 230000, dataSaldo: '2024-06-20', taxaAnual: 0.09, amortizacao: 700, seguroTaxas: 80, parcela: 2500, dataInicio: '2023-06', valorFinanciado: 240000 },
    carreira: { contratos: [{ empregador: 'EMPRESA TESTE', inicio: '2020-01-01', salarios: [{ data: '2020-01-01', valor: 5000 }, { data: '2024-01-01', valor: 6500 }] }] },
    ir: { anos: [{ exercicio: 2025, ano: 2024, bens: 30000, dividas: 0, grupos: {}, tributaveis: 80000, contasBancarias: [{ banco: '260', bancoNome: 'Banco Teste', agencia: '0001', conta: '123-4', tipo: 'corrente', saldoAtual: 1000 }], rendimentosPj: [] }] },
  },
  investimentos: { total: 120000, longoPrazo: 100000, reserva: 20000, porClasse: { acoes: 40000, fiis: 30000, acoesEua: 10000, rendaFixa: 40000, rendaFixaLongoPrazo: 20000 } },
  historicoMensal: [
    { mes: '2024-09', patrimonio: 90000, aporte: 1500, aporteLongoPrazo: 1500, indiceCdi: 100, indiceIpca: 100 },
    { mes: '2024-12', patrimonio: 95000, aporte: 1500, aporteLongoPrazo: 1500, indiceCdi: 103, indiceIpca: 101 },
    { mes: '2025-08', patrimonio: 118000, aporte: 2000, aporteLongoPrazo: 2000, indiceCdi: 110, indiceIpca: 104 },
    { mes: '2025-09', patrimonio: 120000, aporte: 500, aporteLongoPrazo: 500, indiceCdi: 111, indiceIpca: 104.5 },
  ],
  despesas: { folga: 0.1, totalReal: 6000, totalComFolga: 6600, itens: [{ nome: 'Parcela do apê', valor: 2500 }, { nome: 'Mercado', valor: 3500 }] },
  metas: { extra: 1000, reinvestimento: 0.2, rendimento: 0.06, desejado: 1500000, rendaDesejada: 9120, aporteMeta: 2500, reservaMeta: 30000 },
  proventos12m: 2400, cdi: 0.12,
  indices: { cidade: 'Cidade X', fipezap: [['2023-06', 100], ['2025-08', 110]], ivgr: [['2023-06', 50], ['2025-06', 54]] },
};

const SALARIO = {
  ok: true, hoje: '2025-09-15',
  base: { liquido: 7000, percentualInvestir: 0.25, aporteMeta: 1750 },
  patrimonio: { atual: 100000, desejado: 1000000, rendimento: 0.06 },
  despesas: { totalReal: 5000, totalComFolga: 5500 },
  pagamentos: [{ mes: '2025-06', tipo: 'Mensal', status: 'Recebido', dataCredito: '2025-07-05', salarioBase: 6500, totalVencimentos: 6500, inss: 700, irrf: 600, liquido: 5200 }],
  mensal: [{ mes: '2025-06', total: 1500, longoPrazo: 1500, proventos: 100 }, { mes: '2025-07', total: 1800, longoPrazo: 1700, proventos: 120 }, { mes: '2025-08', total: 900, longoPrazo: 900, proventos: 90 }, { mes: '2025-09', total: 200, longoPrazo: 200, proventos: 10, parcial: true }],
};

function gastosApi(chamadas) {
  return {
    getGastos: async () => { chamadas.gastos += 1; return { ok: true, lancamentos: [{ mes: '2025-07', data: '2025-07-03', origem: 'cartao', fonte: 'nubank-cartao', descricao: 'MERCADO TESTE', valor: 300, tipo: 'compra', arquivo: 'a1' }], arquivos: [{ id: 'a1', nome: 'fatura.pdf', caminho: 'Cartão de Crédito', fonte: 'nubank-cartao', meses: ['2025-07'] }], regras: [] }; },
    getArquivosGastos: async () => { chamadas.drive += 1; return { ok: true, configurado: true, arquivos: [{ id: 'n1', nome: '09.pdf', caminho: 'Cartão de Crédito/Nubank/2025', banco: 'Nubank', importado: false }] }; },
    getArquivoGastos: async () => ({ ok: false, erro: 'teste' }),
    salvarImportacaoGastos: async () => ({ ok: true, gravados: 0 }),
    salvarRegraGastos: async () => ({ ok: true }),
    excluirArquivoGastos: async () => ({ ok: true }),
  };
}

const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

async function montar(hash = '', extra = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="organizacao">${MAIN}</body></html>`, { url: `https://exemplo.test/organizacao/despesas.html${hash}`, pretendToBeVisual: true });
  const w = dom.window;
  globalThis.localStorage = w.localStorage;
  w.localStorage.clear();
  w.fetch = async () => { throw new Error('sem rede no teste'); };
  const doc = w.document;
  const chamadas = { patrimonio: 0, salario: 0, gastos: 0, drive: 0 };
  const { montarPaginaOrganizacao } = await import('../assets/js/pages/organizacao.js');
  const pagina = await montarPaginaOrganizacao('tk', {
    doc, refresh: false, hoje: '2025-09-15',
    getDespesasImpl: async () => clone(DESPESAS),
    salvarDespesasImpl: async () => ({ ok: false }),
    patrimonioOpcoes: { getPatrimonioImpl: async () => { chamadas.patrimonio += 1; return clone(PATRIMONIO); }, salvarImpl: async () => ({ ok: true }), carregarPdf: async () => ({}), lerPdf: async () => ['um pdf qualquer'], atrasoPrefsMs: 0 },
    salarioOpcoes: { getSalarioImpl: async () => { chamadas.salario += 1; return clone(SALARIO); }, carregarPdf: async () => ({}), lerPdf: async () => [] },
    gastosOpcoes: { api: gastosApi(chamadas), storage: null },
    rendaOpcoes: { buscarIpca: false, storage: null },
    simuladorOpcoes: { storage: null },
    documentosOpcoes: { storage: null },
    ...extra,
  });
  await esperar(20);
  return { dom, w, doc, pagina, chamadas };
}

test('Abas: Patrimônio | Gastos e Despesas | Renda e Orçamentos - Patrimônio abre primeiro; títulos novos', async () => {
  const { doc, pagina } = await montar();
  const abas = [...doc.querySelectorAll('#ogAbas [data-aba]')];
  assert.deepEqual(abas.map((b) => b.dataset.aba), ['patrimonio', 'despesas', 'renda']);
  assert.deepEqual(abas.map((b) => txt(b.querySelector('.og-aba-longo') || b)), ['Patrimônio', 'Gastos e Despesas', 'Renda e Orçamentos']);
  assert.equal(pagina.abaAtual, 'patrimonio');
  assert.equal(doc.getElementById('painelPatrimonio').hidden, false);
  assert.equal(doc.getElementById('painelDespesas').hidden, true);
  assert.match(txt(doc.getElementById('ptHero')), /Patrimônio líquido hoje/);
});

test('Endereços antigos continuam: #salario abre Renda e Orçamentos, #despesas e #gastos abrem Gastos e Despesas, #simulador também', async () => {
  for (const [hash, aba] of [['#salario', 'renda'], ['#renda', 'renda'], ['#despesas', 'despesas'], ['#gastos', 'despesas'], ['#simulador', 'despesas'], ['#patrimonio', 'patrimonio']]) {
    const { pagina, w } = await montar(hash);
    assert.equal(pagina.abaAtual, aba, hash);
    assert.equal(w.location.hash, aba === 'patrimonio' ? '' : `#${aba}`, `${hash} vira o endereço novo`);
  }
});

test('Gastos e Despesas: despesas essenciais "para a renda de emergência" + link pra Metas, gastos reais e o simulador novo (com o patrimônio compartilhado)', async () => {
  const { doc, w, pagina, chamadas } = await montar('#despesas');
  await esperar(30);
  const lista = doc.querySelector('.og-lista-cab');
  assert.match(txt(lista), /Despesas essenciais para a renda de emergência/);
  assert.match(txt(lista), /despesas que entram na conta da renda emergencial/);
  assert.ok([...doc.querySelectorAll('#organizacaoConteudo a')].some((a) => a.getAttribute('href') === '../metas.html' && /Reserva de emergência/.test(a.textContent)));
  assert.ok(pagina.gastos, 'seção de gastos montada');
  assert.ok(doc.querySelector('#gastosConteudo .gs-conteudo'));
  assert.ok(pagina.simulador, 'simulador montado quando o patrimônio chegou');
  assert.match(txt(doc.getElementById('simulador')), /Amortizar ou investir\?/);
  // ordem: despesas -> gastos -> simulador
  const filhos = [...doc.getElementById('painelDespesas').children].map((x) => x.id);
  assert.ok(filhos.indexOf('organizacaoConteudo') < filhos.indexOf('gastosConteudo') && filhos.indexOf('gastosConteudo') < filhos.indexOf('simulador'));
  // uma resposta só pras abas e o painel Documentos
  clique(w, doc.querySelector('[data-aba="patrimonio"]'));
  clique(w, doc.querySelector('[data-aba="renda"]'));
  await esperar(30);
  assert.equal(chamadas.patrimonio, 1, 'getPatrimonio uma vez só');
  assert.equal(chamadas.salario, 1, 'getSalario uma vez só');
  assert.equal(chamadas.gastos, 1, 'getGastos uma vez só (painel + seção)');
});

test('Renda e Orçamentos: seção Renda (salário pelo IR, crescimento), Carreira e FGTS movidos, orçamento do salário, quanto investe (um só) e contas', async () => {
  const { doc, pagina } = await montar('#renda');
  await esperar(30);
  const ids = [...doc.querySelectorAll('#painelRenda .og-renda > div')].map((x) => x.id);
  assert.deepEqual(ids, ['rendaTopo', 'carreiraFgts', 'salarioConteudo', 'rendaInvestimento', 'rendaContas']);
  assert.ok(doc.querySelector('#rendaTopo #rdHero'));
  assert.ok(doc.querySelector('#rendaTopo #rdSecSalario'));
  assert.match(txt(doc.getElementById('carreiraFgts')), /Carreira e FGTS/);
  assert.ok(doc.querySelector('#carreiraFgts #ptCarreira svg'), 'gráfico da carreira com o patrimônio');
  assert.match(txt(doc.getElementById('salarioConteudo')), /Orçamento do salário/);
  assert.equal(doc.querySelectorAll('#rdSecInv').length, 1, 'um gadget só de "quanto invisto por mês"');
  assert.equal(doc.querySelector('#salarioConteudo #slGrafico'), null);
  assert.ok(doc.querySelector('#rdSoLongo'), '"só longo prazo" veio da antiga aba Salário');
  assert.match(txt(doc.getElementById('rendaContas')), /Banco Teste/);
  assert.equal(doc.querySelector('#painelRenda #rdSecDocs'), null, 'os documentos ficam no painel do topo');
  assert.ok(pagina.carreira && pagina.renda.topo);
});

test('Documentos: barra com o resumo, lista com status calculado e as ações levam pro lugar certo', async () => {
  const { doc, w, pagina } = await montar();
  await esperar(30);
  const painel = doc.getElementById('ogDocumentos');
  assert.match(txt(painel.querySelector('.og-docs-chips')), /em dia/);
  assert.equal(painel.querySelector('.og-docs-lista').hidden, true, 'enxuto: fechado');
  clique(w, painel.querySelector('.og-docs-barra'));
  assert.equal(painel.querySelector('.og-docs-lista').hidden, false);
  const linha = (id) => painel.querySelector(`[data-doc-id="${id}"]`);
  for (const id of ['ir', 'holerite', 'faturas', 'extratos', 'fgts', 'ctps', 'caixa', 'fies', 'b3', 'investimentos', 'informe']) assert.ok(linha(id), id);
  assert.ok(linha('holerite').classList.contains('est-atrasado'), 'último holerite jun/25 e hoje 15/09: atrasado');
  assert.ok(linha('caixa').classList.contains('est-atencao'), 'extrato da Caixa com mais de 1 ano: vale recalibrar');
  assert.ok(linha('fgts').classList.contains('est-falta'), 'FGTS nunca importado');
  assert.ok(linha('faturas').classList.contains('est-atencao'), 'última fatura jul/25 e o mês fechado é ago/25 (1 mês) - e tem novo no Drive');
  assert.match(txt(linha('faturas')), /1 novo no Drive/);
  // ação: holerite -> Renda e Orçamentos
  await pagina.acaoDocumento('holerite', { name: 'h.pdf', arrayBuffer: async () => new ArrayBuffer(4) });
  assert.equal(pagina.abaAtual, 'renda');
  // ação: PDFs -> Patrimônio, conferência
  await pagina.acaoDocumento('pdfs', [{ name: 'x.pdf', arrayBuffer: async () => new ArrayBuffer(4) }]);
  assert.equal(pagina.abaAtual, 'patrimonio');
  assert.match(txt(doc.getElementById('ptPainel')), /Conferir antes de salvar/);
  // ação: faturas -> Gastos e Despesas
  await pagina.acaoDocumento('gastos');
  assert.equal(pagina.abaAtual, 'despesas');
});

test('documentosOrganizacao: faturas por meses importados, opcionais, carregando e o lembrete da B3', async () => {
  const { documentosOrganizacao, documentoGastos, documentoDivida, documentoB3 } = await import('../assets/js/pages/organizacao-documentos.js');
  const g = (meses) => ({ arquivos: [{ fonte: 'ourocard', meses }] });
  assert.equal(documentoGastos('faturas', { gastos: g(['2025-07', '2025-08']), gastosDrive: { arquivos: [] }, hoje: '2025-09-15' }).estado, 'ok');
  assert.equal(documentoGastos('faturas', { gastos: g(['2025-07']), gastosDrive: { arquivos: [] }, hoje: '2025-09-15' }).estado, 'atencao');
  assert.equal(documentoGastos('faturas', { gastos: g(['2025-05']), gastosDrive: { arquivos: [] }, hoje: '2025-09-15' }).estado, 'atrasado');
  assert.equal(documentoGastos('extratos', { gastos: g(['2025-08']), gastosDrive: null, hoje: '2025-09-15' }).estado, 'falta', 'só tem fatura, nenhum extrato');
  assert.equal(documentoGastos('faturas', { gastos: undefined, hoje: '2025-09-15' }).estado, 'carregando');
  assert.equal(documentoDivida('fies', {}, '2025-09-15').estado, 'falta');
  assert.equal(documentoDivida('fies', { fies: { dataSaldo: '2025-03-10' } }, '2025-09-15').estado, 'ok');
  assert.equal(documentoB3('2025-09-29').estado, 'atencao');
  assert.match(documentoB3('2025-10-03').proximo, /set\/25/);
  assert.equal(documentoB3('2025-09-15').estado, 'ok');
  const r = documentosOrganizacao({ patrimonio: undefined, salario: undefined, gastos: undefined, gastosDrive: undefined, hoje: '2025-09-15' });
  assert.ok(r.resumo.carregando >= 5, 'enquanto as respostas não chegam: "verificando…"');
  assert.ok(r.manual.length && r.auto.length);
});
