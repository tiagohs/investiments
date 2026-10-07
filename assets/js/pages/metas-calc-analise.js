/**
 * metas-calc-analise.js - 06/10/2026 (A-42/A-76): textos e análises da tela Metas (velocidade, dicas para acelerar, cenário de renda menor,
 * leitura do histórico/projeção/renda). Só a tela Metas usa; o cartão de meta (Acompanhamento, Ativo) não carrega isto.
 * metas-calc.js reexporta (compatibilidade).
 */

import { mesDe, ultimoMesFechadoMetas, num, r2, rotuloDuracao, rotuloMes, somarMeses } from './metas-calc-nucleo.js';
import { aporteNecessario, arred, marcosProjecao, prazoParaAlvo, taxaMensal } from './metas-calc-plano.js';
import { aporteDeCalc, somarAporte } from './metas-calc-aporte.js'; // 07/10/2026: aporte crescente (degraus anuais)
import { formatBRL0, formatNumeroPt } from '../format.js';

/**
 * Tiago: "nesse ritmo, você chega na sua meta em tanto tempo. Sugestão pra
 * chegar em 75% desse tempo, 50% desse tempo (velocidade)". A base é o
 * prazo no ritmo atual; sem ritmo (aporte zero e sem rendimento), o prazo
 * da meta. Devolve { origem, baseMeses, cenarios: [{ fracao, meses, data, aporte, aMais }] }.
 */
export function velocidadeMeta(calc, { hoje } = {}) {
  if (!calc || calc.alvoBRL == null || calc.recorrente) return null;
  const atual = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL;
  if (atual >= calc.alvoBRL - 0.5) return { chegou: true, cenarios: [] };
  const mes = mesDe(hoje || new Date());
  let baseMeses = null;
  let origem = null;
  if (Number.isFinite(calc.mesesEstimados) && calc.mesesEstimados > 0) { baseMeses = calc.mesesEstimados; origem = 'ritmo'; }
  else if (calc.mesesRestantes > 0) { baseMeses = calc.mesesRestantes; origem = 'prazo'; }
  if (!baseMeses) return { origem: null, cenarios: [] };
  const cenarios = [1, 0.75, 0.5].map((f) => {
    const meses = Math.max(1, f === 1 ? Math.ceil(baseMeses) : Math.round(baseMeses * f));
    // no ritmo = o aporte de hoje; nos outros, o que fecha naquele prazo
    const aporte = f === 1 && origem === 'ritmo' ? r2(calc.aporteAtual || 0) : r2(aporteNecessario({ alvo: calc.alvoBRL, atual, meses, taxa: calc.taxa || 0, entradas: calc.entradasFluxo }) || 0);
    // 05/10/2026: "com isso, sua meta chega em ..., o 1º milhão em ..." de cada cenário
    const rm = resumoMarcos(calc, { hoje, aporte: f === 1 && origem === 'ritmo' && calc.planoAporte ? undefined : aporte }); // 07/10/2026: no ritmo com aporte crescente, os marcos seguem os degraus
    return { fracao: f, meses, data: somarMeses(mes, meses), aporte, aMais: r2(aporte - (calc.aporteAtual || 0)), comIsso: rm.frase, velocidadeMarcos: rm.velocidade };
  });
  return { origem, baseMeses, cenarios };
}

function mesesAte(calc, { atual, aporte, taxa }) {
  return prazoParaAlvo({ alvo: calc.alvoBRL, atual, aporte, taxa, entradas: calc.entradasFluxo });
}

/**
 * Dicas concretas pra acelerar (Tiago: "me dê projeções e dicas de como
 * acelerar isso"): cada uma com o número - quanto antecipa.
 * [{ id, texto, mesesAMenos }]
 */
