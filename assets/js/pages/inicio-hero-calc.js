/**
 * inicio-hero-calc.js - 07/10/2026 (Tiago: "na Home, o patrimônio líquido em destaque, com o que ele rendeu de verdade
 * contra a inflação"): o MODELO do hero "Patrimônio líquido" da Início, sem DOM (a tela é inicio-hero.js).
 *
 * Nenhuma conta nova: tudo vem do que a tela Organização > Patrimônio e a seção "Patrimônio vs. inflação" já usam -
 *  - patrimônio líquido de HOJE e a composição (tudo que você tem / dívidas): balanco() de patrimonio-calc.js (é o mesmo
 *    `contextoPatrimonio(d).b` da Organização; aqui não se chama contextoPatrimonio pra não puxar a tela inteira de
 *    Organização - ver `ritmo` abaixo);
 *  - série mensal, dinheiro novo (fluxos), rendimento sem aportes (Dietz) e IPCA do período: seriesReais() + resumoPeriodo()
 *    de patrimonio-inflacao.js, com os mesmos períodos ('12m', 'tudo' e intervalos personalizados).
 * "Mês atual" e "No ano" são intervalos personalizados terminando hoje (janelaDoPeriodo já aceita).
 *
 * Datas 'aaaa-mm-dd'. Todas as funções são puras (testes em tests/inicio-hero.test.js, com dados inventados).
 */
import { balanco, aporteMedio } from './patrimonio-calc.js';
import { seriesReais, resumoPeriodo } from './patrimonio-inflacao.js';
import { formatBRL, formatBRL0, formatBRLMil, formatMesAno, formatPctAbs, formatPctSinal, formatNumeroBR } from '../format.js';
import { ehPeriodoPersonalizado } from '../periodo-personalizado.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Presets do filtro do hero (ids do catálogo de periodo-personalizado.js) e os textos que a Home mostra neles. */
export const PERIODOS_HERO = ['mes', 'ano', '12m', 'tudo'];
export const PERIODO_PADRAO_HERO = '12m';
export const ROTULOS_PERIODO_HERO = { '12m': '12 meses', tudo: 'Desde o início' };
const DESCRICAO_PERIODO = { mes: 'no mês', ano: 'no ano', '12m': 'em 12 meses', tudo: 'desde o início' };

/** Queda "forte" do patrimônio sem contar o dinheiro novo: a partir daqui o destaque fica vermelho (antes disso, neutro). */
export const QUEDA_FORTE = -0.10;

/** Id da interface -> período entendido por resumoPeriodo ('12m' | 'tudo' | { inicio, fim }). */
export function periodoDoHero(periodo, hoje) {
  if (ehPeriodoPersonalizado(periodo)) return { inicio: periodo.inicio, fim: periodo.fim };
  const h = String(hoje || '');
  if (periodo === 'mes' && /^\d{4}-\d{2}/.test(h)) return { inicio: `${h.slice(0, 7)}-01`, fim: h.slice(0, 10) };
  if (periodo === 'ano' && /^\d{4}/.test(h)) return { inicio: `${h.slice(0, 4)}-01-01`, fim: h.slice(0, 10) };
  if (periodo === 'tudo') return 'tudo';
  return '12m';
}

/** "R$ 108,6 mil" / "R$ 1,24 mi" / "R$ 820" - valor curto pra frase corrida (sempre positivo; o sinal vai no texto). */
export function reaisCurto(valor) {
  const a = Math.abs(valor);
  if (a >= 1e6) return `R$ ${formatNumeroBR(a / 1e6, 2)} mi`;
  if (a >= 1000) return `R$ ${formatNumeroBR(a / 1000, 1)} mil`;
  return `R$ ${formatNumeroBR(a, 0)}`;
}

function descricaoPeriodo(periodoUi) {
  return ehPeriodoPersonalizado(periodoUi) ? 'no período' : (DESCRICAO_PERIODO[periodoUi] || DESCRICAO_PERIODO['12m']);
}

/** Frase de destaque ("Sem contar o dinheiro novo, o patrimônio rendeu +x% - y% acima da inflação (IPCA z%)"). */
export function destaqueRendimento(r) {
  const rend = r && r.pl ? r.pl.acumulado : null;
  if (!num(rend)) return null;
  const real = r.pl.real;
  const ipca = r.ipca ? r.ipca.acumulado : null;
  const tom = rend >= 0 && (!num(real) || real >= 0) ? 'bom' : (rend <= QUEDA_FORTE ? 'ruim' : 'neutro');
  const partes = [{ t: 'Sem contar o dinheiro novo, o patrimônio ' }];
  partes.push(rend >= 0 ? { t: 'rendeu ' } : { t: '' });
  partes.push({ b: rend >= 0 ? formatPctSinal(rend, 1) : `perdeu ${formatPctAbs(rend, 1)}` });
  if (num(real)) {
    partes.push({ t: ' - ' });
    if (Math.abs(real) < 0.0005) partes.push({ b: 'no mesmo ritmo da inflação' });
    else partes.push({ b: `${formatPctAbs(real, 1)} ${real > 0 ? 'acima' : 'abaixo'} da inflação` });
  }
  if (num(ipca)) partes.push({ t: ' (IPCA ' }, { b: formatPctAbs(ipca, 1) }, { t: ')' });
  const lista = partes.filter((p) => (p.t || p.b));
  return { tom, partes: lista, texto: lista.map((p) => p.t || p.b).join(''), rendimento: rend, acimaInflacao: num(real) ? real : null, ipca: num(ipca) ? ipca : null };
}

