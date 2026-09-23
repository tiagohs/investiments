// tests/harness/relatorio-telas-html.mjs
//
// 23/09/2026 #4: monta o HTML do relatório de conferência das telas a
// partir dos dados que relatorio-telas.mjs coleta. Só apresentação - nenhuma
// conta nova aqui (as contas e as checagens estão em relatorio-telas.mjs).
// Arquivo único, sem dependência externa além das fontes do Google (com
// fallback), abre direto no navegador.

const PER = [['mes', 'Mês'], ['30d', '30 dias'], ['6m', '6 meses'], ['12m', '12 meses'], ['3a', '3 anos'], ['tudo', 'Desde o início']];
const NOMES_PERIODO = Object.fromEntries(PER);
const BN = { ibovespa: 'Ibovespa', indiceCdi: 'CDI', indiceSelic: 'Selic', ifix: 'IFIX', sp500: 'S&P 500', indiceIpca: 'IPCA' };
const NOMES_VISAO = {
  total: 'Patrimônio total', longoPrazo: 'Longo Prazo', nacional: 'Patrimônio Nacional', rendaEmergencial: 'Renda Emergencial',
  carteiraAcoes: 'Ações', carteiraFiis: 'FIIs', carteiraAcoesEua: 'Ações EUA', carteiraRendaFixaTotal: 'Renda Fixa · total',
  carteiraRendaFixaLongoPrazo: 'Renda Fixa · longo prazo', carteiraRendaFixaEmergencial: 'Renda Fixa · reserva de emergência',
};

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dbr = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
function milhar(v, casas = 2) {
  const [int, dec] = Math.abs(v).toFixed(casas).split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : '');
}
function brl(v, sinal = false) {
  if (v == null || !Number.isFinite(v)) return '—';
  const pre = sinal ? (v >= 0 ? '+' : '−') : (v < 0 ? '−' : '');
  return `${pre}R$ ${milhar(v)}`;
}
function pct(v, sinal = true) {
  if (v == null || !Number.isFinite(v)) return '—';
  const pre = sinal ? (v >= 0 ? '+' : '−') : (v < 0 ? '−' : '');
  return `${pre}${milhar(v)}%`;
}
const cls = (v) => (v == null ? '' : (v >= 0 ? 'pos' : 'neg'));

