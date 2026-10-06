/**
 * ativo-patrimonio.js - 05/10/2026 (Tiago, Ativos > FIIs: "queria incluir
 * umas novas informações importantes dos FIIs. Portfólio: qual o portfólio
 * do fundo; se for shopping, quais, a divisão disso. Quando é CRI, portfólio,
 * mas também se ele é IPCA ou CDI, qual porcentagem e valor... Isso pode ser
 * uma nova aba no FII, antes de 'Sobre'... Localização dos Ativos, com
 * inclusive opção de ver no mapa").
 *
 * A aba "Patrimônio" da tela do ativo (só FIIs):
 *  - tijolo: cards dos imóveis (nome, cidade/UF, área, % da receita,
 *    vacância), donut da divisão por imóvel / segmento / estado e mapa;
 *  - papel: divisão por indexador (IPCA/CDI/pré... em % e R$), principais
 *    CRIs, composição por tipo de ativo;
 *  - híbrido/FoF: os dois blocos + cotas de outros FIIs.
 * Dados: action=fiiPortfolio (aba aux_fii-portfolio, PortfolioFii.gs, vinda
 * da CVM) + curadoria em assets/data/fii-portfolio-manual.json (por cima).
 * Carrega só quando a aba abre (e o mapa - Leaflet via cdnjs + tiles do
 * OpenStreetMap - só quando há imóvel pra mostrar).
 */

import { formatBRL, formatBRLCompacto, formatNumeroBR, formatDateBR } from '../format.js';
import {
  ROTULO_TIPO, montarVisao, baseDisponivel, divisaoImoveis, resumoImoveis, pontosDoMapa,
  consultasNavegador, urlNominatim, lerRespostaNominatim, pctTexto, areaTexto, urlPublica,
} from './ativo-patrimonio-calc.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { criarAnel, criarBarraComposicao } from '../charts/index.js'; // 06/10/2026 (Onda 3): donut e faixa de composição da biblioteca



const LEAFLET_VERSAO = '1.9.4';
const LEAFLET_CSS = { url: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSAO}/leaflet.min.css`, sri: 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==' };
const LEAFLET_JS = { url: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSAO}/leaflet.min.js`, sri: 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==' };
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CHAVE_GEO_LS = 'fiiportfolio_geo_v1';
const MAX_GEO_NAVEGADOR = 40;
const IMOVEIS_VISIVEIS = 12;

const MODOS_DIVISAO = [['imovel', 'Por imóvel'], ['segmento', 'Por segmento'], ['estado', 'Por estado']];
const ICONE_MAPA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Aba vazia (antes de abrir): o controlador preenche. */
export function patrimonioPlaceholderHtml() {
  return '<div class="pf-raiz" id="pfRaiz" aria-live="polite"><div class="pf-carregando"><span class="skel pf-esq-resumo"></span><span class="skel pf-esq-bloco"></span></div></div>';
}

// 06/10/2026 (Onda 3): o donut e a faixa de composição são da biblioteca de gráficos (charts/anel.js, charts/progresso.js). O HTML só reserva
// o espaço (data-pf-graf) e guarda os dados em GRAFICOS_DA_RENDER; montarGraficosPatrimonio() desenha depois do innerHTML.
let GRAFICOS_DA_RENDER = [];
const fatiasDe = (itens) => itens.map((it) => ({ id: it.rotulo, nome: it.rotulo, valor: it.share }));
function donutHtml(itens) {
  GRAFICOS_DA_RENDER.push({ tipo: 'anel', itens });
  return `<div class="pf-donut" data-pf-graf="${GRAFICOS_DA_RENDER.length - 1}" role="img" aria-label="Divisão: ${esc(itens.map((i) => `${i.rotulo} ${pctTexto(i.share)}`).join(', '))}"></div>`;
}
function barraComposicaoHtml(itens) {
  GRAFICOS_DA_RENDER.push({ tipo: 'barra', itens });
  return `<div class="pf-barra" data-pf-graf="${GRAFICOS_DA_RENDER.length - 1}"></div>`;
}

/** Desenha (charts) os gráficos reservados pela última renderização dentro de `raiz`. Devolve a lista pra destruir depois. */
export function montarGraficosPatrimonio(raiz) {
  const feitos = [];
  if (!raiz) return feitos;
  raiz.querySelectorAll('[data-pf-graf]').forEach((slot) => {
    const g = GRAFICOS_DA_RENDER[Number(slot.dataset.pfGraf)];
    if (!g) return;
    try {
      if (g.tipo === 'anel') feitos.push(criarAnel(slot, { fatias: fatiasDe(g.itens), legenda: false, tamanho: 180, espessura: 24, centro: { rotulo: 'Divisão' }, formatarValor: (v) => pctTexto(v), aria: slot.getAttribute('aria-label') || 'Divisão' }));
      else feitos.push(criarBarraComposicao(slot, { fatias: fatiasDe(g.itens), legenda: false, formatarValor: (v) => pctTexto(v) }));
    } catch (_) { /* sem gráfico: a legenda ao lado continua dizendo tudo */ }
  });
  return feitos;
}

