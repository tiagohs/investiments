/**
 * organizacao-simulador.js - 02/10/2026: seção "Amortizar ou investir?" da
 * Organização Financeira. 03/10/2026: mora na aba "Simulações"
 * (organizacao-simulacoes.js põe o herói em cima) - Tiago: "Eu senti que
 * Gastos e Despesas ficou muito grande.. jogue tudo que tem a parte de
 * simulações ... pra uma nova aba". Também de 03/10: o valor padrão é o
 * MÍNIMO que tira 2 parcelas por mês da dívida-alvo (valorParaMatarParcelas;
 * se o Tiago digitou outro valor, vale o dele e a tela mostra o mínimo) e a
 * seção "Quanto amortizar pra matar 2, 3 e 4 parcelas por mês".
 *
 * Tiago: "A área de Simulação me parece muito confusa.. o que eu gostaria de
 * simular, e ter um resultado bem claro ... se eu amortizar hoje um valor
 * mensal, ou um valor total no final do ano, quanto eu vou adiantar da
 * dívida (FIES ou Apartamento) ... se eu investir o mesmo valor ... quanto a
 * cada ano cresceria via gráfico, seja crítico ... por padrão já deixe
 * pronta uma simulação ... inclua referências".
 *
 * Layout: formulário curto numa linha (valor, mensal/anual, dívida, prazo ou
 * parcela, onde investir, horizonte) + premissas recolhidas; cards
 * "Amortizar" x "Investir" lado a lado; veredito; gráficos anuais (patrimônio
 * líquido dos cenários, diferença investir − amortizar, saldo das dívidas);
 * tipos de investimento lado a lado; tabela ano a ano (recolhível);
 * estratégias do vídeo; referências. Contas em simulador-dividas-calc.js.
 *
 * Uso: montarSimuladorDividas(raiz, { ctx, doc, hoje, aoMudar }) - ctx é o contexto
 * da aba Patrimônio (contextoPatrimonio). Campos usados: ctx.d (hoje, cdi,
 * ipca?, trMensal?, metas.salarioLiquido/reservaMeta, investimentos.reserva,
 * despesas.totalComFolga), ctx.cfg (financiamento, fies, fgts, carreira),
 * ctx.b.liquido e ctx.fgts (resumoFgts). Ver parametrosPadrao no calc.
 */
import { formatNumeroBR } from '../format.js';
import { lerValorBR } from './organizacao-calc.js';
import { mil, brl0, mesAno } from './patrimonio-graficos.js';
import {
  simular, parametrosPadrao, veredito, PERFIS, ESTRATEGIAS_VIDEO, REFERENCIAS, PADROES, premissas,
  minimoParaMatar, opcoesMatarParcelas, parcelasQueOValorMata, trNoMes,
} from './simulador-dividas-calc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (f, casas = 1) => (num(f) ? `${formatNumeroBR(f * 100, casas)}%` : '—');
const mesesTxt = (m) => (m == null ? '—' : m >= 24 ? `${formatNumeroBR(m / 12, 1)} anos` : `${m} ${m === 1 ? 'mês' : 'meses'}`);
const f1 = (v) => v.toFixed(1);
const CHAVE = 'simuladorDividas:v1';
const NOME_DIV = { financiamento: 'Apê', fies: 'FIES' };
const NOME_DIV_LONGO = { financiamento: 'o apê', fies: 'o FIES' };
const NOME_DIV_DE = { financiamento: 'do apê', fies: 'do FIES' };
const parcelasTxt = (k) => `${formatNumeroBR(k, Number.isInteger(k) ? 0 : 1)} ${Math.abs(k - 1) < 0.05 ? 'parcela' : 'parcelas'}`;

export const SERIES = [
  { id: 'base', nome: 'Só as parcelas', cor: 'var(--sd-base)', tracejado: true },
  { id: 'amortizar', nome: 'Amortizar', cor: 'var(--sd-amort)' },
  { id: 'investir', nome: 'Investir', cor: 'var(--sd-inv)' },
  { id: 'misto', nome: 'Metade em cada', cor: 'var(--sd-misto)' },
];

// ---------------------------------------------------------------------------
// Gráficos (SVG puro)
// ---------------------------------------------------------------------------

function passoRedondo(amp, n = 4) {
  const bruto = amp / n;
  const pot = 10 ** Math.floor(Math.log10(bruto || 1));
  return [1, 2, 2.5, 5, 10].map((k) => k * pot).find((p) => p >= bruto) || pot * 10;
}
const eixo = (v) => (v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v) >= 1e6 ? `${formatNumeroBR(Math.abs(v) / 1e6, Math.abs(v) % 1e6 ? 1 : 0)} mi` : `${formatNumeroBR(Math.abs(v) / 1000, 0)} mil`}`);
const linhaTt = (rot, valor, cls = '', cor = '') => `<div class="pt-tt-l${cls ? ` ${cls}` : ''}"><span>${cor ? `<i class="sd-tt-cor" style="background:${cor}"></i>` : ''}${esc(rot)}</span><b>${esc(valor)}</b></div>`;

/**
 * Linhas anuais com uma escala só. rotulos: ['2026', ...]; series: [{ id,
 * nome, cor, tracejado, valores: [...] }]; dica(i) -> HTML do balão.
 */
export function graficoLinhas({ rotulos, series, dica, zero = false, rotuloFinal = [] }, { largura = 720, altura = 260 } = {}) {
  const W = Math.max(300, largura);
  const H = altura;
  const n = rotulos.length;
  const mg = { t: 16, r: W < 480 ? 12 : 64, b: 26, l: 50 };
  const todos = series.flatMap((s) => s.valores).filter(num);
  if (!n || !todos.length) return { svg: '', dicas: [] };
  let lo = Math.min(...todos); let hi = Math.max(...todos);
  if (zero) lo = Math.min(0, lo);
  if (hi - lo < 1) hi = lo + 1;
  const passo = passoRedondo(hi - lo, 4);
  lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo;
  const x = (k) => mg.l + (n === 1 ? 0 : (k / (n - 1)) * (W - mg.l - mg.r));
  const y = (v) => mg.t + ((hi - v) / (hi - lo || 1)) * (H - mg.t - mg.b);
  let s = '';
  for (let v = lo; v <= hi + 1e-6; v += passo) {
    s += `<line class="${Math.abs(v) < 1e-6 ? 'pt-zero' : 'pt-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="pt-eixo" x="${mg.l - 8}" y="${f1(y(v) + 3.5)}" text-anchor="end">${esc(eixo(v))}</text>`;
  }
  const cadaQuantos = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - mg.l - mg.r) / 48))));
  rotulos.forEach((r, k) => { if ((n - 1 - k) % cadaQuantos === 0) s += `<text class="pt-eixo" x="${f1(x(k))}" y="${H - 7}" text-anchor="middle">${esc(r)}</text>`; });
  series.forEach((sr) => {
    const pts = sr.valores.map((v, k) => (num(v) ? [x(k), y(v)] : null)).filter(Boolean);
    if (!pts.length) return;
    s += `<path class="sd-linha${sr.tracejado ? ' trac' : ''}" style="stroke:${sr.cor}" d="${pts.map((p, k) => `${k ? 'L' : 'M'}${f1(p[0])},${f1(p[1])}`).join('')}"/>`;
    const u = pts[pts.length - 1];
    s += `<circle class="sd-ponto" style="fill:${sr.cor}" cx="${f1(u[0])}" cy="${f1(u[1])}" r="4"/>`;
  });
  // valor no fim das linhas pedidas, sem encavalar
  if (W >= 480) {
    let ult = -1e9;
    rotuloFinal.map((id) => series.find((sr) => sr.id === id)).filter(Boolean)
      .map((sr) => ({ sr, yy: y(sr.valores[n - 1]) })).sort((a, b) => a.yy - b.yy)
      .forEach(({ sr, yy }) => {
        const yt = Math.max(yy + 4, ult + 13);
        ult = yt;
        s += `<text class="pt-rot-v" x="${f1(W - mg.r + 8)}" y="${f1(yt)}">${esc(mil(sr.valores[n - 1]))}</text>`;
      });
  }
  const bw = n > 1 ? (W - mg.l - mg.r) / (n - 1) : W - mg.l - mg.r;
  const dicas = [];
  rotulos.forEach((r, k) => {
    s += `<rect class="pt-hit sd-hit" data-i="${k}" tabindex="0" x="${f1(Math.max(mg.l - 6, x(k) - bw / 2))}" y="${mg.t}" width="${f1(bw)}" height="${H - mg.t - mg.b}"><title>${esc(r)}</title></rect>`;
    dicas.push(dica(k));
  });
  return { svg: `<svg class="pt-svg" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`, dicas };
}

