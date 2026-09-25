// tests/ativo-calc.test.js - 25/09/2026: contas da tela Detalhe do ativo
// (assets/js/pages/ativo-calc.js) com um ativo inventado, conta feita à mão:
// histórico no formato do motor de gráficos, rentabilidade (TWR com
// proventos) e ganho em R$, mês a mês, extrato, proventos, faixa de preço,
// renda fixa (PEPS, cupom, ajuste de marcação), IR por classe e o endereço
// da tela (link-ativo.js). Valores sintéticos: nenhum número real aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarHistoricoAtivo, aplicadoAcumulado, historicoMensal, montarExtrato, resumoProventosAtivo, faixaDePreco,
  resumoPosicao, eventosDoAtivo, tipoMovimentacaoRf, informesIrDoAtivo, posicaoFiscal, declaracaoIrDoAtivo, ordenarTeses, valorAtualBrl, percentualNaCarteira,
} from '../assets/js/pages/ativo-calc.js';
import { calcularResumoRentabilidade, filtrarHistoricoPorPeriodo } from '../assets/js/pages/inicio.js';
import { refAtivo, urlAtivo, urlAtivoTicker, refDaUrl, linkNovaAbaHtml, linkAtivoComNovaAbaHtml } from '../assets/js/link-ativo.js';

const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

/** Ação inventada: compra 10 a R$ 10 em 05/01, mais 10 a R$ 12 em 02/02, R$ 5 de dividendo em 15/02. */
function respostaAcao() {
  return {
    ok: true, hoje: '2026-03-10', tipo: 'rv', ticker: 'TEST3', classe: 'acoes', moeda: 'BRL',
    ativo: { ticker: 'TEST3', nome: 'Teste S.A.', quantidade: 20, precoAtual: 13.5, precoMedio: 11, precoTeto: 15, vies: 'Comprar',
      totalComprado: 220, totalAtualizado: 270, proventosTotais: 5, variacaoDia: 0.01 },
    serie: [
      { data: '2026-01-05', cotas: 10, preco: 10, valor: 100, cambio: null, valorBrl: 100 },
      { data: '2026-01-06', cotas: 10, preco: 11, valor: 110, cambio: null, valorBrl: 110 },
      { data: '2026-01-30', cotas: 10, preco: 12, valor: 120, cambio: null, valorBrl: 120 },
      { data: '2026-02-02', cotas: 20, preco: 12, valor: 240, cambio: null, valorBrl: 240 },
      { data: '2026-02-27', cotas: 20, preco: 12.5, valor: 250, cambio: null, valorBrl: 250 },
      { data: '2026-03-09', cotas: 20, preco: 13, valor: 260, cambio: null, valorBrl: 260 },
    ],
    transacoes: [
      { data: '2026-02-02', tipo: 'Compra', preco: 12, quantidade: 10, taxa: 0, total: 120, totalBrl: 120, lucro: null },
      { data: '2026-01-05', tipo: 'Compra', preco: 10, quantidade: 10, taxa: 0, total: 100, totalBrl: 100, lucro: null },
    ],
    proventos: [{ dataCom: '2026-02-05', dataPagamento: '2026-02-15', tipo: 'Dividendo', quantidade: 20, valorPorCota: 0.25, liquido: 5, moeda: 'BRL', cambio: null, valor: 5 }],
    aReceber: [{ ticker: 'TEST3', tipo: 'JCP', dataPagamento: '2026-04-20', valor: 3, fonte: 'B3' }],
    pagosNaoLancados: [],
    faixa52: null,
    indices: [
      { data: '2026-01-02', cdi: 100, ipca: 50, ibovespa: 1000, ifix: 300, sp500: 40, cambioUsd: 5, patrimonio: 1000 },
      { data: '2026-01-30', cdi: 101, ipca: 50.5, ibovespa: 1010, ifix: 301, sp500: 41, cambioUsd: 5, patrimonio: 1200 },
      { data: '2026-02-27', cdi: 102, ipca: 51, ibovespa: 1020, ifix: 302, sp500: 42, cambioUsd: 5, patrimonio: 1250 },
      { data: '2026-03-09', cdi: 102.5, ipca: 51, ibovespa: 1030, ifix: 303, sp500: 43, cambioUsd: 5, patrimonio: 1350 },
    ],
  };
}

