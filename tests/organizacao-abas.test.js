// tests/organizacao-abas.test.js
//
// 03/10/2026: reorganização da Organização Financeira (Tiago: "Reorganizar
// conteúdo das três abas atuais e renomear ... eu tenho que saber quais
// documentos preciso enviar mensalmente ou de vez em quando, e o que dá pra
// ser automatizado"): a página inteira (organizacao/despesas.html) montada
// num DOM de verdade - abas Patrimônio | Gastos e Despesas | Renda e
// Orçamentos | Simulações (03/10/2026: "jogue tudo que tem a parte de
// simulações ... pra uma nova aba, 'Simulações'"), endereços antigos, peças
// movidas, respostas compartilhadas e o painel Documentos. Tudo inventado (o
// repositório é público).
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

test('Abas: Patrimônio | Gastos e Despesas | Renda e Orçamentos | Simulações - Patrimônio abre primeiro; títulos novos', async () => {
  const { doc, pagina } = await montar();
  const abas = [...doc.querySelectorAll('#ogAbas [data-aba]')];
  assert.deepEqual(abas.map((b) => b.dataset.aba), ['patrimonio', 'despesas', 'renda', 'simulacoes']);
  assert.deepEqual(abas.map((b) => txt(b)), ['Patrimônio', 'Gastos e Despesas', 'Renda e Orçamentos', 'Simulações']);
  // 06/10/2026 (Onda 3): abas em pílula do kit (criarTabs) - role=tab, aria-selected e título da página "<Subaba> · <Seção> · Patrimônio"
  assert.ok(doc.querySelector('#ogAbas.tabs-pilula[role="tablist"]'));
  assert.deepEqual(abas.map((b) => b.getAttribute('aria-selected')), ['true', 'false', 'false', 'false']);
  assert.equal(doc.title, 'Organização Financeira · Patrimônio', 'a subaba "Patrimônio" coincide com o nome do app e some do título');
  pagina.mostrarAba('renda');
  assert.equal(doc.title, 'Renda e Orçamentos · Organização Financeira · Patrimônio');
  pagina.mostrarAba('patrimonio');
  assert.equal(pagina.abaAtual, 'patrimonio');
  assert.equal(doc.getElementById('painelPatrimonio').hidden, false);
  assert.equal(doc.getElementById('painelDespesas').hidden, true);
  assert.match(txt(doc.getElementById('ptHero')), /Patrimônio líquido hoje/);
});

test('Endereços antigos continuam: #salario abre Renda e Orçamentos, #despesas e #gastos abrem Gastos e Despesas, #simulador abre Simulações', async () => {
  for (const [hash, aba] of [['#salario', 'renda'], ['#renda', 'renda'], ['#despesas', 'despesas'], ['#gastos', 'despesas'], ['#simulador', 'simulacoes'], ['#simulacoes', 'simulacoes'], ['#patrimonio', 'patrimonio']]) {
    const { pagina, w } = await montar(hash);
    assert.equal(pagina.abaAtual, aba, hash);
    assert.equal(w.location.hash, aba === 'patrimonio' ? '' : `#${aba}`, `${hash} vira o endereço novo`);
  }
});

