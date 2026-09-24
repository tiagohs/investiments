// tests/harness/telas-heroes-graficos.test.js
//
// 23/09/2026 - pedido do Tiago, depois de mais uma rodada de números
// estranhos ("os cálculos apresentados nos gráficos continuam incorretos...
// eu não consigo confiar na minha própria carteira... Após você resolver,
// você mesmo faça testes unitários confiáveis, e inclua nesses testes o
// resultado que apresenta esses gráficos e heroes de todas as telas, e
// você mesmo compare e veja se tudo bate").
//
// Como este arquivo é "confiável" (e não só "o código conferindo ele mesmo"):
//  - roda a rota REAL `action=home` (Home.gs!handleHome, via
//    carregarTodasAsTelasComDadosReais) em cima dos dados reais da planilha
//    (fixtures.json) - a MESMA resposta que a Início e as 5 telas de
//    Carteiras recebem;
//  - monta as páginas de verdade (index.html/carteiras) num DOM (jsdom) e
//    LÊ O TEXTO que aparece na tela (heroes, "no período", legendas);
//  - compara com contas feitas AQUI, escritas do zero (oráculo): TWR,
//    ganho em R$, janelas de período, e a reconstrução do patrimônio de
//    cada classe direto das abas cruas (Transações × preço do histórico);
//  - confere as identidades que têm que valer por definição (Total = Longo
//    Prazo + Emergencial etc.) em TODOS os dias e em TODOS os períodos -
//    é exatamente o tipo de incoerência que o Tiago apontou ("Patrimônio
//    Nacional tem uma rentabilidade completamente incoerente com o gráfico
//    de patrimônio geral").
// Nenhum número financeiro real fica escrito neste arquivo (repositório
// público) - tudo é lido do fixtures.json (gitignored) na hora.
//
// Sem fixtures.json, tudo aqui é pulado (t.skip) - ver README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { carregarTodasAsTelasComDadosReais, relogioNoFusoParaUtcMs_, FUSO_PLANILHA_XLSX } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const PERIODOS = ['mes', '30d', '6m', '12m', '3a', 'tudo'];
const VISOES_INICIO = [
  { visaoId: 'total', sufixo: 'Total', campo: 'patrimonio', fluxo: 'fluxoCaixaPatrimonio' },
  { visaoId: 'longoPrazo', sufixo: 'LongoPrazo', campo: 'longoPrazo', fluxo: 'fluxoCaixaLongoPrazo' },
  { visaoId: 'nacional', sufixo: 'Nacional', campo: 'nacional', fluxo: 'fluxoCaixaNacional' },
  { visaoId: 'rendaEmergencial', sufixo: 'RendaEmergencial', campo: 'rendaEmergencial', fluxo: 'fluxoCaixaRendaEmergencial' },
  // 23/09/2026 #9: gráfico "Ações Internacionais" da Início (mesmos campos de Carteiras > Ações EUA)
  { visaoId: 'internacional', sufixo: 'Internacional', campo: 'acoesEua', fluxo: 'fluxoCaixaAcoesEua', valor: (p) => p.porClasse.acoesEua, benchmarks: ['sp500', 'ibovespa'] },
];

let _dados = null;
async function dados() {
  if (!_dados) _dados = await carregarTodasAsTelasComDadosReais({ fixturesPath: FIXTURES_PATH });
  return _dados;
}

// ---------------------------------------------------------------------------
// Oráculo: contas escritas aqui, sem importar nada do app
// ---------------------------------------------------------------------------
const fmtSp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const hojeSp = () => fmtSp.format(new Date());
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function chaveSpDeCelula(cel) {
  // relógio do .xlsx está no fuso da PLANILHA (ver gas-vm-harness.mjs!reviveDate)
  const m = cel.__date__.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  return fmtSp.format(new Date(relogioNoFusoParaUtcMs_(FUSO_PLANILHA_XLSX, +m[1], +m[2], +m[3], +m[4], +m[5], +m[6])));
}

/** Regra de janela prometida ao Tiago: "mês" = fechamento do último dia do
 * mês anterior (base) + os dias do mês; "N dias" = N variações (N+1
 * pontos); "desde o início" = do 1º dia em que a visão tem valor. */
function janelaOraculo(serie, periodoId, campo) {
  if (periodoId === 'mes') {
    const anoMes = serie[serie.length - 1].data.slice(0, 7);
    const i = serie.findIndex((x) => x.data.slice(0, 7) === anoMes);
    return serie.slice(Math.max(0, i - 1));
  }
  const dias = { '30d': 30, '6m': 182, '12m': 365, '3a': 1095 }[periodoId];
  if (dias) return serie.slice(-(dias + 1));
  const i = serie.findIndex((x) => num(x[campo]) && x[campo] !== 0);
  return serie.slice(Math.max(0, i));
}

/** TWR (retorno ponderado no tempo) + ganho em R$, sem trava nenhuma.
 * "Abertura" (23/09/2026 #3): se a janela começa no dia em que a visão
 * nasceu (na série completa, o dia anterior vale 0/não existe), a base é o
 * CUSTO aplicado nesse dia, não o fechamento dele - o 1º dia também rende. */
function twrOraculo(janela, campo, campoFluxo, serieCompleta = null) {
  const i0 = janela.findIndex((x) => num(x[campo]) && x[campo] !== 0);
  if (i0 === -1) return { pct: null, ganho: null };
  let acum = 1, ant = janela[i0][campo], somaFluxo = 0, ultimo = ant;
  if (serieCompleta) {
    const pos = serieCompleta.indexOf(janela[i0]);
    const antes = pos > 0 ? num(serieCompleta[pos - 1][campo]) : null;
    const f0 = num(janela[i0][campoFluxo]);
    if (!antes && f0 > 0 && ant / f0 >= 0.5 && ant / f0 <= 2) {
      acum = ant / f0;
      somaFluxo = f0 - ant; // ganho = último − f0 − Σ fluxos seguintes
    }
  }
  for (let i = i0 + 1; i < janela.length; i += 1) {
    const v = num(janela[i][campo]);
    if (v == null) continue;
    const f = num(janela[i][campoFluxo]) || 0;
    somaFluxo += f;
    if (ant) acum *= (v - f) / ant;
    ant = v; ultimo = v;
  }
  return { pct: (acum - 1) * 100, ganho: ultimo - janela[i0][campo] - somaFluxo };
}

function lerBRL(texto) {
  const m = String(texto).match(/(-?)\s*R\$\s*(-?)([\d.]+,\d{2})/);
  if (!m) return null;
  const v = Number(m[3].replace(/\./g, '').replace(',', '.'));
  return (m[1] || m[2]) ? -v : v;
}
function lerPct(texto) {
  const m = String(texto).match(/([+-]?)(\d{1,3}(?:\.\d{3})*,\d+)%/);
  if (!m) return null;
  const v = Number(m[2].replace(/\./g, '').replace(',', '.'));
  return m[1] === '-' ? -v : v;
}
/** "+R$ 1.234,56 +0,16% no período" -> { ganho, pct } */
function lerDeltaPeriodo(texto) {
  const m = String(texto).match(/([+-])R\$\s*([\d.]+,\d{2})\s+([+-]?[\d.]+,\d+)%/);
  if (!m) return null;
  const ganho = Number(m[2].replace(/\./g, '').replace(',', '.')) * (m[1] === '-' ? -1 : 1);
  return { ganho, pct: lerPct(m[3] + '%') };
}
const r2 = (v) => Math.round(v * 100) / 100;

function pular(t) {
  if (!TEM_FIXTURES) { t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md'); return true; }
  return false;
}

// ---------------------------------------------------------------------------
// 1) Série: fim, "hoje" e ao vivo
// ---------------------------------------------------------------------------
test('série: termina HOJE (nunca no futuro) e o último ponto é exatamente o valor ao vivo de cada visão e classe (hero = fim do gráfico)', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const s = home.historico;
  assert.ok(s.length > 100, 'série vazia/curta demais');
  assert.equal(s[s.length - 1].data, hojeSp(), 'o último ponto da série tem que ser hoje (fuso de SP) - nem ontem (aí o ao vivo não entra) nem amanhã (o bug do 24/09 no dia 23/09)');
  assert.ok(s.every((x) => x.data <= hojeSp()), 'nenhum ponto pode estar no futuro');
  const u = s[s.length - 1];
  const p = home.patrimonio;
  const esperado = {
    patrimonio: p.total, longoPrazo: p.longoPrazo, nacional: p.nacional, rendaEmergencial: p.rendaEmergencial,
    acoes: p.porClasse.acoes, fiis: p.porClasse.fiis, acoesEua: p.porClasse.acoesEua, rendaFixaTotal: p.porClasse.rendaFixa,
    rendaFixaLongoPrazo: p.porClasse.rendaFixa - p.rendaEmergencial,
  };
  for (const [campo, v] of Object.entries(esperado)) {
    assert.ok(Math.abs(u[campo] - v) <= 0.01, `último ponto.${campo} (${u[campo]}) != ao vivo (${v})`);
  }
});

