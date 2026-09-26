// tests/consolidacao-novo-ativo.test.js
//
// 26/09/2026: o lado do navegador de três pedidos do Tiago -
//  - aviso "Consolidação necessária" no topo (shell.js: aparece, abre, roda
//    as rodadas, limpa o cache e recarrega);
//  - "Adicionar ativo" em Carteiras (pages/novo-ativo.js: confere o ticker,
//    mostra o plano, cadastra, desfaz; abre pelo atalho da revisão de extrato);
//  - "momento de aporte" (aportes-calc.js!momentoAporte);
//  - api-client: consolidar() em rodadas, adicionarAtivo/removerAtivo.
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseShellPartial, injectShell, setupPopovers, renderConsolidacao, setupConsolidacao, carregarStatusSync, resumoPendenciaConsolidacao } from '../assets/js/shell.js';
import { ligarNovoAtivo, validarFormNovoAtivo, linhasDoPlano, normalizarTickerNovo } from '../assets/js/pages/novo-ativo.js';
import { momentoAporte } from '../assets/js/pages/aportes-calc.js';
import { consolidar, adicionarAtivo, removerAtivo, getInfoNovoAtivo } from '../assets/js/api-client.js';

const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const txt = (el) => {
  const partes = [];
  const w = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};

function docComShell() {
  const dom = new JSDOM('<!doctype html><html><body><div id="shell-header"></div><main></main><div id="shell-footer"></div></body></html>', { url: 'https://exemplo.test/index.html' });
  const doc = dom.window.document;
  const html = fs.readFileSync(new URL('../assets/partials/shell.html', import.meta.url), 'utf8');
  injectShell(doc, parseShellPartial(html, doc));
  setupPopovers(doc);
  return { doc, w: dom.window };
}

const PENDENTE = { pendente: true, ativos: ['ABCD3'], precos: ['NOVO3'], rf: true, motivos: [{ quando: '2026-09-26T13:00:00.000Z', texto: 'Importação: 2 transação(ões) de ABCD3, NOVO3' }], desde: '2026-09-26T13:00:00.000Z' };

test('shell: "Consolidação necessária" só aparece com pendência (vem junto do Registro de Controle)', async () => {
  const { doc } = docComShell();
  const wrap = doc.getElementById('consolWrap');
  assert.equal(wrap.hidden, true, 'escondido de saída');
  await carregarStatusSync(doc, { token: 'tk', getSyncHistoricoImpl: async () => ({ ok: true, resultado: [], consolidacao: PENDENTE }) });
  assert.equal(wrap.hidden, false);
  assert.equal(doc.getElementById('consolOque').textContent, 'históricos de ABCD3, NOVO3 · Renda Fixa');
  assert.match(txt(doc.getElementById('consolMotivos')), /Importação: 2 transação\(ões\) de ABCD3, NOVO3/);
  await carregarStatusSync(doc, { token: 'tk', getSyncHistoricoImpl: async () => ({ ok: true, resultado: [], consolidacao: { pendente: false } }) });
  assert.equal(wrap.hidden, true);
  // back-end antigo (sem o campo): não mexe
  renderConsolidacao(doc, PENDENTE);
  await carregarStatusSync(doc, { token: 'tk', getSyncHistoricoImpl: async () => ({ ok: true, resultado: [] }) });
  assert.equal(wrap.hidden, false);
  assert.equal(resumoPendenciaConsolidacao({ pendente: true, ativos: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], rf: false }), 'históricos de A, B, C, D, E, F e mais 1');
});

