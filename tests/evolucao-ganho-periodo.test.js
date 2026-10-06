// tests/evolucao-ganho-periodo.test.js - 06/10/2026 (Tiago: o "+R$ … no período" da Evolução do patrimônio não batia com a
// Rentabilidade): o delta do gráfico de Evolução é o GANHO do período (variação − aportes líquidos), o MESMO R$ do card de
// Rentabilidade, em todos os períodos. Dados 100% inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente } from './charts-helper.mjs';
import { criarGraficosCarteira, PERIODOS_CARTEIRAS } from '../assets/js/pages/carteiras-graficos.js';

function historicoInventado(dias = 900) {
  const hoje = new Date();
  const pts = [];
  let valor = 1000; let investido = 1000;
  for (let i = dias; i >= 0; i -= 1) {
    const d = new Date(hoje.getTime() - i * 86400000);
    const data = d.toISOString().slice(0, 10);
    const aporte = i % 30 === 0 ? 700 : (i % 97 === 0 ? -300 : 0);
    valor = (valor + aporte) * (1 + (((i * 37) % 11) - 4.5) / 900);
    investido += aporte;
    pts.push({ data, patrimonio: Math.round(valor * 100) / 100, fluxoCaixaPatrimonio: aporte, acoes: Math.round(valor * 0.4 * 100) / 100, fluxoCaixaAcoes: aporte * 0.4 });
  }
  return pts;
}

const reais = (txt) => {
  const m = String(txt).replace(/ /g, ' ').match(/([+−-])\s*R\$\s*([\d.]+,\d{2})/);
  assert.ok(m, `sem R$ em "${txt}"`);
  return (m[1] === '+' ? 1 : -1) * Number(m[2].replace(/\./g, '').replace(',', '.'));
};

for (const visaoId of ['total', 'carteiraAcoes']) {
  test(`Evolução: "ganho no período" (${visaoId}) = R$ da Rentabilidade em todos os períodos, com "i" "sem contar os aportes"`, () => {
    const a = criarAmbiente({ reduzido: true });
    const { doc } = a;
    const g = criarGraficosCarteira(doc, a.raiz, { historico: historicoInventado(), paineis: [{ visaoId }], semPeriodoPersonalizado: true });
    for (const p of PERIODOS_CARTEIRAS) {
      const botao = a.raiz.querySelector(`.cg-periodo [data-periodo="${p}"]`);
      assert.ok(botao, `botão do período ${p}`);
      botao.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
      const rent = a.raiz.querySelector('.cg-painel-rentabilidade .chart-card-delta');
      const evo = a.raiz.querySelector('.cg-painel-evolucao .chart-card-delta');
      assert.ok(rent && evo, `deltas no período ${p}`);
      assert.ok(Math.abs(reais(rent.textContent) - reais(evo.textContent)) < 0.011, `período ${p}: Rentabilidade "${rent.textContent}" x Evolução "${evo.textContent}"`);
      assert.match(evo.textContent, /ganho no período/);
      assert.equal(evo.querySelector('.chart-kpi-info').getAttribute('data-info'), 'sem contar os aportes');
      assert.equal(evo.querySelector('[title]'), null, 'sem title nativo');
    }
    g.destruir();
  });
}
