// tests/harness/sync-travas-registro.test.js
//
// 05/10/2026 (Onda 2C, auditoria A-45/A-50/A-54): trava por RECURSO no lugar do lock único do script
// (Planilha.gs!travaRecurso_), tickers sem cobertura no GOOGLEFINANCE + prioridade de quem tem posição
// (Sync.gs), Registro de Controle estruturado + heartbeat das 12h (Sync.gs). Carrega os .gs reais num vm com a
// planilha falsa; sem rede; dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, AbaFalsa } from './planilha-falsa.mjs';

const CAB_REG = [['Timestamp', 'Origem', 'Status', 'Detalhe']];

/** Lock de script falso que sabe se está segurado (pra provar que a sync NÃO o segura mais). */
function lockRastreado(sb) {
  const estado = { segurado: false, vezesSegurado: 0, seguradoDuranteSync: false };
  sb.LockService = {
    getScriptLock: () => ({
      waitLock() { estado.segurado = true; estado.vezesSegurado++; },
      tryLock() { estado.segurado = true; estado.vezesSegurado++; return true; },
      releaseLock() { estado.segurado = false; },
    }),
  };
  return estado;
}

function montar({ agora = null, abas = {} } = {}) {
  const ss = planilhaFalsa({ 'Registro de Controle': CAB_REG, ...abas });
  const g = sandboxGas(ss, { agora });
  g.sb.Utilities.sleep = () => {};
  // datas das células criadas no teste (realm do Node) -> realm do vm, senão `instanceof Date` do .gs falha
  Object.values(ss.abas).forEach((aba) => aba.l.forEach((row) => (row || []).forEach((c) => { if (c && c.v instanceof Date) c.v = new g.sb.Date(c.v.getTime()); })));
  g.sb.PropertiesService.getScriptProperties = ((orig) => () => {
    const o = orig();
    return { ...o, getProperties: () => Object.fromEntries(g.props.entries()) };
  })(g.sb.PropertiesService.getScriptProperties);
  return { ss, ...g };
}

// --- A-45: trava por recurso ----------------------------------------------

test('A-45: recursos diferentes não se bloqueiam; o mesmo recurso sim, e o dono aparece', () => {
  const { sb } = montar();
  const sync = sb.travaRecurso_('precos', 'Sync de preços - ativos (Automático)', { ttlMs: 6.5 * 60 * 1000 });
  assert.equal(sync.tryLock(50), true);
  assert.equal(sync.hasLock(), true);

  const aporte = sb.travaRecurso_('carteira', 'aportes/lançamentos');
  assert.equal(aporte.tryLock(50), true, 'salvar aporte não espera a sync (antes: lock único do script, até 20 s)');
  aporte.releaseLock();

  const outraSync = sb.travaRecurso_('precos', 'Renda Fixa + Índices (Manual)');
  assert.equal(outraSync.tryLock(50), false);
  assert.match(outraSync.donoAtual(), /Sync de preços - ativos \(Automático\)/);
  assert.throws(() => outraSync.waitLock(50), /ocupada por Sync de preços - ativos \(Automático\)/);

  sync.releaseLock();
  assert.equal(sync.hasLock(), false);
  assert.equal(outraSync.tryLock(50), true, 'solta -> libera');
  outraSync.releaseLock();
});

test('A-45: vários recursos = tudo ou nada; aluguel vencido volta sozinho; quem não é dono não solta o aluguel alheio', () => {
  const { sb, props } = montar();
  const a = sb.travaRecurso_('carteira', 'importação');
  a.tryLock(50);
  const consolidar = sb.travaRecurso_(['precos', 'carteira'], 'consolidação');
  assert.equal(consolidar.tryLock(50), false);
  assert.equal(sb.donoDaTrava_('precos'), null, 'precos continua livre: nada ficou meio pego');
  a.releaseLock();
  assert.equal(consolidar.tryLock(50), true);
  assert.ok(sb.donoDaTrava_('precos') && sb.donoDaTrava_('carteira'));
  consolidar.releaseLock();
  assert.equal(sb.donoDaTrava_('precos'), null);

  // execução morta: aluguel vence
  props.set('TRAVA_metas', JSON.stringify({ id: 'morto', dono: 'salvar metas', desde: Date.now() - 999999, ate: Date.now() - 1 }));
  const m = sb.travaRecurso_('metas', 'salvar metas');
  assert.equal(m.tryLock(50), true, 'aluguel vencido não prende ninguém');

  // o dono antigo, ao "soltar", não derruba o aluguel novo
  const velho = sb.travaRecurso_('despesas', 'velho', { ttlMs: 1 });
  velho.tryLock(0);
  props.set('TRAVA_despesas', JSON.stringify({ id: 'novo', dono: 'novo dono', desde: Date.now(), ate: Date.now() + 60000 }));
  velho.releaseLock();
  assert.equal(sb.donoDaTrava_('despesas').dono, 'novo dono');

  const soltas = sb.liberarTravasForcado();
  assert.ok(soltas.includes('despesas') && soltas.includes('metas'));
  assert.equal(sb.donoDaTrava_('despesas'), null);
});

