/**
 * HistoricoInicio.gs — junta os três históricos (Renda Variável, Renda
 * Fixa e Ibovespa) numa série diária única, mais as curvas de CDI e SELIC
 * (base 100, compostas dia a dia) pros benchmarks da Home.
 *
 * Depende de formatarDataBcbRF_ e lerLinhasHistoricoRendaFixa_, que vivem
 * no BackfillRendaFixa.gs — não precisa redefinir, é o mesmo projeto
 * (namespace global compartilhado entre todos os arquivos .gs).
 *
 * Renda Variável (ações/FIIs/USA, via aux_historico-patrimonio) e
 * Ibovespa (via aux_historico-indices) só fecham em dia de pregão, então
 * nos fins de semana/feriados "carrega" o último valor conhecido pra
 * frente (forward-fill). Renda Fixa (via aux_historico-renda-fixa) é
 * calculada dia a dia sem lacuna (o backfill gera uma linha pra cada dia
 * corrido), então usa o valor do próprio dia direto, sem forward-fill.
 *
 * Testado em 12/09/2026: 2090 dias (22/12/2020 -> 11/09/2026), primeiro
 * dia zerado (antes da 1ª movimentação real), último dia com
 * longoPrazo + rendaEmergencial = patrimonio batendo exato.
 *
 * Otimização de 12/09/2026 #1 (lentidão de ~30-60s na ação "home"):
 * montarSerieHistoricoInicio_ agora aceita um parâmetro opcional
 * dadosRendaFixaCache — as linhas já lidas de aux_historico-renda-fixa,
 * pra não ler essa aba de novo quando handleHome (Home.gs) já leu uma vez
 * pra passar também pra montarVariacoesDiaRF_ (MeusAtivos.gs). Chamando
 * essa função sozinha (ação "historico_inicio" via Router.gs) ela continua
 * funcionando igual, sem passar nada — só lê a aba ela mesma.
 *
 * Otimização de 12/09/2026 #2 (a #1 sozinha não bastava — o Tiago apontou
 * que os fatores de CDI/SELIC ainda vinham de 2 fetches diretos pro BCB
 * cobrindo o histórico inteiro TODA chamada, o que não devia ser
 * necessário já que taxa de dia passado não muda): os fatores de CDI/SELIC
 * pararam de vir de buscarFatoresDiariosBcb_ (fetch ao vivo) e passaram a
 * vir de aux_historico-indices (Índice = 'CDI'/'SELIC', Valor = taxa % do
 * dia) — mesmo padrão já usado pelo Ibovespa nessa aba, mantido em dia
 * pelo gatilho diário (ver atualizarTaxasBcbIncremental_, em
 * BackfillIndices.gs). Lidas na MESMA passada de getValues() que já lia o
 * Ibovespa, então não é uma leitura a mais. IMPORTANTE: pra essa aba ter
 * dado de CDI/SELIC, rodarBackfillTaxasBcbDireto() (BackfillIndices.gs)
 * precisa ter rodado pelo menos uma vez — sem isso, os mapas vêm vazios e
 * as curvas de CDI/SELIC ficam em 100 (não erra, só fica sem dado).
 *
 * Otimização de 12/09/2026 #3 (as #1 e #2 derrubaram de ~78s pra ~42s, mas
 * ainda é lento demais pra só ler planilha): o gargalo restante era
 * chaveDiaISOInicio_ chamando Utilities.formatDate(data,
 * Session.getScriptTimeZone(), ...) — e isso é chamado UMA VEZ POR LINHA
 * de aux_historico-patrimonio (dezenas de milhares de linhas: 1 por
 * ticker por dia de pregão) + 1x por linha de aux_historico-renda-fixa +
 * 1x por linha de aux_historico-indices + 2x por dia no loop final
 * (~2090 dias) — total na casa de 60-70 mil chamadas. Utilities.formatDate
 * (e Session.getScriptTimeZone(), chamado de novo a cada vez dentro dela)
 * é uma chamada de SERVIÇO do Apps Script (cruza pro backend, não é JS
 * puro) — em loop isso é um gargalo clássico e conhecido do Apps Script,
 * bem mais caro que o equivalente em JS puro. Troquei por um
 * Intl.DateTimeFormat (nativo do V8, sem cruzar pro backend) criado UMA
 * vez só (cacheado em variável de módulo) e reaproveitado em toda
 * chamada — mesmo fuso (Session.getScriptTimeZone(), lido uma única vez),
 * mesmo formato de saída, só que ordens de grandeza mais rápido em volume
 * alto.
 *
 * Otimização de 13/09/2026 #4 (Tiago apontou: os históricos só mudam 1x
 * por dia — pelo gatilho — ou quando roda um backfill manual; não faz
 * sentido reler as 3 abas inteiras + refazer o loop de ~2090 dias em toda
 * chamada, mesmo quando nada mudou desde a última vez): o resultado desta
 * função agora é cacheado (CacheService, 6h — o máximo permitido), com uma
 * chave baseada na CONTAGEM de linhas das 3 abas de origem (não um TTL
 * cego) — assim, o cache invalida sozinho assim que qualquer uma delas
 * ganha linha nova (gatilho diário OU backfill manual), sem depender de
 * "lembrar" de invalidar na mão. Contar linhas é uma chamada barata
 * (getLastRow(), não getValues()) — então mesmo numa chamada com cache
 * VÁLIDO, o custo extra pra confirmar isso é desprezível, e a leitura
 * pesada + o loop de ~2090 dias são pulados inteiramente. Como o payload
 * pode passar de 100KB (limite por chave do CacheService), é gravado em
 * pedaços (ver gravarSerieHistoricoCache_/lerSerieHistoricoCache_).
 *
 * Instrumentação de 13/09/2026 (Tiago rodou 4 rodadas seguidas do teste
 * paralelo/sequencial após o deploy da otimização #4 e não viu a melhora
 * esperada — pelo contrário, os tempos flutuaram e uma rodada teve um pico
 * isolado de ~34-38s): sem log de HIT/MISS não dava pra saber, só olhando o
 * tempo total, se o cache estava realmente sendo usado ou se cada chamada
 * caía em MISS por algum motivo (ex.: token.iat mudando não afeta a chave,
 * mas qualquer diferença na contagem de linhas das 3 abas de origem
 * invalidaria). Agora montarSerieHistoricoInicio_ loga explicitamente
 * "cache HIT"/"cache MISS" (com a chave usada) e o tempo de cada etapa
 * (checagem do cache, gravação do cache) — assim o próximo teste mostra
 * direto, no Cloud Logging, qual caminho rodou em cada chamada, em vez de
 * inferir pelo tempo total (que também sofre a variação normal do lado do
 * Google Sheets, já observada antes).
 */

/**
 * Correção de 13/09/2026 (Tiago comparou com o Gorilla e reparou que
 * "desde o início" mostrava +5.726% em vez de algo perto do ~75% real):
 * historico[i].patrimonio é só valor de mercado, sem noção nenhuma de
 * quanto foi aporte/retirada/provento recebido - e a Rentabilidade
 * (inicio.js!normalizarSerieRentabilidade) fazia (valor_hoje/valor_base
 * - 1), tratando TODO aporte novo como se fosse ganho. Cada item da
 * série agora também carrega fluxoCaixaPatrimonio/fluxoCaixaLongoPrazo/
 * fluxoCaixaRendaEmergencial (ver calcularFluxoCaixaDiario_,
 * FluxoCaixaInicio.gs) - o fluxo líquido do dia, calculado a partir de
 * Transações/Transações - USA/Transações Renda Fixa/Proventos/Proventos
 * - USA - que o front-end usa pra montar um retorno "time-weighted"
 * (TWR) de verdade, neutralizando esse efeito.
 *
 * Correção de 13/09/2026 #2 ("quedas fantasma" - depois da correção do
 * TWR acima, Tiago reparou que o gráfico de "6 meses" tinha vários
 * trechos caindo até -45/-78% e voltando ao normal poucos dias depois,
 * sem nada parecido no Gorilla): o forward-fill de Renda Variável era
 * por DIA (se o dia tinha QUALQUER linha em aux_historico-patrimonio,
 * usava a soma daquele dia), não por TICKER - então um dia com linha de
 * só ALGUNS tickers (feriado da B3, onde só Ações EUA operam - ex.:
 * Tiradentes, 21/04 -, ou uma falha pontual do câmbio USD/BRL no
 * backfill que deixa Valor BRL em branco só pras Ações EUA daquele dia)
 * derrubava o total do dia inteiro, em vez de manter congelados só os
 * tickers sem dado novo. Virou forward-fill por ticker (ver
 * atualizacoesPorDiaTicker/valorAtualPorTicker, no corpo da função) -
 * validado reprocessando o histórico real do Tiago: as quedas de -20% a
 * -78% sumiram todas, sem tocar em nenhum dia com aumento de patrimônio
 * de verdade.
 *
 * Extensão de 19/09/2026 (gráficos "Rentabilidade acumulada" +
 * "Evolução do patrimônio" por classe, nas 4 subpáginas de Carteiras —
 * pedido do Tiago, seguindo o mockup já decidido): cada item da série
 * ganhou os campos por classe/benchmark abaixo, calculados na MESMA
 * passada de leitura (nenhuma aba lida de novo, nenhum loop a mais) —
 * decisão de reaproveitar esta MESMA série cacheada em vez de criar uma
 * rota nova, mesmo padrão já usado por CarteirasHome.gs/
 * carteiras-visao-geral.js ("confirmado com o Tiago que dá pra
 * reaproveitar, sem precisar de rota nova"):
 *  - `acoes`/`fiis`/`acoesEua`: mesmo forward-fill por ticker de sempre
 *    (atualizacoesPorDiaTicker), só que a soma agora é separada por
 *    classePorTicker (BR/FII/USA) em vez de só somar tudo junto em
 *    `patrimonio`. `acoesEua` é o mesmo valor que já dava pra derivar de
 *    patrimonio-nacional (ver comentário de `nacional` acima), só que
 *    exposto direto - mais simples pro front-end de Carteiras não
 *    precisar reimplementar essa subtração.
 *  - `rendaFixaTotal`/`rendaFixaLongoPrazo`: mesma leitura de
 *    aux_historico-renda-fixa de sempre - rendaFixaTotal é o total de RF
 *    (== porDiaRendaFixaTotal do dia, já calculado, só nunca exposto
 *    antes) e rendaFixaLongoPrazo = rendaFixaTotal − rendaEmergencial
 *    (mesma subtração que `longoPrazo` já faz pro patrimônio inteiro,
 *    aqui restrita só à Renda Fixa). `rendaEmergencial` (campo que já
 *    existia) passa a servir de campo "RF-emergencial" direto também -
 *    é exatamente o mesmo número, sem precisar de um campo novo.
 *  - `ifix`/`sp500`: mesma leitura de aux_historico-indices de sempre
 *    (mesma passada que já lê Ibovespa/CDI/SELIC), com forward-fill
 *    (carrega o último valor conhecido) - IFIX/S&P 500 só fecham em dia
 *    de pregão do seu mercado, igual Ibovespa. Ficam `null` até o
 *    backfill de cada um rodar (rodarBackfillIfixDireto()/
 *    rodarBackfillSp500Direto(), BackfillIndices.gs) - o front-end trata
 *    `null` mostrando "sem histórico suficiente", nunca quebra.
 *  - `indiceIpca`: mesma técnica de indiceCdi/indiceSelic (índice base
 *    100, composto dia a dia) - só que IPCA (série 433 do BCB) é MENSAL,
 *    não diária, então o fator só muda ~1x por mês (nos outros dias, sem
 *    fatoresIpca[chaveBcb], o índice simplesmente não multiplica por
 *    nada e fica igual ao dia anterior - o MESMO código de
 *    indiceCdi/indiceSelic já funciona pra isso sem nenhuma mudança,
 *    granularidade menor só significa "fator ausente com mais
 *    frequência").
 *    23/09/2026 #8: agora pro rata - o IPCA do mês é espalhado pelos dias
 *    corridos do próprio mês (ver leitura de fatoresIpca), em vez de
 *    entrar inteiro no dia 1º.
 *  - `fluxoCaixaAcoes`/`fluxoCaixaFiis`/`fluxoCaixaAcoesEua`/
 *    `fluxoCaixaRendaFixaTotal`/`fluxoCaixaRendaFixaLongoPrazo`: vêm de
 *    calcularFluxoCaixaDiario_ (FluxoCaixaInicio.gs), agora chamado
 *    passando `classePorTicker` (ver extensão de 19/09/2026 naquele
 *    arquivo) - pro TWR de cada gráfico por classe neutralizar só o
 *    aporte/retirada DAQUELA classe, nunca das outras.
 * v6 (19/09/2026): bump de versão de cache por causa dos campos novos -
 * mesmo motivo do v2/v3/v4/v5 acima (sem isso, uma chave já cacheada com
 * as mesmas 4 contagens devolveria o formato ANTIGO, sem os campos
 * novos, por até 6h depois de colar este arquivo).
 */

