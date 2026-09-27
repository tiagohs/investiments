// tests/patrimonio.test.js
//
// 27/09/2026: aba Patrimônio montada num DOM de verdade (jsdom) -
// organizacao-patrimonio.js. Tudo inventado (o repositório é público):
// empresas, valores, datas e textos dos "PDFs".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const IR_LINHAS = [
  'IMPOSTO SOBRE A RENDA - PESSOA FÍSICA DECLARAÇÃO DE AJUSTE ANUAL', 'EXERCÍCIO 2025 ANO-CALENDÁRIO 2024',
  'DECLARAÇÃO DE BENS E DIREITOS (Valores em Reais)', 'GRUPO  CÓDIGO  DISCRIMINAÇÃO  SITUAÇÃO EM', '31/12/2023  31/12/2024',
  '04  02  TESOURO INVENTADO  10.000,00  30.000,00', '105 - Brasil',
  'TOTAL  10.000,00  30.000,00 DÍVIDAS E ÔNUS REAIS',
  'TOTAL DE RENDIMENTOS TRIBUTÁVEIS 90.000,00',
  'Bens e direitos em 31/12/2023 10.000,00 Bens e direitos em 31/12/2024 30.000,00 Dívidas e ônus reais em 31/12/2023 0,00 Dívidas e ônus reais em 31/12/2024 0,00',
];
const FIES_LINHAS = [
  'SISBB - SISTEMA DE INFORMACOES BANCO DO BRASIL', 'Valor do saldo devedor  20.000,00', 'Fim da fase  10.12.2030', 'Lançamentos em Ser  60',
  '1  10.07.2025  350,00  300,00  50,00  0,00', '2  10.08.2025  350,00  301,00  49,00  0,00',
];

const RESPOSTA = {
  ok: true,
  hoje: '2025-09-15',
  config: {
    imovel: { nome: 'Apê teste', cidade: 'Cidade X', valorCompra: 300000, dataCompra: '2023-06', entrada: 60000, metodo: 'media' },
    financiamento: { banco: 'Banco Z', sistema: 'SAC', saldo: 230000, dataSaldo: '2025-08-20', taxaAnual: 0.09, amortizacao: 700, seguroTaxas: 80, parcela: 2500, dataInicio: '2023-06', valorFinanciado: 240000 },
  },
  investimentos: { total: 120000, longoPrazo: 100000, reserva: 20000, porClasse: { acoes: 40000, fiis: 30000, acoesEua: 10000, rendaFixa: 40000, rendaFixaLongoPrazo: 20000 } },
  historicoMensal: [
    { mes: '2023-12', patrimonio: 60000, aporte: 1000, aporteLongoPrazo: 1000 },
    { mes: '2024-09', patrimonio: 90000, aporte: 1500, aporteLongoPrazo: 1500 },
    { mes: '2024-12', patrimonio: 95000, aporte: 1500, aporteLongoPrazo: 1500 },
    { mes: '2025-08', patrimonio: 118000, aporte: 2000, aporteLongoPrazo: 2000 },
    { mes: '2025-09', patrimonio: 120000, aporte: 500, aporteLongoPrazo: 500 },
  ],
  despesas: { folga: 0.1, totalReal: 6000, totalComFolga: 6600, itens: [{ nome: 'Parcela do apê', valor: 2500 }, { nome: 'Mercado', valor: 3500 }] },
  metas: { extra: 1000, reinvestimento: 0.2, rendimento: 0.06, desejado: 1500000, rendaDesejada: 9120, aporteMeta: 2500, reservaMeta: 30000 },
  proventos12m: 2400,
  cdi: 0.12,
  indices: { cidade: 'Cidade X', fipezap: [['2023-06', 100], ['2025-08', 110]], ivgr: [['2023-06', 50], ['2025-06', 54]], atualizadoEm: '2025-09-10T10:00:00.000Z' },
  pastaIrConfigurada: true,
};

