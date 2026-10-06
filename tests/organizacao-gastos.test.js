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
  const servidor = { lancamentos: [...lancamentos], arquivos: [...arquivos], regras: [], salvos: [], regrasSalvas: [], excluidos: [], fontesEncerradas: [], drive: [{ id: 'd1', nome: '03-2025.pdf', caminho: 'Cartão de Crédito/Nubank/2025', banco: 'Nubank', origem: 'cartao', importado: false }] };
  const api = {
    getGastos: async () => ({ ok: true, lancamentos: JSON.parse(JSON.stringify(servidor.lancamentos)), arquivos: servidor.arquivos, regras: servidor.regras, fontesEncerradas: servidor.fontesEncerradas }),
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
    excluirArquivosGastos: async (ids) => { servidor.excluidos.push([...ids]); servidor.arquivos = servidor.arquivos.filter((a) => !ids.includes(a.id)); return { ok: true, removidos: ids.length }; },
    salvarFontesGastos: async (lista) => { servidor.fontesEncerradas = [...lista]; return { ok: true, fontesEncerradas: [...lista] }; },
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

// 03/10/2026 (Tiago: "se eu for reimportar o que faltou, não reimportar o que
// já deu sucesso"): falha fica marcada; "Tentar de novo só os que falharam"
// lê só ela; "Importar novos" não insiste nela; nada duplica.
test('Gastos: falha fica "com problema", "Tentar de novo só os que falharam" relê só ela, sem duplicar', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="g"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const w = dom.window;
  const { montarSecaoGastos, EVENTO_ARQUIVOS_GASTOS } = await import('../assets/js/pages/organizacao-gastos.js');
  const sv = { lancs: [], arqs: {}, lidos: [] };
  const drive = [
    { id: 'd1', nome: '03-2025.pdf', caminho: 'Cartão de Crédito/Nubank/2025', banco: 'Nubank', origem: 'cartao', modificado: 'm1' },
    { id: 'd2', nome: '04-2025.pdf', caminho: 'Cartão de Crédito/Nubank/2025', banco: 'Nubank', origem: 'cartao', modificado: 'm2' },
  ];
  let d2Conserta = false;
  const api = {
    getGastos: async () => ({ ok: true, lancamentos: JSON.parse(JSON.stringify(sv.lancs)), arquivos: Object.values(sv.arqs), regras: [] }),
    getArquivosGastos: async () => ({ ok: true, configurado: true, arquivos: drive.map((a) => { const r = sv.arqs[a.id]; return { ...a, importado: !!r && r.situacao !== 'erro', alterado: false, situacao: r ? r.situacao : '', problema: r ? r.problema : '' }; }) }),
    getArquivoGastos: async (id) => ({ ok: true, id, base64: Buffer.from(id).toString('base64'), modificado: drive.find((a) => a.id === id).modificado }),
    salvarImportacaoGastos: async (arquivo, lancs) => {
      sv.lancs = sv.lancs.filter((l) => l.arquivo !== arquivo.id);
      if (arquivo.situacao !== 'erro') sv.lancs.push(...lancs.map((l) => ({ ...l, arquivo: arquivo.id })));
      sv.arqs[arquivo.id] = { id: arquivo.id, nome: arquivo.nome, caminho: arquivo.caminho, fonte: arquivo.fonte, meses: arquivo.meses || [], conferencia: arquivo.conferencia, situacao: arquivo.situacao, problema: arquivo.problema };
      return { ok: true, gravados: arquivo.situacao === 'erro' ? 0 : lancs.length, pulados: 0, ignoradasDuplicadas: arquivo.id === 'd2' && arquivo.situacao !== 'erro' ? 1 : 0 };
    },
    salvarRegraGastos: async () => ({ ok: true, regras: [] }), excluirArquivoGastos: async () => ({ ok: true }),
  };
  const secao = montarSecaoGastos(doc.getElementById('g'), {
    api, hoje: '2025-05-05', storage: memoria(), carregarPdf: async () => ({}),
    lerPdf: async (_lib, bytes) => {
      const id = Buffer.from(bytes).toString();
      sv.lidos.push(id);
      if (id === 'd2' && !d2Conserta) return ['um pdf que não é fatura'];
      return id === 'd2' ? FATURA.map((l) => l.replace('10 MAR 2025', '10 ABR 2025')) : FATURA;
    },
  });
  await secao.pronto;
  const el = doc.getElementById('g');
  await ate(() => el.querySelector('[data-acao="importar-novos"]'));
  clique(w, el.querySelector('[data-acao="importar-novos"]'));
  await ate(() => /Importação concluída/.test(txt(el.querySelector('#gsPainel'))));
  assert.deepEqual(sv.lidos, ['d1', 'd2']);
  assert.match(txt(el.querySelector('.gs-log')), /04-2025\.pdf.*Não achei a data de vencimento/);
  assert.equal(sv.arqs.d2.situacao, 'erro', 'a falha fica registrada');
  assert.equal(sv.lancs.filter((l) => l.arquivo === 'd2').length, 0);
  await ate(() => el.querySelector('#gsPainel [data-acao="importar-falhos"]'));
  assert.match(txt(el.querySelector('#gsPainel')), /Tentar de novo o que falhou/);
  assert.match(txt(el.querySelector('#gsDocs')), /Não entraram \(1\).*04-2025\.pdf.*Não achei a data/); // 07/10/2026: "Não entraram" (o parcial fica à parte)
  // "Importar novos" não relê nada (d1 entrou, d2 está "com problema")
  await secao.importarNovos();
  assert.deepEqual(sv.lidos, ['d1', 'd2']);
  // tentar de novo: só o d2
  d2Conserta = true;
  clique(w, el.querySelector('#gsPainel [data-acao="importar-falhos"]'));
  await ate(() => /Importação concluída: 1 de 1/.test(txt(el.querySelector('#gsPainel'))));
  assert.deepEqual(sv.lidos, ['d1', 'd2', 'd2']);
  assert.equal(sv.arqs.d2.situacao, 'ok');
  assert.match(txt(el.querySelector('.gs-log')), /1 linha já estava na planilha e foi ignorada/, '06/10/2026: texto humano das duplicadas');
  assert.equal(sv.lancs.filter((l) => l.arquivo === 'd1').length, 2, 'o que já tinha entrado não duplicou');
  assert.equal(sv.lancs.filter((l) => l.arquivo === 'd2').length, 2);
  // arquivos mandados por outro painel (evento no document) entram pelo mesmo leitor
  const ev = new w.CustomEvent(EVENTO_ARQUIVOS_GASTOS, { detail: { arquivos: [{ name: 'fatura.pdf', size: 2, conteudo: new Uint8Array(Buffer.from('d1')) }] } });
  doc.dispatchEvent(ev);
  assert.equal(ev.detail.recebido, true);
  await ate(() => sv.lidos.length === 4);
  await ate(() => /fatura\.pdf/.test(txt(el.querySelector('.gs-log'))));
  assert.ok(sv.arqs['upload:fatura.pdf:2'], 'gravado como upload');
});

