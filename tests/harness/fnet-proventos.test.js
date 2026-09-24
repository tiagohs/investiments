// tests/harness/fnet-proventos.test.js
//
// 24/09/2026: proventos de FIIs anunciados no FNet (B3) - FnetProventos.gs.
// Parte 1 (sempre roda, sem planilha): leitura do XML estruturado do FNet.
// Parte 2 (com fixtures.json): a rotina diária inteira contra a planilha
// real, com o FNet FALSO (nenhuma chamada de rede) - grava a aba, não baixa
// documento repetido, respeita retificação, e a Home devolve quanto você
// recebe (quantidade na data com, pelas Transações, x valor por cota),
// conferido por uma conta independente feita aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { carregarTodasAsTelasComDadosReais, relogioNoFusoParaUtcMs_, FUSO_PLANILHA_XLSX } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);

function xmlFnet(blocos) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<DadosEconomicoFinanceiros><DadosGerais><NomeFundo>FUNDO TESTE FII</NomeFundo><CNPJFundo>00000000000000</CNPJFundo></DadosGerais>
<InformeRendimentos>${blocos.map(({ ticker, rend = [], amort = [] }) => `
  <Provento><CodISIN>BRXXXXCTF000</CodISIN><CodNegociacao>${ticker}</CodNegociacao>
  ${rend.map((r) => `<Rendimento><AtoSocietarioAprovacao/><DataBase>${r.base}</DataBase><ValorProvento>${r.valor}</ValorProvento><DataPagamento>${r.pag}</DataPagamento><PeriodoReferencia>X</PeriodoReferencia><RendimentoIsentoIR>Sim</RendimentoIsentoIR></Rendimento>`).join('')}
  ${amort.map((r) => `<Amortizacao><DataBase>${r.base}</DataBase><ValorProvento>${r.valor}</ValorProvento><DataPagamento>${r.pag}</DataPagamento></Amortizacao>`).join('')}
  </Provento>`).join('')}