async function montar(extra = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="p"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html#patrimonio', pretendToBeVisual: true });
  const doc = dom.window.document;
  const { montarAbaPatrimonio } = await import('../assets/js/pages/organizacao-patrimonio.js');
  const servidor = JSON.parse(JSON.stringify(RESPOSTA));
  const salvos = [];
  const aba = montarAbaPatrimonio({
    doc, el: doc.getElementById('p'), token: 'tk', atrasoPrefsMs: 0,
    getPatrimonioImpl: async () => JSON.parse(JSON.stringify(servidor)),
    salvarImpl: async (_t, chave, valor) => { salvos.push({ chave, valor }); servidor.config[chave] = valor; return { ok: true, chave, valor, config: JSON.parse(JSON.stringify(servidor.config)) }; },
    getArquivosIrImpl: async () => ({ ok: true, configurado: true, arquivos: [{ id: 'a1', nome: 'Cópia da Declaração.pdf', pasta: '2025', tamanho: 300000 }] }),
    getArquivoIrImpl: async (_t, id) => ({ ok: true, id, base64: 'QUJD' }),
    carregarPdf: async () => ({}),
    // como o pdf.js: só aceita bytes de verdade (TypedArray), nunca uma função
    lerPdf: async (_lib, bytes) => {
      if (!(bytes instanceof Uint8Array)) throw new Error('Invalid PDF binary data: either TypedArray, string, or array-like object is expected in the data property.');
      return bytes.byteLength === 3 ? IR_LINHAS : FIES_LINHAS;
    },
    ...extra,
  });
  await aba.pronto;
  return { dom, doc, w: dom.window, el: doc.getElementById('p'), aba, salvos, servidor };
}
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test('Aba Patrimônio: herói (tem − deve = líquido), balanço com apê pelo índice, financiamento andando sozinho e quanto do apê é seu', async () => {
  const { el, aba } = await montar();
  const b = aba.contexto.b;
  assert.ok(Math.abs(b.liquido - (b.totalAtivos - b.totalDividas)) < 0.01);
  assert.match(txt(el.querySelector('#ptHero')), /Patrimônio líquido hoje/);
  assert.match(txt(el.querySelector('#ptHero')), /É seu de verdade/);
  const bal = txt(el.querySelector('#ptBalanco'));
  assert.match(bal, /Apê teste/);
  assert.match(bal, /Média dos dois índices/);
  assert.match(bal, /R\$ 229\.300/, 'saldo de ago (230.000) menos 1 mês de amortização (700)');
  assert.match(bal, /Quanto do apê já é seu/);
  assert.ok(el.querySelector('#ptBalanco [data-acao="importar"]'), 'FGTS sem extrato: botão de importar');
  assert.equal(el.querySelector('#ptFontesTopo').hidden, false, 'sem IR ainda: "Monte o seu patrimônio" aparece no topo');
});

test('Aba Patrimônio: histórico (gráfico + tabela), meta sem as parcelas explicada e projeção com tiles', async () => {
  const { el, aba } = await montar();
  assert.ok(el.querySelector('#ptGHist svg'), 'gráfico do histórico');
  assert.equal(el.querySelectorAll('#ptTHist tbody tr').length, aba.contexto.hist.length);
  assert.match(txt(el.querySelector('#ptTHist')), /Hoje/);
  const meta = txt(el.querySelector('#ptMeta'));
  assert.match(meta, /Parcela do apê/);
  assert.match(meta, /Sem as parcelas/);
  assert.ok(aba.contexto.meta.rendaSem < aba.contexto.meta.rendaDM);
  assert.match(txt(el.querySelector('#ptTiles')), /Você chega lá/);
  assert.ok(el.querySelector('#ptGProj svg'));
  assert.ok(el.querySelectorAll('#ptDicas .pt-dica').length >= 5, 'cards de "Como acelerar"');
  assert.ok(el.querySelector('#ptDicas [data-dica="amortizar"]'));
});

test('Aba Patrimônio: preferências (taxa de saque, reserva, parcelas) recalculam e são salvas', async () => {
  const { el, w, aba, salvos } = await montar();
  const antes = aba.contexto.alvo;
  clique(w, el.querySelector('[data-seg="taxaSaque"] [data-v="0.04"]'));
  assert.ok(aba.contexto.alvo > antes, 'sacar 4% pede mais patrimônio');
  const reserva = el.querySelector('#ptReserva');
  reserva.checked = true;
  reserva.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(aba.contexto.inicial, 120000, 'com a reserva: longo prazo + reserva');
  await esperar(5);
  const prefs = salvos.filter((s) => s.chave === 'preferencias').pop();
  assert.equal(prefs.valor.taxaSaque, 0.04);
  assert.equal(prefs.valor.incluirReservaNaAposentadoria, true);
});

