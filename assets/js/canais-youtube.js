/**
 * canais-youtube.js - 02/10/2026 (Tiago: "Canais do YouTube por ativo
 * mostrados na página; a busca de vídeos tem que considerar os canais").
 *
 * O canal oficial de cada ativo no YouTube (a empresa, a gestora do fundo ou
 * o Tesouro Direto). A lista é pública (só links de canais), por isso fica
 * versionada aqui em vez de numa aba da planilha. Usada em dois lugares:
 *  - tela do ativo: bloco "Canal oficial" junto da seção Vídeos;
 *  - busca de vídeos (videos.js -> apps-script/Videos.gs): o `channelId`
 *    vai junto e o servidor lê o feed RSS do canal (o mesmo esquema sem
 *    chave de API dos canais de aux_videos-canais), marcando esses vídeos
 *    como "Canal oficial".
 *
 * channelId (UC...): resolvido em 02/10/2026 a partir do link que o Tiago
 * mandou (página do canal -> <link rel="canonical">), pra o servidor não
 * precisar descobrir a cada busca. Se um canal mudar, basta trocar o link e
 * apagar o channelId: o Videos.gs resolve o link sozinho (e guarda nas
 * propriedades do script).
 *
 * soQueCitam: canal de gestora/corretora que fala de muitos produtos (XP,
 * Kinea, Patria, BTG...) - dele só entram os vídeos que citam o ativo
 * (ticker ou apelido); de canal da própria empresa entram todos.
 *
 * WIZC3: o link veio como "@wizco." e o ponto final NÃO é pontuação - o
 * canal oficial da Wiz Co é mesmo o @wizco. (com ponto); o @wizco (sem
 * ponto) é outro canal, vazio, de 2006.
 */

const yt = (caminho) => `https://www.youtube.com/${caminho}`;

const PATRIA = { nome: 'Patria Investments', handle: '@patriainvestments', url: yt('@patriainvestments'), channelId: 'UC5GkvI2ijOY6ZNxqGFUvn1w', soQueCitam: true };
const AXIA = { nome: 'AXIA Energia', handle: '@axiaenergia', url: yt('@axiaenergia'), channelId: 'UC4M7Ro9-05Zx98s4JcaAW-A' };

/** Ticker -> canal oficial. */
export const CANAIS_YOUTUBE = Object.freeze({
  // ações
  WIZC3: { nome: 'Wiz Co', handle: '@wizco.', url: yt('@wizco.'), channelId: 'UCauEtyNMpfW4F0w2elNbdsQ' },
  VAMO3: { nome: 'Grupo Vamos', handle: '@grupovamos9174', url: yt('channel/UCAjWofuI6Pi5gTpL_AHOYYQ'), channelId: 'UCAjWofuI6Pi5gTpL_AHOYYQ' },
  BBSE3: { nome: 'BB Seguros', handle: '@bbseguros', url: yt('bbseguros'), channelId: 'UCXFumPwGXuuDG_GR8zhsfIQ' },
  B3SA3: { nome: 'B3', handle: '@bolsadobrasil', url: yt('user/bmfbovespa'), channelId: 'UCAeQIijec13o8I9xjjdSHWQ' },
  BBAS3: { nome: 'Banco do Brasil', handle: '@bancodobrasil', url: yt('user/bancodobrasil'), channelId: 'UCayJQj7hiNhfFk-MJ8Z9H0w' },
  SEER3: { nome: 'Grupo Ser Educacional', handle: '@GrupoSerEducacional_0', url: yt('c/GrupoSerEducacional_0'), channelId: 'UCIZof9j79qO6HxkT1u_4TKQ' },
  VALE3: { nome: 'Vale', handle: '@ValenoBrasil', url: yt('user/Vale'), channelId: 'UCMDd2zfFdlupOwg_KyqpQWQ' },
  PETR4: { nome: 'Petrobras', handle: '@petrobras', url: yt('petrobras'), channelId: 'UC4_m_Lx5ngLtVq8eOXPdF_w' },
  AXIA7: AXIA,
  AXIA3: AXIA, // mesma empresa da AXIA7 (outra classe de ação)
  TUPY3: { nome: 'Tupy', handle: '@TupySA', url: yt('@TupySA'), channelId: 'UCzV0NFuSm5wk9_NK8n4YkYQ' },
  AGRO3: { nome: 'BrasilAgro', handle: '@BrasilAgro_Oficial', url: yt('c/BrasilAgro_Oficial'), channelId: 'UC5XAKGmH_40af0G7dxpQYmw' },
  EGIE3: { nome: 'ENGIE Brasil', handle: '@ENGIEBrasil', url: yt('@ENGIEBrasil'), channelId: 'UCLk-Odz551_0tRgjoR8yfhw' },
  // FIIs (canal da gestora)
  PMLL11: PATRIA,
  HGRU11: PATRIA,
  BTLG11: { nome: 'BTG Pactual Asset Management', handle: '@btgpactualassetmanagement', url: yt('@btgpactualassetmanagement'), channelId: 'UC3F7xGujyP59SsrzhdO9aAA', soQueCitam: true },
  TRXF11: { nome: 'TRX Investimentos', handle: '@trxinvestimentos2945', url: yt('@trxinvestimentos2945'), channelId: 'UCjZsV-DSJVU2i8M9Bl56ZQg', soQueCitam: true },
  XPML11: { nome: 'XP', handle: '@XP_Oficial', url: yt('@XP_Oficial'), channelId: 'UCf15n72n6pV0RK6-GOi1s1Q', soQueCitam: true },
  RBRY11: { nome: 'RBR Asset Management', handle: '@RBRAssetManagement', url: yt('c/RBRAssetManagement'), channelId: 'UCfeFPKDC7gEP_BOaIdY46jw', soQueCitam: true },
  KNUQ11: { nome: 'Kinea Investimentos', handle: '@KineaInvestimentos', url: yt('@KineaInvestimentos'), channelId: 'UCuP3yzTmY6AWjIljW0GPuPg', soQueCitam: true },
  // ações EUA
  PAM: { nome: 'Pampa Energía', handle: '@PampaEnergia', url: yt('@PampaEnergia'), channelId: 'UC1m8LQVpRUWrH4XhoCxcZ4g' },
  CHTR: { nome: 'Charter Communications', handle: '@CharterCommunications', url: yt('chartercommunications'), channelId: 'UCqx-k-wcqulofG_NEReJWvQ' },
  PROSY: { nome: 'Prosus', handle: '@ProsusGroup', url: yt('channel/UC4Yj3qrCYB7On4T58f2BEDQ'), channelId: 'UC4Yj3qrCYB7On4T58f2BEDQ' },
  EWBC: { nome: 'East West Bank', handle: '@eastwestbancorp', url: yt('@eastwestbancorp'), channelId: 'UC97dhlYJSDiDbORY1_HnQRw' },
});

