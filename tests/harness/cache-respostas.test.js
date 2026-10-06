// tests/harness/cache-respostas.test.js
//
// 05/10/2026 (auditoria A-34, A-35, A-36, A-37 e o resto da A-17, Onda 2).
// Dados todos inventados (planilha falsa em memória); o último bloco usa a
// planilha real (fixtures.json, gitignored) só pra fixar ORÇAMENTO DE LEITURA
// por ação (A-72) - sem número real no arquivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planilhaFalsa, sandboxGas, plain, AbaFalsa } from './planilha-falsa.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures.json');

/** sandboxGas com CacheService/Properties de verdade (os falsos padrão ignoram putAll/getAll) e contagem de TTL. */
function ambiente(abas = {}, opcoes = {}) {
  const ss = planilhaFalsa(abas);
  const env = sandboxGas(ss, opcoes);
  const guardado = new Map();
  const ttls = [];
  env.sb.CacheService = {
    getScriptCache: () => ({
      get: (k) => (guardado.has(k) ? guardado.get(k) : null),
      getAll: (ks) => { const o = {}; ks.forEach((k) => { if (guardado.has(k)) o[k] = guardado.get(k); }); return o; },
      put: (k, v) => { if (Buffer.byteLength(String(v)) > 100 * 1024) throw new Error('valor maior que 100KB: ' + k); guardado.set(k, v); },
      putAll: (obj, ttl) => { ttls.push(ttl); Object.entries(obj).forEach(([k, v]) => { if (Buffer.byteLength(String(v)) > 100 * 1024) throw new Error('valor maior que 100KB: ' + k); guardado.set(k, v); }); },
      remove: (k) => guardado.delete(k),
      removeAll: (ks) => ks.forEach((k) => guardado.delete(k)),
    }),
  };
  const props = new Map();
  env.sb.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)),
      deleteProperty: (k) => props.delete(k), getKeys: () => [...props.keys()],
    }),
  };
  return { ...env, ss, guardado, ttls, props };
}

/** Conta getRange(...).getValues()/getValue() por aba. */
function contar(ss) {
  const c = { getValues: 0, getValue: 0, celulas: 0 };
  Object.values(ss.abas).forEach((aba) => {
    const orig = aba.getRange.bind(aba);
    aba.getRange = (...a) => {
      const r = orig(...a);
      const gv = r.getValues.bind(r); const g1 = r.getValue.bind(r);
      r.getValues = () => { const v = gv(); c.getValues += 1; c.celulas += v.length * (v[0] ? v[0].length : 0); return v; };
      r.getValue = () => { c.getValue += 1; c.celulas += 1; return g1(); };
      return r;
    };
  });
  return c;
}

// ---------------------------------------------------------------------------
// A-34: leitura em bloco
// ---------------------------------------------------------------------------

/** A implementação ANTIGA (1 getValue por célula), pra provar que o resultado é idêntico. */
function lerBlocoRadarLegado(sheet, primeiraLinha, colunas) {
  const itens = [];
  let linha = primeiraLinha;
  for (;;) {
    const ativo = sheet.getRange(colunas.ativo + linha).getValue();
    if (!ativo) break;
    const item = { linha };
    for (const campo in colunas) item[campo] = colunas[campo] ? sheet.getRange(colunas[campo] + linha).getValue() : null;
    itens.push(item);
    linha += 1;
  }
  return { itens, linhaTotal: linha };
}

function abaRadar(nLinhas, { primeira = 42, maxRows = 400 } = {}) {
  const linhas = [];
  for (let i = 1; i < primeira; i += 1) linhas.push([]);
  for (let k = 0; k < nLinhas; k += 1) {
    const l = [];
    l[1] = k + 1; l[2] = `TICK${k}`; l[3] = 10 + k; l[4] = 20 + k; l[5] = k % 2 ? 'Comprar' : 'Aguardar'; l[6] = 1.5; l[7] = 0.9; l[8] = 7; l[9] = 0.1; l[10] = 0.2;
    l[11] = 0.05; l[12] = 0.06; l[13] = 100 * k; l[14] = -0.01; l[16] = 5; l[18] = k % 3 ? 'Tijolo' : 'Papel';
    linhas.push(l);
  }
  const total = []; total[2] = ''; total[13] = 999; linhas.push(total); // linha de total: Ativo vazio
  return new AbaFalsa('Distribuição e Metas', linhas, { maxRows });
}
const COLS_NAC = { ranking: 'B', ativo: 'C', precoAtual: 'D', precoTeto: 'E', vies: 'F', precoMedio: 'G', pvp: 'H', pl: 'I', descontoPvp: 'J', descontoPl: 'K', percentualDesejado: 'L', percentualAtual: 'M', carteiraAtual: 'N', percentualDiferenca: 'O', novaCarteira: 'Q', valorInvestir: 'S', tipo: null };

