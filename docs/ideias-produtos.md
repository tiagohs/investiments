# Ideias de produtos a partir do site — rascunho para aprofundar

> 06/10/2026. Material de partida, **sem detalhar demais**: o Tiago vai aprofundar. Base: o que o site já faz hoje (ver `docs/historico-projeto.md`, "Fase 02–06/10/2026", e `docs/guia-desenvolvimento.md`). As estimativas de esforço são ordens de grandeza (hipóteses), não orçamento. **Nada neste documento é aconselhamento jurídico**: pontos regulatórios e de licença precisam de validação com advogado e com os termos vigentes de cada fonte.

## 1. O que o site tem de valioso (ativos reaproveitáveis)

| Ativo | Por que vale | Onde está |
|---|---|---|
| **Cálculo puro e testado** (separado do DOM) | Funciona em qualquer backend/app; 1.400+ testes | `*-calc.js` (metas, patrimônio, simulador de dívidas, proventos, aportes, renda), `criterios/motor.js`, `analise-grafico.js` |
| **Metas** com vínculo a ativos, líquido de IR/IOF, marcos de milhão, viagem multi-destino multimoeda | Pouco comum em apps de gastos ou de carteira | `metas*.js`, `Metas.gs` |
| **Simulações de dívida**: SAC/Price, regra de prazo da Caixa, FGTS, FIES, amortizar × investir | Dor real de quem tem financiamento (CLT + FGTS) | `patrimonio-calc.js`, `simulador-dividas-calc.js` |
| **Importação de documentos no navegador** (faturas, extratos, holerites, IR, B3/IBKR), com conferência de soma | Privacidade (o PDF não sai do aparelho) e confiança (confere os números) | `gastos-import.js`, `holerite.js`, `patrimonio-import.js`, `lancamentos-parse.js` |
| **Análises por critérios** (base de critérios + motor + macro) e análise automática de gráficos | Explica "por quê", não só mostra número | `criterios/*`, `analise-grafico.js` |
| **Conferência** (proventos pagos × extrato B3, relatório de coerência das telas) | Confiança nos números = retenção | `proventos-calc.js`, `tests/harness/` |
| **Design system embrionário** (tokens claro/escuro, mobile first, PWA) | Base de marca | `shell.css`, `components` (a consolidar — A-66) |

**O que NÃO se reaproveita**: Google Apps Script como backend (cota de 90 min/dia de gatilhos, 6 min por execução, usuário único), a planilha como banco, `GOOGLEFINANCE`, a Agenda de 10:01, a leitura direta de pastas do Drive do Tiago, e as fontes de dado não licenciadas (ver seção 3).

## 2. Ideias de app

Cada ideia traz: público, problema, proposta, módulos reaproveitados, o que muda, receita, diferenciais, riscos e esforço relativo. **As duas mais promissoras estão marcadas com ★.**

### ★ 2.1 Planejador de Metas e Dívidas (nome de trabalho)

