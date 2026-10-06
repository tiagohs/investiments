# Guia de desenvolvimento — para as próximas etapas gastarem menos tempo

> Escrito em 06/10/2026, depois de uma fase de 5 dias com agentes paralelos (ver `docs/historico-projeto.md`) e da auditoria geral (`docs/auditoria-2026-10.md`). Objetivo: quem pegar uma tarefa (humano ou agente) acha em minutos **onde mexer**, **como medir** e **o que entregar**. Repositório **público**: nenhum valor real (saldo, dívida, salário, conta, CPF, nome de empregador, endereço) em `docs/`, testes, comentários ou prints — dado real só em `tests/harness/fixtures.json` (gitignored).

## 1. Arquitetura em 1 página

```
Navegador (GitHub Pages, estático, sem framework nem build)             Google
┌────────────────────────────────────────────────────────────┐   ┌──────────────────────────────┐
│ *.html  →  shell.js (header/menu/tema/sync, partials/shell.html)│   │ Apps Script Web App          │
│        →  Router do front (router.js: Início | Acomp. | Metas;  │   │  Router.gs: doGet/doPost     │
│           carteiras-router.js: 5 sub-telas) + pages/*.js         │   │   verificarToken 1x no topo  │
│  módulos ES puros: *-calc.js (conta) × pages/*.js (DOM)         │   │   → handleXxx(e, auth)       │
│  api-client.js  ── GET ?action&token | POST (form) ───────────▶│──▶│  *.gs (um por domínio)       │
│  cache: IndexedDB (cache-dados.js) · sessionStorage             │   │  CacheService (6 h, pedaços) │
│         (carteiras-cache.js) · localStorage (token, tema,       │   │  PropertiesService (sessão,  │
│         carrinho, período) · service worker (esqueleto)         │   │   último bom, flags)         │
└────────────────────────────────────────────────────────────┘   │  LockService (script único)  │
                                                                  │  Gatilhos: Agenda 10:01       │
            Planilha Google do Tiago = ÚNICA fonte de dados       └──────────────┬───────────────┘
   abas "nativas" (Transações, Carteira *, Distribuição e Metas, Proventos…)    │
   + abas aux_* (o app lê E grava) + pastas do Drive (Documentos/…)  ◀───────────┘
```

- **Front**: HTML estático + módulos ES (`<script type="module">`), CSS por página + `shell.css` (tokens claro/escuro), SVG puro para gráficos (sem biblioteca), `pdf.js` e SheetJS só para ler arquivos no navegador. Testes: `node --test` + jsdom. Decisão antiga e mantida: **sem React/bundler** (a auditoria recomenda só um passo de build para code-splitting e hash de arquivo — A-42).
- **Dois "routers"**: o do **Web App** (`apps-script/Router.gs`, por `action`) e os do **front** (`assets/js/router.js` troca Início/Acompanhamento/Metas sem recarregar a página; `carteiras-router.js` troca as 5 sub-telas de Carteiras). Não confundir ao ler "ação do Router" nesta documentação: sempre é o `action` do `Router.gs`.
- **Autenticação**: login com Google Identity Services (token de 1 h) → `criarSessao` → token de sessão `s1.*` (7 dias, HMAC) guardado em `localStorage` e enviado em toda chamada; `verificarToken` roda **uma vez** no topo de `doGet`/`doPost` e os handlers recebem `auth`. Usuário único (e-mail fixo em `Auth.gs`).
- **Contrato de resposta**: `{ ok: true, ... }` ou `{ ok: false, etapa, erro }`; falha de rede vira `{ ok:false, etapa:'network' }` no `api-client.js` — quem chama só confere `resp.ok`. Sessão recusada (`etapa:'autenticação'`) apaga o token e a próxima página manda para o login.
- **Abas `aux_*`**: o app é dono delas (histórico de patrimônio/renda fixa/índices, aportes, metas, gastos, fundamentos, vídeos, FII…). Fórmulas gravadas por `setFormula` usam **";" e nomes em inglês**. Blocos JSON em **uma célula** têm teto de ~49.000 caracteres (Metas/Patrimônio/Portfólio — A-37).
- **Caches** (do mais próximo do usuário ao mais distante):

| Camada | Onde | O que guarda | Validade | Quem invalida |
|---|---|---|---|---|
| Service worker | `sw.js`, cache `patrimonio-shell-v3` | Esqueleto (HTML/JS/CSS rede-primeiro; imagens/fontes cache-first) | Até subir `CACHE_VERSION` | Manual (A-42 propõe hash) |
| IndexedDB | `cache-dados.js` (`patrimonio-cache`) | Respostas inteiras (ex.: `home`, 1,8 MB) em *stale-while-revalidate* | Até 7 dias (só evita tela vazia) | `limparCacheDados()`; logout **não** limpa (A-44) |
| sessionStorage | `carteiras-cache.js` | Resposta das 5 sub-telas de Carteiras | 5 min | Fim da sessão |
| localStorage | vários | Token de sessão, tema, carrinho (`transacoes.carrinho.v1`), período escolhido (`periodo:<chave>`), preferências | — | Usuário |
| CacheService | `.gs` (`comCacheAtivo_`, `gravarSerieHistoricoCache_`…) | Série do `home` (22 pedaços), `ativo` por ticker, RF montada, macro, câmbio | 6 h (máx. do serviço); pré-aquecimento pelos gatilhos | Chave com dia + contagens de linhas (frágil: A-32) e `limparCacheHistoricoInicio_` nos handlers de escrita |
| PropertiesService | `.gs` | Sessão, "último bom" de alguns fetches, flags da Agenda | Persistente | Código |

