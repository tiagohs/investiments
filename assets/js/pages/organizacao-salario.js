/**
 * organizacao-salario.js - 26/09/2026: aba "Salário e investimentos" da
 * Organização Financeira (organizacao/despesas.html#salario).
 * 03/10/2026: virou a seção "Orçamento do salário" da aba "Renda e
 * Orçamentos" (#renda; #salario continua abrindo ela). O "Investido mês a
 * mês" saiu daqui: a aba tem um só gadget de "quanto do salário você investe
 * por mês" - o da seção Renda (organizacao-renda.js), que mostra em % do
 * líquido e em R$, com filtro de período ("Escolher período"), "só longo
 * prazo" e "descontar proventos" (Tiago: "se a aba salário já tiver 'quanto
 * invisto por mês', mantenha um só, o melhor").
 *
 *  - Base das contas: salário líquido (DM!N11) e a meta de investimento em %
 *    ou em R$ (DM!Q11) - editáveis aqui, o resto do site acompanha.
 *  - Holerite: importar o PDF (holerite.js lê no navegador), conferir e
 *    salvar na aba 'Salário'; do bruto ao líquido, alíquota efetiva, FGTS.
 *  - Orçamento do salário, projeção até o Patrimônio desejado e extras do
 *    ano (13º, férias, PLR, bônus) com quanto investir de cada um.
 * Contas em salario-calc.js; back-end em apps-script/Salario.gs.
 */
import { getSalario, salvarSalarioBase, salvarPagamentoSalario, excluirPagamentoSalario } from '../api-client.js';
import { formatBRL, formatNumeroBR } from '../format.js';
import { carregarPdfJs, extrairLinhasPdf, lerHolerite, TIPOS_PAGAMENTO } from './holerite.js';
import {
  metaMensal, mediaInvestida, mesesAteAlvo, trajetoria, ultimoHolerite, orcamentoSalario, extrasDoAno,
} from './salario-calc.js';
import { lerValorBR } from './organizacao-calc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const brl = (v) => formatBRL(v);
const pct = (f, casas = 1) => (num(f) ? `${formatNumeroBR(f * 100, casas)}%` : '—');
const dec = (texto) => { const m = String(texto).match(/^(.*?)(,\d{2})$/); return m ? `${esc(m[1])}<span class="dec">${esc(m[2])}</span>` : esc(texto); };
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const rotuloMes = (m) => { const [a, mm] = String(m || '').split('-'); return a && mm ? `${MESES_CURTOS[Number(mm) - 1]}/${a.slice(2)}` : String(m || ''); };
const brlK = (v) => {
  if (!num(v)) return '—';
  if (Math.abs(v) >= 1e6) return `R$ ${formatNumeroBR(v / 1e6, 2)} mi`;
  return Math.abs(v) >= 1000 ? `R$ ${formatNumeroBR(v / 1000, 1)} mil` : brl(v);
};
const anosTxt = (m) => { if (m == null) return 'não chega'; if (m === 0) return 'já chegou'; const a = m / 12; return a < 1 ? `${m} ${m === 1 ? 'mês' : 'meses'}` : `${formatNumeroBR(a, 1)} anos`; };


// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

export function htmlHeroSalario(d, { editando }) {
  const meta = metaMensal(d.base);
  const hol = ultimoHolerite(d.pagamentos);
  const difHol = hol && num(hol.liquido) && num(d.base.liquido) ? d.base.liquido - hol.liquido : null;
  return `
    <article class="og-tile">
      <span class="og-rotulo">Salário líquido (base das contas) <button type="button" class="tx-link" data-acao="editar-base">${editando ? 'Fechar' : 'Editar'}</button></span>
      <span class="og-grande">${dec(brl(d.base.liquido))}<small>/mês</small></span>
      <span class="og-sub">${hol ? `holerite de ${esc(rotuloMes(hol.mes))}: <b>${esc(brl(hol.liquido))}</b>${num(difHol) && Math.abs(difHol) >= 0.01 ? ` · base ${difHol > 0 ? 'acima' : 'abaixo'} em ${esc(brl(Math.abs(difHol)))}` : ' · igual à base'}` : 'base das contas da planilha (aba Distribuição e Metas)'}</span>
    </article>
    <article class="og-tile">
      <span class="og-rotulo">Meta de investimento <span class="status-pill na">${esc(pct(d.base.percentualInvestir, 0))} do líquido</span></span>
      <span class="og-grande">${dec(brl(meta))}<small>/mês</small></span>
      <span class="og-sub">${esc(brl(num(meta) ? meta * 12 : null))} por ano · quanto você investe de fato está em <a class="tx-link" href="#rdSecInv">Quanto do salário você investe</a></span>
    </article>`;
}

