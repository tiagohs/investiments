/**
 * Metas.gs - 02/10/2026: tela "Metas e Objetivos" (metas.html).
 *
 * Tiago: "novo menu principal Metas e Objetivos, v1 funcional já" - lista de
 * metas com fluxo de criação; cada tipo (renda passiva, viagem, casa, carro,
 * reserva de emergência, aposentadoria e os de "acúmulo até uma data") tem os
 * seus campos; sub-itens de custo; multimoeda (o restante sempre em reais);
 * investimentos vinculados ("esse CDI em tal instituição é dessa meta"), com o
 * progresso andando sozinho pelo valor atual deles; simulador de prazo.
 *
 * 03/10/2026 (Metas v2 - Tiago: "traga detalhes dos investimentos ou qualquer
 * coisa do tipo que estou usando na meta. Gráfico de histórico (como fui
 * chegando aos poucos ao valor atual)"; "posso deixar o dinheiro guardado na
 * conta corrente de algum lugar [...] guardo meu dinheiro em euro na conta
 * corrente da Wise"; "o IDEAL é o valor final ser o valor líquido (se eu
 * sacar a renda emergencial total hoje, eu teria que pagar IR)"; "me diga
 * como excluí-las para eu iniciar do zero"):
 *   - vínculo novo "saldo" (Saldo em conta: instituição, moeda, saldo, data
 *     da atualização) - o histórico das atualizações fica dentro do próprio
 *     vínculo (cada salvamento com saldo diferente acrescenta 1 ponto);
 *   - cada título de Renda Fixa sai com `irResgate` (IR + IOF se resgatasse
 *     hoje - o MESMO cálculo da Carteira Renda Fixa, RendaFixaIR.gs, mais o
 *     IOF dos primeiros 30 dias), pra tela mostrar bruto x líquido;
 *   - GET action=metasHistorico: o valor de cada meta mês a mês, reconstruído
 *     pelo histórico dos ativos vinculados (aux_historico-patrimonio,
 *     aux_historico-renda-fixa, série da Início por classe), com o aporte
 *     líquido de cada mês (compras - vendas) - daí sai o "aporte real" (média
 *     dos últimos 12 meses fechados) - e, na renda passiva, os proventos mês
 *     a mês. O resumo (aporte médio) fica 6h no cache e vai junto no GET
 *     action=metas (`historicoResumo`), pra as outras telas também usarem;
 *   - POST action=excluirMetaDefinitivo: apaga a linha de uma meta que JÁ
 *     está arquivada (arquivar continua sendo o "excluir" com volta).
 *
 * Onde mora cada coisa:
 *   'aux_metas'   Id | Meta (JSON) | Atualizado em      (1 linha por meta)
 *       criada no 1º salvamento. Excluir = marcar "arquivada"; só a exclusão
 *       definitiva (de uma arquivada) apaga a linha.
 *   Lidos de outras telas (nada é recalculado aqui):
 *     montarMeusAtivos_ (MeusAtivos.gs)     valor de hoje de cada ativo - o
 *         mesmo que a Início/Carteiras mostram (RV = preço x quantidade, EUA
 *         pelo dólar da planilha; Renda Fixa = Valor Atualizado, com a marca
 *         "Renda Emergencial" da Carteira Renda Fixa).
 *     montarIRRendaFixa_ (RendaFixaIR.gs)   IR se resgatasse hoje, por título.
 *     lerDespesasOrganizacao_ (Despesas.gs) custo de vida e a reserva da
 *         Distribuição e Metas (meses, sobra, meta, atual) e o cálculo do
 *         patrimônio desejado (K18 extra, L18 % reinvestimento, M18 rendimento,
 *         M19 renda desejada, N18 patrimônio desejado).
 *     montarTelaProventosComCache_ + mediaRendaPassiva12Meses_ (Proventos.gs)
 *         a média de renda passiva dos 12 meses fechados - a MESMA da
 *         Distribuição e Metas - e o total de 12 meses por ticker.
 *     montarMetasCarteira_ (DistribuicoesMetas.gs) a meta mensal de renda
 *         passiva da planilha (U12), só como sugestão.
 *     montarSerieHistoricoInicio_ (HistoricoInicio.gs, em cache) valor e
 *         aporte (fluxoAplicado*) diários por classe/marca, e o CDI.
 *   Câmbio: AwesomeAPI (economia.awesomeapi.com.br, sem chave) e, se ela
 *     falhar ou estourar a cota, a PTAX do Banco Central (olinda.bcb.gov.br);
 *     em último caso o dólar da planilha / o euro da Auxiliar_app. Cache de 6h.
 *
 * A conta de cada meta (alvo, quanto falta, aporte necessário, prazo,
 * status) é feita no navegador (assets/js/pages/metas-calc.js), que também
 * serve o simulador e a prévia do fluxo de criação. Aqui só sai o que vem da
 * planilha: as metas, os ativos com valor, o câmbio, as referências e - por
 * meta - o valor resolvido dos investimentos vinculados (progresso.valorVinculado,
 * mesma regra de metas-calc.js!resolverVinculos).
 *
 * GET  action=metas                       { metas, arquivadas, ativos, cambio, referencias, proventos12m, historicoResumo?, avisos? }
 * GET  action=metasHistorico [id]         { hoje, metas: { id: { meses, renda?, aporteMedio, ... } }, indices }
 * POST action=salvarMeta   meta (JSON)    cria (sem id) ou substitui (com id)
 * POST action=excluirMeta  id [, restaurar=1]   arquiva (ou desarquiva)
 * POST action=excluirMetaDefinitivo  id   apaga a linha (só meta arquivada)
 *
 * Depois de colar: NOVA VERSÃO da implantação (Router.gs ganhou as ações).
 *
 * 04/10/2026 (Metas › Viagem - Tiago: "Inclua link com o Wanderlog"; "meu 13º
 * (90%) e meu FGTS Aniversário (90% do que eu receber) vou colocar pra
 * guardar [...] o aporte mensal necessário tem que levar isso em
 * consideração"; "Está dizendo que o CHF está sem a cotação, mas incluí ela
 * na aba 'Bolsa USA >>>': D8 é a cotação do Dólar, D9 Libra, D10 Franco
 * Suíço e D11 Euro [...] se puder variar para todas as moedas, ótimo";
 * "Incluir a taxa diária de turismo"; "compras no cartão de crédito já
 * feitas (passagens, hotéis) não devem ser incluídas na conta de aportes";
 * "Inclua dropdown de Países e Cidades, bandeiras"):
 *   - meta.links [{ rotulo, url }] (qualquer meta) e especificos.roteiroUrl
 *     (viagem: o roteiro no Wanderlog) - só http(s);
 *   - meta.entradas (qualquer meta): entradas programadas (13º, saque-
 *     aniversário do FGTS, PLR/bônus, outra) com % destinado, valor/mês
 *     opcionais (vazio = o navegador estima pelo salário e pelo FGTS) e
 *     recorrência. Pra estimar, o GET metas leva referencias.salario
 *     (Distribuição e Metas N11 + pagamentos da aba Salário - Salario.gs) e
 *     referencias.fgts (aux_patrimonio: contas do FGTS e nascimento -
 *     Patrimonio.gs), só leitura;
 *   - viagem: destino com paisCodigo (ISO-2) e taxa turística (por pessoa por
 *     noite, moeda local); itens fixos com forma ('cartao' = já comprado no
 *     cartão, conta como pago e fica fora do aporte; 'pago'; 'juntar' = ainda
 *     não pago, entra no dinheiro a juntar), cartão e "confirmado";
 *   - câmbio: 1º a aba "Bolsa USA >>>" (D8:D11 - conferida pela fórmula
 *     GOOGLEFINANCE("XXXBRL") da célula ou pelo rótulo ao lado, e por faixa de
 *     valor plausível), 2º a aba aux_cambio (criada sob demanda: uma linha
 *     por moeda com =GOOGLEFINANCE("CURRENCY:XXXBRL")), depois AwesomeAPI/PTAX
 *     e, por último, o dólar/euro antigos da planilha. Cada cotação sai com a
 *     origem e a data.
 */

var METAS_ABA_ = 'aux_metas';
var METAS_MAX_JSON_ = 49000;
var METAS_CACHE_CAMBIO_ = 'metas_cambio_v1';
var METAS_CAMBIO_SEGUNDOS_ = 6 * 60 * 60;
var METAS_TIPOS_ = ['rendaPassiva', 'viagemInternacional', 'viagemNacional', 'casa', 'carro', 'reservaEmergencia', 'aposentadoria', 'acumulo', 'distribuicaoCarteira'];
var METAS_CATEGORIAS_ = ['projetos', 'educacao', 'equipamentos', 'empreendedorismo', 'hobbies', 'pets', 'eventos', 'assinaturas', 'saude', 'mudancaPais', 'casamento', 'veiculosLazer', 'outros'];
// 04/10/2026: todas as moedas dos países de assets/data/paises.json (a moeda padrão de cada destino)
var METAS_MOEDAS_ = ['BRL', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY',
  'AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BSD', 'BTN', 'BWP', 'BYN',
  'BZD', 'CDF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'FJD', 'GEL', 'GHS', 'GIP',
  'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'KES', 'KGS', 'KHR', 'KMF',
  'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR',
  'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON',
  'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND',
  'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'UYU', 'UZS', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XOF', 'XPF', 'YER', 'ZAR', 'ZMW'];
var METAS_ABA_CAMBIO_ = 'aux_cambio';
var METAS_ABA_BOLSA_USA_ = 'Bolsa USA >>>';
var METAS_ABA_DM_ = 'Distribuição e Metas'; // 06/10/2026: onde a meta salva no site sobrescreve a planilha (celulasPlanilhaDaMeta_)
/** Faixa plausível (reais por 1 unidade) pra conferir a cotação lida da aba Bolsa USA >>>. */
var METAS_FAIXA_CAMBIO_ = { USD: [2, 15], EUR: [2, 16], GBP: [3, 18], CHF: [2, 16] };
/** Posição de cada moeda na aba Bolsa USA >>> (o Tiago: D8 dólar, D9 libra, D10 franco, D11 euro). */
var METAS_CELULAS_BOLSA_USA_ = { 8: 'USD', 9: 'GBP', 10: 'CHF', 11: 'EUR' };
var METAS_AVISOS_IGNORAVEIS_ = ['sobreposicao'];
var METAS_TIPOS_ENTRADA_ = ['decimo13', 'fgts', 'plr', 'outra'];
var METAS_DINHEIRO_MAX_ = 1e10;
var METAS_CACHE_HIST_RESUMO_ = 'metas_hist_resumo_v1';
var METAS_MAX_HIST_SALDO_ = 120; // pontos de histórico guardados por "Saldo em conta"

function handleMetasHistorico(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var p = (e && e.parameter) || {};
    var r = montarHistoricoMetas_(SpreadsheetApp.getActiveSpreadsheet(), new Date(), { id: p.id || null });
    r.ok = true;
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'metasHistorico', erro: String(erro && erro.message ? erro.message : erro) });
  }
}

function handleExcluirMetaDefinitivo(e) {
  var trava = travaRecurso_('metas', 'salvar metas');
  try { trava.waitLock(20000); } catch (eL) { return jsonOut({ ok: false, etapa: 'metas', erro: 'planilha ocupada, tente de novo em alguns segundos' }); }
  try {
    var p = (e && e.parameter) || {};
    return jsonOut(excluirMetaDefinitivo_(SpreadsheetApp.getActiveSpreadsheet(), p.id));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'metas', erro: String(erro && erro.message ? erro.message : erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

/** Pra conferir no editor: o histórico mês a mês de todas as metas. */
function testarHistoricoMetasDireto() {
  Logger.log(JSON.stringify(montarHistoricoMetas_(SpreadsheetApp.getActiveSpreadsheet(), new Date()), null, 2));
}

/**
 * 03/10/2026 (Tiago: "Eu acabei criando umas metas de aposentadoria; me diga
 * como excluí-las para eu iniciar do zero"): rodar 1x no editor apaga de vez
 * TODAS as metas arquivadas (a tela também faz uma a uma, no filtro
 * "Arquivadas" -> "Excluir definitivamente").
 */
function excluirMetasArquivadasDefinitivamente() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ids = lerMetas_(ss, { arquivadas: true }).map(function (m) { return m.id; });
  ids.forEach(function (id) { excluirMetaDefinitivo_(ss, id); });
  Logger.log('metas arquivadas apagadas: ' + ids.length);
}

function handleMetas(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    var r = montarTelaMetasComCache_(SpreadsheetApp.getActiveSpreadsheet(), new Date());
    r.ok = true;
    return jsonOut(r);
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'metas', erro: String(erro) });
  }
}

/**
 * 05/10/2026 (A-36): a RESPOSTA pronta de `metas` fica no CacheService (em
 * pedaços), com chave = dia + carimbo da última escrita (todo POST carimba -
 * Router.gs - e as importações/"Limpar cache" também) + proventos (versão e
 * contagens) + tamanho das abas aux_metas/Auxiliar_ativos. A resposta traz o
 * valor de hoje de cada ativo (cotação da planilha, que muda durante o pregão),
 * por isso o TTL é curto (METAS_RESPOSTA_SEGUNDOS_): a tela nunca fica mais que
 * isso atrás da planilha, e as 5 telas que pedem `metas` (Distribuições,
 * Carteiras, Ativo, Transações, Metas) na mesma sessão pagam o cálculo uma vez.
 * O pré-aquecimento da Agenda (preAquecerMetasEMacro_) enche as peças lentas
 * (proventos, câmbio, macro) que esta montagem reaproveita.
 */
