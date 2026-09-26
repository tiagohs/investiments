// tests/atualizar-dados.test.js
//
// 26/09/2026 (Tiago: "o botão de atualizar dados está em todas as telas?
// E precisa estar visível no mobile também"): o "Atualizar dados" fica FORA
// do conteúdo em todas as telas - aparece já no carregamento (com
// "Atualizando…") e continua lá se a busca falhar. Antes, na Início, na
// Distribuição e Metas e na Visão geral de Carteiras ele morava dentro do
// conteúdo, que fica escondido no erro. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { mountRefreshControl } from '../assets/js/shell.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

function docDe(html) {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
}
/** true se nenhum ancestral é o container de conteúdo (#...Conteudo), que some no carregamento e no erro */
function foraDoConteudo(el) {
  for (let n = el; n; n = n.parentElement) {
    if (/Conteudo$/.test(n.id || '')) return false;
  }
  return true;
}

test('Atualizar dados: toda tela tem o lugar do botão, fora do conteúdo (visível no carregamento e no erro)', () => {
  const pages = docDe(ler('assets/partials/pages.html'));
  const telas = [];
  for (const [tpl, id] of [['page-inicio-template', 'refreshControlInicio'], ['page-distribuicoes-template', 'refreshControlDistribuicoes']]) {
    const frag = pages.getElementById(tpl).content;
    telas.push([id, frag.getElementById(id)]);
  }
  const carteiras = docDe(ler('carteiras/index.html'));
  for (const id of ['refreshControlVisaoGeral', 'refreshControlAcoes', 'refreshControlFiis', 'refreshControlAcoesEua', 'refreshControlRendaFixa']) {
    const el = carteiras.getElementById(id);
    telas.push([id, el]);
    // antes do esqueleto de carregamento da subpágina (mesmo lugar em todas)
    assert.ok(el && el.nextElementSibling && /Loading$/.test(el.nextElementSibling.id), `${id} fica logo acima do carregamento`);
  }
  for (const [arq, id] of [['proventos/index.html', 'refreshControlProventos'], ['transacoes/index.html', 'refreshControlTransacoes'], ['organizacao/despesas.html', 'refreshControlOrganizacao'], ['ativo/index.html', 'refreshControlAtivo']]) {
    telas.push([id, docDe(ler(arq)).getElementById(id)]);
  }
  for (const [id, el] of telas) {
    assert.ok(el, `${id} existe`);
    assert.ok(foraDoConteudo(el), `${id} não pode ficar dentro do conteúdo (some no erro)`);
  }
});

test('mountRefreshControl(): atualizar() da 1ª carga mostra "Atualizando…" enquanto busca e "Atualizado às" no fim', async () => {
  const doc = docDe('<div id="r"></div>');
  let soltar;
  const busca = new Promise((r) => { soltar = r; });
  const ctrl = mountRefreshControl(doc, doc.getElementById('r'), () => busca, { intervaloMs: 0, agora: () => new Date(2026, 8, 26, 9, 5) });
  const andamento = ctrl.atualizar();
  const btn = doc.querySelector('.refresh-btn');
  assert.equal(btn.textContent, 'Atualizando…');
  assert.equal(btn.disabled, true);
  soltar();
  await andamento;
  assert.equal(btn.textContent, 'Atualizar dados');
  assert.equal(btn.disabled, false);
  assert.equal(doc.querySelector('.refresh-status').textContent, 'Atualizado às 09:05');
});

test('mountRefreshControl(): sem lugar pro botão, atualizar() ainda faz a busca', async () => {
  let chamadas = 0;
  await mountRefreshControl(docDe(''), null, async () => { chamadas += 1; }).atualizar();
  assert.equal(chamadas, 1);
});

test('Início: busca falhou -> erro na tela e o "Atualizar dados" continua visível pra tentar de novo', async () => {
  const doc = docDe(ler('assets/partials/pages.html'));
  doc.body.append(doc.getElementById('page-inicio-template').content.cloneNode(true));
  const { montarPaginaInicio } = await import('../assets/js/pages/inicio.js');
  let chamadas = 0;
  await montarPaginaInicio('tk', { doc, getHomeImpl: async () => { chamadas += 1; return { ok: false, etapa: 'rede', erro: 'sem conexão' }; }, getIntradiaImpl: null });
  assert.equal(doc.getElementById('inicioErro').hidden, false);
  const btn = doc.querySelector('#refreshControlInicio .refresh-btn');
  assert.ok(btn && foraDoConteudo(btn));
  btn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chamadas, 2, 'clicar tenta de novo');
});