var ABA_PATRIMONIO_INICIO = 'aux_historico-patrimonio';
var ABA_INDICES_INICIO = 'aux_historico-indices';

function handleHistoricoInicio(e, auth) {
  if (!auth || !auth.ok) {
    return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  }
  try {
    return jsonOut({ ok: true, serie: montarSerieHistoricoInicio_() });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'historicoInicio', erro: String(err) });
  }
}

function testarHistoricoInicioDireto() {
  var serie = montarSerieHistoricoInicio_();
  Logger.log('Total de dias: ' + serie.length);
  Logger.log('Primeiro dia: ' + JSON.stringify(serie[0]));
  Logger.log('Último dia: ' + JSON.stringify(serie[serie.length - 1]));
}

/**
 * @param {Array} dadosRendaFixaCache opcional — linhas de aux_historico-renda-fixa
 *   já lidas por quem chamou (ver handleHome, Home.gs). Se não vier, lê a
 *   aba aqui mesmo (comportamento antigo, usado pela ação "historico_inicio"
 *   sozinha).
 */
function montarSerieHistoricoInicio_(dadosRendaFixaCache) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 13/09/2026 (correção "quedas fantasma" - Tiago comparou com o Gorilla e
  // viu o gráfico de 6 meses com vários trechos caindo até -45/-78% e
  // voltando ao normal poucos dias depois, sem nada parecido no Gorilla):
  // ANTES, essa era uma soma direta por dia (chave -> soma Valor BRL de
  // TODOS os tickers daquele dia), e o forward-fill (mais abaixo) só
  // olhava se o dia tinha "alguma" linha em aux_historico-patrimonio,
  // sem notar quando um dia tem linha de ALGUNS tickers mas não de
  // outros - dois casos reais disso: (1) feriado da B3 (ex.: Tiradentes,
  // 21/04) - Ações EUA operam, então o dia "existe" na soma, mas as
  // ações/FIIs BR não têm linha nenhuma nesse dia (mercado fechado) e
  // saem inteiras da soma, não só congeladas; (2) o câmbio USD/BRL do
  // dia falhou no backfill (Sync.gs) só pra ela - o preço em USD veio
  // certinho, mas Valor BRL fica em branco pra TODAS as ações EUA
  // naquele dia. Nos dois casos, a soma "existe" (tem linha de outros
  // tickers), então o forward-fill antigo não entrava em ação e o total
  // do dia saía artificialmente menor.
  // Agora guarda o Valor BRL por TICKER por dia (só quando a célula não
  // está em branco) e o forward-fill roda por ticker (ver
  // atualizarSomaVariavelDoDia_ no loop principal) - cada ticker sem
  // linha (ou com câmbio em branco) naquele dia mantém seu ÚLTIMO valor
  // válido, e só entram na soma do dia os tickers que realmente
  // mudaram - nunca zera um pedaço inteiro do patrimônio por um gap
  // pontual de 1 dia num ticker só.
  var atualizacoesPorDiaTicker = {}; // chave -> { ticker: valorBrl (só quando não está em branco) }
  var classePorTicker = {};        // ticker -> 'BR'/'FII'/'USA' (última classe vista) - base do forward-fill "Nacional" (exclui USA) mais abaixo
  var porDiaRendaFixaTotal = {};   // chave -> soma Valor BRL (todas as posições RF)
  var porDiaRendaEmergencial = {}; // chave -> soma Valor BRL (só Classificação = Renda Emergencial)
  var porDiaIbovespa = {};         // chave -> valor do Ibovespa
  var porDiaIfix = {};             // chave -> valor do IFIX (19/09/2026, gráfico de FIIs em Carteiras)
  var porDiaSp500 = {};            // chave -> valor do S&P 500 (19/09/2026, gráfico de Ações EUA em Carteiras)
  // Câmbio USD/BRL por dia (só existe pra classe USA) - montado na MESMA
  // passada que lê aux_historico-patrimonio logo abaixo, reaproveitado
  // por calcularFluxoCaixaDiario_ (FluxoCaixaInicio.gs) pra converter as
  // Transações - USA pra R$ sem reler essa aba de novo (ver correção de
  // 13/09/2026 no cabeçalho do arquivo).
  var mapaCambioUsd = {};

  // 1) aux_historico-patrimonio (Renda Variável: Ações/FIIs/USA)
  var abaPatrimonio = ss.getSheetByName(ABA_PATRIMONIO_INICIO);
  if (!abaPatrimonio) throw new Error('aba não encontrada: ' + ABA_PATRIMONIO_INICIO);
  var linhasPatrimonio = Math.max(abaPatrimonio.getLastRow() - 1, 0);

  // Contagem de aux_historico-renda-fixa pra chave de cache — barata
  // (getLastRow(), sem ler os dados) quando ninguém passou o cache pronto;
  // se já veio pronto (dadosRendaFixaCache, ver handleHome), usa o length
  // dele direto, sem chamada nenhuma a mais.
  var linhasRendaFixaCount = dadosRendaFixaCache
    ? dadosRendaFixaCache.length
    : Math.max(ss.getSheetByName(ABA_HISTORICO_RF).getLastRow() - 1, 0);

  // 3) aux_historico-indices — só a contagem por enquanto, barata (ver
  // motivo acima); a leitura de verdade só acontece se der cache miss.
  var abaIndices = ss.getSheetByName(ABA_INDICES_INICIO);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_INDICES_INICIO);
  var linhasIndices = Math.max(abaIndices.getLastRow() - 1, 0);

  // A chave muda sozinha assim que QUALQUER uma das 3 abas ganha linha
  // nova (gatilho diário ou backfill manual) — enquanto as 3 contagens
  // não mudarem, o resultado de hoje é idêntico ao de ontem, então pula
  // direto pro cache em vez de reler tudo e refazer o loop de ~2090 dias.
  // Contagem das 5 abas-fonte do fluxo de caixa (Transações/Transações -
  // USA/Transações Renda Fixa/Proventos/Proventos - USA) - ver correção
  // de 13/09/2026 no cabeçalho do arquivo. Mesmo princípio das outras 3
  // contagens acima: getLastRow() é barato, e a chave muda sozinha assim
  // que o Tiago registra um aporte/retirada/provento novo.
  var contagemFluxoCaixa = contarLinhasFluxoCaixa_(ss);

  // v2 (13/09/2026): mudou o FORMATO do item da série (ganhou os campos
  // fluxoCaixa*) - bump de versão pra nunca devolver, por engano, um
  // item cacheado da v1 sem esses campos (o TTL de 6h sozinho demoraria
  // até 6h pra "descobrir" isso organicamente).
  // v3 (13/09/2026 #2, correção das "quedas fantasma"): o FORMATO do item
  // não mudou dessa vez, mas a CONTA de patrimonio/longoPrazo/
  // rendaEmergencial mudou (forward-fill por ticker, não mais por dia) -
  // sem esse bump, uma chave v2 já cacheada (mesmas contagens de linha,
  // já que nenhuma aba ganhou linha nova) devolveria o resultado ANTIGO
  // (com as quedas) por até 6h depois do Tiago colar o código novo.
  // v4 (17/09/2026, ponto ruim do Ibovespa): a chave só muda quando a
  // CONTAGEM de linhas de alguma das 3 abas muda - um valor ERRADO
  // corrigido NO LUGAR (mesma linha, mesma contagem - foi o caso aqui:
  // Ibovespa de 16/09 tinha um valor absurdo, Tiago corrigiu a célula na
  // planilha, mas linhasIndices continuou igual) não invalida o cache
  // sozinho - o app continuava mostrando a % velha (Ibovespa -99,94%)
  // por até 6h mesmo com a planilha já certa. Sem jeito barato de saber
  // "o CONTEÚDO mudou" sem reler as abas inteiras (o que anularia a
  // otimização de cache pra começo de conversa) - bump manual de versão,
  // mesmo remédio já usado no v3, pra forçar todo mundo a recalcular
  // agora em vez de esperar o TTL.
  // v5 (17/09/2026 #2, "Patrimônio Nacional" + comparativo "ontem era"):
  // o item da série ganhou os campos nacional/pregao/fluxoCaixaNacional -
  // mesmo motivo do bump v2, pra nunca devolver um item cacheado da v4
  // sem esses campos novos.
  var chaveCacheSerie = montarChaveCacheSerie_(linhasPatrimonio, linhasRendaFixaCount, linhasIndices, contagemFluxoCaixa);

  // Instrumentação de 13/09/2026: log explícito de HIT/MISS + tempo de
  // leitura do cache, pra parar de inferir "tá cacheando?" só olhando o
  // tempo total (que também varia por causa da planilha em si). Assim,
  // toda chamada real deixa no Cloud Logging qual dos dois caminhos rodou.
  var marcaCache = Date.now();
  var serieCacheada = lerSerieHistoricoCache_(chaveCacheSerie);
  var msLeituraCache = Date.now() - marcaCache;
  if (serieCacheada) {
    console.log('montarSerieHistoricoInicio_: cache HIT (chave=' + chaveCacheSerie + ', leitura do cache levou ' + msLeituraCache + 'ms)');
    return serieCacheada;
  }
  console.log('montarSerieHistoricoInicio_: cache MISS (chave=' + chaveCacheSerie + ', checagem levou ' + msLeituraCache + 'ms) — recalculando do zero');

  // 23/09/2026: "hoje" no fuso do projeto - nenhuma linha datada DEPOIS
  // de hoje entra na série (ver comentário de chaveHojeLeitura_ no
  // bloco de Renda Fixa, logo abaixo, pro caso real que motivou isso).
  var chaveHojeLeitura_ = chaveDiaISOInicio_(new Date());
  var linhasRvPorTicker_ = {}; // ticker -> [{ chave, preco, valorBrl, classeBruta }] (só linhas com Valor BRL preenchido)

  if (linhasPatrimonio > 0) {
    abaPatrimonio.getRange(2, 1, linhasPatrimonio, 8).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      var chave = chaveDiaISOInicio_(data);
      if (chave > chaveHojeLeitura_) return;
      var ticker = linha[1];
      // Câmbio (coluna G, só preenchida pra classe USA) - ver mapaCambioUsd acima.
      // Lido ANTES do filtro de ticker abaixo: o câmbio do dia é o mesmo
      // pra qualquer linha USA, venha ela de que ticker vier.
      if (linha[2] === 'USA' && typeof linha[6] === 'number' && linha[6]) {
        mapaCambioUsd[chave] = linha[6];
      }
      // 23/09/2026: ver TICKERS_FORA_DO_HISTORICO (Sync.gs) - STR.
      if (tickerForaDoHistoricoInicio_(ticker)) return;
      // Valor BRL (coluna H) vem em branco ('') quando o câmbio do dia
      // faltou no backfill pra essa linha (só acontece pra classe USA) -
      // tratar como "sem dado hoje" (fica de fora, ver comentário acima),
      // nunca como 0 - Number('') seria 0 e zeraria o ticker inteiro
      // naquele dia por engano.
      if (linha[7] === '' || linha[7] == null) return;
      var valorBrl = Number(linha[7]);
      if (isNaN(valorBrl)) return;
      if (!linhasRvPorTicker_[ticker]) linhasRvPorTicker_[ticker] = [];
      linhasRvPorTicker_[ticker].push({
        chave: chave, preco: Number(linha[4]), cotasAux: Number(linha[3]), cambio: Number(linha[6]) || null,
        valorBrl: valorBrl, classeBruta: linha[2]
      });
      // 20/09/2026 (bug real, achado com dados reais do Tiago —
      // "gráfico de Ações considerando o patrimônio de Renda Variável
      // todo, não só Ações"): a coluna "Classe" de aux_historico-
      // patrimonio SÓ existe como 'BR' ou 'USA' — quem escreve essa
      // coluna (Sync.gs!gravarLinhasHistorico_) nunca grava 'FII'.
      // Reclassificado aqui, na leitura, contra TICKERS_FIIS_BR (Sync.gs,
      // mesmo projeto Apps Script/namespace global).
      classePorTicker[ticker] = (linha[2] === 'BR' && typeof TICKERS_FIIS_BR !== 'undefined' && TICKERS_FIIS_BR.indexOf(ticker) !== -1)
        ? 'FII'
        : linha[2];
    });
  }


  // 2) aux_historico-renda-fixa (calculado dia a dia, sem lacunas — não
  // precisa de forward-fill, ao contrário da Renda Variável e do Ibovespa).
  // Reaproveita a leitura de quem chamou, se veio pronta (ver comentário
  // do parâmetro acima) — senão lê aqui mesmo, igual antes.
  var linhasRendaFixa = dadosRendaFixaCache || lerLinhasHistoricoRendaFixa_();
  var linhasRfLidas_ = [];
  linhasRendaFixa.forEach(function (linha) {
    var data = linha[0];
    if (!(data instanceof Date)) return;
    var chave = chaveDiaISOInicio_(data);
    // 23/09/2026: soma só DEPOIS do fluxo de caixa - precisa da 1ª compra
    // de cada posição (alinhamento de data, ver abaixo) e de
    // posicoesRfZeradas (restos de posições já zeradas), as duas vindas de
    // FluxoCaixaInicio.gs. O corte de "nada no futuro" também é feito lá,
    // DEPOIS do alinhamento.
    linhasRfLidas_.push({ chave: chave, posicao: linha[1] + '|' + linha[2], classificacao: linha[4], valorBrl: Number(linha[5]) || 0 });
  });

  // 3) aux_historico-indices — Ibovespa (Valor = pontos) e, na MESMA
  // leitura, CDI/SELIC (Valor = taxa % do dia) — ver otimização #2 no
  // cabeçalho do arquivo. Uma passada só de getValues() pros 3. (abaIndices
  // e linhasIndices já foram obtidas acima, pra montar a chave de cache.)
  var fatoresCdi = {};
  var fatoresSelic = {};
  var fatoresIpca = {}; // 19/09/2026: série MENSAL (não diária) - ver comentário no cabeçalho do arquivo
  var taxasLidas_ = []; // 23/09/2026 #2: CDI/SELIC/IPCA crus - ver alinhamento depois do laço
  if (linhasIndices > 0) {
    abaIndices.getRange(2, 1, linhasIndices, 3).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      var nomeIndice = linha[1];
      var valor = Number(linha[2]);
      if ((nomeIndice === 'CDI' || nomeIndice === 'SELIC' || nomeIndice === 'IPCA') && !isNaN(valor)) {
        taxasLidas_.push({ data: data, nome: nomeIndice, valor: valor });
        return; // ver alinhamento logo depois deste laço
      }
      if (chaveDiaISOInicio_(data) > chaveHojeLeitura_) return; // 23/09/2026: nada do futuro (ver bloco de Renda Fixa acima)
      if (nomeIndice === 'Ibovespa') {
        var chave = chaveDiaISOInicio_(data);
        porDiaIbovespa[chave] = isNaN(valor) ? null : valor;
      } else if (nomeIndice === 'IFIX') {
        var chaveIfix = chaveDiaISOInicio_(data);
        porDiaIfix[chaveIfix] = isNaN(valor) ? null : valor;
      } else if (nomeIndice === 'S&P 500') {
        var chaveSp500 = chaveDiaISOInicio_(data);
        porDiaSp500[chaveSp500] = isNaN(valor) ? null : valor;
      }
    });
  }
  // 23/09/2026 #2 (Controle 8): CDI/SELIC/IPCA eram gravados com +1 dia
  // (BackfillIndices.gs!buscarTaxasBcbComoLinhas_, "ajuste de fuso" de
  // 13/09/2026 que partia da mesma leitura errada do .xlsx que o da Renda
  // Fixa - já corrigido lá). Prova no dado real: no fuso de SP, as linhas
  // de CDI/SELIC caem de terça a SÁBADO (nenhuma segunda) e as de IPCA no
  // dia 2 de cada mês. Taxa do BCB só existe em dia útil - se a maioria das
  // linhas cai em sábado/domingo e nenhuma (ou quase) em segunda, a aba
  // inteira está 1 dia adiantada e é realinhada aqui (depois de regravar
  // com rodarBackfillTaxasBcbDireto() o desvio some e nada é deslocado).
  var diaSemanaTaxa_ = function (d) { return dataLocalDeChaveInicio_(chaveDiaISOInicio_(d)).getUTCDay(); };
  var taxasDiarias_ = taxasLidas_.filter(function (x) { return x.nome !== 'IPCA'; });
  var fimDeSemana_ = taxasDiarias_.filter(function (x) { var w = diaSemanaTaxa_(x.data); return w === 0 || w === 6; }).length;
  var segundas_ = taxasDiarias_.filter(function (x) { return diaSemanaTaxa_(x.data) === 1; }).length;
  var deslocarTaxas_ = taxasDiarias_.length > 20 && fimDeSemana_ > 0.1 * taxasDiarias_.length && segundas_ < 0.02 * taxasDiarias_.length;
  ULTIMO_DIAGNOSTICO_TAXAS_INICIO_ = { deslocadasUmDia: deslocarTaxas_, linhasFimDeSemana: fimDeSemana_, linhasSegunda: segundas_ };
  taxasLidas_.forEach(function (x) {
    var d = deslocarTaxas_ ? new Date(x.data.getTime() - 86400000) : x.data;
    if (chaveDiaISOInicio_(d) > chaveHojeLeitura_) return;
    var chaveBcbTaxa = formatarDataBcbRF_(d);
    if (x.nome === 'CDI') fatoresCdi[chaveBcbTaxa] = 1 + (x.valor / 100);
    else if (x.nome === 'SELIC') fatoresSelic[chaveBcbTaxa] = 1 + (x.valor / 100);
    else {
      // 23/09/2026 #8 (Tiago: "veja o ipca"): IPCA é MENSAL (série 433 do
      // BCB, datada no dia 1º do mês de referência). Antes o mês inteiro
      // entrava de uma vez no dia 1º - uma janela de "12 meses" que começa
      // no dia 22 pegava só 11 IPCAs, e "30 dias"/"Mês atual" quase nunca
      // pegavam nenhum. Agora a taxa do mês é espalhada pro rata pelos
      // dias corridos DO PRÓPRIO mês (fator^(1/dias)) - no fim do mês o
      // índice acumulado é exatamente o mesmo de antes. Chave = "MM/AAAA";
      // se a linha cair nos últimos dias do mês (desvio de fuso), é do mês
      // seguinte.
      var dIpca_ = dataLocalDeChaveInicio_(chaveDiaISOInicio_(d));
      if (dIpca_.getUTCDate() >= 20) dIpca_ = new Date(Date.UTC(dIpca_.getUTCFullYear(), dIpca_.getUTCMonth() + 1, 1));
      fatoresIpca[chaveMesIpcaInicio_(dIpca_.getUTCFullYear(), dIpca_.getUTCMonth() + 1)] = 1 + (x.valor / 100);
    }
  });

  // Fluxo de caixa líquido diário (aporte/retirada) - ver correção de
  // 13/09/2026 no cabeçalho do arquivo e em FluxoCaixaInicio.gs. Calculado
  // aqui (não dentro do loop de dias abaixo) porque é 1 leitura por aba
  // de origem, não 1 por dia.
  var fluxoCaixa = calcularFluxoCaixaDiario_(mapaCambioUsd, classePorTicker);

  // 23/09/2026 (investigação do Controle 7 - Tiago: "resolva de uma vez
  // por todas"): cada ticker de Renda Variável passa por
  // processarHistoricoRvDoTicker_ (ver lá, no fim deste arquivo, o
  // porquê de cada passo, com os casos reais):
  //  1) descarta preço isolado absurdo (BBAS3 com o câmbio no lugar do
  //     preço em 18/09/2026);
  //  2) corrige preço histórico do GOOGLEFINANCE que não bate com o preço
  //     que o Tiago REALMENTE pagou (EGIE3/AXIA3/RECR11 com o histórico
  //     "ajustado" ~40% pra baixo);
  //  3) valor do dia = quantidade que as Transações dizem pra aquele dia ×
  //     preço (× câmbio, pra EUA) - não mais a "Cotas" congelada na hora
  //     do sync;
  //  4) a posição nasce no dia da 1ª compra, mesmo se o 1º preço só
  //     apareceu dias depois (BTLG11: comprado 16/05/2022, 1º preço
  //     17/05/2022 - antes, o dia da compra virava um "prejuízo" do
  //     tamanho da compra em todas as visões agregadas).
  // 23/09/2026 #2 (Controle 8 - depois que o Tiago rodou
  // rodarBackfillRendaFixaDireto(), "desde o início" foi pra -48%): o
  // backfill de Renda Fixa gravava cada linha com +1 dia (um "ajuste de
  // fuso" de 13/09/2026 que partia de uma leitura errada do .xlsx - ver
  // BackfillRendaFixa.gs, já corrigido). O histórico antigo (backfill
  // completo de ANTES desse ajuste) estava certo e só as linhas diárias
  // novas vinham com +1 (por isso a última linha era sempre "amanhã");
  // rodar o backfill completo com o ajuste deslocou o histórico INTEIRO um
  // dia pra frente - todo aporte de Renda Fixa virava "prejuízo" num dia e
  // "lucro" no seguinte. Proteção aqui na leitura, que vale pra qualquer
  // desvio desse tipo no futuro: a 1ª linha de cada posição TEM que cair
  // no dia da 1ª compra (Transações Renda Fixa); se cair N dias depois (ou
  // antes, até 3), a posição inteira é deslocada de volta N dias. O desvio
  // encontrado fica em ULTIMO_DIAGNOSTICO_RF_INICIO_ (os testes do harness
  // acusam, pra lembrar de regravar o histórico com o backfill corrigido).
  var primeiraCompraRf_ = fluxoCaixa.primeiraCompraRfPorPosicao || {};
  var primeiraLinhaRf_ = {};
  linhasRfLidas_.forEach(function (l) {
    if (!primeiraLinhaRf_[l.posicao] || l.chave < primeiraLinhaRf_[l.posicao]) primeiraLinhaRf_[l.posicao] = l.chave;
  });
  function diasEntreChaves_(a, b) {
    return Math.round((dataLocalDeChaveInicio_(b).getTime() - dataLocalDeChaveInicio_(a).getTime()) / 86400000);
  }
  function somarDiasChave_(chave, dias) {
    return chaveDeDataUtcInicio_(new Date(dataLocalDeChaveInicio_(chave).getTime() + dias * 86400000));
  }
  var deslocamentoRf_ = {};
  var diagnosticoRf_ = { deslocamentos: [] };
  Object.keys(primeiraLinhaRf_).forEach(function (posicao) {
    var compra = primeiraCompraRf_[posicao];
    if (!compra) return;
    var d = diasEntreChaves_(compra, primeiraLinhaRf_[posicao]);
    if (d !== 0 && Math.abs(d) <= 3) {
      deslocamentoRf_[posicao] = d;
      diagnosticoRf_.deslocamentos.push({ posicao: posicao, dias: d, primeiraCompra: compra, primeiraLinha: primeiraLinhaRf_[posicao] });
    }
  });
  if (diagnosticoRf_.deslocamentos.length) console.log('montarSerieHistoricoInicio_: Renda Fixa com data deslocada, realinhada: ' + JSON.stringify(diagnosticoRf_.deslocamentos));
  ULTIMO_DIAGNOSTICO_RF_INICIO_ = diagnosticoRf_;

  var zeradasRf_ = fluxoCaixa.posicoesRfZeradas || {};
  var restosRfIgnorados_ = 0;
  linhasRfLidas_.forEach(function (l) {
    if (deslocamentoRf_[l.posicao]) l.chave = somarDiasChave_(l.chave, -deslocamentoRf_[l.posicao]);
    // 23/09/2026: nada datado depois de hoje (o backfill antigo gravava a
    // última linha com a data de amanhã - com ela, o último ponto da
    // série não era "hoje" e os valores ao vivo não entravam, ver Home.gs).
    if (l.chave > chaveHojeLeitura_) return;
    var intervalos = zeradasRf_[l.posicao] || [];
    for (var z = 0; z < intervalos.length; z++) {
      if (l.chave >= intervalos[z].desde && (intervalos[z].ate == null || l.chave < intervalos[z].ate)) { restosRfIgnorados_++; return; }
    }
    porDiaRendaFixaTotal[l.chave] = (porDiaRendaFixaTotal[l.chave] || 0) + l.valorBrl;
    if (l.classificacao === 'Renda Emergencial') {
      porDiaRendaEmergencial[l.chave] = (porDiaRendaEmergencial[l.chave] || 0) + l.valorBrl;
    }
  });
  if (restosRfIgnorados_) console.log('montarSerieHistoricoInicio_: ' + restosRfIgnorados_ + ' linha(s) de Renda Fixa de posição já zerada ignorada(s)');

  var bonificacoesPorEmissor_ = montarBonificacoesPorEmissor_(fluxoCaixa.movimentosPorTicker || {});
  var diagnosticoRv_ = { descartesPrecoIsolado: [], correcoesPreco: [], fronteirasIncertas: [], ancoras: [] };
  Object.keys(linhasRvPorTicker_).forEach(function (ticker) {
    var tickerMaiusculo = String(ticker).toUpperCase();
    var resultado = processarHistoricoRvDoTicker_(
      tickerMaiusculo,
      linhasRvPorTicker_[ticker],
      (fluxoCaixa.movimentosPorTicker || {})[tickerMaiusculo] || [],
      bonificacoesPorEmissor_[tickerMaiusculo.slice(0, 4)] || [],
      fluxoCaixa.primeiraCompraPorTicker && fluxoCaixa.primeiraCompraPorTicker[tickerMaiusculo]
        ? chaveDiaISOInicio_(fluxoCaixa.primeiraCompraPorTicker[tickerMaiusculo])
        : null
    );
    resultado.atualizacoes.forEach(function (u) {
      if (!atualizacoesPorDiaTicker[u.chave]) atualizacoesPorDiaTicker[u.chave] = {};
      atualizacoesPorDiaTicker[u.chave][ticker] = u.valorBrl;
    });
    ['descartesPrecoIsolado', 'correcoesPreco', 'fronteirasIncertas', 'ancoras'].forEach(function (k) {
      diagnosticoRv_[k] = diagnosticoRv_[k].concat(resultado[k]);
    });
  });
  if (diagnosticoRv_.descartesPrecoIsolado.length || diagnosticoRv_.correcoesPreco.length || diagnosticoRv_.fronteirasIncertas.length) {
    console.log('montarSerieHistoricoInicio_: diagnóstico RV ' + JSON.stringify({
      descartesPrecoIsolado: diagnosticoRv_.descartesPrecoIsolado,
      correcoesPreco: diagnosticoRv_.correcoesPreco,
      fronteirasIncertas: diagnosticoRv_.fronteirasIncertas
    }));
  }
  ULTIMO_DIAGNOSTICO_RV_INICIO_ = diagnosticoRv_;

  var todasAsChaves = Object.keys(atualizacoesPorDiaTicker)
    .concat(Object.keys(porDiaRendaFixaTotal))
    .concat(Object.keys(porDiaIbovespa));
  if (todasAsChaves.length === 0) {
    gravarSerieHistoricoCache_(chaveCacheSerie, []);
    return [];
  }
  todasAsChaves.sort();

  var primeiraData = dataLocalDeChaveInicio_(todasAsChaves[0]);
  // 21/09/2026 (a pedido do Tiago - "quero que os números do resumo de
  // carteira sejam coerentes com o número da evolução do patrimônio, o
  // correto deve aparecer nos dois"): ANTES, ultimaData era sempre o
  // último dia com QUALQUER linha sincronizada (aux_historico-*) - se o
  // gatilho diário (Sync.gs!gatilhoDiario, roda ~10h) ainda não tinha
  // rodado hoje (ou é domingo, quando ele nem tenta), a série inteira
  // "hoje" simplesmente não existia - o gráfico de Evolução parava
  // ONTEM, e handleHome (Home.gs) sobrescreve exatamente o ÚLTIMO PONTO
  // com os valores AO VIVO de montarHome_() (ver comentário lá) - sem um
  // ponto "hoje" pra sobrescrever, os cards (ao vivo) e o gráfico
  // (parado ontem) inevitavelmente mostravam números diferentes.
  // Agora ultimaData NUNCA fica antes de hoje - se o sync de hoje ainda
  // não rodou, o loop abaixo ainda roda 1 iteração extra pra "hoje"
  // usando o forward-fill normal (mesmo mecanismo já usado pra
  // fim de semana/feriado, ver comentário na função inteira) + o fluxo
  // de caixa de hoje (calcularFluxoCaixaDiario_ já lê as abas de
  // Transações direto, sem depender do sync) - essa linha extra fica com
  // os valores de ONTEM até handleHome sobrescrever com o ao vivo.
  var chaveHojeUltimaData_ = chaveDiaISOInicio_(new Date());
  var chaveUltimaDataSincronizada_ = todasAsChaves[todasAsChaves.length - 1];
  var ultimaData = dataLocalDeChaveInicio_(
    chaveHojeUltimaData_ > chaveUltimaDataSincronizada_ ? chaveHojeUltimaData_ : chaveUltimaDataSincronizada_
  );

  var serie = [];
  var indiceCdi = 100;
  var indiceSelic = 100;
  var indiceIpca = 100; // 19/09/2026 (ver cabeçalho do arquivo) - mesma técnica de indiceCdi/indiceSelic, granularidade mensal
  // Último Valor BRL conhecido de CADA ticker (Ações/FIIs/USA) - forward-fill
  // por ticker (ver comentário em atualizacoesPorDiaTicker, acima) - e a soma
  // corrente deles, que é o que realmente vira "patrimônio de Renda Variável"
  // do dia. somaVariavelAtual só muda quando um ticker tem uma atualização de
  // verdade (linha nova, câmbio presente); um ticker sem novidade hoje segue
  // contribuindo com o valor que já estava somado, nunca some da soma.
  var valorAtualPorTicker = {};
  var somaVariavelAtual = 0;
  var somaVariavelNacionalAtual = 0; // igual somaVariavelAtual, mas ignora tickers de classe USA - base do "Patrimônio Nacional"
  // 19/09/2026: mesmas somas, mas separadas por classe - base dos campos
  // acoes/fiis/acoesEua (ver cabeçalho do arquivo). somaUsaAtual é
  // exatamente o mesmo valor que já dava pra derivar de
  // somaVariavelAtual - somaVariavelNacionalAtual, só exposto direto.
  var somaAcoesAtual = 0;
  var somaFiisAtual = 0;
  var somaUsaAtual = 0;
  var ultimoIbovespa = null;
  // 21/09/2026 (ver comentário de ultimaData, acima nesta mesma função):
  // forward-fill de Renda Fixa igual ao que Ibovespa/IFIX/S&P 500 já
  // fazem logo abaixo - só existe pra cobrir o dia "hoje" ARTIFICIAL que
  // ultimaData agora sempre inclui (sync de hoje ainda não rodou). Nos
  // dias normais (sync já rodou, linha existe) não muda nada - o valor
  // do próprio dia sempre pisa em cima do forward-fill na mesma
  // iteração, exatamente como já era antes desta rodada.
  var ultimoRendaFixaTotalConhecido_ = 0;
  var ultimoRendaEmergencialConhecido_ = 0;
  var ultimoIfix = null;
  var ultimoSp500 = null;

  // 24/09/2026 (Tiago: "em Ações EUA, me dê a opção de ver em reais ou em
  // dólar"): câmbio USD->BRL de cada dia na série (`cambioUsd`) - o MESMO
  // câmbio (forward-fill de mapaCambioUsd, cambioUsdParaData_) que já
  // converte o valor das posições USA e as Transações/Proventos - USA
  // (FluxoCaixaInicio.gs). Assim o front divide acoesEua/fluxo*AcoesEua
  // por ele e obtém exatamente os valores em dólar. null antes do 1º
  // câmbio conhecido (não existia posição USA ainda).
  var chavesCambioSerie_ = Object.keys(mapaCambioUsd).sort();
  var dataAtual = new Date(primeiraData);
  while (dataAtual <= ultimaData) {
    var chaveAtual = chaveDiaISOInicio_(dataAtual);

    // Renda Variável: cada ticker fecha só em dia de pregão do SEU mercado
    // (feriado da B3 não fecha Ações EUA, e vice-versa) - forward-fill por
    // ticker, não por "o dia teve alguma linha" (ver correção de 13/09/2026
    // no cabeçalho do arquivo).
    // 20/09/2026 (bug real - ver cabeçalho do arquivo e de
    // FluxoCaixaInicio.gs!calcularFluxoCaixaDiario_): fluxo IMPLÍCITO de
    // hoje, só pras séries POR CLASSE usadas no TWR das subpáginas de
    // Carteiras (fluxoCaixaAcoes/Fiis/AcoesEua) - nunca em
    // fluxoCaixaPatrimonio/LongoPrazo/Nacional (usados por "quanto
    // investi" da Início), que já vêm certos direto de Transações, sem
    // depender de quando o preço foi sincronizado.
    var flowExtraAcoesHoje = 0;
    var flowExtraFiisHoje = 0;
    var flowExtraUsaHoje = 0;
    var atualizacoesHoje = atualizacoesPorDiaTicker[chaveAtual];
    if (atualizacoesHoje) {
      for (var tickerAtualizado in atualizacoesHoje) {
        var valorNovo = atualizacoesHoje[tickerAtualizado];
        var jaTinhaValor = Object.prototype.hasOwnProperty.call(valorAtualPorTicker, tickerAtualizado);
        var valorAntigo = valorAtualPorTicker[tickerAtualizado] || 0;
        var deltaTicker = valorNovo - valorAntigo;
        somaVariavelAtual += deltaTicker;
        var classeDoTicker = classePorTicker[tickerAtualizado];
        if (classeDoTicker !== 'USA') somaVariavelNacionalAtual += deltaTicker;
        // 19/09/2026 (ver cabeçalho do arquivo): mesma soma, separada por
        // classe - ticker sem classe conhecida ainda (nunca sincronizado)
        // não entra em nenhum dos 3, mas continua contando em
        // somaVariavelAtual acima normalmente.
        if (classeDoTicker === 'BR') somaAcoesAtual += deltaTicker;
        else if (classeDoTicker === 'FII') somaFiisAtual += deltaTicker;
        else if (classeDoTicker === 'USA') somaUsaAtual += deltaTicker;
        // 20/09/2026 (ver cabeçalho do arquivo): 1ª vez que ESTE ticker
        // aparece na série - se o preço só chegou (aux_historico-
        // patrimonio) DEPOIS da 1ª Compra de verdade (Transações), esse
        // delta inteiro é posição nova entrando, nunca "retorno de
        // mercado" - soma como fluxo implícito só na classe dele. Sem
        // atraso real (o caso normal - preço e compra no mesmo dia), a
        // Compra já neutraliza isso sozinha (fluxoCaixa.acoes/fiis/usa,
        // FluxoCaixaInicio.gs) - não soma de novo aqui, senão conta a
        // mesma coisa 2x.
        if (!jaTinhaValor) {
          var primeiraCompra = fluxoCaixa.primeiraCompraPorTicker && fluxoCaixa.primeiraCompraPorTicker[tickerAtualizado];
          // 23/09/2026: compara por DIA (chave yyyy-MM-dd no fuso do
          // projeto), nunca Date contra Date - dataAtual é meia-noite
          // "local" do runtime e primeiraCompra é o instante gravado na
          // planilha (meia-noite de OUTRO fuso, o da planilha); comparar
          // os dois instantes dava "depois" no próprio dia da 1ª compra,
          // e o valor inteiro do ticker entrava 2x como aporte naquele dia
          // (ex. real: BBSE3+VALE3 em 19/01/2023 -> Carteira de Ações com
          // -101% num dia só, escondido pela trava de plausibilidade).
          if (primeiraCompra && chaveAtual > chaveDiaISOInicio_(primeiraCompra)) {
            if (classeDoTicker === 'BR') flowExtraAcoesHoje += deltaTicker;
            else if (classeDoTicker === 'FII') flowExtraFiisHoje += deltaTicker;
            else if (classeDoTicker === 'USA') flowExtraUsaHoje += deltaTicker;
          }
        }
        valorAtualPorTicker[tickerAtualizado] = valorNovo;
      }
    }
    // Teve pelo menos 1 linha nova de Renda Variável hoje (pregão de
    // verdade em algum mercado) - base do "último pregão" usado no
    // front-end pro comparativo "ontem era" (fins de semana/feriados sem
    // NENHUMA atualização ficam com pregao=false).
    var pregaoHoje = !!atualizacoesHoje;
    var ultimoVariavel = somaVariavelAtual;
    var ultimoVariavelNacional = somaVariavelNacionalAtual;

    // Ibovespa/IFIX/S&P 500: fecham só em dia de pregão do seu mercado,
    // então "carregam" o último valor conhecido nos fins de semana/feriados
    // (IFIX/S&P 500, 19/09/2026, ver cabeçalho do arquivo - mesma técnica).
    if (chaveAtual in porDiaIbovespa) ultimoIbovespa = porDiaIbovespa[chaveAtual];
    if (chaveAtual in porDiaIfix) ultimoIfix = porDiaIfix[chaveAtual];
    if (chaveAtual in porDiaSp500) ultimoSp500 = porDiaSp500[chaveAtual];

    // Renda Fixa: já vem calculada dia a dia (todo santo dia, sem lacuna),
    // então usa o valor do próprio dia direto, sem forward-fill.
    if (chaveAtual in porDiaRendaFixaTotal) ultimoRendaFixaTotalConhecido_ = porDiaRendaFixaTotal[chaveAtual];
    if (chaveAtual in porDiaRendaEmergencial) ultimoRendaEmergencialConhecido_ = porDiaRendaEmergencial[chaveAtual];
    var rendaFixaHoje = ultimoRendaFixaTotalConhecido_;
    var rendaEmergencialHoje = ultimoRendaEmergencialConhecido_;

    // Fluxo de caixa líquido do dia (positivo = aporte/entrada, negativo =
    // retirada/saída) - mesma decomposição Total/Longo Prazo/Renda
    // Emergencial já usada pro patrimônio em si, logo abaixo.
    var fluxoTotalHoje = fluxoCaixa.total[chaveAtual] || 0;
    var fluxoRendaEmergencialHoje = fluxoCaixa.rendaEmergencial[chaveAtual] || 0;
    // fluxoUsaHoje (bruto, SEM a correção de 20/09/2026 abaixo) - usado
    // em fluxoCaixaNacional logo adiante (total − rendaEmergencial − usa,
    // igual sempre foi); a correção de backfill atrasado é só pro TWR da
    // subpágina Internacional (fluxoCaixaAcoesEua), variável separada.
    var fluxoUsaHoje = fluxoCaixa.usa[chaveAtual] || 0;
    // 19/09/2026 (ver cabeçalho do arquivo): fluxo por classe, pro TWR dos
    // gráficos de Rentabilidade acumulada das subpáginas de Carteiras.
    // 20/09/2026: + flowExtra*Hoje (ver bloco de detecção de 1ª aparição,
    // acima nesta mesma iteração do laço de dias) - backfill de preço
    // atrasado (GOOGLEFINANCE) nunca mais devia contar como "retorno".
    var fluxoAcoesHoje = (fluxoCaixa.acoes[chaveAtual] || 0) + flowExtraAcoesHoje;
    var fluxoFiisHoje = (fluxoCaixa.fiis[chaveAtual] || 0) + flowExtraFiisHoje;
    var fluxoAcoesEuaHoje = fluxoUsaHoje + flowExtraUsaHoje;
    var fluxoRendaFixaTotalHoje = fluxoCaixa.rendaFixaTotal[chaveAtual] || 0;

    // 21/09/2026 (pedido do Tiago): mesma decomposição acima, mas pro
    // "Valor aplicado" (capital líquido ainda aplicado - Compra/Venda +
    // Renda Fixa - NUNCA reduzido por provento recebido) - ver
    // FluxoCaixaInicio.gs!porDiaAplicado* pro motivo. Campo separado de
    // fluxoCaixa*, que continua sendo só pro TWR da Rentabilidade (esse
    // sim deduz provento, de propósito).
    var fluxoAplicadoTotalHoje = fluxoCaixa.totalAplicado[chaveAtual] || 0;
    var fluxoAplicadoRendaEmergencialHoje = fluxoCaixa.rendaEmergencialAplicado[chaveAtual] || 0;
    var fluxoAplicadoUsaHoje = fluxoCaixa.usaAplicado[chaveAtual] || 0;
    var fluxoAplicadoAcoesHoje = fluxoCaixa.acoesAplicado[chaveAtual] || 0;
    var fluxoAplicadoFiisHoje = fluxoCaixa.fiisAplicado[chaveAtual] || 0;
    var fluxoAplicadoRendaFixaTotalHoje = fluxoCaixa.rendaFixaTotalAplicado[chaveAtual] || 0;

    var chaveBcb = formatarDataBcbRF_(dataAtual);
    var fatorCdi = fatoresCdi[chaveBcb];
    var fatorSelic = fatoresSelic[chaveBcb];
    // 23/09/2026 #8: IPCA pro rata pelos dias corridos do mês (ver leitura acima)
    var anoAtualIpca_ = Number(chaveAtual.slice(0, 4)), mesAtualIpca_ = Number(chaveAtual.slice(5, 7));
    var fatorMesIpca = fatoresIpca[chaveMesIpcaInicio_(anoAtualIpca_, mesAtualIpca_)];
    var fatorIpca = fatorMesIpca ? Math.pow(fatorMesIpca, 1 / new Date(Date.UTC(anoAtualIpca_, mesAtualIpca_, 0)).getUTCDate()) : null;
    if (fatorCdi) indiceCdi *= fatorCdi;
    if (fatorSelic) indiceSelic *= fatorSelic;
    if (fatorIpca) indiceIpca *= fatorIpca;

    var patrimonioTotal = ultimoVariavel + rendaFixaHoje;
    // Nacional = Longo Prazo menos tudo que é classe USA (ver
    // somaVariavelNacionalAtual acima) - mesma fórmula que Home.gs usa
    // pro valor atual (longoPrazo - porClasse.acoesEua), só que dia a dia.
    var patrimonioNacional = ultimoVariavelNacional + rendaFixaHoje - rendaEmergencialHoje;
    // 19/09/2026: Renda Fixa "Longo Prazo" de VERDADE (só RF, sem o
    // patrimônio variável junto) - não confundir com o `longoPrazo` do
    // patrimônio inteiro logo abaixo (esse é "tudo menos a reserva de
    // emergência", inclui Ações/FIIs/USA também).
    var rendaFixaLongoPrazoHoje = rendaFixaHoje - rendaEmergencialHoje;

    serie.push({
      data: chaveAtual,
      patrimonio: arredondar2Inicio_(patrimonioTotal),
      longoPrazo: arredondar2Inicio_(patrimonioTotal - rendaEmergencialHoje),
      nacional: arredondar2Inicio_(patrimonioNacional),
      rendaEmergencial: arredondar2Inicio_(rendaEmergencialHoje),
      indiceCdi: arredondarIndiceInicio_(indiceCdi), // 23/09/2026 #8: 4 casas (2 casas distorciam o passo diário/mensal)
      indiceSelic: arredondarIndiceInicio_(indiceSelic), // 23/09/2026 #8: 4 casas (2 casas distorciam o passo diário/mensal)
      ibovespa: ultimoIbovespa,
      pregao: pregaoHoje,
      fluxoCaixaPatrimonio: arredondar2Inicio_(fluxoTotalHoje),
      fluxoCaixaLongoPrazo: arredondar2Inicio_(fluxoTotalHoje - fluxoRendaEmergencialHoje),
      fluxoCaixaNacional: arredondar2Inicio_(fluxoTotalHoje - fluxoRendaEmergencialHoje - fluxoUsaHoje),
      fluxoCaixaRendaEmergencial: arredondar2Inicio_(fluxoRendaEmergencialHoje),
      // --- 19/09/2026: campos por classe, ver cabeçalho do arquivo ---
      acoes: arredondar2Inicio_(somaAcoesAtual),
      fiis: arredondar2Inicio_(somaFiisAtual),
      acoesEua: arredondar2Inicio_(somaUsaAtual),
      rendaFixaTotal: arredondar2Inicio_(rendaFixaHoje),
      rendaFixaLongoPrazo: arredondar2Inicio_(rendaFixaLongoPrazoHoje),
      ifix: ultimoIfix,
      sp500: ultimoSp500,
      indiceIpca: arredondarIndiceInicio_(indiceIpca), // 23/09/2026 #8: 4 casas (2 casas distorciam o passo diário/mensal)
      cambioUsd: chavesCambioSerie_.length && chaveAtual >= chavesCambioSerie_[0] ? arredondarIndiceInicio_(cambioUsdParaData_(mapaCambioUsd, chavesCambioSerie_, chaveAtual)) : null, // 24/09/2026, ver acima
      fluxoCaixaAcoes: arredondar2Inicio_(fluxoAcoesHoje),
      fluxoCaixaFiis: arredondar2Inicio_(fluxoFiisHoje),
      fluxoCaixaAcoesEua: arredondar2Inicio_(fluxoAcoesEuaHoje),
      fluxoCaixaRendaFixaTotal: arredondar2Inicio_(fluxoRendaFixaTotalHoje),
      fluxoCaixaRendaFixaLongoPrazo: arredondar2Inicio_(fluxoRendaFixaTotalHoje - fluxoRendaEmergencialHoje),
      // --- 21/09/2026: "Valor aplicado", ver comentário acima ---
      fluxoAplicadoPatrimonio: arredondar2Inicio_(fluxoAplicadoTotalHoje),
      fluxoAplicadoLongoPrazo: arredondar2Inicio_(fluxoAplicadoTotalHoje - fluxoAplicadoRendaEmergencialHoje),
      fluxoAplicadoNacional: arredondar2Inicio_(fluxoAplicadoTotalHoje - fluxoAplicadoRendaEmergencialHoje - fluxoAplicadoUsaHoje),
      fluxoAplicadoRendaEmergencial: arredondar2Inicio_(fluxoAplicadoRendaEmergencialHoje),
      fluxoAplicadoAcoes: arredondar2Inicio_(fluxoAplicadoAcoesHoje),
      fluxoAplicadoFiis: arredondar2Inicio_(fluxoAplicadoFiisHoje),
      fluxoAplicadoAcoesEua: arredondar2Inicio_(fluxoAplicadoUsaHoje),
      fluxoAplicadoRendaFixaTotal: arredondar2Inicio_(fluxoAplicadoRendaFixaTotalHoje),
      fluxoAplicadoRendaFixaLongoPrazo: arredondar2Inicio_(fluxoAplicadoRendaFixaTotalHoje - fluxoAplicadoRendaEmergencialHoje)
    });
    // 23/09/2026 #7: provento recebido no dia, por classe (só quando houve -
    // a maioria dos dias não tem, e a série vai inteira pro front). Usado no
    // "Proventos recebidos" de Ações/FIIs (carteiras-classe-comum.js).
    var pontoHoje = serie[serie.length - 1];
    var provAcoesHoje = (fluxoCaixa.proventosAcoes || {})[chaveAtual];
    var provFiisHoje = (fluxoCaixa.proventosFiis || {})[chaveAtual];
    var provUsaHoje = (fluxoCaixa.proventosUsa || {})[chaveAtual];
    if (provAcoesHoje) pontoHoje.proventosAcoes = arredondar2Inicio_(provAcoesHoje);
    if (provFiisHoje) pontoHoje.proventosFiis = arredondar2Inicio_(provFiisHoje);
    if (provUsaHoje) pontoHoje.proventosAcoesEua = arredondar2Inicio_(provUsaHoje);

    dataAtual.setDate(dataAtual.getDate() + 1);
  }

  var marcaGravacao = Date.now();
  gravarSerieHistoricoCache_(chaveCacheSerie, serie);
  console.log('montarSerieHistoricoInicio_: gravacao do cache levou ' + (Date.now() - marcaGravacao) + 'ms (' + serie.length + ' dias)');
  return serie;
}

