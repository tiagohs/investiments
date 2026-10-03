// Testes do motor de rentabilidade do card de Análise (03/10/2026 - Tiago:
// "Nas análises dos gráficos e métricas dos ativos, considere essas fontes
// [vídeos de rentabilidade]. Tenha um largo banco de dados de critérios...").
// Cobre a base (assets/js/criterios/base-rentabilidade.js), as métricas
// puras e as regras com `classe` de assets/js/analise-grafico.js - tudo com
// séries INVENTADAS (nenhum dado real).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  analisarSerie, htmlAnalise, renderAnalise, volatilidadeAnual, calcularDrawdown, calcularTir, calcularPme,
  regressaoLinear, calcularSharpeSortino, analisarRendaPassiva, complementarAnalise, proventosAReceberDe, descreverPrazo,
} from '../assets/js/analise-grafico.js';
import {
  CRITERIOS, REGRAS, REFERENCIAS, BENCHMARK_POR_CLASSE, PRAZOS_MINIMOS, criterio, familiaDaClasse, limites, classificar,
  mesesParaJulgar, fontesDosCriterios, preencherFrase,
} from '../assets/js/criterios/base-rentabilidade.js';

// ---------------------------------------------------------------------------
// séries inventadas
// ---------------------------------------------------------------------------

/** n dias corridos a partir de `inicio` (todos pregão). */
function datas(n, inicio = '2024-01-01') {
  const [a, m, d] = inicio.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10));
}
/** Ruído determinístico (média ~0). */
const ruido = (i, amp = 0.01) => amp * Math.sin(i * 1.7 + 0.3) * Math.cos(i * 0.37);
/** Nível (começa em 100) a partir de uma taxa ao ano + ruído diário. */
function nivel(ds, aa, amp = 0, fase = 0) {
  const g = (1 + aa) ** (1 / 365) - 1;
  let v = 100;
  return ds.map((data, i) => { if (i > 0) v *= 1 + g + ruido(i + fase, amp); return { data, valor: v }; });
}
/** Mesma série em % acumulado (formato `retorno`). */
const emRetorno = (l) => l.map((p) => ({ data: p.data, retorno: (p.valor / l[0].valor - 1) * 100 }));
const ponto = (a, tipo) => a.pontos.find((p) => p.tipo === tipo);
const tipos = (a) => a.pontos.map((p) => p.tipo).join(',');
const perto = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// Base de critérios
// ---------------------------------------------------------------------------

test('base: 48 critérios e 22 regras, ids únicos, campos do esquema e fontes com link', () => {
  assert.equal(CRITERIOS.length, 48);
  assert.equal(REGRAS.length, 22);
  const ids = [...CRITERIOS, ...REGRAS].map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  for (const c of CRITERIOS) {
    for (const campo of ['id', 'nome', 'grupo', 'classes', 'direcao', 'faixas', 'prazoMinimo', 'peso', 'porQue', 'armadilha', 'frases', 'fontes', 'curto']) {
      assert.ok(c[campo] != null && c[campo] !== '', `${c.id}: falta ${campo}`);
    }
    assert.ok(['maior', 'menor', 'proximo', 'info'].includes(c.direcao), `${c.id}: direção ${c.direcao}`);
    assert.ok(c.peso >= 1 && c.peso <= 3, `${c.id}: peso`);
    assert.ok(Array.isArray(c.classes) && c.classes.length, `${c.id}: classes`);
    assert.ok(c.faixas.padrao && ['bom', 'neutro', 'atencao', 'ruim'].every((k) => k in c.faixas.padrao), `${c.id}: faixas`);
    if (c.limites) Object.values(c.limites).forEach((l) => assert.equal(l.length, 3, `${c.id}: limites [bom, neutro, atencao]`));
  }
  for (const r of REGRAS) assert.ok(r.condicao && r.frase && ['bom', 'neutro', 'atencao'].includes(r.tom), `${r.id}`);
  for (const c of [...CRITERIOS, ...REGRAS]) {
    assert.ok(c.fontes.length >= 1, `${c.id}: sem fonte`);
    c.fontes.forEach((f) => assert.match(f.url, /^https:\/\//, `${c.id}: ${f.url}`));
  }
  // Suno e os 2 vídeos estão na base
  const urls = [...CRITERIOS, ...REGRAS].flatMap((c) => c.fontes.map((f) => f.url));
  assert.ok(urls.some((u) => /suno\.com\.br/.test(u)));
  assert.ok(urls.includes('https://www.youtube.com/watch?v=by0skE9uM-c'));
  assert.ok(urls.includes('https://www.youtube.com/watch?v=Km6Y7kJ6GcA'));
  assert.ok(REFERENCIAS.ref_benchmarks_por_classe && REFERENCIAS.ref_prazos_minimos);
});

test('base: benchmark e prazo mínimo por classe', () => {
  assert.equal(BENCHMARK_POR_CLASSE.fiis.principal, 'IFIX');
  assert.equal(BENCHMARK_POR_CLASSE.acoes.principal, 'Ibovespa');
  assert.match(BENCHMARK_POR_CLASSE.eua.principal, /S&P 500 em R\$/);
  assert.equal(BENCHMARK_POR_CLASSE.rf.principal, 'CDI');
  assert.deepEqual(PRAZOS_MINIMOS.acoes, [0, 12, 36]);
  assert.equal(mesesParaJulgar('fiis'), 12);
  assert.equal(mesesParaJulgar('reserva'), 3);
  assert.equal(mesesParaJulgar('rf-ipca'), 24);
  assert.equal(mesesParaJulgar('rf-pos'), 6);
  assert.equal(mesesParaJulgar('inexistente'), 12);
});

test('base: familiaDaClasse, limites com fallback e classificar nas faixas', () => {
  assert.equal(familiaDaClasse('ativo-fii'), 'fiis');
  assert.equal(familiaDaClasse('ativo-acao'), 'acoes');
  assert.equal(familiaDaClasse('ativo-eua'), 'eua');
  assert.equal(familiaDaClasse('ativo-rf', 'ipca'), 'rf-ipca');
  assert.equal(familiaDaClasse('rf', 'pos'), 'rf-pos');
  assert.equal(familiaDaClasse('rf'), 'rf');
  assert.deepEqual(limites('excesso_vs_benchmark', 'acoes'), [3, -3, -8]);
  assert.deepEqual(limites('excesso_vs_benchmark', 'outra'), [2, -2, -5], 'cai no padrão');
  assert.deepEqual(limites('pme_benchmark_equivalente', 'rf-pos'), [1, 0.995, 0.98], 'rf-pos cai em rf');
  // excesso de −2,5 p.p. em 12 meses: normal em ações (±3), atenção em FIIs (±2)
  assert.equal(classificar('excesso_vs_benchmark', -2.5, 'acoes'), 'neutro');
  assert.equal(classificar('excesso_vs_benchmark', -2.5, 'fiis'), 'atencao');
  assert.equal(classificar('excesso_vs_benchmark', 4, 'acoes'), 'bom');
  assert.equal(classificar('excesso_vs_benchmark', -9, 'acoes'), 'ruim');
  // % do CDI: reserva exige ~100%
  assert.equal(classificar('pct_cdi', 98, 'reserva'), 'neutro');
  assert.equal(classificar('pct_cdi', 85, 'reserva'), 'ruim');
  assert.equal(classificar('pct_cdi', 85, 'carteira'), 'atencao');
  // direção "menor": volatilidade
  assert.equal(classificar('volatilidade_anualizada', 0.3, 'reserva'), 'bom');
  assert.equal(classificar('volatilidade_anualizada', 3, 'reserva'), 'ruim');
  assert.equal(classificar('sharpe', Number.NaN, 'padrao'), null);
  assert.equal(classificar('retorno_twr_cota', 1, 'padrao'), null, 'sem limites numéricos');
});

test('base: frases com placeholders e fontes sem repetir', () => {
  assert.equal(preencherFrase('{nome} rendeu {r} {periodo}', { nome: 'X', r: '+1%' }), 'X rendeu +1% {periodo}');
  const f = fontesDosCriterios(['excesso_vs_benchmark', 'pct_cdi', 'inexistente']);
  assert.equal(new Set(f.map((x) => x.url)).size, f.length);
  assert.ok(f.length >= 3);
  assert.equal(criterio('sharpe').curto, 'Sharpe');
  assert.equal(criterio('nao-existe'), undefined);
});

// ---------------------------------------------------------------------------
// Métricas puras
// ---------------------------------------------------------------------------

test('volatilidadeAnual: desvio dos retornos diários × √252', () => {
  const r = Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.01 : -0.01));
  const m = 0;
  const desvio = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  assert.ok(perto(volatilidadeAnual(r), desvio * Math.sqrt(252)));
  assert.equal(volatilidadeAnual([0.01]), null);
});

