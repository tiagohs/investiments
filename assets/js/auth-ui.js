/**
 * auth-ui.js — liga o Google Identity Services (GIS) de verdade ao
 * módulo de auth.js. Antes disso só existia o pedaço "puro" (guardar/
 * ler/decodificar o token) — o botão "Entrar com Google" e o callback
 * que recebe a credencial só existiam em teste.html (rascunho
 * descartável). Este arquivo porta exatamente o mesmo padrão validado
 * lá (google.accounts.id.initialize/renderButton, CLIENT_ID de
 * config.js) pro app de verdade, agora testável/reutilizável.
 *
 * Dividido do mesmo jeito que shell.js/theme.js: as peças pequenas
 * (extractCredential) são puras e fáceis de testar com um objeto
 * `google` falso; loadGisScript/mountAuthGate tocam o DOM/rede de
 * verdade e são o "real world wiring", no mesmo espírito de
 * registerServiceWorker em shell.js — nunca derruba a página, só loga
 * e deixa a tela de login com uma mensagem de erro.
 */

import { CLIENT_ID } from './config.js';
import { setToken } from './auth.js';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_ID = 'gsi-client-script';

let gisLoadPromise = null;

/**
 * Injeta o <script> do GIS uma única vez (chamadas seguintes reusam a
 * mesma promise) e resolve quando window.google.accounts.id existir.
 */
export function loadGisScript(doc = document) {
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = doc.getElementById(GIS_SCRIPT_ID);
    if (existing) {
      if (globalThis.google && globalThis.google.accounts && globalThis.google.accounts.id) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('falha ao carregar o script do Google Identity Services')));
      }
      return;
    }
    const script = doc.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('falha ao carregar o script do Google Identity Services')));
    doc.head.appendChild(script);
  });

  return gisLoadPromise;
}

/** Extrai o ID token (JWT) da resposta do GIS — null se vier vazio/malformado. Pura, sem depender de nenhum objeto `google` real. */
export function extractCredential(response) {
  return response && typeof response.credential === 'string' ? response.credential : null;
}

/**
 * Inicializa o GIS com nosso CLIENT_ID e desenha o botão de login no
 * container indicado. onSignedIn(token) só é chamado com um token de
 * verdade (nunca com null/undefined). googleImpl é injetável pra teste
 * (um objeto `google` falso, sem precisar do script real do Google).
 */
export function renderSignInButton({ buttonContainerId, onSignedIn, googleImpl = globalThis.google, doc = document }) {
  const container = doc.getElementById(buttonContainerId);
  if (!googleImpl || !googleImpl.accounts || !googleImpl.accounts.id || !container) return;

  googleImpl.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (response) => {
      const token = extractCredential(response);
      if (token) onSignedIn(token);
    },
  });
  googleImpl.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'signin_with' });
}

/**
 * Ponto de entrada de verdade, chamado por shell.js quando ainda não há
 * token válido: mostra o gate (classe "open"), carrega o GIS, desenha o
 * botão. Ao logar com sucesso, grava o token (auth.js!setToken) e chama
 * onReady(token) pra quem chamou liberar o conteúdo da página. Nunca
 * lança erro — uma falha aqui só deixa o gate aberto com uma mensagem
 * curta, em vez de quebrar a página inteira (mesma filosofia de
 * shell.js: "um pedaço quebrado não derruba o resto").
 */
export async function mountAuthGate({
  gateId = 'authGate',
  buttonContainerId = 'gsiButtonContainer',
  errorId = 'authGateErro',
  onReady = () => {},
  doc = document,
} = {}) {
  const gate = doc.getElementById(gateId);
  if (gate) gate.classList.add('open');

  try {
    await loadGisScript(doc);
    renderSignInButton({
      buttonContainerId,
      doc,
      onSignedIn: (token) => {
        setToken(token);
        if (gate) gate.classList.remove('open');
        onReady(token);
      },
    });
  } catch (error) {
    const erroEl = doc.getElementById(errorId);
    if (erroEl) erroEl.textContent = 'Não deu pra carregar o login do Google agora — recarregue a página.';
    console.error('auth-ui.js: falha ao montar o login', error);
  }
}