/** "Dos +R$ N: R$ A foi dinheiro novo (...) e R$ B o patrimônio rendendo sozinho (...)". */
export function decomposicaoVariacao(r, { fora = null } = {}) {
  if (!r || !r.pl || !num(r.fluxos) || !num(r.retornos)) return null;
  const total = r.pl.variacao;
  const novo = r.fluxos;
  const rend = r.retornos;
  const cab = total >= 0 ? `Dos +${reaisCurto(total)}: ` : `Variação de −${reaisCurto(total)}: `;
  const doNovo = novo >= 0 ? `${reaisCurto(novo)} foi dinheiro novo (aportes e parcelas que abateram dívida)` : `${reaisCurto(novo)} saiu em retiradas e dívidas que cresceram`;
  const doRend = rend >= 0 ? `${reaisCurto(rend)} o patrimônio rendendo sozinho (investimentos e valorização do apê)` : `o patrimônio perdeu ${reaisCurto(rend)} sozinho (investimentos e valorização do apê)`;
  // 07/10/2026: investimento fora da carteira (marcado "conta no meu patrimônio" numa meta) entra no patrimônio só a partir de hoje - o site não tem o histórico dele
  const notaFora = fora && fora.total > 0 ? ` Dentro do dinheiro novo estão ${reaisCurto(fora.total)} de ${fora.nomes.join(', ')} (fora da carteira): contam no patrimônio só a partir de hoje, porque o site não tem o histórico deles - por isso não entram como rendimento.` : '';
  return { total, novo, rendimento: rend, perdeu: rend < 0, texto: `${cab}${doNovo} e ${doRend}.${notaFora}` };
}

/** O que o ⓘ explica. */
export function textoInfoRendimento(r) {
  const base = 'O crescimento total do patrimônio inclui o dinheiro novo que você colocou: aportes nos investimentos e parcelas que abateram dívida. '
    + 'Aqui é só o que o patrimônio rendeu sozinho (rentabilidade ponderada pelo tempo, a mesma da tela Patrimônio vs. inflação), comparada ao IPCA do mesmo período.';
  const est = r && r.ipca && r.ipca.estimados && r.ipca.estimados.length ? ' O IPCA dos meses mais recentes ainda não saiu e está estimado pela média dos últimos 12 meses.' : '';
  return base + est;
}

/**
 * Tudo que o hero mostra, pro período escolhido.
 *   d: resposta do getPatrimonio; periodoUi: 'mes' | 'ano' | '12m' | 'tudo' | { inicio, fim }; opções: { hoje }.
 * Sem histórico bastante pro período: `resumo` e os campos derivados ficam null (o hero mostra só o valor de hoje).
 */
