// tests/gastos-calc.test.js
//
// 02/10/2026: contas da seção Gastos (gastos-calc.js) - categorização,
// o que é/não é gasto (pagamento da fatura não conta 2x), deduplicação,
// recorrentes, parcelas em aberto, cobertura dos documentos, essencial x real.
// Tudo inventado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizar, prepararRegras, chaveDescricao, ehGasto, prepararLancamentos, chavesDedup, deduplicar, intervaloPeriodo,
  totaisPorMes, detectarRecorrentes, parcelamentosEmAberto, coberturaDocumentos, compararEssenciais, resumoGastos, somarMeses,
} from '../assets/js/pages/gastos-calc.js';

const L = (o) => ({ origem: 'cartao', fonte: 'nubank-cartao', tipo: 'compra', parcela: '', ...o });

test('categorização automática e regras do Tiago (ganham, maior padrão primeiro)', () => {
  const casos = [
    ['iFood *Restaurante X', 'restaurantes'], ['UBER *TRIP', 'transporte'], ['Uber Eats Pedido', 'restaurantes'], ['SUPERMERCADO BOM', 'mercado'],
    ['Mercado Livre Compra', 'compras'], ['NETFLIX.COM', 'assinaturas'], ['Amazon Prime Br', 'assinaturas'], ['AMAZON MARKETPLACE', 'compras'],
    ['POSTO SHELL', 'combustivel'], ['DROGARIA X', 'saude'], ['HOTEL PRAIA BONITA', 'viagem'], ['SYMPLA *SHOW EXEMPLO', 'lazer'], ['ESCOLA DE IDIOMAS', 'educacao'],
    ['Pix enviado · ENEL DISTRIBUICAO', 'moradia'], ['XYZ QUALQUER', 'outros'],
  ];
  casos.forEach(([d, c]) => assert.equal(categorizar(L({ descricao: d })), c, d));
  assert.equal(categorizar(L({ descricao: 'Pix enviado · Fulana', tipo: 'transferencia', origem: 'conta' })), 'transferencias');
  assert.equal(categorizar(L({ descricao: 'IOF COMPRA', tipo: 'iof' })), 'tarifas');
  assert.equal(categorizar(L({ descricao: 'Pagamento de fatura', tipo: 'pagamento_fatura' })), 'ignorar');
  assert.equal(categorizar(L({ descricao: 'Aplicação RDB', tipo: 'investimento' })), 'investimentos');
  const regras = prepararRegras([{ padrao: 'Pix enviado · Fulana', categoria: 'moradia' }, { padrao: 'FULANA', categoria: 'lazer' }, { padrao: 'x', categoria: 'nao-existe' }]);
  assert.equal(regras.length, 2);
  assert.equal(categorizar(L({ descricao: 'Pix enviado · Fulana', tipo: 'transferencia' }), regras), 'moradia', 'padrão maior ganha');
  assert.equal(chaveDescricao('Amazon - Parcela 1/2'), 'AMAZON');
  assert.equal(chaveDescricao('LOJA PARC 03/10'), 'LOJA');
});

test('o que é gasto: pagamento de fatura no extrato, Pix pra conta própria e investimento não contam; estorno desconta', () => {
  const lancs = prepararLancamentos([
    L({ mes: '2025-03', data: '2025-02-10', descricao: 'Mercado', valor: 100 }),
    L({ mes: '2025-03', data: '2025-02-12', descricao: 'Estorno Mercado', valor: -20, tipo: 'estorno' }),
    L({ mes: '2025-03', data: '2025-02-05', descricao: 'Pagamento em 05 FEV', valor: -500, tipo: 'pagamento_fatura' }),
    L({ mes: '2025-03', data: '2025-03-10', origem: 'conta', fonte: 'nubank-conta', descricao: 'Pagamento de fatura', valor: 500, tipo: 'pagamento_fatura' }),
    L({ mes: '2025-03', data: '2025-03-11', origem: 'conta', fonte: 'nubank-conta', descricao: 'Pix enviado · EU MESMO', valor: 300, tipo: 'transferencia_propria' }),
    L({ mes: '2025-03', data: '2025-03-12', origem: 'conta', fonte: 'nubank-conta', descricao: 'Aplicação RDB', valor: 1000, tipo: 'investimento' }),
    L({ mes: '2025-03', data: '2025-03-13', origem: 'conta', fonte: 'nubank-conta', descricao: 'Pix enviado · Diarista', valor: 150, tipo: 'transferencia' }),
  ], []);
  assert.deepEqual(lancs.map((l) => l.gasto), [true, true, false, false, false, false, true]);
  const [m] = totaisPorMes(lancs, ['2025-03']);
  assert.equal(m.total, 230);
  assert.equal(m.cartao, 80);
  assert.equal(m.conta, 150);
  assert.equal(ehGasto({ tipo: 'compra', categoria: 'ignorar' }), false, '"não é gasto" escolhido pelo Tiago');
});

