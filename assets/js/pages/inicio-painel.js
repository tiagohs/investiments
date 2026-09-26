/**
 * inicio-painel.js - 26/09/2026: a Início reorganizada pra ocupar menos
 * espaço (Tiago: "ela tem coisas muito grandes... diminuir a área dos cards
 * de índices... Carteira - minha situação atual numa maneira que ocupe menos
 * espaço, mas que não seja bagunçada... Proventos e Meus Ativos numa coluna
 * lateral, dividindo com os gráficos").
 *
 *  - renderFaixaMercado: índices e câmbio numa faixa fina (nome, valor,
 *    variação e o gráfico do dia), em vez de 5 cartões grandes.
 *  - renderResumoCompacto: as 4 visões de patrimônio num cartão só - cada
 *    visão é uma "aba" com o valor e a variação desde o último fechamento;
 *    a aba escolhida mostra a distribuição numa barra única.
 *  - renderListaAtivos/wireListaAtivos: "Meus ativos" como lista enxuta
 *    (tipo a watchlist dos sites de cotação) pra coluna lateral - com busca,
 *    filtro por classe, ordem (alta/queda/posição) e a estrela de favorito.
 * As contas (distribuição, visões, valor de posição) são as de inicio.js.
 */
import { formatBRL, formatUSD, formatNumeroBR, formatPercentFromFraction, formatPercentFromPoints } from '../format.js';
import { urlAtivo, refAtivo } from '../link-ativo.js';
import { logoAtivoHtml, logoRendaFixaHtml } from './carteiras-classe-comum.js';
import { htmlBotaoFavorito, idFavoritoDoAtivo } from './inicio-favoritos.js';
import {
  resolverVisao, calcularDistribuicaoPorClasse, calcularDistribuicaoRendaEmergencial, splitValorExibicao,
} from './inicio.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const valorComDec = (texto) => { const { principal, dec } = splitValorExibicao(texto); return `${esc(principal)}${dec ? `<span class="dec">${esc(dec)}</span>` : ''}`; };
const SETA = { sobe: '▲', desce: '▼' };

// ---------------------------------------------------------------------------
// Faixa de mercado
// ---------------------------------------------------------------------------

/** Itens da faixa, na ordem da tela - os números são os da planilha (iguais ao resto do app). */
export function itensFaixaMercado({ indices, cambio } = {}) {
  const itens = [];
  const i = indices || {};
  if (i.ibovespa) itens.push({ chave: 'IBOV', nome: 'Ibovespa', valor: i.ibovespa.valor, variacaoPontos: i.ibovespa.variacaoDia, href: 'https://www.google.com/finance/quote/IBOV:INDEXBVMF' });
  if (i.ifix) itens.push({ chave: 'IFIX', nome: 'IFIX', valor: i.ifix.valor, variacaoPontos: i.ifix.variacaoDia, href: 'https://www.google.com/finance/quote/IFIX:INDEXBVMF' });
  if (i.spx) itens.push({ chave: 'SPX', nome: 'S&P 500', valor: i.spx.valor, variacaoPontos: i.spx.variacaoDia, href: 'https://www.google.com/finance/quote/.INX:INDEXSP' });
  if (cambio && num(cambio.usd)) itens.push({ chave: 'USD', nome: 'Dólar', valor: cambio.usd, simbolo: 'US$', href: 'https://www.google.com/finance/quote/USD-BRL' });
  if (cambio && num(cambio.eur)) itens.push({ chave: 'EUR', nome: 'Euro', valor: cambio.eur, simbolo: '€', href: 'https://www.google.com/finance/quote/EUR-BRL' });
  return itens;
}

function variacaoHtml(pontos) {
  if (!num(pontos)) return '';
  const sobe = pontos >= 0;
  return `<span class="mkt-var ${sobe ? 'good' : 'bad'}"><i aria-hidden="true">${sobe ? SETA.sobe : SETA.desce}</i>${esc(formatPercentFromPoints(Math.abs(pontos)).replace(/^\+/, ''))}</span>`;
}

