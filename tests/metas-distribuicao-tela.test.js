// tests/metas-distribuicao-tela.test.js - 06/10/2026: a meta "Distribuição da carteira" dentro da tela Metas e Objetivos
// (assets/js/pages/metas.js) montada em JSDOM com API falsa: card na lista (fora dos totais), detalhe com os 4 grupos,
// assistente (pesos, soma 100%, sem passo de investimentos) e salvar. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaMetas, TEMPLATE_METAS } from '../assets/js/pages/metas.js';
import { pesosPadraoDistribuicao } from '../assets/js/pages/metas-distribuicao.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const DIST = { id: 'd1', tipo: 'distribuicaoCarteira', nome: 'Distribuição da carteira', status: 'ativa', especificos: { pesos: pesosPadraoDistribuicao() }, vinculos: [] };
const ATUAL = {
  objetivos: {
    alocacaoGeral: { tipos: [{ tipo: 'Ações Nacionais e Internacionais', carteiraAtual: 5500 }, { tipo: 'FIIs', carteiraAtual: 3600 }, { tipo: 'Renda Fixa', carteiraAtual: 500 }] },
    alocacaoRendaFixa: { tipos: [{ tipo: 'Renda Emergencial', carteiraAtual: 6000 }, { tipo: 'Renda Fixa', carteiraAtual: 500 }] },
  },
  splitsInternos: {
    acoes: { itens: [{ tipo: 'Dividendos', carteiraAtual: 3000 }, { tipo: 'Ações Internacionais', carteiraAtual: 2500 }] },
    fiis: { itens: [{ tipo: 'Tijolo', carteiraAtual: 1500 }, { tipo: 'Papel', carteiraAtual: 1100 }, { tipo: 'Híbrido', carteiraAtual: 1000 }] },
  },
};
const BASE = { ok: true, hoje: '2026-10-06', arquivadas: [], ativos: [], cambio: {}, referencias: {}, proventos12m: {}, distribuicaoAtual: ATUAL };
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const digitar = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const espera = () => new Promise((r) => setTimeout(r, 0));

async function montar(metas = [DIST]) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="metas"><main>${TEMPLATE_METAS}</main></body></html>`, { url: 'https://exemplo.test/metas.html', pretendToBeVisual: true });
  const w = dom.window; const doc = w.document;
  let servidor = { ...clone(BASE), metas: clone(metas) };
  const salvas = [];
  await montarPaginaMetas('tk', {
    doc, win: w, usarCache: false,
    getMetasImpl: async () => clone(servidor),
    salvarMetaImpl: async (_t, meta) => { salvas.push(clone(meta)); const m = { ...clone(meta), id: meta.id || 'novo1' }; servidor = { ...servidor, metas: [m] }; return { ok: true, id: m.id, meta: m }; },
    excluirMetaImpl: async () => ({ ok: true }), getMetasHistoricoImpl: async () => ({ ok: true, hoje: '2026-10-06', metas: {}, indices: [] }),
    excluirDefinitivoImpl: async () => ({ ok: true }), carregarDadosViagemImpl: async () => ({ paises: [], cidades: null, taxas: null }),
  });
  await espera();
  return { doc, w, salvas };
}

test('lista: a distribuição aparece como card (aporte e linhas), fora dos totais "Metas ativas"', async () => {
  const meta2 = { id: 'm2', tipo: 'casa', nome: 'Casa Teste', status: 'ativa', moeda: 'BRL', valorAlvo: 100000, dataAlvo: '2030-10', aporteMensal: 500, especificos: { valorImovel: 100000, entradaPct: 1, custosPct: 0 }, vinculos: [], itens: [] };
  const { doc } = await montar([DIST, meta2]);
  const tela = doc.getElementById('mtTela');
  const card = tela.querySelector('.md-card');
  assert.ok(card, 'card da distribuição');
  assert.match(card.textContent, /1\.400,00/);
  assert.match(card.textContent, /faltam R\$\s*800,00/);
  assert.match(tela.querySelector('.mt-resumo').textContent, /Metas ativas\s*1\b/, 'conta só a Casa');
});

test('só a distribuição cadastrada: segue o convite pra criar uma meta de verdade e os totais não aparecem', async () => {
  const { doc } = await montar([DIST]);
  const tela = doc.getElementById('mtTela');
  assert.ok(tela.querySelector('.md-card'));
  assert.equal(tela.querySelector('.mt-resumo'), null);
  assert.match(tela.textContent, /Comece por uma meta/);
});

test('detalhe: os 4 grupos; Editar pesos -> soma errada bloqueia o Continuar; corrigida, pula Investimentos e salva os pesos', async () => {
  const { doc, w, salvas } = await montar([DIST]);
  clique(w, doc.querySelector('.md-card'));
  await espera();
  assert.equal(doc.querySelectorAll('.md-grupo-bloco').length, 4);
  clique(w, doc.querySelector('[data-editar]'));
  await espera();
  const campo = doc.querySelector('[data-campo="especificos.pesos.grupos.acoes"]');
  digitar(w, campo, '45');
  assert.equal(doc.querySelector('[data-dist-soma="grupos"]').textContent, '95%');
  clique(w, doc.querySelector('[data-proximo]'));
  assert.match(doc.getElementById('mtPrevia').textContent, /precisam somar 100%/);
  assert.ok(doc.querySelector('[data-campo="especificos.pesos.grupos.acoes"]'), 'continua no passo Dados');
  digitar(w, campo, '50,5'); digitar(w, doc.querySelector('[data-campo="especificos.pesos.grupos.fiis"]'), '39,5');
  clique(w, doc.querySelector('[data-proximo]'));
  assert.ok(doc.querySelector('.mt-revisar'), 'foi direto pra Revisar (sem passo de investimentos)');
  clique(w, doc.querySelector('[data-salvar]'));
  await espera(); await espera();
  assert.equal(salvas.length, 1);
  assert.equal(salvas[0].tipo, 'distribuicaoCarteira');
  assert.equal(salvas[0].id, 'd1');
  assert.equal(salvas[0].especificos.pesos.grupos.acoes, 0.505);
  assert.equal(salvas[0].especificos.pesos.grupos.fiis, 0.395);
});

test('Nova meta: o tile "Distribuição da carteira" existe; com a meta já cadastrada, abre ela em vez de duplicar', async () => {
  const { doc, w, salvas } = await montar([DIST]);
  clique(w, doc.getElementById('mtNova'));
  await espera();
  const tile = doc.querySelector('[data-tipo="distribuicaoCarteira"]');
  assert.ok(tile);
  assert.match(tile.textContent, /já tem essa meta/);
  clique(w, tile);
  await espera();
  assert.ok(doc.querySelector('.md-detalhe'), 'abriu o detalhe da existente');
  assert.equal(salvas.length, 0);
});

test('Nova meta sem nenhuma distribuição: o assistente abre com os pesos padrão e salva sem id', async () => {
  const { doc, w, salvas } = await montar([]);
  clique(w, doc.getElementById('mtNova'));
  await espera();
  clique(w, doc.querySelector('[data-tipo="distribuicaoCarteira"]'));
  await espera();
  assert.equal(doc.querySelector('[data-campo="especificos.pesos.fiis.papel"]').value, '30');
  clique(w, doc.querySelector('[data-proximo]'));
  await espera();
  clique(w, doc.querySelector('[data-salvar]'));
  await espera(); await espera();
  assert.equal(salvas.length, 1);
  assert.equal(salvas[0].id, undefined);
  assert.equal(salvas[0].especificos.pesos.rf.emergencial, 0.9);
});
