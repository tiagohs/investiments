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
 * oportunidades (Ações/EUA/FIIs, ainda não construído) → Metas.
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
 */

import {
  getDistribuicoesMetas,
  salvarMetaRendaPassiva as salvarMetaRendaPassivaApi,
  salvarMetaPatrimonio as salvarMetaPatrimonioApi,
  salvarMesesRendaEmergencial as salvarMesesRendaEmergencialApi,
} from '../api-client.js';
import { formatBRL } from '../format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** "73%" a partir de uma fração (0.7377 -> "74%"). Não-finito vira "—". */
export function formatPercentualMeta(fracao) {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao)) return '—';
  return `${Math.round(fracao * 100)}%`;
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

  svg.append(g, textoGrande, textoPequeno);
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
  for (const { k, v } of stats) {
    const div = doc.createElement('div');
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
  linha.querySelector('.obj-barra-meta').title = `meta: ${formatPercentualMeta(percentualDesejado)}`;
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
export function criarBlocoObjetivo(doc, { titulo, tipos, total } = {}) {
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
    totalEl.querySelector('.obj-total-v').textContent = formatBRL(total.carteiraAtual);
    if (faltaInvestir) {
      totalEl.querySelector('.obj-total-investir').textContent = `+ ${formatBRL(total.valorInvestir)}`;
    }
    bloco.appendChild(totalEl);
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
export function renderObjetivosCarteira(doc, container, objetivos) {
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
    }));
  }

  if (objetivos.alocacaoRendaFixa) {
    grid.appendChild(criarBlocoObjetivo(doc, {
      titulo: 'Dentro da Renda Fixa',
      tipos: objetivos.alocacaoRendaFixa.tipos,
      total: objetivos.alocacaoRendaFixa.total,
    }));
  }

  container.appendChild(grid);
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
        { k: 'Média últ. 12 meses', v: formatBRL(rendaPassiva.mediaUlt12Meses) },
        { k: 'Meta mensal', v: formatBRL(rendaPassiva.meta) },
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
        { k: 'Meta', v: formatBRL(patrimonio.meta) },
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
        { k: 'Meta (c/ margem 10%)', v: formatBRL(rendaEmergencial.meta) },
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
} = {}) {
  const loadingEl = doc.getElementById('metasLoading');
  const erroEl = doc.getElementById('metasErro');
  const conteudoEl = doc.getElementById('metasConteudo');
  const objetivosContainer = doc.getElementById('objetivosCarteiraGrid');
  const container = doc.getElementById('metasCarteiraGrid');

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

    renderObjetivosCarteira(doc, objetivosContainer, resposta.objetivos);

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
}