// --- Cache da série combinada (ver Otimização #4 no cabeçalho do arquivo) ---
// CacheService: 100KB por chave — a série inteira (hoje ~2090 itens, só
// tende a crescer) passa disso, então grava em pedaços (chunks) sob um
// prefixo comum + uma chave "_meta" com a contagem de pedaços.

/**
 * Monta a chave do cache da série combinada a partir das 4 contagens que a
 * definem - função à parte (17/09/2026) só pra garantir que
 * montarSerieHistoricoInicio_ e limparCacheHistoricoInicio_ (botão "Limpar
 * cache", ver mais abaixo) NUNCA divirjam na fórmula - o prefixo de versão
 * ("v5" hoje, ver histórico de bumps logo acima) só precisa existir num
 * lugar só.
 */
function montarChaveCacheSerie_(linhasPatrimonio, linhasRendaFixaCount, linhasIndices, contagemFluxoCaixa) {
  // v7 (20/09/2026): fluxoCaixaAcoes/Fiis/AcoesEua mudaram de CONTEÚDO
  // (correção do backfill atrasado - ver cabeçalho do arquivo e de
  // FluxoCaixaInicio.gs!calcularFluxoCaixaDiario_), sem nenhuma aba
  // ganhar linha nova por causa disso - mesmo caso do v3/v4/v6 (conta
  // mudou, formato/contagem não) - sem esse bump, uma chave já cacheada
  // ficaria servindo o valor ANTIGO (calculado com o código de ONTEM)
  // por até 6h depois do Tiago colar o código novo, MESMO com uma nova
  // implantação feita - só "Limpar cache" (ver handleLimparCacheHistorico
  // abaixo) ou esse bump força o recálculo na hora.
  // v12 (24/09/2026): campo novo cambioUsd (Ações EUA em dólar).
  // v13 (24/09/2026): provento arredondado em centavos (tela Proventos = Carteiras).
  // v11 (23/09/2026 #8): IPCA pro rata no mês e índices com 4 casas.
  // v9 (23/09/2026): (1) a conta mudou (STR fora, preço isolado absurdo
  // ignorado, nada datado depois de hoje - ver montarSerieHistoricoInicio_);
  // (2) a chave passou a incluir o DIA DE HOJE: a série agora nunca passa
  // de hoje, então uma série cacheada ontem (mesmas contagens de linha)
  // não pode ser servida hoje - terminaria ontem, e o último ponto nunca
  // seria "hoje" pra receber os valores ao vivo (Home.gs).
  return 'historico_serie_v13_' + chaveDiaISOInicio_(new Date()) + '_' + linhasPatrimonio + '_' + linhasRendaFixaCount + '_' + linhasIndices + '_' + contagemFluxoCaixa;
}

