// tests/harness/aporte-eua-lancamento.test.js
//
// 07/10/2026: aporte de Ações EUA concluído no site vira lançamento em 'Transações - USA' (a conclusão JÁ é o lançamento:
// EUA não tem importação da B3). Concluir grava uma linha por ativo (só colunas A:F), reconcluir não duplica, editar atualiza,
// excluir/reabrir remove SÓ as linhas que o aporte gravou, e lancarAportesEuaPendentes() cobre os concluídos de antes.
// Planilha falsa, tickers e valores inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const plain = (x) => JSON.parse(JSON.stringify(x));
const D = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

function planilhaFalsa(inicial = {}, { maxRows = 60 } = {}) {
  const abas = {};
  const criar = (nome, linhas = []) => {
    const dados = linhas.map((l) => [...l]);
    let max = Math.max(maxRows, dados.length);
    abas[nome] = {
      _dados: dados,
      getMaxRows: () => max,
      getLastRow: () => { for (let i = dados.length - 1; i >= 0; i--) if ((dados[i] || []).some((v) => v !== '' && v != null)) return i + 1; return 0; },
      insertRowsAfter: (_, n) => { max += n; },
      deleteRow: (r) => { dados.splice(r - 1, 1); },
      getRange: (r1, c1, n = 1, nc = 1) => ({
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (dados[r1 - 1 + i] || [])[c1 - 1 + j]; return v == null ? '' : v; })),
        getValue: () => { const v = (dados[r1 - 1] || [])[c1 - 1]; return v == null ? '' : v; },
        setValues: (vals) => vals.forEach((l, i) => { const row = dados[r1 - 1 + i] || (dados[r1 - 1 + i] = []); l.forEach((v, j) => { row[c1 - 1 + j] = v; }); }),
        sort: ({ column }) => {
          const bloco = Array.from({ length: n }, (_, i) => (dados[r1 - 1 + i] || []).slice(c1 - 1, c1 - 1 + nc));
          const k = column - c1;
          const val = (x) => (x instanceof Date ? x.getTime() : x);
          bloco.sort((a, b) => (val(a[k]) < val(b[k]) ? -1 : val(a[k]) > val(b[k]) ? 1 : 0));
          bloco.forEach((l, i) => { const row = dados[r1 - 1 + i] || (dados[r1 - 1 + i] = []); l.forEach((v, j) => { row[c1 - 1 + j] = v; }); });
        },
      }),
    };
    return abas[nome];
  };
  Object.entries(inicial).forEach(([n, l]) => criar(n, l));
  return { getSheetByName: (n) => abas[n] || null, insertSheet: (n) => criar(n) };
}

const cab = (n) => Array.from({ length: n }, () => ['']);
const CAB_APORTES = ['ID', 'Data', 'Status', 'Classe', 'Ativo', 'Instituição', 'Moeda', 'Qtd planejada', 'Preço planejado', 'Valor planejado', 'Qtd final', 'Preço final', 'Valor final', 'Observação', 'Criado em', 'Atualizado em'];
function planilhaBase(extra = {}) {
  return planilhaFalsa({
    'Transações': [...cab(5), ['Ticker', 'Data', 'Tipo', 'Preço', 'Qtd.', 'Taxa'], ['ABCD3', D('2026-08-10'), 'Compra', 20, 10, '']],
    'Transações - USA': [...cab(5), ['Ticker', 'Data', 'Tipo', 'Preço', 'Qtd.', 'Taxa'], ['ZZZA', D('2026-04-09'), 'Compra', 8.28, 2, 0.1]],
    'Transações Renda Fixa': [...cab(5), ['Produto']],
    'Auxiliar_ativos': [['Classe', 'Ticker'], ['Ações', 'ABCD3'], ['Ações EUA', 'ZZZA'], ['Ações EUA', 'ZZZB'], ['Ações EUA', 'ZZZC']],
    ...extra,
  });
}

