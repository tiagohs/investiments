// scripts/gerar-modulepreload.mjs - 06/10/2026 (A-42): escreve em cada HTML do app o bloco <link rel="modulepreload"> do caminho
// crítico da página (fecho estático dos imports do <script type="module"> inline + da tela de entrada do router).
// O site é publicado direto da branch, sem build: este script é só uma ajuda de desenvolvimento - rode quando mudar um import
// estático e commite o HTML. tests/carga-telas.test.js falha se o bloco estiver desatualizado.
//
//   node scripts/gerar-modulepreload.mjs           reescreve os HTMLs
//   node scripts/gerar-modulepreload.mjs --checar  só confere (código de saída 1 se algum estiver desatualizado)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, PAGINAS, modulosCriticos } from './grafo-imports.mjs';

export const INICIO = '<!-- modulepreload (gerado por scripts/gerar-modulepreload.mjs; não edite à mão) -->';
export const FIM = '<!-- /modulepreload -->';

/** O bloco que o HTML deveria ter, com hrefs relativos à pasta do próprio HTML. */
export function blocoEsperado(html) {
  const base = path.dirname(path.join(ROOT_DIR, html));
  const hrefs = modulosCriticos(html).map((f) => path.relative(base, f).split(path.sep).join('/'));
  // shell.js e a tela de entrada primeiro (o navegador começa por eles), o resto em ordem alfabética
  const prioridade = (h) => (/(^|\/)shell\.js$/.test(h) ? 0 : /(^|\/)router\.js$/.test(h) ? 1 : 2);
  hrefs.sort((a, b) => prioridade(a) - prioridade(b) || a.localeCompare(b));
  return `${INICIO}\n${hrefs.map((h) => `<link rel="modulepreload" href="${h}">`).join('\n')}\n${FIM}\n`;
}

export function aplicar(html, texto) {
  const bloco = blocoEsperado(html);
  const re = new RegExp(`${INICIO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${FIM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`);
  if (re.test(texto)) return texto.replace(re, () => bloco);
  return texto.replace('</head>', () => `${bloco}</head>`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const checar = process.argv.includes('--checar');
  let desatualizado = 0;
  for (const html of PAGINAS) {
    const arq = path.join(ROOT_DIR, html);
    const atual = fs.readFileSync(arq, 'utf8');
    const novo = aplicar(html, atual);
    if (novo !== atual) {
      desatualizado += 1;
      if (!checar) fs.writeFileSync(arq, novo);
      console.log(`${checar ? 'desatualizado' : 'reescrito'}: ${html}`);
    }
  }
  if (checar && desatualizado) process.exit(1);
}