export function htmlFormBase(d) {
  const hol = ultimoHolerite(d.pagamentos);
  const meta = metaMensal(d.base);
  return `
    <form class="og-card sl-base-form" id="slBaseForm" novalidate>
      <div class="sl-form-cab"><h2>Base das contas</h2><span class="hint">grava na planilha, aba Distribuição e Metas (salário líquido e % pra investir) - o resto do site acompanha</span></div>
      <div class="sl-campos">
        <label class="sl-campo"><span>Salário líquido</span><span class="sl-input"><i>R$</i><input id="slLiquido" inputmode="decimal" value="${esc(formatNumeroBR(d.base.liquido))}"></span>
          ${hol && num(hol.liquido) && Math.abs(hol.liquido - d.base.liquido) >= 0.01 ? `<button type="button" class="og-sug" data-acao="usar-holerite" data-valor="${hol.liquido}">usar o do holerite de ${esc(rotuloMes(hol.mes))} (${esc(brl(hol.liquido))})</button>` : ''}
        </label>
        <label class="sl-campo"><span>Quero investir</span><span class="sl-input"><input id="slPct" inputmode="decimal" value="${esc(formatNumeroBR((d.base.percentualInvestir || 0) * 100, 1))}"><i>%</i></span></label>
        <span class="sl-igual" aria-hidden="true">=</span>
        <label class="sl-campo"><span>por mês</span><span class="sl-input"><i>R$</i><input id="slValor" inputmode="decimal" value="${esc(formatNumeroBR(meta))}"></span></label>
      </div>
      <p class="og-nota" id="slBasePrevia"></p>
      <div class="sl-form-botoes"><span class="sl-msg" id="slBaseMsg" role="status"></span>
        <button type="button" class="btn btn-ghost og-btn-sm" data-acao="editar-base">Cancelar</button>
        <button type="submit" class="btn btn-primary og-btn-sm">Salvar</button></div>
    </form>`;
}

export function htmlHolerite(d, { form }) {
  if (form) return htmlFormPagamento(form, d);
  const hol = ultimoHolerite(d.pagamentos);
  const botoes = `<div class="tx-botoes"><button type="button" class="btn btn-primary og-btn-sm" data-acao="importar">Importar holerite (PDF)</button><button type="button" class="btn btn-ghost og-btn-sm" data-acao="novo-pagamento">Adicionar à mão</button><input type="file" id="slArquivo" accept="application/pdf,.pdf" hidden></div>`;
  if (!hol) {
    return `<div class="lateral-cab"><h2>Holerite</h2></div><p class="og-nota">Nenhum holerite salvo ainda. Importe o PDF do mês (é lido aqui no navegador) ou preencha à mão.</p>${botoes}${htmlPagamentos(d)}`;
  }
  const o = orcamentoSalario({ holerite: hol }).bruto;
  const linha = (rot, v, cls = '', extra = '') => `<li class="${cls}"><span>${rot}</span><b>${dec(brl(v))}</b><small>${extra}</small></li>`;
  const itensHtml = (hol.itens || []).filter((i) => i.vencimento || i.desconto).map((i) => `<tr><td>${esc(i.descricao)}</td><td class="n">${i.vencimento ? esc(brl(i.vencimento)) : ''}</td><td class="n">${i.desconto ? esc(brl(i.desconto)) : ''}</td></tr>`).join('');
  return `
    <div class="lateral-cab"><h2>Holerite · ${esc(rotuloMes(hol.mes))}</h2><span class="hint">${hol.dataCredito ? `crédito em ${esc(hol.dataCredito.split('-').reverse().join('/'))}` : ''}</span></div>
    <ul class="sl-cascata">
      ${linha('Salário base', hol.salarioBase)}
      ${hol.outrosVencimentos ? linha('+ Outros vencimentos', hol.outrosVencimentos) : ''}
      ${linha('= Total de vencimentos', o.vencimentos, 'sub')}
      ${linha('− INSS', hol.inss, 'menos', pct(o.aliquotaINSS))}
      ${linha('− Imposto de renda', hol.irrf, 'menos', pct(o.aliquotaIR))}
      ${hol.outrosDescontos ? linha('− Outros descontos', hol.outrosDescontos, 'menos') : ''}
      ${linha('= Líquido', hol.liquido, 'total')}
      ${hol.fgts ? linha('+ FGTS (depósito da empresa)', hol.fgts, 'fora', 'fora da carteira') : ''}
    </ul>
    <p class="og-nota">Impostos levam <b>${esc(pct(o.aliquotaImpostos))}</b> do bruto (alíquota efetiva de IR ${esc(pct(o.aliquotaIR))}, bem abaixo dos 27,5% da tabela). Somando o FGTS, o pacote do mês é ${esc(brl(o.pacote))}.</p>
    ${itensHtml ? `<details class="sl-verbas"><summary>Ver todas as verbas</summary><table><thead><tr><th>Verba</th><th class="n">Vencimento</th><th class="n">Desconto</th></tr></thead><tbody>${itensHtml}</tbody></table></details>` : ''}
    ${botoes}
    ${htmlPagamentos(d)}`;
}

