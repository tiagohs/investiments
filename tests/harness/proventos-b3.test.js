// tests/harness/proventos-b3.test.js
//
// 24/09/2026: exportação "Proventos a receber" da B3 (Proventos.gs) e a
// resposta da tela Proventos (montarTelaProventos_).
// Parte 1 (sempre roda, planilha vazia em memória): lê a matriz da
// exportação como a B3 entrega (datas em texto, "-" sem data, linha de
// total), importa pela tela (grava a aba, data vira data de verdade, carimbo
// "Importado em") e relê igual.
// Parte 2 (com fixtures.json): com a planilha real - o que já está na aba
// Proventos não volta como "a receber"/"não lançado" (mesmo com nome de tipo
// diferente), JCP e dividendo no mesmo dia são 2 proventos, a mesma linha em
// 2 contas soma, e os recebidos da tela = campos proventos* do histórico.
// Valores sintéticos: nenhum número real aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_, carregarTodasAsTelasComDadosReais } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const GAS_DIR = path.join(ROOT, 'apps-script');
const TEM_FIXTURES = fs.existsSync(path.join(__dirname, 'fixtures.json'));
const plain = (x) => JSON.parse(JSON.stringify(x));

function sandboxVazio() {
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_({}, sb);
  for (const f of fs.readdirSync(GAS_DIR).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), { filename: f }).runInContext(sb);
  }
  return sb;
}

const fmtSp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const diaSp = (ms) => fmtSp.format(new Date(ms));
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Matriz no formato da exportação da B3 (texto onde a B3 põe texto). */
function exportacaoB3(linhas) {
  const cab = ['Produto', 'Tipo', 'Tipo de Evento', 'Previsão de pagamento', 'Instituição', 'Conta', 'Quantidade', 'Preço unitário', 'Valor líquido'];
  const corpo = linhas.map((l) => [`${l.ticker} - EMPRESA TESTE S.A.`, l.fii ? 'Fundo' : 'ON', l.evento, l.pag ? br(l.pag) : '-', 'CORRETORA TESTE', l.conta || '000', String(l.qtd), l.preco, l.valor]);
  const total = corpo.reduce((s, l) => s + l[8], 0);
  return [cab, ...corpo, ['', '', '', '', '', '', '', 'Total líquido', Math.round(total * 100) / 100]];
}

test('B3 "Proventos a receber": lê a exportação como vem (texto, "-" sem data, linha de total) e o JCP e o dividendo do mesmo dia são 2 proventos', () => {
  const sb = sandboxVazio();
  const m = exportacaoB3([
    { ticker: 'AAAA3', evento: 'DIVIDENDO', pag: '2030-01-10', qtd: 10, preco: 0.5, valor: 5 },
    { ticker: 'AAAA3', evento: 'JUROS SOBRE CAPITAL PRÓPRIO', pag: '2030-01-10', qtd: 10, preco: 0.2, valor: 1.65 },
    { ticker: 'BBBB11', fii: true, evento: 'RENDIMENTO', pag: '2030-01-05', qtd: 3, preco: 1, valor: 3 },
    { ticker: 'CCCC4', evento: 'DIVIDENDO', pag: '', qtd: 7, preco: 1, valor: 7 },
  ]);
  const lido = plain(sb.extrairProventosB3DeLinhas_([['Proventos a Receber'], [''], ...m]));
  assert.deepEqual(lido.itens, [
    { ticker: 'AAAA3', tipo: 'Dividendo', dataPagamento: '2030-01-10', quantidade: 10, valorPorCota: 0.5, valor: 5 },
    { ticker: 'AAAA3', tipo: 'JCP', dataPagamento: '2030-01-10', quantidade: 10, valorPorCota: 0.2, valor: 1.65 },
    { ticker: 'BBBB11', tipo: 'Rendimento', dataPagamento: '2030-01-05', quantidade: 3, valorPorCota: 1, valor: 3 },
    { ticker: 'CCCC4', tipo: 'Dividendo', dataPagamento: '', quantidade: 7, valorPorCota: 1, valor: 7 },
  ]);
  // sem o cabeçalho da B3 não lê nada
  assert.deepEqual(plain(sb.extrairProventosB3DeLinhas_([['Ticker', 'Valor'], ['AAAA3', 5]])).itens, []);
  // valores em texto "R$ 1.234,56" também
  const m2 = exportacaoB3([{ ticker: 'AAAA3', evento: 'DIVIDENDO', pag: '2030-01-10', qtd: 1000, preco: '1,23456', valor: 'R$ 1.234,56' }]);
  const l2 = plain(sb.extrairProventosB3DeLinhas_(m2)).itens[0];
  assert.equal(l2.valor, 1234.56);
  assert.equal(l2.valorPorCota, 1.23456);
});