test('Gastos e Despesas: despesas essenciais "para a renda de emergência" + link pra Metas, gastos reais e só um link pro simulador (que foi pra Simulações)', async () => {
  const { doc, w, pagina, chamadas } = await montar('#despesas');
  await esperar(30);
  const lista = doc.querySelector('.og-lista-cab');
  assert.match(txt(lista), /Despesas essenciais para a renda de emergência/);
  assert.match(txt(lista), /despesas que entram na conta da renda emergencial/);
  assert.ok([...doc.querySelectorAll('#organizacaoConteudo a')].some((a) => a.getAttribute('href') === '../metas.html' && /Reserva de emergência/.test(a.textContent)));
  assert.ok(pagina.gastos, 'seção de gastos montada');
  assert.ok(doc.querySelector('#gastosConteudo .gs-conteudo'));
  // 03/10/2026: o simulador saiu daqui
  const painel = doc.getElementById('painelDespesas');
  assert.equal(painel.querySelector('#simulador, .sd'), null);
  assert.equal(pagina.simulador, null, 'o simulador só monta quando a aba Simulações abre');
  const filhos = [...painel.children].map((x) => x.id || x.className);
  assert.ok(filhos.indexOf('organizacaoConteudo') < filhos.indexOf('gastosConteudo') && filhos.indexOf('gastosConteudo') < filhos.indexOf('og-link-sim'), 'despesas -> gastos -> link');
  const link = painel.querySelector('.og-link-sim a');
  assert.equal(link.getAttribute('href'), '#simulacoes');
  assert.match(txt(link), /Simular amortizar × investir → Simulações/);
  // o link (hash) leva pra aba Simulações
  w.location.hash = '#simulacoes';
  await esperar(30);
  assert.equal(pagina.abaAtual, 'simulacoes');
  assert.ok(pagina.simulador, 'simulador montado com o patrimônio compartilhado');
  // uma resposta só pras abas e o painel Documentos
  clique(w, doc.querySelector('[data-aba="patrimonio"]'));
  clique(w, doc.querySelector('[data-aba="renda"]'));
  await esperar(30);
  assert.equal(chamadas.patrimonio, 1, 'getPatrimonio uma vez só');
  assert.equal(chamadas.salario, 1, 'getSalario uma vez só');
  assert.equal(chamadas.gastos, 1, 'getGastos uma vez só (painel + seção)');
});

