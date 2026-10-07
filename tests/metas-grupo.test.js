// tests/metas-grupo.test.js
//
// 07/10/2026 (Tiago, meta de uma chácara com amigos): categoria "Imóvel, terreno ou chácara"; meta SEM valor alvo nem prazo
// ("acompanhando", cinza, fora de "atenção" e do "aporte necessário"); aporte que CRESCE por ano (R$ ou %); saldo/investimento
// FORA DA CARTEIRA com % do CDI e "conta no meu patrimônio"; compra em grupo e estimativas (simulador "e se custar R$ X",
// 1/3/5/10 anos, aporte x rendimento). Cálculo puro, o assistente e o detalhe num DOM (JSDOM), Patrimônio e Início. Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaMetas, TEMPLATE_METAS, cardMetaHtml, heroiHtml } from '../assets/js/pages/metas.js';
import {
  calcularMeta, resumoMetas, trajetoriaMensal, prazoParaAlvo, serieProjecao, marcosProjecao, metaPadrao, CATEGORIAS_ACUMULO, STATUS_META, aparenciaMeta,
} from '../assets/js/pages/metas-calc.js';
import {
  planoAporte, aporteNoMes, degrausEntre, proximoReajuste, resumoAporteCrescente, totalAportadoDesde, rebasearAporte, aporteFn,
} from '../assets/js/pages/metas-calc-aporte.js';
import { estimarSaldoCdi, fatorCdi, textoEstimativa } from '../assets/js/pages/metas-calc-fora.js';
import { projecaoPorAnos, estimativaGrupo, simularPreco, composicaoAtual, pessoasDoGrupo, custosDaMeta, temEstimativas, precosDeExemplo } from '../assets/js/pages/metas-calc-grupo.js';
import { fraseAporteCrescente } from '../assets/js/pages/metas-estimativas.js';
import { modeloMetasHome, resumoTexto, seloTexto, classeStatusHome } from '../assets/js/pages/inicio-metas.js';
import { balanco } from '../assets/js/pages/patrimonio-calc.js';
import { modeloHero } from '../assets/js/pages/inicio-hero-calc.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const perto = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const HOJE = '2026-10-07';

/** Chácara inventada: R$ 200/mês hoje (1º ano R$ 100), +R$ 100 por ano, 4 pessoas, sem valor alvo nem prazo. */
const CHACARA = {
  id: 'ch1', tipo: 'acumulo', categoria: 'imoveis', nome: 'Terreno em grupo', moeda: 'BRL', valorAlvo: null, dataAlvo: null, aporteMensal: 200, rendimentoAnual: 0.1,
  criadaEm: '2026-10-07', contribuicao: 'acumulo', especificos: { grupoPessoas: 4 }, itens: [], vinculos: [], status: 'ativa',
  aporteCrescimento: { tipo: 'valor', valor: 100, mes: null, referencia: '2026-10', inicio: '2025-10' },
};
const CTX = { hoje: HOJE, ativos: [], cambio: {}, referencias: {} };

// ---------------------------------------------------------------------------
// Categoria nova
// ---------------------------------------------------------------------------

test('categoria "Imóvel, terreno ou chácara": existe em "Juntar até uma data", com ícone da casa e a dica dos custos de compra em grupo', () => {
  assert.equal(CATEGORIAS_ACUMULO.imoveis.nome, 'Imóvel, terreno ou chácara');
  const ap = aparenciaMeta({ tipo: 'acumulo', categoria: 'imoveis' });
  assert.equal(ap.rotulo, 'Imóvel, terreno ou chácara');
  assert.equal(ap.icone, 'casa');
  assert.match(ap.dicas[0], /4% e 6%/);
  assert.match(ap.dicas[0], /por escrito/);
});

// ---------------------------------------------------------------------------
// Aporte crescente
// ---------------------------------------------------------------------------

test('degraus: conta os meses de reajuste em (de, ate]', () => {
  assert.equal(degrausEntre('2026-10', '2026-10', 10), 0);
  assert.equal(degrausEntre('2026-10', '2027-09', 10), 0);
  assert.equal(degrausEntre('2026-10', '2027-10', 10), 1);
  assert.equal(degrausEntre('2026-10', '2029-10', 10), 3);
  assert.equal(degrausEntre('2026-10', '2027-01', 1), 1, 'janeiro: o primeiro degrau vem 3 meses depois');
  assert.equal(degrausEntre('2027-01', '2026-10', 1), 0, 'ao contrário não conta');
});

test('aporte crescente em R$: R$ 200 hoje, +R$ 100 a cada outubro; antes da referência desfaz os degraus; antes do início é zero', () => {
  const p = planoAporte(CHACARA, HOJE);
  assert.equal(aporteNoMes(p, '2026-10'), 200);
  assert.equal(aporteNoMes(p, '2027-09'), 200);
  assert.equal(aporteNoMes(p, '2027-10'), 300);
  assert.equal(aporteNoMes(p, '2029-12'), 500);
  assert.equal(aporteNoMes(p, '2026-09'), 100, '1º ano: R$ 100');
  assert.equal(aporteNoMes(p, '2025-10'), 100);
  assert.equal(aporteNoMes(p, '2025-09'), 0, 'antes de começar a aportar');
  const r = resumoAporteCrescente(p, HOJE);
  assert.deepEqual([r.hoje, r.proximo.mes, r.proximo.valor, r.aporteInicial], [200, '2027-10', 300, 100]);
  assert.equal(totalAportadoDesde(p, HOJE), 1200, '12 meses de R$ 100 (out/25 a set/26)');
});

