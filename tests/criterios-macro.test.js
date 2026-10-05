// tests/criterios-macro.test.js
//
// 05/10/2026 (Tiago: "reavalie as análises... considere as metas e a
// classificação de um ativo em alguma meta, considere o macroeconômico, se a
// bolsa está cara ou barata, a situação daquele ativo"): contexto de mercado
// (criterios/macro.js), situação do ativo, renda fixa x meta e a leitura
// "Para o seu aporte" (criterios/motor.js), e o limite de peso do macro no
// momento de aporte. Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  juroReal, analisarJuros, analisarNtnb, multiploPonderado, termometroBolsa, montarMacro, sinaisMacro, resumoMacro, ajudaHtml, LIMITE_PONTOS_MACRO,
} from '../assets/js/criterios/macro.js';
import { avaliarAtivo, sinaisRendaFixaMeta, sinaisDeMetas, leituraParaVoce, outraMetaQueFazFalta } from '../assets/js/criterios/motor.js';
import { momentoAporte } from '../assets/js/pages/aportes-calc.js';
import { momentoHtml } from '../assets/js/pages/momento-aporte.js';

const HOJE = '2026-10-05';

// ---------------------------------------------------------------------------
// juros
// ---------------------------------------------------------------------------

test('juroReal: (1+nominal)/(1+inflação)-1; sem um dos dois, null', () => {
  assert.ok(Math.abs(juroReal(0.1375, 0.0459) - 0.0871) < 0.0005);
  assert.equal(juroReal(0.1, null), null);
  assert.equal(juroReal(null, 0.04), null);
});

test('analisarJuros: usa Selic x IPCA esperado (Focus); sem Focus cai pro CDI 12m x IPCA 12m; classifica o nível', () => {
  const a = analisarJuros({ selic: 0.1375, ipcaEsperado12m: 0.0459, cdi12m: 0.14, ipca12m: 0.05, selicEsperadaAnoSeguinte: 0.12 });
  assert.equal(a.base, 'esperado');
  assert.equal(a.nivel, 'muito-alto');
  assert.ok(Math.abs(a.quedaEsperada - 0.0175) < 1e-9);
  const b = analisarJuros({ selic: 0.1375, cdi12m: 0.115, ipca12m: 0.05 });
  assert.equal(b.base, 'realizado');
  assert.ok(Math.abs(b.real - 0.0619) < 0.001);
  assert.equal(b.nivel, 'alto');
  assert.equal(analisarJuros({ selic: 0.08, ipcaEsperado12m: 0.05 }).nivel, 'baixo');
  assert.equal(analisarJuros({ selic: 0.1 }), null, 'sem inflação não há juro real');
  assert.equal(analisarJuros(null), null);
});

test('analisarNtnb: a longa é o IPCA+ mais distante (5+ anos) e o prêmio é classificado pela régua fixa', () => {
  const lista = [
    { nome: 'Tesouro IPCA+ 2029', tipo: 'Tesouro IPCA+', vencimento: '2029-05-15', taxa: 7.1 },
    { nome: 'Tesouro IPCA+ 2035', tipo: 'Tesouro IPCA+', vencimento: '2035-05-15', taxa: 7.4 },
    { nome: 'Tesouro IPCA+ com Juros Semestrais 2045', tipo: 'Tesouro IPCA+ com Juros Semestrais', vencimento: '2045-05-15', taxa: 7.2 },
    { nome: 'Tesouro Prefixado 2029', tipo: 'Tesouro Prefixado', vencimento: '2029-01-01', taxa: 13 },
  ];
  const n = analisarNtnb(lista, HOJE);
  assert.equal(n.longa.nome, 'Tesouro IPCA+ com Juros Semestrais 2045');
  assert.equal(n.nivel, 'alto');
  assert.equal(n.curta.nome, 'Tesouro IPCA+ 2029');
  assert.equal(analisarNtnb([{ nome: 'Tesouro IPCA+ 2035', tipo: 'Tesouro IPCA+', vencimento: '2035-05-15', taxa: 4.6 }], HOJE).nivel, 'baixo');
  assert.equal(analisarNtnb([], HOJE), null);
  assert.equal(analisarNtnb([{ nome: 'Tesouro Prefixado 2029', tipo: 'Tesouro Prefixado', vencimento: '2029-01-01', taxa: 13 }], HOJE), null, 'prefixado não é NTN-B');
});