test('calcularDrawdown: pico, vale, recuperação e alta necessária pra voltar (−20% pede +25%)', () => {
  const f = [1, 1.1, 1.2, 1.0, 0.96, 1.05, 1.2, 1.25];
  const c = f.map((v, i) => ({ data: `2026-01-${String(i + 1).padStart(2, '0')}`, f: v }));
  const dd = calcularDrawdown(c);
  assert.ok(perto(dd.dd, 0.2));
  assert.equal(dd.pico, 2);
  assert.equal(dd.vale, 4);
  assert.equal(dd.recuperou, 6);
  assert.equal(dd.altaParaVoltar, 0, 'já recuperou');
  const semVolta = calcularDrawdown(c.slice(0, 5));
  assert.equal(semVolta.recuperou, -1);
  assert.ok(perto(semVolta.distancia, 0.2));
  assert.ok(perto(semVolta.altaParaVoltar, 0.25));
});

test('calcularTir: 1 aplicação; aportes em datas diferentes; sem solução', () => {
  // R$ 1.000 que viram R$ 1.100 em 365 dias = 10% ao ano
  assert.ok(perto(calcularTir([{ data: '2025-01-01', valor: 1000 }], 1100, '2026-01-01'), 0.10, 1e-6));
  // R$ 1.000 no início + R$ 1.000 no meio do ano, fim R$ 2.150
  const t = calcularTir([{ data: '2025-01-01', valor: 1000 }, { data: '2025-07-02', valor: 1000 }], 2150, '2026-01-01');
  const vf = 1000 * (1 + t) + 1000 * (1 + t) ** (183 / 365);
  assert.ok(perto(vf, 2150, 1e-4));
  assert.ok(t > 0.09 && t < 0.11);
  // resgate maior que tudo que entrou e valor final positivo: sem raiz
  assert.equal(calcularTir([{ data: '2025-01-01', valor: 1000 }, { data: '2025-02-01', valor: -5000 }], 1000, '2026-01-01'), null);
  assert.equal(calcularTir([], 100, '2026-01-01'), null);
});

test('calcularPme: os mesmos aportes no índice', () => {
  const niveis = { '2025-01-01': 100, '2025-07-01': 120, '2026-01-01': 150 };
  const pme = calcularPme([{ data: '2025-01-01', valor: 1000 }, { data: '2025-07-01', valor: 1200 }], 2400, '2026-01-01', (d) => niveis[d]);
  // 1000 × 1,5 + 1200 × 1,25 = 3000
  assert.ok(perto(pme.vIdx, 3000));
  assert.ok(perto(pme.razao, 0.8));
  assert.ok(perto(pme.dif, -600));
  assert.equal(calcularPme([{ data: '2025-03-01', valor: 1 }], 1, '2026-01-01', (d) => niveis[d]), null, 'índice sem nível na data');
});

