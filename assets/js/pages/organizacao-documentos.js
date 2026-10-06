/**
 * organizacao-documentos.js - 03/10/2026: painel "Documentos" da Organização
 * Financeira (no topo da página, valendo pras 4 abas - inclusive Simulações).
 *
 * Tiago: "eu tenho que saber quais documentos preciso enviar mensalmente ou
 * de vez em quando, e o que dá pra ser automatizado" e "Me mostre quais
 * documentos precisaremos sempre estar enviando (prefiro que o site seja o
 * mais inteligente possível)".
 *
 * Um lugar só, enxuto: uma barra com o resumo (quantos pra enviar, atrasados,
 * em dia, automáticos) que abre a lista. Cada documento tem o status (em dia
 * / atenção / atrasado / nunca enviado) calculado com as datas que o site JÁ
 * TEM, o próximo esperado e o botão que leva ao lugar de importar.
 *
 * Sem lógica duplicada: IR, holerite, Carteira de Trabalho, FGTS, aportes e
 * informe vêm de renda-calc.js!documentosRenda (o card "Documentos" da seção
 * Renda); faturas e extratos, dos "meses importados" dos Gastos
 * (gastos-calc.js!coberturaDocumentos) + a lista do Drive (novos/alterados).
 * Aqui só entram os que não tinham dono: extrato do financiamento (Caixa),
 * do FIES e o extrato de proventos da B3 (check final do mês).
 *
 * USO (organizacao.js):
 *   const painel = montarPainelDocumentos(raiz, { doc, aoAcao });
 *   painel.atualizar({ patrimonio, salario, gastos, gastosDrive, holeritesDrive, hoje });
 *   // cada fonte: a resposta da API, null (não veio) ou undefined (carregando)
 *   // aoAcao(acao, extra): 'ir-drive' | 'pdfs' (extra = arquivos) |
 *   //   'holerite' (extra = arquivo) | 'holerite-drive' | 'gastos-novos' | 'gastos' | 'ir-sem-drive'
 *
 * 03/10/2026 (Tiago: "sempre dê a opção de enviar algum doc manualmente
 * também"): TODO item tem "Enviar arquivo" (mesmo os que chegam do Drive),
 * que usa o mesmo leitor do site: IR, FGTS, Carteira de Trabalho, Caixa e
 * FIES -> importação do Patrimônio ('pdfs'); holerite -> Renda ('holerite');
 * fatura/extrato (PDF, CSV ou OFX) -> Gastos (abre a aba com 'gastos' e
 * manda os arquivos pelo evento 'organizacao:gastos-arquivos', que a seção
 * Gastos escuta); extrato da B3 -> Transações › Lançamentos (link).
 */
import { documentosRenda } from './renda-calc.js';
import { coberturaDocumentos, NOME_FONTE, arquivosNovosDrive, arquivosFalhosDrive, fonteArquivoDrive } from './gastos-calc.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { MESES_CURTOS, formatMesAno, formatDMA } from '../format.js'; // 05/10/2026 (A-68)


/** Evento que a seção Gastos (organizacao-gastos.js) escuta no document pra importar arquivos do computador. */
export const EVENTO_ARQUIVOS_GASTOS = 'organizacao:gastos-arquivos';
const PDF = 'application/pdf,.pdf';
const GASTOS_ACEITA = 'application/pdf,.pdf,.csv,.ofx,text/csv';
const LANCAMENTOS_B3 = '../transacoes/index.html#lancamentos';

/**
 * 03/10/2026: "Enviar arquivo" de cada documento - pra onde vai e o que o
 * seletor aceita. `href`: não é arquivo daqui (vai pra outra tela).
 */
export const ENVIO_DOCUMENTO = {
  ir: { destino: 'pdfs', accept: PDF, multiplo: true },
  holerite: { destino: 'holerite', accept: PDF },
  faturas: { destino: 'gastos-arquivos', accept: GASTOS_ACEITA, multiplo: true },
  extratos: { destino: 'gastos-arquivos', accept: GASTOS_ACEITA, multiplo: true },
  fgts: { destino: 'pdfs', accept: PDF, multiplo: true },
  ctps: { destino: 'pdfs', accept: PDF },
  caixa: { destino: 'pdfs', accept: PDF },
  fies: { destino: 'pdfs', accept: PDF },
  b3: { href: LANCAMENTOS_B3, rotulo: 'Enviar extrato' },
  investimentos: { href: LANCAMENTOS_B3, rotulo: 'Enviar extrato da B3' },
};


