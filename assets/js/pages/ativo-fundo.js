/**
 * ativo-fundo.js - 07/10/2026 (Tiago: fundo DI "Trend DI FC RF Simples RL" guardado pra comprar a chácara com amigos).
 *
 * Três peças do detalhe de um título de Renda Fixa que é FUNDO (ativo.js só as encaixa):
 *  - "Cota do fundo": a cota real (a última conhecida) x a estimativa do site (100% do CDI desde cada compra), a diferença e o campo pra o Tiago
 *    informar uma cota nova (cota + data) - o Apps Script guarda e passa a valer pro valor do título (CarteiraRendaFixaSync.gs);
 *  - "Sobre o fundo": ficha pública (gestora, administrador, CNPJ, liquidez, taxas, tributação com o come-cotas, objetivo) de assets/data/fundos.json;
 *  - "Rentabilidade mensal": anos x meses, o ano, a acumulada e o % do CDI.
 * Os dados do fundo vêm de montarFundoRf (fundos-rf.js); nada do investidor entra em arquivo.
 */

import { formatBRL, formatNumeroBR, formatPercentFromFraction, formatDateBR, hojeSP } from '../format.js';
import { esc } from '../util/html.js';
import { logoCirculoHtml } from './logo-circulo.js';
import { tabelaRentabilidadeFundo, MESES_ABREV } from '../fundos-rf.js';

const pct2 = (v) => `${formatNumeroBR(v, 2)}%`;
const reais = (v) => (typeof v === 'number' ? formatBRL(v) : '—');
const cotaTxt = (v) => `R$ ${formatNumeroBR(v, 8)}`;
const sinal = (v) => (v > 0 ? '+' : (v < 0 ? '−' : ''));

/** Cabeçalho recolhível padrão da tela (mesmo desenho dos outros cards do detalhe). */
function cardRecolhivel(id, titulo, dica, corpo, { aberto = true } = {}) {
  return `
    <details class="card at-card at-recolhe" id="${id}" data-secao="${id.replace(/^at-/, '')}"${aberto ? ' open' : ''}>
      <summary class="at-card-titulo"><h2 id="${id}-titulo">${esc(titulo)}</h2>${dica ? `<span class="hint">${esc(dica)}</span>` : ''}<svg class="ico at-recolhe-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary>
      ${corpo}
    </details>`;
}

// ---------------------------------------------------------------------------
// Cota do fundo
// ---------------------------------------------------------------------------

/** O texto da diferença entre a cota real e a estimativa ("+R$ 1,29 (+0,04%)"). */
export function textoDiferenca(c) {
  if (!c || c.diferenca == null) return '—';
  const abs = formatBRL(Math.abs(c.diferenca));
  const p = c.diferencaPct != null ? ` (${sinal(c.diferencaPct)}${formatPercentFromFraction(Math.abs(c.diferencaPct)).replace('+', '')})` : '';
  return `${sinal(c.diferenca)}${abs}${p}`;
}