test('histórico do ativo: dias da série + hoje ao vivo; compra/venda/provento no dia certo (o provento de um dia sem ponto vai pro próximo)', () => {
  const h = montarHistoricoAtivo(respostaAcao());
  assert.deepEqual(h.map((p) => p.data), ['2026-01-05', '2026-01-06', '2026-01-30', '2026-02-02', '2026-02-27', '2026-03-09', '2026-03-10']);
  assert.equal(h.at(-1).ativo, 270, 'hoje = Total atualizado da tabela de Carteiras');
  assert.equal(h[0].fluxoCaixaAtivo, 100);
  assert.equal(h[3].fluxoCaixaAtivo, 120);
  assert.equal(h[4].fluxoCaixaAtivo, -5, 'provento conta como ganho (fluxo negativo)');
  assert.equal(h[4].proventosAtivo, 5);
  assert.equal(h[4].fluxoAplicadoAtivo, 0, 'provento nunca mexe no Valor aplicado');
  assert.deepEqual(aplicadoAcumulado(h), [100, 100, 100, 220, 220, 220, 220]);
  // índices do dia, repetindo o último conhecido
  assert.equal(h[1].indiceCdi, 100);
  assert.equal(h[2].ibovespa, 1010);
  assert.equal(h.at(-1).ibovespa, 1030);
  perto(percentualNaCarteira(h), 270 / 1350);
});

test('rentabilidade do ativo (mesmo motor das Carteiras): TWR com o provento, e o ganho em R$ = resultado + proventos', () => {
  const h = montarHistoricoAtivo(respostaAcao());
  const r = calcularResumoRentabilidade(null, h, { visaoId: 'ativoAcoes', periodoId: 'tudo' });
  const esperado = (110 / 100) * (120 / 110) * ((240 - 120) / 120) * ((250 + 5) / 240) * (260 / 250) * (270 / 260) - 1;
  perto(r.percentual, esperado * 100, 1e-9);
  perto(r.ganhoReais, (270 - 220) + 5, 1e-9);
  const mes = calcularResumoRentabilidade(null, h, { visaoId: 'ativoAcoes', periodoId: 'mes' });
  perto(mes.percentual, (270 / 250 - 1) * 100, 1e-9);
  assert.equal(filtrarHistoricoPorPeriodo(h, 'mes')[0].data, '2026-02-27', 'o mês começa no fechamento do mês anterior');
});

test('mês a mês (mais recente primeiro): saldo, quantidade, rentabilidade, índice e CDI do mês, % do patrimônio, proventos e aplicado', () => {
  const m = historicoMensal(montarHistoricoAtivo(respostaAcao()), { campoIndice: 'ibovespa' });
  assert.deepEqual(m.map((x) => x.mes), ['2026-03', '2026-02', '2026-01']);
  const [mar, fev, jan] = m;
  assert.equal(mar.saldo, 270);
  assert.equal(mar.cotas, 20);
  perto(mar.rentabilidade, (270 / 250 - 1) * 100, 1e-9);
  perto(fev.rentabilidade, (255 / 240 - 1) * 100, 1e-9);
  perto(jan.rentabilidade, (120 / 100 - 1) * 100, 1e-9);
  perto(mar.indice, (1030 / 1020 - 1) * 100, 1e-9);
  perto(fev.cdi, (102 / 101 - 1) * 100, 1e-9);
  assert.equal(jan.indice, null, '1º mês sem base');
  assert.equal(fev.proventos, 5);
  assert.equal(fev.aplicado, 220);
  perto(mar.percentualCarteira, 270 / 1350);
});

