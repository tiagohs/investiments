/**
 * organizacao-patrimonio.js - 27/09/2026: aba "Patrimônio" da Organização
 * Financeira (organizacao/despesas.html#patrimonio).
 *
 * Tiago: "Qual meu patrimônio total? ... quanto de fato eu tenho ... meu
 * histórico ... minha meta futura de patrimônio pra aposentadoria ... no meu
 * ritmo atual quanto tempo levaria ... dicas, ajuste; use gráficos, tabelas,
 * heróis".
 *
 *  - Herói: patrimônio líquido = o que tem − o que deve.
 *  - Balanço: investimentos (do site), reserva, apê (índices ou valor
 *    digitado), FGTS, outros bens | financiamento, FIES (saldo andando
 *    sozinho mês a mês), outras dívidas. Quanto do apê já é seu.
 *  - Histórico (31/12 de cada ano, pelo IR) com filtro de período e o card
 *    de análise + de onde veio o crescimento (também com filtro).
 *  - Patrimônio vs. inflação (patrimonio-inflacao.js).
 *  - Aposentadoria: a meta SEM as parcelas das dívidas, explicada; ritmo x
 *    meta; projeção com marcos; "Como acelerar".
 *  - Documentos: PDFs lidos no navegador (patrimonio-import.js) - só o que a
 *    tela usa vai pra planilha (Patrimonio.gs, aba aux_patrimonio).
 * 03/10/2026 (Tiago: "Patrimônio: mover a área de simulação de pagamento das
 * dívidas para Gastos e Despesas; só deixe aqui simulações que façam sentido
 * relacionadas ao tema patrimônio" e "Carreira e FGTS (que estão em
 * Patrimônio) ... pra Renda e Orçamentos"): o simulador amortizar × investir
 * agora é organizacao-simulador.js (aba Simulações desde 03/10/2026) e Carreira/FGTS
 * são desenhados por montarCarreiraFgts (aba Renda e Orçamentos). Ficam aqui
 * as simulações de patrimônio: projeção da aposentadoria e Coast FI.
 * Contas em patrimonio-calc.js; gráficos em patrimonio-graficos.js.
 */
import { getPatrimonio, salvarPatrimonio, getArquivosIrPatrimonio, getArquivoIrPatrimonio } from '../api-client.js';
import { formatBRL, formatNumeroBR, formatDMA, formatPct } from '../format.js';
import { carregarPdfJs, extrairLinhasPdf } from './holerite.js';
import { lerValorBR } from './organizacao-calc.js';
import { ligarFiltroPeriodo, rotuloPeriodo } from '../periodo-personalizado.js'; // 05/10/2026 (A-67): rótulos canônicos
import { analisarSerie, renderAnalise } from '../analise-grafico.js';
import { montarPatrimonioVsInflacao, seriesReais } from './patrimonio-inflacao.js';
import {
  identificarDocumento, lerDeclaracaoIr, lerExtratoFgts, lerCtps, lerExtratoCaixaHabitacao, lerExtratoFies, contaFgtsParaSalvar, GRUPOS_IR, MOTIVOS_SAQUE_FGTS,
} from './patrimonio-import.js';
import {
  mesDe, somarMeses, difMeses, balanco, historicoAnual, metaAposentadoria, aporteMedio, projetarAposentadoria, coastFi, idadeEm,
  liberacoesDividas, resumoFgts, projetarFgts, linhaSalarios, salarioEm, crescimentoSalario, origemCrescimento, parametrosDivida,
  amortizarOuInvestir, cronogramaDivida, saldoFinanciamento, extrasFinanciamento, financiamentoEfetivo, mesesRestantesFinanciamento, mesesRestantesFies,
  valorImovel, METODOS_IMOVEL, projetarFgtsMensal,
} from './patrimonio-calc.js';
import { opcoesHistoricoPatrimonio, opcoesProjecaoPatrimonio, opcoesSalarios, barrasDivergentes, montarBarrasDivergentes, mil, brl0, mesAno } from './patrimonio-graficos.js';
import { montarGrafico, limparGrafico } from './metas-graficos.js'; // 06/10/2026 (Onda 3): gerenciador de gráficos da biblioteca (cria e morfa)
import { mostrarErroCarga } from '../ui/index.js';
import { compAttr, montarComposicoes, kpiHtml, chipHtml, tornarRecolhiveis } from './organizacao-ui.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único


const num = (v) => typeof v === 'number' && Number.isFinite(v);
const dataBR = (iso) => formatDMA(iso, '') || (/^\d{4}-\d{2}$/.test(String(iso || '')) ? mesAno(iso) : '');
const anosTxt = (a) => (a == null ? '—' : `${formatNumeroBR(Math.abs(a), Math.abs(a) < 10 ? 1 : 0)} ${Math.abs(a) >= 2 || Math.abs(a) < 1 ? 'anos' : 'ano'}`);
const mesesTxt = (m) => (m == null ? '—' : m >= 24 ? `${formatNumeroBR(m / 12, 1)} anos` : `${m} ${m === 1 ? 'mês' : 'meses'}`);
const numCampo = (v, casas = 2) => (num(v) ? formatNumeroBR(v, casas) : '');

export const PREFS_PADRAO = {
  incluirReservaNaAposentadoria: false, parcelasViramAporte: true, descontar: null, taxaSaque: null, rendimentoReal: null,
  aporteModo: 'ritmo', aporteManual: null, idadeAlvo: 60, nascimento: null,
};

const NOMES_DOC = { ir: 'Declaração do IR', fgts: 'Extrato do FGTS', ctps: 'Carteira de Trabalho', caixa: 'Financiamento (Caixa)', fies: 'FIES (Banco do Brasil)' };

// ---------------------------------------------------------------------------
// Tudo que a tela mostra, calculado de uma vez
// ---------------------------------------------------------------------------

export function contextoPatrimonio(d, prefs = {}) {
  const cfg = d.config || {};
  const p = { ...PREFS_PADRAO, ...(cfg.preferencias || {}), ...prefs };
  const b = balanco(d);
  const hist = historicoAnual(d);
  const meta = metaAposentadoria(d, { descontar: p.descontar, taxaSaque: p.taxaSaque });
  const rendimento = num(p.rendimentoReal) ? p.rendimentoReal : meta.rendimento;
  const alvo = meta.patrimonioSem;
  const inv = d.investimentos || {};
  const inicial = (inv.longoPrazo || 0) + (p.incluirReservaNaAposentadoria ? inv.reserva || 0 : 0);
  const ritmo = aporteMedio(d.historicoMensal, d.hoje, 12);
  const aporteMeta = d.metas && num(d.metas.aporteMeta) ? d.metas.aporteMeta : null;
  let aporte;
  if (p.aporteModo === 'meta' && num(aporteMeta)) aporte = aporteMeta;
  else if (p.aporteModo === 'manual' && num(p.aporteManual)) aporte = p.aporteManual;
  else aporte = num(ritmo) ? ritmo : (aporteMeta || 0);
  const libs = liberacoesDividas(d, meta);
  const liberacoes = p.parcelasViramAporte ? libs : [];
  const proj = projetarAposentadoria({ inicial, aporte, rendimentoReal: rendimento, alvo, liberacoes });
  const nasc = p.nascimento || (cfg.carreira && cfg.carreira.nascimento) || null;
  const idadeHoje = idadeEm(nasc, d.hoje);
  const anosAteAlvo = idadeHoje != null ? p.idadeAlvo - idadeHoje : null;
  const coast = anosAteAlvo > 0 ? coastFi(alvo, rendimento, anosAteAlvo) : null;
  const mes0 = Number(String(d.hoje).slice(5, 7)) - 1;
  const quando = (m) => {
    if (m == null) return { rotulo: 'não chega', ano: '—', idade: null, mes0 };
    const mes = somarMeses(d.hoje, m);
    return { rotulo: mesAno(mes), ano: Number(mes.slice(0, 4)), idade: idadeHoje != null ? Math.floor(idadeHoje + m / 12) : null, mes0, mes };
  };
  return {
    d, cfg, p, b, hist, meta, rendimento, alvo, inicial, ritmo, aporteMeta, aporte, libs, liberacoes, proj,
    nasc, idadeHoje, anosAteAlvo, coast, quando,
    fgts: resumoFgts(cfg.fgts, d.hoje, { nascimento: nasc, depositoMensal: num(salarioEm(cfg.carreira, d.hoje)) ? salarioEm(cfg.carreira, d.hoje) * 0.08 : null }),
    origem: origemCrescimento(d, 12),
  };
}

