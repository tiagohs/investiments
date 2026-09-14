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
 */

import {
  getDistribuicoesMetas,
  salvarMetaRendaPassiva as salvarMetaRendaPassivaApi,
  salvarMetaPatrimonio as salvarMetaPatrimonioApi,
  salvarMesesRendaEmergencial as salvarMesesRendaEmergencialApi,
  salvarObjetivosCarteira as salvarObjetivosCarteiraApi,
  salvarRadarItem as salvarRadarItemApi,
} from '../api-client.js';
import { formatBRL, formatNumeroBR, formatUSD } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { LOGOS_ATIVOS } from '../logos-ativos.js';

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
    if (title) div.title = title;
    const kEl = doc.createElement('div');
    kEl.className = 'k';
    kEl.textContent = k;
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
export function criarLinhaObjetivo(doc, { tipo, percentualDesejado, percentualAtual, carteiraAtual, valorInvestir, cor } = {}) {
  const linha = doc.createElement('div');
  linha.className = 'obj-linha';

  const corFinal = cor || corParaTipoObjetivo(tipo);
  const pctAtual = Math.max(0, Math.min(typeof percentualAtual === 'number' ? percentualAtual : 0, 1)) * 100;
  const pctMeta = Math.max(0, Math.min(typeof percentualDesejado === 'number' ? percentualDesejado : 0, 1)) * 100;
  // > 0.5 (meio real) em vez de > 0 pra não exibir "faltam R$ 0,01" por
  // causa de arredondamento de ponto flutuante vindo da planilha.
  const faltaInvestir = typeof valorInvestir === 'number' && valorInvestir > 0.5;

  linha.innerHTML = `
    <div class="obj-linha-head">
      <span class="obj-dot" style="background:${corFinal}"></span>
      <span class="obj-nome">${tipo || ''}</span>
      <span class="obj-pcts"><b></b><span class="obj-meta-pct"></span></span>
    </div>
    <div class="obj-barra">
      <div class="obj-barra-fill" style="width:${pctAtual.toFixed(1)}%; background:${corFinal}"></div>
      <div class="obj-barra-meta" style="left:${pctMeta.toFixed(1)}%"></div>
    </div>
    <div class="obj-linha-foot">
      <span class="obj-valor-atual"></span>
      <span class="goal-badge ${faltaInvestir ? 'warn' : 'good'}"></span>
    </div>
  `;

  linha.querySelector('.obj-pcts b').textContent = formatPercentualMeta(percentualAtual);
  linha.querySelector('.obj-meta-pct').textContent = `meta ${formatPercentualMeta(percentualDesejado)}`;
  linha.querySelector('.obj-barra').title = `Atual: ${formatPercentualPreciso(percentualAtual)} (${formatBRL(carteiraAtual)}) · Meta: ${formatPercentualPreciso(percentualDesejado)}`;
  linha.querySelector('.obj-barra-meta').title = `Meta: ${formatPercentualPreciso(percentualDesejado)}`;
  linha.querySelector('.obj-valor-atual').textContent = formatBRL(carteiraAtual);
  linha.querySelector('.goal-badge').textContent = faltaInvestir
    ? `faltam ${formatBRL(valorInvestir)}`
    : '✓ na meta';

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
      <span class="obj-total-k">Total investido</span><span class="obj-total-v"></span>
      ${faltaInvestir ? '<span class="obj-total-k">Pra atingir a meta</span><span class="obj-total-v obj-total-investir"></span>' : ''}
    `;
    const totalVEl = totalEl.querySelector('.obj-total-v');
    totalVEl.textContent = formatBRL(total.carteiraAtual);
    totalVEl.title = 'Soma da carteira atual de todos os tipos deste bloco.';
    if (faltaInvestir) {
      const investirEl = totalEl.querySelector('.obj-total-investir');
      investirEl.textContent = `+ ${formatBRL(total.valorInvestir)}`;
      investirEl.title = typeof total.novaCarteira === 'number'
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
 * Metadados das colunas da tabela do Radar de oportunidades — mesma
 * lista pras 3 tabelas, "tipo" (Tijolo/Papel/Híbrido) é só dos FIIs.
 * Preço médio, descontos P/VP e P/L, % de diferença e nova carteira NÃO
 * viram coluna — ficam no tooltip da célula do Ativo (ver tituloLinha_).
 */
const COLUNAS_RADAR = [
  { chave: 'ranking', rotulo: '#', editavel: true, numerica: true },
  { chave: 'ativo', rotulo: 'Ativo' },
  { chave: 'precoAtual', rotulo: 'Preço atual', numerica: true },
  { chave: 'precoTeto', rotulo: 'Preço-teto', editavel: true, numerica: true },
  { chave: 'vies', rotulo: 'Viés' },
  { chave: 'descontoPvp', rotulo: 'Desc. P/VP', numerica: true },
  { chave: 'descontoPl', rotulo: 'Desc. P/L', numerica: true },
  { chave: 'percentualDesejado', rotulo: '% desejado', editavel: true, numerica: true },
  { chave: 'percentualAtual', rotulo: '% atual', numerica: true },
  { chave: 'carteiraAtual', rotulo: 'Carteira atual', numerica: true },
  { chave: 'valorInvestir', rotulo: 'R$ investir/resgatar', numerica: true },
];
const COLUNA_TIPO_FII = { chave: 'tipo', rotulo: 'Tipo' };

function colunasRadarPara_(chaveTabela) {
  return chaveTabela === 'fiis' ? [...COLUNAS_RADAR, COLUNA_TIPO_FII] : COLUNAS_RADAR;
}

/** Preço atual/teto/médio de Ações Internacionais é em USD; o resto (carteira, R$ investir) já vem em BRL, igual às outras 2 tabelas. */
function formatarPrecoRadar_(valor, chaveTabela) {
  return chaveTabela === 'acoesInternacionais' ? formatUSD(valor) : formatBRL(valor);
}

function formatarCelulaRadar_(item, coluna, chaveTabela) {
  const v = item[coluna.chave];
  switch (coluna.chave) {
    case 'ranking':
      return typeof v === 'number' ? String(v) : '—';
    case 'precoAtual':
    case 'precoTeto':
      return formatarPrecoRadar_(v, chaveTabela);
    case 'percentualDesejado':
    case 'percentualAtual':
      return formatPercentualMeta(v);
    case 'carteiraAtual':
    case 'valorInvestir':
      return formatBRL(v);
    default:
      return v || v === 0 ? String(v) : '—';
  }
}

/** Tooltip da célula "Ativo": preço médio e % de diferença vs. meta (descontos e nova carteira agora têm seu próprio badge/ícone na linha). */
function tituloLinhaRadar_(item, chaveTabela) {
  const partes = [`Preço médio: ${formatarPrecoRadar_(item.precoMedio, chaveTabela)}`];
  if (typeof item.percentualDiferenca === 'number') partes.push(`Diferença vs. meta: ${formatPercentualPreciso(item.percentualDiferenca)}`);
  return partes.join('\n');
}

/**
 * "121% (1,21 P/VP)" -> "121%" — o texto antes do primeiro "(" (o
 * resumo curto que cabe numa coluna). `null`/"Indisponivel" (comum em
 * Desconto sobre P/L de Ações Internacionais/FIIs, que não têm P/L na
 * planilha) devolve null pra célula mostrar só "—", sem badge/tooltip.
 */
function resumoDesconto_(valor) {
  if (!valor || valor === 'Indisponivel') return null;
  const str = String(valor).trim();
  const idx = str.indexOf('(');
  return idx > -1 ? str.slice(0, idx).trim() : str;
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

  function esconder_() {
    tooltip.hidden = true;
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
    const alvo = typeof ev.target.closest === 'function' ? ev.target.closest('.radar-info-alvo') : null;
    if (!alvo) {
      esconder_();
      return;
    }
    mostrar_(alvo, ev.clientX, ev.clientY);
  }

  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', esconder_);
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
function criarLinhaRadar_(doc, item, chaveTabela, onSalvarItem) {
  const colunas = colunasRadarPara_(chaveTabela);
  const tr = doc.createElement('tr');
  tr.className = 'radar-linha';

  if (item.vies === 'Aguardar') tr.classList.add('radar-linha-aguardar');

  const celulas = {};
  for (const coluna of colunas) {
    const td = doc.createElement('td');
    if (coluna.numerica) td.classList.add('num');
    if (coluna.chave === 'vies') {
      td.appendChild(criarBadgeVies_(doc, item.vies));
    } else if (coluna.chave === 'ranking') {
      td.classList.add('radar-rank');
      const badge = doc.createElement('span');
      badge.className = 'radar-rank-badge';
      badge.textContent = formatarCelulaRadar_(item, coluna, chaveTabela);
      td.appendChild(badge);
    } else if (coluna.chave === 'precoTeto') {
      td.classList.add('radar-preco-teto');
      td.textContent = formatarCelulaRadar_(item, coluna, chaveTabela);
    } else if (coluna.chave === 'descontoPvp' || coluna.chave === 'descontoPl') {
      const resumo = resumoDesconto_(item[coluna.chave]);
      if (resumo) {
        const badge = doc.createElement('span');
        badge.className = 'radar-desconto-badge';
        badge.textContent = resumo;
        const detalheCompleto = String(item[coluna.chave]).trim();
        if (detalheCompleto !== resumo) {
          badge.classList.add('radar-info-alvo');
          badge.dataset.tooltip = detalheCompleto;
        }
        td.appendChild(badge);
      } else {
        td.textContent = '—';
      }
    } else if (coluna.chave === 'valorInvestir') {
      td.appendChild(doc.createTextNode(formatarCelulaRadar_(item, coluna, chaveTabela)));
      if (typeof item.novaCarteira === 'number') {
        const info = doc.createElement('span');
        info.className = 'radar-info-icon radar-info-alvo';
        info.textContent = 'i';
        info.dataset.tooltip = `Nova carteira: ${formatBRL(item.novaCarteira)}`;
        td.appendChild(info);
      }
    } else if (coluna.chave === 'ativo') {
      td.appendChild(criarLogoAtivo_(doc, item.ativo));
      td.appendChild(doc.createTextNode(formatarCelulaRadar_(item, coluna, chaveTabela)));
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
  editarBtn.className = 'radar-editar-btn';
  editarBtn.textContent = 'Editar';
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
      tr.replaceWith(criarLinhaRadar_(doc, item, chaveTabela, onSalvarItem));
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
function criarTabelaRadar_(doc, { chaveTabela, itens, onSalvarItem, ordenacao, onOrdenar }) {
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
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'radar-th-btn';
    btn.dataset.campo = coluna.chave;
    btn.textContent = coluna.rotulo;
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
    tbody.appendChild(criarLinhaRadar_(doc, item, chaveTabela, onSalvarItem));
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
 */
export function renderRadarOportunidades(doc, container, radar, { onSalvarItem } = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!radar) return;

  wirePointerTooltipRadar_(doc, container);

  let abaAtiva = 'acoesNacionais';
  let ordenacao = { campo: 'ranking', direcao: 'asc' };

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
    tableContainer.appendChild(criarTabelaRadar_(doc, {
      chaveTabela: abaAtiva,
      itens: bloco.itens,
      onSalvarItem,
      ordenacao,
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
      desenhar();
    });
    tabsEl.appendChild(btn);
  }

  container.append(tabsEl, tableContainer);
  desenhar();
}

/** Constrói e injeta os 3 cards de Metas da Carteira no container. */
export function renderMetasCarteira(doc, container, metas, { onSalvarRendaPassiva, onSalvarPatrimonio, onSalvarRendaEmergencial } = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!metas) return;

  const { rendaPassiva, patrimonio, rendaEmergencial } = metas;

  if (rendaPassiva) {
    container.appendChild(criarCardMeta(doc, {
      titulo: 'Renda Passiva',
      percentual: rendaPassiva.percentualAtingido,
      cor: 'var(--usa)',
      stats: [
        { k: 'Média últ. 12 meses', v: formatBRL(rendaPassiva.mediaUlt12Meses), title: 'Soma dos proventos recebidos nos últimos 12 meses fechados, dividida por 12.' },
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
} = {}) {
  const loadingEl = doc.getElementById('metasLoading');
  const erroEl = doc.getElementById('metasErro');
  const conteudoEl = doc.getElementById('metasConteudo');
  const objetivosContainer = doc.getElementById('objetivosCarteiraGrid');
  const radarContainer = doc.getElementById('radarOportunidadesGrid');
  const container = doc.getElementById('metasCarteiraGrid');
  const refreshControlEl = doc.getElementById('refreshControl');

  async function carregarERedesenhar() {
    const resposta = await getDistribuicoesMetasImpl(token);

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

  await carregarERedesenhar();

  // Botão "Atualizar dados" + timer automático (5 em 5 min) — reaproveita
  // carregarERedesenhar (busca de novo, só redesenha depois que os dados
  // chegam, sem mostrar skeleton de novo). marcarAtualizado() só registra
  // o horário da carga inicial que acabou de acontecer, sem buscar de novo.
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
