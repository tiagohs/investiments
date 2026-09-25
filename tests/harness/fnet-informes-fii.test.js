// tests/harness/fnet-informes-fii.test.js
//
// 25/09/2026: informes/atualizações do fundo (FII) via FNet -
// FnetInformesFii.gs (ponto 2 do feedback da tela do ativo). Só a parte
// SEM planilha real (fixtures.json) - listarInformesFnet_ (com o FNet
// FALSO, sem rede) e o roundtrip grava/lê da aba aux_informes-fii com uma
// planilha falsa mínima (mesmo padrão de tests/harness/sessao.test.js).
// Não testa atualizarInformesFiiFnet_/tickersFiiDaCarteira_/
// garantirCnpjsFii_ ponta-a-ponta (isso precisa da planilha real, igual
// à parte 2 de fnet-proventos.test.js - roda só na máquina do Tiago).
//
// IMPORTANTE: este arquivo novo (FnetInformesFii.gs) ainda não foi
// testado ao vivo contra o FNet de verdade - ver a nota grande no topo
// dele. Depois de subir e rodar rodarInformesFnetDireto() uma vez, confira
// a aba aux_informes-fii; se os títulos vierem estranhos, os campos lidos
// em listarInformesFnet_ (categoriaDocumento/tipoDocumento/assuntos)
// provavelmente precisam de ajuste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const plain = (x) => JSON.parse(JSON.stringify(x));

/** FnetInformesFii.gs precisa de tickersFiiDaCarteira_/garantirCnpjsFii_/
 * comTentativasFnet_/FNET_BASE_URL_/chaveDeCelulaProvento_/
 * dataDeChaveProvento_ (FnetProventos.gs) e chaveDiaISOInicio_
 * (HistoricoInicio.gs) - mesmo projeto Apps Script, escopo global. */
function sandbox() {
  // chaveDiaISOInicio_ (HistoricoInicio.gs) usa Session.getScriptTimeZone() -
  // mesmo fuso do projeto Apps Script (America/Sao_Paulo).
  const sb = { console: { ...console, log() {} }, Session: { getScriptTimeZone: () => 'America/Sao_Paulo' } };
  vm.createContext(sb);
  // vm.createContext não expõe os globals nativos da nova realm (Date...)
  // como propriedades PRÓPRIAS de `sb` - força a exposição (mesma técnica
  // de gas-vm-harness.mjs!montarSandboxComFixtures_), senão "new sb.Date()"
  // feito fora do vm não bate "instanceof Date" dentro dele.
  new vm.Script('this.Date = Date;').runInContext(sb);
  ['HistoricoInicio.gs', 'FnetProventos.gs', 'FnetInformesFii.gs'].forEach((nome) => {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', nome), 'utf8'), { filename: nome }).runInContext(sb);
  });
  return sb;
}

// ---------------------------------------------------------------------------
// listarInformesFnet_: filtra "Aviso aos Cotistas" (proventos), respeita o
// limite e lê categoria/tipo/assunto/data de cada documento.
// ---------------------------------------------------------------------------

test('FNet (informes de fundo): descarta "Aviso aos Cotistas" (já mostrado em Proventos), respeita o limite e lê os campos do documento', () => {
  const sb = sandbox();
  const dataFake = [
    { id: 501, tipoDocumento: 'Aviso aos Cotistas - Estruturado', dataEntrega: '10/09/2026' },
    { id: 502, categoriaDocumento: 'Fato Relevante', assuntos: 'Aquisição de imóvel', dataEntrega: '08/09/2026' },
    { id: 503, categoriaDocumento: 'Comunicado ao Mercado', assuntos: 'Distrato de contrato', dataEntrega: '01/09/2026' },
    { id: 504, categoriaDocumento: 'Relatório Gerencial', dataReferencia: '2026-08-01', dataEntrega: '2026-08-15' },
  ];
  sb.UrlFetchApp = {
    fetch(url) {
      assert.match(url, /cnpjFundo=11222333000144/);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: dataFake }) };
    },
  };
  const itens = plain(sb.listarInformesFnet_('11222333000144', 2));
  assert.equal(itens.length, 2, 'pediu 2, "Aviso aos Cotistas" não conta');
  assert.deepEqual(itens[0], { id: '502', tipo: 'Fato Relevante', assunto: 'Aquisição de imóvel', data: '2026-09-08' });
  assert.equal(itens[1].tipo, 'Comunicado ao Mercado');

  const todos = plain(sb.listarInformesFnet_('11222333000144', 4));
  assert.equal(todos.length, 3, 'os 4 menos o "Aviso aos Cotistas"');
  assert.equal(todos[2].data, '2026-08-15', 'sem dataEntrega usável: cai pra dataReferencia');

  // HTTP != 200: erro, não lista vazia (comTentativasFnet_ decide se tenta de novo)
  sb.UrlFetchApp.fetch = () => ({ getResponseCode: () => 500, getContentText: () => '' });
  assert.throws(() => sb.listarInformesFnet_('11222333000144', 2), /FNet HTTP 500/);
});

