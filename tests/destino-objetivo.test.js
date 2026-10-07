// tests/destino-objetivo.test.js - 07/10/2026: terceiro destino da Renda Fixa, "Reservado para objetivos" (lado do navegador).
// Helper único, distribuição por visão, balanço, aportes, Carteiras › Renda Fixa e detalhe do ativo. Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  destinoRendaFixa, ehObjetivoRf, ehEmergencialRf, ativoRfObjetivo, ativoRfEmergencial,
  DESTINOS_RENDA_FIXA, ROTULO_DESTINO_RF, TEXTO_COLUNA_B_DESTINO_RF,
} from '../assets/js/destino-renda-fixa.js';
import { calcularDistribuicaoPorClasse, calcularDistribuicaoObjetivos } from '../assets/js/pages/inicio-calc.js';
import { balanco } from '../assets/js/pages/patrimonio-calc.js';
import { marcaRf } from '../assets/js/pages/aportes-calc.js';
import { resolverVinculos, alocarMetas } from '../assets/js/pages/metas-calc.js';
import { montarPaginaCarteirasRendaFixa } from '../assets/js/pages/carteiras-renda-fixa.js';
import { usarMemoriaNoCacheDados } from '../assets/js/cache-dados.js';

test('helper: Renda Emergencial / Objetivo (e variações sem acento ou maiúscula) / o resto', () => {
  assert.equal(destinoRendaFixa('Renda Emergencial'), 'emergencial');
  assert.equal(destinoRendaFixa('  renda   EMERGENCIAL '), 'emergencial');
  ['Objetivo', 'objetivos', 'RESERVADO', 'Reservado para objetivos', 'reservado para objetivo', 'Meta', 'metas', ' Objetivo '].forEach((t) => assert.equal(destinoRendaFixa(t), 'objetivo', t));
  ['Renda Fixa', '', null, undefined, 'Longo prazo', 'Reserva', 'Objetivo da vida'].forEach((t) => assert.equal(destinoRendaFixa(t), 'longo-prazo', String(t)));
  // aceita os 3 tokens que o servidor manda
  DESTINOS_RENDA_FIXA.forEach((d) => assert.equal(destinoRendaFixa(d), d));
  assert.equal(ehObjetivoRf('Objetivo'), true);
  assert.equal(ehEmergencialRf('Renda Emergencial'), true);
  assert.equal(ativoRfObjetivo({ classe: 'rf', marca: 'objetivo' }), true);
  assert.equal(ativoRfObjetivo({ classe: 'acoes', marca: 'objetivo' }), false);
  assert.equal(ativoRfEmergencial({ classe: 'rf', marca: 'emergencial' }), true);
  assert.equal(ROTULO_DESTINO_RF.objetivo, 'Reservado para objetivos');
  assert.equal(TEXTO_COLUNA_B_DESTINO_RF.objetivo, 'Objetivo');
  // o que o site escreve na coluna B volta como o mesmo destino
  DESTINOS_RENDA_FIXA.forEach((d) => assert.equal(destinoRendaFixa(TEXTO_COLUNA_B_DESTINO_RF[d]), d));
});

const ATIVOS = [
  { id: 'a1', nome: 'AAAA3', classe: 'acoes', precoAtual: 100, quantidade: 100 },
  { id: 'r1', nome: 'Selic 2031', classe: 'rf', marca: 'longo-prazo', tipoInvestimento: 'Tesouro Selic', valorAtualizado: 8000 },
  { id: 'r2', nome: 'Selic 2029', classe: 'rf', marca: 'emergencial', tipoInvestimento: 'Tesouro Selic', valorAtualizado: 5000 },
  { id: 'r3', nome: 'Fundo DI', classe: 'rf', marca: 'objetivo', tipoInvestimento: 'Fundo DI', valorAtualizado: 30000 },
  { id: 'r4', nome: 'CDB', classe: 'rf', marca: 'objetivo', tipoInvestimento: 'CDB', valorAtualizado: 2000 },
];