test('extrato: compras e proventos juntos, do mais recente pro mais antigo', () => {
  const e = montarExtrato(respostaAcao());
  assert.deepEqual(e.map((x) => [x.data, x.tipo, x.grupo]), [
    ['2026-02-15', 'Dividendo', 'provento'], ['2026-02-02', 'Compra', 'movimentacao'], ['2026-01-05', 'Compra', 'movimentacao'],
  ]);
  assert.equal(e[0].preco, 0.25);
  assert.equal(e[0].dataCom, '2026-02-05');
});

test('proventos: total, 12 meses fechados, mês atual, yield on cost sobre o aplicado, 24 meses pro gráfico e a receber', () => {
  const p = resumoProventosAtivo(respostaAcao(), { aplicadoHoje: 220 });
  assert.equal(p.total, 5);
  assert.equal(p.ultimos12, 5);
  assert.equal(p.mesAtual, 0);
  perto(p.yieldOnCost12, 5 / 220);
  assert.equal(p.porMes.length, 24);
  assert.equal(p.porMes.at(-1).mes, '2026-03');
  assert.deepEqual(p.porMes.find((x) => x.mes === '2026-02'), { mes: '2026-02', valor: 5, tipos: ['Dividendo'] });
  assert.deepEqual(p.porAno, [{ ano: '2026', valor: 5 }]);
  assert.equal(p.totalAReceber, 3);
  assert.equal(p.primeiroPagamento, '2026-02-15');
});

test('cotação x preço-teto: mínimo/máximo pela série (parcial com menos de 1 ano), margem até o teto; FIIs usam o 52 semanas da planilha', () => {
  const f = faixaDePreco(respostaAcao());
  assert.equal(f.min, 10);
  assert.equal(f.max, 13.5, 'a cotação de hoje entra no máximo');
  assert.equal(f.parcial, true);
  assert.equal(f.fonte, 'serie');
  perto(f.margemTeto, (15 - 13.5) / 15);
  assert.equal(f.posicoes.min, 0);
  assert.equal(f.posicoes.teto, 1);
  const fii = faixaDePreco({ ...respostaAcao(), classe: 'fiis', faixa52: { min: 9, max: 14, fonte: 'Carteira FIIs' } });
  assert.equal(fii.fonte, 'planilha');
  assert.equal(fii.min, 9);
  assert.equal(faixaDePreco({ ...respostaAcao(), tipo: 'rf' }), null);
});

test('posição: saldo, aplicado, resultado (+ com proventos) e rentabilidade sobre o preço médio', () => {
  const r = respostaAcao();
  const p = resumoPosicao(r, montarHistoricoAtivo(r));
  assert.equal(p.resultado, 50);
  perto(p.percentual, 50 / 220);
  assert.equal(p.resultadoComProventos, 55);
  perto(p.rentabilidadeSobrePm, 13.5 / 11 - 1);
  assert.equal(p.aplicadoHistorico, 220);
});

test('venda: sai o CUSTO MÉDIO da parte vendida do aplicado (o recebido vai pro fluxo); sobra < 2% fecha a posição', () => {
  const base = { ok: true, tipo: 'rv', moeda: 'BRL', proventos: [] };
  const ev = eventosDoAtivo({ ...base, transacoes: [
    { data: '2026-01-02', tipo: 'Compra', quantidade: 10, total: 100, totalBrl: 100 },
    { data: '2026-01-03', tipo: 'Compra', quantidade: 10, total: 200, totalBrl: 200 },
    { data: '2026-01-04', tipo: 'Venda', quantidade: 5, total: 90, totalBrl: 90 },
  ] });
  assert.deepEqual(ev.map((e) => [e.caixa, e.aplicado]), [[100, 100], [200, 200], [-90, -75]]);
  const fecha = eventosDoAtivo({ ...base, transacoes: [
    { data: '2026-01-02', tipo: 'Compra', quantidade: 100, total: 1000, totalBrl: 1000 },
    { data: '2026-01-03', tipo: 'Venda', quantidade: 99, total: 1200, totalBrl: 1200 },
  ] });
  assert.equal(fecha[1].aplicado, -1000);
  // ação EUA: o total em reais vem pronto do Apps Script (câmbio do dia)
  const usd = eventosDoAtivo({ ...base, moeda: 'USD', transacoes: [{ data: '2026-01-02', tipo: 'Compra', quantidade: 1, total: 10, totalBrl: 52 }] });
  assert.equal(usd[0].caixa, 52);
  assert.equal(valorAtualBrl({ moeda: 'USD', ativo: { totalAtualizado: 12 }, indices: [{ cambioUsd: 5 }] }), 60);
});

