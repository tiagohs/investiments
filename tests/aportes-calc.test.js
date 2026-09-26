// tests/aportes-calc.test.js
//
// 26/09/2026: contas do carrinho de aportes (tela Transações, aba Aportes).
// Ativos, preços e datas inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  carrinhoVazio, carrinhoValido, definirQuantidade, definirValorRf, removerDoCarrinho, atualizarPrecos, itensDoCarrinho,
  totaisCarrinho, aporteDoCarrinho, carrinhoDoAporte, carrinhoRepetindo, finalDoItem, concluirAporte, totalAporte,
  classesDoAporte, anosDoResumo, mesesDoAno, aportesPorMes, chaveItem, momentoAporte, totalRanking,
} from '../assets/js/pages/aportes-calc.js';

const CLASSES = {
  acoes: [{ ticker: 'ABCD3', precoAtual: 20, moeda: 'BRL' }],
  fiis: [{ ticker: 'TEST11', precoAtual: 100, moeda: 'BRL' }],
  acoesEua: [{ ticker: 'AAA', precoAtual: 10, moeda: 'USD' }],
  rendaFixa: [{ titulo: 'Tesouro Selic 2029', instituicao: 'CORRETORA X' }],
};

function carrinhoCheio() {
  let c = carrinhoVazio('2026-09-26');
  c = definirQuantidade(c, { classe: 'fiis', ativo: 'TEST11', preco: 99 }, 3);
  c = definirQuantidade(c, { classe: 'acoes', ativo: 'ABCD3', preco: 20 }, 10);
  c = definirQuantidade(c, { classe: 'acoesEua', ativo: 'AAA', moeda: 'USD', preco: 10 }, 1.5);
  c = definirValorRf(c, { ativo: 'Tesouro Selic 2029', instituicao: 'CORRETORA X' }, 500);
  return c;
}

test('carrinho: pôr, mudar e tirar; zero tira; ordem por classe; totais com o dólar', () => {
  let c = carrinhoCheio();
  assert.deepEqual(itensDoCarrinho(c).map((i) => [i.classe, i.ativo, i.subtotal]), [
    ['acoes', 'ABCD3', 200], ['fiis', 'TEST11', 297], ['acoesEua', 'AAA', 15], ['rendaFixa', 'Tesouro Selic 2029', 500],
  ]);
  const t = totaisCarrinho(c, 5);
  assert.equal(t.n, 4);
  assert.equal(t.totalUsd, 15);
  assert.equal(t.totalBrl, 200 + 297 + 75 + 500);
  assert.deepEqual(t.porClasse.acoesEua, { n: 1, valor: 15, brl: 75 });
  c = definirQuantidade(c, { classe: 'acoes', ativo: 'ABCD3', preco: 20 }, 0);
  assert.equal(c.itens[chaveItem('acoes', 'ABCD3')], undefined);
  c = removerDoCarrinho(c, chaveItem('rendaFixa', 'Tesouro Selic 2029', 'CORRETORA X'));
  assert.equal(totaisCarrinho(c, 5).n, 2);
  c = atualizarPrecos(c, CLASSES);
  assert.equal(c.itens[chaveItem('fiis', 'TEST11')].preco, 100, 'cotação de agora');
});

test('carrinho: guardado no navegador é conferido (lixo vira carrinho vazio, item sem quantidade some)', () => {
  assert.deepEqual(carrinhoValido(null, '2026-09-26'), carrinhoVazio('2026-09-26'));
  const c = carrinhoValido({ data: 'ontem', itens: { a: { classe: 'xyz', ativo: 'A', qtd: 1 }, b: { classe: 'fiis', ativo: 'TEST11', qtd: 0 }, c: { classe: 'fiis', ativo: 'TEST11', qtd: 2, preco: 1 } } }, '2026-09-26');
  assert.equal(c.data, '2026-09-26');
  assert.deepEqual(Object.keys(c.itens), ['c']);
});