/** Quanto cada ajuste antecipa (ou atrasa) a chegada na meta - os cards de "Como acelerar". */
export function dicasAcelerar(ctx) {
  const { d, cfg, p, meta, rendimento, alvo, inicial, aporte, liberacoes, proj, libs } = ctx;
  const base = proj.chegou;
  const rodar = (o = {}) => projetarAposentadoria({ inicial, aporte, rendimentoReal: rendimento, alvo, liberacoes, ...o }).chegou;
  const ganho = (outro) => (base != null && outro != null ? (base - outro) / 12 : null);
  const dicas = [];
  const g500 = ganho(rodar({ aporte: aporte + 500 }));
  dicas.push({
    id: 'aporte', titulo: 'Aporte', destaque: true,
    html: `<b>+R$ 500 por mês</b> antecipa <b>${esc(anosTxt(g500))}</b>.${num(ctx.aporteMeta) && num(ctx.ritmo) ? ` Sua meta de aporte (${esc(brl0(ctx.aporteMeta))}) está ${ctx.aporteMeta >= ctx.ritmo ? `<b>${esc(brl0(ctx.aporteMeta - ctx.ritmo))} acima</b>` : `${esc(brl0(ctx.ritmo - ctx.aporteMeta))} abaixo`} do que você aportou em média nos últimos 12 meses no longo prazo (${esc(brl0(ctx.ritmo))}).` : ''}`,
  });
  const cresc = crescimentoSalario(cfg.carreira, d.hoje, 5);
  const g3 = ganho(rodar({ crescimentoAporte: 0.03 }));
  dicas.push({
    id: 'aumentos', titulo: 'Aumentos de salário', destaque: false,
    html: `${cresc ? `Seu salário cresceu <b>${esc(formatPct(cresc.taxa, 1))} ao ano</b> nos últimos ${cresc.anos} anos. ` : ''}Se o aporte subir junto, <b>3% acima da inflação</b> por ano, você chega <b>${esc(anosTxt(g3))} antes</b>. Regra simples: metade de cada aumento vai pro aporte.`,
  });
  const g1 = ganho(rodar({ rendimentoReal: rendimento + 0.01 }));
  dicas.push({
    id: 'rendimento', titulo: 'Rendimento', destaque: false,
    html: `<b>+1 ponto</b> de rendimento real ao ano antecipa <b>${esc(anosTxt(g1))}</b>. É onde pesam taxas, dinheiro parado em conta e quanto de IPCA+ alto você consegue travar.`,
  });
  if (libs.length) {
    const sem = projetarAposentadoria({ inicial, aporte, rendimentoReal: rendimento, alvo, liberacoes: [] }).chegou;
    const com = projetarAposentadoria({ inicial, aporte, rendimentoReal: rendimento, alvo, liberacoes: libs }).chegou;
    const dif = sem != null && com != null ? (sem - com) / 12 : null;
    dicas.push({
      id: 'parcelas', titulo: 'Parcelas que viram aporte', destaque: !p.parcelasViramAporte,
      html: `${libs.map((l) => `${esc(l.nome.replace(' quitado', ''))} acaba em <b>${esc(mesAno(somarMeses(d.hoje, l.mes)))}</b>${l.usosFgts && l.usosFgts.length ? ` (com o FGTS amortizando no prazo a cada 2 anos: ${esc(String(l.usosFgts.length))} ${l.usosFgts.length === 1 ? 'uso' : 'usos'}, ${esc(mesesTxt(l.semFgts - l.mes))} antes)` : ''} e libera <b>${esc(brl0(l.valor))}/mês</b>`).join('; ')}. Continuar investindo esse valor ${p.parcelasViramAporte ? 'já está na conta e ' : ''}antecipa <b>${esc(anosTxt(dif))}</b>${p.parcelasViramAporte ? '' : ' - ligue "as parcelas viram aporte" pra ver'}.`,
    });
  }
  // FGTS no financiamento a cada 2 anos (descontando os saques-aniversário do caminho)
  const fg = ctx.fgts;
  const temFin = cfg.financiamento && num(cfg.financiamento.saldo);
  const par = temFin ? parametrosDivida('financiamento', financiamentoEfetivo(cfg), d.hoje) : null;
  const efeitoAmortizar = (valor, mesAlvo) => {
    const faltam = Math.max(0, difMeses(d.hoje, mesAlvo));
    const finEf = financiamentoEfetivo(cfg);
    const saldoLa = saldoFinanciamento(finEf, mesAlvo, extrasFinanciamento(finEf, cfg.fgts));
    const mesesLa = Math.max(1, (par.meses || 0) - faltam);
    const base2 = cronogramaDivida({ ...par, saldo: saldoLa, meses: mesesLa });
    const com2 = cronogramaDivida({ ...par, saldo: saldoLa, meses: mesesLa, extras: { 0: valor } });
    return { meses: base2.length - com2.length, juros: base2.reduce((s, l) => s + l.juros, 0) - com2.reduce((s, l) => s + l.juros, 0) };
  };
  if (fg && temFin) {
    const mesProx = fg.proximaAmortizacao < mesDe(d.hoje) ? mesDe(d.hoje) : fg.proximaAmortizacao;
    const salario = salarioEm(cfg.carreira, d.hoje);
    const deposito = num(salario) ? salario * 0.08 : 0;
    const aniv = fg.aniversario || {};
    const base = fg.contaAtiva && fg.contaAtiva.dataSaldo ? mesDe(fg.contaAtiva.dataSaldo) : mesDe(d.hoje);
    const proj = projetarFgtsMensal(fg.saldo, deposito, base, mesProx, { mesAniversario: aniv.ativo ? aniv.mesAniversario : null });
    const ef = efeitoAmortizar(proj.saldo, mesProx);
    const saiu = proj.saques.reduce((s, x) => s + x.valor, 0);
    dicas.push({
      id: 'fgts', titulo: 'FGTS no financiamento', destaque: true,
      html: `A Caixa libera o FGTS pra amortizar a cada 2 anos. ${fg.ultimoUsoMoradia ? `O último uso foi em ${esc(mesAno(mesDe(fg.ultimoUsoMoradia.data)))}, então o próximo é` : 'O próximo pode ser'} em <b>${esc(mesAno(mesProx))}</b>, com uns <b>${esc(mil(proj.saldo))}</b> (8% do salário por mês + juros${proj.saques.length ? `, já descontando ${proj.saques.length} ${proj.saques.length === 1 ? 'saque-aniversário' : 'saques-aniversário'} no caminho, ~${esc(mil(saiu))}` : ''}). Amortizando no prazo (a Caixa recalcula o prazo e a prestação não sobe), isso tira <b>${esc(mesesTxt(ef.meses))}</b> do financiamento e <b>${esc(mil(ef.juros))} de juros</b>. Parado, o FGTS rende ~3% + TR (+ a distribuição de lucro); o financiamento custa ${esc(formatPct(cfg.financiamento.taxaAnual, 2))} + TR.`,
    });
  }
  const aniv = fg && fg.aniversario;
  if (aniv && aniv.ativo && aniv.proximo) {
    const hoje = aniv.comSaldoDeHoje;
    const est = aniv.estimado;
    const valor = est ? est.valor : hoje.valor;
    const ef = temFin ? efeitoAmortizar(valor, aniv.proximo) : null;
    const faixa = (x) => `${formatNumeroBR(x.aliquota * 100, 0)}% do saldo + ${formatBRL(x.adicional)}`;
    const mudaFaixa = est && est.aliquota !== hoje.aliquota;
    dicas.push({
      id: 'aniversario', titulo: 'Saque-aniversário', destaque: true,
      html: `Cai em <b>${esc(mesAno(aniv.proximo))}</b> (do 1º dia útil até o fim de ${esc(mesAno(aniv.ate))}). Com o saldo de hoje (${esc(formatBRL(hoje.saldo))}) dá <b>${esc(formatBRL(hoje.valor))}</b> (${esc(faixa(hoje))}) - é o que o app do FGTS simula. Mas o valor é calculado com o saldo do dia do saque${est ? `: com os depósitos e o juro que entram até lá, o saldo vai a ~${esc(brl0(est.saldo))}${mudaFaixa ? ', passa pra faixa de cima' : ''} e o saque fica em <b>~${esc(brl0(est.valor))}</b> (${esc(faixa(est))})` : ''}. ${ef ? `Mande direto pro financiamento como amortização extra (com dinheiro não tem a espera de 2 anos): tira <b>${esc(mesesTxt(ef.meses))}</b> e <b>${esc(mil(ef.juros))} de juros</b>.` : 'Invista ou amortize - não deixe na conta.'} <b>Não antecipe</b> (os bancos cobram ~1,3% ao mês). O preço dessa modalidade: numa demissão sem justa causa você saca só a multa de 40%, o saldo fica preso (pra moradia continua valendo), e voltar pro saque-rescisão leva 25 meses. Com a sua reserva de ${esc(num(d.investimentos && d.investimentos.reserva) && d.despesas && d.despesas.totalComFolga ? formatNumeroBR(d.investimentos.reserva / d.despesas.totalComFolga, 1) : '?')} meses e o FGTS indo pro apê de qualquer jeito, ficar vale a pena - desde que o dinheiro vá pro financiamento.`,
    });
  }
  // amortizar ou investir: dívidas
  const cdiLiq = num(d.cdi) ? d.cdi * 0.85 : null;
  if (cfg.fies && num(cfg.fies.saldo) && num(cfg.fies.taxaMensal)) {
    const taxaAno = (1 + cfg.fies.taxaMensal) ** 12 - 1;
    dicas.push({
      id: 'fies', titulo: 'FIES: não precisa antecipar', destaque: false,
      html: `O FIES custa <b>~${esc(formatPct(taxaAno, 1))} ao ano</b>${cdiLiq ? `, bem menos que o CDI líquido de hoje (~${esc(formatPct(cdiLiq, 1))})` : ''}: investir o dinheiro rende mais do que quitar antes. Deixe ele terminar no prazo (${esc(mesAno(cfg.fies.fim || ''))}).`,
    });
  }
  if (cfg.financiamento && num(cfg.financiamento.saldo)) {
    const r = amortizarOuInvestir(parametrosDivida('financiamento', financiamentoEfetivo(cfg), d.hoje), { valor: 10000, rendimentoAnual: cdiLiq || 0.1 });
    if (r && r.taxaEmpate) {
      dicas.push({
        id: 'amortizar', titulo: 'Financiamento: amortizar ou investir?', destaque: false,
        html: `Amortizar o apê só perde pra investir se o investimento render mais que <b>~${esc(formatPct(r.taxaEmpate, 1))} líquido ao ano</b>${cdiLiq ? ` (o CDI líquido está em ~${esc(formatPct(cdiLiq, 1))})` : ''}. R$ 10 mil a mais hoje tiram ${esc(mesesTxt(r.mesesAMenos))} e <b>${esc(mil(r.jurosEconomizados))} de juros</b>. <a href="#simulador" class="pt-link">Simule na aba Simulações ›</a>`,
      });
    }
  }
  const alvo4 = (meta.rendaSem * 12) / 0.04;
  const c4 = rodar({ alvo: alvo4 });
  dicas.push({
    id: 'saque', titulo: 'Quanto sacar por ano', destaque: false,
    html: `A meta usa <b>${esc(formatPct(meta.taxa, 0))} ao ano</b> (o rendimento da aba Distribuição e Metas da planilha). A regra mais usada pra o dinheiro não acabar é <b>4%</b>: a meta vira ${esc(mil(alvo4))}${base != null && c4 != null ? `, ${esc(anosTxt((c4 - base) / 12))} a mais` : ''}. 5% é um meio-termo comum com renda fixa brasileira (IPCA+). Isso vai pra tela de Metas.`,
  });
  if (num(ctx.coast)) {
    dicas.push({
      id: 'coast', titulo: 'Coast FI', destaque: false,
      html: `Com <b>${esc(mil(ctx.coast))}</b> investidos você já poderia parar de aportar e ainda chegar na meta aos ${esc(p.idadeAlvo)} (só com o rendimento). Hoje você tem <b>${esc(formatPct(inicial / ctx.coast, 0))}</b> disso.`,
    });
  }
  const inv = d.investimentos || {};
  const metaRes = d.metas && d.metas.reservaMeta;
  if (num(inv.reserva) && num(metaRes) && inv.reserva > metaRes * 1.05) {
    const exc = inv.reserva - metaRes;
    const gr = ganho(rodar({ inicial: inicial + exc }));
    dicas.push({
      id: 'reserva', titulo: 'Reserva acima da meta', destaque: true,
      html: `A reserva (${esc(mil(inv.reserva))}) está <b>${esc(mil(exc))} acima da meta</b> (${esc(mil(metaRes))}). Esse excedente no longo prazo antecipa <b>${esc(anosTxt(gr))}</b>.`,
    });
  }
  return dicas;
}

// ---------------------------------------------------------------------------
// Blocos (HTML)
// ---------------------------------------------------------------------------

export function htmlHero(ctx) {
  const { b, hist } = ctx;
  const ultimoAno = hist.filter((l) => !l.hoje).pop();
  const primeiro = hist[0];
  const delta = ultimoAno ? b.liquido - ultimoAno.liquido : null;
  const partes = [
    ...b.ativos.map((a) => ({ nome: a.nome, valor: a.valor, cor: a.id === 'imovel' ? 'var(--pt-imo)' : a.id === 'fgts' ? 'var(--pt-fgts)' : a.outro ? 'var(--pt-out)' : 'var(--pt-inv)' })),
    ...b.dividas.map((a) => ({ nome: a.nome, valor: a.valor, cor: a.id === 'fies' || a.outro ? 'var(--pt-div2)' : 'var(--pt-div1)' })),
  ].filter((x) => x.valor > 0);
  const legenda = [
    { nome: 'Investimentos e reserva', cor: 'var(--pt-inv)', valor: b.ativos.filter((a) => a.id === 'investimentos' || a.id === 'reserva').reduce((s, a) => s + a.valor, 0) },
    ...b.ativos.filter((a) => a.id === 'imovel' || a.id === 'fgts').map((a) => ({ nome: a.nome, cor: a.id === 'imovel' ? 'var(--pt-imo)' : 'var(--pt-fgts)', valor: a.valor })),
    ...(b.ativos.some((a) => a.outro) ? [{ nome: 'Outros bens', cor: 'var(--pt-out)', valor: b.ativos.filter((a) => a.outro).reduce((s, a) => s + a.valor, 0) }] : []),
    ...b.dividas.map((a) => ({ nome: a.nome, cor: a.id === 'fies' || a.outro ? 'var(--pt-div2)' : 'var(--pt-div1)', valor: -a.valor })),
  ].filter((x) => x.valor);
  const deltaChip = num(delta) ? chipHtml(delta >= 0 ? 'good' : 'bad', `${delta >= 0 ? '+' : '−'}${esc(mil(Math.abs(delta)).replace('−', ''))} desde dez/${esc(ultimoAno.ano)}`, delta >= 0 ? 'north-east' : 'south-east') : '';
  const era = primeiro && !primeiro.hoje ? `Era <b>${esc(mil(primeiro.liquido))}</b> no fim de ${esc(primeiro.ano)}.` : '';
  return `<div class="grid-kpi pt-kpis">
    ${kpiHtml({ classe: 'pt-kpi-liq', rotulo: 'Patrimônio líquido hoje', valorHtml: esc(mil(b.liquido)), extraHtml: deltaChip ? `<div class="pt-kpi-chip">${deltaChip}</div>` : '', subHtml: era })}
    ${kpiHtml({ rotulo: 'Tudo que você tem', valorHtml: esc(mil(b.totalAtivos)) })}
    ${kpiHtml({ rotulo: 'Tudo que você deve', valorHtml: esc(mil(b.totalDividas)) })}
    ${kpiHtml({ rotulo: 'É seu de verdade', valorHtml: esc(mil(b.liquido)), subHtml: `${esc(formatPct(b.totalAtivos ? b.liquido / b.totalAtivos : null, 0))} do que você tem` })}
  </div>
  <div class="card pt-pad pt-composicao">
    <div class="pt-barra-bal" ${compAttr(partes.map((x, i) => ({ ...x, id: `p${i}` })))}></div>
    <div class="pt-leg">${legenda.map((x) => `<span><span class="pt-leg-cor" style="--cor:${x.cor}"></span>${esc(x.nome)} <b>${esc(mil(x.valor))}</b></span>`).join('')}</div>
  </div>`;
}

const pillEditar = (acao, rot = 'editar') => `<button type="button" class="pt-mini" data-acao="${esc(acao)}">${esc(rot)}</button>`;
const pillFalta = (acao, rot = 'informar') => `<button type="button" class="pt-mini falta" data-acao="${esc(acao)}">${esc(rot)}</button>`;
function linhaBal({ cor, nome, sub, valor, vsub = '', acao = '' }) {
  return `<div class="pt-linha"><i style="background:${cor}"></i><span class="pt-linha-n"><b>${esc(nome)}${acao}</b><small>${sub}</small></span><span class="pt-linha-v">${valor}${vsub ? `<small>${vsub}</small>` : ''}</span></div>`;
}

/** 05/10/2026 (A-07): sem a data de início do financiamento o histórico é estimado - a tela diz isso. */
function avisoInicioFinanciamento(cfg) {
  const f = cfg && cfg.financiamento;
  if (!f || f.dataInicio) return '';
  const compra = cfg.imovel && cfg.imovel.dataCompra;
  return compra ? ` · ⚠ sem data de início do financiamento: histórico estimado desde a compra do apê (${mesAno(compra)})` : ' · ⚠ sem data de início do financiamento: o histórico da dívida é só uma estimativa (edite e informe o mês)';
}

