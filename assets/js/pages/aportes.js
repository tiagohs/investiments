// assets/js/pages/aportes.js
//
// 26/09/2026: aba "Aportes" da tela Transações - o dia de compra como um
// carrinho (Tiago: "Eu seleciono o tipo, os ativos, coloco a quantidade.
// Quero uma coluna com o valor de quanto paguei pela última vez naquele
// ativo... Após eu confirmar as compras, fica um 'aguardando valores
// finais'... Após isso, confirma a compra... cancelar um processo de compra
// ou deletar uma que acabei confirmando, mas não cheguei a comprar").
//
// Etapas: 1. Carrinho (fica só neste navegador até confirmar) ->
// 2. Aguardando valores finais (já na planilha, aux_aportes) -> 3. Concluído.
// Independente da aba Transações da planilha: o "investido por mês" no fim
// da aba vem das transações de verdade, só pra comparar.
//
// As contas ficam em aportes-calc.js; aqui só desenha e liga os eventos.
// Redesenho parcial de propósito: digitar uma quantidade atualiza a linha e
// o carrinho sem refazer a prateleira (o cursor não pula).
//
// 27/09/2026: "Aportes realizados" (mapa de compras, Tiago: "eu tenho uma
// tabela do lado da outra em 'Compras de Investimento'...") entra logo
// acima de "Novo aporte" - o desenho e as contas ficam em aportes-mapa.js/
// aportes-mapa-calc.js, aqui só a montagem na aba e os eventos (reaproveita
// o delegated click listener de ligarAportes). E, no "Novo aporte", os
// ativos de Ações EUA passam a mostrar cotação/último pago/subtotal também
// em reais (câmbio de hoje; o último pago também no câmbio DO DIA da
// compra, vindo de Aportes.gs!ativosParaAporte_ -> ultimoPago.cambioDia).

import { formatBRL, formatNumeroBR } from '../format.js';
import { logoAtivoHtml, logoRendaFixaHtml, statusVies } from './carteiras-classe-comum.js';
import { urlAtivoTicker } from '../link-ativo.js';
import {
  CLASSES_APORTE, NOME_CLASSE_APORTE, MESES_CURTOS, MESES_LONGOS,
  chaveItem, carrinhoVazio, definirQuantidade, definirValorRf, removerDoCarrinho, atualizarPrecos,
  itensDoCarrinho, totaisCarrinho, aporteDoCarrinho, carrinhoDoAporte, carrinhoRepetindo,
  finalDoItem, concluirAporte, totalAporte, classesDoAporte, anosDoResumo, mesesDoAno, aportesPorMes, momentoAporte, totalRanking,
  mesclarAporteComCarrinho, mesclarAportes, aguardandoDoDia,
} from './aportes-calc.js';
import { momentoHtml, carregarMetasMomento, carregarMacroMomento } from './momento-aporte.js';
// 05/10/2026: Tesouro por valor/quantidade (aportes-rf-calc.js), fluxo das Ações EUA (aportes-eua*.js),
// merge de aportes do mesmo dia (aportes-calc.js!mesclarAporteComCarrinho)
import { ehTesouro, puDoTitulo, dataCotacao, compraPorValor, compraPorQuantidade, acharTesouroHoje, minimoTesouro, textoMinimo } from './aportes-rf-calc.js';
import { gravarTaxasRemessa, sugerirDivisaoCaixa, caixaValido } from './aportes-eua-calc.js';
import { estadoInicialEua, euaFluxoHtml, remessaResultadoHtml, remessaDoEstado, necessidadeHtml, lerNumeroCampo as lerNumeroEua } from './aportes-eua.js';
import { getToken } from '../auth.js';
import { estadoInicialMapa, mapaHtml, popoverMapaHtml, dadosDoMapa, ativoDaCarteira } from './aportes-mapa.js';
import { celulaMapa } from './aportes-mapa-calc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dm = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : '—');
const dma = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '—');
const usd = (v) => (typeof v === 'number' && Number.isFinite(v) ? `US$ ${formatNumeroBR(v)}` : '—');
const dinheiro = (v, moeda) => (moeda === 'USD' ? usd(v) : formatBRL(v));
const precoTxt = (v, moeda) => (typeof v === 'number' && v > 0 ? `${moeda === 'USD' ? 'US$' : 'R$'} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 4 : 2 })}` : '—');
const qtdTxt = (q) => (typeof q === 'number' ? formatNumeroBR(q, q % 1 ? 4 : 0) : '—');
const pct = (v, casas = 1) => `${v > 0 ? '+' : ''}${formatNumeroBR(v, casas)}%`;
const corClasse = (id) => (CLASSES_APORTE.find((c) => c.id === id) || {}).cor || '--ink-muted';
const dotHtml = (classe) => `<span class="tx-dot" style="background:var(${corClasse(classe)})"></span>`;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
/** Linha pequena mono com a conversão em reais, no mesmo estilo do "no dia"/"hoje" do popover do mapa. */
const brlHtml = (v, rotulo = '', dica = '') => `<small class="tx-brl"${dica ? ` title="${dica}"` : ''}>R$ ${formatNumeroBR(v)}${rotulo ? ` <span class="tx-fraco">${rotulo}</span>` : ''}</small>`;
const lerNumeroCampo = (s) => {
  const t = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if (!t) return null;
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};
const numCampo = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '');
// preço/valor no campo: sempre com centavos ("21,10", não "21,1")
const dinheiroCampo = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false }) : '');
/** Logo do item do aporte: o do ativo, ou a imagem genérica do Tesouro/LCI pela renda fixa. */
const logoItemHtml = (it) => (it.classe === 'rendaFixa'
  ? logoRendaFixaHtml({ indexador: /selic/i.test(it.ativo) ? 'SELIC' : (/ipca/i.test(it.ativo) ? 'IPCA' : ''), tipoInvestimento: it.ativo, instituicao: it.instituicao })
  : logoAtivoHtml(it.ativo));

const ICONE_CARRINHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h3l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L21.5 7H6.4"/></svg>';
const ICONE_LIXO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>';

// ---------------------------------------------------------------------------
// Etapas (topo da aba)
// ---------------------------------------------------------------------------

function etapasHtml(estado, dados) {
  const nCarrinho = Object.keys(estado.carrinho.itens).length;
  const aguardando = dados.aportes.filter((a) => a.status === 'aguardando').length;
  const mes = (dados.hoje || '').slice(0, 7);
  const concluidosMes = dados.aportes.filter((a) => a.status === 'concluido' && a.data.slice(0, 7) === mes).length;
  const etapa = (n, alvo, titulo, sub, destaque = '') => `
    <a class="tx-etapa${destaque}" href="#${alvo}" data-rolar="${alvo}">
      <span class="tx-etapa-n">${n}</span>
      <span class="tx-etapa-txt"><b>${titulo}</b><small>${sub}</small></span>
    </a>`;
  return `
    <nav class="tx-etapas" aria-label="Etapas do aporte">
      ${etapa(1, 'txNovoAporte', 'Carrinho', nCarrinho ? `${nCarrinho} ativo${nCarrinho > 1 ? 's' : ''}` : 'vazio', nCarrinho ? ' ativa' : '')}
      <span class="tx-etapa-linha" aria-hidden="true"></span>
      ${etapa(2, 'txAndamento', 'Aguardando valores finais', aguardando ? `${aguardando} aporte${aguardando > 1 ? 's' : ''}` : 'nenhum', aguardando ? ' atencao' : '')}
      <span class="tx-etapa-linha" aria-hidden="true"></span>
      ${etapa(3, 'txHistorico', 'Concluído', `${concluidosMes} em ${MESES_LONGOS[Number(mes.slice(5, 7)) - 1] || 'este mês'}`)}
    </nav>`;
}

// ---------------------------------------------------------------------------
// 2. Aguardando valores finais
// ---------------------------------------------------------------------------

function inputHtml(attrs, valor, { decimal = true, rotulo = '', prefixo = '' } = {}) {
  return `<label class="tx-campo">${prefixo ? `<span class="tx-campo-pre">${prefixo}</span>` : ''}<input type="text" inputmode="${decimal ? 'decimal' : 'numeric'}" ${attrs} value="${esc(valor)}" aria-label="${esc(rotulo)}" autocomplete="off"></label>`;
}

/** Total de um item em dólar: US$ e, embaixo, em reais pelo câmbio de hoje (é o dia da compra). */
function totalPagoHtml(valor, moeda, cambio) {
  return `${dinheiro(valor, moeda)}${moeda === 'USD' && cambio > 0 ? brlHtml(valor * cambio, `câmbio ${formatNumeroBR(cambio, 2)}`) : ''}`;
}

function linhaAndamentoHtml(a, it, i, dig, cambio) {
  const f = finalDoItem(it, dig);
  const nomeAtivo = it.classe === 'rendaFixa' ? `<b>${esc(it.ativo)}</b><small>${esc(it.instituicao || 'Renda Fixa')}</small>` : `<b>${esc(it.ativo)}</b><small>${NOME_CLASSE_APORTE[it.classe]}</small>`;
  if (it.classe === 'rendaFixa') {
    return `
      <tr data-i="${i}">
        <td class="esq"><span class="tx-ativo">${logoItemHtml(it)}<span class="tx-ativo-nome">${nomeAtivo}</span></span></td>
        <td data-rot="Planejado">${formatBRL(it.valorPlanejado)}</td>
        <td data-rot="Qtd final" class="tx-td-vazio">—</td>
        <td data-rot="Aplicado">${inputHtml(`data-final="valor" data-aporte="${esc(a.id)}" data-i="${i}"`, dinheiroCampo(dig.valor != null ? dig.valor : (it.valorFinal != null ? it.valorFinal : it.valorPlanejado)), { rotulo: `Valor aplicado em ${it.ativo}`, prefixo: 'R$' })}</td>
        <td data-rot="Total pago" class="tx-final-total" data-total-i="${i}">${formatBRL(f.valor)}</td>
      </tr>`;
  }
  const pre = it.moeda === 'USD' ? 'US$' : 'R$';
  return `
    <tr data-i="${i}">
      <td class="esq"><span class="tx-ativo">${logoAtivoHtml(it.ativo)}<span class="tx-ativo-nome">${nomeAtivo}</span></span></td>
      <td data-rot="Planejado"><span class="tx-planejado">${qtdTxt(it.qtdPlanejada)} × ${precoTxt(it.precoPlanejado, it.moeda)}</span><small>${dinheiro(it.valorPlanejado, it.moeda)}${it.moeda === 'USD' && cambio > 0 ? ` ≈ ${formatBRL(it.valorPlanejado * cambio)}` : ''}</small></td>
      <td data-rot="Qtd final">${inputHtml(`data-final="qtd" data-aporte="${esc(a.id)}" data-i="${i}"`, numCampo(dig.qtd != null ? dig.qtd : (it.qtdFinal != null ? it.qtdFinal : it.qtdPlanejada)), { decimal: it.moeda === 'USD', rotulo: `Quantidade comprada de ${it.ativo}` })}</td>
      <td data-rot="Preço pago">${inputHtml(`data-final="preco" data-aporte="${esc(a.id)}" data-i="${i}"`, dinheiroCampo(dig.preco != null ? dig.preco : (it.precoFinal != null ? it.precoFinal : it.precoPlanejado)), { rotulo: `Preço pago em ${it.ativo}`, prefixo: pre })}</td>
      <td data-rot="Total pago" class="tx-final-total" data-total-i="${i}">${totalPagoHtml(f.valor, it.moeda, cambio)}</td>
    </tr>`;
}

