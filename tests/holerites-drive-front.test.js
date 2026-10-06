// tests/holerites-drive-front.test.js
//
// 05/10/2026: Tiago - "o site tem que achar os holerites no Drive
// (Documentos/Trabalho/<EMPRESA>/Holerite/<ANO>/MES-ANO.pdf), ler só os novos
// e registrar o que já importou, com 1 clique". Parte do navegador: o leitor
// em lote (holerite.js), o botão da aba Renda e o painel Documentos.
// Dados inventados; o PDF é trocado por linhas de texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { lerHoleritesDoDrive, holeritesNovosDrive, base64ParaBytes } from '../assets/js/pages/holerite.js';
import { htmlDriveHolerites } from '../assets/js/pages/organizacao-salario.js';
import { documentoHolerite, documentosOrganizacao } from '../assets/js/pages/organizacao-documentos.js';

const linhasDe = (mes, nomeMes, liquido = '7.450,00') => [
  'Demonstrativo de Pagamento',
  'Data de Crédito: 05/03/2026',
  `REFERENTE A ${nomeMes} DE ${mes.slice(0, 4)}`,
  '1  Salário  30  10.000,00  0,00  0,00',
  '239  Imposto de Renda  27,50  0,00  1.500,00  0,00',
  '270  Inss  11,65  0,00  900,00  0,00',
  '300  Plano de Saude  0  0,00  250,00  0,00',
  'Data.: _____  TOTAL DE VENCIMENTOS: R$ 10.000,00  TOTAL DE DESCONTOS: R$ 2.650,00',
  `RECEBI O VALOR LIQUIDO AO LADO  VALOR LÍQUIDO: R$ ${liquido}`,
  '10.000,00  8.000,00  10.000,00  800,00  9.100,00  0,00  0,00',
];
const PDFS = {
  a1: linhasDe('2026-01', 'JANEIRO'),
  a2: linhasDe('2026-02', 'FEVEREIRO'),
  ruim: ['arquivo que não é holerite'],
};
const arq = (id, nome, extra = {}) => ({ id, nome, empresa: 'EMPRESA TESTE', modificado: '2026-03-01T10:00:00Z', novo: true, importado: false, ...extra });

function ambiente(arquivos, { falhaSalvar = null } = {}) {
  const salvos = [];
  const baixados = [];
  return {
    salvos, baixados,
    args: {
      listar: async () => ({ ok: true, configurado: true, arquivos }),
      obter: async (id) => { baixados.push(id); return { ok: true, base64: Buffer.from(id).toString('base64') }; },
      salvar: async (p, a, o) => { salvos.push([p, a, o]); return falhaSalvar && p && p.mes === falhaSalvar ? { ok: false, erro: 'planilha ocupada' } : { ok: true, pagamento: p }; },
      carregarPdf: async () => ({}),
      lerPdf: async (lib, bytes) => PDFS[Buffer.from(bytes).toString()] || [],
      doc: {},
    },
  };
}

test('base64ParaBytes() / holeritesNovosDrive(): só o que o Apps Script marcou como novo (não registrado ou alterado)', () => {
  assert.equal(Buffer.from(base64ParaBytes(Buffer.from('abc').toString('base64'))).toString(), 'abc');
  const l = [arq('a1', '01-2026.pdf'), arq('a2', '02-2026.pdf', { novo: false, importado: true })];
  assert.deepEqual(holeritesNovosDrive(l).map((a) => a.id), ['a1']);
  assert.deepEqual(holeritesNovosDrive(null), []);
});

test('lerHoleritesDoDrive(): baixa só os novos, salva do mais antigo ao mais novo, o mensal mais novo vira a base das contas', async () => {
  const e = ambiente([arq('a2', '02-2026.pdf'), arq('a1', '01-2026.pdf'), arq('a0', '12-2025.pdf', { novo: false, importado: true })]);
  const r = await lerHoleritesDoDrive({ ...e.args, pagamentos: [] });
  assert.equal(r.ok, true);
  assert.equal(r.importados, 2);
  assert.deepEqual(e.baixados.sort(), ['a1', 'a2'], 'o já importado não é baixado');
  assert.deepEqual(e.salvos.map(([p]) => p.mes), ['2026-01', '2026-02']);
  assert.deepEqual(e.salvos.map(([, , o]) => o.usarComoBase), [false, true]);
  assert.equal(e.salvos[0][0].liquido, 7450);
  assert.equal(e.salvos[0][1].id, 'a1');
  assert.equal(e.salvos[0][1].modificado, '2026-03-01T10:00:00Z', 'registra id + modifiedTime');
});

test('lerHoleritesDoDrive(): se já há um mensal mais novo salvo, o importado não vira base', async () => {
  const e = ambiente([arq('a1', '01-2026.pdf')]);
  await lerHoleritesDoDrive({ ...e.args, pagamentos: [{ mes: '2026-05', tipo: 'Mensal', status: 'Recebido' }] });
  assert.equal(e.salvos[0][2].usarComoBase, false);
});