export function gerarHtmlRelatorio(D, { anterior = null, mudancas = null } = {}) {
  const mAnt = anterior ? anterior.metricas : null;
  /** marca "antes: x" quando o número mudou desde a última geração */
  const antes = (chave, atual, fmt) => {
    if (!mAnt || !(chave in mAnt) || mAnt[chave] == null || atual == null) return '';
    if (Math.abs(mAnt[chave] - atual) <= 0.005) return '';
    return `<span class="antes" title="valor na geração anterior">antes ${fmt(mAnt[chave])}</span>`;
  };
  const M = D.meta;
  const checks = D.checagens;
  const falhas = checks.filter((c) => !c.ok);
  const alertas = D.qualidade.filter((q) => q.msgs.length);
  const o = [];

  o.push(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conferência das telas</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f6f7f5;--card:#ffffff;--ink:#1b2320;--muted:#5d6b66;--line:#dfe5e1;--accent:#1f6f5c;--pos:#1e7a45;--neg:#b3362b;--chip:#eef2ef;--warn:#8a5a00;--warnbg:#fff4dc;--okbg:#e7f4ec;--errbg:#fbe9e7;--mud:#6a5acd}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121715;--card:#1a211e;--ink:#e3ebe7;--muted:#9aaaa3;--line:#2c3632;--accent:#5cc2a4;--pos:#5fd08e;--neg:#ff8a7a;--chip:#232c28;--warn:#f0c26b;--warnbg:#2e2616;--okbg:#17291f;--errbg:#33201d;--mud:#a99cff}}
:root[data-theme="dark"]{--bg:#121715;--card:#1a211e;--ink:#e3ebe7;--muted:#9aaaa3;--line:#2c3632;--accent:#5cc2a4;--pos:#5fd08e;--neg:#ff8a7a;--chip:#232c28;--warn:#f0c26b;--warnbg:#2e2616;--okbg:#17291f;--errbg:#33201d;--mud:#a99cff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "IBM Plex Sans",system-ui,sans-serif;padding:0 16px}
main{max-width:1180px;margin:0 auto;padding-block:28px 64px}
h1,h2{font-family:"Newsreader",Georgia,serif;font-weight:600;text-wrap:balance;letter-spacing:-.01em}
h1{font-size:34px;margin:0 0 6px}h2{font-size:25px;margin:44px 0 10px;padding-top:8px;border-top:1px solid var(--line)}h3{font-size:16px;margin:24px 0 8px}
p{max-width:80ch}.lead{color:var(--muted);max-width:85ch}
.carimbo{display:flex;flex-wrap:wrap;gap:6px 18px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:10px 0 4px;font-size:13.5px}
.carimbo b{font-weight:600}.carimbo span{color:var(--muted)}
.num{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13px}
.pos{color:var(--pos)}.neg{color:var(--neg)}
.tw{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:8px;margin:8px 0 14px}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.03em;background:var(--card)}tr:last-child td{border-bottom:0}
.chip{display:inline-block;background:var(--chip);border-radius:4px;padding:1px 6px;margin:1px 4px 1px 0;font-size:12.5px;white-space:nowrap}
.nota{font-size:12.5px;color:var(--muted);margin-top:4px;max-width:70ch}
.antes{display:block;font-size:11px;color:var(--mud);font-family:"IBM Plex Mono",monospace}
.status{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:18px 0}
.st{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px}.st b{display:block;font-size:24px;font-family:"Newsreader",serif}.st span{color:var(--muted);font-size:13px}
.st.ok{background:var(--okbg)}.st.err{background:var(--errbg)}.st.warn{background:var(--warnbg)}
.selo{display:inline-block;min-width:22px;font-weight:600}.selo.ok{color:var(--pos)}.selo.err{color:var(--neg)}
.erros{margin:4px 0 0;padding-left:18px;font-size:12.5px;color:var(--neg)}
.alerta{background:var(--warnbg);border-radius:8px;padding:10px 14px;margin:8px 0}.alerta b{color:var(--warn)}
.alerta ul{margin:6px 0 0;padding-left:18px;font-size:13px}
ul li{margin:6px 0;max-width:90ch}
code{font-family:"IBM Plex Mono",monospace;font-size:12.5px;background:var(--chip);padding:1px 4px;border-radius:3px}
sup{color:var(--muted)}
</style></head><body><main>`);

  // ---------- cabeçalho ----------
  o.push(`<h1>Conferência das telas</h1>
<div class="carimbo">
<div><span>Gerado em</span> <b>${esc(M.geradoEm)}</b> <span>(horário de Brasília)</span></div>
<div><span>Planilha base</span> <b>${esc(M.planilha || 'sem nome (extraia as fixtures de novo)')}</b></div>
<div><span>Dados até</span> <b>${esc(M.ultimoSyncPrecos || '—')}</b> <span>(último sync de preços)</span></div>
<div><span>Última transação</span> <b>${dbr(M.ultimaTransacao)}</b></div>
<div><span>Fixtures extraídas em</span> <b>${esc(M.extraidoEm)}</b></div>
</div>
<p class="lead">Cada número de gráfico e hero da Início, da Visão geral de Carteiras e das 4 subpáginas foi lido da tela montada de verdade (o código atual do app rodando sobre a planilha acima) e conferido contra um cálculo independente, refeito direto das abas. Este arquivo é regerado a cada <code>npm test</code>, <code>npm run verificar</code>, commit e, com <code>npm run vigiar</code>, a cada arquivo salvo. A série vai de ${dbr(M.primeiroDia)} até hoje, ${dbr(M.hoje)} (${M.diasNaSerie} dias).</p>`);
  const nMud = mudancas ? mudancas.length : null;
  o.push(`<div class="status">
<div class="st ${falhas.length ? 'err' : 'ok'}"><b>${checks.length - falhas.length} / ${checks.length}</b><span>checagens batendo${falhas.length ? ` · ${falhas.length} com problema (detalhe abaixo)` : ''}</span></div>
<div class="st ${alertas.length ? 'warn' : 'ok'}"><b>${alertas.length}</b><span>alertas de dado da planilha (só você corrige)</span></div>
<div class="st"><b>${nMud == null ? '—' : nMud}</b><span>${nMud == null ? 'sem geração anterior pra comparar' : `números mudaram desde ${esc(anterior.meta.geradoEm)}`}</span></div>
<div class="st"><b>${brl(D.vivo.total)}</b><span>patrimônio ao vivo · ${pct(D.visoes.total.tudo.pct)} desde o início</span></div>
</div>`);

  // ---------- checagens ----------
  o.push('<h2>Checagens</h2><div class="tw"><table><tr><th></th><th>Grupo</th><th>O que foi conferido</th></tr>');
  for (const c of checks) {
    o.push(`<tr><td><span class="selo ${c.ok ? 'ok' : 'err'}">${c.ok ? '✓' : '✗'}</span></td><td>${esc(c.grupo)}</td><td>${esc(c.nome)}${c.detalhe ? ` <span class="nota">(${esc(c.detalhe)})</span>` : ''}${c.ok ? '' : `<ul class="erros">${c.erros.map((e) => `<li>${esc(e)}</li>`).join('')}${c.totalErros > c.erros.length ? `<li>… e mais ${c.totalErros - c.erros.length}</li>` : ''}</ul>`}</td></tr>`);
  }
  o.push('</table></div>');

  // ---------- o que mudou ----------
  if (mudancas) {
    o.push(`<h2>O que mudou desde a geração anterior</h2><p class="nota">Comparado com ${esc(anterior.meta.geradoEm)} (planilha ${esc(anterior.meta.planilha || '—')}, dados até ${esc(anterior.meta.ultimoSyncPrecos || '—')}).${anterior.meta.hoje !== M.hoje ? ` <b>A data de hoje mudou (${dbr(anterior.meta.hoje)} → ${dbr(M.hoje)})</b>: as janelas de período andaram, e parte das diferenças vem só disso.` : ''}${anterior.meta.planilha !== M.planilha || anterior.meta.ultimoSyncPrecos !== M.ultimoSyncPrecos ? ' <b>A planilha base mudou</b>: parte das diferenças vem dos dados novos.' : ''} Nas tabelas abaixo, o valor anterior aparece em roxo embaixo do número que mudou.</p>`);
    if (!mudancas.length) o.push('<p>Nenhum número mudou.</p>');
    else {
      const fmt = (k, v) => (v == null ? '—' : (/%|legenda/.test(k) ? pct(v) : brl(v, /ganho|lucro|Resultado/.test(k))));
      o.push('<div class="tw"><table><tr><th>Número</th><th>Antes</th><th>Agora</th><th>Diferença</th></tr>');
      for (const m of mudancas.slice(0, 120)) {
        const dif = m.antes != null && m.agora != null ? m.agora - m.antes : null;
        o.push(`<tr><td>${esc(m.chave)}${m.novo ? ' <span class="nota">(novo)</span>' : ''}${m.removido ? ' <span class="nota">(sumiu)</span>' : ''}</td><td class="num">${fmt(m.chave, m.antes)}</td><td class="num">${fmt(m.chave, m.agora)}</td><td class="num ${cls(dif)}">${dif == null ? '' : (/%|legenda/.test(m.chave) ? `${dif >= 0 ? '+' : '−'}${milhar(dif)} p.p.` : brl(dif, true))}</td></tr>`);
      }
      o.push(`</table></div>${mudancas.length > 120 ? `<p class="nota">… e mais ${mudancas.length - 120}.</p>` : ''}`);
    }
  }

  // ---------- alertas de dado ----------
  o.push('<h2>Alertas de dado da planilha</h2>');
  if (!alertas.length) o.push('<p>Nenhum. A planilha está consistente em todas as checagens de dado.</p>');
  else {
    o.push('<p class="nota">O app já se protege de cada um destes, mas o número fica mais exato quando o dado está certo. Cada linha diz o que corrigir e onde.</p>');
    for (const a of alertas) o.push(`<div class="alerta"><b>${esc(a.titulo)}</b><ul>${a.msgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`);
  }

  // ---------- explicações automáticas ----------
  o.push('<h2>O que parece estranho, mas está explicado</h2><ul>');
  for (const [v, pers] of Object.entries(D.visoes)) {
    for (const [per, x] of Object.entries(pers)) {
      if (!x.metades) continue;
      const [h1, h2] = x.metades;
      o.push(`<li><b>${NOMES_VISAO[v]} em ${NOMES_PERIODO[per].toLowerCase()}: ${pct(x.pct)} e ${brl(x.ganho, true)}.</b> A % mede o desempenho sem olhar quanto dinheiro havia em cada momento; o R$ pesa mais o período com mais dinheiro aplicado. Até ${dbr(h1.ate)}: ${pct(h1.pct)} (${brl(h1.ganho, true)}); depois: ${pct(h2.pct)} (${brl(h2.ganho, true)}).</li>`);
    }
  }
  for (const [k, v, nome] of [['acoes', 'carteiraAcoes', 'Ações'], ['fiis', 'carteiraFiis', 'FIIs']]) {
    const t = D.telas.sub[k];
    const lucro = t.valor - t.aplicado;
    const tudo = D.visoes[v].tudo;
    if (Math.sign(lucro) !== Math.sign(tudo.ganho) || Math.abs(t.pctLucro - tudo.pct) > 10) {
      o.push(`<li><b>${nome}: ${pct(t.pctLucro)} de lucro na posição, mas ${pct(tudo.pct)} desde o início.</b> O lucro do topo é valor de hoje − Valor aplicado. A rentabilidade conta também os proventos: ${brl(lucro, true)} + ${brl(t.proventos)} = ${brl(lucro + t.proventos, true)}, exatamente o ganho do gráfico.</li>`);
    }
  }
  const cE = D.telas.vg.cards.find((c) => c.nome === 'Ações Internacionais');
  const rE = D.telas.sub.acoesEua;
  if (cE && rE && rE.pctLucro != null && Math.abs(rE.pctLucro - cE.pct) > 0.5) {
    o.push(`<li><b>Ações EUA: ${pct(rE.pctLucro)} de lucro em dólar e ${pct(cE.pct)} em reais.</b> Em reais, cada compra vale o câmbio do dia dela; o dólar foi de ${D.cambioMes.base ? `R$ ${milhar(D.cambioMes.base, 4)} no fim do mês passado ` : ''}para R$ ${milhar(D.cambio.usd, 4)} hoje.</li>`);
  }
  for (const [v, lista] of Object.entries(D.moversMes)) {
    const x = D.visoes[v].mes;
    if (!x || !lista.length) continue;
    const bench = x.bench.map((b) => `${BN[b.campo]} ${pct(b.ret)}`).join(', ');
    o.push(`<li><b>${NOMES_VISAO[v]} no mês: ${pct(x.pct)} (${brl(x.ganho, true)}), com ${bench}.</b> Maiores variações de preço desde ${dbr(D.baseMes)} (aproximado: quantidade do fim do mês passado × variação do preço${v === 'carteiraAcoesEua' ? ' em reais, com o dólar' : ''}): ${lista.map((m) => `${m.ticker} ${pct(m.varPreco)} (${brl(m.reais, true)})`).join(' · ')}. Os preços são os da planilha (GOOGLEFINANCE); confira na corretora se algum parecer errado.</li>`);
  }
  for (const v of Object.keys(D.visoes)) {
    const ipca = D.visoes[v].mes && D.visoes[v].mes.bench.find((b) => b.campo === 'indiceIpca');
    if (ipca && ipca.ret === 0) { o.push('<li><b>IPCA 0% no mês.</b> O índice só muda no dia 1º de cada mês, e o IPCA do mês corrente ainda não saiu.</li>'); break; }
  }
  if (D.proventosForaDaCarteira.length) {
    o.push(`<li><b>Proventos de códigos que não estão mais na carteira</b> entram na rentabilidade e no "Proventos recebidos": ${D.proventosForaDaCarteira.map((x) => `${esc(x.ticker)} ${brl(x.valor)}`).join(' · ')}.</li>`);
  }
  o.push('</ul>');

  // ---------- tabela padrão de uma visão ----------
  const tabelaVisao = (v, periodos = PER) => {
    const linhas = [];
    for (const [pid, pl] of periodos) {
      const x = D.visoes[v][pid];
      if (!x) continue;
      const chaveBase = `${NOMES_VISAO[v]} · ${pl}`;
      const bench = x.bench.map((q) => `<span class="chip">${BN[q.campo]} ${pct(q.ret)} <b class="${cls(q.diff)}">${pct(q.diff)}</b>${antes(`${chaveBase} · legenda ${q.campo}`, q.diff, pct)}</span>`).join(' ');
      const ev = x.evolucao || {};
      linhas.push(`<tr><td>${pl}</td><td class="num">${dbr(x.baseData)}</td><td class="num">${brl(x.base)}${x.abertura ? '<sup>a</sup>' : ''}</td>`
        + `<td class="num ${cls(x.ganho)}">${brl(x.ganho, true)}${antes(`${chaveBase} · ganho R$`, x.ganho, (y) => brl(y, true))}</td>`
        + `<td class="num ${cls(x.pct)}"><b>${pct(x.pct)}</b>${antes(`${chaveBase} · rentabilidade %`, x.pct, pct)}</td><td>${bench}</td>`
        + `<td class="num">${brl(ev.valorIni)} → ${brl(ev.valorFim)}</td><td class="num">${brl(ev.aplicadoIni)} → ${brl(ev.aplicadoFim)}</td></tr>`);
    }
    return `<div class="tw"><table><tr><th>Período</th><th>Base (dia)</th><th>Valor na base</th><th>Ganho R$</th><th>Rentab.</th><th>Benchmark no período · <b>legenda (Portfólio − benchmark)</b></th><th>Evolução: valor</th><th>Evolução: Valor aplicado</th></tr>${linhas.join('')}</table></div>`;
  };

  // ---------- Início ----------
  o.push('<h2>Início</h2><h3>Cards do resumo</h3><div class="tw"><table><tr><th>Card</th><th>Valor</th><th>ontem era</th><th>Variação</th><th>Fatias por classe (somam o card)</th></tr>');
  for (const c of D.telas.inicio.cards) {
    o.push(`<tr><td>${esc(c.label)}</td><td class="num">${brl(c.valor)}${antes(`Início · ${c.label} · valor`, c.valor, brl)}</td><td class="num">${brl(c.ontem)}${antes(`Início · ${c.label} · ontem era`, c.ontem, brl)}</td><td class="num ${cls(c.varPct)}">${pct(c.varPct)}</td><td class="nota">${esc(c.distribTexto)}</td></tr>`);
  }
  o.push('</table></div>');
  o.push(`<p class="nota">"ontem era" = fechamento de ${dbr(D.ontemOraculo && D.ontemOraculo.data)} no gráfico + o ajuste de marcação da Renda Fixa de hoje (${brl(D.ajusteRf)}; reserva ${brl(D.ajusteRe)}), pra comparar na mesma régua. O ajuste é a diferença entre o valor manual da Renda Fixa e a projeção do histórico; entra como ajuste, não como rendimento.</p>`);
  o.push('<p class="nota"><sup>a</sup> A janela começa no dia em que a visão nasceu: a base é 0 na véspera e o aporte do dia é o custo (o 1º dia também rende).</p>');
  for (const v of ['total', 'longoPrazo', 'nacional', 'rendaEmergencial']) {
    o.push(`<h3>Rentabilidade · ${NOMES_VISAO[v]}</h3><p class="nota">Hero = ${brl(D.vivo[v])} + "R$ … % no período", conferido na tela nos 6 períodos.</p>${tabelaVisao(v)}`);
  }

  // ---------- Visão geral ----------
  const vg = D.telas.vg;
  o.push(`<h2>Carteiras · Visão geral</h2><h3>Hero</h3><div class="tw"><table><tr><th>Patrimônio</th><th>Valor aplicado</th><th>Resultado (desde o início)</th><th>Rentabilidade</th></tr>
<tr><td class="num">${brl(vg.patrimonio)}</td><td class="num">${brl(vg.aplicado)}${antes('Visão geral · Valor aplicado', vg.aplicado, brl)}</td><td class="num ${cls(vg.resultado)}">${brl(vg.resultado, true)}${antes('Visão geral · Resultado', vg.resultado, (y) => brl(y, true))}</td><td class="num ${cls(vg.rentabilidade)}">${pct(vg.rentabilidade)}</td></tr></table></div>
<p class="nota">Valor aplicado + Resultado ≠ Patrimônio, e isso está certo (o Gorila também é assim): o Resultado inclui proventos já recebidos e lucros já realizados, que não estão mais aplicados.</p>`);
  const CAMPO_CARD = { 'Ações': 'carteiraAcoes', 'FIIs': 'carteiraFiis', 'Ações Internacionais': 'carteiraAcoesEua', 'Renda Fixa': 'carteiraRendaFixaTotal' };
  o.push('<h3>Cards por classe</h3><div class="tw"><table><tr><th>Card</th><th>Valor</th><th>Valor aplicado</th><th>Lucro na posição</th><th>%</th><th>Fim da linha "Valor aplicado"</th></tr>');
  let somaV = 0, somaA = 0;
  for (const c of vg.cards) {
    somaV += c.valor || 0; somaA += c.aplicado || 0;
    o.push(`<tr><td>${esc(c.nome)}</td><td class="num">${brl(c.valor)}</td><td class="num">${brl(c.aplicado)}${antes(`Card ${c.nome} · Valor aplicado`, c.aplicado, brl)}</td><td class="num ${cls(c.lucro)}">${brl(c.lucro, true)}${antes(`Card ${c.nome} · lucro`, c.lucro, (y) => brl(y, true))}</td><td class="num ${cls(c.pct)}">${pct(c.pct)}</td><td class="num">${brl(D.aplicado[CAMPO_CARD[c.nome]])}</td></tr>`);
  }
  o.push(`<tr><td><b>Soma</b></td><td class="num">${brl(somaV)}</td><td class="num"><b>${brl(somaA)}</b></td><td colspan="3" class="nota">= Valor aplicado do hero</td></tr></table></div>`);
  o.push(`<h3>Rentabilidade e Evolução (Patrimônio total)</h3><p class="nota">Mesmos números do painel Patrimônio total da Início. Esta tela não tem a aba "Mês".</p>${tabelaVisao('total', PER.slice(1))}`);

  // ---------- subpáginas ----------
  o.push('<h2>Carteiras · subpáginas</h2><h3>Topo de cada página</h3><div class="tw"><table><tr><th>Página</th><th>O que a tela mostra</th><th>Desde o início (gráfico)</th><th>Decomposição</th></tr>');
  for (const [k, nome, v] of [['acoes', 'Ações', 'carteiraAcoes'], ['fiis', 'FIIs', 'carteiraFiis'], ['acoesEua', 'Ações EUA', 'carteiraAcoesEua'], ['rendaFixa', 'Renda Fixa', 'carteiraRendaFixaTotal']]) {
    const t = D.telas.sub[k];
    const x = D.visoes[v].tudo;
    let dec;
    if (k === 'acoes' || k === 'fiis') {
      const lucro = t.valor - t.aplicado;
      dec = `lucro ${brl(lucro, true)} + proventos ${brl(t.proventos)} = ${brl(lucro + t.proventos, true)}`;
    } else if (k === 'acoesEua') {
      dec = `em reais: valor ${brl(D.vivo.carteiraAcoesEua)} − aplicado ${brl(D.aplicado.carteiraAcoesEua)} = ${brl(D.vivo.carteiraAcoesEua - D.aplicado.carteiraAcoesEua, true)}; "i" do topo: ${esc((t.tooltips || []).join(' | '))}`;
    } else {
      dec = `valor ${brl(t.valor)} − aplicado ${brl(t.aplicado)} = ${brl(t.valor - t.aplicado, true)}; o resto do resultado são juros/cupons e resgates já realizados`;
    }
    o.push(`<tr><td>${nome}</td><td class="nota">${esc(t.resumoTexto)}</td><td class="num ${cls(x.pct)}">${pct(x.pct)} · ${brl(x.ganho, true)}</td><td class="nota">${dec}</td></tr>`);
  }
  o.push('</table></div>');
  for (const v of ['carteiraAcoes', 'carteiraFiis', 'carteiraAcoesEua', 'carteiraRendaFixaTotal', 'carteiraRendaFixaLongoPrazo', 'carteiraRendaFixaEmergencial']) {
    o.push(`<h3>${NOMES_VISAO[v]}${v === 'carteiraAcoesEua' ? ' (em reais)' : ''}</h3>${tabelaVisao(v, PER.slice(1))}`);
  }
  o.push('<p class="nota">As subpáginas não têm a aba "Mês" e não mostram o ganho em R$ por período, só a curva e a legenda; o R$ está aqui pra conferir as somas logo abaixo.</p>');

  // ---------- coerência ----------
  o.push('<h2>Coerência entre telas</h2><p>Ganho em R$ de cada período, na mesma janela do Total.</p><div class="tw"><table><tr><th>Período</th><th>Total</th><th>= Longo Prazo + Reserva</th><th>Longo Prazo = Nacional + EUA</th><th>Nacional = Ações + FIIs + RF LP</th></tr>');
  for (const [pid, pl] of PER) {
    const q = D.somas[pid];
    o.push(`<tr><td>${pl}</td><td class="num ${cls(q.total)}">${brl(q.total, true)}</td><td class="num">${brl(q.longoPrazo, true)} + ${brl(q.emerg, true)}</td><td class="num">${brl(q.nacional, true)} + ${brl(q.eua, true)}</td><td class="num">${brl(q.acoes, true)} + ${brl(q.fiis, true)} + ${brl(q.rfLp, true)}</td></tr>`);
  }
  o.push('</table></div>');
  o.push('<h3>Maiores dias</h3><div class="tw"><table><tr><th>Visão</th><th>Dias (variação · R$)</th></tr>');
  for (const [v, lista] of Object.entries(D.maioresDias)) {
    o.push(`<tr><td>${NOMES_VISAO[v]}</td><td>${lista.map((d) => `<span class="chip">${dbr(d.d)} <b class="${cls(d.r)}">${pct(d.r)}</b> ${brl(d.ganho, true)}</span>`).join(' ')}</td></tr>`);
  }
  o.push('</table></div>');
  if (D.diag.correcoesPreco.length) {
    o.push('<h3>Correções de preço histórico aplicadas</h3><p class="nota">O GOOGLEFINANCE devolve preço ajustado pra trás depois de bonificação/desdobramento; o app corrige comparando com o preço que você pagou.</p><div class="tw"><table><tr><th>Ticker</th><th>Até</th><th>Fator</th><th>Critério</th></tr>');
    for (const c of D.diag.correcoesPreco) o.push(`<tr><td>${esc(c.ticker)}</td><td class="num">${dbr(c.ate)}</td><td class="num">${String(c.fator).replace('.', ',')}</td><td>${esc(c.criterio)}</td></tr>`);
    o.push('</table></div>');
  }
  if (D.gorila) {
    o.push(`<p class="nota">Referência externa (Gorila, ${dbr(D.gorila.data)}): ${pct(D.gorila.rentabilidadeDesdeInicioPct)} desde o início contra ${pct(D.visoes.total.tudo.pct)} aqui; Valor aplicado ${brl(D.gorila.valorInvestido)} contra ${brl(D.aplicado.total)} aqui.</p>`);
  }

  o.push(`<h2>Como este relatório é gerado</h2><p class="nota"><code>tests/harness/relatorio-telas.mjs</code> monta as telas com o código atual e <code>tests/harness/fixtures.json</code>, e <code>relatorio-telas.test.js</code> vira um teste por checagem. Roda em todo <code>npm test</code>, em <code>npm run verificar</code> (que também roda antes de cada commit) e em <code>npm run vigiar</code> (a cada arquivo salvo). Pra trocar a planilha base: <code>python3 tests/harness/extrair-fixtures.py "…/Investimentos - Controle NN.xlsx"</code>. A pasta <code>tests/harness/relatorio/</code> não vai pro git, porque tem dado financeiro real.</p>`);
  o.push('</main></body></html>');
  return o.join('\n');
}