test('B3: importar pela tela grava a aba (substitui a anterior), a data vira data de verdade, carimba "Importado em" e a Home lê o mesmo', () => {
  const sb = sandboxVazio();
  const hoje = Date.now();
  const futuro = diaSp(hoje + 20 * 86400000);
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  // uma importação antiga com mais linhas: a nova substitui tudo
  const velha = exportacaoB3([1, 2, 3, 4, 5].map((i) => ({ ticker: `VELH${i}`, evento: 'DIVIDENDO', pag: futuro, qtd: 1, preco: 1, valor: 1 })));
  assert.equal(plain(sb.importarProventosB3_(JSON.stringify(velha))).importados, 5);
  const m = exportacaoB3([
    { ticker: 'AAAA3', evento: 'DIVIDENDO', pag: futuro, qtd: 10, preco: 0.5, valor: 5 },
    { ticker: 'CCCC4', evento: 'DIVIDENDO', pag: '', qtd: 7, preco: 1, valor: 7 },
  ]);
  const r = plain(sb.importarProventosB3_(JSON.stringify(m)));
  assert.deepEqual(r, { ok: true, importados: 2, total: 12 });
  const aba = ss.getSheetByName('B3 - proventos a receber');
  const valores = aba.getRange(1, 1, aba.getLastRow(), aba.getLastColumn()).getValues();
  assert.equal(valores.length, 4, 'cabeçalho + 2 + total (a importação velha sumiu)');
  assert.ok(valores[1][3] instanceof sb.Date, 'data de pagamento gravada como data');
  assert.equal(sb.chaveDiaISOInicio_(valores[1][3]), futuro, 'sem virar o dia');
  assert.equal(valores[2][3], '-', '"-" continua "-"');
  assert.equal(valores[0][10], 'Importado em');
  const lido = plain(sb.lerProventosB3AReceber_(ss));
  assert.equal(lido.atualizadoEm, diaSp(hoje));
  assert.deepEqual(lido.itens.map((p) => [p.ticker, p.dataPagamento, p.valor]), [['AAAA3', futuro, 5], ['CCCC4', '', 7]]);
  const out = plain(sb.montarProventosAnunciados_(null, {}));
  assert.deepEqual(out.aReceber.map((p) => [p.ticker, p.dataPagamento, p.valor, p.fonte, p.classe]), [['AAAA3', futuro, 5, 'B3', 'acoes'], ['CCCC4', '', 7, 'B3', 'acoes']]);
  assert.equal(out.atualizadoB3, diaSp(hoje));
  // arquivo errado: recusa sem apagar a aba
  const ruim = plain(sb.importarProventosB3_(JSON.stringify([['Data', 'Ativo'], ['01/01/2030', 'AAAA3']])));
  assert.equal(ruim.ok, false);
  assert.equal(plain(sb.lerProventosB3AReceber_(ss)).itens.length, 2, 'aba anterior continua lá');
});

test('B3 + planilha real: o que já está na aba Proventos não volta (mesmo com o tipo escrito diferente), JCP e dividendo do mesmo dia entram os 2, 2 contas somam, sem data fica "a definir"', async (t) => {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
  const r = await carregarTodasAsTelasComDadosReais();
  const sb = r.sandbox;
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const hoje = Date.now();
  const d = (dias) => diaSp(hoje + dias * 86400000);
  // um provento real já lançado e recente (até 50 dias): a B3 manda ele de novo com o tipo diferente
  const lancados = plain(sb.lerLinhasAbaProventos_(ss)).filter((p) => p.moeda === 'BRL' && p.dataPagamento <= d(0) && p.dataPagamento >= d(-50) && p.liquido > 0);
  const acao = plain(sb.ativosParaProventos_(ss)).find((a) => a.classe === 'acoes');
  assert.ok(acao, 'precisa de 1 ação na carteira');
  const linhas = [
    { ticker: acao.ticker, evento: 'DIVIDENDO', pag: d(15), qtd: 10, preco: 0.5, valor: 5 },
    { ticker: acao.ticker, evento: 'JUROS SOBRE CAPITAL PRÓPRIO', pag: d(15), qtd: 10, preco: 0.2, valor: 1.65 },
    { ticker: acao.ticker, evento: 'DIVIDENDO', pag: d(40), qtd: 4, preco: 1, valor: 4, conta: '111' },
    { ticker: acao.ticker, evento: 'DIVIDENDO', pag: d(40), qtd: 6, preco: 1, valor: 6, conta: '222' },
    { ticker: acao.ticker, evento: 'DIVIDENDO', pag: '', qtd: 2, preco: 1, valor: 2 },
  ];
  let jaLancado = null;
  if (lancados.length) {
    jaLancado = lancados[lancados.length - 1];
    const outroTipo = /divid/i.test(jaLancado.tipo) ? 'RENDIMENTO' : 'DIVIDENDO';
    linhas.push({ ticker: jaLancado.ticker, evento: outroTipo, pag: jaLancado.dataPagamento, qtd: jaLancado.quantidade || 1, preco: jaLancado.valorPorCota || 1, valor: Math.round(jaLancado.liquido * 100) / 100 });
  }
  assert.equal(plain(sb.importarProventosB3_(JSON.stringify(exportacaoB3(linhas)))).ok, true);
  const out = plain(sb.montarProventosAnunciados_(null, {}));
  const doAtivo = out.aReceber.filter((p) => p.ticker === acao.ticker && p.fonte === 'B3');
  assert.deepEqual(doAtivo.map((p) => [p.dataPagamento, p.tipo, p.valor, p.quantidade]), [
    [d(15), 'Dividendo', 5, 10], [d(15), 'JCP', 1.65, 10], [d(40), 'Dividendo', 10, 10], ['', 'Dividendo', 2, 2],
  ]);
  if (jaLancado) {
    const volta = [...out.aReceber, ...out.pagosNaoLancados].filter((p) => p.ticker === jaLancado.ticker && p.dataPagamento === jaLancado.dataPagamento && p.fonte !== 'Planilha');
    assert.deepEqual(volta, [], 'provento já lançado não aparece de novo');
  } else t.diagnostic('sem provento lançado nos últimos 50 dias - parte "já lançado" não conferida');
  // a mesma resposta vai pra tela Proventos
  const tela = plain(sb.montarTelaProventos_());
  assert.deepEqual(tela.aReceber, out.aReceber);
});