export function htmlBalanco(ctx) {
  const { d, cfg, b } = ctx;
  const inv = d.investimentos || {};
  const pc = inv.porClasse || {};
  const achar = (id) => [...b.ativos, ...b.dividas].find((a) => a.id === id);
  const custo = d.despesas && d.despesas.totalComFolga;
  const ativos = [];
  if (num(inv.longoPrazo)) {
    const classes = [['Ações', pc.acoes], ['FIIs', pc.fiis], ['EUA', pc.acoesEua], ['RF', pc.rendaFixaLongoPrazo]].filter(([, v]) => num(v) && v > 0);
    ativos.push(linhaBal({ cor: 'var(--pt-inv)', nome: 'Investimentos', sub: esc(classes.map(([n, v]) => `${n} ${mil(v)}`).join(' · ')), valor: esc(brl0(inv.longoPrazo)), vsub: 'longo prazo, do site' }));
  }
  if (num(inv.reserva)) ativos.push(linhaBal({ cor: 'var(--pt-inv)', nome: 'Reserva de emergência', sub: num(custo) && custo > 0 ? `cobre ${esc(formatNumeroBR(inv.reserva / custo, 1))} meses do custo de vida` : 'renda fixa marcada como reserva', valor: esc(brl0(inv.reserva)), vsub: 'do site' }));
  const imo = achar('imovel');
  if (imo) {
    const v = imo.imovel;
    const origem = v.metodo === 'manual' ? 'valor que você informou' : v.metodo === 'compra' ? 'valor de compra (sem índice)' : `${METODOS_IMOVEL[v.metodo]} · ${v.valorizacao >= 0 ? '+' : ''}${formatPct(v.valorizacao, 1)} desde a compra`;
    ativos.push(linhaBal({ cor: 'var(--pt-imo)', nome: imo.nome, sub: esc(`comprado por ${mil(v.compra)} em ${mesAno(cfg.imovel.dataCompra)} · ${origem}`), valor: esc(brl0(imo.valor)), vsub: 'valor de mercado estimado', acao: pillEditar('editar:imovel') }));
  } else ativos.push(linhaBal({ cor: 'var(--pt-imo)', nome: 'Apartamento', sub: 'valor de compra e mês - o site corrige pelos índices', valor: '<span class="pt-fraco">—</span>', acao: pillFalta('editar:imovel') }));
  const fg = achar('fgts');
  if (fg) ativos.push(linhaBal({ cor: 'var(--pt-fgts)', nome: 'FGTS', sub: esc(`${(cfg.fgts.contas || []).length} ${(cfg.fgts.contas || []).length === 1 ? 'conta' : 'contas'} · saldo de ${dataBR(ctx.fgts && ctx.fgts.contaAtiva ? ctx.fgts.contaAtiva.dataSaldo : '')} · só saca em casos específicos (moradia, demissão…)`), valor: esc(brl0(fg.valor)), acao: pillEditar('importar', 'atualizar') }));
  else ativos.push(linhaBal({ cor: 'var(--pt-fgts)', nome: 'FGTS', sub: 'importe os extratos (um por empresa) do app FGTS', valor: '<span class="pt-fraco">—</span>', acao: pillFalta('importar', 'importar') }));
  b.ativos.filter((a) => a.outro).forEach((a) => ativos.push(linhaBal({ cor: 'var(--pt-out)', nome: a.nome, sub: esc(a.outro.obs || 'outro bem'), valor: esc(brl0(a.valor)) })));
  ativos.push(`<div class="pt-linha pt-linha-add">${pillEditar('editar:outros', '+ outros bens e dívidas')}<small>carro, cripto, empréstimo… só se quiser contar</small></div>`);

  const dividas = [];
  const fin = achar('financiamento');
  if (fin) {
    const f = cfg.financiamento;
    const n = mesesRestantesFinanciamento({ ...f, saldo: fin.valor });
    dividas.push(linhaBal({
      cor: 'var(--pt-div1)', nome: `Financiamento do apê${f.banco ? ` (${f.banco})` : ''}`,
      sub: esc(`${num(f.taxaAnual) ? `${formatPct(f.taxaAnual, 2)} a.a.${f.indexador ? ` + ${f.indexador}` : ''} · ` : ''}${f.sistema || 'SAC'}${n ? ` · ${n} parcelas (até ${mesAno(somarMeses(d.hoje, n))})` : ''}${avisoInicioFinanciamento(cfg)}`),
      valor: esc(brl0(fin.valor)), vsub: esc(`${num(f.parcela) ? `parcela ${formatBRL(f.parcela)} · ` : ''}extrato de ${dataBR(f.dataSaldo)}, anda sozinho`), acao: pillEditar('editar:financiamento'),
    }));
  } else dividas.push(linhaBal({ cor: 'var(--pt-div1)', nome: 'Financiamento do apê', sub: 'importe o "Demonstrativo de Evolução" da Caixa ou digite', valor: '<span class="pt-fraco">—</span>', acao: pillFalta('editar:financiamento') }));
  const fi = achar('fies');
  if (fi) {
    const f = cfg.fies;
    const taxaAno = num(f.taxaMensal) ? (1 + f.taxaMensal) ** 12 - 1 : null;
    dividas.push(linhaBal({
      cor: 'var(--pt-div2)', nome: `FIES${f.banco ? ` (${f.banco})` : ''}`,
      sub: esc(`${taxaAno != null ? `~${formatPct(taxaAno, 1)} a.a. · ` : ''}Price · ${mesesRestantesFies(f, d.hoje) || '?'} parcelas (até ${mesAno(f.fim)})`),
      valor: esc(brl0(fi.valor)), vsub: esc(`${num(f.parcela) ? `parcela ${formatBRL(f.parcela)} · ` : ''}extrato de ${dataBR(f.dataSaldo)}, anda sozinho`), acao: pillEditar('editar:fies'),
    }));
  }
  b.dividas.filter((a) => a.outro).forEach((a) => dividas.push(linhaBal({ cor: 'var(--pt-div2)', nome: a.nome, sub: esc(a.outro.obs || 'outra dívida'), valor: esc(brl0(a.valor)) })));
  const ap = b.imovel;
  const apHtml = ap && ap.valor > 0 ? `
    <div class="pt-apto">
      <b>Quanto do apê já é seu</b>
      <div class="pt-apto-barra" ${compAttr([{ id: 'seu', nome: 'É seu', valor: Math.max(0, ap.seu), cor: 'var(--pt-imo)' }, { id: 'banco', nome: 'Ainda é do banco', valor: Math.max(0, ap.saldo), cor: 'var(--pt-div1)' }])}></div>
      <span><b class="pt-num">${esc(brl0(ap.seu))}</b> (${esc(formatPct(ap.pct, 0))}) é seu · ${esc(brl0(ap.saldo))} ainda é do banco.${num(cfg.financiamento && cfg.financiamento.amortizacao) ? ` Cada parcela abate <b class="pt-num">${esc(formatBRL(cfg.financiamento.amortizacao))}</b> da dívida; o resto é juros, seguro e taxa.` : ''}</span>
    </div>` : '';
  return `
    <div><h3>O que você tem <span>${esc(mil(b.totalAtivos))}</span></h3>${ativos.join('')}</div>
    <div><h3>O que você deve <span>${esc(mil(b.totalDividas))}</span></h3>${dividas.join('')}${apHtml}</div>`;
}

