/**
 * pages/avisos-parciais.js - 06/10/2026 (Onda 3, A-60/A-61): banner de "falha parcial" (alguma seção da resposta não
 * carregou, o resto sim) com texto de gente e o detalhe técnico num <details> fechado. Usado pela Início e pelo
 * Acompanhamento de Ativos. `avisos` é o { secao: erro } que o Apps Script devolve; `nomes` traduz a chave da seção.
 */
import { esc } from '../util/html.js';
import { RE_AUTORIZACAO_APPS_SCRIPT } from '../ui/erro-carga.js';

export function renderAvisosParciais(container, avisos, nomes = {}) {
  if (!container) return;
  const entradas = avisos ? Object.entries(avisos) : [];
  if (!entradas.length) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }
  const faltou = entradas.map(([secao]) => nomes[secao] || secao).join(', ');
  // 08/10/2026: "Você não tem permissão para chamar SpreadsheetApp..." = o Apps Script perdeu a autorização (não adianta tentar de novo)
  const autorizacao = entradas.some(([, erro]) => RE_AUTORIZACAO_APPS_SCRIPT.test(String(erro)));
  const texto = autorizacao
    ? `<b>O Apps Script perdeu a autorização do Google.</b> No editor do Apps Script, rode a função <code>autorizarProjetoDireto</code> e aceite as permissões; depois use "Atualizar dados". Não carregou: ${esc(faltou)}.`
    : `<b>Algumas partes não carregaram agora.</b> Não deu para buscar: ${esc(faltou)}. O restante da tela está atualizado; use "Atualizar dados" para tentar de novo.`;
  container.innerHTML = `
    <svg class="ico avisos-ico" aria-hidden="true"><use href="#ico-warning"/></svg>
    <div class="avisos-corpo">
      <p>${texto}</p>
      <details class="avisos-detalhe"><summary>Detalhes técnicos</summary><pre>${entradas.map(([secao, erro]) => `${esc(secao)}: ${esc(erro)}`).join('\n')}</pre></details>
    </div>`;
  container.hidden = false;
}