test('Gastos (A-25): arquivo com "soma não bate" marca o mês (cobertura e tile) e oferece reprocessar só ele', async () => {
  const { mesesComAviso, arquivoComAviso, htmlDocumentos, htmlHero } = await import('../assets/js/pages/organizacao-gastos.js');
  const { coberturaDocumentos } = await import('../assets/js/pages/gastos-calc.js');
  const arquivos = [
    { id: 'a1', nome: '02-2025.pdf', fonte: 'ourocard', meses: ['2025-02'], situacao: 'aviso', conferencia: { ok: false, diferenca: 12.5 }, problema: '' },
    { id: 'a2', nome: '03-2025.pdf', fonte: 'ourocard', meses: ['2025-03'], situacao: 'ok', conferencia: { ok: true, diferenca: 0 } },
    { id: 'upload:x', nome: 'x.pdf', fonte: 'ourocard', meses: ['2025-01'], situacao: 'aviso', conferencia: { ok: false, diferenca: 1 } },
  ];
  assert.equal(arquivoComAviso(arquivos[0]), true);
  assert.equal(arquivoComAviso(arquivos[1]), false);
  assert.deepEqual(Object.keys(mesesComAviso(arquivos)).sort(), ['2025-01', '2025-02']);
  const r = { arquivos, cobertura: coberturaDocumentos(arquivos, new Date('2025-04-05T12:00:00Z')) };
  const html = htmlDocumentos(r, {});
  assert.match(html, /gs-cel aviso/);
  assert.match(html, /data-acao="reprocessar-arq" data-id="a1"/);
  assert.doesNotMatch(html, /data-acao="reprocessar-arq" data-id="upload:x"/, 'upload do computador não tem como reprocessar');
  const hero = htmlHero({ vazio: false, arquivos, mesRef: '2025-02', total: 0, cartao: 0, conta: 0, media: 0, media6: 0, media12: 0, mesesValidos: 1, porMes: [], recorrentes: [], doMes: { total: 0 }, intervalo: { inicio: '2025-02', fim: '2025-02' }, periodo: 'mes' });
  assert.match(hero, /entrada parcial em 1 arquivo/); // 07/10/2026: parcial, não alerta
  assert.doesNotMatch(htmlHero({ vazio: false, arquivos, mesRef: '2025-03', total: 0, cartao: 0, conta: 0, media: 0, media6: 0, media12: 0, mesesValidos: 1, porMes: [], recorrentes: [], doMes: { total: 0 }, intervalo: { inicio: '2025-03', fim: '2025-03' }, periodo: 'mes' }), /entrada parcial/);
});

