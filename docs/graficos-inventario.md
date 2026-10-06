# Inventário de gráficos SVG (antes da biblioteca única)

Levantamento de 05/10/2026 (Onda 3, agente `o3-graficos`) de tudo que desenha gráfico no front, e para onde cada um vai na nova biblioteca `assets/js/charts/` + `assets/css/charts.css` (catálogo vivo em `docs/graficos-m3.html`).

Hoje existem **três famílias** de gráfico, todas feitas à mão, sem lib externa: (a) SVG por *template string* com `viewBox` fixo, (b) SVG via `createElementNS` e (c) "gráficos" em HTML/CSS (barras com `width:%`, `conic`/dasharray). Cada tela reimplementa escala, eixo, tooltip e cores. Problemas recorrentes: `preserveAspectRatio="none"` (texto distorcido em telas largas), tooltip diferente em cada página, sem teclado nem tabela alternativa na maioria, cores por tokens diferentes por página (`--acoes`, `--cat-1..7`, `--pt-*`, `--pf-c0..7`), sem animação.

## 1. Gráficos de linha / área

| # | Gráfico | Arquivo / função | Telas | Notas |
|---|---|---|---|---|
| L1 | Rentabilidade (principal + benchmarks, área opcional, hover) | `pages/inicio.js` `renderGraficoRentabilidade` (+ helpers `pathDe…`, hit-area ~L1194-1313) | Início, Carteiras (visão geral) | `viewBox` + `preserveAspectRatio="none"`; hit-area `<rect>` transparente; legenda externa |
| L2 | Evolução do patrimônio (patrimônio × investido tracejado, área 10%) | `pages/carteiras-visao-geral.js` `renderEvolucaoPatrimonio` | Carteiras - visão geral | Duplica L1 com 2 séries fixas |
| L3 | Evolução da classe (principal + investido) | `pages/carteiras-classe-comum.js` `renderEvolucaoClasseCarteiras` | Carteiras: Ações, FIIs, Ações EUA, Renda Fixa | Mesmo desenho de L2, cor por classe |
| L4 | Histórico do patrimônio (várias séries) | `pages/patrimonio-graficos.js` `graficoHistorico` | Organização - Patrimônio | Séries `SERIES_HISTORICO` |
| L5 | Projeção até o alvo (marcos, "chegou") | `pages/patrimonio-graficos.js` `graficoProjecao` | Organização - Patrimônio | Linha + marcos + alvo |
| L6 | Inflação / patrimônio real (várias linhas, tracejadas) | `pages/patrimonio-inflacao.js` `graficoInflacao` | Organização - Patrimônio (inflação) | `tabindex=0`, dica por ponto |
| L7 | Simulador de linhas (várias séries, rótulo final) | `pages/organizacao-simulador.js` `graficoLinhas` | Organização - Simulador / Simulações | Hit `<rect>` por coluna com tabindex |
| L8 | Histórico de custo de vida (área + linha) | `pages/organizacao.js` `htmlHistorico` | Organização (resumo) | Sem eixos completos |
| L9 | Projeção de salário (trajetória ritmo × meta) | `pages/organizacao-salario.js` `htmlProjecao` | Organização - Salário | 2 linhas |
| L10 | Salário × inflação (por contrato) | `pages/patrimonio-graficos.js` `graficoSalarios` | Organização - Patrimônio / Renda | |
| L11 | Salário anual (barras + polyline de inflação) | `pages/organizacao-renda.js` `graficoSalarioAnual` | Organização - Renda | Combina barras bruto/líquido + `polyline` (ver B6) |
| L12 | Preço × compras (linha, preço médio, pontos de compra, "hoje") | `pages/aportes-grafico.js` `renderGraficoCompras` | Lançamentos / Aportes | Pontos focáveis (`tabindex=0`) |
| L13 | Projeção de meta / histórico de meta / renda da meta | `pages/metas-graficos.js` `graficoProjecaoSvg`, `graficoHistoricoSvg`, `graficoRendaSvg`, `ligarTooltipGrafico` | Metas | Tooltip próprio (`ligarTooltipGrafico`) |
| L14 | Mini-linha intradiária (mercado) | `pages/inicio-intradia.js` `svgIntradia` (slot em `inicio-painel.js` `.mkt-spark`) | Início (painel de mercado) | Área em gradiente + linha, `vector-effect` |

