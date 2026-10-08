/**
 * ativo-preco-medio.js - 08/10/2026 (Tiago: "quantas cotas eu preciso comprar para que o meu preço médio fique abaixo do
 * valor atual da cota... um resumo no card de cotação e, no corpo da página do ativo, simulações maiores; se valer a
 * pena, use gráficos").
 *
 * Só aparece quando a cotação está ABAIXO do seu preço médio (renda variável com posição). Três peças:
 *   - resumoPmFaixaHtml: 2 linhas no card "Cotação × preço-teto" (quanto falta subir pra empatar + a compra de hoje que
 *     põe no lucro com +10%) e o link pras simulações;
 *   - secaoPmHtml: a seção "Para ficar no lucro" - tabela compra (−20%, −10%, hoje) × lucro (hoje, +10%, +20%), o gráfico
 *     "preço médio × cotas compradas" e o simulador (preço de compra + cotas <-> preço médio desejado, nos dois sentidos);
 *   - ligarSecaoPm: desenha o gráfico e liga o simulador.
 * A conta é preco-medio-lucro.js (a mesma do Radar, de Aportes e das análises).
 */
import {
  simularSaidaPrejuizo, cotasParaPm, pmAposCompra, pontosGraficoPm, rotuloVariacao, aporteTxt, precoTxt, LIMITE_VEZES_POSICAO,
} from '../preco-medio-lucro.js';
import { formatBRL, formatNumeroBR, formatNumeroPt, formatPercentFromFraction } from '../format.js';
import { criarGraficoLinha } from '../charts/index.js';
import { lembrarGrafico } from './carteiras-graficos.js';
import { esc } from '../util/html.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pct = (f, casas = 1) => `${formatNumeroPt(Math.abs(f) * 100, { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const qtdTxt = (n) => `${formatNumeroBR(n, 0)} cota${n === 1 ? '' : 's'}`;
const vezesTxt = (v) => `${formatNumeroPt(v, { minimumFractionDigits: v < 10 ? 1 : 0, maximumFractionDigits: v < 10 ? 1 : 0 })}×`;

/** A simulação do ativo da tela (null: renda fixa, sem posição, sem preço ou no lucro - aí não há o que mostrar). */
export function simulacaoDoAtivo(ctx) {
  if (!ctx || ctx.ehRf || !ctx.ativo) return null;
  const a = ctx.ativo;
  const quantidade = num(a.quantidade) > 0 ? a.quantidade : num(ctx.posicao && ctx.posicao.quantidade);
  const precoMedio = num(a.precoMedio) > 0 ? a.precoMedio : num(ctx.posicao && ctx.posicao.precoMedio);
  const sim = simularSaidaPrejuizo({ quantidade, precoMedio, precoAtual: num(a.precoAtual) });
  return sim && sim.situacao === 'prejuizo' ? sim : null;
}

const moedaDo = (ctx) => (ctx.emDolar ? 'USD' : 'BRL');
/** " (≈ R$ 1.234)" pras ações EUA, pelo câmbio de hoje. */
function emReais(ctx, valor) {
  return ctx.emDolar && ctx.cambio > 0 && num(valor) != null ? ` <span class="at-pm-brl">≈ ${esc(formatBRL(valor * ctx.cambio))}</span>` : '';
}

// ---------------------------------------------------------------------------
// Resumo no card "Cotação × preço-teto"
// ---------------------------------------------------------------------------

export function resumoPmFaixaHtml(ctx) {
  const sim = simulacaoDoAtivo(ctx);
  if (!sim) return '';
  const m = moedaDo(ctx);
  const d = sim.destaque;
  const compra = d.situacao === 'ok'
    ? `<p>Ou compre <b>${qtdTxt(d.cotas)}</b> hoje (${esc(aporteTxt(d.aporte, m))}): o preço médio cai para ${esc(precoTxt(d.novoPm, m))} e você fica no lucro com a cota a ${esc(precoTxt(d.alvo.preco, m))} (+10%).</p>`
    : '<p>Uma alta de até 10% já zera o prejuízo, sem precisar comprar mais.</p>';
  return `
      <div class="at-pm-resumo">
        <p><b>Para ficar no lucro</b> sem comprar mais, a cota precisa subir <b class="bad">${pct(sim.subida)}</b> (até ${esc(precoTxt(sim.precoMedio, m))}).</p>
        ${compra}
        <a class="at-link-acomp at-pm-link" href="#at-pm">Ver simulações</a>
      </div>`;
}

