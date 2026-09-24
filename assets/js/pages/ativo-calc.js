/**
 * ativo-calc.js - contas puras da tela Detalhe do ativo (ativo/index.html).
 * Sem DOM: entra a resposta de action=ativo (apps-script/Ativo.gs) e sai
 * número pronto pra desenhar - testado em tests/ativo-calc.test.js.
 *
 * O gráfico de rentabilidade e o de "Valor aplicado x Saldo" usam o MESMO
 * motor das Carteiras (inicio.js/carteiras-classe-comum.js): aqui só se monta
 * um histórico diário no mesmo formato, com os campos da visão do ativo
 * (ver VISAO_POR_CLASSE_ATIVO e os mapas CAMPO_*_POR_VISAO em inicio.js):
 *   ativo              - saldo do ativo no dia, em reais
 *   fluxoCaixaAtivo    - fluxo do dia pro TWR: compra +, venda - (valor
 *                        recebido), provento - (conta como ganho) - mesma
 *                        convenção de FluxoCaixaInicio.gs
 *   fluxoAplicadoAtivo - "Valor aplicado": compra + custo, venda - CUSTO da
 *                        parte vendida (custo médio na renda variável, PEPS
 *                        na renda fixa), provento nunca entra
 *   proventosAtivo     - proventos recebidos no dia, em reais
 *   indiceCdi/indiceIpca/ibovespa/ifix/sp500 - índices do dia (os da Início)
 */

import { normalizarSerieRentabilidade } from './inicio.js';