test('regressaoLinear e calcularSharpeSortino', () => {
  const x = [0.01, -0.02, 0.03, 0.005, -0.01, 0.02];
  const y = x.map((v) => 0.002 + 1.5 * v);
  const r = regressaoLinear(x, y);
  assert.ok(perto(r.b, 1.5) && perto(r.a, 0.002));
  assert.equal(regressaoLinear([1, 2], [1, 2]), null);
  // carteira que rende exatamente o CDI todo mês: Sharpe 0
  const cdi = Array(12).fill(0.01);
  const igual = calcularSharpeSortino(cdi.map((c, i) => c + (i % 2 ? 0.001 : -0.001)), cdi);
  assert.ok(Math.abs(igual.sharpe) < 0.05);
  // acima do CDI com pouca oscilação: Sharpe alto; Sortino ≥ Sharpe (quase não cai abaixo do CDI)
  const bom = calcularSharpeSortino(cdi.map((c, i) => c + 0.01 + (i % 2 ? 0.004 : -0.004)), cdi);
  assert.ok(bom.sharpe > 1);
  assert.ok(bom.sortino === null || bom.sortino >= bom.sharpe);
  assert.equal(calcularSharpeSortino([0.01, 0.02], [0.01, 0.01]), null, 'menos de 6 meses');
});

test('descreverPrazo: dias, meses e anos', () => {
  assert.equal(descreverPrazo(10), '10 dias');
  assert.equal(descreverPrazo(92), '3 meses');
  assert.equal(descreverPrazo(730), '2 anos');
  assert.equal(descreverPrazo(1279), '3,5 anos');
});

// ---------------------------------------------------------------------------
// Benchmark certo por classe
// ---------------------------------------------------------------------------

test('benchmark por classe: FIIs contra o IFIX, mesmo com o Ibovespa desenhado antes', () => {
  const ds = datas(400);
  const a = analisarSerie({
    serie: emRetorno(nivel(ds, 0.12, 0.003)), periodo: '12m', nome: 'A carteira de FIIs', classe: 'fiis',
    indices: { Ibovespa: emRetorno(nivel(ds, 0.30, 0.01, 5)), IFIX: emRetorno(nivel(ds, 0.11, 0.003, 9)) },
  });
  assert.equal(a.benchmark.nome, 'IFIX');
  assert.match(a.benchmark.porQue, /IFIX/);
  const p = ponto(a, 'comparacao');
  assert.match(p.texto, /acima do IFIX, o índice de referência de FIIs/);
  assert.match(p.texto, /Contra o Ibovespa: .* abaixo/, 'o outro índice desenhado continua no texto');
  assert.ok(a.criterios.includes('excesso_vs_benchmark'));
  assert.equal(a.classe, 'fiis');
});

test('benchmark por classe: ações (Ibovespa), ativo-acao e ativo-fii usam a mesma régua da classe', () => {
  const ds = datas(400);
  const indices = { CDI: emRetorno(nivel(ds, 0.14)), Ibovespa: emRetorno(nivel(ds, 0.15, 0.01, 3)), IFIX: emRetorno(nivel(ds, 0.08, 0.003, 9)) };
  const serie = emRetorno(nivel(ds, 0.2, 0.012));
  assert.equal(analisarSerie({ serie, indices, periodo: '12m', classe: 'acoes' }).benchmark.nome, 'Ibovespa');
  assert.equal(analisarSerie({ serie, indices, periodo: '12m', classe: 'ativo-acao' }).benchmark.nome, 'Ibovespa');
  assert.equal(analisarSerie({ serie, indices, periodo: '12m', classe: 'ativo-fii' }).benchmark.nome, 'IFIX');
  // forçado pelo chamador
  assert.equal(analisarSerie({ serie, indices, periodo: '12m', classe: 'acoes', benchmark: 'IFIX' }).benchmark.nome, 'IFIX');
});

test('benchmark por classe: Ações EUA em reais = S&P 500 × câmbio, com aviso de índice só de preço; com IVVB11, sem aviso', () => {
  const ds = datas(400);
  const sp = nivel(ds, 0.10, 0.008, 2);
  const cambio = ds.map((data, i) => ({ data, valor: 5 * (1 + 0.05 * i / 399) })); // dólar +5%
  const carteira = sp.map((p, i) => ({ data: p.data, valor: p.valor * cambio[i].valor * 1.0003 ** i }));
  const a = analisarSerie({ serie: emRetorno(carteira), indices: { 'S&P 500': emRetorno(sp) }, cambio, periodo: '12m', classe: 'eua', nome: 'A carteira de ações EUA' });
  assert.equal(a.benchmark.nome, 'S&P 500 em R$');
  const p = ponto(a, 'comparacao');
  assert.match(p.texto, /S&P 500 em R\$\snão inclui dividendos/);
  assert.ok(a.criterios.includes('diag_sp_preco') && a.criterios.includes('total_return_consistencia'));
  assert.match(p.texto, /S&P 500 do gráfico \(em dólar, sem o câmbio\)/);
  // efeito câmbio: o dólar subiu ~5%
  const cambioP = ponto(a, 'cambio');
  assert.ok(cambioP, `pontos: ${tipos(a)}`);
  assert.ok(a.metricas.dfx > 0.049 && a.metricas.dfx < 0.051);
  assert.ok(perto(a.metricas.rUsd, (1 + a.metricas.retorno) / (1 + a.metricas.dfx) - 1));
  assert.match(cambioP.texto, /Em dólar, a carteira de ações EUA rendeu/);
  // com o S&P 500 COM dividendos (IVVB11) nas referências: vira o benchmark e o aviso some
  const ivv = sp.map((q, i) => ({ data: q.data, valor: q.valor * cambio[i].valor * (1.013 ** (i / 365)) }));
  const b = analisarSerie({ serie: emRetorno(carteira), indices: { 'S&P 500': emRetorno(sp) }, referencias: { 'S&P 500 com dividendos (IVVB11)': ivv }, cambio, periodo: '12m', classe: 'eua' });
  assert.equal(b.benchmark.nome, 'S&P 500 com dividendos (IVVB11)');
  assert.doesNotMatch(ponto(b, 'comparacao').texto, /não inclui dividendos/);
});