// ---------------------------------------------------------------------------
// termômetro da bolsa
// ---------------------------------------------------------------------------

/** 14 meses de foto: P/L constante por ativo, pra a média histórica ficar conhecida. */
function fotos(pl, meses = 14, ate = '2026-09') {
  const out = [];
  let [a, m] = ate.split('-').map(Number);
  for (let i = 0; i < meses; i++) { out.unshift([`${a}-${String(m).padStart(2, '0')}`, pl]); m -= 1; if (m === 0) { m = 12; a -= 1; } }
  return out;
}
const carteiraAcoes = (plAtual, plHist) => [
  { ticker: 'AAAA3', classe: 'acoes', valor: 1000, pl: plAtual, pvp: 1, historico: { pl: fotos(plHist), pvp: [] } },
  { ticker: 'BBBB3', classe: 'acoes', valor: 1000, pl: plAtual, pvp: 1, historico: { pl: fotos(plHist), pvp: [] } },
  { ticker: 'CCCC3', classe: 'acoes', valor: 2000, pl: plAtual, pvp: 1, historico: { pl: fotos(plHist), pvp: [] } },
];

test('multiploPonderado: média harmônica pelo valor; P/L negativo ou absurdo fica de fora e baixa a cobertura', () => {
  const r = multiploPonderado([
    { valor: 100, pl: 10 }, { valor: 100, pl: 20 }, { valor: 100, pl: -5 }, { valor: 100, pl: 500 },
  ], 'pl', (x) => x.pl);
  assert.ok(Math.abs(r.valor - 13.333) < 0.01); // 200 / (100/10 + 100/20)
  assert.equal(r.n, 2);
  assert.equal(r.cobertura, 0.5);
});

test('termometroBolsa: P/L de hoje 18% abaixo da mediana histórica = barato; 20% acima = caro; no meio = neutro', () => {
  const barato = termometroBolsa(carteiraAcoes(9, 11), 'acoes', HOJE);
  assert.equal(barato.nivel, 'barato');
  assert.ok(barato.razao < 0.85);
  assert.equal(barato.meses, 14);
  assert.equal(termometroBolsa(carteiraAcoes(13.2, 11), 'acoes', HOJE).nivel, 'caro');
  assert.equal(termometroBolsa(carteiraAcoes(11.5, 11), 'acoes', HOJE).nivel, 'neutro');
});

test('termometroBolsa: sem 12 meses de foto = "sem-historico"; poucos ativos ou pouca cobertura = null; o mês de hoje não entra na média', () => {
  const curto = carteiraAcoes(9, 11).map((x) => ({ ...x, historico: { pl: fotos(11, 4), pvp: [] } }));
  assert.equal(termometroBolsa(curto, 'acoes', HOJE).nivel, 'sem-historico');
  const poucos = termometroBolsa(carteiraAcoes(9, 11).map((x) => ({ ...x, historico: { pl: fotos(11, 7), pvp: [] } })), 'acoes', HOJE);
  assert.equal(poucos.nivel, 'barato', '7 meses de foto já dão uma mediana (o texto diz a janela)');
  const sinaisPoucos = sinaisMacro(montarMacro({ ok: true, macro: { hoje: HOJE, juros: { selic: 0.1375, ipcaEsperado12m: 0.0459 }, tesouro: [], carteira: carteiraAcoes(9, 11).map((x) => ({ ...x, historico: { pl: fotos(11, 7), pvp: [] } })) } }), 'acoes');
  assert.match(sinaisPoucos[0].texto, /contra 11,0 na média dos últimos 7 meses/);
  assert.equal(termometroBolsa(carteiraAcoes(9, 11).slice(0, 2), 'acoes', HOJE), null, 'só 2 ativos');
  const semLucro = carteiraAcoes(9, 11).map((x, i) => (i >= 1 ? { ...x, pl: -3 } : x)); // 75% do valor sem P/L válido
  assert.equal(termometroBolsa(semLucro, 'acoes', HOJE), null, 'cobertura de 25% < 50%');
  const comHoje = carteiraAcoes(9, 11).map((x) => ({ ...x, historico: { pl: [...x.historico.pl, ['2026-10', 99]], pvp: [] } }));
  assert.equal(termometroBolsa(comHoje, 'acoes', HOJE).medio, 11, 'foto do mês corrente não distorce a média');
});