test('shell: aviso vindo da tela (evento) + "Consolidar agora" em rodadas -> limpa o cache e recarrega', async () => {
  const { doc, w } = docComShell();
  const chamadas = [];
  let recarregou = 0;
  const win = { addEventListener: w.addEventListener.bind(w), location: { reload: () => { recarregou += 1; } } };
  let limpou = 0;
  setupConsolidacao(doc, {
    token: 'tk', win, setTimeoutImpl: (fn) => fn(),
    limparCacheLocalImpl: async () => { limpou += 1; },
    consolidarImpl: async (token, { onRodada }) => {
      chamadas.push(token);
      onRodada({ status: 'parcial', continuar: true, feito: ['Histórico do patrimônio: 4 dia(s) recalculado(s) em ABCD3'] }, 1);
      onRodada({ status: 'concluido', continuar: false, feito: ['Histórico da Renda Fixa refeito'] }, 2);
      return { ok: true, resultado: { status: 'concluido', continuar: false, feito: [], avisos: ['Sem cotação no período: X'] } };
    },
  });
  w.dispatchEvent(new w.CustomEvent('consolidacao:pendente', { detail: PENDENTE }));
  assert.equal(doc.getElementById('consolWrap').hidden, false, 'a tela avisou, o topo mostrou');
  w.dispatchEvent(new w.CustomEvent('consolidacao:abrir'));
  assert.ok(doc.getElementById('consolPanel').classList.contains('open'), 'o botão da tela abre o painel');
  clique(w, doc.getElementById('consolGo'));
  await esperar();
  await esperar();
  assert.deepEqual(chamadas, ['tk']);
  const prog = txt(doc.getElementById('consolProgresso'));
  assert.match(prog, /4 dia\(s\) recalculado\(s\) em ABCD3 Histórico da Renda Fixa refeito Sem cotação no período: X Pronto\./);
  assert.equal(limpou, 1);
  assert.equal(recarregou, 1);
});

test('shell: falha na consolidação deixa tentar de novo', async () => {
  const { doc, w } = docComShell();
  renderConsolidacao(doc, PENDENTE);
  setupConsolidacao(doc, { token: 'tk', win: { addEventListener() {} }, consolidarImpl: async () => ({ ok: false, erro: 'Exceeded maximum execution time' }) });
  const go = doc.getElementById('consolGo');
  clique(w, go);
  await esperar();
  assert.match(txt(doc.getElementById('consolProgresso')), /Não deu pra consolidar: Exceeded maximum execution time/);
  assert.equal(go.disabled, false);
  assert.equal(go.textContent, 'Consolidar agora');
});

test('api-client: consolidar() repete enquanto "continuar", espera quando está ocupado e junta o que foi feito', async (t) => {
  const respostas = [
    { ok: true, resultado: { status: 'ocupado', continuar: true, feito: [] } },
    { ok: true, resultado: { status: 'parcial', continuar: true, feito: ['a'], avisos: ['x'] } },
    { ok: true, resultado: { status: 'concluido', continuar: false, feito: ['b'], avisos: [] } },
  ];
  const corpos = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => { corpos.push(String(opts.body)); return { json: async () => respostas.shift() }; });
  const esperas = [];
  const rodadas = [];
  const r = await consolidar('tk', { esperar: async (ms) => esperas.push(ms), onRodada: (x, n) => rodadas.push([x.status, n]) });
  assert.deepEqual(r.resultado.feito, ['a', 'b']);
  assert.deepEqual(r.resultado.avisos, ['x']);
  assert.equal(r.resultado.rodadas, 3);
  assert.deepEqual(esperas, [8000]);
  assert.deepEqual(rodadas, [['ocupado', 1], ['parcial', 2], ['concluido', 3]]);
  assert.match(corpos[0], /action=consolidar/);
});

test('api-client: adicionarAtivo (simular), removerAtivo e infoNovoAtivo', async (t) => {
  const pedidos = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => { pedidos.push({ url: String(url), body: opts.body ? String(opts.body) : '' }); return { json: async () => ({ ok: true }) }; });
  await adicionarAtivo('tk', { classe: 'acoes', ticker: 'NOVO3' }, { simular: true });
  await removerAtivo('tk', 'acoes', 'NOVO3');
  await getInfoNovoAtivo('tk', 'fiis', 'TEST11');
  const b0 = new URLSearchParams(pedidos[0].body);
  assert.deepEqual([b0.get('action'), b0.get('simular'), JSON.parse(b0.get('ativo')).ticker], ['adicionarAtivo', '1', 'NOVO3']);
  assert.equal(new URLSearchParams(pedidos[1].body).get('action'), 'removerAtivo');
  const u = new URL(pedidos[2].url);
  assert.deepEqual([u.searchParams.get('action'), u.searchParams.get('classe'), u.searchParams.get('ticker')], ['infoNovoAtivo', 'fiis', 'TEST11']);
});