test('benchmark por classe: Ações EUA em dólar = S&P 500 em US$ (sem câmbio)', () => {
  const ds = datas(400);
  const sp = nivel(ds, 0.10, 0.008, 2);
  const a = analisarSerie({ serie: emRetorno(nivel(ds, 0.12, 0.009)), indices: { 'S&P 500': emRetorno(sp) }, periodo: '12m', classe: 'eua', moeda: 'USD' });
  assert.equal(a.benchmark.nome, 'S&P 500');
  assert.equal(ponto(a, 'cambio'), undefined, 'em dólar não há efeito câmbio');
});

test('benchmark por classe: renda fixa contra o CDI (% do CDI); título IPCA+ contra IPCA + taxa contratada', () => {
  const ds = datas(400);
  const cdi = emRetorno(nivel(ds, 0.14));
  const ipca = nivel(ds, 0.045);
  const rf = analisarSerie({ serie: emRetorno(nivel(ds, 0.14 * 1.02)), indices: { CDI: cdi }, periodo: '12m', classe: 'rf', nome: 'A renda fixa' });
  assert.equal(rf.benchmark.nome, 'CDI');
  assert.match(ponto(rf, 'comparacao').texto, /10[12]% do CDI/);
  assert.ok(rf.criterios.includes('pct_cdi'));
  // título IPCA + 6%: a régua é a taxa contratada
  const titulo = analisarSerie({
    serie: emRetorno(nivel(ds, (1.045 * 1.06) - 1, 0.002)), indices: { CDI: cdi, IPCA: emRetorno(ipca) }, periodo: '12m', classe: 'ativo-rf',
    rf: { indexador: 'IPCA', vencimento: '05/2035', taxa: 'IPCA + 6,00%', nome: 'Tesouro IPCA+ 2035' }, nome: 'O título',
  });
  assert.equal(titulo.benchmark.nome, 'IPCA + 6%');
  assert.match(ponto(titulo, 'comparacao').texto, /\(a taxa contratada\)/);
  assert.match(ponto(titulo, 'comparacao').texto, /cedo pra concluir/, 'título IPCA+ só se julga em 24 meses');
});

test('benchmark por classe: carteira com várias classes = carteira de referência pelos pesos de cada dia', () => {
  const ds = datas(400);
  const ibov = nivel(ds, 0.20, 0.01, 1);
  const cdi = nivel(ds, 0.14);
  // 50% ações (rendendo como o Ibovespa) + 50% renda fixa (CDI), sem aportes
  const acoes = ibov.map((p) => ({ data: p.data, valor: 5000 * p.valor / 100, fluxo: 0 }));
  const rendaFixa = cdi.map((p) => ({ data: p.data, valor: 5000 * p.valor / 100, fluxo: 0 }));
  const total = ds.map((data, i) => ({ data, valor: acoes[i].valor + rendaFixa[i].valor, fluxo: 0 }));
  const a = analisarSerie({
    serie: total, periodo: '12m', classe: 'carteira', nome: 'O patrimônio total',
    indices: { CDI: emRetorno(cdi), Ibovespa: emRetorno(ibov) },
    componentes: { 'Ações': acoes, 'Renda Fixa': rendaFixa },
    benchmarkComponentes: { 'Ações': 'Ibovespa', 'Renda Fixa': 'CDI' },
  });
  assert.equal(a.benchmark.nome, 'Carteira de referência');
  const p = ponto(a, 'comparacao');
  assert.match(p.texto, /praticamente igual à carteira de referência: uma carteira passiva com os mesmos pesos \(Ibovespa e CDI\)/);
  assert.ok(Math.abs(a.metricas.excesso) < 0.05, `excesso ${a.metricas.excesso}`);
  assert.ok(a.criterios.includes('benchmark_composto'));
});

test('benchmark por classe: patrimônio contra o IPCA = ganho real', () => {
  const ds = datas(366);
  const a = analisarSerie({ serie: emRetorno(nivel(ds, 0.10)), indices: { IPCA: emRetorno(nivel(ds, 0.04)) }, periodo: '12m', classe: 'patrimonio', nome: 'O patrimônio' });
  const p = ponto(a, 'comparacao');
  assert.match(p.texto, /ganho real de 5,77% \(IPCA de \+4,00%\)/);
  assert.ok(perto(a.metricas.real, 1.10 / 1.04 - 1, 1e-9), 'Fisher (1,10/1,04 − 1 = 5,77%), não subtração (6%)');
});

test('sem classe: funciona como antes (todos os índices, sem destaques nem critérios novos)', () => {
  const ds = datas(30);
  const a = analisarSerie({ serie: emRetorno(nivel(ds, 0.3)), indices: { CDI: emRetorno(nivel(ds, 0.14)) }, periodo: '30d' });
  assert.equal(a.benchmark, null);
  assert.deepEqual(a.destaques, []);
  assert.equal(a.classe, null);
  assert.match(ponto(a, 'comparacao').texto, /% do CDI\)/);
});

// ---------------------------------------------------------------------------
// Prazo mínimo e faixas
// ---------------------------------------------------------------------------

test('prazo: ações bem acima do índice em 3 meses = tom neutro, "cedo pra concluir" e sem % do CDI; em 13 meses = bom', () => {
  const curto = datas(92);
  const a = analisarSerie({
    serie: emRetorno(nivel(curto, 0.6, 0.01)), periodo: '6m', classe: 'acoes', nome: 'A carteira de ações',
    indices: { Ibovespa: emRetorno(nivel(curto, 0.1, 0.01, 4)), CDI: emRetorno(nivel(curto, 0.14)) },
  });
  const p = ponto(a, 'comparacao');
  assert.equal(p.tom, 'neutro');
  assert.match(p.texto, /ainda é cedo pra concluir: nesse prazo, oscilações de ±\d+,\d% são normais para ações brasileiras — compare em 12 meses ou mais/);
  assert.doesNotMatch(p.texto, /% do CDI/);
  assert.match(a.resumo, /\(cedo pra concluir\)/);
  assert.ok(a.criterios.includes('prazo_curto_ruido') && a.criterios.includes('diag_pct_cdi_curto_rv'));
  // descolado do índice em pouco tempo: aviso de risco/concentração
  assert.ok(ponto(a, 'descolamento'), `pontos: ${tipos(a)}`);

  const longo = datas(400);
  const b = analisarSerie({
    serie: emRetorno(nivel(longo, 0.25, 0.01)), periodo: '12m', classe: 'acoes',
    indices: { Ibovespa: emRetorno(nivel(longo, 0.15, 0.01, 4)) },
  });
  assert.equal(ponto(b, 'comparacao').tom, 'bom');
  assert.doesNotMatch(ponto(b, 'comparacao').texto, /cedo pra concluir/);
});

