// assets/js/pages/aportes-eua.js
//
// 05/10/2026: desenho do fluxo novo das Ações internacionais na aba Aportes
// (contas em aportes-eua-calc.js; eventos ligados em aportes.js):
//   1. Enviar dólares (Remessa Online): R$ a enviar OU US$ desejados -> o que
//      chega, o custo e o "caixa em dólar" que fica aguardando compra;
//   2. Comprar ações com o caixa: saldo, sugestão de divisão pelos alvos e o
//      caminho inverso (escolhi as ações -> faltam quantos US$ / R$ a enviar).

import { formatBRL, formatNumeroBR, formatUSD as usd, formatDMA, formatPct } from '../format.js';
import {
  lerTaxasRemessa, remessaPorReais, remessaPorDolares, vetRemessa, caixaValido, necessidadeDeDolares, PADROES_REMESSA,
} from './aportes-eua-calc.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { ic } from './transacoes-ui.js'; // 06/10/2026 (Onda 3, kit Figma)


export const lerNumeroCampo = (s) => {
  const t = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if (!t) return null;
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};
const campoPct = (f) => (typeof f === 'number' ? String((Math.round(f * 100000) / 1000)).replace('.', ',') : '');

export function estadoInicialEua(dados, storage) {
  const caixa = caixaValido(dados.caixaDolar);
  const ultimoEnvio = caixa.movimentos.find((m) => m.tipo === 'envio' && m.conversao != null && m.encargos != null) || null;
  return {
    modo: 'reais', valor: '', comercial: '', data: dados.hoje, taxas: lerTaxasRemessa(storage, ultimoEnvio), sugestao: null, ajuste: '',
  };
}

/** Cotação comercial em uso: a que o Tiago digitou ou o dólar que o site já tem. */
export function comercialDoEstado(estado, dados) {
  const digitado = lerNumeroCampo(estado.eua.comercial);
  return digitado > 0 ? digitado : (dados.cambio > 0 ? dados.cambio : 0);
}

/** Resultado da remessa pelo modo escolhido (null se faltar dado). */
export function remessaDoEstado(estado, dados) {
  const e = estado.eua;
  const v = lerNumeroCampo(e.valor);
  const com = comercialDoEstado(estado, dados);
  if (!(v > 0) || !(com > 0)) return null;
  return e.modo === 'reais' ? remessaPorReais(v, com, e.taxas) : remessaPorDolares(v, com, e.taxas);
}

export function remessaResultadoHtml(estado, dados) {
  const r = remessaDoEstado(estado, dados);
  const com = comercialDoEstado(estado, dados);
  if (!r) {
    return `<p class="tx-eua-vazio">${com > 0 ? 'Informe o valor acima e eu estimo quanto chega.' : 'Sem cotação do dólar agora: informe a comercial nas taxas abaixo.'}</p>`;
  }
  return `
    <dl class="tx-eua-conta">
      <div class="tx-eua-conta-chave"><dt>${estado.eua.modo === 'reais' ? 'Você envia' : 'Você precisa enviar'}</dt><dd>${formatBRL(r.reais)}</dd></div>
      <div class="tx-eua-conta-chave destaque"><dt>${estado.eua.modo === 'reais' ? 'Chegam' : 'Você recebe'}</dt><dd>${usd(r.usd)}</dd></div>
      <div><dt>Dólar comercial</dt><dd>R$ ${formatNumeroBR(r.comercial, 4)}</dd></div>
      <div><dt>Taxa de conversão (${formatPct(r.conversao, 2)})</dt><dd>${formatBRL(r.conversaoBrl)}</dd></div>
      <div><dt>Encargos / IOF (${formatPct(r.encargos, 2)})</dt><dd>${formatBRL(r.encargosBrl)}</dd></div>
      <div><dt>Valor efetivo por US$ (VET)</dt><dd>R$ ${formatNumeroBR(r.vet, 4)} <small>(+R$ ${formatNumeroBR(r.tarifaPorUsd, 4)})</small></dd></div>
    </dl>`;
}

function movimentoHtml(m) {
  const rotulo = m.tipo === 'envio' ? 'Envio' : (m.tipo === 'uso' ? 'Compra de ações' : 'Ajuste');
  const detalhe = m.tipo === 'envio' && m.reais ? ` · ${formatBRL(m.reais)}` : '';
  return `
    <li class="tx-eua-mov ${m.usd < 0 ? 'saida' : 'entrada'}">
      <span><b>${rotulo}</b><small>${formatDMA(m.data)}${detalhe}${m.observacao && m.tipo !== 'uso' ? ` · ${esc(m.observacao)}` : ''}</small></span>
      <b class="tx-mono">${m.usd < 0 ? '−' : '+'}${usd(Math.abs(m.usd))}</b>
      ${m.tipo === 'uso' ? '<span class="tx-eua-mov-x"></span>' : `<button type="button" class="icon-btn tx-recibo-tirar" data-acao="rem-excluir" data-id="${esc(m.id)}" aria-label="Apagar este lançamento do caixa">${ic('delete')}</button>`}
    </li>`;
}

