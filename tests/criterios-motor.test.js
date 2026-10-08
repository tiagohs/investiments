// tests/criterios-motor.test.js - 03/10/2026: base normalizada de critérios
// (assets/js/criterios/base-acoes.js, base-fiis.js) e o motor puro
// (criterios/motor.js). Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliarAtivo, classificar, faixaTexto, formatarValor, sinalPrecoMedio, sinaisDeMetas, BASE_CRITERIOS, GRUPOS, abaixoDoBom,
} from '../assets/js/criterios/motor.js';
import { setorDaAcao, REGRAS_ACOES } from '../assets/js/criterios/base-acoes.js';
import { segmentoDoFii, classeDoSegmento, REGRAS_FIIS } from '../assets/js/criterios/base-fiis.js';

const TONS = ['bom', 'neutro', 'atencao', 'ruim'];
const PLACEHOLDERS_OK = new Set(['valor', 'valorAbs', 'faixa', 'ref', 'media', 'teto', 'cdi', 'indice']);
const UNIDADES = new Set(['x', '%', 'pp', 'rel', 'anos', 'n', 'R$', 'pontos', 'bool', 'num']);
const CLASSES_OK = new Set(['acoes_br', 'acoes_int', 'fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof', 'fii_desenvolvimento']);

function conferirFaixas(fx, onde) {
  assert.ok(fx && typeof fx === 'object', `${onde}: faixas`);
  const ints = [];
  for (const tom of Object.keys(fx)) {
    assert.ok(TONS.includes(tom), `${onde}: tom ${tom}`);
    for (const par of fx[tom]) {
      assert.equal(par.length, 2, `${onde}: intervalo [min,max)`);
      const [a, b] = par;
      assert.ok(a === null || Number.isFinite(a), `${onde}: min numérico`);
      assert.ok(b === null || Number.isFinite(b), `${onde}: max numérico`);
      if (a !== null && b !== null) assert.ok(a < b, `${onde}: ${a} < ${b}`);
      ints.push([a === null ? -Infinity : a, b === null ? Infinity : b, tom]);
    }
  }
  ints.sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < ints.length; i++) {
    assert.ok(ints[i - 1][1] <= ints[i][0] + 1e-12, `${onde}: ${ints[i - 1][2]} e ${ints[i][2]} se sobrepõem`);
  }
}