test('prazo: reserva já se julga em 3 meses; renda fixa em 6', () => {
  const ds = datas(120);
  const cdi = emRetorno(nivel(ds, 0.14));
  const reserva = analisarSerie({ serie: emRetorno(nivel(ds, 0.14 * 1.01)), indices: { CDI: cdi }, periodo: '6m', classe: 'reserva', nome: 'A reserva' });
  assert.equal(ponto(reserva, 'comparacao').tom, 'bom');
  assert.equal(ponto(reserva, 'risco').tom, 'bom');
  assert.match(ponto(reserva, 'risco').texto, /sem oscilar — cumpre o papel/);
  const rf = analisarSerie({ serie: emRetorno(nivel(ds, 0.14 * 1.01)), indices: { CDI: cdi }, periodo: '6m', classe: 'rf' });
  assert.equal(ponto(rf, 'comparacao').tom, 'neutro');
  assert.match(ponto(rf, 'comparacao').texto, /compare em 6 meses ou mais/);
});

test('faixas: −2,5 p.p. em 12 meses é normal em ações e atenção em FIIs', () => {
  const ds = datas(366);
  const idx = nivel(ds, 0.12, 0.004, 7);
  const fator = (1 - 0.025 / 1.12);
  const serie = emRetorno(idx.map((p, i) => ({ data: p.data, valor: p.valor * fator ** (i / 365) })));
  const acoes = analisarSerie({ serie, indices: { Ibovespa: emRetorno(idx) }, periodo: '12m', classe: 'acoes' });
  const fiis = analisarSerie({ serie, indices: { IFIX: emRetorno(idx) }, periodo: '12m', classe: 'fiis' });
  assert.ok(acoes.metricas.excesso < -2 && acoes.metricas.excesso > -3, `excesso ${acoes.metricas.excesso}`);
  assert.equal(ponto(acoes, 'comparacao').tom, 'neutro');
  assert.match(ponto(acoes, 'comparacao').texto, /Andar junto com o índice no longo prazo já é um bom resultado/);
  assert.equal(ponto(fiis, 'comparacao').tom, 'atencao');
});

test('faixas: reserva abaixo de 90% do CDI = atenção (produto errado pra reserva)', () => {
  const ds = datas(200);
  const a = analisarSerie({ serie: emRetorno(nivel(ds, 0.14 * 0.8)), indices: { CDI: emRetorno(nivel(ds, 0.14)) }, periodo: '6m', classe: 'reserva', nome: 'A reserva' });
  const r = ponto(a, 'risco');
  assert.equal(r.tom, 'atencao');
  assert.match(r.texto, /Tesouro Selic ou CDB de liquidez diária pagam perto de 100%/);
  assert.equal(a.tom, 'atencao');
});

// ---------------------------------------------------------------------------
// Métricas novas no card
// ---------------------------------------------------------------------------

test('métricas: volatilidade, maior queda vs índice, Sharpe/beta/alfa/consistência só com prazo', () => {
  const ds = datas(1100, '2023-01-01');
  const ibov = nivel(ds, 0.12, 0.012, 3);
  // carteira = 1,2× o Ibovespa dia a dia (beta ~1,2) + um pouco ao ano
  let v = 100;
  const carteira = ds.map((data, i) => { if (i > 0) v *= 1 + 1.2 * (ibov[i].valor / ibov[i - 1].valor - 1) + 0.0001; return { data, valor: v }; });
  const cdi = nivel(ds, 0.12);
  const a = analisarSerie({ serie: emRetorno(carteira), indices: { Ibovespa: emRetorno(ibov), CDI: emRetorno(cdi) }, periodo: '3a', classe: 'acoes', nome: 'A carteira' });
  const m = a.metricas;
  assert.ok(m.vol > 0 && m.volBench > 0 && m.vol / m.volBench > 1.15 && m.vol / m.volBench < 1.25, `vol ${m.vol} x ${m.volBench}`);
  assert.ok(m.beta > 1.1 && m.beta < 1.3, `beta ${m.beta}`);
  assert.ok(Number.isFinite(m.sharpe) && Number.isFinite(m.sharpeBench));
  assert.ok(m.maxDrawdown > 0 && m.mddBench > 0 && m.maxDrawdown > m.mddBench);
  assert.ok(m.mesesComparados >= 30);
  const rotulos = a.destaques.map((d) => d.rotulo);
  for (const r of ['Ao ano', 'Volatilidade', 'Maior queda', 'Sharpe', 'Beta (Ibovespa)', 'Meses acima do Ibovespa']) assert.ok(rotulos.includes(r), `falta ${r}: ${rotulos}`);
  assert.ok(a.destaques.length <= 7);

  // 8 meses: sem Sharpe nem consistência na linha de números
  const curto = datas(240);
  const b = analisarSerie({ serie: emRetorno(nivel(curto, 0.2, 0.01)), indices: { Ibovespa: emRetorno(nivel(curto, 0.1, 0.01, 2)), CDI: emRetorno(nivel(curto, 0.12)) }, periodo: '6m', classe: 'acoes' });
  const rb = b.destaques.map((d) => d.rotulo);
  assert.ok(!rb.includes('Sharpe') && !rb.includes('Meses acima do Ibovespa') && !rb.includes('Ao ano'), `${rb}`);
  assert.ok(rb.includes('Volatilidade'));
});

test('métricas: Sharpe não aparece na renda fixa (oscilação quase zero)', () => {
  const ds = datas(800);
  const a = analisarSerie({ serie: emRetorno(nivel(ds, 0.13, 0.0002)), indices: { CDI: emRetorno(nivel(ds, 0.13)) }, periodo: 'tudo', classe: 'rf' });
  assert.ok(!a.destaques.some((d) => d.rotulo === 'Sharpe'));
});

