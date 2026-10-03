/**
 * criterios/base-fiis.js - 03/10/2026 (Tiago: "Nas análises dos gráficos e
 * métricas dos ativos, considere essas fontes [vídeos de FIIs]. Tenha um
 * largo banco de dados de critérios... (confio na Suno, principalmente)").
 *
 * Base normalizada de critérios de FUNDOS IMOBILIÁRIOS, no mesmo esquema de
 * base-acoes.js (veja o cabeçalho de lá). Classes: fii_tijolo, fii_papel,
 * fii_hibrido, fii_fof, fii_desenvolvimento; faixas próprias por segmento
 * (faixasPorSegmento, chaves do contrato: lajes, logistica, shopping,
 * renda_urbana, hibrido, papel_hg, papel_hy, fof, desenvolvimento, agro).
 * Fontes: Suno (indicadores de FII, P/VP, vacância, DY, FoF), Prof. Baroni
 * (2 vídeos), relatórios setoriais Itaú BBA, Clube FII, Status Invest, B3,
 * CVM e leis da isenção. Gerado a partir de scratchpad/criterios/fiis.json
 * (85 critérios + 15 regras): entram os calculáveis; regras no fim.
 */

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const SEGMENTOS_FII = Object.freeze({
  lajes: 'lajes corporativas',
  logistica: 'logística',
  shopping: 'shoppings',
  renda_urbana: 'renda urbana',
  hibrido: 'híbridos',
  papel_hg: 'papel high grade',
  papel_hy: 'papel high yield',
  fof: 'fundos de fundos',
  desenvolvimento: 'desenvolvimento',
  agro: 'agro',
  outros: '',
});

const CLASSE_DO_SEGMENTO = { papel_hg: 'fii_papel', papel_hy: 'fii_papel', fof: 'fii_fof', hibrido: 'fii_hibrido', desenvolvimento: 'fii_desenvolvimento' };
/** fii_tijolo | fii_papel | fii_hibrido | fii_fof | fii_desenvolvimento */
export const classeDoSegmento = (seg) => CLASSE_DO_SEGMENTO[seg] || 'fii_tijolo';

/**
 * Segmento da régua a partir do segmento (planilha "Setor/Segmento", Radar ou
 * contrato), do tipo do Radar (Tijolo/Papel/Híbrido) e do nome do fundo.
 */
export function segmentoDoFii({ segmento = '', tipo = '', nome = '' } = {}) {
  const s = norm(segmento);
  const t = norm(tipo);
  const n = norm(nome);
  if (Object.prototype.hasOwnProperty.call(SEGMENTOS_FII, s) && s !== 'outros') return s;
  const papel = () => (/high yield|\bhy\b|estruturad|oportunidad/.test(n) ? 'papel_hy' : 'papel_hg');
  if (/logist|galp|industrial/.test(s)) return 'logistica';
  if (/shopping|mall/.test(s)) return 'shopping';
  if (/laje|escritor|corporativ/.test(s)) return 'lajes';
  if (/fundo de fundos|fof|\bfundos\b/.test(s)) return 'fof';
  if (/desenvolv|incorpora/.test(s)) return 'desenvolvimento';
  if (/agro|terra/.test(s)) return 'agro';
  if (/renda urbana|imoveis comerciais|varejo|hospital|educac|agencia/.test(s)) return 'renda_urbana';
  if (/hibrid/.test(s) || /hibrid/.test(t)) return 'hibrido';
  if (/titulos e valores|papel|receb|\bcri\b|credito/.test(s) || /papel/.test(t)) return papel();
  if (/receb|credito|\bcri\b/.test(n)) return papel();
  return 'outros';
}

