// assets/js/carrinho-global.js
//
// 05/10/2026: o carrinho de aportes (Transações) agora também vive no header
// de TODAS as telas (Tiago: "ao mudar de tela, mostrar no header que há um
// carrinho em andamento; clicar mostra o conteúdo e um botão pra Transações",
// inspirado em marketplace). Por isso as contas puras do carrinho saíram de
// pages/aportes-calc.js pra cá - o shell importa só este arquivo (leve, sem o
// motor de critérios) e aportes-calc.js reexporta tudo (nada mudou pra quem já
// importava de lá).
//
// Carrinho: { editandoId, data, observacao, itens: { 'classe:ativo': item }, cambio?, perguntadoEm? }
//  - ação/FII/EUA: { classe, ativo, moeda, qtd, preco } (preço = cotação na hora)
//  - renda fixa: { classe: 'rendaFixa', ativo (título), instituicao, valor, qtd?, pu? }
//    (qtd/pu só no Tesouro Direto: valor = qtd × PU, qtd com 2 casas)
//  - cambio: o dólar da última vez que a tela Transações guardou o carrinho
//    (o header precisa dele pra somar os itens em dólar sem buscar nada)
//  - perguntadoEm: dia em que o aviso "Você comprou?" já foi respondido com "Sim"
//
// Expiração (Tiago: "B3 fecha às 17h e EUA às 18h - se não confirmar as compras
// no dia, avisar que passou o horário, perguntar se comprei ou não, e remover o
// carrinho; os números mudam de um dia pro outro"). Horários, em Brasília:
//  - B3 (ações/FIIs, mercado à vista): pregão regular 10h-17h (negociação até
//    16h55 + call de fechamento até 17h) enquanto os EUA estão no horário de
//    verão; quando acaba (em 2026: domingo 01/11) a B3 amplia pro 10h-18h
//    (negociação até 17h55 + call até 18h). Fonte: B3 (PUMA, horário de
//    negociação) e comunicados anuais da B3 sobre o fim do horário de verão
//    americano.
//  - NYSE/Nasdaq: fecham 16h (Nova York) = 17h de Brasília no horário de verão
//    dos EUA (2º domingo de março até o 1º domingo de novembro) e 18h fora dele.
//  - Tesouro Direto: dias úteis 9h30-18h (depois disso a compra sai pelo
//    preço do próximo dia útil). Outras rendas fixas (CDB etc.): sem horário -
//    só vale o dia.
// Feriados e fins de semana não são tratados (o carrinho vale até o horário do
// dia da data dele).

export const CHAVE_CARRINHO = 'transacoes.carrinho.v1';
export const EVENTO_CARRINHO = 'carrinho:mudou';
export const EVENTO_ABRIR_CARRINHO = 'carrinho:abrir';

export const ORDEM_CLASSES = ['acoes', 'fiis', 'acoesEua', 'rendaFixa'];
export const NOME_CLASSE_CARRINHO = { acoes: 'Ações', fiis: 'FIIs', acoesEua: 'Ações EUA', rendaFixa: 'Renda Fixa' };

const ordemClasse = (c) => ORDEM_CLASSES.indexOf(c);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

export const chaveItem = (classe, ativo, instituicao = '') => `${classe}:${ativo}${classe === 'rendaFixa' && instituicao ? `|${instituicao}` : ''}`;

export function carrinhoVazio(hoje) {
  return { editandoId: null, data: hoje, observacao: '', itens: {} };
}

/** Carrinho lido do navegador, conferido (formato antigo/estragado vira vazio). */
export function carrinhoValido(c, hoje) {
  if (!c || typeof c !== 'object' || typeof c.itens !== 'object' || !c.itens) return carrinhoVazio(hoje);
  const itens = {};
  Object.entries(c.itens).forEach(([k, it]) => {
    if (!it || !ORDEM_CLASSES.includes(it.classe) || !it.ativo) return;
    if (it.classe === 'rendaFixa' ? num(it.valor) > 0 : num(it.qtd) > 0) itens[k] = it;
  });
  const out = { editandoId: c.editandoId || null, data: /^\d{4}-\d{2}-\d{2}$/.test(c.data || '') ? c.data : hoje, observacao: String(c.observacao || ''), itens };
  if (num(c.cambio) > 0) out.cambio = c.cambio;
  if (/^\d{4}-\d{2}-\d{2}$/.test(c.perguntadoEm || '')) out.perguntadoEm = c.perguntadoEm;
  return out;
}