test('posição zerada: a venda depois do último dia da série vira um ponto com saldo 0 (o TWR não soma o valor da venda por cima do saldo)', () => {
  const r = {
    ok: true, hoje: '2026-01-20', tipo: 'rv', moeda: 'BRL', ativo: null, proventos: [], indices: [],
    serie: [{ data: '2026-01-05', cotas: 10, preco: 10, valor: 100, valorBrl: 100 }, { data: '2026-01-06', cotas: 10, preco: 11, valor: 110, valorBrl: 110 }],
    transacoes: [{ data: '2026-01-05', tipo: 'Compra', quantidade: 10, total: 100, totalBrl: 100 }, { data: '2026-01-08', tipo: 'Venda', quantidade: 10, total: 115, totalBrl: 115 }],
  };
  const h = montarHistoricoAtivo(r);
  assert.deepEqual(h.map((p) => [p.data, p.ativo, p.fluxoCaixaAtivo]), [['2026-01-05', 100, 100], ['2026-01-06', 110, 0], ['2026-01-08', 0, -115]]);
  const tudo = calcularResumoRentabilidade(null, h, { visaoId: 'ativoAcoes', periodoId: 'tudo' });
  perto(tudo.ganhoReais, 15, 1e-9);
});

test('renda fixa: aplicação/resgate por PEPS, juros semestrais contam como provento, e a diferença histórico x valor da Carteira é ajuste (não rendimento)', () => {
  assert.equal(tipoMovimentacaoRf({ tipo: 'APLICAÇÃO' }), 'compra');
  assert.equal(tipoMovimentacaoRf({ tipo: 'Resgate' }), 'venda');
  assert.equal(tipoMovimentacaoRf({ tipo: 'Juros' }), 'juros');
  assert.equal(tipoMovimentacaoRf({ tipo: 'Transferência', entradaSaida: 'Credito' }), 'transfEntrada');
  assert.equal(tipoMovimentacaoRf({ tipo: 'Transferência', entradaSaida: 'Debito' }), 'transfSaida');
  const r = {
    ok: true, hoje: '2026-01-10', tipo: 'rf', classe: 'rendaFixa', moeda: 'BRL', proventos: [], indices: [],
    ativo: { totalAtualizado: 310, totalInvestido: 200 },
    serie: [{ data: '2026-01-02', valor: 100 }, { data: '2026-01-03', valor: 300 }, { data: '2026-01-09', valor: 300 }],
    transacoes: [
      { data: '2026-01-02', tipo: 'Compra', quantidade: 1, total: 100 },
      { data: '2026-01-03', tipo: 'Compra', quantidade: 1, total: 200 },
      { data: '2026-01-05', tipo: 'Venda', quantidade: 1, total: 110 },
      { data: '2026-01-06', tipo: 'Juros', quantidade: 0, total: 4 },
    ],
  };
  const ev = eventosDoAtivo(r);
  assert.deepEqual(ev.map((e) => [e.caixa, e.aplicado, e.provento]), [[100, 100, 0], [200, 200, 0], [-110, -100, 0], [-4, 0, 4]]);
  const h = montarHistoricoAtivo(r);
  const hoje = h.at(-1);
  assert.equal(hoje.data, '2026-01-10');
  assert.equal(hoje.ativo, 310);
  assert.equal(hoje.ajusteMarcacao, 10, 'R$ 310 da Carteira contra R$ 300 do histórico');
  assert.equal(hoje.fluxoCaixaAtivo, 10);
  assert.equal(h.find((p) => p.data === '2026-01-09').fluxoCaixaAtivo, -114, 'venda + juros entram no próximo dia com ponto');
  const e = montarExtrato(r);
  assert.deepEqual(e.map((x) => x.tipo), ['Juros (cupom)', 'Resgate', 'Aplicação', 'Aplicação']);
  assert.equal(e[0].grupo, 'provento');
});

