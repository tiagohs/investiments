// assets/js/pages/carteiras-proventos.js
//
// 25/09/2026 (Tiago): proventos nas Carteiras (Visão geral, Ações, FIIs e
// Ações Internacionais):
//  - no hero: quanto entrou NO MÊS e nos ÚLTIMOS 12 MESES (mesma janela
//    da tela Proventos: este mês + os 11 anteriores);
//  - abaixo da tabela de ativos: a área "Proventos do mês" da Início
//    (recebidos + a receber), só da carteira da página.
// Os números saem do histórico da Início (campos proventos* por dia de
// pagamento - os mesmos do gráfico e da tela Proventos) e a lista, de
// home.proventosAnunciados (Proventos.gs!montarProventosAnunciados_).
import { renderProventosAnunciados } from './inicio-proventos.js';
import { resolveSiteRootUrl } from '../shell.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (am) => `${MESES[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`;
function somarMeses(anoMes, n) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Valor de provento do dia no campo pedido; 'proventosAcoesEuaUsd' = reais ÷ câmbio do dia. */
function valorDoDia(p, campo) {
  if (campo === 'proventosAcoesEuaUsd') {
    return typeof p.proventosAcoesEua === 'number' && typeof p.cambioUsd === 'number' && p.cambioUsd > 0 ? p.proventosAcoesEua / p.cambioUsd : 0;
  }
  return typeof p[campo] === 'number' && Number.isFinite(p[campo]) ? p[campo] : 0;
}

/**
 * { mes, doze, desdeInicio, mesAtual, inicio12 } - soma dos campos de
 * proventos no mês do último ponto do histórico (hoje), nos 12 meses que
 * terminam nele e desde o início. null sem histórico.
 */
export function proventosMesE12Meses(historico, campos) {
  if (!Array.isArray(historico) || !historico.length || !campos || !campos.length) return null;
  const mesAtual = String(historico[historico.length - 1].data || '').slice(0, 7);
  if (!mesAtual) return null;
  const inicio12 = somarMeses(mesAtual, -11);
  let mes = 0;
  let doze = 0;
  let desdeInicio = 0;
  historico.forEach((p) => {
    const m = String(p.data || '').slice(0, 7);
    const v = campos.reduce((s, c) => s + valorDoDia(p, c), 0);
    if (!v) return;
    desdeInicio += v;
    if (m >= inicio12 && m <= mesAtual) doze += v;
    if (m === mesAtual) mes += v;
  });
  const r2 = (n) => Math.round(n * 100) / 100;
  return { mes: r2(mes), doze: r2(doze), desdeInicio: r2(desdeInicio), mesAtual, inicio12 };
}

/**
 * Stat do hero: "Proventos" = R$ do mês, e embaixo "R$ ... em 12 meses".
 * O total desde o início fica no "i" (entra no Resultado desde o início).
 * `botaoInfoHtml` vem de carteiras-classe-comum.js (evita import circular).
 */
export function statProventosHero(historico, campos, { formatar, botaoInfoHtml }) {
  const p = proventosMesE12Meses(historico, campos);
  if (!p) return null;
  const info = botaoInfoHtml
    ? botaoInfoHtml(`${formatar(p.mes)} recebidos em ${rotuloMes(p.mesAtual)}; ${formatar(p.doze)} de ${rotuloMes(p.inicio12)} a ${rotuloMes(p.mesAtual)} (mesma janela da tela Proventos). Desde o início: ${formatar(p.desdeInicio)}.`, { pequeno: true })
    : '';
  return {
    label: 'Proventos no mês',
    valor: `${formatar(p.mes)}${info}<span class="cc-resumo-stat-sub">${formatar(p.doze)} em 12 meses</span>`,
    dados: p,
  };
}

/** HTML da área "Proventos do mês" (vai logo abaixo da tabela de ativos). */
export function secaoProventosCarteiraHtml(id) {
  let href = '../proventos/index.html';
  try { href = new URL('proventos/index.html', resolveSiteRootUrl()).href; } catch (e) { /* mantém o relativo */ }
  return `
    <section class="proventos-secao cc-proventos" id="${id}" hidden>
      <div class="area-header" style="margin-top:22px">
        <h2>Proventos do mês</h2>
        <a class="hint cc-proventos-link" href="${href}">agenda completa em Proventos →</a>
      </div>
      <div class="prov-card prov-corpo"></div>
    </section>`;
}

/**
 * Desenha a área com os proventos da(s) classe(s) da página. `classes`
 * null = todas (Visão geral). Some quando não há nada no mês.
 */
export function renderProventosCarteira(doc, secao, proventosAnunciados, { classes = null, hoje = new Date() } = {}) {
  if (!secao) return;
  const d = proventosAnunciados || {};
  const filtrar = (lista) => (Array.isArray(lista) ? lista.filter((p) => !classes || classes.includes(p.classe)) : []);
  renderProventosAnunciados(doc, secao, {
    aReceber: filtrar(d.aReceber),
    recebidosNoMes: filtrar(d.recebidosNoMes),
    pagosNaoLancados: filtrar(d.pagosNaoLancados),
  }, { hoje });
}