- **Público-alvo**: brasileiro CLT/PJ de renda média e alta, 25–45 anos, com **financiamento imobiliário e/ou FGTS**, que quer juntar para viagem, reserva e aposentadoria sem virar especialista em investimentos; comunidade FIRE/independência financeira.
- **Problema**: planilhas e apps de gastos não dizem "quanto falta, em quanto tempo, e o que acelera"; ninguém explica se vale **amortizar o financiamento ou investir** com a regra real de prazo do banco, nem o **líquido de IR** do que ele conseguiria resgatar.
- **Proposta**: o usuário cadastra metas (reserva, renda passiva, aposentadoria, viagem multi-destino em várias moedas, casa, carro, objetivos livres), informa o que já tem (corretoras, contas, FGTS, financiamento) e recebe: progresso, projeção, "o 1º milhão em tal ano", cenários (renda −10%/−20%), dicas para chegar em 75%/50% do tempo, simulador amortizar × investir (SAC/Price, FGTS no prazo) e um hero com "o que mais importa hoje".
- **Reaproveita**: `metas-calc.js`, `metas-graficos.js`, `metas-viagem.js`, `patrimonio-calc.js` (financiamento, FGTS, saque-aniversário), `simulador-dividas-calc.js`, `renda-calc.js`, `periodo-personalizado.js`, `analise-grafico.js`, tooltips/explicações, câmbio multimoeda (`aux_cambio`), tokens e shell. Quase tudo de **cálculo e UI** serve; muda só a camada de dados.
- **O que muda para ser multiusuário**: (a) saem as abas `aux_metas`/`aux_patrimonio` e entra um banco por usuário (ex.: PostgreSQL com isolamento por linha); (b) **entrada de dados sem planilha**: cadastro guiado + importação opcional de extrato B3 e de CSV/OFX, e, depois, **Open Finance** para saldos e investimentos; (c) autenticação própria (Google/Apple/e-mail + MFA), sessões curtas e token fora da URL; (d) **LGPD**: base legal e consentimento, política de privacidade, exportar/excluir dados, criptografia, encarregado/contato, registro de acesso; (e) corrigir antes as dívidas de cálculo do backlog (A-07 a A-14: alocação exclusiva das metas, financiamento sem data, saldo do mês).
- **Fontes de dado**: quase só **dados abertos e permitidos** — BCB (SGS: CDI, Selic, IPCA; PTAX; Focus), IBGE, Tesouro Transparente (preços e taxas do Tesouro Direto), CVM dados abertos. Cotação de ativos é **opcional** e pode vir atrasada (menor custo de licença). Isso é uma vantagem: não depende de Yahoo/Fundamentus/Google Finance.
- **Receita**: freemium — grátis com 1–2 metas e simulador básico; assinatura mensal/anual com metas ilimitadas, viagem multi-moeda, cenários, importações e exportação; **parcerias** de conteúdo educacional (sem comissão atrelada a produto, para não virar "recomendação paga"); versão para **casais/famílias** (metas compartilhadas) como plano superior.
- **Diferenciais**: líquido de IR/IOF e vencimento de títulos na meta; marcos de milhão; regra real de prazo da Caixa e FGTS; explicação de cada número ("por que 'atrasada'?"); viagem multi-destino em várias moedas.
- **Riscos/regulação**: baixo risco CVM se for **planejamento e simulação com premissas editáveis** (sem indicar produto, corretora ou ativo específico). Cuidado com: "sugestão de investimento por meta" (manter genérica — classes e prazos, não nomes de produtos); cálculos de IR/financiamento precisam de **aviso de "simulação"** e revisão periódica de regras (tabelas de IR, regras de bancos, FGTS). Concorrência de planilhas e apps de gastos — o foco é a profundidade em metas/dívidas.
- **Esforço relativo**: **M** — MVP em ~2–3 meses para 1–2 pessoas (reaproveita a maior parte do front; o trabalho é backend multiusuário, onboarding, LGPD e cadastro sem planilha).

### ★ 2.2 Organizador de Documentos e IR do Investidor (nome de trabalho)

- **Público-alvo**: pessoa física que investe em B3/exterior e declara IR (e quem usa contador mas junta documentos de última hora); autônomos/PJ com várias fontes.
- **Problema**: fatura, extrato, holerite, informe de rendimentos e notas espalhados; na hora do IR, ninguém sabe o que falta, o que bate e quanto foi gasto/recebido no ano; leitura manual de PDFs é cansativa.
- **Proposta**: um "checklist vivo" de documentos (mensais e ocasionais), importação **processada no aparelho** (PDF → lançamentos, com conferência "saldo anterior + lançamentos = total"), categorização de gastos com regras que aprendem, **renda pelo IR**, holerites e conta de "quanto invisto por mês", e um **dossiê do IR** (bens e direitos, proventos, rendimentos de renda fixa, ganhos de renda variável) pronto para conferir ou levar ao contador — **sem enviar a declaração**.
- **Reaproveita**: `organizacao-documentos.js`, `gastos-import.js`/`gastos-calc.js`, `holerite.js`, `patrimonio-import.js` (declaração do IR), `renda-calc.js`, `salario-calc.js`, `lancamentos-parse.js` (B3/IBKR), `proventos-calc.js` (conferência com extrato B3), gráficos de gastos e médias.
- **O que muda**: (a) trocar o Drive do Tiago por **armazenamento do próprio usuário** (upload local/criptografado ou integração opcional com o Drive *dele* via OAuth com escopo mínimo) — preferir **processar no navegador e guardar só o resultado**, o que reduz muito o risco de LGPD; (b) banco por usuário e auth; (c) parsers por banco/emissor viram **produto** (catálogo versionado, testes com amostras sintéticas, relatório de "não consegui ler"); (d) cuidado extra com **CPF, contas e holerites**: criptografia, retenção curta, exclusão a pedido, RIPD (relatório de impacto) e política clara de operadores/sub-operadores.
- **Fontes de dado**: os próprios documentos do usuário (sem licença de terceiros); tabelas de IR e cotações históricas pontuais podem vir de fontes abertas (Receita, BCB, CVM); preços de fechamento para custo/venda de ações exigem **dados licenciados** (ou o usuário informa/importa pela nota de corretagem e extrato B3).
- **Receita**: freemium sazonal (grátis até N documentos; **passe IR** anual (preço a validar); plano mensal para gastos recorrentes); parceria com contadores (painel do contador, B2B2C) como segundo canal.
- **Diferenciais**: privacidade (o PDF não sai do aparelho), **conferência de soma** que mostra o que não bateu em vez de esconder, checklist do que enviar, visão "ano fiscal".
- **Riscos/regulação**: o produto **organiza e confere**; não calcula nem transmite a declaração oficial (evitar prometer "declaração pronta"); parsers quebram quando o banco muda o layout (custo de manutenção contínuo — a auditoria já achou 14% dos arquivos com "soma não bate"); responsabilidade por erro de leitura → avisos e trilha de auditoria; LGPD é o ponto mais sensível.
- **Esforço relativo**: **M–G** — ~3–5 meses para MVP (a parte difícil é cobertura de parsers e a camada de privacidade, não a UI).

