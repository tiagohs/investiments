# Guia de UI Material 3 (kit Figma) — para quem mexe nas páginas

Atualizado em 05/10/2026 (Onda 3, base de UI). Catálogo vivo, claro e escuro, sem dado real: `docs/componentes-m3.html` (abra pela prévia).
O kit Figma manda; este guia só diz **como usar o que já existe**. Nada de framework: CSS próprio + módulos ES em `assets/js/ui/`.

## 1. Ordem dos arquivos no `<head>` (já feito nos 9 HTMLs)
`m3-tokens.css` → `shell.css` → `components.css` → CSS da página. O CSS da página só descreve o que é **dela** (layout, gráfico próprio); cor, tipografia, botão, aba, cartão, tabela e campo vêm da base.

## 2. Tokens (nunca use hex)
- Cor: papéis M3, claro/escuro automáticos. `var(--md-sys-color-primary | on-primary | primary-container | secondary-container | surface | surface-container(-high/-highest) | background | on-surface | on-surface-variant | outline | outline-variant | error | error-container | inverse-surface)`.
  Extras: `--md-ext-color-good | warn | info` (+ `-container`, `on-…-container`), `--md-ext-color-card`, `--md-ext-color-zebra`.
- Texto: `--ink`, `--ink-muted`, `--ink-faint` (AA nos dois temas). Bordas: `--border`. Sombra: `--md-sys-elevation-level1..3`.
- Tipografia (Readex Pro): `--md-sys-typescale-{display,headline,title,body,label}-{large,medium,small}-{size,line-height,weight}`. Mínimo 12px (A-64). Números em coluna: `font-family:var(--mono)` (Roboto Mono; a Readex não tem algarismos tabulares).
- Forma: `--md-sys-shape-corner-{extra-small..full}`; cartão = 16px (`--r-card`), cartão grande = 24px. Movimento: `--md-sys-motion-duration-*` / `--md-sys-motion-easing-*` (respeite `prefers-reduced-motion`).
- Camadas (A-70): `--z-sticky 10, --z-header 50, --z-rail 52, --z-drawer 55, --z-backdrop 60, --z-drawer-modal 65, --z-painel 70, --z-modal 80, --z-toast 90, --z-calendario 100, --z-tooltip 110`. **Nunca** `z-index` numérico solto.
- Layout: `--topbar-h`, `--rail-w` (80px), `--nav-w` (280px), `--pag-max` (1520px), `--coluna-lateral` (320px).

### Gráficos (contrato com `assets/js/charts/`)
- Categórica, ordem **fixa**: `--chart-1` Ações, `-2` FIIs, `-3` Renda Fixa, `-4` EUA, `-5` Cripto, `-6` Caixa/Reserva, `-7`/`-8` extras. Variantes: `--chart-N-ink` (texto/legenda sobre a superfície) e `--chart-N-soft` (preenchimento suave).
- Rampa do primary (clara→escura): `--chart-ramp-1..5`.
- Semântica: `--chart-up`, `--chart-down`, `--chart-grid`, `--chart-axis`, `--chart-surface`, `--chart-tooltip-bg`, `--chart-tooltip-fg`.
- Legados são **aliases**: `--acoes/--fiis/--rf/--eua/--cripto/--caixa` = cor da CLASSE (`--chart-N-ink`), não mais o acento da interface. Acento de UI = `--md-sys-color-primary` (lima/oliva). `--good/--bad/--warn/--border/--bg/--surface` continuam existindo.

## 3. Componentes (CSS em `components.css`)
- **Botões**: `.btn` + `.btn-filled|.btn-tonal|.btn-outlined|.btn-text|.btn-perigo|.btn-perigo-ghost`, `.btn-sm|.btn-lg|.btn-bloco`; `.icon-btn(.icon-btn-tonal|.icon-btn-filled)`. Ícone dentro: `<svg class="ico"><use href="#ico-nome"/></svg>`. Carregando: `.carregando` + `<span class="spinner">`. `.btn-primary` = filled e `.btn-ghost` = contorno suave (legados ok).
- **Chips**: `.chip` (`.on` ou `aria-pressed="true"`; `.filter-tab.active` legado funciona), `.chip-tonal.chip-good|bad|warn|info|primary` (selos), `.segmented`, `.badge`.
- **Cartão**: `.card` (+`.card-lg|.card-filled|.card-elevated|.card-flat|.card-clicavel`); cabeçalho `.card-cab > (.card-rotulo + .card-titulo) + .card-acoes`; `.card-nota`. Um único cartão padrão: branco (slate-800 no escuro), contorno 1px, raio 16.
- **KPI**: `.grid-kpi > .card > .kpi > .kpi-topo(.kpi-rotulo) + .kpi-valor(<small>,00</small>) + .kpi-sub`; variação: `.tendencia.sobe|desce|estavel` ou `.var.sobe|desce` (ícone `ico-north-east`/`south-east`/`trending-flat` — nunca só cor).
- **Tabela (kit)**: `.card.card-flat > .tabela-wrap > table.tabela`. Zebra e cantos arredondados vêm prontos; `td.num`/`th.num` = mono à direita; ordenação: `<th aria-sort="ascending|descending"><button>Rótulo<svg>…</svg></button></th>`; `.col-opc` some no celular (use o toque na linha → `abrirFolha`); célula de ativo: `.cel-ativo > .logo-circulo + .cel-ativo-textos(.cel-ativo-ticker + .cel-ativo-nome)`; `.tabela-sticky` fixa o cabeçalho; densidade `.tabela-baixa|.tabela-alta`; checkbox `.cb`.
- **Campos**: `.campo > .campo-rotulo + .input|.select|.textarea + .campo-ajuda`; erro: `.campo.erro` ou `aria-invalid="true"`.
- **Feedback**: `.progress-linear > span[style="--p:62%"]`, `.barra-fina`, `.progress-circular`, `.skel .skel-linha|.skel-titulo|.skel-bloco`, `.estado`/`.estado-erro`, `.dialogo*`, `.toasts/.toast*` (os três últimos via JS).
- **Layout de página**: `.pagina-cab` (cabeçalho), `.pagina-grid(.com-lateral) > .pagina-principal + .pagina-lateral`, `.grid-kpi`, `.grid-2`, `.grid-3`.
- Também: `.menu`, `.switch`, `.faixa-config`, `.lista-resumo/.lista-item`, `.rank`, `.avatar(-lg)`, `.dica-escura`.