// 07/10/2026 (Tiago: "dê opção de remover vários de uma vez"; OuroCard cancelado): seleção + confirmar + 1 chamada; "encerrei"
test('Gastos: "Remover selecionados" pede confirmação e remove os marcados numa chamada; "encerrei" salva e redesenha', async () => {
  const parcial = (id, mes) => ({ id, nome: `${id}.pdf`, caminho: 'Cartão de Crédito/OuroCard/2024', fonte: 'ourocard', meses: [mes], situacao: 'aviso', conferencia: { ok: false, diferenca: 5 }, problema: 'soma não bate' });
  const { w, el, doc, servidor } = await montar({
    arquivos: [parcial('p1', '2024-05'), parcial('p2', '2024-06'), parcial('p3', '2024-07')],
    lancamentos: [{ mes: '2024-05', data: '2024-05-03', origem: 'cartao', fonte: 'ourocard', descricao: 'LOJA INVENTADA', categoria: 'compras', valor: 10, tipo: 'compra', parcela: '', arquivo: 'p1' }],
  });
  await ate(() => el.querySelector('[data-grupo="parciais"]'));
  const grupo = el.querySelector('[data-grupo="parciais"]');
  const btn = grupo.querySelector('[data-acao="remover-sel"]');
  assert.equal(btn.disabled, true, 'nada marcado');
  const marcar = (c) => { c.checked = true; c.dispatchEvent(new w.Event('change', { bubbles: true })); };
  marcar(grupo.querySelector('.gs-sel-arq[value="p1"]'));
  marcar(grupo.querySelector('.gs-sel-arq[value="p3"]'));
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, 'Remover 2 selecionados');
  assert.equal(grupo.querySelector('.gs-sel-todos').indeterminate, true);
  clique(w, btn);
  await ate(() => doc.querySelector('.dialogo'));
  assert.match(doc.querySelector('.dialogo').textContent, /Remover 2 arquivos\?/);
  [...doc.querySelectorAll('.dialogo button')].find((b) => b.textContent.trim() === 'Remover').click();
  await ate(() => servidor.excluidos.length === 1);
  assert.deepEqual(servidor.excluidos, [['p1', 'p3']], 'uma chamada só');
  await ate(() => !el.querySelector('.gs-sel-arq[value="p1"]'));
  assert.ok(el.querySelector('[data-grupo="parciais"] .gs-sel-arq[value="p2"]'));
  // "encerrei" no OuroCard
  const enc = el.querySelector('[data-acao="fonte-encerrar"][data-fonte="ourocard"]');
  assert.equal(enc.dataset.encerrada, '1');
  clique(w, enc);
  await ate(() => servidor.fontesEncerradas.length === 1);
  assert.deepEqual(servidor.fontesEncerradas, ['ourocard']);
  await ate(() => el.querySelector('[data-acao="fonte-encerrar"][data-fonte="ourocard"][data-encerrada="0"]'));
  assert.match(el.querySelector('.gs-encerrada').textContent, /encerrado/);
});
