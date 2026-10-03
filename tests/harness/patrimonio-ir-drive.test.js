// tests/harness/patrimonio-ir-drive.test.js
//
// 03/10/2026: apps-script/Patrimonio.gs - declarações do IR na pasta do
// Drive. Tiago: o painel dizia "IR atrasado - falta a de 2026" com o
// arquivo na pasta IR/2026, chamado "Cópia da Delcaração.pdf" (erro de
// digitação), ao lado de "Comprovante.pdf", do .DEC/.REC da Receita e de
// uma subpasta "Documentos". Tudo inventado (o CPF do nome é falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';

function driveIr() {
  let n = 0;
  const pasta = (nome, pai = null) => { const p = { id: `p${++n}`, nome, pai, filhos: [], arquivos: [] }; if (pai) pai.filhos.push(p); return p; };
  const ir = pasta('IR');
  const a26 = pasta('2026', ir); const a25 = pasta('2025', ir); const a24 = pasta('2024', ir);
  const docs26 = pasta('Documentos', a26);
  const arq = (nome, pai, tamanho = 1000, mime = 'application/pdf') => { const a = { id: `f${++n}`, nome, pai, tamanho, mime }; pai.arquivos.push(a); return a; };
  const c26 = arq('Cópia da Delcaração.pdf', a26, 90000);
  arq('Comprovante.pdf', a26, 20000);
  arq('11122233344-IRPF-A-2026-2025-ORIGI.DEC', a26, 5000, 'application/octet-stream');
  arq('11122233344-IRPF-A-2026-2025-ORIGI.REC', a26, 500, 'application/octet-stream');
  const inf = arq('Informe de rendimentos banco.pdf', docs26);
  const dec26 = arq('declaracao antiga escaneada.pdf', docs26, 50000);
  const c25 = arq('Cópia da Declaração.pdf', a25, 80000);
  const c24 = arq('11122233344-IRPF-2024.pdf', a24, 70000);
  const todas = [ir, a26, a25, a24, docs26];
  const it = (xs) => { let i = 0; return { hasNext: () => i < xs.length, next: () => xs[i++] }; };
  const fPasta = (p) => ({ getId: () => p.id, getName: () => p.nome, getFolders: () => it(p.filhos.map(fPasta)), getFiles: () => it(p.arquivos.map(fArq)), getParents: () => it(p.pai ? [fPasta(p.pai)] : []) });
  const fArq = (a) => ({ getId: () => a.id, getName: () => a.nome, getMimeType: () => a.mime, getSize: () => a.tamanho, getLastUpdated: () => new Date('2026-05-01T10:00:00Z'), getBlob: () => ({ getBytes: () => [37, 80, 68, 70] }) });
  const DriveApp = {
    getFolderById: (id) => fPasta(todas.find((p) => p.id === id)),
    getFileById: (id) => fArq(todas.flatMap((p) => p.arquivos).find((x) => x.id === id)),
    getFoldersByName: (nome) => it(todas.filter((p) => p.nome === nome).map(fPasta)),
  };
  return { DriveApp, ir, c26, c25, c24, inf, dec26 };
}

test('Patrimonio.gs (IR no Drive): acha a "Cópia da Delcaração" (erro de digitação), um PDF por ano, comprovante/recibo/.DEC fora, sem CPF no nome', () => {
  const ss = planilhaFalsa({});
  const { sb, props } = sandboxGas(ss);
  const d = driveIr();
  sb.DriveApp = d.DriveApp;
  sb.Utilities.base64Encode = (bytes) => Buffer.from(bytes).toString('base64');
  props.set('PATRIMONIO_PASTA_IR', d.ir.id);
  const r = plain(sb.listarArquivosIrPatrimonio_());
  assert.equal(r.configurado, true);
  assert.deepEqual(r.arquivos.map((a) => [a.pasta, a.nome]), [['2024', '•••-IRPF-2024.pdf'], ['2025', 'Cópia da Declaração.pdf'], ['2026', 'Cópia da Delcaração.pdf']]);
  assert.deepEqual(r.alternativas.map((a) => [a.pasta, a.id]), [['2026', d.dec26.id]], 'o PDF da subpasta é alternativa do ano 2026 (o informe e o comprovante não)');
  assert.ok(!JSON.stringify(r).includes('11122233344'), 'o CPF do nome do arquivo não sai');
  assert.ok(!JSON.stringify(r).includes('Comprovante'));
  // o arquivo das alternativas também pode ser baixado; o de fora da lista, não
  assert.equal(plain(sb.arquivoIrPatrimonio_(d.dec26.id)).ok, true);
  assert.equal(plain(sb.arquivoIrPatrimonio_(d.c26.id)).nome, 'Cópia da Delcaração.pdf');
  assert.equal(plain(sb.arquivoIrPatrimonio_(d.inf.id)).ok, false);
  // nomes
  assert.ok(sb.notaNomeIr_('Copia da Declaracao.pdf') > 0);
  assert.ok(sb.notaNomeIr_('declaraçao IRPF 2023.pdf') > 0);
  assert.ok(sb.notaNomeIr_('Delcaracão.pdf') > 0);
  assert.ok(sb.notaNomeIr_('Declaracoa.pdf') > 0, 'letras trocadas');
  assert.equal(sb.notaNomeIr_('Comprovante.pdf'), 0);
  assert.equal(sb.notaNomeIr_('Recibo de entrega.pdf'), 0);
  assert.equal(sb.notaNomeIr_('foto.pdf'), 0);
});
