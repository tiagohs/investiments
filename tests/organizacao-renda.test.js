// tests/organizacao-renda.test.js
//
// 02/10/2026: seção Renda (aba "Renda e Orçamentos") montada num DOM de
// verdade (jsdom) - organizacao-renda.js - e a gravação das novas chaves da
// declaração no Patrimonio.gs (normalizarPatrimonio_). Tudo inventado: as
// empresas, os bancos, agência/conta e os valores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semRealm = (o) => JSON.parse(JSON.stringify(o));
function memoria() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }

const CONTAS = [
  { banco: '260', bancoNome: 'Nubank', agencia: '0001', conta: '1234567-8', tipo: 'corrente', grupo: '06', descricao: 'CONTA INVENTADA', saldoAnterior: 10, saldoAtual: 2500 },
  { banco: '001', bancoNome: 'Banco do Brasil', agencia: '0123', conta: '45678-9', tipo: 'corrente', grupo: '06', descricao: 'OUTRA INVENTADA', saldoAnterior: 5, saldoAtual: 300 },
];
function patrimonio({ comNovos = true } = {}) {
  const ano = (a, ren, inss, irrf, d13) => ({
    exercicio: a + 1, ano: a, bens: 1000, dividas: 0, grupos: {}, tributaveis: ren, impostoDevido: irrf, restituir: 100, pagar: 0,
    ...(comNovos ? { recebidosPj: ren, rendimentosPj: [{ fonte: 'EMPRESA X', cnpjRaiz: '00.000.000', anual: ren, inss, irrf, decimoTerceiro: d13, irrf13: 100 }], contasBancarias: a === 2025 ? CONTAS : CONTAS.slice(0, 1), isentosItens: [], exclusivosItens: [] } : {}),
  });
  return {
    ok: true, hoje: '2026-10-02', pastaIrConfigurada: true,
    config: {
      ir: { anos: [ano(2023, 80000, 7000, 12000, 6000), ano(2024, 90000, 7500, 14000, 7000), ano(2025, 100000, 8000, 16000, 8000)] },
      carreira: { contratos: [{ empregador: 'EMPRESA X', inicio: '2023-01-01', fim: null, salarios: [{ data: '2023-01-01', valor: 6000 }, { data: '2024-01-01', valor: 7000 }, { data: '2025-01-01', valor: 8000 }] }] },
      fgts: { contas: [{ empregador: 'EMPRESA X', dataSaldo: '2026-06-10' }] },
    },
    atualizado: { carreira: '2026-01-10T00:00:00Z' },
  };
}
function salario() {
  const pagamentos = []; const mensal = [];
  for (let m = 1; m <= 9; m += 1) {
    const mes = `2026-${String(m).padStart(2, '0')}`;
    pagamentos.push({ mes, tipo: 'Mensal', status: 'Recebido', salarioBase: 9000, totalVencimentos: 9000, inss: 900, irrf: 1300, liquido: 6800, dataCredito: `2026-${String(m + 1).padStart(2, '0')}-05` });
  }
  for (let k = 0; k < 14; k += 1) {
    const d = new Date(Date.UTC(2025, 8 + k, 1));
    mensal.push({ mes: d.toISOString().slice(0, 7), total: 1500 + 50 * k, longoPrazo: 1400, reserva: 100, proventos: 80, parcial: k === 13 });
  }
  return { ok: true, base: { liquido: 6800, percentualInvestir: 0.25, aporteMeta: 1700 }, pagamentos, mensal };
}

async function montar(opcoes = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="r"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const { montarSecaoRenda } = await import('../assets/js/pages/organizacao-renda.js');
  const raiz = doc.getElementById('r');
  const secao = montarSecaoRenda(raiz, { doc, hoje: '2026-10-02', buscarIpca: false, storage: memoria(), patrimonio: patrimonio(), salario: salario(), ...opcoes });
  return { dom, doc, raiz, secao };
}

test('monta herói, gráficos, tabela, impostos, investimento, contas e documentos', async () => {
  const { doc, raiz, secao } = await montar();
  const hero = raiz.querySelector('#rdHero').textContent;
  assert.match(hero, /Salário líquido/);
  assert.match(hero, /6\.800/);
  assert.match(hero, /Renda em 2025 \(IR\)/);
  assert.ok(raiz.querySelector('#rdGSal svg'), 'gráfico do salário');
  assert.ok(raiz.querySelector('#rdGSal .rd-inf'), 'linha da inflação');
  assert.ok(raiz.querySelectorAll('#rdGSal .pt-hit').length >= 3);
  assert.equal(raiz.querySelectorAll('#rdTabela tbody tr').length, 4, '2023-2026');
  // 03/10/2026: card de Análise embaixo do gráfico do salário (salário x IPCA)
  const analise = raiz.querySelector('#rdAnaliseSal');
  assert.ok(analise && !analise.hidden && analise.querySelector('details.ag'), 'card de Análise do salário');
  assert.match(analise.textContent, /IPCA/);
  assert.match(raiz.querySelector('#rdCarga').textContent, /Em 2025/);
  assert.ok(raiz.querySelector('#rdGInv svg'), 'gráfico do investimento');
  assert.match(raiz.querySelector('#rdInvTiles').textContent, /Média 12 meses/);
  const cartoes = raiz.querySelectorAll('#rdContas .rd-conta');
  assert.equal(cartoes.length, 2);
  assert.match(cartoes[0].textContent, /Nubank/);
  assert.match(cartoes[0].textContent, /1234567-8/);
  assert.match(raiz.querySelector('#rdContas').textContent, /Declaração IR 2026 \(ano 2025\)/);
  const docs = [...raiz.querySelectorAll('.rd-doc')].map((li) => li.textContent);
  assert.ok(docs.some((t) => /Declaração do IR/.test(t) && /automático/.test(t)));
  assert.ok(docs.some((t) => /Holerite/.test(t) && /set\/2026/.test(t)));
  assert.ok(doc.querySelector('link[data-renda-css]'), 'injeta o renda.css');
  assert.equal(secao.resumo.linhas.length, 4);
});

