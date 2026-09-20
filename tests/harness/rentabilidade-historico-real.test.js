// tests/harness/rentabilidade-historico-real.test.js
//
// 20/09/2026 - teste de regressão "fonte da verdade" pedido pelo Tiago
// ("quero algo generico, um source of thruth dos calculos, para nao haver
// bug. Me comprove que esta tudo certo com os calculos aqui."): roda
// montarSerieHistoricoInicio_() (apps-script/*.gs, texto literal) contra
// dados REAIS da planilha (ver extrair-fixtures.py) e garante que "Desde
// o início" nunca mais trava perto de -100% pra nenhuma visão - o bug
// catastrófico documentado em assets/js/pages/inicio.js
// (normalizarSerieRentabilidade). Se isso falhar de novo no futuro
// (regressão), é porque alguém mexeu no clamp ou reintroduziu o mesmo
// tipo de desalinhamento fonte-a-fonte sem proteção.
//
// Roda só se tests/harness/fixtures.json existir (dado financeiro real,
// não commitado - ver .gitignore e README.md deste diretório). Sem
// fixture, os testes aqui são pulados (t.skip) em vez de falhar - CI e
// clones novos do repositório não têm a planilha do Tiago.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { carregarSerieComDadosReais } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');
const ROOT = path.resolve(__dirname, '..', '..');
const INICIO_JS_PATH = path.join(ROOT, 'assets', 'js', 'pages', 'inicio.js');

const TEM_FIXTURES = fs.existsSync(FIXTURES_PATH);

// Piso de sanidade: nenhuma visão real do Tiago deve ficar abaixo disto
// em "Desde o início" - bem mais generoso que o pior ano real de bolsa
// (evita falso-positivo), mas MUITO acima de "-99,99%" (o valor que o
// bug catastrófico produzia). Se isso disparar de verdade um dia, é
// sinal de bug real, não de portfólio ruim.
const PISO_SANIDADE_PCT = -90;

test('fonte da verdade: "Desde o início" nunca trava perto de -100% pra nenhuma visão (dados reais)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - rode extrair-fixtures.py com um export .xlsx real antes de rodar este teste (ver tests/harness/README.md)');
    return;
  }

  const { serie } = await carregarSerieComDadosReais({ fixturesPath: FIXTURES_PATH });
  assert.ok(serie.length > 0, 'montarSerieHistoricoInicio_() não pode devolver série vazia com fixture real');

  const inicioMod = await import(pathToFileURL(INICIO_JS_PATH).href);
  const { filtrarHistoricoPorPeriodo, normalizarSerieRentabilidade, CAMPO_PRINCIPAL_POR_VISAO, CAMPO_FLUXO_POR_VISAO } = inicioMod;

  function ultimoValido(arr) {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (typeof arr[i] === 'number' && Number.isFinite(arr[i])) return arr[i];
    }
    return null;
  }

  const suspeitos = [];
  for (const visaoId of Object.keys(CAMPO_PRINCIPAL_POR_VISAO)) {
    const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId];
    const campoFluxo = CAMPO_FLUXO_POR_VISAO[visaoId];
    const janela = filtrarHistoricoPorPeriodo(serie, 'tudo', campo);
    if (janela.length < 2) continue;
    const pFinal = ultimoValido(normalizarSerieRentabilidade(janela, campo, campoFluxo));
    if (pFinal !== null && pFinal < PISO_SANIDADE_PCT) {
      suspeitos.push(`${visaoId}: ${pFinal.toFixed(2)}%`);
    }
  }

  assert.deepEqual(suspeitos, [], `visão(ões) com "Desde o início" abaixo do piso de sanidade (${PISO_SANIDADE_PCT}%) - provável regressão do bug de TWR travado: ${suspeitos.join(', ')}`);
});

