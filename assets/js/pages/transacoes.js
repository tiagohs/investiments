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

import { publicarAportesPendentes, EVENTO_ABRIR_LANCAMENTOS } from '../carrinho-header.js';
import { getTransacoes, salvarAporte, excluirAporte, lancarAportesEua, salvarCaixaDolar, excluirCaixaDolar, importarLancamentos, getHistoricoAtivo } from '../api-client.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { carrinhoValido } from './aportes-calc.js';
import { CHAVE_CARRINHO, EVENTO_CARRINHO, EVENTO_ABRIR_CARRINHO } from '../carrinho-global.js';
// 06/10/2026 (A-42): as duas abas (aportes.js ≈ 131 KB, lancamentos.js ≈ 88 KB com seus módulos) são importadas sob demanda - a aba
// ativa vem primeiro (antes do 1º desenho) e a outra entra em segundo plano logo depois, então trocar de aba quase sempre é imediato.
const carregarModuloAba = {
  aportes: () => import('./aportes.js'),
  lancamentos: () => import('./lancamentos.js'),
};
import { montarCabecalhoPagina, mostrarErroCarga, toast } from '../ui/index.js'; // 06/10/2026 (Onda 3, kit Figma)

const CHAVE_CACHE = 'transacoes';
const CHAVE_ABA = 'transacoes.aba.v1';
const ABAS = [{ id: 'aportes', nome: 'Aportes' }, { id: 'lancamentos', nome: 'Lançamentos' }];
const SECAO = 'Transações';

function lerLocal(chave) {
  try { return JSON.parse(globalThis.localStorage.getItem(chave) || 'null'); } catch (e) { return null; }
}
function gravarLocal(chave, valor) {
  try { globalThis.localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* só conveniência */ }
}