### 2.3 Painel de Patrimônio do Investidor (carteira + proventos + conferência B3)

- **Público-alvo**: investidor pessoa física de B3 (ações, FIIs, Tesouro, renda fixa) e de BDRs/EUA, que hoje usa planilha.
- **Problema**: acompanhar patrimônio, rentabilidade real (TWR/TIR vs. CDI/IPCA/Ibovespa), proventos e aportes em um lugar, sem digitar tudo.
- **Proposta**: painel com Início, Carteiras por classe, Detalhe do Ativo, Proventos (com "pago presumido" e **conferência com o extrato da B3**), carrinho de aportes e análises abaixo dos gráficos; importação de extratos e de movimentações.
- **Reaproveita**: praticamente **todo o front de Carteiras/Início/Ativo/Proventos/Transações**, `analise-grafico.js`, `proventos-calc.js`, `aportes*.js`, `carteiras-*.js`, `carrinho-*.js`, renda fixa (`BackfillRendaFixa`, IR/IOF).
- **O que muda**: **dados de mercado licenciados** (cotações, histórico, proventos, indicadores) — o ponto crítico e mais caro; **reconstrução diária do histórico no servidor** (hoje feita com `GOOGLEFINANCE` numa planilha — substituir por jobs e tabelas de séries); id estável para renda fixa (A-71) e aliases de tickers (A-14); multiusuário/LGPD/auth como acima; onboarding por importação (B3, e depois Open Finance).
- **Receita**: freemium (1 carteira, atualização atrasada) → assinatura (carteiras múltiplas, proventos, relatórios, tempo real); possível B2B (white-label para educadores/assessorias).
- **Diferenciais**: conferência de proventos e de coerência, rentabilidade correta (TWR) explicada, mobile first.
- **Riscos/regulação**: **mercado saturado** (agregadores e apps de carteira consolidados) — competir só com execução e nicho; **custo de dados** pode consumir a margem; sem recomendação personalizada de compra/venda, fica fora da regulação de consultoria. Dependência de fontes não oficiais (a auditoria mostrou 4 de 5 fontes de scraping já bloqueadas).
- **Esforço relativo**: **G** — ~5–8 meses (por causa de dados licenciados, jobs e importadores confiáveis).

### 2.4 Radar Educacional de Critérios (screener com explicação)

- **Público-alvo**: investidor iniciante/intermediário que quer **aprender a avaliar** ações e FIIs com critérios claros, não receber "compre/venda".
- **Problema**: análises prontas são opacas ou viram recomendação; o investidor não sabe quais critérios importam por setor/segmento.
- **Proposta**: "checklist de critérios" por ativo — indicadores (P/L, P/VP, DY, ROE, vacância, WALT…), faixas por setor/segmento, o que é bom/neutro/atenção **e por quê**, contexto macro (juros, bolsa cara/barata), e o usuário **monta seus próprios critérios** e pesos.
- **Reaproveita**: `criterios/motor.js`, `base-acoes.js`, `base-fiis.js`, `base-rentabilidade.js`, `macro.js`, card "Análise do ativo", Radar de oportunidades, `Fundamentos.gs` (contrato de fundamentos).
- **O que muda**: **reescrever a base de critérios com fontes próprias/abertas** (hoje ela se apoia em conteúdo de terceiros que o Tiago acompanha — copiar isso em produto é problema de direitos autorais e de atribuição); fundamentos e preços de **fontes licenciadas** ou de CVM dados abertos (DFP/ITR/FRE e informes de FII) com cálculo próprio de indicadores; infraestrutura de atualização diária; multiusuário.
- **Receita**: assinatura (screener avançado, critérios personalizados, alertas); conteúdo educacional.
- **Riscos/regulação**: **o mais exposto**. Recomendação de investimento e análise de valores mobiliários são atividades regulamentadas pela CVM (consultor e analista credenciados — ver as resoluções de consultoria e de análise de valores mobiliários, e **validar o enquadramento com advogado**). Posicionamento seguro: **ferramenta educacional/organização**, critérios **configuráveis e explicados**, sem "nota de compra", sem "preço-alvo" próprio, sem sugerir ativo específico para o perfil do usuário, com avisos claros e histórico de versões dos critérios; evitar linguagem de promessa de retorno. Dados de mercado licenciados e direitos sobre logos/marcas.
- **Esforço relativo**: **G** — ~4–6 meses para MVP **mais** tempo de assessoria jurídica; menor reaproveitamento de UI e maior de motor.

