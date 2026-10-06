/**
 * metas-viagem.js - 04/10/2026: pedaços de tela da meta de VIAGEM (e das
 * "entradas programadas", que valem pra qualquer meta), usados por metas.js.
 *
 * Tiago (Metas › Viagem): "Inclua link com o Wanderlog"; "meu 13º (90%) e meu
 * FGTS Aniversário (90%) vou colocar pra guardar [...] o aporte mensal
 * necessário tem que levar isso em consideração"; "incluir a taxa diária de
 * turismo"; "compras no cartão já feitas (passagens, hotéis) não devem entrar
 * na conta de aportes [...] Quero saber quanto tenho que pagar por mês, e
 * quanto tenho que aportar e guardar pro futuro"; "dropdown de Países e
 * Cidades, bandeiras dos países".
 *
 * Aqui só HTML (strings) a partir dos números de metas-calc.js - nada de
 * estado: o estado e os eventos ficam em metas.js. Os textos "i" vêm de
 * EXPLICACOES (metas-calc.js).
 */

import { EXPLICACOES } from './metas-calc-plano.js';
import { TIPOS_ENTRADA, paisPorCodigo, cidadesDoPais, normalizarNome, caminhoBandeira, sugestaoTaxaTuristica, taxaTuristicaDestino, expandirEntradas, ehLinkWanderlog } from './metas-calc-viagem.js';
import { MOEDAS_COMUNS, rotuloMes } from './metas-calc-nucleo.js';
import { formatMoeda, infoHtml, pct } from '../metas-card.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68)
import { resolveSiteRootUrl } from '../shell.js';
import { formatNumeroPt } from '../format.js'; // 05/10/2026 (A-68)

const r0 = (v) => formatMoeda(v, 'BRL', { casas: 0 });
const CATEGORIAS_DIARIA = [['alimentacao', 'Alimentação'], ['transporte', 'Transporte'], ['passeios', 'Passeios'], ['compras', 'Compras']];

