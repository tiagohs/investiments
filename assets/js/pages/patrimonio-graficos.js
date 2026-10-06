/**
 * patrimonio-graficos.js - os gráficos da aba Patrimônio (e da Renda). 27/09/2026: SVG próprio com balão por data-i.
 * 06/10/2026 (Onda 3): migrados para a biblioteca assets/js/charts/ - este módulo agora só TRADUZ dado -> opções da biblioteca
 * (funções puras, testáveis sem DOM); quem desenha é organizacao-patrimonio.js via metas-graficos!montarGrafico.
 *  - opcoesHistoricoPatrimonio  patrimônio líquido de cada fim de ano (linha + área) e, embaixo, a composição
 *                               (ativos acima do zero, dívidas abaixo, barras empilhadas)
 *  - opcoesProjecaoPatrimonio   investimentos x meta; marcos e "chega em" aparecem no título do balão do mês
 *  - opcoesSalarios             salário contratual no tempo (degraus mês a mês); empresa e aumento no balão
 *  - barrasDivergentes          barras horizontais (positivo/negativo) - HTML marcador + montarBarrasDivergentes(raiz)
 * Removidos: SVG/balão/CSS antigos (.pt-svg, .pt-hit, .pt-tt, .pt-barras).
 */
import { formatBRL, formatNumeroBR, formatMesAno, formatBRL0, formatBRLMil } from '../format.js';
import { criarGraficoBarras } from '../charts/index.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único


const num = (v) => typeof v === 'number' && Number.isFinite(v);

