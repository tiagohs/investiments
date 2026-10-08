#!/usr/bin/env node
// tests/harness/gas-vm-harness.mjs
//
// Harness de testes "com dados reais" pedido pelo Tiago (20/09/2026):
// carrega o TEXTO LITERAL dos .gs de produção (apps-script/*.gs) num
// sandbox Node (vm), com um SpreadsheetApp/Session/CacheService/
// LockService/Logger/UrlFetchApp FALSOS montados em cima de fixtures
// reais extraídas de um export .xlsx da planilha (ver extrair-fixtures.py,
// no mesmo diretório) - e chama as funções REAIS de produção sem
// reescrever nenhuma linha de cálculo. Em seguida importa as funções REAIS
// do front-end (filtrarHistoricoPorPeriodo/normalizarSerieRentabilidade,
// de assets/js/pages/inicio.js) e roda os mesmos cálculos que a tela
// mostra, pra qualquer bug aparecer aqui, local, em segundos - em vez de
// só quando o Tiago olha o app de verdade.
//
// Uso:
//   node tests/harness/gas-vm-harness.mjs [--worst-days]
// (roda a partir da raiz do projeto; espera fixtures.json já extraído em
// tests/harness/fixtures.json - ver extrair-fixtures.py)
//
// Por que .gs literal + vm, em vez de "extrair a lógica pra um módulo
// testável": Tiago aprovou reestruturar, mas os .gs de produção são
// código financeiro sensível já testado manualmente contra o Gorilla -
// mexer na ESTRUTURA deles pra virar "testável" é risco de regressão
// exatamente do tipo que motivou esse pedido. Carregar o texto tal como
// está, sem mudar 1 caractere, elimina esse risco por completo: o teste
// só pode divergir do app de verdade se o FAKE (SpreadsheetApp/fixture)
// estiver errado, nunca porque o .gs foi adaptado pra caber no teste.
//
// 20/09/2026 #2 (pedido do Tiago - "veja se os números da tela de
// Carteiras batem também, e se os gráficos de patrimônio estão de acordo
// com a tela"): ganhou carregarCarteirasComDadosReais(), que roda as
// funções LIVE por trás das 5 telas de Carteiras (montarHome_/
// montarCarteirasHome_/montarCarteiraClasse_ ×3/montarCarteirasRendaFixa_)
// contra os MESMOS fixtures, pra comparar com o último ponto do
// "historico" (a série backfillada que os gráficos de "Evolução do
// patrimônio" plotam) e provar/quantificar a diferença entre os dois. Pra
// isso o fake SpreadsheetApp precisou ganhar suporte a getRange() em
// A1-notation (ex.: getRange('E4:I19'), getRange('B7:B16'),
// getRange('C82') via concatenação de string) - as funções da Início só
// usavam a forma numérica (getRange(row, col, numRows, numCols)), mas
// Home.gs/DistribuicoesMetas.gs (lerBlocoRadar_) usam a forma A1 - e um
// UrlFetchApp falso (buscarIpcaAcumulado12Meses_, BackfillIndices.gs, faz
// 1 fetch de verdade na API do BCB; devolve uma série fixa "de mentira" -
// o IPCA resultante não entra em NENHUMA comparação de patrimônio feita
// pelos testes, só seria usado por um card de benchmark auxiliar).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..'); // raiz do projeto (tests/harness/ -> ../..)
const GAS_DIR = path.join(ROOT, 'apps-script');
const INICIO_JS_PATH = path.join(ROOT, 'assets', 'js', 'pages', 'inicio.js');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');

// --- parser de A1-notation (getRange('B7'), getRange('E4:I19'), etc.) -
// só o suficiente pro que os .gs de produção realmente usam: 1 coluna+1
// linha (ex. 'B7') ou um retângulo 'coluna+linha:coluna+linha' (ex.
// 'E4:I19'). Não suporta linha/coluna inteira ('A:A', '4:4') - nenhuma
// função usada pelos testes precisa disso.
function colLetraParaIndice_(letras) {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n; // 1-based
}
function parseA1_(a1) {
  const m = a1.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m) throw new Error('A1-notation não suportada pelo harness: ' + a1);
  const col1 = colLetraParaIndice_(m[1]);
  const row1 = parseInt(m[2], 10);
  const col2 = m[3] ? colLetraParaIndice_(m[3]) : col1;
  const row2 = m[4] ? parseInt(m[4], 10) : row1;
  return { row: row1, col: col1, numRows: row2 - row1 + 1, numCols: col2 - col1 + 1 };
}

