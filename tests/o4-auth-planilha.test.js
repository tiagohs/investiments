// 06/10/2026 (A-27): e-mail autorizado nas Propriedades (não no código) e URL da planilha vinda da API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { aplicarLinkPlanilha, renderSyncStatus, carregarStatusSync } from '../assets/js/shell.js';

function sandbox(emailEfetivo = 'dono@exemplo.test') {
  const props = new Map();
  const sb = {
    console, Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => emailEfetivo }) },
  };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(new URL('../apps-script/Auth.gs', import.meta.url), 'utf8'), { filename: 'Auth.gs' }).runInContext(sb);
  return { sb, props };
}

test('Auth.gs: sem EMAIL_AUTORIZADO configurado ninguém passa (falha fechada)', () => {
  const { sb } = sandbox();
  assert.equal(sb.emailConfere_('dono@exemplo.test'), false);
});

test('configurarEmailAutorizado() sem parâmetro usa o e-mail de quem executa; com parâmetro grava o dado; compara sem caixa/espaços', () => {
  const { sb, props } = sandbox('Dono@Exemplo.test');
  sb.configurarEmailAutorizado();
  assert.equal(props.get('EMAIL_AUTORIZADO'), 'dono@exemplo.test');
  assert.equal(sb.emailConfere_(' DONO@exemplo.test '), true);
  assert.equal(sb.emailConfere_('outro@exemplo.test'), false);
  sb.configurarEmailAutorizado('novo@exemplo.test');
  assert.equal(sb.emailConfere_('novo@exemplo.test'), true);
  assert.throws(() => sb.configurarEmailAutorizado('sem-arroba'));
});

test('o repositório não versiona mais o e-mail autorizado nem o ID da planilha (código, config e docs)', () => {
  const raiz = new URL('../', import.meta.url);
  const arquivos = ['apps-script/Auth.gs', 'assets/js/config.js', 'assets/js/shell.js', 'docs/plano-implementacao.html', 'docs/direcao-visual.html'];
  for (const a of arquivos) {
    const t = fs.readFileSync(new URL(a, raiz), 'utf8');
    // padrões genéricos (sem citar o e-mail nem o ID reais, que não podem estar no repositório)
    assert.doesNotMatch(t, /[\w.+-]+@gmail\.com/i, a);
    assert.doesNotMatch(t, /spreadsheets\/d\/[A-Za-z0-9_-]{20,}/, a);
  }
  assert.doesNotMatch(fs.readFileSync(new URL('assets/js/config.js', raiz), 'utf8'), /SPREADSHEET_URL/);
});

function dom() {
  const d = new JSDOM('<a id="planilhaLink" href="#"></a><a id="planilhaDrawer" href="#"></a><a id="syncSheetLink" href="#"></a><div id="syncLog"></div>');
  return d.window.document;
}

test('aplicarLinkPlanilha: aponta os 3 links; recusa URL que não é do Google Planilhas', () => {
  const doc = dom();
  assert.equal(aplicarLinkPlanilha(doc, 'javascript:alert(1)'), false);
  assert.equal(doc.getElementById('planilhaLink').getAttribute('href'), '#');
  assert.equal(aplicarLinkPlanilha(doc, 'https://docs.google.com/spreadsheets/d/XYZ/edit'), true);
  for (const id of ['planilhaLink', 'planilhaDrawer', 'syncSheetLink']) assert.equal(doc.getElementById(id).getAttribute('href'), 'https://docs.google.com/spreadsheets/d/XYZ/edit');
});

test('renderSyncStatus recebe a URL como 4º argumento; carregarStatusSync usa o planilhaUrl da resposta e o guarda p/ a carga leve', async () => {
  const doc = dom();
  renderSyncStatus(doc, null, new Date(), 'https://docs.google.com/spreadsheets/d/AAA/edit');
  assert.match(doc.getElementById('syncSheetLink').getAttribute('href'), /AAA/);
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const d2 = dom();
  await carregarStatusSync(d2, { token: 't', storage: st, leve: true, getSyncHistoricoImpl: async () => ({ ok: true, resultado: [], planilhaUrl: 'https://docs.google.com/spreadsheets/d/BBB/edit' }) });
  assert.match(d2.getElementById('planilhaLink').getAttribute('href'), /BBB/);
  const d3 = dom();
  await carregarStatusSync(d3, { token: 't', storage: st, leve: true, getSyncHistoricoImpl: async () => { throw new Error('não devia buscar'); } });
  assert.match(d3.getElementById('planilhaDrawer').getAttribute('href'), /BBB/, 'veio do resumo guardado');
});

test('A-80: opcoesTeste só aceita abas "aux_tests*"; teste.html saiu da raiz; __pycache__ ignorado', () => {
  const sb = { console };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(new URL('../apps-script/Planilha.gs', import.meta.url), 'utf8'), { filename: 'Planilha.gs' }).runInContext(sb);
  assert.equal(sb.nomeAbaTesteValido_(undefined), 'aux_tests');
  assert.equal(sb.nomeAbaTesteValido_('aux_tests_2'), 'aux_tests_2');
  assert.throws(() => sb.nomeAbaTesteValido_('Transações'), /aux_tests/);
  assert.throws(() => sb.nomeAbaTesteValido_('meu_aux_tests'));
  const raiz = new URL('../', import.meta.url);
  assert.equal(fs.existsSync(new URL('teste.html', raiz)), false);
  assert.match(fs.readFileSync(new URL('.gitignore', raiz), 'utf8'), /__pycache__/);
  for (const a of ['apps-script/ImportB3.gs', 'apps-script/Sync.gs']) assert.match(fs.readFileSync(new URL(a, raiz), 'utf8'), /nomeAbaTesteValido_\(opcoesTeste\./);
});

// 08/10/2026 (Tiago: "quero adicionar mais um usuário, com outro gmail, para acessar o site e todos os funcionamentos")
test('mais de um e-mail autorizado: autorizar, listar, remover (o dono não sai) e trocar o dono mantém os outros', () => {
  const { sb, props } = sandbox('dono@exemplo.test');
  assert.throws(() => sb.autorizarOutroEmailDireto('outra@exemplo.test'), /configurarEmailAutorizado/, 'sem dono configurado, não começa pela 2ª conta');
  sb.configurarEmailAutorizado();
  sb.autorizarOutroEmailDireto(' Outra@Exemplo.test ');
  sb.autorizarOutroEmailDireto('outra@exemplo.test');
  assert.equal(props.get('EMAIL_AUTORIZADO'), 'dono@exemplo.test,outra@exemplo.test');
  assert.equal(sb.emailConfere_('OUTRA@exemplo.test'), true);
  assert.equal(sb.emailConfere_('terceira@exemplo.test'), false);
  assert.equal(sb.emailAutorizado_(), 'dono@exemplo.test');
  assert.deepEqual([...sb.listarEmailsAutorizadosDireto()], ['dono@exemplo.test', 'outra@exemplo.test']);
  assert.throws(() => sb.autorizarOutroEmailDireto('sem-arroba'));
  assert.throws(() => sb.removerEmailAutorizadoDireto('dono@exemplo.test'), /dono/);
  sb.configurarEmailAutorizado('novo-dono@exemplo.test');
  assert.equal(props.get('EMAIL_AUTORIZADO'), 'novo-dono@exemplo.test,outra@exemplo.test');
  sb.removerEmailAutorizadoDireto('outra@exemplo.test');
  assert.equal(sb.emailConfere_('outra@exemplo.test'), false);
  assert.equal(sb.emailConfere_('novo-dono@exemplo.test'), true);
});
