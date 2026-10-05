/**
 * ativo-patrimonio-calc.js - 05/10/2026: contas da aba "Patrimônio" do FII
 * (ativo/index.html). Puro, sem DOM: junta o que a CVM entrega (resposta de
 * action=fiiPortfolio, apps-script/PortfolioFii.gs) com a curadoria manual
 * (assets/data/fii-portfolio-manual.json), divide imóveis por imóvel /
 * segmento / estado, escolhe o aviso de "fato relevante novo", e monta as
 * consultas do mapa pro navegador (quando o Nominatim recusa o Apps Script).
 */

export const ROTULO_TIPO = { tijolo: 'Tijolo', papel: 'Papel', hibrido: 'Híbrido', fof: 'Fundo de fundos', indefinido: 'Tipo não identificado' };
export const SEM_DADO = 'Não identificado';

/** Nome sem acento/caixa/pontuação - chave pra casar o imóvel da curadoria com o da CVM. */
export function normalizarNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const numeroOuNulo = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Só https (ou caminho do próprio site) vira link/imagem. */
export function urlPublica(url) {
  const u = String(url || '').trim();
  return /^https:\/\//i.test(u) ? u : null;
}

function fotoValida(f) {
  const url = f && urlPublica(f.url);
  return url ? { url, legenda: String(f.legenda || ''), credito: String(f.credito || ''), licenca: String(f.licenca || '') } : null;
}

/**
 * Curadoria por cima do automático. `manual` = o objeto do fundo em
 * fii-portfolio-manual.json (ou null). Devolve a visão que a tela desenha:
 * { tipo, imoveis: [...], papel, cotas, composicao, links, fotoFundo, aviso, ... }.
 */
export function montarVisao(resposta, manual) {
  const p = (resposta && resposta.portfolio) || {};
  const m = manual && typeof manual === 'object' ? manual : {};
  const sobre = (m.imoveis && typeof m.imoveis === 'object') ? m.imoveis : {};
  const sobrePorNome = {};
  Object.keys(sobre).forEach((nome) => { sobrePorNome[normalizarNome(nome)] = sobre[nome] || {}; });

  const base = ((p.imoveis && p.imoveis.itens) || []).map((im) => {
    const o = sobrePorNome[normalizarNome(im.nome)] || {};
    if (o.ocultar) return null;
    const lat = numeroOuNulo(o.lat) != null ? o.lat : im.lat;
    const lon = numeroOuNulo(o.lon) != null ? o.lon : im.lon;
    const temCoordManual = numeroOuNulo(o.lat) != null && numeroOuNulo(o.lon) != null;
    return {
      ...im,
      nome: o.nome ? String(o.nome) : im.nome,
      cidade: o.cidade || im.cidade || '',
      uf: o.uf || im.uf || '',
      segmento: o.segmento ? String(o.segmento) : (im.segmento || ''),
      segmentoFonte: o.segmento ? 'manual' : (im.segmento ? (im.segmentoFonte || 'nome') : ''),
      lat: typeof lat === 'number' ? lat : null,
      lon: typeof lon === 'number' ? lon : null,
      precisao: temCoordManual ? 'manual' : (im.precisao || ''),
      foto: fotoValida(o.foto),
      link: urlPublica(o.link),
      manual: !!sobrePorNome[normalizarNome(im.nome)],
    };
  }).filter(Boolean);

  const extras = (Array.isArray(m.imoveisExtras) ? m.imoveisExtras : []).filter((e) => e && e.nome).map((e) => ({
    nome: String(e.nome), endereco: String(e.endereco || ''), cidade: String(e.cidade || ''), uf: String(e.uf || ''),
    area: numeroOuNulo(e.area), pctReceita: numeroOuNulo(e.pctReceita), vacancia: numeroOuNulo(e.vacancia), inadimplencia: null,
    segmento: String(e.segmento || ''), segmentoFonte: e.segmento ? 'manual' : '', classe: String(e.classe || 'Renda'),
    lat: numeroOuNulo(e.lat), lon: numeroOuNulo(e.lon), precisao: numeroOuNulo(e.lat) != null ? 'manual' : '',
    foto: fotoValida(e.foto), link: urlPublica(e.link), manual: true, extra: true, k: `extra:${normalizarNome(e.nome)}`,
  }));
  const imoveis = base.concat(extras);

  let papel = p.papel || null;
  if (Array.isArray(m.indexadores) && m.indexadores.length) {
    const total = papel ? papel.total : null;
    papel = {
      ...(papel || { titulos: [], n: 0 }),
      total,
      identificadoPct: 1,
      manual: true,
      porIndexador: m.indexadores.filter((i) => i && i.indexador && numeroOuNulo(i.pct) != null).map((i) => ({
        indexador: String(i.indexador), pct: i.pct, valor: numeroOuNulo(i.valor) != null ? i.valor : (total ? i.pct * total : null), n: null,
      })),
    };
  }

  return {
    ticker: resposta && resposta.ticker,
    nome: p.nome || '',
    tipo: ROTULO_TIPO[m.tipo] ? m.tipo : (p.tipo || 'indefinido'),
    segmentoCvm: p.segmentoCvm || '',
    ref: p.ref || {},
    composicao: p.composicao || null,
    porTipoAtivo: p.porTipoAtivo || [],
    imoveis,
    imoveisOmitidos: (p.imoveis && p.imoveis.omitidos) || 0,
    papel,
    cotas: p.cotas || null,
    links: (Array.isArray(m.links) ? m.links : []).map((l) => ({ rotulo: String((l && l.rotulo) || 'Link'), url: urlPublica(l && l.url) })).filter((l) => l.url),
    fotoFundo: fotoValida(m.fotoFundo),
    observacao: String(m.observacao || ''),
    aviso: avisoFatoRelevante(resposta, m),
    fonte: (resposta && resposta.fonte) || '',
    atualizadoEm: (resposta && resposta.atualizadoEm) || '',
    linkFnet: (resposta && resposta.linkFnet) || null,
    reprocessando: !!(resposta && resposta.reprocessando),
  };
}