</InformeRendimentos></DadosEconomicoFinanceiros>`;
}

function sandboxSoDoFnet() {
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'FnetProventos.gs'), 'utf8')).runInContext(sb);
  return sb;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test('FNet: lê rendimento e amortização só do ticker pedido (o recibo "13" do mesmo documento fica de fora), com data e valor certos', () => {
  const sb = sandboxSoDoFnet();
  const xml = xmlFnet([
    { ticker: 'ABCD11', rend: [{ base: '2026-08-31', valor: '1.05', pag: '2026-09-15' }], amort: [{ base: '2026-08-31', valor: '0,50', pag: '2026-09-15' }] },
    { ticker: 'ABCD13', rend: [{ base: '2026-08-31', valor: '1.05', pag: '2026-09-15' }] },
  ]);
  assert.deepEqual(plain(sb.extrairProventosDoXmlFnet_(xml, 'ABCD11')), [
    { ticker: 'ABCD11', tipo: 'Rendimento', dataCom: '2026-08-31', dataPagamento: '2026-09-15', valor: 1.05, isento: 'Sim' },
    { ticker: 'ABCD11', tipo: 'Amortização', dataCom: '2026-08-31', dataPagamento: '2026-09-15', valor: 0.5, isento: '' },
  ]);
  assert.deepEqual(plain(sb.extrairProventosDoXmlFnet_(xml, 'EFGH11')), []);
  // valor zerado ou data faltando não entra
  assert.deepEqual(plain(sb.extrairProventosDoXmlFnet_(xmlFnet([{ ticker: 'ABCD11', rend: [{ base: '', valor: '1', pag: '2026-09-15' }, { base: '2026-08-31', valor: '0', pag: '2026-09-15' }] }]), 'ABCD11')), []);
});

// ---------------------------------------------------------------------------
// Parte 2: rotina inteira com a planilha real e FNet falso
// ---------------------------------------------------------------------------
const fmtSp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const diaSp = (ms) => fmtSp.format(new Date(ms));
function chaveDeCelula(cel) {
  const m = cel.__date__.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  return fmtSp.format(new Date(relogioNoFusoParaUtcMs_(FUSO_PLANILHA_XLSX, +m[1], +m[2], +m[3], +m[4], +m[5], +m[6])));
}

test('FNet: rotina diária grava a aba, não baixa documento repetido, aplica retificação, e a Home devolve quantidade na data com × valor = o que você recebe', async (t) => {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
  const r = await carregarTodasAsTelasComDadosReais();
  const sb = r.sandbox;
  const fx = r.fixtures;

  // FIIs da carteira hoje (Auxiliar_ativos) - conta independente
  const fiis = fx.Auxiliar_ativos.linhas.slice(1).filter((l) => l[0] === 'FIIs' && Number(l[7]) > 0).map((l) => String(l[1]).trim().toUpperCase());
  assert.ok(fiis.length >= 2, 'precisa de pelo menos 2 FIIs na carteira');
  const [fiiA, fiiB] = fiis;

  // quantidade na data com, direto da aba Transações (coluna K) - conta independente
  const qtdNaData = (ticker, dia) => fx['Transações'].linhas.slice(6)
    .filter((l) => String(l[0] || '').trim().toUpperCase() === ticker && l[1] && l[1].__date__ && chaveDeCelula(l[1]) <= dia)
    .reduce((s, l) => s + (Number(l[10]) || 0), 0);

  const hoje = Date.now();
  const d = (dias) => diaSp(hoje + dias * 86400000);
  const baseFutura = d(-3), pagFutura = d(10);
  const basePassada = d(-25), pagPassada = d(-12);
  // data com na VÉSPERA da última compra do fiiA: a quantidade tem que ser a de antes dela
  const comprasA = fx['Transações'].linhas.slice(6)
    .filter((l) => String(l[0] || '').trim().toUpperCase() === fiiA && l[1] && l[1].__date__ && Number(l[10]) > 0)
    .map((l) => chaveDeCelula(l[1])).sort();
  const ultimaCompraA = comprasA[comprasA.length - 1];
  const baseAntiga = diaSp(Date.parse(ultimaCompraA + 'T12:00:00-03:00') - 86400000), pagAntigaFutura = d(20);

  // FNet falso: 2 docs pro fiiA (o mais novo retifica o valor), 1 pro fiiB (com recibo "13" junto)
  const docs = {
    9001: xmlFnet([{ ticker: fiiA, rend: [{ base: baseFutura, valor: '0.80', pag: pagFutura }] }]),
    9002: xmlFnet([{ ticker: fiiA, rend: [{ base: baseFutura, valor: '0.85', pag: pagFutura }, { base: basePassada, valor: '0.70', pag: pagPassada }] }]),
    9003: xmlFnet([{ ticker: fiiA, rend: [{ base: baseAntiga, valor: '0.60', pag: pagAntigaFutura }] }]),
    9101: xmlFnet([{ ticker: fiiB, rend: [{ base: baseFutura, valor: '1.10', pag: pagFutura }] }, { ticker: fiiB.replace(/11$/, '13'), rend: [{ base: baseFutura, valor: '9.99', pag: pagFutura }] }]),
  };
  const cnpjs = sb.CNPJ_FII_CONHECIDOS_;
  const listaPorCnpj = { [cnpjs[fiiA] || '11111111111111']: ['9003', '9002', '9001'], [cnpjs[fiiB] || '22222222222222']: ['9101'] };
  let downloads = 0;
  const props = {};
  sb.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) };
  sb.Utilities.sleep = () => {};
  sb.UrlFetchApp = {
    fetch(url) {
      const resp = (code, texto) => ({ getResponseCode: () => code, getContentText: () => texto });
      let m = url.match(/cnpjFundo=(\d+)/);
      if (m) return resp(200, JSON.stringify({ data: (listaPorCnpj[m[1]] || []).map((id) => ({ id: Number(id), dataEntrega: 'x' })) }));
      m = url.match(/downloadDocumento\?id=(\d+)/);
      if (m) { downloads += 1; return resp(200, docs[m[1]] || '<x/>'); }
      return resp(404, '');
    },
  };
  // FII sem CNPJ conhecido: o teste cadastra na aba, como o Tiago faria
  const semCnpj = [fiiA, fiiB].filter((tk) => !cnpjs[tk]);
  if (semCnpj.length) {
    const aba = sb.SpreadsheetApp.getActiveSpreadsheet().insertSheet('aux_fii-cnpj');
    aba.getRange(1, 1, 1 + semCnpj.length, 4).setValues([['Ticker', 'CNPJ', 'Origem', 'Atualizado em'], ...semCnpj.map((tk) => [tk, tk === fiiA ? '11111111111111' : '22222222222222', 'teste', ''])]);
  }
  sb.cnpjsFiiPeloIsinCvm_ = () => ({}); // sem rede

  const r1 = plain(sb.atualizarProventosAnunciadosFii_('Manual'));
  assert.equal(downloads, 4, 'baixa cada documento uma vez');
  assert.equal(r1.novos, 4, JSON.stringify(r1));

  // 2ª rodada: nada novo, nenhum download
  const r2 = plain(sb.atualizarProventosAnunciadosFii_('Manual'));
  assert.equal(downloads, 4, 'não baixa de novo o que já leu');
  assert.equal(r2.novos, 0);

  const aba = plain(sb.lerProventosAnunciados_(sb.SpreadsheetApp.getActiveSpreadsheet()));
  const doA = aba.filter((p) => p.ticker === fiiA && p.dataPagamento === pagFutura);
  assert.equal(doA.length, 1, 'retificação substitui, não duplica');
  assert.equal(doA[0].valor, 0.85, 'vale o documento mais novo');
  assert.ok(!aba.some((p) => /13$/.test(p.ticker)), 'recibo "13" fica de fora');

  const out = plain(sb.montarProventosAnunciados_());
  const esperado = (tk, v, base) => Math.round(qtdNaData(tk, base) * v * 100) / 100;
  let conferidos = 0;
  for (const [tk, v] of [[fiiA, 0.85], [fiiB, 1.10]]) {
    const q = qtdNaData(tk, baseFutura);
    const item = out.aReceber.find((p) => p.ticker === tk);
    if (q > 0) {
      assert.ok(item, `${tk} a receber`);
      assert.equal(item.quantidade, q, `${tk}: quantidade na data com`);
      assert.equal(item.valor, esperado(tk, v, baseFutura), `${tk}: valor a receber`);
      assert.equal(item.dataPagamento, pagFutura);
      conferidos += 1;
    } else assert.ok(!item, `${tk} sem cotas na data com não entra`);
  }
  assert.ok(conferidos >= 1, 'nenhum FII com cotas na data com - o teste não conferiu nada');
  const qAntes = qtdNaData(fiiA, baseAntiga);
  const itemAntigo = out.aReceber.find((p) => p.ticker === fiiA && p.dataCom === baseAntiga);
  assert.ok(qtdNaData(fiiA, ultimaCompraA) > qAntes, 'a última compra aumenta a quantidade');
  if (qAntes > 0) assert.equal(itemAntigo && itemAntigo.quantidade, qAntes, 'compra DEPOIS da data com não conta');
  else assert.ok(!itemAntigo, 'sem cotas na data com não entra');
  t.diagnostic(`a receber: ${out.aReceber.length} · pagos não lançados: ${out.pagosNaoLancados.length} · conferidos: ${conferidos}`);
  // pago há 12 dias e não lançado na aba Proventos
  if (qtdNaData(fiiA, basePassada) > 0) {
    const p = out.pagosNaoLancados.find((x) => x.ticker === fiiA && x.dataPagamento === pagPassada);
    assert.ok(p, 'pago e não lançado aparece pra lembrar');
    assert.equal(p.valor, esperado(fiiA, 0.7, basePassada));
  }

  // o que JÁ está na aba Proventos não aparece como "não lançado": usa um provento real recente do fiiA
  const lancado = fx.Proventos.linhas.find((l) => String(l[2] || '').trim().toUpperCase() === fiiA && l[1] && l[1].__date__);
  if (lancado) {
    const pag = chaveDeCelula(lancado[1]);
    const base = diaSp(Date.parse(pag + 'T12:00:00-03:00') - 10 * 86400000);
    const lista = sb.lerProventosAnunciados_(sb.SpreadsheetApp.getActiveSpreadsheet());
    lista.push({ ticker: fiiA, tipo: 'Rendimento', dataCom: base, dataPagamento: pag, valor: 0.5, isento: 'Sim', documento: '1', atualizadoEm: new sb.Date() });
    sb.gravarProventosAnunciados_(sb.SpreadsheetApp.getActiveSpreadsheet(), lista);
    const o2 = plain(sb.montarProventosAnunciados_());
    assert.ok(!o2.pagosNaoLancados.some((x) => x.ticker === fiiA && x.dataPagamento === pag), 'já lançado não é cobrado');
  }
});
