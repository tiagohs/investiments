// tests/metas-distribuicao.test.js - 06/10/2026: meta "Distribuição da carteira" (assets/js/pages/metas-distribuicao.js).
// Cálculo puro (atual x meta, faltam R$, aporte pra rebalancear), validação de 100% por grupo, HTML do card/detalhe/assistente
// e a integração no tipo de metas (metas-calc). Dados inventados (o repositório é público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  TIPO_DISTRIBUICAO, ehMetaDistribuicao, pesosPadraoDistribuicao, pesosDaMeta, validarPesos, atuaisDeResposta, pesosDeResposta,
  calcularDistribuicao, statusDistribuicao, blocosDeDistribuicao, cardDistribuicaoHtml, detalheDistribuicaoHtml,
  passoDadosDistribuicaoHtml, atualizarSomasDistribuicao, erroPassoDistribuicao, revisarDistribuicaoHtml, fmtPct,
} from '../assets/js/pages/metas-distribuicao.js';
import { TIPOS_META, metaPadrao, calcularMeta } from '../assets/js/pages/metas-calc.js';

const RESP = {
  objetivos: {
    alocacaoGeral: { tipos: [
      { tipo: 'Ações Nacionais e Internacionais', percentualDesejado: 0.5, carteiraAtual: 5500 },
      { tipo: 'FIIs', percentualDesejado: 0.4, carteiraAtual: 3600 },
      { tipo: 'Renda Fixa', percentualDesejado: 0.1, carteiraAtual: 500 },
    ] },
    alocacaoRendaFixa: { tipos: [
      { tipo: 'Renda Emergencial', percentualDesejado: 0.9, carteiraAtual: 6000 },
      { tipo: 'Renda Fixa', percentualDesejado: 0.1, carteiraAtual: 500 },
    ] },
  },
  splitsInternos: {
    acoes: { itens: [
      { tipo: 'Dividendos', percentualDesejado: 0.6, carteiraAtual: 3000 },
      { tipo: 'Ações Internacionais', percentualDesejado: 0.4, carteiraAtual: 2500 },
    ] },
    fiis: { itens: [
      { tipo: 'Tijolo', percentualDesejado: 0.4, carteiraAtual: 1500 },
      { tipo: 'Papel', percentualDesejado: 0.3, carteiraAtual: 1100 },
      { tipo: 'Híbrido', percentualDesejado: 0.3, carteiraAtual: 1000 },
    ] },
  },
};

test('pesos padrão somam 100% em cada grupo e a validação acusa o grupo que não fecha', () => {
  const p = pesosPadraoDistribuicao();
  assert.equal(validarPesos(p).ok, true);
  p.fiis.papel = 0.2; // 40+30+20 = 90%
  const v = validarPesos(p);
  assert.equal(v.ok, false);
  assert.match(v.mensagem, /FIIs.*100%.*90%/);
  assert.equal(v.grupos.find((g) => g.id === 'fiis').ok, false);
  assert.equal(v.grupos.find((g) => g.id === 'acoes').ok, true);
});

test('soma com arredondamento (33,33 + 33,33 + 33,34) é aceita; 99% não', () => {
  const p = pesosPadraoDistribuicao();
  p.grupos = { acoes: 0.3333, fiis: 0.3333, rf: 0.3334 };
  assert.equal(validarPesos(p).ok, true);
  p.grupos = { acoes: 0.33, fiis: 0.33, rf: 0.33 };
  assert.equal(validarPesos(p).ok, false);
});

test('atuaisDeResposta lê os R$ atuais pelo rótulo ("Dividendos" = Nacionais) e pesosDeResposta lê os % da planilha', () => {
  const a = atuaisDeResposta(RESP);
  assert.deepEqual(a.grupos, { acoes: 5500, fiis: 3600, rf: 500 });
  assert.deepEqual(a.acoes, { nacionais: 3000, internacionais: 2500 });
  assert.deepEqual(a.fiis, { tijolo: 1500, papel: 1100, hibrido: 1000 });
  assert.deepEqual(a.rf, { emergencial: 6000, rendaFixa: 500 });
  assert.equal(a.temDados, true);
  const p = pesosDeResposta(RESP);
  assert.deepEqual(p.fiis, { tijolo: 0.4, papel: 0.3, hibrido: 0.3 });
  assert.equal(atuaisDeResposta(null).temDados, false);
});

