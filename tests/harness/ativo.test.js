// tests/harness/ativo.test.js
//
// 25/09/2026: tela Detalhe do ativo (apps-script/Ativo.gs).
// Parte 1 (sempre roda, planilha vazia em memória): RSS do Google Notícias
// (título sem o " - Fonte", CDATA, entidades, link inválido fica de fora,
// mais novo primeiro), data da tese pelo nome do PDF, título de renda fixa
// da Carteira x produto do histórico (Tesouro pelo nome, LCI/LCA/CDB pelo
// tipo + instituição) e teses sem a pasta configurada.
// Parte 2 (com fixtures.json): pra CADA ativo das Carteiras, a tela devolve a
// MESMA linha da tabela de Carteiras, as compras/vendas da aba Transações, os
// MESMOS proventos que a tela Proventos lista pro ticker e a série só dele;
// cada título de renda fixa acha a sua linha, o seu histórico e as suas
// movimentações. E as contas da tela (assets/js/pages/ativo-calc.js + o motor
// de gráficos das Carteiras) com os dados reais: ganho "desde o início" =
// saldo de hoje - compras + vendas + proventos, Valor aplicado = Total
// comprado da planilha, mês a mês fecha com o saldo e os proventos.
// Nenhum número real aqui (só comparações entre fontes).
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

