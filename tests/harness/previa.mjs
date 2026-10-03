// tests/harness/previa.mjs
//
// 02/10/2026: servidor de PRÉVIA do site com os dados reais da planilha
// exportada (tests/harness/fixtures.json, gitignored) - pra conferir telas
// sem implantar nada.
//
//   node tests/harness/previa.mjs [porta]        (padrão 8790)
//
// Serve a pasta do repositório e responde em /__api as mesmas ações do Web
// App (doGet/doPost do Router.gs), rodando o código .gs de verdade no
// sandbox do harness (gas-vm-harness.mjs) - a autenticação é trocada por
// "sempre ok". Escrita (doPost) acontece só na cópia em memória.
//
// No navegador (Playwright), redirecione as chamadas do Apps Script pro
// servidor e ponha um token falso válido antes de abrir a página:
//
//   await page.route('https://script.google.com/**', (r) => {
//     const u = new URL(r.request().url());
//     r.continue({ url: `http://localhost:8790/__api${u.search}` });
//   });
//   await page.addInitScript(TOKEN_FALSO_JS);   // exportado abaixo
//
// (veja previaPlaywright.py ao lado, que já faz isso e tira os prints).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures.json');

const payload = Buffer.from(JSON.stringify({ email: 'previa@exemplo.test', exp: 4102444800 })).toString('base64').replace(/=+$/, '');
export const TOKEN_FALSO = `x.${payload}.y`;
export const TOKEN_FALSO_JS = `try { localStorage.setItem('investiments_auth_token', '${TOKEN_FALSO}'); } catch (e) {}`;

export function montarSandboxPrevia() {
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  if (!sb.SpreadsheetApp.flush) sb.SpreadsheetApp.flush = () => {};
  for (const f of fs.readdirSync(path.join(ROOT, 'apps-script')).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  sb.verificarToken = () => ({ ok: true, email: 'previa@exemplo.test' });
  return sb;
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

export function iniciarPrevia(porta = 8790) {
  const sb = montarSandboxPrevia();
  const servidor = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${porta}`);
    if (u.pathname === '/__api') {
      let corpo = '';
      req.on('data', (c) => { corpo += c; });
      req.on('end', () => {
        const parameter = Object.fromEntries(u.searchParams);
        if (corpo) Object.assign(parameter, Object.fromEntries(new URLSearchParams(corpo)));
        let saida;
        try {
          const r = req.method === 'POST' ? sb.doPost({ parameter }) : sb.doGet({ parameter });
          saida = r && typeof r.getContent === 'function' ? r.getContent() : JSON.stringify(r);
        } catch (e) {
          saida = JSON.stringify({ ok: false, etapa: 'previa', erro: String(e && e.stack ? e.stack : e) });
        }
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(saida);
      });
      return;
    }
    let arq = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!arq.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) arq = path.join(arq, 'index.html');
    if (!fs.existsSync(arq)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
    fs.createReadStream(arq).pipe(res);
  });
  return new Promise((ok) => servidor.listen(porta, () => ok(servidor)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const porta = Number(process.argv[2]) || 8790;
  await iniciarPrevia(porta);
  console.log(`prévia em http://localhost:${porta}/ (API real em /__api, dados de tests/harness/fixtures.json)`);
}