test('métricas: rentabilidade real como ponto próprio (Fisher) e juro real negativo não é culpa da carteira', () => {
  const ds = datas(400);
  const a = analisarSerie({ serie: emRetorno(nivel(ds, 0.14)), indices: { CDI: emRetorno(nivel(ds, 0.14)) }, referencias: { IPCA: nivel(ds, 0.045) }, periodo: '12m', classe: 'rf', nome: 'A renda fixa' });
  const r = ponto(a, 'real');
  assert.ok(r, `pontos: ${tipos(a)}`);
  assert.ok(a.metricas.real > 0.09 && a.metricas.real < 0.10);
  assert.match(r.texto, /Descontada a inflação \(IPCA de \+4,\d\d% em 12 meses\), a renda fixa ganhou 9,\d\d% de poder de compra/);
  // CDI abaixo da inflação
  const b = analisarSerie({ serie: emRetorno(nivel(ds, 0.03)), indices: { CDI: emRetorno(nivel(ds, 0.03)) }, referencias: { IPCA: nivel(ds, 0.08) }, periodo: '12m', classe: 'reserva', nome: 'A reserva' });
  const rb = ponto(b, 'real');
  assert.ok(rb, `pontos: ${tipos(b)}`);
  assert.equal(rb.tom, 'neutro');
  assert.match(rb.texto, /O próprio CDI ficou abaixo da inflação no período: juro real negativo, não erro de escolha/);
});

