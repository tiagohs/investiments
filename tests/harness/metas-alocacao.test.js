// tests/harness/metas-alocacao.test.js - 05/10/2026 (auditoria A-10, A-11, A-13, A-14, A-16): lado Apps Script.
// Alocação exclusiva igual à do front, IR/IOF por lote sem duplicar título dividido em 2 marcas, aliases de
// ticker, câmbio suspeito (libra = dólar) e imposto da reserva. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { alocarMetas, resolverVinculos } from '../../assets/js/pages/metas-calc.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function sandbox() {
  const sb = {
    console: { ...console, log() {} }, Logger: { log() {} },
    Utilities: { formatDate: (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  for (const f of ['Metas.gs', 'Proventos.gs', 'RendaFixaIR.gs', 'Incorporacoes.gs']) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  return sb;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

const ATIVOS = [
  { id: 'AAAA11', ref: 'AAAA11', nome: 'AAAA11', classe: 'fiis', valorBRL: 10000 },
  { id: 'CCCC3', ref: 'CCCC3', nome: 'CCCC3', classe: 'acoes', valorBRL: 20000 },
  { id: 'rf:Selic 2029|Banco X@emergencial', ref: 'rf:Selic 2029|Banco X', nome: 'Selic 2029', classe: 'rf', marca: 'emergencial', valorBRL: 8000, irResgate: { ir: 200, iof: 0 } },
  { id: 'rf:Selic 2031|Banco X@longo-prazo', ref: 'rf:Selic 2031|Banco X', nome: 'Selic 2031', classe: 'rf', marca: 'longo-prazo', valorBRL: 12000 },
];

test('A-11: a alocação do Apps Script (progresso das metas) é a mesma do front', () => {
  const metas = [
    { id: 'a', tipo: 'aposentadoria', nome: 'Apos', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }, { tipo: 'classe', classe: 'fiis', modo: 'total' }, { tipo: 'classe', classe: 'acoes', modo: 'total' }, { tipo: 'ativo', id: 'CCCC3', modo: 'fracao', fracao: 0.5 }] },
    { id: 'r', tipo: 'reservaEmergencia', nome: 'Reserva', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }] },
    { id: 'p', tipo: 'rendaPassiva', nome: 'Renda', vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'fracao', fracao: 0.4 }] },
  ];
  const sb = sandbox();
  const gs = plain(metas);
  sb.alocarMetasVinculos_(gs, ATIVOS, {});
  const aloc = alocarMetas(metas, ATIVOS, {});
  const total = (id) => gs.find((m) => m.id === id).progresso.valorVinculado;
  assert.equal(total('r'), 8000);
  assert.equal(total('p'), 4000);
  assert.equal(total('a'), 34000, 'aposentadoria: FIIs que sobraram (6.000) + ações (20.000) + o título da reserva (exceção de 06/10/2026)');
  ['a', 'r', 'p'].forEach((id) => {
    const front = resolverVinculos(metas.find((m) => m.id === id).vinculos, ATIVOS, {}, { ocupado: aloc.ocupadoPorMeta[id] }).total;
    assert.equal(total(id), front, `meta ${id}: Apps Script = front`);
  });
  assert.ok(total('a') + total('p') <= 42000 + 0.01, 'fora a exceção reserva x aposentadoria, nunca passa do patrimônio vinculável (RV + RF)');
  assert.ok(gs.find((m) => m.id === 'a').progresso.cortadoBRL > 0);
});

test('A-16: cotação idêntica à de outra moeda (libra = dólar) ou fora da razão plausível é descartada', () => {
  const sb = sandbox();
  const c = (valor) => ({ valor, celula: 'D0', como: 'posição' });
  const r1 = plain(sb.rejeitarCambioSuspeitoMetas_({ USD: c(5.2), GBP: c(5.2), CHF: c(6.6), EUR: c(6.1) }));
  assert.deepEqual(Object.keys(r1).sort(), ['CHF', 'EUR', 'USD'], 'libra igual ao dólar sai; franco e euro ficam');
  const r2 = plain(sb.rejeitarCambioSuspeitoMetas_({ USD: c(5.2), GBP: c(5.0), EUR: c(6.1) }));
  assert.ok(!r2.GBP, 'libra a 5,00 (abaixo do dólar) não passa na razão, mesmo dentro da faixa 3-18');
  const r3 = plain(sb.rejeitarCambioSuspeitoMetas_({ USD: c(5.2), GBP: c(7.4), CHF: c(6.6), EUR: c(7.4) }));
  assert.ok(!r3.GBP && !r3.EUR, 'libra e euro iguais entre si: nenhum dos dois é confiável');
  assert.ok(r3.USD && r3.CHF);
  const r4 = plain(sb.rejeitarCambioSuspeitoMetas_({ USD: c(5.2), GBP: c(7.0), CHF: c(6.6), EUR: c(6.1) }));
  assert.equal(Object.keys(r4).length, 4, 'valores plausíveis passam todos');
});