export const CLASSES_ATIVO = {
  acoes: { label: 'Ação', labelPlural: 'Ações', token: '--acoes', soft: '--acoes-soft', visao: 'ativoAcoes', pagina: 'acoes', indice: { campo: 'ibovespa', label: 'Ibovespa' } },
  fiis: { label: 'FII', labelPlural: 'FIIs', token: '--fiis', soft: '--fiis-soft', visao: 'ativoFiis', pagina: 'fiis', indice: { campo: 'ifix', label: 'IFIX' } },
  acoesEua: { label: 'Ação EUA', labelPlural: 'Ações Internacionais', token: '--usa', soft: '--usa-soft', visao: 'ativoAcoesEua', pagina: 'acoes-eua', indice: { campo: 'sp500', label: 'S&P 500' } },
  rendaFixa: { label: 'Renda fixa', labelPlural: 'Renda Fixa', token: '--rf', soft: '--rf-soft', visao: 'ativoRendaFixa', pagina: 'renda-fixa', indice: { campo: 'indiceIpca', label: 'IPCA' } },
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r2 = (v) => Math.round(v * 100) / 100;

/** Valor de hoje do ativo em reais (ações EUA: US$ x câmbio mais recente). */
export function valorAtualBrl(resposta) {
  const a = resposta && resposta.ativo;
  if (!a || num(a.totalAtualizado) == null) return null;
  if (resposta.moeda !== 'USD') return a.totalAtualizado;
  const cambio = cambioMaisRecente(resposta);
  return cambio ? a.totalAtualizado * cambio : null;
}

/** Último câmbio do dólar conhecido (índices da Início, senão a série do ativo). */
export function cambioMaisRecente(resposta) {
  const indices = (resposta && resposta.indices) || [];
  for (let i = indices.length - 1; i >= 0; i -= 1) if (num(indices[i].cambioUsd)) return indices[i].cambioUsd;
  const serie = (resposta && resposta.serie) || [];
  for (let i = serie.length - 1; i >= 0; i -= 1) if (num(serie[i].cambio)) return serie[i].cambio;
  return null;
}

/** Tipo de movimentação da renda fixa -> 'compra' | 'venda' | 'juros' | 'transfEntrada' | 'transfSaida' | null. */
export function tipoMovimentacaoRf(t) {
  const mov = String(t.tipo || '');
  if (mov === 'Compra' || mov === 'APLICAÇÃO') return 'compra';
  if (mov === 'Venda' || mov === 'Resgate') return 'venda';
  if (/^juros/i.test(mov) || /cupom/i.test(mov)) return 'juros';
  if (/^transf/i.test(mov)) return /^credit/i.test(String(t.entradaSaida || '')) ? 'transfEntrada' : 'transfSaida';
  return null;
}

/**
 * Eventos de caixa do ativo em reais, em ordem de data: [{ data, caixa,
 * aplicado, provento, qtd }] - `qtd` é a variação de quantidade (só renda
 * variável). Venda que deixa menos de 2% da quantidade fecha a posição
 * inteira (mesma regra de FluxoCaixaInicio.gs).
 */
export function eventosDoAtivo(resposta) {
  const eventos = [];
  const ehRf = resposta.tipo === 'rf';
  const fracaoVendida = (antes, vendida) => {
    if (!(antes > 0)) return 1;
    return (antes - vendida) / antes < 0.02 ? 1 : Math.min(1, vendida / antes);
  };
  const transacoes = [...(resposta.transacoes || [])].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  if (ehRf) {
    const lotes = []; // PEPS
    transacoes.forEach((t) => {
      const tipo = tipoMovimentacaoRf(t);
      const valor = Math.abs(num(t.total) || 0);
      const qtd = Math.abs(num(t.quantidade) || 0);
      if (tipo === 'compra' || tipo === 'transfEntrada') {
        lotes.push({ qtd, custo: valor });
        eventos.push({ data: t.data, caixa: valor, aplicado: valor, provento: 0, qtd: 0 });
      } else if (tipo === 'venda' || tipo === 'transfSaida') {
        const total = lotes.reduce((s, l) => s + l.qtd, 0);
        let resta = total > 0 && (total - qtd) / total < 0.02 ? total : qtd;
        let custo = 0;
        while (resta > 1e-9 && lotes.length) {
          const l = lotes[0];
          if (l.qtd <= resta + 1e-9) { custo += l.custo; resta -= l.qtd; lotes.shift(); } else {
            const c = (l.custo * resta) / l.qtd; custo += c; l.custo -= c; l.qtd -= resta; resta = 0;
          }
        }
        eventos.push({ data: t.data, caixa: -valor, aplicado: -custo, provento: 0, qtd: 0 });
      } else if (tipo === 'juros') {
        eventos.push({ data: t.data, caixa: -valor, aplicado: 0, provento: valor, qtd: 0 });
      }
    });
    return eventos;
  }
  const pos = { qtd: 0, custo: 0 };
  transacoes.forEach((t) => {
    const valor = num(t.totalBrl) != null ? t.totalBrl : (resposta.moeda === 'USD' ? null : num(t.total));
    if (valor == null) return;
    const qtd = Math.abs(num(t.quantidade) || 0);
    if (t.tipo === 'Venda') {
      const saida = pos.custo * fracaoVendida(pos.qtd, qtd);
      pos.custo -= saida; pos.qtd = Math.max(0, pos.qtd - qtd);
      eventos.push({ data: t.data, caixa: -valor, aplicado: -saida, provento: 0, qtd: -qtd });
    } else {
      pos.qtd += qtd; pos.custo += valor;
      eventos.push({ data: t.data, caixa: valor, aplicado: valor, provento: 0, qtd });
    }
  });
  (resposta.proventos || []).forEach((p) => {
    if (num(p.valor) == null) return;
    eventos.push({ data: p.dataPagamento, caixa: -p.valor, aplicado: 0, provento: p.valor, qtd: 0 });
  });
  return eventos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/**
 * Histórico diário do ativo no formato do motor de gráficos (ver cabeçalho).
 * Pontos = dias da série do ativo + o dia de hoje (valor ao vivo, igual à
 * tabela de Carteiras) + dias de venda que zeraram a posição. Um evento num
 * dia sem ponto entra no próximo ponto (compra antes do 1º dia da série) ou,
 * depois do último, num ponto novo com a quantidade que sobrou x último
 * preço (0 quando a posição foi zerada).
 */
export function montarHistoricoAtivo(resposta) {
  if (!resposta || !resposta.ok) return [];
  const ehRf = resposta.tipo === 'rf';
  const porData = new Map();
  (resposta.serie || []).forEach((p) => {
    const valor = ehRf ? num(p.valor) : (num(p.valorBrl) != null ? p.valorBrl : (resposta.moeda === 'USD' ? null : num(p.valor)));
    if (valor == null) return;
    porData.set(p.data, { data: p.data, ativo: valor, cotas: num(p.cotas), preco: num(p.preco) });
  });

  // hoje, ao vivo (mesmo número da tabela de Carteiras)
  const hoje = resposta.hoje;
  const vivo = valorAtualBrl(resposta);
  const aindaTem = ehRf ? vivo != null && vivo > 0 : resposta.ativo && resposta.ativo.quantidade > 0;
  let ajusteMarcacao = 0;
  if (hoje && vivo != null && aindaTem) {
    const antes = porData.get(hoje) || {};
    // Renda fixa: o histórico é a projeção pelo índice e o valor de hoje é o
    // da Carteira (copiado da B3/corretora) - a diferença entre as 2 réguas é
    // ajuste de marcação, não rendimento de hoje: entra como fluxo do dia
    // (mesma regra de Home.gs!sincronizarUltimoPontoHistoricoComAoVivo_).
    if (ehRf) {
      const anteriores = [...porData.keys()].filter((d) => d <= hoje).sort();
      const ref = antes.ativo ?? (anteriores.length ? porData.get(anteriores[anteriores.length - 1]).ativo : null);
      if (ref != null) ajusteMarcacao = vivo - ref;
    }
    porData.set(hoje, { ...antes, data: hoje, ativo: vivo, cotas: ehRf ? null : resposta.ativo.quantidade, preco: ehRf ? null : num(resposta.ativo.precoAtual) });
  }

  const eventos = eventosDoAtivo(resposta);
  let datas = [...porData.keys()].sort();

  // eventos depois do último ponto (venda que zerou, provento pago depois)
  if (datas.length) {
    const ultima = porData.get(datas[datas.length - 1]);
    const precoUnit = ultima.cotas ? ultima.ativo / ultima.cotas : null;
    let qtd = ultima.cotas;
    eventos.filter((e) => e.data > datas[datas.length - 1]).forEach((e) => {
      if (!ehRf && qtd != null) qtd = Math.max(0, qtd + e.qtd);
      if (porData.has(e.data)) return;
      const valor = ehRf ? (resposta.ativo ? ultima.ativo : 0) : (qtd != null && precoUnit != null ? r2(qtd * precoUnit) : 0);
      porData.set(e.data, { data: e.data, ativo: valor, cotas: ehRf ? null : qtd, preco: ehRf ? null : ultima.preco });
    });
    datas = [...porData.keys()].sort();
  }
  if (!datas.length) return [];

  const pontos = datas.map((d) => ({ ...porData.get(d), fluxoCaixaAtivo: 0, fluxoAplicadoAtivo: 0, proventosAtivo: 0 }));
  let i = 0;
  eventos.forEach((e) => {
    while (i < pontos.length - 1 && pontos[i].data < e.data) i += 1;
    // e.data <= pontos[i].data, ou é depois do último (já tem ponto próprio)
    const p = pontos[i];
    p.fluxoCaixaAtivo += e.caixa;
    p.fluxoAplicadoAtivo += e.aplicado;
    p.proventosAtivo += e.provento;
  });

  if (ajusteMarcacao) {
    const pHoje = pontos.find((p) => p.data === hoje);
    if (pHoje) { pHoje.fluxoCaixaAtivo += ajusteMarcacao; pHoje.ajusteMarcacao = r2(ajusteMarcacao); }
  }

  // índices do dia (os da Início), repetindo o último conhecido
  const indices = [...(resposta.indices || [])].sort((a, b) => (a.data < b.data ? -1 : 1));
  let j = -1;
  const ultimoDe = {};
  pontos.forEach((p) => {
    while (j + 1 < indices.length && indices[j + 1].data <= p.data) {
      j += 1;
      ['cdi', 'ipca', 'ibovespa', 'ifix', 'sp500', 'cambioUsd', 'patrimonio'].forEach((c) => { if (num(indices[j][c]) != null) ultimoDe[c] = indices[j][c]; });
    }
    p.indiceCdi = ultimoDe.cdi ?? null;
    p.indiceIpca = ultimoDe.ipca ?? null;
    p.ibovespa = ultimoDe.ibovespa ?? null;
    p.ifix = ultimoDe.ifix ?? null;
    p.sp500 = ultimoDe.sp500 ?? null;
    p.cambioUsd = ultimoDe.cambioUsd ?? null;
    p.patrimonioTotal = ultimoDe.patrimonio ?? null;
    p.fluxoCaixaAtivo = r2(p.fluxoCaixaAtivo);
    p.fluxoAplicadoAtivo = r2(p.fluxoAplicadoAtivo);
    p.proventosAtivo = r2(p.proventosAtivo);
  });
  return pontos;
}

/** Valor aplicado acumulado em cada ponto. */
export function aplicadoAcumulado(historico) {
  let soma = 0;
  return (historico || []).map((p) => { soma += p.fluxoAplicadoAtivo || 0; return r2(soma); });
}

/**
 * Histórico mensal (mais recente primeiro): saldo e quantidade no fim do mês,
 * rentabilidade do mês (TWR, com proventos - a mesma conta do gráfico), % da
 * carteira total, Ibovespa/IFIX/S&P 500/IPCA e CDI no mês, proventos e
 * valor aplicado.
 */
export function historicoMensal(historico, { campoIndice = 'ibovespa' } = {}) {
  const pontos = historico || [];
  if (!pontos.length) return [];
  const aplicado = aplicadoAcumulado(pontos);
  const meses = [];
  pontos.forEach((p, idx) => {
    const mes = p.data.slice(0, 7);
    let m = meses[meses.length - 1];
    if (!m || m.mes !== mes) { m = { mes, ini: idx, fim: idx }; meses.push(m); } else m.fim = idx;
  });
  const variacao = (campo, a, b) => {
    const va = num(a && a[campo]), vb = num(b && b[campo]);
    return va && vb ? (vb / va - 1) * 100 : null;
  };
  const linhas = meses.map((m, k) => {
    const base = k > 0 ? m.ini - 1 : m.ini; // o fechamento do mês anterior é a base
    const janela = pontos.slice(base, m.fim + 1);
    const abertura = k === 0 && (janela[0].fluxoCaixaAtivo || 0) > 0;
    const serie = janela.length >= 2 || abertura ? normalizarSerieRentabilidade(janela, 'ativo', 'fluxoCaixaAtivo', { abertura }) : [];
    let rent = null;
    for (let i = serie.length - 1; i >= 0; i -= 1) if (serie[i] != null) { rent = serie[i]; break; }
    const fim = pontos[m.fim];
    const proventos = pontos.slice(m.ini, m.fim + 1).reduce((s, p) => s + (p.proventosAtivo || 0), 0);
    return {
      mes: m.mes,
      saldo: fim.ativo,
      cotas: fim.cotas ?? null,
      rentabilidade: rent,
      percentualCarteira: num(fim.patrimonioTotal) ? fim.ativo / fim.patrimonioTotal : null,
      indice: k > 0 ? variacao(campoIndice, pontos[m.ini - 1], fim) : null,
      cdi: k > 0 ? variacao('indiceCdi', pontos[m.ini - 1], fim) : null,
      proventos: r2(proventos),
      aplicado: aplicado[m.fim],
    };
  });
  return linhas.reverse();
}

/**
 * Extrato (mais recente primeiro): compras, vendas, movimentações da renda
 * fixa e proventos, cada um com o valor na moeda do ativo e em reais.
 */
export function montarExtrato(resposta) {
  const moeda = resposta.moeda || 'BRL';
  const itens = [];
  (resposta.transacoes || []).forEach((t) => {
    const tipoRf = resposta.tipo === 'rf' ? tipoMovimentacaoRf(t) : null;
    const grupo = resposta.tipo === 'rf' ? (tipoRf === 'juros' ? 'provento' : 'movimentacao') : 'movimentacao';
    itens.push({
      data: t.data,
      tipo: resposta.tipo === 'rf' ? (tipoRf === 'juros' ? 'Juros (cupom)' : (tipoRf === 'compra' ? 'Aplicação' : (tipoRf === 'venda' ? 'Resgate' : t.tipo))) : t.tipo,
      grupo,
      entrada: resposta.tipo === 'rf' ? tipoRf === 'compra' || tipoRf === 'transfEntrada' : t.tipo === 'Compra',
      quantidade: num(t.quantidade),
      preco: num(t.preco),
      total: num(t.total),
      totalBrl: num(t.totalBrl),
      moeda,
      lucro: num(t.lucro),
    });
  });
  (resposta.proventos || []).forEach((p) => {
    itens.push({
      data: p.dataPagamento,
      dataCom: p.dataCom || null,
      tipo: p.tipo,
      grupo: 'provento',
      entrada: true,
      quantidade: num(p.quantidade),
      preco: num(p.valorPorCota),
      total: num(p.liquido),
      totalBrl: num(p.valor),
      moeda: p.moeda || moeda,
      lucro: null,
    });
  });
  return itens.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : (a.grupo === 'provento' ? 1 : -1)));
}