test('termometroBolsa de FIIs: P/VP médio abaixo de 0,90 = baratos mesmo sem histórico (regra do Tiago); acima de 1,05 = caros', () => {
  const fiis = (pvp) => ['AAAA11', 'BBBB11', 'CCCC11'].map((t) => ({ ticker: t, classe: 'fiis', valor: 1000, pl: null, pvp, historico: { pl: [], pvp: [] } }));
  const b = termometroBolsa(fiis(0.88), 'fiis', HOJE);
  assert.equal(b.nivel, 'barato');
  assert.equal(b.metrica, 'P/VP');
  assert.equal(termometroBolsa(fiis(1.08), 'fiis', HOJE).nivel, 'caro');
  assert.equal(termometroBolsa(fiis(0.98), 'fiis', HOJE).nivel, 'neutro');
});

// ---------------------------------------------------------------------------
// contexto montado + sinais
// ---------------------------------------------------------------------------

const RESPOSTA = {
  ok: true,
  macro: {
    hoje: HOJE,
    juros: { selic: 0.1375, ipcaEsperado12m: 0.0459, cdi12m: 0.14, ipca12m: 0.05, selicEsperadaAnoSeguinte: 0.12 },
    tesouro: [{ nome: 'Tesouro IPCA+ 2035', tipo: 'Tesouro IPCA+', vencimento: '2035-05-15', taxa: 7.4 }],
    carteira: [...carteiraAcoes(9, 11),
      ...['AAAA11', 'BBBB11', 'CCCC11'].map((t) => ({ ticker: t, classe: 'fiis', valor: 1000, pl: null, pvp: 0.88, historico: { pl: [], pvp: fotos(0.97) } }))],
    avisos: [],
  },
};

test('montarMacro: junta juros, NTN-B e bolsa; sem nada utilizável devolve null; usa o Tesouro da tela se o Macro.gs não trouxe', () => {
  const m = montarMacro(RESPOSTA);
  assert.equal(m.juros.nivel, 'muito-alto');
  assert.equal(m.ntnb.nivel, 'alto');
  assert.equal(m.bolsa.acoes.nivel, 'barato');
  assert.equal(m.bolsa.fiis.nivel, 'barato');
  assert.equal(montarMacro({ ok: true, macro: { hoje: HOJE, juros: {}, tesouro: [], carteira: [] } }), null);
  const extra = montarMacro({ ok: true, macro: { hoje: HOJE, juros: {}, tesouro: [], carteira: [] } }, { tesouroExtra: [{ nome: 'Tesouro IPCA+ 2035', tipo: 'Tesouro IPCA+', vencimento: '2035-05-15', taxa: 7.4 }] });
  assert.ok(Math.abs(extra.ntnb.longa.taxa - 0.074) < 1e-9);
});

test('sinaisMacro: ações = bolsa + juro real (cada um 1 linha com "Contexto de mercado" e o "i"); peso por sinal <= 0,4', () => {
  const m = montarMacro(RESPOSTA);
  const s = sinaisMacro(m, 'acoes');
  assert.equal(s.length, 2);
  assert.match(s[0].texto, /^Contexto de mercado: P\/L médio das suas ações em 9,0 contra 11,0 na média histórica \(−18%\): mercado barato no geral\.$/);
  assert.equal(s[0].tom, 'bom');
  assert.match(s[1].texto, /^Contexto de mercado: juro real de 8,8% a\.a\.: a renda fixa paga muito; exija mais desconto nas ações\.$/);
  assert.equal(s[1].tom, 'ruim');
  s.forEach((x) => { assert.ok(Math.abs(x.peso) <= 0.4); assert.equal(x.macro, true); assert.ok(x.ajuda.length > 40); });
});