- **Agenda diária** (`Agenda.gs`): um gatilho "despertador" (~8–9 h) cria um gatilho de **uma vez só** para hoje 10:01 (America/Sao_Paulo); cada execução roda **uma etapa**: Ativos → Renda Fixa + Índices (principais) → Snapshot do resumo → Proventos FNet → Informes FNet → Fundamentos → Portfólio dos FIIs (secundárias, só se as principais deram certo); falhou → nova tentativa em 10 min (até 3). Domingo não agenda. Tudo registra em "Registro de Controle" (Sucesso/Atenção/Erro).
- **Fuso**: planilha em `America/New_York` (o `.xlsx` exporta datas nesse relógio — o harness converte), projeto Apps Script em `America/Sao_Paulo`. "Hoje" no front deve ser o de São Paulo (`hojeSP()` é proposta A-19).

## 2. Mapa tela → arquivos → ação do Router → .gs → abas

Convenção: `pages/` = `assets/js/pages/`; JS comuns em `assets/js/`; CSS em `assets/css/`. *Impl* nos testes = função de `api-client.js` injetável.

| Tela | HTML / entrada | JS (`pages/` e comuns) | CSS | Ações do Router (GET · **POST**) | .gs | Abas / Drive |
|---|---|---|---|---|---|---|
| **Início** | `index.html` → `router.js` (rota `inicio`) | `pages/inicio.js` (montagem), `inicio-calc.js` (contas puras), `inicio-rentabilidade.js`, `inicio-ativos.js`, `inicio-painel.js`, `inicio-comparativo.js`, `inicio-favoritos.js`, `inicio-intradia.js`, `inicio-proventos.js`; `analise-grafico.js`, `periodo-personalizado.js`, `cache-dados.js` | `shell`, `charts`, `componentes-grafico`, `comum-telas`, `inicio` | `home`, `intradia`, `historicoAtivo` · **`salvarFavoritos`** | `Home.gs` (orquestra), `HistoricoInicio.gs`, `MeusAtivos.gs`, `FluxoCaixaInicio.gs`, `Intradia.gs`, `Favoritos.gs` | `Auxiliar_ativos`, `Carteira *`, `Transações*`, `aux_historico-patrimonio`, `-renda-fixa`, `-indices` |
| **Acompanhamento de Ativos** (era Distribuições e Metas) | `distribuicoes-metas.html` (rota `distribuicoes`) | `pages/distribuicoes-metas.js`, `metas-card.js`, `analise-grafico.js` | `shell`, `charts`, `comum-telas`, `distribuicoes-metas` (+ `metas`, que o `metas-card.js` injeta) | `distribuicoesMetas`, `metas`, `intradia` · **`salvarObjetivosCarteira`, `salvarRadarItem`, `salvarSplitInterno`, `salvarMetaRendaPassiva`, `salvarMetaPatrimonio`, `salvarMesesRendaEmergencial`** | `DistribuicoesMetas.gs`, `Metas.gs` | "Distribuição e Metas", `Auxiliar_ativos`, `aux_fundamentos` |
| **Metas e Objetivos** | `metas.html` (rota `metas`, `TEMPLATE_METAS`) | `pages/metas.js`, `metas-template.js`, `metas-calc-{nucleo,plano,viagem,analise}.js` (contas puras; `metas-calc.js` é só o barril), `metas-graficos.js`, `metas-viagem.js`, `metas-card.js`, `momento-aporte.js`/`momento-carga.js`; dados `assets/data/*.json` | `shell`, `charts`, `componentes-grafico`, `comum-telas`, `distribuicoes-metas`, `metas` | `metas`, `metasHistorico`, `macro` · **`salvarMeta`, `excluirMeta`, `excluirMetaDefinitivo`** | `Metas.gs`, `RendaFixaIR.gs`, `Macro.gs` | `aux_metas`, `aux_cambio`, `aux_patrimonio`, `aux_historico-*`, "Distribuição e Metas" |
| **Carteiras — Visão geral** | `carteiras/index.html` → `carteiras-router.js` | `pages/carteiras-visao-geral.js`, `carteiras-classe-comum.js`, `carteiras-pecas.js` (logos e viés, leves), `carteiras-cache.js`, `metas-card.js` | `shell`, `inicio`, `componentes-grafico`, `carteiras` | `carteirasHome`, `home`, `metas` | `CarteirasHome.gs`, `Home.gs` | `Carteira *`, `aux_historico-*` |
| **Carteiras — Ações / FIIs / Ações EUA / Renda Fixa** | idem | `pages/carteiras-acoes.js`, `carteiras-fiis.js`, `carteiras-acoes-eua.js`, `carteiras-renda-fixa.js`, `carteiras-classe-comum.js`, `carteiras-proventos.js` | idem | `carteirasAcoes`, `carteirasFiis`, `carteirasAcoesEua`, `carteirasRendaFixa`, `home` | `CarteirasClasses.gs`, `CarteirasRendaFixa.gs`, `CarteiraRendaFixaSync.gs`, `RendaFixaIR.gs` | `Carteira Ações/FIIs/Ações USA/Renda Fixa`, `RF Contratada - Resumo/Lotes`, `aux_historico-indices` |
| **Carteiras — adicionar/remover ativo** ("+") | `carteiras/index.html` | `pages/novo-ativo.js` | `carteiras` | `infoNovoAtivo` · **`adicionarAtivo`, `removerAtivo`, `consolidar`** | `NovoAtivo.gs`, `Consolidacao.gs`, `Incorporacoes.gs` | `Carteira *`, `Auxiliar_ativos`, `aux_historico-*` |
| **Detalhe do Ativo** (ação, FII, EUA, RF) | `ativo/index.html?ref=…` | `pages/ativo.js`, `ativo-calc.js`, `ativo-patrimonio.js` (+`-calc`, só FII), `criterios/{motor,base-acoes,base-fiis,base-rentabilidade,macro}.js`, `analise-grafico.js`, `videos.js`, `canais-youtube.js`, `link-ativo.js`, `momento-aporte.js` | `shell`, `inicio`, `carteiras`, `ativo`, `ativo-patrimonio` | `ativo`, `noticiasAtivo`, `tesesAtivo`, `fiiPortfolio`, `videos`, `intradia`, `metas`, `macro`, `historicoAtivo` · **`fiiPortfolioCoords`** | `Ativo.gs`, `Fundamentos.gs`, `PortfolioFii.gs`, `Videos.gs`, `HistoricoAtivo.gs`, `Macro.gs`, `Intradia.gs` | `aux_fundamentos*`, `aux_fii-portfolio/-geocache/-cnpj`, `aux_informes-fii`, `aux_videos*`, `aux_proventos-*`; Drive (teses) |
| **Proventos** | `proventos/index.html` | `pages/proventos.js`, `proventos-calc.js` | `shell`, `inicio`, `carteiras`, `proventos` | `proventos` · **`importarProventosB3`** | `Proventos.gs`, `FnetProventos.gs`, `FnetInformesFii.gs` | `Proventos`, `Proventos - USA`, `aux_proventos-anunciados`, `aux_proventos-conferencia`, `aux_informes-fii` |
| **Transações — Aportes** | `transacoes/index.html` | `pages/transacoes.js`, `aportes.js`, `aportes-calc.js`, `aportes-eua.js`, `aportes-eua-calc.js`, `aportes-rf-calc.js`, `aportes-grafico(-calc).js`, `aportes-mapa(-calc).js`, `momento-aporte.js`, `carrinho-global.js`, `carrinho-header.js` | `shell`, `inicio`, `carteiras`, `transacoes` | `transacoes`, `aportesPendentes`, `historicoAtivo` · **`salvarAporte`, `excluirAporte`, `salvarCaixaDolar`, `excluirCaixaDolar`** | `Aportes.gs` | `aux_aportes`, `aux_caixa_dolar`, `Transações*`, `Carteira Renda Fixa` |
| **Transações — Lançamentos** | idem | `pages/lancamentos.js`, `lancamentos-parse.js` (SheetJS no navegador) | idem | **`importarLancamentos`, `importarTransacoesB3`** | `Lancamentos.gs`, `ImportB3.gs` | `Transações*`, `aux_proventos-conferencia` |
| **Organização — Patrimônio** | `organizacao/despesas.html#patrimonio` | `pages/organizacao.js`, `organizacao-patrimonio.js`, `patrimonio-calc.js`, `patrimonio-graficos.js`, `patrimonio-import.js`, `patrimonio-inflacao.js` | `shell`, `inicio`, `carteiras`, `organizacao`, `patrimonio`, `componentes-grafico` | `patrimonio`, `patrimonioIrArquivos`, `patrimonioIrArquivo` · **`salvarPatrimonio`** | `Patrimonio.gs` | `aux_patrimonio` (JSON por chave), `aux_patrimonio-indices`, `aux_historico-*`; Drive (IR) |
| **Organização — Gastos e Despesas** | `#despesas` / `#gastos` | `organizacao.js`, `organizacao-calc.js`, `organizacao-gastos.js`, `gastos-calc.js`, `gastos-import.js` (pdf.js) | `+ gastos` | `despesas`, `gastos`, `gastosArquivos`, `gastosArquivo` · **`salvarDespesas`, `salvarImportacaoGastos`, `salvarRegraGastos`, `excluirArquivoGastos`** | `Despesas.gs`, `Gastos.gs` | "Despesas Essenciais", `aux_gastos`, `aux_gastos-arquivos`, `aux_gastos-regras`, `aux_historico-despesas`; Drive (`Documentos/Transações`) |
| **Organização — Renda e Orçamentos** | `#renda` (`#salario` antigo) | `organizacao-renda.js`, `organizacao-salario.js`, `renda-calc.js`, `salario-calc.js`, `holerite.js` (pdf.js) | `+ renda` | `salario`, `holeritesArquivos`, `holeriteArquivo` · **`salvarSalarioBase`, `salvarPagamentoSalario`, `excluirPagamentoSalario`, `salvarHoleriteDrive`** | `Salario.gs` | "Salário", `aux_holerites-arquivos`; Drive (`Documentos/Trabalho/…/Holerite/ANO`) |
| **Organização — Simulações** | `#simulacoes` / `#simulador` | `organizacao-simulacoes.js`, `organizacao-simulador.js`, `simulador-dividas-calc.js`, `patrimonio-calc.js` (regra da Caixa) | `+ simulador` | (usa `patrimonio`, `despesas`) | `Patrimonio.gs` | `aux_patrimonio` |
| **Organização — Documentos** (painel nas 4 abas) | idem | `organizacao-documentos.js` | `organizacao` | (reusa `gastosArquivos`, `holeritesArquivos`, `patrimonioIrArquivos`) | — | Drive |
| **Login** | `login.html` | `pages/login.js`, `auth.js`, `auth-ui.js` | `shell`, `login` | `ping` · **`criarSessao`** | `Auth.gs` | — |
| **Shell** (header, sync, carrinho, tema) | `assets/partials/shell.html` | `shell.js`, `theme.js`, `carrinho-header.js`, `cache-dados.js`, `api-client.js` | `shell` | `syncStatus`, `syncHistorico`, `aportesPendentes`, `consolidacao` · **`sincronizarAgora`, `sincronizarRendaFixaEIndices`, `sincronizarProventosFnet`, `sincronizarInformesFnet`, `sincronizarVideos`, `atualizarFundamentos`, `limparCacheHistorico`, `consolidar`** | `Sync.gs`, `BackfillIndices.gs`, `Agenda.gs`, `Consolidacao.gs`, `FnetProventos.gs`, `FnetInformesFii.gs`, `Videos.gs`, `Fundamentos.gs` | "Registro de Controle" |