// ---------------------------------------------------------------------------
// 2) Identidades em TODOS os dias
// ---------------------------------------------------------------------------
test('série: identidades valem em TODOS os dias - Total = Longo Prazo + Emergencial; Longo Prazo = Nacional + Ações EUA; Nacional = Ações + FIIs + RF Longo Prazo; RF = RF Longo Prazo + Emergencial (valor, fluxo da rentabilidade e Valor aplicado)', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const TRIOS = [
    ['patrimonio', 'longoPrazo', 'rendaEmergencial'],
    ['longoPrazo', 'nacional', 'acoesEua'],
    ['rendaFixaTotal', 'rendaFixaLongoPrazo', 'rendaEmergencial'],
    ['fluxoCaixaPatrimonio', 'fluxoCaixaLongoPrazo', 'fluxoCaixaRendaEmergencial'],
    ['fluxoCaixaLongoPrazo', 'fluxoCaixaNacional', 'fluxoCaixaAcoesEua'],
    ['fluxoCaixaRendaFixaTotal', 'fluxoCaixaRendaFixaLongoPrazo', 'fluxoCaixaRendaEmergencial'],
    ['fluxoAplicadoPatrimonio', 'fluxoAplicadoLongoPrazo', 'fluxoAplicadoRendaEmergencial'],
    ['fluxoAplicadoLongoPrazo', 'fluxoAplicadoNacional', 'fluxoAplicadoAcoesEua'],
    ['fluxoAplicadoRendaFixaTotal', 'fluxoAplicadoRendaFixaLongoPrazo', 'fluxoAplicadoRendaEmergencial'],
  ];
  const QUARTETOS = [
    ['nacional', 'acoes', 'fiis', 'rendaFixaLongoPrazo'],
    ['fluxoCaixaNacional', 'fluxoCaixaAcoes', 'fluxoCaixaFiis', 'fluxoCaixaRendaFixaLongoPrazo'],
    ['fluxoAplicadoNacional', 'fluxoAplicadoAcoes', 'fluxoAplicadoFiis', 'fluxoAplicadoRendaFixaLongoPrazo'],
  ];
  const erros = [];
  for (const x of home.historico) {
    for (const [a, b, c] of TRIOS) if (Math.abs(x[a] - (x[b] + x[c])) > 0.05) erros.push(`${x.data} ${a}=${x[a]} != ${b}+${c}=${r2(x[b] + x[c])}`);
    for (const [a, b, c, d] of QUARTETOS) if (Math.abs(x[a] - (x[b] + x[c] + x[d])) > 0.05) erros.push(`${x.data} ${a}=${x[a]} != ${b}+${c}+${d}=${r2(x[b] + x[c] + x[d])}`);
  }
  assert.deepEqual(erros.slice(0, 20), [], `${erros.length} dia(s)/identidade(s) quebrada(s)`);
});

// ---------------------------------------------------------------------------
// 3) Série x planilha crua (oráculo independente)
// ---------------------------------------------------------------------------
test('série x planilha crua: todo dia desde 2025, cada classe = Σ quantidade das Transações × preço do histórico (× câmbio) - reconstruído aqui, direto das abas', async (t) => {
  if (pular(t)) return;
  const { home, fixtures, sandbox, diagnosticoRv } = await dados();
  const fora = new Set(sandbox.TICKERS_FORA_DO_HISTORICO || []);
  const fiis = new Set(sandbox.TICKERS_FIIS_BR || []);
  // Correções de preço histórico (preço do GOOGLEFINANCE "ajustado" pra
  // trás - ver teste de âncora, que prova cada uma contra o preço que você
  // pagou) entram aqui como fator por ticker/período; todo o resto
  // (quantidade, forward-fill, câmbio, somas por classe) é refeito do zero.
  const correcoes = {};
  for (const c of diagnosticoRv.correcoesPreco || []) (correcoes[c.ticker] = correcoes[c.ticker] || []).push(c);
  for (const tk of Object.keys(correcoes)) correcoes[tk].sort((a, b) => (a.ate < b.ate ? -1 : 1));
  const fatorPreco = (tk, dia) => { for (const c of correcoes[tk] || []) if (dia < c.ate) return c.fator; return 1; };
  const inicioConferencia = '2025-01-01';

  // quantidade por ticker e dia, das Transações (coluna K já com sinal)
  const movs = {};
  for (const aba of ['Transações', 'Transações - USA']) {
    for (const l of (fixtures[aba]?.linhas || []).slice(6)) {
      const tk = String(l[0] || '').trim().toUpperCase();
      if (!tk || !l[1] || !l[1].__date__ || fora.has(tk)) continue;
      const delta = typeof l[10] === 'number' ? l[10] : 0;
      (movs[tk] = movs[tk] || []).push([chaveSpDeCelula(l[1]), delta]);
    }
  }
  const qtd = (tk, dia) => (movs[tk] || []).reduce((s, [k, d]) => (k <= dia ? s + d : s), 0);

  // último preço (e câmbio) de cada ticker em cada dia, do histórico cru
  const precos = {};
  for (const l of (fixtures['aux_historico-patrimonio']?.linhas || []).slice(1)) {
    if (!l[0] || !l[0].__date__ || fora.has(l[1]) || l[7] === '' || l[7] == null) continue;
    (precos[l[1]] = precos[l[1]] || []).push({ dia: chaveSpDeCelula(l[0]), preco: l[4], cambio: l[6], classe: l[2] });
  }
  for (const tk of Object.keys(precos)) precos[tk].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  // o próprio oráculo descarta preço isolado absurdo (mesma definição
  // prometida no comentário de HistoricoInicio.gs, reescrita aqui)
  const descartados = [];
  for (const tk of Object.keys(precos)) {
    const ls = precos[tk];
    precos[tk] = ls.filter((l, i) => {
      const a = ls[i - 1], p = ls[i + 1];
      if (a && p && (l.preco / a.preco < 0.6 || l.preco / a.preco > 1 / 0.6) && p.preco / a.preco > 0.85 && p.preco / a.preco < 1 / 0.85) { descartados.push(`${tk} ${l.dia}`); return false; }
      return true;
    });
  }

  const ultimoSync = Object.values(precos).flat().reduce((m, l) => (l.dia > m ? l.dia : m), '');
  const erros = [];
  for (const x of home.historico) {
    if (x.data < inicioConferencia || x.data > ultimoSync) continue;
    const soma = { BR: 0, FII: 0, USA: 0 };
    for (const tk of Object.keys(precos)) {
      let ult = null;
      for (const l of precos[tk]) { if (l.dia <= x.data) ult = l; else break; }
      if (!ult) continue;
      const classe = ult.classe === 'USA' ? 'USA' : (fiis.has(tk) ? 'FII' : 'BR');
      soma[classe] += qtd(tk, x.data) * ult.preco * fatorPreco(tk, ult.dia) * (classe === 'USA' ? ult.cambio : 1);
    }
    for (const [classe, campo] of [['BR', 'acoes'], ['FII', 'fiis'], ['USA', 'acoesEua']]) {
      // folga: 0,05 ou 0,01% (o fator de correção vem arredondado em 4 casas no diagnóstico)
      if (Math.abs(soma[classe] - x[campo]) > Math.max(0.05, 1e-4 * Math.abs(x[campo]))) erros.push(`${x.data} ${campo}: série ${x[campo]} x planilha ${r2(soma[classe])}`);
    }
  }
  t.diagnostic(`linhas de preço isolado absurdo que o oráculo também descartou: ${descartados.join(', ') || 'nenhuma'}`);
  assert.deepEqual(erros.slice(0, 20), [], `${erros.length} divergência(s) série x planilha`);
});