export function renderFaixaMercado(doc, container, dados = {}) {
  if (!container) return;
  const itens = itensFaixaMercado(dados);
  if (!itens.length) { container.innerHTML = '<p class="hint">Sem dado de índices/câmbio nesta chamada.</p>'; return; }
  container.innerHTML = itens.map((it) => `
    <a class="mkt" href="${it.href}" target="_blank" rel="noopener" data-mkt="${it.chave}" title="${esc(it.nome)} no Google Finance">
      <span class="mkt-nome">${esc(it.nome)}</span>
      ${variacaoHtml(it.variacaoPontos) || '<span class="mkt-var na" data-mkt-var></span>'}
      <span class="mkt-valor">${it.simbolo ? `<small>${esc(it.simbolo)}</small> ` : ''}${valorComDec(formatNumeroBR(it.valor))}</span>
      <span class="mkt-spark intradia-slot" data-intradia="${it.chave}" aria-hidden="true"></span>
    </a>`).join('');
}

/** Câmbio não tem variação na planilha: usa a do gráfico do dia, quando chega. */
export function completarFaixaComIntradia(container, series) {
  if (!container || !series) return;
  container.querySelectorAll('[data-mkt-var]').forEach((el) => {
    const chave = el.closest('[data-mkt]') && el.closest('[data-mkt]').dataset.mkt;
    const serie = chave ? series[chave] : null;
    if (!serie || !num(serie.variacao)) return;
    const html = variacaoHtml(serie.variacao * 100);
    const tmp = el.ownerDocument.createElement('span');
    tmp.innerHTML = html;
    el.replaceWith(tmp.firstElementChild);
  });
}

// ---------------------------------------------------------------------------
// Carteira - situação atual (compacto)
// ---------------------------------------------------------------------------

const VISOES_RESUMO = [
  { id: 'total', rotulo: 'Patrimônio total' },
  { id: 'longoPrazo', rotulo: 'Longo Prazo' },
  { id: 'nacional', rotulo: 'Nacional' },
  { id: 'rendaEmergencial', rotulo: 'Renda Emergencial' },
];
const CORES_EXTRA = ['--rf', '--fiis', '--usa', '--acoes', '--warn', '--na'];

/** Fatias da distribuição de uma visão (mesmas contas do resumo antigo). */
export function fatiasDaVisao(visaoId, { patrimonio, ativos, cambio } = {}) {
  if (visaoId === 'rendaEmergencial') {
    return calcularDistribuicaoRendaEmergencial(ativos).map((f, i) => ({ ...f, cor: `var(${CORES_EXTRA[i % CORES_EXTRA.length]})` }));
  }
  const pc = patrimonio && patrimonio.porClasse;
  const semReserva = visaoId === 'longoPrazo' || visaoId === 'nacional';
  const totaisPorClasse = pc ? {
    acoes: pc.acoes, fiis: pc.fiis, usa: pc.acoesEua,
    rf: semReserva ? pc.rendaFixa - (patrimonio.rendaEmergencial || 0) : pc.rendaFixa,
  } : null;
  return calcularDistribuicaoPorClasse(ativos, {
    cambioUsd: cambio && cambio.usd, totaisPorClasse, excluirEmergencial: semReserva, excluirInternacional: visaoId === 'nacional',
  });
}

/** { valor, ontem, diferenca, variacao, dataOntem } de uma visão. */
export function numerosDaVisao(visaoId, patrimonio, ontem) {
  const { valor } = resolverVisao(patrimonio, visaoId);
  const anterior = ontem && num(ontem[visaoId]) ? ontem[visaoId] : null;
  const ok = num(valor) && num(anterior) && anterior !== 0;
  return {
    valor: num(valor) ? valor : null,
    ontem: anterior,
    diferenca: ok ? valor - anterior : null,
    variacao: ok ? (valor - anterior) / anterior : null,
    dataOntem: ontem && ontem.data ? ontem.data : null,
  };
}

