/**
 * novo-ativo.js - 26/09/2026 (Tiago: "Poderíamos criar um processo de
 * adicionar um novo ativo? isso estaria na tela de carteiras").
 *
 * Janela "Adicionar ativo" de Carteiras. O cadastro de verdade é do Apps
 * Script (apps-script/NovoAtivo.gs): linha nova na aba "Carteira ..." com as
 * fórmulas da linha de cima, linha no Radar de oportunidades (preço-teto e %
 * desejado) e em Auxiliar_ativos. Aqui:
 *   1. formulário (o ticker é conferido na hora: já existe? está na base da
 *      planilha? - GET infoNovoAtivo);
 *   2. "Conferir" = simular: mostra as linhas que vão ser usadas;
 *   3. "Cadastrar" = grava; depois dá pra desfazer (só sem transação) e o
 *      topo mostra "Consolidação necessária".
 * Abre também por endereço (?novoAtivo=XYZ3&classe=acoes) - é o atalho da
 * revisão de extratos em Transações quando o ativo ainda não existe.
 */
import { getInfoNovoAtivo, adicionarAtivo, removerAtivo } from '../api-client.js';
import { formatBRL, formatUSD, formatNumeroBR } from '../format.js';

export const CLASSES_NOVO_ATIVO = {
  acoes: { nome: 'Ações', cor: '--acoes', moeda: 'BRL', exemplo: 'ABCD3', campos: ['tipoCarteira', 'setor', 'subsetor', 'segmento'], tipos: ['Dividendos', 'Ações Internacionais'], aba: 'Carteira Ações' },
  fiis: { nome: 'FIIs', cor: '--fiis', moeda: 'BRL', exemplo: 'ABCD11', campos: ['tipoFii', 'segmento'], tipos: ['Tijolo', 'Papel', 'Híbrido'], aba: 'Carteira FIIs' },
  acoesEua: { nome: 'Ações EUA', cor: '--usa', moeda: 'USD', exemplo: 'ABCD', campos: ['tipoCarteira', 'setor', 'subsetor', 'segmento'], tipos: ['Ações Internacionais'], aba: 'Carteira Ações USA' },
};
const ROTULOS = { tipoCarteira: 'Tipo da carteira', tipoFii: 'Tipo do FII', setor: 'Setor', subsetor: 'Subsetor', segmento: 'Segmento' };
export const CLASSE_DA_PAGINA = { acoes: 'acoes', fiis: 'fiis', 'acoes-eua': 'acoesEua' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function normalizarTickerNovo(classe, ticker) {
  let t = String(ticker || '').trim().toUpperCase();
  if (classe !== 'acoesEua' && /^[A-Z]{4}\d{1,2}F$/.test(t)) t = t.slice(0, -1);
  return t;
}

export function tickerValidoNovo(classe, t) {
  if (classe === 'acoesEua') return /^[A-Z]{1,5}(\.[A-Z])?$/.test(t);
  if (classe === 'fiis') return /^[A-Z]{4}11[A-Z]?$/.test(t);
  return /^[A-Z]{4}\d{1,2}$/.test(t);
}

function numero(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s|R\$|US\$|%/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : NaN;
}

/** valores do formulário -> { ok, erros: { campo: msg }, ativo } (o que vai pro Apps Script). */
export function validarFormNovoAtivo(classe, valores) {
  const cfg = CLASSES_NOVO_ATIVO[classe];
  const erros = {};
  if (!cfg) return { ok: false, erros: { classe: 'Escolha a classe.' }, ativo: null };
  const ticker = normalizarTickerNovo(classe, valores.ticker);
  if (!ticker) erros.ticker = 'Informe o ticker.';
  else if (!tickerValidoNovo(classe, ticker)) erros.ticker = `Ticker de ${cfg.nome} é assim: ${cfg.exemplo}.`;
  const nome = String(valores.nome || '').trim();
  if (!nome) erros.nome = 'Informe o nome (aparece nas telas).';
  const teto = numero(valores.precoTeto);
  if (teto == null) erros.precoTeto = 'O preço-teto define o viés (Comprar / Aguardar) no Radar.';
  else if (!(teto > 0)) erros.precoTeto = 'Preço-teto precisa ser maior que zero.';
  const pct = numero(valores.percentualDesejado);
  if (pct != null && (!(pct >= 0) || pct > 100)) erros.percentualDesejado = 'Entre 0 e 100%.';
  const ranking = numero(valores.ranking);
  if (ranking != null && !(ranking >= 1 && Number.isInteger(ranking))) erros.ranking = 'Número inteiro (1, 2, 3...) ou vazio.';
  const ativo = { classe, ticker, nome, precoTeto: teto, percentualDesejado: pct == null ? 0 : Math.round(pct * 100) / 10000 };
  if (ranking != null) ativo.ranking = ranking;
  cfg.campos.forEach((c) => { const v = String(valores[c] || '').trim(); if (v) ativo[c] = v; });
  return { ok: !Object.keys(erros).length, erros, ativo };
}

/** O plano (simular) em frases. */
export function linhasDoPlano(plano) {
  if (!plano) return [];
  return [
    `<b>${esc(plano.carteira.aba)}</b>, linha ${plano.carteira.linha}: seus dados + as fórmulas da linha ${plano.carteira.modelo} (quantidade, cotação, preço médio...)`,
    `<b>Distribuição e Metas</b> › Radar de oportunidades, linha ${plano.radar.linha}: ranking ${plano.radar.ranking}, preço-teto e % desejado (as linhas de baixo descem 1)`,
    `<b>Auxiliar_ativos</b>, linha ${plano.auxiliar.linha}: fórmulas iguais às da linha ${plano.auxiliar.modelo} (é daqui que o app lê a carteira)`,
  ];
}

function moedaFmt(classe, v) {
  if (v == null) return '—';
  return CLASSES_NOVO_ATIVO[classe].moeda === 'USD' ? formatUSD(v) : formatBRL(v);
}

function estadoInicial(classe, ticker) {
  return { classe: CLASSES_NOVO_ATIVO[classe] ? classe : '', valores: { ticker: ticker || '' }, erros: {}, info: null, conferindo: false, etapa: 'form', plano: null, mensagem: null, feito: null };
}

function campoHtml(id, rotulo, input, erro, ajuda = '') {
  return `
    <label class="na-campo${erro ? ' com-erro' : ''}" for="${id}">
      <span class="na-rotulo">${rotulo}</span>
      ${input}
      ${erro ? `<span class="na-erro" id="${id}Erro">${esc(erro)}</span>` : (ajuda ? `<span class="na-ajuda">${ajuda}</span>` : '')}
    </label>`;
}

function infoTickerHtml(e) {
  const i = e.info;
  if (e.conferindo) return '<div class="na-info"><span class="na-spin" aria-hidden="true"></span>Conferindo o ticker…</div>';
  if (!i) return '';
  if (i.erro) return `<div class="na-info aviso">${esc(i.erro)}</div>`;
  if (i.existe && i.existe.length) return `<div class="na-info erro"><b>${esc(i.ticker)} já está cadastrado</b> (${esc(i.existe.join(', '))}).</div>`;
  if (i.base) {
    const b = i.base;
    const partes = [b.preco != null ? `cotação ${moedaFmt(e.classe, b.preco)}` : '', b.dy != null ? `DY ${formatNumeroBR(b.dy * (b.dy < 1 ? 100 : 1), 2)}%` : '', b.pvp != null ? `P/VP ${formatNumeroBR(b.pvp, 2)}` : '', b.pl != null ? `P/L ${formatNumeroBR(b.pl, 2)}` : '', b.gestao ? `gestão ${esc(b.gestao)}` : ''].filter(Boolean);
    return `<div class="na-info ok"><b>${esc(i.ticker)}</b> encontrado na base da planilha${partes.length ? `: ${partes.join(' · ')}` : ''}.</div>`;
  }
  if (i.valido) return `<div class="na-info aviso"><b>${esc(i.ticker)}</b> não está na base de dados da planilha. Pode cadastrar mesmo assim: a cotação vem do Google Finance. Só confira se o ticker está certo.</div>`;
  return '';
}

function formHtml(e, opcoes) {
  const cfg = CLASSES_NOVO_ATIVO[e.classe];
  const v = e.valores;
  const classes = Object.entries(CLASSES_NOVO_ATIVO).map(([k, c]) => `
    <button type="button" class="na-classe${k === e.classe ? ' ativa' : ''}" data-na-classe="${k}" style="--cor:var(${c.cor})" aria-pressed="${k === e.classe}">${esc(c.nome)}</button>`).join('');
  if (!cfg) {
    return `<p class="na-intro">Qual o tipo do ativo?</p><div class="na-classes" role="group" aria-label="Classe do ativo">${classes}</div>`;
  }
  const lista = (campo, extras = []) => {
    const itens = [...new Set([...(opcoes[campo] || []), ...extras])];
    return itens.length ? `<datalist id="naLista-${campo}">${itens.map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist>` : '';
  };
  const extrasCampos = cfg.campos.map((c) => {
    const eTipo = c === 'tipoCarteira' || c === 'tipoFii';
    const valor = v[c] != null ? v[c] : (eTipo ? cfg.tipos[0] : '');
    return campoHtml(`na-${c}`, ROTULOS[c], `<input id="na-${c}" name="${c}" type="text" autocomplete="off" value="${esc(valor)}" list="naLista-${c}">${lista(c, eTipo ? cfg.tipos : [])}`, e.erros[c]);
  }).join('');
  const simbolo = cfg.moeda === 'USD' ? 'US$' : 'R$';
  return `
    <div class="na-classes" role="group" aria-label="Classe do ativo">${classes}</div>
    <form class="na-form" id="naForm" novalidate>
      <div class="na-grade">
        ${campoHtml('na-ticker', 'Ticker', `<input id="na-ticker" name="ticker" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${cfg.exemplo}" value="${esc(v.ticker || '')}"${e.erros.ticker ? ' aria-invalid="true" aria-describedby="na-tickerErro"' : ''}>`, e.erros.ticker)}
        ${campoHtml('na-nome', 'Nome', `<input id="na-nome" name="nome" type="text" autocomplete="off" placeholder="Nome da empresa / fundo" value="${esc(v.nome || '')}"${e.erros.nome ? ' aria-invalid="true"' : ''}>`, e.erros.nome)}
      </div>
      <div id="naInfo">${infoTickerHtml(e)}</div>
      <div class="na-grade">
        ${campoHtml('na-precoTeto', `Preço-teto (${simbolo})`, `<input id="na-precoTeto" name="precoTeto" type="text" inputmode="decimal" placeholder="0,00" value="${esc(v.precoTeto || '')}"${e.erros.precoTeto ? ' aria-invalid="true"' : ''}>`, e.erros.precoTeto, 'Abaixo dele o viés fica <b>Comprar</b>.')}
        ${campoHtml('na-percentualDesejado', `% desejado em ${esc(cfg.nome)}`, `<input id="na-percentualDesejado" name="percentualDesejado" type="text" inputmode="decimal" placeholder="0" value="${esc(v.percentualDesejado || '')}">`, e.erros.percentualDesejado, 'Peso na classe. Dá pra ajustar depois no Radar.')}
      </div>
      <div class="na-grade na-grade-3">${extrasCampos}</div>
      <details class="na-mais"${v.ranking ? ' open' : ''}>
        <summary>Mais opções</summary>
        <div class="na-grade">${campoHtml('na-ranking', 'Ranking no Radar', `<input id="na-ranking" name="ranking" type="text" inputmode="numeric" placeholder="último" value="${esc(v.ranking || '')}">`, e.erros.ranking, 'Vazio = depois do último.')}</div>
      </details>
    </form>`;
}

function conteudoHtml(e, opcoes) {
  if (e.etapa === 'feito') {
    const f = e.feito;
    return `
      <div class="na-feito">
        <div class="na-feito-selo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h3>${esc(f.ticker)} cadastrado</h3>
        <ul class="na-plano">${linhasDoPlano(f).map((l) => `<li>${l}</li>`).join('')}</ul>
        <p class="na-nota">Ele já aparece em Carteiras e no Radar (quantidade zero até a 1ª compra). Quando a compra entrar pelo extrato em <b>Transações</b>, o aviso <b>Consolidação necessária</b> no topo monta o histórico dele.</p>
        ${e.mensagem ? `<div class="na-info ${e.mensagem.tipo}">${e.mensagem.html}</div>` : ''}
      </div>`;
  }
  const plano = e.etapa === 'conferido' && e.plano ? `
    <div class="na-plano-box">
      <h4>O que vai ser criado na planilha</h4>
      <ul class="na-plano">${linhasDoPlano(e.plano).map((l) => `<li>${l}</li>`).join('')}</ul>
    </div>` : '';
  return `${formHtml(e, opcoes)}${plano}${e.mensagem ? `<div class="na-info ${e.mensagem.tipo}" role="status">${e.mensagem.html}</div>` : ''}`;
}

function rodapeHtml(e) {
  if (e.etapa === 'feito') {
    return `
      <button type="button" class="btn btn-ghost" data-na="desfazer">Desfazer cadastro</button>
      <a class="btn btn-ghost" href="../transacoes/index.html" data-na="transacoes">Lançar a compra</a>
      <button type="button" class="btn btn-primary" data-na="fechar-recarregar">Ver na carteira</button>`;
  }
  if (!e.classe) return '<button type="button" class="btn btn-ghost" data-na="fechar">Cancelar</button>';
  const ocupado = e.enviando ? ' disabled' : '';
  return `
    <button type="button" class="btn btn-ghost" data-na="fechar">Cancelar</button>
    ${e.etapa === 'conferido'
    ? `<button type="button" class="btn btn-primary" data-na="cadastrar"${ocupado}>${e.enviando ? '<span class="spinner" aria-hidden="true"></span>Cadastrando…' : 'Cadastrar na planilha'}</button>`
    : `<button type="button" class="btn btn-primary" data-na="conferir"${ocupado}>${e.enviando ? '<span class="spinner" aria-hidden="true"></span>Conferindo…' : 'Conferir'}</button>`}`;
}

/**
 * Liga os botões [data-novo-ativo] (valor = classe, ou vazio = perguntar) e
 * devolve { abrir(classe, ticker), fechar() }.
 * aoFechar({ cadastrou }) - Carteiras recarrega quando algo foi cadastrado.
 */
export function ligarNovoAtivo(doc, {
  token, getInfoImpl = getInfoNovoAtivo, adicionarImpl = adicionarAtivo, removerImpl = removerAtivo,
  classeAtual = () => '', aoFechar = null, abrirDaUrl = true, debounceMs = 450,
} = {}) {
  const win = doc.defaultView;
  const raiz = doc.createElement('div');
  raiz.className = 'na-fundo';
  raiz.hidden = true;
  raiz.innerHTML = `
    <div class="na-janela" role="dialog" aria-modal="true" aria-labelledby="naTitulo">
      <header class="na-cab">
        <div><span class="na-eyebrow">Carteiras</span><h2 id="naTitulo">Adicionar ativo</h2></div>
        <button type="button" class="na-x" data-na="fechar" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>
      </header>
      <div class="na-corpo" id="naCorpo"></div>
      <footer class="na-rodape" id="naRodape"></footer>
    </div>`;
  doc.body.appendChild(raiz);
  const corpo = raiz.querySelector('#naCorpo');
  const rodape = raiz.querySelector('#naRodape');
  let e = estadoInicial('', '');
  let opcoesPorClasse = {};
  let timer = null;
  let ultimoFoco = null;
  let seq = 0;

  function lerValores() {
    const form = corpo.querySelector('#naForm');
    if (!form) return;
    form.querySelectorAll('input[name]').forEach((i) => { e.valores[i.name] = i.value; });
  }

  function render(focar) {
    corpo.innerHTML = conteudoHtml(e, opcoesPorClasse[e.classe] || {});
    rodape.innerHTML = rodapeHtml(e);
    if (focar) {
      const alvo = corpo.querySelector(focar);
      if (alvo) { alvo.focus(); if (typeof alvo.setSelectionRange === 'function' && alvo.value) { try { alvo.setSelectionRange(alvo.value.length, alvo.value.length); } catch (_) { /* ok */ } } }
    }
  }

  function renderInfo() {
    const box = corpo.querySelector('#naInfo');
    if (box) box.innerHTML = infoTickerHtml(e);
  }

  async function conferirTicker() {
    const t = normalizarTickerNovo(e.classe, e.valores.ticker);
    if (!e.classe || !tickerValidoNovo(e.classe, t)) { e.info = null; e.conferindo = false; renderInfo(); return; }
    const minha = ++seq;
    e.conferindo = true;
    renderInfo();
    const r = await getInfoImpl(token, e.classe, t);
    if (minha !== seq) return;
    e.conferindo = false;
    if (r && r.ok !== false) {
      e.info = r;
      if (r.opcoes) opcoesPorClasse[e.classe] = r.opcoes;
      const nomeInput = corpo.querySelector('#na-nome');
      if (nomeInput && !nomeInput.value && r.base && r.base.nome) { nomeInput.value = r.base.nome; e.valores.nome = r.base.nome; }
    } else {
      e.info = { erro: `Não consegui conferir o ticker agora (${(r && r.erro) || 'sem resposta'}). Dá pra seguir mesmo assim.` };
    }
    renderInfo();
  }

  async function carregarOpcoes(classe) {
    if (opcoesPorClasse[classe]) return;
    const r = await getInfoImpl(token, classe, '');
    if (r && r.ok !== false && r.opcoes) {
      opcoesPorClasse[classe] = r.opcoes;
      if (e.classe === classe && e.etapa !== 'feito') { lerValores(); render(); }
    }
  }

  function abrir(classe = '', ticker = '') {
    ultimoFoco = doc.activeElement;
    e = estadoInicial(classe || classeAtual() || '', ticker);
    raiz.hidden = false;
    doc.body.classList.add('na-aberto');
    render(e.classe ? (ticker ? '#na-nome' : '#na-ticker') : '.na-classe');
    if (e.classe) { carregarOpcoes(e.classe); if (ticker) conferirTicker(); }
  }

  function fechar() {
    const cadastrou = e.etapa === 'feito' && !e.desfeito;
    raiz.hidden = true;
    doc.body.classList.remove('na-aberto');
    if (ultimoFoco && typeof ultimoFoco.focus === 'function') ultimoFoco.focus();
    if (aoFechar) aoFechar({ cadastrou, ticker: e.feito && e.feito.ticker });
  }

  async function conferirOuCadastrar(simular) {
    lerValores();
    const r = validarFormNovoAtivo(e.classe, e.valores);
    e.erros = r.erros;
    e.mensagem = null;
    if (!r.ok) { e.etapa = 'form'; render(`#na-${Object.keys(r.erros)[0]}`); return; }
    if (e.info && e.info.existe && e.info.existe.length && normalizarTickerNovo(e.classe, e.valores.ticker) === e.info.ticker) {
      e.mensagem = { tipo: 'erro', html: `<b>${esc(e.info.ticker)}</b> já está cadastrado.` };
      render();
      return;
    }
    e.enviando = true;
    render();
    const resp = await adicionarImpl(token, r.ativo, { simular });
    e.enviando = false;
    if (!resp || !resp.ok) {
      e.mensagem = { tipo: 'erro', html: `Não deu: ${esc((resp && resp.erro) || 'erro desconhecido').replace(/^Error:\s*/, '')}` };
      e.etapa = 'form';
      render();
      return;
    }
    if (simular) {
      e.plano = resp.resultado;
      e.etapa = 'conferido';
      render();
      const btn = rodape.querySelector('[data-na="cadastrar"]');
      if (btn) btn.focus();
      return;
    }
    e.feito = resp.resultado;
    e.etapa = 'feito';
    render();
    const pend = resp.resultado && resp.resultado.consolidacao;
    if (pend && win && typeof win.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent('consolidacao:pendente', { detail: pend }));
  }

  async function desfazer(btn) {
    btn.disabled = true;
    btn.textContent = 'Desfazendo…';
    const resp = await removerImpl(token, e.feito.classe, e.feito.ticker);
    if (!resp || !resp.ok) {
      e.mensagem = { tipo: 'erro', html: `Não deu pra desfazer: ${esc((resp && resp.erro) || 'erro desconhecido').replace(/^Error:\s*/, '')}` };
      render();
      return;
    }
    const ticker = e.feito.ticker;
    const classe = e.feito.classe;
    const valores = { ...e.valores };
    e = estadoInicial(classe, ticker);
    e.valores = valores;
    e.desfeito = true;
    e.mensagem = { tipo: 'ok', html: `Cadastro de <b>${esc(ticker)}</b> desfeito (${esc((resp.resultado.removidas || []).join(', '))}).` };
    render('#na-ticker');
  }

  raiz.addEventListener('click', (ev) => {
    if (ev.target === raiz) { fechar(); return; }
    const c = ev.target.closest('[data-na-classe]');
    if (c) {
      lerValores();
      e.classe = c.getAttribute('data-na-classe');
      e.etapa = 'form'; e.plano = null; e.erros = {}; e.info = null; e.mensagem = null;
      render('#na-ticker');
      carregarOpcoes(e.classe);
      if (e.valores.ticker) conferirTicker();
      return;
    }
    const a = ev.target.closest('[data-na]');
    if (!a) return;
    const acao = a.getAttribute('data-na');
    if (acao === 'fechar') fechar();
    else if (acao === 'conferir') conferirOuCadastrar(true);
    else if (acao === 'cadastrar') conferirOuCadastrar(false);
    else if (acao === 'desfazer') desfazer(a);
    else if (acao === 'fechar-recarregar') fechar();
  });

  raiz.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t.name) return;
    e.valores[t.name] = t.value;
    if (e.etapa === 'conferido') { e.etapa = 'form'; e.plano = null; rodape.innerHTML = rodapeHtml(e); const box = corpo.querySelector('.na-plano-box'); if (box) box.remove(); }
    if (t.name === 'ticker') {
      clearTimeout(timer);
      timer = setTimeout(conferirTicker, debounceMs);
    }
  });

  raiz.addEventListener('submit', (ev) => { ev.preventDefault(); conferirOuCadastrar(e.etapa !== 'conferido'); });

  doc.addEventListener('keydown', (ev) => {
    if (raiz.hidden) return;
    if (ev.key === 'Escape') { fechar(); return; }
    if (ev.key === 'Tab') { // foco preso na janela
      const focaveis = [...raiz.querySelectorAll('button:not([disabled]),input,a[href],summary')].filter((x) => x.offsetParent !== null || x === doc.activeElement);
      if (!focaveis.length) return;
      const primeiro = focaveis[0]; const ultimo = focaveis[focaveis.length - 1];
      if (ev.shiftKey && doc.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); } else if (!ev.shiftKey && doc.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
    }
  });

  doc.querySelectorAll('[data-novo-ativo]').forEach((b) => b.addEventListener('click', () => abrir(b.getAttribute('data-novo-ativo') || '')));

  if (abrirDaUrl && win && win.location) {
    try {
      const p = new URLSearchParams(win.location.search || '');
      const t = p.get('novoAtivo');
      if (t) {
        abrir(CLASSES_NOVO_ATIVO[p.get('classe')] ? p.get('classe') : '', t);
        p.delete('novoAtivo'); p.delete('classe');
        const q = p.toString();
        win.history.replaceState(null, '', `${win.location.pathname}${q ? `?${q}` : ''}${win.location.hash || ''}`);
      }
    } catch (_) { /* endereço é só atalho */ }
  }

  return { abrir, fechar, estado: () => e };
}
