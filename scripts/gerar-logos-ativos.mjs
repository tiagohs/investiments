// scripts/gerar-logos-ativos.mjs — varre assets/imgs/acoes e assets/imgs/fiis
// e gera assets/js/logos-ativos.js (mapa TICKER -> caminho do arquivo).
// Rodar de novo sempre que adicionar/trocar uma imagem em assets/imgs/.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PASTAS = ['assets/imgs/acoes', 'assets/imgs/fiis'];
const PRIORIDADE_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
// Ticker B3 (ação/FII): 4-6 letras + número no fim (WIZC3, PMLL11) - MAS
// alguns têm dígito no meio também (B3SA3), então a regra real é só
// "3-8 caracteres alfanuméricos, com pelo menos 1 letra" (a pasta já é
// curada só com tickers - não precisa validar o formato exato aqui).
// Ticker EUA (só letras, sem número: CHTR, SIRI) também cai nessa regra.
const RE_TICKER = /^(?=.*[A-Z])[A-Z0-9]{3,8}$/i;

const encontrados = {}; // TICKER (maiúsculo) -> { ext -> caminho }
const ignorados = [];

for (const pasta of PASTAS) {
  let arquivos;
  try {
    arquivos = readdirSync(pasta);
  } catch {
    continue;
  }
  for (const nome of arquivos) {
    const pontoIdx = nome.lastIndexOf('.');
    if (pontoIdx === -1) { ignorados.push(join(pasta, nome)); continue; }
    const base = nome.slice(0, pontoIdx);
    const ext = nome.slice(pontoIdx).toLowerCase();
    const ticker = base.toUpperCase();
    if (!RE_TICKER.test(ticker) || !PRIORIDADE_EXT.includes(ext)) {
      ignorados.push(join(pasta, nome));
      continue;
    }
    encontrados[ticker] = encontrados[ticker] || {};
    encontrados[ticker][ext] = join(pasta, nome).replace(/\\/g, '/');
  }
}

const mapa = {};
const duplicatasResolvidas = [];
for (const [ticker, porExt] of Object.entries(encontrados)) {
  const exts = Object.keys(porExt);
  const escolhida = PRIORIDADE_EXT.find((e) => porExt[e]) ?? exts[0];
  mapa[ticker] = porExt[escolhida];
  if (exts.length > 1) {
    duplicatasResolvidas.push(`${ticker}: ${exts.join(', ')} -> usando ${escolhida}`);
  }
}

const tickersOrdenados = Object.keys(mapa).sort();
const linhas = tickersOrdenados.map((t) => `  ${JSON.stringify(t)}: ${JSON.stringify(mapa[t])},`);

const conteudo = `/**
 * logos-ativos.js — mapa TICKER -> caminho do logo em assets/imgs/,
 * gerado a partir dos arquivos que o Tiago foi organizando em
 * assets/imgs/acoes/ e assets/imgs/fiis/ (14/09/2026, rodada de feedback
 * do Radar de oportunidades). Regerar rodando
 * \`node scripts/gerar-logos-ativos.mjs\` sempre que adicionar/trocar uma
 * imagem — o script resolve automaticamente duplicata de extensão
 * (prioridade .png > .jpg/.jpeg > .webp) e ignora arquivo cujo nome não
 * bate com um ticker (ver o aviso que ele imprime nesse caso; hoje é o
 * caso de "fii-valreiiici--600.png", que não foi incluído aqui).
 *
 * Ticker ausente daqui (ainda não tem logo, ou o nome do arquivo não
 * bateu) cai no fallback de iniciais que já existe pros cartões de
 * ativo — nunca quebra por falta de imagem.
 */
export const LOGOS_ATIVOS = {
${linhas.join('\n')}
};
`;

writeFileSync('assets/js/logos-ativos.js', conteudo, 'utf-8');

console.log(`ok: ${tickersOrdenados.length} tickers com logo em assets/js/logos-ativos.js`);
if (duplicatasResolvidas.length) {
  console.log('\nDuplicatas de extensão resolvidas (mantendo a de maior prioridade):');
  duplicatasResolvidas.forEach((l) => console.log('  - ' + l));
}
if (ignorados.length) {
  console.log('\nArquivos ignorados (nome não bateu com um ticker, ou extensão não suportada):');
  ignorados.forEach((l) => console.log('  - ' + l));
}