function deltaVisaoHtml(n, { compacto = false } = {}) {
  if (!num(n.variacao)) return '<span class="rc-delta na">—</span>';
  const sobe = n.variacao >= 0;
  const dia = n.dataOntem ? `${n.dataOntem.slice(8, 10)}/${n.dataOntem.slice(5, 7)}` : '';
  const pct = formatPercentFromFraction(Math.abs(n.variacao)).replace(/^\+/, '');
  const dif = formatBRL(Math.abs(n.diferenca));
  return `<span class="rc-delta ${sobe ? 'good' : 'bad'}" title="Desde o fechamento de ${dia}: ${sobe ? '+' : '−'}${dif}"><i aria-hidden="true">${sobe ? SETA.sobe : SETA.desce}</i>${compacto ? pct : `${sobe ? '+' : '−'}${dif} · ${pct}`}${!compacto && dia ? ` <small>desde ${dia}</small>` : ''}</span>`;
}

function distribuicaoHtml(fatias, { cambio } = {}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (!fatias.length || !(total > 0)) return '<p class="hint">Sem dado suficiente pra montar a distribuição.</p>';
  const pct = (f) => (f.valor / total) * 100;
  const barra = fatias.map((f) => `<span class="rc-seg" style="width:${pct(f).toFixed(3)}%;background:${f.cor}" title="${esc(f.label)}: ${formatNumeroBR(pct(f), 1)}%"></span>`).join('');
  const legenda = fatias.map((f) => {
    const valor = num(f.valorUsd) && f.valorUsd > 0 ? formatUSD(f.valorUsd) : formatBRL(f.valor);
    const titulo = num(f.valorUsd) && f.valorUsd > 0 ? ` title="${esc(formatBRL(f.valor))}${cambio && num(cambio.usd) ? ` · câmbio ${esc(formatNumeroBR(cambio.usd))}` : ''}"` : '';
    return `<li${titulo}><i style="background:${f.cor}" aria-hidden="true"></i><span class="rc-leg-nome">${esc(f.label)}</span><b>${formatNumeroBR(pct(f), 1)}%</b><span class="rc-leg-valor">${esc(valor)}</span></li>`;
  }).join('');
  return `<div class="rc-barra" role="img" aria-label="${esc(fatias.map((f) => `${f.label} ${formatNumeroBR(pct(f), 1)}%`).join(', '))}">${barra}</div><ul class="rc-legenda">${legenda}</ul>`;
}

/**
 * Um cartão só: 4 abas-número (Total grande + Longo Prazo, Nacional e Renda
 * Emergencial) e, embaixo, a distribuição da aba escolhida numa barra única.
 * A aba escolhida sobrevive aos redesenhos (Atualizar dados).
 */
export function renderResumoCompacto(doc, container, { patrimonio, ativos, cambio, ontem } = {}) {
  if (!container) return;
  if (!patrimonio) { container.innerHTML = '<p class="hint">Sem dado de patrimônio nesta chamada.</p>'; return; }
  const escolhida = VISOES_RESUMO.some((v) => v.id === container._visao) ? container._visao : 'total';
  container._visao = escolhida;
  const abas = VISOES_RESUMO.map((v) => {
    const n = numerosDaVisao(v.id, patrimonio, ontem);
    const ativa = v.id === escolhida;
    return `
      <button type="button" class="rc-visao rc-visao-${v.id}${ativa ? ' ativa' : ''}" data-visao="${v.id}" role="tab" aria-selected="${ativa}" aria-controls="rcDistrib">
        <span class="rc-rotulo">${esc(v.rotulo)}</span>
        <span class="rc-valor">${num(n.valor) ? valorComDec(formatBRL(n.valor)) : '—'}</span>
        ${deltaVisaoHtml(n, { compacto: v.id !== 'total' })}
      </button>`;
  }).join('');
  const rotulo = VISOES_RESUMO.find((v) => v.id === escolhida).rotulo;
  container.innerHTML = `
    <div class="rc">
      <div class="rc-visoes" role="tablist" aria-label="Visões do patrimônio">${abas}</div>
      <div class="rc-distrib" id="rcDistrib" role="tabpanel">
        <div class="rc-distrib-cab"><span>Distribuição · <b>${esc(rotulo)}</b></span>${escolhida === 'rendaEmergencial' ? '<small>por tipo de título</small>' : '<small>por classe</small>'}</div>
        ${distribuicaoHtml(fatiasDaVisao(escolhida, { patrimonio, ativos, cambio }), { cambio })}
      </div>
    </div>`;
  container._dadosResumo = { patrimonio, ativos, cambio, ontem };
  if (!container._rcLigado) {
    container._rcLigado = true;
    container.addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('.rc-visao');
      if (!b || !container.contains(b)) return;
      container._visao = b.dataset.visao;
      renderResumoCompacto(doc, container, container._dadosResumo);
      const foco = container.querySelector(`.rc-visao[data-visao="${b.dataset.visao}"]`);
      if (foco) foco.focus();
    });
  }
}

