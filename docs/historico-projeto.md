# Histórico do projeto — Investimentos (app de controle de patrimônio)

> Documento de contexto gerado por Claude a partir das conversas de planejamento e implementação deste projeto. Objetivo: qualquer sessão futura (ou suporte) conseguir retomar o trabalho rapidamente sem precisar reconstruir tudo do zero. Não é uma transcrição literal da conversa — é uma síntese organizada por assunto.

## O que é o projeto

App pessoal de controle de investimentos do Tiago, espelhando a planilha Google Sheets "Investimentos \- Controle" (também chamada "Intelinveste 7.0"), que continua sendo a **única fonte de dados** — sem banco de dados separado.

Arquitetura:

- **Front\-end**\: site estático no GitHub Pages, repositório [`tiagohs/investiments`](https://github.com/tiagohs/investiments) (público), publicado em `https://tiagohs.github.io/investiments/`.
- **Backend/ponte de dados**\: Google Apps Script Web App (`doGet`/`doPost`), autenticado via Google Identity Services (login com a conta do próprio Tiago).
- **Dados**\: a planilha Google Sheets real do Tiago — nenhuma cópia/duplicação de dados fora dela.
- Objetivo final: PWA (instalável, com skeleton cacheado) pra funcionar como app no celular.

## Estrutura de arquivos do repositório

```
index.html              — hoje é só um placeholder ("Hello!"), front-end real ainda não foi construído
teste.html               — scaffold de testes (login, sincronização, testes de Registro de Controle e de gravação em lote)
apps-script/
  Auth.gs                 — constantes, verificarToken(), jsonOut(), handlePing()
  Router.gs               — doGet/doPost, autenticação centralizada
  Sync.gs                 — sincronização do histórico de patrimônio + Registro de Controle
  ImportB3.gs             — importação de extrato da B3
  Macros.gs               — ordemcrono() (macro legada)
docs/
  planilha-formulas.md    — mapeamento das fórmulas da planilha original (Transações, Carteiras, RF, Proventos)
  plano-implementacao.html — checklist de implementação (Fase 0 e além), com status testado/pendente por item
  mapa-paginas.html        — mapa das páginas/telas planejadas para o front-end
  direcao-visual.html      — direção visual/design do front-end
  historico-projeto.md     — este arquivo
```

> **Importante**\: os arquivos em `apps-script/` são guardados no repositório como referência/backup — **não são a fonte de deploy**. O Apps Script (Google) não tem versionamento git nativo nesse fluxo: pra uma mudança valer de verdade, o conteúdo ainda precisa ser colado manualmente no editor do Apps Script e uma nova versão implantada (Implantar → Gerenciar implantações → editar → Nova versão). A partir de 11/09/2026, ficou definido que **toda mudança feita nesses scripts também atualiza os arquivos correspondentes em `apps-script/` no repositório** — ou seja, o conteúdo aqui deve sempre refletir a versão colada no Apps Script.

## Estrutura da planilha (fonte de dados)

- **Transações** / **Transações \- USA**\: histórico de compra/venda por ativo. Colunas manuais A\-F (Ticker, Data, Tipo, Preço, Qtd., Taxa); coluna M \= "Cotas até a data" (acumulado). `Transações` tem cabeçalho na linha 6, dados a partir da linha 7, e \~10.800 linhas com fórmula pré\-preenchida da coluna G em diante — por isso o código nunca usa `getLastRow()` nela (sempre estoura, aponta pro fim da planilha).
- **Carteira Ações** / **Carteira FIIs**\: ticker na coluna A — usadas pra validar que um ticker existe antes de gravar uma transação.
- **aux\_historico\-patrimonio**\: aba criada pelo Tiago, guarda o patrimônio diário por ativo (Data | Ticker | Classe | Cotas | Preço | Valor | Câmbio | Valor BRL), **append\-only** — uma linha já gravada nunca é recalculada.
- **Registro de Controle**\: histórico (não mais overwrite) das execuções de sincronização — Timestamp | Origem | Status | Detalhe, mais recente sempre no topo, limitado às últimas 300 execuções.
- **aux\_tests**\: aba de teste, reaproveitada pelos dois harnesses de teste — **atenção**, tem formatos diferentes dependendo de qual teste foi rodado por último (ver seção de gotchas abaixo).
- **Auxiliar\_app**\: célula de rascunho (`AZ1`) usada como scratch pelo mecanismo de busca do GOOGLEFINANCE — nunca deve ser usada pra outra coisa.

## 29 ativos rastreados

- 22 BR \= 12 Ações \+ 10 FIIs: `WIZC3, VAMO3, SEER3, TUPY3, AXIA7, AGRO3, B3SA3, BBAS3, BBSE3, EGIE3, PETR4, VALE3` \+ `BTLG11, GARE11, PMLL11, VGIP11, TRXF11, RECR11, RBRY11, KNUQ11, HGRU11, XPML11`.
- 7 USA (confirmado 7, não 8): `GPRK, CHTR, SIRI, EWBC, PAM, PROSY, VNOM`.

## Backfill histórico (GOOGLEFINANCE)

Pra reconstruir o patrimônio diário desde a 1ª transação de cada ativo:

- Cruza "Cotas até a data" (Transações) com o preço de fechamento histórico via `GOOGLEFINANCE`.
- Busca em pedaços de 180 dias (`CHUNK_DIAS`) por chamada — um pedido cobrindo o intervalo inteiro de uma vez causava truncamento silencioso (confirmado com TUPY3: 3 tentativas trouxeram cada vez MENOS dados, 708→538→433 linhas — descartou hipótese de ser só questão de esperar mais).
- Mecanismo de "lacunas": um pedaço que esgota todas as tentativas de polling local e não traz nenhuma linha é registrado como lacuna real (dado genuinamente ausente, ex: ticker novo/renomeado) e pulado — não fica tentando pra sempre. Diferente de um pedaço só cortado por falta de orçamento de tempo, que é retomado na próxima chamada.
- Escrita em bloco (`setValues()` uma vez), nunca `appendRow()` em loop — evita estourar o limite de 6 min do Apps Script.
- Validado end\-to\-end pros 29 ativos (export real da planilha conferido).
- AXIA7 tem uma lacuna real confirmada: de 2025\-06\-12 (1ª transação) até \~2025\-12\-22.

## Automação de sincronização

- Gatilho diário automático (seg\-sáb, \~10h) via `gatilhoDiario()` → chama `atualizarHistorico('Automático', null)`.
- Botão manual no site (`sincronizarAgora`) chama a mesma rotina central, com origem "Manual".
- Retry seletivo: se alguns tickers falharem, dá pra rodar de novo só com esses (não reprocessa os 29).
- `atualizarHistorico` nunca recalcula um dia já salvo — cada execução só busca o que falta desde a última data salva por ticker.
- Orçamento de tempo por execução: pára com folga antes do limite de 6 min do Apps Script (`LIMITE_MS_EXECUCAO` \= 4,5 min soft, `LIMITE_MS_ABSOLUTO` \= 5,5 min hard), deixando o resto pra próxima chamada (`naoProcessados`) — cada retomada é automática e mais rápida.

### Bug encontrado e corrigido (11/09/2026) — cache de câmbio USD/BRL

O cache de câmbio era buscado de forma preguiçosa, na hora em que o primeiro ticker USA aparecesse no loop (seguindo a ordem fixa do array), e reaproveitado por todos os seguintes. Como os 7 ativos USA têm datas de início bem diferentes (GPRK começa 2025\-07\-07; EWBC/PAM/PROSY/VNOM começam \~2025\-06\-11), se GPRK disparasse o cache primeiro, os outros ficariam com Câmbio/Valor BRL em branco pros dias entre as duas datas, silenciosamente.

**Correção aplicada**\: antes do loop principal, calcula a data de início mais antiga entre todos os tickers USA que vão rodar naquela execução, e busca o câmbio uma única vez já cobrindo essa união. O trecho antigo dentro do loop agora só lê do cache pré\-calculado.

**Pendência**\: o item "Câmbio USD/BRL — uma busca por execução" no `plano-implementacao.html` foi marcado testado ✓ ANTES dessa correção — foi reaberto no checklist. Precisa rodar de novo (sincronização com os 7 ativos USA) com o `Sync.gs` corrigido antes de fechar esse item de vez.

## Registro de Controle — 3 estados

- **Sucesso** (verde): 0 falhas.
- **Atenção** (amarelo): parcial — alguns tickers falharam OU ficaram incompletos por falta de tempo (não é a mesma coisa: falha \= erro de verdade; incompleto \= GOOGLEFINANCE ainda calculando, retoma sozinho).
- **Erro** (vermelho): falha total.

## Modo teste (permanente, não é código descartável)

Pensado pra nunca tocar na planilha real durante testes:

- `opcoesTeste` (JSON) passado no `e.parameter` de `sincronizarAgora`/`importarTransacoesB3`, redireciona escrita pra `aux_tests` em vez da aba real.
- Origem gravada no Registro de Controle sempre "Teste" nesse modo.
- `tickersParaFalhar`\: força falha determinística em tickers específicos (só no Sync.gs) — não depende de erro real do GOOGLEFINANCE, serve pra testar os caminhos de Atenção/Erro/retry de forma confiável.

### ⚠️ Gotcha: `aux_tests` serve dois testes com formatos DIFERENTES

- Testes de Sync (Registro de Controle — Atenção/Erro/retry): esperam o formato de `aux_historico-patrimonio` (8 colunas: Data|Ticker|Classe|Cotas|Preço|Valor|Câmbio|Valor BRL).
- Testes de ImportB3 (Gravação em lote): esperam o formato de `Transações` (6 colunas manuais A\-F, cabeçalho linha 6, dados a partir da linha 7).

Como o Tiago sobrescreveu `aux_tests` com uma cópia de Transações (pros testes de B3), rodar de novo os testes mais antigos de Sync **sem recriar a aba no formato certo** vai gravar dado no formato errado, silenciosamente. Sempre confirmar qual formato a `aux_tests` está antes de rodar um teste.

## Estrutura final dos arquivos do Apps Script

Reorganizados nesta sessão (saindo do código de diagnóstico da "Fase 0"):

- **Auth.gs**\: constantes (`AUTHORIZED_EMAIL`, `CLIENT_ID`), `verificarToken()` (valida token do Google direto no endpoint `tokeninfo`, sem lib extra), `jsonOut()`, `handlePing()`.
- **Router.gs**\: `doGet`/`doPost` — únicos pontos de entrada do Web App. Autenticação checada UMA vez aqui, centralizada, antes de despachar pra qualquer handler (antes, `handleSyncStatus` não tinha checagem de auth nenhuma sob o dispatcher antigo — corrigido nessa reorganização).
- **Sync.gs**\: sincronização do histórico de patrimônio \+ Registro de Controle (`atualizarHistorico`, `handleSincronizarAgora`, `handleSyncStatus`, backfill via GOOGLEFINANCE, etc). Contém o bug do câmbio corrigido descrito acima.
- **ImportB3.gs**\: importação de extrato da B3 (`importarTransacoesB3_`) — recebe lote já validado no navegador (SheetJS lê o .xlsx), confere ticker de novo no servidor como segunda camada de segurança, escreve nas colunas A\-F da primeira linha vazia de Transações.
- **Macros.gs**\: `ordemcrono()` — macro legada, gravada manualmente na planilha, não é chamada por nenhum código.

Depois de colar qualquer mudança no editor do Apps Script, é preciso **implantar uma nova versão** (Implantar → Gerenciar implantações → editar → Nova versão) — só salvar no editor não é suficiente pro Web App pegar o código novo.

## Cotas do Apps Script (conta pessoal/Gmail, não Workspace)

Verificado em 11/09/2026 direto na documentação oficial do Google:

- `UrlFetchApp` (usado por `verificarToken` a cada chamada autenticada): 20.000/dia.
- Tempo total de gatilho automático: 90 min/dia.
- Tempo por execução: 6 min (script) / 30s (custom function).
- Execuções simultâneas: 30 por usuário.

Uso pessoal (1 usuário, algumas ações manuais por dia \+ 1 gatilho diário) fica muito abaixo de qualquer um desses limites — não há custo envolvido, Apps Script é gratuito nessa faixa de uso.

## `teste.html` — o que ele cobre hoje

Não faz parte do app final — só uma página de testes, pode ser apagada quando o front\-end real estiver pronto. Cobre:

- Login Google \+ verificação (`action=ping`) \+ conexão com a planilha.
- APIs públicas do Banco Central (CDI, Selic) — sem login.
- Sincronização do histórico (`sincronizarAgora`), com botões separados por tipo de ativo (Ações BR / FIIs / Ações EUA) pra dar mais chance de terminar numa rodada só.
- `syncStatus` — badge de status da última sincronização.
- Testes de Registro de Controle (Atenção/Erro/retry seletivo) via `aux_tests`.
- Testes de Gravação em lote (`importarTransacoesB3`) via `aux_tests`.
- Leitura de extrato .xlsx da B3 no navegador (SheetJS), só pré\-visualização, não grava nada.

## Status geral (nesta data)

- **Fase 0 (validação de dados/backend) concluída**\: login, leitura da planilha, backfill completo dos 29 ativos, sincronização incremental, Registro de Controle (3 estados \+ retry seletivo), gravação em lote da B3 — todos testados via `teste.html` contra a planilha real (em modo teste, sem tocar dado real).
- Backend reorganizado em arquivos finais de produção (ver estrutura acima).
- Bug do cache de câmbio USD/BRL encontrado numa revisão de código e corrigido — pendente reconfirmar com um novo teste.
- **Front\-end real ainda não foi iniciado** — só existe o placeholder em `index.html` e o scaffold `teste.html`. Os documentos de planejamento (`plano-implementacao.html`, `mapa-paginas.html`, `direcao-visual.html`) definem o que vem a seguir.
- Preferência de trabalho do Tiago: antes de qualquer HTML/UI ser construído, ele quer ver os dados/valores reais (puxados da planilha/APIs de verdade) pra confirmar que estão corretos antes do trabalho de UI prosseguir.

## Fluxo de trabalho estabelecido (Claude \+ repositório)

- Sessão roda num container na nuvem; o Mac do Tiago fica vinculado via ponte de dispositivo.
- Arquivos `.gs` do Apps Script: gerados na nuvem → entregues como arquivo na conversa → Tiago cola manualmente no editor do Apps Script **e também** são escritos em `apps-script/` no repositório (mesmo fluxo de commit dos arquivos de front\-end, abaixo) — a fonte de deploy continua sendo o editor do Apps Script, o repo é só histórico/referência.
- Arquivos de front\-end/documentação/scripts (`.html`, `.md`, `.gs`) que entram no repositório: gerados na nuvem → entregues como arquivo → escritos no repositório real (`/Users/tiagosilva/Documents/Desenvolvimento/investiments`) via ponte de dispositivo → `git add` \+ `git commit` (mensagens sem acento, heredoc) rodado no Mac do Tiago via shell remoto.
- **Claude nunca dá `git push`** — o Tiago sempre revisa e sobe as mudanças ele mesmo.
