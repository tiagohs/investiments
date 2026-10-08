/**
 * Auth.gs — autenticação (Google Identity Services + verificação do
 * token direto com o Google) e o helper de resposta JSON, compartilhados
 * por todos os handlers do projeto (Router.gs, Sync.gs, ImportB3.gs).
 *
 * Só aceita os e-mails guardados na propriedade EMAIL_AUTORIZADO do script (PropertiesService).
 * 08/10/2026 (Tiago: "quero adicionar mais um usuário, com outro gmail... todos os funcionamentos"): a
 * propriedade aceita uma LISTA (separada por vírgula) - todos veem e mexem nos MESMOS dados (o app roda
 * como o dono). autorizarOutroEmailDireto / removerEmailAutorizadoDireto / listarEmailsAutorizadosDireto.
 *
 * 06/10/2026 (A-27): o e-mail saiu do código (repositório público). Rode
 * configurarEmailAutorizado() UMA vez no editor ANTES de implantar esta versão
 * (sem parâmetro, grava o e-mail de quem está rodando o script).
 */

var PROP_EMAIL_AUTORIZADO = 'EMAIL_AUTORIZADO';
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

/** E-mails autorizados (propriedade EMAIL_AUTORIZADO, separados por vírgula), minúsculos e sem repetição; [] se nada configurado. */
function emailsAutorizados_() {
  var bruto = String(PropertiesService.getScriptProperties().getProperty(PROP_EMAIL_AUTORIZADO) || '');
  var out = [];
  bruto.split(/[,;\s]+/).forEach(function (e) { e = e.trim().toLowerCase(); if (e && out.indexOf(e) === -1) out.push(e); });
  return out;
}

/** O 1º e-mail autorizado (o dono); '' se ainda não configurado. */
function emailAutorizado_() {
  return emailsAutorizados_()[0] || '';
}

/** Confere `email` contra a lista; sem e-mail configurado, NINGUÉM entra (falha fechada). */
function emailConfere_(email) {
  var e = String(email || '').trim().toLowerCase();
  return !!e && emailsAutorizados_().indexOf(e) !== -1;
}

function validarEmail_(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(e)) throw new Error('E-mail inválido: "' + email + '"');
  return e;
}

/**
 * Rode no editor: dá acesso ao site a mais uma conta Google (`email`). Ela entra com "Fazer login com o Google" e vê/mexe
 * nos MESMOS dados que você (a planilha é a sua). Se o login do Google estiver em modo "Em teste", adicione o e-mail também
 * como usuário de teste (docs/historico-projeto.md, 08/10/2026).
 */
function autorizarOutroEmailDireto(email) {
  // 08/10/2026: o botão "Executar" do editor chama a função SEM parâmetro - diz o que fazer em vez de "E-mail inválido: undefined"
  if (!email) throw new Error('Falta o e-mail. O botão Executar não passa parâmetro: crie uma função com a linha autorizarOutroEmailDireto("conta@exemplo.com") e rode ela, ou edite em Configurações do projeto › Propriedades do script a EMAIL_AUTORIZADO (e-mails separados por vírgula, o seu primeiro).');
  var e = validarEmail_(email);
  var lista = emailsAutorizados_();
  if (!lista.length) throw new Error('Nenhum e-mail configurado ainda: rode configurarEmailAutorizado() primeiro (o seu).');
  if (lista.indexOf(e) === -1) lista.push(e);
  PropertiesService.getScriptProperties().setProperty(PROP_EMAIL_AUTORIZADO, lista.join(','));
  Logger.log('E-mails autorizados: ' + lista.join(', '));
  return lista;
}

/** Rode no editor: tira o acesso de `email` (as sessões abertas dele param de valer na hora). O dono (1º da lista) não sai. */
function removerEmailAutorizadoDireto(email) {
  var e = validarEmail_(email);
  var lista = emailsAutorizados_();
  if (lista[0] === e) throw new Error('Esse é o e-mail do dono (o 1º da lista) - não removo.');
  lista = lista.filter(function (x) { return x !== e; });
  PropertiesService.getScriptProperties().setProperty(PROP_EMAIL_AUTORIZADO, lista.join(','));
  Logger.log('E-mails autorizados: ' + lista.join(', '));
  return lista;
}

function listarEmailsAutorizadosDireto() {
  var lista = emailsAutorizados_();
  Logger.log(lista.length ? 'E-mails autorizados: ' + lista.join(', ') : 'Nenhum e-mail autorizado (ninguém entra).');
  return lista;
}

/**
 * Função de editor (rodar 1x ANTES de implantar o Auth.gs novo): grava o e-mail
 * autorizado nas propriedades do script. Sem parâmetro usa o e-mail de quem
 * executa (Session.getEffectiveUser()); como o app roda "como o dono", é o seu.
 */