function htmlPagamentos(d) {
  const ps = d.pagamentos || [];
  if (!ps.length) return '';
  const li = (p) => `
    <li data-mes="${esc(p.mes)}" data-tipo="${esc(p.tipo)}">
      <span class="sl-pag-mes">${esc(rotuloMes(p.mes))}</span><span class="sl-pag-tipo">${esc(p.tipo)}${p.status === 'Previsto' ? ' <span class="status-pill warn">previsto</span>' : ''}</span>
      <b>${esc(brl(p.liquido))}</b>
      <span class="og-acoes"><button type="button" class="tx-link" data-acao="editar-pagamento">editar</button><button type="button" class="og-remover" data-acao="excluir-pagamento" aria-label="Excluir ${esc(p.tipo)} de ${esc(rotuloMes(p.mes))}" title="Excluir">×</button></span>
    </li>`;
  // 03/10/2026: só os 6 mais recentes à vista; o resto num "ver todos" (a lista crescia um holerite por mês)
  const VISIVEIS = 6;
  return `<h3 class="sl-sub">Pagamentos salvos</h3><ul class="sl-pags">${ps.slice(0, VISIVEIS).map(li).join('')}</ul>
    ${ps.length > VISIVEIS ? `<details class="sl-pags-mais"><summary>ver todos (${ps.length})</summary><ul class="sl-pags">${ps.slice(VISIVEIS).map(li).join('')}</ul></details>` : ''}`;
}

const CAMPOS_PAG = [
  ['salarioBase', 'Salário base'], ['outrosVencimentos', 'Outros vencimentos'], ['inss', 'INSS'], ['irrf', 'Imposto de renda'],
  ['outrosDescontos', 'Outros descontos'], ['liquido', 'Líquido'], ['fgts', 'FGTS do mês'],
];

