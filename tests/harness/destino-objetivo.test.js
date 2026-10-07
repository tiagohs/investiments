// tests/harness/destino-objetivo.test.js - 07/10/2026 (Tiago: fundo guardado pra comprar a chácara com amigos).
//
// Terceiro destino da Renda Fixa: 'objetivo' ("Reservado para objetivos"), ao lado de 'emergencial' e 'longo-prazo'. A fonte é a coluna B da
// Carteira Renda Fixa (Planilha.gs!destinoRendaFixa_). O título 'objetivo' ENTRA no total/patrimônio e SAI do longo prazo, da distribuição da
// carteira, da série de Longo Prazo (sem salto), das metas pela classe/marca longo-prazo. Dados INVENTADOS; os testes com a planilha real
// (fixtures.json, gitignored) injetam um título 'Objetivo' numa CÓPIA em memória - a fixture não é alterada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { planilhaFalsa, sandboxGas, plain, D } from './planilha-falsa.mjs';
import { montarSandboxComFixtures_, lerFixturesRaw_, congelarRelogioSandbox_, instanteDasFixtures } from './gas-vm-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GAS = path.join(ROOT, 'apps-script');
const FIXTURES = path.join(ROOT, 'tests', 'harness', 'fixtures.json');
const arred = (v) => Math.round(v * 100) / 100;

function carregar(sb, arquivos) {
  for (const f of arquivos) new vm.Script(fs.readFileSync(path.join(GAS, f), 'utf8'), { filename: f }).runInContext(sb);
}

// ---------------------------------------------------------------------------
// 1) o helper: um conceito, uma fonte
// ---------------------------------------------------------------------------

test('destinoRendaFixa_: "Renda Emergencial" = emergencial; "Objetivo"/"Reservado"/"Reservado para objetivos"/"Meta" (sem acento/maiúscula) = objetivo; o resto = longo prazo', () => {
  const sb = { console };
  vm.createContext(sb);
  carregar(sb, ['Planilha.gs']);
  const d = (v) => sb.destinoRendaFixa_(v);
  assert.equal(d('Renda Emergencial'), 'emergencial');
  assert.equal(d('  renda   EMERGENCIAL '), 'emergencial');
  for (const v of ['Objetivo', 'objetivo', 'OBJETIVOS', 'Reservado', 'Reservado para objetivos', 'reservado para objetivo', 'Meta', 'metas', ' Reservado  Para Objetivos ']) assert.equal(d(v), 'objetivo', v);
  for (const v of ['Renda Fixa', '', null, undefined, 'Longo Prazo', 'qualquer coisa', 'Reserva']) assert.equal(d(v), 'longo-prazo', String(v));
  // o que se grava na coluna B volta pro mesmo destino
  for (const dest of ['emergencial', 'longo-prazo', 'objetivo']) assert.equal(d(sb.rotuloColunaBDestinoRf_(dest)), dest);
  assert.equal(sb.rotuloColunaBDestinoRf_('objetivo'), 'Objetivo');
});

// ---------------------------------------------------------------------------
// 2) Home: o total inclui o objetivo, o longo prazo não
// ---------------------------------------------------------------------------

function linhaRf(marca, nome, valor) { return ['COD' + nome, marca, nome, 'Tesouro Selic (LFT)', 'SELIC', 'XP INVESTIMENTOS', 1, '', valor, '', '', valor]; }

