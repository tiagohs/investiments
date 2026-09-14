/**
 * logos-ativos.js — mapa TICKER -> caminho do logo em assets/imgs/,
 * gerado a partir dos arquivos que o Tiago foi organizando em
 * assets/imgs/acoes/ e assets/imgs/fiis/ (14/09/2026, rodada de feedback
 * do Radar de oportunidades). Regerar rodando
 * `node scripts/gerar-logos-ativos.mjs` sempre que adicionar/trocar uma
 * imagem — o script resolve automaticamente duplicata de extensão
 * (prioridade .png > .jpg/.jpeg > .webp) e ignora arquivo cujo nome não
 * bate com um ticker (ver o aviso que ele imprime nesse caso; hoje é o
 * caso de "fii-valreiiici--600.png", que não foi incluído aqui).
 *
 * Ticker ausente daqui (ainda não tem logo, ou o nome do arquivo não
 * bateu) cai no fallback de iniciais que já existe pros cartões de
 * ativo — nunca quebra por falta de imagem.
 */
export const LOGOS_ATIVOS = {
  "AGRO3": "assets/imgs/acoes/AGRO3.png",
  "AXIA7": "assets/imgs/acoes/AXIA7.png",
  "B3SA3": "assets/imgs/acoes/B3SA3.png",
  "BBAS3": "assets/imgs/acoes/BBAS3.png",
  "BBSE3": "assets/imgs/acoes/BBSE3.png",
  "BTLG11": "assets/imgs/fiis/BTLG11.png",
  "CHTR": "assets/imgs/acoes/CHTR.jpg",
  "EGIE3": "assets/imgs/acoes/EGIE3.png",
  "EWBC": "assets/imgs/acoes/EWBC.webp",
  "GARE11": "assets/imgs/fiis/GARE11.png",
  "GPRK": "assets/imgs/acoes/GPRK.png",
  "HGRU11": "assets/imgs/fiis/HGRU11.jpg",
  "KNUQ11": "assets/imgs/fiis/KNUQ11.png",
  "PAM": "assets/imgs/acoes/PAM.png",
  "PETR4": "assets/imgs/acoes/PETR4.png",
  "PMLL11": "assets/imgs/fiis/PMLL11.png",
  "PROSY": "assets/imgs/acoes/PROSY.png",
  "RBRY11": "assets/imgs/fiis/RBRY11.png",
  "RECR11": "assets/imgs/fiis/recr11.jpg",
  "SEER3": "assets/imgs/acoes/SEER3.png",
  "SIRI": "assets/imgs/acoes/SIRI.png",
  "TRXF11": "assets/imgs/fiis/TRXF11.png",
  "TUPY3": "assets/imgs/acoes/TUPY3.png",
  "VALE3": "assets/imgs/acoes/VALE3.png",
  "VAMO3": "assets/imgs/acoes/VAMO3.png",
  "VGIP11": "assets/imgs/fiis/VGIP11.png",
  "VNOM": "assets/imgs/acoes/VNOM.jpg",
  "WIZC3": "assets/imgs/acoes/WIZC3.png",
  "XPML11": "assets/imgs/fiis/XPML11.png",
};
