/**
 * ui/index.js — porta única dos componentes de interface (05/10/2026, Onda 3). Catálogo vivo: docs/componentes-m3.html;
 * guia: docs/guia-ui-m3.md. Cada módulo também pode ser importado direto (./ui/tabs.js...).
 */
export { criar, icone, novoId, prenderFoco, focaveis } from './dom.js';
export { confirmar, abrirFolha } from './confirmar.js';
export { toast } from './toast.js';
export { mostrarErroCarga, mostrarEstadoVazio, classificarErroCarga } from './erro-carga.js';
export { criarTabs } from './tabs.js';
export { criarBreadcrumb } from './breadcrumb.js';
export { abrirMenu, ligarMenu } from './menu.js';
export { criarSwitch } from './switch.js';
export { montarCabecalhoPagina, definirTituloPagina, formatarTituloPagina } from './pagina.js';
export { progressoTopo } from './progresso.js';
export { montarBuscaGlobal, registrarTelasBusca, buscar } from './busca.js';
