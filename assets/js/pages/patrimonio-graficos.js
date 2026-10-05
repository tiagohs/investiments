/**
 * patrimonio-graficos.js - 27/09/2026: os gráficos da aba Patrimônio (SVG
 * puro, sem biblioteca). Cada função devolve { svg, dicas }: `dicas[i]` é o
 * HTML do balão do alvo `data-i="i"` (organizacao-patrimonio.js mostra no
 * mousemove/foco). Cores pelos tokens de patrimonio.css (--pt-*), então
 * funcionam no claro e no escuro; texto sempre nas cores de texto.
 */
import { formatBRL, formatNumeroBR } from '../format.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const f1 = (v) => v.toFixed(1);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesAno = (m) => { const [a, mm] = String(m || '').split('-'); return a && mm ? `${MESES[Number(mm) - 1]}/${a}` : String(m || ''); };
export const brl0 = (v) => (num(v) ? `${v < -0.5 ? '−' : ''}${formatBRL(Math.abs(Math.round(v))).replace(/,00$/, '')}` : '—');
/** "R$ 230 mil", "R$ 2,06 mi", "−R$ 90 mil". */
export function mil(v) {
  if (!num(v)) return '—';
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${formatNumeroBR(a / 1e6, 2)} mi` : a >= 1000 ? `${formatNumeroBR(a / 1000, a >= 1e5 ? 0 : 1)} mil` : formatNumeroBR(a, 0);
  return `${v < 0 ? '−' : ''}R$ ${s}`;
}
const eixoMil = (v) => (v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v) >= 1e6 ? `${formatNumeroBR(Math.abs(v) / 1e6, Math.abs(v) % 1e6 ? 1 : 0)} mi` : `${formatNumeroBR(Math.abs(v) / 1000, 0)} mil`}`);
/** Passo "redondo" pra ~`n` divisões entre 0 e `max`. */
function passoRedondo(max, n = 4) {
  const bruto = max / n;
  const pot = 10 ** Math.floor(Math.log10(bruto || 1));
  return [1, 2, 2.5, 5, 10].map((k) => k * pot).find((p) => p >= bruto) || pot * 10;
}
const linhaTt = (rot, valor, cls = '') => `<div class="pt-tt-l${cls ? ` ${cls}` : ''}"><span>${esc(rot)}</span><b>${esc(valor)}</b></div>`;

// ---------------------------------------------------------------------------
// Histórico: ativos acima do zero, dívidas abaixo, linha do líquido
// ---------------------------------------------------------------------------

export const SERIES_HISTORICO = [
  { id: 'investimentos', nome: 'Investimentos e contas', cor: 'var(--pt-inv)', lado: 1 },
  { id: 'imovel', nome: 'Apartamento (valor estimado)', cor: 'var(--pt-imo)', lado: 1 },
  { id: 'fgts', nome: 'FGTS', cor: 'var(--pt-fgts)', lado: 1 },
  { id: 'financiamento', nome: 'Financiamento do apê', cor: 'var(--pt-div1)', lado: -1 },
  { id: 'fies', nome: 'FIES', cor: 'var(--pt-div2)', lado: -1 },
];

