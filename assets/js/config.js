/**
 * config.js — shared constants for the project, in one place.
 *
 * Previously scattered inside each page's <script> block (see teste.html,
 * which keeps its own copy — it's disposable scaffold, not the pattern
 * for the real app). Any module/page that needs the Web App URL or the
 * login Client ID imports it from here instead of repeating the value.
 */

// Deployment (/exec) URL of the Apps Script Web App — changes if a new
// deployment is created (not just a new version of the same deployment).
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4WvFaADThJQVf2IzfW9i2TXRUqfvBNAg_wEjqNUAlqipKs40ZyVEehDRzx5eh40sFJw/exec';

// Google Identity Services OAuth Client ID — must match what the Apps
// Script validates in Auth.gs (verificarToken checks payload.aud).
export const CLIENT_ID = '778662849882-rcbhu8btlamd3qs45pdgujtdbki20lmo.apps.googleusercontent.com';

// Planilha real (fonte única de dados) — usada pelo link "ver registro
// completo" do popover de sincronização (shell.js!renderSyncStatus):
// action=syncStatus só devolve a ÚLTIMA linha de "Registro de
// Controle" (ver Sync.gs!lerUltimoRegistroControle_), então o
// histórico completo/contagem de sincronizações mora só na planilha
// mesmo — mesma URL já usada em docs/direcao-visual.html ("Planilha
// original").
export const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1HZEaQD9nvnkLovlCr-ybB6wW96kGv-u6b2zX90GGKSY/edit?usp=sharing';
