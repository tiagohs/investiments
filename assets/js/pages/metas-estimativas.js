/**
 * metas-estimativas.js - 07/10/2026 (Tiago, meta de uma chácara com amigos): o HTML do que é NOVO nas Metas - aporte crescente (editor do
 * assistente e frase "R$ 200/mês hoje · R$ 300 a partir de jan/27"), a seção recolhível "Estimativas" do detalhe (quanto você terá em
 * 1, 3, 5 e 10 anos, aporte x rendimento, compra em grupo, simulador "e se custar R$ X") e o cartão da meta "acompanhando" (sem alvo).
 * As contas são de metas-calc-grupo.js / metas-calc-aporte.js; aqui só texto simples (sem jargão) e DOM. Tudo é só a SUA parte.
 */
import { esc } from '../util/html.js';
import { MESES_CURTOS, formatNumeroPt } from '../format.js';
import { formatMoeda, infoHtml, seloMetaHtml, statusPillHtml, valorGrandeHtml } from '../metas-card.js';
import { aparenciaMeta, rotuloDuracao, rotuloMes } from './metas-calc-nucleo.js';
import { planoAporte, resumoAporteCrescente } from './metas-calc-aporte.js';
import {
  composicaoAtual, custosDaMeta, ehImovel, estimativaGrupo, pessoasDoGrupo, precosDeExemplo, projecaoPorAnos, simularPreco, temEstimativas,
} from './metas-calc-grupo.js';

const r0 = (v) => formatMoeda(v, 'BRL', { casas: 0 });
const MESES = MESES_CURTOS;

/** "R$ 200/mês hoje · R$ 300 a partir de jan/2027" ('' sem aporte crescente). */
export function fraseAporteCrescente(c) {
  const ac = c && c.aporteCrescente;
  if (!ac || !ac.proximo) return '';
  return `${r0(ac.hoje)}/mês hoje · ${r0(ac.proximo.valor)} a partir de ${rotuloMes(ac.proximo.mes)}`;
}

/** Texto do tipo de aumento: "R$ 100 por ano" / "10% ao ano". */
export function textoAumento(ac) {
  if (!ac) return '';
  return ac.tipo === 'pct' ? `${String(Math.round(ac.valor * 1000) / 10).replace('.', ',')}% ao ano` : `${r0(ac.valor)} por ano`;
}

// ---------------------------------------------------------------------------
// Assistente: "O aporte aumenta com o tempo?"
// ---------------------------------------------------------------------------

/** Frase ao vivo do editor (id mtCrescResumo): o que a meta vai considerar. */
export function resumoCrescimentoEditor(m, hoje) {
  const plano = planoAporte(m, hoje);
  if (!plano) return m.aporteCrescimento ? 'Informe o seu aporte mensal (acima) e quanto ele aumenta por ano.' : '';
  const r = resumoAporteCrescente(plano, hoje);
  const partes = [`${r0(r.hoje)}/mês hoje`, r.proximo ? `${r0(r.proximo.valor)} a partir de ${rotuloMes(r.proximo.mes)}` : ''];
  if (r.inicio) partes.push(`começou em ${rotuloMes(r.inicio)} com ${r0(r.aporteInicial)}/mês`);
  return partes.filter(Boolean).join(' · ');
}

