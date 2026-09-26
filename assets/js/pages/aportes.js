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

import { formatBRL, formatNumeroBR } from '../format.js';
import { logoAtivoHtml, logoRendaFixaHtml, statusVies } from './carteiras-classe-comum.js';
import { urlAtivoTicker } from '../link-ativo.js';
import {
  CLASSES_APORTE, NOME_CLASSE_APORTE, MESES_CURTOS, MESES_LONGOS,
  chaveItem, carrinhoVazio, definirQuantidade, definirValorRf, removerDoCarrinho, atualizarPrecos,
  itensDoCarrinho, totaisCarrinho, aporteDoCarrinho, carrinhoDoAporte, carrinhoRepetindo,
  finalDoItem, concluirAporte, totalAporte, classesDoAporte, anosDoResumo, mesesDoAno, aportesPorMes, momentoAporte,
} from './aportes-calc.js';
import { momentoHtml } from './momento-aporte.js';

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

function linhaAndamentoHtml(a, it, i, dig) {
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
      <td data-rot="Planejado"><span class="tx-planejado">${qtdTxt(it.qtdPlanejada)} × ${precoTxt(it.precoPlanejado, it.moeda)}</span><small>${dinheiro(it.valorPlanejado, it.moeda)}</small></td>
      <td data-rot="Qtd final">${inputHtml(`data-final="qtd" data-aporte="${esc(a.id)}" data-i="${i}"`, numCampo(dig.qtd != null ? dig.qtd : (it.qtdFinal != null ? it.qtdFinal : it.qtdPlanejada)), { decimal: it.moeda === 'USD', rotulo: `Quantidade comprada de ${it.ativo}` })}</td>
      <td data-rot="Preço pago">${inputHtml(`data-final="preco" data-aporte="${esc(a.id)}" data-i="${i}"`, dinheiroCampo(dig.preco != null ? dig.preco : (it.precoFinal != null ? it.precoFinal : it.precoPlanejado)), { rotulo: `Preço pago em ${it.ativo}`, prefixo: pre })}</td>
      <td data-rot="Total pago" class="tx-final-total" data-total-i="${i}">${dinheiro(f.valor, it.moeda)}</td>
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

function andamentoHtml(estado, dados) {
  const lista = dados.aportes.filter((a) => a.status === 'aguardando');
  if (!lista.length) return '';
  return `
    <section class="tx-secao" id="txAndamento" aria-labelledby="txAndamentoTitulo">
      <div class="tx-secao-cab">
        <h2 id="txAndamentoTitulo">Aguardando valores finais</h2>
        <span class="hint">confira quantidade e preço de cada ordem executada e conclua</span>
      </div>
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
              <tbody>${a.itens.map((it, i) => linhaAndamentoHtml(a, it, i, dig[i] || {})).join('')}</tbody>
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

function ultimoPagoHtml(a, hoje) {
  const u = a.ultimoPago;
  if (!u || !(u.preco > 0)) return '<span class="tx-fraco">—</span>';
  const dif = a.precoAtual > 0 ? ((a.precoAtual / u.preco) - 1) * 100 : null;
  const dias = hoje && u.data ? diasEntre(u.data, hoje) : null;
  return `
    <span class="tx-ultimo">
      <b>${precoTxt(u.preco, a.moeda)}</b>
      <small>${dm(u.data)}${dias != null && dias >= 0 ? ` · há ${dias}d` : ''}${u.origem === 'aporte' ? ' · aporte' : ''}</small>
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
  const lista = filtrarPrateleira(dados.classes[classe] || [], estado, { classe, metas: dados.metas, hoje: dados.hoje });
  if (!lista.length) return `<p class="tx-vazio">${(dados.classes[classe] || []).length ? 'Nenhum ativo com esse filtro.' : 'Nenhum ativo dessa classe na carteira.'}</p>`;
  const linhas = lista.map((a) => {
    const it = estado.carrinho.itens[chaveItem(classe, a.ticker)];
    const qtd = it ? it.qtd : 0;
    const vies = statusVies(a.vies);
    const variacao = typeof a.variacaoDia === 'number' ? a.variacaoDia * 100 : null;
    return `
      <tr class="${qtd ? 'no-carrinho' : ''}" data-linha="${esc(classe)}:${esc(a.ticker)}">
        <td class="esq"><a class="tx-ativo" href="${esc(urlAtivoTicker(a.ticker))}">${logoAtivoHtml(a.ticker)}<span class="tx-ativo-nome"><b>${esc(a.ticker)}</b><small>${esc(a.nome || '')}</small></span></a></td>
        <td data-rot="Cotação"><b class="tx-mono">${precoTxt(a.precoAtual, a.moeda)}</b>${variacao != null ? `<small class="${variacao >= 0 ? 'good' : 'bad'}">${pct(variacao, 2)} hoje</small>` : ''}</td>
        <td data-rot="Último pago">${ultimoPagoHtml(a, dados.hoje)}</td>
        <td data-rot="Preço-teto">${tetoHtml(a)}</td>
        <td data-rot="Viés">${vies.classe ? `<span class="status-pill ${vies.classe}">${vies.texto}</span>` : '<span class="tx-fraco">—</span>'}</td>
        <td data-rot="Na classe" class="tx-mono">${formatNumeroBR((a.peso || 0) * 100, 1)}%</td>
        <td data-rot="Quantidade" class="tx-td-qtd">${stepperHtml(classe, a.ticker, qtd, a.moeda)}</td>
        <td data-rot="Subtotal" class="tx-subtotal" data-subtotal="${esc(classe)}:${esc(a.ticker)}">${qtd ? dinheiro(qtd * (a.precoAtual || 0), a.moeda) : '<span class="tx-fraco">—</span>'}</td>
      </tr>${momentoLinhaHtml(momentoAporte(a, classe, dados.metas, dados.hoje), 8)}`;
  }).join('');
  return `
    <div class="tx-tabela-wrap">
      <table class="tx-tabela tx-prateleira">
        <thead><tr><th class="esq">Ativo</th><th>Cotação</th><th>Último pago</th><th>Preço-teto</th><th>Viés</th><th>Na classe</th><th>Quantidade</th><th>Subtotal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

function momentoLinhaHtml(m, colunas) {
  const html = momentoHtml(m);
  return html ? `<tr class="tx-momento-tr"><td colspan="${colunas}" class="esq">${html}</td></tr>` : '';
}

function prateleiraRfHtml(estado, dados) {
  const lista = filtrarPrateleira(dados.classes.rendaFixa || [], estado, { classe: 'rendaFixa', metas: dados.metas, hoje: dados.hoje });
  const linhas = lista.map((a) => {
    const k = chaveItem('rendaFixa', a.titulo, a.instituicao);
    const it = estado.carrinho.itens[k];
    const u = a.ultimoPago;
    return `
      <tr class="${it ? 'no-carrinho' : ''}" data-linha="${esc(k)}">
        <td class="esq"><span class="tx-ativo">${logoRendaFixaHtml({ indexador: a.indexador, tipoInvestimento: a.tipo, instituicao: a.instituicao })}<span class="tx-ativo-nome"><b>${esc(a.titulo)}</b><small>${esc(a.instituicao)}${a.categoria ? ` · ${esc(a.categoria)}` : ''}</small></span></span></td>
        <td data-rot="Valor atual"><b class="tx-mono">${formatBRL(a.valorAtualizado)}</b></td>
        <td data-rot="Último aporte">${u && u.valor > 0 ? `<span class="tx-ultimo"><b>${formatBRL(u.valor)}</b><small>${dma(u.data)}${u.origem === 'aporte' ? ' · aporte' : ''}</small></span>` : '<span class="tx-fraco">—</span>'}</td>
        <td data-rot="Vencimento" class="tx-mono">${a.vencimento ? dma(a.vencimento) : '—'}</td>
        <td data-rot="Aplicar" class="tx-td-qtd">${inputHtml(`class="tx-valor-rf" data-rf="${esc(k)}" data-titulo="${esc(a.titulo)}" data-inst="${esc(a.instituicao)}"`, it ? dinheiroCampo(it.valor) : '', { rotulo: `Valor a aplicar em ${a.titulo}`, prefixo: 'R$' })}</td>
      </tr>${momentoLinhaHtml(momentoAporte(a, 'rendaFixa', dados.metas, dados.hoje), 5)}`;
  }).join('');
  return `
    <div class="tx-tabela-wrap">
      <table class="tx-tabela tx-prateleira tx-prateleira-rf">
        <thead><tr><th class="esq">Título</th><th>Valor atual</th><th>Último aporte</th><th>Vencimento</th><th>Aplicar</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="5" class="tx-vazio">Nenhum título com esse filtro.</td></tr>'}</tbody>
      </table>
    </div>
    <form class="tx-rf-novo" id="txRfNovo" autocomplete="off">
      <span class="tx-rf-novo-rot">Título novo</span>
      <input type="text" id="txRfNovoTitulo" placeholder="Ex.: Tesouro IPCA+ 2035" aria-label="Nome do título" required>
      <input type="text" id="txRfNovoInst" placeholder="Instituição" aria-label="Instituição" list="txInstituicoes">
      <label class="tx-campo"><span class="tx-campo-pre">R$</span><input type="text" inputmode="decimal" id="txRfNovoValor" placeholder="0,00" aria-label="Valor a aplicar" required></label>
      <button type="submit" class="btn btn-ghost tx-btn-sm">Adicionar</button>
      <datalist id="txInstituicoes">${[...new Set((dados.classes.rendaFixa || []).map((a) => a.instituicao).filter(Boolean))].map((i) => `<option value="${esc(i)}"></option>`).join('')}</datalist>
    </form>`;
}

export function filtrarPrateleira(lista, estado, { classe = estado.classeAtiva, metas = null, hoje = '' } = {}) {
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
    const pontos = new Map(out.map((a) => [a, momentoAporte(a, classe, metas, hoje).pontos]));
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
    <div id="txPrateleiraLista">${rf ? prateleiraRfHtml(estado, dados) : prateleiraRvHtml(estado, dados, estado.classeAtiva)}</div>
    <p class="tx-momento-nota">Embaixo de cada ativo, a leitura dos <b>seus</b> critérios: preço-teto, % desejado do Radar, preço médio, última compra, P/VP e P/L${rf ? ', taxa de hoje x a sua média contratada e as metas de Renda Fixa' : ''}. Não é recomendação de compra.</p>`;
}

function carrinhoConteudoHtml(estado, dados) {
  const c = estado.carrinho;
  const itens = itensDoCarrinho(c);
  const t = totaisCarrinho(c, dados.cambio);
  const editando = c.editandoId ? dados.aportes.find((a) => a.id === c.editandoId) : null;
  const grupos = CLASSES_APORTE.filter((cl) => t.porClasse[cl.id]).map((cl) => `
    <div class="tx-recibo-grupo">
      <div class="tx-recibo-grupo-cab">${dotHtml(cl.id)}<b>${cl.nome}</b><span>${cl.id === 'acoesEua' ? usd(t.porClasse[cl.id].valor) : formatBRL(t.porClasse[cl.id].brl)}</span></div>
      ${itens.filter((it) => it.classe === cl.id).map((it) => `
        <div class="tx-recibo-linha">
          <span class="tx-recibo-ativo"><b>${esc(it.ativo)}</b><small>${it.classe === 'rendaFixa' ? esc(it.instituicao || 'aplicação') : `${qtdTxt(it.qtd)} × ${precoTxt(it.preco, it.moeda)}`}</small></span>
          <span class="tx-recibo-valor">${dinheiro(it.subtotal, it.moeda)}</span>
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
    <div class="tx-recibo-campos">
      <label class="tx-rotulo">Data da compra<input type="date" id="txDataAporte" value="${esc(c.data)}"></label>
      <label class="tx-rotulo">Observação<input type="text" id="txObsAporte" value="${esc(c.observacao || '')}" placeholder="opcional" maxlength="140"></label>
    </div>
    <div class="tx-recibo-acoes">
      <button type="button" class="btn btn-primary" data-acao="confirmar-carrinho"${itens.length ? '' : ' disabled'}>${editando ? 'Salvar alterações' : 'Confirmar aporte'}</button>
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

function historicoHtml(estado, dados) {
  const lista = dados.aportes.filter((a) => a.status === 'concluido');
  const porMes = {};
  lista.forEach((a) => { (porMes[a.data.slice(0, 7)] = porMes[a.data.slice(0, 7)] || []).push(a); });
  const meses = Object.keys(porMes).sort().reverse();
  const visiveis = estado.historicoTodos ? meses : meses.slice(0, 3);
  const cartao = (a) => {
    const pago = totalAporte(a, 'final', dados.cambio);
    const planejado = totalAporte(a, 'planejado', dados.cambio);
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
            <li>${logoItemHtml(it)}<span><b>${esc(it.ativo)}</b><small>${it.classe === 'rendaFixa' ? esc(it.instituicao || 'Renda Fixa') : `${qtdTxt(it.qtdFinal)} × ${precoTxt(it.precoFinal, it.moeda)}`}</small></span><b class="tx-mono">${dinheiro(it.valorFinal, it.moeda)}</b></li>`).join('')}
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
    carrinho: atualizarPrecos(carrinho, dados.classes), carrinhoAberto: false,
    digitados: {}, confirmando: null, abertos: {}, historicoTodos: false,
    ano: Number(dados.hoje.slice(0, 4)), mesSel: dados.hoje.slice(0, 7),
    mensagem: null, ocupado: false,
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
    ${historicoHtml(estado, dados)}
    ${resumoHtml(estado, dados)}`;
  // os eventos ficam no contêiner (delegados) e são ligados UMA vez; cada
  // redesenho só troca o contexto que eles leem
  el._txCtx = ctx;
  if (!el._txAportesLigado) { el._txAportesLigado = true; ligarAportes(el); }
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
  if (cel) cel.innerHTML = it ? dinheiro(it.qtd * it.preco, it.moeda) : '<span class="tx-fraco">—</span>';
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
    if (cel) cel.textContent = dinheiro(finalDoItem(it, dig[i] || {}).valor, it.moeda);
  });
  const pe = el.querySelector(`[data-rodape="${id}"]`);
  if (pe) pe.innerHTML = rodapeAndamentoHtml(a, estado, dados.cambio);
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
  sucesso(r);
  renderAportes(ctx);
}

function ligarAportes(el) {
  el.addEventListener('click', (ev) => {
    const ctx = el._txCtx;
    const { doc, dados, estado } = ctx;
    const redesenhar = () => renderAportes(ctx);
    const alvo = ev.target.closest('[data-acao],[data-classe],[data-passo],[data-tirar],[data-mes],[data-ano],[data-rolar]');
    if (!alvo || !el.contains(alvo)) return;
    if (alvo.hasAttribute('data-rolar')) {
      const destino = doc.getElementById(alvo.getAttribute('data-rolar'));
      if (destino) { ev.preventDefault(); if (typeof destino.scrollIntoView === 'function') destino.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
    if (acao === 'esvaziar') { mudarCarrinho(ctx, carrinhoVazio(dados.hoje), { prateleira: true }); return; }
    if (acao === 'descartar-edicao') { estado.carrinhoAberto = false; mudarCarrinho(ctx, carrinhoVazio(dados.hoje), { prateleira: true }); return; }
    if (acao === 'historico-todos') { estado.historicoTodos = true; redesenhar(); return; }
    if (acao === 'voltar') { estado.confirmando = null; redesenhar(); return; }
    if (acao === 'cancelar' || acao === 'excluir') { estado.confirmando = `${acao}:${id}`; if (acao === 'excluir') estado.abertos[id] = true; redesenhar(); return; }
    if (acao === 'confirmar-carrinho') {
      const aporte = aporteDoCarrinho(estado.carrinho);
      const editando = !!estado.carrinho.editandoId;
      executar(ctx, () => ctx.salvarAporte(aporte), () => {
        estado.carrinho = carrinhoVazio(dados.hoje);
        ctx.salvarCarrinho(estado.carrinho);
        estado.carrinhoAberto = false;
        estado.mensagem = { tipo: 'ok', html: `${editando ? 'Aporte atualizado' : 'Aporte confirmado'}: <b>aguardando valores finais</b>. Depois de comprar, ajuste quantidade e preço e conclua.` };
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

  el.addEventListener('toggle', (ev) => {
    const { estado } = el._txCtx;
    const d = ev.target;
    if (d && d.matches && d.matches('details[data-hist]')) estado.abertos[d.getAttribute('data-hist')] = d.open;
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
    if (t.matches('[data-rf]')) {
      const n = lerNumeroCampo(t.value);
      mudarCarrinho(ctx, definirValorRf(estado.carrinho, { ativo: t.getAttribute('data-titulo'), instituicao: t.getAttribute('data-inst') }, n || 0));
      const linha = t.closest('tr');
      if (linha) linha.classList.toggle('no-carrinho', (n || 0) > 0);
      return;
    }
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
    if (t.id === 'txDataAporte' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { estado.carrinho = { ...estado.carrinho, data: t.value }; ctx.salvarCarrinho(estado.carrinho); return; }
    if (t.id === 'txOrdem' || t.id === 'txSoComprar') {
      if (t.id === 'txOrdem') estado.ordem = t.value; else estado.soComprar = t.checked;
      const lista = el.querySelector('#txPrateleiraLista');
      if (lista) lista.innerHTML = estado.classeAtiva === 'rendaFixa' ? prateleiraRfHtml(estado, dados) : prateleiraRvHtml(estado, dados, estado.classeAtiva);
    }
  });

  el.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'txRfNovo') return;
    const ctx = el._txCtx;
    const { estado } = ctx;
    ev.preventDefault();
    const titulo = el.querySelector('#txRfNovoTitulo').value.trim();
    const inst = el.querySelector('#txRfNovoInst').value.trim();
    const valor = lerNumeroCampo(el.querySelector('#txRfNovoValor').value);
    if (!titulo || !(valor > 0)) return;
    mudarCarrinho(ctx, definirValorRf(estado.carrinho, { ativo: titulo, instituicao: inst }, valor), { prateleira: true });
  });
}

function redesenharResumo(ctx) {
  const s = ctx.el.querySelector('#txResumo');
  if (s) s.outerHTML = resumoHtml(ctx.estado, ctx.dados);
}
