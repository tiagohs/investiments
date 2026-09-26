// tests/organizacao.test.js
//
// 26/09/2026: tela Organização Financeira - contas (organizacao-calc.js) e a
// página montada num DOM de verdade (JSDOM): rascunho com simulador, adicionar,
// remover/desfazer, categorias sugeridas, salvar (payload) e conflito.
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  categoriaSugerida, lerValorBR, mensalDespesa, calcularOrganizacao, rascunhoDoServidor, novoItemDespesa, estadoItem,
  mudancasRascunho, validarRascunho, payloadRascunho, impactoRascunho,
} from '../assets/js/pages/organizacao-calc.js';

const DADOS = {
  ok: true,
  despesas: {
    folga: 0.1,
    itens: [
      { linha: 7, nome: 'Aluguel Teste', valor: 1000, comFolga: 1100, categoria: 'Moradia', frequencia: 'Mensal' },
      { linha: 8, nome: 'Mercado Teste', valor: 500, comFolga: 550, categoria: '', frequencia: 'Mensal' },
      { linha: 9, nome: 'Seguro Teste', valor: 1200, comFolga: 110, categoria: '', frequencia: 'Anual' },
    ],
    totalReal: 1600, totalComFolga: 1760, linhaTotal: 10,
  },
  reserva: { mediaGastos: 1760, meses: 6, base: 10560, sobra: 0.1, meta: 11616, atual: 10000 },
  salario: { liquido: 5000, percentualInvestir: 0.2, aporte: 1000 },
  patrimonio: { extra: 1000, reinvestimento: 0.25, rendimento: 0.06, desejado: 690000, atual: 50000, rendaDesejada: 3450 },
  historico: [],
  assinatura: 'ass-1',
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const ctx = (d) => ({ reserva: d.reserva, salario: d.salario, patrimonio: d.patrimonio });
const perto = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

// --- contas -----------------------------------------------------------------

test('organizacao-calc: valor BR, mensal (anual/12), custo de vida, meta, cobertura, salário e patrimônio desejado', () => {
  assert.equal(lerValorBR('4.260,00'), 4260);
  assert.equal(lerValorBR('R$ 1.234,5'), 1234.5);
  assert.equal(lerValorBR('4260.5'), 4260.5);
  assert.equal(lerValorBR('1.200'), 1200);
  assert.equal(lerValorBR(''), null);
  assert.equal(lerValorBR('abc'), null);
  assert.equal(mensalDespesa({ valor: 1200, frequencia: 'Anual' }), 100);

  const c = calcularOrganizacao(rascunhoDoServidor(DADOS), ctx(DADOS));
  assert.ok(perto(c.totalReal, 1600));
  assert.ok(perto(c.totalComFolga, 1760));
  assert.ok(perto(c.base, 10560));
  assert.ok(perto(c.meta, 11616));
  assert.ok(perto(c.falta, 1616));
  assert.ok(perto(c.cobertura, 10000 / 1760));
  assert.ok(perto(c.coberturaReal, 10000 / 1600));
  assert.equal(c.metaAtingida, false);
  assert.ok(perto(c.margemTotal, 0.21));
  // salário usa o gasto real: 5000 - 1600 - 1000 = 2400
  assert.ok(perto(c.salario.livre, 2400));
  assert.ok(perto(c.salario.pctEssenciais, 0.32));
  // (1760 + 1000) × 1,25 × 12 / 0,06
  assert.ok(perto(c.patrimonioDesejado, 690000));
  assert.deepEqual(c.porCategoria.map((p) => [p.categoria, p.valor]), [['Moradia', 1000], ['Sem categoria', 600]]);
});

test('organizacao-calc: categoria sugerida pelo nome (ordem das regras importa)', () => {
  assert.equal(categoriaSugerida('Uber Assinatura'), 'Assinaturas');
  assert.equal(categoriaSugerida('Uber'), 'Transporte');
  assert.equal(categoriaSugerida('Parcela Apartamento'), 'Moradia');
  assert.equal(categoriaSugerida('Parcela do carro'), 'Dívidas e parcelas');
  assert.equal(categoriaSugerida('Streaming (Loja X)'), 'Assinaturas');
  assert.equal(categoriaSugerida('Supermercado'), 'Alimentação');
  assert.equal(categoriaSugerida('Água'), 'Contas da casa');
  assert.equal(categoriaSugerida('Gasolina'), 'Transporte');
  assert.equal(categoriaSugerida('Coisa sem regra'), '');
});

test('organizacao-calc: rascunho - estados, mudanças, validação, payload e impacto', () => {
  const r = rascunhoDoServidor(DADOS);
  assert.equal(mudancasRascunho(r).total, 0);
  r.itens[0].valor = 1100;
  r.itens[2].removida = true;
  r.itens.push(novoItemDespesa({ nome: 'Academia Teste', valor: 100 }));
  r.meses = 8;
  assert.deepEqual(r.itens.map(estadoItem), ['editada', '', 'removida', 'nova']);
  const m = mudancasRascunho(r);
  assert.deepEqual([m.novas, m.editadas, m.removidas, m.parametros, m.total], [1, 1, 1, ['meses'], 4]);
  assert.deepEqual(validarRascunho(r), []);
  const p = payloadRascunho(r);
  assert.deepEqual(p.itens.map((i) => i.nome), ['Aluguel Teste', 'Mercado Teste', 'Academia Teste']);
  assert.equal(p.meses, 8);
  assert.equal(p.assinatura, 'ass-1');
  const imp = impactoRascunho(calcularOrganizacao(rascunhoDoServidor(DADOS), ctx(DADOS)), calcularOrganizacao(r, ctx(DADOS)));
  // real: 1100 + 500 + 100 = 1700 (era 1600) -> com folga +110
  assert.ok(perto(imp.totalComFolga, 110));
  assert.ok(perto(imp.meta, 1870 * 8 * 1.1 - 11616));

  const ruim = rascunhoDoServidor(DADOS);
  ruim.itens[0].nome = ' ';
  ruim.itens[1].valor = NaN;
  ruim.itens.push(novoItemDespesa({ nome: 'aluguel teste', valor: 1 }));
  ruim.folga = 2;
  const erros = validarRascunho(ruim);
  assert.ok(erros.some((e) => /sem nome/.test(e)));
  assert.ok(erros.some((e) => /Valor inválido/.test(e)));
  assert.ok(erros.some((e) => /Folga/.test(e)));
  const dup = rascunhoDoServidor(DADOS);
  dup.itens.push(novoItemDespesa({ nome: 'Aluguel teste', valor: 1 }));
  assert.ok(validarRascunho(dup).some((e) => /repetido/.test(e)));
});

// --- página -----------------------------------------------------------------

function montarDom() {
  const dom = new JSDOM(`<!doctype html><html><body data-section="organizacao">
    <div id="refreshControlOrganizacao"></div>
    <div id="organizacaoLoading"></div><div id="organizacaoErro" hidden></div><div id="organizacaoConteudo" hidden></div></body></html>`,
  { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  globalThis.localStorage = dom.window.localStorage;
  dom.window.localStorage.clear();
  return { dom, doc: dom.window.document, w: dom.window };
}
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const digitar = (w, el, valor, tipo = 'input') => { el.value = valor; el.dispatchEvent(new w.Event(tipo, { bubbles: true })); };
// texto como a gente lê: um espaço entre elementos (textContent cola "LivreR$ 2.400,00")
const txt = (el) => {
  const partes = [];
  const tw = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  // centavos (<span class="dec">) e o "/mês" (<small>) grudam no número, como na tela
  return partes.join(' ').replace(/ (,\d{2})(?!\d)/g, '$1').replace(/ \/mês/g, '/mês');
};

async function montar({ salvarImpl, getImpl } = {}) {
  const { dom, doc, w } = montarDom();
  const { montarPaginaOrganizacao } = await import('../assets/js/pages/organizacao.js');
  const chamadas = [];
  let servidor = clone(DADOS);
  const pagina = await montarPaginaOrganizacao('tk', {
    doc,
    refresh: false,
    getDespesasImpl: getImpl || (async () => clone(servidor)),
    salvarDespesasImpl: salvarImpl || (async (_t, p) => {
      chamadas.push(clone(p));
      servidor = {
        ...clone(servidor),
        despesas: { ...servidor.despesas, itens: p.itens.map((i, k) => ({ ...i, linha: 7 + k })) },
        reserva: { ...servidor.reserva, meses: p.meses },
        historico: [{ data: '2026-09-26T10:00:00Z', totalComFolga: 1760, totalReal: 1600 }, { data: '2026-09-26T10:00:01Z', totalComFolga: 1870, totalReal: 1700 }],
        assinatura: 'ass-2',
      };
      return { ...clone(servidor), ok: true };
    }),
  });
  return { dom, doc, w, chamadas, pagina };
}

test('Organização: monta topo (custo de vida, meta, cobertura), a conta da meta, a lista e a lateral', async () => {
  const { doc } = await montar();
  assert.equal(doc.getElementById('organizacaoLoading').hidden, true);
  assert.equal(doc.getElementById('organizacaoConteudo').hidden, false);
  const hero = doc.getElementById('ogHero');
  assert.match(txt(hero.querySelector('.og-tile-custo')), /R\$ 1\.760,00\/mês/);
  assert.match(txt(hero.querySelector('.og-tile-meta')), /R\$ 11\.616,00/);
  assert.match(txt(hero.querySelector('.og-tile-meta')), /86% da meta/);
  assert.match(txt(hero.querySelector('.og-tile-meta')), /faltam R\$ 1\.616,00/);
  assert.match(txt(hero.querySelector('.og-tile-cobertura')), /5,7 meses/);
  assert.match(txt(doc.getElementById('ogConta')), /21,0%/, 'mostra as duas margens juntas');
  assert.equal(doc.querySelectorAll('#ogLista .og-item').length, 3);
  assert.match(txt(doc.querySelector('#ogLista .og-item:nth-child(3) .og-mes')), /R\$ 110,00.*R\$ 100,00\/mês real/, 'anual vira /12');
  assert.match(txt(doc.getElementById('ogCategorias')), /Sem categoria/);
  assert.match(txt(doc.getElementById('ogSalario')), /Livre R\$ 2\.400,00/);
  assert.match(txt(doc.getElementById('ogHistorico')), /primeira vez que você salvar/);
  assert.equal(doc.getElementById('ogBarra').hidden, true, 'sem rascunho, sem barra');
});

test('Organização: editar um valor mexe no topo na hora (simulador) e abre a barra com o impacto; ↺ volta', async () => {
  const { doc, w } = await montar();
  const valor = doc.querySelector('#ogLista .og-item:nth-child(1) .og-valor');
  digitar(w, valor, '1.100,00');
  assert.match(txt(doc.getElementById('ogHero').querySelector('.og-tile-custo')), /R\$ 1\.870,00\/mês.*era R\$ 1\.760,00/);
  const barra = doc.getElementById('ogBarra');
  assert.equal(barra.hidden, false);
  assert.match(txt(barra), /1 alteração/);
  assert.match(txt(barra), /Custo de vida \+R\$ 110,00\/mês/);
  assert.match(txt(barra), /Meta da reserva \+R\$ 726,00/);
  assert.ok(doc.querySelector('#ogLista .og-item:nth-child(1)').classList.contains('editada'));
  clique(w, doc.querySelector('#ogLista .og-item:nth-child(1) .og-restaurar'));
  assert.equal(doc.getElementById('ogBarra').hidden, true);
});

test('Organização: adicionar, remover/desfazer, categorizar tudo e mudar os meses; salvar manda a lista inteira e redesenha', async () => {
  const { doc, w, chamadas } = await montar();
  clique(w, doc.getElementById('ogAdicionar'));
  const nova = doc.querySelector('#ogLista .og-item.nova');
  assert.ok(nova);
  assert.equal(doc.activeElement, nova.querySelector('.og-nome'), 'foco no nome da despesa nova');
  digitar(w, nova.querySelector('.og-nome'), 'Academia Teste');
  digitar(w, nova.querySelector('.og-valor'), '100');
  assert.match(txt(doc.getElementById('ogBarra')), /1 nova/);

  clique(w, doc.querySelector('#ogLista .og-item:nth-child(3) .og-remover'));
  assert.ok(doc.querySelector('#ogLista .og-item:nth-child(3)').classList.contains('removida'));
  clique(w, doc.querySelector('#ogLista .og-item:nth-child(3) .og-desfazer'));
  assert.ok(!doc.querySelector('#ogLista .og-item:nth-child(3)').classList.contains('removida'));
  clique(w, doc.querySelector('#ogLista .og-item:nth-child(3) .og-remover'));

  const cat = doc.getElementById('ogCategorizar');
  assert.equal(cat.hidden, false);
  clique(w, cat);
  assert.equal(doc.querySelector('#ogLista .og-item:nth-child(2) .og-cat').value, 'Alimentação');

  digitar(w, doc.getElementById('ogMeses'), '8');
  assert.match(txt(doc.getElementById('ogBarra')), /meses/);

  clique(w, doc.querySelector('#ogBarra [data-acao="salvar"]'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chamadas.length, 1);
  assert.deepEqual(chamadas[0].itens.map((i) => [i.nome, i.valor, i.categoria]), [
    ['Aluguel Teste', 1000, 'Moradia'], ['Mercado Teste', 500, 'Alimentação'], ['Academia Teste', 100, 'Saúde'],
  ]);
  assert.equal(chamadas[0].meses, 8);
  assert.equal(chamadas[0].assinatura, 'ass-1');
  assert.match(txt(doc.getElementById('ogBarra')), /Salvo na planilha/);
  assert.equal(doc.querySelectorAll('#ogLista .og-item.nova, #ogLista .og-item.editada, #ogLista .og-item.removida').length, 0);
  assert.ok(doc.querySelector('#ogHistorico svg'), 'com 2 pontos a linha do tempo aparece');
});

test('Organização: nome vazio trava o Salvar; conflito (planilha mudou) pede descartar e recarregar', async () => {
  const { doc, w } = await montar({ salvarImpl: async () => ({ ok: false, conflito: true, erro: 'mudou' }) });
  digitar(w, doc.querySelector('#ogLista .og-item:nth-child(1) .og-nome'), '');
  assert.equal(doc.querySelector('#ogBarra [data-acao="salvar"]').disabled, true);
  assert.match(txt(doc.getElementById('ogBarra')), /sem nome/);
  digitar(w, doc.querySelector('#ogLista .og-item:nth-child(1) .og-nome'), 'Aluguel Novo');
  clique(w, doc.querySelector('#ogBarra [data-acao="salvar"]'));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(txt(doc.getElementById('ogBarra')), /planilha mudou/);
  assert.match(txt(doc.querySelector('#ogBarra [data-acao="descartar"]')), /Descartar e recarregar/);
  clique(w, doc.querySelector('#ogBarra [data-acao="descartar"]'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(doc.querySelector('#ogLista .og-item:nth-child(1) .og-nome').value, 'Aluguel Teste');
  assert.equal(doc.getElementById('ogBarra').hidden, true);
});

test('Organização: ordenar por categoria agrupa com subtotal; erro ao carregar mostra a mensagem', async () => {
  const { doc, w } = await montar();
  clique(w, doc.querySelector('#ogOrdem [data-ordem="categoria"]'));
  const grupos = [...doc.querySelectorAll('#ogLista .og-grupo')].map((g) => txt(g));
  assert.equal(grupos.length, 2);
  assert.match(grupos[0], /Moradia R\$ 1\.000,00/);
  assert.match(grupos[1], /Sem categoria/);

  const r = await montar({ getImpl: async () => ({ ok: false, etapa: 'despesas', erro: 'aba não encontrada' }) });
  assert.equal(r.doc.getElementById('organizacaoErro').hidden, false);
  assert.match(r.doc.getElementById('organizacaoErro').textContent, /aba não encontrada/);
});
