/**
 * organizacao-renda.js - 02/10/2026: seção "Renda" da aba "Renda e
 * Orçamentos" da Organização Financeira (a antiga "Salário e investimentos").
 *
 * Tiago: "Informações sobre o Salário: com as infos do meu IR, dá pra saber
 * quanto eu ganhei mensalmente e conforme os anos ... Gráficos com como meu
 * salário foi crescendo. Outras ideias de gadgets", "Quanto eu invisto por
 * mês do meu salário", "Com base no meu IR, inclua aqui informações sobre as
 * minhas contas: Bancos, com Agência e Conta" e "eu tenho que saber quais
 * documentos preciso enviar mensalmente ou de vez em quando, e o que dá pra
 * ser automatizado".
 *
 * USO (quem integra a aba):
 *
 *   import { montarSecaoRenda } from './organizacao-renda.js';
 *   const renda = montarSecaoRenda(raiz, { patrimonio, salario, doc, hoje, token });
 *   // raiz:       elemento onde a seção desenha (cuida do próprio conteúdo)
 *   // patrimonio: resposta do getPatrimonio JÁ carregada. Usa: config.ir.anos
 *   //             (rendimentosPj, contasBancarias, impostoDevido, restituir/pagar,
 *   //             tributaveis, recebidosPj, exclusivosItens), config.carreira
 *   //             (contratos[].salarios), config.fgts.contas[].dataSaldo,
 *   //             atualizado.carreira/fgts e pastaIrConfigurada. Pode ser null.
 *   // salario:    resposta do getSalario JÁ carregada. Usa: base { liquido,
 *   //             percentualInvestir }, pagamentos [{ mes, tipo, status,
 *   //             totalVencimentos, salarioBase, liquido, inss, irrf, dataCredito }],
 *   //             mensal [{ mes, total, longoPrazo, proventos, parcial }]. Pode ser null.
 *   // doc:        document (padrão: raiz.ownerDocument)
 *   // hoje:       Date ou 'aaaa-mm-dd' (padrão: agora)
 *   // token:      sessão - só pro botão "Ler de novo do Drive" (ou api: {
 *   //             getArquivosIr(), getArquivoIr(id), salvarPatrimonio(chave, valor) })
 *   // opcionais:  secoes (ordem/quais: 'hero','salario','investimento','contas','documentos'),
 *   //             aoAcao(acao) - 'importar-ir' | 'importar-holerite' (também dispara o
 *   //             evento DOM "renda:acao" na raiz), aoAtualizarPatrimonio(resp do salvar),
 *   //             buscarIpca (padrão true: atualiza o IPCA na API do Banco Central),
 *   //             storage (padrão localStorage), carregarPdf/lerPdf (pdf.js).
 *   // retorno:    { atualizar({ patrimonio, salario, hoje }), resumo, lerIrDoDrive() }
 *
 * Visual: o mesmo da aba Patrimônio (patrimonio.css, tokens --pt-*) + renda.css
 * (injetado sozinho se a página ainda não tiver o <link>).
 */
import { getArquivosIrPatrimonio, getArquivoIrPatrimonio, salvarPatrimonio } from '../api-client.js';
import { formatBRL, formatNumeroBR, MESES_CURTOS, formatPct, formatPctSinal, formatMesAno } from '../format.js';
import { ligarFiltroPeriodo, rotuloPeriodo } from '../periodo-personalizado.js';
import { carregarPdfJs, extrairLinhasPdf } from './holerite.js';
import { lerDeclaracaoIr, identificarDocumento } from './patrimonio-import.js';
import { mil, brl0, mesAno, eixoMil, barrasOp, montarBarrasOp } from './patrimonio-graficos.js';
import { montarGrafico, limparGrafico } from './metas-graficos.js'; // 06/10/2026 (Onda 3): gráficos da biblioteca (criam e morfam)
import { kpiHtml, chipHtml, tornarRecolhiveis } from './organizacao-ui.js';
import {
  IPCA_MENSAL, URL_IPCA_BCB, mesclarIpca, ultimoMesIpca, serieRendaAnual, recortarAnos, linhaInflacao, cagrSalario, salarioAtual,
  investimentoDoSalario, recortarMeses, contasDoIr, documentosRenda, analisarSalario,
} from './renda-calc.js';
import { renderAnalise } from '../analise-grafico.js'; // 03/10/2026: card de Análise embaixo do gráfico do salário
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único


const num = (v) => typeof v === 'number' && Number.isFinite(v);
const f1 = (v) => v.toFixed(1);
const dec = (texto) => { const m = String(texto).match(/^(.*?)(,\d{2})$/); return m ? `${esc(m[1])}<span class="dec">${esc(m[2])}</span>` : esc(texto); };

const mesCurto = (m) => formatMesAno(m);
const NOME_FONTE = { holerite: 'holerite', ctps: 'Carteira de Trabalho', ir: 'declaração do IR' };
export const SECOES_RENDA = ['hero', 'salario', 'investimento', 'contas', 'documentos'];
export const PERIODOS_SALARIO = ['5a', '10a', 'tudo'].map((id) => ({ id, nome: rotuloPeriodo(id) }));
export const PERIODOS_INVESTIMENTO = ['6m', '12m', '24m', '36m'].map((id) => ({ id, nome: rotuloPeriodo(id) }));

// ---------------------------------------------------------------------------
// Contas de tudo (sem DOM)
// ---------------------------------------------------------------------------

