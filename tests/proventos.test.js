// tests/proventos.test.js - 24/09/2026: tela Proventos montada num DOM de
// verdade (JSDOM) com os dados de exemplo: abas, filtro de classe valendo nas
// 2 abas, gráfico com tooltip/legenda/tabela, ranking com detalhe, Agenda
// (ano, mês, Realizado/A realizar) e a importação da planilha da B3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DADOS } from './proventos-exemplo.mjs';

function montarDom() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="proventos">
    <div id="refreshControlProventos"></div>
    <div id="proventosLoading"></div><div id="proventosErro" hidden></div><div id="proventosConteudo" hidden></div></body></html>`, { url: 'https://exemplo.test/proventos/index.html', pretendToBeVisual: true });
  const w = dom.window;
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.localStorage = w.localStorage;
  w.localStorage.clear();
  w.sessionStorage.clear();
  return { dom, doc: w.document, w };
}
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
// texto como a gente lê: um espaço entre elementos (textContent cola "FIIsR$ 10,00")
const txt = (el) => {
  const partes = [];
  const w = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};
const brl = (s) => { const m = String(s).match(/(-?)R\$\s*([\d.]+,\d{2})/); return m ? Number((m[1] + m[2]).replace(/\./g, '').replace(',', '.')) : null; };

async function montar(extra = {}) {
  const { dom, doc, w } = montarDom();
  const { montarPaginaProventos } = await import('../assets/js/pages/proventos.js');
  let chamadas = 0;
  await montarPaginaProventos('tk', { doc, getProventosImpl: async () => { chamadas += 1; return { ok: true, ...structuredClone(DADOS) }; }, hojeLocal: DADOS.hoje, ...extra });
  return { dom, doc, w, chamadas: () => chamadas };
}

test('Consolidado: 5 cartões batem com as contas; período e classe mudam os números; a classe vale também na Agenda', async () => {
  const { doc, w } = await montar();
  const conteudo = doc.getElementById('proventosConteudo');
  assert.equal(conteudo.hidden, false);
  const card = (i) => doc.querySelectorAll('.pv-card')[i];
  assert.equal(doc.querySelectorAll('.pv-card').length, 5);
  assert.equal(brl(card(0).querySelector('.pv-card-valor').textContent), 1200);
  // 02/10/2026: o FNet de 12/09 (pago, não lançado) entra como pago presumido: 57 + 5
  assert.equal(brl(card(1).querySelector('.pv-card-valor').textContent), 62);
  assert.equal(brl(card(2).querySelector('.pv-card-valor').textContent), 4.17);
  assert.match(txt(card(2)), /set\/25 a ago\/26 · meses fechados/);
  assert.match(txt(card(3)), /5,17%/);
  assert.equal(brl(card(4).querySelector('.pv-card-valor').textContent), 20);
  assert.match(txt(card(4)), /Neste mês: R\$\s*3,00/);
  assert.match(txt(card(1)), /Em setembro: R\$\s*19,00/, '12 meses: o subtítulo mostra o mês (não repete o total)');
  clique(w, doc.querySelector('[data-periodo="inicio"]'));
  // faixa da conferência: 1 presumido (o do FNet), sem conferência ainda
  assert.match(txt(doc.querySelector('.pv-conf-faixa')), /1 pago presumido \(R\$\s*5,00\) aguardando o extrato da B3/);
  assert.equal(brl(doc.querySelectorAll('.pv-card')[1].querySelector('.pv-card-valor').textContent), 70);
  clique(w, doc.querySelector('[data-classe="fiis"]'));
  assert.equal(brl(doc.querySelectorAll('.pv-card')[0].querySelector('.pv-card-valor').textContent), 900);
  assert.equal(brl(doc.querySelectorAll('.pv-card')[1].querySelector('.pv-card-valor').textContent), 40);
  assert.ok(doc.querySelector('[data-classe="fiis"]').classList.contains('active'));
  // Agenda herda o filtro FIIs
  clique(w, doc.querySelector('[data-aba="agenda"]'));
  const tickers = [...doc.querySelectorAll('.pv-agenda tbody tr')].map((tr) => tr.querySelector('b').textContent);
  assert.ok(tickers.length > 0 && tickers.every((t) => t === 'AAAA11'), tickers.join(','));
  // e a escolha fica lembrada
  const prefs = JSON.parse(w.localStorage.getItem('proventos.prefs.v1'));
  assert.equal(prefs.classe, 'fiis');
  assert.equal(prefs.aba, 'agenda');
});

test('Histórico: barras empilhadas com respiro e ponta arredondada, tooltip por mês, legenda com totais, tabela com os mesmos números, agrupar por tipo/ativo', async () => {
  const { doc, w } = await montar();
  const barras = doc.querySelectorAll('.pv-svg .pv-barra');
  assert.equal(barras.length, 12);
  const ago = [...barras].find((g) => g.getAttribute('data-i') === '10');
  assert.equal(ago.querySelectorAll('path').length, 2, 'ago/26: FIIs + Ações EUA');
  assert.match(ago.querySelectorAll('path')[1].getAttribute('d'), /Q/, 'parte de cima com canto arredondado');
  const hit = doc.querySelector('.pv-hit[data-i="10"]');
  hit.dispatchEvent(new w.Event('pointerenter'));
  const tip = doc.querySelector('.pv-tooltip');
  assert.equal(tip.hidden, false);
  assert.match(txt(tip), /agosto de 2026/);
  assert.match(txt(tip), /FIIs R\$\s*10,00/);
  assert.match(txt(tip), /Total R\$\s*15,00/);
  assert.ok(doc.querySelector('.pv-barra[data-i="3"]').classList.contains('apagada'));
  const leg = txt(doc.getElementById('pvHistLegenda'));
  assert.match(leg, /Ações R\$\s*24,00/);
  assert.match(leg, /FIIs R\$\s*33,00/);
  // setembro: o tooltip avisa quanto é presumido
  doc.querySelector('.pv-hit[data-i="11"]').dispatchEvent(new w.Event('pointerenter'));
  assert.match(txt(doc.querySelector('.pv-tooltip')), /inclui R\$\s*5,00 presumido/);
  assert.match(leg, /Ações EUA R\$\s*5,00/);
  clique(w, doc.querySelector('[data-visao="tabela"]'));
  const linhas = [...doc.querySelectorAll('.pv-tabela-hist tbody tr')];
  assert.equal(linhas.length, 4, 'só os meses com provento');
  assert.match(txt(linhas[0]), /^set\/26/);
  assert.equal(brl(linhas[0].lastElementChild.textContent), 19);
  clique(w, doc.querySelector('[data-agrupar="tipo"]'));
  assert.deepEqual([...doc.querySelectorAll('.pv-tabela-hist thead th')].map((th) => txt(th)), ['Mês', 'Dividendo', 'JCP', 'Rendimento', 'Total']);
  clique(w, doc.querySelector('[data-agrupar="ativo"]'));
  assert.match(txt(doc.getElementById('pvHistLegenda')), /AAAA11 R\$\s*33,00/);
});

test('Por ativo e Receita futura: ranking com % e detalhe (quantidade, preço médio, YoC, DY), próximos pagamentos e data com futura', async () => {
  const { doc, w } = await montar();
  const itens = [...doc.querySelectorAll('.pv-rank-item')];
  assert.deepEqual(itens.map((i) => i.getAttribute('data-ticker')), ['AAAA11', 'BBBB3', 'CCCC']);
  assert.match(txt(itens[0]), /53,2%/);
  clique(w, itens[0]);
  const tt = doc.getElementById('pvRankTooltip');
  assert.equal(tt.hidden, false);
  const t = txt(tt);
  assert.match(t, /Quantidade atual 10/);
  assert.match(t, /Preço médio R\$\s*90,00/);
  assert.match(t, /Yield on cost \(12 meses\) 3,67%/);
  assert.match(t, /Dividend yield 10,00%/);
  assert.match(t, /Total desde o início R\$\s*40,00/);
  clique(w, itens[2]);
  assert.match(txt(tt), /Preço médio US\$ 10,00/);
  const fut = txt(doc.querySelector('[aria-labelledby="pvFutTitulo"]'));
  assert.match(fut, /Próximos 30 dias R\$\s*13,00/);
  assert.match(fut, /Próximos 12 meses R\$\s*15,00/);
  assert.match(fut, /R\$\s*5,00 anunciados sem data/);
  assert.match(fut, /AAAA11 tenha até 30\/09/);
});

test('Agenda: abre no mês de hoje; contagem por mês; Realizado / A realizar; ano anterior; sem data; pílula de situação; total em dólar com câmbio', async () => {
  const { doc, w } = await montar();
  clique(w, doc.querySelector('[data-aba="agenda"]'));
  assert.ok(doc.querySelector('.pv-mes[data-mes="9"]').classList.contains('active'));
  assert.match(txt(doc.querySelector('.pv-mes[data-mes="9"]')), /Set 4/);
  const resumo = () => txt(doc.querySelector('.pv-ag-resumo'));
  assert.match(resumo(), /Setembro de 2026 4 proventos · R\$\s*22,00/);
  const pills = () => [...doc.querySelectorAll('.pv-agenda .pv-pill')].map((p) => p.textContent);
  // 02/10/2026: o não lançado de 12/09 é "Pago" (presumido) com o ícone discreto ao lado
  assert.deepEqual(pills(), ['Pago', 'Pago', 'Pago', 'A receber']);
  const presumido = [...doc.querySelectorAll('.pv-agenda tbody tr')].filter((tr) => tr.querySelector('.pv-conf'));
  assert.equal(presumido.length, 1);
  assert.match(presumido[0].querySelector('.pv-conf').getAttribute('title'), /presumido.*extrato da B3/);
  assert.match(resumo(), /R\$\s*19,00 recebido · R\$\s*3,00 a receber/);
  clique(w, doc.querySelector('[data-status="aRealizar"]'));
  assert.deepEqual(pills(), ['A receber']);
  clique(w, doc.querySelector('[data-status="realizado"]'));
  assert.equal(pills().length, 3);
  clique(w, doc.querySelector('[data-status="todos"]'));
  clique(w, doc.querySelector('[data-mes="semData"]'));
  assert.deepEqual(pills(), ['A definir']);
  clique(w, doc.querySelector('[data-mes="8"]'));
  const usd = [...doc.querySelectorAll('.pv-agenda tbody tr')].find((tr) => /CCCC/.test(tr.textContent));
  assert.match(txt(usd), /US\$ 0,10/);
  assert.match(txt(usd), /R\$\s*5,00 US\$ 1,00 · câmbio 5,0000/);
  // ano anterior (‹)
  clique(w, doc.querySelector('.pv-ano-btn[aria-label="Ano anterior"]'));
  assert.match(txt(doc.querySelector('.pv-ano')), /2025/);
  assert.match(resumo(), /Ano de 2025 2 proventos/);
});

test('Importar planilha da B3: lê o arquivo, mostra a prévia, só envia depois de confirmar, e recarrega; arquivo errado não envia', async () => {
  const matriz = [
    ['Produto', 'Tipo', 'Tipo de Evento', 'Previsão de pagamento', 'Instituição', 'Conta', 'Quantidade', 'Preço unitário', 'Valor líquido'],
    ['ABCD11 - FUNDO', 'Fundo', 'RENDIMENTO', '25/09/2026', 'X', '1', '10', 0.9, 9],
    ['', '', '', '', '', '', '', 'Total líquido', 9],
  ];
  let enviado = null;
  let arquivoAtual = matriz;
  const falsoXlsx = async () => ({
    read: () => ({ SheetNames: ['Proventos a Receber'], Sheets: { 'Proventos a Receber': {} } }),
    utils: { sheet_to_json: () => arquivoAtual },
  });
  const { doc, w, chamadas } = await montar({ carregarXlsx: falsoXlsx, importarImpl: async (tk, linhas) => { enviado = linhas; return { ok: true, importados: 1, total: 9 }; } });
  const escolher = async () => {
    const input = doc.getElementById('pvImportarArquivo');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'proventos.xlsx', arrayBuffer: async () => new ArrayBuffer(8) }] });
    input.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 10));
  };
  await escolher();
  const status = doc.getElementById('pvImportarStatus');
  assert.match(txt(status), /Encontrei 1 proventos a receber, somando R\$\s*9,00/);
  assert.equal(enviado, null, 'nada é enviado antes de confirmar');
  const antes = chamadas();
  clique(w, status.querySelector('[data-imp="enviar"]'));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(enviado, matriz);
  assert.ok(chamadas() > antes, 'recarrega a tela depois de importar');
  arquivoAtual = [['Data', 'Ativo'], ['01/01/2026', 'ABCD11']];
  enviado = null;
  await escolher();
  assert.match(txt(doc.getElementById('pvImportarStatus')), /não parece a planilha/);
  assert.equal(enviado, null);
});

test('Erro ao carregar: mostra a mensagem e não quebra', async () => {
  const { doc, w } = montarDom();
  const { montarPaginaProventos } = await import('../assets/js/pages/proventos.js');
  await montarPaginaProventos('tk', { doc, getProventosImpl: async () => ({ ok: false, etapa: 'proventos', erro: 'falhou' }) });
  assert.equal(doc.getElementById('proventosErro').hidden, false);
  assert.match(doc.getElementById('proventosErro').textContent, /falhou/);
  assert.equal(doc.getElementById('proventosConteudo').hidden, true);
  w.close();
});

// 02/10/2026: "Escolher período" no filtro do Consolidado + card de Análise embaixo do Histórico mensal
test('Consolidado: "Escolher período" ao lado do período - intervalo recorta cartões/barras/ranking pelos meses que tocam ele, fica lembrado; análise embaixo do gráfico', async () => {
  const { doc, w } = await montar();
  const wrap = doc.getElementById('pvPeriodo');
  const chip = wrap.querySelector('.filter-tab.fp-chip');
  assert.ok(chip, 'chip do calendário');
  assert.equal(wrap.querySelector('[data-periodo="12m"]').classList.contains('active'), true);
  // a média da análise é a mesma régua do cartão "Média mensal" (meses fechados)
  assert.match(txt(doc.querySelector('#pvHistAnalise details.ag')), /Média de R\$\s*4,17\/mês em set\/25 a ago\/26/);
  // calendário abre com os dias depois de hoje desabilitados
  clique(w, chip);
  const pop = doc.querySelector('.fp-camada .fp-pop');
  assert.ok(pop);
  assert.equal(pop.querySelector('[data-dia="2026-09-25"]').getAttribute('aria-disabled'), 'true');
  // escolhe 10/08 a 12/08 clicando nos dias e aplica
  const irPara = () => { for (let i = 0; i < 3 && !doc.querySelector('.fp-pop [data-dia="2026-08-10"]'); i += 1) clique(w, doc.querySelector('.fp-pop [data-acao="mes-ant"]')); };
  irPara();
  clique(w, doc.querySelector('.fp-pop [data-dia="2026-08-10"]'));
  clique(w, doc.querySelector('.fp-pop [data-dia="2026-08-12"]'));
  clique(w, doc.querySelector('.fp-pop [data-acao="aplicar"]'));
  assert.equal(doc.querySelector('.fp-camada'), null, 'fecha ao aplicar');
  const chip2 = doc.querySelector('#pvPeriodo .fp-chip');
  assert.match(chip2.textContent, /10–12 ago/);
  assert.equal(chip2.classList.contains('active'), true);
  assert.equal(doc.querySelectorAll('#pvPeriodo .pv-seg-btn.active').length, 0, 'nenhum preset marcado');
  const card1 = doc.querySelectorAll('.pv-card')[1];
  assert.match(txt(card1), /Renda · ago\/26/);
  assert.equal(brl(card1.querySelector('.pv-card-valor').textContent), 15);
  assert.equal(doc.querySelectorAll('#pvHistCorpo .pv-hit').length, 1, '1 barra: agosto');
  assert.deepEqual([...doc.querySelectorAll('#pvRanking .pv-rank-item')].map((li) => li.dataset.ticker), ['AAAA11', 'CCCC']);
  // lembrado nas preferências da tela
  const prefs = JSON.parse(w.localStorage.getItem('proventos.prefs.v1'));
  assert.deepEqual(prefs.periodo, { inicio: '2026-08-10', fim: '2026-08-12' });
  // análise do mês escolhido
  const ag = doc.querySelector('#pvHistAnalise details.ag');
  assert.ok(ag);
  assert.match(txt(ag), /Média de R\$\s*15,00\/mês em ago\/26/);
  // volta pra um preset
  clique(w, doc.querySelector('#pvPeriodo [data-periodo="inicio"]'));
  assert.match(doc.querySelector('#pvPeriodo .fp-chip').textContent, /Escolher período/);
  assert.equal(brl(doc.querySelectorAll('.pv-card')[1].querySelector('.pv-card-valor').textContent), 70);
});

test('Consolidado: card de Análise lembra se estava aberto entre redesenhos; sem proventos no período, some', async () => {
  const { doc, w } = await montar();
  const det = doc.querySelector('#pvHistAnalise details.ag');
  assert.ok(det);
  det.open = true;
  det.dispatchEvent(new w.Event('toggle'));
  clique(w, doc.querySelector('[data-agrupar="tipo"]'));
  assert.equal(doc.querySelector('#pvHistAnalise details.ag').open, true);
  // intervalo sem nenhum provento recebido (nov/24): sem card
  doc.getElementById('pvPeriodo')._filtroPeriodo.definir({ inicio: '2024-11-01', fim: '2024-11-30' });
  assert.equal(doc.getElementById('pvHistAnalise').hidden, true);
});
