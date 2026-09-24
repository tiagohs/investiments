// assets/js/pages/inicio-proventos.js
//
// 24/09/2026 (Tiago: "quero mostrar proventos a receber confirmados no
// mês" - fonte grátis: FNet/B3, só FIIs por enquanto). A lista chega pronta
// da Home (FnetProventos.gs!montarProventosAnunciados_): quantidade na data
// com x valor por cota, já cruzada com a aba Proventos. Aqui só desenha.
import { formatBRL, formatNumeroBR } from '../format.js';

/** 'yyyy-MM-dd' -> 'dd/MM' (sem passar por Date: não vira o dia por fuso). */
export function diaMesDeChave(chave) {
  const m = String(chave || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : '—';
}

/** 'yyyy-MM' de hoje no fuso local (o do Tiago). */
function anoMesLocal_(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Totais: este mês (pagamento no mês corrente) e depois dele.
 * `itens` = proventosAnunciados.aReceber.
 */
export function resumirProventosAReceber(itens, { hoje = new Date() } = {}) {
  const mes = anoMesLocal_(hoje);
  let esteMes = 0, depois = 0;
  (itens || []).forEach((p) => {
    if (!(typeof p.valor === 'number')) return;
    if (String(p.dataPagamento).slice(0, 7) === mes) esteMes += p.valor;
    else if (String(p.dataPagamento).slice(0, 7) > mes) depois += p.valor;
  });
  return { esteMes: Math.round(esteMes * 100) / 100, depois: Math.round(depois * 100) / 100 };
}

function linhaHtml_(p, { pago = false } = {}) {
  const cotas = `${formatNumeroBR(p.quantidade, 0)} ${p.quantidade === 1 ? 'cota' : 'cotas'} × ${formatBRL(p.valorPorCota)}`;
  const quando = pago ? `pago em ${diaMesDeChave(p.dataPagamento)}` : `paga ${diaMesDeChave(p.dataPagamento)}`;
  const tipo = p.tipo && p.tipo !== 'Rendimento' ? ` · ${p.tipo}` : '';
  const selo = p.jaLancado ? '<span class="prov-selo" title="Já está na aba Proventos">lançado</span>' : '';
  return `
    <li class="prov-item">
      <div class="prov-principal">
        <span class="prov-ticker">${p.ticker}</span>${selo}
        <span class="prov-quando">${quando} · data com ${diaMesDeChave(p.dataCom)}${tipo}</span>
      </div>
      <div class="prov-valor">
        <b>${formatBRL(p.valor)}</b>
        <span class="prov-cotas">${cotas}</span>
      </div>
    </li>`;
}

/**
 * Desenha a área "Proventos a receber" (some quando não há nada a mostrar).
 * `dados` = resposta.proventosAnunciados ({ aReceber, pagosNaoLancados, fonte }).
 */
export function renderProventosAnunciados(doc, secao, dados, { hoje = new Date() } = {}) {
  if (!secao) return;
  const aReceber = (dados && Array.isArray(dados.aReceber)) ? dados.aReceber : [];
  const naoLancados = (dados && Array.isArray(dados.pagosNaoLancados)) ? dados.pagosNaoLancados : [];
  const corpo = secao.querySelector('.prov-corpo');
  if (!aReceber.length && !naoLancados.length) {
    secao.hidden = true;
    if (corpo) corpo.innerHTML = '';
    return;
  }
  secao.hidden = false;
  const { esteMes, depois } = resumirProventosAReceber(aReceber, { hoje });
  let html = '';
  if (aReceber.length) {
    html += `
      <div class="prov-resumo">
        <span>Este mês <b class="good">${formatBRL(esteMes)}</b></span>
        ${depois > 0 ? `<span>Depois <b>${formatBRL(depois)}</b></span>` : ''}
      </div>
      <ul class="prov-lista">${aReceber.map((p) => linhaHtml_(p)).join('')}</ul>`;
  }
  if (naoLancados.length) {
    html += `
      <p class="prov-aviso">Já pagos e ainda não lançados na aba Proventos:</p>
      <ul class="prov-lista prov-lista-aviso">${naoLancados.map((p) => linhaHtml_(p, { pago: true })).join('')}</ul>`;
  }
  corpo.innerHTML = html;
}