## 2. Barras

| # | Gráfico | Arquivo / função | Telas | Notas |
|---|---|---|---|---|
| B1 | Proventos por mês, empilhadas por classe (2px de vão) | `pages/proventos.js` `renderHistoricoGrafico` | Proventos | Cores `--cat-1..7` |
| B2 | Rentabilidade mensal do ativo (barras + ponto de índice) | `pages/ativo.js` `mensalGraficoSvg` | Ativo | Topo arredondado por `Q` |
| B3 | Proventos por mês do ativo (24m) | `pages/ativo.js` `barrasProventosSvg` | Ativo | |
| B4 | Gasto por mês: cartão × conta | `pages/organizacao-gastos.js` `graficoEvolucao` | Organização - Gastos | Empilhadas, topo arredondado |
| B5 | Parcelas a pagar nos próximos meses | `pages/organizacao-gastos.js` (`gs-svg`, ~L180) | Organização - Gastos | |
| B6 | Salário bruto × líquido por mês | `pages/organizacao-renda.js` `graficoSalarioAnual` | Organização - Renda | Agrupadas + estimado/parcial hachurado |
| B7 | Barras divergentes (por quê) | `pages/patrimonio-graficos.js` `barrasDivergentes` | Organização - Patrimônio / Inflação | HTML (`.pt-barras`) |
| B8 | Composição do salário (barra única fatiada + legenda) | `pages/organizacao-salario.js` `barra(...)`/`leg(...)`; `organizacao.js` `.og-sal-barra` | Organização - Salário / resumo | HTML |
| B9 | Barras de composição/balanço | `css/patrimonio.css` `.pt-barra-bal`, `.pt-barra-trilho` | Organização - Patrimônio | HTML |
| B10 | Progresso (linear) | `css/components.css` `.progress-linear`; `css/organizacao.css` `.og-progresso`; `css/metas.css`; `distribuicoes-metas.css` `.radar-pct-bar-fill` | Várias (Metas, Organização, Distribuições) | HTML, `transition:width` |

## 3. Anéis (donut / progresso)

| # | Gráfico | Arquivo / função | Telas | Notas |
|---|---|---|---|---|
| A1 | Distribuição (donut com legenda) | `pages/inicio.js` `renderDistribuicao` | Início | `stroke-dasharray` por fatia, `viewBox 42` |
| A2 | Divisão do patrimônio do ativo | `pages/ativo-patrimonio.js` `donutHtml` | Ativo - Patrimônio | `.pf-c0..7` |
| A3 | Anel de progresso da meta | `pages/distribuicoes-metas.js` `criarAnelProgresso` (`createElementNS`) | Distribuições / Metas | Trilho + progresso + texto central |
| A4 | Anel da nota de análise | `pages/ativo.js` `anelNotaHtml` | Ativo (análise) | `.at-an-anel` |

## 4. Outros "gráficos"

| # | Item | Arquivo | Notas |
|---|---|---|---|
| O1 | Selo/ícone de tendência (setas ↑↓) | `pages/inicio.js` `arrowSvg`, `ativo.js` (ícones `bom/ruim/atencao/neutro`), `analise-grafico.js` (`bom/atencao/neutro`) | Ícones, não gráficos; viram `iconeSvg('sobe'|'desce'|'igual')` |
| O2 | Análise textual do gráfico | `analise-grafico.js` (`analisarSerie`, `htmlAnalise`) | Só cálculo + texto; **não mexer** (a biblioteca só desenha) |
| O3 | Ícones de meta | `metas-card.js` (`renda`, `escudo`, ...) | Ícones; fora do escopo |

