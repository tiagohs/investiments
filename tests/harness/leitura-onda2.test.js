// tests/harness/leitura-onda2.test.js
//
// 05/10/2026 (auditoria A-31, A-32, A-33, A-38, A-72 e o resto do A-18 - Onda 2, frente "leitura e cache no backend").
// Planilha inventada (nenhum dado real): Transações & cia com fórmula de preenchimento até a linha ~10.800 (como a real),
// e o .gs de verdade rodando num vm (sandboxGas). A parte final (orçamento de células por ação) usa fixtures.json, se existir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AbaFalsa, planilhaFalsa, sandboxGas, D, plain } from './planilha-falsa.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEM_FIXTURES = fs.existsSync(path.join(__dirname, 'fixtures.json'));
const PREENCHIMENTO = 10800;

/** Aba de lançamentos: 6 linhas de cabeçalho, `dados` (linhas já com colunas) e fórmula "0" na coluna K até PREENCHIMENTO. */
function abaComPreenchimento(nome, dados, { cabecalho = 6, colFormula = 11, total = PREENCHIMENTO } = {}) {
  const linhas = [];
  for (let i = 1; i <= cabecalho; i++) linhas.push(i === 2 ? ['TÍTULO DECORATIVO', 'Data'] : []);
  for (let i = cabecalho + 1; i <= total; i++) {
    const real = dados[i - cabecalho - 1];
    const linha = real ? real.slice() : [];
    while (linha.length < colFormula - 1) linha.push('');
    if (linha[colFormula - 1] === undefined || linha[colFormula - 1] === '') linha[colFormula - 1] = { f: `=SE(A${i}="";0;1)`, v: 0 };
    linhas.push(linha);
  }
  return new AbaFalsa(nome, linhas);
}

/**
 * Sandbox com a planilha vazia; as abas entram DEPOIS (ambiente.abas), porque as datas da planilha precisam ser do
 * mesmo vm que roda o .gs (instanceof Date). `D(ambiente, 'aaaa-mm-dd')` cria a data.
 */
function ambiente(opcoes) {
  const ss = planilhaFalsa({});
  const r = sandboxGas(ss, opcoes);
  const poe = (abas) => { Object.entries(abas).forEach(([n, a]) => { ss.abas[n] = a instanceof AbaFalsa ? a : new AbaFalsa(n, a); }); return ss; };
  return { ...r, ss, poe, d: (iso) => D(r.sb, iso) };
}

/** Conta células/chamadas lidas por getValues numa aba (monkey patch). */
function contar(aba) {
  const c = { chamadas: 0, celulas: 0 };
  const original = aba.getRange.bind(aba);
  aba.getRange = (...a) => {
    const r = original(...a);
    const gv = r.getValues.bind(r);
    r.getValues = () => { c.chamadas += 1; c.celulas += r.nr * r.nc; return gv(); };
    return r;
  };
  return c;
}

test('A-31: ultimaLinhaReal_ acha a última linha de verdade lendo só as colunas-chave em blocos (não as 10.800 linhas de fórmula)', () => {
  const { sb } = sandboxGas(planilhaFalsa({}));
  const dados = (n) => Array.from({ length: n }, (_, i) => ['TEST3', D(sb, '2026-01-05'), 'Compra', 10 + i, 1, 0]);
  const aba = abaComPreenchimento('Transações', dados(12));
  const c = contar(aba);
  assert.equal(aba.getLastRow(), PREENCHIMENTO, 'premissa: getLastRow() é o fim do preenchimento');
  assert.equal(sb.ultimaLinhaReal_(aba, [1, 2], 7), 6 + 12);
  assert.ok(c.celulas <= 1000 && c.chamadas === 1, `1 bloco de 500x2 (${c.celulas} células, ${c.chamadas} leituras)`);

  // mais de um bloco (700 linhas reais)
  const aba2 = abaComPreenchimento('Transações', dados(700));
  const c2 = contar(aba2);
  assert.equal(sb.ultimaLinhaReal_(aba2, [1, 2], 7), 6 + 700);
  assert.equal(c2.chamadas, 2);

  // só cabeçalho: devolve primeiraLinha - 1
  assert.equal(sb.ultimaLinhaReal_(abaComPreenchimento('Transações', []), [1, 2], 7), 6);
  // aba curta (sem preenchimento): nunca passa de getLastRow()
  const curta = new AbaFalsa('Carteira Renda Fixa', [[], [], [], [], [], [], [], ['cab'], ['T1', '', '', 'Tesouro'], ['T2', '', '', 'Tesouro']]);
  assert.equal(sb.ultimaLinhaReal_(curta, [1, 4], 9), 10);
});

