/**
 * inicio-intradia.js - 26/09/2026 (Tiago: "os ativos favoritos... já vir
 * mostrando o gráfico de variação do dia" + índices mais compactos).
 *
 * O "gráfico do dia" (tipo o card do Google Finance): linha do preço ao longo
 * do pregão, área suave embaixo, e uma linha pontilhada no fechamento de
 * ontem - verde se está acima, vermelho se está abaixo. A série vem de
 * apps-script/Intradia.gs (action=intradia); aqui só o desenho (SVG puro,
 * sem biblioteca) e o "de quem é cada chave".
 */

/** Índices/câmbio da faixa de mercado, na ordem da tela. */
export const CHAVES_MERCADO = ['IBOV', 'IFIX', 'SPX', 'USD', 'EUR'];

/** Chave de intradia de um ativo de "Meus ativos" (renda fixa não tem pregão: null). */
export function chaveIntradiaDoAtivo(ativo) {
  if (!ativo || !ativo.ticker) return null;
  if (ativo.classe === 'acoes' || ativo.classe === 'fiis' || ativo.classe === 'usa') return `${ativo.classe}:${String(ativo.ticker).trim().toUpperCase()}`;
  return null;
}

let seqGradiente = 0;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Geometria do gráfico (pura, testável): { linha, area, yAnterior, sobe, xFim }.
 * O eixo x é o pregão inteiro (abertura -> fechamento): no meio do dia a linha
 * ocupa só o começo, igual aos sites de cotação.
 */
export function geometriaIntradia(serie, { largura = 240, altura = 60, margem = 4 } = {}) {
  if (!serie || !Array.isArray(serie.t) || !Array.isArray(serie.v) || serie.t.length < 2 || serie.t.length !== serie.v.length) return null;
  const duracao = Math.max(1, (num(serie.fim) && num(serie.inicio) ? (serie.fim - serie.inicio) / 60 : serie.t[serie.t.length - 1]));
  const anterior = num(serie.fechamentoAnterior) ? serie.fechamentoAnterior : null;
  const valores = anterior == null ? serie.v : [...serie.v, anterior];
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (max - min < 1e-9) { min -= 1; max += 1; }
  const folga = (max - min) * 0.08;
  min -= folga; max += folga;
  const x = (t) => Math.max(0, Math.min(largura, (t / duracao) * largura));
  const y = (v) => margem + (1 - (v - min) / (max - min)) * (altura - 2 * margem);
  const pts = serie.t.map((t, i) => [x(t), y(serie.v[i])]);
  const r = (n) => Math.round(n * 10) / 10;
  const linha = pts.map((p, i) => `${i ? 'L' : 'M'}${r(p[0])},${r(p[1])}`).join('');
  const area = `${linha}L${r(pts[pts.length - 1][0])},${altura}L${r(pts[0][0])},${altura}Z`;
  const ultimo = serie.v[serie.v.length - 1];
  const sobe = anterior == null ? ultimo >= serie.v[0] : ultimo >= anterior;
  return { linha, area, yAnterior: anterior == null ? null : r(y(anterior)), sobe, xFim: r(pts[pts.length - 1][0]), yFim: r(pts[pts.length - 1][1]) };
}

/**
 * SVG do gráfico do dia. Estica na largura do espaço (preserveAspectRatio
 * none + traço que não engorda); a cor vem do CSS (.intradia-svg.sobe/.desce
 * -> var(--good)/var(--bad)).
 */
export function svgIntradia(serie, { largura = 240, altura = 60, titulo = '' } = {}) {
  const g = geometriaIntradia(serie, { largura, altura });
  if (!g) return '';
  seqGradiente += 1;
  const id = `intradiaGrad${seqGradiente}`;
  const tituloHtml = titulo ? `<title>${String(titulo).replace(/[<&]/g, '')}</title>` : '';
  return `<svg class="intradia-svg ${g.sobe ? 'sobe' : 'desce'}" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" role="img" aria-label="${String(titulo || 'Gráfico do dia').replace(/"/g, '')}">${tituloHtml}
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <path d="${g.area}" fill="url(#${id})" stroke="none"/>
    ${g.yAnterior == null ? '' : `<line x1="0" x2="${largura}" y1="${g.yAnterior}" y2="${g.yAnterior}" class="intradia-anterior" vector-effect="non-scaling-stroke"/>`}
    <path d="${g.linha}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/** "hoje" quando o pregão é de hoje; senão "25/09" (fim de semana, feriado, antes da abertura). */
export function rotuloDiaIntradia(serie, hojeISO) {
  if (!serie || !serie.dia) return '';
  if (hojeISO && serie.dia === hojeISO) return 'hoje';
  return `${serie.dia.slice(8, 10)}/${serie.dia.slice(5, 7)}`;
}

/** Preenche todos os [data-intradia] dentro de `raiz` com o que tiver em `series`. */
export function preencherIntradia(raiz, series, { hojeISO = '' } = {}) {
  if (!raiz || !series) return;
  raiz.querySelectorAll('[data-intradia]').forEach((slot) => {
    const chave = slot.getAttribute('data-intradia');
    if (!(chave in series)) return;
    const serie = series[chave];
    if (!serie) { slot.classList.add('sem-dado'); slot.innerHTML = ''; return; }
    const dia = rotuloDiaIntradia(serie, hojeISO);
    slot.classList.remove('sem-dado');
    slot.innerHTML = `${svgIntradia(serie, { titulo: `Variação do dia${dia && dia !== 'hoje' ? ` (pregão de ${dia})` : ''}` })}${dia && dia !== 'hoje' ? `<span class="intradia-dia">pregão ${dia}</span>` : ''}`;
    slot.dataset.intradiaDia = serie.dia || '';
  });
}