test('deduplicação: extratos que se sobrepõem não contam o mesmo lançamento 2x; 2 Pix iguais no mesmo dia continuam 2', () => {
  const a = [{ data: '2025-01-31', valor: 50, descricao: 'Pix · X' }, { data: '2025-01-31', valor: 50, descricao: 'Pix · X' }, { data: '2025-01-30', valor: 10, descricao: 'Tarifa' }];
  const ka = chavesDedup('bradesco', a);
  assert.equal(new Set(ka).size, 3);
  const existentes = a.map((l, i) => ({ ...l, arquivo: 'A', chaveDedup: ka[i] }));
  const b = [{ data: '2025-01-31', valor: 50, descricao: 'Pix · X' }, { data: '2025-02-01', valor: 20, descricao: 'Compra' }];
  const novos = b.map((l, i) => ({ ...l, chaveDedup: chavesDedup('bradesco', b)[i] }));
  assert.deepEqual(deduplicar(existentes, novos, 'B').map((l) => l.descricao), ['Compra']);
  assert.equal(deduplicar(existentes, novos, 'A').length, 2, 'reimportar o próprio arquivo substitui');
});

test('recorrentes: mesma descrição e valor parecido 3+ meses seguidos; parcelado e valor solto não', () => {
  const meses = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'];
  const brutos = [];
  meses.forEach((m, i) => {
    brutos.push(L({ mes: m, data: `${m}-05`, descricao: 'NETFLIX.COM', valor: i < 3 ? 39.9 : 44.9 }));
    brutos.push(L({ mes: m, data: `${m}-08`, descricao: 'Mercado Exemplo', valor: 100 + i * 60 }));
    brutos.push(L({ mes: m, data: `${m}-09`, descricao: `Loja - Parcela ${i + 1}/5`, valor: 80, parcela: `${i + 1}/5` }));
  });
  brutos.push(L({ mes: '2025-01', data: '2025-01-10', descricao: 'Revista Cancelada', valor: 20 }), L({ mes: '2025-02', data: '2025-02-10', descricao: 'Revista Cancelada', valor: 20 }), L({ mes: '2025-03', data: '2025-03-10', descricao: 'Revista Cancelada', valor: 20 }));
  const rec = detectarRecorrentes(prepararLancamentos(brutos, []), { ultimoMes: '2025-05' });
  const nomes = rec.map((r) => r.descricao);
  assert.ok(nomes.includes('NETFLIX.COM'));
  assert.ok(!nomes.some((n) => /Mercado|Loja/.test(n)));
  const nf = rec.find((r) => r.descricao === 'NETFLIX.COM');
  assert.equal(nf.valor, 44.9);
  assert.equal(nf.ativa, true);
  const rev = rec.find((r) => r.descricao === 'Revista Cancelada');
  assert.equal(rev.ativa, false);
});

test('parcelamentos em aberto: só o que aparece na fatura mais recente da fonte; compromisso mês a mês', () => {
  const lancs = prepararLancamentos([
    L({ mes: '2025-04', data: '2025-02-01', descricao: 'Loja A - Parcela 3/5', valor: 100, parcela: '3/5' }),
    L({ mes: '2025-05', data: '2025-02-01', descricao: 'Loja A - Parcela 4/5', valor: 100, parcela: '4/5' }),
    L({ mes: '2025-05', data: '2025-05-01', descricao: 'Loja B - Parcela 1/2', valor: 50, parcela: '1/2' }),
    L({ mes: '2025-03', data: '2025-01-01', descricao: 'Loja C - Parcela 1/6', valor: 30, parcela: '1/6' }), // sumiu (estornada/quitada)
    L({ mes: '2025-05', data: '2025-04-20', descricao: 'Loja D - Parcela 2/2', valor: 70, parcela: '2/2' }), // última
  ], []);
  const p = parcelamentosEmAberto(lancs);
  assert.deepEqual(p.compras.map((c) => [c.descricao, c.restantes, c.fim]), [['Loja A', 1, '2025-06'], ['Loja B', 1, '2025-06']]);
  assert.deepEqual(p.porMes, [{ mes: '2025-06', total: 150 }]);
  assert.equal(p.total, 150);
});

test('cobertura dos documentos: meses importados por fonte e os que faltam até o mês passado', () => {
  const c = coberturaDocumentos([
    { fonte: 'ourocard', meses: ['2025-01'] }, { fonte: 'ourocard', meses: ['2025-03'] },
    { fonte: 'bradesco', meses: ['2025-01', '2025-02', '2025-03', '2025-04'] },
  ], '2025-05-10');
  const ouro = c.fontes.find((f) => f.fonte === 'ourocard');
  assert.deepEqual(ouro.faltam, ['2025-02', '2025-04']);
  assert.deepEqual(c.fontes.find((f) => f.fonte === 'bradesco').faltam, []);
  assert.equal(c.ultimoFechado, '2025-04');
});

