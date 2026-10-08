#!/usr/bin/env node
// scripts/gas.mjs - 08/10/2026 (Etapa 0): publicar o Apps Script SEM colar arquivo por arquivo no editor.
//
// Esta semana os bugs mais caros vieram de colar 48 arquivos à mão: uma cópia velha do HistoricoInicio dentro do arquivo
// "HistoricoAtivo", um Aportes.gs colado errado, versão salva diferente da implantada. Com o clasp (ferramenta oficial do
// Google) o projeto do Apps Script fica IGUAL à pasta apps-script/ e a implantação que o site usa ganha a versão nova.
//
//   npm run gas:configurar -- <ID do script>   1x: grava .clasp.json (fica fora do git) - o ID está em
//                                               Configurações do projeto › "ID do script"
//   npm run gas:conferir                        compara o projeto do Google com a pasta (nada é alterado)
//   npm run gas:publicar                        confere o código, envia (push) e atualiza a implantação do site
//
// Antes, 1x: `npx @google/clasp@2.4.2 login` e ligar "API do Google Apps Script" em https://script.google.com/home/usersettings
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');
const PASTA_GS = path.join(RAIZ, 'apps-script');
const CLASP_JSON = path.join(RAIZ, '.clasp.json');
const CLASP = ['--yes', '@google/clasp@2.4.2'];
export const ESCOPOS = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file', // 08/10/2026: só o que o script cria (cópia .xlsx diária - ExportarPlanilha.gs)
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/script.send_mail',
  'https://www.googleapis.com/auth/userinfo.email',
];

const sair = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };
const ok = (msg) => console.log(`✓ ${msg}`);

/** O ID da implantação que o site usa (a URL /macros/s/<ID>/exec de assets/js/config.js). */
export function idImplantacaoDoSite(textoConfig = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'config.js'), 'utf8')) {
  const m = textoConfig.match(/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec/);
  return m ? m[1] : null;
}

/** Nomes (sem extensão) dos arquivos de código de uma pasta: .gs e .js (o clasp baixa como .gs com fileExtension "gs"). */
export function arquivosDeCodigo(pasta) {
  return fs.readdirSync(pasta).filter((f) => /\.(gs|js)$/.test(f)).map((f) => f.replace(/\.(gs|js)$/, '')).sort();
}

/** Diferenças entre o projeto baixado do Google e a pasta: { soNoGoogle, soNaPasta, diferentes }. */
export function compararPastas(pastaGoogle, pastaLocal) {
  const g = new Set(arquivosDeCodigo(pastaGoogle));
  const l = new Set(arquivosDeCodigo(pastaLocal));
  const ler = (pasta, nome) => {
    const f = ['gs', 'js'].map((e) => path.join(pasta, `${nome}.${e}`)).find((x) => fs.existsSync(x));
    return fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim();
  };
  return {
    soNoGoogle: [...g].filter((n) => !l.has(n)),
    soNaPasta: [...l].filter((n) => !g.has(n)),
    diferentes: [...l].filter((n) => g.has(n) && ler(pastaGoogle, n) !== ler(pastaLocal, n)),
  };
}

/** Manifesto com os escopos fixos (sem tirar nada do resto). */
export function manifestoComEscopos(manifesto) {
  const m = { ...manifesto };
  const atuais = Array.isArray(m.oauthScopes) ? m.oauthScopes : [];
  m.oauthScopes = [...new Set([...atuais, ...ESCOPOS])];
  return m;
}

/**
 * 08/10/2026 (Tiago: "sempre rode para mim"): se existir .clasprc.json na RAIZ do repositório (fora do git - .gitignore), o
 * clasp usa ESSA credencial, numa pasta "home" temporária - assim o publicar roda de qualquer máquina que tenha a pasta
 * (inclusive a do Claude, pela pasta conectada). Sem o arquivo, usa o login normal (~/.clasprc.json). A credencial
 * renovada pelo clasp volta pro arquivo da raiz.
 */
const CLASPRC_RAIZ = path.join(RAIZ, '.clasprc.json');

export function ambienteClasp(raizRc = CLASPRC_RAIZ, env = process.env) {
  if (!fs.existsSync(raizRc)) return { env, depois: () => {} };
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clasp-home-'));
  const rcTemp = path.join(home, '.clasprc.json');
  fs.copyFileSync(raizRc, rcTemp);
  const npmCache = env.npm_config_cache || path.join(env.HOME || os.homedir(), '.npm');
  return {
    env: { ...env, HOME: home, USERPROFILE: home, npm_config_cache: npmCache },
    depois: () => {
      try { if (fs.readFileSync(rcTemp, 'utf8') !== fs.readFileSync(raizRc, 'utf8')) fs.copyFileSync(rcTemp, raizRc); } catch (e) { /* mantém a antiga */ }
      try { fs.rmSync(home, { recursive: true, force: true }); } catch (e) { /* temporário */ }
    },
  };
}

