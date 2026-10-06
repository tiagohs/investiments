// assets/js/pages/aportes-mapa-calc.js
//
// 27/09/2026: "Aportes realizados" (aba Aportes, Transações) - o mapa de
// compras mês a mês por ativo (Tiago: "eu tenho uma tabela do lado da
// outra em 'Compras de Investimento', isso me permite perceber quais eu
// comprei e quais eu NAO comprei na última compra... Gosto que ora coloca
// quando o preço que eu irei pagar agora está mais caro ou barato da
// última vez que comprei"). Puro, sem DOM - testado em
// tests/aportes-mapa-calc.test.js.
//
// Os dados vêm de dados.lancamentos (Aportes.gs!listaLancamentosTela_,
// que já traz cambio/valorBRL do dia pros itens em dólar) e dados.classes
// (pra saber a classe/nome/moeda de cada ticker). Não refaz nada que a
// planilha já calcula - só agrupa e compara.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** ticker -> classe ('acoes'|'fiis'|'acoesEua'), a partir de dados.classes. */
export function classePorTicker(classes) {
  const mapa = {};
  ['acoes', 'fiis', 'acoesEua'].forEach((c) => (classes[c] || []).forEach((a) => { mapa[a.ticker] = c; }));
  return mapa;
}

function classeDoLancamento_(l, mapaClasse) {
  if (l.destino === 'transacoesUsa') return 'acoesEua';
  if (l.destino === 'rendaFixa') return 'rendaFixa';
  return mapaClasse[l.ativo] || (/11[A-Z]?$/.test(l.ativo) ? 'fiis' : 'acoes');
}

/**
 * Todas as COMPRAS/aplicações de dados.lancamentos, já com a classe
 * resolvida - uma lista só, reaproveitada pra qualquer classe/ativo (o
 * mapa troca de classe sem refiltrar do zero).
 */
export function todasAsCompras(lancamentos, mapaClasse) {
  const out = [];
  (lancamentos || []).forEach((l) => {
    if (l.destino === 'rendaFixa') {
      if (/compra|aplica/i.test(l.tipo) && num(l.valor) > 0) {
        out.push({ ativo: l.ativo, data: l.data, qtd: null, preco: null, valor: l.valor, moeda: 'BRL', classe: 'rendaFixa' });
      }
      return;
    }
    if ((l.destino === 'transacoes' || l.destino === 'transacoesUsa') && /compra/i.test(l.tipo)) {
      out.push({
        ativo: l.ativo, data: l.data, qtd: l.qtd, preco: l.preco, valor: l.valor, moeda: l.moeda,
        cambio: l.cambio, valorBRL: l.valorBRL, classe: classeDoLancamento_(l, mapaClasse),
      });
    }
  });
  return out;
}

/** As últimas `n` chaves 'aaaa-mm' terminando em `hoje` (inclusive), mais antiga primeiro. */
export function ultimosMeses(hoje, n) {
  const [ay, am] = String(hoje).slice(0, 7).split('-').map(Number);
  const out = [];
  let y = ay;
  let m = am;
  for (let i = 0; i < n; i += 1) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return out;
}

/** Ativos de uma classe que aparecem no mapa: renda variável vem de dados.classes (ordem da carteira); RF, dos próprios lançamentos. */
export function ativosDaClasseMapa(classe, classes, compras) {
  if (classe !== 'rendaFixa') return (classes[classe] || []).map((a) => ({ ativo: a.ticker, nome: a.nome || '', moeda: a.moeda }));
  const nomes = [...new Set(compras.filter((c) => c.classe === 'rendaFixa').map((c) => c.ativo))].sort((a, b) => a.localeCompare(b));
  return nomes.map((ativo) => ({ ativo, nome: '', moeda: 'BRL' }));
}

/** Compras de 1 ativo, cronológicas (mais antiga primeiro). */
function historicoAtivo(compras, ativo) {
  return compras.filter((c) => c.ativo === ativo).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/**
 * A célula do mapa (ativo × mês): soma das compras daquele ativo naquele
 * mês + comparação com a compra anterior (preço médio do mês vs o preço
 * da compra mais recente ANTES desse mês - ignora preço 0, ex.: uma
 * bonificação sem custo). null = não comprou nesse mês (mês "vazio").
 */
export function celulaMapa(compras, ativo, mesChave) {
  const doMes = compras.filter((c) => c.ativo === ativo && c.data.slice(0, 7) === mesChave);
  if (!doMes.length) return null;
  const rf = doMes[0].classe === 'rendaFixa';
  const qtd = rf ? null : doMes.reduce((s, c) => s + num(c.qtd), 0);
  const valor = doMes.reduce((s, c) => s + num(c.valor), 0);
  const precoMedio = rf || !qtd ? null : valor / qtd;
  // a compra anterior é a última ANTES do mês (27/09/2026: comparar com
  // doMes[0] podia pegar outra compra do próprio mês - ex.: TRXF11 em
  // ago/26 aparecia "▲" contra uma compra de agosto, não contra julho)
  const anterior = historicoAtivo(compras, ativo).filter((c) => c.data < `${mesChave}-01` && num(c.preco) > 0).pop() || null;
  const valorBRL = doMes[0].moeda === 'USD' ? doMes.reduce((s, c) => s + num(c.valorBRL), 0) : valor;
  return {
    itens: doMes.slice().sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)),
    qtd, valor, precoMedio, rf, moeda: doMes[0].moeda,
    delta: !rf && anterior && precoMedio ? precoMedio / anterior.preco - 1 : null,
    anterior, valorBRL,
  };
}

