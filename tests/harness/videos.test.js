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

// ---------------------------------------------------------------------------
// 02/10/2026: canal OFICIAL do ativo (assets/js/canais-youtube.js) na busca da
// tela do ativo - feed RSS do canal, sem repetir, marcado "oficial", por data.
// ---------------------------------------------------------------------------

const AGORA_CANAL = new Date('2026-10-02T12:00:00Z');
const isoDias = (dias) => new Date(AGORA_CANAL.getTime() - dias * 86400000).toISOString();
const CANAL_OFICIAL = 'UCoficialoficialoficial1';

function cacheFalso() {
  const dados = {};
  const puts = [];
  return { dados, puts, get: (k) => dados[k] ?? null, put: (k, v, ttl) => { dados[k] = v; puts.push([k, ttl]); } };
}

test('Vídeos (canal oficial): só aceita canal do YouTube (ID, @nome, link youtube.com) - nunca busca outro endereço', () => {
  const { sb } = sandbox();
  assert.equal(sb.entradaCanalOficialValida_(CANAL_OFICIAL), CANAL_OFICIAL);
  assert.equal(sb.entradaCanalOficialValida_('@canal.teste'), '@canal.teste', 'handle com ponto (ex.: @wizco.) vale');
  assert.equal(sb.entradaCanalOficialValida_('https://www.youtube.com/user/canalteste'), 'https://www.youtube.com/user/canalteste');
  assert.equal(sb.entradaCanalOficialValida_('https://www.youtube.com/@canalteste'), 'https://www.youtube.com/@canalteste');
  for (const ruim of ['https://exemplo.test/@canal', 'http://www.youtube.com/@canal', 'https://www.youtube.com.exemplo.test/@x', 'UCcurto', '', 'javascript:alert(1)']) {
    assert.equal(sb.entradaCanalOficialValida_(ruim), null, ruim);
  }
  assert.throws(() => sb.videosCanalOficial_('https://exemplo.test/x'), /canal inválido/);
});

test('Vídeos (canal oficial): lê o feed pelo channel_id, guarda 3h no cache e resolve @nome 1x (propriedades do script)', () => {
  const urls = [];
  const fetch = (url) => {
    urls.push(url);
    if (/youtube\.com\/@canaloficial$/.test(url)) return { getResponseCode: () => 200, getContentText: () => `<link rel="canonical" href="https://www.youtube.com/channel/${CANAL_OFICIAL}">` };
    if (url === `https://www.youtube.com/feeds/videos.xml?channel_id=${CANAL_OFICIAL}`) {
      return { getResponseCode: () => 200, getContentText: () => feed('Empresa &amp; Cia', [{ id: 'oficial0001', titulo: 'Resultados do trimestre', data: isoDias(2), desc: 'x'.repeat(900) }]) };
    }
    return { getResponseCode: () => 404, getContentText: () => '' };
  };
  const { sb, props } = sandbox({ fetch });
  const cache = cacheFalso();
  sb.CacheService = { getScriptCache: () => cache };
  const r = plain(sb.videosCanalOficial_('@canaloficial'));
  assert.equal(r.id, CANAL_OFICIAL);
  assert.equal(r.nome, 'Empresa & Cia');
  assert.deepEqual(r.videos.map((v) => v.id), ['oficial0001']);
  assert.equal(r.videos[0].descricao.length, 300, 'descrição curta no cache');
  assert.ok(Object.values(props).includes(CANAL_OFICIAL), 'ID guardado nas propriedades');
  assert.deepEqual(cache.puts, [[`yt_feed_v1_${CANAL_OFICIAL}`, 3 * 60 * 60]]);
  // 2ª vez: nada de rede (ID nas propriedades, feed no cache)
  const antes = urls.length;
  assert.deepEqual(plain(sb.videosCanalOficial_('@canaloficial')), r);
  assert.equal(urls.length, antes);
  // pelo ID direto: não precisa resolver nada
  const { sb: sb2 } = sandbox({ fetch });
  const urls2 = [];
  sb2.videosCanalOficial_(CANAL_OFICIAL, { fetch: (u, p) => { urls2.push(u); return fetch(u, p); } });
  assert.deepEqual(urls2, [`https://www.youtube.com/feeds/videos.xml?channel_id=${CANAL_OFICIAL}`]);
});

/** Planilha com 1 canal cadastrado e vídeos que citam (ou não) o TEST3. */
function cenarioCanalOficial() {
  return planilhaFalsa({
    'aux_videos-canais': [['Canal', 'Carteiras', 'Obs'], ['UCmeucanalmeucanalmeuca', '', '']],
    aux_videos: [['ID'],
      ['meu00000001', 'Meu Canal', 'TEST3 vale a pena?', new Date(isoDias(1)), '', '', new Date()],
      ['meu00000002', 'Meu Canal', 'Carteira com TEST3 e OUTR4', new Date(isoDias(10)), '', '', new Date()],
      ['meu00000003', 'Meu Canal', 'Sem relação', new Date(isoDias(3)), '', '', new Date()],
      ['dupl0000001', 'Empresa Teste', 'Teleconferência TEST3', new Date(isoDias(5)), '', '', new Date()],
    ],
    'aux_videos-termos': [['h'], ['todos', '', 'patrocinado', '']],
  });
}
const feedOficial = (entradas) => (url) => (url.includes(`channel_id=${CANAL_OFICIAL}`)
  ? { getResponseCode: () => 200, getContentText: () => feed('Empresa Teste', entradas) }
  : { getResponseCode: () => 404, getContentText: () => '' });

