// Unit tests for assets/js/api-client.js — fetch is mocked via Node's
// built-in test-runner mocking (t.mock.method), so nothing here ever
// touches the real Apps Script Web App.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ping, getSyncStatus, getSyncHistorico, getHome, syncNow, importB3Transactions, getDistribuicoesMetas, salvarMetaRendaPassiva, salvarMetaPatrimonio, salvarMesesRendaEmergencial, limparCacheHistorico, getHistoricoAtivo, getAtivo, getNoticiasAtivo, getTesesAtivo, getIntradia, getDespesas, salvarDespesas, getSalario, salvarSalarioBase, salvarPagamentoSalario, excluirPagamentoSalario } from '../assets/js/api-client.js';

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

test('getSyncHistorico() calls action=syncHistorico with the token and a default limite=20', async (t) => {
  let capturedUrl;
  t.mock.method(globalThis, 'fetch', async (url) => {
    capturedUrl = url;
    return jsonResponse({ ok: true, resultado: [{ status: 'Sucesso' }, { status: 'Atenção' }] });
  });

  const result = await getSyncHistorico('tok');

  assert.equal(result.resultado.length, 2);
  const params = new URL(capturedUrl).searchParams;
  assert.equal(params.get('action'), 'syncHistorico');
  assert.equal(params.get('token'), 'tok');
  assert.equal(params.get('limite'), '20');
});

test('getSyncHistorico() aceita um limite customizado', async (t) => {
  let capturedUrl;
  t.mock.method(globalThis, 'fetch', async (url) => {
    capturedUrl = url;
    return jsonResponse({ ok: true, resultado: [] });
  });

  await getSyncHistorico('tok', 5);

  assert.equal(new URL(capturedUrl).searchParams.get('limite'), '5');
});

test('getHistoricoAtivo() calls action=historicoAtivo with the token and the ticker', async (t) => {
  let capturedUrl;
  t.mock.method(globalThis, 'fetch', async (url) => {
    capturedUrl = url;
    return jsonResponse({ ok: true, resultado: { ticker: 'BBAS3', serie: [{ data: '2026-09-01', preco: 22.14 }] } });
  });

  const result = await getHistoricoAtivo('tok', 'BBAS3');

  assert.equal(result.resultado.serie.length, 1);
  const params = new URL(capturedUrl).searchParams;
  assert.equal(params.get('action'), 'historicoAtivo');
  assert.equal(params.get('token'), 'tok');
  assert.equal(params.get('ticker'), 'BBAS3');
});

test('getHome() calls action=home and returns patrimônio/índices/câmbio as-is', async (t) => {
  let capturedUrl;
  const backendResponse = {
    ok: true,
    patrimonio: {
      total: 147978.99,
      longoPrazo: 87218.72,
      rendaEmergencial: 60760.27,
      porClasse: { acoes: 28946.36, fiis: 35648, rendaFixa: 65455.4, acoesEua: 17929.23 },
    },
    indices: {
      ibovespa: { valor: 187206.89, variacaoDia: -0.56 },
      ifix: { valor: 3748.63, variacaoDia: 0.04 },
      spx: { valor: 7656.98, variacaoDia: 0.86 },
    },
    cambio: { usd: 5.121516, eur: 5.945312 },
  };
  t.mock.method(globalThis, 'fetch', async (url) => {
    capturedUrl = url;
    return jsonResponse(backendResponse);
  });

  const result = await getHome('tok');

  assert.deepEqual(result, backendResponse);
  const params = new URL(capturedUrl).searchParams;
  assert.equal(params.get('action'), 'home');
  assert.equal(params.get('token'), 'tok');
});

test('getHome() normalizes a network failure into { ok:false, etapa:"network" }', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });

  const result = await getHome('tok');

  assert.equal(result.ok, false);
  assert.equal(result.etapa, 'network');
});