// 05/10/2026 (A-39): a carga inicial não repete as chamadas que o painel Documentos já pediu
test('Carga inicial: cada ação (patrimônio, salário, gastos, Drive) é pedida uma vez só, mesmo com o "Atualizar dados" da 1ª pintura', async () => {
  const { chamadas } = await montar('', { refresh: true });
  await esperar(50);
  assert.equal(chamadas.patrimonio, 1, 'getPatrimonio 1x');
  assert.equal(chamadas.salario, 1, 'getSalario 1x');
  assert.equal(chamadas.gastos, 1, 'getGastos 1x');
  assert.equal(chamadas.drive, 1, 'getArquivosGastos 1x');
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

test('Simulações: herói (ritmo, primeiro milhão, viés, quitação) em cima e o simulador inteiro embaixo, com o valor padrão = mínimo pra 2 parcelas', async () => {
  const { doc, w, pagina, chamadas } = await montar('#simulacoes');
  await esperar(30);
  assert.equal(pagina.abaAtual, 'simulacoes');
  assert.equal(doc.getElementById('painelSimulacoes').hidden, false);
  const ids = [...doc.querySelectorAll('#painelSimulacoes .og-simulacoes > div')].map((x) => x.id);
  assert.deepEqual(ids, ['simulacoesHero', 'simulador'], 'herói em cima, detalhe embaixo');
  const tiles = [...doc.querySelectorAll('#simulacoesHero .sm-tile')];
  assert.equal(tiles.length, 4);
  assert.match(txt(tiles[0]), /Ritmo atual/);
  assert.match(txt(tiles[0]), /Aporte médio/);
  assert.match(txt(tiles[1]), /Primeiro R\$ 1 milhão/);
  assert.match(txt(tiles[1]), /amortizando o apê/);
  assert.match(txt(tiles[2]), /Viés: investir ou amortizar/);
  assert.match(txt(tiles[3]), /Quitação das dívidas/);
  assert.match(txt(tiles[3]), /Apê/);
  // o detalhe que estava em Gastos e Despesas
  const sim = doc.getElementById('simulador');
  for (const t of [/Amortizar ou investir\?/, /Quanto amortizar pra matar 2, 3 ou 4 parcelas por mês/, /Ano a ano/, /Onde investir faz diferença/, /Estratégias do vídeo/, /Referências/]) assert.match(txt(sim), t);
  const p = pagina.simulador.params;
  assert.equal(p.valorManual, false);
  assert.equal(p.valor, p.valorMinimo.valor);
  assert.match(txt(doc.getElementById('sdValorNota')), /tira 2 parcelas do fim do contrato do apê/);
  // o herói acompanha o formulário
  const antes = txt(tiles[2]);
  const inp = doc.getElementById('sdValor');
  inp.value = '300';
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.match(txt(doc.querySelector('#simulacoesHero .sm-vies')), /R\$ 300\/mês/);
  assert.notEqual(txt(doc.querySelector('#simulacoesHero .sm-vies')), antes);
  assert.equal(chamadas.patrimonio, 1);
});

// 05/10/2026 (Tiago, P3): "em Gastos e Despesas › Gastos, depois de importar e trocar de aba, a seção mostra o estado
// vazio até dar reload". Reproduz o fluxo na página inteira: abre em Gastos (vazio), importa do Drive (servidor falso
// com estado), troca de aba e volta, de novo e com "Atualizar dados".
test('Gastos: depois de importar e trocar de aba (ida e volta) a seção continua com os gastos, sem precisar de reload', async () => {
  const FATURA = [
    'Esta é a sua fatura de', 'Data de vencimento: 10 MAR 2025', 'FATURA 10 MAR 2025', 'Total a pagar  R$ 190,00',
    'Fatura anterior  R$ 0,00', 'Total de compras de todos os cartões, 01 FEV a 01 MAR  R$ 190,00',
    'TRANSAÇÕES  DE 01 FEV A 01 MAR', '03 FEV  Mercado Exemplo  R$ 150,00', '10 FEV  NETFLIX.COM  R$ 40,00',
  ];
  const servidor = { lancamentos: [], arquivos: [], salvos: 0 };
  const api = {
    getGastos: async () => ({ ok: true, lancamentos: JSON.parse(JSON.stringify(servidor.lancamentos)), arquivos: JSON.parse(JSON.stringify(servidor.arquivos)), regras: [] }),
    getArquivosGastos: async () => ({ ok: true, configurado: true, arquivos: [{ id: 'd1', nome: '03-2025.pdf', caminho: 'Cartão de Crédito/Nubank/2025', banco: 'Nubank', origem: 'cartao', importado: servidor.arquivos.some((x) => x.id === 'd1') }] }),
    getArquivoGastos: async (id) => ({ ok: true, id, base64: Buffer.from('%PDF-falso').toString('base64'), modificado: '2025-03-02T00:00:00.000Z' }),
    salvarImportacaoGastos: async (arquivo, lancs) => {
      servidor.salvos += 1;
      servidor.lancamentos.push(...lancs.map((l) => ({ ...l, arquivo: arquivo.id })));
      servidor.arquivos.push({ id: arquivo.id, nome: arquivo.nome, fonte: arquivo.fonte, meses: arquivo.meses, conferencia: arquivo.conferencia });
      return { ok: true, gravados: lancs.length };
    },
    salvarRegraGastos: async () => ({ ok: true }), excluirArquivoGastos: async () => ({ ok: true }),
  };
  const { w, doc, pagina } = await montar('#despesas', { gastosOpcoes: { api, storage: null, carregarPdf: async () => ({}), lerPdf: async () => FATURA } });
  await esperar(40);
  assert.match(txt(doc.querySelector('#gsHero')), /Seus gastos aparecem aqui/);
  await pagina.gastos.importarNovos();
  await esperar(40);
  assert.equal(servidor.salvos, 1);
  assert.match(txt(doc.querySelector('#gsHero')), /R\$ 190/, 'depois de importar aparece o gasto');
  // troca de aba e volta (Renda, Simulações, Patrimônio, de novo Gastos)
  for (const aba of ['renda', 'simulacoes', 'patrimonio', 'despesas']) { clique(w, doc.querySelector(`[data-aba="${aba}"]`)); await esperar(40); }
  assert.match(txt(doc.querySelector('#gsHero')), /R\$ 190/, 'ao voltar pra aba, os gastos continuam na tela');
  assert.equal(doc.querySelector('#gsCorpo').hidden, false);
  // e depois de "Atualizar dados" / recarregar
  await pagina.gastos.recarregar();
  await esperar(20);
  assert.match(txt(doc.querySelector('#gsHero')), /R\$ 190/);
  assert.ok(pagina.carregadores.gastos.valor.lancamentos.length >= 2, 'a resposta compartilhada (painel Documentos) também está atualizada');
});

test('Gastos: se a releitura falhar depois de importar, o que entrou fica na tela (com aviso e nova tentativa) e uma resposta velha não apaga a tela', async () => {
  const CSV = 'date,title,amount\n2025-08-03,Mercado Teste,150.00\n2025-08-10,Streaming Teste,40.00\n';
  const servidor = { lancamentos: [], arquivos: [], falhar: false, fila: null };
  const api = {
    getGastos: async () => {
      if (servidor.fila) return servidor.fila.shift()();
      if (servidor.falhar) return { ok: false, etapa: 'network', erro: 'TypeError: Failed to fetch' };
      return { ok: true, lancamentos: JSON.parse(JSON.stringify(servidor.lancamentos)), arquivos: JSON.parse(JSON.stringify(servidor.arquivos)), regras: [] };
    },
    getArquivosGastos: async () => ({ ok: true, configurado: false, arquivos: [] }),
    getArquivoGastos: async () => ({ ok: false, erro: 'teste' }),
    salvarImportacaoGastos: async (arquivo, lancs) => {
      servidor.lancamentos.push(...lancs.map((l) => ({ ...l, arquivo: arquivo.id })));
      servidor.arquivos.push({ id: arquivo.id, nome: arquivo.nome, fonte: arquivo.fonte, meses: arquivo.meses });
      if (servidor.falharDepois) servidor.falhar = true; // a releitura que vem logo depois de salvar falha (rede)
      return { ok: true, gravados: lancs.length };
    },
    salvarRegraGastos: async () => ({ ok: true }), excluirArquivoGastos: async () => ({ ok: true }),
  };
  const { w, doc, pagina } = await montar('#despesas', { gastosOpcoes: { api, storage: null } });
  await esperar(30);
  assert.match(txt(doc.querySelector('#gsHero')), /Seus gastos aparecem aqui/);
  assert.ok(doc.querySelector('#gsHero [data-acao="recarregar"]'), 'o vazio também oferece recarregar da planilha');
  servidor.falharDepois = true;
  await pagina.gastos.lerArquivos([new w.File([CSV], 'cartao_2025-09-10.csv', { type: 'text/csv' })]);
  await esperar(40);
  assert.match(txt(doc.querySelector('#gsHero')), /R\$ 190/, 'o que acabou de entrar aparece mesmo com a releitura falhando');
  assert.match(txt(doc.querySelector('#gsPainel')), /ainda não consegui confirmar com a planilha/);
  // troca de aba e volta: a releitura é refeita (agora a rede voltou) e o aviso some
  servidor.falhar = false;
  for (const aba of ['renda', 'despesas']) { clique(w, doc.querySelector(`[data-aba="${aba}"]`)); await esperar(40); }
  assert.match(txt(doc.querySelector('#gsHero')), /R\$ 190/);
  assert.doesNotMatch(txt(doc.querySelector('#gsPainel')), /ainda não consegui confirmar/);
  // respostas fora de ordem: a mais velha (vazia) chega depois da nova e não apaga a tela
  let soltarVelha;
  const velha = new Promise((r) => { soltarVelha = r; });
  const dadosCertos = { ok: true, lancamentos: JSON.parse(JSON.stringify(servidor.lancamentos)), arquivos: JSON.parse(JSON.stringify(servidor.arquivos)), regras: [] };
  servidor.fila = [() => velha, async () => dadosCertos];
  const p1 = pagina.gastos.recarregar();
  const p2 = pagina.gastos.recarregar();
  await p2;
  soltarVelha({ ok: true, lancamentos: [], arquivos: [], regras: [] });
  await p1;
  await esperar(20);
  assert.match(txt(doc.querySelector('#gsHero')), /R\$ 190/, 'resposta velha ignorada');
  servidor.fila = null;
});