test('lerHoleritesDoDrive(): PDF que o leitor não entende fica registrado como erro (não insiste); falha de rede não registra; o resto segue', async () => {
  const e = ambiente([arq('ruim', 'x.pdf'), arq('a1', '01-2026.pdf'), arq('a2', '02-2026.pdf')], { falhaSalvar: '2026-02' });
  const r = await lerHoleritesDoDrive({ ...e.args });
  assert.equal(r.importados, 1);
  assert.equal(r.falhas, 2);
  const registros = e.salvos.filter(([p]) => p === null);
  assert.equal(registros.length, 1, 'só o PDF ilegível é registrado como erro');
  assert.equal(registros[0][1].id, 'ruim');
  assert.equal(registros[0][1].situacao, 'erro');
  assert.ok(r.log.some((l) => l.id === 'a2' && /planilha ocupada/.test(l.msg) && l.registrar === false));
});

test('lerHoleritesDoDrive(): sem pasta no Drive / erro ao listar / nada novo - respostas claras, sem baixar nada', async () => {
  const e = ambiente([]);
  const semPasta = await lerHoleritesDoDrive({ ...e.args, listar: async () => ({ ok: true, configurado: false, arquivos: [] }) });
  assert.equal(semPasta.ok, false);
  assert.match(semPasta.erro, /configurarPastaHoleritesDireto/);
  const erro = await lerHoleritesDoDrive({ ...e.args, listar: async () => { throw new Error('sem rede'); } });
  assert.equal(erro.ok, false);
  assert.match(erro.erro, /Não consegui ver a pasta do Drive/); // 06/10/2026 (Onda 3): texto humano; o motivo técnico vai em `detalhe` (mostrado num <details>)
  assert.match(erro.detalhe, /sem rede/);
  const nada = await lerHoleritesDoDrive({ ...e.args, listar: async () => ({ ok: true, configurado: true, arquivos: [arq('a1', '01-2026.pdf', { novo: false, importado: true })] }) });
  assert.equal(nada.ok, true);
  assert.equal(nada.nada, true);
  assert.equal(e.baixados.length, 0);
});

test('htmlDriveHolerites(): botão "Ler holerites do Drive (N novos)", lista do que foi lido, avisos de pasta/erro', () => {
  const h = htmlDriveHolerites({ ok: true, configurado: true, arquivos: [arq('a1', '01-2026.pdf'), arq('a2', '02-2026.pdf'), arq('a3', '03-2026.pdf', { novo: false })] });
  assert.match(h, /data-acao="ler-holerites-drive"/);
  assert.match(h, /Ler holerites do Drive \(2 novos\)/);
  assert.match(h, /2 holerites novos no Drive \(de 3\)/);
  const todos = htmlDriveHolerites({ ok: true, configurado: true, arquivos: [arq('a3', '03-2026.pdf', { novo: false })] });
  assert.match(todos, /todos já importados/);
  assert.doesNotMatch(todos, /\(\d+ novos?\)/);
  const lendo = htmlDriveHolerites({ ok: true, configurado: true, arquivos: [arq('a1', 'x.pdf')], lendo: 'Lendo 1/2…' });
  assert.doesNotMatch(lendo, /data-acao="ler-holerites-drive"/);
  assert.match(lendo, /disabled/);
  const log = htmlDriveHolerites({ ok: true, configurado: true, arquivos: [], log: [{ status: 'ok', nome: '01-2026.pdf', empresa: 'EMPRESA TESTE', msg: 'Mensal 2026-01' }, { status: 'erro', nome: 'x.pdf', msg: 'sem líquido' }] });
  assert.match(log, /EMPRESA TESTE · 01-2026\.pdf/);
  assert.match(log, /class="erro"/);
  assert.match(htmlDriveHolerites({ configurado: false }), /configurarPastaHoleritesDireto/);
  assert.match(htmlDriveHolerites({ erro: 'ação desconhecida' }), /ação desconhecida/);
  assert.equal(htmlDriveHolerites(null), '');
});

test('Documentos: holerite vira "Drive · 1 clique" quando o Drive responde; sem Drive continua com o envio manual', () => {
  const base = { id: 'holerite', nome: 'Holerite', estado: 'ok', proximo: 'mês que vem', acao: { id: 'holerite', rotulo: 'Importar holerite' } };
  const sem = documentoHolerite(base, null);
  assert.equal(sem.acao.id, 'holerite');
  assert.match(sem.como, /configurarPastaHoleritesDireto/);
  const com = documentoHolerite(base, { ok: true, configurado: true, arquivos: [arq('a1', '01-2026.pdf'), arq('a2', '02-2026.pdf')] });
  assert.equal(com.automatico, 'clique');
  assert.equal(com.acao.id, 'holerite-drive');
  assert.match(com.acao.rotulo, /Ler os 2 novos do Drive/);
  assert.match(com.como, /Enviar arquivo/);
  assert.equal(com.estado, 'atencao');
  const nada = documentoHolerite(base, { ok: true, configurado: true, arquivos: [arq('a1', '01-2026.pdf', { novo: false })] });
  assert.equal(nada.acao.rotulo, 'Ler do Drive');
  assert.equal(nada.estado, 'ok');
  assert.equal(documentoHolerite(null, null), null);
});

