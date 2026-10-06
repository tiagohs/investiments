// 07/10/2026 (Tiago, print da Renda Emergencial "-R$ 61.019,98" e "Ontem era R$ 122.205"): depois da
// chave única de título RF (A-71), a rotina diária (backfill INCREMENTAL) lia o histórico com a chave antiga
// ("Produto|Instituição" cru), não reconhecia nenhuma posição e regravava o histórico inteiro no fim da
// aux_historico-renda-fixa -> todo dia passado em dobro. Aqui: rodar o incremental sobre um histórico em dia
// não pode repetir nenhum (dia, título, instituição), e rodar 2x seguidas não grava nada na 2ª.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarSandboxPrevia } from './previa.mjs';

const temFixtures = fs.existsSync(new URL('./fixtures.json', import.meta.url));
const ehData = (d) => Object.prototype.toString.call(d) === '[object Date]'; // Date do sandbox é de outro realm
const dia = (d) => (ehData(d) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

test('Renda Fixa: backfill incremental não regrava dias que já estão no histórico (nada em dobro)', { skip: !temFixtures && 'sem fixtures.json' }, () => {
  const sb = montarSandboxPrevia();
  sb.buscarFatoresDiariosBcb_ = () => ({});
  sb.buscarFatoresDiariosIpca_ = () => ({});
  const aba = sb.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('aux_historico-renda-fixa');
  const ler = () => (aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, 6).getValues() : []);
  const chaves = (linhas) => linhas.filter((l) => ehData(l[0])).map((l) => `${dia(l[0])}|${l[1]}|${l[2]}`);

  // parte de um histórico SEM repetição (a planilha real pode ter o bloco duplicado do bug; fica só a 1ª ocorrência)
  const vistos = new Set();
  const limpo = ler().filter((l) => { const k = chaves([l])[0]; if (!k) return true; if (vistos.has(k)) return false; vistos.add(k); return true; });
  aba.getRange(2, 1, Math.max(aba.getLastRow() - 1, 1), 6).clearContent();
  if (limpo.length) aba.getRange(2, 1, limpo.length, 6).setValues(limpo);
  const antes = limpo.length;

  const r1 = sb.executarBackfillRendaFixaIncremental_();
  const depois1 = chaves(ler());
  assert.equal(new Set(depois1).size, depois1.length, 'nenhum (dia, título, instituição) repetido depois do incremental');
  const posicoes = r1.posicoes || 1;
  assert.ok(r1.linhasGravadas <= posicoes * 10, `grava só os dias que faltam (gravou ${r1.linhasGravadas} para ${posicoes} posições; antes eram ${antes} linhas)`);

  const r2 = sb.executarBackfillRendaFixaIncremental_();
  assert.equal(r2.linhasGravadas || 0, 0, '2ª execução seguida não grava nada');
});
