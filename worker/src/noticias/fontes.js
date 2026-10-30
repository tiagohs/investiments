/**
 * worker/src/noticias/fontes.js - 30/10/2026 (tela de Notícias, docs/noticias.md, ADR-N1/N3/N4): leitura das fontes, SEM
 * rede (puro texto -> dados; testado em tests/worker-noticias.test.js com HTML/XML de exemplo, sem conteúdo de terceiros).
 *  - InfoMoney "tempo real" do dia: <div class="live-container"><span class="live-published">...update</span> 16h01 </span>
 *    <h2 id="..." class="live-title">Título</h2>  -> { hora, titulo, link }; e o og:title (a manchete do dia) + os
 *    tópicos de "Ibovespa hoje".
 *  - RSS (Google Notícias e afins): <item><title>, <link>, <pubDate>, <source>, <description>.
 *  - Feed de vídeos do YouTube (Atom): <entry><yt:videoId>, <title>, <published>, <author><name>.
 * Regex simples em vez de montar o documento: 10 ms de CPU por execução no plano grátis.
 */

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#039': "'", '#8211': '–', '#8212': '—', '#8216': '‘', '#8217': '’', '#8220': '“', '#8221': '”', '#8230': '…' };

export function decodificarEntidades(texto) {
  return String(texto || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k in ENTIDADES) return ENTIDADES[k];
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)));
    return m;
  });
}

/** Texto limpo: sem tags, sem CDATA, entidades decodificadas, espaços normalizados. */
export function textoLimpo(html) {
  // as tags saem antes E depois de decodificar: o RSS manda HTML escapado na descrição (&lt;a href...&gt;)
  return decodificarEntidades(String(html || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Endereço do tempo real do InfoMoney de um dia ('aaaa-mm-dd'). */
export function urlTempoRealInfoMoney(diaIso) {
  const [a, m, d] = String(diaIso).split('-');
  return `https://www.infomoney.com.br/mercados/ibovespa-hoje-bolsa-de-valores-ao-vivo-${d}${m}${a}/`;
}

const RE_LIVE = /<span class="live-published">[\s\S]*?(\d{1,2}h\d{2})\s*<\/span>\s*<h2 id="([^"]*)" class="live-title"\s*>([\s\S]*?)<\/h2>/g;

/** { manchete, resumo: [texto], itens: [{ hora, titulo, link }] } (o mais novo primeiro, como na página). max: quantos itens. */
export function extrairTempoRealInfoMoney(html, { url = '', max = 40 } = {}) {
  const s = String(html || '');
  const itens = [];
  let m;
  RE_LIVE.lastIndex = 0;
  while ((m = RE_LIVE.exec(s)) && itens.length < max) {
    const titulo = textoLimpo(m[3]);
    if (titulo) itens.push({ hora: m[1], titulo, link: url ? `${url}#${m[2]}` : '' });
  }
  const og = s.match(/<meta property="og:title" content="([^"]*)"/);
  const manchete = og ? textoLimpo(og[1]).replace(/\s*[-|]\s*InfoMoney\s*$/i, '') : '';
  // "Ibovespa hoje": os tópicos (li) logo depois do h2 com id h-ibovespa-hoje, até o próximo título
  const resumo = [];
  const i = s.indexOf('id="h-ibovespa-hoje"');
  if (i >= 0) {
    const fim = s.indexOf('<h3', i);
    const bloco = s.slice(i, fim > i ? fim : i + 20000);
    const re = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let li;
    while ((li = re.exec(bloco)) && resumo.length < 5) { const t = textoLimpo(li[1]); if (t) resumo.push(t); }
  }
  return { manchete, resumo, itens };
}

const tag = (bloco, nome) => {
  const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${nome}>`));
  return m ? m[1] : '';
};

/** RSS 2.0 -> [{ titulo, link, data (ISO), fonte, resumo }]. O Google Notícias põe " - Fonte" no fim do título: sai. */
export function extrairRss(xml, { max = 20 } = {}) {
  const s = String(xml || '');
  const itens = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(s)) && itens.length < max) {
    const b = m[1];
    const fonte = textoLimpo(tag(b, 'source'));
    let titulo = textoLimpo(tag(b, 'title'));
    if (fonte && titulo.endsWith(` - ${fonte}`)) titulo = titulo.slice(0, -(fonte.length + 3));
    const quando = Date.parse(textoLimpo(tag(b, 'pubDate')));
    const resumo = textoLimpo(tag(b, 'description'));
    if (!titulo) continue;
    itens.push({ titulo, link: textoLimpo(tag(b, 'link')), data: Number.isFinite(quando) ? new Date(quando).toISOString() : null, fonte, resumo: resumo && resumo !== titulo && !resumo.startsWith(titulo) ? resumo.slice(0, 240) : '' });
  }
  return itens;
}

/** Feed Atom de um canal do YouTube -> [{ id, titulo, publicado (ISO), canal }]. */
export function extrairFeedYoutube(xml, { max = 15 } = {}) {
  const s = String(xml || '');
  const canalGeral = textoLimpo(tag(s.split('<entry')[0], 'title'));
  const itens = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(s)) && itens.length < max) {
    const b = m[1];
    const id = textoLimpo(tag(b, 'yt:videoId'));
    if (!/^[\w-]{6,20}$/.test(id)) continue;
    const quando = Date.parse(textoLimpo(tag(b, 'published')));
    itens.push({ id, titulo: textoLimpo(tag(b, 'title')), publicado: Number.isFinite(quando) ? new Date(quando).toISOString() : null, canal: textoLimpo(tag(tag(b, 'author'), 'name')) || canalGeral });
  }
  return itens;
}

/** Busca do Google Notícias (RSS, pt-BR). */
export function urlGoogleNoticias(consulta) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(consulta)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}
