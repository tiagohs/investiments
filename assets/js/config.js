/**
 * config.js — constantes compartilhadas do projeto, num lugar só.
 *
 * Antes viviam soltas dentro do <script> de cada página (ver teste.html,
 * que continua com sua própria cópia — é scaffold descartável, não o
 * padrão do app real). Todo módulo/página que precisar da URL do Web App
 * ou do Client ID do login importa daqui, em vez de repetir o valor.
 */

// URL de implantação (/exec) do Apps Script Web App — muda se uma nova
// implantação for criada (não só uma nova versão da mesma implantação).
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4WvFaADThJQVf2IzfW9i2TXRUqfvBNAg_wEjqNUAlqipKs40ZyVEehDRzx5eh40sFJw/exec';

// Client ID OAuth do Google Identity Services — precisa bater com o que
// o Apps Script valida em Auth.gs (verificarToken checa payload.aud).
export const CLIENT_ID = '778662849882-rcbhu8btlamd3qs45pdgujtdbki20lmo.apps.googleusercontent.com';