/** true se o mês é o mês corrente (não é uma "rodada fechada" - ainda pode receber mais compras). */
export function ehMesAtual(mesChave, hoje) {
  return mesChave === String(hoje).slice(0, 7);
}

/** Meses (inteiro, >=0) desde a última compra até `hoje` - null se nunca comprou esse ativo. */
export function mesesSemComprar(compras, ativo, hoje) {
  const u = ultimaCompra(compras, ativo);
  if (!u) return null;
  const [uy, um] = u.data.slice(0, 7).split('-').map(Number);
  const [hy, hm] = String(hoje).slice(0, 7).split('-').map(Number);
  return (hy - uy) * 12 + (hm - um);
}

export function ultimaCompra(compras, ativo) {
  const hist = historicoAtivo(compras, ativo);
  return hist.length ? hist[hist.length - 1] : null;
}

/**
 * A linha inteira de um ativo no mapa: uma célula por mês da janela (ou
 * null) + o total investido na janela (em reais) + o resumo da "última".
 */
export function linhaMapa(compras, ativo, meses, hoje) {
  const celulas = meses.map((m) => celulaMapa(compras, ativo, m));
  const totalJanela = celulas.reduce((s, c) => s + (c ? num(c.valorBRL) : 0), 0);
  return { ativo, celulas, totalJanela, semComprar: mesesSemComprar(compras, ativo, hoje), ultima: ultimaCompra(compras, ativo) };
}

/** Resumo da "última rodada" (o mês mais recente da janela com pelo menos 1 compra nessa classe). */
export function resumoUltimaRodada(compras, ativos, meses) {
  const mesesDesc = [...meses].reverse();
  const mesUltimo = mesesDesc.find((m) => ativos.some((a) => celulaMapa(compras, a.ativo, m)));
  if (!mesUltimo) return null;
  const entraram = ativos.filter((a) => celulaMapa(compras, a.ativo, mesUltimo));
  const ficaramDeFora = ativos.filter((a) => !entraram.includes(a));
  const datas = [...new Set(compras.filter((c) => c.data.slice(0, 7) === mesUltimo && ativos.some((a) => a.ativo === c.ativo)).map((c) => c.data))].sort();
  return { mes: mesUltimo, entraram, ficaramDeFora, datas, atual: ehMesAtual(mesUltimo, meses[meses.length - 1]) };
}

/**
 * Detalhe pro popover de uma célula (ativo × mês): cada compra do mês +
 * comparações (vs compra anterior, vs cotação de hoje, seu preço médio
 * hoje) e - só pra ativos em dólar - a conversão em reais: o que foi
 * pago convertido pelo câmbio de CADA dia, o que isso vale hoje (câmbio
 * de hoje) e o "efeito do dólar" isolado da variação do próprio ativo
 * (câmbio de hoje vs o câmbio médio pago). Também lista o que mais foi
 * comprado nos MESMOS dias dessas compras (somado por ativo).
 */
export function popoverMapa(compras, ativo, mesChave, { precoAtual = null, precoMedioHoje = null, cambioHoje = null } = {}) {
  const cel = celulaMapa(compras, ativo, mesChave);
  if (!cel) return null;
  const ehUsd = cel.moeda === 'USD';
  const vsHoje = !cel.rf && num(precoAtual) > 0 && cel.precoMedio ? precoAtual / cel.precoMedio - 1 : null;
  let cambioMedio = null;
  let pagoBRL = null;
  let hojeBRL = null;
  let efeitoDolar = null;
  if (ehUsd) {
    pagoBRL = cel.valorBRL;
    cambioMedio = cel.valor > 0 ? pagoBRL / cel.valor : null;
    hojeBRL = num(precoAtual) > 0 && num(cambioHoje) > 0 ? precoAtual * num(cel.qtd) * cambioHoje : null;
    efeitoDolar = cambioMedio && num(cambioHoje) > 0 ? cambioHoje / cambioMedio - 1 : null;
  }
  const datas = new Set(cel.itens.map((c) => c.data));
  const porOutroAtivo = new Map();
  compras.forEach((c) => {
    if (c.ativo === ativo || !datas.has(c.data)) return;
    const atual = porOutroAtivo.get(c.ativo) || { ativo: c.ativo, classe: c.classe, qtd: 0, valor: 0 };
    atual.qtd += num(c.qtd);
    atual.valor += num(c.valor);
    porOutroAtivo.set(c.ativo, atual);
  });
  return {
    ...cel, vsHoje, cambioMedio, pagoBRL, hojeBRL, efeitoDolar, precoMedioHoje,
    mesmoDia: [...porOutroAtivo.values()],
  };
}
