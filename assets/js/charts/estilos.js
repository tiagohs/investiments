/**
 * charts/estilos.js - injeta assets/css/charts.css (1x por documento) quando a página não carregou a folha.
 * As páginas devem preferir `<link rel="stylesheet" href="assets/css/charts.css">`; isto só evita gráfico "pelado".
 */
export function garantirEstilosCharts(doc) {
  if (!doc || !doc.head || doc._cssCharts) return;
  doc._cssCharts = true;
  const ja = [...doc.querySelectorAll('link[rel="stylesheet"]')].some((l) => /charts\.css/.test(l.getAttribute('href') || ''));
  if (ja) return;
  try {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('../../css/charts.css', import.meta.url).href;
    link.dataset.charts = '';
    doc.head.appendChild(link);
  } catch { /* ambiente sem import.meta.url resolvível: a página carrega o CSS */ }
}
