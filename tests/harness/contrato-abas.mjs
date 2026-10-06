// tests/harness/contrato-abas.mjs
//
// 06/10/2026 (A-74): CONTRATO de cada aba que o código lê: em que linha fica o cabeçalho e quais rótulos vêm em cada
// coluna (só estrutura - nenhum dado da planilha). Se a planilha nova (Controle N+1) mexer numa coluna, o teste
// tests/harness/abas-contrato.test.js diz qual aba, qual célula e o que era esperado - em vez de a prévia devolver
// `ok: true` vazio ou um número deslocado.
//
// `cabecalho: { linha, colunas }` - colunas[i] é o início (sem acento/maiúscula) do texto da coluna i+1; null = não confere.
// `rotulos: [[linha, coluna, 'início do texto']]` - células fixas lidas por endereço (abas de painel).
// Aba que o código usa e não está aqui reprova o teste: acrescente a entrada (e confira extrair-fixtures.py).
export const CONTRATO_ABAS = {
  // --- histórico gravado pelo Apps Script ---
  'aux_historico-patrimonio': { cabecalho: { linha: 1, colunas: ['Data', 'Ticker', 'Classe', 'Cotas', 'Preço', 'Valor', 'Câmbio', 'Valor BRL'] } },
  'aux_historico-renda-fixa': { cabecalho: { linha: 1, colunas: ['Data', 'Produto', 'Instituição', 'Indexador', 'Classificação', 'Valor (BRL)'] } },
  'aux_historico-indices': { cabecalho: { linha: 1, colunas: ['Data', 'Índice', 'Valor'] } },
  // --- lançamentos (cabeçalho abaixo de 5 linhas decorativas) ---
  'Transações': { cabecalho: { linha: 6, colunas: ['Ticker', 'Data Transação', 'Tipo da transação', 'Preço', 'Qtd.', 'Taxa transação', 'Total ações', 'Total + Taxa', 'Valor ação', 'Preço médio de compra', 'Transação de ações', 'Lucro / Prejuízo da operação'] } },
  'Transações - USA': { cabecalho: { linha: 6, colunas: ['Ticker', 'Data Transação', 'Tipo da transação', 'Preço USD', 'Qtd.', 'Taxa transação', 'Total ações', 'Total + Taxa', 'Valor ação', 'Preço médio de compra', 'Transação de ações', 'Lucro / Prejuízo da operação'] } },
  'Transações Renda Fixa': { cabecalho: { linha: 6, colunas: ['Produto', 'Data', 'Movimentação', 'Entrada/Saída', 'Instituição', 'Quantidade', 'Preço unitário', 'Valor da Operação'] } },
  'Proventos': { cabecalho: { linha: 7, colunas: ['Data Com', 'Data do pagamento', 'Ticker', 'Tipo do provento', 'Núm. de ativos', 'Provento por ativo', 'Provento líquido', 'Já pago?'] } },
  'Proventos - USA': { cabecalho: { linha: 7, colunas: ['Data Com', 'Data do pagamento', 'Ticker', 'Tipo do provento', 'Núm. de ativos', 'Provento por ativo', 'Provento líquido', 'Já pago?'] } },
  // --- carteiras e painéis da planilha ---
  'Carteira Renda Fixa': {
    cabecalho: { linha: 8, colunas: [null, null, 'Nome', 'Tipo de Investimento', 'Indexador', 'Instituição', 'Quantidade', 'Preço unitário', 'Valor Investido', 'Data de Emissão', 'Vencimento', 'Valor Atualizado'] },
    rotulos: [[6, 8, 'Total investido'], [6, 11, 'Total atualizado'], [6, 13, 'Renda Emergencial']],
  },
  'Carteira FIIs': { cabecalho: { linha: 8, colunas: ['Ticker', 'Nome', 'Tipo', 'Segmento', 'Quantidade de cotas', 'Quantidade meta', 'Fechamento dia anterior', 'Valor atual'] } },
  'Auxiliar_ativos': { cabecalho: { linha: 1, colunas: ['Classe', 'Ticker', 'Nome', 'Tipo', 'Moeda', 'Preço Atual', 'Variação dia', 'Quantidade', 'Preço Médio', 'Preço Teto', 'Viés', 'P/VP', 'Desconto P/VP', 'P/L'] } },
  'Auxiliar_app': { rotulos: [[6, 1, 'Rótulo'], [6, 2, 'Fórmula']] },
  '📊Dash Geral': { rotulos: [[3, 5, 'Patrimônio total']] },
  'Distribuição e Metas': { rotulos: [[8, 2, 'Objetivo de investimento'], [8, 11, 'Renda Emergencial'], [8, 14, 'Salário']] },
  'Despesas Essenciais': { cabecalho: { linha: 6, colunas: ['Despesas', 'Média de Gastos', 'Total', 'Categoria', 'Frequência'] } },
  'Bolsa USA >>>': { rotulos: [[8, 2, 'Cotação do dólar']] },
  'RF Contratada - Resumo': { cabecalho: { linha: 1, colunas: ['Título', 'Instituição', 'Índice', 'Nº de lotes', 'Valor total investido', 'Spread médio ponderado', 'Rentabilidade contratada', 'Observação'] } },
  'RF Contratada - Lotes': { cabecalho: { linha: 1, colunas: ['Título', 'Instituição', 'Data da aplicação', 'Quantidade', 'Preço unitário', 'Valor investido', 'Índice', 'Spread contratado', 'Rentabilidade contratada'] } },
  // --- abas auxiliares que o código cria e grava ---
  'Registro de Controle': { cabecalho: { linha: 1, colunas: ['Timestamp', 'Origem', 'Status', 'Detalhe'] } },
  'aux_metas': { cabecalho: { linha: 1, colunas: ['Id', 'Meta (JSON)', 'Atualizado em'] } },
  'aux_patrimonio': { cabecalho: { linha: 1, colunas: ['Chave', 'Valor (JSON)', 'Atualizado em'] } },
  'aux_gastos': { cabecalho: { linha: 1, colunas: ['Mês', 'Data', 'Origem', 'Fonte', 'Descrição', 'Categoria', 'Valor', 'Tipo', 'Parcela', 'Arquivo', 'Chave'] } },
  'aux_gastos-arquivos': { cabecalho: { linha: 1, colunas: ['ID', 'Nome', 'Caminho', 'Fonte', 'Modificado', 'Importado em', 'Meses', 'Lançamentos', 'Total', 'Conferência', 'Entradas', 'Situação', 'Problema'] } },
  'aux_aportes': { cabecalho: { linha: 1, colunas: ['ID', 'Data', 'Status', 'Classe', 'Ativo', 'Instituição', 'Moeda', 'Qtd planejada', 'Preço planejado', 'Valor planejado', 'Qtd final', 'Preço final', 'Valor final', 'Observação'] } },
  'aux_fundamentos': { cabecalho: { linha: 1, colunas: ['Ticker', 'Fonte', 'JSON', 'Atualizado em'] } },
  // 06/10/2026: resumo plano (valor escolhido pela mescla) que as fórmulas VPA/LPA/P/L da planilha preferem (FundamentosPlanilha.gs); some até a 1ª rodada de fundamentos
  'aux_fundamentos-resumo': { cabecalho: { linha: 1, colunas: ['Ticker', 'P/VP', 'P/L', 'VPA', 'LPA', 'Fonte', 'Atualizado em'] }, opcional: 'criada por Fundamentos.gs (insertSheet) na 1ª rodada de fundamentos' },
  'aux_fundamentos-historico': { cabecalho: { linha: 1, colunas: ['Mês', 'Ticker', 'P/L', 'P/VP', 'DY', 'VP/cota', 'Fonte', 'Gravado em'] } },
  'aux_proventos-conferencia': { cabecalho: { linha: 1, colunas: ['Linha', 'Ticker / mês', 'Tipo', 'Data pagamento', 'Valor líquido', 'Quantidade', 'Arquivo', 'Registrado em'] } },
  'aux_proventos-anunciados': { cabecalho: { linha: 1, colunas: ['Ticker', 'Tipo', 'Data com', 'Data pagamento', 'Valor por cota', 'Isento IR', 'Documento FNet', 'Atualizado em'] } },
  'aux_fii-cnpj': { cabecalho: { linha: 1, colunas: ['Ticker', 'CNPJ', 'Origem', 'Atualizado em'] } },
  'aux_informes-fii': { cabecalho: { linha: 1, colunas: ['Ticker', 'Categoria/Tipo', 'Assunto', 'Data', 'Documento FNet', 'Atualizado em'] } },
  'Salário': { cabecalho: { linha: 1, colunas: ['Mês', 'Tipo', 'Status', 'Data de crédito', 'Salário base', 'Outros vencimentos', 'Total vencimentos', 'INSS', 'IRRF', 'Outros descontos', 'Total descontos', 'Líquido', 'FGTS', 'Base IRRF'] } },
  // --- abas que a planilha ainda não tem no export usado pelas fixtures (o código cria no 1º uso) ou só diagnóstico ---
  'Auxiliar_favoritos': {}, 'aux_caixa_dolar': {}, 'aux_cambio': {}, 'aux_feriados-b3': {}, 'aux_snapshot-precos': {}, 'aux_fii-geocache': {}, 'aux_fii-portfolio': {},
  'aux_fundamentos-gf': {}, 'aux_gastos-regras': { opcional: 'criada por Gastos.gs (insertSheet(nome)) no 1º uso' }, 'aux_historico-despesas': {}, 'aux_holerites-arquivos': {}, 'aux_patrimonio-indices': {},
  'aux_videos': {}, 'aux_videos-canais': {}, 'aux_videos-termos': {}, 'B3 - proventos a receber': {},
  'Carteira Ações': { opcional: 'só DiagnosticoAtivos.gs/NovoAtivo.gs mexem (a Início lê Auxiliar_ativos)' },
  'Carteira Ações USA': { opcional: 'só DiagnosticoAtivos.gs/NovoAtivo.gs mexem (a Início lê Auxiliar_ativos)' },
};