/** Define a quantidade (0 tira do carrinho). Devolve um carrinho novo. */
export function definirQuantidade(carrinho, { classe, ativo, moeda = 'BRL', preco }, qtd) {
  const itens = { ...carrinho.itens };
  const k = chaveItem(classe, ativo);
  // 05/10/2026 (A-23): trunca em 4 casas com tolerância - 0,29 × 10000 dá 2899,9999…
  // em ponto flutuante e o floor puro perdia 1 passo de 0,0001 numa ação fracionada.
  const q = Math.max(0, Math.floor(num(qtd) * 10000 + 1e-6) / 10000);
  if (q > 0) itens[k] = { classe, ativo, moeda, qtd: q, preco: num(preco) || (itens[k] && itens[k].preco) || 0 };
  else delete itens[k];
  return { ...carrinho, itens };
}

/**
 * Renda fixa por valor. 05/10/2026: no Tesouro Direto o valor vem de
 * quantidade × PU (extra = { qtd, pu }); o carrinho guarda os dois.
 */
export function definirValorRf(carrinho, { ativo, instituicao = '' }, valor, extra = null) {
  const itens = { ...carrinho.itens };
  const k = chaveItem('rendaFixa', ativo, instituicao);
  const v = Math.max(0, arred(num(valor), 2));
  if (v > 0) {
    itens[k] = { classe: 'rendaFixa', ativo, instituicao, moeda: 'BRL', valor: v };
    if (extra && num(extra.qtd) > 0 && num(extra.pu) > 0) { itens[k].qtd = arred(extra.qtd, 2); itens[k].pu = arred(extra.pu, 2); }
  } else delete itens[k];
  return { ...carrinho, itens };
}

export function removerDoCarrinho(carrinho, chave) {
  const itens = { ...carrinho.itens };
  delete itens[chave];
  return { ...carrinho, itens };
}

export const valorItemCarrinho = (it) => (it.classe === 'rendaFixa' ? num(it.valor) : num(it.qtd) * num(it.preco));

/** Itens em ordem de classe e nome, com o subtotal (ao centavo, como a corretora cobra: 05/10/2026, A-23, pros totais fecharem). */
export function itensDoCarrinho(carrinho) {
  return Object.entries(carrinho.itens)
    .map(([chave, it]) => ({ chave, ...it, subtotal: arred(valorItemCarrinho(it), 2) }))
    .sort((a, b) => ordemClasse(a.classe) - ordemClasse(b.classe) || a.ativo.localeCompare(b.ativo));
}

/** { porClasse: { id: { n, valor (moeda da classe), brl } }, n, totalBrl, totalUsd } */
export function totaisCarrinho(carrinho, cambio) {
  const porClasse = {};
  let totalBrl = 0;
  let totalUsd = 0;
  itensDoCarrinho(carrinho).forEach((it) => {
    const p = porClasse[it.classe] || (porClasse[it.classe] = { n: 0, valor: 0, brl: 0 });
    p.n += 1;
    p.valor += it.subtotal;
    const brl = it.moeda === 'USD' ? it.subtotal * num(cambio) : it.subtotal;
    p.brl += brl;
    totalBrl += brl;
    if (it.moeda === 'USD') totalUsd += it.subtotal;
  });
  Object.values(porClasse).forEach((p) => { p.valor = arred(p.valor); p.brl = arred(p.brl); });
  return { porClasse, n: Object.keys(carrinho.itens).length, totalBrl: arred(totalBrl), totalUsd: arred(totalUsd) };
}

/**
 * 05/10/2026 (A-11): aviso de sobrecomprometimento. Um ativo do carrinho que está vinculado a MAIS DE UMA meta
 * (ex.: um FII na renda passiva e na aposentadoria) só "vale" na meta de maior prioridade (reserva -> renda
 * passiva -> aposentadoria -> demais; ver metas-calc!alocarMetas) - o aporte não avança as outras. `metas` = lista
 * com `calc` (metas-card!metasComCalculo). Devolve [{ chave, ativo, metas: [nome], dona: nome|null, texto }].
 */