## 4. JS: `import { … } from '<raiz>/assets/js/ui/index.js'` (ou direto do `shell.js`, que reexporta)
- **Hierarquia de abas do kit** (use nessa ordem): abas em **pílula** = subpáginas (Aportes · Lançamentos); abas **sublinhadas** = recortes dentro da subpágina (Ações · FIIs · EUA · Renda Fixa); **breadcrumb** = telas de detalhe (Carteiras › Ações › PETR4).
  ```js
  const abas = criarTabs(el, { variante: 'pilula' /* ou 'sublinhada' */, rotulo: 'Subpáginas', ativo: 'aportes',
    itens: [{ id: 'aportes', rotulo: 'Aportes' }, { id: 'lancamentos', rotulo: 'Lançamentos', contagem: 4 }], aoMudar: (id) => … });
  abas.selecionar(id); abas.atualizarItem(id, { contagem: 5 });   // teclado: ← → Home End; itens com href viram links com aria-current
  criarBreadcrumb(nav, [{ rotulo: 'Carteiras', href: '…' }, { rotulo: 'Ações', href: '…#acoes' }, { rotulo: 'PETR4' }]);
  ```
- **Cabeçalho + título da aba do navegador** (`"<Subaba> · <Seção> · Patrimônio"`):
  ```js
  const cab = montarCabecalhoPagina(document.getElementById('cabecalho'), { secao: 'Transações', subaba: 'Aportes', titulo: 'Transações',
    subtitulo: ['Aportes de ', { texto: 'outubro', tom: 'bom' }], refresh: true, acoes: [botao], abas: { pilula: { itens, ativo, aoMudar } } });
  cab.refreshEl  // container pro mountRefreshControl; cab.definirSubtitulo(…); cab.definirTitulo('…', { subaba })
  ```
  Ao trocar de subaba chame `definirTituloPagina({ subaba, secao })`.
- **Confirmar (A-62)**: `if (await confirmar({ titulo: 'Excluir lançamento?', mensagem: '…', confirmarTexto: 'Excluir', perigo: true })) { … }` — no celular vira folha embaixo; Esc/toque fora = `false`; foco inicial em "Cancelar" quando `perigo`. **Nunca mais `window.confirm`.** `abrirFolha({ titulo, conteudo, acoes })` pra folhas com formulário.
- **Toast**: `toast.ok('Salvo')`, `toast.erro('…')`, `toast.aviso`, `toast.info`, `toast('…', { desfazer: () => … })`. Máx. 3 na pilha, erro fica 8s e tem ×. Substitui `alert()` e mensagens soltas.
- **Erro de carga (A-60)**: no ramo `!resp.ok`/`catch` de **toda** tela: `mostrarErroCarga(elConteudo, { tela: 'Carteiras', resposta: resp, erro: e, aoTentar: carregar })` (classifica rede/sessão/planilha/servidor; detalhes técnicos em `<details>`). Vazio: `mostrarEstadoVazio(el, { titulo, texto, acao })`.
- **Refresh**: `mountRefreshControl(doc, el, aoAtualizar)` — se `aoAtualizar` devolver `false` ou lançar, mostra "Falhou ao atualizar" (sem fingir "Atualizado às").
- **Menu "…"**: `ligarMenu(botao, () => [{ rotulo: 'Editar', icone: 'edit', aoClicar }, { separador: true }, { rotulo: 'Excluir', icone: 'delete', perigo: true, aoClicar }])`.
- **Switch**: `criarSwitch(el, { rotulo, descricao, marcado, aoMudar })`.
- **Busca global** (top bar) já está pronta: telas + ativos do cache local (IndexedDB), atalho `/`. Tela nova com subpáginas: `registrarTelasBusca([{ rotulo, secao, href, palavras }])`.

## 5. O que remover do CSS das páginas
- Definições próprias de `:root`/cores/`@media (prefers-color-scheme)` repetidas (use os tokens); `font-family` fixa (Fraunces/Public Sans/IBM Plex): a base já aplica Readex Pro e Roboto Mono.
- Botões, chips/`.filter-tab`, abas, cartões, tabelas, campos e skeleton duplicados: use as classes da base e só acrescente o que for específico.
- `z-index` numéricos (use `--z-*`), `outline:none` sem alternativa (o foco visível é global, A-58), fontes < 12px (A-64), alvos de toque < 48px (os componentes da base já ampliam; A-59).
- Sombras pesadas e bordas duplas: cartão do kit = contorno 1px + zebra suave; elevação só em menu/diálogo.
- Não mexa em `shell.css`, `m3-tokens.css`, `components.css` nem no `<head>`: peça a mudança.

## 6. Navegação (já pronta)
Trilho 80px (≥840px) + gaveta 280px (☰; ≥1200px empurra o conteúdo e lembra a escolha, 840–1199px abre por cima com scrim, <840px é modal). Top bar: busca em pílula, carrinho (pílula filled com badge), sincronização, tema e conta. Contrato mantido: `body[data-section]`, `#mainnav .nav-item[data-section]`, `[data-toggle-panel]`, `.overlay-panel.open`.
