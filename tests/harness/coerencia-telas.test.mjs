// tests/harness/coerencia-telas.test.mjs
//
// 06/10/2026 (auditoria A-72): COERÊNCIA ENTRE TELAS. Os achados A-10 a A-17 (reserva bruta x líquida, vínculo duplicado
// entre metas, janelas de "12 meses" diferentes, aliases de ticker...) passaram na suíte porque cada teste olhava uma tela
// só. Aqui as telas rodam JUNTAS, com os dados reais da planilha (fixtures.json), e se comparam as grandezas que DEVEM
// bater entre elas:
//   - patrimônio de hoje: Início (home) x Carteiras x Organização (patrimônio/despesas/salário) x Distribuição e Metas x Metas;
//   - reserva de emergência: bruto x líquido (E19 x IR/IOF) em Distribuição e Metas, Metas, Organização;
//   - proventos em 12 meses: mesma janela e mesmo rótulo (Proventos.gs!janelaProventos_) em todas as telas;
//   - metas: "já guardado" <= o que existe pra vincular; cada ativo conta numa meta só; vínculos órfãos; aliases de ticker;
//   - aux_historico-patrimonio / renda fixa sem linha duplicada;
//   - orçamento de leitura por ação (células, leituras, bytes) - teto = o medido em 06/10/2026 + 20% de folga.
// O relógio dos .gs é congelado no dia em que fixtures.json foi extraído (_meta.extraidoEm): o resultado não muda com o dia.
// Nada de número real aqui: só relações (a = b) e tetos relativos. Sem fixtures.json o arquivo é pulado (ou falha em CI_ESTRITO=1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exigirFixtures } from './fixtures-exigidas.mjs';
import { medirAcao, sandboxDasTelas } from './medir-acao.mjs';
import { instanteDasFixtures } from './gas-vm-harness.mjs';

const ABAS = ['aux_historico-patrimonio', 'Auxiliar_ativos', 'Transações', 'Proventos'];
const CENTAVOS = 0.05; // somas de ~40 ativos arredondados 1 a 1 em cada tela

function perto(nome, a, b, tol = CENTAVOS) {
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return `${nome}: valor ausente ou não numérico (${a} x ${b})`;
  return Math.abs(a - b) <= tol ? null : `${nome}: ${a} x ${b} (diferença ${(a - b).toFixed(4)})`;
}
const soma = (xs) => xs.reduce((s, x) => s + (Number(x) || 0), 0);
const so = (msgs) => msgs.filter(Boolean);

// 1 sandbox por processo: as ações abaixo só LEEM (a prévia grava em memória, e nenhuma delas grava). Montado sob demanda.
let _telas = null;
function telas() {
  if (_telas) return _telas;
  const { sb, chamar } = sandboxDasTelas();
  const r = {};
  for (const a of ['home', 'carteirasHome', 'carteirasAcoes', 'carteirasFiis', 'carteirasAcoesEua', 'carteirasRendaFixa', 'patrimonio', 'despesas', 'salario', 'distribuicoesMetas', 'metas', 'proventos', 'meusAtivos']) {
    r[a] = chamar(a);
    assert.equal(r[a].ok, true, `ação "${a}" devolveu ${JSON.stringify(r[a]).slice(0, 200)}`);
  }
  _telas = { sb, chamar, ...r };
  return _telas;
}

test('o "hoje" das telas é o mesmo dia em todas as ações (fuso de São Paulo)', (t) => {
  if (!exigirFixtures(t, ABAS)) return;
  const x = telas();
  const hoje = x.sb.hojeSP_();
  assert.equal(hoje, x.sb.diaSP_(new Date(instanteDasFixtures())), 'relógio congelado no dia da extração');
  assert.deepEqual([x.metas.hoje, x.proventos.hoje, x.patrimonio.hoje].map((d) => String(d).slice(0, 10)), [hoje, hoje, hoje]);
});

