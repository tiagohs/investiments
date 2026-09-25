// assets/js/pages/inicio-proventos.js
//
// 24/09/2026: área "Proventos do mês" da Início - o que você já recebeu
// neste mês e o que tem a receber (Tiago: "mantenha na home os proventos a
// receber e os que eu já recebi no mês atual"). A lista chega pronta da
// Home (apps-script/Proventos.gs!montarProventosAnunciados_): sua aba
// Proventos, a exportação da B3 e o FNet, já sem repetição. Aqui só desenha.
import { formatBRL, formatNumeroBR } from '../format.js';
import { urlAtivoTicker, linkAtivoComNovaAbaHtml } from '../link-ativo.js'; // 25/09/2026

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const COR_CLASSE = { acoes: '--acoes', fiis: '--fiis', acoesEua: '--usa' };
const NOME_CLASSE = { acoes: 'Ações', fiis: 'FIIs', acoesEua: 'Ações EUA' };
const LIMITE_RECEBIDOS = 6;

/** 'yyyy-MM-dd' -> 'dd/MM' (sem passar por Date: não vira o dia por fuso). */
export function diaMesDeChave(chave) {
  const m = String(chave || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : '—';
}

function anoMesLocal_(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

const soma_ = (itens) => Math.round((itens || []).reduce((s, p) => s + (typeof p.valor === 'number' ? p.valor : 0), 0) * 100) / 100;

/**
 * Totais do mês: recebido (recebidosNoMes), a receber neste mês e depois
 * (pagamento em mês futuro ou ainda sem data definida).
 */
export function resumirProventosDoMes(dados, { hoje = new Date() } = {}) {
  const mes = anoMesLocal_(hoje);
  const aReceber = (dados && dados.aReceber) || [];
  return {
    recebido: soma_(dados && dados.recebidosNoMes),
    aReceberEsteMes: soma_(aReceber.filter((p) => String(p.dataPagamento || '').slice(0, 7) === mes)),
    aReceberDepois: soma_(aReceber.filter((p) => !p.dataPagamento || String(p.dataPagamento).slice(0, 7) > mes)),
  };
}

/** Compatibilidade (testes antigos): só os a receber. */
export function resumirProventosAReceber(itens, { hoje = new Date() } = {}) {
  const r = resumirProventosDoMes({ aReceber: itens }, { hoje });
  return { esteMes: r.aReceberEsteMes, depois: r.aReceberDepois };
}

function linhaHtml_(p, { modo = 'receber' } = {}) {
  const q = typeof p.quantidade === 'number' && p.quantidade > 0 ? p.quantidade : null;
  const cotas = q != null && p.valorPorCota
    // 25/09/2026: até 4 casas no valor por cota (R$ 0,0022 aparecia "R$ 0,00")
    ? `${formatNumeroBR(q, q % 1 ? 2 : 0)} × ${p.moeda === 'USD' ? 'US$' : 'R$'} ${p.valorPorCota.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
    : '';
  let quando;
  if (modo === 'recebido') quando = `pago ${diaMesDeChave(p.dataPagamento)}`;
  else if (modo === 'naoLancado') quando = `pago ${diaMesDeChave(p.dataPagamento)} · ainda não lançado`;
  else quando = p.dataPagamento ? `paga ${diaMesDeChave(p.dataPagamento)}` : 'pagamento a definir';
  const detalhes = [quando, p.dataCom ? `data com ${diaMesDeChave(p.dataCom)}` : '', p.tipo || ''].filter(Boolean).join(' · ');
  const selo = modo === 'receber' && p.jaLancado ? '<span class="prov-selo" title="Já está na aba Proventos">lançado</span>' : '';
  const cor = COR_CLASSE[p.classe] || '--ink-faint';
  return `
    <li class="prov-item">
      <div class="prov-principal">
        <span class="prov-ticker"><span class="prov-dot" style="background:var(${cor})" title="${NOME_CLASSE[p.classe] || ''}"></span>${linkAtivoComNovaAbaHtml(urlAtivoTicker(p.ticker), p.ticker, p.ticker)}${selo}</span>
        <span class="prov-quando">${detalhes}</span>
      </div>
      <div class="prov-valor">
        <b>${formatBRL(p.valor)}</b>
        ${cotas ? `<span class="prov-cotas">${cotas}</span>` : ''}
      </div>
    </li>`;
}

/**
 * Desenha "Proventos do mês" (some quando não há nada a mostrar).
 * `dados` = resposta.proventosAnunciados ({ aReceber, recebidosNoMes, pagosNaoLancados }).
 */
export function renderProventosAnunciados(doc, secao, dados, { hoje = new Date() } = {}) {
  if (!secao) return;
  const aReceber = (dados && Array.isArray(dados.aReceber)) ? dados.aReceber : [];
  const recebidos = (dados && Array.isArray(dados.recebidosNoMes)) ? dados.recebidosNoMes : [];
  const naoLancados = (dados && Array.isArray(dados.pagosNaoLancados)) ? dados.pagosNaoLancados : [];
  const corpo = secao.querySelector('.prov-corpo');
  if (!aReceber.length && !recebidos.length && !naoLancados.length) {
    secao.hidden = true;
    if (corpo) corpo.innerHTML = '';
    return;
  }
  secao.hidden = false;
  const r = resumirProventosDoMes({ aReceber, recebidosNoMes: recebidos }, { hoje });
  const nomeMes = MESES[hoje.getMonth()];
  const recebidosOrdenados = recebidos.slice().sort((a, b) => (a.dataPagamento < b.dataPagamento ? 1 : -1));
  const mostrarTodos = !!secao._provMostrarTodos;
  const visiveis = mostrarTodos ? recebidosOrdenados : recebidosOrdenados.slice(0, LIMITE_RECEBIDOS);

  let html = `
    <div class="prov-resumo">
      <span>Recebido em ${nomeMes} <b class="good">${formatBRL(r.recebido)}</b></span>
      <span>A receber em ${nomeMes} <b>${formatBRL(r.aReceberEsteMes)}</b></span>
      ${r.aReceberDepois > 0 ? `<span>Depois <b>${formatBRL(r.aReceberDepois)}</b></span>` : ''}
    </div>`;
  if (aReceber.length) {
    html += `<p class="prov-subtitulo">A receber</p><ul class="prov-lista">${aReceber.map((p) => linhaHtml_(p)).join('')}</ul>`;
  }
  if (recebidos.length) {
    html += `<p class="prov-subtitulo">Recebidos em ${nomeMes}</p><ul class="prov-lista">${visiveis.map((p) => linhaHtml_(p, { modo: 'recebido' })).join('')}</ul>`;
    if (recebidos.length > LIMITE_RECEBIDOS) {
      html += `<button type="button" class="prov-mais">${mostrarTodos ? 'Mostrar menos' : `Ver todos os ${recebidos.length}`}</button>`;
    }
  }
  if (naoLancados.length) {
    html += `<p class="prov-aviso">Já pagos e ainda não lançados na aba Proventos:</p>
      <ul class="prov-lista prov-lista-aviso">${naoLancados.map((p) => linhaHtml_(p, { modo: 'naoLancado' })).join('')}</ul>`;
  }
  corpo.innerHTML = html;
  const botao = corpo.querySelector('.prov-mais');
  if (botao) {
    botao.addEventListener('click', () => {
      secao._provMostrarTodos = !mostrarTodos;
      renderProventosAnunciados(doc, secao, dados, { hoje });
    });
  }
}
