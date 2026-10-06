// tests/harness/agenda-diaria.test.js
//
// 02/10/2026 (Tiago: "Sync: Horário fixo de execução: ativos, renda fixa e
// índices às 10:01 sempre. As outras, depois, só se ativos/RF/índices
// deram certo, com retry 2-3x."): agenda diária encadeada
// (apps-script/Agenda.gs). Carrega o .gs literal num sandbox com
// ScriptApp/PropertiesService/Utilities FALSOS e um relógio controlado;
// as rotinas de cada etapa (atualizarHistorico etc.) são trocadas por
// funções falsas que contam chamadas e devolvem o que o teste mandar.
// Sem planilha e sem rede; nenhum dado real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const plain = (x) => JSON.parse(JSON.stringify(x));

// --- fuso (Intl, sem offset fixo) ------------------------------------------
function partes(tz, ms) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) o[type] = value;
  return o;
}
function relogioParaUtc(tz, y, mo, d, h, mi, s) {
  const alvo = Date.UTC(y, mo - 1, d, h, mi, s);
  let palpite = alvo;
  for (let i = 0; i < 3; i++) {
    const p = partes(tz, palpite);
    const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    if (visto === alvo) break;
    palpite += alvo - visto;
  }
  return palpite;
}
const UtilitiesFalso = (DateSb) => ({
  formatDate(data, tz, fmt) {
    const p = partes(tz, data.getTime());
    return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
      .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  },
  parseDate(texto, tz, fmt) {
    assert.equal(fmt, 'yyyy-MM-dd HH:mm:ss');
    const [y, mo, d, h, mi, s] = texto.match(/^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/).slice(1).map(Number);
    return new DateSb(relogioParaUtc(tz, y, mo, d, h, mi, s));
  },
  sleep() { throw new Error('Agenda.gs não deveria dormir (reagenda em vez de esperar)'); },
});

// --- sandbox --------------------------------------------------------------
/**
 * jobs: { ativos, rendaFixaIndices, snapshotResumo, proventosFnet, informesFnet, fundamentos, portfolioFii, preAquecer }
 * cada um uma função (n = nº da chamada, args) => retorno (ou lança).
 */