test('getHome() passes through a backend error shape without throwing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse({
    ok: false,
    etapa: 'home',
    erro: 'aba não encontrada: 📊Dash Geral',
  }));

  const result = await getHome('tok');

  assert.equal(result.ok, false);
  assert.equal(result.etapa, 'home');
  assert.match(result.erro, /Dash Geral/);
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

test('getDistribuicoesMetas() calls action=distribuicoesMetas as GET', async (t) => {
  let capturedUrl;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedUrl = url;
    assert.equal(opts.method, 'GET');
    return jsonResponse({ ok: true, metas: { rendaPassiva: { meta: 500, mediaUlt12Meses: 300, percentualAtingido: 0.6 } } });
  });

  const result = await getDistribuicoesMetas('tok');

  assert.equal(result.ok, true);
  assert.equal(result.metas.rendaPassiva.meta, 500);
  assert.equal(new URL(capturedUrl).searchParams.get('action'), 'distribuicoesMetas');
});

test('limparCacheHistorico() POSTs action=limparCacheHistorico with the token', async (t) => {
  let capturedBody;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedBody = opts.body;
    assert.equal(opts.method, 'POST');
    return jsonResponse({ ok: true, resultado: { limpou: true, chave: 'historico_serie_v4_1_2_3_4', pedacosRemovidos: 2 } });
  });

  const result = await limparCacheHistorico('tok');

  assert.equal(result.ok, true);
  assert.equal(result.resultado.limpou, true);
  assert.equal(capturedBody.get('action'), 'limparCacheHistorico');
  assert.equal(capturedBody.get('token'), 'tok');
});

test('salvarMetaRendaPassiva() POSTs action + valor as form-urlencoded fields', async (t) => {
  let capturedBody;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedBody = opts.body;
    assert.equal(opts.method, 'POST');
    return jsonResponse({ ok: true });
  });

  const result = await salvarMetaRendaPassiva('tok', 600);

  assert.equal(result.ok, true);
  assert.equal(capturedBody.get('action'), 'salvarMetaRendaPassiva');
  assert.equal(capturedBody.get('token'), 'tok');
  assert.equal(capturedBody.get('valor'), '600');
});

test('salvarMetaPatrimonio() forwards only the fields passed in', async (t) => {
  let capturedBody;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedBody = opts.body;
    return jsonResponse({ ok: true });
  });

  await salvarMetaPatrimonio('tok', { extra: 4500, percentualReinvestimento: 0.3 });

  assert.equal(capturedBody.get('action'), 'salvarMetaPatrimonio');
  assert.equal(capturedBody.get('extra'), '4500');
  assert.equal(capturedBody.get('percentualReinvestimento'), '0.3');
  assert.equal(capturedBody.has('rendimentoMedio'), false);
});

test('salvarMesesRendaEmergencial() POSTs action + meses', async (t) => {
  let capturedBody;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedBody = opts.body;
    return jsonResponse({ ok: true });
  });

  await salvarMesesRendaEmergencial('tok', 8);

  assert.equal(capturedBody.get('action'), 'salvarMesesRendaEmergencial');
  assert.equal(capturedBody.get('meses'), '8');
});

// 25/09/2026: tela Detalhe do ativo (apps-script/Ativo.gs)
test('getAtivo()/getNoticiasAtivo()/getTesesAtivo() fazem GET com a action e os parâmetros certos', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { urls.push(new URL(url)); return jsonResponse({ ok: true }); });
  await getAtivo('tok', 'rf:Tesouro IPCA+ 2029|XP');
  await getNoticiasAtivo('tok', { ticker: 'TEST3', nome: 'Teste S.A.', classe: 'acoes' });
  await getTesesAtivo('tok', 'TEST3');
  assert.deepEqual(urls.map((u) => u.searchParams.get('action')), ['ativo', 'noticiasAtivo', 'tesesAtivo']);
  assert.equal(urls[0].searchParams.get('ref'), 'rf:Tesouro IPCA+ 2029|XP');
  assert.equal(urls[1].searchParams.get('nome'), 'Teste S.A.');
  assert.equal(urls[1].searchParams.get('classe'), 'acoes');
  assert.equal(urls[2].searchParams.get('ticker'), 'TEST3');
  assert.ok(urls.every((u) => u.searchParams.get('token') === 'tok'));
});

