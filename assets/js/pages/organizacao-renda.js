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
import { formatBRL, formatNumeroBR } from '../format.js';
import { ligarFiltroPeriodo } from '../periodo-personalizado.js';
import { carregarPdfJs, extrairLinhasPdf } from './holerite.js';
import { lerDeclaracaoIr, identificarDocumento } from './patrimonio-import.js';
import { mil, brl0, mesAno } from './patrimonio-graficos.js';
import {
  IPCA_MENSAL, URL_IPCA_BCB, mesclarIpca, ultimoMesIpca, serieRendaAnual, recortarAnos, linhaInflacao, cagrSalario, salarioAtual,
  investimentoDoSalario, recortarMeses, contasDoIr, documentosRenda, analisarSalario,
} from './renda-calc.js';
import { renderAnalise } from '../analise-grafico.js'; // 03/10/2026: card de Análise embaixo do gráfico do salário

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const f1 = (v) => v.toFixed(1);
const pct = (f, casas = 1) => (num(f) ? `${formatNumeroBR(f * 100, casas)}%` : '—');
const pctSinal = (f, casas = 1) => (num(f) ? `${f > 0.00005 ? '+' : f < -0.00005 ? '−' : ''}${formatNumeroBR(Math.abs(f) * 100, casas)}%` : '—');
const dec = (texto) => { const m = String(texto).match(/^(.*?)(,\d{2})$/); return m ? `${esc(m[1])}<span class="dec">${esc(m[2])}</span>` : esc(texto); };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m) => { const [a, mm] = String(m || '').split('-'); return a && mm ? `${MESES[Number(mm) - 1]}/${a.slice(2)}` : ''; };
const NOME_FONTE = { holerite: 'holerite', ctps: 'Carteira de Trabalho', ir: 'declaração do IR' };
const eixoK = (v) => (v === 0 ? '0' : `${formatNumeroBR(v / 1000, Math.abs(v) < 10000 && v % 1000 ? 1 : 0)} mil`);
function passoRedondo(max, n = 4) {
  const bruto = max / n;
  const pot = 10 ** Math.floor(Math.log10(bruto || 1));
  return [1, 2, 2.5, 5, 10].map((k) => k * pot).find((p) => p >= bruto) || pot * 10;
}
const linhaTt = (rot, valor) => `<div class="pt-tt-l"><span>${esc(rot)}</span><b>${esc(valor)}</b></div>`;

export const SECOES_RENDA = ['hero', 'salario', 'investimento', 'contas', 'documentos'];
export const PERIODOS_SALARIO = [{ id: '5a', nome: '5 anos' }, { id: '10a', nome: '10 anos' }, { id: 'tudo', nome: 'Tudo' }];
export const PERIODOS_INVESTIMENTO = [{ id: '6m', nome: '6 meses' }, { id: '12m', nome: '12 meses' }, { id: '24m', nome: '24 meses' }, { id: '36m', nome: '36 meses' }];

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
    return `<div class="rd-hero-num"><span class="pt-rot">Renda</span><span class="pt-grande">—</span>
      <span class="pt-hero-sub">Importe um holerite (Orçamento do salário, logo abaixo), a Carteira de Trabalho ou as declarações do IR: o site monta a linha do seu salário.</span></div>`;
  }
  const pill = (v, rot) => (num(v) ? `<span class="pt-pill ${v >= 0 ? 'good' : 'bad'}">${esc(pctSinal(v))} ${esc(rot)}</span>` : '');
  const ir = r.ultimoIr;
  const c = r.cagr;
  const origem = a.fonte === 'holerite' ? `holerite de ${mesAno(a.mes)}` : a.fonte === 'ctps' ? 'salário da Carteira de Trabalho' : `média de ${a.mes.slice(0, 4)}`;
  return `
    <div class="rd-hero-num">
      <span class="pt-rot">Salário líquido${a.liquidoEstimado ? ' (estimado)' : ''}</span>
      <span class="pt-grande">${dec(formatBRL(a.liquido))}<small>/mês</small></span>
      <span class="pt-hero-sub">Bruto <b>${esc(formatBRL(a.bruto))}</b> · ${esc(origem)}</span>
      <span class="rd-pills">${pill(a.nominal12m, 'em 12 meses')}${pill(a.real12m, 'acima da inflação')}</span>
    </div>
    <div class="rd-hero-tiles">
      <div><span class="pt-rot">Em 12 meses</span><b>${esc(pctSinal(a.nominal12m))}</b><small>${a.antes ? `de ${esc(mil(a.antes.bruto))} (${esc(mesAno(a.antes.mes))}) · IPCA ${esc(pct(a.ipca12m))} → <b class="${(a.real12m || 0) >= 0 ? 'good' : 'bad'}">${esc(pctSinal(a.real12m))} real</b>` : 'sem o salário de 12 meses atrás'}</small></div>
      <div><span class="pt-rot">${c ? `Desde ${esc(c.de)}` : 'Crescimento'}</span><b>${c ? `${esc(pctSinal(c.nominal))}/ano` : '—'}</b><small>${c ? `${esc(pctSinal(c.acumulado, 0))} no total; inflação ${esc(pct(c.inflacaoAcumulada, 0))} → <b class="${c.acimaInflacao >= 0 ? 'good' : 'bad'}">${esc(pctSinal(c.acimaInflacao, 0))} de poder de compra</b>` : 'precisa de 2 anos de histórico'}</small></div>
      <div><span class="pt-rot">${ir ? `Renda em ${esc(ir.ano)} (IR)` : 'Renda no ano'}</span><b>${ir ? esc(mil(ir.declaracao.bruto)) : '—'}</b><small>${ir ? `${esc(mil(ir.declaracao.bruto / 12))}/mês em média${ir.declaracao.decimoTerceiro ? ` · 13º ${esc(mil(ir.declaracao.decimoTerceiro))}` : ''}${ir.declaracao.plr ? ` · PLR ${esc(mil(ir.declaracao.plr))}` : ''}` : 'importe a declaração do IR'}</small></div>
    </div>`;
}

