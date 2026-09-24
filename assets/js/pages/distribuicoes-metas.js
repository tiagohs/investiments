/**
 * distribuicoes-metas.js — página "Distribuições e Metas".
 *
 * 14/09/2026: primeira fatia construída foi só "Metas da Carteira" (3
 * cards: Renda Passiva, Patrimônio, Renda Emergencial). Segunda fatia
 * (mesmo dia) acrescenta "Objetivos da Carteira" (2 blocos com barras
 * meta-vs-atual: Ações/FIIs/Renda Fixa e, dentro de Renda Fixa, Renda
 * Emergencial x Renda Fixa de longo prazo) — os dois vêm juntos numa
 * chamada só a distribuicoesMetas (ver apps-script/DistribuicoesMetas.gs),
 * então usam o mesmo loading/erro compartilhado. A ordem de exibição na
 * página segue a ordem que o Tiago pediu: Objetivos → Radar de
 * oportunidades (Ações/EUA/FIIs).
 *
 * O anel de progresso (criarAnelProgresso) e o layout de card
 * (criarCardMeta) seguem o desenho já validado em docs/direcao-visual.html
 * ("Metas da carteira") — mesma estrutura visual, agora ligada a dado
 * real em vez de número ilustrativo.
 *
 * Cada card tem um campo (ou grupo de campos) editável, escrito de volta
 * na planilha de verdade via as 3 ações de escrita (salvarMetaRendaPassiva/
 * salvarMetaPatrimonio/salvarMesesRendaEmergencial) — nunca só em memória
 * local. Depois de uma escrita bem-sucedida, a página busca
 * distribuicoesMetas de novo e redesenha os 3 cards com o valor
 * atualizado (mesmo padrão "recarregar após escrever" descrito no plano).
 *
 * Renda Emergencial: "média de gastos" (K11) é só leitura aqui — vem de
 * 'Despesas Essenciais'!C25, uma fórmula, não um valor solto que dê pra
 * sobrescrever direto. O campo editável de verdade desse card é "meses"
 * (L11). O link/popup pra lista de Despesas Essenciais que o Tiago pediu
 * ainda não entrou nesta rodada — fica como próximo passo.
 *
 * 14/09/2026 (3ª fatia, mesmo dia): "% desejado" de cada tipo dentro dos
 * 2 blocos de Objetivos da Carteira também virou editável (botão "Editar
 * % desejado" em cada bloco, grava o bloco inteiro de uma vez via
 * salvarObjetivosCarteira — ver o handler em DistribuicoesMetas.gs pra
 * por que é o bloco inteiro e não uma linha por vez: a soma das linhas
 * precisa fechar 100%). Também nessa rodada: tooltips (title) nos
 * gadgets visuais que arredondam ou resumem um número — anel de
 * progresso, barra de Objetivos, alguns stats dos cards de Meta —
 * mostrando o valor exato ou a conta por trás, sem precisar abrir a
 * planilha pra conferir.
 *
 * 14/09/2026 (4ª fatia, mesmo dia): Radar de oportunidades — as 3
 * tabelas de ranking (Ações Nacionais/Internacionais/FIIs) que vêm em
 * resposta.radar (ver montarRadarOportunidades_ em DistribuicoesMetas.gs).
 * Trocadas por pill-buttons (.filter-tabs, mesma classe da Início — só
 * uma tabela visível por vez). Cabeçalho de cada coluna é clicável e
 * ordena a tabela (padrão de planilha: clique de novo alterna asc/desc);
 * "Ranking" é o default. Ranking, Preço-teto e "% desejado" são
 * editáveis por ticker (botão "Editar" na linha, grava só essa linha via
 * salvarRadarItem — diferente de Objetivos da Carteira, aqui não tem
 * soma que precise fechar 100%). Preço médio e % de diferença ficam num
 * tooltip na célula do Ativo. Ações Internacionais mostra preço atual/
 * teto em USD (formatUSD) — carteira atual e R$ investir continuam em
 * BRL, como o resto do app já agrega tudo.
 *
 * 14/09/2026 (rodada de feedback com prints do app de referência —
 * Suno — e da planilha real): Desconto sobre P/VP e Desconto sobre P/L
 * viraram colunas de verdade (antes só apareciam no tooltip do Ativo) —
 * célula mostra o resumo (ex.: "121%") num badge clicável/tocável, e o
 * texto completo da planilha (ex.: "121% (1,21 P/VP)") aparece na
 * tooltip ao tocar/passar o mouse — sem cor verde/vermelho automática
 * por enquanto (não dá pra inferir com segurança a partir só do texto
 * da célula qual regra o Tiago usa pra "bom"/"ruim" nesses 2 campos;
 * fica como próxima decisão, não uma adivinhação). R$ investir/resgatar
 * ganhou um ícone "i" ao lado com o detalhe de Nova carteira. Ranking
 * ganhou um badge numérico próprio, Preço-teto ficou em negrito, e a
 * linha inteira fica com fundo amarelo clarinho (--warn-soft) quando o
 * Viés é "Aguardar" — pra chamar atenção sem precisar ler a coluna.
 *
 * Tooltip do Ativo (e os novos badges/ícone) trocaram de `title` nativo
 * pra um tooltip por Pointer Events (mostrar/esconder em pointermove/
 * pointerdown/pointerleave), a mesma técnica que `wireTooltipAtivos` já
 * usa na Início (assets/js/pages/inicio.js) — `title` nativo não
 * aparece em navegador de celular (sem hover), que é onde o app
 * realmente é usado; ver wirePointerTooltipRadar_.
 *
 * 14/09/2026 (2ª rodada de feedback, mesmo dia): "Preço atual" ganha a
 * variação % do dia embaixo (verde/vermelho, igual Comprar/Aguardar) -
 * vem de `item.variacaoDia`, novo campo do backend (ver
 * enriquecerRadarComCarteira_ em DistribuicoesMetas.gs). "% desejado" e
 * "% atual" viram 1 coluna só ("% atual x meta") com uma barrinha
 * visual (mesma ideia de .obj-barra dos Objetivos da Carteira, versão
 * compacta pra caber na célula) em vez de 2 números crus lado a lado -
 * ainda editável (edita só o % desejado, igual antes). "Editar" virou
 * um ícone de lápis (sem texto). Ações Internacionais: Carteira atual
 * e R$ investir/resgatar SEMPRE foram valores em dólar na planilha,
 * mas a tela mostrava com "R$" na frente por engano - agora usam
 * formatUSD igual Preço atual/teto já usavam, com um ícone "i" do lado
 * mostrando o equivalente em reais (cotação do dólar do dia, também
 * nova - Distribuição e Metas!K56 - exibida acima da tabela). FIIs:
 * cada linha ganha um fundo bem suave conforme o Tipo (Tijolo/Híbrido/
 * Papel - "vamos testar", pedido do Tiago) - a cor de Aguardar (linha
 * inteira) sempre vence essa, nunca o contrário -, com uma legenda
 * acima da tabela (usa as 3 imagens que o Tiago organizou em
 * assets/imgs/fiis/) e o Segmento (ex. "Shopping") somado ao tooltip
 * do Ativo, formato "Segmento (Tipo)".
 *
 * 16/09/2026: Carteira atual e "R$ investir/resgatar" (Ações
 * Internacionais) — o "R$" era só engano de rótulo herdado de quando o
 * valor ainda não tinha equivalente à mostra; agora os 2 usam
 * formatarPrecoRadarComConversao_ (dólar primeiro, R$ entre parênteses
 * menor, direto no valor — ver format.js!formatComConversao), o ícone
 * "i" que escondia essa conversão saiu (o "i" de Nova carteira continua,
 * é outra informação). Coluna renomeada pra "Investir/resgatar" (o "R$"
 * do rótulo não fazia mais sentido com o valor em dólar). Tooltip por
 * Pointer Events (wirePointerTooltipRadar_) ganhou toque dedicado:
 * pointerType touch/pen agora alterna no pointerdown (2º toque no mesmo
 * alvo fecha) e ignora pointerleave (que o próprio fim do toque dispara,
 * fechando a tooltip quase no mesmo instante em que abria — bug relatado
 * pelo Tiago: "clico no i, o tooltip aparece e some"); fechar por toque
 * fora do alvo aberto é um novo listener em document/pointerdown
 * (captura). Mouse/hover continuam exatamente como antes.
 *
 * 16/09/2026 (mesmo dia, continuação): os stats dos cards de Meta
 * (criarCardMeta), a barra "% atual x meta" e o total de cada bloco de
 * Objetivos da Carteira (criarLinhaObjetivo/criarBlocoObjetivo, usado
 * também por renderSplitInterno) também usavam `title` nativo - viraram
 * .info-alvo com ícone "i" clicável, mesma técnica de toque/toque-fora
 * de cima só que num marcador genérico (wirePointerTooltipInfo_) em vez
 * do "radar-" prefixado, já que não têm nada a ver com a tabela do
 * Radar. Ficou de fora, de propósito: o `title`="Editar" do botão-lápis
 * do Radar (radar-editar-btn-icone) - isso é o rótulo acessível de um
 * botão de AÇÃO (já tem aria-label igual), não uma tooltip escondendo
 * dado; tocar nele já dispara "Editar" direto, sem precisar de um passo
 * a mais pra revelar nada.
 */

import {
  getDistribuicoesMetas,
  salvarMetaRendaPassiva as salvarMetaRendaPassivaApi,
  salvarMetaPatrimonio as salvarMetaPatrimonioApi,
  salvarMesesRendaEmergencial as salvarMesesRendaEmergencialApi,
  salvarObjetivosCarteira as salvarObjetivosCarteiraApi,
  salvarRadarItem as salvarRadarItemApi,
  salvarSplitInterno as salvarSplitInternoApi,
} from '../api-client.js';
import { formatBRL, formatNumeroBR, formatUSD, formatPercentFromFraction, formatComConversao } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { LOGOS_ATIVOS } from '../logos-ativos.js';
import { urlAtivoTicker } from '../link-ativo.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** "73%" a partir de uma fração (0.7377 -> "74%"). Não-finito vira "—". */
export function formatPercentualMeta(fracao) {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao)) return '—';
  return `${Math.round(fracao * 100)}%`;
}

/**
 * "73,77%" — mesma fração de formatPercentualMeta, mas com 2 casas. Só
 * pra tooltip/title: o texto visível sempre arredonda pro inteiro (mais
 * limpo numa barra/anel pequeno), mas quem passa o mouse/toca-segura
 * consegue ver o valor exato por trás do arredondamento.
 */
