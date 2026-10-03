// tests/organizacao-gastos.test.js
//
// 02/10/2026: seção Gastos montada num DOM de verdade (jsdom) -
// organizacao-gastos.js. Tudo inventado: o "PDF" é uma fatura de mentira,
// a senha é de teste e o Drive é falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const FATURA = [
  'Esta é a sua fatura de', 'Data de vencimento: 10 MAR 2025', 'FATURA 10 MAR 2025', 'Total a pagar  R$ 190,00',
  'Fatura anterior  R$ 0,00', 'Total de compras de todos os cartões, 01 FEV a 01 MAR  R$ 190,00',
  'TRANSAÇÕES  DE 01 FEV A 01 MAR',
  '03 FEV  Mercado Exemplo  R$ 150,00', '10 FEV  NETFLIX.COM  R$ 40,00',
];
const SENHA_TESTE = 'senha-de-teste';

function memoria() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }

async function montar({ arquivos = [], lancamentos = [], storage = memoria() } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="g"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const { montarSecaoGastos } = await import('../assets/js/pages/organizacao-gastos.js');
  const servidor = { lancamentos: [...lancamentos], arquivos: [...arquivos], regras: [], salvos: [], regrasSalvas: [], drive: [{ id: 'd1', nome: '03-2025.pdf', caminho: 'Cartão de Crédito/Nubank/2025', banco: 'Nubank', origem: 'cartao', importado: false }] };
  const api = {
    getGastos: async () => ({ ok: true, lancamentos: JSON.parse(JSON.stringify(servidor.lancamentos)), arquivos: servidor.arquivos, regras: servidor.regras }),
    getArquivosGastos: async () => ({ ok: true, configurado: true, arquivos: servidor.drive.map((a) => ({ ...a, importado: servidor.arquivos.some((x) => x.id === a.id) })) }),
    getArquivoGastos: async (id) => ({ ok: true, id, base64: Buffer.from('%PDF-falso').toString('base64'), modificado: '2025-03-02T00:00:00.000Z' }),
    salvarImportacaoGastos: async (arquivo, lancs) => {
      servidor.salvos.push({ arquivo, lancs });
      servidor.lancamentos.push(...lancs.map((l) => ({ ...l, arquivo: arquivo.id })));
      servidor.arquivos.push({ id: arquivo.id, nome: arquivo.nome, fonte: arquivo.fonte, meses: arquivo.meses, conferencia: arquivo.conferencia });
      return { ok: true, gravados: lancs.length, pulados: 0 };
    },
    salvarRegraGastos: async (padrao, categoria) => { servidor.regrasSalvas.push({ padrao, categoria }); servidor.regras = [{ padrao, categoria }]; return { ok: true, regras: servidor.regras }; },
    excluirArquivoGastos: async () => ({ ok: true }),
  };
  const tentativas = [];
  const secao = montarSecaoGastos(doc.getElementById('g'), {
    api, hoje: '2025-04-05', storage,
    despesas: { despesas: { itens: [{ nome: 'Mercado', valor: 120, categoria: 'Alimentação' }] } },
    carregarPdf: async () => ({}),
    lerPdf: async (_lib, bytes, senha) => {
      if (!(bytes instanceof Uint8Array)) throw new Error('Invalid PDF binary data');
      tentativas.push(senha);
      if (senha !== SENHA_TESTE) { const e = new Error(senha ? 'Incorrect Password' : 'No password given'); e.name = 'PasswordException'; throw e; }
      return FATURA;
    },
  });
  await secao.pronto;
  return { dom, doc, w: dom.window, el: doc.getElementById('g'), secao, servidor, tentativas, storage };
}
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const esperar = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function ate(cond, ms = 2000) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tempo esgotado'); await esperar(5); } }
function responderSenha(w, el, senha, lembrar) {
  const f = el.querySelector('form[data-form="senha"]');
  f.querySelector('#gsSenha').value = senha;
  f.querySelector('#gsLembrar').checked = lembrar;
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}

