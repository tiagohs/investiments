// tests/harness/o4-chave-rf.test.js
//
// 06/10/2026 (A-71): identidade ÚNICA de título de Renda Fixa (RendaFixaIR.gs!chaveTituloRf_ / casaTituloRf_ /
// idsEstaveisCarteiraRf_). Parte 1: nomes inventados (pontuação, tab/quebra de linha, ISIN que sobrevive a
// renomear). Parte 2 (com fixtures.json): as REGRAS ANTIGAS (copiadas aqui como referência) e a nova casam
// exatamente as MESMAS linhas de Transações RF / Lotes / Resumo / Histórico com cada posição da Carteira RF -
// nenhum casamento que funcionava mudou. Nenhum valor real neste arquivo (só comparações entre regras).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS_DIR = path.resolve(__dirname, '..', '..', 'apps-script');
const FIXTURES = path.join(__dirname, 'fixtures.json');
const TEM_FIXTURES = fs.existsSync(FIXTURES);

function sandbox(fixtures = {}) {
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(fixtures, sb);
  for (const f of fs.readdirSync(GAS_DIR).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), { filename: f }).runInContext(sb);
  }
  return sb;
}

test('chaveTituloRf_: tab/quebra de linha, caixa, espaços e pontuação da instituição não mudam a chave', () => {
  const sb = sandbox();
  const base = sb.chaveTituloRf_('Tesouro Selic 2029', 'XP INVESTIMENTOS CCTVM S/A.');
  assert.equal(sb.chaveTituloRf_('\t\nTesouro Selic 2029', 'XP INVESTIMENTOS CCTVM S/A'), base);
  assert.equal(sb.chaveTituloRf_('tesouro  selic\n2029 ', ' xp investimentos cctvm s.a.'), base);
  assert.equal(sb.chaveTituloRf_('Tesouro Selic 2029', 'RICO INVESTIMENTOS - GRUPO XP'), base);
  assert.notEqual(sb.chaveTituloRf_('Tesouro Selic 2030', 'XP'), base);
  assert.notEqual(sb.chaveTituloRf_('Tesouro Selic 2029', 'NU INVESTIMENTOS S.A. - CTVM'), base);
  // "NU" no começo vale mesmo com tab/quebra antes
  assert.equal(sb.chaveTituloRf_('X', '\t\nNU INVESTIMENTOS S.A.'), sb.chaveTituloRf_('X', 'NU INVEST CORRETORA'));
  // outras corretoras: pontuação ignorada
  assert.equal(sb.chaveTituloRf_('X', 'Banco Foo S/A'), sb.chaveTituloRf_('X', 'BANCO FOO S.A.'));
});

test('id estável: o código (ISIN) + instituição identifica a posição mesmo renomeando; a 2ª marca herda o código', () => {
  const sb = sandbox();
  const a = sb.chaveTituloRf_('Nome antigo', 'XP INVESTIMENTOS S/A', 'brxxxx000001');
  const b = sb.chaveTituloRf_('Nome novo', 'XP INVESTIMENTOS S.A.', 'brxxxx000001');
  assert.equal(a, b);
  assert.notEqual(a, sb.chaveTituloRf_('Nome antigo', 'NU INVESTIMENTOS S.A.', 'brxxxx000001'), 'o mesmo ISIN em outra instituição é outra posição');
  const linhas = [
    ['BRX1', 'Renda Emergencial', '\t\nTitulo A 2030', 'T', 'SELIC', 'XP S/A', 1],
    ['', 'Renda Fixa', 'Titulo A 2030', 'T', 'SELIC', 'XP S.A.', 1], // mesma posição, sem código
    ['BRX1', 'Renda Fixa', 'Titulo A 2030', 'T', 'SELIC', 'NU INVEST', 1], // mesmo ISIN, outra instituição
    ['', 'Renda Fixa', 'Titulo B 2031', 'T', 'SELIC', 'XP S/A', 1], // sem código: chave por nome
  ];
  const ids = Array.from(sb.idsEstaveisCarteiraRf_(linhas));
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[0], ids[2]);
  assert.equal(ids[3], sb.chaveTituloRf_('Titulo B 2031', 'XP'));
  assert.equal(new Set(ids).size, 3);
});

test('casaTituloRf_: Tesouro pelo nome; LCI/LCA/CDB pelo tipo + instituição (regra única de Ativo e Metas)', () => {
  const sb = sandbox();
  const xp = sb.normalizarInstituicaoRF_('XP INVESTIMENTOS CCTVM S/A.');
  assert.equal(sb.casaTituloRf_('\t\nTesouro Selic 2028', xp, 'tesouro selic 2028', 'XP'), true);
  assert.equal(sb.casaTituloRf_('Tesouro Selic 2028', xp, 'Tesouro Selic 2029', 'XP'), false);
  const inter = sb.normalizarInstituicaoRF_('BANCO INTER S/A');
  assert.equal(sb.casaTituloRf_('LCI - BANCO INTER S/A', inter, 'LCI - 00X00000000', 'INTER'), true);
  assert.equal(sb.casaTituloRf_('LCI - BANCO INTER S/A', inter, 'LCA - 00X00000000', 'INTER'), false);
  assert.equal(typeof sb.casaTituloRfMetas_, 'undefined', 'a cópia de Metas.gs foi removida');
  assert.equal(typeof sb.normalizarChaveRfIr_, 'undefined');
  assert.equal(typeof sb.normalizarChaveRfSubpagina_, 'undefined');
});