test('A-31: o fluxo de caixa dá o MESMO resultado com e sem as 10.800 linhas de fórmula (só deixa de ler lixo)', () => {
  const rodar = (cheio) => {
    const amb = ambiente({ agora: new Date('2026-10-05T15:00:00Z') });
    const d = amb.d;
    const total = cheio ? PREENCHIMENTO : 40;
    amb.poe({
      'Transações': abaComPreenchimento('Transações', [
        ['TEST3', d('2026-01-05'), 'Compra', 10, 10, 0, '', 100, '', '', 10],
        ['TEST3', d('2026-02-02'), 'Compra', 12, 10, 0, '', 120, '', '', 10],
        ['TEST3', d('2026-02-20'), 'Venda', 13, 5, 0, '', 65, '', '', -5],
      ], { total }),
      'Transações - USA': abaComPreenchimento('Transações - USA', [['USAX', d('2026-01-10'), 'Compra', 10, 2, 0, '', 20, '', '', 2]], { total }),
      'Transações Renda Fixa': abaComPreenchimento('Transações Renda Fixa', [['Tesouro Selic 2029', d('2026-01-15'), 'Compra', 'Credito', 'XP', 1, 1000, 1000]], { total }),
      'Carteira Renda Fixa': [[], [], [], [], [], [], [], ['cab'], ['TSEL29', 'Renda Fixa', '', 'Tesouro Selic', 'SELIC', 'XP', '', '', 1000, '', d('2029-03-01'), 1100]],
      'Proventos': [[], [], [], [], [], [], ['Data com', 'Data pagamento', 'Ticker', 'Tipo', 'Qtd', 'Valor', 'Líquido'], [d('2026-02-01'), d('2026-02-15'), 'TEST3', 'Dividendo', 10, 0.5, 5]],
      'Proventos - USA': [],
    });
    return plain(amb.sb.calcularFluxoCaixaDiario_({ '2026-01-10': 5 }, { TEST3: 'BR' }));
  };
  const cheio = rodar(true), curto = rodar(false);
  assert.ok(Object.keys(cheio.total).length >= 4 && Object.keys(cheio.usa).length === 1 && cheio.listaProventos.length === 1, 'premissa: o fluxo leu os lançamentos');
  assert.deepEqual(cheio, curto);
});

test('A-32: a chave de cache passa a mudar quando entra uma linha na aba (mesmo com getLastRow fixo) e quando o carimbo de escrita muda', () => {
  const montar = (n) => {
    const amb = ambiente();
    const linhaTx = () => ['TEST3', amb.d('2026-01-05'), 'Compra', 10, 1, 0];
    amb.poe({
      'Transações': abaComPreenchimento('Transações', Array.from({ length: n }, linhaTx)),
      'Transações - USA': abaComPreenchimento('Transações - USA', []),
      'Transações Renda Fixa': abaComPreenchimento('Transações Renda Fixa', []),
      'Proventos': [],
      'Proventos - USA': [],
    });
    return amb;
  };
  const a = montar(10), b = montar(11);
  const chaveA = a.sb.contarLinhasFluxoCaixa_(a.ss), chaveB = b.sb.contarLinhasFluxoCaixa_(b.ss);
  assert.equal(a.ss.aba('Transações').getLastRow(), b.ss.aba('Transações').getLastRow(), 'premissa: getLastRow igual (preenchimento)');
  assert.notEqual(chaveA, chaveB, 'uma linha a mais muda a chave');
  assert.equal(a.sb.contarLinhasFluxoCaixa_(a.ss), chaveA, 'sem mudança, a chave é estável');
  a.props.set('PLANILHA_CARIMBO_ESCRITA', '1');
  const antes = a.sb.contarLinhasFluxoCaixa_(a.ss);
  a.sb.registrarEscritaPlanilha_();
  assert.notEqual(a.sb.contarLinhasFluxoCaixa_(a.ss), antes, 'o carimbo de escrita (Limpar cache, lançamento, importação) invalida também correção no lugar');
  // a chave da série usa a mesma assinatura
  assert.match(a.sb.montarChaveCacheSerie_(1, 2, 3, chaveA), /^historico_serie_v\d+_\d{4}-\d{2}-\d{2}_1_2_3_/);
});