test('calcularDistribuicao: o tipo mais "cheio" define a carteira alvo; faltam R$ só pra comprar; aporte total = soma dos faltam', () => {
  const d = calcularDistribuicao(pesosPadraoDistribuicao(), atuaisDeResposta(RESP));
  const g = d.grupos[0];
  // ações 5500 / 50% = 11000 (maior) -> carteira alvo 11000: fiis 4400 (faltam 800), rf 1100 (faltam 600)
  assert.equal(g.novoTotal, 11000);
  assert.deepEqual(g.itens.map((i) => i.faltam), [0, 800, 600]);
  assert.equal(g.aporte, 1400);
  assert.equal(d.aporteTotal, 1400);
  assert.equal(d.totalInvestido, 9600);
  assert.equal(g.itens[0].naMeta, true);
  assert.equal(d.naMeta, false);
  assert.ok(Math.abs(g.itens[0].pctAtual - 5500 / 9600) < 1e-9);
  // ações: nacionais 3000/60% = 5000; internacionais precisa de 2000 -> faltam 0 (2500 já passa)... alvo = max(3000/.6, 2500/.4) = 6250
  const ac = d.grupos[1];
  assert.equal(ac.novoTotal, 6250);
  assert.deepEqual(ac.itens.map((i) => i.faltam), [750, 0]);
});

test('na meta quando todos batem; sem dados não inventa aporte; status segue as cores do site (verde / amarelo / cinza)', () => {
  const certo = { grupos: { acoes: 500, fiis: 400, rf: 100 }, acoes: { nacionais: 300, internacionais: 200 }, fiis: { tijolo: 160, hibrido: 120, papel: 120 }, rf: { emergencial: 90, rendaFixa: 10 } };
  const d = calcularDistribuicao(pesosPadraoDistribuicao(), certo);
  assert.equal(d.naMeta, true);
  assert.equal(d.aporteTotal, 0);
  assert.deepEqual(statusDistribuicao(d), { id: 'na-meta', rotulo: 'Na meta', classe: 'good' });
  assert.equal(statusDistribuicao(calcularDistribuicao(pesosPadraoDistribuicao(), {})).id, 'sem-dados');
  // quase lá: falta menos de 5% da carteira alvo
  const quase = calcularDistribuicao(pesosPadraoDistribuicao(), { ...certo, grupos: { acoes: 500, fiis: 390, rf: 100 } });
  assert.equal(statusDistribuicao(quase).classe, 'warn');
  // longe: cinza (nunca vermelho)
  const longe = calcularDistribuicao(pesosPadraoDistribuicao(), { ...certo, grupos: { acoes: 500, fiis: 100, rf: 10 } });
  assert.equal(statusDistribuicao(longe).classe, 'na');
});

test('blocosDeDistribuicao devolve os blocos no formato de criarBlocoObjetivo (4 grupos, tipos com cor e valorInvestir)', () => {
  const blocos = blocosDeDistribuicao(calcularDistribuicao(pesosPadraoDistribuicao(), atuaisDeResposta(RESP)));
  assert.deepEqual(blocos.map((b) => b.blocoId), ['grupos', 'acoes', 'fiis', 'rf']);
  assert.equal(blocos[0].tipos[1].valorInvestir, 800);
  assert.equal(blocos[0].total.novaCarteira, 11000);
  assert.deepEqual(blocos[1].tipos.map((t) => t.tipo), ['Nacionais', 'Internacionais']);
});

test('card da lista: botão data-abrir com status, aporte e as linhas "na meta"/"faltam R$"; sem dados não quebra', () => {
  const meta = { id: 'abc', tipo: TIPO_DISTRIBUICAO, nome: 'Distribuição da carteira', especificos: { pesos: pesosPadraoDistribuicao() } };
  const dist = calcularDistribuicao(pesosDaMeta(meta), atuaisDeResposta(RESP));
  const html = cardDistribuicaoHtml(meta, dist);
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('button.mt-card').dataset.abrir, 'abc');
  assert.match(doc.body.textContent, /\+ R\$\s*1\.400,00/);
  assert.match(doc.body.textContent, /na meta/);
  assert.match(doc.body.textContent, /faltam R\$\s*800,00/);
  assert.equal(doc.querySelectorAll('.md-linha').length, 3);
  assert.match(cardDistribuicaoHtml(meta, calcularDistribuicao(pesosDaMeta(meta), {})), /ainda não chegaram/);
});