/** Barras verticais com zero no meio (positivo pra cima). */
export function graficoBarras({ rotulos, valores, corPos, corNeg, dica }, { largura = 720, altura = 200 } = {}) {
  const W = Math.max(300, largura);
  const H = altura;
  const n = rotulos.length;
  const mg = { t: 14, r: 12, b: 26, l: 50 };
  if (!n) return { svg: '', dicas: [] };
  const maxAbs = Math.max(1, ...valores.map((v) => Math.abs(v || 0)));
  const passo = passoRedondo(maxAbs, 2);
  const hi = Math.max(passo, Math.ceil(Math.max(0, ...valores) / passo) * passo);
  const lo = Math.min(-passo, Math.floor(Math.min(0, ...valores) / passo) * passo);
  const y = (v) => mg.t + ((hi - v) / (hi - lo)) * (H - mg.t - mg.b);
  const bw = (W - mg.l - mg.r) / n;
  const larg = Math.min(34, bw * 0.6);
  let s = '';
  for (let v = lo; v <= hi + 1e-6; v += passo) s += `<line class="${Math.abs(v) < 1e-6 ? 'pt-zero' : 'pt-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="pt-eixo" x="${mg.l - 8}" y="${f1(y(v) + 3.5)}" text-anchor="end">${esc(eixo(v))}</text>`;
  const cadaQuantos = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - mg.l - mg.r) / 44))));
  const dicas = [];
  valores.forEach((v, k) => {
    const xc = mg.l + bw * k + bw / 2;
    const a = y(Math.max(0, v)); const b = y(Math.min(0, v));
    if (b - a > 0.5) s += `<rect x="${f1(xc - larg / 2)}" y="${f1(a)}" width="${f1(larg)}" height="${f1(b - a)}" rx="3" fill="${v >= 0 ? corPos : corNeg}"/>`;
    if ((n - 1 - k) % cadaQuantos === 0) s += `<text class="pt-eixo" x="${f1(xc)}" y="${H - 7}" text-anchor="middle">${esc(rotulos[k])}</text>`;
    s += `<rect class="pt-hit sd-hit" data-i="${k}" tabindex="0" x="${f1(mg.l + bw * k)}" y="${mg.t}" width="${f1(bw)}" height="${H - mg.t - mg.b}"><title>${esc(rotulos[k])}</title></rect>`;
    dicas.push(dica(k));
  });
  return { svg: `<svg class="pt-svg" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`, dicas };
}

// ---------------------------------------------------------------------------
// Blocos (HTML)
// ---------------------------------------------------------------------------

const seg = (grupo, itens, atual) => `<div class="pt-seg" role="group" data-sd-seg="${grupo}">${itens.map(([v, rot, title]) => `<button type="button" data-v="${esc(v)}"${title ? ` title="${esc(title)}"` : ''} class="${String(atual) === String(v) ? 'on' : ''}" aria-pressed="${String(atual) === String(v)}">${esc(rot)}</button>`).join('')}</div>`;
const campoPct = (id, rot, valor, casas = 2, dica = '') => `<label class="pt-campo" for="${id}">${esc(rot)}<span class="pt-input"><input id="${id}" data-sd-taxa inputmode="decimal" value="${esc(num(valor) ? formatNumeroBR(valor * 100, casas) : '')}"><i>%</i></span>${dica ? `<small>${esc(dica)}</small>` : ''}</label>`;