test('essencial x real e resumo por período (média, comparação com 6/12 meses)', () => {
  const brutos = [];
  for (let k = 0; k < 13; k += 1) {
    const m = somarMeses('2024-05', k);
    brutos.push(L({ mes: m, data: `${m}-03`, descricao: 'SUPERMERCADO X', valor: 1000 }));
    brutos.push(L({ mes: m, data: `${m}-04`, origem: 'conta', fonte: 'nubank-conta', descricao: 'Pagamento de boleto · CONDOMINIO Y', valor: 500, tipo: 'boleto' }));
  }
  brutos.push(L({ mes: '2025-05', data: '2025-05-20', descricao: 'HOTEL Z', valor: 1500 }));
  const despesas = { despesas: { itens: [{ nome: 'Mercado', valor: 900, categoria: 'Alimentação' }, { nome: 'Condomínio', valor: 500, categoria: 'Moradia' }, { nome: 'Seguro', valor: 1200, categoria: 'Outros', frequencia: 'Anual' }] }, salario: { liquido: 5000 } };
  const arquivos = [{ fonte: 'nubank-cartao', meses: Array.from({ length: 13 }, (_, k) => somarMeses('2024-05', k)) }];
  const r = resumoGastos({ lancamentos: brutos, regras: [], arquivos }, { periodo: '12m', hoje: '2025-06-02', despesas });
  assert.equal(r.mesRef, '2025-05');
  assert.equal(r.intervalo.meses.length, 12);
  assert.equal(r.doMes.total, 3000);
  assert.equal(r.media12, 1500);
  assert.equal(r.media6, 1500);
  assert.equal(r.categorias[0].id, 'mercado');
  assert.equal(r.maiores[0].descricao, 'HOTEL Z', 'gastos fixos (mercado/condomínio todo mês) ficam fora dos maiores');
  const e = r.essenciais;
  assert.equal(e.essencial, 1500);
  assert.deepEqual(e.linhas.find((l) => l.categoria === 'Alimentação'), { categoria: 'Alimentação', cadastrado: 900, real: 1000, diferenca: 100 });
  assert.equal(e.linhas.find((l) => l.categoria === 'Outros').real, null);
  assert.ok(e.fracaoSalario > 0.3 && e.fracaoSalario < 0.4);
  const mes = resumoGastos({ lancamentos: brutos, regras: [], arquivos }, { periodo: 'mes', mesEscolhido: '2024-12', hoje: '2025-06-02' });
  assert.equal(mes.total, 1500);
  assert.deepEqual(intervaloPeriodo('ano', '2025-05', '2024-05').meses, ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05']);
  assert.equal(compararEssenciais(null, {}, 100), null);
  assert.equal(resumoGastos({ lancamentos: [], regras: [], arquivos: [] }).vazio, true);
});

// 03/10/2026 (revisão): "Escolher período" também nos Gastos - período
// personalizado { inicio, fim } recorta os lançamentos pelo DIA.
test('período personalizado: recorte por dia (total, categorias e maiores), meses que o intervalo toca e mês de referência', () => {
  const brutos = [];
  for (let k = 0; k < 4; k += 1) {
    const m = somarMeses('2025-03', k);
    brutos.push(L({ mes: m, data: `${m}-03`, descricao: 'SUPERMERCADO X', valor: 100 }));
    brutos.push(L({ mes: m, data: `${m}-20`, descricao: 'POSTO Y', valor: 50 }));
  }
  const dados = { lancamentos: brutos, regras: [], arquivos: [{ fonte: 'nubank-cartao', meses: ['2025-03', '2025-04', '2025-05', '2025-06'] }] };
  const r = resumoGastos(dados, { periodo: { inicio: '2025-04-10', fim: '2025-05-05' }, hoje: '2025-07-01' });
  assert.deepEqual(r.intervalo.meses, ['2025-04', '2025-05']);
  assert.deepEqual(r.intervalo.dias, { inicio: '2025-04-10', fim: '2025-05-05' });
  assert.equal(r.total, 150, 'só POSTO Y de 20/04 e SUPERMERCADO X de 03/05');
  assert.equal(r.mesRef, '2025-05');
  assert.equal(r.categorias.reduce((s, c) => s + c.total, 0), 150);
  assert.ok(r.maiores.every((l) => l.data >= '2025-04-10' && l.data <= '2025-05-05'));
  // invertido e antes do 1º mês com dados: normaliza e prende no 1º mês
  const i = intervaloPeriodo({ inicio: '2025-04-30', fim: '2024-12-01' }, '2025-06', '2025-03');
  assert.deepEqual([i.inicio, i.fim, i.dias.inicio], ['2025-03', '2025-04', '2024-12-01']);
});