/** Linha "no carrinho / no caixa / faltam" - a ponte entre escolher as ações e enviar os dólares. */
export function necessidadeHtml(estado, dados, totalUsdCarrinho, { botao = true } = {}) {
  const caixa = caixaValido(dados.caixaDolar);
  if (!(totalUsdCarrinho > 0)) return '';
  const n = necessidadeDeDolares(totalUsdCarrinho, caixa.saldoUsd, comercialDoEstado(estado, dados), estado.eua.taxas);
  const resumo = n.falta > 0
    ? `Faltam <b>${usd(n.falta)}</b> no caixa${n.enviar ? ` → enviar ≈ <b>${formatBRL(n.enviar.reais)}</b> (VET ${formatNumeroBR(n.enviar.vet, 4)})` : ''}.`
    : `O caixa cobre: sobram <b>${usd(n.sobra)}</b>.`;
  return `
    <div class="tx-eua-necessidade ${n.falta > 0 ? 'falta' : 'ok'}">
      <span>Ações no carrinho: <b>${usd(n.precisa)}</b> · caixa em dólar: <b>${usd(n.caixa)}</b></span>
      <span>${resumo}</span>
      ${botao && n.falta > 0 ? `<button type="button" class="btn btn-tonal btn-sm" data-acao="eua-preparar-envio" data-usd="${n.falta}">Preparar envio de ${usd(n.falta)}</button>` : ''}
    </div>`;
}

function sugestaoHtml(estado) {
  const s = estado.eua.sugestao;
  if (!s) return '';
  if (!s.itens.length) return '<p class="tx-eua-vazio">Com esse caixa não dá pra comprar nenhuma ação inteira agora.</p>';
  return `
    <div class="tx-eua-sugestao">
      <span class="tx-card-rotulo">Divisão sugerida (já no carrinho; ajuste à vontade)</span>
      <ul>${s.itens.map((i) => `<li><b>${esc(i.ticker)}</b><span>${formatNumeroBR(i.qtd, 0)} × ${usd(i.preco)} = ${usd(i.valor)}</span><small>${esc(i.motivo)}</small></li>`).join('')}</ul>
      <small class="tx-fraco">Usa ${usd(s.usado)}; sobra ${usd(s.sobra)} no caixa. Ações inteiras; critério: quanto cada uma está abaixo do % desejado no Radar e o momento de aporte.</small>
    </div>`;
}