test('Notícias: lê o RSS do Google Notícias (CDATA, entidades, " - Fonte" sai do título), ignora item sem link http e ordena do mais novo', () => {
  const sb = sandboxVazio();
  const xml = `<?xml version="1.0"?><rss><channel><title>x</title>
    <item><title>Banco anuncia JCP &amp; dividendos - Jornal A</title><link>https://news.google.com/a</link>
      <pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate><source url="https://a.com">Jornal A</source></item>
    <item><title><![CDATA[Lucro cresce "forte" no tri]]></title><link>https://news.google.com/b</link>
      <pubDate>Wed, 23 Sep 2026 12:00:00 GMT</pubDate></item>
    <item><title>Sem link</title><link>javascript:alert(1)</link><pubDate>Thu, 24 Sep 2026 12:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const itens = plain(sb.extrairItensRss_(xml));
  assert.equal(itens.length, 2);
  assert.equal(itens[0].titulo, 'Lucro cresce "forte" no tri');
  assert.equal(itens[0].fonte, null);
  assert.equal(itens[1].titulo, 'Banco anuncia JCP & dividendos');
  assert.equal(itens[1].fonte, 'Jornal A');
  assert.equal(itens[1].data, '2026-09-21T10:00:00.000Z');
  assert.deepEqual(plain(sb.extrairItensRss_('')), []);
});

test('Teses: data pelo nome do PDF (dd:mm:aaaa e variações) e, sem a pasta configurada, avisa em vez de quebrar', () => {
  const sb = sandboxVazio();
  assert.equal(sb.dataDoNomeTese_('21:08:2026.pdf'), '2026-08-21');
  assert.equal(sb.dataDoNomeTese_('21/08/2026.pdf'), '2026-08-21');
  assert.equal(sb.dataDoNomeTese_('tese 07-08-2026.pdf'), '2026-08-07');
  assert.equal(sb.dataDoNomeTese_('2026-08-21.pdf'), '2026-08-21');
  assert.equal(sb.dataDoNomeTese_('tese.pdf'), null);
  assert.deepEqual(plain(sb.montarTesesAtivo_('BBAS3')), { ok: true, configurado: false, teses: [], resumos: [] });
});

test('Renda fixa: título da Carteira x produto do histórico/Transações (Tesouro pelo nome; LCI/LCA/CDB pelo tipo; sempre a mesma instituição)', () => {
  const sb = sandboxVazio();
  const xp = sb.normalizarInstituicaoRF_('XP INVESTIMENTOS CCTVM S/A.');
  assert.equal(sb.casaTituloRf_('Tesouro Selic 2028', xp, 'Tesouro Selic 2028', 'XP'), true);
  assert.equal(sb.casaTituloRf_('Tesouro Selic 2028', xp, 'tesouro selic 2028', 'RICO INVESTIMENTOS - GRUPO XP'), true);
  assert.equal(sb.casaTituloRf_('Tesouro Selic 2028', xp, 'Tesouro Selic 2028', 'NU INVEST CORRETORA'), false);
  assert.equal(sb.casaTituloRf_('Tesouro Selic 2028', xp, 'Tesouro Selic 2029', 'XP'), false);
  const inter = sb.normalizarInstituicaoRF_('BANCO INTER S/A');
  assert.equal(sb.casaTituloRf_('LCI - BANCO INTER S/A', inter, 'LCI - 00X00000000', 'INTER'), true);
  assert.equal(sb.casaTituloRf_('LCI - BANCO INTER S/A', inter, 'LCA - 00X00000000', 'INTER'), false);
  assert.equal(sb.casaTituloRf_('LCI - BANCO INTER S/A', inter, 'LCI - 00X00000000', 'XP'), false);
});

test('Tela do ativo com a planilha real: cada ativo de Carteiras = mesma linha da tabela, compras/vendas da aba Transações, proventos da tela Proventos e série só dele', async (t) => {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
  const telas = await carregarTodasAsTelasComDadosReais();
  const sb = telas.sandbox;
  const proventosTela = plain(sb.montarTelaProventos_());
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const linhasTx = (nomeAba) => {
    const aba = ss.getSheetByName(nomeAba);
    return aba.getRange(sb.LINHA_DADOS_TRANSACOES_FLUXO, 1, aba.getLastRow() - sb.LINHA_DADOS_TRANSACOES_FLUXO + 1, 5).getValues()
      .filter((l) => Object.prototype.toString.call(l[1]) === '[object Date]' && /compra|venda/i.test(String(l[2]))); // Date de outro realm (vm)
  };
  const txBr = linhasTx(sb.ABA_TRANSACOES_BR_FLUXO);
  const txUsa = linhasTx(sb.ABA_TRANSACOES_USA_FLUXO);
  const classes = [['acoes', telas.carteirasAcoes], ['fiis', telas.carteirasFiis], ['acoesEua', telas.carteirasAcoesEua]];
  let conferidos = 0;
  for (const [classe, carteira] of classes) {
    for (const linha of plain(carteira).ativos) {
      const ticker = String(linha.ticker).toUpperCase();
      const tela = plain(sb.montarTelaAtivo_(ticker));
      assert.equal(tela.ok, true, ticker);
      assert.equal(tela.classe, classe, `${ticker}: classe`);
      assert.equal(tela.moeda, classe === 'acoesEua' ? 'USD' : 'BRL', `${ticker}: moeda`);
      for (const campo of ['quantidade', 'precoMedio', 'precoAtual', 'precoTeto', 'vies', 'totalComprado', 'totalAtualizado', 'proventosTotais']) {
        assert.deepEqual(tela.ativo[campo], linha[campo], `${ticker}: ${campo} = tabela de Carteiras`);
      }
      const esperadasTx = (classe === 'acoesEua' ? txUsa : txBr).filter((l) => String(l[0]).trim().toUpperCase() === ticker);
      assert.equal(tela.transacoes.length, esperadasTx.length, `${ticker}: nº de compras/vendas`);
      const qtdTx = tela.transacoes.reduce((s, x) => s + (x.tipo === 'Venda' ? -Math.abs(x.quantidade) : x.quantidade), 0);
      assert.ok(Math.abs(qtdTx - linha.quantidade) < 1e-6, `${ticker}: compras - vendas (${qtdTx}) = quantidade (${linha.quantidade})`);
      const somaTela = tela.proventos.reduce((s, p) => s + p.valor, 0);
      const somaProv = proventosTela.recebidos.filter((p) => p.ticker === ticker).reduce((s, p) => s + p.valor, 0);
      assert.ok(Math.abs(somaTela - somaProv) < 0.011, `${ticker}: proventos ${somaTela} = tela Proventos ${somaProv}`);
      if (linha.quantidade > 0) assert.ok(tela.serie.length > 0, `${ticker}: série`); // (direito de subscrição já vendido fica com 0)
      for (let i = 1; i < tela.serie.length; i++) assert.ok(tela.serie[i].data > tela.serie[i - 1].data, `${ticker}: série em ordem, 1 ponto por dia`);
      if (tela.serie.length) assert.ok(tela.indices.length > 0 && tela.indices[0].data <= tela.serie[0].data, `${ticker}: índices desde o início da série`);
      if (classe === 'fiis' && tela.faixa52) assert.ok(tela.faixa52.min <= tela.faixa52.max, `${ticker}: faixa 52 semanas`);
      conferidos++;
    }
  }
  assert.ok(conferidos >= 10, `conferiu ${conferidos} ativos`);

  // renda fixa: cada título acha a sua linha, o seu histórico e as suas movimentações
  for (const a of plain(telas.carteirasRendaFixa).ativos) {
    const tela = plain(sb.montarTelaAtivo_(`rf:${a.nomePersonalizado}|${a.instituicao}`));
    assert.equal(tela.tipo, 'rf');
    assert.ok(tela.ativo, `${a.nomePersonalizado}: achou a linha`);
    assert.equal(tela.ativo.totalAtualizado, a.totalAtualizado, `${a.nomePersonalizado}: mesmo saldo da tabela`);
    assert.ok(tela.serie.length > 0, `${a.nomePersonalizado}: histórico`);
    assert.ok(tela.transacoes.length > 0, `${a.nomePersonalizado}: movimentações`);
  }
});

test('Contas da tela com a planilha real: ganho desde o início = saldo - compras + vendas + proventos; aplicado = Total comprado; mês a mês fecha com o saldo e os proventos', async (t) => {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return; }
  const telas = await carregarTodasAsTelasComDadosReais();
  const sb = telas.sandbox;
  const { montarHistoricoAtivo, historicoMensal, aplicadoAcumulado, valorAtualBrl } = await import('../../assets/js/pages/ativo-calc.js');
  const { calcularResumoRentabilidade } = await import('../../assets/js/pages/inicio.js');
  const visoes = { acoes: 'ativoAcoes', fiis: 'ativoFiis', acoesEua: 'ativoAcoesEua' };
  let conferidos = 0;
  for (const [classe, carteira] of [['acoes', telas.carteirasAcoes], ['fiis', telas.carteirasFiis], ['acoesEua', telas.carteirasAcoesEua]]) {
    for (const linha of plain(carteira).ativos.filter((a) => a.quantidade > 0)) {
      const tela = plain(sb.montarTelaAtivo_(linha.ticker));
      const h = montarHistoricoAtivo(tela);
      assert.ok(h.length >= 2, `${linha.ticker}: histórico`);
      const hoje = valorAtualBrl(tela);
      assert.ok(Math.abs(h.at(-1).ativo - hoje) < 0.01, `${linha.ticker}: último ponto = valor de hoje`);
      const compras = tela.transacoes.filter((x) => x.tipo === 'Compra').reduce((a, x) => a + x.totalBrl, 0);
      const vendas = tela.transacoes.filter((x) => x.tipo === 'Venda').reduce((a, x) => a + x.totalBrl, 0);
      const proventos = tela.proventos.reduce((a, p) => a + p.valor, 0);
      const r = calcularResumoRentabilidade(null, h, { visaoId: visoes[classe], periodoId: 'tudo' });
      const esperado = hoje - compras + vendas + proventos;
      // ações recebidas de graça no 1º dia (bonificação/conversão, custo 0 - ex.
      // AXIA7): a rentabilidade mede a partir do valor com que elas chegaram, não
      // de zero (senão seria "infinito %") - o ganho em R$ começa daí também
      const primeiraCompraGratis = tela.transacoes.length && tela.transacoes[0].totalBrl === 0;
      if (!primeiraCompraGratis) assert.ok(Math.abs(r.ganhoReais - esperado) < 0.05, `${linha.ticker}: ganho ${r.ganhoReais} = ${esperado}`);
      assert.ok(Number.isFinite(r.percentual), `${linha.ticker}: rentabilidade`);
      if (classe !== 'acoesEua') {
        const aplicado = aplicadoAcumulado(h).at(-1);
        assert.ok(Math.abs(aplicado - linha.totalComprado) < 0.05, `${linha.ticker}: aplicado ${aplicado} = Total comprado ${linha.totalComprado}`);
      }
      const mensal = historicoMensal(h);
      assert.ok(Math.abs(mensal[0].saldo - hoje) < 0.01, `${linha.ticker}: mês atual fecha com o saldo`);
      const provMensal = mensal.reduce((a, m) => a + m.proventos, 0);
      assert.ok(Math.abs(provMensal - proventos) < 0.05, `${linha.ticker}: proventos do mês a mês = recebidos`);
      conferidos++;
    }
  }
  assert.ok(conferidos >= 10, `conferiu ${conferidos} ativos`);
});