function montar(agoraIso, jobs = {}) {
  const props = {};
  const gatilhos = [];
  let uid = 0;
  const chamadas = { ativos: [], rendaFixaIndices: [], snapshotResumo: [], proventosFnet: [], informesFnet: [], fundamentos: [], portfolioFii: [], preAquecer: [], snapshotPrecos: [] };
  const registro = [];
  const emails = [];
  const relogio = { ms: Date.parse(agoraIso) };

  const novoBuilder = (handler) => {
    const g = { handler, id: String(++uid), tipo: null, at: null, hora: null, minuto: null, disparado: false };
    const b = {
      timeBased: () => b,
      everyDays: (n) => { g.tipo = 'diario'; g.dias = n; return b; },
      atHour: (h) => { g.hora = h; return b; },
      nearMinute: (m) => { g.minuto = m; return b; },
      at: (d) => { g.tipo = 'oneshot'; g.at = d.getTime(); return b; },
      create: () => { gatilhos.push(g); return { getUniqueId: () => g.id }; },
    };
    return b;
  };
  const ScriptApp = {
    newTrigger: (h) => novoBuilder(h),
    getProjectTriggers: () => gatilhos.map((g) => ({ getHandlerFunction: () => g.handler, getUniqueId: () => g.id, _g: g })),
    deleteTrigger: (t) => { const i = gatilhos.indexOf(t._g); if (i !== -1) gatilhos.splice(i, 1); },
  };

  const padrao = {
    ativos: () => ({ status: 'Sucesso', ok: ['AAAA3'], falharam: [], naoProcessados: [], lacunas: [] }),
    rendaFixaIndices: () => ({ status: 'Sucesso', detalhe: 'ok', essenciaisOk: true }),
    snapshotResumo: () => ({ mudou: true }),
    proventosFnet: () => ({ status: 'Sucesso', detalhe: 'ok' }),
    informesFnet: () => ({ status: 'Sucesso', detalhe: 'ok' }),
    fundamentos: () => ({ status: 'Sucesso', detalhe: 'ok', porTempo: false }), // 03/10/2026 (Fundamentos.gs)
    portfolioFii: () => ({ status: 'Sucesso', detalhe: 'ok', porTempo: false }), // 05/10/2026 (PortfolioFii.gs)
    preAquecer: () => ({ ativos: 3, calculados: 3, jaEmCache: 0, faltaramPorTempo: 0, falhas: [], ms: 1 }), // 05/10/2026 (A-53, Ativo.gs)
    snapshotPrecos: () => ({ dia: '2026-10-02', gravados: 3, ignorados: [], regravou: false, detalhe: '3 preço(s) gravado(s)' }), // 06/10/2026 (A-56, SnapshotPrecos.gs)
  };
  const job = (id) => (...args) => { chamadas[id].push(args); return (jobs[id] || padrao[id])(chamadas[id].length, ...args); };

  const sb = {
    console: { ...console, log() {} },
    Logger: { log() {} },
    ScriptApp,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    atualizarHistorico: job('ativos'),
    atualizarRendaFixaEIndicesDiario_: job('rendaFixaIndices'),
    gravarSnapshotResumoHoje_: job('snapshotResumo'),
    atualizarProventosAnunciadosFii_: job('proventosFnet'),
    atualizarInformesFiiFnet_: job('informesFnet'),
    atualizarFundamentos_: job('fundamentos'),
    atualizarPortfolioFii_: job('portfolioFii'),
    preAquecerCacheAtivos_: job('preAquecer'),
    gravarSnapshotPrecosHoje_: job('snapshotPrecos'),
    gravarRegistroControle_: (...a) => registro.push(a),
    notificarFalhaSincronizacao_: (...a) => emails.push(a),
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  sb.Utilities = UtilitiesFalso(sb.Date);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Agenda.gs'), 'utf8'), { filename: 'Agenda.gs' }).runInContext(sb);
  sb.agendaAgora_ = () => new sb.Date(relogio.ms); // relógio controlado

  const pendentes = () => gatilhos.filter((g) => g.tipo === 'oneshot' && !g.disparado).sort((a, b) => a.at - b.at);
  /** Dispara os one-shots em ordem (o fake NÃO apaga o gatilho disparado - igual ao Apps Script). */
  const rodarFila = (limite = 50) => {
    let n = 0;
    while (pendentes().length && n < limite) {
      const g = pendentes()[0];
      relogio.ms = Math.max(relogio.ms, g.at);
      g.disparado = true;
      sb[g.handler]({ triggerUid: g.id });
      n++;
    }
    return n;
  };
  const estado = () => JSON.parse(props.AGENDA_DIARIA_ESTADO);
  return { sb, gatilhos, chamadas, registro, emails, relogio, props, pendentes, rodarFila, estado };
}

const utc = (iso) => Date.parse(iso);

// --- testes ---------------------------------------------------------------

test('Agenda: despertador agenda o one-shot pra 10:01:00 de São Paulo (13:01 UTC)', () => {
  const a = montar('2026-10-02T11:40:00Z'); // sexta, 08:40 em SP
  a.sb.despertadorAgendaDiaria();
  const p = a.pendentes();
  assert.equal(p.length, 1);
  assert.equal(p[0].handler, 'etapaAgendaDiaria');
  assert.equal(p[0].at, utc('2026-10-02T13:01:00Z'));
  const e = a.estado();
  assert.equal(e.dia, '2026-10-02');
  assert.equal(e.situacao, 'agendada');
  assert.equal(e.proximaExecucao, '2026-10-02 10:01:00');
});

test('Agenda: o dia é o de São Paulo (23h de sexta em SP já é sábado em UTC, e não é pulado)', () => {
  // 2026-10-03 é sábado; 02:30 UTC de sábado = 23:30 de sexta (dia 02) em SP
  const a = montar('2026-10-03T02:30:00Z');
  a.sb.despertadorAgendaDiaria();
  const e = a.estado();
  assert.equal(e.dia, '2026-10-02');
  assert.equal(e.situacao, 'agendada');
  assert.equal(e.proximaExecucao.slice(0, 10), '2026-10-02');
  // e 10:01 da sexta já passou -> começa em 1 min, não "amanhã"
  assert.equal(a.pendentes()[0].at, utc('2026-10-03T02:31:00Z'));
  // 02:30 UTC de segunda = 23:30 de domingo em SP: continua domingo (não vira dia útil por causa do UTC)
  const b = montar('2026-10-05T02:30:00Z');
  b.sb.despertadorAgendaDiaria();
  assert.equal(b.estado().dia, '2026-10-04');
  assert.equal(b.estado().situacao, 'domingo');
  assert.equal(b.pendentes().length, 0);
});

test('Agenda: domingo não agenda nada', () => {
  const a = montar('2026-10-04T11:30:00Z'); // domingo, 08:30 em SP
  a.sb.despertadorAgendaDiaria();
  assert.equal(a.pendentes().length, 0);
  assert.equal(a.estado().situacao, 'domingo');
  assert.equal(a.rodarFila(), 0);
  assert.equal(a.chamadas.ativos.length, 0);
});

test('Agenda: dia normal roda tudo na ordem, principal às 10:01, e não sobra one-shot', () => {
  const a = montar('2026-10-02T11:40:00Z');
  const ordem = [];
  const nomes = { ativos: 'atualizarHistorico', rendaFixaIndices: 'atualizarRendaFixaEIndicesDiario_', snapshotResumo: 'gravarSnapshotResumoHoje_', proventosFnet: 'atualizarProventosAnunciadosFii_', informesFnet: 'atualizarInformesFiiFnet_', fundamentos: 'atualizarFundamentos_', portfolioFii: 'atualizarPortfolioFii_', preAquecer: 'preAquecerCacheAtivos_' };
  for (const [id, fn] of Object.entries(nomes)) {
    const orig = a.sb[fn];
    a.sb[fn] = (...x) => { ordem.push([id, a.relogio.ms]); return orig(...x); };
  }
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.deepEqual(ordem.map((o) => o[0]), ['ativos', 'rendaFixaIndices', 'snapshotResumo', 'proventosFnet', 'informesFnet', 'fundamentos', 'portfolioFii', 'preAquecer']);
  assert.equal(ordem[0][1], utc('2026-10-02T13:01:00Z'), 'ativos começa exatamente às 10:01 SP');
  assert.equal(ordem[1][1], utc('2026-10-02T13:02:00Z'), 'RF + índices logo depois (+1 min)');
  assert.deepEqual(plain(a.chamadas.ativos[0]), ['Automático', null]);
  assert.deepEqual(plain(a.chamadas.rendaFixaIndices[0]), ['Automático']);
  const e = a.estado();
  assert.equal(e.situacao, 'concluida');
  for (const et of Object.values(e.etapas)) { assert.equal(et.status, 'ok'); assert.equal(et.tentativas, 1); }
  // nenhum one-shot sobrando (nem disparado, nem pendente); só o que não é da agenda
  assert.equal(a.gatilhos.filter((g) => g.handler === 'etapaAgendaDiaria').length, 0);
  assert.equal(a.registro.length, 0, 'agenda não grava Registro de Controle quando dá tudo certo (cada rotina já grava o seu)');
});

// 06/10/2026 (A-56, modo sombra): o snapshot de preços é a última etapa e só roda DEPOIS das 18:30 de SP (21:30 UTC)
test('Agenda (A-56): snapshotPrecos espera as 18:30 de SP (one-shot), roda 1x, e o dia só conclui depois dele', () => {
  const a = montar('2026-10-02T11:40:00Z');
  a.sb.despertadorAgendaDiaria();
  // roda a fila até só sobrar o one-shot das 18:30
  while (a.pendentes().length && a.pendentes()[0].at < utc('2026-10-02T21:00:00Z')) {
    const g = a.pendentes()[0];
    a.relogio.ms = Math.max(a.relogio.ms, g.at); g.disparado = true; a.sb[g.handler]({ triggerUid: g.id });
  }
  assert.equal(a.chamadas.snapshotPrecos.length, 0, 'nada de snapshot durante a manhã');
  for (const id of ['ativos', 'rendaFixaIndices', 'preAquecer']) assert.equal(a.chamadas[id].length, 1, id);
  assert.equal(a.pendentes().length, 1);
  assert.equal(a.pendentes()[0].at, utc('2026-10-02T21:30:00Z'), 'one-shot às 18:30 SP');
  assert.equal(a.estado().situacao, 'agendada');
  assert.equal(a.estado().proximaExecucao, '2026-10-02 18:30:00');
  assert.equal(a.estado().etapas.snapshotPrecos.status, 'pendente');
  a.rodarFila();
  assert.equal(a.chamadas.snapshotPrecos.length, 1);
  assert.equal(a.relogio.ms, utc('2026-10-02T21:30:00Z'));
  assert.equal(a.estado().situacao, 'concluida');
  assert.equal(a.estado().etapas.snapshotPrecos.status, 'ok');
});

test('Agenda (A-56): snapshotPrecos depende dos preços (se "ativos" falha, é pulada)', () => {
  const a = montar('2026-10-02T11:40:00Z', { ativos: () => { throw new Error('HTTP 503'); } });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.snapshotPrecos.length, 0);
  assert.equal(a.estado().etapas.snapshotPrecos.status, 'pulada');
});