// ---------------------------------------------------------------------------
// 4) Âncora nos preços pagos
// ---------------------------------------------------------------------------
test('histórico de preços: em TODA compra/venda, o preço do histórico (já corrigido) fica a no máximo 12% do preço que você realmente pagou', async (t) => {
  if (pular(t)) return;
  const { diagnosticoRv } = await dados();
  const ancoras = diagnosticoRv.ancoras || [];
  assert.ok(ancoras.length > 100, `poucas âncoras (${ancoras.length}) - o diagnóstico sumiu?`);
  const fora = ancoras
    .filter((a) => Math.abs(a.precoPago / a.precoHistoricoCorrigido - 1) > 0.12)
    .map((a) => `${a.ticker} ${a.dia}: pago ${a.precoPago} x histórico ${r2(a.precoHistoricoCorrigido)}`);
  t.diagnostic(`correções de preço aplicadas: ${JSON.stringify(diagnosticoRv.correcoesPreco)}`);
  assert.deepEqual(fora, []);
});

// ---------------------------------------------------------------------------
// 5) Nenhum dia "impossível"
// ---------------------------------------------------------------------------
test('rentabilidade diária: nenhum dia de nenhuma visão cai na trava de plausibilidade (-50%/+100%), e as visões agregadas nunca variam mais de 8% num dia', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const inicio = await imp('assets/js/pages/inicio.js');
  const erros = [];
  for (const [visaoId, campo] of Object.entries(inicio.CAMPO_PRINCIPAL_POR_VISAO)) {
    const fluxo = inicio.CAMPO_FLUXO_POR_VISAO[visaoId];
    const limite = ['total', 'longoPrazo', 'rendaEmergencial', 'carteiraRendaFixaTotal', 'carteiraRendaFixaLongoPrazo', 'carteiraRendaFixaEmergencial'].includes(visaoId) ? 0.08 : (visaoId === 'nacional' ? 0.10 : 0.5);
    let ant = null;
    for (const x of home.historico) {
      const v = num(x[campo]);
      if (v == null) continue;
      if (ant) {
        const r = (v - (x[fluxo] || 0)) / ant - 1;
        if (r < -limite || r > (limite === 0.5 ? 1 : limite)) erros.push(`${visaoId} ${x.data}: ${(r * 100).toFixed(2)}%`);
      }
      ant = v !== 0 ? v : null;
    }
  }
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 6) Início: o que aparece na tela
// ---------------------------------------------------------------------------
async function montarInicioNaTela(home) {
  const { montarPaginaInicio } = await imp('assets/js/pages/inicio.js');
  const html = fs.readFileSync(path.join(ROOT, 'assets', 'partials', 'pages.html'), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const doc = dom.window.document;
  // o partial guarda a Início num <template> (router.js injeta) - mesma coisa aqui
  doc.body.append(doc.getElementById('page-inicio-template').content.cloneNode(true));
  await montarPaginaInicio('token-fake', { doc, getHomeImpl: async () => home });
  return { dom, doc };
}
function clicarPeriodo(doc, periodoId) {
  const botao = doc.querySelector(`#periodoTabs .filter-tab[data-periodo="${periodoId}"]`);
  botao.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
}

test('Início: hero ("R$ … no período") e legenda dos 5 painéis de Rentabilidade (inclusive Ações Internacionais), nos 6 períodos, batem com o cálculo independente', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const { dom, doc } = await montarInicioNaTela(home);
  const s = home.historico;
  const erros = [];
  const tabela = [];
  for (const periodoId of PERIODOS) {
    clicarPeriodo(doc, periodoId);
    for (const v of VISOES_INICIO) {
      const info = doc.getElementById(`rentabInfo${v.sufixo}`);
      const valorTela = lerBRL(info.querySelector('.rentab-card-value').textContent);
      const deltaTela = lerDeltaPeriodo(info.querySelector('.rentab-card-delta').textContent);
      const esperadoValor = v.valor ? v.valor(home.patrimonio) : (v.visaoId === 'total' ? home.patrimonio.total : home.patrimonio[v.visaoId]);
      // se a visão nasce dentro da janela (Ações Internacionais em "3 anos"),
      // portfólio e benchmark começam juntos no nascimento
      const jan0 = janelaOraculo(s, periodoId, v.campo);
      const jan = jan0.slice(Math.max(0, jan0.findIndex((x) => num(x[v.campo]) && x[v.campo] !== 0)));
      const o = twrOraculo(jan, v.campo, v.fluxo, s);
      tabela.push(`${v.visaoId}/${periodoId}: tela ${deltaTela && deltaTela.pct}% R$ ${deltaTela && deltaTela.ganho} | oráculo ${r2(o.pct)}% R$ ${r2(o.ganho)}`);
      if (Math.abs(valorTela - r2(esperadoValor)) > 0.011) erros.push(`${v.visaoId}/${periodoId}: valor na tela ${valorTela} != ao vivo ${r2(esperadoValor)}`);
      if (!deltaTela) { erros.push(`${v.visaoId}/${periodoId}: sem "no período" na tela`); continue; }
      if (Math.abs(deltaTela.pct - r2(o.pct)) > 0.011) erros.push(`${v.visaoId}/${periodoId}: % na tela ${deltaTela.pct} != oráculo ${r2(o.pct)}`);
      if (Math.abs(deltaTela.ganho - r2(o.ganho)) > 0.011) erros.push(`${v.visaoId}/${periodoId}: R$ na tela ${deltaTela.ganho} != oráculo ${r2(o.ganho)}`);

      // legenda: "Benchmark ±x%" = Portfólio − benchmark no mesmo período
      const benchmarks = v.benchmarks || (v.visaoId === 'rendaEmergencial' ? ['indiceCdi', 'indiceSelic'] : ['ibovespa', 'indiceCdi']);
      const deltasLegenda = [...doc.querySelectorAll(`#rentabLegenda${v.sufixo} .li-delta`)].map((el) => lerPct(el.textContent));
      benchmarks.forEach((campoB, i) => {
        const jb = jan.filter((x) => num(x[campoB]));
        if (jb.length < 2) return;
        const retB = (jb[jb.length - 1][campoB] / jb[0][campoB] - 1) * 100;
        const esperado = r2(r2(o.pct) - retB);
        if (deltasLegenda[i] == null || Math.abs(deltasLegenda[i] - esperado) > 0.02) erros.push(`${v.visaoId}/${periodoId}: legenda ${campoB} na tela ${deltasLegenda[i]} != ${esperado}`);
      });
    }
  }
  dom.window.close();
  t.diagnostic(tabela.join('\n'));
  assert.deepEqual(erros, []);
});

test('Início: coerência entre os painéis - o ganho em R$ de cada período soma certo (Total = Longo Prazo + Emergencial; Longo Prazo = Nacional + Ações EUA; Nacional = Ações + FIIs + RF Longo Prazo)', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const s = home.historico;
  const erros = [];
  for (const periodoId of PERIODOS) {
    // mesma janela pra todo mundo (a do Total) - aí o ganho em R$ tem que
    // somar exatamente, porque valor e fluxo somam exatamente todo dia
    const jan = janelaOraculo(s, periodoId, 'patrimonio');
    const g = (campo, fluxo) => {
      const a = jan[0], b = jan[jan.length - 1];
      return b[campo] - a[campo] - jan.slice(1).reduce((soma, x) => soma + (x[fluxo] || 0), 0);
    };
    const total = g('patrimonio', 'fluxoCaixaPatrimonio');
    const lp = g('longoPrazo', 'fluxoCaixaLongoPrazo');
    const re = g('rendaEmergencial', 'fluxoCaixaRendaEmergencial');
    const nac = g('nacional', 'fluxoCaixaNacional');
    const eua = g('acoesEua', 'fluxoCaixaAcoesEua');
    const acoes = g('acoes', 'fluxoCaixaAcoes');
    const fiis = g('fiis', 'fluxoCaixaFiis');
    const rflp = g('rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo');
    if (Math.abs(total - (lp + re)) > 0.05) erros.push(`${periodoId}: Total ${r2(total)} != LP ${r2(lp)} + Emergencial ${r2(re)}`);
    if (Math.abs(lp - (nac + eua)) > 0.05) erros.push(`${periodoId}: LP ${r2(lp)} != Nacional ${r2(nac)} + EUA ${r2(eua)}`);
    if (Math.abs(nac - (acoes + fiis + rflp)) > 0.05) erros.push(`${periodoId}: Nacional ${r2(nac)} != Ações ${r2(acoes)} + FIIs ${r2(fiis)} + RF LP ${r2(rflp)}`);
    t.diagnostic(`${periodoId}: Total ${r2(total)} = LP ${r2(lp)} + Emerg ${r2(re)}; LP = Nacional ${r2(nac)} + EUA ${r2(eua)}; Nacional = Ações ${r2(acoes)} + FIIs ${r2(fiis)} + RF LP ${r2(rflp)}`);
  }
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 7) Carteiras
// ---------------------------------------------------------------------------
function domCarteiras() {
  const html = fs.readFileSync(path.join(ROOT, 'carteiras', 'index.html'), 'utf8');
  const corpo = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
  const dom = new JSDOM(`<!doctype html><html>${corpo.replace(/<script[\s\S]*?<\/script>/g, '')}</body></html>`);
  return { dom, doc: dom.window.document };
}