/**
 * Fato relevante do FNet entregue DEPOIS do informe trimestral usado (e que
 * você ainda não marcou como conferido em fii-portfolio-manual.json) = "pode
 * ter mudado - confira". Devolve { data, assunto, link } ou null.
 */
export function avisoFatoRelevante(resposta, manual) {
  const fr = resposta && resposta.fatoRelevante;
  if (!fr || !fr.data) return null;
  const ref = resposta.portfolio && resposta.portfolio.ref;
  const base = (ref && (ref.entrega || ref.trimestre)) || '';
  if (base && fr.data <= base) return null;
  const visto = manual && manual.conferidoEm;
  if (visto && fr.data <= String(visto)) return null;
  return { data: fr.data, assunto: fr.assunto || '', link: urlPublica(fr.link) };
}

/** Base da divisão: receita (se os imóveis trazem % da receita) ou área. */
export function baseDisponivel(imoveis) {
  const soma = (campo) => imoveis.reduce((s, i) => s + (i[campo] > 0 ? i[campo] : 0), 0);
  const temReceita = soma('pctReceita') > 0;
  const temArea = soma('area') > 0;
  return { receita: temReceita, area: temArea, padrao: temReceita ? 'receita' : (temArea ? 'area' : null) };
}

/**
 * Divisão dos imóveis. por: 'imovel' | 'segmento' | 'estado'; base: 'receita' | 'area'.
 * Devolve { itens: [{ rotulo, share, n, estimado }], semPeso } - share soma 1. Passou de `max`
 * itens, o resto vira "Outros".
 */
export function divisaoImoveis(imoveis, { por = 'imovel', base = 'receita', max = 7 } = {}) {
  const campo = base === 'area' ? 'area' : 'pctReceita';
  const grupos = new Map();
  let total = 0, semPeso = 0;
  imoveis.forEach((im) => {
    const w = im[campo] > 0 ? im[campo] : 0;
    if (!w) { semPeso += 1; return; }
    const rotulo = por === 'imovel' ? im.nome : por === 'segmento' ? (im.segmento || SEM_DADO) : (im.uf || SEM_DADO);
    const g = grupos.get(rotulo) || { rotulo, peso: 0, n: 0, estimado: false };
    g.peso += w; g.n += 1; total += w;
    if (por === 'segmento' && im.segmento && im.segmentoFonte === 'nome') g.estimado = true;
    grupos.set(rotulo, g);
  });
  if (!(total > 0)) return { itens: [], semPeso };
  let itens = [...grupos.values()].sort((a, b) => (a.rotulo === SEM_DADO) - (b.rotulo === SEM_DADO) || b.peso - a.peso);
  if (itens.length > max) {
    const resto = itens.slice(max - 1);
    itens = itens.slice(0, max - 1).concat([{ rotulo: `Outros (${resto.reduce((s, g) => s + g.n, 0)})`, peso: resto.reduce((s, g) => s + g.peso, 0), n: resto.reduce((s, g) => s + g.n, 0), estimado: false, outros: true }]);
  }
  return { itens: itens.map((g) => ({ rotulo: g.rotulo, share: g.peso / total, n: g.n, estimado: g.estimado, outros: !!g.outros })), semPeso };
}