test('novo ativo: validação do formulário (ticker por classe, preço-teto, % em fração)', () => {
  assert.equal(normalizarTickerNovo('acoes', ' abcd3f '), 'ABCD3');
  let r = validarFormNovoAtivo('acoes', { ticker: 'abcd3', nome: 'Empresa', precoTeto: '12,50', percentualDesejado: '5,5', setor: 'Energia' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ativo, { classe: 'acoes', ticker: 'ABCD3', nome: 'Empresa', precoTeto: 12.5, percentualDesejado: 0.055, setor: 'Energia' });
  r = validarFormNovoAtivo('fiis', { ticker: 'ABCD3', nome: '', precoTeto: '0', percentualDesejado: '120' });
  assert.deepEqual(Object.keys(r.erros).sort(), ['nome', 'percentualDesejado', 'precoTeto', 'ticker']);
  assert.match(r.erros.ticker, /ABCD11/);
  assert.equal(validarFormNovoAtivo('acoesEua', { ticker: 'brk.b', nome: 'Berkshire', precoTeto: '500' }).ativo.ticker, 'BRK.B');
  assert.match(linhasDoPlano({ carteira: { aba: 'Carteira FIIs', linha: 20, modelo: 19 }, radar: { linha: 80, ranking: 12 }, auxiliar: { linha: 40, modelo: 33 } })[1], /linha 80: ranking 12/);
});

test('novo ativo: abre pelo atalho (?novoAtivo=), confere o ticker, mostra o plano, cadastra, avisa a consolidação e desfaz', async () => {
  const dom = new JSDOM('<!doctype html><html><body><button data-novo-ativo="">+</button></body></html>', { url: 'https://exemplo.test/carteiras/index.html?novoAtivo=novo3&classe=acoes#acoes', pretendToBeVisual: true });
  const w = dom.window;
  const doc = w.document;
  const chamadas = [];
  const eventos = [];
  w.addEventListener('consolidacao:pendente', (e) => eventos.push(e.detail));
  let fechou = null;
  ligarNovoAtivo(doc, {
    token: 'tk', debounceMs: 0,
    getInfoImpl: async (t, classe, ticker) => { chamadas.push(['info', classe, ticker]); return { ok: true, ticker, valido: true, existe: [], base: ticker ? { preco: 8.1, dy: 0.05, pvp: 1.1, pl: null, nome: 'Nova Empresa SA' } : null, opcoes: { tipoCarteira: ['Dividendos'], setor: ['Energia', 'Saúde'] } }; },
    adicionarImpl: async (t, ativo, { simular }) => {
      chamadas.push(['adicionar', ativo, simular]);
      const plano = { ticker: ativo.ticker, classe: ativo.classe, carteira: { aba: 'Carteira Ações', linha: 25, modelo: 24 }, radar: { linha: 54, modelo: 55, ranking: 13 }, auxiliar: { linha: 60, modelo: 30 } };
      return { ok: true, resultado: simular ? plano : { ...plano, consolidacao: { pendente: true, ativos: ['NOVO3'] } } };
    },
    removerImpl: async (t, classe, ticker) => { chamadas.push(['remover', classe, ticker]); return { ok: true, resultado: { ticker, removidas: ['Radar linha 54', 'Auxiliar_ativos linha 60', 'Carteira Ações linha 25'] } }; },
    aoFechar: (x) => { fechou = x; },
  });
  await esperar(); await esperar();
  const janela = doc.querySelector('.na-fundo');
  assert.equal(janela.hidden, false, 'abriu sozinho pelo endereço');
  assert.equal(w.location.search, '', 'o atalho sai do endereço (recarregar não reabre)');
  assert.equal(doc.getElementById('na-ticker').value, 'novo3');
  assert.ok(doc.querySelector('.na-classe.ativa[data-na-classe="acoes"]'));
  assert.match(txt(doc.getElementById('naInfo')), /NOVO3 encontrado na base da planilha: cotação R\$ 8,10 · DY 5,00% · P\/VP 1,10/);
  assert.equal(doc.getElementById('na-nome').value, 'Nova Empresa SA', 'nome veio da base');

  // sem preço-teto: não chama o servidor
  clique(w, doc.querySelector('[data-na="conferir"]'));
  assert.match(txt(doc.querySelector('.na-campo.com-erro')), /preço-teto/i);
  assert.equal(chamadas.filter((c) => c[0] === 'adicionar').length, 0);

  const teto = doc.getElementById('na-precoTeto');
  teto.value = '9,50';
  teto.dispatchEvent(new w.Event('input', { bubbles: true }));
  clique(w, doc.querySelector('[data-na="conferir"]'));
  await esperar();
  assert.match(txt(doc.querySelector('.na-plano-box')), /Carteira Ações , linha 25: .*Radar de oportunidades, linha 54: ranking 13/);
  const simulado = chamadas.find((c) => c[0] === 'adicionar');
  assert.deepEqual([simulado[1].ticker, simulado[1].precoTeto, simulado[1].tipoCarteira, simulado[2]], ['NOVO3', 9.5, 'Dividendos', true]);

  clique(w, doc.querySelector('[data-na="cadastrar"]'));
  await esperar();
  assert.match(txt(doc.querySelector('.na-feito')), /NOVO3 cadastrado/);
  assert.deepEqual(eventos, [{ pendente: true, ativos: ['NOVO3'] }], 'o topo mostra "Consolidação necessária"');

  clique(w, doc.querySelector('[data-na="desfazer"]'));
  await esperar();
  assert.deepEqual(chamadas[chamadas.length - 1], ['remover', 'acoes', 'NOVO3']);
  assert.match(txt(doc.querySelector('.na-corpo')), /Cadastro de NOVO3 desfeito/);
  assert.equal(doc.getElementById('na-precoTeto').value, '9,50', 'o formulário volta preenchido');

  clique(w, doc.querySelector('[data-na="fechar"]'));
  assert.equal(janela.hidden, true);
  assert.deepEqual(fechou, { cadastrou: false, ticker: null }, 'desfeito: nada pra recarregar');
});

test('momento de aporte: FII com P/VP, sem dados de meta, e acima do teto sempre vira "Melhor esperar"', () => {
  const fii = { ticker: 'TEST11', moeda: 'BRL', precoAtual: 90, precoTeto: 100, quantidade: 10, precoMedio: 95, radar: { pvp: 0.9, percentualDesejado: 0.1, percentualAtual: 0.1 } };
  let m = momentoAporte(fii, 'fiis');
  assert.deepEqual(m.sinais.map((s) => s.tom), ['bom', 'bom', 'bom', 'neutro']);
  assert.equal(m.nivel, 'bom');
  m = momentoAporte({ ...fii, precoAtual: 101, radar: { pvp: 0.8, percentualDesejado: 0.5, percentualAtual: 0.01, valorInvestir: 9000 } }, 'fiis');
  assert.equal(m.nivel, 'esperar', 'teto é a regra do Tiago: acima dele, espera');
  assert.equal(momentoAporte({ ticker: 'X', precoAtual: 10 }, 'acoes').sinais.length, 0);
  assert.equal(momentoAporte(null, 'acoes').nivel, 'neutro');
  const rf = momentoAporte({ titulo: 'Tesouro Prefixado 2027', categoria: 'Renda Fixa', vencimento: '2027-01-01', taxaHoje: { taxa: 0.13 }, taxaContratada: { taxa: 0.14 } }, 'rendaFixa', null, '2026-09-26');
  assert.deepEqual(rf.sinais.map((s) => s.texto), ['Taxa de hoje (13,00% a.a.) menor que a sua média (14,00% a.a.)', 'Vence em menos de 1 ano']);
  assert.equal(rf.nivel, 'esperar');
});

test('shell: "Recalcular histórico" (Registro de Controle) roda a consolidação completa no mesmo painel', async () => {
  const { doc, w } = docComShell();
  const opcoes = [];
  setupConsolidacao(doc, {
    token: 'tk', win: { addEventListener() {}, location: { reload() {} } }, setTimeoutImpl: () => {}, limparCacheLocalImpl: async () => {},
    consolidarImpl: async (t, o) => { opcoes.push(o.tudo); return { ok: true, resultado: { status: 'concluido', continuar: false, feito: [], avisos: [] } }; },
  });
  const chip = doc.querySelector('[data-consolidar-tudo]');
  assert.ok(chip, 'botão no painel do Registro de Controle');
  clique(w, chip);
  await esperar();
  assert.deepEqual(opcoes, [true]);
  assert.equal(doc.getElementById('consolWrap').hidden, false);
  assert.match(doc.getElementById('consolOque').textContent, /todos os ativos/);
});

test('api-client: consolidar({ tudo }) manda tudo=1 só na 1ª rodada', async (t) => {
  const corpos = [];
  const respostas = [{ ok: true, resultado: { status: 'parcial', continuar: true } }, { ok: true, resultado: { status: 'concluido', continuar: false } }];
  t.mock.method(globalThis, 'fetch', async (url, opts) => { corpos.push(new URLSearchParams(String(opts.body))); return { json: async () => respostas.shift() }; });
  await consolidar('tk', { tudo: true, esperar: async () => {} });
  assert.deepEqual(corpos.map((b) => b.get('tudo')), ['1', null]);
});