test('aporte crescente em %: R$ 200 +10% ao ano em janeiro; mês do reajuste padrão = mês da referência', () => {
  const m = { aporteMensal: 200, criadaEm: '2026-10-07', aporteCrescimento: { tipo: 'pct', valor: 0.1, mes: 1, referencia: '2026-10' } };
  const p = planoAporte(m, HOJE);
  assert.equal(aporteNoMes(p, '2026-12'), 200);
  assert.equal(aporteNoMes(p, '2027-01'), 220);
  assert.equal(aporteNoMes(p, '2028-01'), 242);
  assert.equal(proximoReajuste(p, HOJE).mes, '2027-01');
  assert.equal(aporteNoMes(p, '2026-01'), 200, 'jan/26 já é o degrau de jan que antecede a referência');
  assert.equal(aporteNoMes(p, '2025-12'), r2(200 / 1.1), 'volta um degrau antes de jan');
  const padrao = planoAporte({ aporteMensal: 200, criadaEm: '2026-05-20', aporteCrescimento: { tipo: 'valor', valor: 50 } }, HOJE);
  assert.equal(padrao.mesReajuste, 5, 'sem mês escolhido: o mês de criação');
  assert.equal(padrao.referencia, '2026-05');
});
const r2 = (v) => Math.round(v * 100) / 100;

test('o aporte informado "de hoje" sobe sozinho com o tempo (referência antiga): em jan/27 o aporte de hoje já é o do degrau', () => {
  const m = { ...CHACARA, aporteMensal: 200, aporteCrescimento: { tipo: 'valor', valor: 100, mes: 1, referencia: '2026-10', inicio: null } };
  const c = calcularMeta(m, { ...CTX, hoje: '2027-02-10' });
  assert.equal(c.aporteAtual, 300);
  assert.equal(c.aporteInformado, 200, 'o que foi digitado continua guardado');
  assert.equal(c.aporteCrescente.hoje, 300);
  assert.equal(c.aporteCrescente.proximo.mes, '2028-01');
  // abrir pra editar: o campo mostra o de hoje e a referência vira hoje
  const ed = rebasearAporte(clone(m), '2027-02-10');
  assert.equal(ed.aporteMensal, 300);
  assert.equal(ed.aporteCrescimento.referencia, '2027-02');
  assert.equal(aporteNoMes(planoAporte(ed, '2027-02-10'), '2028-01'), 400, 'a projeção não muda');
});

test('sem aporte crescente tudo fica igual: calcularMeta com e sem o campo vazio dá o mesmo resultado', () => {
  const base = { id: 'a', tipo: 'acumulo', categoria: 'outros', nome: 'X', moeda: 'BRL', valorAlvo: 12000, dataAlvo: '2027-10', aporteMensal: 500, rendimentoAnual: 0.1, vinculos: [], itens: [], especificos: {}, status: 'ativa' };
  const a = calcularMeta(base, CTX);
  const b = calcularMeta({ ...base, aporteCrescimento: { tipo: 'valor', valor: 0 } }, CTX); // valor 0 = sem crescimento
  const strip = (c) => JSON.parse(JSON.stringify({ ...c, aporteCrescente: null, planoAporte: null }));
  assert.deepEqual(strip(b), strip(a));
  assert.equal(a.planoAporte, null);
  assert.equal(a.aporteCrescente, null);
  assert.equal(a.aporteAtual, 500);
});

test('trajetória e prazo com aporte por mês (função): degraus anuais; número igual ao laço manual; sem função = igual a antes', () => {
  // sem rendimento: 12 x 100 + 12 x 200 = 3.600 em 24 meses
  const fn = (k) => (k <= 12 ? 100 : 200);
  const t = trajetoriaMensal({ atual: 0, aporte: fn, taxa: 0, meses: 24 });
  assert.equal(t[12], 1200);
  assert.equal(t[24], 3600);
  // prazo pra R$ 2.000: 12 meses (1.200) + 4 meses de 200 (800) = mês 16
  assert.equal(prazoParaAlvo({ alvo: 2000, atual: 0, aporte: fn, taxa: 0 }), 16);
  // aporte numérico: fórmula fechada de sempre
  assert.equal(prazoParaAlvo({ alvo: 2000, atual: 0, aporte: 100, taxa: 0 }), 20);
  assert.equal(trajetoriaMensal({ atual: 0, aporte: 100, taxa: 0, meses: 3 }).join(), '0,100,200,300');
  // aporte zero pra sempre: nunca chega (sem laço infinito)
  assert.equal(prazoParaAlvo({ alvo: 2000, atual: 0, aporte: () => 0, taxa: 0 }), Infinity);
});

test('com alvo e prazo: o aporte crescente adianta a chegada e o status segue a projeção (no ritmo) em vez de comparar com o aporte fixo necessário', () => {
  const base = { id: 'a', tipo: 'acumulo', categoria: 'outros', nome: 'X', moeda: 'BRL', valorAlvo: 10000, dataAlvo: '2028-10', aporteMensal: 200, rendimentoAnual: 0, criadaEm: '2026-10-07', vinculos: [], itens: [], especificos: {}, status: 'ativa' };
  const fixo = calcularMeta(base, CTX);
  const cresc = calcularMeta({ ...base, aporteCrescimento: { tipo: 'valor', valor: 100, mes: 10, referencia: '2026-10' } }, CTX);
  assert.equal(fixo.mesesEstimados, 50);
  assert.ok(cresc.mesesEstimados < fixo.mesesEstimados, 'com degraus chega antes');
  assert.equal(fixo.status, 'atrasada', 'R$ 200 fixo não fecha em 24 meses');
  // 24 meses: 12 x 200 (nov/26 a set/27) + out/27 a out/28 = 13 x 300 = 6.300 < 10.000: continua atrasada, mas por conta da projeção
  assert.equal(cresc.status, 'atrasada');
  const folgado = calcularMeta({ ...base, valorAlvo: 6000, aporteCrescimento: { tipo: 'valor', valor: 100, mes: 10, referencia: '2026-10' } }, CTX);
  assert.equal(folgado.status, 'no-ritmo', 'R$ 6.000: a projeção com degraus chega antes do prazo, mesmo com o aporte de hoje abaixo do fixo equivalente');
  assert.ok(folgado.aporteNecessario > folgado.aporteAtual, 'o fixo necessário é maior que os R$ 200 de hoje');
  // a série "no seu ritmo" do gráfico e os marcos usam os degraus
  const pontos = serieProjecao(folgado, { hoje: HOJE });
  assert.equal(pontos[11].ritmo, 2200, '11 meses de R$ 200');
  assert.equal(pontos[12].ritmo, 2500, 'out/27 já é o degrau de R$ 300');
  const m = marcosProjecao(folgado, { hoje: HOJE });
  assert.equal(m[m.length - 1].rotulo, 'Alvo');
});