test('IR: fonte do informe por ticker › prefixo › instituição › classe; notas do ticker e da classe', () => {
  const ir = {
    prazo: 'Até fevereiro.', atualizadoEm: '2026-09',
    fontes: { esc1: { nome: 'Escriturador 1' }, esc2: { nome: 'Escriturador 2' }, corr: { nome: 'Corretora' }, eua: { nome: 'Corretora EUA' } },
    porTicker: { TEST3: ['esc1'], DUPL11: ['esc1', 'esc2'], FANT3: ['naoExiste'] },
    porPrefixo: { ABCD: ['esc2'] },
    porInstituicao: [{ contem: 'CORRETORA X', fontes: ['corr'] }],
    porClasse: { acoesEua: ['eua'] },
    notas: { DUPL11: ['confira nos dois'], rendaFixa: ['nota rf'] },
  };
  assert.deepEqual(informesIrDoAtivo(ir, { ticker: 'test3', classe: 'acoes' }).fontes.map((f) => f.nome), ['Escriturador 1']);
  assert.deepEqual(informesIrDoAtivo(ir, { ticker: 'DUPL11', classe: 'fiis' }).fontes.map((f) => f.id), ['esc1', 'esc2']);
  assert.deepEqual(informesIrDoAtivo(ir, { ticker: 'DUPL11', classe: 'fiis' }).notas, ['confira nos dois']);
  assert.deepEqual(informesIrDoAtivo(ir, { ticker: 'ABCD7', classe: 'acoes' }).fontes.map((f) => f.id), ['esc2'], 'prefixo');
  const rf = informesIrDoAtivo(ir, { ticker: 'Título qualquer', classe: 'rendaFixa', instituicao: 'Corretora X S.A.' });
  assert.deepEqual(rf.fontes.map((f) => f.id), ['corr'], 'instituição, sem diferenciar maiúsculas');
  assert.deepEqual(rf.notas, ['nota rf']);
  assert.deepEqual(informesIrDoAtivo(ir, { ticker: 'AAPL', classe: 'acoesEua' }).fontes.map((f) => f.id), ['eua'], 'classe');
  assert.deepEqual(informesIrDoAtivo(ir, { ticker: 'NOVO3', classe: 'acoes' }).fontes, [], 'sem cadastro');
  assert.deepEqual(informesIrDoAtivo(ir, { ticker: 'FANT3', classe: 'acoes' }).fontes, [], 'fonte que não existe fica de fora');
  assert.equal(informesIrDoAtivo(ir, { ticker: 'TEST3' }).prazo, 'Até fevereiro.');
  assert.equal(informesIrDoAtivo(null, { ticker: 'TEST3' }), null);
});