**Sem tela própria**: `SnapshotResumoDiario.gs` (etapa da Agenda), `BackfillRendaFixa.gs` (reconstrução diária de RF), `DiagnosticoAtivos.gs` (uso único), `Planilha.gs` (helpers de leitura por rótulo), `Macros.gs` (macro legada). `Router.gs` tem também `meusAtivos`, `historico_inicio`, `irRendaFixa`, `fundamentos` e `fiiPortfolioCoords` (algumas sem chamada no front — A-79).

## 3. Convenções

### Estilo de código e comentários
- **Português** em comentários, textos de tela, nomes de função e commits (commits sem acento, via heredoc). Comentário **datado** citando o pedido: `// 05/10/2026 (Tiago: "..."): ...`. Funções puras (conta) em `*-calc.js`, sem DOM nem rede; DOM e orquestração em `pages/*.js`; o `api-client.js` é o único que conhece `fetch`.
- Módulos injetam dependências (`getXxxImpl`, `salvarXxxImpl`, `agora`) para teste; o front **nunca** pode quebrar com campo opcional ausente (ex.: `fundamentos`).
- `.gs` **nunca é implantado pela nuvem**: o Tiago cola no editor e faz **nova versão da implantação**. Fórmulas via `setFormula` com ";" e nomes em inglês. Handlers de escrita usam `LockService` e invalidam o cache do domínio.

