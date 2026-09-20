import { carregarCarteirasComDadosReais } from './gas-vm-harness.mjs';
import fs from 'node:fs';

const fixturesRaw = JSON.parse(fs.readFileSync('./fixtures.json', 'utf8'));
const patrimonioLinhas = fixturesRaw['aux_historico-patrimonio'].linhas.slice(1);
const strRows = patrimonioLinhas.filter(l => l[1] === 'STR');
console.log('total linhas STR:', strRows.length);
console.log('ultimas 10 linhas STR (na ordem da planilha):');
for (const l of strRows.slice(-10)) {
  console.log(l[0].__date__, 'valorBRL=', l[7]);
}

const { carteirasAcoesEua, serie } = await carregarCarteirasComDadosReais({ fixturesPath: './fixtures.json' });
console.log('\nSTR na tabela live (Carteira Ações USA)?', carteirasAcoesEua.ativos.some(a => a.ticker === 'STR'));

// olhar a série em volta de 19/08/2026 e o final
function chave(d) { return d.toISOString().slice(0,10); }
const idx19ago = serie.findIndex(p => p.data && p.data.slice(0,10) === '2026-08-19');
console.log('\nserie ao redor de 19/08/2026 (idx', idx19ago, '):');
for (let i = Math.max(0, idx19ago - 3); i <= Math.min(serie.length - 1, idx19ago + 5); i++) {
  console.log(serie[i].data, 'acoesEua=', serie[i].acoesEua, 'patrimonio=', serie[i].patrimonio);
}

console.log('\nultimos 5 pontos da serie:');
for (const p of serie.slice(-5)) {
  console.log(p.data, 'acoesEua=', p.acoesEua, 'patrimonio=', p.patrimonio);
}
