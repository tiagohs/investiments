# Histórico do projeto — Investimentos (app de controle de patrimônio)

> Documento de contexto gerado por Claude a partir das conversas de planejamento e implementação deste projeto. Objetivo: qualquer sessão futura (ou suporte) conseguir retomar o trabalho rapidamente sem precisar reconstruir tudo do zero. Não é uma transcrição literal da conversa — é uma síntese organizada por assunto. Atualizado em 12/09/2026 com o trabalho de histórico de Renda Fixa e Índices.

## O que é o projeto

App pessoal de controle de investimentos do Tiago, espelhando a planilha Google Sheets "Investimentos - Controle" (também chamada "Intelinveste 7.0"), que continua sendo a **única fonte de dados** — sem banco de dados separado.

Arquitetura:

- **Front-end**: site estático no GitHub Pages, repositório [`tiagohs/investiments`](https://github.com/tiagohs/investiments) (público — decisão consciente do Tiago: GitHub Pages grátis exige repositório público numa conta free; a alternativa avaliada, Cloudflare Pages + Cloudflare Access com login, foi descartada por dar mais trabalho de configuração), publicado em `https://tiagohs.github.io/investiments/`.
- **Backend/ponte de dados**: Google Apps Script Web App (`doGet`/`doPost`), autenticado via Google Identity Services (login com a conta do próprio Tiago).
- **Dados**: a planilha Google Sheets real do Tiago — nenhuma cópia/duplicação de dados fora dela.
- Objetivo final: PWA (instalável, com skeleton cacheado) pra funcionar como app no celular.
- Cotações: `GOOGLEFINANCE` não é uma API pública consumível fora do Google Sheets — só funciona dentro de uma planilha. Por isso o "botão de atualizar" do front-end não chama a API diretamente; ele aciona o Apps Script (que roda DENTRO da planilha, onde `GOOGLEFINANCE` funciona) via Web App.

## Estrutura de arquivos do repositório

```
index.html              — hoje é só um placeholder ("Hello!"), front-end real ainda não foi construído
teste.html               — scaffold de testes (login, sincronização, testes de Registro de Controle e de gravação em lote)
apps-script/
  Auth.gs                    — constantes, verificarToken(), jsonOut(), handlePing()
  Router.gs                  — doGet/doPost, autenticação centralizada
  Sync.gs                    — sincronização do histórico de patrimônio (Renda Variável) + Registro de Controle
  ImportB3.gs                — importação de extrato da B3 (Transações de ações/FIIs)
  Macros.gs                  — ordemcrono() (macro legada)
  Home.gs                    — dados calculados da Home (handleHome) — Renda Emergencial/Longo Prazo via Carteira Renda Fixa
  BackfillRendaFixa.gs        — projeção diária de Renda Fixa (SELIC/CDI/IPCA), completo + incremental
  BackfillIndices.gs          — histórico diário do Ibovespa (GOOGLEFINANCE), completo + incremental; gatilho diário de Renda Fixa + Índices
  HistoricoInicio.gs          — junta os 3 históricos (Renda Variável, Renda Fixa, Ibovespa) + CDI/SELIC numa série única pra Home
docs/
  planilha-formulas.md    — mapeamento das fórmulas da planilha original (Transações, Carteiras, RF, Proventos)
  plano-implementacao.html — checklist de implementação (Fase 0 e além), com status testado/pendente por item
  mapa-paginas.html        — mapa das páginas/telas planejadas para o front-end
  direcao-visual.html      — direção visual/design do front-end (paleta por categoria, Fraunces/Public Sans/IBM Plex Mono, mobile-first, tema claro/escuro)
  historico-projeto.md     — este arquivo
```

> **Importante**: os arquivos em `apps-script/` são guardados no repositório como referência/backup — **não são a fonte de deploy**. O Apps Script (Google) não tem versionamento git nativo nesse fluxo: pra uma mudança valer de verdade, o conteúdo ainda precisa ser colado manualmente no editor do Apps Script e uma nova versão implantada (Implantar → Gerenciar implantações → editar → Nova versão). Toda mudança feita nesses scripts também atualiza os arquivos correspondentes em `apps-script/` no repositório — ou seja, o conteúdo aqui deve sempre refletir a versão colada no Apps Script.

## Estrutura da planilha (fonte de dados)

- **Transações** / **Transações - USA**: histórico de compra/venda por ativo (Ações/FIIs/USA). Colunas manuais A-F (Ticker, Data, Tipo, Preço, Qtd., Taxa); coluna M = "Cotas até a data" (acumulado). `Transações` tem cabeçalho na linha 6, dados a partir da linha 7, e ~10.800 linhas com fórmula pré-preenchida da coluna G em diante — por isso o código nunca usa `getLastRow()` nela (sempre estoura, aponta pro fim da planilha).
- **Carteira Ações** / **Carteira FIIs**: ticker na coluna A — usadas pra validar que um ticker existe antes de gravar uma transação.
- **Carteira Renda Fixa**: cabeçalho na linha 8, dados a partir da linha 9. Colunas: A=Código, **B=Marca (Renda Emergencial / Renda Fixa)**, C=Tipo de Investimento, D=Indexador, **E=Instituição**, F=Quantidade, G=Preço unitário, H=Valor Investido, I=Data de Emissão (sempre vazia — nunca preenchida), J=Vencimento, K=Valor Atualizado (manual), L=Prazo (rotulado "meses" mas na verdade guardado em DIAS), M=Mês/Ano vencimento, N=Ano vencimento. A coluna B é o que decide se uma posição entra no cálculo de Renda Emergencial ou de Longo Prazo na Home — Renda Emergencial hoje é só Tesouro Direto SELIC. Benchmark da Renda Emergencial: CDI + SELIC.
- **Transações Renda Fixa**: aba nova, criada nesta etapa, estilizada igual à `Transações` (mesma paleta de header). Cabeçalho na linha 6, dados a partir da linha 7. Colunas: Produto | Data | Movimentação | Entrada/Saída | Instituição | Quantidade | Preço unitário | Valor da Operação. Alimentada manualmente pelo Tiago colando o extrato "Movimentação" da B3 (filtrado só pra Renda Fixa) sempre que fizer uma operação nova.
- **aux_historico-patrimonio**: aba criada pelo Tiago, guarda o patrimônio diário de Renda Variável (Ações/FIIs/USA) por ativo (Data | Ticker | Classe | Cotas | Preço | Valor | Câmbio | Valor BRL), **append-only** — uma linha já gravada nunca é recalculada.
- **aux_historico-renda-fixa**: aba nova (Data | Produto | Instituição | Indexador | Classificação | Valor (BRL)), guarda a projeção diária de saldo de cada posição de Renda Fixa desde sua 1ª movimentação — ver seção "Histórico de Renda Fixa" abaixo.
- **aux_historico-indices**: aba nova (Data | Índice | Valor), guarda o fechamento diário do Ibovespa — ver seção "Histórico de Índices" abaixo.
- **Registro de Controle**: histórico (não mais overwrite) das execuções de sincronização — Timestamp | Origem | Status | Detalhe, mais recente sempre no topo, limitado às últimas 300 execuções. Agora recebe entradas de DOIS gatilhos diários independentes (ver "Automação de sincronização").
- **aux_tests**: aba de teste, reaproveitada pelos dois harnesses de teste — **atenção**, tem formatos diferentes dependendo de qual teste foi rodado por último (ver seção de gotchas abaixo).
- **Auxiliar_app**: célula de rascunho (`AZ1`) usada como scratch pelo mecanismo de busca do GOOGLEFINANCE (patrimônio E índices) — nunca deve ser usada pra outra coisa.

## 29 ativos rastreados (Renda Variável)

- 22 BR = 12 Ações + 10 FIIs: `WIZC3, VAMO3, SEER3, TUPY3, AXIA7, AGRO3, B3SA3, BBAS3, BBSE3, EGIE3, PETR4, VALE3` + `BTLG11, GARE11, PMLL11, VGIP11, TRXF11, RECR11, RBRY11, KNUQ11, HGRU11, XPML11`.
- 7 USA (confirmado 7, não 8): `GPRK, CHTR, SIRI, EWBC, PAM, PROSY, VNOM`.

## Backfill histórico de Renda Variável (GOOGLEFINANCE)

Pra reconstruir o patrimônio diário desde a 1ª transação de cada ativo:

- Cruza "Cotas até a data" (Transações) com o preço de fechamento histórico via `GOOGLEFINANCE`.
- Busca em pedaços de 180 dias (`CHUNK_DIAS`) por chamada — um pedido cobrindo o intervalo inteiro de uma vez causava truncamento silencioso (confirmado com TUPY3: 3 tentativas trouxeram cada vez MENOS dados, 708→538→433 linhas — descartou hipótese de ser só questão de esperar mais).
- Mecanismo de "lacunas": um pedaço que esgota todas as tentativas de polling local e não traz nenhuma linha é registrado como lacuna real (dado genuinamente ausente, ex: ticker novo/renomeado) e pulado — não fica tentando pra sempre. Diferente de um pedaço só cortado por falta de orçamento de tempo, que é retomado na próxima chamada.
- Escrita em bloco (`setValues()` uma vez), nunca `appendRow()` em loop — evita estourar o limite de 6 min do Apps Script.
- Validado end-to-end pros 29 ativos (export real da planilha conferido).
- AXIA7 tem uma lacuna real confirmada: de 2025-06-12 (1ª transação) até ~2025-12-22.

## Carteira Renda Fixa — Renda Emergencial × Longo Prazo

Ponto que gerou confusão numa etapa anterior e foi esclarecido: o split entre Renda Emergencial e Longo Prazo **não** vem da aba "Distribuição e Metas" — vem da coluna B ("Marca") da própria `Carteira Renda Fixa`. Cada posição é marcada manualmente como "Renda Emergencial" ou "Renda Fixa"; hoje, Renda Emergencial = só Tesouro Direto SELIC. A aba "Distribuição e Metas" (linhas 18-21 e K10:S12) é uma tabela auxiliar só de planejamento mensal de renda emergencial, sem relação com esse cálculo — fica pra uma tela futura separada ("Distribuições e Metas"), não afeta a Home.

Benchmark da Renda Emergencial: **CDI + SELIC** (não só CDI — decisão confirmada, revertendo uma resposta inicial equivocada do próprio Tiago no meio da conversa).

`Home.gs` (`handleHome`) já lia `Carteira Renda Fixa!M6` corretamente pra esse split antes desta etapa — conferido direto na planilha real, sem necessidade de mudança.

## Histórico de Renda Fixa

### O problema

Ao contrário da Renda Variável, a `Carteira Renda Fixa` não guarda data de emissão (coluna sempre vazia) nem permite estimar a data de compra de forma confiável — testar "Vencimento − Prazo(dias)" deu datas futuras implausíveis pra 2 de 9 posições. Além disso, uma posição já vencida/vendida simplesmente desaparece da aba, levando qualquer histórico dela junto. O Tiago tem posições de Renda Fixa desde 2020, então reconstruir esse histórico do zero via estimativa de data não era viável.

### A solução: extratos "Movimentação" da B3

O Tiago forneceu 6 arquivos de exportação "Movimentação" da B3 (todas as contas/corretoras), cobrindo 23/12/2020 até 08/09/2026, com o schema: `Entrada/Saída | Data | Movimentação | Produto | Instituição | Quantidade | Preço unitário | Valor da Operação`.

Unificação (feita uma vez, fora do Apps Script, direto nos arquivos): 142 linhas brutas → filtradas pra 98 linhas genuinamente de Renda Fixa (o extrato da B3 inclui TUDO da conta, inclusive empréstimo/reembolso de aluguel de ações — 44 linhas de PETR4/VALE3/EGIE3/TUPY3/B3SA3 vazaram na 1ª tentativa e precisaram ser filtradas por uma whitelist de prefixo do Produto: começa com tesouro/lci/lca/cdb/cri/cra, ou contém "debênture"). Resultado colado na aba `Transações Renda Fixa`.

### Reconstrução dia a dia (sem estimar data de compra)

Em vez de estimar quando cada posição foi comprada, o backfill caminha dia a dia desde o 1º evento real de cada posição, aplicando os eventos de `Transações Renda Fixa` na ordem em que aconteceram e compondo o saldo com a taxa histórica real do índice (SELIC/CDI/IPCA) entre eventos:

- **Compra / Aplicação**: soma ao saldo.
- **Venda / Resgate / Cobrança de Taxa Semestral** (custódia B3): subtrai do saldo.
- **Juros** (ex: cupom semestral) / **Transferência**: não afeta o saldo — Juros sai pra conta separado do principal (decisão confirmada com o Tiago); Transferência é só o par débito/crédito interno da B3, sem efeito monetário.
- Indexador detectado pelo nome do Produto: `/Selic/i` → SELIC, `/IPCA/i` → IPCA, default → CDI (cobre LCI, Prefixado, CDB).
- IPCA+ e LCI/CDB: projeta só pelo índice puro, sem o spread contratado (não disponível nem na planilha nem no extrato B3) — aproximação aceita pelo Tiago.
- Posição já vencida/vendida sem registro na Carteira atual: cai em "Renda Fixa" por padrão (não afeta o patrimônio de hoje, só a curva histórica dela).

### Agrupamento e classificação — 3 bugs corrigidos nesta etapa

1. **Fragmentação de instituição**: extratos da B3 usam nomes de razão social inconsistentes ao longo do tempo pra a mesma corretora ("RICO INVESTIMENTOS - GRUPO XP" / "XP INVESTIMENTOS CCTVM S/A" / variações com ponto final; duas razões sociais diferentes da Nu) — 19 "posições" apareciam em vez de 14 reais. Corrigido com `normalizarInstituicaoRF_()`, canonicalização por palavra-chave (XP/RICO→"XP", NU→"NU", INTER→"INTER"), aplicada tanto no agrupamento quanto no cruzamento com a Carteira.
2. **Colisão de chave por indexador**: duas posições de mesmo ano de vencimento e mesma instituição, mas indexador diferente (Tesouro Selic 2029 × Tesouro IPCA+ 2029, ambas XP), colidiam na mesma chave `ano|instituição` — uma sobrescrevia a classificação da outra. Corrigido incluindo o indexador na chave: `ano|instituição|indexador`.
3. **Distinção Renda Emergencial × Renda Fixa por instituição**: percebido a partir de uma mudança feita pelo próprio Tiago na planilha (coluna "Instituição" adicionada à `Carteira Renda Fixa`) — duas posições de Tesouro Selic com o MESMO ano de vencimento podem ter classificações diferentes conforme a corretora (ex: Tesouro Selic 2028 na XP = Renda Emergencial, na NU = Renda Fixa). Resolvido incluindo a instituição normalizada na chave de agrupamento desde o início.

Resultado final validado: 14 posições, todas classificadas corretamente (Tesouro Selic 2027/2028/2029/2031 na XP → Renda Emergencial; Tesouro Selic 2028 na NU e todos os Tesouro IPCA+/LCI → Renda Fixa; 5 posições já vencidas/vendidas → fallback "Renda Fixa").

### Execução: completa vs incremental

- **`executarBackfillRendaFixa_()` / `rodarBackfillRendaFixaDireto()`**: limpa e recalcula a aba INTEIRA do zero. Uso manual — backfill inicial ou correção retroativa (ex: se uma classificação mudar na Carteira e precisar refletir nos dias já passados).
- **`executarBackfillRendaFixaIncremental_()` / `rodarBackfillRendaFixaIncrementalDireto()`**: acha o último dia + saldo já salvo por posição e continua só a partir dali (nunca recalcula um dia já gravado); posição nova recebe backfill completo, só ela. Usada pelo gatilho diário (ver "Automação de sincronização"). Cuidado técnico: o saldo salvo numa linha reflete os eventos daquele dia mas ainda NÃO o crescimento daquele dia (aplicado só depois de gravar, preparando a entrada do dia seguinte) — por isso a retomada busca o fator do próprio último dia salvo antes de continuar, não só a partir do dia seguinte.
- Arquivo: `BackfillRendaFixa.gs` (renomeado de `Backfill.gs` nesta etapa, pra deixar claro que coexiste com `BackfillIndices.gs` e `HistoricoInicio.gs` no mesmo projeto — são arquivos SEPARADOS, nunca um sobrescrevendo o outro).

## Histórico de Índices (Ibovespa)

Nova aba `aux_historico-indices` (Data | Índice | Valor), pensada pra guardar o fechamento diário de índices de benchmark (hoje só Ibovespa; espaço pra IFIX/S&P500 no futuro se necessário).

### Gotcha de locale do GOOGLEFINANCE (custou 3 rodadas de erro até isolar)

A planilha está em locale pt-BR, e `Range.setFormula()` nesse locale exige `;` como separador de argumento (porque `,` é separador decimal em pt-BR) — só que **não traduz o nome da função** pro alias localizado. Sequência de erros até achar a combinação certa:

- `,` + `DATE` → `#ERROR!` (separador errado pro locale).
- `;` + `DATA` (alias em português, funciona quando digitado manualmente na UI) → `#NAME?` (o motor de fórmulas do `setFormula()` não reconhece o alias localizado).
- `;` + `DATE` (separador do locale + nome de função em inglês) → funciona.

Qualquer fórmula nova escrita via `setFormula()` nessa planilha precisa seguir esse padrão (`;` + nomes de função em inglês).

### Gotcha de assincronia

`SpreadsheetApp.flush()` força a escrita mas não garante que o `GOOGLEFINANCE` (cálculo externo assíncrono) já terminou de calcular antes da leitura seguinte — isso já valia pro backfill de Renda Variável, e voltou a aparecer aqui. Mecanismo: até 10 tentativas de polling (espera + novo flush a cada uma) antes de desistir de um pedaço, mais detecção explícita de erro (string começando com `#`) na célula da fórmula.

### Execução: completa vs incremental

- **`executarBackfillIndices_()` / `rodarBackfillIndicesDireto()`**: regrava a aba INTEIRA do zero (2020-12-23 até hoje, em pedaços de 180 dias). Uso manual/backfill inicial — validado com 1422 linhas gravadas.
- **`atualizarIndicesIncremental_()`**: acha a última data salva e busca só o que falta até ontem. Usada pelo gatilho diário.
- Arquivo: `BackfillIndices.gs`.

## HistoricoInicio.gs — série combinada pra Home

Junta os três históricos (`aux_historico-patrimonio`, `aux_historico-renda-fixa`, `aux_historico-indices`) mais as curvas de CDI/SELIC (via BCB, compostas dia a dia, base 100) numa única série diária, um dia por item: `{ data, patrimonio, longoPrazo, rendaEmergencial, indiceCdi, indiceSelic, ibovespa }`.

Decisão de design importante: Renda Variável e Ibovespa só fecham em dia de pregão (fins de semana/feriados sem linha), então o merge faz forward-fill (carrega o último valor conhecido). Renda Fixa é calculada dia a dia sem lacuna nenhuma (o backfill gera uma linha por dia corrido, todo santo dia), então usa o valor do próprio dia direto — misturar os dois com o mesmo forward-fill faria a Renda Variável "sumir" do patrimônio total em fins de semana, então cada série tem sua própria regra.

Endpoint: `action=historico_inicio` no `doGet` (`Router.gs`), via `handleHistoricoInicio(e)`.

Testado em 12/09/2026 (`testarHistoricoInicioDireto()`): 2090 dias (22/12/2020 → 11/09/2026); primeiro dia zerado (antes da 1ª movimentação real, Ibovespa `null` só nesse 1º dia); último dia com `longoPrazo (87.356,59) + rendaEmergencial (60.227,21) = patrimonio (147.583,80)` batendo exato, CDI/SELIC acumulados em ~184,6 (base 100 em dez/2020) e Ibovespa em ~187k pontos — faixas plausíveis pro período.

Arquivo: `HistoricoInicio.gs`.

## Automação de sincronização

Dois gatilhos diários independentes, cada um com seu próprio orçamento de execução de 6 min — separados de propósito pra não competir entre si (ex: o gatilho de ações pode gastar quase todo o tempo dele em dias de GOOGLEFINANCE lento, o que já aconteceu de verdade em 12/09/2026 com 7 tickers USA incompletos numa execução, resolvidos sozinhos na seguinte):

- **`gatilhoDiario()`** (Sync.gs, ~10h, seg-sáb) → `atualizarHistorico('Automático', null)` — Renda Variável (Ações/FIIs/USA), incremental por ticker.
- **`gatilhoDiarioRendaFixaEIndices()`** (BackfillIndices.gs, ~11h, seg-sáb) → `atualizarRendaFixaEIndicesDiario_()`, que roda `executarBackfillRendaFixaIncremental_()` e `atualizarIndicesIncremental_()` em sequência, cada um em try/catch separado (uma falha não bloqueia a outra), e grava uma entrada própria no Registro de Controle.

Outros pontos já documentados que continuam valendo:

- Botão manual no site (`sincronizarAgora`) chama a mesma rotina central de Renda Variável, com origem "Manual".
- Retry seletivo: se alguns tickers falharem, dá pra rodar de novo só com esses (não reprocessa os 29).
- Nenhuma das três rotinas recalcula um dia já salvo — cada execução só busca o que falta desde a última data salva.
- Orçamento de tempo do gatilho de ações: pára com folga antes do limite de 6 min do Apps Script (`LIMITE_MS_EXECUCAO` = 4,5 min soft, `LIMITE_MS_ABSOLUTO` = 5,5 min hard), deixando o resto pra próxima chamada (`naoProcessados`) — cada retomada é automática e mais rápida.

### Bug encontrado e corrigido (11/09/2026) — cache de câmbio USD/BRL

O cache de câmbio era buscado de forma preguiçosa, na hora em que o primeiro ticker USA aparecesse no loop (seguindo a ordem fixa do array), e reaproveitado por todos os seguintes. Como os 7 ativos USA têm datas de início bem diferentes (GPRK começa 2025-07-07; EWBC/PAM/PROSY/VNOM começam ~2025-06-11), se GPRK disparasse o cache primeiro, os outros ficariam com Câmbio/Valor BRL em branco pros dias entre as duas datas, silenciosamente.

**Correção aplicada**: antes do loop principal, calcula a data de início mais antiga entre todos os tickers USA que vão rodar naquela execução, e busca o câmbio uma única vez já cobrindo essa união. O trecho antigo dentro do loop agora só lê do cache pré-calculado.

## Registro de Controle — 3 estados

- **Sucesso** (verde): 0 falhas.
- **Atenção** (amarelo): parcial — alguns tickers/posições falharam OU ficaram incompletos por falta de tempo (não é a mesma coisa: falha = erro de verdade; incompleto = GOOGLEFINANCE ainda calculando, retoma sozinho).
- **Erro** (vermelho): falha total.

Agora recebe entradas dos dois gatilhos diários (Renda Variável e Renda Fixa+Índices), cada um gravando sua própria linha.

## Modo teste (permanente, não é código descartável)

Pensado pra nunca tocar na planilha real durante testes:

- `opcoesTeste` (JSON) passado no `e.parameter` de `sincronizarAgora`/`importarTransacoesB3`, redireciona escrita pra `aux_tests` em vez da aba real.
- Origem gravada no Registro de Controle sempre "Teste" nesse modo.
- `tickersParaFalhar`: força falha determinística em tickers específicos (só no Sync.gs) — não depende de erro real do GOOGLEFINANCE, serve pra testar os caminhos de Atenção/Erro/retry de forma confiável.

### ⚠️ Gotcha: `aux_tests` serve dois testes com formatos DIFERENTES

- Testes de Sync (Registro de Controle — Atenção/Erro/retry): esperam o formato de `aux_historico-patrimonio` (8 colunas: Data|Ticker|Classe|Cotas|Preço|Valor|Câmbio|Valor BRL).
- Testes de ImportB3 (Gravação em lote): esperam o formato de `Transações` (6 colunas manuais A-F, cabeçalho linha 6, dados a partir da linha 7).

Como o Tiago sobrescreveu `aux_tests` com uma cópia de Transações (pros testes de B3), rodar de novo os testes mais antigos de Sync **sem recriar a aba no formato certo** vai gravar dado no formato errado, silenciosamente. Sempre confirmar qual formato a `aux_tests` está antes de rodar um teste.

## Estrutura final dos arquivos do Apps Script

- **Auth.gs**: constantes (`AUTHORIZED_EMAIL`, `CLIENT_ID`), `verificarToken()` (valida token do Google direto no endpoint `tokeninfo`, sem lib extra), `jsonOut()`, `handlePing()`.
- **Router.gs**: `doGet`/`doPost` — únicos pontos de entrada do Web App. Autenticação checada UMA vez aqui, centralizada, antes de despachar pra qualquer handler. Ações hoje: `ping`, `syncStatus`, `home`, `historico_inicio` (GET); `importarTransacoesB3`, `sincronizarAgora` (POST).
- **Sync.gs**: sincronização do histórico de patrimônio de Renda Variável + Registro de Controle (`atualizarHistorico`, `handleSincronizarAgora`, `handleSyncStatus`, `gatilhoDiario`, backfill via GOOGLEFINANCE, etc). Contém o bug do câmbio corrigido descrito acima.
- **ImportB3.gs**: importação de extrato da B3 (`importarTransacoesB3_`) — recebe lote já validado no navegador (SheetJS lê o .xlsx), confere ticker de novo no servidor como segunda camada de segurança, escreve nas colunas A-F da primeira linha vazia de Transações. (Só Renda Variável — o extrato de Renda Fixa é colado manualmente pelo Tiago em `Transações Renda Fixa`, sem handler dedicado ainda.)
- **Macros.gs**: `ordemcrono()` — macro legada, gravada manualmente na planilha, não é chamada por nenhum código.
- **Home.gs**: `handleHome` — dados calculados da Home, incluindo o split Renda Emergencial/Longo Prazo via `Carteira Renda Fixa!M6` (conferido correto, sem mudanças nesta etapa).
- **BackfillRendaFixa.gs**: projeção diária de Renda Fixa — `executarBackfillRendaFixa_`/`rodarBackfillRendaFixaDireto` (completo) e `executarBackfillRendaFixaIncremental_`/`rodarBackfillRendaFixaIncrementalDireto` (incremental), mais os helpers de normalização/classificação/BCB (`normalizarInstituicaoRF_`, `detectarIndexadorRF_`, `classificarPosicaoRF_`, `montarMapaClassificacaoRF_`, `buscarFatoresDiariosBcb_`, `buscarFatoresDiariosIpca_`).
- **BackfillIndices.gs**: histórico do Ibovespa — `executarBackfillIndices_`/`rodarBackfillIndicesDireto` (completo) e `atualizarIndicesIncremental_` (incremental); também define o gatilho diário combinado `gatilhoDiarioRendaFixaEIndices`/`instalarGatilhoDiarioRendaFixaEIndices` que roda a versão incremental de Renda Fixa + Índices em sequência.
- **HistoricoInicio.gs**: `handleHistoricoInicio`/`montarSerieHistoricoInicio_` — junta os 3 históricos + CDI/SELIC numa série única pra Home. Depende de `buscarFatoresDiariosBcb_`/`formatarDataBcbRF_` (definidos em BackfillRendaFixa.gs, mesmo namespace global).

Depois de colar qualquer mudança no editor do Apps Script, é preciso **implantar uma nova versão** (Implantar → Gerenciar implantações → editar → Nova versão) — só salvar no editor não é suficiente pro Web App pegar o código novo. Gatilhos instalados via `instalarGatilhoDiario()`/`instalarGatilhoDiarioRendaFixaEIndices()` são exceção: rodam em background e não passam pelo `doGet`, então não precisam de nova implantação.

## Cotas do Apps Script (conta pessoal/Gmail, não Workspace)

- `UrlFetchApp` (usado por `verificarToken` a cada chamada autenticada, e pelas buscas na API do BCB): 20.000/dia.
- Tempo total de gatilho automático: 90 min/dia.
- Tempo por execução: 6 min (script) / 30s (custom function).
- Execuções simultâneas: 30 por usuário.

Uso pessoal (1 usuário, algumas ações manuais por dia + 2 gatilhos diários) fica muito abaixo de qualquer um desses limites — não há custo envolvido, Apps Script é gratuito nessa faixa de uso.

## `teste.html` — o que ele cobre hoje

Não faz parte do app final — só uma página de testes, pode ser apagada quando o front-end real estiver pronto. Cobre:

- Login Google + verificação (`action=ping`) + conexão com a planilha.
- APIs públicas do Banco Central (CDI, Selic) — sem login.
- Sincronização do histórico (`sincronizarAgora`), com botões separados por tipo de ativo (Ações BR / FIIs / Ações EUA) pra dar mais chance de terminar numa rodada só.
- `syncStatus` — badge de status da última sincronização.
- Testes de Registro de Controle (Atenção/Erro/retry seletivo) via `aux_tests`.
- Testes de Gravação em lote (`importarTransacoesB3`) via `aux_tests`.
- Leitura de extrato .xlsx da B3 no navegador (SheetJS), só pré-visualização, não grava nada.

## Status geral (nesta data)

- **Fase 0 (validação de dados/backend) concluída** para Renda Variável: login, leitura da planilha, backfill completo dos 29 ativos, sincronização incremental, Registro de Controle (3 estados + retry seletivo), gravação em lote da B3 — todos testados via `teste.html` contra a planilha real (em modo teste, sem tocar dado real).
- **Histórico de Renda Fixa reconstruído e sincronizando**: 14 posições desde 2020, extrato B3 unificado, classificação por produto+instituição+indexador validada, backfill completo e incremental funcionando.
- **Histórico de Índices (Ibovespa) criado e sincronizando**: 1422 dias de histórico via GOOGLEFINANCE, backfill completo e incremental funcionando (gotcha de locale pt-BR resolvido).
- **`HistoricoInicio.gs` combinando os 3 históricos**: testado, 2090 dias, números conferidos batendo (soma Longo Prazo + Renda Emergencial = Patrimônio, benchmarks em faixas plausíveis).
- **Sincronização diária automática cobrindo os 3 históricos**: gatilho de Renda Variável (já existia) + novo gatilho de Renda Fixa + Índices (ambos incrementais).
- Backend reorganizado em arquivos finais de produção (ver estrutura acima) — 8 arquivos `.gs` ao todo.
- **Front-end real ainda não foi iniciado** — só existe o placeholder em `index.html` e o scaffold `teste.html`. Os documentos de planejamento (`plano-implementacao.html`, `mapa-paginas.html`, `direcao-visual.html`) definem o que vem a seguir.
- Preferência de trabalho do Tiago: antes de qualquer HTML/UI ser construído, ele quer ver os dados/valores reais (puxados da planilha/APIs de verdade) pra confirmar que estão corretos antes do trabalho de UI prosseguir — essa etapa de dados (Renda Fixa/Índices/série combinada) foi resolvida especificamente antes de começar a Home, seguindo essa preferência.
- Próximo passo combinado com o Tiago: construir a Home de verdade (gráficos de Resultado do período + % vs índices por visão — Patrimônio e Longo Prazo vs CDI+Ibovespa, Renda Emergencial vs CDI+SELIC —, grade "Meus Ativos" clicável, cards "Índices e Câmbios"), usando `historico_inicio` como fonte dos gráficos.

## Fluxo de trabalho estabelecido (Claude + repositório)

- Sessão roda num container na nuvem; o Mac do Tiago fica vinculado via ponte de dispositivo.
- Arquivos `.gs` do Apps Script: gerados na nuvem → entregues como arquivo na conversa → Tiago cola manualmente no editor do Apps Script **e também** são escritos em `apps-script/` no repositório (mesmo fluxo de commit dos arquivos de front-end, abaixo) — a fonte de deploy continua sendo o editor do Apps Script, o repo é só histórico/referência.
- Arquivos de front-end/documentação/scripts (`.html`, `.md`, `.gs`) que entram no repositório: gerados na nuvem → entregues como arquivo → escritos no repositório real (`/Users/tiagosilva/Documents/Desenvolvimento/investiments`) via ponte de dispositivo → `git add` + `git commit` (mensagens sem acento, heredoc) rodado no Mac do Tiago via shell remoto.
- **Claude nunca dá `git push`** — o Tiago sempre revisa e sobe as mudanças ele mesmo.
- Planilhas auxiliares (ex: as duas abas novas de Renda Fixa) são entregues como `.xlsx` pra o Tiago colar manualmente na planilha real — nenhuma automação escreve na planilha do zero, só via Apps Script já autorizado.
