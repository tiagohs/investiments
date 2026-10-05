// tests/harness/holerites-drive.test.js
//
// 05/10/2026: apps-script/Salario.gs - holerites direto do Drive. Tiago:
// "holerites ficarão em Drive Documentos/Trabalho/NOME_EMPRESA/Holerite/ANO/
// MES-ANO.pdf (já tem 2 meses de 2026 da empresa atual lá)", várias empresas.
// Tudo inventado (empresas, nomes, valores); Drive e planilha são falsos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';

function driveHolerites() {
  let n = 0;
  const pasta = (nome, pai = null) => { const p = { id: `p${++n}`, nome, pai, filhos: [], arquivos: [] }; if (pai) pai.filhos.push(p); return p; };
  const arqs = [];
  const arq = (nome, pai, { tamanho = 1000, mime = 'application/pdf', mod = '2026-03-01T10:00:00Z' } = {}) => { const a = { id: `f${++n}`, nome, pai, tamanho, mime, mod }; pai.arquivos.push(a); arqs.push(a); return a; };
  const docs = pasta('Documentos');
  const trabalho = pasta('Trabalho', docs);
  // empresa atual: pasta "Holerite" com subpasta por ano
  const empA = pasta('EMPRESA ATUAL LTDA', trabalho);
  const hA = pasta('Holerite', empA);
  const a26 = pasta('2026', hA);
  const jan = arq('01-2026.pdf', a26); const fev = arq('02-2026.pdf', a26);
  arq('Contrato.docx', empA, { mime: 'application/msword' });
  // empresa antiga: "HOLERITES" em maiúsculas, nomes por extenso/underline, um PDF direto na pasta, sem ano
  const empB = pasta('Empresa Antiga SA', trabalho);
  const hB = pasta('HOLERITES', empB);
  const a24 = pasta('2024', hB);
  const dez = arq('Dezembro-2024.pdf', a24); const mar = arq('03_2024.pdf', a24); const solto = arq('janeiro 2025.pdf', hB);
  const semData = arq('recibo extra.pdf', a24);
  arq('anotacoes.txt', a24, { mime: 'text/plain' });
  // outra pasta qualquer fora de Trabalho
  const outra = pasta('Outros', docs); const hOutra = pasta('Holerite', outra);
  const fora = arq('01-2026.pdf', hOutra);
  const todas = [docs, trabalho, empA, hA, a26, empB, hB, a24, outra, hOutra];
  const it = (xs) => { let i = 0; return { hasNext: () => i < xs.length, next: () => xs[i++] }; };
  const fPasta = (p) => ({ getId: () => p.id, getName: () => p.nome, getFolders: () => it(p.filhos.map(fPasta)), getFiles: () => it(p.arquivos.map(fArq)), getParents: () => it(p.pai ? [fPasta(p.pai)] : []) });
  const fArq = (a) => ({ getId: () => a.id, getName: () => a.nome, getMimeType: () => a.mime, getSize: () => a.tamanho, getLastUpdated: () => new Date(a.mod), getBlob: () => ({ getBytes: () => Buffer.from(`%PDF-${a.id}`) }) });
  const DriveApp = {
    getFolderById: (id) => fPasta(todas.find((p) => p.id === id)),
    getFileById: (id) => fArq(arqs.find((x) => x.id === id)),
    searchFolders: () => it(todas.filter((p) => /trabalho/i.test(p.nome)).map(fPasta)),
  };
  return { DriveApp, trabalho, jan, fev, dez, mar, solto, semData, fora };
}

function montar() {
  const ss = planilhaFalsa({ 'Distribuição e Metas': [] });
  ss.aba('Distribuição e Metas').getRange('N11:S11').setValues([[10000, '', '', 0.2, '', 2000]]);
  const { sb, props } = sandboxGas(ss);
  const d = driveHolerites();
  sb.DriveApp = d.DriveApp;
  sb.SpreadsheetApp.flush = () => {};
  sb.Utilities.base64Encode = (bytes) => Buffer.from(bytes).toString('base64');
  return { ss, sb, props, d };
}

const pagamento = (mes, liquido = 7000, extra = {}) => ({ mes, tipo: 'Mensal', status: 'Recebido', salarioBase: 9000, outrosVencimentos: 0, inss: 800, irrf: 900, outrosDescontos: 300, liquido, itens: [], ...extra });