export function htmlFormulario(p, pr) {
  const temFin = !!p.dividas.financiamento;
  const temFies = !!p.dividas.fies;
  const alvos = [['cara', 'A mais cara', 'A dívida de custo mais alto primeiro; a que custa menos que a inflação fica de fora'], ...(temFin ? [['financiamento', 'Apê']] : []), ...(temFies ? [['fies', 'FIES']] : [])];
  return `
    <div class="sd-form-linha">
      <label class="pt-ctl sd-ctl-valor" for="sdValor"><span class="pt-ctl-row">Valor</span><span class="pt-input"><i>R$</i><input id="sdValor" inputmode="decimal" value="${esc(num(p.valor) ? formatNumeroBR(p.valor, 0) : '')}"></span></label>
      <div class="pt-ctl"><span class="pt-ctl-row">Quando</span>${seg('frequencia', [['mensal', 'Todo mês'], ['anual', 'Fim do ano', 'Uma vez por ano, em dezembro']], p.frequencia)}</div>
      <div class="pt-ctl"><span class="pt-ctl-row">Amortizar</span>${seg('alvo', alvos, p.alvo)}</div>
      <div class="pt-ctl"><span class="pt-ctl-row">Pra reduzir</span>${seg('modo', [['prazo', 'Prazo'], ['parcela', 'Parcela']], p.modo)}</div>
      <label class="pt-ctl" for="sdPerfil"><span class="pt-ctl-row">Ou investir em</span><select id="sdPerfil" class="sd-select">${Object.entries(PERFIS).map(([id, x]) => `<option value="${id}"${p.perfil === id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
      <label class="pt-ctl" for="sdHorizonte"><span class="pt-ctl-row">Por</span><select id="sdHorizonte" class="sd-select">${[5, 10, 15, 20, 25, 30].map((a) => `<option value="${a}"${p.horizonteAnos === a ? ' selected' : ''}>${a} anos</option>`).join('')}</select></label>
    </div>
    <p class="sd-valor-nota" id="sdValorNota">${htmlValorNota(p)}</p>
    <details class="sd-prem"${p._premAberta ? ' open' : ''}><summary>Premissas: taxas e opções <span class="pt-hint">CDI ${esc(pct(pr.cdi, 2))} → ${esc(pct(pr.cdiLongo, 1))} em ${esc(pr.anosTransicao)} anos · IPCA ${esc(pct(pr.ipca, 1))} · TR ${esc(pct(pr.trMensal, 3))}/mês</span></summary>
      <div class="pt-campos sd-campos">
        ${campoPct('sdCdi', 'CDI hoje (a.a.)', pr.cdi)}
        ${campoPct('sdCdiLongo', 'CDI de longo prazo', pr.cdiLongo, 2, 'IPCA + juro neutro (~5%)')}
        <label class="pt-campo" for="sdAnos">CDI chega lá em<span class="pt-input"><input id="sdAnos" data-sd-taxa inputmode="numeric" value="${esc(pr.anosTransicao)}"><i>anos</i></span></label>
        ${campoPct('sdIpca', 'IPCA (a.a.)', pr.ipca)}
        ${campoPct('sdTr', 'TR (ao mês)', pr.trMensal, 3, 'cai junto com o CDI')}
        ${campoPct('sdReal', 'Tesouro IPCA+ (taxa real)', pr.taxaRealIpca)}
        ${campoPct('sdDy', 'FIIs: dividend yield', pr.dyFii)}
        ${campoPct('sdValFii', 'FIIs: valorização da cota', pr.valorizacaoFii)}
      </div>
      <div class="sd-chks">
        <label class="pt-chk"><input type="checkbox" id="sdReinvDif"${p.reinvestirDiferenca !== false ? ' checked' : ''}><span>O que a dívida deixa de cobrar (parcela menor, quitação antes) <b>vai pro investimento</b></span></label>
        <label class="pt-chk"><input type="checkbox" id="sdReinvProv"${p.reinvestirProventos !== false ? ' checked' : ''}><span>FIIs: <b>reinvestir os proventos</b> (desligado: viram renda e saem do patrimônio)</span></label>
        ${p.fgts ? `<label class="pt-chk"><input type="checkbox" id="sdFgts"${p.fgts.usar !== false ? ' checked' : ''}><span>FGTS amortiza o apê <b>a cada 2 anos</b> (próximo: ${esc(mesAno(p.fgts.proximoUso))}${p.fgts.mesAniversario ? ', depois do saque-aniversário' : ''}) - igual em todos os cenários</span></label>` : ''}
        <button type="button" class="pt-mini" data-sd-acao="padrao">voltar ao padrão</button>
      </div>
    </details>`;
}

/**
 * 03/10/2026: a frase embaixo do valor - quantas parcelas ele tira por mês e
 * qual é o mínimo pra tirar 2 (o padrão). p.valorManual: o Tiago digitou.
 */
export function htmlValorNota(p) {
  const min = minimoParaMatar(p, 2, p.alvo);
  if (!min) return '';
  const div = p.dividas[min.id];
  const anual = p.frequencia === 'anual';
  const explica = div.sistema === 'SAC'
    ? `2 × a amortização de ${brl0(min.porParcela)}${div.tr ? ', já com a TR' : ''}`
    : `o principal das 2 últimas parcelas, a valor de hoje`;
  const modo = p.modo === 'parcela' ? ' (no modo <b>Prazo</b>; reduzindo a parcela, o prazo fica e a parcela cai)' : '';
  if (!p.valorManual) {
    return anual
      ? `<b>${esc(brl0(p.valor))} em dezembro</b> = 12 × o mínimo mensal (${esc(brl0(min.valor))}, que tira <b>2 parcelas</b> do fim do contrato ${esc(NOME_DIV_DE[min.id])} a cada mês)${modo}. <a class="pt-link" href="#sdParcelas">E pra tirar 3 ou 4? ›</a>`
      : `<b>${esc(brl0(p.valor))} por mês</b> tira <b>2 parcelas</b> do fim do contrato ${esc(NOME_DIV_DE[min.id])} a cada mês - o mínimo pra isso (${esc(explica)})${modo}. <a class="pt-link" href="#sdParcelas">E pra tirar 3 ou 4? ›</a>`;
  }
  const pr = premissas(p.taxas);
  const mensal = anual ? p.valor / 12 : p.valor;
  const k = parcelasQueOValorMata(div, mensal, { trMensal: trNoMes(1, pr) });
  return `Você escolheu <b>${esc(brl0(p.valor))}${anual ? ' por ano' : ' por mês'}</b>${k > 0 ? `: ${anual ? 'na média, ' : ''}tira ~${esc(parcelasTxt(Math.round(k * 10) / 10))} ${esc(NOME_DIV_DE[min.id])} por mês` : ''}. O mínimo pra tirar 2 por mês é <b>${esc(brl0(anual ? min.valor * 12 : min.valor))}${anual ? ' por ano' : ''}</b> (${esc(explica)})${modo}. <button type="button" class="pt-mini" data-sd-acao="minimo">usar o mínimo</button>`;
}

/**
 * 03/10/2026: "Quanto amortizar pra matar 2, 3 e 4 parcelas por mês" - um
 * card por dívida, uma linha por opção, com o botão que põe no formulário.
 */
export function htmlMatarParcelas(opcoes, p) {
  if (!opcoes || !opcoes.length) return '';
  const pr = premissas(p.taxas);
  const alvoAtual = p.alvo === 'cara' ? (minimoParaMatar(p, 2, 'cara') || {}).id : p.alvo;
  const perfil = PERFIS[p.perfil] || PERFIS.cdi100;
  return opcoes.map((o) => {
    const l0 = o.linhas[0];
    const linhas = o.linhas.map((l) => {
      const atual = p.frequencia === 'mensal' && p.modo === 'prazo' && alvoAtual === o.id && Math.round(p.valor) === Math.round(l.valor);
      const ganha = l.melhor;
      const dif = Math.abs(l.vantagemInvestir);
      return `<li class="sd-matar-li${atual ? ' atual' : ''}">
        <span class="sd-matar-k"><b>${esc(l.k)}</b><small>${l.k === 1 ? 'parcela' : 'parcelas'}/mês</small></span>
        <span class="sd-matar-c sd-matar-v"><small>Amortizar</small><b>${esc(brl0(l.valor))}</b><em>por mês</em></span>
        <span class="sd-matar-c"><small>Quita em</small><b>${esc(mesAno(l.quitaMes))}</b><em>${l.mesesAdiantados > 0 ? `${esc(mesesTxt(l.mesesAdiantados))} antes` : 'igual'}</em></span>
        <span class="sd-matar-c"><small>Juros + seguro</small><b>−${esc(mil(l.custoEconomizado))}</b><em>no contrato</em></span>
        <span class="sd-matar-c sd-matar-pat"><small>Patrimônio em ${esc(l.anoHorizonte)}</small><b class="${ganha === 'amortizar' ? 'amort' : 'inv'}">${esc(ganha === 'amortizar' ? 'amortizar' : 'investir')} +${esc(mil(dif))}</b><em>${esc(mil(l.patrimonioAmortizar))} × ${esc(mil(l.patrimonioInvestir))}</em></span>
        <span class="sd-matar-acao">${atual ? '<span class="pt-pill good">simulando</span>' : `<button type="button" class="pt-mini" data-sd-matar="${esc(o.id)}:${esc(l.valor)}">simular este</button>`}</span>
      </li>`;
    }).join('');
    return `<div class="pt-card pt-pad sd-matar-card" data-sd-divida="${esc(o.id)}">
      <div class="pt-card-cab"><h3>${esc(o.id === 'financiamento' ? 'Apê' : 'FIES')} <small>${esc(o.sistema)}</small></h3><span class="pt-hint">hoje quita em ${esc(mesAno(l0 && l0.baseMes))} · custa ${esc(pct(o.custo))} a.a. hoje${o.abaixoInflacao ? ` - <b>menos que a inflação</b> (${esc(pct(pr.ipca))}): antecipar não compensa` : ''}</span></div>
      <ul class="sd-matar-lista">${linhas}</ul>
    </div>`;
  }).join('') + `<p class="pt-nota sd-matar-nota">"Matar" uma parcela = tirar uma do fim do contrato (modo Prazo). No SAC é uma amortização (${p.dividas.financiamento && p.dividas.financiamento.tr ? 'corrigida pela TR todo mês - o mesmo valor tira um pouco menos com o tempo' : 'constante'}); na Price, o valor de hoje das últimas parcelas (cresce devagar mês a mês). A coluna "Patrimônio em ${esc((opcoes[0].linhas[0] || {}).anoHorizonte || '')}" compara o patrimônio líquido amortizando × investindo o mesmo valor em ${esc(perfil.nome)} por ${esc(p.horizonteAnos)} anos.</p>`;
}

function linhaQuitacao(sim, id, cenario = 'amortizar') {
  const q = sim.resumo.quitacao[id];
  if (!q) return '';
  const novo = cenario === 'misto' ? q.mistoMes : q.amortizarMes;
  const adi = cenario === 'misto' ? q.mesesAdiantadosMisto : q.mesesAdiantados;
  if (!q.baseMes) return `<li><span>${esc(NOME_DIV[id])}</span><b>—</b></li>`;
  return `<li><span>${esc(NOME_DIV[id])} quita</span><b>${esc(mesAno(novo || q.baseMes))}</b><small>${adi > 0 ? `${esc(mesesTxt(adi))} antes (era ${esc(mesAno(q.baseMes))})` : `igual: ${esc(mesAno(q.baseMes))}`}</small></li>`;
}

export function htmlCards(sim) {
  const { resumo: r, params: p, cenarios } = sim;
  if (!sim.temDivida) return '<p class="pt-nota">Cadastre o financiamento ou o FIES na aba Patrimônio pra simular.</p>';
  const ganha = r.melhor;
  const dif = Math.abs(r.vantagemInvestir);
  const alvoTxt = r.ordemAlvo.length ? r.ordemAlvo.map((id) => NOME_DIV_LONGO[id]).join(' e depois ') : 'nenhuma dívida';
  const perfil = PERFIS[p.perfil];
  const parcela = p.modo === 'parcela' && r.ordemAlvo[0] ? (() => {
    const id = r.ordemAlvo[0];
    const pa = cenarios.amortizar.pagamentos; const pb = cenarios.base.pagamentos;
    const k = Math.min(12, pa.length) - 1;
    return k >= 0 ? `<li><span>Parcelas no 1º ano</span><b>${esc(brl0(pa[k]))}</b><small>era ${esc(brl0(pb[k]))} por mês (${esc(NOME_DIV[id])} + demais)</small></li>` : '';
  })() : '';
  const ids = Object.keys(r.quitacao);
  return `
    <article class="sd-card amort${ganha === 'amortizar' ? ' ganha' : ''}" data-sd-card="amortizar">
      <div class="sd-card-cab"><span class="sd-marca"></span><span class="pt-rot">Amortizar ${esc(alvoTxt)}</span>${ganha === 'amortizar' ? `<span class="pt-pill good">+${esc(mil(dif))}</span>` : ''}</div>
      <span class="sd-num">${esc(mil(r.patrimonio.amortizar))}</span>
      <small class="sd-sub">patrimônio líquido em ${esc(r.anoHorizonte)}</small>
      <ul class="sd-stats">
        ${ids.map((id) => linhaQuitacao(sim, id)).join('')}
        ${parcela}
        <li><span>Juros + seguro economizados</span><b>${esc(mil(r.custoEconomizado))}</b><small>no contrato inteiro (${esc(mil(r.jurosEconomizadosHorizonte))} até ${esc(r.anoHorizonte)})</small></li>
        ${sim.anos[sim.anos.length - 1].amortizar.investidoLiquido > 1 ? `<li><span>Investido depois de quitar</span><b>${esc(mil(sim.anos[sim.anos.length - 1].amortizar.investidoLiquido))}</b><small>as parcelas que somem viram aporte</small></li>` : ''}
      </ul>
    </article>
    <span class="sd-vs" aria-hidden="true">ou</span>
    <article class="sd-card inv${ganha === 'investir' ? ' ganha' : ''}" data-sd-card="investir">
      <div class="sd-card-cab"><span class="sd-marca"></span><span class="pt-rot">Investir em ${esc(perfil.nome)}</span>${ganha === 'investir' ? `<span class="pt-pill good">+${esc(mil(dif))}</span>` : ''}</div>
      <span class="sd-num">${esc(mil(r.patrimonio.investir))}</span>
      <small class="sd-sub">patrimônio líquido em ${esc(r.anoHorizonte)}</small>
      <ul class="sd-stats">
        <li><span>Renda passiva</span><b>${esc(brl0(r.rendaPassiva))}/mês</b><small>${esc(brl0(r.rendaPassivaReal))} acima da inflação${p.perfil === 'fii' ? ' · isenta de IR' : ' · já sem IR'}</small></li>
        <li><span>Investido (líquido de IR)</span><b>${esc(mil(r.investidoLiquido))}</b><small>bruto ${esc(mil(r.investidoBruto))} · IR ${esc(mil(r.irEstimado))} se resgatar</small></li>
        <li><span>Rendimento líquido</span><b>${esc(mil(r.rendimentoLiquido))}</b><small>sobre ${esc(mil(r.aportadoInvestir))} aportados · ~${esc(pct(r.retornoLiquido))} a.a.</small></li>
      </ul>
    </article>`;
}

export function htmlFaixa(sim) {
  const { resumo: r, params: p } = sim;
  if (!sim.temDivida) return '';
  const alvo = r.ordemAlvo[0];
  const c = alvo ? r.custos[alvo] : null;
  const v = r.virada;
  return `
    <div class="pt-tile"><span class="pt-rot">Só as parcelas</span><b>${esc(mil(r.patrimonio.base))}</b><small>em ${esc(r.anoHorizonte)}, sem o extra</small></div>
    <div class="pt-tile"><span class="pt-rot">Metade em cada</span><b>${esc(mil(r.patrimonio.misto))}</b><small>${esc(formatNumeroBR((p.fracMisto || 0.5) * 100, 0))}% na dívida, o resto investido</small></div>
    <div class="pt-tile"><span class="pt-rot">Custo da dívida</span><b>${esc(c ? pct(c.medio) : '—')}</b><small>${alvo ? `${esc(NOME_DIV[alvo])}: hoje ${esc(pct(c.hoje))} a.a. (juros${p.dividas[alvo].tr ? ' + TR' : ''}${p.dividas[alvo].seguro ? ' + seguro' : ''}); média no período` : 'nenhuma dívida no alvo'}</small></div>
    <div class="pt-tile dest"><span class="pt-rot">Ponto de virada</span><b>${esc(v && !v.acima && !v.abaixo ? pct(v.taxa) : v && v.acima ? '> 40%' : '—')}</b><small>retorno líquido a.a. acima do qual investir ganha · ${esc(PERFIS[p.perfil].curto)} dá ~${esc(pct(r.retornoLiquido))}</small></div>`;
}

export function htmlVeredito(v) {
  return `<div class="sd-ver-cab"><span class="pt-rot">Veredito</span><h3>${esc(v.titulo)}</h3></div><p class="sd-ver-txt">${esc(v.texto)}</p>${v.bullets.length ? `<ul class="sd-ver-lista">${v.bullets.map((b) => `<li class="sd-tom-${esc(b.tom)}">${b.html}</li>`).join('')}</ul>` : ''}`;
}

export function htmlPerfis(sim) {
  const { resumo: r, params: p } = sim;
  return `<div class="pt-tab-wrap sd-tab-wrap"><table class="pt-tab sd-perfis"><thead><tr><th class="esq">Investir em</th><th>Retorno líquido</th><th>Patrimônio em ${esc(r.anoHorizonte)}</th><th>Renda/mês</th><th>Acima da inflação</th></tr></thead><tbody>
    ${r.perfis.map((x) => `<tr class="${x.id === p.perfil ? 'sel' : ''}"><td class="esq"><button type="button" class="sd-perfil-btn" data-sd-perfil="${esc(x.id)}" aria-pressed="${x.id === p.perfil}">${esc(x.nome)}</button><small>${esc(x.desc)}</small></td><td>${esc(pct(x.retornoLiquido))} a.a.</td><td>${esc(mil(x.patrimonio))}</td><td>${esc(brl0(x.renda))}</td><td>${esc(brl0(x.rendaReal))}</td></tr>`).join('')}
    <tr class="sd-ref"><td class="esq">Amortizar (comparação)</td><td>${esc(pct(r.ordemAlvo[0] ? r.custos[r.ordemAlvo[0]].medio : null))} a.a.<small>custo evitado</small></td><td>${esc(mil(r.patrimonio.amortizar))}</td><td>${esc(brl0(r.rendaPassivaAmortizar))}</td><td>—</td></tr>
  </tbody></table></div>
  <p class="pt-nota pt-nota-pad">Retorno líquido = média ao ano no período, já sem IR (renda fixa: tabela regressiva até 15%; FIIs: proventos isentos, 20% só sobre a valorização se vender). Renda/mês = o que o dinheiro rende no último mês (proventos nos FIIs); "acima da inflação" é o que dá pra gastar sem o patrimônio perder valor. CDI e TR caem juntos até o CDI de longo prazo.</p>`;
}

export function htmlTabela(sim) {
  const { anos, resumo: r } = sim;
  const cel = (v) => `<td>${esc(mil(v))}</td>`;
  return `<div class="pt-tab-wrap sd-tab-wrap"><table class="pt-tab sd-anos"><thead><tr><th class="esq">Ano</th><th>Dívidas<small>só parcelas</small></th><th>Dívidas<small>amortizando</small></th><th>Investido<small>investindo, líquido</small></th><th>Patrimônio<small>só parcelas</small></th><th>Patrimônio<small>amortizar</small></th><th>Patrimônio<small>investir</small></th><th>Patrimônio<small>metade</small></th><th>Investir − amortizar</th><th>Renda/mês<small>investindo</small></th></tr></thead><tbody>
    ${anos.map((a) => {
    const d = a.investir.patrimonio - a.amortizar.patrimonio;
    return `<tr${a.k === 0 ? ' class="pt-hoje"' : ''}><td class="esq">${a.k === 0 ? 'hoje' : esc(a.ano)}</td>${cel(a.base.totalDividas)}${cel(a.amortizar.totalDividas)}${cel(a.investir.investidoLiquido)}${cel(a.base.patrimonio)}${cel(a.amortizar.patrimonio)}${cel(a.investir.patrimonio)}${cel(a.misto.patrimonio)}<td class="${d >= 0 ? 'good' : 'bad'}">${a.k === 0 ? '—' : `${d >= 0 ? '+' : '−'}${esc(mil(Math.abs(d)))}`}</td><td>${esc(brl0(a.investir.renda))}</td></tr>`;
  }).join('')}</tbody></table></div>
  <p class="pt-nota pt-nota-pad">Patrimônio = o líquido de hoje + a dívida que foi abatida + o investido no experimento (líquido de IR) + o que o FGTS cresceu. Seus aportes normais, a valorização do apê e o rendimento do que você já tem são iguais nos cenários e ficam de fora. ${r.frequencias ? `Valores nominais (sem descontar a inflação).` : ''}</p>`;
}

export function htmlEstrategias(sim) {
  const r = sim.resumo;
  const tr = r.trHoje;
  const extra = tr && tr.amortizacao ? `<p class="pt-nota sd-tr">Hoje a TR soma <b>~${esc(brl0(tr.correcao))}/mês</b> ao saldo do apê e a parcela abate <b>${esc(brl0(tr.amortizacao))}</b> de amortização: o saldo cai só ~${esc(brl0(tr.amortizacao - tr.correcao))} por mês sem amortizar a mais.</p>` : '';
  const fr = r.frequencias;
  const freq = fr ? `<p class="pt-nota sd-tr">Com o mesmo total no ano: <b>todo mês</b> economiza ${esc(mil(fr.atual === 'mensal' ? fr.economiaAtual : fr.economiaOutra))} de juros + seguro; <b>uma vez por ano</b> (dezembro), ${esc(mil(fr.atual === 'anual' ? fr.economiaAtual : fr.economiaOutra))}.</p>` : '';
  return `<ol class="sd-estrategias">${ESTRATEGIAS_VIDEO.map((e) => `<li><a class="sd-min" href="https://www.youtube.com/watch?v=YSFaETS0yQM&t=${e.t}s" target="_blank" rel="noopener">${esc(e.min)}</a><div><b>${esc(e.titulo)}</b><p>${esc(e.video)}</p><p class="sd-conta"><span>Na conta:</span> ${esc(e.conta)}</p></div></li>`).join('')}</ol>${extra}${freq}`;
}

export function htmlReferencias() {
  return `<ul class="sd-refs">${REFERENCIAS.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.nome)}</a></li>`).join('')}</ul>
  <p class="pt-nota">Taxas padrão quando o site não tem o número: CDI ${esc(pct(PADROES.cdi, 2))} (BCB, 01/10/2026), IPCA ${esc(pct(PADROES.ipca, 1))} em 12 meses, TR ${esc(pct(PADROES.trMensal, 3))} ao mês. É uma simulação: taxas futuras são suposições - confira a regra de amortização no app da Caixa antes de pagar.</p>`;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

function garantirCss(doc) {
  try {
    if (!doc || doc.querySelector('link[data-sd-css]')) return;
    const href = new URL('../../css/simulador.css', import.meta.url).href;
    if ([...doc.querySelectorAll('link[rel="stylesheet"]')].some((l) => /simulador\.css/.test(l.getAttribute('href') || ''))) return;
    const l = doc.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.sdCss = '1';
    doc.head.appendChild(l);
  } catch (e) { /* sem CSS automático */ }
}

const ESCOLHAS = ['valor', 'valorManual', 'frequencia', 'alvo', 'modo', 'perfil', 'horizonteAnos', 'reinvestirDiferenca', 'reinvestirProventos', 'taxas', 'usarFgts'];

/**
 * O valor padrão do momento: o mínimo que tira 2 parcelas por mês da
 * dívida-alvo (× 12 no "fim do ano"); sem dívida pra amortizar, a regra
 * antiga (10% do salário).
 */
export function valorPadraoAtual(p) {
  const min = minimoParaMatar(p, 2, p.alvo);
  const base = min ? min.valor : (num(p.valorSalario) ? p.valorSalario : 1000);
  return p.frequencia === 'anual' ? base * 12 : base;
}

/**
 * A escolha salva no navegador vale como "o Tiago digitou"? Salvas antes de
 * 03/10/2026 não têm a marca: aí só conta se não for o padrão antigo (10% do
 * salário, ou 12 × isso no anual) - que era gravado junto com qualquer clique.
 */
export function valorSalvoEhManual(salvo, padrao) {
  if (!salvo || !num(salvo.valor)) return false;
  if (typeof salvo.valorManual === 'boolean') return salvo.valorManual;
  const antigo = padrao && num(padrao.valorSalario) ? padrao.valorSalario : null;
  if (antigo == null) return true;
  return !(Math.round(salvo.valor) === Math.round(antigo) || Math.round(salvo.valor) === Math.round(antigo * 12));
}

/**
 * Monta a seção em `raiz`. Opções: ctx (contexto do patrimônio), doc,
 * hoje ('aaaa-mm-dd'; padrão ctx.d.hoje), storage (padrão localStorage -
 * guarda só as escolhas da tela neste navegador).
 * Devolve { atualizar(novoCtx), get simulacao(), get params() }.
 */
export function montarSimuladorDividas(raiz, { ctx, doc = raiz && raiz.ownerDocument, hoje = null, storage = undefined, aoMudar = null } = {}) {
  const win = doc && doc.defaultView;
  let store = storage;
  if (store === undefined) { try { store = win && win.localStorage; } catch (e) { store = null; } }
  garantirCss(doc);
  let contexto = ctx;
  let padrao = null;
  let p = null;
  let sim = null;
  let opcoes = null; // "matar 2, 3, 4 parcelas" (guardado enquanto as premissas não mudam)
  let chaveOpcoes = '';
  const dicas = {};

  const lerSalvo = () => { try { const t = store && store.getItem(CHAVE); return t ? JSON.parse(t) : {}; } catch (e) { return {}; } };
  const salvar = () => {
    try {
      if (!store) return;
      const o = {};
      ESCOLHAS.forEach((k) => { if (k === 'usarFgts') { if (p.fgts) o.usarFgts = p.fgts.usar !== false; } else if (p[k] !== undefined) o[k] = p[k]; });
      store.setItem(CHAVE, JSON.stringify(o));
    } catch (e) { /* navegador sem storage */ }
  };

  function iniciar() {
    padrao = parametrosPadrao(contexto || {}, hoje || (contexto && contexto.d && contexto.d.hoje));
    const s = lerSalvo();
    p = { ...padrao, taxas: { ...padrao.taxas } };
    ESCOLHAS.forEach((k) => {
      if (k === 'valor' || k === 'valorManual') return;
      if (k === 'usarFgts') { if (p.fgts && typeof s.usarFgts === 'boolean') p.fgts = { ...p.fgts, usar: s.usarFgts }; } else if (k === 'taxas' && s.taxas) p.taxas = { ...p.taxas, ...s.taxas }; else if (s[k] !== undefined) p[k] = s[k];
    });
    if (p.alvo !== 'cara' && !p.dividas[p.alvo]) p.alvo = 'cara';
    // 03/10/2026: o valor salvo só vale se foi o Tiago que escolheu; senão, o mínimo pra 2 parcelas
    p.valorManual = valorSalvoEhManual(s, padrao);
    p.valor = p.valorManual ? s.valor : valorPadraoAtual(p);
  }

  function esqueleto() {
    raiz.innerHTML = `
      <div class="pt-conteudo sd">
        <section class="pt-sec">
          <div class="pt-sec-cab"><h2>Amortizar ou investir?</h2><span class="pt-hint">o mesmo dinheiro saindo do bolso nos dois caminhos · já simulado com as suas dívidas de hoje</span></div>
          <div class="pt-card sd-form" id="sdForm"></div>
          <div class="sd-cards" id="sdCards" aria-live="polite"></div>
          <div class="pt-tiles sd-faixa" id="sdFaixa"></div>
          <div class="pt-card pt-pad sd-ver" id="sdVer"></div>
        </section>
        <section class="pt-sec" id="sdSecParcelas">
          <div class="pt-sec-cab"><h2>Quanto amortizar pra matar 2, 3 ou 4 parcelas por mês</h2><span class="pt-hint">todo mês, reduzindo o prazo · em cada dívida · "simular este" põe o valor lá em cima</span></div>
          <div class="sd-duas sd-matar" id="sdParcelas"></div>
        </section>
        <section class="pt-sec">
          <div class="pt-sec-cab"><h2>Ano a ano</h2><span class="pt-hint">patrimônio líquido no fim de cada ano, em cada caminho</span></div>
          <div class="pt-card"><div class="sd-leg pt-leg" id="sdLegPat"></div><div class="pt-grafico" data-sd-graf="pat" id="sdGPat"></div></div>
          <div class="sd-duas">
            <div class="pt-card"><div class="pt-card-cab sd-pad-cab"><h3>Investir − amortizar</h3><span class="pt-hint">acima do zero, investir está na frente</span></div><div class="pt-grafico" data-sd-graf="dif" id="sdGDif"></div></div>
            <div class="pt-card"><div class="pt-card-cab sd-pad-cab"><h3>Quanto você ainda deve</h3><span class="pt-hint">financiamento + FIES</span></div><div class="sd-leg pt-leg" id="sdLegDiv"></div><div class="pt-grafico" data-sd-graf="div" id="sdGDiv"></div></div>
          </div>
          <details class="pt-card sd-det"><summary>Tabela ano a ano</summary><div id="sdTabela"></div></details>
        </section>
        <section class="pt-sec">
          <div class="pt-sec-cab"><h2>Onde investir faz diferença</h2><span class="pt-hint">o mesmo valor em cada tipo - toque pra simular com ele</span></div>
          <div class="pt-card" id="sdPerfis"></div>
        </section>
        <section class="pt-sec">
          <div class="sd-duas">
            <div class="pt-card pt-pad"><div class="pt-card-cab"><h3>Estratégias do vídeo</h3><span class="pt-hint">BextPlay · "Devo amortizar todo mês ou uma vez por ano" (2025)</span></div><div id="sdVideo"></div></div>
            <div class="pt-card pt-pad"><div class="pt-card-cab"><h3>Referências</h3></div><div id="sdRefs"></div></div>
          </div>
        </section>
      </div>`;
  }

  const largura = (id, padraoL) => { const e = raiz.querySelector(id); return (e && e.clientWidth ? e.clientWidth - 36 : 0) || padraoL; };
  const legenda = (ids) => SERIES.filter((s) => ids.includes(s.id)).map((s) => `<span><i class="${s.tracejado ? 'sd-leg-trac' : ''}" style="${s.tracejado ? `border-color:${s.cor}` : `background:${s.cor}`}"></i>${esc(s.nome)}</span>`).join('');

  function desenharGrafico(id, chave, g) {
    const box = raiz.querySelector(id);
    if (!box) return;
    box.innerHTML = `${g.svg}<div class="pt-tt" hidden></div>`;
    dicas[chave] = g.dicas;
  }

  function graficos() {
    const { anos } = sim;
    const rotulos = anos.map((a) => (a.k === 0 ? 'hoje' : String(a.ano)));
    const dicaAno = (k) => {
      const a = anos[k];
      return `<b class="pt-tt-t">${esc(a.k === 0 ? 'Hoje' : `Fim de ${a.ano}`)}</b>${SERIES.map((s) => linhaTt(s.nome, mil(a[s.id].patrimonio), '', s.cor)).join('')}${a.k ? linhaTt('Investir − amortizar', `${a.investir.patrimonio >= a.amortizar.patrimonio ? '+' : '−'}${mil(Math.abs(a.investir.patrimonio - a.amortizar.patrimonio))}`, 'pt-tt-total') : ''}`;
    };
    raiz.querySelector('#sdLegPat').innerHTML = legenda(['base', 'amortizar', 'investir', 'misto']);
    desenharGrafico('#sdGPat', 'pat', graficoLinhas({
      rotulos, series: ['base', 'misto', 'investir', 'amortizar'].map((id) => SERIES.find((x) => x.id === id)).map((sr) => ({ ...sr, valores: anos.map((a) => a[sr.id].patrimonio) })), dica: dicaAno, rotuloFinal: ['base', 'amortizar', 'investir'],
    }, { largura: largura('#sdGPat', 720), altura: 280 }));
    const difs = anos.slice(1).map((a) => a.investir.patrimonio - a.amortizar.patrimonio);
    desenharGrafico('#sdGDif', 'dif', graficoBarras({
      rotulos: anos.slice(1).map((a) => String(a.ano)), valores: difs, corPos: 'var(--sd-inv)', corNeg: 'var(--sd-amort)',
      dica: (k) => { const a = anos[k + 1]; const d = difs[k]; return `<b class="pt-tt-t">Fim de ${esc(a.ano)}</b>${linhaTt(d >= 0 ? 'Investir na frente' : 'Amortizar na frente', mil(Math.abs(d)))}${linhaTt('Investir', mil(a.investir.patrimonio), '', 'var(--sd-inv)')}${linhaTt('Amortizar', mil(a.amortizar.patrimonio), '', 'var(--sd-amort)')}`; },
    }, { largura: largura('#sdGDif', 420), altura: 210 }));
    const serDiv = SERIES.filter((s) => s.id !== 'investir').map((s) => ({ ...s, nome: s.id === 'base' ? 'Só as parcelas (= investir)' : s.nome, valores: anos.map((a) => a[s.id].totalDividas) }));
    raiz.querySelector('#sdLegDiv').innerHTML = serDiv.map((s) => `<span><i class="${s.tracejado ? 'sd-leg-trac' : ''}" style="${s.tracejado ? `border-color:${s.cor}` : `background:${s.cor}`}"></i>${esc(s.nome)}</span>`).join('');
    desenharGrafico('#sdGDiv', 'div', graficoLinhas({
      rotulos, series: serDiv, zero: true,
      dica: (k) => { const a = anos[k]; const ids = Object.keys(a.base.dividas); return `<b class="pt-tt-t">${esc(a.k === 0 ? 'Hoje' : `Fim de ${a.ano}`)}</b>${serDiv.map((s) => linhaTt(s.nome.replace(' (= investir)', ''), mil(a[s.id].totalDividas), '', s.cor)).join('')}${ids.length > 1 ? `<div class="pt-tt-n">${ids.map((id) => `${NOME_DIV[id]}: ${mil(a.base.dividas[id])} → ${mil(a.amortizar.dividas[id])}`).join(' · ')}</div>` : ''}`; },
    }, { largura: largura('#sdGDiv', 420), altura: 210 }));
  }

  function resultado() {
    sim = simular(p);
    raiz.querySelector('#sdCards').innerHTML = htmlCards(sim);
    raiz.querySelector('#sdFaixa').innerHTML = htmlFaixa(sim);
    raiz.querySelector('#sdVer').innerHTML = htmlVeredito(veredito(sim));
    const semDiv = !sim.temDivida;
    raiz.querySelectorAll('.sd .pt-sec').forEach((sec, k) => { if (k === 1 || k === 2 || k === 3) sec.hidden = semDiv; });
    const nota = raiz.querySelector('#sdValorNota');
    if (nota) nota.innerHTML = htmlValorNota(p);
    if (!semDiv) {
      const chave = JSON.stringify([p.perfil, p.horizonteAnos, p.taxas, p.reinvestirDiferenca, p.reinvestirProventos, p.fgts && p.fgts.usar, p.patrimonioBase, p.hoje]);
      if (!opcoes || chave !== chaveOpcoes) { opcoes = opcoesMatarParcelas(p); chaveOpcoes = chave; }
      raiz.querySelector('#sdParcelas').innerHTML = htmlMatarParcelas(opcoes, p);
      graficos();
      raiz.querySelector('#sdTabela').innerHTML = htmlTabela(sim);
      raiz.querySelector('#sdPerfis').innerHTML = htmlPerfis(sim);
    }
    raiz.querySelector('#sdVideo').innerHTML = htmlEstrategias(sim);
    raiz.querySelector('#sdRefs').innerHTML = htmlReferencias();
    if (typeof aoMudar === 'function') { try { aoMudar(sim, p, { opcoes, minimo: minimoParaMatar(p, 2, p.alvo) }); } catch (e) { /* o herói é extra */ } }
  }

  function formulario() { raiz.querySelector('#sdForm').innerHTML = htmlFormulario(p, premissas(p.taxas)); }

  function desenhar() {
    if (!raiz.querySelector('#sdForm')) esqueleto();
    formulario();
    resultado();
  }

  function mudar(fn, { form = false } = {}) {
    fn();
    if (!p.valorManual) p.valor = valorPadraoAtual(p);
    salvar();
    if (form) { p._premAberta = !!raiz.querySelector('.sd-prem[open]'); formulario(); }
    resultado();
  }

  /** Valor digitado: igual ao mínimo de agora = volta a ser o padrão (acompanha a dívida e as taxas). */
  function definirValor(v) {
    p.valor = v;
    p.valorManual = Math.round(v) !== Math.round(valorPadraoAtual(p));
  }

  /** Põe uma escolha no formulário (o "simular este" e quem estiver de fora - o herói). */
  function aplicar(o, { rolar = false } = {}) {
    mudar(() => {
      ['alvo', 'frequencia', 'modo', 'perfil', 'horizonteAnos'].forEach((k) => { if (o[k] !== undefined) p[k] = o[k]; });
      if (num(o.valor)) definirValor(o.valor);
    }, { form: true });
    if (rolar) {
      const f = raiz.querySelector('#sdForm');
      if (f) {
        f.classList.remove('sd-piscar'); void f.offsetWidth; f.classList.add('sd-piscar'); // eslint-disable-line no-void
        if (f.scrollIntoView) try { f.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ok */ }
      }
    }
  }

  const TAXAS = { sdCdi: 'cdi', sdCdiLongo: 'cdiLongo', sdIpca: 'ipca', sdTr: 'trMensal', sdReal: 'taxaRealIpca', sdDy: 'dyFii', sdValFii: 'valorizacaoFii' };

  function ligar() {
    raiz.addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('button');
      if (!b || !raiz.contains(b)) return;
      const grupo = b.parentElement && b.parentElement.dataset.sdSeg;
      if (grupo) {
        mudar(() => {
          const v = b.dataset.v;
          if (grupo === 'frequencia' && v !== p.frequencia && p.valorManual) {
            // mantém o mesmo total no ano ao trocar (o padrão se recalcula sozinho)
            p.valor = v === 'anual' ? Math.round(p.valor * 12) : Math.round(p.valor / 12);
          }
          p[grupo] = v;
        }, { form: true });
        return;
      }
      if (b.dataset.sdPerfil) { mudar(() => { p.perfil = b.dataset.sdPerfil; }, { form: true }); return; }
      if (b.dataset.sdMatar) { const [id, v] = b.dataset.sdMatar.split(':'); aplicar({ alvo: id, valor: Number(v), frequencia: 'mensal', modo: 'prazo' }, { rolar: true }); return; }
      if (b.dataset.sdAcao === 'minimo') { mudar(() => { p.valorManual = false; }, { form: true }); return; }
      if (b.dataset.sdAcao === 'padrao') {
        try { if (store) store.removeItem(CHAVE); } catch (e) { /* ok */ }
        iniciar();
        p._premAberta = true;
        desenhar();
      }
    });
    raiz.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.id === 'sdValor') { const v = lerValorBR(t.value); mudar(() => { definirValor(num(v) && v >= 0 ? v : 0); }); t.value = formatNumeroBR(p.valor, 0); } else if (t.id === 'sdPerfil') mudar(() => { p.perfil = t.value; });
      else if (t.id === 'sdHorizonte') mudar(() => { p.horizonteAnos = Number(t.value) || 10; });
      else if (t.id === 'sdReinvDif') mudar(() => { p.reinvestirDiferenca = t.checked; });
      else if (t.id === 'sdReinvProv') mudar(() => { p.reinvestirProventos = t.checked; });
      else if (t.id === 'sdFgts') mudar(() => { p.fgts = { ...p.fgts, usar: t.checked }; });
      else if (t.id === 'sdAnos') { const v = lerValorBR(t.value); mudar(() => { p.taxas = { ...p.taxas, anosTransicao: num(v) && v >= 0 && v <= 30 ? v : PADROES.anosTransicao }; }, { form: true }); } else if (TAXAS[t.id]) {
        const v = lerValorBR(t.value);
        mudar(() => {
          const k = TAXAS[t.id];
          p.taxas = { ...p.taxas, [k]: num(v) ? v / 100 : null };
          // o CDI de longo prazo segue o IPCA enquanto não for digitado
          if (k === 'ipca' && !(p.taxas.cdiLongoManual)) p.taxas.cdiLongo = null;
          if (k === 'cdiLongo') p.taxas.cdiLongoManual = num(v);
        }, { form: true });
      }
    });
    let timer = null;
    raiz.addEventListener('input', (ev) => {
      if (ev.target.id !== 'sdValor') return;
      clearTimeout(timer);
      timer = setTimeout(() => { const v = lerValorBR(ev.target.value); if (num(v) && v >= 0) mudar(() => { definirValor(v); }); }, 450);
    });
    // balões dos gráficos
    const mostrar = (alvo) => {
      const box = alvo.closest('[data-sd-graf]');
      if (!box) return;
      const tt = box.querySelector('.pt-tt');
      const html = (dicas[box.dataset.sdGraf] || [])[Number(alvo.dataset.i)];
      if (!tt || !html) return;
      tt.innerHTML = html;
      tt.hidden = false;
      const rb = box.getBoundingClientRect(); const ra = alvo.getBoundingClientRect();
      const cx = ra.left - rb.left + ra.width / 2;
      const w = tt.offsetWidth || 200;
      tt.style.left = `${Math.max(4, Math.min(rb.width - w - 4, cx + 12 > rb.width - w ? cx - w - 12 : cx + 12))}px`;
      tt.style.top = '8px';
      box.querySelectorAll('.sd-hit.on').forEach((h) => h.classList.remove('on'));
      alvo.classList.add('on');
    };
    const esconder = (box) => { if (!box) return; const tt = box.querySelector('.pt-tt'); if (tt) tt.hidden = true; box.querySelectorAll('.sd-hit.on').forEach((h) => h.classList.remove('on')); };
    raiz.addEventListener('mouseover', (ev) => { const h = ev.target.closest && ev.target.closest('.sd-hit'); if (h) mostrar(h); });
    raiz.addEventListener('focusin', (ev) => { const h = ev.target.closest && ev.target.closest('.sd-hit'); if (h) mostrar(h); });
    raiz.addEventListener('mouseout', (ev) => { const box = ev.target.closest && ev.target.closest('[data-sd-graf]'); if (box && !box.contains(ev.relatedTarget)) esconder(box); });
    raiz.addEventListener('focusout', (ev) => { const box = ev.target.closest && ev.target.closest('[data-sd-graf]'); if (box) esconder(box); });
    if (win && typeof win.addEventListener === 'function') {
      let tr = null;
      let ultimaL = raiz.clientWidth;
      win.addEventListener('resize', () => { clearTimeout(tr); tr = setTimeout(() => { if (sim && sim.temDivida && raiz.clientWidth !== ultimaL) { ultimaL = raiz.clientWidth; graficos(); } }, 200); });
    }
  }

  iniciar();
  esqueleto();
  ligar();
  desenhar();

  return {
    atualizar(novoCtx) { contexto = novoCtx; opcoes = null; iniciar(); desenhar(); },
    aplicar,
    get simulacao() { return sim; },
    get params() { return p; },
    get opcoes() { return opcoes; },
  };
}