test('A-13: título dividido em 2 marcas não soma o IR do total em cada fração; IOF dos primeiros 30 dias entra por lote', () => {
  const sb = sandbox();
  const D = (iso) => new sb.Date(iso);
  const agora = sb.Date.now();
  const dia = 86400000;
  // 2 linhas da carteira com o MESMO título+instituição (uma por marca); lotes do título TODO (quantidades somam 10)
  const linha = (qtd, inv, atual) => ['T1', null, 'Selic 2029', 'Tesouro Selic', null, 'Banco X', qtd, null, inv, D('2025-01-10'), null, atual];
  const carteira = [linha(6, 6000, 7200), linha(4, 4000, 4800)];
  const lotes = [
    ['Selic 2029', 'Banco X', D('2025-01-10'), 7, null, 7000],
    ['Selic 2029', 'Banco X', new sb.Date(agora - 1 * dia), 3, null, 3000], // lote de 1 dia: IOF de 96% sobre o rendimento
  ];
  const ir = plain(sb.montarIRRendaFixa_({ carteira, lotes }));
  assert.equal(ir.length, 1, 'as 2 linhas do mesmo título viram 1 posição');
  const pos = ir[0];
  assert.equal(pos.detalhes.length, 2, 'cada lote 1 vez só (antes cada marca puxava os 2 lotes)');
  assert.ok(pos.iofSeResgatasseHoje > 0, 'lote de 1 dia paga IOF');
  assert.equal(Math.round((pos.impostoSeResgatasseHoje) * 100), Math.round((pos.detalhes[0].imposto + pos.detalhes[1].imposto) * 100));
  assert.equal(Math.round((pos.valorLiquidoSeResgatasseHoje + pos.impostoSeResgatasseHoje) * 100), 12000 * 100 / 1, 'líquido + imposto = valor atualizado (7.200 + 4.800)');
  // Metas.gs reparte pela fração de cada marca: a soma bate com o total da posição (não dobra)
  const a = plain(sb.irResgateDoAtivo_(pos, 7200));
  const b = plain(sb.irResgateDoAtivo_(pos, 4800));
  const totalPos = plain(sb.irResgateDoAtivo_(pos, 12000));
  assert.ok(Math.abs((a.ir + a.iof + b.ir + b.iof) - (totalPos.ir + totalPos.iof)) < 0.03, 'as 2 marcas somam o IR+IOF da posição inteira');
  assert.ok(Math.abs((a.ir + a.iof) / (totalPos.ir + totalPos.iof) - 0.6) < 0.01, 'a de 60% do valor paga 60%');
  assert.equal(sb.aliquotaIofRendaFixa_(1), 0.96);
  assert.equal(sb.aliquotaIofRendaFixa_(2), 0.93);
  assert.equal(sb.aliquotaIofMetas_(30), 0);
});

test('A-14: tabela única de aliases de ticker (renomeação + incorporação) e proventos do ticker antigo contam no atual', () => {
  const sb = sandbox();
  assert.equal(sb.resolverAliasTicker_('elet6'), 'AXIA6');
  assert.equal(sb.resolverAliasTicker_(' STR '), 'VNOM', 'incorporação (INCORPORACOES_) também');
  assert.equal(sb.resolverAliasTicker_('PETR4'), 'PETR4', 'sem alias devolve ele mesmo');
  assert.equal(sb.resolverAliasTicker_(null), '');
  assert.deepEqual(plain(sb.aliasesDoTicker_('AXIA6')).sort(), ['AXIA6', 'ELET6']);
  assert.equal(plain(sb.tabelaAliasesTicker_()).ELET3, 'AXIA3');
  const por = plain(sb.proventos12mPorTicker_([{ data: '2026-08-10', ticker: 'ELET6', valor: 10 }, { data: '2026-08-12', ticker: 'AXIA6', valor: 5 }], '2026-10-05'));
  assert.equal(por.porTicker.AXIA6, 15);
  assert.equal(por.porTicker.ELET6, undefined);
  // vínculo a ticker antigo no Apps Script
  const p = plain(sb.progressoVinculosMeta_({ vinculos: [{ tipo: 'ativo', id: 'ELET6', modo: 'total' }] }, [{ id: 'AXIA6', classe: 'acoes', valorBRL: 700 }], {}));
  assert.equal(p.valorVinculado, 700);
});

test('A-10: imposto da reserva (IR+IOF dos títulos emergenciais) separa o bruto do líquido', () => {
  const sb = sandbox();
  assert.equal(sb.impostoReservaMetas_(ATIVOS), 200);
  assert.equal(sb.impostoReservaMetas_([{ classe: 'rf', marca: 'emergencial' }]), null, 'sem estimativa: null (a tela rotula "bruta")');
  assert.equal(sb.impostoReservaMetas_([]), null);
});