test('sinaisMacro: ações sem foto mensal suficiente = só o retorno pelo lucro x Selic, peso ZERO ("ainda sem média histórica")', () => {
  const m = montarMacro({ ok: true, macro: { hoje: HOJE, juros: { selic: 0.1375, ipcaEsperado12m: 0.0459 }, tesouro: [], carteira: carteiraAcoes(9, 11).map((x) => ({ ...x, historico: { pl: [], pvp: [] } })) } });
  const s = sinaisMacro(m, 'acoes');
  assert.equal(s[0].peso, 0);
  assert.match(s[0].texto, /P\/L médio das suas ações em 9,0 \(retorno pelo lucro de 11,1% a\.a\. contra Selic de 13,75%\); ainda sem média histórica/);
  assert.match(resumoMacro(m).find((c) => c.id === 'bolsa-acoes').valor, /retorno 11,1% x Selic 13,75%/);
});

test('sinaisMacro: FIIs baratos (P/VP < 0,9) e Selic em queda esperada; renda fixa depende do indexador', () => {
  const m = montarMacro(RESPOSTA);
  const f = sinaisMacro(m, 'fiis');
  assert.match(f[0].texto, /P\/VP médio dos seus FIIs em 0,88 contra 0,97 na média histórica.*baratos|mercado barato/);
  assert.match(f[1].texto, /Focus espera a Selic em 12,00% no fim do próximo ano \(hoje 13,75%\)/);
  const selic = sinaisMacro(m, 'rendaFixa', { indexador: 'SELIC' });
  assert.match(selic[0].texto, /Selic em 13,75% \(juro real de 8,8% a\.a\.\): o pós-fixado paga muito/);
  const ipca = sinaisMacro(m, 'rendaFixa', { indexador: 'IPCA' });
  assert.ok(ipca.some((x) => /Focus espera a Selic/.test(x.texto)));
  assert.ok(ipca.some((x) => /IPCA \+ 7,4%: prêmio alto/.test(x.texto)));
  assert.ok(!sinaisMacro(m, 'rendaFixa', { indexador: 'IPCA', taxaPropria: true }).some((x) => /prêmio alto/.test(x.texto)), 'o título que já mostra a própria taxa não repete o prêmio');
  assert.deepEqual(sinaisMacro(null, 'acoes'), []);
});

test('resumoMacro: chips com juro real, NTN-B e bolsa; ajudaHtml escapa o texto', () => {
  const chips = resumoMacro(montarMacro(RESPOSTA));
  assert.deepEqual(chips.map((c) => c.id), ['juro-real', 'ntnb', 'bolsa-acoes', 'bolsa-fiis']);
  assert.equal(chips[1].valor, 'IPCA + 7,4%');
  assert.match(ajudaHtml('a <b> & "c"'), /<details class="ctx-i"><summary[^>]*>i<\/summary><p>a &lt;b&gt; &amp; &quot;c&quot;<\/p><\/details>/);
  assert.equal(ajudaHtml(''), '');
});

// ---------------------------------------------------------------------------
// momento de aporte: o macro pesa pouco
// ---------------------------------------------------------------------------

const acao = { ticker: 'ZZZZ3', moeda: 'BRL', precoAtual: 10, precoTeto: 12, quantidade: 0 };

test('momento: contexto de mercado soma no máximo 0,5 ponto e vem por último, com a explicação', () => {
  const m = montarMacro(RESPOSTA);
  const sem = momentoAporte(acao, 'acoes', null, HOJE);
  const com = momentoAporte(acao, 'acoes', null, HOJE, { macro: m });
  const macros = com.sinais.filter((x) => x.macro);
  assert.equal(macros.length, 2);
  assert.ok(com.pontos - sem.pontos <= LIMITE_PONTOS_MACRO + 1e-9);
  assert.equal(com.sinais[com.sinais.length - 1].macro, true);
  // 1 ponto só de macro (barato +0,4 e juro -0,3 = +0,1): não vira "Bom momento" sozinho
  assert.equal(com.nivel, sem.nivel);
});