function legendaDivisaoHtml(itens, { notaEstimado = false } = {}) {
  return `<ul class="pf-legenda">${itens.map((it, i) => `
      <li><span class="pf-bolinha pf-c${i % 8}" aria-hidden="true"></span><span class="pf-leg-nome" title="${esc(it.rotulo)}">${esc(it.rotulo)}${it.estimado && notaEstimado ? '<sup title="Segmento estimado pelo nome do imóvel">*</sup>' : ''}</span>
        <span class="pf-leg-pct">${pctTexto(it.share)}</span></li>`).join('')}</ul>`;
}

function blocoDivisaoHtml(visao, estado) {
  if (visao.imoveis.length < 2) return ''; // um imóvel só = 100%, sem o que dividir
  const base = baseDisponivel(visao.imoveis);
  if (!base.padrao) return '';
  const baseAtual = estado.base && base[estado.base] ? estado.base : base.padrao;
  const por = estado.por;
  const div = divisaoImoveis(visao.imoveis, { por, base: baseAtual });
  const baseTabs = base.receita && base.area ? `
        <div class="segmented pf-base" role="group" aria-label="Base da divisão">
          <button type="button" data-pf-base="receita" aria-pressed="${baseAtual === 'receita'}">% da receita</button>
          <button type="button" data-pf-base="area" aria-pressed="${baseAtual === 'area'}">Área</button>
        </div>` : '';
  const tem = div.itens.length > 0;
  const nota = [
    baseAtual === 'receita' ? 'Participação de cada imóvel nas receitas do fundo (informe trimestral à CVM).' : 'Participação de cada imóvel na área total informada.',
    div.semPeso ? `${div.semPeso} imóvel(is) sem esse dado ficam fora da divisão.` : '',
    por === 'segmento' && div.itens.some((i) => i.estimado) ? '* Segmento estimado pelo nome - a CVM não informa o tipo do imóvel.' : '',
  ].filter(Boolean).join(' ');
  return `
    <section class="card at-card pf-card" aria-labelledby="pf-divisao-titulo">
      <div class="at-card-titulo"><h2 id="pf-divisao-titulo">Divisão dos imóveis</h2>
        <div class="pf-filtros">
          <div class="segmented" role="group" aria-label="Agrupar por">${MODOS_DIVISAO.map(([id, rot]) => `<button type="button" data-pf-por="${id}" aria-pressed="${por === id}">${rot}</button>`).join('')}</div>
          ${baseTabs}
        </div>
      </div>
      ${tem ? `<div class="pf-divisao">${donutHtml(div.itens)}${legendaDivisaoHtml(div.itens, { notaEstimado: true })}</div>` : '<p class="pf-vazio">Sem dado suficiente pra dividir por este critério.</p>'}
      <p class="pf-nota">${esc(nota)}</p>
    </section>`;
}

function fotoHtml(foto) {
  if (!foto) return '';
  const leg = [foto.legenda ? esc(foto.legenda) : '', foto.credito ? `<span class="pf-credito">${esc(foto.credito)}${foto.licenca ? ` · ${esc(foto.licenca)}` : ''}</span>` : ''].filter(Boolean).join(' ');
  return `<figure class="pf-foto"><img src="${esc(foto.url)}" alt="${esc(foto.legenda || '')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('figure').remove()">${leg ? `<figcaption>${leg}</figcaption>` : ''}</figure>`;
}

