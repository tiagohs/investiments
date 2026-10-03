/**
 * criterios/base-acoes.js - 03/10/2026 (Tiago: "Nas análises dos gráficos e
 * métricas dos ativos, considere essas fontes [vídeos de análise de ações e
 * internacionais]. Tenha um largo banco de dados de critérios, para no site
 * ser dinâmico as decisões e análises (confio na Suno, principalmente)").
 *
 * Base normalizada de critérios de AÇÕES (Brasil = acoes_br, EUA =
 * acoes_int), lida pelo motor (criterios/motor.js). Só conhecimento geral,
 * resumido com nossas palavras, com o link de cada fonte (Suno primeiro;
 * vídeos de Raul Sena, Bruno Perini, Luiz Barsi/Suno e Leo Fittipaldi;
 * Damodaran, Fundamentus, SEC...). Nenhum dado da carteira entra aqui.
 *
 * Esquema de cada critério (o mesmo de base-fiis.js):
 *   id, nome, classes[], grupo,
 *   chave      - chave canônica do contrato de fundamentos (pl, roe, dy...)
 *                ou um derivado calculado pelo motor (DERIVADOS em motor.js:
 *                precoSobreTeto, grahamPlPvp, volatilidade...)
 *   unidade    - 'x' | '%' (fração: 0.085 = 8,5%) | 'pp' (fração) | 'rel'
 *                (razão vs uma referência: 0.8 = 20% abaixo) | 'anos' | 'n' |
 *                'R$' | 'pontos' | 'bool'
 *   casas, direcao ('menor' | 'maior' | 'faixa'),
 *   faixas     - { bom, neutro, atencao, ruim }: listas de intervalos
 *                [min, max) na unidade do valor (null = aberto), sem
 *                sobreposição; faixasInt (EUA) e faixasPorSetor substituem
 *   aplicaA / naoAplicaA (setores), peso (1-3), eliminatorio, informativo
 *                (mostra, mas fica fora da nota), porQue, armadilha,
 *   frases     - { bom, neutro, atencao?, ruim } com {valor} {valorAbs}
 *                {faixa} {ref} {media} {teto} {cdi} {indice}
 *   fontes     - [{ titulo, url }]
 *
 * Os critérios (CRITERIOS_ACOES) são gerados a partir da pesquisa
 * (scratchpad/criterios/acoes.json, 90 critérios + 18 regras): entram os
 * que dá pra calcular com a planilha, o contrato de fundamentos ou um
 * derivado; os qualitativos (moat, red flags de governança...) ficaram de
 * fora. As regras de combinação estão no fim, como funções.
 */

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Rótulo de cada setor (o que aparece em "régua de bancos"). */
export const SETORES_ACOES = Object.freeze({
  bancos: 'bancos',
  seguradoras: 'seguradoras',
  eletricas_utilities: 'elétricas e utilities',
  saneamento: 'saneamento',
  telecom_cabo: 'telecom e mídia',
  commodities_ciclicas: 'commodities e cíclicas',
  petroleo_royalties: 'royalties de petróleo',
  varejo: 'varejo',
  tecnologia_crescimento: 'tecnologia',
  holdings: 'holdings',
  outros: '',
});

/**
 * Setor da régua a partir do setor/subsetor/segmento (planilha "Setor/
 * Segmento" ou contrato de fundamentos) e do nome da empresa.
 */
export function setorDaAcao({ setor = '', subsetor = '', segmento = '', nome = '' } = {}) {
  const t = norm([setor, subsetor, segmento].join(' ')).replace(/\s+/g, ' ').trim();
  const n = norm(nome);
  if (/segur|seguridade|previdencia|resseguro|insurance/.test(`${t} ${n}`)) return 'seguradoras';
  if (/banc|\bbank|bancorp/.test(`${t} ${n}`)) return 'bancos';
  if (/saneamento|agua e esgoto|water utilit/.test(t)) return 'saneamento';
  if (/royalt|mineral right/.test(t)) return 'petroleo_royalties';
  if (/energia eletrica|eletric|utilidade publica|utilities|transmiss/.test(t)) return 'eletricas_utilities';
  if (/petroleo|oleo e gas|\bgas\b|mineracao|siderurg|metalurg|papel e celulose|materiais basicos|agricultura|agropecuar|\boil\b|mining|steel|^energia$|energy/.test(t)) return 'commodities_ciclicas';
  if (/telecom|comunicac|\bcabo\b|midia|entretenimento|media/.test(t)) return 'telecom_cabo';
  if (/tecnolog|software|internet|e-commerce|technology/.test(t)) return 'tecnologia_crescimento';
  if (/varejo|comercio|retail/.test(t)) return 'varejo';
  if (/holding|participac/.test(t)) return 'holdings';
  return 'outros';
}

