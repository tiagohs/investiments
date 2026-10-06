/**
 * inicio-hero.js - 07/10/2026: o desenho do hero "Patrimônio líquido" da Início (Tiago: "o patrimônio líquido em destaque, com
 * o que ele rendeu de verdade contra a inflação, e o anel de tudo que eu tenho do lado"). As contas estão em
 * inicio-hero-calc.js (modeloHero); aqui só DOM: filtro de período (o seletor canônico de periodo-personalizado.js, escolha
 * lembrada no navegador), número grande, chip de variação, destaque verde com o ⓘ, decomposição, sparkline, 3 atalhos e o
 * anel com a "conta" (tudo que você tem − dívidas = líquido). Tudo entra por textContent (nada de dado vira HTML).
 *
 * Estados do cartão (data-estado): 'carregando' (esqueleto), 'pronto' e 'erro' (mostrarErroCarga compacto + "Tentar de novo").
 * O erro só aparece se ainda não há nada desenhado (dado do cache ou de uma busca anterior continua na tela).
 *
 *   const hero = criarHero(doc, el, { aoTentar });   hero.carregando(); hero.dados(respostaGetPatrimonio); hero.erro(resposta);
 */
import { criarAnel, criarSparkline } from '../charts/index.js';
import { icone, criar } from '../ui/dom.js';
import { mostrarErroCarga } from '../ui/index.js';
import { botoesSegmentadoHtml, ligarFiltroPeriodo } from '../periodo-personalizado.js';
import { resolveSiteRootUrl } from '../shell.js';
import { formatBRL0, formatPctSinal } from '../format.js';
import {
  PERIODOS_HERO, PERIODO_PADRAO_HERO, ROTULOS_PERIODO_HERO, anelHero, contaHero, limitesHero, modeloHero, valorGrande,
} from './inicio-hero-calc.js';

const sinal = (v) => (v < 0 ? '−' : '+');