test('Agenda: ativos com retry - falha 2x e acerta na 3ª, reagendando +10 min e só com os tickers pendentes', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    ativos: (n) => {
      if (n === 1) throw new Error('GOOGLEFINANCE fora do ar');
      if (n === 2) return { status: 'Atenção', ok: ['AAAA3'], falharam: [{ ticker: 'BBBB11', erro: 'x' }], naoProcessados: ['CCCC'] };
      return { status: 'Sucesso', ok: ['BBBB11', 'CCCC'], falharam: [], naoProcessados: [] };
    },
  });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.ativos.length, 3);
  assert.deepEqual(plain(a.chamadas.ativos[1]), ['Automático', null], '2ª tentativa: erro antes de saber quem faltou -> todos');
  assert.deepEqual(plain(a.chamadas.ativos[2]), ['Automático', ['BBBB11', 'CCCC']], '3ª tentativa: só os pendentes');
  const e = a.estado();
  assert.equal(e.etapas.ativos.status, 'ok');
  assert.equal(e.etapas.ativos.tentativas, 3);
  assert.equal(e.situacao, 'concluida');
  assert.equal(a.chamadas.informesFnet.length, 1, 'secundárias rodaram porque a principal acabou dando certo');
  assert.equal(a.gatilhos.filter((g) => g.handler === 'etapaAgendaDiaria').length, 0);
});

test('Agenda: principal falha 3x -> só 3 tentativas dela (+10 min), as etapas independentes seguem e o estado diz o motivo', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    rendaFixaIndices: () => ({ status: 'Atenção', detalhe: 'Índices falharam: #N/A', essenciaisOk: false }),
  });
  a.sb.AGENDA_MAX_RECUPERACOES_ = 0; // aqui só interessa a fila do dia (a recuperação tem teste próprio)
  const horarios = [];
  const orig = a.sb.atualizarRendaFixaEIndicesDiario_;
  a.sb.atualizarRendaFixaEIndicesDiario_ = (...x) => { horarios.push(a.relogio.ms); return orig(...x); };
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.ativos.length, 1);
  assert.equal(a.chamadas.rendaFixaIndices.length, 3, 'no máximo 3 tentativas');
  assert.deepEqual(horarios, [utc('2026-10-02T13:02:00Z'), utc('2026-10-02T13:12:00Z'), utc('2026-10-02T13:22:00Z')], 'novas tentativas reagendadas +10 min');
  // A-47: ninguém depende da Renda Fixa; o snapshot depende só dos preços (ativos) -> tudo isso rodou normalmente
  for (const id of ['snapshotResumo', 'proventosFnet', 'informesFnet', 'fundamentos', 'portfolioFii', 'preAquecer']) assert.equal(a.chamadas[id].length, 1, id + ' roda mesmo com a Renda Fixa fora');
  const e = a.estado();
  assert.equal(e.situacao, 'falhou');
  assert.match(e.motivo, /Renda Fixa \+ Índices/);
  assert.match(e.motivo, /3x/);
  assert.match(e.motivo, /Índices falharam/);
  assert.equal(e.etapas.rendaFixaIndices.status, 'falhou');
  assert.equal(e.etapas.snapshotResumo.status, 'ok');
  assert.equal(e.etapas.informesFnet.status, 'ok');
  assert.equal(a.registro.length, 1);
  assert.equal(a.registro[0][0], 'Erro');
  assert.equal(a.registro[0][3].etapa, 'rendaFixaIndices');
  assert.equal(a.emails.length, 1);
  assert.equal(a.pendentes().length, 0);
  assert.equal(a.gatilhos.filter((g) => g.handler === 'etapaAgendaDiaria').length, 0);
  const texto = a.sb.estadoAgendaDiaria().texto;
  assert.match(texto, /falhou/);
});

