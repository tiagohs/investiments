/**
 * ativo-ir-resgate.js - 09/10/2026 (Tiago: "quero ter já a comparação de quanto eu teria de IR pra pagar no vencimento vs
 * hoje", com os pontos que o Gorila trouxe: alíquota por lote, alíquota efetiva, quando toda a posição chega a 15%,
 * rendimento até o vencimento como motivo do líquido maior, IR retido na fonte, custódia da B3, venda antecipada a preço de
 * mercado). Seção "Imposto: resgatar hoje ou no vencimento" na tela de um título de Renda Fixa.
 *
 * A seção nasce com o resultado de hoje (que não depende de nada externo) e é redesenhada quando o contexto de mercado
 * (Selic, IPCA esperado) chega - é ele que dá a taxa para levar o título até o vencimento. A taxa fica num campo editável.
 * A conta é ir-resgate-rf.js.
 */
import { compararResgate, taxaProjetada, dataVencimento, custodiaDoTitulo } from '../ir-resgate-rf.js';
import { formatBRL, formatNumeroPt, formatDateBR } from '../format.js';
import { esc } from '../util/html.js';

const pct = (f, casas = 1) => (f == null ? '—' : `${formatNumeroPt(f * 100, { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const reais = (v) => formatBRL(Math.round(v * 100) / 100);
const reais0 = (v) => `R$ ${formatNumeroPt(Math.round(v), { maximumFractionDigits: 0 })}`;
const data = (iso) => formatDateBR(iso);

/** A seção só existe para título com IR (não isento), com lotes e fora dos fundos (que têm come-cotas e não vencem). */
export function temIrResgate(ctx) {
  if (!ctx || !ctx.ehRf || ctx.fundoRf) return false;
  const a = ctx.ativo || {};
  const ir = a.irSeResgatasseHoje;
  if (!ir || /LCI|LCA/i.test(a.tipoInvestimento || '')) return false;
  return Array.isArray(ir.detalhes) && ir.detalhes.length > 0;
}

export function irResgateHtml(ctx) {
  if (!temIrResgate(ctx)) return '';
  return `
    <section class="at-bloco" id="at-ir-resgate" aria-labelledby="at-irr-titulo">
      <div class="at-cab-bloco"><div class="at-cab-titulos"><h2 id="at-irr-titulo">Imposto: resgatar hoje ou no vencimento</h2><span class="hint">IR por lote, estimativa</span></div></div>
      <div class="card at-card at-irr" id="atIrResgate"></div>
    </section>`;
}

/** A taxa sugerida (Selic/CDI/IPCA do contexto de mercado + o contratado) ou a que o Tiago digitou. */
function taxaDoCampo(ctx, taxaDigitada) {
  const a = ctx.ativo || {};
  const juros = ctx.macro && ctx.macro.juros ? ctx.macro.juros : null;
  const proj = taxaProjetada({ indexador: a.indexador, texto: a.rentabilidadeContratada && a.rentabilidadeContratada.texto, juros });
  if (taxaDigitada != null) return { taxa: taxaDigitada, proj, digitada: true };
  return { taxa: proj ? proj.taxa : null, proj, digitada: false };
}

function descricaoTaxa(proj) {
  if (!proj) return '';
  const extra = proj.percentual ? `${pct(proj.extra, 0)} do CDI` : (proj.extra ? `+ ${pct(proj.extra, 3)} contratado` : '');
  const base = { Selic: 'Selic de hoje', CDI: 'CDI estimado', IPCA: 'IPCA esperado (Focus)', prefixado: 'taxa contratada' }[proj.base] || proj.base;
  return `${base} ${pct(proj.baseValor, 2)}${extra ? ` ${extra}` : ''}`;
}

export function calcularIrResgate(ctx, { taxaDigitada = null } = {}) {
  const a = ctx.ativo || {};
  const venc = dataVencimento(a);
  const { taxa, proj, digitada } = taxaDoCampo(ctx, taxaDigitada);
  const hoje = (ctx.resposta && ctx.resposta.hoje) || new Date().toISOString().slice(0, 10);
  const comp = compararResgate({
    lotes: a.irSeResgatasseHoje.detalhes, valorAtual: a.totalAtualizado, hoje,
    vencimento: venc ? venc.data : null, taxaAnual: taxa, custodia: custodiaDoTitulo(a.nomePersonalizado, a.tipoInvestimento),
  });
  return comp ? { ...comp, venc, taxa, proj, digitada } : null;
}

function leadHtml(r) {
  const h = r.hoje;
  const partes = [`Resgatando hoje, o IR fica em <b>${reais(h.imposto)}</b>${h.aliquotaEfetiva != null ? ` (${pct(h.aliquotaEfetiva)} do ganho)` : ''}.`];
  const v = r.vencimento;
  if (v) {
    const motivo = r.diferenca.liquido > 0 ? `o líquido tende a ser <b class="good">${reais0(r.diferenca.liquido)} maior</b> — pelo rendimento até lá, não pela alíquota` : `o líquido tende a ser ${reais0(Math.abs(r.diferenca.liquido))} menor`;
    partes.push(`No vencimento (${data(v.data)}), em torno de <b>${reais(v.imposto)}</b> (${pct(v.aliquotaEfetiva)}): ${r.diferenca.imposto >= 0 ? 'um pouco mais em reais, porque o ganho cresce' : 'menos imposto'}, e ${motivo}.`);
  }
  return `<p class="at-irr-lead">${partes.join(' ')}</p>`;
}

function comparacaoHtml(r) {
  const h = r.hoje; const v = r.vencimento;
  const linha = (nome, x, extra = '') => `<tr><th scope="row">${nome}</th><td>${reais(x.bruto)}</td><td>${reais(x.ganho)}</td><td>${reais(x.imposto)}${extra}</td><td>${pct(x.aliquotaEfetiva)}</td><td><b>${reais(x.liquido)}</b></td></tr>`;
  return `
      <div class="tabela-wrap"><table class="at-irr-tabela">
        <thead><tr><th scope="col">Cenário</th><th scope="col">Valor bruto</th><th scope="col">Ganho</th><th scope="col">IR${h.iof > 0.004 ? ' + IOF' : ''}</th><th scope="col">Alíquota efetiva</th><th scope="col">Líquido</th></tr></thead>
        <tbody>
          ${linha(`Resgatar hoje <small>${data(h.data)}</small>`, h)}
          ${v ? linha(`No vencimento <small>${data(v.data)}${r.venc && r.venc.aproximada ? ' (dia aproximado)' : ''}</small>`, v, v.custodia > 0.5 ? `<small>+ custódia ${reais(v.custodia)}</small>` : '') : ''}
        </tbody>
      </table></div>`;
}

function marcosHtml(r) {
  if (r.jaTudo15) return '<p class="at-irr-marco good">Todos os lotes já passaram de 720 dias: a alíquota já é a mínima (15%) em toda a posição.</p>';
  const partes = [];
  if (r.todos15 && (!r.vencimento || r.todos15 <= r.vencimento.data)) {
    partes.push(`<p class="at-irr-marco"><b>Se precisar do dinheiro antes:</b> resgatar a partir de <b>${data(r.todos15)}</b> já garante 15% em toda a posição.</p>`);
  }
  const prox = r.marcos.slice(0, 4);
  if (prox.length) {
    partes.push(`<ul class="at-irr-marcos">${prox.map((m) => `<li><span>${data(m.data)}</span> o lote de ${data(m.lote)} passa para ${pct(m.aliquota)}</li>`).join('')}${r.marcos.length > prox.length ? `<li class="hint">+ ${r.marcos.length - prox.length} outras mudanças de faixa</li>` : ''}</ul>`);
  }
  return partes.join('');
}

function lotesHtml(r) {
  const comV = !!r.vencimento;
  const linhas = r.lotes.map((l) => `<tr><td>${data(l.data)}</td><td>${formatNumeroPt(l.dias)}</td><td>${reais(l.ganho)}</td><td>${pct(l.hoje.aliquota)}</td><td>${reais(l.hoje.imposto)}</td>${comV ? `<td>${pct(l.vencimento.aliquota)}</td><td>${reais(l.vencimento.imposto)}</td>` : ''}</tr>`).join('');
  return `
      <details class="at-irr-lotes">
        <summary>IR por lote (${r.lotes.length})</summary>
        <div class="tabela-wrap"><table class="at-irr-tabela">
          <thead><tr><th scope="col">Aplicação</th><th scope="col">Dias</th><th scope="col">Ganho hoje</th><th scope="col">Alíquota hoje</th><th scope="col">IR hoje</th>${comV ? '<th scope="col">Alíquota no venc.</th><th scope="col">IR no venc.</th>' : ''}</tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        <p class="hint">Cada aplicação conta o prazo da própria data: a tabela regressiva é 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois disso.</p>
      </details>`;
}

function taxaHtml(r) {
  const valor = r.taxa != null ? formatNumeroPt(r.taxa * 100, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : '';
  const origem = r.digitada ? 'taxa que você digitou' : (r.proj ? descricaoTaxa(r.proj) : 'sem taxa do mercado agora: digite uma');
  return `
      <div class="at-irr-taxa">
        <label for="atIrrTaxa">Rendimento até o vencimento</label>
        <span class="at-irr-input"><input id="atIrrTaxa" type="text" inputmode="decimal" value="${esc(valor)}" autocomplete="off" aria-describedby="atIrrTaxaDica"><span aria-hidden="true">% a.a.</span></span>
        <small id="atIrrTaxaDica">${esc(origem)}, mantida até o vencimento. É ilustrativo: a taxa muda.</small>
      </div>`;
}

function notasHtml(ctx, r) {
  const a = ctx.ativo || {};
  const tesouro = /tesouro/i.test(`${a.nomePersonalizado || ''} ${a.tipoInvestimento || ''}`);
  const selic = /selic|LFT/i.test(`${a.nomePersonalizado || ''} ${a.tipoInvestimento || ''}`);
  const cupom = /semestra/i.test(a.nomePersonalizado || '');
  const itens = [
    'O IR é retido na fonte pela corretora no resgate: não há DARF a pagar.',
    tesouro ? `Custódia da B3: 0,20% ao ano${selic ? ' (o Tesouro Selic é isento até R$ 10 mil; aqui a isenção conta só para este título)' : ''}. No vencimento ela já sai do líquido; no resgate de hoje, o que já foi cobrado não entra.` : '',
    selic ? 'Resgate antes do vencimento é feito a preço de mercado; no Tesouro Selic esse preço varia pouco.' : 'Resgate antes do vencimento é feito a preço de mercado e pode ser bem diferente do valor da curva (marcação a mercado).',
    cupom ? 'Os juros semestrais pagos até o vencimento têm IR próprio e não entram nesta projeção.' : '',
    a.irSeResgatasseHoje && a.irSeResgatasseHoje.precisao === 'aproximado' ? 'Sem os lotes deste título, a conta usa uma aplicação só (data de emissão): a alíquota pode ser diferente.' : '',
    'Estimativa informativa, não é recomendação. Para o valor exato, use a simulação de resgate da corretora.',
  ].filter(Boolean);
  return `<ul class="hint at-irr-notas">${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

/** Desenha (ou redesenha) o conteúdo da seção. `taxaDigitada` em fração, quando o Tiago mudou o campo. */
export function preencherIrResgate(doc, ctx, { taxaDigitada } = {}) {
  const el = doc.getElementById('atIrResgate');
  if (!el || !temIrResgate(ctx)) return;
  const guardada = taxaDigitada !== undefined ? taxaDigitada : (el._taxaDigitada ?? null);
  el._taxaDigitada = guardada;
  const r = calcularIrResgate(ctx, { taxaDigitada: guardada });
  if (!r) { el.innerHTML = '<p class="hint">Sem os dados de aplicação deste título para calcular o IR por lote.</p>'; return; }
  el.innerHTML = `${leadHtml(r)}${comparacaoHtml(r)}${r.venc ? taxaHtml(r) : ''}${marcosHtml(r)}${lotesHtml(r)}${notasHtml(ctx, r)}`;
  const inp = doc.getElementById('atIrrTaxa');
  if (inp) {
    inp.addEventListener('change', () => {
      const cru = String(inp.value || '').trim().replace(/\s|%/g, '');
      const t = /,/.test(cru) ? cru.replace(/\./g, '').replace(',', '.') : cru;
      const n = t === '' ? null : Number(t);
      preencherIrResgate(doc, ctx, { taxaDigitada: n != null && Number.isFinite(n) ? n / 100 : null });
      const novo = doc.getElementById('atIrrTaxa');
      if (novo) novo.focus();
    });
  }
}