// ---------------------------------------------------------------------------
// Meus ativos - lista enxuta
// ---------------------------------------------------------------------------

export const CLASSES_LISTA = [
  { id: 'todos', rotulo: 'Todos' }, { id: 'acoes', rotulo: 'Ações' }, { id: 'fiis', rotulo: 'FIIs' },
  { id: 'usa', rotulo: 'EUA' }, { id: 'rf', rotulo: 'RF' },
];
const COR_CLASSE = { acoes: '--acoes', fiis: '--fiis', usa: '--usa', rf: '--rf' };
const NOME_CLASSE = { acoes: 'Ação', fiis: 'FII', usa: 'EUA', rf: 'Renda Fixa' };

/** Valor da posição em R$ (mesma regra do resumo). */
export function valorPosicao(ativo, cambioUsd) {
  if (ativo.classe === 'rf') return num(ativo.valorAtualizado) ? ativo.valorAtualizado : 0;
  const qtd = num(ativo.quantidade) ? ativo.quantidade : 0;
  if (ativo.classe === 'usa') {
    if (num(ativo.precoAtualBRL)) return ativo.precoAtualBRL * qtd;
    return num(cambioUsd) && num(ativo.precoAtual) ? ativo.precoAtual * qtd * cambioUsd : 0;
  }
  return num(ativo.precoAtual) ? ativo.precoAtual * qtd : 0;
}

/** Filtra/busca/ordena. ordem: carteira (como veio) | alta | queda | posicao. */
export function filtrarListaAtivos(ativos, { classe = 'todos', busca = '', ordem = 'carteira', cambioUsd = null } = {}) {
  const b = String(busca || '').trim().toLowerCase();
  let lista = (ativos || []).filter((a) => (classe === 'todos' || a.classe === classe)
    && (!b || `${a.ticker} ${a.nome || ''} ${a.tipoInvestimento || ''}`.toLowerCase().includes(b)));
  const variacao = (a) => (num(a.variacaoDia) ? a.variacaoDia : null);
  if (ordem === 'alta' || ordem === 'queda') {
    const sinal = ordem === 'alta' ? -1 : 1;
    lista = [...lista].sort((x, y) => {
      const vx = variacao(x); const vy = variacao(y);
      if (vx == null && vy == null) return 0;
      if (vx == null) return 1;
      if (vy == null) return -1;
      return sinal * (vx - vy);
    });
  } else if (ordem === 'posicao') {
    lista = [...lista].sort((x, y) => valorPosicao(y, cambioUsd) - valorPosicao(x, cambioUsd));
  }
  return lista;
}

