/**
 * holerite.js - 26/09/2026: ler o holerite (PDF "Demonstrativo de Pagamento")
 * direto no navegador - aba Salário da Organização Financeira.
 *
 * O PDF é lido com o pdf.js (cdnjs, carregado só quando precisa) e vira
 * linhas de texto; lerHolerite() tira delas o mês, o tipo (mensal, 13º,
 * férias, PLR), cada verba (código, descrição, quantidade, vencimento,
 * desconto, "outros") e os totais do rodapé. Nada sai do navegador além do
 * que o Tiago confirmar na tela (salvarPagamentoSalario). Dados de banco,
 * endereço e CNPJ do holerite são ignorados de propósito.
 */

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export function carregarPdfJs(doc) {
  const win = doc.defaultView;
  if (win.pdfjsLib) return Promise.resolve(win.pdfjsLib);
  return new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = PDFJS_URL;
    s.onload = () => {
      if (!win.pdfjsLib) { reject(new Error('leitor de PDF não carregou')); return; }
      win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      resolve(win.pdfjsLib);
    };
    s.onerror = () => reject(new Error('sem conexão pra carregar o leitor de PDF'));
    doc.head.appendChild(s);
  });
}

/** PDF (ArrayBuffer) -> linhas de texto, de cima pra baixo, cada uma da esquerda pra direita. */
export async function extrairLinhasPdf(pdfjsLib, dados) {
  const pdf = await pdfjsLib.getDocument({ data: dados }).promise;
  const linhas = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    const grupos = [];
    items.filter((it) => String(it.str || '').trim()).forEach((it) => {
      const x = it.transform[4];
      const y = it.transform[5];
      let g = grupos.find((gr) => Math.abs(gr.y - y) <= 2.5);
      if (!g) { g = { y, itens: [] }; grupos.push(g); }
      g.itens.push({ x, s: String(it.str).trim() });
    });
    grupos.sort((a, b) => b.y - a.y).forEach((g) => {
      linhas.push(g.itens.sort((a, b) => a.x - b.x).map((i) => i.s).join('  '));
    });
  }
  return linhas;
}

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const NUM = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
export const numBR = (s) => {
  if (s == null || s === '') return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const r2 = (v) => Math.round(v * 100) / 100;

export const TIPOS_PAGAMENTO = ['Mensal', '13º (1ª parcela)', '13º (2ª parcela)', 'Férias', 'PLR', 'Bônus', 'Outro'];

function tipoDoTexto(t) {
  const s = semAcento(t).toUpperCase();
  if (/13|DECIMO/.test(s)) return /1[AªO]?\s*PARC|ADIANT/.test(s) ? '13º (1ª parcela)' : '13º (2ª parcela)';
  if (/FERIAS/.test(s)) return 'Férias';
  if (/\bPLR\b|PARTICIPACAO NOS LUCROS/.test(s)) return 'PLR';
  if (/BONUS|BONIFICA/.test(s)) return 'Bônus';
  return null;
}

/**
 * Linhas do holerite -> pagamento. Aceita tanto as linhas do pdf.js (itens
 * separados por 2 espaços) quanto texto com colunas por espaços (pdftotext).
 */
export function lerHolerite(linhas) {
  const L = (Array.isArray(linhas) ? linhas : String(linhas || '').split(/\r?\n/)).map((l) => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = {
    mes: '', tipo: 'Mensal', dataCredito: '', salarioBase: null, outrosVencimentos: null, totalVencimentos: null,
    inss: null, irrf: null, outrosDescontos: null, totalDescontos: null, liquido: null, fgts: null, baseIrrf: null,
    itens: [], avisos: [],
  };
  const tudo = semAcento(L.join('\n')).toUpperCase();

  const ref = tudo.match(/REFERENTE A\s+([^\n]*?)(?:\s+DATA DE CREDITO|\n|$)/);
  if (ref) {
    const m = ref[1].match(new RegExp(`(${MESES.join('|')})\\s+DE\\s+(\\d{4})`));
    if (m) out.mes = `${m[2]}-${String(MESES.indexOf(m[1]) + 1).padStart(2, '0')}`;
    const t = tipoDoTexto(ref[1]);
    if (t) out.tipo = t;
  }
  const cred = tudo.match(/DATA DE CREDITO:?\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (cred) out.dataCredito = `${cred[3]}-${cred[2]}-${cred[1]}`;

  // verbas: código, descrição, quantidade, vencimentos, descontos, outros
  const reItem = new RegExp(`^(\\d{1,5})\\s+(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})$`);
  L.forEach((l) => {
    const m = l.match(reItem);
    if (!m) return;
    out.itens.push({ codigo: m[1], descricao: m[2].trim(), quantidade: numBR(m[3].includes(',') ? m[3] : m[3].replace('.', ',')) ?? Number(m[3]), vencimento: numBR(m[4]), desconto: numBR(m[5]), outros: numBR(m[6]) });
  });

  const total = (rot) => { const m = tudo.match(new RegExp(`${rot}:?\\s*R\\$\\s*(${NUM})`)); return m ? numBR(m[1]) : null; };
  out.totalVencimentos = total('TOTAL DE VENCIMENTOS');
  out.totalDescontos = total('TOTAL DE DESCONTOS');
  out.liquido = total('VALOR LIQUIDO');

  // rodapé: SALÁRIO | SAL.CONTR. INSS | BASE FGTS | FGTS DO MÊS | BASE IRRF | BASE IRRF PLR | FAIXA IRRF
  const iCab = L.findIndex((l) => /FGTS DO M/i.test(semAcento(l)));
  if (iCab >= 0) {
    const reNums = new RegExp(NUM, 'g');
    for (let i = iCab + 1; i < Math.min(L.length, iCab + 4); i += 1) {
      const nums = L[i].match(reNums);
      if (nums && nums.length >= 5) {
        out.fgts = numBR(nums[3]);
        out.baseIrrf = numBR(nums[4]);
        if (out.salarioBase == null) out.salarioBase = numBR(nums[0]);
        break;
      }
    }
  }

  // classificação das verbas
  let inss = 0; let irrf = 0; let outrosDesc = 0; let base = null; let outrosVenc = 0;
  out.itens.forEach((it) => {
    const d = semAcento(it.descricao).toUpperCase();
    if (it.vencimento > 0) {
      if (base == null && /^SALARIO\b/.test(d)) base = it.vencimento;
      else outrosVenc += it.vencimento;
      if (!tipoDoTexto(ref ? ref[1] : '') && out.tipo === 'Mensal') { const t = tipoDoTexto(d); if (t && t !== 'Bônus') out.tipo = t; }
    }
    if (it.desconto > 0) {
      if (/IMPOSTO DE RENDA|\bIRRF\b|\bI\.R\.R\.F/.test(d)) irrf += it.desconto;
      else if (/^INSS\b/.test(d) && !/PROGRESSIVA/.test(d)) inss += it.desconto;
      else outrosDesc += it.desconto;
    }
  });
  if (base != null) out.salarioBase = base;
  out.outrosVencimentos = r2(outrosVenc);
  out.inss = r2(inss);
  out.irrf = r2(irrf);
  out.outrosDescontos = r2(outrosDesc);

  if (!out.mes) out.avisos.push('Não achei o mês de referência - confira.');
  if (!out.itens.length) out.avisos.push('Não achei as verbas (vencimentos/descontos) - confira os valores.');
  if (out.liquido == null) out.avisos.push('Não achei o valor líquido - confira.');
  if (out.totalVencimentos != null && out.totalDescontos != null && out.liquido != null
    && Math.abs(out.totalVencimentos - out.totalDescontos - out.liquido) > 0.02) {
    out.avisos.push('Total de vencimentos − descontos não bate com o líquido - confira.');
  }
  const somaVenc = out.itens.reduce((s, i) => s + (i.vencimento || 0), 0);
  if (out.totalVencimentos != null && out.itens.length && Math.abs(somaVenc - out.totalVencimentos) > 0.02) {
    out.avisos.push('A soma das verbas não bate com o total de vencimentos - alguma linha pode não ter sido lida.');
  }
  return out;
}
