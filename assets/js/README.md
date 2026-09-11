# assets/js

Módulos JS puros do front-end, sem framework/build tool (decisão registrada em `docs/mapa-paginas.html`).

Ordem de construção (ver `docs/plano-implementacao.html`, Fase 1):
1. `config.js` — constantes compartilhadas (APPS_SCRIPT_URL, CLIENT_ID).
2. `api-client.js` — cliente puro (sem DOM) que fala com o Apps Script Web App.
3. `auth.js` — gerencia o token do Google Identity Services.
4. `shell.js` — injeta a topbar/nav/tema/badge de sincronização (`shell.html`/`shell.css`) em cada página.

Cada página HTML carrega esses módulos via `<script>` simples (sem bundler). Testes unitários correspondentes ficam em `tests/`.