test('patrimônio de hoje: Início = soma das classes = Carteiras = Organização (patrimônio, despesas, salário) = Distribuição e Metas = soma dos ativos das Metas', (t) => {
  if (!exigirFixtures(t, ABAS)) return;
  const x = telas();
  const total = x.home.patrimonio.total;
  const pc = x.home.patrimonio.porClasse;
  assert.deepEqual(so([
    perto('Início: total x soma das 4 classes', total, pc.acoes + pc.fiis + pc.acoesEua + pc.rendaFixa),
    perto('Início: longo prazo + reserva = total', x.home.patrimonio.longoPrazo + x.home.patrimonio.rendaEmergencial, total),
    perto('Carteiras (home): patrimonioTotal', x.carteirasHome.carteiras.patrimonioTotal, total),
    perto('Carteiras (home): soma dos 4 cards', soma(x.carteirasHome.carteiras.cards.map((c) => c.totalAtualizado)), total, 0.1),
    perto('Carteiras Ações: card x tela da classe', x.carteirasHome.carteiras.cards[0].totalAtualizado, x.carteirasAcoes.carteira.resumo.totalAtualizado),
    perto('Carteiras FIIs: card x tela da classe', x.carteirasHome.carteiras.cards[1].totalAtualizado, x.carteirasFiis.carteira.resumo.totalAtualizado),
    perto('Carteiras Renda Fixa: card x tela da classe', x.carteirasHome.carteiras.cards[3].totalAtualizado, x.carteirasRendaFixa.carteira.resumo.totalAtualizado),
    perto('Início: Ações x tela de Ações', pc.acoes, x.carteirasAcoes.carteira.resumo.totalAtualizado),
    perto('Início: FIIs x tela de FIIs', pc.fiis, x.carteirasFiis.carteira.resumo.totalAtualizado),
    perto('Início: Renda Fixa x tela de Renda Fixa', pc.rendaFixa, x.carteirasRendaFixa.carteira.resumo.totalAtualizado),
    perto('Organização/Patrimônio: investimentos.total', x.patrimonio.investimentos.total, total),
    perto('Organização/Patrimônio: longo prazo', x.patrimonio.investimentos.longoPrazo, x.home.patrimonio.longoPrazo),
    perto('Organização/Despesas: patrimônio.atual', x.despesas.patrimonio.atual, total),
    perto('Organização/Salário: patrimônio.atual', x.salario.patrimonio.atual, total),
    perto('Distribuição e Metas: patrimônio.carteiraAtual', x.distribuicoesMetas.metas.patrimonio.carteiraAtual, total),
    perto('Metas: soma do valor dos ativos vinculáveis', soma(x.metas.ativos.map((a) => a.valorBRL)), total, 0.5),
  ]), []);
});

// 08/10/2026: a conta de "quantas cotas pra ficar no lucro" do Radar usa a quantidade das abas Carteira - a mesma das telas de Carteiras
test('Radar (Acompanhamento de Ativos): a quantidade de cada ativo é a mesma das Carteiras (Ações, FIIs, EUA)', (t) => {
  if (!exigirFixtures(t, ABAS)) return;
  const x = telas();
  const pares = [['acoesNacionais', 'carteirasAcoes'], ['fiis', 'carteirasFiis'], ['acoesInternacionais', 'carteirasAcoesEua']];
  const erros = [];
  let comparados = 0;
  for (const [bloco, tela] of pares) {
    const qtd = new Map((x[tela].carteira.ativos || []).map((a) => [a.ticker, a.quantidade]));
    for (const it of x.distribuicoesMetas.radar[bloco].itens || []) {
      if (!qtd.has(it.ativo) || !(qtd.get(it.ativo) > 0)) continue;
      comparados += 1;
      erros.push(perto(`${bloco} ${it.ativo}: quantidade`, it.quantidade, qtd.get(it.ativo), 1e-6));
    }
  }
  assert.ok(comparados > 0, 'nenhum ativo do Radar casou com as Carteiras');
  assert.deepEqual(so(erros), []);
});

