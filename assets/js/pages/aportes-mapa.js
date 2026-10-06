// assets/js/pages/aportes-mapa.js
//
// 27/09/2026: "Aportes realizados" (aba Aportes, Transações, acima de
// "Novo aporte") - Tiago: "eu tenho uma tabela do lado da outra em
// 'Compras de Investimento', isso me permite perceber quais eu comprei e
// quais eu NAO comprei na última compra... Gosto que ora coloca quando o
// preço que eu irei pagar agora está mais caro ou barato da última vez
// que comprei... Seria legal... eu passar o mouse ou clicar (no mobile), e
// ver quais ativos comprei na data daquele preço... Talvez um filtro de
// botão pra não ficar fiis, ações etc, um embaixo do outro?... no lugar de
// 1, 3 etc, pode colocar o valor individual que paguei e quantidade,
// clicando mostra algo mais formatado (como o último pago)... mantenha o
// mês atual em andamento."
//
// Mapa: ativo × mês (linhas fixas pela carteira, coluna do ativo presa à
// esquerda), filtro de classe (só 1 visível por vez) e de período (6/12
// meses). A célula mostra o preço médio pago no mês + a quantidade (tag) e
// uma seta ▲/▼ vs a compra anterior (a última ANTES desse mês). Passar o
// mouse mostra um resumo (title); clicar abre o popover ao lado do quadrado
// (estilo do "último pago" da prateleira) com cada compra do mês, a
// comparação com a compra anterior e com hoje, seu preço médio, o que mais
// você comprou no mesmo dia e - pra ativos em dólar - a conversão em reais
// (câmbio do dia de cada compra e de hoje, com o efeito do dólar isolado).
// O mês corrente aparece "em andamento", nunca como rodada que "faltou".
//
// As contas ficam em aportes-mapa-calc.js; aqui só o HTML. Os eventos (e a
// posição do popover) ficam em aportes.js!ligarAportes, que já escuta a aba.

import { formatBRL, formatNumeroBR, formatUSD as usd, formatDM, formatDMAcurto, formatMesAno, formatPctSinal } from '../format.js';
import { logoAtivoHtml, logoRendaFixaHtml } from './carteiras-pecas.js';
import { CLASSES_APORTE, MESES_CURTOS } from './aportes-calc.js';
import {
  classePorTicker, todasAsCompras, ultimosMeses, ativosDaClasseMapa, celulaMapa, mesesSemComprar,
  ehMesAtual, resumoUltimaRodada, popoverMapa, ultimaCompra,
} from './aportes-mapa-calc.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { ic, corClasse, ativoCelHtml, secaoHtml, estadoVazioHtml } from './transacoes-ui.js'; // 06/10/2026 (Onda 3, kit Figma)


const dinheiro = (v, moeda) => (moeda === 'USD' ? usd(v) : formatBRL(v));
const qtdTxt = (q) => (typeof q === 'number' ? formatNumeroBR(q, q % 1 ? 4 : 0) : '—');
const rotuloMes = (chave) => formatMesAno(chave);
const nomeClasse = (id) => (CLASSES_APORTE.find((c) => c.id === id) || {}).nome || '';
const milhar = (v) => (v >= 1000 ? `R$ ${formatNumeroBR(v / 1000, 1)} mil` : `R$ ${formatNumeroBR(Math.round(v), 0)}`);
const PERIODOS_MAPA = [6, 12];
const MESES_ALERTA = 3;

export function estadoInicialMapa() {
  return { classeAtiva: 'fiis', periodo: 6, selecionado: null };
}

/** O que o mapa precisa, calculado uma vez por desenho. */
export function dadosDoMapa(dados) {
  const mapaClasse = classePorTicker(dados.classes || {});
  return { mapaClasse, compras: todasAsCompras(dados.lancamentos, mapaClasse) };
}

/** O item da carteira (dados.classes) de um ativo do mapa - pra cotação/preço médio de hoje. */
export function ativoDaCarteira(dados, classe, ativo) {
  if (classe === 'rendaFixa') return (dados.classes.rendaFixa || []).find((a) => a.titulo === ativo) || null;
  return (dados.classes[classe] || []).find((a) => a.ticker === ativo) || null;
}

