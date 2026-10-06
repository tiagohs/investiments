/**
 * inicio-intradia.js - 26/09/2026 (Tiago: "os ativos favoritos... já vir
 * mostrando o gráfico de variação do dia" + índices mais compactos).
 *
 * O "gráfico do dia" (tipo o card do Google Finance): linha do preço ao longo
 * do pregão, área suave embaixo - verde se está acima do fechamento de ontem,
 * vermelho se está abaixo. A série vem de apps-script/Intradia.gs
 * (action=intradia); aqui só o "de quem é cada chave" e a ponte pra
 * sparkline da biblioteca de gráficos (assets/js/charts, 06/10/2026 - Onda 3).
 */
import { criarSparkline } from '../charts/index.js';


/** Índices/câmbio da faixa de mercado, na ordem da tela. */
export const CHAVES_MERCADO = ['IBOV', 'IFIX', 'SPX', 'USD', 'EUR'];

/** Chave de intradia de um ativo de "Meus ativos" (renda fixa não tem pregão: null). */
export function chaveIntradiaDoAtivo(ativo) {
  if (!ativo || !ativo.ticker) return null;
  if (ativo.classe === 'acoes' || ativo.classe === 'fiis' || ativo.classe === 'usa') return `${ativo.classe}:${String(ativo.ticker).trim().toUpperCase()}`;
  return null;
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Quantos pontos (regulares) tem o pregão inteiro no gráfico do dia. */
export const PONTOS_PREGAO = 60;

/**
 * Valores do gráfico do dia num eixo REGULAR do pregão inteiro (abertura -> fechamento): no meio do dia os últimos
 * pontos ficam `null` e a linha ocupa só o começo, igual aos sites de cotação. { valores, referencia, sobe } ou null
 * quando a série não serve (menos de 2 pontos).
 */
export function valoresIntradia(serie, { pontos = PONTOS_PREGAO } = {}) {
  if (!serie || !Array.isArray(serie.t) || !Array.isArray(serie.v) || serie.t.length < 2 || serie.t.length !== serie.v.length) return null;
  const duracao = Math.max(1, (num(serie.fim) && num(serie.inicio) ? (serie.fim - serie.inicio) / 60 : serie.t[serie.t.length - 1]));
  const ultimoT = serie.t[serie.t.length - 1];
  const valores = [];
  let j = 0;
  for (let k = 0; k < pontos; k += 1) {
    const tk = (k / (pontos - 1)) * duracao;
    if (tk > ultimoT + duracao / (pontos - 1) / 2) { valores.push(null); continue; }
    while (j + 1 < serie.t.length && serie.t[j + 1] <= tk) j += 1;
    valores.push(serie.v[j]);
  }
  // o último ponto real sempre aparece (a linha termina no preço de agora)
  const ultimoIdx = valores.reduce((acc, v, i) => (v == null ? acc : i), -1);
  if (ultimoIdx >= 0) valores[ultimoIdx] = serie.v[serie.v.length - 1];
  const referencia = num(serie.fechamentoAnterior) ? serie.fechamentoAnterior : 'inicio';
  const ultimo = serie.v[serie.v.length - 1];
  const ref = num(referencia) ? referencia : serie.v[0];
  return { valores, referencia, sobe: ultimo >= ref };
}

/** "hoje" quando o pregão é de hoje; senão "25/09" (fim de semana, feriado, antes da abertura). */
export function rotuloDiaIntradia(serie, hojeISO) {
  if (!serie || !serie.dia) return '';
  if (hojeISO && serie.dia === hojeISO) return 'hoje';
  return `${serie.dia.slice(8, 10)}/${serie.dia.slice(5, 7)}`;
}

/**
 * Desenha (ou atualiza) o gráfico do dia dentro de `el` com a sparkline da biblioteca. Devolve true se desenhou,
 * false se a série não serve (o chamador mostra o estado vazio). `altura` em px.
 */
export function desenharIntradia(el, serie, { altura = 32, titulo = 'Variação do dia' } = {}) {
  const v = valoresIntradia(serie);
  if (!v) {
    if (el._spark) { el._spark.destruir(); el._spark = null; }
    el.textContent = '';
    return false;
  }
  const dados = { valores: v.valores, referencia: v.referencia, aria: titulo };
  if (el._spark && el.querySelector('svg')) el._spark.atualizar(dados);
  else {
    if (el._spark) el._spark.destruir();
    el.textContent = '';
    el._spark = criarSparkline(el, { altura, area: true, pontoFinal: true, margem: 4, ...dados });
  }
  return true;
}

/** Preenche todos os [data-intradia] dentro de `raiz` com o que tiver em `series`. */
export function preencherIntradia(raiz, series, { hojeISO = '' } = {}) {
  if (!raiz || !series) return;
  raiz.querySelectorAll('[data-intradia]').forEach((slot) => {
    const chave = slot.getAttribute('data-intradia');
    if (!(chave in series)) return;
    const serie = series[chave];
    if (!serie) { slot.classList.add('sem-dado'); if (slot._spark) { slot._spark.destruir(); slot._spark = null; } slot.innerHTML = ''; return; }
    const dia = rotuloDiaIntradia(serie, hojeISO);
    const antigo = slot.querySelector('.intradia-dia');
    if (antigo) antigo.remove();
    let areaSpark = slot.querySelector('.intradia-spark');
    if (!areaSpark) {
      slot.textContent = '';
      areaSpark = slot.ownerDocument.createElement('span');
      areaSpark.className = 'intradia-spark';
      slot.appendChild(areaSpark);
    }
    const ok = desenharIntradia(areaSpark, serie, { titulo: `Variação do dia${dia && dia !== 'hoje' ? ` (pregão de ${dia})` : ''}` });
    slot.classList.toggle('sem-dado', !ok);
    if (ok && dia && dia !== 'hoje') {
      const rot = slot.ownerDocument.createElement('span');
      rot.className = 'intradia-dia';
      rot.textContent = `pregão ${dia}`;
      slot.appendChild(rot);
    }
    slot.dataset.intradiaDia = serie.dia || '';
    slot.dataset.intradiaDir = ok ? (valoresIntradia(serie).sobe ? 'sobe' : 'desce') : '';
  });
}