test('momento: macro muito negativo NÃO derruba um ativo neutro pra "Melhor esperar" (teto de 0,5 ponto)', () => {
  const ruim = montarMacro({ ok: true, macro: { hoje: HOJE, juros: { selic: 0.15, ipcaEsperado12m: 0.04 }, tesouro: [], carteira: carteiraAcoes(14, 10) } });
  const s = sinaisMacro(ruim, 'acoes');
  assert.ok(s.reduce((t, x) => t + x.peso, 0) <= -0.5, 'os dois sinais somariam -0,7');
  const com = momentoAporte({ ...acao, precoTeto: 10.1 }, 'acoes', null, HOJE, { macro: ruim }); // no limite do teto (+0,5)
  const sem = momentoAporte({ ...acao, precoTeto: 10.1 }, 'acoes', null, HOJE);
  assert.equal(sem.pontos - com.pontos, 0.5);
  assert.notEqual(com.nivel, 'esperar', 'só o macro negativo (-0,5) nunca passa de -1');
});

test('momentoHtml: o sinal de contexto de mercado aparece sempre (1 linha) e leva o "i"', () => {
  const m = montarMacro(RESPOSTA);
  const mm = momentoAporte({ ...acao, precoAtual: 9, precoMedio: 12, quantidade: 5, ultimoPago: { preco: 12 }, variacaoDia: -0.03 }, 'acoes', null, HOJE, { macro: m });
  const html = momentoHtml(mm, { visiveis: 2 });
  assert.match(html, /momento-sinal [a-z]+ macro/);
  assert.match(html, /Contexto de mercado: P\/L médio das suas ações/);
  assert.match(html, /class="ctx-i"/);
});

// ---------------------------------------------------------------------------
// renda fixa x meta
// ---------------------------------------------------------------------------

const reserva = (falta, extra = {}) => ({
  id: 'r1', nome: 'Reserva de emergência', tipo: 'reservaEmergencia', status: 'ativa',
  vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }],
  calc: { alvoBRL: 30000, atualLiquidoBRL: 30000 - falta, faltaLiquida: falta, status: falta > 0 ? 'abaixo' : 'saldo-ideal', ...extra },
});
const viagem = (extra = {}) => ({
  id: 'v1', nome: 'Viagem 2027', tipo: 'viagemInternacional', status: 'ativa', vinculos: [{ tipo: 'classe', classe: 'rf', modo: 'total' }], // liga à classe RF (IPCA+ longo x meta curta)
  calc: { alvoBRL: 12000, falta: 6000, faltaLiquida: 6000, status: 'atrasada', dataAlvo: '2027-07', mesesRestantes: 9, ...extra },
});
const selic2032 = { titulo: 'Tesouro Selic 2032', instituicao: 'Corretora X', categoria: 'Renda Emergencial', indexador: 'SELIC', vencimento: '2032-03-01' };

test('RF x meta: Tesouro Selic marcado como reserva + reserva ABAIXO do ideal = "Bom momento" (o pedido do Tiago)', () => {
  const m = momentoAporte(selic2032, 'rendaFixa', null, HOJE, { metasObjetivos: [reserva(800)], valorSugerido: 800 });
  assert.equal(m.nivel, 'bom');
  assert.ok(m.sinais.some((x) => x.tom === 'bom' && /completa a meta/.test(x.texto)));
  assert.ok(m.sinais.some((x) => x.tom === 'bom' && /abaixo do ideal e este título combina com ela: Tesouro Selic: liquidez diária/.test(x.texto)));
});

test('RF x meta: reserva NO ideal = neutro e diz onde faz mais falta (a meta mais atrasada); sem outra meta, a classe mais abaixo da alocação-alvo', () => {
  const viagemFii = viagem({}); viagemFii.vinculos = [{ tipo: 'classe', classe: 'fiis', modo: 'total' }]; // meta atrasada, mas ligada a FIIs (o Tesouro não serve a ela)
  const m = momentoAporte(selic2032, 'rendaFixa', null, HOJE, { metasObjetivos: [reserva(0), viagemFii] });
  assert.notEqual(m.nivel, 'bom');
  const atingida = m.sinais.find((x) => /já atingida/.test(x.texto));
  assert.equal(atingida.tom, 'neutro');
  assert.match(atingida.texto, /mais falta em "Viagem 2027", atrasada: faltam R\$ 6\.000/);
  const alocacao = { acoesENacionais: { desejado: 0.4, atual: 0.3 }, fiis: { desejado: 0.2, atual: 0.2 }, rendaFixa: { desejado: 0.4, atual: 0.5 } };
  const so = momentoAporte(selic2032, 'rendaFixa', alocacao, HOJE, { metasObjetivos: [reserva(0)] });
  assert.ok(so.sinais.some((x) => /classe mais abaixo da alocação-alvo é Ações \(30,0% de 40%\)/.test(x.texto)));
});