export function cotaFundoHtml(ctx) {
  const f = ctx.fundoRf;
  if (!f) return '';
  const c = f.comparacao;
  const hoje = f.hoje || hojeSP(new Date()); // 08/10/2026: o dia do servidor quando veio (o teste fixava 07/10 e o relógio virou)
  const linhas = [];
  if (c) {
    linhas.push(
      linhaCota('Última cota conhecida', `${cotaTxt(c.cota)}`, `de ${formatDateBR(c.dataCota)} · ${c.origem === 'informada' ? 'informada por você' : 'lâmina / app da corretora'}`),
      linhaCota('Suas cotas', formatNumeroBR(c.cotas, 8)),
      linhaCota('Valor pela cota', reais(c.valorPelaCota), `${formatNumeroBR(c.cotas, 4)} × ${cotaTxt(c.cota)}`, { destaque: true }),
      linhaCota('Estimativa do site', reais(c.valorEstimado), c.dataEstimado ? `100% do CDI desde cada compra, em ${formatDateBR(c.dataEstimado)}` : '100% do CDI desde cada compra'),
      linhaCota('Diferença', textoDiferenca(c), 'valor pela cota − estimativa'),
    );
    if (f.cotaInformada && c.valorTitulo != null) {
      linhas.push(linhaCota('Valor do título no site', reais(c.valorTitulo), `cotas × cota informada, corrigida pelo CDI desde ${formatDateBR(f.cotaInformada.data)}`));
    }
  } else {
    linhas.push(`<p class="hint">Sem cota conhecida ainda: informe abaixo a cota de um dia (do app da corretora) para comparar com a estimativa do site.</p>`);
  }
  const titulo = (ctx.ativo && (ctx.ativo.nomePersonalizado || ctx.ativo.nome)) || f.nome || ctx.ticker || '';
  return cardRecolhivel('at-cota-fundo', 'Cota do fundo', 'cota real × estimativa', `
      <div class="at-ind-grade at-cota-grade">${linhas.join('')}</div>
      <form class="at-cota-form" data-cota-fundo data-titulo="${esc(titulo)}" novalidate>
        <p class="at-cota-rotulo">Informar uma cota nova</p>
        <div class="at-cota-campos">
          <label class="at-cota-campo"><span>Cota (R$)</span><input class="input" type="text" inputmode="decimal" name="cota" placeholder="1,65430189" autocomplete="off" required></label>
          <label class="at-cota-campo"><span>Data da cota</span><input class="input" type="date" name="data" value="${esc(hoje)}" max="${esc(hoje)}" required></label>
          <button type="submit" class="btn btn-tonal btn-sm">Salvar cota</button>
        </div>
        <p class="hint at-cota-msg" data-cota-msg role="status" hidden></p>
        <p class="hint">A cota informada vira o valor deste título no site (cotas × cota, corrigida pelo CDI até hoje) - em Início, Carteiras, Patrimônio e Metas. É a estimativa, não um extrato: confira com o app da corretora.</p>
      </form>`);
}

function linhaCota(rotulo, valor, sub = '', { destaque = false } = {}) {
  return `<div class="at-ind"><div class="at-ind-linha"><span class="at-ind-label">${esc(rotulo)}</span><span class="at-ind-valor${destaque ? ' destaque' : ''}">${esc(valor)}</span></div>${sub ? `<span class="at-ind-sub">${esc(sub)}</span>` : ''}</div>`;
}

/** "1,65430189" / "1.65430189" / "R$ 1.234,5" -> número (vírgula = decimal; com vírgula, o ponto é separador de milhar). */
export function numeroDaCota(texto) {
  let t = String(texto == null ? '' : texto).replace(/\s|R\$/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Number(t);
}

/**
 * Liga o formulário "Informar uma cota nova" (delegado no conteúdo da tela, que é redesenhado). `salvar({ titulo, cota, data })` devolve
 * { ok, erro }; `aoSalvar()` recarrega a tela. Valida antes de pedir (cota > 0, data até hoje).
 */
export function ligarCotaFundo(conteudoEl, { salvar, aoSalvar, hoje = () => hojeSP(new Date()) }) {
  conteudoEl.addEventListener('submit', async (ev) => {
    const form = ev.target && ev.target.closest ? ev.target.closest('[data-cota-fundo]') : null;
    if (!form) return;
    ev.preventDefault();
    const msg = form.querySelector('[data-cota-msg]');
    const botao = form.querySelector('button[type="submit"]');
    const mostrar = (t) => { if (msg) { msg.textContent = t; msg.hidden = !t; } };
    const cota = String(form.elements.cota.value || '').trim();
    const data = String(form.elements.data.value || '').trim();
    const n = numeroDaCota(cota);
    if (!(n > 0)) { mostrar('Informe a cota em reais (ex. 1,65430189).'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hoje()) { mostrar('Informe a data da cota (hoje ou antes).'); return; }
    if (botao) botao.disabled = true;
    mostrar('Salvando…');
    let r;
    try { r = await salvar({ titulo: form.dataset.titulo, cota: cota, data }); } catch (e) { r = { ok: false, erro: (e && e.message) || String(e) }; }
    if (!r || !r.ok) { if (botao) botao.disabled = false; mostrar(`Não consegui salvar: ${(r && r.erro) || 'sem resposta'}`); return; }
    mostrar('Salvo. Atualizando…');
    try { await aoSalvar(); } catch (_) { /* a tela mostra o próprio erro */ }
  });
}

// ---------------------------------------------------------------------------
// Sobre o fundo
// ---------------------------------------------------------------------------

const textoTaxa = (v) => (v == null ? 'Não tem' : `${formatNumeroBR(v, 2)}% a.a.`);

/** "R$ 4,48 bi" / "R$ 350 mi" (2 casas: o compacto padrão arredonda 4,48 bi para 4,5). */
function patrimonioTxt(v) {
  if (v >= 1e9) return `R$ ${formatNumeroBR(v / 1e9, 2)} bi`;
  if (v >= 1e6) return `R$ ${formatNumeroBR(v / 1e6, 2)} mi`;
  return formatBRL(v);
}

function mesAno(chave) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(chave || ''));
  return m ? `${MESES_ABREV[Number(m[2]) - 1]}/${m[1]}` : '';
}