test('A-34: lerBlocoRadar_ devolve o mesmo que a leitura célula a célula, com 1 chamada por bloco (e pedaços se passar de 40 linhas)', () => {
  for (const n of [0, 1, 12, 39, 40, 41, 95]) {
    const { sb, ss } = ambiente({ 'Distribuição e Metas': abaRadar(n) });
    const aba = ss.aba('Distribuição e Metas');
    const antigo = plain(lerBlocoRadarLegado(aba, 42, COLS_NAC));
    const c = contar(ss);
    const novo = plain(sb.lerBlocoRadar_(aba, 42, COLS_NAC));
    assert.deepEqual(novo, antigo, `n=${n}`);
    assert.equal(novo.itens.length, n);
    assert.equal(c.getValue, 0, 'nenhum getValue por célula');
    assert.ok(c.getValues <= Math.floor(n / 40) + 1, `n=${n}: ${c.getValues} chamadas`);
  }
});

test('A-34: lerBlocoRadar_ não passa do fim da aba (bloco que vai até a última linha) e lê só as colunas pedidas', () => {
  const { sb, ss } = ambiente({ 'Distribuição e Metas': abaRadar(10, { primeira: 5, maxRows: 15 }) });
  const aba = ss.aba('Distribuição e Metas');
  // linhas 5..14 com ticker; a 15 é a de total (Ativo vazio) e é a última da aba
  const r = plain(sb.lerBlocoRadar_(aba, 5, { ativo: 'C', tipo: 'S' }));
  assert.equal(r.itens.length, 10);
  assert.equal(r.linhaTotal, 15);
  assert.deepEqual(Object.keys(r.itens[0]).sort(), ['ativo', 'linha', 'tipo']);
  const cheia = abaRadar(10, { primeira: 6, maxRows: 16 }); // sem linha de total livre: bloco até o fim
  const { sb: sb2 } = ambiente({ 'Distribuição e Metas': cheia });
  cheia.l[15] = []; cheia.l[15][2] = 'ULTIMO'; // última linha da aba também preenchida
  assert.doesNotThrow(() => sb2.lerBlocoRadar_(cheia, 6, { ativo: 'C' }));
});

test('A-34: primeiraLinhaDeDadosFluxo_ acha a 1ª data com 1 leitura (e null sem data)', () => {
  const { sb, ss } = ambiente({ 'Transações': new AbaFalsa('Transações', [['Título'], ['instrução'], ['', 'Data']]) });
  // as datas precisam ser Date do MESMO realm do vm (instanceof Date dentro do .gs)
  ss.aba('Transações').getRange(4, 2).setValue(new sb.Date(2026, 0, 5));
  ss.aba('Transações').getRange(5, 2).setValue(new sb.Date(2026, 0, 6));
  const aba = ss.aba('Transações');
  const c = contar(ss);
  // coluna 2 (B): as datas estão aqui
  assert.equal(sb.primeiraLinhaDeDadosFluxo_(aba, 2), 4);
  assert.equal(c.getValue, 0);
  assert.equal(c.getValues, 1);
  const { sb: sb2, ss: ss2 } = ambiente({ 'Vazia': new AbaFalsa('Vazia', [['a'], ['b']]) });
  assert.equal(sb2.primeiraLinhaDeDadosFluxo_(ss2.aba('Vazia'), 1), null);
});

// ---------------------------------------------------------------------------
// A-35: gastos por janela + cache
// ---------------------------------------------------------------------------

