// tests/harness/noticias-gs.test.js - 30/10/2026: Noticias.gs (tela de Notícias, docs/noticias.md). O Google Notícias
// recusa pedidos do Cloudflare, então as buscas dele saem do Apps Script (noticiasGoogle_): manchetes dos 4 índices e
// notícias de cada ativo, num fetchAll só, reaproveitando o cache de 2 h da tela do ativo. E a classificação dos canais
// da aba aux_videos-canais (coluna D ou padrão pelo @nome). Dados sintéticos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarSandboxGs } from './gas-vm-harness.mjs';
import { PRODUTOS_IBGE } from '../../worker/src/noticias/coleta.js';

const plain = (x) => JSON.parse(JSON.stringify(x));
const rss = (titulo) => `<rss><channel><item><title>${titulo} - Jornal A</title><link>https://n.exemplo.test/${encodeURIComponent(titulo)}</link><pubDate>Fri, 30 Oct 2026 15:00:00 GMT</pubDate><source url="https://j.test">Jornal A</source></item></channel></rss>`;

function montar() {
  const { sandbox: sb } = criarSandboxGs({ silencioso: true });
  sb.lerAtivosNoticias_ = () => [{ ticker: 'ABCD3', classe: 'acoes', nome: 'Empresa Exemplo S.A.' }, { ticker: 'WXYZ', classe: 'acoesEua', nome: 'Example Inc' }];
  return sb;
}

test('noticiasGoogle_: 4 índices + cada ativo num fetchAll; 2ª vez vem do cache; falha não derruba o resto', () => {
  const sb = montar();
  const lotes = [];
  const ibge = JSON.stringify({ items: [{ data_divulgacao: '12/11/2026 12:00:00', mes_referencia_fim: 10, ano_referencia_fim: 2026, descricao_produto: '<p>texto longo</p>' }] });
  const fetchAll = (pedidos) => { lotes.push(pedidos.map((p) => p.url)); return pedidos.map((p, i) => ({ getResponseCode: () => (p.url.includes('Nasdaq') ? 503 : 200), getContentText: () => (p.url.includes('ibge') ? ibge : rss(`notícia ${i}`)) })); };
  const r = plain(sb.noticiasGoogle_({ fetchAll }));
  assert.equal(lotes.length, 1);
  assert.equal(lotes[0].length, 13, '4 índices + 7 pesquisas do IBGE + 2 ativos');
  assert.deepEqual(Object.keys(r.ibge).sort(), Object.keys(PRODUTOS_IBGE).sort(), 'as mesmas pesquisas que o Worker conhece');
  assert.deepEqual(r.ibge['9256'], { items: [{ data_divulgacao: '12/11/2026 12:00:00', mes_referencia_fim: 10, ano_referencia_fim: 2026 }] }, 'sem a descrição em HTML');
  assert.ok(lotes[0].some((u) => u.includes('hl=en-US') && u.includes('WXYZ')), 'EUA em inglês, como na tela do ativo');
  assert.deepEqual(Object.keys(r.indices).sort(), ['dolar', 'ibov', 'ifix'], 'o índice que falhou fica de fora');
  assert.equal(r.falhas, 1);
  assert.equal(r.ativos.ABCD3[0].titulo, 'notícia 11');
  assert.equal(r.ativos.ABCD3[0].fonte, 'Jornal A');
  const r2 = plain(sb.noticiasGoogle_({ fetchAll }));
  assert.equal(lotes.length, 2);
  assert.deepEqual(lotes[1].length, 1, 'só o que falhou é buscado de novo');
  assert.deepEqual(r2.ativos.ABCD3, r.ativos.ABCD3);
  // a tela do ativo usa o MESMO cache (buscarNoticiasAtivo_ não vai à rede)
  sb.UrlFetchApp = { fetch: () => { throw new Error('não devia buscar'); } };
  assert.deepEqual(plain(sb.buscarNoticiasAtivo_('ABCD3', 'Empresa Exemplo S.A.', 'acoes')), r.ativos.ABCD3);
});

test('handleNoticiasGoogle: sem o instante nem a contagem de buscas (o hash da publicação só muda com as notícias)', () => {
  const sb = montar();
  sb.UrlFetchApp = { fetchAll: (p) => p.map(() => ({ getResponseCode: () => 200, getContentText: () => rss('x') })) };
  const j = JSON.parse(sb.handleNoticiasGoogle({ parameter: {} }, { ok: true }).getContent());
  assert.equal(j.ok, true);
  assert.equal('em' in j, false);
  assert.equal('buscadas' in j, false);
  assert.equal(JSON.parse(sb.handleNoticiasGoogle({ parameter: {} }, { ok: false, erro: 'x' }).getContent()).ok, false);
});

test('canais: coluna D manda; vazia, o padrão pelo @nome; "não" tira da tela', () => {
  const sb = montar();
  assert.equal(sb.telaNoticiasDoCanal_('@uol', ''), 'noticias');
  assert.equal(sb.telaNoticiasDoCanal_('https://www.youtube.com/@ProfessorBaroni', ''), 'especialistas');
  assert.equal(sb.telaNoticiasDoCanal_('@outrocanal', ''), 'meus');
  assert.equal(sb.telaNoticiasDoCanal_('@uol', 'Especialista'), 'especialistas');
  assert.equal(sb.telaNoticiasDoCanal_('@uol', 'não'), null);
  assert.equal(sb.nomeCurtoCanalNoticias_('https://www.youtube.com/@infomoney'), 'infomoney');
});