export function graficoHistorico(linhas, { largura = 720, altura = 300 } = {}) {
  const W = Math.max(320, largura);
  const H = altura;
  const mg = { t: 22, r: 12, b: 26, l: 52 };
  const n = linhas.length;
  if (!n) return { svg: '', dicas: [] };
  const acima = (l) => l.investimentos + l.imovel + l.fgts;
  const abaixo = (l) => l.financiamento + l.fies + (l.outrasDividas || 0);
  const maxA = Math.max(1, ...linhas.map(acima), ...linhas.map((l) => l.liquido));
  const maxD = Math.max(0, ...linhas.map(abaixo), ...linhas.map((l) => -l.liquido));
  const passo = passoRedondo(Math.max(maxA, maxD), 4);
  const topo = Math.ceil(maxA / passo) * passo;
  const fundo = -Math.ceil(maxD / passo) * passo;
  const y = (v) => mg.t + ((topo - v) / (topo - fundo || 1)) * (H - mg.t - mg.b);
  const bw = (W - mg.l - mg.r) / n;
  const larg = Math.min(44, bw * 0.56);
  const xc = (k) => mg.l + bw * k + bw / 2;
  let s = '';
  for (let v = fundo; v <= topo + 1e-6; v += passo) {
    s += `<line class="${Math.abs(v) < 1e-6 ? 'pt-zero' : 'pt-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>`;
    s += `<text class="pt-eixo" x="${mg.l - 8}" y="${f1(y(v) + 3.5)}" text-anchor="end">${esc(eixoMil(v))}</text>`;
  }
  const bloco = (x, v0, v1, cor) => {
    const a = y(Math.max(v0, v1)); const b = y(Math.min(v0, v1));
    const h = b - a - 2; // 2px de respiro entre segmentos
    return h > 0.5 ? `<rect x="${f1(x - larg / 2)}" y="${f1(a + 1)}" width="${f1(larg)}" height="${f1(h)}" rx="3" fill="${cor}"/>` : '';
  };
  linhas.forEach((l, k) => {
    const x = xc(k);
    let base = 0;
    SERIES_HISTORICO.filter((sr) => sr.lado > 0).forEach((sr) => { const v = l[sr.id] || 0; if (v > 0) { s += bloco(x, base, base + v, sr.cor); base += v; } });
    base = 0;
    [...SERIES_HISTORICO.filter((sr) => sr.lado < 0), { id: 'outrasDividas', cor: 'var(--pt-div2)' }].forEach((sr) => { const v = l[sr.id] || 0; if (v > 0) { s += bloco(x, base, base - v, sr.cor); base -= v; } });
    s += `<text class="pt-eixo${l.hoje ? ' pt-eixo-forte' : ''}" x="${f1(x)}" y="${H - 7}" text-anchor="middle">${esc(l.rotulo)}</text>`;
  });
  const pts = linhas.map((l, k) => [xc(k), y(l.liquido)]);
  s += `<path class="pt-linha-liq" d="${pts.map((p, k) => `${k ? 'L' : 'M'}${f1(p[0])},${f1(p[1])}`).join('')}"/>`;
  pts.forEach((p) => { s += `<circle class="pt-ponto-liq" cx="${f1(p[0])}" cy="${f1(p[1])}" r="4"/>`; });
  // rótulo só no primeiro, no maior e no último (nunca em todo ponto)
  const idxMax = linhas.reduce((m, l, k) => (l.liquido > linhas[m].liquido ? k : m), 0);
  [...new Set([0, idxMax, n - 1])].forEach((k) => {
    s += `<text class="pt-rot-v" x="${f1(pts[k][0])}" y="${f1(pts[k][1] - 10)}" text-anchor="middle">${esc(mil(linhas[k].liquido))}</text>`;
  });
  linhas.forEach((l, k) => { s += `<rect class="pt-hit" data-i="${k}" tabindex="0" x="${f1(mg.l + bw * k)}" y="${mg.t}" width="${f1(bw)}" height="${H - mg.t - mg.b}"><title>${esc(`${l.rotulo}: líquido ${mil(l.liquido)}`)}</title></rect>`; });
  const dicas = linhas.map((l) => `<b class="pt-tt-t">${esc(l.hoje ? 'Hoje' : `31/12/${l.ano}`)}${l.fonte === 's' ? ' <small>(site)</small>' : ''}</b>
    ${linhaTt('Investimentos e contas', brl0(l.investimentos))}${l.imovel ? linhaTt('Apartamento', brl0(l.imovel)) : ''}${l.fgts ? linhaTt('FGTS', brl0(l.fgts)) : ''}${l.fgtsNoApe > 0 ? linhaTt('FGTS → amortização do apê', brl0(l.fgtsNoApe)) : ''}
    ${l.financiamento ? linhaTt('Financiamento', `−${brl0(l.financiamento)}`) : ''}${l.fies ? linhaTt('FIES', `−${brl0(l.fies)}`) : ''}${l.outrasDividas ? linhaTt('Outras dívidas', `−${brl0(l.outrasDividas)}`) : ''}
    ${linhaTt('Líquido', brl0(l.liquido), 'pt-tt-total')}${num(l.noAno) ? linhaTt('No ano', `${l.noAno >= 0 ? '+' : '−'}${brl0(Math.abs(l.noAno))}`) : ''}`);
  const svg = `<svg class="pt-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Patrimônio no fim de cada ano: ativos acima do zero, dívidas abaixo, e a linha do patrimônio líquido - de ${mil(linhas[0].liquido)} em ${linhas[0].rotulo} para ${mil(linhas[n - 1].liquido)} hoje`)}">${s}</svg>`;
  return { svg, dicas };
}

