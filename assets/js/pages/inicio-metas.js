/**
 * inicio-metas.js - 07/10/2026 (Tiago: "as metas na Home, no topo da coluna da direita, acima de Meus ativos"): o cartão
 * "Metas" da Início - resumo ("4 metas · 2 no ritmo · 2 precisam de atenção"), uma linha por meta (ícone, nome, barra,
 * % + status) e o rodapé "Aporte necessário R$ X/mês · você aporta R$ Y · Ver metas".
 *
 * Nenhuma fórmula nova: o contexto e o cálculo de cada meta são os da tela Metas e Objetivos (metas-card.js!contextoMetas
 * -> metas-calc-plano.js!calcularMeta) e os totais vêm de resumoMetas (o mesmo que o topo daquela tela chama).
 * Decisão (07/10/2026): a meta de "Distribuição da carteira" NÃO entra aqui. Ela não tem alvo em R$ nem % de progresso
 * (é um equilíbrio entre classes) e a própria tela Metas já a deixa fora de "Metas ativas / no ritmo / aporte necessário";
 * mostrar uma linha sem barra e sem % dentro de uma lista de barras só confunde. Ela continua na tela Metas.
 *
 * Cores (regra do Tiago, 06/10/2026): no ritmo/concluída = verde; quase lá/atenção = amarelo; em progresso = cinza;
 * vermelho só pra erro grave (nunca é estado de meta). Pura nos cálculos (modeloMetasHome) + um desenhista (renderMetasHome).
 */
import { calcularMeta, resumoMetas } from './metas-calc-plano.js';
import { aparenciaMeta, STATUS_META, classeStatusVisual } from './metas-calc-nucleo.js';
import { ehMetaDistribuicao } from './metas-distribuicao.js';
import { contextoMetas, iconeMetaSvg, urlMetas } from '../metas-card.js';
import { formatBRL0, formatPct } from '../format.js';
import { criar } from '../ui/dom.js';
import { mostrarErroCarga } from '../ui/index.js';

/** Quantas metas aparecem de cara no celular (as outras ficam atrás do "Ver todas"). */
export const METAS_NO_CELULAR = 3;
/** Quantas no máximo no desktop (acima disso, "Ver todas" leva pra tela Metas). */
export const METAS_NO_DESKTOP = 6;

const STATUS_VERDE = ['no-ritmo', 'concluida', 'saldo-ideal'];
const STATUS_AMARELO = ['atrasada', 'vencida', 'abaixo', 'ideal-bruto'];
/** Rótulo curto do status pro selo da linha ("94% · abaixo"). */
const ROTULO_CURTO = {
  concluida: 'concluída', 'no-ritmo': 'no ritmo', atrasada: 'atrasada', vencida: 'prazo passou', 'sem-prazo': 'sem prazo',
  'saldo-ideal': 'saldo ideal', 'ideal-bruto': 'ideal só no bruto', abaixo: 'abaixo',
  acompanhando: 'acompanhando', // 07/10/2026: meta sem valor alvo ainda - cinza, nunca "atenção"
};

/** 'good' (verde) | 'warn' (amarelo) | 'na' (cinza) do status de uma meta. */
export function classeStatusHome(status, percentual) {
  if (STATUS_VERDE.includes(status)) return 'good';
  if (STATUS_AMARELO.includes(status)) return 'warn';
  return classeStatusVisual(status, percentual); // sem prazo: cinza, ou amarelo se já está a 90%+
}

/** Texto do selo: "94% · abaixo" (sem %, só o status). */
export function seloTexto(percentual, status) {
  const rot = ROTULO_CURTO[status] || (STATUS_META[status] ? STATUS_META[status].rotulo.toLowerCase() : '');
  const p = typeof percentual === 'number' && Number.isFinite(percentual) ? formatPct(Math.max(0, Math.min(1, percentual)), 0) : '';
  return [p, rot].filter(Boolean).join(' · ');
}

/**
 * Modelo do cartão a partir da resposta do getMetas (a mesma que a tela Metas usa):
 * { quantidade, noRitmo, atencao, aporteNecessario, aporteAtual, linhas: [{ id, nome, icone, cor, percentual, status, classe, selo, url }] }.
 * Resposta ruim -> null.
 */