test('reserva de emergência: bruto igual em todas as telas; líquido = bruto - IR/IOF estimados (e é o que Distribuição e Metas usa)', (t) => {
  if (!exigirFixtures(t, ABAS)) return;
  const x = telas();
  const emergenciais = x.metas.ativos.filter((a) => a.classe === 'rf' && a.marca === 'emergencial');
  assert.ok(emergenciais.length > 0, 'a planilha não tem título marcado como Renda Emergencial - o teste perdeu o sentido');
  const bruto = x.home.patrimonio.rendaEmergencial;
  const imposto = soma(emergenciais.map((a) => ((a.irResgate && a.irResgate.ir) || 0) + ((a.irResgate && a.irResgate.iof) || 0)));
  const re = x.distribuicoesMetas.metas.rendaEmergencial;
  assert.deepEqual(so([
    perto('Metas: soma dos títulos da reserva x Início', soma(emergenciais.map((a) => a.valorBRL)), bruto),
    perto('Distribuição e Metas: carteiraBruta (E19)', re.carteiraBruta, bruto),
    perto('Metas: referencias.reserva.atual', x.metas.referencias.reserva.atual, bruto),
    perto('Organização/Despesas: reserva.atual', x.despesas.reserva.atual, bruto),
    perto('Organização/Patrimônio: investimentos.reserva', x.patrimonio.investimentos.reserva, bruto),
    perto('Organização/Patrimônio: metas.reservaAtual', x.patrimonio.metas.reservaAtual, bruto),
    perto('Organização/Salário: despesas.reservaAtual', x.salario.despesas.reservaAtual, bruto),
    perto('Distribuição e Metas: impostoEstimado x IR+IOF dos títulos', re.impostoEstimado, imposto),
    perto('Distribuição e Metas: carteiraAtual = bruta - imposto', re.carteiraAtual, Math.max(0, bruto - imposto)),
    perto('Metas: reserva (mesma meta) x meta de Distribuição e Metas', x.metas.referencias.reserva.meta, re.meta),
  ]), []);
  assert.equal(re.base, 'liquido', 'com estimativa de IR/IOF a base da reserva é o líquido');
  assert.ok(re.carteiraAtual <= re.carteiraBruta, 'líquido nunca passa do bruto');
  const meta = x.metas.metas.find((m) => m.tipo === 'reservaEmergencia');
  if (meta) assert.deepEqual(so([perto('meta de reserva: valor vinculado (bruto; o líquido sai do IR dos títulos)', meta.progresso.valorVinculado, bruto)]), []);
});

test('proventos em 12 meses: Distribuição e Metas, Metas e Proventos usam a mesma janela (12 meses fechados), com o mesmo rótulo e o mesmo total', (t) => {
  if (!exigirFixtures(t, ABAS)) return;
  const x = telas();
  const hoje = x.sb.hojeSP_();
  const janela = x.sb.janelaProventos_(hoje, 'fechados', 12);
  const rec = x.sb.recebidosComPresumidos_(x.proventos);
  const ref = x.sb.somarProventosJanela_(rec, hoje, 'fechados', 12);
  const rp = x.distribuicoesMetas.metas.rendaPassiva;
  assert.deepEqual(rp.mesesMedia, { inicio: janela.inicio, fim: janela.fim, rotulo: janela.rotulo });
  assert.equal(ref.rotulo, janela.rotulo);
  assert.deepEqual({ inicio: x.metas.proventos12m.inicio, fim: x.metas.proventos12m.fim }, { inicio: janela.inicio, fim: janela.fim });
  assert.deepEqual(so([
    perto('Distribuição e Metas: total12Meses x conta única (somarProventosJanela_)', rp.total12Meses, ref.total, 0.01),
    perto('Distribuição e Metas: confirmado + presumido = total', rp.confirmado12Meses + rp.presumido12Meses, rp.total12Meses, 0.01),
    perto('Distribuição e Metas: média = total / 12', rp.mediaUlt12Meses, rp.total12Meses / 12, 0.01),
    perto('Metas: soma de proventos12m.porTicker x total', soma(Object.values(x.metas.proventos12m.porTicker)), ref.total, 0.01 * (1 + Object.keys(x.metas.proventos12m.porTicker).length)),
  ]), []);
});