`assets/css/componentes-grafico.css` guarda só a **análise do gráfico** (`.ag-*`) e o popover de filtro (`.fp-*`); não há regras de desenho de gráfico nele.

## Mapa "gráfico atual → componente novo" (para os agentes de página)

Importe de `assets/js/charts/index.js`; todo criador aceita `card: {...}` para vir dentro do card padrão e devolve `{ atualizar(dados), destruir() }`.

| Atual | Novo | Opções-chave |
|---|---|---|
| L1, L2, L3 (rentabilidade / evolução com comparativos) | `criarGraficoLinha` | `series:[{id,nome,valores,principal,pontilhada,area}]`, `eixoX`, `formatarY`, `formatarValor`, `card:{periodos,aoMudarPeriodo}` |
| L4 (histórico, várias séries empilháveis) | `criarGraficoArea` (`empilhado:true`) ou `criarGraficoLinha` | `empilhado`, `total`, `tons:'categorica'|'rampa'` |
| L5, L9, L13 (projeções) | `criarGraficoLinha` | série `pontilhada` para a trajetória futura; `zero`, `ticksY` |
| L6, L7, L10 (várias linhas) | `criarGraficoLinha` | `alternarSeries` (legenda liga/desliga) |
| L8 (custo de vida) | `criarGraficoLinha` (`area:true`) | |
| L11 | `criarGraficoBarras` (`modo:'agrupadas'`) + série de linha à parte | ou dois gráficos |
| L12 (preço × compras) | `criarGraficoLinha` | pontos de compra: `aoSelecionar` + série; "hoje" via `selecionar(i)` |
| L14, mini-linha do painel de mercado | `criarSparkline` (DOM) ou `sparklineHtml(valores,{...})` (string, para células de tabela) | `cor:'auto'` (verde/vermelho pela direção), `referencia`, `pontoFinal` |
| B1, B4, B5 (empilhadas) | `criarGraficoBarras` (`modo:'empilhadas'`) | rampa tonal por padrão; `tons:'categorica'` para classes |
| B2, B3 | `criarGraficoBarras` (`modo:'simples'`, `destaque`, `corPorSinal`) | |
| B6 | `criarGraficoBarras` (`modo:'agrupadas'`) | |
| B7 (divergentes) | `criarGraficoBarras` (`orientacao:'horizontal'`, `corPorSinal:true`) | |
| B8, B9 (barra única fatiada) | `criarBarraComposicao` | `fatias`, `legenda` |
| B10 (progresso linear) | `criarBarraProgresso` | `valor`, `meta` |
| faixas / mín-máx (novo) | `criarGraficoPilulas` | `base`, `modo:'pilulas'` |
| A1, A2 (donut) | `criarAnel` | `fatias`, `centro:{rotulo,valor}`, `legenda:'direita'|'baixo'` |
| A3, A4 (anel de progresso) | `criarAnelProgresso` | `valor`, `valor2` (anel duplo), `rotulo` |
| KPIs com contagem | `criarKpi` / `animarNumero` | `spark` opcional |
| Card (rótulo, valor, •••, período, estados) | `criarCardGrafico` ou a opção `card:{}` de qualquer criador | `definirEstado('carregando'|'vazio'|'erro')`, `recarregando(bool)` |

Regras para migrar: formatadores só de `format.js` (a biblioteca já usa); dado externo entra só por `textContent`; cores **só** por variável (`--chart-1…8`, `--chart-ramp-1…5`, `--chart-up/down`) - nunca hex; não passe `preserveAspectRatio="none"` (a biblioteca usa `viewBox` em pixels reais e redimensiona por `ResizeObserver`); a tabela acessível e o teclado já vêm de graça.
