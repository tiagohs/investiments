// tests/harness/gastos-organizacao.test.js
//
// 02/10/2026: apps-script/Gastos.gs (seção Gastos da Organização Financeira)
// numa planilha falsa em memória + um DriveApp falso - tudo inventado:
//  - importar um arquivo grava os lançamentos (texto limpo), registra o
//    arquivo; reimportar substitui; outro arquivo que cobre o mesmo dia não
//    duplica (chave); excluir tira tudo do arquivo;
//  - regra de categoria recategoriza o que já está na planilha;
//  - listagem das pastas: nome da pasta sem o que estiver entre parênteses,
//    novos/alterados; arquivo de fora das pastas é recusado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';

function driveFalso() {
  let n = 0;
  const pasta = (nome, pai = null) => {
    const p = { id: `p${++n}`, nome, pai, filhos: [], arquivos: [] };
    if (pai) pai.filhos.push(p);
    return p;
  };
  const docs = pasta('Documentos');
  const trans = pasta('Transações ', docs); // com espaço no fim, como no Drive de verdade
  const cartao = pasta('Cartão de Crédito', trans);
  const extratos = pasta('Extratos', trans);
  const ouro = pasta('OuroCard (dica 000)', cartao);
  const ano = pasta('2025', ouro);
  const nu = pasta('Nubank', extratos);
  const outra = pasta('Outra');
  const arq = (nome, pai, mod, mime = 'application/pdf') => { const a = { id: `f${++n}`, nome, pai, mod, mime }; pai.arquivos.push(a); return a; };
  const f1 = arq('09-2025.pdf', ano, '2025-10-01T10:00:00.000Z');
  const f2 = arq('10-2025.pdf', ano, '2025-11-01T10:00:00.000Z');
  arq('.DS_Store', ouro, '2025-11-01T10:00:00.000Z', 'application/octet-stream');
  const f3 = arq('03-2025.pdf', nu, '2025-04-01T10:00:00.000Z');
  const fora = arq('segredo.pdf', outra, '2025-01-01T10:00:00.000Z');
  const todasPastas = [docs, trans, cartao, extratos, ouro, ano, nu, outra];
  const it = (xs) => { let i = 0; return { hasNext: () => i < xs.length, next: () => xs[i++] }; };
  const fPasta = (p) => ({
    getId: () => p.id, getName: () => p.nome,
    getFolders: () => it(p.filhos.map(fPasta)), getFiles: () => it(p.arquivos.map(fArq)),
    getParents: () => it(p.pai ? [fPasta(p.pai)] : []),
  });
  const fArq = (a) => ({
    getId: () => a.id, getName: () => a.nome, getMimeType: () => a.mime, getSize: () => 1000,
    getLastUpdated: () => new Date(a.mod), getParents: () => it([fPasta(a.pai)]),
    getBlob: () => ({ getBytes: () => [37, 80, 68, 70] }),
  });
  const DriveApp = {
    searchFolders: (q) => { const t = (q.match(/'([^']+)'/) || [])[1]; return it(todasPastas.filter((p) => p.nome.includes(t)).map(fPasta)); },
    getFolderById: (id) => fPasta(todasPastas.find((p) => p.id === id)),
    getFileById: (id) => { const a = [...todasPastas.flatMap((p) => p.arquivos)].find((x) => x.id === id); if (!a) throw new Error('não existe'); return fArq(a); },
  };
  return { DriveApp, f1, f2, f3, fora, ano };
}

const lanc = (o) => ({ mes: '2025-10', data: '2025-09-20', origem: 'cartao', fonte: 'ourocard', descricao: 'LOJA INVENTADA', categoria: 'compras', valor: 10, tipo: 'compra', parcela: '', ...o });

test('Gastos.gs: importa, substitui na reimportação, não duplica entre arquivos, limpa texto, exclui', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  sb.SpreadsheetApp.flush = () => {};
  const agora = new sb.Date(2025, 10, 2);
  const lancs = [
    lanc({ descricao: '=HYPERLINK("x") LOJA', chaveDedup: 'k1' }),
    lanc({ descricao: 'PIX FULANO •••.111.222-•• 12345678901234', valor: 50, tipo: 'transferencia', categoria: 'transferencias', chaveDedup: 'k2', parcela: '2/5' }),
    lanc({ mes: 'errado' }),
  ];
  let r = plain(sb.salvarImportacaoGastos_(ss, { id: 'A', nome: '10-2025.pdf', caminho: 'Cartão de Crédito/OuroCard/2025', fonte: 'ourocard', modificado: '2025-11-01T10:00:00.000Z', meses: ['2025-10'], total: 60, conferencia: { ok: true, diferenca: 0, regra: 'x' } }, lancs, agora));
  assert.deepEqual([r.ok, r.gravados, r.descartados], [true, 2, 1]);
  let g = plain(sb.lerGastos_(ss));
  assert.equal(g.lancamentos.length, 2);
  const descs = g.lancamentos.map((l) => l[4]);
  assert.ok(descs.every((d) => !/^=|•|\d{6,}/.test(d)), JSON.stringify(descs));
  assert.equal(g.lancamentos.find((l) => l[7] === 'transferencia')[8], '2/5');
  assert.deepEqual(g.arquivos.map((a) => [a.id, a.meses, a.lancamentos, a.conferencia.ok]), [['A', ['2025-10'], 2, true]]);
  // reimportar o mesmo arquivo substitui
  r = plain(sb.salvarImportacaoGastos_(ss, { id: 'A', nome: '10-2025.pdf', fonte: 'ourocard', meses: ['2025-10'] }, [lanc({ chaveDedup: 'k1', valor: 11 })], agora));
  g = plain(sb.lerGastos_(ss));
  assert.equal(g.lancamentos.length, 1);
  assert.equal(g.lancamentos[0][6], 11);
  assert.equal(g.arquivos.length, 1);
  // outro arquivo com o mesmo lançamento (mesma chave) não duplica
  r = plain(sb.salvarImportacaoGastos_(ss, { id: 'B', nome: 'outro.pdf', fonte: 'ourocard', meses: ['2025-10'] }, [lanc({ chaveDedup: 'k1', valor: 11 }), lanc({ chaveDedup: 'k9', data: '2025-09-01', valor: 5 })], agora));
  assert.deepEqual([r.gravados, r.pulados], [1, 1]);
  g = plain(sb.lerGastos_(ss));
  assert.equal(g.lancamentos.length, 2);
  assert.equal(g.lancamentos[0][1], '2025-09-01', 'ordenado por data');
  // excluir
  plain(sb.excluirArquivoGastos_(ss, 'B'));
  g = plain(sb.lerGastos_(ss));
  assert.deepEqual(g.lancamentos.map((l) => l[9]), ['A']);
  assert.deepEqual(g.arquivos.map((a) => a.id), ['A']);
  assert.equal(plain(sb.salvarImportacaoGastos_(ss, {}, [], agora)).ok, false);
});

