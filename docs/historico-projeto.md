# Histórico do projeto — Investimentos (app de controle de patrimônio)

> Documento de contexto gerado por Claude a partir das conversas de planejamento e implementação deste projeto. Objetivo: qualquer sessão futura (ou suporte) conseguir retomar o trabalho rapidamente sem precisar reconstruir tudo do zero. Não é uma transcrição literal da conversa — é uma síntese organizada por assunto. Atualizado em 14/09/2026 com a construção do front-end real (Início, Login, Distribuições e Metas) — ver a seção "Front-end real" mais abaixo.

## O que é o projeto

App pessoal de controle de investimentos do Tiago, espelhando a planilha Google Sheets "Investimentos - Controle" (também chamada "Intelinveste 7.0"), que continua sendo a **única fonte de dados** — sem banco de dados separado.

Arquitetura:

- **Front-end**: site estático no GitHub Pages, repositório [`tiagohs/investiments`](https://github.com/tiagohs/investiments) (público — decisão consciente do Tiago: GitHub Pages grátis exige repositório público numa conta free; a alternativa avaliada, Cloudflare Pages + Cloudflare Access com login, foi descartada por dar mais trabalho de configuração), publicado em `https://tiagohs.github.io/investiments/`.
- **Backend/ponte de dados**: Google Apps Script Web App (`doGet`/`doPost`), autenticado via Google Identity Services (login com a conta do próprio Tiago).
- **Dados**: a planilha Google Sheets real do Tiago — nenhuma cópia/duplicação de dados fora dela.
- PWA (instalável, manifest + service worker com skeleton cacheado) já funciona no celular — ver a seção "Front-end real" abaixo pra detalhes da estratégia de cache.
- Cotações: `GOOGLEFINANCE` não é uma API pública consumível fora do Google Sheets — só funciona dentro de uma planilha. Por isso o "botão de atualizar" do front-end não chama a API diretamente; ele aciona o Apps Script (que roda DENTRO da planilha, onde `GOOGLEFINANCE` funciona) via Web App.

## Estrutura de arquivos do repositório

```
index.html                — página Início (dashboard): índices/câmbio, resumo de patrimônio, gráfico de Rentabilidade, grade Meus Ativos
login.html                 — página de login dedicada (Google Identity Services)
distribuicoes-metas.html   — página Distribuições e Metas: Objetivos da Carteira, Radar de oportunidades, Metas da Carteira
teste.html                 — scaffold de testes (login, sincronização, testes de Registro de Controle e de gravação em lote) — não faz parte do app final
manifest.json               — manifesto da PWA (ícones, tema, nome "Patrimônio")
sw.js                        — service worker (cache da PWA)
package.json / package-lock.json — só ferramenta de dev (node --test), nunca servido pelo GitHub Pages
assets/
  css/
    shell.css                 — chrome compartilhado (topbar, nav, tema, filter-tabs/pills, botões, status-ico)
    inicio.css                 — específico da Início
    distribuicoes-metas.css    — específico de Distribuições e Metas (goal-*, obj-*, radar-*)
    login.css                   — específico do login
  js/
    config.js          — constantes compartilhadas (URL do Web App, Client ID OAuth, link da planilha)
    auth.js              — guarda/lê/decodifica o token GIS (memória + sessionStorage), sem DOM
    auth-ui.js             — liga o Google Identity Services de verdade (botão, callback) ao auth.js
    theme.js                — lê/escreve/resolve o tema claro/escuro (localStorage + matchMedia)
    shell.js                  — monta o chrome compartilhado (topbar, nav, tema, status de sync, PWA) em qualquer página
    format.js                  — helpers de formatação pt-BR (BRL/USD, percentual — 2 funções distintas por escala, datas)
    api-client.js                — cliente puro do Web App (uma função por action, espelha o contrato do Router.gs)
    pages/
      login.js                  — orquestrador real da página de login
      inicio.js                   — orquestrador + funções puras de render da Início
      distribuicoes-metas.js       — orquestrador + funções puras de render de Distribuições e Metas
apps-script/
  Auth.gs                    — constantes, verificarToken(), jsonOut(), handlePing()
  Router.gs                  — doGet/doPost, autenticação centralizada
  Sync.gs                    — sincronização do histórico de patrimônio (Renda Variável) + Registro de Controle
  ImportB3.gs                — importação de extrato da B3 (Transações de ações/FIIs)
  Macros.gs                  — ordemcrono() (macro legada)
  Home.gs                    — orquestrador da ação "home" (chama os 3 montadores da Início numa resposta só)
  MeusAtivos.gs               — grade "Meus Ativos" (Ações/FIIs/Ações EUA via Auxiliar_ativos; Renda Fixa direto da Carteira)
  FluxoCaixaInicio.gs          — fluxo de caixa líquido diário, usado pra normalizar a Rentabilidade (TWR)
  HistoricoInicio.gs          — junta os 3 históricos (Renda Variável, Renda Fixa, Ibovespa) + CDI/SELIC numa série única pra Home
  BackfillRendaFixa.gs        — projeção diária de Renda Fixa (SELIC/CDI/IPCA), completo + incremental
  BackfillIndices.gs          — histórico diário do Ibovespa (GOOGLEFINANCE), completo + incremental; gatilho diário de Renda Fixa + Índices
  DistribuicoesMetas.gs        — ação "distribuicoesMetas": Objetivos da Carteira, Radar de oportunidades, Metas da Carteira (leitura + escrita)
  DiagnosticoAtivos.gs          — script de uso único (roda 1x no editor, depois pode apagar) — confirma estrutura de colunas antes de escrever um handler novo
tests/                         — node --test + jsdom, um arquivo por módulo de assets/js (256 testes no total)
docs/
  planilha-formulas.md    — mapeamento das fórmulas da planilha original (Transações, Carteiras, RF, Proventos)
  plano-implementacao.html — checklist de implementação (Fase 0 e além), com status testado/pendente por item
  mapa-paginas.html        — mapa das páginas/telas planejadas para o front-end
  direcao-visual.html      — direção visual/design do front-end (paleta por categoria, Fraunces/Public Sans/IBM Plex Mono, mobile-first, tema claro/escuro)
  Auxiliar_ativos.xlsx     — planilha pronta pra importar como aba nova (fonte de Meus Ativos pra Ações/FIIs/Ações EUA)
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
- **Router.gs**: `doGet`/`doPost` — únicos pontos de entrada do Web App. Autenticação checada UMA vez aqui, centralizada, antes de despachar pra qualquer handler. Ações hoje: `ping`, `syncStatus`, `home`, `historico_inicio`, `meusAtivos`, `distribuicoesMetas` (GET); `importarTransacoesB3`, `sincronizarAgora`, `salvarMetaRendaPassiva`, `salvarMetaPatrimonio`, `salvarMesesRendaEmergencial`, `salvarObjetivosCarteira`, `salvarRadarItem` (POST).
- **Sync.gs**: sincronização do histórico de patrimônio de Renda Variável + Registro de Controle (`atualizarHistorico`, `handleSincronizarAgora`, `handleSyncStatus`, `gatilhoDiario`, backfill via GOOGLEFINANCE, etc). Contém o bug do câmbio corrigido descrito acima.
- **ImportB3.gs**: importação de extrato da B3 (`importarTransacoesB3_`) — recebe lote já validado no navegador (SheetJS lê o .xlsx), confere ticker de novo no servidor como segunda camada de segurança, escreve nas colunas A-F da primeira linha vazia de Transações. (Só Renda Variável — o extrato de Renda Fixa é colado manualmente pelo Tiago em `Transações Renda Fixa`, sem handler dedicado ainda.)
- **Macros.gs**: `ordemcrono()` — macro legada, gravada manualmente na planilha, não é chamada por nenhum código.
- **Home.gs**: `handleHome` — desde 13/09/2026 é o orquestrador único da ação `home` (chama `montarHome_` neste arquivo + `montarSerieHistoricoInicio_`/`HistoricoInicio.gs` + `montarMeusAtivos_`/`MeusAtivos.gs` numa resposta só, cada um no seu try/catch — ver seção "Front-end real"). `montarHome_` continua incluindo o split Renda Emergencial/Longo Prazo via `Carteira Renda Fixa!M6`.
- **MeusAtivos.gs**: `montarMeusAtivos_`/`handleMeusAtivos` — grade "Meus Ativos". Ações/FIIs/Ações EUA vêm de `Auxiliar_ativos` (aba populada por fórmula); Renda Fixa lê direto de `Carteira Renda Fixa`. Variação dia de Renda Fixa calculada comparando os 2 últimos dias de `aux_historico-renda-fixa`, pareada pela mesma chave (ano+instituição+indexador) que `BackfillRendaFixa.gs` já usa pra classificar posições.
- **FluxoCaixaInicio.gs**: calcula o fluxo de caixa líquido diário (aporte/retirada) cruzando Transações/Transações-USA/Transações Renda Fixa/Proventos/Proventos-USA — alimenta `historico[i].fluxoCaixa*` (`HistoricoInicio.gs`), usado pelo front-end pra normalizar a Rentabilidade como um retorno time-weighted de verdade (ver "Front-end real").
- **DistribuicoesMetas.gs**: ação `distribuicoesMetas` (doGet) + as ações de escrita `salvarMetaRendaPassiva`/`salvarMetaPatrimonio`/`salvarMesesRendaEmergencial`/`salvarObjetivosCarteira`/`salvarRadarItem` (doPost). Lê e escreve Metas da Carteira, Objetivos da Carteira e Radar de oportunidades — ver "Front-end real" pra detalhe de cada seção.
- **DiagnosticoAtivos.gs**: script de uso único (`diagnosticarColunasMeusAtivos`), rodado uma vez no editor pra confirmar célula a célula a estrutura real das abas antes de escrever `MeusAtivos.gs` — pode ser apagado, fica no repo como referência de como validar estrutura de planilha antes de codar um handler novo.
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

## Front-end real — Início, Login e Distribuições e Metas

Construído entre 13 e 14/09/2026 (antes disso só existia o placeholder documentado acima). Duas páginas completas hoje: Início (`index.html`) e Distribuições e Metas (`distribuicoes-metas.html`), mais uma página de login dedicada (`login.html`) e a base de PWA (manifest + service worker).

### Padrão de código (todas as páginas seguem o mesmo)

- HTML/CSS/JS puro, sem framework — decisão consciente, app pessoal de 1 usuário não precisa da complexidade de build de um framework.
- Cada página tem um módulo em `assets/js/pages/*.js` com duas partes bem separadas: funções puras de render (recebem `doc` + elemento + dado já pronto, nunca buscam nada sozinhas — testáveis contra jsdom sem fetch real) e UM orquestrador real por página (`montarPaginaX`) que busca de verdade via `api-client.js` e liga tudo. Mesmo padrão usado em `shell.js`/`auth-ui.js`/`theme.js`.
- `shell.js` (`mountShell()`) monta o chrome compartilhado — topbar, nav, toggle de tema, badge/popover de status de sincronização, registro do service worker — em qualquer página que forneça os 2 mount points (`#shell-header`/`#shell-footer`) e o atributo `body[data-section]`.
- `api-client.js`: cliente puro (sem DOM) do Web App, uma função por `action`, espelha o contrato do `Router.gs` — toda resposta é `{ ok: true, ... }` ou `{ ok: false, etapa, erro }`, e falha de rede (fetch offline etc.) é normalizada pro mesmo formato.
- `format.js`: helpers de formatação pt-BR. Ponto de atenção documentado: existem 2 funções de percentual DIFERENTES por escala — `changepct` do GOOGLEFINANCE já vem em pontos percentuais (1.3 = 1,3%), enquanto "Variação dia" das abas de Carteira vem como fração (0.013 = 1,3%). Misturar as duas silenciosamente deixa um número 100x maior que o outro sem erro nenhum — por isso não existe uma função "genérica" que assume a escala, o chamador precisa dizer qual tem.
- Testes: `node --test` + `jsdom`, 256 testes no total (`npm test`), um arquivo por módulo em `tests/`. Todo teste de orquestrador injeta implementações falsas (`getXImpl`, `salvarYImpl`) em vez de mockar fetch/token reais.
- Tema claro/escuro: `theme.js` (localStorage + `matchMedia`, nunca lança — degrada pra "não persiste"/"segue o sistema" em modo privado ou storage bloqueado).
- Tipografia/paleta: Fraunces (display) + Public Sans (corpo) + IBM Plex Mono (números), definidos em `docs/direcao-visual.html` — paleta categórica por classe de ativo (Ações/FIIs/USA/Renda Fixa), mobile-first.
- Padrão de edição inline, repetido em toda tela editável (Metas/Objetivos/Radar): botão "Editar" revela um formulário embutido (sem modal) → "Salvar" grava na planilha de verdade via a ação de escrita correspondente → em caso de sucesso, a página busca os dados de novo do zero e redesenha tudo (nunca só atualiza em memória local) → em caso de erro, a mensagem aparece no próprio formulário/linha, sem recarregar.
- **Padrão de validação de dados antes de UI** (preferência do Tiago, reafirmada em toda seção nova): antes de construir qualquer tela nova, escrever uma função só-leitura `montarX_()` + uma `testarXDireto()` no Apps Script; o Tiago roda direto no editor e cola o JSON real de volta no chat; só então a UI é construída a partir do formato validado. Usado (e funcionou) em Metas da Carteira, Objetivos da Carteira e Radar de oportunidades.

### Login (`login.html` / `auth.js` / `auth-ui.js`)

Virou página própria em 13/09/2026 (antes era um card dentro da própria Início). `auth.js` só guarda/lê/decodifica o token (memória como fonte de verdade durante a sessão da aba, espelhado em `sessionStorage` pra um F5 não forçar novo login — best-effort, nunca lança); `auth-ui.js` liga o Google Identity Services de verdade (botão "Entrar com Google", callback que chama `setToken()`) — antes disso só existia como rascunho em `teste.html`.

### PWA (`manifest.json` / `sw.js`)

Nome "Patrimônio", ícones em 3 tamanhos, `start_url`/`scope` na raiz. Service worker registrado por `shell.js` (uma vez só, não por página) com estratégia diferenciada por tipo de recurso: CSS/JS e navegações HTML são **network-first** (decisão revertida em 13/09 depois de um bug real: uma edição em `shell.css`/`shell.js` ficava presa em cache antigo, servida silenciosamente sem erro nenhum, parecendo "quebrado" sem motivo aparente); ícones/fontes/manifest continuam **cache-first** (mudam raramente). `CACHE_VERSION` é versionado manualmente (bump v2→v3 registrado num commit, junto da correção de quedas fantasma no gráfico — ver abaixo).

### Início (`index.html` / `pages/inicio.js` / `Home.gs` + `MeusAtivos.gs` + `FluxoCaixaInicio.gs`)

A ação `home` (`Router.gs`) virou um orquestrador único (`Home.gs`) que chama os 3 montadores — cada um já vivia no seu próprio arquivo e continua lá — numa resposta só: `montarHome_()` (patrimônio/índices/câmbio), `montarSerieHistoricoInicio_()` (histórico) e `montarMeusAtivos_()` (ativos). Cada um roda no seu try/catch — uma falha aparece em `avisos` por seção em vez de derrubar a resposta inteira. Isso resolveu uma lentidão real de ~30-60s por chamada: `aux_historico-renda-fixa` era lida inteira 2x na mesma chamada (agora é lida 1x e compartilhada entre os 2 montadores que precisam dela), e a busca de CDI/SELIC no BCB ganhou cache de 6h via `CacheService` (só busca de verdade na 1ª chamada da janela).

Seções da tela, todas puras/testadas contra jsdom:

- **Índices & Câmbio**: cards clicáveis (cartão inteiro, não só um link dentro).
- **Resumo de Patrimônio**: as 3 divisões (Total / Longo Prazo / Renda Emergencial) sempre visíveis ao mesmo tempo — era um "hero" com abas (uma visão por vez), revertido em 13/09 a pedido do Tiago.
- **Distribuição por classe** (donut): legenda mostra o nome completo + valor + percentual com 2 casas no tooltip (o rótulo visível trunca com `text-overflow:ellipsis`, então o hover existe justamente pra mostrar o que foi cortado).
- **Gráfico de Rentabilidade**: 3 cartões simultâneos (Total / Longo Prazo / Renda Emergencial), cada um com seu benchmark (Total e Longo Prazo vs Ibovespa+CDI; Renda Emergencial vs CDI+Selic — não faz sentido comparar reserva de emergência com bolsa). Filtro de período em pill-buttons (`.filter-tabs`), default "Mês atual" (trocado de "12 meses" em 14/09). Sem "quedas fantasma" (Renda Variável só fecha em dia de pregão — fins de semana/feriado usam forward-fill por ticker, bug corrigido em 13/09). SVG desenhado na largura REAL do cartão (`clientWidth`), não um viewBox fixo esticado — o viewBox fixo fazia a fonte do eixo renderizar menor quando 2 cartões ficavam lado a lado.
  - **Rentabilidade "de verdade" (TWR)**: bug encontrado a partir de um print do Tiago comparando com o app Gorilla — `historico[i].patrimonio` é só o valor de mercado das posições, sem noção de caixa, então `(hoje/base − 1)` tratava todo aporte novo como ganho e toda venda/retirada/provento como perda, inflando muito qualquer janela longa (quase 6 anos de aportes acumulados apareciam como "retorno" desde o início). Corrigido com `FluxoCaixaInicio.gs`: calcula o fluxo de caixa líquido diário (aporte/retirada) cruzando Transações/Transações-USA/Transações Renda Fixa/Proventos/Proventos-USA, alimenta `historico[i].fluxoCaixa*` (`HistoricoInicio.gs`), e `normalizarSerieRentabilidade` (front-end) usa isso pra montar um retorno time-weighted de verdade, comparável com os benchmarks sem o efeito de quanto dinheiro entrou ou saiu.
- **Grade "Meus Ativos"**: cartão inteiro clicável (Detalhe do Ativo ainda não construído — placeholder de rota `ativo.html?ref=&classe=` já definido em `docs/plano-implementacao.html`), filtro por classe em pill-buttons, tooltip com detalhe extra por ativo, Renda Fixa incluída (antes só Ações/FIIs/USA). Ações/FIIs/Ações EUA vêm de uma aba auxiliar nova, `Auxiliar_ativos` (1 linha por ativo, populada por fórmula — entregue como `docs/Auxiliar_ativos.xlsx` pronto pra importar: Arquivo → Importar → "Inserir nova(s) planilha(s)", as fórmulas em inglês no `.xlsx` chegam traduzidas pro pt-BR sozinhas). Renda Fixa lê direto de `Carteira Renda Fixa` (fonte única, sem aba auxiliar). Variação dia de Renda Fixa (que não existe como coluna) é calculada comparando os 2 últimos dias de `aux_historico-renda-fixa`, pareado pela MESMA chave que já classifica Renda Emergencial×Longo Prazo (ano do vencimento + instituição normalizada + indexador) — nunca inventa número quando a chave não bate.

### Distribuições e Metas (`distribuicoes-metas.html` / `pages/distribuicoes-metas.js` / `DistribuicoesMetas.gs`)

Ordem das 3 seções definida pelo Tiago: **Objetivos da Carteira → Radar de oportunidades → Metas da Carteira**. As 3 vêm juntas numa chamada só (`action=distribuicoesMetas`), cada uma com seu try/catch (mesmo padrão de `avisos` parciais da Início).

- **Metas da Carteira** (1ª fatia, 14/09): 3 cards (Renda Passiva, Patrimônio, Renda Emergencial) com anel de progresso (SVG, nunca "vaza" visualmente acima de 100% mas o texto mostra o valor real) e 2 estatísticas cada. Cada card edita seu(s) campo(s) e grava na planilha (`salvarMetaRendaPassiva`/`salvarMetaPatrimonio`/`salvarMesesRendaEmergencial`).
- **Objetivos da Carteira** (2ª fatia): 2 blocos (split geral Ações/FIIs/Renda Fixa; split dentro de Renda Fixa entre Renda Emergencial/Renda Fixa de longo prazo) — cada tipo virou uma barra "% atual" com um traço marcando "% desejado", substituindo a tabela simples que existia na planilha (pedido explícito do Tiago: "queria que isso fosse mais visual"). "% desejado" é editável, mas só o BLOCO INTEIRO de uma vez (nunca uma linha isolada) — a soma das linhas de um bloco precisa fechar 100%, validado tanto no cliente quanto no servidor (`salvarObjetivosCarteira`).
- **Radar de oportunidades** (3ª e 4ª fatias): 3 tabelas de ranking por classe (Ações Nacionais "Dividendos", Ações Internacionais, FIIs) — **todas dentro da própria aba "Distribuição e Metas"**, não em abas de Carteira separadas (ver "lição aprendida" abaixo). Pill-buttons pra trocar de tabela (mesmo componente `.filter-tabs` da Início). Cabeçalho de qualquer coluna ordena ao clicar (clique de novo inverte asc/desc), default Ranking crescente. Ranking, Preço-teto e "% desejado" são editáveis por ticker (botão "Editar" na linha), gravando 1 linha só por vez via `salvarRadarItem` — diferente de Objetivos, aqui não existe soma que precise fechar 100%. A leitura (`montarRadarOportunidades_`) devolve o número real da linha da planilha (`linha`) em cada item, usado pela escrita pra gravar sem ambiguidade mesmo que a tela esteja ordenada diferente da planilha — o handler ainda confere o ticker esperado contra a planilha antes de gravar, como 2ª trava de segurança. Preço médio, descontos P/VP e P/L, % de diferença e nova carteira não viram coluna própria (a tabela já tem muita coisa) — ficam num tooltip na célula do Ativo. Ações Internacionais mostra preço atual/teto em USD; carteira atual e R$ a investir continuam em BRL, como o resto do app já agrega tudo.
- **Tooltips com valor exato**: em todo gadget que arredonda visualmente pro texto (anéis de progresso, barras de Objetivos, alguns stats dos cards de Meta), o `title` mostra o valor com 2 casas — sem precisar abrir a planilha pra conferir o número por trás do arredondamento.

**Lição aprendida (14/09, vale registrar pra próximas telas)**: ao planejar o Radar de oportunidades, a 1ª investigação (baseada só num snapshot em cache da planilha, sem confirmação do Tiago) concluiu — errado — que Preço-teto/Viés viriam de uma aba `RV Metas de compra e venda` vazia e que o Ranking usaria uma "Coeficiente MinMax" qualquer. O Tiago corrigiu tudo: os 3 campos (e as 3 tabelas inteiras) vivem dentro da própria "Distribuição e Metas", com células exatas citadas por ele (`F42` = viés da WIZC3, `E43` ≈ preço-teto, `L41` = cabeçalho "% desejado"). **Lição**: mesmo com um snapshot da planilha disponível como "gerador de hipótese" pra economizar perguntas, uma citação de célula específica do usuário é fonte de verdade e exige reinvestigação completa daquele trecho — não só um ajuste fino da hipótese anterior.


## Status geral (nesta data)

- **Fase 0 (validação de dados/backend) concluída** para Renda Variável: login, leitura da planilha, backfill completo dos 29 ativos, sincronização incremental, Registro de Controle (3 estados + retry seletivo), gravação em lote da B3 — todos testados via `teste.html` contra a planilha real (em modo teste, sem tocar dado real).
- **Histórico de Renda Fixa reconstruído e sincronizando**: 14 posições desde 2020, extrato B3 unificado, classificação por produto+instituição+indexador validada, backfill completo e incremental funcionando.
- **Histórico de Índices (Ibovespa) criado e sincronizando**: 1422 dias de histórico via GOOGLEFINANCE, backfill completo e incremental funcionando (gotcha de locale pt-BR resolvido).
- **`HistoricoInicio.gs` combinando os 3 históricos**: testado, 2090 dias, números conferidos batendo (soma Longo Prazo + Renda Emergencial = Patrimônio, benchmarks em faixas plausíveis).
- **Sincronização diária automática cobrindo os 3 históricos**: gatilho de Renda Variável (já existia) + novo gatilho de Renda Fixa + Índices (ambos incrementais).
- Backend reorganizado em arquivos finais de produção (ver estrutura acima) — 13 arquivos `.gs` ao todo.
- **Front-end real construído e funcionando**: Início (dashboard completo — índices/câmbio, resumo de patrimônio, distribuição por classe, gráfico de Rentabilidade com TWR de verdade, grade Meus Ativos) e Distribuições e Metas (Objetivos da Carteira, Radar de oportunidades e Metas da Carteira, todos editáveis com escrita de volta na planilha) — ver a seção "Front-end real" acima pra todo o detalhe. Login virou página dedicada e a PWA (manifest + service worker) já é instalável. 256 testes (`node --test` + jsdom) cobrindo shell/tema/auth/format/api-client e as 2 páginas.
- Preferência de trabalho do Tiago (mantida em toda tela nova construída): antes de qualquer HTML/UI ser construído, ele quer ver os dados/valores reais (função só-leitura + `testarXDireto()` rodada por ele no editor, JSON colado de volta no chat) pra confirmar que estão corretos antes do trabalho de UI prosseguir.
- Próximo passo ainda não combinado com o Tiago: as telas restantes do mapa original (`docs/mapa-paginas.html`) — Carteiras e Detalhe do Ativo (`ativo.html?ref=&classe=`, já referenciado pelos cartões clicáveis da Início e de Meus Ativos, mas sem rota construída ainda) — e decidir o destino de `teste.html` (aposentar quando as telas reais cobrirem tudo que ele testa hoje).

## Fluxo de trabalho estabelecido (Claude + repositório)

- Sessão roda num container na nuvem; o Mac do Tiago fica vinculado via ponte de dispositivo.
- Arquivos `.gs` do Apps Script: gerados na nuvem → entregues como arquivo na conversa → Tiago cola manualmente no editor do Apps Script **e também** são escritos em `apps-script/` no repositório (mesmo fluxo de commit dos arquivos de front-end, abaixo) — a fonte de deploy continua sendo o editor do Apps Script, o repo é só histórico/referência.
- Arquivos de front-end/documentação/scripts (`.html`, `.md`, `.gs`) que entram no repositório: gerados na nuvem → entregues como arquivo → escritos no repositório real (`/Users/tiagosilva/Documents/Desenvolvimento/investiments`) via ponte de dispositivo → `git add` + `git commit` (mensagens sem acento, heredoc) rodado no Mac do Tiago via shell remoto.
- **Claude nunca dá `git push`** — o Tiago sempre revisa e sobe as mudanças ele mesmo.
- Planilhas auxiliares (ex: as duas abas novas de Renda Fixa) são entregues como `.xlsx` pra o Tiago colar manualmente na planilha real — nenhuma automação escreve na planilha do zero, só via Apps Script já autorizado.