export function avisosSobrecomprometimento(carrinho, metas) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const ativas = (metas || []).filter((m) => m && m.calc && Array.isArray(m.calc.vinculos) && m.status !== 'arquivada' && m.status !== 'pausada');
  if (!ativas.length) return [];
  const out = [];
  itensDoCarrinho(carrinho || { itens: {} }).forEach((it) => {
    const alvo = norm(it.ativo);
    const doAtivo = [];
    ativas.forEach((m) => {
      m.calc.vinculos.forEach((v) => {
        (v.ativos || []).forEach((a) => {
          if (norm(a.ref) !== alvo && norm(String(a.id || '').split('@')[0]) !== alvo && norm(a.nome) !== alvo) return;
          const conta = !v.fracaoPorId || num(v.fracaoPorId[a.id]) > 0;
          const x = doAtivo.find((d) => d.nome === m.nome);
          if (x) x.conta = x.conta || conta; else doAtivo.push({ nome: m.nome, conta });
        });
      });
    });
    if (doAtivo.length < 2) return;
    const dona = (doAtivo.find((d) => d.conta) || {}).nome || null;
    const nomes = doAtivo.map((d) => d.nome);
    out.push({ chave: it.chave, ativo: it.ativo, metas: nomes, dona, texto: `${it.ativo} está em ${nomes.join(' e ')}${dona ? `: o aporte só conta em "${dona}" (maior prioridade)` : ''}` });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Guardado no navegador (localStorage): sempre com try/catch, é só conveniência
// ---------------------------------------------------------------------------

export function lerCarrinhoLocal(storage = (typeof globalThis !== 'undefined' ? globalThis.localStorage : null)) {
  try { return JSON.parse(storage.getItem(CHAVE_CARRINHO) || 'null'); } catch (e) { return null; }
}

export function gravarCarrinhoLocal(carrinho, storage = (typeof globalThis !== 'undefined' ? globalThis.localStorage : null)) {
  try { storage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho)); } catch (e) { /* só conveniência */ }
}

// ---------------------------------------------------------------------------
// Horários (Brasília = UTC-3, sem horário de verão desde 2019)
// ---------------------------------------------------------------------------

/** 'aaaa-mm-dd' em Brasília. */
export function dataBRT(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Minutos desde a meia-noite, em Brasília. */
export function minutosBRT(agora = new Date()) {
  const d = new Date(agora.getTime() - 3 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function nesimoDomingo(ano, mes0, n) {
  const d = new Date(Date.UTC(ano, mes0, 1));
  const primeiro = (7 - d.getUTCDay()) % 7; // dias até o 1º domingo
  return 1 + primeiro + (n - 1) * 7;
}

/** Horário de verão dos EUA: do 2º domingo de março ao 1º domingo de novembro (em 2026: 08/03 a 01/11). */
export function usaHorarioVeraoEUA(dataISO) {
  const ano = Number(String(dataISO).slice(0, 4));
  const inicio = `${ano}-03-${String(nesimoDomingo(ano, 2, 2)).padStart(2, '0')}`;
  const fim = `${ano}-11-${String(nesimoDomingo(ano, 10, 1)).padStart(2, '0')}`;
  return dataISO >= inicio && dataISO < fim;
}

/** Minutos de Brasília em que o mercado do item fecha no dia `dataISO`. 1440 = só vale o dia. */
export function fechamentoMercado(item, dataISO) {
  const verao = usaHorarioVeraoEUA(dataISO);
  if (item.classe === 'acoes' || item.classe === 'fiis') return verao ? 17 * 60 : 18 * 60; // B3
  if (item.classe === 'acoesEua') return verao ? 17 * 60 : 18 * 60; // 16h de Nova York
  if (item.classe === 'rendaFixa') return /^tesouro/i.test(String(item.ativo || '').trim()) ? 18 * 60 : 24 * 60;
  return 24 * 60;
}

/** Nome do mercado, pro aviso ("a B3 fechou às 17h"). */
export function mercadoDoItem(item) {
  if (item.classe === 'acoesEua') return 'a bolsa dos EUA';
  if (item.classe === 'rendaFixa') return /^tesouro/i.test(String(item.ativo || '').trim()) ? 'o Tesouro Direto' : 'o dia';
  return 'a B3';
}

export function horaTxt(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/**
 * Situação do carrinho agora: { vazio, expirado, motivo: 'dia'|'horario'|null, fechamento (min), mercado, perguntado }.
 * Só expira quando TODOS os mercados dos itens já fecharam (o que fecha mais tarde manda).
 */
export function situacaoCarrinho(carrinho, agora = new Date()) {
  const itens = itensDoCarrinho(carrinho || { itens: {} });
  if (!itens.length) return { vazio: true, expirado: false, motivo: null, fechamento: null, mercado: '', perguntado: false };
  const hoje = dataBRT(agora);
  const data = carrinho.data || hoje;
  const fechamentos = itens.map((it) => ({ f: fechamentoMercado(it, data), m: mercadoDoItem(it) }));
  const fechamento = Math.max(...fechamentos.map((x) => x.f));
  const mercado = [...new Set(fechamentos.filter((x) => x.f === fechamento).map((x) => x.m))].join(' e ');
  const perguntado = carrinho.perguntadoEm === hoje;
  if (data < hoje) return { vazio: false, expirado: true, motivo: 'dia', fechamento, mercado, perguntado };
  if (data === hoje && minutosBRT(agora) >= fechamento) return { vazio: false, expirado: true, motivo: 'horario', fechamento, mercado, perguntado };
  return { vazio: false, expirado: false, motivo: null, fechamento, mercado, perguntado: false };
}