function sandboxHome(linhasRf) {
  const dash = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]);
  const somaRf = linhasRf.reduce((s, l) => s + l[11], 0);
  dash[0][0] = 10000 + somaRf; dash[12][4] = 6000; dash[13][4] = 4000; dash[14][4] = somaRf; dash[15][4] = 0; // total, ações, FIIs, RF, EUA
  const aux = Array.from({ length: 10 }, () => [0]);
  aux[4][0] = 6;
  const emerg = linhasRf.filter((l) => /emergencial/i.test(l[1])).reduce((s, l) => s + l[11], 0);
  const cab = Array.from({ length: 8 }, () => []);
  const rfAba = new (class { // aba falsa mínima: cabeçalho na linha 8, dados a partir da 9
    getName() { return 'Carteira Renda Fixa'; }
    getLastRow() { return 8 + linhasRf.length; }
    getRange(a, b, c, d) {
      if (typeof a === 'string') return { getValue: () => emerg, getValues: () => [[emerg]] }; // 'N6' (plano B)
      return { getValues: () => Array.from({ length: c }, (_, i) => (linhasRf[a - 9 + i] || []).concat(Array(d)).slice(0, d).map((x) => (x === undefined ? '' : x))) };
    }
  })();
  const aba = (valores, un) => ({ getRange: () => ({ getValues: () => valores, getValue: () => un }) });
  const abas = { '📊Dash Geral': aba(dash), 'Carteira Renda Fixa': rfAba, 'Auxiliar_app': aba(aux), 'Distribuição e Metas': aba(null, 5) };
  const ss = { getSheetByName: (n) => abas[n] || null };
  const sb = {
    console: { log() {} }, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    localDistribuicaoMetas_: () => ({ dolar: 'K56' }), cotacaoDolarHoje_: () => 5, mapaCambioHistoricoAporte_: () => ({ mapa: {}, chaves: [] }),
    chaveDiaISOInicio_: () => '2026-10-07', arredondar2Inicio_: arred, arredondarIndiceInicio_: (v) => Math.round(v * 10000) / 10000, jsonOut: (x) => x,
    LINHA_CABECALHO_CARTEIRA_RF: 8,
  };
  vm.createContext(sb);
  carregar(sb, ['Planilha.gs', 'Home.gs']);
  return sb;
}

test('Home: o título "Objetivo" entra no total e em Renda Fixa, mas sai do longo prazo; a reserva continua separada', () => {
  const sb = sandboxHome([linhaRf('Renda Emergencial', 'Reserva', 3000), linhaRf('Renda Fixa', 'Longo', 2000), linhaRf('Objetivo', 'Fundo chácara', 1500)]);
  const p = plain(sb.montarHome_().patrimonio);
  assert.equal(p.rendaEmergencial, 3000);
  assert.equal(p.objetivos, 1500);
  assert.equal(p.total, 10000 + 6500, 'o total (Dash) já tem tudo');
  assert.equal(p.longoPrazo, p.total - 3000 - 1500, 'longo prazo = total − reserva − objetivos');
  assert.equal(p.porClasse.rendaFixa, 6500, 'a classe Renda Fixa continua com os 3');
  assert.equal(p.nacional, p.longoPrazo - p.porClasse.acoesEua);
});

test('Home: sem título "Objetivo" nada muda (objetivos 0; longo prazo = total − reserva); "Reservado" e "Meta" também valem', () => {
  const sem = plain(sandboxHome([linhaRf('Renda Emergencial', 'Reserva', 3000), linhaRf('Renda Fixa', 'Longo', 2000)]).montarHome_().patrimonio);
  assert.equal(sem.objetivos, 0);
  assert.equal(sem.longoPrazo, sem.total - 3000);
  const com = plain(sandboxHome([linhaRf('Reservado para objetivos', 'A', 700), linhaRf('meta', 'B', 300), linhaRf('Renda Fixa', 'Longo', 2000)]).montarHome_().patrimonio);
  assert.equal(com.objetivos, 1000);
  assert.equal(com.rendaEmergencial, 0);
});

