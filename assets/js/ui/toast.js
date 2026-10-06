/**
 * ui/toast.js — snackbar M3 (05/10/2026, A-62): feedback de salvar/excluir igual em todas as telas.
 *
 *   toast('Meta arquivada');                                   // info
 *   toast('Salvo', { tipo: 'ok' });                            // ok | erro | aviso | info
 *   toast('Despesa removida', { tipo: 'ok', desfazer: () => restaurar() });   // ação "Desfazer"
 *   toast.ok('Salvo'); toast.erro('Não consegui salvar');
 *
 * No máximo 3 na pilha; some sozinho (4s; 8s se tem ação ou é erro); pausa com o mouse/foco em cima; role=status
 * (erro = alert, anunciado na hora). Estado = ícone + cor (nunca só cor).
 */
import { criar, icone } from './dom.js';

const ICONE = { ok: 'check-circle', erro: 'error', aviso: 'warning', info: 'info' };
const MAX_PILHA = 3;

function regiao(doc) {
  let r = doc.getElementById('toasts');
  if (!r) {
    r = criar(doc, 'div', { class: 'toasts', id: 'toasts', role: 'region', 'aria-label': 'Avisos' });
    doc.body.append(r);
  }
  return r;
}

export function toast(mensagem, { tipo = 'info', acao, desfazer, duracaoMs, doc = document, fechavel } = {}) {
  const win = doc.defaultView;
  const r = regiao(doc);
  const act = acao || (typeof desfazer === 'function' ? { rotulo: 'Desfazer', aoClicar: desfazer } : null);
  const tempo = duracaoMs != null ? duracaoMs : (tipo === 'erro' || act ? 8000 : 4000);
  const no = criar(doc, 'div', { class: `toast toast-${ICONE[tipo] ? tipo : 'info'}`, role: tipo === 'erro' ? 'alert' : 'status' });
  no.append(icone(doc, ICONE[tipo] || ICONE.info, 'toast-ico'), criar(doc, 'span', { class: 'toast-msg', texto: String(mensagem == null ? '' : mensagem) }));
  let fechado = false;
  let timer = null;
  function fechar() {
    if (fechado) return;
    fechado = true;
    if (timer && win) win.clearTimeout(timer);
    no.remove();
  }
  if (act) {
    const b = criar(doc, 'button', { type: 'button', class: 'toast-acao', texto: act.rotulo || 'Desfazer' });
    b.addEventListener('click', () => { try { if (typeof act.aoClicar === 'function') act.aoClicar(); } finally { fechar(); } });
    no.append(b);
  }
  if (fechavel || tipo === 'erro' || tempo === 0) {
    const x = criar(doc, 'button', { type: 'button', class: 'toast-fechar', 'aria-label': 'Fechar aviso' }, [icone(doc, 'close')]);
    x.addEventListener('click', fechar);
    no.append(x);
  }
  r.append(no);
  while (r.children.length > MAX_PILHA) r.firstElementChild.remove();
  if (tempo > 0 && win && typeof win.setTimeout === 'function') {
    const iniciar = () => { timer = win.setTimeout(fechar, tempo); };
    iniciar();
    const pausar = () => { if (timer) { win.clearTimeout(timer); timer = null; } };
    no.addEventListener('mouseenter', pausar); no.addEventListener('focusin', pausar);
    no.addEventListener('mouseleave', () => { if (!fechado && !timer) iniciar(); });
    no.addEventListener('focusout', () => { if (!fechado && !timer) iniciar(); });
  }
  return { fechar, el: no };
}
toast.ok = (m, o) => toast(m, { ...o, tipo: 'ok' });
toast.erro = (m, o) => toast(m, { ...o, tipo: 'erro' });
toast.aviso = (m, o) => toast(m, { ...o, tipo: 'aviso' });
toast.info = (m, o) => toast(m, { ...o, tipo: 'info' });
