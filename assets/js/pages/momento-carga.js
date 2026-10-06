/**
 * momento-carga.js - 06/10/2026 (A-42/A-76): carga (cache + API) das metas e do contexto de mercado que o "momento de aporte" usa. Fica separado de
 * momento-aporte.js (que importa o cálculo de aportes e o motor) para a tela Ativo pedir o macro sem carregar tudo isso;
 * o cartão de metas (metas-card.js) só é importado quando as metas chegam. momento-aporte.js reexporta (compatibilidade).
 */

import { getMacro, getMetas } from '../api-client.js';
import { gravarCacheDados, lerCacheDados } from '../cache-dados.js';
import { montarMacro } from '../criterios/macro.js';

/**
 * Metas de Metas e Objetivos pro momento (lista com `calc`), 1 busca por tela.
 * aoChegar(metas) roda com o cache (na hora) e de novo com a resposta nova;
 * falhou = null (o momento fica sem sinal de meta). Devolve a promessa.
 */
export function carregarMetasMomento(token, { getMetasImpl = getMetas, aoChegar = () => {}, lerCache = lerCacheDados, gravarCache = gravarCacheDados } = {}) {
  return (async () => {
    let metas = null;
    // 06/10/2026 (A-42): o cartão de metas (calcularMeta + viagem + patrimônio-calc) só é carregado quando há metas pra calcular
    const metasComCalculo = async (dados) => (await import('../metas-card.js')).metasComCalculo(dados);
    try {
      const c = await lerCache('metas');
      if (c && c.dados && c.dados.ok) { metas = await metasComCalculo(c.dados); aoChegar(metas); }
    } catch (e) { /* sem cache */ }
    let r = null;
    try { r = getMetasImpl ? await getMetasImpl(token) : null; } catch (e) { r = null; }
    if (r && r.ok) {
      try { gravarCache('metas', r); } catch (e) { /* ok */ }
      metas = await metasComCalculo(r);
      aoChegar(metas);
    }
    return metas;
  })();
}

/**
 * 05/10/2026: contexto de mercado (Macro.gs) pro momento - 1 busca por tela, com o cache 'macro'
 * (6h no servidor). `aoChegar(macro)` roda com o cache e com a resposta nova; falhou = null (o momento
 * fica sem esse sinal). tesouroExtra = taxas do Tesouro que a tela já tem (Aportes: dados.tesouro).
 */
export function carregarMacroMomento(token, { getMacroImpl = getMacro, aoChegar = () => {}, lerCache = lerCacheDados, gravarCache = gravarCacheDados, tesouroExtra = null } = {}) {
  return (async () => {
    let macro = null;
    try {
      const c = await lerCache('macro');
      if (c && c.dados && c.dados.ok) { macro = montarMacro(c.dados, { tesouroExtra }); if (macro) aoChegar(macro); }
    } catch (e) { /* sem cache */ }
    let r = null;
    try { r = getMacroImpl ? await getMacroImpl(token) : null; } catch (e) { r = null; }
    if (r && r.ok) {
      try { gravarCache('macro', r); } catch (e) { /* ok */ }
      macro = montarMacro(r, { tesouroExtra }) || macro;
      if (macro) aoChegar(macro);
    }
    return macro;
  })();
}
