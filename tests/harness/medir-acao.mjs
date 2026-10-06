// tests/harness/medir-acao.mjs
//
// 06/10/2026 (A-72): roda uma ação do Web App (doGet do Router.gs) a FRIO num sandbox novo, com os dados reais
// (fixtures.json) e o relógio congelado no dia da extração, contando o que ela leu da planilha:
//   { resp, bytes, celulas, getValues, getValue, leiturasGrandesDeLancamentos }
// `celulas` = soma de linhas x colunas de cada getValues(); `getValue` = leituras de 1 célula (getRange().getValue()
// dentro de laço é o que mais custa no Apps Script); `bytes` = tamanho do JSON de resposta.
import { montarSandboxPrevia } from './previa.mjs';
import { instanteDasFixtures } from './gas-vm-harness.mjs';

const ABAS_COM_PREENCHIMENTO = ['Transações', 'Transações - USA', 'Transações Renda Fixa', 'Carteira Renda Fixa'];

export function medirAcao(acao, params = {}, { agora = instanteDasFixtures() } = {}) {
  const sb = montarSandboxPrevia({ agora });
  const c = { celulas: 0, getValues: 0, getValue: 0, leiturasGrandesDeLancamentos: 0 };
  const ssOrig = sb.SpreadsheetApp.getActiveSpreadsheet();
  const ss = {
    getSheetByName(nome) {
      const s = ssOrig.getSheetByName(nome);
      if (!s) return s;
      return new Proxy(s, {
        get(t, p) {
          if (p !== 'getRange') { const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; }
          return (...a) => {
            const r = t.getRange(...a);
            const nr = typeof a[0] === 'string' ? 1 : (a[2] ?? 1);
            const nc = typeof a[0] === 'string' ? 1 : (a[3] ?? 1);
            return new Proxy(r, {
              get(rt, rp) {
                if (rp === 'getValues') {
                  return () => {
                    c.getValues += 1; c.celulas += nr * nc;
                    if (ABAS_COM_PREENCHIMENTO.includes(nome) && nr > 2000 && nc > 1) c.leiturasGrandesDeLancamentos += 1;
                    return rt.getValues();
                  };
                }
                if (rp === 'getValue') return () => { c.getValue += 1; return rt.getValue(); };
                const v = rt[rp]; return typeof v === 'function' ? v.bind(rt) : v;
              },
            });
          };
        },
      });
    },
    insertSheet: (n) => ssOrig.insertSheet(n),
  };
  sb.SpreadsheetApp.getActiveSpreadsheet = () => ss; sb.SpreadsheetApp.getActive = () => ss;
  sb.UrlFetchApp = { fetch() { throw new Error('rede indisponível no teste'); }, fetchAll() { throw new Error('rede indisponível no teste'); } };
  const texto = sb.doGet({ parameter: { action: acao, ...params } }).getContent();
  return { ...c, bytes: texto.length, resp: JSON.parse(texto) };
}

/** Sandbox da prévia (todas as ações) com o relógio congelado, sem rede - pros testes de coerência entre telas. */
export function sandboxDasTelas({ agora = instanteDasFixtures() } = {}) {
  const sb = montarSandboxPrevia({ agora });
  sb.UrlFetchApp = { fetch() { throw new Error('rede indisponível no teste'); }, fetchAll() { throw new Error('rede indisponível no teste'); } };
  const chamar = (acao, params = {}) => JSON.parse(sb.doGet({ parameter: { action: acao, ...params } }).getContent());
  return { sb, chamar };
}