export function htmlHistoricoTabela(hist) {
  const linhas = hist.map((l) => `<tr${l.hoje ? ' class="pt-hoje"' : ''}>
    <td class="esq"><b>${esc(l.hoje ? 'Hoje' : l.ano)}</b>${l.compraImovel ? '<small>compra do apê</small>' : ''}${l.entradaImovel ? '<small>entrada do apê (FGTS)</small>' : ''}${l.fgtsNoApe > 0 ? `<small>FGTS usado na amortização do apê: ${esc(brl0(l.fgtsNoApe))} (transferência)</small>` : ''}${l.fonte === 's' ? '<small>pelo site</small>' : ''}</td>
    <td class="num col-opc">${esc(brl0(l.ativos))}</td><td class="num col-opc">${l.dividas ? `−${esc(brl0(l.dividas))}` : '—'}</td><td class="num"><b>${esc(brl0(l.liquido))}</b></td>
    <td class="num ${num(l.noAno) ? (l.noAno >= 0 ? 'good' : 'bad') : ''}">${num(l.noAno) ? `${l.noAno >= 0 ? '+' : '−'}${esc(brl0(Math.abs(l.noAno)))}` : '—'}</td>
    <td class="num col-opc">${num(l.renda) ? esc(brl0(l.renda)) : '<span class="pt-fraco">—</span>'}</td>
    <td class="num col-opc">${num(l.convertido) ? (l.compraImovel ? '<span class="pt-fraco">(apê)</span>' : esc(formatPct(l.convertido, 0))) : '<span class="pt-fraco">—</span>'}</td></tr>`).join('');
  return `<table class="tabela tabela-baixa pt-tab"><thead><tr><th scope="col">Ano</th><th scope="col" class="num col-opc">O que tinha</th><th scope="col" class="num col-opc">O que devia</th><th scope="col" class="num">Líquido</th><th scope="col" class="num">No ano</th><th scope="col" class="num col-opc">Renda bruta (IR)</th><th scope="col" class="num col-opc">Virou patrimônio</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

export function htmlHistoricoNota(ctx) {
  const { cfg } = ctx;
  const irs = (cfg.ir && cfg.ir.anos) || [];
  const ultIr = irs[irs.length - 1];
  const imoIr = ultIr && ultIr.grupos && ultIr.grupos['01'] ? ultIr.grupos['01'].atual : null;
  const partes = [];
  partes.push(irs.length
    ? `Investimentos e contas pelo IR (${esc(irs[0].ano)}–${esc(ultIr.ano)}), que declara pelo <b>custo</b> - o que você pagou, não o valor de mercado. Hoje, pelo site.`
    : 'Sem declarações do IR ainda: o histórico usa o patrimônio de dezembro que o site tem. Importe as declarações pra voltar mais anos.');
  if (num(imoIr)) partes.push(`No IR o apê aparece pelo que você já pagou (${esc(brl0(imoIr))} em ${esc(ultIr.ano)}, fora a entrada); aqui ele entra pelo valor de mercado estimado e o financiamento como dívida.`);
  if (cfg.fies) partes.push('O FIES não aparece no IR: o saldo de cada ano é refeito pelo extrato do BB (parcela e taxa fixas, pagas em dia).');
  if (cfg.financiamento) partes.push('O saldo do financiamento nos anos anteriores sai dos saldos conhecidos (extrato, valor financiado) e das amortizações extras com o FGTS.');
  return partes.join(' ');
}

export function htmlCrescimento(o) {
  if (!o) return '<p class="pt-nota">Precisa de pelo menos 12 meses de histórico no site.</p>';
  const cores = { aportes: 'var(--pt-inv)', rendimento: 'var(--pt-inv)', dividas: 'var(--pt-div1)', imovel: 'var(--pt-imo)', fgts: 'var(--pt-fgts)' };
  return `${barrasDivergentes(o.itens.filter((i) => Math.abs(i.valor) >= 1).map((i) => ({ ...i, cor: i.valor >= 0 ? cores[i.id] : 'var(--pt-neg)' })))}
    <p class="pt-nota">De ${esc(mesAno(o.de))} a ${esc(mesAno(o.ate))} o patrimônio líquido ${o.total >= 0 ? 'cresceu' : 'caiu'} <b class="pt-num">${esc(brl0(Math.abs(o.total)))}</b>. "Dívidas abatidas" é o saldo que caiu (parcelas + amortizações extras).${(o.transferencias || []).map((t) => ` <b>${esc(t.nome)}: ${esc(brl0(t.valor))}</b> - é transferência (saiu do FGTS e abateu a dívida do mesmo tamanho), não é perda nem entra nas barras.`).join('')}</p>`;
}

export function htmlCarreira(ctx) {
  const car = ctx.cfg.carreira;
  const linha = linhaSalarios(car);
  if (!linha.length) {
    return { html: `<div class="pt-card-cab"><h3>Carreira</h3></div><p class="pt-nota">Importe a Carteira de Trabalho Digital (app ou gov.br → Contratos de trabalho → PDF): o site monta a linha do salário e usa no FGTS e nos cenários.</p><button type="button" class="btn btn-outlined btn-sm" data-acao="importar">Importar PDF</button>`, dicas: [] };
  }
  const spec = opcoesSalarios(linha, car.contratos, { hoje: ctx.d.hoje });
  const c5 = crescimentoSalario(car, ctx.d.hoje, 5);
  const atual = linha[linha.length - 1];
  const cargo = (car.contratos || []).flatMap((c) => c.cargos || []).filter((x) => !x.fim).pop();
  return {
    html: `<div class="pt-card-cab"><h3>Carreira</h3><span class="pt-hint">salário contratual, pela Carteira de Trabalho</span></div>
      <div class="grid-kpi pt-kpis-3">
        ${kpiHtml({ rotulo: 'Hoje', valorHtml: esc(brl0(atual.valor)), subHtml: esc(cargo ? cargo.cargo.toLowerCase() : atual.empregador) })}
        ${kpiHtml({ rotulo: 'Cresceu', valorHtml: c5 ? esc(`${formatPct(c5.taxa, 1)}/ano`) : '—', subHtml: c5 ? `nos últimos ${c5.anos} anos (de ${esc(mil(c5.antes))})` : '' })}
        ${kpiHtml({ rotulo: 'Empresas', valorHtml: String((car.contratos || []).length), subHtml: `desde ${esc(mesAno(mesDe(linha[0].data)))}` })}
      </div>
      <div class="pt-grafico" id="ptGSal"></div>`,
    spec,
  };
}

export function htmlFgts(ctx) {
  const fg = ctx.fgts;
  if (!fg) return `<div class="pt-card-cab"><h3>FGTS</h3></div><p class="pt-nota">Importe os extratos do app FGTS (um PDF por empresa, inclusive as antigas): saldo, quanto foi pro apê, saques e a próxima vez que dá pra amortizar.</p><button type="button" class="btn btn-outlined btn-sm" data-acao="importar">Importar extratos</button>`;
  const destino = [
    { id: 'moradia', nome: 'Usado na amortização do apê', valor: fg.usadoMoradia, cor: 'var(--pt-imo)' },
    ...Object.entries(fg.saques).filter(([k, v]) => k !== 'moradia' && v > 0).map(([k, v]) => ({ id: k, nome: `Sacado: ${MOTIVOS_SAQUE_FGTS[k] || k}`, valor: v, cor: 'var(--pt-div2)' })),
    { id: 'saldo', nome: 'Saldo hoje', valor: fg.saldo, cor: 'var(--pt-fgts)' },
  ].filter((x) => x.valor > 0);
  const prox = fg.proximaAmortizacao < mesDe(ctx.d.hoje) ? 'já pode' : mesAno(fg.proximaAmortizacao);
  return `<div class="pt-card-cab"><h3>FGTS</h3><span class="pt-hint">${esc(`${(ctx.cfg.fgts.contas || []).length} contas, desde ${mesAno(mesDe(fg.desde))}`)}</span></div>
    <div class="grid-kpi pt-kpis-3">
      ${kpiHtml({ rotulo: 'Saldo', valorHtml: esc(brl0(fg.saldo)), subHtml: esc(fg.contaAtiva ? fg.contaAtiva.empregador : '') })}
      ${kpiHtml({ rotulo: 'Já entrou', valorHtml: esc(mil(fg.depositos + fg.rendimentos)), subHtml: `${esc(mil(fg.depositos))} depósitos + ${esc(mil(fg.rendimentos))} de juros` })}
      ${kpiHtml({ rotulo: 'Próximo uso no apê', valorHtml: esc(prox), subHtml: 'a Caixa libera a cada 2 anos' })}
    </div>
    ${fg.aniversario && fg.aniversario.ativo && fg.aniversario.proximo ? `<p class="pt-nota">Saque-aniversário: <b>${esc(mesAno(fg.aniversario.proximo))}</b>, ~<b class="pt-num">${esc(brl0((fg.aniversario.estimado || fg.aniversario.comSaldoDeHoje).valor))}</b> (${esc(formatNumeroBR((fg.aniversario.estimado || fg.aniversario.comSaldoDeHoje).aliquota * 100, 0))}% do saldo + ${esc(brl0((fg.aniversario.estimado || fg.aniversario.comSaldoDeHoje).adicional))}). Pelo saldo de hoje o app do FGTS mostra ${esc(formatBRL(fg.aniversario.comSaldoDeHoje.valor))}.</p>` : ''}
    <p class="pt-sub-t">Pra onde foi</p>
    ${barrasDivergentes(destino, { sinal: false })}`;
}

/**
 * 03/10/2026: Carreira e FGTS saíram da aba Patrimônio e foram pra "Renda e
 * Orçamentos" (pedido do Tiago). Esta função desenha a seção onde a página
 * mandar, com o contexto da aba Patrimônio (contextoPatrimonio) - o mesmo
 * HTML de antes (htmlCarreira/htmlFgts) e o balão do gráfico de salários.
 * aoAcao('importar') leva pra importação de documentos (aba Patrimônio).
 *   const cf = montarCarreiraFgts(raiz, { doc, aoAcao });  cf.atualizar(ctx);
 */
export function montarCarreiraFgts(raiz, { doc = raiz && raiz.ownerDocument, aoAcao = null } = {}) { // eslint-disable-line no-unused-vars
  let ctx = null;
  raiz.innerHTML = `<section class="pt-sec" id="ptSecCarreira"><div class="pt-sec-cab"><h2>Carreira e FGTS</h2><span class="pt-hint">pela Carteira de Trabalho e pelos extratos do FGTS</span></div>
      <div class="pt-duas"><div class="card pt-card pt-pad" id="ptCarreira"><span class="skel skel-bloco og-skel-180"></span></div><div class="card pt-card pt-pad" id="ptFgts"><span class="skel skel-bloco og-skel-180"></span></div></div></section>`;
  function desenhar() {
    if (!ctx) return;
    const car = htmlCarreira(ctx);
    const boxCar = raiz.querySelector('#ptCarreira');
    limparGrafico(boxCar.querySelector('#ptGSal'));
    boxCar.innerHTML = car.html;
    const caixa = boxCar.querySelector('#ptGSal');
    if (caixa && car.spec) montarGrafico(caixa, car.spec);
    const boxFgts = raiz.querySelector('#ptFgts');
    boxFgts.innerHTML = htmlFgts(ctx);
    montarBarrasDivergentes(boxFgts);
  }
  raiz.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (b && raiz.contains(b) && typeof aoAcao === 'function') aoAcao(b.dataset.acao);
  });
  return {
    atualizar(novoCtx) { ctx = novoCtx; desenhar(); },
    erro(msg) { raiz.querySelectorAll('#ptCarreira, #ptFgts').forEach((e) => { e.innerHTML = `<p class="pt-nota">${esc(msg)}</p>`; }); },
    get contexto() { return ctx; },
  };
}

export function htmlMeta(ctx) {
  const { meta, p, libs, d } = ctx;
  const fmtp = (v) => formatNumeroBR(v, 2);
  const marcados = meta.itens.filter((i) => i.descontar);
  const opcoes = meta.itens.map((i) => `<label class="pt-chk-item"><input type="checkbox" data-descontar="${esc(i.nome)}"${i.descontar ? ' checked' : ''}><span>${esc(i.nome)}</span><b>${esc(formatBRL(i.mensal))}</b></label>`).join('');
  const quita = libs.map((l) => `${l.id === 'fies' ? 'o FIES' : 'o apê'} em ${mesAno(somarMeses(d.hoje, l.mes))}`).join(' e ');
  return `
    <div class="pt-meta-conta">
      <p>A meta da planilha (aba Distribuição e Metas) parte do custo de vida de <em>hoje</em>, que inclui <b>${esc(formatBRL(meta.parcelas))}/mês</b> de parcelas de dívida (${esc(marcados.map((i) => `${i.nome} ${brl0(i.mensal)}`).join(' + ') || 'nenhuma marcada')}). Aposentado, ${esc(quita || 'com as dívidas quitadas')}, essas parcelas já acabaram - então a renda que você precisa é menor:</p>
      <ol class="pt-meta-passos">
        <li><span>Planilha hoje</span><code>(${esc(fmtp(meta.custoComFolga))} + ${esc(fmtp(meta.extra))}) × ${esc(formatNumeroBR(1 + meta.reinvestimento, 2))}</code><b>${esc(brl0(meta.rendaDM))}/mês</b><small>precisa de ${esc(mil(meta.patrimonioDM))}</small></li>
        <li class="pt-meta-final"><span>Sem as parcelas</span><code>(${esc(fmtp(meta.custoComFolga))} − ${esc(fmtp(meta.parcelas))} × ${esc(formatNumeroBR(1 + meta.folga, 2))} + ${esc(fmtp(meta.extra))}) × ${esc(formatNumeroBR(1 + meta.reinvestimento, 2))}</code><b>${esc(brl0(meta.rendaSem))}/mês</b><small>precisa de <b>${esc(mil(meta.patrimonioSem))}</b></small></li>
      </ol>
      <p class="pt-nota">Custo de vida com folga + extra, mais ${esc(formatPct(meta.reinvestimento, 0))} pra reinvestir; o patrimônio é a renda de 12 meses ÷ ${esc(formatPct(meta.taxa, 0))} ao ano${p.taxaSaque ? ' (a taxa de saque escolhida abaixo)' : ' (o rendimento da aba Distribuição e Metas da planilha)'}. Aqui vale a meta <b>sem as parcelas</b>; a planilha continua como está - quem acompanha a meta é a tela <a href="../metas.html">Metas e Objetivos</a>.</p>
    </div>
    <details class="pt-descontar"><summary>O que conta como parcela de dívida (${marcados.length})</summary><div class="pt-chk-lista">${opcoes}</div></details>`;
}

export function htmlFuturoControles(ctx) {
  const { p, meta, ritmo, aporteMeta, aporte, rendimento } = ctx;
  const seg = (grupo, itens, atual) => `<div class="segmented" role="group" data-seg="${grupo}">${itens.map(([v, rot]) => `<button type="button" data-v="${esc(v)}" class="${String(atual) === String(v) ? 'on' : ''}" aria-pressed="${String(atual) === String(v)}">${esc(rot)}</button>`).join('')}</div>`;
  const taxa = p.taxaSaque || meta.rendimento;
  return `
    <label class="pt-ctl"><span class="pt-ctl-row">Quanto sacar por ano <b>${esc(formatPct(taxa, 0))}</b></span>
      ${seg('taxaSaque', [['0.04', '4%'], ['0.05', '5%'], ['', `${formatNumeroBR(meta.rendimento * 100, 0)}% (planilha)`]], p.taxaSaque ? String(p.taxaSaque) : '')}</label>
    <label class="pt-ctl" for="ptRend"><span class="pt-ctl-row">Rendimento real ao ano <b id="ptRendV">${esc(formatPct(rendimento, 1))}</b></span>
      <input type="range" id="ptRend" min="0.02" max="0.09" step="0.005" value="${rendimento}"></label>
    <label class="pt-ctl" for="ptAporte"><span class="pt-ctl-row">Aporte por mês <b id="ptAporteV">${esc(brl0(aporte))}</b></span>
      ${seg('aporteModo', [['ritmo', 'Seu ritmo (12m)'], ['meta', 'Sua meta']], p.aporteModo)}
      <small class="pt-ctl-dica">ritmo ${esc(num(ritmo) ? brl0(ritmo) : '—')} · meta ${esc(num(aporteMeta) ? brl0(aporteMeta) : '—')}</small>
      <input type="range" id="ptAporte" min="0" max="15000" step="50" value="${Math.round(aporte)}"></label>
    <label class="pt-chk"><input type="checkbox" id="ptParcelas"${p.parcelasViramAporte ? ' checked' : ''}><span>Quando o FIES e o apê acabarem, as parcelas <b>viram aporte</b></span></label>
    <label class="pt-chk"><input type="checkbox" id="ptReserva"${p.incluirReservaNaAposentadoria ? ' checked' : ''}><span>A reserva de emergência <b>conta</b> pra aposentadoria</span></label>
    <label class="pt-ctl" for="ptIdade"><span class="pt-ctl-row">Idade pra comparar (Coast FI)</span><span class="pt-input"><input id="ptIdade" inputmode="numeric" value="${esc(p.idadeAlvo)}"><i>anos</i></span></label>`;
}

export function htmlFuturoTiles(ctx) {
  const { proj, quando, alvo, inicial, meta, d, p } = ctx;
  const q = quando(proj.chegou);
  const passiva = num(d.proventos12m) ? d.proventos12m / 12 : null;
  return [
    kpiHtml({ classe: 'pt-kpi-dest', rotulo: 'Você chega lá', valorHtml: esc(proj.chegou == null ? 'não chega' : proj.chegou === 0 ? 'já chegou' : q.ano), subHtml: proj.chegou ? `${q.idade != null ? `aos ${esc(q.idade)} anos · ` : ''}em ${esc(anosTxt(proj.chegou / 12))}` : 'em 50 anos, com esses números' }),
    kpiHtml({ rotulo: 'Precisa ter', valorHtml: esc(mil(alvo)), subHtml: `${esc(brl0(meta.rendaSem))}/mês sacando ${esc(formatPct(p.taxaSaque || meta.rendimento, 0))} ao ano` }),
    kpiHtml({ rotulo: 'Hoje você tem', valorHtml: esc(formatPct(alvo ? inicial / alvo : null, 1)), subHtml: `${esc(mil(inicial))} investidos${p.incluirReservaNaAposentadoria ? ' (com a reserva)' : ' (sem a reserva; o apê onde você mora não paga a aposentadoria)'}` }),
    kpiHtml({ rotulo: 'Renda passiva hoje', valorHtml: esc(passiva != null ? `${brl0(passiva)}/mês` : '—'), subHtml: passiva != null ? `${esc(formatPct(passiva / meta.rendaSem, 1))} da renda que você quer · proventos de 12 meses` : '' }),
  ].join('');
}

export function htmlDicas(dicas) {
  return dicas.map((x) => `<article class="pt-dica${x.destaque ? ' hl' : ''}" data-dica="${esc(x.id)}"><span class="pt-dica-t">${esc(x.titulo)}</span><p>${x.html}</p></article>`).join('');
}

export function htmlFontes(ctx, { driveConfigurado = false } = {}) {
  const { cfg, d } = ctx;
  const irs = (cfg.ir && cfg.ir.anos) || [];
  const idx = d.indices || {};
  const ult = (s) => (s && s.length ? mesAno(s[s.length - 1][0]) : null);
  const itens = [
    { ok: irs.length > 0, nome: 'Declarações do IR', det: irs.length ? `${irs.length} ${irs.length === 1 ? 'ano' : 'anos'} (${irs[0].ano}–${irs[irs.length - 1].ano})` : 'nenhuma - "Cópia da Declaração" de cada ano', acoes: `${pillEditar('importar', 'PDF')}${driveConfigurado ? pillEditar('drive-ir', 'do Drive') : ''}` },
    { ok: !!cfg.financiamento, nome: 'Financiamento (Caixa)', det: cfg.financiamento ? `extrato de ${dataBR(cfg.financiamento.dataSaldo)}` : 'Demonstrativo de Evolução - Habitação', acoes: pillEditar('importar', 'PDF') + pillEditar('editar:financiamento') },
    { ok: !!cfg.fies, nome: 'FIES (Banco do Brasil)', det: cfg.fies ? `extrato de ${dataBR(cfg.fies.dataSaldo)}` : 'comprovante do SISBB com o saldo devedor', acoes: pillEditar('importar', 'PDF') + pillEditar('editar:fies') },
    { ok: !!(cfg.fgts && cfg.fgts.contas && cfg.fgts.contas.length), nome: 'FGTS', det: cfg.fgts && cfg.fgts.contas ? `${cfg.fgts.contas.length} contas` : 'um extrato por empresa (app FGTS)', acoes: pillEditar('importar', 'PDFs') },
    { ok: !!(cfg.carreira && cfg.carreira.contratos && cfg.carreira.contratos.length), nome: 'Carteira de Trabalho', det: cfg.carreira && cfg.carreira.contratos ? `${cfg.carreira.contratos.length} contratos` : 'Contratos de trabalho (PDF)', acoes: pillEditar('importar', 'PDF') },
    { ok: !!cfg.imovel, nome: 'Apartamento', det: cfg.imovel ? `${mil(cfg.imovel.valorCompra)} em ${mesAno(cfg.imovel.dataCompra)} · ${cfg.imovel.cidade || ''}` : 'valor e mês da compra', acoes: pillEditar('editar:imovel') },
    { ok: !!(idx.fipezap && idx.fipezap.length) || !!(idx.ivgr && idx.ivgr.length), nome: 'Índices do imóvel', det: `FipeZap ${idx.cidade || ''} ${ult(idx.fipezap) ? `até ${ult(idx.fipezap)}` : '—'} · IVG-R ${ult(idx.ivgr) ? `até ${ult(idx.ivgr)}` : '—'}${idx.atualizadoEm ? ` · buscados em ${dataBR(idx.atualizadoEm)}` : ''}`, acoes: '' },
  ];
  return `
    <ul class="pt-fontes">${itens.map((i) => `<li class="${i.ok ? 'ok' : 'falta'}"><span class="pt-fonte-st" aria-label="${i.ok ? 'ok' : 'falta'}">${i.ok ? '✓' : '•'}</span><span class="pt-fonte-n"><b>${esc(i.nome)}</b><small>${esc(i.det)}</small></span><span class="pt-fonte-a">${i.acoes}</span></li>`).join('')}</ul>
    <p class="pt-nota">Os PDFs são lidos <b>aqui no navegador</b> e não sobem pra lugar nenhum: só o que a tela usa vai pra aba <code>aux_patrimonio</code> da sua planilha (privada, no seu Drive) - saldos e valores por ano, as empresas e os salários da Carteira de Trabalho, o mês de nascimento e, da declaração do IR, o <b>banco, a agência e a conta</b> de cada conta declarada e a raiz do CNPJ de quem te paga (pra aba Renda e Orçamentos). Nada de CPF, PIS, endereço ou número de contrato.${driveConfigurado ? ' As declarações do IR podem vir direto da sua pasta do Drive.' : ' Pra ler as declarações direto da pasta do Drive, rode <code>configurarPastaIrDireto</code> uma vez no Apps Script.'}</p>`;
}

function resumoImportado(item) {
  const x = item.dados;
  if (item.erro) return `<span class="bad">${esc(item.erro)}</span>`;
  if (item.tipo === 'ir') {
    const gs = Object.entries(x.grupos).filter(([k]) => k !== '01').map(([k, g]) => `${GRUPOS_IR[k] || 'não identificado'} ${mil(g.atual)}`).join(' · ');
    return `${esc(`Ano ${x.ano} (exercício ${x.exercicio}): bens ${brl0(x.bens)} · dívidas ${brl0(x.dividas)} · renda tributável ${brl0(x.tributaveis)}`)}<small>${esc(gs)}${x.conferido ? '' : ' · a soma por grupo não fechou (a diferença ficou em "não identificado")'}</small>`;
  }
  if (item.tipo === 'fgts') return `${esc(`${x.empregador}: saldo ${brl0(x.saldo)} em ${dataBR(x.dataSaldo)} · ${x.movimentos.length} lançamentos`)}<small>${esc(`depósitos ${brl0(x.depositos)} · usado no apê ${brl0(x.saques.moradia)} · saque-aniversário ${brl0(x.saques.aniversario)}`)}</small>`;
  if (item.tipo === 'ctps') return `${esc(`${x.contratos.length} contratos`)}<small>${esc(x.contratos.map((c) => `${c.empregador} (${mesAno(mesDe(c.inicio))}–${c.fim ? mesAno(mesDe(c.fim)) : 'hoje'})`).join(' · '))}</small>`;
  if (item.tipo === 'caixa') return `${esc(`Saldo ${formatBRL(x.saldo)} em ${dataBR(x.dataSaldo)} · ${formatPct(x.taxaAnual, 2)} a.a. · ${x.sistema}`)}<small>${esc(`amortização ${formatBRL(x.amortizacao)}/mês · ${x.prazoRestante} de ${x.prazoTotal} meses · parcela ${formatBRL(x.parcela)}`)}</small>`;
  if (item.tipo === 'fies') return `${esc(`Saldo ${formatBRL(x.saldo)} em ${dataBR(x.dataSaldo)} · parcela ${formatBRL(x.parcela)}`)}<small>${esc(`${x.restantes} parcelas até ${mesAno(x.fim)} · ~${formatPct((1 + x.taxaMensal) ** 12 - 1, 2)} a.a.`)}</small>`;
  return '';
}

export function htmlImportacao(imp) {
  const itens = imp.itens.map((it, k) => `<li class="${it.erro ? 'erro' : ''}"><label class="pt-imp-chk"><input type="checkbox" data-imp="${k}"${it.erro ? ' disabled' : it.incluir ? ' checked' : ''}><span><b>${esc(NOMES_DOC[it.tipo] || 'Documento')}</b> <small>${esc(it.arquivo)}</small></span></label><div class="pt-imp-res">${resumoImportado(it)}</div></li>`).join('');
  const lendo = imp.lendo ? `<p class="pt-nota">Lendo ${esc(imp.lendo)}…</p>` : '';
  const ok = imp.itens.filter((i) => !i.erro && i.incluir).length;
  return `<div class="pt-card-cab"><h3>Conferir antes de salvar</h3><span class="pt-hint">só os totais vão pra planilha</span></div>
    <ul class="pt-imp">${itens}</ul>${lendo}
    ${imp.msg ? `<p class="pt-nota ${imp.erroSalvar ? 'bad' : ''}">${esc(imp.msg)}</p>` : ''}
    <div class="pt-form-botoes"><button type="button" class="btn btn-outlined" data-acao="imp-cancelar">Cancelar</button><button type="button" class="btn btn-filled" data-acao="imp-salvar"${ok && !imp.salvando ? '' : ' disabled'}>${imp.salvando ? 'Salvando…' : `Salvar ${ok} ${ok === 1 ? 'documento' : 'documentos'}`}</button></div>`;
}

export function htmlDriveIr(drive) {
  if (drive.carregando) return '<p class="pt-nota">Procurando as declarações na sua pasta do IR…</p>';
  if (drive.erro) return `<p class="pt-nota bad">${esc(drive.erro)}</p>${drive.detalhe ? `<details class="og-detalhe"><summary>Detalhes técnicos</summary><code>${esc(drive.detalhe)}</code></details>` : ''}<div class="pt-form-botoes"><button type="button" class="btn btn-outlined" data-acao="drive-fechar">Fechar</button></div>`;
  const lista = drive.arquivos.map((a, k) => `<label class="pt-chk-item"><input type="checkbox" data-drive="${k}"${a.marcado ? ' checked' : ''}><span>${esc(a.pasta)} / ${esc(a.nome)}</span><b>${esc(formatNumeroBR(a.tamanho / 1024, 0))} KB</b></label>`).join('');
  return `<div class="pt-card-cab"><h3>Declarações no seu Drive</h3><span class="pt-hint">${drive.arquivos.length} encontradas</span></div>
    <div class="pt-chk-lista">${lista || '<p class="pt-nota">Nenhuma "Cópia da Declaração" na pasta.</p>'}</div>
    <div class="pt-form-botoes"><button type="button" class="btn btn-outlined" data-acao="drive-fechar">Fechar</button><button type="button" class="btn btn-filled" data-acao="drive-ler"${drive.arquivos.some((a) => a.marcado) ? '' : ' disabled'}>Ler as marcadas</button></div>`;
}

// --- formulários de edição ---------------------------------------------------

const campo = (id, rot, valor, { tipo = 'text', dica = '', pre = '', suf = '', larg = '' } = {}) => `<label class="pt-campo" for="${id}"><span>${esc(rot)}</span><span class="pt-input${larg ? ` ${larg}` : ''}">${pre ? `<i>${esc(pre)}</i>` : ''}<input id="${id}" name="${id}" ${tipo === 'month' ? 'type="month"' : tipo === 'date' ? 'type="date"' : 'inputmode="decimal"'} value="${esc(valor == null ? '' : valor)}">${suf ? `<i>${esc(suf)}</i>` : ''}</span>${dica ? `<small>${dica}</small>` : ''}</label>`;
const campoTexto = (id, rot, valor) => `<label class="pt-campo" for="${id}"><span>${esc(rot)}</span><span class="pt-input largo"><input id="${id}" name="${id}" value="${esc(valor || '')}" maxlength="60"></span></label>`;

export function htmlEditor(tipo, ctx) {
  const { cfg, d } = ctx;
  const botoes = (msg = '') => `<div class="pt-form-botoes"><span class="pt-nota pt-form-msg">${msg}</span><button type="button" class="btn btn-outlined" data-acao="editor-fechar">Cancelar</button><button type="submit" class="btn btn-filled">Salvar</button></div>`;
  if (tipo === 'imovel') {
    const i = cfg.imovel || { cidade: 'São Paulo', metodo: 'media' };
    const v = cfg.imovel ? valorImovel(cfg.imovel, d.indices, mesDe(d.hoje)) : null;
    const opcao = (m, rot, valor) => `<label class="pt-radio"><input type="radio" name="metodo" value="${m}"${(i.metodo || 'media') === m ? ' checked' : ''}><span>${esc(rot)}</span><b>${valor ? esc(brl0(valor)) : ''}</b></label>`;
    return `<form class="pt-form" data-form="imovel"><div class="pt-card-cab"><h3>Apartamento</h3><span class="pt-hint">o valor de mercado anda com os índices; se preferir, digite o seu</span></div>
      <div class="pt-campos">${campoTexto('ptImoNome', 'Nome', i.nome || 'Apartamento')}${campoTexto('ptImoCidade', 'Cidade (FipeZap)', i.cidade)}
      ${campo('ptImoCompra', 'Valor de compra', numCampo(i.valorCompra), { pre: 'R$' })}${campo('ptImoData', 'Mês da compra', i.dataCompra || '', { tipo: 'month' })}
      ${campo('ptImoEntrada', 'Entrada (com FGTS)', numCampo(i.entrada), { pre: 'R$' })}${campo('ptImoArea', 'Área', numCampo(i.area, 1), { suf: 'm²' })}</div>
      <p class="pt-sub-t">Qual valor usar</p>
      <div class="pt-radios">${opcao('media', 'Média dos dois índices', v && v.media)}${opcao('fipezap', `FipeZap ${i.cidade || ''}${v && v.fipezap ? ` (até ${mesAno(v.fipezap.ate)})` : ''}`, v && v.fipezap && v.fipezap.valor)}${opcao('ivgr', `IVG-R, Banco Central${v && v.ivgr ? ` (até ${mesAno(v.ivgr.ate)})` : ''}`, v && v.ivgr && v.ivgr.valor)}${opcao('manual', 'O valor que eu digitar', null)}${opcao('compra', 'O valor de compra', i.valorCompra)}</div>
      <div class="pt-campos">${campo('ptImoManual', 'Meu valor', numCampo(i.valorManual), { pre: 'R$' })}${campo('ptImoManualData', 'Vale a partir de', i.dataValorManual || '', { tipo: 'date' })}</div>
      ${d.indices && num(d.indices.precoM2) && num(i.area) ? `<p class="pt-nota">Preço médio anunciado em ${esc(d.indices.cidade)}: ${esc(brl0(d.indices.precoM2))}/m² (${esc(mesAno(d.indices.mesPrecoM2))}) - ${esc(brl0(d.indices.precoM2 * i.area))} pros seus ${esc(formatNumeroBR(i.area, 1))} m². É a média da cidade toda (bairros caros puxam pra cima); por isso o site usa só a <b>variação</b> dos índices sobre o que você pagou.</p>` : ''}
      ${botoes()}</form>`;
  }
  if (tipo === 'financiamento') {
    const f = cfg.financiamento || { sistema: 'SAC', banco: 'Caixa' };
    const imo = cfg.imovel || {};
    const saldos = (f.saldosConhecidos || []).map((s) => `${s.data}; ${formatNumeroBR(s.saldo)}`).join('\n');
    const extras = (f.amortizacoesExtras || []).map((s) => `${s.data}; ${formatNumeroBR(s.valor)}`).join('\n');
    return `<form class="pt-form" data-form="financiamento"><div class="pt-card-cab"><h3>Financiamento do apê</h3><span class="pt-hint">o jeito fácil é importar o PDF "Demonstrativo de Evolução - Habitação" do app da Caixa</span></div>
      <div class="pt-campos">${campoTexto('ptFinBanco', 'Banco', f.banco)}${campo('ptFinSaldo', 'Saldo devedor', numCampo(f.saldo), { pre: 'R$' })}${campo('ptFinData', 'Saldo em', f.dataSaldo || '', { tipo: 'date' })}
      ${campo('ptFinTaxa', 'Juros ao ano', numCampo(num(f.taxaAnual) ? f.taxaAnual * 100 : null), { suf: '% + TR' })}${campo('ptFinAmort', 'Amortização do mês', numCampo(f.amortizacao), { pre: 'R$' })}
      ${campo('ptFinSeguro', 'Seguro + taxa', numCampo(f.seguroTaxas), { pre: 'R$' })}${campo('ptFinParcela', 'Parcela', numCampo(f.parcela), { pre: 'R$' })}${campo('ptFinRestante', 'Parcelas faltando', f.prazoRestante || '')}</div>
      <p class="pt-sub-t">Pra desenhar o histórico</p>
      <div class="pt-campos">${campo('ptFinInicio', 'Início', f.dataInicio || imo.dataCompra || '', { tipo: 'month' })}${campo('ptFinFinanciado', 'Valor financiado', numCampo(f.valorFinanciado ?? (num(imo.valorCompra) && num(imo.entrada) ? imo.valorCompra - imo.entrada : null)), { pre: 'R$' })}</div>
      <div class="pt-campos">
        <label class="pt-campo largo" for="ptFinSaldos"><span>Saldos que você sabe (aaaa-mm-dd; valor, um por linha)</span><textarea id="ptFinSaldos" rows="3" placeholder="2024-12-31; 394.000,00">${esc(saldos)}</textarea></label>
        <label class="pt-campo largo" for="ptFinExtras"><span>Amortizações extras com dinheiro (aaaa-mm-dd; valor)</span><textarea id="ptFinExtras" rows="3" placeholder="2025-06-15; 10.000,00">${esc(extras)}</textarea></label>
      </div>
      <label class="pt-chk"><input type="checkbox" id="ptFinFgts"${f.usarFgtsComoExtra === false ? '' : ' checked'}><span>Usos do FGTS na moradia depois do início contam como amortização extra (dos extratos do FGTS)</span></label>
      ${botoes()}</form>`;
  }
  if (tipo === 'fies') {
    const f = cfg.fies || { banco: 'Banco do Brasil' };
    return `<form class="pt-form" data-form="fies"><div class="pt-card-cab"><h3>FIES</h3><span class="pt-hint">o comprovante do SISBB (app do BB) já traz tudo - importe o PDF</span></div>
      <div class="pt-campos">${campoTexto('ptFiesBanco', 'Banco', f.banco)}${campo('ptFiesSaldo', 'Saldo devedor', numCampo(f.saldo), { pre: 'R$' })}${campo('ptFiesData', 'Saldo em', f.dataSaldo || '', { tipo: 'date' })}
      ${campo('ptFiesParcela', 'Parcela', numCampo(f.parcela), { pre: 'R$' })}${campo('ptFiesTaxa', 'Juros ao mês', numCampo(num(f.taxaMensal) ? f.taxaMensal * 100 : null, 4), { suf: '%' })}
      ${campo('ptFiesFim', 'Última parcela', f.fim || '', { tipo: 'month' })}${campo('ptFiesInicio', 'Começou a amortizar', f.inicioAmortizacao || '', { tipo: 'month' })}</div>
      ${botoes()}</form>`;
  }
  if (tipo === 'outros') {
    const lista = (cfg.outros || []).map((o, k) => `<div class="pt-outro" data-k="${k}"><span class="pt-input largo"><input data-o="nome" value="${esc(o.nome)}" aria-label="Nome" maxlength="60"></span><select data-o="tipo" aria-label="Tipo"><option value="bem"${o.tipo !== 'divida' ? ' selected' : ''}>Bem</option><option value="divida"${o.tipo === 'divida' ? ' selected' : ''}>Dívida</option></select><span class="pt-input"><i>R$</i><input data-o="valor" inputmode="decimal" value="${esc(numCampo(o.valor))}" aria-label="Valor"></span><button type="button" class="pt-mini" data-acao="outro-remover" aria-label="Remover ${esc(o.nome)}">remover</button></div>`).join('');
    return `<form class="pt-form" data-form="outros"><div class="pt-card-cab"><h3>Outros bens e dívidas</h3><span class="pt-hint">carro, cripto, móveis, empréstimos… (valores de hoje)</span></div>
      <div class="pt-outros">${lista || '<p class="pt-nota">Nada ainda.</p>'}</div>
      <button type="button" class="btn btn-outlined btn-sm" data-acao="outro-adicionar">+ adicionar</button>
      ${botoes()}</form>`;
  }
  return '';
}

function lerLinhasDataValor(texto, chave) {
  return String(texto || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d{4}-\d{2}(?:-\d{2})?)\s*[;,]?\s*(.+)$/);
    const v = m ? lerValorBR(m[2]) : null;
    return m && num(v) ? { data: m[1], [chave]: v } : null;
  }).filter(Boolean);
}

/** Lê o formulário aberto e devolve o bloco pra salvar (ou { erro }). */
export function lerFormulario(form, ctx) {
  const tipo = form.dataset.form;
  const v = (id) => { const e = form.querySelector(`#${id}`); return e ? e.value : ''; };
  const n = (id) => lerValorBR(v(id));
  const cfg = ctx.cfg;
  if (tipo === 'imovel') {
    const metodo = (form.querySelector('input[name="metodo"]:checked') || {}).value || 'media';
    const out = { ...(cfg.imovel || {}), nome: v('ptImoNome'), cidade: v('ptImoCidade') || 'São Paulo', valorCompra: n('ptImoCompra'), dataCompra: v('ptImoData'), entrada: n('ptImoEntrada'), area: n('ptImoArea'), metodo, valorManual: n('ptImoManual'), dataValorManual: v('ptImoManualData') || null };
    if (!num(out.valorCompra) || out.valorCompra <= 0) return { erro: 'Informe o valor de compra.' };
    if (!/^\d{4}-\d{2}$/.test(out.dataCompra || '')) return { erro: 'Informe o mês da compra.' };
    if (metodo === 'manual' && !num(out.valorManual)) return { erro: 'Digite o seu valor (ou escolha outra opção).' };
    return { chave: 'imovel', valor: out };
  }
  if (tipo === 'financiamento') {
    const taxa = n('ptFinTaxa');
    const out = {
      ...(cfg.financiamento || {}), banco: v('ptFinBanco'), saldo: n('ptFinSaldo'), dataSaldo: v('ptFinData'), taxaAnual: num(taxa) ? taxa / 100 : null,
      amortizacao: n('ptFinAmort'), seguroTaxas: n('ptFinSeguro'), parcela: n('ptFinParcela'), prazoRestante: n('ptFinRestante'),
      dataInicio: v('ptFinInicio') || null, valorFinanciado: n('ptFinFinanciado'),
      saldosConhecidos: lerLinhasDataValor(v('ptFinSaldos'), 'saldo'), amortizacoesExtras: lerLinhasDataValor(v('ptFinExtras'), 'valor'),
      usarFgtsComoExtra: !!(form.querySelector('#ptFinFgts') || {}).checked,
    };
    if (!num(out.saldo) || !/^\d{4}-\d{2}-\d{2}$/.test(out.dataSaldo || '')) return { erro: 'Informe o saldo devedor e a data.' };
    if (!num(out.amortizacao) && !num(out.prazoRestante)) return { erro: 'Informe a amortização do mês ou quantas parcelas faltam.' };
    return { chave: 'financiamento', valor: out };
  }
  if (tipo === 'fies') {
    const taxa = n('ptFiesTaxa');
    const out = { ...(cfg.fies || {}), banco: v('ptFiesBanco'), saldo: n('ptFiesSaldo'), dataSaldo: v('ptFiesData'), parcela: n('ptFiesParcela'), taxaMensal: num(taxa) ? taxa / 100 : null, fim: v('ptFiesFim') || null, inicioAmortizacao: v('ptFiesInicio') || null };
    if (!num(out.saldo) || !/^\d{4}-\d{2}-\d{2}$/.test(out.dataSaldo || '')) return { erro: 'Informe o saldo devedor e a data.' };
    if (!num(out.parcela)) return { erro: 'Informe a parcela.' };
    return { chave: 'fies', valor: out };
  }
  if (tipo === 'outros') {
    const lista = [...form.querySelectorAll('.pt-outro')].map((l) => {
      const k = Number(l.dataset.k);
      const orig = (cfg.outros || [])[k] || {};
      return { id: orig.id, nome: l.querySelector('[data-o="nome"]').value.trim(), tipo: l.querySelector('[data-o="tipo"]').value, valor: lerValorBR(l.querySelector('[data-o="valor"]').value) };
    }).filter((o) => o.nome);
    if (lista.some((o) => !num(o.valor))) return { erro: 'Confira os valores.' };
    return { chave: 'outros', valor: lista };
  }
  return { erro: 'formulário desconhecido' };
}