// ---------------------------------------------------------------------------
// Seção "Para ficar no lucro"
// ---------------------------------------------------------------------------

function celulaHtml(ctx, c, { destaque = false } = {}) {
  const m = moedaDo(ctx);
  if (c.situacao === 'impossivel') {
    return `<td class="at-pm-cel impossivel" title="Comprando a ${esc(precoTxt(c.compra.preco, m))}, o preço médio se aproxima desse preço mas nunca fica abaixo dele: só dá lucro se a cota subir.">—<small>não chega</small></td>`;
  }
  if (c.situacao === 'semCompra') return '<td class="at-pm-cel sem-compra"><b>Sem comprar</b><small>já fica no lucro</small></td>';
  const aviso = c.inviavel ? `<small class="at-pm-vezes alto">mais de ${LIMITE_VEZES_POSICAO}× a sua posição</small>`
    : (c.vezesPosicao >= 1 ? `<small class="at-pm-vezes">${vezesTxt(c.vezesPosicao)} a sua posição</small>` : '');
  const dica = `Comprando ${qtdTxt(c.cotas)} a ${precoTxt(c.compra.preco, m)} (${aporteTxt(c.aporte, m)}), o preço médio vai para ${precoTxt(c.novoPm, m)}: lucro com a cota a ${precoTxt(c.alvo.preco, m)} ou mais.`;
  return `<td class="at-pm-cel${c.inviavel ? ' inviavel' : ''}${destaque ? ' destaque' : ''}" title="${esc(dica)}"><b>${formatNumeroBR(c.cotas, 0)}<span class="at-pm-longo"> cota${c.cotas === 1 ? '' : 's'}</span></b><small>${esc(aporteTxt(c.aporte, m))}</small>${aviso}</td>`;
}

function tabelaHtml(ctx, sim) {
  const m = moedaDo(ctx);
  const cab = sim.alvos.map((a) => `<th scope="col"><span>${esc(precoTxt(a.preco, m))}</span><small>${a.variacao === 0 ? 'cotação de hoje' : `+${pct(a.variacao, 0)}`}</small></th>`).join('');
  const linhas = sim.matriz.map((linha, i) => {
    const c = sim.compras[i];
    const curto = c.variacao === 0 ? 'hoje' : `−${pct(c.variacao, 0)}`;
    return `<tr><th scope="row"><span>${esc(precoTxt(c.preco, m))}</span><small><span class="at-pm-longo">${rotuloVariacao(c.variacao)}</span><span class="at-pm-curto">${curto}</span></small></th>${linha.map((cel) => celulaHtml(ctx, cel, { destaque: cel === sim.destaque })).join('')}</tr>`;
  }).join('');
  return `
        <div class="tabela-wrap at-pm-tabela-wrap">
          <table class="at-pm-tabela">
            <caption class="at-pm-legenda">Cotas a comprar (e o aporte) para estar no lucro quando a cota chegar a cada preço. Linhas: o preço da compra; colunas: a cotação do lucro.</caption>
            <thead><tr><th scope="col" class="at-pm-canto"><span><span class="at-pm-longo">Comprando a</span><span class="at-pm-curto">Compra</span></span><small>lucro com a cota a →</small></th>${cab}</tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>`;
}

