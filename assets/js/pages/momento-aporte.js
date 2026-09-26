/**
 * momento-aporte.js - 26/09/2026: o bloco "Bom momento / Momento neutro /
 * Melhor esperar" que aparece embaixo de cada ativo - em Transações › Aportes
 * (aportes.js) e no Radar de oportunidades de Distribuições e Metas
 * (distribuicoes-metas.js). A leitura em si é aportes-calc.js!momentoAporte;
 * aqui ficam o HTML (um só, pras duas telas ficarem iguais) e os adaptadores
 * dos dados do Radar. Estilo: .momento* em shell.css.
 */
import { momentoAporte } from './aportes-calc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONE_SINAL = {
  bom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  ruim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  neutro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
};
const TOM_TEXTO = { bom: 'a favor', ruim: 'contra', neutro: 'neutro' };

function sinalHtml(x) {
  return `<li class="momento-sinal ${x.tom}"><span class="momento-ico" title="${TOM_TEXTO[x.tom]}">${ICONE_SINAL[x.tom]}</span><span class="momento-txt">${esc(x.texto)}</span></li>`;
}

/**
 * m = resultado de momentoAporte. Mostra os `visiveis` sinais que mais pesam;
 * o resto fica num "+N" que abre ali mesmo (sem JS: <details>).
 */
export function momentoHtml(m, { visiveis = 3 } = {}) {
  if (!m || !m.sinais || !m.sinais.length) return '';
  const primeiros = m.sinais.slice(0, visiveis);
  const resto = m.sinais.slice(visiveis);
  const mais = resto.length ? `
      <li class="momento-mais-li"><details class="momento-mais"><summary title="Ver os outros ${resto.length} sinais">+${resto.length}<span class="momento-sr"> sinais</span></summary><ul class="momento-sinais">${resto.map(sinalHtml).join('')}</ul></details></li>` : '';
  return `
    <div class="momento nivel-${m.nivel}">
      <span class="momento-selo" title="Leitura dos seus critérios (preço-teto, % desejado, preço médio...). Não é recomendação."><i aria-hidden="true"></i>${esc(m.rotulo)}</span>
      <ul class="momento-sinais">${primeiros.map(sinalHtml).join('')}${mais}</ul>
    </div>`;
}

const CLASSE_DA_TABELA_RADAR = { acoesNacionais: 'acoes', acoesInternacionais: 'acoesEua', fiis: 'fiis' };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Item do Radar (DistribuicoesMetas.gs!montarRadarOportunidades_) -> o formato de ativo que momentoAporte lê. */
export function ativoDoRadar(item, chaveTabela) {
  return {
    ticker: item.ativo,
    moeda: chaveTabela === 'acoesInternacionais' ? 'USD' : 'BRL',
    precoAtual: num(item.precoAtual),
    precoTeto: num(item.precoTeto),
    precoMedio: num(item.precoMedio),
    quantidade: num(item.carteiraAtual) > 0 ? 1 : 0, // o Radar não tem a quantidade; só importa se tem posição
    variacaoDia: num(item.variacaoDia),
    ultimoPago: null,
    radar: {
      pvp: num(item.pvp), pl: num(item.pl), descontoPl: typeof item.descontoPl === 'string' ? item.descontoPl : null,
      percentualDesejado: num(item.percentualDesejado), percentualAtual: num(item.percentualAtual), valorInvestir: num(item.valorInvestir),
    },
  };
}

function meta(l) {
  if (!l) return null;
  return { desejado: num(l.percentualDesejado), atual: num(l.percentualAtual), carteiraAtual: num(l.carteiraAtual), valorInvestir: num(l.valorInvestir) };
}

/** Resposta de action=distribuicoesMetas -> o mesmo "metas" que a tela de Aportes recebe do Apps Script. */
export function metasDaDistribuicao(resposta) {
  const r = resposta || {};
  const geral = (r.objetivos && r.objetivos.alocacaoGeral && r.objetivos.alocacaoGeral.tipos) || [];
  const rf = (r.objetivos && r.objetivos.alocacaoRendaFixa && r.objetivos.alocacaoRendaFixa.tipos) || [];
  const acoes = (r.splitsInternos && r.splitsInternos.acoes && r.splitsInternos.acoes.itens) || [];
  const achar = (lista, re) => lista.find((l) => re.test(String(l.tipo || '')));
  return {
    acoesENacionais: meta(achar(geral, /^a[cç][oõ]es/i)),
    fiis: meta(achar(geral, /^fii/i)),
    rendaFixa: meta(achar(geral, /^renda fixa/i)),
    rfEmergencial: meta(achar(rf, /emergencial/i)),
    rfLongoPrazo: meta(achar(rf, /^renda fixa/i)),
    acoes: meta(achar(acoes, /dividendo/i)),
    acoesEua: meta(achar(acoes, /internacion/i)),
  };
}

/** Momento de um item do Radar (tabela = acoesNacionais | acoesInternacionais | fiis). */
export function momentoDoRadar(item, chaveTabela, metas = null) {
  return momentoAporte(ativoDoRadar(item, chaveTabela), CLASSE_DA_TABELA_RADAR[chaveTabela], metas);
}