export function dicasAcelerar(calc, meta = {}, { hoje } = {}) {
  if (!calc || calc.alvoBRL == null || calc.recorrente) return [];
  const atual = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL;
  if (atual >= calc.alvoBRL - 0.5) return [];
  const mes = mesDe(hoje || new Date());
  const taxa = calc.taxa || 0;
  const aporte = calc.aporteAtual || 0;
  const apBase = aporteDeCalc(calc); // 07/10/2026: número, ou função por mês quando o aporte cresce
  const m0 = mesesAte(calc, { atual, aporte: apBase, taxa });
  const dicas = [];
  const efeito = (m1) => {
    if (!Number.isFinite(m1)) return null;
    if (!Number.isFinite(m0)) return { texto: `você chega em ${rotuloMes(somarMeses(mes, Math.ceil(m1)))}`, mesesAMenos: Infinity };
    const ganho = Math.ceil(m0) - Math.ceil(m1);
    return ganho >= 1 ? { texto: `antecipa ${rotuloDuracao(ganho)} (${rotuloMes(somarMeses(mes, Math.ceil(m1)))} em vez de ${rotuloMes(somarMeses(mes, Math.ceil(m0)))})`, mesesAMenos: ganho } : null;
  };
  const extraMes = aporte > 0 ? arred(aporte * 0.1, 50) : arred(Math.max(100, (calc.aporteNecessario || 0) * 0.25), 50);
  const e1 = efeito(mesesAte(calc, { atual, aporte: somarAporte(apBase, extraMes), taxa }));
  if (e1) dicas.push({ id: 'aporte', texto: `Aportar ${formatBRL0(extraMes)} a mais por mês (${formatBRL0(aporte + extraMes)}) ${e1.texto}.`, mesesAMenos: e1.mesesAMenos, comIsso: resumoMarcos(calc, { hoje, aporte: aporte + extraMes }).frase });
  const unico = arred(Math.max(1000, aporte), 500);
  const e2 = efeito(mesesAte(calc, { atual: atual + unico, aporte: apBase, taxa }));
  if (e2) dicas.push({ id: 'unico', texto: `Um aporte extra de ${formatBRL0(unico)} agora (13º, restituição do IR, bônus) ${e2.texto}.`, mesesAMenos: e2.mesesAMenos, comIsso: resumoMarcos(calc, { hoje, atual: atual + unico }).frase });
  const rend = num(meta.rendimentoAnual) || 0;
  const e3 = efeito(mesesAte(calc, { atual, aporte: apBase, taxa: taxaMensal(rend + 0.01) }));
  if (e3 && meta.tipo !== 'reservaEmergencia') dicas.push({ id: 'rendimento', texto: `Render 1 ponto percentual a mais ao ano (${formatNumeroPt(Math.round((rend + 0.01) * 1000) / 10)}% em vez de ${formatNumeroPt((Math.round(rend * 1000) / 10))}%) - ex. tirar dinheiro parado da conta - ${e3.texto}.`, mesesAMenos: e3.mesesAMenos, comIsso: resumoMarcos(calc, { hoje, taxa: taxaMensal(rend + 0.01) }).frase });
  if (meta.tipo === 'rendaPassiva' && calc.renda && calc.renda.atual > 0) {
    const e4 = efeito(mesesAte(calc, { atual, aporte: somarAporte(apBase, calc.renda.atual), taxa }));
    if (e4) dicas.push({ id: 'reinvestir', texto: `Reinvestir todos os proventos (${formatBRL0(calc.renda.atual)}/mês hoje) somados ao aporte ${e4.texto} - a renda cresce sozinha (efeito bola de neve).`, mesesAMenos: e4.mesesAMenos, comIsso: resumoMarcos(calc, { hoje, aporte: aporte + calc.renda.atual }).frase });
  }
  if (calc.viagem) {
    Object.values(calc.viagem.porMoeda).filter((x) => x.moeda !== 'BRL' && x.faltaBRL > 0).forEach((x) => {
      dicas.push({ id: `cambio-${x.moeda}`, texto: `Faltam ${formatNumeroPt(x.falta, { maximumFractionDigits: 0 })} ${x.moeda}: cada 1% de alta do ${x.moeda} encarece a viagem em ${formatBRL0(x.faltaBRL * 0.01)}. Comprar um pouco por mês (preço médio) dilui esse risco.`, mesesAMenos: 0 });
    });
  }
  if (meta.tipo === 'reservaEmergencia' && calc.liquido && calc.liquido.impostoBRL > 0) {
    dicas.push({ id: 'imposto', texto: `${formatBRL0(calc.liquido.impostoBRL)} da reserva iriam para IR/IOF num resgate hoje. O IR cai com o tempo (15% depois de 2 anos): numa emergência, resgate primeiro os títulos mais antigos.`, mesesAMenos: 0 });
  }
  return dicas.sort((a, b) => (b.mesesAMenos || 0) - (a.mesesAMenos || 0));
}

