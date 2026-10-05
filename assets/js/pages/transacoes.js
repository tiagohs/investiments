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
//
// 27/09/2026: "Ver gráfico do preço" no popover do mapa de compras (aba
// Aportes) dispara o evento `transacoes:verGrafico` (mesmo padrão do
// `consolidacao:pendente`/`consolidacao:abrir` já usado entre lancamentos.js
// e shell.js); aqui a gente escuta, troca pra aba Lançamentos, filtra pelo
// ativo e abre o gráfico (busca o histórico de preço via getHistoricoAtivo).

import { getTransacoes, salvarAporte, excluirAporte, salvarCaixaDolar, excluirCaixaDolar, importarLancamentos, getHistoricoAtivo } from '../api-client.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { carrinhoValido } from './aportes-calc.js';
import { CHAVE_CARRINHO, EVENTO_CARRINHO, EVENTO_ABRIR_CARRINHO } from '../carrinho-global.js';
import { renderAportes, estadoInicialAportes } from './aportes.js';
import { renderLancamentos, estadoInicialLancamentos, carregarSheetJs, abrirGraficoPara } from './lancamentos.js';

const CHAVE_CACHE = 'transacoes';
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
  if (hash === 'carrinho') return 'aportes'; // 05/10/2026: "Ir para Transações" do carrinho do header
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
 * opcoes: { doc, getTransacoesImpl, salvarAporteImpl, excluirAporteImpl, salvarCaixaDolarImpl, excluirCaixaDolarImpl, importarImpl, carregarXlsx, getHistoricoAtivoImpl }
 */
export async function montarPaginaTransacoes(token, {
  doc = document, getTransacoesImpl = getTransacoes, salvarAporteImpl = salvarAporte, excluirAporteImpl = excluirAporte,
  salvarCaixaDolarImpl = salvarCaixaDolar, excluirCaixaDolarImpl = excluirCaixaDolar,
  importarImpl = importarLancamentos, carregarXlsx = carregarSheetJs, getHistoricoAtivoImpl = getHistoricoAtivo,
} = {}) {
  const loadingEl = doc.getElementById('transacoesLoading');
  const erroEl = doc.getElementById('transacoesErro');
  const conteudo = doc.getElementById('transacoesConteudo');
  const refreshEl = doc.getElementById('refreshControlTransacoes');
  const win = doc.defaultView;
  const estado = { aba: abaInicial(win), aportes: null, lancamentos: estadoInicialLancamentos() };
  let dados = null;

  // 05/10/2026: o carrinho guarda o dólar da hora (o header soma os itens em US$ com ele) e avisa o
  // header de todas as telas (evento carrinho:mudou) pra atualizar o ícone/contagem.
  const salvarCarrinho = (c) => {
    const cambio = dados && dados.cambio > 0 ? { cambio: dados.cambio } : {};
    gravarLocal(CHAVE_CARRINHO, { ...c, ...cambio });
    if (win && typeof win.CustomEvent === 'function' && typeof win.dispatchEvent === 'function') {
      win.dispatchEvent(new win.CustomEvent(EVENTO_CARRINHO, { detail: { origem: 'pagina' } }));
    }
  };

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
        salvarCaixaDolar: (mov) => salvarCaixaDolarImpl(token, mov),
        excluirCaixaDolar: (id) => excluirCaixaDolarImpl(token, id),
        aoMudarCaixa: (caixa) => { dados.caixaDolar = caixa; gravarCacheDados(CHAVE_CACHE, dados); },
        aoMudarDados: (aportes) => { dados.aportes = aportes; gravarCacheDados(CHAVE_CACHE, dados); desenharTopo(); },
      });
    } else {
      renderLancamentos({
        doc, el: pL, dados, estado: estado.lancamentos, carregarXlsx,
        importar: (itens, opcoes) => importarImpl(token, itens, opcoes),
        recarregar: carregar,
        baixar: (nome, texto) => baixarArquivo(doc, nome, texto),
        getHistoricoAtivo: (ticker) => getHistoricoAtivoImpl(token, ticker),
      });
    }
  }

  function desenhar(novos) {
    dados = novos;
    if (!estado.aportes) {
      estado.aportes = estadoInicialAportes(dados, carrinhoValido(lerLocal(CHAVE_CARRINHO), dados.hoje));
      if (String((win && win.location && win.location.hash) || '') === '#carrinho') estado.aportes.carrinhoAberto = true;
    }
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
      if (win && typeof win.addEventListener === 'function') {
        // 05/10/2026: o header (carrinho em andamento) pode descartar o carrinho ("Não comprei"), pedir
        // pra abrir ("Ir para Transações" estando aqui) ou mudar o carrinho em outra aba do navegador.
        win.addEventListener(EVENTO_CARRINHO, (ev) => {
          if (!dados || !estado.aportes || (ev.detail && ev.detail.origem === 'pagina')) return;
          estado.aportes.carrinho = carrinhoValido(lerLocal(CHAVE_CARRINHO), dados.hoje);
          if (estado.aba === 'aportes') desenharPainel();
        });
        win.addEventListener(EVENTO_ABRIR_CARRINHO, () => {
          if (!dados || !estado.aportes) return;
          estado.aba = 'aportes';
          estado.aportes.carrinhoAberto = true;
          desenharTopo();
          desenharPainel();
          const alvo = conteudo.querySelector('#txNovoAporte');
          if (alvo && typeof alvo.scrollIntoView === 'function') alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        // 27/09/2026: "Ver gráfico do preço" do popover do mapa de compras (Aportes) - troca pra
        // Lançamentos já filtrado nesse ativo e abre o gráfico "Suas compras no preço".
        win.addEventListener('transacoes:verGrafico', (ev) => {
          const ticker = ev.detail && ev.detail.ativo;
          if (!ticker || !dados) return;
          estado.aba = 'lancamentos';
          gravarLocal(CHAVE_ABA, 'lancamentos');
          if (win.history && typeof win.history.replaceState === 'function') {
            try { win.history.replaceState(null, '', '#lancamentos'); } catch (e) { /* ok */ }
          }
          desenharTopo();
          desenharPainel();
          const pL = conteudo.querySelector('#txPainel-lancamentos');
          if (pL && pL._txCtx) abrirGraficoPara(pL._txCtx, ticker);
          const lista = conteudo.querySelector('#txLista');
          if (lista && typeof lista.scrollIntoView === 'function') lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
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
  // 26/09/2026: o botão "Atualizar dados" entra ANTES da 1ª busca (mostra
  // "Atualizando…" enquanto carrega) e fica fora do conteúdo - visível no
  // carregamento e no erro também, que é quando mais se precisa dele.
  await mountRefreshControl(doc, refreshEl, carregar, { setIntervalImpl: null }).atualizar();
}