function sandbox(ss) {
  const sb = {
    console: { log() {} }, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: { formatDate: () => '20261005-101010' },
    chaveDiaISOInicio_: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    normalizarInstituicaoRF_: (i) => String(i || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    classesDaCarteiraParaProventos_: () => ({}),
    mapasDoPatrimonioParaProventos_: () => ({ mapaCambioUsd: {} }),
    cambioUsdParaData_: () => null,
    gravarRegistroControle_: (...a) => { sb._registro.push(a); }, limparCacheHistoricoInicio_: () => {}, jsonOut: (x) => x,
    _registro: [],
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  new vm.Script(['Planilha.gs', 'ImportB3.gs', 'Lancamentos.gs', 'Aportes.gs', 'Deduplicacao.gs', 'CarteirasHome.gs', 'Consolidacao.gs'].map((f) => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8')).join('\n'), { filename: 'aporte-eua.gs' }).runInContext(sb);
  return sb;
}

const concluir = (sb, itens, extra = {}) => sb.salvarAporte_({ data: '2026-10-05', status: 'concluido', observacao: '', itens: itens.map((i) => ({ classe: 'acoesEua', valorFinal: i.qtdFinal * i.precoFinal, ...i })), ...extra });
const iso = (d) => (d && typeof d.getTime === 'function' ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : d);
const linhasUsa = (ss) => ss.getSheetByName('Transações - USA')._dados.slice(6).filter((l) => l && l[0] !== '' && l[0] != null)
  .map((l) => [l[0], iso(l[1]), l[2], l[3], l[4], l[5]]);
const ZZZA = { ativo: 'ZZZA', qtdFinal: 1, precoFinal: 26.25 };
const ZZZB = { ativo: 'ZZZB', qtdFinal: 3, precoFinal: 40.85 };

test('concluir aporte EUA grava uma linha por ativo (A:F), sem tocar nas outras colunas, e o "a confirmar" some', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  const id = concluir(sb, [ZZZA, ZZZB]);
  const usa = ss.getSheetByName('Transações - USA');
  assert.deepEqual(linhasUsa(ss).slice(1).map((l) => l.slice(0, 5)), [
    ['ZZZA', '2026-10-05', 'Compra', 26.25, 1], ['ZZZB', '2026-10-05', 'Compra', 40.85, 3],
  ]);
  assert.ok(linhasUsa(ss).slice(1).every((l) => l[5] === ''), 'sem taxa informada: coluna da taxa vazia');
  assert.ok(usa._dados.slice(6).every((l) => !l || l.length <= 6), 'só as colunas A:F foram escritas');
  assert.equal(usa.getLastRow(), 9, 'a linha manual de antes continua e as 2 novas entram logo abaixo');
  assert.deepEqual(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)), []);
  const reg = ss.getSheetByName('aux_aportes_eua')._dados.slice(1);
  assert.deepEqual(reg.map((l) => [l[0], l[1]]), [[id, 'ZZZA'], [id, 'ZZZB']]);
  assert.equal(ss.getSheetByName('Transações')._dados.length, 7, 'nada vai pra aba das ações BR');
});

test('reconcluir / salvar de novo o mesmo aporte não duplica', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  const id = concluir(sb, [ZZZA, ZZZB]);
  concluir(sb, [ZZZA, ZZZB], { id });
  concluir(sb, [ZZZA, ZZZB], { id });
  assert.equal(linhasUsa(ss).length, 3);
  assert.equal(ss.getSheetByName('aux_aportes_eua')._dados.length, 3, 'registro: cabeçalho + 2');
  concluir(sb, [ZZZA, ZZZB]); // mesmo clique repetido (sem id): a deduplicação do aporte ignora
  assert.equal(linhasUsa(ss).length, 3);
  assert.equal(sb.lancarAportesEuaPendentes().gravadas, 0, 'a rotina de pendentes também não duplica');
  assert.equal(linhasUsa(ss).length, 3);
});

test('editar o aporte concluído atualiza as linhas (quantidade, preço e ativo que saiu)', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  const id = concluir(sb, [ZZZA, ZZZB]);
  concluir(sb, [{ ...ZZZA, qtdFinal: 2, valorFinal: 52.5 }, ZZZB], { id });
  assert.deepEqual(linhasUsa(ss).slice(1).map((l) => [l[0], l[4]]).sort(), [['ZZZA', 2], ['ZZZB', 3]]);
  concluir(sb, [ZZZA], { id }); // tirou o ZZZB
  assert.deepEqual(linhasUsa(ss).slice(1).map((l) => [l[0], l[4]]), [['ZZZA', 1]]);
  assert.equal(ss.getSheetByName('aux_aportes_eua')._dados.length, 2);
  // a planilha original (linha de 2026-04) continua intacta
  assert.deepEqual(linhasUsa(ss)[0].slice(0, 5), ['ZZZA', '2026-04-09', 'Compra', 8.28, 2]);
});