/** Junta o que foi lido dos PDFs com o que já está salvo; devolve { chave: valor } só do que mudou. */
export function mesclarImportacao(cfg, itens) {
  const out = {};
  const ok = itens.filter((i) => !i.erro && i.incluir);
  const irs = ok.filter((i) => i.tipo === 'ir').map((i) => i.dados);
  if (irs.length) {
    const anos = [...((cfg.ir && cfg.ir.anos) || [])];
    irs.forEach((a) => {
      const { nascimento, ...resto } = a;
      const k = anos.findIndex((x) => x.ano === a.ano);
      if (k >= 0) anos[k] = resto; else anos.push(resto);
    });
    out.ir = { anos: anos.sort((a, b) => a.ano - b.ano) };
    const nasc = irs.map((a) => a.nascimento).find(Boolean);
    if (nasc && !(cfg.carreira && cfg.carreira.nascimento) && !(cfg.preferencias && cfg.preferencias.nascimento)) out.preferencias = { ...PREFS_PADRAO, ...(cfg.preferencias || {}), nascimento: nasc };
  }
  const fgts = ok.filter((i) => i.tipo === 'fgts').map((i) => contaFgtsParaSalvar(i.dados));
  if (fgts.length) {
    const contas = [...((cfg.fgts && cfg.fgts.contas) || [])];
    fgts.forEach((c) => {
      const k = contas.findIndex((x) => x.empregador === c.empregador && x.admissao === c.admissao);
      if (k >= 0) contas[k] = c; else contas.push(c);
    });
    out.fgts = { contas: contas.sort((a, b) => ((a.admissao || '') < (b.admissao || '') ? -1 : 1)) };
  }
  const ctps = ok.filter((i) => i.tipo === 'ctps').pop();
  if (ctps) out.carreira = { nascimento: ctps.dados.nascimento || (cfg.carreira && cfg.carreira.nascimento) || null, contratos: ctps.dados.contratos };
  const caixa = ok.filter((i) => i.tipo === 'caixa').map((i) => i.dados).sort((a, b) => (a.dataSaldo < b.dataSaldo ? -1 : 1));
  if (caixa.length) {
    let fin = { ...(cfg.financiamento || {}) };
    caixa.forEach((x) => {
      const { parcelas, ...novo } = x;
      const saldos = [...(fin.saldosConhecidos || [])];
      if (num(fin.saldo) && fin.dataSaldo && fin.dataSaldo !== novo.dataSaldo && !saldos.some((s) => s.data === fin.dataSaldo)) saldos.push({ data: fin.dataSaldo, saldo: fin.saldo });
      if (novo.dataSaldo < (fin.dataSaldo || '')) { saldos.push({ data: novo.dataSaldo, saldo: novo.saldo }); return; }
      fin = { ...fin, ...novo, saldosConhecidos: saldos.filter((s) => s.data !== novo.dataSaldo) };
    });
    const imo = cfg.imovel || {};
    if (!fin.dataInicio && imo.dataCompra) fin.dataInicio = imo.dataCompra;
    if (!num(fin.valorFinanciado) && num(imo.valorCompra) && num(imo.entrada)) fin.valorFinanciado = imo.valorCompra - imo.entrada;
    out.financiamento = fin;
  }
  const fies = ok.filter((i) => i.tipo === 'fies').map((i) => i.dados).sort((a, b) => (a.dataSaldo < b.dataSaldo ? -1 : 1)).pop();
  if (fies) { const { parcelas, ...resto } = fies; out.fies = { ...(cfg.fies || {}), ...resto }; }
  return out;
}

