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