const CAB_GASTOS = ['Mês', 'Data', 'Origem', 'Fonte', 'Descrição', 'Categoria', 'Valor', 'Tipo', 'Parcela', 'Arquivo', 'Chave'];
function abaGastos(meses, porMes = 2) {
  const linhas = [CAB_GASTOS];
  meses.forEach((m) => {
    for (let i = 0; i < porMes; i += 1) linhas.push([m, `${m}-1${i}`, 'cartao', 'nubank-cartao', `LOJA ${m} ${i}`, 'compras', 10 + i, 'compra', '', 'a1', `k-${m}-${i}`]);
  });
  return new AbaFalsa('aux_gastos', linhas);
}
const mesesDe = (ini, n) => Array.from({ length: n }, (_, i) => { const t = Number(ini.slice(0, 4)) * 12 + Number(ini.slice(5, 7)) - 1 + i; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; });

function chamarGastos(sb, parametros = {}) {
  const r = sb.handleGastos({ parameter: parametros }, { ok: true });
  return JSON.parse(typeof r === 'string' ? r : JSON.stringify(r));
}

test('A-35: gastos sem parâmetro devolve os últimos 12 meses + 1 de margem; de=tudo devolve tudo; meses traz o histórico inteiro', () => {
  const todos = mesesDe('2024-01', 30); // 2024-01 .. 2026-06
  const { sb } = ambiente({ aux_gastos: abaGastos(todos, 3) });
  const padrao = chamarGastos(sb);
  assert.equal(padrao.ok, true);
  assert.equal(padrao.janela.de, '2025-06', 'último mês (2026-06) menos 12');
  assert.equal(padrao.janela.completo, false);
  assert.equal(padrao.janela.primeiroMes, '2024-01');
  assert.equal(padrao.janela.ultimoMes, '2026-06');
  assert.equal(padrao.janela.total, 90);
  assert.equal(padrao.lancamentos.length, 13 * 3);
  assert.ok(padrao.lancamentos.every((l) => l[0] >= '2025-06'));
  assert.equal(padrao.meses.length, 30, 'agregação mensal do histórico inteiro');
  assert.deepEqual(padrao.meses[0], ['2024-01', 3]);
  const tudo = chamarGastos(sb, { de: 'tudo' });
  assert.equal(tudo.lancamentos.length, 90);
  assert.equal(tudo.janela.completo, true);
  const faixa = chamarGastos(sb, { de: '2025-01-15', ate: '2025-03' });
  assert.deepEqual([...new Set(faixa.lancamentos.map((l) => l[0]))], ['2025-01', '2025-02', '2025-03']);
  assert.equal(faixa.janela.completo, false);
  const curto = chamarGastos(sb, { de: '2020-01' });
  assert.equal(curto.janela.completo, true, 'de antes do 1º mês cobre tudo');
  assert.equal(curto.lancamentos.length, 90);
});

test('A-35: sem janela (lerGastos_(ss), uso interno) continua devolvendo tudo e sem os campos novos', () => {
  const { sb, ss } = ambiente({ aux_gastos: abaGastos(mesesDe('2024-01', 30), 2) });
  const r = plain(sb.lerGastos_(ss));
  assert.equal(r.lancamentos.length, 60);
  assert.equal(r.janela, undefined);
  assert.equal(r.meses, undefined);
});

test('A-35: a resposta de gastos fica em cache (0 leituras na 2ª) e uma escrita troca a chave', () => {
  const { sb, ss, ttls } = ambiente({ aux_gastos: abaGastos(mesesDe('2025-01', 6), 2), 'aux_gastos-arquivos': new AbaFalsa('aux_gastos-arquivos', [['ID', 'Nome']]) });
  const c = contar(ss);
  const a = chamarGastos(sb);
  assert.ok(c.getValues > 0, 'a 1ª lê a planilha');
  const lidas = c.getValues;
  const b = chamarGastos(sb);
  assert.equal(c.getValues, lidas, 'a 2ª não lê célula nenhuma');
  assert.deepEqual(b, a);
  assert.ok(ttls.includes(6 * 60 * 60), 'TTL de 6 h');
  // escrever (regra de categoria, pelo handler real) carimba -> próxima leitura recalcula
  const w = sb.handleSalvarRegraGastos({ parameter: { padrao: 'LOJA', categoria: 'mercado' } });
  assert.equal(JSON.parse(typeof w === 'string' ? w : JSON.stringify(w)).ok, true);
  const d = chamarGastos(sb);
  assert.ok(c.getValues > lidas, 'recalculou depois da escrita');
  assert.equal(d.regras.length, 1, 'a resposta nova já traz a regra');
  // janela diferente = outra chave
  const e = chamarGastos(sb, { de: 'tudo' });
  assert.equal(e.janela.completo, true);
});