function linhaAtivoHtml(a, { favorito = false, cambioUsd = null } = {}) {
  const rf = a.classe === 'rf';
  const logo = rf ? logoRendaFixaHtml(a) : logoAtivoHtml(a.ticker);
  const temVar = num(a.variacaoDia);
  const sobe = temVar && a.variacaoDia >= 0;
  const preco = rf ? formatBRL(a.valorAtualizado) : (a.classe === 'usa' ? formatUSD(a.precoAtual) : formatBRL(a.precoAtual));
  const inst = String(a.instituicao || '').replace(/\s+/g, ' ').trim().split(' ')[0];
  const nome = rf ? [a.indexador, a.marca === 'emergencial' ? 'reserva' : '', inst].filter(Boolean).join(' · ') : String(a.nome || '').trim();
  const titulo = rf ? String(a.tipoInvestimento || a.ticker) : a.ticker;
  const posicao = valorPosicao(a, cambioUsd);
  return `
    <li class="al-item">
      <a class="al-linha" href="${urlAtivo(refAtivo(a))}" data-classe="${a.classe}" title="${esc(`${titulo} · posição ${formatBRL(posicao)}`)}">
        <span class="al-logo" style="--cor:var(${COR_CLASSE[a.classe] || '--na'})">${logo}</span>
        <span class="al-id"><span class="al-ticker">${esc(titulo)}${rf && a.vencimento ? ` <small>${esc(a.vencimento)}</small>` : ''}</span><span class="al-nome">${esc(nome || NOME_CLASSE[a.classe] || '')}</span></span>
        <span class="al-preco"><b>${esc(preco)}</b>${temVar ? `<small class="${sobe ? 'good' : 'bad'}">${sobe ? SETA.sobe : SETA.desce} ${esc(formatPercentFromFraction(Math.abs(a.variacaoDia)).replace(/^\+/, ''))}</small>` : '<small class="na">—</small>'}</span>
        ${htmlBotaoFavorito(a, favorito)}
      </a>
    </li>`;
}

/** Desenha a lista (esvazia antes). Estrelas acesas vêm de container._favoritosIds (inicio-favoritos.js). */
export function renderListaAtivos(doc, container, ativos, opcoes = {}) {
  if (!container) return;
  const lista = filtrarListaAtivos(ativos, opcoes);
  const favs = container._favoritosIds;
  if (!lista.length) { container.innerHTML = '<li class="al-vazio hint">Nenhum ativo com esse filtro.</li>'; return; }
  container.innerHTML = lista.map((a) => linhaAtivoHtml(a, { favorito: !!(favs && favs.has(idFavoritoDoAtivo(a))), cambioUsd: opcoes.cambioUsd })).join('');
}

/**
 * Liga busca, filtro de classe e ordem da lista. Idempotente: chamado de novo
 * (Atualizar dados) só troca os ativos e redesenha com o filtro atual.
 * els = { lista, abas, busca, ordem, contador, mais }
 */
export function wireListaAtivos(doc, els, ativos, { cambioUsd = null } = {}) {
  const { lista, abas, busca, ordem, contador, mais } = els || {};
  if (!lista) return;
  const estado = lista._estadoLista || (lista._estadoLista = { classe: 'todos', busca: '', ordem: 'carteira', expandida: false });
  estado.ativos = ativos || [];
  estado.cambioUsd = cambioUsd;
  const contar = (c) => estado.ativos.filter((a) => c === 'todos' || a.classe === c).length;
  const desenhar = () => {
    renderListaAtivos(doc, lista, estado.ativos, estado);
    if (abas) abas.querySelectorAll('[data-classe]').forEach((b) => {
      const ativa = b.dataset.classe === estado.classe;
      b.classList.toggle('active', ativa);
      b.setAttribute('aria-pressed', String(ativa));
      const n = b.querySelector('.al-n');
      if (n) n.textContent = String(contar(b.dataset.classe));
    });
    const total = lista.querySelectorAll('.al-item').length;
    if (contador) contador.textContent = `${total} ${total === 1 ? 'ativo' : 'ativos'}`;
    lista.classList.toggle('recolhida', !estado.expandida && total > 10);
    if (mais) {
      mais.hidden = total <= 10;
      mais.textContent = estado.expandida ? 'Mostrar menos' : `Mostrar todos (${total})`;
    }
  };
  lista._desenharLista = desenhar;
  if (!lista._listaLigada) {
    lista._listaLigada = true;
    if (abas) abas.addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('[data-classe]');
      if (!b) return;
      estado.classe = b.dataset.classe;
      desenhar();
    });
    if (busca) busca.addEventListener('input', () => { estado.busca = busca.value; desenhar(); });
    if (ordem) ordem.addEventListener('change', () => { estado.ordem = ordem.value; desenhar(); });
    if (mais) mais.addEventListener('click', () => { estado.expandida = !estado.expandida; desenhar(); });
  }
  desenhar();
}
