// tests/harness/verificar.mjs
//
// 23/09/2026 #4 (pedido do Tiago: "quero que isso sempre seja gerado e
// atualizado, e testes rodados, quando faço alguma modificação no código").
//
//   npm run verificar   roda TODOS os testes (o que também regera o
//                       relatório das telas) e mostra um resumo
//   npm run vigiar      o mesmo, de novo a cada arquivo salvo em assets/,
//                       apps-script/, carteiras/ ou tests/
//   git commit          o gancho .githooks/pre-commit chama este script
//
// Saída com erro (bloqueia o commit) só quando o CÓDIGO quebrou. Os
// testes "[DADO DA PLANILHA]" são problemas de lançamento na planilha, que
// só o Tiago corrige: aparecem no resumo como alerta, mas não bloqueiam.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const RELATORIO = path.join(__dirname, 'relatorio', 'conferencia-telas.html');
const PREFIXO_DADO = '[DADO DA PLANILHA]';

function rodarTestes() {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const filho = spawn(process.execPath, ['--test', '--test-reporter=tap'], { cwd: ROOT, env: process.env });
    let saida = '';
    filho.stdout.on('data', (d) => { saida += d; });
    filho.stderr.on('data', (d) => { saida += d; });
    filho.on('close', () => {
      const ok = [], falhas = [], pulados = [];
      for (const linha of saida.split('\n')) {
        const m = linha.match(/^(not ok|ok) \d+ - (.*)$/); // só testes de nível de arquivo (sem indentação)
        if (!m) continue;
        const nome = m[2].replace(/\s+#\s*SKIP.*$/, '');
        if (/#\s*SKIP/.test(m[2])) pulados.push(nome);
        else if (m[1] === 'ok') ok.push(nome);
        else falhas.push(nome);
      }
      resolve({ ok, falhas, pulados, saida, segundos: ((Date.now() - inicio) / 1000).toFixed(1) });
    });
  });
}

function detalheDaFalha(saida, nome) {
  // pega as linhas de erro do bloco YAML logo depois do "not ok … nome"
  const i = saida.indexOf(`- ${nome}`);
  if (i === -1) return '';
  const bloco = saida.slice(i, i + 3000).split('\n').slice(1);
  const fim = bloco.findIndex((l) => /^\s*\.\.\.\s*$/.test(l));
  return bloco.slice(0, fim === -1 ? 40 : fim)
    .filter((l) => /error:|actual|expected|problema|^\s{4,}\S/.test(l) && !/duration_ms|type:|location:|stack|at |node:internal|failureType|code:|TestContext|runInAsyncScope|file:\/\/|async_hooks/.test(l))
    .slice(0, 12).map((l) => `      ${l.trim()}`).join('\n');
}

async function verificar() {
  const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`\n[${hora}] rodando os testes e gerando o relatório das telas...`);
  const r = await rodarTestes();
  const falhasCodigo = r.falhas.filter((n) => !n.startsWith(PREFIXO_DADO));
  const alertasDado = r.falhas.filter((n) => n.startsWith(PREFIXO_DADO));
  console.log(`${r.ok.length} ok · ${falhasCodigo.length} falha(s) de código · ${alertasDado.length} alerta(s) de dado da planilha · ${r.pulados.length} pulado(s) · ${r.segundos}s`);
  if (falhasCodigo.length) {
    console.log('\n✗ FALHAS DE CÓDIGO (corrigir antes de subir):');
    for (const n of falhasCodigo) console.log(`  ✗ ${n}\n${detalheDaFalha(r.saida, n)}`);
  }
  if (alertasDado.length) {
    console.log('\n! alertas de dado da planilha (não bloqueiam; detalhe no relatório):');
    for (const n of alertasDado) console.log(`  ! ${n.slice(PREFIXO_DADO.length + 1)}`);
  }
  if (fs.existsSync(RELATORIO)) console.log(`\nrelatório: ${RELATORIO}`);
  else console.log('\nrelatório não gerado (falta tests/harness/fixtures.json? ver tests/harness/README.md)');
  return falhasCodigo.length === 0;
}

if (process.argv.includes('--vigiar')) {
  const PASTAS = ['assets', 'apps-script', 'carteiras', 'tests'].map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
  const IGNORAR = /(^|[\\/])(relatorio|_to_delete|node_modules|\.git|__pycache__)([\\/]|$)|\.DS_Store$|~$|\.swp$/;
  let rodando = false, pendente = false, timer = null;
  const disparar = async () => {
    if (rodando) { pendente = true; return; }
    rodando = true;
    await verificar();
    rodando = false;
    if (pendente) { pendente = false; disparar(); } else console.log('\nvigiando - salve um arquivo pra rodar de novo (Ctrl+C pra sair)');
  };
  for (const pasta of PASTAS) {
    fs.watch(pasta, { recursive: true }, (_evento, arquivo) => {
      if (!arquivo || IGNORAR.test(arquivo)) return;
      clearTimeout(timer);
      timer = setTimeout(() => { console.log(`\nmudou: ${path.relative(ROOT, path.join(pasta, arquivo))}`); disparar(); }, 1200);
    });
  }
  disparar();
} else {
  process.exit((await verificar()) ? 0 : 1);
}
