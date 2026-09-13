/**
 * pages/login.js — orquestra a página de login dedicada (login.html).
 *
 * Fluxo:
 *  1) Se já existe um token válido (sessão anterior - auth.js!getToken),
 *     redireciona na hora pro destino original, sem mostrar nada de
 *     login. Isso é o que faz "voltar pra cá com F5" nunca te prender
 *     numa tela de login desnecessária.
 *  2) Senão, carrega o Google Identity Services e desenha o botão
 *     (auth-ui.js!mountAuthGate - o nome ficou de quando existia um
 *     "gate" na própria página; aqui a página INTEIRA é o gate, então
 *     só usamos a parte de carregar o script + desenhar o botão). Ao
 *     logar com sucesso, grava o token e redireciona pro destino.
 */

import { getToken } from '../auth.js';
import { mountAuthGate } from '../auth-ui.js';

/**
 * O destino vem de ?redirect= (a página que mandou pra cá - ver
 * shell.js!redirectParaLogin). Só aceita um caminho relativo do próprio
 * site: nunca uma URL absoluta ("https://...") nem protocol-relative
 * ("//evil.com") - isso nunca pode virar um open redirect pra fora do
 * app. Sem o parâmetro (ex.: abrindo login.html direto), cai em
 * 'index.html'.
 */
export function resolverDestino(searchParams, fallback = 'index.html') {
  const bruto = searchParams.get('redirect');
  if (!bruto) return fallback;
  if (bruto.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(bruto)) return fallback;
  return bruto;
}

export async function montarPaginaLogin({
  doc = document,
  win = window,
  getTokenImpl = getToken,
  mountAuthGateImpl = mountAuthGate,
} = {}) {
  const destino = resolverDestino(new URLSearchParams(win.location.search));

  const tokenExistente = getTokenImpl();
  if (tokenExistente) {
    win.location.href = destino;
    return;
  }

  await mountAuthGateImpl({
    doc,
    onReady: () => {
      win.location.href = destino;
    },
  });
}
