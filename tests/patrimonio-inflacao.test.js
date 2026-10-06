// tests/patrimonio-inflacao.test.js
//
// 03/10/2026: seção "Patrimônio vs. inflação (rentabilidade real)" -
// assets/js/pages/patrimonio-inflacao.js (Dietz modificado mês a mês,
// séries com aportes corrigidos pelo IPCA/CDI, veredito, período e a seção
// montada num DOM de verdade). Todos os números são inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  retornoDietz, taxasMensaisIndice, seriesReais, resumoPeriodo, janelaDoPeriodo, veredito, opcoesInflacao, montarPatrimonioVsInflacao,
} from '../assets/js/pages/patrimonio-inflacao.js';

const perto = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const mesMais = (mes, n) => { const [a, m] = mes.split('-').map(Number); const t = a * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

/**
 * Histórico inventado: `meses` meses a partir de `inicio`, investimentos
 * rendendo `rend` ao mês com aporte fixo no meio do mês, IPCA e CDI fixos ao
 * mês (níveis base 100 no fim de cada mês).
 */
function historico({ inicio = '2023-01', meses = 30, inicial = 50000, aporte = 1000, rend = 0.01, ipca = 0.004, cdi = 0.009, ipcaAte = null } = {}) {
  const out = [];
  let v = inicial; let nI = 100; let nC = 100;
  for (let k = 0; k < meses; k += 1) {
    const mes = mesMais(inicio, k);
    if (k > 0) {
      v = v * (1 + rend) + aporte * (1 + rend / 2);
      if (!ipcaAte || mes <= ipcaAte) nI *= 1 + ipca;
      nC *= 1 + cdi;
    }
    out.push({ mes, patrimonio: Math.round(v * 100) / 100, aporte: k ? aporte : 0, indiceIpca: nI, indiceCdi: nC });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dietz
// ---------------------------------------------------------------------------

test('Dietz: sem fluxo é a variação; com fluxo no meio do mês, (fim − início − fluxo) / (início + fluxo/2)', () => {
  const r = retornoDietz([{ valor: 1000 }, { valor: 1100, fluxo: 0 }]);
  assert.ok(perto(r.acumulado, 0.1));
  const r2 = retornoDietz([{ valor: 1000 }, { valor: 1210, fluxo: 100 }]);
  assert.ok(perto(r2.mensais[1], 110 / 1050));
  // encadeado: +10% e depois −10% = −1%
  const r3 = retornoDietz([{ valor: 1000 }, { valor: 1100 }, { valor: 990 }]);
  assert.ok(perto(r3.acumulado, -0.01));
  assert.deepEqual(r3.curva.map((x) => Math.round(x * 1000) / 1000), [0, 0.1, -0.01]);
});

test('Dietz: aporte grande não vira rendimento', () => {
  // 10.000 com 1% no mês e um aporte de 50.000 no meio do mês
  const fim = 10000 * 1.01 + 50000 * 1.005;
  const r = retornoDietz([{ valor: 10000 }, { valor: fim, fluxo: 50000 }]);
  assert.ok(perto(r.acumulado, (fim - 60000) / 35000));
  assert.ok(r.acumulado > 0.009 && r.acumulado < 0.011, `retorno ${r.acumulado}`);
});

test('Dietz: base zerada/negativa ou mês absurdo fica de fora do encadeamento', () => {
  const r = retornoDietz([{ valor: -5000 }, { valor: 2000, fluxo: 6000 }, { valor: 2100 }], { minBase: 1000 });
  assert.equal(r.mensais[1], null);
  assert.equal(r.mesesSemBase, 1);
  assert.ok(perto(r.acumulado, 0.05));
  const r2 = retornoDietz([{ valor: 1000 }, { valor: 5000 }]);
  assert.equal(r2.acumulado, null, 'retorno de 400% no mês = dado ruim');
});

// ---------------------------------------------------------------------------
// Índices mensais
// ---------------------------------------------------------------------------

test('IPCA ainda não divulgado nos últimos meses: média dos últimos 12 (mês de hoje proporcional), marcado como estimado', () => {
  const meses = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'];
  const niveis = [100, 101, 102.01, 102.01, 102.01];
  const t = taxasMensaisIndice(niveis, meses, '2025-05-15');
  assert.equal(t.ultimo, '2025-03');
  assert.deepEqual(t.estimados, ['2025-04', '2025-05']);
  assert.ok(perto(t.taxas[3], 0.01));
  assert.ok(perto(t.taxas[4], 1.01 ** (15 / 31) - 1), 'maio pela metade do mês');
  const vazio = taxasMensaisIndice([undefined, undefined], ['2025-01', '2025-02'], '2025-02-10');
  assert.equal(vazio.semDados, true);
});

// ---------------------------------------------------------------------------
// Série mensal do patrimônio líquido
// ---------------------------------------------------------------------------

function patrimonioComApe() {
  const hm = historico({ inicio: '2024-01', meses: 12, inicial: 40000 });
  return {
    hoje: '2024-12-31',
    historicoMensal: hm,
    config: {
      imovel: { valorCompra: 300000, dataCompra: '2024-06', metodo: 'fipezap' },
      financiamento: { saldo: 230000, dataSaldo: '2024-12-31', dataInicio: '2024-06-15', valorFinanciado: 240000, amortizacao: 1250, taxaAnual: 0.09 },
      fgts: { contas: [{ mensal: [['2024-01', 10000], ['2024-05', 12000], ['2024-06', 2000], ['2024-12', 5000]] }] },
    },
    indices: { fipezap: [['2024-06', 100], ['2024-07', 100.5], ['2024-08', 101], ['2024-09', 101.5], ['2024-10', 102], ['2024-11', 102.5], ['2024-12', 103]] },
  };
}

test('série: compra do apê e amortização são fluxo; valorização do apê e rendimento são retorno; as partes somam a variação', () => {
  const p = patrimonioComApe();
  const b = seriesReais(p);
  assert.equal(b.pontos.length, 12);
  assert.equal(b.componentes.imovel, true);
  const compra = b.pontos.find((x) => x.mes === '2024-06');
  assert.equal(compra.rImovel, 0, 'o mês da compra não é valorização');
  assert.ok(compra.partes.compra > 50000, 'entrada = imóvel − financiamento novo');
  const jul = b.pontos.find((x) => x.mes === '2024-07');
  assert.ok(jul.rImovel > 0, 'valorização entra como retorno');
  assert.ok(jul.partes.dividas > 0, 'amortização = redução da dívida');
  assert.ok(jul.jurosPagos > 0, 'juros estimados pela taxa do contrato');
  b.pontos.slice(1).forEach((x, k) => {
    const a = b.pontos[k];
    const somaPartes = Object.values(x.partes).reduce((s, v) => s + v, 0);
    assert.ok(perto(somaPartes, x.pl - a.pl, 1e-6), `${x.mes}: partes ${somaPartes} x variação ${x.pl - a.pl}`);
    assert.ok(perto(x.retorno + x.fluxo, x.pl - a.pl, 1e-6));
  });
});

test('série: sem o aporte mês a mês no histórico, usa o aporte médio do contexto (aproximação avisada)', () => {
  const hm = historico({ meses: 6 }).map(({ aporte, ...r }) => r);
  const b = seriesReais({ hoje: '2023-06-20', historicoMensal: hm }, { ctx: { ritmo: 1000 } });
  assert.equal(b.aportesAproximados, true);
  assert.ok(b.avisos.includes('aportes'));
  assert.equal(b.pontos[2].aporte, 1000);
});

// ---------------------------------------------------------------------------
// Período e resumo
// ---------------------------------------------------------------------------

test('patrimônio crescendo exatamente o IPCA (aportes no meio do mês): rentabilidade = IPCA e linha "aportes + IPCA" = patrimônio', () => {
  const hm = historico({ meses: 25, rend: 0.004, ipca: 0.004, cdi: 0.009 });
  const r = resumoPeriodo(seriesReais({ hoje: '2025-01-31', historicoMensal: hm }), 'tudo');
  assert.ok(perto(r.pl.acumulado, r.ipca.acumulado, 1e-4), `${r.pl.acumulado} x ${r.ipca.acumulado}`);
  assert.ok(Math.abs(r.benchmarks.excessoIpca) < 1, `excesso ${r.benchmarks.excessoIpca}`);
  assert.ok(r.benchmarks.excessoCdi < 0, 'abaixo do CDI');
  assert.equal(r.anualizado, true);
  assert.ok(perto(r.pl.anual, 1.004 ** (24 * 365.25 / r.dias) - 1, 1e-3));
});

test('período: 12M começa no último mês fechado de 1 ano atrás; período escolhido; Tudo', () => {
  const b = seriesReais({ hoje: '2025-06-15', historicoMensal: historico({ meses: 30 }) });
  const [a, z] = janelaDoPeriodo(b.pontos, '12m', '2025-06-15');
  assert.equal(b.pontos[a].mes, '2024-05');
  assert.equal(b.pontos[z].mes, '2025-06');
  const r12 = resumoPeriodo(b, '12m', { hoje: '2025-06-15' });
  assert.equal(r12.de, '2024-05');
  assert.equal(r12.anualizado, true);
  const rp = resumoPeriodo(b, { inicio: '2024-02-01', fim: '2024-04-30' });
  assert.equal(rp.de, '2024-01');
  assert.equal(rp.ate, '2024-04');
  assert.equal(rp.anualizado, false);
  assert.equal(rp.linhas.length, 4);
  assert.equal(resumoPeriodo(b, 'tudo').de, '2023-01');
  assert.equal(janelaDoPeriodo(b.pontos, { inicio: '2030-01-01', fim: '2030-02-01' }), null);
});

test('patrimônio líquido negativo no começo (dívida maior que tudo): a janela começa depois e avisa', () => {
  const hm = historico({ meses: 24, inicial: 5000 });
  const p = { hoje: '2024-12-31', historicoMensal: hm, config: { fies: { saldo: 20000, dataSaldo: '2024-12', taxaMensal: 0, parcela: 0 } } };
  const r = resumoPeriodo(seriesReais(p), 'tudo');
  assert.ok(r.cortadoDe, 'cortou');
  assert.ok(r.pl.inicio > 1000);
  assert.equal(r.pl.mesesSemBase, 0);
});

// ---------------------------------------------------------------------------
// Veredito
// ---------------------------------------------------------------------------

test('veredito SIM: rendendo acima do IPCA, com o porquê e o que continuar', () => {
  const b = seriesReais({ hoje: '2025-06-15', historicoMensal: historico({ meses: 30, rend: 0.012, ipca: 0.004, cdi: 0.009 }) });
  const r = resumoPeriodo(b, '12m', { hoje: '2025-06-15' });
  const v = veredito(r, { aporteMeta: 3000 });
  assert.equal(v.sim, true);
  assert.equal(v.tom, 'bom');
  assert.match(v.titulo, /^Sim: seu patrimônio está crescendo [\d,]+ p\.p\. por ano acima da inflação$/);
  assert.ok(v.pp > 5);
  assert.ok(v.itensPorque.some((i) => i.id === 'aportes') && v.itensPorque.some((i) => i.id === 'rendimento'));
  assert.ok(v.continuar.some((c) => c.id === 'investimentos'), 'investimentos acima do CDI = continuar');
  assert.ok(v.melhorar.some((c) => c.id === 'meta'), 'aporte abaixo da meta');
});

test('veredito NÃO: rendendo abaixo do IPCA, com ações concretas pra melhorar', () => {
  const b = seriesReais({ hoje: '2025-06-15', historicoMensal: historico({ meses: 30, rend: 0.001, ipca: 0.005, cdi: 0.009 }) });
  const v = veredito(resumoPeriodo(b, '12m', { hoje: '2025-06-15' }));
  assert.equal(v.sim, false);
  assert.equal(v.tom, 'atencao');
  assert.match(v.titulo, /^Não: seu patrimônio está rendendo [\d,]+ p\.p\. por ano abaixo da inflação$/);
  const inv = v.melhorar.find((m) => m.id === 'investimentos');
  assert.ok(inv && /abaixo do IPCA/.test(inv.html) && /CDI/.test(inv.html), 'diz quanto o CDI teria dado');
});

test('veredito: com dívida cara, os juros das parcelas aparecem no "e se" e podem derrubar o tom pra atenção', () => {
  const p = patrimonioComApe();
  p.config.financiamento.taxaAnual = 0.3;
  const r = resumoPeriodo(seriesReais(p), 'tudo');
  const v = veredito(r);
  assert.ok(r.jurosPagos > 0);
  assert.ok(v.jurosTxt && /juros das parcelas/.test(v.jurosTxt));
  if (v.ppComJuros < 0) assert.equal(v.tom, 'atencao');
});

// ---------------------------------------------------------------------------
// Gráfico e montagem
// ---------------------------------------------------------------------------

test('gráfico: três linhas numa escala só (R$ e %) - opções da biblioteca de gráficos', () => {
  // 06/10/2026 (Onda 3): o desenho é da biblioteca assets/js/charts; aqui se confere a tradução dado -> opções
  const b = seriesReais({ hoje: '2025-06-15', historicoMensal: historico({ meses: 30 }) });
  const r = resumoPeriodo(b, '3a', { hoje: '2025-06-15' });
  ['rs', 'pct'].forEach((vista) => {
    const g = opcoesInflacao(r.linhas, vista);
    assert.equal(g.opcoes.series.length, 3);
    assert.deepEqual(g.opcoes.series.map((x) => x.id).sort(), ['cdi', 'ipca', 'pl']);
    assert.equal(g.opcoes.series.filter((x) => x.pontilhada).length, 2, 'IPCA e CDI pontilhadas');
    assert.equal(g.opcoes.eixoX.length, r.linhas.length);
    assert.ok(!/NaN/.test(JSON.stringify(g.opcoes.series)));
  });
});

function montarDom(patrimonio, ctx = null) {
  const dom = new JSDOM('<!doctype html><html><body><div id="raiz"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const secao = montarPatrimonioVsInflacao(doc.getElementById('raiz'), { patrimonio, ctx, doc });
  return { dom, doc, secao, raiz: doc.getElementById('raiz') };
}

test('montagem: tiles, gráfico, análise, veredito; filtro de período e troca de vista', () => {
  const p = { hoje: '2025-06-15', historicoMensal: historico({ meses: 30, rend: 0.012 }), metas: { aporteMeta: 1000 } };
  const { doc, secao, raiz } = montarDom(p);
  assert.equal(raiz.querySelectorAll('.pi-tile').length, 4);
  assert.ok(raiz.querySelector('.pi-svg-box svg.chart-svg'), 'gráfico da biblioteca');
  assert.ok(raiz.querySelector('.pi-veredito .pi-ver-titulo').textContent.startsWith('Sim'));
  assert.ok(raiz.querySelector('.pi-veredito').classList.contains('pi-tom-bom'));
  assert.ok(raiz.querySelector('.pi-analise .ag'), 'card de análise embaixo do gráfico');
  assert.ok(raiz.querySelector('.filter-tab.fp-chip'), '"Escolher período" ligado');
  assert.equal(secao.periodo, '12m');
  raiz.querySelector('.filter-tab[data-periodo="tudo"]').click();
  assert.equal(secao.periodo, 'tudo');
  assert.equal(secao.resumo.de, '2023-01');
  assert.match(raiz.querySelector('.pi-leg').textContent, /Aportes \+ IPCA/);
  raiz.querySelector('.pi-vista[data-vista="pct"]').click();
  assert.equal(secao.vista, 'pct');
  assert.match(raiz.querySelector('.pi-leg').textContent, /Patrimônio \(sem aportes\)/);
  assert.match(raiz.querySelector('.pi-metodo').textContent, /Dietz/);
  // teclado no gráfico (biblioteca) mostra o balão do mês
  const svg = raiz.querySelector('.pi-svg-box svg.chart-svg');
  svg.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  svg.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.match(raiz.querySelector('.pi-svg-box .chart-tip').textContent, /mai\/2025/);
  secao.destruir();
});

test('montagem: sem a série de IPCA/CDI (Apps Script antigo) avisa em vez de quebrar; atualizar() redesenha', () => {
  const hm = historico({ meses: 10 }).map(({ indiceIpca, indiceCdi, ...r }) => r);
  const { raiz, secao } = montarDom({ hoje: '2023-10-20', historicoMensal: hm });
  assert.equal(raiz.querySelector('.pi-vazio').hidden, false);
  assert.match(raiz.querySelector('.pi-vazio').textContent, /Patrimonio\.gs/);
  secao.atualizar({ patrimonio: { hoje: '2025-06-15', historicoMensal: historico({ meses: 30, rend: 0.001, ipca: 0.006 }) } });
  assert.equal(raiz.querySelector('.pi-vazio').hidden, true);
  assert.ok(raiz.querySelector('.pi-ver-titulo').textContent.startsWith('Não'));
});