test('métricas: TIR com os fluxos e "mesmos aportes no índice" (PME)', () => {
  const ds = datas(500);
  const ibov = nivel(ds, 0.10, 0.006, 3);
  // aportes de R$ 1.000 a cada 30 dias numa carteira que rende como o índice + 6% a.a.
  let cotas = 0;
  const serie = ds.map((data, i) => {
    const preco = ibov[i].valor * 1.06 ** (i / 365);
    const fluxo = i % 30 === 0 ? 1000 : 0;
    cotas += fluxo / preco;
    return { data, valor: cotas * preco, fluxo: i === 0 ? 0 : fluxo };
  });
  const a = analisarSerie({ serie, indices: { Ibovespa: emRetorno(ibov) }, periodo: 'tudo', classe: 'acoes', nome: 'A carteira' });
  const t = ponto(a, 'tir');
  assert.ok(t, `pontos: ${tipos(a)}`);
  assert.match(t.texto, /Considerando quando cada real entrou e saiu, o dinheiro rendeu \+\d+,\d% ao ano \(TIR\)/);
  assert.match(t.texto, /Se cada aporte tivesse ido no Ibovespa, teria R\$\s[\d.]+,\d\d; tem R\$\s[\d.]+,\d\d \(\+R\$\s/);
  assert.ok(a.metricas.pme.razao > 1.0 && a.metricas.pme.razao < 1.1);
  assert.equal(t.tom, 'bom', 'PME ≥ 1,03');
  assert.ok(a.metricas.tir > 0.1 && a.metricas.tir < 0.2);
  assert.ok(a.criterios.includes('pme_benchmark_equivalente') && a.criterios.includes('retorno_mwr_tir'));
});

test('métricas: consistência (meses acima do índice) só com 12+ meses', () => {
  const ds = datas(800);
  const cdi = nivel(ds, 0.12);
  // reserva que rende sempre um pouco mais que o CDI: acima em todos os meses
  const a = analisarSerie({ serie: emRetorno(nivel(ds, 0.125)), indices: { CDI: emRetorno(cdi) }, periodo: 'tudo', classe: 'reserva' });
  assert.ok(a.metricas.mesesAcima >= a.metricas.mesesComparados - 1);
  const d = a.destaques.find((x) => x.criterio === 'consistencia_meses_acima');
  assert.match(d.valor, /^\d+\/\d+$/);
});

test('margem de sorte: excesso ao ano menor que 1,96 × TE / √anos vira tom neutro', () => {
  const ds = datas(1100, '2023-01-01');
  const idx = nivel(ds, 0.10, 0.012, 3);
  // carteira com muito descolamento diário mas só +1 p.p. ao ano
  const serie = idx.map((p, i) => ({ data: p.data, valor: p.valor * 1.01 ** (i / 365) * (1 + 0.08 * Math.sin(i / 25)) }));
  const a = analisarSerie({ serie: emRetorno(serie), indices: { IFIX: emRetorno(idx) }, periodo: '3a', classe: 'fiis', nome: 'A carteira' });
  const p = ponto(a, 'comparacao');
  if (Math.abs(a.metricas.excessoAa) < a.metricas.margem) {
    assert.equal(p.tom, 'neutro');
    assert.match(p.texto, /A diferença ainda cabe na margem de sorte \(±\d+,\d p\.p\. ao ano com 3 anos de histórico\)/);
    assert.ok(a.criterios.includes('information_ratio'));
  } else assert.fail(`excesso ${a.metricas.excessoAa} fora da margem ${a.metricas.margem}`);
});

// ---------------------------------------------------------------------------
// Diagnósticos (causas)
// ---------------------------------------------------------------------------

/** Série com oscilação baixa e queda de `queda` (fração) nos últimos 3 pregões. */
function comQuedaNoFim(ds, queda, amp = 0.002) {
  let v = 100;
  const q = (1 - queda) ** (1 / 3) - 1;
  return ds.map((data, i) => { if (i > 0) v *= 1 + (i >= ds.length - 3 ? q : ruido(i, amp)); return { data, valor: v }; });
}

test('diagnóstico data-ex: queda no fim explicada pelo provento destacado e ainda não pago', () => {
  const ds = datas(120, '2026-06-01');
  const serie = comQuedaNoFim(ds, 0.01).map((p) => ({ ...p, valor: p.valor * 100 })); // ~R$ 10 mil
  const fim = ds[ds.length - 1];
  const a = analisarSerie({
    serie: serie.map((p) => ({ ...p, fluxo: 0 })), indices: { IFIX: emRetorno(nivel(ds, 0.1, 0.002, 5)) }, periodo: '30d', classe: 'fiis', nome: 'A carteira de FIIs',
    proventosAReceber: [{ ticker: 'AAAA11', dataCom: ds[ds.length - 3], dataPagamento: '2026-12-15', valor: 95 }],
  });
  const mov = ponto(a, 'movimento');
  assert.ok(mov, `pontos: ${tipos(a)}`);
  assert.equal(mov.tom, 'neutro');
  assert.match(mov.texto, /Coincide com a data-ex de AAAA11: a cota desconta R\$\s95,00 em proventos .*caem na conta em 15\/12\. Não é perda\./);
  assert.ok(a.criterios.includes('diag_data_ex'));
  assert.ok(fim);
});

test('diagnóstico data-ex: proventos a receber viram ponto próprio; provisionado da B3 sem data-com conta', () => {
  const ds = datas(60, '2026-08-01');
  const serie = nivel(ds, 0.1, 0.002).map((p) => ({ ...p, valor: p.valor * 100, fluxo: 0 }));
  const base = { serie, indices: { IFIX: emRetorno(nivel(ds, 0.1, 0.002, 5)) }, periodo: '30d', classe: 'fiis' };
  const a = analisarSerie({ ...base, proventosAReceber: [{ ticker: 'BBBB11', dataCom: '', dataPagamento: '2026-11-14', valor: 80, fonte: 'B3' }] });
  const p = ponto(a, 'proventosAReceber');
  assert.ok(p, `pontos: ${tipos(a)}`);
  assert.match(p.texto, /R\$\s80,00 em proventos de BBBB11 já passaram da data-com e só caem na conta a partir de 14\/11/);
  // FNet anunciado com data-com no futuro: ainda não descontou nada
  const b = analisarSerie({ ...base, proventosAReceber: [{ ticker: 'BBBB11', dataCom: '2026-12-01', dataPagamento: '2026-12-14', valor: 80, fonte: 'FNet' }] });
  assert.equal(ponto(b, 'proventosAReceber'), undefined);
});

test('diagnóstico câmbio: queda em reais das Ações EUA que veio do dólar', () => {
  const ds = datas(120, '2026-06-01');
  const cambio = ds.map((data, i) => ({ data, valor: i >= ds.length - 3 ? 5 * (0.985 ** (i - ds.length + 4)) : 5 * (1 + ruido(i, 0.0005)) }));
  const usd = nivel(ds, 0.1, 0.002, 1);
  const brl = usd.map((p, i) => ({ data: p.data, valor: p.valor * cambio[i].valor }));
  const a = analisarSerie({ serie: emRetorno(brl), indices: { 'S&P 500': emRetorno(usd) }, cambio, periodo: '30d', classe: 'eua', nome: 'A carteira de ações EUA' });
  const mov = ponto(a, 'movimento');
  assert.ok(mov, `pontos: ${tipos(a)}`);
  assert.match(mov.texto, /Veio do câmbio: o dólar caiu \d,\d\d% no mesmo intervalo; em dólar, a variação foi de/);
  assert.equal(mov.tom, 'neutro');
  assert.ok(a.criterios.includes('diag_cambio'));
});

test('diagnóstico marcação a mercado: título IPCA+ longo cai e a duration explica (alta pequena da taxa)', () => {
  const ds = datas(200, '2026-03-01');
  const serie = comQuedaNoFim(ds, 0.02, 0.0004);
  const a = analisarSerie({
    serie: emRetorno(serie), indices: { CDI: emRetorno(nivel(ds, 0.14)) }, periodo: '30d', classe: 'ativo-rf', nome: 'O título',
    rf: { indexador: 'IPCA', vencimento: '15/05/2045', taxa: 'IPCA + 7,10%', nome: 'Tesouro IPCA+ 2045' },
  });
  const mov = ponto(a, 'movimento');
  assert.ok(mov, `pontos: ${tipos(a)}`);
  assert.match(mov.texto, /Equivale a uma alta de ~0,\d\d p\.p\. na taxa do título \(duration de ~1\d,\d anos\): é marcação a mercado, não perda definitiva — levando até 15\/05\/2045, vale a taxa contratada/);
  assert.equal(mov.tom, 'neutro');
  assert.ok(a.criterios.includes('diag_mam_alta_juros'));
});

test('diagnóstico renda fixa pós-fixada: queda não vem dos juros - confira o lançamento', () => {
  const ds = datas(200, '2026-03-01');
  const a = analisarSerie({
    serie: emRetorno(comQuedaNoFim(ds, 0.005, 0.00002)), indices: { CDI: emRetorno(nivel(ds, 0.14)) }, periodo: '30d', classe: 'ativo-rf',
    rf: { indexador: 'SELIC', vencimento: '03/2029', taxa: 'SELIC + 0,10%', nome: 'Tesouro Selic 2029' }, nome: 'O título',
  });
  const mov = ponto(a, 'movimento');
  assert.ok(mov, `pontos: ${tipos(a)}`);
  assert.match(mov.texto, /Para um pós-fixado \(duration perto de zero\), uma queda assim não vem dos juros — confira o lançamento/);
  assert.equal(mov.tom, 'atencao');
});

test('diagnóstico aporte: salto do valor que é dinheiro novo, não rendimento', () => {
  const ds = datas(90);
  const serie = ds.map((data, i) => ({ data, valor: 10000 * 1.0003 ** i + (i >= 88 ? 2000 : 0), fluxo: i === 88 ? 2000 : 0 }));
  const a = analisarSerie({ serie, indices: { CDI: emRetorno(nivel(ds, 0.12)) }, periodo: { inicio: ds[0], fim: ds[89] }, classe: 'carteira' });
  const p = ponto(a, 'fluxoRecente');
  assert.ok(p, `pontos: ${tipos(a)}`);
  assert.match(p.texto, /entrou um aporte de R\$\s2\.000,00 — o salto no valor desse dia não é rendimento/);
});

test('série mensal (patrimônio x inflação): sem "últimos 3 pregões" nem volatilidade diária', () => {
  const meses = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.UTC(2024, i, 28)); return d.toISOString().slice(0, 10); });
  let v = 100;
  const serie = meses.map((data, i) => { if (i > 0) v *= i === 29 ? 0.9 : 1.008; return { data, retorno: (v / 100 - 1) * 100 }; });
  const ipca = meses.map((data, i) => ({ data, retorno: (1.004 ** i - 1) * 100 }));
  const a = analisarSerie({ serie, indices: { IPCA: ipca }, periodo: 'tudo', classe: 'patrimonio' });
  assert.equal(ponto(a, 'movimento'), undefined);
  assert.equal(a.metricas.vol, null);
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

