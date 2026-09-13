/**
 * Router.gs — os 2 pontos de entrada do Web App (doGet/doPost). Despacha
 * por "action" e devolve jsonOut(...). Autenticação (verificarToken) é
 * checada aqui, uma única vez, antes de despachar pra qualquer handler —
 * os handlers não checam token de novo.
 *
 * 13/09/2026: handleHome/handleHistoricoInicio/handleMeusAtivos recebem
 * "auth" (o resultado já validado aqui) em vez de chamar verificarToken()
 * de novo sozinhos — cada chamada de verificarToken é um fetch ao vivo
 * pro Google (tokeninfo), então checar 2x por request gastava um round-trip
 * externo à toa. Mesmo padrão que handlePing(auth) (Auth.gs) já usava.
 *
 * IMPORTANTE: depois de colar isso e salvar, o Web App só passa a
 * responder com o comportamento novo depois de uma NOVA VERSÃO de
 * implantação — Implantar → Gerenciar implantações → ✎ (editar) →
 * Versão: Nova versão → Implantar. Só salvar no editor não é suficiente.
 */

function doGet(e) {
  var action = e.parameter.action;

  var auth = verificarToken(e.parameter.token);
  if (!auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth.erro });
  }

  if (action === 'ping') {
    return handlePing(auth);
  }
  if (action === 'syncStatus') {
    return handleSyncStatus(e);
  }
  if (action === 'home') {
    return handleHome(e, auth);
  }
  if (action === 'historico_inicio') {
    return handleHistoricoInicio(e, auth);
  }
  if (action === 'meusAtivos') {
    return handleMeusAtivos(e, auth);
  }

  return jsonOut({ ok: false, erro: 'ação desconhecida: ' + action });
}

function doPost(e) {
  var action = e.parameter.action;

  var auth = verificarToken(e.parameter.token);
  if (!auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth.erro });
  }

  if (action === 'importarTransacoesB3') {
    return handleImportarTransacoesB3(e);
  }
  if (action === 'sincronizarAgora') {
    return handleSincronizarAgora(e);
  }

  return jsonOut({ ok: false, erro: 'ação desconhecida: ' + action });
}