/** Junta as duas respostas (patrimônio e salário) no que a seção mostra. */
export function resumoRenda({ patrimonio = null, salario = null, hoje = new Date(), ipca = IPCA_MENSAL, investimento = {} } = {}) {
  const hojeIso = hoje instanceof Date ? `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}` : String(hoje).slice(0, 10);
  const cfg = (patrimonio && patrimonio.config) || {};
  const irAnos = (cfg.ir && cfg.ir.anos) || [];
  const carreira = cfg.carreira || null;
  const pagamentos = (salario && salario.pagamentos) || [];
  const base = (salario && salario.base) || null;
  const linhas = serieRendaAnual({ carreira, pagamentos, irAnos, hoje: hojeIso, ipca });
  const completas = linhas.filter((l) => !l.parcial);
  const comIr = linhas.filter((l) => l.declaracao);
  return {
    hoje: hojeIso,
    linhas,
    atual: salarioAtual({ carreira, pagamentos, base, linhas, hoje: hojeIso, ipca }),
    cagr: cagrSalario(completas.length >= 2 ? completas : linhas, ipca),
    ultimoIr: comIr.length ? comIr[comIr.length - 1] : null,
    investimento: investimentoDoSalario({ mensal: (salario && salario.mensal) || [], pagamentos, base, opcoes: investimento }),
    contas: contasDoIr(irAnos),
    documentos: documentosRenda({ patrimonio, salario, hoje: hojeIso }),
    ipcaAte: ultimoMesIpca(ipca),
    ipca,
    temSalario: linhas.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Blocos (HTML puro)
// ---------------------------------------------------------------------------

export function htmlHeroRenda(r) {
  const a = r.atual;
  if (!a) {
    return `<div class="estado rd-hero-vazio"><h3 class="estado-titulo">Renda</h3>
      <p class="estado-texto">Importe um holerite (Orçamento do salário, logo abaixo), a Carteira de Trabalho ou as declarações do IR: o site monta a linha do seu salário.</p></div>`;
  }
  const chip = (v, rot) => (num(v) ? chipHtml(v >= 0 ? 'good' : 'bad', `${esc(formatPctSinal(v))} ${esc(rot)}`, v >= 0 ? 'north-east' : 'south-east') : '');
  const ir = r.ultimoIr;
  const c = r.cagr;
  const origem = a.fonte === 'holerite' ? `holerite de ${mesAno(a.mes)}` : a.fonte === 'ctps' ? 'salário da Carteira de Trabalho' : `média de ${a.mes.slice(0, 4)}`;
  const tom = (v) => ((v || 0) >= 0 ? 'good' : 'bad');
  return `<div class="grid-kpi rd-kpis">
    ${kpiHtml({
    classe: 'rd-kpi-sal', rotulo: `Salário líquido${a.liquidoEstimado ? ' (estimado)' : ''}`, valorHtml: `${dec(formatBRL(a.liquido))}<small class="rd-por-mes">/mês</small>`,
    extraHtml: `<div class="rd-pills">${chip(a.nominal12m, 'em 12 meses')}${chip(a.real12m, 'acima da inflação')}</div>`,
    subHtml: `Bruto <b>${esc(formatBRL(a.bruto))}</b> · ${esc(origem)}`,
  })}
    ${kpiHtml({
    rotulo: 'Em 12 meses', valorHtml: esc(formatPctSinal(a.nominal12m)),
    subHtml: a.antes ? `de ${esc(mil(a.antes.bruto))} (${esc(mesAno(a.antes.mes))}) · IPCA ${esc(formatPct(a.ipca12m))} → <b class="${tom(a.real12m)}">${esc(formatPctSinal(a.real12m))} real</b>` : 'sem o salário de 12 meses atrás',
  })}
    ${kpiHtml({
    rotulo: c ? `Desde ${c.de}` : 'Crescimento', valorHtml: c ? `${esc(formatPctSinal(c.nominal))}/ano` : '—',
    subHtml: c ? `${esc(formatPctSinal(c.acumulado, 0))} no total; inflação ${esc(formatPct(c.inflacaoAcumulada, 0))} → <b class="${c.acimaInflacao >= 0 ? 'good' : 'bad'}">${esc(formatPctSinal(c.acimaInflacao, 0))} de poder de compra</b>` : 'precisa de 2 anos de histórico',
  })}
    ${kpiHtml({
    rotulo: ir ? `Renda em ${ir.ano} (IR)` : 'Renda no ano', valorHtml: ir ? esc(mil(ir.declaracao.bruto)) : '—',
    subHtml: ir ? `${esc(mil(ir.declaracao.bruto / 12))}/mês em média${ir.declaracao.decimoTerceiro ? ` · 13º ${esc(mil(ir.declaracao.decimoTerceiro))}` : ''}${ir.declaracao.plr ? ` · PLR ${esc(mil(ir.declaracao.plr))}` : ''}` : 'importe a declaração do IR',
  })}
  </div>`;
}

/**
 * Salário do mês por ano (06/10/2026, Onda 3 - biblioteca de gráficos): em cima as linhas "bruto/mês" x "se só tivesse acompanhado a
 * inflação (IPCA)"; embaixo as barras agrupadas bruto x líquido. -> spec de montarGrafico ({ tipo:'linha+barras', opcoes, aporte }).
 */
export function opcoesSalarioAnual(linhas, inflacao) {
  if (!linhas.length) return null;
  const rotulo = (l) => `${l.ano}${l.parcial ? '*' : ''}`;
  const eixoX = linhas.map((l) => ({
    rotulo: rotulo(l),
    titulo: `${l.ano}${l.parcial ? ' (até agora)' : ''}`,
  }));
  const tit = (item) => (item && item.titulo) || '';
  const inf = (k) => (inflacao && inflacao[k] && num(inflacao[k].valor) ? inflacao[k].valor : null);
  const ult = linhas[linhas.length - 1];
  const extraDe = (k) => {
    const l = linhas[k];
    const d = l.declaracao;
    const e = [];
    if (num(l.nominal)) e.push({ nome: 'Vs. ano anterior', valor: formatPctSinal(l.nominal) });
    if (num(l.real)) e.push({ nome: 'Acima do IPCA', valor: formatPctSinal(l.real) });
    if (d) e.push({ nome: 'No ano (IR)', valor: brl0(d.bruto) });
    e.push({ nome: 'Fonte', valor: `${NOME_FONTE[l.fonte] || l.fonte}${l.fonte === 'holerite' ? ` (${l.holerites} ${l.holerites === 1 ? 'mês' : 'meses'})` : ''}` });
    return e;
  };
  return {
    tipo: 'linha+barras',
    opcoes: {
      series: [
        { id: 'bruto', nome: 'Bruto/mês', valores: linhas.map((l) => l.brutoMensal), principal: true, area: true, cor: 1, largura: 3 },
        ...(inflacao && inflacao.length > 1 ? [{ id: 'ipca', nome: 'Se só tivesse acompanhado a inflação (IPCA)', valores: linhas.map((l, k) => inf(k)), pontilhada: true, cor: 'var(--chart-axis)', largura: 2 }] : []),
      ],
      eixoX, formatarX: tit, formatarValor: (v) => brl0(v), formatarY: eixoMil, altura: 220, zero: true,
      tooltipExtra: (k) => extraDe(k),
      aria: `Salário bruto por mês de ${brl0(linhas[0].brutoMensal)} em ${linhas[0].ano} para ${brl0(ult.brutoMensal)} em ${ult.ano}`,
    },
    aporte: {
      modo: 'agrupadas', categorias: eixoX, formatarX: tit, formatarValor: (v) => brl0(v), formatarY: eixoMil, altura: 220,
      series: [
        { id: 'bruto', nome: 'Bruto/mês', valores: linhas.map((l) => l.brutoMensal), cor: 1 },
        { id: 'liq', nome: 'Líquido/mês (barras claras = estimado)', valores: linhas.map((l) => (num(l.liquidoMensal) ? l.liquidoMensal : null)), cor: 3 },
      ],
      aria: 'Salário bruto e líquido por mês, ano a ano',
    },
  };
}

export function htmlLegendaSalario() {
  return '<p class="pt-nota pt-nota-pad rd-nota-graf">* ano em andamento · barras: bruto e líquido do mês · linha pontilhada: o que o salário seria se só acompanhasse a inflação.</p>';
}

/** Tabela compacta: salário do mês por ano, crescimento nominal e real. */
export function htmlCrescimentoTabela(linhas) {
  if (!linhas.length) return '<p class="pt-nota">Sem salário ainda.</p>';
  const cel = (v) => (num(v) ? `<span class="${v >= 0 ? 'good' : 'bad'}">${esc(formatPctSinal(v))}</span>` : '<span class="pt-fraco">—</span>');
  const linhasHtml = linhas.slice().reverse().map((l) => `<tr${l.parcial ? ' class="pt-hoje"' : ''}>
      <td>${esc(l.ano)}${l.parcial ? '<small>até agora</small>' : ''}</td>
      <td class="num">${esc(brl0(l.brutoMensal))}<small>${esc(NOME_FONTE[l.fonte] || '')}</small></td>
      <td class="num col-opc">${num(l.liquidoMensal) ? esc(brl0(l.liquidoMensal)) : '—'}${l.liquidoEstimado ? '<small>estimado</small>' : ''}</td>
      <td class="num">${cel(l.nominal)}</td>
      <td class="num col-opc">${l.ipca ? esc(formatPct(l.ipca.taxa)) : '—'}${l.ipca && !l.ipca.completo ? `<small>${l.ipca.meses} meses</small>` : ''}</td>
      <td class="num">${cel(l.real)}</td></tr>`).join('');
  return `<div class="pt-card-cab"><h3>Ano a ano</h3><span class="pt-hint">salário do mês · real = acima da inflação</span></div>
    <div class="tabela-wrap rd-tab-wrap"><table class="tabela tabela-baixa rd-tab"><thead><tr><th scope="col">Ano</th><th scope="col" class="num">Bruto/mês</th><th scope="col" class="num col-opc">Líquido/mês</th><th scope="col" class="num">Cresceu</th><th scope="col" class="num col-opc">IPCA</th><th scope="col" class="num">Real</th></tr></thead><tbody>${linhasHtml}</tbody></table></div>`;
}

/** Carga de impostos por ano (pela declaração) e a de hoje (holerite). */
export function htmlCargaImpostos(r) {
  const comCarga = r.linhas.filter((l) => l.declaracao && num(l.declaracao.carga));
  const a = r.atual;
  const cab = '<div class="pt-card-cab"><h3>Impostos sobre o salário</h3><span class="pt-hint">INSS + IR ÷ bruto (com 13º)</span></div>';
  if (!comCarga.length && !(a && num(a.cargaAtual))) {
    const temIr = r.linhas.some((l) => l.declaracao);
    return `${cab}<p class="pt-nota">${temIr ? 'As declarações salvas não têm o detalhe por fonte pagadora (INSS e IR retido). Leia de novo as declarações (card Documentos) pra ver a carga de cada ano.' : 'Importe as declarações do IR (ou um holerite) pra ver quanto do salário vai pra imposto.'}</p>`;
  }
  const ult = comCarga[comCarga.length - 1];
  const d = ult ? ult.declaracao : null;
  const total = d ? d.inss + d.ir : null;
  const mesesTrab = d ? d.carga * 12 : null;
  const ultimos = comCarga.slice(-8);
  const barras = ultimos.length ? barrasOp({
    modo: 'empilhadas', pct: true, altura: 190, tons: 'categorica', categorias: ultimos.map((l) => String(l.ano)),
    series: [
      { id: 'inss', nome: 'INSS', cor: 'var(--chart-axis)', valores: ultimos.map((l) => l.declaracao.inss / l.declaracao.bruto) },
      { id: 'ir', nome: 'Imposto de renda (no ajuste + 13º)', cor: 8, valores: ultimos.map((l) => l.declaracao.ir / l.declaracao.bruto) },
    ],
    aria: 'Carga de impostos sobre o salário por ano: INSS e imposto de renda, em % do bruto',
  }) : '';
  return `${cab}
    <div class="grid-kpi rd-tiles-2">
      ${d ? kpiHtml({ rotulo: `Em ${ult.ano}`, valorHtml: esc(mil(total)), subHtml: `${esc(formatPct(d.carga))} do bruto = <b>${esc(formatNumeroBR(mesesTrab, 1))} meses</b> de trabalho${d.ajuste ? ` · ${d.ajuste > 0 ? 'restituiu' : 'pagou'} ${esc(mil(Math.abs(d.ajuste)))} no ajuste` : ''}` }) : ''}
      ${a && num(a.cargaAtual) ? kpiHtml({ rotulo: 'No último holerite', valorHtml: esc(formatPct(a.cargaAtual)), subHtml: `INSS + IR retido de ${esc(mesAno(a.mes))}` }) : ''}
    </div>
    ${barras}`;
}

/**
 * Barras do % do líquido investido por mês (06/10/2026, Onda 3 - biblioteca de gráficos): empilhadas só pra dar uma cor por situação
 * (na meta ou acima / abaixo da meta / resgatou mais do que aportou). A meta e a média entram no balão e na nota embaixo.
 * -> spec de montarGrafico ({ tipo:'barras', opcoes }) ou null.
 */
export function opcoesInvestimentoMensal(meses, { meta = null, media = null } = {}) {
  const ms = meses.filter((m) => num(m.pct));
  if (!ms.length) return null;
  const classe = (m) => (m.pct < 0 ? 'neg' : num(meta) && m.pct >= meta ? 'meta' : 'abaixo');
  const serie = (id, nome, cor) => ({ id, nome, cor, valores: ms.map((m) => (classe(m) === id ? m.pct : null)) });
  const pct = (v) => formatPct(v, 1);
  return {
    tipo: 'barras',
    opcoes: {
      modo: 'empilhadas', categorias: ms.map((m) => ({ rotulo: mesCurto(m.mes), titulo: `${mesAno(m.mes)}${m.parcial ? ' (mês em andamento)' : ''}` })),
      formatarX: (item) => (item && item.titulo) || '', formatarValor: pct, formatarY: (v) => `${formatNumeroBR(v * 100, 0)}%`, altura: 230, tons: 'categorica',
      series: [serie('meta', num(meta) ? `Na meta (${formatPct(meta, 0)}) ou acima` : 'Investiu', 'var(--chart-up)'), serie('abaixo', 'Abaixo da meta', 6), serie('neg', 'Resgatou mais do que aportou', 'var(--chart-down)')]
        .filter((sr) => sr.valores.some((v) => v != null)),
      tooltipExtra: (k) => {
        const m = ms[k];
        const e = [{ nome: 'Investido', valor: brl0(m.valor) }, { nome: `Líquido (${m.fonteLiquido === 'holerite' ? 'holerite' : 'base'})`, valor: brl0(m.liquido) }];
        if (num(meta)) e.push({ nome: 'Meta', valor: formatPct(meta, 0) });
        if (num(media)) e.push({ nome: 'Média do período', valor: formatPct(media, 0) });
        return e;
      },
      aria: `Porcentagem do salário líquido investida por mês, ${mesAno(ms[0].mes)} a ${mesAno(ms[ms.length - 1].mes)}`,
    },
  };
}

export function htmlInvestimentoTiles(inv) {
  const m12 = inv.media12; const m6 = inv.media6;
  const t = inv.tendencia;
  const seta = t ? (t.sentido === 'subindo' ? '↗' : t.sentido === 'caindo' ? '↘' : '→') : '';
  const estado = num(inv.meta) && m12 && num(m12.pct) ? (m12.pct >= inv.meta ? 'good' : 'bad') : '';
  return `<div class="grid-kpi rd-inv-tiles">
    ${kpiHtml({ rotulo: 'Média 12 meses', valorHtml: esc(formatPct(m12 && m12.pct)), subHtml: `do líquido · ${esc(brl0(m12 && m12.valor))}/mês${m12 && m12.n < 12 ? ` (${m12.n} meses)` : ''}` })}
    ${kpiHtml({ rotulo: 'Últimos 6 meses', valorHtml: esc(formatPct(m6 && m6.pct)), subHtml: `${esc(brl0(m6 && m6.valor))}/mês${m6 && m12 && num(m6.pct) && num(m12.pct) ? ` · ${m6.pct >= m12.pct ? 'acima' : 'abaixo'} da média de 12` : ''}` })}
    ${kpiHtml({ rotulo: 'Meta', valorHtml: `<span class="${estado}">${esc(formatPct(inv.meta, 0))}</span>`, subHtml: `${num(inv.metaValor) ? `${esc(brl0(inv.metaValor))}/mês · ` : ''}${inv.acimaDaMeta12 != null ? `bateu em ${inv.acimaDaMeta12} dos últimos ${Math.min(12, inv.meses.filter((x) => !x.parcial).length)} meses` : 'defina no Orçamento do salário'}` })}
    ${kpiHtml({ rotulo: 'Tendência', valorHtml: esc(t ? `${seta} ${t.sentido === 'estavel' ? 'estável' : t.sentido}` : '—'), subHtml: t ? `${t.inclinacao >= 0 ? '+' : '−'}${esc(formatNumeroBR(Math.abs(t.inclinacao) * 100, 1))} p.p. por mês nos últimos ${t.meses} meses` : 'precisa de 4 meses' })}
  </div>`;
}

const CORES_BANCO = {
  '001': ['#F8D117', '#003A8C'], '104': ['#005CA9', '#FFFFFF'], '237': ['#CC092F', '#FFFFFF'], '260': ['#820AD1', '#FFFFFF'], '341': ['#EC7000', '#FFFFFF'],
  '033': ['#EC0000', '#FFFFFF'], '077': ['#FF7A00', '#FFFFFF'], '336': ['#1F1F1F', '#FFFFFF'], '102': ['#1F1F1F', '#F5C800'], '348': ['#1F1F1F', '#F5C800'],
  '208': ['#0A2240', '#FFFFFF'], '748': ['#3FA110', '#FFFFFF'], '756': ['#003641', '#C9D200'], '380': ['#21C25E', '#FFFFFF'], '290': ['#1BB99A', '#FFFFFF'],
  '323': ['#00B1EA', '#FFFFFF'], '212': ['#00A651', '#FFFFFF'], '422': ['#0A1F44', '#C9A227'], '623': ['#00AEEF', '#FFFFFF'], '655': ['#1F3FA3', '#FFFFFF'],
};
const TIPO_CONTA = { corrente: 'conta corrente', poupanca: 'poupança', pagamento: 'conta de pagamento', aplicacao: 'aplicação' };
const iniciais = (nome) => String(nome || '?').replace(/^Banco (do |da )?/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

function cartaoConta(c, { antiga = false } = {}) {
  const [bg, fg] = CORES_BANCO[c.banco] || ['var(--surface-3)', 'var(--ink-muted)'];
  const nome = c.bancoNome || (c.descricao || 'Conta').split(/\s+-\s+/)[0];
  const copiar = (v, rot) => (v ? `<button type="button" class="rd-copiar" data-copiar="${esc(v)}" aria-label="Copiar ${esc(rot)} ${esc(v)}" title="Copiar">⧉</button>` : '');
  return `<li class="rd-conta${antiga ? ' antiga' : ''}">
      <span class="rd-logo" style="background:${bg};color:${fg}" aria-hidden="true">${esc(iniciais(nome))}</span>
      <div class="rd-conta-n"><b>${esc(nome)}</b><small>${c.banco ? `${esc(c.banco)} · ` : ''}${esc(TIPO_CONTA[c.tipo] || 'conta')}</small></div>
      <dl class="rd-conta-dados">
        <div><dt>Agência</dt><dd>${c.agencia ? `${esc(c.agencia)}${copiar(c.agencia, 'agência')}` : '<span class="pt-fraco">—</span>'}</dd></div>
        <div><dt>Conta</dt><dd>${c.conta ? `${esc(c.conta)}${copiar(c.conta, 'conta')}` : '<span class="pt-fraco">—</span>'}</dd></div>
      </dl>
      <div class="rd-conta-saldo"><span class="pt-rot">Saldo em 31/12/${esc(c.ano)}</span><b>${esc(formatBRL(c.saldoAtual || 0))}</b>${c.descricao ? `<small title="${esc(c.descricao)}">${esc(c.descricao)}</small>` : ''}</div>
    </li>`;
}

export function htmlContas(info, { drive = false } = {}) {
  if (!info || !info.contas.length) {
    const msg = info && info.semDados
      ? 'As declarações salvas são de antes desta tela e não têm banco, agência e conta. Leia de novo as declarações pra trazer as contas.'
      : 'Importe as declarações do IR: as contas declaradas em Bens e Direitos (banco, agência, conta e saldo em 31/12) aparecem aqui.';
    return `<div class="card pt-card pt-pad"><p class="pt-nota rd-nota-topo">${esc(msg)}</p>${info && info.semDados && drive ? '<button type="button" class="btn btn-outlined pt-btn-sm" data-acao="ler-ir-drive">Ler de novo do Drive</button>' : ''}</div>`;
  }
  return `<ul class="rd-contas">${info.contas.map((c) => cartaoConta(c)).join('')}</ul>
    ${info.antigas.length ? `<details class="rd-antigas"><summary>${info.antigas.length} ${info.antigas.length === 1 ? 'conta que só aparece' : 'contas que só aparecem'} em declarações antigas</summary><ul class="rd-contas">${info.antigas.map((c) => cartaoConta(c, { antiga: true })).join('')}</ul></details>` : ''}
    <p class="pt-nota">Fonte: Declaração IR ${esc(info.exercicio)} (ano ${esc(info.ano)}) · total nas contas em 31/12: <b class="pt-num">${esc(formatBRL(info.total))}</b>. Agência e conta ficam só na sua planilha (aba <code>aux_patrimonio</code>).</p>`;
}

const ESTADO_DOC = { ok: ['ok', '✓', 'em dia'], atencao: ['atencao', '!', 'atenção'], atrasado: ['atrasado', '!', 'atrasado'], falta: ['falta', '+', 'falta'] };
const ROTULO_ACAO = { 'ler-ir-drive': 'Ler do Drive', 'importar-ir': 'Importar PDF', 'importar-holerite': 'Importar holerite' };

export function htmlDocumentos(docs, { lendo = null } = {}) {
  const auto = docs.filter((d) => d.automatico).length;
  const linhas = docs.map((d) => {
    const [cls, simb, rot] = ESTADO_DOC[d.estado] || ESTADO_DOC.ok;
    const botao = d.acao && d.estado !== 'ok' ? `<button type="button" class="pt-mini${d.estado === 'atrasado' || d.estado === 'falta' ? ' falta' : ''}" data-acao="${esc(d.acao)}">${esc(ROTULO_ACAO[d.acao] || 'atualizar')}</button>` : '';
    return `<li class="rd-doc ${cls}">
        <span class="rd-doc-st" aria-label="${esc(rot)}" title="${esc(rot)}">${simb}</span>
        <div class="rd-doc-n"><b>${esc(d.nome)} <span class="rd-chip${d.automatico ? ' auto' : ''}">${d.automatico ? 'automático' : esc(d.frequencia)}</span></b><small>${esc(d.como)}</small></div>
        <div class="rd-doc-q"><span>${d.ultimo ? `último: <b>${esc(d.ultimo)}</b>` : '<span class="pt-fraco">nenhum ainda</span>'}</span><span>${esc(d.proximo || '')}</span>${botao}</div>
      </li>`;
  }).join('');
  return `<div class="pt-card-cab"><h3>Documentos desta aba</h3><span class="pt-hint">${auto} de ${docs.length} chegam sozinhos · o resto é PDF lido aqui no navegador</span></div>
    ${lendo ? `<p class="pt-nota rd-lendo" role="status">${esc(lendo)}</p>` : ''}
    <ul class="rd-docs">${linhas}</ul>`;
}

function tabsHtml(periodos, ativo, nome) {
  return `<div class="filter-tabs rd-filtro" role="group" aria-label="${esc(nome)}">${periodos.map((p) => `<button type="button" class="filter-tab${p.id === ativo ? ' active' : ''}" data-periodo="${p.id}" aria-pressed="${p.id === ativo}">${esc(p.nome)}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Montador
// ---------------------------------------------------------------------------

const CHAVE_PROVENTOS = 'renda.descontarProventos';
// 03/10/2026: "só longo prazo" (sem a reserva) - veio do "Investido mês a
// mês" da antiga aba Salário, que saiu (um gadget só pra "quanto invisto")
const CHAVE_LONGO = 'renda.soLongoPrazo';
const CHAVE_IPCA = 'renda.ipca';
function lerLocal(storage, k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
function gravarLocal(storage, k, v) { try { if (storage) storage.setItem(k, v); } catch (e) { /* ok */ } }

function garantirCss(doc) {
  try {
    if (!doc || !doc.head || doc.querySelector('link[data-renda-css], link[href*="renda.css"]')) return;
    const l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../../css/renda.css', import.meta.url).href;
    l.setAttribute('data-renda-css', '');
    doc.head.appendChild(l);
  } catch (e) { /* sem CSS extra: a seção continua legível com patrimonio.css */ }
}

function base64ParaBytes(b64) {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function montarSecaoRenda(raiz, opcoes = {}) {
  const doc = opcoes.doc || raiz.ownerDocument || globalThis.document;
  const win = doc.defaultView || globalThis;
  const storage = opcoes.storage !== undefined ? opcoes.storage : (() => { try { return win.localStorage; } catch (e) { return null; } })();
  const token = opcoes.token || '';
  const api = opcoes.api || {
    getArquivosIr: () => getArquivosIrPatrimonio(token),
    getArquivoIr: (id) => getArquivoIrPatrimonio(token, id),
    salvarPatrimonio: (chave, valor) => salvarPatrimonio(token, chave, valor),
  };
  const carregarPdf = opcoes.carregarPdf || carregarPdfJs;
  const lerPdf = opcoes.lerPdf || extrairLinhasPdf;
  const secoes = (opcoes.secoes || SECOES_RENDA).filter((s) => SECOES_RENDA.includes(s));
  const est = {
    patrimonio: opcoes.patrimonio || null,
    salario: opcoes.salario || null,
    hoje: opcoes.hoje || new Date(),
    ipca: IPCA_MENSAL,
    perSal: '10a',
    perInv: '12m',
    descontarProventos: lerLocal(storage, CHAVE_PROVENTOS) !== '0',
    soLongoPrazo: lerLocal(storage, CHAVE_LONGO) === '1',
    lendo: null,
  };
  let r = null;
  garantirCss(doc);

  // IPCA guardado no navegador (atualizado da API do BC no máximo 1x por semana)
  try {
    const salvo = JSON.parse(lerLocal(storage, CHAVE_IPCA) || 'null');
    if (salvo && salvo.tabela) est.ipca = mesclarIpca(IPCA_MENSAL, Object.entries(salvo.tabela).flatMap(([a, l]) => l.map((v, i) => ({ data: `01/${String(i + 1).padStart(2, '0')}/${a}`, valor: String(v) }))));
  } catch (e) { /* ok */ }

  function esqueleto() {
    const blocos = {
      hero: '<section class="rd-hero" id="rdHero" aria-label="Resumo da renda"></section>',
      salario: `<section class="pt-sec" id="rdSecSalario"><div class="pt-sec-cab"><h2>Como seu salário cresceu</h2><span class="pt-hint">holerite › Carteira de Trabalho › declaração do IR · contra a inflação (IPCA)</span></div>
          <div class="card pt-card"><div class="rd-graf-cab">${tabsHtml(PERIODOS_SALARIO, est.perSal, 'Período do gráfico do salário')}</div>
            <div class="pt-grafico" id="rdGSal"></div>${htmlLegendaSalario()}<div class="ag-slot pt-analise" id="rdAnaliseSal" hidden></div></div>
          <div class="rd-duas"><div class="card pt-card pt-pad" id="rdTabela"></div><div class="card pt-card pt-pad" id="rdCarga"></div></div></section>`,
      investimento: `<section class="pt-sec" id="rdSecInv"><div class="pt-sec-cab"><h2>Quanto do salário você investe por mês</h2><span class="pt-hint">aportes − resgates do mês ÷ salário líquido do mês</span></div>
          <div class="card pt-card"><div class="rd-inv-topo" id="rdInvTiles"></div>
            <div class="rd-graf-cab">${tabsHtml(PERIODOS_INVESTIMENTO, est.perInv, 'Período do gráfico de investimento')}
              <span class="rd-chks"><label class="pt-chk rd-chk"><input type="checkbox" id="rdDescProv"${est.descontarProventos ? ' checked' : ''}><span>descontar proventos (só o que saiu do salário)</span></label>
              <label class="pt-chk rd-chk"><input type="checkbox" id="rdSoLongo"${est.soLongoPrazo ? ' checked' : ''}><span>só longo prazo (sem mexer na reserva)</span></label></span></div>
            <div class="pt-grafico" id="rdGInv"></div>
            <p class="pt-nota pt-nota-pad" id="rdInvNota"></p></div></section>`,
      contas: '<section class="pt-sec" id="rdSecContas"><div class="pt-sec-cab"><h2>Suas contas</h2><span class="pt-hint">pela declaração do IR mais recente</span></div><div id="rdContas"></div></section>',
      documentos: '<section class="pt-sec" id="rdSecDocs"><div class="card pt-card pt-pad" id="rdDocs"></div></section>',
    };
    raiz.innerHTML = `<div class="rd pt-conteudo">${secoes.map((s) => blocos[s]).join('')}</div>`;
    tornarRecolhiveis(raiz, { seletor: '.rd > .pt-sec', cabecalho: '.pt-sec-cab', abertasNoCelular: secoes.includes('salario') ? 1 : 0, doc }); // a Renda é montada em pedaços (topo, investimento, contas): só o 1º seção fica aberta no celular
    ligarFiltros();
  }

  function calcular() {
    r = resumoRenda({ patrimonio: est.patrimonio, salario: est.salario, hoje: est.hoje, ipca: est.ipca, investimento: { base: est.soLongoPrazo ? 'longoPrazo' : 'total', descontarProventos: est.descontarProventos } });
    return r;
  }

  /** Desenha `spec` na caixa (cria na 1ª vez e morfa depois); sem spec, uma frase no lugar. */
  function desenharGrafico(sel, spec, vazio = 'Sem dados pra este período.') {
    const box = raiz.querySelector(sel);
    if (!box) return;
    if (!spec) { limparGrafico(box); box.innerHTML = `<p class="pt-nota pt-nota-pad">${esc(vazio)}</p>`; return; }
    if (box.querySelector('.pt-nota') && !box.querySelector('.mt-g-principal')) box.textContent = '';
    montarGrafico(box, spec);
  }

  function desenharSalario() {
    if (!raiz.querySelector('#rdGSal')) return;
    const anoHoje = Number(r.hoje.slice(0, 4));
    const recorte = recortarAnos(r.linhas, est.perSal, anoHoje);
    if (!r.linhas.length) {
      desenharGrafico('#rdGSal', null, 'Importe um holerite (Orçamento do salário, logo abaixo), a Carteira de Trabalho ou as declarações do IR pra montar a linha do salário.');
    } else {
      desenharGrafico('#rdGSal', opcoesSalarioAnual(recorte, linhaInflacao(recorte, est.ipca)));
    }
    // 03/10/2026: card de Análise (salário x IPCA no período do filtro)
    let analise = null;
    try { analise = r.linhas.length ? analisarSalario(recorte, est.ipca) : null; } catch (e) { analise = null; }
    renderAnalise(doc, raiz.querySelector('#rdAnaliseSal'), analise);
    raiz.querySelector('#rdTabela').innerHTML = htmlCrescimentoTabela(recorte);
    raiz.querySelector('#rdCarga').innerHTML = htmlCargaImpostos(r);
    montarBarrasOp(raiz.querySelector('#rdCarga'));
  }

  function desenharInvestimento() {
    if (!raiz.querySelector('#rdGInv')) return;
    const inv = r.investimento;
    raiz.querySelector('#rdInvTiles').innerHTML = inv.meses.length ? htmlInvestimentoTiles(inv) : '';
    const recorte = recortarMeses(inv.meses, est.perInv);
    const fech = recorte.filter((m) => !m.parcial && num(m.pct));
    const liq = fech.reduce((s, m) => s + m.liquido, 0);
    const media = liq > 0 ? fech.reduce((s, m) => s + m.valor, 0) / liq : null;
    if (!inv.meses.length) desenharGrafico('#rdGInv', null, 'Sem aportes no site ainda (vêm das Transações).');
    else desenharGrafico('#rdGInv', opcoesInvestimentoMensal(recorte, { meta: inv.meta, media }));
    const nota = raiz.querySelector('#rdInvNota');
    if (nota) nota.textContent = inv.meses.length ? `${num(inv.meta) ? `Meta: ${formatPct(inv.meta, 0)} do líquido. ` : ''}${num(media) ? `Média do período: ${formatPct(media, 0)}.` : ''}` : '';
  }

  function desenhar() {
    if (!raiz.querySelector('.rd')) esqueleto();
    calcular();
    const hero = raiz.querySelector('#rdHero');
    if (hero) hero.innerHTML = htmlHeroRenda(r);
    desenharSalario();
    desenharInvestimento();
    const contas = raiz.querySelector('#rdContas');
    if (contas) contas.innerHTML = htmlContas(r.contas, { drive: !!(est.patrimonio && est.patrimonio.pastaIrConfigurada) });
    const docs = raiz.querySelector('#rdDocs');
    if (docs) docs.innerHTML = htmlDocumentos(r.documentos, { lendo: est.lendo });
  }

  function limitesDe(lista, campo) {
    if (!lista.length) return null;
    const v = String(lista[0][campo]);
    return { min: v.length === 4 ? `${v}-01-01` : `${v}-01`, max: r.hoje };
  }

  const filtros = {};
  function ligarFiltros() {
    raiz.querySelectorAll('.rd-filtro').forEach((tabsEl) => {
      const sal = !!tabsEl.closest('#rdSecSalario');
      const qual = sal ? 'sal' : 'inv';
      const aoMudar = (p) => { if (sal) { est.perSal = p; desenharSalario(); } else { est.perInv = p; desenharInvestimento(); } };
      let ctl = null;
      try {
        ctl = ligarFiltroPeriodo(doc, tabsEl, { chave: sal ? 'renda.salario' : 'renda.investimento', periodoInicial: sal ? est.perSal : est.perInv, comChip: true, aoMudar });
      } catch (e) { ctl = null; }
      if (ctl) {
        filtros[qual] = ctl;
        if (sal) est.perSal = ctl.periodo; else est.perInv = ctl.periodo;
        return;
      }
      tabsEl.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-periodo]');
        if (!b) return;
        tabsEl.querySelectorAll('.filter-tab').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        aoMudar(b.dataset.periodo);
      });
    });
  }

  function atualizarLimitesFiltros() {
    const lims = { sal: limitesDe(r.linhas, 'ano'), inv: limitesDe(r.investimento.meses, 'mes') };
    Object.entries(filtros).forEach(([q, ctl]) => { if (lims[q]) try { ctl.definirLimites(lims[q]); } catch (e) { /* ok */ } });
  }

  async function copiar(btn) {
    const v = btn.dataset.copiar;
    try { await win.navigator.clipboard.writeText(v); btn.textContent = '✓'; } catch (e) { btn.textContent = '✓'; }
    win.setTimeout(() => { btn.textContent = '⧉'; }, 1400);
  }

  /** Lê de novo todas as declarações da pasta IR do Drive e salva (chave 'ir'). */
  async function lerIrDoDrive() {
    est.lendo = 'Procurando as declarações na pasta IR do Drive…';
    desenhar();
    try {
      const lista = await api.getArquivosIr();
      if (!lista || !lista.ok) throw new Error((lista && lista.erro) || 'não deu pra listar a pasta');
      if (!lista.configurado) throw new Error('a pasta do IR ainda não foi configurada (rode configurarPastaIrDireto no Apps Script)');
      const arquivos = lista.arquivos || [];
      if (!arquivos.length) throw new Error('nenhuma declaração na pasta');
      // 03/10/2026 (Tiago: a de 2026 se chama "Cópia da Delcaração.pdf" e o
      // site dizia que faltava): o Apps Script manda o PDF de melhor nome de
      // cada pasta de ano + as alternativas; quem confirma é o CONTEÚDO - o
      // leitor do IR tem que reconhecer a declaração, senão tenta a próxima.
      const alternativas = lista.alternativas || [];
      const grupos = arquivos.map((a) => [a, ...alternativas.filter((x) => x.pasta === a.pasta)]);
      const lib = await carregarPdf(doc);
      const lidas = [];
      let erros = 0;
      for (let k = 0; k < grupos.length; k += 1) {
        let achou = false;
        for (const arq of grupos[k]) {
          est.lendo = `Lendo ${k + 1} de ${grupos.length}: ${arq.pasta || ''}/${arq.nome || ''}`;
          desenhar();
          try {
            const a = await api.getArquivoIr(arq.id);
            if (!a || !a.ok || !a.base64) throw new Error('não veio');
            const linhas = await lerPdf(lib, base64ParaBytes(a.base64));
            if (identificarDocumento(linhas) !== 'ir') continue;
            const { nascimento, ...dados } = lerDeclaracaoIr(linhas);
            if (!dados || !dados.ano) continue;
            lidas.push(dados);
            achou = true;
            break;
          } catch (e) { /* tenta a próxima da mesma pasta */ }
        }
        if (!achou) erros += 1;
      }
      if (!lidas.length) throw new Error('nenhuma declaração pôde ser lida');
      const cfg = (est.patrimonio && est.patrimonio.config) || {};
      const anos = [...((cfg.ir && cfg.ir.anos) || [])];
      lidas.forEach((d) => { const k = anos.findIndex((x) => x.ano === d.ano); if (k >= 0) anos[k] = d; else anos.push(d); });
      anos.sort((a, b) => a.ano - b.ano);
      const resp = await api.salvarPatrimonio('ir', { anos });
      if (!resp || !resp.ok) throw new Error((resp && resp.erro) || 'não salvou');
      est.patrimonio = { ...(est.patrimonio || {}), config: resp.config || { ...cfg, ir: { anos } }, atualizado: resp.atualizado || (est.patrimonio && est.patrimonio.atualizado) || {} };
      est.lendo = `${lidas.length} ${lidas.length === 1 ? 'declaração lida e salva' : 'declarações lidas e salvas'}${erros ? ` · ${erros} com erro` : ''}.`;
      if (typeof opcoes.aoAtualizarPatrimonio === 'function') opcoes.aoAtualizarPatrimonio(resp);
    } catch (e) {
      est.lendo = `Não deu pra ler do Drive: ${String(e && e.message ? e.message : e)}`;
    }
    desenhar();
    atualizarLimitesFiltros();
  }

  raiz.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copiar]');
    if (c) { copiar(c); return; }
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === 'ler-ir-drive') { lerIrDoDrive(); return; }
    if (typeof opcoes.aoAcao === 'function') opcoes.aoAcao(acao);
    try { raiz.dispatchEvent(new win.CustomEvent('renda:acao', { detail: { acao }, bubbles: true })); } catch (er) { /* ok */ }
  });
  raiz.addEventListener('change', (e) => {
    if (e.target.id === 'rdDescProv' || e.target.id === 'rdSoLongo') {
      if (e.target.id === 'rdDescProv') { est.descontarProventos = e.target.checked; gravarLocal(storage, CHAVE_PROVENTOS, e.target.checked ? '1' : '0'); }
      else { est.soLongoPrazo = e.target.checked; gravarLocal(storage, CHAVE_LONGO, e.target.checked ? '1' : '0'); }
      calcular();
      desenharInvestimento();
    }
  });

  desenhar();
  atualizarLimitesFiltros();

  // IPCA mais novo do Banco Central (no máximo 1x por semana; sem rede, fica a tabela)
  const buscar = opcoes.buscarIpca !== false && typeof win.fetch === 'function';
  if (buscar) {
    let recente = false;
    try { const s = JSON.parse(lerLocal(storage, CHAVE_IPCA) || 'null'); recente = s && s.em && Date.now() - s.em < 7 * 864e5; } catch (e) { recente = false; }
    if (!recente) {
      const ctl = typeof win.AbortController === 'function' ? new win.AbortController() : null;
      const t = ctl ? win.setTimeout(() => ctl.abort(), 8000) : null;
      win.fetch(URL_IPCA_BCB, ctl ? { signal: ctl.signal } : undefined).then((x) => x.json()).then((serie) => {
        if (t) win.clearTimeout(t);
        if (!Array.isArray(serie) || !serie.length) return;
        const antes = ultimoMesIpca(est.ipca);
        est.ipca = mesclarIpca(est.ipca, serie);
        gravarLocal(storage, CHAVE_IPCA, JSON.stringify({ em: Date.now(), tabela: est.ipca }));
        if (ultimoMesIpca(est.ipca) !== antes) desenhar();
      }).catch(() => { if (t) win.clearTimeout(t); });
    }
  }

  return {
    atualizar({ patrimonio, salario, hoje } = {}) {
      if (patrimonio !== undefined) est.patrimonio = patrimonio;
      if (salario !== undefined) est.salario = salario;
      if (hoje !== undefined) est.hoje = hoje;
      desenhar();
      atualizarLimitesFiltros();
    },
    lerIrDoDrive,
    get resumo() { return r; },
  };
}
