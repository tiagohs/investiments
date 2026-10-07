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
import { formatBRL, formatUSD, formatNumeroBR, formatPercentFromFraction, formatPercentFromPoints, variacaoNula } from '../format.js';
import { urlAtivo, refAtivo } from '../link-ativo.js';
import { logoCirculoHtml, iniciaisDe } from './logo-circulo.js';
import { ehFundoRf, logoDoFundo } from '../fundos-rf.js'; // 07/10/2026: fundo de investimento na Renda Fixa (nome como título + logo)
import { htmlBotaoFavorito, idFavoritoDoAtivo } from './inicio-favoritos.js';
import {
  resolverVisao, calcularDistribuicaoPorClasse, calcularDistribuicaoRendaEmergencial, calcularDistribuicaoObjetivos, splitValorExibicao, ROTULO_TOTAL_HOME,
} from './inicio-calc.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { DESTINO_OBJETIVO, DESTINO_EMERGENCIAL, ROTULO_DESTINO_RF, destinoRendaFixa } from '../destino-renda-fixa.js'; // 07/10/2026
// 06/10/2026 (Onda 3, kit): KPI com contagem + sparkline, anel de composição e abas sublinhadas vêm da biblioteca/ui do kit.
import { criarAnel } from '../charts/index.js';
import { criarTabs } from '../ui/index.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const valorComDec = (texto) => { const { principal, dec } = splitValorExibicao(texto); return `${esc(principal)}${dec ? `<span class="dec">${esc(dec)}</span>` : ''}`; };
// 06/10/2026 (kit): variação sempre com ícone de tendência do sprite (nunca só cor nem só texto)
const icoTendencia = (tom) => `<svg class="ico" aria-hidden="true"><use href="#ico-${tom === 'bad' ? 'trending-down' : tom === 'good' ? 'trending-up' : 'trending-flat'}"/></svg>`;

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
  if (variacaoNula(pontos)) return `<span class="mkt-var na">${icoTendencia('na')}${esc(formatPercentFromPoints(0))}</span>`; // 05/10/2026 (A-04): 0,00% = neutro
  const sobe = pontos >= 0;
  return `<span class="mkt-var chip-tonal ${sobe ? 'good chip-good' : 'bad chip-bad'}">${icoTendencia(sobe ? 'good' : 'bad')}${esc(formatPercentFromPoints(Math.abs(pontos)).replace(/^\+/, ''))}</span>`;
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
  { id: 'total', rotulo: ROTULO_TOTAL_HOME }, // 07/10/2026: era "Patrimônio total" (agora é o hero); só a Início usa esta lista
  { id: 'longoPrazo', rotulo: 'Longo Prazo' },
  { id: 'nacional', rotulo: 'Nacional' },
  { id: 'rendaEmergencial', rotulo: 'Renda Emergencial' },
  { id: 'objetivos', rotulo: ROTULO_DESTINO_RF[DESTINO_OBJETIVO], soComObjetivos: true }, // 07/10/2026: só aparece quando há título 'Objetivo' na Carteira Renda Fixa
];
/** As visões que a Início mostra: 'Reservado para objetivos' só entra quando existe algo reservado (patrimonio.objetivos > 0). */
const visoesResumo_ = (patrimonio) => VISOES_RESUMO.filter((v) => !v.soComObjetivos || (num(patrimonio && patrimonio.objetivos) && patrimonio.objetivos > 0));
const CORES_EXTRA = ['--rf', '--fiis', '--usa', '--acoes', '--warn', '--na'];

