# assets/js

Módulos JS puros do front-end, sem framework/build tool (decisão registrada em `docs/mapa-paginas.html`).

Ordem de construção (ver `docs/plano-implementacao.html`, Fase 1):
1. `config.js` — constantes compartilhadas (APPS_SCRIPT_URL, CLIENT_ID).
2. `api-client.js` — cliente puro (sem DOM) que fala com o Apps Script Web App.
3. `auth.js` — gerencia o token do Google Identity Services.
4. `shell.js` — injeta a topbar/nav/tema/badge de sincronização (`shell.html`/`shell.css`) em cada página.

Cada página HTML carrega esses módulos via `<script>` simples (sem bundler). Testes unitários correspondentes ficam em `tests/`.

## Carga por tela (A-42, 06/10/2026)

Sem build: o site é publicado direto da branch. Cada tela carrega só o que usa:
- `router.js` importa as abas (Início, Acompanhamento, Metas) com `import()` na 1ª visita; `carteiras-router.js` faz o mesmo com as 5 subpáginas; `pages/transacoes.js`, com Aportes/Lançamentos.
- Peças puras ficam em arquivos próprios (`pages/inicio-calc.js`, `metas-calc-nucleo.js`, `carteiras-pecas.js`, `momento-carga.js`) — **nunca dentro do arquivo da tela**, senão quem as importa arrasta a tela inteira. Os módulos antigos (`inicio.js`, `metas-calc.js`, `carteiras-classe-comum.js`, `momento-aporte.js`) reexportam os nomes que moravam neles.
- Cada HTML tem o bloco `<link rel="modulepreload">` do caminho crítico: depois de mudar um import estático rode `node scripts/gerar-modulepreload.mjs` (o `tests/carga-telas.test.js` falha se estiver desatualizado e confere o orçamento de módulos/KB por tela). `node scripts/grafo-imports.mjs --dinamicos` mostra o que cada HTML carrega.
- Medir de verdade: `node tests/harness/previa.mjs 8851 &` e `python3 tests/harness/medir-carga.py` (cache frio); `python3 tests/harness/varredura-runtime.py` percorre todas as telas (1280 e 390 px, gaveta, busca, subabas) e falha com erro de console.