function segClasseHtml(estado, contagens) {
  return `
    <div class="segmented tx-seg tx-mapa-seg" role="group" aria-label="Classe do mapa">
      ${CLASSES_APORTE.map((c) => `
        <button type="button" class="tx-seg-btn${estado.classeAtiva === c.id ? ' active' : ''}" data-mapa-classe="${c.id}" aria-pressed="${estado.classeAtiva === c.id}">
          <span class="tx-dot" style="background:var(${corClasse(c.id)})"></span><span class="tx-longo">${c.nome}</span><span class="tx-curto">${c.curto}</span>
          ${contagens[c.id] ? `<span class="tx-seg-n">${contagens[c.id]}</span>` : ''}
        </button>`).join('')}
    </div>`;
}

function segPeriodoHtml(estado) {
  return `
    <div class="segmented tx-seg tx-mapa-seg tx-mapa-periodo" role="group" aria-label="Período do mapa">
      ${PERIODOS_MAPA.map((p) => `<button type="button" class="tx-seg-btn${estado.periodo === p ? ' active' : ''}" data-mapa-periodo="${p}" aria-pressed="${estado.periodo === p}">${p} meses</button>`).join('')}
    </div>`;
}

function dicaCelula(ativo, mesChave, cel) {
  const compras = cel.itens.map((c) => (cel.rf ? `${formatDM(c.data)} ${formatBRL(c.valor)}` : `${formatDM(c.data)} ${qtdTxt(c.qtd)} × ${dinheiro(c.preco, c.moeda)}`)).join(' · ');
  const vs = cel.delta == null ? '' : ` · ${formatPctSinal(cel.delta)} vs a compra anterior`;
  return `${ativo} em ${rotuloMes(mesChave)}: ${compras}${vs}. Clique pra ver o detalhe.`;
}

function celulaHtml(classe, ativo, mesChave, cel, selecionado, atual) {
  if (!cel) return `<td class="tx-mapa-td${atual ? ' atual' : ''}"><div class="tx-mapa-vazia" aria-label="não comprou">${atual ? '' : '—'}</div></td>`;
  const seta = cel.delta == null ? '' : (cel.delta > 0.005 ? '<i class="bad" aria-label="mais caro">▲</i>' : (cel.delta < -0.005 ? '<i class="good" aria-label="mais barato">▼</i>' : ''));
  const topo = cel.rf ? formatBRL(cel.valor) : `${dinheiro(cel.precoMedio, cel.moeda)}${seta}`;
  const sel = !!(selecionado && selecionado.ativo === ativo && selecionado.mes === mesChave);
  return `
    <td class="tx-mapa-td${atual ? ' atual' : ''}">
      <button type="button" class="tx-mapa-cel${sel ? ' sel' : ''}" style="--cor:var(${corClasse(classe)})" data-mapa-cel="${esc(ativo)}|${mesChave}" title="${esc(dicaCelula(ativo, mesChave, cel))}" aria-label="${esc(ativo)} em ${rotuloMes(mesChave)}" aria-expanded="${sel}" aria-controls="txMapaPop">
        <span class="tx-mapa-p">${topo}</span>
        ${cel.rf ? (cel.itens.length > 1 ? `<span class="tx-mapa-q">${cel.itens.length} aplicações</span>` : '') : `<span class="tx-mapa-q">×${qtdTxt(cel.qtd)}</span>`}
      </button>
    </td>`;
}

function ultimaHtml(semComprar, ultima) {
  if (!ultima) return '<span class="chip-tonal tx-chip-fraco">nunca</span>';
  if (semComprar != null && semComprar >= MESES_ALERTA) return `<span class="chip-tonal chip-warn" title="Última compra em ${formatDMAcurto(ultima.data)}">há ${semComprar} meses</span>`;
  return `<span class="chip-tonal tx-mono">${formatDMAcurto(ultima.data)}</span>`;
}