/**
 * 05/10/2026 (Tiago: "nas simulações, sempre incluir 'com isso, sua meta de X
 * chega em tal ano, o 1º milhão em tal ano, o 2º...'"): frase a partir dos
 * marcos (marcosProjecao). Só faz sentido com alvo em milhões (>= R$ 1,5 mi:
 * os marcos são cada milhão); senão devolve ''.
 * "Com isso, sua meta de R$ 3.200.000 chega em mar/2041; o 1º milhão em 2029, o 2º em 2035, o 3º em 2040."
 */
export function fraseMarcos(marcos, { alvo = null } = {}) {
  const lista = marcos || [];
  const milhoes = lista.filter((m) => /º milhão$/.test(m.rotulo));
  const fim = lista.find((m) => m.rotulo === 'Alvo');
  if (!milhoes.length || !fim) return '';
  const meta = alvo != null ? alvo : fim.valor;
  const quando = fim.ja ? 'já está alcançada' : (fim.mes ? `chega em ${rotuloMes(fim.mes)}` : 'não chega em 60 anos');
  const partes = milhoes.map((m, i) => {
    const nome = i === 0 ? `o ${m.rotulo}` : `o ${m.rotulo.replace(/ milhão$/, '')}`;
    return `${nome} ${m.ja ? 'já foi' : (m.ano ? `em ${m.ano}` : 'não chega')}`;
  });
  return `Com isso, sua meta de ${formatBRL0(meta)} ${quando}; ${partes.join(', ')}.`;
}

/**
 * 05/10/2026: velocidade entre os marcos ("do 1º pro 2º milhão: 6 anos; do 2º
 * pro 3º: 4 anos e 2 meses - os juros compostos aceleram"). Pula o trecho que
 * começa num marco que já passou (não dá pra saber quando foi). '' sem 2 marcos.
 */
export function velocidadeEntreMarcos(marcos) {
  const lista = (marcos || []).filter((m) => m.meses != null);
  const ehMilhao = (m) => /º milhão$/.test(m.rotulo);
  const ord = (m) => m.rotulo.replace(/ milhão$/, '');
  const trechos = [];
  for (let i = 0; i + 1 < lista.length; i++) {
    const a = lista[i]; const b = lista[i + 1];
    if (a.ja || !ehMilhao(a)) continue;
    // a meta redonda (ex. R$ 3 mi) é o próprio "3º milhão"
    const redondo = b.rotulo === 'Alvo' && b.valor % 1e6 === 0;
    trechos.push({ n: b.meses - a.meses, entreMilhoes: ehMilhao(b) || redondo, de: ord(a), para: ehMilhao(b) ? ord(b) : (redondo ? `${b.valor / 1e6}º` : null) });
  }
  if (!trechos.length) return '';
  const txt = trechos.map((t, i) => `${t.entreMilhoes ? `do ${t.de} pro ${t.para}${i === 0 ? ' milhão' : ''}` : `do ${t.de} milhão à meta`}: ${rotuloDuracao(t.n)}`).join('; ');
  const completos = trechos.filter((t) => t.entreMilhoes);
  const primeiro = completos[0]; const ultimo = completos[completos.length - 1];
  const acelera = completos.length >= 2 && ultimo.n <= primeiro.n * 0.95 && primeiro.n - ultimo.n >= 3; // diferença de arredondamento não é aceleração
  return `${txt}${acelera ? ' - os juros compostos aceleram: cada milhão novo vem mais rápido' : ''}.`;
}

/**
 * 05/10/2026: { marcos, frase, velocidade } de uma simulação (aporte/atual/
 * taxa/alvo diferentes dos da meta). Vazio fora do modo "milhões".
 */
