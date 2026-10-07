// scripts/gerar-verificacao-gs.mjs
//
// 07/10/2026 (Tiago: o gráfico de Ações/FIIs voltava a errar mesmo com o HistoricoInicio.gs novo colado - havia uma cópia
// ANTIGA do HistoricoInicio dentro do arquivo "HistoricoAtivo" do projeto do Apps Script, e a última definição carregada
// vence). Gera apps-script/VerificarProjeto.gs: uma "impressão digital" (hash do código, sem espaços) de cada função de
// cada .gs do repositório. No editor, `verificarProjetoDireto()` compara com o código que está REALMENTE valendo no
// projeto e lista, por arquivo, as funções que faltam ou estão diferentes (arquivo desatualizado, colado no lugar errado,
// ou cópia velha sobrando em outro arquivo).
//
//   node scripts/gerar-verificacao-gs.mjs      (rode depois de mudar qualquer .gs; um teste confere que está em dia)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS = path.resolve(__dirname, '..', 'apps-script');
export const ARQUIVO_SAIDA = 'VerificarProjeto.gs';

export function hashCodigo(texto) {
  const s = String(texto).replace(/\s+/g, '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + s.length.toString(36);
}

export function mapaDoRepositorio(dir = GAS) {
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.gs') && f !== ARQUIVO_SAIDA).sort();
  const ctx = vm.createContext({});
  const mapa = {};
  for (const f of arquivos) {
    const codigo = fs.readFileSync(path.join(dir, f), 'utf8');
    new vm.Script(codigo, { filename: f }).runInContext(ctx);
    const nomes = [...codigo.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map((m) => m[1]);
    mapa[f.replace(/\.gs$/, '')] = Object.fromEntries(nomes.map((n) => [n, null]));
  }
  for (const arq of Object.keys(mapa)) {
    for (const n of Object.keys(mapa[arq])) mapa[arq][n] = hashCodigo(ctx[n].toString());
  }
  return mapa;
}

export function gerarCodigo(mapa) {
  return `/**
 * VerificarProjeto.gs - GERADO por scripts/gerar-verificacao-gs.mjs (não edite à mão).
 *
 * 07/10/2026: confere se o projeto do Apps Script está igual ao repositório. Rode no editor:
 *   verificarProjetoDireto()
 * O log lista, por arquivo, as funções que FALTAM (arquivo não colado / apagado) ou que estão DIFERENTES (arquivo
 * desatualizado, ou uma cópia antiga da mesma função em outro arquivo - no Apps Script vale a última carregada).
 * Funções que existem no projeto mas não no repositório não aparecem (podem ser suas, como testes no editor).
 */
var IMPRESSOES_PROJETO_ = ${JSON.stringify(mapa)};

function hashCodigoProjeto_(texto) {
  var s = String(texto).replace(/\\s+/g, '');
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + s.length.toString(36);
}

function verificarProjetoDireto() {
  var global = this;
  var problemas = [], ok = 0;
  Object.keys(IMPRESSOES_PROJETO_).forEach(function (arquivo) {
    var faltam = [], diferentes = [];
    Object.keys(IMPRESSOES_PROJETO_[arquivo]).forEach(function (nome) {
      var fn = global[nome];
      if (typeof fn !== 'function') faltam.push(nome);
      else if (hashCodigoProjeto_(fn.toString()) !== IMPRESSOES_PROJETO_[arquivo][nome]) diferentes.push(nome);
    });
    if (faltam.length || diferentes.length) {
      problemas.push(arquivo + '.gs: ' + (faltam.length ? 'FALTAM ' + faltam.length + ' (' + faltam.slice(0, 8).join(', ') + (faltam.length > 8 ? '...' : '') + ')' : '') +
        (faltam.length && diferentes.length ? ' | ' : '') + (diferentes.length ? 'DIFERENTES ' + diferentes.length + ' (' + diferentes.slice(0, 8).join(', ') + (diferentes.length > 8 ? '...' : '') + ')' : ''));
    } else ok++;
  });
  Logger.log(ok + ' arquivo(s) iguais ao repositório; ' + problemas.length + ' com diferença' + (problemas.length ? ':' : '.'));
  problemas.forEach(function (p) { Logger.log(p); });
  return problemas;
}
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mapa = mapaDoRepositorio();
  fs.writeFileSync(path.join(GAS, ARQUIVO_SAIDA), gerarCodigo(mapa));
  console.log(`gravado apps-script/${ARQUIVO_SAIDA}: ${Object.keys(mapa).length} arquivos, ${Object.values(mapa).reduce((s, m) => s + Object.keys(m).length, 0)} funções`);
}