function formatPercentualPreciso(fracao) {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao)) return '—';
  return `${formatNumeroBR(fracao * 100, 2)}%`;
}

/**
 * Anel de progresso (SVG) — mesmo desenho de docs/direcao-visual.html:
 * 2 círculos concêntricos (trilho + progresso) + texto central. O anel
 * nunca ultrapassa visualmente 100% (uma meta batida em 130% não deve
 * "vazar" a volta toda de novo) mas o texto mostra o percentual real.
 */
export function criarAnelProgresso(doc, { percentual, cor }) {
  const bruto = typeof percentual === 'number' && Number.isFinite(percentual) ? percentual : 0;
  const clamped = Math.max(0, Math.min(bruto, 1));
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = clamped * c;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '132');
  svg.setAttribute('height', '132');
  svg.setAttribute('viewBox', '0 0 132 132');
  svg.classList.add('goal-ring');

  const g = doc.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', 'rotate(-90 66 66)');

  const trilho = doc.createElementNS(SVG_NS, 'circle');
  trilho.setAttribute('cx', '66');
  trilho.setAttribute('cy', '66');
  trilho.setAttribute('r', String(r));
  trilho.setAttribute('fill', 'none');
  trilho.setAttribute('stroke', 'var(--surface-3)');
  trilho.setAttribute('stroke-width', '14');

  const progresso = doc.createElementNS(SVG_NS, 'circle');
  progresso.setAttribute('cx', '66');
  progresso.setAttribute('cy', '66');
  progresso.setAttribute('r', String(r));
  progresso.setAttribute('fill', 'none');
  progresso.setAttribute('stroke', cor);
  progresso.setAttribute('stroke-width', '14');
  progresso.setAttribute('stroke-linecap', 'round');
  progresso.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${c.toFixed(1)}`);

  g.append(trilho, progresso);

  const textoGrande = doc.createElementNS(SVG_NS, 'text');
  textoGrande.setAttribute('x', '66');
  textoGrande.setAttribute('y', '63');
  textoGrande.setAttribute('text-anchor', 'middle');
  textoGrande.setAttribute('class', 'big');
  textoGrande.textContent = formatPercentualMeta(bruto);

  const textoPequeno = doc.createElementNS(SVG_NS, 'text');
  textoPequeno.setAttribute('x', '66');
  textoPequeno.setAttribute('y', '79');
  textoPequeno.setAttribute('text-anchor', 'middle');
  textoPequeno.setAttribute('class', 'small');
  textoPequeno.textContent = 'da meta';

  const tituloEl = doc.createElementNS(SVG_NS, 'title');
  tituloEl.textContent = `${formatPercentualPreciso(bruto)} da meta`;

  svg.append(tituloEl, g, textoGrande, textoPequeno);
  return svg;
}

/**
 * Monta um card de meta completo: título, badge opcional (ex. "atingida"),
 * anel, 2 estatísticas (k/v) e um formulário de edição (escondido até o
 * usuário clicar "Editar"). `campos` descreve os inputs do formulário:
 * [{ nome, rotulo, valor, tipo: 'reais'|'percentual'|'numero' }].
 * `onSalvar(valores)` é chamado com { [nome]: number } quando o usuário
 * confirma — quem chama decide o que fazer (POST + recarregar).
 */
export function criarCardMeta(doc, { titulo, badge, percentual, cor, stats, campos, onSalvar }) {
  const card = doc.createElement('div');
  card.className = 'goal-card';

  const head = doc.createElement('div');
  head.className = 'goal-card-head';
  const h3 = doc.createElement('h3');
  h3.textContent = titulo;
  head.appendChild(h3);
  if (badge) {
    const span = doc.createElement('span');
    span.className = `goal-badge ${badge.tipo === 'good' ? 'good' : 'warn'}`;
    span.textContent = badge.texto;
    head.appendChild(span);
  }
  card.appendChild(head);

  const donutWrap = doc.createElement('div');
  donutWrap.className = 'goal-donut-wrap';
  donutWrap.appendChild(criarAnelProgresso(doc, { percentual, cor }));
  card.appendChild(donutWrap);

  const statsEl = doc.createElement('div');
  statsEl.className = 'goal-stats';
  for (const { k, v, title } of stats) {
    const div = doc.createElement('div');
    const kEl = doc.createElement('div');
    kEl.className = 'k';
    kEl.textContent = k;
    // 16/09/2026: era `title` nativo (não aparece no toque, sem hover
    // no celular) - agora é .info-alvo com um ícone "i" clicável (ver
    // wirePointerTooltipInfo_), mesmo tratamento já dado ao Radar de
    // oportunidades.
    if (title) {
      div.classList.add('info-alvo');
      div.dataset.tooltip = title;
      const icone = doc.createElement('span');
      icone.className = 'info-icon';
      icone.textContent = 'i';
      kEl.appendChild(icone);
    }
    const vEl = doc.createElement('div');
    vEl.className = 'v';
    vEl.textContent = v;
    div.append(kEl, vEl);
    statsEl.appendChild(div);
  }
  card.appendChild(statsEl);

  if (campos && campos.length > 0) {
    const editarBtn = doc.createElement('button');
    editarBtn.type = 'button';
    editarBtn.className = 'goal-editar-btn';
    editarBtn.textContent = 'Editar';

    const form = doc.createElement('form');
    form.className = 'goal-edit-form';
    form.hidden = true;

    const inputs = {};
    for (const campo of campos) {
      const linha = doc.createElement('label');
      linha.className = 'goal-edit-field';
      const rotulo = doc.createElement('span');
      rotulo.textContent = campo.rotulo;
      const input = doc.createElement('input');
      input.type = 'number';
      input.step = campo.tipo === 'percentual' ? '0.01' : '0.01';
      input.name = campo.nome;
      input.value = campo.tipo === 'percentual'
        ? (typeof campo.valor === 'number' ? Math.round(campo.valor * 10000) / 100 : '')
        : campo.valor;
      inputs[campo.nome] = { input, tipo: campo.tipo };
      linha.append(rotulo, input);
      form.appendChild(linha);
    }

    const acoes = doc.createElement('div');
    acoes.className = 'goal-edit-acoes';
    const salvarBtn = doc.createElement('button');
    salvarBtn.type = 'submit';
    salvarBtn.textContent = 'Salvar';
    const cancelarBtn = doc.createElement('button');
    cancelarBtn.type = 'button';
    cancelarBtn.textContent = 'Cancelar';
    const statusEl = doc.createElement('span');
    statusEl.className = 'goal-edit-status';
    acoes.append(salvarBtn, cancelarBtn, statusEl);
    form.appendChild(acoes);

    editarBtn.addEventListener('click', () => {
      form.hidden = false;
      editarBtn.hidden = true;
    });
    cancelarBtn.addEventListener('click', () => {
      form.hidden = true;
      editarBtn.hidden = false;
      statusEl.textContent = '';
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const valores = {};
      for (const [nome, { input, tipo }] of Object.entries(inputs)) {
        // input.value é '' tanto pro campo vazio quanto pra texto que o
        // próprio <input type="number"> já rejeitou (ex. "abc") - Number('')
        // dá 0, não NaN, então sem essa checagem explícita um campo em
        // branco seria salvo silenciosamente como zero.
        if (input.value === '') {
          statusEl.textContent = `valor inválido em "${nome}"`;
          return;
        }
        const bruto = Number(input.value);
        if (Number.isNaN(bruto)) {
          statusEl.textContent = `valor inválido em "${nome}"`;
          return;
        }
        valores[nome] = tipo === 'percentual' ? bruto / 100 : bruto;
      }
      salvarBtn.disabled = true;
      statusEl.textContent = 'salvando…';
      try {
        await onSalvar(valores);
        statusEl.textContent = '';
      } catch (err) {
        statusEl.textContent = `erro ao salvar: ${err && err.message ? err.message : err}`;
      } finally {
        salvarBtn.disabled = false;
      }
    });

    card.append(editarBtn, form);
  }

  return card;
}

/**
 * Mapa fixo cor por tipo (mesmos tokens categóricos usados no resto do
 * app - ver PALETA_DISTRIB_FALLBACK em pages/inicio.js). "Renda
 * Emergencial" não tinha token próprio; usa --na (cinza neutro) porque
 * dentro do bloco de Renda Fixa ela representa "dinheiro parado, não é
 * pra crescer" - contraste de propósito com --rf (Renda Fixa de longo
 * prazo, essa sim investimento).
 */
const CORES_TIPO_OBJETIVO = {
  'Ações Nacionais e Internacionais': 'var(--acoes)',
  'FIIs': 'var(--fiis)',
  'Renda Fixa': 'var(--rf)',
  'Renda Emergencial': 'var(--na)',
};

function corParaTipoObjetivo(tipo) {
  return CORES_TIPO_OBJETIVO[tipo] || 'var(--na)';
}

/**
 * Uma linha "meta vs. atual" dentro de um bloco de Objetivos da
 * Carteira: barra horizontal preenchida até o % atual, com um traço
 * marcando o % desejado (dado real vem de montarObjetivosCarteira_ em
 * apps-script/DistribuicoesMetas.gs - já vem com os percentuais/valores
 * calculados pela planilha, nada é somado aqui). Quando o valor a
 * investir é essencialmente zero (já bateu ou passou da meta), mostra
 * "na meta" em vez de pedir mais aporte - overalocação não é tratada
 * como problema aqui, só quem está abaixo da meta precisa de aporte.
 */
export function criarLinhaObjetivo(doc, { tipo, percentualDesejado, percentualAtual, carteiraAtual, valorInvestir, carteiraAtualUsd, valorInvestirUsd, cor } = {}) {
  const linha = doc.createElement('div');
  linha.className = 'obj-linha';

  const corFinal = cor || corParaTipoObjetivo(tipo);
  const pctAtual = Math.max(0, Math.min(typeof percentualAtual === 'number' ? percentualAtual : 0, 1)) * 100;
  const pctMeta = Math.max(0, Math.min(typeof percentualDesejado === 'number' ? percentualDesejado : 0, 1)) * 100;
  // > 0.5 / < -0.5 (meio real) em vez de !== 0 pra não exibir "faltam
  // R$ 0,01" por causa de arredondamento de ponto flutuante vindo da
  // planilha. Negativo acontece nos splits que REDISTRIBUEM o que já
  // existe (ex.: FIIs Tijolo/Papel/Híbrido, "Redistribuir" na
  // planilha) em vez de só aportar mais (Objetivos da Carteira nunca
  // pede pra vender, só aportar, então nunca cai nesse ramo) - nesse
  // caso mostra "resgatar" em vez de "faltam".
  const faltaInvestir = typeof valorInvestir === 'number' && valorInvestir > 0.5;
  const precisaResgatar = typeof valorInvestir === 'number' && valorInvestir < -0.5;

  linha.innerHTML = `
    <div class="obj-linha-head">
      <span class="obj-dot" style="background:${corFinal}"></span>
      <span class="obj-nome">${tipo || ''}</span>
      <span class="obj-pcts info-alvo"><b></b><span class="obj-meta-pct"></span><span class="info-icon">i</span></span>
    </div>
    <div class="obj-barra">
      <div class="obj-barra-fill" style="width:${pctAtual.toFixed(1)}%; background:${corFinal}"></div>
      <div class="obj-barra-meta" style="left:${pctMeta.toFixed(1)}%"></div>
    </div>
    <div class="obj-linha-foot">
      <span class="obj-valor-atual"></span>
      <span class="goal-badge ${faltaInvestir || precisaResgatar ? 'warn' : 'good'}"></span>
    </div>
  `;

  linha.querySelector('.obj-pcts b').textContent = formatPercentualMeta(percentualAtual);
  linha.querySelector('.obj-meta-pct').textContent = `meta ${formatPercentualMeta(percentualDesejado)}`;
  // 16/09/2026: as 2 tooltips (title nativo, na barra e no traço da
  // meta) viraram 1 só, consolidada em .obj-pcts (mesmo padrão já usado
  // no Radar - ver criarCelulaPctAtualMeta_/wirePointerTooltipInfo_) -
  // clicável/tocável, não só hover.
  linha.querySelector('.obj-pcts').dataset.tooltip = `Atual: ${formatPercentualPreciso(percentualAtual)} (${formatBRL(carteiraAtual)}) · Meta: ${formatPercentualPreciso(percentualDesejado)}`;

  // 16/09/2026: "Ações Internacionais" (dentro de "Distribuição
  // desejada — Ações") ganha carteiraAtualUsd/valorInvestirUsd só nela
  // (ver linhaParaObjeto_ em DistribuicoesMetas.gs) - carteiraAtual/
  // valorInvestir (B:G) continuam em reais, sempre (precisam somar
  // certo com "Dividendos" no total do bloco) - só a EXIBIÇÃO desta
  // linha muda pra dólar primeiro, reais entre parênteses, quando o
  // dado em dólar existe. Sem esses campos (Dividendos, FIIs), cai no
  // formatBRL de sempre.
  const valorAtualEl = linha.querySelector('.obj-valor-atual');
  if (typeof carteiraAtualUsd === 'number') {
    valorAtualEl.innerHTML = formatComConversao(carteiraAtualUsd, carteiraAtual, formatUSD);
  } else {
    valorAtualEl.textContent = formatBRL(carteiraAtual);
  }

  const badgeEl = linha.querySelector('.goal-badge');
  if (faltaInvestir) {
    badgeEl.innerHTML = typeof valorInvestirUsd === 'number'
      ? `faltam ${formatComConversao(valorInvestirUsd, valorInvestir, formatUSD)}`
      : `faltam ${formatBRL(valorInvestir)}`;
  } else if (precisaResgatar) {
    const absUsd = typeof valorInvestirUsd === 'number' ? Math.abs(valorInvestirUsd) : undefined;
    badgeEl.innerHTML = typeof absUsd === 'number'
      ? `resgatar ${formatComConversao(absUsd, Math.abs(valorInvestir), formatUSD)}`
      : `resgatar ${formatBRL(Math.abs(valorInvestir))}`;
  } else {
    badgeEl.textContent = '✓ na meta';
  }

  return linha;
}

/**
 * Um bloco de Objetivos da Carteira (ex. "Ações, FIIs e Renda Fixa" ou
 * "Dentro da Renda Fixa") - título + uma linha por tipo + o total
 * (carteira atual e, se algum tipo estiver abaixo da meta, quanto
 * precisa entrar no total pra rebalancear).
 */
export function criarBlocoObjetivo(doc, { titulo, tipos, total, blocoId, onSalvarPercentuais } = {}) {
  const bloco = doc.createElement('div');
  bloco.className = 'obj-bloco';

  const h3 = doc.createElement('h3');
  h3.className = 'obj-bloco-titulo';
  h3.textContent = titulo || '';
  bloco.appendChild(h3);

  const linhas = doc.createElement('div');
  linhas.className = 'obj-linhas';
  for (const t of (tipos || [])) {
    linhas.appendChild(criarLinhaObjetivo(doc, t));
  }
  bloco.appendChild(linhas);

  if (total) {
    const faltaInvestir = typeof total.valorInvestir === 'number' && total.valorInvestir > 0.5;
    const totalEl = doc.createElement('div');
    totalEl.className = 'obj-total';
    totalEl.innerHTML = `
      <span class="obj-total-k info-alvo">Total investido<span class="info-icon">i</span></span><span class="obj-total-v"></span>
      ${faltaInvestir ? '<span class="obj-total-k info-alvo">Pra atingir a meta<span class="info-icon">i</span></span><span class="obj-total-v obj-total-investir"></span>' : ''}
    `;
    const totalKEls = totalEl.querySelectorAll('.obj-total-k');
    const totalVEl = totalEl.querySelector('.obj-total-v');
    totalVEl.textContent = formatBRL(total.carteiraAtual);
    // 16/09/2026: title nativo -> .info-alvo (ver criarCardMeta/
    // wirePointerTooltipInfo_ acima, mesmo motivo).
    totalKEls[0].dataset.tooltip = 'Soma da carteira atual de todos os tipos deste bloco.';
    if (faltaInvestir) {
      const investirEl = totalEl.querySelector('.obj-total-investir');
      investirEl.textContent = `+ ${formatBRL(total.valorInvestir)}`;
      totalKEls[1].dataset.tooltip = typeof total.novaCarteira === 'number'
        ? `Aporte novo pra deixar todos os tipos dentro (ou abaixo) da meta, mantendo a proporção desejada. Carteira projetada após o aporte: ${formatBRL(total.novaCarteira)}.`
        : 'Aporte novo pra deixar todos os tipos dentro (ou abaixo) da meta, mantendo a proporção desejada.';
    }
    bloco.appendChild(totalEl);
  }

  // Editar % desejado — grava o BLOCO INTEIRO de uma vez (nunca uma
  // linha isolada): a soma dos % desejados de um bloco precisa fechar
  // 100%, então editar uma linha sem ver as outras deixaria fácil
  // esquecer de ajustar o resto. Reaproveita as mesmas classes .goal-*
  // já validadas nos cards de Metas em vez de um padrão visual novo.
  if (tipos && tipos.length > 0 && blocoId && onSalvarPercentuais) {
    const editarBtn = doc.createElement('button');
    editarBtn.type = 'button';
    editarBtn.className = 'goal-editar-btn';
    editarBtn.textContent = 'Editar % desejado';

    const form = doc.createElement('form');
    form.className = 'goal-edit-form';
    form.hidden = true;

    const inputs = tipos.map((t) => {
      const campo = doc.createElement('label');
      campo.className = 'goal-edit-field';
      const rotulo = doc.createElement('span');
      rotulo.textContent = t.tipo;
      const input = doc.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.value = typeof t.percentualDesejado === 'number' ? Math.round(t.percentualDesejado * 10000) / 100 : '';
      campo.append(rotulo, input);
      form.appendChild(campo);
      return input;
    });

    const acoes = doc.createElement('div');
    acoes.className = 'goal-edit-acoes';
    const salvarBtn = doc.createElement('button');
    salvarBtn.type = 'submit';
    salvarBtn.textContent = 'Salvar';
    const cancelarBtn = doc.createElement('button');
    cancelarBtn.type = 'button';
    cancelarBtn.textContent = 'Cancelar';
    const statusEl = doc.createElement('span');
    statusEl.className = 'goal-edit-status';
    acoes.append(salvarBtn, cancelarBtn, statusEl);
    form.appendChild(acoes);

    editarBtn.addEventListener('click', () => {
      form.hidden = false;
      editarBtn.hidden = true;
    });
    cancelarBtn.addEventListener('click', () => {
      form.hidden = true;
      editarBtn.hidden = false;
      statusEl.textContent = '';
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const percentuais = [];
      for (const input of inputs) {
        // mesma checagem de criarCardMeta: input.value é '' tanto pro
        // campo vazio quanto pro texto que o <input type="number"> já
        // rejeitou sozinho, e Number('') dá 0, não NaN.
        if (input.value === '') {
          statusEl.textContent = 'preencha todos os percentuais';
          return;
        }
        const bruto = Number(input.value);
        if (Number.isNaN(bruto)) {
          statusEl.textContent = 'percentual inválido';
          return;
        }
        percentuais.push(bruto / 100);
      }
      const soma = percentuais.reduce((a, b) => a + b, 0);
      if (Math.abs(soma - 1) > 0.01) {
        statusEl.textContent = `os percentuais precisam somar 100% (soma atual: ${Math.round(soma * 100)}%)`;
        return;
      }
      salvarBtn.disabled = true;
      statusEl.textContent = 'salvando…';
      try {
        await onSalvarPercentuais(blocoId, percentuais);
        statusEl.textContent = '';
      } catch (err) {
        statusEl.textContent = `erro ao salvar: ${err && err.message ? err.message : err}`;
      } finally {
        salvarBtn.disabled = false;
      }
    });

    bloco.append(editarBtn, form);
  }

  return bloco;
}

/**
 * Renderiza a seção "Objetivos da carteira" inteira (2 blocos lado a
 * lado: alocacaoGeral - Ações/FIIs/Renda Fixa - e alocacaoRendaFixa -
 * Renda Emergencial x Renda Fixa de longo prazo, dentro do bloco de
 * Renda Fixa). Pedido original do Tiago: "queria que isso fosse mais
 * visual" (era uma tabela simples na planilha) - cada linha vira uma
 * barra de progresso em vez de só números numa tabela.
 */
export function renderObjetivosCarteira(doc, container, objetivos, { onSalvarPercentuais } = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!objetivos) return;

  wirePointerTooltipInfo_(doc, container);

  const grid = doc.createElement('div');
  grid.className = 'obj-grid';

  if (objetivos.alocacaoGeral) {
    grid.appendChild(criarBlocoObjetivo(doc, {
      titulo: 'Ações, FIIs e Renda Fixa',
      tipos: objetivos.alocacaoGeral.tipos,
      total: objetivos.alocacaoGeral.total,
      blocoId: 'geral',
      onSalvarPercentuais,
    }));
  }

  if (objetivos.alocacaoRendaFixa) {
    grid.appendChild(criarBlocoObjetivo(doc, {
      titulo: 'Dentro da Renda Fixa',
      tipos: objetivos.alocacaoRendaFixa.tipos,
      total: objetivos.alocacaoRendaFixa.total,
      blocoId: 'rendaFixa',
      onSalvarPercentuais,
    }));
  }

  container.appendChild(grid);
}

/**
 * Bloco de "distribuição desejada" que fica ACIMA da tabela do Radar
 * (pedido do Tiago, 14/09/2026, "coloque ela acima da tabela
 * principal... mostra a de ação quando eu clicar no botão de ação, e a
 * de fiis quando clicar na de fiis") - diferente de "Objetivos da
 * Carteira" lá em cima (aquele é o split ENTRE classes de ativo, este
 * é o split DENTRO de uma classe: Ações Nacionais x Internacionais, ou
 * Tijolo x Papel x Híbrido dentro de FIIs). Reaproveita o mesmo
 * componente visual (criarBlocoObjetivo) - mesma barra, mesmo "Editar %
 * desejado" - só muda o que aparece conforme a aba do Radar ativa:
 *   - "acoesNacionais"/"acoesInternacionais" -> bloco de Ações (cobre
 *     as 2 abas, já que a mesma tabela tem as 2 linhas) + os links da
 *     Suno específicos daquela aba (Dividendos+Valor na Nacional, só
 *     Internacional na outra).
 *   - "fiis" -> bloco de FIIs + link FIIs.
 * Os links ficam, na planilha real, logo antes do cabeçalho de cada
 * tabela do Radar - por isso a associação aba -> link segue a mesma
 * divisão.
 */
export function renderSplitInterno(doc, container, { splitsInternos, linksRecomendados, abaAtiva, onSalvarPercentuais } = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!splitsInternos) return;

  wirePointerTooltipInfo_(doc, container);

  const linksPorAba = {
    acoesNacionais: linksRecomendados
      ? [linksRecomendados.acoesDividendos, linksRecomendados.acoesValor].filter(Boolean)
      : [],
    acoesInternacionais: linksRecomendados && linksRecomendados.acoesInternacional
      ? [linksRecomendados.acoesInternacional]
      : [],
    fiis: linksRecomendados && linksRecomendados.fiis ? [linksRecomendados.fiis] : [],
  };

  const ehFiis = abaAtiva === 'fiis';
  const bloco = ehFiis ? splitsInternos.fiis : splitsInternos.acoes;
  if (bloco) {
    container.appendChild(criarBlocoObjetivo(doc, {
      titulo: ehFiis ? 'Distribuição desejada — FIIs' : 'Distribuição desejada — Ações',
      tipos: bloco.itens,
      total: bloco.total,
      blocoId: ehFiis ? 'fiis' : 'acoes',
      onSalvarPercentuais,
    }));
  }

  const links = linksPorAba[abaAtiva] || [];
  if (links.length > 0) {
    const linksEl = doc.createElement('div');
    linksEl.className = 'split-links';
    for (const l of links) {
      // .ext-link já existe em shell.css (link externo com iconezinho
      // de seta) - reaproveitado aqui em vez de inventar um estilo novo.
      const a = doc.createElement('a');
      a.className = 'ext-link split-link';
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg><span></span>';
      a.querySelector('span').textContent = l.texto;
      linksEl.appendChild(a);
    }
    container.appendChild(linksEl);
  }
}

/**
 * Metadados das colunas da tabela do Radar de oportunidades — mesma
 * lista pras 3 tabelas. Preço médio, descontos P/VP e P/L, % de
 * diferença e nova carteira NÃO viram coluna — ficam no tooltip da
 * célula do Ativo (ver tituloLinha_). O Tipo do FII (Tijolo/Híbrido/
 * Papel) também não é mais coluna própria (era só nos FIIs) — virou só
 * a cor da célula do Ativo + a legenda clicável acima da tabela
 * (pedido do Tiago, 14/09/2026, 4ª rodada de feedback: "pode remover a
 * coluna tipo... deixa só a cor").
 */
const COLUNAS_RADAR = [
  { chave: 'ranking', rotulo: '#', editavel: true, numerica: true },
  { chave: 'ativo', rotulo: 'Ativo' },
  { chave: 'precoAtual', rotulo: 'Preço atual', numerica: true },
  { chave: 'precoMedio', rotulo: 'Preço médio', numerica: true },
  { chave: 'precoTeto', rotulo: 'Preço-teto', editavel: true, numerica: true },
  { chave: 'vies', rotulo: 'Viés' },
  { chave: 'descontoPvp', rotulo: 'Desc. P/VP', numerica: true, dica: 'Com desconto quando o P/VP calculado (coluna H da planilha) é menor que 1 — está caro quando é maior ou igual a 1.' },
  { chave: 'descontoPl', rotulo: 'Desc. P/L', numerica: true, dica: 'Com desconto quando o retorno (1 ÷ P/L) fica abaixo da taxa de renda fixa atual — está caro quando fica acima. Calculado só pra Ações Nacionais.' },
  { chave: 'percentualDesejado', rotulo: '% atual x meta', editavel: true, numerica: true,
    dica: 'Barra mostra o % atual da carteira nesse ativo; o traço marca o % desejado (editável). Toque/passe o mouse pro valor exato de cada um.' },
  { chave: 'carteiraAtual', rotulo: 'Carteira atual', numerica: true, iconeDica: true,
    dica: 'Valor atual investido nesse ativo. Abaixo, em fonte menor, o quanto falta investir (ou resgatar) pra bater a meta.' },
];

function colunasRadarPara_() {
  return COLUNAS_RADAR;
}

/** Preço atual/teto/médio de Ações Internacionais é em USD; o resto (carteira, R$ investir) já vem em BRL, igual às outras 2 tabelas. */
function formatarPrecoRadar_(valor, chaveTabela) {
  return chaveTabela === 'acoesInternacionais' ? formatUSD(valor) : formatBRL(valor);
}

/**
 * Mesma ideia de formatarPrecoRadar_, mas devolve HTML (não texto puro)
 * com o equivalente em R$ entre parênteses, menor, quando a tabela é
 * Ações Internacionais E cotacaoDolar está disponível - pedido do Tiago
 * (16/09/2026): "mesmo tratamento em Radar de oportunidade... dólar e
 * reais entre parênteses", substituindo o ícone "i" que escondia essa
 * conversão antes (ver criarLinhaRadar_). Usar com innerHTML no
 * chamador, nunca com formatarPrecoRadar_ (que continua plain-text, só
 * pra tooltip - ver tituloLinhaRadar_). Sem cotacaoDolar, ou fora de
 * Ações Internacionais, cai em formatarPrecoRadar_ normal (sem
 * parênteses) - continua seguro passar como innerHTML mesmo assim, já
 * que "R$"/"US$" não têm caractere de HTML especial.
 */
function formatarPrecoRadarComConversao_(valor, chaveTabela, cotacaoDolar) {
  if (chaveTabela !== 'acoesInternacionais' || typeof cotacaoDolar !== 'number' || typeof valor !== 'number') {
    return formatarPrecoRadar_(valor, chaveTabela);
  }
  return formatComConversao(valor, valor * cotacaoDolar, formatUSD);
}

function formatarCelulaRadar_(item, coluna, chaveTabela) {
  const v = item[coluna.chave];
  switch (coluna.chave) {
    case 'ranking':
      return typeof v === 'number' ? String(v) : '—';
    case 'precoAtual':
    case 'precoTeto':
      return formatarPrecoRadar_(v, chaveTabela);
    case 'carteiraAtual':
      return formatarPrecoRadar_(v, chaveTabela);
    default:
      return v || v === 0 ? String(v) : '—';
  }
}

/** Tooltip da célula "Ativo": % de diferença vs. meta e, nos FIIs, Segmento/Tipo (preço médio virou coluna própria; descontos e nova carteira têm seu próprio badge/ícone na linha). */
function tituloLinhaRadar_(item, chaveTabela) {
  const partes = [];
  if (typeof item.percentualDiferenca === 'number') partes.push(`Diferença vs. meta: ${formatPercentualPreciso(item.percentualDiferenca)}`);
  if (chaveTabela === 'fiis' && item.segmento && item.tipo) partes.push(`${item.segmento} (${item.tipo})`);
  return partes.join('\n');
}

/**
 * "Tijolo"/"Híbrido"/"Papel" -> chave de classe CSS sem acento
 * ('tijolo'/'hibrido'/'papel') pra colorir o fundo da linha (pedido do
 * Tiago, "vamos testar" - cor suave por tipo de FII). `null` pra
 * qualquer texto que não bata com os 3 tipos conhecidos, em vez de
 * inventar uma cor pra tipo desconhecido.
 */
function chaveTipoFii_(tipo) {
  const normalizado = String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (normalizado === 'tijolo') return 'tijolo';
  if (normalizado === 'hibrido') return 'hibrido';
  if (normalizado === 'papel') return 'papel';
  return null;
}

/** Legenda de cor por tipo de FII (Tijolo/Híbrido/Papel), acima da tabela — usa as 3 imagens que o Tiago organizou em assets/imgs/fiis/. */
const LEGENDA_TIPO_FII = [
  { chave: 'tijolo', rotulo: 'Tijolo', imagem: 'assets/imgs/fiis/tijolo.webp' },
  { chave: 'hibrido', rotulo: 'Híbrido', imagem: 'assets/imgs/fiis/hibrido.jpg' },
  { chave: 'papel', rotulo: 'Papel', imagem: 'assets/imgs/fiis/papel.png' },
];
/**
 * Legenda de tipo de FII, agora clicável — funciona como filtro
 * (pedido do Tiago, 14/09/2026, 4ª rodada: "se eu clicar no botão lá
 * em cima... se eu seleciono tijolo, só mostra os tijolos"). Clicar de
 * novo no mesmo tipo desliga o filtro (mostra todos de novo); clicar
 * num tipo diferente troca. `filtroAtivo` marca (classe .active) qual
 * tipo está filtrando agora, se algum — quem desenha (renderRadarOportunidades)
 * é quem guarda esse estado, essa função só reflete o que recebe.
 */
function criarLegendaTipoFii_(doc, { filtroAtivo, onSelecionar } = {}) {
  const div = doc.createElement('div');
  div.className = 'radar-fii-legenda';
  for (const t of LEGENDA_TIPO_FII) {
    const item = doc.createElement('button');
    item.type = 'button';
    item.className = `radar-fii-legenda-item radar-fii-legenda-${t.chave}`;
    if (filtroAtivo === t.chave) item.classList.add('active');
    item.innerHTML = '<img src="" alt="" /><span></span>';
    item.querySelector('img').src = t.imagem;
    item.querySelector('span').textContent = t.rotulo;
    item.addEventListener('click', () => onSelecionar && onSelecionar(t.chave));
    div.appendChild(item);
  }
  return div;
}

/** Banner "Cotação do dólar hoje: R$ X,XX" acima da tabela de Ações Internacionais (pedido do Tiago — os valores da tabela são em dólar por padrão; isso dá o número pra quem quiser converter de cabeça). */
function criarBannerCotacaoDolar_(doc, cotacaoDolar) {
  const div = doc.createElement('div');
  div.className = 'radar-cotacao-dolar';
  div.innerHTML = `Cotação do dólar hoje: <b>${formatBRL(cotacaoDolar)}</b>`;
  return div;
}

/**
 * Barra "% atual x meta" — uma célula só em vez de 2 colunas de número
 * cru (pedido do Tiago: "pode ser uma coluna só... pode utilizar algo
 * visual, parecido com o slide da meta"). Mesma ideia visual de
 * .obj-barra (criarLinhaObjetivo, lá em cima) numa versão compacta que
 * cabe numa célula de tabela — barra preenchida até o % atual, traço
 * marcando o % desejado.
 */
function criarCelulaPctAtualMeta_(doc, item) {
  const wrap = doc.createElement('div');
  wrap.className = 'radar-pct-wrap radar-info-alvo';
  const pctAtual = Math.max(0, Math.min(typeof item.percentualAtual === 'number' ? item.percentualAtual : 0, 1)) * 100;
  const pctMeta = Math.max(0, Math.min(typeof item.percentualDesejado === 'number' ? item.percentualDesejado : 0, 1)) * 100;
  wrap.innerHTML = `
    <span class="radar-pct-label"><b></b><span class="radar-pct-meta-label"></span><span class="radar-info-icon">i</span></span>
    <div class="radar-pct-bar">
      <div class="radar-pct-bar-fill" style="width:${pctAtual.toFixed(1)}%"></div>
      <div class="radar-pct-bar-meta" style="left:${pctMeta.toFixed(1)}%"></div>
    </div>
  `;
  wrap.querySelector('.radar-pct-label b').textContent = formatPercentualMeta(item.percentualAtual);
  wrap.querySelector('.radar-pct-meta-label').textContent = `/ ${formatPercentualMeta(item.percentualDesejado)}`;
  wrap.dataset.tooltip = `Atual: ${formatPercentualPreciso(item.percentualAtual)} · Meta: ${formatPercentualPreciso(item.percentualDesejado)}`;
  return wrap;
}

/**
 * Veredito de "Desconto sobre P/VP"/"Desconto sobre P/L" — texto direto
 * (pedido do Tiago, 14/09/2026: "não quero só a porcentagem, quero Com
 * Desconto / Está caro") em vez do texto cru que a planilha devolve,
 * que é ambíguo: a MESMA fórmula usa "169% (1,69 P/VP)" tanto pra
 * dizer "desconto de 169%" (quando H<1) quanto "169% do valor
 * patrimonial" (quando H>=1, ou seja, ágio/caro) — só olhando o número
 * não dá pra saber qual dos 2 é sem also saber se H passa de 1. O
 * texto cru continua disponível no tooltip (dataset.tooltip).
 *
 *  - Desconto sobre P/VP: com desconto quando o P/VP calculado
 *    (`item.pvp`, coluna H da planilha) é MENOR que 1; caro quando é
 *    maior ou igual.
 *  - Desconto sobre P/L: só existe pra Ações Nacionais hoje (as
 *    outras 2 tabelas não têm P/L na planilha, `item.descontoPl` vem
 *    null/"Indisponivel" - null aqui). A regra pedida (1/P/L comparado
 *    com a taxa de renda fixa atual, célula I40) já vem calculada NO
 *    TEXTO que `montarRadarOportunidades_` devolve ("... 1,62% acima
 *    ..." ou "... 5,67% abaixo ..." da taxa) - em vez de refazer essa
 *    conta aqui (arriscando divergir da planilha por arredondamento
 *    ou por não ter a taxa disponível no front-end), só lê a palavra:
 *    "abaixo" da taxa = com desconto, "acima" = caro.
 */
function badgeDesconto_(chaveColuna, item) {
  const bruto = item[chaveColuna];
  if (!bruto || bruto === 'Indisponivel') return null;

  let comDesconto;
  if (chaveColuna === 'descontoPvp') {
    if (typeof item.pvp !== 'number') return null;
    comDesconto = item.pvp < 1;
  } else if (chaveColuna === 'descontoPl') {
    if (/abaixo/i.test(bruto)) comDesconto = true;
    else if (/acima/i.test(bruto)) comDesconto = false;
    else return null;
  } else {
    return null;
  }

  return {
    texto: comDesconto ? 'Com desconto' : 'Está caro',
    classe: comDesconto ? 'good' : 'bad',
    tooltip: String(bruto).trim(),
  };
}

/**
 * Tooltip por Pointer Events (funciona em mouse E toque, ao contrário de
 * `title` nativo — ver o comentário no topo do arquivo). Delegado no
 * `container` estável (radarOportunidadesGrid, nunca recriado — só o
 * conteúdo dentro dele é trocado a cada redesenho/troca de aba), pra
 * qualquer elemento marcado `.radar-info-alvo` com `dataset.tooltip`
 * preenchido: célula do Ativo, badges de desconto, ícone "i" de R$
 * investir. Guardado por `container._radarTooltipWired` pra nunca ligar
 * 2 vezes no mesmo container (ex.: depois de "Atualizar dados" chamar
 * renderRadarOportunidades de novo).
 */
function wirePointerTooltipRadar_(doc, container) {
  if (!container || container._radarTooltipWired) return;
  container._radarTooltipWired = true;

  const janela = doc.defaultView;
  const tooltip = doc.createElement('div');
  tooltip.className = 'radar-tooltip';
  tooltip.hidden = true;
  (doc.body || container).appendChild(tooltip);

  // alvoAberto: só usado no toque (touch/pen) - guarda qual .radar-info-alvo
  // está com a tooltip aberta por toque, pra 1) tocar de novo no mesmo alvo
  // fechar (alternar) e 2) o listener de "toque fora" (mais abaixo) saber o
  // que fechar. No mouse/hover fica sempre null (esconder_ cuida de tudo
  // via pointerleave, como sempre foi).
  let alvoAberto = null;

  function esconder_() {
    tooltip.hidden = true;
    alvoAberto = null;
  }

  function mostrar_(alvo, clientX, clientY) {
    const texto = alvo.dataset.tooltip;
    if (!texto) {
      esconder_();
      return;
    }
    tooltip.textContent = texto;
    tooltip.hidden = false;

    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let esquerda = clientX + 14;
    let topo = clientY + 14;
    if (esquerda + tw > larguraJanela - 12) esquerda = clientX - tw - 14;
    if (topo + th > alturaJanela - 12) topo = clientY - th - 14;
    tooltip.style.left = `${esquerda}px`;
    tooltip.style.top = `${topo}px`;
  }

  /**
   * pointerType 'touch'/'pen': pointerdown alterna (2º toque no mesmo
   * alvo fecha) em vez de só mostrar, e nunca fecha sozinho no
   * pointerleave - no toque, o fim do toque já dispara pointerleave (o
   * ponteiro "sai" da tela), o que fechava a tooltip quase no mesmo
   * instante em que abria ("aparece e some", relatado pelo Tiago
   * 16/09/2026, sobre os cards de Ativo no Radar em mobile). Fechar por
   * toque-fora é responsabilidade de aoTocarFora_ abaixo. Mouse/outros:
   * continua exatamente como antes (hover mostra, pointerleave esconde).
   */
  function aoMoverOuTocar_(ev) {
    const alvo = typeof ev.target.closest === 'function' ? ev.target.closest('.radar-info-alvo') : null;
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
      if (ev.type !== 'pointerdown' || !alvo) return;
      if (alvoAberto === alvo) {
        esconder_();
        return;
      }
      alvoAberto = alvo;
      mostrar_(alvo, ev.clientX, ev.clientY);
      return;
    }
    if (!alvo) {
      esconder_();
      return;
    }
    mostrar_(alvo, ev.clientX, ev.clientY);
  }

  function aoSairPonteiro_(ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return;
    esconder_();
  }

  /** Toque fora do alvo aberto (e fora da própria tooltip) fecha - "se eu
   * clico fora, o tooltip some" (pedido do Tiago, 16/09/2026). Alheio ao
   * toque (alvoAberto null) não faz nada, nunca interfere no mouse/hover. */
  function aoTocarFora_(ev) {
    if (!alvoAberto) return;
    const alvo = ev.target;
    if (tooltip.contains(alvo) || alvoAberto.contains(alvo)) return;
    esconder_();
  }

  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', aoSairPonteiro_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

/**
 * Mesma técnica/mesmo comportamento de wirePointerTooltipRadar_ logo
 * acima (touch/pen alterna no pointerdown, nunca fecha sozinho no
 * pointerleave, toque fora fecha) - versão genérica pro resto da
 * página (16/09/2026, seguimento do pedido "todos os lugares que
 * possuem um tooltip"): os stats dos cards de Meta (criarCardMeta), a
 * barra "% atual x meta" e o total de cada bloco de Objetivos da
 * Carteira (criarLinhaObjetivo/criarBlocoObjetivo) - esses ainda
 * usavam `title` nativo (não aparece no toque - sem hover no celular).
 * Marcador genérico ".info-alvo"/".info-icon"/".info-tooltip" (em vez
 * de reaproveitar o "radar-" prefixado de cima, que é só da tabela do
 * Radar) - chamada 1x por container em renderMetasCarteira/
 * renderObjetivosCarteira/renderSplitInterno, cada um guardado por
 * `container._infoTooltipWired` (mesmo motivo de sempre: não duplicar
 * ao redesenhar depois de salvar/trocar de aba).
 */
function wirePointerTooltipInfo_(doc, container) {
  if (!container || container._infoTooltipWired) return;
  container._infoTooltipWired = true;

  const janela = doc.defaultView;
  const tooltip = doc.createElement('div');
  tooltip.className = 'info-tooltip';
  tooltip.hidden = true;
  (doc.body || container).appendChild(tooltip);

  let alvoAberto = null;

  function esconder_() {
    tooltip.hidden = true;
    alvoAberto = null;
  }

  function mostrar_(alvo, clientX, clientY) {
    const texto = alvo.dataset.tooltip;
    if (!texto) {
      esconder_();
      return;
    }
    tooltip.textContent = texto;
    tooltip.hidden = false;

    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let esquerda = clientX + 14;
    let topo = clientY + 14;
    if (esquerda + tw > larguraJanela - 12) esquerda = clientX - tw - 14;
    if (topo + th > alturaJanela - 12) topo = clientY - th - 14;
    tooltip.style.left = `${esquerda}px`;
    tooltip.style.top = `${topo}px`;
  }

  function aoMoverOuTocar_(ev) {
    const alvo = typeof ev.target.closest === 'function' ? ev.target.closest('.info-alvo') : null;
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
      if (ev.type !== 'pointerdown' || !alvo) return;
      if (alvoAberto === alvo) {
        esconder_();
        return;
      }
      alvoAberto = alvo;
      mostrar_(alvo, ev.clientX, ev.clientY);
      return;
    }
    if (!alvo) {
      esconder_();
      return;
    }
    mostrar_(alvo, ev.clientX, ev.clientY);
  }

  function aoSairPonteiro_(ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return;
    esconder_();
  }

  function aoTocarFora_(ev) {
    if (!alvoAberto) return;
    const alvo = ev.target;
    if (tooltip.contains(alvo) || alvoAberto.contains(alvo)) return;
    esconder_();
  }

  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', aoSairPonteiro_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

/**
 * Logo redondo do ativo (LOGOS_ATIVOS, gerado por
 * scripts/gerar-logos-ativos.mjs a partir de assets/imgs/acoes|fiis/ que
 * o Tiago foi organizando) — quando não tem logo pra esse ticker, ou a
 * imagem falha ao carregar (`error`), cai num círculo com as 2 primeiras
 * letras do ticker, sem nunca quebrar a linha.
 */
function criarLogoAtivo_(doc, ticker) {
  const span = doc.createElement('span');
  span.className = 'radar-logo';
  const caminho = LOGOS_ATIVOS[ticker];
  if (!caminho) {
    span.classList.add('radar-logo-fallback');
    span.textContent = (ticker || '?').slice(0, 2).toUpperCase();
    return span;
  }
  const img = doc.createElement('img');
  img.src = caminho;
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    span.innerHTML = '';
    span.classList.add('radar-logo-fallback');
    span.textContent = (ticker || '?').slice(0, 2).toUpperCase();
  });
  span.appendChild(img);
  return span;
}

function criarBadgeVies_(doc, vies) {
  const span = doc.createElement('span');
  const tipo = vies === 'Comprar' ? 'good' : vies === 'Aguardar' ? 'warn' : '';
  span.className = tipo ? `goal-badge ${tipo}` : 'goal-badge';
  span.textContent = vies || '—';
  return span;
}

/**
 * Uma linha da tabela do Radar — 1 ticker. Sem onSalvarItem (ex.: uso
 * futuro só-leitura) não desenha o botão "Editar". "Editar" troca só as
 * 3 células editáveis (Ranking/Preço-teto/% desejado) por inputs, sem
 * recarregar nada; o "Salvar" grava só esse ticker (salvarRadarItem)
 * e quem chamou (montarPaginaDistribuicoesMetas) recarrega a página
 * inteira no sucesso — "Cancelar" só redesenha a linha a partir do
 * `item` original, mais simples que reverter célula por célula.
 */
function criarLinhaRadar_(doc, item, chaveTabela, onSalvarItem, cotacaoDolar) {
  const colunas = colunasRadarPara_(chaveTabela);
  const tr = doc.createElement('tr');
  tr.className = 'radar-linha';

  const celulas = {};
  for (const coluna of colunas) {
    const td = doc.createElement('td');
    if (coluna.numerica) td.classList.add('num');
    // data-label: só usado no card do mobile (ver o media query em
    // distribuicoes-metas.css) — a tabela em tela larga ignora isso
    // (o cabeçalho <th> já rotula a coluna). Ranking/Ativo viram o
    // "cabeçalho" do card (radar-card-topo) em vez de linha
    // label:valor - ver a classe aplicada logo abaixo.
    td.dataset.label = coluna.rotulo.replace(/\n/g, ' ');
    if (coluna.chave === 'ranking' || coluna.chave === 'ativo') {
      td.classList.add('radar-card-topo');
    }
    if (coluna.chave === 'vies') {
      td.appendChild(criarBadgeVies_(doc, item.vies));
    } else if (coluna.chave === 'ranking') {
      td.classList.add('radar-rank');
      const badge = doc.createElement('span');
      badge.className = 'radar-rank-badge';
      badge.textContent = formatarCelulaRadar_(item, coluna, chaveTabela);
      td.appendChild(badge);
    } else if (coluna.chave === 'precoAtual') {
      const wrap = doc.createElement('span');
      wrap.className = 'radar-preco-wrap';
      const valorPrecoAtual = doc.createElement('span');
      valorPrecoAtual.innerHTML = formatarPrecoRadarComConversao_(item.precoAtual, chaveTabela, cotacaoDolar);
      wrap.appendChild(valorPrecoAtual);
      if (typeof item.variacaoDia === 'number') {
        const variacao = doc.createElement('span');
        variacao.className = `radar-preco-variacao ${item.variacaoDia < 0 ? 'bad' : 'good'}`;
        variacao.textContent = formatPercentFromFraction(item.variacaoDia);
        wrap.appendChild(variacao);
      }
      td.appendChild(wrap);
    } else if (coluna.chave === 'precoMedio') {
      // Tag colorida (pedido do Tiago, 16/09/2026): verde quando a
      // cotação atual está acima do preço médio (lucro na posição),
      // vermelha quando está abaixo (prejuízo) - reaproveita o mesmo
      // badge visual usado nos descontos P/VP e P/L logo abaixo.
      const badge = doc.createElement('span');
      let classe = '';
      if (typeof item.precoAtual === 'number' && typeof item.precoMedio === 'number') {
        if (item.precoAtual > item.precoMedio) classe = 'good';
        else if (item.precoAtual < item.precoMedio) classe = 'bad';
      }
      badge.className = `radar-desconto-badge${classe ? ` ${classe}` : ''}`;
      badge.innerHTML = formatarPrecoRadarComConversao_(item.precoMedio, chaveTabela, cotacaoDolar);
      td.appendChild(badge);
    } else if (coluna.chave === 'precoTeto') {
      td.classList.add('radar-preco-teto');
      td.innerHTML = formatarPrecoRadarComConversao_(item.precoTeto, chaveTabela, cotacaoDolar);
    } else if (coluna.chave === 'percentualDesejado') {
      td.appendChild(criarCelulaPctAtualMeta_(doc, item));
    } else if (coluna.chave === 'carteiraAtual') {
      // 16/09/2026: Investir/resgatar (antes coluna própria) virou uma
      // 2ª linha aqui embaixo, em fonte menor - pra economizar espaço
      // (pedido do Tiago). O equivalente em R$ (Ações Internacionais)
      // aparece direto em cada valor, entre parênteses - antes ficava
      // escondido atrás de um ícone "i" que só revelava no toque/hover.
      const wrap = doc.createElement('span');
      wrap.className = 'radar-preco-wrap';
      const valorCarteira = doc.createElement('span');
      valorCarteira.innerHTML = formatarPrecoRadarComConversao_(item.carteiraAtual, chaveTabela, cotacaoDolar);
      wrap.appendChild(valorCarteira);
      const valorInvestir = doc.createElement('span');
      valorInvestir.className = 'radar-preco-variacao';
      valorInvestir.innerHTML = formatarPrecoRadarComConversao_(item.valorInvestir, chaveTabela, cotacaoDolar);
      if (typeof item.novaCarteira === 'number') {
        const info = doc.createElement('span');
        info.className = 'radar-info-icon radar-info-alvo';
        info.textContent = 'i';
        info.dataset.tooltip = `Nova carteira: ${formatarPrecoRadar_(item.novaCarteira, chaveTabela)}`;
        valorInvestir.appendChild(info);
      }
      wrap.appendChild(valorInvestir);
      td.appendChild(wrap);
    } else if (coluna.chave === 'descontoPvp' || coluna.chave === 'descontoPl') {
      const info = badgeDesconto_(coluna.chave, item);
      if (info) {
        const badge = doc.createElement('span');
        badge.className = `radar-desconto-badge ${info.classe} radar-info-alvo`;
        badge.textContent = info.texto;
        badge.dataset.tooltip = info.tooltip;
        td.appendChild(badge);
      } else {
        td.textContent = '—';
      }
    } else if (coluna.chave === 'ativo') {
      td.appendChild(criarLogoAtivo_(doc, item.ativo));
      // 25/09/2026: o ticker leva pra tela Detalhe do ativo
      const linkAtivo = doc.createElement('a');
      linkAtivo.className = 'link-ativo';
      linkAtivo.href = urlAtivoTicker(item.ativo);
      linkAtivo.textContent = formatarCelulaRadar_(item, coluna, chaveTabela);
      td.appendChild(linkAtivo);
      // Ícone "i" — a célula inteira já é .radar-info-alvo com tooltip
      // (diferença vs. meta, Segmento/Tipo nos FIIs), mas isso sozinho
      // não dava nenhuma pista visual de que dava pra
      // tocar/passar o mouse pra ver mais (pedido do Tiago, 14/09/2026,
      // 4ª rodada: "tudo que envolver tooltip, coloca o botão i").
      const infoAtivo = doc.createElement('span');
      infoAtivo.className = 'radar-info-icon';
      infoAtivo.textContent = 'i';
      td.appendChild(infoAtivo);
      // Cor por tipo de FII (pedido do Tiago, 14/09/2026): só na célula
      // do Ativo (desktop) - no card do mobile, essa mesma célula tem
      // .radar-card-topo, e o CSS (:has) espalha a cor pra área do
      // header inteira (Ranking + Ativo juntos), não só o texto do
      // ticker. Rodada anterior pintava a LINHA inteira - Tiago achou
      // feio, voltou atrás.
      if (chaveTabela === 'fiis') {
        const chaveTipo = chaveTipoFii_(item.tipo);
        if (chaveTipo) td.classList.add(`radar-fii-cor-${chaveTipo}`);
      }
    } else {
      td.textContent = formatarCelulaRadar_(item, coluna, chaveTabela);
    }
    if (coluna.chave === 'ativo') {
      td.classList.add('radar-info-alvo');
      td.dataset.tooltip = tituloLinhaRadar_(item, chaveTabela);
    }
    tr.appendChild(td);
    celulas[coluna.chave] = td;
  }

  const tdAcoes = doc.createElement('td');
  tdAcoes.className = 'radar-acoes';
  tr.appendChild(tdAcoes);

  if (!onSalvarItem) return tr;

  const editarBtn = doc.createElement('button');
  editarBtn.type = 'button';
  editarBtn.className = 'radar-editar-btn radar-editar-btn-icone';
  editarBtn.setAttribute('aria-label', 'Editar');
  editarBtn.title = 'Editar';
  editarBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  tdAcoes.appendChild(editarBtn);

  editarBtn.addEventListener('click', () => {
    tr.classList.add('radar-linha-editando');
    const camposEditaveis = colunas.filter((c) => c.editavel);
    const inputs = {};
    for (const coluna of camposEditaveis) {
      const td = celulas[coluna.chave];
      td.innerHTML = '';
      const input = doc.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.className = 'radar-edit-input';
      const valorAtual = item[coluna.chave];
      input.value = coluna.chave === 'percentualDesejado'
        ? (typeof valorAtual === 'number' ? Math.round(valorAtual * 10000) / 100 : '')
        : (typeof valorAtual === 'number' ? valorAtual : '');
      td.appendChild(input);
      inputs[coluna.chave] = input;
    }

    tdAcoes.innerHTML = '';
    const salvarBtn = doc.createElement('button');
    salvarBtn.type = 'button';
    salvarBtn.className = 'radar-salvar-btn';
    salvarBtn.textContent = 'Salvar';
    const cancelarBtn = doc.createElement('button');
    cancelarBtn.type = 'button';
    cancelarBtn.className = 'radar-cancelar-btn';
    cancelarBtn.textContent = 'Cancelar';
    const statusEl = doc.createElement('span');
    statusEl.className = 'radar-edit-status';
    tdAcoes.append(salvarBtn, cancelarBtn, statusEl);

    cancelarBtn.addEventListener('click', () => {
      tr.replaceWith(criarLinhaRadar_(doc, item, chaveTabela, onSalvarItem, cotacaoDolar));
    });

    salvarBtn.addEventListener('click', async () => {
      const valores = {};
      for (const [chave, input] of Object.entries(inputs)) {
        if (input.value === '') {
          statusEl.textContent = 'preencha todos os campos';
          return;
        }
        const bruto = Number(input.value);
        if (Number.isNaN(bruto)) {
          statusEl.textContent = 'valor inválido';
          return;
        }
        valores[chave] = chave === 'percentualDesejado' ? bruto / 100 : bruto;
      }
      salvarBtn.disabled = true;
      statusEl.textContent = 'salvando…';
      try {
        await onSalvarItem(chaveTabela, {
          linha: item.linha,
          ativo: item.ativo,
          ranking: valores.ranking,
          precoTeto: valores.precoTeto,
          percentualDesejado: valores.percentualDesejado,
        });
      } catch (err) {
        statusEl.textContent = `erro ao salvar: ${err && err.message ? err.message : err}`;
        salvarBtn.disabled = false;
      }
    });
  });

  return tr;
}

function compararRadar_(a, b, campo) {
  const va = a[campo];
  const vb = b[campo];
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR');
}

/**
 * A tabela de UMA das 3 classes do Radar — cabeçalho com botão por
 * coluna (clique ordena; clique de novo na mesma coluna alterna asc/
 * desc, igual autofiltro de planilha) + uma linha por ticker.
 * `ordenacao`/`onOrdenar` são geridos por quem chama (renderRadarOportunidades)
 * pra sobreviver a troca de aba sem perder o estado.
 */
function criarTabelaRadar_(doc, { chaveTabela, itens, onSalvarItem, ordenacao, onOrdenar, cotacaoDolar }) {
  const colunas = colunasRadarPara_(chaveTabela);
  const wrap = doc.createElement('div');
  wrap.className = 'radar-table-wrap';
  const table = doc.createElement('table');
  table.className = 'radar-table';

  const thead = doc.createElement('thead');
  const trHead = doc.createElement('tr');
  for (const coluna of colunas) {
    const th = doc.createElement('th');
    if (coluna.numerica) th.classList.add('num');
    if (coluna.dica) {
      th.classList.add('radar-info-alvo');
      th.dataset.tooltip = coluna.dica;
    }
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'radar-th-btn';
    btn.dataset.campo = coluna.chave;
    btn.textContent = coluna.rotulo;
    if (coluna.dica && coluna.iconeDica) {
      const info = doc.createElement('span');
      info.className = 'radar-info-icon';
      info.textContent = 'i';
      btn.appendChild(info);
    }
    if (ordenacao && ordenacao.campo === coluna.chave) {
      btn.classList.add('active');
      const seta = doc.createElement('span');
      seta.className = 'radar-sort-seta';
      seta.textContent = ordenacao.direcao === 'asc' ? '▲' : '▼';
      btn.appendChild(seta);
    }
    btn.addEventListener('click', () => onOrdenar && onOrdenar(coluna.chave));
    th.appendChild(btn);
    trHead.appendChild(th);
  }
  trHead.appendChild(doc.createElement('th'));
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = doc.createElement('tbody');
  const ordenados = [...(itens || [])];
  if (ordenacao) {
    ordenados.sort((a, b) => {
      const cmp = compararRadar_(a, b, ordenacao.campo);
      return ordenacao.direcao === 'asc' ? cmp : -cmp;
    });
  }
  for (const item of ordenados) {
    tbody.appendChild(criarLinhaRadar_(doc, item, chaveTabela, onSalvarItem, cotacaoDolar));
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

const TABELAS_RADAR = [
  { chave: 'acoesNacionais', rotulo: 'Ações Nacionais' },
  { chave: 'acoesInternacionais', rotulo: 'Ações Internacionais' },
  { chave: 'fiis', rotulo: 'FIIs' },
];

/**
 * Renderiza o Radar de oportunidades inteiro: pill-buttons (.filter-tabs,
 * mesma classe da Início) pra trocar entre as 3 tabelas — só uma visível
 * por vez — e a tabela ordenável da aba ativa, default Ranking/asc.
 * Trocar de aba ou de ordenação é só redesenho local (os dados das 3
 * tabelas já vieram juntos em `radar`, não busca nada de novo); só um
 * "Salvar" bem-sucedido aciona onSalvarItem, que recarrega a página
 * inteira (por isso aba/ordenação voltam ao default depois de salvar —
 * mesmo comportamento que o resto desta tela já tem ao recarregar).
 *
 * `onTrocarAba` (opcional) é chamado com a aba ativa toda vez que ela
 * muda (clique numa aba) e uma vez no desenho inicial - existe pra
 * quem chama poder sincronizar o bloco de "distribuição desejada"
 * (renderSplitInterno) que fica ACIMA desta tabela, já que ele mostra
 * conteúdo diferente conforme a aba do Radar ativa.
 */
export function renderRadarOportunidades(doc, container, radar, { onSalvarItem, onTrocarAba } = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!radar) return;

  wirePointerTooltipRadar_(doc, container);

  let abaAtiva = 'acoesNacionais';
  let ordenacao = { campo: 'ranking', direcao: 'asc' };
  // Filtro por Tipo de FII (Tijolo/Híbrido/Papel), ligado à legenda
  // clicável acima da tabela — null = mostra todos. Só existe pra
  // FIIs; resetado toda vez que a aba muda (ver o handler das
  // pill-buttons logo abaixo), pra não deixar um filtro escondido
  // aplicado quando o Tiago volta pra aba de FIIs depois.
  let filtroTipoFii = null;

  const tabsEl = doc.createElement('div');
  tabsEl.className = 'filter-tabs radar-tabs';
  const tableContainer = doc.createElement('div');

  function desenhar() {
    tabsEl.querySelectorAll('.filter-tab').forEach((b) => b.classList.toggle('active', b.dataset.tabela === abaAtiva));
    tableContainer.innerHTML = '';
    const bloco = radar[abaAtiva];
    if (!bloco || !bloco.itens || bloco.itens.length === 0) {
      const vazio = doc.createElement('p');
      vazio.className = 'hint';
      vazio.textContent = 'Nenhum ativo nesta tabela.';
      tableContainer.appendChild(vazio);
      return;
    }
    if (abaAtiva === 'acoesInternacionais' && typeof radar.cotacaoDolar === 'number') {
      tableContainer.appendChild(criarBannerCotacaoDolar_(doc, radar.cotacaoDolar));
    }
    let itensExibidos = bloco.itens;
    if (abaAtiva === 'fiis') {
      tableContainer.appendChild(criarLegendaTipoFii_(doc, {
        filtroAtivo: filtroTipoFii,
        onSelecionar: (chave) => {
          filtroTipoFii = filtroTipoFii === chave ? null : chave;
          desenhar();
        },
      }));
      if (filtroTipoFii) {
        itensExibidos = bloco.itens.filter((item) => chaveTipoFii_(item.tipo) === filtroTipoFii);
      }
    }
    if (itensExibidos.length === 0) {
      const vazioFiltro = doc.createElement('p');
      vazioFiltro.className = 'hint';
      vazioFiltro.textContent = 'Nenhum FII desse tipo.';
      tableContainer.appendChild(vazioFiltro);
      return;
    }
    tableContainer.appendChild(criarTabelaRadar_(doc, {
      chaveTabela: abaAtiva,
      itens: itensExibidos,
      onSalvarItem,
      ordenacao,
      cotacaoDolar: radar.cotacaoDolar,
      onOrdenar: (campo) => {
        ordenacao = ordenacao.campo === campo
          ? { campo, direcao: ordenacao.direcao === 'asc' ? 'desc' : 'asc' }
          : { campo, direcao: 'asc' };
        desenhar();
      },
    }));
  }

  for (const { chave, rotulo } of TABELAS_RADAR) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-tab';
    btn.dataset.tabela = chave;
    btn.textContent = rotulo;
    btn.addEventListener('click', () => {
      if (abaAtiva === chave) return;
      abaAtiva = chave;
      ordenacao = { campo: 'ranking', direcao: 'asc' };
      filtroTipoFii = null;
      desenhar();
      if (onTrocarAba) onTrocarAba(abaAtiva);
    });
    tabsEl.appendChild(btn);
  }

  container.append(tabsEl, tableContainer);
  desenhar();
  if (onTrocarAba) onTrocarAba(abaAtiva);
}

/** Constrói e injeta os 3 cards de Metas da Carteira no container. */

/** 25/09/2026: texto do "i" da média de Renda Passiva - com os meses exatos (mesma conta da tela Proventos). */
function textoMediaRendaPassiva_(meses) {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const rot = (am) => `${nomes[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`;
  const periodo = meses && meses.inicio && meses.fim ? ` (${rot(meses.inicio)} a ${rot(meses.fim)})` : '';
  return `Soma dos proventos de todas as carteiras (Ações, FIIs e Ações EUA em reais) nos últimos 12 meses fechados${periodo}, dividida por 12 - o mês atual ainda não entra. É a mesma "Média mensal" da tela Proventos em 12 meses.`;
}

export function renderMetasCarteira(doc, container, metas, { onSalvarRendaPassiva, onSalvarPatrimonio, onSalvarRendaEmergencial } = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!metas) return;

  wirePointerTooltipInfo_(doc, container);

  const { rendaPassiva, patrimonio, rendaEmergencial } = metas;

  if (rendaPassiva) {
    container.appendChild(criarCardMeta(doc, {
      titulo: 'Renda Passiva',
      percentual: rendaPassiva.percentualAtingido,
      cor: 'var(--usa)',
      stats: [
        { k: 'Média últ. 12 meses', v: formatBRL(rendaPassiva.mediaUlt12Meses), title: textoMediaRendaPassiva_(rendaPassiva.mesesMedia) },
        { k: 'Meta mensal', v: formatBRL(rendaPassiva.meta), title: 'Editável — quanto você quer receber de proventos por mês.' },
      ],
      campos: [{ nome: 'valor', rotulo: 'Meta mensal (R$)', valor: rendaPassiva.meta, tipo: 'reais' }],
      onSalvar: async (valores) => onSalvarRendaPassiva && onSalvarRendaPassiva(valores.valor),
    }));
  }

  if (patrimonio) {
    container.appendChild(criarCardMeta(doc, {
      titulo: 'Patrimônio',
      percentual: patrimonio.percentualAtingido,
      cor: 'var(--acoes)',
      stats: [
        { k: 'Carteira atual', v: formatBRL(patrimonio.carteiraAtual) },
        { k: 'Meta', v: formatBRL(patrimonio.meta), title: 'Calculada a partir do extra mensal, do % de reinvestimento e do rendimento médio anual informados abaixo, em "Editar".' },
      ],
      campos: [
        { nome: 'extra', rotulo: 'Extra mensal (R$)', valor: patrimonio.extra, tipo: 'reais' },
        { nome: 'percentualReinvestimento', rotulo: '% Reinvestimento', valor: patrimonio.percentualReinvestimento, tipo: 'percentual' },
        { nome: 'rendimentoMedio', rotulo: 'Rendimento médio anual', valor: patrimonio.rendimentoMedio, tipo: 'percentual' },
      ],
      onSalvar: async (valores) => onSalvarPatrimonio && onSalvarPatrimonio(valores),
    }));
  }

  if (rendaEmergencial) {
    container.appendChild(criarCardMeta(doc, {
      titulo: 'Renda Emergencial',
      badge: rendaEmergencial.atingida ? { tipo: 'good', texto: 'atingida' } : null,
      percentual: rendaEmergencial.percentualAtingido,
      cor: 'var(--fiis)',
      stats: [
        { k: 'Carteira atual', v: formatBRL(rendaEmergencial.carteiraAtual) },
        { k: 'Meta (c/ margem 10%)', v: formatBRL(rendaEmergencial.meta), title: 'Média de gastos essenciais × meses de reserva desejados × 1,10 (margem de segurança de 10%).' },
      ],
      campos: [{ nome: 'meses', rotulo: 'Meses de reserva desejados', valor: rendaEmergencial.meses, tipo: 'numero' }],
      onSalvar: async (valores) => onSalvarRendaEmergencial && onSalvarRendaEmergencial(valores.meses),
    }));
  }
}

/**
 * Banner de avisos (falha parcial de alguma seção) — mesmo padrão de
 * renderAvisos em pages/inicio.js (reaproveita a classe .avisos-banner
 * já validada em inicio.css). Hoje só existe uma seção ("metas"), mas o
 * handler já devolve `avisos` no mesmo formato { secao: erro } que o
 * Início usa, então vale já ligar isso em vez de engolir o erro em
 * silêncio quando montarMetasCarteira_ falhar no Apps Script.
 */
export function renderAvisos(container, avisos) {
  if (!container) return;
  if (!avisos || Object.keys(avisos).length === 0) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }
  container.innerHTML = `Algumas seções não carregaram agora: ${Object.entries(avisos)
    .map(([secao, erro]) => `<b>${secao}</b>: ${erro}`)
    .join(' · ')}`;
  container.hidden = false;
}

/**
 * Orquestrador real: busca action=distribuicoesMetas com o token, desenha
 * os 3 cards e liga os 3 formulários de edição às ações de escrita reais
 * — depois de cada salvamento bem-sucedido, busca tudo de novo e
 * redesenha (nunca só atualiza em memória local).
 */
export async function montarPaginaDistribuicoesMetas(token, {
  doc = document,
  getDistribuicoesMetasImpl = getDistribuicoesMetas,
  salvarMetaRendaPassivaImpl = salvarMetaRendaPassivaApi,
  salvarMetaPatrimonioImpl = salvarMetaPatrimonioApi,
  salvarMesesRendaEmergencialImpl = salvarMesesRendaEmergencialApi,
  salvarObjetivosCarteiraImpl = salvarObjetivosCarteiraApi,
  salvarRadarItemImpl = salvarRadarItemApi,
  salvarSplitInternoImpl = salvarSplitInternoApi,
} = {}) {
  const loadingEl = doc.getElementById('metasLoading');
  const erroEl = doc.getElementById('metasErro');
  const conteudoEl = doc.getElementById('metasConteudo');
  const objetivosContainer = doc.getElementById('objetivosCarteiraGrid');
  const splitInternoContainer = doc.getElementById('splitInternoGrid');
  const radarContainer = doc.getElementById('radarOportunidadesGrid');
  const container = doc.getElementById('metasCarteiraGrid');
  const refreshControlEl = doc.getElementById('refreshControlDistribuicoes');

  function desenharResposta(resposta) {
    if (loadingEl) loadingEl.hidden = true;

    if (!resposta.ok) {
      if (erroEl) {
        erroEl.hidden = false;
        erroEl.textContent = `Não deu pra carregar Distribuições e Metas agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
      }
      return;
    }

    if (conteudoEl) conteudoEl.hidden = false;

    renderAvisos(doc.getElementById('metasAvisos'), resposta.avisos);

    renderObjetivosCarteira(doc, objetivosContainer, resposta.objetivos, {
      onSalvarPercentuais: async (bloco, percentuais) => {
        const r = await salvarObjetivosCarteiraImpl(token, bloco, percentuais);
        if (!r.ok) throw new Error(r.erro || 'erro desconhecido');
        await carregarERedesenhar();
      },
    });

    renderRadarOportunidades(doc, radarContainer, resposta.radar, {
      onSalvarItem: async (tabela, item) => {
        const r = await salvarRadarItemImpl(token, tabela, item);
        if (!r.ok) throw new Error(r.erro || 'erro desconhecido');
        await carregarERedesenhar();
      },
      onTrocarAba: (abaAtiva) => {
        renderSplitInterno(doc, splitInternoContainer, {
          splitsInternos: resposta.splitsInternos,
          linksRecomendados: resposta.linksRecomendados,
          abaAtiva,
          onSalvarPercentuais: async (bloco, percentuais) => {
            const r = await salvarSplitInternoImpl(token, bloco, percentuais);
            if (!r.ok) throw new Error(r.erro || 'erro desconhecido');
            await carregarERedesenhar();
          },
        });
      },
    });

    renderMetasCarteira(doc, container, resposta.metas, {
      onSalvarRendaPassiva: async (valor) => {
        const r = await salvarMetaRendaPassivaImpl(token, valor);
        if (!r.ok) throw new Error(r.erro || 'erro desconhecido');
        await carregarERedesenhar();
      },
      onSalvarPatrimonio: async (campos) => {
        const r = await salvarMetaPatrimonioImpl(token, campos);
        if (!r.ok) throw new Error(r.erro || 'erro desconhecido');
        await carregarERedesenhar();
      },
      onSalvarRendaEmergencial: async (meses) => {
        const r = await salvarMesesRendaEmergencialImpl(token, meses);
        if (!r.ok) throw new Error(r.erro || 'erro desconhecido');
        await carregarERedesenhar();
      },
    });
  }

  // 25/09/2026 (Tiago: "demorando muito pra carregar"): desenha na hora com
  // a última resposta guardada (cache-dados.js, IndexedDB) e busca a nova por
  // trás; se a nova falhar, o que já está na tela fica (com o aviso de erro).
  async function carregarERedesenhar() {
    const resposta = await getDistribuicoesMetasImpl(token);
    if (resposta && resposta.ok) gravarCacheDados('distribuicoesMetas', resposta);
    desenharResposta(resposta);
  }

  const emCache = await lerCacheDados('distribuicoesMetas');
  if (emCache) {
    try { desenharResposta(emCache.dados); } catch (erro) { console.error('cache da página não desenhou', erro); }
  }

  await carregarERedesenhar();

  // Botão "Atualizar dados" + timer automático (5 em 5 min) — reaproveita
  // carregarERedesenhar (busca de novo, só redesenha depois que os dados
  // chegam, sem mostrar skeleton de novo). marcarAtualizado() só registra
  // o horário da carga inicial que acabou de acontecer, sem buscar de novo.
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