test('filtros de período: presets redesenham; o "Escolher período" é acrescentado', async () => {
  const { raiz } = await montar();
  const tabs = raiz.querySelector('#rdSecSalario .filter-tabs');
  assert.ok(tabs.querySelector('.fp-chip'), 'chip do calendário');
  tabs.querySelector('[data-periodo="5a"]').click();
  assert.equal(raiz.querySelectorAll('#rdTabela tbody tr').length, 4);
  const inv = raiz.querySelector('#rdSecInv .filter-tabs');
  const antes = raiz.querySelectorAll('#rdGInv .pt-hit').length;
  inv.querySelector('[data-periodo="6m"]').click();
  assert.equal(raiz.querySelectorAll('#rdGInv .pt-hit').length, 6);
  assert.ok(antes > 6);
  assert.ok(inv.querySelector('[data-periodo="6m"]').classList.contains('active'));
});

test('descontar proventos muda a conta e fica guardado; ações de documento viram evento', async () => {
  const storage = memoria();
  const acoes = [];
  const p = patrimonio();
  const { dom, raiz, secao } = await montar({ storage, aoAcao: (a) => acoes.push(a), patrimonio: { ...p, pastaIrConfigurada: false, config: { ...p.config, ir: { anos: [] } } } });
  const m1 = secao.resumo.investimento.media12.valor;
  const chk = raiz.querySelector('#rdDescProv');
  chk.checked = !chk.checked;
  chk.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.ok(Math.abs(Math.abs(secao.resumo.investimento.media12.valor - m1) - 80) < 1e-6);
  assert.ok(storage.m.has('renda.descontarProventos'));
  const eventos = [];
  raiz.addEventListener('renda:acao', (e) => eventos.push(e.detail.acao));
  const b = raiz.querySelector('#rdDocs [data-acao="importar-ir"]');
  assert.ok(b, 'sem declaração e sem Drive: botão de importar');
  b.click();
  assert.deepEqual(acoes, ['importar-ir']);
  assert.deepEqual(eventos, ['importar-ir']);
});

test('sem nada carregado não quebra; declarações antigas pedem pra ler de novo do Drive', async () => {
  const vazio = await montar({ patrimonio: null, salario: null });
  assert.match(vazio.raiz.textContent, /Importe um holerite/);
  const velho = await montar({ patrimonio: patrimonio({ comNovos: false }) });
  assert.match(velho.raiz.querySelector('#rdContas').textContent, /Leia de novo/);
  assert.ok(velho.raiz.querySelector('#rdContas [data-acao="ler-ir-drive"]'));
  const so = await montar({ secoes: ['contas', 'documentos'] });
  assert.equal(so.raiz.querySelector('#rdHero'), null);
  assert.ok(so.raiz.querySelector('#rdDocs'));
});