test('distribuição: o título objetivo entra no total, mas sai da visão de longo prazo (excluirEmergencial) e tem a própria divisão', () => {
  const soma = (l) => l.reduce((s, x) => s + x.valor, 0);
  assert.equal(soma(calcularDistribuicaoPorClasse(ATIVOS)), 55000, 'total com tudo');
  const longo = calcularDistribuicaoPorClasse(ATIVOS, { excluirEmergencial: true });
  assert.equal(soma(longo), 18000, 'longo prazo: ações + RF de longo prazo (sem emergencial nem objetivo)');
  const ob = calcularDistribuicaoObjetivos(ATIVOS);
  assert.deepEqual(ob, [{ label: 'Fundo DI', valor: 30000 }, { label: 'CDB', valor: 2000 }]);
  assert.deepEqual(calcularDistribuicaoObjetivos([ATIVOS[0], ATIVOS[1]]), [], 'sem objetivo: vazio');
});

test('balanço: "Reservado para objetivos" é linha própria e entra no patrimônio, fora de "Investimentos"', () => {
  const b = balanco({ hoje: '2026-10-07', config: {}, investimentos: { longoPrazo: 100000, reserva: 20000, objetivos: 32000 } });
  const ids = b.ativos.map((a) => a.id);
  assert.deepEqual(ids, ['investimentos', 'reserva', 'objetivos']);
  assert.equal(b.ativos.find((a) => a.id === 'objetivos').nome, 'Reservado para objetivos');
  assert.equal(b.ativos.find((a) => a.id === 'investimentos').valor, 100000);
  assert.equal(b.totalAtivos, 152000);
  const sem = balanco({ hoje: '2026-10-07', config: {}, investimentos: { longoPrazo: 100000, reserva: 20000 } });
  assert.ok(!sem.ativos.some((a) => a.id === 'objetivos'), 'sem objetivo, nenhuma linha extra');
});

test('aportes: marcaRf usa o helper (categoria crua da coluna B ou o destino pronto)', () => {
  assert.equal(marcaRf({ categoria: 'Objetivo' }), 'objetivo');
  assert.equal(marcaRf({ destino: 'objetivo', categoria: 'Renda Fixa' }), 'objetivo');
  assert.equal(marcaRf({ categoria: 'Renda Emergencial' }), 'emergencial');
  assert.equal(marcaRf({ categoria: 'Renda Fixa' }), 'longo-prazo');
  assert.equal(marcaRf(null), 'longo-prazo');
});

test('metas: classe rf e longo-prazo não pegam o objetivo; marca objetivo e vínculo direto pegam', () => {
  const ativos = [
    { id: 'rf:A|X@longo-prazo', ref: 'rf:A|X', nome: 'A', classe: 'rf', marca: 'longo-prazo', valorBRL: 12000 },
    { id: 'rf:F|X@objetivo', ref: 'rf:F|X', nome: 'F', classe: 'rf', marca: 'objetivo', valorBRL: 30000 },
  ];
  const tot = (v) => resolverVinculos(v, ativos, {}).total;
  assert.equal(tot([{ tipo: 'classe', classe: 'rf', modo: 'total' }]), 12000);
  assert.equal(tot([{ tipo: 'marca', marca: 'longo-prazo', modo: 'total' }]), 12000);
  assert.equal(tot([{ tipo: 'marca', marca: 'objetivo', modo: 'total' }]), 30000);
  assert.equal(tot([{ tipo: 'ativo', id: 'rf:F|X@objetivo', modo: 'total' }]), 30000);
  const metas = [
    { id: 'apo', tipo: 'aposentadoria', vinculos: [{ tipo: 'classe', classe: 'rf', modo: 'total' }] },
    { id: 'cha', tipo: 'juntarAteData', vinculos: [{ tipo: 'marca', marca: 'objetivo', modo: 'total' }] },
  ];
  const aloc = alocarMetas(metas, ativos, {});
  const v = (id) => resolverVinculos(metas.find((m) => m.id === id).vinculos, ativos, {}, { ocupado: aloc.ocupadoPorMeta[id] }).total;
  assert.equal(v('cha'), 30000, 'a aposentadoria não rouba da chácara');
  assert.equal(v('apo'), 12000);
});