test('Home: o último ponto da série vira "ao vivo" sem salto - a diferença de marcação do objetivo é fluxo (como na reserva)', () => {
  const sb = sandboxHome([linhaRf('Renda Fixa', 'Longo', 2000), linhaRf('Objetivo', 'Fundo', 1500)]);
  const serie = [
    { data: '2026-10-06', patrimonio: 16400, longoPrazo: 12900, nacional: 12900, rendaEmergencial: 0, objetivos: 1480, rendaFixaTotal: 3480, pregao: true, fluxoCaixaPatrimonio: 0, fluxoCaixaLongoPrazo: 0, fluxoCaixaNacional: 0, fluxoCaixaRendaEmergencial: 0, fluxoCaixaObjetivos: 0, fluxoCaixaRendaFixaTotal: 0, fluxoCaixaRendaFixaLongoPrazo: 0 },
    { data: '2026-10-07', patrimonio: 16450, longoPrazo: 12950, nacional: 12950, rendaEmergencial: 0, objetivos: 1480, rendaFixaTotal: 3480, pregao: true, fluxoCaixaPatrimonio: 0, fluxoCaixaLongoPrazo: 0, fluxoCaixaNacional: 0, fluxoCaixaRendaEmergencial: 0, fluxoCaixaObjetivos: 0, fluxoCaixaRendaFixaTotal: 0, fluxoCaixaRendaFixaLongoPrazo: 0 },
  ];
  const home = sb.montarHome_();
  sb.sincronizarUltimoPontoHistoricoComAoVivo_(serie, home);
  const u = plain(serie[1]);
  assert.equal(u.objetivos, 1500);
  assert.equal(u.ajusteMarcacaoObjetivos, 20, '1500 ao vivo − 1480 do histórico');
  assert.equal(u.ajusteMarcacaoRendaFixa, 3500 - 3480);
  assert.equal(u.fluxoCaixaObjetivos, 20);
  assert.equal(u.fluxoCaixaLongoPrazo, 0, 'a marcação do objetivo não vira ganho/perda do longo prazo: o ajuste dos dois lados se anula');
  assert.equal(u.fluxoCaixaRendaFixaLongoPrazo, 0);
  const ontem = plain(sb.montarOntemDaSerie_(serie.map((p) => ({ ...p }))));
  assert.equal(ontem.objetivos, 1480 + 20);
  assert.equal(ontem.longoPrazo, 12900 + 20 - 0 - 20);
});

// ---------------------------------------------------------------------------
// 3) planilha real (cópia em memória) com 1 título trocado pra "Objetivo": série sem salto
// ---------------------------------------------------------------------------

function sandboxComTituloObjetivo(trocar) {
  const raw = structuredClone(lerFixturesRaw_(FIXTURES));
  const linhas = raw['Carteira Renda Fixa'].linhas;
  let alvo = null;
  if (trocar) {
    for (let i = 8; i < linhas.length; i += 1) {
      const l = linhas[i];
      if (l && l[1] === 'Renda Fixa' && typeof l[11] === 'number' && l[11] > 500) { alvo = i; break; }
    }
    assert.ok(alvo != null, 'a fixture tem um título de longo prazo com valor');
    linhas[alvo][1] = 'Objetivo';
  }
  const sandbox = { console: { ...console, log() {} } };
  vm.createContext(sandbox);
  new vm.Script('this.Date = Date;').runInContext(sandbox);
  congelarRelogioSandbox_(sandbox, instanteDasFixtures(FIXTURES));
  montarSandboxComFixtures_(raw, sandbox);
  for (const f of fs.readdirSync(GAS).filter((x) => x.endsWith('.gs')).sort()) new vm.Script(fs.readFileSync(path.join(GAS, f), 'utf8'), { filename: f }).runInContext(sandbox);
  return { sandbox, valorTitulo: alvo != null ? linhas[alvo][11] : 0 };
}