test('A-45: sem PropertiesService cai no lock de script antigo (ambientes de teste)', () => {
  const sb = { LockService: { getScriptLock: () => ({ waitLock() { sb.log.push('wait'); }, releaseLock() { sb.log.push('release'); } }) }, log: [] };
  const vm = awaitVm(sb);
  const t = vm.travaRecurso_('x', 'y');
  t.waitLock(10);
  t.releaseLock();
  assert.deepEqual(sb.log, ['wait', 'release']);
});

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './planilha-falsa.mjs';
function awaitVm(sb) {
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Planilha.gs'), 'utf8'), { filename: 'Planilha.gs' }).runInContext(sb);
  return sb;
}

// --- A-45 + A-50: a sync de ativos --------------------------------------------

const DIA = (iso) => new Date(iso + 'T12:00:00-03:00');
const abasSync = () => ({
  'aux_historico-patrimonio': [['Data', 'Ticker', 'Classe', 'Cotas', 'Preço', 'Valor', 'Câmbio', 'Valor BRL']],
  'Transações': [[], [], [], [], [], ['Ticker', 'Data', '', '', '', '', '', '', '', '', 'Qtd', '', 'Cotas'],
    ['PETR4', DIA('2026-01-05'), '', '', '', '', '', '', '', '', 10, '', 10],     // com posição
    ['VALE3', DIA('2026-01-06'), '', '', '', '', '', '', '', '', 5, '', 5],       // comprou e vendeu tudo
    ['VALE3', DIA('2026-02-06'), '', '', '', '', '', '', '', '', -5, '', 0],
    ['BBAS3', DIA('2026-01-07'), '', '', '', '', '', '', '', '', 3, '', 3]],      // com posição
  'Transações - USA': [[], [], [], [], [], ['Ticker', 'Data']],
  'Auxiliar_ativos': [['Classe', 'Ticker']],
});

test('A-45: a sync de ativos NÃO segura o lock do script durante o trabalho (só a trava do recurso "precos")', () => {
  const { sb } = montar({ agora: DIA('2026-10-05'), abas: abasSync() });
  const lk = lockRastreado(sb);
  let segurouNaBusca = null;
  let carteiraLivre = null;
  sb.buscarPrecoHistorico_ = () => {
    segurouNaBusca = lk.segurado; // o lock do script só é pego por milissegundos nas travas; aqui no meio do trabalho tem que estar solto
    carteiraLivre = sb.travaRecurso_('carteira', 'aporte').tryLock(0);
    return { precos: [], completo: true, lacunas: [] };
  };
  const r = sb.atualizarHistorico('Automático', ['PETR4']);
  assert.equal(r.status, 'Sucesso');
  assert.equal(segurouNaBusca, false, 'lock do script solto durante a busca (antes: seguro por até 5,5 min)');
  assert.equal(carteiraLivre, true, 'um salvamento de carteira consegue a trava no meio da sync');
  assert.equal(sb.donoDaTrava_('precos'), null, 'a trava de preços foi solta no fim');
});

test('A-45: sync que esbarra em outra grava "Atenção" com o DONO da trava no Registro de Controle', () => {
  const { sb, ss } = montar({ agora: DIA('2026-10-05'), abas: abasSync() });
  const outra = sb.travaRecurso_('precos', 'Renda Fixa + Índices (Automático)');
  assert.equal(outra.tryLock(0), true);
  let buscou = 0;
  sb.buscarPrecoHistorico_ = () => { buscou++; return { precos: [], completo: true, lacunas: [] }; };
  const r = sb.atualizarHistorico('Manual', null);
  assert.equal(r.status, 'Atenção');
  assert.equal(buscou, 0);
  assert.match(r.detalhe, /ocupado por Renda Fixa \+ Índices \(Automático\)/);
  const linha = ss.aba('Registro de Controle').valores(2);
  assert.equal(linha[2], 'Atenção');
  assert.match(linha[3], /Renda Fixa \+ Índices \(Automático\)/);
  assert.equal(linha[4], 'ativos');
});