// A-17 (corrigido em 06/10/2026) em Patrimonio.gs!montarTelaPatrimonio_ — antes: `proventos12m` usa janela de 365 dias corridos e só os lançados
// (sem os presumidos), enquanto o resto do app usa janelaProventos_ ('fechados'). Num dia no meio do mês as duas contas
// diferem em até ~6% (medido em 06/10/2026 com datas congeladas em set/jul/mar de 2026). `todo` = aparece no relatório
// sem reprovar a suíte; quando o .gs passar a usar a janela única, este teste passa sozinho e o `todo` sai.
for (const dia of [null, '2026-09-20', '2026-07-15', '2026-03-10']) {
  test(`proventos em 12 meses na aba Patrimônio da Organização = mesma conta das outras telas${dia ? ` (relógio em ${dia})` : ' (dia da extração)'}`, (t) => {
    if (!exigirFixtures(t, ABAS)) return;
    const { sb, chamar } = dia ? sandboxDasTelas({ agora: Date.parse(`${dia}T15:00:00Z`) }) : sandboxDasTelas();
    const pat = chamar('patrimonio');
    const prov = chamar('proventos');
    const ref = sb.somarProventosJanela_(sb.recebidosComPresumidos_(prov), sb.hojeSP_(), 'fechados', 12);
    assert.deepEqual(so([perto(`Patrimônio.proventos12m x janela "${ref.rotulo}" (${ref.inicio} a ${ref.fim})`, pat.proventos12m, ref.total, 0.01)]), []);
  });
}

test('metas: "já guardado" nunca passa do que existe pra vincular e cada ativo conta numa meta só (por ativo, por classe, por marca e no total)', (t) => {
  if (!exigirFixtures(t, ABAS)) return;
  const x = telas();
  const ativos = x.metas.ativos;
  const porId = new Map(ativos.map((a) => [a.id, a]));
  const ativas = x.metas.metas.filter((m) => m.progresso);
  // 07/10/2026: reserva e renda passiva DIVIDEM os ativos com a aposentadoria (mesma carteira): lado 'div' x lado 'apos'
  const ladoDe = (m) => (m.tipo === 'aposentadoria' ? 'apos' : (m.tipo === 'reservaEmergencia' || m.tipo === 'rendaPassiva' ? 'div' : 'outros'));
  const vinc = ativas.flatMap((m) => (m.progresso.vinculos || []).map((v) => ({ ...v, lado: ladoDe(m), meta: `${m.tipo}${m.nome ? ` "${m.nome}"` : ''}` })));
  const msgs = [];
  const T = 0.011;

  // 06/10/2026 (Tiago: "a única exceção de ter os mesmos ativos em duas metas seria Renda Emergencial e Patrimônio"): a reserva e a
  // aposentadoria podem contar o MESMO dinheiro; 07/10/2026: a renda passiva também. O total pode passar do que existe em até
  // o que esse lado ("div") pegou
  const compartilhado = soma(ativas.filter((m) => ladoDe(m) === 'div').map((m) => m.progresso.valorVinculado));

  // total: soma do "já guardado" de todas as metas <= (ativos vinculáveis + saldos avulsos das próprias metas)
  const saldos = soma(vinc.filter((v) => v.tipo === 'saldo').map((v) => v.valorBRL));
  const vinculavel = soma(ativos.map((a) => a.valorBRL));
  const guardado = soma(ativas.map((m) => m.progresso.valorVinculado)) - compartilhado;
  if (guardado > vinculavel + saldos + 0.5) msgs.push(`total: as metas somam ${guardado.toFixed(2)} guardados, mais do que existe (${vinculavel.toFixed(2)} em ativos + ${saldos.toFixed(2)} em saldos)`);
  ativas.forEach((m) => {
    const s = soma((m.progresso.vinculos || []).map((v) => v.valorBRL));
    if (Math.abs(s - m.progresso.valorVinculado) > T * Math.max(1, (m.progresso.vinculos || []).length)) msgs.push(`meta ${m.tipo}: valorVinculado ${m.progresso.valorVinculado} x soma dos vínculos ${s.toFixed(2)}`);
  });

  // por ativo / classe / marca: o que as metas pegam de um grupo não passa do grupo
  // cada chave soma por lado; o pego é outros + max(div, apos) (o lado dividido não conta em dobro)
  const pegoPorId = new Map(), pegoPorClasse = new Map(), pegoPorMarca = new Map();
  const somaEm = (mapa, k, v, lado) => { const x = mapa.get(k) || { outros: 0, div: 0, apos: 0 }; x[lado] += v; mapa.set(k, x); };
  for (const v of vinc) {
    if (v.tipo === 'ativo' && v.id != null) { somaEm(pegoPorId, v.id, v.valorBRL, v.lado); const a = porId.get(v.id); if (a) somaEm(pegoPorClasse, a.classe, v.valorBRL, v.lado); }
    else if (v.tipo === 'classe') somaEm(pegoPorClasse, v.classe, v.valorBRL, v.lado);
    else if (v.tipo === 'marca') somaEm(pegoPorMarca, v.marca, v.valorBRL, v.lado);
  }
  const efetivo = (x) => x.outros + Math.max(x.div, x.apos);
  [pegoPorId, pegoPorClasse, pegoPorMarca].forEach((mapa) => mapa.forEach((x, k) => mapa.set(k, efetivo(x))));
  for (const [id, pego] of pegoPorId) { const a = porId.get(id); if (a && pego > a.valorBRL + T) msgs.push(`ativo "${id}": as metas pegam ${pego.toFixed(2)} de um ativo de ${a.valorBRL} (conta em mais de uma meta)`); }
  for (const [c, pego] of pegoPorClasse) { const tot = soma(ativos.filter((a) => a.classe === c).map((a) => a.valorBRL)); if (pego > tot + 0.5) msgs.push(`classe "${c}": as metas pegam ${pego.toFixed(2)} de ${tot.toFixed(2)}`); }
  for (const [m, pego] of pegoPorMarca) { const tot = soma(ativos.filter((a) => a.marca === m).map((a) => a.valorBRL)); if (pego > tot + 0.5) msgs.push(`marca "${m}": as metas pegam ${pego.toFixed(2)} de ${tot.toFixed(2)}`); }
  for (const v of vinc) if (v.valorBRL > v.pretendidoBRL + T) msgs.push(`meta ${v.meta}: vínculo pegou ${v.valorBRL} mas pretendia só ${v.pretendidoBRL}`);

  assert.deepEqual(msgs, []);
});