test('card: linha de números e "Critérios usados" com links (Suno primeiro quando houver)', () => {
  const ds = datas(1100, '2023-01-01');
  const a = analisarSerie({
    serie: emRetorno(nivel(ds, 0.14, 0.01)), periodo: '3a', classe: 'acoes', nome: 'A carteira',
    indices: { Ibovespa: emRetorno(nivel(ds, 0.12, 0.01, 3)), CDI: emRetorno(nivel(ds, 0.12)) },
  });
  const html = htmlAnalise(a);
  assert.match(html, /<dl class="ag-metricas">/);
  assert.match(html, /<dt>Volatilidade<\/dt><dd>\d+,\d% a\.a\.<\/dd>/);
  assert.match(html, /<p class="ag-criterios"><span>Critérios usados:<\/span>/);
  assert.match(html, /<a href="https:\/\/www\.suno\.com\.br\/artigos\/benchmark\/" target="_blank" rel="noopener noreferrer"[^>]*>Benchmark da classe<\/a>/);
  assert.match(html, /href="https:\/\/www\.suno\.com\.br\/artigos\/indice-de-sharpe\/"/);
  // "Critérios usados" sem repetir o mesmo rótulo
  const rotulos = [...html.matchAll(/>([^<>]+)<\/a>/g)].map((x) => x[1]);
  assert.equal(new Set(rotulos).size, rotulos.length);
  // fica dentro do <details> (não aparece fechado) e o resumo segue 1 linha
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="c"></div></body></html>');
  const doc = dom.window.document;
  renderAnalise(doc, doc.getElementById('c'), a);
  const det = doc.querySelector('details.ag');
  assert.ok(det && !det.open);
  assert.ok(det.querySelector('.ag-metricas') && det.querySelector('.ag-criterios'));
  assert.ok(doc.querySelector('summary .ag-resumo').textContent.length > 10);
});

test('proventosAReceberDe: filtra por classe e ticker no formato do motor', () => {
  const anunciados = {
    aReceber: [
      { ticker: 'AAAA11', classe: 'fiis', dataCom: '2026-09-30', dataPagamento: '2026-10-14', valor: 40, fonte: 'FNet' },
      { ticker: 'BBBB3', classe: 'acoes', dataCom: '', dataPagamento: '2026-11-01', valor: 12, fonte: 'B3' },
      { ticker: 'CCCC11', classe: 'fiis', dataCom: '2026-10-30', dataPagamento: '', valor: 0, fonte: 'FNet' },
    ],
  };
  assert.equal(proventosAReceberDe(anunciados, { classes: ['fiis'] }).length, 1, 'valor 0 fica de fora');
  assert.deepEqual(proventosAReceberDe(anunciados, { ticker: 'bbbb3' }), [{ ticker: 'BBBB3', dataCom: '', dataPagamento: '2026-11-01', valor: 12, fonte: 'B3' }]);
  assert.equal(proventosAReceberDe(anunciados).length, 2);
  assert.equal(proventosAReceberDe(anunciados, { classes: ['acoesEua'] }), null);
  assert.equal(proventosAReceberDe(null), null);
});

test('renda passiva: 12 meses fechados x os 12 anteriores, real e "só pelos aportes"', () => {
  const porMes = {};
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(Date.UTC(2024, i, 1));
    porMes[`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`] = i < 18 ? 100 : 120;
  }
  const r = analisarRendaPassiva({ porMes, mesAtual: '2026-07', ipca12m: 0.04 });
  assert.equal(r.length, 1);
  assert.equal(r[0].tom, 'bom');
  assert.match(r[0].texto, /Nos últimos 12 meses fechados entraram R\$\s1\.\d{3},00 em proventos — \+\d+,\d% contra os 12 meses anteriores/);
  assert.match(r[0].texto, /descontado o IPCA \(\+4,0%\), crescimento real/);
  // renda subiu, mas por cota caiu: aportes mascarando
  const porCotaMes = Object.fromEntries(Object.keys(porMes).map((k, i) => [k, i < 18 ? 1 : 0.9]));
  const s = analisarRendaPassiva({ porMes, mesAtual: '2026-07', porCotaMes });
  assert.equal(s[0].tom, 'atencao');
  assert.match(s[0].texto, /a renda subiu só pelos aportes; o próprio ativo está pagando menos/);
  // menos de 24 meses: nada
  assert.deepEqual(analisarRendaPassiva({ porMes: { '2026-01': 10 }, mesAtual: '2026-07' }), []);
  // complementarAnalise mantém o 1º ponto e o limite de 4
  const base = { tom: 'bom', resumo: 'x', pontos: [{ tipo: 'a', tom: 'bom', texto: 'A', peso: 10 }, { tipo: 'b', tom: 'neutro', texto: 'B', peso: 70 }, { tipo: 'c', tom: 'neutro', texto: 'C', peso: 60 }, { tipo: 'd', tom: 'neutro', texto: 'D', peso: 50 }], criterios: [] };
  const junto = complementarAnalise(base, r);
  assert.equal(junto.pontos.length, 4);
  assert.equal(junto.pontos[0].tipo, 'a');
  assert.ok(junto.pontos.some((p) => p.tipo === 'rendaPassiva'));
  assert.ok(junto.criterios.includes('renda_passiva_total'));
  assert.equal(complementarAnalise(base, []), base);
});