test('Agenda: "Atenção" só da Carteira Renda Fixa (essenciaisOk) não conta como falha; versão antiga sem o campo exige "Sucesso"', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    rendaFixaIndices: () => ({ status: 'Atenção', detalhe: 'Carteira Renda Fixa não atualizada', essenciaisOk: true }),
  });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.rendaFixaIndices.length, 1);
  assert.equal(a.chamadas.informesFnet.length, 1);

  const b = montar('2026-10-02T11:40:00Z', { rendaFixaIndices: () => ({ status: 'Atenção', detalhe: 'algo' }) });
  b.sb.AGENDA_MAX_RECUPERACOES_ = 0;
  b.sb.despertadorAgendaDiaria();
  b.rodarFila();
  assert.equal(b.chamadas.rendaFixaIndices.length, 3);
  assert.equal(b.chamadas.proventosFnet.length, 1, 'independente da Renda Fixa');
});

test('Agenda: secundária que falha 3x não impede as outras secundárias', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    proventosFnet: () => ({ status: 'Erro', detalhe: 'FNet não respondeu' }),
    snapshotResumo: (n) => { if (n === 1) throw new Error('aba ocupada'); return { mudou: false }; },
  });
  a.sb.AGENDA_MAX_RECUPERACOES_ = 0;
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.snapshotResumo.length, 2);
  assert.equal(a.chamadas.proventosFnet.length, 3);
  assert.equal(a.chamadas.informesFnet.length, 1);
  const e = a.estado();
  assert.equal(e.situacao, 'concluida');
  assert.equal(e.etapas.proventosFnet.status, 'falhou');
  assert.match(e.etapas.proventosFnet.ultimoErro, /FNet não respondeu/);
  assert.match(e.motivo, /Proventos FNet/);
  assert.equal(a.emails.length, 0, 'falha de secundária não dispara o e-mail da agenda');
});

test('Agenda: execução morta no meio (limite de 6 min) -> o vigia conta a tentativa e segue', () => {
  // "morte" = nada do que viria DEPOIS do job acontece: o job tira uma foto
  // de props/gatilhos no meio da execução e o teste restaura essa foto
  let foto = null;
  const a = montar('2026-10-02T11:40:00Z', {
    ativos: (n) => {
      if (n === 1) foto = { props: { ...a.props }, gatilhos: a.gatilhos.map((g) => ({ ...g })) };
      return { status: 'Sucesso', ok: ['AAAA3'], falharam: [], naoProcessados: [] };
    },
  });
  a.sb.despertadorAgendaDiaria();
  const g = a.pendentes()[0];
  a.relogio.ms = g.at; g.disparado = true;
  a.sb.etapaAgendaDiaria({ triggerUid: g.id });
  // desfaz tudo o que aconteceu depois do job (a execução "morreu" ali)
  for (const k of Object.keys(a.props)) delete a.props[k];
  Object.assign(a.props, foto.props);
  a.gatilhos.splice(0, a.gatilhos.length, ...foto.gatilhos);

  const vigias = a.pendentes();
  assert.equal(vigias.length, 1, 'durante o job só existe o vigia (o one-shot das 10:01 já foi apagado)');
  assert.equal(vigias[0].at, utc('2026-10-02T13:09:00Z'), 'vigia em +8 min');
  assert.equal(a.estado().etapas.ativos.status, 'rodando');

  a.rodarFila(); // o vigia vira a 2ª tentativa
  const e = a.estado();
  assert.equal(a.chamadas.ativos.length, 2);
  assert.equal(e.etapas.ativos.status, 'ok');
  assert.equal(e.etapas.ativos.tentativas, 2);
  assert.ok(e.log.some((l) => /interrompida/.test(l)));
  assert.equal(e.situacao, 'concluida');
  assert.equal(a.gatilhos.filter((g2) => g2.handler === 'etapaAgendaDiaria').length, 0);
});

test('Agenda: 3 execuções mortas seguidas na principal -> falha final dela; as independentes rodam e as que dependem dela são puladas', () => {
  let a;
  const fotos = [];
  a = montar('2026-10-02T11:40:00Z', {
    ativos: () => { fotos.push({ props: { ...a.props }, gatilhos: a.gatilhos.map((g) => ({ ...g })) }); return { status: 'Sucesso', ok: [], falharam: [], naoProcessados: [] }; },
  });
  a.sb.AGENDA_MAX_RECUPERACOES_ = 0;
  a.sb.despertadorAgendaDiaria();
  for (let i = 0; i < 3; i++) {
    const g = a.pendentes()[0];
    a.relogio.ms = g.at; g.disparado = true;
    a.sb.etapaAgendaDiaria({ triggerUid: g.id });
    const f = fotos[fotos.length - 1];
    for (const k of Object.keys(a.props)) delete a.props[k];
    Object.assign(a.props, f.props);
    a.gatilhos.splice(0, a.gatilhos.length, ...f.gatilhos);
  }
  a.rodarFila(); // vigia da 3ª
  const e = a.estado();
  assert.equal(a.chamadas.ativos.length, 3);
  assert.equal(e.situacao, 'falhou');
  assert.match(e.motivo, /interrompida/);
  assert.equal(a.chamadas.rendaFixaIndices.length, 1, 'independente dos preços: rodou');
  assert.equal(a.chamadas.snapshotResumo.length, 0, 'depende dos preços: pulada');
  assert.equal(e.etapas.snapshotResumo.status, 'pulada');
  assert.match(e.etapas.snapshotResumo.ultimoErro, /Ativos/);
  assert.equal(a.gatilhos.filter((g) => g.handler === 'etapaAgendaDiaria').length, 0);
});