test('metas: nenhum vínculo órfão (todo ativo/classe/marca vinculado existe) e os vínculos a ticker antigo acham o ativo atual pelo alias', (t) => {
  if (!exigirFixtures(t, ABAS)) return;
  const x = telas();
  const orfaos = x.metas.metas.flatMap((m) => (m.progresso.vinculos || []).filter((v) => v.encontrado === false)
    .map((v) => `meta ${m.tipo}: vínculo ${v.tipo} ${v.id || v.classe || v.marca} sem ativo correspondente`));
  assert.deepEqual(orfaos, []);
  // ativo vinculado pelo ticker antigo (aliasesTicker) tem que achar o ativo pelo ticker novo
  const ids = new Set(x.metas.ativos.map((a) => a.id));
  for (const [antigo, novo] of Object.entries(x.metas.aliasesTicker)) {
    assert.equal(x.sb.resolverAliasTicker_(antigo), novo, `resolverAliasTicker_(${antigo})`);
    assert.equal(ids.has(antigo), false, `o ativo atual não pode ter o ticker antigo ${antigo} (a posição vive em ${novo})`);
  }
});

test('aliases de ticker: renomeações/incorporações sem cadeia nem ciclo, e a Início/Metas usam a mesma tabela do .gs', (t) => {
  if (!exigirFixtures(t, ABAS)) return;
  const x = telas();
  const tabela = {};
  (x.sb.RENOMEACOES_TICKER_ || []).forEach((r) => { tabela[r.antigo] = r.novo; });
  const msgs = [];
  for (const [antigo, novo] of Object.entries(x.metas.aliasesTicker)) {
    if (antigo === novo) msgs.push(`${antigo}: alias pra ele mesmo`);
    if (x.metas.aliasesTicker[novo]) msgs.push(`${antigo} -> ${novo} -> ${x.metas.aliasesTicker[novo]}: cadeia de aliases (resolva direto pro último)`);
    if (x.sb.resolverAliasTicker_(x.sb.resolverAliasTicker_(antigo)) !== x.sb.resolverAliasTicker_(antigo)) msgs.push(`${antigo}: resolverAliasTicker_ não é idempotente`);
  }
  for (const [antigo, novo] of Object.entries(tabela)) if (x.metas.aliasesTicker[antigo] !== novo) msgs.push(`RENOMEACOES_TICKER_ tem ${antigo} -> ${novo} mas a tela de Metas não devolve esse alias`);
  assert.deepEqual(msgs, []);
  // todo provento (R$ ou US$) de ticker antigo passa a contar no ativo atual: nenhum recebido da tela Proventos fica com ticker antigo SEM resolução
  const tickersAtuais = new Set(x.home.ativos.map((a) => a.ticker));
  const semDono = [...new Set(x.proventos.recebidos.map((p) => x.sb.resolverAliasTicker_(p.ticker)))].filter((tk) => !tickersAtuais.has(tk));
  t.diagnostic(`${semDono.length} ticker(s) com provento recebido mas fora da carteira de hoje (posição vendida ou sem lançamento): normal se já vendeu`);
});