const mesDe = (d) => String(d || '').slice(0, 7);
const rotMes = (m) => formatMesAno(m);
const dataCurta = (iso) => formatDMA(iso, '') || rotMes(iso);
function somarMeses(mes, n) {
  const [y, m] = mesDe(mes).split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
function difMeses(a, b) {
  const [ya, ma] = mesDe(a).split('-').map(Number);
  const [yb, mb] = mesDe(b).split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
const isoDe = (hoje) => {
  if (hoje instanceof Date) return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return String(hoje || '').slice(0, 10);
};

/** Gravidade (pra ordenar e resumir). */
const PESO = { atrasado: 4, falta: 3, atencao: 2, carregando: 1, ok: 0, opcional: 0 };
export const ROTULO_ESTADO = { ok: 'em dia', atencao: 'atenção', atrasado: 'atrasado', falta: 'nunca enviado', opcional: 'opcional', carregando: 'verificando…' };

/** Fontes de fatura (cartão) e de extrato (conta) - gastos-calc.js!NOME_FONTE. */
export const FONTES_CARTAO = ['ourocard', 'nubank-cartao', 'ofx-cartao'];
export const FONTES_CONTA = ['nubank-conta', 'bradesco', 'ofx-conta'];

/**
 * Faturas (cartão) ou extratos (conta): status pelos meses importados + o que está novo no Drive.
 * 07/10/2026 (Tiago: OuroCard cancelado, Bradesco sem uso): cartão/conta encerrado (gastos.fontesEncerradas, Gastos.gs)
 * não entra no atrasado nem no "faltam meses", e o que sobrou dele no Drive não pede importação. `fontesEditaveis` =
 * a lista pra marcar/desmarcar "em uso" no próprio item.
 */
export function documentoGastos(tipo, { gastos, gastosDrive, hoje }) {
  const cartao = tipo === 'faturas';
  const base = cartao
    ? { id: 'faturas', nome: 'Faturas do cartão', frequencia: 'todo mês', automatico: 'clique', como: 'o site acha os PDFs na pasta Documentos/Transações/Cartão de Crédito do Drive - você só confirma "Importar"' }
    : { id: 'extratos', nome: 'Extratos da conta', frequencia: 'todo mês', automatico: 'clique', como: 'o site acha os PDFs (ou CSV/OFX) na pasta Documentos/Transações/Extratos do Drive - você só confirma "Importar"' };
  if (gastos === undefined) return { ...base, estado: 'carregando', ultimo: null, proximo: '', acao: null };
  const hojeIso = isoDe(hoje || new Date());
  const fechadas = new Set((gastos && gastos.fontesEncerradas) || []);
  const cob = coberturaDocumentos((gastos && gastos.arquivos) || [], hojeIso, { encerradas: [...fechadas] });
  const doTipo = cob.fontes.filter((f) => (cartao ? FONTES_CARTAO : FONTES_CONTA).includes(f.fonte));
  const fontes = doTipo.filter((f) => !f.encerrada);
  const encerradas = doTipo.filter((f) => f.encerrada);
  const fontesEditaveis = doTipo.map((f) => ({ fonte: f.fonte, nome: NOME_FONTE[f.fonte] || f.nome, encerrada: !!f.encerrada, ultimo: f.ultimo }));
  // 03/10/2026: "novo" = nunca tentado ou mudou no Drive; o que falhou conta à parte (gastos-calc.js)
  const daPasta = gastosDrive && Array.isArray(gastosDrive.arquivos)
    ? gastosDrive.arquivos.filter((a) => (cartao ? /cart[aã]o/i.test(a.caminho || '') : /extrato/i.test(a.caminho || '')))
    : [];
  const novos = arquivosNovosDrive(daPasta).filter((a) => !fechadas.has(fonteArquivoDrive(a))).length;
  const falhos = arquivosFalhosDrive(daPasta).filter((a) => !fechadas.has(fonteArquivoDrive(a))).length;
  const comFalhos = (txt) => (falhos ? `${txt} · ${falhos} com problema` : txt);
  const textoEncerradas = encerradas.map((f) => `${NOME_FONTE[f.fonte] || f.nome} encerrado (até ${rotMes(f.ultimo)})`);
  const proxMes = mesDe(hojeIso);
  const proximo = cartao ? `fatura de ${rotMes(proxMes)} (a que vence este mês)` : `extrato de ${rotMes(cob.ultimoFechado)} (o mês que fechou)`;
  if (!fontes.length && encerradas.length) {
    return {
      ...base, fontesEditaveis, ultimo: textoEncerradas.join(' · '), estado: novos ? 'atencao' : 'ok',
      proximo: comFalhos(novos ? `${novos} no Drive esperando` : (cartao ? 'nenhum cartão em uso - nada a mandar' : 'nenhuma conta em uso - nada a mandar')),
      acao: novos ? { id: 'gastos-novos', rotulo: `Importar ${novos} do Drive` } : (falhos ? { id: 'gastos', rotulo: 'Ver os que falharam' } : null),
    };
  }
  if (!fontes.length) {
    return {
      ...base, fontesEditaveis, ultimo: null, estado: novos ? 'atencao' : 'falta',
      proximo: comFalhos(novos ? `${novos} no Drive esperando` : 'importe pelo menos os últimos 12 meses'),
      acao: { id: novos ? 'gastos-novos' : 'gastos', rotulo: novos ? `Importar ${novos} do Drive` : (falhos ? 'Ver os que falharam' : 'Abrir Gastos') },
      detalhe: gastos === null ? 'os gastos não carregaram agora' : null,
    };
  }
  // fatura: o mês do vencimento; a do mês passado já devia estar lá - a deste mês sai uns dias antes do vencimento
  let pior = 'ok';
  const partes = fontes.map((f) => {
    const atraso = difMeses(f.ultimo, cob.ultimoFechado);
    const est = atraso <= 0 ? 'ok' : atraso === 1 ? 'atencao' : 'atrasado';
    if (PESO[est] > PESO[pior]) pior = est;
    return `${NOME_FONTE[f.fonte] || f.nome} ${rotMes(f.ultimo)}`;
  });
  const faltam = fontes.reduce((s, f) => s + f.faltam.length, 0);
  let estado = pior;
  if (estado === 'ok' && novos) estado = 'atencao';
  return {
    ...base, fontesEditaveis, estado, ultimo: [...partes, ...textoEncerradas].join(' · '),
    proximo: comFalhos(novos ? `${novos} ${novos === 1 ? 'novo' : 'novos'} no Drive · ${proximo}` : (pior === 'ok' ? proximo : `faltam meses (${faltam}) - ${proximo}`)),
    acao: novos ? { id: 'gastos-novos', rotulo: `Importar ${novos} ${novos === 1 ? 'novo' : 'novos'}` } : (pior !== 'ok' ? { id: 'gastos', rotulo: 'Ver meses que faltam' } : (falhos ? { id: 'gastos', rotulo: 'Ver os que falharam' } : null)),
  };
}

/** Extrato do financiamento (Caixa) ou do FIES: opcional - o saldo anda sozinho; o extrato só recalibra. */
export function documentoDivida(tipo, cfg, hoje) {
  const fin = tipo === 'caixa';
  const x = cfg && (fin ? cfg.financiamento : cfg.fies);
  const base = fin
    ? { id: 'caixa', nome: 'Extrato do financiamento (Caixa)', frequencia: '1x por ano (opcional)', automatico: false, como: 'PDF "Demonstrativo de Evolução - Habitação" do app da Caixa. O saldo anda sozinho mês a mês; o extrato só recalibra (TR, amortizações extras)' }
    : { id: 'fies', nome: 'Extrato do FIES (Banco do Brasil)', frequencia: '1x por ano (opcional)', automatico: false, como: 'comprovante do SISBB (app do BB) com o saldo devedor. A parcela e a taxa são fixas: o site projeta sozinho' };
  const hojeIso = isoDe(hoje || new Date());
  if (!x || !x.dataSaldo) return { ...base, estado: x ? 'opcional' : 'falta', ultimo: null, proximo: 'importe uma vez pra o site começar a projetar', acao: { id: 'pdfs', rotulo: 'Importar PDF' } };
  const meses = difMeses(x.dataSaldo, hojeIso);
  const quando = somarMeses(x.dataSaldo, 12);
  return {
    ...base, ultimo: `saldo de ${dataCurta(x.dataSaldo)}`,
    estado: meses >= 12 ? 'atencao' : 'ok',
    proximo: meses >= 12 ? 'vale recalibrar (mais de 1 ano)' : `quando quiser - sugestão: ${rotMes(quando)}`,
    acao: meses >= 12 ? { id: 'pdfs', rotulo: 'Importar PDF' } : null,
  };
}

/**
 * Extrato de proventos da B3: no fim do mês, pro "check final" da tela Proventos.
 * 07/10/2026 (Tiago: "eu lembro de ter enviado já ... garanta que esteja sendo registrado pra que eu não fique enviando
 * a mesma coisa"): `extrato` = patrimonio.extratoB3 (Proventos.gs!resumoExtratoB3_ - o último mês conferido, quando
 * chegou e de que arquivo); undefined = carregando, null = nunca chegou. Com o mês já conferido, fica "em dia".
 */
export function documentoB3(hoje, ...resto) {
  const extrato = resto.length ? resto[0] : null; // sem o 2º argumento = não sabe (null); undefined explícito = carregando
  const hojeIso = isoDe(hoje || new Date());
  const [a, m, d] = hojeIso.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mes = mesDe(hojeIso);
  const fimDoMes = d >= ultimoDia - 3;
  const comecoDoMes = d <= 7;
  const alvo = fimDoMes ? mes : somarMeses(mes, -1);
  const base = {
    id: 'b3', nome: 'Extrato de proventos da B3', frequencia: 'fim do mês', automatico: false,
    como: 'Área do Investidor da B3 → Extratos → Movimentação (Excel), importado em Transações → Lançamentos. Os proventos já entram sozinhos pelos anúncios; o extrato só confere (pago presumido → conferido). Mandar o mesmo extrato de novo não duplica nada',
    acao: { id: 'b3', rotulo: 'Ir pra Lançamentos', href: LANCAMENTOS_B3 },
  };
  if (extrato === undefined) return { ...base, estado: 'carregando', ultimo: null, proximo: '' };
  const ultMes = extrato && /^\d{4}-\d{2}$/.test(String(extrato.ultimoMes || '')) ? extrato.ultimoMes : '';
  if (!ultMes) {
    return {
      ...base, ultimo: 'nenhum ainda',
      estado: fimDoMes || comecoDoMes ? 'atencao' : 'ok',
      proximo: fimDoMes || comecoDoMes ? `hora de mandar o de ${rotMes(alvo)}` : `fim de ${rotMes(mes)}`,
    };
  }
  const chegou = extrato.conferidoEm ? ` · chegou em ${dataCurta(extrato.conferidoEm)}` : '';
  const ultimo = `${rotMes(ultMes)}${chegou}`;
  if (ultMes >= alvo) {
    const prox = somarMeses(ultMes, 1);
    return { ...base, ultimo, estado: 'ok', proximo: `o de ${rotMes(prox)}, no fim de ${rotMes(prox)}`, acao: { ...base.acao, rotulo: 'Ver Lançamentos' } };
  }
  const atraso = difMeses(ultMes, alvo);
  return {
    ...base, ultimo,
    estado: atraso >= 2 ? 'atrasado' : 'atencao',
    proximo: atraso >= 2 ? `faltam ${atraso} meses (de ${rotMes(somarMeses(ultMes, 1))} a ${rotMes(alvo)}) - um extrato com o período inteiro resolve` : `hora de mandar o de ${rotMes(alvo)}`,
  };
}

/**
 * A lista inteira. Cada fonte: resposta da API, null (não veio) ou
 * undefined (ainda carregando - o item mostra "verificando…").
 */
/**
 * 05/10/2026 (Tiago: holerites em Documentos/Trabalho/<EMPRESA>/Holerite/<ANO>/MES-ANO.pdf no Drive): com a pasta
 * achada, o holerite passa a "Drive · 1 clique" (lê só os novos); sem ela, continua manual - e o envio manual
 * ("Enviar arquivo") fica nos dois casos. `holeritesDrive` = resposta de holeritesArquivos (undefined enquanto carrega).
 */
export function documentoHolerite(base, holeritesDrive) {
  if (!base) return null;
  const arquivos = holeritesDrive && Array.isArray(holeritesDrive.arquivos) ? holeritesDrive.arquivos : [];
  if (!holeritesDrive || !holeritesDrive.ok || holeritesDrive.configurado === false) {
    return { ...base, como: 'PDF do holerite, lido aqui no navegador (Renda e Orçamentos → Orçamento do salário). Pra vir sozinho: guarde em Documentos/Trabalho/<EMPRESA>/Holerite/<ANO>/MES-ANO.pdf no Drive e rode 1 vez configurarPastaHoleritesDireto no Apps Script', acao: { id: 'holerite', rotulo: 'Importar holerite' } };
  }
  const novos = arquivos.filter((a) => a.novo);
  const falhos = arquivos.filter((a) => a.situacao === 'erro').length;
  const proximo = novos.length ? `${novos.length} ${novos.length === 1 ? 'novo' : 'novos'} no Drive - 1 clique lê` : base.proximo;
  return {
    ...base, automatico: 'clique', proximo,
    como: `o site acha os PDFs em Documentos/Trabalho/<EMPRESA>/Holerite/<ANO> (${arquivos.length} no Drive${falhos ? `, ${falhos} que o leitor não entendeu` : ''}), lê no navegador só os novos e registra o que já importou; "Enviar arquivo" continua valendo`,
    acao: { id: 'holerite-drive', rotulo: novos.length ? `Ler ${novos.length === 1 ? 'o novo' : `os ${novos.length} novos`} do Drive` : 'Ler do Drive' },
    estado: novos.length && base.estado === 'ok' ? 'atencao' : base.estado,
  };
}

export function documentosOrganizacao({ patrimonio, salario, gastos, gastosDrive, holeritesDrive, hoje } = {}) {
  const hojeIso = isoDe(hoje || (patrimonio && patrimonio.hoje) || new Date());
  const cfg = (patrimonio && patrimonio.config) || {};
  const carregandoRenda = patrimonio === undefined || salario === undefined;
  const renda = documentosRenda({ patrimonio: patrimonio || null, salario: salario || null, hoje: hojeIso });
  const porId = Object.fromEntries(renda.map((x) => [x.id, x]));
  const daRenda = (id, extra = {}, carregando = carregandoRenda) => {
    const x = porId[id];
    if (!x) return null;
    return { ...x, estado: carregando ? 'carregando' : x.estado, ...extra };
  };
  const drive = !!(patrimonio && patrimonio.pastaIrConfigurada);
  const itens = [
    daRenda('ir', { acao: { id: drive ? 'ir-drive' : 'pdfs', rotulo: drive ? 'Ler do Drive' : 'Importar PDF' }, automatico: drive ? 'clique' : false }, patrimonio === undefined),
    (() => { const h = daRenda('holerite', {}, salario === undefined); return h && h.estado === 'carregando' ? { ...h, acao: { id: 'holerite', rotulo: 'Importar holerite' } } : documentoHolerite(h, holeritesDrive); })(),
    documentoGastos('faturas', { gastos, gastosDrive, hoje: hojeIso }),
    documentoGastos('extratos', { gastos, gastosDrive, hoje: hojeIso }),
    daRenda('fgts', { frequencia: 'a cada 6 meses (opcional)', como: 'PDF do app FGTS, um por empresa. O saldo anda sozinho com os 8% do salário; o extrato recalibra (juros, saques)', acao: { id: 'pdfs', rotulo: 'Importar PDFs' } }, patrimonio === undefined),
    daRenda('ctps', { acao: { id: 'pdfs', rotulo: 'Importar PDF' } }),
    patrimonio === undefined ? { ...documentoDivida('caixa', {}, hojeIso), estado: 'carregando', acao: null } : documentoDivida('caixa', cfg, hojeIso),
    patrimonio === undefined ? { ...documentoDivida('fies', {}, hojeIso), estado: 'carregando', acao: null } : documentoDivida('fies', cfg, hojeIso),
    documentoB3(hojeIso, patrimonio === undefined ? undefined : ((patrimonio && patrimonio.extratoB3) || null)),
    daRenda('investimentos', {
      nome: 'Investimentos, cotações, índices e proventos', frequencia: 'automático',
      como: 'sincronização com a B3 (compras/vendas), cotações, CDI/IPCA e os índices do apê (FipeZap, IVG-R) - nada a mandar',
      ultimo: (() => { const hm = (patrimonio && patrimonio.historicoMensal) || []; const u = hm[hm.length - 1]; return u ? `histórico até ${rotMes(u.mes)}` : (porId.investimentos && porId.investimentos.ultimo) || null; })(),
    }, salario === undefined && patrimonio === undefined),
    daRenda('informe', {}, false),
  ].filter(Boolean).map((x) => ({ ...x, acao: x.acao && x.acao.id ? x.acao : (x.acao ? { id: x.acao, rotulo: 'Atualizar' } : null) }));
  // o que você manda primeiro (mais urgente em cima); o que chega sozinho depois
  const manual = itens.filter((x) => !x.automatico).sort((a, b) => (PESO[b.estado] || 0) - (PESO[a.estado] || 0));
  const auto = itens.filter((x) => x.automatico).sort((a, b) => (PESO[b.estado] || 0) - (PESO[a.estado] || 0));
  const conta = (f) => itens.filter(f).length;
  return {
    hoje: hojeIso,
    manual, auto, itens: [...manual, ...auto],
    resumo: {
      total: itens.length,
      atrasados: conta((x) => x.estado === 'atrasado'),
      nunca: conta((x) => x.estado === 'falta'),
      atencao: conta((x) => x.estado === 'atencao'),
      emDia: conta((x) => x.estado === 'ok' || x.estado === 'opcional'),
      automaticos: auto.length,
      carregando: conta((x) => x.estado === 'carregando'),
    },
  };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const ICONE_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
const SIMBOLO = { ok: '✓', atencao: '!', atrasado: '!', falta: '+', opcional: '·', carregando: '…' };

export function htmlResumoDocumentos(r) {
  const s = r.resumo;
  const chips = [];
  if (s.atrasados) chips.push(`<span class="og-doc-chip chip-tonal chip-bad">${s.atrasados} ${s.atrasados === 1 ? 'atrasado' : 'atrasados'}</span>`);
  if (s.nunca) chips.push(`<span class="og-doc-chip chip-tonal chip-bad">${s.nunca} nunca ${s.nunca === 1 ? 'enviado' : 'enviados'}</span>`);
  if (s.atencao) chips.push(`<span class="og-doc-chip chip-tonal chip-warn">${s.atencao} pra olhar</span>`);
  if (s.emDia) chips.push(`<span class="og-doc-chip chip-tonal chip-good">${s.emDia} em dia</span>`);
  if (s.carregando) chips.push(`<span class="og-doc-chip chip-tonal chip-info">verificando ${s.carregando}…</span>`);
  return chips.join('');
}

function htmlLinha(x) {
  const rot = ROTULO_ESTADO[x.estado] || '';
  const chip = x.automatico === 'clique' ? '<span class="og-doc-freq auto">Drive · 1 clique</span>' : x.automatico ? '<span class="og-doc-freq auto">automático</span>' : `<span class="og-doc-freq">${esc(x.frequencia)}</span>`;
  const acao = x.acao
    ? (x.acao.href
      ? `<a class="og-doc-btn btn btn-sm ${x.estado === 'ok' ? 'btn-outlined' : 'btn-filled'}" href="${esc(x.acao.href)}">${esc(x.acao.rotulo)}</a>`
      : `<button type="button" class="og-doc-btn btn btn-sm ${x.estado === 'ok' || x.estado === 'opcional' ? 'btn-outlined' : 'btn-filled'}" data-doc-acao="${esc(x.acao.id)}" data-doc="${esc(x.id)}">${esc(x.acao.rotulo)}</button>`)
    : '';
  // 03/10/2026: "Enviar arquivo" em todo item - só some quando a ação principal já É o envio
  const envio = ENVIO_DOCUMENTO[x.id];
  const principalEhEnvio = !!(x.acao && envio && ((envio.destino && x.acao.id === envio.destino) || (envio.href && x.acao.href === envio.href)));
  const enviar = envio && !principalEhEnvio
    ? (envio.href
      ? `<a class="og-doc-btn btn btn-sm btn-outlined og-doc-enviar" href="${esc(envio.href)}">${esc(envio.rotulo || 'Enviar arquivo')}</a>`
      : `<button type="button" class="og-doc-btn btn btn-sm btn-outlined og-doc-enviar" data-doc-enviar="${esc(x.id)}">Enviar arquivo</button>`)
    : '';
  return `<li class="og-doc est-${esc(x.estado)}" data-doc-id="${esc(x.id)}">
      <span class="og-doc-st" title="${esc(rot)}" aria-hidden="true">${SIMBOLO[x.estado] || '·'}</span>
      <div class="og-doc-n"><b>${esc(x.nome)}</b>${chip}<small>${esc(x.como)}</small></div>
      <div class="og-doc-q"><span class="og-doc-est">${esc(rot)}</span>${x.ultimo ? `<span>último: <b>${esc(x.ultimo)}</b></span>` : (x.automatico ? '' : '<span class="og-doc-fraco">o site não guarda a data deste</span>')}${x.proximo ? `<span>${esc(x.proximo)}</span>` : ''}${x.detalhe ? `<span class="og-doc-fraco">${esc(x.detalhe)}</span>` : ''}</div>
      <div class="og-doc-a">${acao}${enviar}</div>${htmlFontesEditaveis(x)}
    </li>`;
}

/** 07/10/2026: "em uso" de cada cartão/conta (desmarcar = encerrado: sai do atrasado, o histórico fica). */
function htmlFontesEditaveis(x) {
  const lista = x.fontesEditaveis || [];
  if (!lista.length) return '';
  const cartao = x.id === 'faturas';
  const encerradas = lista.filter((f) => f.encerrada).length;
  return `<details class="og-doc-fontes" data-doc-det="${esc(x.id)}"><summary>${cartao ? 'Cartões em uso' : 'Contas em uso'} (${lista.length - encerradas} de ${lista.length})</summary>
      <p class="og-doc-fraco">Desmarque ${cartao ? 'o cartão que você cancelou' : 'a conta que você não usa mais'}: sai do "atrasado" e o site para de pedir documento dele. O que já foi importado fica.</p>
      <ul class="og-doc-fontes-ul">${lista.map((f) => `<li><label><input type="checkbox" data-doc-fonte="${esc(f.fonte)}"${f.encerrada ? '' : ' checked'}> <b>${esc(f.nome)}</b> <span class="og-doc-fraco">${f.encerrada ? `encerrado · último ${esc(rotMes(f.ultimo))}` : `último ${esc(rotMes(f.ultimo))}`}</span></label></li>`).join('')}</ul>
    </details>`;
}

export function htmlListaDocumentos(r) {
  return `
    <div class="og-docs-grupo"><div class="og-docs-gcab"><h3>Você manda</h3><span class="hint">PDFs lidos aqui no navegador - nada sobe pra lugar nenhum além da sua planilha</span></div>
      <ul class="og-docs-ul">${r.manual.map(htmlLinha).join('')}</ul></div>
    <div class="og-docs-grupo"><div class="og-docs-gcab"><h3>Chegam sozinhos (ou com 1 clique)</h3><span class="hint">Drive, sincronização e APIs públicas</span></div>
      <ul class="og-docs-ul">${r.auto.map(htmlLinha).join('')}</ul></div>
    <p class="og-nota fraca og-docs-nota">O que ainda dá pra automatizar: o <b>holerite</b> (uma pasta "Holerites" no Drive, lida como a do IR) e o <b>extrato do FGTS</b> (o app não exporta sozinho - por isso o site projeta o saldo com os depósitos do holerite). Financiamento e FIES andam sozinhos: os extratos são só pra recalibrar.</p>`;
}

/** Monta o painel (barra + lista recolhível). */
export function montarPainelDocumentos(raiz, { doc = raiz && raiz.ownerDocument, aoAcao = null, storage = undefined } = {}) {
  const win = doc && doc.defaultView;
  let store = storage;
  if (store === undefined) { try { store = win && win.localStorage; } catch (e) { store = null; } }
  let aberto = false;
  try { aberto = !!store && store.getItem('organizacao.documentos') === '1'; } catch (e) { aberto = false; }
  let r = null;
  raiz.classList.add('og-docs');
  raiz.innerHTML = `
    <button type="button" class="og-docs-barra" aria-expanded="${aberto}" aria-controls="ogDocsLista">
      <span class="og-docs-ico">${ICONE_DOC}</span>
      <span class="og-docs-tit"><b>Documentos</b><small>o que o site precisa de você, e o que chega sozinho</small></span>
      <span class="og-docs-chips" aria-live="polite"><span class="og-doc-chip chip-tonal chip-info">verificando…</span></span>
      <span class="og-docs-ver"><span class="og-docs-ver-t">${aberto ? 'Fechar' : 'Ver lista'}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span>
    </button>
    <div class="og-docs-lista" id="ogDocsLista"${aberto ? '' : ' hidden'}></div>
    <input type="file" id="ogDocsPdf" accept="application/pdf,.pdf" multiple hidden>
    <input type="file" id="ogDocsHolerite" accept="application/pdf,.pdf" hidden>
    <input type="file" id="ogDocsEnviar" hidden>`;
  const barra = raiz.querySelector('.og-docs-barra');
  const lista = raiz.querySelector('.og-docs-lista');

  function abrir(sim) {
    aberto = !!sim;
    barra.setAttribute('aria-expanded', String(aberto));
    lista.hidden = !aberto;
    raiz.classList.toggle('aberto', aberto);
    raiz.querySelector('.og-docs-ver-t').textContent = aberto ? 'Fechar' : 'Ver lista';
    try { if (store) store.setItem('organizacao.documentos', aberto ? '1' : '0'); } catch (e) { /* ok */ }
    if (aberto && r && !lista.innerHTML) lista.innerHTML = htmlListaDocumentos(r);
  }
  raiz.classList.toggle('aberto', aberto);
  barra.addEventListener('click', () => abrir(!aberto));
  const avisar = (acao, extra) => { if (typeof aoAcao === 'function') aoAcao(acao, extra); };
  let enviarPara = null; // id do documento do último "Enviar arquivo"
  function mensagem(texto) {
    let m = lista.querySelector('.og-docs-msg');
    if (!m) { m = doc.createElement('p'); m.className = 'og-nota og-docs-msg'; m.setAttribute('role', 'status'); lista.prepend(m); }
    m.textContent = texto;
  }
  /** Arquivos escolhidos no "Enviar arquivo" -> o leitor do site daquele documento. */
  function enviarArquivos(id, arqs) {
    const envio = ENVIO_DOCUMENTO[id];
    if (!envio || !arqs.length) return;
    if (envio.destino === 'holerite') { avisar('holerite', arqs[0]); return; }
    if (envio.destino === 'pdfs') { avisar('pdfs', arqs); return; }
    if (envio.destino === 'gastos-arquivos') {
      avisar('gastos', { doc: id }); // abre Gastos e Despesas (monta a seção Gastos)
      const ev = new win.CustomEvent(EVENTO_ARQUIVOS_GASTOS, { detail: { arquivos: arqs, doc: id, recebido: false } });
      doc.dispatchEvent(ev);
      if (!ev.detail.recebido) mensagem('Não deu pra abrir os Gastos agora - importe em Gastos e Despesas › Gastos › "Importar do computador".');
    }
  }
  lista.addEventListener('click', (ev) => {
    const env = ev.target.closest('[data-doc-enviar]');
    if (env) {
      const envio = ENVIO_DOCUMENTO[env.dataset.docEnviar];
      if (!envio) return;
      const inp = raiz.querySelector('#ogDocsEnviar');
      enviarPara = env.dataset.docEnviar;
      inp.accept = envio.accept || '';
      inp.multiple = !!envio.multiplo;
      inp.click(); // no MESMO clique (o navegador exige um gesto do usuário)
      return;
    }
    const b = ev.target.closest('[data-doc-acao]');
    if (!b) return;
    const acao = b.dataset.docAcao;
    // o seletor de arquivo precisa abrir no MESMO clique (o navegador exige um gesto do usuário)
    if (acao === 'pdfs') { raiz.querySelector('#ogDocsPdf').click(); return; }
    if (acao === 'holerite') { raiz.querySelector('#ogDocsHolerite').click(); return; }
    avisar(acao, { doc: b.dataset.doc });
  });
  raiz.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.docFonte) { t.disabled = true; avisar('fonte-encerrada', { fonte: t.dataset.docFonte, encerrada: !t.checked }); return; }
    const arqs = [...(t.files || [])];
    t.value = '';
    if (!arqs.length) return;
    if (t.id === 'ogDocsPdf') avisar('pdfs', arqs);
    else if (t.id === 'ogDocsHolerite') avisar('holerite', arqs[0]);
    else if (t.id === 'ogDocsEnviar') { const id = enviarPara; enviarPara = null; enviarArquivos(id, arqs); }
  });

  return {
    atualizar(fontes = {}) {
      r = documentosOrganizacao(fontes);
      raiz.querySelector('.og-docs-chips').innerHTML = htmlResumoDocumentos(r);
      const urgente = r.resumo.atrasados + r.resumo.nunca;
      raiz.classList.toggle('urgente', urgente > 0);
      // 07/10/2026: o "Cartões/Contas em uso" aberto continua aberto depois de salvar (a lista é redesenhada)
      const abertos = new Set([...lista.querySelectorAll('details[open][data-doc-det]')].map((d) => d.dataset.docDet));
      if (aberto) lista.innerHTML = htmlListaDocumentos(r);
      else lista.innerHTML = '';
      abertos.forEach((id) => { const d = lista.querySelector(`details[data-doc-det="${id}"]`); if (d) d.open = true; });
      return r;
    },
    abrir,
    enviarArquivos,
    get resumo() { return r; },
  };
}