var METAS_RESPOSTA_SEGUNDOS_ = 10 * 60;

function chaveCacheRespostaMetas_(ss, agora) {
  var linhas = function (nome) { var aba = ss.getSheetByName(nome); return aba ? aba.getLastRow() : 0; };
  var versaoProv = '0';
  try { versaoProv = PropertiesService.getScriptProperties().getProperty(PROP_VERSAO_CACHE_PROVENTOS) || '0'; } catch (e) { /* sem versão */ }
  return 'metas_resp_v1_' + isoDiaMeta_(agora || new Date()) + '_' + (typeof carimboEscritaPlanilha_ === 'function' ? carimboEscritaPlanilha_() : '0') + '_' + versaoProv + '_' +
    [METAS_ABA_, 'Auxiliar_ativos'].map(linhas).join('_');
}

/**
 * 06/10/2026: só no cache miss - (1) a meta "Distribuição da carteira" nasce dos % da planilha na 1ª leitura (DistribuicoesMetas.gs,
 * idempotente) e (2) a resposta leva `distribuicaoAtual` (R$ por tipo, como a planilha calcula). Resposta quente não lê a planilha.
 */
function montarTelaMetasComDistribuicao_(ss, agora) {
  try { if (typeof garantirMetaDistribuicao_ === 'function') garantirMetaDistribuicao_(ss, agora); } catch (eDist) { console.log('garantirMetaDistribuicao_: ' + eDist); }
  var r = montarTelaMetas_(ss, agora);
  try { if (typeof montarDistribuicaoAtual_ === 'function') r.distribuicaoAtual = montarDistribuicaoAtual_(); } catch (eDA) { console.log('montarDistribuicaoAtual_: ' + eDA); }
  return r;
}

function montarTelaMetasComCache_(ss, agora) {
  var chave = null;
  try { chave = chaveCacheRespostaMetas_(ss, agora); } catch (eK) { chave = null; }
  if (!chave || typeof cacheDeResposta_ !== 'function') return montarTelaMetasComDistribuicao_(ss, agora);
  return cacheDeResposta_('metas_resposta', chave, METAS_RESPOSTA_SEGUNDOS_, function () { return montarTelaMetasComDistribuicao_(ss, agora); });
}

