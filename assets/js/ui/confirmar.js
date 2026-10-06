/**
 * ui/confirmar.js — diálogo de confirmação e folha (bottom sheet) M3 (05/10/2026, A-62: troca de window.confirm).
 *
 *   const ok = await confirmar({ titulo: 'Excluir a meta?', mensagem: 'Não dá para desfazer.', confirmarTexto: 'Excluir', perigo: true });
 *   if (!ok) return;
 *
 * Desktop: diálogo central. Celular (< 600px): folha presa embaixo (components.css). Esc / toque fora / "Cancelar" = false.
 * O foco entra no botão seguro (Cancelar quando é perigo) e volta pro elemento que abriu. Nunca lança.
 */
import { criar, icone, novoId, prenderFoco, focaveis, semMovimento } from './dom.js';

function travarRolagem(doc) {
  const el = doc.documentElement;
  const antes = el.style.overflow;
  el.style.overflow = 'hidden';
  return () => { el.style.overflow = antes; };
}

/**
 * Abre um diálogo/folha com `conteudo` (Node ou texto). Devolve { el, fechar(valor) , fechado: Promise }.
 * Base de confirmar(); use direto pra folhas com formulário/detalhe (ex.: "toque na linha" no celular).
 */
export function abrirFolha({ titulo, conteudo, acoes = [], doc = document, perigo = false, icone: nomeIcone, rotulo, aoFechar, fecharAoToqueFora = true, papel } = {}) {
  const win = doc.defaultView;
  const anterior = doc.activeElement;
  const idTitulo = novoId('dlg-t');
  const idTexto = novoId('dlg-d');
  const scrim = criar(doc, 'div', { class: 'dialogo-scrim' });
  const caixa = criar(doc, 'div', {
    class: `dialogo${perigo ? ' perigo' : ''}`, role: papel || (perigo ? 'alertdialog' : 'dialog'), 'aria-modal': 'true',
    'aria-labelledby': titulo ? idTitulo : null, 'aria-label': titulo ? null : (rotulo || 'Diálogo'), 'aria-describedby': typeof conteudo === 'string' ? idTexto : null,
  });
  caixa.append(criar(doc, 'div', { class: 'dialogo-folha-alca', 'aria-hidden': 'true' }));
  if (nomeIcone) caixa.append(icone(doc, nomeIcone, 'dialogo-icone'));
  if (titulo) caixa.append(criar(doc, 'h2', { class: 'dialogo-titulo', id: idTitulo, texto: titulo }));
  if (typeof conteudo === 'string') caixa.append(criar(doc, 'p', { class: 'dialogo-texto', id: idTexto, texto: conteudo }));
  else if (conteudo) caixa.append(conteudo);
  const barra = criar(doc, 'div', { class: 'dialogo-acoes' });
  caixa.append(barra);
  scrim.append(caixa);

  let fechada = false;
  let resolver;
  const fechado = new Promise((r) => { resolver = r; });
  const soltarFoco = prenderFoco(caixa);
  const destravar = travarRolagem(doc);

  function fechar(valor = false) {
    if (fechada) return;
    fechada = true;
    doc.removeEventListener('keydown', aoTecla, true);
    soltarFoco();
    destravar();
    const sair = () => {
      scrim.remove();
      try { if (anterior && typeof anterior.focus === 'function' && doc.contains(anterior)) anterior.focus(); } catch (e) { /* segue */ }
      if (typeof aoFechar === 'function') { try { aoFechar(valor); } catch (e) { /* segue */ } }
      resolver(valor);
    };
    if (semMovimento(win) || !win || typeof win.setTimeout !== 'function') sair();
    else { scrim.classList.add('saindo'); win.setTimeout(sair, 150); }
  }
  function aoTecla(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(false); }
  }
  doc.addEventListener('keydown', aoTecla, true);
  let apertouFora = false;
  scrim.addEventListener('pointerdown', (ev) => { apertouFora = ev.target === scrim; });
  scrim.addEventListener('click', (ev) => { if (fecharAoToqueFora && ev.target === scrim && apertouFora) fechar(false); apertouFora = false; });

  acoes.forEach((a) => {
    const b = criar(doc, 'button', { type: 'button', class: `btn ${a.classe || 'btn-text'}`, 'data-acao': a.id || null }, [a.rotulo]);
    b.addEventListener('click', () => fechar(a.valor === undefined ? a.id || true : a.valor));
    barra.append(b);
    if (a.foco) b.dataset.foco = '1';
  });
  if (!acoes.length) barra.remove();
  doc.body.append(scrim);
  const alvo = caixa.querySelector('[data-foco="1"]') || focaveis(caixa)[0] || caixa;
  if (alvo === caixa) caixa.tabIndex = -1;
  try { alvo.focus(); } catch (e) { /* segue */ }
  return { el: caixa, scrim, fechar, fechado };
}

/**
 * Confirmação (A-62). Resolve true/false. `perigo` pinta o botão de erro e põe o foco inicial em "Cancelar".
 * Opções: titulo, mensagem, confirmarTexto, cancelarTexto, perigo, icone (nome do sprite), doc.
 */
export function confirmar({ titulo = 'Confirmar?', mensagem = '', confirmarTexto = 'Confirmar', cancelarTexto = 'Cancelar', perigo = false, icone: nomeIcone, doc = document } = {}) {
  const folha = abrirFolha({
    titulo, conteudo: mensagem || null, perigo, doc, icone: nomeIcone || (perigo ? 'warning' : null),
    acoes: [
      { id: 'cancelar', rotulo: cancelarTexto, classe: 'btn-text', valor: false, foco: perigo },
      { id: 'confirmar', rotulo: confirmarTexto, classe: perigo ? 'btn-perigo' : 'btn-filled', valor: true, foco: !perigo },
    ],
  });
  return folha.fechado.then((v) => v === true);
}
