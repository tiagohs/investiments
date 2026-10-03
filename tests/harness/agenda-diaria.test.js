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
 * jobs: { ativos, rendaFixaIndices, snapshotResumo, proventosFnet, informesFnet }
 * cada um uma função (n = nº da chamada, args) => retorno (ou lança).
 */
function montar(agoraIso, jobs = {}) {
  const props = {};
  const gatilhos = [];
  let uid = 0;
  const chamadas = { ativos: [], rendaFixaIndices: [], snapshotResumo: [], proventosFnet: [], informesFnet: [] };
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

test('Agenda: o dia é o de São Paulo (23h de sábado em SP já é domingo em UTC, e não é pulado)', () => {
  // 2026-10-04 é domingo; 02:30 UTC de domingo = 23:30 de sábado em SP
  const a = montar('2026-10-04T02:30:00Z');
  a.sb.despertadorAgendaDiaria();
  const e = a.estado();
  assert.equal(e.dia, '2026-10-03');
  assert.notEqual(e.situacao, 'domingo');
  assert.equal(e.proximaExecucao.slice(0, 10), '2026-10-03');
  // e 10:01 do sábado já passou -> começa em 1 min, não "amanhã"
  assert.equal(a.pendentes()[0].at, utc('2026-10-04T02:31:00Z'));
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
  const nomes = { ativos: 'atualizarHistorico', rendaFixaIndices: 'atualizarRendaFixaEIndicesDiario_', snapshotResumo: 'gravarSnapshotResumoHoje_', proventosFnet: 'atualizarProventosAnunciadosFii_', informesFnet: 'atualizarInformesFiiFnet_' };
  for (const [id, fn] of Object.entries(nomes)) {
    const orig = a.sb[fn];
    a.sb[fn] = (...x) => { ordem.push([id, a.relogio.ms]); return orig(...x); };
  }
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.deepEqual(ordem.map((o) => o[0]), ['ativos', 'rendaFixaIndices', 'snapshotResumo', 'proventosFnet', 'informesFnet']);
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

test('Agenda: principal falha 3x -> para nas 3 tentativas, secundárias não rodam e o estado diz o motivo', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    rendaFixaIndices: () => ({ status: 'Atenção', detalhe: 'Índices falharam: #N/A', essenciaisOk: false }),
  });
  const horarios = [];
  const orig = a.sb.atualizarRendaFixaEIndicesDiario_;
  a.sb.atualizarRendaFixaEIndicesDiario_ = (...x) => { horarios.push(a.relogio.ms); return orig(...x); };
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.ativos.length, 1);
  assert.equal(a.chamadas.rendaFixaIndices.length, 3, 'no máximo 3 tentativas');
  assert.deepEqual(horarios, [utc('2026-10-02T13:02:00Z'), utc('2026-10-02T13:12:00Z'), utc('2026-10-02T13:22:00Z')], 'novas tentativas reagendadas +10 min');
  assert.equal(a.chamadas.snapshotResumo.length, 0);
  assert.equal(a.chamadas.proventosFnet.length, 0);
  assert.equal(a.chamadas.informesFnet.length, 0);
  const e = a.estado();
  assert.equal(e.situacao, 'falhou');
  assert.match(e.motivo, /Renda Fixa \+ Índices/);
  assert.match(e.motivo, /3x/);
  assert.match(e.motivo, /Índices falharam/);
  assert.equal(e.etapas.rendaFixaIndices.status, 'falhou');
  assert.equal(e.etapas.snapshotResumo.status, 'pulada');
  assert.equal(e.etapas.informesFnet.status, 'pulada');
  assert.equal(a.registro.length, 1);
  assert.equal(a.registro[0][0], 'Erro');
  assert.equal(a.emails.length, 1);
  assert.equal(a.pendentes().length, 0);
  assert.equal(a.gatilhos.filter((g) => g.handler === 'etapaAgendaDiaria').length, 0);
  const texto = a.sb.estadoAgendaDiaria().texto;
  assert.match(texto, /falhou/);
});