/**
 * Botão "Limpar cache" (topo do app, dentro do popover "Registro de
 * Controle" - pedido do Tiago em 17/09/2026, depois de um caso real: ele
 * corrigiu um valor ruim do Ibovespa DIRETO NA CÉLULA da planilha - mesma
 * linha, mesma contagem - e o app continuou mostrando o número velho, já
 * que chaveCacheSerie só muda quando a CONTAGEM de linhas muda, nunca
 * quando um valor existente é editado no lugar. Até aqui só um bump manual
 * de versão no código (precisa colar/publicar) resolvia isso).
 *
 * Recalcula a MESMA chave que montarSerieHistoricoInicio_ calcularia agora
 * (montarChaveCacheSerie_, acima) e apaga os pedaços dela do
 * CacheService, garantindo que a PRÓXIMA leitura da Home recalcula do
 * zero em vez de servir algo cacheado por até 6h - sem precisar saber de
 * antemão quantos pedaços existem (lê a chave "_meta" primeiro, mesmo
 * padrão de lerSerieHistoricoCache_ logo abaixo).
 */
function limparCacheHistoricoInicio_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 25/09/2026: o botão "Limpar cache" também refaz a tela Proventos / meta de Renda Passiva
  if (typeof invalidarCacheProventos_ === 'function') invalidarCacheProventos_();
  // 25/09/2026: ...e as notícias de cada ativo (tela do ativo - Ativo.gs)
  var noticiasRemovidas = 0;
  if (typeof limparCacheNoticiasAtivos_ === 'function') {
    try { noticiasRemovidas = limparCacheNoticiasAtivos_(ss); } catch (eNot) { Logger.log('limparCacheNoticiasAtivos_: ' + eNot); }
  }

  var abaPatrimonio = ss.getSheetByName(ABA_PATRIMONIO_INICIO);
  if (!abaPatrimonio) throw new Error('aba não encontrada: ' + ABA_PATRIMONIO_INICIO);
  var linhasPatrimonio = Math.max(abaPatrimonio.getLastRow() - 1, 0);

  var abaRendaFixa = ss.getSheetByName(ABA_HISTORICO_RF);
  if (!abaRendaFixa) throw new Error('aba não encontrada: ' + ABA_HISTORICO_RF);
  var linhasRendaFixaCount = Math.max(abaRendaFixa.getLastRow() - 1, 0);

  var abaIndices = ss.getSheetByName(ABA_INDICES_INICIO);
  if (!abaIndices) throw new Error('aba não encontrada: ' + ABA_INDICES_INICIO);
  var linhasIndices = Math.max(abaIndices.getLastRow() - 1, 0);

  var contagemFluxoCaixa = contarLinhasFluxoCaixa_(ss);

  var chave = montarChaveCacheSerie_(linhasPatrimonio, linhasRendaFixaCount, linhasIndices, contagemFluxoCaixa);
  var cache = CacheService.getScriptCache();
  var qtdPedacosTexto = cache.get(chave + '_meta');
  if (!qtdPedacosTexto) {
    return { limpou: false, motivo: 'já não havia cache pra essa chave (estava frio)', chave: chave, noticiasRemovidas: noticiasRemovidas };
  }

  var qtdPedacos = Number(qtdPedacosTexto);
  var chavesParaRemover = [chave + '_meta'];
  for (var i = 0; i < qtdPedacos; i++) chavesParaRemover.push(chave + '_' + i);
  cache.removeAll(chavesParaRemover);

  return { limpou: true, chave: chave, pedacosRemovidos: qtdPedacos, noticiasRemovidas: noticiasRemovidas };
}