test('Agenda: one-shot de outro dia é ignorado e apagado; despertador não recomeça um dia já iniciado', () => {
  const a = montar('2026-10-02T11:40:00Z');
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.ativos.length, 1);
  // despertador "atrasado" no mesmo dia não roda tudo de novo
  a.sb.despertadorAgendaDiaria();
  assert.equal(a.pendentes().length, 0);
  // one-shot perdido disparando no dia seguinte
  a.relogio.ms = utc('2026-10-03T12:00:00Z');
  a.sb.agendaCriarOneShot_(new a.sb.Date(a.relogio.ms));
  a.rodarFila();
  assert.equal(a.chamadas.ativos.length, 1);
  assert.equal(a.gatilhos.filter((g) => g.handler === 'etapaAgendaDiaria').length, 0);
  // novo dia: estado anterior guardado
  a.relogio.ms = utc('2026-10-03T11:30:00Z');
  a.sb.despertadorAgendaDiaria();
  assert.equal(JSON.parse(a.props.AGENDA_DIARIA_ESTADO_ANTERIOR).dia, '2026-10-02');
  assert.equal(a.estado().dia, '2026-10-03');
});

test('Agenda: instalarAgendaDiaria troca os gatilhos antigos (inclusive o pré-aquecimento de 2 h), cria o heartbeat das 12h e mantém vídeos', () => {
  const a = montar('2026-10-02T11:00:00Z'); // 08:00 SP, antes das 10:01
  for (const h of ['gatilhoDiario', 'gatilhoDiarioRendaFixaEIndices', 'gatilhoDiarioProventosFnet', 'gatilhoDiarioInformesFnet', 'gatilhoVideos', 'gatilhoPreAquecerAtivos', 'despertadorAgendaDiaria']) {
    a.sb.ScriptApp.newTrigger(h).timeBased().everyDays(1).atHour(10).create();
  }
  const r = plain(a.sb.instalarAgendaDiaria());
  assert.deepEqual(r.removidos.sort(), ['despertadorAgendaDiaria', 'gatilhoDiario', 'gatilhoDiarioInformesFnet', 'gatilhoDiarioProventosFnet', 'gatilhoDiarioRendaFixaEIndices', 'gatilhoPreAquecerAtivos']);
  assert.deepEqual(r.mantidos.sort(), ['gatilhoVideos']);
  const handlers = a.gatilhos.map((g) => g.handler).sort();
  assert.deepEqual(handlers, ['despertadorAgendaDiaria', 'etapaAgendaDiaria', 'gatilhoVideos', 'heartbeatRegistroControle']);
  const desp = a.gatilhos.find((g) => g.handler === 'despertadorAgendaDiaria');
  assert.equal(desp.tipo, 'diario');
  assert.ok(desp.hora < 10, 'despertador antes das 10h');
  const hb = a.gatilhos.find((g) => g.handler === 'heartbeatRegistroControle');
  assert.equal(hb.tipo, 'diario');
  assert.equal(hb.hora, 12, 'heartbeat às 12h');
  assert.equal(a.pendentes()[0].at, utc('2026-10-02T13:01:00Z'), 'antes das 10:01 já agenda hoje');

  // rodar de novo é idempotente (não duplica)
  a.sb.instalarAgendaDiaria();
  assert.equal(a.gatilhos.filter((g) => g.handler === 'despertadorAgendaDiaria').length, 1);
  assert.equal(a.gatilhos.filter((g) => g.handler === 'heartbeatRegistroControle').length, 1);
  assert.equal(a.gatilhos.filter((g) => g.handler === 'etapaAgendaDiaria').length, 1);

  // depois das 10:01 não agenda hoje
  const b = montar('2026-10-02T15:00:00Z');
  const rb = plain(b.sb.instalarAgendaDiaria());
  assert.equal(b.pendentes().length, 0);
  assert.match(rb.hoje, /rodarAgendaDiariaAgora/);
});

test('Agenda: rodarAgendaDiariaAgora roda a etapa 1 na hora e encadeia o resto', () => {
  const a = montar('2026-10-02T17:00:00Z');
  a.sb.rodarAgendaDiariaAgora();
  assert.equal(a.chamadas.ativos.length, 1);
  assert.equal(a.chamadas.rendaFixaIndices.length, 0);
  assert.equal(a.pendentes().length, 1);
  a.rodarFila();
  assert.equal(a.estado().situacao, 'concluida');
  assert.equal(a.chamadas.informesFnet.length, 1);
});

test('Agenda: estado cabe no limite das Propriedades mesmo com erros longos', () => {
  const longo = 'x'.repeat(5000);
  const a = montar('2026-10-02T11:40:00Z', {
    ativos: () => { throw new Error(longo); },
  });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.ok(a.props.AGENDA_DIARIA_ESTADO.length < 9000);
  assert.equal(a.estado().situacao, 'falhou');
});

// 03/10/2026: etapa secundária "Fundamentos" (Fundamentos.gs)
test('Agenda: Fundamentos é a última secundária; acabou o tempo -> nova tentativa em 10 min continua de onde parou', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    fundamentos: (n) => (n === 1
      ? { status: 'Atenção', detalhe: 'ficou pra próxima (tempo): XXXX3|fundamentus', porTempo: true }
      : { status: 'Atenção', detalhe: 'falharam: YYYY|yahoo (HTTP 429)', porTempo: false }),
  });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.fundamentos.length, 2, 'repetiu só porque sobrou ticker; fonte fora do ar ("Atenção") não repete');
  assert.deepEqual(plain(a.chamadas.fundamentos[0]), ['Automático']);
  const e = a.estado();
  assert.equal(e.situacao, 'concluida');
  assert.equal(e.etapas.fundamentos.status, 'ok');
  assert.match(e.etapas.fundamentos.detalhe, /HTTP 429/);
});

