// tests/organizacao-documentos.test.js
//
// 03/10/2026: painel "Documentos" (organizacao-documentos.js) - Tiago:
// "sempre dê a opção de enviar algum doc manualmente também". Todo item
// tem "Enviar arquivo" (ou o link pra tela certa) e cada um vai pro leitor
// certo do site. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const FONTES = {
  patrimonio: { config: { ir: { anos: [{ ano: 2024, exercicio: 2025 }] } }, pastaIrConfigurada: true, atualizado: {}, historicoMensal: [] },
  salario: { pagamentos: [], mensal: [] },
  gastos: { arquivos: [{ id: 'x', fonte: 'nubank-cartao', meses: ['2026-08'] }] },
  gastosDrive: { arquivos: [
    { id: 'a', nome: '09-2026.pdf', caminho: 'Cartão de Crédito/Nubank/2026', importado: false, alterado: false, situacao: '' },
    { id: 'b', nome: '12-2023.pdf', caminho: 'Cartão de Crédito/OuroCard/2023', importado: false, alterado: false, situacao: 'erro', problema: 'x' },
  ] },
  hoje: '2026-10-03',
};

async function montar() {
  const dom = new JSDOM('<!doctype html><html><body><div id="d"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html' });
  const doc = dom.window.document;
  const { montarPainelDocumentos, ENVIO_DOCUMENTO, EVENTO_ARQUIVOS_GASTOS } = await import('../assets/js/pages/organizacao-documentos.js');
  const acoes = [];
  const painel = montarPainelDocumentos(doc.getElementById('d'), { doc, storage: null, aoAcao: (a, x) => acoes.push([a, x]) });
  painel.atualizar(FONTES);
  painel.abrir(true);
  return { dom, doc, w: dom.window, painel, acoes, raiz: doc.getElementById('d'), ENVIO_DOCUMENTO, EVENTO_ARQUIVOS_GASTOS };
}
const escolher = (w, inp, arquivos) => {
  Object.defineProperty(inp, 'files', { value: arquivos, configurable: true });
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
};

test('Documentos: todo item tem "Enviar arquivo" (ou o link da B3), inclusive os que chegam do Drive', async () => {
  const { raiz } = await montar();
  const ids = [...raiz.querySelectorAll('[data-doc-id]')].map((li) => li.dataset.docId);
  for (const id of ids.filter((x) => x !== 'informe')) {
    const li = raiz.querySelector(`[data-doc-id="${id}"]`);
    const temEnvio = li.querySelector('[data-doc-enviar]') || li.querySelector('a[href*="transacoes"]') || li.querySelector('[data-doc-acao="pdfs"], [data-doc-acao="holerite"]');
    assert.ok(temEnvio, `${id} sem envio manual`);
  }
  assert.ok(raiz.querySelector('[data-doc-id="ir"] [data-doc-acao="ir-drive"]'), 'IR: Drive continua');
  assert.ok(raiz.querySelector('[data-doc-id="ir"] [data-doc-enviar="ir"]'), 'IR: e também enviar o PDF');
  assert.ok(raiz.querySelector('[data-doc-id="faturas"] [data-doc-enviar="faturas"]'));
  assert.match(raiz.querySelector('[data-doc-id="faturas"]').textContent, /1 novo no Drive.*1 com problema/s, 'o que falhou conta à parte');
});

test('Documentos: "Enviar arquivo" leva cada documento ao leitor certo (IR/FGTS -> Patrimônio, holerite -> Renda, fatura/extrato -> Gastos pelo evento)', async () => {
  const { doc, w, raiz, acoes, EVENTO_ARQUIVOS_GASTOS } = await montar();
  const inp = raiz.querySelector('#ogDocsEnviar');
  const clicar = (id) => { let abriu = false; inp.click = () => { abriu = true; }; raiz.querySelector(`[data-doc-enviar="${id}"]`).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return abriu; };
  // IR
  assert.ok(clicar('ir'));
  assert.equal(inp.accept, 'application/pdf,.pdf');
  escolher(w, inp, [{ name: 'Cópia da Declaração.pdf' }]);
  assert.deepEqual(acoes.pop(), ['pdfs', [{ name: 'Cópia da Declaração.pdf' }]]);
  // faturas: aceita PDF/CSV/OFX, abre Gastos e manda os arquivos pelo evento
  const recebidos = [];
  doc.addEventListener(EVENTO_ARQUIVOS_GASTOS, (ev) => { ev.detail.recebido = true; recebidos.push(ev.detail.arquivos.map((a) => a.name)); });
  assert.ok(clicar('faturas'));
  assert.match(inp.accept, /\.ofx/);
  assert.equal(inp.multiple, true);
  escolher(w, inp, [{ name: '01-2026.pdf' }, { name: 'nubank.csv' }]);
  assert.deepEqual(acoes.pop(), ['gastos', { doc: 'faturas' }]);
  assert.deepEqual(recebidos, [['01-2026.pdf', 'nubank.csv']]);
  // holerite: um arquivo só
  const hol = raiz.querySelector('[data-doc-id="holerite"]');
  assert.ok(hol.querySelector('[data-doc-acao="holerite"]') || hol.querySelector('[data-doc-enviar="holerite"]'));
  // FIES (sem ação principal quando em dia) também envia
  if (raiz.querySelector('[data-doc-enviar="fies"]')) {
    assert.ok(clicar('fies'));
    escolher(w, inp, [{ name: 'sisbb.pdf' }]);
    assert.deepEqual(acoes.pop(), ['pdfs', [{ name: 'sisbb.pdf' }]]);
  }
  // sem a seção Gastos montada: avisa em vez de sumir com o arquivo
  const { w: w2, raiz: r2 } = await montar();
  const inp2 = r2.querySelector('#ogDocsEnviar');
  inp2.click = () => {};
  r2.querySelector('[data-doc-enviar="extratos"]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  escolher(w2, inp2, [{ name: 'extrato.pdf' }]);
  assert.match(r2.querySelector('.og-docs-msg').textContent, /Importar do computador/);
});
