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
  if (action === 'syncHistorico') {
    return handleSyncHistorico(e);
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
  if (action === 'distribuicoesMetas') {
    return handleDistribuicoesMetas(e, auth);
  }
  if (action === 'historicoAtivo') {
    return handleHistoricoAtivo(e, auth);
  }
  if (action === 'irRendaFixa') {
    return handleIRRendaFixa(e, auth);
  }
  if (action === 'proventos') { // 24/09/2026: tela Proventos (Proventos.gs)
    return handleProventos(e, auth);
  }
  if (action === 'carteirasHome') {
    return handleCarteirasHome(e, auth);
  }
  if (action === 'carteirasAcoes') {
    return handleCarteirasAcoes(e, auth);
  }
  if (action === 'carteirasFiis') {
    return handleCarteirasFiis(e, auth);
  }
  if (action === 'carteirasAcoesEua') {
    return handleCarteirasAcoesEua(e, auth);
  }
  if (action === 'carteirasRendaFixa') {
    return handleCarteirasRendaFixa(e, auth);
  }
  if (action === 'ativo') { // 25/09/2026: tela Detalhe do ativo (Ativo.gs)
    return handleAtivo(e, auth);
  }
  if (action === 'noticiasAtivo') { // 25/09/2026: notícias do ativo (Ativo.gs)
    return handleNoticiasAtivo(e, auth);
  }
  if (action === 'tesesAtivo') { // 25/09/2026: teses no Google Drive (Ativo.gs)
    return handleTesesAtivo(e, auth);
  }

  return jsonOut({ ok: false, erro: 'ação desconhecida: ' + action });
}

function doPost(e) {
  var action = e.parameter.action;

  var auth = verificarToken(e.parameter.token);
  if (!auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth.erro });
  }

  if (action === 'criarSessao') { // 25/09/2026: login do Google (1h) -> sessão de vários dias (Auth.gs)
    return handleCriarSessao(auth);
  }
  if (action === 'importarTransacoesB3') {
    return handleImportarTransacoesB3(e);
  }
  if (action === 'importarProventosB3') { // 24/09/2026: tela Proventos (Proventos.gs)
    return handleImportarProventosB3(e);
  }
  if (action === 'sincronizarAgora') {
    return handleSincronizarAgora(e);
  }
  if (action === 'sincronizarRendaFixaEIndices') {
    return handleSincronizarRendaFixaEIndices(e);
  }
  if (action === 'limparCacheHistorico') {
    return handleLimparCacheHistorico(e);
  }
  if (action === 'salvarMetaRendaPassiva') {
    return handleSalvarMetaRendaPassiva(e);
  }
  if (action === 'salvarMetaPatrimonio') {
    return handleSalvarMetaPatrimonio(e);
  }
  if (action === 'salvarMesesRendaEmergencial') {
    return handleSalvarMesesRendaEmergencial(e);
  }
  if (action === 'salvarObjetivosCarteira') {
    return handleSalvarObjetivosCarteira(e);
  }
  if (action === 'salvarRadarItem') {
    return handleSalvarRadarItem(e);
  }
  if (action === 'salvarSplitInterno') {
    return handleSalvarSplitInterno(e);
  }
  if (action === 'salvarFavoritos') {
    return handleSalvarFavoritos(e); // Favoritos.gs (23/09/2026)
  }

  return jsonOut({ ok: false, erro: 'ação desconhecida: ' + action });
}