test('Carteiras > Visão geral: hero (Patrimônio, Valor aplicado, Resultado, Rentabilidade) = mesmos números da Início e do fim da linha "Valor aplicado" do gráfico', async (t) => {
  if (pular(t)) return;
  const r = await dados();
  const { montarPaginaCarteirasVisaoGeral } = await imp('assets/js/pages/carteiras-visao-geral.js');
  const { dom, doc } = domCarteiras();
  await montarPaginaCarteirasVisaoGeral('token-fake', {
    doc,
    getCarteirasHomeImpl: async () => ({ ok: true, carteiras: r.carteirasHome }),
    getHomeImpl: async () => r.home,
  });
  const s = r.home.historico;
  const patrimonioTela = lerBRL(doc.getElementById('vgPatrimonioTotal').textContent);
  const resumo = doc.getElementById('vgResumo').textContent;
  const [aplicadoTela, resultadoTela] = [...resumo.matchAll(/R\$\s*[\d.]+,\d{2}/g)].map((m) => lerBRL(m[0]));
  const rentTela = lerPct(resumo.slice(resumo.indexOf('Rentabilidade')));
  const aplicadoOraculo = s.reduce((soma, x) => soma + (x.fluxoAplicadoPatrimonio || 0), 0);
  const o = twrOraculo(janelaOraculo(s, 'tudo', 'patrimonio'), 'patrimonio', 'fluxoCaixaPatrimonio', s);
  dom.window.close();
  t.diagnostic(`tela: patrimônio ${patrimonioTela} | Valor aplicado ${aplicadoTela} | Resultado ${resultadoTela} | Rentabilidade ${rentTela}%`);
  assert.ok(/Valor aplicado/.test(resumo), 'rótulo "Valor aplicado" no hero');
  assert.ok(Math.abs(patrimonioTela - r2(r.home.patrimonio.total)) <= 0.011);
  assert.ok(Math.abs(aplicadoTela - r2(aplicadoOraculo)) <= 0.011, `Valor aplicado na tela ${aplicadoTela} != soma dos aportes/custos ${r2(aplicadoOraculo)}`);
  assert.ok(Math.abs(Math.abs(resultadoTela) - Math.abs(r2(o.ganho))) <= 0.011, `Resultado na tela ${resultadoTela} != oráculo ${r2(o.ganho)}`);
  assert.ok(Math.abs(rentTela - r2(o.pct)) <= 0.011, `Rentabilidade na tela ${rentTela} != oráculo ${r2(o.pct)}`);
});

test('Carteiras > Ações, FIIs e Renda Fixa: "Valor aplicado" do topo = fim da linha "Valor aplicado" do gráfico (histórico), centavo por centavo', async (t) => {
  if (pular(t)) return;
  const r = await dados();
  const { comHistoricoAcumuladoClasse_ } = await imp('assets/js/pages/carteiras-classe-comum.js');
  const { CAMPO_FLUXO_APLICADO_POR_VISAO } = await imp('assets/js/pages/inicio.js');
  const casos = [
    ['acoes', 'carteiraAcoes', r.carteirasAcoes, 'assets/js/pages/carteiras-acoes.js', 'montarPaginaCarteirasAcoes', 'getCarteirasAcoesImpl', 'acoesConteudo'],
    ['fiis', 'carteiraFiis', r.carteirasFiis, 'assets/js/pages/carteiras-fiis.js', 'montarPaginaCarteirasFiis', 'getCarteirasFiisImpl', 'fiisConteudo'],
    // 23/09/2026 #2: Renda Fixa também - custo PEPS das Transações (a mesma
    // conta do "Valor aplicado" da Visão geral), não mais a coluna manual.
    ['renda fixa', 'carteiraRendaFixaTotal', r.carteirasRendaFixa, 'assets/js/pages/carteiras-renda-fixa.js', 'montarPaginaCarteirasRendaFixa', 'getCarteirasRendaFixaImpl', 'rendaFixaConteudo'],
  ];
  for (const [nome, visaoId, carteira, arquivo, fn, impl, idConteudo] of casos) {
    const mod = await imp(arquivo);
    const { dom, doc } = domCarteiras();
    await mod[fn]('token-fake', { doc, [impl]: async () => ({ ok: true, carteira }), getHomeImpl: async () => r.home });
    const topo = lerBRL(doc.getElementById(idConteudo).querySelector('.cc-resumo-investido').textContent);
    dom.window.close();
    const linha = comHistoricoAcumuladoClasse_(r.home.historico, CAMPO_FLUXO_APLICADO_POR_VISAO[visaoId]);
    const fimLinha = linha[linha.length - 1].investidoAcumulado;
    t.diagnostic(`${nome}: topo ${topo} | fim da linha ${r2(fimLinha)}`);
    assert.ok(Math.abs(topo - r2(fimLinha)) <= 0.005, `${nome}: Valor aplicado no topo ${topo} != fim da linha do gráfico ${r2(fimLinha)}`);
  }
});

test('Carteiras > cada classe: fim do gráfico de Evolução = valor ao vivo que o topo da página mostra', async (t) => {
  if (pular(t)) return;
  const r = await dados();
  const u = r.home.historico[r.home.historico.length - 1];
  const cambio = r.home.cambio.usd;
  const casos = [
    ['Ações', u.acoes, r.carteirasAcoes.resumo.totalAtualizado],
    ['FIIs', u.fiis, r.carteirasFiis.resumo.totalAtualizado],
    ['Ações EUA (R$)', u.acoesEua, r.carteirasAcoesEua.resumo.totalAtualizado * cambio],
    ['Renda Fixa', u.rendaFixaTotal, r.carteirasRendaFixa.resumo.totalAtualizado],
  ];
  const erros = [];
  for (const [nome, fimGrafico, topo] of casos) {
    // Ações EUA: o topo é USD × câmbio de agora; o card do Dash usa a mesma
    // cotação - diferença só de arredondamento do câmbio
    if (Math.abs(fimGrafico - topo) > Math.max(0.05, Math.abs(topo) * 0.002)) erros.push(`${nome}: fim do gráfico ${fimGrafico} != topo ${r2(topo)}`);
  }
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 8) Renda Fixa: tamanho do ajuste de marcação
// ---------------------------------------------------------------------------
test('Renda Fixa: diferença entre o valor manual da planilha e a projeção do histórico (ajuste de marcação, que NÃO conta como rendimento) fica abaixo de 1,5% da Renda Fixa', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const u = home.historico[home.historico.length - 1];
  const rf = home.patrimonio.porClasse.rendaFixa;
  t.diagnostic(`ajuste de marcação hoje: Renda Fixa R$ ${u.ajusteMarcacaoRendaFixa} (${((u.ajusteMarcacaoRendaFixa / rf) * 100).toFixed(2)}%), Renda Emergencial R$ ${u.ajusteMarcacaoRendaEmergencial}`);
  assert.equal(typeof u.ajusteMarcacaoRendaFixa, 'number');
  assert.ok(Math.abs(u.ajusteMarcacaoRendaFixa) / rf < 0.015, 'a projeção da Renda Fixa se afastou demais do valor da planilha - conferir compras faltando em "Transações Renda Fixa"');
});