test('aporte: carrinho -> aguardando -> concluído (quantidade 0 = não comprou), editar e repetir', () => {
  const ap = aporteDoCarrinho({ ...carrinhoCheio(), observacao: 'dia 5' });
  assert.equal(ap.status, 'aguardando');
  assert.equal(ap.id, undefined);
  assert.deepEqual(ap.itens[0], { classe: 'acoes', ativo: 'ABCD3', moeda: 'BRL', qtdPlanejada: 10, precoPlanejado: 20, valorPlanejado: 200 });
  assert.deepEqual(ap.itens[3], { classe: 'rendaFixa', ativo: 'Tesouro Selic 2029', instituicao: 'CORRETORA X', moeda: 'BRL', valorPlanejado: 500 });
  const salvo = { ...ap, id: 'AP-1' };
  assert.equal(totalAporte(salvo, 'planejado', 5), 200 + 297 + 75 + 500);
  const dig = { 0: { preco: 19.5 }, 1: { qtd: 0 }, 3: { valor: 480 } };
  assert.deepEqual(finalDoItem(salvo.itens[0], dig[0]), { qtd: 10, preco: 19.5, valor: 195 });
  assert.equal(totalAporte(salvo, 'final', 5, dig), 195 + 0 + 75 + 480);
  const conc = concluirAporte(salvo, dig);
  assert.equal(conc.status, 'concluido');
  assert.deepEqual(conc.itens.map((i) => i.valorFinal), [195, 0, 15, 480]);
  assert.deepEqual(classesDoAporte(conc), ['acoes', 'fiis', 'acoesEua', 'rendaFixa']);
  const edit = carrinhoDoAporte(salvo);
  assert.equal(edit.editandoId, 'AP-1');
  assert.equal(itensDoCarrinho(edit).length, 4);
  assert.equal(aporteDoCarrinho(edit).id, 'AP-1', 'salvar a edição regrava o mesmo aporte');
  const rep = carrinhoRepetindo(conc, '2026-10-05', CLASSES);
  assert.equal(rep.editandoId, null);
  assert.equal(rep.data, '2026-10-05');
  assert.equal(rep.itens[chaveItem('acoes', 'ABCD3')].preco, 20, 'preço de agora, não o pago');
});

test('resumo: 12 meses do ano, anos disponíveis e aportes concluídos por mês', () => {
  const resumo = { '2026-09': { acoes: 100, fiis: 50, total: 150 }, '2025-01': { rendaFixa: 10, total: 10 } };
  assert.deepEqual(anosDoResumo(resumo, '2026-09-26'), [2026, 2025]);
  const m = mesesDoAno(resumo, 2026);
  assert.equal(m.length, 12);
  assert.deepEqual(m[8], { mes: 9, chave: '2026-09', acoes: 100, fiis: 50, acoesEua: 0, rendaFixa: 0, total: 150, acoesEuaUsd: 0 });
  const aportes = [
    { id: 'a', data: '2026-09-05', status: 'concluido', itens: [{ classe: 'fiis', moeda: 'BRL', valorFinal: 300 }, { classe: 'acoesEua', moeda: 'USD', valorFinal: 10 }] },
    { id: 'b', data: '2026-09-20', status: 'aguardando', itens: [{ classe: 'fiis', moeda: 'BRL', valorPlanejado: 100 }] },
  ];
  assert.deepEqual(aportesPorMes(aportes, 5), { '2026-09': { n: 1, valor: 350 } });
});