test('Tela Proventos x histórico: cada dia de cada classe, a soma dos recebidos = campo proventos* da série; Valor aplicado = Σ fluxoAplicado* da série', async (t) => {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
  const r = await carregarTodasAsTelasComDadosReais();
  const tela = plain(r.sandbox.montarTelaProventos_());
  const s = r.home.historico;
  assert.ok(tela.ok && tela.recebidos.length > 0);
  const campo = { acoes: 'proventosAcoes', fiis: 'proventosFiis', acoesEua: 'proventosAcoesEua' };
  const soma = {};
  for (const p of tela.recebidos) {
    assert.ok(campo[p.classe], `classe desconhecida ${p.classe}`);
    assert.ok(p.data <= tela.hoje, 'recebido no futuro');
    soma[`${p.data}|${p.classe}`] = (soma[`${p.data}|${p.classe}`] || 0) + p.valor;
  }
  const erros = [];
  let dias = 0;
  for (const x of s) {
    for (const [c, f] of Object.entries(campo)) {
      const a = soma[`${x.data}|${c}`] || 0;
      const b = x[f] || 0;
      if (b) dias += 1;
      if (Math.abs(a - b) > 0.011) erros.push(`${x.data} ${c}: tela ${a.toFixed(2)} x série ${b.toFixed(2)}`);
    }
  }
  assert.ok(dias > 10, 'série sem proventos - nada conferido');
  assert.deepEqual(erros.slice(0, 5), []);
  const aplic = { acoes: 'fluxoAplicadoAcoes', fiis: 'fluxoAplicadoFiis', acoesEua: 'fluxoAplicadoAcoesEua' };
  for (const [c, f] of Object.entries(aplic)) {
    const esperado = Math.round(s.reduce((a, x) => a + (Number(x[f]) || 0), 0) * 100) / 100;
    assert.ok(Math.abs(tela.aplicado[c] - esperado) <= 0.011, `${c}: aplicado ${tela.aplicado[c]} x série ${esperado}`);
  }
  // recebidos do mês da Início = recebidos da tela no mês
  const mes = tela.hoje.slice(0, 7);
  const noMes = tela.recebidos.filter((p) => p.data.slice(0, 7) === mes && p.tipo !== 'Juros').reduce((a, p) => a + p.valor, 0);
  const home = (r.home.proventosAnunciados.recebidosNoMes || []).reduce((a, p) => a + p.valor, 0);
  assert.ok(Math.abs(noMes - home) <= 0.011 * Math.max(1, r.home.proventosAnunciados.recebidosNoMes.length), `mês: tela ${noMes.toFixed(2)} x Início ${home.toFixed(2)}`);
});