// <criterios gerados> (scratchpad/criterios/gerar_base.py - não edite à mão sem atualizar o gerador)
export const CRITERIOS_FIIS = Object.freeze([
  {
    id: 'fii_pvp',
    nome: 'P/VP',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof', 'fii_desenvolvimento'],
    grupo: 'valuation',
    chave: 'pvp',
    unidade: 'x',
    casas: 2,
    direcao: 'faixa',
    faixas: { bom: [[0.85, 1.0]], neutro: [[1.0, 1.1]], atencao: [[0.7, 0.85], [1.1, 1.2]], ruim: [[null, 0.7], [1.2, null]] },
    faixasPorSegmento: {
      papel_hg: { bom: [[0.95, 1.02]], neutro: [[0.9, 0.95], [1.02, 1.05]], atencao: [[0.85, 0.9], [1.05, 1.1]], ruim: [[null, 0.85], [1.1, null]] },
      papel_hy: { bom: [[0.9, 1.0]], neutro: [[0.85, 0.9], [1.0, 1.03]], atencao: [[0.75, 0.85], [1.03, 1.08]], ruim: [[null, 0.75], [1.08, null]] },
      lajes: { bom: [[0.7, 0.95]], neutro: [[0.95, 1.05]], atencao: [[0.55, 0.7], [1.05, 1.15]], ruim: [[null, 0.55], [1.15, null]] },
      logistica: { bom: [[0.85, 1.0]], neutro: [[1.0, 1.1]], atencao: [[0.75, 0.85], [1.1, 1.2]], ruim: [[null, 0.75], [1.2, null]] },
      shopping: { bom: [[0.8, 0.97]], neutro: [[0.97, 1.07]], atencao: [[0.7, 0.8], [1.07, 1.15]], ruim: [[null, 0.7], [1.15, null]] },
      fof: { bom: [[null, 0.9]], neutro: [[0.9, 1.0]], atencao: [[1.0, 1.05]], ruim: [[1.05, null]] },
    },
    naoAplicaA: ['desenvolvimento'],
    peso: 3,
    eliminatorio: false,
    porQue: 'Compara o preço com o valor contábil dos ativos; em papel o VP é quase \'valor de mercado\', em tijolo depende de laudo.',
    armadilha: 'P/VP baixo por ativo ruim (vacância estrutural, inquilino saindo, CRI podre) não é pechincha; laudos de tijolo podem estar defasados para cima ou para baixo; marcação de CRI derruba o VP sem mexer no…',
    frases: {
      bom: 'P/VP de {valor}: abaixo do patrimônio, dentro da faixa saudável{ref}.',
      neutro: 'P/VP de {valor}: perto do valor patrimonial{ref}.',
      atencao: 'P/VP de {valor}{ref}: ágio sobre o patrimônio - exige gestão e ativos acima da média.',
      ruim: 'P/VP de {valor}{ref}: ágio alto sobre o patrimônio - pagar caro reduz o rendimento futuro.',
      atencaoBaixo: 'P/VP de {valor}{ref}: desconto grande costuma ter motivo (vacância, inquilino, crédito) - confira antes de tratar como pechincha.',
      ruimBaixo: 'P/VP de {valor}{ref}: desconto muito grande - o mercado está precificando um problema real. Entenda o motivo.',
    },
    fontes: [
      { titulo: 'Suno: fundos imobiliarios baratos pvp analise', url: 'https://www.suno.com.br/noticias/fundos-imobiliarios-baratos-pvp-analise/' },
      { titulo: 'Itaú BBA, FIIs Setorial Lajes 1S26 (07/05/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Escrit%C3%B3rios_1S26_Final.pdf' },
      { titulo: 'Itaú BBA, FIIs Setorial Galpões 1S26 (20/02/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Galpoes_1S26_Final.pdf' },
    ],
  },
  {
    id: 'fii_pvp_vs_historico',
    nome: 'P/VP vs média do fundo',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'valuation',
    chave: 'pvpSobreMedia',
    unidade: 'rel',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 0.9]], neutro: [[0.9, 1.05]], atencao: [[1.05, 1.15]], ruim: [[1.15, null]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Momento de compra: compara o fundo com ele mesmo, neutralizando diferenças de laudo entre gestoras.',
    armadilha: 'Se o fundamento piorou (vacância subiu, renda caiu), a média histórica deixa de ser referência; janela curta pode capturar só um ciclo de juros.',
    frases: { bom: 'P/VP {valor} da média do próprio fundo ({media}): mais barato que o costume.', neutro: 'P/VP perto da média do fundo ({media}).', ruim: 'P/VP {valor} da média do fundo ({media}): mais caro que o costume.' },
    fontes: [
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (0:00–2:14)', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
      { titulo: 'CVM Dados Abertos FII (informe mensal/trimestral/anual em CSV)', url: 'https://dados.cvm.gov.br/dados/FII/DOC/' },
    ],
  },
  {
    id: 'fii_dy_12m',
    nome: 'Dividend yield 12m',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'dividendos',
    chave: 'dy12m',
    unidade: '%',
    casas: 1,
    direcao: 'faixa',
    faixas: { bom: [[0.09, 0.125]], neutro: [[0.08, 0.09], [0.125, 0.135]], atencao: [[0.065, 0.08], [0.135, 0.15]], ruim: [[null, 0.065], [0.15, null]] },
    faixasPorSegmento: {
      papel_hg: { bom: [[0.11, 0.14]], neutro: [[0.1, 0.11], [0.14, 0.15]], atencao: [[0.085, 0.1], [0.15, 0.17]], ruim: [[null, 0.085], [0.17, null]] },
      papel_hy: { bom: [[0.11, 0.14]], neutro: [[0.1, 0.11], [0.14, 0.15]], atencao: [[0.085, 0.1], [0.15, 0.17]], ruim: [[null, 0.085], [0.17, null]] },
      logistica: { bom: [[0.08, 0.11]], neutro: [[0.07, 0.08], [0.11, 0.12]], atencao: [[0.06, 0.07], [0.12, 0.135]], ruim: [[null, 0.06], [0.135, null]] },
      lajes: { bom: [[0.085, 0.115]], neutro: [[0.075, 0.085], [0.115, 0.125]], atencao: [[0.06, 0.075], [0.125, 0.14]], ruim: [[null, 0.06], [0.14, null]] },
      shopping: { bom: [[0.09, 0.12]], neutro: [[0.08, 0.09], [0.12, 0.13]], atencao: [[0.065, 0.08], [0.13, 0.145]], ruim: [[null, 0.065], [0.145, null]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'É a renda que o cotista recebe hoje pelo preço pago; mas o patrimônio gera a renda, não o contrário (Baroni).',
    armadilha: 'DY alto por evento não recorrente (venda de imóvel, multa rescisória, RMG), por queda da cota ou por amortização contada como rendimento; DY muito acima da média do segmento costuma ser o \'galinha de…',
    frases: {
      bom: 'DY de {valor} em 12 meses, na faixa saudável{ref}.',
      neutro: 'DY de {valor} em 12 meses{ref}.',
      atencao: 'DY de {valor}{ref}: acima da faixa usual ({faixa}) - confira se é recorrente.',
      ruim: 'DY de {valor}{ref}: alto demais - confira se é recorrente (amortização, venda de imóvel, renda garantida).',
      atencaoBaixo: 'DY de {valor}{ref}: abaixo da faixa boa ({faixa}) - rende pouco pelo preço.',
      ruimBaixo: 'DY de {valor}{ref}: rendimento baixo para um FII.',
    },
    fontes: [
      { titulo: 'Suno: dividend yield', url: 'https://www.suno.com.br/guias/dividend-yield/' },
      { titulo: '\'Como analisar um Fundo Imobiliário? 5 Dicas para escolher um FII?\' (Cortes Prof. Baroni, 14/10/2024) (6:08–9…', url: 'https://www.youtube.com/watch?v=nKSDwOGOpPQ' },
      { titulo: 'Itaú BBA, FIIs Setorial Ativos Financeiros 1S26 (29/01/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_CRIs_1S26_Final.pdf' },
    ],
  },
  {
    id: 'fii_dy_vs_cdi',
    nome: 'DY vs CDI líquido',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'valuation',
    chave: 'dySobreCdi',
    unidade: 'x',
    casas: 2,
    direcao: 'maior',
    faixas: { bom: [[1.05, null]], neutro: [[0.9, 1.05]], atencao: [[0.75, 0.9]], ruim: [[null, 0.75]] },
    faixasPorSegmento: {
      lajes: { bom: [[0.95, null]], neutro: [[0.8, 0.95]], atencao: [[0.65, 0.8]], ruim: [[null, 0.65]] },
      logistica: { bom: [[0.95, null]], neutro: [[0.8, 0.95]], atencao: [[0.65, 0.8]], ruim: [[null, 0.65]] },
      shopping: { bom: [[0.95, null]], neutro: [[0.8, 0.95]], atencao: [[0.65, 0.8]], ruim: [[null, 0.65]] },
      renda_urbana: { bom: [[0.95, null]], neutro: [[0.8, 0.95]], atencao: [[0.65, 0.8]], ruim: [[null, 0.65]] },
      agro: { bom: [[0.95, null]], neutro: [[0.8, 0.95]], atencao: [[0.65, 0.8]], ruim: [[null, 0.65]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'Custo de oportunidade do investidor brasileiro; essencial para papel CDI.',
    armadilha: 'Comparar DY bruto com CDI bruto ignora a isenção; em ciclo de queda da Selic, papel CDI perde renda.',
    frases: { bom: 'O DY (isento) é {valor} o CDI líquido de IR{cdi}: paga o risco de renda variável.', neutro: 'O DY é {valor} o CDI líquido{cdi}: prêmio pequeno sobre a renda fixa.', ruim: 'O DY é só {valor} o CDI líquido{cdi}: a renda fixa paga mais, com menos risco.' },
    fontes: [
      { titulo: 'Copom 16/09/2026: Selic 13,75%', url: 'https://investalk.bb.com.br/noticias/economia/copom-setembro-2026' },
      { titulo: 'Itaú BBA, FIIs Setorial Ativos Financeiros 1S26 (29/01/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_CRIs_1S26_Final.pdf' },
    ],
  },
  {
    id: 'fii_preco_teto_dy',
    nome: 'Preço ÷ seu preço-teto',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'valuation',
    chave: 'precoSobreTeto',
    unidade: 'rel',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 1.0]], neutro: [[1.0, 1.05]], atencao: [[1.05, 1.15]], ruim: [[1.15, null]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Traduz a exigência de retorno em preço máximo; versão FII do método Bazin, ajustado ao juro real atual.',
    armadilha: 'Usar rendimento inflado por não recorrente; DY desejado fixo (ex. 8%) ignora o nível da NTN-B/Selic; não serve para FoF/desenvolvimento com ganho de capital relevante.',
    frases: { bom: 'Cota {valor} do seu preço-teto ({teto}): abaixo do teto.', neutro: 'Cota {valor} do seu preço-teto ({teto}): no limite.', ruim: 'Cota {valor} do seu preço-teto ({teto}): acima do que você aceita pagar.' },
    fontes: [
      { titulo: 'Suno: dividend yield', url: 'https://www.suno.com.br/guias/dividend-yield/' },
      { titulo: 'Clube FII — prêmio histórico DY IFIX vs NTN-B ≈ 3,2 p.p.', url: 'https://www.clubefii.com.br/artigos/fundos_imobiliarios_dividend_yield_fiis_retorno' },
    ],
  },
  {
    id: 'fii_dy_vs_media_propria',
    nome: 'DY vs média do fundo',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'valuation',
    chave: 'dySobreMedia',
    unidade: 'rel',
    casas: 2,
    direcao: 'maior',
    faixas: { bom: [[1.1, null]], neutro: [[0.95, 1.1]], atencao: [[0.85, 0.95]], ruim: [[null, 0.85]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Momento de compra: DY acima do habitual = preço baixo em relação à renda, desde que a renda não esteja caindo.',
    armadilha: 'Se o DY subiu porque a cota caiu por fundamento (inquilino saindo, default), não é oportunidade — cruze com fii_queda_evento_vs_fundamento.',
    frases: { bom: 'DY {valor} da média do fundo ({media}): cota descontada pela régua dos rendimentos.', neutro: 'DY perto da média do fundo ({media}).', ruim: 'DY {valor} da média do fundo ({media}): cota cara ou rendimento caindo.' },
    fontes: [
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (0:00–2:14)', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
    ],
  },
  {
    id: 'fii_consistencia_dividendos',
    nome: 'Oscilação do rendimento (24 meses)',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'dividendos',
    chave: 'cvRendimento',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 0.1]], neutro: [[0.1, 0.2]], atencao: [[0.2, 0.35]], ruim: [[0.35, null]] },
    faixasPorSegmento: {
      fof: { bom: [[null, 0.15]], neutro: [[0.15, 0.25]], atencao: [[0.25, 0.4]], ruim: [[0.4, null]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'Previsibilidade da renda é o que o investidor de FII mais busca (Baroni, V2 ~16:26).',
    armadilha: 'Estabilidade artificial via renda garantida (RMG) ou distribuição acima do resultado consumindo reserva; fundos semestrais concentram pagamentos.',
    frases: { bom: 'Rendimento por cota estável: oscila {valor} em torno da média.', neutro: 'Rendimento por cota oscila {valor} em torno da média.', ruim: 'Rendimento por cota irregular: oscila {valor} em torno da média.' },
    fontes: [
      { titulo: 'Suno: quais indicadores devem ser considerados para analisar um fundo imobiliario', url: 'https://www.suno.com.br/artigos/quais-indicadores-devem-ser-considerados-para-analisar-um-fundo-imobiliario/' },
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (16:26–17:…', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
    ],
  },
  {
    id: 'fii_cortes_dividendos',
    nome: 'Cortes de rendimento (24 meses)',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'dividendos',
    chave: 'cortesRendimento',
    unidade: 'n',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 1]], neutro: [[1, 2]], atencao: [[2, 4]], ruim: [[4, null]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Corte persistente indica perda de capacidade de geração de renda; corte pontual por não recorrente é ruído.',
    armadilha: 'Baroni (V1 ~4:35 e ~9:58): queda de 5–10 centavos por efeito não recorrente ou fim de gestão ativa extraordinária não é deterioração — contextualize; olhe a receita futura e o guidance.',
    frases: { bom: 'Nenhum corte relevante de rendimento em 24 meses.', neutro: '{valor} corte de rendimento (>10%) em 24 meses.', ruim: '{valor} cortes de rendimento (>10%) em 24 meses: renda instável.' },
    fontes: [
      { titulo: '\'Como analisar um Fundo Imobiliário? 5 Dicas para escolher um FII?\' (Cortes Prof. Baroni, 14/10/2024) (4:12–5…', url: 'https://www.youtube.com/watch?v=nKSDwOGOpPQ' },
    ],
  },
  {
    id: 'fii_crescimento_real_rendimento',
    nome: 'Crescimento real do rendimento',
    classes: ['fii_tijolo', 'fii_hibrido', 'fii_fof'],
    grupo: 'crescimento',
    chave: 'crescimentoRealRendimento',
    unidade: 'pp',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.0, null]], neutro: [[-0.02, 0.0]], atencao: [[-0.05, -0.02]], ruim: [[null, -0.05]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Tijolo deveria preservar o poder de compra da renda (contratos indexados).',
    armadilha: 'Emissões e troca de cotas mudam a base; um ano excepcional no início ou fim da série distorce o CAGR.',
    frases: { bom: 'Rendimento por cota cresceu {valorAbs} ao ano acima da inflação.', neutro: 'Rendimento por cota acompanhou a inflação ({valor} ao ano real).', ruim: 'Rendimento por cota perdeu {valorAbs} ao ano para a inflação.' },
    fontes: [
      { titulo: '\'Como analisar um Fundo Imobiliário? 5 Dicas para escolher um FII?\' (Cortes Prof. Baroni, 14/10/2024) (13:49)', url: 'https://www.youtube.com/watch?v=nKSDwOGOpPQ' },
    ],
  },
  {
    id: 'fii_payout_resultado',
    nome: 'Distribuído ÷ resultado',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'dividendos',
    chave: 'distribuicaoSobreResultado',
    unidade: '%',
    casas: 0,
    direcao: 'faixa',
    faixas: { bom: [[0.95, 1.0]], neutro: [[0.9, 0.95], [1.0, 1.05]], atencao: [[null, 0.9], [1.05, 1.15]], ruim: [[1.15, null]] },
    peso: 3,
    eliminatorio: false,
    porQue: 'Distribuir acima do que gera consome reserva/caixa e antecipa corte; reter demais pode descumprir a regra dos 95%.',
    armadilha: 'Resultado caixa x competência (V2 ~2:27): resultado de CRI marcado por competência oscila; venda de imóvel com lucro infla o resultado do semestre; distribuição \'linear\' com reserva é legítima.',
    frases: { bom: 'Distribui {valor} do resultado: paga o que gera, sem queimar reserva.', neutro: 'Distribui {valor} do resultado.', ruim: 'Distribui {valor} do resultado: acima do que gera - o rendimento tende a cair.' },
    fontes: [
      { titulo: 'Lei 8.668/1993 art. 10 par. único (95% do lucro caixa, semestral)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8668.htm' },
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (2:27–4:05)', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
    ],
  },
  {
    id: 'fii_amortizacao',
    nome: 'Amortização nos proventos (12m)',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'dividendos',
    chave: 'pctAmortizacao12m',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 1e-06]], neutro: [[1e-06, 0.05]], atencao: [[0.05, 0.2]], ruim: [[0.2, null]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Amortização devolve capital (reduz o VP), não é renda — inflaria o DY.',
    armadilha: 'Sites agregadores às vezes somam amortização ao DY.',
    frases: { bom: 'Sem amortização nos últimos 12 meses: tudo foi rendimento.', neutro: '{valor} dos proventos de 12 meses foram amortização (devolução de capital).', ruim: '{valor} dos proventos de 12 meses foram amortização: parte do "DY" é o seu dinheiro voltando.' },
    fontes: [
      { titulo: 'CVM Dados Abertos FII (informe mensal/trimestral/anual em CSV)', url: 'https://dados.cvm.gov.br/dados/FII/DOC/' },
    ],
  },
  {
    id: 'fii_vacancia_fisica',
    nome: 'Vacância física',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'portfolio_fii',
    chave: 'vacanciaFisica',
    unidade: '%',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, 0.05]], neutro: [[0.05, 0.1]], atencao: [[0.1, 0.2]], ruim: [[0.2, null]] },
    faixasPorSegmento: {
      lajes: { bom: [[null, 0.08]], neutro: [[0.08, 0.15]], atencao: [[0.15, 0.25]], ruim: [[0.25, null]] },
      logistica: { bom: [[null, 0.03]], neutro: [[0.03, 0.08]], atencao: [[0.08, 0.15]], ruim: [[0.15, null]] },
      shopping: { bom: [[null, 0.03]], neutro: [[0.03, 0.05]], atencao: [[0.05, 0.08]], ruim: [[0.08, null]] },
      renda_urbana: { bom: [[null, 0.0001]], neutro: [[0.0001, 0.05]], atencao: [[0.05, 0.15]], ruim: [[0.15, null]] },
      agro: { bom: [[null, 0.0001]], neutro: [[0.0001, 0.05]], atencao: [[0.05, 0.15]], ruim: [[0.15, null]] },
    },
    peso: 3,
    eliminatorio: false,
    porQue: 'Área vazia não gera aluguel e ainda custa (condomínio, IPTU).',
    armadilha: 'Vacância física zero com vacância financeira alta (carências/descontos) — Suno; vacância baixa por RMG; média do fundo esconde um imóvel problemático.',
    frases: { bom: 'Vacância física de {valor}{ref}: imóveis praticamente cheios.', neutro: 'Vacância física de {valor}{ref}.', ruim: 'Vacância física de {valor}{ref}: área vazia pesa no rendimento.' },
    fontes: [
      { titulo: 'Suno: taxa de vacancia', url: 'https://www.suno.com.br/artigos/taxa-de-vacancia/' },
      { titulo: 'Itaú BBA, FIIs Setorial Lajes 1S26 (07/05/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Escrit%C3%B3rios_1S26_Final.pdf' },
      { titulo: 'Itaú BBA, FIIs Setorial Galpões 1S26 (20/02/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Galpoes_1S26_Final.pdf' },
    ],
  },
  {
    id: 'fii_vacancia_financeira',
    nome: 'Vacância financeira',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'portfolio_fii',
    chave: 'vacanciaFinanceira',
    unidade: '%',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, 0.05]], neutro: [[0.05, 0.1]], atencao: [[0.1, 0.2]], ruim: [[0.2, null]] },
    faixasPorSegmento: {
      lajes: { bom: [[null, 0.08]], neutro: [[0.08, 0.15]], atencao: [[0.15, 0.25]], ruim: [[0.25, null]] },
    },
    peso: 3,
    eliminatorio: false,
    porQue: 'É a vacância que realmente afeta o rendimento.',
    armadilha: 'Nem todo gestor divulga; não está no informe CVM (só física por imóvel).',
    frases: { bom: 'Vacância financeira de {valor}{ref}.', neutro: 'Vacância financeira de {valor}{ref}.', ruim: 'Vacância financeira de {valor}{ref}: receita perdida relevante.' },
    fontes: [
      { titulo: 'Suno: taxa de vacancia', url: 'https://www.suno.com.br/artigos/taxa-de-vacancia/' },
    ],
  },
  {
    id: 'fii_vacancia_tendencia',
    nome: 'Vacância em 12 meses',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'portfolio_fii',
    chave: 'vacanciaTendencia',
    unidade: 'pp',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, -0.02]], neutro: [[-0.02, 0.02]], atencao: [[0.02, 0.05]], ruim: [[0.05, null]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Direção importa mais que o nível: vacância caindo com aluguel subindo = renda futura maior.',
    armadilha: 'Saída programada de inquilino já anunciada ainda não aparece no número.',
    frases: { bom: 'Vacância caiu {valorAbs} em 12 meses.', neutro: 'Vacância estável em 12 meses ({valor}).', ruim: 'Vacância subiu {valorAbs} em 12 meses.' },
    fontes: [
      { titulo: 'Suno: taxa de vacancia', url: 'https://www.suno.com.br/artigos/taxa-de-vacancia/' },
      { titulo: 'CVM Dados Abertos FII (informe mensal/trimestral/anual em CSV)', url: 'https://dados.cvm.gov.br/dados/FII/DOC/' },
    ],
  },
  {
    id: 'fii_inadimplencia_tijolo',
    nome: 'Inadimplência dos inquilinos',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'portfolio_fii',
    chave: 'inadimplencia',
    unidade: '%',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, 0.01]], neutro: [[0.01, 0.03]], atencao: [[0.03, 0.06]], ruim: [[0.06, null]] },
    faixasPorSegmento: {
      shopping: { bom: [[null, 0.03]], neutro: [[0.03, 0.05]], atencao: [[0.05, 0.08]], ruim: [[0.08, null]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'Aluguel não recebido não vira rendimento (fundo é caixa).',
    armadilha: 'Acordo de parcelamento \'zera\' a inadimplência e volta depois; monoinquilino inadimplente = 100%.',
    frases: { bom: 'Inadimplência de {valor}{ref}.', neutro: 'Inadimplência de {valor}{ref}.', ruim: 'Inadimplência de {valor}{ref}: inquilinos atrasando.' },
    fontes: [
      { titulo: 'Suno: quais indicadores devem ser considerados para analisar um fundo imobiliario', url: 'https://www.suno.com.br/artigos/quais-indicadores-devem-ser-considerados-para-analisar-um-fundo-imobiliario/' },
      { titulo: 'Itaú BBA, FIIs Setorial Shoppings 1S26 (25/03/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Shoppings_1S26_Final.pdf' },
    ],
  },
  {
    id: 'fii_numero_imoveis',
    nome: 'Número de imóveis',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'portfolio_fii',
    chave: 'numeroImoveis',
    unidade: 'n',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[10, null]], neutro: [[5, 10]], atencao: [[2, 5]], ruim: [[null, 2]] },
    faixasPorSegmento: {
      shopping: { bom: [[8, null]], neutro: [[4, 8]], atencao: [[2, 4]], ruim: [[null, 2]] },
      renda_urbana: { bom: [[20, null]], neutro: [[8, 20]], atencao: [[3, 8]], ruim: [[null, 3]] },
    },
    peso: 1,
    eliminatorio: false,
    porQue: 'Diversificação de localização, inquilino e ciclo de vencimento.',
    armadilha: 'Muitos imóveis ruins não valem mais que poucos bons; o que importa é a dispersão da receita (use fii_concentracao_imovel).',
    frases: { bom: '{valor} imóveis: risco diluído{ref}.', neutro: '{valor} imóveis{ref}.', ruim: 'Só {valor} imóvel(is): risco concentrado{ref}.' },
    fontes: [
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (12:34)', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
    ],
  },
  {
    id: 'fii_concentracao_inquilino',
    nome: 'Maior inquilino (% da receita)',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'portfolio_fii',
    chave: 'maiorInquilinoPct',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 0.15]], neutro: [[0.15, 0.3]], atencao: [[0.3, 0.5]], ruim: [[0.5, null]] },
    faixasPorSegmento: {
      renda_urbana: { bom: [[null, 0.3]], neutro: [[0.3, 0.6]], atencao: [[0.6, 0.85]], ruim: [[0.85, null]] },
      agro: { bom: [[null, 0.3]], neutro: [[0.3, 0.6]], atencao: [[0.6, 0.85]], ruim: [[0.85, null]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'Saída ou default do âncora = pico de vacância/inadimplência.',
    armadilha: 'O informe CVM só traz o SETOR do inquilino (Setor1, Setor2...), não o nome — nome e % por locatário vêm do relatório gerencial.',
    frases: { bom: 'Maior inquilino responde por {valor} da receita: diversificado.', neutro: 'Maior inquilino responde por {valor} da receita.', ruim: 'Maior inquilino responde por {valor} da receita: se sair, o rendimento sente muito.' },
    fontes: [
      { titulo: 'Suno: taxa de vacancia', url: 'https://www.suno.com.br/artigos/taxa-de-vacancia/' },
      { titulo: 'Suno: quais indicadores devem ser considerados para analisar um fundo imobiliario', url: 'https://www.suno.com.br/artigos/quais-indicadores-devem-ser-considerados-para-analisar-um-fundo-imobiliario/' },
    ],
  },
  {
    id: 'fii_contratos_atipicos',
    nome: 'Contratos atípicos (% da receita)',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'portfolio_fii',
    chave: 'contratosAtipicosPct',
    unidade: '%',
    casas: 0,
    direcao: 'faixa',
    faixas: { bom: [[0.3, 0.7]], neutro: [[0.1, 0.3], [0.7, 0.9]], atencao: [[null, 0.1], [0.9, null]], ruim: [] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Atípico: prazo longo (> 5 anos), multa = aluguéis restantes, sem revisional → previsibilidade. Típico: revisional a cada 3 anos → captura alta de mercado (ou queda).',
    armadilha: 'Atípico com aluguel muito acima do mercado vira risco no vencimento/renovação; multa só vale se o inquilino tiver crédito para pagá-la.',
    frases: {
      bom: '{valor} da receita em contratos atípicos: previsibilidade sem engessar o fundo.',
      neutro: '{valor} da receita em contratos atípicos.',
      atencao: '{valor} da receita em contratos atípicos: quase tudo depende do crédito dos inquilinos.',
      atencaoBaixo: '{valor} da receita em contratos atípicos: pouca previsibilidade (contratos típicos podem ser revisados).',
      ruim: '{valor} da receita em contratos atípicos.',
    },
    fontes: [
      { titulo: 'Status Invest — contrato atípico', url: 'https://statusinvest.com.br/termos/c/contrato-atipico' },
      { titulo: 'Lei 8.245/1991 (Inquilinato) art. 19 (revisional após 3 anos) e art. 54-A (built-to-suit; renúncia à revision…', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8245.htm' },
      { titulo: 'Itaú BBA, FIIs Setorial Galpões 1S26 (20/02/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Galpoes_1S26_Final.pdf' },
    ],
  },
  {
    id: 'fii_walt',
    nome: 'Prazo médio dos contratos (WALT)',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'portfolio_fii',
    chave: 'walt',
    unidade: 'anos',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[5, null]], neutro: [[3, 5]], atencao: [[2, 3]], ruim: [[null, 2]] },
    faixasPorSegmento: {
      lajes: { bom: [[4, null]], neutro: [[2.5, 4]], atencao: [[1.5, 2.5]], ruim: [[null, 1.5]] },
      renda_urbana: { bom: [[8, null]], neutro: [[5, 8]], atencao: [[3, 5]], ruim: [[null, 3]] },
      agro: { bom: [[8, null]], neutro: [[5, 8]], atencao: [[3, 5]], ruim: [[null, 3]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'Mostra por quanto tempo a renda está \'travada\'.',
    armadilha: 'WALT longo com cláusula de saída antecipada barata; WALT do informe CVM só vem em faixas (use ponto médio).',
    frases: { bom: 'Contratos vencem em {valor} em média{ref}: receita travada por mais tempo.', neutro: 'Contratos vencem em {valor} em média{ref}.', ruim: 'Contratos vencem em {valor} em média{ref}: muita renegociação pela frente.' },
    fontes: [
      { titulo: 'Itaú BBA, FIIs Setorial Galpões 1S26 (20/02/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Galpoes_1S26_Final.pdf' },
      { titulo: 'Status Invest — contrato atípico', url: 'https://statusinvest.com.br/termos/c/contrato-atipico' },
    ],
  },
  {
    id: 'fii_vp_cota_tendencia',
    nome: 'VP por cota em 12 meses',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'portfolio_fii',
    chave: 'vpCotaTendencia',
    unidade: '%',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.0, null]], neutro: [[-0.03, 0.0]], atencao: [[-0.08, -0.03]], ruim: [[null, -0.08]] },
    faixasPorSegmento: {
      papel_hg: { bom: [[-0.01, null]], neutro: [[-0.03, -0.01]], atencao: [[-0.06, -0.03]], ruim: [[null, -0.06]] },
      papel_hy: { bom: [[-0.01, null]], neutro: [[-0.03, -0.01]], atencao: [[-0.06, -0.03]], ruim: [[null, -0.06]] },
    },
    peso: 2,
    eliminatorio: false,
    porQue: 'Reavaliações negativas, provisões e emissões abaixo do VP aparecem aqui.',
    armadilha: 'Amortização reduz VP legitimamente; marcação a mercado de CRI IPCA oscila com juros, sem perda real se o crédito pagar.',
    frases: { bom: 'Valor patrimonial por cota variou {valor} em 12 meses: patrimônio preservado.', neutro: 'Valor patrimonial por cota variou {valor} em 12 meses.', ruim: 'Valor patrimonial por cota caiu {valorAbs} em 12 meses: reavaliação ou provisão.' },
    fontes: [
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (2:27–3:44)', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
      { titulo: 'CVM Dados Abertos FII (informe mensal/trimestral/anual em CSV)', url: 'https://dados.cvm.gov.br/dados/FII/DOC/' },
    ],
  },
  {
    id: 'fii_papel_ltv',
    nome: 'LTV médio dos CRIs',
    classes: ['fii_papel', 'fii_hibrido'],
    grupo: 'credito_fii',
    chave: 'ltvMedio',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 0.5]], neutro: [[0.5, 0.6]], atencao: [[0.6, 0.7]], ruim: [[0.7, null]] },
    peso: 3,
    eliminatorio: false,
    porQue: 'Folga da garantia em caso de execução; Itaú (jan/2026): LTV médio ~50% (HG) a ~59% (HY).',
    armadilha: 'Laudo da garantia otimista; garantia ilíquida (terreno, loteamento) vale menos na execução.',
    frases: { bom: 'LTV médio de {valor}: as garantias cobrem bem a dívida.', neutro: 'LTV médio de {valor}.', ruim: 'LTV médio de {valor}: garantia apertada se o devedor falhar.' },
    fontes: [
      { titulo: 'Suno: quais indicadores devem ser considerados para analisar um fundo imobiliario', url: 'https://www.suno.com.br/artigos/quais-indicadores-devem-ser-considerados-para-analisar-um-fundo-imobiliario/' },
      { titulo: 'Itaú BBA, FIIs Setorial Ativos Financeiros 1S26 (29/01/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_CRIs_1S26_Final.pdf' },
    ],
  },
  {
    id: 'fii_papel_inadimplencia',
    nome: 'CRIs com problema (% do PL)',
    classes: ['fii_papel', 'fii_hibrido'],
    grupo: 'credito_fii',
    chave: 'inadimplencia',
    unidade: '%',
    casas: 1,
    direcao: 'menor',
    faixas: { bom: [[null, 1e-06]], neutro: [[1e-06, 0.01]], atencao: [[0.01, 0.03]], ruim: [[0.03, null]] },
    peso: 3,
    eliminatorio: false,
    porQue: 'Default de CRI corta rendimento e VP; HY 2023 mostrou o efeito em cascata.',
    armadilha: 'Reestruturações \'amigáveis\' com carência não aparecem como inadimplência.',
    frases: { bom: 'Sem CRIs inadimplentes.', neutro: '{valor} do patrimônio em CRIs com problema.', ruim: '{valor} do patrimônio em CRIs com problema: pode virar provisão e corte de rendimento.' },
    fontes: [
      { titulo: 'InfoMoney (06/04/2023) FIIs high yield', url: 'https://www.infomoney.com.br/onde-investir/fiis-high-yield-como-identificar/' },
      { titulo: 'Itaú BBA, FIIs Setorial Ativos Financeiros 1S26 (29/01/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_CRIs_1S26_Final.pdf' },
    ],
  },
  {
    id: 'fii_fof_taxa',
    nome: 'Taxa de administração (FoF)',
    classes: ['fii_fof'],
    grupo: 'gestao_fii',
    chave: 'taxaAdministracao',
    unidade: '%',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 0.008]], neutro: [[0.008, 0.01]], atencao: [[0.01, 0.013]], ruim: [[0.013, null]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Dupla camada de taxa (Suno): a gestão do FoF precisa gerar alfa para se pagar.',
    armadilha: 'Taxa de performance sobre IFIX pode ser cobrada em ano de alta do mercado sem alfa real.',
    frases: { bom: 'Taxa de {valor} ao ano: barata para um fundo de fundos.', neutro: 'Taxa de {valor} ao ano.', ruim: 'Taxa de {valor} ao ano: cara, somada às taxas dos fundos investidos.' },
    fontes: [
      { titulo: 'Suno: fof', url: 'https://www.suno.com.br/artigos/fof/' },
    ],
  },
  {
    id: 'fii_taxa_adm',
    nome: 'Taxa de administração',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'gestao_fii',
    chave: 'taxaAdministracao',
    unidade: '%',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 0.008]], neutro: [[0.008, 0.011]], atencao: [[0.011, 0.014]], ruim: [[0.014, null]] },
    faixasPorSegmento: {
      papel_hy: { bom: [[null, 0.01]], neutro: [[0.01, 0.013]], atencao: [[0.013, 0.016]], ruim: [[0.016, null]] },
      desenvolvimento: { bom: [[null, 0.01]], neutro: [[0.01, 0.013]], atencao: [[0.013, 0.016]], ruim: [[0.016, null]] },
    },
    peso: 1,
    eliminatorio: false,
    porQue: 'Custo fixo que sai do rendimento todo mês. Mercado: 0,25%–2% a.a.; mediana (EMP, jul/2026) ≈ 0,80%, p75 1,09%, p90 1,32%.',
    armadilha: 'Baroni (V2 ~6:00): olhar só a taxa absoluta engana — veja o custo relativo (fii_custo_relativo). Base PL x valor de mercado muda o alinhamento.',
    frases: { bom: 'Taxa de administração de {valor} ao ano{ref}: barata.', neutro: 'Taxa de administração de {valor} ao ano{ref}.', ruim: 'Taxa de administração de {valor} ao ano{ref}: cara - come o rendimento todo mês.' },
    fontes: [
      { titulo: 'InfoMoney (10/05/2022) taxas de adm. 0,25%–2% a.a.; performance típica 20% sobre benchmark', url: 'https://www.infomoney.com.br/onde-investir/quanto-custa-investir-em-fiis-taxa-de-administracao-varia-de-025-a-2-ao-ano-confira-lista/' },
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (4:27–7:37)', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
    ],
  },
  {
    id: 'fii_custo_relativo',
    nome: 'Despesas ÷ receitas',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'gestao_fii',
    chave: 'custoRelativo',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 0.08]], neutro: [[0.08, 0.12]], atencao: [[0.12, 0.18]], ruim: [[0.18, null]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Baroni (V2 ~6:00–7:37): \'olhe os valores relativos — quanto de receita o fundo gera e quanto a despesa representa\'; 8–12% parece o modelo mais sustentável. Dados CVM 2T26: mediana 9,2%, p75 14,2%, p90 25%.',
    armadilha: 'Trimestre com receita extraordinária reduz artificialmente o índice; use 12m.',
    frases: { bom: 'Despesas consomem {valor} das receitas: fundo enxuto.', neutro: 'Despesas consomem {valor} das receitas.', ruim: 'Despesas consomem {valor} das receitas: custo alto.' },
    fontes: [
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (6:00–7:37)', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
    ],
  },
  {
    id: 'fii_alavancagem',
    nome: 'Alavancagem',
    classes: ['fii_tijolo', 'fii_hibrido'],
    grupo: 'endividamento',
    chave: 'alavancagem',
    unidade: '%',
    casas: 0,
    direcao: 'menor',
    faixas: { bom: [[null, 0.1]], neutro: [[0.1, 0.2]], atencao: [[0.2, 0.3]], ruim: [[0.3, null]] },
    faixasPorSegmento: {
      shopping: { bom: [[null, 0.15]], neutro: [[0.15, 0.25]], atencao: [[0.25, 0.35]], ruim: [[0.35, null]] },
    },
    peso: 3,
    eliminatorio: false,
    porQue: 'Dívida cara (IPCA+/CDI+) consome o aluguel e reduz a flexibilidade; Baroni (V2 ~12:10): pergunte se a alavancagem pode ser reduzida com vendas/reciclagem ou se compromete o rendimento de forma definitiva. Dados CVM: p90 do passiv…',
    armadilha: 'Custo da dívida > cap rate = alavancagem destrutiva; dívida curta com vencimento próximo = risco de refinanciamento.',
    frases: { bom: 'Alavancagem de {valor}{ref}: pouca dívida.', neutro: 'Alavancagem de {valor}{ref}.', ruim: 'Alavancagem de {valor}{ref}: dívida relevante - juros e vencimentos pesam.' },
    fontes: [
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (12:10–12:…', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
      { titulo: 'Itaú BBA, FIIs Setorial Shoppings 1S26 (25/03/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Shoppings_1S26_Final.pdf' },
      { titulo: '\'Como analisar um Fundo Imobiliário? 5 Dicas para escolher um FII?\' (Cortes Prof. Baroni, 14/10/2024) (2:42)', url: 'https://www.youtube.com/watch?v=nKSDwOGOpPQ' },
    ],
  },
  {
    id: 'fii_pct_caixa',
    nome: '% em caixa',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'liquidez_risco',
    chave: 'pctCaixa',
    unidade: '%',
    casas: 1,
    direcao: 'faixa',
    faixas: { bom: [[0.02, 0.1]], neutro: [[0.01, 0.02], [0.1, 0.15]], atencao: [[null, 0.01], [0.15, 0.25]], ruim: [[0.25, null]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Caixa protege contra imprevistos e obrigações; caixa demais rende CDI e dilui a renda imobiliária (Nord: cash drag). Dados CVM: mediana 3,7%, p75 7,9%, p90 15%.',
    armadilha: 'Caixa reservado para obrigação de aquisição já contratada não é \'livre\'.',
    frases: {
      bom: '{valor} em caixa: liquidez para oportunidades sem diluir o rendimento.',
      neutro: '{valor} em caixa.',
      atencao: '{valor} em caixa: acima do ideal ({faixa}) - caixa parado dilui o rendimento (emissão recente esperando aplicação?).',
      atencaoBaixo: '{valor} em caixa: pouca folga para obras, vacância ou oportunidades.',
      ruim: '{valor} em caixa: dinheiro parado rendendo menos que os imóveis - entenda o motivo (emissão recente?).',
    },
    fontes: [
      { titulo: 'Nord — emissões prejudiciais', url: 'https://www.nordinvestimentos.com.br/blog/fii-cota-emissoes-prejudiciais/' },
    ],
  },
  {
    id: 'fii_liquidez_diaria',
    nome: 'Liquidez diária',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'liquidez_risco',
    chave: 'liquidezDiaria',
    unidade: 'R$',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[3000000.0, null]], neutro: [[1000000.0, 3000000.0]], atencao: [[300000.0, 1000000.0]], ruim: [[null, 300000.0]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'Facilidade de entrar e sair sem mexer no preço; Baroni (V2 ~16:49) lembra quando FIIs mal negociavam R$ 50 mil/mês.',
    armadilha: 'Pico de volume em emissão ou evento; compare sua posição com o volume (posição ≤ 10% do volume diário).',
    frases: { bom: 'Negocia {valor} por dia: entra e sai fácil.', neutro: 'Negocia {valor} por dia.', ruim: 'Negocia só {valor} por dia: pouca liquidez.' },
    fontes: [
      { titulo: '\'Gestor mudou de rumo? Como analisar um FII antes de tomar uma decisão\' (Prof. Baroni, 02/10/2026) (16:49)', url: 'https://www.youtube.com/watch?v=qwlxfUBHLlw' },
      { titulo: 'B3 — Metodologia IFIX (presença 95% dos pregões, IN 95%, peso máx. 20%)', url: 'https://www.b3.com.br/data/files/2A/56/E3/DD/A3943710DB551337AC094EA8/IFIX-Metodologia-pt-br.pdf' },
    ],
  },
  {
    id: 'fii_numero_cotistas',
    nome: 'Número de cotistas',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'liquidez_risco',
    chave: 'numeroCotistas',
    unidade: 'n',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[50000, null]], neutro: [[10000, 50000]], atencao: [[1000, 10000]], ruim: [[null, 1000]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Base pulverizada = liquidez e menor risco de concentração/perda da isenção. Dados CVM (jul/2026, FIIs com ≥ 5 mil cotistas): mediana 18 mil, p75 72 mil.',
    armadilha: 'Muitos cotistas não garante qualidade; queda contínua de cotistas pode sinalizar saída.',
    frases: { bom: '{valor} cotistas: base grande e pulverizada.', neutro: '{valor} cotistas.', ruim: 'Só {valor} cotistas: base pequena.' },
    fontes: [
      { titulo: 'Lei 14.754/2023 (altera art. 3º da Lei 11.033/2004: mínimo 100 cotistas; grupo de PF ligadas < 30%)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14754.htm' },
    ],
  },
  {
    id: 'fii_patrimonio_liquido',
    nome: 'Patrimônio do fundo',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'liquidez_risco',
    chave: 'patrimonioLiquido',
    unidade: 'R$',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[1000000000.0, null]], neutro: [[500000000.0, 1000000000.0]], atencao: [[200000000.0, 500000000.0]], ruim: [[null, 200000000.0]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Escala dilui custos fixos e permite diversificar; fundos pequenos ficam fora do IFIX e têm menos liquidez. Dados CVM: mediana R$ 521 mi, p75 R$ 1,34 bi.',
    armadilha: 'Fundo grande demais pode ter dificuldade de alocar; fundo de nicho pequeno pode ser excelente.',
    frases: { bom: 'Patrimônio de {valor}: fundo grande.', neutro: 'Patrimônio de {valor}.', ruim: 'Patrimônio de {valor}: fundo pequeno - menos diversificação e liquidez.' },
    fontes: [
      { titulo: 'Suno: patrimônio líquido', url: 'https://www.suno.com.br/artigos/patrimonio-liquido/' },
      { titulo: 'CVM Dados Abertos (informes de FII)', url: 'https://dados.cvm.gov.br/dados/FII/DOC/' },
    ],
  },
  {
    id: 'fii_isencao_ir',
    nome: 'Rendimento isento de IR',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'governanca',
    chave: 'isencaoNum',
    unidade: 'bool',
    casas: 0,
    direcao: 'maior',
    faixas: { bom: [[1, null]], neutro: [], atencao: [], ruim: [[null, 1]] },
    peso: 3,
    eliminatorio: true,
    porQue: 'Isenção é boa parte da atratividade do FII vs renda fixa. Lei 14.754/2023 subiu o mínimo de 50 para 100 cotistas e criou o limite de 30% para grupo de PF ligadas. A MP 1.303/2025 (que tributaria FIIs) caducou em out/2025; a Lei 1…',
    armadilha: 'Ganho de capital na venda de cotas é sempre tributado (20%); isenção é do investidor PF, não do fundo; fundo que investe em empreendimento de incorporador/sócio com > 25% das cotas é tributado como P…',
    frases: { bom: 'Rendimento isento de IR para pessoa física.', neutro: 'Rendimento isento de IR para pessoa física.', ruim: 'Rendimento NÃO isento de IR: perde a principal vantagem do FII.' },
    fontes: [
      { titulo: 'Lei 14.754/2023 (altera art. 3º da Lei 11.033/2004: mínimo 100 cotistas; grupo de PF ligadas < 30%)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14754.htm' },
      { titulo: 'Lei 11.033/2004 art. 3º (isenção PF; cotista < 10% das cotas e dos rendimentos; negociação exclusiva em bolsa…', url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11.033.htm' },
      { titulo: 'Lei 9.779/1999 art. 2º (FII tributado como PJ se investir em empreendimento de incorporador/construtor/sócio…', url: 'https://www.planalto.gov.br/ccivil_03/leis/l9779.htm' },
    ],
  },
  {
    id: 'fii_retorno_total_vs_ifix',
    nome: 'Retorno total vs IFIX (12m)',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'desempenho_carteira',
    chave: 'retornoVsIndice12m',
    unidade: 'pp',
    casas: 1,
    direcao: 'maior',
    faixas: { bom: [[0.02, null]], neutro: [[-0.02, 0.02]], atencao: [[-0.05, -0.02]], ruim: [[null, -0.05]] },
    peso: 2,
    eliminatorio: false,
    porQue: 'IFIX é o benchmark natural (é índice de retorno total). Baroni (V1 ~14:58): análise só pela cotação engana — inclua o rendimento.',
    armadilha: 'Janela curta (1–2 meses de queda geral) gera conclusões erradas (V1 ~15:21); compare também com o segmento.',
    frases: { bom: 'Em 12 meses, cota + rendimentos renderam {valorAbs} acima do IFIX.', neutro: 'Em 12 meses, retorno total parecido com o IFIX ({valor}).', ruim: 'Em 12 meses, cota + rendimentos ficaram {valorAbs} abaixo do IFIX.' },
    fontes: [
      { titulo: '\'Como analisar um Fundo Imobiliário? 5 Dicas para escolher um FII?\' (Cortes Prof. Baroni, 14/10/2024) (14:58–…', url: 'https://www.youtube.com/watch?v=nKSDwOGOpPQ' },
      { titulo: 'B3 — Metodologia IFIX (presença 95% dos pregões, IN 95%, peso máx. 20%)', url: 'https://www.b3.com.br/data/files/2A/56/E3/DD/A3943710DB551337AC094EA8/IFIX-Metodologia-pt-br.pdf' },
    ],
  },
  {
    id: 'fii_volatilidade',
    nome: 'Volatilidade vs IFIX',
    classes: ['fii_tijolo', 'fii_papel', 'fii_hibrido', 'fii_fof'],
    grupo: 'liquidez_risco',
    chave: 'volatilidadeRelativa',
    unidade: 'x',
    casas: 2,
    direcao: 'menor',
    faixas: { bom: [[null, 1.2]], neutro: [[1.2, 1.6]], atencao: [[1.6, 2.2]], ruim: [[2.2, null]] },
    peso: 1,
    eliminatorio: false,
    porQue: 'Fundo individual é naturalmente mais volátil que o índice; muito acima indica risco específico ou baixa liquidez.',
    armadilha: 'Vol baixa por falta de negócios (fundo ilíquido) parece \'seguro\'.',
    frases: { bom: 'Oscila {valor} o que oscila o IFIX: cota estável.', neutro: 'Oscila {valor} o que oscila o IFIX.', ruim: 'Oscila {valor} o que oscila o IFIX: cota agitada.' },
    fontes: [
      { titulo: 'Itaú BBA, FIIs Setorial Galpões 1S26 (20/02/2026)', url: 'https://ww69.itau.com.br/fileserver/relatorios/FIIs_Setorial_Galpoes_1S26_Final.pdf' },
    ],
  },
]);
// </criterios gerados>

// ---------------------------------------------------------------------------
// Regras de combinação (mesmo contexto das de base-acoes.js).
// ---------------------------------------------------------------------------

const SUNO_PVP_FII = { titulo: 'Suno: FIIs baratos pelo P/VP', url: 'https://www.suno.com.br/noticias/fundos-imobiliarios-baratos-pvp-analise/' };
const SUNO_IND_FII = { titulo: 'Suno: indicadores para analisar um FII', url: 'https://www.suno.com.br/artigos/quais-indicadores-devem-ser-considerados-para-analisar-um-fundo-imobiliario/' };
const BARONI_1 = { titulo: 'Prof. Baroni: como analisar um FII (5 dicas)', url: 'https://www.youtube.com/watch?v=nKSDwOGOpPQ' };
const INFOMONEY_TAXA = { titulo: 'InfoMoney: quanto custa investir em FIIs (taxas)', url: 'https://www.infomoney.com.br/onde-investir/quanto-custa-investir-em-fiis-taxa-de-administracao-varia-de-025-a-2-ao-ano-confira-lista/' };
const SI_ATIPICO = { titulo: 'Status Invest: contrato atípico', url: 'https://statusinvest.com.br/termos/c/contrato-atipico' };

export const REGRAS_FIIS = Object.freeze([
  function descontoComMotivo(c) {
    const pvp = c.v('pvp'); const r = c.r('fii_pvp');
    if (!r || pvp == null || pvp >= 0.9) return;
    const papel = c.classeBase === 'fii_papel';
    const motivos = [];
    const checados = [];
    const conferir = (chave, cond, texto) => { const x = c.v(chave); if (x == null) return; checados.push(chave); if (cond(x)) motivos.push(texto(x)); };
    conferir('vacanciaFisica', (x) => x > 0.15, (x) => `vacância de ${c.fmt(x, '%', 0)}`);
    conferir('distribuicaoSobreResultado', (x) => x > 1.05, (x) => `distribui ${c.fmt(x, '%', 0)} do resultado`);
    conferir('alavancagem', (x) => x > 0.2, (x) => `alavancagem de ${c.fmt(x, '%', 0)}`);
    conferir('cortesRendimento', (x) => x >= 2, (x) => `${x} cortes de rendimento em 24 meses`);
    if (papel) conferir('inadimplencia', (x) => x > 0.03, (x) => `${c.fmt(x, '%', 1)} em CRIs com problema`);
    if (motivos.length) {
      c.ajustar('fii_pvp', 'atencao', `P/VP de ${c.fmt(pvp, 'x', 2)}, mas ${motivos.join(', ')}: o desconto parece refletir risco real, não oportunidade.`);
    } else if (checados.length >= 2) {
      c.ponto({ id: 'combo_desconto_saudavel', nome: 'Desconto com fundamentos em dia', tom: 'bom', peso: 2, grupo: 'valuation', fonte: SUNO_PVP_FII,
        texto: `P/VP de ${c.fmt(pvp, 'x', 2)} sem sinal de problema nos dados que temos (${checados.length} conferidos): desconto com cara de oportunidade.` });
    }
  },
  function dyAltoBandeiraVermelha(c) {
    const dy = c.v('dy12m'); const r = c.r('fii_dy_12m');
    if (!r || dy == null) return;
    const limite = c.classeBase === 'fii_papel' ? 0.15 : 0.13;
    if (dy <= limite) return;
    const motivos = [];
    if (c.v('distribuicaoSobreResultado') > 1.05) motivos.push(`distribui ${c.fmt(c.v('distribuicaoSobreResultado'), '%', 0)} do resultado`);
    if (c.v('cortesRendimento') >= 2) motivos.push(`${c.v('cortesRendimento')} cortes recentes`);
    if (c.v('pctAmortizacao12m') > 0.2) motivos.push(`${c.fmt(c.v('pctAmortizacao12m'), '%', 0)} dos proventos foram amortização`);
    if (c.v('retornoVsIndice12m') < -0.15) motivos.push('cota bem abaixo do IFIX em 12 meses');
    if (!motivos.length) return;
    c.ajustar('fii_dy_12m', 'atencao', `DY de ${c.fmt(dy, '%', 1)} chama atenção, mas ${motivos.join(', ')} - tende a cair.`);
  },
  function bomMomentoFii(c) {
    if (c.eliminatorios().length) return;
    const pesadosRuins = c.resultados().filter((x) => x.criterio.peso >= 3 && x.tom === 'ruim');
    if (pesadosRuins.length) return;
    const motivos = [];
    const pvp = c.v('pvpSobreMedia'); const dy = c.v('dySobreMedia'); const teto = c.v('precoSobreTeto');
    if (pvp != null && pvp <= 0.9) motivos.push('P/VP 10%+ abaixo da média do fundo');
    if (dy != null && dy >= 1.1) motivos.push('DY 10%+ acima da média do fundo');
    if (teto != null && teto < 1) motivos.push('cota abaixo do seu teto');
    if (motivos.length < 2) return;
    c.ponto({ id: 'combo_momento_fii', nome: 'Bom momento pelos critérios do fundo', tom: 'bom', peso: 1.5, grupo: 'valuation', fonte: BARONI_1,
      texto: `Bom momento: ${motivos.join(', ')}, sem critério pesado no vermelho.` });
  },
  function taxaAltaComCustoBaixo(c) {
    const taxa = c.v('taxaAdministracao'); const custo = c.v('custoRelativo'); const r = c.r('fii_taxa_adm');
    if (!r || taxa == null || custo == null || taxa <= 0.011 || custo > 0.12 || r.tom === 'bom' || r.tom === 'neutro') return;
    c.ajustar('fii_taxa_adm', 'neutro', `Taxa de ${c.fmt(taxa, '%', 2)} ao ano é alta, mas as despesas totais consomem só ${c.fmt(custo, '%', 0)} das receitas - custo aceitável no conjunto.`, INFOMONEY_TAXA);
  },
  function monoinquilinoAtipico(c) {
    const conc = c.v('maiorInquilinoPct'); const atip = c.v('contratosAtipicosPct'); const walt = c.v('walt'); const r = c.r('fii_concentracao_inquilino');
    if (!r || conc == null || atip == null || walt == null || conc <= 0.5 || atip < 0.7 || walt < 8) return;
    c.ajustar('fii_concentracao_inquilino', 'neutro', `Maior inquilino com ${c.fmt(conc, '%', 0)} da receita, mas em contrato atípico com ${c.fmt(walt, 'anos', 1)} pela frente: concentração aceitável se o crédito do inquilino for bom.`, SI_ATIPICO);
  },
  function papelComDescontoGrande(c) {
    const pvp = c.v('pvp');
    if (c.classeBase !== 'fii_papel' || pvp == null || pvp >= 0.85 || c.v('inadimplencia') != null) return;
    c.ponto({ id: 'combo_papel_desconto', nome: 'Desconto grande em FII de papel', tom: 'atencao', peso: 1, grupo: 'credito_fii', fonte: SUNO_IND_FII,
      texto: `Em FII de papel o VP já é marcado a mercado: P/VP de ${c.fmt(pvp, 'x', 2)} costuma antecipar provisão ou problema de crédito. Confira o relatório gerencial.` });
  },
]);