test('aux_historico-patrimonio, aux_historico-renda-fixa e aux_historico-indices não têm linha duplicada (mesmo dia + mesmo ativo/índice)', (t) => {
  if (!exigirFixtures(t, ABAS.concat(['aux_historico-renda-fixa', 'aux_historico-indices']))) return;
  const x = telas();
  const ss = x.sb.SpreadsheetApp.getActiveSpreadsheet();
  const duplicadas = (nomeAba, colunas, chave) => {
    const aba = ss.getSheetByName(nomeAba);
    const linhas = aba.getRange(2, 1, Math.max(0, aba.getLastRow() - 1), colunas).getValues();
    const vistas = new Map();
    linhas.forEach((l, i) => {
      if (!(l[0] instanceof x.sb.Date)) return;
      const k = chave(l);
      if (!k) return;
      vistas.set(k, (vistas.get(k) || []).concat(i + 2));
    });
    return [...vistas.entries()].filter(([, ls]) => ls.length > 1).map(([k, ls]) => `${nomeAba}: "${k}" nas linhas ${ls.slice(0, 5).join(', ')}${ls.length > 5 ? '...' : ''}`);
  };
  const dia = (d) => x.sb.chaveDiaISOInicio_(d);
  assert.deepEqual([
    ...duplicadas('aux_historico-patrimonio', 8, (l) => `${dia(l[0])} ${l[1]}`),
    ...duplicadas('aux_historico-renda-fixa', 6, (l) => `${dia(l[0])} ${l[1]} ${l[2]}`),
    ...duplicadas('aux_historico-indices', 3, (l) => `${dia(l[0])} ${l[1]}`),
  ], []);
});

