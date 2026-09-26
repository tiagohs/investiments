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
  if (action === 'videos') { // 25/09/2026: vídeos do YouTube por ativo/carteira (Videos.gs)
    return handleVideos(e, auth);
  }
  if (action === 'transacoes') { // 26/09/2026: tela Transações - aportes + lançamentos (Aportes.gs)
    return handleTransacoes(e, auth);
  }
  if (action === 'infoNovoAtivo') { // 26/09/2026: Carteiras - adicionar ativo (NovoAtivo.gs)
    return handleInfoNovoAtivo(e, auth);
  }
  if (action === 'salario') { // 26/09/2026: Organização Financeira - aba Salário (Salario.gs)
    return handleSalario(e, auth);
  }
  if (action === 'despesas') { // 26/09/2026: tela Organização Financeira (Despesas.gs)
    return handleDespesas(e, auth);
  }
  if (action === 'intradia') { // 26/09/2026: gráfico do dia dos favoritos e dos índices (Intradia.gs)
    return handleIntradia(e);
  }
  if (action === 'consolidacao') { // 26/09/2026: aviso "Consolidação necessária" (Consolidacao.gs)
    return handleConsolidacaoStatus(e);
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
  if (action === 'salvarAporte') { // 26/09/2026: tela Transações - carrinho de aportes (Aportes.gs)
    return handleSalvarAporte(e);
  }
  if (action === 'excluirAporte') {
    return handleExcluirAporte(e);
  }
  if (action === 'importarLancamentos') { // 26/09/2026: tela Transações - extratos B3/IBKR (Lancamentos.gs)
    return handleImportarLancamentos(e);
  }
  if (action === 'adicionarAtivo') { // 26/09/2026: Carteiras - adicionar ativo (NovoAtivo.gs)
    return handleAdicionarAtivo(e);
  }
  if (action === 'salvarSalarioBase') { // 26/09/2026: Organização Financeira - aba Salário (Salario.gs)
    return handleSalvarSalarioBase(e);
  }
  if (action === 'salvarPagamentoSalario') {
    return handleSalvarPagamentoSalario(e);
  }
  if (action === 'excluirPagamentoSalario') {
    return handleExcluirPagamentoSalario(e);
  }
  if (action === 'salvarDespesas') { // 26/09/2026: tela Organização Financeira (Despesas.gs)
    return handleSalvarDespesas(e);
  }
  if (action === 'removerAtivo') {
    return handleRemoverAtivo(e);
  }
  if (action === 'consolidar') { // 26/09/2026: botão "Consolidar agora" (Consolidacao.gs)
    return handleConsolidar(e);
  }
  if (action === 'sincronizarAgora') {
    return handleSincronizarAgora(e);
  }
  if (action === 'sincronizarRendaFixaEIndices') {
    return handleSincronizarRendaFixaEIndices(e);
  }
  if (action === 'sincronizarProventosFnet') { // 25/09/2026: botão "Proventos (FNet)" (FnetProventos.gs)
    return handleSincronizarProventosFnet(e);
  }
  if (action === 'sincronizarVideos') { // 25/09/2026: botão "Vídeos" (Videos.gs)
    return handleSincronizarVideos(e);
  }
  if (action === 'sincronizarInformesFnet') { // 25/09/2026: botão "Informes dos FIIs" (FnetInformesFii.gs)
    return handleSincronizarInformesFnet(e);
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