// 08/10/2026 (Etapa 0 - geração): qualquer edição à mão sobe a geração (antes: só as abas do fluxo de caixa - editar
// Carteira Ações, Auxiliar_ativos, Metas... à mão deixava o site com o número velho)
test('A-32: aoEditarPlanilha_ carimba edição à mão em QUALQUER aba (a geração dos dados sobe)', () => {
  const { sb, props } = sandboxGas(planilhaFalsa({}));
  const edicao = (nome) => ({ range: { getSheet: () => ({ getName: () => nome }) } });
  sb.aoEditarPlanilha_(edicao('Salário'));
  const g1 = props.get('PLANILHA_CARIMBO_ESCRITA');
  assert.ok(g1);
  sb.aoEditarPlanilha_(edicao('Transações'));
  assert.notEqual(props.get('PLANILHA_CARIMBO_ESCRITA'), g1);
  assert.doesNotThrow(() => sb.aoEditarPlanilha_(null));
});

test('A-33: lerAbaUmaVez_ lê a mesma faixa 1 vez por execução (só ligada no doGet); mais colunas relê uma vez; escrever esquece', () => {
  const aba = new AbaFalsa('aux_historico-patrimonio', [['Data', 'Ticker'], [1, 'A', 'BR', 3], [2, 'B', 'BR', 4]]);
  const c = contar(aba);
  const { sb } = sandboxGas(planilhaFalsa({}));
  sb.lerAbaUmaVez_(aba, 2, 2, 4); sb.lerAbaUmaVez_(aba, 2, 2, 4);
  assert.equal(c.chamadas, 2, 'desligada (gatilho/sync/doPost): lê direto, sempre');
  sb.ativarLeituraUnica_();
  sb.lerAbaUmaVez_(aba, 2, 2, 4); sb.lerAbaUmaVez_(aba, 2, 2, 3); sb.lerAbaUmaVez_(aba, 2, 2, 4);
  assert.equal(c.chamadas, 3, 'ligada: 1 leitura pra 3 pedidos (o de menos colunas reaproveita)');
  sb.lerAbaUmaVez_(aba, 2, 2, 5);
  assert.equal(c.chamadas, 4, 'pediu mais colunas: relê 1 vez');
  sb.lerAbaUmaVez_(aba, 2, 2, 5);
  assert.equal(c.chamadas, 4);
  sb.registrarEscritaPlanilha_();
  sb.lerAbaUmaVez_(aba, 2, 2, 5);
  assert.equal(c.chamadas, 5, 'depois de uma escrita (registrarEscritaPlanilha_) volta a ler direto');
  sb.ativarLeituraUnica_();
  assert.deepEqual(plain(sb.lerAbaUmaVez_(aba, 2, 2, 3)), [[1, 'A', 'BR'], [2, 'B', 'BR']]);
});

test('A-38: chaveDiaISOInicio_ memorizada devolve o mesmo que o Intl direto (inclusive virada de dia em SP) e continua recusando data inválida', () => {
  const { sb } = sandboxGas(planilhaFalsa({}));
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const instantes = ['2026-01-05T02:59:59Z', '2026-01-05T03:00:00Z', '2026-03-08T05:00:00Z', '2026-10-05T23:59:59Z', '2020-02-29T12:00:00Z'];
  for (let k = 0; k < 2; k++) instantes.forEach((i) => assert.equal(sb.chaveDiaISOInicio_(new sb.Date(i)), fmt.format(new Date(i)), i));
  assert.throws(() => sb.chaveDiaISOInicio_(new sb.Date('x')), /Invalid time value/);
});

test('A-18: proventosDoAtivo_ inclui o tipo "Juros" quando o ativo é de renda variável e continua tirando quando a classe é desconhecida', () => {
  const amb = ambiente({ agora: new Date('2026-10-05T15:00:00Z') });
  const d = amb.d;
  amb.poe({ 'Proventos': [[], [], [], [], [], [], [], [d('2026-02-01'), d('2026-02-15'), 'TEST3', 'Juros', 10, 0.5, 5], [d('2026-03-01'), d('2026-03-15'), 'TEST3', 'Dividendo', 10, 0.2, 2], [d('2026-03-01'), d('2026-03-16'), 'Erro', 'Juros', 1, 1, 9]] });
  const sb = amb.sb;
  const tipos = (classe) => plain(sb.proventosDoAtivo_(amb.ss, 'TEST3', {}, classe)).map((p) => p.tipo);
  assert.deepEqual(tipos('acoes'), ['Juros', 'Dividendo']);
  assert.deepEqual(tipos('fiis'), ['Juros', 'Dividendo']);
  assert.deepEqual(tipos(null), ['Dividendo'], 'sem classe: o "Juros" (cupom de título) segue de fora');
  assert.equal(plain(sb.proventosDoAtivo_(amb.ss, 'ERRO', {}, 'acoes')).length, 1, 'o ticker "Erro" só aparece se alguém pedir esse ticker');
});

