// tests/criterios-momento.test.js - 03/10/2026: sinais novos do "momento de
// aporte" (aportes-calc!momentoAporte / momento-aporte.js): preço x preço
// médio, metas de Metas e Objetivos e o motor de critérios. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { momentoAporte, entradaMotorDoAporte, marcaRf } from '../assets/js/pages/aportes-calc.js';
import { momentoDoRadar, ativoDoRadar, carregarMetasMomento } from '../assets/js/pages/momento-aporte.js';

const reserva = (falta) => ({
  id: 'r1', nome: 'Reserva de emergência', tipo: 'reservaEmergencia', status: 'ativa', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }],
  calc: { alvoBRL: 20000, atualBRL: 20000 - falta, falta, faltaLiquida: falta, status: 'abaixo', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total', base: 20000 - falta }] },
});
const rendaPassiva = { id: 'p1', nome: 'Renda passiva', tipo: 'rendaPassiva', status: 'ativa', especificos: { dyAnual: 0.1 }, vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'total' }], calc: { renda: { atual: 400, alvo: 500 } } };

test('momento: preço abaixo do preço médio = bom ("aporte baixa seu custo médio"); acima = neutro (não pesa contra)', () => {
  const base = { ticker: 'ABCD3', moeda: 'BRL', precoAtual: 20, precoTeto: 30, quantidade: 10 };
  const abaixo = momentoAporte({ ...base, precoMedio: 22 }, 'acoes');
  assert.ok(abaixo.sinais.some((s) => s.tom === 'bom' && s.texto === 'Preço R$ 20,00 abaixo do seu preço médio R$ 22,00 (−9,1%): aporte baixa seu custo médio'));
  const acima = momentoAporte({ ...base, precoMedio: 15 }, 'acoes');
  const pm = acima.sinais.find((s) => /preço médio/.test(s.texto));
  assert.equal(pm.tom, 'neutro');
  assert.equal(pm.peso, 0);
  assert.match(pm.texto, /acima do seu preço médio R\$ 15,00 \(\+33,3%\)/);
  assert.ok(!momentoAporte({ ...base, precoMedio: 22, quantidade: 0 }).sinais.some((s) => /preço médio/.test(s.texto)), 'sem posição, sem sinal de PM');
});

test('momento RF: título marcado Renda Emergencial e reserva com falta 800 -> "investir R$ 800 aqui completa a meta" (no lugar da linha da planilha)', () => {
  const titulo = { titulo: 'Tesouro Exemplo 2032', instituicao: 'Corretora X', categoria: 'Renda Emergencial', indexador: 'IPCA', vencimento: '2032-08-15' };
  const metasPlanilha = { rfEmergencial: { desejado: 0.2, atual: 0.18, valorInvestir: 1200 } };
  const sem = momentoAporte(titulo, 'rendaFixa', metasPlanilha, '2026-10-03');
  assert.ok(sem.sinais.some((s) => /Reserva de emergência abaixo da meta/.test(s.texto)), 'sem Metas e Objetivos, fica a linha da planilha');
  const m = momentoAporte(titulo, 'rendaFixa', metasPlanilha, '2026-10-03', { metasObjetivos: [reserva(800)] });
  assert.ok(m.sinais.some((s) => s.tom === 'bom' && s.texto === 'Faltam R$ 800,00 pra meta "Reserva de emergência"; investir R$ 800,00 aqui completa a meta'));
  assert.ok(!m.sinais.some((s) => /Reserva de emergência abaixo da meta/.test(s.texto)), 'sem repetir a mesma informação');
  const noCarrinho = momentoAporte(titulo, 'rendaFixa', null, '2026-10-03', { metasObjetivos: [reserva(800)], valorSugerido: 200 });
  assert.ok(noCarrinho.sinais.some((x) => /investir R\$ 200,00 aqui avança 1% \(de 96% para 97%\)/.test(x.texto)));
  // 05/10/2026: IPCA+ na reserva oscila (marcação a mercado) - o título "não combina" com a meta, mesmo com a reserva abaixo do ideal
  assert.ok(m.sinais.some((x) => x.tom === 'ruim' && /Não combina com a meta "Reserva de emergência": IPCA\+ oscila/.test(x.texto)));
  const atingida = momentoAporte(titulo, 'rendaFixa', null, '2026-10-03', { metasObjetivos: [reserva(0)] });
  assert.ok(atingida.sinais.some((s) => s.tom === 'neutro' && /já atingida - prefira outra meta/.test(s.texto)));
  const longo = momentoAporte({ ...titulo, categoria: 'Longo prazo' }, 'rendaFixa', null, '2026-10-03', { metasObjetivos: [reserva(800)] });
  assert.ok(!longo.sinais.some((s) => /Reserva/.test(s.texto)), 'longo prazo não entra na reserva');
  assert.equal(marcaRf({ categoria: 'Renda Emergencial' }), 'emergencial');
  assert.equal(marcaRf({ categoria: 'Renda Fixa' }), 'longo-prazo');
});