test('Aba Patrimônio: editar o apê (valor manual) salva e redesenha', async () => {
  const { el, w, salvos, doc } = await montar();
  clique(w, el.querySelector('[data-acao="editar:imovel"]'));
  const form = el.querySelector('form[data-form="imovel"]');
  assert.ok(form);
  form.querySelector('input[name="metodo"][value="manual"]').checked = true;
  form.querySelector('#ptImoManual').value = '350.000,00';
  form.querySelector('#ptImoManualData').value = '2025-01-01';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar();
  const s = salvos.find((x) => x.chave === 'imovel');
  assert.equal(s.valor.metodo, 'manual');
  assert.equal(s.valor.valorManual, 350000);
  assert.equal(el.querySelector('form[data-form="imovel"]'), null, 'fechou o formulário');
  assert.match(txt(el.querySelector('#ptBalanco')), /R\$ 350\.000/);
  assert.ok(doc);
});

test('Aba Patrimônio: formulário recusa o que falta (sem valor manual)', async () => {
  const { el, w, salvos } = await montar();
  clique(w, el.querySelector('[data-acao="editar:imovel"]'));
  const form = el.querySelector('form[data-form="imovel"]');
  form.querySelector('input[name="metodo"][value="manual"]').checked = true;
  form.querySelector('#ptImoManual').value = '';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar();
  assert.equal(salvos.length, 0);
  assert.match(txt(form.querySelector('.pt-form-msg')), /Digite o seu valor/);
});

test('Aba Patrimônio: importar PDF (FIES) mostra pra conferir e salva só os totais', async () => {
  const { el, aba, salvos, w } = await montar();
  // um File de verdade tem o MÉTODO bytes() (Blob.prototype.bytes) - não pode confundir com os dados
  await aba.lerArquivos([{ name: 'comprovante.pdf', arrayBuffer: async () => new ArrayBuffer(10), bytes: async () => new Uint8Array(10) }]);
  const painel = txt(el.querySelector('#ptPainel'));
  assert.match(painel, /Conferir antes de salvar/);
  assert.match(painel, /FIES \(Banco do Brasil\)/);
  assert.match(painel, /Saldo R\$ 20\.000,00/);
  clique(w, el.querySelector('[data-acao="imp-salvar"]'));
  await esperar(5);
  const fies = salvos.find((s) => s.chave === 'fies');
  assert.equal(fies.valor.saldo, 20000);
  assert.equal(fies.valor.parcelas, undefined, 'as parcelas uma a uma não vão pra planilha');
  assert.match(txt(el.querySelector('#ptBalanco')), /FIES/);
});

test('Aba Patrimônio: arquivo que não é nenhum dos documentos vira erro na lista, sem quebrar', async () => {
  const { el, aba } = await montar({ lerPdf: async () => ['um pdf qualquer'] });
  await aba.lerArquivos([{ name: 'outro.pdf', arrayBuffer: async () => new ArrayBuffer(1) }]);
  assert.match(txt(el.querySelector('#ptPainel')), /não reconheci o documento/);
  assert.ok(el.querySelector('[data-acao="imp-salvar"]').disabled);
});

test('Aba Patrimônio: declarações do IR direto do Drive - lista, lê e salva o ano', async () => {
  const { el, w, salvos } = await montar();
  clique(w, el.querySelector('[data-acao="drive-ir"]'));
  await esperar(5);
  assert.match(txt(el.querySelector('#ptPainel')), /Declarações no seu Drive/);
  clique(w, el.querySelector('[data-acao="drive-ler"]'));
  await esperar(10);
  assert.match(txt(el.querySelector('#ptPainel')), /Ano 2024/);
  clique(w, el.querySelector('[data-acao="imp-salvar"]'));
  await esperar(10);
  const ir = salvos.find((s) => s.chave === 'ir');
  assert.deepEqual(ir.valor.anos.map((a) => a.ano), [2024]);
  assert.equal(ir.valor.anos[0].bens, 30000);
});

test('Aba Patrimônio: simulador amortizar ou investir responde a valor e modo', async () => {
  const { el, w } = await montar();
  assert.match(txt(el.querySelector('#ptSim')), /Amortizando/);
  const v = el.querySelector('#ptSimValor');
  v.value = '0';
  v.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.match(txt(el.querySelector('#ptSim')), /Coloque um valor a mais/);
  const m = el.querySelector('#ptSimMensal');
  m.value = '500';
  m.dispatchEvent(new w.Event('change', { bubbles: true }));
  clique(w, el.querySelector('[data-sim="modo"] [data-v="parcela"]'));
  assert.match(txt(el.querySelector('#ptSim')), /Economiza/);
});

test('Aba Patrimônio: erro ao carregar vira aviso', async () => {
  const { el } = await montar({ getPatrimonioImpl: async () => ({ ok: false, etapa: 'patrimonio', erro: 'falhou' }) });
  assert.match(txt(el), /Não deu pra carregar o patrimônio agora \(patrimonio\): falhou/);
});
