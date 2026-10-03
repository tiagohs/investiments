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