/** Barras do salário do mês por ano (bruto atrás, líquido na frente) + linha da inflação. */
export function graficoSalarioAnual(linhas, inflacao, { largura = 720, altura = 250 } = {}) {
  if (!linhas.length) return { svg: '', dicas: [] };
  const W = Math.max(300, largura);
  const H = altura;
  const mg = { t: 24, r: 14, b: 26, l: 50 };
  const n = linhas.length;
  const maxV = Math.max(1, ...linhas.map((l) => l.brutoMensal || 0), ...inflacao.map((p) => p.valor || 0)) * 1.08;
  const passo = passoRedondo(maxV, 4);
  const topo = Math.ceil(maxV / passo) * passo;
  const y = (v) => mg.t + (1 - v / topo) * (H - mg.t - mg.b);
  const bw = (W - mg.l - mg.r) / n;
  const larg = Math.min(46, bw * 0.62);
  const xc = (k) => mg.l + bw * k + bw / 2;
  let s = '';
  for (let v = 0; v <= topo + 0.5; v += passo) s += `<line class="${v === 0 ? 'pt-zero' : 'pt-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="pt-eixo" x="${mg.l - 7}" y="${f1(y(v) + 3.5)}" text-anchor="end">${eixoK(v)}</text>`;
  const pulo = n > 14 ? 3 : n > 8 ? 2 : 1;
  const dicas = [];
  linhas.forEach((l, k) => {
    const x0 = xc(k) - larg / 2;
    s += `<rect class="rd-bar-bruto${l.parcial ? ' parcial' : ''}" x="${f1(x0)}" y="${f1(y(l.brutoMensal))}" width="${f1(larg)}" height="${f1(Math.max(1, y(0) - y(l.brutoMensal)))}" rx="3"/>`;
    if (num(l.liquidoMensal)) {
      const li = larg * 0.58;
      s += `<rect class="rd-bar-liq${l.liquidoEstimado ? ' estimado' : ''}${l.parcial ? ' parcial' : ''}" x="${f1(xc(k) - li / 2)}" y="${f1(y(l.liquidoMensal))}" width="${f1(li)}" height="${f1(Math.max(1, y(0) - y(l.liquidoMensal)))}" rx="2"/>`;
    }
    if (k % pulo === (n - 1) % pulo) s += `<text class="pt-eixo${k === n - 1 ? ' pt-eixo-forte' : ''}" x="${f1(xc(k))}" y="${H - 8}" text-anchor="middle">${esc(l.ano)}${l.parcial ? '*' : ''}</text>`;
    s += `<rect class="pt-hit" tabindex="0" data-i="${k}" x="${f1(mg.l + bw * k)}" y="${mg.t}" width="${f1(bw)}" height="${H - mg.t - mg.b}"><title>${esc(`${l.ano}: bruto ${brl0(l.brutoMensal)}/mês`)}</title></rect>`;
    const inf = inflacao[k];
    const d = l.declaracao;
    dicas.push(`<b class="pt-tt-t">${esc(l.ano)}${l.parcial ? ' <small>(até agora)</small>' : ''}</b>`
      + `${linhaTt('Bruto/mês', brl0(l.brutoMensal))}${num(l.liquidoMensal) ? linhaTt(`Líquido/mês${l.liquidoEstimado ? ' (estim.)' : ''}`, brl0(l.liquidoMensal)) : ''}`
      + `${num(l.nominal) ? linhaTt('Vs. ano anterior', pctSinal(l.nominal)) : ''}${num(l.real) ? linhaTt('Acima do IPCA', pctSinal(l.real)) : ''}`
      + `${inf && k > 0 ? linhaTt(`Só com a inflação desde ${linhas[0].ano}`, brl0(inf.valor)) : ''}`
      + `${d ? `<div class="pt-tt-l pt-tt-total"><span>No ano (IR)</span><b>${esc(brl0(d.bruto))}</b></div>` : ''}`
      + `<div class="pt-tt-n">fonte: ${esc(NOME_FONTE[l.fonte] || l.fonte)}${l.fonte === 'holerite' ? ` (${l.holerites} ${l.holerites === 1 ? 'mês' : 'meses'})` : ''}</div>`);
  });
  if (inflacao.length > 1) {
    const pts = inflacao.map((p, k) => `${f1(xc(k))},${f1(y(p.valor))}`);
    s += `<polyline class="rd-inf" points="${pts.join(' ')}"/>`;
    inflacao.forEach((p, k) => { if (k) s += `<circle class="rd-inf-pt" cx="${f1(xc(k))}" cy="${f1(y(p.valor))}" r="2.6"/>`; });
  }
  const ult = linhas[n - 1];
  s += `<text class="pt-rot-v" x="${f1(Math.min(Math.max(xc(n - 1), mg.l + 24), W - mg.r - 24))}" y="${f1(y(ult.brutoMensal) - 7)}" text-anchor="middle">${esc(mil(ult.brutoMensal))}</text>`;
  const rot = `Salário bruto por mês de ${brl0(linhas[0].brutoMensal)} em ${linhas[0].ano} para ${brl0(ult.brutoMensal)} em ${ult.ano}`;
  return { svg: `<svg class="pt-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rot)}">${s}</svg>`, dicas };
}