// ---------------------------------------------------------------------------
// Meta sem alvo: "acompanhando"
// ---------------------------------------------------------------------------

test('sem valor alvo nem prazo: status "acompanhando" (cinza), sem aporte necessário, nada de erro', () => {
  const c = calcularMeta(CHACARA, CTX);
  assert.equal(c.status, 'acompanhando');
  assert.equal(c.acompanhando, true);
  assert.equal(c.alvoBRL, null);
  assert.equal(c.aporteNecessario, null);
  assert.equal(c.aporteNecessarioTotal, null);
  assert.equal(c.mesesEstimados, null);
  assert.equal(STATUS_META.acompanhando.classe, 'na', 'cinza');
  assert.deepEqual(c.avisos, []);
  assert.equal(classeStatusHome('acompanhando', null), 'na');
  assert.equal(seloTexto(null, 'acompanhando'), 'acompanhando');
});

test('resumoMetas: acompanhando conta como meta ativa, mas fora de "no ritmo", "atrasadas" e do "aporte necessário"', () => {
  const normal = calcularMeta({ id: 'n', tipo: 'acumulo', categoria: 'outros', nome: 'N', moeda: 'BRL', valorAlvo: 12000, dataAlvo: '2027-10', aporteMensal: 100, rendimentoAnual: 0, vinculos: [], itens: [], especificos: {}, status: 'ativa' }, CTX);
  assert.equal(normal.status, 'atrasada');
  const acomp = calcularMeta(CHACARA, CTX);
  const res = resumoMetas([normal, acomp]);
  assert.equal(res.quantidade, 2);
  assert.equal(res.acompanhando, 1);
  assert.equal(res.atrasadas, 1, 'só a normal');
  assert.equal(res.noRitmo, 0);
  assert.equal(res.aporteNecessario, normal.aporteNecessarioTotal, 'a sem alvo não soma necessário');
  assert.equal(res.alvo, 12000);
  assert.equal(resumoMetas([acomp]).atrasadas, 0);
});

test('com alvo e prazo preenchidos depois vira meta normal; só com prazo (sem alvo) segue acompanhando; só com alvo = sem prazo', () => {
  const comAlvo = calcularMeta({ ...CHACARA, valorAlvo: 50000, dataAlvo: '2031-10' }, CTX);
  assert.notEqual(comAlvo.status, 'acompanhando');
  assert.equal(comAlvo.acompanhando, false);
  assert.ok(comAlvo.aporteNecessario > 0);
  assert.equal(calcularMeta({ ...CHACARA, dataAlvo: '2031-10' }, CTX).status, 'acompanhando');
  assert.equal(calcularMeta({ ...CHACARA, valorAlvo: 50000 }, CTX).status, 'sem-prazo');
  // reserva/renda passiva/aposentadoria/viagem sem alvo seguem as regras delas (nunca "acompanhando")
  assert.equal(calcularMeta({ ...metaPadrao('rendaPassiva', { hoje: HOJE }), especificos: {} }, CTX).acompanhando, false);
});

test('cartão da lista (sem alvo): cinza "Acompanhando", sem "falta" nem %; mostra o aporte com os degraus e quanto terá em 5 anos', () => {
  const c = calcularMeta(CHACARA, CTX);
  const html = cardMetaHtml(CHACARA, c);
  assert.match(html, /Acompanhando/);
  assert.match(html, /ainda sem valor definido/);
  assert.match(html, /em grupo \(4\)/);
  assert.match(html, /R\$\s200\/mês hoje · R\$\s300 a partir de out\/2027/);
  assert.match(html, /Em 5 anos/);
  assert.doesNotMatch(html, /Falta/);
  assert.doesNotMatch(html, /mt-ruim/);
  assert.equal(fraseAporteCrescente(c).replace(/\s/g, ' '), 'R$ 200/mês hoje · R$ 300 a partir de out/2027');
  const hero = heroiHtml(CHACARA, c, {});
  assert.match(hero, /Já tenho/);
  assert.match(hero, /Em 5 anos \(estimativa\)/);
  assert.match(hero, /só acompanha/);
  assert.doesNotMatch(hero, /Falta/);
});

