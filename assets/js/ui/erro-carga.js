/**
 * ui/erro-carga.js — estado de erro de carga padrão (05/10/2026, A-60/A-61). Substitui as ~13 cópias de "Não consegui
 * carregar...: TypeError: Failed to fetch": texto humano (o que aconteceu + o que fazer em 1 clique), o detalhe técnico fica
 * num <details> fechado, e "Tentar de novo" quando a página sabe tentar de novo.
 *
 *   mostrarErroCarga(elemento, { tela: 'Carteiras', resposta, erro, aoTentar: () => carregar() });
 *
 * `resposta` é o { ok:false, etapa, erro } do api-client (ou o `erro` capturado num try/catch). `tela` é o NOME da tela,
 * sem artigo (a frase é "Não consegui carregar a tela “Carteiras”" - nunca "a Início"). O componente não mexe no "Atualizado às":
 * quem usa mountRefreshControl devolve false/lança em aoAtualizar e o rótulo mostra a falha (shell.js).
 */
import { criar, icone } from './dom.js';

/** Classifica a falha: 'offline' | 'rede' | 'sessao' | 'planilha' | 'servidor'. */
export function classificarErroCarga({ resposta, erro, online } = {}) {
  const txt = [resposta && resposta.erro, resposta && resposta.error, erro && erro.message, erro].filter(Boolean).map(String).join(' ');
  if (online === false) return 'offline';
  if ((resposta && resposta.etapa === 'network') || /failed to fetch|networkerror|load failed|network request failed|err_internet|timeout|timed out/i.test(txt)) return 'rede';
  if (/auth|token|sess[aã]o|expirad|n[aã]o autorizad|unauthori[sz]ed|login/i.test(txt)) return 'sessao';
  if (/planilha|spreadsheet|aba |range|n[aã]o encontrad|not found/i.test(txt)) return 'planilha';
  return 'servidor';
}

const MENSAGENS = {
  offline: (t) => ({ titulo: 'Você está sem internet', texto: `Não consegui carregar a tela “${t}”. Volte a ficar online e toque em “Tentar de novo”.` }),
  rede: (t) => ({ titulo: 'Não consegui falar com o servidor', texto: `A tela “${t}” depende do Apps Script e ele não respondeu. Pode ser a conexão ou uma lentidão do Google; tente de novo em instantes.` }),
  sessao: (t) => ({ titulo: 'Sua sessão expirou', texto: `Para abrir a tela “${t}” é preciso entrar de novo com a sua conta Google.` }),
  planilha: (t) => ({ titulo: 'A planilha não entregou esses dados', texto: `O servidor respondeu, mas faltou algo na planilha para montar a tela “${t}”. Tente de novo; se continuar, confira o painel de sincronização (ícone no topo).` }),
  servidor: (t) => ({ titulo: `Não consegui carregar a tela “${t}”`, texto: 'Deu um problema do lado do servidor. Tente de novo; se continuar, confira o painel de sincronização (ícone no topo).' }),
};

/** Texto técnico (só pro <details>): etapa + mensagem original. */
function detalheTecnico(resposta, erro) {
  const linhas = [];
  if (resposta && resposta.etapa) linhas.push(`etapa: ${resposta.etapa}`);
  const msg = (resposta && (resposta.erro || resposta.error)) || (erro && (erro.message || String(erro)));
  if (msg) linhas.push(`erro: ${msg}`);
  return linhas.join('\n');
}

/** Desenha o estado de erro dentro de `el` (substitui o conteúdo). Devolve { tipo, limpar() }. */
export function mostrarErroCarga(el, { tela = 'esta tela', resposta, erro, aoTentar, aoEntrar, doc } = {}) {
  const d = doc || el.ownerDocument;
  const win = d.defaultView;
  let online;
  try { online = win && win.navigator && typeof win.navigator.onLine === 'boolean' ? win.navigator.onLine : undefined; } catch (e) { online = undefined; }
  const tipo = classificarErroCarga({ resposta, erro, online });
  const { titulo, texto } = MENSAGENS[tipo](tela);
  const det = detalheTecnico(resposta, erro);

  el.textContent = '';
  el.hidden = false;
  el.dataset.erroCarga = tipo;
  const raiz = criar(d, 'div', { class: 'estado estado-erro', role: 'alert' });
  raiz.append(
    criar(d, 'span', { class: 'estado-ico' }, [icone(d, tipo === 'offline' ? 'cloud-off' : 'error', 'ico')]),
    criar(d, 'h3', { class: 'estado-titulo', texto: titulo }),
    criar(d, 'p', { class: 'estado-texto', texto }),
  );
  const acoes = criar(d, 'div', { class: 'estado-acoes' });
  let botao = null;
  if (tipo === 'sessao') {
    botao = criar(d, 'button', { type: 'button', class: 'btn btn-filled' }, ['Entrar de novo']);
    botao.addEventListener('click', () => { if (typeof aoEntrar === 'function') aoEntrar(); else if (win && win.location) win.location.reload(); });
    acoes.append(botao);
  } else if (typeof aoTentar === 'function') {
    botao = criar(d, 'button', { type: 'button', class: 'btn btn-tonal' }, [icone(d, 'refresh'), 'Tentar de novo']);
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      botao.classList.add('carregando');
      botao.setAttribute('aria-busy', 'true');
      try { await aoTentar(); } catch (e) { /* a tela chama mostrarErroCarga de novo se falhar */ } finally {
        // se a tela redesenhou, este botão já saiu do DOM; se não, volta a ficar clicável
        botao.disabled = false; botao.classList.remove('carregando'); botao.removeAttribute('aria-busy');
      }
    });
    acoes.append(botao);
  }
  if (acoes.childNodes.length) raiz.append(acoes);
  if (det) {
    const detalhes = criar(d, 'details', { class: 'estado-detalhe' }, [criar(d, 'summary', { texto: 'Detalhes técnicos' }), criar(d, 'pre', { texto: det })]);
    raiz.append(detalhes);
  }
  el.append(raiz);
  return { tipo, limpar() { el.textContent = ''; delete el.dataset.erroCarga; } };
}

/** Estado vazio padrão: ícone + título + texto + ação opcional ({rotulo, aoClicar}). */
export function mostrarEstadoVazio(el, { icone: nomeIcone = 'inbox', titulo = 'Nada por aqui ainda', texto = '', acao, doc } = {}) {
  const d = doc || el.ownerDocument;
  el.textContent = '';
  el.hidden = false;
  const raiz = criar(d, 'div', { class: 'estado' });
  raiz.append(criar(d, 'span', { class: 'estado-ico' }, [icone(d, nomeIcone, 'ico')]), criar(d, 'h3', { class: 'estado-titulo', texto: titulo }));
  if (texto) raiz.append(criar(d, 'p', { class: 'estado-texto', texto }));
  if (acao && acao.rotulo) {
    const b = criar(d, 'button', { type: 'button', class: 'btn btn-tonal' }, [acao.rotulo]);
    b.addEventListener('click', () => { if (typeof acao.aoClicar === 'function') acao.aoClicar(); });
    raiz.append(criar(d, 'div', { class: 'estado-acoes' }, [b]));
  }
  el.append(raiz);
  return raiz;
}