test('Agenda: estado de hoje gravado pela versão sem a etapa Fundamentos não quebra a fila', () => {
  const a = montar('2026-10-02T11:40:00Z');
  a.sb.despertadorAgendaDiaria();
  const velho = a.estado();
  delete velho.etapas.fundamentos; // como a versão anterior gravava
  a.props.AGENDA_DIARIA_ESTADO = JSON.stringify(velho);
  a.rodarFila();
  const e = a.estado();
  assert.equal(e.situacao, 'concluida');
  assert.equal(e.etapas.fundamentos.status, 'ok');
  assert.equal(a.chamadas.fundamentos.length, 1);
});

// 05/10/2026: etapa "Portfólio dos FIIs" (PortfolioFii.gs) - secundária, vem por último
test('Agenda: Portfólio dos FIIs repete se faltou tempo/consultas do mapa, e não repete com "Atenção" (Nominatim/CVM fora)', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    portfolioFii: (n) => (n === 1
      ? { status: 'Sucesso', detalhe: 'ficou pra próxima (tempo/limite de consultas)', porTempo: true }
      : { status: 'Atenção', detalhe: 'Nominatim recusou o servidor (HTTP 403)', porTempo: false }),
  });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  const e = a.estado();
  assert.equal(a.chamadas.portfolioFii.length, 2, 'repetiu só porque sobrou trabalho; "Atenção" não repete');
  assert.deepEqual(plain(a.chamadas.portfolioFii[0]), ['Automático']);
  assert.equal(e.etapas.portfolioFii.status, 'ok');
  assert.match(e.etapas.portfolioFii.detalhe, /Nominatim/);
});

test('Agenda: estado de hoje gravado sem a etapa Portfólio dos FIIs não quebra a fila', () => {
  const a = montar('2026-10-02T11:40:00Z');
  a.sb.despertadorAgendaDiaria();
  const velho = a.estado();
  delete velho.etapas.portfolioFii;
  a.props.AGENDA_DIARIA_ESTADO = JSON.stringify(velho);
  a.rodarFila();
  assert.equal(a.estado().etapas.portfolioFii.status, 'ok');
  assert.equal(a.chamadas.portfolioFii.length, 1);
});

// ---------------------------------------------------------------------------
// 05/10/2026 (Onda 2C): A-47 estágios independentes, A-53 pré-aquecimento na agenda, A-55 calendário B3
// ---------------------------------------------------------------------------

test('Agenda (A-47): erro transitório x permanente (DNS/403/404 = 1 retry; timeout/5xx/lock = 3 tentativas)', () => {
  const a = montar('2026-10-02T11:40:00Z');
  const t = (x) => a.sb.agendaErroTransitorio_(x);
  assert.equal(t('DNS error: https://api.bcb.gov.br/dados/serie'), false);
  assert.equal(t('Address unavailable: https://exemplo.test'), false);
  assert.equal(t('Request failed for https://x returned code 403. Truncated server response: Forbidden'), false);
  assert.equal(t('Erro — fonte respondeu HTTP 404'), false);
  assert.equal(t('Exception: Request timed out'), true);
  assert.equal(t('Request failed for https://x returned code 503'), true);
  assert.equal(t('Já existe uma sincronização de preços rodando agora'), true);
  assert.equal(t('Índices falharam: #N/A'), true);
  assert.equal(t(''), true);
});

test('Agenda (A-47): DNS do BCB derruba a Renda Fixa com 1 retry só e o resto do dia (snapshot, proventos, informes) roda - o caso de 03/10', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    rendaFixaIndices: () => ({ status: 'Erro', detalhe: 'Índices falharam: DNS error: https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados', essenciaisOk: false }),
  });
  a.sb.AGENDA_MAX_RECUPERACOES_ = 0;
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.rendaFixaIndices.length, 2, 'DNS: 1 retry (2 tentativas), não 3');
  assert.equal(a.chamadas.snapshotResumo.length, 1);
  assert.equal(a.chamadas.proventosFnet.length, 1);
  assert.equal(a.chamadas.informesFnet.length, 1);
  const e = a.estado();
  assert.equal(e.etapas.rendaFixaIndices.status, 'falhou');
  assert.equal(e.etapas.rendaFixaIndices.transitorio, false);
  assert.equal(e.etapas.snapshotResumo.status, 'ok');
  assert.equal(e.situacao, 'falhou');
  assert.match(e.motivo, /2x/);
  assert.equal(a.registro.length, 1, '1 linha "Erro" no Registro só');
  assert.equal(a.emails.length, 1);
  assert.match(a.sb.estadoAgendaDiaria().texto, /2\/2 tentativa/);
});

test('Agenda (A-47): quem depende de etapa em nova tentativa ESPERA (não é pulado) e roda quando ela dá certo', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    ativos: (n) => (n === 1 ? { status: 'Atenção', ok: [], falharam: [{ ticker: 'AAAA3', erro: 'timeout' }], naoProcessados: [] } : { status: 'Sucesso', ok: ['AAAA3'], falharam: [], naoProcessados: [] }),
  });
  const ordem = [];
  for (const [id, fn] of Object.entries({ ativos: 'atualizarHistorico', rendaFixaIndices: 'atualizarRendaFixaEIndicesDiario_', snapshotResumo: 'gravarSnapshotResumoHoje_', informesFnet: 'atualizarInformesFiiFnet_', preAquecer: 'preAquecerCacheAtivos_' })) {
    const orig = a.sb[fn];
    a.sb[fn] = (...x) => { ordem.push([id, a.relogio.ms]); return orig(...x); };
  }
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  const ids = ordem.map((o) => o[0]);
  assert.ok(ids.indexOf('rendaFixaIndices') < ids.lastIndexOf('ativos'), 'a Renda Fixa não esperou o retry dos ativos');
  assert.ok(ids.indexOf('informesFnet') < ids.lastIndexOf('ativos'), 'os informes também não');
  assert.ok(ids.indexOf('snapshotResumo') > ids.lastIndexOf('ativos'), 'o snapshot espera os preços');
  assert.ok(ids.indexOf('preAquecer') > ids.lastIndexOf('ativos'), 'o pré-aquecimento espera os preços');
  assert.equal(a.estado().situacao, 'concluida');
  assert.equal(a.chamadas.ativos.length, 2);
  // o retry dos ativos saiu +10 min depois da 1ª tentativa (13:01 -> 13:11)
  assert.equal(ordem.filter((o) => o[0] === 'ativos')[1][1], utc('2026-10-02T13:11:00Z'));
});