test('A-50: quem tem posição vai primeiro na fila; zerados e sem transação por último', () => {
  const { sb } = montar({ agora: DIA('2026-10-05'), abas: abasSync() });
  const ordem = [];
  sb.buscarPrecoHistorico_ = (t) => { if (t.indexOf(':') === -1) ordem.push(t); return { precos: [], completo: true, lacunas: [] }; };
  sb.atualizarHistorico('Manual', null);
  assert.deepEqual(ordem.slice(0, 2), ['BBAS3', 'PETR4'], 'posições primeiro (na ordem de sempre dentro do grupo)');
  assert.ok(ordem.indexOf('VALE3') > 1, 'VALE3 zerado fica depois');
  assert.equal(ordem.length, 30);
  assert.deepEqual(plain(sb.priorizarTickersComPosicao_(['VALE3', 'PETR4', 'ZZZZ3'], { BR: { PETR4: [{ delta: 2 }], VALE3: [{ delta: 5 }, { delta: -5 }] }, USA: {} })), ['PETR4', 'VALE3', 'ZZZZ3']);
});

const plain = (x) => JSON.parse(JSON.stringify(x));

test('A-50: 3 dias seguidos sem NENHUM dado -> "sem cobertura": pula até revisão (7 dias), reteste volta se aparecer preço', () => {
  const dias = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  const SEM = 'PETR4';
  let props = null;
  const rodar = (dia, { comPreco = false } = {}) => {
    const g = montar({ agora: DIA(dia), abas: abasSync() });
    if (props) props.forEach((v, k) => g.props.set(k, v));
    const buscados = [];
    g.sb.buscarPrecoHistorico_ = (t, classe, ini, fim) => {
      if (t.indexOf(':') !== -1) return { precos: [], completo: true, lacunas: [] }; // câmbio
      buscados.push(t);
      if (t === SEM && comPreco) return { precos: [{ data: new Date(fim), preco: 10 }], completo: true, lacunas: [] };
      if (t === SEM) return { precos: [], completo: true, lacunas: [{ inicio: '2026-01-01', fim: '2026-10-01' }] };
      return { precos: [], completo: true, lacunas: [] };
    };
    const r = g.sb.atualizarHistorico('Automático', null);
    props = g.props;
    return { r, buscados, g };
  };

  const d1 = rodar(dias[0]); assert.ok(d1.buscados.includes(SEM)); assert.equal(plain(d1.r.lacunas).length, 1);
  const marca1 = JSON.parse(props.get('SYNC_SEM_COBERTURA_GF'));
  assert.equal(marca1[SEM].falhas, 1);
  // 2ª tentativa no MESMO dia (retry da agenda) não conta de novo
  rodar(dias[0]);
  assert.equal(JSON.parse(props.get('SYNC_SEM_COBERTURA_GF'))[SEM].falhas, 1);
  rodar(dias[1]);
  const d3 = rodar(dias[2]);
  assert.match(d3.r.detalhe, /marcados agora como sem cobertura.*PETR4/);
  assert.deepEqual(plain(d3.r.semCobertura), [SEM]);
  assert.equal(JSON.parse(props.get('SYNC_SEM_COBERTURA_GF'))[SEM].marcado, true);

  // 4º dia: pulado, não gasta busca, status continua Sucesso (não é falha)
  const d4 = rodar(dias[3]);
  assert.ok(!d4.buscados.includes(SEM), 'ticker sem cobertura não é buscado');
  assert.equal(d4.r.status, 'Sucesso');
  assert.match(d4.r.detalhe, /1 sem cobertura no GOOGLEFINANCE \(pulados até revisão/);
  assert.equal(d4.buscados.length, 29);

  // ticker manual explícito (retry escolhido na tela) não é pulado
  const g = montar({ agora: DIA('2026-10-09'), abas: abasSync() });
  props.forEach((v, k) => g.props.set(k, v));
  const b = [];
  g.sb.buscarPrecoHistorico_ = (t) => { if (t.indexOf(':') === -1) b.push(t); return { precos: [], completo: true, lacunas: [] }; };
  g.sb.atualizarHistorico('Manual', [SEM]);
  assert.deepEqual(b, [SEM]);

  // 7 dias depois: reteste; voltou preço -> marca some
  const rev = rodar('2026-10-15', { comPreco: true });
  assert.ok(rev.buscados.includes(SEM), 'reteste após a revisão');
  assert.equal(JSON.parse(props.get('SYNC_SEM_COBERTURA_GF'))[SEM], undefined);
  const lista = rev.g.sb.listarSemCoberturaGoogleFinance();
  assert.deepEqual(plain(lista), {});
});

test('A-50: fim de semana sozinho não conta como "sem cobertura"; liberar tira a marca', () => {
  const { sb } = montar({ agora: DIA('2026-10-05') });
  assert.equal(sb.intervaloTemPregaoSync_(new Date(2026, 9, 3), new Date(2026, 9, 4)), false, 'sáb-dom');
  assert.equal(sb.intervaloTemPregaoSync_(new Date(2026, 9, 3), new Date(2026, 9, 5)), true, 'até segunda');
  assert.equal(sb.intervaloTemPregaoSync_(new Date(2026, 8, 7), new Date(2026, 8, 7)), false, 'feriado 07/09/2026');
  sb.gravarSemCoberturaGf_({ AAAA3: { falhas: 3, marcado: true, desde: '2026-10-01' }, BBBB3: { falhas: 1 } });
  assert.deepEqual(Object.keys(plain(sb.liberarSemCoberturaGoogleFinance('aaaa3'))), ['BBBB3']);
  assert.deepEqual(plain(sb.liberarSemCoberturaGoogleFinance()), {});
});

// --- A-54: Registro de Controle ---------------------------------------------

test('A-54: Registro estruturado - 10 colunas, cabeçalho completado, etapa/tentativa/duração do contexto, fonte e HTTP deduzidos', () => {
  const { sb, ss } = montar({ agora: DIA('2026-10-05') });
  sb.definirContextoRegistro_({ etapa: 'fundamentos', tentativa: 2 });
  sb.gravarRegistroControle_('Atenção', 'Automático', 'falharam: YYYY|yahoo (HTTP 429), AAAA|Fundamentus (HTTP 403)');
  sb.definirContextoRegistro_(null);
  sb.gravarRegistroControle_('Sucesso', 'Manual', 'tudo certo', { etapa: 'ativos', fonte: 'GOOGLEFINANCE', duracaoMs: 61234, fetches: 7, tentativa: 1 });
  const aba = ss.aba('Registro de Controle');
  assert.deepEqual(aba.valores(1), ['Timestamp', 'Origem', 'Status', 'Detalhe', 'Etapa', 'Fonte', 'HTTP', 'Duração (s)', 'Fetches', 'Tentativa']);
  const [ts, orig, st, det, etapa, fonte, http, dur, fetches, tent] = aba.valores(3);
  assert.equal(typeof ts.getTime, 'function');
  assert.deepEqual([orig, st, etapa, fonte, http, tent], ['Automático', 'Atenção', 'fundamentos', 'Yahoo', 429, 2]);
  assert.equal(typeof dur, 'number');
  assert.match(det, /yahoo/);
  assert.deepEqual(aba.valores(2).slice(1), ['Manual', 'Sucesso', 'tudo certo', 'ativos', 'GOOGLEFINANCE', '', 61.2, 7, 1]);
  assert.equal(aba.getLastRow(), 3);
});

test('A-54: linhas de teste (origem "Teste") não entram no log real; limparLinhasTesteRegistro tira as que já estavam', () => {
  const { sb, ss } = montar({ agora: DIA('2026-10-05') });
  sb.gravarRegistroControle_('Erro', 'Teste', '1 de 1 ativos falhou (TESTE_FALHA_X)');
  assert.equal(ss.aba('Registro de Controle').getLastRow(), 1);
  const aba = ss.aba('Registro de Controle');
  const linha = (o, d) => [new Date(), o, 'Erro', d];
  [linha('Automático', '29 de 29 ativos atualizados'), linha('Teste', 'x'), linha('Manual', 'TESTE_FALHA_ABC falhou'), linha('Manual', 'Falha simulada (teste) — ticker'), linha('Manual', 'normal')]
    .forEach((l, i) => aba.getRange(2 + i, 1, 1, 4).setValues([l]));
  assert.equal(sb.limparLinhasTesteRegistro(), 3);
  assert.equal(aba.getLastRow(), 3);
  assert.deepEqual([aba.valores(2)[3], aba.valores(3)[3]], ['29 de 29 ativos atualizados', 'normal']);
});

test('A-54: guarda 2.000 linhas (não mais 300) e corta o excedente', () => {
  const linhas = [CAB_REG[0]];
  for (let i = 0; i < 2000; i++) linhas.push([new Date(2026, 0, 1), 'Automático', 'Sucesso', 'linha ' + i]);
  const { sb, ss } = montar({ abas: { 'Registro de Controle': linhas } });
  sb.gravarRegistroControle_('Sucesso', 'Automático', 'nova');
  const aba = ss.aba('Registro de Controle');
  assert.equal(aba.getLastRow(), 2001, 'cabeçalho + 2.000');
  assert.equal(aba.valores(2)[3], 'nova');
  assert.equal(sb.REGISTRO_LIMITE_LINHAS_, 2000);
});

// --- A-54: heartbeat --------------------------------------------------------

function comEmails(g) {
  const emails = [];
  g.sb.MailApp = { sendEmail: (m) => emails.push(m) };
  return emails;
}
const linhaReg = (dataIso, origem, status, detalhe, etapa = '') => [DIA(dataIso), origem, status, detalhe, etapa];

test('A-54: heartbeat - dia de pregão sem linha de Ativos -> "Erro" no Registro + e-mail, 1x por dia', () => {
  const g = montar({ abas: { 'Registro de Controle': [CAB_REG[0], linhaReg('2026-10-05', 'Automático', 'Sucesso', 'Renda Fixa: 0 linha(s)', 'rendaFixaIndices'), linhaReg('2026-10-04', 'Automático', 'Sucesso', '29 de 29 ativos atualizados', 'ativos')] } });
  const emails = comEmails(g);
  const quando = new g.sb.Date(Date.parse('2026-10-06T15:00:00Z')); // terça 12:00 SP
  const r = g.sb.heartbeatRegistroControle(quando);
  assert.equal(r.ok, false);
  assert.equal(emails.length, 1);
  assert.match(emails[0].subject, /sem sincronização de ativos hoje/);
  const aba = g.ss.aba('Registro de Controle');
  assert.equal(aba.valores(2)[1], 'Heartbeat');
  assert.equal(aba.valores(2)[2], 'Erro');
  assert.equal(aba.valores(2)[4], 'heartbeat');
  // segunda chamada no mesmo dia não repete
  const r2 = g.sb.heartbeatRegistroControle(quando);
  assert.equal(r2.ok, true);
  assert.equal(emails.length, 1);
});

test('A-54: heartbeat - linha de Ativos de hoje (etapa "ativos" ou "N de M ativos atualizados") = tudo certo; "ocupado" e "Teste" não valem', () => {
  const ok1 = montar({ abas: { 'Registro de Controle': [CAB_REG[0], linhaReg('2026-10-06', 'Automático', 'Atenção', '10 de 30 ativos atualizados — 20 incompletos', 'ativos')] } });
  const e1 = comEmails(ok1);
  assert.equal(ok1.sb.heartbeatRegistroControle(new ok1.sb.Date(Date.parse('2026-10-06T15:00:00Z'))).ok, true);
  assert.equal(e1.length, 0);
  const ok2 = montar({ abas: { 'Registro de Controle': [CAB_REG[0], linhaReg('2026-10-06', 'Automático', 'Sucesso', '30 de 30 ativos atualizados')] } });
  assert.equal(ok2.sb.heartbeatRegistroControle(new ok2.sb.Date(Date.parse('2026-10-06T15:00:00Z'))).ok, true, 'linha antiga, sem a coluna Etapa');
  const ruim = montar({ abas: { 'Registro de Controle': [CAB_REG[0],
    linhaReg('2026-10-06', 'Automático', 'Atenção', 'Já existe uma sincronização de preços rodando agora — ocupado por X', 'ativos'),
    linhaReg('2026-10-06', 'Teste', 'Sucesso', '3 de 3 ativos atualizados', 'ativos')] } });
  const e3 = comEmails(ruim);
  assert.equal(ruim.sb.heartbeatRegistroControle(new ruim.sb.Date(Date.parse('2026-10-06T15:00:00Z'))).ok, false);
  assert.equal(e3.length, 1);
});

test('A-54: heartbeat não cobra sábado, domingo nem feriado da B3', () => {
  for (const iso of ['2026-10-03T15:00:00Z', '2026-10-04T15:00:00Z', '2026-09-07T15:00:00Z']) {
    const g = montar({});
    const e = comEmails(g);
    assert.equal(g.sb.heartbeatRegistroControle(new g.sb.Date(Date.parse(iso))).ok, true);
    assert.equal(e.length, 0);
    assert.equal(g.ss.aba('Registro de Controle').getLastRow(), 1);
  }
});

test('A-53/A-54: o heartbeat e o pré-aquecimento são gatilhos geridos pela Agenda (nomes dos handlers existem)', () => {
  const { sb } = montar();
  for (const f of ['heartbeatRegistroControle', 'preAquecerCacheAtivos_', 'instalarAgendaDiaria', 'reprocessarAgendaDiaria', 'criarAbaFeriadosB3']) assert.equal(typeof sb[f], 'function', f);
});