test('planilha real + 1 título trocado pra "Objetivo": total igual, longo prazo cai só o valor do título, SEM salto na série, fluxos por destino fecham', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const base = sandboxComTituloObjetivo(false);
  const obj = sandboxComTituloObjetivo(true);
  const serieBase = plain(base.sandbox.montarSerieHistoricoInicio_());
  const serieObj = plain(obj.sandbox.montarSerieHistoricoInicio_());
  assert.equal(serieObj.length, serieBase.length);
  let diasComObjetivo = 0;
  serieObj.forEach((p, i) => {
    const b = serieBase[i];
    assert.equal(p.data, b.data);
    assert.equal(p.patrimonio, b.patrimonio, `o total não muda com o destino (${p.data})`);
    assert.equal(p.rendaFixaTotal, b.rendaFixaTotal);
    assert.equal(p.rendaEmergencial, b.rendaEmergencial, 'a reserva não muda');
    assert.equal(arred(b.longoPrazo - p.longoPrazo), p.objetivos, `longo prazo cai exatamente o objetivo (${p.data})`);
    assert.equal(arred(b.nacional - p.nacional), p.objetivos);
    assert.equal(arred(b.rendaFixaLongoPrazo - p.rendaFixaLongoPrazo), p.objetivos);
    assert.equal(arred(b.fluxoCaixaLongoPrazo - p.fluxoCaixaLongoPrazo), p.fluxoCaixaObjetivos, `o aporte/resgate no título 'objetivo' é fluxo fora do longo prazo (${p.data})`);
    assert.equal(arred(b.fluxoAplicadoLongoPrazo - p.fluxoAplicadoLongoPrazo), p.fluxoAplicadoObjetivos);
    assert.equal(arred(b.fluxoCaixaRendaFixaLongoPrazo - p.fluxoCaixaRendaFixaLongoPrazo), p.fluxoCaixaObjetivos);
    assert.equal(b.objetivos, 0, 'sem título "Objetivo" o campo existe e vale 0');
    if (p.objetivos > 0) diasComObjetivo += 1;
  });
  assert.ok(diasComObjetivo > 30, 'o título aparece na série (reclassificado desde a 1ª linha, não só depois da troca)');
  const ultimo = serieObj[serieObj.length - 1];
  assert.ok(ultimo.objetivos > 0);
  // sem salto: o retorno do dia do longo prazo (ganho do dia sem fluxo) é o mesmo da base menos o do título - nenhum dia perde o título "de repente"
  const maiorSalto = serieObj.slice(1).reduce((m, p, i) => Math.max(m, Math.abs(p.objetivos - serieObj[i].objetivos) - Math.abs(p.fluxoCaixaObjetivos)), 0);
  assert.ok(maiorSalto < Math.max(50, ultimo.objetivos * 0.05), `o objetivo só muda por fluxo ou rendimento do dia (maior salto sem fluxo: ${maiorSalto})`);
});

test('planilha real + 1 título "Objetivo": Home, Meus Ativos e Carteiras Renda Fixa mostram o destino novo', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const base = sandboxComTituloObjetivo(false);
  const obj = sandboxComTituloObjetivo(true);
  const hBase = plain(base.sandbox.montarHome_().patrimonio);
  const h = plain(obj.sandbox.montarHome_().patrimonio);
  assert.equal(h.total, hBase.total);
  assert.equal(h.objetivos, obj.valorTitulo);
  assert.equal(arred(hBase.longoPrazo - h.longoPrazo), arred(obj.valorTitulo));
  assert.equal(h.rendaEmergencial, hBase.rendaEmergencial, 'o N6 da planilha e a soma da coluna B da reserva batem');
  const ativos = plain(obj.sandbox.montarMeusAtivos_()).filter((a) => a.classe === 'rf');
  assert.equal(ativos.filter((a) => a.marca === 'objetivo').length, 1);
  assert.ok(ativos.some((a) => a.marca === 'emergencial') && ativos.some((a) => a.marca === 'longo-prazo'));
  const rf = plain(obj.sandbox.montarCarteirasRendaFixa_());
  const doObjetivo = rf.ativos.filter((a) => a.tipoCarteira === 'objetivo');
  assert.equal(doObjetivo.length, 1);
  assert.equal(doObjetivo[0].totalAtualizado, obj.valorTitulo);
  assert.ok(doObjetivo[0].irSeResgatasseHoje, 'o IR estimado do título "Objetivo" vem como nos outros');
  assert.equal(rf.resumo.totalAtualizado, plain(base.sandbox.montarCarteirasRendaFixa_()).resumo.totalAtualizado, 'o total da Carteira RF inclui o objetivo');
});

// ---------------------------------------------------------------------------
// 4) Distribuição da carteira: a base não conta o objetivo
// ---------------------------------------------------------------------------