function imovelCardHtml(im, maxReceita) {
  const local = [im.cidade, im.uf].filter(Boolean).join('/');
  const metricas = [
    ['Área', areaTexto(im.area)],
    im.pctReceita != null ? ['% da receita', pctTexto(im.pctReceita)] : null,
    im.vacancia != null ? ['Vacância', pctTexto(im.vacancia)] : null,
    im.inadimplencia != null ? ['Inadimplência', pctTexto(im.inadimplencia)] : null,
  ].filter(Boolean);
  const chips = [
    im.segmento ? `<span class="chip-tonal" title="${im.segmentoFonte === 'nome' ? 'Estimado pelo nome do imóvel' : 'Informado na curadoria'}">${esc(im.segmento)}${im.segmentoFonte === 'nome' ? '*' : ''}</span>` : '',
    im.classe && im.classe !== 'Renda' ? `<span class="chip-tonal chip-warn">${esc(im.classe)}</span>` : '',
    im.participacao ? `<span class="chip-tonal">Fração ${esc(im.participacao)}</span>` : '',
  ].filter(Boolean).join('');
  const largura = im.pctReceita > 0 && maxReceita > 0 ? Math.max(3, Math.round((im.pctReceita / maxReceita) * 100)) : 0;
  const temPonto = typeof im.lat === 'number' && typeof im.lon === 'number';
  const link = urlPublica(im.link);
  return `
      <article class="pf-imovel" data-pf-k="${esc(im.k || '')}">
        ${fotoHtml(im.foto)}
        <div class="pf-imovel-topo"><h3>${esc(im.nome)}</h3>${local ? `<span class="pf-local">${esc(local)}</span>` : ''}</div>
        ${chips ? `<div class="pf-chips">${chips}</div>` : ''}
        <dl class="pf-metricas">${metricas.map(([r, v]) => `<div><dt>${r}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${largura ? `<div class="pf-barrinha" aria-hidden="true"><span style="width:${largura}%"></span></div>` : ''}
        <div class="pf-imovel-rodape">
          ${temPonto ? `<button type="button" class="btn btn-tonal btn-sm pf-btn-mapa" data-pf-ver="${esc(im.k || '')}">${ICONE_MAPA}<span>Ver no mapa${im.precisao === 'cidade' ? ' (cidade)' : ''}</span></button>` : '<span class="pf-sem-mapa">Sem posição no mapa</span>'}
          ${link ? `<a class="pf-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Site oficial</a>` : ''}
        </div>
      </article>`;
}

function blocoImoveisHtml(visao, estado) {
  const im = visao.imoveis;
  if (!im.length) return '';
  const r = resumoImoveis(im);
  const mp = pontosDoMapa(im);
  const ordenados = im.slice().sort((a, b) => (b.pctReceita || 0) - (a.pctReceita || 0) || (b.area || 0) - (a.area || 0));
  const maxReceita = ordenados.reduce((m, i) => Math.max(m, i.pctReceita || 0), 0);
  const mostrar = estado.expandido ? ordenados : ordenados.slice(0, IMOVEIS_VISIVEIS);
  const stats = [
    ['Imóveis', formatNumeroBR(r.n, 0)],
    r.area ? ['Área somada', areaTexto(r.area)] : null,
    r.vacancia != null ? ['Vacância (pela área)', pctTexto(r.vacancia)] : null,
    r.estados ? ['Estados', formatNumeroBR(r.estados, 0)] : null,
  ].filter(Boolean);
  const notaMapa = mp.pontos.length
    ? `${mp.pontos.length} de ${im.length} imóveis no mapa${mp.aproximados ? ` · ${mp.aproximados} com posição aproximada (cidade)` : ''}.`
    : '';
  return `
    <section class="card at-card pf-card" id="pf-imoveis" aria-labelledby="pf-imoveis-titulo">
      <div class="at-card-titulo"><h2 id="pf-imoveis-titulo">Imóveis do fundo</h2><span class="hint">informe trimestral à CVM</span></div>
      <div class="pf-stats">${stats.map(([r2, v]) => `<div class="pf-stat"><span class="pf-stat-rot">${r2}</span><span class="pf-stat-val">${v}</span></div>`).join('')}</div>
      <div class="pf-mapa-wrap">
        <div class="pf-mapa" id="pfMapa" role="region" aria-label="Mapa dos imóveis do fundo" ${mp.pontos.length || estado.geocodificando ? '' : 'hidden'}></div>
        <p class="pf-nota pf-mapa-nota" id="pfMapaNota">${esc(estado.geocodificando ? `Localizando imóveis no mapa… ${estado.geocodificando}` : notaMapa)}${mp.pontos.length ? ' <a class="pf-link" id="pfAbrirOsm" target="_blank" rel="noopener noreferrer" href="#">Abrir no OpenStreetMap</a>' : ''}</p>
      </div>
      <div class="pf-lista" id="pfLista">${mostrar.map((i) => imovelCardHtml(i, maxReceita)).join('')}</div>
      ${ordenados.length > IMOVEIS_VISIVEIS ? `<button type="button" class="btn btn-tonal pf-mais" id="pfMais" aria-expanded="${estado.expandido}">${estado.expandido ? 'Mostrar só os maiores' : `Ver todos os ${ordenados.length} imóveis`}</button>` : ''}
      ${visao.imoveisOmitidos ? `<p class="pf-nota">Mais ${visao.imoveisOmitidos} imóvel(is) menores não cabem na lista guardada.</p>` : ''}
    </section>`;
}

function papelHtml(visao) {
  const p = visao.papel;
  if (!p || !p.porIndexador || !p.porIndexador.length) return '';
  const idx = p.porIndexador.map((i) => ({ rotulo: i.indexador, share: i.pct, valor: i.valor, n: i.n }));
  const semId = idx.find((i) => i.rotulo === 'Não identificado');
  const cobertura = p.manual ? 'Divisão informada na curadoria.' : (semId ? `${pctTexto(1 - semId.share, 0)} do valor ligado ao informe da securitizadora; ${pctTexto(semId.share, 0)} sem como identificar (emissão/série não informadas).` : 'Todo o valor ligado ao informe da securitizadora.');
  const linhas = (p.titulos || []).map((t) => {
    const nome = t.securitizadora || '—';
    const emi = t.emissao ? `${t.emissao}ª emissão${t.serie ? ` · série ${t.serie}` : ''}` : '';
    return `<tr><td data-rot="CRI"><span class="pf-cri-nome">${esc(nome)}</span><span class="pf-cri-sub">${esc([t.codigo, emi].filter(Boolean).join(' · '))}</span></td>
        <td data-rot="Taxa">${t.taxa ? `<span class="chip-tonal pf-taxa">${esc(t.indexador || '')}</span> <span class="pf-taxa-txt">${esc(t.taxa)}</span>` : '<span class="pf-sem-mapa">não identificada</span>'}</td>
        <td class="col-opc" data-rot="Vencimento">${t.vencimento ? esc(formatDateBR(t.vencimento)) : '—'}</td>
        <td class="num" data-rot="Valor">${formatBRL(t.valor)}</td><td class="num col-opc" data-rot="% do papel">${pctTexto(t.pct)}</td></tr>`;
  }).join('');
  return `
    <section class="card at-card pf-card" id="pf-papel" aria-labelledby="pf-papel-titulo">
      <div class="at-card-titulo"><h2 id="pf-papel-titulo">Carteira de papel (CRI/CRA)</h2><span class="hint">${p.n ? `${formatNumeroBR(p.n, 0)} papéis · ` : ''}${p.total ? formatBRLCompacto(p.total) : ''}</span></div>
      <h3 class="pf-sub">Divisão por indexador</h3>
      <div class="pf-divisao">${donutHtml(idx)}
        <ul class="pf-legenda">${idx.map((i, k) => `<li><span class="pf-bolinha pf-c${k % 8}" aria-hidden="true"></span><span class="pf-leg-nome">${esc(i.rotulo)}${i.n ? ` <span class="pf-leg-n">${i.n} ${i.n === 1 ? 'papel' : 'papéis'}</span>` : ''}</span><span class="pf-leg-pct">${pctTexto(i.share)}</span><span class="pf-leg-val">${i.valor != null ? formatBRLCompacto(i.valor) : ''}</span></li>`).join('')}</ul>
      </div>
      <p class="pf-nota">${esc(cobertura)}</p>
      ${linhas ? `<h3 class="pf-sub">Principais papéis</h3>
      <div class="card card-flat pf-tabela-card"><div class="tabela-wrap"><table class="tabela pf-tabela"><thead><tr><th scope="col">CRI/CRA</th><th scope="col">Taxa</th><th scope="col" class="col-opc">Vencimento</th><th scope="col" class="num">Valor</th><th scope="col" class="num col-opc">% do papel</th></tr></thead><tbody>${linhas}</tbody></table></div></div>
      ${p.titulosOmitidos ? `<p class="pf-nota">Mais ${p.titulosOmitidos} papéis menores não aparecem na lista.</p>` : ''}` : ''}
    </section>`;
}

function cotasHtml(visao) {
  const c = visao.cotas;
  if (!c || !c.itens || !c.itens.length) return '';
  return `
    <section class="card at-card pf-card" id="pf-cotas" aria-labelledby="pf-cotas-titulo">
      <div class="at-card-titulo"><h2 id="pf-cotas-titulo">Cotas de outros FIIs</h2><span class="hint">${formatBRLCompacto(c.total)} em ${c.n} fundo(s)</span></div>
      <ul class="pf-cotas">${c.itens.map((i) => `<li><span class="pf-cota-ticker">${esc(i.ticker || '—')}</span><span class="pf-cota-nome">${esc(i.nome)}</span><span class="pf-cota-val">${formatBRLCompacto(i.valor)}</span><span class="pf-leg-pct">${pctTexto(i.pct)}</span></li>`).join('')}</ul>
      ${c.omitidos ? `<p class="pf-nota">Mais ${c.omitidos} fundo(s) menores não aparecem.</p>` : ''}
    </section>`;
}

function composicaoHtml(visao) {
  const comp = visao.composicao;
  let itens = null, titulo = '', ref = '';
  if (comp && comp.itens && comp.itens.length) {
    itens = comp.itens.filter((i) => i.pct >= 0.0005).map((i) => ({ rotulo: i.rotulo, share: i.pct, valor: i.valor }));
    ref = comp.mes ? `informe mensal de ${esc(String(comp.mes).split('-').reverse().join('/'))}` : '';
    titulo = 'Onde o fundo está investido';
  } else if (visao.porTipoAtivo && visao.porTipoAtivo.length) {
    itens = visao.porTipoAtivo.map((i) => ({ rotulo: i.tipo, share: i.pct, valor: i.valor }));
    ref = 'carteira do informe trimestral';
    titulo = 'Por tipo de ativo';
  }
  if (!itens || !itens.length) return '';
  return `
    <section class="card at-card pf-card" aria-labelledby="pf-comp-titulo">
      <div class="at-card-titulo"><h2 id="pf-comp-titulo">${titulo}</h2><span class="hint">${ref}</span></div>
      ${barraComposicaoHtml(itens)}
      <ul class="pf-legenda pf-legenda-larga">${itens.map((i, k) => `<li><span class="pf-bolinha pf-c${k % 8}" aria-hidden="true"></span><span class="pf-leg-nome">${esc(i.rotulo)}</span><span class="pf-leg-pct">${pctTexto(i.share)}</span><span class="pf-leg-val">${formatBRLCompacto(i.valor)}</span></li>`).join('')}</ul>
    </section>`;
}

function cabecalhoHtml(visao) {
  const tipo = ROTULO_TIPO[visao.tipo] || ROTULO_TIPO.indefinido;
  const aviso = visao.aviso ? `
      <div class="pf-aviso" role="status">
        <strong>Fato relevante novo - conferir.</strong>
        <span>Em ${esc(formatDateBR(visao.aviso.data))}${visao.aviso.assunto ? ` (${esc(visao.aviso.assunto)})` : ''}, depois do último informe trimestral usado aqui. O portfólio pode ter mudado.</span>
        ${visao.aviso.link ? `<a class="pf-link" href="${esc(visao.aviso.link)}" target="_blank" rel="noopener noreferrer">Abrir documento</a>` : ''}
      </div>` : '';
  const ref = visao.ref && visao.ref.trimestre ? `Informe de ${formatDateBR(visao.ref.trimestre)}` : '';
  return `
    <section class="card at-card pf-card pf-resumo" aria-labelledby="pf-resumo-titulo">
      <div class="at-card-titulo"><h2 id="pf-resumo-titulo">Patrimônio do fundo</h2>
        <div class="pf-chips"><span class="chip-tonal chip-primary">${esc(tipo)}</span>${visao.segmentoCvm ? `<span class="chip-tonal">${esc(visao.segmentoCvm)}</span>` : ''}${ref ? `<span class="chip-tonal">${esc(ref)}</span>` : ''}</div>
      </div>
      ${fotoHtml(visao.fotoFundo)}
      ${visao.nome ? `<p class="pf-nome-fundo">${esc(visao.nome)}</p>` : ''}
      ${visao.observacao ? `<p class="pf-nota">${esc(visao.observacao)}</p>` : ''}
      ${aviso}
    </section>`;
}

function rodapeHtml(visao) {
  const quando = visao.atualizadoEm ? formatDateBR(String(visao.atualizadoEm).slice(0, 10)) : '';
  const links = [
    visao.linkFnet ? `<a class="pf-link" href="${esc(visao.linkFnet)}" target="_blank" rel="noopener noreferrer">Ver no FNet</a>` : '',
    ...visao.links.map((l) => `<a class="pf-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.rotulo)}</a>`),
  ].filter(Boolean).join('');
  return `
    <footer class="pf-rodape">
      <p><strong>Fonte:</strong> ${esc(visao.fonte || 'CVM (dados abertos)')}${quando ? ` · <strong>atualizado em</strong> ${esc(quando)}` : ''}${visao.reprocessando ? ' · <em>reprocessando na próxima atualização</em>' : ''}</p>
      <p class="pf-nota">Dados declarados pelo administrador à CVM; a lista só muda quando sai informe novo (ou um fato relevante). Complementos e fotos vêm de fontes públicas em <code>assets/data/fii-portfolio-manual.json</code>.</p>
      ${links ? `<div class="pf-links">${links}</div>` : ''}
    </footer>`;
}