function numParaCampo(v, casas = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return formatNumeroPt(v, { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

// ---------------------------------------------------------------------------
// Bandeiras, países e cidades (dropdown pesquisável)
// ---------------------------------------------------------------------------

/** <img> da bandeira local (assets/imgs/flags/<iso>.svg); sem código = quadradinho vazio. */
export function bandeiraHtml(codigo, { tamanho = 20, raizSite } = {}) {
  const cam = caminhoBandeira(codigo);
  if (!cam) return `<span class="mt-bandeira vazio" style="width:${tamanho}px;height:${Math.round(tamanho * 0.75)}px" aria-hidden="true"></span>`;
  const src = new URL(cam, raizSite || resolveSiteRootUrl()).href;
  return `<img class="mt-bandeira" src="${esc(src)}" alt="" width="${tamanho}" height="${Math.round(tamanho * 0.75)}" loading="lazy" decoding="async">`;
}

/** Bandeiras dos países da viagem (sem repetir), pro card e pro herói. */
export function bandeirasViagemHtml(meta, { tamanho = 16, max = 6, raizSite } = {}) {
  const cods = [];
  ((meta && meta.especificos && meta.especificos.destinos) || []).forEach((d) => { if (d.paisCodigo && !cods.includes(d.paisCodigo)) cods.push(d.paisCodigo); });
  if (!cods.length) return '';
  const mostra = cods.slice(0, max).map((c) => bandeiraHtml(c, { tamanho, raizSite })).join('');
  return `<span class="mt-bandeiras" aria-label="Países: ${esc(cods.join(', '))}">${mostra}${cods.length > max ? `<small>+${cods.length - max}</small>` : ''}</span>`;
}

/**
 * Países que casam com o que foi digitado (nome, sinônimo ou código ISO, sem
 * acento). Sem busca: o Brasil no topo e depois a ordem alfabética da lista.
 */
export function filtrarPaises(paises, busca, { limite = 80 } = {}) {
  const lista = Array.isArray(paises) ? paises : [];
  const k = normalizarNome(busca);
  const brasilPrimeiro = (a, b) => (a.codigo === 'BR' ? -1 : b.codigo === 'BR' ? 1 : 0);
  if (!k) return [...lista].sort((a, b) => brasilPrimeiro(a, b) || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, limite);
  const pontos = (p) => {
    const nomes = [p.nome, ...(p.aliases || [])].map(normalizarNome);
    if (nomes.some((n) => n === k) || normalizarNome(p.codigo) === k) return 0;
    if (nomes.some((n) => n.startsWith(k))) return 1;
    if (nomes.some((n) => n.split(' ').some((w) => w.startsWith(k)))) return 2;
    if (nomes.some((n) => n.includes(k))) return 3;
    return 9;
  };
  return lista.map((p) => ({ p, pts: pontos(p) })).filter((x) => x.pts < 9)
    .sort((a, b) => a.pts - b.pts || brasilPrimeiro(a.p, b.p) || a.p.nome.localeCompare(b.p.nome, 'pt-BR'))
    .map((x) => x.p).slice(0, limite);
}

/** Cidades turísticas do país (cidades.json) que casam com o digitado. Sem país = nenhuma (a tela pede o país antes). */
export function filtrarCidades(cidades, codigo, busca, { limite = 60 } = {}) {
  const lista = cidadesDoPais(cidades, codigo);
  const k = normalizarNome(busca);
  if (!k) return lista.slice(0, limite);
  const pontos = (c) => {
    const nomes = [c.nome, ...c.aliases].map(normalizarNome);
    if (nomes.some((n) => n === k)) return 0;
    if (nomes.some((n) => n.startsWith(k))) return 1;
    if (nomes.some((n) => n.includes(k))) return 2;
    return 9;
  };
  return lista.map((c) => ({ c, pts: pontos(c) })).filter((x) => x.pts < 9).sort((a, b) => a.pts - b.pts).map((x) => x.c).slice(0, limite);
}

/** Itens da lista do dropdown de países (<li role="option">). */
export function opcoesPaisesHtml(paises, busca, { selecionado = null, raizSite } = {}) {
  const achados = filtrarPaises(paises, busca);
  if (!achados.length) return '<li class="mt-combo-vazio" role="presentation">Nenhum país com esse nome - confira a grafia.</li>';
  return achados.map((p, i) => `<li class="mt-combo-op ${p.codigo === selecionado ? 'sel' : ''}" role="option" id="mtOpPais-${p.codigo}" data-pais-opcao="${p.codigo}" aria-selected="${p.codigo === selecionado ? 'true' : 'false'}" data-pos="${i}">${bandeiraHtml(p.codigo, { tamanho: 20, raizSite })}<span class="mt-combo-nome">${esc(p.nome)}</span><em>${esc(p.moeda || '')}</em></li>`).join('');
}

/** Itens da lista do dropdown de cidades; cidade fora da lista continua aceita (digitar e seguir). */
export function opcoesCidadesHtml(cidades, codigo, busca, { atual = '' } = {}) {
  if (!codigo) return '<li class="mt-combo-vazio" role="presentation">Escolha o país pra ver as cidades - ou digite a cidade.</li>';
  const achadas = filtrarCidades(cidades, codigo, busca);
  const k = normalizarNome(busca);
  const exata = achadas.some((c) => [c.nome, ...c.aliases].some((n) => normalizarNome(n) === k));
  const itens = achadas.map((c, i) => `<li class="mt-combo-op ${normalizarNome(atual) === normalizarNome(c.nome) ? 'sel' : ''}" role="option" data-cidade-opcao="${esc(c.nome)}" aria-selected="false" data-pos="${i}"><span class="mt-combo-nome">${esc(c.nome)}</span>${c.aliases.length ? `<em>${esc(c.aliases[0])}</em>` : ''}</li>`);
  if (String(busca || '').trim() && !exata) itens.push(`<li class="mt-combo-op livre" role="option" data-cidade-opcao="${esc(String(busca).trim())}" aria-selected="false" data-pos="${itens.length}"><span class="mt-combo-nome">Usar "${esc(String(busca).trim())}"</span><em>fora da lista</em></li>`);
  return itens.join('') || '<li class="mt-combo-vazio" role="presentation">Digite o nome da cidade.</li>';
}

/** Moedas das listas: as comuns primeiro, depois as dos países; a que já está na meta sempre aparece. */
export function moedasDisponiveis(paises, atual) {
  const extras = [...new Set((paises || []).map((p) => p.moeda).filter(Boolean))].filter((m) => !MOEDAS_COMUNS.includes(m)).sort();
  const todas = [...MOEDAS_COMUNS, ...extras];
  if (atual && !todas.includes(atual)) todas.push(atual);
  return todas;
}
const opcoesMoeda = (lista, atual) => lista.map((x) => `<option ${x === atual ? 'selected' : ''}>${x}</option>`).join('');

// ---------------------------------------------------------------------------
// Editor de destinos (país/cidade com bandeira, gasto diário, taxa turística)
// ---------------------------------------------------------------------------

/** "€ 75/dia · total € 300 + taxa turística € 22" (linha embaixo de cada destino). */
export function totalDestinoTexto(d, { pessoasPadrao = 1 } = {}) {
  const moeda = d.moeda || 'EUR';
  const diaria = CATEGORIAS_DIARIA.reduce((s, [k]) => s + (Number(d.gastos && d.gastos[k]) || 0), 0) + (Number(d.gastos && d.gastos.outros) || 0);
  const taxa = taxaTuristicaDestino(d, { pessoasPadrao });
  return `${formatMoeda(diaria, moeda, { casas: 0 })}/dia · total ${formatMoeda(diaria * (Number(d.dias) || 0) + (Number(d.extras) || 0), moeda, { casas: 0 })}${taxa.total > 0 ? ` + taxa turística ${formatMoeda(taxa.total, moeda, { casas: 0 })}` : ''}`;
}

/** Nota embaixo da taxa turística de um destino: a sugestão com fonte e ano, ou "informe manualmente". */
export function notaTaxaHtml(d, i, taxas) {
  if (!String(d.cidade || '').trim()) return '<p class="mt-nota">Escolha a cidade: se tiver valor confirmado numa fonte oficial, ele aparece aqui. Nem toda cidade cobra.</p>';
  const s = sugestaoTaxaTuristica(d, taxas);
  if (!s) return `<p class="mt-nota">Sem valor confirmado pra ${esc(d.cidade)}: se a cidade cobrar taxa turística, informe por pessoa e por noite (pergunte ao hotel). Nem toda cidade cobra.</p>`;
  const fonte = `<a href="${esc(s.fonte.url)}" target="_blank" rel="noopener noreferrer">${esc(s.fonte.nome)}</a>`;
  if (s.tipo === 'nao-cobra') return `<p class="mt-nota">${esc(s.cidade)} não cobra taxa turística${s.nota ? ` (${esc(s.nota)})` : ''} · fonte: ${fonte} (${s.ano}).</p>`;
  if (s.tipo === 'percentual') return `<p class="mt-nota">${esc(s.cidade)} cobra um percentual da diária${s.nota ? ` (${esc(s.nota)})` : ''} - informe manualmente o valor por pessoa/noite · fonte: ${fonte} (${s.ano}).</p>`;
  const igual = Math.abs((Number(d.taxaTuristica) || 0) - s.valor) < 0.005;
  const moedaOutra = d.moeda && s.moeda && d.moeda !== s.moeda; // sugestão em outra moeda que a do destino: não aplica sozinha
  return `<p class="mt-nota">Sugestão: <b>${formatMoeda(s.valor, s.moeda)}</b> por pessoa/noite${s.faixa ? ` (${esc(s.faixa)})` : ''}${s.maxNoites && !/máximo/i.test(`${s.nota || ''} ${s.faixa || ''}`) ? ` · cobra no máximo ${s.maxNoites} noites` : ''}${s.nota ? ` · ${esc(s.nota)}` : ''} · fonte: ${fonte} (${s.ano}; confira antes de viajar).${moedaOutra ? ` <span class="mt-ruim">A taxa é em ${s.moeda} e este destino está em ${esc(d.moeda)} - converta ou troque a moeda.</span>` : (igual ? '' : ` <button type="button" class="mt-link" data-taxa-aplicar="${i}">Usar a sugestão</button>`)}</p>`;
}

export function destinosEditorHtml(m, { dados = {}, raizSite } = {}) {
  const esp = m.especificos || {};
  const ds = esp.destinos || [];
  const pessoasPadrao = Math.max(1, Number(esp.pessoas) || 1);
  const moedas = (d) => moedasDisponiveis(dados.paises, d.moeda || 'EUR');
  const linhas = ds.map((d, i) => {
    const pais = d.paisCodigo ? paisPorCodigo(d.paisCodigo, dados.paises) : null;
    const moeda = d.moeda || 'EUR';
    const simbolo = moeda;
    return `<li class="mt-dest" data-dest-item="${i}">
  <div class="mt-dest-cab"><span class="mt-dest-num">${i + 1}</span>
    <div class="mt-combo mt-combo-pais"><span class="mt-combo-flag">${bandeiraHtml(d.paisCodigo, { tamanho: 22, raizSite })}</span>
      <input class="mt-combo-input" data-combo="pais" data-dest="${i}" data-dest-campo="pais" value="${esc(pais ? pais.nome : (d.pais || ''))}" placeholder="País" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-label="País do destino ${i + 1}" autocomplete="off" autocapitalize="words">
      <ul class="mt-combo-lista" role="listbox" aria-label="Países" hidden></ul></div>
    <div class="mt-combo mt-combo-cidade">
      <input class="mt-combo-input" data-combo="cidade" data-dest="${i}" data-dest-campo="cidade" value="${esc(d.cidade || '')}" placeholder="Cidade" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-label="Cidade do destino ${i + 1}" autocomplete="off" autocapitalize="words">
      <ul class="mt-combo-lista" role="listbox" aria-label="Cidades" hidden></ul></div>
    <select data-dest="${i}" data-dest-campo="moeda" aria-label="Moeda do destino ${i + 1}">${opcoesMoeda(moedas(d), moeda)}</select>
    <button type="button" class="mt-x" data-dest-remover="${i}" aria-label="Remover destino ${i + 1}">×</button></div>
  <div class="mt-dest-campos">
    <label class="mt-campo"><span>Dias</span><input data-dest="${i}" data-dest-campo="dias" inputmode="numeric" value="${numParaCampo(d.dias, 0)}"></label>
    ${CATEGORIAS_DIARIA.map(([k, r]) => `<label class="mt-campo"><span>${r}/dia</span><input data-dest="${i}" data-dest-campo="gastos.${k}" inputmode="decimal" value="${numParaCampo(d.gastos && d.gastos[k])}"></label>`).join('')}
    <label class="mt-campo"><span>Ingressos/extras</span><input data-dest="${i}" data-dest-campo="extras" inputmode="decimal" value="${numParaCampo(d.extras)}"></label>
  </div>
  <div class="mt-dest-taxa">
    <span class="mt-dest-taxa-tit">Taxa turística${infoHtml(EXPLICACOES.taxaTuristica, { rotulo: 'O que é a taxa turística?' })} <em>(opcional - nem toda cidade cobra)</em></span>
    <div class="mt-dest-campos taxa">
      <label class="mt-campo"><span>Por pessoa/noite (${esc(simbolo)})</span><input data-dest="${i}" data-dest-campo="taxaTuristica" inputmode="decimal" value="${numParaCampo(d.taxaTuristica)}" placeholder="0"></label>
      <label class="mt-campo"><span>Noites</span><input data-dest="${i}" data-dest-campo="taxaNoites" inputmode="numeric" value="${numParaCampo(d.taxaNoites, 0)}" placeholder="${numParaCampo(d.dias, 0) || 'dias'}"></label>
      <label class="mt-campo"><span>Pessoas</span><input data-dest="${i}" data-dest-campo="taxaPessoas" inputmode="numeric" value="${numParaCampo(d.taxaPessoas, 0)}" placeholder="${pessoasPadrao}"></label>
    </div>
    <div data-taxa-nota="${i}">${notaTaxaHtml(d, i, dados.taxas)}</div>
  </div>
  <p class="mt-dest-total" data-dest-total="${i}">${esc(totalDestinoTexto(d, { pessoasPadrao }))}</p>
</li>`;
  }).join('');
  return `<ul class="mt-dests">${linhas}</ul><button type="button" class="mt-link" data-dest-add>+ Adicionar destino (país/cidade)</button>`;
}

// ---------------------------------------------------------------------------
// Itens "já comprado" (cartão / pago) e "ainda vou pagar"
// ---------------------------------------------------------------------------

export const FORMAS_ITEM = [['cartao', 'No cartão (comprado)'], ['pago', 'Pago (à vista, pix)'], ['juntar', 'Ainda vou pagar']];

export function fixosEditorHtml(m, { hoje, dados = {} } = {}) {
  const fs = (m.especificos && m.especificos.fixos) || [];
  const cartoes = [...new Set(fs.map((f) => String(f.cartao || '').trim()).filter(Boolean))];
  const moedas = moedasDisponiveis(dados.paises, 'BRL');
  const linhas = fs.map((f, i) => {
    const forma = ['cartao', 'pago', 'juntar'].includes(f.forma) ? f.forma : (f.pago ? 'pago' : 'cartao');
    return `<li class="mt-fixo-ed ${forma}">
  <input data-fixo="${i}" data-fixo-campo="nome" value="${esc(f.nome || '')}" placeholder="Passagem, hotel, ingresso…" aria-label="Item ${i + 1}">
  <span class="mt-entrada"><select data-fixo="${i}" data-fixo-campo="moeda" aria-label="Moeda">${opcoesMoeda(moedas, f.moeda || 'BRL')}</select><input data-fixo="${i}" data-fixo-campo="valor" inputmode="decimal" value="${numParaCampo(f.valor)}" aria-label="Valor total"></span>
  <label class="mt-mini mt-forma"><span>como paga</span><select data-fixo="${i}" data-fixo-campo="forma" aria-label="Como paga">${FORMAS_ITEM.map(([k, r]) => `<option value="${k}" ${k === forma ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
  ${forma === 'cartao' ? `<label class="mt-mini"><span>parcelas</span><input data-fixo="${i}" data-fixo-campo="parcelas" inputmode="numeric" value="${numParaCampo(f.parcelas, 0)}"></label>
  <label class="mt-mini"><span>1ª fatura</span><input type="month" data-fixo="${i}" data-fixo-campo="inicio" value="${esc(f.inicio || '')}"></label>
  <label class="mt-mini"><span>cartão</span><input data-fixo="${i}" data-fixo-campo="cartao" list="mtCartoes" value="${esc(f.cartao || '')}" placeholder="ex. Nubank" maxlength="40"></label>` : ''}
  <label class="mt-mini"><span>sua parte %</span><input data-fixo="${i}" data-fixo-campo="parte" inputmode="decimal" value="${numParaCampo(f.parte == null ? 100 : f.parte * 100, 1)}"></label>
  ${forma === 'cartao' ? `<label class="mt-check-txt"><input type="checkbox" data-fixo="${i}" data-fixo-campo="confirmado" ${f.confirmado ? 'checked' : ''}> fatura paga${infoHtml('Marque quando a fatura do cartão já foi paga e confirmada. Sem marcar, o item vira "confirmado" sozinho quando o mês da última parcela passa.', { rotulo: 'O que é "fatura paga"?' })}</label>` : ''}
  <button type="button" class="mt-x" data-fixo-remover="${i}" aria-label="Remover ${esc(f.nome || 'item')}">×</button>
</li>`;
  }).join('');
  return `<ul class="mt-fixos-ed">${linhas}</ul><datalist id="mtCartoes">${cartoes.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
<button type="button" class="mt-link" data-fixo-add>+ Adicionar passagem, hotel, ingresso…</button>`;
}

// ---------------------------------------------------------------------------
// Entradas programadas (13º, FGTS, PLR...) - qualquer meta
// ---------------------------------------------------------------------------

const ORIGEM_ENTRADA = {
  holerite: 'estimado pelo último holerite', carreira: 'estimado pelo salário da carteira', aproximado: 'aproximado (só o líquido)',
  planilha: 'lançado na aba Salário', informado: 'informado por você', estimado: 'estimado pela aba Patrimônio', 'sem-dados': 'sem dados - informe o valor',
};
export const rotuloOrigemEntrada = (o) => ORIGEM_ENTRADA[o] || '';

/** O que cada entrada rende até a data da meta ("nov/2026 R$ 3.100 + dez/2026 R$ 2.400 = R$ 4.950"). */
export function resumoEntradaHtml(m, e, { referencias = {}, hoje } = {}) {
  const parcelas = expandirEntradas({ ...m, entradas: [e] }, { referencias, hoje, ate: m.dataAlvo || null }).filter((x) => x.entradaId === e.id);
  if (e.ativo === false) return '<span class="mt-fraco">desligada - não entra na conta</span>';
  if (!parcelas.length) return `<span class="mt-fraco">nenhuma parcela cai antes da data da meta${m.dataAlvo ? ` (${rotuloMes(m.dataAlvo)})` : ''} - não entra na conta</span>`;
  const soma = parcelas.reduce((s, x) => s + x.valor, 0);
  const sem = parcelas.filter((x) => !(x.valor > 0));
  const txt = parcelas.map((x) => `${rotuloMes(x.mes)} ${x.valor > 0 ? `<b>${r0(x.valor)}</b>` : '<span class="mt-ruim">?</span>'}`).join(' + ');
  const nota = parcelas.find((x) => x.nota);
  return `${txt}${parcelas.length > 1 && soma > 0 ? ` = <b>${r0(soma)}</b>` : ''} <span class="mt-fraco">(${parcelas[0].bruto != null ? `${r0(parcelas.reduce((s, x) => s + (x.bruto || 0), 0))} x ${pct(parcelas[0].pct, 0)}` : 'sem estimativa'}${parcelas[0].origem ? ` · ${rotuloOrigemEntrada(parcelas[0].origem)}` : ''})</span>${nota ? `<br><span class="mt-ruim">${esc(nota.nota)}</span>` : (sem.length ? '<br><span class="mt-ruim">informe o valor</span>' : '')}`;
}

export function entradasEditorHtml(m, { referencias = {}, hoje } = {}) {
  const es = m.entradas || [];
  const tem = (t) => es.some((e) => e.tipo === t);
  const linhas = es.map((e, i) => {
    const t = TIPOS_ENTRADA[e.tipo] || TIPOS_ENTRADA.outra;
    const comMes = e.tipo !== 'decimo13';
    return `<li class="mt-ent-ed ${e.ativo === false ? 'off' : ''}">
  <div class="mt-ent-cab"><label class="mt-check-txt"><input type="checkbox" data-entrada="${i}" data-entrada-campo="ativo" ${e.ativo === false ? '' : 'checked'}> <b>${esc(e.nome || t.rotulo)}</b></label>${e.tipo === 'decimo13' || e.tipo === 'fgts' ? infoHtml(EXPLICACOES[t.dica], { rotulo: `Como o ${t.rotulo} é estimado?` }) : ''}
  <button type="button" class="mt-x" data-entrada-remover="${i}" aria-label="Remover ${esc(e.nome || t.rotulo)}">×</button></div>
  <div class="mt-ent-campos">
    ${e.tipo === 'plr' || e.tipo === 'outra' ? `<label class="mt-mini mt-ent-nome"><span>nome</span><input data-entrada="${i}" data-entrada-campo="nome" value="${esc(e.nome || '')}" placeholder="${esc(t.rotulo)}" maxlength="60"></label>` : ''}
    <label class="mt-mini"><span>% que vai pra meta</span><input data-entrada="${i}" data-entrada-campo="pct" inputmode="decimal" value="${numParaCampo(e.pct == null ? t.pct * 100 : e.pct * 100, 1)}"></label>
    <label class="mt-mini"><span>${e.tipo === 'decimo13' ? 'valor líquido do ano' : 'valor'} (vazio = estimado)</span><input data-entrada="${i}" data-entrada-campo="valor" inputmode="decimal" value="${numParaCampo(e.valor)}" placeholder="estimado"></label>
    ${comMes ? `<label class="mt-mini"><span>mês${e.tipo === 'fgts' ? ' do saque' : ''}${e.tipo === 'fgts' ? ' (vazio = aniversário)' : ''}</span><input type="month" data-entrada="${i}" data-entrada-campo="mes" value="${esc(e.mes || '')}"></label>
    <label class="mt-mini"><span>repete</span><select data-entrada="${i}" data-entrada-campo="recorrencia"><option value="unica" ${e.recorrencia === 'unica' ? 'selected' : ''}>só uma vez</option><option value="anual" ${e.recorrencia === 'anual' ? 'selected' : ''}>todo ano</option>${e.tipo === 'outra' || e.tipo === 'plr' ? `<option value="mensal" ${e.recorrencia === 'mensal' ? 'selected' : ''}>todo mês</option>` : ''}</select></label>` : ''}
  </div>
  <p class="mt-ent-resumo" data-entrada-resumo="${i}">${resumoEntradaHtml(m, e, { referencias, hoje })}</p>
</li>`;
  }).join('');
  return `<p class="mt-nota largo">Dinheiro que vai entrar e você já decidiu guardar nessa meta. Só conta o que cai <b>antes da data da meta</b>; o aporte mensal necessário desconta isso.${infoHtml(EXPLICACOES.entradas, { rotulo: 'Como as entradas entram na conta?' })}</p>
<ul class="mt-ents-ed">${linhas}</ul>
<div class="mt-ent-add">${!tem('decimo13') ? '<button type="button" class="mt-link" data-entrada-add="decimo13">+ 13º salário</button>' : ''}${!tem('fgts') ? '<button type="button" class="mt-link" data-entrada-add="fgts">+ Saque-aniversário do FGTS</button>' : ''}<button type="button" class="mt-link" data-entrada-add="plr">+ PLR / bônus</button><button type="button" class="mt-link" data-entrada-add="outra">+ Outra entrada</button></div>`;
}

// ---------------------------------------------------------------------------
// Resumo ao vivo (assistente) e "Por mês" (herói)
// ---------------------------------------------------------------------------

/** Caixas de resumo no assistente: a juntar por moeda, a pagar (já comprado) e o que vai por mês. */
export function resumoViagemHtml(m, c) {
  const v = c && c.viagem;
  if (!v || (!v.temJuntar && !v.fixos.length)) return '<p class="mt-nota">Adicione os destinos: o que juntar em cada moeda sai sozinho (dias x gasto diário + taxa turística, com a margem).</p>';
  const moedas = Object.values(v.porMoeda);
  const itens = moedas.map((x) => `<li><b>${formatMoeda(x.comMargem, x.moeda, { casas: 0 })}</b><span>a juntar · ${x.dias} dias · ${esc(x.destinos.join(', '))}${x.taxa > 0 ? ` · taxa turística ${formatMoeda(x.taxa, x.moeda, { casas: 0 })}` : ''}${x.cotacao && x.moeda !== 'BRL' ? ` · ≈ ${r0(x.comMargemBRL)} hoje` : ''}</span></li>`);
  if (v.aPagar.itens.length) itens.push(`<li class="pagar"><b>${r0(v.aPagar.totalBRL)}</b><span>já comprado (a pagar)${v.aPagar.mesAtualBRL ? ` · ${r0(v.aPagar.mesAtualBRL)}/mês correndo` : ''} - fora do aporte</span></li>`);
  if (c.entradasTotal > 0) itens.push(`<li class="entradas"><b>${r0(c.entradasTotal)}</b><span>de entradas programadas até a data</span></li>`);
  if (c.aporteNecessario != null) itens.push(`<li class="aporte"><b>${r0(c.aporteNecessario)}/mês</b><span>pra guardar${v.aPagar.mesAtualBRL ? ` · + ${r0(v.aPagar.mesAtualBRL)}/mês de parcelas` : ''}</span></li>`);
  return `<ul class="mt-resumo-viagem">${itens.join('')}</ul>`;
}

/** Faixa "Por mês: paga R$ A (parcelas) + guarda R$ B (aporte)" do herói. */
export function porMesHtml(c) {
  const v = c && c.viagem;
  if (!v) return '';
  const ap = v.aPagar;
  const paga = ap.mesAtualBRL > 0 ? ap.mesAtualBRL : (ap.proximoMes ? ap.proximoMes.pendente : 0);
  const mesPaga = ap.mesAtualBRL > 0 ? null : (ap.proximoMes ? ap.proximoMes.mes : null);
  const guarda = c.aporteNecessario;
  if (!(paga > 0) && !(guarda > 0) && !ap.itens.length) return '';
  const subPaga = paga > 0 ? `parcelas no cartão${mesPaga ? ` a partir de ${rotuloMes(mesPaga)}` : ''}${ap.ultimoMes ? `, até ${rotuloMes(ap.ultimoMes)}` : ''}` : (ap.itens.length ? 'nada vencendo nos próximos meses' : '');
  return `<div class="mt-pormes" role="group" aria-label="O que sai por mês">
  <span class="mt-pormes-tit">Por mês${infoHtml(`${EXPLICACOES.aPagar} ${EXPLICACOES.aJuntar}`, { rotulo: 'Pagar x guardar: qual a diferença?' })}</span>
  <span class="mt-pm paga"><i>paga</i><b>${r0(paga || 0)}</b><em>${esc(subPaga)}</em></span>
  <span class="mt-pm-mais" aria-hidden="true">+</span>
  <span class="mt-pm guarda"><i>guarda</i><b>${guarda != null ? r0(guarda) : '—'}</b><em>${guarda != null ? `aporte pra juntar${c.dataAlvo ? ` até ${rotuloMes(c.dataAlvo)}` : ''}` : 'defina o mês da viagem'}</em></span>
</div>`;
}

/** Botão "Roteiro (Wanderlog)" - abre em nova aba. */
export function botaoRoteiroHtml(meta) {
  const url = meta && meta.especificos && meta.especificos.roteiroUrl;
  if (!url) return '';
  const wl = ehLinkWanderlog(url);
  return `<a class="btn btn-ghost mt-btn-sm mt-roteiro" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-roteiro><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>${wl ? 'Roteiro (Wanderlog)' : 'Roteiro'}</a>`;
}

// ---------------------------------------------------------------------------
// Detalhe: A pagar x A juntar, entradas, destinos, câmbio
// ---------------------------------------------------------------------------

function cambioTxt(moeda, cambio) {
  const c = cambio && cambio[moeda];
  if (!c || !(c.valor > 0)) return '';
  const data = c.data && /^\d{4}-\d{2}-\d{2}/.test(c.data) ? `${c.data.slice(8, 10)}/${c.data.slice(5, 7)}` : '';
  return ` · 1 ${moeda} = ${formatMoeda(c.valor, 'BRL', { casas: 2 })}${c.fonte ? ` <span class="mt-fraco">(${esc(c.fonte)}${data ? `, ${data}` : ''})</span>` : ''}`;
}

const SITUACAO_ITEM = {
  confirmado: ['ok', 'pago e confirmado'],
  pendente: ['pend', 'pago - confirmação pendente'],
  'a-juntar': ['juntar', 'ainda a pagar'],
};

/** Parte (a) "A pagar (já comprado)": itens no cartão/à vista e o cronograma de parcelas por mês. */
export function aPagarHtml(meta, c) {
  const ap = c.viagem.aPagar;
  const hoje = c.viagem.mesHoje;
  const itens = ap.itens.map((f) => {
    const [cls, rot] = SITUACAO_ITEM[f.status] || SITUACAO_ITEM.pendente;
    const quando = f.forma === 'pago' ? 'à vista' : `${f.parcelas}x de ${f.parcelaBRL != null ? r0(f.parcelaBRL) : '—'}${f.inicio ? ` · ${rotuloMes(f.inicio)} a ${rotuloMes(f.fim)}` : ' · informe o mês da 1ª fatura'}`;
    return `<li class="${cls}"><span class="mt-v-nome">${esc(f.nome)}<em>${quando}${f.cartao ? ` · ${esc(f.cartao)}` : ''}${f.parte < 1 ? ` · sua parte ${pct(f.parte)}` : ''}${f.moeda !== 'BRL' ? ` · ${formatMoeda(f.totalMoeda, f.moeda, { casas: 0 })}` : ''}</em></span><span class="mt-sit ${cls}">${rot}</span><b class="mono">${f.totalBRL != null ? formatMoeda(f.totalBRL) : '—'}</b></li>`;
  }).join('');
  const cron = ap.cronograma.map((x) => `<tr class="${x.mes === hoje ? 'atual' : ''}"><th scope="row">${rotuloMes(x.mes)}${x.mes === hoje ? ' <span class="mt-fraco">este mês</span>' : ''}</th><td><b>${formatMoeda(x.total)}</b></td><td class="mt-fraco">${Object.entries(x.porCartao).map(([k, v]) => `${esc(k)} ${r0(v)}`).join(' · ')}</td><td>${x.pendente > 0.5 ? '<span class="mt-sit pend">confirmação pendente</span>' : '<span class="mt-sit ok">confirmada</span>'}</td></tr>`).join('');
  return `<section class="mt-bloco mt-apagar"><div class="mt-bloco-cab"><h3>A pagar (já comprado)${infoHtml(EXPLICACOES.aPagar, { rotulo: 'O que é "A pagar"?' })}</h3><span class="mt-fraco">${ap.itens.length ? `${r0(ap.totalBRL)} no total${ap.pendenteBRL > 0.5 ? ` · ${r0(ap.pendenteBRL)} ainda por confirmar` : ' · tudo confirmado'}` : 'nada comprado ainda'}</span></div>
  ${ap.itens.length ? `<div class="mt-pagar-resumo"><span><i>Este mês</i><b>${r0(ap.mesAtualBRL)}</b></span><span><i>Próximo mês</i><b>${ap.proximoMes ? r0(ap.proximoMes.pendente) : '—'}</b></span><span><i>Última fatura</i><b>${ap.ultimoMes ? rotuloMes(ap.ultimoMes) : '—'}</b></span></div>
  <ul class="mt-fixos">${itens}</ul>
  ${cron ? `<h4 class="mt-grupo">Parcelas por mês</h4><div class="card card-flat"><div class="tabela-wrap"><table class="tabela tabela-baixa mt-tabela"><thead><tr><th scope="col">Mês</th><th scope="col">A pagar</th><th scope="col">Por cartão</th><th scope="col">Situação</th></tr></thead><tbody>${cron}</tbody></table></div></div>` : ''}
  <p class="mt-nota">No cartão = já comprado: conta como pago desde já (só falta a fatura chegar) e <b>não entra no aporte</b>.${ap.semInicio.length ? ` <span class="mt-ruim">Informe o mês da 1ª fatura de: ${ap.semInicio.map(esc).join(', ')}.</span>` : ''}</p>` : '<p class="mt-nota">Passagens, hotéis e ingressos que você já comprou no cartão entram aqui (em Editar › "Já comprado"): ficam fora do aporte e você vê quanto paga em cada mês.</p>'}
</section>`;
}

/** Parte (b) "A juntar": a conta passo a passo até o aporte mensal. */
export function aJuntarHtml(meta, c) {
  const v = c.viagem;
  const linha = (rot, val, cls = '', sub = '') => `<li class="${cls}"><span>${rot}${sub ? `<em>${sub}</em>` : ''}</span><b class="mono">${val}</b></li>`;
  const moedaTxt = (x, valor) => (x.moeda === 'BRL' ? formatMoeda(valor) : `${formatMoeda(valor, x.moeda, { casas: 0 })}${x.cotacao ? ` ≈ ${r0(valor * x.cotacao)}` : ''}`);
  const passos = [];
  Object.values(v.porMoeda).forEach((x) => {
    if (x.gastos > 0) passos.push(linha(`Gasto lá em ${x.moeda}`, moedaTxt(x, x.gastos), '', `${x.dias} dias x gasto diário${x.destinos.length ? ` (${esc(x.destinos.join(', '))})` : ''}`));
    if (x.margemValor > 0) passos.push(linha(`Margem de segurança (${pct(v.margem)})`, `+ ${moedaTxt(x, x.margemValor)}`));
    if (x.taxa > 0) passos.push(linha(`Taxa turística${infoHtml(EXPLICACOES.taxaTuristica, { rotulo: 'O que é a taxa turística?' })}`, `+ ${moedaTxt(x, x.taxa)}`, '', 'por pessoa x noite x pessoas, sem margem'));
    if (x.itens > 0) passos.push(linha('Ainda não pago', `+ ${moedaTxt(x, x.itens)}`, '', 'itens marcados "ainda vou pagar"'));
  });
  const simples = (c.partes || []).filter((p) => /informado/.test(p.rotulo));
  simples.forEach((p) => passos.push(linha(p.rotulo, formatMoeda(p.valor))));
  passos.push(linha('Total a juntar', formatMoeda(c.alvoBRL), 'sub destaque'));
  passos.push(linha('− Já guardado', `− ${formatMoeda(c.atualRitmo)}`, '', 'saldo em conta (ex. Wise em euro) + investimentos vinculados'));
  passos.push(linha('Falta juntar', formatMoeda(c.falta), 'sub'));
  const d = c.decomposicao;
  if (d && d.entradas.length) {
    d.entradas.forEach((e) => passos.push(linha(`− ${esc(e.rotulo)}`, `− ${formatMoeda(e.valor)}`, 'entrada', rotuloMes(e.mes))));
    passos.push(linha('A aportar', formatMoeda(d.restante), 'sub', 'o que falta depois das entradas'));
  }
  if (c.aporteNecessario != null && c.mesesRestantes != null) {
    passos.push(linha(c.mesesRestantes > 0 ? `÷ ${c.mesesRestantes} ${c.mesesRestantes === 1 ? 'mês' : 'meses'} = aporte mensal` : 'Aporte (no mês da viagem)', `${formatMoeda(c.aporteNecessario)}<small>/mês</small>`, 'total', c.taxa > 0 ? `já considerando o rendimento de ${pct(meta.rendimentoAnual || 0, 1)} ao ano sobre o que você guarda` : ''));
  } else passos.push(linha('Aporte mensal', '—', 'total', 'defina o mês da viagem pra calcular'));
  return `<section class="mt-bloco mt-ajuntar"><div class="mt-bloco-cab"><h3>A juntar${infoHtml(EXPLICACOES.aJuntar, { rotulo: 'O que é "A juntar"?' })}</h3><span class="mt-fraco">${c.falta > 0.5 ? `${r0(c.falta)} ainda falta` : 'já juntou tudo'}</span></div>
  <ol class="mt-conta mt-conta-viagem">${passos.join('')}</ol>
  ${c.viagem.semCambio.length ? `<p class="mt-alerta">Sem câmbio de ${c.viagem.semCambio.join(', ')}: o valor em reais ficou de fora da conta.</p>` : ''}
</section>`;
}

/** Entradas programadas (qualquer meta): o que cai antes da data e quanto vai pra meta. */
export function entradasDetalheHtml(meta, c) {
  const todas = Array.isArray(meta.entradas) ? meta.entradas.filter((e) => e && e.ativo !== false) : [];
  if (!todas.length) return '';
  const linhas = c.entradas.map((e) => `<tr><th scope="row">${esc(e.rotulo)}</th><td>${rotuloMes(e.mes)}</td><td>${e.bruto != null ? formatMoeda(e.bruto) : '—'}</td><td>${pct(e.pct, 0)}</td><td><b>${e.valor > 0 ? formatMoeda(e.valor) : '—'}</b></td><td class="mt-fraco">${e.nota ? `<span class="mt-ruim">${esc(e.nota)}</span>` : esc(rotuloOrigemEntrada(e.origem))}</td></tr>`).join('');
  return `<section class="mt-bloco mt-entradas"><div class="mt-bloco-cab"><h3>Entradas programadas${infoHtml(EXPLICACOES.entradas, { rotulo: 'Como as entradas entram na conta?' })}</h3><span class="mt-fraco">${c.entradasTotal > 0 ? `${r0(c.entradasTotal)} até ${c.dataAlvo ? rotuloMes(c.dataAlvo) : 'a data'}` : 'nenhuma conta ainda'}</span></div>
  ${linhas ? `<div class="card card-flat"><div class="tabela-wrap"><table class="tabela tabela-baixa mt-tabela"><thead><tr><th scope="col">Entrada</th><th scope="col">Mês</th><th scope="col">Bruto</th><th scope="col">% pra meta</th><th scope="col">Vai pra meta</th><th scope="col">Origem</th></tr></thead><tbody>${linhas}</tbody></table></div></div>` : `<p class="mt-nota">Nenhuma das entradas cai antes da data da meta${c.dataAlvo ? ` (${rotuloMes(c.dataAlvo)})` : ''} - por isso não entram na conta.</p>`}
  <p class="mt-nota">O aporte mensal necessário desconta esse valor${c.taxa > 0 ? ' (com o rendimento até a data)' : ''}; no gráfico da evolução, cada entrada aparece como um degrau.${meta._entradasPadrao ? ' <b>13º e FGTS (90%) entraram como padrão</b> - ajuste em Editar e salve pra manter.' : ''}</p>
</section>`;
}

/** Aviso discreto "revise: <campo>" da migração das viagens antigas. */
export function avisoRevisarHtml(meta) {
  const r = (meta && meta._revisar) || [];
  if (!r.length) return '';
  return `<p class="mt-revisar-aviso" role="note"><b>Revise:</b> ${r.map((x) => esc(x.texto || x.campo)).join(' · ')} <button type="button" class="mt-link" data-editar>Editar</button></p>`;
}

/** Destinos (com bandeira e taxa turística) + o que juntar por moeda (com o câmbio e a fonte). */
export function destinosDetalheHtml(meta, c, { cambio = {}, dados = {}, raizSite } = {}) {
  const v = c.viagem;
  if (!v.temDestinos) return '';
  const moedas = Object.values(v.porMoeda);
  const tabela = v.destinos.map((d) => {
    const pais = d.paisCodigo ? paisPorCodigo(d.paisCodigo, dados.paises) : null;
    const nomePais = pais ? pais.nome : d.pais;
    return `<tr><th scope="row"><span class="mt-dest-nome">${bandeiraHtml(d.paisCodigo, { tamanho: 20, raizSite })}<span>${esc(d.cidade || nomePais)}${d.cidade && nomePais ? `<span class="mt-fraco"> · ${esc(nomePais)}</span>` : ''}</span></span></th><td>${d.dias}</td><td>${formatMoeda(d.diaria, d.moeda, { casas: 0 })}</td><td>${d.taxa.total > 0 ? `${formatMoeda(d.taxa.total, d.moeda, { casas: 0 })}<span class="mt-fraco"> (${formatMoeda(d.taxa.valor, d.moeda)} x ${d.taxa.noites} x ${d.taxa.pessoas})</span>` : '<span class="mt-fraco">—</span>'}</td><td><b>${formatMoeda(d.totalMoeda, d.moeda, { casas: 0 })}</b>${d.totalBRL != null && d.moeda !== 'BRL' ? `<span class="mt-fraco"> ≈ ${r0(d.totalBRL)}</span>` : ''}</td></tr>`;
  }).join('');
  return `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Destinos</h3><span class="mt-fraco">${v.dias} dias${v.margem ? ` · margem de ${pct(v.margem)}` : ''}${v.pessoas > 1 ? ` · ${v.pessoas} pessoas (taxa turística)` : ''}</span></div>
  <div class="card card-flat"><div class="tabela-wrap"><table class="tabela tabela-baixa mt-tabela mt-tabela-destinos"><thead><tr><th scope="col">Destino</th><th scope="col">Dias</th><th scope="col">Por dia</th><th scope="col">Taxa turística</th><th scope="col">Total (sem margem)</th></tr></thead><tbody>${tabela}</tbody></table></div></div>
  <h4 class="mt-grupo">Por moeda${infoHtml(EXPLICACOES.cambioFonte, { rotulo: 'De onde vem a cotação?' })}</h4>
  <ul class="mt-moedas">${moedas.map((x) => {
    const p = x.comMargem > 0 ? Math.min(1, x.guardado / x.comMargem) : 0;
    return `<li><div class="mt-moeda-cab"><b>${x.moeda}</b><span>${formatMoeda(x.comMargem, x.moeda, { casas: 0 })} a juntar (com margem${x.taxa > 0 ? ' e taxa turística' : ''})${x.moeda !== 'BRL' ? (cambioTxt(x.moeda, cambio) || ' · <span class="mt-ruim">sem cotação</span>') : ''}</span></div>
      <span class="mt-barra"><span style="width:${(p * 100).toFixed(1)}%"></span></span>
      <div class="mt-moeda-num"><span>já trocado: <b>${formatMoeda(x.guardado, x.moeda, { casas: 0 })}</b></span><span class="${x.falta > 0 ? 'mt-ruim' : 'mt-bom'}">${x.falta > 0 ? `faltam <b>${formatMoeda(x.falta, x.moeda, { casas: 0 })}</b>${x.faltaBRL != null && x.moeda !== 'BRL' ? ` ≈ ${r0(x.faltaBRL)} hoje` : ''}` : 'completo ✓'}</span></div></li>`;
  }).join('')}</ul></section>`;
}

/** Tudo da viagem no detalhe, na ordem: revisar, a pagar, a juntar, entradas, destinos. */
export function viagemDetalheHtml(meta, c, opcoes = {}) {
  return `${avisoRevisarHtml(meta)}${aPagarHtml(meta, c)}${aJuntarHtml(meta, c)}${entradasDetalheHtml(meta, c)}${destinosDetalheHtml(meta, c, opcoes)}`;
}