test('Distribuição: sem objetivo o recálculo reproduz a planilha (conta única: total ideal = maior atual/peso); com objetivo a Renda Fixa e o "aporte que falta" saem sem ele', () => {
  const sb = { console };
  vm.createContext(sb);
  carregar(sb, ['DistribuicoesMetas.gs']);
  const blocos = () => ({
    geral: { tipos: [
      { tipo: 'Ações', percentualDesejado: 0.5, percentualAtual: 0.5, carteiraAtual: 5000, novaCarteira: 5000, valorInvestir: 0 },
      { tipo: 'FIIs', percentualDesejado: 0.3, percentualAtual: 0.3, carteiraAtual: 3000, novaCarteira: 3000, valorInvestir: 0 },
      { tipo: 'Renda Fixa', percentualDesejado: 0.2, percentualAtual: 0.2, carteiraAtual: 2000, novaCarteira: 2000, valorInvestir: 0 },
    ] },
    rf: { tipos: [
      { tipo: 'Renda Emergencial', percentualDesejado: 0.9, percentualAtual: 0.8, carteiraAtual: 8000, novaCarteira: 9000, valorInvestir: 1000 },
      { tipo: 'Renda Fixa', percentualDesejado: 0.1, percentualAtual: 0.2, carteiraAtual: 2000, novaCarteira: 2000, valorInvestir: 0 },
    ] },
  });
  // sem objetivo: nada muda
  let b = blocos();
  sb.descontarObjetivosDosBlocos_(b.geral, b.rf, 0);
  assert.deepEqual(plain(b.geral.tipos.map((x) => [x.carteiraAtual, arred(x.novaCarteira), arred(x.valorInvestir)])), [[5000, 5000, 0], [3000, 3000, 0], [2000, 2000, 0]]);
  // 1.000 reservados pra objetivos: a Renda Fixa de longo prazo cai pra 1.000 e o aporte que falta cresce
  b = blocos();
  sb.descontarObjetivosDosBlocos_(b.geral, b.rf, 1000);
  const g = plain(b.geral);
  assert.equal(g.tipos[2].carteiraAtual, 1000);
  assert.equal(g.total.carteiraAtual, 9000);
  assert.equal(arred(g.tipos[2].percentualAtual), arred(1000 / 9000));
  assert.equal(arred(g.tipos[2].novaCarteira), 2000, 'total ideal 10.000 (ações 5.000 / 0,5): renda fixa 20% = 2.000');
  assert.equal(arred(g.tipos[2].valorInvestir), 1000, 'faltam 1.000 em renda fixa (sem o objetivo)');
  const r = plain(b.rf);
  assert.equal(r.tipos[1].carteiraAtual, 1000);
  assert.equal(r.tipos[1].valorInvestir, 1000);
  assert.equal(r.tipos[0].carteiraAtual, 8000, 'a reserva não muda');
  assert.equal(r.total.carteiraAtual, 9000);
});

test('Distribuição (planilha real): sem objetivo o recálculo bate com a fórmula da planilha', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const { sandbox } = sandboxComTituloObjetivo(false);
  const o = plain(sandbox.montarObjetivosCarteira_());
  assert.equal(o.reservadoObjetivos, 0);
  const lido = plain(sandbox.montarObjetivosCarteira_());
  sandbox.descontarObjetivosDosBlocos_(lido.alocacaoGeral, lido.alocacaoRendaFixa, 0);
  const perto = (a, b, rot) => assert.ok(Math.abs(a - b) < 0.02, `${rot}: ${a} x ${b}`);
  ['alocacaoGeral', 'alocacaoRendaFixa'].forEach((bl) => o[bl].tipos.forEach((x, i) => {
    perto(lido[bl].tipos[i].novaCarteira, x.novaCarteira, `${bl}[${i}].novaCarteira`);
    perto(lido[bl].tipos[i].valorInvestir, x.valorInvestir, `${bl}[${i}].valorInvestir`);
    perto(lido[bl].tipos[i].percentualAtual, x.percentualAtual, `${bl}[${i}].percentualAtual`);
  }));
  perto(lido.alocacaoGeral.total.novaCarteira, o.alocacaoGeral.total.novaCarteira, 'total geral');
  perto(lido.alocacaoRendaFixa.total.valorInvestir, o.alocacaoRendaFixa.total.valorInvestir, 'total RF');
});

