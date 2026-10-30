/**
 * leitura-saude.js - 29/10/2026 (F5 de docs/arquitetura-leitura-cloudflare.md, RF-10): saúde da leitura rápida no popover
 * "Registro de Controle" - de quando é cada tela guardada no Cloudflare e o que está velho demais. Carregado só quando o
 * popover abre (shell.js). Nada é gravado: lê GET /v1/estado do Worker (com a sessão).
 */
import { LEITURA_URL } from './config.js';
import { instanteDaGeracao, ACOES_COM_COTACAO, ACOES_PUBLICADAS_POR_ATIVO, ACOES_SO_WORKER, talvezNoPregao } from './leitura-chave.js';
import { nomeDaAcao } from './desempenho.js';
import { esc } from './util/html.js';

export const LIMITE_COTACAO_PREGAO_MS = 35 * 60 * 1000; // o gatilho do pregão roda de 30 em 30 min
export const LIMITE_GERAL_MS = 26 * 60 * 60 * 1000; // a agenda publica tudo 1x por dia
// 30/10/2026 (tela de Notícias, N5): as telas noticias* só são regravadas quando mudam - a idade delas não diz nada. O que
// vale é o cron do Worker estar rodando: no pregão ele coleta a cada 5 min; fora, a cada 15 min no máximo.
export const LIMITE_CRON_PREGAO_MS = 12 * 60 * 1000;
export const LIMITE_CRON_FORA_MS = 40 * 60 * 1000;

export async function lerEstadoLeitura(token, { fetchImpl = typeof fetch === 'function' ? fetch : null } = {}) {
  if (!LEITURA_URL || !fetchImpl || !String(token || '').startsWith('s1.')) return null;
  try {
    const r = await fetchImpl(`${LEITURA_URL}/v1/estado`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return null;
    const j = JSON.parse(await r.text());
    return j && j.ok ? j : null;
  } catch (e) { return null; }
}

const acaoDaChave = (chave) => String(chave).split('?')[0];

/** { ultima, telas: [{ chave, nome, idadeMs, atencao }], ativos: { n, maisVelhaMs, atencao }, noticias: { em, idadeMs, falhas, atencao } | null } */
export function resumoSaudeLeitura(estado, { agoraMs = Date.now(), noPregao = talvezNoPregao(agoraMs) } = {}) {
  const pubs = (estado && estado.publicacoes) || [];
  let ultima = null;
  try { ultima = estado && estado.estado && estado.estado.ultima_publicacao ? JSON.parse(estado.estado.ultima_publicacao) : null; } catch (e) { ultima = null; }
  const idade = (p) => Math.max(0, agoraMs - instanteDaGeracao(p.geracao));
  const limite = (acao) => (noPregao && ACOES_COM_COTACAO.includes(acao) ? LIMITE_COTACAO_PREGAO_MS : LIMITE_GERAL_MS);
  const telas = [];
  const ativos = { n: 0, maisVelhaMs: 0, atencao: false };
  let noticias = null;
  try {
    const n = estado && estado.estado && estado.estado.noticias_ultima ? JSON.parse(estado.estado.noticias_ultima) : null;
    if (n && n.em) {
      const idadeMs = Math.max(0, agoraMs - Date.parse(n.em));
      noticias = { em: n.em, idadeMs, falhas: Array.isArray(n.falhas) ? n.falhas : [], atencao: idadeMs > (noPregao ? LIMITE_CRON_PREGAO_MS : LIMITE_CRON_FORA_MS) };
    }
  } catch (e) { noticias = null; }
  pubs.forEach((p) => {
    const acao = acaoDaChave(p.chave);
    if (ACOES_SO_WORKER.includes(acao)) return; // ver `noticias`
    const ms = idade(p);
    if (ACOES_PUBLICADAS_POR_ATIVO.includes(acao)) {
      ativos.n++;
      ativos.maisVelhaMs = Math.max(ativos.maisVelhaMs, ms);
      return;
    }
    const nome = nomeDaAcao(acao) + (p.chave.includes('?') ? ` (${p.chave.split('?')[1].replace(/=/g, ' ')})` : '');
    telas.push({ chave: p.chave, nome, idadeMs: ms, atencao: ms > limite(acao) });
  });
  ativos.atencao = ativos.n > 0 && ativos.maisVelhaMs > LIMITE_GERAL_MS;
  telas.sort((a, b) => b.idadeMs - a.idadeMs);
  return { ultima, telas, ativos, noticias };
}

export function idadeTexto(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return `há ${Math.floor(h / 24)} dias`;
}

export function htmlSaudeLeitura(resumo, { agoraMs = Date.now() } = {}) {
  if (!resumo) return '<p class="hint">Não consegui ler o estado do Cloudflare agora (sem sessão ou sem conexão). As telas continuam vindo do Apps Script quando precisam.</p>';
  const atencao = resumo.telas.filter((t) => t.atencao);
  const ultima = resumo.ultima && resumo.ultima.em ? idadeTexto(agoraMs - Date.parse(resumo.ultima.em)) : 'nunca';
  const nAtencao = atencao.length + (resumo.ativos.atencao ? 1 : 0) + (resumo.noticias && resumo.noticias.atencao ? 1 : 0);
  const topo = nAtencao
    ? `<p class="leitura-saude-aviso" role="status">${nAtencao} item(ns) com cópia mais velha que o esperado - nessas, o site busca no Apps Script (mais lento) até a próxima publicação.</p>`
    : '<p class="leitura-saude-ok" role="status">Tudo em dia.</p>';
  const linhas = resumo.telas.map((t) => `<tr${t.atencao ? ' class="atencao"' : ''}><th scope="row">${esc(t.nome)}</th><td>${idadeTexto(t.idadeMs)}</td></tr>`).join('');
  const ativos = resumo.ativos.n ? `<tr${resumo.ativos.atencao ? ' class="atencao"' : ''}><th scope="row">Telas dos ativos<small>${resumo.ativos.n} publicadas</small></th><td>mais velha ${idadeTexto(resumo.ativos.maisVelhaMs)}</td></tr>` : '';
  const n = resumo.noticias;
  const noticias = n ? `<tr${n.atencao ? ' class="atencao"' : ''}><th scope="row">Notícias (coleta do Worker)${n.falhas.length ? `<small>${esc(n.falhas.map((f) => `${f.fonte}: ${f.status}`).join(' · '))}</small>` : ''}</th><td>${idadeTexto(n.idadeMs)}</td></tr>` : '';
  return `
    ${topo}
    <p class="hint">Última publicação: ${esc(ultima)}.</p>
    <table class="desempenho-tabela leitura-saude-tabela">
      <thead><tr><th scope="col">Tela guardada</th><th scope="col">Dados de</th></tr></thead>
      <tbody>${linhas}${ativos}${noticias}</tbody>
    </table>`;
}

/** Popover aberto: busca e desenha. Nunca lança. */
export async function carregarSaudeLeitura(el, token, { lerEstadoImpl = lerEstadoLeitura, agoraMs = Date.now() } = {}) {
  if (!el) return;
  el.innerHTML = '<p class="hint">Lendo…</p>';
  const estado = await lerEstadoImpl(token);
  el.innerHTML = htmlSaudeLeitura(estado ? resumoSaudeLeitura(estado, { agoraMs }) : null, { agoraMs });
}