export function resumoMarcos(calc, opcoes = {}) {
  const alvo = opcoes.alvo != null ? opcoes.alvo : (calc && calc.alvoBRL);
  if (!calc || !(alvo >= 1.5e6) || calc.recorrente) return { marcos: [], frase: '', velocidade: '' };
  const marcos = marcosProjecao(calc, opcoes);
  return { marcos, frase: fraseMarcos(marcos, { alvo }), velocidade: velocidadeEntreMarcos(marcos) };
}

/**
 * "Se a renda fosse 10% a menos, 20% a menos, quanto você precisaria
 * juntar" (aposentadoria e renda passiva). [{ reducao, renda, montante,
 * economia, aporteNecessario, data, mesesAMenos }]
 */
export function cenariosRendaMenor(calc, { hoje, reducoes = [0.1, 0.2] } = {}) {
  if (!calc || !(calc.alvoBRL > 0)) return [];
  const renda = calc.aposentadoria ? calc.aposentadoria.renda : (calc.renda ? calc.renda.alvo : null);
  const atual = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL;
  const mes = mesDe(hoje || new Date());
  const ent = calc.entradasFluxo;
  const apCalc = aporteDeCalc(calc);
  const m0 = prazoParaAlvo({ alvo: calc.alvoBRL, atual, aporte: apCalc, taxa: calc.taxa || 0, entradas: ent });
  return reducoes.map((r) => {
    const montante = r2(calc.alvoBRL * (1 - r));
    const n = prazoParaAlvo({ alvo: montante, atual, aporte: apCalc, taxa: calc.taxa || 0, entradas: ent });
    return {
      reducao: r, renda: renda != null ? r2(renda * (1 - r)) : null, montante, economia: r2(calc.alvoBRL - montante),
      aporteNecessario: calc.mesesRestantes != null ? r2(aporteNecessario({ alvo: montante, atual, meses: Math.max(0, calc.mesesRestantes), taxa: calc.taxa || 0, entradas: ent }) || 0) : null,
      data: Number.isFinite(n) ? somarMeses(mes, Math.ceil(n)) : null,
      mesesAMenos: Number.isFinite(n) && Number.isFinite(m0) ? Math.ceil(m0) - Math.ceil(n) : null,
      // 05/10/2026: com o montante menor, quando cada milhão chega no seu ritmo
      comIsso: resumoMarcos(calc, { hoje, alvo: montante }).frase,
    };
  });
}