// ---------------------------------------------------------------------------
// A-72: orçamento de leitura por ação (planilha real das fixtures; nenhum número real no arquivo)
// ---------------------------------------------------------------------------

async function medirAcao(acao, params = {}) {
  const { montarSandboxPrevia } = await import('./previa.mjs');
  const sb = montarSandboxPrevia();
  const c = { celulas: 0, getValues: 0, leiturasGrandesDeLancamentos: 0 };
  const ssOrig = sb.SpreadsheetApp.getActiveSpreadsheet();
  const ABAS_COM_PREENCHIMENTO = ['Transações', 'Transações - USA', 'Transações Renda Fixa', 'Carteira Renda Fixa'];
  const ss = {
    getSheetByName(nome) {
      const s = ssOrig.getSheetByName(nome);
      if (!s) return s;
      return new Proxy(s, {
        get(t, p) {
          if (p !== 'getRange') { const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; }
          return (...a) => {
            const r = t.getRange(...a);
            return new Proxy(r, {
              get(rt, rp) {
                if (rp === 'getValues') {
                  return () => {
                    const nr = typeof a[0] === 'string' ? 1 : (a[2] ?? 1);
                    const nc = typeof a[0] === 'string' ? 1 : (a[3] ?? 1);
                    c.getValues += 1; c.celulas += nr * nc;
                    if (ABAS_COM_PREENCHIMENTO.includes(nome) && nr > 2000 && nc > 1) c.leiturasGrandesDeLancamentos += 1;
                    return rt.getValues();
                  };
                }
                const v = rt[rp]; return typeof v === 'function' ? v.bind(rt) : v;
              },
            });
          };
        },
      });
    },
    insertSheet: (n) => ssOrig.insertSheet(n),
  };
  sb.SpreadsheetApp.getActiveSpreadsheet = () => ss; sb.SpreadsheetApp.getActive = () => ss;
  sb.UrlFetchApp = { fetch() { throw new Error('rede indisponível no teste'); }, fetchAll() { throw new Error('rede indisponível no teste'); } };
  const resp = JSON.parse(sb.doGet({ parameter: { action: acao, ...params } }).getContent());
  return { c, resp };
}

// Teto = ~35% acima do medido em 05/10/2026 (antes: home 831 mil, ativo 1,15 M, salario 1,28 M, patrimonio 1,33 M, metasHistorico 1,28 M).
// O que o teste protege: ninguém volta a ler as abas de lançamentos até getLastRow() (~10.800 linhas).
const ORCAMENTO_CELULAS = { home: 380000, ativo: 400000, salario: 400000, patrimonio: 400000, metasHistorico: 400000, proventos: 230000, meusAtivos: 120000, carteirasHome: 280000 };

for (const [acao, teto] of Object.entries(ORCAMENTO_CELULAS)) {
  test(`A-72: ação "${acao}" a frio lê menos de ${teto.toLocaleString('pt-BR')} células e não lê as abas de lançamentos até o fim do preenchimento`, async (t) => {
    if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
    const { c, resp } = await medirAcao(acao, acao === 'ativo' ? { ref: 'PETR4' } : {});
    assert.equal(resp.ok, true, JSON.stringify(resp).slice(0, 200));
    assert.equal(c.leiturasGrandesDeLancamentos, 0, 'leitura de mais de 2.000 linhas em Transações/USA/RF/Carteira RF');
    assert.ok(c.celulas < teto, `${c.celulas} células (teto ${teto})`);
    t.diagnostic(`${acao}: ${c.celulas} células em ${c.getValues} leituras`);
  });
}

test('A-38: ativo com semIndices=1 vem sem `indices` (a home já os tem); sem o parâmetro vem como antes - e o cache do ativo não guarda os índices', async (t) => {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
  const { montarSandboxPrevia } = await import('./previa.mjs');
  const sb = montarSandboxPrevia();
  const chamar = (extra) => JSON.parse(sb.doGet({ parameter: { action: 'ativo', ref: 'PETR4', ...extra } }).getContent());
  const completo = chamar({});
  assert.equal(completo.ok, true);
  assert.ok(Array.isArray(completo.indices) && completo.indices.length > 100, 'comportamento de antes preservado');
  const enxuto = chamar({ semIndices: '1' });
  assert.equal(enxuto.ok, true);
  assert.equal('indices' in enxuto, false);
  assert.equal(enxuto.indicesDesde, completo.indicesDesde);
  assert.equal(JSON.stringify(enxuto.serie), JSON.stringify(completo.serie));
  assert.ok(JSON.stringify(enxuto).length < JSON.stringify(completo).length * 0.6, 'bem menor');
});