test('A-35: gastos pela rota (doGet) aceita de/ate', () => {
  const { sb } = ambiente({ aux_gastos: abaGastos(mesesDe('2024-01', 30), 1) });
  sb.verificarToken = () => ({ ok: true, email: 'x@x' });
  const r = sb.doGet({ parameter: { action: 'gastos', token: 't', de: '2026-05' } });
  const j = JSON.parse(typeof r === 'string' ? r : JSON.stringify(r));
  assert.equal(j.janela.de, '2026-05');
  assert.equal(j.lancamentos.length, 2);
});

// ---------------------------------------------------------------------------
// A-36: carimbo de escrita + resposta de metas em cache + pré-aquecimento
// ---------------------------------------------------------------------------

test('A-36: todo POST autenticado carimba a escrita; GET, POST recusado e criarSessao não', () => {
  const { sb } = ambiente({});
  const carimbo = () => sb.carimboEscritaPlanilha_();
  const c0 = carimbo();
  sb.verificarToken = () => ({ ok: false, erro: 'x' });
  sb.doPost({ parameter: { action: 'qualquer', token: 'ruim' } });
  assert.equal(carimbo(), c0, 'sem autenticação não carimba');
  sb.verificarToken = () => ({ ok: true, email: 'x@x' });
  sb.handleCriarSessao = () => ({ ok: true });
  sb.doPost({ parameter: { action: 'criarSessao', token: 't' } });
  assert.equal(carimbo(), c0, 'login não escreve na planilha');
  sb.doPost({ parameter: { action: 'acaoInexistente', token: 't' } });
  assert.notEqual(carimbo(), c0, 'POST autenticado carimba');
});

test('A-36: montarTelaMetasComCache_ monta 1 vez, respeita o TTL curto e recalcula depois de uma escrita', () => {
  const { sb, ttls } = ambiente({ aux_metas: new AbaFalsa('aux_metas', [['Id', 'Meta (JSON)', 'Atualizado em']]), Auxiliar_ativos: new AbaFalsa('Auxiliar_ativos', [['Classe', 'Ticker']]) });
  let montagens = 0;
  sb.montarTelaMetas_ = () => { montagens += 1; return { metas: [], n: montagens, hoje: '2026-10-05' }; };
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const agora = new sb.Date('2026-10-05T15:00:00Z');
  assert.equal(plain(sb.montarTelaMetasComCache_(ss, agora)).n, 1);
  assert.equal(plain(sb.montarTelaMetasComCache_(ss, agora)).n, 1, 'cache');
  assert.equal(montagens, 1);
  assert.ok(ttls.includes(10 * 60), 'TTL de 10 min (a resposta traz cotação)');
  sb.registrarEscritaPlanilha_();
  assert.equal(plain(sb.montarTelaMetasComCache_(ss, agora)).n, 2, 'escrita invalida');
  const amanha = new sb.Date('2026-10-06T15:00:00Z');
  assert.equal(plain(sb.montarTelaMetasComCache_(ss, amanha)).n, 3, 'outro dia, outra chave');
});

test('A-36: pré-aquecimento monta metas e macro, mede a capacidade e nunca falha a etapa', () => {
  const { sb } = ambiente({ aux_metas: new AbaFalsa('aux_metas', [['Id', 'Meta (JSON)', 'Atualizado em'], ['m1', '{"x":1}', '']]) });
  const chamadas = [];
  sb.montarMacro_ = () => { chamadas.push('macro'); return {}; };
  sb.montarTelaMetas_ = () => { chamadas.push('metas'); return { metas: [] }; };
  const r = plain(sb.preAquecerMetasEMacro_());
  assert.deepEqual(chamadas, ['macro', 'metas']);
  assert.equal(r.ok, true);
  assert.match(r.detalhe, /cache \d+%/);
  assert.match(r.detalhe, /JSON metas \d+%/);
  // falha de uma das peças vai pro detalhe, não derruba
  sb.montarMacro_ = () => { throw new Error('BCB fora'); };
  const r2 = plain(sb.preAquecerMetasEMacro_());
  assert.equal(r2.ok, true);
  assert.match(r2.detalhe, /macro: BCB fora/);
});

