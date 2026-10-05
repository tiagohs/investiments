/**
 * criterios/macro.js - 05/10/2026 (Tiago: "Análises: reavalie as análises...
 * considere o macroeconômico, se for possível, se a bolsa está cara ou
 * barata, a situação daquele ativo etc.").
 *
 * Lê o contexto de mercado (Macro.gs, action=macro: Selic, CDI 12m, IPCA
 * 12m, expectativas do Focus, taxas do Tesouro e os P/L e P/VP da carteira
 * do Tiago com a foto mensal) e devolve 1 a 2 SINAIS por classe, de peso
 * pequeno (<= 0,4 cada; o total de "contexto de mercado" é limitado a 0,5
 * ponto no momento de aporte - aportes-calc.js!somaPontos - e a nota do
 * ativo nem o vê): o contexto desempata, nunca decide sozinho.
 *
 * Tudo puro (sem DOM/rede). Frações: 0.1375 = 13,75%. Testes:
 * tests/criterios-macro.test.js (dados inventados).
 *
 * Referências usadas nos limiares (não são "verdades", só régua):
 *  - juro real (Selic meta ÷ IPCA esperado 12m, ou CDI ÷ IPCA realizado):
 *    >= 6% a.a. alto (a média de décadas no Brasil fica em ~5-6%), >= 8% muito
 *    alto, <= 3% baixo;
 *  - prêmio da NTN-B longa (Tesouro IPCA+ com vencimento 5+ anos): >= 7% alto,
 *    <= 5% baixo (régua fixa: o histórico de taxas do Tesouro não está na planilha);
 *  - bolsa/FIIs: P/L (ou P/VP) ponderado da carteira hoje ÷ mediana da própria
 *    foto mensal: <= 0,85 barato, >= 1,15 caro.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const br = (v, casas = 1) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (f, casas = 1) => `${br(f * 100, casas)}%`;
const PREFIXO = 'Contexto de mercado: ';

const escHtml = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Botão "i" que abre a explicação do ponto ali mesmo (sem JS: <details>), pro
 * momento de aporte e pro card de análise do ativo (estilo .ctx-i em shell.css).
 */
export function ajudaHtml(texto) {
  return texto ? `<details class="ctx-i"><summary aria-label="Por que isso pesa?" title="Por que isso pesa?">i</summary><p>${escHtml(texto)}</p></details>` : '';
}

export const LIMIARES_MACRO = Object.freeze({
  jurosRealAlto: 0.06, jurosRealMuitoAlto: 0.08, jurosRealBaixo: 0.03,
  ntnbAlta: 0.07, ntnbBaixa: 0.05,
  bolsaBarata: 0.85, bolsaCara: 1.15,
  fiiPvpBarato: 0.9, fiiPvpCaro: 1.05,
  selicQueda: 0.015, // Focus espera a Selic 1,5 p.p. abaixo da de hoje
  // a foto mensal é 1 por mês: com 6 meses já dá uma mediana (o texto diz quantos meses)
  mesesMinimosHistorico: 6, coberturaMinima: 0.5, ativosMinimos: 3,
});

// ---------------------------------------------------------------------------
// Juros
// ---------------------------------------------------------------------------

/** Juro real: (1+nominal)/(1+inflação)-1. null sem os dois. */
export function juroReal(nominal, inflacao) {
  const n = num(nominal); const i = num(inflacao);
  return n == null || i == null || 1 + i <= 0 ? null : (1 + n) / (1 + i) - 1;
}

/**
 * Juros do contexto: { selic, selicEsperada, ipca12m, ipcaEsperado, cdi12m,
 * real (o que vale), base ('esperado'|'realizado'), realEsperado, realRealizado,
 * nivel ('muito-alto'|'alto'|'medio'|'baixo'), quedaEsperada (p.p. em fração) }.
 */
export function analisarJuros(j) {
  if (!j) return null;
  const realEsperado = juroReal(j.selic, j.ipcaEsperado12m);
  const realRealizado = juroReal(j.cdi12m, j.ipca12m);
  const real = realEsperado != null ? realEsperado : realRealizado;
  if (real == null) return null;
  const L = LIMIARES_MACRO;
  const nivel = real >= L.jurosRealMuitoAlto ? 'muito-alto' : (real >= L.jurosRealAlto ? 'alto' : (real <= L.jurosRealBaixo ? 'baixo' : 'medio'));
  const queda = num(j.selic) != null && num(j.selicEsperadaAnoSeguinte) != null ? j.selic - j.selicEsperadaAnoSeguinte : null;
  return {
    selic: num(j.selic), selicEsperada: num(j.selicEsperadaAnoSeguinte), ipca12m: num(j.ipca12m), ipcaEsperado: num(j.ipcaEsperado12m), cdi12m: num(j.cdi12m),
    real, base: realEsperado != null ? 'esperado' : 'realizado', realEsperado, realRealizado, nivel, quedaEsperada: queda,
  };
}

