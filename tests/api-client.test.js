// Unit tests for assets/js/api-client.js — fetch is mocked via Node's
// built-in test-runner mocking (t.mock.method), so nothing here ever
// touches the real Apps Script Web App.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ping, getSyncStatus, syncNow, importB3Transactions } from '../assets/js/api-client.js';

function jsonResponse(body) {
  return { json: async () => body };
}

test('ping() sends action=ping and the token as GET query params', async (t) => {
  let capturedUrl;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedUrl = url;
    assert.equal(opts.method, 'GET');
    return jsonResponse({ ok: true, autenticado_como: 'tiago@example.com', planilha: 'Investimentos' });
  });

  const result = await ping('tok123');

  assert.equal(result.ok, true);
  assert.equal(result.autenticado_como, 'tiago@example.com');
  const params = new URL(capturedUrl).searchParams;
  assert.equal(params.get('action'), 'ping');
  assert.equal(params.get('token'), 'tok123');
});

test('ping() normalizes a network failure into { ok:false, etapa:"network" }', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });

  const result = await ping('tok123');

  assert.equal(result.ok, false);
  assert.equal(result.etapa, 'network');
  assert.match(result.erro, /offline/);
});

test('getSyncStatus() calls action=syncStatus', async (t) => {
  let capturedUrl;
  t.mock.method(globalThis, 'fetch', async (url) => {
    capturedUrl = url;
    return jsonResponse({ ok: true, resultado: { status: 'Sucesso' } });
  });

  const result = await getSyncStatus('tok');

  assert.equal(result.resultado.status, 'Sucesso');
  assert.equal(new URL(capturedUrl).searchParams.get('action'), 'syncStatus');
});

test('importB3Transactions() posts action + transacoes as a JSON body field', async (t) => {
  let capturedBody;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedBody = opts.body;
    assert.equal(opts.method, 'POST');
    return jsonResponse({ ok: true, resultado: { gravadas: ['WIZC3'], rejeitadas: [] } });
  });

  const result = await importB3Transactions('tok', [
    { ticker: 'WIZC3', data: '2026-01-01', tipo: 'Compra', preco: 10, qtd: 1, taxa: 0 },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.written, ['WIZC3']);
  assert.equal(capturedBody.get('action'), 'importarTransacoesB3');
  const sent = JSON.parse(capturedBody.get('transacoes'));
  assert.equal(sent[0].ticker, 'WIZC3');
});

test('importB3Transactions() forwards testOptions as opcoesTeste', async (t) => {
  let capturedBody;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedBody = opts.body;
    return jsonResponse({ ok: true, resultado: { gravadas: [], rejeitadas: [] } });
  });

  await importB3Transactions('tok', [], { abaTransacoesNome: 'aux_tests' });

  assert.deepEqual(JSON.parse(capturedBody.get('opcoesTeste')), { abaTransacoesNome: 'aux_tests' });
});

test('importB3Transactions() surfaces a rejected batch without throwing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse({
    ok: false,
    etapa: 'validação',
    erro: 'Campo "transacoes" não é um JSON válido',
  }));

  const result = await importB3Transactions('tok', []);

  assert.equal(result.ok, false);
  assert.equal(result.step, 'validação');
  assert.match(result.error, /JSON válido/);
});

test('syncNow() returns the accumulated result after a single successful round', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse({
    ok: true,
    resultado: { status: 'Sucesso', ok: ['WIZC3', 'VALE3'], falharam: [], naoProcessados: [], lacunas: [] },
  }));

  const result = await syncNow('tok');

  assert.equal(result.ok, true);
  assert.equal(result.status, 'Sucesso');
  assert.equal(result.rounds, 1);
  assert.deepEqual(result.okList, ['WIZC3', 'VALE3']);
  assert.deepEqual(result.failed, []);
});

test('syncNow() resumes automatically until naoProcessados is empty, accumulating across rounds', async (t) => {
  let call = 0;
  const tickersPerCall = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    call += 1;
    const sentTickers = opts.body.get('tickers');
    tickersPerCall.push(sentTickers ? JSON.parse(sentTickers) : null);
    if (call === 1) {
      return jsonResponse({ ok: true, resultado: { status: 'Atenção', ok: ['WIZC3'], falharam: [], naoProcessados: ['VALE3'], lacunas: [] } });
    }
    return jsonResponse({ ok: true, resultado: { status: 'Sucesso', ok: ['VALE3'], falharam: [], naoProcessados: [], lacunas: [] } });
  });

  const seenRounds = [];
  const result = await syncNow('tok', { onRound: (r) => seenRounds.push(r.round) });

  assert.equal(call, 2);
  assert.equal(result.ok, true);
  assert.equal(result.rounds, 2);
  assert.deepEqual(result.okList, ['WIZC3', 'VALE3']);
  assert.deepEqual(seenRounds, [1, 2]);
  // 2nd round only retries the leftover ticker, never the full 29 again.
  assert.deepEqual(tickersPerCall[1], ['VALE3']);
});

test('syncNow() stops and reports what it accumulated so far if a round fails outright', async (t) => {
  let call = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    call += 1;
    if (call === 1) {
      return jsonResponse({ ok: true, resultado: { status: 'Atenção', ok: ['WIZC3'], falharam: [], naoProcessados: ['VALE3'], lacunas: [] } });
    }
    return jsonResponse({ ok: false, etapa: 'planilha', erro: 'aba não encontrada' });
  });

  const result = await syncNow('tok');

  assert.equal(result.ok, false);
  assert.equal(result.step, 'planilha');
  assert.match(result.error, /aba não encontrada/);
  assert.equal(result.rounds, 2);
  assert.deepEqual(result.okList, ['WIZC3']);
});
