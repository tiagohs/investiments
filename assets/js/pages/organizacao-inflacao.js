/**
 * organizacao-inflacao.js - 28/10/2026 (Tiago: "quero ainda o IPCA real lá, mas em paralelo, quero essa ideia do IPCA real").
 * Seção "Minha inflação × IPCA" da aba Gastos e Despesas: as despesas essenciais da lista (o RASCUNHO da tela - mudou um valor,
 * a conta muda junto) com o índice de cada uma, a inflação de 12 meses delas contra o IPCA oficial, o que é fixo em reais e o
 * que acompanha os preços, a linha do tempo (12 meses móveis) e "o que o seu dinheiro rende de verdade" (o confisco
 * inflacionário: parado, poupança, CDI, Tesouro IPCA+ e prefixado - já sem IR - contra as duas inflações).
 * Conta em ../inflacao-pessoal.js. O índice escolhido por despesa grava na aba aux_inflacao-cesta (InflacaoPessoal.gs).
 */
import { calcularMinhaInflacao, ganhoReal, corrigir, porMes, retornoMinimo } from '../inflacao-pessoal.js';
import { formatBRL, formatPct, formatPctSinal, formatPctAbs } from '../format.js';
import { esc } from '../util/html.js';
import { kpiHtml, chipHtml } from './organizacao-ui.js';
import { criarGraficoLinha, criarBarraComposicao } from '../charts/index.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = (m) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}` : '');
const pp = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;

/**
 * "O que o seu dinheiro rende de verdade": cada aplicação com o rendimento líquido de 12 meses e o ganho real contra o IPCA e
 * contra a sua inflação. `macro` = criterios/macro.js!montarMacro (juros + NTN-B) e `prefixado` = { taxa } do prefixado longo.
 */
export function linhasRendeDeVerdade(macro, { minha, ipca, tr = 0, prefixado = null } = {}) {
  const j = macro && macro.juros;
  if (!j || !num(j.selic)) return [];
  const cdi = j.selic - 0.001; // CDI ≈ Selic − 0,10 p.p.
  const poupanca = j.selic > 0.085 ? (1.005 ** 12 - 1) + (tr || 0) : j.selic * 0.7 + (tr || 0);
  const linhas = [
    { id: 'parado', nome: 'Parado na conta', rendimento: 0, ir: 0, nota: 'sem rendimento' },
    { id: 'poupanca', nome: 'Poupança', rendimento: poupanca, ir: 0, nota: '0,5% ao mês + TR, sem IR' },
    { id: 'cdi', nome: 'Tesouro Selic / CDB 100% do CDI', rendimento: cdi, ir: 0.15, nota: `CDI ≈ ${formatPct(cdi, 2)}, IR de 15% (mais de 2 anos)` },
  ];
  const nb = macro.ntnb && macro.ntnb.longa;
  const ipcaEsp = num(j.ipcaEsperado) ? j.ipcaEsperado : ipca;
  if (nb && num(ipcaEsp)) linhas.push({ id: 'ntnb', nome: `${nb.nome || 'Tesouro IPCA+'} (no vencimento)`, rendimento: (1 + ipcaEsp) * (1 + nb.taxa) - 1, ir: 0.15, nota: `IPCA esperado ${formatPct(ipcaEsp, 1)} + ${formatPct(nb.taxa, 2)}` });
  if (prefixado && num(prefixado.taxa)) linhas.push({ id: 'pre', nome: `${prefixado.nome || 'Tesouro Prefixado'} (no vencimento)`, rendimento: prefixado.taxa, ir: 0.15, nota: 'taxa travada de hoje' });
  return linhas.map((l) => ({
    ...l, liquido: l.rendimento * (1 - l.ir),
    realIpca: ganhoReal(l.rendimento, ipca, l.ir), realMinha: ganhoReal(l.rendimento, minha, l.ir),
  }));
}