/** Tesouro IPCA+ à venda hoje (lista { nome, tipo, vencimento, taxa em % a.a. }) -> a NTN-B longa e a curta. */
export function analisarNtnb(tesouro, hoje) {
  const ref = String(hoje || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const anos = (v) => (Date.parse(`${String(v).slice(0, 10)}T12:00:00Z`) - Date.parse(`${ref}T12:00:00Z`)) / (365.25 * 86400000);
  const lista = (tesouro || [])
    .filter((t) => t && /ipca\+/i.test(String(t.tipo || t.nome || '')) && num(t.taxa) > 0 && Number.isFinite(anos(t.vencimento)) && anos(t.vencimento) > 0)
    .map((t) => ({ nome: t.nome || t.tipo, vencimento: String(t.vencimento).slice(0, 10), taxa: t.taxa / 100, anos: anos(t.vencimento) }));
  if (!lista.length) return null;
  const longos = lista.filter((t) => t.anos >= 5);
  const longa = (longos.length ? longos : lista).reduce((a, b) => (b.anos > a.anos ? b : a));
  const curtas = lista.filter((t) => t.anos < 5);
  const curta = curtas.length ? curtas.reduce((a, b) => (b.anos > a.anos ? b : a)) : null;
  const L = LIMIARES_MACRO;
  return { longa, curta, nivel: longa.taxa >= L.ntnbAlta ? 'alto' : (longa.taxa <= L.ntnbBaixa ? 'baixo' : 'medio') };
}

// ---------------------------------------------------------------------------
// Termômetro da bolsa (carteira do Tiago x a média histórica dela mesma)
// ---------------------------------------------------------------------------

const LIMITE_MULTIPLO = { pl: 100, pvp: 20 };

/** Média harmônica ponderada pelo valor (o múltiplo "da carteira inteira"); itens sem múltiplo válido ficam de fora. */
export function multiploPonderado(itens, chave, valorDe) {
  let peso = 0; let invertido = 0; let pesoTotal = 0; let n = 0;
  itens.forEach((it) => {
    const w = num(it.valor) > 0 ? it.valor : 0;
    if (!(w > 0)) return;
    pesoTotal += w;
    const v = valorDe(it);
    if (!(v > 0) || v > LIMITE_MULTIPLO[chave]) return;
    peso += w; invertido += w / v; n += 1;
  });
  return { valor: invertido > 0 ? peso / invertido : null, cobertura: pesoTotal > 0 ? peso / pesoTotal : 0, n };
}

function mediana(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Termômetro de uma classe ('acoes' | 'fiis' | 'acoesEua'): P/L (P/VP nos FIIs)
 * ponderado de hoje x a mediana da foto mensal da mesma carteira (mesmos pesos).
 * { metrica, atual, medio, razao, meses, n, cobertura, nivel } ou null
 * (poucos ativos / pouca cobertura).
 */
export function termometroBolsa(carteira, classe, hojeMes = '') {
  const L = LIMIARES_MACRO;
  const chave = classe === 'fiis' ? 'pvp' : 'pl';
  const itens = (carteira || []).filter((x) => x && x.classe === classe);
  const agora = multiploPonderado(itens, chave, (it) => num(it[chave]));
  if (agora.valor == null || agora.n < L.ativosMinimos || agora.cobertura < L.coberturaMinima) return null;
  const porMes = new Map();
  itens.forEach((it, i) => ((it.historico && it.historico[chave]) || []).forEach((p) => {
    const mes = Array.isArray(p) ? p[0] : p && p.data;
    const v = Array.isArray(p) ? p[1] : p && p.valor;
    if (!/^\d{4}-\d{2}$/.test(String(mes || '')) || !(num(v) > 0)) return;
    if (!porMes.has(mes)) porMes.set(mes, new Map());
    porMes.get(mes).set(i, v);
  }));
  const serie = [];
  [...porMes.keys()].sort().forEach((mes) => {
    if (mes === String(hojeMes || '').slice(0, 7)) return; // o mês de hoje é o "atual"
    const m = multiploPonderado(itens, chave, (it) => porMes.get(mes).get(itens.indexOf(it)));
    if (m.valor != null && m.n >= L.ativosMinimos && m.cobertura >= L.coberturaMinima) serie.push(m.valor);
  });
  const medio = serie.length >= L.mesesMinimosHistorico ? mediana(serie) : null;
  const razao = medio > 0 ? agora.valor / medio : null;
  let nivel = 'neutro';
  if (chave === 'pvp') {
    if (agora.valor <= L.fiiPvpBarato || (razao != null && razao <= L.bolsaBarata)) nivel = 'barato';
    else if (agora.valor >= L.fiiPvpCaro || (razao != null && razao >= L.bolsaCara)) nivel = 'caro';
  } else if (razao != null) nivel = razao <= L.bolsaBarata ? 'barato' : (razao >= L.bolsaCara ? 'caro' : 'neutro');
  else nivel = 'sem-historico';
  return { metrica: chave === 'pvp' ? 'P/VP' : 'P/L', atual: agora.valor, medio, razao, meses: serie.length, n: agora.n, cobertura: agora.cobertura, nivel, retornoLucro: chave === 'pl' ? 1 / agora.valor : null };
}

// ---------------------------------------------------------------------------
// Contexto completo
// ---------------------------------------------------------------------------

/**
 * resposta = action=macro ({ macro } ou o próprio macro). tesouroExtra = lista
 * do Tesouro que a tela já tem (Aportes: dados.tesouro) - usada se o Macro.gs
 * não trouxe taxas. Devolve null sem nada utilizável.
 */
export function montarMacro(resposta, { tesouroExtra = null, hoje = '' } = {}) {
  const r = resposta && resposta.macro ? resposta.macro : resposta;
  const dia = hoje || (r && r.hoje) || '';
  const juros = r && r.juros ? analisarJuros(r.juros) : null;
  const ntnb = analisarNtnb(r && r.tesouro && r.tesouro.length ? r.tesouro : tesouroExtra, dia);
  const carteira = (r && r.carteira) || [];
  const bolsa = {};
  ['acoes', 'fiis', 'acoesEua'].forEach((c) => { const t = termometroBolsa(carteira, c, dia); if (t) bolsa[c] = t; });
  if (!juros && !ntnb && !Object.keys(bolsa).length) return null;
  return { hoje: dia, juros, ntnb, bolsa, avisos: (r && r.avisos) || [] };
}

// ---------------------------------------------------------------------------
// Sinais
// ---------------------------------------------------------------------------

function sinal(id, tom, texto, peso, ajuda) {
  return { id, tom, texto: `${PREFIXO}${texto}`, peso, macro: true, ajuda };
}

const AJUDA_JUROS = 'Juro real = juro nominal descontada a inflação. Aqui: Selic meta contra o IPCA esperado do Focus (se o Focus não veio, CDI e IPCA dos últimos 12 meses). Quando a renda fixa paga muito acima da inflação, a ação precisa estar mais barata para compensar o risco.';

function sinalJurosParaRv(m, classe) {
  const j = m.juros;
  if (!j) return null;
  const real = `${pct(j.real)} a.a.${j.base === 'realizado' ? ' (realizado)' : ''}`;
  if (j.nivel === 'muito-alto' || j.nivel === 'alto') {
    const alvo = classe === 'fiis' ? 'FIIs disputam o dinheiro com a renda fixa' : 'exija mais desconto nas ações';
    return sinal('juro-real', 'ruim', `juro real de ${real}: a renda fixa paga muito; ${alvo}.`, j.nivel === 'muito-alto' ? -0.3 : -0.2, AJUDA_JUROS);
  }
  if (j.nivel === 'baixo') return sinal('juro-real', 'bom', `juro real de ${real}: a renda fixa paga pouco acima da inflação, o que ajuda a renda variável.`, 0.3, AJUDA_JUROS);
  return null;
}

function sinalBolsa(t, classe, juros = null) {
  if (!t) return null;
  const nomeClasse = { acoes: 'das suas ações', fiis: 'dos seus FIIs', acoesEua: 'das suas ações dos EUA' }[classe];
  const quando = t.meses >= 12 ? 'na média histórica' : `na média dos últimos ${t.meses} meses`;
  const medio = t.medio != null ? ` contra ${br(t.medio, t.metrica === 'P/L' ? 1 : 2)} ${quando}` : '';
  if (t.nivel === 'sem-historico') {
    // ainda não há foto mensal suficiente: só informa o retorno pelo lucro contra a Selic (peso zero, fica no "+N")
    if (classe !== 'acoes' || t.retornoLucro == null || !juros || juros.selic == null) return null;
    return sinal('bolsa', 'neutro', `P/L médio das suas ações em ${br(t.atual, 1)} (retorno pelo lucro de ${pct(t.retornoLucro)} a.a. contra Selic de ${pct(juros.selic, 2)}); ainda sem média histórica pra dizer se está caro ou barato.`, 0,
      'O retorno pelo lucro é 1 ÷ P/L: quanto a carteira de ações "rende" em lucro por ano sobre o preço. A comparação com a Selic mostra se as ações pagam mais ou menos que a renda fixa. A média histórica própria (foto mensal do P/L, guardada na planilha) só aparece depois de alguns meses de fotos.');
  }
  const atual = br(t.atual, t.metrica === 'P/L' ? 1 : 2);
  const dif = t.razao != null ? ` (${t.razao < 1 ? '−' : '+'}${br(Math.abs(t.razao - 1) * 100, 0)}%)` : '';
  const ajuda = `${t.metrica} médio ${nomeClasse} que você tem em carteira, ponderado pelo valor de cada uma (${t.n} ativos), comparado com a mediana dos últimos ${t.meses || 0} meses da foto mensal guardada na planilha. Serve de termômetro: se o conjunto está barato ou caro frente à própria história. Não substitui a análise de cada ativo.`;
  if (t.nivel === 'barato') return sinal('bolsa', 'bom', `${t.metrica} médio ${nomeClasse} em ${atual}${medio}${dif}: mercado barato no geral.`, 0.4, ajuda);
  if (t.nivel === 'caro') return sinal('bolsa', 'ruim', `${t.metrica} médio ${nomeClasse} em ${atual}${medio}${dif}: mercado caro no geral.`, -0.4, ajuda);
  if (t.nivel === 'neutro') return sinal('bolsa', 'neutro', `${t.metrica} médio ${nomeClasse} em ${atual}${medio}${dif}: no nível da própria média.`, 0, ajuda);
  return null;
}

function sinalSelicEmQueda(m, texto) {
  const j = m.juros;
  if (!j || j.quedaEsperada == null || j.quedaEsperada < LIMIARES_MACRO.selicQueda) return null;
  return sinal('selic-queda', 'bom', `o Focus espera a Selic em ${pct(j.selicEsperada, 2)} no fim do próximo ano (hoje ${pct(j.selic, 2)}): ${texto}`, 0.3,
    'Focus = pesquisa semanal do Banco Central com economistas do mercado. Juros em queda tendem a valorizar títulos de taxa já travada e a ajudar quem vive de desconto (FIIs, ações).');
}

/**
 * Sinais de contexto de mercado de uma classe ('acoes' | 'fiis' | 'acoesEua' |
 * 'rendaFixa'). Pra renda fixa passe { indexador: 'SELIC'|'IPCA'|'PRE'|'CDI',
 * taxaPropria: true se o título já mostra a própria taxa do dia (evita repetir) }.
 * Devolve até `max` sinais { id, tom, texto, peso, macro: true, ajuda }.
 */
export function sinaisMacro(macro, classe, { indexador = '', taxaPropria = false, max = 2 } = {}) {
  if (!macro) return [];
  const out = [];
  const add = (s) => { if (s) out.push(s); };
  if (classe === 'acoes') {
    add(sinalBolsa(macro.bolsa.acoes, 'acoes', macro.juros));
    add(sinalJurosParaRv(macro, 'acoes'));
  } else if (classe === 'acoesEua') {
    add(sinalBolsa(macro.bolsa.acoesEua, 'acoesEua'));
  } else if (classe === 'fiis') {
    add(sinalBolsa(macro.bolsa.fiis, 'fiis'));
    add(sinalSelicEmQueda(macro, 'costuma favorecer FIIs.') || sinalJurosParaRv(macro, 'fiis'));
  } else if (classe === 'rendaFixa') {
    const j = macro.juros;
    const ix = String(indexador || '').toUpperCase();
    if (ix === 'SELIC' || ix === 'CDI') {
      if (j && (j.nivel === 'alto' || j.nivel === 'muito-alto')) add(sinal('selic-alta', 'bom', `Selic em ${pct(j.selic, 2)} (juro real de ${pct(j.real)} a.a.): o pós-fixado paga muito e não sofre marcação a mercado.`, 0.2, AJUDA_JUROS));
      else if (j && j.nivel === 'baixo') add(sinal('selic-baixa', 'neutro', `juro real de ${pct(j.real)} a.a.: o pós-fixado rende pouco acima da inflação.`, 0, AJUDA_JUROS));
    } else if (ix === 'IPCA' || ix === 'PRE' || ix === 'PRÉ') {
      add(sinalSelicEmQueda(macro, 'travar a taxa de um título longo tende a valorizá-lo.'));
      if (ix === 'IPCA' && !taxaPropria && macro.ntnb) {
        const n = macro.ntnb;
        const txt = `Tesouro IPCA+ longo (${n.longa.nome}) paga IPCA + ${pct(n.longa.taxa)}`;
        const ajuda = 'Prêmio da NTN-B = taxa real que o Tesouro paga acima do IPCA nos títulos IPCA+ de 5 anos ou mais. Régua fixa: a partir de 7% é alto, até 5% é baixo (o histórico dessas taxas não está na planilha).';
        if (n.nivel === 'alto') add(sinal('ntnb', 'bom', `${txt}: prêmio alto para travar.`, 0.4, ajuda));
        else if (n.nivel === 'baixo') add(sinal('ntnb', 'ruim', `${txt}: prêmio baixo; vale esperar taxa melhor.`, -0.3, ajuda));
      }
    }
  }
  return out.slice(0, max);
}

/**
 * Resumo pro card: chips { id, rotulo, valor, tom, ajuda } do que está
 * disponível (juro real, NTN-B longa, bolsa BR/FIIs/EUA).
 */
export function resumoMacro(macro) {
  if (!macro) return [];
  const out = [];
  const j = macro.juros;
  if (j) {
    out.push({ id: 'juro-real', rotulo: 'Juro real', valor: `${pct(j.real)} a.a.`, tom: j.nivel === 'baixo' ? 'bom' : (j.nivel === 'medio' ? 'neutro' : 'atencao'), ajuda: `${AJUDA_JUROS} Selic ${pct(j.selic, 2)}${j.ipcaEsperado != null ? `, IPCA esperado ${pct(j.ipcaEsperado, 2)}` : ''}.` });
  }
  if (macro.ntnb) out.push({ id: 'ntnb', rotulo: 'NTN-B longa', valor: `IPCA + ${pct(macro.ntnb.longa.taxa)}`, tom: macro.ntnb.nivel === 'alto' ? 'bom' : (macro.ntnb.nivel === 'baixo' ? 'atencao' : 'neutro'), ajuda: `${macro.ntnb.longa.nome}: taxa de compra de hoje. Régua: 7% ou mais é alto, 5% ou menos é baixo.` });
  const nomes = { acoes: 'Bolsa BR', fiis: 'FIIs', acoesEua: 'Bolsa EUA' };
  Object.keys(nomes).forEach((c) => {
    const t = macro.bolsa[c];
    if (!t) return;
    const casas = t.metrica === 'P/L' ? 1 : 2;
    const tom = t.nivel === 'barato' ? 'bom' : (t.nivel === 'caro' ? 'atencao' : 'neutro');
    const semMedia = t.medio == null && t.retornoLucro != null && macro.juros && macro.juros.selic != null ? ` · retorno ${pct(t.retornoLucro)} x Selic ${pct(macro.juros.selic, 2)}` : '';
    out.push({ id: `bolsa-${c}`, rotulo: nomes[c], valor: `${t.metrica} ${br(t.atual, casas)}${t.medio != null ? ` · média ${br(t.medio, casas)}` : semMedia}`, tom, ajuda: `${t.metrica} médio ponderado do que você tem em ${nomes[c]}${t.medio != null ? `, contra a mediana dos últimos ${t.meses} meses da foto mensal` : '; a média histórica própria só aparece com alguns meses de fotos mensais (a planilha guarda 1 por mês)'}.` });
  });
  return out;
}

/** Quanto o contexto de mercado pode mexer no momento de aporte (pontos, +/-), contra 3 pra "Bom momento". */
export const LIMITE_PONTOS_MACRO = 0.5;