function rodapeAndamentoHtml(a, estado, cambio) {
  if (estado.confirmando === `cancelar:${a.id}`) {
    return `
      <div class="tx-confirmar tx-confirmar-perigo">
        <span>Cancelar este aporte? Ele sai da lista e da planilha (nada muda nas suas transações).</span>
        <span class="tx-botoes"><button type="button" class="btn tx-btn-perigo" data-acao="cancelar-sim" data-id="${esc(a.id)}">Sim, cancelar</button><button type="button" class="btn btn-ghost" data-acao="voltar">Voltar</button></span>
      </div>`;
  }
  const dig = estado.digitados[a.id] || {};
  const planejado = totalAporte(a, 'planejado', cambio);
  const pago = totalAporte(a, 'final', cambio, dig);
  const dif = pago - planejado;
  return `
    <div class="tx-andamento-rodape">
      <div class="tx-andamento-totais" data-totais="${esc(a.id)}">
        <span>Planejado <b>${formatBRL(planejado)}</b></span>
        <span class="tx-seta" aria-hidden="true">→</span>
        <span>Pago <b>${formatBRL(pago)}</b></span>
        ${Math.abs(dif) >= 0.01 ? `<span class="tx-dif ${dif > 0 ? 'bad' : 'good'}">${dif > 0 ? '+' : '−'}${formatBRL(Math.abs(dif))}</span>` : ''}
      </div>
      <span class="tx-botoes">
        <button type="button" class="btn btn-primary" data-acao="concluir" data-id="${esc(a.id)}">Concluir compra</button>
      </span>
    </div>`;
}

/** 05/10/2026: aportes aguardando no MESMO dia (o carrinho confirmado duas vezes já gravou dois): oferece juntar. */
function avisoDuplicadosHtml(lista) {
  const porDia = {};
  lista.forEach((a) => { (porDia[a.data] = porDia[a.data] || []).push(a); });
  const dias = Object.keys(porDia).filter((d) => porDia[d].length > 1).sort();
  if (!dias.length) return '';
  return dias.map((d) => `
    <div class="tx-aviso aviso tx-aviso-juntar" role="status">
      <span>Há <b>${porDia[d].length} aportes de ${dma(d)}</b> aguardando valores finais. Dá pra juntar num só (a mesma ação soma a quantidade).</span>
      <button type="button" class="btn btn-ghost tx-btn-sm" data-acao="juntar-dia" data-dia="${esc(d)}">Juntar os aportes de ${dm(d)}</button>
    </div>`).join('');
}

function andamentoHtml(estado, dados) {
  const lista = dados.aportes.filter((a) => a.status === 'aguardando');
  if (!lista.length) return '';
  return `
    <section class="tx-secao" id="txAndamento" aria-labelledby="txAndamentoTitulo">
      <div class="tx-secao-cab">
        <h2 id="txAndamentoTitulo">Aguardando valores finais</h2>
        <span class="hint">confira quantidade e preço de cada ordem executada e conclua</span>
      </div>
      ${avisoDuplicadosHtml(lista)}
      ${lista.map((a) => {
        const dig = estado.digitados[a.id] || {};
        const usaEua = a.itens.some((it) => it.moeda === 'USD');
        return `
        <article class="tx-andamento" data-aporte-card="${esc(a.id)}">
          <header class="tx-andamento-cab">
            <div>
              <span class="status-pill warn">Aguardando valores finais</span>
              <h3>Aporte de ${dma(a.data)}</h3>
              <span class="tx-classes">${classesDoAporte(a).map((c) => `${dotHtml(c)}${NOME_CLASSE_APORTE[c]}`).join(' · ')}${a.observacao ? ` · <i>${esc(a.observacao)}</i>` : ''}</span>
            </div>
            <span class="tx-botoes">
              <button type="button" class="btn btn-ghost tx-btn-sm" data-acao="editar" data-id="${esc(a.id)}">Editar no carrinho</button>
              <button type="button" class="btn btn-ghost tx-btn-sm tx-btn-perigo-ghost" data-acao="cancelar" data-id="${esc(a.id)}">Cancelar aporte</button>
            </span>
          </header>
          <div class="tx-tabela-wrap">
            <table class="tx-tabela tx-tabela-andamento">
              <thead><tr><th class="esq">Ativo</th><th>Planejado</th><th>Qtd comprada</th><th>Preço pago</th><th>Total pago</th></tr></thead>
              <tbody>${a.itens.map((it, i) => linhaAndamentoHtml(a, it, i, dig[i] || {}, dados.cambio)).join('')}</tbody>
            </table>
          </div>
          <p class="tx-nota">Quantidade 0 = não comprou esse ativo (sai do aporte ao concluir).${usaEua ? ` Ações EUA convertidas pelo dólar de hoje (${formatBRL(dados.cambio)}).` : ''}</p>
          <div class="tx-andamento-pe" data-rodape="${esc(a.id)}">${rodapeAndamentoHtml(a, estado, dados.cambio)}</div>
        </article>`;
      }).join('')}
    </section>`;
}

// ---------------------------------------------------------------------------
// 1. Novo aporte: prateleira + carrinho
// ---------------------------------------------------------------------------

function ultimoPagoHtml(a, hoje, { cambioHoje = null } = {}) {
  const u = a.ultimoPago;
  if (!u || !(u.preco > 0)) return '<span class="tx-fraco">—</span>';
  const dif = a.precoAtual > 0 ? ((a.precoAtual / u.preco) - 1) * 100 : null;
  const dias = hoje && u.data ? diasEntre(u.data, hoje) : null;
  const conversao = a.moeda === 'USD' ? `
      ${u.cambioDia > 0 ? brlHtml(u.preco * u.cambioDia, 'no dia', `câmbio do dia da compra: ${formatNumeroBR(u.cambioDia, 2)}`) : ''}
      ${cambioHoje > 0 ? brlHtml(u.preco * cambioHoje, 'hoje', `câmbio de hoje: ${formatNumeroBR(cambioHoje, 2)}`) : ''}` : '';
  return `
    <span class="tx-ultimo">
      <b>${precoTxt(u.preco, a.moeda)}</b>
      <small>${dm(u.data)}${dias != null && dias >= 0 ? ` · há ${dias}d` : ''}${u.origem === 'aporte' ? ' · aporte' : ''}</small>
      ${conversao}
      ${dif != null && Math.abs(dif) >= 0.05 ? `<span class="tx-var ${dif < 0 ? 'good' : 'bad'}" title="Cotação de agora comparada com o último preço pago">${pct(dif)}</span>` : ''}
    </span>`;
}

function tetoHtml(a) {
  if (!(a.precoTeto > 0)) return '<span class="tx-fraco">—</span>';
  const acima = a.precoAtual > 0 && a.precoAtual > a.precoTeto;
  return `<span class="tx-teto${acima ? ' bad' : ''}" title="${acima ? 'Cotação acima do preço-teto' : 'Cotação abaixo do preço-teto'}">${precoTxt(a.precoTeto, a.moeda)}</span>`;
}

function stepperHtml(classe, ativo, qtd, moeda) {
  const frac = moeda === 'USD';
  return `
    <span class="tx-stepper" data-stepper="${esc(classe)}:${esc(ativo)}">
      <button type="button" class="tx-step" data-passo="-1" aria-label="Menos ${esc(ativo)}">−</button>
      <input type="text" inputmode="${frac ? 'decimal' : 'numeric'}" class="tx-qtd" data-qtd="${esc(classe)}:${esc(ativo)}" value="${qtd ? numCampo(qtd) : ''}" placeholder="0" aria-label="Quantidade de ${esc(ativo)}" autocomplete="off">
      <button type="button" class="tx-step" data-passo="1" aria-label="Mais ${esc(ativo)}">+</button>
    </span>`;
}