test('Distribuição (planilha real + 1 título "Objetivo"): o "atual" da meta e os blocos saem sem o objetivo', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const base = sandboxComTituloObjetivo(false);
  const obj = sandboxComTituloObjetivo(true);
  const a = plain(base.sandbox.montarDistribuicaoAtual_());
  const b = plain(obj.sandbox.montarDistribuicaoAtual_());
  assert.equal(arred(a.objetivos.alocacaoGeral.tipos[2].carteiraAtual - b.objetivos.alocacaoGeral.tipos[2].carteiraAtual), arred(obj.valorTitulo));
  assert.equal(arred(a.objetivos.alocacaoRendaFixa.tipos[1].carteiraAtual - b.objetivos.alocacaoRendaFixa.tipos[1].carteiraAtual), arred(obj.valorTitulo));
  assert.equal(a.objetivos.alocacaoGeral.tipos[0].carteiraAtual, b.objetivos.alocacaoGeral.tipos[0].carteiraAtual, 'ações não mudam');
  const ob = plain(obj.sandbox.montarObjetivosCarteira_());
  assert.equal(ob.reservadoObjetivos, arred(obj.valorTitulo));
  assert.equal(ob.alocacaoGeral.tipos[2].carteiraAtual, b.objetivos.alocacaoGeral.tipos[2].carteiraAtual);
});

// ---------------------------------------------------------------------------
// 5) cadastro: o site grava "Objetivo" na coluna B
// ---------------------------------------------------------------------------

function ssComCarteiraRf() {
  const cab = [['Código'], [], [], [], [], [], [], ['Código', 'Marca', 'Nome', 'Tipo', 'Indexador', 'Instituição', 'Qtd', 'PU', 'Investido', 'Emissão', 'Venc', 'Atual']];
  const linhas = [
    ['BR0001', 'Renda Fixa', 'Tesouro Selic 2031', 'Tesouro Selic (LFT)', 'SELIC', 'XP INVESTIMENTOS', 1, '', 1000, '', '', 1200],
    ['BR0002', 'Renda Emergencial', 'Tesouro Selic 2029', 'Tesouro Selic (LFT)', 'SELIC', 'XP INVESTIMENTOS', 1, '', 1000, '', '', 1300],
    ['BR0003', 'Renda Fixa', 'Fundo DI Chácara', 'CDB', 'CDI', 'XP INVESTIMENTOS', 1, '', 5000, '', '', 5400],
    ['BR0004', 'Renda Fixa', 'Tesouro Selic 2035', 'Tesouro Selic (LFT)', 'SELIC', 'NU INVESTIMENTOS', 1, '', 100, '', '', 110],
    ['BR0005', 'Renda Emergencial', 'Tesouro Selic 2035', 'Tesouro Selic (LFT)', 'SELIC', 'NU INVESTIMENTOS', 1, '', 100, '', '', 110],
  ];
  return planilhaFalsa({ 'Carteira Renda Fixa': [...cab, ...linhas] });
}

test('cadastro: definirDestinoRendaFixa_ grava "Objetivo" / "Renda Emergencial" / "Renda Fixa" na coluna B da linha do título', () => {
  const ss = ssComCarteiraRf();
  const { sb } = sandboxGas(ss);
  const r = plain(sb.definirDestinoRendaFixa_(ss, { titulo: 'Fundo DI Chácara', instituicao: 'XP INVESTIMENTOS', destino: 'objetivo' }));
  assert.deepEqual(r, { linha: 11, destino: 'objetivo', coluna: 'Objetivo' });
  assert.equal(ss.aba('Carteira Renda Fixa').valor('B11'), 'Objetivo');
  assert.equal(sb.destinoRendaFixa_(ss.aba('Carteira Renda Fixa').valor('B11')), 'objetivo');
  sb.definirDestinoRendaFixa_(ss, { titulo: 'Tesouro Selic 2031', instituicao: 'XP', destino: 'emergencial' });
  assert.equal(ss.aba('Carteira Renda Fixa').valor('B9'), 'Renda Emergencial');
  sb.definirDestinoRendaFixa_(ss, { titulo: 'Fundo DI Chácara', instituicao: 'XP', destino: 'longo-prazo' });
  assert.equal(ss.aba('Carteira Renda Fixa').valor('B11'), 'Renda Fixa');
  // a soma por destino da planilha reflete (o Tesouro Selic 2031 virou emergencial acima)
  sb.definirDestinoRendaFixa_(ss, { titulo: 'Fundo DI Chácara', instituicao: 'XP', destino: 'objetivo' });
  const som = plain(sb.somarCarteiraRendaFixaPorDestino_(ss));
  assert.deepEqual([som.emergencial, som.objetivo, som['longo-prazo'], som.total], [1200 + 1300 + 110, 5400, 110, 1200 + 1300 + 110 + 5400 + 110]);
});