### Formatação (usar `assets/js/format.js`; evitar helpers locais — A-68)
| O quê | Função | Resultado |
|---|---|---|
| Dinheiro BRL | `formatBRL(n)` | `R$ 1.234,56`; não numérico → `—` |
| Dinheiro compacto | `formatBRLCompacto(n)` | `R$ 3,8 bi` |
| USD | `formatUSD(n)` | hoje `$1,234.56` (en-US) — **padrão-alvo `US$ 1.234,56`** (A-06); nunca escrever helper local `usd` |
| Dólar com conversão | `formatComConversao(...)` | `US$ 1.234,56 (R$ …)` |
| Número | `formatNumeroBR(n, casas)` | `1.234,56` |
| % de fração (0,085) | `formatPercentFromFraction(f)` | `+8,50%` (sinal explícito) |
| % em pontos (8,5) | `formatPercentFromPoints(p)` | `+8,50%` |
| Data | `formatDateBR(iso)` | `dd/mm/aaaa`; **ISO `AAAA-MM-DD` só interno** (nunca na tela) |
| Data e hora / relativo | `formatDateTimeBR`, `formatRelativeTime` | |

Regras: **percentuais no backend e nos contratos são fração** (0,085 = 8,5%); valores monetários na moeda do ativo; datas ISO; sinal negativo padronizado (o alvo é "−" U+2212 em toda a UI; hoje há mistura com hífen — A-68); "+" explícito só em **variação**; zero (|v| < 0,005%) é **neutro**, nunca verde (A-04); rótulos **bruto × líquido** e **fechado × corrente** em todo número financeiro que tenha as duas leituras (A-10, A-17).

### Componentes reutilizáveis (antes de criar classe/função nova, procure aqui)
| Componente | Onde | Uso |
|---|---|---|
| **Período personalizado** | `periodo-personalizado.js`: `ligarFiltroPeriodo(doc, tabsEl, { chave, periodoInicial, limites:{min,max}, comChip, aoMudar })`, `recortarPorIntervalo(serie, {inicio,fim})`, `atalhosPeriodo`; CSS `componentes-grafico.css` | **Todo** gráfico de série temporal tem filtro + "Escolher período" (calendário). `periodo` = preset (string) ou `{inicio, fim}` ISO; lembra a escolha em `localStorage` (`periodo:<chave>`). Lista canônica de atalhos: A-67 |
| **Análise de gráfico** | `analise-grafico.js`: `analisarSerie({serie:[{data,valor}], indices:{CDI,IPCA…}, periodo, nome, formatarMoeda})` → `{tom, resumo, pontos}`; `analisarRendaPassiva`, `complementarAnalise`; `renderAnalise(doc, container, analise)` / `htmlAnalise` | Card "Análise" **abaixo de todo gráfico de crescimento**, vários pontos por relevância, design discreto |
| **Critérios de análise do ativo** | `criterios/motor.js` (`avaliarAtivo`, `sinalPrecoMedio`, `sinaisDeMetas`), `base-*.js`, `macro.js` | Nota 0–100 + veredito + pontos; mesma função no card do ativo e no "momento de aporte" |
| **Tooltip "i" / explicações** | `infoHtml(texto)` em `metas-card.js` (botão `.mt-info`); `.info-alvo/.info-icon/.info-tooltip` (inicio.css) | "Explique com toast/i" qualquer termo (no ritmo, atrasada, TWR…). Hoje há 3 tipos de "i" e 7 mecanismos de tooltip — usar `infoHtml` e não criar mais um (A-66) |
| **Estados vazio / carregando / erro** | Carregando: skeleton `.skel` (inicio.css); erro: hoje cada tela escreve o seu (A-60 propõe `mostrarErroCarga` em `shell.js`); vazio: classe de estado vazio por tela (22 variações — A-66) | Todo bloco tem os **3 estados**; erro com texto humano (o que aconteceu + o que fazer), detalhe técnico recolhido, "Tentar de novo", e **sem** atualizar o "Atualizado às" |
| **Carregador compartilhado** | `criarCarregador(buscar)` em `organizacao.js` | Uma chamada por ação por tela; **nunca** `recarregar()` na carga inicial (A-39) |
| **Atualizar dados** | `mountRefreshControl(doc, container, aoAtualizar)` em `shell.js` (5 min) | Botão + "Atualizado às" padrão |
| **Cards de meta / links** | `metas-card.js` (`seloMetaHtml`, `statusPillHtml`, `urlMetas`, `cardMetaRendaPassiva`), `link-ativo.js` (`urlAtivo`, `refAtivo`), `logos-ativos.js` | Em qualquer tela que cite meta ou ativo |
| **Carrinho** | `carrinho-global.js` (`transacoes.carrinho.v1`, eventos `carrinho:mudou`/`carrinho:abrir`), `carrinho-header.js` | Carrinho expira no dia; no mesmo dia faz merge |
| **Confirmação/feedback** | hoje `window.confirm`, banners e botões; alvo: `confirmar()` + `toast()` (A-62) | Ação destrutiva sempre com confirmação ou "desfazer" |

