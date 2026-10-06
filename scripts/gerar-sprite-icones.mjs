#!/usr/bin/env node
// gerar-sprite-icones.mjs — 05/10/2026 (Onda 3): gera o SPRITE de ícones Material Symbols Rounded (peso 400, pacote npm
// @material-symbols/svg-400) que mora em assets/partials/shell.html, entre <!-- sprite:inicio --> e <!-- sprite:fim -->.
// Só roda em desenvolvimento (nada disso vai pro navegador além do SVG gerado). Páginas usam <svg><use href="#ico-nome"/></svg>.
//
//   node scripts/gerar-sprite-icones.mjs            (baixa os SVG que faltam do jsdelivr com curl; guarda em $TMPDIR/m3-icons)
//   M3_ICONES_DIR=/caminho/rounded node scripts/gerar-sprite-icones.mjs   (usa uma cópia local do pacote)
//
// Para um ícone novo: acrescente o nome do Material Symbols (snake_case) em ICONES e rode de novo. Ids antigos do sprite
// (ico-check/warn/bad/cart/chev-r/chart/building/globe/wallet/coins) continuam existindo via LEGADO.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = path.join(RAIZ, 'assets/partials/shell.html');
const CACHE = process.env.M3_ICONES_DIR || path.join(os.tmpdir(), 'm3-icons');

const ICONES = `home monitoring flag account_balance_wallet swap_horiz payments receipt_long menu menu_open close chevron_left chevron_right
arrow_back arrow_forward expand_more expand_less more_vert more_horiz settings sync refresh check check_circle warning error info cancel priority_high
add remove delete edit search filter_list download upload content_copy open_in_new shopping_cart light_mode dark_mode logout account_circle
trending_up trending_down trending_flat show_chart bar_chart pie_chart calendar_month schedule savings apartment public percent request_quote undo
visibility visibility_off help lightbulb folder_open inbox cloud_off tune sort arrow_upward arrow_downward star history target paid
arrow_circle_up arrow_circle_down keyboard_arrow_down keyboard_arrow_up check_box check_box_outline_blank indeterminate_check_box add_circle
restart_alt unfold_more north_east south_east person notifications table_chart keyboard_return link filter_alt dashboard bolt`.split(/\s+/).filter(Boolean);
// ícones que também ganham a versão preenchida (item ativo do menu, estados)
const COM_PREENCHIDO = new Set(['home', 'monitoring', 'flag', 'account_balance_wallet', 'swap_horiz', 'payments', 'receipt_long', 'check_circle', 'error', 'warning', 'info', 'star', 'person']);
// nomes antigos do sprite => mesmo símbolo, id antigo
const LEGADO = { priority_high: 'warn', close: 'bad', chevron_right: 'chev-r', bar_chart: 'chart', apartment: 'building', public: 'globe', shopping_cart: 'cart', account_balance_wallet: 'wallet', paid: 'coins' };

fs.mkdirSync(CACHE, { recursive: true });
function svg(nome, preenchido) {
  const arq = path.join(CACHE, `${nome}${preenchido ? '-fill' : ''}.svg`);
  if (!fs.existsSync(arq) || fs.statSync(arq).size < 50) {
    const url = `https://cdn.jsdelivr.net/npm/@material-symbols/svg-400/rounded/${nome}${preenchido ? '-fill' : ''}.svg`;
    fs.writeFileSync(arq, execFileSync('curl', ['-fsS', url], { encoding: 'utf8' }));
  }
  return fs.readFileSync(arq, 'utf8');
}
const arredonda = (p) => p.replace(/-?\d+\.\d+/g, (n) => String(Math.round(parseFloat(n) * 10) / 10)).replace(/(\d)\s+-/g, '$1-');
const caminhos = (txt) => [...txt.matchAll(/<path d="([^"]+)"/g)].map((m) => arredonda(m[1]));
const simbolo = (id, txt) => `    <symbol id="ico-${id}" viewBox="0 -960 960 960" fill="currentColor" stroke="none">${caminhos(txt).map((d) => `<path d="${d}"/>`).join('')}</symbol>`;

const linhas = [];
const ids = new Set();
function add(id, txt) { if (!ids.has(id)) { ids.add(id); linhas.push(simbolo(id, txt)); } }
for (const nome of ICONES) {
  const id = LEGADO[nome] || nome.replace(/_/g, '-');
  add(id, svg(nome, false));
  if (COM_PREENCHIDO.has(nome)) add(`${id}-fill`, svg(nome, true));
  if (nome === 'close') add('close', svg(nome, false)); // "bad" (legado) e "close" são o mesmo desenho
}
const html = fs.readFileSync(SHELL, 'utf8');
const ini = html.indexOf('<!-- sprite:inicio -->');
const fim = html.indexOf('<!-- sprite:fim -->');
if (ini < 0 || fim < 0) throw new Error('marcadores <!-- sprite:inicio --> / <!-- sprite:fim --> não encontrados em shell.html');
fs.writeFileSync(SHELL, `${html.slice(0, ini)}<!-- sprite:inicio -->\n${linhas.join('\n')}\n    ${html.slice(fim)}`);
console.log(`ok: ${linhas.length} símbolos em assets/partials/shell.html`);