function logoMapaHtml(classe, ativo) {
  return classe === 'rendaFixa' ? logoRendaFixaHtml({ indexador: /selic/i.test(ativo) ? 'SELIC' : (/ipca/i.test(ativo) ? 'IPCA' : ''), tipoInvestimento: ativo }) : logoAtivoHtml(ativo);
}

export function mapaHtml(estado, dados, { aberta = true } = {}) {
  const { mapaClasse, compras } = dadosDoMapa(dados);
  const meses = ultimosMeses(dados.hoje, estado.periodo);
  const ativos = ativosDaClasseMapa(estado.classeAtiva, dados.classes, compras);
  const contagens = {};
  CLASSES_APORTE.forEach((c) => { contagens[c.id] = ativosDaClasseMapa(c.id, dados.classes, compras).length; });
  const atual = meses.map((m) => ehMesAtual(m, dados.hoje));

  const semComprarPorAtivo = new Map(ativos.map((a) => [a.ativo, mesesSemComprar(compras, a.ativo, dados.hoje)]));
  const linhas = ativos.map((a) => {
    const celulas = meses.map((m) => celulaMapa(compras, a.ativo, m));
    return `
      <tr>
        <th class="tx-mapa-at" scope="row">${ativoCelHtml(logoMapaHtml(estado.classeAtiva, a.ativo), a.ativo, a.nome || '')}</th>
        ${meses.map((m, i) => celulaHtml(estado.classeAtiva, a.ativo, m, celulas[i], estado.selecionado, atual[i])).join('')}
        <td class="tx-mapa-ult">${ultimaHtml(semComprarPorAtivo.get(a.ativo), ultimaCompra(compras, a.ativo))}</td>
      </tr>`;
  }).join('');

  const totais = meses.map((m) => ativos.reduce((s, a) => { const c = celulaMapa(compras, a.ativo, m); return s + (c ? c.valorBRL : 0); }, 0));
  const nomeDaClasse = nomeClasse(estado.classeAtiva);
  const rodada = resumoUltimaRodada(compras, ativos, meses);
  const parados = ativos.filter((a) => { const n = semComprarPorAtivo.get(a.ativo); return n != null && n >= MESES_ALERTA; });
  const chips = (lista) => `${lista.slice(0, 6).map((a) => `<span class="chip-tonal">${esc(a.ativo)}</span>`).join('')}${lista.length > 6 ? `<span class="tx-fraco">+${lista.length - 6}</span>` : ''}`;
  const resumoHtml = rodada ? `
    <div class="tx-mapa-resumo">
      <span class="tx-mapa-resumo-item">${rodada.atual ? 'Mês em andamento' : 'Última rodada'}: <b>${rotuloMes(rodada.mes)}</b>${rodada.datas.length ? ` <span class="tx-fraco">(${rodada.datas.map((d) => formatDM(d)).join(', ')})</span>` : ''} · <b>${rodada.entraram.length} de ${ativos.length}</b> ${esc(nomeDaClasse)}</span>
      ${rodada.ficaramDeFora.length && estado.classeAtiva !== 'rendaFixa' ? `<span class="tx-mapa-resumo-item">${rodada.atual ? 'Ainda não entraram' : 'Ficaram de fora'}: ${chips(rodada.ficaramDeFora)}</span>` : ''}
      ${parados.length && estado.classeAtiva !== 'rendaFixa' ? `<span class="tx-mapa-resumo-item">${MESES_ALERTA}+ meses sem comprar: ${parados.map((a) => `<span class="chip-tonal chip-warn">${esc(a.ativo)}</span>`).join('')}</span>` : ''}
    </div>` : `<div class="tx-mapa-resumo"><span class="tx-mapa-resumo-item">Nenhuma compra de ${esc(nomeDaClasse)} nos últimos ${estado.periodo} meses.</span></div>`;

  const cabMeses = meses.map((m, i) => `<th scope="col"${atual[i] ? ' class="atual"' : ''}>${rotuloMes(m)}${atual[i] ? '<small>em andamento</small>' : ''}</th>`).join('');
  const corpo = `
      <div class="tx-mapa-card">
        <div class="tx-mapa-filtros">${segClasseHtml(estado, contagens)}${segPeriodoHtml(estado)}</div>
        ${resumoHtml}
        ${ativos.length ? `
        <div class="tx-mapa-wrap" id="txMapaWrap">
          <table class="tx-mapa">
            <thead><tr><th class="tx-mapa-at esq" scope="col">Ativo</th>${cabMeses}<th class="tx-mapa-ult esq" scope="col">Última</th></tr></thead>
            <tbody>${linhas}</tbody>
            <tfoot><tr><td class="tx-mapa-at esq">Total${estado.classeAtiva === 'acoesEua' ? ' em R$' : ''}</td>${totais.map((v, i) => `<td class="tx-mapa-tot${atual[i] ? ' atual' : ''}">${v ? milhar(v) : '<span class="tx-fraco">—</span>'}</td>`).join('')}<td class="tx-mapa-ult"></td></tr></tfoot>
          </table>
        </div>` : estadoVazioHtml({ icone: 'inbox', titulo: `Nenhum ativo de ${nomeDaClasse} na carteira`, texto: 'Quando você cadastrar ativos dessa classe em Carteiras, o mapa de compras aparece aqui.' })}
        <div class="tx-mapa-leg">
          <span><b class="tx-mono">R$ 00,00</b> preço médio pago no mês e <span class="tx-mapa-q">×qtd</span></span>
          <span><b class="bad">▲</b> mais caro que a compra anterior</span>
          <span><b class="good">▼</b> mais barato</span>
          <span><span class="tx-mapa-leg-vazia">—</span> não comprou</span>
          ${estado.classeAtiva === 'acoesEua' ? '<span>EUA: preço em dólar; o total do mês e o detalhe mostram em reais (câmbio do dia)</span>' : ''}
        </div>
        <div class="tx-mapa-pop" id="txMapaPop" role="dialog" aria-label="Detalhe da compra"${estado.selecionado ? '' : ' hidden'}>${popoverMapaHtml(estado, dados, { mapaClasse, compras })}</div>
      </div>`;
  // 06/10/2026 (Onda 3): seção recolhível (fechada no celular); o id continua txMapaCompras (aportes.js redesenha por ele)
  return secaoHtml({ id: 'txMapaCompras', chave: 'mapa', titulo: 'Aportes realizados', dica: 'o que você comprou em cada mês · toque num quadrado pra ver a compra', aberta, corpo });
}