### Tokens CSS (`shell.css`, claro e escuro — nunca cor fixa nem `z-index` solto)
- Superfícies/tinta: `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--border`, `--ink`, `--ink-muted`, `--ink-faint` (**só decorativo**: não passa em AA — A-57).
- Classes de ativo: `--acoes`, `--fiis`, `--rf`, `--usa` (+ `-soft`). Estados: `--good`, `--warn`, `--bad`, `--na` (+ `-soft` e **`-ink` para texto**).
- Tipografia: `--display` (Fraunces, títulos), `--body-f` (Public Sans), `--mono` (IBM Plex Mono, números). Sombra: `--shadow`, `--shadow-lg`.
- Alvo da Onda 3: `--z-header:50; --z-backdrop:60; --z-painel:70; --z-modal:80; --z-toast:90; --z-calendario:100`, `--fs-min:12px`, `--r-card`, `--pad-card`, alvo de toque ≥ 40–44 px e um `components.css` único (btn, chip, abas, card, herói, vazio, skel, info-tip).
- Mobile ≤ 560 px **sem rolagem lateral**, claro e escuro sempre testados; `prefers-reduced-motion` respeitado.

## 4. Checklist de entrega (cole no relatório final)

1. **Escopo**: só os arquivos do seu briefing; arquivos compartilhados (`Router.gs`, `api-client.js`, `tests/api-client.test.js`, `partials/shell.html`, `router.js`, `shell.css`, `shell.js`) só com **edições pequenas e aditivas** (`Edit`, nunca reescrever inteiro).
2. **Sintaxe**: `.gs` → `cp apps-script/X.gs <pasta-temporária>/X.js && node --check <pasta-temporária>/X.js`; módulos → `cp f.js <pasta-temporária>/f.mjs && node --check`.
3. **Testes**: `node --test tests/<seu-arquivo>` e, ao fim, `node --test` (≈ 3 min; 1.403 testes; hoje 3 falham só com a planilha "Controle 16" por suposição de aba vazia — A-73). Teste novo para **todo** bug corrigido (a auditoria mostrou que sem teste de coerência entre telas os erros passam).
4. **Prévia com dados reais** + **prints OLHADOS** (`Read` na imagem) em 390 px e desktop, claro e escuro, antes de entregar; para mobile, clicar nos botões dentro de painéis/gavetas (não só olhar).
5. **Dados**: nada de valor real, nome de empregador/banco/instituição, CPF, conta, endereço, senha ou token em arquivo versionado (testes com dados inventados). `fixtures.json`, PDFs, `relatorio/` e prints com dado real **ficam fora** do repositório.
6. **Relatório curto em português**: o que fez; arquivos criados/alterados; **lista de `.gs` que precisam de NOVA VERSÃO da implantação**; **funções para rodar 1× no editor** (ex.: configurar gatilho/pasta do Drive); estado dos testes; caminhos dos prints; dúvidas ou limitações reais.
7. **Sem commit nem push** pelo agente — o Tiago revisa e sobe.
8. Mudou comportamento de tela ou fluxo? Atualize `docs/mapa-paginas.html` (lista de páginas/abas) e, se for decisão de produto, `docs/historico-projeto.md`.

## 5. Prévia com dados reais e fixtures

- **Subir a prévia** (serve o repositório e responde `/__api` rodando os `.gs` **de verdade** num sandbox Node sobre `tests/harness/fixtures.json`; autenticação trocada por "sempre ok"; escrita só na cópia em memória):

  ```
  node tests/harness/previa.mjs 8821 &        # use a SUA porta (padrão 8790)
  ```