// ---------------------------------------------------------------------------
// A-37: gerações de cache e capacidade
// ---------------------------------------------------------------------------

test('A-37: gravar a geração nova apaga a anterior da mesma família (e só dela)', () => {
  const { sb, guardado } = ambiente({});
  const chavesDe = (prefixo) => [...guardado.keys()].filter((k) => k.startsWith(prefixo));
  sb.gravarSerieHistoricoCache_('ativo_v1_aaa_2026-10-05_1', { a: 1 }, null, 'ativo_v1_aaa');
  sb.gravarSerieHistoricoCache_('ativo_v1_bbb_2026-10-05_1', { b: 1 }, null, 'ativo_v1_bbb');
  assert.equal(chavesDe('ativo_v1_aaa').length, 2, 'meta + 1 pedaço');
  sb.gravarSerieHistoricoCache_('ativo_v1_aaa_2026-10-06_1', { a: 2 }, null, 'ativo_v1_aaa');
  assert.equal(chavesDe('ativo_v1_aaa_2026-10-05').length, 0, 'a geração anterior saiu');
  assert.equal(chavesDe('ativo_v1_aaa_2026-10-06').length, 2);
  assert.equal(chavesDe('ativo_v1_bbb').length, 2, 'outra família intacta');
  assert.deepEqual(plain(sb.lerSerieHistoricoCache_('ativo_v1_aaa_2026-10-06_1')), { a: 2 });
  // chave igual (regravação): não apaga a própria
  sb.gravarSerieHistoricoCache_('ativo_v1_aaa_2026-10-06_1', { a: 3 }, null, 'ativo_v1_aaa');
  assert.deepEqual(plain(sb.lerSerieHistoricoCache_('ativo_v1_aaa_2026-10-06_1')), { a: 3 });
  assert.equal(sb.familiaCacheAtivo_('ativo_v1_k9x_2026-10-05_1_2_3'), 'ativo_v1_k9x');
});

test('A-37: o corte em pedaços respeita 100 KB em BYTES (texto com acento) e remonta igual', () => {
  const { sb, guardado } = ambiente({});
  const texto = 'ação não coração '.repeat(14000); // ~238 mil caracteres, ~1,25 byte por caractere
  const info = plain(sb.gravarSerieHistoricoCache_('chave_acentos', { t: texto, emoji: '😀'.repeat(60000) }, null, 'fam'));
  assert.ok(info.pedacos >= 3);
  [...guardado.entries()].filter(([k]) => k.startsWith('chave_acentos_')).forEach(([k, v]) => {
    if (!k.endsWith('_meta')) assert.ok(Buffer.byteLength(v) <= 100 * 1024, `${k}: ${Buffer.byteLength(v)} bytes`);
  });
  const volta = plain(sb.lerSerieHistoricoCache_('chave_acentos'));
  assert.equal(volta.t, texto);
  assert.equal(volta.emoji, '😀'.repeat(60000), 'par substituto não é partido');
  assert.equal(info.bytes, [...guardado.entries()].filter(([k]) => k.startsWith('chave_acentos_') && !k.endsWith('_meta')).reduce((s, [, v]) => s + Buffer.byteLength(v), 0));
});