test('Início: a meta sem alvo entra na contagem como "acompanhando" (neutra), sem ir pra "precisam de atenção" nem pro aporte necessário', () => {
  const resposta = {
    ok: true, hoje: HOJE, ativos: [], cambio: {}, referencias: {}, proventos12m: {}, arquivadas: [],
    metas: [CHACARA, { id: 'n', tipo: 'acumulo', categoria: 'outros', nome: 'Notebook', moeda: 'BRL', valorAlvo: 6000, dataAlvo: '2028-10', aporteMensal: 300, rendimentoAnual: 0, vinculos: [], itens: [], especificos: {}, status: 'ativa' }],
  };
  const m = modeloMetasHome(resposta, { raizSite: 'https://exemplo.test/' });
  assert.equal(m.quantidade, 2);
  assert.equal(m.acompanhando, 1);
  const linha = m.linhas.find((l) => l.id === 'ch1');
  assert.equal(linha.status, 'acompanhando');
  assert.equal(linha.classe, 'na');
  assert.equal(linha.selo, 'acompanhando');
  const txt = resumoTexto(m).map((p) => p.t).join(' · ');
  assert.match(txt, /2 metas/);
  assert.match(txt, /1 acompanhando/);
  assert.doesNotMatch(txt, /atenção/);
  const so = modeloMetasHome({ ...resposta, metas: [CHACARA] }, { raizSite: 'https://exemplo.test/' });
  assert.equal(so.atencao, 0);
  assert.equal(so.aporteNecessario, 0);
});

// ---------------------------------------------------------------------------
// Saldo / investimento fora da carteira (% do CDI)
// ---------------------------------------------------------------------------

/** CDI inventado: 0,05% ao dia útil, dias úteis de 02/09 a 07/10 (índice base 1). */
function serieCdi() {
  const pontos = [];
  let idx = 1;
  const d = new Date(Date.UTC(2026, 8, 1));
  for (let i = 0; i < 36; i += 1) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    idx *= 1.0005;
    pontos.push([d.toISOString().slice(0, 10), Math.round(idx * 1e8) / 1e8]);
  }
  return { ate: pontos[pontos.length - 1][0], pontos };
}

test('estimarSaldoCdi: último saldo corrigido pelo CDI desde a data dele (x % do CDI), sem somar aportes', () => {
  const cdi = serieCdi();
  const f = fatorCdi(cdi, '2026-09-14');
  assert.ok(f > 1.005 && f < 1.03);
  const v = { saldo: 1000, moeda: 'BRL', atualizadoEm: '2026-09-14', cdiPct: 100 };
  const e = estimarSaldoCdi(v, cdi);
  assert.equal(e.estimado, true);
  assert.equal(e.informado, 1000);
  assert.ok(perto(e.valor, 1000 * f, 0.01));
  const e50 = estimarSaldoCdi({ ...v, cdiPct: 50 }, cdi);
  assert.ok(perto(e50.valor, 1000 * Math.pow(f, 0.5), 0.01), '50% do CDI rende metade (em log)');
  assert.ok(e50.valor < e.valor && e50.valor > 1000);
  // sem série, sem % do CDI, em outra moeda ou data depois do fim da série: vale o último valor informado
  assert.equal(estimarSaldoCdi(v, null).valor, 1000);
  assert.equal(estimarSaldoCdi({ ...v, cdiPct: null }, cdi).estimado, false);
  assert.equal(estimarSaldoCdi({ ...v, moeda: 'EUR' }, cdi).valor, 1000);
  assert.equal(estimarSaldoCdi({ ...v, atualizadoEm: cdi.ate }, cdi).estimado, false);
  assert.equal(estimarSaldoCdi({ ...v, atualizadoEm: '2020-01-01' }, cdi).estimado, false, 'a série não cobre a data: não inventa');
  assert.match(textoEstimativa(e, (x) => `R$ ${x.toFixed(0)}`), /estimado: R\$ 10\d\d \(último extrato R\$ 1000 em 14\/09, \+ 100% do CDI até \d\d\/\d\d\)/);
});

test('o vínculo "fora da carteira" com % do CDI entra no "já tenho" da meta com o valor estimado de hoje', () => {
  const cdi = serieCdi();
  const meta = { ...CHACARA, vinculos: [{ tipo: 'saldo', modo: 'total', id: 's1', nome: 'Fundo de teste - minha parte', instituicao: 'Corretora Z', moeda: 'BRL', saldo: 2000, atualizadoEm: '2026-09-14', cdiPct: 100, contaNoPatrimonio: true, historico: [] }] };
  const sem = calcularMeta(meta, CTX);
  assert.equal(sem.atualBRL, 2000, 'sem série do CDI: último valor informado');
  const com = calcularMeta(meta, { ...CTX, cdi });
  assert.ok(com.atualBRL > 2000 && com.atualBRL < 2100);
  const item = com.vinculos[0];
  assert.equal(item.estimativa.informado, 2000);
  assert.equal(item.valorBRL, com.atualBRL);
  assert.equal(com.ja, com.atualBRL);
});

// ---------------------------------------------------------------------------
// Estimativas: projeção, grupo, simulador, composição
// ---------------------------------------------------------------------------

test('projeção sem alvo: 1, 3, 5 e 10 anos com os degraus do aporte e o rendimento; aportado + rendimento = valor', () => {
  const m = { ...CHACARA, rendimentoAnual: 0, vinculos: [], valorInicial: 1000 };
  const c = calcularMeta(m, CTX);
  const [a1, a3, a5, a10] = projecaoPorAnos(c);
  assert.deepEqual([a1.anos, a3.anos, a5.anos, a10.anos], [1, 3, 5, 10]);
  // sem rendimento: 1.000 + (nov/26..set/27 = 11 x 200) + out/27 = 300 => 3.500 em 12 meses
  assert.equal(a1.valor, 3500);
  assert.equal(a1.aportado, 2500);
  assert.equal(a1.rendimento, 0);
  // 3 anos: 36 meses = 11 x 200 + 12 x 300 + 12 x 400 + 1 x 500 = 2.200 + 3.600 + 4.800 + 500 = 11.100 (+ 1.000)
  assert.equal(a3.aportado, 11100);
  assert.equal(a3.valor, 12100);
  const comRend = projecaoPorAnos(calcularMeta(CHACARA, CTX));
  comRend.forEach((p) => assert.ok(perto(p.valor, p.aportado + p.rendimento, 0.02)));
  assert.ok(comRend[2].rendimento > 0);
});