// 26/09/2026: "momento de aporte" embaixo de cada ativo - HTML compartilhado com o Radar (momento-aporte.js)
function prateleiraRvHtml(estado, dados, classe) {
  const lista = filtrarPrateleira(dados.classes[classe] || [], estado, { classe, metas: dados.metas, hoje: dados.hoje, cambio: dados.cambio });
  const nRanking = totalRanking(dados.classes[classe]);
  if (!lista.length) return `<p class="tx-vazio">${(dados.classes[classe] || []).length ? 'Nenhum ativo com esse filtro.' : 'Nenhum ativo dessa classe na carteira.'}</p>`;
  const linhas = lista.map((a) => {
    const it = estado.carrinho.itens[chaveItem(classe, a.ticker)];
    const qtd = it ? it.qtd : 0;
    const vies = statusVies(a.vies);
    const variacao = typeof a.variacaoDia === 'number' ? a.variacaoDia * 100 : null;
    const subtotalUsd = qtd ? qtd * (a.precoAtual || 0) : 0;
    return `
      <tr class="${qtd ? 'no-carrinho' : ''}" data-linha="${esc(classe)}:${esc(a.ticker)}">
        <td class="esq"><a class="tx-ativo" href="${esc(urlAtivoTicker(a.ticker))}">${logoAtivoHtml(a.ticker)}<span class="tx-ativo-nome"><b>${esc(a.ticker)}</b><small>${esc(a.nome || '')}</small></span></a></td>
        <td data-rot="Cotação"><b class="tx-mono">${precoTxt(a.precoAtual, a.moeda)}</b>${a.moeda === 'USD' && dados.cambio > 0 ? brlHtml(a.precoAtual * dados.cambio, '', `câmbio de hoje: ${formatNumeroBR(dados.cambio, 2)}`) : ''}${variacao != null ? `<small class="${variacao >= 0 ? 'good' : 'bad'}">${pct(variacao, 2)} hoje</small>` : ''}</td>
        <td data-rot="Último pago">${ultimoPagoHtml(a, dados.hoje, { cambioHoje: dados.cambio })}</td>
        <td data-rot="Preço-teto">${tetoHtml(a)}</td>
        <td data-rot="Viés">${vies.classe ? `<span class="status-pill ${vies.classe}">${vies.texto}</span>` : '<span class="tx-fraco">—</span>'}</td>
        <td data-rot="Na classe" class="tx-mono">${formatNumeroBR((a.peso || 0) * 100, 1)}%</td>
        <td data-rot="Quantidade" class="tx-td-qtd">${stepperHtml(classe, a.ticker, qtd, a.moeda)}</td>
        <td data-rot="Subtotal" class="tx-subtotal" data-subtotal="${esc(classe)}:${esc(a.ticker)}">${qtd ? `${dinheiro(subtotalUsd, a.moeda)}${a.moeda === 'USD' && dados.cambio > 0 ? brlHtml(subtotalUsd * dados.cambio) : ''}` : '<span class="tx-fraco">—</span>'}</td>
      </tr>${momentoLinhaHtml(momentoAporte(a, classe, dados.metas, dados.hoje, { totalRanking: nRanking, ...opcoesMomento(estado, dados, qtd ? qtd * (a.precoAtual || 0) : null) }), 8)}`;
  }).join('');
  return `
    <div class="tx-tabela-wrap">
      <table class="tx-tabela tx-prateleira">
        <thead><tr><th class="esq">Ativo</th><th>Cotação</th><th>Último pago</th><th>Preço-teto</th><th>Viés</th><th>Na classe</th><th>Quantidade</th><th>Subtotal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

/**
 * 03/10/2026: metas de Metas e Objetivos no momento ("faltam R$ 800 pra meta;
 * investir R$ 800 aqui completa") - o valor sugerido é o que está no
 * carrinho (senão o "R$ a investir" do Radar). Metas buscadas 1x por tela.
 */
function opcoesMomento(estado, dados, valorNoCarrinho) {
  return { metasObjetivos: estado.metasObjetivos || null, cambio: dados.cambio || null, valorSugerido: valorNoCarrinho > 0 ? valorNoCarrinho : null, macro: estado.macro || null };
}

function garantirMetasMomento(ctx) {
  const { estado } = ctx;
  if (estado.metasPedidas) return;
  estado.metasPedidas = true;
  const refazer = () => {
    const atual = ctx.el && ctx.el._txCtx ? ctx.el._txCtx : ctx;
    const lista = atual.el && atual.el.querySelector('#txPrateleiraLista');
    if (lista) lista.innerHTML = atual.estado.classeAtiva === 'rendaFixa' ? prateleiraRfHtml(atual.estado, atual.dados) : prateleiraRvHtml(atual.estado, atual.dados, atual.estado.classeAtiva);
  };
  const carregar = ctx.carregarMetas || ((aoChegar) => {
    const token = getToken();
    return token ? carregarMetasMomento(token, { aoChegar }) : Promise.resolve(null);
  });
  Promise.resolve(carregar((metas) => {
    estado.metasObjetivos = metas;
    refazer();
  })).catch(() => { /* sem metas: o momento fica sem esse sinal */ });
  // 05/10/2026: contexto de mercado (juro real, bolsa cara/barata, NTN-B) - 1 busca por tela; sem ele o momento segue igual
  const carregarMacro = ctx.carregarMacro || ((aoChegar) => {
    const token = getToken();
    return token ? carregarMacroMomento(token, { aoChegar, tesouroExtra: ctx.dados && ctx.dados.tesouro }) : Promise.resolve(null);
  });
  Promise.resolve(carregarMacro((macro) => {
    estado.macro = macro;
    refazer();
  })).catch(() => { /* sem macro */ });
}

function momentoLinhaHtml(m, colunas) {
  const html = momentoHtml(m);
  return html ? `<tr class="tx-momento-tr"><td colspan="${colunas}" class="esq">${html}</td></tr>` : '';
}

// ---------------------------------------------------------------------------
// Renda fixa (05/10/2026): tabela como a das outras classes - nome com
// instituição + tipo (Renda fixa / Renda emergencial, a marcação da planilha),
// "Cotação" (PU de compra de hoje do Tesouro; nos outros títulos "—"), "Na
// classe" (valor investido e, embaixo, a % da classe) - e no Tesouro Direto o
// investimento por VALOR ou por QUANTIDADE com o mínimo do dia (1% do PU).
// ---------------------------------------------------------------------------

const rotuloCategoriaRf = (a) => (/emergenc/i.test(a.categoria || '') ? 'Renda emergencial' : 'Renda fixa');

/** "= 0,19 título · R$ 495,90 (sobram R$ 4,10)" + "mínimo hoje R$ 26,10 (1% do PU de R$ 2.610,00)". */
function rfInfoHtml(pu, it, { sobra = 0, abaixo = false } = {}) {
  const partes = [];
  if (it && it.qtd > 0) partes.push(`<b>= ${formatNumeroBR(it.qtd, 2)} título${it.qtd > 1 ? 's' : ''}</b> · ${formatBRL(it.valor)}${sobra > 0.004 ? ` <span class="tx-fraco">(sobram ${formatBRL(sobra)}: o Tesouro vende em frações de 0,01)</span>` : ''}`);
  if (abaixo) partes.push(`<span class="tx-rf-abaixo">abaixo do mínimo de ${formatBRL(minimoTesouro(pu))}</span>`);
  partes.push(`<span class="tx-rf-min">${textoMinimo(pu, formatBRL)}</span>`);
  return partes.join('<br>');
}

function aplicarRfHtml(a, k, it, pu) {
  const attrs = `data-rf="${esc(k)}" data-titulo="${esc(a.titulo)}" data-inst="${esc(a.instituicao)}"${pu ? ` data-pu="${pu}"` : ''}`;
  const valor = inputHtml(`class="tx-valor-rf" ${attrs}`, it ? dinheiroCampo(it.valor) : '', { rotulo: `Valor a aplicar em ${a.titulo}`, prefixo: 'R$' });
  if (!(pu > 0)) return valor;
  const qtd = `<label class="tx-campo"><input type="text" inputmode="decimal" class="tx-qtd-rf" data-rf-qtd="${esc(k)}" data-titulo="${esc(a.titulo)}" data-inst="${esc(a.instituicao)}" data-pu="${pu}" value="${it && it.qtd ? numCampo(it.qtd) : ''}" placeholder="0,00" aria-label="Quantidade de títulos de ${esc(a.titulo)}" autocomplete="off"><span class="tx-campo-pos">título</span></label>`;
  return `<div class="tx-rf-aplicar">${valor}<span class="tx-rf-ou">ou</span>${qtd}<small class="tx-rf-info" data-rf-info="${esc(k)}">${rfInfoHtml(pu, it)}</small></div>`;
}

function prateleiraRfHtml(estado, dados) {
  const lista = filtrarPrateleira(dados.classes.rendaFixa || [], estado, { classe: 'rendaFixa', metas: dados.metas, hoje: dados.hoje });
  const todos = dados.classes.rendaFixa || [];
  const somaClasse = todos.reduce((t, x) => t + (x.valorAtualizado || 0), 0);
  const linhas = lista.map((a) => {
    const k = chaveItem('rendaFixa', a.titulo, a.instituicao);
    const it = estado.carrinho.itens[k];
    const u = a.ultimoPago;
    const pu = ehTesouro(a.titulo) ? puDoTitulo(a) : null;
    const dataPu = dataCotacao(a);
    const peso = somaClasse > 0 ? (a.valorAtualizado || 0) / somaClasse : 0;
    const emerg = /emergenc/i.test(a.categoria || '');
    return `
      <tr class="${it ? 'no-carrinho' : ''}" data-linha="${esc(k)}">
        <td class="esq"><span class="tx-ativo">${logoRendaFixaHtml({ indexador: a.indexador, tipoInvestimento: a.tipo, instituicao: a.instituicao })}<span class="tx-ativo-nome"><b>${esc(a.titulo)}</b><small>${esc(a.instituicao)}<span class="tx-tipo-rf${emerg ? ' emergencial' : ''}" title="Marcação na planilha (coluna Categoria)">${rotuloCategoriaRf(a)}</span></small></span></span></td>
        <td data-rot="Cotação">${pu > 0
    ? `<b class="tx-mono" title="Preço unitário de compra do Tesouro Direto">${formatBRL(pu)}</b><small class="tx-fraco" title="Preço unitário de compra do Tesouro Direto${dataPu ? ` (data-base ${dma(dataPu)})` : ''}">PU${dataPu ? ` · ${dm(dataPu)}` : ''}</small>`
    : `<span class="tx-fraco">—</span>${a.valorAtualizado > 0 ? `<small class="tx-fraco">atualizado ${formatBRL(a.valorAtualizado)}</small>` : ''}`}</td>
        <td data-rot="Na classe" class="tx-mono" title="${a.valorAtualizado > 0 ? `Valor atualizado ${formatBRL(a.valorAtualizado)}` : ''}"><b>${a.valorInvestido > 0 ? formatBRL(a.valorInvestido) : '—'}</b><small class="tx-fraco">${formatNumeroBR(peso * 100, 1)}%</small></td>
        <td data-rot="Último aporte">${u && u.valor > 0 ? `<span class="tx-ultimo"><b>${formatBRL(u.valor)}</b><small>${dma(u.data)}${u.origem === 'aporte' ? ' · aporte' : ''}</small></span>` : '<span class="tx-fraco">—</span>'}</td>
        <td data-rot="Vencimento" class="tx-mono">${a.vencimento ? dma(a.vencimento) : '—'}</td>
        <td data-rot="Aplicar" class="tx-td-qtd">${aplicarRfHtml(a, k, it, pu)}</td>
      </tr>${momentoLinhaHtml(momentoAporte(a, 'rendaFixa', dados.metas, dados.hoje, opcoesMomento(estado, dados, it ? it.valor : null)), 6)}`;
  }).join('');
  const nomesNovo = [...new Set([...(dados.tesouro || []).map((t) => t.nome), ...todos.map((a) => a.titulo)])];
  return `
    <div class="tx-tabela-wrap">
      <table class="tx-tabela tx-prateleira tx-prateleira-rf">
        <thead><tr><th class="esq">Título</th><th>Cotação</th><th>Na classe</th><th>Último aporte</th><th>Vencimento</th><th>Aplicar</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="6" class="tx-vazio">Nenhum título com esse filtro.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="tx-nota tx-nota-tesouro">Tesouro Direto: informe o <b>valor</b> ou a <b>quantidade</b> de títulos (frações de 0,01). O mínimo é o de <b>0,01 título = 1% do PU de compra do dia</b> (regra da B3 em vigor desde 18/11/2024; o antigo piso de R$ 30 acabou). Nos demais títulos (CDB, LCI...) o valor é livre.</p>
    <form class="tx-rf-novo" id="txRfNovo" autocomplete="off">
      <span class="tx-rf-novo-rot">Título novo</span>
      <input type="text" id="txRfNovoTitulo" placeholder="Ex.: Tesouro IPCA+ 2035" aria-label="Nome do título" list="txTitulosNovos" required>
      <input type="text" id="txRfNovoInst" placeholder="Instituição" aria-label="Instituição" list="txInstituicoes">
      <label class="tx-campo"><span class="tx-campo-pre">R$</span><input type="text" inputmode="decimal" id="txRfNovoValor" placeholder="0,00" aria-label="Valor a aplicar" required></label>
      <button type="submit" class="btn btn-ghost tx-btn-sm">Adicionar</button>
      <small class="tx-rf-info tx-rf-novo-info" id="txRfNovoInfo" aria-live="polite"></small>
      <datalist id="txInstituicoes">${[...new Set(todos.map((a) => a.instituicao).filter(Boolean))].map((i) => `<option value="${esc(i)}"></option>`).join('')}</datalist>
      <datalist id="txTitulosNovos">${nomesNovo.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    </form>`;
}

export function filtrarPrateleira(lista, estado, { classe = estado.classeAtiva, metas = null, hoje = '', cambio = null } = {}) {
  const busca = String(estado.busca || '').trim().toLowerCase();
  let out = lista.filter((a) => !busca || `${a.ticker || a.titulo} ${a.nome || ''} ${a.instituicao || ''}`.toLowerCase().includes(busca));
  if (estado.soComprar && estado.classeAtiva !== 'rendaFixa') out = out.filter((a) => statusVies(a.vies).classe === 'good');
  const ordem = estado.ordem || 'carteira';
  const nome = (a) => a.ticker || a.titulo || '';
  if (ordem === 'nome') out = [...out].sort((a, b) => nome(a).localeCompare(nome(b)));
  else if (ordem === 'teto') {
    const folga = (a) => (a.precoTeto > 0 && a.precoAtual > 0 ? a.precoAtual / a.precoTeto : 9);
    out = [...out].sort((a, b) => folga(a) - folga(b));
  } else if (ordem === 'momento') {
    const n = totalRanking(lista);
    const pontos = new Map(out.map((a) => [a, momentoAporte(a, classe, metas, hoje, { totalRanking: n, metasObjetivos: estado.metasObjetivos || null, cambio, macro: estado.macro || null }).pontos]));
    out = [...out].sort((a, b) => pontos.get(b) - pontos.get(a));
  } else if (ordem === 'ultimo') {
    const d = (a) => (a.ultimoPago && a.ultimoPago.data) || '';
    out = [...out].sort((a, b) => (d(a) < d(b) ? -1 : d(a) > d(b) ? 1 : 0));
  } else out = [...out].sort((a, b) => (b.totalAtualizado || b.valorAtualizado || 0) - (a.totalAtualizado || a.valorAtualizado || 0));
  return out;
}

function classesSegHtml(estado) {
  const t = totaisCarrinho(estado.carrinho, 0).porClasse;
  return `<div class="tx-seg" role="tablist" aria-label="Classe">${CLASSES_APORTE.map((c) => `
    <button type="button" role="tab" class="tx-seg-btn${estado.classeAtiva === c.id ? ' active' : ''}" data-classe="${c.id}" aria-selected="${estado.classeAtiva === c.id}">
      <span class="tx-dot" style="background:var(${c.cor})"></span><span class="tx-longo">${c.nome}</span><span class="tx-curto">${c.curto}</span>
      <span class="tx-seg-n" data-conta-classe="${c.id}"${t[c.id] ? '' : ' hidden'}>${t[c.id] ? t[c.id].n : ''}</span>
    </button>`).join('')}</div>`;
}

function prateleiraHtml(estado, dados) {
  const rf = estado.classeAtiva === 'rendaFixa';
  const ordens = rf ? [['carteira', 'Maior posição'], ['momento', 'Melhor momento'], ['nome', 'Nome'], ['ultimo', 'Aporte mais antigo']]
    : [['carteira', 'Maior posição'], ['momento', 'Melhor momento'], ['nome', 'Ticker'], ['teto', 'Mais longe do teto'], ['ultimo', 'Compra mais antiga']];
  return `
    <div class="tx-prateleira-topo">
      ${classesSegHtml(estado)}
      <div class="tx-filtros">
        <input type="search" class="tx-busca" id="txBusca" placeholder="Buscar ${rf ? 'título' : 'ativo'}" value="${esc(estado.busca || '')}" aria-label="Buscar">
        <label class="tx-select-caixa"><span class="tx-sr">Ordenar</span><select id="txOrdem" class="tx-select">${ordens.map(([v, r]) => `<option value="${v}"${(estado.ordem || 'carteira') === v ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
        ${rf ? '' : `<label class="tx-toggle"><input type="checkbox" id="txSoComprar"${estado.soComprar ? ' checked' : ''}><span>Só viés Comprar</span></label>`}
      </div>
    </div>
    ${estado.classeAtiva === 'acoesEua' ? euaFluxoHtml(estado, dados, totaisCarrinho(estado.carrinho, dados.cambio).totalUsd) : ''}
    ${estado.classeAtiva === 'acoesEua' && dados.cambio > 0 ? `<p class="tx-nota tx-nota-cambio">Em dólar, com a conversão em reais embaixo: cotação e subtotal pelo câmbio de hoje (<b>${formatBRL(dados.cambio)}</b>); o último pago pelo câmbio do dia da compra e pelo de hoje.</p>` : ''}
    <div id="txPrateleiraLista">${rf ? prateleiraRfHtml(estado, dados) : prateleiraRvHtml(estado, dados, estado.classeAtiva)}</div>
    <p class="tx-momento-nota">Embaixo de cada ativo, a leitura dos <b>seus</b> critérios: preço-teto, ranking da Suno, % desejado do Radar, preço médio, última compra, P/VP e P/L${rf ? ', taxa de hoje x a sua média contratada e as metas de Renda Fixa' : ''}. Não é recomendação de compra.</p>`;
}

function carrinhoConteudoHtml(estado, dados) {
  const c = estado.carrinho;
  const itens = itensDoCarrinho(c);
  const t = totaisCarrinho(c, dados.cambio);
  const editando = c.editandoId ? dados.aportes.find((a) => a.id === c.editandoId) : null;
  // 05/10/2026: já tem aporte aguardando valores finais nesse dia? Confirmar SOMA nele (sem duplicar)
  const mesclar = !editando && itens.length ? aguardandoDoDia(dados.aportes, c.data) : [];
  const mesclaHtml = mesclar.length ? `
    <p class="tx-recibo-mescla">Já existe um aporte de ${dma(c.data)} <b>aguardando valores finais</b>${mesclar.length > 1 ? ` (${mesclar.length} deles)` : ''}: ao confirmar, este carrinho é <b>somado</b> a ele, sem duplicar. <button type="button" class="tx-link" data-acao="editar" data-id="${esc(mesclar[0].id)}">Editar o aporte existente</button></p>` : '';
  const grupos = CLASSES_APORTE.filter((cl) => t.porClasse[cl.id]).map((cl) => `
    <div class="tx-recibo-grupo">
      <div class="tx-recibo-grupo-cab">${dotHtml(cl.id)}<b>${cl.nome}</b><span>${cl.id === 'acoesEua' ? `${usd(t.porClasse[cl.id].valor)} <small class="tx-fraco">≈ ${formatBRL(t.porClasse[cl.id].brl)}</small>` : formatBRL(t.porClasse[cl.id].brl)}</span></div>
      ${itens.filter((it) => it.classe === cl.id).map((it) => `
        <div class="tx-recibo-linha">
          <span class="tx-recibo-ativo"><b>${esc(it.ativo)}</b><small>${it.classe === 'rendaFixa' ? (it.qtd > 0 && it.pu > 0 ? `${formatNumeroBR(it.qtd, 2)} título${it.qtd > 1 ? 's' : ''} × ${formatBRL(it.pu)}${it.instituicao ? ` · ${esc(it.instituicao)}` : ''}` : esc(it.instituicao || 'aplicação')) : `${qtdTxt(it.qtd)} × ${precoTxt(it.preco, it.moeda)}`}</small></span>
          <span class="tx-recibo-valor">${dinheiro(it.subtotal, it.moeda)}${it.moeda === 'USD' && dados.cambio > 0 ? `<small class="tx-fraco">≈ R$ ${formatNumeroBR(it.subtotal * dados.cambio)}</small>` : ''}</span>
          <button type="button" class="tx-recibo-tirar" data-tirar="${esc(it.chave)}" aria-label="Tirar ${esc(it.ativo)} do carrinho">×</button>
        </div>`).join('')}
    </div>`).join('');
  return `
    <div class="tx-recibo-cab">
      <h3>${ICONE_CARRINHO}Carrinho</h3>
      <button type="button" class="tx-recibo-fechar" data-acao="fechar-carrinho" aria-label="Fechar carrinho">×</button>
    </div>
    ${editando ? `<div class="tx-recibo-editando">Editando o aporte de ${dma(editando.data)} <button type="button" class="tx-link" data-acao="descartar-edicao">descartar edição</button></div>` : ''}
    ${itens.length ? `<div class="tx-recibo-itens">${grupos}</div>` : `<p class="tx-recibo-vazio">Escolha a classe, coloque a quantidade de cada ativo e ele aparece aqui.</p>`}
    <div class="tx-recibo-total">
      <span>Total${t.totalUsd ? ' estimado' : ''}</span>
      <b>${formatBRL(t.totalBrl)}</b>
    </div>
    ${t.totalUsd ? `<p class="tx-recibo-nota">Inclui ${usd(t.totalUsd)} ≈ ${formatBRL(t.totalUsd * (dados.cambio || 0))} (dólar ${formatBRL(dados.cambio)}).</p>` : ''}
    ${t.totalUsd && estado.eua ? necessidadeHtml(estado, dados, t.totalUsd) : ''}
    ${mesclaHtml}
    <div class="tx-recibo-campos">
      <label class="tx-rotulo">Data da compra<input type="date" id="txDataAporte" value="${esc(c.data)}"></label>
      <label class="tx-rotulo">Observação<input type="text" id="txObsAporte" value="${esc(c.observacao || '')}" placeholder="opcional" maxlength="140"></label>
    </div>
    <div class="tx-recibo-acoes">
      <button type="button" class="btn btn-primary" data-acao="confirmar-carrinho"${itens.length ? '' : ' disabled'}>${editando ? 'Salvar alterações' : (mesclar.length ? 'Somar ao aporte do dia' : 'Confirmar aporte')}</button>
      <button type="button" class="btn btn-ghost" data-acao="esvaziar"${itens.length ? '' : ' disabled'}>Esvaziar</button>
    </div>
    <p class="tx-recibo-nota">Confirmar guarda o aporte como <b>aguardando valores finais</b>: depois de comprar na corretora você ajusta quantidade e preço e conclui.</p>`;
}

function barraCarrinhoHtml(estado, dados) {
  const t = totaisCarrinho(estado.carrinho, dados.cambio);
  return `
    <button type="button" class="tx-barra-carrinho" data-acao="abrir-carrinho"${t.n ? '' : ' hidden'} aria-label="Ver carrinho">
      <span class="tx-barra-ico">${ICONE_CARRINHO}<span class="tx-barra-n">${t.n}</span></span>
      <span class="tx-barra-txt">${t.n} ativo${t.n === 1 ? '' : 's'}<b>${formatBRL(t.totalBrl)}</b></span>
      <span class="tx-barra-ver">Ver carrinho</span>
    </button>`;
}

function novoAporteHtml(estado, dados) {
  return `
    <section class="tx-secao" id="txNovoAporte" aria-labelledby="txNovoTitulo">
      <div class="tx-secao-cab">
        <h2 id="txNovoTitulo">Novo aporte</h2>
        <span class="hint">cotação de agora · último pago vem das suas transações</span>
      </div>
      <div class="tx-loja">
        <div class="tx-loja-prateleira" id="txPrateleira">${prateleiraHtml(estado, dados)}</div>
        <aside class="tx-recibo${estado.carrinhoAberto ? ' aberto' : ''}" id="txCarrinho" aria-label="Carrinho">${carrinhoConteudoHtml(estado, dados)}</aside>
        <div class="tx-recibo-fundo" data-acao="fechar-carrinho"${estado.carrinhoAberto ? '' : ' hidden'}></div>
      </div>
      <div id="txBarraCarrinho">${barraCarrinhoHtml(estado, dados)}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// 3. Resumo por mês + histórico de aportes concluídos
// ---------------------------------------------------------------------------

function graficoMesesHtml(estado, dados) {
  const meses = mesesDoAno(dados.resumo, estado.ano);
  const max = Math.max(...meses.map((m) => m.total), 1);
  const planejados = aportesPorMes(dados.aportes, dados.cambio);
  const mesAtual = dados.hoje.slice(0, 7);
  const cols = meses.map((m) => {
    const partes = CLASSES_APORTE.filter((c) => m[c.id] > 0).map((c) => `<span class="tx-barra-parte" style="height:${(m[c.id] / max) * 100}%;background:var(${c.cor})"></span>`).join('');
    const titulo = `${MESES_LONGOS[m.mes - 1]}: ${formatBRL(m.total)}${CLASSES_APORTE.filter((c) => m[c.id] > 0).map((c) => ` · ${c.nome} ${formatBRL(m[c.id])}`).join('')}`;
    const p = planejados[m.chave];
    return `
      <button type="button" class="tx-mes${estado.mesSel === m.chave ? ' sel' : ''}${m.chave === mesAtual ? ' atual' : ''}${m.chave > mesAtual ? ' futuro' : ''}" data-mes="${m.chave}" title="${esc(titulo)}" aria-label="${esc(titulo)}" aria-pressed="${estado.mesSel === m.chave}">
        <span class="tx-mes-valor">${m.total ? (m.total >= 1000 ? `${formatNumeroBR(m.total / 1000, 1)} mil` : formatNumeroBR(Math.round(m.total), 0)) : ''}</span>
        <span class="tx-mes-trilho"><span class="tx-mes-pilha">${partes}</span></span>
        <span class="tx-mes-rot">${MESES_CURTOS[m.mes - 1]}${p ? '<i class="tx-mes-marca" aria-hidden="true"></i>' : ''}</span>
      </button>`;
  }).join('');
  const totalAno = meses.reduce((s, m) => s + m.total, 0);
  const legenda = CLASSES_APORTE.map((c) => ({ ...c, v: meses.reduce((s, m) => s + m[c.id], 0) })).filter((c) => c.v > 0)
    .map((c) => `<span class="tx-leg">${dotHtml(c.id)}${c.nome}<b>${formatBRL(c.v)}</b></span>`).join('');
  return { cols, totalAno, legenda };
}

function mesDetalheHtml(estado, dados) {
  const chave = estado.mesSel;
  const r = (dados.resumo && dados.resumo[chave]) || {};
  const planejados = aportesPorMes(dados.aportes, dados.cambio)[chave];
  const nome = `${MESES_LONGOS[Number(chave.slice(5, 7)) - 1]} de ${chave.slice(0, 4)}`;
  const linhas = CLASSES_APORTE.filter((c) => r[c.id] > 0).map((c) => `
    <li>${dotHtml(c.id)}<span>${c.nome}${c.id === 'acoesEua' && r.acoesEuaUsd ? ` <small>(${usd(r.acoesEuaUsd)})</small>` : ''}</span><b>${formatBRL(r[c.id])}</b></li>`).join('');
  return `
    <div class="tx-mes-detalhe">
      <span class="tx-card-rotulo">Investido em ${esc(nome)}</span>
      <span class="tx-card-valor">${formatBRL(r.total || 0)}</span>
      ${linhas ? `<ul class="tx-mes-lista">${linhas}</ul>` : '<p class="tx-fraco">Nenhuma compra registrada nas transações.</p>'}
      <span class="tx-mes-aportes">${planejados ? `${planejados.n} aporte${planejados.n > 1 ? 's' : ''} concluído${planejados.n > 1 ? 's' : ''} no planejamento: <b>${formatBRL(planejados.valor)}</b>` : 'Nenhum aporte concluído no planejamento.'}</span>
    </div>`;
}

function resumoHtml(estado, dados) {
  const anos = anosDoResumo(dados.resumo, dados.hoje);
  const i = anos.indexOf(estado.ano);
  const g = graficoMesesHtml(estado, dados);
  return `
    <section class="tx-secao" id="txResumo" aria-labelledby="txResumoTitulo">
      <div class="tx-secao-cab">
        <h2 id="txResumoTitulo">Investido por mês</h2>
        <span class="hint">das transações da planilha (EUA pelo dólar do dia da compra)</span>
        <div class="tx-ano" role="group" aria-label="Ano">
          <button type="button" class="tx-ano-btn" data-ano="${anos[i + 1] || ''}"${anos[i + 1] ? '' : ' disabled'} aria-label="Ano anterior">‹</button>
          <b>${estado.ano}</b>
          <button type="button" class="tx-ano-btn" data-ano="${anos[i - 1] || ''}"${anos[i - 1] ? '' : ' disabled'} aria-label="Próximo ano">›</button>
        </div>
      </div>
      <div class="tx-resumo">
        <div class="tx-resumo-grafico">
          <div class="tx-meses" role="group" aria-label="Meses de ${estado.ano}">${g.cols}</div>
          <div class="tx-legenda"><span class="tx-leg tx-leg-total">Total em ${estado.ano}<b>${formatBRL(g.totalAno)}</b></span>${g.legenda}<span class="tx-leg tx-leg-marca"><i class="tx-mes-marca" aria-hidden="true"></i>mês com aporte concluído</span></div>
        </div>
        ${mesDetalheHtml(estado, dados)}
      </div>
    </section>`;
}

/** Câmbio do dia `data` (ou o mais recente antes dele) visto nos lançamentos em dólar - vem de Aportes.gs (aux_historico-patrimonio). */
function cambioDoDia(dados, data) {
  let melhor = null;
  (dados.lancamentos || []).forEach((l) => {
    if (l.moeda === 'USD' && l.cambio > 0 && l.data <= data && (!melhor || l.data > melhor.data)) melhor = l;
  });
  return melhor ? melhor.cambio : null;
}

function historicoHtml(estado, dados) {
  const lista = dados.aportes.filter((a) => a.status === 'concluido');
  const porMes = {};
  lista.forEach((a) => { (porMes[a.data.slice(0, 7)] = porMes[a.data.slice(0, 7)] || []).push(a); });
  const meses = Object.keys(porMes).sort().reverse();
  const visiveis = estado.historicoTodos ? meses : meses.slice(0, 3);
  const cartao = (a) => {
    const cambioAporte = a.itens.some((it) => it.moeda === 'USD') ? (cambioDoDia(dados, a.data) || dados.cambio) : dados.cambio;
    const pago = totalAporte(a, 'final', cambioAporte);
    const planejado = totalAporte(a, 'planejado', cambioAporte);
    const confirmando = estado.confirmando === `excluir:${a.id}`;
    return `
      <details class="tx-hist"${estado.abertos[a.id] ? ' open' : ''} data-hist="${esc(a.id)}">
        <summary>
          <span class="tx-hist-data"><b>${dm(a.data)}</b><small>${a.data.slice(0, 4)}</small></span>
          <span class="tx-hist-info"><span class="tx-classes">${classesDoAporte(a).map((c) => `${dotHtml(c)}${NOME_CLASSE_APORTE[c]}`).join(' · ')}</span><small>${a.itens.length} ativo${a.itens.length > 1 ? 's' : ''}${a.observacao ? ` · ${esc(a.observacao)}` : ''}</small></span>
          <span class="tx-hist-valor"><b>${formatBRL(pago)}</b>${Math.abs(pago - planejado) >= 0.01 ? `<small>planejado ${formatBRL(planejado)}</small>` : ''}</span>
        </summary>
        <div class="tx-hist-corpo">
          <ul class="tx-hist-itens">${a.itens.map((it) => `
            <li>${logoItemHtml(it)}<span><b>${esc(it.ativo)}</b><small>${it.classe === 'rendaFixa' ? esc(it.instituicao || 'Renda Fixa') : `${qtdTxt(it.qtdFinal)} × ${precoTxt(it.precoFinal, it.moeda)}`}</small></span><b class="tx-mono">${dinheiro(it.valorFinal, it.moeda)}${it.moeda === 'USD' ? (() => { const c = cambioDoDia(dados, a.data) || dados.cambio; return c > 0 ? brlHtml(it.valorFinal * c, `câmbio ${formatNumeroBR(c, 2)}`) : ''; })() : ''}</b></li>`).join('')}
          </ul>
          ${confirmando ? `
            <div class="tx-confirmar tx-confirmar-perigo">
              <span>Excluir este aporte do planejamento? As transações da planilha não mudam.</span>
              <span class="tx-botoes"><button type="button" class="btn tx-btn-perigo" data-acao="excluir-sim" data-id="${esc(a.id)}">Sim, excluir</button><button type="button" class="btn btn-ghost" data-acao="voltar">Voltar</button></span>
            </div>` : `
            <div class="tx-hist-acoes">
              <button type="button" class="btn btn-ghost tx-btn-sm" data-acao="repetir" data-id="${esc(a.id)}">Repetir no carrinho</button>
              <button type="button" class="btn btn-ghost tx-btn-sm tx-btn-perigo-ghost" data-acao="excluir" data-id="${esc(a.id)}">${ICONE_LIXO}Excluir</button>
            </div>`}
        </div>
      </details>`;
  };
  return `
    <section class="tx-secao" id="txHistorico" aria-labelledby="txHistTitulo">
      <div class="tx-secao-cab">
        <h2 id="txHistTitulo">Aportes concluídos</h2>
        <span class="hint">${lista.length} no planejamento</span>
      </div>
      ${lista.length ? visiveis.map((m) => `
        <div class="tx-hist-mes">
          <h3>${MESES_LONGOS[Number(m.slice(5, 7)) - 1]} <small>${m.slice(0, 4)}</small></h3>
          ${porMes[m].map(cartao).join('')}
        </div>`).join('') : '<p class="tx-vazio">Nenhum aporte concluído ainda. Eles aparecem aqui depois do passo "Concluir compra".</p>'}
      ${meses.length > visiveis.length ? `<button type="button" class="tx-mais" data-acao="historico-todos">Ver todos os ${meses.length} meses</button>` : ''}
    </section>`;
}

// ---------------------------------------------------------------------------
// Aba inteira
// ---------------------------------------------------------------------------

export function estadoInicialAportes(dados, carrinho) {
  return {
    classeAtiva: 'acoes', busca: '', ordem: 'carteira', soComprar: false,
    // 05/10/2026: carrinho de um dia que passou NÃO ganha cotação nova (os números mudam de um dia pro
    // outro; ele só serve pra responder "Você comprou?" e confirmar com os preços do dia dele)
    carrinho: carrinho && carrinho.data && carrinho.data < dados.hoje ? carrinho : atualizarPrecos(carrinho, dados.classes), carrinhoAberto: false,
    eua: estadoInicialEua(dados, typeof globalThis !== 'undefined' ? globalThis.localStorage : null),
    digitados: {}, confirmando: null, abertos: {}, historicoTodos: false,
    ano: Number(dados.hoje.slice(0, 4)), mesSel: dados.hoje.slice(0, 7),
    mensagem: null, ocupado: false, mapa: estadoInicialMapa(),
  };
}

function mensagemHtml(estado) {
  if (!estado.mensagem) return '';
  return `<div class="tx-aviso ${estado.mensagem.tipo || ''}" role="status">${estado.mensagem.html}<button type="button" class="tx-aviso-fechar" data-acao="fechar-aviso" aria-label="Fechar">×</button></div>`;
}

/**
 * Desenha a aba e liga os eventos.
 * ctx: { doc, el, dados, estado, salvarCarrinho(c), salvarAporte(aporte), excluirAporte(id), aoMudarDados(novosAportes) }
 */
export function renderAportes(ctx) {
  const { doc, el, dados, estado } = ctx;
  el.innerHTML = `
    ${mensagemHtml(estado)}
    ${etapasHtml(estado, dados)}
    ${andamentoHtml(estado, dados)}
    ${novoAporteHtml(estado, dados)}
    ${mapaHtml(estado.mapa, dados)}
    ${historicoHtml(estado, dados)}
    ${resumoHtml(estado, dados)}`;
  // os eventos ficam no contêiner (delegados) e são ligados UMA vez; cada
  // redesenho só troca o contexto que eles leem
  el._txCtx = ctx;
  if (!el._txAportesLigado) { el._txAportesLigado = true; ligarAportes(el); }
  aposDesenharMapa(ctx);
  garantirMetasMomento(ctx);
}

function mudarCarrinho(ctx, novo, { prateleira = false } = {}) {
  const { el, dados, estado } = ctx;
  estado.carrinho = novo;
  ctx.salvarCarrinho(novo);
  const cart = el.querySelector('#txCarrinho');
  if (cart) cart.innerHTML = carrinhoConteudoHtml(estado, dados);
  const barra = el.querySelector('#txBarraCarrinho');
  if (barra) barra.innerHTML = barraCarrinhoHtml(estado, dados);
  const t = totaisCarrinho(novo, dados.cambio).porClasse;
  el.querySelectorAll('[data-conta-classe]').forEach((s) => {
    const c = t[s.getAttribute('data-conta-classe')];
    s.hidden = !c;
    s.textContent = c ? c.n : '';
  });
  const etapa = el.querySelector('.tx-etapas');
  if (etapa) etapa.outerHTML = etapasHtml(estado, dados);
  const nec = el.querySelector('#txEuaNecessidade');
  if (nec && estado.eua) nec.innerHTML = necessidadeHtml(estado, dados, totaisCarrinho(novo, dados.cambio).totalUsd);
  if (prateleira) {
    const lista = el.querySelector('#txPrateleiraLista');
    if (lista) lista.innerHTML = estado.classeAtiva === 'rendaFixa' ? prateleiraRfHtml(estado, dados) : prateleiraRvHtml(estado, dados, estado.classeAtiva);
  }
}

function atualizarLinhaRv(ctx, classe, ticker) {
  const { el, dados, estado } = ctx;
  const a = (dados.classes[classe] || []).find((x) => x.ticker === ticker);
  const it = estado.carrinho.itens[chaveItem(classe, ticker)];
  const cel = el.querySelector(`[data-subtotal="${classe}:${ticker}"]`);
  if (cel) {
    cel.innerHTML = it
      ? `${dinheiro(it.qtd * it.preco, it.moeda)}${it.moeda === 'USD' && dados.cambio > 0 ? brlHtml(it.qtd * it.preco * dados.cambio) : ''}`
      : '<span class="tx-fraco">—</span>';
  }
  const linha = el.querySelector(`[data-linha="${classe}:${ticker}"]`);
  if (linha) linha.classList.toggle('no-carrinho', !!it);
  return a;
}

function aoMudarQtd(ctx, chave, qtd, { escreverCampo = false } = {}) {
  const [classe, ticker] = chave.split(':');
  const a = (ctx.dados.classes[classe] || []).find((x) => x.ticker === ticker);
  if (!a) return;
  const preco = a.precoAtual > 0 ? a.precoAtual : ((a.ultimoPago && a.ultimoPago.preco) || 0);
  mudarCarrinho(ctx, definirQuantidade(ctx.estado.carrinho, { classe, ativo: ticker, moeda: a.moeda, preco }, qtd));
  atualizarLinhaRv(ctx, classe, ticker);
  if (escreverCampo) {
    const inp = ctx.el.querySelector(`[data-qtd="${chave}"]`);
    const it = ctx.estado.carrinho.itens[chaveItem(classe, ticker)];
    if (inp) inp.value = it ? numCampo(it.qtd) : '';
  }
}

function atualizarTotaisAndamento(ctx, id) {
  const { el, dados, estado } = ctx;
  const a = dados.aportes.find((x) => x.id === id);
  if (!a) return;
  const dig = estado.digitados[id] || {};
  a.itens.forEach((it, i) => {
    const cel = el.querySelector(`[data-aporte-card="${id}"] [data-total-i="${i}"]`);
    if (cel) cel.innerHTML = it.classe === 'rendaFixa' ? formatBRL(finalDoItem(it, dig[i] || {}).valor) : totalPagoHtml(finalDoItem(it, dig[i] || {}).valor, it.moeda, dados.cambio);
  });
  const pe = el.querySelector(`[data-rodape="${id}"]`);
  if (pe) pe.innerHTML = rodapeAndamentoHtml(a, estado, dados.cambio);
}

// ---------------------------------------------------------------------------
// Mapa de compras ("Aportes realizados"): trocar classe/período redesenha a
// seção; abrir/fechar o detalhe de um quadrado NÃO redesenha (a rolagem
// horizontal do mapa e o foco ficam onde estavam).
// ---------------------------------------------------------------------------

function redesenharMapa(ctx) {
  const s = ctx.el.querySelector('#txMapaCompras');
  if (s) s.outerHTML = mapaHtml(ctx.estado.mapa, ctx.dados);
  aposDesenharMapa(ctx);
}

/** Depois de desenhar: o mês mais recente sempre à vista (a tabela rola pra direita) e o popover no lugar. */
function aposDesenharMapa(ctx) {
  const wrap = ctx.el.querySelector('#txMapaWrap');
  if (wrap) {
    const sel = wrap.querySelector('.tx-mapa-cel.sel');
    if (!sel) wrap.scrollLeft = wrap.scrollWidth;
  }
  posicionarPopMapa(ctx);
}

/** Popover logo abaixo do quadrado (ou acima, se não couber); no celular o CSS vira uma folha presa embaixo. */
function posicionarPopMapa(ctx) {
  const pop = ctx.el.querySelector('#txMapaPop');
  const btn = ctx.el.querySelector('.tx-mapa-cel.sel');
  if (!pop || pop.hidden || !btn) return;
  const card = pop.parentElement;
  if (!card || typeof card.getBoundingClientRect !== 'function') return;
  const c = card.getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  const larg = pop.offsetWidth || 380;
  const alt = pop.offsetHeight || 0;
  let left = r.left - c.left + r.width / 2 - larg / 2;
  left = Math.max(8, Math.min(left, c.width - larg - 8));
  let top = r.bottom - c.top + 8;
  const win = ctx.doc.defaultView;
  const alturaTela = (win && win.innerHeight) || 0;
  if (alturaTela && alt && r.bottom + alt + 16 > alturaTela && r.top - alt - 16 > 0) top = r.top - c.top - alt - 8;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function abrirPopMapa(ctx, sel) {
  const { el, estado, dados } = ctx;
  estado.mapa.selecionado = sel;
  const pop = el.querySelector('#txMapaPop');
  if (!pop) { redesenharMapa(ctx); return; }
  pop.innerHTML = popoverMapaHtml(estado.mapa, dados);
  pop.hidden = !pop.innerHTML.trim();
  el.querySelectorAll('.tx-mapa-cel').forEach((b) => {
    const ativo = b.getAttribute('data-mapa-cel') === `${sel.ativo}|${sel.mes}`;
    b.classList.toggle('sel', ativo);
    b.setAttribute('aria-expanded', String(ativo));
  });
  posicionarPopMapa(ctx);
}

function fecharPopMapa(ctx, { focar = false } = {}) {
  const { el, estado } = ctx;
  const sel = estado.mapa.selecionado;
  estado.mapa.selecionado = null;
  const pop = el.querySelector('#txMapaPop');
  if (pop) { pop.hidden = true; pop.innerHTML = ''; }
  el.querySelectorAll('.tx-mapa-cel.sel').forEach((b) => { b.classList.remove('sel'); b.setAttribute('aria-expanded', 'false'); });
  if (focar && sel) {
    const b = el.querySelector(`[data-mapa-cel="${sel.ativo}|${sel.mes}"]`);
    if (b && typeof b.focus === 'function') b.focus();
  }
}

/** "Repetir no carrinho": a mesma quantidade (ou o mesmo valor, na RF) daquele mês, com a cotação de agora. */
function repetirDoMapa(ctx, ativo, mes) {
  const { el, doc, dados, estado } = ctx;
  const classe = estado.mapa.classeAtiva;
  const a = ativoDaCarteira(dados, classe, ativo);
  const cel = celulaMapa(dadosDoMapa(dados).compras, ativo, mes);
  if (!a || !cel) return;
  const rotulo = `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
  if (classe === 'rendaFixa') {
    estado.carrinho = definirValorRf(estado.carrinho, { ativo: a.titulo, instituicao: a.instituicao }, cel.valor);
    estado.mensagem = { tipo: 'ok', html: `<b>${esc(a.titulo)}</b> foi pro carrinho com ${formatBRL(cel.valor)}, o mesmo valor aplicado em ${rotulo}.` };
  } else {
    const preco = a.precoAtual > 0 ? a.precoAtual : cel.precoMedio;
    estado.carrinho = definirQuantidade(estado.carrinho, { classe, ativo, moeda: a.moeda, preco }, cel.qtd);
    const dif = cel.precoMedio ? (preco / cel.precoMedio - 1) * 100 : null;
    estado.mensagem = { tipo: 'ok', html: `<b>${esc(ativo)}</b> foi pro carrinho: ${qtdTxt(cel.qtd)} × ${precoTxt(preco, a.moeda)} (cotação de agora${dif != null && Math.abs(dif) >= 0.05 ? `, ${pct(dif)} vs os ${precoTxt(cel.precoMedio, a.moeda)} de ${rotulo}` : ''}).` };
  }
  ctx.salvarCarrinho(estado.carrinho);
  estado.classeAtiva = classe;
  estado.busca = '';
  estado.mapa.selecionado = null;
  renderAportes(ctx);
  const alvo = doc.getElementById('txNovoAporte');
  if (alvo && typeof alvo.scrollIntoView === 'function') alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const linha = el.querySelector(`[data-linha="${classe}:${ativo}"]`);
  if (linha && linha.classList) linha.classList.add('tx-destaque');
}

/** Salva o aporte e apaga os outros que foram juntados nele (uma chamada por vez; a última devolve a lista certa). */
async function salvarEExcluir(ctx, aporte, apagar) {
  let r = await ctx.salvarAporte(aporte);
  for (const a of apagar) {
    if (!r || !r.ok) return r;
    r = await ctx.excluirAporte(a.id);
  }
  return r;
}

async function executar(ctx, fn, sucesso) {
  const { estado } = ctx;
  if (estado.ocupado) return;
  estado.ocupado = true;
  ctx.el.querySelectorAll('button').forEach((b) => { if (b.dataset.acao) b.disabled = true; });
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, erro: String(e) }; }
  estado.ocupado = false;
  if (!r || !r.ok) {
    estado.mensagem = { tipo: 'erro', html: `Não deu certo: ${esc((r && r.erro) || 'erro desconhecido')}.` };
    renderAportes(ctx);
    return;
  }
  if (Array.isArray(r.aportes)) ctx.aoMudarDados(r.aportes);
  if (r.caixaDolar) { ctx.dados.caixaDolar = r.caixaDolar; if (typeof ctx.aoMudarCaixa === 'function') ctx.aoMudarCaixa(r.caixaDolar); }
  sucesso(r);
  renderAportes(ctx);
}

/** Refaz só o fluxo das Ações EUA (o resto da aba fica como está). */
function redesenharEua(ctx) {
  const { el, dados, estado } = ctx;
  const f = el.querySelector('#txEuaFluxo');
  if (f) f.outerHTML = euaFluxoHtml(estado, dados, totaisCarrinho(estado.carrinho, dados.cambio).totalUsd);
}

function atualizarResultadoRemessa(ctx) {
  const r = ctx.el.querySelector('#txRemResultado');
  if (r) r.innerHTML = remessaResultadoHtml(ctx.estado, ctx.dados);
}

/** 05/10/2026: "Sugerir divisão" - o caixa em dólar dividido pelos alvos do Radar; vai direto pro carrinho. */
function sugerirDivisaoEua(ctx) {
  const { dados, estado } = ctx;
  const caixa = caixaValido(dados.caixaDolar);
  const s = sugerirDivisaoCaixa(dados.classes.acoesEua || [], caixa.saldoUsd, { metas: dados.metas, hoje: dados.hoje, cambio: dados.cambio, metasObjetivos: estado.metasObjetivos || null, macro: estado.macro || null });
  let novo = estado.carrinho;
  Object.keys(novo.itens).filter((k) => novo.itens[k].classe === 'acoesEua').forEach((k) => { novo = removerDoCarrinho(novo, k); });
  s.itens.forEach((i) => { novo = definirQuantidade(novo, { classe: 'acoesEua', ativo: i.ticker, moeda: 'USD', preco: i.preco }, i.qtd); });
  estado.eua.sugestao = s;
  mudarCarrinho(ctx, novo, { prateleira: true });
  redesenharEua(ctx);
}

/** Tesouro pelo nome: { nome, pu } da lista de hoje do Tesouro ou da carteira (null se não for Tesouro/sem PU). */
function tesouroDoNome(dados, nome) {
  if (!ehTesouro(nome)) return null;
  const achado = acharTesouroHoje(dados.tesouro, nome);
  if (achado && achado.pu > 0) return { nome: achado.nome, pu: achado.pu };
  const daCarteira = acharTesouroHoje((dados.classes.rendaFixa || []).map((a) => ({ nome: a.titulo, pu: puDoTitulo(a) })), nome);
  return daCarteira && daCarteira.pu > 0 ? { nome: daCarteira.nome, pu: daCarteira.pu } : null;
}

function atualizarInfoRfNovo(ctx) {
  const { el, dados } = ctx;
  const info = el.querySelector('#txRfNovoInfo');
  if (!info) return;
  const t = tesouroDoNome(dados, el.querySelector('#txRfNovoTitulo').value);
  if (!t) { info.innerHTML = ''; return; }
  const valor = lerNumeroCampo(el.querySelector('#txRfNovoValor').value);
  const c = valor > 0 ? compraPorValor(valor, t.pu) : null;
  info.innerHTML = rfInfoHtml(t.pu, c && c.qtd > 0 ? { qtd: c.qtd, valor: c.valor } : null, { sobra: c ? c.sobra : 0, abaixo: !!(c && c.abaixoMinimo) });
}

/** Depois de mexer no valor ou na quantidade de um Tesouro: a outra caixinha, a linha e o texto embaixo. */
function atualizarLinhaRf(ctx, k, pu, { sobra = 0, abaixo = false, origem = 'valor' } = {}) {
  const { el, doc, estado } = ctx;
  const it = estado.carrinho.itens[k];
  const linha = el.querySelector(`[data-linha="${k}"]`);
  if (linha) linha.classList.toggle('no-carrinho', !!it);
  if (!(pu > 0)) return;
  const ativo = doc.activeElement;
  const campoValor = el.querySelector(`[data-rf="${k}"]`);
  const campoQtd = el.querySelector(`[data-rf-qtd="${k}"]`);
  if (origem === 'qtd' && campoValor && campoValor !== ativo) campoValor.value = it ? dinheiroCampo(it.valor) : '';
  if (origem === 'valor' && campoQtd && campoQtd !== ativo) campoQtd.value = it ? numCampo(it.qtd) : '';
  const info = el.querySelector(`[data-rf-info="${k}"]`);
  if (info) info.innerHTML = rfInfoHtml(pu, it, { sobra, abaixo });
}

function ligarAportes(el) {
  el.addEventListener('click', (ev) => {
    const ctx = el._txCtx;
    const { doc, dados, estado } = ctx;
    const redesenhar = () => renderAportes(ctx);
    // clicar fora do popover do mapa (e fora de outro quadrado) fecha ele
    if (estado.mapa.selecionado && !ev.target.closest('#txMapaPop') && !ev.target.closest('[data-mapa-cel]')) fecharPopMapa(ctx);
    const alvo = ev.target.closest('[data-acao],[data-classe],[data-passo],[data-tirar],[data-mes],[data-ano],[data-rolar],[data-mapa-classe],[data-mapa-periodo],[data-mapa-cel],[data-mapa-fechar],[data-mapa-grafico],[data-mapa-repetir],[data-rem-modo]');
    if (!alvo || !el.contains(alvo)) return;
    if (alvo.hasAttribute('data-rolar')) {
      const destino = doc.getElementById(alvo.getAttribute('data-rolar'));
      if (destino) { ev.preventDefault(); if (typeof destino.scrollIntoView === 'function') destino.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    if (alvo.hasAttribute('data-rem-modo')) {
      const r = remessaDoEstado(estado, dados);
      const modo = alvo.getAttribute('data-rem-modo');
      if (r && modo !== estado.eua.modo) estado.eua.valor = dinheiroCampo(modo === 'dolares' ? r.usd : r.reais);
      estado.eua.modo = modo;
      redesenharEua(ctx);
      return;
    }
    if (alvo.hasAttribute('data-mapa-classe')) {
      estado.mapa.classeAtiva = alvo.getAttribute('data-mapa-classe');
      estado.mapa.selecionado = null;
      redesenharMapa(ctx);
      return;
    }
    if (alvo.hasAttribute('data-mapa-periodo')) {
      estado.mapa.periodo = Number(alvo.getAttribute('data-mapa-periodo'));
      estado.mapa.selecionado = null;
      redesenharMapa(ctx);
      return;
    }
    if (alvo.hasAttribute('data-mapa-cel')) {
      const [ativo, mes] = alvo.getAttribute('data-mapa-cel').split('|');
      const sel = estado.mapa.selecionado;
      if (sel && sel.ativo === ativo && sel.mes === mes) { fecharPopMapa(ctx); return; }
      abrirPopMapa(ctx, { ativo, mes });
      return;
    }
    if (alvo.hasAttribute('data-mapa-fechar')) { fecharPopMapa(ctx, { focar: true }); return; }
    if (alvo.hasAttribute('data-mapa-repetir')) {
      repetirDoMapa(ctx, ...alvo.getAttribute('data-mapa-repetir').split('|'));
      return;
    }
    if (alvo.hasAttribute('data-mapa-grafico')) {
      const win = doc.defaultView;
      if (win && typeof win.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent('transacoes:verGrafico', { detail: { ativo: alvo.getAttribute('data-mapa-grafico') } }));
      return;
    }
    if (alvo.hasAttribute('data-classe')) {
      estado.classeAtiva = alvo.getAttribute('data-classe');
      estado.busca = '';
      const p = el.querySelector('#txPrateleira');
      if (p) { p.innerHTML = prateleiraHtml(estado, dados); }
      return;
    }
    if (alvo.hasAttribute('data-passo')) {
      const chave = alvo.closest('[data-stepper]').getAttribute('data-stepper');
      const it = estado.carrinho.itens[chave];
      aoMudarQtd(ctx, chave, Math.max(0, Math.floor(((it && it.qtd) || 0) + Number(alvo.getAttribute('data-passo')))), { escreverCampo: true });
      return;
    }
    if (alvo.hasAttribute('data-tirar')) {
      mudarCarrinho(ctx, removerDoCarrinho(estado.carrinho, alvo.getAttribute('data-tirar')), { prateleira: true });
      return;
    }
    if (alvo.hasAttribute('data-mes')) { estado.mesSel = alvo.getAttribute('data-mes'); redesenharResumo(ctx); return; }
    if (alvo.hasAttribute('data-ano')) {
      const ano = Number(alvo.getAttribute('data-ano'));
      if (ano) { estado.ano = ano; estado.mesSel = `${ano}-${ano === Number(dados.hoje.slice(0, 4)) ? dados.hoje.slice(5, 7) : '12'}`; redesenharResumo(ctx); }
      return;
    }
    const acao = alvo.getAttribute('data-acao');
    const id = alvo.getAttribute('data-id');
    if (acao === 'fechar-aviso') { estado.mensagem = null; const av = el.querySelector('.tx-aviso'); if (av) av.remove(); return; }
    if (acao === 'abrir-carrinho' || acao === 'fechar-carrinho') {
      estado.carrinhoAberto = acao === 'abrir-carrinho';
      el.querySelector('#txCarrinho').classList.toggle('aberto', estado.carrinhoAberto);
      el.querySelector('.tx-recibo-fundo').hidden = !estado.carrinhoAberto;
      return;
    }
    if (acao === 'rem-registrar') {
      const r = remessaDoEstado(estado, dados);
      if (!r || !ctx.salvarCaixaDolar) { estado.mensagem = { tipo: 'erro', html: 'Informe quanto vai enviar (em R$ ou em US$) antes de registrar o envio.' }; redesenhar(); return; }
      const mov = { data: estado.eua.data || dados.hoje, tipo: 'envio', usd: r.usd, reais: r.reais, comercial: r.comercial, vet: r.vet, conversao: r.conversao, encargos: r.encargos, observacao: 'Remessa Online (estimativa)' };
      executar(ctx, () => ctx.salvarCaixaDolar(mov), () => {
        estado.eua.valor = '';
        estado.mensagem = { tipo: 'ok', html: `Envio registrado: <b>${usd(r.usd)}</b> no caixa em dólar (${formatBRL(r.reais)} enviados, VET R$ ${formatNumeroBR(r.vet, 4)}). Agora é só comprar as ações com ele, hoje ou depois.` };
      });
      return;
    }
    if (acao === 'rem-excluir') {
      executar(ctx, () => ctx.excluirCaixaDolar(id), () => { estado.mensagem = { tipo: 'ok', html: 'Lançamento apagado do caixa em dólar.' }; });
      return;
    }
    if (acao === 'eua-sugerir') { sugerirDivisaoEua(ctx); return; }
    if (acao === 'eua-preparar-envio') {
      const v = Number(alvo.getAttribute('data-usd'));
      estado.eua.modo = 'dolares';
      estado.eua.valor = dinheiroCampo(v);
      estado.carrinhoAberto = false;
      const cart = el.querySelector('#txCarrinho');
      if (cart) cart.classList.remove('aberto');
      const fundo = el.querySelector('.tx-recibo-fundo');
      if (fundo) fundo.hidden = true;
      redesenharEua(ctx);
      const passo = doc.getElementById('txEuaEnviar');
      if (passo && typeof passo.scrollIntoView === 'function') passo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (acao === 'juntar-dia') {
      const lista = aguardandoDoDia(dados.aportes, alvo.getAttribute('data-dia'));
      if (lista.length < 2) return;
      const base = lista[lista.length - 1];
      const outros = lista.filter((a) => a.id !== base.id);
      const junto = outros.reduce((acc, a) => mesclarAportes(acc, a), base);
      executar(ctx, () => salvarEExcluir(ctx, junto, outros), () => {
        estado.mensagem = { tipo: 'ok', html: `Aportes de ${dma(base.data)} juntos em um só (${junto.itens.length} ativo${junto.itens.length > 1 ? 's' : ''}).` };
      });
      return;
    }
    if (acao === 'esvaziar') { mudarCarrinho(ctx, carrinhoVazio(dados.hoje), { prateleira: true }); return; }
    if (acao === 'descartar-edicao') { estado.carrinhoAberto = false; mudarCarrinho(ctx, carrinhoVazio(dados.hoje), { prateleira: true }); return; }
    if (acao === 'historico-todos') { estado.historicoTodos = true; redesenhar(); return; }
    if (acao === 'voltar') { estado.confirmando = null; redesenhar(); return; }
    if (acao === 'cancelar' || acao === 'excluir') { estado.confirmando = `${acao}:${id}`; if (acao === 'excluir') estado.abertos[id] = true; redesenhar(); return; }
    if (acao === 'confirmar-carrinho') {
      const editando = !!estado.carrinho.editandoId;
      // 05/10/2026: outro carrinho no MESMO dia soma no aporte que já está aguardando (não duplica o confirmado)
      const mesmoDia = !editando ? aguardandoDoDia(dados.aportes, estado.carrinho.data) : [];
      const base = mesmoDia.length ? mesmoDia[mesmoDia.length - 1] : null;
      const outros = mesmoDia.filter((a) => !base || a.id !== base.id);
      let aporte = aporteDoCarrinho(estado.carrinho);
      if (base) aporte = outros.reduce((acc, a) => mesclarAportes(acc, a), mesclarAporteComCarrinho(base, estado.carrinho));
      executar(ctx, () => salvarEExcluir(ctx, aporte, outros), () => {
        estado.carrinho = carrinhoVazio(dados.hoje);
        ctx.salvarCarrinho(estado.carrinho);
        estado.carrinhoAberto = false;
        estado.mensagem = { tipo: 'ok', html: base
          ? `Carrinho <b>somado</b> ao aporte de ${dma(aporte.data)} que já estava aguardando valores finais (agora com ${aporte.itens.length} ativo${aporte.itens.length > 1 ? 's' : ''}). Nada duplicado.`
          : `${editando ? 'Aporte atualizado' : 'Aporte confirmado'}: <b>aguardando valores finais</b>. Depois de comprar, ajuste quantidade e preço e conclua.` };
      });
      return;
    }
    if (acao === 'editar') {
      const a = dados.aportes.find((x) => x.id === id);
      if (!a) return;
      mudarCarrinho(ctx, carrinhoDoAporte(a), { prateleira: true });
      const alvoCart = doc.getElementById('txNovoAporte');
      if (alvoCart && typeof alvoCart.scrollIntoView === 'function') alvoCart.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (acao === 'repetir') {
      const a = dados.aportes.find((x) => x.id === id);
      if (!a) return;
      mudarCarrinho(ctx, carrinhoRepetindo(a, dados.hoje, dados.classes), { prateleira: true });
      estado.mensagem = { tipo: 'ok', html: `Os ativos do aporte de ${dma(a.data)} foram pro carrinho, com a cotação de agora.` };
      redesenhar();
      const alvoCart = doc.getElementById('txNovoAporte');
      if (alvoCart && typeof alvoCart.scrollIntoView === 'function') alvoCart.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (acao === 'concluir') {
      const a = dados.aportes.find((x) => x.id === id);
      if (!a) return;
      const concluido = concluirAporte(a, estado.digitados[id] || {});
      if (!concluido.itens.some((it) => it.valorFinal > 0)) {
        estado.mensagem = { tipo: 'erro', html: 'Nenhum ativo com quantidade/valor pago. Se não comprou nada, use "Cancelar aporte".' };
        redesenhar();
        return;
      }
      executar(ctx, () => ctx.salvarAporte(concluido), () => {
        delete estado.digitados[id];
        estado.mensagem = { tipo: 'ok', html: `Compra de ${dma(a.data)} concluída: <b>${formatBRL(totalAporte(concluido, 'final', dados.cambio))}</b>. Amanhã, importe o extrato na aba Lançamentos.` };
      });
      return;
    }
    if (acao === 'cancelar-sim' || acao === 'excluir-sim') {
      executar(ctx, () => ctx.excluirAporte(id), () => {
        if (estado.carrinho.editandoId === id) { estado.carrinho = carrinhoVazio(dados.hoje); ctx.salvarCarrinho(estado.carrinho); }
        estado.confirmando = null;
        delete estado.digitados[id];
        estado.mensagem = { tipo: 'ok', html: acao === 'cancelar-sim' ? 'Aporte cancelado.' : 'Aporte excluído do planejamento.' };
      });
    }
  });

  el.addEventListener('keydown', (ev) => {
    const ctx = el._txCtx;
    if (ev.key === 'Escape' && ctx && ctx.estado.mapa.selecionado) fecharPopMapa(ctx, { focar: true });
  });
  const win = el.ownerDocument && el.ownerDocument.defaultView;
  if (win && typeof win.addEventListener === 'function') win.addEventListener('resize', () => { if (el._txCtx) posicionarPopMapa(el._txCtx); });

  el.addEventListener('toggle', (ev) => {
    const { estado } = el._txCtx;
    const d = ev.target;
    if (d && d.matches && d.matches('details[data-hist]')) estado.abertos[d.getAttribute('data-hist')] = d.open;
    if (d && d.matches && d.matches('details[data-eua-taxas]')) estado.eua.taxasAbertas = d.open;
  }, true);

  el.addEventListener('input', (ev) => {
    const ctx = el._txCtx;
    const { dados, estado } = ctx;
    const t = ev.target;
    if (t.matches('[data-qtd]')) {
      const n = lerNumeroCampo(t.value);
      aoMudarQtd(ctx, t.getAttribute('data-qtd'), n || 0);
      return;
    }
    if (t.matches('[data-rf]') || t.matches('[data-rf-qtd]')) {
      // 05/10/2026: no Tesouro Direto o valor e a quantidade de títulos (2 casas) andam juntos: qtd = valor ÷ PU
      const porQtd = t.matches('[data-rf-qtd]');
      const k = t.getAttribute(porQtd ? 'data-rf-qtd' : 'data-rf');
      const ref = { ativo: t.getAttribute('data-titulo'), instituicao: t.getAttribute('data-inst') };
      const pu = Number(t.getAttribute('data-pu')) || 0;
      const n = lerNumeroCampo(t.value);
      let novo;
      let extra = {};
      if (pu > 0 && n > 0) {
        const c = porQtd ? compraPorQuantidade(n, pu) : compraPorValor(n, pu);
        novo = c.qtd > 0 ? definirValorRf(estado.carrinho, ref, c.valor, { qtd: c.qtd, pu }) : definirValorRf(estado.carrinho, ref, 0);
        extra = { sobra: c.sobra, abaixo: c.abaixoMinimo };
      } else novo = definirValorRf(estado.carrinho, ref, pu > 0 ? 0 : (n || 0));
      mudarCarrinho(ctx, novo);
      atualizarLinhaRf(ctx, k, pu, { ...extra, origem: porQtd ? 'qtd' : 'valor' });
      return;
    }
    if (t.id === 'txRfNovoTitulo' || t.id === 'txRfNovoValor') { atualizarInfoRfNovo(ctx); return; }
    if (t.id === 'txRemValor') { estado.eua.valor = t.value; atualizarResultadoRemessa(ctx); return; }
    if (t.id === 'txRemCom') { estado.eua.comercial = t.value; atualizarResultadoRemessa(ctx); return; }
    if (t.id === 'txRemConv' || t.id === 'txRemEnc') {
      // taxas médias editáveis: as do Tiago ficam guardadas neste navegador
      const pctCampo = lerNumeroCampo(t.value);
      if (pctCampo != null && pctCampo >= 0 && pctCampo <= 20) {
        estado.eua.taxas = { ...estado.eua.taxas, [t.id === 'txRemConv' ? 'conversao' : 'encargos']: pctCampo / 100 };
        gravarTaxasRemessa(estado.eua.taxas);
        atualizarResultadoRemessa(ctx);
      }
      return;
    }
    if (t.id === 'txEuaAjusteValor') { estado.eua.ajuste = t.value; return; }
    if (t.matches('[data-final]')) {
      const id = t.getAttribute('data-aporte');
      const i = Number(t.getAttribute('data-i'));
      const dig = estado.digitados[id] || (estado.digitados[id] = {});
      const campo = t.getAttribute('data-final');
      const n = lerNumeroCampo(t.value);
      dig[i] = { ...(dig[i] || {}), [campo]: n == null ? 0 : n };
      atualizarTotaisAndamento(ctx, id);
      return;
    }
    if (t.id === 'txBusca') {
      estado.busca = t.value;
      const lista = el.querySelector('#txPrateleiraLista');
      if (lista) lista.innerHTML = estado.classeAtiva === 'rendaFixa' ? prateleiraRfHtml(estado, dados) : prateleiraRvHtml(estado, dados, estado.classeAtiva);
      return;
    }
    if (t.id === 'txObsAporte') { estado.carrinho = { ...estado.carrinho, observacao: t.value }; ctx.salvarCarrinho(estado.carrinho); }
  });

  el.addEventListener('change', (ev) => {
    const ctx = el._txCtx;
    const { dados, estado } = ctx;
    const t = ev.target;
    if (t.matches('[data-qtd]')) { aoMudarQtd(ctx, t.getAttribute('data-qtd'), lerNumeroCampo(t.value) || 0, { escreverCampo: true }); return; }
    if (t.id === 'txRemData' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { estado.eua.data = t.value; return; }
    if (t.id === 'txDataAporte' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { estado.carrinho = { ...estado.carrinho, data: t.value }; ctx.salvarCarrinho(estado.carrinho); return; }
    if (t.id === 'txOrdem' || t.id === 'txSoComprar') {
      if (t.id === 'txOrdem') estado.ordem = t.value; else estado.soComprar = t.checked;
      const lista = el.querySelector('#txPrateleiraLista');
      if (lista) lista.innerHTML = estado.classeAtiva === 'rendaFixa' ? prateleiraRfHtml(estado, dados) : prateleiraRvHtml(estado, dados, estado.classeAtiva);
    }
  });

  el.addEventListener('submit', (ev) => {
    const ctx = el._txCtx;
    const { estado, dados } = ctx;
    if (ev.target.id === 'txEuaAjuste') {
      ev.preventDefault();
      const certo = lerNumeroEua(el.querySelector('#txEuaAjusteValor').value);
      if (certo == null || certo < 0 || !ctx.salvarCaixaDolar) return;
      const diff = Math.round((certo - caixaValido(dados.caixaDolar).saldoUsd) * 100) / 100;
      if (!diff) { estado.mensagem = { tipo: 'ok', html: 'O saldo do caixa já está nesse valor.' }; renderAportes(ctx); return; }
      executar(ctx, () => ctx.salvarCaixaDolar({ data: estado.eua.data || dados.hoje, tipo: 'ajuste', usd: diff, observacao: 'Acerto de saldo' }), () => {
        estado.eua.ajuste = '';
        estado.mensagem = { tipo: 'ok', html: `Saldo do caixa em dólar acertado: ${usd(certo)}.` };
      });
      return;
    }
    if (ev.target.id !== 'txRfNovo') return;
    ev.preventDefault();
    const titulo = el.querySelector('#txRfNovoTitulo').value.trim();
    const inst = el.querySelector('#txRfNovoInst').value.trim();
    const valor = lerNumeroCampo(el.querySelector('#txRfNovoValor').value);
    if (!titulo || !(valor > 0)) return;
    const tes = tesouroDoNome(dados, titulo);
    if (tes) {
      // Tesouro: valor vira quantidade com 2 casas (valor ÷ PU) e o mínimo é 1% do PU
      const c = compraPorValor(valor, tes.pu);
      if (c.qtd <= 0) { atualizarInfoRfNovo(ctx); return; }
      mudarCarrinho(ctx, definirValorRf(estado.carrinho, { ativo: tes.nome, instituicao: inst }, c.valor, { qtd: c.qtd, pu: tes.pu }), { prateleira: true });
      return;
    }
    mudarCarrinho(ctx, definirValorRf(estado.carrinho, { ativo: titulo, instituicao: inst }, valor), { prateleira: true });
  });
}

function redesenharResumo(ctx) {
  const s = ctx.el.querySelector('#txResumo');
  if (s) s.outerHTML = resumoHtml(ctx.estado, ctx.dados);
}
