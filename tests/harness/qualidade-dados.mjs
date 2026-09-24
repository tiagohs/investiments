// tests/harness/qualidade-dados.mjs
//
// 23/09/2026 #4: checagens de QUALIDADE DOS DADOS DA PLANILHA (não do
// código) num módulo só, usado por qualidade-dados-planilha.test.js (um
// teste por checagem) e pelo relatório de conferência das telas
// (relatorio-telas.mjs, seção "Alertas de dado da planilha"). Cada
// checagem devolve a lista de mensagens do que corrigir - vazia = ok.
//
// `r` é o retorno de carregarTodasAsTelasComDadosReais (gas-vm-harness.mjs).

const fmtBr = (iso) => iso.split('-').reverse().join('/');

export const CHECAGENS_QUALIDADE = [
  {
    id: 'bonificacao',
    titulo: 'bonificação/desdobramento lançado na data certa: nenhuma mudança de patamar de preço sem data conhecida',
    rodar: ({ diagnosticoRv }) => (diagnosticoRv.fronteirasIncertas || []).map((f) =>
      `${f.ticker}: os preços que você pagou mudam de patamar (fator ${f.fatorAntes.toFixed(2)} -> ${f.fatorDepois.toFixed(2)}) entre ${fmtBr(f.entre)} e ${fmtBr(f.e)}, ` +
      `mas não há nenhuma bonificação (Compra a R$ 0) de ${f.ticker.slice(0, 4)} nesse intervalo em "Transações". ` +
      `Se houve bonificação/desdobramento, lance (ou mude a data da linha já lançada) pra data EX do evento - o app está usando ${fmtBr(f.diaUsado)} como palpite.`),
  },
  {
    id: 'precoIsolado',
    titulo: 'aux_historico-patrimonio sem preço isolado absurdo (rode repararPrecosIsoladosAbsurdos_ no Apps Script se falhar)',
    rodar: ({ diagnosticoRv }) => (diagnosticoRv.descartesPrecoIsolado || []).map((d) =>
      `${d.ticker} ${fmtBr(d.dia)}: preço ${d.preco} (anterior ${d.precoAnterior}, seguinte ${d.precoSeguinte})`),
  },
  {
    id: 'tesouroQuantidade',
    titulo: 'Tesouro Direto: quantidade de cada título em "Transações Renda Fixa" = quantidade na "Carteira Renda Fixa"',
    rodar: ({ fixtures, carteirasRendaFixa, sandbox }) => {
      const inst = (s) => sandbox.normalizarInstituicaoRF_(s);
      const qtdTransacoes = {};
      for (const l of (fixtures['Transações Renda Fixa']?.linhas || []).slice(6)) {
        const produto = String(l[0] || '').trim();
        if (!produto.startsWith('Tesouro') || !l[1] || !l[1].__date__) continue;
        const mov = String(l[2] || '');
        const q = Number(l[5]) || 0;
        const sinal = (mov === 'Compra' || mov === 'APLICAÇÃO') ? 1
          : (mov === 'Venda' || mov === 'Resgate') ? -1
            : mov.startsWith('Transfer') ? (String(l[3] || '').startsWith('Credit') ? 1 : -1) : 0;
        const k = `${produto}|${inst(l[4])}`;
        qtdTransacoes[k] = (qtdTransacoes[k] || 0) + sinal * q;
      }
      const qtdCarteira = {};
      for (const a of carteirasRendaFixa.ativos || []) {
        const produto = String(a.nomePersonalizado || '').trim();
        if (!produto.startsWith('Tesouro')) continue;
        const k = `${produto}|${inst(a.instituicao)}`;
        qtdCarteira[k] = (qtdCarteira[k] || 0) + (Number(a.quantidade) || 0);
      }
      const msgs = [];
      for (const k of new Set([...Object.keys(qtdTransacoes), ...Object.keys(qtdCarteira)])) {
        const qt = Math.round((qtdTransacoes[k] || 0) * 100) / 100;
        const qc = Math.round((qtdCarteira[k] || 0) * 100) / 100;
        // resíduo de arredondamento de título já vendido (ex.: 0,01) não conta
        if (qc === 0 && Math.abs(qt) <= 0.011) continue;
        if (Math.abs(qt - qc) > 0.005) {
          msgs.push(`${k.replace('|', ' (')}): Carteira ${qc.toFixed(2)} x Transações ${qt.toFixed(2)} - ` +
            (qc > qt ? `falta lançar ${(qc - qt).toFixed(2)} título(s) em "Transações Renda Fixa" (ver lotes em "RF Contratada - Lotes")` : 'tem venda/resgate faltando ou compra a mais em "Transações Renda Fixa"'));
        }
      }
      return msgs;
    },
  },
  {
    id: 'tesouroPrecoUnitario',
    titulo: 'Tesouro Direto: em cada linha de "Transações Renda Fixa", Valor ÷ Quantidade fica perto do preço dos outros lançamentos do mesmo título (quantidade digitada certa)',
    // 23/09/2026 #5 (Controle 9): as 2 compras novas de Selic 2028/2031 XP
    // entraram com Quantidade 0,1 em vez de 0,01 - o valor estava certo,
    // então o gráfico não mudou, mas a quantidade das Transações passou a
    // não bater com a Carteira. Esta checagem aponta a LINHA exata.
    rodar: ({ fixtures }) => {
      const linhas = [];
      for (const l of (fixtures['Transações Renda Fixa']?.linhas || []).slice(6)) {
        const produto = String(l[0] || '').trim();
        if (!produto.startsWith('Tesouro') || !l[1] || !l[1].__date__) continue;
        const mov = String(l[2] || '');
        if (!['Compra', 'Venda', 'Resgate', 'APLICAÇÃO'].includes(mov)) continue;
        const q = Number(l[5]), v = Number(l[7]);
        if (!(q > 0) || !(v > 0)) continue;
        linhas.push({ produto, dia: l[1].__date__.slice(0, 10), mov, q, v, pu: v / q });
      }
      // compara só com lançamentos do mesmo título num raio de 1 ano: o
      // preço do Tesouro Selic sobe ~1% ao mês, então a mediana de todos os
      // anos juntos acusaria venda recente de título antigo à toa.
      const mediana = (a) => { const o = [...a].sort((x, y) => x - y); const m = Math.floor(o.length / 2); return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; };
      const dias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
      const msgs = [];
      for (const x of linhas) {
        const vizinhos = linhas.filter((y) => y !== x && y.produto === x.produto && dias(y.dia, x.dia) <= 365).map((y) => y.pu);
        if (vizinhos.length < 2) continue;
        const med = mediana(vizinhos);
        const r = x.pu / med;
        if (r < 0.6 || r > 1.6) {
          const qCerta = Math.round((x.v / med) * 100) / 100;
          msgs.push(`${x.produto} - ${x.mov} de ${fmtBr(x.dia)}: Quantidade ${x.q} com Valor R$ ${x.v.toFixed(2)} dá R$ ${x.pu.toFixed(2)} por título, mas os outros lançamentos desse título no mesmo ano ficam em torno de R$ ${med.toFixed(2)} - a quantidade certa deve ser ${qCerta.toFixed(2)}`);
        }
      }
      return msgs;
    },
  },
  {
    id: 'rvQuantidade',
    titulo: 'Renda Variável: quantidade de hoje pelas Transações = quantidade na Carteira (Ações, FIIs, Ações EUA)',
    rodar: ({ fixtures, carteirasAcoes, carteirasFiis, carteirasAcoesEua, sandbox }) => {
      const fora = new Set(sandbox.TICKERS_FORA_DO_HISTORICO || []);
      const qtd = {};
      for (const aba of ['Transações', 'Transações - USA']) {
        for (const l of (fixtures[aba]?.linhas || []).slice(6)) {
          const tk = String(l[0] || '').trim().toUpperCase();
          if (!tk || !l[1] || !l[1].__date__ || fora.has(tk) || typeof l[10] !== 'number') continue;
          qtd[tk] = (qtd[tk] || 0) + l[10];
        }
      }
      const msgs = [];
      for (const a of [...carteirasAcoes.ativos, ...carteirasFiis.ativos, ...carteirasAcoesEua.ativos]) {
        const q = qtd[a.ticker] || 0;
        if (Math.abs(q - a.quantidade) > 0.0005) msgs.push(`${a.ticker}: Carteira ${a.quantidade} x Transações ${q}`);
      }
      return msgs;
    },
  },
  {
    id: 'rfDatas',
    titulo: 'histórico da Renda Fixa com as datas certas (1ª linha de cada título no dia da 1ª compra)',
    rodar: ({ diagnosticoRf }) => {
      const msgs = (diagnosticoRf.deslocamentos || []).map((d) =>
        `${d.posicao.replace('|', ' (')}): 1ª compra ${fmtBr(d.primeiraCompra)}, 1ª linha em aux_historico-renda-fixa ${fmtBr(d.primeiraLinha)} (${d.dias > 0 ? '+' : ''}${d.dias} dia)`);
      if (msgs.length) msgs.unshift('aux_historico-renda-fixa foi gravada com data deslocada (o app realinha sozinho, mas regrave: cole o BackfillRendaFixa.gs novo, implante e rode rodarBackfillRendaFixaDireto() no editor)');
      return msgs;
    },
  },
  {
    id: 'rfLotes',
    titulo: '"RF Contratada - Lotes": quantidade de cada título = quantidade na "Carteira Renda Fixa" (os lotes alimentam o cálculo de IR)',
    rodar: ({ fixtures, carteirasRendaFixa, sandbox }) => {
      const inst = (s) => sandbox.normalizarInstituicaoRF_(s);
      const lotes = {};
      for (const l of (fixtures['RF Contratada - Lotes']?.linhas || []).slice(1)) {
        const produto = String(l[0] || '').trim();
        if (!produto) continue;
        const k = `${produto}|${inst(l[1])}`;
        lotes[k] = (lotes[k] || 0) + (Number(l[3]) || 0);
      }
      const msgs = [];
      for (const a of carteirasRendaFixa.ativos || []) {
        const produto = String(a.nomePersonalizado || '').trim();
        const k = `${produto}|${inst(a.instituicao)}`;
        if (!(k in lotes)) continue;
        const ql = Math.round(lotes[k] * 100) / 100, qc = Math.round((Number(a.quantidade) || 0) * 100) / 100;
        if (Math.abs(ql - qc) > 0.005) msgs.push(`${produto} (${inst(a.instituicao)}): Lotes somam ${ql.toFixed(2)} x Carteira ${qc.toFixed(2)}`);
      }
      return msgs;
    },
  },
  {
    id: 'taxasBcb',
    titulo: 'taxas do BCB (CDI/SELIC/IPCA) em aux_historico-indices com as datas certas (dia útil, sem +1 dia)',
    rodar: ({ diagnosticoTaxas }) => (diagnosticoTaxas && diagnosticoTaxas.deslocadasUmDia
      ? [`CDI/SELIC gravados 1 dia adiantados (${diagnosticoTaxas.linhasFimDeSemana} linhas em sábado/domingo, ${diagnosticoTaxas.linhasSegunda} em segunda) - o app realinha sozinho, mas regrave: cole o BackfillIndices.gs novo, implante e rode rodarBackfillTaxasBcbDireto() no editor`]
      : []),
  },
  {
    id: 'totalMaisTaxa',
    titulo: 'Transações e Transações - USA: toda Compra/Venda com preço tem o "Total + Taxa" (coluna H) preenchido',
    // 23/09/2026 #3: linha com a coluna H vazia faz a própria planilha
    // achar que aquela compra saiu de graça (o preço médio cai) e o Valor
    // aplicado fica menor do que é (e o lucro, maior). Bonificação (Compra a
    // preço 0) é normal e fica de fora.
    rodar: ({ fixtures }) => {
      const msgs = [];
      for (const aba of ['Transações', 'Transações - USA']) {
        for (const l of (fixtures[aba]?.linhas || []).slice(6)) {
          const tk = String(l[0] || '').trim();
          if (!tk || !l[1] || !l[1].__date__) continue;
          if (!['Compra', 'Venda'].includes(l[2])) continue;
          if (!(Number(l[3]) > 0) || !(Number(l[4]) > 0)) continue;
          if (!(Number(l[7]) > 0)) {
            msgs.push(`"${aba}": ${tk} ${l[2]} de ${fmtBr(l[1].__date__.slice(0, 10))} (${l[4]} × ${l[3]}) com "Total + Taxa" vazio/zero - copie a fórmula da coluna H (e as seguintes) da linha de cima`);
          }
        }
      }
      return msgs;
    },
  },
  {
    id: 'vendaPrecoAbsurdo',
    titulo: 'Transações e Transações - USA: nenhuma Venda com preço mais de 4x acima (ou abaixo de 1/4) do preço médio de compra',
    // 23/09/2026 #8: venda lançada com o preço de OUTRO ativo (ex.: um
    // ticker incorporado, "zerado" com a cotação do ticker novo) cria um
    // lucro realizado que nunca existiu - na própria planilha (cabeçalho
    // "Lucro/Prejuízo de todas suas operações") e no Imposto de Renda.
    // Venda de direito/bonificação (preço médio 0) fica de fora.
    rodar: ({ fixtures }) => {
      const msgs = [];
      for (const aba of ['Transações', 'Transações - USA']) {
        for (const l of (fixtures[aba]?.linhas || []).slice(6)) {
          const tk = String(l[0] || '').trim();
          if (!tk || !l[1] || !l[1].__date__ || l[2] !== 'Venda') continue;
          const preco = Number(l[3]), medio = Number(l[9]);
          if (!(preco > 0) || !(medio > 0)) continue;
          const razao = preco / medio;
          if (razao > 4 || razao < 0.25) {
            msgs.push(`"${aba}": ${tk} Venda de ${fmtBr(l[1].__date__.slice(0, 10))} a ${preco} com preço médio ${medio} (${razao.toFixed(1)}x) - lucro/prejuízo da operação ${l[11] ?? '?'}. Confira o preço da venda`);
          }
        }
      }
      return msgs;
    },
  },
];

/** Roda todas as checagens: [{ id, titulo, msgs }]. */
export function verificarQualidadeDados(r) {
  return CHECAGENS_QUALIDADE.map((c) => ({ id: c.id, titulo: c.titulo, msgs: c.rodar(r) }));
}