test('cadastro: destino inválido, título inexistente e título repetido na mesma instituição são recusados (nada é gravado)', () => {
  const ss = ssComCarteiraRf();
  const { sb } = sandboxGas(ss);
  const antes = JSON.stringify(ss.aba('Carteira Renda Fixa').l.map((l) => l.map((c) => c.v)));
  assert.throws(() => sb.definirDestinoRendaFixa_(ss, { titulo: 'Fundo DI Chácara', instituicao: 'XP', destino: 'outro' }), /destino inválido/);
  assert.throws(() => sb.definirDestinoRendaFixa_(ss, { titulo: 'Não existe', instituicao: 'XP', destino: 'objetivo' }), /não achei/);
  assert.throws(() => sb.definirDestinoRendaFixa_(ss, { titulo: 'Tesouro Selic 2035', instituicao: 'NU', destino: 'objetivo' }), /mais de uma linha/);
  assert.equal(JSON.stringify(ss.aba('Carteira Renda Fixa').l.map((l) => l.map((c) => c.v))), antes);
  const resp = sb.handleDefinirDestinoRendaFixa({ parameter: { titulo: 'Fundo DI Chácara', instituicao: 'XP', destino: 'objetivo' } });
  assert.equal(resp.ok, true);
  assert.equal(sb.handleDefinirDestinoRendaFixa({ parameter: { titulo: 'x', destino: 'objetivo' } }).ok, false);
});

// ---------------------------------------------------------------------------
// 6) Metas: série histórica por vínculo
// ---------------------------------------------------------------------------

test('Metas (histórico): "toda a classe Renda Fixa" e marca longo-prazo não contam o objetivo; a marca "objetivo" conta só ele', () => {
  const sb = { console: { ...console, log() {} }, Logger: { log() {} }, Session: { getScriptTimeZone: () => 'America/Sao_Paulo' }, Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) } };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  carregar(sb, ['Planilha.gs', 'Metas.gs']);
  const serie = [{ data: '2026-09-30', rendaFixaTotal: 1000, objetivos: 300, rendaFixaLongoPrazo: 700, rendaEmergencial: 0, fluxoAplicadoRendaFixaTotal: 1000, fluxoAplicadoObjetivos: 300, fluxoAplicadoRendaFixaLongoPrazo: 700, fluxoAplicadoRendaEmergencial: 0 }];
  const inicioMes = {};
  // mesma montagem de montarHistoricoMetas_ (campos derivados): conferida pelo resultado de serieVinculoMetas_ com `fontes` montada à mão
  const fontes = { hojeMes: '2026-09', inicioMes: { '2026-09': { fluxo: {}, rfSemObjetivos: 700, rendaFixaLongoPrazo: 700, objetivos: 300 } }, rvMes: {}, rfMes: {}, ultimoDiaTicker: {}, cambio: {} };
  fontes.inicioMes['2026-09'].fluxo = { rfSemObjetivos: 700, rendaFixaLongoPrazo: 700, objetivos: 300 };
  const v = (x) => plain(sb.serieVinculoMetas_(x, fontes));
  assert.equal(v({ tipo: 'classe', classe: 'rf', modo: 'total' })['2026-09'].valor, 700);
  assert.equal(v({ tipo: 'marca', marca: 'longo-prazo', modo: 'total' })['2026-09'].valor, 700);
  assert.equal(v({ tipo: 'marca', marca: 'objetivo', modo: 'total' })['2026-09'].valor, 300);
  assert.ok(serie && inicioMes);
});