test('momento: renda passiva usa o "R$ a investir" do Radar como valor sugerido', () => {
  const fii = { ticker: 'ABCD11', moeda: 'BRL', precoAtual: 95, precoTeto: 100, radar: { percentualDesejado: 0.1, percentualAtual: 0.05, valorInvestir: 1500, pvp: 0.95 } };
  const m = momentoAporte(fii, 'fiis', null, '', { metasObjetivos: [rendaPassiva] });
  assert.ok(m.sinais.some((s) => s.texto === 'Meta "Renda passiva" (faltam R$ 100,00/mês): investir R$ 1.500 aqui ≈ +R$ 12,50/mês (DY esperado da meta 10,0%)'));
  assert.ok(!momentoAporte(fii, 'fiis').sinais.some((s) => /Meta/.test(s.texto)), 'sem metas carregadas: sem sinal de meta');
});

test('momento: sinais do motor - nota com 5+ critérios, eliminatório pesa contra e nunca deixa ser "Bom momento"', () => {
  const a = { ticker: 'ABCD3', nome: 'Empresa Exemplo', moeda: 'BRL', precoAtual: 20, precoTeto: 30, dy: 0.08, dyValor: 1.6,
    radar: { percentualDesejado: 0.1, percentualAtual: 0.02, valorInvestir: 3000, pvp: 0.9, pl: 6 } };
  const e = entradaMotorDoAporte(a, 'acoes');
  assert.equal(e.indicadores.pvp, 0.9, 'P/VP e P/L vêm do Radar quando o item não tem');
  const m = momentoAporte(a, 'acoes');
  const nota = m.sinais.find((s) => /^Fundamentos: nota/.test(s.texto));
  assert.ok(nota, m.sinais.map((s) => s.texto).join(' | '));
  assert.equal(nota.tom, 'bom');
  assert.equal(m.nivel, 'bom');
  const comAlerta = momentoAporte({ ...a, fundamentos: { valores: { dividaLiquidaEbitda: 6, roe: 0.15 } } }, 'acoes');
  assert.ok(comAlerta.sinais.some((s) => s.tom === 'ruim' && /^Alerta: Dívida líquida de 6,0x o EBITDA/.test(s.texto)));
  assert.notEqual(comAlerta.nivel, 'bom', 'eliminatório no vermelho tira o "Bom momento"');
  const pouco = momentoAporte({ ticker: 'X', moeda: 'BRL', precoAtual: 10, precoTeto: 12 }, 'acoes');
  assert.ok(!pouco.sinais.some((s) => /Fundamentos: nota/.test(s.texto)), 'com poucos dados, sem nota');
});

test('Radar: item vira ativo com segmento/tipo/fundamentos e o momento recebe as metas de Metas e Objetivos', () => {
  const item = { ativo: 'ABCD11', precoAtual: 95, precoTeto: 100, precoMedio: 98, carteiraAtual: 1000, pvp: 0.95, tipo: 'Tijolo', segmento: 'Logística',
    percentualDesejado: 0.1, percentualAtual: 0.05, valorInvestir: 1500, ranking: 1, fundamentos: { valores: { vacanciaFisica: 0.02 } } };
  const a = ativoDoRadar(item, 'fiis');
  assert.equal(a.segmento, 'Logística');
  assert.equal(a.radar.tipo, 'Tijolo');
  assert.deepEqual(a.fundamentos, { valores: { vacanciaFisica: 0.02 } });
  const m = momentoDoRadar(item, 'fiis', null, [item], { metasObjetivos: [rendaPassiva] });
  assert.ok(m.sinais.some((s) => /Meta "Renda passiva"/.test(s.texto)));
  assert.ok(m.sinais.some((s) => s.tom === 'bom' && /abaixo do seu preço médio/.test(s.texto)));
});

test('carregarMetasMomento: cache na hora + resposta nova; falha = sem metas (null)', async () => {
  const chamadas = [];
  const resposta = { ok: true, metas: [{ id: 'x', nome: 'Reserva', tipo: 'reservaEmergencia', status: 'ativa', vinculos: [], especificos: { meses: 6, despesaMensal: 1000, usarDespesasPlanilha: false } }], ativos: [], hoje: '2026-10-03' };
  const metas = await carregarMetasMomento('tk', {
    getMetasImpl: async () => resposta,
    lerCache: async () => ({ dados: resposta }),
    gravarCache: () => {},
    aoChegar: (m) => chamadas.push(m.length),
  });
  assert.deepEqual(chamadas, [1, 1], 'cache e depois a resposta');
  assert.ok(metas[0].calc && metas[0].calc.alvoBRL === 6000);
  const falhou = await carregarMetasMomento('tk', { getMetasImpl: async () => ({ ok: false }), lerCache: async () => null, gravarCache: () => {} });
  assert.equal(falhou, null);
});