/**
 * 28/10/2026 (Tiago: "senti falta de uma área me dizendo se estou bem ou não, abaixo desses heroes"): o veredito em palavras,
 * no mesmo espírito do "Sem contar o dinheiro novo..." da Início. `r` = calcularMinhaInflacao; `linhas` = linhasRendeDeVerdade.
 * tom: bom (abaixo do IPCA), neutro (no ritmo, ±0,25 p.p.) ou ruim (acima). A "atenção" sai à parte: o que acompanha os preços
 * subindo acima do IPCA (o número de quando as parcelas acabarem) e quem mais puxou.
 */
export function vereditoInflacao(r, { linhas = [] } = {}) {
  if (!r || !num(r.minha) || !num(r.ipca)) return null;
  const dif = r.minha - r.ipca;
  const LIMIAR = 0.0025;
  const tom = dif <= -LIMIAR ? 'bom' : (dif < LIMIAR ? 'neutro' : 'ruim');
  const ppAbs = `${Math.abs(dif * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
  const titulo = tom === 'bom' ? `Você está bem: a sua inflação (${formatPct(r.minha, 1)}) ficou ${ppAbs} abaixo do IPCA (${formatPct(r.ipca, 1)}).`
    : tom === 'neutro' ? `A sua inflação (${formatPct(r.minha, 1)}) está no ritmo do IPCA (${formatPct(r.ipca, 1)}).`
      : `Atenção: a sua inflação (${formatPct(r.minha, 1)}) está ${ppAbs} acima do IPCA (${formatPct(r.ipca, 1)}).`;
  const frases = [];
  if (num(r.impactoMensal) && num(r.impactoIpca)) {
    const gap = r.impactoIpca - r.impactoMensal;
    frases.push(Math.abs(gap) < 1 ? `O seu custo de vida subiu ${formatBRL(r.impactoMensal)} por mês, o mesmo que pelo IPCA.`
      : `O seu custo de vida subiu ${formatBRL(r.impactoMensal)} por mês: ${formatBRL(Math.abs(gap))} ${gap > 0 ? 'a menos' : 'a mais'} do que se acompanhasse o IPCA.`);
  }
  const g = r.grupos || {};
  const segura = (g.tr || 0) + (g.fixo || 0);
  if (segura >= 0.2) frases.push(`Quem segura a sua média: ${[g.tr > 0.0005 ? `${formatPct(g.tr, 0)} na TR` : '', g.fixo > 0.0005 ? `${formatPct(g.fixo, 0)} fixo em reais` : ''].filter(Boolean).join(' e ')}.`);
  let atencao = null;
  if (num(r.semParcelas) && r.semParcelas - r.ipca >= LIMIAR) {
    const puxam = (r.porItem || []).filter((p) => p.indice !== 'fixo' && p.indice !== 'tr' && p.variacao - r.ipca >= LIMIAR)
      .map((p) => ({ ...p, excesso: p.mensal * (p.variacao - r.ipca) })).sort((a, b) => b.excesso - a.excesso).slice(0, 2);
    atencao = `O que acompanha os preços subiu ${formatPct(r.semParcelas, 1)}, acima do IPCA${puxam.length ? ` (quem mais puxou: ${puxam.map((p) => `${p.nome} ${formatPctSinal(p.variacao, 1)}`).join(', ')})` : ''}. ${segura >= 0.2 ? 'Quando as parcelas acabarem, é perto disso que a sua inflação vai ficar.' : ''}`.trim();
  }
  const cdi = linhas.find((l) => l.id === 'cdi');
  if (cdi && num(cdi.realMinha)) frases.push(`No CDI (líquido) o dinheiro rende ${formatPctAbs(cdi.realMinha, 1)} ${cdi.realMinha >= 0 ? 'acima' : 'abaixo'} da sua inflação; parado na conta, perde ${formatPct(r.minha, 1)} de poder de compra por ano.`);
  return { tom, titulo, frases, atencao, texto: [titulo, ...frases, atencao || ''].join(' ').trim() };
}

function vereditoHtml(v) {
  if (!v) return '';
  return `<div class="og-inf-veredito og-inf-tom-${v.tom}" role="status">
    <p class="og-inf-veredito-titulo">${esc(v.titulo)}</p>
    ${v.frases.length ? `<p>${v.frases.map(esc).join(' ')}</p>` : ''}
    ${v.atencao ? `<p class="og-inf-veredito-atencao"><b>Ponto de atenção:</b> ${esc(v.atencao)}</p>` : ''}
  </div>`;
}

function tabelaRendeHtml(linhas, r) {
  if (!linhas.length) return '<p class="og-nota fraca">Sem a Selic de hoje (contexto de mercado) não dá pra montar a comparação agora.</p>';
  const cel = (v) => `<td class="num ${v >= 0 ? 'good' : 'bad'}">${esc(formatPctSinal(v))}</td>`;
  const parado = 10000 / (1 + r.minha);
  const paradoIpca = 10000 / (1 + r.ipca);
  return `<div class="og-inf-tabela-wrap"><table class="og-inf-tabela og-inf-rende">
    <thead><tr><th>Onde o dinheiro está</th><th class="num">Rende por ano (líquido)</th><th class="num">Real × IPCA</th><th class="num">Real × sua inflação</th></tr></thead>
    <tbody>${linhas.map((l) => `<tr><th scope="row">${esc(l.nome)}<small>${esc(l.nota)}</small></th><td class="num">${esc(formatPct(l.liquido, 2))}</td>${cel(l.realIpca)}${cel(l.realMinha)}</tr>`).join('')}</tbody>
  </table></div>
  <p class="og-nota">Confisco inflacionário: R$ 10.000 parados por 12 meses compram o que hoje custa <b>${esc(formatBRL(parado))}</b> pela sua inflação (<b>${esc(formatBRL(paradoIpca))}</b> pelo IPCA). Real = (1 + rendimento × (1 − IR)) ÷ (1 + inflação) − 1. Projeção com as taxas de hoje; Tesouro IPCA+/prefixado levados até o vencimento, sem custódia.</p>`;
}

/** A sua régua: o retorno mínimo (minha inflação + prêmio) e o % em dólar desejado - usados no Radar, em Aportes e na Análise. */
function reguaHtml(r, cfg, editavel) {
  const premio = typeof cfg.premio === 'number' ? cfg.premio : 0.05;
  const meta = typeof cfg.metaDolar === 'number' ? cfg.metaDolar : 0.3;
  const m = retornoMinimo(r.minha, premio, 0.15);
  const mi = retornoMinimo(r.ipca, premio, 0.15);
  const campo = (id, rot, v) => `<label class="tx-rotulo og-inf-campo">${rot}<span class="og-inf-campo-in"><input type="text" inputmode="decimal" class="input" id="${id}" value="${esc((v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }))}"${editavel ? '' : ' disabled'}><span>%</span></span></label>`;
  return `<h3 class="og-inf-sub">Sua régua de investimento</h3>
    <p class="og-nota">Retorno mínimo exigido = (1 + sua inflação) × (1 + o prêmio que você exige) − 1: <b>${esc(formatPct(m.liquido, 1))} a.a. líquido</b> (≈ ${esc(formatPct(m.bruto, 1))} bruto com IR de 15%). Pelo IPCA seria ${esc(formatPct(mi.liquido, 1))}. Ele aparece no momento de cada ativo (Acompanhamento e Aportes) e na Análise do ativo: DY do FII e retorno pelo lucro da ação contra essa régua.</p>
    <div class="og-inf-regua">${campo('ogInfPremio', 'Prêmio acima da inflação', premio)}${campo('ogInfMetaDolar', '% da carteira em dólar (meta)', meta)}${editavel ? '<button type="button" class="btn btn-tonal og-btn-sm" data-acao="salvar-regua">Salvar régua</button>' : ''}</div>`;
}

function opcoesGrafico(r) {
  const pts = r.acumulado12.slice(-24);
  return {
    series: [
      { id: 'minha', nome: 'Minha inflação (12 meses)', valores: pts.map((p) => p.minha), principal: true, cor: 1, largura: 2.5 },
      { id: 'ipca', nome: 'IPCA (12 meses)', valores: pts.map((p) => p.ipca), pontilhada: true, cor: 4 },
    ],
    eixoX: pts.map((p) => ({ rotulo: mesAno(p.mes), titulo: mesAno(p.mes) })), formatarX: (i) => (i && i.titulo) || '',
    formatarValor: (v) => formatPct(v, 2), formatarY: (v) => formatPct(v, 0), altura: 170, ticksY: 3,
    aria: `Minha inflação em 12 meses: ${formatPct(r.minha, 2)}; IPCA: ${formatPct(r.ipca, 2)}`,
  };
}

function tabelaItensHtml(r, catalogo) {
  const opcoes = (sel) => catalogo.map((c) => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.rotulo)}</option>`).join('');
  return `<div class="og-inf-tabela-wrap"><table class="og-inf-tabela">
    <thead><tr><th>Despesa</th><th class="num">Por mês</th><th class="num">Peso</th><th>Segue qual índice</th><th class="num">12 meses</th><th class="num">Contribuição</th></tr></thead>
    <tbody>${r.porItem.map((p) => `<tr>
      <th scope="row">${esc(p.nome)}</th><td class="num">${esc(formatBRL(p.mensal))}</td><td class="num">${esc(formatPct(p.peso, 1))}</td>
      <td><select class="input og-inf-sel" data-indice="${esc(p.nome)}" aria-label="Índice de ${esc(p.nome)}">${opcoes(p.indice)}</select>${p.sugerido ? '<small class="og-inf-sug">sugerido</small>' : ''}</td>
      <td class="num">${esc(formatPct(p.variacao, 2))}${p.estimada ? '<small>com IPCA geral</small>' : ''}</td><td class="num"><b>${esc((p.contribuicao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</b></td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row">Total</th><td class="num">${esc(formatBRL(r.total))}</td><td class="num">100%</td><td></td><td></td><td class="num"><b>${esc(formatPct(r.minha, 2))}</b></td></tr></tfoot>
  </table></div>`;
}

/**
 * Monta a seção em `el`. Opções: obterDados() -> Promise<resposta do GET inflacaoPessoal>, obterItens() -> itens do rascunho
 * ({ nome, valor, frequencia, categoria }), salvar(mapa) -> Promise<resposta>, obterMacro() -> Promise<macro montado|null>,
 * obterReserva() -> { meta } (a meta da reserva de hoje). Devolve { atualizar() } (chamar quando o rascunho mudar).
 */
export function montarMinhaInflacao(el, { obterDados, obterItens = () => null, salvar = null, salvarConfig = null, obterMacro = null, obterReserva = () => null, doc = null } = {}) {
  if (!el) return { atualizar() {} };
  let dados = null; let erro = null; let macro = null; let mapa = null; let mapaSalvo = null; let salvando = false;
  let grafico = null; let comp = null;
  const indefinido = () => !dados && !erro;

  function desenhar() {
    if (grafico) { try { grafico.destruir(); } catch (e) { /* ok */ } grafico = null; }
    if (comp) { try { comp.destruir(); } catch (e) { /* ok */ } comp = null; }
    const cab = '<div class="og-inf-cab"><h2>Minha inflação × IPCA</h2><span class="hint">a inflação das SUAS despesas, ao lado do IPCA oficial</span></div>';
    if (indefinido()) { el.innerHTML = `${cab}<p class="og-nota">Calculando a sua inflação…</p>`; return; }
    if (erro) { el.innerHTML = `${cab}<p class="og-nota bad">Não deu pra carregar os índices agora: ${esc(erro)}</p>`; return; }
    const itens = (obterItens() || []).filter((i) => !i.removida).map((i) => ({ nome: String(i.nome || '').trim(), valor: i.valor, frequencia: i.frequencia, categoria: i.categoria }));
    const r = calcularMinhaInflacao(dados, { itens: itens.length ? itens : null, mapa });
    if (!r) { el.innerHTML = `${cab}<p class="og-nota">O IPCA ainda não chegou do IBGE (a agenda diária busca). Tente mais tarde.</p>`; return; }
    const catalogo = dados.catalogo || [];
    const reserva = obterReserva() || {};
    const metaReserva = num(reserva.meta) ? reserva.meta : null;
    const mudouMapa = JSON.stringify(mapa) !== JSON.stringify(mapaSalvo);
    const tom = r.minha <= r.ipca ? 'bom' : 'aviso';
    const prefixado = macro && macro.prefixado ? macro.prefixado : null;
    const trAno = dados.series && dados.series.tr ? Object.keys(dados.series.tr).sort().slice(-12).reduce((a, m) => a * (1 + dados.series.tr[m]), 1) - 1 : 0;
    const linhasRende = linhasRendeDeVerdade(macro, { minha: r.minha, ipca: r.ipca, tr: trAno, prefixado });
    el.innerHTML = `${cab}
      <p class="og-nota">Últimos 12 meses (${esc(mesAno(r.periodo.de))} a ${esc(mesAno(r.periodo.ate))}), com o peso de cada despesa de hoje no seu mês. O IPCA continua sendo a referência oficial; esta é a <b>sua</b> inflação, em paralelo.</p>
      <div class="og-inf-kpis grid-kpi">
        ${kpiHtml({ classe: 'og-inf-kpi-minha', rotulo: 'Minha inflação (12 meses)', valorHtml: esc(formatPct(r.minha, 2)), subHtml: chipHtml(tom, `${pp(r.diferencaPp)} × IPCA`) })}
        ${kpiHtml({ rotulo: 'IPCA oficial (12 meses)', valorHtml: esc(formatPct(r.ipca, 2)), subHtml: 'IBGE' })}
        ${kpiHtml({ rotulo: 'Seu custo de vida subiu', valorHtml: `${esc(formatBRL(r.impactoMensal))}<small>/mês</small>`, subHtml: `pelo IPCA seriam ${esc(formatBRL(r.impactoIpca))}/mês` })}
        ${kpiHtml({ rotulo: 'Sem as parcelas (apê e dívidas)', valorHtml: esc(num(r.semParcelas) ? formatPct(r.semParcelas, 2) : '—'), subHtml: 'o que acompanha os preços: a sua inflação quando elas acabarem' })}
      </div>
      ${vereditoHtml(vereditoInflacao(r, { linhas: linhasRende }))}
      <div class="og-inf-comp" data-out="comp"></div>
      <p class="og-nota">${esc(formatPct(r.grupos.fixo, 0))} do seu gasto é fixo em reais (não sobe com a inflação: fica mais barato a cada ano)${r.grupos.tr > 0.0005 ? `, ${esc(formatPct(r.grupos.tr, 0))} segue a TR (${esc(formatPct(trAno, 2))} em 12 meses)` : ''} e ${esc(formatPct(r.grupos.precos, 0))} acompanha os preços.${metaReserva ? ` A meta da reserva (${esc(formatBRL(metaReserva))}) precisa de <b>${esc(formatBRL(corrigir(metaReserva, r.minha, 12)))}</b> daqui a 12 meses pela sua inflação (${esc(formatBRL(corrigir(metaReserva, r.ipca, 12)))} pelo IPCA).` : ''}</p>
      <div class="og-inf-grafico" data-out="grafico"></div>
      <details class="og-inf-det" open><summary>Como chega no número (por despesa)</summary>
        ${tabelaItensHtml(r, catalogo)}
        <div class="og-inf-acoes">${salvar ? `<button type="button" class="btn btn-tonal og-btn-sm" data-acao="salvar-indices"${mudouMapa && !salvando ? '' : ' disabled'}>${salvando ? 'Salvando…' : 'Salvar índices'}</button>` : ''}<span class="og-nota">Conta: peso da despesa × inflação de 12 meses do índice dela, somado. "Sugerido" = o site escolheu pelo nome; troque se não for o seu caso.${r.estimada ? ' Item sem série no IBGE usa o IPCA geral.' : ''}</span></div>
      </details>
      <h3 class="og-inf-sub">O que o seu dinheiro rende de verdade</h3>
      ${tabelaRendeHtml(linhasRende, r)}
      ${reguaHtml(r, dados.config || {}, !!salvarConfig)}`;
    const compEl = el.querySelector('[data-out="comp"]');
    if (compEl) comp = criarBarraComposicao(compEl, { fatias: [
      { id: 'fixo', nome: 'Fixo em reais', valor: r.grupos.fixo, cor: 'var(--chart-3)' },
      { id: 'tr', nome: 'Segue a TR', valor: r.grupos.tr, cor: 'var(--chart-2)' },
      { id: 'precos', nome: 'Acompanha os preços', valor: r.grupos.precos, cor: 'var(--chart-1)' },
    ], formatarValor: (v) => formatPct(v, 0) });
    const gEl = el.querySelector('[data-out="grafico"]');
    if (gEl && r.acumulado12.length >= 2) grafico = criarGraficoLinha(gEl, opcoesGrafico(r));
    el.querySelectorAll('[data-indice]').forEach((s) => s.addEventListener('change', () => {
      mapa = { ...(mapa || {}), [s.dataset.indice]: s.value };
      desenhar();
    }));
    const btnRegua = el.querySelector('[data-acao="salvar-regua"]');
    if (btnRegua) btnRegua.addEventListener('click', async () => {
      const ler = (id) => { const v = Number(String((el.querySelector(id) || {}).value || '').replace(',', '.')); return Number.isFinite(v) ? v / 100 : null; };
      const cfg = { premio: ler('#ogInfPremio'), metaDolar: ler('#ogInfMetaDolar') };
      if (cfg.premio == null || cfg.metaDolar == null) return;
      btnRegua.disabled = true;
      try {
        const resp = await salvarConfig(cfg);
        if (!resp || !resp.ok) throw new Error((resp && resp.erro) || 'sem resposta');
        dados = { ...dados, config: resp.config || cfg };
        desenhar();
      } catch (e) { btnRegua.disabled = false; erroSalvar(e); }
    });
    const btn = el.querySelector('[data-acao="salvar-indices"]');
    if (btn) btn.addEventListener('click', async () => {
      salvando = true; desenhar();
      try {
        // grava o índice de TODAS as despesas da lista (o sugerido vira escolha: a planilha fica com a cesta completa)
        const completo = Object.fromEntries(r.porItem.map((p) => [p.nome, (mapa && mapa[p.nome]) || p.indice]));
        const resp = await salvar(completo);
        if (!resp || !resp.ok) throw new Error((resp && resp.erro) || 'sem resposta');
        mapa = resp.mapa || completo; mapaSalvo = mapa; dados = { ...dados, cesta: { ...(dados.cesta || {}), mapa } };
      } catch (e) {
        erroSalvar(e);
      } finally { salvando = false; desenhar(); }
    });
  }
  function erroSalvar(e) {
    const d = doc || el.ownerDocument;
    const p = d.createElement('p'); p.className = 'og-nota bad'; p.textContent = `Não deu pra salvar os índices: ${e && e.message ? e.message : e}`;
    el.appendChild(p);
  }

  desenhar();
  Promise.resolve().then(() => obterDados()).then((r) => {
    if (!r || !r.ok) throw new Error((r && r.erro) || 'sem resposta');
    dados = r; mapa = { ...((r.cesta && r.cesta.mapa) || {}) }; mapaSalvo = { ...mapa };
    desenhar();
  }).catch((e) => { erro = e && e.message ? e.message : String(e); desenhar(); });
  if (obterMacro) Promise.resolve().then(() => obterMacro()).then((m) => { macro = m || null; if (dados) desenhar(); }).catch(() => { /* sem contexto de mercado: só a tabela de rendimento some */ });
  return { atualizar() { if (dados) desenhar(); } };
}

export { porMes };