/** Soma dos proventos (em reais) com pagamento entre `desde` e `ate` (inclusive). */
function somaProventos(proventos, desde, ate) {
  return r2((proventos || []).filter((p) => p.dataPagamento >= desde && p.dataPagamento <= ate).reduce((s, p) => s + (num(p.valor) || 0), 0));
}

function somarMeses(anoMes, n) {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Resumo de proventos do ativo, em reais: total recebido, no mês, nos
 * últimos 12 meses fechados (+ média mensal), yield on cost (12 meses sobre o
 * valor aplicado de hoje), por ano e os últimos 24 meses (pro gráfico) e o
 * que ainda vai cair.
 */
export function resumoProventosAtivo(resposta, { aplicadoHoje = null } = {}) {
  const hoje = resposta.hoje;
  const proventos = resposta.proventos || [];
  const mesAtual = hoje.slice(0, 7);
  const inicio12 = `${somarMeses(mesAtual, -12)}-01`;
  const fim12 = `${somarMeses(mesAtual, -1)}-31`;
  const ultimos12 = somaProventos(proventos, inicio12, fim12);
  const porAno = {};
  proventos.forEach((p) => { const a = p.dataPagamento.slice(0, 4); porAno[a] = r2((porAno[a] || 0) + (num(p.valor) || 0)); });
  const porMes = [];
  for (let k = 23; k >= 0; k -= 1) {
    const mes = somarMeses(mesAtual, -k);
    const doMes = proventos.filter((p) => p.dataPagamento.slice(0, 7) === mes);
    porMes.push({ mes, valor: r2(doMes.reduce((s, p) => s + (num(p.valor) || 0), 0)), tipos: [...new Set(doMes.map((p) => p.tipo))] });
  }
  const aReceber = (resposta.aReceber || []).map((p) => ({ ...p }));
  return {
    total: r2(proventos.reduce((s, p) => s + (num(p.valor) || 0), 0)),
    quantidade: proventos.length,
    mesAtual: somaProventos(proventos, `${mesAtual}-01`, `${mesAtual}-31`),
    ultimos12,
    mediaMensal12: r2(ultimos12 / 12),
    yieldOnCost12: aplicadoHoje ? ultimos12 / aplicadoHoje : null,
    porAno: Object.keys(porAno).sort().map((ano) => ({ ano, valor: porAno[ano] })),
    porMes,
    aReceber,
    totalAReceber: r2(aReceber.reduce((s, p) => s + (num(p.valor) || 0), 0)),
    primeiroPagamento: proventos.length ? proventos[0].dataPagamento : null,
  };
}

/**
 * Faixa de preço pra barra "mínimo de 52 semanas -> preço-teto": na
 * moeda do ativo. FIIs usam o mín./máx. de 52 semanas da aba "Carteira FIIs"
 * (vem em `faixa52`); os outros, a série do período em carteira (os últimos
 * 365 dias; `parcial` quando o ativo está na carteira há menos de 1 ano).
 * A escala vai do menor ao maior entre mínimo, máximo, preço-teto, preço
 * médio e cotação - a barra cheia é mínimo -> teto.
 */
export function faixaDePreco(resposta) {
  const a = resposta.ativo;
  if (resposta.tipo === 'rf' || !a) return null;
  const atual = num(a.precoAtual);
  if (atual == null) return null;
  let min = null, max = null, fonte = null, parcial = false, desde = null;
  if (resposta.faixa52 && num(resposta.faixa52.min) != null) {
    ({ min, max } = resposta.faixa52);
    fonte = 'planilha';
  } else {
    const d = new Date(`${resposta.hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 365);
    const corte = d.toISOString().slice(0, 10);
    const precos = (resposta.serie || []).filter((p) => p.data >= corte && num(p.preco) != null && p.preco > 0);
    if (precos.length) {
      min = Math.min(atual, ...precos.map((p) => p.preco));
      max = Math.max(atual, ...precos.map((p) => p.preco));
      fonte = 'serie';
      desde = precos[0].data;
      parcial = desde > corte && (resposta.serie[0] || {}).data > corte;
    }
  }
  if (min == null) { min = atual; max = atual; fonte = 'atual'; }
  const teto = num(a.precoTeto);
  const pm = num(a.precoMedio);
  const valores = [min, max, atual, teto, pm].filter((v) => v != null && v > 0);
  const escalaMin = Math.min(...valores);
  const escalaMax = Math.max(...valores);
  const pos = (v) => (v == null || escalaMax === escalaMin ? null : (v - escalaMin) / (escalaMax - escalaMin));
  return {
    min: r2(min), max: r2(max), atual, teto, precoMedio: pm, fonte, parcial, desde,
    vies: a.vies || null,
    // quanto falta até o teto (positivo = cotação abaixo do teto: margem de segurança)
    margemTeto: teto ? (teto - atual) / teto : null,
    distanciaMinimo: min ? atual / min - 1 : null,
    posicoes: { min: pos(min), max: pos(max), atual: pos(atual), teto: pos(teto), precoMedio: pos(pm) },
    escala: { min: escalaMin, max: escalaMax },
  };
}

/** Resumo da posição pro topo da tela (na moeda do ativo). */
export function resumoPosicao(resposta, historico) {
  const a = resposta.ativo || {};
  const ehRf = resposta.tipo === 'rf';
  const aplicadoHistorico = aplicadoAcumulado(historico);
  if (ehRf) {
    const saldo = num(a.totalAtualizado);
    const aplicado = num(a.totalInvestido);
    return {
      saldo, aplicado,
      resultado: saldo != null && aplicado != null ? saldo - aplicado : null,
      percentual: saldo != null && aplicado ? saldo / aplicado - 1 : null,
      irHoje: a.irSeResgatasseHoje ? num(a.irSeResgatasseHoje.impostoSeResgatasseHoje) : null,
      liquidoHoje: a.irSeResgatasseHoje ? num(a.irSeResgatasseHoje.valorLiquidoSeResgatasseHoje) : null,
      aplicadoHistorico: aplicadoHistorico.length ? aplicadoHistorico[aplicadoHistorico.length - 1] : null,
    };
  }
  const saldo = num(a.totalAtualizado);
  const aplicado = num(a.totalComprado);
  const resultado = saldo != null && aplicado != null ? saldo - aplicado : null;
  const proventosTotais = num(a.proventosTotais);
  return {
    saldo, aplicado, resultado,
    percentual: resultado != null && aplicado ? resultado / aplicado : null,
    quantidade: num(a.quantidade),
    precoMedio: num(a.precoMedio),
    precoAtual: num(a.precoAtual),
    variacaoDia: num(a.variacaoDia),
    rentabilidadeSobrePm: num(a.precoAtual) != null && num(a.precoMedio) ? a.precoAtual / a.precoMedio - 1 : null,
    proventosTotais,
    resultadoComProventos: resultado != null && proventosTotais != null ? resultado + proventosTotais : null,
    aplicadoHistorico: aplicadoHistorico.length ? aplicadoHistorico[aplicadoHistorico.length - 1] : null,
  };
}

/** Participação do ativo no patrimônio total de hoje (índice "patrimonio" da Início). */
export function percentualNaCarteira(historico) {
  const ult = (historico || [])[historico.length - 1];
  return ult && num(ult.patrimonioTotal) ? ult.ativo / ult.patrimonioTotal : null;
}

/** Regras de IR que valem pra classe do ativo (assets/data/imposto-renda.json). */
export function irDaClasse(ir, classe) {
  if (!ir || !ir.classes) return null;
  const temClasse = (item) => !item.classes || item.classes.includes(classe);
  return {
    aviso: ir.aviso,
    atualizadoEm: ir.atualizadoEm,
    classe: ir.classes[classe] || null,
    proventos: (ir.proventos || []).filter(temClasse),
    darf: (ir.darf || []).filter(temClasse),
    declaracao: ir.declaracao || [],
    ondeBaixar: (ir.ondeBaixar || []).filter(temClasse),
    avisos: ir.avisos || [],
  };
}

/** "25/09/2026.pdf" etc. já vem com `data` do Apps Script; aqui só ordena e marca a mais nova. */
export function ordenarTeses(teses) {
  return [...(teses || [])].sort((a, b) => ((b.data || '') < (a.data || '') ? -1 : 1)).map((t, i) => ({ ...t, maisRecente: i === 0 }));
}
