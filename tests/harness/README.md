# tests/harness — testes com dados reais da planilha

Harness pedido pelo Tiago em 20/09/2026 ("conseguiríamos criar mocks com
os valores presentes na planilha, para gerar os cálculos e testar
localmente?"). Roda o **texto literal** de `apps-script/*.gs` (sem
reescrever nada) dentro de um sandbox Node (`vm`), com um
`SpreadsheetApp`/`Session`/`CacheService`/`LockService`/`Logger` falsos
montados em cima de dados reais extraídos de um export `.xlsx` da
planilha — e chama `montarSerieHistoricoInicio_()` de verdade. Depois
importa as funções reais do front-end (`assets/js/pages/inicio.js`) e
roda os mesmos cálculos que a tela mostra.

Por que carregar o `.gs` "como está" em vez de extrair a lógica pra um
módulo testável: os `.gs` de produção são código financeiro sensível já
validado manualmente contra o Gorilla — mudar a ESTRUTURA deles pra
"caber" num teste é risco de regressão, exatamente o tipo de coisa que
motivou esse pedido. Rodar o texto tal como está elimina esse risco: se
um teste aqui divergir do app de verdade, só pode ser porque o FAKE
(fixture/SpreadsheetApp) está errado — nunca porque o `.gs` foi adaptado.

## Como usar

1. Gerar as fixtures a partir de um export `.xlsx` recente da planilha
   (Google Sheets → Arquivo → Fazer download → Microsoft Excel):

   ```
   python3 tests/harness/extrair-fixtures.py "/caminho/Investimentos - Controle NN.xlsx"
   ```

   Isso grava `tests/harness/fixtures.json` (alguns MB — **não commitar**,
   tem dado financeiro real; já está no `.gitignore`).

2. Rodar o diagnóstico direto (não é um teste automatizado, é uma
   ferramenta de investigação manual):

   ```
   node tests/harness/gas-vm-harness.mjs            # resumo de todas as visões (mês/tudo)
   node tests/harness/gas-vm-harness.mjs --worst-days  # + os 3 piores dias de retorno diário por visão
   ```

3. Escrever um teste de verdade (`node:test`) importando
   `carregarSerieComDadosReais` do harness e fazendo asserções sobre o
   resultado — ver `tests/rentabilidade-historico.test.js` (quando
   existir) pro padrão.

## Fixtures ficam desatualizadas

`fixtures.json` é uma FOTO da planilha no momento em que foi extraída —
não se atualiza sozinha. Pra investigar um bug que só aparece com o
estado ATUAL da planilha (ex.: um valor que só entrou hoje), é preciso
gerar um export novo e rodar `extrair-fixtures.py` de novo antes de
rodar o harness — senão o teste roda contra dados de alguns dias atrás
e pode não reproduzir o problema.

## Fuso do .xlsx (23/09/2026)

O `.xlsx` exportado grava cada data no relógio do fuso da **planilha**
(`America/New_York`), não no fuso do projeto Apps Script
(`America/Sao_Paulo`). `gas-vm-harness.mjs` converte (ver `reviveDate`).
Antes disso, toda linha de Renda Fixa caía 1 dia antes do que cai no app
de verdade e o harness "achava" desalinhamentos que não existiam.

## Testes que conferem as telas (23/09/2026)

- `telas-heroes-graficos.test.js` - roda a rota real `action=home`
  (`handleHome`), monta a Início e as telas de Carteiras num DOM (jsdom),
  lê o que aparece na tela (heroes, "no período", legendas) e compara com
  contas independentes escritas no próprio teste; confere também as
  identidades (Total = Longo Prazo + Emergencial etc.) em todos os dias e
  períodos, e reconstrói o patrimônio de cada classe direto das abas.
- `qualidade-dados-planilha.test.js` - aponta lançamento faltando ou com
  data errada na PLANILHA (marcados `[DADO DA PLANILHA]`). Falha aqui não é
  bug do app: a mensagem diz o que corrigir.
- `referencias-externas.test.js` - compara com prints da B3, Interactive
  Brokers e Gorila guardados em `referencias-externas.local.json`
  (gitignored - dado real; sem ele, pulado).

## Relatório de conferência das telas (23/09/2026 #4)

Pedido do Tiago: gerar sempre as tabelas de todos os gráficos e heroes
(Início, Carteiras > Visão geral e as 4 subpáginas) com a checagem de que
tudo bate, e rodar isso a cada mudança no código.

- `relatorio-telas.mjs` monta as telas de verdade (JSDOM + código do app +
  `fixtures.json`), lê o que cada uma mostra, recalcula tudo com um oráculo
  independente e grava `tests/harness/relatorio/conferencia-telas.html`
  (data de geração, planilha base, "dados até" = último sync de preços da
  planilha) e `conferencia-telas.json`. A pasta `relatorio/` é gitignored.