test('Vídeos (canal oficial): canal da empresa - todos os vídeos dele entram, marcados, misturados por data com os seus, sem repetir', () => {
  const ss = cenarioCanalOficial();
  const { sb } = sandbox({ ss });
  const fetch = feedOficial([
    { id: 'ofic0000001', titulo: 'Visita à fábrica', data: isoDias(0.5) },
    { id: 'dupl0000001', titulo: 'Teleconferência TEST3', data: isoDias(5) },
    { id: 'ofic0000002', titulo: 'Conteúdo patrocinado', data: isoDias(6) },
    { id: 'ofic0000003', titulo: 'Vídeo de 2 anos atrás', data: isoDias(800) },
  ]);
  const r = plain(sb.montarRespostaVideos_({ termos: 'TEST3', ticker: 'TEST3', canal: CANAL_OFICIAL }, { fetch, agora: AGORA_CANAL }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.canalOficial, { id: CANAL_OFICIAL, nome: 'Empresa Teste', recentes: 4 });
  assert.deepEqual(r.videos.map((v) => [v.id, !!v.oficial]), [
    ['ofic0000001', true],
    ['meu00000001', false],
    ['dupl0000001', true], // veio dos seus canais E do oficial: 1 vez só, marcado
    ['meu00000002', false],
  ], 'por data; "patrocinado" (descartar de todos) e o vídeo de mais de 1 ano ficam de fora');
  // sem canal: igual antes (nada de rede, sem marca)
  const semCanal = plain(sb.montarRespostaVideos_({ termos: 'TEST3', ticker: 'TEST3' }, { fetch: () => { throw new Error('não devia buscar'); } }));
  assert.deepEqual(semCanal.videos.map((v) => v.id), ['meu00000001', 'dupl0000001', 'meu00000002']);
  assert.ok(semCanal.videos.every((v) => !v.oficial));
  assert.equal(semCanal.canalOficial, undefined);
  // página de carteira nunca usa o canal
  sb.classesDaCarteiraParaProventos_ = () => ({ TEST3: 'acoes' });
  const carteira = plain(sb.montarRespostaVideos_({ carteira: 'acoes', canal: CANAL_OFICIAL }, { fetch: () => { throw new Error('não devia buscar'); } }));
  assert.equal(carteira.canalOficial, undefined);
});

test('Vídeos (canal oficial): canal de gestora (canalModo=citam) - só os que citam o ativo; feed fora do ar não derruba a busca', () => {
  const ss = cenarioCanalOficial();
  const { sb } = sandbox({ ss });
  const fetch = feedOficial([
    { id: 'gest0000001', titulo: 'Relatório gerencial TEST3', data: isoDias(1.5) },
    { id: 'gest0000002', titulo: 'Panorama do mercado', data: isoDias(2) },
    { id: 'gest0000003', titulo: 'Live mensal', data: isoDias(4), desc: 'hoje falamos do Teste Fundo' },
  ]);
  const r = plain(sb.montarRespostaVideos_({ termos: 'TEST3|Teste Fundo', ticker: 'TEST3', canal: CANAL_OFICIAL, canalModo: 'citam' }, { fetch, agora: AGORA_CANAL }));
  assert.deepEqual(r.videos.filter((v) => v.oficial).map((v) => v.id), ['gest0000001', 'gest0000003', 'dupl0000001']);
  assert.ok(!r.videos.some((v) => v.id === 'gest0000002'), 'o que não cita o ativo fica de fora');
  const fora = plain(sb.montarRespostaVideos_({ termos: 'TEST3', ticker: 'TEST3', canal: CANAL_OFICIAL }, { fetch: () => ({ getResponseCode: () => 500, getContentText: () => '' }) }));
  assert.equal(fora.ok, true);
  assert.match(fora.erroCanalOficial, /HTTP 500/);
  assert.deepEqual(fora.videos.map((v) => v.id), ['meu00000001', 'dupl0000001', 'meu00000002']);
});

test('Vídeos (canal oficial): o oficial sempre aparece (até 6 quando há outros pra completar) e completa quando faltam os seus', () => {
  const { sb } = sandbox();
  const v = (pref, n, idade) => Array.from({ length: n }, (_, i) => ({ id: `${pref}${String(i).padStart(11 - pref.length, '0')}`, canal: pref, titulo: 'x', publicado: isoDias(idade + i), ativos: ['TEST3'], motivo: 'ativo' }));
  const meus = v('meu', 20, 0); // todos mais novos que os do oficial
  const canal = { id: CANAL_OFICIAL, nome: 'Oficial', videos: v('ofi', 15, 30) };
  const r = plain(sb.mesclarVideosCanalOficial_(meus, canal, { agora: AGORA_CANAL }));
  assert.equal(r.length, 12);
  assert.equal(r.filter((x) => x.oficial).length, 6, 'mesmo mais velhos, 6 do oficial entram');
  assert.deepEqual(r.map((x) => x.publicado), [...r.map((x) => x.publicado)].sort().reverse(), 'ordenado por data');
  const poucos = plain(sb.mesclarVideosCanalOficial_(meus.slice(0, 2), canal, { agora: AGORA_CANAL }));
  assert.deepEqual([poucos.length, poucos.filter((x) => x.oficial).length], [12, 10]);
  const semOficial = plain(sb.mesclarVideosCanalOficial_(meus, { id: CANAL_OFICIAL, nome: 'Oficial', videos: [] }, { agora: AGORA_CANAL }));
  assert.equal(semOficial.length, 12);
  // canal oficial também cadastrado em aux_videos-canais: os vídeos dele que vieram de lá ganham a marca (pelo nome do canal)
  const marcados = plain(sb.mesclarVideosCanalOficial_([{ id: 'antigo00001', canal: 'Ofícial', titulo: 'TEST3', publicado: isoDias(200), ativos: [], motivo: 'ativo' }], canal, { agora: AGORA_CANAL }));
  assert.equal(marcados.find((x) => x.id === 'antigo00001').oficial, true);
});
