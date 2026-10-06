// tests/harness/fontes.test.js
//
// 05/10/2026 (auditoria A-48, A-49, A-51): apps-script/Fontes.gs - disjuntor persistente por fonte, buscarFonte_
// (cache -> fetch -> último bom, valida HTTP e formato, vazio != erro) e fetchAll em lotes - e o FNet
// (FnetProventos.gs / FnetInformesFii.gs) usando isso. Tudo com planilha/serviços FALSOS e dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';

const resp = (codigo, texto) => ({ getResponseCode: () => codigo, getContentText: () => (typeof texto === 'string' ? texto : JSON.stringify(texto)) });

function montar({ abas = {} } = {}) {
  const ss = planilhaFalsa(abas);
  const r = sandboxGas(ss);
  return { ...r, ss };
}
const HORA = 3600000;

// ---------------------------------------------------------------------------
// Disjuntor
// ---------------------------------------------------------------------------

test('Disjuntor: 403 abre por 12 h na hora; 429 por 1 h; 404 não conta; 5xx só depois de 3 seguidas (5 min); sucesso fecha', () => {
  const { sb, props } = montar();
  const agora = 1_800_000_000_000;
  assert.equal(sb.fonteAberta_('yahoo-query1', agora), null);

  sb.fonteFalhou_('yahoo-query1', { codigo: 404 }, agora);
  assert.equal(sb.fonteAberta_('yahoo-query1', agora), null, '404 = ticker inexistente, não é a fonte quebrada');

  sb.fonteFalhou_('yahoo-query1', { codigo: 403 }, agora);
  const aberto = plain(sb.fonteAberta_('yahoo-query1', agora + HORA));
  assert.equal(aberto.motivo, 'HTTP 403');
  assert.equal(aberto.ate, agora + 12 * HORA);
  assert.equal(sb.fonteAberta_('yahoo-query1', agora + 12 * HORA + 1), null, 'passou a pausa: libera (a próxima chamada é a sonda)');
  assert.ok(props.has('FONTE_ESTADO_yahoo-query1'), 'persistido nas Propriedades (vale em outras execuções)');

  sb.fonteFalhou_('bcb', { codigo: 429 }, agora);
  assert.equal(sb.fonteAberta_('bcb', agora).ate, agora + HORA);

  for (let i = 0; i < 2; i++) sb.fonteFalhou_('fnet', { codigo: 503 }, agora);
  assert.equal(sb.fonteAberta_('fnet', agora), null, '2 falhas seguidas: ainda não abre');
  sb.fonteFalhou_('fnet', { erro: 'Exception: Erro de DNS: https://x' }, agora);
  assert.equal(sb.fonteAberta_('fnet', agora).ate, agora + 5 * 60000, '3 seguidas: pausa curta');
  assert.match(sb.fonteDescreverPausa_('fnet', sb.fonteAberta_('fnet', agora)), /^fnet em pausa \(Erro de DNS/);

  sb.fonteDeuCerto_('fnet');
  assert.equal(sb.fonteAberta_('fnet', agora), null);
  assert.equal(plain(sb.fonteLerEstado_('fnet')).falhas, 0, 'sucesso zera a contagem');

  // sonda que falha depois da pausa reabre na hora (a contagem não foi zerada)
  sb.fonteFalhou_('sec', { codigo: 503 }, agora); sb.fonteFalhou_('sec', { codigo: 503 }, agora); sb.fonteFalhou_('sec', { codigo: 503 }, agora);
  const depois = agora + 6 * 60000;
  assert.equal(sb.fonteAberta_('sec', depois), null);
  sb.fonteFalhou_('sec', { codigo: 503 }, depois);
  assert.ok(sb.fonteAberta_('sec', depois), 'uma falha da sonda reabre');
});

test('fonteNomeDaUrl_: Yahoo por host, SEC/CVM/BCB/Olinda/Tesouro/FNet por fonte', () => {
  const { sb } = montar();
  const n = (u) => sb.fonteNomeDaUrl_(u);
  assert.equal(n('https://query1.finance.yahoo.com/v8/finance/chart/X'), 'yahoo-query1');
  assert.equal(n('https://query2.finance.yahoo.com/v8/finance/chart/X'), 'yahoo-query2');
  assert.equal(n('https://www.sec.gov/files/company_tickers.json'), 'sec');
  assert.equal(n('https://dados.cvm.gov.br/dados/FII/x.zip'), 'cvm');
  assert.equal(n('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados'), 'bcb');
  assert.equal(n('https://olinda.bcb.gov.br/olinda/servico/Expectativas'), 'olinda');
  assert.equal(n('https://fnet.bmfbovespa.com.br/fnet/publico/x'), 'fnet');
  assert.equal(n('https://www.tesourotransparente.gov.br/ckan/x.csv'), 'tesouro');
});

// ---------------------------------------------------------------------------
// buscarFonte_
// ---------------------------------------------------------------------------

test('buscarFonte_: cache -> rede; 2ª chamada vem do cache sem fetch; nunca lança', () => {
  const { sb } = montar();
  let n = 0;
  const fetch = () => { n += 1; return resp(200, [{ data: '01/10/2026', valor: '13.75' }]); };
  const r1 = plain(sb.buscarFonte_('bcb', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1', { fetch, validar: Array.isArray }));
  assert.equal(r1.ok, true); assert.equal(r1.origem, 'rede'); assert.equal(r1.dados[0].valor, '13.75');
  const r2 = plain(sb.buscarFonte_('bcb', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1', { fetch, validar: Array.isArray }));
  assert.equal(r2.origem, 'cache'); assert.equal(n, 1);
  const r3 = sb.buscarFonte_('bcb', 'https://x/1', { fetch: () => { throw new Error('Exception: Erro de DNS'); } });
  assert.equal(r3.ok, false);
  assert.match(r3.aviso, /Erro de DNS/);
});

test('buscarFonte_: fonte cai -> devolve o ÚLTIMO BOM com a data ("dado de DD/MM"); sem último bom, ok:false com o motivo', () => {
  const { sb } = montar();
  const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1';
  sb.buscarFonte_('bcb', url, { fetch: () => resp(200, [{ valor: '13.75' }]), ttl: 0, validar: Array.isArray });
  const r = plain(sb.buscarFonte_('bcb', url, { fetch: () => resp(500, 'x'), ttl: 0, ttlNegativo: 0 }));
  assert.equal(r.ok, true);
  assert.equal(r.origem, 'ultimo-bom');
  assert.equal(r.dados[0].valor, '13.75');
  assert.match(r.aviso, /^dado de \d{2}\/\d{2} \(bcb: HTTP 500\)$/);
  assert.match(r.dataDado, /^\d{4}-\d{2}-\d{2}$/);

  const sem = plain(sb.buscarFonte_('olinda', 'https://olinda.bcb.gov.br/x', { fetch: () => resp(500, 'x'), ttl: 0 }));
  assert.equal(sem.ok, false);
  assert.equal(sem.dados, null);
  assert.match(sem.aviso, /HTTP 500/);
});

test('buscarFonte_: valida HTTP e Array.isArray ANTES do .map (resposta de erro do BCB não vira TypeError)', () => {
  const { sb } = montar();
  // objeto de erro no lugar da lista
  const r = plain(sb.buscarFonte_('bcb', 'https://x/a', { fetch: () => resp(200, { error: 'sem dados' }), ttl: 0, ultimoBom: false, validar: Array.isArray }));
  assert.equal(r.ok, false);
  assert.match(r.aviso, /resposta inesperada/);
  // com semListaComoVazio (intervalo só de fim de semana) é "sem dado", não erro
  const v = plain(sb.buscarFonte_('bcb', 'https://x/b', { fetch: () => resp(200, { error: 'x' }), ttl: 0, ultimoBom: false, validar: Array.isArray, semListaComoVazio: true }));
  assert.deepEqual([v.ok, v.vazio, v.dados], [true, true, []]);
  // corpo que nem é JSON (página de erro com 200)
  const h = plain(sb.buscarFonte_('bcb', 'https://x/c', { fetch: () => resp(200, '<html>manutenção</html>'), ttl: 0, ultimoBom: false }));
  assert.equal(h.ok, false);
  assert.match(h.aviso, /ilegível/);
});

test('buscarFonte_: lista vazia (fim de semana/feriado) é ok+vazio, não é erro e NÃO apaga o último bom', () => {
  const { sb } = montar();
  const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?x=1';
  sb.buscarFonte_('bcb', url, { fetch: () => resp(200, [{ data: '02/10/2026', valor: '0.05' }]), ttl: 0, validar: Array.isArray });
  const vazio = plain(sb.buscarFonte_('bcb', url, { fetch: () => resp(200, []), ttl: 0, validar: Array.isArray }));
  assert.deepEqual([vazio.ok, vazio.vazio, vazio.origem], [true, true, 'rede']);
  const falha = plain(sb.buscarFonte_('bcb', url, { fetch: () => resp(503, ''), ttl: 0, ttlNegativo: 0 }));
  assert.equal(falha.origem, 'ultimo-bom');
  assert.equal(falha.dados[0].valor, '0.05', 'o vazio de sábado não sobrescreveu o dado de sexta');
});

test('buscarFonte_: disjuntor aberto = nenhuma chamada de rede (cai no último bom); cache negativo evita repetir a falha', () => {
  const { sb } = montar();
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/X';
  let n = 0;
  const fetch = (u) => { n += 1; return resp(403, 'Forbidden'); };
  const a = plain(sb.buscarFonte_('yahoo-query1', url, { fetch, ttl: 0, ttlNegativo: 0 }));
  assert.equal(a.ok, false); assert.equal(n, 1);
  const b = plain(sb.buscarFonte_('yahoo-query1', url, { fetch, ttl: 0, ttlNegativo: 0 }));
  assert.equal(n, 1, '403 abriu o disjuntor: a 2ª chamada nem sai');
  assert.match(b.aviso, /yahoo-query1 em pausa \(HTTP 403/);

  const outra = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1';
  let m = 0;
  const f2 = () => { m += 1; return resp(404, 'nada'); };
  sb.buscarFonte_('bcb', outra, { fetch: f2, ttl: 3600, ttlNegativo: 120 });
  sb.buscarFonte_('bcb', outra, { fetch: f2, ttl: 3600, ttlNegativo: 120 });
  assert.equal(m, 1, 'cache negativo: a falha recente não é refeita a cada abertura de tela');
});

test('buscarFonte_: último bom grande é guardado em pedaços (limite de 9 KB por propriedade) e volta inteiro; grande demais não quebra', () => {
  const { sb, props } = montar();
  const grande = Array.from({ length: 900 }, (_, i) => ({ t: 'TITULO ' + i, v: i * 1.5 })); // ~ 20 KB
  sb.buscarFonte_('tesouro', 'https://x/grande', { fetch: () => resp(200, grande), ttl: 0, validar: Array.isArray });
  assert.ok([...props.keys()].filter((k) => k.startsWith('FONTE_BOM_')).length >= 3);
  for (const [k, v] of props) if (k.startsWith('FONTE_BOM_')) assert.ok(v.length <= 9000, k + ' passou de 9 KB');
  const r = plain(sb.buscarFonte_('tesouro', 'https://x/grande', { fetch: () => resp(500, ''), ttl: 0, ttlNegativo: 0 }));
  assert.equal(r.origem, 'ultimo-bom');
  assert.equal(r.dados.length, 900);
  const enorme = Array.from({ length: 5000 }, (_, i) => ({ t: 'TITULO ' + i }));
  const e = plain(sb.buscarFonte_('tesouro', 'https://x/enorme', { fetch: () => resp(200, enorme), ttl: 0, validar: Array.isArray }));
  assert.equal(e.ok, true, 'não coube no último bom, mas a resposta de agora é entregue');
});

// ---------------------------------------------------------------------------
// fetchAll em lotes
// ---------------------------------------------------------------------------

test('fonteFetchEmLotes_: 25 pedidos = 3 fetchAll (10, 10, 5), na ordem; respeita a cota de tempo e o disjuntor', () => {
  const { sb } = montar();
  const lotes = [];
  const fetchAll = (ps) => { lotes.push(ps.length); return ps.map((p) => resp(200, p.url)); };
  const pedidos = Array.from({ length: 25 }, (_, i) => ({ url: 'https://fnet.bmfbovespa.com.br/x?i=' + i }));
  const r = plain(sb.fonteFetchEmLotes_('fnet', pedidos, { fetchAll }));
  assert.deepEqual(lotes, [10, 10, 5]);
  assert.ok(r.every((x, i) => x.ok && x.texto === pedidos[i].url));

  // acabou o tempo depois do 1º lote
  lotes.length = 0;
  let chamadas = 0;
  const r2 = plain(sb.fonteFetchEmLotes_('fnet', pedidos, { fetchAll, temTempo: () => (chamadas++ < 1) }));
  assert.deepEqual(lotes, [10]);
  assert.equal(r2.filter((x) => x.ok).length, 10);
  assert.ok(r2.slice(10).every((x) => x.pulado && x.porTempo));

  // tudo 403: o disjuntor abre depois do 1º lote e os outros nem saem
  lotes.length = 0;
  const r3 = plain(sb.fonteFetchEmLotes_('sec', pedidos, { fetchAll: (ps) => { lotes.push(ps.length); return ps.map(() => resp(403, '')); } }));
  assert.deepEqual(lotes, [10]);
  assert.ok(r3.every((x) => !x.ok));
  lotes.length = 0;
  sb.fonteFetchEmLotes_('sec', pedidos, { fetchAll });
  assert.deepEqual(lotes, [], 'segue em pausa na próxima execução');

  // exceção no fetchAll (1 URL com DNS ruim derruba o lote): refaz um a um e sai com o que deu
  const { sb: sb2 } = montar();
  const r4 = plain(sb2.fonteFetchEmLotes_('fnet', pedidos.slice(0, 3), {
    fetchAll: () => { throw new Error('Exception: DNS'); },
    fetch: (u) => (u.includes('i=1') ? (() => { throw new Error('Exception: DNS'); })() : resp(200, 'ok')),
  }));
  assert.deepEqual(r4.map((x) => x.ok), [true, false, true]);
});

// ---------------------------------------------------------------------------
// FNet (A-48): lotes de 10, sem baixar de novo o já visto, cota própria, pendentes primeiro, sem perder informes
// ---------------------------------------------------------------------------

const xmlProvento = (ticker, base, valor, pag) => `<DadosEconomicoFinanceiros><InformeRendimentos><Provento><CodNegociacao>${ticker}</CodNegociacao><Rendimento><DataBase>${base}</DataBase><ValorProvento>${valor}</ValorProvento><DataPagamento>${pag}</DataPagamento><RendimentoIsentoIR>Sim</RendimentoIsentoIR></Rendimento></Provento></InformeRendimentos></DadosEconomicoFinanceiros>`;

function montarFnet(qtd) {
  const tickers = Array.from({ length: qtd }, (_, i) => `FFF${String(i).padStart(2, '0')}11`);
  const cab = ['Classe', 'Ticker', 'Nome', 'Tipo', 'Moeda', 'Preço Atual', 'Variação dia', 'Quantidade'];
  const abas = {
    Auxiliar_ativos: [cab, ...tickers.map((t) => ['FIIs', t, 'Fundo ' + t, '', 'R$', 10, 0, 100])],
    'aux_fii-cnpj': [['Ticker', 'CNPJ', 'Origem', 'Atualizado em'], ...tickers.map((t, i) => [t, String(10000000000000 + i), 'teste', ''])],
  };
  const m = montar({ abas });
  const cnpjDe = (t) => String(10000000000000 + tickers.indexOf(t));
  const tickerDe = (cnpj) => tickers[Number(cnpj) - 10000000000000];
  const chamadas = { fetchAll: [], fetch: 0, downloads: 0, listas: [] };
  const falhar = new Set();
  const fetchAll = (ps) => {
    chamadas.fetchAll.push(ps.length);
    return ps.map((p) => {
      let x = p.url.match(/cnpjFundo=(\d+)/);
      if (x) {
        const t = tickerDe(x[1]);
        chamadas.listas.push(t);
        if (falhar.has(t)) return resp(500, '');
        const informes = /idCategoriaDocumento=14/.test(p.url) ? [{ id: 9000 + tickers.indexOf(t) }] : [{ id: 100 + tickers.indexOf(t), categoriaDocumento: 'Fato Relevante', assuntos: 'Assunto ' + t, dataEntrega: '01/10/2026' }];
        return resp(200, { data: informes });
      }
      x = p.url.match(/downloadDocumento\?id=(\d+)/);
      if (x) {
        chamadas.downloads += 1;
        const t = tickers[Number(x[1]) - 9000];
        return resp(200, xmlProvento(t, '2026-09-30', '0.90', '2026-10-15'));
      }
      return resp(404, '');
    });
  };
  m.sb.UrlFetchApp = { fetchAll, fetch: () => { chamadas.fetch += 1; throw new Error('fetch simples não devia ser usado'); } };
  return { ...m, tickers, chamadas, falhar };
}

test('FNet proventos (A-48): 25 FIIs = listas em 3 lotes + 25 documentos em 3 lotes; na 2ª execução nada é baixado (ids já vistos)', () => {
  const t = montarFnet(25);
  const r1 = plain(t.sb.atualizarProventosAnunciadosFii_('Manual'));
  assert.equal(r1.novos, 25, JSON.stringify(r1));
  assert.deepEqual(t.chamadas.fetchAll, [10, 10, 5, 10, 10, 5], 'listas em lotes de 10, depois os documentos em lotes de 10');
  assert.equal(t.chamadas.fetch, 0);
  assert.equal(t.chamadas.downloads, 25);
  assert.match(r1.detalhe, /25 documento\(s\) lido\(s\) de 25 FII/);

  t.chamadas.fetchAll.length = 0; t.chamadas.downloads = 0;
  const r2 = plain(t.sb.atualizarProventosAnunciadosFii_('Manual'));
  assert.equal(r2.novos, 0);
  assert.equal(t.chamadas.downloads, 0, 'não baixa de novo o que já viu');
  assert.deepEqual(t.chamadas.fetchAll, [10, 10, 5], 'só as listas');
  assert.match(r2.detalhe, /25 já visto\(s\)/);
});

test('FNet proventos (A-48): sem tempo vira pendência guardada e esses FIIs vão PRIMEIRO na próxima execução; FII que falha não derruba os outros', () => {
  const t = montarFnet(12);
  t.sb.FNET_LIMITE_MS_ = 1; // cota própria esgotada antes de começar
  const r1 = plain(t.sb.atualizarProventosAnunciadosFii_('Manual'));
  assert.equal(t.chamadas.fetchAll.length, 0, 'sem tempo: nenhuma chamada');
  assert.match(r1.detalhe, /ficou pra próxima \(tempo\)/);
  assert.equal(JSON.parse(t.props.get('FNET_PENDENTES_PROV')).length, 12);

  t.sb.FNET_LIMITE_MS_ = 5 * 60 * 1000;
  t.falhar.add('FFF03' + '11');
  const r2 = plain(t.sb.atualizarProventosAnunciadosFii_('Manual'));
  assert.equal(r2.novos, 11, 'o FII que falhou não impede os outros');
  assert.equal(r2.status, 'Atenção');
  assert.match(r2.detalhe, /FFF0311 \(HTTP 500\)/);
  assert.deepEqual(JSON.parse(t.props.get('FNET_PENDENTES_PROV')), ['FFF0311'], 'só quem falhou fica pendente');

  t.chamadas.listas.length = 0; t.falhar.clear();
  t.sb.atualizarProventosAnunciadosFii_('Manual');
  assert.equal(t.chamadas.listas[0], 'FFF0311', 'o pendente é o primeiro da fila');
});

test('FNet informes (A-48): lista em lotes de 10; lista igual (hash) não regrava a aba nem apaga o cache; quem falha MANTÉM os informes antigos', () => {
  const t = montarFnet(12);
  let invalidou = 0;
  t.sb.invalidarCacheAtivos_ = () => { invalidou += 1; };
  const r1 = plain(t.sb.atualizarInformesFiiFnet_('Manual'));
  assert.deepEqual(t.chamadas.fetchAll, [10, 2]);
  assert.equal(r1.total, 12); assert.equal(r1.regravou, true); assert.equal(invalidou, 1);
  assert.equal(plain(t.sb.lerInformesFundoFii_(t.ss, 'FFF0111')).itens[0].titulo, 'Assunto FFF0111');
  assert.ok(JSON.parse(t.props.get('FNET_INFORMES_HASH')).FFF0111, 'hash da lista de cada FII nas Propriedades');

  const r2 = plain(t.sb.atualizarInformesFiiFnet_('Manual'));
  assert.equal(r2.regravou, false, 'nada mudou: aba intacta'); assert.equal(invalidou, 1, 'e o cache das telas de ativo não é apagado à toa');
  assert.match(r2.detalhe, /12 FII\(s\) sem novidade/);

  t.falhar.add('FFF0511');
  const r3 = plain(t.sb.atualizarInformesFiiFnet_('Manual'));
  assert.equal(r3.status, 'Atenção');
  assert.equal(r3.total, 12, 'o FII que não respondeu continua com os informes que já tinha');
  assert.equal(plain(t.sb.lerInformesFundoFii_(t.ss, 'FFF0511')).itens.length, 1);
  assert.match(r3.detalhe, /os informes anteriores ficam na tela/);
});

test('FNet (A-48): disjuntor da fonte "fnet" aberto = Erro (a Agenda tenta de novo) sem nenhuma chamada', () => {
  const t = montarFnet(3);
  t.sb.fonteFalhou_('fnet', { codigo: 403 });
  const r = plain(t.sb.atualizarProventosAnunciadosFii_('Automático'));
  assert.equal(r.status, 'Erro');
  assert.equal(t.chamadas.fetchAll.length, 0);
  assert.match(r.detalhe, /fnet em pausa \(HTTP 403/);
});