/** Conteúdo completo da aba, conforme a fase. */
export function patrimonioHtml(estado) {
  GRAFICOS_DA_RENDER = [];
  if (estado.fase === 'carregando' || estado.fase === 'inicial') return patrimonioPlaceholderHtml();
  if (estado.fase === 'erro') {
    return `<div class="pf-raiz" id="pfRaiz"><div class="estado estado-erro" role="alert"><span class="estado-ico"><svg class="ico" aria-hidden="true"><use href="#ico-error"/></svg></span><h3 class="estado-titulo">Não consegui carregar o patrimônio do fundo</h3><p class="estado-texto">Não deu pra carregar o patrimônio deste fundo agora${estado.erro ? ` (${esc(estado.erro)})` : ''}. Tente de novo em instantes.</p><div class="estado-acoes"><button type="button" class="btn btn-tonal" id="pfTentar"><svg class="ico" aria-hidden="true"><use href="#ico-refresh"/></svg>Tentar de novo</button></div></div></div>`;
  }
  if (estado.fase === 'vazio') {
    return `<div class="pf-raiz" id="pfRaiz"><div class="estado"><span class="estado-ico"><svg class="ico" aria-hidden="true"><use href="#ico-inbox"/></svg></span><h3 class="estado-titulo">Portfólio ainda não montado</h3><p class="estado-texto">${esc(estado.mensagem || 'Este fundo ainda não tem o portfólio guardado.')}</p><p class="estado-texto">Ele é montado a partir do informe trimestral da CVM, pela agenda diária do Apps Script, para os FIIs que estão na carteira.</p></div></div>`;
  }
  const v = estado.visao;
  const blocos = [];
  const imoveis = blocoImoveisHtml(v, estado);
  const papel = papelHtml(v);
  const cotas = cotasHtml(v);
  const comp = composicaoHtml(v);
  const div = blocoDivisaoHtml(v, estado);
  // tijolo: imóveis em primeiro; papel: carteira de papel em primeiro; híbrido: o que pesa mais
  const ordemTijolo = [comp, div, imoveis, papel, cotas];
  const ordemPapel = [comp, papel, cotas, div, imoveis];
  blocos.push(...(v.tipo === 'papel' || v.tipo === 'fof' ? ordemPapel : ordemTijolo));
  const sem = !imoveis && !papel && !cotas && !comp;
  return `<div class="pf-raiz" id="pfRaiz">${cabecalhoHtml(v)}${sem ? '<div class="estado"><p class="estado-texto">A CVM não trouxe imóveis nem papéis deste fundo no último informe.</p></div>' : blocos.join('')}${rodapeHtml(v)}</div>`;
}