// ---------------------------------------------------------------------------
// Projeção até a meta, com marcos
// ---------------------------------------------------------------------------

/**
 * pontos [{m, v}] (m = meses a partir de hoje); `quando(m)` -> { rotulo, ano, idade };
 * marcos [{ m, titulo, texto }].
 */
export function graficoProjecao({ pontos, alvo, chegou, marcos = [], fim, quando }, { largura = 720, altura = 290 } = {}) {
  const W = Math.max(320, largura);
  const H = altura;
  const mg = { t: 20, r: 16, b: 26, l: 56 };
  const pts = pontos.filter((p) => p.m <= fim);
  const maxV = Math.max(alvo * 1.1, ...pts.map((p) => p.v));
  const x = (m) => mg.l + (m / fim) * (W - mg.l - mg.r);
  const y = (v) => mg.t + (1 - v / maxV) * (H - mg.t - mg.b);
  let s = '';
  const passo = passoRedondo(maxV, 4);
  for (let v = 0; v <= maxV + 1e-6; v += passo) {
    s += `<line class="${v === 0 ? 'pt-zero' : 'pt-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="pt-eixo" x="${mg.l - 8}" y="${f1(y(v) + 3.5)}" text-anchor="end">${esc(eixoMil(v))}</text>`;
  }
  const anoIni = quando(0).ano;
  const passoAnos = fim / 12 > 30 ? 10 : 5;
  for (let a = Math.ceil(anoIni / passoAnos) * passoAnos; ; a += passoAnos) {
    const m = (a - anoIni) * 12 - (quando(0).mes0 || 0);
    if (m > fim) break;
    if (m < 0) continue;
    s += `<text class="pt-eixo" x="${f1(x(m))}" y="${H - 7}" text-anchor="middle">${a}</text>`;
  }
  s += `<line class="pt-alvo" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(alvo))}" y2="${f1(y(alvo))}"/>`;
  s += `<text class="pt-rot-m pt-rot-alvo" x="${mg.l + 6}" y="${f1(y(alvo) - 7)}">meta ${esc(mil(alvo))}</text>`;
  const area = `M${f1(x(0))},${f1(y(0))}${pts.map((p) => `L${f1(x(p.m))},${f1(y(p.v))}`).join('')}L${f1(x(pts[pts.length - 1].m))},${f1(y(0))}Z`;
  s += `<path class="pt-proj-area" d="${area}"/>`;
  s += `<path class="pt-proj-linha" d="${pts.map((p, k) => `${k ? 'L' : 'M'}${f1(x(p.m))},${f1(y(p.v))}`).join('')}"/>`;
  const valorEm = (m) => { const p = pts.reduce((a, b) => (Math.abs(b.m - m) < Math.abs(a.m - m) ? b : a)); return p.v; };
  let ultimoX = -1e9;
  let nivel = 0;
  marcos.filter((mk) => mk.m > 0 && mk.m < fim).sort((a, b) => a.m - b.m).forEach((mk) => {
    const v = valorEm(mk.m);
    nivel = x(mk.m) - ultimoX < 96 ? nivel + 1 : 0;
    ultimoX = x(mk.m);
    s += `<line class="pt-marco" x1="${f1(x(mk.m))}" x2="${f1(x(mk.m))}" y1="${f1(y(v))}" y2="${H - mg.b}"/>`;
    s += `<circle class="pt-marco-pt" cx="${f1(x(mk.m))}" cy="${f1(y(v))}" r="4"><title>${esc(`${mk.titulo}: ${mk.texto || ''}`)}</title></circle>`;
    const pertoDaChegada = chegou != null && Math.abs(x(mk.m) - x(chegou)) < 90 && Math.abs(y(v) - y(alvo)) < 30;
    s += `<text class="pt-rot-m" x="${f1(x(mk.m) - 7)}" y="${f1(pertoDaChegada ? y(v) + 30 : y(v) - 9 - nivel * 14)}" text-anchor="end">${esc(mk.titulo)}</text>`;
  });
  if (chegou != null && chegou <= fim) {
    const q = quando(chegou);
    s += `<circle class="pt-chegou" cx="${f1(x(chegou))}" cy="${f1(y(alvo))}" r="6"/><text class="pt-rot-v" x="${f1(Math.min(x(chegou), W - mg.r - 60))}" y="${f1(y(alvo) + 20)}" text-anchor="middle">${esc(`${q.ano}${q.idade != null ? ` · ${q.idade} anos` : ''}`)}</text>`;
  }
  // alvos de hover: uma faixa por ano
  const dicas = [];
  const faixa = 12;
  for (let m = 0, k = 0; m <= fim; m += faixa, k += 1) {
    const p = pts.reduce((a, b) => (Math.abs(b.m - m) < Math.abs(a.m - m) ? b : a));
    const q = quando(p.m);
    dicas.push(`<b class="pt-tt-t">${esc(q.rotulo)}${q.idade != null ? ` · ${esc(q.idade)} anos` : ''}</b>${linhaTt('Investimentos', mil(p.v))}${linhaTt('Da meta', `${formatNumeroBR((p.v / alvo) * 100, 0)}%`)}`);
    s += `<rect class="pt-hit" data-i="${k}" x="${f1(Math.max(mg.l, x(m - faixa / 2)))}" y="${mg.t}" width="${f1(Math.max(1, x(Math.min(fim, m + faixa / 2)) - Math.max(mg.l, x(m - faixa / 2))))}" height="${H - mg.t - mg.b}"/>`;
  }
  const q = chegou != null ? quando(chegou) : null;
  const svg = `<svg class="pt-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Projeção dos investimentos até a meta de ${mil(alvo)}${q ? `: chega em ${q.ano}` : ': não chega no período'}`)}">${s}</svg>`;
  return { svg, dicas };
}

