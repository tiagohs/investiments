/**
 * Noticias.gs - 30/10/2026 (Tiago: tela dedicada a notícias - docs/noticias.md, ADR-N1/N4).
 *
 * O Worker do Cloudflare busca as notícias e os vídeos sozinho (worker/src/noticias/coleta.js). Daqui sai só o que
 * mora na planilha: a tela `noticiasConfig`, publicada com as outras (Publicacao.gs!familiasLeitura_):
 *  - canais: aux_videos-canais (a mesma aba dos vídeos dos ativos). Coluna D (opcional) = em que aba da tela de
 *    Notícias o canal entra: "noticias", "especialistas" ou "meus" ("não" = fica fora). Vazia: @infomoney e @uol vão
 *    para Notícias, @ProfessorBaroni e @josekoborioficial para Especialistas, o resto para Meus canais.
 *  - ativos: os da carteira com posição (Auxiliar_ativos), com o nome - o Worker busca as notícias de cada um.
 * O ID do canal (UC...) sai de resolverCanalYoutube_ (Videos.gs), guardado nas propriedades depois da 1ª vez.
 */

var NOTICIAS_TELA_PADRAO_ = { '@infomoney': 'noticias', '@uol': 'noticias', '@professorbaroni': 'especialistas', '@josekoborioficial': 'especialistas' };
var NOTICIAS_CABECALHO_TELA_ = 'Tela de notícias (noticias, especialistas, meus ou não)';

/** Rodar 1x (opcional): põe o título da coluna D na aba aux_videos-canais. */
function configurarNoticiasDireto() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_VIDEOS_CANAIS);
  if (!aba) { Logger.log('Aba ' + ABA_VIDEOS_CANAIS + ' não existe: rode configurarVideosDireto() antes.'); return; }
  var celula = aba.getRange(1, 4);
  if (!String(celula.getValue() || '').trim()) celula.setValue(NOTICIAS_CABECALHO_TELA_);
  Logger.log('Coluna D de ' + ABA_VIDEOS_CANAIS + ': ' + NOTICIAS_CABECALHO_TELA_);
}

/** Texto da coluna D (ou o padrão pelo @nome) -> 'noticias' | 'especialistas' | 'meus' | null (fora da tela). */
function telaNoticiasDoCanal_(entrada, texto) {
  var t = semAcentoVideo_(String(texto || '').trim().toLowerCase());
  if (t) {
    if (/^(nao|fora|nenhuma?)$/.test(t)) return null;
    if (/^noticia/.test(t) || t === 'uol') return 'noticias';
    if (/^especialista/.test(t)) return 'especialistas';
    return 'meus';
  }
  var e = String(entrada || '').trim().toLowerCase();
  var arroba = e.match(/@[\w.-]+/);
  return NOTICIAS_TELA_PADRAO_[arroba ? arroba[0] : e] || 'meus';
}

/** Nome curto do canal pra mostrar enquanto o feed não foi lido (o Worker troca pelo nome do feed). */
function nomeCurtoCanalNoticias_(entrada) {
  var e = String(entrada || '').trim();
  var arroba = e.match(/@([\w.-]+)/);
  if (arroba) return arroba[1];
  return e.replace(/^https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|user\/)?/i, '').replace(/[/?#].*$/, '') || e;
}

function lerCanaisNoticias_(ss) {
  var aba = ss.getSheetByName(ABA_VIDEOS_CANAIS);
  if (!aba || aba.getLastRow() < 2) return [];
  var largura = Math.max(Math.min(aba.getLastColumn(), 4), 1);
  var out = [];
  aba.getRange(2, 1, aba.getLastRow() - 1, largura).getValues().forEach(function (l) {
    var entrada = String(l[0] || '').trim();
    if (!entrada) return;
    var tela = telaNoticiasDoCanal_(entrada, largura >= 4 ? l[3] : '');
    if (!tela) return;
    var id = null;
    try { id = resolverCanalYoutube_(entrada); } catch (e) { id = null; }
    out.push({ entrada: entrada, id: id, nome: nomeCurtoCanalNoticias_(entrada), tela: tela });
  });
  return out;
}

function lerAtivosNoticias_(ss) {
  var aba = ss.getSheetByName(ABA_AUXILIAR_ATIVOS_CLASSES);
  if (!aba || aba.getLastRow() < LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES) return [];
  var classe = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações EUA': 'acoesEua' };
  var vistos = {};
  var out = [];
  aba.getRange(LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES, 1, aba.getLastRow() - LINHA_DADOS_AUXILIAR_ATIVOS_CLASSES + 1, 8).getValues().forEach(function (l) {
    var c = classe[l[0]];
    var ticker = String(l[1] || '').trim().toUpperCase();
    if (!c || !ticker || vistos[ticker] || !(Number(l[7]) > 0)) return;
    vistos[ticker] = true;
    out.push({ ticker: ticker, classe: c, nome: String(l[2] || '').trim() || null });
  });
  return out;
}

function handleNoticiasConfig(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return jsonOut({ ok: true, canais: lerCanaisNoticias_(ss), ativos: lerAtivosNoticias_(ss) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'noticiasConfig', erro: String(erro) });
  }
}