// ---------------------------------------------------------------------------
// Mapa (Leaflet via cdnjs, carregado só quando preciso)
// ---------------------------------------------------------------------------

let leafletEmCurso = null;
export function carregarLeaflet(doc) {
  const win = doc.defaultView;
  if (win && win.L && win.L.map) return Promise.resolve(win.L);
  if (leafletEmCurso) return leafletEmCurso;
  leafletEmCurso = new Promise((resolve, reject) => {
    const css = doc.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET_CSS.url; css.integrity = LEAFLET_CSS.sri; css.crossOrigin = '';
    doc.head.appendChild(css);
    const js = doc.createElement('script');
    js.src = LEAFLET_JS.url; js.integrity = LEAFLET_JS.sri; js.crossOrigin = ''; js.async = true;
    js.onload = () => (win.L && win.L.map ? resolve(win.L) : reject(new Error('Leaflet não iniciou')));
    js.onerror = () => { leafletEmCurso = null; reject(new Error('Leaflet não carregou')); };
    doc.head.appendChild(js);
  });
  return leafletEmCurso;
}

function popupHtml(im) {
  const local = [im.cidade, im.uf].filter(Boolean).join('/');
  const linhas = [
    local ? esc(local) : '',
    im.area ? `Área ${esc(areaTexto(im.area))}` : '',
    im.pctReceita != null ? `${esc(pctTexto(im.pctReceita))} da receita` : '',
    im.vacancia != null ? `Vacância ${esc(pctTexto(im.vacancia))}` : '',
    im.precisao === 'cidade' ? '<em>posição aproximada (cidade)</em>' : '',
  ].filter(Boolean);
  return `<strong>${esc(im.nome)}</strong><br>${linhas.join('<br>')}`;
}

