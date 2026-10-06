/**
 * 07/10/2026 (Tiago, sync de documentos): cartão/conta encerrado sai do "atrasado"; "soma não bate" é parcial (entrou,
 * fora do "com problema"); extrato de proventos da B3 registrado (o painel sabe o último mês que chegou); remover vários
 * arquivos de uma vez. Dados inventados.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  coberturaDocumentos, situacaoArquivoDrive, arquivosFalhosDrive, arquivosParciaisDrive, arquivosNovosDrive, fonteArquivoDrive,
} from '../assets/js/pages/gastos-calc.js';
import { documentoGastos, documentoB3, documentosOrganizacao, htmlListaDocumentos } from '../assets/js/pages/organizacao-documentos.js';
import { htmlDocumentos } from '../assets/js/pages/organizacao-gastos.js';
import { htmlConferenciaB3 } from '../assets/js/pages/lancamentos.js';

const HOJE = '2026-10-15';
const arq = (id, fonte, meses, extra = {}) => ({ id, nome: `${id}.pdf`, caminho: 'Cartão de Crédito/X', fonte, meses, situacao: 'ok', ...extra });
const ARQUIVOS = [
  arq('c1', 'cartao-velho-inexistente', ['2024-01']), // fonte desconhecida não atrapalha
  arq('o1', 'ourocard', ['2024-05']), arq('o2', 'ourocard', ['2024-06'], { situacao: 'aviso', conferencia: { ok: false, diferenca: 12.3 }, problema: 'soma não bate' }),
  arq('n1', 'nubank-cartao', ['2026-08']), arq('n2', 'nubank-cartao', ['2026-09']),
];

test('cobertura: fonte encerrada não tem "faltam meses" e vem marcada', () => {
  const sem = coberturaDocumentos(ARQUIVOS, HOJE);
  const ouro = sem.fontes.find((f) => f.fonte === 'ourocard');
  assert.equal(ouro.encerrada, false);
  assert.ok(ouro.faltam.length > 20, 'sem encerrar: dois anos "faltando"');
  const com = coberturaDocumentos(ARQUIVOS, HOJE, { encerradas: ['ourocard'] });
  const o2 = com.fontes.find((f) => f.fonte === 'ourocard');
  assert.deepEqual([o2.encerrada, o2.faltam], [true, []]);
  assert.deepEqual([...com.mesesCobertos].sort(), [...sem.mesesCobertos].sort(), 'os meses importados continuam valendo');
});

test('faturas: OuroCard encerrado sai do atrasado; o que sobrou dele no Drive não pede importação', () => {
  const drive = { arquivos: [
    { id: 'x9', nome: '07-2024.pdf', caminho: 'Cartão de Crédito/OuroCard/2024', banco: 'OuroCard', origem: 'cartao', importado: false },
  ] };
  const antes = documentoGastos('faturas', { gastos: { arquivos: ARQUIVOS }, gastosDrive: drive, hoje: HOJE });
  assert.equal(antes.estado, 'atrasado');
  const depois = documentoGastos('faturas', { gastos: { arquivos: ARQUIVOS, fontesEncerradas: ['ourocard'] }, gastosDrive: drive, hoje: HOJE });
  assert.equal(depois.estado, 'ok');
  assert.match(depois.ultimo, /Nubank \(cartão\) set\/26/);
  assert.match(depois.ultimo, /OuroCard encerrado \(até jun\/24\)/);
  assert.doesNotMatch(depois.proximo, /no Drive/, 'arquivo novo de cartão encerrado não conta');
  assert.deepEqual(depois.fontesEditaveis.map((f) => [f.fonte, f.encerrada]), [['nubank-cartao', false], ['ourocard', true]]);
  // só encerrados: nada a mandar
  const so = documentoGastos('faturas', { gastos: { arquivos: ARQUIVOS.filter((a) => a.fonte === 'ourocard'), fontesEncerradas: ['ourocard'] }, gastosDrive: { arquivos: [] }, hoje: HOJE });
  assert.deepEqual([so.estado, so.proximo], ['ok', 'nenhum cartão em uso - nada a mandar']);
});

test('Drive: "soma não bate" é parcial (fora do falhou e do novo); releitura que falhou continua problema', () => {
  const lista = [
    { id: 'a', importado: true, situacao: 'aviso', problema: 'soma não bate' },
    { id: 'b', importado: false, situacao: 'erro', problema: 'não li' },
    { id: 'c', importado: true, situacao: 'ok' },
    { id: 'd', importado: true, alterado: true, situacao: 'ok', problema: 'quebrou' },
    { id: 'e', importado: true, alterado: true, situacao: 'aviso', problema: 'soma não bate' },
    { id: 'f', importado: false, situacao: '' },
  ];
  assert.deepEqual(lista.map(situacaoArquivoDrive), ['parcial', 'falhou', 'importado', 'falhou', 'novo', 'novo']);
  assert.deepEqual(arquivosFalhosDrive(lista).map((a) => a.id), ['b', 'd']);
  assert.deepEqual(arquivosParciaisDrive(lista).map((a) => a.id), ['a']);
  assert.deepEqual(arquivosNovosDrive(lista).map((a) => a.id), ['e', 'f']);
  assert.equal(fonteArquivoDrive({ banco: 'OuroCard', origem: 'cartao' }), 'ourocard');
  assert.equal(fonteArquivoDrive({ caminho: 'Extratos/Bradesco/2020', origem: 'conta' }), 'bradesco');
  assert.equal(fonteArquivoDrive({ banco: 'Nubank', origem: 'conta' }), 'nubank-conta');
  assert.equal(fonteArquivoDrive({ fonte: 'ofx-conta', banco: 'Nubank' }), 'ofx-conta', 'o registro manda');
});

test('extrato de proventos da B3: com o mês registrado fica em dia; sem registro, pede; atraso de 2+ meses', () => {
  const inicio = '2026-10-04'; // começo do mês: o alvo é setembro
  const nunca = documentoB3(inicio, null);
  assert.deepEqual([nunca.estado, nunca.ultimo, nunca.proximo], ['atencao', 'nenhum ainda', 'hora de mandar o de set/26']);
  const enviado = documentoB3(inicio, { ultimoMes: '2026-09', fim: '2026-09-30', conferidoEm: '2026-10-03', arquivo: 'movimentacao-inventada.xlsx' });
  assert.equal(enviado.estado, 'ok');
  assert.match(enviado.ultimo, /^set\/26 · chegou em 03\/10/);
  assert.match(enviado.proximo, /out\/26/);
  const velho = documentoB3('2026-10-15', { ultimoMes: '2026-07', fim: '2026-07-31', conferidoEm: '2026-08-02' });
  assert.equal(velho.estado, 'atrasado');
  assert.match(velho.proximo, /faltam 2 meses \(de ago\/26 a set\/26\)/);
  assert.equal(documentoB3(inicio, undefined).estado, 'carregando');
  // no painel: vem de patrimonio.extratoB3
  const r = documentosOrganizacao({ patrimonio: { config: {}, extratoB3: { ultimoMes: '2026-09', conferidoEm: '2026-10-03' } }, salario: null, gastos: null, hoje: inicio });
  const b3 = r.itens.find((x) => x.id === 'b3');
  assert.equal(b3.estado, 'ok');
  assert.match(htmlListaDocumentos(r), /último: <b>set\/26 · chegou em 03\/10/);
});

test('painel Documentos: "Cartões em uso" com a caixinha de cada um; desmarcar avisa "fonte-encerrada"', () => {
  const dom = new JSDOM('<!doctype html><body><div id="d"></div></body>', { url: 'https://exemplo.test/' });
  const doc = dom.window.document;
  return import('../assets/js/pages/organizacao-documentos.js').then(({ montarPainelDocumentos }) => {
    const acoes = [];
    const store = { getItem: () => '1', setItem() {} };
    const painel = montarPainelDocumentos(doc.getElementById('d'), { doc, storage: store, aoAcao: (a, x) => acoes.push([a, x]) });
    painel.atualizar({ patrimonio: { config: {} }, salario: null, gastos: { arquivos: ARQUIVOS, fontesEncerradas: [] }, gastosDrive: { arquivos: [] }, hoje: HOJE });
    const caixa = doc.querySelector('[data-doc-fonte="ourocard"]');
    assert.ok(caixa && caixa.checked, 'em uso = marcado');
    doc.querySelector('details[data-doc-det="faturas"]').open = true;
    caixa.checked = false;
    caixa.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.deepEqual(acoes, [['fonte-encerrada', { fonte: 'ourocard', encerrada: true }]]);
    // o servidor salvou: redesenha com o OuroCard encerrado e o <details> continua aberto
    painel.atualizar({ patrimonio: { config: {} }, salario: null, gastos: { arquivos: ARQUIVOS, fontesEncerradas: ['ourocard'] }, gastosDrive: { arquivos: [] }, hoje: HOJE });
    assert.equal(doc.querySelector('[data-doc-fonte="ourocard"]').checked, false);
    assert.equal(doc.querySelector('details[data-doc-det="faturas"]').open, true);
    assert.match(doc.querySelector('[data-doc-id="faturas"]').textContent, /OuroCard encerrado/);
  });
});

test('Gastos › Documentos: parcial fica num grupo à parte (fora do "Não entraram"), cada arquivo tem caixinha; encerrei/reativar', () => {
  const arquivos = [
    ...ARQUIVOS,
    { id: 'e1', nome: 'quebrado.pdf', caminho: 'Cartão de Crédito/Nubank/2026', fonte: 'nubank-cartao', meses: [], situacao: 'erro', problema: 'não achei o vencimento' },
  ];
  const r = { arquivos, cobertura: coberturaDocumentos(arquivos, HOJE, { encerradas: ['ourocard'] }) };
  const html = htmlDocumentos(r, {});
  const dom = new JSDOM(`<div>${html}</div>`);
  const d = dom.window.document;
  const prob = d.querySelector('[data-grupo="problemas"]');
  const parc = d.querySelector('[data-grupo="parciais"]');
  assert.match(prob.querySelector('summary').textContent, /Não entraram \(1\)/);
  assert.ok(prob.open, 'o que não entrou fica aberto');
  assert.doesNotMatch(prob.textContent, /o2\.pdf/, 'parcial não está no "não entraram"');
  assert.match(parc.querySelector('summary').textContent, /Entraram parcialmente \(1\)/);
  assert.equal(parc.open, false, 'parcial fica recolhido');
  assert.ok(parc.querySelector('.gs-sel-arq[value="o2"]'));
  assert.equal(d.querySelectorAll('[data-grupo="todos"] .gs-sel-arq').length, 5, 'todos os importados (sem o que não entrou)');
  assert.ok(d.querySelector('[data-acao="fonte-encerrar"][data-fonte="ourocard"][data-encerrada="0"]'), 'OuroCard encerrado: "reativar"');
  assert.ok(d.querySelector('[data-acao="fonte-encerrar"][data-fonte="nubank-cartao"][data-encerrada="1"]'), 'Nubank em uso: "encerrei"');
  assert.match(d.querySelector('.gs-encerrada').textContent, /encerrado/);
});

test('Lançamentos: o extrato de proventos diz que registrou - ou que já tinha chegado', () => {
  assert.equal(htmlConferenciaB3(null), '');
  assert.match(htmlConferenciaB3({ ok: true, meses: ['2026-09'], jaEnviado: true, linhasNovas: 0, ignoradasDuplicadas: 8 }), /já tinha chegado \(set\/26\)\. Nada novo/);
  assert.match(htmlConferenciaB3({ ok: true, meses: ['2026-09'], jaEnviado: false, linhasNovas: 3, ignoradasDuplicadas: 1 }), /registrado \(set\/26\): 3 proventos na conferência, 1 já estava lá/);
});

test('carregador compartilhado: busca que começou antes e termina depois não desfaz o que foi salvo (OuroCard "reativando sozinho")', async () => {
  const { criarCarregador } = await import('../assets/js/pages/organizacao.js');
  const pendentes = [];
  const c = criarCarregador(() => new Promise((res) => pendentes.push(res)));
  const vistos = [];
  c.inscrever((v) => vistos.push(v && v.fontesEncerradas));
  const velha = c.obter(); // releitura em andamento, com a lista antiga
  c.definir({ ok: true, fontesEncerradas: ['ourocard'] }); // quem salvou já sabe a lista nova
  pendentes[0]({ ok: true, fontesEncerradas: [] });
  await velha;
  assert.deepEqual(c.valor.fontesEncerradas, ['ourocard'], 'a resposta velha não sobrescreve');
  // duas buscas: a mais nova vale, mesmo que a mais velha chegue por último
  const a = c.recarregar(); const b = c.recarregar();
  pendentes[2]({ ok: true, fontesEncerradas: ['ourocard', 'bradesco'] });
  await b;
  pendentes[1]({ ok: true, fontesEncerradas: [] });
  await a;
  assert.deepEqual(c.valor.fontesEncerradas, ['ourocard', 'bradesco']);
  assert.deepEqual(vistos.at(-1), ['ourocard', 'bradesco']);
});

test('falha ao salvar: Apps Script antigo ("ação desconhecida") diz pra publicar a nova versão', async () => {
  const { mensagemFalhaGastos } = await import('../assets/js/pages/organizacao-gastos.js');
  assert.match(mensagemFalhaGastos({ ok: false, erro: 'ação desconhecida: salvarFontesGastos' }, 'x'), /versão antiga.*nova versão da implantação/);
  assert.equal(mensagemFalhaGastos({ ok: false, erro: 'planilha ocupada' }, 'tente de novo'), 'tente de novo');
});

test('mês sem fatura: sai do "faltam" (e do atrasado), fica marcado à parte; fatura deste mês já entrou -> a próxima ainda está aberta', () => {
  const arqs = [arq('n1', 'nubank-cartao', ['2026-06']), arq('n2', 'nubank-cartao', ['2026-09']), arq('n3', 'nubank-cartao', ['2026-10'])];
  const sem = coberturaDocumentos(arqs, '2026-10-07');
  assert.deepEqual(sem.fontes[0].faltam, ['2026-07', '2026-08']);
  const com = coberturaDocumentos(arqs, '2026-10-07', { semMovimento: { 'nubank-cartao': ['2026-07', '2026-08', '2025-01'] } });
  assert.deepEqual([com.fontes[0].faltam, com.fontes[0].semMovimento], [[], ['2026-07', '2026-08']], 'só os meses sem documento contam como "sem fatura"');
  const doc = documentoGastos('faturas', { gastos: { arquivos: arqs, fontesEncerradas: [], mesesSemMovimento: { 'nubank-cartao': ['2026-07', '2026-08'] } }, gastosDrive: { arquivos: [] }, hoje: '2026-10-07' });
  assert.equal(doc.estado, 'ok');
  assert.equal(doc.proximo, 'próxima: a que vence em nov/26 (ainda aberta)', 'a de out/26 já entrou: não pede a que ainda não fechou');
  const falta = documentoGastos('faturas', { gastos: { arquivos: arqs.slice(0, 2), fontesEncerradas: [] }, gastosDrive: { arquivos: [] }, hoje: '2026-10-07' });
  assert.match(falta.proximo, /fatura de out\/26 \(a que vence este mês\)/);
});

test('Apps Script antigo (resposta sem fontesEncerradas): caixinhas desabilitadas + como publicar; Gastos esconde "encerrei"', () => {
  const doc = documentoGastos('faturas', { gastos: { arquivos: ARQUIVOS }, gastosDrive: { arquivos: [] }, hoje: HOJE });
  assert.ok(doc.fontesEditaveis.every((f) => f.servidorAntigo));
  const html = htmlListaDocumentos({ manual: [], auto: [doc] });
  assert.match(html, /Nova versão/);
  assert.match(html, /data-doc-fonte="ourocard" checked disabled/);
  const r = { arquivos: ARQUIVOS, cobertura: coberturaDocumentos(ARQUIVOS, HOJE) };
  const g = htmlDocumentos(r, { servidorAntigo: true });
  assert.match(g, /Nova versão/);
  assert.doesNotMatch(g, /data-acao="fonte-encerrar"|data-acao="sem-mov-abrir"/);
  const g2 = htmlDocumentos(r, { semAberto: 'ourocard' });
  assert.match(g2, /class="gs-sem-mes" data-fonte="ourocard" value="2026-09"/);
});
