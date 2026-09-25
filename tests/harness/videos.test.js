// tests/harness/videos.test.js
//
// 25/09/2026: vídeos do YouTube por ativo/carteira (apps-script/Videos.gs) -
// feed Atom do canal, ID do canal a partir da página (@nome), filtro por
// termos/carteira e a atualização acumulando na aba aux_videos. Sem rede
// (UrlFetchApp falso) e sem planilha real. Canais e vídeos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const plain = (x) => JSON.parse(JSON.stringify(x));

function planilhaFalsa(inicial = {}) {
  const abas = {};
  const criar = (nome, linhas = []) => {
    let dados = linhas.map((l) => [...l]);
    abas[nome] = {
      getLastRow: () => dados.length,
      clearContents: () => { dados = []; },
      getRange: (r1, c1, n, nc) => ({
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: nc }, (_, j) => ((dados[r1 - 1 + i] || [])[c1 - 1 + j] ?? ''))),
        setValues: (vals) => vals.forEach((l, i) => { dados[r1 - 1 + i] = [...l]; }),
      }),
      _dados: () => dados,
    };
    return abas[nome];
  };
  Object.entries(inicial).forEach(([n, l]) => criar(n, l));
  return { getSheetByName: (n) => abas[n] || null, insertSheet: (n) => criar(n) };
}