test('Agenda: "Atenção" só da Carteira Renda Fixa (essenciaisOk) não segura as secundárias; versão antiga sem o campo exige "Sucesso"', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    rendaFixaIndices: () => ({ status: 'Atenção', detalhe: 'Carteira Renda Fixa não atualizada', essenciaisOk: true }),
  });
  a.sb.despertadorAgendaDiaria();
  a.rodarFila();
  assert.equal(a.chamadas.rendaFixaIndices.length, 1);
  assert.equal(a.chamadas.informesFnet.length, 1);

  const b = montar('2026-10-02T11:40:00Z', { rendaFixaIndices: () => ({ status: 'Atenção', detalhe: 'algo' }) });
  b.sb.despertadorAgendaDiaria();
  b.rodarFila();
  assert.equal(b.chamadas.rendaFixaIndices.length, 3);
  assert.equal(b.chamadas.proventosFnet.length, 0);
});

test('Agenda: secundária que falha 3x não impede as outras secundárias', () => {
  const a = montar('2026-10-02T11:40:00Z', {
    proventosFnet: () => ({ status: 'Erro', detalhe: 'FNet não respondeu' }),
    snapshotResumo: (n) => { if (n === 1) throw new Error('aba ocupada'); return { mudou: false }; },
  });
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

test('Agenda: 3 execuções mortas seguidas na principal -> falha final, sem secundárias', () => {
  let a;
  const fotos = [];
  a = montar('2026-10-02T11:40:00Z', {
    ativos: () => { fotos.push({ props: { ...a.props }, gatilhos: a.gatilhos.map((g) => ({ ...g })) }); return { status: 'Sucesso', ok: [], falharam: [], naoProcessados: [] }; },
  });
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
  assert.equal(a.chamadas.rendaFixaIndices.length, 0);
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

test('Agenda: instalarAgendaDiaria troca os gatilhos diários antigos e mantém vídeos/pré-aquecimento', () => {
  const a = montar('2026-10-02T11:00:00Z'); // 08:00 SP, antes das 10:01
  for (const h of ['gatilhoDiario', 'gatilhoDiarioRendaFixaEIndices', 'gatilhoDiarioProventosFnet', 'gatilhoDiarioInformesFnet', 'gatilhoVideos', 'gatilhoPreAquecerAtivos', 'despertadorAgendaDiaria']) {
    a.sb.ScriptApp.newTrigger(h).timeBased().everyDays(1).atHour(10).create();
  }
  const r = plain(a.sb.instalarAgendaDiaria());
  assert.deepEqual(r.removidos.sort(), ['despertadorAgendaDiaria', 'gatilhoDiario', 'gatilhoDiarioInformesFnet', 'gatilhoDiarioProventosFnet', 'gatilhoDiarioRendaFixaEIndices']);
  assert.deepEqual(r.mantidos.sort(), ['gatilhoPreAquecerAtivos', 'gatilhoVideos']);
  const handlers = a.gatilhos.map((g) => g.handler).sort();
  assert.deepEqual(handlers, ['despertadorAgendaDiaria', 'etapaAgendaDiaria', 'gatilhoPreAquecerAtivos', 'gatilhoVideos']);
  const desp = a.gatilhos.find((g) => g.handler === 'despertadorAgendaDiaria');
  assert.equal(desp.tipo, 'diario');
  assert.ok(desp.hora < 10, 'despertador antes das 10h');
  assert.equal(a.pendentes()[0].at, utc('2026-10-02T13:01:00Z'), 'antes das 10:01 já agenda hoje');

  // rodar de novo é idempotente (não duplica)
  a.sb.instalarAgendaDiaria();
  assert.equal(a.gatilhos.filter((g) => g.handler === 'despertadorAgendaDiaria').length, 1);
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