export function euaFluxoHtml(estado, dados, totalUsdCarrinho = 0) {
  const e = estado.eua;
  const caixa = caixaValido(dados.caixaDolar);
  const com = comercialDoEstado(estado, dados);
  const vet = vetRemessa(com, e.taxas);
  const cambio = dados.cambio > 0 ? dados.cambio : com;
  const modoBtn = (id, rotulo) => `<button type="button" role="tab" class="tx-seg-btn${e.modo === id ? ' active' : ''}" data-rem-modo="${id}" aria-selected="${e.modo === id}">${rotulo}</button>`;
  return `
    <section class="tx-eua" id="txEuaFluxo" aria-label="Fluxo das ações internacionais">
      <p class="tx-eua-intro">Ações internacionais em <b>2 etapas</b>: primeiro você <b>envia dólares</b> pela Remessa Online; depois <b>compra as ações</b> com esse caixa (no mesmo dia ou em outro). Também dá pra começar pelas ações e ver quantos dólares enviar.</p>
      <div class="tx-eua-passos">
        <article class="card tx-eua-passo" id="txEuaEnviar">
          <header class="tx-eua-cab"><span class="tx-etapa-n">1</span><div><h3>Enviar dólares</h3><small>Remessa Online · R$ → US$</small></div></header>
          <div class="segmented tx-seg tx-eua-modo" role="tablist" aria-label="O que você sabe">${modoBtn('reais', 'Tenho R$ pra enviar')}${modoBtn('dolares', 'Quero US$')}</div>
          <label class="tx-rotulo">${e.modo === 'reais' ? 'R$ a enviar' : 'US$ desejados'}
            <span class="tx-campo"><span class="tx-campo-pre">${e.modo === 'reais' ? 'R$' : 'US$'}</span><input type="text" inputmode="decimal" id="txRemValor" value="${esc(e.valor)}" placeholder="0,00" autocomplete="off"></span>
          </label>
          <div id="txRemResultado" aria-live="polite">${remessaResultadoHtml(estado, dados)}</div>
          <details class="tx-eua-taxas"${e.taxasAbertas ? ' open' : ''} data-eua-taxas>
            <summary>Taxas usadas na estimativa <small>(médias editáveis)</small></summary>
            <p class="tx-nota">Calibradas pela cotação real da Remessa Online (US$ 68,76 por R$ 350,00: taxa de conversão ≈ ${formatPct(PADROES_REMESSA.conversao, 2)}, encargos/IOF ≈ ${formatPct(PADROES_REMESSA.encargos, 2)}, ou ≈ R$ 0,11 por US$). São <b>médias</b>: a Remessa muda a taxa conforme valor, forma de pagamento e dia. Ajuste aqui e as suas ficam guardadas neste navegador (e vêm do último envio registrado).</p>
            <div class="tx-eua-taxas-campos">
              <label class="tx-rotulo">Dólar comercial<span class="tx-campo"><span class="tx-campo-pre">R$</span><input type="text" inputmode="decimal" id="txRemCom" value="${esc(e.comercial)}" placeholder="${esc(cambio > 0 ? formatNumeroBR(cambio, 4) : '0,0000')}" autocomplete="off"></span></label>
              <label class="tx-rotulo">Taxa de conversão<span class="tx-campo"><input type="text" inputmode="decimal" id="txRemConv" value="${campoPct(e.taxas.conversao)}" autocomplete="off"><span class="tx-campo-pos">%</span></span></label>
              <label class="tx-rotulo">Encargos / IOF<span class="tx-campo"><input type="text" inputmode="decimal" id="txRemEnc" value="${campoPct(e.taxas.encargos)}" autocomplete="off"><span class="tx-campo-pos">%</span></span></label>
            </div>
            <small class="tx-fraco">${vet > 0 ? `VET estimado: R$ ${formatNumeroBR(vet, 4)} por US$ (comercial vazio = dólar de hoje no site${dados.cambio > 0 ? `, R$ ${formatNumeroBR(dados.cambio, 4)}` : ''}).` : ''}</small>
          </details>
          <div class="tx-eua-registrar">
            <label class="tx-rotulo">Data do envio<input type="date" class="input" id="txRemData" value="${esc(e.data)}"></label>
            <button type="button" class="btn btn-filled" data-acao="rem-registrar">Registrar envio no caixa</button>
          </div>
          <small class="tx-fraco">Registrar guarda o que chegou como <b>caixa em dólar aguardando compra</b>; não mexe nas transações.</small>
        </article>
        <article class="card tx-eua-passo" id="txEuaComprar">
          <header class="tx-eua-cab"><span class="tx-etapa-n">2</span><div><h3>Comprar ações</h3><small>com o caixa em dólar</small></div></header>
          <div class="tx-eua-caixa">
            <span class="tx-card-rotulo">Caixa em dólar aguardando compra</span>
            <b class="tx-card-valor tx-mono">${usd(caixa.saldoUsd)}</b>
            <small class="tx-fraco">${cambio > 0 ? `≈ ${formatBRL(caixa.saldoUsd * cambio)} no dólar de hoje` : ''}</small>
          </div>
          <button type="button" class="btn btn-filled" data-acao="eua-sugerir"${caixa.saldoUsd > 0 ? '' : ' disabled'}>Sugerir divisão pelos alvos</button>
          <div id="txEuaSugestao">${sugestaoHtml(estado)}</div>
          <div id="txEuaNecessidade">${necessidadeHtml(estado, dados, totalUsdCarrinho)}</div>
          ${caixa.movimentos.length ? `<ul class="tx-eua-movs" aria-label="Movimentos do caixa em dólar">${caixa.movimentos.slice(0, 5).map(movimentoHtml).join('')}</ul>` : ''}
          <form class="tx-eua-ajuste" id="txEuaAjuste" autocomplete="off">
            <label class="tx-rotulo">Acertar o saldo (ex.: dólar que já estava na corretora)<span class="tx-campo"><span class="tx-campo-pre">US$</span><input type="text" inputmode="decimal" id="txEuaAjusteValor" placeholder="saldo certo" value="${esc(e.ajuste)}"></span></label>
            <button type="submit" class="btn btn-outlined btn-sm">Acertar</button>
          </form>
          <small class="tx-fraco">Ao <b>concluir</b> um aporte com ações EUA, o valor pago sai do caixa sozinho.</small>
        </article>
      </div>
    </section>`;
}