/** O bloco do assistente (passo Dados) - `data-cresc` liga os campos (metas.js). */
export function aporteCrescimentoEditorHtml(m, hoje) {
  const c = m.aporteCrescimento || null;
  const tipo = c ? (c.tipo === 'pct' ? 'pct' : 'valor') : '';
  const mesHoje = Number(String(hoje || '').slice(5, 7)) || 1;
  const mesAtual = c && c.mes ? c.mes : '';
  const valorTxt = c && c.valor != null ? String(tipo === 'pct' ? Math.round(c.valor * 10000) / 100 : c.valor).replace('.', ',') : '';
  const tip = 'Se você pretende aumentar o aporte todo ano (ex. de R$ 200 para R$ 300 em janeiro), informe aqui: a projeção, o prazo e o aporte necessário passam a usar o aporte de cada mês, em degraus anuais. "Começou a aportar em" é opcional: serve pra contar o que já foi aportado (ex. o 1º ano de R$ 100).';
  return `<fieldset class="mt-grupo-campos mt-cresc"><legend>O aporte aumenta com o tempo? <em>(opcional)</em>${infoHtml(tip, { rotulo: 'Como funciona o aporte que aumenta?' })}</legend>
  <div class="mt-campos">
    <label class="mt-campo"><span>O aporte aumenta</span><select data-cresc="tipo" aria-label="Como o aporte aumenta"><option value="" ${tipo === '' ? 'selected' : ''}>Não, é sempre o mesmo</option><option value="valor" ${tipo === 'valor' ? 'selected' : ''}>R$ por ano</option><option value="pct" ${tipo === 'pct' ? 'selected' : ''}>% ao ano</option></select></label>
    ${tipo ? `<label class="mt-campo"><span>Quanto aumenta por ano</span><span class="mt-entrada">${tipo === 'valor' ? '<span class="mt-prefixo">R$</span>' : ''}<input data-cresc="valor" inputmode="decimal" value="${esc(valorTxt)}" aria-label="Quanto o aporte aumenta por ano">${tipo === 'pct' ? '<span class="mt-sufixo">%</span>' : ''}</span></label>
    <label class="mt-campo"><span>Mês do aumento</span><select data-cresc="mes" aria-label="Mês do aumento">${[['', `Mesmo mês de hoje (${MESES[mesHoje - 1]})`], ...MESES.map((n, i) => [String(i + 1), n])].map(([k, r]) => `<option value="${k}" ${String(mesAtual) === k ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
    <label class="mt-campo"><span>Começou a aportar em <em>(opcional)</em></span><input type="month" data-cresc="inicio" value="${esc((c && c.inicio) || '')}" max="${esc(String(hoje || '').slice(0, 7))}" aria-label="Mês em que começou a aportar"></label>` : ''}
  </div>
  <p class="mt-nota" id="mtCrescResumo">${esc(resumoCrescimentoEditor(m, hoje))}</p></fieldset>`;
}

// ---------------------------------------------------------------------------
// Detalhe: seção "Estimativas"
// ---------------------------------------------------------------------------

/** Texto do resultado do simulador "E se custar R$ X" (o que vai em #mtSimPrecoRes). */
export function resultadoSimuladorHtml(meta, c, sim, hoje) {
  if (!(sim && sim.preco > 0)) return '<p class="mt-nota">Digite o preço (ou toque num exemplo) pra ver a sua parte e quando você chega nela.</p>';
  const r = simularPreco(meta, c, sim.preco, { hoje, mesPrazo: sim.ano ? `${sim.ano}-12` : null });
  if (!r) return '';
  const grupo = r.pessoas > 1 ? ` ÷ ${r.pessoas} pessoas` : '';
  const custos = r.custosPct > 0 ? ` + ${String(Math.round(r.custosPct * 1000) / 10).replace('.', ',')}% de custos` : '';
  const linhas = [`<li>Sua parte: <b class="mono">${r0(r.parte)}</b> <span class="mt-fraco">(${r0(r.preco)}${custos}${grupo})</span></li>`];
  if (r.jaChegou) linhas.push('<li><span class="mt-bom">Você já tem o suficiente pra sua parte.</span></li>');
  else if (r.chegaEm) {
    const aum = c.aporteCrescente ? ' (com o aumento anual do aporte)' : '';
    linhas.push(`<li>No seu ritmo${aum} você chega em <b>${rotuloMes(r.chegaEm.mes)}</b> <span class="mt-fraco">(${rotuloDuracao(r.chegaEm.meses)})</span>.</li>`);
  } else linhas.push('<li><span class="mt-atencao">No ritmo de hoje não chega nessa parte</span> - aumente o aporte ou o rendimento esperado.</li>');
  if (r.noPrazo && !r.jaChegou) {
    const cobre = c.aporteAtual + 0.5 >= r.noPrazo.aporte;
    linhas.push(`<li>Pra chegar até <b>${rotuloMes(r.noPrazo.mes)}</b> precisaria aportar ~<b class="mono">${r0(r.noPrazo.aporte)}</b> por mês (valor fixo)${cobre ? ' - <span class="mt-bom">o seu aporte de hoje já cobre</span>' : (c.aporteAtual > 0 ? ` <span class="mt-fraco">(hoje: ${r0(c.aporteAtual)})</span>` : '')}.</li>`);
  }
  return `<ul class="mt-sim-res">${linhas.join('')}</ul>`;
}

/**
 * A seção "Estimativas" (recolhível). `aberta`: lembra se estava aberta; sem alvo ("acompanhando") ela já abre sozinha, porque
 * é o conteúdo principal. Devolve '' pra tipos de meta em que não faz sentido (reserva, renda passiva, aposentadoria, viagem...).
 */
export function estimativasHtml(meta, c, { hoje, aberta = null, sim = null } = {}) {
  if (!temEstimativas(meta) || !c) return '';
  const acompanhando = !!c.acompanhando;
  const abrir = aberta == null ? acompanhando : aberta;
  const proj = projecaoPorAnos(c);
  const frase = fraseAporteCrescente(c);
  const rend = c.taxa ? `rendimento de ${String(Math.round((meta.rendimentoAnual || 0) * 1000) / 10).replace('.', ',')}% ao ano (você muda em Editar)` : 'sem rendimento informado (só a soma dos aportes)';
  const aporteTxt = c.aporteAtual > 0 ? (frase || `${r0(c.aporteAtual)}/mês`) : 'sem aporte informado';
  const tiles = proj.map((p) => `<div class="mt-estim-ano"><span class="mt-estim-rot">Em ${p.anos} ${p.anos === 1 ? 'ano' : 'anos'}</span><b class="mono">~${r0(p.valor)}</b><small>${r0(p.aportado)} seus + ${r0(p.rendimento)} de rendimento</small></div>`).join('');
  let html = `<section class="mt-bloco mt-estim" id="mtEstimativas"><details id="mtEstimDet" ${abrir ? 'open' : ''}>
  <summary class="mt-bloco-cab"><h3>Estimativas${infoHtml('Contas simples pra você ter uma ideia, com o aporte e o rendimento que você informou (e o aumento anual do aporte, se houver). Não são promessa de resultado. Tudo é só a sua parte.', { rotulo: 'O que são as estimativas?' })}</h3><span class="mt-fraco">projeções simples, só a sua parte</span></summary>
  <h4 class="mt-grupo">Quanto você terá${acompanhando ? '' : ' no seu ritmo'}</h4>
  <div class="mt-estim-anos">${tiles}</div>
  <p class="mt-nota">Aporte: ${esc(aporteTxt)}; ${esc(rend)}. Parte do que você tem hoje (${r0(c.atualRitmo != null ? c.atualRitmo : c.atualBRL)}).</p>`;
  const comp = composicaoAtual(c);
  if (comp && comp.aportado > 0) {
    const tot = Math.max(1, comp.aportado + Math.max(0, comp.rendimento) + comp.valorInicial);
    html += `<h4 class="mt-grupo">Do que você tem, quanto é aporte e quanto é rendimento</h4>
  <div class="mt-comp-barra" role="img" aria-label="Aportes ${r0(comp.aportado)}, rendimento ${r0(Math.max(0, comp.rendimento))}"><span class="aporte" style="flex:${(comp.aportado + comp.valorInicial) / tot}"></span><span class="rend" style="flex:${Math.max(0, comp.rendimento) / tot}"></span></div>
  <p class="mt-nota"><span class="mt-leg aporte"></span>Aportes seus desde ${rotuloMes(comp.desde)}: <b class="mono">${r0(comp.aportado)}</b> · <span class="mt-leg rend"></span>Rendimento: <b class="mono">${comp.rendimento >= 0 ? r0(comp.rendimento) : `−${r0(-comp.rendimento)}`}</b>${comp.valorInicial > 0 ? ` · já tinha ${r0(comp.valorInicial)}` : ''}. É uma conta aproximada: aportes do mês atual não entram.</p>`;
  }
  const g = estimativaGrupo(meta, c);
  if (g) {
    html += `<h4 class="mt-grupo">Compra em grupo (${g.pessoas} pessoas)</h4>
  <p class="mt-nota mt-nota-forte">Se seus amigos estiverem aportando a mesma média que você, o grupo tem <b>~${r0(g.hoje)}</b> hoje e terá <b>~${r0(g.em)}</b> em ${g.anos} anos. Só a sua parte entra no progresso desta meta.</p>`;
  }
  // simulador "E se custar R$ X"
  const exemplos = precosDeExemplo(meta);
  const preco = sim && sim.preco > 0 ? sim.preco : null;
  const ano0 = sim && sim.ano ? sim.ano : (c.dataAlvo ? Number(c.dataAlvo.slice(0, 4)) : Number(String(hoje).slice(0, 4)) + 5);
  const anoHoje = Number(String(hoje).slice(0, 4));
  const anos = Array.from({ length: 12 }, (_, i) => anoHoje + i + 1);
  const cust = custosDaMeta(meta);
  const pessoas = pessoasDoGrupo(meta);
  html += `<h4 class="mt-grupo">E se custar…</h4>
  <div class="mt-sim-preco">
    <label class="mt-campo"><span>${ehImovel(meta) ? 'Preço do imóvel (inteiro)' : 'Preço (inteiro)'}</span><span class="mt-entrada"><span class="mt-prefixo">R$</span><input id="mtSimPreco" inputmode="decimal" value="${preco ? esc(String(preco).replace('.', ',')) : ''}" placeholder="${exemplos.length ? `ex. ${esc(formatNumeroPt(exemplos[1]))}` : 'ex. 20.000'}" aria-label="Preço inteiro"></span></label>
    <label class="mt-campo"><span>Chegar até</span><select id="mtSimAno" aria-label="Ano em que quer chegar">${anos.map((a) => `<option value="${a}" ${a === ano0 ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
  </div>
  ${exemplos.length ? `<div class="mt-sim-chips" role="group" aria-label="Preços de exemplo">${exemplos.map((v) => `<button type="button" class="chip" data-sim-chip="${v}">${r0(v)}</button>`).join('')}</div>` : ''}
  <p class="mt-nota">Sua parte = preço${cust > 0 ? ` x (1 + ${String(Math.round(cust * 1000) / 10).replace('.', ',')}% de custos)` : ''}${pessoas > 1 ? ` ÷ ${pessoas} pessoas` : ''}${cust > 0 && ehImovel(meta) ? ' - os custos são ITBI, escritura e registro (você muda em Editar)' : ''}.</p>
  <div id="mtSimPrecoRes" aria-live="polite">${resultadoSimuladorHtml(meta, c, { preco, ano: ano0 }, hoje)}</div>
  <p class="mt-sim-acoes"><button type="button" class="btn btn-tonal mt-btn-sm" data-sim-ref ${preco ? '' : 'disabled'}>Guardar como preço de referência</button> <button type="button" class="btn btn-text mt-btn-sm" data-sim-alvo ${preco ? '' : 'disabled'}>Usar como alvo</button></p>
  ${meta.especificos && meta.especificos.precoReferencia > 0 ? `<p class="mt-nota">Preço de referência guardado: <b class="mono">${r0(meta.especificos.precoReferencia)}</b>. Ele não vira o alvo da meta sozinho.</p>` : ''}
</details></section>`;
  return html;
}

/**
 * Liga o simulador depois que o HTML da seção está na tela. `sim`: { preco, ano } (muda aqui e fica guardado pela tela);
 * aoGuardar(preco) / aoUsarComoAlvo(parte, preco) são da tela (salvar a meta).
 */
export function ligarEstimativas(raiz, { meta, c, hoje, sim, parseNumero, aoGuardar, aoUsarComoAlvo }) {
  const campo = raiz.querySelector('#mtSimPreco');
  if (!campo) return;
  const ano = raiz.querySelector('#mtSimAno');
  const res = raiz.querySelector('#mtSimPrecoRes');
  const btnRef = raiz.querySelector('[data-sim-ref]');
  const btnAlvo = raiz.querySelector('[data-sim-alvo]');
  sim.ano = ano ? Number(ano.value) : sim.ano;
  const atualizar = () => {
    sim.preco = parseNumero(campo.value);
    sim.ano = ano ? Number(ano.value) : sim.ano;
    if (res) res.innerHTML = resultadoSimuladorHtml(meta, c, sim, hoje);
    [btnRef, btnAlvo].forEach((b) => { if (b) b.disabled = !(sim.preco > 0); });
  };
  campo.addEventListener('input', atualizar);
  if (ano) ano.addEventListener('change', atualizar);
  raiz.querySelectorAll('[data-sim-chip]').forEach((b) => b.addEventListener('click', () => { campo.value = String(b.dataset.simChip).replace('.', ','); atualizar(); }));
  if (btnRef) btnRef.addEventListener('click', () => { if (sim.preco > 0) aoGuardar(sim.preco); });
  if (btnAlvo) btnAlvo.addEventListener('click', () => {
    const r = simularPreco(meta, c, sim.preco, { hoje });
    if (r) aoUsarComoAlvo(r.parte, sim.preco);
  });
}

// ---------------------------------------------------------------------------
// Cartão da lista: meta sem alvo ("acompanhando")
// ---------------------------------------------------------------------------

/** O cartão de uma meta sem valor alvo: o que já tem, o aporte e quanto terá em 5 anos (nada de "informe o alvo"). */
export function cardAcompanhandoHtml(meta, c) {
  const ap = aparenciaMeta(meta);
  const proj5 = projecaoPorAnos(c, [5])[0];
  const frase = fraseAporteCrescente(c);
  const linhas = [
    ['Aporte', c.aporteAtual > 0 ? `${r0(c.aporteAtual)}/mês${c.aporteOrigem === 'historico' ? ' (real)' : ''}` : '—'],
    ['Em 5 anos', c.aporteAtual > 0 || c.atualBRL > 0 ? `~${r0(proj5.valor)}` : '—'],
  ];
  return `<button class="mt-card mt-card-acomp" type="button" data-abrir="${esc(meta.id)}" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <span class="mt-card-cab">
    ${seloMetaHtml(meta)}
    <span class="mt-card-tit"><strong>${esc(meta.nome)}</strong><span>${esc(ap.rotulo)}${pessoasDoGrupo(meta) > 1 ? ` · em grupo (${pessoasDoGrupo(meta)})` : ''}</span></span>
    ${meta.status === 'arquivada' ? '<span class="mt-status na">Arquivada</span>' : statusPillHtml(c.status, meta, null)}
  </span>
  <span class="mt-card-valor"><span class="mt-num">${valorGrandeHtml(c.ja)}</span><span class="mt-de">guardado · ainda sem valor definido</span></span>
  <span class="mt-card-linhas">${linhas.map(([r, v]) => `<span><em>${r}</em><b>${v}</b></span>`).join('')}</span>
  ${frase ? `<span class="mt-aporte ok"><span>Aporte</span><b>${esc(frase)}</b></span>` : ''}
</button>`;
}