// <criterios gerados> (scratchpad/criterios/gerar_base.py - não edite à mão sem atualizar o gerador)
export const CRITERIOS_ACOES = Object.freeze([
  {
    id: 'pl',
    nome: 'P/L',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'pl',
    unidade: 'x',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[3, 10]], neutro: [[10, 15]], atencao: [[15, 25], [0, 3]], ruim: [[25, null], [null, 0]] },
    faixasInt: { bom: [[5, 15]], neutro: [[15, 22]], atencao: [[22, 35], [0, 5]], ruim: [[35, null], [null, 0]] },
    faixasPorSetor: {
      bancos: { bom: [[5, 8]], neutro: [[8, 11]], atencao: [[11, 14], [0, 5]], ruim: [[14, null], [null, 0]] },
      eletricas_utilities: { bom: [[0.01, 9]], neutro: [[9, 14]], atencao: [[14, 20]], ruim: [[20, null], [null, 0.01]] },
      tecnologia_crescimento: { bom: [[0.01, 20]], neutro: [[20, 35]], atencao: [[35, 60]], ruim: [[60, null], [null, 0.01]] },
    },
    peso: 3,
    eliminatorio: false,
    porQue: 'Mostra quanto o mercado paga por cada real de lucro; é o múltiplo mais usado e o ponto de partida dos 4 vídeos.',
    armadilha: 'P/L baixo de cíclica no pico do ciclo (lucro vai cair); lucro inflado por evento não recorrente (venda de ativo, crédito tributário)',
    frases: {
      bom: 'P/L de {valor}: o lucro atual paga o preço em pouco tempo ({faixa} é a faixa boa{ref}). Confira se o lucro é recorrente.',
      neutro: 'P/L de {valor}: na média{ref}; o que decide é crescimento e qualidade do lucro.',
      ruim: 'P/L de {valor}: caro pelo lucro de hoje{ref} - só se justifica com crescimento forte ou lucro temporariamente deprimido.',
      atencao: 'P/L de {valor}: acima da faixa boa ({faixa}{ref}) - preço já exige crescimento.',
      atencaoBaixo: 'P/L de {valor}: baixo demais - costuma ser lucro extraordinário (não recorrente) ou risco alto. Confira antes de achar barato.',
      ruimBaixo: 'P/L negativo: a empresa teve prejuízo nos últimos 12 meses.',
    },
    fontes: [
      { titulo: 'Suno: faixas 8–15 consolidadas, >25 crescimento, <6 investigar', url: 'https://www.suno.com.br/artigos/preco-lucro/' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (04:00)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (20:32)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
    ],
  },
  {
    id: 'pl_vs_media_historica',
    nome: 'P/L vs média histórica',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'plSobreMedia',
    unidade: 'rel',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 0.8]], neutro: [[0.8, 1.1]], atencao: [[1.1, 1.3]], ruim: [[1.3, null]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Compara a ação com ela mesma (Perini 09:00: \'comparar com o histórico e com os concorrentes\'); evita comparar setores diferentes.',
    armadilha: 'mudança estrutural (privatização, nova regulação) torna a média antiga inválida — ex.: SBSP3 pós-privatização (Raul 09:01); média distorcida por anos de prejuízo — excluir anos com P/L ≤ 0 ou > 60',
    frases: { bom: 'P/L {valor} da própria média ({media}): mais barato que o costume da ação.', neutro: 'P/L perto da própria média histórica ({media}).', ruim: 'P/L {valor} da própria média ({media}): mais caro que o costume da ação.' },
    fontes: [
      { titulo: 'Suno: Ambev abaixo da média histórica de P/L', url: 'https://www.suno.com.br/artigos/preco-lucro/' },
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (09:00)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
    ],
  },
  {
    id: 'pvp',
    nome: 'P/VP',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'pvp',
    unidade: 'x',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[0.01, 1.0]], neutro: [[1.0, 2.0]], atencao: [[2.0, 3.5]], ruim: [[3.5, null], [null, 0.01]] },
    faixasInt: { bom: [[0.01, 1.5]], neutro: [[1.5, 3.0]], atencao: [[3.0, 6.0]], ruim: [[6.0, null], [null, 0.01]] },
    faixasPorSetor: {
      bancos: { bom: [[0.01, 1.0]], neutro: [[1.0, 1.8]], atencao: [[1.8, 2.5]], ruim: [[2.5, null], [null, 0.01]] },
      eletricas_utilities: { bom: [[0.01, 1.0]], neutro: [[1.0, 2.0]], atencao: [[2.0, 3.0]], ruim: [[3.0, null], [null, 0.01]] },
    },
    peso: 3,
    eliminatorio: false,
    porQue: 'Barsi usa o P/VP como medida de risco: pagar 2x o patrimônio é assumir mais risco; abaixo de 1 é o "critério da oportunidade" - desde que a empresa renda bem.',
    armadilha: 'P/VP < 1 pode refletir ROE baixo ou risco político ("não tem bobo no mercado"); empresas asset-light (bolsa, seguradoras, software) têm P/VP alto por natureza - julgue junto com o ROE.',
    frases: {
      bom: 'P/VP de {valor}: paga pouco pelo patrimônio{ref}. Desconto só é bom com rentabilidade (ROE) decente.',
      neutro: 'P/VP de {valor}: dentro do normal{ref}.',
      ruim: 'P/VP de {valor}: o mercado paga bem acima do patrimônio{ref} - exige ROE alto e sustentável.',
      ruimBaixo: 'P/VP negativo: o patrimônio líquido está negativo (prejuízos acumulados).',
    },
    fontes: [
      { titulo: 'Suno: “Luiz Barsi explica quais os principais indicadores utiliza…” (00:30)', url: 'https://www.youtube.com/watch?v=Gr9Iyvlo69k' },
      { titulo: 'Suno: P/VP>1 não é ruim para empresas de alta rentabilidade', url: 'https://www.suno.com.br/artigos/os-indicadores-mais-importantes-em-uma-analise/' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (04:31)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'pvp_vs_media_historica',
    nome: 'P/VP vs média histórica',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'pvpSobreMedia',
    unidade: 'rel',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 0.8]], neutro: [[0.8, 1.1]], atencao: [[1.1, 1.3]], ruim: [[1.3, null]] },
    aplicaA: ['bancos', 'seguradoras', 'eletricas_utilities', 'saneamento', 'commodities_ciclicas'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Para bancos, seguradoras e utilities o P/VP histórico é mais estável que o P/L — bom termômetro de \'momento de compra\'.',
    armadilha: 'PL muda com recompras, baixas contábeis e marcação a mercado; reavaliação de ativos muda o patamar',
    frases: { bom: 'P/VP {valor} da média histórica ({media}): descontado pela régua da própria ação.', neutro: 'P/VP perto da média histórica ({media}).', ruim: 'P/VP {valor} da média histórica ({media}): mais esticado que o normal.' },
    fontes: [
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (09:00)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
    ],
  },
  {
    id: 'earnings_yield',
    nome: 'Earnings yield (1/P/L)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'earningsYield',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.12, null]], neutro: [[0.08, 0.12]], atencao: [[0.05, 0.08]], ruim: [[null, 0.05]] },
    faixasInt: { bom: [[0.07, null]], neutro: [[0.05, 0.07]], atencao: [[0.03, 0.05]], ruim: [[null, 0.03]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Coloca a ação na mesma régua da renda fixa (Raul 08:01). Com Selic alta, ação precisa render mais que a NTN-B para compensar o risco.',
    armadilha: 'comparar com a taxa livre de risco DA MOEDA: BR vs NTN-B/Selic; EUA vs Treasury 10 anos; lucro não recorrente infla o yield',
    frases: { bom: 'O lucro rende {valor} ao ano sobre o preço: bom retorno implícito.', neutro: 'O lucro rende {valor} ao ano sobre o preço.', ruim: 'O lucro rende só {valor} ao ano sobre o preço: a renda fixa paga parecido com menos risco.' },
    fontes: [
      { titulo: 'Suno: earnings yield = EBIT/EV na Fórmula Mágica', url: 'https://www.suno.com.br/artigos/formula-magica-de-joel-grenblatt-little-book-beats-market/' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (08:01)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'ev_ebitda',
    nome: 'EV/EBITDA',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'evEbitda',
    unidade: 'x',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[0.01, 5]], neutro: [[5, 8]], atencao: [[8, 12]], ruim: [[12, null], [null, 0.01]] },
    faixasInt: { bom: [[0.01, 8]], neutro: [[8, 12]], atencao: [[12, 18]], ruim: [[18, null], [null, 0.01]] },
    faixasPorSetor: {
      eletricas_utilities: { bom: [[0.01, 6]], neutro: [[6, 10]], atencao: [[10, 14]], ruim: [[14, null], [null, 0.01]] },
      telecom_cabo: { bom: [[0.01, 5.5]], neutro: [[5.5, 8]], atencao: [[8, 11]], ruim: [[11, null], [null, 0.01]] },
      commodities_ciclicas: { bom: [[0.01, 4]], neutro: [[4, 6]], atencao: [[6, 9]], ruim: [[9, null], [null, 0.01]] },
      tecnologia_crescimento: { bom: [[0.01, 12]], neutro: [[12, 25]], atencao: [[25, 40]], ruim: [[40, null], [null, 0.01]] },
    },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Neutraliza diferenças de estrutura de capital e impostos — melhor que o P/L para comparar empresas endividadas (Suno: quanto menor, mais atraente dentro do setor).',
    armadilha: 'não usar em bancos/seguradoras (EBITDA não existe); EBITDA ignora capex: capex pesado (telecom, mineração) faz EV/EBITDA parecer barato',
    frases: { bom: 'EV/EBITDA de {valor}: barato considerando também a dívida{ref}.', neutro: 'EV/EBITDA de {valor}: na média{ref}.', ruim: 'EV/EBITDA de {valor}: caro considerando a dívida{ref}.' },
    fontes: [
      { titulo: 'Suno: EV/EBITDA: quanto menor, mais atraente, comparando no setor', url: 'https://www.suno.com.br/artigos/os-indicadores-mais-importantes-em-uma-analise/' },
      { titulo: 'Damodaran (NYU): EUA jan/2026: mercado 19,7; utility 13,7; E&P 5,2; telecom 6,5; cabo…', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/vebitda.html' },
    ],
  },
  {
    id: 'ev_ebit',
    nome: 'EV/EBIT',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'evEbit',
    unidade: 'x',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[0.01, 7]], neutro: [[7, 10]], atencao: [[10, 15]], ruim: [[15, null], [null, 0.01]] },
    faixasInt: { bom: [[0.01, 12]], neutro: [[12, 18]], atencao: [[18, 25]], ruim: [[25, null], [null, 0.01]] },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Mais conservador que EV/EBITDA porque considera a depreciação (proxy de capex de manutenção). Base da Fórmula Mágica (inverso = EBIT/EV).',
    armadilha: 'não usar em bancos/seguradoras; EBIT com itens não recorrentes',
    frases: { bom: 'EV/EBIT de {valor}: o resultado operacional paga a empresa (com dívida) rápido.', neutro: 'EV/EBIT de {valor}: na média.', ruim: 'EV/EBIT de {valor}: caro pelo resultado operacional.' },
    fontes: [
      { titulo: 'Suno', url: 'https://www.suno.com.br/artigos/formula-magica-de-joel-grenblatt-little-book-beats-market/' },
      { titulo: 'Damodaran (NYU): EV/EBIT EUA jan/2026: mercado 29; utility 22,6; E&P 10,3; telecom 12,2', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/vebitda.html' },
    ],
  },
  {
    id: 'psr',
    nome: 'P/Receita (PSR)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'psr',
    unidade: 'x',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[0.01, 1.0]], neutro: [[1.0, 2.0]], atencao: [[2.0, 4.0]], ruim: [[4.0, null], [null, 0.01]] },
    faixasPorSetor: {
      varejo: { bom: [[0.01, 0.5]], neutro: [[0.5, 1.0]], atencao: [[1.0, 1.5]], ruim: [[1.5, null], [null, 0.01]] },
      tecnologia_crescimento: { bom: [[0.01, 3]], neutro: [[3, 8]], atencao: [[8, 15]], ruim: [[15, null], [null, 0.01]] },
    },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 1,
    eliminatorio: false,
    porQue: 'Útil quando o lucro está deprimido ou negativo (turnaround, crescimento). Ken Fisher buscava PSR < 1 (Suno).',
    armadilha: 'depende da margem: PSR ≈ P/L × margem líquida — varejo com margem 2% precisa PSR bem < 1; receita sem lucro não paga dividendo',
    frases: { bom: 'PSR de {valor}: paga pouco por cada real de receita{ref}.', neutro: 'PSR de {valor}: na média{ref}.', ruim: 'PSR de {valor}: caro pela receita{ref} - depende de margens altas no futuro.' },
    fontes: [
      { titulo: 'Suno: Fisher: PSR<1 subvalorizado; varia por setor', url: 'https://www.suno.com.br/artigos/psr/' },
    ],
  },
  {
    id: 'peg',
    nome: 'PEG (P/L ÷ crescimento)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'peg',
    unidade: 'x',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[0.01, 1.0]], neutro: [[1.0, 1.5]], atencao: [[1.5, 2.0]], ruim: [[2.0, null], [null, 0.01]] },
    naoAplicaA: ['commodities_ciclicas'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Evita descartar empresa boa só por P/L alto: P/L 30 com lucro crescendo 30% a.a. (PEG 1) pode ser mais barato que P/L 8 sem crescimento.',
    armadilha: 'crescimento passado ≠ futuro; não usar em cíclicas, turnarounds ou crescimento ≤ 0 (PEG negativo/infinito = \'ruim/não aplicável\')',
    frases: { bom: 'PEG de {valor}: o P/L é baixo para o crescimento do lucro.', neutro: 'PEG de {valor}: preço coerente com o crescimento.', ruim: 'PEG de {valor}: paga caro pelo crescimento esperado.' },
    fontes: [
      { titulo: 'Suno: classes de Lynch: slow 2–4%, stalwarts 10–12%, fast >20%', url: 'https://www.suno.com.br/artigos/6-classes-de-acoes-segundo-peter-lynch/comment-page-1/' },
      { titulo: 'Damodaran (NYU): PEG EUA jan/2026: mercado 1,9; software 1,65; bancos regionais 0,9', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/pedata.html' },
    ],
  },
  {
    id: 'pegy_lynch',
    nome: 'PEGY de Lynch ((cresc. + DY) ÷ P/L)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'pegy',
    unidade: 'x',
    casas: 2,
    direcao: 'maior',
    faixas: { bom: [[2.0, null]], neutro: [[1.5, 2.0]], atencao: [[1.0, 1.5]], ruim: [[null, 1.0]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Adequado a pagadoras maduras (BEST): reconhece que parte do retorno vem como dividendo e não como crescimento.',
    armadilha: 'DY extraordinário infla o numerador — usar DY médio 3 anos',
    frases: { bom: '(Crescimento + DY) ÷ P/L = {valor}: pela régua de Peter Lynch, preço atrativo.', neutro: '(Crescimento + DY) ÷ P/L = {valor}: razoável pela régua de Lynch.', ruim: '(Crescimento + DY) ÷ P/L = {valor}: crescimento e dividendos não compensam o P/L.' },
    fontes: [
      { titulo: 'Suno', url: 'https://www.suno.com.br/artigos/6-classes-de-acoes-segundo-peter-lynch/comment-page-1/' },
    ],
  },
  {
    id: 'fcf_yield',
    nome: 'FCF yield',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'fcfYield',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.08, null]], neutro: [[0.05, 0.08]], atencao: [[0.02, 0.05]], ruim: [[null, 0.02]] },
    faixasInt: { bom: [[0.06, null]], neutro: [[0.04, 0.06]], atencao: [[0.02, 0.04]], ruim: [[null, 0.02]] },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 2,
    eliminatorio: false,
    porQue: 'É o caixa que efetivamente pode virar dividendo, recompra ou redução de dívida (Leo 18:08). Mais difícil de maquiar que o lucro.',
    armadilha: 'capex em ciclo de expansão derruba o FCF temporariamente (não necessariamente ruim); venda de ativos / capital de giro pontual infla FCO',
    frases: { bom: 'Gera {valor} do valor de mercado em caixa livre por ano - sobra dinheiro de verdade.', neutro: 'Gera {valor} do valor de mercado em caixa livre por ano.', ruim: 'Caixa livre de só {valor} do valor de mercado: pouco dinheiro sobrando.' },
    fontes: [
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (18:08)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'preco_vs_teto_planilha',
    nome: 'Preço ÷ seu preço-teto',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'precoSobreTeto',
    unidade: 'rel',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 0.85]], neutro: [[0.85, 1.0]], atencao: [[1.0, 1.1]], ruim: [[1.1, null]] },
    peso: 3,
    eliminatorio: false,
    porQue: 'É o critério de decisão que já existe no site (viés Comprar/Aguardar). Graduar a margem dá mais informação que o binário.',
    armadilha: 'preço-teto desatualizado (não revisto após balanço/mudança de juros); teto definido com DY extraordinário',
    frases: { bom: 'Cotação {valor} do seu preço-teto ({teto}): com margem de segurança.', neutro: 'Cotação {valor} do seu preço-teto ({teto}): pouca margem.', ruim: 'Cotação {valor} do seu preço-teto ({teto}): acima do que você aceita pagar.' },
    fontes: [
      { titulo: 'Suno: margem de segurança entre preço e valor', url: 'https://www.suno.com.br/artigos/a-importancia-da-margem-de-seguranca/' },
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (28:00)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'preco_teto_bazin',
    nome: 'Preço ÷ teto de Bazin (DY 6%)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'precoSobreBazin',
    unidade: 'rel',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 0.9]], neutro: [[0.9, 1.0]], atencao: [[1.0, 1.15]], ruim: [[1.15, null]] },
    naoAplicaA: ['tecnologia_crescimento'],
    peso: 3,
    eliminatorio: false,
    porQue: 'Método clássico de dividendos usado pela Suno: comprar com DY ≥ 6%; Bazin vendia quando o DY caía a 4%.',
    armadilha: 'DPA de um ano só ou com provento extraordinário infla o teto; empresa que paga muito mas não cresce (ou paga mais que gera) é armadilha',
    frases: { bom: 'Abaixo do teto de Bazin ({teto}, proventos de 12 meses ÷ 6%): paga ao menos 6% ao ano.', neutro: 'Perto do teto de Bazin ({teto}).', ruim: 'Acima do teto de Bazin ({teto}): pelos proventos atuais, rende menos de 6% ao ano.' },
    fontes: [
      { titulo: 'Suno: DY mínimo 6%; vender quando DY cai para 4%; empresas moderadamente en…', url: 'https://www.suno.com.br/tudo-sobre/decio-bazin/' },
      { titulo: 'Suno: “Luiz Barsi explica quais os principais indicadores utiliza…” (01:01)', url: 'https://www.youtube.com/watch?v=Gr9Iyvlo69k' },
    ],
  },
  {
    id: 'preco_justo_graham',
    nome: 'Graham: P/L × P/VP',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'grahamPlPvp',
    unidade: 'x',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[0.01, 15]], neutro: [[15, 22.5]], atencao: [[22.5, 35]], ruim: [[35, null], [null, 0.01]] },
    naoAplicaA: ['tecnologia_crescimento', 'seguradoras'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Combina lucro e patrimônio num número só: pela fórmula de Graham, P/L × P/VP até 22,5 equivale a preço abaixo do valor justo (√(22,5 × LPA × VPA)).',
    armadilha: 'não funciona com prejuízo ou PL negativo; Suno: múltiplos de mercado subiram desde Graham — tende a \'reprovar\' empresas boas/asset-light',
    frases: { bom: 'P/L × P/VP = {valor}, abaixo do limite de Graham (22,5).', neutro: 'P/L × P/VP = {valor}: perto do limite de Graham (22,5).', ruim: 'P/L × P/VP = {valor}: acima do limite de Graham (22,5) - sem margem pelo critério clássico.' },
    fontes: [
      { titulo: 'Suno: fórmula √(22,5×LPA×VPA) e limitação', url: 'https://www.suno.com.br/artigos/preco-justo/' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (06:30)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'posicao_faixa_52s',
    nome: 'Posição na faixa de 52 semanas',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'posicao52s',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 0.3]], neutro: [[0.3, 0.7]], atencao: [[0.7, 0.9]], ruim: [[0.9, null]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Indicador de MOMENTO (não de qualidade): perto da mínima com fundamentos intactos = janela de compra; perto da máxima = não perseguir.',
    armadilha: 'perto da mínima pode ser deterioração real (cheque LPA e dívida); Raul 01:01: cotação/gráfico sozinhos \'não servem para nada\' — usar só combinado com fundamentos',
    frases: { bom: 'Cotação na parte de baixo da faixa de 52 semanas ({valor} do caminho entre mínima e máxima).', neutro: 'Cotação no meio da faixa de 52 semanas ({valor}).', ruim: 'Cotação perto da máxima de 52 semanas ({valor} da faixa).' },
    fontes: [
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (01:01)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (01:31)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
    ],
  },
  {
    id: 'dy_12m',
    nome: 'Dividend yield 12m',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'dividendos',
    chave: 'dy',
    unidade: '%',
    casas: 1,
    direcao: 'faixa',
    faixas: { bom: [[0.06, 0.12]], neutro: [[0.04, 0.06]], atencao: [[0.02, 0.04], [0.12, 0.18]], ruim: [[null, 0.02], [0.18, null]] },
    faixasInt: { bom: [[0.03, 0.07]], neutro: [[0.02, 0.03]], atencao: [[0.01, 0.02], [0.07, 0.1]], ruim: [[null, 0.01], [0.1, null]] },
    faixasPorSetor: {
      bancos: { bom: [[0.06, 0.11]], neutro: [[0.04, 0.06]], atencao: [[0.02, 0.04], [0.11, 0.16]], ruim: [[null, 0.02], [0.16, null]] },
      eletricas_utilities: { bom: [[0.06, 0.11]], neutro: [[0.04, 0.06]], atencao: [[0.02, 0.04], [0.11, 0.16]], ruim: [[null, 0.02], [0.16, null]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'Remuneração corrente do acionista; Barsi o chama de \'a remuneração\' e Bazin exige ≥ 6%. Suno: 4–8% atrativo; com Selic alta, muitos exigem > 8%.',
    armadilha: 'DY alto por QUEDA de preço (empresa em crise) ou provento extraordinário (venda de ativo) — Leo 17:00: \'DY alto pode esconder empresa ruim\'; DY > 12–15% recorrente é raro e merece checar payout e FCL',
    frases: {
      bom: 'DY de {valor} em 12 meses, na faixa saudável{ref}. Confira se não teve provento extraordinário.',
      neutro: 'DY de {valor} em 12 meses{ref}.',
      atencao: 'DY de {valor}{ref}: acima da faixa usual ({faixa}) - confira se é recorrente.',
      ruim: 'DY de {valor}{ref}: alto demais pra ser recorrente - confira proventos extraordinários ou queda forte da cotação.',
      atencaoBaixo: 'DY de {valor}{ref}: abaixo da faixa boa ({faixa}) - paga pouco provento.',
      ruimBaixo: 'DY de {valor}{ref}: quase não paga proventos - aqui o retorno depende do preço.',
    },
    fontes: [
      { titulo: 'Suno: “Luiz Barsi explica quais os principais indicadores utiliza…” (01:01)', url: 'https://www.youtube.com/watch?v=Gr9Iyvlo69k' },
      { titulo: 'Suno: 4–8% atrativo; >10% pode ser anomalia', url: 'https://www.suno.com.br/guias/dividend-yield/' },
      { titulo: 'Suno: mínimo 6%', url: 'https://www.suno.com.br/tudo-sobre/decio-bazin/' },
    ],
  },
  {
    id: 'dy_vs_media_historica',
    nome: 'DY vs média histórica',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'dividendos',
    chave: 'dySobreMedia',
    unidade: 'rel',
    casas: 2,
    direcao: 'maior',
    faixas: { bom: [[1.2, null]], neutro: [[0.9, 1.2]], atencao: [[0.7, 0.9]], ruim: [[null, 0.7]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Para pagadoras estáveis, DY acima da média histórica costuma indicar preço deprimido (Raul 11:30: quando a ação fica cara, o DY cai).',
    armadilha: 'DY alto porque o provento 12m teve extraordinário; corte de dividendo futuro já anunciado',
    frases: { bom: 'DY {valor} da média histórica ({media}): preço descontado pela régua dos proventos.', neutro: 'DY perto da média histórica ({media}).', ruim: 'DY {valor} da média histórica ({media}): ação mais cara que o usual ou proventos em queda.' },
    fontes: [
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (11:30)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'dy_liquido_impostos',
    nome: 'DY líquido (após 30% retidos nos EUA)',
    classes: ['acoes_int'],
    grupo: 'dividendos',
    chave: 'dyLiquido',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.03, null]], neutro: [[0.02, 0.03]], atencao: [[0.01, 0.02]], ruim: [[null, 0.01]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Dividendos de empresas dos EUA chegam ao investidor brasileiro com 30% retidos na fonte - o DY "de vitrine" engana. Recompras não sofrem essa retenção.',
    armadilha: '30% é para empresa americana; ADR estrangeiro segue o país-sede; nenhum crédito devolve os 30% (o crédito só zera os 15% do BR)',
    frases: { bom: 'Depois dos 30% retidos nos EUA, sobra DY de {valor}.', neutro: 'Depois dos 30% retidos nos EUA, sobra DY de {valor}.', ruim: 'Depois dos 30% retidos nos EUA, sobra só {valor} de DY - aqui o retorno vem do preço.' },
    fontes: [
      { titulo: 'Suno: retenção de 30% nos EUA', url: 'https://www.suno.com.br/artigos/tributacao-para-investimentos-no-exterior/' },
      { titulo: 'Nomad: 15% anual com crédito do imposto pago nos EUA; fim da isenção de R$35…', url: 'https://www.nomadglobal.com/portal/artigos/imposto-investimento-exterior' },
      { titulo: 'Câmara (lei)', url: 'https://www2.camara.leg.br/legin/fed/lei/2023/lei-14754-12-dezembro-2023-795058-publicacaooriginal-170415-pl.html' },
    ],
  },
  {
    id: 'payout',
    nome: 'Payout',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'dividendos',
    chave: 'payout',
    unidade: '%',
    casas: 0,
    direcao: 'faixa',
    faixas: { bom: [[0.3, 0.7]], neutro: [[0.25, 0.3], [0.7, 0.9]], atencao: [[0.9, 1.1], [0.0, 0.25]], ruim: [[1.1, null], [null, 0.0]] },
    faixasInt: { bom: [[0.25, 0.6]], neutro: [[0.6, 0.75], [0.0, 0.25]], atencao: [[0.75, 1.0]], ruim: [[1.0, null], [null, 0.0]] },
    faixasPorSetor: {
      eletricas_utilities: { bom: [[0.6, 1.0]], neutro: [[0.4, 0.6], [1.0, 1.1]], atencao: [[0.0, 0.4], [1.1, 1.3]], ruim: [[1.3, null], [null, 0.0]] },
      seguradoras: { bom: [[0.7, 1.0]], neutro: [[0.5, 0.7]], atencao: [[1.0, 1.2], [0.0, 0.5]], ruim: [[1.2, null], [null, 0.0]] },
      bancos: { bom: [[0.3, 0.6]], neutro: [[0.25, 0.3], [0.6, 0.75]], atencao: [[0.75, 0.9], [0.0, 0.25]], ruim: [[0.9, null], [null, 0.0]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'Mostra sustentabilidade do dividendo e quanto fica para crescer. Suno: 30–70% equilibrado; BR exige mínimo legal de 25%. Raul (11:01) prefere payout menor na fase de acumulação.',
    armadilha: 'payout > 100% por 2+ anos = paga mais do que lucra (dívida/caixa); lucro contábil ≠ caixa: conferir com payout de FCL',
    frases: {
      bom: 'Distribui {valor} do lucro: equilíbrio entre pagar e reinvestir{ref}.',
      neutro: 'Distribui {valor} do lucro{ref}.',
      atencao: 'Payout de {valor}{ref}: alto - sobra pouco lucro para reinvestir.',
      ruim: 'Payout de {valor}{ref}: paga mais do que lucra - insustentável se continuar.',
      atencaoBaixo: 'Payout de {valor}{ref}: distribui pouco do lucro.',
      ruimBaixo: 'Payout de {valor}: sem distribuição (ou prejuízo).',
    },
    fontes: [
      { titulo: 'Suno: faixas <30 / 30–60 / >60 e exceções setoriais', url: 'https://www.suno.com.br/artigos/payout/' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (10:30)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'payout_fcl_total',
    nome: 'Dividendos + recompras ÷ caixa livre',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'dividendos',
    chave: 'payoutFcl',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 0.8]], neutro: [[0.8, 1.0]], atencao: [[1.0, 1.2]], ruim: [[1.2, null]] },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 3,
    eliminatorio: true,
    porQue: 'Leo (20:33–22:30): Visa gerou US$19 bi de FCL, recomprou 13 e pagou 4 → saudável. Pagar acima do FCL por 2–3 anos seguidos = financiar dividendo com dívida.',
    armadilha: 'um ano isolado acima de 100% pode ser aceitável (capex pontual); FCL negativo torna a razão sem sentido — tratar como \'ruim\'',
    frases: { bom: 'Devolve {valor} do caixa livre aos acionistas: cabe no que a empresa gera.', neutro: 'Devolve {valor} do caixa livre: no limite.', ruim: 'Devolve {valor} do caixa livre: paga mais do que gera (dívida ou caixa bancando).' },
    fontes: [
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (20:33)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'anos_pagando_dividendos',
    nome: 'Anos pagando dividendos',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'dividendos',
    chave: 'anosPagandoDividendos',
    unidade: 'anos',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[10, null]], neutro: [[5, 10]], atencao: [[2, 5]], ruim: [[null, 2]] },
    naoAplicaA: ['tecnologia_crescimento'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Barsi (02:31) considera o \'histórico de distribuições\'; consistência é o que permite viver de renda.',
    armadilha: 'empresas novas (IPO recente) não têm histórico — tratar como \'neutro/sem dados\'; pagar todo ano não significa pagar bem — ver DY médio',
    frases: { bom: 'Paga dividendos há {valor} seguidos: histórico consistente.', neutro: 'Paga dividendos há {valor}.', ruim: 'Só {valor} pagando dividendos: histórico curto.' },
    fontes: [
      { titulo: 'Suno: “Luiz Barsi explica quais os principais indicadores utiliza…” (02:31)', url: 'https://www.youtube.com/watch?v=Gr9Iyvlo69k' },
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (21:31)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'anos_aumentando_dividendos',
    nome: 'Anos aumentando dividendos',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'dividendos',
    chave: 'anosAumentandoDividendos',
    unidade: 'anos',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[10, null]], neutro: [[5, 10]], atencao: [[1, 5]], ruim: [[null, 1]] },
    faixasInt: { bom: [[25, null]], neutro: [[10, 25]], atencao: [[3, 10]], ruim: [[null, 3]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Nos EUA: Dividend Aristocrats = membros do S&P 500 com ≥ 25 anos de aumentos; Kings = ≥ 50 anos; Achievers ≥ 10. No BR quase ninguém tem — usar \'anos sem reduzir\'.',
    armadilha: 'empresa pode aumentar centavos só para manter o título enquanto se endivida (Leo 21:31); no BR, DPA oscila com lucro (payout fixo) — critério menos útil',
    frases: { bom: 'Aumenta o dividendo há {valor} seguidos.', neutro: 'Aumenta o dividendo há {valor}.', ruim: 'Só {valor} de aumentos seguidos de dividendo.' },
    fontes: [
      { titulo: 'Motley Fool: 25 anos aristocrats; 50 anos kings', url: 'https://www.fool.com/investing/stock-market/types-of-stocks/dividend-stocks/dividend-aristocrats' },
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (17:31)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'yield_on_cost',
    nome: 'Yield on cost (sobre o seu preço médio)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'dividendos',
    chave: 'yieldOnCost',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.08, null]], neutro: [[0.05, 0.08]], atencao: [[0.03, 0.05]], ruim: [[null, 0.03]] },
    faixasInt: { bom: [[0.05, null]], neutro: [[0.03, 0.05]], atencao: [[0.015, 0.03]], ruim: [[null, 0.015]] },
    peso: 1,
    eliminatorio: false,
    informativo: true,
    porQue: 'Descritivo/motivacional — mostra a renda da posição. NÃO deve guiar compra nova (que depende do preço atual).',
    armadilha: 'YoC alto não significa que a ação está barata hoje',
    frases: { bom: 'Sobre o seu preço médio, os proventos de 12 meses rendem {valor}.', neutro: 'Sobre o seu preço médio, os proventos de 12 meses rendem {valor}.', ruim: 'Sobre o seu preço médio, os proventos rendem só {valor}.' },
    fontes: [
      { titulo: 'Suno: o que é yield on cost', url: 'https://www.suno.com.br/artigos/yield-on-cost/' },
    ],
  },
  {
    id: 'shareholder_yield',
    nome: 'Shareholder yield (dividendos + recompras)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'dividendos',
    chave: 'shareholderYield',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.06, null]], neutro: [[0.03, 0.06]], atencao: [[0.01, 0.03]], ruim: [[null, 0.01]] },
    faixasInt: { bom: [[0.05, null]], neutro: [[0.03, 0.05]], atencao: [[0.01, 0.03]], ruim: [[null, 0.01]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Nos EUA a recompra de ações é forma central de remunerar o acionista e não sofre a retenção de 30% - por isso olhe dividendos + recompras juntos.',
    armadilha: 'recompra que só compensa stock options não reduz ações em circulação — ver \'variacao_acoes_circulacao\'; recompra a preço caro destrói valor',
    frases: { bom: 'Devolve {valor} do valor de mercado por ano em dividendos e recompras.', neutro: 'Devolve {valor} ao ano em dividendos e recompras.', ruim: 'Devolve só {valor} ao ano aos acionistas.' },
    fontes: [
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (19:07)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (06:00)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'roe',
    nome: 'ROE',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'rentabilidade_empresa',
    chave: 'roe',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.15, null]], neutro: [[0.1, 0.15]], atencao: [[0.05, 0.1]], ruim: [[null, 0.05]] },
    faixasInt: { bom: [[0.15, null]], neutro: [[0.1, 0.15]], atencao: [[0.05, 0.1]], ruim: [[null, 0.05]] },
    faixasPorSetor: {
      bancos: { bom: [[0.18, null]], neutro: [[0.13, 0.18]], atencao: [[0.1, 0.13]], ruim: [[null, 0.1]] },
      eletricas_utilities: { bom: [[0.13, null]], neutro: [[0.09, 0.13]], atencao: [[0.06, 0.09]], ruim: [[null, 0.06]] },
      saneamento: { bom: [[0.14, null]], neutro: [[0.09, 0.14]], atencao: [[0.06, 0.09]], ruim: [[null, 0.06]] },
    },
    peso: 3,
    eliminatorio: false,
    porQue: 'Raul (12:00): \'principal indicador de eficiência\'. Perini (17:00): comprando perto do VP, o ROE tende a virar sua rentabilidade de longo prazo; dois dígitos = muito bom. Suno: sólida > 10%, preferível > 15%.',
    armadilha: 'ROE alto por PL encolhido (recompras, prejuízos passados, alta alavancagem) — conferir DL/PL; lucro não recorrente',
    frases: { bom: 'ROE de {valor}: transforma bem o patrimônio em lucro{ref}.', neutro: 'ROE de {valor}: rentabilidade razoável{ref}.', ruim: 'ROE de {valor}: rentabilidade baixa{ref} - perde até para a renda fixa.' },
    fontes: [
      { titulo: 'Suno: ROE >10% sólido, >15% preferido', url: 'https://www.suno.com.br/artigos/os-indicadores-mais-importantes-em-uma-analise/' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (12:00)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (16:30)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
    ],
  },
  {
    id: 'roic',
    nome: 'ROIC',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'rentabilidade_empresa',
    chave: 'roic',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.15, null]], neutro: [[0.1, 0.15]], atencao: [[0.06, 0.1]], ruim: [[null, 0.06]] },
    faixasPorSetor: {
      eletricas_utilities: { bom: [[0.1, null]], neutro: [[0.07, 0.1]], atencao: [[0.05, 0.07]], ruim: [[null, 0.05]] },
      telecom_cabo: { bom: [[0.12, null]], neutro: [[0.08, 0.12]], atencao: [[0.05, 0.08]], ruim: [[null, 0.05]] },
    },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 3,
    eliminatorio: false,
    porQue: 'Não é inflado por alavancagem como o ROE. Suno: ROIC consistentemente > 10% e > WACC = criação de valor. Base da Fórmula Mágica.',
    armadilha: 'intensidade de capital muda a régua (telecom/siderurgia baixos, software altíssimo); ágio de aquisições reduz o ROIC contábil',
    frases: { bom: 'ROIC de {valor}: retorno alto sobre todo o capital investido{ref}.', neutro: 'ROIC de {valor}{ref}.', ruim: 'ROIC de {valor}: retorno baixo sobre o capital{ref} - crescer pode até destruir valor.' },
    fontes: [
      { titulo: 'Suno: ROIC > 10% e > WACC', url: 'https://www.suno.com.br/artigos/o-que-roic/' },
      { titulo: 'Damodaran (NYU): EUA jan/2026: mercado 9,8%; utility 6%; telecom 12%; E&P 13,8%; softw…', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/mgnroc.html' },
    ],
  },
  {
    id: 'roa',
    nome: 'ROA',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'rentabilidade_empresa',
    chave: 'roa',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.08, null]], neutro: [[0.04, 0.08]], atencao: [[0.01, 0.04]], ruim: [[null, 0.01]] },
    faixasPorSetor: {
      bancos: { bom: [[0.015, null]], neutro: [[0.01, 0.015]], atencao: [[0.006, 0.01]], ruim: [[null, 0.006]] },
      seguradoras: { bom: [[0.03, null]], neutro: [[0.02, 0.03]], atencao: [[0.01, 0.02]], ruim: [[null, 0.01]] },
    },
    peso: 1,
    eliminatorio: false,
    porQue: 'Mostra eficiência sem o efeito da alavancagem; essencial para bancos (onde o ativo é a carteira de crédito). Raul (12:00) cita como complemento do ROE.',
    armadilha: 'setores de ativo pesado têm ROA estruturalmente baixo',
    frases: { bom: 'ROA de {valor}: bom lucro sobre os ativos{ref}.', neutro: 'ROA de {valor}{ref}.', ruim: 'ROA de {valor}: lucro baixo para o tamanho dos ativos{ref}.' },
    fontes: [
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (12:00)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'margem_bruta',
    nome: 'Margem bruta',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'rentabilidade_empresa',
    chave: 'margemBruta',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.4, null]], neutro: [[0.25, 0.4]], atencao: [[0.15, 0.25]], ruim: [[null, 0.15]] },
    faixasPorSetor: {
      varejo: { bom: [[0.33, null]], neutro: [[0.25, 0.33]], atencao: [[0.18, 0.25]], ruim: [[null, 0.18]] },
      tecnologia_crescimento: { bom: [[0.7, null]], neutro: [[0.55, 0.7]], atencao: [[0.4, 0.55]], ruim: [[null, 0.4]] },
    },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 1,
    eliminatorio: false,
    porQue: 'Indica poder de preço e diferenciação (moat). Margem bruta alta e estável é marca de vantagem competitiva (Buffett, Leo 26:52).',
    armadilha: 'setores de commodity e varejo têm margem bruta naturalmente baixa; mudança de mix/contabilização (custos de frete) altera comparabilidade',
    frases: { bom: 'Margem bruta de {valor}{ref}: sobra bastante depois do custo do produto.', neutro: 'Margem bruta de {valor}{ref}.', ruim: 'Margem bruta de {valor}{ref}: pouco espaço depois do custo.' },
    fontes: [
      { titulo: 'Damodaran (NYU): margem bruta EUA jan/2026: mercado 37,8%; software 71,7%; varejo 33%', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/margin.html' },
    ],
  },
  {
    id: 'margem_ebitda',
    nome: 'Margem EBITDA',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'rentabilidade_empresa',
    chave: 'margemEbitda',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.25, null]], neutro: [[0.15, 0.25]], atencao: [[0.08, 0.15]], ruim: [[null, 0.08]] },
    faixasPorSetor: {
      eletricas_utilities: { bom: [[0.4, null]], neutro: [[0.3, 0.4]], atencao: [[0.2, 0.3]], ruim: [[null, 0.2]] },
      saneamento: { bom: [[0.4, null]], neutro: [[0.3, 0.4]], atencao: [[0.2, 0.3]], ruim: [[null, 0.2]] },
      varejo: { bom: [[0.1, null]], neutro: [[0.06, 0.1]], atencao: [[0.03, 0.06]], ruim: [[null, 0.03]] },
    },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 1,
    eliminatorio: false,
    porQue: 'Base do endividamento (DL/EBITDA) e comparável entre países/estruturas de capital.',
    armadilha: 'EBITDA \'ajustado\' pode excluir custos recorrentes; não mostra capex',
    frases: { bom: 'Margem EBITDA de {valor}{ref}: operação eficiente.', neutro: 'Margem EBITDA de {valor}{ref}.', ruim: 'Margem EBITDA de {valor}{ref}: operação apertada.' },
    fontes: [
      { titulo: 'Damodaran (NYU): EBITDA/receita EUA jan/2026: mercado 16,6%; utility 35%; água 46%; E&…', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/margin.html' },
    ],
  },
  {
    id: 'margem_liquida',
    nome: 'Margem líquida',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'rentabilidade_empresa',
    chave: 'margemLiquida',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.15, null]], neutro: [[0.08, 0.15]], atencao: [[0.03, 0.08]], ruim: [[null, 0.03]] },
    faixasPorSetor: {
      varejo: { bom: [[0.06, null]], neutro: [[0.03, 0.06]], atencao: [[0.01, 0.03]], ruim: [[null, 0.01]] },
      tecnologia_crescimento: { bom: [[0.2, null]], neutro: [[0.1, 0.2]], atencao: [[0.0, 0.1]], ruim: [[null, 0.0]] },
      saneamento: { bom: [[0.2, null]], neutro: [[0.12, 0.2]], atencao: [[0.06, 0.12]], ruim: [[null, 0.06]] },
    },
    naoAplicaA: ['bancos'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Mostra quanto de cada real vendido vira lucro - indicador de eficiência que depende muito do setor (bolsa e software altas; varejo baixa). Compare com pares.',
    armadilha: 'varejo opera com margem de 1 dígito (normal); margem pontualmente alta por evento não recorrente',
    frases: { bom: 'Margem líquida de {valor}{ref}: boa parte da receita vira lucro.', neutro: 'Margem líquida de {valor}{ref}.', ruim: 'Margem líquida de {valor}{ref}: pouco da receita vira lucro.' },
    fontes: [
      { titulo: 'Suno: margem líquida > 10%', url: 'https://www.suno.com.br/artigos/os-indicadores-mais-importantes-em-uma-analise/' },
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (13:30)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (10:00)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'lucro_positivo_consistente',
    nome: 'Anos com lucro (de 5)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'rentabilidade_empresa',
    chave: 'anosComLucro',
    unidade: 'anos',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[5, null]], neutro: [[4, 5]], atencao: [[3, 4]], ruim: [[null, 3]] },
    peso: 3,
    eliminatorio: true,
    porQue: 'Raul (01:31–04:00): a única certeza que o investidor precisa é se a empresa vai continuar lucrativa; empresas sem lucro \'hoje estão fora da bolsa\'.',
    armadilha: 'turnarounds (Lynch) passam por prejuízo — exige tese específica',
    frases: { bom: 'Lucro em {valor} dos últimos 5: consistente.', neutro: 'Lucro em {valor} dos últimos 5.', ruim: 'Lucro em só {valor} dos últimos 5: resultado instável.' },
    fontes: [
      { titulo: 'Suno: “Luiz Barsi explica quais os principais indicadores utiliza…” (02:00)', url: 'https://www.youtube.com/watch?v=Gr9Iyvlo69k' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (01:31)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'divida_liquida_ebitda',
    nome: 'Dívida líquida ÷ EBITDA',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'endividamento',
    chave: 'dividaLiquidaEbitda',
    unidade: 'x',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, 1.0]], neutro: [[1.0, 2.0]], atencao: [[2.0, 3.5]], ruim: [[3.5, null]] },
    faixasPorSetor: {
      eletricas_utilities: { bom: [[null, 2.5]], neutro: [[2.5, 3.5]], atencao: [[3.5, 4.5]], ruim: [[4.5, null]] },
      saneamento: { bom: [[null, 2.0]], neutro: [[2.0, 3.0]], atencao: [[3.0, 4.0]], ruim: [[4.0, null]] },
      telecom_cabo: { bom: [[null, 2.5]], neutro: [[2.5, 3.5]], atencao: [[3.5, 4.5]], ruim: [[4.5, null]] },
      commodities_ciclicas: { bom: [[null, 0.5]], neutro: [[0.5, 1.5]], atencao: [[1.5, 2.5]], ruim: [[2.5, null]] },
    },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 3,
    eliminatorio: true,
    porQue: 'Suno: ideal até 2x, aceitável até 3,5x. Leo (13:13): acima de 3x \'tem que olhar com cuidado\'. Raul (09:31): olhar a dívida em relação à capacidade de gerar caixa, não o valor absoluto.',
    armadilha: 'comparar com pares (telecom e utilities são estruturalmente endividadas — Leo 15:32); EBITDA de pico (commodities) esconde alavancagem',
    frases: { bom: 'Dívida líquida de {valor} o EBITDA{ref}: endividamento confortável.', neutro: 'Dívida líquida de {valor} o EBITDA{ref}: sob controle.', ruim: 'Dívida líquida de {valor} o EBITDA{ref}: alavancada - juros altos pesam.' },
    fontes: [
      { titulo: 'Suno: ideal até 2x, máximo aceitável 3,5x', url: 'https://www.suno.com.br/artigos/divida-liquida/' },
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (13:13)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (09:31)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'divida_liquida_pl',
    nome: 'Dívida líquida ÷ patrimônio',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'endividamento',
    chave: 'dividaLiquidaPl',
    unidade: 'x',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 0.5]], neutro: [[0.5, 1.0]], atencao: [[1.0, 2.0]], ruim: [[2.0, null]] },
    faixasPorSetor: {
      eletricas_utilities: { bom: [[null, 0.8]], neutro: [[0.8, 1.5]], atencao: [[1.5, 2.5]], ruim: [[2.5, null]] },
    },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Suno: precisa ficar abaixo de 100%, de preferência abaixo de 50%. Complementa o DL/EBITDA e desmascara ROE inflado por alavancagem.',
    armadilha: 'PL negativo → \'ruim\' automaticamente; empresas asset-light com PL pequeno (recompras) distorcem',
    frases: { bom: 'Dívida líquida de {valor} o patrimônio: estrutura leve.', neutro: 'Dívida líquida de {valor} o patrimônio.', ruim: 'Dívida líquida de {valor} o patrimônio: mais dívida que capital próprio.' },
    fontes: [
      { titulo: 'Suno: DL/PL < 100%, ideal < 50%', url: 'https://www.suno.com.br/artigos/os-indicadores-mais-importantes-em-uma-analise/' },
    ],
  },
  {
    id: 'liquidez_corrente',
    nome: 'Liquidez corrente',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'endividamento',
    chave: 'liquidezCorrente',
    unidade: 'x',
    casas: 2,
    direcao: 'maior',
    faixas: { bom: [[1.5, null]], neutro: [[1.0, 1.5]], atencao: [[0.8, 1.0]], ruim: [[null, 0.8]] },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 1,
    eliminatorio: false,
    porQue: 'Capacidade de honrar obrigações de 12 meses. Raul (07:31) cita como \'mais avançado\'; Leo (11:18) enfatiza o caixa como colchão para anos ruins.',
    armadilha: 'varejo/utilities com recebimento rápido operam < 1 sem problema; não se aplica a bancos',
    frases: { bom: 'Liquidez corrente de {valor}: cobre bem as contas de curto prazo.', neutro: 'Liquidez corrente de {valor}.', ruim: 'Liquidez corrente de {valor}: o curto prazo está apertado.' },
    fontes: [
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (07:31)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (11:18)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'cobertura_juros',
    nome: 'Cobertura de juros (EBIT ÷ juros)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'endividamento',
    chave: 'coberturaJuros',
    unidade: 'x',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[5, null]], neutro: [[3, 5]], atencao: [[1.5, 3]], ruim: [[null, 1.5]] },
    naoAplicaA: ['bancos', 'seguradoras'],
    peso: 2,
    eliminatorio: true,
    porQue: 'Mede o risco de a dívida \'engolir\' o lucro — crucial com juros altos (Selic). Damodaran: ≥ 8,5 ≈ AAA; 3–4,25 ≈ A−; 1,25–1,5 ≈ B−; < 1,25 ≈ CCC.',
    armadilha: 'despesa financeira BR inclui variação cambial/derivativos — usar só juros quando possível',
    frases: { bom: 'O lucro operacional paga {valor} os juros: folga confortável.', neutro: 'O lucro operacional paga {valor} os juros.', ruim: 'O lucro operacional paga só {valor} os juros: risco se o juro subir.' },
    fontes: [
      { titulo: 'Suno: EBIT ÷ juros; quanto maior melhor', url: 'https://www.suno.com.br/artigos/indice-de-cobertura/' },
      { titulo: 'Damodaran (NYU): tabela cobertura → rating sintético (jan/2026)', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ratings.html' },
    ],
  },
  {
    id: 'basileia',
    nome: 'Índice de Basileia',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'setorial_bancos',
    chave: 'basileia',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.15, null]], neutro: [[0.13, 0.15]], atencao: [[0.115, 0.13]], ruim: [[null, 0.115]] },
    faixasInt: { bom: [[0.14, null]], neutro: [[0.12, 0.14]], atencao: [[0.105, 0.12]], ruim: [[null, 0.105]] },
    aplicaA: ['bancos'],
    peso: 3,
    eliminatorio: true,
    porQue: 'Folga de capital limita risco de quebra e define quanto o banco pode crescer e distribuir. BR (Res. CMN 4.958): PR mínimo 8% + adicional de conservação 2,5% (+ até 2% sistêmico, 1% para os grandes) → piso efetivo ~10,5–11,5%. EUA…',
    armadilha: 'índice alto por crescer pouco (banco parado) também não é ótimo; capital de qualidade importa — ver CET1',
    frases: { bom: 'Basileia de {valor}: banco bem capitalizado.', neutro: 'Basileia de {valor}: dentro do exigido, sem muita folga.', ruim: 'Basileia de {valor}: perto do mínimo regulatório - pode ter de reter lucro ou emitir ações.' },
    fontes: [
      { titulo: 'Suno: conceito; Itaú mira 13,5% de capital principal', url: 'https://www.suno.com.br/artigos/indice-de-basileia/' },
      { titulo: 'Banco Central: mínimos regulatórios BR', url: 'https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20CMN&numero=4958' },
      { titulo: 'FDIC: EUA well-capitalized ≥10% total, ≥8% Tier 1, ≥6,5% CET1', url: 'https://www.fdic.gov/resources/supervision-and-examinations/examination-policies-manual/section2-1.pdf' },
    ],
  },
  {
    id: 'indice_eficiencia',
    nome: 'Índice de eficiência (bancos)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'setorial_bancos',
    chave: 'indiceEficiencia',
    unidade: '%',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, 0.45]], neutro: [[0.45, 0.55]], atencao: [[0.55, 0.65]], ruim: [[0.65, null]] },
    aplicaA: ['bancos'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Quanto menor, mais da receita sobra como lucro. Suno: típicos 50–70%; os melhores bancos BR e regionais EUA eficientes ficam 35–45%.',
    armadilha: 'comparar metodologia (cada banco calcula diferente); tendência importa mais que nível',
    frases: { bom: 'Índice de eficiência de {valor}: custos baixos para o que o banco fatura.', neutro: 'Índice de eficiência de {valor}.', ruim: 'Índice de eficiência de {valor}: custo alto para o que fatura.' },
    fontes: [
      { titulo: 'Suno: fórmula e faixa típica 50–70%', url: 'https://www.suno.com.br/artigos/indice-de-eficiencia/' },
    ],
  },
  {
    id: 'indice_combinado',
    nome: 'Índice combinado (seguradoras)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'setorial_seguradoras',
    chave: 'indiceCombinado',
    unidade: '%',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, 0.9]], neutro: [[0.9, 0.97]], atencao: [[0.97, 1.0]], ruim: [[1.0, null]] },
    aplicaA: ['seguradoras'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Abaixo de 100% a operação de seguros dá lucro antes do resultado financeiro.',
    armadilha: 'Seguradoras brasileiras dependem muito do resultado financeiro (Selic): o lucro cai quando os juros caem; em holdings de seguros, olhe o índice das operadas.',
    frases: { bom: 'Índice combinado de {valor}: a operação de seguros dá lucro.', neutro: 'Índice combinado de {valor}: margem pequena na operação.', ruim: 'Índice combinado de {valor}: a operação de seguros perde dinheiro (depende do financeiro).' },
    fontes: [
      { titulo: 'Investopedia: combined ratio (índice combinado)', url: 'https://www.investopedia.com/terms/c/combinedratio.asp' },
      { titulo: 'Suno: sinistralidade', url: 'https://www.suno.com.br/artigos/sinistralidade/' },
    ],
  },
  {
    id: 'regra_dos_40',
    nome: 'Regra dos 40 (crescimento + margem de caixa)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'setorial_tecnologia',
    chave: 'regra40',
    unidade: 'pp',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[0.4, null]], neutro: [[0.3, 0.4]], atencao: [[0.2, 0.3]], ruim: [[null, 0.2]] },
    aplicaA: ['tecnologia_crescimento'],
    peso: 2,
    eliminatorio: false,
    porQue: 'Em empresas de crescimento, P/L e DY não funcionam; a soma crescimento + margem mostra se o crescimento é \'saudável\'.',
    armadilha: 'crescimento por aquisição infla o número',
    frases: { bom: 'Crescimento + margem de caixa = {valor}: passa na regra dos 40 de tecnologia.', neutro: 'Crescimento + margem de caixa = {valor}: perto da regra dos 40.', ruim: 'Crescimento + margem de caixa = {valor}: abaixo da regra dos 40.' },
    fontes: [
      { titulo: 'Investopedia: rule of 40 (software)', url: 'https://www.investopedia.com/rule-of-40-8382413' },
    ],
  },
  {
    id: 'cagr_receita_5a',
    nome: 'Crescimento da receita (5 anos, a.a.)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'crescimento',
    chave: 'cagrReceita5a',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.1, null]], neutro: [[0.06, 0.1]], atencao: [[0.03, 0.06]], ruim: [[null, 0.03]] },
    faixasInt: { bom: [[0.08, null]], neutro: [[0.04, 0.08]], atencao: [[0.0, 0.04]], ruim: [[null, 0.0]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Perini (09:01): crescimento abaixo da inflação = encolher em termos reais (VIVT3 1,37% a.a.). Leo (07:12): receita é a base de tudo e deve crescer pelo menos a inflação.',
    armadilha: 'aquisições inflam o CAGR; base deprimida (pandemia) distorce',
    frases: { bom: 'Receita cresceu {valor} ao ano em 5 anos.', neutro: 'Receita cresceu {valor} ao ano em 5 anos.', ruim: 'Receita cresceu só {valor} ao ano em 5 anos - perto ou abaixo da inflação.' },
    fontes: [
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (09:01)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (07:12)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (12:31)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'cagr_lucro_5a',
    nome: 'Crescimento do lucro (5 anos, a.a.)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'crescimento',
    chave: 'cagrLucro5a',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.12, null]], neutro: [[0.06, 0.12]], atencao: [[0.0, 0.06]], ruim: [[null, 0.0]] },
    faixasInt: { bom: [[0.1, null]], neutro: [[0.05, 0.1]], atencao: [[0.0, 0.05]], ruim: [[null, 0.0]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Raul (12:31): \'não adianta nada crescer receita e não crescer lucro\'. B3 lucro +16,5% a.a. (Perini).',
    armadilha: 'lucro base negativo ou muito baixo torna o CAGR sem sentido; preferir CAGR de LPA (desconta diluição)',
    frases: { bom: 'Lucro cresceu {valor} ao ano em 5 anos.', neutro: 'Lucro cresceu {valor} ao ano em 5 anos.', ruim: 'Lucro variou {valor} ao ano em 5 anos: sem crescimento real.' },
    fontes: [
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (12:31)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (12:02)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (08:34)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'lucro_vs_receita',
    nome: 'Lucro cresce mais que a receita?',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'crescimento',
    chave: 'lucroVsReceita',
    unidade: 'pp',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.02, null]], neutro: [[-0.02, 0.02]], atencao: [[-0.06, -0.02]], ruim: [[null, -0.06]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Lucro crescendo mais que a receita = ganho de margem/eficiência (Leo 09:05); o contrário = custos fora de controle ou concorrência.',
    armadilha: '',
    frases: { bom: 'O lucro cresce {valorAbs} ao ano acima da receita: ganho de eficiência.', neutro: 'Lucro e receita crescem no mesmo ritmo.', ruim: 'O lucro cresce {valorAbs} ao ano a menos que a receita: margens encolhendo.' },
    fontes: [
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (09:05)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'segmento_listagem_b3',
    nome: 'Segmento de listagem (B3)',
    classes: ['acoes_br'],
    grupo: 'governanca',
    chave: 'pontosListagem',
    unidade: 'pontos',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[3, null]], neutro: [[2, 3]], atencao: [[1, 2]], ruim: [[null, 1]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Perini (08:32): ver se a empresa está no Novo Mercado — maior respeito ao minoritário (só ações ON, tag along 100%, free float mínimo, conselho com independentes).',
    armadilha: 'Novo Mercado não impede má gestão; estatais podem ter governança regulada por lei própria',
    frases: { bom: 'Listada no Novo Mercado: o nível mais alto de governança da B3.', neutro: 'Listada no Nível 2 da B3: boa governança, com ações preferenciais.', ruim: 'Segmento de listagem básico na B3: menos proteção ao minoritário.' },
    fontes: [
      { titulo: 'Suno', url: 'https://www.suno.com.br/artigos/novo-mercado/' },
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (08:32)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
    ],
  },
  {
    id: 'tag_along',
    nome: 'Tag along',
    classes: ['acoes_br'],
    grupo: 'governanca',
    chave: 'tagAlong',
    unidade: '%',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[1.0, null]], neutro: [[0.8, 1.0]], atencao: [[0.01, 0.8]], ruim: [[null, 0.01]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Protege o minoritário numa troca de controle; PN sem tag along recebe em troca prioridade/10% a mais de dividendo.',
    armadilha: 'Ação preferencial sem tag along pode ser escolha racional de quem foca em dividendos - não elimine só por isso.',
    frases: { bom: 'Tag along de {valor}: numa venda do controle, você recebe o mesmo que o controlador.', neutro: 'Tag along de {valor}.', ruim: 'Tag along de {valor}: pouca proteção se o controle for vendido.' },
    fontes: [
      { titulo: 'Suno', url: 'https://www.suno.com.br/artigos/tag-along/' },
      { titulo: 'Suno: tag along 100% Novo Mercado; mínimo legal 80% ON', url: 'https://www.suno.com.br/artigos/free-float/' },
    ],
  },
  {
    id: 'free_float',
    nome: 'Free float',
    classes: ['acoes_br'],
    grupo: 'governanca',
    chave: 'freeFloat',
    unidade: '%',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[0.4, null]], neutro: [[0.25, 0.4]], atencao: [[0.15, 0.25]], ruim: [[null, 0.15]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Novo Mercado exige ≥ 25% (ou 15% com volume). Free float baixo → liquidez baixa e menos poder do minoritário.',
    armadilha: 'controlador forte com free float baixo pode ser alinhado (Barsi valoriza controlador comprometido)',
    frases: { bom: '{valor} das ações estão em circulação: boa base de minoritários.', neutro: '{valor} das ações em circulação.', ruim: 'Só {valor} das ações em circulação: controle muito concentrado.' },
    fontes: [
      { titulo: 'Suno: mínimo 25% no Novo Mercado', url: 'https://www.suno.com.br/artigos/free-float/' },
    ],
  },
  {
    id: 'controle_estatal',
    nome: 'Controle estatal',
    classes: ['acoes_br'],
    grupo: 'governanca',
    chave: 'estatalNum',
    unidade: 'bool',
    casas: 0,
    direcao: 'faixa',
    faixas: { bom: [], neutro: [[null, 1]], atencao: [[1, null]], ruim: [] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Raul (09:01–09:31): estatais negociam com desconto porque podem ser usadas de forma populista (tarifa, crédito); \'seguras, mas o mercado não gosta\'. Perini (24:30): BB barato por risco eleitoral.',
    armadilha: 'desconto pode ser oportunidade (Barsi tem BB há 51 anos) — não é eliminatório; risco aumenta em ano eleitoral',
    frases: { bom: 'Controle privado.', neutro: 'Controle privado.', atencao: 'Estatal: risco de interferência política (preço, dividendos, investimentos) - exija margem de segurança maior.', ruim: 'Estatal: risco de interferência política - exija margem maior.' },
    fontes: [
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (09:01)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (24:30)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
    ],
  },
  {
    id: 'setor_perene_best',
    nome: 'Setor perene (BEST de Barsi)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'qualidade',
    chave: 'setorPerene',
    unidade: 'pontos',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[3, null]], neutro: [[2, 3]], atencao: [[1, 2]], ruim: [[null, 1]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Barsi (01:01): o setor e o posicionamento da empresa no setor (ex.: papel de embalagem dificilmente será substituído). Metodologia de dividendos: setores perenes geram renda estável. Leo (02:00): evitar setor em declínio (ex. tab…',
    armadilha: 'setor perene não garante empresa boa (Sago: qualidade continua decisiva); telecom/energia têm alta necessidade de capex',
    frases: { bom: 'Setor perene da lista BEST de Barsi (bancos, energia, saneamento, seguros, telecom).', neutro: 'Setor fora da lista BEST, mas sem ciclo forte.', ruim: 'Setor cíclico: lucro e dividendos oscilam com o ciclo.' },
    fontes: [
      { titulo: 'Suno: “Luiz Barsi explica quais os principais indicadores utiliza…” (01:01)', url: 'https://www.youtube.com/watch?v=Gr9Iyvlo69k' },
      { titulo: 'Suno: financeiro, saúde e materiais básicos como perenes', url: 'https://www.suno.com.br/noticias/confira-os-tres-setores-mais-perenes-da-bolsa-de-valores/' },
      { titulo: 'Leo Fittipaldi: “Como analisar uma ação na bolsa americana DO ZERO!” (02:00)', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' },
    ],
  },
  {
    id: 'liquidez_diaria',
    nome: 'Liquidez diária',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'liquidez_risco',
    chave: 'volumeMedio2m',
    unidade: 'R$',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[20000000, null]], neutro: [[5000000, 20000000]], atencao: [[1000000, 5000000]], ruim: [[null, 1000000]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Baixa liquidez aumenta spread e dificulta sair; regra prática: posição ≤ 1% do volume diário.',
    armadilha: 'ADR de balcão (OTC) tem volume baixo nos EUA, mas a ação principal pode ser líquida na bolsa de origem - avalie as duas.',
    frases: { bom: 'Negocia {valor} por dia: entra e sai fácil.', neutro: 'Negocia {valor} por dia.', ruim: 'Negocia só {valor} por dia: pouca liquidez, preço pode pular.' },
    fontes: [
      { titulo: 'Fundamentus: campo Vol $ méd (2m)', url: 'https://www.fundamentus.com.br/detalhes.php?papel=SAPR4' },
    ],
  },
  {
    id: 'beta',
    nome: 'Beta',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'liquidez_risco',
    chave: 'beta',
    unidade: 'num',
    casas: 2,
    direcao: 'faixa',
    faixas: { bom: [[0.6, 1.0]], neutro: [[null, 0.6], [1.0, 1.3]], atencao: [[1.3, 1.6]], ruim: [[1.6, null]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Informativo de risco: carteira de renda/BEST tende a beta < 1. Não é critério de qualidade.',
    armadilha: 'beta baixo por baixa liquidez é falso conforto',
    frases: { bom: 'Beta de {valor}: oscila menos que o índice{indice}, mas acompanha o mercado.', neutro: 'Beta de {valor} em relação ao índice{indice}.', ruim: 'Beta de {valor}: oscila bem mais que o índice{indice}.' },
    fontes: [
      { titulo: 'Suno: o que é o beta de uma ação', url: 'https://www.suno.com.br/artigos/beta/' },
    ],
  },
  {
    id: 'volatilidade_anual',
    nome: 'Volatilidade (12 meses)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'liquidez_risco',
    chave: 'volatilidade',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 0.25]], neutro: [[0.25, 0.35]], atencao: [[0.35, 0.5]], ruim: [[0.5, null]] },
    faixasInt: { bom: [[null, 0.2]], neutro: [[0.2, 0.3]], atencao: [[0.3, 0.45]], ruim: [[0.45, null]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Ajuda a dimensionar posição e a calibrar expectativa de oscilação.',
    armadilha: 'volatilidade alta ≠ empresa ruim; é sinal para posição menor',
    frases: { bom: 'Volatilidade de {valor} ao ano: ação calma.', neutro: 'Volatilidade de {valor} ao ano.', ruim: 'Volatilidade de {valor} ao ano: oscila muito.' },
    fontes: [
      { titulo: 'Suno: volatilidade', url: 'https://www.suno.com.br/artigos/volatilidade/' },
    ],
  },
  {
    id: 'max_drawdown_3a',
    nome: 'Maior queda (até 3 anos)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'liquidez_risco',
    chave: 'drawdownMax3a',
    unidade: '%',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[-0.25, null]], neutro: [[-0.4, -0.25]], atencao: [[-0.6, -0.4]], ruim: [[null, -0.6]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Mede quanto já doeu segurar o ativo; ajuda a saber se a tese aguenta estresse.',
    armadilha: '',
    frases: { bom: 'Maior queda do topo no período: {valorAbs}.', neutro: 'Maior queda do topo no período: {valorAbs}.', ruim: 'Já caiu {valorAbs} do topo no período: prepare o estômago.' },
    fontes: [
      { titulo: 'Suno: drawdown', url: 'https://www.suno.com.br/artigos/drawdown/' },
    ],
  },
  {
    id: 'drawdown_atual',
    nome: 'Distância da máxima (12 meses)',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'valuation',
    chave: 'drawdownAtual',
    unidade: '%',
    casas: 0,
    direcao: 'faixa',
    faixas: { bom: [[-0.35, -0.15]], neutro: [[-0.15, -0.05], [-0.5, -0.35]], atencao: [[-0.05, null]], ruim: [[null, -0.5]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Combinado com fundamentos, indica janela de compra (−15% a −35%); queda > 50% exige investigar deterioração.',
    armadilha: 'ver \'queda_com_fundamentos_intactos\'',
    frases: { bom: '{valorAbs} abaixo da máxima de 12 meses: queda que pode ser oportunidade, se os fundamentos seguem.', neutro: '{valorAbs} abaixo da máxima de 12 meses.', atencao: 'Perto da máxima de 12 meses ({valorAbs} abaixo): sem desconto pela queda.', ruim: '{valorAbs} abaixo da máxima de 12 meses: queda forte - entenda o motivo antes.' },
    fontes: [
      { titulo: 'Bruno Perini - Você MAIS Rico: “COMO ANALISAR UMA AÇÃO | 5 indicadores para investir em açõ…” (01:31)', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' },
    ],
  },
  {
    id: 'peso_na_carteira',
    nome: 'Peso na sua carteira',
    classes: ['acoes_br', 'acoes_int'],
    grupo: 'liquidez_risco',
    chave: 'pesoCarteira',
    unidade: '%',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, 0.1]], neutro: [[0.1, 0.15]], atencao: [[0.15, 0.2]], ruim: [[0.2, null]] },
    faixasInt: { bom: [[null, 0.15]], neutro: [[0.15, 0.2]], atencao: [[0.2, 0.25]], ruim: [[0.25, null]] },
    peso: 2,
    eliminatorio: false,
    informativo: true,
    porQue: 'Concentração aumenta o risco idiossincrático; Raul (14:00): a montagem da carteira (exposição a setor público, países) é parte da decisão.',
    armadilha: 'O % desejado por ativo (Radar) é a régua principal; este limite serve de teto contra concentração.',
    frases: { bom: 'Pesa {valor} na sua carteira: sem concentração.', neutro: 'Pesa {valor} na sua carteira.', ruim: 'Pesa {valor} na sua carteira: concentrado - mais aporte aumenta o risco nele.' },
    fontes: [
      { titulo: 'Investidor Sardinha l Raul Sena: “Como analisar ações de maneira simples e rápida?” (14:00)', url: 'https://www.youtube.com/watch?v=bkcMlHEtXsI' },
    ],
  },
  {
    id: 'local_negociacao',
    nome: 'Onde negocia (EUA)',
    classes: ['acoes_int'],
    grupo: 'internacional',
    chave: 'pontosBolsa',
    unidade: 'pontos',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[3, null]], neutro: [[2, 3]], atencao: [[1, 2]], ruim: [[null, 1]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'ADR nível 1 de balcão (OTC) não entrega à SEC os relatórios completos, tem menos liquidez e spread maior; ação ou ADR listado na NYSE/Nasdaq segue as regras da SEC.',
    armadilha: 'OTC não é \'ruim\' por si — muitas blue chips europeias/asiáticas só têm ADR nível 1; o risco é informação e liquidez; taxa de custódia do ADR (US$ 0,01–0,05 por ADR/ano) é descontada de dividendos ou…',
    frases: { bom: 'Negociada em bolsa principal dos EUA (NYSE/Nasdaq): regras de divulgação da SEC.', neutro: 'Negociada fora das bolsas principais, com programa de ADR.', ruim: 'Negociada no balcão (OTC) sem ADR patrocinado: menos informação e liquidez.' },
    fontes: [
      { titulo: 'Suno: ADR e níveis', url: 'https://www.suno.com.br/artigos/adr/' },
      { titulo: 'Suno: OTC: menos exigência de divulgação e liquidez', url: 'https://www.suno.com.br/artigos/otc/' },
    ],
  },
]);
// </criterios gerados>

// ---------------------------------------------------------------------------
// Regras de combinação (pesquisa: regras_combinacao). Cada uma recebe o
// contexto do motor - r(id) = resultado do critério ({ valor, tom }) ou null,
// v(chave) = valor (já com derivados), setor, classeBase, referencias,
// fmt(valor, unidade, casas), dinheiro(valor) - e usa:
//   ajustar(id, tom, texto)   - muda a leitura de um critério (ex.: P/VP
//                               baixo com ROE ruim deixa de ser "bom")
//   ponto({ id, nome, tom, texto, peso, grupo, fonte })
//                             - uma leitura nova (conta na nota com o peso)
// ---------------------------------------------------------------------------

const SUNO_PVP = { titulo: 'Luiz Barsi (Suno): indicadores que usa', url: 'https://www.youtube.com/watch?v=Gr9Iyvlo69k' };
const SUNO_BAZIN = { titulo: 'Suno: método Décio Bazin', url: 'https://www.suno.com.br/tudo-sobre/decio-bazin/' };
const SUNO_PRECO_JUSTO = { titulo: 'Suno: preço justo (Graham)', url: 'https://www.suno.com.br/artigos/preco-justo/' };
const SUNO_PAYOUT = { titulo: 'Suno: payout', url: 'https://www.suno.com.br/artigos/payout/' };
const SUNO_DY = { titulo: 'Suno: dividend yield', url: 'https://www.suno.com.br/guias/dividend-yield/' };
const SUNO_PERENES = { titulo: 'Suno: setores perenes da bolsa', url: 'https://www.suno.com.br/noticias/confira-os-tres-setores-mais-perenes-da-bolsa-de-valores/' };
const SUNO_MARGEM = { titulo: 'Suno: margem de segurança', url: 'https://www.suno.com.br/artigos/a-importancia-da-margem-de-seguranca/' };
const PERINI = { titulo: 'Bruno Perini: 5 indicadores para investir em ações', url: 'https://www.youtube.com/watch?v=WXtJxRozku0' };
const LEO = { titulo: 'Leo Fittipaldi: analisar ação americana do zero', url: 'https://www.youtube.com/watch?v=pgbQzPBDuiM' };

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export const REGRAS_ACOES = Object.freeze([
  function pvpBaixoComRoe(c) {
    const pvp = c.v('pvp'); const roe = c.v('roe');
    if (pvp == null || roe == null || !(pvp > 0) || pvp >= 1) return;
    const minimo = c.setor === 'bancos' ? 0.13 : 0.10;
    if (roe >= minimo) {
      c.ponto({ id: 'combo_pvp_baixo_roe', nome: 'P/VP abaixo de 1 com ROE bom', tom: 'bom', peso: 2, grupo: 'valuation', fonte: SUNO_PVP,
        texto: `P/VP de ${c.fmt(pvp, 'x', 2)} com ROE de ${c.fmt(roe, '%', 1)}: paga menos que o patrimônio por uma empresa que rende bem - o "critério da oportunidade" de Barsi.` });
    } else if (roe < 0.08) {
      c.ajustar('pvp', 'atencao', `P/VP de ${c.fmt(pvp, 'x', 2)} parece barato, mas o ROE de ${c.fmt(roe, '%', 1)} explica o desconto - possível armadilha de valor.`);
    }
  },
  function pvpAltoComRoeAlto(c) {
    const pvp = c.v('pvp'); const roe = c.v('roe'); const r = c.r('pvp');
    if (!r || pvp == null || roe == null || pvp <= 2 || roe < 0.20 || (r.tom !== 'atencao' && r.tom !== 'ruim')) return;
    c.ajustar('pvp', 'neutro', `P/VP de ${c.fmt(pvp, 'x', 2)} é alto, mas o ROE de ${c.fmt(roe, '%', 1)} justifica boa parte do prêmio (empresa que rende muito sobre o patrimônio).`);
  },
  function retornoImplicitoVsCdi(c) {
    const ey = c.v('earningsYield'); const cdi = c.referencias && c.referencias.cdi12m;
    if (ey == null || !(cdi > 0) || !(ey > 0)) return;
    const rf = cdi / 100;
    if (ey >= rf + 0.03) {
      c.ponto({ id: 'combo_retorno_implicito', nome: 'Lucro rende acima da renda fixa', tom: 'bom', peso: 2, grupo: 'valuation', fonte: PERINI,
        texto: `O lucro rende ${c.fmt(ey, '%', 1)} ao ano sobre o preço, ${c.fmt(ey - rf, 'pp', 1)} acima do CDI de 12 meses (${c.fmt(rf, '%', 1)}): prêmio pelo risco de ação.` });
    } else if (ey < rf) {
      c.ponto({ id: 'combo_retorno_implicito', nome: 'Lucro rende abaixo da renda fixa', tom: 'atencao', peso: 1.5, grupo: 'valuation', fonte: PERINI,
        texto: `O lucro rende ${c.fmt(ey, '%', 1)} ao ano sobre o preço, abaixo do CDI de 12 meses (${c.fmt(rf, '%', 1)}): o preço depende de crescimento futuro.` });
    }
  },
  function dyAltoArmadilha(c) {
    const dy = c.v('dy'); const r = c.r('dy_12m');
    if (!r || dy == null || dy <= 0.12) return;
    const motivos = [];
    if (c.v('payout') > 1) motivos.push(`payout de ${c.fmt(c.v('payout'), '%', 0)}`);
    if (c.v('cagrLucro5a') < 0) motivos.push('lucro caindo em 5 anos');
    if (c.v('drawdownAtual') < -0.30) motivos.push(`cotação ${c.fmt(-c.v('drawdownAtual'), '%', 0)} abaixo da máxima`);
    if (!motivos.length) return;
    c.ajustar('dy_12m', 'atencao', `DY de ${c.fmt(dy, '%', 1)} chama atenção, mas ${motivos.join(' e ')} - o provento pode não se repetir.`);
  },
  function dyBaixoPayoutAlto(c) {
    const dy = c.v('dy'); const payout = c.v('payout');
    if (dy == null || payout == null || !(dy > 0) || dy >= 0.04 || payout <= 0.7) return;
    c.ponto({ id: 'combo_dy_payout_baixo', nome: 'DY baixo mesmo distribuindo muito', tom: 'atencao', peso: 1, grupo: 'dividendos', fonte: SUNO_PAYOUT,
      texto: `DY de só ${c.fmt(dy, '%', 1)} mesmo distribuindo ${c.fmt(payout, '%', 0)} do lucro: o preço está esticado em relação ao lucro.` });
  },
  function dividendosSustentaveis(c) {
    const payout = c.v('payout'); const dl = c.v('dividaLiquidaEbitda'); const anos = c.v('anosPagandoDividendos');
    if (payout == null || dl == null || anos == null) return;
    const teto = c.setor === 'eletricas_utilities' || c.setor === 'seguradoras' ? 1.0 : 0.9;
    if (payout >= 0.3 && payout <= teto && dl <= 2.5 && anos >= 5) {
      c.ponto({ id: 'combo_dividendos_sustentaveis', nome: 'Dividendos sustentáveis', tom: 'bom', peso: 2, grupo: 'dividendos', fonte: SUNO_DY,
        texto: `Payout de ${c.fmt(payout, '%', 0)}, dívida de ${c.fmt(dl, 'x', 1)} o EBITDA e ${c.fmt(anos, 'anos', 0)} pagando: dividendo com cara de sustentável.` });
    }
  },
  function receitaSemLucro(c) {
    const rec = c.v('cagrReceita5a'); const luc = c.v('cagrLucro5a');
    if (rec == null || luc == null || rec < 0.08 || luc >= 0) return;
    c.ponto({ id: 'combo_receita_sem_lucro', nome: 'Receita cresce, lucro não', tom: 'atencao', peso: 1.5, grupo: 'crescimento', fonte: PERINI,
      texto: `A receita cresce ${c.fmt(rec, '%', 1)} ao ano, mas o lucro cai ${c.fmt(-luc, '%', 1)} ao ano: crescimento que não vira resultado.` });
  },
  function ciclicaNoPico(c) {
    const pl = c.v('pl'); const r = c.r('pl');
    if (c.setor !== 'commodities_ciclicas' || !r || pl == null || !(pl > 0) || pl >= 6 || r.tom !== 'bom') return;
    c.ajustar('pl', 'neutro', `P/L de ${c.fmt(pl, 'x', 1)} parece barato, mas em commodities/cíclicas o lucro de hoje pode ser o pico do ciclo - P/L baixo aqui não é sinônimo de pechincha.`);
  },
  function estatalExigeMargem(c) {
    const r = c.r('preco_vs_teto_planilha'); const x = c.v('precoSobreTeto');
    if (c.v('estatalNum') !== 1 || !r || r.tom !== 'bom' || x == null || x <= 0.8) return;
    c.ajustar('preco_vs_teto_planilha', 'neutro', `Estatal: pela regra da margem extra, só conta como barata com 20% ou mais abaixo do teto (hoje ${c.fmt(x, 'rel', 0)} do teto).`);
  },
  function tetoComposto(c) {
    const preco = c.v('precoAtual'); const pl = c.v('pl'); const pvp = c.v('pvp'); const dpa = c.v('dpa12m');
    if (!(preco > 0) || c.setor === 'tecnologia_crescimento') return;
    const tetos = [];
    const partes = [];
    if (dpa > 0) { const t = dpa / 0.06; tetos.push(t); partes.push(`Bazin ${c.dinheiro(t)}`); }
    if (pl > 0 && pvp > 0 && c.setor !== 'seguradoras') {
      const t = Math.sqrt(22.5 * (preco / pl) * (preco / pvp)); tetos.push(t); partes.push(`Graham ${c.dinheiro(t)}`);
    }
    if (tetos.length < 2) return;
    const teto = mediana(tetos);
    const margem = teto / preco - 1;
    const tom = margem >= 0.15 ? 'bom' : (margem >= 0 ? 'neutro' : 'atencao');
    c.ponto({ id: 'combo_teto_composto', nome: 'Preço justo composto (Bazin e Graham)', tom, peso: 2, grupo: 'valuation', fonte: SUNO_PRECO_JUSTO,
      texto: `Preço justo pela média de ${partes.join(' e ')}: ${c.dinheiro(teto)} - ${margem >= 0 ? `margem de ${c.fmt(margem, '%', 0)} sobre a cotação` : `cotação ${c.fmt(-margem / (1 + margem), '%', 0)} acima`}.` });
  },
  function checklistBarsi(c) {
    if (c.classeBase !== 'acoes_br') return;
    const itens = [
      ['P/VP até 1,5', c.v('pvp'), (x) => x > 0 && x <= 1.5],
      ['DY de 6% ou mais', c.v('dy'), (x) => x >= 0.06],
      ['setor perene', c.v('setorPerene'), (x) => x >= 3],
      ['10+ anos pagando', c.v('anosPagandoDividendos'), (x) => x >= 10],
      ['ROE de 10% ou mais', c.v('roe'), (x) => x >= 0.10],
    ].filter((i) => i[1] != null);
    if (itens.length < 4) return;
    const ok = itens.filter((i) => i[2](i[1]));
    const fracao = ok.length / itens.length;
    c.ponto({ id: 'combo_checklist_barsi', nome: 'Checklist de Barsi', tom: fracao >= 0.8 ? 'bom' : (fracao >= 0.6 ? 'neutro' : 'atencao'), peso: 1, grupo: 'qualidade', fonte: SUNO_PERENES,
      texto: `Checklist de Barsi: ${ok.length} de ${itens.length} (${ok.length ? ok.map((i) => i[0]).join(', ') : 'nenhum'}).` });
  },
  function recompraNosEua(c) {
    if (c.classeBase !== 'acoes_int') return;
    const dy = c.v('dy'); const sy = c.v('shareholderYield');
    if (dy == null || sy == null || dy >= 0.02 || sy < 0.04) return;
    c.ponto({ id: 'combo_recompra_eua', nome: 'Remunera por recompra', tom: 'bom', peso: 1.5, grupo: 'dividendos', fonte: LEO,
      texto: `DY baixo (${c.fmt(dy, '%', 1)}), mas devolve ${c.fmt(sy, '%', 1)} ao ano somando recompras - e recompra não sofre os 30% retidos nos EUA.` });
    if (c.r('dy_12m') && c.r('dy_12m').tom === 'ruim') c.ajustar('dy_12m', 'neutro', `DY de ${c.fmt(dy, '%', 1)}: baixo, mas a empresa prefere recomprar ações (veja o shareholder yield).`);
  },
  function bomMomentoAcao(c) {
    const teto = c.v('precoSobreTeto'); const pos = c.v('posicao52s');
    if (teto == null || teto > 1 || c.eliminatorios().length) return;
    const pl = c.v('plSobreMedia'); const pvp = c.v('pvpSobreMedia');
    const motivos = [`abaixo do seu teto`];
    if (pl != null && pl <= 1) motivos.push('P/L abaixo da média');
    if (pvp != null && pvp <= 1) motivos.push('P/VP abaixo da média');
    if (pos != null && pos <= 0.7) motivos.push('longe da máxima de 52 semanas');
    if (motivos.length < 3) return;
    c.ponto({ id: 'combo_momento_compra', nome: 'Bom momento pelos critérios', tom: 'bom', peso: 1.5, grupo: 'valuation', fonte: SUNO_MARGEM,
      texto: `Preço em bom momento: ${motivos.join(', ')}, sem alerta eliminatório.` });
  },
]);