function linhaPopoverHtml(item, rf) {
  const brl = item.moeda === 'USD' && item.valorBRL ? `<small>${formatBRL(item.valorBRL)} · câmbio ${formatNumeroBR(item.cambio, 2)}</small>` : '';
  return `
    <tr>
      <td class="esq tx-mono">${formatDM(item.data)}</td>
      <td>${rf ? '' : `<span class="tx-mapa-q">×${qtdTxt(item.qtd)}</span>`}</td>
      <td class="tx-mono">${rf ? '' : dinheiro(item.preco, item.moeda)}</td>
      <td class="tx-mono"><b>${dinheiro(item.valor, item.moeda)}</b>${brl}</td>
    </tr>`;
}

export function popoverMapaHtml(estado, dados, calculado = null) {
  const sel = estado.selecionado;
  if (!sel) return '';
  const { compras } = calculado || dadosDoMapa(dados);
  const naCarteira = ativoDaCarteira(dados, estado.classeAtiva, sel.ativo);
  const precoAtual = naCarteira && naCarteira.precoAtual != null ? naCarteira.precoAtual : null;
  const precoMedioHoje = naCarteira && naCarteira.precoMedio != null ? naCarteira.precoMedio : null;
  const pop = popoverMapa(compras, sel.ativo, sel.mes, { precoAtual, precoMedioHoje, cambioHoje: dados.cambio });
  if (!pop) return '';
  const dl = [];
  if (!pop.rf && pop.anterior && pop.delta != null) {
    dl.push(`<dt>vs compra anterior<small>${formatDMAcurto(pop.anterior.data)} · ${dinheiro(pop.anterior.preco, pop.moeda)}</small></dt><dd><span class="tx-var chip-tonal ${pop.delta > 0 ? 'chip-bad' : 'chip-good'}">${formatPctSinal(pop.delta)}</span><small>${pop.delta > 0 ? 'mais caro' : 'mais barato'}</small></dd>`);
  } else if (!pop.rf) {
    dl.push('<dt>vs compra anterior</dt><dd><small>primeira compra</small></dd>');
  }
  if (!pop.rf && pop.vsHoje != null) {
    dl.push(`<dt>vs cotação de hoje<small>${dinheiro(precoAtual, pop.moeda)}</small></dt><dd><span class="tx-var chip-tonal ${pop.vsHoje > 0 ? 'chip-good' : 'chip-bad'}">${formatPctSinal(pop.vsHoje)}</span><small>${pop.vsHoje > 0 ? 'valorizou desde então' : 'hoje está mais barato'}</small></dd>`);
  }
  if (!pop.rf && precoMedioHoje) dl.push(`<dt>seu preço médio hoje</dt><dd><b>${dinheiro(precoMedioHoje, pop.moeda)}</b></dd>`);
  if (pop.moeda === 'USD' && pop.pagoBRL) {
    dl.push(`<dt>em reais<small>câmbio ${formatNumeroBR(pop.cambioMedio, 2)} no dia → ${formatNumeroBR(dados.cambio, 2)} hoje</small></dt><dd><b>${formatBRL(pop.pagoBRL)}</b><small>hoje valem ${pop.hojeBRL != null ? formatBRL(pop.hojeBRL) : '—'}</small></dd>`);
    if (pop.efeitoDolar != null) dl.push(`<dt>efeito do dólar<small>só pela variação do câmbio</small></dt><dd><span class="tx-var chip-tonal ${pop.efeitoDolar > 0 ? 'chip-good' : 'chip-bad'}">${formatPctSinal(pop.efeitoDolar)}</span></dd>`);
  }
  if (pop.rf) dl.push(`<dt>aplicado no mês</dt><dd><b>${formatBRL(pop.valor)}</b></dd>`);
  const podeRepetir = !!naCarteira;
  return `
    <div class="tx-mapa-pop-cab">
      <span class="tx-mapa-pop-classe" style="--cor:var(${corClasse(estado.classeAtiva)})">${esc(nomeClasse(estado.classeAtiva))}</span>
      <b>${esc(sel.ativo)}</b><span class="tx-fraco">${rotuloMes(sel.mes)}${pop.itens.length > 1 ? ` · ${pop.itens.length} compras` : ''}</span>
      <button type="button" class="icon-btn tx-mapa-pop-fechar" data-mapa-fechar aria-label="Fechar">${ic('close')}</button>
    </div>
    <table class="tx-mapa-pop-t">
      <thead><tr><th class="esq">Data</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead>
      <tbody>${pop.itens.map((it) => linhaPopoverHtml(it, pop.rf)).join('')}</tbody>
    </table>
    ${dl.length ? `<dl class="tx-mapa-pop-dl">${dl.join('')}</dl>` : ''}
    ${pop.mesmoDia.length ? `
      <div class="tx-mapa-pop-junto"><span>${pop.itens.length > 1 ? 'Nessas datas' : 'No mesmo dia'} você também comprou</span>
        <div>${pop.mesmoDia.map((c) => `<span class="chip-tonal" title="${esc(c.qtd ? `${qtdTxt(c.qtd)} · ${dinheiro(c.valor, c.classe === 'acoesEua' ? 'USD' : 'BRL')}` : formatBRL(c.valor))}"><span class="tx-dot" style="background:var(${corClasse(c.classe)})"></span>${esc(c.ativo)}</span>`).join('')}</div>
      </div>` : ''}
    <div class="tx-mapa-pop-rod">
      ${!pop.rf ? `<button type="button" class="btn btn-outlined btn-sm" data-mapa-grafico="${esc(sel.ativo)}">Ver lançamentos e gráfico</button>` : ''}
      ${podeRepetir ? `<button type="button" class="btn btn-filled btn-sm" data-mapa-repetir="${esc(sel.ativo)}|${sel.mes}">Repetir no carrinho</button>` : ''}
    </div>`;
}