export function modeloMetasHome(resposta, { raizSite } = {}) {
  if (!resposta || !resposta.ok) return null;
  const ctx = contextoMetas(resposta);
  const calcs = (resposta.metas || []).filter((m) => m && !ehMetaDistribuicao(m)).map((meta) => ({ meta, c: calcularMeta(meta, ctx) }));
  const res = resumoMetas(calcs.map((x) => x.c), { patrimonioVinculavel: ctx.alocacao ? ctx.alocacao.patrimonioVinculavel : null });
  const aporteAtual = calcs.reduce((s, x) => s + (x.c.aporteAtual || 0), 0);
  const linhas = calcs.map(({ meta, c }) => {
    const ap = aparenciaMeta(meta);
    const percentual = typeof c.percentual === 'number' && Number.isFinite(c.percentual) ? Math.max(0, Math.min(1, c.percentual)) : null;
    return {
      id: meta.id, nome: meta.nome || ap.rotulo, icone: ap.icone, cor: ap.cor, percentual, status: c.status,
      classe: classeStatusHome(c.status, percentual), selo: seloTexto(percentual, c.status),
      url: urlMetas(meta.id, raizSite ? { raizSite } : undefined),
    };
  });
  return { quantidade: res.quantidade, noRitmo: res.noRitmo, acompanhando: res.acompanhando || 0, atencao: res.atrasadas, aporteNecessario: res.aporteNecessario, aporteAtual, linhas };
}

/** "4 metas · 2 no ritmo · 2 precisam de atenção" como partes (a cor de cada uma vem da classe). */
export function resumoTexto(m) {
  const partes = [{ t: `${m.quantidade} ${m.quantidade === 1 ? 'meta' : 'metas'}` }];
  if (m.noRitmo) partes.push({ t: `${m.noRitmo} no ritmo`, classe: 'good' });
  if (m.acompanhando) partes.push({ t: `${m.acompanhando} acompanhando` }); // 07/10/2026: sem alvo - neutra, fora de "precisam de atenção"
  if (m.atencao) partes.push({ t: `${m.atencao} ${m.atencao === 1 ? 'precisa' : 'precisam'} de atenção`, classe: 'warn' });
  return partes;
}

/**
 * Desenha o cartão dentro de `el` (substitui o conteúdo). `raizSite` só pros testes. `aoVerTodas` é ligado
 * internamente: o botão alterna a lista inteira (celular) - no desktop, a lista já mostra até METAS_NO_DESKTOP.
 */