test('compra em grupo: se os amigos aportam a mesma média, o grupo tem N x o seu valor hoje e daqui a 5 anos; 1 pessoa = sem grupo', () => {
  const c = calcularMeta({ ...CHACARA, valorInicial: 1000 }, CTX);
  const g = estimativaGrupo({ ...CHACARA }, c);
  assert.equal(g.pessoas, 4);
  assert.equal(g.hoje, 4000);
  assert.ok(perto(g.em, projecaoPorAnos(c, [5])[0].valor * 4, 0.02));
  assert.equal(estimativaGrupo({ ...CHACARA, especificos: {} }, c), null);
  assert.equal(pessoasDoGrupo({ especificos: { grupoPessoas: 1 } }), 1);
  assert.equal(pessoasDoGrupo({ especificos: { grupoPessoas: 3.6 } }), 4);
});

test('simulador "e se custar R$ X": sua parte = preço x (1 + custos) ÷ pessoas; quando chega no ritmo; aporte pra chegar até o ano', () => {
  const c = calcularMeta({ ...CHACARA, rendimentoAnual: 0 }, CTX);
  assert.equal(custosDaMeta(CHACARA), 0.05, 'imóvel: 5% se a pessoa não mudou');
  assert.equal(custosDaMeta({ tipo: 'acumulo', categoria: 'outros', especificos: {} }), 0);
  assert.equal(custosDaMeta({ ...CHACARA, especificos: { custosPct: 0.06 } }), 0.06);
  const s = simularPreco(CHACARA, c, 120000, { hoje: HOJE, mesPrazo: '2031-12' });
  assert.equal(s.parte, 31500, '120.000 x 1,05 ÷ 4');
  assert.equal(s.pessoas, 4);
  assert.equal(s.jaChegou, false);
  // sem rendimento: 11 x 200 + 12 x 300 + 12 x 400 + 12 x 500 + 12 x 600... até somar 31.500
  const alvoMeses = prazoParaAlvo({ alvo: 31500, atual: 0, aporte: aporteFn(planoAporte(CHACARA, HOJE), HOJE), taxa: 0 });
  assert.equal(s.chegaEm.meses, Math.ceil(alvoMeses));
  assert.equal(s.chegaEm.mes.length, 7);
  // pra chegar em dez/2031 (62 meses) sem rendimento: 31.500 / 62
  assert.equal(s.noPrazo.meses, 62);
  assert.ok(perto(s.noPrazo.aporte, 31500 / 62, 0.01));
  assert.equal(simularPreco(CHACARA, c, 0, { hoje: HOJE }), null);
  const barato = simularPreco({ ...CHACARA, especificos: {} }, calcularMeta({ ...CHACARA, valorInicial: 5000 }, CTX), 4000, { hoje: HOJE });
  assert.equal(barato.jaChegou, true);
});

test('preços de exemplo: valores redondos pra imóvel; o preço de referência guardado vira o do meio; outras categorias: campo vazio', () => {
  assert.deepEqual(precosDeExemplo(CHACARA), [150000, 300000, 600000]);
  assert.deepEqual(precosDeExemplo({ ...CHACARA, especificos: { precoReferencia: 200000 } }), [160000, 200000, 250000]);
  assert.deepEqual(precosDeExemplo({ tipo: 'acumulo', categoria: 'hobbies', especificos: {} }), []);
});

test('quanto do que você tem é aporte e quanto é rendimento: só com "começou em"; aportes + inicial + rendimento = total', () => {
  const c = calcularMeta({ ...CHACARA, valorInicial: 500, vinculos: [{ tipo: 'saldo', modo: 'total', id: 's', instituicao: 'Corretora Z', moeda: 'BRL', saldo: 1900, atualizadoEm: HOJE, historico: [] }] }, CTX);
  const comp = composicaoAtual(c);
  assert.equal(comp.aportado, 1200);
  assert.equal(comp.valorInicial, 500);
  assert.equal(comp.total, 2400);
  assert.equal(comp.rendimento, 700, '2.400 - 1.200 - 500');
  assert.equal(composicaoAtual(calcularMeta({ ...CHACARA, aporteCrescimento: { tipo: 'valor', valor: 100, referencia: '2026-10' } }, CTX)), null, 'sem "começou em" não dá pra dizer');
});

test('a seção Estimativas só faz sentido em objetivos de juntar dinheiro (não em reserva, renda passiva, aposentadoria, viagem, arquivada)', () => {
  assert.equal(temEstimativas(CHACARA), true);
  assert.equal(temEstimativas({ tipo: 'casa', status: 'ativa' }), true);
  assert.equal(temEstimativas({ tipo: 'reservaEmergencia', status: 'ativa' }), false);
  assert.equal(temEstimativas({ tipo: 'viagemInternacional', status: 'ativa' }), false);
  assert.equal(temEstimativas({ ...CHACARA, status: 'arquivada' }), false);
  assert.equal(temEstimativas({ ...CHACARA, contribuicao: 'recorrente' }), false);
});

// ---------------------------------------------------------------------------
// Patrimônio e Início: investimento fora da carteira entra só no patrimônio líquido
// ---------------------------------------------------------------------------