test('A-37: medirCapacidade_ conta chaves/bytes do cache e o % de uso das células de JSON', () => {
  const grande = JSON.stringify({ x: 'a'.repeat(24500) }); // ~ metade do teto de 49.000
  const { sb, ss } = ambiente({
    aux_metas: new AbaFalsa('aux_metas', [['Id', 'Meta (JSON)', 'Atualizado em'], ['m1', '{"a":1}', ''], ['m2', grande, '']]),
    aux_patrimonio: new AbaFalsa('aux_patrimonio', [['Chave', 'Valor (JSON)'], ['fgts', '{"a":1}']]),
  });
  sb.gravarSerieHistoricoCache_('k1_x', { a: 1 }, null, 'fam1');
  sb.gravarSerieHistoricoCache_('k2_y', { b: 'z'.repeat(95000) }, null, 'fam2'); // 2 pedaços
  const m = plain(sb.medirCapacidade_(ss));
  assert.equal(m.cache.familias, 2);
  assert.equal(m.cache.chaves, 2 + 3, '(1 pedaço + meta) + (2 pedaços + meta)');
  assert.ok(m.cache.bytes > 95000);
  assert.equal(m.cache.limiteItens, 1000);
  assert.ok(m.cache.pctItens > 0 && m.cache.pctItens < 0.01);
  const metas = m.celulas.find((c) => c.id === 'metas');
  assert.equal(metas.linhas, 2);
  assert.equal(metas.maior, grande.length);
  assert.equal(metas.teto, 49000);
  assert.ok(Math.abs(metas.pct - grande.length / 49000) < 0.001);
  assert.equal(metas.aviso, false);
  assert.equal(m.aviso, false);
  assert.equal(m.celulas.find((c) => c.id === 'patrimonio').linhas, 1);
  assert.equal(m.celulas.find((c) => c.id === 'fiiPortfolio').linhas, 0, 'aba que não existe: 0');
  // perto do limite -> aviso
  const cheia = JSON.stringify({ x: 'a'.repeat(40000) });
  ss.aba('aux_metas').l[1][1] = { v: cheia, f: '', r1c1: '' };
  const m2 = plain(sb.medirCapacidade_(ss));
  assert.equal(m2.celulas.find((c) => c.id === 'metas').aviso, true);
  assert.equal(m2.aviso, true);
  assert.match(sb.resumoCapacidade_(m2), /ATENÇÃO/);
});

test('A-37: GET action=capacidade devolve a medição', () => {
  const { sb } = ambiente({ aux_metas: new AbaFalsa('aux_metas', [['Id', 'Meta (JSON)'], ['m1', '{"a":1}']]) });
  sb.verificarToken = () => ({ ok: true, email: 'x@x' });
  const r = sb.doGet({ parameter: { action: 'capacidade', token: 't' } });
  const j = JSON.parse(typeof r === 'string' ? r : JSON.stringify(r));
  assert.equal(j.ok, true);
  assert.equal(j.cache.limiteItens, 1000);
  assert.equal(j.celulas.length, 3);
});

// ---------------------------------------------------------------------------
// A-17 (resto) e MALL11 -> PMLL11
// ---------------------------------------------------------------------------

test('A-14/A-17: MALL11 virou PMLL11 (renomeação pública) e o provento do ticker antigo conta no atual, em todas as classes', () => {
  const { sb } = ambiente({});
  assert.equal(sb.resolverAliasTicker_('mall11'), 'PMLL11');
  assert.deepEqual(plain(sb.aliasesDoTicker_('PMLL11')).sort(), ['MALL11', 'PMLL11']);
  const tela = {
    hoje: '2026-10-05',
    recebidos: [
      { data: '2026-08-10', ticker: 'MALL11', classe: 'fiis', valor: 5 },
      { data: '2026-09-10', ticker: 'PMLL11', classe: 'fiis', valor: 10 },
      { data: '2026-09-12', ticker: 'USAA', classe: 'acoesEua', valor: 20 },
    ],
    aReceber: [{ ticker: 'PMLL11', classe: 'fiis', tipo: 'Rendimento', dataPagamento: '2026-09-20', valor: 7, fonte: 'FNet' }, { ticker: 'PMLL11', classe: 'fiis', dataPagamento: '2026-10-20', valor: 99 }],
    pagosNaoLancados: [{ ticker: 'XXXX3', classe: 'acoes', tipo: 'JCP', dataPagamento: '2026-09-25', valor: 3 }],
  };
  const r = plain(sb.montarTelaMetas_(sb.SpreadsheetApp.getActiveSpreadsheet(), new sb.Date('2026-10-05T12:00:00Z'), { ativos: [], referencias: {}, proventos: tela, buscarCambio: () => ({}), historicoResumo: null }));
  assert.equal(r.proventos12m.porTicker.PMLL11, 22, '5 (MALL11) + 10 + 7 (a receber já pago, presumido); o de outubro/futuro fica fora');
  assert.equal(r.proventos12m.porTicker.USAA, 20, 'ação EUA também conta');
  assert.equal(r.proventos12m.porTicker.XXXX3, 3, 'pago ainda não lançado entra (mesma base da tela Proventos)');
  assert.equal(r.proventos12m.porTicker.MALL11, undefined);
});