test('momento de aporte: teto, meta do Radar (com o R$ que falta), preço médio, última compra, P/L; no limite do teto não conta como folga', () => {
  const a = { ticker: 'ABCD3', moeda: 'BRL', precoAtual: 20, precoTeto: 25, precoMedio: 22, quantidade: 10, ultimoPago: { preco: 21 }, variacaoDia: -0.025,
    radar: { percentualDesejado: 0.1, percentualAtual: 0.03, valorInvestir: 5000, pl: 6, descontoPl: '15% (2% acima - retorno)' } };
  const m = momentoAporte(a, 'acoes', { acoes: { desejado: 0.6, atual: 0.64 } });
  assert.equal(m.nivel, 'bom');
  assert.equal(m.rotulo, 'Bom momento');
  assert.equal(m.pontos, 6.5, 'retorno pelo lucro acima da renda fixa = com desconto (mesma regra da coluna Desc. P/L do Radar)');
  assert.ok(m.sinais.some((x) => x.tom === 'bom' && x.texto === 'Desconto sobre P/L: com desconto (P/L 6,0)'));
  assert.deepEqual(m.sinais.slice(0, 2).map((x) => x.texto), ['Abaixo do preço-teto (R$ 25,00): margem de 25,0%', 'Abaixo do % desejado no Radar (3,0% de 10,0%): faltam R$ 5.000']);
  assert.equal(m.sinais[m.sinais.length - 1].tom, 'ruim', 'o que pesa contra vem por último');
  const limite = momentoAporte({ ...a, precoAtual: 24.9, radar: null, precoMedio: null, ultimoPago: null, variacaoDia: 0 }, 'acoes');
  assert.deepEqual(limite.sinais.map((x) => [x.tom, x.texto]), [['neutro', 'No limite do preço-teto (R$ 25,00): margem de 0,4%']]);
  assert.equal(limite.nivel, 'neutro');
  const eua = momentoAporte({ ticker: 'AAA', moeda: 'USD', precoAtual: 10, precoTeto: 12, radar: { percentualDesejado: 0.2, percentualAtual: 0.1, valorInvestir: 70.26 } }, 'acoesEua');
  assert.match(eua.sinais[1].texto, /faltam US\$ 70,26/);
});

test('momento de aporte: ranking da Suno - primeiros somam, últimos pesam contra e nunca deixam ser "Bom momento"', () => {
  const base = { ticker: 'ABCD3', moeda: 'BRL', precoAtual: 20, precoTeto: 25, radar: { percentualDesejado: 0.1, percentualAtual: 0.03, valorInvestir: 500 } };
  const comRanking = (ranking) => ({ ...base, radar: { ...base.radar, ranking } });
  assert.equal(totalRanking([comRanking(3), comRanking(12), { radar: null }, { ranking: 7 }]), 12);
  const primeiro = momentoAporte(comRanking(2), 'acoes', null, '', { totalRanking: 12 });
  assert.equal(primeiro.nivel, 'bom');
  assert.ok(primeiro.sinais.some((x) => x.tom === 'bom' && x.texto === 'Ranking 2 de 12: entre os primeiros da Suno'));
  const ultimo = momentoAporte(comRanking(11), 'acoes', null, '', { totalRanking: 12 });
  assert.equal(ultimo.pontos, 3, 'teto (+2) + % desejado (+2) - ranking (-1): pelos pontos seria "bom"...');
  assert.equal(ultimo.nivel, 'neutro', '...mas entre os últimos do ranking fica neutro');
  assert.ok(ultimo.sinais.some((x) => x.tom === 'ruim' && x.texto === 'Ranking 11 de 12: entre os últimos da Suno'));
  const meio = momentoAporte(comRanking(6), 'acoes', null, '', { totalRanking: 12 });
  assert.ok(meio.sinais.some((x) => x.tom === 'neutro' && x.texto === 'Ranking 6 de 12 na Suno'));
  assert.ok(!momentoAporte(comRanking(2), 'acoes', null, '', { totalRanking: 2 }).sinais.some((x) => /Ranking/.test(x.texto)), 'lista curta demais: ranking não diz nada');
  assert.ok(!momentoAporte(comRanking(2), 'acoes').sinais.some((x) => /Ranking/.test(x.texto)), 'sem o total, não chuta');
});
