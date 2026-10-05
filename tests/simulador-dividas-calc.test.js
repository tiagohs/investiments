// tests/simulador-dividas-calc.test.js
//
// 02/10/2026: contas do simulador "amortizar ou investir"
// (simulador-dividas-calc.js). Tudo com números inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  novaDivida, nperPrice, custoEfetivo, aliquotaIr, novaCarteira, premissas, cdiNoMes, trNoMes, taxaPercentualCdi,
  extraNoMes, ordemAlvo, simular, parametrosPadrao, dividasDoContexto, veredito, ESTRATEGIAS_VIDEO, REFERENCIAS,
  valorParaMatarParcelas, parcelasQueOValorMata, prazoCaixaSac, minimoParaMatar, opcoesMatarParcelas, projetarMarco, valorNaLinha, proximoMilhao,
} from '../assets/js/pages/simulador-dividas-calc.js';

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (±${tol})`);
// taxas "paradas" pra conferir com fórmula fechada: CDI não anda, sem TR
const FIXAS = { cdi: 0.12, cdiLongo: 0.12, ipca: 0.04, trMensal: 0, anosTransicao: 0 };

function rodar(d, meses, { tr = 0, extras = {} } = {}) {
  const div = novaDivida(d);
  const linhas = [];
  for (let t = 1; t <= meses && div.ativa; t += 1) {
    const r = div.mes(t, tr);
    if (extras[t]) div.extra(t, extras[t].valor, extras[t].modo);
    linhas.push({ ...r, saldo: div.saldo });
  }
  return { div, linhas };
}

test('SAC confere com a fórmula fechada (amortização constante, juros = i·A·n(n+1)/2)', () => {
  const { div, linhas } = rodar({ id: 'x', sistema: 'SAC', saldo: 120000, taxaMensal: 0.01, amortizacao: 1000 }, 500);
  assert.equal(linhas.length, 120);
  assert.equal(div.st.quitadaEm, 120);
  perto(div.st.juros, 0.01 * 1000 * (120 * 121) / 2);
  perto(linhas[0].pagamento, 1000 + 1200);
  perto(linhas[59].saldo, 120000 - 60 * 1000);
});

test('Price confere com a fórmula fechada (PMT, saldo depois de k meses e nper)', () => {
  const s = 100000; const i = 0.01; const n = 120;
  const P = (s * i) / (1 - (1 + i) ** -n);
  const { div, linhas } = rodar({ id: 'x', sistema: 'Price', saldo: s, taxaMensal: i, meses: n }, 500);
  assert.equal(linhas.length, n);
  perto(linhas[0].pagamento, P);
  const k = 60;
  perto(linhas[k - 1].saldo, s * (1 + i) ** k - (P * ((1 + i) ** k - 1)) / i);
  perto(div.st.juros, P * n - s, 0.05);
  assert.equal(nperPrice(s, i, P), n);
});

test('TR corrige saldo e amortização do SAC sem mudar o prazo; seguro cai com o saldo', () => {
  const sem = rodar({ id: 'f', sistema: 'SAC', saldo: 100000, taxaMensal: 0.008, amortizacao: 1000, seguro: 50, tr: true }, 600);
  const com = rodar({ id: 'f', sistema: 'SAC', saldo: 100000, taxaMensal: 0.008, amortizacao: 1000, seguro: 50, tr: true }, 600, { tr: 0.002 });
  assert.equal(sem.linhas.length, 100);
  assert.equal(com.linhas.length, 100);
  assert.ok(com.div.st.juros > sem.div.st.juros);
  assert.ok(com.div.st.correcao > 0 && sem.div.st.correcao === 0);
  assert.ok(sem.linhas[50].pagamento < sem.linhas[0].pagamento);
  perto(sem.linhas[0].pagamento - 1000 - 800, 50, 0.01); // seguro do 1º mês = o de hoje
  // custo efetivo = juros + TR + seguro
  perto(custoEfetivo({ saldo: 100000, taxaMensal: 0.008, seguro: 50, tr: true }, 0.002), (1.008 * 1.002 - 1 + 0.0005 + 1) ** 12 - 1, 1e-9);
});

test('reduzir prazo x reduzir parcela: prazo termina antes e paga menos juros; parcela mantém o fim', () => {
  const base = { id: 'x', sistema: 'SAC', saldo: 120000, taxaMensal: 0.01, amortizacao: 1000 };
  const prazo = rodar(base, 500, { extras: { 1: { valor: 20000, modo: 'prazo' } } });
  const parcela = rodar(base, 500, { extras: { 1: { valor: 20000, modo: 'parcela' } } });
  // 05/10/2026: no SAC a Caixa mantém a prestação (amort. + juros) e recalcula o prazo - cai mais que extra ÷ A
  assert.equal(prazo.linhas.length, 1 + prazoCaixaSac(119000, 119, 0.01, 99000));
  assert.ok(prazo.linhas.length < 100 && prazo.linhas.length > 70);
  assert.ok(prazo.linhas[1].pagamento <= prazo.linhas[0].pagamento + 1e-6, 'a prestação seguinte não passa da anterior');
  assert.equal(parcela.linhas.length, 120);
  assert.ok(prazo.div.st.juros < parcela.div.st.juros);
  assert.ok(parcela.linhas[1].pagamento < prazo.linhas[1].pagamento);
  // Price no modo parcela recalcula a PMT pro prazo que falta
  const pr = rodar({ id: 'p', sistema: 'Price', saldo: 100000, taxaMensal: 0.01, meses: 120 }, 500, { extras: { 1: { valor: 10000, modo: 'parcela' } } });
  assert.equal(pr.linhas.length, 120);
  const s1 = 100000 * 1.01 - (100000 * 0.01) / (1 - 1.01 ** -120) - 10000;
  perto(pr.linhas[1].pagamento, (s1 * 0.01) / (1 - 1.01 ** -119));
});

test('IR regressivo da renda fixa (Lei 11.033): 22,5% / 20% / 17,5% / 15%', () => {
  assert.equal(aliquotaIr(5), 0.225);
  assert.equal(aliquotaIr(7), 0.2);
  assert.equal(aliquotaIr(12), 0.175); // 365 dias já passou de 360
  assert.equal(aliquotaIr(23), 0.175);
  assert.equal(aliquotaIr(24), 0.15);
  const pr = premissas(FIXAS);
  const c = novaCarteira('cdi100', pr);
  c.aportar(0, 1000);
  for (let t = 1; t <= 12; t += 1) c.passo(t);
  perto(c.bruto(), 1120);
  perto(c.liquido(12), 1000 + 120 * (1 - 0.175));
  perto(c.liquido(36), 1000 + 120 * 0.85); // mais de 2 anos: 15%
  // 110% do CDI rende mais que o CDI, sobre a taxa diária
  assert.ok(taxaPercentualCdi(0.12, 1.1) > 0.132 && taxaPercentualCdi(0.12, 1.1) < 0.1335);
});

test('FIIs: proventos isentos de IR; reinvestir ou gastar', () => {
  const pr = premissas({ ...FIXAS, dyFii: 0.12, valorizacaoFii: 0 });
  const re = novaCarteira('fii', pr, { reinvestirProventos: true });
  re.aportar(0, 1000);
  for (let t = 1; t <= 12; t += 1) re.passo(t);
  perto(re.bruto(), 1000 * 1.01 ** 12);
  perto(re.liquido(12), re.bruto()); // sem valorização da cota: nada de IR
  perto(re.rendaMensal(), (1000 * 1.01 ** 11) * 0.01);
  const gasta = novaCarteira('fii', pr, { reinvestirProventos: false });
  gasta.aportar(0, 1000);
  for (let t = 1; t <= 12; t += 1) gasta.passo(t);
  perto(gasta.bruto(), 1000);
  perto(gasta.rendaRecebida, 120);
  // com valorização, 20% só sobre o ganho da cota
  const val = novaCarteira('fii', premissas({ ...FIXAS, dyFii: 0, valorizacaoFii: 0.1 }));
  val.aportar(0, 1000);
  for (let t = 1; t <= 12; t += 1) val.passo(t);
  perto(val.liquido(12), 1000 + 100 * 0.8);
});

test('CDI anda até o de longo prazo e a TR cai junto (zera com a Selic baixa)', () => {
  const pr = premissas({ cdi: 0.14, ipca: 0.04, juroNeutro: 0.03, trMensal: 0.0016, anosTransicao: 2 });
  perto(pr.cdiLongo, 1.04 * 1.03 - 1, 1e-9);
  perto(cdiNoMes(12, pr), (0.14 + pr.cdiLongo) / 2, 1e-9);
  perto(cdiNoMes(30, pr), pr.cdiLongo, 1e-9);
  perto(trNoMes(0, pr), 0.0016, 1e-9);
  assert.ok(trNoMes(12, pr) < 0.0016);
  assert.equal(trNoMes(30, pr), 0); // CDI de longo prazo ~7,1% < 8,5%
});

test('anual cai em dezembro (o primeiro proporcional) e soma o mesmo que o mensal', () => {
  let mensal = 0; let anual = 0;
  const hoje = '2025-03-10';
  for (let t = 1; t <= 21; t += 1) {
    const [y, m] = hoje.split('-').map(Number);
    const tt = y * 12 + (m - 1) + t;
    const mes = `${Math.floor(tt / 12)}-${String((tt % 12) + 1).padStart(2, '0')}`;
    mensal += extraNoMes('mensal', 100, mes, t);
    anual += extraNoMes('anual', 1200, mes, t);
  }
  assert.equal(mensal, 2100);
  assert.equal(anual, 900 + 1200); // dez/2025 (9 meses) + dez/2026
});

const DIVIDAS = {
  financiamento: { nome: 'Apê', sistema: 'SAC', saldo: 200000, taxaMensal: 0.009, amortizacao: 1000, seguro: 60, tr: true },
  fies: { nome: 'FIES', sistema: 'Price', saldo: 30000, taxaMensal: 0.0025, parcela: 400, seguro: 0, tr: false },
};
const PARAMS = {
  hoje: '2025-03-10', patrimonioBase: 100000, dividas: DIVIDAS, valor: 1000, horizonteAnos: 10,
  taxas: { cdi: 0.12, ipca: 0.045, trMensal: 0.0015 },
};

test('"a mais cara primeiro" deixa de fora a dívida que custa menos que a inflação', () => {
  assert.deepEqual(ordemAlvo(DIVIDAS, 'cara', 0.0015, 0.045), ['financiamento']);
  assert.deepEqual(ordemAlvo(DIVIDAS, 'cara', 0.0015, 0.0), ['financiamento', 'fies']);
  assert.deepEqual(ordemAlvo(DIVIDAS, 'fies', 0.0015, 0.045), ['fies']);
});

test('simular: mesmos gastos, amortizar adianta a quitação e economiza juros; mensal economiza mais que anual', () => {
  const s = simular(PARAMS);
  const r = s.resumo;
  assert.equal(s.anos.length, 11);
  assert.equal(s.anos[0].base.patrimonio, 100000);
  assert.ok(r.quitacao.financiamento.mesesAdiantados > 0);
  assert.equal(r.quitacao.fies.mesesAdiantados, 0); // FIES fica de fora
  assert.ok(r.custoEconomizado > 0);
  assert.ok(r.patrimonio.amortizar > r.patrimonio.base && r.patrimonio.investir > r.patrimonio.base);
  // o misto fica entre os dois
  const [lo, hi] = [r.patrimonio.amortizar, r.patrimonio.investir].sort((a, b) => a - b);
  assert.ok(r.patrimonio.misto >= lo - 1 && r.patrimonio.misto <= hi + 1);
  // dívida do cenário investir = só as parcelas
  s.anos.forEach((a) => perto(a.investir.totalDividas, a.base.totalDividas));
  // aportado no investir = o extra do horizonte
  perto(r.aportadoInvestir, 120 * 1000);
  assert.ok(r.investidoBruto >= r.investidoLiquido && r.irEstimado >= 0);
  assert.ok(r.frequencias.economiaAtual > r.frequencias.economiaOutra);
  const anual = simular({ ...PARAMS, frequencia: 'anual', valor: 12000 });
  assert.ok(anual.resumo.custoEconomizado < r.custoEconomizado);
  // até mar/2035: 10 dezembros (o primeiro com 9/12) contra 120 meses
  perto(anual.resumo.aportadoInvestir, 12000 * 9.75, 1);
  // reduzir parcela economiza menos juros que reduzir prazo
  const parcela = simular({ ...PARAMS, modo: 'parcela' });
  assert.ok(parcela.resumo.jurosEconomizados < r.jurosEconomizados);
});

test('ponto de virada ≈ custo efetivo da dívida (taxas paradas, sem FGTS)', () => {
  const p = {
    hoje: '2025-01-10', patrimonioBase: 0, valor: 500, horizonteAnos: 15, alvo: 'financiamento',
    dividas: { financiamento: { sistema: 'SAC', saldo: 100000, taxaMensal: 0.008, amortizacao: 800, seguro: 0, tr: false } },
    taxas: FIXAS,
  };
  const s = simular(p);
  perto(s.resumo.virada.taxa, custoEfetivo(p.dividas.financiamento), 0.003);
  // acima da virada investir ganha, abaixo amortizar ganha
  const alto = simular({ ...p, perfil: 'cdi100', taxas: { ...FIXAS, cdi: 0.2, cdiLongo: 0.2 } });
  assert.equal(alto.resumo.melhor, 'investir');
  const baixo = simular({ ...p, perfil: 'cdi100', taxas: { ...FIXAS, cdi: 0.06, cdiLongo: 0.06 } });
  assert.equal(baixo.resumo.melhor, 'amortizar');
});

test('parâmetros padrão a partir do contexto do patrimônio (dados inventados)', () => {
  const ctx = {
    d: { hoje: '2025-03-10', cdi: 0.11, metas: { salarioLiquido: 8340, reservaMeta: 30000 }, investimentos: { reserva: 20000 }, despesas: { totalComFolga: 5000 } },
    cfg: {
      financiamento: { saldo: 210000, dataSaldo: '2025-01-05', taxaAnual: 0.09, amortizacao: 1000, prazoRestante: 210, seguroTaxas: 70, indexador: 'TR' },
      fies: { saldo: 30000, dataSaldo: '2025-01-05', parcela: 400, taxaMensal: 0.0025, fim: '2032-12' },
    },
    b: { liquido: 123456 },
  };
  const p = parametrosPadrao(ctx);
  // 03/10/2026: o padrão é o mínimo que tira 2 parcelas por mês do apê (a mais cara):
  // 05/10/2026: pela regra da Caixa (menor prazo em que a prestação não sobe), bem menos que 2 × a amortização (R$ 1.000),
  // arredondado pra cima de 10 em 10
  assert.ok(p.valorMinimo.exato > 400 && p.valorMinimo.exato < 1000, `${p.valorMinimo.exato}`);
  assert.equal(p.valorMinimo.id, 'financiamento');
  assert.equal(p.valor, Math.ceil(p.valorMinimo.exato / 10) * 10);
  assert.equal(p.valorSalario, 800); // a regra antiga (10% do líquido) continua guardada
  assert.equal(p.patrimonioBase, 123456);
  assert.equal(p.taxas.cdi, 0.11);
  perto(p.dividas.financiamento.saldo, 208000); // 2 meses de amortização depois do extrato
  perto(p.dividas.financiamento.taxaMensal, 0.0075, 1e-9);
  assert.equal(p.dividas.financiamento.tr, true);
  assert.equal(p.dividas.fies.sistema, 'Price');
  assert.ok(p.dividas.fies.saldo < 30000);
  assert.equal(p.alvo, 'cara');
  assert.equal(parametrosPadrao({ d: { hoje: '2025-03-10' } }).valor, 1000); // sem dívida: a regra antiga
  assert.equal(parametrosPadrao({ ...ctx, cfg: { fies: ctx.cfg.fies } }).valor, 800, 'só o FIES (mais barato que a inflação): nada pra amortizar no "a mais cara"');
  assert.deepEqual(Object.keys(dividasDoContexto({}, '2025-03-10')), []);
  const v = veredito(simular(p));
  assert.ok(v.titulo && v.texto.length > 40);
  assert.ok(v.bullets.some((b) => /reserva/i.test(b.html))); // reserva abaixo da meta
  assert.ok(v.bullets.some((b) => /FIES: não antecipe/.test(b.html)));
});

test('estratégias do vídeo e referências com link', () => {
  assert.ok(ESTRATEGIAS_VIDEO.length >= 6);
  ESTRATEGIAS_VIDEO.forEach((e) => assert.ok(e.titulo && e.video && e.conta && /^\d\d:\d\d$/.test(e.min)));
  REFERENCIAS.forEach((r) => assert.match(r.url, /^https:\/\//));
});

// ---------------------------------------------------------------------------
// 03/10/2026: "matar parcelas" (Tiago: "O valor de amortização mensal default
// é sempre o mínimo para matar ao menos duas parcelas, se eu amortizar")
// ---------------------------------------------------------------------------

test('matar parcelas no SAC (regra da Caixa): o menor prazo em que a prestação não sobe', () => {
  // números inventados com a mesma mecânica do app da Caixa: 240 parcelas, saldo 300 mil, 0,8% ao mês
  const d = { id: 'f', sistema: 'SAC', saldo: 300000, taxaMensal: 0.008, amortizacao: 1250 };
  const m2 = valorParaMatarParcelas(d, 2, { passo: 0 });
  assert.equal(m2.restantes, 239); // a parcela do mês sai antes
  // não é 2 × amortização (2.500): a prestação 'segura' o prazo menor com bem menos
  assert.ok(m2.exato > 700 && m2.exato < 1000, `${m2.exato}`);
  perto(m2.porParcela, m2.exato / 2, 0.01);
  const roda = (v) => { const x = novaDivida(d); x.mes(1); x.extra(1, v, 'prazo'); return x; };
  assert.equal(roda(m2.exato).restante(), 237);
  assert.equal(roda(m2.exato - 1).restante(), 238, 'R$ 1 a menos só tira 1 parcela');
  assert.ok(roda(m2.exato).parcelaAtual() <= novaDivida(d).parcelaAtual() + 1e-6);
  // arredonda pra cima de 10 em 10
  assert.equal(valorParaMatarParcelas(d, 2).valor, Math.ceil(m2.exato / 10) * 10);
  // juros pro rata dos dias desde o vencimento saem do valor pago: 'valor × i × dias/30' (a Caixa: R$ 900 - R$ 3,55)
  const x = novaDivida(d); x.mes(1);
  const s0 = x.saldo;
  x.extra(1, 1000, 'prazo', { dias: 15 });
  perto(s0 - x.saldo, 1000 - 1000 * 0.008 * 15 / 30, 1e-6);
  const c = valorParaMatarParcelas(d, 2, { passo: 0, dias: 15 });
  assert.ok(c.exato > m2.exato);
  const y = novaDivida(d); y.mes(1); y.extra(1, c.exato, 'prazo', { dias: 15 });
  assert.equal(y.restante(), 237);
  // com TR o saldo corrige antes (a regra não muda: só a escala)
  const comTr = { ...d, tr: true };
  const t = valorParaMatarParcelas(comTr, 2, { trMensal: 0.002, passo: 0 });
  assert.ok(t.exato > m2.exato);
  const z = novaDivida(comTr); z.mes(1, 0.002); z.extra(1, t.exato, 'prazo');
  assert.equal(z.restante(), 237);
  // o contrário: a fração de parcelas que o valor tira (contínua, 2 no mínimo exato)
  perto(parcelasQueOValorMata(d, m2.exato), 2, 0.01);
  assert.ok(parcelasQueOValorMata(d, 500) < 1.2 && parcelasQueOValorMata(d, 500) > 0.8);
});

test('regra da Caixa: duas amortizações vizinhas dão 2 e 1 parcelas (mesma mecânica do print real, números inventados)', () => {
  // saldo 250 mil, 200 a pagar, 0,75% ao mês (juros diários = valor × 0,75% × 15/30)
  const d = { id: 'f', sistema: 'SAC', saldo: 250000, taxaMensal: 0.0075, amortizacao: 250000 / 200 };
  const prazoCom = (v) => { const x = novaDivida(d); x.extra(1, v, 'prazo', { dias: 15 }); return x; };
  const a = prazoCom(1020);
  assert.equal(a.restante(), 198);
  perto(250000 - a.saldo, 1020 - 1020 * 0.0075 * 15 / 30, 1e-6);
  assert.equal(prazoCom(980).restante(), 199);
  // novo saldo e nova prestação (amort. + juros) saem de saldo/prazo + saldo × i, sem passar da atual
  assert.ok(a.amortizacao + a.saldo * 0.0075 <= 250000 / 200 + 250000 * 0.0075);
  perto(a.amortizacao, a.saldo / 198, 1e-6);
  // pagar tudo = o saldo + os juros pro rata
  const q = novaDivida(d); const pago = q.extra(1, 1e9, 'prazo', { dias: 15 });
  perto(pago, 250000 * (1 + 0.0075 * 15 / 30), 1e-6);
  assert.equal(q.ativa, false);
});

test('matar parcelas na Price (FIES): o valor presente das k últimas parcelas', () => {
  const s = 100000; const i = 0.01; const n = 120;
  const P = (s * i) / (1 - (1 + i) ** -n);
  const d = { id: 'fies', sistema: 'Price', saldo: s, taxaMensal: i, parcela: P };
  const m2 = valorParaMatarParcelas(d, 2, { passo: 0 });
  assert.equal(m2.restantes, 119);
  // as 2 últimas das 119 que faltam: P/(1+i)^118 + P/(1+i)^119
  perto(m2.exato, P / (1 + i) ** 118 + P / (1 + i) ** 119, 0.02); // em centavos, pra cima
  const m3 = valorParaMatarParcelas(d, 3, { passo: 0 });
  perto(m3.exato, P / (1 + i) ** 117 + P / (1 + i) ** 118 + P / (1 + i) ** 119, 0.02);
  // no motor: tira 2; R$ 1 a menos só tira 1
  const a = novaDivida(d); a.mes(1); a.extra(1, m2.exato, 'prazo');
  assert.equal(a.restante(), 117);
  const b = novaDivida(d); b.mes(1); b.extra(1, m2.exato - 1, 'prazo');
  assert.equal(b.restante(), 118);
  perto(parcelasQueOValorMata(d, m2.exato), 2, 1e-3);
  // sem juros: k parcelas
  assert.equal(valorParaMatarParcelas({ ...d, taxaMensal: 0, parcela: 500, saldo: 5000 }, 2, { passo: 0 }).exato, 1000);
  // pedir mais do que falta = quitar
  const fim = valorParaMatarParcelas({ id: 'x', sistema: 'SAC', saldo: 3000, taxaMensal: 0.01, amortizacao: 1000 }, 4);
  assert.equal(fim.k, 2);
  assert.equal(fim.exato, 2000);
  assert.equal(valorParaMatarParcelas(null, 2), null);
  assert.equal(valorParaMatarParcelas({ ...d, saldo: 0 }, 2), null);
});

test('mínimo da dívida-alvo e as opções 2, 3, 4 parcelas (simulação leve) pra cada dívida', () => {
  const p = { ...PARAMS, taxas: FIXAS };
  const min = minimoParaMatar(p, 2, 'cara');
  assert.equal(min.id, 'financiamento');
  assert.ok(min.exato > 0 && min.exato < 2 * DIVIDAS.financiamento.amortizacao, 'a regra da Caixa pede menos que 2 × A');
  assert.equal(minimoParaMatar(p, 2, 'fies').id, 'fies');
  const ops = opcoesMatarParcelas(p);
  assert.deepEqual(ops.map((o) => o.id), ['financiamento', 'fies']);
  ops.forEach((o) => {
    assert.deepEqual(o.linhas.map((l) => l.k), [2, 3, 4]);
    for (let k = 1; k < 3; k += 1) {
      assert.ok(o.linhas[k].valor > o.linhas[k - 1].valor, 'mais parcelas, mais caro');
      assert.ok(o.linhas[k].mesesAdiantados >= o.linhas[k - 1].mesesAdiantados, 'e quita antes');
    }
    o.linhas.forEach((l) => { assert.ok(l.quitaMes < l.baseMes); assert.ok(l.custoEconomizado > 0); assert.ok(['amortizar', 'investir'].includes(l.melhor)); });
  });
  // a linha "2 parcelas" do apê é o mesmo que simular com o mínimo
  const s = simular({ ...p, alvo: 'financiamento', valor: ops[0].linhas[0].valor });
  perto(ops[0].linhas[0].patrimonioAmortizar, s.resumo.patrimonio.amortizar, 0.01);
  // leve: sem virada, sem os outros perfis, sem a outra frequência
  const leve = simular(p, { leve: true });
  assert.equal(leve.resumo.virada, null);
  assert.equal(leve.resumo.perfis.length, 1);
  assert.equal(leve.resumo.frequencias, null);
  perto(leve.resumo.patrimonio.amortizar, simular(p).resumo.patrimonio.amortizar, 0.01);
});

test('primeiro milhão: projeção do patrimônio líquido (contas fechadas) e o próximo milhão', () => {
  assert.equal(proximoMilhao(342000), 1e6);
  assert.equal(proximoMilhao(1000000), 2e6);
  assert.equal(proximoMilhao(null), 1e6);
  // sem rendimento, sem inflação, sem dívida: 500 mil + 1.000/mês -> 500 meses
  const a = projetarMarco({ liquido: 500000, investido: 100000, aporte: 1000, rendimentoReal: 0, ipca: 0, alvo: 1e6 });
  assert.equal(a.meses, 500);
  assert.equal(projetarMarco({ liquido: 1.2e6, alvo: 1e6 }).meses, 0);
  // a dívida que cai (e o FGTS que sobe) somam no patrimônio, ponto a ponto entre as linhas anuais
  const base = [{ t: 0, totalDividas: 120000, fgts: 10000, patrimonio: 0 }, { t: 12, totalDividas: 108000, fgts: 13000, patrimonio: 15000 }, { t: 24, totalDividas: 96000, fgts: 16000, patrimonio: 30000 }];
  assert.equal(valorNaLinha(base, 'totalDividas', 6), 114000);
  assert.equal(valorNaLinha(base, 'totalDividas', 99), 96000);
  const b = projetarMarco({ liquido: 900000, investido: 0, aporte: 0, rendimentoReal: 0, ipca: 0, base, alvo: 1e6 });
  perto(b.serie(12), 900000 + 15000);
  assert.equal(b.meses, null, 'só a dívida não chega lá');
  // inflação: a dívida em reais encolhe em dinheiro de hoje
  const c = projetarMarco({ liquido: 900000, investido: 0, aporte: 0, rendimentoReal: 0, ipca: 0.1, base, alvo: 1e6 });
  perto(c.serie(12), 900000 + 120000 - 10000 - (108000 - 13000) / 1.1);
  // um cenário do simulador soma o que ele tem a mais que o base
  const cen = base.map((l) => ({ ...l, patrimonio: l.patrimonio + l.t * 1000 }));
  const d = projetarMarco({ liquido: 900000, investido: 0, aporte: 0, rendimentoReal: 0, ipca: 0, base, cenario: cen, alvo: 1e6 });
  perto(d.serie(12) - b.serie(12), 12000);
});