export function modeloHero(d, periodoUi = PERIODO_PADRAO_HERO, { hoje = null } = {}) {
  if (!d || typeof d !== 'object') return null;
  const hj = hoje || d.hoje || '';
  const b = balanco({ ...d, hoje: hj });
  const ativos = b.ativos.filter((a) => num(a.valor) && a.valor > 0).map((a) => ({ id: a.id, nome: a.nome, valor: a.valor }));
  const dividas = b.dividas.filter((a) => num(a.valor) && a.valor > 0).map((a) => ({ id: a.id, nome: a.nome, valor: a.valor }));
  const soma = (ids) => ativos.filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.valor, 0);
  const kpis = {
    investimentos: soma(['investimentos', 'reserva']),
    ape: b.imovel ? { valor: b.imovel.seu, imovel: b.imovel.valor, financiamento: b.imovel.saldo } : null,
    dividas: b.totalDividas,
  };
  // `ritmo` = o que contextoPatrimonio(d).ritmo calcula; só é usado por seriesReais se o histórico não trouxer o aporte de cada mês
  const base = seriesReais(d, { hoje: hj, ctx: { ritmo: aporteMedio(d.historicoMensal, hj, 12) } });
  // 07/10/2026: a série é mensal (FGTS/dívidas pelo saldo do mês) e o balanço é o de HOJE - o último ponto (mês atual)
  // passa a ser o valor de hoje, pra "era X + variação = número grande" fechar; a diferença vai pro rendimento do mês.
  // 07/10/2026: investimentos FORA DA CARTEIRA (balanco() os soma em `fora`) não têm histórico no site: entram no último ponto como
  // ENTRADA de patrimônio (fluxo), não como rendimento - "era X + variação = hoje" continua fechando e a rentabilidade não infla.
  const forasB = b.ativos.filter((a) => a.fora && num(a.valor) && a.valor > 0);
  const foraTotal = forasB.reduce((s, a) => s + a.valor, 0);
  const ult = base.pontos[base.pontos.length - 1];
  if (ult && ult.mes === String(hj).slice(0, 7) && num(b.liquido) && num(ult.pl)) {
    const dif = b.liquido - ult.pl;
    base.pontos = [...base.pontos.slice(0, -1), {
      ...ult, pl: b.liquido,
      retorno: num(ult.retorno) ? ult.retorno + dif - foraTotal : ult.retorno,
      fluxo: num(ult.fluxo) ? ult.fluxo + foraTotal : ult.fluxo,
    }];
  }
  const semIndices = !!(base.ipca && base.ipca.semDados);
  const r = base.pontos.length >= 2 && !semIndices ? resumoPeriodo(base, periodoDoHero(periodoUi, hj), { hoje: hj }) : null;
  const modelo = {
    hoje: hj,
    liquido: b.liquido, totalAtivos: b.totalAtivos, totalDividas: b.totalDividas,
    ativos, dividas, kpis,
    periodo: periodoUi, descricaoPeriodo: descricaoPeriodo(periodoUi),
    semHistorico: !r,
    foraDaCarteira: foraTotal > 0 ? { total: foraTotal, itens: forasB.map((a) => ({ nome: a.nome, valor: a.valor })) } : null, // 07/10/2026
    variacao: null, destaque: null, decomposicao: null, infoRendimento: null, corte: null, serie: [], aviso: null,
  };
  if (!r) {
    modelo.aviso = 'sem histórico bastante pra esse período';
    return modelo;
  }
  modelo.variacao = {
    valor: r.pl.variacao, pct: r.pl.variacaoPct, descricao: modelo.descricaoPeriodo,
    inicioValor: r.pl.inicio, inicioMes: r.de, inicioRotulo: formatMesAno(r.de, { vazio: '' }),
  };
  modelo.destaque = destaqueRendimento(r);
  modelo.decomposicao = decomposicaoVariacao(r, foraTotal > 0 ? { fora: { total: foraTotal, nomes: forasB.map((a) => a.nome) } } : {});
  modelo.infoRendimento = textoInfoRendimento(r);
  modelo.corte = r.cortadoDe ? { desde: r.de, rotulo: formatMesAno(r.de, { vazio: '' }), texto: `Contando desde ${formatMesAno(r.de, { vazio: '' })} - antes disso o patrimônio líquido era zero ou negativo.` } : null;
  modelo.serie = r.linhas.map((l) => l.pl);
  modelo.resumo = r;
  return modelo;
}

/** Fatias do anel "tudo que você tem" (cores fixas por tipo, na ordem da paleta do kit) + o texto do centro. */
export function anelHero(modelo) {
  const COR = { imovel: 1, investimentos: 2, reserva: 3, fgts: 4 };
  const fatias = modelo.ativos.map((a, i) => ({ id: a.id, nome: a.nome, valor: a.valor, cor: COR[a.id] || 5 + (i % 3) }));
  return { fatias, centro: { valor: formatBRLMil(modelo.totalAtivos), rotulo: 'tudo que você tem' } };
}

/** As linhas da "conta": tudo que você tem − cada dívida = patrimônio líquido. */
export function contaHero(modelo) {
  return [
    { tipo: 'ativo', nome: 'Tudo que você tem', valor: formatBRL0(modelo.totalAtivos) },
    ...modelo.dividas.map((x) => ({ tipo: 'divida', nome: `− ${x.nome}`, valor: formatBRL0(x.valor) })),
    { tipo: 'total', nome: '= Patrimônio líquido', valor: formatBRL0(modelo.liquido) },
  ];
}

/** O número grande, separando os centavos ("R$ 319.573" + ",00"). */
export function valorGrande(valor) {
  const t = formatBRL(valor);
  const i = t.lastIndexOf(',');
  return i < 0 ? { principal: t, dec: '' } : { principal: t.slice(0, i), dec: t.slice(i) };
}

/** Limites do calendário de "Escolher período": do 1º mês do histórico até hoje (null sem histórico). */
export function limitesHero(d, hoje = null) {
  const hj = String(hoje || (d && d.hoje) || '').slice(0, 10);
  const meses = ((d && d.historicoMensal) || []).filter((p) => p && /^\d{4}-\d{2}$/.test(String(p.mes)) && num(p.patrimonio)).map((p) => p.mes).sort();
  if (!meses.length || !/^\d{4}-\d{2}-\d{2}$/.test(hj)) return null;
  return { min: `${meses[0]}-01`, max: hj };
}