test('Gastos: vazio oferece importar; o Drive tem arquivo novo -> "Importar agora" pede a senha, recusa a errada, lembra a certa e grava só os lançamentos', async () => {
  const { w, el, servidor, tentativas, storage } = await montar();
  assert.match(txt(el.querySelector('#gsHero')), /Seus gastos aparecem aqui/);
  await ate(() => el.querySelector('[data-acao="importar-novos"]'));
  assert.match(txt(el.querySelector('#gsPainel')), /1 arquivo novo no Drive/);
  clique(w, el.querySelector('[data-acao="importar-novos"]'));
  await ate(() => el.querySelector('form[data-form="senha"]'));
  assert.match(txt(el.querySelector('.gs-senha')), /03-2025\.pdf está protegido por senha/);
  responderSenha(w, el, 'errada', false);
  await ate(() => /Senha incorreta/.test(txt(el.querySelector('#gsPainel'))));
  responderSenha(w, el, SENHA_TESTE, true);
  await ate(() => /Importação concluída/.test(txt(el.querySelector('#gsPainel'))));
  assert.deepEqual(tentativas, [null, 'errada', SENHA_TESTE]);
  assert.equal(storage.getItem('gastos.senhaPdf'), SENHA_TESTE, 'lembrada só no navegador');
  assert.equal(servidor.salvos.length, 1);
  const { arquivo, lancs } = servidor.salvos[0];
  assert.deepEqual([arquivo.id, arquivo.fonte, arquivo.meses, arquivo.conferencia.ok], ['d1', 'nubank-cartao', ['2025-03'], true]);
  assert.ok(!JSON.stringify(servidor.salvos).includes(SENHA_TESTE), 'a senha não vai pro servidor');
  assert.deepEqual(lancs.map((l) => [l.descricao, l.categoria, l.origem]), [['Mercado Exemplo', 'mercado', 'cartao'], ['NETFLIX.COM', 'assinaturas', 'cartao']]);
  assert.ok(lancs.every((l) => l.chaveDedup), 'chave de deduplicação');
  assert.match(txt(el.querySelector('.gs-log')), /Nubank \(cartão\) mar\/25 · 2 lançamentos · soma confere/);
  await ate(() => /R\$ 190/.test(txt(el.querySelector('#gsHero'))));
  assert.match(txt(el.querySelector('#gsCats')), /Mercado/);
  assert.match(txt(el.querySelector('#gsEss')), /Essenciais cadastrados/);
});

test('Gastos: senha lembrada abre direto; "pular" deixa o arquivo de fora sem quebrar', async () => {
  const st = memoria();
  st.setItem('gastos.senhaPdf', SENHA_TESTE);
  const a = await montar({ storage: st });
  await ate(() => a.el.querySelector('[data-acao="importar-novos"]'));
  clique(a.w, a.el.querySelector('[data-acao="importar-novos"]'));
  await ate(() => /Importação concluída/.test(txt(a.el.querySelector('#gsPainel'))));
  assert.deepEqual(a.tentativas, [null, SENHA_TESTE]);
  assert.ok(!a.el.querySelector('form[data-form="senha"]'));

  const b = await montar();
  await ate(() => b.el.querySelector('[data-acao="importar-novos"]'));
  clique(b.w, b.el.querySelector('[data-acao="importar-novos"]'));
  await ate(() => b.el.querySelector('[data-acao="senha-pular"]'));
  clique(b.w, b.el.querySelector('[data-acao="senha-pular"]'));
  await ate(() => /Importação concluída: 0 de 1/.test(txt(b.el.querySelector('#gsPainel'))));
  assert.match(txt(b.el.querySelector('.gs-log')), /pulado/);
  assert.equal(b.servidor.salvos.length, 0);
});

