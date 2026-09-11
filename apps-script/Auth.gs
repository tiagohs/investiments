/**
 * Auth.gs — autenticação (Google Identity Services + verificação do
 * token direto com o Google) e o helper de resposta JSON, compartilhados
 * por todos os handlers do projeto (Router.gs, Sync.gs, ImportB3.gs).
 *
 * Single-user app: só aceita o e-mail configurado em AUTHORIZED_EMAIL —
 * não há gestão de múltiplos usuários.
 */

const AUTHORIZED_EMAIL = 'tiago.hsilva.prof@gmail.com';
const CLIENT_ID = '778662849882-rcbhu8btlamd3qs45pdgujtdbki20lmo.apps.googleusercontent.com';

/**
 * Confere o token de identidade do Google direto com o Google (endpoint
 * público tokeninfo) — sem biblioteca extra.
 */
function verificarToken(token) {
  if (!token) return { ok: false, erro: 'token ausente na chamada' };
  try {
    var resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    var payload = JSON.parse(resp.getContentText());
    if (payload.error) return { ok: false, erro: 'token inválido: ' + payload.error };
    if (payload.aud !== CLIENT_ID) return { ok: false, erro: 'client ID não confere (token de outro app?)' };
    if (payload.email !== AUTHORIZED_EMAIL) return { ok: false, erro: 'e-mail não autorizado: ' + payload.email };
    return { ok: true, email: payload.email };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handler de "ping" — confirma login + conexão com a planilha. Usado pelo
 * teste.html logo após o login Google, antes de liberar os outros cards.
 * Auth já foi checada pelo Router antes de chegar aqui.
 */
function handlePing(auth) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return jsonOut({ ok: true, autenticado_como: auth.email, planilha: ss.getName() });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}
