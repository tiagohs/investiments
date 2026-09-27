// assets/js/pages/aportes-mapa.js
//
// 27/09/2026: "Aportes realizados" (aba Aportes, Transações, acima de
// "Novo aporte") - Tiago: "eu tenho uma tabela do lado da outra em
// 'Compras de Investimento', isso me permite perceber quais eu comprei e
// quais eu NAO comprei na última compra... Gosto que ora coloca quando o
// preço que eu irei pagar agora está mais caro ou barato da última vez
// que comprei... Talvez um filtro de botão pra não ficar fiis, ações etc,
// um embaixo do outro?... no lugar de 1, 3 etc, pode colocar o valor
// individual que paguei e quantidade, clicando mostra algo mais
// formatado (como o último pago)... mantenha o mês atual em andamento."
//
// Mapa: ativo × mês (linhas fixas pela carteira, sticky à esquerda),
// filtro de classe (só 1 visível por vez) e de período (6/12 meses), a
// célula mostra preço médio pago + quantidade (tag) e uma seta ▲/▼ vs a
// compra anterior; clicar abre um popover formatado (estilo do "último
// pago" da prateleira) com o detalhe de cada compra daquele mês, a
// comparação com a compra anterior/hoje, seu preço médio e - pra ativos
// em dólar - a conversão em reais (câmbio do dia de cada compra e de
// hoje, com o efeito do dólar isolado). O mês corrente aparece marcado
// "em andamento", nunca como uma rodada fechada que "faltou".
//
// As contas ficam em aportes-mapa-calc.js; aqui só desenha e liga os
// eventos (reaproveita o mesmo <section> de aportes.js, então a
// interatividade é ligada de dentro de ligarAportes - ver aportes.js).