export const mesAno = (m) => formatMesAno(m, { anoCurto: false, vazio: String(m || '') });
export const brl0 = (v) => formatBRL0(v);
/** "R$ 230 mil", "R$ 2,06 mi", "−R$ 90 mil". */
export const mil = (v) => formatBRLMil(v);
/** Eixo Y compacto: "230 mil", "2,1 mi", "−90 mil". */
export const eixoMil = (v) => (v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v) >= 1e6 ? `${formatNumeroBR(Math.abs(v) / 1e6, Math.abs(v) % 1e6 ? 1 : 0)} mi` : `${formatNumeroBR(Math.abs(v) / 1000, 0)} mil`}`);
const tituloDoItem = (item) => (item && item.titulo) || '';

// ---------------------------------------------------------------------------
// Histórico: ativos acima do zero, dívidas abaixo, linha do líquido
// ---------------------------------------------------------------------------

/** Componentes do histórico (cor = posição na paleta do kit, --chart-N). */
export const SERIES_HISTORICO = [
  { id: 'investimentos', nome: 'Investimentos e contas', cor: 1, lado: 1 },
  { id: 'imovel', nome: 'Apartamento (valor estimado)', cor: 3, lado: 1 },
  { id: 'fgts', nome: 'FGTS', cor: 6, lado: 1 },
  { id: 'financiamento', nome: 'Financiamento do apê', cor: 8, lado: -1 },
  { id: 'fies', nome: 'FIES', cor: 5, lado: -1 },
  { id: 'outrasDividas', nome: 'Outras dívidas', cor: 7, lado: -1 },
];

/** linhas = ctx.hist recortado ([{ ano, rotulo, hoje, liquido, investimentos, imovel, fgts, financiamento, fies, ... }]). -> spec de montarGrafico ou null. */
export function opcoesHistoricoPatrimonio(linhas) {
  const n = linhas.length;
  if (!n) return null;
  const titulo = (l) => `${l.hoje ? 'Hoje' : `31/12/${l.ano}`}${l.fonte === 's' ? ' (site)' : ''}`;
  const eixoX = linhas.map((l) => ({ rotulo: l.rotulo, titulo: titulo(l) }));
  const comp = SERIES_HISTORICO.filter((sr) => linhas.some((l) => (l[sr.id] || 0) > 0));
  return {
    tipo: 'linha+barras',
    opcoes: {
      series: [{ id: 'liquido', nome: 'Patrimônio líquido', valores: linhas.map((l) => l.liquido), principal: true, area: true, cor: 1, largura: 3 }],
      eixoX, formatarX: tituloDoItem, formatarValor: (v) => brl0(v), formatarY: eixoMil, altura: 220, zero: true,
      tooltipExtra: (i) => {
        const l = linhas[i];
        const extra = [];
        if (l.fgtsNoApe > 0) extra.push({ nome: 'FGTS → amortização do apê', valor: brl0(l.fgtsNoApe) });
        if (num(l.noAno)) extra.push({ nome: 'No ano', valor: `${l.noAno >= 0 ? '+' : '−'}${brl0(Math.abs(l.noAno))}` });
        return extra;
      },
      aria: `Patrimônio líquido no fim de cada ano: de ${mil(linhas[0].liquido)} em ${linhas[0].rotulo} para ${mil(linhas[n - 1].liquido)} hoje`,
    },
    aporte: {
      modo: 'empilhadas', categorias: eixoX, formatarX: tituloDoItem, formatarValor: (v) => brl0(Math.abs(v)), formatarY: eixoMil, altura: 250, tons: 'categorica',
      series: comp.map((sr) => ({ id: sr.id, nome: sr.nome, cor: sr.cor, valores: linhas.map((l) => (sr.lado < 0 ? -(l[sr.id] || 0) : (l[sr.id] || 0))) })),
      aria: 'Composição: o que você tinha (acima do zero) e o que devia (abaixo)',
    },
  };
}

// ---------------------------------------------------------------------------
// Projeção até a meta, com marcos
// ---------------------------------------------------------------------------

/**
 * pontos [{m, v}] (m = meses a partir de hoje); `quando(m)` -> { rotulo, ano, idade };
 * marcos [{ m, titulo, texto }]. -> spec de montarGrafico ({ tipo:'linha', opcoes }) ou null.
 */
export function opcoesProjecaoPatrimonio({ pontos, alvo, chegou, marcos = [], fim, quando }) {
  const pts = (pontos || []).filter((p) => p.m <= fim);
  if (pts.length < 2) return null;
  const marcosPorM = new Map();
  marcos.filter((mk) => mk.m > 0 && mk.m < fim).forEach((mk) => {
    const p = pts.reduce((a, b) => (Math.abs(b.m - mk.m) < Math.abs(a.m - mk.m) ? b : a));
    if (!marcosPorM.has(p.m)) marcosPorM.set(p.m, []);
    marcosPorM.get(p.m).push(mk);
  });
  const passoAnos = fim / 12 > 30 ? 10 : 5;
  const eixoX = pts.map((p) => {
    const q = quando(p.m);
    const partes = [`${q.rotulo}${q.idade != null ? ` · ${q.idade} anos` : ''}`];
    (marcosPorM.get(p.m) || []).forEach((mk) => partes.push(`marco: ${mk.titulo}${mk.texto ? ` (${mk.texto})` : ''}`));
    if (chegou != null && p.m === pts.reduce((a, b) => (Math.abs(b.m - chegou) < Math.abs(a.m - chegou) ? b : a)).m) partes.push('chega na meta');
    return { rotulo: p.m % 12 === 0 && q.ano % passoAnos === 0 ? String(q.ano) : '', titulo: partes.join(' · ') };
  });
  const q = chegou != null ? quando(chegou) : null;
  return {
    tipo: 'linha',
    opcoes: {
      series: [
        { id: 'inv', nome: 'Seus investimentos', valores: pts.map((p) => p.v), principal: true, area: true, cor: 1, largura: 3 },
        { id: 'alvo', nome: 'Patrimônio necessário', valores: pts.map(() => alvo), pontilhada: true, cor: 'var(--chart-axis)', largura: 1.5 },
      ],
      eixoX, formatarX: tituloDoItem, formatarValor: (v) => mil(v), formatarY: eixoMil, altura: 280, zero: true,
      tooltipExtra: (i) => (alvo ? [{ nome: 'Da meta', valor: `${formatNumeroBR((pts[i].v / alvo) * 100, 0)}%` }] : []),
      aria: `Projeção dos investimentos até a meta de ${mil(alvo)}${q ? `: chega em ${q.ano}` : ': não chega no período'}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Salário contratual no tempo (degraus)
// ---------------------------------------------------------------------------

const mesDeData = (d) => String(d).slice(0, 7);
const proxMes = (m) => { let [a, mm] = m.split('-').map(Number); mm += 1; if (mm > 12) { mm = 1; a += 1; } return `${a}-${String(mm).padStart(2, '0')}`; };

