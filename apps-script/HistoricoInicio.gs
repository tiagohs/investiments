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

  if (linhasPatrimonio > 0) {
    abaPatrimonio.getRange(2, 1, linhasPatrimonio, 8).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      var chave = chaveDiaISOInicio_(data);
      var ticker = linha[1];
      // Valor BRL (coluna H) vem em branco ('') quando o câmbio do dia
      // faltou no backfill pra essa linha (só acontece pra classe USA) -
      // tratar como "sem dado hoje" (fica de fora, ver comentário acima),
      // nunca como 0 - Number('') seria 0 e zeraria o ticker inteiro
      // naquele dia por engano.
      if (linha[7] !== '' && linha[7] != null) {
        var valorBrl = Number(linha[7]);
        if (!isNaN(valorBrl)) {
          if (!atualizacoesPorDiaTicker[chave]) atualizacoesPorDiaTicker[chave] = {};
          atualizacoesPorDiaTicker[chave][ticker] = valorBrl;
          // 20/09/2026 (bug real, achado com dados reais do Tiago —
          // "gráfico de Ações considerando o patrimônio de Renda Variável
          // todo, não só Ações"): linha[2] (coluna "Classe" de
          // aux_historico-patrimonio) SÓ existe como 'BR' ou 'USA' — quem
          // escreve essa coluna (Sync.gs!gravarLinhasHistorico_) nunca
          // grava 'FII', só distingue USA de "o resto". Usar linha[2]
          // direto aqui fazia TODO ticker BR (Ações E FIIs juntos) cair
          // em classeDoTicker === 'BR' mais abaixo — somaFiisAtual ficava
          // sempre 0 e somaAcoesAtual = Ações+FIIs somados (e o mesmo bug
          // se repetia em fluxoCaixaAcoes/fluxoCaixaFiis, ver
          // FluxoCaixaInicio.gs, que consome este mesmo mapa). Corrigido
          // reclassificando aqui, na leitura, contra TICKERS_FIIS_BR
          // (Sync.gs, mesmo projeto Apps Script/namespace global) — sem
          // precisar mudar o que já está gravado na planilha nem
          // reescrever histórico nenhum.
          var classeBruta = linha[2]; // 'BR' ou 'USA', nunca 'FII' (ver acima)
          classePorTicker[ticker] = (classeBruta === 'BR' && typeof TICKERS_FIIS_BR !== 'undefined' && TICKERS_FIIS_BR.indexOf(ticker) !== -1)
            ? 'FII'
            : classeBruta; // 'BR' (Ações) / 'FII' / 'USA' - só atualiza quando o ticker teve uma linha de verdade
        }
      }
      // Câmbio (coluna G, só preenchida pra classe USA) - ver mapaCambioUsd acima.
      if (linha[2] === 'USA' && typeof linha[6] === 'number' && linha[6]) {
        mapaCambioUsd[chave] = linha[6];
      }
    });
  }

  // 2) aux_historico-renda-fixa (calculado dia a dia, sem lacunas — não
  // precisa de forward-fill, ao contrário da Renda Variável e do Ibovespa).
  // Reaproveita a leitura de quem chamou, se veio pronta (ver comentário
  // do parâmetro acima) — senão lê aqui mesmo, igual antes.
  var linhasRendaFixa = dadosRendaFixaCache || lerLinhasHistoricoRendaFixa_();
  linhasRendaFixa.forEach(function (linha) {
    var data = linha[0];
    if (!(data instanceof Date)) return;
    var chave = chaveDiaISOInicio_(data);
    var classificacao = linha[4];
    var valorBrl = Number(linha[5]) || 0;
    porDiaRendaFixaTotal[chave] = (porDiaRendaFixaTotal[chave] || 0) + valorBrl;
    if (classificacao === 'Renda Emergencial') {
      porDiaRendaEmergencial[chave] = (porDiaRendaEmergencial[chave] || 0) + valorBrl;
    }
  });

  // 3) aux_historico-indices — Ibovespa (Valor = pontos) e, na MESMA
  // leitura, CDI/SELIC (Valor = taxa % do dia) — ver otimização #2 no
  // cabeçalho do arquivo. Uma passada só de getValues() pros 3. (abaIndices
  // e linhasIndices já foram obtidas acima, pra montar a chave de cache.)
  var fatoresCdi = {};
  var fatoresSelic = {};
  var fatoresIpca = {}; // 19/09/2026: série MENSAL (não diária) - ver comentário no cabeçalho do arquivo
  if (linhasIndices > 0) {
    abaIndices.getRange(2, 1, linhasIndices, 3).getValues().forEach(function (linha) {
      var data = linha[0];
      if (!(data instanceof Date)) return;
      var nomeIndice = linha[1];
      var valor = Number(linha[2]);
      if (nomeIndice === 'Ibovespa') {
        var chave = chaveDiaISOInicio_(data);
        porDiaIbovespa[chave] = isNaN(valor) ? null : valor;
      } else if (nomeIndice === 'IFIX') {
        var chaveIfix = chaveDiaISOInicio_(data);
        porDiaIfix[chaveIfix] = isNaN(valor) ? null : valor;
      } else if (nomeIndice === 'S&P 500') {
        var chaveSp500 = chaveDiaISOInicio_(data);
        porDiaSp500[chaveSp500] = isNaN(valor) ? null : valor;
      } else if (nomeIndice === 'CDI' && !isNaN(valor)) {
        fatoresCdi[formatarDataBcbRF_(data)] = 1 + (valor / 100);
      } else if (nomeIndice === 'SELIC' && !isNaN(valor)) {
        fatoresSelic[formatarDataBcbRF_(data)] = 1 + (valor / 100);
      } else if (nomeIndice === 'IPCA' && !isNaN(valor)) {
        fatoresIpca[formatarDataBcbRF_(data)] = 1 + (valor / 100);
      }
    });
  }

  // Fluxo de caixa líquido diário (aporte/retirada) - ver correção de
  // 13/09/2026 no cabeçalho do arquivo e em FluxoCaixaInicio.gs. Calculado
  // aqui (não dentro do loop de dias abaixo) porque é 1 leitura por aba
  // de origem, não 1 por dia.
  var fluxoCaixa = calcularFluxoCaixaDiario_(mapaCambioUsd, classePorTicker);

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
          if (primeiraCompra && dataAtual > primeiraCompra) {
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

    var chaveBcb = formatarDataBcbRF_(dataAtual);
    var fatorCdi = fatoresCdi[chaveBcb];
    var fatorSelic = fatoresSelic[chaveBcb];
    var fatorIpca = fatoresIpca[chaveBcb];
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
      indiceCdi: arredondar2Inicio_(indiceCdi),
      indiceSelic: arredondar2Inicio_(indiceSelic),
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
      indiceIpca: arredondar2Inicio_(indiceIpca),
      fluxoCaixaAcoes: arredondar2Inicio_(fluxoAcoesHoje),
      fluxoCaixaFiis: arredondar2Inicio_(fluxoFiisHoje),
      fluxoCaixaAcoesEua: arredondar2Inicio_(fluxoAcoesEuaHoje),
      fluxoCaixaRendaFixaTotal: arredondar2Inicio_(fluxoRendaFixaTotalHoje),
      fluxoCaixaRendaFixaLongoPrazo: arredondar2Inicio_(fluxoRendaFixaTotalHoje - fluxoRendaEmergencialHoje)
    });

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
  return 'historico_serie_v7_' + linhasPatrimonio + '_' + linhasRendaFixaCount + '_' + linhasIndices + '_' + contagemFluxoCaixa;
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
    return { limpou: false, motivo: 'já não havia cache pra essa chave (estava frio)', chave: chave };
  }

  var qtdPedacos = Number(qtdPedacosTexto);
  var chavesParaRemover = [chave + '_meta'];
  for (var i = 0; i < qtdPedacos; i++) chavesParaRemover.push(chave + '_' + i);
  cache.removeAll(chavesParaRemover);

  return { limpou: true, chave: chave, pedacosRemovidos: qtdPedacos };
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