export function criarHero(doc, el, { aoTentar = null, raizSite = null } = {}) {
  const raiz = raizSite || resolveSiteRootUrl();
  const url = (caminho) => new URL(caminho, raiz).href;
  let dados = null;
  let anel = null;
  let spark = null;
  let filtro = null;
  let desenhado = false;

  el.classList.add('hero-pl');
  el.textContent = '';
  const esqueleto = criar(doc, 'div', { class: 'hero-esqueleto', 'aria-hidden': 'true' }, [
    criar(doc, 'span', { class: 'skel skel-linha hero-esq-a' }), criar(doc, 'span', { class: 'skel skel-linha hero-esq-b' }),
    criar(doc, 'span', { class: 'skel skel-bloco hero-esq-c' }),
  ]);
  const erroEl = criar(doc, 'div', { class: 'hero-erro', hidden: true });

  // ---- esquerda (texto) ----
  const periodoEl = criar(doc, 'div', { class: 'hero-periodo rentab-periodo' });
  periodoEl.innerHTML = botoesSegmentadoHtml(PERIODOS_HERO, PERIODO_PADRAO_HERO, ROTULOS_PERIODO_HERO); // HTML fixo da biblioteca (sem dado externo)
  const valorEl = criar(doc, 'div', { class: 'hero-valor' });
  const linhaEl = criar(doc, 'div', { class: 'hero-linha' });
  const destaqueEl = criar(doc, 'div', { class: 'hero-destaque', hidden: true });
  const destaqueTxt = criar(doc, 'span', { class: 'hero-destaque-txt' });
  const infoBtn = criar(doc, 'button', { type: 'button', class: 'hero-info-btn', 'aria-expanded': 'false', 'aria-controls': 'heroInfoTxt', 'aria-label': 'O que é isso? Dinheiro novo e rendimento' }, [icone(doc, 'info')]);
  destaqueEl.append(destaqueTxt, infoBtn);
  const infoTxt = criar(doc, 'p', { class: 'hero-info-txt', id: 'heroInfoTxt', hidden: true });
  infoBtn.addEventListener('click', () => {
    const abrir = infoTxt.hidden;
    infoTxt.hidden = !abrir;
    infoBtn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  });
  const decompEl = criar(doc, 'p', { class: 'hero-decomp', hidden: true });
  const corteEl = criar(doc, 'p', { class: 'hero-corte', hidden: true });
  const avisoEl = criar(doc, 'p', { class: 'hero-aviso', hidden: true });
  const sparkEl = criar(doc, 'div', { class: 'hero-spark', hidden: true });
  const kpisEl = criar(doc, 'div', { class: 'hero-kpis' });
  const topo = criar(doc, 'div', { class: 'hero-topo' }, [criar(doc, 'h2', { class: 'hero-rotulo', texto: 'Patrimônio líquido' }), periodoEl]);
  const texto = criar(doc, 'div', { class: 'hero-texto' }, [topo, valorEl, linhaEl, destaqueEl, infoTxt, decompEl, corteEl, avisoEl, sparkEl, kpisEl]);

  // ---- direita (anel + conta) ----
  const anelEl = criar(doc, 'div', { class: 'hero-anel-grafico' });
  const contaEl = criar(doc, 'div', { class: 'hero-conta' });
  const verOrg = criar(doc, 'a', { class: 'hero-ver btn btn-text btn-sm', href: url('organizacao/despesas.html#patrimonio'), texto: 'Ver Organização financeira →' });
  const direita = criar(doc, 'div', { class: 'hero-anel' }, [anelEl, contaEl, verOrg]);
  const corpo = criar(doc, 'div', { class: 'hero-corpo', hidden: true }, [texto, direita]);
  el.append(esqueleto, erroEl, corpo);
  el.dataset.estado = 'carregando';

  function estado(e) {
    el.dataset.estado = e;
    esqueleto.hidden = e !== 'carregando';
    erroEl.hidden = e !== 'erro';
    corpo.hidden = e !== 'pronto';
  }

  function kpi(rotulo, valor, href, classe) {
    return criar(doc, 'a', { class: `hero-kpi ${classe}`, href }, [criar(doc, 'span', { class: 'hero-kpi-rot', texto: rotulo }), criar(doc, 'b', { class: 'hero-kpi-val', texto: valor })]);
  }

  function desenharTexto(m) {
    const { principal, dec } = valorGrande(m.liquido);
    valorEl.textContent = '';
    valorEl.append(principal, criar(doc, 'small', { texto: dec }));
    valorEl.setAttribute('aria-label', `Patrimônio líquido hoje: ${principal}${dec}`);

    linhaEl.textContent = '';
    if (m.variacao) {
      const v = m.variacao;
      const bom = v.valor >= 0;
      const chip = criar(doc, 'span', { class: `chip-tonal ${bom ? 'chip-good' : 'chip-bad'} hero-chip` }, [icone(doc, bom ? 'trending-up' : 'trending-down')]);
      chip.append(`${sinal(v.valor)}${formatBRL0(Math.abs(v.valor))}${v.pct != null ? ` (${formatPctSinal(v.pct, 1)})` : ''} ${v.descricao}`);
      linhaEl.append(chip);
      if (v.inicioRotulo) linhaEl.append(criar(doc, 'span', { class: 'hero-era', texto: `era ${formatBRL0(v.inicioValor)} em ${v.inicioRotulo}` }));
    }

    destaqueEl.hidden = !m.destaque;
    infoBtn.hidden = !m.destaque;
    if (m.destaque) {
      destaqueEl.className = `hero-destaque hero-tom-${m.destaque.tom}`;
      destaqueTxt.textContent = '';
      m.destaque.partes.forEach((p) => destaqueTxt.append(p.b ? criar(doc, 'b', { texto: p.b }) : p.t));
      infoTxt.textContent = m.infoRendimento || '';
    } else {
      infoTxt.hidden = true; infoBtn.setAttribute('aria-expanded', 'false');
    }
    decompEl.hidden = !m.decomposicao;
    decompEl.textContent = m.decomposicao ? m.decomposicao.texto : '';
    corteEl.hidden = !m.corte;
    corteEl.textContent = m.corte ? m.corte.texto : '';
    avisoEl.hidden = !m.aviso;
    avisoEl.textContent = m.aviso || '';

    const serie = m.serie || [];
    sparkEl.hidden = serie.length < 2;
    if (serie.length >= 2) {
      if (spark) spark.atualizar(serie);
      else spark = criarSparkline(sparkEl, { valores: serie, altura: 70, animar: false, hover: false, aria: 'Evolução do patrimônio líquido no período' });
    }
  }

  function desenharKpis(m) {
    kpisEl.textContent = '';
    kpisEl.append(kpi('Investimentos e reserva', formatBRL0(m.kpis.investimentos), url('carteiras/index.html'), 'hero-kpi-inv'));
    if (m.kpis.ape) kpisEl.append(kpi('Apê (já é seu)', formatBRL0(m.kpis.ape.valor), url('organizacao/despesas.html#patrimonio'), 'hero-kpi-ape'));
    kpisEl.append(kpi('Dívidas', formatBRL0(m.kpis.dividas), url('organizacao/despesas.html#patrimonio'), 'hero-kpi-div'));
  }

  function desenharAnel(m) {
    const a = anelHero(m);
    const opcoes = { fatias: a.fatias, centro: a.centro, formatarValor: (v) => formatBRL0(v), tamanho: 220, espessura: 28, legenda: 'abaixo', animar: false, aria: 'Composição do que você tem' };
    if (anel) anel.atualizar(opcoes);
    else anel = criarAnel(anelEl, opcoes);
    contaEl.textContent = '';
    contaHero(m).forEach((l) => {
      contaEl.append(criar(doc, 'span', { class: `hero-conta-nome hero-conta-${l.tipo}`, texto: l.nome }), criar(doc, 'span', { class: `hero-conta-valor hero-conta-${l.tipo}`, texto: l.valor }));
    });
  }

  function desenhar() {
    if (!dados) return;
    const periodo = filtro ? filtro.periodo : PERIODO_PADRAO_HERO;
    const m = modeloHero(dados, periodo);
    if (!m) return;
    estado('pronto');
    desenharTexto(m);
    desenharKpis(m);
    desenharAnel(m);
    desenhado = true;
  }

  filtro = ligarFiltroPeriodo(doc, periodoEl, { chave: 'inicio.hero', periodoInicial: PERIODO_PADRAO_HERO, aoMudar: () => desenhar() });

  return {
    /** Esqueleto, só se ainda não há nada desenhado. */
    carregando() { if (!desenhado) estado('carregando'); },
    /** Dado novo (cache ou rede): guarda, ajusta os limites do calendário e redesenha. */
    dados(d) {
      dados = d;
      const lim = limitesHero(d);
      if (filtro && lim) filtro.definirLimites(lim);
      desenhar();
    },
    /** Falha na busca: só mostra o erro se não houver nada desenhado. */
    erro(resposta, erroCapturado) {
      if (desenhado) return;
      estado('erro');
      mostrarErroCarga(erroEl, { tela: 'Patrimônio líquido', resposta, erro: erroCapturado, aoTentar, doc });
    },
    get periodo() { return filtro ? filtro.periodo : PERIODO_PADRAO_HERO; },
    get desenhado() { return desenhado; },
    destruir() { try { if (anel) anel.destruir(); if (spark) spark.destruir(); } catch (e) { /* ok */ } },
  };
}