test('Gastos.gs: regra de categoria grava, recategoriza o que bate e apaga com categoria vazia', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  sb.SpreadsheetApp.flush = () => {};
  const agora = new sb.Date(2025, 10, 2);
  sb.salvarImportacaoGastos_(ss, { id: 'A', fonte: 'nubank-conta' }, [
    lanc({ descricao: 'Pagamento de boleto · CONDOMINIO INVENTADO', categoria: 'outros', tipo: 'boleto' }),
    lanc({ descricao: 'Outra coisa', categoria: 'outros' }),
  ], agora);
  const r = plain(sb.salvarRegraGastos_(ss, 'condomínio inventado', 'moradia', agora));
  assert.equal(r.ok, true);
  assert.equal(r.padrao, 'CONDOMINIO INVENTADO');
  assert.equal(r.recategorizados, 1);
  assert.deepEqual(r.regras.map((x) => [x.padrao, x.categoria]), [['CONDOMINIO INVENTADO', 'moradia']]);
  const g = plain(sb.lerGastos_(ss));
  assert.deepEqual(g.lancamentos.map((l) => l[5]), ['moradia', 'outros']);
  assert.equal(plain(sb.salvarRegraGastos_(ss, 'condominio inventado', 'nao-existe', agora)).ok, false);
  assert.equal(plain(sb.salvarRegraGastos_(ss, 'ab', 'moradia', agora)).ok, false);
  assert.deepEqual(plain(sb.salvarRegraGastos_(ss, 'CONDOMINIO INVENTADO', '', agora)).regras, []);
});