/** Lê um PDF (linhas do pdf.js) com o leitor certo. */
export function lerDocumento(linhas) {
  const tipo = identificarDocumento(linhas);
  if (tipo === 'ir') return { tipo, dados: lerDeclaracaoIr(linhas) };
  if (tipo === 'fgts') return { tipo, dados: lerExtratoFgts(linhas) };
  if (tipo === 'ctps') return { tipo, dados: lerCtps(linhas) };
  if (tipo === 'caixa') return { tipo, dados: lerExtratoCaixaHabitacao(linhas) };
  if (tipo === 'fies') return { tipo, dados: lerExtratoFies(linhas) };
  throw new Error('não reconheci o documento (aceita: Cópia da Declaração do IR, extrato do FGTS, Carteira de Trabalho Digital, Demonstrativo de Evolução da Caixa, comprovante do FIES no SISBB)');
}

// ---------------------------------------------------------------------------
// Filtros e análise do histórico (03/10/2026 - Tiago: "Muitas informações
// parecem engessadas. Inclua filtro nos gráficos e tabelas ... seguindo o
// padrão das outras telas")
// ---------------------------------------------------------------------------

export const PERIODOS_HISTORICO = ['5a', '10a', 'tudo'].map((id) => ({ id, nome: rotuloPeriodo(id) }));
export const PERIODOS_ORIGEM = ['6m', '12m', '24m', 'tudo'].map((id) => ({ id, nome: rotuloPeriodo(id) }));
const fimDoMes = (mes) => { const [a, m] = String(mes).split('-').map(Number); const d = new Date(Date.UTC(a, m, 0)); return `${mes}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const dataLinhaHist = (l, hoje) => (l.hoje ? String(hoje).slice(0, 10) : `${l.ano}-12-31`);

/** Linhas do histórico anual dentro do período ('5a' | '10a' | 'tudo' | { inicio, fim }). */
export function recortarHistorico(hist, periodo, hoje) {
  const linhas = hist || [];
  if (!periodo || periodo === 'tudo') return linhas;
  if (typeof periodo === 'object') {
    const a = String(periodo.inicio || '0000'); const b = String(periodo.fim || '9999');
    return linhas.filter((l) => { const d = dataLinhaHist(l, hoje); return d >= a && d <= b; });
  }
  const anos = ({ '3a': 3, '5a': 5, '10a': 10 })[periodo];
  if (!anos) return linhas;
  const anoHoje = Number(String(hoje).slice(0, 4));
  return linhas.filter((l) => l.ano >= anoHoje - anos);
}

/** Texto curto do período ("últimos 12 meses", "mar/25 a set/26"). */
export function rotuloPeriodoOrigem(o, periodo) {
  if (!o) return '';
  if (periodo && typeof periodo === 'object') return `${mesAno(o.de)} a ${mesAno(o.ate)}`;
  return ({ '6m': 'últimos 6 meses', '12m': 'últimos 12 meses', '24m': 'últimos 24 meses', tudo: `desde ${mesAno(o.de)}` })[periodo] || `${mesAno(o.de)} a ${mesAno(o.ate)}`;
}

/**
 * Série pro card "Análise" (analise-grafico.js) embaixo do gráfico do
 * histórico: o patrimônio líquido de 31/12 de cada ano (e o de hoje), com o
 * dinheiro novo de cada ano (aportes, parcelas que abateram dívida, compra
 * do apê - o "fluxo" de patrimonio-inflacao.js!seriesReais) pra comparar o
 * crescimento SEM os aportes com o CDI e o IPCA (historicoMensal traz
 * indiceCdi/indiceIpca). Só os anos em que o site tem o mês a mês (antes
 * disso não dá pra separar aporte de rendimento). null = sem dado bastante.
 */
export function analiseHistorico(linhas, d, ctx = null) {
  if (!linhas || linhas.length < 2 || !d) return null;
  let base = null;
  try { base = seriesReais(d, { hoje: d.hoje, ctx }); } catch (e) { base = null; }
  const pts = (base && base.pontos) || [];
  if (pts.length < 2) return null;
  const mesHoje = mesDe(d.hoje);
  const mesDaLinha = (l) => (l.hoje ? mesHoje : `${l.ano}-12`);
  let usaveis = linhas.filter((l) => mesDaLinha(l) >= pts[0].mes);
  // rentabilidade sobre um patrimônio negativo (dívida maior que tudo) não faz
  // sentido: a análise começa depois do último fim de ano com líquido ≤ 0
  const ultNeg = usaveis.map((l) => l.liquido > 0).lastIndexOf(false);
  if (ultNeg >= 0) usaveis = usaveis.slice(ultNeg + 1);
  if (usaveis.length < 2) return null;
  const serie = usaveis.map((l, k) => {
    const m = mesDaLinha(l);
    const antes = k ? mesDaLinha(usaveis[k - 1]) : null;
    const fluxo = k ? pts.filter((p) => p.mes > antes && p.mes <= m && num(p.fluxo)).reduce((s2, p) => s2 + p.fluxo, 0) : 0;
    return { data: dataLinhaHist(l, d.hoje), valor: l.liquido, fluxo: Math.round(fluxo * 100) / 100 };
  });
  const dataMes = (m) => (m === mesHoje ? String(d.hoje).slice(0, 10) : fimDoMes(m));
  const hm = (d.historicoMensal || []).filter((p) => p && /^\d{4}-\d{2}$/.test(String(p.mes)) && p.mes <= mesHoje);
  const indices = {};
  const cdi = hm.filter((p) => num(p.indiceCdi) && p.indiceCdi > 0).map((p) => ({ data: dataMes(p.mes), valor: p.indiceCdi }));
  const ipca = hm.filter((p) => num(p.indiceIpca) && p.indiceIpca > 0).map((p) => ({ data: dataMes(p.mes), valor: p.indiceIpca }));
  if (cdi.length >= 2) indices.CDI = cdi;
  if (ipca.length >= 2) indices.IPCA = ipca;
  return {
    serie, indices, periodo: { inicio: serie[0].data, fim: serie[serie.length - 1].data },
    analise: analisarSerie({ serie, indices, periodo: { inicio: serie[0].data, fim: serie[serie.length - 1].data }, nome: 'O patrimônio líquido (sem contar o dinheiro novo)', indiceReferencia: indices.IPCA ? 'IPCA' : null, classe: 'patrimonio' }),
  };
}

const tabsPeriodo = (periodos, id, rotulo) => `<div class="filter-tabs pt-filtro" id="${id}" role="group" aria-label="${esc(rotulo)}">${periodos.map((p) => `<button type="button" class="filter-tab" data-periodo="${p.id}">${esc(p.nome)}</button>`).join('')}</div>`;

// ---------------------------------------------------------------------------
// Aba
// ---------------------------------------------------------------------------

function base64ParaBytes(b64) {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Monta a aba. 03/10/2026: `getPatrimonioImpl` pode ser o carregador
 * compartilhado da página (a mesma resposta serve as 3 abas e o painel de
 * Documentos) e `aoMudarDados(dados, ctx)` avisa a página a cada redesenho
 * (carregou, salvou um bloco, importou documentos, mudou preferência) pra
 * Renda e Orçamentos, o simulador e os Documentos acompanharem.
 */
export function montarAbaPatrimonio({
  doc, el, token, getPatrimonioImpl = getPatrimonio, salvarImpl = salvarPatrimonio, getArquivosIrImpl = getArquivosIrPatrimonio,
  getArquivoIrImpl = getArquivoIrPatrimonio, carregarPdf = carregarPdfJs, lerPdf = extrairLinhasPdf, atrasoPrefsMs = 700,
  aoMudarDados = null,
}) {
  let dados = null;
  let ctx = null;
  const est = {
    prefs: {}, editando: null, importacao: null, drive: null, msgEditor: '', perHist: 'tudo', perOrigem: '12m',
  };
  let timerPrefs = null;
  let inflacao = null;
  const filtros = {};
  const avisar = () => { if (typeof aoMudarDados === 'function') { try { aoMudarDados(dados, ctx); } catch (e) { /* a aba continua */ } } };

  function esqueleto() {
    el.innerHTML = `
      <section class="pt-hero" id="ptHero" aria-label="Resumo do patrimônio"></section>
      <section class="card pt-card pt-fontes-card" id="ptFontesTopo" hidden></section>
      <div id="ptPainel"></div>
      <section class="pt-sec"><div class="pt-sec-cab"><h2>O que você tem e o que você deve</h2><span class="pt-hint">investimentos vêm do site; financiamento e FIES andam sozinhos mês a mês</span></div>
        <div class="card pt-card pt-bal" id="ptBalanco"></div></section>
      <section class="pt-sec" id="ptSecHist"><div class="pt-sec-cab"><h2>Como seu patrimônio cresceu</h2><span class="pt-hint">31/12 de cada ano · hoje pelo site</span></div>
        <div class="card pt-card"><div class="pt-graf-cab">${tabsPeriodo(PERIODOS_HISTORICO, 'ptFiltroHist', 'Período do histórico')}<span class="pt-hint" id="ptHistHint"></span></div>
          <div class="pt-grafico" id="ptGHist"></div>
          <div class="pt-analise" id="ptAnaliseHist" hidden></div>
          <div class="tabela-wrap" id="ptTHist"></div><p class="pt-nota pt-nota-pad" id="ptNotaHist"></p></div>
        <div class="card pt-card pt-pad"><div class="pt-card-cab pt-card-cab-filtro"><h3>De onde veio o crescimento</h3><span class="pt-hint" id="ptOrigemHint"></span>${tabsPeriodo(PERIODOS_ORIGEM, 'ptFiltroOrigem', 'Período de "de onde veio o crescimento"')}</div><div id="ptOrigem"></div></div></section>
      <div id="ptInflacao" class="pt-inflacao"></div>
      <section class="pt-sec"><div class="pt-sec-cab"><h2>Aposentadoria: quanto, quando e o que muda o prazo</h2><span class="pt-hint">em dinheiro de hoje (rendimento acima da inflação)</span><a class="pt-link pt-sec-link" href="../metas.html">Ver ou criar a meta de aposentadoria em Metas e Objetivos ›</a></div>
        <div class="card pt-card pt-pad" id="ptMeta"></div>
        <div class="card pt-card pt-fut"><div class="pt-fut-ctl" id="ptCtl"></div><div class="pt-fut-res"><div class="grid-kpi" id="ptTiles"></div><div class="pt-grafico" id="ptGProj"></div></div></div></section>
      <section class="pt-sec"><div class="pt-sec-cab"><h2>Como acelerar</h2><span class="pt-hint">calculado com os seus números - quanto cada coisa muda o prazo</span></div><div class="pt-dicas" id="ptDicas"></div></section>
      <section class="pt-sec" id="ptSecFontes"><div class="pt-sec-cab"><h2>Seus documentos</h2><span class="pt-hint">de onde vêm os números · importe aqui o IR, o FGTS, a Carteira de Trabalho e os extratos do financiamento e do FIES</span></div><div class="card pt-card pt-pad" id="ptFontes"></div></section>
      <input type="file" id="ptArquivo" accept="application/pdf,.pdf" multiple hidden>`;
    tornarRecolhiveis(el, { seletor: ':scope > .pt-sec', cabecalho: '.pt-sec-cab', doc });
    ligar();
    ligarFiltros();
  }

  function ligarFiltros() {
    const ligar1 = (id, chave, inicial, aoMudar) => {
      const tabs = el.querySelector(`#${id}`);
      if (!tabs) return;
      let ctl = null;
      try { ctl = ligarFiltroPeriodo(doc, tabs, { chave, periodoInicial: inicial, comChip: true, aoMudar }); } catch (e) { ctl = null; }
      if (ctl) { filtros[id] = ctl; return ctl.periodo; }
      tabs.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-periodo]');
        if (!b) return;
        tabs.querySelectorAll('.filter-tab').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        aoMudar(b.dataset.periodo);
      });
      const b0 = tabs.querySelector(`[data-periodo="${inicial}"]`);
      if (b0) { b0.classList.add('active'); b0.setAttribute('aria-pressed', 'true'); }
      return inicial;
    };
    est.perHist = ligar1('ptFiltroHist', 'patrimonio.historico', est.perHist, (p) => { est.perHist = p; desenharHistorico(); }) || est.perHist;
    est.perOrigem = ligar1('ptFiltroOrigem', 'patrimonio.origem', est.perOrigem, (p) => { est.perOrigem = p; desenharOrigem(); }) || est.perOrigem;
  }

  function atualizarLimitesFiltros() {
    if (!ctx) return;
    const hoje = String(dados.hoje).slice(0, 10);
    const h0 = ctx.hist[0];
    const hm = (dados.historicoMensal || []).filter((x) => num(x.patrimonio));
    const lims = {
      ptFiltroHist: h0 ? { min: `${h0.ano}-01-01`, max: hoje } : null,
      ptFiltroOrigem: hm.length ? { min: `${hm[0].mes}-01`, max: hoje } : null,
    };
    Object.entries(filtros).forEach(([id, c]) => { if (lims[id]) try { c.definirLimites(lims[id]); } catch (e) { /* ok */ } });
  }

  function desenharHistorico() {
    if (!ctx || !el.querySelector('#ptGHist')) return;
    const linhas = recortarHistorico(ctx.hist, est.perHist, dados.hoje);
    const hint = el.querySelector('#ptHistHint');
    const caixaHist = el.querySelector('#ptGHist');
    if (linhas.length < 2) {
      limparGrafico(caixaHist);
      caixaHist.innerHTML = '<p class="pt-nota pt-nota-pad">Pouco histórico neste período (precisa de pelo menos 2 fins de ano). Escolha um período maior.</p>';
    } else montarGrafico(caixaHist, opcoesHistoricoPatrimonio(linhas));
    if (hint) hint.textContent = linhas.length >= 2 ? `${linhas[0].ano} → ${linhas[linhas.length - 1].hoje ? 'hoje' : linhas[linhas.length - 1].ano}` : '';
    el.querySelector('#ptTHist').innerHTML = linhas.length ? htmlHistoricoTabela(linhas) : '';
    const box = el.querySelector('#ptAnaliseHist');
    if (box) {
      let a = null;
      try { a = analiseHistorico(linhas, dados, ctx); } catch (e) { a = null; }
      renderAnalise(doc, box, a && a.analise && a.analise.pontos && a.analise.pontos.length ? a.analise : null);
    }
  }

  function desenharOrigem() {
    if (!dados || !el.querySelector('#ptOrigem')) return;
    let o = null;
    try { o = origemCrescimento(dados, est.perOrigem); } catch (e) { o = null; }
    el.querySelector('#ptOrigem').innerHTML = o ? htmlCrescimento(o) : '<p class="pt-nota">Sem meses suficientes neste período (o site começa a contar no 1º mês do histórico da Início).</p>';
    montarBarrasDivergentes(el.querySelector('#ptOrigem'));
    el.querySelector('#ptOrigemHint').textContent = rotuloPeriodoOrigem(o, est.perOrigem);
  }

  function recalcular() { ctx = contextoPatrimonio(dados, est.prefs); }

  function desenharFuturo({ controles = true } = {}) {
    if (controles) el.querySelector('#ptCtl').innerHTML = htmlFuturoControles(ctx);
    else {
      el.querySelector('#ptRendV').textContent = formatPct(ctx.rendimento, 1);
      el.querySelector('#ptAporteV').textContent = brl0(ctx.aporte);
    }
    el.querySelector('#ptTiles').innerHTML = htmlFuturoTiles(ctx);
    const { proj, alvo, quando, libs } = ctx;
    const fim = Math.min(600, Math.max(proj.chegou != null ? proj.chegou + 36 : 360, ...libs.map((l) => l.mes + 12), 120));
    const marcos = libs.map((l) => ({ m: l.mes, titulo: l.nome, texto: mesAno(somarMeses(dados.hoje, l.mes)) }));
    const cruza = (lim) => { const p = proj.pontos.find((x) => x.v >= lim); return p ? p.m : null; };
    [5e5, 1e6, 2e6].filter((lim) => lim < alvo * 0.95).forEach((lim) => { const m = cruza(lim); if (m) marcos.push({ m, titulo: mil(lim), texto: quando(m).rotulo }); });
    if (num(ctx.coast)) { const m = cruza(ctx.coast); if (m && (proj.chegou == null || m < proj.chegou)) marcos.push({ m, titulo: 'Coast FI', texto: `daí pra frente, sem aportar, chega na meta aos ${ctx.p.idadeAlvo}` }); }
    const caixaProj = el.querySelector('#ptGProj');
    const specProj = opcoesProjecaoPatrimonio({ pontos: proj.pontos, alvo, chegou: proj.chegou, marcos, fim, quando });
    if (specProj) montarGrafico(caixaProj, specProj); else { limparGrafico(caixaProj); caixaProj.innerHTML = '<p class="pt-nota pt-nota-pad">Sem dados pra projetar.</p>'; }
    el.querySelector('#ptDicas').innerHTML = htmlDicas(dicasAcelerar(ctx));
  }

  function desenharPainel() {
    const painel = el.querySelector('#ptPainel');
    let html = '';
    if (est.importacao) html += `<section class="card pt-card pt-pad pt-painel">${htmlImportacao(est.importacao)}</section>`;
    if (est.drive) html += `<section class="card pt-card pt-pad pt-painel">${htmlDriveIr(est.drive)}</section>`;
    if (est.editando) html += `<section class="card pt-card pt-pad pt-painel">${htmlEditor(est.editando, ctx)}</section>`;
    painel.innerHTML = html;
    if (est.msgEditor) { const m = painel.querySelector('.pt-form-msg'); if (m) { m.textContent = est.msgEditor; m.classList.add('bad'); } }
  }

  function desenhar() {
    if (!el.querySelector('#ptHero')) esqueleto();
    recalcular();
    el.querySelector('#ptHero').innerHTML = htmlHero(ctx);
    montarComposicoes(el.querySelector('#ptHero'), brl0);
    const faltando = !ctx.cfg.imovel || !ctx.cfg.financiamento || !(ctx.cfg.ir && ctx.cfg.ir.anos && ctx.cfg.ir.anos.length);
    const fontes = htmlFontes(ctx, { driveConfigurado: !!dados.pastaIrConfigurada });
    const topo = el.querySelector('#ptFontesTopo');
    topo.hidden = !faltando;
    topo.innerHTML = faltando ? `<div class="pt-card-cab"><h3>Monte o seu patrimônio</h3><span class="pt-hint">importe os documentos (PDF) ou digite - leva uns minutos, uma vez só</span></div>${fontes}` : '';
    el.querySelector('#ptSecFontes').hidden = faltando;
    el.querySelector('#ptFontes').innerHTML = faltando ? '' : fontes;
    el.querySelector('#ptBalanco').innerHTML = htmlBalanco(ctx);
    montarComposicoes(el.querySelector('#ptBalanco'), brl0);
    desenharHistorico();
    el.querySelector('#ptNotaHist').innerHTML = htmlHistoricoNota(ctx);
    desenharOrigem();
    atualizarLimitesFiltros();
    desenharInflacao();
    el.querySelector('#ptMeta').innerHTML = htmlMeta(ctx);
    desenharFuturo();
    desenharPainel();
    if (dados.avisos) {
      const av = Object.entries(dados.avisos).map(([k, v]) => `${k}: ${v}`).join(' · ');
      el.querySelector('#ptNotaHist').insertAdjacentHTML('beforeend', `<span class="pt-aviso bad"> Parte dos dados não veio: ${esc(av)}</span>`);
    }
    avisar();
  }

  // Patrimônio vs. inflação (patrimonio-inflacao.js), logo depois do histórico
  function desenharInflacao() {
    const box = el.querySelector('#ptInflacao');
    if (!box) return;
    try {
      if (!inflacao) inflacao = montarPatrimonioVsInflacao(box, { patrimonio: dados, ctx, doc, hoje: dados.hoje });
      else inflacao.atualizar({ patrimonio: dados, ctx, hoje: dados.hoje });
    } catch (e) {
      box.innerHTML = `<p class="pt-nota">Não deu pra montar "Patrimônio vs. inflação": ${esc(e.message || e)}</p>`;
    }
  }

  function salvarPrefsDepois() {
    if (timerPrefs) clearTimeout(timerPrefs);
    const salvar = async () => {
      timerPrefs = null;
      const valor = { ...PREFS_PADRAO, ...((dados.config && dados.config.preferencias) || {}), ...est.prefs };
      let r;
      try { r = await salvarImpl(token, 'preferencias', valor); } catch (e) { r = null; }
      if (r && r.ok && r.config) { dados.config = r.config; est.prefs = {}; }
    };
    if (!atrasoPrefsMs) { salvar(); return; }
    timerPrefs = setTimeout(salvar, atrasoPrefsMs);
  }

  function mudarPrefs(novo, { controles = false, meta = false } = {}) {
    Object.assign(est.prefs, novo);
    recalcular();
    if (meta) el.querySelector('#ptMeta').innerHTML = htmlMeta(ctx);
    desenharFuturo({ controles });
    salvarPrefsDepois();
    avisar();
  }

  async function salvarBloco(chave, valor) {
    let r;
    try { r = await salvarImpl(token, chave, valor); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (r && r.ok && r.config) dados.config = r.config;
    return r || { ok: false, erro: 'sem resposta' };
  }

  async function lerArquivos(arquivos) {
    est.importacao = est.importacao || { itens: [] };
    est.drive = null;
    let lib;
    for (const arq of arquivos) {
      est.importacao.lendo = arq.nome || arq.name;
      desenharPainel();
      try {
        lib = lib || await carregarPdf(doc);
        // 27/09/2026: NÃO usar "arq.bytes" - todo File/Blob moderno já tem um
        // MÉTODO bytes() (Blob.prototype.bytes), e o pdf.js recebia a função
        // em vez dos dados ("Invalid PDF binary data"). O PDF do Drive vem em
        // arq.conteudo (Uint8Array); o do seletor, pelo arrayBuffer().
        const bytes = arq.conteudo instanceof Uint8Array ? arq.conteudo : new Uint8Array(await arq.arrayBuffer());
        const linhas = await lerPdf(lib, bytes);
        const r = lerDocumento(linhas);
        est.importacao.itens.push({ arquivo: arq.nome || arq.name, ...r, incluir: true });
      } catch (e) {
        est.importacao.itens.push({ arquivo: arq.nome || arq.name, tipo: null, erro: `não deu pra ler: ${e.message || e}` });
      }
    }
    est.importacao.lendo = null;
    desenharPainel();
    const p = el.querySelector('#ptPainel');
    if (p && p.scrollIntoView) try { p.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ok */ }
  }

  async function salvarImportacao() {
    const imp = est.importacao;
    const blocos = mesclarImportacao(dados.config || {}, imp.itens);
    const ordem = ['imovel', 'ir', 'carreira', 'fgts', 'financiamento', 'fies', 'preferencias'].filter((k) => blocos[k]);
    if (!ordem.length) return;
    imp.salvando = true; imp.msg = ''; imp.erroSalvar = false;
    desenharPainel();
    for (const chave of ordem) {
      const r = await salvarBloco(chave, blocos[chave]);
      if (!r.ok) {
        imp.salvando = false; imp.erroSalvar = true;
        imp.msg = `Não deu pra salvar (${chave}): ${r.erro || 'erro desconhecido'}`;
        desenharPainel();
        return;
      }
    }
    est.importacao = null;
    desenhar();
  }

  async function abrirDrive() {
    est.drive = { carregando: true, arquivos: [] };
    desenharPainel();
    let r;
    try { r = await getArquivosIrImpl(token); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) { est.drive = { erro: 'Não consegui ver a pasta do Drive agora. Tente de novo em instantes.', detalhe: String((r && r.erro) || 'erro'), arquivos: [] }; desenharPainel(); return; }
    if (!r.configurado) { est.drive = { erro: 'A pasta do IR ainda não foi configurada: rode configurarPastaIrDireto() uma vez no editor do Apps Script.', arquivos: [] }; desenharPainel(); return; }
    const anos = new Set(((dados.config.ir && dados.config.ir.anos) || []).map((a) => String(a.exercicio || '')));
    est.drive = { arquivos: (r.arquivos || []).map((a) => ({ ...a, marcado: !anos.has(String((String(a.pasta).match(/\d{4}/) || [])[0])) })) };
    desenharPainel();
  }

  async function lerDoDrive() {
    const marcados = est.drive.arquivos.filter((a) => a.marcado);
    const arquivos = [];
    est.drive = { carregando: true, arquivos: [] };
    desenharPainel();
    for (const a of marcados) {
      let r;
      try { r = await getArquivoIrImpl(token, a.id); } catch (e) { r = { ok: false, erro: String(e) }; }
      if (r && r.ok && r.base64) arquivos.push({ nome: `${a.pasta}/${a.nome}`, conteudo: base64ParaBytes(r.base64) });
      else {
        est.importacao = est.importacao || { itens: [] };
        est.importacao.itens.push({ arquivo: `${a.pasta}/${a.nome}`, tipo: 'ir', erro: (r && r.erro) || 'não veio' });
      }
    }
    est.drive = null;
    await lerArquivos(arquivos);
  }

  function ligar() {
    el.addEventListener('click', async (ev) => {
      const seg = ev.target.closest('[data-seg] [data-v]');
      if (seg) {
        const grupo = seg.closest('[data-seg]').dataset.seg;
        const v = seg.dataset.v;
        if (grupo === 'taxaSaque') mudarPrefs({ taxaSaque: v ? Number(v) : null }, { controles: true, meta: true });
        else if (grupo === 'aporteModo') mudarPrefs({ aporteModo: v }, { controles: true });
        return;
      }
      const b = ev.target.closest('[data-acao]');
      if (!b || !el.contains(b)) return;
      const acao = b.dataset.acao;
      if (acao === 'importar') el.querySelector('#ptArquivo').click();
      else if (acao === 'drive-ir') await abrirDrive();
      else if (acao === 'drive-fechar') { est.drive = null; desenharPainel(); }
      else if (acao === 'drive-ler') await lerDoDrive();
      else if (acao === 'imp-cancelar') { est.importacao = null; desenharPainel(); }
      else if (acao === 'imp-salvar') await salvarImportacao();
      else if (acao.startsWith('editar:')) {
        est.editando = acao.slice(7); est.msgEditor = '';
        desenharPainel();
        const p = el.querySelector('#ptPainel');
        if (p && p.scrollIntoView) try { p.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ok */ }
        const primeiro = p && p.querySelector('input');
        if (primeiro) primeiro.focus();
      } else if (acao === 'editor-fechar') { est.editando = null; desenharPainel(); }
      else if (acao === 'outro-adicionar') {
        const box = el.querySelector('.pt-outros');
        const k = box.querySelectorAll('.pt-outro').length + 1000;
        if (box.querySelector('p')) box.innerHTML = '';
        box.insertAdjacentHTML('beforeend', `<div class="pt-outro" data-k="${k}"><span class="pt-input largo"><input data-o="nome" aria-label="Nome" maxlength="60" placeholder="Ex.: Carro"></span><select data-o="tipo" aria-label="Tipo"><option value="bem">Bem</option><option value="divida">Dívida</option></select><span class="pt-input"><i>R$</i><input data-o="valor" inputmode="decimal" aria-label="Valor"></span><button type="button" class="pt-mini" data-acao="outro-remover">remover</button></div>`);
        box.querySelector('.pt-outro:last-child input').focus();
      } else if (acao === 'outro-remover') b.closest('.pt-outro').remove();
    });

    el.addEventListener('submit', async (ev) => {
      const form = ev.target.closest('form[data-form]');
      if (!form) return;
      ev.preventDefault();
      const r = lerFormulario(form, ctx);
      const msg = form.querySelector('.pt-form-msg');
      if (r.erro) { msg.textContent = r.erro; msg.classList.add('bad'); return; }
      const botao = form.querySelector('button[type="submit"]');
      botao.disabled = true; botao.textContent = 'Salvando…';
      const s = await salvarBloco(r.chave, r.valor);
      if (!s.ok) { botao.disabled = false; botao.textContent = 'Salvar'; msg.textContent = `Não deu pra salvar: ${s.erro || 'erro'}`; msg.classList.add('bad'); return; }
      est.editando = null;
      desenhar();
    });

    el.addEventListener('change', async (ev) => {
      const t = ev.target;
      if (t.id === 'ptArquivo') { const arqs = [...(t.files || [])]; t.value = ''; if (arqs.length) await lerArquivos(arqs); return; }
      if (t.id === 'ptParcelas') mudarPrefs({ parcelasViramAporte: t.checked });
      else if (t.id === 'ptReserva') mudarPrefs({ incluirReservaNaAposentadoria: t.checked });
      else if (t.dataset && t.dataset.descontar !== undefined) {
        const nomes = [...el.querySelectorAll('[data-descontar]')].filter((c) => c.checked).map((c) => c.dataset.descontar);
        mudarPrefs({ descontar: nomes }, { meta: true, controles: true });
      } else if (t.dataset && t.dataset.imp !== undefined) { est.importacao.itens[Number(t.dataset.imp)].incluir = t.checked; desenharPainel(); }
      else if (t.dataset && t.dataset.drive !== undefined) { est.drive.arquivos[Number(t.dataset.drive)].marcado = t.checked; desenharPainel(); }
      else if (t.id === 'ptRend' || t.id === 'ptAporte') salvarPrefsDepois();
      else if (t.id === 'ptIdade') { const v = lerValorBR(t.value); if (num(v) && v >= 30 && v <= 90) mudarPrefs({ idadeAlvo: Math.round(v) }); }
    });

    el.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.id === 'ptRend') { Object.assign(est.prefs, { rendimentoReal: Number(t.value) }); recalcular(); desenharFuturo({ controles: false }); }
      else if (t.id === 'ptAporte') { Object.assign(est.prefs, { aporteModo: 'manual', aporteManual: Number(t.value) }); recalcular(); desenharFuturo({ controles: false }); el.querySelectorAll('[data-seg="aporteModo"] button').forEach((x) => x.classList.remove('on')); }
    });
  }

  async function carregar() {
    let r;
    try { r = await getPatrimonioImpl(token); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) {
      // 06/10/2026 (A-60/A-61): texto humano + "Tentar de novo"; o detalhe técnico fica num <details>
      if (!dados) mostrarErroCarga(el, { tela: 'Patrimônio', resposta: r, aoTentar: () => carregar(), doc });
      return;
    }
    dados = r;
    dados.config = dados.config || {};
    desenhar();
  }

  el.innerHTML = '<div class="og-carregando" aria-hidden="true"><span class="skel skel-bloco og-skel-150"></span><span class="skel skel-bloco og-skel-320"></span></div>';
  const pronto = carregar();
  /** Abre a importação de PDFs (o seletor de arquivos) e rola até os documentos. */
  function abrirImportacao() {
    const inp = el.querySelector('#ptArquivo');
    if (inp) inp.click();
    rolarAte('#ptSecFontes:not([hidden]), #ptFontesTopo:not([hidden])');
  }
  function rolarAte(sel) {
    const alvo = el.querySelector(sel);
    if (alvo && alvo.scrollIntoView) try { alvo.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ok */ }
  }

  return {
    pronto,
    recarregar: carregar,
    get dados() { return dados; },
    get contexto() { return ctx; },
    lerArquivos,
    abrirImportacao,
    /** Declarações do IR direto da pasta do Drive (lista pra marcar e ler). */
    abrirDriveIr: async () => { await pronto; if (!dados) return; rolarAte('#ptPainel'); await abrirDrive(); },
    rolarAte,
  };
}