### 2.5 Painel do Planejador (B2B2C, variação das anteriores)

- **Público-alvo**: planejadores financeiros, educadores e contadores que atendem muitos clientes pessoa física.
- **Proposta**: o planejador acompanha metas, documentos e carteira dos clientes (com consentimento), com relatórios e alertas ("reserva abaixo do ideal", "documento faltando", "fatura não bate").
- **Reaproveita**: Metas, Documentos/Gastos, Simulações, Conferência; **muda**: papéis e permissões (planejador × cliente), trilha de consentimento, white-label, relatórios em PDF.
- **Receita**: assinatura por cliente ativo; **risco**: vender para quem presta serviço regulamentado exige cuidado com quem assume a responsabilidade do conselho; ciclo de venda B2B mais longo. **Esforço**: **G**, e só depois de 2.1 ou 2.2 maduros.

## 3. O que é igual em todas: requisitos para sair do uso pessoal

### 3.1 Arquitetura multiusuário
- **Banco por usuário** (isolamento por linha) no lugar da planilha: `aux_*` viram tabelas (metas, patrimônio, aportes, gastos, proventos, séries históricas); blocos JSON em célula (limite de ~49.000 caracteres) viram linhas.
- **Backend próprio** (serviço + jobs agendados + fila) no lugar do Apps Script e da Agenda; cálculo pesado (histórico, TWR, séries) em jobs; o front modular e os `*-calc.js` continuam (corrigindo antes o backlog de desempenho — A-31 a A-42 — porque a lógica de leitura "até a linha 10.800" some, mas o desenho de payload e cache continua válido).
- **Autenticação**: login social + e-mail com **MFA**, sessões curtas, tokens fora da URL, CSP, limite de taxa, auditoria de acesso (A-44).
- **Observabilidade e custo**: o Registro de Controle vira log estruturado (A-54); monitorar custo por usuário (dados de mercado são o maior item).

### 3.2 LGPD (Lei 13.709/2018) — pontos mínimos
Dados financeiros e documentos (holerite, IR, extratos) contêm dados pessoais de alto risco (CPF, renda, contas), embora não estejam na lista de "dados sensíveis" do art. 5º; ainda assim exigem: base legal clara (execução de contrato e consentimento granular para integrações), **minimização** (processar no navegador sempre que possível), **criptografia** em trânsito e em repouso, retenção curta, **exportar e excluir** a pedido, registro de operações, identificação de operadores e sub-operadores (nuvem), plano de resposta a incidentes, política de privacidade em linguagem simples e encarregado (DPO) ou canal equivalente. Para tratamento em escala, considerar o **relatório de impacto** (RIPD).

### 3.3 Fontes de dado: o que hoje não serve comercialmente

| Fonte atual | Problema para um produto | Alternativa a avaliar (checar licença e preço) |
|---|---|---|
| `GOOGLEFINANCE` (só dentro do Google Sheets) | Não é API; termos do Google não permitem redistribuir; não existe fora da planilha | Provedor com licença comercial; para B3, dados da própria B3 ou distribuidores autorizados |
| Yahoo Finance (gráfico e fundamentos) | API **não oficial**, uso pessoal, sem SLA, bloqueia IP de nuvem | Provedores de mercado com plano comercial (ex.: candidatos a avaliar: brapi, EODHD, Financial Modeling Prep, Polygon, Twelve Data, Tiingo) |
| Fundamentus, Funds Explorer e outros por scraping | Sem licença, bloqueiam robôs (já bloqueiam); direitos sobre a base | **CVM dados abertos** (DFP/ITR/FRE e informes de FII) + cálculo próprio de indicadores |
| FNet/B3 (informes e proventos) | Raspagem de portal; termos de uso | CVM dados abertos (informes mensais/trimestrais de FII) e/ou fornecedor licenciado de proventos |
| AwesomeAPI (câmbio) | Termos próprios; sem SLA | **PTAX do BCB** (aberto) |
| Google News RSS e RSS/feeds do YouTube | Termos e bloqueios; conteúdo de terceiros | Links curados, APIs oficiais com cota, ou remover do produto |
| Nominatim (mapa dos FIIs) | Política de uso do OSM limita volume | Geocoder comercial |
| FipeZap e outros índices proprietários | Podem exigir licença | Verificar termos ou usar IPCA/INCC (IBGE, aberto) |
| Logos de empresas e conteúdo de vídeos/teses de terceiros | Direitos de marca e autoral | Ícones próprios genéricos; critérios reescritos com fontes abertas e atribuição |
| **Fontes abertas e seguras**: BCB (SGS, PTAX, Focus), IBGE, Tesouro Transparente, CVM dados abertos | — | Citar a fonte e respeitar os termos de cada portal |