/** Handler chamado pelo Router (doPost, action=limparCacheHistorico) - ver limparCacheHistoricoInicio_ acima. */
function handleLimparCacheHistorico(e) {
  try {
    return jsonOut({ ok: true, resultado: limparCacheHistoricoInicio_() });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'limparCacheHistorico', erro: String(erro) });
  }
}

var CACHE_SERIE_HISTORICO_TTL = 21600; // 6h — o máximo permitido pelo CacheService
var CACHE_SERIE_HISTORICO_TAMANHO_PEDACO = 90000; // caracteres por pedaço, com folga do limite de 100KB/chave

function gravarSerieHistoricoCache_(chave, serie) {
  try {
    var texto = JSON.stringify(serie);
    var pedacos = [];
    for (var i = 0; i < texto.length; i += CACHE_SERIE_HISTORICO_TAMANHO_PEDACO) {
      pedacos.push(texto.slice(i, i + CACHE_SERIE_HISTORICO_TAMANHO_PEDACO));
    }
    var paraGravar = {};
    paraGravar[chave + '_meta'] = String(pedacos.length);
    pedacos.forEach(function (pedaco, idx) {
      paraGravar[chave + '_' + idx] = pedaco;
    });
    CacheService.getScriptCache().putAll(paraGravar, CACHE_SERIE_HISTORICO_TTL);
  } catch (erro) {
    // Cache é só otimização — uma falha aqui nunca pode derrubar a
    // resposta principal (o valor já calculado já foi/será devolvido).
    console.log('gravarSerieHistoricoCache_: falhou ao gravar cache (' + erro + ') — segue sem cache.');
  }
}