test('RF x meta: título que vence em menos de 12 meses dentro da reserva = atenção (sai da reserva)', () => {
  const vence = { ...selic2032, vencimento: '2027-01-01' };
  const m = momentoAporte(vence, 'rendaFixa', null, HOJE, { metasObjetivos: [reserva(800)] });
  const aviso = m.sinais.find((x) => x.tom === 'ruim' && /vence em 3 meses e sai dela; reaplique/.test(x.texto));
  assert.ok(aviso, 'avisa do vencimento da reserva');
  assert.ok(!m.sinais.some((x) => x.texto === 'Vence em menos de 1 ano'), 'sem repetir o aviso genérico');
  const longo = sinaisRendaFixaMeta({ titulo: { titulo: vence.titulo, indexador: 'SELIC', vencimento: '2027-01-01' }, marca: 'longo-prazo', metas: [reserva(800)], hoje: HOJE });
  assert.deepEqual(longo, [], 'título de longo prazo não é da reserva');
});

test('RF x meta: IPCA+ longo pra meta curta = atenção (marcação a mercado); IPCA+ na reserva = não combina', () => {
  const ipca = { titulo: 'Tesouro IPCA+ 2035', indexador: 'IPCA', vencimento: '2035-05-15' };
  const v = sinaisRendaFixaMeta({ titulo: ipca, marca: 'longo-prazo', metas: [viagem()], hoje: HOJE });
  assert.equal(v.length, 1);
  assert.equal(v[0].tipo, 'rf-atencao');
  assert.match(v[0].texto, /Atenção com a meta "Viagem 2027": Vence em mai\/2035, depois da meta \(jul\/2027\).*preço de mercado/);
  const r = sinaisRendaFixaMeta({ titulo: ipca, marca: 'emergencial', metas: [reserva(800)], hoje: HOJE });
  assert.equal(r[0].tom, 'ruim');
  assert.ok(r[0].peso <= -1);
  assert.match(r[0].texto, /Não combina com a meta "Reserva de emergência": IPCA\+ oscila com a marcação a mercado/);
  assert.deepEqual(sinaisRendaFixaMeta({ titulo: { titulo: 'Título sem tipo' }, marca: 'emergencial', metas: [reserva(800)], hoje: HOJE }), [], 'sem saber o tipo não opina');
});

test('RF x meta: pontos entram na análise do título (avaliarAtivo) com o "i" e na leitura "Para o seu aporte"', () => {
  const av = avaliarAtivo({ classe: 'rendaFixa', ticker: 'Tesouro Selic 2032', marca: 'emergencial', indexador: 'SELIC', vencimento: '03/2032', metas: [reserva(800)], hoje: HOJE, macro: montarMacro(RESPOSTA) });
  assert.equal(av.nota, null);
  assert.ok(av.pontos.some((p) => p.criterioId === 'meta_rf-adequado' && p.ajuda));
  assert.ok(av.pontos.some((p) => p.grupo === 'contexto' && /pós-fixado paga muito/.test(p.texto) && p.ajuda));
  assert.equal(av.leitura.nivel, 'favoravel');
  assert.match(av.leitura.texto, /A favor: meta Reserva de emergência/);
});