function handleSalvarMeta(e) {
  var trava = travaRecurso_('metas', 'salvar metas');
  try { trava.waitLock(20000); } catch (eL) { return jsonOut({ ok: false, etapa: 'metas', erro: 'planilha ocupada, tente de novo em alguns segundos' }); }
  try {
    var p = (e && e.parameter) || {};
    return jsonOut(salvarMeta_(SpreadsheetApp.getActiveSpreadsheet(), p.meta, new Date()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'metas', erro: String(erro && erro.message ? erro.message : erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

function handleExcluirMeta(e) {
  var trava = travaRecurso_('metas', 'salvar metas');
  try { trava.waitLock(20000); } catch (eL) { return jsonOut({ ok: false, etapa: 'metas', erro: 'planilha ocupada, tente de novo em alguns segundos' }); }
  try {
    var p = (e && e.parameter) || {};
    return jsonOut(arquivarMeta_(SpreadsheetApp.getActiveSpreadsheet(), p.id, p.restaurar === '1' || p.restaurar === 'true', new Date()));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'metas', erro: String(erro && erro.message ? erro.message : erro) });
  } finally {
    try { trava.releaseLock(); } catch (eR) { /* ok */ }
  }
}

/** Pra conferir no editor: Logger com o que a tela recebe. */
function testarMetasDireto() {
  Logger.log(JSON.stringify(montarTelaMetas_(SpreadsheetApp.getActiveSpreadsheet(), new Date()), null, 2));
}

// ---------------------------------------------------------------------------
// aux_metas: ler / gravar / arquivar
// ---------------------------------------------------------------------------

/** Todas as linhas da aba (inclusive arquivadas): [{ meta, linha, atualizadoEm }]. */
function lerLinhasMetas_(ss) {
  var aba = ss.getSheetByName(METAS_ABA_);
  if (!aba) return [];
  var ultima = aba.getLastRow();
  if (!(ultima >= 2)) return [];
  var out = [];
  aba.getRange(2, 1, ultima - 1, 3).getValues().forEach(function (l, i) {
    var id = String(l[0] || '').trim();
    if (!id || !l[1]) return;
    var meta;
    try { meta = JSON.parse(String(l[1]).replace(/^'/, '')); } catch (eJ) { return; }
    if (!meta || typeof meta !== 'object') return;
    meta.id = id;
    var d = l[2];
    out.push({ meta: meta, linha: i + 2, atualizadoEm: d && typeof d.getTime === 'function' ? d.toISOString() : (d ? String(d) : null) });
  });
  return out;
}

/** Metas não arquivadas (ou só as arquivadas), na ordem da aba. */
function lerMetas_(ss, opcoes) {
  var arquivadas = !!(opcoes && opcoes.arquivadas);
  return lerLinhasMetas_(ss).filter(function (x) { return (x.meta.status === 'arquivada') === arquivadas; }).map(function (x) {
    x.meta.atualizadoEm = x.atualizadoEm;
    return x.meta;
  });
}

function garantirAbaMetas_(ss) {
  var aba = ss.getSheetByName(METAS_ABA_);
  if (aba && aba.getLastRow() >= 1) return aba;
  if (!aba || typeof aba.getRange !== 'function') aba = ss.insertSheet(METAS_ABA_);
  aba.getRange(1, 1, 1, 3).setValues([['Id', 'Meta (JSON)', 'Atualizado em']]);
  if (aba.setFrozenRows) aba.setFrozenRows(1);
  return aba;
}

function novoIdMeta_() {
  var aleatorio = (typeof Utilities !== 'undefined' && Utilities.getUuid) ? Utilities.getUuid().replace(/-/g, '').slice(0, 6) : Math.random().toString(36).slice(2, 8);
  return 'm' + Date.now().toString(36) + aleatorio;
}

function salvarMeta_(ss, metaJson, agora, opcoes) {
  if (metaJson === undefined || metaJson === null || String(metaJson).trim() === '') return { ok: false, etapa: 'metas', erro: 'meta vazia' };
  var bruta;
  try { bruta = JSON.parse(metaJson); } catch (eJ) { return { ok: false, etapa: 'metas', erro: 'meta inválida (JSON)' }; }
  var meta = normalizarMeta_(bruta);
  var linhas = lerLinhasMetas_(ss);
  var existente = null;
  if (meta.id) {
    for (var i = 0; i < linhas.length; i++) if (linhas[i].meta.id === meta.id) { existente = linhas[i]; break; }
    if (!existente) return { ok: false, etapa: 'metas', erro: 'meta não encontrada: ' + meta.id };
    meta.criadaEm = existente.meta.criadaEm || meta.criadaEm;
  } else {
    meta.id = novoIdMeta_();
    meta.criadaEm = isoDiaMeta_(agora || new Date());
  }
  // 06/10/2026: "Distribuição da carteira" - uma só ativa; o site manda: os pesos vão pras células da planilha (antes de gravar a meta)
  if (meta.tipo === 'distribuicaoCarteira') {
    var jaTem = linhas.some(function (x) { return x.meta.tipo === meta.tipo && x.meta.id !== meta.id && x.meta.status !== 'arquivada'; });
    if (jaTem && meta.status !== 'arquivada') return { ok: false, etapa: 'metas', erro: 'já existe uma meta de distribuição da carteira - edite a que existe' };
    if (!(opcoes && opcoes.semPlanilha)) gravarPesosPlanilhaDistribuicao_(ss, meta.especificos.pesos);
  }
  mesclarHistoricoSaldos_(meta, existente ? existente.meta : null, agora || new Date());
  var id = meta.id;
  var copia = JSON.parse(JSON.stringify(meta));
  delete copia.id; delete copia.atualizadoEm; delete copia.progresso;
  var texto = JSON.stringify(copia);
  if (texto.length > METAS_MAX_JSON_) return { ok: false, etapa: 'metas', erro: 'meta grande demais pra uma célula (' + texto.length + ' caracteres)' };
  var aba = garantirAbaMetas_(ss);
  var linha = existente ? existente.linha : Math.max(aba.getLastRow(), 1) + 1;
  aba.getRange(linha, 1, 1, 3).setValues([[id, texto, agora || new Date()]]);
  var planilha = sincronizarPlanilhaMeta_(ss, meta); // 06/10/2026: o site é a fonte da verdade - sobrescreve as células correspondentes
  if (SpreadsheetApp.flush) SpreadsheetApp.flush();
  return { ok: true, id: id, meta: meta, metas: lerMetas_(ss), planilha: planilha };
}

/**
 * 06/10/2026 (Tiago, Metas > Patrimônio: "não precisa me lembrar que está diferente na planilha; agora o que vale é o que está
 * no site (sobrescreva na planilha se eu mudar no site)"): células da aba 'Distribuição e Metas' que a meta salva no site
 * sobrescreve - as MESMAS que a leitura usa (Despesas.gs!lerDespesasOrganizacao_ / montarTelaMetas_ referencias):
 *   reserva de emergência: L11 meses, L12 sobra de segurança (margem);
 *   aposentadoria:         K18 extra, L18 % de reinvestimento, M18 rendimento (taxa de retirada);
 *                          M19 renda desejada (só no modo "renda") e N18 patrimônio desejado (só no modo "montante").
 * Só campos preenchidos na meta (vazio = "seguir a planilha": não toca) e só de meta ativa. Devolve [{ celula, rotulo, linha, coluna, valor }].
 */
function celulasPlanilhaDaMeta_(meta) {
  if (!meta || meta.status !== 'ativa') return [];
  var e = meta.especificos || {};
  var n = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
  var out = [];
  var add = function (celula, rotulo, linha, coluna, valor) { if (valor !== null) out.push({ celula: celula, rotulo: rotulo, linha: linha, coluna: coluna, valor: valor }); };
  if (meta.tipo === 'reservaEmergencia') {
    add('L11', 'meses de reserva', 11, 12, n(e.meses));
    add('L12', 'sobra de segurança', 12, 12, n(e.margem));
  } else if (meta.tipo === 'aposentadoria') {
    add('K18', 'extra por mês', 18, 11, n(e.extra));
    add('L18', '% de reinvestimento', 18, 12, n(e.reinvestimento));
    add('M18', 'taxa de retirada', 18, 13, n(e.taxaRetirada));
    if (e.modoAlvo === 'renda') add('M19', 'renda desejada', 19, 13, n(e.rendaDesejada));
    if (e.modoAlvo === 'montante') add('N18', 'patrimônio desejado', 18, 14, n(meta.valorAlvo));
  }
  return out;
}

/** Grava as células de celulasPlanilhaDaMeta_ na planilha (só as que mudaram). Nunca lança: devolve { atualizadas: [{ celula, rotulo, antes, depois }], erro? }. */
function sincronizarPlanilhaMeta_(ss, meta) {
  var r = { atualizadas: [] };
  try {
    var celulas = celulasPlanilhaDaMeta_(meta);
    if (!celulas.length) return r;
    var dm = ss.getSheetByName(METAS_ABA_DM_);
    if (!dm) { r.erro = 'aba não encontrada: ' + METAS_ABA_DM_; return r; }
    celulas.forEach(function (c) {
      var rg = dm.getRange(c.linha, c.coluna, 1, 1);
      var antes = rg.getValues()[0][0];
      if (typeof antes === 'number' && Math.abs(antes - c.valor) < 1e-9) return;
      rg.setValues([[c.valor]]);
      r.atualizadas.push({ celula: c.celula, rotulo: c.rotulo, antes: antes === '' ? null : antes, depois: c.valor });
    });
  } catch (erro) { r.erro = String(erro && erro.message ? erro.message : erro); }
  return r;
}

function arquivarMeta_(ss, id, restaurar, agora) {
  id = String(id || '').trim();
  if (!id) return { ok: false, etapa: 'metas', erro: 'informe o id da meta' };
  var linhas = lerLinhasMetas_(ss);
  var achada = null;
  for (var i = 0; i < linhas.length; i++) if (linhas[i].meta.id === id) { achada = linhas[i]; break; }
  if (!achada) return { ok: false, etapa: 'metas', erro: 'meta não encontrada: ' + id };
  var meta = achada.meta;
  meta.status = restaurar ? 'ativa' : 'arquivada';
  if (restaurar) delete meta.arquivadaEm; else meta.arquivadaEm = isoDiaMeta_(agora || new Date());
  var copia = JSON.parse(JSON.stringify(meta));
  delete copia.id;
  var aba = garantirAbaMetas_(ss);
  aba.getRange(achada.linha, 1, 1, 3).setValues([[id, JSON.stringify(copia), agora || new Date()]]);
  if (SpreadsheetApp.flush) SpreadsheetApp.flush();
  return { ok: true, id: id, status: meta.status, metas: lerMetas_(ss) };
}

/**
 * 03/10/2026: apaga a linha da meta em aux_metas - só se ela já estiver
 * arquivada (a tela pede confirmação). As linhas de baixo sobem.
 */
function excluirMetaDefinitivo_(ss, id) {
  id = String(id || '').trim();
  if (!id) return { ok: false, etapa: 'metas', erro: 'informe o id da meta' };
  var linhas = lerLinhasMetas_(ss);
  var achada = null;
  for (var i = 0; i < linhas.length; i++) if (linhas[i].meta.id === id) { achada = linhas[i]; break; }
  if (!achada) return { ok: false, etapa: 'metas', erro: 'meta não encontrada: ' + id };
  if (achada.meta.status !== 'arquivada') return { ok: false, etapa: 'metas', erro: 'arquive a meta antes de excluir de vez' };
  var aba = ss.getSheetByName(METAS_ABA_);
  if (typeof aba.deleteRow === 'function') {
    aba.deleteRow(achada.linha);
  } else {
    // sem deleteRow (planilha em memória dos testes): sobe as linhas de baixo e limpa a última
    var ultima = aba.getLastRow();
    var abaixo = ultima > achada.linha ? aba.getRange(achada.linha + 1, 1, ultima - achada.linha, 3).getValues() : [];
    if (abaixo.length) aba.getRange(achada.linha, 1, abaixo.length, 3).setValues(abaixo);
    var rg = aba.getRange(ultima, 1, 1, 3);
    if (typeof rg.clearContent === 'function') rg.clearContent(); else rg.setValues([['', '', '']]);
  }
  if (SpreadsheetApp.flush) SpreadsheetApp.flush();
  return { ok: true, id: id, excluida: true, metas: lerMetas_(ss), arquivadas: lerMetas_(ss, { arquivadas: true }) };
}

/**
 * Histórico do "Saldo em conta": o que está gravado manda (o navegador não
 * reescreve o passado); se o saldo mudou, acrescenta {data, saldo} do dia.
 */
function mesclarHistoricoSaldos_(meta, anterior, agora) {
  var antigos = {};
  ((anterior && anterior.vinculos) || []).forEach(function (v) { if (v && v.tipo === 'saldo' && v.id) antigos[v.id] = v; });
  var hoje = isoDiaMeta_(agora);
  (meta.vinculos || []).forEach(function (v) {
    if (v.tipo !== 'saldo') return;
    var velho = antigos[v.id];
    var hist = velho && Array.isArray(velho.historico) ? velho.historico.slice() : (Array.isArray(v.historico) ? v.historico.slice() : []);
    hist = hist.filter(function (h) { return h && /^\d{4}-\d{2}-\d{2}$/.test(String(h.data)) && typeof h.saldo === 'number' && isFinite(h.saldo); });
    var data = /^\d{4}-\d{2}-\d{2}$/.test(String(v.atualizadoEm || '')) && String(v.atualizadoEm) <= hoje ? String(v.atualizadoEm) : hoje;
    var ultimo = hist[hist.length - 1];
    if (!ultimo || Math.abs(ultimo.saldo - (v.saldo || 0)) > 0.004) {
      if (ultimo && ultimo.data === data) hist[hist.length - 1] = { data: data, saldo: v.saldo || 0 };
      else hist.push({ data: data, saldo: v.saldo || 0 });
    }
    hist.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
    v.historico = hist.slice(-METAS_MAX_HIST_SALDO_);
    v.atualizadoEm = hist.length ? hist[hist.length - 1].data : data;
  });
}

// ---------------------------------------------------------------------------
// Normalização: só os campos conhecidos, números conferidos, texto sem fórmula
// ---------------------------------------------------------------------------

function isoDiaMeta_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function numMeta_(v, min, max, campo) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  if (!isFinite(n)) throw new Error('número inválido em ' + campo);
  if ((min !== null && n < min) || (max !== null && n > max)) throw new Error('valor fora do esperado em ' + campo + ': ' + v);
  return Math.round(n * 1e6) / 1e6;
}
function txtMeta_(v, max) { return v === null || v === undefined ? '' : String(v).replace(/^[=+\-@\s]+/, '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max || 80); }
/** 04/10/2026: link http(s) (ex. o roteiro no Wanderlog); sem protocolo ganha https://. Inválido = ''. */
function urlMeta_(v) {
  var u = String(v == null ? '' : v).trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  if (!/^https?:\/\/[^\s/?#]+\.[^\s/?#]+[^\s]*$/i.test(u) || u.length > 500) return '';
  return u;
}
function mesMeta_(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})/); return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? m[1] + '-' + m[2] : null; }
function moedaMeta_(v) { var m = String(v || 'BRL').toUpperCase(); return METAS_MOEDAS_.indexOf(m) >= 0 ? m : 'BRL'; }
function idCurtoMeta_(v) { var s = String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24); return s || Math.random().toString(36).slice(2, 10); }

function normalizarMeta_(v) {
  if (!v || typeof v !== 'object') throw new Error('meta inválida');
  var tipo = METAS_TIPOS_.indexOf(v.tipo) >= 0 ? v.tipo : null;
  if (!tipo) throw new Error('tipo de meta inválido: ' + v.tipo);
  var nome = txtMeta_(v.nome, 80).trim();
  if (!nome) throw new Error('dê um nome pra meta');
  var d = function (x, campo) { return numMeta_(x, 0, METAS_DINHEIRO_MAX_, campo); };
  var meta = {
    id: v.id ? idCurtoMeta_(v.id) : null,
    tipo: tipo,
    categoria: tipo === 'acumulo' ? (METAS_CATEGORIAS_.indexOf(v.categoria) >= 0 ? v.categoria : 'outros') : null,
    nome: nome,
    notas: txtMeta_(v.notas, 400),
    status: ['ativa', 'arquivada', 'pausada'].indexOf(v.status) >= 0 ? v.status : 'ativa',
    moeda: moedaMeta_(v.moeda),
    valorAlvo: d(v.valorAlvo, 'valorAlvo'),
    dataAlvo: mesMeta_(v.dataAlvo),
    valorInicial: d(v.valorInicial, 'valorInicial'),
    aporteMensal: d(v.aporteMensal, 'aporteMensal'),
    rendimentoAnual: numMeta_(v.rendimentoAnual, -0.5, 1, 'rendimentoAnual'),
    contribuicao: v.contribuicao === 'recorrente' ? 'recorrente' : 'acumulo',
    recorrente: null,
    contaMensal: null,
    exibirNaCarteira: v.exibirNaCarteira === true,
    criadaEm: /^\d{4}-\d{2}-\d{2}$/.test(String(v.criadaEm || '')) ? String(v.criadaEm) : null,
    especificos: {},
    itens: [],
    vinculos: []
  };
  if (meta.contribuicao === 'recorrente' && v.recorrente && typeof v.recorrente === 'object') {
    meta.recorrente = {
      parcela: d(v.recorrente.parcela, 'parcela'),
      totalParcelas: numMeta_(v.recorrente.totalParcelas, 1, 600, 'totalParcelas'),
      inicio: mesMeta_(v.recorrente.inicio),
      parcelasPagas: numMeta_(v.recorrente.parcelasPagas, 0, 600, 'parcelasPagas')
    };
  }
  if (v.contaMensal && typeof v.contaMensal === 'object' && Number(v.contaMensal.valor) > 0) {
    meta.contaMensal = {
      descricao: txtMeta_(v.contaMensal.descricao, 60),
      valor: d(v.contaMensal.valor, 'contaMensal'),
      meses: numMeta_(v.contaMensal.meses, 1, 600, 'contaMensal.meses'),
      inicio: mesMeta_(v.contaMensal.inicio)
    };
  }
  var e = v.especificos && typeof v.especificos === 'object' ? v.especificos : {};
  if (tipo === 'rendaPassiva') {
    meta.especificos = { rendaMensal: d(e.rendaMensal, 'rendaMensal'), dyAnual: numMeta_(e.dyAnual, 0, 1, 'dyAnual') };
  } else if (tipo === 'viagemInternacional' || tipo === 'viagemNacional') {
    // 03/10/2026: viagem por destinos (país/cidade, moeda, dias x gasto diário
    // por categoria) + itens fixos/compras antecipadas (passagens, hospedagem,
    // ingressos) - o desenho da planilha de viagem do Tiago.
    meta.especificos = { destino: txtMeta_(e.destino, 60), dataViagem: mesMeta_(e.dataViagem), margem: numMeta_(e.margem, 0, 2, 'margem'), destinos: [], fixos: [] };
    // 04/10/2026: roteiro no Wanderlog e quantas pessoas a SUA parte cobre (taxa turística)
    meta.especificos.roteiroUrl = urlMeta_(e.roteiroUrl);
    meta.especificos.pessoas = numMeta_(e.pessoas, 1, 20, 'pessoas');
    if (Array.isArray(e.destinos)) {
      meta.especificos.destinos = e.destinos.slice(0, 30).map(function (x) {
        if (!x || typeof x !== 'object') return null;
        var g = x.gastos && typeof x.gastos === 'object' ? x.gastos : {};
        var gastos = {};
        ['alimentacao', 'transporte', 'passeios', 'compras', 'outros'].forEach(function (k) { gastos[k] = d(g[k], 'gasto diário ' + k) || 0; });
        var cod = String(x.paisCodigo || '').toUpperCase();
        return {
          id: idCurtoMeta_(x.id), pais: txtMeta_(x.pais, 50).trim(), cidade: txtMeta_(x.cidade, 50).trim(), moeda: moedaMeta_(x.moeda),
          paisCodigo: /^[A-Z]{2}$/.test(cod) ? cod : null,
          dias: numMeta_(x.dias, 0, 366, 'dias') || 0, gastos: gastos, extras: d(x.extras, 'extras do destino') || 0,
          // 04/10/2026: taxa turística por pessoa por noite (moeda do destino)
          taxaTuristica: d(x.taxaTuristica, 'taxa turística'), taxaNoites: numMeta_(x.taxaNoites, 0, 366, 'noites da taxa'),
          taxaPessoas: numMeta_(x.taxaPessoas, 1, 50, 'pessoas da taxa'), taxaMaxNoites: numMeta_(x.taxaMaxNoites, 1, 366, 'máximo de noites da taxa')
        };
      }).filter(function (x) { return x && (x.pais || x.cidade); });
    }
    if (Array.isArray(e.fixos)) {
      meta.especificos.fixos = e.fixos.slice(0, 60).map(function (x) {
        if (!x || typeof x !== 'object') return null;
        var nomeF = txtMeta_(x.nome, 60).trim();
        if (!nomeF) return null;
        // 04/10/2026: forma de pagamento - 'cartao' (já comprado: conta como pago, fora do aporte),
        // 'pago' (à vista/pix) ou 'juntar' (ainda não pago: entra no dinheiro a juntar)
        var forma = ['cartao', 'pago', 'juntar'].indexOf(x.forma) >= 0 ? x.forma : (x.pago === true ? 'pago' : 'cartao');
        return {
          id: idCurtoMeta_(x.id), nome: nomeF, valor: d(x.valor, 'item fixo ' + nomeF) || 0, moeda: moedaMeta_(x.moeda),
          parcelas: numMeta_(x.parcelas, 1, 120, 'parcelas') || 1, inicio: mesMeta_(x.inicio),
          parte: x.parte == null || x.parte === '' ? 1 : numMeta_(x.parte, 0, 1, 'sua parte'), pago: forma === 'pago',
          forma: forma, cartao: txtMeta_(x.cartao, 40).trim(), confirmado: x.confirmado === true
        };
      }).filter(function (x) { return x; });
    }
  } else if (tipo === 'casa') {
    meta.especificos = { valorImovel: d(e.valorImovel, 'valorImovel'), entradaPct: numMeta_(e.entradaPct, 0, 1, 'entradaPct'), custosPct: numMeta_(e.custosPct, 0, 0.5, 'custosPct') };
  } else if (tipo === 'carro') {
    meta.especificos = { valorCarro: d(e.valorCarro, 'valorCarro'), entradaPct: numMeta_(e.entradaPct, 0, 1, 'entradaPct') };
  } else if (tipo === 'reservaEmergencia') {
    meta.especificos = { meses: numMeta_(e.meses, 0, 120, 'meses'), margem: numMeta_(e.margem, 0, 2, 'margem'), despesaMensal: d(e.despesaMensal, 'despesaMensal'), usarDespesasPlanilha: e.usarDespesasPlanilha !== false };
  } else if (tipo === 'distribuicaoCarteira') {
    // 06/10/2026: a distribuição desejada da carteira (pesos por grupo: Ações/FIIs/Renda Fixa e as divisões de cada um) - ver
    // DistribuicoesMetas.gs. Cada grupo precisa somar 100%; sem valor alvo, prazo nem vínculos (olha a carteira inteira).
    if (typeof normalizarPesosDistribuicao_ !== 'function') throw new Error('DistribuicoesMetas.gs desatualizado: faltam as funções da distribuição da carteira');
    meta.especificos = { pesos: normalizarPesosDistribuicao_(e.pesos) };
    meta.vinculos = [];
  } else if (tipo === 'aposentadoria') {
    // 03/10/2026: a conta da planilha (Distribuição e Metas K17:N19) fica
    // editável: base = despesas essenciais + extra; + % de reinvestimento =
    // renda ideal; montante = renda x 12 / rendimento (taxa de retirada).
    meta.especificos = {
      rendaDesejada: d(e.rendaDesejada, 'rendaDesejada'), taxaRetirada: numMeta_(e.taxaRetirada, 0, 0.5, 'taxaRetirada'),
      modoAlvo: ['calculado', 'renda', 'montante'].indexOf(e.modoAlvo) >= 0 ? e.modoAlvo : null,
      usarDespesasPlanilha: e.usarDespesasPlanilha !== false, despesaMensal: d(e.despesaMensal, 'despesaMensal'),
      extra: d(e.extra, 'extra'), reinvestimento: numMeta_(e.reinvestimento, 0, 5, 'reinvestimento'),
      anoNascimento: numMeta_(e.anoNascimento, 1900, 2100, 'anoNascimento')
    };
  }
  // 04/10/2026: links (qualquer meta) e entradas programadas (13º, FGTS, PLR...)
  // 06/10/2026 (Tiago: "me dê a opção de ignorar esse aviso"): avisos que o usuário mandou ignorar nesta meta
  if (Array.isArray(v.ignorarAvisos)) {
    meta.ignorarAvisos = v.ignorarAvisos.filter(function (x) { return METAS_AVISOS_IGNORAVEIS_.indexOf(x) >= 0; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
  }
  if (Array.isArray(v.links)) {
    meta.links = v.links.slice(0, 10).map(function (l) {
      if (!l || typeof l !== 'object') return null;
      var u = urlMeta_(l.url);
      return u ? { id: idCurtoMeta_(l.id), rotulo: txtMeta_(l.rotulo, 60).trim(), url: u } : null;
    }).filter(function (x) { return x; });
  }
  if (Array.isArray(v.entradas)) {
    meta.entradas = v.entradas.slice(0, 20).map(function (x) {
      if (!x || typeof x !== 'object' || METAS_TIPOS_ENTRADA_.indexOf(x.tipo) < 0) return null;
      return {
        id: idCurtoMeta_(x.id), tipo: x.tipo, nome: txtMeta_(x.nome, 60).trim(),
        pct: x.pct == null || x.pct === '' ? 1 : numMeta_(x.pct, 0, 1, '% da entrada'),
        valor: d(x.valor, 'valor da entrada'), mes: mesMeta_(x.mes),
        recorrencia: ['unica', 'anual', 'mensal'].indexOf(x.recorrencia) >= 0 ? x.recorrencia : (x.tipo === 'decimo13' || x.tipo === 'fgts' ? 'anual' : 'unica'),
        ativo: x.ativo !== false
      };
    }).filter(function (x) { return x; });
  }
  if (Array.isArray(v.itens)) {
    meta.itens = v.itens.slice(0, 60).map(function (it) {
      if (!it || typeof it !== 'object') return null;
      var nomeItem = txtMeta_(it.nome, 60).trim();
      if (!nomeItem) return null;
      return { id: idCurtoMeta_(it.id), nome: nomeItem, valor: d(it.valor, 'item ' + nomeItem) || 0, moeda: moedaMeta_(it.moeda || meta.moeda), concluido: it.concluido === true };
    }).filter(function (x) { return x; });
  }
  if (Array.isArray(v.vinculos)) {
    meta.vinculos = v.vinculos.slice(0, 80).map(function (x) {
      if (!x || typeof x !== 'object') return null;
      var tipoV = ['ativo', 'classe', 'marca', 'saldo'].indexOf(x.tipo) >= 0 ? x.tipo : 'ativo';
      if (tipoV === 'saldo') {
        // 03/10/2026: "Saldo em conta" (ex. Wise em euro) - dinheiro parado, não investido
        var inst = txtMeta_(x.instituicao, 60).trim();
        if (!inst) return null;
        var hist = Array.isArray(x.historico) ? x.historico.slice(-METAS_MAX_HIST_SALDO_).map(function (h) {
          if (!h || !/^\d{4}-\d{2}-\d{2}$/.test(String(h.data))) return null;
          var sv = Number(h.saldo);
          return isFinite(sv) && sv >= 0 && sv <= METAS_DINHEIRO_MAX_ ? { data: String(h.data), saldo: Math.round(sv * 100) / 100 } : null;
        }).filter(function (h) { return h; }) : [];
        return {
          tipo: 'saldo', modo: 'total', id: idCurtoMeta_(x.id), instituicao: inst, moeda: moedaMeta_(x.moeda),
          saldo: d(x.saldo, 'saldo em conta') || 0,
          atualizadoEm: /^\d{4}-\d{2}-\d{2}$/.test(String(x.atualizadoEm || '')) ? String(x.atualizadoEm) : null,
          historico: hist
        };
      }
      var modo = ['total', 'fracao', 'valor'].indexOf(x.modo) >= 0 ? x.modo : 'total';
      var o = { tipo: tipoV, modo: modo };
      if (tipoV === 'ativo') { o.id = txtMeta_(x.id, 160); o.nome = txtMeta_(x.nome, 80); if (!o.id) return null; }
      if (tipoV === 'classe') { o.classe = ['acoes', 'fiis', 'usa', 'rf'].indexOf(x.classe) >= 0 ? x.classe : null; if (!o.classe) return null; }
      if (tipoV === 'marca') { o.marca = x.marca === 'longo-prazo' ? 'longo-prazo' : 'emergencial'; }
      if (modo === 'fracao') o.fracao = numMeta_(x.fracao, 0, 1, 'fração do vínculo');
      if (modo === 'valor') o.valor = d(x.valor, 'valor do vínculo');
      return o;
    }).filter(function (x) { return x; });
  }
  return meta;
}

// ---------------------------------------------------------------------------
// Tela: metas + ativos com valor + câmbio + referências
// ---------------------------------------------------------------------------

/**
 * opcoes (testes): { ativos: [...] (pula montarMeusAtivos_), buscarCambio: fn(moedas) -> {EUR: n, ...},
 *   referencias: {...}, proventos: { recebidos, hoje } }
 */
function montarTelaMetas_(ss, agora, opcoes) {
  opcoes = opcoes || {};
  var avisos = {};
  var metas = lerMetas_(ss);
  var arquivadas = lerMetas_(ss, { arquivadas: true });

  var ativos = [];
  try {
    ativos = opcoes.ativos || ativosParaMetas_(ss);
  } catch (eA) { avisos.ativos = String(eA); }

  var moedas = { USD: true, EUR: true };
  metas.concat(arquivadas).forEach(function (m) {
    moedas[m.moeda || 'BRL'] = true;
    (m.itens || []).forEach(function (it) { moedas[it.moeda || 'BRL'] = true; });
    moedasUsadasMeta_(m).forEach(function (x) { moedas[x] = true; });
  });
  delete moedas.BRL;
  var cambio = {};
  try {
    cambio = cambioMetas_(ss, Object.keys(moedas), agora, opcoes.buscarCambio);
  } catch (eC) { avisos.cambio = String(eC); }

  var referencias = opcoes.referencias || null;
  var proventos12m = {};
  if (!referencias) {
    referencias = {};
    try {
      var desp = lerDespesasOrganizacao_(ss);
      referencias.reserva = {
        custoDeVida: desp.despesas.totalComFolga, gastoReal: desp.despesas.totalReal, folga: desp.despesas.folga,
        meses: desp.reserva.meses, sobra: desp.reserva.sobra, meta: desp.reserva.meta, atual: desp.reserva.atual
      };
      referencias.reserva.mediaGastos = desp.reserva.mediaGastos;
      referencias.patrimonio = { rendimento: desp.patrimonio.rendimento, desejado: desp.patrimonio.desejado, atual: desp.patrimonio.atual };
      // 03/10/2026: as peças da conta (K18 extra, L18 % reinvestimento, M19 renda desejada)
      referencias.patrimonio.extra = desp.patrimonio.extra;
      referencias.patrimonio.reinvestimento = desp.patrimonio.reinvestimento;
      referencias.patrimonio.rendaDesejada = desp.patrimonio.rendaDesejada;
    } catch (eD) { avisos.reserva = String(eD); }
    // 04/10/2026: pra estimar as entradas programadas (13º e saque-aniversário do FGTS)
    try { referencias.salario = referenciasSalarioMetas_(ss); } catch (eSal) { avisos.salario = String(eSal); }
    try { referencias.fgts = referenciasFgtsMetas_(ss); } catch (eF) { avisos.fgts = String(eF); }
    try {
      var rp = montarMetasCarteira_({ semReserva: true }).rendaPassiva;
      referencias.rendaPassiva = { metaPlanilha: typeof rp.meta === 'number' ? rp.meta : null, media12m: typeof rp.mediaUlt12Meses === 'number' ? rp.mediaUlt12Meses : null, meses: rp.mesesMedia || null };
    } catch (eR) { avisos.rendaPassiva = String(eR); }
  }
  try {
    var tela = opcoes.proventos || montarTelaProventosComCache_();
    // 05/10/2026 (A-17): mesma base da tela Proventos (lançados + pagos presumidos pela data), todas as classes
    proventos12m = proventos12mPorTicker_(typeof recebidosComPresumidos_ === 'function' ? recebidosComPresumidos_(tela) : tela.recebidos, tela.hoje);
  } catch (eP) { avisos.proventos = String(eP); }

  alocarMetasVinculos_(metas, ativos, cambio); // 05/10/2026 (A-11): cada ativo conta numa meta só

  var r = { metas: metas, arquivadas: arquivadas, ativos: ativos, cambio: cambio, referencias: referencias, proventos12m: proventos12m, hoje: isoDiaMeta_(agora || new Date()) };
  // 05/10/2026 (A-14): ticker antigo -> atual (Incorporacoes.gs), pro front achar vínculos a ticker renomeado
  try { r.aliasesTicker = tabelaAliasesTicker_(); } catch (eAl) { r.aliasesTicker = {}; }
  // 03/10/2026: aporte real de cada meta (o último metasHistorico calculado, 6h de cache)
  var resumo = opcoes.historicoResumo !== undefined ? opcoes.historicoResumo : lerResumoHistoricoMetas_();
  if (resumo) r.historicoResumo = resumo;
  if (Object.keys(avisos).length) r.avisos = avisos;
  return r;
}

/**
 * Ativos que podem ser vinculados, com o valor de hoje em reais - a lista da
 * Início (montarMeusAtivos_). `id` é único (a mesma posição de Renda Fixa
 * pode estar dividida entre Renda Emergencial e Longo Prazo); `ref` é o da
 * tela do ativo (link-ativo.js!refAtivo).
 */
function ativosParaMetas_(ss) {
  var cambioUsd = Number(cotacaoDolarHoje_(ss)) || 0;
  var vistos = {};
  var out = [];
  // 03/10/2026: IR (+ IOF) se resgatasse hoje, por título - RendaFixaIR.gs
  var irPorChave = {};
  try {
    montarIRRendaFixa_().forEach(function (p) { irPorChave[chaveTituloRf_(p.titulo, p.instituicao)] = p; });
  } catch (eIr) { irPorChave = null; }
  montarMeusAtivos_().forEach(function (a) {
    var valor = null;
    if (a.classe === 'rf') valor = typeof a.valorAtualizado === 'number' ? a.valorAtualizado : null;
    else if (typeof a.quantidade === 'number' && typeof a.precoAtual === 'number') valor = a.quantidade * a.precoAtual * (a.classe === 'usa' ? cambioUsd : 1);
    if (!(valor > 0)) return;
    var ref, nome;
    if (a.classe === 'rf') {
      var nomeRf = String(a.nome || a.tipoInvestimento || a.ticker || '').trim();
      ref = 'rf:' + nomeRf + '|' + String(a.instituicao || '').trim();
      nome = String(a.nome || a.tipoInvestimento || a.ticker || '').trim() + (a.vencimento && !a.nome ? '' : (a.vencimento ? ' · ' + a.vencimento : ''));
    } else {
      ref = String(a.ticker || '').trim().toUpperCase();
      nome = ref;
    }
    var id = a.classe === 'rf' ? ref + '@' + a.marca : ref;
    if (vistos[id]) { vistos[id] += 1; id = id + '#' + vistos[id]; } else vistos[id] = 1;
    var item = {
      id: id, ref: ref, nome: nome, classe: a.classe, marca: a.classe === 'rf' ? a.marca : null,
      instituicao: a.instituicao || null, indexador: a.indexador || null, vencimento: a.vencimento || null,
      descricao: a.classe === 'rf' ? (a.tipoInvestimento || null) : (a.nome || null),
      valorBRL: Math.round(valor * 100) / 100
    };
    if (a.classe === 'rf' && irPorChave) {
      var chaveIr = chaveTituloRf_(a.nome || a.tipoInvestimento || a.ticker, a.instituicao);
      item.irResgate = irResgateDoAtivo_(irPorChave[chaveIr], item.valorBRL, a.vencimento);
    }
    out.push(item);
  });
  return out;
}

/** IOF regressivo dos primeiros 30 dias (Decreto 6.306/2007, anexo): % do rendimento. */
function aliquotaIofMetas_(dias) {
  return aliquotaIofRendaFixa_(dias); // 05/10/2026 (A-13): tabela única em RendaFixaIR.gs
}

/**
 * IR + IOF se resgatasse hoje, na proporção do valor do ativo (a mesma
 * posição pode estar dividida entre Renda Emergencial e Longo Prazo). IOF
 * (resgate antes de 30 dias) incide primeiro; o IR é sobre o rendimento
 * menos o IOF - por isso o IR é refeito aqui lote a lote. LCI/LCA: isentas.
 */
function irResgateDoAtivo_(pos, valorAtivo, vencimentoTexto) {
  if (!pos) return { ir: 0, iof: 0, liquido: valorAtivo, isento: null, precisao: 'sem-dados' };
  var ir = 0, iof = 0;
  if (!pos.isento) {
    (pos.detalhes || []).forEach(function (l) {
      var rend = Number(l.rendimento) || 0;
      var iofL = rend * aliquotaIofMetas_(Number(l.diasCorridos));
      iof += iofL;
      ir += Math.max(0, rend - iofL) * (Number(l.aliquota) || 0);
    });
    if (!(pos.detalhes || []).length) ir = Number(pos.impostoSeResgatasseHoje) || 0;
  }
  var totalPos = (Number(pos.valorLiquidoSeResgatasseHoje) || 0) + (Number(pos.impostoSeResgatasseHoje) || 0);
  var fator = totalPos > 0 ? Math.min(1, valorAtivo / totalPos) : 1;
  ir = Math.round(ir * fator * 100) / 100;
  iof = Math.round(iof * fator * 100) / 100;
  var saida = { ir: ir, iof: iof, liquido: Math.round((valorAtivo - ir - iof) * 100) / 100, isento: !!pos.isento, precisao: pos.precisao || null };
  var venc = irNoVencimentoMetas_(pos, vencimentoTexto, valorAtivo, fator, new Date());
  if (venc) saida.vencimento = venc;
  return saida;
}

/**
 * 05/10/2026 (A-10): IR + IOF (se resgatasse hoje) dos títulos da Renda Emergencial - o que separa o
 * "bruto" (E19 de Distribuição e Metas) do "líquido" que a engine de Metas usa. null sem nenhum
 * título da reserva com estimativa.
 */
function impostoReservaMetas_(ativos) {
  var soma = 0, achou = false;
  (ativos || []).forEach(function (a) {
    if (a.classe !== 'rf' || a.marca !== 'emergencial' || !a.irResgate) return;
    achou = true;
    soma += (Number(a.irResgate.ir) || 0) + (Number(a.irResgate.iof) || 0);
  });
  return achou ? Math.round(soma * 100) / 100 : null;
}

/** Alíquota regressiva do IR (Lei 11.033/2004) pelos dias corridos de aplicação. */
function aliquotaIrDiasMetas_(dias) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.20;
  if (dias <= 720) return 0.175;
  return 0.15;
}

/**
 * 05/10/2026 (Tiago: "no vencimento o IR é pago obrigatoriamente"): dados pro
 * front projetar o IR no dia do vencimento (vencimento "MM/yyyy" - sem dia,
 * considera o dia 15). Cada lote é aplicado há `diasCorridos` + os dias até
 * vencer: a alíquota efetiva é a média das alíquotas dos lotes ponderada pelo
 * rendimento. `principal` = o que foi investido (valor atual - rendimento);
 * o front projeta o valor bruto no vencimento e cobra a alíquota sobre o que
 * passar do principal. Sem vencimento válido/já vencido: null.
 */
function irNoVencimentoMetas_(pos, vencimentoTexto, valorAtivo, fator, hoje) {
  var m = String(vencimentoTexto || '').match(/^(\d{2})\/(\d{4})$/);
  if (!m || !pos) return null;
  var dt = new Date(Number(m[2]), Number(m[1]) - 1, 15);
  var dias = Math.floor((dt.getTime() - hoje.getTime()) / 86400000);
  if (!(dias >= 0)) return null;
  var mes = m[2] + '-' + m[1];
  if (pos.isento) return { mes: mes, dias: dias, aliquota: 0, principal: Math.round(valorAtivo * 100) / 100 };
  var lotes = pos.detalhes || [];
  var somaRend = 0, somaPonderada = 0, maisAntigo = 0;
  lotes.forEach(function (l) {
    var rend = Number(l.rendimento) || 0;
    var d = (Number(l.diasCorridos) || 0) + dias;
    somaRend += rend;
    somaPonderada += rend * aliquotaIrDiasMetas_(d);
    if (d > maisAntigo) maisAntigo = d;
  });
  var aliquota = somaRend > 0 ? somaPonderada / somaRend : (lotes.length ? aliquotaIrDiasMetas_(maisAntigo) : null);
  var rendAtual = somaRend * fator;
  return {
    mes: mes, dias: dias,
    aliquota: aliquota == null ? null : Math.round(aliquota * 10000) / 10000,
    principal: aliquota == null ? null : Math.round((valorAtivo - rendAtual) * 100) / 100
  };
}

/**
 * 04/10/2026: salário pra estimar o 13º - o líquido da Distribuição e Metas
 * (N11, o mesmo da aba Salário), o último holerite mensal e os extras (13º,
 * PLR, bônus) já lançados ou previstos na aba Salário (Salario.gs).
 */
function referenciasSalarioMetas_(ss) {
  var liquido = null;
  try {
    var dm = ss.getSheetByName('Distribuição e Metas');
    var v = dm ? dm.getRange('N11').getValue() : null;
    liquido = typeof v === 'number' && v > 0 ? Math.round(v * 100) / 100 : null;
  } catch (eN) { liquido = null; }
  var pags = [];
  try { pags = typeof lerPagamentosSalario_ === 'function' ? lerPagamentosSalario_(ss) : []; } catch (eP) { pags = []; }
  var mensais = pags.filter(function (p) { return p.tipo === 'Mensal' && p.status !== 'Previsto'; }).sort(function (a, b) { return a.mes < b.mes ? 1 : -1; });
  var h = mensais[0] || null;
  var anoPassado = String(new Date().getFullYear() - 1);
  return {
    liquido: liquido,
    holerite: h ? { mes: h.mes, salarioBase: h.salarioBase, totalVencimentos: h.totalVencimentos, inss: h.inss, irrf: h.irrf, liquido: h.liquido } : null,
    extras: pags.filter(function (p) { return p.tipo !== 'Mensal' && String(p.mes) >= anoPassado; }).map(function (p) { return { mes: p.mes, tipo: p.tipo, status: p.status, liquido: p.liquido }; })
  };
}

/**
 * 04/10/2026: FGTS pra estimar o saque-aniversário - o mesmo que a aba
 * Patrimônio usa (aux_patrimonio: contas, saques-aniversário, nascimento e
 * salários da carteira), sem o extrato mês a mês. A conta fica no navegador
 * (patrimonio-calc.js!resumoFgts).
 */
function referenciasFgtsMetas_(ss) {
  if (typeof lerConfigPatrimonio_ !== 'function') return null;
  var cfg = lerConfigPatrimonio_(ss).config || {};
  var f = cfg.fgts;
  if (!f || !Array.isArray(f.contas) || !f.contas.length) return null;
  var carreira = cfg.carreira || {};
  return {
    contas: f.contas.map(function (c) {
      return {
        empregador: c.empregador || '', admissao: c.admissao || null, afastamento: c.afastamento || null, saldo: c.saldo || 0, dataSaldo: c.dataSaldo || null,
        saques: { aniversario: (c.saques && c.saques.aniversario) || 0 }, saquesAniversario: c.saquesAniversario || []
      };
    }),
    nascimento: (cfg.preferencias && cfg.preferencias.nascimento) || carreira.nascimento || null,
    carreira: { contratos: (carreira.contratos || []).map(function (c) { return { empregador: c.empregador || '', salarios: c.salarios || [] }; }) }
  };
}

/** Ticker em maiúsculas já trocado pelo atual quando foi renomeado/incorporado (Incorporacoes.gs!resolverAliasTicker_). */
function aliasTickerMetas_(ticker) {
  var t = String(ticker || '').trim().toUpperCase();
  return typeof resolverAliasTicker_ === 'function' ? resolverAliasTicker_(t) : t;
}

/** Moedas de "Saldo em conta", destinos e itens fixos de viagem (pro câmbio). */
function moedasUsadasMeta_(m) {
  var out = [];
  (m.vinculos || []).forEach(function (v) { if (v && v.tipo === 'saldo' && v.moeda) out.push(v.moeda); });
  var e = m.especificos || {};
  (e.destinos || []).forEach(function (x) { if (x && x.moeda) out.push(x.moeda); });
  (e.fixos || []).forEach(function (x) { if (x && x.moeda) out.push(x.moeda); });
  return out;
}

/** Total de proventos dos 12 meses fechados por ticker (mesma janela de mediaRendaPassiva12Meses_). */
function proventos12mPorTicker_(recebidos, hoje) {
  var janela = mediaRendaPassiva12Meses_([], hoje || isoDiaMeta_(new Date()));
  var porTicker = {};
  (recebidos || []).forEach(function (p) {
    var m = String(p.data || '').slice(0, 7);
    if (m < janela.inicio || m > janela.fim || typeof p.valor !== 'number' || !p.ticker) return;
    var t = typeof resolverAliasTicker_ === 'function' ? resolverAliasTicker_(p.ticker) : String(p.ticker).toUpperCase(); // 05/10/2026 (A-14): provento de ticker antigo conta no atual
    porTicker[t] = Math.round(((porTicker[t] || 0) + p.valor) * 100) / 100;
  });
  return { inicio: janela.inicio, fim: janela.fim, porTicker: porTicker };
}

/**
 * Mesma regra de assets/js/pages/metas-calc.js!resolverVinculos.
 * 05/10/2026 (A-11): CADA ATIVO CONTA UMA VEZ - dentro da meta vale o vínculo de maior fração; entre metas,
 * `ocupado` ({ idDoAtivo: valorJaPegoPorMetasDeMaiorPrioridade }, alterado aqui) limita o que sobra (ver
 * alocarMetasVinculos_). 05/10/2026 (A-14): vínculo a ticker antigo acha o ativo atual (resolverAliasTicker_).
 */
function progressoVinculosMeta_(meta, ativos, cambio, ocupado) {
  ocupado = ocupado || {};
  var total = 0;
  var cortado = 0;
  var pre = (meta.vinculos || []).map(function (v) {
    if (v.tipo === 'saldo') return { v: v, saldo: true };
    var idv = null;
    if (v.tipo === 'ativo') {
      var partesId = String(v.id || '').split('@');
      idv = typeof resolverAliasTicker_ === 'function' ? resolverAliasTicker_(partesId[0]) + (partesId.length > 1 ? '@' + partesId[1] : '') : v.id;
    }
    var alvo = (ativos || []).filter(function (a) {
      if (v.tipo === 'ativo') return a.id === v.id || a.id === idv;
      if (v.tipo === 'classe') return a.classe === v.classe;
      if (v.tipo === 'marca') return a.classe === 'rf' && a.marca === v.marca;
      return false;
    });
    var base = alvo.reduce(function (s, a) { return s + (Number(a.valorBRL) || 0); }, 0);
    var parte = 1;
    if (v.modo === 'fracao') parte = Math.max(0, Math.min(1, Number(v.fracao) || 0));
    if (v.modo === 'valor') parte = base > 0 ? Math.min(base, Number(v.valor) || 0) / base : 0;
    return { v: v, alvo: alvo, base: base, parte: parte };
  });
  var vencedor = {};
  pre.forEach(function (p, i) {
    if (p.saldo) return;
    p.alvo.forEach(function (a) {
      if (vencedor[a.id] === undefined || p.parte > pre[vencedor[a.id]].parte + 1e-12) vencedor[a.id] = i;
    });
  });
  var itens = pre.map(function (p, i) {
    var v = p.v;
    if (p.saldo) {
      var cot = cotacaoMetas_(v.moeda, cambio);
      var vs = cot == null ? 0 : Math.round((Number(v.saldo) || 0) * cot * 100) / 100;
      total += vs;
      return { tipo: 'saldo', id: v.id || null, classe: null, marca: null, base: vs, valorBRL: vs, encontrado: cot != null };
    }
    var valor = 0;
    var pretendido = 0;
    p.alvo.forEach(function (a) {
      var vale = Number(a.valorBRL) || 0;
      var quer = vale * p.parte;
      pretendido += quer;
      if (vencedor[a.id] !== i) return;
      var toma = Math.max(0, Math.min(quer, vale - (Number(ocupado[a.id]) || 0)));
      valor += toma;
      ocupado[a.id] = (Number(ocupado[a.id]) || 0) + toma;
    });
    valor = Math.round(valor * 100) / 100;
    total += valor;
    cortado += Math.max(0, pretendido - valor);
    return { tipo: v.tipo, id: v.id || null, classe: v.classe || null, marca: v.marca || null, base: Math.round(p.base * 100) / 100, valorBRL: valor, pretendidoBRL: Math.round(pretendido * 100) / 100, encontrado: p.alvo.length > 0 };
  });
  return { valorVinculado: Math.round(total * 100) / 100, cortadoBRL: Math.round(cortado * 100) / 100, vinculos: itens };
}

/** Ordem de prioridade quando duas metas vinculam o mesmo ativo: reserva -> renda passiva -> aposentadoria -> demais (mesma de metas-calc.js!ordemDeAlocacao). */
var METAS_PRIORIDADE_TIPOS_ = ['reservaEmergencia', 'rendaPassiva', 'aposentadoria'];
/** 07/10/2026: metas que podem contar os MESMOS ativos que a aposentadoria (reserva: 06/10; renda passiva: 07/10). */
var METAS_COMPARTILHAM_COM_APOSENTADORIA_ = ['reservaEmergencia', 'rendaPassiva'];

/**
 * 05/10/2026 (A-11): calcula `progresso` de TODAS as metas ativas com alocação exclusiva por prioridade
 * (cada ativo conta numa meta só; 06/10/2026: exceto Reserva de emergência x Aposentadoria, que podem contar os mesmos ativos). Mesmo critério do front (metas-calc.js!alocarMetas).
 */
function alocarMetasVinculos_(metas, ativos, cambio) {
  var ocupado = {};
  var usoReserva = {}; // 06/10/2026: o que a reserva pegou de cada ativo
  var peso = function (m) { var k = METAS_PRIORIDADE_TIPOS_.indexOf(m.tipo); return k < 0 ? METAS_PRIORIDADE_TIPOS_.length : k; };
  var chaves = function (o) { return Object.keys(o); };
  metas.map(function (m, i) { return { m: m, i: i }; })
    .sort(function (a, b) { return peso(a.m) - peso(b.m) || a.i - b.i; })
    .forEach(function (x) {
      var m = x.m;
      // 07/10/2026 (Tiago: "deveria ser basicamente meu patrimônio todo de investimentos"): a renda passiva também divide os
      // ativos com a aposentadoria (é a mesma carteira) - igual a metas-calc-plano.js!COMPARTILHAM_COM_APOSENTADORIA
      if (METAS_COMPARTILHAM_COM_APOSENTADORIA_.indexOf(m.tipo) >= 0) {
        var antes = {}; chaves(ocupado).forEach(function (id) { antes[id] = ocupado[id]; });
        m.progresso = progressoVinculosMeta_(m, ativos, cambio, ocupado);
        chaves(ocupado).forEach(function (id) { usoReserva[id] = (usoReserva[id] || 0) + (ocupado[id] - (antes[id] || 0)); });
      } else if (m.tipo === 'aposentadoria' && chaves(usoReserva).length) {
        // 06/10/2026 (Tiago: "a única exceção de ter os mesmos ativos em duas metas seria Renda Emergencial e Patrimônio"):
        // a aposentadoria não vê o que a reserva pegou; só a parte que passa do uso da reserva ocupa de novo (igual a metas-calc-plano.js!alocarMetas)
        var visao = {}; chaves(ocupado).forEach(function (id) { visao[id] = Math.max(0, ocupado[id] - (usoReserva[id] || 0)); });
        var antesV = {}; chaves(visao).forEach(function (id) { antesV[id] = visao[id]; });
        m.progresso = progressoVinculosMeta_(m, ativos, cambio, visao);
        chaves(visao).forEach(function (id) {
          var uso = visao[id] - (antesV[id] || 0);
          ocupado[id] = (Number(ocupado[id]) || 0) + Math.max(0, uso - (usoReserva[id] || 0));
        });
      } else {
        m.progresso = progressoVinculosMeta_(m, ativos, cambio, ocupado);
      }
    });
}

/** Reais por 1 unidade da moeda ({ EUR: 6 } ou { EUR: { valor: 6 } }); BRL = 1; sem cotação = null. */
function cotacaoMetas_(moeda, cambio) {
  if (!moeda || moeda === 'BRL') return 1;
  var c = cambio && cambio[moeda];
  var v = c && typeof c === 'object' ? c.valor : c;
  return typeof v === 'number' && v > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Câmbio (moeda -> reais), cache de 6h
// ---------------------------------------------------------------------------

/**
 * { EUR: { valor, fonte, data }, ... } pra cada moeda pedida. `buscar` (testes)
 * substitui a rede: fn(moedas) -> { EUR: 6.1, ... }.
 *
 * 04/10/2026 (Tiago: "incluí [o CHF] na aba 'Bolsa USA >>>': D8 é a cotação
 * do Dólar, D9 Libra, D10 Franco Suíço e D11 Euro; eu uso a fórmula do Google
 * Finance [...] se puder variar para todas as moedas, ótimo"). Ordem:
 *   1. aba "Bolsa USA >>>" (cambioAbaBolsaUsaMetas_) - USD, GBP, CHF, EUR;
 *   2. aba aux_cambio (cambioAuxMetas_) - =GOOGLEFINANCE("CURRENCY:XXXBRL")
 *      escrita sob demanda pra qualquer outra moeda que uma meta usar;
 *   3. AwesomeAPI -> PTAX -> dólar/euro antigos da planilha (cambioApiMetas_, cache de 6h).
 * `opcoes.semPlanilha` (testes antigos) pula 1 e 2.
 */
function cambioMetas_(ss, moedas, agora, buscar, opcoes) {
  moedas = (moedas || []).filter(function (m) { return m && m !== 'BRL' && METAS_MOEDAS_.indexOf(m) >= 0; });
  var hoje = isoDiaMeta_(agora || new Date());
  var out = {};
  if (!(opcoes && opcoes.semPlanilha)) {
    var aba = {};
    try { aba = cambioAbaBolsaUsaMetas_(ss); } catch (eA) { aba = {}; }
    moedas.forEach(function (m) {
      if (aba[m]) out[m] = { valor: aba[m].valor, fonte: 'planilha · ' + METAS_ABA_BOLSA_USA_ + ' ' + aba[m].celula, data: hoje, origem: 'planilha', conferido: aba[m].como };
    });
    var faltamAux = moedas.filter(function (m) { return !out[m]; });
    if (faltamAux.length) {
      var aux = {};
      try { aux = cambioAuxMetas_(ss, faltamAux); } catch (eX) { aux = {}; }
      faltamAux.forEach(function (m) {
        if (aux[m]) out[m] = { valor: aux[m], fonte: 'planilha · ' + METAS_ABA_CAMBIO_ + ' (GOOGLEFINANCE)', data: hoje, origem: 'planilha' };
      });
    }
  }
  var resto = moedas.filter(function (m) { return !out[m]; });
  if (resto.length) {
    var api = cambioApiMetas_(ss, resto, agora, buscar);
    resto.forEach(function (m) { if (api[m]) out[m] = api[m]; });
  }
  return out;
}

/**
 * Cotações da aba "Bolsa USA >>>" (coluna D, linhas 5 a 20): a moeda de cada
 * célula sai da própria fórmula (GOOGLEFINANCE("EURBRL") / "CURRENCY:EURBRL"),
 * senão do rótulo da linha ("Cotação do dólar hoje:", "libra", "franco",
 * "euro"), senão da posição combinada (D8 USD, D9 GBP, D10 CHF, D11 EUR) - e
 * só vale se o valor estiver numa faixa plausível pra moeda.
 * { USD: { valor, celula: 'D8', como: 'fórmula'|'rótulo'|'posição' }, ... }
 */
function cambioAbaBolsaUsaMetas_(ss) {
  var aba = ss && ss.getSheetByName ? ss.getSheetByName(METAS_ABA_BOLSA_USA_) : null;
  if (!aba || typeof aba.getRange !== 'function') return {};
  var rg = aba.getRange(5, 1, 16, 4); // A5:D20
  var vals = rg.getValues();
  var forms = null;
  try { forms = typeof rg.getFormulas === 'function' ? rg.getFormulas() : null; } catch (eF) { forms = null; }
  var out = {};
  vals.forEach(function (l, i) {
    var linha = 5 + i;
    var v = Number(l[3]);
    if (!(typeof l[3] === 'number' || (typeof l[3] === 'string' && l[3] !== '')) || !(v > 0)) return;
    var moeda = null, como = null;
    var f = forms && forms[i] ? String(forms[i][3] || '') : '';
    var mf = f.match(/GOOGLEFINANCE\(\s*"+(?:CURRENCY:)?([A-Z]{3})BRL"/i);
    if (mf) { moeda = mf[1].toUpperCase(); como = 'fórmula'; }
    if (!moeda) {
      var rot = (String(l[0] || '') + ' ' + String(l[1] || '') + ' ' + String(l[2] || '')).toLowerCase();
      if (/d[oó]lar/.test(rot) && !/canad|austral|hong|cingap|singap|neozel/.test(rot)) moeda = 'USD';
      else if (/libra/.test(rot)) moeda = 'GBP';
      else if (/franco/.test(rot)) moeda = 'CHF';
      else if (/\beuro/.test(rot)) moeda = 'EUR';
      if (moeda) como = 'rótulo';
      else if (!rot.trim() && METAS_CELULAS_BOLSA_USA_[linha]) { moeda = METAS_CELULAS_BOLSA_USA_[linha]; como = 'posição'; }
    }
    if (!moeda || out[moeda]) return;
    var faixa = METAS_FAIXA_CAMBIO_[moeda];
    if (faixa && (v < faixa[0] || v > faixa[1])) return; // valor estranho pra essa moeda: não usa
    out[moeda] = { valor: v, celula: 'D' + linha, como: como };
  });
  return rejeitarCambioSuspeitoMetas_(out);
}

/**
 * 05/10/2026 (A-16): a célula "Cotação do Libra hoje" já chegou valendo EXATAMENTE o mesmo que a do
 * dólar (fórmula copiada) e a faixa de 3 a 18 aceitava 5,00 pra libra sem reclamar. Agora uma cotação
 * de outra moeda que seja IDÊNTICA à de outra, ou que fuja da razão plausível contra o dólar (libra
 * 1,05-2,2x, euro 0,8-1,6x, franco 0,7-1,7x - faixas históricas largas), é descartada - a moeda cai pra aux_cambio/API em vez de
 * entrar errada numa meta de viagem. Dólar é a âncora (nunca descartado por isso).
 */
var METAS_RAZAO_CAMBIO_ = { GBP: [1.05, 2.2], EUR: [0.8, 1.6], CHF: [0.7, 1.7] };
function rejeitarCambioSuspeitoMetas_(porMoeda) {
  var moedas = Object.keys(porMoeda);
  var descartar = {};
  moedas.forEach(function (a) {
    moedas.forEach(function (b) {
      if (a >= b) return;
      if (Math.abs(porMoeda[a].valor - porMoeda[b].valor) < 0.0005) {
        if (a !== 'USD') descartar[a] = true;
        if (b !== 'USD') descartar[b] = true;
      }
    });
    var razao = METAS_RAZAO_CAMBIO_[a];
    var usd = porMoeda.USD ? porMoeda.USD.valor : null;
    if (razao && usd > 0) {
      var r = porMoeda[a].valor / usd;
      if (r < razao[0] || r > razao[1]) descartar[a] = true;
    }
  });
  var out = {};
  moedas.forEach(function (m) {
    if (descartar[m]) {
      try { console.log('Metas: cotação de ' + m + ' (' + porMoeda[m].celula + ' = ' + porMoeda[m].valor + ') descartada - igual à de outra moeda ou fora da razão plausível contra o dólar'); } catch (eL) { /* ok */ }
      return;
    }
    out[m] = porMoeda[m];
  });
  return out;
}

/**
 * Aba aux_cambio (criada sob demanda): Moeda | Reais por 1 unidade. Cada moeda
 * que falta ganha uma linha com =IFERROR(GOOGLEFINANCE("CURRENCY:XXXBRL");"")
 * - na 1ª vez o Google ainda está calculando (vem vazio e a tela usa a API);
 * da próxima já vem o valor. { CZK: 0.24, ... } só das que têm número.
 */
function cambioAuxMetas_(ss, moedas) {
  if (!ss || !moedas || !moedas.length) return {};
  var aba = ss.getSheetByName(METAS_ABA_CAMBIO_);
  var linhas = [];
  try { linhas = aba && aba.getLastRow() >= 2 ? aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues() : []; } catch (eL) { linhas = []; }
  var onde = {};
  linhas.forEach(function (l, i) { var m = String(l[0] || '').trim().toUpperCase(); if (m && !onde[m]) onde[m] = { linha: i + 2, valor: l[1] }; });
  var faltam = moedas.filter(function (m) { return !onde[m]; });
  if (faltam.length && typeof ss.insertSheet === 'function') {
    var trava = null;
    try { trava = travaRecurso_('metas', 'salvar metas'); if (trava.tryLock && !trava.tryLock(5000)) trava = false; } catch (eT) { trava = null; }
    if (trava !== false) {
      try {
        var temCab = false;
        try { temCab = !!(aba && aba.getLastRow() >= 1); } catch (eC) { temCab = false; }
        if (!aba || !temCab) {
          if (!aba || typeof aba.getRange !== 'function') aba = ss.insertSheet(METAS_ABA_CAMBIO_);
          aba.getRange(1, 1, 1, 2).setValues([['Moeda', 'Reais por 1 unidade (GOOGLEFINANCE)']]);
        }
        var prox = Math.max(aba.getLastRow(), 1) + 1;
        faltam.forEach(function (m) {
          aba.getRange(prox, 1, 1, 1).setValues([[m]]);
          var cel = aba.getRange(prox, 2, 1, 1);
          if (typeof cel.setFormula === 'function') cel.setFormula('=IFERROR(GOOGLEFINANCE("CURRENCY:' + m + 'BRL");"")');
          onde[m] = { linha: prox, valor: null, nova: true };
          prox++;
        });
        if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.flush) SpreadsheetApp.flush();
      } finally {
        try { if (trava && trava.releaseLock) trava.releaseLock(); } catch (eR) { /* ok */ }
      }
    }
  }
  var out = {};
  moedas.forEach(function (m) {
    var x = onde[m];
    if (!x) return;
    var v = x.valor;
    if (x.nova) { try { v = aba.getRange(x.linha, 2, 1, 1).getValues()[0][0]; } catch (eV) { v = null; } }
    if (typeof v === 'number' && v > 0) out[m] = v;
  });
  return out;
}

/** AwesomeAPI -> PTAX -> planilha antiga (cache de 6h). */
function cambioApiMetas_(ss, moedas, agora, buscar) {
  moedas = (moedas || []).filter(function (m) { return m && m !== 'BRL' && METAS_MOEDAS_.indexOf(m) >= 0; });
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (eC) { cache = null; }
  var guardado = {};
  if (cache) {
    try { guardado = JSON.parse(cache.get(METAS_CACHE_CAMBIO_) || '{}') || {}; } catch (eJ) { guardado = {}; }
  }
  // cotação da planilha (as APIs falharam) vale por 30 min antes de tentar a rede de novo
  var agoraMs = (agora || new Date()).getTime();
  var recente = guardado._falhaEm && agoraMs - guardado._falhaEm < 30 * 60 * 1000;
  var faltam = moedas.filter(function (m) { return !(guardado[m] && guardado[m].valor > 0 && (guardado[m].fonte !== 'planilha' || recente)); });
  if (faltam.length) {
    delete guardado._falhaEm;
    var achados = {};
    if (buscar) {
      try { achados = buscar(faltam) || {}; } catch (eB) { achados = {}; }
      Object.keys(achados).forEach(function (m) { if (achados[m] > 0) guardado[m] = { valor: achados[m], fonte: 'teste', data: isoDiaMeta_(agora) }; });
    } else {
      var awesome = cambioAwesomeApiMetas_(faltam);
      Object.keys(awesome).forEach(function (m) { guardado[m] = awesome[m]; });
      faltam.filter(function (m) { return !awesome[m]; }).forEach(function (m) {
        var ptax = cambioPtaxMetas_(m, agora);
        if (ptax) guardado[m] = ptax;
      });
    }
    var planilha = cambioPlanilhaMetas_(ss);
    faltam.forEach(function (m) {
      if (guardado[m] && guardado[m].valor > 0 && guardado[m].fonte !== 'planilha') return;
      guardado._falhaEm = agoraMs;
      if (planilha[m]) guardado[m] = { valor: planilha[m], fonte: 'planilha', data: isoDiaMeta_(agora) };
    });
    if (cache) { try { cache.put(METAS_CACHE_CAMBIO_, JSON.stringify(guardado), METAS_CAMBIO_SEGUNDOS_); } catch (eP) { /* ok */ } }
  }
  var out = {};
  moedas.forEach(function (m) { if (guardado[m]) out[m] = guardado[m]; });
  return out;
}

function cambioAwesomeApiMetas_(moedas) {
  var out = {};
  try {
    var url = 'https://economia.awesomeapi.com.br/json/last/' + moedas.map(function (m) { return m + '-BRL'; }).join(',');
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (typeof resp.getResponseCode === 'function' && resp.getResponseCode() !== 200) return out;
    var json = JSON.parse(resp.getContentText());
    moedas.forEach(function (m) {
      var x = json && json[m + 'BRL'];
      var v = x ? Number(x.bid) : NaN;
      if (v > 0) out[m] = { valor: v, fonte: 'AwesomeAPI', data: x.create_date ? String(x.create_date).slice(0, 10) : null };
    });
  } catch (e) { /* cai pra PTAX */ }
  return out;
}

function cambioPtaxMetas_(moeda, agora) {
  try {
    var fim = agora || new Date();
    var ini = new Date(fim.getTime() - 10 * 86400000);
    var fmt = function (d) { return ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + '-' + d.getFullYear(); };
    var url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'
      + "?@moeda='" + moeda + "'&@dataInicial='" + fmt(ini) + "'&@dataFinalCotacao='" + fmt(fim) + "'&$format=json&$select=cotacaoVenda,dataHoraCotacao";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (typeof resp.getResponseCode === 'function' && resp.getResponseCode() !== 200) return null;
    var lista = (JSON.parse(resp.getContentText()) || {}).value || [];
    var ult = lista[lista.length - 1];
    if (!ult || !(Number(ult.cotacaoVenda) > 0)) return null;
    return { valor: Number(ult.cotacaoVenda), fonte: 'PTAX (BCB)', data: String(ult.dataHoraCotacao || '').slice(0, 10) };
  } catch (e) {
    return null;
  }
}

/** Último recurso: dólar da Distribuição e Metas e euro da Auxiliar_app (B11), os mesmos da Início. */
function cambioPlanilhaMetas_(ss) {
  var out = {};
  try { var usd = cotacaoDolarHoje_(ss); if (usd > 0) out.USD = usd; } catch (e1) { /* ok */ }
  try { var eur = Number(ss.getSheetByName('Auxiliar_app').getRange('B11').getValue()); if (eur > 0) out.EUR = eur; } catch (e2) { /* ok */ }
  return out;
}

// ---------------------------------------------------------------------------
// 03/10/2026: histórico mês a mês das metas (GET action=metasHistorico)
// ---------------------------------------------------------------------------
//
// Tiago: "Gráfico de histórico (como fui chegando aos poucos ao valor atual)"
// e "nesse ritmo, você chega na sua meta em tanto tempo" - o ritmo vem do
// aporte REAL (compras - vendas de cada mês dos ativos vinculados), não de um
// número digitado. Fontes, por tipo de vínculo:
//   classe / marca  série da Início (montarSerieHistoricoInicio_, em cache):
//                   valor do último dia do mês + soma do fluxoAplicado* do mês
//                   (compras - custo das vendas, sem proventos - FluxoCaixaInicio.gs)
//   ativo (RV)      aux_historico-patrimonio (Valor BRL do último pregão do mês)
//                   + Transações / Transações - USA (Compra +, Venda -)
//   ativo (RF)      aux_historico-renda-fixa (valor do último dia do mês, do
//                   título + instituição + classificação) + Transações Renda Fixa
//   saldo em conta  o histórico das atualizações guardado no vínculo (câmbio de hoje)
// Fração e valor fixo valem igual ao de hoje (o valor fixo limita cada mês).
// Renda passiva: proventos pagos mês a mês dos vinculados (Proventos.gs).

var METAS_BALDES_INICIO_ = {
  'classe:acoes': ['acoes', 'fluxoAplicadoAcoes'],
  'classe:fiis': ['fiis', 'fluxoAplicadoFiis'],
  'classe:usa': ['acoesEua', 'fluxoAplicadoAcoesEua'],
  'classe:rf': ['rendaFixaTotal', 'fluxoAplicadoRendaFixaTotal'],
  'marca:emergencial': ['rendaEmergencial', 'fluxoAplicadoRendaEmergencial'],
  'marca:longo-prazo': ['rendaFixaLongoPrazo', 'fluxoAplicadoRendaFixaLongoPrazo']
};
var METAS_CLASSE_PROVENTO_ = { acoes: 'acoes', fiis: 'fiis', usa: 'acoesEua' };

function diaIsoMetas_(d) {
  if (!(d instanceof Date)) return /^\d{4}-\d{2}-\d{2}/.test(String(d || '')) ? String(d).slice(0, 10) : null;
  return typeof chaveDiaISOInicio_ === 'function' ? chaveDiaISOInicio_(d) : isoDiaMeta_(d);
}
function r2Metas_(v) { return Math.round((Number(v) || 0) * 100) / 100; }
function somarMesMetas_(mes, n) {
  var t = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return Math.floor(t / 12) + '-' + ('0' + ((t % 12) + 1)).slice(-2);
}

/** 'rf:Tesouro Selic 2029|XP@emergencial#2' -> { nome, instituicao, marca } */
function partesIdRfMetas_(id) {
  var s = String(id || '').replace(/#\d+$/, '');
  if (s.indexOf('rf:') !== 0) return null;
  var arroba = s.lastIndexOf('@');
  var marca = arroba > 0 ? s.slice(arroba + 1) : null;
  var corpo = (arroba > 0 ? s.slice(0, arroba) : s).slice(3);
  var barra = corpo.lastIndexOf('|');
  return { nome: barra >= 0 ? corpo.slice(0, barra).trim() : corpo.trim(), instituicao: barra >= 0 ? corpo.slice(barra + 1).trim() : '', marca: marca };
}

// 06/10/2026 (A-71): instRfMetas_/casaTituloRfMetas_ saíram - a regra única é casaTituloRf_/chaveTituloRf_ (RendaFixaIR.gs).

/**
 * opcoes (testes): { id, serieInicio: [...], linhasPatrimonio: [[...]], linhasRf: [[...]],
 *   transacoes: { br, usa, rf }, proventos: { recebidos }, cambio: {...}, semCache }
 */
function montarHistoricoMetas_(ss, agora, opcoes) {
  opcoes = opcoes || {};
  agora = agora || new Date();
  var hoje = isoDiaMeta_(agora);
  var hojeMes = hoje.slice(0, 7);
  var avisos = {};
  var metas;
  if (opcoes.id) {
    metas = lerLinhasMetas_(ss).map(function (x) { return x.meta; }).filter(function (m) { return m.id === String(opcoes.id); });
  } else {
    metas = lerMetas_(ss);
  }
  var vinculos = [];
  metas.forEach(function (m) { (m.vinculos || []).forEach(function (v) { vinculos.push(v); }); });

  // --- câmbio (saldo em conta) ---
  var moedas = {};
  vinculos.forEach(function (v) { if (v.tipo === 'saldo' && v.moeda && v.moeda !== 'BRL') moedas[v.moeda] = true; });
  var cambio = opcoes.cambio || {};
  if (!opcoes.cambio && Object.keys(moedas).length) {
    try { cambio = cambioMetas_(ss, Object.keys(moedas), agora); } catch (eC) { avisos.cambio = String(eC); }
  }

  // --- série da Início (classe/marca e o CDI) ---
  var inicioMes = {};
  try {
    var serie = opcoes.serieInicio || montarSerieHistoricoInicio_();
    (serie || []).forEach(function (p) {
      var mes = String(p.data || '').slice(0, 7);
      if (!mes || mes > hojeMes) return;
      var x = inicioMes[mes] || (inicioMes[mes] = { fluxo: {} });
      Object.keys(METAS_BALDES_INICIO_).forEach(function (k) {
        var campos = METAS_BALDES_INICIO_[k];
        if (typeof p[campos[0]] === 'number') x[campos[0]] = p[campos[0]];
        x.fluxo[campos[0]] = (x.fluxo[campos[0]] || 0) + (Number(p[campos[1]]) || 0);
      });
      if (typeof p.indiceCdi === 'number') x.cdi = p.indiceCdi;
    });
  } catch (eS) { avisos.serie = String(eS); }

  // --- ativos (RV e RF) ---
  var tickers = {};
  var titulosRf = [];
  vinculos.forEach(function (v) {
    if (v.tipo !== 'ativo' || !v.id) return;
    var rf = partesIdRfMetas_(v.id);
    if (rf) titulosRf.push({ id: v.id, nome: rf.nome, inst: normalizarInstituicaoChaveRf_(rf.instituicao), marca: rf.marca });
    else tickers[String(v.id).replace(/#\d+$/, '').toUpperCase()] = true;
  });
  var rvMes = {};
  var cambioTickerMes = {};
  var ultimoDiaTicker = {};
  if (Object.keys(tickers).length) {
    try {
      var lp = opcoes.linhasPatrimonio;
      if (!lp) {
        var abaP = ss.getSheetByName('aux_historico-patrimonio');
        lp = abaP && abaP.getLastRow() >= 2 ? lerAbaUmaVez_(abaP, 2, abaP.getLastRow() - 1, 8) : []; // 05/10/2026 (A-33): 1 leitura por execução
      }
      var ultDia = {};
      lp.forEach(function (l) {
        var t = String(l[1] || '').trim().toUpperCase();
        if (!tickers[t]) return;
        var dia = diaIsoMetas_(l[0]);
        if (!dia || dia > hoje || typeof l[7] !== 'number') return;
        var mes = dia.slice(0, 7);
        var chave = t + '|' + mes;
        if (!ultDia[chave] || dia >= ultDia[chave]) {
          ultDia[chave] = dia;
          (rvMes[t] || (rvMes[t] = {}))[mes] = { valor: l[7], fluxo: (rvMes[t] && rvMes[t][mes] ? rvMes[t][mes].fluxo : 0) };
          if (typeof l[6] === 'number' && l[6] > 0) (cambioTickerMes[t] || (cambioTickerMes[t] = {}))[mes] = l[6];
        }
        if (!ultimoDiaTicker[t] || dia > ultimoDiaTicker[t]) ultimoDiaTicker[t] = dia;
      });
      var tr = opcoes.transacoes || {};
      [['br', 'Transações', false], ['usa', 'Transações - USA', true]].forEach(function (cfg) {
        var linhas = tr[cfg[0]];
        if (!linhas) {
          var aba = ss.getSheetByName(cfg[1]);
          // 05/10/2026 (A-31/A-33): última linha REAL (a aba tem fórmula até ~10.800) e a leitura compartilhada de 12 colunas
          var ultimaTr = aba ? ultimaLinhaReal_(aba, [1, 2], 7) : 0;
          linhas = ultimaTr >= 7 ? lerAbaUmaVez_(aba, 7, ultimaTr - 6, 12) : [];
        }
        linhas.forEach(function (l) {
          var t = String(l[0] || '').trim().toUpperCase();
          if (!tickers[t] || !(l[1] instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(l[1])))) return;
          var sinal = l[2] === 'Compra' ? 1 : (l[2] === 'Venda' ? -1 : 0);
          var total = Number(l[7]);
          if (!sinal || !isFinite(total)) return;
          var mes = diaIsoMetas_(l[1]).slice(0, 7);
          if (mes > hojeMes) return;
          var cot = 1;
          if (cfg[2]) cot = (cambioTickerMes[t] && cambioTickerMes[t][mes]) || cotacaoMetas_('USD', cambio) || (typeof cotacaoDolarHoje_ === 'function' ? Number(cotacaoDolarHoje_(ss)) : 0) || 0;
          var x = (rvMes[t] || (rvMes[t] = {}))[mes] || (rvMes[t][mes] = { valor: null, fluxo: 0 });
          x.fluxo += sinal * total * cot;
        });
      });
    } catch (eRv) { avisos.rendaVariavel = String(eRv); }
  }
  var rfMes = {};
  if (titulosRf.length) {
    try {
      var lr = opcoes.linhasRf;
      if (!lr) {
        var abaR = ss.getSheetByName('aux_historico-renda-fixa');
        lr = abaR && abaR.getLastRow() >= 2 ? lerAbaUmaVez_(abaR, 2, abaR.getLastRow() - 1, 6) : []; // 05/10/2026 (A-33)
      }
      var porDia = {};
      lr.forEach(function (l) {
        var dia = diaIsoMetas_(l[0]);
        if (!dia || dia > hoje || typeof l[5] !== 'number') return;
        var emerg = String(l[4] || '') === 'Renda Emergencial';
        titulosRf.forEach(function (tt) {
          if (tt.marca && (tt.marca === 'emergencial') !== emerg) return;
          if (!casaTituloRf_(tt.nome, tt.inst, l[1], l[2])) return;
          var m = porDia[tt.id] || (porDia[tt.id] = {});
          m[dia] = (m[dia] || 0) + l[5];
        });
      });
      Object.keys(porDia).forEach(function (id) {
        var out = rfMes[id] = {};
        Object.keys(porDia[id]).sort().forEach(function (dia) { out[dia.slice(0, 7)] = { valor: porDia[id][dia], fluxo: 0 }; });
      });
      var linhasT = (opcoes.transacoes || {}).rf;
      if (!linhasT) {
        var abaT = ss.getSheetByName('Transações Renda Fixa');
        var cab = typeof LINHA_CABECALHO_TRANSACOES_RF === 'number' ? LINHA_CABECALHO_TRANSACOES_RF : 6;
        var ultimaTRf = abaT ? ultimaLinhaReal_(abaT, [1, 2], cab + 1) : 0; // 05/10/2026 (A-31/A-33)
        linhasT = ultimaTRf > cab ? lerAbaUmaVez_(abaT, cab + 1, ultimaTRf - cab, 8) : [];
      }
      linhasT.forEach(function (l) {
        var mov = String(l[2] || '');
        var sinal = (mov === 'Compra' || mov === 'APLICAÇÃO') ? 1 : ((mov === 'Venda' || mov === 'Resgate') ? -1 : (mov.indexOf('Transfer') === 0 ? (String(l[3] || '').indexOf('Credit') === 0 ? 1 : -1) : 0));
        var valor = Number(l[7]);
        var dia = diaIsoMetas_(l[1]);
        if (!sinal || !isFinite(valor) || !dia || dia > hoje) return;
        titulosRf.forEach(function (tt) {
          if (!casaTituloRf_(tt.nome, tt.inst, l[0], l[4])) return;
          var m = rfMes[tt.id] || (rfMes[tt.id] = {});
          var x = m[dia.slice(0, 7)] || (m[dia.slice(0, 7)] = { valor: null, fluxo: 0 });
          x.fluxo += sinal * valor;
        });
      });
    } catch (eRf) { avisos.rendaFixa = String(eRf); }
  }

  // --- proventos (renda passiva) ---
  var recebidos = null;
  if (metas.some(function (m) { return m.tipo === 'rendaPassiva'; })) {
    // 05/10/2026 (A-17): mesma base da tela Proventos (lançados + pagos presumidos pela data) - o histórico da renda passiva bate com ela
    try {
      var telaProv = opcoes.proventos || montarTelaProventosComCache_();
      recebidos = (typeof recebidosComPresumidos_ === 'function' ? recebidosComPresumidos_(telaProv) : telaProv.recebidos) || [];
    } catch (eP) { avisos.proventos = String(eP); recebidos = []; }
  }

  var fontes = { hojeMes: hojeMes, inicioMes: inicioMes, rvMes: rvMes, rfMes: rfMes, ultimoDiaTicker: ultimoDiaTicker, cambio: cambio, recebidos: recebidos };
  var porMeta = {};
  metas.forEach(function (m) { porMeta[m.id] = historicoDeMeta_(m, fontes); });

  // resumo (aporte real) no cache - vai junto no GET action=metas
  if (!opcoes.semCache) gravarResumoHistoricoMetas_(porMeta, hoje, !!opcoes.id);

  var indices = Object.keys(inicioMes).sort().filter(function (mes) { return typeof inicioMes[mes].cdi === 'number'; }).map(function (mes) { return { mes: mes, cdi: Math.round(inicioMes[mes].cdi * 10000) / 10000 }; });
  var r = { hoje: hoje, metas: porMeta, indices: indices };
  if (Object.keys(avisos).length) r.avisos = avisos;
  return r;
}

/** Série mês a mês de 1 vínculo: { 'aaaa-mm': { valor, fluxo } } (já na fração/valor fixo do vínculo). */
function serieVinculoMetas_(v, fontes) {
  var hojeMes = fontes.hojeMes;
  var base = {};
  if (v.tipo === 'saldo') {
    var cot = cotacaoMetas_(v.moeda, fontes.cambio);
    var hist = (v.historico || []).slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    if (!hist.length && v.saldo > 0) hist = [{ data: v.atualizadoEm || (hojeMes + '-01'), saldo: v.saldo }];
    if (!hist.length || cot == null) return {};
    var mes = hist[0].data.slice(0, 7);
    var anterior = 0;
    var i = 0;
    var atual = 0;
    while (mes <= hojeMes) {
      while (i < hist.length && hist[i].data.slice(0, 7) <= mes) { atual = hist[i].saldo; i++; }
      var valor = atual * cot;
      base[mes] = { valor: valor, fluxo: valor - anterior };
      anterior = valor;
      mes = somarMesMetas_(mes, 1);
    }
    return base;
  }
  if (v.tipo === 'classe' || v.tipo === 'marca') {
    var chave = v.tipo + ':' + (v.tipo === 'classe' ? v.classe : v.marca);
    var campos = METAS_BALDES_INICIO_[chave];
    if (!campos) return {};
    Object.keys(fontes.inicioMes).forEach(function (mes) {
      var x = fontes.inicioMes[mes];
      if (typeof x[campos[0]] !== 'number' && !x.fluxo[campos[0]]) return;
      base[mes] = { valor: Number(x[campos[0]]) || 0, fluxo: x.fluxo[campos[0]] || 0 };
    });
  } else if (v.tipo === 'ativo') {
    var rf = partesIdRfMetas_(v.id);
    if (rf) {
      var m = fontes.rfMes[v.id] || {};
      var meses = Object.keys(m).sort();
      if (meses.length) {
        for (var mesR = meses[0]; mesR <= hojeMes; mesR = somarMesMetas_(mesR, 1)) {
          var xr = m[mesR];
          base[mesR] = { valor: xr && typeof xr.valor === 'number' ? xr.valor : 0, fluxo: xr ? xr.fluxo : 0 };
        }
      }
    } else {
      var t = String(v.id).replace(/#\d+$/, '').toUpperCase();
      var mt = fontes.rvMes[t] || {};
      var mesesT = Object.keys(mt).sort();
      if (mesesT.length) {
        // RV só fecha em pregão: carrega o último valor até o último pregão
        // do ticker (vendido de vez = zero depois; ainda na carteira = até hoje)
        var ultimo = fontes.ultimoDiaTicker[t] ? fontes.ultimoDiaTicker[t].slice(0, 7) : mesesT[mesesT.length - 1];
        var limite = ultimo >= somarMesMetas_(hojeMes, -1) ? hojeMes : ultimo;
        var carregado = 0;
        for (var mesV = mesesT[0]; mesV <= hojeMes; mesV = somarMesMetas_(mesV, 1)) {
          var xv = mt[mesV];
          if (xv && typeof xv.valor === 'number') carregado = xv.valor;
          var val = mesV <= limite ? carregado : 0;
          if (val || (xv && xv.fluxo)) base[mesV] = { valor: val, fluxo: xv ? xv.fluxo : 0 };
        }
      }
    }
  }
  // fração / valor fixo
  var out = {};
  Object.keys(base).forEach(function (mes) {
    var b = base[mes];
    var valor = b.valor, fluxo = b.fluxo;
    if (v.modo === 'fracao') { var f = Number(v.fracao) || 0; valor *= f; fluxo *= f; }
    else if (v.modo === 'valor') { var lim = Number(v.valor) || 0; var nv = Math.min(valor, lim); fluxo = valor > 0 ? fluxo * (nv / valor) : 0; valor = nv; }
    out[mes] = { valor: valor, fluxo: fluxo };
  });
  return out;
}

/** Histórico de 1 meta: { meses: [{ mes, valor, fluxo }], aporteMedio, aporte3m, ..., renda? } */
function historicoDeMeta_(meta, fontes) {
  var hojeMes = fontes.hojeMes;
  var soma = {};
  (meta.vinculos || []).forEach(function (v) {
    var s = serieVinculoMetas_(v, fontes);
    Object.keys(s).forEach(function (mes) {
      var x = soma[mes] || (soma[mes] = { valor: 0, fluxo: 0 });
      x.valor += s[mes].valor; x.fluxo += s[mes].fluxo;
    });
  });
  var meses = Object.keys(soma).sort().filter(function (mes) { return mes <= hojeMes; });
  while (meses.length && Math.abs(soma[meses[0]].valor) < 0.005 && Math.abs(soma[meses[0]].fluxo) < 0.005) meses.shift();
  var lista = meses.map(function (mes) { return { mes: mes, valor: r2Metas_(soma[mes].valor), fluxo: r2Metas_(soma[mes].fluxo) }; });
  var fechados = lista.filter(function (x) { return x.mes < hojeMes; });
  var media = function (arr) { return arr.length ? r2Metas_(arr.reduce(function (s, x) { return s + x.fluxo; }, 0) / arr.length) : null; };
  var ult12 = fechados.slice(-12);
  var out = {
    meses: lista,
    desde: lista.length ? lista[0].mes : null,
    aporteMedio: media(ult12),
    aporte3m: media(fechados.slice(-3)),
    mesesBase: ult12.length,
    mesesComAporte: ult12.filter(function (x) { return x.fluxo > 1; }).length
  };
  if (meta.tipo === 'rendaPassiva' && fontes.recebidos) out.renda = rendaMensalMeta_(meta, fontes);
  return out;
}

/** Proventos pagos mês a mês dos ativos vinculados (sem vínculo = a carteira toda). */
function rendaMensalMeta_(meta, fontes) {
  var hojeMes = fontes.hojeMes;
  var vincs = (meta.vinculos || []).filter(function (v) { return v.tipo === 'classe' || (v.tipo === 'ativo' && !partesIdRfMetas_(v.id)); });
  var semVinculo = !(meta.vinculos || []).length;
  var porMes = {};
  (fontes.recebidos || []).forEach(function (p) {
    var mes = String(p.data || '').slice(0, 7);
    if (!mes || mes > hojeMes || typeof p.valor !== 'number') return;
    var t = aliasTickerMetas_(p.ticker); // 05/10/2026 (A-14/A-17): provento de ticker antigo conta no atual
    var fator = semVinculo ? 1 : 0;
    vincs.forEach(function (v) {
      var casa = v.tipo === 'classe' ? METAS_CLASSE_PROVENTO_[v.classe] === p.classe : aliasTickerMetas_(String(v.id).replace(/#\d+$/, '')) === t;
      if (!casa) return;
      if (v.modo === 'fracao') fator += Number(v.fracao) || 0;
      else if (v.modo === 'valor') {
        var mt = v.tipo === 'ativo' ? fontes.rvMes[t] : null;
        var ultimo = mt ? mt[Object.keys(mt).sort().pop()] : null;
        fator += ultimo && ultimo.valor > 0 ? Math.min(1, (Number(v.valor) || 0) / ultimo.valor) : 1;
      } else fator += 1;
    });
    if (!fator) return;
    porMes[mes] = (porMes[mes] || 0) + p.valor * Math.min(1, fator);
  });
  var meses = Object.keys(porMes).sort();
  if (!meses.length) return [];
  var out = [];
  for (var mes = meses[0]; mes <= hojeMes; mes = somarMesMetas_(mes, 1)) out.push({ mes: mes, valor: r2Metas_(porMes[mes] || 0) });
  return out;
}

function gravarResumoHistoricoMetas_(porMeta, hoje, mesclar) {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (eC) { return; }
  if (!cache) return;
  var resumo = {};
  if (mesclar) { try { resumo = JSON.parse(cache.get(METAS_CACHE_HIST_RESUMO_) || '{}') || {}; } catch (eJ) { resumo = {}; } }
  var porId = resumo.porId || {};
  Object.keys(porMeta).forEach(function (id) {
    var h = porMeta[id];
    porId[id] = { aporteMedio: h.aporteMedio, aporte3m: h.aporte3m, mesesBase: h.mesesBase, mesesComAporte: h.mesesComAporte, desde: h.desde };
  });
  try { cache.put(METAS_CACHE_HIST_RESUMO_, JSON.stringify({ em: hoje, porId: porId }), 6 * 60 * 60); } catch (eP) { /* cache é só atalho */ }
}

/** { <id>: { aporteMedio, ... } } do último histórico calculado (null sem cache). */
function lerResumoHistoricoMetas_() {
  try {
    var bruto = CacheService.getScriptCache().get(METAS_CACHE_HIST_RESUMO_);
    if (!bruto) return null;
    var r = JSON.parse(bruto);
    return r && r.porId ? r.porId : null;
  } catch (e) { return null; }
}