test('Salario.gs (holerites no Drive): acha Documentos/Trabalho sozinho, lista os PDFs de "Holerite" de cada empresa (maiúsculas, plural, ano na pasta ou no nome) e o mês pelo nome', () => {
  const { sb, props, ss, d } = montar();
  const r = plain(sb.listarArquivosHolerites_(ss));
  assert.equal(r.configurado, true);
  assert.equal(props.get('HOLERITES_PASTA_TRABALHO'), d.trabalho.id, 'guarda o id da pasta achada');
  assert.deepEqual(r.arquivos.map((a) => [a.empresa, a.nome, a.mes]), [
    ['Empresa Antiga SA', '03_2024.pdf', '2024-03'],
    ['Empresa Antiga SA', 'Dezembro-2024.pdf', '2024-12'],
    ['Empresa Antiga SA', 'recibo extra.pdf', ''],
    ['Empresa Antiga SA', 'janeiro 2025.pdf', '2025-01'],
    ['EMPRESA ATUAL LTDA', '01-2026.pdf', '2026-01'],
    ['EMPRESA ATUAL LTDA', '02-2026.pdf', '2026-02'],
  ]);
  assert.equal(r.novos, 6);
  assert.ok(!r.arquivos.some((a) => a.id === d.fora.id), 'a pasta Holerite fora de Trabalho não entra');
  assert.ok(r.arquivos.every((a) => a.novo && !a.importado));
  // só o que é PDF; "Contrato.docx" e "anotacoes.txt" ficam de fora
  assert.ok(!JSON.stringify(r).includes('Contrato') && !JSON.stringify(r).includes('anotacoes'));
});

test('Salario.gs (holerites): mês pelo nome - MM-AAAA, AAAA-MM, nome do mês por extenso/abreviado, só o mês com o ano da pasta', () => {
  const { sb } = montar();
  const m = (n, a) => sb.mesDoNomeHolerite_(n, a);
  assert.equal(m('01-2026.pdf'), '2026-01');
  assert.equal(m('1_2026.pdf'), '2026-01');
  assert.equal(m('12.2025.PDF'), '2025-12');
  assert.equal(m('2026-03.pdf'), '2026-03');
  assert.equal(m('JANEIRO-2026.pdf'), '2026-01');
  assert.equal(m('Março 2026.pdf'), '2026-03');
  assert.equal(m('holerite fev-2026.pdf'), '2026-02');
  assert.equal(m('2026 setembro.pdf'), '2026-09');
  assert.equal(m('Abril.pdf', '2026'), '2026-04', 'só o mês: o ano vem da pasta');
  assert.equal(m('Abril.pdf', ''), '');
  assert.equal(m('13-2026.pdf'), '', '13 não é mês (13º salário: quem manda é o conteúdo do PDF)');
  assert.equal(m('contrato.pdf'), '');
});