- **Prints** (Playwright; redireciona as chamadas do Apps Script para a prévia, bloqueia fontes do Google e pdf.js):

  ```
  python3 tests/harness/previaPlaywright.py index.html saida.png --porta 8821 [--largura 390] [--altura 844] [--escuro] [--inteira] [--esperar 8000]
  python3 tests/harness/previaPlaywright.py organizacao/despesas.html#patrimonio out.png --porta 8821 --inteira --esperar 8000
  ```

  Salve prints no diretório de trabalho da sessão (fora do repo). Mudou `.gs`? **Reinicie a prévia.** Se uma aba (ex.: `aux_patrimonio`) faltar nas fixtures, monte um JSON **inventado** e envie por `salvarPatrimonio` na própria prévia — nunca grave no repo.
- **Limites**: a prévia não tem internet nem Drive; responde da memória (tempo ≈ 0 — não mede 4G; use bytes e nº de chamadas); o banner `getRichTextValue is not a function` vem do fake de `SpreadsheetApp`, não é bug.
- **Regenerar fixtures** (a cada nova versão "Controle N" da planilha; baixe como `.xlsx`):

  ```
  python3 tests/harness/extrair-fixtures.py "/caminho/Investimentos - Controle NN.xlsx"
  ```

  Grava `tests/harness/fixtures.json` (alguns MB, **gitignored**, com `_meta` = nome do arquivo, que aparece no relatório). O `.xlsx` guarda datas em New_York — o `gas-vm-harness.mjs` converte (`reviveDate`). **Lacuna conhecida (A-74)**: o extrator não inclui "Registro de Controle", Metas, Salário, Gastos, Patrimônio, `aux_fundamentos`, `aux_fii-portfolio`, `aux_videos` nas versões antigas; sem a aba, a prévia devolve `ok:true` vazio e 22 arquivos de teste **pulam** (`t.skip`) — confira se a fixture tem a aba que o seu trabalho usa. Fixture velha não reproduz bug de dado novo: regenere antes de investigar.
- **Diagnóstico e conferência**: `node tests/harness/gas-vm-harness.mjs [--worst-days]`; `npm run relatorio` (≈ 3 s, tabelas de conferência das telas em `tests/harness/relatorio/`, gitignored); `npm run verificar` (tudo + relatório); `npm run vigiar` (a cada arquivo salvo); `qualidade-dados.mjs` (alertas `[DADO DA PLANILHA]` — não é bug do app).
- **Medir desempenho** (auditoria): contar `getValues`, células lidas, bytes de resposta e fetches por ação no sandbox (proxies sobre `SpreadsheetApp`/`CacheService`/`UrlFetchApp` em `montarSandboxPrevia()`); 1º sandbox = frio, 2ª chamada = quente. Ms de Node só ranqueiam.
- **Testes de mobile** (Playwright; base nos scripts da auditoria): para cada tela em 390 px — clicar um botão dentro de cada painel do header (pegaria A-01), `scrollWidth ≤ innerWidth`, âncoras abaixo do header, foco visível no Tab, `elementFromPoint` nos overlays.

## 6. Padrões recomendados (consolidado dos 3 relatórios da auditoria)

### Dados e cálculos
1. **Uma função por grandeza compartilhada** (patrimônio, proventos 12 m, líquido de resgate, IR/IOF, câmbio, "hoje"), usada por GS e front, com a janela/base no nome (`proventos12mFechados`, `reservaLiquida`) — A-10, A-13, A-17.
2. **Ids estáveis**: tabela única de aliases de tickers; id por lote/título de renda fixa (ISIN); vínculos nunca por nome — A-14, A-71.
3. **Metas guardam referência, não cópia**; todo valor congelado leva data e rótulo ("congelado em DD/MM") — A-12.
4. **Alocação exclusiva** nas metas: cada ativo conta uma vez, por prioridade; todo total "guardado" é calculado depois dela — A-11.
5. **Rotular** bruto × líquido e fechado × corrente em toda UI que mostra número financeiro.
6. **Dado ruim vira aviso visível**, nunca clip nem descarte silencioso (órfãos, dias com retorno extremo, duplicatas, P/VP absurdo) — A-14, A-20, A-26.
7. **`hojeSP()` único** e normalização de datas na leitura (ISO interno, dd/mm só na borda) — A-19, A-77.
8. **Toda configuração com data/valor de início** (financiamento, FGTS) tem fallback explícito e **aviso quando faltar** — nunca plano silencioso — A-07.
9. **Aporte "Concluído" só fecha** quando o lançamento correspondente existe — A-24.
10. **Teste de coerência entre telas** rodando no harness com fixtures reais a cada mudança de planilha — A-72. Testes de harness **não presumem aba vazia**: filtrar/zerar a aba que o teste inventa antes de injetar linhas — A-73.

### Planilha, cache e sincronização (backend)
11. **Leitura**: toda aba lida com `ultimaLinhaReal_(aba, colChave)` (nunca `getLastRow()` cru) e **UMA** `getValues` por bloco; **proibido** `getRange(...).getValue()` em laço; teste que conta chamadas por ação e falha acima de um orçamento (`distribuicoesMetas` ≤ 15 `getValues`, `home` ≤ 400 mil células) — A-31, A-34, A-72.
12. **Cache**: chave por conteúdo/versão (carimbo de última escrita) e uma `comCache_(chave, ttl, fn)` única que apaga a geração anterior e guarda o último bom (*stale-while-error*); **fetch externo só em gatilho, a tela só lê** — A-32, A-37, A-51.
13. **Fontes externas** por um único `buscarFonte_(nome, url)`: UA, timeout, **disjuntor persistente** em Properties, classificação transitório × permanente, log estruturado (Etapa | Fonte | HTTP | ms | tentativa) no Registro de Controle — A-49, A-51, A-54.
14. **Agenda**: estágio = função pura `{id, depende, transitorio(err)}`; falha não bloqueia independentes; o resumo diário lista "o que ficou para trás"; só o erro transitório é reagendado — A-47.
15. **Lock por recurso**, não o lock único do script; a sync só exclui outra sync e a célula de rascunho — A-45.
16. **O Registro de Controle é fonte de teste**: contrato que conta Atenção/Erro por fonte nos últimos 7 dias e quebra se uma fonte for 100% 404/403 — A-54, A-81.
17. **Payloads**: colunar para séries (> 1.000 pontos), janela de período por padrão, delta desde a última data do IndexedDB; **teto de 200 KB por resposta** medido em teste (`home` e `gastos` hoje violam) — A-35, A-40.