test('documentosOrganizacao(): o item do holerite usa o Drive quando holeritesDrive chega', () => {
  const fontes = { patrimonio: { config: {}, historicoMensal: [] }, salario: { pagamentos: [{ mes: '2026-01', tipo: 'Mensal', status: 'Recebido', liquido: 7000 }], mensal: [] }, gastos: { arquivos: [] }, gastosDrive: null, hoje: '2026-10-05' };
  const r = documentosOrganizacao({ ...fontes, holeritesDrive: { ok: true, configurado: true, arquivos: [arq('a1', '01-2026.pdf')] } });
  const itens = r.itens || r.documentos || r;
  const lista = Array.isArray(itens) ? itens : [...(r.manual || []), ...(r.auto || [])];
  const h = lista.find((x) => x.id === 'holerite');
  assert.ok(h, 'item holerite presente');
  assert.equal(h.acao.id, 'holerite-drive');
});

// ---- aba "Renda e Orçamentos": o botão do Drive de ponta a ponta (jsdom) ----
const RESPOSTA = {
  ok: true, hoje: '2026-04-15',
  base: { liquido: 10000, percentualInvestir: 0.2, aporteMeta: 2000 },
  patrimonio: { atual: 100000, desejado: 1000000, rendimento: 0.06, extra: 1000, reinvestimento: 0.25 },
  despesas: { totalReal: 5000, totalComFolga: 5500 },
  pagamentos: [], mensal: [],
};

async function montarAba({ arquivos, erroListar = null }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="s"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html#salario', pretendToBeVisual: true });
  globalThis.localStorage = dom.window.localStorage;
  const doc = dom.window.document;
  const { montarAbaSalario } = await import('../assets/js/pages/organizacao-salario.js');
  let servidor = JSON.parse(JSON.stringify(RESPOSTA));
  let lista = arquivos;
  const salvos = [];
  const mudancas = [];
  const aba = montarAbaSalario({
    doc, el: doc.getElementById('s'), token: 'tk',
    getSalarioImpl: async () => JSON.parse(JSON.stringify(servidor)),
    listarHoleritesImpl: async () => (erroListar ? { ok: false, erro: erroListar } : { ok: true, configurado: true, arquivos: lista }),
    obterHoleriteImpl: async (_t, id) => ({ ok: true, base64: Buffer.from(id).toString('base64') }),
    salvarHoleriteDriveImpl: async (_t, p, a, o) => {
      salvos.push({ p, a, o });
      if (p) {
        servidor = { ...servidor, pagamentos: [{ ...p, status: 'Recebido' }, ...servidor.pagamentos] };
        lista = lista.map((x) => (x.id === a.id ? { ...x, novo: false, importado: true } : x));
      }
      return { ...JSON.parse(JSON.stringify(servidor)), ok: true };
    },
    carregarPdf: async () => ({}),
    lerPdf: async (lib, bytes) => PDFS[Buffer.from(bytes).toString()] || [],
    aoMudarDrive: (d) => mudancas.push(d),
  });
  await aba.pronto;
  await new Promise((r) => setTimeout(r, 0));
  return { dom, doc, w: dom.window, el: doc.getElementById('s'), salvos, aba, mudancas };
}

test('Aba Renda: mostra "Ler holerites do Drive (2 novos)"; 1 clique importa só os novos, mostra o resultado e o botão volta sem novos; o envio manual continua', async () => {
  const { el, w, salvos } = await montarAba({ arquivos: [arq('a1', '01-2026.pdf'), arq('a2', '02-2026.pdf')] });
  const botao = el.querySelector('[data-acao="ler-holerites-drive"]');
  assert.ok(botao, 'botão do Drive');
  assert.match(botao.textContent, /\(2 novos\)/);
  assert.ok(el.querySelector('[data-acao="importar"]'), 'importar PDF manual continua');
  botao.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  for (let k = 0; k < 20; k += 1) await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(salvos.filter((x) => x.p).map((x) => x.p.mes), ['2026-01', '2026-02']);
  const t = el.querySelector('.sl-drive').textContent.replace(/\s+/g, ' ');
  assert.match(t, /2 holerites importados/);
  assert.match(t, /01-2026\.pdf/);
  assert.match(el.querySelector('[data-acao="ler-holerites-drive"]').textContent, /^Ler holerites do Drive$/);
  assert.ok(el.querySelector('#slHolerite').textContent.includes('Fevereiro') || /fev/i.test(el.querySelector('#slHolerite').textContent), 'o holerite novo aparece na aba');
});

test('Aba Renda: Apps Script sem a versão nova (ação desconhecida) - mensagem pede a NOVA VERSÃO, o resto da aba segue', async () => {
  const { el } = await montarAba({ arquivos: [], erroListar: 'ação desconhecida: holeritesArquivos' });
  assert.match(el.querySelector('.sl-drive-msg').textContent, /NOVA VERSÃO/);
  assert.ok(el.querySelector('[data-acao="importar"]'));
});