export function htmlLegendaSalario() {
  return `<div class="pt-leg pt-leg-graf"><span><i class="rd-leg-bruto"></i>Bruto/mês</span><span><i class="rd-leg-liq"></i>Líquido/mês</span><span><i class="rd-leg-inf"></i>Se só tivesse acompanhado a inflação (IPCA)</span><span class="pt-fraco">* ano em andamento</span></div>`;
}

/** Tabela compacta: salário do mês por ano, crescimento nominal e real. */
export function htmlCrescimentoTabela(linhas) {
  if (!linhas.length) return '<p class="pt-nota">Sem salário ainda.</p>';
  const cel = (v) => (num(v) ? `<span class="${v >= 0 ? 'good' : 'bad'}">${esc(pctSinal(v))}</span>` : '<span class="pt-fraco">—</span>');
  const linhasHtml = linhas.slice().reverse().map((l) => `<tr${l.parcial ? ' class="pt-hoje"' : ''}>
      <td class="esq">${esc(l.ano)}${l.parcial ? '<small>até agora</small>' : ''}</td>
      <td>${esc(brl0(l.brutoMensal))}<small>${esc(NOME_FONTE[l.fonte] || '')}</small></td>
      <td class="rd-col-opc">${num(l.liquidoMensal) ? esc(brl0(l.liquidoMensal)) : '—'}${l.liquidoEstimado ? '<small>estimado</small>' : ''}</td>
      <td>${cel(l.nominal)}</td>
      <td class="rd-col-opc">${l.ipca ? esc(pct(l.ipca.taxa)) : '—'}${l.ipca && !l.ipca.completo ? `<small>${l.ipca.meses} meses</small>` : ''}</td>
      <td>${cel(l.real)}</td></tr>`).join('');
  return `<div class="pt-card-cab"><h3>Ano a ano</h3><span class="pt-hint">salário do mês · real = acima da inflação</span></div>
    <div class="pt-tab-wrap rd-tab-wrap"><table class="pt-tab rd-tab"><thead><tr><th class="esq">Ano</th><th>Bruto/mês</th><th class="rd-col-opc">Líquido/mês</th><th>Cresceu</th><th class="rd-col-opc">IPCA</th><th>Real</th></tr></thead><tbody>${linhasHtml}</tbody></table></div>`;
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
  const max = Math.max(0.0001, ...comCarga.map((l) => l.declaracao.carga));
  const barras = comCarga.slice(-8).map((l) => {
    const x = l.declaracao;
    const wI = (x.inss / x.bruto / max) * 100; const wR = (x.ir / x.bruto / max) * 100;
    return `<li><span class="pt-barra-nome">${esc(l.ano)}</span><span class="pt-barra-trilho rd-trilho-pilha"><i style="left:0;width:${wI.toFixed(2)}%;background:var(--pt-div1)"></i><i style="left:${wI.toFixed(2)}%;width:${wR.toFixed(2)}%;background:var(--pt-neg)"></i></span><b class="pt-barra-valor">${esc(pct(x.carga))}</b></li>`;
  }).join('');
  return `${cab}
    <div class="pt-mini-tiles rd-tiles-2">
      ${d ? `<div><span class="pt-rot">Em ${esc(ult.ano)}</span><b>${esc(mil(total))}</b><small>${esc(pct(d.carga))} do bruto = <b>${esc(formatNumeroBR(mesesTrab, 1))} meses</b> de trabalho${d.ajuste ? ` · ${d.ajuste > 0 ? 'restituiu' : 'pagou'} ${esc(mil(Math.abs(d.ajuste)))} no ajuste` : ''}</small></div>` : ''}
      ${a && num(a.cargaAtual) ? `<div><span class="pt-rot">No último holerite</span><b>${esc(pct(a.cargaAtual))}</b><small>INSS + IR retido de ${esc(mesAno(a.mes))}</small></div>` : ''}
    </div>
    ${barras ? `<ul class="pt-barras rd-barras-carga">${barras}</ul><div class="pt-leg rd-leg-carga"><span><i style="background:var(--pt-div1)"></i>INSS</span><span><i style="background:var(--pt-neg)"></i>Imposto de renda (no ajuste + 13º)</span></div>` : ''}`;
}