/** linha = [{ data, valor, empregador }] (muda quando o salário muda). -> spec de montarGrafico ({ tipo:'linha', opcoes }) ou null. */
export function opcoesSalarios(linha, contratos, { hoje } = {}) {
  if (!linha || !linha.length) return null;
  const fim = mesDeData(hoje || linha[linha.length - 1].data);
  const meses = [];
  for (let m = mesDeData(linha[0].data); m <= fim && meses.length < 900; m = proxMes(m)) meses.push(m);
  if (meses.length < 2) return null;
  let k = 0;
  const pts = meses.map((m) => {
    while (k + 1 < linha.length && mesDeData(linha[k + 1].data) <= m) k += 1;
    const aumento = mesDeData(linha[k].data) === m && k > 0 ? linha[k].valor / linha[k - 1].valor - 1 : null;
    return { mes: m, valor: linha[k].valor, empregador: linha[k].empregador || '', aumento };
  });
  const longo = pts.length > 30;
  const empregadorEm = (m) => ((contratos || []).find((c) => mesDeData(c.inicio) <= m && (!c.fim || mesDeData(c.fim) >= m)) || {}).empregador || '';
  return {
    tipo: 'linha',
    opcoes: {
      series: [{ id: 'sal', nome: 'Salário contratual', valores: pts.map((p) => p.valor), principal: true, area: true, cor: 1, largura: 3 }],
      eixoX: pts.map((p) => ({ rotulo: longo ? (p.mes.endsWith('-01') ? p.mes.slice(0, 4) : '') : mesAno(p.mes), titulo: `${mesAno(p.mes)}${empregadorEm(p.mes) || p.empregador ? ` · ${empregadorEm(p.mes) || p.empregador}` : ''}` })),
      formatarX: tituloDoItem, formatarValor: (v) => formatBRL(v), formatarY: eixoMil, altura: 200, zero: true,
      tooltipExtra: (i) => (pts[i].aumento != null ? [{ nome: 'Aumento', valor: `${pts[i].aumento >= 0 ? '+' : '−'}${formatNumeroBR(Math.abs(pts[i].aumento) * 100, 1)}%` }] : []),
      aria: `Salário contratual de ${formatBRL(linha[0].valor)} em ${mesAno(mesDeData(linha[0].data))} para ${formatBRL(linha[linha.length - 1].valor)} hoje`,
    },
  };
}

// ---------------------------------------------------------------------------
// Barras horizontais (positivo pra direita, negativo pra esquerda)
// ---------------------------------------------------------------------------

/**
 * Marcador HTML: `<div class="pt-barras-g" data-barras="{...}">`. Depois de pôr o HTML na página chame
 * montarBarrasDivergentes(raiz), que troca cada marcador por criarGraficoBarras (horizontal, verde/vermelho pelo sinal).
 */
export function barrasDivergentes(itens, { sinal = true } = {}) {
  return `<div class="pt-barras-g" data-barras="${esc(JSON.stringify({ itens: itens.map((i) => ({ nome: i.nome, valor: i.valor || 0 })), sinal }))}"></div>`;
}

export function montarBarrasDivergentes(raiz) {
  if (!raiz) return [];
  const feitos = [];
  raiz.querySelectorAll('.pt-barras-g[data-barras]').forEach((el) => {
    let d = null;
    try { d = JSON.parse(el.dataset.barras); } catch (e) { d = null; }
    el.removeAttribute('data-barras');
    if (!d || !d.itens || !d.itens.length) return;
    const fmt = (v) => `${d.sinal ? (v >= 0 ? '+' : '−') : ''}${brl0(Math.abs(v))}`;
    feitos.push(criarGraficoBarras(el, {
      modo: 'simples', orientacao: 'horizontal', corPorSinal: true, legenda: false, botaoTabela: false, altura: 44 + 34 * d.itens.length,
      categorias: d.itens.map((i) => i.nome), series: [{ id: 'valor', nome: 'Valor', valores: d.itens.map((i) => i.valor) }],
      formatarValor: fmt, formatarY: eixoMil, aria: `Barras: ${d.itens.map((i) => `${i.nome} ${fmt(i.valor)}`).join(', ')}`,
    }));
  });
  return feitos;
}

/**
 * Marcador HTML genérico de barras: `<div class="pt-barras-op" data-op="{...}">` (opções JSON de criarGraficoBarras; `pct:true` formata
 * os valores como porcentagem). montarBarrasDivergentes(raiz) também troca estes.
 */
export const barrasOp = (op) => `<div class="pt-barras-op" data-op="${esc(JSON.stringify(op))}"></div>`;

export function montarBarrasOp(raiz) {
  if (!raiz) return [];
  const feitos = [];
  raiz.querySelectorAll('.pt-barras-op[data-op]').forEach((el) => {
    let op = null;
    try { op = JSON.parse(el.dataset.op); } catch (e) { op = null; }
    el.removeAttribute('data-op');
    if (!op || !op.series || !op.series.length) return;
    const { pct, ...resto } = op;
    const fmt = pct ? (v) => `${formatNumeroBR(v * 100, 1)}%` : undefined;
    feitos.push(criarGraficoBarras(el, { botaoTabela: false, ...resto, ...(fmt ? { formatarValor: fmt, formatarY: (v) => `${formatNumeroBR(v * 100, 0)}%` } : {}) }));
  });
  return feitos;
}