export function renderMetasHome(doc, el, modelo, { raizSite } = {}) {
  if (!el) return;
  el.textContent = '';
  el.hidden = false;
  const urlTela = urlMetas('', raizSite ? { raizSite } : undefined);
  const cab = criar(doc, 'header', { class: 'card-cab lateral-cab' }, [
    criar(doc, 'div', {}, [criar(doc, 'span', { class: 'card-rotulo', texto: 'Seus objetivos' }), criar(doc, 'h2', { class: 'card-titulo', texto: 'Metas' })]),
  ]);
  el.append(cab);
  if (!modelo || !modelo.linhas.length) {
    el.append(criar(doc, 'p', { class: 'hm-vazio', texto: 'Você ainda não tem metas com alvo. Crie a primeira e acompanhe o ritmo por aqui.' }),
      criar(doc, 'a', { class: 'btn btn-tonal btn-sm', href: urlTela, texto: 'Criar uma meta' }));
    return;
  }
  const resumo = criar(doc, 'p', { class: 'hm-resumo' });
  resumoTexto(modelo).forEach((p, i) => {
    if (i) resumo.append(' · ');
    resumo.append(p.classe ? criar(doc, 'span', { class: `hm-tom-${p.classe}`, texto: p.t }) : p.t);
  });
  el.append(resumo);

  const lista = criar(doc, 'ul', { class: 'hm-lista', id: 'metasHomeLista' });
  if (modelo.linhas.length > METAS_NO_DESKTOP) lista.classList.add('hm-corta-desktop');
  modelo.linhas.forEach((l) => {
    const barra = criar(doc, 'span', { class: `hm-barra hm-${l.classe}`, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': l.percentual == null ? null : String(Math.round(l.percentual * 100)), 'aria-label': `Progresso de ${l.nome}` });
    const preenchimento = criar(doc, 'i');
    preenchimento.style.width = `${l.percentual == null ? 0 : Math.max(l.percentual > 0 ? 2 : 0, l.percentual * 100).toFixed(1)}%`;
    barra.append(preenchimento);
    const ico = criar(doc, 'span', { class: 'hm-ico' });
    ico.style.setProperty('--hm-cor', l.cor === 'bad' ? 'var(--ink-muted)' : `var(--${l.cor})`); // vermelho não é cor de meta
    ico.innerHTML = iconeMetaSvg(l.icone, { tamanho: 16 }); // SVG fixo da biblioteca (nenhum dado externo entra aqui)
    const a = criar(doc, 'a', { class: 'hm-meta', href: l.url }, [
      criar(doc, 'span', { class: 'hm-nome' }, [ico, criar(doc, 'span', { class: 'hm-nome-txt', texto: l.nome })]),
      criar(doc, 'span', { class: `hm-selo hm-${l.classe}`, texto: l.selo }),
      barra,
    ]);
    lista.append(criar(doc, 'li', {}, [a]));
  });
  el.append(lista);
  if (modelo.linhas.length > METAS_NO_CELULAR) {
    const mais = criar(doc, 'button', { type: 'button', class: `hm-mais btn btn-text btn-sm${modelo.linhas.length > METAS_NO_DESKTOP ? ' hm-mais-desktop' : ''}`, 'aria-expanded': 'false', 'aria-controls': 'metasHomeLista', texto: `Ver todas (${modelo.linhas.length})` });
    mais.addEventListener('click', () => {
      const aberto = lista.classList.toggle('hm-expandida');
      mais.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      mais.textContent = aberto ? 'Ver menos' : `Ver todas (${modelo.linhas.length})`;
    });
    el.append(mais);
  }
  const rodape = criar(doc, 'p', { class: 'hm-aporte' });
  if (modelo.aporteNecessario > 0) {
    rodape.append('Aporte necessário ', criar(doc, 'b', { texto: `${formatBRL0(modelo.aporteNecessario)}/mês` }), ` · você aporta ${formatBRL0(modelo.aporteAtual)}`);
  } else {
    rodape.append('Nenhum aporte extra necessário pras suas metas hoje');
  }
  rodape.append(' · ', criar(doc, 'a', { class: 'hm-ver', href: urlTela, texto: 'Ver metas →' }));
  el.append(rodape);
}

/**
 * O cartão vivo (estados carregando / pronto / erro), no mesmo contrato do hero (inicio-hero.js): carregando(), dados(resposta), erro(resposta).
 * O erro só aparece se ainda não há nada desenhado - dado do cache ou de uma busca anterior continua na tela.
 */
export function criarCartaoMetas(doc, el, { aoTentar = null, raizSite = null } = {}) {
  let desenhado = false;
  el.classList.add('metas-home');
  const esqueleto = () => {
    el.textContent = '';
    el.hidden = false;
    el.dataset.estado = 'carregando';
    el.append(criar(doc, 'div', { class: 'hm-esqueleto', 'aria-hidden': 'true' }, [
      criar(doc, 'span', { class: 'skel skel-linha hm-esq-a' }), criar(doc, 'span', { class: 'skel skel-linha hm-esq-b' }),
      criar(doc, 'span', { class: 'skel skel-linha hm-esq-b' }), criar(doc, 'span', { class: 'skel skel-linha hm-esq-b' }),
    ]));
  };
  return {
    carregando() { if (!desenhado) esqueleto(); },
    dados(resposta) {
      const modelo = modeloMetasHome(resposta, raizSite ? { raizSite } : {});
      if (!modelo) return;
      el.dataset.estado = 'pronto';
      renderMetasHome(doc, el, modelo, raizSite ? { raizSite } : {});
      desenhado = true;
    },
    erro(resposta, erroCapturado) {
      if (desenhado) return;
      el.textContent = '';
      el.hidden = false;
      el.dataset.estado = 'erro';
      const alvo = criar(doc, 'div', { class: 'hero-erro' });
      el.append(criar(doc, 'header', { class: 'card-cab lateral-cab' }, [criar(doc, 'div', {}, [criar(doc, 'h2', { class: 'card-titulo', texto: 'Metas' })])]), alvo);
      mostrarErroCarga(alvo, { tela: 'Metas', resposta, erro: erroCapturado, aoTentar, doc });
    },
    get desenhado() { return desenhado; },
  };
}