const normaliza = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Compara o texto da célula com o início esperado. */
export function celulaConfere(texto, esperado) {
  return normaliza(texto).startsWith(normaliza(esperado));
}

/**
 * Confere a aba (`aba` = { linhas, lastRow } de fixtures.json) com o contrato. Devolve a lista de divergências
 * (vazia = ok), cada uma dizendo a célula, o que era esperado e o que veio.
 */
export function divergenciasDoContrato(nome, aba, contrato = CONTRATO_ABAS[nome]) {
  const msgs = [];
  const linhas = (aba && aba.linhas) || [];
  const celula = (l, c) => (linhas[l - 1] || [])[c - 1];
  const letra = (c) => { let s = ''; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  if (contrato && contrato.cabecalho) {
    const { linha, colunas } = contrato.cabecalho;
    colunas.forEach((esperado, i) => {
      if (esperado == null) return;
      const veio = celula(linha, i + 1);
      if (!celulaConfere(veio, esperado)) msgs.push(`aba "${nome}", célula ${letra(i + 1)}${linha}: esperava o cabeçalho "${esperado}" e veio ${JSON.stringify(veio ?? null)}`);
    });
  }
  for (const [linha, coluna, esperado] of (contrato && contrato.rotulos) || []) {
    const veio = celula(linha, coluna);
    if (!celulaConfere(veio, esperado)) msgs.push(`aba "${nome}", célula ${letra(coluna)}${linha}: esperava o rótulo "${esperado}" e veio ${JSON.stringify(veio ?? null)}`);
  }
  return msgs;
}