test('base normalizada: esquema único, faixas válidas e sem sobreposição, frases com placeholders conhecidos, fontes com link', () => {
  const todos = [...BASE_CRITERIOS.acoes, ...BASE_CRITERIOS.fiis];
  assert.ok(BASE_CRITERIOS.acoes.length >= 40 && BASE_CRITERIOS.fiis.length >= 25, 'banco largo de critérios');
  const ids = new Set();
  for (const c of todos) {
    assert.ok(!ids.has(c.id), `id repetido ${c.id}`);
    ids.add(c.id);
    for (const campo of ['id', 'nome', 'grupo', 'chave', 'unidade', 'direcao', 'porQue']) assert.equal(typeof c[campo], 'string', `${c.id}.${campo}`);
    assert.ok(c.classes.length && c.classes.every((x) => CLASSES_OK.has(x)), `${c.id}: classes`);
    assert.ok(UNIDADES.has(c.unidade), `${c.id}: unidade ${c.unidade}`);
    assert.ok(['menor', 'maior', 'faixa'].includes(c.direcao), `${c.id}: direção`);
    assert.ok(GRUPOS[c.grupo], `${c.id}: grupo ${c.grupo} tem nome`);
    assert.ok([1, 2, 3].includes(c.peso), `${c.id}: peso`);
    assert.equal(typeof c.eliminatorio, 'boolean');
    conferirFaixas(c.faixas, `${c.id}`);
    if (c.faixasInt) conferirFaixas(c.faixasInt, `${c.id}/EUA`);
    Object.entries(c.faixasPorSetor || {}).forEach(([s, fx]) => conferirFaixas(fx, `${c.id}/${s}`));
    Object.entries(c.faixasPorSegmento || {}).forEach(([s, fx]) => conferirFaixas(fx, `${c.id}/${s}`));
    assert.ok(c.frases && c.frases.bom && c.frases.ruim, `${c.id}: frases bom/ruim`);
    Object.values(c.frases).forEach((f) => {
      for (const m of String(f).matchAll(/\{(\w+)\}/g)) assert.ok(PLACEHOLDERS_OK.has(m[1]), `${c.id}: placeholder {${m[1]}}`);
    });
    assert.ok(c.fontes.length >= 1, `${c.id}: ao menos 1 fonte`);
    c.fontes.forEach((f) => { assert.match(f.url, /^https:\/\//); assert.ok(f.titulo); });
  }
  // nada de dado pessoal na base pública
  const texto = JSON.stringify(todos);
  assert.doesNotMatch(texto, /Tiago/);
  assert.ok(REGRAS_ACOES.length >= 8 && REGRAS_FIIS.length >= 4, 'regras de combinação como funções');
  assert.ok([...REGRAS_ACOES, ...REGRAS_FIIS].every((r) => typeof r === 'function'));
});

test('faixas: classificar [min, max), texto da faixa boa e formatação por unidade', () => {
  const fx = { bom: [[3, 10]], neutro: [[10, 15]], atencao: [[15, 25], [0, 3]], ruim: [[25, null], [null, 0]] };
  assert.equal(classificar(3, fx), 'bom');
  assert.equal(classificar(10, fx), 'neutro', 'max é exclusivo');
  assert.equal(classificar(-2, fx), 'ruim');
  assert.equal(classificar(1, fx), 'atencao');
  assert.equal(classificar(null, fx), null);
  assert.ok(abaixoDoBom(1, fx));
  assert.ok(!abaixoDoBom(30, fx));
  assert.equal(faixaTexto(fx, { unidade: 'x' }), '3x a 10x');
  assert.equal(faixaTexto({ bom: [[0.15, null]] }, { unidade: '%' }), 'a partir de 15%');
  assert.equal(faixaTexto({ bom: [[null, 0.85]] }, { unidade: 'rel' }), '15% ou mais abaixo');
  assert.equal(formatarValor(0.0747, '%', 1), '7,5%');
  assert.equal(formatarValor(1.5, 'rel'), '50% acima');
  assert.equal(formatarValor(0.8, 'rel'), '20% abaixo');
  assert.equal(formatarValor(18800000, 'R$'), 'R$ 18,8 mi');
  assert.equal(formatarValor(0.021, 'pp', 1), '2,1 p.p.');
});

test('setor e segmento da régua: pelo setor/segmento da planilha ou contrato e pelo nome', () => {
  assert.equal(setorDaAcao({ setor: 'Financeiro', nome: 'Banco Exemplo' }), 'bancos');
  assert.equal(setorDaAcao({ setor: 'Financeiro', nome: 'Exemplo Seguridade' }), 'seguradoras');
  assert.equal(setorDaAcao({ setor: 'Financeiro / Bancário', nome: 'Exemplo Bancorp' }), 'bancos');
  assert.equal(setorDaAcao({ setor: 'Utilidade Pública', nome: 'Exemplo Energia' }), 'eletricas_utilities');
  assert.equal(setorDaAcao({ setor: 'Petróleo. Gás e Biocombustíveis' }), 'commodities_ciclicas');
  assert.equal(setorDaAcao({ setor: 'Energia  ' }), 'commodities_ciclicas');
  assert.equal(setorDaAcao({ setor: 'Tecnologia / Internet & E-commerce' }), 'tecnologia_crescimento');
  assert.equal(setorDaAcao({ setor: 'Bens Industriais' }), 'outros');
  assert.equal(segmentoDoFii({ segmento: 'Logística' }), 'logistica');
  assert.equal(segmentoDoFii({ segmento: 'Shopping' }), 'shopping');
  assert.equal(segmentoDoFii({ segmento: 'Títulos e Valores Mobiliários', nome: 'Fundo XYZ Crédito HY' }), 'papel_hy');
  assert.equal(segmentoDoFii({ segmento: 'Títulos e Valores Mobiliários', nome: 'Fundo XYZ Recebíveis' }), 'papel_hg');
  assert.equal(segmentoDoFii({ segmento: 'papel_hg' }), 'papel_hg', 'chave do contrato passa direto');
  assert.equal(segmentoDoFii({ segmento: '', tipo: 'Papel' }), 'papel_hg');
  assert.equal(classeDoSegmento('papel_hy'), 'fii_papel');
  assert.equal(classeDoSegmento('logistica'), 'fii_tijolo');
});

const acaoBase = (extra = {}) => ({
  classe: 'acoes', ticker: 'ABCD3', nome: 'Empresa Exemplo', setor: 'Bens Industriais', moeda: 'BRL', hoje: '2026-10-03',
  indicadores: { precoAtual: 20, precoTeto: 25, dy: 0.08, dyValor: 1.6, pvp: 0.9, pl: 6, ...(extra.indicadores || {}) },
  referencias: { cdi12m: 12 },
  ...extra,
});

test('motor: derivados quando faltam fundamentos (ROE = P/VP ÷ P/L, payout ≈ DY × P/L, earnings yield, Graham, teto, Bazin)', () => {
  const av = avaliarAtivo(acaoBase());
  const v = av.valores;
  assert.ok(Math.abs(v.roe - 0.15) < 1e-9, 'ROE = 0,9 / 6');
  assert.ok(Math.abs(v.payout - 0.48) < 1e-9, 'payout = 8% × 6');
  assert.ok(Math.abs(v.earningsYield - 1 / 6) < 1e-9);
  assert.ok(Math.abs(v.grahamPlPvp - 5.4) < 1e-9);
  assert.equal(v.precoSobreTeto, 0.8);
  assert.ok(Math.abs(v.precoSobreBazin - 20 / (1.6 / 0.06)) < 1e-9);
  const roe = av.pontos.find((p) => p.criterioId === 'roe');
  assert.equal(roe.tom, 'bom');
  assert.equal(roe.derivado, true);
  assert.equal(av.setor, 'outros');
  assert.ok(typeof av.nota === 'number' && av.nota >= 75, `nota ${av.nota}`);
  assert.equal(av.veredito.nivel, 'forte');
  assert.ok(av.pontos.some((p) => p.criterioId === 'combo_pvp_baixo_roe' && p.tom === 'bom'), 'regra: P/VP < 1 com ROE bom');
  assert.ok(av.pontos.some((p) => p.criterioId === 'combo_teto_composto'), 'regra: teto composto Bazin + Graham');
  assert.ok(av.dadosFaltantes.some((d) => d.chave === 'dividaLiquidaEbitda'), 'sem fundamentos: dívida fica nos dados que faltam');
  // ordem por relevância
  for (let i = 1; i < av.pontos.length; i++) assert.ok(av.pontos[i - 1].relevancia >= av.pontos[i].relevancia);
});

test('motor: faixas por setor (banco x padrão) e por segmento de FII', () => {
  const comum = avaliarAtivo(acaoBase({ indicadores: { pl: 9 } }));
  const banco = avaliarAtivo(acaoBase({ nome: 'Banco Exemplo', setor: 'Financeiro', indicadores: { pl: 9 } }));
  assert.equal(comum.pontos.find((p) => p.criterioId === 'pl').tom, 'bom', 'P/L 9: bom na régua padrão (3-10)');
  const plBanco = banco.pontos.find((p) => p.criterioId === 'pl');
  assert.equal(plBanco.tom, 'neutro', 'P/L 9: neutro pra banco (bom 5-8)');
  assert.equal(plBanco.regua, 'bancos');
  assert.match(plBanco.texto, /régua de bancos/);
  assert.ok(!banco.pontos.some((p) => p.criterioId === 'ev_ebitda'), 'EV/EBITDA não se aplica a banco');

  const fii = (segmento) => avaliarAtivo({ classe: 'fiis', ticker: 'ABCD11', segmento, moeda: 'BRL', hoje: '2026-10-03', indicadores: { precoAtual: 90, pvp: 0.75, dy: 0.10 } });
  assert.equal(fii('Lajes Corporativas').pontos.find((p) => p.criterioId === 'fii_pvp').tom, 'bom', 'lajes: bom de 0,70 a 0,95');
  assert.equal(fii('Logística').pontos.find((p) => p.criterioId === 'fii_pvp').tom, 'atencao', 'logística: 0,75 já é desconto com motivo');
  const papel = avaliarAtivo({ classe: 'fiis', ticker: 'ABCD11', segmento: 'Títulos e Valores Mobiliários', nome: 'Exemplo Recebíveis', moeda: 'BRL', hoje: '2026-10-03', indicadores: { precoAtual: 90, pvp: 0.8, dy: 0.13 } });
  assert.equal(papel.classeBase, 'fii_papel');
  assert.ok(papel.pontos.some((p) => p.criterioId === 'combo_papel_desconto' && p.tom === 'atencao'));
  assert.ok(!papel.pontos.some((p) => p.criterioId === 'fii_vacancia_fisica') && !papel.dadosFaltantes.some((d) => d.chave === 'vacanciaFisica'), 'vacância não se aplica a papel');
});

test('motor: sanidade - P/VP 31, P/L 304 e "#DIV/0!" são ignorados com aviso; com fundamentos válidos, usa o contrato', () => {
  const av = avaliarAtivo({ classe: 'acoesEua', ticker: 'ABCD', setor: 'Energia', moeda: 'USD', hoje: '2026-10-03', indicadores: { precoAtual: 10, pvp: 31, pl: 304, dy: '#DIV/0!' } });
  assert.equal(av.valores.pvp, undefined);
  assert.equal(av.valores.pl, undefined);
  assert.equal(av.valores.roe, undefined, 'sem P/VP e P/L confiáveis, não deriva ROE');
  assert.equal(av.avisos.length, 3, av.avisos.join(' | '));
  assert.match(av.avisos.join(' '), /P\/VP de 31,00.*ignorado/);
  assert.match(av.avisos.join(' '), /lucro perto de zero/);
  assert.match(av.avisos.join(' '), /#DIV\/0!/);
  assert.equal(av.veredito.nivel, 'insuficiente');
  assert.equal(av.nota, null);
  const comFund = avaliarAtivo({ classe: 'acoes', ticker: 'ABCD3', moeda: 'BRL', hoje: '2026-10-03', indicadores: { precoAtual: 10, pvp: 31 }, fundamentos: { valores: { pvp: 1.2, roe: 0.18 } } });
  assert.equal(comFund.valores.pvp, 1.2);
  assert.equal(comFund.valores.roe, 0.18, 'ROE do contrato tem prioridade sobre o derivado');
});

test('motor: eliminatório no vermelho limita a nota e vira "Ponto crítico"; regras ajustam a leitura (cíclica, DY armadilha)', () => {
  const ruim = avaliarAtivo(acaoBase({ fundamentos: { valores: { dividaLiquidaEbitda: 5.2, coberturaJuros: 0.8, roe: 0.2 } } }));
  assert.deepEqual(ruim.eliminatoriosAcionados.map((x) => x.criterioId).sort(), ['cobertura_juros', 'divida_liquida_ebitda']);
  assert.ok(ruim.nota <= 40);
  assert.equal(ruim.veredito.nivel, 'alerta');
  assert.equal(ruim.pontos[0].eliminatorio, true, 'eliminatório vem primeiro');

  const ciclica = avaliarAtivo(acaoBase({ setor: 'Mineração', indicadores: { pl: 4 } }));
  const pl = ciclica.pontos.find((p) => p.criterioId === 'pl');
  assert.equal(pl.tom, 'neutro');
  assert.equal(pl.ajustado, true);
  assert.match(pl.texto, /pico do ciclo/);

  const armadilha = avaliarAtivo(acaoBase({ indicadores: { dy: 0.15, pl: 8 } }));
  const dy = armadilha.pontos.find((p) => p.criterioId === 'dy_12m');
  assert.equal(dy.tom, 'atencao');
  assert.match(dy.texto, /payout de 120%/);
});

test('motor: P/L negativo e DY zero usam a frase "do lado de baixo"', () => {
  const av = avaliarAtivo(acaoBase({ indicadores: { pl: -8, dy: 0, dyValor: 0 } }));
  assert.match(av.pontos.find((p) => p.criterioId === 'pl').texto, /prejuízo/);
  assert.match(av.pontos.find((p) => p.criterioId === 'dy_12m').texto, /quase não paga/);
});

test('motor: histórico de preço (volatilidade, queda da máxima, beta) e proventos do FII (oscilação, cortes, DY médio)', () => {
  const hoje = '2026-10-03';
  const historicoPreco = []; const indices = []; const proventos = [];
  const d0 = Date.parse('2024-09-01T12:00:00Z');
  for (let i = 0; i <= 760; i++) {
    const data = new Date(d0 + i * 86400000).toISOString().slice(0, 10);
    const onda = Math.sin(i / 9) * 0.03;
    historicoPreco.push({ data, preco: 100 * (1 + onda) * (i > 600 ? 0.9 : 1) });
    indices.push({ data, ifix: 3000 * (1 + onda / 2), ipca: 100 * (1 + 0.0004 * i) });
  }
  for (let m = 0; m < 25; m++) {
    const mes = new Date(Date.UTC(2024, 8 + m, 15)).toISOString().slice(0, 10);
    proventos.push({ dataPagamento: mes, tipo: 'Rendimento', valorPorCota: m === 20 ? 0.6 : 0.9 });
  }
  const av = avaliarAtivo({ classe: 'fiis', ticker: 'ABCD11', segmento: 'Logística', moeda: 'BRL', hoje, historicoPreco, indices,
    indicadores: { precoAtual: 90, pvp: 0.95, dy: 0.12, proventos }, referencias: { cdi12m: 12 } });
  const v = av.valores;
  assert.ok(v.volatilidade > 0, 'volatilidade');
  assert.ok(v.drawdownAtual < -0.05, 'abaixo da máxima de 12 meses');
  assert.ok(v.beta > 1.5 && v.beta < 2.5, `beta ~2 (o ativo oscila o dobro do índice): ${v.beta}`);
  assert.ok(v.volatilidadeRelativa > 1.5, 'oscila mais que o IFIX');
  assert.equal(v.cortesRendimento, 1, 'um mês com corte > 10%');
  assert.ok(v.cvRendimento > 0 && v.cvRendimento < 0.2);
  assert.equal(v.pctAmortizacao12m, 0);
  assert.ok(v.dySobreMedia > 0, 'DY vs média pelos próprios proventos e preços');
  assert.ok(Math.abs(v.dySobreCdi - 0.12 / (0.12 * 0.85)) < 1e-9, 'DY ÷ CDI líquido');
  assert.ok(typeof v.crescimentoRealRendimento === 'number');
});

test('sinalPrecoMedio: abaixo do PM = bom (baixa o custo médio); acima = neutro; sem posição = nada', () => {
  const bom = sinalPrecoMedio({ precoAtual: 27, precoMedio: 30, quantidade: 10 });
  assert.equal(bom.tom, 'bom');
  assert.equal(bom.texto, 'Preço R$ 27,00 abaixo do seu preço médio R$ 30,00 (−10,0%): aporte baixa seu custo médio');
  assert.equal(bom.peso, 1.5);
  const neutro = sinalPrecoMedio({ precoAtual: 33, precoMedio: 30, quantidade: 10, moeda: 'USD' });
  assert.equal(neutro.tom, 'neutro');
  assert.equal(neutro.peso, 0);
  assert.match(neutro.texto, /^Preço US\$ 33,00 acima do seu preço médio US\$ 30,00 \(\+10,0%\)/);
  assert.equal(sinalPrecoMedio({ precoAtual: 27, precoMedio: 30, quantidade: 0 }), null);
});

const metaReserva = (falta, extra = {}) => ({
  id: 'm1', nome: 'Reserva de emergência', tipo: 'reservaEmergencia', status: 'ativa', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }],
  calc: { alvoBRL: 10000, atualBRL: 10000 - falta, falta, status: falta > 0 ? 'abaixo' : 'saldo-ideal', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total', base: 10000 - falta }], ...extra },
});

test('sinaisDeMetas: falta 800 e o título é Renda Emergencial -> "investir R$ 800 aqui completa a meta"; usa o valor líquido; meta atingida = neutro', () => {
  const s = sinaisDeMetas({ classe: 'rendaFixa', ticker: 'Tesouro Exemplo 2032', marca: 'emergencial', metas: [metaReserva(800)] });
  assert.deepEqual(s.map((x) => [x.tom, x.tipo, x.texto]), [['bom', 'completa', 'Faltam R$ 800,00 pra meta "Reserva de emergência"; investir R$ 800,00 aqui completa a meta']]);
  const liq = sinaisDeMetas({ classe: 'rendaFixa', marca: 'emergencial', metas: [metaReserva(800, { faltaLiquida: 950 })] });
  assert.match(liq[0].texto, /Faltam R\$ 950,00/, 'na reserva vale o líquido (depois do IR)');
  const avanca = sinaisDeMetas({ classe: 'rendaFixa', marca: 'emergencial', metas: [metaReserva(800)], valorSugerido: 300 });
  assert.equal(avanca[0].texto, 'Faltam R$ 800,00 pra meta "Reserva de emergência"; investir R$ 300,00 aqui avança 3% (de 92% para 95%)');
  assert.deepEqual(sinaisDeMetas({ classe: 'rendaFixa', marca: 'longo-prazo', metas: [metaReserva(800)] }), [], 'marca diferente: não vincula');
  assert.deepEqual(sinaisDeMetas({ classe: 'acoes', ticker: 'ABCD3', metas: [metaReserva(800)] }), []);
  const ok = sinaisDeMetas({ classe: 'rendaFixa', marca: 'emergencial', metas: [metaReserva(0)] });
  assert.equal(ok[0].tom, 'neutro');
  assert.match(ok[0].texto, /já atingida/);
  assert.deepEqual(sinaisDeMetas({ classe: 'rendaFixa', marca: 'emergencial', metas: [{ ...metaReserva(800), status: 'pausada' }] }), [], 'meta pausada fica de fora');
  assert.deepEqual(sinaisDeMetas({ classe: 'rendaFixa', marca: 'emergencial', metas: null }), [], 'sem metas: sem sinal');
});

test('sinaisDeMetas: vínculo por ativo (inclusive título de RF), por fração, e renda passiva "cada R$ 1.000 aqui ≈ R$ Y/mês"', () => {
  const porAtivo = { id: 'm2', nome: 'Carro', tipo: 'carro', status: 'ativa', vinculos: [{ tipo: 'ativo', id: 'rf:Tesouro Exemplo 2032|Corretora X@longo-prazo', modo: 'fracao', fracao: 0.5 }],
    calc: { alvoBRL: 5000, falta: 400, status: 'sem-prazo' } };
  const s = sinaisDeMetas({ classe: 'rendaFixa', ticker: 'Tesouro Exemplo 2032', ref: 'rf:Tesouro Exemplo 2032|Corretora X', marca: 'longo-prazo', metas: [porAtivo] });
  assert.equal(s[0].texto, 'Faltam R$ 400,00 pra meta "Carro"; investir R$ 800,00 aqui completa a meta', 'metade do aporte conta pra meta');
  const renda = { id: 'm3', nome: 'Renda passiva', tipo: 'rendaPassiva', status: 'ativa', especificos: { dyAnual: 0.1 }, vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'total' }],
    calc: { renda: { atual: 300, alvo: 500 } } };
  const r1 = sinaisDeMetas({ classe: 'fiis', ticker: 'ABCD11', metas: [renda], dy: 0.12 });
  assert.equal(r1[0].texto, 'Meta "Renda passiva" (faltam R$ 200,00/mês): cada R$ 1.000 aqui ≈ +R$ 10,00/mês (DY 12,0%)');
  const r2 = sinaisDeMetas({ classe: 'fiis', ticker: 'ABCD11', metas: [renda], valorSugerido: 2000 });
  assert.equal(r2[0].texto, 'Meta "Renda passiva" (faltam R$ 200,00/mês): investir R$ 2.000 aqui ≈ +R$ 16,67/mês (DY esperado da meta 10,0%)');
  assert.deepEqual(sinaisDeMetas({ classe: 'acoesEua', ticker: 'ABCD', metas: [renda], dy: 0.03 }), [], 'classe EUA não está no vínculo');
  const usd = sinaisDeMetas({ classe: 'acoesEua', ticker: 'ABCD', metas: [{ ...renda, vinculos: [{ tipo: 'classe', classe: 'usa', modo: 'total' }] }], valorSugerido: 100, moeda: 'USD', cambio: 5, dy: 0.12 });
  assert.match(usd[0].texto, /investir R\$ 500,00 aqui ≈ \+R\$ 5,00\/mês/, 'US$ vira R$ pelo câmbio');
});

// 03/10/2026 (revisão): ação que não paga dividendo (DY conhecido = 0) não pode
// prometer "+R$ X/mês" usando o DY esperado da meta
test('sinaisDeMetas: renda passiva com DY 0 do ativo = neutro "não aumenta a renda" (não usa o DY da meta)', () => {
  const renda = { id: 'm3', nome: 'Renda passiva', tipo: 'rendaPassiva', status: 'ativa', especificos: { dyAnual: 0.06 }, vinculos: [{ tipo: 'classe', classe: 'usa', modo: 'total' }],
    calc: { renda: { atual: 300, alvo: 500 } } };
  const s = sinaisDeMetas({ classe: 'acoesEua', ticker: 'ABCD', metas: [renda], dy: 0 });
  assert.equal(s.length, 1);
  assert.equal(s[0].tom, 'neutro');
  assert.match(s[0].texto, /não pagou proventos.*não aumenta a sua renda passiva/);
  const semDado = sinaisDeMetas({ classe: 'acoesEua', ticker: 'ABCD', metas: [renda], dy: null });
  assert.match(semDado[0].texto, /DY esperado da meta 6,0%/, 'sem DY (dado ausente) continua usando o da meta');
});

test('sinaisDeMetas: viagem com o dinheiro já juntado mas parcelas correndo não diz "já atingida"', () => {
  const v = { id: 'v', nome: 'Viagem', tipo: 'viagemInternacional', status: 'ativa', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'fracao', fracao: 0.1 }],
    calc: { alvoBRL: 3000, falta: 0, status: 'no-ritmo', parcelasCorrendo: 200 } };
  const s = sinaisDeMetas({ classe: 'rendaFixa', marca: 'emergencial', metas: [v] });
  assert.equal(s[0].tom, 'neutro');
  assert.match(s[0].texto, /já está guardado \(só restam as parcelas\)/);
  const fim = sinaisDeMetas({ classe: 'rendaFixa', marca: 'emergencial', metas: [{ ...v, calc: { ...v.calc, parcelasCorrendo: 0 } }] });
  assert.match(fim[0].texto, /já atingida/);
});