/** Resumo dos imóveis: nº, área, vacância (ponderada pela área), estados distintos. */
export function resumoImoveis(imoveis) {
  const ativos = imoveis.filter((i) => i.classe !== 'Em construção' && i.classe !== 'Para venda');
  let areaVac = 0, areaComVac = 0;
  ativos.forEach((i) => { if (i.vacancia != null && i.area > 0) { areaVac += i.area * i.vacancia; areaComVac += i.area; } });
  const estados = new Set(imoveis.map((i) => i.uf).filter(Boolean));
  const area = imoveis.reduce((s, i) => s + (i.area > 0 ? i.area : 0), 0);
  return { n: imoveis.length, area: area || null, vacancia: areaComVac > 0 ? areaVac / areaComVac : null, estados: estados.size };
}

/** Imóveis com ponto no mapa e quantos são aproximados (só a cidade). */
export function pontosDoMapa(imoveis) {
  const pontos = imoveis.filter((i) => typeof i.lat === 'number' && typeof i.lon === 'number');
  return { pontos, aproximados: pontos.filter((i) => i.precisao === 'cidade' || i.precisao === 'nome').length, sem: imoveis.length - pontos.length };
}

// ---------------------------------------------------------------------------
// Geocodificação no navegador (mesma lógica de PortfolioFii.gs!portConsultasImovel_)
// ---------------------------------------------------------------------------

/** Logradouro e número do endereço livre da CVM. */
export function logradouroNumero(endereco) {
  const s = String(endereco || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^(.*?),\s*(?:n[º°o.]*\s*)?(\d[\d.]*)\b/i) || s.match(/^(.*?)\s+n[º°o.]+\s*(\d[\d.]*)/i);
  if (m && m[1].length >= 3) return { logradouro: m[1].trim(), numero: m[2].replace(/\.$/, '') };
  const primeira = s.split(/\s*,\s*/)[0] || '';
  return { logradouro: primeira.replace(/\s+-\s+.*$/, '').trim(), numero: '' };
}

/** [{ q, p: 'endereço' | 'nome' }] da mais precisa pra menos; só cidade quando tudo falha ('cidade'). */
export function consultasNavegador(im) {
  const out = [];
  const ln = logradouroNumero(im.endereco);
  const nome = String(im.nome || '').replace(/\s+-\s+\d+%$/, '').trim();
  const local = im.cidade && im.uf ? `${im.cidade} - ${im.uf}` : '';
  const umaCidade = nome && !/[\d/]/.test(nome) && nome.length <= 25 && nome.split(/\s+/).length <= 2 && !/^(loja|galp|shopping|torre|edif)/i.test(nome);
  const num = ln.numero ? `, ${ln.numero}` : '';
  if (ln.logradouro && local) out.push({ q: `${ln.logradouro}${num}, ${local}`, p: 'endereço' });
  else if (ln.logradouro && im.uf) out.push({ q: `${ln.logradouro}${num}, ${im.uf}`, p: 'endereço' });
  else if (ln.logradouro && umaCidade) out.push({ q: `${ln.logradouro}${num}, ${nome}`, p: 'nome' });
  if (nome && local) out.push({ q: `${nome}, ${local}`, p: 'nome' });
  if (local) out.push({ q: `${im.cidade}, ${im.uf}`, p: 'cidade' });
  return out;
}

export function urlNominatim(q) {
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&addressdetails=1&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
}

/** Resposta do Nominatim -> { lat, lon, u, c } (dentro do Brasil e, se souber a UF, do mesmo estado) ou null. */
export function lerRespostaNominatim(lista, ufEsperada = '') {
  const x = Array.isArray(lista) ? lista[0] : null;
  if (!x) return null;
  const lat = Number(x.lat), lon = Number(x.lon);
  if (!(lat >= -34 && lat <= 6 && lon >= -74 && lon <= -34)) return null;
  const ad = x.address || {};
  const uf = String(ad['ISO3166-2-lvl4'] || '').replace(/^BR-/, '');
  if (ufEsperada && uf && uf !== ufEsperada) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, u: uf, c: String(ad.city || ad.town || ad.municipality || ad.village || '') };
}

// ---------------------------------------------------------------------------
// Formatação curta
// ---------------------------------------------------------------------------

/** 0.1234 -> "12,3%" (menos de 0,05% vira "<0,1%"). */
export function pctTexto(frac, casas = 1) {
  if (!Number.isFinite(frac)) return '—';
  const v = frac * 100;
  if (v > 0 && v < 0.05) return '<0,1%';
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** m2 com milhar: 30000 -> "30.000 m²". */
export function areaTexto(a) {
  return Number.isFinite(a) && a > 0 ? `${Math.round(a).toLocaleString('pt-BR')} m²` : '—';
}
