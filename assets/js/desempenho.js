/**
 * desempenho.js - 08/10/2026 (Etapa 0, Tiago: "o app é muito lento, os dados demoram pra carregar"): medir antes de
 * otimizar. Cada chamada ao Apps Script registra, NESTE aparelho (localStorage), quanto demorou de ponta a ponta, quanto
 * foi do servidor (`_ms` da resposta), o tamanho e se o servidor respondeu "não mudou" (etag igual - api-client.js).
 * O popover "Registro de Controle" mostra a mediana e o pior caso (p95) por tela. Nada sai do aparelho.
 */

import { esc } from './util/html.js';

const CHAVE = 'investiments_desempenho_v1';
const MAX_POR_ACAO = 40;

const NOMES = {
  home: 'Início', historico_inicio: 'Início (histórico)', meusAtivos: 'Meus ativos', ativo: 'Detalhe do ativo',
  carteirasHome: 'Carteiras', carteirasAcoes: 'Carteiras › Ações', carteirasFiis: 'Carteiras › FIIs',
  carteirasAcoesEua: 'Carteiras › EUA', carteirasRendaFixa: 'Carteiras › Renda Fixa', proventos: 'Proventos',
  transacoes: 'Transações', metas: 'Metas', metasHistorico: 'Metas (histórico)', distribuicoesMetas: 'Distribuição',
  patrimonio: 'Patrimônio', salario: 'Salário', despesas: 'Despesas', gastos: 'Gastos', syncStatus: 'Registro de Controle',
};

function ler(armazenamento) {
  try { const t = armazenamento && armazenamento.getItem(CHAVE); return t ? JSON.parse(t) || {} : {}; } catch (e) { return {}; }
}

function armazenamentoPadrao() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}

/** Guarda uma medida: { total (ms, ponta a ponta), servidor (ms ou null), naoMudou, bytes, ok }. Nunca lança. */
export function registrarDesempenho(acao, medida, { armazenamento = armazenamentoPadrao(), agora = Date.now() } = {}) {
  if (!acao || !armazenamento) return;
  try {
    const dados = ler(armazenamento);
    const lista = Array.isArray(dados[acao]) ? dados[acao] : [];
    lista.push({ em: agora, t: Math.round(medida.total || 0), s: Number.isFinite(medida.servidor) ? Math.round(medida.servidor) : null,
      nm: !!medida.naoMudou, b: Number.isFinite(medida.bytes) ? medida.bytes : null, ok: medida.ok !== false });
    dados[acao] = lista.slice(-MAX_POR_ACAO);
    armazenamento.setItem(CHAVE, JSON.stringify(dados));
  } catch (e) { /* cota cheia / modo privado: só não mede */ }
}

const quantil = (valores, q) => {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1))];
};

/** Por ação: { acao, nome, n, mediana, p95, medianaServidor, pctNaoMudou, kb } - a mais lenta primeiro. */
export function resumoDesempenho({ armazenamento = armazenamentoPadrao() } = {}) {
  const dados = ler(armazenamento);
  return Object.keys(dados).map((acao) => {
    const l = (dados[acao] || []).filter((x) => x && x.ok !== false);
    const tempos = l.map((x) => x.t);
    const serv = l.map((x) => x.s).filter((s) => s != null);
    const bytes = l.map((x) => x.b).filter((b) => b != null && b > 0);
    return {
      acao, nome: NOMES[acao] || acao, n: l.length,
      mediana: quantil(tempos, 0.5), p95: quantil(tempos, 0.95), medianaServidor: quantil(serv, 0.5),
      pctNaoMudou: l.length ? Math.round((l.filter((x) => x.nm).length / l.length) * 100) : 0,
      kb: bytes.length ? Math.round(quantil(bytes, 0.5) / 1024) : null,
    };
  }).filter((r) => r.n > 0).sort((a, b) => (b.mediana || 0) - (a.mediana || 0));
}

export function limparDesempenho({ armazenamento = armazenamentoPadrao() } = {}) {
  try { if (armazenamento) armazenamento.removeItem(CHAVE); } catch (e) { /* nada */ }
}

const seg = (ms) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);

/** Tabela do popover (texto de gente). */
export function htmlDesempenho(linhas) {
  if (!linhas.length) return '<p class="hint">Ainda sem medidas neste aparelho - navegue pelo site e volte aqui.</p>';
  return `
    <table class="desempenho-tabela">
      <thead><tr><th scope="col">Tela</th><th scope="col" title="Metade das vezes foi mais rápido que isso">Normal</th><th scope="col" title="95% das vezes foi mais rápido que isso">Pior</th><th scope="col" title="Quanto disso foi o Apps Script trabalhando">Servidor</th><th scope="col" title="Vezes em que nada tinha mudado e o servidor não precisou reenviar">Sem mudança</th></tr></thead>
      <tbody>${linhas.map((r) => `<tr><th scope="row">${esc(r.nome)}<small>${r.n} vez${r.n > 1 ? 'es' : ''}${r.kb != null ? ` · ${r.kb} KB` : ''}</small></th><td>${seg(r.mediana)}</td><td>${seg(r.p95)}</td><td>${seg(r.medianaServidor)}</td><td>${r.pctNaoMudou}%</td></tr>`).join('')}</tbody>
    </table>`;
}