test('avaliarAtivo: pontos da carteira (preço médio e metas) entram fora da nota; renda fixa só com eles', () => {
  const base = acaoBase({ carteira: { quantidade: 10, precoMedio: 25 } });
  const sem = avaliarAtivo(acaoBase());
  const com = avaliarAtivo(base);
  assert.equal(com.nota, sem.nota, 'carteira não mexe na nota');
  const pm = com.pontos.find((p) => p.criterioId === 'carteira_preco_medio');
  assert.equal(pm.tom, 'bom');
  assert.equal(pm.grupo, 'carteira');
  // 08/10/2026: e, abaixo do preço médio, "Para ficar no lucro" (informativo, neutro, com o detalhe no "i")
  const lucro = com.pontos.find((p) => p.criterioId === 'carteira_lucro');
  assert.ok(lucro, 'ponto "Para ficar no lucro"');
  assert.equal(lucro.tom, 'neutro');
  assert.equal(lucro.grupo, 'carteira');
  assert.match(lucro.texto, /^(Lucro se a cota subir 10%: compre cerca de \d+ cotas|A cota precisa subir [\d,]+% para você empatar)/);
  assert.match(lucro.ajuda, /para você empatar/);
  assert.equal(com.nota, sem.nota);
  const rf = avaliarAtivo({ classe: 'rendaFixa', ticker: 'Tesouro Exemplo 2032', marca: 'emergencial', metas: [metaReserva(800)] });
  assert.equal(rf.nota, null);
  assert.equal(rf.pontos.length, 1);
  assert.match(rf.pontos[0].texto, /completa a meta\.$/);
  assert.deepEqual(avaliarAtivo({ classe: 'rendaFixa' }).pontos, []);
});