/** Barras do % do líquido investido por mês, com a meta e a média. */
export function graficoInvestimentoMensal(meses, { meta = null, media = null, largura = 720, altura = 220 } = {}) {
  const ms = meses.filter((m) => num(m.pct));
  if (!ms.length) return { svg: '', dicas: [] };
  const W = Math.max(300, largura);
  const H = altura;
  const mg = { t: 18, r: 54, b: 26, l: 40 };
  const n = ms.length;
  const maxP = Math.max(0.05, ...ms.map((m) => m.pct), num(meta) ? meta : 0) * 1.12;
  const minP = Math.min(0, ...ms.map((m) => m.pct)) * 1.12;
  const passo = passoRedondo(maxP - minP, 4);
  const topo = Math.ceil(maxP / passo) * passo;
  const fundo = Math.floor(minP / passo) * passo;
  const y = (v) => mg.t + ((topo - v) / (topo - fundo || 1)) * (H - mg.t - mg.b);
  const bw = (W - mg.l - mg.r) / n;
  const larg = Math.min(30, bw * 0.66);
  const xc = (k) => mg.l + bw * k + bw / 2;
  let s = '';
  for (let v = fundo; v <= topo + 1e-9; v += passo) s += `<line class="${Math.abs(v) < 1e-9 ? 'pt-zero' : 'pt-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="pt-eixo" x="${mg.l - 6}" y="${f1(y(v) + 3.5)}" text-anchor="end">${formatNumeroBR(v * 100, 0)}%</text>`;
  const pulo = Math.max(1, Math.ceil(n / Math.max(4, Math.floor((W - mg.l - mg.r) / 46))));
  const dicas = [];
  ms.forEach((m, k) => {
    const cls = m.pct < 0 ? 'neg' : num(meta) && m.pct >= meta ? 'meta' : 'abaixo';
    const y0 = y(0); const yv = y(m.pct);
    s += `<rect class="rd-inv-bar ${cls}${m.parcial ? ' parcial' : ''}" x="${f1(xc(k) - larg / 2)}" y="${f1(Math.min(y0, yv))}" width="${f1(larg)}" height="${f1(Math.max(1, Math.abs(y0 - yv)))}" rx="2"/>`;
    if (k % pulo === (n - 1) % pulo) s += `<text class="pt-eixo${k === n - 1 ? ' pt-eixo-forte' : ''}" x="${f1(xc(k))}" y="${H - 8}" text-anchor="middle">${esc(mesCurto(m.mes))}</text>`;
    s += `<rect class="pt-hit" tabindex="0" data-i="${k}" x="${f1(mg.l + bw * k)}" y="${mg.t}" width="${f1(bw)}" height="${H - mg.t - mg.b}"><title>${esc(`${mesCurto(m.mes)}: ${pct(m.pct)}`)}</title></rect>`;
    dicas.push(`<b class="pt-tt-t">${esc(mesAno(m.mes))}${m.parcial ? ' <small>(mês em andamento)</small>' : ''}</b>${linhaTt('Investido', brl0(m.valor))}${linhaTt(`Líquido (${m.fonteLiquido === 'holerite' ? 'holerite' : 'base'})`, brl0(m.liquido))}<div class="pt-tt-l pt-tt-total"><span>Do salário</span><b>${esc(pct(m.pct))}</b></div>${num(meta) ? `<div class="pt-tt-n">meta ${esc(pct(meta, 0))}${m.proventos ? ` · proventos no mês ${esc(brl0(m.proventos))}` : ''}</div>` : ''}`);
  });
  const ref = (v, cls, rot) => (num(v) ? `<line class="${cls}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="pt-rot-m" x="${W - mg.r + 4}" y="${f1(y(v) + 3.5)}">${esc(rot)}</text>` : '');
  const proximas = num(meta) && num(media) && Math.abs(y(meta) - y(media)) < 12;
  s += ref(meta, 'pt-alvo', `meta ${pct(meta, 0)}`);
  s += num(media) ? `<line class="rd-media" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(media))}" y2="${f1(y(media))}"/><text class="pt-rot-m" x="${W - mg.r + 4}" y="${f1(y(media) + 3.5 + (proximas ? (media >= meta ? -10 : 10) : 0))}">média ${esc(pct(media, 0))}</text>` : '';
  return { svg: `<svg class="pt-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Porcentagem do salário líquido investida por mês, ${mesAno(ms[0].mes)} a ${mesAno(ms[n - 1].mes)}`)}">${s}</svg>`, dicas };
}