function patrimonioFalso(extra = {}) {
  const hm = [];
  let v = 50000;
  for (let k = 0; k < 14; k += 1) {
    const total = 2025 * 12 + 7 + k; // jul/2025 em diante
    hm.push({ mes: `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`, patrimonio: Math.round(v), aporte: k ? 1000 : 0, indiceIpca: 100 * 1.004 ** k, indiceCdi: 100 * 1.009 ** k });
    v = v * 1.008 + 1000;
  }
  return { ok: true, hoje: '2026-08-31', historicoMensal: hm, investimentos: { longoPrazo: hm[hm.length - 1].patrimonio - 5000, reserva: 5000 }, config: {}, ...extra };
}
const FORA = { id: 'ch1:s1', nome: 'Fundo de teste - minha parte', valor: 2300, saldoInformado: 2200, estimado: true, cdiPct: 100, atualizadoEm: '2026-07-01', meta: 'Terreno em grupo', metaId: 'ch1' };

test('balanco: o investimento fora da carteira entra em "tudo que você tem" e no líquido, com o nome - e fica fora de investimentos/reserva', () => {
  const d = patrimonioFalso();
  const antes = balanco(d);
  const depois = balanco({ ...d, outrosInvestimentos: [FORA] });
  assert.equal(depois.totalAtivos, antes.totalAtivos + 2300);
  assert.equal(depois.liquido, antes.liquido + 2300);
  const linha = depois.ativos.find((a) => a.fora);
  assert.equal(linha.nome, 'Fundo de teste - minha parte');
  assert.equal(linha.valor, 2300);
  assert.ok(String(linha.id).startsWith('fora:'));
  const inv = depois.ativos.find((a) => a.id === 'investimentos');
  assert.equal(inv.valor, d.investimentos.longoPrazo, 'não entra na carteira de investimentos');
  assert.equal(depois.ativos.find((a) => a.id === 'reserva').valor, 5000);
  assert.equal(balanco({ ...d, outrosInvestimentos: [{ ...FORA, valor: 0 }, null] }).liquido, antes.liquido, 'zerado/inválido não entra');
});

test('hero da Início: "era X + variação = hoje" continua fechando; o valor fora da carteira entra como entrada de patrimônio, não como rendimento', () => {
  const d = patrimonioFalso();
  const sem = modeloHero(d, 'tudo');
  const com = modeloHero({ ...d, outrosInvestimentos: [FORA] }, 'tudo');
  assert.equal(com.liquido, sem.liquido + 2300);
  assert.equal(com.totalAtivos, sem.totalAtivos + 2300);
  assert.equal(com.foraDaCarteira.total, 2300);
  assert.equal(sem.foraDaCarteira, null);
  // fecha a conta: início + variação = hoje (variação sobe os mesmos 2.300)
  assert.ok(perto(com.variacao.inicioValor + com.variacao.valor, com.liquido, 0.01));
  assert.ok(perto(com.variacao.valor, sem.variacao.valor + 2300, 0.01));
  // rendimento (Dietz) não infla: igual ao de antes
  assert.ok(com.resumo.pl.acumulado <= sem.resumo.pl.acumulado && perto(com.resumo.pl.acumulado, sem.resumo.pl.acumulado, 0.002), 'a rentabilidade não infla (no máx. dilui um pouco: o dinheiro novo entra no fim do mês)');
  assert.ok(perto(com.resumo.retornos, sem.resumo.retornos, 0.01));
  assert.ok(perto(com.resumo.fluxos, sem.resumo.fluxos + 2300, 0.01), 'entra como dinheiro novo');
  assert.match(com.decomposicao.texto, /fora da carteira/);
  assert.match(com.decomposicao.texto, /Fundo de teste - minha parte/);
  assert.doesNotMatch(sem.decomposicao.texto, /fora da carteira/);
  // anel: aparece a fatia com o nome; os KPIs de investimentos não mudam
  assert.ok(com.ativos.some((a) => a.nome === 'Fundo de teste - minha parte' && a.valor === 2300));
  assert.equal(com.kpis.investimentos, sem.kpis.investimentos);
});

// ---------------------------------------------------------------------------
// Assistente e detalhe (JSDOM)
// ---------------------------------------------------------------------------