function sandbox({ ss = planilhaFalsa(), fetch = () => ({ getResponseCode: () => 404, getContentText: () => '' }) } = {}) {
  const props = {};
  const registro = [];
  const sb = {
    console: { ...console, log() {} },
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    UrlFetchApp: { fetch: (url, op) => fetch(url, op) },
    gravarRegistroControle_: (...a) => registro.push(a),
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Videos.gs'), 'utf8'), { filename: 'Videos.gs' }).runInContext(sb);
  return { sb, props, registro, ss };
}

const feed = (canal, entradas) => `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>${canal}</title>
  ${entradas.map((e) => `<entry><yt:videoId>${e.id}</yt:videoId><title>${e.titulo}</title><author><name>${canal}</name></author>
    <published>${e.data}</published><media:group><media:description>${e.desc || ''}</media:description></media:group></entry>`).join('')}</feed>`;

test('Vídeos: lê o feed do canal (id, título com entidades, data, descrição) e ignora entrada sem id válido', () => {
  const { sb } = sandbox();
  const v = plain(sb.extrairVideosDoFeed_(feed('Canal Teste', [
    { id: 'abcdefghijk', titulo: 'TEST3 &amp; TEST11: vale a pena?', data: '2026-09-20T10:00:00+00:00', desc: 'Falamos da Teste S.A.' },
    { id: 'curto', titulo: 'x', data: '2026-09-20T10:00:00+00:00' },
  ])));
  assert.equal(v.length, 1);
  assert.deepEqual(v[0], { id: 'abcdefghijk', canal: 'Canal Teste', titulo: 'TEST3 & TEST11: vale a pena?', publicado: '2026-09-20T10:00:00.000Z', descricao: 'Falamos da Teste S.A.' });
});

test('Vídeos: ID do canal direto, pelo link /channel/ ou pela página do @nome (guardado pra próxima vez)', () => {
  let buscas = 0;
  const { sb, props } = sandbox({ fetch: (url) => { buscas++; assert.match(url, /youtube\.com\/@canalteste$/); return { getResponseCode: () => 200, getContentText: () => '<html><link rel="canonical" href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"></html>' }; } });
  assert.equal(sb.resolverCanalYoutube_('UC1234567890123456789012'), 'UC1234567890123456789012');
  assert.equal(sb.resolverCanalYoutube_('https://www.youtube.com/channel/UC1234567890123456789012/videos'), 'UC1234567890123456789012');
  assert.equal(sb.resolverCanalYoutube_('@canalteste'), 'UCabcdefghijklmnopqrstuv');
  assert.equal(sb.resolverCanalYoutube_('@canalteste'), 'UCabcdefghijklmnopqrstuv');
  assert.equal(buscas, 1, 'a 2ª vez vem das propriedades');
  assert.ok(Object.values(props).includes('UCabcdefghijklmnopqrstuv'));
  assert.equal(sb.extrairIdCanalDoHtml_('{"externalId":"UCzzzzzzzzzzzzzzzzzzzzzz"}'), 'UCzzzzzzzzzzzzzzzzzzzzzz');
});

test('Vídeos: filtro do ativo - palavra inteira, sem acento; sigla só em maiúsculas; nome em qualquer caixa', () => {
  const { sb } = sandbox();
  const videos = [
    { id: '1', titulo: 'Análise de TEST3 hoje', descricao: '', carteiras: [], publicado: '2026-09-20' },
    { id: '2', titulo: 'TEST33 não é TEST3?', descricao: '', carteiras: [], publicado: '2026-09-19' },
    { id: '3', titulo: 'Mercado', descricao: 'A Empresa Téste divulgou', carteiras: [], publicado: '2026-09-18' },
    { id: '4', titulo: 'ATEST3X e test3', descricao: '', carteiras: [], publicado: '2026-09-17' },
  ];
  const ids = (r) => plain(r).map((v) => v.id);
  assert.deepEqual(ids(sb.filtrarVideos_(videos, { alvos: [{ ticker: 'TEST3', termos: ['TEST3'] }] })), ['1', '2'], 'sigla em minúsculas não conta');
  assert.deepEqual(ids(sb.filtrarVideos_(videos, { alvos: [{ ticker: 'TEST3', termos: ['empresa teste'] }] })), ['3'], 'nome sem acento/caixa, na descrição também');
  assert.deepEqual(ids(sb.filtrarVideos_(videos, { alvos: [] })), [], 'sem termo, nada');
  assert.deepEqual(ids(sb.filtrarVideos_(videos, { alvos: [{ ticker: 'TEST3', termos: ['TEST3'], descartar: ['hoje'] }] })), ['2'], 'descartar tira o vídeo');
  const r = plain(sb.filtrarVideos_(videos, { alvos: [{ ticker: 'TEST3', termos: ['TEST3'] }] }));
  assert.deepEqual(r[0], { id: '1', titulo: 'Análise de TEST3 hoje', publicado: '2026-09-20', ativos: ['TEST3'], motivo: 'ativo' });
  assert.deepEqual(plain(sb.normalizarCarteirasVideo_('FIIs, Ações; eua, renda fixa, xyz')), ['fiis', 'acoes', 'acoesEua', 'rendaFixa']);
});

test('Vídeos: página da carteira - 1º os que citam ativos dela (ticker + apelido do site + termo da aba), depois o tema (só no título) e o canal marcado', () => {
  const ss = planilhaFalsa({
    Auxiliar_ativos: [['Classe', 'Ticker'], ['Ações', 'TEST3'], ['Ações', 'OUTR4'], ['FIIs', 'FUND11']],
    'aux_videos-termos': [['h'], ['acoes', '', '', ''], ['OUTR4', 'Outra Holding', 'podcast', ''], ['todos', '', 'bolsa família', '']],
  });
  const { sb } = sandbox({ ss });
  sb.classesDaCarteiraParaProventos_ = () => ({ TEST3: 'acoes', OUTR4: 'acoes', FUND11: 'fiis' });
  const videos = [
    { id: 'tema1', titulo: 'Ibovespa bate recorde', descricao: '', carteiras: [], publicado: '2026-09-25' },
    { id: 'desc1', titulo: 'Semana no mercado', descricao: 'falamos da Teste Energia', carteiras: [], publicado: '2026-09-10' },
    { id: 'extra1', titulo: 'Outra Holding compra rival', descricao: '', carteiras: [], publicado: '2026-09-11' },
    { id: 'desc2', titulo: 'Ações baratas', descricao: 'ações de sempre, ibovespa etc', carteiras: [], publicado: '2026-09-24' },
    { id: 'fora1', titulo: 'Ações e o Bolsa Família', descricao: 'TEST3', carteiras: [], publicado: '2026-09-23' },
    { id: 'fora2', titulo: 'Podcast com a Outra Holding', descricao: '', carteiras: [], publicado: '2026-09-22' },
    { id: 'nada1', titulo: 'Culinária', descricao: 'ações do dia a dia', carteiras: [], publicado: '2026-09-21' },
    { id: 'fii1', titulo: 'FUND11 paga mais', descricao: '', carteiras: ['acoes'], publicado: '2026-09-20' },
  ];
  const opcoes = sb.opcoesFiltroVideos_(ss, { carteira: 'acoes', apelidos: 'TEST3:Teste Energia;FUND11:Fundo X' });
  const r = plain(sb.filtrarVideos_(videos, opcoes));
  assert.deepEqual(r.map((v) => [v.id, v.motivo, v.ativos]), [
    ['extra1', 'ativo', ['OUTR4']],
    ['desc1', 'ativo', ['TEST3']],
    ['tema1', 'tema', []],
    ['desc2', 'tema', []],
    ['fii1', 'tema', []],
  ]);
  // tela do ativo: termos do site + extras da aba; "todos" descarta
  const o2 = sb.opcoesFiltroVideos_(ss, { termos: 'OUTR4|Outra SA', ticker: 'OUTR4' });
  assert.deepEqual(plain(o2.alvos[0].termos), ['OUTR4', 'OUTR4', 'Outra SA', 'Outra Holding']);
  assert.deepEqual(plain(sb.filtrarVideos_(videos, o2)).map((v) => v.id), ['extra1']);
  assert.deepEqual(plain(sb.lerApelidosVideo_('petr4:Petrobras, Petróleo;;X')), { PETR4: ['Petrobras', 'Petróleo'] });
  // sem linha da carteira na aba: tema padrão
  const ss2 = planilhaFalsa({});
  const { sb: sb2 } = sandbox({ ss: ss2 });
  sb2.classesDaCarteiraParaProventos_ = () => ({});
  assert.ok(plain(sb2.opcoesFiltroVideos_(ss2, { carteira: 'fiis' }).tema).includes('fundos imobiliários'));
});

test('Vídeos: configurarVideosDireto cria a aba de termos com o tema de cada carteira (e não mexe se já existe)', () => {
  const ss = planilhaFalsa({ 'aux_videos-canais': [['h']] });
  const { sb } = sandbox({ ss });
  sb.configurarVideosDireto();
  const linhas = ss.getSheetByName('aux_videos-termos')._dados();
  assert.deepEqual(linhas.slice(1, 5).map((l) => l[0]), ['acoes', 'fiis', 'acoesEua', 'rendaFixa']);
  assert.match(linhas[2][1], /fundos imobiliários/);
  ss.getSheetByName('aux_videos-termos')._dados()[1][1] = 'meu tema';
  sb.configurarVideosDireto();
  assert.equal(ss.getSheetByName('aux_videos-termos')._dados()[1][1], 'meu tema');
});

test('Vídeos: atualização acumula na aba (sem repetir), guarda as carteiras do canal, joga fora o que tem mais de 1 ano e registra falha', () => {
  const agora = Date.now();
  const iso = (dias) => new Date(agora - dias * 86400000).toISOString();
  const ss = planilhaFalsa({
    'aux_videos-canais': [['Canal', 'Carteiras', 'Obs'], ['UCaaaaaaaaaaaaaaaaaaaaaa', 'fiis', ''], ['@quebrado', '', '']],
    aux_videos: [['ID'], ['velhovideo1', 'Canal A', 'Antigo', new Date(agora - 400 * 86400000), '', 'fiis', new Date()], ['jaguardado1', 'Canal A', 'Guardado', new Date(agora - 20 * 86400000), '', 'fiis', new Date()]],
  });
  const { sb, registro } = sandbox({
    ss,
    fetch: (url) => {
      if (/feeds\/videos\.xml\?channel_id=UCaaaaaaaaaaaaaaaaaaaaaa/.test(url)) {
        return { getResponseCode: () => 200, getContentText: () => feed('Canal A', [{ id: 'novovideo01', titulo: 'Novo', data: iso(1) }, { id: 'jaguardado1', titulo: 'Guardado', data: iso(20) }]) };
      }
      return { getResponseCode: () => 404, getContentText: () => '' };
    },
  });
  const r = plain(sb.atualizarVideos_('Automático'));
  assert.equal(r.status, 'Atenção', 'um canal falhou');
  assert.equal(r.novos, 1);
  const lidos = plain(sb.lerVideos_(ss));
  assert.deepEqual(lidos.map((v) => v.id), ['novovideo01', 'jaguardado1'], 'mais novo primeiro, sem o de 400 dias');
  assert.deepEqual(lidos[0].carteiras, ['fiis']);
  assert.equal(registro.length, 1, 'falha vai pro Registro de Controle');
  assert.match(registro[0][2], /quebrado/);
});