test('IR: o arquivo real (assets/data/imposto-renda.json) cobre os ativos que o Tiago listou e só aponta pra fontes que existem', async () => {
  const fs = await import('node:fs');
  const ir = JSON.parse(fs.readFileSync(new URL('../assets/data/imposto-renda.json', import.meta.url), 'utf8'));
  const fonteDe = (ticker, classe = 'acoes', instituicao = '') => informesIrDoAtivo(ir, { ticker, classe, instituicao }).fontes.map((f) => f.id);
  assert.deepEqual(fonteDe('BBAS3'), ['bb']);
  assert.deepEqual(fonteDe('PETR4'), ['bradesco']);
  assert.deepEqual(fonteDe('AXIA3'), ['itau']);
  assert.deepEqual(fonteDe('AXIA7'), ['itau']);
  assert.deepEqual(fonteDe('XPML11', 'fiis'), ['btg'], 'informe de 2025 veio do BTG');
  assert.deepEqual(fonteDe('TRXF11', 'fiis'), ['apex']);
  assert.deepEqual(fonteDe('TUPY3'), ['btg'], 'trocou de escriturador em 2025');
  assert.deepEqual(fonteDe('HGRU11', 'fiis'), ['genial']);
  assert.deepEqual(fonteDe('Tesouro Selic 2029', 'rendaFixa', 'XP INVESTIMENTOS CCTVM S/A.'), ['xp']);
  assert.deepEqual(fonteDe('Tesouro IPCA+', 'rendaFixa', 'NU INVESTIMENTOS S.A. - CTVM'), ['nubank']);
  assert.deepEqual(fonteDe('LCI', 'rendaFixa', 'BANCO INTER S/A'), ['inter']);
  assert.deepEqual(fonteDe('PAM', 'acoesEua'), ['ibkr']);
  const todas = [...Object.values(ir.porTicker), ...Object.values(ir.porPrefixo), ...ir.porInstituicao.map((r) => r.fontes), ...Object.values(ir.porClasse)].flat();
  todas.forEach((id) => assert.ok(ir.fontes[id], `fonte "${id}" existe`));
  Object.values(ir.fontes).flatMap((f) => f.links || []).forEach((l) => {
    assert.match(l.url, /^https:\/\//, 'só https');
    assert.doesNotMatch(l.url, /b3\.com\.br/, 'sem links da B3');
  });
});

test('teses: mais nova primeiro, marcada', () => {
  const t = ordenarTeses([{ data: '2025-01-02' }, { data: '2026-08-21' }, { data: '2026-01-10' }]);
  assert.deepEqual(t.map((x) => [x.data, x.maisRecente]), [['2026-08-21', true], ['2026-01-10', false], ['2025-01-02', false]]);
});

test('endereço da tela do ativo: ticker ou rf:<título>|<instituição>, absoluto a partir da raiz do site', () => {
  assert.equal(refAtivo({ classe: 'acoes', ticker: 'test3' }), 'TEST3');
  assert.equal(refAtivo({ classe: 'rf', nome: 'Tesouro Selic 2029', instituicao: 'CORRETORA X' }), 'rf:Tesouro Selic 2029|CORRETORA X');
  assert.equal(refAtivo({ classe: 'rf', nomePersonalizado: 'LCI - BANCO', tipoInvestimento: 'LCI', instituicao: 'BANCO' }), 'rf:LCI - BANCO|BANCO');
  const raizSite = 'https://exemplo.test/repo/';
  assert.equal(urlAtivoTicker('test3', { raizSite }), 'https://exemplo.test/repo/ativo/index.html?ref=TEST3');
  const u = urlAtivo('rf:Tesouro IPCA+ 2029|XP', { raizSite });
  assert.equal(refDaUrl(u), 'rf:Tesouro IPCA+ 2029|XP', 'o "+" e o "|" sobrevivem à ida e volta');
  assert.equal(refDaUrl('nao é url'), '');
});

test('link-ativo: ícone de nova aba (target _blank + noopener, href escapado) junto do link normal do ticker', () => {
  const html = linkNovaAbaHtml('https://x.test/ativo/index.html?ref=A&b="c"', 'ABC3');
  assert.match(html, /class="link-ativo-nova-aba"/);
  assert.match(html, /target="_blank" rel="noopener"/);
  assert.match(html, /href="https:\/\/x\.test\/ativo\/index\.html\?ref=A&amp;b=&quot;c&quot;"/);
  assert.match(html, /aria-label="Abrir ABC3 em nova aba"/);
  const grupo = linkAtivoComNovaAbaHtml('https://x.test/a', 'ABC3', 'ABC3');
  assert.match(grupo, /^<span class="link-ativo-grupo"><a class="link-ativo" href="https:\/\/x\.test\/a">ABC3<\/a><a class="link-ativo-nova-aba"/);
});

test('IR: posição fiscal pelo custo médio (taxa entra no custo, venda tira a fração, data de corte inclusiva)', () => {
  const tr = [
    { data: '2025-03-10', tipo: 'Compra', quantidade: 10, total: 101 },
    { data: '2025-06-10', tipo: 'Compra', quantidade: 10, total: 121 },
    { data: '2025-12-31', tipo: 'Venda', quantidade: 5, total: 70 },
    { data: '2026-02-01', tipo: 'Compra', quantidade: 5, total: 60 },
  ];
  const p = posicaoFiscal(tr, '2025-12-31');
  assert.equal(p.quantidade, 15);
  assert.equal(p.custo, 166.5, '222 - 1/4 de 222');
  assert.equal(p.custoBrl, 166.5);
  assert.ok(Math.abs(p.precoMedio - 11.1) < 1e-9);
  assert.equal(posicaoFiscal(tr, '2025-06-09').quantidade, 10, 'compra depois do corte não conta');
  assert.deepEqual(posicaoFiscal(tr, '2024-12-31'), { quantidade: 0, custo: 0, custoBrl: 0, precoMedio: null });
  const zerada = posicaoFiscal([{ data: '2025-01-02', tipo: 'Compra', quantidade: 2, total: 20 }, { data: '2025-02-02', tipo: 'Venda', quantidade: 2, total: 30 }], '2025-12-31');
  assert.equal(zerada.quantidade, 0);
});

test('IR: Ações EUA - custo em reais pelo câmbio de cada compra; sem o valor em reais de alguma compra, custoBrl fica null', () => {
  const tr = [
    { data: '2025-01-10', tipo: 'Compra', quantidade: 1.5, total: 30, totalBrl: 150 },
    { data: '2025-05-10', tipo: 'Compra', quantidade: 0.5, total: 12, totalBrl: 66 },
  ];
  const p = posicaoFiscal(tr, '2025-12-31', { emDolar: true });
  assert.equal(p.quantidade, 2);
  assert.equal(p.custo, 42);
  assert.equal(p.custoBrl, 216);
  assert.equal(posicaoFiscal([{ ...tr[0], totalBrl: null }], '2025-12-31', { emDolar: true }).custoBrl, null);
});

const IR_DECL = {
  fontes: { corr: { nome: 'Corretora', cnpj: '11.111.111/0001-11' } },
  porInstituicao: [{ contem: 'CORRETORA X', fontes: ['corr'] }],
  declaracao: {
    acoes: { grupo: '03', grupoNome: 'Participações societárias', codigo: '01', codigoNome: 'Ações', localizacao: '105 - Brasil', negociadoEmBolsa: true },
    fiis: { grupo: '07', grupoNome: 'Fundos', codigo: '03', codigoNome: 'FII', localizacao: '105 - Brasil', negociadoEmBolsa: true },
    acoesEua: { grupo: '03', grupoNome: 'Participações societárias', codigo: '01', codigoNome: 'Ações', localizacao: '249 - Estados Unidos', negociadoEmBolsa: true, notas: ['dividendos no bem'] },
    rendaFixa: { grupo: '04', grupoNome: 'Aplicações', codigo: '02', codigoNome: 'Tributados', localizacao: '105 - Brasil', isentos: { contem: ['LCI', 'LCA'], codigo: '03', codigoNome: 'Isentos' } },
    notaConsolidado: 'soma tudo',
  },
};

test('IR: "Na declaração" - ficha da classe, texto de 31/12 do ano passado e prévia de hoje (ações e FII)', () => {
  const tr = [{ data: '2025-04-01', tipo: 'Compra', quantidade: 10, total: 105 }, { data: '2026-02-01', tipo: 'Compra', quantidade: 10, total: 95 }];
  const d = declaracaoIrDoAtivo(IR_DECL, { classe: 'acoes', ticker: 'TEST3', hoje: '2026-09-20', transacoes: tr, sobre: { nome: 'Teste S.A. (antiga Velha)', cnpj: '00.000.000/0001-00' } });
  assert.equal(d.ficha.grupo, '03');
  assert.equal(d.ficha.cnpj, '00.000.000/0001-00');
  assert.equal(d.posicoes[0].rotulo, 'Situação em 31/12/2025');
  assert.equal(d.posicoes[0].texto, '10 AÇÕES TESTE S.A. - CÓDIGO DE NEGOCIAÇÃO TEST3 - CNPJ 00.000.000/0001-00. PREÇO MÉDIO R$ 10,50; CUSTO TOTAL R$ 105,00 EM 31/12/2025.');
  assert.equal(d.posicoes[0].valor, 105);
  assert.equal(d.posicoes[1].previa, true);
  assert.match(d.posicoes[1].texto, /^20 AÇÕES .* CUSTO TOTAL R\$ 200,00 EM 20\/09\/2026\.$/);
  assert.deepEqual(d.notas, ['soma tudo']);

  const fii = declaracaoIrDoAtivo(IR_DECL, { classe: 'fiis', ticker: 'TEST11', hoje: '2026-01-15', transacoes: [{ data: '2026-01-10', tipo: 'Compra', quantidade: 3, total: 300 }], sobre: { nome: 'Fundo Teste FII', cnpj: '22.222.222/0001-22' } });
  assert.equal(fii.ficha.codigo, '03');
  assert.equal(fii.posicoes[0].texto, '', 'não tinha em 31/12/2025');
  assert.equal(fii.posicoes[0].valor, 0);
  assert.match(fii.posicoes[1].texto, /^3 COTAS DO FII FUNDO TESTE FII - CÓDIGO DE NEGOCIAÇÃO TEST11 - CNPJ DO FUNDO 22\.222\.222\/0001-22\./);
});

test('IR: "Na declaração" - Ações EUA (US$ + reais, país 249) e renda fixa (LCI vai pra 04-03, CNPJ da instituição, saldo do histórico)', () => {
  const eua = declaracaoIrDoAtivo(IR_DECL, { classe: 'acoesEua', ticker: 'TSTU', hoje: '2026-09-20', transacoes: [{ data: '2025-05-01', tipo: 'Compra', quantidade: 2.5, total: 50, totalBrl: 275 }], sobre: { nome: 'Test Corp', bolsa: 'NYSE' } });
  assert.equal(eua.ficha.localizacao, '249 - Estados Unidos');
  assert.equal(eua.ficha.cnpj, undefined);
  assert.equal(eua.posicoes[0].texto, '2,5 AÇÕES TEST CORP - CÓDIGO DE NEGOCIAÇÃO TSTU (NYSE), CUSTODIADAS NA INTERACTIVE BROKERS LLC (EUA). PREÇO MÉDIO US$ 20,00; CUSTO TOTAL US$ 50,00, EQUIVALENTE A R$ 275,00 PELO CÂMBIO DE CADA COMPRA EM 31/12/2025.');
  assert.equal(eua.posicoes[0].valor, 275, 'situação em reais');
  assert.ok(eua.notas.includes('dividendos no bem'));

  const historico = [{ data: '2025-12-30', ativo: 1000.123 }, { data: '2026-01-02', ativo: 1010 }, { data: '2026-09-20', ativo: 1100 }];
  const rf = declaracaoIrDoAtivo(IR_DECL, { ehRf: true, classe: 'rendaFixa', ticker: 'LCI Teste', hoje: '2026-09-20', historico, ativo: { tipoInvestimento: 'LCI / LCA Pós-fixada', indexador: 'CDI', vencimento: '01/2028', instituicao: 'Corretora X S.A.' } });
  assert.equal(rf.ficha.codigo, '03');
  assert.equal(rf.ficha.cnpj, '11.111.111/0001-11');
  assert.equal(rf.posicoes[0].valor, 1000.12, 'último saldo até 31/12');
  assert.equal(rf.posicoes[1].valor, 1100);
  assert.equal(rf.posicoes[0].texto, 'LCI TESTE (CDI) - VENCIMENTO 01/2028 - CORRETORA X S.A.', 'sem ponto duplo');
  const tesouro = declaracaoIrDoAtivo(IR_DECL, { ehRf: true, ticker: 'Tesouro Selic 2029', hoje: '2026-09-20', ativo: { tipoInvestimento: 'Tesouro Selic (LFT)' } });
  assert.equal(tesouro.ficha.codigo, '02');
  assert.equal(declaracaoIrDoAtivo(null, { classe: 'acoes', ticker: 'X', hoje: '2026-01-01' }), null);
});