test('excluir o aporte remove só as linhas dele (não as digitadas à mão nem as de outro aporte)', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  const a1 = concluir(sb, [ZZZA, ZZZB]);
  const a2 = concluir(sb, [{ ativo: 'ZZZC', qtdFinal: 5, precoFinal: 10 }], { data: '2026-10-06' });
  // linha digitada à mão com o MESMO conteúdo de uma do aporte (outro ticker/dia) e uma importada
  sb.importarLancamentos_([{ destino: 'transacoesUsa', ticker: 'ZZZB', data: '2026-09-01', tipo: 'Compra', preco: 39, qtd: 1, taxa: 0 }], { origem: 'Importação' });
  assert.equal(linhasUsa(ss).length, 5);
  assert.equal(sb.excluirAporte_(a1), 2);
  assert.deepEqual(linhasUsa(ss).map((l) => `${l[0]}:${l[4]}`).sort(), ['ZZZA:2', 'ZZZB:1', 'ZZZC:5']);
  assert.deepEqual(ss.getSheetByName('aux_aportes_eua')._dados.slice(1).map((l) => [l[0], l[1]]), [[a2, 'ZZZC']]);
  // reabrir (concluído -> aguardando) também tira as linhas
  sb.salvarAporte_({ id: a2, data: '2026-10-06', status: 'aguardando', observacao: '', itens: [{ classe: 'acoesEua', ativo: 'ZZZC', qtdPlanejada: 5, precoPlanejado: 10, valorPlanejado: 50 }] });
  assert.deepEqual(linhasUsa(ss).map((l) => `${l[0]}:${l[4]}`).sort(), ['ZZZA:2', 'ZZZB:1']);
  assert.equal(ss.getSheetByName('aux_aportes_eua')._dados.slice(1).length, 0);
});

test('compra equivalente já lançada à mão (mesmo ticker, data +-2 dias, mesma qtd, preço +-1%) não vira linha dupla e não é apagada ao excluir', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  sb.importarLancamentos_([{ destino: 'transacoesUsa', ticker: 'ZZZB', data: '2026-10-04', tipo: 'Compra', preco: 40.9, qtd: 3, taxa: 0.5 }], { origem: 'Manual' });
  const id = concluir(sb, [ZZZA, ZZZB]);
  assert.deepEqual(linhasUsa(ss).slice(1).map((l) => l[0] + ':' + l[1]).sort(), ['ZZZA:2026-10-05', 'ZZZB:2026-10-04'], 'só a ZZZA entrou');
  sb.excluirAporte_(id);
  assert.deepEqual(linhasUsa(ss).slice(1).map((l) => l[0]), ['ZZZB'], 'a digitada à mão fica');
});

test('compra com data antiga entra na ordem certa e ainda é achada pelo conteúdo ao excluir', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  concluir(sb, [{ ativo: 'ZZZC', qtdFinal: 1, precoFinal: 10 }], { data: '2026-10-05' });
  const antigo = concluir(sb, [ZZZB], { data: '2026-02-01' });
  assert.deepEqual(linhasUsa(ss).map((l) => l[1]), ['2026-02-01', '2026-04-09', '2026-10-05']);
  sb.excluirAporte_(antigo);
  assert.deepEqual(linhasUsa(ss).map((l) => l[0]), ['ZZZA', 'ZZZC']);
});