### Front, UI e segurança
18. **`format.js` e `util/html.js` (`esc`, `escAttr`) como únicas fontes**; teste de arquitetura que falha se `toLocaleString('pt-BR'`, `const usd =`, `const MESES`, `const esc =` aparecer fora deles — A-06, A-68.
19. **`components.css` único** + escala `--z-*` + tokens de texto AA (`--ink-muted`, `-ink`) + `--fs-min:12px` + alvo de toque ≥ 40 px — antes de criar qualquer classe nova de página, **confira lá** — A-57, A-59, A-64, A-66, A-70.
20. **`mostrarErroCarga` + `confirmar` + `toast`** em `shell.js`; mensagens com nome de função/aba só em `<details>` (nunca "rode `xxxDireto()`" na tela) — A-60, A-61, A-62.
21. **Cabeçalho de página padrão** (título + 1 linha + "Atualizar dados/Atualizado às") e `document.title = "<Subaba> · <Seção> · Patrimônio"`; `aria-current` e rótulos curtos no menu mobile — A-63, A-69.
22. **Períodos de gráfico**: lista canônica `PERIODOS` em `periodo-personalizado.js`; todo gráfico novo de série temporal já nasce com "Escolher período" — A-67.
23. **Carga**: `import()` por rota/subaba + `<link rel="modulepreload">` do caminho crítico em cada HTML (gerado: `node scripts/gerar-modulepreload.mjs` depois de mudar um import estático; `tests/carga-telas.test.js` confere o bloco, o CSS por aba e o orçamento de módulos/KB por tela) — **sem build/bundler** (o site é publicado direto da branch); CSS de cada aba carrega com o `import()` dela (`ROUTES[].css` em `router.js`) e o HTML de entrada linka só o da própria aba; módulo novo que várias telas usam: peça pura num arquivo `*-calc.js`/`*-pecas.js`, nunca dentro do arquivo da tela (senão quem importa arrasta a tela inteira); `sw.js` com `CACHE_VERSION` (suba ao mudar CSS/imagem que precise aparecer já); **um payload "bootstrap" por tela** (nunca 2 chamadas fixas antes da própria API); carregadores compartilhados sem `recarregar()` na carga inicial; a tabela pinta quando a **sua** API chega, gráficos pesados depois — A-39, A-41, A-42, A-43.
24. **Segurança**: logout limpa o IndexedDB e `investiments_*`; sessão ≤ 3 dias; CSP por `<meta>`; nenhum ID de planilha, e-mail autorizado nem total real no repo (e-mail na propriedade `EMAIL_AUTORIZADO`, gravada 1x por `configurarEmailAutorizado()`; link da planilha vem da API); `tests/manual/teste.html` e `opcoesTeste` fora de produção; **todo texto vindo de feed externo (vídeos, notícias) passa por `esc`** — A-27, A-44, A-68, A-80.
25. **Testes**: fixtures/sandbox carregados 1× por processo; pré-commit só no que mudou e suíte completa no CI; `extrair-fixtures.py` com **todas** as abas e teste de contrato de cabeçalhos por aba antes de trocar de planilha — A-74, A-75.

## 7. Armadilhas conhecidas (poupam horas)

- **Padding de linhas**: Transações, Transações-USA, Transações RF e Carteira RF têm fórmulas até a linha ~10.800; `getLastRow()` devolve ~10.803 mesmo com ~400 linhas reais (A-31). Isso também quebra chaves de cache baseadas em contagem de linhas (A-32).
- **Fuso do `.xlsx`**: datas do export em `America/New_York`; as séries mensais do BCB 433 chegam como "último dia do mês anterior 23:00" (cuidado com meses 0-indexados no JS).
- **GOOGLEFINANCE** só funciona dentro da planilha: o app aciona o Apps Script, que escreve a fórmula numa célula de rascunho, dá `flush` e lê (locale pt-BR e assincronia custaram 3 rodadas de erro — `docs/historico-projeto.md`).
- **`UrlFetchApp` sempre acrescenta "Google-Apps-Script" ao User-Agent**: fontes que bloqueiam isso (Fundamentus, SEC, Cloudflare) devolvem 403/404 — não é bug de código (A-49).
- **Apps Script não lê cabeçalhos HTTP**: por isso o token vai na URL do GET (A-44).
- **Teto de uma célula (50.000 caracteres)** para blocos JSON (`aux_metas`, `aux_patrimonio`, portfólio de FII).
- **Nome de aba/rótulo literal**: 190 `getSheetByName('literal')` e `getRange('A1')` espalhados; trocar de planilha quebra em silêncio (A-74). Prefira achar por rótulo (`Planilha.gs`).
- **Nova versão da implantação** é obrigatória depois de colar um `.gs` — só salvar não basta.
- **`tests/manual/teste.html`** é scaffold da Fase 0 (A-80); não use como modelo de página.
- **Prints e relatórios**: `tests/harness/relatorio/`, `fixtures.json`, `referencias-externas.local.json` e PDFs são gitignored — nunca force `git add -f`.