// ---------------------------------------------------------------------------------------------------------------------
// Orçamento de leitura por ação: o que cada ação lê da planilha a frio e o tamanho da resposta. Os números "medidos" são os
// de 06/10/2026 (fixtures do Controle 16); o teto é medido + 20%. Estourou = alguém passou a ler/mandar mais - ou os dados
// cresceram: confira com `node tests/harness/coerencia-telas.test.mjs --medir` (imprime a tabela) e atualize COM motivo.
// Metas da auditoria (aspiracionais, ainda não atingidas): distribuicoesMetas <= 15 leituras, home <= 400 mil células e
// 200 KB de resposta, gastos <= 200 KB - os tetos abaixo travam o ponto de partida pra não piorar.
// ---------------------------------------------------------------------------------------------------------------------
const FOLGA = 1.2;
const MEDIDO = {
  //                         células  leituras getValue  bytes    parâmetros
  home:                 { celulas: 269060, getValues: 31, getValue: 3, bytes: 1851834 },
  ativo:                { celulas: 269696, getValues: 33, getValue: 0, bytes: 296504, params: { ref: 'PETR4' } },
  proventos:            { celulas: 158712, getValues: 24, getValue: 0, bytes: 99261 },
  // 06/10/2026 (o5-objetivos): +6 leituras do "atual" da meta Distribuição da carteira (4 blocos B:E + posição do bloco de FIIs) e, SÓ no cold da
  // 1ª leitura, a migração única que cria a meta a partir dos % da planilha (~+9). Em regime a ação lê ~50.
  metas:                { celulas: 247692, getValues: 50, getValue: 9, bytes: 22409 },
  metasHistorico:       { celulas: 273021, getValues: 37, getValue: 0, bytes: 14003 },
  distribuicoesMetas:   { celulas: 249120, getValues: 51, getValue: 8, bytes: 37634 },
  // patrimonio/despesas remedidos com o Controle 17 (06/10/2026): o CÓDIGO é o mesmo (com as fixtures do Controle 16 deram 274.213 células/41 leituras/30,4 KB e 126/2/3,1 KB); a planilha ganhou
  // as abas aux_patrimonio-indices (224 linhas de FipeZap/IVG-R: a resposta "indices" foi de 0,1 KB pra 8,5 KB, +2 leituras) e aux_historico-despesas (4 linhas: +1 leitura). Dado cresceu, não é regressão.
  patrimonio:           { celulas: 274885, getValues: 44, getValue: 3, bytes: 38774 },
  salario:              { celulas: 273103, getValues: 39, getValue: 1, bytes: 7035 },
  despesas:             { celulas: 158, getValues: 3, getValue: 1, bytes: 3633 },
  gastos:               { celulas: 74572, getValues: 2, getValue: 0, bytes: 284459 },
  meusAtivos:           { celulas: 83681, getValues: 5, getValue: 1, bytes: 12991 },
  carteirasHome:        { celulas: 204200, getValues: 14, getValue: 2, bytes: 1164 },
  carteirasAcoes:       { celulas: 28015, getValues: 7, getValue: 2, bytes: 7366 }, // 07/10/2026: +2 leituras - o destino de cada título da Renda Fixa (reserva/longo prazo/objetivo) vem da coluna B da Carteira RF (Home.gs, Planilha.gs!somarCarteiraRendaFixaPorDestino_)
  carteirasFiis:        { celulas: 30117, getValues: 8, getValue: 2, bytes: 5889 },
  carteirasAcoesEua:    { celulas: 147936, getValues: 8, getValue: 2, bytes: 4149 },
  // 07/10/2026: remedido com o Controle 24 - o mesmo código; a planilha ganhou o fundo DI completo na Carteira RF (título com cota/CDI do fundo): +3 KB. Dado cresceu, não é regressão.
  carteirasRendaFixa:   { celulas: 29227, getValues: 6, getValue: 0, bytes: 13268 },
};
const teto = (n) => Math.ceil(n * FOLGA);

for (const [acao, m] of Object.entries(MEDIDO)) {
  test(`orçamento de leitura: ação "${acao}" a frio lê <= ${teto(m.celulas).toLocaleString('pt-BR')} células em <= ${teto(m.getValues)} leituras (+ <= ${teto(m.getValue)} de 1 célula) e responde <= ${Math.ceil(teto(m.bytes) / 1024)} KB`, (t) => {
    if (!exigirFixtures(t, ABAS)) return;
    const r = medirAcao(acao, m.params || {});
    assert.equal(r.resp.ok, true, JSON.stringify(r.resp).slice(0, 200));
    assert.equal(r.leiturasGrandesDeLancamentos, 0, 'leitura de mais de 2.000 linhas em Transações/USA/RF/Carteira RF (as abas têm ~10.800 linhas de fórmula)');
    t.diagnostic(`${acao}: ${r.celulas} células, ${r.getValues} leituras, ${r.getValue} de 1 célula, ${r.bytes} bytes`);
    assert.deepEqual({
      celulas: r.celulas <= teto(m.celulas), getValues: r.getValues <= teto(m.getValues), getValue: r.getValue <= teto(m.getValue), bytes: r.bytes <= teto(m.bytes),
    }, { celulas: true, getValues: true, getValue: true, bytes: true },
    `estourou o orçamento: ${r.celulas} células (teto ${teto(m.celulas)}), ${r.getValues} leituras (teto ${teto(m.getValues)}), ${r.getValue} de 1 célula (teto ${teto(m.getValue)}), ${r.bytes} bytes (teto ${teto(m.bytes)})`);
  });
}

// `node tests/harness/coerencia-telas.test.mjs --medir` imprime a tabela medida agora (pra atualizar MEDIDO com motivo).
if (process.argv.includes('--medir') && process.argv[1] && process.argv[1].endsWith('coerencia-telas.test.mjs')) {
  for (const [acao, m] of Object.entries(MEDIDO)) {
    const r = medirAcao(acao, m.params || {});
    console.log(`${acao.padEnd(20)} celulas=${r.celulas} getValues=${r.getValues} getValue=${r.getValue} bytes=${r.bytes}`);
  }
  process.exit(0);
}