// ---- Carteiras › Renda Fixa com o terceiro grupo ----
function makeDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="carteiras-loading" id="rendaFixaLoading"></div><div class="carteiras-erro" id="rendaFixaErro" hidden></div>
    <div id="refreshControlRendaFixa" class="refresh-control"></div><div id="rendaFixaConteudo" hidden></div></body></html>`);
  dom.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  return dom.window.document;
}
const ativoRf = (cod, nome, tipoCarteira, atual, inv) => ({
  codigo: cod, nomePersonalizado: nome, tipoInvestimento: 'CDB', indexador: 'CDI', instituicao: 'Banco X', tipoCarteira, quantidade: 1, vencimento: '03/2030',
  totalInvestido: inv, totalAtualizado: atual,
  rentabilidadeContratada: { indice: 'CDI', numeroDeLotes: 1, texto: '100% do CDI' },
  irSeResgatasseHoje: { impostoSeResgatasseHoje: 100, valorLiquidoSeResgatasseHoje: atual - 100, precisao: 'exata', detalhes: null },
});
const carteira = (ativos) => ({
  resumo: { totalInvestido: 0, totalAtualizado: ativos.reduce((s, a) => s + a.totalAtualizado, 0), lucroPrejuizo: 0, percentualLucroPrejuizo: 0, quantidadeAtivos: ativos.length },
  benchmarks: { cdi: 0.134, selic: 0.125, ipca: 0.045 }, distribuicaoPorIndexador: [{ grupo: 'CDI', totalAtualizado: 1, percentual: 1 }], ativos,
});

test('Carteiras › Renda Fixa: com título "objetivo" aparece o terceiro grupo/filtro; sem ele, só os dois de sempre', async () => {
  usarMemoriaNoCacheDados();
  const rodar = async (ativos) => {
    const doc = makeDom();
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl: async () => ({ ok: true, carteira: carteira(ativos) }), getHomeImpl: async () => ({ ok: true, historico: [] }) });
    return doc;
  };
  const com = await rodar([ativoRf('A', 'CDB Longo', 'longo-prazo', 40000, 30000), ativoRf('B', 'Selic Reserva', 'emergencial', 20000, 19000), ativoRf('C', 'Fundo DI Chácara', 'objetivo', 30000, 28000)]);
  const html = com.getElementById('rendaFixaConteudo').innerHTML;
  assert.match(html, /Reservado para objetivos/);
  const linha = [...com.querySelectorAll('.cc-tabela tbody tr')].find((tr) => tr.textContent.includes('Fundo DI Chácara'));
  assert.ok(linha, 'o título aparece na tabela');
  assert.match(linha.textContent, /Objetivos/, 'chip do destino na linha');
  assert.match(linha.textContent, /29\.900,00/, 'valor líquido de IR (IR estimado como nos outros)');
  const chips = [...com.querySelectorAll('[data-grupo]')].map((c) => c.textContent.trim());
  assert.ok(chips.some((t) => /Reservado para objetivos/.test(t)), `chip de filtro: ${JSON.stringify(chips)}`);
  const sem = await rodar([ativoRf('A', 'CDB Longo', 'longo-prazo', 40000, 30000), ativoRf('B', 'Selic Reserva', 'emergencial', 20000, 19000)]);
  assert.ok(!/Reservado para objetivos/.test(sem.getElementById('rendaFixaConteudo').innerHTML), 'sem título objetivo, nada novo na tela');
});

test('Detalhe do ativo (RF): mostra o destino com as 3 opções, o atual marcado, e a dica do fundo DI', async () => {
  const { indicadoresHtml } = await import('../assets/js/pages/ativo.js');
  const html = indicadoresHtml({ ehRf: true, ativo: { classe: 'rf', nome: 'Fundo DI', nomePersonalizado: 'Fundo DI', instituicao: 'XP', tipoCarteira: 'objetivo', tipoInvestimento: 'CDB' } });
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const sel = doc.querySelector('select[data-destino-rf]');
  assert.ok(sel, 'select do destino');
  assert.deepEqual([...sel.options].map((o) => o.value), ['emergencial', 'longo-prazo', 'objetivo']);
  assert.equal(sel.value, 'objetivo');
  assert.equal(sel.dataset.titulo, 'Fundo DI');
  assert.match(html, /Reservado para objetivos/);
  assert.match(html, /% do CDI/);
});