// ---- Parte 2: regras ANTIGAS (referência) x regra nova nos dados reais ----
const instAntiga = (instituicao) => {
  const s = String(instituicao || '').toUpperCase();
  if (s.indexOf('XP') >= 0) return 'XP';
  if (s.indexOf('RICO') >= 0) return 'XP';
  if (s.indexOf('NU') === 0 || s.indexOf('NUBANK') >= 0) return 'NU';
  if (s.indexOf('INTER') >= 0) return 'INTER';
  return s.replace(/[^A-Z0-9]/g, '').substring(0, 15);
};
const casaAntiga = (nomeCarteira, instNorm, produto, instituicao) => {
  if (instAntiga(instituicao) !== instNorm) return false;
  const a = String(nomeCarteira || '').trim().toUpperCase(), b = String(produto || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const tipo = a.split(/[\s-]/)[0];
  return ['LCI', 'LCA', 'CDB'].indexOf(tipo) >= 0 && b.split(/[\s-]/)[0] === tipo;
};
const chaveCruaAntiga = (t, i) => String(t || '').trim().toUpperCase() + '|' + String(i || '').trim().toUpperCase();

test('fixtures: toda posição da Carteira RF casa EXATAMENTE as mesmas linhas de Transações, Lotes, Resumo e Histórico que casava antes', { skip: !TEM_FIXTURES }, () => {
  const fx = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const sb = sandbox(fx);
  const linhas = (aba, ini) => (fx[aba] ? fx[aba].linhas.slice(ini - 1) : []);
  const carteira = linhas('Carteira Renda Fixa', 9).filter((l) => l[0] || l[3]);
  assert.ok(carteira.length >= 1, 'a Carteira RF das fixtures tem posições');
  const fontes = {
    transacoes: linhas('Transações Renda Fixa', 7).filter((l) => l[0]).map((l) => [l[0], l[4]]),
    lotes: linhas('RF Contratada - Lotes', 2).filter((l) => l[0]).map((l) => [l[0], l[1]]),
    resumo: linhas('RF Contratada - Resumo', 2).filter((l) => l[0]).map((l) => [l[0], l[1]]),
    historico: linhas('aux_historico-renda-fixa', 2).filter((l) => l[1]).map((l) => [l[1], l[2]]),
  };
  let comparacoes = 0, casamentos = 0;
  for (const pos of carteira) {
    const nome = String(pos[2] || pos[3] || '').trim();
    const instRaw = pos[5];
    const instNovo = sb.normalizarInstituicaoRF_(instRaw);
    assert.equal(instNovo, instAntiga(instRaw), 'a normalização de instituição não mudou para as posições atuais');
    for (const [fonte, rows] of Object.entries(fontes)) {
      for (const [prod, inst] of rows) {
        const antes = casaAntiga(nome, instAntiga(instRaw), prod, inst);
        const depois = sb.casaTituloRf_(nome, instNovo, prod, inst);
        assert.equal(depois, antes, `${fonte}: "${prod}" x posição "${nome}"`);
        comparacoes++; if (depois) casamentos++;
      }
    }
    // chave "crua" (Resumo/IR/Metas): onde casava antes, casa agora (e nada novo na base atual)
    for (const [fonte, rows] of Object.entries({ lotes: fontes.lotes, resumo: fontes.resumo })) {
      for (const [prod, inst] of rows) {
        const antes = chaveCruaAntiga(nome, instRaw) === chaveCruaAntiga(prod, inst);
        const depois = sb.chaveTituloRf_(nome, instRaw) === sb.chaveTituloRf_(prod, inst);
        assert.equal(depois, antes, `${fonte} (chave): "${prod}" x posição "${nome}"`);
      }
    }
  }
  assert.ok(casamentos > 0 && comparacoes > casamentos, 'houve casamentos e não-casamentos comparados');
  // cada posição tem id estável único e todas as chaves de nome atuais continuam distintas
  const ids = Array.from(sb.idsEstaveisCarteiraRf_(carteira));
  const marcasPorTitulo = new Map();
  carteira.forEach((p, i) => { const k = sb.chaveTituloRf_(p[2] || p[3], p[5]); marcasPorTitulo.set(k, (marcasPorTitulo.get(k) || new Set()).add(ids[i])); });
  for (const set of marcasPorTitulo.values()) assert.equal(set.size, 1, 'o mesmo título (nome+instituição) tem 1 id só');
});