/** Fatias da distribuição de uma visão (mesmas contas do resumo antigo). */
export function fatiasDaVisao(visaoId, { patrimonio, ativos, cambio } = {}) {
  if (visaoId === 'rendaEmergencial') {
    return calcularDistribuicaoRendaEmergencial(ativos).map((f, i) => ({ ...f, cor: `var(${CORES_EXTRA[i % CORES_EXTRA.length]})` }));
  }
  if (visaoId === 'objetivos') {
    return calcularDistribuicaoObjetivos(ativos).map((f, i) => ({ ...f, cor: `var(${CORES_EXTRA[i % CORES_EXTRA.length]})` }));
  }
  const pc = patrimonio && patrimonio.porClasse;
  const semReserva = visaoId === 'longoPrazo' || visaoId === 'nacional';
  const totaisPorClasse = pc ? {
    acoes: pc.acoes, fiis: pc.fiis, usa: pc.acoesEua,
    rf: semReserva ? pc.rendaFixa - (patrimonio.rendaEmergencial || 0) - (patrimonio.objetivos || 0) : pc.rendaFixa,
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

/** Cor (nº da paleta categórica, ordem fixa do site) de cada classe / rampa pros tipos de título da reserva. */
const COR_NUM_CLASSE = { 'Ações': 1, FIIs: 2, 'Renda Fixa': 3, 'Ações EUA': 4 };
const COR_NUM_TIPOS = [3, 2, 4, 1, 5, 6, 7, 8];

/** Fatias no formato da biblioteca (anel): { id, nome, valor, cor:nº }. Ações EUA mostra o valor em dólar no nome. */
export function fatiasParaAnel(fatias) {
  return fatias.map((f, i) => ({
    id: String(f.label),
    nome: num(f.valorUsd) && f.valorUsd > 0 ? `${f.label} · ${formatUSD(f.valorUsd)}` : f.label,
    valor: f.valor,
    cor: COR_NUM_CLASSE[f.label] || COR_NUM_TIPOS[i % COR_NUM_TIPOS.length],
  }));
}

/**
 * 06/10/2026 (revisão do Tiago): os 4 cartões KPI de total por carteira SAÍRAM (a informação já aparece nos gráficos de
 * Rentabilidade e no centro do anel). Fica só o cartão "Distribuição": ANEL (composição) + abas SUBLINHADAS pra trocar a visão
 * (= recorte dentro da tela). `container` é onde mora o cartão (#resumoDistribuicao). A aba escolhida e o anel sobrevivem a
 * "Atualizar dados": só os números mudam (o anel morfa). O 4º argumento (`distribuicaoEl`) é aceito por compatibilidade.
 */
export function renderResumoCompacto(doc, container, { patrimonio, ativos, cambio, ontem, historico } = {}, { distribuicaoEl = null } = {}) {
  container = distribuicaoEl || container;
  if (!container) return;
  if (!patrimonio) {
    destruirResumo_(container);
    container.innerHTML = '<p class="hint">Sem dado de patrimônio nesta chamada.</p>';
    return;
  }
  const visoes = visoesResumo_(patrimonio);
  const escolhida = visoes.some((v) => v.id === container._visao) ? container._visao : 'total';
  container._visao = escolhida;
  let rc = container._rc;
  // 07/10/2026: a aba "Reservado para objetivos" aparece/some conforme houver título 'Objetivo' - refaz o cartão quando isso muda
  if (rc && rc.qtdVisoes !== visoes.length) { destruirResumo_(container); rc = null; }
  if (!rc || !container.querySelector('.rc-distrib-card')) {
    destruirResumo_(container);
    container.textContent = '';
    const cartao = doc.createElement('section');
    cartao.className = 'card rc-distrib-card';
    cartao.setAttribute('aria-label', 'Distribuição do patrimônio');
    cartao.innerHTML = `
      <header class="card-cab rc-distrib-cab">
        <div><span class="card-rotulo">Distribuição</span><h3 class="card-titulo" id="rcTitulo"></h3></div>
        <small class="rc-distrib-por"></small>
      </header>
      <div class="rc-tabs"></div>
      <div class="rc-distrib" id="rcDistrib" role="tabpanel" aria-labelledby="rcTitulo"></div>`;
    container.appendChild(cartao);
    rc = { anel: null, tabs: null, cartao, qtdVisoes: visoes.length };
    container._rc = rc;
    container._rcLigado = true;
    rc.tabs = criarTabs(cartao.querySelector('.rc-tabs'), {
      variante: 'sublinhada', rotulo: 'Distribuição por visão do patrimônio', ativo: escolhida,
      itens: visoes.map((v) => ({ id: v.id, rotulo: v.rotulo })),
      aoMudar: (id) => { container._visao = id; desenharDistribuicao_(doc, container, container._dadosResumo); },
    });
  }
  container._dadosResumo = { patrimonio, ativos, cambio, ontem, historico };
  if (rc.tabs.obterAtivo() !== escolhida) rc.tabs.selecionar(escolhida);
  desenharDistribuicao_(doc, container, container._dadosResumo);
}

function destruirResumo_(container) {
  const rc = container._rc;
  if (!rc) return;
  if (rc.anel) rc.anel.destruir();
  container._rc = null;
}

/** Cartão "Distribuição": o anel da visão escolhida (atualiza a instância: as fatias morfam). */
function desenharDistribuicao_(doc, container, dados) {
  const rc = container._rc;
  if (!rc || !dados) return;
  const id = container._visao;
  const rotulo = (VISOES_RESUMO.find((v) => v.id === id) || VISOES_RESUMO[0]).rotulo;
  rc.cartao.querySelector('#rcTitulo').textContent = rotulo;
  rc.cartao.querySelector('.rc-distrib-por').textContent = (id === 'rendaEmergencial' || id === 'objetivos') ? 'por tipo de título' : 'por classe';
  const painel = rc.cartao.querySelector('#rcDistrib');
  const fatias = fatiasDaVisao(id, dados);
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (!fatias.length || !(total > 0)) {
    if (rc.anel) { rc.anel.destruir(); rc.anel = null; }
    painel.innerHTML = '<p class="hint">Sem dado suficiente pra montar a distribuição.</p>';
    return;
  }
  const dadosAnel = { fatias: fatiasParaAnel(fatias), centro: { rotulo }, aria: `Distribuição de ${rotulo} (${(id === 'rendaEmergencial' || id === 'objetivos') ? 'por tipo de título' : 'por classe'})` };
  if (rc.anel && painel.querySelector('svg')) rc.anel.atualizar(dadosAnel);
  else {
    if (rc.anel) rc.anel.destruir();
    painel.textContent = '';
    rc.anel = criarAnel(painel, { ...dadosAnel, formatarValor: formatBRL, tamanho: 208, espessura: 28, legenda: 'direita' });
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
  const inst = String(a.instituicao || '').replace(/\s+/g, ' ').trim().split(' ')[0];
  const nome = rf ? [a.indexador, { [DESTINO_EMERGENCIAL]: 'reserva', [DESTINO_OBJETIVO]: 'objetivo' }[destinoRendaFixa(a.marca)] || '', inst].filter(Boolean).join(' · ') : String(a.nome || '').trim();
  const fundo = rf && ehFundoRf(a.nome || ''); // 07/10/2026: o tipo do fundo é genérico ("Fundo de Investimento"): o título é o nome dele
  const titulo = rf ? String(fundo ? a.nome : (a.tipoInvestimento || a.ticker)) : a.ticker;
  const logo = rf ? logoCirculoHtml('', { extra: 'rf', iniciais: iniciaisDe(titulo, 'RF'), imagem: fundo ? logoDoFundo(a) : null }) : logoCirculoHtml(a.ticker);
  const temVar = num(a.variacaoDia);
  const nulo = temVar && variacaoNula(a.variacaoDia, { fracao: true }); // 05/10/2026 (A-04)
  const sobe = temVar && a.variacaoDia >= 0;
  const tom = nulo ? 'na' : (sobe ? 'good' : 'bad');
  const preco = rf ? formatBRL(a.valorAtualizado) : (a.classe === 'usa' ? formatUSD(a.precoAtual) : formatBRL(a.precoAtual));
  const posicao = valorPosicao(a, cambioUsd);
  // 06/10/2026 (kit): variação num chip tonal com ícone de tendência (cor + ícone + texto, nunca só cor)
  const variacao = temVar
    ? `<small class="al-var chip-tonal ${tom === 'na' ? '' : `chip-${tom}`} ${tom}">${icoTendencia(tom)}${esc(formatPercentFromFraction(Math.abs(a.variacaoDia)).replace(/^\+/, ''))}</small>`
    : '<small class="al-var na">—</small>';
  return `
    <li class="al-item">
      <a class="al-linha lista-item" href="${urlAtivo(refAtivo(a))}" data-classe="${a.classe}" title="${esc(`${titulo} · posição ${formatBRL(posicao)}`)}">
        ${logo}
        <span class="al-id lista-item-textos"><span class="al-ticker lista-item-nome">${esc(titulo)}${rf && a.vencimento ? ` <small>${esc(a.vencimento)}</small>` : ''}</span><span class="al-nome lista-item-sub">${esc(nome || NOME_CLASSE[a.classe] || '')}</span></span>
        <span class="al-preco"><b>${esc(preco)}</b>${variacao}</span>
        ${htmlBotaoFavorito(a, favorito)}
      </a>
    </li>`;
}

/** Desenha a lista (esvazia antes). Estrelas acesas vêm de container._favoritosIds (inicio-favoritos.js). */
export function renderListaAtivos(doc, container, ativos, opcoes = {}) {
  if (!container) return;
  const lista = filtrarListaAtivos(ativos, opcoes);
  const favs = container._favoritosIds;
  if (!lista.length) { container.innerHTML = '<li class="al-vazio hint">Nenhum ativo com esse filtro. Limpe a busca ou escolha "Todos".</li>'; return; }
  container.innerHTML = lista.map((a) => linhaAtivoHtml(a, { favorito: !!(favs && favs.has(idFavoritoDoAtivo(a))), cambioUsd: opcoes.cambioUsd })).join('');
}

/**
 * Liga busca, filtro de classe (abas sublinhadas do kit) e ordem da lista. Idempotente: chamado de novo
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
  if (abas && !estado.tabs) {
    estado.tabs = criarTabs(abas, {
      variante: 'sublinhada', rotulo: 'Filtrar por classe', ativo: estado.classe,
      itens: CLASSES_LISTA.map((c) => ({ id: c.id, rotulo: c.rotulo, contagem: '' })),
      aoMudar: (id) => { estado.classe = id; lista._desenharLista(); },
    });
  }
  const desenhar = () => {
    renderListaAtivos(doc, lista, estado.ativos, estado);
    if (estado.tabs) CLASSES_LISTA.forEach((c) => estado.tabs.atualizarItem(c.id, { contagem: contar(c.id) }));
    const total = lista.querySelectorAll('.al-item').length;
    if (contador) contador.textContent = `${total} ${total === 1 ? 'ativo' : 'ativos'}`;
    lista.classList.toggle('recolhida', !estado.expandida && total > 10);
    if (mais) {
      mais.hidden = total <= 10;
      mais.textContent = estado.expandida ? 'Mostrar menos' : `Mostrar todos (${total})`;
      mais.setAttribute('aria-expanded', String(!!estado.expandida));
    }
  };
  lista._desenharLista = desenhar;
  if (!lista._listaLigada) {
    lista._listaLigada = true;
    if (busca) busca.addEventListener('input', () => { estado.busca = busca.value; desenhar(); });
    if (ordem) ordem.addEventListener('change', () => { estado.ordem = ordem.value; desenhar(); });
    if (mais) mais.addEventListener('click', () => { estado.expandida = !estado.expandida; desenhar(); });
  }
  desenhar();
}
