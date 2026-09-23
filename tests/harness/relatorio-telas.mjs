// tests/harness/relatorio-telas.mjs
//
// 23/09/2026 #4 (pedido do Tiago: "deixa já programado os testes que
// sempre gere todas essas tabelas e valores do html, e faça o check
// inteligente de que os valores estão batendo e de acordo... quero que
// isso sempre seja gerado e atualizado, e testes rodados, quando faço
// alguma modificação no código").
//
// Monta TODAS as telas de verdade (Início, Carteiras > Visão geral e as 4
// subpáginas - o código do app rodando sobre fixtures.json, igual
// telas-heroes-graficos.test.js), lê o que cada uma mostra, recalcula tudo
// com um oráculo independente escrito aqui e gera:
//   tests/harness/relatorio/conferencia-telas.html  (o relatório)
//   tests/harness/relatorio/conferencia-telas.json  (os números, pra
//     comparar com a próxima geração - seção "O que mudou")
// A pasta relatorio/ é gitignored: tem dado financeiro real.
//
// Quem chama: relatorio-telas.test.js (todo `npm test`), verificar.mjs
// (`npm run verificar`, o gancho de pre-commit e `npm run vigiar`) ou
// direto: `node tests/harness/relatorio-telas.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { carregarTodasAsTelasComDadosReais, relogioNoFusoParaUtcMs_, FUSO_PLANILHA_XLSX } from './gas-vm-harness.mjs';
import { verificarQualidadeDados } from './qualidade-dados.mjs';
import { gerarHtmlRelatorio } from './relatorio-telas-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
export const SAIDA_DIR = path.join(__dirname, 'relatorio');
const REF_PATH = path.join(__dirname, 'referencias-externas.local.json');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