// ---------------------------------------------------------------------------
// 9) Renda Fixa: aporte e saldo no MESMO dia
// ---------------------------------------------------------------------------
test('Renda Fixa: em todo dia com compra/venda/resgate, o saldo da Renda Fixa muda junto com o aporte (nunca um dia depois)', async (t) => {
  if (pular(t)) return;
  const { home, diagnosticoRf } = await dados();
  const s = home.historico;
  const erros = [];
  for (let i = 1; i < s.length - 1; i += 1) { // o último ponto (ao vivo) tem o ajuste de marcação - fora
    const f = s[i].fluxoCaixaRendaFixaTotal || 0;
    if (Math.abs(f) < 1) continue;
    const residuo = s[i].rendaFixaTotal - s[i - 1].rendaFixaTotal - f;
    if (Math.abs(residuo) > 0.06 * Math.abs(f) + 0.002 * s[i - 1].rendaFixaTotal) {
      erros.push(`${s[i].data}: aporte ${r2(f)}, saldo mudou ${r2(s[i].rendaFixaTotal - s[i - 1].rendaFixaTotal)}`);
    }
  }
  t.diagnostic(`posições realinhadas na leitura: ${JSON.stringify(diagnosticoRf.deslocamentos || [])}`);
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 10) Início: cards do resumo ("ontem era")
// ---------------------------------------------------------------------------
test('Início: cards do resumo - valor = ao vivo e "ontem era" = fechamento do último pregão no gráfico (mesma régua de hoje), com a variação certa', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const { dom, doc } = await montarInicioNaTela(home);
  const s = home.historico;
  const hoje = s[s.length - 1];
  let ontem = null;
  for (let i = s.length - 2; i >= 0; i -= 1) if (s[i].pregao) { ontem = s[i]; break; }
  const ajRf = hoje.ajusteMarcacaoRendaFixa || 0, ajRe = hoje.ajusteMarcacaoRendaEmergencial || 0;
  const esperado = {
    total: [home.patrimonio.total, ontem.patrimonio + ajRf],
    longoPrazo: [home.patrimonio.longoPrazo, ontem.longoPrazo + ajRf - ajRe],
    nacional: [home.patrimonio.nacional, ontem.nacional + ajRf - ajRe],
    rendaEmergencial: [home.patrimonio.rendaEmergencial, ontem.rendaEmergencial + ajRe],
  };
  const cards = [...doc.querySelectorAll('#resumoPatrimonio .resumo-card')];
  const erros = [];
  ['total', 'longoPrazo', 'nacional', 'rendaEmergencial'].forEach((visaoId, i) => {
    const valorTela = lerBRL(cards[i].querySelector('.resumo-value').textContent);
    const txtOntem = cards[i].querySelector('.resumo-ontem').textContent;
    const ontemTela = lerBRL(txtOntem);
    const varTela = lerPct(txtOntem.slice(txtOntem.lastIndexOf(' - ')));
    const [vHoje, vOntem] = esperado[visaoId];
    const varEsperada = r2((vHoje / vOntem - 1) * 100);
    t.diagnostic(`${visaoId}: hoje ${valorTela} | ontem era ${ontemTela} (${ontem.data}) | ${varTela}%`);
    if (Math.abs(valorTela - r2(vHoje)) > 0.011) erros.push(`${visaoId}: valor ${valorTela} != ${r2(vHoje)}`);
    if (Math.abs(ontemTela - r2(vOntem)) > 0.011) erros.push(`${visaoId}: ontem ${ontemTela} != ${r2(vOntem)}`);
    if (Math.abs(varTela - varEsperada) > 0.011) erros.push(`${visaoId}: variação ${varTela} != ${varEsperada}`);
    // 23/09/2026 #3: as fatias por classe dentro do card somam o valor do
    // card (antes a fatia "Ações EUA" ficava alguns centavos diferente do resto)
    if (visaoId !== 'rendaEmergencial') {
      const fatias = [...cards[i].querySelector('.resumo-distrib').textContent.matchAll(/R\$\s*[\d.]+,\d{2}/g)].map((m) => lerBRL(m[0]));
      const somaFatias = fatias.reduce((a, b) => a + b, 0);
      if (Math.abs(somaFatias - r2(vHoje)) > 0.021) erros.push(`${visaoId}: fatias por classe somam ${r2(somaFatias)} != valor do card ${r2(vHoje)} (${fatias.join(' + ')})`);
    }
  });
  dom.window.close();
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 11) Carteiras: rentabilidade de cada classe, todos os períodos
// ---------------------------------------------------------------------------
const VISOES_CLASSE = [
  ['carteiraAcoes', 'acoes', 'fluxoCaixaAcoes', 'fluxoAplicadoAcoes'],
  ['carteiraFiis', 'fiis', 'fluxoCaixaFiis', 'fluxoAplicadoFiis'],
  ['carteiraAcoesEua', 'acoesEua', 'fluxoCaixaAcoesEua', 'fluxoAplicadoAcoesEua'],
  ['carteiraRendaFixaTotal', 'rendaFixaTotal', 'fluxoCaixaRendaFixaTotal', 'fluxoAplicadoRendaFixaTotal'],
  ['carteiraRendaFixaLongoPrazo', 'rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo', 'fluxoAplicadoRendaFixaLongoPrazo'],
  ['carteiraRendaFixaEmergencial', 'rendaEmergencial', 'fluxoCaixaRendaEmergencial', 'fluxoAplicadoRendaEmergencial'],
];

test('Carteiras > cada classe, nos 6 períodos: % e R$ que o app calcula = oráculo independente; "Desde o início" = valor de hoje − tudo o que entrou (o 1º dia conta a partir do custo)', async (t) => {
  if (pular(t)) return;
  const { home } = await dados();
  const inicio = await imp('assets/js/pages/inicio.js');
  const s = home.historico;
  const erros = [];
  for (const [visaoId, campo, fluxo] of VISOES_CLASSE) {
    for (const periodoId of PERIODOS) {
      const app = inicio.calcularResumoRentabilidade(home.patrimonio, s, { visaoId, periodoId });
      const o = twrOraculo(janelaOraculo(s, periodoId, campo), campo, fluxo, s);
      if (Math.abs(app.percentual - o.pct) > 0.005) erros.push(`${visaoId}/${periodoId}: % app ${r2(app.percentual)} != oráculo ${r2(o.pct)}`);
      if (Math.abs(app.ganhoReais - o.ganho) > 0.01) erros.push(`${visaoId}/${periodoId}: R$ app ${r2(app.ganhoReais)} != oráculo ${r2(o.ganho)}`);
    }
    const tudo = inicio.calcularResumoRentabilidade(home.patrimonio, s, { visaoId, periodoId: 'tudo' });
    const entrou = s.reduce((soma, x) => soma + (num(x[fluxo]) || 0), 0);
    const hoje = s[s.length - 1][campo];
    t.diagnostic(`${visaoId}: desde o início ${r2(tudo.percentual)}% / R$ ${r2(tudo.ganhoReais)} (hoje ${r2(hoje)} − entrou ${r2(entrou)})`);
    if (Math.abs(tudo.ganhoReais - (hoje - entrou)) > 0.01) erros.push(`${visaoId}: ganho desde o início ${r2(tudo.ganhoReais)} != hoje − tudo o que entrou ${r2(hoje - entrou)}`);
  }
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 12) Carteiras: cards da Visão geral x topo das subpáginas x gráfico
// ---------------------------------------------------------------------------
async function montarTopoSubpagina(r, arquivo, fn, impl, carteira, idConteudo) {
  const mod = await imp(arquivo);
  const { dom, doc } = domCarteiras();
  await mod[fn]('token-fake', { doc, [impl]: async () => ({ ok: true, carteira }), getHomeImpl: async () => r.home });
  const el = doc.getElementById(idConteudo);
  const out = {
    texto: el.querySelector('.cc-resumo').textContent.replace(/\s+/g, ' '),
    investido: el.querySelector('.cc-resumo-investido'),
    tooltips: [...el.querySelectorAll('.cc-resumo .info-alvo')].map((x) => x.dataset.tooltip),
    stats: [...el.querySelectorAll('.cc-resumo-stat')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
  };
  out.investido = out.investido ? out.investido.textContent : '';
  dom.window.close();
  return out;
}

test('Carteiras > Visão geral: "Valor aplicado" de cada card = topo da subpágina = fim da linha do gráfico (Ações EUA em R$, câmbio de cada compra); os 4 somam o hero; lucro = valor − aplicado e o % tem as casas certas', async (t) => {
  if (pular(t)) return;
  const r = await dados();
  const { montarPaginaCarteirasVisaoGeral } = await imp('assets/js/pages/carteiras-visao-geral.js');
  const { dom, doc } = domCarteiras();
  await montarPaginaCarteirasVisaoGeral('token-fake', {
    doc,
    getCarteirasHomeImpl: async () => ({ ok: true, carteiras: r.carteirasHome }),
    getHomeImpl: async () => r.home,
  });
  const cards = Object.fromEntries([...doc.querySelectorAll('#vgCardsGrid .cg-card')].map((c) => {
    const nome = c.querySelector('.cg-card-nome').textContent.trim();
    const linha = c.querySelector('.cg-card-linha').textContent;
    const [aplicado, lucro] = [...linha.matchAll(/-?R\$\s*[\d.]+,\d{2}/g)].map((m) => lerBRL(m[0]));
    return [nome, { aplicado, lucro: /-R\$|−/.test(linha.split('Valor aplicado')[1].slice(linha.split('Valor aplicado')[1].indexOf('R$') + 4)) ? -Math.abs(lucro) : lucro, pct: lerPct(c.querySelector('.cg-card-rentab').textContent), valor: lerBRL(c.querySelector('.cg-card-valor').textContent), rotulo: /Valor aplicado/.test(linha) }];
  }));
  const hero = doc.getElementById('vgResumo').textContent;
  const aplicadoHero = lerBRL(hero.slice(hero.indexOf('Valor aplicado')));
  dom.window.close();
  const s = r.home.historico;
  const soma = (campo) => s.reduce((a, x) => a + (num(x[campo]) || 0), 0);
  const esperado = {
    'Ações': soma('fluxoAplicadoAcoes'), 'FIIs': soma('fluxoAplicadoFiis'),
    'Ações Internacionais': soma('fluxoAplicadoAcoesEua'), 'Renda Fixa': soma('fluxoAplicadoRendaFixaTotal'),
  };
  const erros = [];
  let somaCards = 0;
  for (const [nome, e] of Object.entries(esperado)) {
    const c = cards[nome];
    if (!c) { erros.push(`card ${nome} sumiu`); continue; }
    somaCards += c.aplicado;
    if (!c.rotulo) erros.push(`${nome}: card sem o rótulo "Valor aplicado"`);
    if (Math.abs(c.aplicado - r2(e)) > 0.005) erros.push(`${nome}: card ${c.aplicado} != fim da linha do gráfico ${r2(e)}`);
    const lucroEsperado = c.valor - e;
    if (Math.abs(Math.abs(c.lucro) - Math.abs(r2(lucroEsperado))) > 0.011) erros.push(`${nome}: lucro no card ${c.lucro} != valor − aplicado ${r2(lucroEsperado)}`);
    if (Math.abs(c.pct - r2((lucroEsperado / e) * 100)) > 0.011) erros.push(`${nome}: % no card ${c.pct} != ${r2((lucroEsperado / e) * 100)}`);
    t.diagnostic(`${nome}: valor ${c.valor} | Valor aplicado ${c.aplicado} | lucro ${c.lucro} (${c.pct}%)`);
  }
  if (Math.abs(somaCards - aplicadoHero) > 0.03) erros.push(`soma dos cards ${r2(somaCards)} != Valor aplicado do hero ${aplicadoHero}`);

  // topo de cada subpágina
  const topos = {
    'Ações': await montarTopoSubpagina(r, 'assets/js/pages/carteiras-acoes.js', 'montarPaginaCarteirasAcoes', 'getCarteirasAcoesImpl', r.carteirasAcoes, 'acoesConteudo'),
    'FIIs': await montarTopoSubpagina(r, 'assets/js/pages/carteiras-fiis.js', 'montarPaginaCarteirasFiis', 'getCarteirasFiisImpl', r.carteirasFiis, 'fiisConteudo'),
    'Renda Fixa': await montarTopoSubpagina(r, 'assets/js/pages/carteiras-renda-fixa.js', 'montarPaginaCarteirasRendaFixa', 'getCarteirasRendaFixaImpl', r.carteirasRendaFixa, 'rendaFixaConteudo'),
    'Ações Internacionais': await montarTopoSubpagina(r, 'assets/js/pages/carteiras-acoes-eua.js', 'montarPaginaCarteirasAcoesEua', 'getCarteirasAcoesEuaImpl', r.carteirasAcoesEua, 'acoesEuaConteudo'),
  };
  for (const nome of ['Ações', 'FIIs', 'Renda Fixa']) {
    const topo = lerBRL(topos[nome].investido);
    if (Math.abs(topo - cards[nome].aplicado) > 0.005) erros.push(`${nome}: topo da subpágina ${topo} != card da Visão geral ${cards[nome].aplicado}`);
    const pctTopo = lerPct(topos[nome].stats[0]);
    if (Math.abs(pctTopo - cards[nome].pct) > 0.011) erros.push(`${nome}: % no topo ${pctTopo} != card ${cards[nome].pct}`);
  }
  const eua = topos['Ações Internacionais'].tooltips;
  const aplicadoEuaBrl = lerBRL(eua[1] || '');
  const lucroEuaBrl = lerBRL(eua[2] || '');
  t.diagnostic(`Ações EUA, "i" do topo: ${JSON.stringify(eua)}`);
  if (aplicadoEuaBrl == null || Math.abs(aplicadoEuaBrl - cards['Ações Internacionais'].aplicado) > 0.011) erros.push(`Ações EUA: "i" do Valor aplicado ${aplicadoEuaBrl} != card ${cards['Ações Internacionais'].aplicado}`);
  if (lucroEuaBrl == null || Math.abs(Math.abs(lucroEuaBrl) - Math.abs(cards['Ações Internacionais'].lucro)) > 0.011) erros.push(`Ações EUA: "i" do lucro ${lucroEuaBrl} != card ${cards['Ações Internacionais'].lucro}`);
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 13) Ações e FIIs: proventos e decomposição do "desde o início"
// ---------------------------------------------------------------------------
test('Carteiras > Ações e FIIs: "Proventos recebidos" = soma da aba Proventos da classe (inclusive códigos antigos) e Resultado desde o início = Lucro/Prejuízo da posição + Proventos + lucro realizado nas vendas, centavo por centavo', async (t) => {
  if (pular(t)) return;
  const r = await dados();
  const inicio = await imp('assets/js/pages/inicio.js');
  const hoje = hojeSp();
  // oráculo direto da aba: FII = código terminado em 11; "ERRO" = cupom de
  // Tesouro (Renda Fixa); o resto é Ações
  const prov = { acoes: 0, fiis: 0 };
  for (const l of (r.fixtures['Proventos']?.linhas || []).slice(7)) {
    const tk = String(l[2] || '').trim().toUpperCase();
    if (!tk || !l[1] || !l[1].__date__ || typeof l[6] !== 'number') continue;
    if (chaveSpDeCelula(l[1]) > hoje || tk === 'ERRO') continue;
    prov[/11$/.test(tk) ? 'fiis' : 'acoes'] += l[6];
  }
  // lucro realizado nas vendas (coluna L de "Transações", calculada pela
  // própria planilha) - 23/09/2026 #7: a venda da AXIA15G (Controle 10)
  const fora = new Set(r.sandbox.TICKERS_FORA_DO_HISTORICO || []);
  const realizado = { acoes: 0, fiis: 0 };
  for (const l of (r.fixtures['Transações']?.linhas || []).slice(6)) {
    const tk = String(l[0] || '').trim().toUpperCase();
    if (!tk || l[2] !== 'Venda' || fora.has(tk) || typeof l[11] !== 'number') continue;
    realizado[/11$/.test(tk) ? 'fiis' : 'acoes'] += l[11];
  }
  const casos = [
    ['acoes', 'carteiraAcoes', 'assets/js/pages/carteiras-acoes.js', 'montarPaginaCarteirasAcoes', 'getCarteirasAcoesImpl', r.carteirasAcoes, 'acoesConteudo'],
    ['fiis', 'carteiraFiis', 'assets/js/pages/carteiras-fiis.js', 'montarPaginaCarteirasFiis', 'getCarteirasFiisImpl', r.carteirasFiis, 'fiisConteudo'],
  ];
  const erros = [];
  for (const [classe, visaoId, arquivo, fn, impl, carteira, idConteudo] of casos) {
    const topo = await montarTopoSubpagina(r, arquivo, fn, impl, carteira, idConteudo);
    const provTela = lerBRL(topo.stats.find((x) => /Proventos/.test(x)) || '');
    const valor = lerBRL(topo.texto);
    const aplicado = lerBRL(topo.investido);
    const tudo = inicio.calcularResumoRentabilidade(r.home.patrimonio, r.home.historico, { visaoId, periodoId: 'tudo' });
    t.diagnostic(`${classe}: valor ${valor} − aplicado ${aplicado} = lucro ${r2(valor - aplicado)}; + proventos ${provTela} + realizado ${r2(realizado[classe])} = ${r2(valor - aplicado + provTela + realizado[classe])} | resultado desde o início (gráfico) ${r2(tudo.ganhoReais)} (${r2(tudo.percentual)}%)`);
    if (Math.abs(provTela - r2(prov[classe])) > 0.011) erros.push(`${classe}: "Proventos recebidos" na tela ${provTela} != aba Proventos ${r2(prov[classe])}`);
    if (Math.abs((valor - aplicado + provTela + realizado[classe]) - tudo.ganhoReais) > 0.03) erros.push(`${classe}: lucro ${r2(valor - aplicado)} + proventos ${provTela} + realizado ${r2(realizado[classe])} != resultado desde o início ${r2(tudo.ganhoReais)}`);
  }
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 14) Carteiras: legenda dos gráficos de Rentabilidade das subpáginas
// ---------------------------------------------------------------------------
test('Carteiras > Ações, FIIs, Ações EUA e Renda Fixa (3 gráficos): legenda "Benchmark ±x%" em todos os períodos = Portfólio − benchmark NO MESMO intervalo (se a carteira nasceu dentro da janela, os dois começam no nascimento)', async (t) => {
  if (pular(t)) return;
  const r = await dados();
  const s = r.home.historico;
  const BENCH = {
    carteiraAcoes: ['ibovespa', 'indiceCdi'], carteiraFiis: ['ifix', 'indiceCdi'], carteiraAcoesEua: ['ibovespa', 'sp500'],
    carteiraRendaFixaTotal: ['indiceCdi', 'indiceIpca'], carteiraRendaFixaLongoPrazo: ['indiceCdi', 'indiceIpca'], carteiraRendaFixaEmergencial: ['indiceCdi', 'indiceIpca'],
  };
  const paginas = [
    ['assets/js/pages/carteiras-acoes.js', 'montarPaginaCarteirasAcoes', 'getCarteirasAcoesImpl', r.carteirasAcoes, 'acoesPeriodoTabs', [['carteiraAcoes', 'acoesRentabLegenda']]],
    ['assets/js/pages/carteiras-fiis.js', 'montarPaginaCarteirasFiis', 'getCarteirasFiisImpl', r.carteirasFiis, 'fiisPeriodoTabs', [['carteiraFiis', 'fiisRentabLegenda']]],
    ['assets/js/pages/carteiras-acoes-eua.js', 'montarPaginaCarteirasAcoesEua', 'getCarteirasAcoesEuaImpl', r.carteirasAcoesEua, 'acoesEuaPeriodoTabs', [['carteiraAcoesEua', 'acoesEuaRentabLegenda']]],
    ['assets/js/pages/carteiras-renda-fixa.js', 'montarPaginaCarteirasRendaFixa', 'getCarteirasRendaFixaImpl', r.carteirasRendaFixa, 'rendaFixaPeriodoTabs',
      [['carteiraRendaFixaTotal', 'rfRentabTotalLegenda'], ['carteiraRendaFixaLongoPrazo', 'rfRentabLongoLegenda'], ['carteiraRendaFixaEmergencial', 'rfRentabEmergLegenda']]],
  ];
  const campoDe = Object.fromEntries(VISOES_CLASSE.map(([v, c, f]) => [v, [c, f]]));
  const erros = [];
  const tabela = [];
  for (const [arquivo, fn, impl, carteira, idTabs, paineis] of paginas) {
    const mod = await imp(arquivo);
    const { dom, doc } = domCarteiras();
    await mod[fn]('token-fake', { doc, [impl]: async () => ({ ok: true, carteira }), getHomeImpl: async () => r.home });
    for (const periodoId of PERIODOS) {
      const aba = doc.querySelector(`#${idTabs} .filter-tab[data-periodo="${periodoId}"]`);
      if (!aba) { erros.push(`${idTabs}: sem a aba de período "${periodoId}"`); continue; } // 23/09/2026 #8: todas as telas têm os 6 períodos, inclusive "Mês atual"
      aba.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      for (const [visaoId, idLegenda] of paineis) {
        const [campo, fluxo] = campoDe[visaoId];
        const jan0 = janelaOraculo(s, periodoId, campo);
        const jan = jan0.slice(Math.max(0, jan0.findIndex((x) => num(x[campo]) && x[campo] !== 0)));
        const o = twrOraculo(jan, campo, fluxo, s);
        const deltas = [...doc.querySelectorAll(`#${idLegenda} .li-delta`)].map((el) => lerPct(el.textContent));
        BENCH[visaoId].forEach((campoB, i) => {
          const jb = jan.filter((x) => num(x[campoB]));
          if (jb.length < 2) return;
          const retB = (jb[jb.length - 1][campoB] / jb[0][campoB] - 1) * 100;
          const esperado = r2(r2(o.pct) - retB);
          tabela.push(`${visaoId}/${periodoId}: portfólio ${r2(o.pct)}% | ${campoB} ${r2(retB)}% | legenda ${deltas[i]}`);
          if (deltas[i] == null || Math.abs(deltas[i] - esperado) > 0.02) erros.push(`${visaoId}/${periodoId}: legenda ${campoB} na tela ${deltas[i]} != ${esperado}`);
        });
      }
    }
    dom.window.close();
  }
  t.diagnostic(tabela.join('\n'));
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 15) Início "Ações Internacionais" x Carteiras > Ações EUA
// ---------------------------------------------------------------------------
test('Início: gráfico "Ações Internacionais" bate com Carteiras > Ações EUA em todos os períodos (mesma % e mesma diferença pro S&P 500 e pro Ibovespa) e o valor do card é o mesmo do topo de Ações EUA em reais', async (t) => {
  if (pular(t)) return;
  const r = await dados();
  const { dom, doc } = await montarInicioNaTela(r.home);
  const mod = await imp('assets/js/pages/carteiras-acoes-eua.js');
  const c = domCarteiras();
  await mod.montarPaginaCarteirasAcoesEua('token-fake', { doc: c.doc, getCarteirasAcoesEuaImpl: async () => ({ ok: true, carteira: r.carteirasAcoesEua }), getHomeImpl: async () => r.home });
  const inicio = await imp('assets/js/pages/inicio.js');
  const erros = [];
  const legendaPorBenchmark = (d, id) => Object.fromEntries([...d.querySelectorAll(`#${id} .li`)]
    .filter((li) => li.querySelector('.li-delta'))
    .map((li) => [li.textContent.replace(li.querySelector('.li-delta').textContent, '').trim(), lerPct(li.querySelector('.li-delta').textContent)]));
  for (const periodoId of PERIODOS) {
    clicarPeriodo(doc, periodoId);
    c.doc.querySelector(`#acoesEuaPeriodoTabs .filter-tab[data-periodo="${periodoId}"]`).dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    const home = legendaPorBenchmark(doc, 'rentabLegendaInternacional');
    const cart = legendaPorBenchmark(c.doc, 'acoesEuaRentabLegenda');
    for (const nome of ['S&P 500', 'Ibovespa']) {
      if (home[nome] == null || cart[nome] == null || Math.abs(home[nome] - cart[nome]) > 0.001) erros.push(`${periodoId} ${nome}: Início ${home[nome]} x Carteiras ${cart[nome]}`);
    }
    const a = inicio.calcularResumoRentabilidade(r.home.patrimonio, r.home.historico, { visaoId: 'internacional', periodoId });
    const b = inicio.calcularResumoRentabilidade(r.home.patrimonio, r.home.historico, { visaoId: 'carteiraAcoesEua', periodoId });
    if (Math.abs(a.percentual - b.percentual) > 1e-9 || Math.abs(a.ganhoReais - b.ganhoReais) > 1e-9) erros.push(`${periodoId}: Início ${a.percentual}% / ${a.ganhoReais} x Carteiras ${b.percentual}% / ${b.ganhoReais}`);
    t.diagnostic(`${periodoId}: ${r2(a.percentual)}% · R$ ${r2(a.ganhoReais)} · legenda ${JSON.stringify(home)}`);
  }
  const valorCard = lerBRL(doc.getElementById('rentabInfoInternacional').querySelector('.rentab-card-value').textContent);
  const iEua = lerBRL(c.doc.querySelector('#acoesEuaConteudo .cc-resumo .info-alvo').dataset.tooltip);
  if (Math.abs(valorCard - iEua) > 0.011) erros.push(`valor do card ${valorCard} x "i" do topo de Ações EUA ${iEua}`);
  dom.window.close(); c.dom.window.close();
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 19) Carteiras: valores em cima dos gráficos (23/09/2026 #8)
// ---------------------------------------------------------------------------
test('Carteiras > Visão geral, Ações, FIIs, Ações EUA e Renda Fixa: em cima de cada gráfico, nos 6 períodos - Rentabilidade "R$ hoje / ±R$ ganho ±x% no período" = oráculo; Evolução "R$ hoje / ±R$ variação da linha" e "Valor aplicado ±R$ (±x%)" = pontas das 2 linhas', async (t) => {
  if (pular(t)) return;
  const r = await dados();
  const s = r.home.historico;
  const DEF = Object.fromEntries(VISOES_CLASSE.map(([v, c, f, a]) => [v, { campo: c, fluxo: f, aplicado: a }]));
  DEF.total = { campo: 'patrimonio', fluxo: 'fluxoCaixaPatrimonio', aplicado: 'fluxoAplicadoPatrimonio' };
  const paginas = [
    ['assets/js/pages/carteiras-visao-geral.js', 'montarPaginaCarteirasVisaoGeral', { getCarteirasHomeImpl: async () => ({ ok: true, carteiras: r.carteirasHome }) }, 'vgPeriodoTabs',
      [['total', 'vgInfoRentabilidade', 'vgInfoEvolucao', true]]],
    ['assets/js/pages/carteiras-acoes.js', 'montarPaginaCarteirasAcoes', { getCarteirasAcoesImpl: async () => ({ ok: true, carteira: r.carteirasAcoes }) }, 'acoesPeriodoTabs',
      [['carteiraAcoes', 'acoesRentabInfo', 'acoesEvolucaoInfo', true]]],
    ['assets/js/pages/carteiras-fiis.js', 'montarPaginaCarteirasFiis', { getCarteirasFiisImpl: async () => ({ ok: true, carteira: r.carteirasFiis }) }, 'fiisPeriodoTabs',
      [['carteiraFiis', 'fiisRentabInfo', 'fiisEvolucaoInfo', true]]],
    ['assets/js/pages/carteiras-acoes-eua.js', 'montarPaginaCarteirasAcoesEua', { getCarteirasAcoesEuaImpl: async () => ({ ok: true, carteira: r.carteirasAcoesEua }) }, 'acoesEuaPeriodoTabs',
      [['carteiraAcoesEua', 'acoesEuaRentabInfo', 'acoesEuaEvolucaoInfo', true]]],
    ['assets/js/pages/carteiras-renda-fixa.js', 'montarPaginaCarteirasRendaFixa', { getCarteirasRendaFixaImpl: async () => ({ ok: true, carteira: r.carteirasRendaFixa }) }, 'rendaFixaPeriodoTabs',
      [['carteiraRendaFixaTotal', 'rfRentabTotalInfo', 'rfEvolucaoTotalInfo', true],
        ['carteiraRendaFixaLongoPrazo', 'rfRentabLongoInfo', 'rfEvolucaoLongoInfo', false],
        ['carteiraRendaFixaEmergencial', 'rfRentabEmergInfo', 'rfEvolucaoEmergInfo', false]]],
  ];
  const erros = [];
  const tabela = [];
  for (const [arquivo, fn, impls, idTabs, paineis] of paginas) {
    const mod = await imp(arquivo);
    const { dom, doc } = domCarteiras();
    await mod[fn]('token-fake', { doc, ...impls, getHomeImpl: async () => r.home });
    for (const periodoId of PERIODOS) {
      doc.querySelector(`#${idTabs} .filter-tab[data-periodo="${periodoId}"]`).dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      for (const [visaoId, idRentab, idEvol, comAplicado] of paineis) {
        const { campo, fluxo, aplicado } = DEF[visaoId];
        const hoje = s[s.length - 1][campo];
        // Rentabilidade (mesmo oráculo da Início)
        const infoR = doc.getElementById(idRentab);
        if (!infoR || !infoR.querySelector('.rentab-card-value')) { erros.push(`${visaoId}/${periodoId}: sem o bloco de valor em cima da Rentabilidade (#${idRentab})`); continue; }
        const jan0 = janelaOraculo(s, periodoId, campo);
        const jan = jan0.slice(Math.max(0, jan0.findIndex((x) => num(x[campo]) && x[campo] !== 0)));
        const o = twrOraculo(jan, campo, fluxo, s);
        const vR = lerBRL(infoR.querySelector('.rentab-card-value').textContent);
        const dR = lerDeltaPeriodo(infoR.querySelector('.rentab-card-delta').textContent);
        if (Math.abs(vR - r2(hoje)) > 0.011) erros.push(`${visaoId}/${periodoId}: Rentabilidade - valor ${vR} != hoje ${r2(hoje)}`);
        if (!dR || Math.abs(dR.pct - r2(o.pct)) > 0.011 || Math.abs(dR.ganho - r2(o.ganho)) > 0.011) erros.push(`${visaoId}/${periodoId}: Rentabilidade - tela ${JSON.stringify(dR)} != oráculo ${r2(o.pct)}% R$ ${r2(o.ganho)}`);
        // Evolução: pontas das 2 linhas desenhadas
        const infoE = doc.getElementById(idEvol);
        if (!infoE || !infoE.querySelector('.rentab-card-value')) { erros.push(`${visaoId}/${periodoId}: sem o bloco de valor em cima da Evolução (#${idEvol})`); continue; }
        const janE = janelaOraculo(s, periodoId, campo).filter((x) => num(x[campo]) != null);
        const ini = janE[0][campo];
        const variacao = hoje - ini;
        const vE = lerBRL(infoE.querySelector('.rentab-card-value').textContent);
        const deltaTxt = infoE.querySelector('.rentab-card-delta').textContent.trim();
        const mD = deltaTxt.match(/^([+-])(R\$\s*[\d.]+,\d{2}) no período$/);
        const ganhoE = mD ? (mD[1] === '-' ? -1 : 1) * lerBRL(mD[2]) : null;
        if (Math.abs(vE - r2(hoje)) > 0.011) erros.push(`${visaoId}/${periodoId}: Evolução - valor ${vE} != hoje ${r2(hoje)}`);
        if (ganhoE == null || Math.abs(ganhoE - r2(variacao)) > 0.011) erros.push(`${visaoId}/${periodoId}: Evolução - "${deltaTxt}" != fim − começo da linha ${r2(variacao)}`);
        if (infoE.querySelector('.rentab-card-delta').classList.contains(variacao >= 0 ? 'bad' : 'good')) erros.push(`${visaoId}/${periodoId}: Evolução - cor trocada`);
        const sub = infoE.querySelector('.rentab-card-sub')?.textContent || '';
        if (comAplicado) {
          const aplicadoTotal = s.reduce((a, x) => a + (num(x[aplicado]) || 0), 0);
          const m = sub.match(/Valor aplicado:\s*(R\$\s*[\d.]+,\d{2})\s*·\s*([+-])(R\$\s*[\d.]+,\d{2})\s+([+-]?[\d.]+,\d+%)\s+(acima|abaixo) do aplicado/);
          if (!m) { erros.push(`${visaoId}/${periodoId}: Evolução - sem "Valor aplicado" (${sub})`); continue; }
          if (Math.abs(lerBRL(m[1]) - r2(aplicadoTotal)) > 0.011) erros.push(`${visaoId}/${periodoId}: Evolução - Valor aplicado ${lerBRL(m[1])} != Σ ${aplicado} ${r2(aplicadoTotal)}`);
          const dif = (m[2] === '-' ? -1 : 1) * lerBRL(m[3]);
          if (Math.abs(dif - r2(hoje - aplicadoTotal)) > 0.011) erros.push(`${visaoId}/${periodoId}: Evolução - diferença pro aplicado ${dif} != ${r2(hoje - aplicadoTotal)}`);
          if (Math.abs(lerPct(m[4]) - r2(((hoje - aplicadoTotal) / aplicadoTotal) * 100)) > 0.011) erros.push(`${visaoId}/${periodoId}: Evolução - % pro aplicado ${m[4]} != ${r2(((hoje - aplicadoTotal) / aplicadoTotal) * 100)}`);
          if ((m[5] === 'acima') !== (hoje >= aplicadoTotal)) erros.push(`${visaoId}/${periodoId}: Evolução - "${m[5]}" trocado`);
        } else if (/Valor aplicado/.test(sub)) erros.push(`${visaoId}/${periodoId}: Evolução sem linha de Valor aplicado não devia mostrar "Valor aplicado"`);
        tabela.push(`${visaoId}/${periodoId}: rentab ${dR && dR.ganho} (${dR && dR.pct}%) | evolução ${ganhoE} | ${sub}`);
      }
    }
    dom.window.close();
  }
  t.diagnostic(tabela.join('\n'));
  assert.deepEqual(erros, []);
});
