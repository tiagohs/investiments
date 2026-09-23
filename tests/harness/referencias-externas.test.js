// tests/harness/referencias-externas.test.js
//
// 23/09/2026 - compara o app com fontes EXTERNAS que o Tiago confia (prints
// da B3, da Interactive Brokers e do Gorila), copiadas pra
// tests/harness/referencias-externas.local.json (gitignored - dado
// financeiro real; este arquivo aqui não tem número nenhum). Sem o .json
// (ou sem fixtures.json), tudo aqui é pulado.
//
// B3 e Interactive Brokers são a VERDADE sobre quantidade e preço: tem que
// bater. Gorila tem metodologia própria (marca Tesouro a mercado, conta
// caixa na corretora, pega proventos direto da B3) - aí a comparação é de
// ORDEM DE GRANDEZA, com folga explícita em cada teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { carregarTodasAsTelasComDadosReais } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
const REF_PATH = path.join(__dirname, 'referencias-externas.local.json');
const PRONTO = fs.existsSync(FIXTURES_PATH) && fs.existsSync(REF_PATH);
const REF = PRONTO ? JSON.parse(fs.readFileSync(REF_PATH, 'utf8')) : null;
const fmtSp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

let _dados = null;
async function dados() {
  if (!_dados) _dados = await carregarTodasAsTelasComDadosReais({ fixturesPath: FIXTURES_PATH });
  return _dados;
}
function pular(t) {
  if (!PRONTO) { t.skip('fixtures.json ou referencias-externas.local.json ausente'); return true; }
  return false;
}

test('B3: patrimônio de Ações e de FIIs no histórico, no dia do fechamento do print, = total da B3 (±0,5%)', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const dia = home.historico.find((x) => x.data === REF.b3.dataFechamento);
  if (!dia) { t.skip(`série não tem ${REF.b3.dataFechamento}`); return; }
  t.diagnostic(`Ações: app ${dia.acoes} x B3 ${REF.b3.totalAcoes} | FIIs: app ${dia.fiis} x B3 ${REF.b3.totalFiis}`);
  assert.ok(Math.abs(dia.acoes / REF.b3.totalAcoes - 1) < 0.005);
  assert.ok(Math.abs(dia.fiis / REF.b3.totalFiis - 1) < 0.005);
});

test('B3 e Interactive Brokers: quantidade de cada ativo (pelas Transações) = quantidade na custódia', async (t) => {
  if (pular(t)) return;
  const { fixtures, sandbox } = await dados();
  const fora = new Set(sandbox.TICKERS_FORA_DO_HISTORICO || []);
  const qtd = {};
  for (const aba of ['Transações', 'Transações - USA']) {
    for (const l of (fixtures[aba]?.linhas || []).slice(6)) {
      const tk = String(l[0] || '').trim().toUpperCase();
      if (!tk || fora.has(tk) || typeof l[10] !== 'number') continue;
      qtd[tk] = (qtd[tk] || 0) + l[10];
    }
  }
  const erros = [];
  for (const [tk, q] of Object.entries({ ...REF.b3.quantidades, ...REF.ibkr.quantidades })) {
    if (Math.abs((qtd[tk] || 0) - q) > 0.0015) erros.push(`${tk}: app ${qtd[tk] || 0} x custódia ${q}`);
  }
  assert.deepEqual(erros, []);
});

test('Gorila (ordem de grandeza): rentabilidade desde o início (±3 p.p.) e do mês (±1 p.p.), e Valor aplicado x "Valor investido" (±5%)', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  if (home.historico[home.historico.length - 1].data !== REF.gorila.data || fmtSp.format(new Date()) !== REF.gorila.data) {
    t.skip(`print do Gorila é de ${REF.gorila.data} - compara só no mesmo dia`);
    return;
  }
  const { calcularResumoRentabilidade } = await import(pathToFileURL(path.join(ROOT, 'assets/js/pages/inicio.js')).href);
  const tudo = calcularResumoRentabilidade(home.patrimonio, home.historico, { visaoId: 'total', periodoId: 'tudo' });
  const mes = calcularResumoRentabilidade(home.patrimonio, home.historico, { visaoId: 'total', periodoId: 'mes' });
  const aplicado = home.historico.reduce((s, x) => s + (x.fluxoAplicadoPatrimonio || 0), 0);
  t.diagnostic(`desde o início: app ${tudo.percentual.toFixed(2)}% x Gorila ${REF.gorila.rentabilidadeDesdeInicioPct}% | mês: app ${mes.percentual.toFixed(2)}% x Gorila ${REF.gorila.rentabilidadeMesPct}% | Valor aplicado: app ${aplicado.toFixed(2)} x Gorila ${REF.gorila.valorInvestido} | Resultado: app ${tudo.ganhoReais.toFixed(2)} x Gorila ${REF.gorila.resultadoDesdeInicio}`);
  // ±3 p.p. (era ±2 até 23/09/2026 #6): com os proventos de set/2026 e os
  // dividendos da IBKR lançados, o app sobe ~1 p.p. - o Gorila tem
  // metodologia própria (não sabemos se conta dividendo dos EUA), então isto
  // só pega erro grosseiro, nunca diferença de método.
  assert.ok(Math.abs(tudo.percentual - REF.gorila.rentabilidadeDesdeInicioPct) <= 3);
  assert.ok(Math.abs(mes.percentual - REF.gorila.rentabilidadeMesPct) <= 1);
  assert.ok(Math.abs(aplicado / REF.gorila.valorInvestido - 1) <= 0.05);
});
