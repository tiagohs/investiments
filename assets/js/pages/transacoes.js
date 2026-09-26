// assets/js/pages/transacoes.js
//
// 26/09/2026: tela Transações (menu principal), com duas abas (Tiago:
// "concordo com duas abas"):
//  - Aportes (aportes.js): o carrinho do dia de compra - carrinho ->
//    aguardando valores finais -> concluído; independente das transações;
//  - Lançamentos (lancamentos.js): importar os extratos da B3 e da
//    Interactive Brokers, lançar manualmente e ver tudo que está nas abas.
// Os dados vêm de uma chamada só (action=transacoes, Aportes.gs) e ficam no
// cache do navegador pra abrir na hora; o carrinho fica neste navegador
// (localStorage) até ser confirmado.

import { getTransacoes, salvarAporte, excluirAporte, importarLancamentos } from '../api-client.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { carrinhoValido } from './aportes-calc.js';
import { renderAportes, estadoInicialAportes } from './aportes.js';
import { renderLancamentos, estadoInicialLancamentos, carregarSheetJs } from './lancamentos.js';

const CHAVE_CACHE = 'transacoes';
const CHAVE_CARRINHO = 'transacoes.carrinho.v1';
const CHAVE_ABA = 'transacoes.aba.v1';
const ABAS = [{ id: 'aportes', nome: 'Aportes' }, { id: 'lancamentos', nome: 'Lançamentos' }];

function lerLocal(chave) {
  try { return JSON.parse(globalThis.localStorage.getItem(chave) || 'null'); } catch (e) { return null; }
}
function gravarLocal(chave, valor) {
  try { globalThis.localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* só conveniência */ }
}

function abaInicial(win) {
  const hash = String((win && win.location && win.location.hash) || '').replace('#', '');
  if (ABAS.some((a) => a.id === hash)) return hash;
  const salva = lerLocal(CHAVE_ABA);
  return ABAS.some((a) => a.id === salva) ? salva : 'aportes';
}

function baixarArquivo(doc, nome, conteudo) {
  const win = doc.defaultView;
  const blob = new win.Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = win.URL && win.URL.createObjectURL ? win.URL.createObjectURL(blob) : null;
  const a = doc.createElement('a');
  a.href = url || `data:text/csv;charset=utf-8,${encodeURIComponent(conteudo)}`;
  a.download = nome;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  if (url && win.URL.revokeObjectURL) setTimeout(() => win.URL.revokeObjectURL(url), 1000);
}

function topoHtml(estado, dados) {
  const aguardando = (dados.aportes || []).filter((a) => a.status === 'aguardando').length;
  return `
    <div class="tx-abas" role="tablist" aria-label="Transações">
      ${ABAS.map((a) => `<button type="button" role="tab" class="tx-aba${estado.aba === a.id ? ' active' : ''}" data-aba="${a.id}" aria-selected="${estado.aba === a.id}" aria-controls="txPainel-${a.id}">${a.nome}${a.id === 'aportes' && aguardando ? `<span class="tx-aba-n" title="Aportes aguardando valores finais">${aguardando}</span>` : ''}</button>`).join('')}
    </div>`;
}

/**
 * opcoes: { doc, getTransacoesImpl, salvarAporteImpl, excluirAporteImpl, importarImpl, carregarXlsx }
 */
export async function montarPaginaTransacoes(token, {
  doc = document, getTransacoesImpl = getTransacoes, salvarAporteImpl = salvarAporte, excluirAporteImpl = excluirAporte,
  importarImpl = importarLancamentos, carregarXlsx = carregarSheetJs,
} = {}) {
  const loadingEl = doc.getElementById('transacoesLoading');
  const erroEl = doc.getElementById('transacoesErro');
  const conteudo = doc.getElementById('transacoesConteudo');
  const refreshEl = doc.getElementById('refreshControlTransacoes');
  const win = doc.defaultView;
  const estado = { aba: abaInicial(win), aportes: null, lancamentos: estadoInicialLancamentos() };
  let dados = null;

  const salvarCarrinho = (c) => gravarLocal(CHAVE_CARRINHO, c);

  function desenharTopo() {
    const topo = conteudo.querySelector('#txTopo');
    if (topo) topo.innerHTML = topoHtml(estado, dados);
  }

  function desenharPainel() {
    const pA = conteudo.querySelector('#txPainel-aportes');
    const pL = conteudo.querySelector('#txPainel-lancamentos');
    pA.hidden = estado.aba !== 'aportes';
    pL.hidden = estado.aba !== 'lancamentos';
    if (estado.aba === 'aportes') {
      renderAportes({
        doc, el: pA, dados, estado: estado.aportes, salvarCarrinho,
        salvarAporte: (aporte) => salvarAporteImpl(token, aporte),
        excluirAporte: (id) => excluirAporteImpl(token, id),
        aoMudarDados: (aportes) => { dados.aportes = aportes; gravarCacheDados(CHAVE_CACHE, dados); desenharTopo(); },
      });
    } else {
      renderLancamentos({
        doc, el: pL, dados, estado: estado.lancamentos, carregarXlsx,
        importar: (itens, opcoes) => importarImpl(token, itens, opcoes),
        recarregar: carregar,
        baixar: (nome, texto) => baixarArquivo(doc, nome, texto),
      });
    }
  }

  function desenhar(novos) {
    dados = novos;
    if (!estado.aportes) estado.aportes = estadoInicialAportes(dados, carrinhoValido(lerLocal(CHAVE_CARRINHO), dados.hoje));
    loadingEl.hidden = true;
    conteudo.hidden = false;
    if (!conteudo.querySelector('#txTopo')) {
      conteudo.innerHTML = `
        <div id="txTopo"></div>
        <div class="tx-painel" id="txPainel-aportes" role="tabpanel"></div>
        <div class="tx-painel" id="txPainel-lancamentos" role="tabpanel" hidden></div>`;
      conteudo.querySelector('#txTopo').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-aba]');
        if (!b) return;
        estado.aba = b.getAttribute('data-aba');
        gravarLocal(CHAVE_ABA, estado.aba);
        if (win && win.history && typeof win.history.replaceState === 'function') {
          try { win.history.replaceState(null, '', `#${estado.aba}`); } catch (e) { /* ok */ }
        }
        desenharTopo();
        desenharPainel();
      });
    }
    desenharTopo();
    desenharPainel();
  }

  async function carregar() {
    const r = await getTransacoesImpl(token);
    if (!r || !r.ok) {
      loadingEl.hidden = true;
      if (!dados) {
        erroEl.hidden = false;
        erroEl.textContent = `Não deu pra carregar as transações agora (${(r && r.etapa) || '?'}): ${(r && r.erro) || 'erro desconhecido'}.`;
      }
      return;
    }
    erroEl.hidden = true;
    gravarCacheDados(CHAVE_CACHE, r);
    desenhar(r);
  }

  const cache = await lerCacheDados(CHAVE_CACHE);
  if (cache && cache.dados && cache.dados.ok) desenhar(cache.dados);
  await carregar();
  // sem atualização automática: a tela tem campos sendo digitados (carrinho, valores finais)
  mountRefreshControl(doc, refreshEl, carregar, { setIntervalImpl: null }).marcarAtualizado();
}