const pctTxt = (f, casas = 1) => `${f >= 0 ? '+' : '−'}${formatNumeroPt(Math.abs(f * 100), { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

function fecharAnalise(pontos) {
  const lista = pontos.filter(Boolean).slice(0, 5);
  if (!lista.length) return { tom: 'neutro', resumo: '', pontos: [] };
  const atencao = lista.filter((p) => p.tom === 'atencao').length;
  const bons = lista.filter((p) => p.tom === 'bom').length;
  const tom = atencao > bons ? 'atencao' : (bons > atencao ? 'bom' : 'neutro');
  const resumo = lista.slice(0, 2).map((p) => p.resumo).filter(Boolean).join(' · ');
  return { tom, resumo: resumo.charAt(0).toUpperCase() + resumo.slice(1), pontos: lista };
}

/**
 * Histórico (meses = [{ mes, valor, fluxo }], já recortado no período, o 1º é
 * a base). indices = [{ mes, cdi }] (nível do CDI no fim do mês).
 */
export function analisarHistoricoMeta({ meses = [], calc = null, indices = [] } = {}) {
  if (!meses || meses.length < 2) return { tom: 'neutro', resumo: '', pontos: [] };
  const a = meses[0]; const b = meses[meses.length - 1];
  const corpo = meses.slice(1);
  const aportes = corpo.reduce((s, x) => s + (x.fluxo || 0), 0);
  const delta = b.valor - a.valor;
  const ganho = delta - aportes;
  const pontos = [];
  pontos.push({
    tipo: 'crescimento', tom: delta >= 0 ? 'bom' : 'atencao', peso: 70,
    texto: `De ${rotuloMes(a.mes)} a ${rotuloMes(b.mes)} a meta foi de ${formatBRL0(a.valor)} para ${formatBRL0(b.valor)} (${delta >= 0 ? '+' : '−'}${formatBRL0(Math.abs(delta))}): ${formatBRL0(aportes)} vieram de aportes e ${ganho >= 0 ? '+' : '−'}${formatBRL0(Math.abs(ganho))} de rendimento/valorização.`,
    resumo: `${delta >= 0 ? '+' : '−'}${formatBRL0(Math.abs(delta))} no período (${formatBRL0(aportes)} de aportes)`,
  });
  // rendimento ponderado no tempo x CDI
  let f = 1;
  for (let i = 1; i < meses.length; i++) {
    const ant = meses[i - 1].valor;
    if (ant > 0) { let r = (meses[i].valor - (meses[i].fluxo || 0)) / ant - 1; if (r < -0.5 || r > 1) r = 0; f *= 1 + r; }
  }
  const mapaCdi = new Map((indices || []).map((x) => [x.mes, x.cdi]));
  const c0 = mapaCdi.get(a.mes); const c1 = mapaCdi.get(b.mes);
  if (meses.length >= 3) {
    const R = f - 1;
    const cdi = c0 > 0 && c1 > 0 ? c1 / c0 - 1 : null;
    pontos.push({
      tipo: 'rendimento', tom: cdi == null ? (R >= 0 ? 'neutro' : 'atencao') : (R >= cdi ? 'bom' : 'atencao'), peso: 60,
      texto: `Tirando os aportes, o dinheiro da meta rendeu ${pctTxt(R)} no período${cdi != null ? ` - o CDI rendeu ${pctTxt(cdi)} (${R >= cdi ? 'acima' : 'abaixo'} dele${R > 0 && cdi > 0.001 ? `, ${Math.round((R / cdi) * 100)}% do CDI` : ''})` : ''}.`,
      resumo: `rendeu ${pctTxt(R)}${cdi != null ? ` (CDI ${pctTxt(cdi)})` : ''}`,
    });
  }
  if (corpo.length >= 2) {
    const media = aportes / corpo.length;
    const ult3 = corpo.slice(-3);
    const media3 = ult3.reduce((s, x) => s + (x.fluxo || 0), 0) / ult3.length;
    const sem = corpo.filter((x) => (x.fluxo || 0) <= 1).length;
    let texto = `Aporte médio de ${formatBRL0(media)}/mês no período`;
    if (corpo.length > 4) texto += `; nos últimos 3 meses, ${formatBRL0(media3)}/mês (${media3 >= media * 1.1 ? 'acelerando' : media3 <= media * 0.9 ? 'desacelerando' : 'estável'})`;
    texto += sem ? `. ${sem} de ${corpo.length} meses sem aporte.` : '. Aportou em todos os meses.';
    let tom = 'neutro';
    if (calc && calc.aporteNecessario > 0) {
      const cobre = media / calc.aporteNecessario;
      texto += ` O necessário até o prazo é ${formatBRL0(calc.aporteNecessario)}/mês: a média do período cobre ${Math.round(cobre * 100)}%.`;
      tom = cobre >= 1 ? 'bom' : 'atencao';
    }
    pontos.push({ tipo: 'aportes', tom, peso: 65, texto, resumo: `aporte médio ${formatBRL0(media)}/mês` });
  }
  // maior queda (renda variável)
  let pico = 0; let pior = { dd: 0 };
  for (let i = 1; i < meses.length; i++) {
    if (meses[i].valor > meses[pico].valor) pico = i;
    const dd = meses[pico].valor > 0 ? 1 - (meses[i].valor - 0) / meses[pico].valor : 0;
    if (dd > pior.dd && (meses[i].fluxo || 0) >= 0) pior = { dd, pico, vale: i };
  }
  if (pior.dd >= 0.05) {
    pontos.push({ tipo: 'queda', tom: 'atencao', peso: 50, texto: `Maior queda no período: −${Math.round(pior.dd * 100)}% (de ${rotuloMes(meses[pior.pico].mes)} a ${rotuloMes(meses[pior.vale].mes)}) - oscilação de renda variável ou resgate.`, resumo: `queda de −${Math.round(pior.dd * 100)}% no caminho` });
  }
  return fecharAnalise(pontos);
}

/** Projeção (pontos de serieProjecao). */
export function analisarProjecaoMeta(calc, { pontos = [], marcos = [], hoje } = {}) {
  if (!calc || calc.alvoBRL == null || pontos.length < 2) return { tom: 'neutro', resumo: '', pontos: [] };
  const mes = mesDe(hoje || new Date());
  const out = [];
  if (Number.isFinite(calc.mesesEstimados) && calc.mesesEstimados > 0) {
    const chega = somarMeses(mes, Math.ceil(calc.mesesEstimados));
    let texto = `No seu ritmo (${formatBRL0(calc.aporteAtual)}/mês${calc.aporteOrigem === 'historico' ? ', o aporte real dos últimos 12 meses' : ''}) você chega no alvo em ${rotuloMes(chega)} (${rotuloDuracao(calc.mesesEstimados)})`;
    let tom = 'neutro';
    if (calc.mesesRestantes != null) {
      const dif = Math.ceil(calc.mesesEstimados) - calc.mesesRestantes;
      texto += dif <= 0 ? ` - ${rotuloDuracao(-dif)} antes do prazo.` : ` - ${rotuloDuracao(dif)} depois do prazo (${rotuloMes(calc.dataAlvo)}).`;
      tom = dif <= 0 ? 'bom' : 'atencao';
    } else texto += '.';
    out.push({ tipo: 'ritmo', tom, peso: 80, texto, resumo: `no ritmo: ${rotuloMes(chega)}` });
  } else if (calc.atualRitmo < calc.alvoBRL && calc.ritmoSemAporte) {
    out.push({ tipo: 'ritmo', tom: 'atencao', peso: 80, texto: `Nos últimos meses você não aportou nessa meta (ritmo médio ${formatBRL0(calc.aporteReal)}/mês) - sem aporte, só o rendimento não leva ao alvo. Informe um aporte em Editar ou veja o aporte necessário.`, resumo: 'sem aporte recente' });
  } else if (calc.atualRitmo < calc.alvoBRL) {
    out.push({ tipo: 'ritmo', tom: 'atencao', peso: 80, texto: 'No ritmo de hoje (sem aporte e sem rendimento suficiente) a meta não chega no alvo - informe um aporte ou vincule os investimentos.', resumo: 'sem ritmo pra chegar' });
  }
  if (calc.aporteNecessario > 0 && calc.mesesRestantes > 0) {
    const n = calc.mesesRestantes;
    const aportes = calc.aporteNecessario * n;
    const rend = Math.max(0, calc.alvoBRL - (calc.atualRitmo || 0) - aportes - (calc.entradasTotal || 0));
    const gap = calc.aporteNecessario - (calc.aporteAtual || 0);
    const fraseNec = resumoMarcos(calc, { hoje, aporte: calc.aporteNecessario }).frase; // 05/10/2026
    out.push({
      tipo: 'composicao', tom: gap > 0.5 ? 'atencao' : 'bom', peso: 70,
      texto: `Para fechar em ${rotuloMes(calc.dataAlvo)}: ${formatBRL0(calc.aporteNecessario)}/mês${gap > 0.5 ? ` (${formatBRL0(gap)} a mais que hoje)` : ' (você já aporta isso)'}. Desse caminho, ${formatBRL0(aportes)} seriam aportes${calc.entradasTotal > 0 ? `, ${formatBRL0(calc.entradasTotal)} entradas programadas (13º, FGTS...)` : ''} e ${formatBRL0(rend)} rendimento (${Math.round((rend / Math.max(1, calc.alvoBRL - (calc.atualRitmo || 0))) * 100)}% do que falta).${fraseNec ? ` ${fraseNec}` : ''}`,
      resumo: gap > 0.5 ? `faltam ${formatBRL0(gap)}/mês pro prazo` : 'aporte cobre o prazo',
    });
  }
  const proximos = (marcos || []).filter((m) => !m.ja && m.mes);
  if (proximos.length) {
    // 05/10/2026: a velocidade entre os marcos (1º pro 2º milhão...) entra na explicação
    const vel = velocidadeEntreMarcos(marcos);
    out.push({ tipo: 'marcos', tom: 'neutro', peso: 55, texto: `Marcos no seu ritmo: ${proximos.slice(0, 4).map((m) => `${m.rotulo} em ${rotuloMes(m.mes)}${m.idade ? ` (${m.idade} anos)` : ''}`).join('; ')}.${vel ? ` Velocidade: ${vel}` : ''}`, resumo: `${proximos[0].rotulo} em ${proximos[0].ano}` });
  }
  return fecharAnalise(out);
}

/** Renda passiva mês a mês (renda = [{ mes, valor }], recortada; o mês atual é parcial). */
export function analisarRendaMensal(renda = [], calc = null, { hoje } = {}) {
  const ultimoFechado = ultimoMesFechadoMetas(hoje || new Date()); // 06/10/2026: o mês de hoje conta no seu último dia
  const fechados = (renda || []).filter((x) => x.mes <= ultimoFechado);
  if (fechados.length < 2) return { tom: 'neutro', resumo: '', pontos: [] };
  const ult12 = fechados.slice(-12);
  const media12 = ult12.reduce((s, x) => s + x.valor, 0) / ult12.length;
  const out = [];
  const alvo = calc && calc.renda ? calc.renda.alvo : null;
  out.push({
    tipo: 'media', tom: alvo ? (media12 >= alvo ? 'bom' : 'neutro') : 'neutro', peso: 70,
    texto: `Média dos últimos ${ult12.length} meses: ${formatBRL0(media12)}/mês${alvo ? ` - ${Math.round((media12 / alvo) * 100)}% da meta de ${formatBRL0(alvo)}/mês` : ''}.`,
    resumo: `média ${formatBRL0(media12)}/mês`,
  });
  const ant = fechados.slice(-24, -12);
  if (ant.length >= 6) {
    const mediaAnt = ant.reduce((s, x) => s + x.valor, 0) / ant.length;
    if (mediaAnt > 0) {
      const cresc = media12 / mediaAnt - 1;
      out.push({ tipo: 'crescimento', tom: cresc >= 0 ? 'bom' : 'atencao', peso: 65, texto: `A renda média dos últimos 12 meses ${cresc >= 0 ? 'cresceu' : 'caiu'} ${pctTxt(cresc).replace(/^[+−]/, '')} em relação aos 12 anteriores (${formatBRL0(mediaAnt)}/mês).`, resumo: `${pctTxt(cresc)} em 12 meses` });
    }
  }
  const melhor = ult12.reduce((m, x) => (x.valor > m.valor ? x : m), ult12[0]);
  const pior = ult12.reduce((m, x) => (x.valor < m.valor ? x : m), ult12[0]);
  if (melhor.valor > 0) out.push({ tipo: 'variacao', tom: 'neutro', peso: 45, texto: `Melhor mês: ${rotuloMes(melhor.mes)} (${formatBRL0(melhor.valor)}); mais fraco: ${rotuloMes(pior.mes)} (${formatBRL0(pior.valor)}) - ações pagam concentrado em alguns meses, FIIs todo mês.`, resumo: '' });
  const ult3 = fechados.slice(-3);
  if (fechados.length >= 6) {
    const m3 = ult3.reduce((s, x) => s + x.valor, 0) / ult3.length;
    const t = m3 / media12 - 1;
    if (Math.abs(t) >= 0.1) out.push({ tipo: 'tendencia', tom: t > 0 ? 'bom' : 'atencao', peso: 55, texto: `Últimos 3 meses: ${formatBRL0(m3)}/mês, ${pctTxt(t).replace(/^[+−]/, '')} ${t > 0 ? 'acima' : 'abaixo'} da média de 12 meses.`, resumo: `${t > 0 ? 'acelerando' : 'mais fraca'} nos últimos 3 meses` });
  }
  return fecharAnalise(out);
}