- `relatorio-telas.test.js` regera o relatório em todo `npm test` e vira um
  teste `[RELATÓRIO] …` por checagem (24 hoje: série, Início, coerência,
  Visão geral, subpáginas e plausibilidade: reserva perto do CDI, R$ x %
  explicados pelos aportes, ajuste de marcação, Gorila se houver
  `referencias-externas.local.json`).
- `qualidade-dados.mjs` tem as checagens de dado da planilha, usadas por
  `qualidade-dados-planilha.test.js` e pela seção "Alertas" do relatório.
- A seção "O que mudou" compara com a última geração em que algum número
  foi diferente (`conferencia-telas.anterior.json`) e marca o valor
  anterior em roxo nas tabelas.

Comandos:

```
npm run verificar   # todos os testes + relatório, com resumo
npm run vigiar      # o mesmo a cada arquivo salvo (assets/, apps-script/, carteiras/, tests/)
npm run relatorio   # só o relatório, rápido (~3 s)
```

O gancho `.githooks/pre-commit` roda `npm run verificar` antes de cada
commit (ativado por `npm install` ou `git config core.hooksPath .githooks`).
Bloqueia o commit só se o CÓDIGO quebrou; `[DADO DA PLANILHA]` aparece como
alerta e não bloqueia. Pular uma vez: `git commit --no-verify`.

Planilha nova: `python3 tests/harness/extrair-fixtures.py "…/Investimentos - Controle NN.xlsx"`
(grava também `_meta` com o nome do arquivo, que aparece no topo do relatório).


## Onda 4 - frente 4A (06/10/2026: A-72, A-74, A-75, A-81)

- **Coerência entre telas** (`coerencia-telas.test.mjs`, A-72): roda as ações do Web App juntas, com o relógio dos `.gs`
  congelado no dia da extração (`_meta.extraidoEm`), e compara patrimônio de hoje (Início x Carteiras x Organização x
  Distribuição e Metas x Metas), reserva bruto x líquido, proventos em 12 meses (mesma janela/rótulo), "já guardado" das metas
  x o que existe pra vincular, órfãos/aliases e duplicata nos históricos. Também fixa o **orçamento de leitura por ação**
  (células, leituras, bytes: o medido em 06/10/2026 + 20%); `node tests/harness/coerencia-telas.test.mjs --medir` imprime a
  tabela atual. Teste marcado `todo` = achado conhecido que ainda não foi corrigido no `.gs` (aparece, não reprova).
- **Fixtures x planilha nova** (A-74): `extrair-fixtures.py` extrai a lista fixa **e** toda aba que `apps-script/*.gs` usa
  (varredura do texto) e grava em `_meta` quais faltaram na planilha. `abas-contrato.test.js` + `contrato-abas.mjs` conferem,
  aba por aba, cabeçalhos/rótulos - ao trocar de planilha (Controle N+1) o teste diz qual aba/célula mudou. Aba nova usada no
  `.gs` obriga a entrada no contrato.
- **`CI_ESTRITO=1`** (`npm run test:estrito`): teste que dependia de `fixtures.json`/aba e foi pulado **reprova** (e diz qual
  aba falta). Em teste novo use `exigirFixtures(t, ['Aba'])` (`fixtures-exigidas.mjs`); o `reporter-estrito.mjs` cobre os
  `t.skip` antigos. Sem a variável, tudo continua pulando em silêncio como antes (CI sem a planilha).
- **Velocidade** (A-75): `fixtures.json` é lido/parseado 1 vez por processo (`lerFixturesRaw_`), as abas só são convertidas
  quando alguém as lê, e `criarSandboxGs` é o único jeito de montar o sandbox (`carregarTodasAsTelasComDadosReais({ compartilhar: true })`
  reaproveita o resultado em teste que só lê). O pre-commit roda só os testes dos arquivos afetados
  (`pre-commit-testes.mjs`; `npm run test:afetados -- apps-script/Metas.gs` simula); a suíte completa é `npm test` e o
  relatório das telas é `npm run verificar` / `npm run relatorio` (o teste do relatório agora grava numa pasta temporária).
- **Alertas de dado novos** (A-81, `qualidade-dados.mjs`): lote RF duplicado, P/VP/P/L fora da faixa entre fontes, ticker
  "Erro" em Proventos, aporte "Concluído" sem lançamento há mais de 10 dias, Atenção/Erro por fonte nos últimos 7 dias.
  Provados com planilha inventada em `qualidade-dados-checagens.test.js`.