test('Tela Proventos (DOM) com a planilha real: cartões de cada classe e período = conta independente sobre o histórico; Agenda do mês = recebidos + a receber da Início', async (t) => {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
  const { JSDOM } = await import('jsdom');
  const r = await carregarTodasAsTelasComDadosReais();
  const tela = plain(r.sandbox.montarTelaProventos_());
  const s = r.home.historico;
  const dom = new JSDOM('<!doctype html><body><div id="refreshControlProventos"></div><div id="proventosLoading"></div><div id="proventosErro" hidden></div><div id="proventosConteudo" hidden></div></body>', { url: 'https://exemplo.test/proventos/index.html', pretendToBeVisual: true });
  const w = dom.window;
  const doc = w.document;
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.localStorage = w.localStorage;
  const { montarPaginaProventos } = await import('../../assets/js/pages/proventos.js');
  await montarPaginaProventos('tk', { doc, getProventosImpl: async () => structuredClone(tela) });
  const brl = (x) => { const m = String(x).match(/(-?)R\$\s*([\d.]+,\d{2})/); return m ? Number((m[1] + m[2]).replace(/\./g, '').replace(',', '.')) : null; };
  const clique = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const r2 = (v) => Math.round(v * 100) / 100;
  const campos = { todas: ['proventosAcoes', 'proventosFiis', 'proventosAcoesEua'], acoes: ['proventosAcoes'], fiis: ['proventosFiis'], acoesEua: ['proventosAcoesEua'] };
  const aplicados = { todas: ['fluxoAplicadoAcoes', 'fluxoAplicadoFiis', 'fluxoAplicadoAcoesEua'], acoes: ['fluxoAplicadoAcoes'], fiis: ['fluxoAplicadoFiis'], acoesEua: ['fluxoAplicadoAcoesEua'] };
  const hoje = tela.hoje;
  const mesIni = (n) => { const [a, m] = hoje.slice(0, 7).split('-').map(Number); const x = a * 12 + m - 1 - (n - 1); return `${Math.floor(x / 12)}-${String((x % 12) + 1).padStart(2, '0')}`; };
  const inicioPeriodo = { ano: `${hoje.slice(0, 4)}-01`, '12m': mesIni(12), '24m': mesIni(24), '36m': mesIni(36) };
  const erros = [];
  for (const classe of Object.keys(campos)) {
    clique(doc.querySelector(`[data-classe="${classe}"]`));
    const aplicado = r2(s.reduce((a, x) => a + aplicados[classe].reduce((b, c) => b + (Number(x[c]) || 0), 0), 0));
    for (const periodo of ['ano', '12m', '24m', '36m', 'inicio']) {
      clique(doc.querySelector(`[data-periodo="${periodo}"]`));
      const cards = [...doc.querySelectorAll('.pv-card .pv-card-valor')].map((el) => brl(el.textContent));
      const ini = periodo === 'inicio' ? '0000-00' : inicioPeriodo[periodo];
      const renda = r2(s.filter((x) => x.data.slice(0, 7) >= ini && x.data <= hoje).reduce((a, x) => a + campos[classe].reduce((b, c) => b + (Number(x[c]) || 0), 0), 0));
      if (Math.abs(cards[0] - aplicado) > 0.011) erros.push(`${classe}/${periodo}: Valor aplicado ${cards[0]} x série ${aplicado}`);
      if (Math.abs(cards[1] - renda) > 0.011) erros.push(`${classe}/${periodo}: Renda ${cards[1]} x série ${renda}`);
      // o gráfico soma o mesmo que o cartão
      const legenda = [...doc.querySelectorAll('#pvHistLegenda .pv-legenda-item b')].reduce((a, b) => a + brl(b.textContent), 0);
      if (Math.abs(legenda - renda) > 0.011 * Math.max(1, doc.querySelectorAll('#pvHistLegenda .pv-legenda-item').length)) erros.push(`${classe}/${periodo}: legenda soma ${r2(legenda)} x ${renda}`);
    }
  }
  // Agenda, mês de hoje, todas as classes: recebido = Início "Recebido no mês"
  clique(doc.querySelector('[data-classe="todas"]'));
  clique(doc.querySelector('[data-aba="agenda"]'));
  clique(doc.querySelector('[data-status="realizado"]'));
  const pagos = [...doc.querySelectorAll('.pv-agenda tbody tr')].filter((tr) => /^Pago$/.test(tr.querySelector('.pv-pill').textContent)).reduce((a, tr) => a + brl(tr.querySelector('.pv-ag-total b').textContent), 0);
  const home = r.home.proventosAnunciados.recebidosNoMes.reduce((a, p) => a + p.valor, 0);
  if (Math.abs(r2(pagos) - r2(home)) > 0.011) erros.push(`Agenda do mês (pagos) ${r2(pagos)} x Início ${r2(home)}`);
  t.diagnostic(`conferidos: 4 classes × 5 períodos; agenda do mês: ${doc.querySelectorAll('.pv-agenda tbody tr').length} linhas`);
  w.close();
  assert.deepEqual(erros, []);
});
