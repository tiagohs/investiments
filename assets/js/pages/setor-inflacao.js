/**
 * setor-inflacao.js - 28/10/2026 (live da Suno, Daniele Lopes: "utilities têm contratos com repasse de inflação"; "bancos
 * historicamente crescem acima da inflação"; "o varejo tem dificuldade de repassar o aumento de preço: receita +10%, custo
 * +15%"). Leitura QUALITATIVA do setor: o negócio consegue repassar a inflação pro preço? Pura (sem DOM).
 *
 * Usa o setor/segmento que a Carteira já traz (Carteira Ações: Setor/Segmento; Carteira FIIs: Segmento + tipo Tijolo/Papel/
 * Híbrido). Não é recomendação: é um critério a mais, ao lado de preço-teto, P/L e P/VP. Testes: tests/inflacao-pessoal.test.js.
 */
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const REGRAS = [
  { nivel: 'repassa', re: /energia|eletric|saneamento|agua e esgoto|utilidade publica|transmiss|gas natural|rodovi|concess/, rotulo: 'repassa inflação', porque: 'Contratos e tarifas corrigidos pela inflação (concessões, energia, saneamento): a receita acompanha os preços.' },
  { nivel: 'repassa', re: /banco|intermediari|financeir|segur|previdencia|bolsa|corretora/, rotulo: 'cresce com inflação/juros', porque: 'Bancos e seguradoras: spread, tarifas e o dinheiro dos clientes aplicado (float) costumam acompanhar ou superar a inflação, sobretudo com juros altos. Atenção à inadimplência.' },
  { nivel: 'parcial', re: /petrol|minera|siderur|papel e celulose|commodit|agro|materiais basicos|quimic|petroquim/, rotulo: 'repasse via commodity', porque: 'Commodities: o preço segue o mercado (e o dólar), não o IPCA - protege da inflação em ciclos, mas oscila muito.' },
  { nivel: 'dificil', re: /varej|comercio|vestuario|eletrodomest|consumo ciclico|shopping|tecidos|calcados/, rotulo: 'repasse difícil', porque: 'Varejo e consumo: com custo subindo mais que a receita e crédito caro, repassar a inflação é difícil (margens baixas). A Suno alerta: no mesmo período em que energia e bancos ganharam da inflação, varejistas "quase foram a zero".' },
];
const FII = {
  Tijolo: { nivel: 'repassa', rotulo: 'aluguel corrigido', porque: 'FII de tijolo: contratos de aluguel reajustados por IPCA/IGP-M (shopping depende mais do consumo e do varejo).' },
  Papel: { nivel: 'repassa', rotulo: 'CRI indexado', porque: 'FII de papel: a maior parte dos CRIs paga IPCA ou CDI + taxa, então os rendimentos sobem com a inflação/juros.' },
  'Híbrido': { nivel: 'parcial', rotulo: 'repasse parcial', porque: 'FII híbrido: parte em imóveis (aluguel corrigido) e parte em papel (CRI indexado).' },
};

/** { nivel: 'repassa'|'parcial'|'dificil', rotulo, porque } ou null (setor desconhecido). chave = acoesNacionais|acoesInternacionais|fiis. */
export function repasseDeInflacao({ setor = '', segmento = '', tipo = '', nome = '' } = {}, chave = '') {
  if (chave === 'fiis') {
    if (/shopping/i.test(`${segmento} ${nome}`)) return { nivel: 'parcial', rotulo: 'depende do varejo', porque: 'FII de shopping: aluguel com parte variável ligada às vendas das lojas - sente o varejo e o crédito caro.' };
    return FII[String(tipo || '').trim()] || null;
  }
  const t = semAcento(`${setor} ${segmento}`);
  if (!t.trim()) return null;
  const r = REGRAS.find((x) => x.re.test(t));
  return r ? { nivel: r.nivel, rotulo: r.rotulo, porque: r.porque } : null;
}