// --- UrlFetchApp fake: só buscarIpcaAcumulado12Meses_ (BackfillIndices.gs)
// chama fetch de verdade, pra IPCA acumulado 12m via BCB. O valor daqui
// não é comparado em teste nenhum de patrimônio/consistência - só evita
// que montarCarteirasHome_/montarCarteirasRendaFixa_ (que chamam essa
// função sem try/catch) quebrem inteiras por falta de rede no sandbox. */
// 23/09/2026 #8: devolve os últimos 13 IPCAs mensais da própria aba
// aux_historico-indices (o mesmo formato da API do BCB: 01/MM/AAAA), pra o
// "IPCA (12m)" da Renda Fixa no harness ser o de verdade e poder ser
// conferido. Sem a aba, cai na série fixa de antes.
function criarUrlFetchAppFake_(fixturesRaw = null) {
  const ipcaDaAba = () => {
    const out = [];
    for (const l of (fixturesRaw && fixturesRaw['aux_historico-indices'] ? fixturesRaw['aux_historico-indices'].linhas : [])) {
      if (l[1] !== 'IPCA' || !l[0] || !l[0].__date__ || typeof l[2] !== 'number') continue;
      const [y, mo, d, h, mi, se] = l[0].__date__.match(/^(\d+)-(\d+)-(\d+)T(\d+):(\d+):(\d+)/).slice(1).map(Number);
      const p = partesNoFuso_(FUSO_PROJETO_APPS_SCRIPT, relogioNoFusoParaUtcMs_(FUSO_PLANILHA_XLSX, y, mo, d, h, mi, se));
      const m = p.d >= 20 ? (p.mo % 12) + 1 : p.mo;
      const a = p.d >= 20 && p.mo === 12 ? p.y + 1 : p.y;
      out.push({ data: `01/${String(m).padStart(2, '0')}/${a}`, valor: String(l[2]), chave: a * 100 + m });
    }
    return out.sort((x, z) => x.chave - z.chave).slice(-13).map(({ data, valor }) => ({ data, valor }));
  };
  return {
    fetch(url) {
      if (String(url).indexOf('bcdata.sgs.433') !== -1) {
        let serie = ipcaDaAba();
        if (serie.length < 13) {
          serie = [];
          for (let i = 0; i < 13; i++) serie.push({ data: '01/01/2026', valor: '0.30' });
        }
        return { getContentText: () => JSON.stringify(serie) };
      }
      return { getContentText: () => '[]' };
    },
  };
}

// Fuso do PROJETO Apps Script (Session.getScriptTimeZone()) e fuso da
// PLANILHA (em que o .xlsx exportado grava o relógio das datas) - ver
// comentário em reviveDate, logo abaixo, pra prova de cada um.
export const FUSO_PROJETO_APPS_SCRIPT = 'America/Sao_Paulo';
export const FUSO_PLANILHA_XLSX = 'America/New_York';

