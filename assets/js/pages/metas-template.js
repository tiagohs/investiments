/**
 * metas-template.js - 06/10/2026 (A-42): o HTML da aba "Metas e Objetivos" (conteúdo do <main>), separado de metas.js para o router
 * injetar o markup sem carregar o código da tela (que só é importado na 1ª visita à aba). metas.js reexporta TEMPLATE_METAS.
 */

/** Conteúdo do <main> da aba (o router injeta - ver router.js, rota "metas"). */
export const TEMPLATE_METAS = `
<div class="mt-pagina">
  <!-- 06/10/2026 (Onda 3): cabeçalho padrão (título + subtítulo + Atualizar + Nova meta) montado por montarCabecalhoPagina -->
  <header id="mtCabecalho"></header>
  <div class="mt-carregando" id="mtCarregando" aria-hidden="true">
    <div class="grid-kpi"><span class="skel"></span><span class="skel"></span><span class="skel"></span></div>
    <div class="mt-grade"><span class="skel" style="height:210px"></span><span class="skel" style="height:210px"></span><span class="skel" style="height:210px"></span></div>
  </div>
  <div class="mt-erro" id="mtErro" hidden></div>
  <div class="avisos-banner" id="mtAvisos" hidden></div>
  <div id="mtTela" hidden></div>
</div>
<div class="mt-dialogo-fundo" id="mtDialogo" hidden></div>
`;