test('detalhe: os 4 grupos, botões Editar/Arquivar (data-*) e, arquivada, Restaurar/Excluir', () => {
  const meta = { id: 'abc', tipo: TIPO_DISTRIBUICAO, nome: 'Minha distribuição', especificos: { pesos: pesosPadraoDistribuicao() } };
  const dist = calcularDistribuicao(pesosDaMeta(meta), atuaisDeResposta(RESP));
  const doc = new JSDOM(detalheDistribuicaoHtml(meta, dist)).window.document;
  assert.equal(doc.querySelectorAll('.md-grupo-bloco').length, 4);
  assert.ok(doc.querySelector('[data-editar]') && doc.querySelector('[data-arquivar]') && doc.querySelector('[data-voltar]'));
  const arq = new JSDOM(detalheDistribuicaoHtml(meta, dist, { arquivada: true })).window.document;
  assert.ok(arq.querySelector('[data-restaurar]') && arq.querySelector('[data-excluir-definitivo]'));
  assert.equal(arq.querySelector('[data-editar]'), null);
});

test('assistente: 11 campos de peso (caminho especificos.pesos.<grupo>.<tipo>), soma ao vivo e mensagem de erro', () => {
  const meta = { tipo: TIPO_DISTRIBUICAO, nome: 'D', especificos: { pesos: pesosPadraoDistribuicao() } };
  const doc = new JSDOM(`<body>${passoDadosDistribuicaoHtml(meta)}</body>`).window.document;
  const campos = [...doc.querySelectorAll('input[data-campo^="especificos.pesos."]')];
  assert.equal(campos.length, 3 + 2 + 3 + 2);
  assert.ok(campos.every((c) => c.dataset.formato === 'pct'));
  assert.equal(doc.querySelector('[data-campo="especificos.pesos.fiis.tijolo"]').value, '40');
  assert.equal(erroPassoDistribuicao(meta), null);
  meta.especificos.pesos.grupos.acoes = 0.45;
  const v = atualizarSomasDistribuicao(doc.body, meta);
  assert.equal(v.ok, false);
  assert.equal(doc.querySelector('[data-dist-soma="grupos"]').textContent, '95%');
  assert.ok(doc.querySelector('[data-dist-soma="grupos"]').classList.contains('ruim'));
  assert.match(erroPassoDistribuicao(meta), /Ações, FIIs e Renda Fixa.*100%/);
  assert.match(erroPassoDistribuicao({ ...meta, nome: ' ' }), /nome/);
});

test('revisar mostra os pesos e o aporte; fmtPct usa vírgula e só 1 casa quando precisa', () => {
  const meta = { tipo: TIPO_DISTRIBUICAO, nome: 'D', especificos: { pesos: pesosPadraoDistribuicao() } };
  const html = revisarDistribuicaoHtml(meta, calcularDistribuicao(pesosDaMeta(meta), atuaisDeResposta(RESP)));
  assert.match(html, /Ações 50%/);
  assert.match(html, /Aporte pra rebalancear hoje/);
  assert.equal(fmtPct(0.3333), '33,3%');
  assert.equal(fmtPct(0.55), '55%');
  assert.equal(fmtPct(null), '—');
});

test('tipo no mapa de metas: metaPadrao tem os pesos padrão, calcularMeta não quebra (sem alvo em R$) e ehMetaDistribuicao reconhece', () => {
  assert.equal(TIPOS_META.distribuicaoCarteira.nome, 'Distribuição da carteira');
  const m = metaPadrao(TIPO_DISTRIBUICAO, { hoje: '2026-10-06' });
  assert.equal(m.nome, 'Distribuição da carteira');
  assert.equal(validarPesos(pesosDaMeta(m)).ok, true);
  assert.equal(ehMetaDistribuicao(m), true);
  assert.equal(ehMetaDistribuicao({ tipo: 'casa' }), false);
  const c = calcularMeta({ ...m, id: 'x' }, { ativos: [], cambio: {}, referencias: {}, hoje: '2026-10-06' });
  assert.equal(c.alvoBRL, null);
  assert.equal(c.vinculos.length, 0);
});