test('Gastos.gs: acha Documentos/Transações sozinho, lista as 2 pastas (sem o texto entre parênteses), marca novos/alterados, recusa arquivo de fora', () => {
  const ss = planilhaFalsa({});
  const { sb, props } = sandboxGas(ss);
  sb.SpreadsheetApp.flush = () => {};
  const d = driveFalso();
  sb.DriveApp = d.DriveApp;
  sb.Utilities.base64Encode = (bytes) => Buffer.from(bytes).toString('base64');
  sb.salvarImportacaoGastos_(ss, { id: d.f1.id, nome: '09-2025.pdf', fonte: 'ourocard', modificado: '2025-10-01T10:00:00.000Z', meses: ['2025-09'] }, [lanc({ chaveDedup: 'k1' })], new sb.Date());
  sb.salvarImportacaoGastos_(ss, { id: d.f3.id, nome: '03-2025.pdf', fonte: 'nubank-conta', modificado: '2025-01-01T00:00:00.000Z', meses: ['2025-03'] }, [lanc({ chaveDedup: 'k2', origem: 'conta' })], new sb.Date());
  const r = plain(sb.listarArquivosGastos_(ss));
  assert.equal(r.configurado, true);
  assert.ok(props.get('GASTOS_PASTA_CARTAO'), 'guardou o ID da pasta');
  assert.deepEqual(r.arquivos.map((a) => [a.caminho, a.nome, a.banco, a.origem, a.importado, a.alterado]), [
    ['Cartão de Crédito/OuroCard/2025', '09-2025.pdf', 'OuroCard', 'cartao', true, false],
    ['Cartão de Crédito/OuroCard/2025', '10-2025.pdf', 'OuroCard', 'cartao', false, false],
    ['Extratos/Nubank', '03-2025.pdf', 'Nubank', 'conta', true, true],
  ]);
  assert.equal(r.novos, 2);
  assert.ok(!JSON.stringify(r).includes('dica 000'), 'o que está entre parênteses no nome da pasta não sai');
  const a = plain(sb.arquivoGastos_(d.f2.id));
  assert.equal(a.ok, true);
  assert.equal(a.base64, Buffer.from('%PDF').toString('base64'));
  assert.equal(plain(sb.arquivoGastos_(d.fora.id)).ok, false);
  assert.equal(plain(sb.lerGastos_(ss)).pastasConfiguradas, true);
});

test('Gastos.gs: sem a pasta no Drive avisa (não configurado) em vez de quebrar', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  const it = () => ({ hasNext: () => false, next: () => null });
  sb.DriveApp = { searchFolders: it };
  assert.deepEqual(plain(sb.listarArquivosGastos_(ss)), { ok: true, configurado: false, arquivos: [], novos: 0 });
  assert.equal(plain(sb.arquivoGastos_('x')).ok, false);
});

// 03/10/2026 (Tiago: "se eu for reimportar o que faltou, não reimportar o que
// já deu sucesso"): falha registrada não conta como importado e não apaga o
// que já tinha entrado; aviso (soma que não bate) fica "com problema".
test('Gastos.gs: falha fica registrada (sem lançamento, não conta como importado), aviso marcado, sucesso depois substitui', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  sb.SpreadsheetApp.flush = () => {};
  const d = driveFalso();
  sb.DriveApp = d.DriveApp;
  const agora = new sb.Date(2025, 10, 2);
  // f1 entra ok; f2 falha; f3 entra com a soma errada
  sb.salvarImportacaoGastos_(ss, { id: d.f1.id, nome: '09-2025.pdf', fonte: 'ourocard', modificado: '2025-10-01T10:00:00.000Z', meses: ['2025-09'], situacao: 'ok' }, [lanc({ chaveDedup: 'k1' })], agora);
  let r = plain(sb.salvarImportacaoGastos_(ss, { id: d.f2.id, nome: '10-2025.pdf', caminho: 'Cartão de Crédito/OuroCard/2025', modificado: '2025-11-01T10:00:00.000Z', situacao: 'erro', problema: 'Não achei a data de vencimento da fatura.' }, [lanc({ chaveDedup: 'zz' })], agora));
  assert.deepEqual([r.ok, r.gravados, r.falha], [true, 0, true]);
  sb.salvarImportacaoGastos_(ss, { id: d.f3.id, nome: '03-2025.pdf', fonte: 'nubank-conta', modificado: '2025-04-01T10:00:00.000Z', meses: ['2025-03'], conferencia: { ok: false, diferenca: 3, regra: 'x' }, situacao: 'aviso', problema: 'soma não bate' }, [lanc({ chaveDedup: 'k3', origem: 'conta' })], agora);
  let g = plain(sb.lerGastos_(ss));
  assert.equal(g.lancamentos.length, 2, 'a falha não grava lançamento');
  assert.deepEqual(g.arquivos.map((a) => [a.nome, a.situacao, a.lancamentos]).sort(), [['03-2025.pdf', 'aviso', 1], ['09-2025.pdf', 'ok', 1], ['10-2025.pdf', 'erro', 0]]);
  assert.match(g.arquivos.find((a) => a.situacao === 'erro').problema, /vencimento/);
  let l = plain(sb.listarArquivosGastos_(ss));
  const por = Object.fromEntries(l.arquivos.map((a) => [a.nome, a]));
  assert.deepEqual([por['09-2025.pdf'].importado, por['10-2025.pdf'].importado, por['10-2025.pdf'].situacao, por['03-2025.pdf'].situacao], [true, false, 'erro', 'aviso']);
  assert.deepEqual([l.novos, l.falhos], [0, 2], 'nada novo; 2 pra tentar de novo');
  // f1 muda no Drive e a releitura falha: o que já tinha entrado fica
  d.f1.mod = '2025-12-01T10:00:00.000Z';
  sb.salvarImportacaoGastos_(ss, { id: d.f1.id, nome: '09-2025.pdf', modificado: '2025-12-01T10:00:00.000Z', situacao: 'erro', problema: 'quebrou' }, [], agora);
  g = plain(sb.lerGastos_(ss));
  assert.equal(g.lancamentos.filter((x) => x[9] === d.f1.id).length, 1, 'lançamentos do arquivo bom ficam');
  l = plain(sb.listarArquivosGastos_(ss));
  const f1 = l.arquivos.find((a) => a.id === d.f1.id);
  assert.deepEqual([f1.importado, f1.alterado, f1.problema], [true, true, 'quebrou']);
  assert.equal(l.falhos, 3);
  // tentar de novo com sucesso: substitui (sem duplicar) e limpa o problema
  sb.salvarImportacaoGastos_(ss, { id: d.f2.id, nome: '10-2025.pdf', fonte: 'ourocard', modificado: '2025-11-01T10:00:00.000Z', meses: ['2025-10'], situacao: 'ok' }, [lanc({ chaveDedup: 'k2' }), lanc({ chaveDedup: 'k2b', data: '2025-09-21' })], agora);
  sb.salvarImportacaoGastos_(ss, { id: d.f2.id, nome: '10-2025.pdf', fonte: 'ourocard', modificado: '2025-11-01T10:00:00.000Z', meses: ['2025-10'], situacao: 'ok' }, [lanc({ chaveDedup: 'k2' }), lanc({ chaveDedup: 'k2b', data: '2025-09-21' })], agora);
  g = plain(sb.lerGastos_(ss));
  assert.equal(g.lancamentos.filter((x) => x[9] === d.f2.id).length, 2, 'reimportar não duplica');
  const a2 = g.arquivos.find((a) => a.id === d.f2.id);
  assert.deepEqual([a2.situacao, a2.problema], ['ok', '']);
});