// ---------------------------------------------------------------------------
// Salário contratual no tempo (degraus), empresas marcadas embaixo
// ---------------------------------------------------------------------------

export function graficoSalarios(linha, contratos, { largura = 520, altura = 190, hoje } = {}) {
  if (!linha.length) return { svg: '', dicas: [] };
  const W = Math.max(300, largura);
  const H = altura;
  const mg = { t: 16, r: 14, b: 40, l: 50 };
  const t = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).getTime();
  const t0 = t(linha[0].data);
  const t1 = Math.max(t(hoje || linha[linha.length - 1].data), t0 + 1);
  const maxV = Math.max(...linha.map((p) => p.valor)) * 1.12;
  const x = (d) => mg.l + ((t(d) - t0) / (t1 - t0)) * (W - mg.l - mg.r);
  const y = (v) => mg.t + (1 - v / maxV) * (H - mg.t - mg.b);
  let s = '';
  const passo = passoRedondo(maxV, 3);
  for (let v = 0; v <= maxV; v += passo) s += `<line class="${v === 0 ? 'pt-zero' : 'pt-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="pt-eixo" x="${mg.l - 7}" y="${f1(y(v) + 3.5)}" text-anchor="end">${v ? `${formatNumeroBR(v / 1000, 0)} mil` : '0'}</text>`;
  // faixas das empresas
  (contratos || []).forEach((c, k) => {
    const a = Math.max(mg.l, x(c.inicio)); const b = Math.min(W - mg.r, x(c.fim || hoje || linha[linha.length - 1].data));
    if (b <= a) return;
    s += `<rect class="pt-faixa${k % 2 ? ' alt' : ''}" x="${f1(a)}" y="${H - mg.b + 6}" width="${f1(Math.max(1, b - a - 2))}" height="6" rx="3"><title>${esc(c.empregador)}</title></rect>`;
    const nome = String(c.empregador).split(/\s+/).slice(0, 2).join(' ').slice(0, 18);
    if (b - a > nome.length * 6.4 + 8) s += `<text class="pt-eixo" x="${f1(a + 2)}" y="${H - mg.b + 24}">${esc(nome)}</text>`;
  });
  let d = '';
  linha.forEach((p, k) => { d += k ? `H${f1(x(p.data))}V${f1(y(p.valor))}` : `M${f1(x(p.data))},${f1(y(p.valor))}`; });
  d += `H${f1(x(hoje || linha[linha.length - 1].data))}`;
  s += `<path class="pt-sal-linha" d="${d}"/>`;
  const dicas = [];
  linha.forEach((p, k) => {
    s += `<circle class="pt-sal-pt" cx="${f1(x(p.data))}" cy="${f1(y(p.valor))}" r="3.5"/>`;
    const prox = linha[k + 1];
    const a = x(p.data); const b = prox ? x(prox.data) : x(hoje || p.data) + 8;
    s += `<rect class="pt-hit" data-i="${k}" x="${f1(a - 4)}" y="${mg.t}" width="${f1(Math.max(8, b - a))}" height="${H - mg.t - mg.b}"/>`;
    const ant = linha[k - 1];
    dicas.push(`<b class="pt-tt-t">${esc(mesAno(String(p.data).slice(0, 7)))}</b>${linhaTt('Salário', formatBRL(p.valor))}${ant ? linhaTt('Aumento', `${p.valor >= ant.valor ? '+' : '−'}${formatNumeroBR(Math.abs(p.valor / ant.valor - 1) * 100, 1)}%`) : ''}<div class="pt-tt-n">${esc(p.empregador || '')}</div>`);
  });
  const ult = linha[linha.length - 1];
  s += `<text class="pt-rot-v" x="${f1(Math.min(x(ult.data), W - mg.r - 40))}" y="${f1(y(ult.valor) - 9)}" text-anchor="middle">${esc(mil(ult.valor))}</text>`;
  return { svg: `<svg class="pt-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Salário contratual de ${formatBRL(linha[0].valor)} em ${mesAno(linha[0].data.slice(0, 7))} para ${formatBRL(ult.valor)} hoje`)}">${s}</svg>`, dicas };
}

// ---------------------------------------------------------------------------
// Barras horizontais (positivo pra direita, negativo pra esquerda)
// ---------------------------------------------------------------------------

export function barrasDivergentes(itens, { corPositiva = 'var(--pt-inv)', corNegativa = 'var(--pt-div1)', sinal = true } = {}) {
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.valor || 0)));
  const temNeg = itens.some((i) => i.valor < 0);
  return `<ul class="pt-barras${temNeg ? ' com-neg' : ''}">${itens.map((i) => {
    const w = (Math.abs(i.valor || 0) / max) * (temNeg ? 50 : 100);
    const pos = (i.valor || 0) >= 0;
    const left = temNeg ? (pos ? 50 : 50 - w) : 0;
    return `<li><span class="pt-barra-nome">${esc(i.nome)}</span><span class="pt-barra-trilho"><i style="left:${left.toFixed(2)}%;width:${w.toFixed(2)}%;background:${i.cor || (pos ? corPositiva : corNegativa)}"></i></span><b class="pt-barra-valor ${pos ? '' : 'bad'}">${sinal ? (pos ? '+' : '−') : ''}${esc(brl0(Math.abs(i.valor || 0)))}</b></li>`;
  }).join('')}</ul>`;
}