// 20/09/2026 #2 - segundo bug real achado com dados reais do Tiago (esse
// SEM relação nenhuma com o clamp de TWR acima): new Date("yyyy-MM-dd")
// (as chaves de todasAsChaves, dentro de montarSerieHistoricoInicio_) é
// sempre meia-noite UTC, nunca meia-noite em America/Sao_Paulo (UTC-3) -
// rodar esse Date de volta por chaveDiaISOInicio_ (que formata em SP)
// sempre devolvia o dia ANTERIOR ao pedido, empurrando a série inteira 1
// dia pra trás: o último dia real de Renda Fixa (com posições/valores
// verdadeiros) nunca era lido, e a série ganhava 1 dia "fantasma" vazio
// (sem nenhum dado real) antes do primeiro dia de verdade. Corrigido com
// dataLocalDeChaveInicio_ (HistoricoInicio.gs) - este teste cruza a
// SÉRIE MONTADA contra as datas cruas das 3 abas-fonte (lidas aqui
// direto do fixture, sem passar pelo código sob teste) pra garantir que
// a série cobre EXATAMENTE do primeiro ao último dia real, nunca 1 a
// menos/a mais.
test('fonte da verdade: a série cobre exatamente do 1º ao último dia real das abas-fonte (sem dia fantasma, sem perder o último dia)', async (t) => {
  if (!TEM_FIXTURES) {
    t.skip('tests/harness/fixtures.json ausente - rode extrair-fixtures.py com um export .xlsx real antes de rodar este teste (ver tests/harness/README.md)');
    return;
  }

  const { serie } = await carregarSerieComDadosReais({ fixturesPath: FIXTURES_PATH });
  assert.ok(serie.length > 0, 'montarSerieHistoricoInicio_() não pode devolver série vazia com fixture real');

  // Recalcula, direto do fixture cru (sem passar pelo .gs sob teste), a
  // data mínima/máxima esperada - mesmas 3 abas que
  // montarSerieHistoricoInicio_ usa pra montar todasAsChaves
  // (aux_historico-patrimonio, aux_historico-renda-fixa,
  // aux_historico-indices), convertendo cada data crua pro mesmo
  // "yyyy-MM-dd" em America/Sao_Paulo que o app usa.
  const fixturesRaw = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  function chaveDe(iso) { return fmt.format(new Date(iso)); }

  const chaves = [];
  for (const linha of (fixturesRaw['aux_historico-patrimonio']?.linhas || []).slice(1)) {
    const v = linha[0];
    if (v && typeof v === 'object' && typeof v.__date__ === 'string') chaves.push(chaveDe(v.__date__));
  }
  for (const linha of (fixturesRaw['aux_historico-renda-fixa']?.linhas || []).slice(1)) {
    const v = linha[0];
    if (v && typeof v === 'object' && typeof v.__date__ === 'string') chaves.push(chaveDe(v.__date__));
  }
  // aux_historico-indices tem VÁRIOS índices na mesma aba (Ibovespa, CDI,
  // SELIC, IPCA, IFIX, S&P 500 - coluna "nomeIndice") - só as linhas de
  // 'Ibovespa' entram em porDiaIbovespa (a única das 3 chaves concatenadas
  // em todasAsChaves que vem dessa aba, ver montarSerieHistoricoInicio_)
  // - CDI/SELIC/etc podem ter backfill com alcance diferente e NÃO contam
  // pra data mínima/máxima da série.
  for (const linha of (fixturesRaw['aux_historico-indices']?.linhas || []).slice(1)) {
    const v = linha[0];
    if (linha[1] === 'Ibovespa' && v && typeof v === 'object' && typeof v.__date__ === 'string') chaves.push(chaveDe(v.__date__));
  }
  assert.ok(chaves.length > 0, 'nenhuma data crua encontrada nas 3 abas-fonte do fixture - algo mudou no formato do fixture?');
  chaves.sort();
  const primeiraChaveEsperada = chaves[0];
  const ultimaChaveEsperada = chaves[chaves.length - 1];

  assert.equal(serie[0].data, primeiraChaveEsperada, `1º dia da série (${serie[0].data}) deveria ser exatamente o 1º dia real das abas-fonte (${primeiraChaveEsperada}) - um dia "fantasma" antes disso é o bug de fuso horário (new Date("yyyy-MM-dd") = meia-noite UTC, não meia-noite SP)`);
  assert.equal(serie[serie.length - 1].data, ultimaChaveEsperada, `último dia da série (${serie[serie.length - 1].data}) deveria ser exatamente o último dia real das abas-fonte (${ultimaChaveEsperada}) - se vier 1 dia antes, o bug de fuso horário voltou (o dia mais recente está sendo silenciosamente descartado)`);
});
