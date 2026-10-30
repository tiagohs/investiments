// tests/leitura-saude.test.js - 29/10/2026 (F5, RF-10): saúde da leitura rápida no popover "Registro de Controle".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumoSaudeLeitura, htmlSaudeLeitura, idadeTexto, carregarSaudeLeitura, LIMITE_COTACAO_PREGAO_MS } from '../assets/js/leitura-saude.js';

const AGORA = Date.parse('2026-10-29T17:00:00Z');
const g = (minAtras) => `20261029a.${AGORA - minAtras * 60000}pub`;
const estado = {
  ok: true,
  publicacoes: [
    { chave: 'home', geracao: g(10) },
    { chave: 'carteirasAcoes', geracao: g(50) },
    { chave: 'gastos', geracao: g(5 * 60) },
    { chave: 'syncHistorico?limite=1', geracao: g(4) },
    { chave: 'ativoBase?ref=AAAA3', geracao: g(60) },
    { chave: 'ativo?ref=rf:Tesouro|XP&semIndices=1', geracao: g(27 * 60) },
  ],
  estado: { ultima_publicacao: JSON.stringify({ em: new Date(AGORA - 4 * 60000).toISOString(), itens: 1 }) },
};

test('saúde: no pregão, tela de cotação com mais de 35 min e qualquer tela com mais de 26 h ficam em atenção; ativos agrupados', () => {
  const r = resumoSaudeLeitura(estado, { agoraMs: AGORA, noPregao: true });
  const porChave = Object.fromEntries(r.telas.map((t) => [t.chave, t]));
  assert.equal(porChave.home.atencao, false);
  assert.equal(porChave.carteirasAcoes.atencao, true, `cotação ${50} min > ${LIMITE_COTACAO_PREGAO_MS / 60000} min`);
  assert.equal(porChave.gastos.atencao, false, 'sem cotação: vale o limite do dia');
  assert.equal(porChave['syncHistorico?limite=1'].nome, 'Registro de Controle (limite 1)');
  assert.deepEqual(r.ativos, { n: 2, maisVelhaMs: 27 * 3600000, atencao: true });
  assert.equal(r.telas[0].chave, 'gastos', 'mais velha primeiro');
  const fora = resumoSaudeLeitura(estado, { agoraMs: AGORA, noPregao: false });
  assert.equal(fora.telas.find((t) => t.chave === 'carteirasAcoes').atencao, false, 'fora do pregão a cotação não muda');
  const html = htmlSaudeLeitura(r, { agoraMs: AGORA });
  assert.match(html, /2 item\(ns\) com cópia mais velha/);
  assert.match(html, /Última publicação: há 4 min/);
  assert.match(html, /Telas dos ativos<small>2 publicadas/);
  assert.match(htmlSaudeLeitura(null), /Não consegui ler o estado/);
  assert.deepEqual([0, 30000, 5 * 60000, 125 * 60000, 3 * 86400000].map(idadeTexto), ['agora', 'há 1 min', 'há 5 min', 'há 2 h 5 min', 'há 3 dias']);
});

test('saúde: carregar desenha o estado lido (ou o aviso, sem estado)', async () => {
  const el = { innerHTML: '' };
  await carregarSaudeLeitura(el, 's1.x.y', { lerEstadoImpl: async () => ({ ok: true, publicacoes: [{ chave: 'home', geracao: g(1) }], estado: {} }), agoraMs: AGORA });
  assert.match(el.innerHTML, /Início/);
  await carregarSaudeLeitura(el, 's1.x.y', { lerEstadoImpl: async () => null, agoraMs: AGORA });
  assert.match(el.innerHTML, /Não consegui/);
});

test('saúde (30/10/2026, Notícias): as telas noticias* não entram pela idade; o que vale é o cron ter rodado há pouco', () => {
  const comNoticias = {
    ...estado,
    publicacoes: [...estado.publicacoes, { chave: 'noticiasMercado?indice=ibov', geracao: `noticias.${AGORA - 5 * 3600000}` }],
    estado: { ...estado.estado, noticias_ultima: JSON.stringify({ em: new Date(AGORA - 20 * 60000).toISOString(), falhas: [{ fonte: 'tempo real InfoMoney', status: 503 }] }) },
  };
  const r = resumoSaudeLeitura(comNoticias, { agoraMs: AGORA, noPregao: true });
  assert.ok(!r.telas.some((t) => t.chave.startsWith('noticias')), 'só muda quando o conteúdo muda: a idade não é sinal');
  assert.equal(r.noticias.atencao, true, 'no pregão, 20 min sem coleta = cron parado');
  assert.equal(resumoSaudeLeitura(comNoticias, { agoraMs: AGORA, noPregao: false }).noticias.atencao, false);
  const html = htmlSaudeLeitura(r, { agoraMs: AGORA });
  assert.match(html, /Notícias \(coleta do Worker\)<small>tempo real InfoMoney: 503<\/small><\/th><td>há 20 min/);
  assert.match(html, /3 item\(ns\) com cópia mais velha/);
  assert.equal(resumoSaudeLeitura(estado, { agoraMs: AGORA }).noticias, null, 'sem cron ainda: nada');
});