test('Agenda (A-47): recuperação - falha transitória na fila ganha 1 tentativa extra 60 min depois (1 rodada/dia); puladas por dependência voltam', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    ativos: (n) => (n <= 3 ? { status: 'Erro', ok: [], falharam: [], naoProcessados: [], detalhe: 'GOOGLEFINANCE fora do ar (timeout)' } : { status: 'Sucesso', ok: ['AAAA3'], falharam: [], naoProcessados: [] }),
  });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  // 3 tentativas na fila + 1 na recuperação; snapshot/pré-aquecimento (pulados) rodaram depois
  assert.equal(a.chamadas.ativos.length, 4);
  assert.equal(a.chamadas.snapshotResumo.length, 1);
  assert.equal(a.chamadas.preAquecer.length, 1);
  const e = a.estado();
  assert.equal(e.recuperacoes, 1);
  assert.equal(e.etapas.ativos.status, 'ok');
  assert.equal(e.situacao, 'concluida');
  assert.ok(e.log.some((l) => /recuperação em 60 min: Ativos/.test(l)));
  assert.equal(a.registro.length, 1, 'o "Erro" da falha final da fila já tinha sido gravado (1x)');

  // falhou também na recuperação: não agenda uma 2ª rodada
  const b = montar('2026-10-02T11:40:00Z', { ativos: () => ({ status: 'Erro', ok: [], falharam: [], naoProcessados: [], detalhe: 'timeout' }) });
  b.sb.despertadorAgendaDiaria();
  b.rodarFila();
  assert.equal(b.chamadas.ativos.length, 4);
  assert.equal(b.estado().situacao, 'falhou');
  assert.equal(b.pendentes().length, 0);
  assert.equal(b.registro.length, 1, 'e-mail/linha de Erro só 1x mesmo com a recuperação falhando');
  assert.equal(b.emails.length, 1);
});

test('Agenda (A-47): recuperação não acontece com fonte bloqueada (403/404/DNS), depois das 18h, nem pra etapa não recuperável', () => {
  const a = montar('2026-10-02T11:40:00Z', { ativos: () => ({ status: 'Erro', ok: [], falharam: [], naoProcessados: [], detalhe: 'GOOGLEFINANCE HTTP 403' }) });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.ativos.length, 2, '403: 2 tentativas e sem recuperação');
  assert.equal(a.estado().recuperacoes, 0);

  const b = montar('2026-10-02T20:30:00Z', { ativos: () => ({ status: 'Erro', ok: [], falharam: [], naoProcessados: [], detalhe: 'timeout' }) }); // 17:30 SP
  b.sb.rodarAgendaDiariaAgora();
  b.relogio.ms = utc('2026-10-02T21:10:00Z'); // 18:10 SP: a fila acaba depois das 18h
  b.rodarFila();
  assert.equal(b.estado().recuperacoes, 0);

  const c = montar('2026-10-02T11:40:00Z', { fundamentos: () => ({ status: 'Erro', detalhe: 'timeout', porTempo: false }) });
  c.sb.despertadorAgendaDiaria();
  c.rodarFila();
  assert.equal(c.chamadas.fundamentos.length, 3, 'fundamentos: 3 tentativas');
  assert.equal(c.estado().recuperacoes, 0, 'fundamentos não é recuperável (amanhã tem de novo)');
});

test('Agenda (A-47): reprocessarAgendaDiaria refaz o que falhou/foi pulado, com tentativas zeradas', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    rendaFixaIndices: (n) => (n <= 2 ? { status: 'Erro', detalhe: 'DNS error: bcb', essenciaisOk: false } : { status: 'Sucesso', detalhe: 'ok', essenciaisOk: true }),
  });
  a.sb.AGENDA_MAX_RECUPERACOES_ = 0;
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.estado().etapas.rendaFixaIndices.status, 'falhou');
  a.relogio.ms = utc('2026-10-02T15:00:00Z');
  const est = a.sb.reprocessarAgendaDiaria(['rendaFixaIndices']);
  assert.equal(est.situacao, 'agendada');
  assert.equal(a.pendentes().length, 1);
  a.rodarFila();
  const e = a.estado();
  assert.equal(a.chamadas.rendaFixaIndices.length, 3);
  assert.equal(e.etapas.rendaFixaIndices.status, 'ok');
  assert.equal(e.situacao, 'concluida');
  assert.equal(a.chamadas.ativos.length, 1, 'o que já deu certo não rodou de novo');
  // sem agenda de hoje: erro claro
  const b = montar('2026-10-02T11:40:00Z');
  assert.throws(() => b.sb.reprocessarAgendaDiaria(), /Não há agenda de hoje/);
});

test('Agenda (A-53): pré-aquecimento é a última etapa; faltou tempo -> nova tentativa continua; não há mais gatilho de 2 h', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    preAquecer: (n) => (n === 1 ? { ativos: 30, calculados: 10, jaEmCache: 0, faltaramPorTempo: 20, falhas: [] } : { ativos: 30, calculados: 20, jaEmCache: 10, faltaramPorTempo: 0, falhas: ['XXXX3: erro'] }),
  });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.preAquecer.length, 2);
  const e = a.estado();
  assert.equal(e.etapas.preAquecer.status, 'ok');
  assert.match(e.etapas.preAquecer.detalhe, /1 falha/);
  assert.equal(e.situacao, 'concluida');
  assert.ok(!a.gatilhos.some((g) => g.handler === 'gatilhoPreAquecerAtivos'));
});