// ---------------------------------------------------------------------------
// gravarInformesFii_ + lerInformesFundoFii_: roundtrip pela aba
// aux_informes-fii (planilha falsa mínima, sem fixtures.json)
// ---------------------------------------------------------------------------

function planilhaFalsa() {
  const abas = {};
  function criarAba(nome) {
    let linhas = [];
    const aba = {
      getLastRow: () => linhas.length,
      clearContents: () => { linhas = []; },
      getRange(r1, c1, nLinhas, nCols) {
        return {
          setValues(vals) {
            vals.forEach((linha, i) => { linhas[r1 - 1 + i] = linha.slice(0, nCols || linha.length); });
          },
          getValues: () => Array.from({ length: nLinhas }, (_, i) => (linhas[r1 - 1 + i] || []).slice(0, nCols)),
        };
      },
    };
    abas[nome] = aba;
    return aba;
  }
  return { getSheetByName: (nome) => abas[nome] || null, insertSheet: criarAba };
}

test('aux_informes-fii: grava e lê de volta (data vira Date na célula e volta pra chave "aaaa-mm-dd"; ticker sem diferenciar maiúsculo/minúsculo; link monta com o id do documento)', () => {
  const sb = sandbox();
  const ss = planilhaFalsa();
  sb.gravarInformesFii_(ss, [
    { ticker: 'ABCD11', tipo: 'Fato Relevante', assunto: 'Aquisição', data: '2026-09-08', documento: '502', atualizadoEm: new sb.Date('2026-09-25T12:00:00Z') },
    { ticker: 'ABCD11', tipo: 'Comunicado ao Mercado', assunto: 'Distrato', data: '2026-09-01', documento: '503', atualizadoEm: new sb.Date('2026-09-25T12:00:00Z') },
    { ticker: 'WXYZ11', tipo: 'Relatório Gerencial', assunto: '', data: '2026-08-15', documento: '504', atualizadoEm: new sb.Date('2026-09-25T12:00:00Z') },
  ]);

  const doAbcd = plain(sb.lerInformesFundoFii_(ss, 'abcd11')); // minúsculo: tem que achar igual
  assert.equal(doAbcd.ok, true);
  assert.equal(doAbcd.itens.length, 2);
  assert.equal(doAbcd.itens[0].data, '2026-09-08', 'mais recente primeiro (gravarInformesFii_ ordena desc)');
  assert.equal(doAbcd.itens[0].titulo, 'Aquisição', 'assunto como título quando existe');
  assert.equal(doAbcd.itens[0].tipo, 'Fato Relevante');
  assert.match(doAbcd.itens[0].link, /downloadDocumento\?id=502$/);

  const doWxyz = plain(sb.lerInformesFundoFii_(ss, 'WXYZ11'));
  assert.equal(doWxyz.itens.length, 1);
  assert.equal(doWxyz.itens[0].titulo, 'Relatório Gerencial', 'sem assunto: cai pro tipo');

  const doNenhum = plain(sb.lerInformesFundoFii_(ss, 'NADA11'));
  assert.deepEqual(doNenhum, { ok: true, itens: [] });

  // aba ainda não existe (nunca rodou a atualização): não quebra
  const semAba = plain(sb.lerInformesFundoFii_(planilhaFalsa(), 'ABCD11'));
  assert.deepEqual(semAba, { ok: true, itens: [] });
});