export function htmlInvestimentoTiles(inv) {
  const m12 = inv.media12; const m6 = inv.media6;
  const t = inv.tendencia;
  const seta = t ? (t.sentido === 'subindo' ? '↗' : t.sentido === 'caindo' ? '↘' : '→') : '';
  const estado = num(inv.meta) && m12 && num(m12.pct) ? (m12.pct >= inv.meta ? 'good' : 'bad') : '';
  return `<div class="pt-tiles rd-inv-tiles">
      <div class="pt-tile dest"><span class="pt-rot">Média 12 meses</span><b>${esc(pct(m12 && m12.pct))}</b><small>do líquido · ${esc(brl0(m12 && m12.valor))}/mês${m12 && m12.n < 12 ? ` (${m12.n} meses)` : ''}</small></div>
      <div class="pt-tile"><span class="pt-rot">Últimos 6 meses</span><b>${esc(pct(m6 && m6.pct))}</b><small>${esc(brl0(m6 && m6.valor))}/mês${m6 && m12 && num(m6.pct) && num(m12.pct) ? ` · ${m6.pct >= m12.pct ? 'acima' : 'abaixo'} da média de 12` : ''}</small></div>
      <div class="pt-tile"><span class="pt-rot">Meta</span><b class="${estado}">${esc(pct(inv.meta, 0))}</b><small>${num(inv.metaValor) ? `${esc(brl0(inv.metaValor))}/mês · ` : ''}${inv.acimaDaMeta12 != null ? `bateu em ${inv.acimaDaMeta12} dos últimos ${Math.min(12, inv.meses.filter((x) => !x.parcial).length)} meses` : 'defina no Orçamento do salário'}</small></div>
      <div class="pt-tile"><span class="pt-rot">Tendência</span><b>${t ? `${seta} ${t.sentido === 'estavel' ? 'estável' : t.sentido}` : '—'}</b><small>${t ? `${t.inclinacao >= 0 ? '+' : '−'}${esc(formatNumeroBR(Math.abs(t.inclinacao) * 100, 1))} p.p. por mês nos últimos ${t.meses} meses` : 'precisa de 4 meses'}</small></div>
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
    return `<div class="pt-card pt-pad"><p class="pt-nota rd-nota-topo">${esc(msg)}</p>${info && info.semDados && drive ? '<button type="button" class="btn btn-ghost pt-btn-sm" data-acao="ler-ir-drive">Ler de novo do Drive</button>' : ''}</div>`;
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
  const dicas = {};
  let r = null;
  garantirCss(doc);

  // IPCA guardado no navegador (atualizado da API do BC no máximo 1x por semana)
  try {
    const salvo = JSON.parse(lerLocal(storage, CHAVE_IPCA) || 'null');
    if (salvo && salvo.tabela) est.ipca = mesclarIpca(IPCA_MENSAL, Object.entries(salvo.tabela).flatMap(([a, l]) => l.map((v, i) => ({ data: `01/${String(i + 1).padStart(2, '0')}/${a}`, valor: String(v) }))));
  } catch (e) { /* ok */ }

  const largura = (sel, padrao) => { const e = raiz.querySelector(sel); return (e && e.clientWidth) || padrao; };

  function esqueleto() {
    const blocos = {
      hero: '<section class="pt-card rd-hero" id="rdHero"></section>',
      salario: `<section class="pt-sec" id="rdSecSalario"><div class="pt-sec-cab"><h2>Como seu salário cresceu</h2><span class="pt-hint">holerite › Carteira de Trabalho › declaração do IR · contra a inflação (IPCA)</span></div>
          <div class="pt-card"><div class="rd-graf-cab">${tabsHtml(PERIODOS_SALARIO, est.perSal, 'Período do gráfico do salário')}</div>
            <div class="pt-grafico" data-grafico="sal" id="rdGSal"></div>${htmlLegendaSalario()}<div class="ag-slot pt-analise" id="rdAnaliseSal" hidden></div></div>
          <div class="rd-duas"><div class="pt-card pt-pad" id="rdTabela"></div><div class="pt-card pt-pad" id="rdCarga"></div></div></section>`,
      investimento: `<section class="pt-sec" id="rdSecInv"><div class="pt-sec-cab"><h2>Quanto do salário você investe por mês</h2><span class="pt-hint">aportes − resgates do mês ÷ salário líquido do mês</span></div>
          <div class="pt-card"><div class="rd-inv-topo" id="rdInvTiles"></div>
            <div class="rd-graf-cab">${tabsHtml(PERIODOS_INVESTIMENTO, est.perInv, 'Período do gráfico de investimento')}
              <span class="rd-chks"><label class="pt-chk rd-chk"><input type="checkbox" id="rdDescProv"${est.descontarProventos ? ' checked' : ''}><span>descontar proventos (só o que saiu do salário)</span></label>
              <label class="pt-chk rd-chk"><input type="checkbox" id="rdSoLongo"${est.soLongoPrazo ? ' checked' : ''}><span>só longo prazo (sem mexer na reserva)</span></label></span></div>
            <div class="pt-grafico" data-grafico="inv" id="rdGInv"></div>
            <div class="pt-leg pt-leg-graf"><span><i style="background:var(--pt-inv)"></i>Na meta ou acima</span><span><i class="rd-leg-abaixo"></i>Abaixo da meta</span><span><i style="background:var(--pt-neg)"></i>Resgatou mais do que aportou</span><span><i class="pt-leg-tracejado"></i>Meta</span><span><i class="rd-leg-media"></i>Média do período</span></div></div></section>`,
      contas: '<section class="pt-sec" id="rdSecContas"><div class="pt-sec-cab"><h2>Suas contas</h2><span class="pt-hint">pela declaração do IR mais recente</span></div><div id="rdContas"></div></section>',
      documentos: '<section class="pt-sec" id="rdSecDocs"><div class="pt-card pt-pad" id="rdDocs"></div></section>',
    };
    raiz.innerHTML = `<div class="rd pt-conteudo">${secoes.map((s) => blocos[s]).join('')}</div>`;
    ligarFiltros();
  }

  function calcular() {
    r = resumoRenda({ patrimonio: est.patrimonio, salario: est.salario, hoje: est.hoje, ipca: est.ipca, investimento: { base: est.soLongoPrazo ? 'longoPrazo' : 'total', descontarProventos: est.descontarProventos } });
    return r;
  }

  function desenharGrafico(sel, chave, g) {
    const box = raiz.querySelector(sel);
    if (!box) return;
    box.innerHTML = g.svg ? `${g.svg}<div class="pt-tt" hidden></div>` : '<p class="pt-nota">Sem dados pra este período.</p>';
    dicas[chave] = g.dicas;
  }

  function desenharSalario() {
    if (!raiz.querySelector('#rdGSal')) return;
    const anoHoje = Number(r.hoje.slice(0, 4));
    const recorte = recortarAnos(r.linhas, est.perSal, anoHoje);
    if (!r.linhas.length) {
      raiz.querySelector('#rdGSal').innerHTML = '<p class="pt-nota">Importe um holerite (Orçamento do salário, logo abaixo), a Carteira de Trabalho ou as declarações do IR pra montar a linha do salário.</p>';
    } else {
      desenharGrafico('#rdGSal', 'sal', graficoSalarioAnual(recorte, linhaInflacao(recorte, est.ipca), { largura: largura('#rdGSal', 720) - 36 }));
    }
    // 03/10/2026: card de Análise (salário x IPCA no período do filtro)
    let analise = null;
    try { analise = r.linhas.length ? analisarSalario(recorte, est.ipca) : null; } catch (e) { analise = null; }
    renderAnalise(doc, raiz.querySelector('#rdAnaliseSal'), analise);
    raiz.querySelector('#rdTabela').innerHTML = htmlCrescimentoTabela(recorte);
    raiz.querySelector('#rdCarga').innerHTML = htmlCargaImpostos(r);
  }

  function desenharInvestimento() {
    if (!raiz.querySelector('#rdGInv')) return;
    const inv = r.investimento;
    raiz.querySelector('#rdInvTiles').innerHTML = inv.meses.length ? htmlInvestimentoTiles(inv) : '';
    const recorte = recortarMeses(inv.meses, est.perInv);
    const fech = recorte.filter((m) => !m.parcial && num(m.pct));
    const liq = fech.reduce((s, m) => s + m.liquido, 0);
    const media = liq > 0 ? fech.reduce((s, m) => s + m.valor, 0) / liq : null;
    if (!inv.meses.length) raiz.querySelector('#rdGInv').innerHTML = '<p class="pt-nota">Sem aportes no site ainda (vêm das Transações).</p>';
    else desenharGrafico('#rdGInv', 'inv', graficoInvestimentoMensal(recorte, { meta: inv.meta, media, largura: largura('#rdGInv', 720) - 36 }));
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

  // balão dos gráficos
  function mostrarDica(alvo) {
    const box = alvo.closest('[data-grafico]');
    const tt = box && box.querySelector('.pt-tt');
    const lista = box && dicas[box.dataset.grafico];
    const html = lista && lista[Number(alvo.dataset.i)];
    if (!tt || !html) return;
    tt.innerHTML = html;
    tt.hidden = false;
    const rb = box.getBoundingClientRect ? box.getBoundingClientRect() : { left: 0, top: 0, width: 0 };
    const ra = alvo.getBoundingClientRect ? alvo.getBoundingClientRect() : { left: 0, top: 0, width: 0 };
    let x = ra.left - rb.left + ra.width / 2 + 12;
    if (x > rb.width - 210) x = Math.max(4, ra.left - rb.left + ra.width / 2 - 222);
    tt.style.left = `${x}px`;
    tt.style.top = '12px';
  }
  function esconderDicas() { raiz.querySelectorAll('.pt-tt').forEach((t) => { t.hidden = true; }); }

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

  raiz.addEventListener('pointermove', (e) => { const h = e.target.closest && e.target.closest('.pt-hit'); if (h) mostrarDica(h); else esconderDicas(); });
  raiz.addEventListener('pointerleave', esconderDicas);
  raiz.addEventListener('focusin', (e) => { if (e.target.classList && e.target.classList.contains('pt-hit')) mostrarDica(e.target); });
  raiz.addEventListener('focusout', esconderDicas);
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