function simuladorHtml(ctx, sim) {
  const m = moedaDo(ctx);
  const simbolo = m === 'USD' ? 'US$' : 'R$';
  const chips = sim.compras.map((c) => `<button type="button" class="chip-tonal at-pm-chip" data-pm-preco="${c.preco}" aria-label="Usar ${esc(precoTxt(c.preco, m))} (${rotuloVariacao(c.variacao)})">${c.variacao === 0 ? 'Hoje' : `−${pct(c.variacao, 0)}`}</button>`).join('');
  return `
        <form class="at-pm-sim" id="atPmSim" novalidate>
          <div class="at-pm-campo">
            <label for="atPmPreco">Preço de compra</label>
            <span class="at-pm-input"><span aria-hidden="true">${simbolo}</span><input id="atPmPreco" type="text" inputmode="decimal" autocomplete="off"></span>
            <span class="at-pm-chips" role="group" aria-label="Preços prontos">${chips}</span>
          </div>
          <div class="at-pm-campo">
            <label for="atPmCotas">Cotas a comprar</label>
            <span class="at-pm-input"><input id="atPmCotas" type="text" inputmode="numeric" autocomplete="off"></span>
          </div>
          <div class="at-pm-campo">
            <label for="atPmAlvo">Preço médio desejado</label>
            <span class="at-pm-input"><span aria-hidden="true">${simbolo}</span><input id="atPmAlvo" type="text" inputmode="decimal" autocomplete="off"></span>
          </div>
          <output class="at-pm-resultado" id="atPmResultado" for="atPmPreco atPmCotas atPmAlvo" aria-live="polite"></output>
        </form>`;
}