test('Gastos: com dados - período, recategorizar cria regra, documentos e lista filtrável', async () => {
  const lancs = [];
  ['2025-01', '2025-02', '2025-03'].forEach((m) => {
    lancs.push({ mes: m, data: `${m}-05`, origem: 'cartao', fonte: 'ourocard', descricao: 'NETFLIX.COM', categoria: 'assinaturas', valor: 40, tipo: 'compra', parcela: '', arquivo: `a${m}` });
    lancs.push({ mes: m, data: `${m}-06`, origem: 'conta', fonte: 'nubank-conta', descricao: 'Pagamento de boleto · ALGO INVENTADO', categoria: 'outros', valor: 300, tipo: 'boleto', parcela: '', arquivo: `b${m}` });
    lancs.push({ mes: m, data: `${m}-07`, origem: 'conta', fonte: 'nubank-conta', descricao: 'Pagamento de fatura', categoria: 'ignorar', valor: 900, tipo: 'pagamento_fatura', parcela: '', arquivo: `b${m}` });
  });
  const arquivos = ['2025-01', '2025-02', '2025-03'].map((m) => ({ id: `a${m}`, fonte: 'ourocard', meses: [m] }));
  const { w, el, servidor } = await montar({ lancamentos: lancs, arquivos });
  assert.match(txt(el.querySelector('#gsHero')), /R\$ 1\.020/, '3 × (40 + 300); o pagamento da fatura não conta');
  clique(w, el.querySelector('[data-periodo="mes"]'));
  assert.match(txt(el.querySelector('#gsHero')), /Gasto em mar\/2025 R\$ 340/);
  clique(w, el.querySelector('[data-acao="mes-ant"]'));
  assert.match(txt(el.querySelector('.gs-nav-t')), /fev\/2025/);
  assert.match(txt(el.querySelector('#gsRec')), /NETFLIX\.COM/);
  // recategorizar o boleto -> regra
  const sel = [...el.querySelectorAll('#gsLanc select[data-recat]')].find((s) => s.closest('tr').textContent.includes('ALGO INVENTADO'));
  sel.value = 'moradia';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  await ate(() => servidor.regrasSalvas.length === 1);
  assert.deepEqual(servidor.regrasSalvas[0], { padrao: 'PAGAMENTO DE BOLETO · ALGO INVENTADO', categoria: 'moradia' });
  assert.match(txt(el.querySelector('#gsCats')), /Moradia e contas/);
  // documentos: OuroCard completo até o mês passado (mar/25)
  assert.match(txt(el.querySelector('#gsDocs')), /OuroCard.*completo/);
  // filtro "não é gasto" mostra o pagamento da fatura
  const f = el.querySelector('#gsFiltroCat');
  f.value = '__nao';
  f.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.match(txt(el.querySelector('#gsLanc')), /Pagamento de fatura/);
});

// 03/10/2026 (revisão do pedido "Escolher período" em TODOS os filtros dos gráficos)
test('Gastos: chip "Escolher período" no filtro; intervalo personalizado recorta pelo dia e some a navegação de mês', async () => {
  const lancs = [];
  ['2025-01', '2025-02', '2025-03'].forEach((m) => {
    lancs.push({ mes: m, data: `${m}-05`, origem: 'cartao', fonte: 'ourocard', descricao: 'NETFLIX.COM', categoria: 'assinaturas', valor: 40, tipo: 'compra', parcela: '', arquivo: `a${m}` });
    lancs.push({ mes: m, data: `${m}-20`, origem: 'cartao', fonte: 'ourocard', descricao: 'MERCADO INVENTADO', categoria: 'mercado', valor: 200, tipo: 'compra', parcela: '', arquivo: `a${m}` });
  });
  const arquivos = ['2025-01', '2025-02', '2025-03'].map((m) => ({ id: `a${m}`, fonte: 'ourocard', meses: [m] }));
  const { el, doc } = await montar({ lancamentos: lancs, arquivos });
  const tabs = el.querySelector('#gsFiltros .gs-periodos');
  assert.match(txt(tabs), /Escolher período/);
  const { ligarFiltroPeriodo } = await import('../assets/js/periodo-personalizado.js');
  const ctl = ligarFiltroPeriodo(doc, tabs); // idempotente: devolve o controlador da tela
  ctl.definir({ inicio: '2025-02-10', fim: '2025-03-06' });
  assert.match(txt(el.querySelector('#gsHero')), /Gasto de 10\/02\/2025 a 06\/03\/2025 R\$ 240/, 'mercado de 20/02 + netflix de 05/03');
  assert.equal(el.querySelector('.gs-nav-mes'), null);
  assert.match(txt(el.querySelector('#gsLancHint')), /^2 no período/);
  ctl.definir('tudo');
  assert.match(txt(el.querySelector('#gsHero')), /R\$ 720/);
  assert.ok(el.querySelector('.gs-nav-mes'));
});