import { formatBRL, formatNumeroBR } from '../format.js';
import { logoAtivoHtml, logoRendaFixaHtml } from './carteiras-classe-comum.js';
import { CLASSES_APORTE, MESES_CURTOS } from './aportes-calc.js';
import {
  classePorTicker, todasAsCompras, ultimosMeses, ativosDaClasseMapa, celulaMapa, mesesSemComprar,
  ehMesAtual, resumoUltimaRodada, popoverMapa, ultimaCompra,
} from './aportes-mapa-calc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dm = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : '—');
const dma = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '—');
const usd = (v) => (typeof v === 'number' && Number.isFinite(v) ? `US$ ${formatNumeroBR(v)}` : '—');
const dinheiro = (v, moeda) => (moeda === 'USD' ? usd(v) : formatBRL(v));
const qtdTxt = (q) => (typeof q === 'number' ? formatNumeroBR(q, q % 1 ? 4 : 0) : '—');
const pct = (v, casas = 1) => `${v > 0 ? '+' : ''}${formatNumeroBR(v * 100, casas)}%`;
const rotuloMes = (chave) => `${MESES_CURTOS[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
const corClasse = (id) => (CLASSES_APORTE.find((c) => c.id === id) || {}).cor || '--ink-muted';
const PERIODOS_MAPA = [6, 12];

export function estadoInicialMapa() {
  return { classeAtiva: 'fiis', periodo: 6, selecionado: null };
}

function segClasseHtml(estado, contagens) {
  return `
    <div class="tx-seg tx-mapa-seg" role="group" aria-label="Classe do mapa">
      ${CLASSES_APORTE.map((c) => `
        <button type="button" class="tx-seg-btn${estado.classeAtiva === c.id ? ' active' : ''}" data-mapa-classe="${c.id}">
          <span class="tx-dot" style="background:var(${c.cor})"></span><span class="tx-longo">${c.nome}</span><span class="tx-curto">${c.curto}</span>
          ${contagens[c.id] ? `<span class="tx-seg-n">${contagens[c.id]}</span>` : ''}
        </button>`).join('')}
    </div>`;
}

function segPeriodoHtml(estado) {
  return `
    <div class="tx-seg tx-mapa-seg" role="group" aria-label="Período do mapa">
      ${PERIODOS_MAPA.map((p) => `<button type="button" class="tx-seg-btn${estado.periodo === p ? ' active' : ''}" data-mapa-periodo="${p}">${p} meses</button>`).join('')}
    </div>`;
}

function celulaHtml(classe, ativo, mesChave, cel, selecionado) {
  if (!cel) return '<td class="tx-mapa-td"><div class="tx-mapa-vazia">—</div></td>';
  const seta = cel.delta == null ? '' : (cel.delta > 0.005 ? '<i class="bad">▲</i>' : (cel.delta < -0.005 ? '<i class="good">▼</i>' : ''));
  const topo = cel.rf ? formatBRL(cel.valor) : `${dinheiro(cel.precoMedio, cel.moeda)}${seta}`;
  const sel = selecionado && selecionado.ativo === ativo && selecionado.mes === mesChave;
  return `
    <td class="tx-mapa-td">
      <button type="button" class="tx-mapa-cel${sel ? ' sel' : ''}" style="--cor:var(${corClasse(classe)})" data-mapa-cel="${esc(ativo)}|${mesChave}" aria-label="${esc(ativo)} em ${rotuloMes(mesChave)}" aria-pressed="${!!sel}">
        <span class="tx-mapa-p">${topo}</span>
        ${cel.rf ? '' : `<span class="tx-mapa-q">×${qtdTxt(cel.qtd)}</span>`}
      </button>
    </td>`;
}

function ultimaHtml(semComprar, ultima) {
  if (!ultima) return '<span class="tx-fraco">nunca comprou</span>';
  if (semComprar != null && semComprar >= 3) return `<span class="status-pill warn">há ${semComprar} meses</span>`;
  return `<span class="tx-mono">${dma(ultima.data)}</span>`;
}

function logoMapaHtml(classe, ativo) {
  return classe === 'rendaFixa' ? logoRendaFixaHtml({ tipoInvestimento: ativo }) : logoAtivoHtml(ativo);
}

export function mapaHtml(estado, dados) {
  const mapaClasse = classePorTicker(dados.classes);
  const compras = todasAsCompras(dados.lancamentos, mapaClasse);
  const meses = ultimosMeses(dados.hoje, estado.periodo);
  const ativos = ativosDaClasseMapa(estado.classeAtiva, dados.classes, compras);
  const contagens = {};
  CLASSES_APORTE.forEach((c) => { contagens[c.id] = ativosDaClasseMapa(c.id, dados.classes, compras).length; });

  const linhas = ativos.map((a) => {
    const celulas = meses.map((m) => celulaMapa(compras, a.ativo, m));
    const semComprar = mesesSemComprar(compras, a.ativo, dados.hoje);
    const ultima = ultimaCompra(compras, a.ativo);
    return `
      <tr>
        <th class="at tx-mapa-at" scope="row"><span class="tx-ativo">${logoMapaHtml(estado.classeAtiva, a.ativo)}<span class="tx-ativo-nome"><b>${esc(a.ativo)}</b>${a.nome ? `<small>${esc(a.nome)}</small>` : ''}</span></span></th>
        ${meses.map((m, i) => celulaHtml(estado.classeAtiva, a.ativo, m, celulas[i], estado.selecionado)).join('')}
        <td class="tx-mapa-ult">${ultimaHtml(semComprar, ultima)}</td>
      </tr>`;
  }).join('');

  const totais = meses.map((m) => ativos.reduce((s, a) => { const c = celulaMapa(compras, a.ativo, m); return s + (c ? c.valorBRL : 0); }, 0));

  const rodada = resumoUltimaRodada(compras, ativos, meses);
  const resumoHtml = rodada ? `
    <div class="tx-mapa-resumo">
      <span>${rodada.atual ? 'Mês em andamento' : 'Última rodada'}: <b>${rotuloMes(rodada.mes)}</b>${rodada.datas.length ? ` <span class="tx-fraco">(${rodada.datas.map(dm).join(', ')})</span>` : ''} · <b>${rodada.entraram.length} de ${ativos.length}</b> ${CLASSES_APORTE.find((c) => c.id === estado.classeAtiva).nome}</span>
      ${rodada.ficaramDeFora.length && estado.classeAtiva !== 'rendaFixa' ? `<span>${rodada.atual ? 'Ainda faltam' : 'Ficaram de fora'}: ${rodada.ficaramDeFora.slice(0, 6).map((a) => `<span class="tx-chip">${esc(a.ativo)}</span>`).join(' ')}${rodada.ficaramDeFora.length > 6 ? ` +${rodada.ficaramDeFora.length - 6}` : ''}</span>` : ''}
    </div>` : '<p class="tx-vazio">Sem compras registradas nessa classe/período.</p>';

  return `
    <section class="tx-secao" id="txMapaCompras" aria-labelledby="txMapaTitulo">
      <div class="tx-secao-cab">
        <h2 id="txMapaTitulo">Aportes realizados</h2>
        <span class="hint">o que você comprou em cada mês - clique num quadrado pra ver a compra</span>
      </div>
      <div class="tx-mapa-card">
        <div class="tx-mapa-filtros">${segClasseHtml(estado, contagens)}${segPeriodoHtml(estado)}</div>
        ${resumoHtml}
        <div class="tx-mapa-wrap" id="txMapaWrap">
          <table class="tx-mapa">
            <thead><tr><th class="esq">Ativo</th>${meses.map((m) => `<th${ehMesAtual(m, dados.hoje) ? ' class="atual"' : ''}>${rotuloMes(m)}${ehMesAtual(m, dados.hoje) ? '<small>em andamento</small>' : ''}</th>`).join('')}<th class="esq">Última</th></tr></thead>
            <tbody>${linhas || `<tr><td colspan="${meses.length + 2}" class="tx-vazio">Nenhum ativo dessa classe ainda.</td></tr>`}</tbody>
            ${linhas ? `<tfoot><tr><td class="esq">Total${estado.classeAtiva === 'acoesEua' ? ' em R$' : ''}</td>${totais.map((v) => `<td>${v ? (v >= 1000 ? `${formatNumeroBR(v / 1000, 1)} mil` : formatNumeroBR(Math.round(v), 0)) : '<span class="tx-fraco">—</span>'}</td>`).join('')}<td></td></tr></tfoot>` : ''}
          </table>
        </div>
        <div class="tx-mapa-leg">
          <span>preço pago (média do mês) e <span class="tx-chip tx-chip-qtd">×qtd</span></span>
          <span><b class="bad">▲</b> mais caro que a compra anterior</span>
          <span><b class="good">▼</b> mais barato</span>
          <span>— não comprou</span>
          ${estado.classeAtiva === 'acoesEua' ? '<span>EUA: preço em dólar; o total do mês e o popover mostram em reais (câmbio do dia)</span>' : ''}
        </div>
        <div class="tx-mapa-pop" id="txMapaPop"${estado.selecionado ? '' : ' hidden'}>${popoverMapaHtml(estado, dados, mapaClasse, compras)}</div>
      </div>
    </section>`;
}

function linhaPopoverHtml(item, rf) {
  return `
    <tr>
      <td>${dm(item.data)}</td>
      <td>${rf ? '' : `<span class="tx-chip tx-chip-qtd">×${qtdTxt(item.qtd)}</span>`}</td>
      <td>${rf ? '' : dinheiro(item.preco, item.moeda)}</td>
      <td>${dinheiro(item.valor, item.moeda)}${item.moeda === 'USD' && item.valorBRL ? `<small>R$ ${formatNumeroBR(item.valorBRL)} · câmbio ${formatNumeroBR(item.cambio, 2)}</small>` : ''}</td>
    </tr>`;
}

export function popoverMapaHtml(estado, dados, mapaClasseParam, comprasParam) {
  const sel = estado.selecionado;
  if (!sel) return '';
  const mapaClasse = mapaClasseParam || classePorTicker(dados.classes);
  const compras = comprasParam || todasAsCompras(dados.lancamentos, mapaClasse);
  const lista = (dados.classes[estado.classeAtiva] || []).find((a) => a.ticker === sel.ativo)
    || (dados.classes.rendaFixa || []).find((a) => a.titulo === sel.ativo);
  const precoAtual = lista ? (lista.precoAtual != null ? lista.precoAtual : null) : null;
  const precoMedioHoje = lista ? (lista.precoMedio != null ? lista.precoMedio : null) : null;
  const pop = popoverMapa(compras, sel.ativo, sel.mes, { precoAtual, precoMedioHoje, cambioHoje: dados.cambio });
  if (!pop) return '';
  const dl = [];
  if (!pop.rf && pop.anterior) {
    dl.push(`<dt>vs compra anterior <small class="tx-fraco">${dma(pop.anterior.data)} · ${dinheiro(pop.anterior.preco, pop.moeda)}</small></dt><dd class="${pop.delta > 0 ? 'bad' : 'good'}">${pct(pop.delta)}<small>${pop.delta > 0 ? 'mais caro' : 'mais barato'}</small></dd>`);
  }
  if (!pop.rf && pop.vsHoje != null) {
    dl.push(`<dt>vs cotação de hoje <small class="tx-fraco">${dinheiro(precoAtual, pop.moeda)}</small></dt><dd class="${pop.vsHoje > 0 ? 'good' : 'bad'}">${pct(pop.vsHoje)}<small>${pop.vsHoje > 0 ? 'valorizou desde então' : 'hoje está mais barato'}</small></dd>`);
  }
  if (!pop.rf && precoMedioHoje) dl.push(`<dt>seu preço médio hoje</dt><dd>${dinheiro(precoMedioHoje, pop.moeda)}</dd>`);
  if (pop.moeda === 'USD') {
    dl.push(`<dt>em reais <small class="tx-fraco">câmbio ${formatNumeroBR(pop.cambioMedio, 2)} → hoje ${formatNumeroBR(dados.cambio, 2)}</small></dt><dd>${formatBRL(pop.pagoBRL)}<small>hoje valem ${pop.hojeBRL != null ? formatBRL(pop.hojeBRL) : '—'}</small></dd>`);
    if (pop.efeitoDolar != null) dl.push(`<dt>efeito do dólar</dt><dd class="${dados.cambio > pop.cambioMedio ? 'good' : 'bad'}">${pct(pop.efeitoDolar)}<small>só pela variação do câmbio</small></dd>`);
  }
  return `
    <div class="tx-mapa-pop-cab">
      <span class="tx-mapa-pop-classe" style="--cor:var(${corClasse(estado.classeAtiva)})">${CLASSES_APORTE.find((c) => c.id === estado.classeAtiva).nome}</span>
      <b class="tx-mono">${esc(sel.ativo)}</b><span class="tx-fraco">${rotuloMes(sel.mes)}</span>
      <button type="button" class="tx-mapa-pop-fechar" data-mapa-fechar aria-label="Fechar">×</button>
    </div>
    <div class="tx-tabela-wrap tx-mapa-pop-tabela">
      <table class="tx-tabela">
        <thead><tr><th class="esq">Data</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead>
        <tbody>${pop.itens.map((it) => linhaPopoverHtml(it, pop.rf)).join('')}</tbody>
      </table>
    </div>
    ${dl.length ? `<dl class="tx-mapa-pop-dl">${dl.join('')}</dl>` : ''}
    ${pop.mesmoDia.length ? `
      <div class="tx-mapa-pop-junto">${pop.itens.length > 1 ? 'Nessas datas' : 'No mesmo dia'} você também comprou:
        <div>${pop.mesmoDia.map((c) => `<span class="tx-chip" title="${esc(`${qtdTxt(c.qtd)} · ${dinheiro(c.valor, 'BRL')}`)}"><span class="tx-dot" style="background:var(${corClasse(c.classe)})"></span>${esc(c.ativo)}</span>`).join('')}</div>
      </div>` : ''}
    ${!pop.rf ? `<div class="tx-mapa-pop-rod"><button type="button" class="btn btn-ghost tx-btn-sm" data-mapa-grafico="${esc(sel.ativo)}">Ver gráfico do preço</button></div>` : ''}`;
}