const BASE = {
  ok: true, hoje: HOJE, arquivadas: [], ativos: [{ id: 'AAAA11', ref: 'AAAA11', nome: 'AAAA11', classe: 'fiis', valorBRL: 10000 }],
  cambio: {}, referencias: { reserva: { custoDeVida: 2000, meses: 6, sobra: 0.1 }, rendaPassiva: { media12m: 300, metaPlanilha: 1000 }, patrimonio: { rendimento: 0.08 } },
  proventos12m: { porTicker: {} },
};
const montarDom = () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="metas"><main>${TEMPLATE_METAS}</main></body></html>`, { url: 'https://exemplo.test/metas.html', pretendToBeVisual: true });
  dom.window.alert = () => {};
  return { doc: dom.window.document, w: dom.window };
};
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const digitar = (w, el, valor, tipo = 'input') => { el.value = valor; el.dispatchEvent(new w.Event(tipo, { bubbles: true })); };
const marcar = (w, el, v = true) => { el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const espera = () => new Promise((r) => setTimeout(r, 0));

async function montar({ metas = [], base = {} } = {}) {
  const { doc, w } = montarDom();
  let servidor = { ...clone(BASE), ...clone(base), metas: clone(metas) };
  const salvas = [];
  let n = 0;
  const pagina = await montarPaginaMetas('tk', {
    doc, win: w, usarCache: false,
    getMetasImpl: async () => clone(servidor),
    salvarMetaImpl: async (_t, meta) => {
      salvas.push(clone(meta));
      const m = { ...clone(meta), id: meta.id || `novo${++n}` };
      servidor = { ...servidor, metas: [...servidor.metas.filter((x) => x.id !== m.id), m] };
      return { ok: true, id: m.id, meta: m };
    },
    getMetasHistoricoImpl: async () => ({ ok: true, hoje: HOJE, metas: {}, indices: [] }),
    excluirMetaImpl: async () => ({ ok: true }),
    excluirDefinitivoImpl: async () => ({ ok: true }),
    carregarDadosViagemImpl: async () => ({ paises: [], cidades: null, taxas: null }),
  });
  await espera();
  return { doc, w, pagina, salvas };
}

test('assistente: nova meta "Imóvel, terreno ou chácara", ainda sem valor nem data, em grupo, com aporte que cresce, e investimento fora da carteira com % do CDI na conta do patrimônio', async () => {
  const { doc, w, salvas } = await montar({ base: { cdi: serieCdi() } });
  clique(w, doc.getElementById('mtNova'));
  const dlg = doc.getElementById('mtDialogo');
  const tile = dlg.querySelector('[data-tipo="acumulo"][data-categoria="imoveis"]');
  assert.ok(tile, 'a categoria nova aparece na escolha');
  assert.match(tile.textContent, /Imóvel, terreno ou chácara/);
  clique(w, tile);
  digitar(w, dlg.querySelector('[data-campo="nome"]'), 'Chácara com amigos');
  // "Ainda não sei o valor nem a data"
  const semAlvo = dlg.querySelector('[data-sem-alvo]');
  assert.ok(semAlvo, 'caixinha "Ainda não sei"');
  assert.equal(semAlvo.checked, false);
  assert.ok(dlg.querySelector('[data-campo="valorAlvo"]'));
  marcar(w, semAlvo);
  assert.equal(dlg.querySelector('[data-campo="valorAlvo"]'), null, 'sem alvo: o campo some');
  assert.equal(dlg.querySelector('[data-campo="dataAlvo"]'), null, 'sem data: o campo some');
  assert.match(dlg.querySelector('#mtPrevia').textContent, /só acompanhando/);
  // compra em grupo, aporte e aporte crescente
  digitar(w, dlg.querySelector('[data-campo="especificos.grupoPessoas"]'), '4');
  digitar(w, dlg.querySelector('[data-campo="aporteMensal"]'), '200');
  assert.equal(dlg.querySelector('[data-cresc="valor"]'), null, 'o valor só aparece depois de escolher o tipo');
  digitar(w, dlg.querySelector('[data-cresc="tipo"]'), 'valor', 'change');
  digitar(w, dlg.querySelector('[data-cresc="valor"]'), '100');
  digitar(w, dlg.querySelector('[data-cresc="inicio"]'), '2025-10', 'change');
  assert.match(dlg.querySelector('#mtCrescResumo').textContent.replace(/\s/g, ' '), /R\$ 200\/mês hoje · R\$ 300 a partir de out\/2027 · começou em out\/2025 com R\$ 100\/mês/);
  clique(w, dlg.querySelector('[data-proximo]'));
  // saldo/investimento fora da carteira
  assert.match(dlg.textContent, /Saldo ou investimento fora da carteira/);
  clique(w, dlg.querySelector('[data-saldo-add]'));
  digitar(w, dlg.querySelector('[data-saldo-campo="nome"]'), 'Fundo de teste - minha parte');
  digitar(w, dlg.querySelector('[data-saldo-campo="instituicao"]'), 'Corretora Z');
  digitar(w, dlg.querySelector('[data-saldo-campo="moeda"]'), 'BRL', 'change');
  digitar(w, dlg.querySelector('[data-saldo-campo="saldo"]'), '2.000');
  digitar(w, dlg.querySelector('[data-saldo-campo="atualizadoEm"]'), '2026-09-14', 'change');
  digitar(w, dlg.querySelector('[data-saldo-campo="cdiPct"]'), '100');
  marcar(w, dlg.querySelector('[data-saldo-campo="contaNoPatrimonio"]'));
  clique(w, dlg.querySelector('[data-proximo]'));
  clique(w, dlg.querySelector('[data-salvar]'));
  await espera();
  assert.equal(salvas.length, 1);
  const m = salvas[0];
  assert.deepEqual([m.tipo, m.categoria, m.nome, m.valorAlvo, m.dataAlvo], ['acumulo', 'imoveis', 'Chácara com amigos', null, null]);
  assert.equal(m.aporteMensal, 200);
  assert.deepEqual(m.aporteCrescimento, { tipo: 'valor', valor: 100, mes: null, referencia: '2026-10', inicio: '2025-10' });
  assert.equal(m.especificos.grupoPessoas, 4);
  assert.equal(m.vinculos.length, 1);
  const s = m.vinculos[0];
  assert.deepEqual([s.tipo, s.nome, s.instituicao, s.moeda, s.saldo, s.atualizadoEm, s.cdiPct, s.contaNoPatrimonio], ['saldo', 'Fundo de teste - minha parte', 'Corretora Z', 'BRL', 2000, '2026-09-14', 100, true]);
  // a lista: cartão cinza "Acompanhando" com o valor estimado pelo CDI (> R$ 2.000)
  const tela = doc.getElementById('mtTela');
  assert.match(tela.textContent, /Chácara com amigos/);
  assert.match(tela.textContent, /Acompanhando/);
  assert.doesNotMatch(tela.textContent, /precisam? de atenção/);
});

test('detalhe da meta sem alvo: herói cinza, "Estimativas" abre sozinha com 1/3/5/10 anos, grupo e simulador; o estimado do CDI aparece com o convite a atualizar', async () => {
  const meta = { ...clone(CHACARA), vinculos: [{ tipo: 'saldo', modo: 'total', id: 's1', nome: 'Fundo de teste - minha parte', instituicao: 'Corretora Z', moeda: 'BRL', saldo: 2000, atualizadoEm: '2026-09-14', cdiPct: 100, contaNoPatrimonio: true, historico: [{ data: '2026-09-14', saldo: 2000 }] }] };
  const { doc, w, salvas } = await montar({ metas: [meta], base: { cdi: serieCdi() } });
  const tela = doc.getElementById('mtTela');
  assert.match(tela.textContent, /1 acompanhando/);
  clique(w, tela.querySelector('[data-abrir="ch1"]'));
  assert.match(tela.textContent, /Acompanhando/);
  assert.match(tela.textContent, /Ainda sem valor definido/);
  const det = tela.querySelector('#mtEstimDet');
  assert.ok(det, 'seção Estimativas');
  assert.equal(det.open, true, 'sem alvo ela abre sozinha');
  assert.equal(tela.querySelectorAll('.mt-estim-ano').length, 4);
  assert.match(tela.querySelector('.mt-estim').textContent, /Em 1 ano/);
  assert.match(tela.querySelector('.mt-estim').textContent, /Em 10 anos/);
  assert.match(tela.querySelector('.mt-estim').textContent, /Compra em grupo \(4 pessoas\)/);
  assert.match(tela.querySelector('.mt-estim').textContent, /Se seus amigos estiverem aportando a mesma média/);
  assert.match(tela.textContent, /Fora da carteira · Fundo de teste - minha parte/);
  assert.match(tela.textContent.replace(/\s/g, ' '), /estimado: R\$ 2\.0\d\d,\d\d \(último extrato R\$ 2\.000,00 em 14\/09, \+ 100% do CDI até/);
  assert.match(tela.textContent, /Atualize o saldo quando tiver o extrato novo/);
  assert.match(tela.textContent, /conta no meu patrimônio/);
  assert.doesNotMatch(tela.textContent, /Aporte necessário/);
  // simulador: exemplos, resultado, guardar como referência e usar como alvo
  const campo = tela.querySelector('#mtSimPreco');
  assert.ok(tela.querySelector('[data-sim-ref]').disabled);
  clique(w, tela.querySelector('[data-sim-chip="300000"]'));
  assert.equal(campo.value, '300000');
  const res = tela.querySelector('#mtSimPrecoRes').textContent.replace(/\s/g, ' ');
  assert.match(res, /Sua parte: R\$ 78\.750 \(R\$ 300\.000 \+ 5% de custos ÷ 4 pessoas\)/);
  assert.match(res, /No seu ritmo \(com o aumento anual do aporte\) você chega em/);
  assert.match(res, /Pra chegar até dez\/\d{4} precisaria aportar/);
  digitar(w, campo, '240.000');
  assert.match(tela.querySelector('#mtSimPrecoRes').textContent.replace(/\s/g, ' '), /Sua parte: R\$ 63\.000 /);
  clique(w, tela.querySelector('[data-sim-ref]'));
  await espera(); await espera();
  assert.equal(salvas.length, 1);
  assert.equal(salvas[0].especificos.precoReferencia, 240000);
  assert.equal(salvas[0].valorAlvo, null, 'o preço de referência NÃO vira alvo sozinho');
  assert.match(doc.getElementById('mtTela').textContent, /Preço de referência guardado/);
  clique(w, doc.getElementById('mtTela').querySelector('[data-sim-alvo]'));
  await espera(); await espera();
  assert.equal(salvas.length, 2);
  assert.equal(salvas[1].valorAlvo, 63000, 'só com o clique em "Usar como alvo"');
  assert.equal(salvas[1].especificos.precoReferencia, 240000);
});

test('detalhe de uma meta com alvo e aporte crescente: a frase do aporte mostra os degraus e a seção Estimativas começa fechada', async () => {
  const meta = { ...clone(CHACARA), id: 'ch2', nome: 'Terreno com prazo', valorAlvo: 40000, dataAlvo: '2031-10' };
  const { doc, w } = await montar({ metas: [meta] });
  const tela = doc.getElementById('mtTela');
  assert.doesNotMatch(tela.querySelector('.mt-card').textContent, /Acompanhando/);
  clique(w, tela.querySelector('[data-abrir="ch2"]'));
  assert.match(tela.textContent.replace(/\s/g, ' '), /R\$ 200\/mês hoje · R\$ 300 a partir de out\/2027/);
  assert.equal(tela.querySelector('#mtEstimDet').open, false, 'com alvo ela começa fechada (recolhível)');
  assert.match(tela.textContent, /Evolução projetada/);
});

test('editar uma meta com aporte crescente salvo em outubro: o campo "Seu aporte mensal" mostra o aporte de hoje (sem degrau esquecido)', async () => {
  const meta = { ...clone(CHACARA), id: 'ch3', valorAlvo: 40000, dataAlvo: '2031-10', aporteCrescimento: { tipo: 'valor', valor: 100, mes: 1, referencia: '2026-04', inicio: null } };
  // referência abril/26, reajuste em janeiro: em out/26 ainda não houve degrau
  const { doc, w } = await montar({ metas: [meta] });
  const tela = doc.getElementById('mtTela');
  clique(w, tela.querySelector('[data-abrir="ch3"]'));
  clique(w, tela.querySelector('[data-editar]'));
  const dlg = doc.getElementById('mtDialogo');
  assert.equal(dlg.querySelector('[data-campo="aporteMensal"]').value, '200');
  assert.equal(dlg.querySelector('[data-cresc="tipo"]').value, 'valor');
  assert.equal(dlg.querySelector('[data-cresc="mes"]').value, '1');
});
