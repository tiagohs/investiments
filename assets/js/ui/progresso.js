/**
 * ui/progresso.js — barra de progresso linear fina sob a top bar (kit: topbar-mobile) (05/10/2026).
 *   const p = progressoTopo();  p.iniciar();  ...carrega...  p.concluir();      // indeterminado, com contador (chamadas aninhadas)
 *   p.definir(40);                                                                // determinado (0-100)
 * Usa #shellProgresso (assets/partials/shell.html); sem o elemento (login, testes) não faz nada.
 */
export function progressoTopo(doc = document) {
  const el = doc.getElementById('shellProgresso');
  let n = 0;
  function mostrar(sim) {
    if (!el) return;
    el.hidden = !sim;
    el.setAttribute('aria-hidden', sim ? 'false' : 'true');
    if (!sim) { el.removeAttribute('data-valor'); el.style.removeProperty('--p'); }
  }
  return {
    iniciar() { n += 1; if (n === 1) mostrar(true); },
    concluir() { n = Math.max(0, n - 1); if (n === 0) mostrar(false); },
    definir(pct) {
      if (!el) return;
      mostrar(true);
      el.setAttribute('data-valor', String(Math.round(pct)));
      el.style.setProperty('--p', `${Math.max(0, Math.min(100, pct))}%`);
      el.setAttribute('aria-valuenow', String(Math.round(pct)));
      if (pct >= 100) { n = 0; mostrar(false); }
    },
    ativo: () => n > 0,
  };
}