// ---------------------------------------------------------------------------
// Controlador
// ---------------------------------------------------------------------------

/**
 * Uma instância por tela do ativo. deps (todas opcionais - os testes trocam):
 *  getFiiPortfolioImpl(token, ticker), salvarCoordsImpl(token, ticker, coords), carregarManualImpl(),
 *  lerCache(chave) / gravarCache(chave, dados), carregarLeafletImpl(doc), fetchImpl, storage, esperar(ms).
 */
export function criarControladorPatrimonio({
  doc, token, ticker,
  getFiiPortfolioImpl, salvarCoordsImpl = null, carregarManualImpl = async () => null,
  lerCache = async () => null, gravarCache = () => {}, carregarLeafletImpl = carregarLeaflet,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
  storage = (() => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } })(),
  esperar = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const chaveCache = `fiiPortfolio_v1:${ticker}`;
  const estado = { fase: 'inicial', visao: null, resposta: null, manual: null, por: 'imovel', base: null, expandido: false, geocodificando: '', erro: '', mensagem: '' };
  let painel = null, graficos = [], mapa = null, camada = null, marcadores = new Map(), carregando = false, geoRodou = false, mapaPedido = 0;

  const geoCache = () => { try { return JSON.parse((storage && storage.getItem(CHAVE_GEO_LS)) || '{}') || {}; } catch (_) { return {}; } };
  const geoGuardar = (m) => { try { if (storage) storage.setItem(CHAVE_GEO_LS, JSON.stringify(m)); } catch (_) { /* sem storage */ } };

  const recalcular = () => {
    if (!estado.resposta) return;
    const manualFii = estado.manual && estado.manual.fiis ? estado.manual.fiis[ticker] || null : null;
    const anterior = estado.visao;
    estado.visao = montarVisao(estado.resposta, manualFii);
    // coordenadas achadas no navegador ficam por cima do que ainda faltava
    if (anterior) {
      const achadas = new Map(anterior.imoveis.filter((i) => typeof i.lat === 'number').map((i) => [i.k, i]));
      estado.visao.imoveis.forEach((i) => { const a = achadas.get(i.k); if (a && typeof i.lat !== 'number') { i.lat = a.lat; i.lon = a.lon; i.precisao = a.precisao; if (!i.uf && a.uf) i.uf = a.uf; if (!i.cidade && a.cidade) i.cidade = a.cidade; } });
    }
  };

  function ligar() {
    if (!painel) return;
    painel.querySelectorAll('[data-pf-por]').forEach((b) => b.addEventListener('click', () => { estado.por = b.dataset.pfPor; redesenhar(); }));
    painel.querySelectorAll('[data-pf-base]').forEach((b) => b.addEventListener('click', () => { estado.base = b.dataset.pfBase; redesenhar(); }));
    const mais = painel.querySelector('#pfMais');
    if (mais) mais.addEventListener('click', () => { estado.expandido = !estado.expandido; redesenhar(); });
    const tentar = painel.querySelector('#pfTentar');
    if (tentar) tentar.addEventListener('click', () => { estado.fase = 'inicial'; carregar(); });
    painel.querySelectorAll('[data-pf-ver]').forEach((b) => b.addEventListener('click', () => verNoMapa(b.dataset.pfVer)));
  }

  function montarGraficos() {
    graficos.forEach((g) => { try { g.destruir(); } catch (_) { /* já saiu */ } });
    graficos = montarGraficosPatrimonio(painel);
  }

  function redesenhar() {
    if (!painel) return;
    // o mapa vive dentro do HTML da aba: ao redesenhar, é recriado (se a aba está visível)
    if (mapa) { try { mapa.remove(); } catch (_) { /* já foi */ } mapa = null; camada = null; marcadores = new Map(); }
    painel.innerHTML = patrimonioHtml(estado);
    montarGraficos();
    ligar();
    if (aberta()) iniciarMapa();
  }

  const aberta = () => !!(painel && painel.closest('.at-aba') && !painel.closest('.at-aba').hidden);

  async function iniciarMapa() {
    if (estado.fase !== 'ok' || !estado.visao) return;
    const alvo = painel && painel.querySelector('#pfMapa');
    if (!alvo) return;
    const { pontos } = pontosDoMapa(estado.visao.imoveis);
    if (!pontos.length && !estado.geocodificando) { alvo.hidden = true; return; }
    alvo.hidden = false;
    const meu = ++mapaPedido;
    let L;
    try { L = await carregarLeafletImpl(doc); } catch (e) {
      alvo.innerHTML = '<div class="pf-mapa-erro">Mapa indisponível agora (não deu pra carregar o Leaflet/OpenStreetMap). A lista abaixo continua valendo.</div>';
      return;
    }
    if (meu !== mapaPedido || !painel || !painel.contains(alvo)) return;
    mapa = L.map(alvo, { scrollWheelZoom: false, worldCopyJump: false }).setView([-15.8, -47.9], 4);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATRIBUICAO }).addTo(mapa);
    camada = L.layerGroup().addTo(mapa);
    desenharPontos(L);
    mapa.on('click', () => mapa.scrollWheelZoom.enable());
    setTimeout(() => { try { mapa.invalidateSize(); } catch (_) { /* removido */ } }, 60);
    geocodificarFaltantes(L);
  }

  function desenharPontos(L) {
    if (!mapa || !camada) return;
    camada.clearLayers();
    marcadores = new Map();
    const { pontos } = pontosDoMapa(estado.visao.imoveis);
    const maxR = pontos.reduce((m, i) => Math.max(m, i.pctReceita || 0), 0);
    pontos.forEach((im) => {
      const raio = maxR > 0 && im.pctReceita > 0 ? 6 + Math.round((im.pctReceita / maxR) * 8) : 7;
      const m = L.circleMarker([im.lat, im.lon], { radius: raio, weight: 2, color: 'var(--good-ink)', fillColor: im.precisao === 'cidade' ? 'var(--ink-faint)' : 'var(--good)', fillOpacity: 0.75 }).bindPopup(popupHtml(im));
      m.addTo(camada);
      marcadores.set(im.k, m);
    });
    if (pontos.length) {
      const b = L.latLngBounds(pontos.map((i) => [i.lat, i.lon]));
      mapa.fitBounds(b, { padding: [28, 28], maxZoom: 13 });
    }
    const osm = painel && painel.querySelector('#pfAbrirOsm');
    if (osm && pontos.length) {
      const c = pontos.length === 1 ? pontos[0] : null;
      osm.href = c ? `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=15/${c.lat}/${c.lon}` : `https://www.openstreetmap.org/#map=5/-15.8/-47.9`;
    }
  }

  function verNoMapa(k) {
    const m = marcadores.get(k);
    const alvo = painel && painel.querySelector('#pfMapa');
    if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (m && mapa) { mapa.setView(m.getLatLng(), Math.max(mapa.getZoom(), 13)); m.openPopup(); }
  }

  /** Imóveis sem ponto: o navegador consulta o Nominatim (1 req/s, cache permanente no aparelho) e manda o resultado pro servidor guardar. */
  async function geocodificarFaltantes(L) {
    if (geoRodou || !fetchImpl) return;
    const faltam = estado.visao.imoveis.filter((i) => typeof i.lat !== 'number' && !i.extra && (i.endereco || i.nome));
    if (!faltam.length) return;
    geoRodou = true;
    const cache = geoCache();
    const novos = [];
    let feitos = 0, consultas = 0;
    const nota = () => painel && painel.querySelector('#pfMapaNota');
    for (const im of faltam.slice(0, MAX_GEO_NAVEGADOR)) {
      if (!painel || !painel.isConnected) return;
      let achou = cache[im.k] && cache[im.k].lat != null ? cache[im.k] : null;
      if (!achou && !(cache[im.k] && cache[im.k].falhou)) {
        for (const c of consultasNavegador(im)) {
          if (consultas > 0) await esperar(1100); // política do Nominatim: no máximo 1 req/s
          consultas += 1;
          let r = null;
          try {
            const resp = await fetchImpl(urlNominatim(c.q), { headers: { Accept: 'application/json' } });
            r = resp.ok ? lerRespostaNominatim(await resp.json(), im.uf) : null;
          } catch (_) { r = null; }
          if (r) { achou = { lat: r.lat, lon: r.lon, p: c.p, u: r.u, c: r.c }; break; }
        }
        cache[im.k] = achou || { falhou: true };
        geoGuardar(cache);
        if (achou) novos.push({ k: im.k, lat: achou.lat, lon: achou.lon, p: achou.p, u: achou.u || '', c: achou.c || '' });
      }
      if (achou) {
        im.lat = achou.lat; im.lon = achou.lon; im.precisao = achou.p || 'endereço';
        if (!im.uf && achou.u) im.uf = achou.u;
        if (!im.cidade && achou.c) im.cidade = achou.c;
        if (mapa && L) desenharPontos(L);
      }
      feitos += 1;
      estado.geocodificando = `${feitos} de ${Math.min(faltam.length, MAX_GEO_NAVEGADOR)}`;
      const n = nota(); if (n) n.firstChild.textContent = `Localizando imóveis no mapa… ${estado.geocodificando} `;
    }
    estado.geocodificando = '';
    if (novos.length && salvarCoordsImpl) Promise.resolve(salvarCoordsImpl(token, ticker, novos)).catch(() => null);
    if (painel && painel.isConnected) redesenhar();
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;
    estado.fase = 'carregando';
    redesenhar();
    const manualP = Promise.resolve(carregarManualImpl()).catch(() => null);
    try {
      const emCache = await lerCache(chaveCache);
      if (emCache && emCache.dados && emCache.dados.ok && emCache.dados.existe) {
        estado.manual = await manualP;
        estado.resposta = emCache.dados;
        recalcular();
        estado.fase = 'ok';
        redesenhar();
      }
    } catch (_) { /* sem cache */ }
    let r = null;
    try { r = await getFiiPortfolioImpl(token, ticker); } catch (e) { r = { ok: false, erro: String(e) }; }
    estado.manual = await manualP;
    carregando = false;
    if (r && r.ok && r.existe) {
      estado.resposta = r;
      gravarCache(chaveCache, r);
      recalcular();
      estado.fase = 'ok';
    } else if (r && r.ok) {
      if (estado.fase !== 'ok') { estado.fase = 'vazio'; estado.mensagem = r.mensagem || ''; }
    } else if (estado.fase !== 'ok') {
      estado.fase = 'erro';
      estado.erro = (r && (r.erro || r.etapa)) || '';
    }
    redesenhar();
  }

  return {
    estado,
    /** Chamado a cada desenho da página (o HTML da aba é refeito junto). */
    desenhar(raiz) {
      painel = raiz;
      if (estado.fase === 'inicial' || estado.fase === 'carregando') painel.innerHTML = patrimonioPlaceholderHtml();
      else { painel.innerHTML = patrimonioHtml(estado); montarGraficos(); ligar(); }
    },
    /** A aba virou visível. */
    mostrar() {
      if (estado.fase === 'inicial') return carregar();
      if (estado.fase === 'ok') { if (mapa) { try { mapa.invalidateSize(); } catch (_) { /* nada */ } } else iniciarMapa(); }
      return Promise.resolve();
    },
    aoSair() { /* o mapa fica montado; só some da vista */ },
  };
}