## 8. Onde está cada coisa (documentos)

| Documento | Para quê |
|---|---|
| `docs/historico-projeto.md` | Memória do projeto: decisões, fases, lições; seção "Fase 02–06/10/2026" |
| `docs/auditoria-2026-10.md` | Backlog único (82 itens, 4 ondas), sincronização, gargalos de carga |
| `docs/guia-desenvolvimento.md` | Este guia |
| `docs/mapa-paginas.html` | Mapa de páginas/abas e decisões de produto |
| `docs/planilha-formulas.md` | Mapeamento das fórmulas da planilha original (Transações, Carteiras, RF, Proventos) |
| `docs/plano-implementacao.html` | Checklist da Fase 0/1 (histórico) |
| `docs/direcao-visual.html` | Direção visual/mockups (paleta, tipografia, componentes) |
| `docs/ideias-produtos.md` | Ideias de produtos derivados do site |
| `tests/harness/README.md` | Harness com dados reais, relatório de conferência, pre-commit |

## 9. Publicação no GitHub Pages (workflow) e fontes próprias

**Antes**: o Pages servia a branch inteira — `tests/`, `scripts/`, `apps-script/` e `docs/` ficavam acessíveis na web. **Agora**: `.github/workflows/pages.yml` monta uma pasta `_site/` com **só o que o site usa** (as páginas `*.html` da raiz, `favicon.ico`, `manifest.json`, `sw.js`, `assets/` e as pastas de páginas `ativo/ carteiras/ organizacao/ proventos/ transacoes/`) e a publica pelo GitHub Actions. O job `montar` roda em todo push (e confere que nada interno foi junto); o job `publicar` está com `continue-on-error`, então **enquanto o Pages continuar em "Deploy from a branch" nada quebra** — o site segue saindo da branch como hoje.

**Passo único do Tiago** (1 vez, no GitHub): *Settings › Pages › Build and deployment › Source: **GitHub Actions***. Depois disso cada push na branch principal publica o site pelo workflow (Actions › "Publicar site (GitHub Pages)"; também dá pra rodar à mão, `Run workflow`). Se algo der errado, volte o Source para "Deploy from a branch".

- **Página nova em pasta nova?** Acrescente a pasta em `PASTAS_DE_PAGINAS` no `pages.yml` — `tests/pages-workflow.test.js` falha se uma pasta com `.html` não estiver na lista (e se alguém puser `tests/`, `docs/`, `scripts/` ou `apps-script/` nela).
- **Fontes servidas pelo próprio site** (06/10/2026): Readex Pro e Roboto Mono em `assets/fonts/` (woff2 variáveis, subsets latin + latin-ext; licença OFL ao lado: `OFL-ReadexPro.txt`, `OFL-RobotoMono.txt`), `@font-face` com `font-display: swap` no topo de `assets/css/m3-tokens.css`, `<link rel="preload" … as="font" crossorigin>` dos subsets latin no `<head>` de cada HTML (fora do bloco gerado de `modulepreload`) e a CSP sem Google Fonts (`font-src 'self'`). O `sw.js` guarda fonte em cache-first (subiu para `v8`). Fonte nova/peso novo: baixe o woff2, ponha em `assets/fonts/`, declare o `@font-face` e ajuste `tests/csp-html.test.js` (`Fontes locais`).

## 10. Snapshot diário de preço (A-56, modo sombra) e tickers lidos da planilha

- **Tickers e 1ª data de transação saíram do código** (`Sync.gs`): `TICKERS_ACOES_BR`, `TICKERS_FIIS_BR`, `TICKERS_BR` e `TICKERS_USA` nascem vazias e são preenchidas por `carregarTickersDaPlanilha_` a partir de `Auxiliar_ativos` (Classe em A, Ticker em B), com cache de 10 min; `primeiraDataTransacao_` (menor data das 3 abas de Transações, cache de 6 h) e `dataInicioHistoricoIndices_` (1 dia antes dela) substituem a constante `22/12/2020` do `BackfillIndices.gs`. Ativo novo = linha nova em `Auxiliar_ativos` (a tela "Novo ativo" já faz isso). Para um papel incorporado/deslistado, tire a linha de `Auxiliar_ativos` ou ponha o ticker em `TICKERS_FORA_DO_HISTORICO`. Testes: `tests/harness/tickers-planilha.test.js` (dados inventados).
- **Snapshot de preço em paralelo** (`SnapshotPrecos.gs`): a Agenda ganhou a etapa `snapshotPrecos` (última da fila, depende de `ativos`, **não roda antes das 18:30 de SP** — a agenda espera por um one-shot às 18:30). Ela grava 1 linha por ativo/dia em `aux_snapshot-precos` (Data, Ticker, Classe, Moeda, Preço, Variação dia, Gravado em) lendo `Auxiliar_ativos` (1 `getValues` + 1 `setValues`). **A série atual (`aux_historico-patrimonio`) não muda.** Depois de 1–2 semanas, rode `compararSnapshotPrecos()` no editor: ela cruza cada (dia, ticker) com a série atual e escreve o resumo no Registro de Controle (totais, diferença por dia e os tickers que mais diferem) — com isso o Tiago decide se vale trocar a série pelo snapshot (dia 06 só tem par no dia 07: a série atual grava até "ontem"). Testes: `tests/harness/snapshot-precos.test.js` e `agenda-diaria.test.js` (A-56).