test('"Ler de novo do Drive": lê cada PDF da pasta, troca os anos e salva a chave ir', async () => {
  const salvos = [];
  const atualizacoes = [];
  const linhasIr = (a) => [
    `EXERCÍCIO ${a + 1} ANO-CALENDÁRIO ${a} DECLARAÇÃO DE AJUSTE ANUAL`,
    'RENDIMENTOS TRIBUTÁVEIS RECEBIDOS DE PESSOA JURÍDICA PELO TITULAR (Valores em Reais)',
    'EMPRESA NOVA LTDA  33.333.333/0001-33  120.000,00  9.000,00  20.000,00  10.000,00  1.000,00',
    'DECLARAÇÃO DE BENS E DIREITOS (Valores em Reais)', 'GRUPO CÓDIGO DISCRIMINAÇÃO SITUAÇÃO EM', `31/12/${a - 1} 31/12/${a}`,
    '06 01 CONTA INVENTADA', '1,00  2,00', '105 - Brasil', 'Banco: 077 Agência: 0001 Conta: 555-1',
    'TOTAL 1,00 2,00 DÍVIDAS E ÔNUS REAIS',
    `Bens e direitos em 31/12/${a - 1} 1,00 Bens e direitos em 31/12/${a} 2,00 Dívidas e ônus reais em 31/12/${a - 1} 0,00 Dívidas e ônus reais em 31/12/${a} 0,00`,
  ];
  const api = {
    // 03/10/2026: a pasta 2025 tem o PDF de melhor nome quebrado e uma alternativa que é a declaração;
    // a 2024 só tem um PDF que não é declaração (conta como erro)
    getArquivosIr: async () => ({ ok: true, configurado: true, arquivos: [{ id: 'a', pasta: '2026', nome: 'copia.pdf' }, { id: 'b', pasta: '2025', nome: 'quebrado.pdf' }, { id: 'd', pasta: '2024', nome: 'Cópia da Delcaração.pdf' }], alternativas: [{ id: 'c', pasta: '2025', nome: 'outra.pdf' }] }),
    getArquivoIr: async (id) => { pedidos.push(id); return { ok: true, base64: Buffer.from(id).toString('base64') }; },
    salvarPatrimonio: async (chave, valor) => { salvos.push({ chave, valor }); return { ok: true, config: { ...patrimonio().config, ir: valor }, atualizado: {} }; },
  };
  const pedidos = [];
  const lerPdf = async (lib, bytes) => ({ a: linhasIr(2025), c: linhasIr(2024) }[String.fromCharCode(...bytes)] || ['um PDF qualquer']);
  const { raiz, secao } = await montar({ patrimonio: patrimonio({ comNovos: false }), api, lerPdf, carregarPdf: async () => ({}), aoAtualizarPatrimonio: (r) => atualizacoes.push(r) });
  await secao.lerIrDoDrive();
  assert.equal(salvos.length, 1);
  assert.equal(salvos[0].chave, 'ir');
  const anos = salvos[0].valor.anos;
  assert.deepEqual(anos.map((a) => a.ano), [2023, 2024, 2025]);
  const a25 = anos.find((a) => a.ano === 2025);
  assert.equal(a25.rendimentosPj[0].anual, 120000);
  assert.equal(a25.contasBancarias[0].bancoNome, 'Inter');
  assert.equal(a25.nascimento, undefined);
  assert.equal(atualizacoes.length, 1);
  assert.deepEqual(pedidos, ['a', 'b', 'c', 'd'], 'tenta a alternativa da mesma pasta quando o 1º PDF não é a declaração');
  assert.match(raiz.querySelector('.rd-lendo').textContent, /2 declarações lidas e salvas · 1 com erro/);
  assert.match(raiz.querySelector('#rdContas').textContent, /Inter/);
});

test('Patrimonio.gs: normalizarPatrimonio_ guarda as novas chaves da declaração (e só os campos conhecidos)', () => {
  const sb = { console: { ...console, log() {} }, Utilities: { getUuid: () => 'id' } };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Patrimonio.gs'), 'utf8'), { filename: 'Patrimonio.gs' }).runInContext(sb);
  const r = semRealm(sb.normalizarPatrimonio_('ir', {
    anos: [
      { ano: 2024, exercicio: 2025, bens: 10, recebidosPj: 100, rendimentosPj: [{ fonte: '=EMPRESA', cnpjRaiz: '11.111.111', anual: 100, inss: 1, irrf: 2, decimoTerceiro: 3, irrf13: 0.5, cpf: '000' }],
        contasBancarias: [{ banco: '260', bancoNome: 'Nubank', agencia: '0001', conta: '123-4', tipo: 'corrente', grupo: '06', descricao: 'X', saldoAnterior: 1, saldoAtual: 2, lixo: 1 }, { banco: 'abc', agencia: '<b>', tipo: 'outra', saldoAtual: 0 }],
        isentosItens: [{ codigo: '09', nome: 'Lucros', tipo: 'dividendos', valor: 5 }, { codigo: '1', valor: 'x' }], exclusivosItens: [] },
      { ano: 2023, bens: 5 },
    ],
  }));
  const [a23, a24] = r.anos;
  assert.equal(a23.rendimentosPj, undefined, 'declaração antiga continua sem os campos');
  assert.equal(a23.contasBancarias, undefined);
  assert.deepEqual(a24.rendimentosPj, [{ fonte: 'EMPRESA', cnpjRaiz: '11.111.111', anual: 100, inss: 1, irrf: 2, decimoTerceiro: 3, irrf13: 0.5 }]);
  assert.deepEqual(a24.contasBancarias[0], { banco: '260', bancoNome: 'Nubank', agencia: '0001', conta: '123-4', tipo: 'corrente', grupo: '06', descricao: 'X', saldoAnterior: 1, saldoAtual: 2 });
  assert.deepEqual(a24.contasBancarias[1], { banco: null, bancoNome: '', agencia: null, conta: null, tipo: 'corrente', grupo: '', descricao: '', saldoAnterior: null, saldoAtual: 0 });
  assert.deepEqual(a24.isentosItens, [{ codigo: '09', nome: 'Lucros', tipo: 'dividendos', valor: 5 }]);
  assert.equal(a24.recebidosPj, 100);
});