test('sinaisDeMetas / outraMetaQueFazFalta: a mais atrasada primeiro; concluída, pausada e renda passiva não contam', () => {
  const metas = [reserva(0), viagem(), { ...viagem(), id: 'v2', nome: 'Carro', calc: { alvoBRL: 50000, faltaLiquida: 20000, falta: 20000, status: 'no-ritmo' } },
    { ...viagem(), id: 'v3', nome: 'Pausada', status: 'pausada' }];
  const o = outraMetaQueFazFalta(metas, 'r1');
  assert.equal(o.nome, 'Viagem 2027');
  assert.equal(o.rotulo, 'atrasada');
  assert.equal(outraMetaQueFazFalta([reserva(0)], 'r1'), null);
  const s = sinaisDeMetas({ classe: 'rendaFixa', marca: 'emergencial', metas, max: 5 });
  assert.equal(s.find((x) => x.tipo === 'atingida').outraMeta, 'Viagem 2027');
});

// ---------------------------------------------------------------------------
// situação do ativo
// ---------------------------------------------------------------------------

/** Série de preço diária (dias úteis simplificados: todo dia) de `preco0` até `preco1`, terminando em HOJE. */
function serie(ate, dias, preco0, preco1) {
  const out = [];
  const t1 = Date.parse(`${ate}T12:00:00Z`);
  for (let i = dias; i >= 0; i--) {
    const f = (dias - i) / dias;
    out.push({ data: new Date(t1 - i * 86400000).toISOString().slice(0, 10), preco: preco0 + (preco1 - preco0) * f });
  }
  return out;
}

/** Ação com P/L, histórico de P/L e proventos de 24 meses. dpa: dividendo por mês nos 12 meses recentes / anteriores. */
function acaoSituacao({ preco = 10, pl = 8, plAntigo = 8, precoAntigo = 10, dpaRecente = 0.05, dpaAnterior = 0.05, serieAte = serie(HOJE, 400, precoAntigo, preco) } = {}) {
  const proventos = [];
  for (let i = 1; i <= 24; i++) {
    const d = new Date(Date.UTC(2026, 9 - i, 15));
    proventos.push({ dataPagamento: d.toISOString().slice(0, 10), valorPorCota: i <= 12 ? dpaRecente : dpaAnterior, tipo: 'Dividendo' });
  }
  return {
    classe: 'acoes', ticker: 'ZZZZ3', nome: 'Zeta', setor: 'Energia elétrica', moeda: 'BRL', hoje: HOJE,
    indicadores: { precoAtual: preco, pl, pvp: 1.2, dy: 0.06, proventos },
    fundamentos: { valores: {}, historico: { pl: fotos(plAntigo, 24).map(([data, valor]) => ({ data, valor })) } },
    historicoPreco: serieAte,
  };
}

test('situação: lucro por ação 25% maior em 12 meses (P/L caiu com preço estável) = ponto a favor que entra na nota', () => {
  const av = avaliarAtivo(acaoSituacao({ pl: 8, plAntigo: 10 }));
  const p = av.pontos.find((x) => x.criterioId === 'situacao_lpa');
  assert.equal(p.tom, 'bom');
  assert.equal(p.grupo, 'situacao');
  assert.equal(p.informativo, false, 'entra na nota');
  assert.match(p.texto, /Lucro por ação cresceu cerca de 25% em 12 meses/);
});

test('situação: lucro por ação caindo e dividendos 40% menores = pontos contra; a nota cai em relação ao ativo estável', () => {
  const estavel = avaliarAtivo(acaoSituacao());
  const ruim = avaliarAtivo(acaoSituacao({ pl: 12, plAntigo: 8, dpaRecente: 0.03, dpaAnterior: 0.05 }));
  assert.equal(ruim.pontos.find((x) => x.criterioId === 'situacao_lpa').tom, 'ruim');
  assert.equal(ruim.pontos.find((x) => x.criterioId === 'situacao_dpa').tom, 'ruim');
  assert.match(ruim.pontos.find((x) => x.criterioId === 'situacao_dpa').texto, /40% abaixo dos 12 meses anteriores/);
  assert.ok(ruim.nota < estavel.nota);
});