function clasp(args, { cwd = RAIZ, capturar = false, dica = '' } = {}) {
  // 08/10/2026: a saída do clasp é sempre capturada e mostrada (antes, no erro, só aparecia "falhou" sem o motivo)
  const amb = ambienteClasp();
  let r;
  try {
    r = spawnSync('npx', [...CLASP, ...args], { cwd, env: amb.env, stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32' });
  } finally { amb.depois(); }
  const txt = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (!capturar && txt) console.log(txt);
  if (r.status !== 0) {
    if (/login|credentials|Could not read API credentials|clasp login/i.test(txt)) sair('O clasp não está logado: rode `npx @google/clasp@2.4.2 login` e tente de novo.');
    if (/User has not enabled the Apps Script API|usersettings/i.test(txt)) sair('Ligue "API do Google Apps Script" em https://script.google.com/home/usersettings e tente de novo.');
    sair(`clasp ${args.join(' ')} falhou.\n--- mensagem do clasp ---\n${txt || '(vazia)'}\n-------------------------${dica ? `\n${dica}` : ''}`);
  }
  return r.stdout || '';
}

function lerClaspJson() {
  if (!fs.existsSync(CLASP_JSON)) sair('Falta configurar: npm run gas:configurar -- <ID do script> (Configurações do projeto › ID do script).');
  return JSON.parse(fs.readFileSync(CLASP_JSON, 'utf8'));
}

/** Baixa o projeto do Google numa pasta temporária (nada muda na pasta do repositório). */
function baixarDoGoogle() {
  const { scriptId } = lerClaspJson();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-conferir-'));
  fs.writeFileSync(path.join(tmp, '.clasp.json'), JSON.stringify({ scriptId, rootDir: tmp, fileExtension: 'gs' }));
  clasp(['pull'], { cwd: tmp, capturar: true });
  return tmp;
}

/** Sintaxe de todos os .gs (como o Apps Script carrega: tudo no mesmo escopo global, na ordem). */
export function conferirSintaxe(pasta = PASTA_GS) {
  const erros = [];
  for (const f of fs.readdirSync(pasta).filter((x) => x.endsWith('.gs')).sort()) {
    try { new vm.Script(fs.readFileSync(path.join(pasta, f), 'utf8'), { filename: f }); } catch (e) { erros.push(`${f}: ${e.message}`); }
  }
  return erros;
}

function configurar(scriptId) {
  if (!scriptId || !/^[A-Za-z0-9_-]{20,}$/.test(scriptId)) sair('Passe o ID do script: npm run gas:configurar -- <ID> (Configurações do projeto › ID do script).');
  fs.writeFileSync(CLASP_JSON, `${JSON.stringify({ scriptId, rootDir: 'apps-script', fileExtension: 'gs' }, null, 2)}\n`);
  ok('.clasp.json gravado (fica fora do git).');
  const tmp = baixarDoGoogle();
  const destino = path.join(PASTA_GS, 'appsscript.json');
  const remoto = JSON.parse(fs.readFileSync(path.join(tmp, 'appsscript.json'), 'utf8'));
  if (!fs.existsSync(destino)) {
    fs.writeFileSync(destino, `${JSON.stringify(manifestoComEscopos(remoto), null, 2)}\n`);
    ok('apps-script/appsscript.json criado a partir do manifesto do projeto + escopos fixos (oauthScopes).');
  } else ok('apps-script/appsscript.json já existe - mantido.');
  conferir(tmp);
}

function conferir(tmp = baixarDoGoogle()) {
  const d = compararPastas(tmp, PASTA_GS);
  console.log('\nProjeto do Google x pasta apps-script/:');
  console.log(d.soNoGoogle.length ? `  • Só no Google (o publicar APAGA): ${d.soNoGoogle.join(', ')}` : '  • Nenhum arquivo sobrando no Google.');
  console.log(d.soNaPasta.length ? `  • Só na pasta (o publicar CRIA): ${d.soNaPasta.join(', ')}` : '  • Nenhum arquivo faltando no Google.');
  console.log(d.diferentes.length ? `  • Diferentes (o publicar SUBSTITUI): ${d.diferentes.join(', ')}` : '  • Os arquivos em comum estão iguais.');
  const manifestoRemoto = JSON.parse(fs.readFileSync(path.join(tmp, 'appsscript.json'), 'utf8'));
  const faltam = ESCOPOS.filter((s) => !(manifestoRemoto.oauthScopes || []).includes(s));
  console.log(faltam.length ? `  • Manifesto do Google sem os escopos fixos (${faltam.length}) - o publicar acerta.` : '  • Manifesto com os escopos fixos.');
  return d;
}

function publicar() {
  lerClaspJson();
  if (!fs.existsSync(path.join(PASTA_GS, 'appsscript.json'))) sair('Falta apps-script/appsscript.json: rode npm run gas:configurar -- <ID> primeiro.');
  const erros = conferirSintaxe();
  if (erros.length) sair(`Erro de sintaxe - nada foi enviado:\n  ${erros.join('\n  ')}`);
  ok('Sintaxe dos .gs ok.');
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'gerar-verificacao-gs.mjs')], { stdio: 'inherit' });
  const idImpl = idImplantacaoDoSite();
  if (!idImpl) sair('Não achei a URL do Web App em assets/js/config.js.');
  clasp(['push', '--force']);
  ok('Código enviado (o projeto do Google agora é igual à pasta apps-script/).');
  let desc = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try { desc += ` ${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).trim()}`; } catch (e) { /* sem git */ }
  clasp(['deploy', '--deploymentId', idImpl, '--description', desc], {
    dica: 'O código JÁ foi enviado. Pra terminar agora pelo editor: Implantar › Gerenciar implantações › lápis › Versão: Nova versão › Implantar.',
  });
  ok(`Implantação do site atualizada (nova versão: ${desc}). Confira no site: Console › (await api.ping(getToken())).versao`);
  console.log('\nSe o Google pedir permissão nova: no editor, rode autorizarProjetoDireto e aceite.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'configurar') configurar(arg);
  else if (cmd === 'conferir') conferir();
  else if (cmd === 'publicar') publicar();
  else sair('Uso: node scripts/gas.mjs configurar <ID do script> | conferir | publicar');
}
