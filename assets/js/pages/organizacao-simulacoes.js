/**
 * organizacao-simulacoes.js - 03/10/2026: aba "Simulações" da Organização
 * Financeira (organizacao/despesas.html#simulacoes).
 *
 * Tiago: "Eu senti que Gastos e Despesas ficou muito grande.. jogue tudo que
 * tem a parte de simulações (basicamente 'amortizar ou investir?' pra baixo)
 * pra uma nova aba, 'Simulações'. No topo dessa aba, um hero com os valores
 * de simulação do patrimônio ('Ritmo atual e quando chego ao primeiro
 * milhão', viés entre investir vs amortizar, e algo a mais que seja
 * importante ali), abaixo todo o resto em detalhes, como já tem hoje."
 *
 * Herói (4 cartões, todos a partir da mesma simulação do formulário abaixo):
 *  - Ritmo atual: quanto o patrimônio líquido cresceu nos últimos 12 meses
 *    (origemCrescimento, o mesmo "de onde veio" da aba Patrimônio) e o aporte
 *    médio de verdade (aporteMedio).
 *  - Primeiro R$ 1 milhão (ou o próximo milhão): quando o patrimônio líquido
 *    chega lá no ritmo atual e com o valor do simulador amortizando ou
 *    investido (projetarMarco no simulador-dividas-calc.js - investimentos
 *    pelo projetarAposentadoria da aba Patrimônio, dívidas e FGTS pelo
 *    simulador, tudo em dinheiro de hoje); idade (idadeEm) e, no pé, a
 *    aposentadoria e o Coast FI da aba Patrimônio.
 *  - Viés: amortizar ou investir - o veredito curto (quem ganha, por quanto
 *    no horizonte, ponto de virada x o retorno líquido do investimento).
 *  - Quitação das dívidas: quando o apê e o FIES acabam hoje e com o valor
 *    do simulador.
 * Embaixo, o simulador inteiro (organizacao-simulador.js). O herói se
 * redesenha a cada mudança no formulário (aoMudar).
 */
import { formatNumeroBR } from '../format.js';
import { mil, brl0, mesAno } from './patrimonio-graficos.js';
import { difMeses } from './patrimonio-calc.js';
import { projetarMarco, proximoMilhao, PERFIS } from './simulador-dividas-calc.js';
import { montarSimuladorDividas } from './organizacao-simulador.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (f, casas = 1) => (num(f) ? `${formatNumeroBR(f * 100, casas)}%` : '—');
const anosTxt = (m) => (m == null ? '—' : m < 24 ? `${Math.round(m)} ${Math.round(m) === 1 ? 'mês' : 'meses'}` : `${formatNumeroBR(m / 12, 1)} anos`);
const milhaoTxt = (v) => (v >= 2e6 ? `R$ ${formatNumeroBR(v / 1e6, 0)} milhões` : 'R$ 1 milhão');
const NOME = { financiamento: 'Apê', fies: 'FIES' };
const NOME_LONGO = { financiamento: 'o apê', fies: 'o FIES' };

// ---------------------------------------------------------------------------
// Números do herói (sem DOM)
// ---------------------------------------------------------------------------

/**
 * Tudo que o herói mostra. ctx: contextoPatrimonio (aba Patrimônio); sim:
 * simular(params) do formulário; params: os parâmetros do formulário.
 */