function configurarEmailAutorizado(email) {
  var e = String(email || Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!e || e.indexOf('@') < 1) throw new Error('Não consegui descobrir o e-mail: chame configurarEmailAutorizado("seu@email.com").');
  // 08/10/2026: troca só o DONO (1º da lista); os outros e-mails autorizados continuam
  var outros = emailsAutorizados_().slice(1).filter(function (x) { return x !== e; });
  PropertiesService.getScriptProperties().setProperty(PROP_EMAIL_AUTORIZADO, [e].concat(outros).join(','));
  Logger.log('E-mail autorizado gravado: ' + e + (outros.length ? ' (+ ' + outros.join(', ') + ')' : '') + ' — agora pode implantar a nova versão.');
}

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
  if (!emailConfere_(payload.email)) return { ok: false, erro: 'e-mail não autorizado: ' + payload.email };
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
    if (!emailConfere_(payload.email)) return { ok: false, erro: 'e-mail não autorizado: ' + payload.email };
    return { ok: true, email: payload.email, tipo: 'google' };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

/**
 * 08/10/2026 (Etapa 0): estado da requisição atual, preenchido por Router.gs!doGet/doPost - quando começou (pro `_ms`) e
 * a "impressão digital" (etag) da resposta que o navegador já tem (GET).
 */
var _REQ_ = null;

function iniciarRequisicao_(e, metodo) {
  _REQ_ = { inicio: Date.now(), metodo: metodo, etag: String((e && e.parameter && e.parameter.etag) || '') };
}

/** MD5 da resposta em base64url (impressão digital do conteúdo); '' se o ambiente não tiver o Utilities. */
function etagDoTexto_(texto) {
  try {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8);
    return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  } catch (e) { return ''; }
}

/**
 * Resposta JSON. 08/10/2026 (Etapa 0 - medir e não reenviar o que o navegador já tem):
 *  - toda resposta ganha `_ms` (tempo do servidor nesta execução) - o site mostra em "Desempenho";
 *  - GET com ok: ganha `_etag` (impressão digital do CONTEÚDO). Se o navegador mandou a mesma etag (já tem exatamente
 *    esse conteúdo), volta só { ok, naoMudou: true } em vez de reenviar tudo (a Início tem ~1,8 MB). Pela impressão do
 *    conteúdo, não por pista: nunca devolve "não mudou" quando mudou.
 */
function jsonOut(obj) {
  var texto = JSON.stringify(obj);
  var ms = _REQ_ ? Date.now() - _REQ_.inicio : null;
  if (_REQ_ && _REQ_.metodo === 'GET' && obj && obj.ok === true && texto.length > 2 && texto.charAt(texto.length - 1) === '}') {
    var etag = etagDoTexto_(texto);
    if (etag && _REQ_.etag && etag === _REQ_.etag) {
      texto = JSON.stringify({ ok: true, naoMudou: true, _etag: etag, _ms: ms });
    } else if (etag) {
      texto = texto.slice(0, -1) + ',"_etag":"' + etag + '","_ms":' + ms + '}';
    }
  } else if (ms !== null && obj && typeof obj === 'object' && !Array.isArray(obj) && texto.charAt(texto.length - 1) === '}' && texto.length > 2) {
    texto = texto.slice(0, -1) + ',"_ms":' + ms + '}';
  }
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handler de "ping" — confirma login + conexão com a planilha. Usado pelo
 * tests/manual/teste.html logo após o login Google, antes de liberar os outros cards.
 * Auth já foi checada pelo Router antes de chegar aqui.
 */
function handlePing(auth) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // 07/10/2026: versão do código que a IMPLANTAÇÃO está rodando (o editor roda o código salvo; o site, a versão implantada) -
    // pra conferir pelo navegador se a nova versão foi mesmo implantada na URL que o site usa
    var versao = {
      codigo: typeof VERSAO_CODIGO_CACHE_ !== 'undefined' ? VERSAO_CODIGO_CACHE_ : null,
      serieInicio: typeof montarChaveCacheSerie_ === 'function' ? String(montarChaveCacheSerie_(0, 0, 0, 0)).split('_').slice(0, 3).join('_') : null
    };
    return jsonOut({ ok: true, autenticado_como: auth.email, planilha: ss.getName(), planilhaUrl: ss.getUrl(), versao: versao });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * 08/10/2026 (Tiago: "Você não tem permissão para chamar SpreadsheetApp.getActiveSpreadsheet" - vez ou outra, e ele tinha
 * que achar uma função pra rodar): rode no editor quando o site mostrar "O Apps Script perdeu a autorização do Google".
 * Usa uma vez cada serviço que o projeto usa (planilha, Drive só leitura, internet, gatilhos, e-mail, seu e-mail), então
 * o Google pede TODAS as permissões numa tela só. Não grava nada.
 * Por que acontece: o Apps Script calcula as permissões pelo código; colar um arquivo que usa um serviço novo muda esse
 * conjunto e a autorização anterior deixa de valer pra implantação até alguém aceitar de novo. Com "oauthScopes" fixo no
 * appsscript.json (docs/historico-projeto.md, 08/10/2026), colar código não muda mais o conjunto.
 */
function autorizarProjetoDireto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ok = ['Planilha: ' + ss.getName()];
  ok.push('Drive: ' + DriveApp.getRootFolder().getName());
  ok.push('Internet: ' + UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true }).getResponseCode());
  ok.push('Gatilhos: ' + ScriptApp.getProjectTriggers().length);
  ok.push('E-mail (cota do dia): ' + MailApp.getRemainingDailyQuota());
  ok.push('Conta: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Autorização OK - ' + ok.join(' | '));
  return ok;
}