test('Gastos.gs (A-25): fatura lida 2x (mesmo total e diferença em outro arquivo) entra como aviso; arquivos distintos seguem ok', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  sb.SpreadsheetApp.flush = () => {};
  const agora = new sb.Date(2025, 10, 2);
  const conf = { ok: false, diferenca: 12.34, regra: 'soma da fatura' };
  const arq = (id, extra) => ({ id, nome: `${id}.pdf`, fonte: 'ourocard', meses: ['2025-10'], total: 500, conferencia: conf, ...extra });
  sb.salvarImportacaoGastos_(ss, arq('A'), [lanc({ chaveDedup: 'k1' })], agora);
  sb.salvarImportacaoGastos_(ss, arq('B', { meses: ['2025-11'] }), [lanc({ chaveDedup: 'k2', mes: '2025-11' })], agora);
  sb.salvarImportacaoGastos_(ss, { id: 'C', nome: 'C.pdf', fonte: 'ourocard', meses: ['2025-12'], total: 700, conferencia: { ok: true, diferenca: 0 } }, [lanc({ chaveDedup: 'k3', mes: '2025-12' })], agora);
  const g = plain(sb.lerGastos_(ss));
  const por = Object.fromEntries(g.arquivos.map((a) => [a.id, a]));
  assert.equal(por.A.situacao, 'aviso');
  assert.ok(!/repetir/.test(por.A.problema), 'o primeiro não é o repetido');
  assert.equal(por.B.situacao, 'aviso');
  assert.match(por.B.problema, /parece repetir "A\.pdf"/);
  assert.equal(por.C.situacao, 'ok');
});

test('Gastos.gs (A-25): preencherSituacaoArquivosGastosDireto deduz a Situação vazia dos arquivos antigos pela Conferência', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  sb.SpreadsheetApp.flush = () => {};
  const agora = new sb.Date(2025, 10, 2);
  sb.salvarImportacaoGastos_(ss, { id: 'A', nome: 'A.pdf', fonte: 'ourocard', meses: ['2025-10'], total: 100, conferencia: { ok: false, diferenca: 5 } }, [lanc({ chaveDedup: 'k1' })], agora);
  sb.salvarImportacaoGastos_(ss, { id: 'B', nome: 'B.pdf', fonte: 'ourocard', meses: ['2025-11'], total: 200, conferencia: { ok: true, diferenca: 0 } }, [lanc({ chaveDedup: 'k2', mes: '2025-11' })], agora);
  // simula o legado: apaga a coluna Situação/Problema (L, M) da aba de arquivos
  const aba = ss.getSheetByName('aux_gastos-arquivos');
  aba.getRange(2, 12, 2, 2).setValues([['', ''], ['', '']]);
  const r = plain(sb.preencherSituacaoArquivosGastosDireto());
  assert.equal(r.preenchidos, 2);
  const por = Object.fromEntries(plain(sb.lerGastos_(ss)).arquivos.map((a) => [a.id, a.situacao]));
  assert.deepEqual(por, { A: 'aviso', B: 'ok' });
});