export function htmlFormPagamento(f, d) {
  const p = f.pagamento;
  const venc = (p.salarioBase || 0) + (p.outrosVencimentos || 0);
  const desc = (p.inss || 0) + (p.irrf || 0) + (p.outrosDescontos || 0);
  const confere = num(p.liquido) && Math.abs(venc - desc - p.liquido) <= 0.02;
  return `
    <form class="sl-pag-form" id="slPagForm" novalidate>
      <div class="lateral-cab"><h2>${f.origem === 'pdf' ? 'Confira o holerite' : f.editando ? 'Editar pagamento' : 'Novo pagamento'}</h2><span class="hint">${f.origem === 'pdf' ? esc(f.arquivo || '') : ''}</span></div>
      ${(p.avisos || []).length ? `<ul class="sl-avisos">${p.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <div class="sl-grade">
        <label class="sl-campo"><span>Mês</span><input type="month" name="mes" value="${esc(p.mes || '')}" required></label>
        <label class="sl-campo"><span>Tipo</span><select name="tipo">${TIPOS_PAGAMENTO.map((t) => `<option${t === p.tipo ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="sl-campo"><span>Status</span><select name="status"><option${p.status !== 'Previsto' ? ' selected' : ''}>Recebido</option><option${p.status === 'Previsto' ? ' selected' : ''}>Previsto</option></select></label>
        <label class="sl-campo"><span>Data de crédito</span><input type="date" name="dataCredito" value="${esc(p.dataCredito || '')}"></label>
        ${CAMPOS_PAG.map(([k, rot]) => `<label class="sl-campo${k === 'liquido' ? ' destaque' : ''}"><span>${esc(rot)}</span><span class="sl-input"><i>R$</i><input name="${k}" inputmode="decimal" value="${num(p[k]) ? esc(formatNumeroBR(p[k])) : ''}"></span></label>`).join('')}
      </div>
      <p class="og-nota ${confere ? 'good' : 'bad'}" id="slPagConfere">${num(p.liquido) ? (confere ? `Confere: ${brl(venc)} − ${brl(desc)} = ${brl(p.liquido)}` : `Vencimentos − descontos = ${brl(venc - desc)}, mas o líquido informado é ${brl(p.liquido)}`) : ''}</p>
      <label class="sl-check"><input type="checkbox" name="usarComoBase"${f.usarComoBase ? ' checked' : ''}> Usar este líquido como salário base das contas (hoje ${esc(brl(d.base.liquido))})</label>
      <div class="sl-form-botoes"><span class="sl-msg" id="slPagMsg" role="status">${esc(f.erro || '')}</span>
        <button type="button" class="btn btn-ghost og-btn-sm" data-acao="cancelar-pagamento">Cancelar</button>
        <button type="submit" class="btn btn-primary og-btn-sm"${f.salvando ? ' disabled' : ''}>${f.salvando ? 'Salvando…' : 'Salvar'}</button></div>
    </form>`;
}

export function htmlOrcamento(d) {
  const hol = ultimoHolerite(d.pagamentos);
  const o = orcamentoSalario({ holerite: hol, base: d.base, despesasReal: d.despesas && d.despesas.totalReal });
  const barra = (partes, total) => `<div class="og-sal-barra">${partes.map(([cls, v, rot]) => (v > 0 ? `<span class="${cls}" style="width:${Math.min(100, (v / total) * 100).toFixed(2)}%" title="${esc(`${rot}: ${brl(v)} (${pct(v / total, 0)})`)}"></span>` : '')).join('')}</div>`;
  const leg = (itens, total) => `<ul class="og-sal-leg">${itens.map(([cls, v, rot]) => `<li><i class="${cls}"></i><span>${esc(rot)}</span><b>${esc(brl(v))}</b><small>${esc(pct(v / total, 0))}</small></li>`).join('')}</ul>`;
  let html = '<div class="lateral-cab"><h2>Orçamento do salário</h2></div>';
  if (o.bruto) {
    const b = o.bruto;
    const itens = [['imp', b.inss + b.irrf, 'Impostos (INSS + IR)'], ['out', b.outrosDescontos, 'Outros descontos'], ['liq', b.liquido, 'Líquido']].filter((x) => x[1] > 0);
    html += `<h3 class="sl-sub">Do bruto (${esc(brl(b.vencimentos))})</h3>${barra(itens, b.vencimentos)}${leg(itens, b.vencimentos)}`;
  }
  if (o.liquido) {
    const l = o.liquido;
    const itens = [['ess', l.essenciais, 'Despesas essenciais'], ['inv', l.aporte, 'Meta de investimento'], ['liv', Math.max(0, l.livre), l.livre >= 0 ? 'Livre' : 'Falta']];
    html += `<h3 class="sl-sub">Do líquido (${esc(brl(l.total))})</h3>${barra(itens, l.total)}${leg(itens, l.total)}
      <p class="og-nota fraca">Despesas pelo gasto real (Gastos e Despesas). ${l.livre < 0 ? `<b class="bad">Despesas + meta passam do líquido em ${esc(brl(-l.livre))}.</b>` : `Sobram ${esc(brl(l.livre))} livres por mês.`}</p>
      ${d.despesas && d.despesas.erroFormula ? `<p class="og-nota bad">O total da aba Despesas Essenciais está com erro na planilha (${esc(d.despesas.erroFormula)}); aqui entrou a soma das despesas. Salvar as despesas de novo em Organização (ou rodar repararFormulasDespesas) conserta a planilha.</p>` : ''}`;
  }
  return html;
}

export function htmlProjecao(d, med) {
  const p = d.patrimonio || {};
  if (!num(p.atual) || !num(p.desejado)) return '<div class="lateral-cab"><h2>Projeção</h2></div><p class="og-nota fraca">Sem patrimônio desejado na planilha (aba Distribuição e Metas).</p>';
  const meta = metaMensal(d.base);
  const ritmo = med.media;
  const mRitmo = mesesAteAlvo({ atual: p.atual, alvo: p.desejado, rendimentoAnual: p.rendimento, aporte: ritmo });
  const mMeta = mesesAteAlvo({ atual: p.atual, alvo: p.desejado, rendimentoAnual: p.rendimento, aporte: meta });
  const anoHoje = Number(String(d.hoje || '').slice(0, 4)) || new Date().getFullYear();
  const quando = (m) => (m == null || m === 0 ? '' : `em ${anoHoje + Math.ceil(m / 12)}`);
  const ganho = mRitmo != null && mMeta != null ? mRitmo - mMeta : null;
  // gráfico: 2 trajetórias até o alvo
  const tR = trajetoria({ atual: p.atual, alvo: p.desejado, rendimentoAnual: p.rendimento, aporte: ritmo }, 45);
  const tM = trajetoria({ atual: p.atual, alvo: p.desejado, rendimentoAnual: p.rendimento, aporte: meta }, 45);
  const W = 320; const H = 120; const mg = { t: 12, r: 8, b: 18, l: 8 };
  const maxAno = Math.max(tR[tR.length - 1].ano, tM[tM.length - 1].ano, 1);
  const maxV = Math.max(p.desejado, ...tR.map((x) => x.valor), ...tM.map((x) => x.valor));
  const x = (a) => mg.l + (a / maxAno) * (W - mg.l - mg.r);
  const y = (v) => mg.t + (1 - v / maxV) * (H - mg.t - mg.b);
  const caminho = (t) => t.map((q, i) => `${i ? 'L' : 'M'}${x(q.ano).toFixed(1)},${y(q.valor).toFixed(1)}`).join('');
  return `
    <div class="lateral-cab"><h2>Projeção até o objetivo</h2><a class="hint" href="../distribuicoes-metas.html">${esc(brlK(p.desejado))} ›</a></div>
    <ul class="sl-proj">
      <li><i class="k-ritmo"></i><span>No seu ritmo <small>${esc(brl(ritmo))}/mês</small></span><b>${esc(anosTxt(mRitmo))}</b><small>${esc(quando(mRitmo))}</small></li>
      <li><i class="k-meta2"></i><span>Na meta <small>${esc(brl(meta))}/mês</small></span><b>${esc(anosTxt(mMeta))}</b><small>${esc(quando(mMeta))}</small></li>
    </ul>
    <svg class="og-hist sl-proj-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Projeção: no ritmo atual ${anosTxt(mRitmo)}, na meta ${anosTxt(mMeta)}`)}">
      <line class="sl-alvo" x1="${mg.l}" x2="${W - mg.r}" y1="${y(p.desejado).toFixed(1)}" y2="${y(p.desejado).toFixed(1)}"/>
      <path class="sl-traj-meta" d="${caminho(tM)}"/><path class="sl-traj-ritmo" d="${caminho(tR)}"/>
      <text class="og-hist-rot" x="${mg.l}" y="${H - 4}">hoje</text><text class="og-hist-rot" x="${W - mg.r}" y="${H - 4}" text-anchor="end">+${maxAno} anos</text>
    </svg>
    <p class="og-nota fraca">Parte de ${esc(brl(p.atual))} hoje, rendendo ${esc(pct(p.rendimento, 1))} ao ano (aba Distribuição e Metas da planilha)${ganho != null && ganho > 0 ? `. Bater a meta te adianta <b>${esc(anosTxt(ganho))}</b>.` : '.'} O FGTS não entra na conta.</p>`;
}

export function htmlExtras(d) {
  const ano = Number(String(d.hoje || '').slice(0, 4)) || new Date().getFullYear();
  const hol = ultimoHolerite(d.pagamentos);
  const ex = extrasDoAno(d.pagamentos, ano, { holerite: hol, percentualPadrao: d.base.percentualInvestir });
  return `
    <div class="lateral-cab"><h2>Extras de ${ano}</h2><span class="hint">13º, férias, PLR e bônus</span></div>
    <div class="sl-extras">
      <div class="sl-extras-rot" aria-hidden="true"><span>Tipo</span><span>Mês</span><span>Líquido</span><span>Investir</span><span></span></div>
      ${ex.linhas.map((l) => `
        <form class="sl-extra" data-tipo="${esc(l.tipo)}" novalidate>
          <span class="sl-extra-tipo">${esc(l.tipo)}${l.status ? ` <span class="status-pill ${l.status === 'Recebido' ? 'good' : 'warn'}">${l.status === 'Recebido' ? 'recebido' : 'previsto'}</span>` : ''}</span>
          <input type="month" name="mes" value="${esc(l.mes)}" aria-label="Mês do ${esc(l.tipo)}"${l.status === 'Recebido' ? ' disabled' : ''}>
          <span class="sl-input"><i>R$</i><input name="valor" inputmode="decimal" value="${num(l.valor) ? esc(formatNumeroBR(l.valor)) : ''}" placeholder="${num(l.estimativa) ? `≈ ${esc(formatNumeroBR(l.estimativa, 0))}` : 'valor'}" aria-label="Líquido do ${esc(l.tipo)}"${l.status === 'Recebido' ? ' disabled' : ''}></span>
          <span class="sl-input"><input name="pct" inputmode="decimal" value="${num(l.percentualInvestir) ? esc(formatNumeroBR(l.percentualInvestir * 100, 0)) : ''}" aria-label="% do ${esc(l.tipo)} pra investir"><i>%</i><small data-out="investir">${num(l.investir) ? `= ${esc(brl(l.investir))}` : ''}</small></span>
          <button type="submit" class="tx-link">salvar</button>
        </form>`).join('')}
    </div>
    <p class="og-nota">${ex.total > 0 ? `Previsto no ano: <b>${esc(brl(ex.total))}</b> líquidos, <b>${esc(brl(ex.totalInvestir))}</b> pra investir (≈ ${esc(brl(ex.totalInvestir / 12))}/mês a mais na média).` : 'Preencha o líquido previsto (a estimativa do 13º vem do seu último holerite) e quanto quer investir de cada um.'}</p>
    <p class="sl-msg" id="slExtrasMsg" role="status"></p>`;
}

// ---------------------------------------------------------------------------
// Aba
// ---------------------------------------------------------------------------

function lerForm(form) {
  const f = new form.ownerDocument.defaultView.FormData(form);
  const o = {};
  for (const [k, v] of f.entries()) o[k] = v;
  return o;
}

/**
 * 03/10/2026: `getSalarioImpl` pode ser o carregador compartilhado da página
 * (a mesma resposta serve a seção Renda e o painel de Documentos) e
 * `aoMudarDados(dados)` avisa a página quando a resposta muda (salvou base,
 * holerite, extra, excluiu pagamento).
 */
export function montarAbaSalario({
  doc, el, token, getSalarioImpl = getSalario, salvarBaseImpl = salvarSalarioBase, salvarPagamentoImpl = salvarPagamentoSalario,
  excluirPagamentoImpl = excluirPagamentoSalario, carregarPdf = carregarPdfJs, lerPdf = extrairLinhasPdf,
  confirmar = (msg) => (doc.defaultView && doc.defaultView.confirm ? doc.defaultView.confirm(msg) : true),
  aoMudarDados = null,
}) {
  let dados = null;
  const est = { editandoBase: false, form: null };
  const avisar = () => { if (typeof aoMudarDados === 'function') { try { aoMudarDados(dados); } catch (e) { /* ok */ } } };

  // "No seu ritmo" da projeção: média dos últimos 12 meses fechados (tudo, com proventos)
  const med = () => mediaInvestida(dados.mensal, { janela: 12, base: 'total', descontarProventos: false, meta: metaMensal(dados.base), liquido: dados.base.liquido });

  function esqueleto() {
    el.innerHTML = `
      <section class="pt-sec sl-sec" id="slSecOrcamento">
        <div class="pt-sec-cab"><h2>Orçamento do salário</h2><span class="pt-hint">a base das contas do site (aba Distribuição e Metas da planilha), o holerite e pra onde vai o líquido</span></div>
        <section class="og-hero sl-hero" id="slHero"></section>
        <div id="slBase"></div>
        <div class="og-colunas">
          <div class="sl-principal">
            <section class="og-card" id="slHolerite"></section>
            <section class="og-card" id="slExtras"></section>
          </div>
          <aside class="og-lateral">
            <section class="og-card" id="slOrcamento"></section>
            <section class="og-card" id="slProjecao"></section>
          </aside>
        </div>
        <p class="og-nota bad" id="slAvisos" hidden></p>
      </section>`;
    ligar();
  }

  function desenharTopo() {
    el.querySelector('#slHero').innerHTML = htmlHeroSalario(dados, { editando: est.editandoBase });
    el.querySelector('#slProjecao').innerHTML = htmlProjecao(dados, med());
  }

  function desenhar() {
    if (!el.querySelector('#slHero')) esqueleto();
    desenharTopo();
    el.querySelector('#slBase').innerHTML = est.editandoBase ? htmlFormBase(dados) : '';
    if (est.editandoBase) previaBase();
    el.querySelector('#slHolerite').innerHTML = htmlHolerite(dados, { form: est.form });
    el.querySelector('#slExtras').innerHTML = htmlExtras(dados);
    el.querySelector('#slOrcamento').innerHTML = htmlOrcamento(dados);
    const av = el.querySelector('#slAvisos');
    av.hidden = !dados.avisos;
    av.textContent = dados.avisos ? `Parte dos dados não veio: ${Object.entries(dados.avisos).map(([k, v]) => `${k}: ${v}`).join(' · ')}` : '';
    avisar();
  }

  function previaBase() {
    const f = el.querySelector('#slBaseForm');
    if (!f) return;
    const liq = lerValorBR(f.querySelector('#slLiquido').value);
    const p = lerValorBR(f.querySelector('#slPct').value);
    const meta = num(liq) && num(p) ? (liq * p) / 100 : null;
    const ess = dados.despesas && dados.despesas.totalReal;
    const livre = num(meta) && num(ess) ? liq - ess - meta : null;
    f.querySelector('#slBasePrevia').innerHTML = num(meta)
      ? `Meta de <b>${esc(brl(meta))}/mês</b> (${esc(brl(meta * 12))} por ano)${num(livre) ? ` · depois das despesas essenciais sobram <b>${esc(brl(livre))}</b> livres` : ''}.`
      : '';
  }

  async function carregar() {
    let r;
    try { r = await getSalarioImpl(token); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) {
      if (!dados) el.innerHTML = `<div class="carteiras-erro">Não deu pra carregar o salário agora (${esc((r && r.etapa) || '?')}): ${esc((r && r.erro) || 'erro desconhecido')}.</div>`;
      return;
    }
    dados = r;
    desenhar();
  }

  function aplicarResposta(r) {
    if (r && r.ok && r.mensal) { dados = r; return true; }
    if (r && r.ok && r.base) { dados = { ...dados, base: r.base }; return true; }
    return false;
  }

  function abrirForm(pagamento, extra = {}) {
    est.form = { pagamento: { ...pagamento }, usarComoBase: false, ...extra };
    el.querySelector('#slHolerite').innerHTML = htmlHolerite(dados, { form: est.form });
    const alvo = el.querySelector('#slHolerite');
    if (alvo.scrollIntoView) try { alvo.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ok */ }
  }

  function atualizarConfere(form) {
    const o = lerForm(form);
    const v = (k) => lerValorBR(o[k]) || 0;
    const venc = v('salarioBase') + v('outrosVencimentos');
    const desc = v('inss') + v('irrf') + v('outrosDescontos');
    const liq = lerValorBR(o.liquido);
    const p = form.querySelector('#slPagConfere');
    if (!num(liq)) { p.textContent = ''; return; }
    const ok = Math.abs(venc - desc - liq) <= 0.02;
    p.className = `og-nota ${ok ? 'good' : 'bad'}`;
    p.textContent = ok ? `Confere: ${brl(venc)} − ${brl(desc)} = ${brl(liq)}` : `Vencimentos − descontos = ${brl(venc - desc)}, mas o líquido informado é ${brl(liq)}`;
  }

  async function salvarForm(form) {
    const o = lerForm(form);
    const v = (k) => { const x = lerValorBR(o[k]); return x == null ? null : x; };
    const venc = (v('salarioBase') || 0) + (v('outrosVencimentos') || 0);
    const desc = (v('inss') || 0) + (v('irrf') || 0) + (v('outrosDescontos') || 0);
    const pag = {
      mes: o.mes, tipo: o.tipo, status: o.status, dataCredito: o.dataCredito,
      salarioBase: v('salarioBase'), outrosVencimentos: v('outrosVencimentos'), inss: v('inss'), irrf: v('irrf'), outrosDescontos: v('outrosDescontos'),
      liquido: v('liquido'), fgts: v('fgts'), baseIrrf: est.form.pagamento.baseIrrf ?? null,
      totalVencimentos: venc || null, totalDescontos: desc || null,
      percentualInvestir: est.form.pagamento.percentualInvestir ?? null,
      itens: est.form.pagamento.itens || [],
    };
    const msg = form.querySelector('#slPagMsg');
    if (!/^\d{4}-\d{2}$/.test(pag.mes || '')) { msg.textContent = 'Informe o mês.'; return; }
    if (!num(pag.liquido) || pag.liquido <= 0) { msg.textContent = 'Informe o valor líquido.'; return; }
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true; botao.textContent = 'Salvando…';
    let r;
    try { r = await salvarPagamentoImpl(token, pag, { usarComoBase: !!o.usarComoBase }); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) {
      botao.disabled = false; botao.textContent = 'Salvar';
      msg.textContent = `Não deu pra salvar: ${(r && r.erro) || 'erro desconhecido'}`;
      return;
    }
    est.form = null;
    aplicarResposta(r);
    desenhar();
  }

  async function importarArquivo(arquivo) {
    const box = el.querySelector('#slHolerite');
    const aviso = (t) => { box.querySelector('.sl-msg-import')?.remove(); box.insertAdjacentHTML('beforeend', `<p class="og-nota sl-msg-import">${esc(t)}</p>`); };
    aviso('Lendo o PDF…');
    try {
      const lib = await carregarPdf(doc);
      const linhas = await lerPdf(lib, await arquivo.arrayBuffer());
      const h = lerHolerite(linhas);
      const maisNovo = !(dados.pagamentos || []).some((p) => p.tipo === 'Mensal' && p.status !== 'Previsto' && p.mes > h.mes);
      abrirForm({ ...h, status: 'Recebido' }, { origem: 'pdf', arquivo: arquivo.name, usarComoBase: h.tipo === 'Mensal' && maisNovo });
    } catch (e) {
      aviso(`Não deu pra ler o PDF: ${e.message || e}`);
    }
  }

  function ligar() {
    el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b || !el.contains(b)) return;
      const acao = b.dataset.acao;
      if (acao === 'editar-base') { est.editandoBase = !est.editandoBase; desenhar(); if (est.editandoBase) el.querySelector('#slLiquido')?.focus(); }
      else if (acao === 'usar-holerite') {
        const f = el.querySelector('#slBaseForm');
        f.querySelector('#slLiquido').value = formatNumeroBR(Number(b.dataset.valor));
        f.querySelector('#slLiquido').dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
      } else if (acao === 'importar') el.querySelector('#slArquivo')?.click();
      else if (acao === 'novo-pagamento') abrirForm({ mes: String(dados.hoje || '').slice(0, 7), tipo: 'Mensal', status: 'Recebido' }, { origem: 'manual' });
      else if (acao === 'cancelar-pagamento') { est.form = null; el.querySelector('#slHolerite').innerHTML = htmlHolerite(dados, { form: null }); }
      else if (acao === 'editar-pagamento') {
        const li = b.closest('[data-mes]');
        const p = dados.pagamentos.find((x) => x.mes === li.dataset.mes && x.tipo === li.dataset.tipo);
        if (p) abrirForm(p, { origem: 'editar', editando: true });
      } else if (acao === 'excluir-pagamento') {
        const li = b.closest('[data-mes]');
        if (!confirmar(`Excluir ${li.dataset.tipo} de ${rotuloMes(li.dataset.mes)} da aba Salário?`)) return;
        let r;
        try { r = await excluirPagamentoImpl(token, li.dataset.mes, li.dataset.tipo); } catch (e) { r = { ok: false, erro: String(e) }; }
        if (aplicarResposta(r)) desenhar();
      }
    });
    el.addEventListener('change', (ev) => {
      if (ev.target.id === 'slArquivo' && ev.target.files && ev.target.files[0]) importarArquivo(ev.target.files[0]);
    });
    el.addEventListener('input', (ev) => {
      const f = ev.target.form;
      if (f && f.id === 'slBaseForm') {
        const liq = lerValorBR(f.querySelector('#slLiquido').value);
        if (ev.target.id === 'slValor') {
          const v = lerValorBR(ev.target.value);
          if (num(v) && num(liq) && liq > 0) f.querySelector('#slPct').value = formatNumeroBR((v / liq) * 100, 1);
        } else {
          const p = lerValorBR(f.querySelector('#slPct').value);
          if (num(p) && num(liq)) f.querySelector('#slValor').value = formatNumeroBR((liq * p) / 100);
        }
        previaBase();
      } else if (f && f.id === 'slPagForm') atualizarConfere(f);
      else if (f && f.classList.contains('sl-extra')) {
        const v = lerValorBR(f.elements.valor.value);
        const p = lerValorBR(f.elements.pct.value);
        f.querySelector('[data-out="investir"]').textContent = num(v) && num(p) ? `= ${brl((v * p) / 100)}` : '';
      }
    });
    el.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      if (f.id === 'slBaseForm') {
        const liq = lerValorBR(f.querySelector('#slLiquido').value);
        const p = lerValorBR(f.querySelector('#slPct').value);
        const msg = f.querySelector('#slBaseMsg');
        if (!num(liq) || liq <= 0) { msg.textContent = 'Salário líquido inválido.'; return; }
        if (!num(p) || p < 0 || p > 100) { msg.textContent = '% entre 0 e 100.'; return; }
        msg.textContent = 'Salvando…';
        let r;
        try { r = await salvarBaseImpl(token, { liquido: liq, percentual: p / 100 }); } catch (e) { r = { ok: false, erro: String(e) }; }
        if (!aplicarResposta(r)) { msg.textContent = `Não deu pra salvar: ${(r && r.erro) || 'erro desconhecido'}`; return; }
        est.editandoBase = false;
        desenhar();
      } else if (f.id === 'slPagForm') {
        await salvarForm(f);
      } else if (f.classList.contains('sl-extra')) {
        const tipo = f.dataset.tipo;
        const existente = (dados.pagamentos || []).find((x) => x.tipo === tipo && String(x.mes).slice(0, 4) === String(dados.hoje).slice(0, 4));
        const valor = existente && existente.status === 'Recebido' ? existente.liquido : lerValorBR(f.elements.valor.value);
        const pctv = lerValorBR(f.elements.pct.value);
        const msg = el.querySelector('#slExtrasMsg');
        const mes = existente && existente.status === 'Recebido' ? existente.mes : f.elements.mes.value;
        if (!/^\d{4}-\d{2}$/.test(mes || '') || !num(valor) || valor <= 0) { msg.textContent = `${tipo}: informe mês e valor líquido.`; return; }
        msg.textContent = 'Salvando…';
        const pag = existente ? { ...existente, mes, liquido: valor, percentualInvestir: num(pctv) ? pctv / 100 : null } : { mes, tipo, status: 'Previsto', liquido: valor, percentualInvestir: num(pctv) ? pctv / 100 : null };
        let r;
        try { r = await salvarPagamentoImpl(token, pag, { usarComoBase: false }); } catch (e) { r = { ok: false, erro: String(e) }; }
        if (!aplicarResposta(r)) { msg.textContent = `Não deu pra salvar: ${(r && r.erro) || 'erro desconhecido'}`; return; }
        desenhar();
      }
    });
  }

  el.innerHTML = '<div class="carteiras-loading"><div class="og-skel-tiles"><span class="skel"></span><span class="skel"></span><span class="skel"></span></div><span class="skel" style="height:260px;border-radius:14px"></span></div>';
  const pronto = carregar();
  /** Rola até o card do holerite (o painel Documentos usa). */
  function rolarAteHolerite() {
    const alvo = el.querySelector('#slHolerite');
    if (alvo && alvo.scrollIntoView) try { alvo.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ok */ }
  }
  return {
    pronto, recarregar: carregar, get dados() { return dados; },
    /** Lê um PDF de holerite (o mesmo fluxo do botão "Importar holerite"). */
    importarArquivo: async (arquivo) => { await pronto; if (dados) { rolarAteHolerite(); await importarArquivo(arquivo); } },
    rolarAteHolerite,
  };
}