test('Salario.gs (holerites): importa 1 clique - grava o pagamento, registra id + modifiedTime; só os novos/alterados voltam; falha fica registrada e não insiste', () => {
  const { sb, ss, d } = montar();
  const agora = new sb.Date('2026-10-05T12:00:00Z');
  // importa janeiro (vira a base das contas) e fevereiro
  let r = plain(sb.salvarHoleriteDrive_(ss, pagamento('2026-01', 7000), { id: d.jan.id, nome: '01-2026.pdf', empresa: 'EMPRESA ATUAL LTDA', modificado: '2026-03-01T10:00:00.000Z' }, { usarComoBase: false }, agora));
  assert.equal(r.ok, true);
  assert.equal(r.holerite.situacao, 'ok');
  r = plain(sb.salvarHoleriteDrive_(ss, pagamento('2026-02', 7200), { id: d.fev.id, nome: '02-2026.pdf', empresa: 'EMPRESA ATUAL LTDA', modificado: '2026-03-01T10:00:00.000Z', situacao: 'aviso', problema: 'Total de vencimentos − descontos não bate' }, { usarComoBase: true }, agora));
  assert.equal(r.ok, true);
  assert.equal(r.holerite.situacao, 'aviso');
  assert.equal(ss.aba('Distribuição e Metas').getRange('N11').getValue(), 7200, 'o mais novo virou a base das contas');
  assert.deepEqual(plain(r.pagamentos.map((p) => [p.mes, p.liquido])).sort(), [['2026-01', 7000], ['2026-02', 7200]]);
  // um que o leitor não entendeu: só registra a falha
  r = plain(sb.salvarHoleriteDrive_(ss, null, { id: d.dez.id, nome: 'Dezembro-2024.pdf', empresa: 'Empresa Antiga SA', modificado: '2026-03-01T10:00:00.000Z', situacao: 'erro', problema: 'não achei o valor líquido' }, {}, agora));
  assert.deepEqual([r.ok, r.falha], [true, true]);
  assert.equal(plain(sb.lerArquivosImportadosHolerites_(ss)).length, 3);
  // a lista marca: importados não são novos; o de erro também não (mesmo modifiedTime); os outros 3 seguem novos
  let l = plain(sb.listarArquivosHolerites_(ss));
  const por = (nome) => l.arquivos.find((a) => a.nome === nome);
  assert.equal(por('01-2026.pdf').novo, false);
  assert.equal(por('01-2026.pdf').importado, true);
  assert.equal(por('02-2026.pdf').situacao, 'aviso');
  assert.equal(por('02-2026.pdf').novo, false);
  assert.equal(por('Dezembro-2024.pdf').novo, false);
  assert.equal(por('Dezembro-2024.pdf').importado, false);
  assert.equal(por('Dezembro-2024.pdf').situacao, 'erro');
  assert.equal(l.novos, 3);
  assert.equal(l.falhos, 2, 'o com aviso e o com erro aparecem como "com problema"');
  // o arquivo mudou no Drive (modifiedTime novo) -> volta a ser novo; o de erro também tenta de novo
  d.jan.mod = '2026-04-10T09:00:00Z'; d.dez.mod = '2026-04-10T09:00:00Z';
  l = plain(sb.listarArquivosHolerites_(ss));
  assert.equal(por2(l, '01-2026.pdf').novo, true);
  assert.equal(por2(l, '01-2026.pdf').alterado, true);
  assert.equal(por2(l, 'Dezembro-2024.pdf').novo, true);
  // reimportar o mesmo mês/tipo substitui a linha (não duplica) e o registro do arquivo também
  sb.salvarHoleriteDrive_(ss, pagamento('2026-01', 7050), { id: d.jan.id, nome: '01-2026.pdf', empresa: 'EMPRESA ATUAL LTDA', modificado: '2026-04-10T09:00:00.000Z' }, {}, agora);
  const aba = ss.aba('Salário');
  const meses = []; for (let i = 2; i <= aba.getLastRow(); i += 1) meses.push([String(aba.valor(`A${i}`)).replace(/^'/, ''), aba.valor(`L${i}`)]);
  assert.deepEqual(meses.sort(), [['2026-01', 7050], ['2026-02', 7200]]);
  assert.equal(plain(sb.lerArquivosImportadosHolerites_(ss)).filter((x) => x.id === d.jan.id).length, 1);
  assert.equal(por2(plain(sb.listarArquivosHolerites_(ss)), '01-2026.pdf').novo, false);
});
const por2 = (l, nome) => l.arquivos.find((a) => a.nome === nome);

test('Salario.gs (holerites): o PDF só sai se estiver na lista; sem pasta Trabalho: configurado false; arquivo sem id é recusado', () => {
  const { sb, ss, d, props } = montar();
  const ok = plain(sb.arquivoHolerite_(ss, d.fev.id));
  assert.equal(ok.ok, true);
  assert.equal(Buffer.from(ok.base64, 'base64').toString(), `%PDF-${d.fev.id}`);
  assert.deepEqual([ok.empresa, ok.mes], ['EMPRESA ATUAL LTDA', '2026-02']);
  assert.equal(plain(sb.arquivoHolerite_(ss, d.fora.id)).ok, false, 'fora das pastas de holerite');
  assert.equal(plain(sb.arquivoHolerite_(ss, '')).ok, false);
  assert.equal(plain(sb.salvarHoleriteDrive_(ss, pagamento('2026-05'), {}, {}, new sb.Date())).ok, false);
  // grande demais
  d.fev.tamanho = 9 * 1024 * 1024;
  assert.match(plain(sb.arquivoHolerite_(ss, d.fev.id)).erro, /grande demais/);
  // sem pasta Trabalho no Drive
  props.delete('HOLERITES_PASTA_TRABALHO');
  sb.DriveApp.searchFolders = () => ({ hasNext: () => false, next: () => null });
  const vazio = plain(sb.listarArquivosHolerites_(ss));
  assert.deepEqual([vazio.configurado, vazio.arquivos.length, vazio.novos], [false, 0, 0]);
});
