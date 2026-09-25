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
 * 25/09/2026 (Tiago: "o token tem expirado muito rápido"): o token de
 * identidade do Google vale só 1 hora (regra do Google, não dá pra mudar).
 * Agora ele só é usado UMA vez, no login: o site troca ele por uma sessão
 * nossa (action=criarSessao), assinada aqui com uma chave secreta que fica
 * só nas Propriedades do script, válida por SESSAO_DIAS dias. De quebra,
 * cada chamada deixa de consultar o Google (tokeninfo) - fica mais rápida.
 * Formato: s1.<dados em base64url>.<assinatura HMAC-SHA256 em base64url>.
 * Pra derrubar todas as sessões abertas (celular perdido, etc.), rode
 * encerrarTodasAsSessoesDireto() no editor - troca a chave secreta.
 */
var SESSAO_DIAS = 7;
var PROP_SEGREDO_SESSAO = 'SESSAO_SEGREDO';

function segredoSessao_() {
  var props = PropertiesService.getScriptProperties();
  var segredo = props.getProperty(PROP_SEGREDO_SESSAO);
  if (!segredo) {
    segredo = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(PROP_SEGREDO_SESSAO, segredo);
  }
  return segredo;
}

function base64UrlSemPadding_(valor) {
  return Utilities.base64EncodeWebSafe(valor).replace(/=+$/, '');
}

function assinaturaSessao_(dados) {
  return base64UrlSemPadding_(Utilities.computeHmacSha256Signature(dados, segredoSessao_()));
}

/** Cria a sessão de `email`: { token, exp } (exp em segundos, igual JWT). */
function criarTokenSessao_(email, agoraMs) {
  var agora = Math.floor((agoraMs || Date.now()) / 1000);
  var exp = agora + SESSAO_DIAS * 24 * 60 * 60;
  var dados = base64UrlSemPadding_(JSON.stringify({ email: email, iat: agora, exp: exp }));
  return { token: 's1.' + dados + '.' + assinaturaSessao_(dados), exp: exp };
}

/** Confere assinatura, validade e e-mail de uma sessão s1.* (sem chamar o Google). */
function verificarTokenSessao_(token, agoraMs) {
  var partes = String(token).split('.');
  if (partes.length !== 3 || partes[0] !== 's1') return { ok: false, erro: 'sessão inválida' };
  var esperada = assinaturaSessao_(partes[1]);
  // comparação sem sair no 1º caractere diferente
  var diferenca = esperada.length ^ partes[2].length;
  for (var i = 0; i < esperada.length; i++) diferenca |= esperada.charCodeAt(i) ^ (partes[2].charCodeAt(i) || 0);
  if (diferenca !== 0) return { ok: false, erro: 'sessão inválida (assinatura)' };
  var payload;
  try {
    var b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString('UTF-8'));
  } catch (e) {
    return { ok: false, erro: 'sessão inválida' };
  }
  if (!(payload.exp * 1000 > (agoraMs || Date.now()))) return { ok: false, erro: 'sessão expirada' };
  if (payload.email !== AUTHORIZED_EMAIL) return { ok: false, erro: 'e-mail não autorizado: ' + payload.email };
  return { ok: true, email: payload.email, tipo: 'sessao' };
}

/**
 * action=criarSessao (doPost): troca o token do Google (1 hora), já
 * conferido pelo Router, por uma sessão de SESSAO_DIAS dias. Só aceita o
 * token do Google - uma sessão não renova a si mesma (depois de
 * SESSAO_DIAS dias, login de novo).
 */
function handleCriarSessao(auth) {
  if (!auth || !auth.ok || auth.tipo !== 'google') {
    return jsonOut({ ok: false, etapa: 'sessão', erro: 'a sessão só é criada a partir do login do Google' });
  }
  var sessao = criarTokenSessao_(auth.email);
  return jsonOut({ ok: true, token: sessao.token, exp: sessao.exp, dias: SESSAO_DIAS });
}

/** Rode no editor pra derrubar TODAS as sessões abertas (troca a chave secreta). */
function encerrarTodasAsSessoesDireto() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_SEGREDO_SESSAO);
  segredoSessao_();
  Logger.log('Pronto: todas as sessões foram encerradas - faça login de novo em cada aparelho.');
}

/**
 * Confere o token de cada chamada: uma sessão nossa (s1.*, ver acima) ou,
 * no login, o token de identidade do Google direto com o Google (endpoint
 * público tokeninfo) — sem biblioteca extra.
 */
function verificarToken(token) {
  if (!token) return { ok: false, erro: 'token ausente na chamada' };
  if (String(token).indexOf('s1.') === 0) {
    try { return verificarTokenSessao_(token); } catch (errSessao) { return { ok: false, erro: String(errSessao) }; }
  }
  try {
    var resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    var payload = JSON.parse(resp.getContentText());
    if (payload.error) return { ok: false, erro: 'token inválido: ' + payload.error };
    if (payload.aud !== CLIENT_ID) return { ok: false, erro: 'client ID não confere (token de outro app?)' };
    if (payload.email !== AUTHORIZED_EMAIL) return { ok: false, erro: 'e-mail não autorizado: ' + payload.email };
    return { ok: true, email: payload.email, tipo: 'google' };
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
