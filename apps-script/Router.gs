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
  // 05/10/2026 (A-33): leitura de GET é só leitura - a mesma faixa da mesma aba é lida 1 vez por execução (Planilha.gs)
  if (typeof ativarLeituraUnica_ === 'function') ativarLeituraUnica_();

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
  if (action === 'fundamentos') { // 03/10/2026: fundamentos já guardados de um ticker (Fundamentos.gs)
    return handleFundamentos(e, auth);
  }
  if (action === 'fiiPortfolio') { // 05/10/2026: aba Patrimônio do FII - imóveis, CRI e indexadores já guardados (PortfolioFii.gs)
    return handleFiiPortfolio(e, auth);
  }
  if (action === 'macro') { // 05/10/2026: contexto de mercado pras análises - juros, Tesouro, bolsa cara/barata (Macro.gs)
    return handleMacro(e, auth);
  }
  if (action === 'videos') { // 25/09/2026: vídeos do YouTube por ativo/carteira (Videos.gs)
    return handleVideos(e, auth);
  }
  if (action === 'transacoes') { // 26/09/2026: tela Transações - aportes + lançamentos (Aportes.gs)
    return handleTransacoes(e, auth);
  }
  if (action === 'aportesPendentes') { // 06/10/2026: aviso de aporte aguardando no header (Aportes.gs)
    return handleAportesPendentes(e, auth);
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
  if (action === 'patrimonio') { // 27/09/2026: Organização Financeira - aba Patrimônio (Patrimonio.gs)
    return handlePatrimonio(e, auth);
  }
  if (action === 'metas') { // 02/10/2026: tela Metas e Objetivos (Metas.gs)
    return handleMetas(e, auth);
  }
  if (action === 'metasHistorico') { // 03/10/2026: histórico mês a mês das metas (Metas.gs)
    return handleMetasHistorico(e, auth);
  }
  if (action === 'patrimonioIrArquivos') { // declarações do IR na pasta do Drive
    return handleIrArquivosPatrimonio(e, auth);
  }
  if (action === 'patrimonioIrArquivo') {
    return handleIrArquivoPatrimonio(e, auth);
  }
  if (action === 'holeritesArquivos') { // 05/10/2026: holerites em Documentos/Trabalho/<EMPRESA>/Holerite no Drive (Salario.gs)
    return handleHoleritesArquivos(e, auth);
  }
  if (action === 'holeriteArquivo') {
    return handleHoleriteArquivo(e, auth);
  }
  if (action === 'gastos') { // 02/10/2026: Organização Financeira - Gastos (Gastos.gs)
    return handleGastos(e, auth);
  }
  if (action === 'gastosArquivos') { // faturas/extratos em Documentos/Transações no Drive
    return handleArquivosGastos(e, auth);
  }
  if (action === 'gastosArquivo') {
    return handleArquivoGastos(e, auth);
  }
  if (action === 'intradia') { // 26/09/2026: gráfico do dia dos favoritos e dos índices (Intradia.gs)
    return handleIntradia(e);
  }
  if (action === 'consolidacao') { // 26/09/2026: aviso "Consolidação necessária" (Consolidacao.gs)
    return handleConsolidacaoStatus(e);
  }

  if (action === 'capacidade') { // 05/10/2026 (A-37): uso do cache e das células de JSON (CacheRespostas.gs)
    return handleCapacidade(e, auth);
  }

  return jsonOut({ ok: false, erro: 'ação desconhecida: ' + action });
}

/**
 * 05/10/2026 (A-36): TODO POST carimba a "última escrita" (Planilha.gs) antes e
 * depois de rodar a ação - as respostas cacheadas por versão (metas, gastos...)
 * trocam de chave sozinhas, sem cada handler lembrar de invalidar.
 */
function doPost(e) {
  _POST_AUTENTICADO_ = false;
  try {
    return doPostRotas_(e);
  } finally {
    if (_POST_AUTENTICADO_ && typeof registrarEscritaPlanilha_ === 'function') registrarEscritaPlanilha_();
  }
}

var _POST_AUTENTICADO_ = false;

function doPostRotas_(e) {
  var action = e.parameter.action;

  var auth = verificarToken(e.parameter.token);
  if (!auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth.erro });
  }
  _POST_AUTENTICADO_ = action !== 'criarSessao'; // só quem passou na autenticação carimba (antes e depois da ação); login não escreve na planilha
  if (_POST_AUTENTICADO_ && typeof registrarEscritaPlanilha_ === 'function') registrarEscritaPlanilha_();

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
  if (action === 'lancarAportesEua') { // 07/10/2026: "Lançar agora" - compra de Ações EUA de aporte concluído -> Transações - USA (Aportes.gs)
    return handleLancarAportesEua(e);
  }
  if (action === 'salvarCaixaDolar') { // 05/10/2026: tela Transações - caixa em dólar das Ações EUA (Aportes.gs)
    return handleSalvarCaixaDolar(e);
  }
  if (action === 'excluirCaixaDolar') {
    return handleExcluirCaixaDolar(e);
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
  if (action === 'salvarHoleriteDrive') { // 05/10/2026: importa 1 holerite lido do Drive + registra o arquivo (Salario.gs)
    return handleSalvarHoleriteDrive(e);
  }
  if (action === 'salvarDespesas') { // 26/09/2026: tela Organização Financeira (Despesas.gs)
    return handleSalvarDespesas(e);
  }
  if (action === 'salvarPatrimonio') { // 27/09/2026: Organização Financeira - aba Patrimônio (Patrimonio.gs)
    return handleSalvarPatrimonio(e);
  }
  if (action === 'salvarMeta') { // 02/10/2026: tela Metas e Objetivos (Metas.gs)
    return handleSalvarMeta(e);
  }
  if (action === 'excluirMeta') { // arquiva (não apaga)
    return handleExcluirMeta(e);
  }
  if (action === 'excluirMetaDefinitivo') { // 03/10/2026: apaga a linha de uma meta ARQUIVADA (Metas.gs)
    return handleExcluirMetaDefinitivo(e);
  }
  if (action === 'salvarImportacaoGastos') { // 02/10/2026: Organização Financeira - Gastos (Gastos.gs)
    return handleSalvarImportacaoGastos(e);
  }
  if (action === 'salvarRegraGastos') {
    return handleSalvarRegraGastos(e);
  }
  if (action === 'excluirArquivoGastos') {
    return handleExcluirArquivoGastos(e);
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
  if (action === 'fiiPortfolioCoords') { // 05/10/2026: coordenadas do mapa achadas no navegador (PortfolioFii.gs)
    return handleFiiPortfolioCoords(e);
  }
  if (action === 'sincronizarInformesFnet') { // 25/09/2026: botão "Informes dos FIIs" (FnetInformesFii.gs)
    return handleSincronizarInformesFnet(e);
  }
  if (action === 'atualizarFundamentos') { // 03/10/2026: busca os fundamentos agora (Fundamentos.gs)
    return handleAtualizarFundamentos(e);
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