test('Agenda (A-54): as linhas que a rotina grava saem rotuladas com a etapa e a tentativa (contexto do Registro)', () => {
  const a = montar('2026-10-02T11:40:00Z');
  const vistos = [];
  a.sb.definirContextoRegistro_ = (ctx) => vistos.push(ctx ? { etapa: ctx.etapa, tentativa: ctx.tentativa } : null);
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.deepEqual(vistos.slice(0, 4), [{ etapa: 'ativos', tentativa: 1 }, null, { etapa: 'rendaFixaIndices', tentativa: 1 }, null]);
  assert.equal(vistos.filter(Boolean).length, 9); // 8 + snapshotPrecos (A-56)
});

// A-55: calendário B3
test('Agenda (A-55): sábado e feriado da B3 não agendam nada; domingo também não', () => {
  const sab = montar('2026-10-03T11:30:00Z'); // sábado 08:30 SP
  sab.sb.despertadorAgendaDiaria();
  assert.equal(sab.pendentes().length, 0);
  assert.equal(sab.estado().situacao, 'sem pregao');
  assert.match(sab.estado().motivo, /Sábado/);
  assert.equal(sab.rodarFila(), 0);

  const feriado = montar('2026-09-07T11:30:00Z'); // 07/09/2026 (segunda): Independência
  feriado.sb.despertadorAgendaDiaria();
  assert.equal(feriado.pendentes().length, 0);
  assert.equal(feriado.estado().situacao, 'sem pregao');
  assert.match(feriado.estado().motivo, /Feriado da B3/);

  const util = montar('2026-09-08T11:30:00Z'); // terça: normal
  util.sb.despertadorAgendaDiaria();
  assert.equal(util.pendentes().length, 1);
  assert.equal(util.estado().situacao, 'agendada');

  const d = plain(sab.sb.agendaClassificarDia_('2026-12-25'));
  assert.equal(d.util, false);
  assert.equal(sab.sb.agendaClassificarDia_('2026-12-28').util, true);
});

test('Agenda (A-55): a aba "aux_feriados-b3" soma datas (aaaa-mm-dd, dd/mm/aaaa ou Date) à constante', () => {
  const a = montar('2026-10-14T11:30:00Z'); // quarta
  a.sb.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => (n === 'aux_feriados-b3' ? {
        getLastRow: () => 4,
        getRange: () => ({ getValues: () => [['2026-10-14'], ['15/10/2026'], [new a.sb.Date(Date.UTC(2026, 9, 16, 15))], ['lixo']] }),
      } : null),
    }),
  };
  a.sb.despertadorAgendaDiaria();
  assert.equal(a.estado().situacao, 'sem pregao');
  assert.equal(a.sb.agendaClassificarDia_('2026-10-15').util, false);
  assert.equal(a.sb.agendaClassificarDia_('2026-10-16').util, false);
  assert.equal(a.sb.agendaClassificarDia_('2026-10-19').util, true);
});

test('Agenda (A-55): sábado fecha lacuna do último dia de pregão (só as etapas recuperáveis que ficaram pra trás), 1x, nunca no domingo', () => {
  const sexta = montar('2026-10-02T11:40:00Z', {
    rendaFixaIndices: () => ({ status: 'Erro', detalhe: 'timeout BCB', essenciaisOk: false }),
  });
  sexta.sb.AGENDA_MAX_RECUPERACOES_ = 0;
  sexta.sb.despertadorAgendaDiaria();
  sexta.rodarFila();
  assert.equal(sexta.estado().etapas.rendaFixaIndices.status, 'falhou');

  // sábado, mesmo "banco" de Propriedades
  sexta.relogio.ms = utc('2026-10-03T11:30:00Z');
  sexta.sb.AGENDA_MAX_RECUPERACOES_ = 1;
  sexta.sb.despertadorAgendaDiaria();
  let e = sexta.estado();
  assert.equal(e.dia, '2026-10-03');
  assert.equal(e.modo, 'recuperacao');
  assert.equal(e.etapas.ativos.status, 'dispensada');
  assert.equal(e.etapas.rendaFixaIndices.status, 'pendente');
  assert.equal(sexta.pendentes().length, 1);
  assert.equal(sexta.pendentes()[0].at, utc('2026-10-03T13:01:00Z'));
  // um segundo despertador no mesmo sábado não recomeça nem apaga a recuperação
  sexta.sb.despertadorAgendaDiaria();
  assert.equal(sexta.estado().modo, 'recuperacao');
  const antes = { ...sexta.chamadas };
  sexta.rodarFila();
  assert.equal(sexta.chamadas.ativos.length, 1, 'ativos não rodou no sábado');
  assert.equal(sexta.chamadas.rendaFixaIndices.length, 3 + 1, 'sexta (3) + sábado (1 tentativa a mais)');
  void antes;

  // domingo: nada, mesmo com a lacuna (sábado foi recuperação)
  sexta.relogio.ms = utc('2026-10-04T11:30:00Z');
  sexta.sb.despertadorAgendaDiaria();
  assert.equal(sexta.estado().situacao, 'domingo');
  assert.equal(sexta.pendentes().length, 0);
});

test('Agenda (A-55): sexta sem pendência não gera rodada no sábado', () => {
  const a = montar('2026-10-02T11:40:00Z');
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.estado().situacao, 'concluida');
  a.relogio.ms = utc('2026-10-03T11:30:00Z');
  a.sb.despertadorAgendaDiaria();
  assert.equal(a.estado().situacao, 'sem pregao');
  assert.equal(a.pendentes().length, 0);
});