/** Renda fixa do Tesouro (Tesouro Selic, IPCA+, Prefixado, Renda+, Educa+). */
export const CANAL_TESOURO_DIRETO = Object.freeze({ nome: 'Tesouro Direto', handle: '@TesouroDiretoOficial', url: yt('@TesouroDiretoOficial'), channelId: 'UC5oyVsY5ec984JzWYvNcO0A' });

const RE_TESOURO = /\btesouro\b/i;

/** Título de renda fixa do Tesouro Direto? (pelo nome, tipo ou instituição). */
export function ehTituloTesouro({ ticker = '', ativo = null } = {}) {
  const a = ativo || {};
  return [ticker, a.nome, a.nomePersonalizado, a.tipoInvestimento, a.instituicao].some((t) => RE_TESOURO.test(String(t || '')));
}

/**
 * Canal oficial de um ativo da tela ({ ticker, classe, ativo }) ou null.
 * Renda fixa: só os títulos do Tesouro têm canal (Tesouro Direto).
 */
export function canalDoAtivo({ ticker = '', classe = '', ativo = null, ehRf = false } = {}) {
  if (ehRf || classe === 'rendaFixa' || classe === 'rf') return ehTituloTesouro({ ticker, ativo }) ? CANAL_TESOURO_DIRETO : null;
  const t = String(ticker || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(CANAIS_YOUTUBE, t) ? CANAIS_YOUTUBE[t] : null;
}

/** "Tesouro IPCA+ 2035" -> "Tesouro IPCA+" (família do título, termo da busca de vídeos). */
export function familiaTesouro(nome) {
  const m = /tesouro\s+(selic|ipca\+?|prefixado|renda\+?|educa\+?)/i.exec(String(nome || ''));
  if (!m) return '';
  const f = m[1].toLowerCase();
  const rotulo = f.startsWith('ipca') ? 'IPCA+' : f.startsWith('renda') ? 'Renda+' : f.startsWith('educa') ? 'Educa+' : f[0].toUpperCase() + f.slice(1);
  return `Tesouro ${rotulo}`;
}

/** Parâmetros que a busca de vídeos (getVideos) manda pro servidor pra considerar o canal. */
export function parametrosCanalVideos(canal) {
  if (!canal || !/^UC[\w-]{22}$/.test(String(canal.channelId || ''))) {
    return canal && canal.url ? { canal: canal.url, ...(canal.soQueCitam ? { canalModo: 'citam' } : {}) } : {};
  }
  return { canal: canal.channelId, ...(canal.soQueCitam ? { canalModo: 'citam' } : {}) };
}