function abaInicial(win) {
  const hash = String((win && win.location && win.location.hash) || '').replace('#', '');
  if (hash === 'carrinho' || hash === 'andamento') return 'aportes'; // 05-06/10/2026: links do carrinho do header
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

const aguardandoDe = (dados) => ((dados && dados.aportes) || []).filter((a) => a.status === 'aguardando').length;

/**
 * opcoes: { doc, getTransacoesImpl, salvarAporteImpl, excluirAporteImpl, salvarCaixaDolarImpl, excluirCaixaDolarImpl, importarImpl, carregarXlsx, getHistoricoAtivoImpl }
 */
export async function montarPaginaTransacoes(token, {
  doc = document, getTransacoesImpl = getTransacoes, salvarAporteImpl = salvarAporte, excluirAporteImpl = excluirAporte, lancarAportesEuaImpl = lancarAportesEua,
  salvarCaixaDolarImpl = salvarCaixaDolar, excluirCaixaDolarImpl = excluirCaixaDolar,
  importarImpl = importarLancamentos, carregarXlsx = undefined, getHistoricoAtivoImpl = getHistoricoAtivo, carregarMetas = undefined,
} = {}) {
  const loadingEl = doc.getElementById('transacoesLoading');
  const erroEl = doc.getElementById('transacoesErro');
  const conteudo = doc.getElementById('transacoesConteudo');
  const win = doc.defaultView;
  const estado = { aba: abaInicial(win), aportes: null, lancamentos: null };
  const modulos = { aportes: null, lancamentos: null }; // módulos já carregados
  const promessas = {};
  let segundoPlano = null; // import da aba que não está à vista (termina antes de montarPaginaTransacoes resolver; ninguém espera por isso na tela)
  /** Importa o módulo da aba (1x) e, no de Lançamentos, cria o estado inicial dele. */
  const carregarAba = (nome) => {
    if (!promessas[nome]) {
      promessas[nome] = carregarModuloAba[nome]().then((m) => {
        modulos[nome] = m;
        if (nome === 'lancamentos' && !estado.lancamentos) estado.lancamentos = m.estadoInicialLancamentos();
        return m;
      });
    }
    return promessas[nome];
  };
  let dados = null;

  // 06/10/2026 (Onda 3): cabeçalho padrão (título, subtítulo, Atualizar dados) com as abas em pílula = subpáginas;
  // document.title "<Subaba> · Transações · Patrimônio" (A-69)
  let cabEl = doc.getElementById('txCabecalho');
  if (!cabEl) { cabEl = doc.createElement('div'); cabEl.id = 'txCabecalho'; conteudo.parentNode.insertBefore(cabEl, conteudo.parentNode.firstChild); }
  const cab = montarCabecalhoPagina(cabEl, {
    secao: SECAO, subaba: (ABAS.find((a) => a.id === estado.aba) || ABAS[0]).nome, titulo: 'Transações',
    subtitulo: 'Monte o aporte do dia, confira o que aguarda valores finais e lance os extratos da B3 e da Interactive Brokers.',
    refresh: true,
    abas: {
      pilula: {
        rotulo: 'Transações', ativo: estado.aba, idBase: 'txAbas',
        itens: ABAS.map((a) => ({ id: a.id, rotulo: a.nome })),
        aoMudar(id) { trocarAba(id, { sincronizarAbas: false }); },
      },
    },
    doc,
  });

  // 05/10/2026: o carrinho guarda o dólar da hora (o header soma os itens em US$ com ele) e avisa o
  // header de todas as telas (evento carrinho:mudou) pra atualizar o ícone/contagem.
  const salvarCarrinho = (c) => {
    const cambio = dados && dados.cambio > 0 ? { cambio: dados.cambio } : {};
    gravarLocal(CHAVE_CARRINHO, { ...c, ...cambio });
    if (win && typeof win.CustomEvent === 'function' && typeof win.dispatchEvent === 'function') {
      win.dispatchEvent(new win.CustomEvent(EVENTO_CARRINHO, { detail: { origem: 'pagina' } }));
    }
  };

  /** A contagem de "aguardando valores finais" fica na aba Aportes (como o selo das abas do kit). */
  function desenharTopo() {
    const n = aguardandoDe(dados);
    cab.abas.pilula.atualizarItem('aportes', { contagem: n || '' });
    const botaoAportes = cab.abas.pilula.botao('aportes');
    const marca = botaoAportes && botaoAportes.querySelector('.tab-n');
    if (marca) marca.title = 'Aportes aguardando valores finais';
  }

  /** Troca a aba (clique, atalho do header ou gráfico do mapa): guarda a escolha, atualiza #hash, título e painel. */
  function trocarAba(id, { sincronizarAbas = true, persistirHash = true } = {}) {
    estado.aba = id;
    gravarLocal(CHAVE_ABA, id);
    if (persistirHash && win && win.history && typeof win.history.replaceState === 'function') {
      try { win.history.replaceState(null, '', `#${id}`); } catch (e) { /* ok */ }
    }
    if (sincronizarAbas) cab.abas.pilula.selecionar(id);
    cab.definirTitulo('Transações', { subaba: (ABAS.find((a) => a.id === id) || ABAS[0]).nome, secao: SECAO });
    if (!dados) return; // ainda carregando: o painel aparece quando os dados chegarem
    desenharTopo();
    desenharPainel();
  }

  function desenharPainel() {
    const pA = conteudo.querySelector('#txPainel-aportes');
    const pL = conteudo.querySelector('#txPainel-lancamentos');
    pA.hidden = estado.aba !== 'aportes';
    pL.hidden = estado.aba !== 'lancamentos';
    const mod = modulos[estado.aba];
    if (!mod) { // módulo da aba ainda não chegou (só acontece se trocar de aba antes do segundo plano terminar)
      const aba = estado.aba;
      carregarAba(aba).then(() => { if (estado.aba === aba && dados) desenharPainel(); }).catch((e) => console.error(`transacoes: falha ao carregar a aba ${aba}`, e));
      return;
    }
    if (estado.aba === 'aportes') {
      mod.renderAportes({
        doc, el: pA, dados, estado: estado.aportes, salvarCarrinho, carregarMetas,
        salvarAporte: (aporte) => salvarAporteImpl(token, aporte),
        excluirAporte: (id) => excluirAporteImpl(token, id),
        salvarCaixaDolar: (mov) => salvarCaixaDolarImpl(token, mov),
        excluirCaixaDolar: (id) => excluirCaixaDolarImpl(token, id),
        aoMudarCaixa: (caixa) => { dados.caixaDolar = caixa; gravarCacheDados(CHAVE_CACHE, dados); },
        aoMudarDados: (aportes, aConfirmar) => {
          dados.aportes = aportes;
          if (Array.isArray(aConfirmar)) dados.aConfirmar = aConfirmar; // 05/10/2026 (A-24)
          gravarCacheDados(CHAVE_CACHE, dados);
          desenharTopo();
          publicarAportesPendentes(aportes, { win, aConfirmar: dados.aConfirmar });
        },
      });
    } else {
      mod.renderLancamentos({
        doc, el: pL, dados, estado: estado.lancamentos, carregarXlsx: carregarXlsx || mod.carregarSheetJs,
        importar: (itens, opcoes) => importarImpl(token, itens, opcoes),
        lancarEua: (aporteId) => lancarAportesEuaImpl(token, aporteId), // 07/10/2026: "Lançar agora" das Ações EUA a confirmar
        recarregar: carregar,
        baixar: (nome, texto) => baixarArquivo(doc, nome, texto),
        getHistoricoAtivo: (ticker) => getHistoricoAtivoImpl(token, ticker),
      });
    }
  }

  async function desenhar(novos) {
    dados = novos;
    publicarAportesPendentes(dados && dados.aportes, { win, aConfirmar: dados && dados.aConfirmar }); // 06/10/2026: aviso do header (+ 05/10/2026, A-24: lançamentos a confirmar)
    if (!estado.aportes) {
      // a aba ativa e a de Aportes (o estado do carrinho vem dela) precisam estar carregadas antes do 1º desenho
      const [modAportes] = await Promise.all([carregarAba('aportes'), carregarAba(estado.aba)]);
      if (estado.aportes) return desenhar(dados); // outra chamada já montou enquanto esta esperava
      estado.aportes = modAportes.estadoInicialAportes(dados, carrinhoValido(lerLocal(CHAVE_CARRINHO), dados.hoje));
      if (String((win && win.location && win.location.hash) || '') === '#carrinho') estado.aportes.carrinhoAberto = true;
      // 06/10/2026: "Conferir e concluir" do header -> rola até "Aguardando valores finais"
      if (String((win && win.location && win.location.hash) || '') === '#andamento' && win && typeof win.setTimeout === 'function') {
        win.setTimeout(() => { const alvo = doc.getElementById('txAndamento'); if (alvo && typeof alvo.scrollIntoView === 'function') alvo.scrollIntoView({ block: 'start' }); }, 50);
      }
    }
    loadingEl.hidden = true;
    conteudo.hidden = false;
    if (!conteudo.querySelector('#txTopo')) {
      conteudo.innerHTML = `
        <div class="tx-painel" id="txPainel-aportes" role="tabpanel" aria-labelledby="txAbas-tab-aportes"></div>
        <div class="tx-painel" id="txPainel-lancamentos" role="tabpanel" aria-labelledby="txAbas-tab-lancamentos" hidden></div>`;
      if (win && typeof win.addEventListener === 'function') {
        // 05/10/2026: o header (carrinho em andamento) pode descartar o carrinho ("Não comprei"), pedir
        // pra abrir ("Ir para Transações" estando aqui) ou mudar o carrinho em outra aba do navegador.
        win.addEventListener(EVENTO_CARRINHO, (ev) => {
          if (!dados || !estado.aportes || (ev.detail && ev.detail.origem === 'pagina')) return;
          estado.aportes.carrinho = carrinhoValido(lerLocal(CHAVE_CARRINHO), dados.hoje);
          if (estado.aba === 'aportes') desenharPainel();
        });
        // 05/10/2026 (A-24): "Ver em Lançamentos" do aviso "a confirmar" do header, estando aqui
        win.addEventListener(EVENTO_ABRIR_LANCAMENTOS, () => {
          if (!dados) return;
          trocarAba('lancamentos', { persistirHash: false });
          const lista = conteudo.querySelector('#txLista');
          if (lista && typeof lista.scrollIntoView === 'function') lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        win.addEventListener(EVENTO_ABRIR_CARRINHO, () => {
          if (!dados || !estado.aportes) return;
          estado.aportes.carrinhoAberto = true;
          trocarAba('aportes', { persistirHash: false });
          const alvo = conteudo.querySelector('#txNovoAporte');
          if (alvo && typeof alvo.scrollIntoView === 'function') alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        // 27/09/2026: "Ver gráfico do preço" do popover do mapa de compras (Aportes) - troca pra
        // Lançamentos já filtrado nesse ativo e abre o gráfico "Suas compras no preço".
        win.addEventListener('transacoes:verGrafico', async (ev) => {
          const ticker = ev.detail && ev.detail.ativo;
          if (!ticker || !dados) return;
          const modLanc = await carregarAba('lancamentos');
          trocarAba('lancamentos');
          const pL = conteudo.querySelector('#txPainel-lancamentos');
          if (pL && pL._txCtx) modLanc.abrirGraficoPara(pL._txCtx, ticker);
          const lista = conteudo.querySelector('#txLista');
          if (lista && typeof lista.scrollIntoView === 'function') lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
    desenharTopo();
    desenharPainel();
    // 06/10/2026 (A-42): a outra aba chega em segundo plano (idle), pra troca de aba ser imediata
    const outra = estado.aba === 'aportes' ? 'lancamentos' : 'aportes';
    if (!promessas[outra]) segundoPlano = carregarAba(outra).catch(() => {});
  }

  /** Devolve false quando a busca falha (o "Atualizar dados" mostra "Falhou"); true quando desenhou. */
  async function carregar() {
    let r;
    try { r = await getTransacoesImpl(token); } catch (e) { r = { ok: false, erro: String((e && e.message) || e) }; }
    if (!r || !r.ok) {
      loadingEl.hidden = true;
      if (!dados) {
        // 06/10/2026 (A-60/A-61): texto humano + "Tentar de novo"; o detalhe técnico fica recolhido
        mostrarErroCarga(erroEl, { tela: 'Transações', resposta: r, aoTentar: async () => { loadingEl.hidden = false; erroEl.hidden = true; await carregar(); }, doc });
      } else {
        toast.erro('Não consegui atualizar as transações agora. Mostrando os últimos dados.', { doc });
      }
      return false;
    }
    erroEl.hidden = true;
    gravarCacheDados(CHAVE_CACHE, r);
    await desenhar(r);
    return true;
  }

  const cache = await lerCacheDados(CHAVE_CACHE);
  if (cache && cache.dados && cache.dados.ok) await desenhar(cache.dados);
  // 26/09/2026: o botão "Atualizar dados" entra ANTES da 1ª busca (mostra
  // "Atualizando…" enquanto carrega) e fica fora do conteúdo - visível no
  // carregamento e no erro também, que é quando mais se precisa dele.
  await mountRefreshControl(doc, cab.refreshEl, carregar, { setIntervalImpl: null }).atualizar();
  await segundoPlano;
}