export function sobreFundoHtml(ctx) {
  const f = ctx.fundoRf && ctx.fundoRf.info;
  if (!f) return '';
  const linhas = [
    ['CNPJ', f.cnpj],
    ['Gestora', f.gestora],
    ['Administrador', f.administrador],
    ['Custodiante', f.custodiante],
    ['Distribuidor', f.distribuidor],
    ['Auditor', f.auditor],
    ['Público', f.publico],
    ['Início', f.inicio ? formatDateBR(f.inicio) : ''],
    ['Aplicação mínima', typeof f.aplicacaoMinima === 'number' ? formatBRL(f.aplicacaoMinima) : ''],
    ['Saldo / movimentação mínima', typeof f.saldoMinimo === 'number' ? `${formatBRL(f.saldoMinimo)} / ${formatBRL(f.movimentacaoMinima)}` : ''],
    ['Cota de aplicação', f.cotaAplicacao],
    ['Cota de resgate', f.cotaResgate],
    ['Liquidação do resgate', f.liquidacaoResgate],
    ['Taxa de administração', `${textoTaxa(f.taxaAdministracao)}${f.taxaAdministracaoMaxima != null ? ` (máxima ${formatNumeroBR(f.taxaAdministracaoMaxima, 2)}%)` : ''}`],
    ['Taxa de performance', textoTaxa(f.taxaPerformance)],
    ['Taxa de saída', textoTaxa(f.taxaSaida)],
    ['Patrimônio líquido', f.patrimonioLiquido ? `${patrimonioTxt(f.patrimonioLiquido.valor)} (${mesAno(f.patrimonioLiquido.mes)})` : ''],
  ].filter(([, v]) => v).map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${esc(v)}</dd></div>`).join('');
  const chips = [f.classificacaoXp, f.classificacaoCvm ? `CVM: ${f.classificacaoCvm}` : '', f.benchmark ? `Benchmark ${f.benchmark}` : ''].filter(Boolean)
    .map((c) => `<span class="chip-tonal">${esc(c)}</span>`).join('');
  const t = f.tributacao || {};
  const nota = [
    f.administradorNoApp ? `O app da corretora mostra o administrador como ${f.administradorNoApp}` : '',
    f.inicioNoApp ? `e o início como ${formatDateBR(f.inicioNoApp)}` : '',
  ].filter(Boolean).join(' ');
  return cardRecolhivel('at-sobre-fundo', 'Sobre o fundo', f.nome, `
      <header class="at-sobre-topo">
        ${logoCirculoHtml('', { imagem: f.logo, iniciais: 'FD' })}
        <div>
          <p class="at-sobre-nome">${esc(f.nomeCompleto || f.nome)}</p>
          ${chips ? `<div class="at-chips">${chips}</div>` : ''}
        </div>
      </header>
      ${f.objetivo ? `<p class="at-fundo-texto"><b>Objetivo.</b> ${esc(f.objetivo)}${f.fatoresRisco ? ` Fator de risco: ${esc(f.fatoresRisco.replace(/\.$/, ''))}.` : ''}</p>` : ''}
      <dl class="at-dl at-fundo-ficha">${linhas}</dl>
      ${t.tipo ? `<p class="at-fundo-texto"><b>Tributação: ${esc(t.tipo.toLowerCase())}.</b> ${esc(t.comeCotas || '')} ${esc(t.aliquotas || '')}</p>` : ''}
      <p class="hint at-fonte">Fonte: ${esc(f.fonte || 'lâmina da gestora')}${nota ? `. ${esc(nota)}; vale a lâmina` : ''}. Dado público do fundo - confira sempre na lâmina atualizada.</p>`);
}

// ---------------------------------------------------------------------------
// Rentabilidade mensal
// ---------------------------------------------------------------------------

export function rentabilidadeFundoHtml(ctx) {
  const f = ctx.fundoRf;
  if (!f || !f.info) return '';
  const linhas = tabelaRentabilidadeFundo(f.info, f.cdiMensal);
  if (!linhas.length) return '';
  const temCdi = linhas.some((l) => l.meses.some((m) => m.cdi != null));
  const cab = `<tr><th scope="col">Ano</th>${MESES_ABREV.map((m) => `<th scope="col" class="num">${m}</th>`).join('')}<th scope="col" class="num">No ano</th><th scope="col" class="num">Acumulada</th>${temCdi ? '<th scope="col" class="num">% do CDI</th>' : ''}</tr>`;
  const corpo = linhas.map((l) => {
    const cels = l.meses.map((m) => (m.pct == null
      ? `<td class="num vazio" data-r="${m.rotulo}">—</td>`
      : `<td class="num" data-r="${m.rotulo}">${formatNumeroBR(m.pct, 2)}${m.pctCdi != null ? `<small class="at-rent-cdi" title="${m.pctCdi}% do CDI do mês (${formatNumeroBR(m.cdi, 2)}%)">${m.pctCdi}%</small>` : ''}</td>`)).join('');
    return `<tr><th scope="row">${l.ano}${l.parcial ? ` <small>(até ${MESES_ABREV[l.mesesComDado - 1]})</small>` : ''}</th>${cels}
      <td class="num fim" data-r="No ano"><b>${l.pctAno != null ? formatNumeroBR(l.pctAno, 2) : '—'}</b></td>
      <td class="num fim" data-r="Acumulada">${formatNumeroBR(l.acumulada, 2)}${l.acumuladaCalculada ? '<small title="calculada pelos anos">calc.</small>' : ''}</td>
      ${temCdi ? `<td class="num fim" data-r="% do CDI">${l.pctCdiAno != null ? `${l.pctCdiAno}%` : '—'}</td>` : ''}</tr>`;
  }).join('');
  return cardRecolhivel('at-rent-fundo', 'Rentabilidade mensal', 'lâmina da gestora, em %', `
      <div class="tabela-wrap at-rent-wrap">
        <table class="tabela at-rent-tabela" aria-label="Rentabilidade mensal do fundo, em porcentagem">
          <thead>${cab}</thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
      <p class="hint at-fonte">Em cada mês, o número pequeno é o % do CDI daquele mês${temCdi ? '' : ' (sem a série do CDI agora)'}; "% do CDI" do ano compara a rentabilidade do ano com o CDI acumulado nos mesmos meses (2022 começou em setembro: sem comparação). Rentabilidade passada não garante a futura.</p>`, { aberto: false });
}