### 3.4 Regulação CVM: como posicionar
- **Posicionamento**: *ferramenta educacional e de organização/simulação*. O usuário informa premissas, o app **calcula e explica**; nada de "compre/venda", "preço-alvo" próprio, carteira recomendada ou comparação paga entre produtos.
- **Atenção**: a recomendação de investimento personalizada e a análise de valores mobiliários divulgada ao público são atividades **regulamentadas** (resoluções da CVM sobre **consultoria** e **análise** de valores mobiliários, e sobre **administração de carteiras**); exigem profissional/pessoa jurídica **autorizado**. Validar com advogado: o texto de cada tela, o escopo de "sugestões por meta", o uso de "nota" e "veredito" e as parcerias de comissão.
- **Boas práticas**: avisos claros ("não é recomendação"), critérios **públicos e versionados**, premissas **editáveis**, linguagem sem promessa de retorno, registro de data/versão dos dados, canal de contato e política de correção de erros.

### 3.5 Modelos de receita (hipóteses a testar)
Freemium com assinatura mensal/anual (recursos avançados, importações, histórico longo, multi-meta) · **passe sazonal do IR** · plano **família/casal** · **B2B2C** (planejadores, contadores, educadores, empresas com educação financeira para colaboradores) · **parcerias de conteúdo** sem comissão por produto (evita virar recomendação paga) · evitar publicidade de produtos financeiros (conflito de interesse e regulação).

## 4. Comparativo rápido

| Ideia | Dependência de dados licenciados | Risco regulatório | Reaproveitamento do código | Esforço (relativo) | Chance de nicho defensável |
|---|---|---|---|---|---|
| ★ 2.1 Planejador de Metas e Dívidas | **Baixa** (dados abertos) | **Baixo** | **Alto** (cálculo e UI) | M | Alta (financiamento + FGTS + líquido de IR + multimoeda) |
| ★ 2.2 Organizador de Documentos e IR | Baixa a média | Baixo (organiza e confere) | Alto (importadores) | M–G | Alta (dor sazonal clara, privacidade) |
| 2.3 Painel de Patrimônio | **Alta** | Baixo a médio | Muito alto (front) | G | Média (mercado saturado) |
| 2.4 Radar Educacional | Alta | **Alto** | Médio (motor e base de critérios) | G | Média (diferencial é a explicação) |
| 2.5 Painel do Planejador (B2B) | Depende | Médio | Médio | G | Média (venda B2B longa) |

**Recomendação para a conversa**: começar por **2.1** (valida disposição a pagar com o menor risco legal e de dados e o maior reaproveitamento) e, em paralelo, prototipar **2.2** com 3–5 emissores de documentos e um grupo pequeno de usuários reais; deixar **2.3** e **2.4** para depois, quando houver receita para pagar dados licenciados e assessoria jurídica. Antes de qualquer lançamento: concluir as Ondas 1 e 2 do backlog (`docs/auditoria-2026-10.md`) — cálculo correto e desempenho são pré-requisito de produto — e fazer um piloto fechado com 10–20 pessoas.

## 5. Próximos passos sugeridos (para o Tiago aprofundar)
1. Escolher 1–2 ideias e entrevistar 10 pessoas do público-alvo (dor, disposição a pagar, o que usam hoje).
2. Rodar um **protótipo de cadastro sem planilha** do Planejador (só metas + simulador) com dados de teste.
3. Levantar custo real de dados licenciados (cotações BR/EUA, proventos) com 2–3 fornecedores e verificar a licença de uso comercial por escrito.
4. Conversar com advogado de mercado de capitais e de proteção de dados antes de definir texto das telas, avisos e política de privacidade.
5. Definir a arquitetura-alvo (banco, jobs, auth) e quais `*-calc.js` viram pacote compartilhado, sem copiar código.