export const PERIODOS = ['mes', '30d', '6m', '12m', '3a', 'tudo'];
export const VISOES_INICIO = ['total', 'longoPrazo', 'nacional', 'rendaEmergencial'];
export const VISOES_CLASSE = ['carteiraAcoes', 'carteiraFiis', 'carteiraAcoesEua', 'carteiraRendaFixaTotal', 'carteiraRendaFixaLongoPrazo', 'carteiraRendaFixaEmergencial'];
export const NOMES_VISAO = {
  total: 'Patrimônio total', longoPrazo: 'Longo Prazo', nacional: 'Patrimônio Nacional', rendaEmergencial: 'Renda Emergencial',
  carteiraAcoes: 'Ações', carteiraFiis: 'FIIs', carteiraAcoesEua: 'Ações EUA', carteiraRendaFixaTotal: 'Renda Fixa · total',
  carteiraRendaFixaLongoPrazo: 'Renda Fixa · longo prazo', carteiraRendaFixaEmergencial: 'Renda Fixa · reserva de emergência',
};
export const NOMES_PERIODO = { mes: 'Mês', '30d': '30 dias', '6m': '6 meses', '12m': '12 meses', '3a': '3 anos', tudo: 'Desde o início' };
// Benchmarks de cada visão - escritos aqui de novo de propósito (não
// importados do app): se o app trocar um benchmark sem querer, a
// checagem da legenda acusa.
export const BENCHMARKS = {
  total: ['ibovespa', 'indiceCdi'], longoPrazo: ['ibovespa', 'indiceCdi'], nacional: ['ibovespa', 'indiceCdi'], rendaEmergencial: ['indiceCdi', 'indiceSelic'],
  carteiraAcoes: ['ibovespa', 'indiceCdi'], carteiraFiis: ['ifix', 'indiceCdi'], carteiraAcoesEua: ['ibovespa', 'sp500'],
  carteiraRendaFixaTotal: ['indiceCdi', 'indiceIpca'], carteiraRendaFixaLongoPrazo: ['indiceCdi', 'indiceIpca'], carteiraRendaFixaEmergencial: ['indiceCdi', 'indiceIpca'],
};
const CAMPOS = {
  total: ['patrimonio', 'fluxoCaixaPatrimonio', 'fluxoAplicadoPatrimonio'],
  longoPrazo: ['longoPrazo', 'fluxoCaixaLongoPrazo', 'fluxoAplicadoLongoPrazo'],
  nacional: ['nacional', 'fluxoCaixaNacional', 'fluxoAplicadoNacional'],
  rendaEmergencial: ['rendaEmergencial', 'fluxoCaixaRendaEmergencial', 'fluxoAplicadoRendaEmergencial'],
  carteiraAcoes: ['acoes', 'fluxoCaixaAcoes', 'fluxoAplicadoAcoes'],
  carteiraFiis: ['fiis', 'fluxoCaixaFiis', 'fluxoAplicadoFiis'],
  carteiraAcoesEua: ['acoesEua', 'fluxoCaixaAcoesEua', 'fluxoAplicadoAcoesEua'],
  carteiraRendaFixaTotal: ['rendaFixaTotal', 'fluxoCaixaRendaFixaTotal', 'fluxoAplicadoRendaFixaTotal'],
  carteiraRendaFixaLongoPrazo: ['rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo', 'fluxoAplicadoRendaFixaLongoPrazo'],
  carteiraRendaFixaEmergencial: ['rendaEmergencial', 'fluxoCaixaRendaEmergencial', 'fluxoAplicadoRendaEmergencial'],
};
const TODAS = [...VISOES_INICIO, ...VISOES_CLASSE];

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const fmtSp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtSpHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const dbr = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
function utcMsDeCelula(cel) {
  const m = cel.__date__.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  return relogioNoFusoParaUtcMs_(FUSO_PLANILHA_XLSX, +m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
}
const chaveSp = (cel) => fmtSp.format(new Date(utcMsDeCelula(cel)));
function lerBRL(t) {
  const m = String(t).match(/([-−])?\s*R\$\s*([-−])?([\d.]+,\d{2})/);
  if (!m) return null;
  const v = Number(m[3].replace(/\./g, '').replace(',', '.'));
  return (m[1] || m[2]) ? -v : v;
}
function lerPct(t) {
  const m = String(t).match(/([+\-−]?)(\d{1,3}(?:\.\d{3})*,\d+)%/);
  if (!m) return null;
  const v = Number(m[2].replace(/\./g, '').replace(',', '.'));
  return (m[1] === '-' || m[1] === '−') ? -v : v;
}
function lerDelta(t) {
  const m = String(t).match(/([+\-−])R\$\s*([\d.]+,\d{2})\s+([+\-−]?[\d.]+,\d+)%/);
  if (!m) return null;
  return { ganho: Number(m[2].replace(/\./g, '').replace(',', '.')) * (m[1] === '+' ? 1 : -1), pct: lerPct(m[3] + '%') };
}
const texto = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

// ---------------------------------------------------------------------------
// oráculo independente (não importa nada do app)
// ---------------------------------------------------------------------------
function janela(s, periodo, campo) {
  if (periodo === 'mes') {
    const am = s[s.length - 1].data.slice(0, 7);
    const i = s.findIndex((x) => x.data.slice(0, 7) === am);
    return s.slice(Math.max(0, i - 1));
  }
  const d = { '30d': 30, '6m': 182, '12m': 365, '3a': 1095 }[periodo];
  if (d) return s.slice(-(d + 1));
  const i = s.findIndex((x) => num(x[campo]) && x[campo] !== 0);
  return s.slice(Math.max(0, i));
}
/** TWR + ganho em R$. Janela que começa no dia em que a visão nasceu
 * ("abertura"): a base é o custo aplicado nesse dia, não o fechamento. */
function twr(s, j, campo, fl) {
  const i0 = j.findIndex((x) => num(x[campo]) && x[campo] !== 0);
  if (i0 < 0) return null;
  let a = 1, ant = j[i0][campo], sf = 0, ult = ant, mn = ant, mx = ant, entradas = 0, saidas = 0, abertura = false;
  const pos = s.indexOf(j[i0]);
  const antes = pos > 0 ? num(s[pos - 1][campo]) : null;
  const f0 = num(j[i0][fl]);
  if (!antes && f0 > 0 && ant / f0 >= 0.5 && ant / f0 <= 2) { a = ant / f0; sf = f0 - ant; abertura = true; entradas += f0; }
  for (let i = i0 + 1; i < j.length; i += 1) {
    const v = num(j[i][campo]);
    if (v == null) continue;
    const f = num(j[i][fl]) || 0;
    sf += f;
    if (f > 0) entradas += f; else saidas += f;
    if (ant) a *= (v - f) / ant;
    ant = v; ult = v; mn = Math.min(mn, v); mx = Math.max(mx, v);
  }
  return {
    pct: (a - 1) * 100, ganho: ult - j[i0][campo] - sf, base: abertura ? 0 : j[i0][campo],
    baseData: abertura && pos > 0 ? s[pos - 1].data : j[i0].data, nascimento: j[i0].data,
    fim: ult, fimData: j[j.length - 1].data, entradas, saidas, min: mn, max: mx, abertura, i0,
  };
}
function retBench(j, c) {
  const jb = j.filter((x) => num(x[c]));
  if (jb.length < 2) return null;
  return (jb[jb.length - 1][c] / jb[0][c] - 1) * 100;
}

// ---------------------------------------------------------------------------
// coleta
// ---------------------------------------------------------------------------
export async function coletarDadosTelas({ fixturesPath = FIXTURES_PATH } = {}) {
  const r = await carregarTodasAsTelasComDadosReais({ fixturesPath });
  const I = await imp('assets/js/pages/inicio.js');
  const CC = await imp('assets/js/pages/carteiras-classe-comum.js');
  const home = r.home, s = home.historico, p = home.patrimonio, u = s[s.length - 1];
  const vivo = {
    total: p.total, longoPrazo: p.longoPrazo, nacional: p.nacional, rendaEmergencial: p.rendaEmergencial,
    carteiraAcoes: p.porClasse.acoes, carteiraFiis: p.porClasse.fiis, carteiraAcoesEua: p.porClasse.acoesEua,
    carteiraRendaFixaTotal: p.porClasse.rendaFixa, carteiraRendaFixaLongoPrazo: p.porClasse.rendaFixa - p.rendaEmergencial,
    carteiraRendaFixaEmergencial: p.rendaEmergencial,
  };

  // --- de onde vieram os dados ---
  let ultimoSyncMs = 0;
  for (const l of (r.fixtures['aux_historico-patrimonio']?.linhas || []).slice(1)) {
    if (l[0] && l[0].__date__) ultimoSyncMs = Math.max(ultimoSyncMs, utcMsDeCelula(l[0]));
  }
  let ultimaTransacao = '';
  for (const aba of ['Transações', 'Transações - USA', 'Transações Renda Fixa']) {
    for (const l of (r.fixtures[aba]?.linhas || []).slice(1)) {
      if (l[0] && l[1] && l[1].__date__) { const k = chaveSp(l[1]); if (k > ultimaTransacao) ultimaTransacao = k; }
    }
  }
  const metaFix = r.fixtures._meta || {};
  const meta = {
    geradoEm: fmtSpHora.format(new Date()),
    geradoEmIso: new Date().toISOString(),
    hoje: u.data,
    planilha: metaFix.arquivo || null,
    arquivoModificadoEm: metaFix.arquivoModificadoEm ? fmtSpHora.format(new Date(metaFix.arquivoModificadoEm)) : null,
    extraidoEm: metaFix.extraidoEm ? fmtSpHora.format(new Date(metaFix.extraidoEm)) : fmtSpHora.format(fs.statSync(fixturesPath).mtime),
    ultimoSyncPrecos: ultimoSyncMs ? fmtSpHora.format(new Date(ultimoSyncMs)) : null,
    ultimoSyncDia: ultimoSyncMs ? fmtSp.format(new Date(ultimoSyncMs)) : null,
    ultimaTransacao,
    diasNaSerie: s.length,
    primeiroDia: s[0].data,
  };

  // --- cada visão × período: oráculo + função do app + evolução ---
  const visoes = {};
  for (const v of TODAS) {
    const [campo, fl, fa] = CAMPOS[v];
    const acum = CC.comHistoricoAcumuladoClasse_(s, fa);
    visoes[v] = {};
    for (const per of PERIODOS) {
      const j = janela(s, per, campo);
      const o = twr(s, j, campo, fl);
      if (!o) continue;
      const jNasc = j.slice(o.i0);
      const app = I.calcularResumoRentabilidade(p, s, { visaoId: v, periodoId: per });
      const ja = I.filtrarHistoricoPorPeriodo(acum, per, campo);
      const sinalOk = Math.abs(o.ganho) < 1 || Math.abs(o.pct) < 0.02 || Math.sign(o.ganho) === Math.sign(o.pct);
      let metades = null;
      if (!sinalOk) {
        const m = o.i0 + Math.floor((j.length - o.i0) / 2);
        const h1 = twr(s, j.slice(o.i0, m + 1), campo, fl), h2 = twr(s, j.slice(m), campo, fl);
        metades = [{ ate: j[m].data, pct: r2(h1.pct), ganho: r2(h1.ganho) }, { de: j[m].data, pct: r2(h2.pct), ganho: r2(h2.ganho) }];
      }
      visoes[v][per] = {
        pct: r2(o.pct), ganho: r2(o.ganho), base: r2(o.base), baseData: o.baseData, nascimento: o.nascimento, abertura: o.abertura,
        fim: r2(o.fim), fimData: o.fimData, entradas: r2(o.entradas), saidas: r2(o.saidas), min: r2(o.min), max: r2(o.max),
        pctExato: o.pct, ganhoExato: o.ganho,
        app: { pct: app.percentual, ganho: app.ganhoReais },
        bench: BENCHMARKS[v].map((c) => { const ret = retBench(jNasc, c); return { campo: c, ret: r2(ret), diff: ret == null ? null : r2(r2(o.pct) - ret) }; }),
        evolucao: ja.length ? {
          ini: ja[0].data, fim: ja[ja.length - 1].data, valorIni: r2(ja[0][campo]), valorFim: r2(ja[ja.length - 1][campo]),
          aplicadoIni: r2(ja[0].investidoAcumulado), aplicadoFim: r2(ja[ja.length - 1].investidoAcumulado),
        } : null,
        sinalOk, metades,
      };
    }
  }

  // --- somas entre painéis (mesma janela do Total) ---
  const somas = {};
  for (const per of PERIODOS) {
    const j = janela(s, per, 'patrimonio');
    const g = (c, f) => j[j.length - 1][c] - j[0][c] - j.slice(1).reduce((q, x) => q + (x[f] || 0), 0);
    somas[per] = {
      total: g('patrimonio', 'fluxoCaixaPatrimonio'), longoPrazo: g('longoPrazo', 'fluxoCaixaLongoPrazo'), emerg: g('rendaEmergencial', 'fluxoCaixaRendaEmergencial'),
      nacional: g('nacional', 'fluxoCaixaNacional'), eua: g('acoesEua', 'fluxoCaixaAcoesEua'), acoes: g('acoes', 'fluxoCaixaAcoes'),
      fiis: g('fiis', 'fluxoCaixaFiis'), rfLp: g('rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo'), rfTotal: g('rendaFixaTotal', 'fluxoCaixaRendaFixaTotal'),
    };
  }

  // --- maiores dias ---
  const maioresDias = {};
  for (const v of TODAS) {
    const [campo, fl] = CAMPOS[v];
    const ds = [];
    let ant = null;
    for (const x of s) {
      const val = num(x[campo]);
      if (val == null) continue;
      if (ant) ds.push({ d: x.data, r: r2(((val - (x[fl] || 0)) / ant - 1) * 100), ganho: r2(val - (x[fl] || 0) - ant) });
      ant = val !== 0 ? val : null;
    }
    ds.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    maioresDias[v] = ds.slice(0, 5);
  }

  // --- somas de campos do histórico ---
  const somaCampo = (c) => s.reduce((a, x) => a + (num(x[c]) || 0), 0);
  const aplicado = Object.fromEntries(TODAS.map((v) => [v, somaCampo(CAMPOS[v][2])]));
  const entrou = Object.fromEntries(TODAS.map((v) => [v, somaCampo(CAMPOS[v][1])]));

  // --- proventos direto da aba (oráculo): FII = código terminado em 11; "ERRO" = cupom de Tesouro ---
  const proventosAba = { acoes: 0, fiis: 0, porTicker: {} };
  for (const l of (r.fixtures['Proventos']?.linhas || []).slice(7)) {
    const tk = String(l[2] || '').trim().toUpperCase();
    if (!tk || !l[1] || !l[1].__date__ || typeof l[6] !== 'number') continue;
    if (chaveSp(l[1]) > u.data || tk === 'ERRO') continue;
    proventosAba[/11$/.test(tk) ? 'fiis' : 'acoes'] += l[6];
    proventosAba.porTicker[tk] = (proventosAba.porTicker[tk] || 0) + l[6];
  }
  // lucro realizado nas vendas (coluna L de "Transações", calculada pela planilha)
  const foraHist = new Set(r.sandbox.TICKERS_FORA_DO_HISTORICO || []);
  const realizadoAba = { acoes: 0, fiis: 0 };
  for (const l of (r.fixtures['Transações']?.linhas || []).slice(6)) {
    const tk = String(l[0] || '').trim().toUpperCase();
    if (!tk || l[2] !== 'Venda' || foraHist.has(tk) || typeof l[11] !== 'number') continue;
    realizadoAba[/11$/.test(tk) ? 'fiis' : 'acoes'] += l[11];
  }
  const tickersCarteira = new Set([...r.carteirasAcoes.ativos, ...r.carteirasFiis.ativos].map((a) => a.ticker));
  const proventosForaDaCarteira = Object.entries(proventosAba.porTicker).filter(([tk]) => !tickersCarteira.has(tk)).map(([tk, v]) => ({ ticker: tk, valor: r2(v) }));

  // --- maiores variações de preço no mês por ticker (explica o mês) ---
  const baseMes = janela(s, 'mes', 'patrimonio')[0].data;
  const corr = {};
  for (const c of r.diagnosticoRv.correcoesPreco || []) (corr[c.ticker] = corr[c.ticker] || []).push(c);
  for (const tk of Object.keys(corr)) corr[tk].sort((a, b) => (a.ate < b.ate ? -1 : 1));
  const fator = (tk, dia) => { for (const c of corr[tk] || []) if (dia < c.ate) return c.fator; return 1; };
  const precoBase = {};
  for (const l of (r.fixtures['aux_historico-patrimonio']?.linhas || []).slice(1)) {
    if (!l[0] || !l[0].__date__ || typeof l[4] !== 'number') continue;
    const k = chaveSp(l[0]);
    if (k > baseMes) continue;
    if (!precoBase[l[1]] || precoBase[l[1]].dia <= k) precoBase[l[1]] = { dia: k, preco: l[4] * fator(l[1], k), cambio: num(l[6]) || 1 };
  }
  const qtdBase = {};
  for (const aba of ['Transações', 'Transações - USA']) {
    for (const l of (r.fixtures[aba]?.linhas || []).slice(6)) {
      const tk = String(l[0] || '').trim().toUpperCase();
      if (!tk || !l[1] || !l[1].__date__ || typeof l[10] !== 'number') continue;
      if (chaveSp(l[1]) <= baseMes) qtdBase[tk] = (qtdBase[tk] || 0) + l[10];
    }
  }
  const moversMes = {};
  for (const [classe, lista, eua] of [['carteiraAcoes', r.carteirasAcoes.ativos, false], ['carteiraFiis', r.carteirasFiis.ativos, false], ['carteiraAcoesEua', r.carteirasAcoesEua.ativos, true]]) {
    moversMes[classe] = (lista || []).map((a) => {
      const b = precoBase[a.ticker];
      const q = qtdBase[a.ticker] || 0;
      if (!b || !q || !num(a.precoAtual)) return null;
      const hojeBrl = a.precoAtual * (eua ? home.cambio.usd : 1);
      const baseBrl = b.preco * (eua ? b.cambio : 1);
      return { ticker: a.ticker, precoBase: r2(b.preco), precoHoje: r2(a.precoAtual), varPreco: r2((a.precoAtual / b.preco - 1) * 100), reais: r2(q * (hojeBrl - baseBrl)) };
    }).filter(Boolean).sort((a, b) => Math.abs(b.reais) - Math.abs(a.reais)).slice(0, 4);
  }
  const tkEua = (r.carteirasAcoesEua.ativos || []).map((a) => a.ticker).find((tk) => precoBase[tk]);
  const cambioMes = { base: tkEua ? precoBase[tkEua].cambio : null, hoje: home.cambio.usd };

  // --- telas de verdade (DOM) ---
  const telas = await lerTelas(r, I);

  // --- ontem era (oráculo) ---
  let ontem = null;
  for (let i = s.length - 2; i >= 0; i -= 1) if (s[i].pregao) { ontem = s[i]; break; }
  const ajRf = u.ajusteMarcacaoRendaFixa || 0, ajRe = u.ajusteMarcacaoRendaEmergencial || 0;
  const ontemOraculo = ontem ? {
    data: ontem.data, total: ontem.patrimonio + ajRf, longoPrazo: ontem.longoPrazo + ajRf - ajRe,
    nacional: ontem.nacional + ajRf - ajRe, rendaEmergencial: ontem.rendaEmergencial + ajRe,
  } : null;

  // --- referência externa (Gorila), se existir ---
  const ref = fs.existsSync(REF_PATH) ? JSON.parse(fs.readFileSync(REF_PATH, 'utf8')) : null;

  const dados = {
    meta, vivo, visoes, somas, maioresDias, aplicado, entrou, proventosAba, realizadoAba, proventosForaDaCarteira, moversMes, cambioMes, baseMes, telas, ontemOraculo,
    ajusteRf: u.ajusteMarcacaoRendaFixa || 0, ajusteRe: u.ajusteMarcacaoRendaEmergencial || 0,
    patrimonio: p, cambio: home.cambio,
    diag: { correcoesPreco: r.diagnosticoRv.correcoesPreco || [] },
    gorila: ref?.gorila || null,
    qualidade: verificarQualidadeDados(r),
  };
  dados.checagens = checar(dados, s, p, u);
  return dados;
}

// ---------------------------------------------------------------------------
// telas (JSDOM) - o que cada tela mostra de fato
// ---------------------------------------------------------------------------
function domCarteiras() {
  const html = fs.readFileSync(path.join(ROOT, 'carteiras', 'index.html'), 'utf8');
  const corpo = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
  const dom = new JSDOM(`<!doctype html><html>${corpo.replace(/<script[\s\S]*?<\/script>/g, '')}</body></html>`);
  return { dom, doc: dom.window.document };
}
function clicar(dom, doc, seletor) {
  const b = doc.querySelector(seletor);
  if (!b) return false;
  b.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  return true;
}
function legenda(doc, id) {
  return [...doc.querySelectorAll(`#${id} .li`)]
    .map((e) => ({ texto: texto(e), delta: e.querySelector('.li-delta') ? lerPct(e.querySelector('.li-delta').textContent) : null }))
    .filter((x) => x.texto !== 'Portfólio');
}

async function lerTelas(r, I) {
  const home = r.home;
  const telas = { inicio: { cards: [], rentab: {} }, vg: { porPeriodo: {} }, sub: {} };

  // Início
  {
    const html = fs.readFileSync(path.join(ROOT, 'assets', 'partials', 'pages.html'), 'utf8');
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const doc = dom.window.document;
    doc.body.append(doc.getElementById('page-inicio-template').content.cloneNode(true));
    await I.montarPaginaInicio('t', { doc, getHomeImpl: async () => home });
    telas.inicio.cards = [...doc.querySelectorAll('#resumoPatrimonio .resumo-card')].map((c) => {
      const tOntem = c.querySelector('.resumo-ontem').textContent;
      const distrib = c.querySelector('.resumo-distrib');
      return {
        label: texto(c.querySelector('.resumo-label')),
        valor: lerBRL(c.querySelector('.resumo-value').textContent),
        ontem: lerBRL(tOntem),
        varPct: lerPct(tOntem.slice(tOntem.lastIndexOf(' - '))),
        fatias: distrib ? [...distrib.textContent.matchAll(/R\$\s*[\d.]+,\d{2}/g)].map((m) => lerBRL(m[0])) : [],
        distribTexto: texto(distrib).replace(/ i( |$)/g, ' · ').replace(/ · $/, ''),
      };
    });
    for (const per of PERIODOS) {
      clicar(dom, doc, `#periodoTabs .filter-tab[data-periodo="${per}"]`);
      telas.inicio.rentab[per] = {};
      for (const [v, suf] of [['total', 'Total'], ['longoPrazo', 'LongoPrazo'], ['nacional', 'Nacional'], ['rendaEmergencial', 'RendaEmergencial']]) {
        const info = doc.getElementById('rentabInfo' + suf);
        const d = lerDelta(info.querySelector('.rentab-card-delta').textContent);
        telas.inicio.rentab[per][v] = { valor: lerBRL(info.querySelector('.rentab-card-value').textContent), ganho: d ? d.ganho : null, pct: d ? d.pct : null, legenda: legenda(doc, 'rentabLegenda' + suf) };
      }
    }
    dom.window.close();
  }

  // Visão geral
  {
    const VG = await imp('assets/js/pages/carteiras-visao-geral.js');
    const { dom, doc } = domCarteiras();
    await VG.montarPaginaCarteirasVisaoGeral('t', { doc, getCarteirasHomeImpl: async () => ({ ok: true, carteiras: r.carteirasHome }), getHomeImpl: async () => home });
    const resumo = texto(doc.getElementById('vgResumo'));
    const valoresHero = [...resumo.matchAll(/[+\-−]?R\$\s*[\d.]+,\d{2}/g)].map((m) => lerBRL(m[0]));
    telas.vg.patrimonio = lerBRL(doc.getElementById('vgPatrimonioTotal').textContent);
    telas.vg.resumoTexto = resumo;
    telas.vg.aplicado = valoresHero[0];
    telas.vg.resultado = valoresHero[1];
    telas.vg.rentabilidade = lerPct(resumo.slice(resumo.indexOf('Rentabilidade')));
    telas.vg.cards = [...doc.querySelectorAll('#vgCardsGrid .cg-card')].map((c) => {
      const spans = [...(c.querySelector('.cg-card-linha')?.querySelectorAll('span') || [])];
      return {
        nome: texto(c.querySelector('.cg-card-nome')),
        valor: lerBRL(c.querySelector('.cg-card-valor').textContent),
        aplicado: lerBRL(spans[0] ? spans[0].textContent : ''),
        lucro: lerBRL(spans[1] ? spans[1].textContent : ''),
        pct: lerPct(c.querySelector('.cg-card-rentab').textContent),
        rotulo: texto(spans[0]).split(':')[0],
      };
    });
    for (const per of PERIODOS) {
      if (!clicar(dom, doc, `#vgPeriodoTabs .filter-tab[data-periodo="${per}"]`)) continue;
      const d = lerDelta(doc.getElementById('vgInfoRentabilidade').textContent);
      telas.vg.porPeriodo[per] = { ganho: d ? d.ganho : null, pct: d ? d.pct : null, legenda: legenda(doc, 'vgRentabLegenda') };
    }
    dom.window.close();
  }

  // subpáginas
  const PAGS = [
    ['acoes', 'carteiras-acoes.js', 'montarPaginaCarteirasAcoes', 'getCarteirasAcoesImpl', r.carteirasAcoes, 'acoesConteudo', 'acoesPeriodoTabs', [['carteiraAcoes', 'acoesRentabLegenda']]],
    ['fiis', 'carteiras-fiis.js', 'montarPaginaCarteirasFiis', 'getCarteirasFiisImpl', r.carteirasFiis, 'fiisConteudo', 'fiisPeriodoTabs', [['carteiraFiis', 'fiisRentabLegenda']]],
    ['acoesEua', 'carteiras-acoes-eua.js', 'montarPaginaCarteirasAcoesEua', 'getCarteirasAcoesEuaImpl', r.carteirasAcoesEua, 'acoesEuaConteudo', 'acoesEuaPeriodoTabs', [['carteiraAcoesEua', 'acoesEuaRentabLegenda']]],
    ['rendaFixa', 'carteiras-renda-fixa.js', 'montarPaginaCarteirasRendaFixa', 'getCarteirasRendaFixaImpl', r.carteirasRendaFixa, 'rendaFixaConteudo', 'rendaFixaPeriodoTabs',
      [['carteiraRendaFixaTotal', 'rfRentabTotalLegenda'], ['carteiraRendaFixaLongoPrazo', 'rfRentabLongoLegenda'], ['carteiraRendaFixaEmergencial', 'rfRentabEmergLegenda']]],
  ];
  for (const [nome, arq, fn, impl, cart, idC, idTabs, paineis] of PAGS) {
    const mod = await imp('assets/js/pages/' + arq);
    const { dom, doc } = domCarteiras();
    await mod[fn]('t', { doc, [impl]: async () => ({ ok: true, carteira: cart }), getHomeImpl: async () => home });
    const el = doc.getElementById(idC);
    const stats = [...el.querySelectorAll('.cc-resumo-stat')].map((x) => texto(x));
    const prov = stats.find((x) => /Proventos/.test(x));
    telas.sub[nome] = {
      resumoTexto: texto(el.querySelector('.cc-resumo')).replace(/ i( |$)/g, ' ').trim(),
      valor: lerBRL(texto(el.querySelector('.cc-resumo-valor'))),
      aplicado: lerBRL(texto(el.querySelector('.cc-resumo-investido'))),
      lucro: lerBRL(stats[0] || ''),
      pctLucro: lerPct(stats[0] || ''),
      proventos: prov ? lerBRL(prov) : null,
      tooltips: [...el.querySelectorAll('.cc-resumo .info-alvo')].map((x) => x.dataset.tooltip),
      legendas: {},
    };
    for (const per of PERIODOS) {
      if (!clicar(dom, doc, `#${idTabs} .filter-tab[data-periodo="${per}"]`)) continue;
      telas.sub[nome].legendas[per] = Object.fromEntries(paineis.map(([v, id]) => [v, legenda(doc, id)]));
    }
    dom.window.close();
  }
  return telas;
}

// ---------------------------------------------------------------------------
// checagens ("tudo batendo e de acordo")
// ---------------------------------------------------------------------------
function checar(D, s, p, u) {
  const out = [];
  const add = (grupo, nome, erros, detalhe = '') => out.push({ grupo, nome, ok: erros.length === 0, erros: erros.slice(0, 15), totalErros: erros.length, detalhe });
  const perto = (a, b, tol = 0.011) => a != null && b != null && Math.abs(a - b) <= tol;
  const N = NOMES_VISAO;

  // --- Série ---
  {
    const hoje = fmtSp.format(new Date());
    add('Série histórica', 'termina hoje (horário de SP), sem nenhum ponto no futuro',
      [u.data !== hoje ? `último ponto ${dbr(u.data)} x hoje ${dbr(hoje)}` : null, ...s.filter((x) => x.data > hoje).map((x) => `ponto no futuro ${dbr(x.data)}`)].filter(Boolean));
    const e = [];
    const esperado = {
      patrimonio: p.total, longoPrazo: p.longoPrazo, nacional: p.nacional, rendaEmergencial: p.rendaEmergencial, acoes: p.porClasse.acoes,
      fiis: p.porClasse.fiis, acoesEua: p.porClasse.acoesEua, rendaFixaTotal: p.porClasse.rendaFixa, rendaFixaLongoPrazo: p.porClasse.rendaFixa - p.rendaEmergencial,
    };
    for (const [c, v] of Object.entries(esperado)) if (!perto(u[c], v)) e.push(`${c}: fim do gráfico ${r2(u[c])} x ao vivo ${r2(v)}`);
    add('Série histórica', 'último ponto de cada gráfico = valor ao vivo (hero = fim do gráfico)', e);
    const TRIOS = [
      ['patrimonio', 'longoPrazo', 'rendaEmergencial'], ['longoPrazo', 'nacional', 'acoesEua'], ['rendaFixaTotal', 'rendaFixaLongoPrazo', 'rendaEmergencial'],
      ['fluxoCaixaPatrimonio', 'fluxoCaixaLongoPrazo', 'fluxoCaixaRendaEmergencial'], ['fluxoCaixaLongoPrazo', 'fluxoCaixaNacional', 'fluxoCaixaAcoesEua'],
      ['fluxoCaixaRendaFixaTotal', 'fluxoCaixaRendaFixaLongoPrazo', 'fluxoCaixaRendaEmergencial'], ['fluxoAplicadoPatrimonio', 'fluxoAplicadoLongoPrazo', 'fluxoAplicadoRendaEmergencial'],
      ['fluxoAplicadoLongoPrazo', 'fluxoAplicadoNacional', 'fluxoAplicadoAcoesEua'], ['fluxoAplicadoRendaFixaTotal', 'fluxoAplicadoRendaFixaLongoPrazo', 'fluxoAplicadoRendaEmergencial'],
    ];
    const QUART = [
      ['nacional', 'acoes', 'fiis', 'rendaFixaLongoPrazo'], ['fluxoCaixaNacional', 'fluxoCaixaAcoes', 'fluxoCaixaFiis', 'fluxoCaixaRendaFixaLongoPrazo'],
      ['fluxoAplicadoNacional', 'fluxoAplicadoAcoes', 'fluxoAplicadoFiis', 'fluxoAplicadoRendaFixaLongoPrazo'],
    ];
    const e2 = [];
    for (const x of s) {
      for (const [a, b, c] of TRIOS) if (Math.abs(x[a] - (x[b] + x[c])) > 0.05) e2.push(`${dbr(x.data)} ${a} != ${b} + ${c}`);
      for (const [a, b, c, d] of QUART) if (Math.abs(x[a] - (x[b] + x[c] + x[d])) > 0.05) e2.push(`${dbr(x.data)} ${a} != ${b} + ${c} + ${d}`);
    }
    add('Série histórica', `identidades em todos os ${s.length} dias (Total = Longo Prazo + Reserva; Longo Prazo = Nacional + EUA; Nacional = Ações + FIIs + RF longo prazo), no valor, no fluxo e no Valor aplicado`, e2);
    const e3 = [];
    for (const v of TODAS) {
      const [campo, fl] = CAMPOS[v];
      const agregada = ['total', 'longoPrazo', 'rendaEmergencial', 'carteiraRendaFixaTotal', 'carteiraRendaFixaLongoPrazo', 'carteiraRendaFixaEmergencial'].includes(v);
      const lim = agregada ? 0.08 : (v === 'nacional' ? 0.10 : 0.5);
      let ant = null;
      for (const x of s) {
        const val = num(x[campo]);
        if (val == null) continue;
        if (ant) { const rr = (val - (x[fl] || 0)) / ant - 1; if (rr < -lim || rr > (lim === 0.5 ? 1 : lim)) e3.push(`${N[v]} ${dbr(x.data)}: ${(rr * 100).toFixed(2)}%`); }
        ant = val !== 0 ? val : null;
      }
    }
    add('Série histórica', 'nenhum dia impossível (visões agregadas nunca variam mais de 8% num dia, Nacional 10%, classes 50%)', e3);
  }

  // --- Início ---
  {
    const t = D.telas.inicio;
    const e = [], e2 = [], e3 = [];
    VISOES_INICIO.forEach((v, i) => {
      const c = t.cards[i];
      if (!c) { e.push(`card ${N[v]} sumiu`); return; }
      if (!perto(c.valor, r2(D.vivo[v]))) e.push(`${N[v]}: card ${c.valor} x ao vivo ${r2(D.vivo[v])}`);
      if (D.ontemOraculo) {
        if (!perto(c.ontem, r2(D.ontemOraculo[v]))) e2.push(`${N[v]}: "ontem era" ${c.ontem} x último pregão + ajuste ${r2(D.ontemOraculo[v])}`);
        if (!perto(c.varPct, r2((D.vivo[v] / D.ontemOraculo[v] - 1) * 100))) e2.push(`${N[v]}: variação ${c.varPct}%`);
      }
      if (v !== 'rendaEmergencial') {
        const sf = c.fatias.reduce((a, b) => a + b, 0);
        if (Math.abs(sf - r2(D.vivo[v])) > 0.021) e3.push(`${N[v]}: fatias somam ${r2(sf)} x card ${r2(D.vivo[v])}`);
      }
    });
    add('Início', 'cards do resumo = valor ao vivo', e);
    add('Início', `"ontem era" = fechamento do último pregão do gráfico (${dbr(D.ontemOraculo && D.ontemOraculo.data)}) + ajuste de marcação da Renda Fixa, com a variação certa`, e2);
    add('Início', 'fatias por classe dentro de cada card somam o valor do card', e3);
    const e4 = [], e5 = [];
    for (const per of PERIODOS) {
      for (const v of VISOES_INICIO) {
        const tela = t.rentab[per][v], o = D.visoes[v][per];
        if (!perto(tela.valor, r2(D.vivo[v]))) e4.push(`${N[v]}/${NOMES_PERIODO[per]}: valor ${tela.valor}`);
        if (!perto(tela.pct, o.pct) || !perto(tela.ganho, o.ganho)) e4.push(`${N[v]}/${NOMES_PERIODO[per]}: tela ${tela.ganho} / ${tela.pct}% x oráculo ${o.ganho} / ${o.pct}%`);
        o.bench.forEach((b, i) => { if (b.diff != null && !perto(tela.legenda[i] && tela.legenda[i].delta, b.diff, 0.02)) e5.push(`${N[v]}/${NOMES_PERIODO[per]} ${b.campo}: legenda ${tela.legenda[i] && tela.legenda[i].delta} x ${b.diff}`); });
      }
    }
    add('Início', 'hero de Rentabilidade ("R$ … % no período") dos 4 painéis × 6 períodos = cálculo independente', e4);
    add('Início', 'legenda "Benchmark ±x%" = Portfólio − benchmark no mesmo intervalo (4 painéis × 6 períodos)', e5);
  }

  // --- Coerência ---
  {
    const e = [];
    for (const per of PERIODOS) {
      const q = D.somas[per];
      if (Math.abs(q.total - (q.longoPrazo + q.emerg)) > 0.05) e.push(`${NOMES_PERIODO[per]}: Total != Longo Prazo + Reserva`);
      if (Math.abs(q.longoPrazo - (q.nacional + q.eua)) > 0.05) e.push(`${NOMES_PERIODO[per]}: Longo Prazo != Nacional + EUA`);
      if (Math.abs(q.nacional - (q.acoes + q.fiis + q.rfLp)) > 0.05) e.push(`${NOMES_PERIODO[per]}: Nacional != Ações + FIIs + RF longo prazo`);
      if (Math.abs(q.total - (q.acoes + q.fiis + q.eua + q.rfTotal)) > 0.05) e.push(`${NOMES_PERIODO[per]}: Total != soma das 4 classes`);
    }
    add('Coerência', 'ganho em R$ de cada período soma certo entre painéis e entre as 4 classes (6 períodos)', e);
    const e2 = [];
    for (const v of TODAS) {
      for (const per of PERIODOS) {
        const o = D.visoes[v][per];
        if (!o) continue;
        if (Math.abs(o.app.pct - o.pctExato) > 0.005 || Math.abs(o.app.ganho - o.ganhoExato) > 0.01) e2.push(`${N[v]}/${NOMES_PERIODO[per]}: app ${r2(o.app.pct)}% / ${r2(o.app.ganho)} x oráculo ${o.pct}% / ${o.ganho}`);
      }
    }
    add('Coerência', 'cálculo do app = oráculo independente nas 10 visões × 6 períodos', e2);
    const e3 = [];
    for (const v of TODAS) {
      for (const per of PERIODOS) {
        const ev = D.visoes[v][per] && D.visoes[v][per].evolucao;
        if (ev && !perto(ev.valorFim, r2(D.vivo[v]), 0.02)) e3.push(`${N[v]}/${NOMES_PERIODO[per]}: fim da Evolução ${ev.valorFim} x ao vivo ${r2(D.vivo[v])}`);
      }
    }
    add('Coerência', 'fim de todo gráfico de Evolução = valor ao vivo, em todos os períodos', e3);
    const e4 = [];
    for (const v of TODAS) {
      const o = D.visoes[v].tudo;
      if (Math.abs(o.ganhoExato - (D.vivo[v] - D.entrou[v])) > 0.02) e4.push(`${N[v]}: desde o início ${o.ganho} x hoje − tudo o que entrou ${r2(D.vivo[v] - D.entrou[v])}`);
    }
    add('Coerência', '"Desde o início" em R$ = valor de hoje − tudo o que entrou (aportes − resgates − proventos), em todas as visões', e4);
  }

  // --- Visão geral ---
  {
    const t = D.telas.vg;
    const o = D.visoes.total.tudo;
    const e = [];
    if (!perto(t.patrimonio, r2(D.vivo.total))) e.push(`patrimônio ${t.patrimonio}`);
    if (!perto(t.aplicado, r2(D.aplicado.total))) e.push(`Valor aplicado ${t.aplicado} x soma do aplicado ${r2(D.aplicado.total)}`);
    if (t.resultado == null || !perto(Math.abs(t.resultado), Math.abs(o.ganho))) e.push(`Resultado ${t.resultado} x ${o.ganho}`);
    if (!perto(t.rentabilidade, o.pct)) e.push(`Rentabilidade ${t.rentabilidade} x ${o.pct}`);
    add('Carteiras · Visão geral', 'hero (Patrimônio, Valor aplicado, Resultado, Rentabilidade) = Início e fim da linha "Valor aplicado"', e);
    const e2 = [];
    for (const [per, tela] of Object.entries(t.porPeriodo)) {
      const x = D.visoes.total[per];
      if (!perto(tela.pct, x.pct) || !perto(tela.ganho, x.ganho)) e2.push(`${NOMES_PERIODO[per]}: tela ${tela.ganho} / ${tela.pct}%`);
      x.bench.forEach((b, i) => { if (b.diff != null && !perto(tela.legenda[i] && tela.legenda[i].delta, b.diff, 0.02)) e2.push(`${NOMES_PERIODO[per]}: legenda ${b.campo}`); });
    }
    add('Carteiras · Visão geral', 'Rentabilidade de cada período e legenda = cálculo independente', e2);
    const MAP = { 'Ações': 'carteiraAcoes', 'FIIs': 'carteiraFiis', 'Ações Internacionais': 'carteiraAcoesEua', 'Renda Fixa': 'carteiraRendaFixaTotal' };
    const e3 = [];
    let soma = 0;
    for (const c of t.cards) {
      const v = MAP[c.nome];
      if (!v) continue;
      const ap = D.aplicado[v];
      soma += c.aplicado;
      if (c.rotulo !== 'Valor aplicado') e3.push(`${c.nome}: rótulo "${c.rotulo}"`);
      if (!perto(c.aplicado, r2(ap), 0.005)) e3.push(`${c.nome}: Valor aplicado ${c.aplicado} x fim da linha ${r2(ap)}`);
      if (c.lucro == null || !perto(Math.abs(c.lucro), Math.abs(r2(c.valor - ap)))) e3.push(`${c.nome}: lucro ${c.lucro} x valor − aplicado ${r2(c.valor - ap)}`);
      if (!perto(c.pct, r2(((c.valor - ap) / ap) * 100))) e3.push(`${c.nome}: % ${c.pct} x ${r2(((c.valor - ap) / ap) * 100)}`);
    }
    if (!perto(soma, t.aplicado, 0.03)) e3.push(`soma dos cards ${r2(soma)} x hero ${t.aplicado}`);
    add('Carteiras · Visão geral', 'cards: Valor aplicado = fim da linha do gráfico da classe; os 4 somam o hero; lucro = valor − aplicado; % com as casas certas', e3);
  }

  // --- Subpáginas ---
  {
    const sub = D.telas.sub;
    const card = Object.fromEntries(D.telas.vg.cards.map((c) => [c.nome, c]));
    const e = [];
    for (const [k, nome, v] of [['acoes', 'Ações', 'carteiraAcoes'], ['fiis', 'FIIs', 'carteiraFiis'], ['rendaFixa', 'Renda Fixa', 'carteiraRendaFixaTotal']]) {
      if (!perto(sub[k].aplicado, r2(D.aplicado[v]), 0.005)) e.push(`${nome}: topo ${sub[k].aplicado} x fim da linha ${r2(D.aplicado[v])}`);
      if (!perto(sub[k].aplicado, card[nome] && card[nome].aplicado, 0.005)) e.push(`${nome}: topo ${sub[k].aplicado} x card ${card[nome] && card[nome].aplicado}`);
      if (!perto(sub[k].pctLucro, card[nome] && card[nome].pct)) e.push(`${nome}: % no topo ${sub[k].pctLucro} x card ${card[nome] && card[nome].pct}`);
      if (!perto(sub[k].valor, r2(D.vivo[v]))) e.push(`${nome}: valor no topo ${sub[k].valor} x ao vivo ${r2(D.vivo[v])}`);
    }
    const tt = sub.acoesEua.tooltips;
    const vv = lerBRL(tt[0] || ''), ap = lerBRL(tt[1] || ''), lu = lerBRL(tt[2] || '');
    const cE = card['Ações Internacionais'];
    if (!perto(ap, cE && cE.aplicado, 0.005)) e.push(`Ações EUA: "i" do Valor aplicado ${ap} x card ${cE && cE.aplicado}`);
    if (lu == null || !cE || !perto(Math.abs(lu), Math.abs(cE.lucro))) e.push(`Ações EUA: "i" do lucro ${lu} x card ${cE && cE.lucro}`);
    if (!perto(vv, r2(D.vivo.carteiraAcoesEua))) e.push(`Ações EUA: "i" do valor ${vv} x ao vivo ${r2(D.vivo.carteiraAcoesEua)}`);
    add('Carteiras · subpáginas', 'topo de cada página = card da Visão geral = fim da linha "Valor aplicado" (Ações EUA pelo "i" em reais)', e);
    const e2 = [];
    const PAINEIS = { acoes: ['carteiraAcoes'], fiis: ['carteiraFiis'], acoesEua: ['carteiraAcoesEua'], rendaFixa: ['carteiraRendaFixaTotal', 'carteiraRendaFixaLongoPrazo', 'carteiraRendaFixaEmergencial'] };
    for (const [k, paineis] of Object.entries(PAINEIS)) {
      for (const [per, leg] of Object.entries(sub[k].legendas)) {
        for (const v of paineis) {
          D.visoes[v][per].bench.forEach((b, i) => {
            const d = leg[v] && leg[v][i] ? leg[v][i].delta : null;
            if (b.diff != null && !perto(d, b.diff, 0.02)) e2.push(`${N[v]}/${NOMES_PERIODO[per]} ${b.campo}: legenda ${d} x ${b.diff}`);
          });
        }
      }
    }
    add('Carteiras · subpáginas', 'legenda de todos os gráficos de Rentabilidade = Portfólio − benchmark no mesmo intervalo (começando no nascimento da carteira)', e2);
    const e3 = [];
    for (const [k, v, campoAba] of [['acoes', 'carteiraAcoes', 'acoes'], ['fiis', 'carteiraFiis', 'fiis']]) {
      if (!perto(sub[k].proventos, r2(D.proventosAba[campoAba]))) e3.push(`${k}: "Proventos recebidos" ${sub[k].proventos} x aba Proventos ${r2(D.proventosAba[campoAba])}`);
      const lucro = sub[k].valor - sub[k].aplicado;
      const real = D.realizadoAba[campoAba];
      if (!perto(lucro + sub[k].proventos + real, D.visoes[v].tudo.ganho, 0.03)) e3.push(`${k}: lucro ${r2(lucro)} + proventos ${sub[k].proventos} + realizado ${r2(real)} x desde o início ${D.visoes[v].tudo.ganho}`);
    }
    add('Carteiras · subpáginas', 'Ações e FIIs: "Proventos recebidos" = aba Proventos (inclusive códigos antigos) e Lucro + Proventos + lucro realizado nas vendas = Resultado desde o início', e3);
  }

  // --- Plausibilidade ("de acordo") ---
  {
    const e = [];
    for (const v of TODAS) {
      for (const per of PERIODOS) {
        const o = D.visoes[v][per];
        if (!o || o.sinalOk) continue;
        if (!o.metades || !o.metades.every((h) => Math.abs(h.ganho) < 1 || Math.sign(h.ganho) === Math.sign(h.pct))) e.push(`${N[v]}/${NOMES_PERIODO[per]}: R$ ${o.ganho} e ${o.pct}% com sinais opostos sem explicação pelos aportes`);
      }
    }
    add('Plausibilidade', 'R$ e % com sinais diferentes só por causa do momento dos aportes (cada metade da janela tem R$ e % do mesmo sinal)', e);
    const e2 = [];
    for (const per of ['6m', '12m', '3a']) {
      const o = D.visoes.rendaEmergencial[per];
      const cdi = o.bench.find((b) => b.campo === 'indiceCdi');
      if (cdi && cdi.diff != null && Math.abs(cdi.diff) > 0.5) e2.push(`${NOMES_PERIODO[per]}: reserva ${o.pct}% x CDI ${cdi.ret}%`);
    }
    add('Plausibilidade', 'reserva de emergência (Tesouro Selic) rende perto do CDI: diferença de até 0,5 p.p. em 6 meses, 12 meses e 3 anos', e2);
    const rf = D.patrimonio.porClasse.rendaFixa;
    add('Plausibilidade', `ajuste de marcação da Renda Fixa (valor manual − projeção do histórico) abaixo de 1,5% da Renda Fixa`,
      Math.abs(D.ajusteRf / rf) < 0.015 ? [] : ['acima de 1,5% - conferir compras faltando em "Transações Renda Fixa"'],
      `hoje: ${((D.ajusteRf / rf) * 100).toFixed(2).replace('.', ',')}%`);
    const e3 = [];
    for (const v of TODAS) for (const per of PERIODOS) { const o = D.visoes[v][per]; if (o && (o.pct < -60 || o.pct > 300)) e3.push(`${N[v]}/${NOMES_PERIODO[per]}: ${o.pct}%`); }
    add('Plausibilidade', 'nenhuma rentabilidade absurda (entre −60% e +300% em qualquer visão e período)', e3);
    if (D.gorila) {
      const dif = D.visoes.total.tudo.pct - D.gorila.rentabilidadeDesdeInicioPct;
      add('Plausibilidade', `"desde o início" perto do Gorila (${String(D.gorila.rentabilidadeDesdeInicioPct).replace('.', ',')}% em ${dbr(D.gorila.data)}): diferença de até 3 p.p. (metodologias diferentes: é ordem de grandeza)`,
        Math.abs(dif) <= 3 ? [] : [`app ${D.visoes.total.tudo.pct}% x Gorila ${D.gorila.rentabilidadeDesdeInicioPct}%`],
        `diferença: ${dif.toFixed(2).replace('.', ',')} p.p.`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// "o que mudou" desde a última geração
// ---------------------------------------------------------------------------
export function metricasPlanas(D) {
  const m = {};
  for (const [v, pers] of Object.entries(D.visoes)) {
    for (const [per, o] of Object.entries(pers)) {
      m[`${NOMES_VISAO[v]} · ${NOMES_PERIODO[per]} · rentabilidade %`] = o.pct;
      m[`${NOMES_VISAO[v]} · ${NOMES_PERIODO[per]} · ganho R$`] = o.ganho;
      for (const b of o.bench) m[`${NOMES_VISAO[v]} · ${NOMES_PERIODO[per]} · legenda ${b.campo}`] = b.diff;
    }
  }
  for (const c of D.telas.vg.cards) { m[`Card ${c.nome} · Valor aplicado`] = c.aplicado; m[`Card ${c.nome} · lucro`] = c.lucro; m[`Card ${c.nome} · %`] = c.pct; }
  for (const c of D.telas.inicio.cards) { m[`Início · ${c.label} · valor`] = c.valor; m[`Início · ${c.label} · ontem era`] = c.ontem; }
  for (const [k, x] of Object.entries(D.telas.sub)) {
    m[`Topo ${k} · Valor aplicado`] = x.aplicado;
    m[`Topo ${k} · lucro`] = x.lucro;
    if (x.proventos != null) m[`Topo ${k} · proventos`] = x.proventos;
  }
  m['Visão geral · Valor aplicado'] = D.telas.vg.aplicado;
  m['Visão geral · Resultado'] = D.telas.vg.resultado;
  return m;
}
export function compararMetricas(atual, anterior) {
  if (!anterior) return null;
  const mud = [];
  for (const [k, v] of Object.entries(atual)) {
    const a = anterior[k];
    if (a === undefined) { mud.push({ chave: k, antes: null, agora: v, novo: true }); continue; }
    if (v == null && a == null) continue;
    if (v == null || a == null || Math.abs(v - a) > 0.005) mud.push({ chave: k, antes: a, agora: v });
  }
  for (const k of Object.keys(anterior)) if (!(k in atual)) mud.push({ chave: k, antes: anterior[k], agora: null, removido: true });
  return mud;
}

// ---------------------------------------------------------------------------
// gera e grava
// ---------------------------------------------------------------------------
export async function gerarRelatorioTelas({ fixturesPath = FIXTURES_PATH, saidaDir = SAIDA_DIR } = {}) {
  const dados = await coletarDadosTelas({ fixturesPath });
  fs.mkdirSync(saidaDir, { recursive: true });
  const jsonAtual = path.join(saidaDir, 'conferencia-telas.json');
  const jsonAnterior = path.join(saidaDir, 'conferencia-telas.anterior.json');
  const metricas = metricasPlanas(dados);
  const ler = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const ultimo = ler(jsonAtual);
  // "anterior" = a última geração com números DIFERENTES - rodar os testes
  // de novo sem mudar nada não apaga o "o que mudou".
  let anterior = ler(jsonAnterior);
  if (ultimo && ultimo.metricas) {
    const dif = compararMetricas(metricas, ultimo.metricas);
    if (dif && dif.length) { anterior = ultimo; fs.writeFileSync(jsonAnterior, JSON.stringify(ultimo)); }
  }
  const mudancas = anterior ? compararMetricas(metricas, anterior.metricas) : null;
  const html = gerarHtmlRelatorio(dados, { anterior: anterior ? { meta: anterior.meta, metricas: anterior.metricas } : null, mudancas });
  const htmlPath = path.join(saidaDir, 'conferencia-telas.html');
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(jsonAtual, JSON.stringify({ meta: dados.meta, metricas, checagens: dados.checagens, qualidade: dados.qualidade }));
  return { dados, htmlPath, mudancas };
}

// CLI: node tests/harness/relatorio-telas.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!fs.existsSync(FIXTURES_PATH)) {
    console.error('tests/harness/fixtures.json ausente - ver tests/harness/README.md');
    process.exit(1);
  }
  const { dados, htmlPath } = await gerarRelatorioTelas();
  const falhas = dados.checagens.filter((c) => !c.ok);
  console.log(`Relatório: ${htmlPath}`);
  console.log(`Checagens: ${dados.checagens.length - falhas.length}/${dados.checagens.length} ok · alertas de dado da planilha: ${dados.qualidade.filter((q) => q.msgs.length).length}`);
  for (const f of falhas) console.log(`  ✗ ${f.grupo}: ${f.nome}\n      ${f.erros.join('\n      ')}`);
  process.exit(falhas.length ? 1 : 0);
}