// 25/09/2026: login -> sessão de vários dias (Auth.gs!handleCriarSessao)
test('criarSessao() faz POST com o token do Google; resposta "autenticação" recusada esquece o token guardado', async (t) => {
  const { criarSessao, getAtivo: getAtivo2 } = await import('../assets/js/api-client.js');
  const { setToken, getToken } = await import('../assets/js/auth.js');
  let corpo;
  t.mock.method(globalThis, 'fetch', async (url, opts) => { corpo = opts && opts.body; return jsonResponse({ ok: true, token: 's1.a.b', exp: 1 }); });
  const r = await criarSessao('google.jwt.x');
  assert.equal(r.token, 's1.a.b');
  assert.equal(corpo.get('action'), 'criarSessao');
  assert.equal(corpo.get('token'), 'google.jwt.x');

  const b64 = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  setToken(`s1.${b64}.x`);
  assert.ok(getToken());
  t.mock.method(globalThis, 'fetch', async () => jsonResponse({ ok: false, etapa: 'autenticação', erro: 'sessão expirada' }));
  await getAtivo2(getToken(), 'TEST3');
  assert.equal(getToken(), null);
});

// 26/09/2026: gráfico do dia da Início (apps-script/Intradia.gs)
test('getIntradia() calls action=intradia with the keys joined by comma', async (t) => {
  let capturedUrl;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    capturedUrl = url;
    assert.equal(opts.method, 'GET');
    return jsonResponse({ ok: true, resultado: { IBOV: null } });
  });
  const r = await getIntradia('tok', ['IBOV', 'acoes:AAAA3', 'usa:CCCC']);
  assert.equal(r.ok, true);
  const params = new URL(capturedUrl).searchParams;
  assert.equal(params.get('action'), 'intradia');
  assert.equal(params.get('simbolos'), 'IBOV,acoes:AAAA3,usa:CCCC');
  assert.equal(params.get('token'), 'tok');
});

// 26/09/2026: Organização Financeira (Despesas.gs / Salario.gs)
test('Organização: getDespesas/getSalario (GET) e as gravações (POST form-encoded, JSON onde precisa)', async (t) => {
  const vistos = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    vistos.push({ metodo: opts.method, params: opts.method === 'GET' ? new URL(url).searchParams : new URLSearchParams(opts.body) });
    return jsonResponse({ ok: true });
  });
  await getDespesas('tk');
  await getSalario('tk');
  await salvarDespesas('tk', { itens: [{ nome: 'X', valor: 1 }], folga: 0.1, meses: 6, sobra: 0.1, assinatura: 'a' });
  await salvarSalarioBase('tk', { liquido: 1000, percentual: 0.2 });
  await salvarPagamentoSalario('tk', { mes: '2026-01', liquido: 10 }, { usarComoBase: true });
  await excluirPagamentoSalario('tk', '2026-01', 'Mensal');
  assert.deepEqual(vistos.map((v) => [v.metodo, v.params.get('action')]), [
    ['GET', 'despesas'], ['GET', 'salario'], ['POST', 'salvarDespesas'], ['POST', 'salvarSalarioBase'], ['POST', 'salvarPagamentoSalario'], ['POST', 'excluirPagamentoSalario'],
  ]);
  assert.deepEqual(JSON.parse(vistos[2].params.get('itens')), [{ nome: 'X', valor: 1 }]);
  assert.equal(vistos[2].params.get('assinatura'), 'a');
  assert.equal(vistos[3].params.get('percentual'), '0.2');
  assert.equal(JSON.parse(vistos[4].params.get('pagamento')).mes, '2026-01');
  assert.equal(vistos[4].params.get('usarComoBase'), '1');
  assert.equal(vistos[5].params.get('tipo'), 'Mensal');
});