const _formatadoresFuso_ = new Map();
function partesNoFuso_(tz, ms) {
  if (!_formatadoresFuso_.has(tz)) {
    _formatadoresFuso_.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  const o = {};
  for (const { type, value } of _formatadoresFuso_.get(tz).formatToParts(new Date(ms))) o[type] = value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}
/** Instante (ms UTC) cujo relógio em `tz` é y-mo-d h:mi:s. */
export function relogioNoFusoParaUtcMs_(tz, y, mo, d, h, mi, s) {
  const alvo = Date.UTC(y, mo - 1, d, h, mi, s);
  let palpite = alvo;
  for (let i = 0; i < 3; i += 1) {
    const p = partesNoFuso_(tz, palpite);
    const visto = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    if (visto === alvo) break;
    palpite += alvo - visto;
  }
  return palpite;
}

// 06/10/2026 (A-75): fixtures.json (~11 MB) era relido e parseado em TODO sandbox - e há testes que montam 5-7 por arquivo.
// Agora é lido 1 vez por processo (cache por caminho + mtime). O objeto devolvido é COMPARTILHADO: trate como somente
// leitura (o sandbox nunca o altera - copia cada aba ao montar; escrita da planilha falsa vai pra cópia).
const _cacheFixturesRaw_ = new Map();
export function lerFixturesRaw_(fixturesPath = FIXTURES_PATH) {
  const mtimeMs = fs.statSync(fixturesPath).mtimeMs;
  const emCache = _cacheFixturesRaw_.get(fixturesPath);
  if (emCache && emCache.mtimeMs === mtimeMs) return emCache.raw;
  const raw = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  _cacheFixturesRaw_.set(fixturesPath, { mtimeMs, raw });
  return raw;
}

/**
 * 06/10/2026 (A-72): congela o relógio do sandbox (`new Date()` e `Date.now()` dentro dos .gs) num instante - os
 * testes de coerência entre telas usam o dia em que fixtures.json foi extraído (_meta.extraidoEm), senão a janela
 * de 12 meses, o "hoje" do câmbio etc. andariam com o relógio e o teste mudaria de resultado sem a planilha mudar.
 */
export function congelarRelogioSandbox_(sandbox, agoraMs) {
  new vm.Script(`(function (MS) {
    class DateFixa extends Date {
      constructor(...a) { if (a.length === 0) super(MS); else super(...a); }
      static now() { return MS; }
    }
    globalThis.Date = DateFixa;
  })(${Number(agoraMs)})`).runInContext(sandbox);
}

const _memoDataXlsx_ = new Map(); // "2026-10-05T16:56:00" (relógio da planilha) -> ms UTC (a conversão por Intl era o grosso do custo de montar o sandbox)
export function montarSandboxComFixtures_(fixturesRaw, sandbox) {
  const scriptCacheStore = new Map();
  const scriptCache = {
    get: (k) => (scriptCacheStore.has(k) ? scriptCacheStore.get(k) : null),
    getAll: (ks) => { const out = {}; ks.forEach((k) => { if (scriptCacheStore.has(k)) out[k] = scriptCacheStore.get(k); }); return out; },
    putAll: (obj) => Object.entries(obj).forEach(([k, v]) => scriptCacheStore.set(k, v)),
    put: (k, v) => scriptCacheStore.set(k, v),
    removeAll: (ks) => ks.forEach((k) => scriptCacheStore.delete(k)),
    remove: (k) => scriptCacheStore.delete(k),
  };

  // vm.createContext não expõe os globals nativos da nova realm (Date...)
  // como propriedades PRÓPRIAS de `sandbox` - "new Date(...)" feito FORA
  // do vm não passa "instanceof Date" DENTRO do vm (2 realms diferentes).
  // Força a exposição rodando 1 linha dentro do próprio contexto.
  new vm.Script('this.Date = Date; this.Object = Object; this.Array = Array;').runInContext(sandbox);

  function reviveDate(iso) {
    // 23/09/2026 (bug do PRÓPRIO harness, achado investigando os gráficos
    // com o Controle 7): o .xlsx exportado grava cada data/hora no RELÓGIO
    // DO FUSO DA PLANILHA (sem tz), não no fuso do projeto Apps Script. Os
    // dois são diferentes no caso do Tiago - a planilha está em
    // America/New_York (prova: as linhas de aux_historico-renda-fixa, que
    // o Apps Script grava sempre à meia-noite de São Paulo, aparecem no
    // .xlsx como 22:00 ou 23:00 do dia ANTERIOR, e a troca 22h<->23h cai
    // EXATAMENTE nas datas de horário de verão dos EUA - 2º domingo de
    // março / 1º domingo de novembro, todo ano de 2021 a 2026), enquanto
    // o projeto roda em America/Sao_Paulo (prova: o gráfico real do app
    // termina em 24/09 no dia 23/09 - só bate lendo essas linhas no fuso
    // de SP). Antes, o harness tratava o relógio do .xlsx como se fosse
    // SP - toda linha de Renda Fixa caía 1 dia ANTES do que cai no app de
    // verdade, e o harness enxergava desalinhamentos aporte x saldo que
    // NÃO existem em produção. Agora converte do relógio de
    // FUSO_PLANILHA_XLSX pro instante real (UTC), e o resto (chaves de
    // dia etc.) segue no fuso do projeto, igual o Apps Script faz.
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
    if (!m) return new sandbox.Date(iso);
    const chave = iso.slice(0, 19);
    let ms = _memoDataXlsx_.get(chave);
    if (ms === undefined) {
      const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
      ms = relogioNoFusoParaUtcMs_(FUSO_PLANILHA_XLSX, y, mo, d, h, mi, s);
      _memoDataXlsx_.set(chave, ms);
    }
    return new sandbox.Date(ms);
  }
  function revive(v) {
    if (v && typeof v === 'object' && typeof v.__date__ === 'string') return reviveDate(v.__date__);
    return v;
  }
  // 06/10/2026 (A-75): cada aba só é copiada/convertida (datas -> Date do sandbox) quando alguém a lê pela 1ª vez - a maioria
  // dos testes não toca em aux_gastos (6,6 mil linhas), nas Transações (10,8 mil) etc. A atribuição (insertSheet/setValues) continua valendo.
  const fixtures = {};
  for (const [nome, bruta] of Object.entries(fixturesRaw).filter(([k]) => !k.startsWith('_'))) { // "_meta" etc. não são abas
    Object.defineProperty(fixtures, nome, {
      configurable: true, enumerable: true,
      get() {
        const pronta = { lastRow: bruta.lastRow, linhas: bruta.linhas.map((linha) => linha.map(revive)), validacoes: bruta.validacoes || [] };
        Object.defineProperty(fixtures, nome, { value: pronta, writable: true, configurable: true, enumerable: true });
        return pronta;
      },
      set(v) { Object.defineProperty(fixtures, nome, { value: v, writable: true, configurable: true, enumerable: true }); },
    });
  }

  const propriedadesFalsas = (() => {
    const m = new Map();
    return {
      getProperty: (k) => (m.has(k) ? m.get(k) : null), setProperty: (k, v) => { m.set(k, String(v)); },
      deleteProperty: (k) => { m.delete(k); }, getKeys: () => [...m.keys()],
    };
  })();

  // 07/10/2026 (Tiago: o lançamento da B3 gravou só Produto+Data e parou - "Movimentação" da planilha só aceita "Compra,Venda"):
  // as VALIDAÇÕES DE DADOS (lista) da planilha real (extrair-fixtures.py!validacoes_por_aba) valem aqui como no Apps Script:
  // escrever fora da lista numa célula que rejeita lança o MESMO erro e deixa gravado só o que veio antes (célula a célula,
  // linha a linha) - era o que fazia o site deixar linha pela metade. getDataValidation(s) devolve a regra (VALUE_IN_LIST).
  const regrasCache = {};
  function regrasDaAba_(nome) {
    if (regrasCache[nome]) return regrasCache[nome];
    const brutas = (fixtures[nome] && fixtures[nome].validacoes) || [];
    const lerListaRef = (ref) => {
      const m = String(ref || '').match(/^'?(.+?)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/);
      if (!m || !fixtures[m[1]]) return null;
      const p = parseA1_(`${m[2]}${m[3]}${m[4] ? `:${m[4]}${m[5]}` : ''}`);
      const out = [];
      for (let r = 0; r < p.numRows; r++) for (let c = 0; c < p.numCols; c++) {
        const v = (fixtures[m[1]].linhas[p.row - 1 + r] || [])[p.col - 1 + c];
        if (v !== null && v !== undefined && v !== '') out.push(String(v));
      }
      return out;
    };
    regrasCache[nome] = brutas.map((b) => {
      let p;
      try { p = parseA1_(b.ref); } catch (e) { return null; }
      const lista = b.lista || lerListaRef(b.listaRef);
      if (!lista) return null;
      return { r1: p.row, c1: p.col, r2: p.row + p.numRows - 1, c2: p.col + p.numCols - 1, lista, rejeita: !!b.rejeita };
    }).filter(Boolean);
    return regrasCache[nome];
  }
  function regraNaCelula_(nome, r, c) {
    return regrasDaAba_(nome).find((g) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) || null;
  }
  function objetoRegra_(g) {
    return g ? {
      getCriteriaType: () => 'VALUE_IN_LIST',
      getCriteriaValues: () => [g.lista.slice(), true],
      getAllowInvalid: () => !g.rejeita,
    } : null;
  }
  function valorVazio_(v) { return v === '' || v === null || v === undefined; }

  function makeSheet(nome) {
    const dados = fixtures[nome];
    if (!dados) {
      // aba que não existe nas fixtures: ler continua dando erro (pra não
      // mascarar fixture faltando), mas ESCREVER cria a aba em memória -
      // igual ss.insertSheet + setValues no Apps Script (23/09/2026:
      // Favoritos.gs cria "Auxiliar_favoritos" no 1º salvamento).
      return {
        getName: () => nome, // 05/10/2026 (A-33: lerAbaUmaVez_ em Planilha.gs chaveia a leitura pelo nome da aba)
        getLastRow: () => (fixtures[nome] ? fixtures[nome].lastRow : 0),
        getMaxRows: () => (fixtures[nome] ? Math.max(1000, fixtures[nome].linhas.length) : 1000), // 05/10/2026 (Lancamentos.gs/Aportes.gs na prévia)
        getLastColumn: () => (fixtures[nome] ? Math.max(0, ...fixtures[nome].linhas.map((l) => (l || []).length)) : 0), // 24/09/2026 (Proventos.gs)
        clearContents() { if (fixtures[nome]) { fixtures[nome].linhas = []; fixtures[nome].lastRow = 0; } }, // 24/09/2026 (FnetProventos.gs)
        getRange(...args) {
          if (fixtures[nome]) return makeSheet(nome).getRange(...args);
          return {
            getValues() { throw new Error('fixture ausente pra aba: ' + nome); },
            getValue() { throw new Error('fixture ausente pra aba: ' + nome); },
            clearContent() {},
            setValues(valores) { fixtures[nome] = { lastRow: 0, linhas: [] }; makeSheet(nome).getRange(...args).setValues(valores); },
          };
        },
      };
    }
    return {
      getName: () => nome, // 05/10/2026 (A-33)
      getLastRow: () => dados.lastRow,
      getMaxRows: () => Math.max(1000, dados.linhas.length), // 05/10/2026 (Lancamentos.gs/Aportes.gs na prévia)
      getLastColumn: () => Math.max(0, ...dados.linhas.map((l) => (l || []).length)), // 24/09/2026 (Proventos.gs)
      clearContents() { dados.linhas = []; dados.lastRow = 0; }, // 24/09/2026 (FnetProventos.gs)
      getRange(a, b, c, d) {
        let row, col, numRows, numCols;
        if (typeof a === 'string') {
          const p = parseA1_(a);
          row = p.row; col = p.col; numRows = p.numRows; numCols = p.numCols;
        } else {
          row = a; col = b; numRows = c ?? 1; numCols = d ?? 1;
        }
        return {
          getValues() {
            const out = [];
            for (let r = 0; r < numRows; r++) {
              const linhaReal = dados.linhas[row - 1 + r] || [];
              out.push(Array.from({ length: numCols }, (_, c2) => linhaReal[col - 1 + c2] ?? ''));
            }
            return out;
          },
          getValue() { const linhaReal = dados.linhas[row - 1] || []; return linhaReal[col - 1] ?? ''; },
          // 07/10/2026: o .xlsx exportado só traz valores - sem fórmula nenhuma (a correção das datas só pula célula COM fórmula)
          getFormulas() { return Array.from({ length: numRows }, () => Array.from({ length: numCols }, () => '')); },
          setNumberFormat() { return this; }, // 05/10/2026: Gastos.gs/Salario.gs formatam colunas como texto (a prévia grava em memória)
          // 23/09/2026 #2: escrita em memória (só pra rodar backfills no
          // harness - nada é gravado em arquivo).
          setValues(valores) {
            valores.forEach((linhaNova, r) => {
              const idx = row - 1 + r;
              while (dados.linhas.length <= idx) dados.linhas.push([]);
              linhaNova.forEach((v, c2) => {
                const g = regraNaCelula_(nome, row + r, col + c2);
                if (g && g.rejeita && !valorVazio_(v) && !g.lista.includes(String(v))) {
                  dados.lastRow = Math.max(dados.lastRow, row + r);
                  const letra = String.fromCharCode(64 + col + c2);
                  throw new Error(`Os dados inseridos na célula ${letra}${row + r} violam o respectivo conjunto de regras de validação de dados. Insira um destes valores: ${g.lista.join(', ')}.`);
                }
                dados.linhas[idx][col - 1 + c2] = v;
              });
            });
            dados.lastRow = Math.max(dados.lastRow, row + valores.length - 1);
          },
          getDataValidations() {
            return Array.from({ length: numRows }, (_, r) => Array.from({ length: numCols }, (_, c2) => objetoRegra_(regraNaCelula_(nome, row + r, col + c2))));
          },
          getDataValidation() { return objetoRegra_(regraNaCelula_(nome, row, col)); },
          getA1Notation() { return `${String.fromCharCode(64 + col)}${row}`; },
          // 06/10/2026 (Controle 17): a sincronização da Carteira Renda Fixa grava célula a célula (setValue) quando a planilha difere do cálculo
          setValue(valor) { this.setValues([[valor]]); return this; },
          clearContent() {
            for (let r = 0; r < numRows; r += 1) {
              const linhaReal = dados.linhas[row - 1 + r];
              if (linhaReal) for (let c2 = 0; c2 < numCols; c2 += 1) linhaReal[col - 1 + c2] = '';
            }
            let ultima = dados.linhas.length;
            while (ultima > 1 && (dados.linhas[ultima - 1] || []).every((v) => v === '' || v == null)) ultima -= 1;
            dados.lastRow = ultima;
          },
        };
      },
    };
  }
  const ss = {
    getSheetByName: (nome) => makeSheet(nome),
    insertSheet: (nome) => { if (!fixtures[nome]) fixtures[nome] = { lastRow: 0, linhas: [] }; return makeSheet(nome); },
    // 07/10/2026: o fuso da PLANILHA (o do .xlsx exportado) - o site grava as datas à meia-noite dele (Planilha.gs!dataNaPlanilha_)
    getSpreadsheetTimeZone: () => FUSO_PLANILHA_XLSX,
  };

  Object.assign(sandbox, {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getActive: () => ss, DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST', VALUE_IN_RANGE: 'VALUE_IN_RANGE' } },
    Session: { getScriptTimeZone: () => FUSO_PROJETO_APPS_SCRIPT },
    CacheService: { getScriptCache: () => scriptCache },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log: (...args) => console.log('[Logger]', ...args) },
    Utilities: {
      // 08/10/2026: etag das respostas (Auth.gs!jsonOut) - mesmo MD5 do Apps Script
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, texto) => [...createHash(alg).update(String(texto), 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (bytes) => Buffer.from((Array.isArray(bytes) ? bytes : [...Buffer.from(String(bytes))]).map((b) => b & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      formatDate: (data, tz, fmt) => {
        if (!(data instanceof sandbox.Date)) return String(data);
        // 23/09/2026: formata no fuso pedido (igual o Utilities real) -
        // antes usava getUTC*, que erra o dia pra qualquer instante entre
        // 21h e 23h59 de SP.
        const p = partesNoFuso_(tz || FUSO_PROJETO_APPS_SCRIPT, data.getTime());
        const dd = String(p.d).padStart(2, '0');
        const mm = String(p.mo).padStart(2, '0');
        const yyyy = p.y;
        if (fmt === 'MM/yyyy') return mm + '/' + yyyy;
        if (fmt === 'dd/MM/yyyy') return dd + '/' + mm + '/' + yyyy;
        // 07/10/2026: os formatos que a correção de datas (Planilha.gs) usa
        const hh = String(p.h).padStart(2, '0'), mi = String(p.mi).padStart(2, '0'), ss2 = String(p.s).padStart(2, '0');
        if (fmt === 'yyyy-MM-dd') return yyyy + '-' + mm + '-' + dd;
        if (fmt === 'HH:mm:ss') return hh + ':' + mi + ':' + ss2;
        if (fmt === 'HH:mm') return hh + ':' + mi;
        return data.toISOString();
      },
      // 07/10/2026: igual ao Utilities.parseDate real - o texto é um relógio no fuso `tz` (meia-noite de 'yyyy-MM-dd' no fuso pedido)
      parseDate: (texto, tz, fmt) => {
        const m = String(texto).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m || fmt !== 'yyyy-MM-dd') throw new Error('parseDate falso: só yyyy-MM-dd (' + texto + ' / ' + fmt + ')');
        return new sandbox.Date(relogioNoFusoParaUtcMs_(tz || FUSO_PROJETO_APPS_SCRIPT, +m[1], +m[2], +m[3], 0, 0, 0));
      },
    },
    // 05/10/2026 (A-35/A-36/A-37): Properties de verdade (em memória) - o carimbo de escrita e a geração de cache
    // dependem de ler o que foi gravado; antes setProperty era um no-op e getProperty sempre null.
    PropertiesService: { getScriptProperties: () => propriedadesFalsas },
    UrlFetchApp: criarUrlFetchAppFake_(fixturesRaw),
    // 23/09/2026: só pra handleHome (Home.gs) poder rodar INTEIRO no
    // harness - jsonOut (Auth.gs) embrulha a resposta num TextOutput; aqui
    // o "TextOutput" só guarda o texto pra carregarRespostaHomeComDadosReais
    // devolver o mesmo JSON que o app recebe.
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (texto) => ({ texto, setMimeType() { return this; }, getContent() { return this.texto; } }),
    },
  });

  return sandbox;
}

/**
 * 06/10/2026 (A-75): monta o sandbox (planilha falsa + todos os .gs) - o trecho que os 3 carregar*ComDadosReais e a
 * prévia repetiam. `agora` (ms ou ISO): congela o relógio dos .gs. `silencioso`: console.log dos .gs some.
 */
export function criarSandboxGs({ gasDir = GAS_DIR, fixturesPath = FIXTURES_PATH, agora = null, silencioso = false } = {}) {
  const fixturesRaw = lerFixturesRaw_(fixturesPath);
  const sandbox = { console: silencioso ? { ...console, log() {} } : console };
  vm.createContext(sandbox);
  if (agora != null) {
    new vm.Script('this.Date = Date;').runInContext(sandbox);
    congelarRelogioSandbox_(sandbox, typeof agora === 'number' ? agora : Date.parse(agora));
  }
  montarSandboxComFixtures_(fixturesRaw, sandbox);
  const arquivos = fs.readdirSync(gasDir).filter((f) => f.endsWith('.gs')).sort();
  for (const f of arquivos) new vm.Script(fs.readFileSync(path.join(gasDir, f), 'utf8'), { filename: f }).runInContext(sandbox);
  return { sandbox, fixturesRaw, arquivos };
}

/** Quando fixtures.json foi extraído da planilha (ms) - o "agora" dos testes de coerência. */
export function instanteDasFixtures(fixturesPath = FIXTURES_PATH) {
  const meta = lerFixturesRaw_(fixturesPath)._meta || {};
  const t = Date.parse(meta.extraidoEm || '');
  return Number.isFinite(t) ? t : fs.statSync(fixturesPath).mtimeMs;
}

export async function carregarSerieComDadosReais({ gasDir = GAS_DIR, fixturesPath = FIXTURES_PATH } = {}) {
  const { sandbox, arquivos } = criarSandboxGs({ gasDir, fixturesPath });
  const serie = sandbox.montarSerieHistoricoInicio_();
  return { serie, sandbox, arquivosCarregados: arquivos };
}

/**
 * 20/09/2026: roda as funções LIVE por trás das telas de Carteiras (as
 * mesmas que a rota real chama a cada request - nunca cacheadas/
 * backfilladas) contra os MESMOS fixtures, e devolve tudo junto com
 * `serie` (o histórico backfillado que os gráficos de "Evolução do
 * patrimônio" plotam) - pra comparar as duas fontes com dados de verdade.
 * Reaproveita o MESMO sandbox/fixtures/.gs carregados 1 vez só (todas as
 * telas de Carteiras + Início compartilham o mesmo namespace global, tal
 * qual o Apps Script real).
 */
export async function carregarCarteirasComDadosReais({ gasDir = GAS_DIR, fixturesPath = FIXTURES_PATH } = {}) {
  const { sandbox, arquivos } = criarSandboxGs({ gasDir, fixturesPath });
  const serie = sandbox.montarSerieHistoricoInicio_();
  const home = sandbox.montarHome_();
  const carteirasHome = sandbox.montarCarteirasHome_();
  const carteirasAcoes = sandbox.montarCarteirasAcoes_();
  const carteirasFiis = sandbox.montarCarteirasFiis_();
  const carteirasAcoesEua = sandbox.montarCarteirasAcoesEua_();
  const carteirasRendaFixa = sandbox.montarCarteirasRendaFixa_();

  return { serie, home, carteirasHome, carteirasAcoes, carteirasFiis, carteirasAcoesEua, carteirasRendaFixa, sandbox, arquivosCarregados: arquivos };
}

/**
 * 23/09/2026 (pedido do Tiago: "inclua nesses testes o resultado que
 * apresenta esses gráficos e heroes de todas as telas"): roda handleHome
 * (Home.gs) INTEIRO, tal qual a rota real `action=home` - a MESMA resposta
 * que TODAS as telas (Início + as 5 de Carteiras) recebem via getHome():
 * série histórica + último ponto trocado pelos valores ao vivo
 * (sincronizarUltimoPontoHistoricoComAoVivo_) + patrimônio ao vivo. Junto,
 * as respostas das rotas próprias de cada tela de Carteiras. Nada é
 * remontado "à mão" aqui - se handleHome mudar, isso muda junto.
 */
// 06/10/2026 (A-75): `compartilhar: true` devolve o MESMO resultado a quem pedir de novo no processo (1 sandbox em vez de N);
// só use em teste que apenas LÊ o resultado (não chama função do sandbox que grava/muda a planilha falsa).
const _telasCompartilhadas_ = new Map();
export async function carregarTodasAsTelasComDadosReais({ gasDir = GAS_DIR, fixturesPath = FIXTURES_PATH, compartilhar = false, agora = null } = {}) {
  const chaveCompartilhada = `${gasDir}|${fixturesPath}|${agora}`;
  if (compartilhar && _telasCompartilhadas_.has(chaveCompartilhada)) return _telasCompartilhadas_.get(chaveCompartilhada);
  const pronta = await carregarTodasAsTelasComDadosReais_({ gasDir, fixturesPath, agora });
  if (compartilhar) _telasCompartilhadas_.set(chaveCompartilhada, pronta);
  return pronta;
}
async function carregarTodasAsTelasComDadosReais_({ gasDir, fixturesPath, agora }) {
  const { sandbox, fixturesRaw } = criarSandboxGs({ gasDir, fixturesPath, agora, silencioso: true });
  const home = JSON.parse(sandbox.handleHome({ parameter: {} }, { ok: true }).getContent());
  return {
    home,
    diagnosticoRv: JSON.parse(JSON.stringify(sandbox.ULTIMO_DIAGNOSTICO_RV_INICIO_ || {})),
    diagnosticoRf: JSON.parse(JSON.stringify(sandbox.ULTIMO_DIAGNOSTICO_RF_INICIO_ || {})),
    diagnosticoTaxas: JSON.parse(JSON.stringify(sandbox.ULTIMO_DIAGNOSTICO_TAXAS_INICIO_ || {})),
    carteirasHome: sandbox.montarCarteirasHome_(),
    carteirasAcoes: sandbox.montarCarteirasAcoes_(),
    carteirasFiis: sandbox.montarCarteirasFiis_(),
    carteirasAcoesEua: sandbox.montarCarteirasAcoesEua_(),
    carteirasRendaFixa: sandbox.montarCarteirasRendaFixa_(),
    fixtures: fixturesRaw,
    sandbox,
  };
}

// --- CLI: roda um diagnóstico completo quando chamado direto (não quando importado por um teste) ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const { serie, arquivosCarregados } = await carregarSerieComDadosReais();
  console.log('Arquivos .gs carregados:', arquivosCarregados.length, '| dias na série:', serie.length);
  if (serie.length === 0) { console.log('SERIE VAZIA'); process.exit(1); }

  const inicioMod = await import(INICIO_JS_PATH);
  const { filtrarHistoricoPorPeriodo, normalizarSerieRentabilidade, CAMPO_PRINCIPAL_POR_VISAO, CAMPO_FLUXO_POR_VISAO } = inicioMod;
  const ultimoValido = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (typeof arr[i] === 'number' && Number.isFinite(arr[i])) return arr[i]; return null; };

  console.log('\n=== Cartões de Rentabilidade (front-end real) ===');
  for (const visaoId of Object.keys(CAMPO_PRINCIPAL_POR_VISAO)) {
    const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId];
    const campoFluxo = CAMPO_FLUXO_POR_VISAO[visaoId];
    for (const periodoId of ['mes', 'tudo']) {
      const janela = filtrarHistoricoPorPeriodo(serie, periodoId, campo);
      if (janela.length < 2) continue;
      const pPrincipal = ultimoValido(normalizarSerieRentabilidade(janela, campo, campoFluxo));
      const pCdi = ultimoValido(normalizarSerieRentabilidade(janela, 'indiceCdi'));
      const suspeito = (pPrincipal != null && (pPrincipal <= -50 || pPrincipal >= 500)) ? '  <<< SUSPEITO' : '';
      console.log(`${visaoId.padEnd(24)} periodo=${periodoId.padEnd(5)} janela=${String(janela.length).padStart(5)}d  Portfolio=${pPrincipal?.toFixed(2)}%  CDI=${pCdi?.toFixed(2)}%${suspeito}`);
    }
  }

  if (process.argv.includes('--worst-days')) {
    console.log('\n=== Piores dias de retorno diário (TWR), por visão ===');
    const CASOS = Object.entries(CAMPO_PRINCIPAL_POR_VISAO).map(([visaoId, campo]) => [campo, CAMPO_FLUXO_POR_VISAO[visaoId], visaoId]);
    for (const [campo, campoFluxo, label] of CASOS) {
      let idxBase = -1, anterior = null;
      for (let i = 0; i < serie.length; i++) {
        const v = serie[i][campo];
        if (typeof v === 'number' && Number.isFinite(v) && v !== 0) { idxBase = i; anterior = v; break; }
      }
      if (idxBase === -1) continue;
      let cumulativo = 0;
      const piores = [];
      for (let i = idxBase + 1; i < serie.length; i++) {
        const v = serie[i][campo];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (anterior) {
          const fluxo = serie[i][campoFluxo] || 0;
          const retornoDia = (v - fluxo) / anterior - 1;
          cumulativo = (1 + cumulativo) * (1 + retornoDia) - 1;
          piores.push({ data: serie[i].data, v, fluxo, anterior, retornoDia: +retornoDia.toFixed(4), cumulativo: +(cumulativo * 100).toFixed(2) });
        }
        anterior = v;
      }
      piores.sort((a, b) => a.retornoDia - b.retornoDia);
      console.log(`\n--- ${label} --- cumulativo final: ${(cumulativo * 100).toFixed(2)}%`);
      piores.slice(0, 3).forEach((p) => console.log('  ', p));
    }
  }
}
