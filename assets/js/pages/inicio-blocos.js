/**
 * inicio-blocos.js - 07/10/2026: carrega os blocos EXTRAS da Início (hero "Patrimônio líquido" e cartão "Metas") sem atrasar
 * o resto da página. A Home continua só com o getHome; estes dois pedem o seu dado (getPatrimonio, getMetas) em paralelo
 * DEPOIS do 1º desenho, e os módulos pesados (contas de patrimônio e de metas) entram por import() só aqui.
 *
 * Cada bloco segue o mesmo padrão (stale-while-revalidate, cache-dados.js): mostra o esqueleto, desenha na hora com a última
 * resposta guardada (chaves 'patrimonio' e 'metas' - a de metas é a mesma que a tela Metas grava) e troca pela nova quando
 * chega. Se a busca falhar e não houver nada na tela, o bloco mostra o erro compacto com "Tentar de novo"; um bloco com erro
 * nunca derruba a Home nem o outro bloco.
 */
import { getPatrimonio, getMetas } from '../api-client.js';
import { gravarCacheDados, lerCacheDados } from '../cache-dados.js';

/** Dois "Atualizar dados" seguidos (ex.: a busca inicial logo depois do desenho do cache) não repetem a busca dentro desta janela. */
export const JANELA_REPETIR_MS = 15000;

/** Busca + cache de UM bloco. `ui`: { carregando(), dados(resposta), erro(resposta, erro) }. Resolve quando a busca terminou. */
export async function carregarBloco({ chave, buscar, ui }) {
  ui.carregando();
  let chegou = false;
  const desenhar = (resposta) => {
    try { ui.dados(resposta); } catch (erro) { console.error(`bloco ${chave} não desenhou`, erro); ui.erro({ ok: false, erro: erro && erro.message ? erro.message : String(erro) }, erro); }
  };
  const busca = (async () => {
    try { return await buscar(); } catch (erro) { return { ok: false, etapa: 'network', erro: erro && erro.message ? erro.message : String(erro) }; }
  })();
  lerCacheDados(chave).then((emCache) => {
    if (!chegou && emCache && emCache.dados && emCache.dados.ok) desenhar(emCache.dados);
  }).catch(() => {});
  const resposta = await busca;
  chegou = true;
  if (resposta && resposta.ok) {
    gravarCacheDados(chave, resposta);
    desenhar(resposta);
  } else {
    ui.erro(resposta || { ok: false, erro: 'sem resposta' });
  }
}

/**
 * Liga os dois blocos. Elementos: #patrimonioHero e #metasHome (ausentes = bloco ignorado: HTML antigo em cache).
 * Devolve { iniciar({ forcar }) } - chamado a cada desenho bem-sucedido da Home.
 */
export function criarBlocosHome(doc, token, { getPatrimonioImpl = getPatrimonio, getMetasImpl = getMetas, raizSite = null, agora = () => Date.now() } = {}) {
  let ultima = 0;
  let uis = null;
  async function montarUis() {
    if (uis) return uis;
    const heroEl = doc.getElementById('patrimonioHero');
    const metasEl = doc.getElementById('metasHome');
    const [{ criarHero }, { criarCartaoMetas }] = await Promise.all([import('./inicio-hero.js'), import('./inicio-metas.js')]);
    const extra = raizSite ? { raizSite } : {};
    uis = {
      hero: heroEl ? criarHero(doc, heroEl, { aoTentar: () => recarregar('hero'), ...extra }) : null,
      metas: metasEl ? criarCartaoMetas(doc, metasEl, { aoTentar: () => recarregar('metas'), ...extra }) : null,
    };
    return uis;
  }
  const bloco = (nome, u) => ({
    hero: { chave: 'patrimonio', buscar: () => getPatrimonioImpl(token), ui: u.hero },
    metas: { chave: 'metas', buscar: () => getMetasImpl(token), ui: u.metas },
  }[nome]);
  async function recarregar(nome) {
    const u = await montarUis();
    const b = bloco(nome, u);
    if (b && b.ui) await carregarBloco(b);
  }
  return {
    async iniciar({ forcar = false } = {}) {
      const t = agora();
      if (!forcar && ultima && t - ultima < JANELA_REPETIR_MS) return;
      ultima = t;
      try {
        const u = await montarUis();
        // em paralelo: um bloco com erro não espera nem derruba o outro
        await Promise.all(['hero', 'metas'].map((n) => { const b = bloco(n, u); return b && b.ui ? carregarBloco(b) : null; }));
      } catch (erro) { console.error('blocos da Início não carregaram', erro); }
    },
  };
}