test('A-17: rendaMensalMeta_ usa o ticker atual nos dois lados (vínculo a MALL11 pega o PMLL11)', () => {
  const { sb } = ambiente({});
  const fontes = {
    hojeMes: '2026-10', rvMes: {},
    recebidos: [
      { data: '2026-08-10', ticker: 'MALL11', classe: 'fiis', valor: 5 },
      { data: '2026-09-10', ticker: 'PMLL11', classe: 'fiis', valor: 10 },
      { data: '2026-09-11', ticker: 'OUTRO11', classe: 'fiis', valor: 100 },
    ],
  };
  for (const id of ['MALL11', 'PMLL11']) {
    const r = plain(sb.rendaMensalMeta_({ vinculos: [{ tipo: 'ativo', id, modo: 'total' }] }, fontes));
    const total = (r.meses || r).reduce((s, x) => s + (x.valor || 0), 0);
    assert.equal(total, 15, `vínculo ${id}`);
  }
});

// ---------------------------------------------------------------------------
// A-72: orçamento de leitura por ação (planilha real, se existir)
// ---------------------------------------------------------------------------

test('A-72: orçamento de leitura por ação (fixtures reais): sem leitura por célula nos blocos do Radar, gastos e metas quentes sem ler a planilha', { skip: !fs.existsSync(FIXTURES) }, async () => {
  const { montarSandboxPrevia } = await import('./previa.mjs');
  const sb = montarSandboxPrevia();
  const SA = sb.SpreadsheetApp;
  const orig = SA.getActiveSpreadsheet();
  const c = { getValues: 0, getValue: 0, celulas: 0 };
  const envolver = (aba) => new Proxy(aba, {
    get(t, p) {
      if (p !== 'getRange') return t[p];
      return (...a) => new Proxy(t.getRange(...a), {
        get(t2, q) {
          if (q === 'getValues') return () => { const v = t2.getValues(); c.getValues += 1; c.celulas += v.length * (v[0] ? v[0].length : 0); return v; };
          if (q === 'getValue') return () => { c.getValue += 1; c.celulas += 1; return t2.getValue(); };
          return t2[q];
        },
      });
    },
  });
  const ss = { getSheetByName: (n) => { const a = orig.getSheetByName(n); return a ? envolver(a) : a; }, insertSheet: (n) => orig.insertSheet(n) };
  SA.getActiveSpreadsheet = () => ss; SA.getActive = () => ss;
  const zerar = () => { c.getValues = 0; c.getValue = 0; c.celulas = 0; };
  const rodar = (action, extra = {}) => { zerar(); const r = sb.doGet({ parameter: { action, ...extra } }); return JSON.parse(r.getContent()); };

  // distribuicoesMetas: antes ~505 getValue (1 por célula do Radar); agora só os valores soltos dos cabeçalhos
  const dm = rodar('distribuicoesMetas');
  assert.equal(dm.ok, true);
  assert.ok(c.getValue <= 12, `distribuicoesMetas: ${c.getValue} getValue por célula (limite 12)`);
  // carteirasFiis (lerMapaTipoFiisPorTicker_): antes ~33
  rodar('carteirasFiis');
  assert.ok(c.getValue <= 5, `carteirasFiis: ${c.getValue} getValue por célula (limite 5)`);
  // gastos: a 2ª chamada não lê célula nenhuma; a resposta padrão cabe em 300 KB
  rodar('gastos');
  const g = rodar('gastos');
  assert.equal(c.getValues + c.getValue, 0, 'gastos quente: 0 leituras');
  assert.ok(JSON.stringify(g).length < 300 * 1024, `gastos padrão: ${(JSON.stringify(g).length / 1024).toFixed(0)} KB (limite 300 KB)`);
  assert.equal(g.janela.completo, false);
  // metas: a 2ª chamada vem do cache da resposta
  rodar('metas');
  rodar('metas');
  assert.equal(c.getValues + c.getValue, 0, 'metas quente: 0 leituras');
});