test('situação: preço 25% abaixo do topo com lucro e dividendos firmes = "possível oportunidade"; caiu junto com o lucro = "desconto pode ser justificado"', () => {
  const opp = avaliarAtivo(acaoSituacao({ preco: 7.5, pl: 6, plAntigo: 8, precoAntigo: 10, serieAte: [...serie('2026-02-01', 120, 10, 10), ...serie(HOJE, 246, 10, 7.5).slice(1)] }));
  const p = opp.pontos.find((x) => x.criterioId === 'situacao_oportunidade');
  assert.ok(p, 'oportunidade');
  assert.equal(p.tom, 'bom');
  assert.match(p.texto, /abaixo da máxima de 12 meses com os fundamentos que medimos intactos \(lucro e dividendos\)/);
  const just = avaliarAtivo(acaoSituacao({ preco: 7.5, pl: 10, plAntigo: 8, precoAntigo: 10, dpaRecente: 0.03, dpaAnterior: 0.05, serieAte: [...serie('2026-02-01', 120, 10, 10), ...serie(HOJE, 246, 10, 7.5).slice(1)] }));
  assert.ok(!just.pontos.some((x) => x.criterioId === 'situacao_oportunidade'));
  assert.ok(just.pontos.some((x) => x.criterioId === 'situacao_queda_justificada'));
});

test('situação: sem histórico de P/L nem 24 meses de proventos, nada é inventado', () => {
  const av = avaliarAtivo({ ...acaoSituacao(), fundamentos: null, indicadores: { precoAtual: 10, pl: 8, pvp: 1.2, dy: 0.06 } });
  assert.ok(!av.pontos.some((p) => p.grupo === 'situacao'));
});

// ---------------------------------------------------------------------------
// leitura "Para o seu aporte"
// ---------------------------------------------------------------------------

const metaComFalta = (falta, status = 'atrasada') => ({ id: 'm1', nome: 'Renda passiva', tipo: 'acumulo', status: 'ativa', vinculos: [{ tipo: 'classe', classe: 'acoes', modo: 'total' }], calc: { alvoBRL: 100000, falta, faltaLiquida: falta, status } });

test('leitura: meta atrasada que o ativo serve + fundamentos ok = a favor; macro sozinho nunca decide', () => {
  const base = acaoSituacao();
  const com = avaliarAtivo({ ...base, metas: [metaComFalta(40000)], valorSugerido: 40000 });
  assert.ok(typeof com.nota === 'number');
  assert.equal(com.leitura.nivel, 'favoravel');
  assert.match(com.leitura.texto, /A favor: meta Renda passiva/);
  const soMacro = avaliarAtivo({ ...base, macro: montarMacro(RESPOSTA) });
  assert.equal(soMacro.leitura, null, 'só o contexto de mercado não vira leitura "Para o seu aporte"');
  assert.equal(soMacro.nota, avaliarAtivo(base).nota, 'o contexto de mercado não mexe na nota');
  assert.equal(soMacro.pontos.filter((p) => p.grupo === 'contexto').length, 2);
});

test('leitura: fundamentos fracos ou eliminatório seguram o "a favor" que as metas dariam', () => {
  const pontos = [{ grupo: 'carteira', metaId: 'm1', nome: 'Meta: X', tom: 'bom', peso: 2.5, criterioId: 'meta_completa' }];
  assert.equal(leituraParaVoce(pontos, { nota: 80 }).nivel, 'favoravel');
  const fraco = leituraParaVoce(pontos, { nota: 40 });
  assert.equal(fraco.nivel, 'neutro');
  assert.match(fraco.texto, /Fundamentos abaixo do ideal: as metas sozinhas não bastam/);
  assert.equal(leituraParaVoce(pontos, { nota: 80, eliminatorios: 1 }).nivel, 'cautela');
  assert.equal(leituraParaVoce([], { nota: 80 }), null);
  const macroNeg = [{ grupo: 'contexto', tom: 'atencao', peso: 0.4, pesoFirmado: -0.4 }, { grupo: 'contexto', tom: 'atencao', peso: 0.3, pesoFirmado: -0.3 }];
  assert.notEqual(leituraParaVoce([...macroNeg, { grupo: 'carteira', metaId: 'm1', nome: 'Meta: X', tom: 'neutro', peso: 0, criterioId: 'meta_atingida' }], { nota: 80 }).nivel, 'cautela', 'macro negativo (limitado a -0,5) não vira "Melhor esperar"');
});
