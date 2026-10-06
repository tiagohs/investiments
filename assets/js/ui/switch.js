/**
 * ui/switch.js — switch M3 (05/10/2026): "Mostrar estatísticas", filtros liga/desliga.
 *   const sw = criarSwitch(container, { rotulo: 'Mostrar estatísticas', descricao: 'Aparece na tabela', marcado: true, aoMudar: (v) => ... });
 *   sw.definir(false); sw.valor();
 * Marcação: <label class="switch"><input class="switch-input" type="checkbox" role="switch"><span class="switch-trilho"></span>...</label>
 */
import { criar } from './dom.js';

export function criarSwitch(container, { rotulo = '', descricao = '', marcado = false, aoMudar, id, desabilitado = false, doc } = {}) {
  const d = doc || (container && container.ownerDocument) || document;
  const input = criar(d, 'input', { class: 'switch-input', type: 'checkbox', role: 'switch', id: id || null, disabled: desabilitado || null });
  input.checked = !!marcado;
  const texto = criar(d, 'span', { class: 'switch-rotulo' }, [rotulo]);
  if (descricao) texto.append(criar(d, 'span', { class: 'switch-desc', texto: descricao }));
  const el = criar(d, 'label', { class: 'switch' }, [input, criar(d, 'span', { class: 'switch-trilho', 'aria-hidden': 'true' }), rotulo || descricao ? texto : null]);
  input.addEventListener('change', () => { if (typeof aoMudar === 'function') aoMudar(input.checked); });
  if (container) container.append(el);
  return { el, input, valor: () => input.checked, definir(v, { emitir = false } = {}) { input.checked = !!v; if (emitir && typeof aoMudar === 'function') aoMudar(input.checked); } };
}