export function resumoHeroi(ctx, sim, params = sim && sim.params) {
  if (!ctx || !sim) return null;
  const p = params || sim.params;
  const r = sim.resumo;
  const pr = sim.premissas;
  const b = ctx.b || {};
  // --- ritmo
  const aporte = num(ctx.ritmo) ? ctx.ritmo : (num(ctx.aporte) ? ctx.aporte : 0);
  const o = ctx.origem;
  const mesesOrigem = o ? Math.max(1, difMeses(o.de, o.ate)) : null;
  const ritmo = {
    liquido: b.liquido, aporte, aporteDoRitmo: num(ctx.ritmo),
    crescimento: o ? { total: o.total, meses: mesesOrigem, porMes: o.total / mesesOrigem, porAno: (o.total / mesesOrigem) * 12, de: o.de, ate: o.ate, itens: o.itens } : null,
  };
  // --- marco (primeiro milhão)
  const investido = (b.ativos || []).filter((a) => a.id === 'investimentos' || a.id === 'reserva').reduce((s, a) => s + (a.valor || 0), 0);
  const quitBase = (id) => (r.quitacao[id] && r.quitacao[id].base != null ? r.quitacao[id].base : null);
  const liberacoes = ctx.p && ctx.p.parcelasViramAporte === false ? [] : (ctx.libs || []).map((l) => ({ ...l, mes: quitBase(l.id) != null ? quitBase(l.id) : l.mes }));
  const alvo = proximoMilhao(b.liquido);
  const base = sim.temDivida ? sim.cenarios.base.linhas : null;
  const proj = (cenario) => projetarMarco({
    liquido: b.liquido || 0, investido, aporte, rendimentoReal: ctx.rendimento, ipca: pr.ipca, liberacoes, base, cenario, alvo,
  }).meses;
  const quando = (m) => (m == null ? null : { m, ...(ctx.quando ? ctx.quando(m) : {}) });
  const temExtra = sim.temDivida && p.valor > 0;
  const marco = {
    alvo,
    ritmo: quando(proj(null)),
    amortizar: temExtra && r.ordemAlvo.length ? quando(proj(sim.cenarios.amortizar.linhas)) : null,
    investir: temExtra ? quando(proj(sim.cenarios.investir.linhas)) : null,
    aposentadoria: ctx.proj ? { alvo: ctx.alvo, ...quando(ctx.proj.chegou) } : null,
    coast: num(ctx.coast) ? { valor: ctx.coast, pct: ctx.coast > 0 ? (ctx.inicial || 0) / ctx.coast : null, idade: ctx.p && ctx.p.idadeAlvo } : null,
  };
  // --- viés
  const alvoDiv = r.ordemAlvo[0] || null;
  const dif = Math.abs(r.vantagemInvestir || 0);
  const empate = !alvoDiv || !(p.valor > 0) ? null : dif < Math.max(0.02 * (r.aportadoHorizonte || 0), 1000);
  const vies = {
    alvo: alvoDiv, valor: p.valor, frequencia: p.frequencia, perfil: p.perfil, horizonte: r.horizonteAnos, ano: r.anoHorizonte,
    melhor: !alvoDiv || !(p.valor > 0) ? null : (empate ? 'empate' : r.melhor), diferenca: dif,
    virada: r.virada, retornoLiquido: r.retornoLiquido, cdiLiquidoHoje: num(pr.cdi) ? pr.cdi * 0.85 : null,
    custoAlvo: alvoDiv ? r.custos[alvoDiv] : null,
  };
  // --- quitação
  const dividas = Object.keys(r.quitacao).map((id) => {
    const q = r.quitacao[id];
    const custo = r.custos[id] ? r.custos[id].hoje : null;
    const lib = (ctx.libs || []).find((l) => l.id === id);
    return {
      id, baseMes: q.baseMes, novoMes: q.amortizarMes, adiantados: q.mesesAdiantados || 0, noAlvo: r.ordemAlvo.includes(id),
      custo, abaixoInflacao: num(custo) && custo < pr.ipca, libera: lib ? lib.valor : null,
    };
  });
  return { ritmo, marco, vies, dividas, ipca: pr.ipca, temDivida: sim.temDivida };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const idadeTxt = (q) => (q && q.idade != null ? `aos ${q.idade} anos` : '');
const antesTxt = (q, ref) => (q && ref && q.m != null && ref.m != null && ref.m - q.m > 0 ? `${anosTxt(ref.m - q.m)} antes` : '');

export function htmlHeroi(h) {
  if (!h) return '';
  const { ritmo: rt, marco: mc, vies: v, dividas } = h;
  const c = rt.crescimento;
  const itensCresc = c ? c.itens.filter((i) => Math.abs(i.valor) >= 500).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)) : [];
  const nomeItem = { aportes: 'aportes', rendimento: 'rendimento', dividas: 'dívidas abatidas', imovel: 'apê', fgts: 'FGTS' };
  const valorTxt = `${brl0(v.valor)}${v.frequencia === 'anual' ? '/ano' : '/mês'}`;
  const perfil = PERFIS[v.perfil] || PERFIS.cdi100;

  const tRitmo = `
    <article class="sm-tile sm-ritmo">
      <span class="pt-rot">Ritmo atual</span>
      ${c ? `<span class="sm-grande ${c.porMes >= 0 ? '' : 'neg'}">${c.porMes >= 0 ? '+' : '−'}${esc(mil(Math.abs(c.porMes)))}<small>/mês</small></span>
      <span class="sm-sub">o patrimônio líquido ${c.porMes >= 0 ? 'cresceu' : 'caiu'} <b>${esc(mil(Math.abs(c.total)))}</b> em ${esc(c.meses)} meses (${esc(mesAno(c.de))} → ${esc(mesAno(c.ate))}) · <b>${esc(mil(Math.abs(c.porAno)))}/ano</b> · hoje <b>${esc(mil(rt.liquido))}</b></span>`
    : `<span class="sm-grande">${esc(mil(rt.liquido))}</span><span class="sm-sub">patrimônio líquido hoje · o crescimento aparece com 2 meses de histórico</span>`}
      <ul class="sm-lista">
        <li><span>Aporte médio</span><b>${esc(brl0(rt.aporte))}/mês</b><small>${rt.aporteDoRitmo ? 'o que você aportou de verdade nos últimos 12 meses (longo prazo)' : 'sem histórico de aportes: a sua meta de aporte'}</small></li>
        ${itensCresc.length ? `<li class="sm-origem"><span>De onde veio</span><small>${itensCresc.map((i) => `${esc(nomeItem[i.id] || i.nome)} <b>${i.valor >= 0 ? '+' : '−'}${esc(mil(Math.abs(i.valor)).replace('R$ ', ''))}</b>`).join(' · ')}</small></li>` : ''}
      </ul>
    </article>`;

  const r0 = mc.ritmo;
  const tMarco = `
    <article class="sm-tile sm-marco">
      <span class="pt-rot">${mc.alvo > 1e6 ? `Próximo marco: ${esc(milhaoTxt(mc.alvo))}` : 'Primeiro R$ 1 milhão'}</span>
      <span class="sm-grande">${r0 ? (r0.m === 0 ? 'já chegou' : esc(r0.rotulo)) : 'não chega'}</span>
      <span class="sm-sub">${r0 && r0.m ? `${idadeTxt(r0) ? `${esc(idadeTxt(r0))} · ` : ''}daqui a <b>${esc(anosTxt(r0.m))}</b> · no ritmo atual` : r0 ? '' : 'em 50 anos, no ritmo atual'} · patrimônio líquido em dinheiro de hoje</span>
      <ul class="sm-lista">
        ${mc.amortizar ? `<li><span>+ ${esc(valorTxt)} amortizando ${esc(NOME_LONGO[v.alvo] || 'a dívida')}</span><b>${esc(mc.amortizar.rotulo)}</b><small>${esc([idadeTxt(mc.amortizar), antesTxt(mc.amortizar, r0)].filter(Boolean).join(' · '))}</small></li>` : ''}
        ${mc.investir ? `<li><span>+ ${esc(valorTxt)} em ${esc(perfil.nome)}</span><b>${esc(mc.investir.rotulo)}</b><small>${esc([idadeTxt(mc.investir), antesTxt(mc.investir, r0)].filter(Boolean).join(' · '))}</small></li>` : ''}
      </ul>
      ${mc.aposentadoria && mc.aposentadoria.m != null ? `<span class="sm-pe">Aposentadoria (${esc(mil(mc.aposentadoria.alvo))}): <b>${esc(mc.aposentadoria.ano)}</b>${mc.aposentadoria.idade != null ? `, aos ${esc(mc.aposentadoria.idade)}` : ''}${mc.coast ? ` · Coast FI ${esc(mil(mc.coast.valor))} (você tem ${esc(pct(mc.coast.pct, 0))})` : ''} · <a class="pt-link" href="#patrimonio">aba Patrimônio ›</a></span>` : ''}
    </article>`;

  let tVies;
  if (!v.melhor) {
    tVies = `<article class="sm-tile sm-vies"><span class="pt-rot">Viés: investir ou amortizar</span><span class="sm-grande">—</span><span class="sm-sub">${h.temDivida ? 'Coloque um valor no simulador abaixo.' : 'Sem dívida pra amortizar: investir é o caminho.'}</span></article>`;
  } else {
    const cls = v.melhor === 'amortizar' ? 'amort' : v.melhor === 'investir' ? 'inv' : '';
    const titulo = v.melhor === 'empate' ? 'Empate' : v.melhor === 'amortizar' ? `Amortizar ${NOME_LONGO[v.alvo]}` : 'Investir';
    const vir = v.virada && !v.virada.acima && !v.virada.abaixo ? v.virada.taxa : null;
    tVies = `
    <article class="sm-tile sm-vies ${cls}">
      <span class="pt-rot">Viés: investir ou amortizar</span>
      <span class="sm-grande sm-cor">${esc(titulo)}</span>
      <span class="sm-sub">${v.melhor === 'empate' ? `diferença de só <b>${esc(mil(v.diferenca))}</b>` : `<span class="pt-pill good">+${esc(mil(v.diferenca))}</span> de patrimônio`} em ${esc(v.ano)} · ${esc(valorTxt)} por ${esc(v.horizonte)} anos: ${esc(NOME_LONGO[v.alvo])} × ${esc(perfil.nome)}</span>
      <ul class="sm-lista">
        ${vir != null ? `<li><span>Ponto de virada</span><b>${esc(pct(vir))} a.a.</b><small>investir só ganha rendendo mais que isso, já sem IR</small></li>` : ''}
        <li><span>${esc(perfil.curto)} líquido</span><b>~${esc(pct(v.retornoLiquido))} a.a.</b><small>média em ${esc(v.horizonte)} anos${v.perfil.startsWith('cdi') && num(v.cdiLiquidoHoje) ? ` · hoje o CDI líquido dá ${esc(pct(v.cdiLiquidoHoje))} (a conta supõe ele caindo)` : ''}</small></li>
        ${v.custoAlvo ? `<li><span>Custo ${esc(v.alvo === 'fies' ? 'do FIES' : 'do apê')}</span><b>${esc(pct(v.custoAlvo.medio))} a.a.</b><small>juros${v.alvo === 'financiamento' ? ' + TR + seguro' : ''}, média no período · o "rendimento" de amortizar</small></li>` : ''}
      </ul>
    </article>`;
  }

  const tQuita = `
    <article class="sm-tile sm-quita">
      <span class="pt-rot">Quitação das dívidas</span>
      ${dividas.length ? `<ul class="sm-dividas">${dividas.map((d) => `
        <li>
          <span class="sm-div-n">${esc(NOME[d.id] || d.id)}</span>
          <span class="sm-div-d">${d.adiantados > 0 ? `<s>${esc(mesAno(d.baseMes))}</s> → <b>${esc(mesAno(d.novoMes))}</b>` : `<b>${esc(mesAno(d.baseMes))}</b>`}</span>
          <small>${d.adiantados > 0 ? `<b>${esc(anosTxt(d.adiantados))} antes</b> com ${esc(valorTxt)}` : d.abaixoInflacao ? `no prazo: custa ${esc(pct(d.custo))} a.a., menos que a inflação - não antecipe` : d.noAlvo ? 'no prazo' : 'no prazo (o extra vai pra outra dívida)'}${num(d.libera) && d.libera > 0 ? ` · depois, ${esc(brl0(d.libera))}/mês livres` : ''}</small>
        </li>`).join('')}</ul>` : '<span class="sm-sub">Sem financiamento nem FIES cadastrados.</span>'}
      <span class="sm-pe">Com o FGTS amortizando o apê a cada 2 anos, como no simulador.</span>
    </article>`;

  return `<div class="sm-hero">${tRitmo}${tMarco}${tVies}${tQuita}</div>`;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

/**
 * Monta a aba: herói em `hero` e o simulador em `simulador`. Opções: ctx
 * (contextoPatrimonio), doc, hoje, storage (do simulador).
 * Devolve { atualizar(ctx), simulador, resumo }.
 */
export function montarAbaSimulacoes({ hero, simulador }, { ctx, doc = (hero || simulador).ownerDocument, hoje = null, storage = undefined } = {}) {
  let contexto = ctx;
  let resumo = null;
  const desenharHeroi = (sim, p) => {
    if (!hero) return;
    try { resumo = resumoHeroi(contexto, sim, p); hero.innerHTML = htmlHeroi(resumo); } catch (e) { hero.innerHTML = `<div class="carteiras-erro">Não deu pra montar o resumo: ${esc(e.message || e)}</div>`; }
  };
  const sec = montarSimuladorDividas(simulador, { ctx, doc, hoje, storage, aoMudar: (sim, p) => desenharHeroi(sim, p) });
  return {
    atualizar(novoCtx) { contexto = novoCtx; sec.atualizar(novoCtx); },
    get simulador() { return sec; },
    get resumo() { return resumo; },
  };
}