export function secaoPmHtml(ctx) {
  const sim = simulacaoDoAtivo(ctx);
  if (!sim) return '';
  const m = moedaDo(ctx);
  return `
    <section class="at-bloco" id="at-pm" aria-labelledby="at-pm-titulo">
      <div class="at-cab-bloco"><div class="at-cab-titulos"><h2 id="at-pm-titulo">Para ficar no lucro</h2><span class="hint">simulação do seu preço médio</span></div></div>
      <div class="card at-card at-pm">
        <dl class="at-pm-numeros">
          <div><dt>Seu preço médio</dt><dd>${esc(precoTxt(sim.precoMedio, m))}</dd><small>${formatNumeroBR(sim.quantidade, Number.isInteger(sim.quantidade) ? 0 : 4)} cotas</small></div>
          <div><dt>Cotação de hoje</dt><dd>${esc(precoTxt(sim.precoAtual, m))}</dd><small class="bad">${formatPercentFromFraction(sim.perda, 1)} do seu preço médio</small></div>
          <div><dt>Sem comprar mais</dt><dd class="bad">+${pct(sim.subida)}</dd><small>de alta para empatar</small></div>
        </dl>
        <p class="at-pm-texto">Comprar ao preço de hoje baixa o seu preço médio, mas ele nunca fica abaixo da cotação: para ficar no lucro, ou a compra sai mais barata, ou a cota sobe. A tabela cruza os dois.</p>
        ${tabelaHtml(ctx, sim)}
        <div class="at-sub-titulo">Preço médio × cotas compradas</div>
        <div id="atPmGrafico" class="at-pm-grafico"></div>
        <p class="hint at-pm-nota">Cada linha é um preço de compra. Onde ela passa para baixo da cotação de hoje (tracejada), você fica no lucro mesmo sem a cota subir.</p>
        <div class="at-sub-titulo">Simule a sua compra</div>
        ${simuladorHtml(ctx, sim)}
        <p class="hint at-fonte">Cotas inteiras, arredondadas para cima; sem corretagem nem impostos. É uma conta, não uma recomendação.</p>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Gráfico + simulador
// ---------------------------------------------------------------------------

/** "71,85" / "71.85" / "1.234,5" -> número (null se vazio/inválido). */
export function lerNumero(s) {
  const t = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(/^(R\$|US\$)/i, '');
  if (!t) return null;
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}
const campo = (v, casas = 2) => (num(v) == null ? '' : formatNumeroPt(v, { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false }));

/**
 * O resultado do simulador em HTML. `origem` diz qual campo o Tiago mexeu por último ('cotas' ou 'alvo'):
 *   cotas -> calcula o novo preço médio; alvo -> calcula as cotas (ou diz por que não dá).
 * Devolve { html, cotas, alvo } - quem chama atualiza o OUTRO campo.
 */
export function resultadoSimulador(ctx, sim, { preco, cotas, alvo, origem = 'cotas' }) {
  const m = moedaDo(ctx);
  if (!(preco > 0)) return { html: '<p class="hint">Informe o preço de compra.</p>' };
  let q = cotas;
  if (origem === 'alvo') {
    if (!(alvo > 0)) return { html: '<p class="hint">Informe o preço médio desejado.</p>' };
    const r = cotasParaPm({ quantidade: sim.quantidade, precoMedio: sim.precoMedio, precoCompra: preco, pmAlvo: alvo });
    if (r.situacao === 'semCompra') return { html: `<p>O seu preço médio (${esc(precoTxt(sim.precoMedio, m))}) já está nesse valor ou abaixo.</p>`, cotas: 0 };
    if (r.situacao === 'impossivel') {
      return { html: `<p class="at-pm-nao">Comprando a ${esc(precoTxt(preco, m))}, o preço médio nunca chega a ${esc(precoTxt(alvo, m))}: ele só se aproxima do preço da compra. Escolha um preço de compra abaixo de ${esc(precoTxt(alvo, m))}.</p>`, cotas: null };
    }
    q = r.cotas;
  }
  if (!(q > 0)) return { html: '<p class="hint">Informe quantas cotas comprar.</p>' };
  const novoPm = pmAposCompra(sim, q, preco);
  const aporte = q * preco;
  const lucroHoje = novoPm < sim.precoAtual - 1e-9;
  const subida = sim.precoAtual > 0 ? novoPm / sim.precoAtual - 1 : null;
  const queda = novoPm / sim.precoMedio - 1;
  const conclusao = lucroHoje
    ? `<p class="at-pm-ok">Com a cota a ${esc(precoTxt(sim.precoAtual, m))} (hoje), você já estaria no lucro.</p>`
    : `<p>Você fica no lucro com a cota acima de <b>${esc(precoTxt(novoPm, m))}</b> (${subida != null ? `+${pct(subida)} sobre hoje` : ''}).</p>`;
  return {
    cotas: q,
    alvo: novoPm,
    html: `
      <dl class="at-pm-res">
        <div><dt>Novo preço médio</dt><dd>${esc(precoTxt(novoPm, m))}</dd><small class="good">${formatPercentFromFraction(queda, 1)}</small></div>
        <div><dt>Aporte</dt><dd>${esc(aporteTxt(aporte, m))}</dd><small>${qtdTxt(q)} a ${esc(precoTxt(preco, m))}${emReais(ctx, aporte)}</small></div>
        <div><dt>Posição</dt><dd>${formatNumeroBR(sim.quantidade + q, Number.isInteger(sim.quantidade) ? 0 : 4)} cotas</dd><small>hoje: ${formatNumeroBR(sim.quantidade, Number.isInteger(sim.quantidade) ? 0 : 4)} · a compra é ${vezesTxt(q / sim.quantidade)} isso</small></div>
      </dl>
      ${conclusao}`,
  };
}

function ligarSimulador(doc, ctx, sim) {
  const form = doc.getElementById('atPmSim');
  if (!form) return;
  const inpPreco = doc.getElementById('atPmPreco');
  const inpCotas = doc.getElementById('atPmCotas');
  const inpAlvo = doc.getElementById('atPmAlvo');
  const saida = doc.getElementById('atPmResultado');
  let origem = 'cotas';
  const d = sim.destaque.situacao === 'ok' ? sim.destaque : (sim.alternativa.situacao === 'ok' ? sim.alternativa : null);
  inpPreco.value = campo(d ? d.compra.preco : sim.precoAtual);
  inpCotas.value = d ? String(d.cotas) : String(Math.max(1, Math.round(sim.quantidade * 0.2)));
  const atualizar = () => {
    const preco = lerNumero(inpPreco.value);
    const r = resultadoSimulador(ctx, sim, { preco, cotas: lerNumero(inpCotas.value), alvo: lerNumero(inpAlvo.value), origem });
    saida.innerHTML = r.html;
    if (origem === 'cotas' && r.alvo != null) inpAlvo.value = campo(r.alvo);
    if (origem === 'alvo') inpCotas.value = r.cotas != null ? String(r.cotas) : '';
    form.querySelectorAll('[data-pm-preco]').forEach((b) => b.setAttribute('aria-pressed', String(preco != null && Math.abs(Number(b.dataset.pmPreco) - preco) < 0.005)));
  };
  inpPreco.addEventListener('input', atualizar);
  inpCotas.addEventListener('input', () => { origem = 'cotas'; atualizar(); });
  inpAlvo.addEventListener('input', () => { origem = 'alvo'; atualizar(); });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.querySelectorAll('[data-pm-preco]').forEach((b) => b.addEventListener('click', () => {
    inpPreco.value = campo(Number(b.dataset.pmPreco));
    atualizar();
  }));
  atualizar();
}

function ligarGrafico(doc, ctx, sim, dono) {
  const el = doc.getElementById('atPmGrafico');
  const g = pontosGraficoPm(sim);
  if (!el || !g) return;
  const m = moedaDo(ctx);
  const fmt = (v) => precoTxt(v, m);
  const nomes = { '-0.2': 'Comprando 20% mais barato', '-0.1': 'Comprando 10% mais barato', 0: 'Comprando hoje' };
  lembrarGrafico(dono, criarGraficoLinha(el, {
    altura: 240, zero: false, suave: true,
    aria: `Seu preço médio conforme a quantidade de cotas compradas, para cada preço de compra${m === 'USD' ? ' (em dólar)' : ''}`,
    eixoX: g.eixo.map((q) => ({ valor: q, rotulo: formatNumeroBR(q, 0) })),
    series: [
      ...g.series.map((s, i) => ({ id: `compra${i}`, nome: `${nomes[String(s.variacao)] || rotuloVariacao(s.variacao)} (${fmt(s.preco)})`, cor: i + 1, principal: false, largura: 2, valores: s.valores })),
      { id: 'hoje', nome: 'Cotação de hoje', cor: 'var(--_cn)', pontilhada: true, principal: false, valores: g.eixo.map(() => sim.precoAtual) },
    ],
    formatarY: (v) => formatNumeroBR(v, v < 20 ? 2 : 0),
    formatarValor: fmt,
    formatarX: (item) => `Comprando ${qtdTxt(item.valor)}`,
    tooltipExtra: (i) => {
      const q = g.eixo[i];
      return q > 0 ? [{ nome: 'Aporte comprando hoje', valor: aporteTxt(q * sim.precoAtual, m) }] : [];
    },
  }));
}

export function ligarSecaoPm(doc, ctx, dono) {
  const sim = simulacaoDoAtivo(ctx);
  if (!sim || !doc.getElementById('at-pm')) return;
  ligarGrafico(doc, ctx, sim, dono);
  ligarSimulador(doc, ctx, sim);
  // "Ver simulações" (card de cotação): rola até a seção sem mexer no #endereço (o # escolhe a aba da tela)
  doc.querySelectorAll('.at-pm-link').forEach((a) => a.addEventListener('click', (e) => {
    const alvo = doc.getElementById('at-pm');
    if (!alvo || typeof alvo.scrollIntoView !== 'function') return;
    e.preventDefault();
    const janela = doc.defaultView;
    const reduzir = !!(janela && janela.matchMedia && janela.matchMedia('(prefers-reduced-motion: reduce)').matches);
    alvo.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
    const titulo = doc.getElementById('at-pm-titulo');
    if (titulo) { titulo.setAttribute('tabindex', '-1'); titulo.focus({ preventScroll: true }); }
  }));
}