/** Devolve a série cacheada, ou null se não tiver cache válido pra essa chave (cache frio, expirado, ou algum pedaço sumiu). */
function lerSerieHistoricoCache_(chave) {
  try {
    var cache = CacheService.getScriptCache();
    var qtdPedacosTexto = cache.get(chave + '_meta');
    if (!qtdPedacosTexto) return null;
    var qtdPedacos = Number(qtdPedacosTexto);

    var chavesPedacos = [];
    for (var i = 0; i < qtdPedacos; i++) chavesPedacos.push(chave + '_' + i);
    var mapaPedacos = cache.getAll(chavesPedacos);

    var texto = '';
    for (var i = 0; i < qtdPedacos; i++) {
      var pedaco = mapaPedacos[chave + '_' + i];
      if (pedaco === undefined) return null; // pedaço expirou/sumiu — cache inválido, recalcula do zero
      texto += pedaco;
    }
    return JSON.parse(texto);
  } catch (erro) {
    console.log('lerSerieHistoricoCache_: falhou ao ler cache (' + erro + ') — recalculando do zero.');
    return null;
  }
}

// Cacheado (lazy) — ver "Otimização #3" no cabeçalho do arquivo: criar o
// Intl.DateTimeFormat UMA vez (em vez de chamar Utilities.formatDate a
// cada linha) é o que faz essa função parar de ser o gargalo em volumes
// de dezenas de milhares de chamadas.
var _formatadorChaveDiaISOInicio_;
function chaveDiaISOInicio_(data) {
  if (!_formatadorChaveDiaISOInicio_) {
    _formatadorChaveDiaISOInicio_ = new Intl.DateTimeFormat('en-CA', {
      timeZone: Session.getScriptTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit'
    });
  }
  return _formatadorChaveDiaISOInicio_.format(data); // "yyyy-MM-dd" (en-CA formata assim)
}