test('lancarAportesEuaPendentes grava os concluídos de antes (caso: aporte de 2 ativos sem linha na aba), lista o que gravou e é idempotente', () => {
  const L = (id, ativo, qtd, preco) => [id, D('2026-10-05'), 'Concluído', 'acoesEua', ativo, '', 'USD', qtd, preco, qtd * preco, qtd, preco, qtd * preco, '', D('2026-10-06'), D('2026-10-06')];
  const ss = planilhaBase({ aux_aportes: [CAB_APORTES, L('AP-1', 'ZZZA', 1, 26.25), L('AP-1', 'ZZZB', 1, 40.85)] });
  const sb = sandbox(ss);
  const antes = plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null));
  assert.deepEqual(antes.map((x) => [x.ativo, x.destino, x.moeda, x.qtd, x.preco, x.valor, x.lancavel, x.aporteId]).sort(), [
    ['ZZZA', 'transacoesUsa', 'USD', 1, 26.25, 26.25, true, 'AP-1'], ['ZZZB', 'transacoesUsa', 'USD', 1, 40.85, 40.85, true, 'AP-1'],
  ]);
  const r = plain(sb.lancarAportesEuaPendentes());
  assert.equal(r.gravadas, 2);
  assert.deepEqual(r.lancados.map((x) => x.ativo).sort(), ['ZZZA', 'ZZZB']);
  assert.deepEqual(linhasUsa(ss).slice(1).map((l) => [l[0], l[3], l[4]]), [['ZZZA', 26.25, 1], ['ZZZB', 40.85, 1]]);
  assert.ok(sb._registro.some((a) => /lancarAportesEuaPendentes/.test(a[2]) && /ZZZA/.test(a[2]) && /ZZZB/.test(a[2])), 'o que gravou vai pro Registro');
  assert.deepEqual(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)), []);
  assert.equal(sb.lancarAportesEuaPendentes().gravadas, 0, 'rodar de novo não grava nada');
  assert.equal(linhasUsa(ss).length, 3);
  // e quem foi lançado pela rotina também é "do aporte": excluir remove
  sb.excluirAporte_('AP-1');
  assert.equal(linhasUsa(ss).length, 1);
});

test('handler "Lançar agora" (lancarAportesEua) grava só o aporte pedido e devolve a lista de a confirmar atualizada', () => {
  const L = (id, ativo, qtd, preco) => [id, D('2026-10-05'), 'Concluído', 'acoesEua', ativo, '', 'USD', qtd, preco, qtd * preco, qtd, preco, qtd * preco, '', D('2026-10-06'), D('2026-10-06')];
  const ss = planilhaBase({ aux_aportes: [CAB_APORTES, L('AP-1', 'ZZZA', 1, 26.25), L('AP-2', 'ZZZB', 1, 40.85)] });
  const sb = sandbox(ss);
  const r = plain(sb.handleLancarAportesEua({ parameter: { aporteId: 'AP-1' } }));
  assert.equal(r.ok, true);
  assert.equal(r.gravadas, 1);
  assert.deepEqual(r.aConfirmar.map((x) => x.ativo), ['ZZZB']);
  assert.equal(linhasUsa(ss).length, 2);
});

test('ticker que não está cadastrado em Ações EUA não é lançado: fica a confirmar (nunca perde o aporte)', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  const id = concluir(sb, [{ ativo: 'NAOEXISTE', qtdFinal: 1, precoFinal: 5 }]);
  assert.equal(linhasUsa(ss).length, 1);
  assert.deepEqual(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).map((x) => x.ativo), ['NAOEXISTE']);
  const r = plain(sb.lancarAportesEuaPendentes());
  assert.equal(r.gravadas, 0);
  assert.match(r.naoLancados[0].motivo, /não está cadastrado/);
  assert.ok(id);
});

test('as fórmulas das colunas G+ da linha nova são copiadas da de cima quando faltam', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  const usa = ss.getSheetByName('Transações - USA');
  const copias = [];
  const getRange = usa.getRange;
  usa.getLastColumn = () => 10;
  usa.getRange = (r, c, n, nc) => {
    const rg = getRange(r, c, n, nc);
    if (c === 7) { rg.getFormulas = () => [Array(nc).fill(r === 8 ? '' : '=X')]; rg.copyTo = (dest) => copias.push([r, dest]); }
    return rg;
  };
  concluir(sb, [ZZZA]); // a linha nova é a 8: sem fórmulas -> copia da 7
  assert.equal(copias.length, 1);
  assert.equal(copias[0][0], 7);
});