/**
 * 20/09/2026 (bug real, achado com dados reais do Tiago via
 * tests/harness/ - a Renda Fixa de 19/09 (11 posições, valores reais de
 * Tesouro/LCI) nunca aparecia em nenhum lugar da série, e a série
 * ganhava 1 dia "fantasma" vazio antes do primeiro dia real de verdade):
 * `new Date("yyyy-MM-dd")` (string ISO "date-only", como as chaves de
 * todasAsChaves) é SEMPRE interpretado como MEIA-NOITE UTC pelo motor
 * JS - nunca meia-noite no fuso do projeto (America/Sao_Paulo, UTC-3).
 * Meia-noite UTC de um dia já é 21h do dia ANTERIOR em SP - então rodar
 * esse Date de volta por chaveDiaISOInicio_ (que formata em
 * America/Sao_Paulo) sempre devolvia o dia ANTERIOR ao pedido,
 * empurrando primeiraData/ultimaData/dataAtual (montarSerieHistoricoInicio_,
 * mais abaixo) 1 dia inteiro pra trás: a série nunca alcançava o último
 * dia real (a chave máxima de todasAsChaves nunca era lida dentro do
 * laço) e ganhava 1 dia extra vazio no início. Corrige construindo a
 * partir dos componentes ano/mês/dia direto, ancorado ao MEIO-DIA UTC
 * (não meia-noite) - Brasil é sempre UTC-3 desde o fim do horário de
 * verão em 2019, então meio-dia UTC nunca cruza a fronteira de
 * meia-noite em nenhum fuso próximo, e chaveDiaISOInicio_ sempre
 * recupera o dia certo de volta, não importa o fuso de quem estiver
 * rodando (produção real ou o harness de testes locais).
 */
function dataLocalDeChaveInicio_(chaveIso) {
  var partes = chaveIso.split('-');
  return new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]), 12, 0, 0));
}

function arredondar2Inicio_(n) {
  return Math.round(n * 100) / 100;
}

/** 23/09/2026 #8: índices base 100 (CDI/Selic/IPCA) com 4 casas - com 2,
 * o arredondamento chegava a ~10% do passo diário do CDI e mostrava o IPCA
 * do mês com 0,01 p.p. de diferença (0,27 no lugar de 0,26). */
function arredondarIndiceInicio_(n) {
  return Math.round(n * 10000) / 10000;
}

/** 23/09/2026 #8: chave "MM/AAAA" do IPCA mensal (mes = 1..12). */
function chaveMesIpcaInicio_(ano, mes) {
  return (mes < 10 ? '0' : '') + mes + '/' + ano;
}

/** 23/09/2026: ver TICKERS_FORA_DO_HISTORICO (Sync.gs). */
function tickerForaDoHistoricoInicio_(ticker) {
  return typeof TICKERS_FORA_DO_HISTORICO !== 'undefined' && TICKERS_FORA_DO_HISTORICO.indexOf(String(ticker || '').trim().toUpperCase()) !== -1;
}

/** 23/09/2026: diagnóstico da ÚLTIMA montagem da série (cache MISS) - o
 * que processarHistoricoRvDoTicker_ descartou/corrigiu e as âncoras
 * (preço pago x preço do histórico) de cada negociação. Só leitura, pros
 * testes do harness (tests/harness/) vigiarem. */
var ULTIMO_DIAGNOSTICO_RV_INICIO_ = { descartesPrecoIsolado: [], correcoesPreco: [], fronteirasIncertas: [], ancoras: [] };

/** 23/09/2026: bonificações (Compra com preço 0 e quantidade > 0) por
 * EMISSOR (4 primeiras letras do ticker: EGIE3 -> "EGIE", AXIA3/AXIA7 ->
 * "AXIA") -> [chave do dia] - uma bonificação paga em OUTRA classe da
 * mesma empresa (ex. real: AXIA7 recebida por quem tinha AXIA3, em
 * 22/12/2025) também marca o dia em que o preço da classe original muda
 * de patamar. */
function montarBonificacoesPorEmissor_(movimentosPorTicker) {
  var porEmissor = {};
  Object.keys(movimentosPorTicker).forEach(function (ticker) {
    movimentosPorTicker[ticker].forEach(function (m) {
      if (m.preco === 0 && m.delta > 0) {
        var emissor = ticker.slice(0, 4);
        if (!porEmissor[emissor]) porEmissor[emissor] = [];
        porEmissor[emissor].push(m.chave);
      }
    });
  });
  Object.keys(porEmissor).forEach(function (e) { porEmissor[e].sort(); });
  return porEmissor;
}

function medianaInicio_(valores) {
  var v = valores.slice().sort(function (a, b) { return a - b; });
  var meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// Corrige o preço histórico só quando o desvio é GRANDE e CONSISTENTE
// (>= 12% em pelo menos 2 negociações seguidas, ou >= 25% numa só) -
// diferença normal entre o preço de execução (intradiário) e o fechamento
// do dia fica em +-4% nos dados reais do Tiago; nada abaixo de 12% é
// mexido. Negociações a menos de 8% da mediana do grupo atual são "o mesmo
// patamar".
var LIMIAR_CORRECAO_PRECO_ANCORAGEM_ = 0.12;
var LIMIAR_CORRECAO_PRECO_ANCORAGEM_UNICA_ = 0.25;
var TOLERANCIA_PATAMAR_ANCORAGEM_ = 0.08;

/**
 * 23/09/2026 (investigação do Controle 7). Recebe as linhas de UM ticker
 * de aux_historico-patrimonio e devolve o valor em R$ de cada dia, já
 * limpo - ver montarSerieHistoricoInicio_. Passos, cada um com o caso
 * real que o motivou:
 *
 * 1) Preço isolado absurdo: linha cujo preço se afasta mais de 40% do
 *    ANTERIOR e cujo SEGUINTE volta pra perto do anterior (+-15%) é
 *    descartada. Caso real: BBAS3 com Preço 5,1256 (o câmbio do dólar) em
 *    18/09/2026, gravada por uma sincronização concorrente - 261 × 5,1256 =
 *    R$ 1.337 no lugar de ~R$ 5.940, e o Patrimônio Nacional "caía" 5,5%
 *    de 18 a 20/09. Desdobramento/grupamento de verdade nunca "volta" no
 *    dia seguinte, então nunca é descartado por isso.
 *
 * 2) Âncora nos preços pagos: pra cada Compra/Venda com preço > 0, compara
 *    o preço que o Tiago pagou com o fechamento do histórico naquele dia.
 *    Casos reais (Controle 7): EGIE3 pago ~R$ 38-45 de 2023 a set/2025 com
 *    o histórico dizendo ~R$ 27-31 (razão 1,41 em TODAS as 13 compras -
 *    o GOOGLEFINANCE "ajustou" o passado pela bonificação de 40% de
 *    nov/2025); AXIA3 razão ~1,38 em 2025 (bonificação/reorganização de
 *    dez/2025); RECR11 razão ~1,39 até 05/11/2025 e o histórico dando um
 *    SALTO de +40% em 07/11/2025 sem nenhum evento real (o Tiago pagou
 *    ~R$ 80-86 antes e depois). Sem corrigir, cada compra antiga dessas
 *    virava um "prejuízo" de ~29% no dia (aporte de verdade, valor
 *    ajustado) e o salto virava um "lucro" falso. Negociações seguidas no
 *    mesmo patamar formam um grupo; grupo com mediana >= 12% longe de 1
 *    (ver limiares acima) tem os preços multiplicados pela mediana. A
 *    troca de patamar entre dois grupos cai (i) numa bonificação do mesmo
 *    emissor nesse intervalo, senão (ii) no dia em que o histórico dá um
 *    salto do tamanho da diferença, senão (iii) no meio do intervalo -
 *    marcada como INCERTA em fronteirasIncertas (os testes do harness
 *    acusam, porque aí falta um dado na planilha: a data certa do evento).
 *    O último patamar é sempre 1: o histórico recente (sincronizado dia a
 *    dia, sem ajuste retroativo) bate com a B3 em todos os tickers.
 *
 * 3) Quantidade: vem das Transações (movimentos, com a data de cada um),
 *    não da coluna "Cotas" congelada no dia do sync - uma correção feita
 *    DEPOIS nas Transações (ex.: lançar a bonificação da EGIE3 na data
 *    certa) passa a valer no histórico inteiro sem regravar nada. Ticker
 *    sem nenhum movimento nas Transações cai no Valor BRL da linha, como
 *    antes.
 *
 * 4) Preço atrasado: se a 1ª compra é anterior ao 1º preço conhecido, a
 *    posição nasce no dia da compra com esse 1º preço (caso real: BTLG11,
 *    compra 16/05/2022, 1º preço 17/05/2022 - antes, o aporte entrava sem
 *    o valor e todas as visões agregadas mostravam -4,5% num dia e +4% no
 *    outro).
 */
function processarHistoricoRvDoTicker_(ticker, linhasBrutas, movimentos, bonificacoesDoEmissor, chavePrimeiraCompra) {
  var saida = { atualizacoes: [], descartesPrecoIsolado: [], correcoesPreco: [], fronteirasIncertas: [], ancoras: [] };

  var linhas = linhasBrutas.map(function (l, idx) { return { l: l, ordem: idx }; });
  linhas.sort(function (a, b) { return a.l.chave < b.l.chave ? -1 : (a.l.chave > b.l.chave ? 1 : a.ordem - b.ordem); });
  linhas = linhas.map(function (x) { return x.l; });

  // 1) preço isolado absurdo
  var aceitas = [];
  var precoAceitoAnterior = null;
  for (var i = 0; i < linhas.length; i++) {
    var l = linhas[i];
    var proxima = linhas[i + 1];
    if (precoAceitoAnterior > 0 && l.preco > 0 && proxima && proxima.preco > 0) {
      var razao = l.preco / precoAceitoAnterior;
      var razaoProxima = proxima.preco / precoAceitoAnterior;
      if ((razao < 0.6 || razao > 1 / 0.6) && razaoProxima > 0.85 && razaoProxima < 1 / 0.85) {
        saida.descartesPrecoIsolado.push({ ticker: ticker, dia: l.chave, preco: l.preco, precoAnterior: precoAceitoAnterior, precoSeguinte: proxima.preco });
        continue;
      }
    }
    if (l.preco > 0) precoAceitoAnterior = l.preco;
    aceitas.push(l);
  }
  if (!aceitas.length) return saida;

  // último preço aceito com chave <= dia (busca binária)
  function precoHistoricoNoDia(chave) {
    var lo = 0, hi = aceitas.length - 1, achado = -1;
    while (lo <= hi) {
      var meio = (lo + hi) >> 1;
      if (aceitas[meio].chave <= chave) { achado = meio; lo = meio + 1; } else { hi = meio - 1; }
    }
    return achado === -1 ? null : aceitas[achado].preco;
  }

  // 2) âncoras e patamares
  var movs = movimentos.slice().sort(function (a, b) { return a.chave < b.chave ? -1 : (a.chave > b.chave ? 1 : 0); });
  var ancoras = [];
  movs.forEach(function (m) {
    if (!(m.preco > 0)) return;
    var p = precoHistoricoNoDia(m.chave);
    if (!(p > 0)) return;
    ancoras.push({ chave: m.chave, precoPago: m.preco, precoHistorico: p, razao: m.preco / p });
  });
  var grupos = [];
  ancoras.forEach(function (a) {
    var g = grupos[grupos.length - 1];
    if (g && Math.abs(a.razao / medianaInicio_(g.razoes) - 1) <= TOLERANCIA_PATAMAR_ANCORAGEM_) {
      g.ancoras.push(a); g.razoes.push(a.razao);
    } else {
      grupos.push({ ancoras: [a], razoes: [a.razao] });
    }
  });
  // 23/09/2026 #2 (Controle 8): bonificação do PRÓPRIO ticker dá o fator
  // EXATO do ajuste, sem depender do limiar de 12% - caso real: AXIA3
  // recebeu 3 ações em 08/06/2026 (35 -> 38, fator 1,0857) e os preços de
  // jan-jun/2026 do histórico estão ~8% abaixo do que o Tiago pagou (1,047
  // e 1,116); abaixo dos 12%, esses meses ficavam sem correção e a
  // bonificação virava um "ganho" de ~8% da posição no dia 08/06. Da
  // última faixa pra primeira: se entre esta faixa e a seguinte houver
  // bonificação(ões) do próprio ticker e o fator dela(s) × o fator da
  // faixa seguinte bater (+-4%) com a mediana desta faixa, usa esse valor
  // exato.
  function qtdAntesDe(chave) {
    var q = 0;
    for (var i2 = 0; i2 < movs.length && movs[i2].chave < chave; i2++) q += movs[i2].delta;
    return q;
  }
  function fatorBonificacoesProprias(depoisDe, ate) {
    var f = 1;
    movs.forEach(function (m) {
      if (m.preco === 0 && m.delta > 0 && m.chave > depoisDe && (ate == null || m.chave <= ate)) {
        var q = qtdAntesDe(m.chave);
        if (q > 0) f *= (q + m.delta) / q;
      }
    });
    return f;
  }
  var fatorSeguinte = 1;
  for (var gi = grupos.length - 1; gi >= 0; gi--) {
    var g = grupos[gi];
    var m = medianaInicio_(g.razoes);
    var ultimaAncora = g.ancoras[g.ancoras.length - 1].chave;
    var primeiraAncoraSeguinte = gi + 1 < grupos.length ? grupos[gi + 1].ancoras[0].chave : null;
    var fb = fatorBonificacoesProprias(ultimaAncora, primeiraAncoraSeguinte);
    var candidato = fatorSeguinte * fb;
    if (Math.abs(fb - 1) >= 0.03 && Math.abs(m / candidato - 1) < 0.04) {
      g.fator = Math.round(candidato * 1e6) / 1e6;
    } else {
      var forte = Math.abs(m - 1) >= LIMIAR_CORRECAO_PRECO_ANCORAGEM_ &&
        (g.razoes.length >= 2 || Math.abs(m - 1) >= LIMIAR_CORRECAO_PRECO_ANCORAGEM_UNICA_);
      g.fator = forte ? m : 1;
    }
    fatorSeguinte = g.fator;
  }
  // junta grupos vizinhos com o mesmo fator (1 com 1, principalmente)
  var patamares = [];
  grupos.forEach(function (g) {
    var ult = patamares[patamares.length - 1];
    if (ult && ult.fator === g.fator) { ult.ancoras = ult.ancoras.concat(g.ancoras); }
    else patamares.push({ fator: g.fator, ancoras: g.ancoras.slice() });
  });
  if (patamares.length && patamares[patamares.length - 1].fator !== 1) {
    // último patamar é sempre 1 (ver passo 2 no comentário da função)
    patamares.push({ fator: 1, ancoras: [{ chave: aceitas[aceitas.length - 1].chave, virtual: true }] });
  }

  var fronteiras = []; // [{ desde: chave, fator }] - fator vale de `desde` (inclusive) até a próxima fronteira
  if (patamares.length) fronteiras.push({ desde: '0000-00-00', fator: patamares[0].fator });
  for (var k = 1; k < patamares.length; k++) {
    var anterior = patamares[k - 1], atual = patamares[k];
    var fimAnterior = anterior.ancoras[anterior.ancoras.length - 1].chave;
    var inicioAtual = atual.ancoras[0].chave;
    var dia = null, criterio = null;
    // (i) bonificação do mesmo emissor no intervalo
    for (var b = 0; b < bonificacoesDoEmissor.length; b++) {
      if (bonificacoesDoEmissor[b] > fimAnterior && bonificacoesDoEmissor[b] <= inicioAtual) { dia = bonificacoesDoEmissor[b]; criterio = 'bonificacao'; break; }
    }
    // (ii) salto do histórico do tamanho da diferença de patamar
    if (!dia) {
      var alvo = Math.log(anterior.fator / atual.fator);
      var melhor = null;
      for (var j = 1; j < aceitas.length; j++) {
        if (aceitas[j].chave <= fimAnterior || aceitas[j].chave > inicioAtual) continue;
        if (!(aceitas[j].preco > 0 && aceitas[j - 1].preco > 0)) continue;
        var dif = Math.abs(Math.log(aceitas[j].preco / aceitas[j - 1].preco) - alvo);
        if (dif < 0.1 && (!melhor || dif < melhor.dif)) melhor = { dia: aceitas[j].chave, dif: dif };
      }
      if (melhor) { dia = melhor.dia; criterio = 'salto'; }
    }
    // (iii) meio do intervalo - INCERTO
    if (!dia) {
      var t0 = dataLocalDeChaveInicio_(fimAnterior).getTime();
      var t1 = dataLocalDeChaveInicio_(inicioAtual).getTime();
      dia = chaveDeDataUtcInicio_(new Date((t0 + t1) / 2));
      criterio = 'incerto';
      saida.fronteirasIncertas.push({ ticker: ticker, entre: fimAnterior, e: inicioAtual, fatorAntes: anterior.fator, fatorDepois: atual.fator, diaUsado: dia });
    }
    fronteiras.push({ desde: dia, fator: atual.fator });
    if (anterior.fator !== 1) {
      saida.correcoesPreco.push({ ticker: ticker, ate: dia, fator: Math.round(anterior.fator * 10000) / 10000, criterio: criterio });
    }
  }
  function fatorNoDia(chave) {
    var f = 1;
    for (var x = 0; x < fronteiras.length; x++) { if (fronteiras[x].desde <= chave) f = fronteiras[x].fator; else break; }
    return f;
  }
  ancoras.forEach(function (a) {
    saida.ancoras.push({ ticker: ticker, dia: a.chave, precoPago: a.precoPago, precoHistorico: a.precoHistorico, precoHistoricoCorrigido: a.precoHistorico * fatorNoDia(a.chave) });
  });

  // 3) quantidade das Transações x preço (corrigido) x câmbio
  var temMovimentos = movs.length > 0;
  var idxMov = 0, qtd = 0;
  function qtdAte(chave) {
    while (idxMov < movs.length && movs[idxMov].chave <= chave) { qtd += movs[idxMov].delta; idxMov++; }
    return qtd;
  }
  function valorDaLinha(l, chave) {
    if (!temMovimentos) return l.valorBrl;
    var q = qtdAte(chave);
    var preco = l.preco * fatorNoDia(l.chave);
    var v = q * preco;
    if (l.classeBruta === 'USA') {
      if (!(l.cambio > 0)) return null;
      v = v * l.cambio;
    }
    return Math.abs(v) < 1e-9 ? 0 : v;
  }

  // 4) preço atrasado: posição nasce no dia da 1ª compra
  if (chavePrimeiraCompra && chavePrimeiraCompra < aceitas[0].chave) {
    var v0 = valorDaLinha(aceitas[0], chavePrimeiraCompra);
    if (v0 != null) saida.atualizacoes.push({ chave: chavePrimeiraCompra, valorBrl: v0 });
  }
  // 23/09/2026: dia com mudança de QUANTIDADE sem linha de preço (ex.
  // real: bonificação da EGIE3 lançada num domingo, 13/09/2026; ou uma
  // compra lançada num feriado da B3) - a posição muda NESSE dia, com o
  // último preço conhecido; antes só mudava no próximo pregão, e o aporte
  // (se houver) ficava 1+ dia descasado do valor.
  var chavesComLinha = {};
  aceitas.forEach(function (l) { chavesComLinha[l.chave] = true; });
  var diasSoMovimento = [];
  movs.forEach(function (m) {
    if (m.chave > aceitas[0].chave && !chavesComLinha[m.chave] && diasSoMovimento.indexOf(m.chave) === -1) diasSoMovimento.push(m.chave);
  });
  var linhasOrdenadas = aceitas.map(function (l) { return { chave: l.chave, linha: l }; });
  diasSoMovimento.forEach(function (dia) {
    var anterior = null;
    for (var a = 0; a < aceitas.length && aceitas[a].chave < dia; a++) anterior = aceitas[a];
    if (anterior) linhasOrdenadas.push({ chave: dia, linha: anterior });
  });
  linhasOrdenadas.sort(function (a, b) { return a.chave < b.chave ? -1 : (a.chave > b.chave ? 1 : 0); });
  linhasOrdenadas.forEach(function (x) {
    var v = valorDaLinha(x.linha, x.chave);
    if (v != null) saida.atualizacoes.push({ chave: x.chave, valorBrl: v });
  });
  return saida;
}

/** 'yyyy-MM-dd' de um Date em UTC - só pra aritmética de chaves (o meio de
 * dois dias criados por dataLocalDeChaveInicio_, que usa meio-dia UTC). */
function chaveDeDataUtcInicio_(d) {
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

/** 23/09/2026: posições de Renda Fixa cuja data foi realinhada na ÚLTIMA
 * montagem da série (ver montarSerieHistoricoInicio_). Só diagnóstico. */
var ULTIMO_DIAGNOSTICO_RF_INICIO_ = { deslocamentos: [] };

/** 23/09/2026 #2: se as taxas do BCB (CDI/SELIC/IPCA) da ÚLTIMA montagem
 * da série precisaram ser realinhadas 1 dia (ver montarSerieHistoricoInicio_). */
var ULTIMO_DIAGNOSTICO_TAXAS_INICIO_ = { deslocadasUmDia: false };
