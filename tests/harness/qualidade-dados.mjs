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
    id: 'indicesRepetidos',
    titulo: 'aux_historico-indices: nenhum índice repetido na mesma data',
    // 27/09/2026: o IPCA de 01/08/2026 foi gravado 6x (cada execução diária
    // regravava o mês) - o "IPCA (12m)" contava agosto 6 vezes.
    rodar: ({ fixtures }) => {
      const vistos = new Map();
      for (const l of (fixtures['aux_historico-indices']?.linhas || []).slice(1)) {
        if (!l || !l[1] || !l[0] || !l[0].__date__) continue;
        const k = `${l[1]}|${l[0].__date__}`;
        vistos.set(k, (vistos.get(k) || 0) + 1);
      }
      return [...vistos.entries()].filter(([, n]) => n > 1)
        .map(([k, n]) => `${k.split('|')[0]} de ${k.split('|')[1].slice(0, 10)}: ${n} linhas - rode removerIndicesRepetidos(true) no Apps Script (BackfillIndices.gs)`);
    },
  },
  {
    id: 'tickerIncorporado',
    titulo: 'Transações e Transações - USA: nenhum ticker que já foi incorporado por outro (a posição vive no ticker novo)',
    // 27/09/2026: STR (Sitio Royalties) foi incorporada pela VNOM em
    // 19/08/2025; as compras já têm o espelho em VNOM, e a "venda" que
    // zerava a STR usava a cotação de outra empresa (lucro falso de
    // US$ 1.158). apps-script/Incorporacoes.gs tira tudo de uma vez.
    rodar: ({ fixtures }) => {
      const INCORPORADOS = { STR: 'VNOM' };
      const msgs = [];
      for (const aba of ['Transações', 'Transações - USA']) {
        const n = {};
        for (const l of (fixtures[aba]?.linhas || []).slice(6)) {
          const tk = String(l[0] || '').trim().toUpperCase();
          if (INCORPORADOS[tk]) n[tk] = (n[tk] || 0) + 1;
        }
        Object.entries(n).forEach(([tk, q]) => msgs.push(`"${aba}": ${q} linha(s) de ${tk}, incorporada pela ${INCORPORADOS[tk]} - rode limparStrDefinitivo() e depois limparStrDefinitivoAplicar() no Apps Script (Incorporacoes.gs)`));
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
          if (tk === 'STR') continue; // ticker incorporado: a checagem tickerIncorporado já aponta (e diz como resolver)
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
  // ------------------------------------------------------------------------------------------------------------------
  // 06/10/2026 (A-81): 5 checagens novas - as 12 de cima passavam com lote duplicado, P/VP absurdo e fonte 100% em 403/404.
  // `r.fixtures._meta.extraidoEm` é o "hoje" das checagens com prazo (dia em que a planilha foi exportada), pra o resultado
  // não mudar com o relógio.
  // ------------------------------------------------------------------------------------------------------------------
  {
    id: 'loteRfDuplicado',
    titulo: 'Renda Fixa: nenhum lote lançado em dobro (mesmo título, datas a até 3 dias e mesmo valor) em "Transações Renda Fixa" e "RF Contratada - Lotes"',
    // C16-08/A-28: duas compras do mesmo Tesouro Selic no mesmo dia, uma com a instituição "S/A" e outra "S/A." - o valor
    // aplicado fica ~0,2% maior e o IR/rentabilidade deslocados. A instituição fica FORA da chave de propósito (a grafia varia).
    rodar: ({ fixtures }) => {
      const msgs = [];
      const dia = (d) => (d && d.__date__ ? Date.parse(d.__date__.slice(0, 10)) / 86400000 : NaN);
      const achar = (itens, aba, descreve) => {
        const grupos = new Map();
        itens.forEach((it) => { const k = `${it.produto}|${it.mov || ''}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(it); });
        for (const lista of grupos.values()) {
          for (let i = 0; i < lista.length; i += 1) {
            for (let j = i + 1; j < lista.length; j += 1) {
              const a = lista[i], b = lista[j];
              if (Math.abs(a.dia - b.dia) <= 3 && Math.abs(a.valor - b.valor) <= 0.005) {
                msgs.push(`"${aba}": ${descreve(a, b)} - linhas ${a.linha} e ${b.linha} (${a.produto}${a.mov ? `, ${a.mov}` : ''}, R$ ${a.valor.toFixed(2)} em ${fmtBr(new Date(a.dia * 86400000).toISOString().slice(0, 10))} e ${fmtBr(new Date(b.dia * 86400000).toISOString().slice(0, 10))}) - confira no extrato; se foi lançamento em dobro, apague a linha sobrando`);
              }
            }
          }
        }
      };
      const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const transacoes = (fixtures['Transações Renda Fixa']?.linhas || []).map((l, i) => ({ l, linha: i + 1 })).slice(6)
        .filter(({ l }) => l[0] && l[1] && l[1].__date__ && Number(l[7]) > 0)
        .map(({ l, linha }) => ({ produto: norm(l[0]), mov: norm(l[2]), dia: dia(l[1]), valor: Number(l[7]), linha }));
      achar(transacoes, 'Transações Renda Fixa', () => 'lançamento repetido');
      const lotes = (fixtures['RF Contratada - Lotes']?.linhas || []).map((l, i) => ({ l, linha: i + 1 })).slice(1)
        .filter(({ l }) => l[0] && l[2] && l[2].__date__ && Number(l[5]) > 0)
        .map(({ l, linha }) => ({ produto: norm(l[0]), mov: '', dia: dia(l[2]), valor: Number(l[5]), linha }));
      achar(lotes, 'RF Contratada - Lotes', () => 'lote repetido');
      return msgs;
    },
  },
  {
    id: 'fundamentosFaixa',
    titulo: 'P/VP e P/L dentro de uma faixa plausível e sem fonte discordando mais de 3x das outras (aux_fundamentos: planilha/Yahoo/CVM; Auxiliar_ativos)',
    // Ex. achado em 06/10/2026: P/L de um ativo americano em 302 numa fonte e 10,6 no Yahoo; P/VP 31 x 1,98. Quase sempre é
    // a fórmula do Google Finance puxando o campo errado (ou ticker trocado) - o app mostra o "Viés" em cima desse número.
    rodar: ({ fixtures }) => {
      const valores = new Map(); // `${ticker}|${pl|pvp}` -> { fonte: valor }
      const poe = (ticker, metrica, fonte, v) => {
        if (!ticker || typeof v !== 'number' || !Number.isFinite(v)) return;
        const k = `${ticker}|${metrica}`;
        if (!valores.has(k)) valores.set(k, {});
        valores.get(k)[fonte] = v;
      };
      for (const l of (fixtures['aux_fundamentos']?.linhas || []).slice(1)) {
        if (!l || !l[0] || !l[2]) continue;
        let v; try { v = JSON.parse(l[2]).valores || {}; } catch { continue; }
        poe(String(l[0]).trim().toUpperCase(), 'pl', String(l[1]), v.pl);
        poe(String(l[0]).trim().toUpperCase(), 'pvp', String(l[1]), v.pvp);
      }
      for (const l of (fixtures['Auxiliar_ativos']?.linhas || []).slice(1)) {
        if (!l || !l[1]) continue;
        poe(String(l[1]).trim().toUpperCase(), 'pvp', 'Auxiliar_ativos', l[11]);
        poe(String(l[1]).trim().toUpperCase(), 'pl', 'Auxiliar_ativos', l[13]);
      }
      const MAXIMO = { pl: 200, pvp: 25 };
      const nome = { pl: 'P/L', pvp: 'P/VP' };
      const msgs = [];
      for (const [k, porFonte] of valores) {
        const [ticker, metrica] = k.split('|');
        const lista = Object.entries(porFonte);
        const fora = lista.filter(([, v]) => v > MAXIMO[metrica]);
        const positivos = lista.filter(([, v]) => v > 0);
        const razao = positivos.length >= 2 ? Math.max(...positivos.map(([, v]) => v)) / Math.min(...positivos.map(([, v]) => v)) : 1;
        if (fora.length || razao > 3) {
          const fontes = lista.map(([f, v]) => `${f} ${Math.round(v * 100) / 100}`).join(' · ');
          msgs.push(`${ticker} ${nome[metrica]}: ${fontes}${fora.length ? ` - acima de ${MAXIMO[metrica]}` : ''}${razao > 3 ? ` - fontes discordam ${razao.toFixed(1)}x` : ''} - confira a fórmula/ticker dessa fonte`);
        }
      }
      return msgs;
    },
  },
  {
    id: 'tickerErroProventos',
    titulo: 'Proventos e Proventos - USA: nenhuma linha com Ticker "Erro" (a fórmula não achou o ativo)',
    rodar: ({ fixtures }) => {
      const msgs = [];
      for (const aba of ['Proventos', 'Proventos - USA']) {
        (fixtures[aba]?.linhas || []).forEach((l, i) => {
          if (i < 7 || !l || typeof l[2] !== 'string' || l[2].trim().toLowerCase() !== 'erro') return;
          const quando = l[1] && l[1].__date__ ? ` com pagamento em ${fmtBr(l[1].__date__.slice(0, 10))}` : '';
          msgs.push(`"${aba}": linha ${i + 1}${quando}${typeof l[6] === 'number' ? ` (R$ ${l[6].toFixed(2)})` : ''} com Ticker "Erro" - o provento não entra em nenhum ativo; corrija o ticker`);
        });
      }
      return msgs;
    },
  },
  {
    id: 'aporteSemLancamento',
    titulo: 'Aportes "Concluído" têm o lançamento correspondente em até 10 dias (Transações / Transações Renda Fixa; Ações EUA fora)',
    // A-24: o app já mostra o aporte como "a confirmar" enquanto a importação da B3 não traz a compra; passados 10 dias
    // (ACONFIRMAR_DIAS_DEPOIS, Aportes.gs) a compra deveria ter entrado - senão o patrimônio está sem ela.
    rodar: ({ fixtures, sandbox }) => {
      const hoje = String((fixtures._meta && fixtures._meta.extraidoEm) || new Date().toISOString()).slice(0, 10);
      const limite = Date.parse(hoje) / 86400000 - 10;
      const ss = sandbox.SpreadsheetApp.getActiveSpreadsheet();
      return Array.from(sandbox.lancamentosAConfirmarDaPlanilha_(ss))
        .filter((p) => Date.parse(p.data) / 86400000 < limite)
        .map((p) => `Aporte de ${fmtBr(p.data)} concluído sem lançamento: ${p.ativo}${p.destino === 'rendaFixa' ? ` (${p.inst || 'sem instituição'}), R$ ${p.valor}` : `, ${p.qtd} cota(s)`} - lance em "${p.destino === 'rendaFixa' ? 'Transações Renda Fixa' : 'Transações'}" (ou importe o extrato da B3) ou apague o aporte`);
    },
  },
  {
    id: 'registroFontesComProblema',
    titulo: 'Registro de Controle: nenhuma fonte só com "Atenção"/"Erro" nos últimos 7 dias (3+ execuções) nem 3+ "Erro" na semana',
    // A-81 / C16-10/11: o YouTube, o FNet de informes e os Fundamentos chegaram a 100% de 403/404 sem ninguém notar, porque
    // cada execução isolada só vira "Atenção". Aqui a conta é por fonte (texto antes do ":" do Detalhe), nos 7 dias até o
    // registro mais recente, e diz quantas execuções foram de cada status.
    rodar: ({ fixtures }) => {
      const linhas = (fixtures['Registro de Controle']?.linhas || []).slice(1).filter((l) => l && l[0] && l[0].__date__);
      if (!linhas.length) return [];
      const ts = (l) => Date.parse(l[0].__date__);
      const ultimo = Math.max(...linhas.map(ts));
      const fonteDe = (detalhe) => {
        const d = String(detalhe || '').trim();
        const m = d.match(/^([^:]{1,45}):/);
        const bruta = m ? m[1] : d.split(' — ')[0].replace(/\d+/g, '#').slice(0, 40);
        return bruta.replace(/\s+falhou$/i, '').trim() || '(sem texto)';
      };
      const porFonte = new Map();
      for (const l of linhas) {
        if (ultimo - ts(l) >= 7 * 86400000) continue;
        if (/^Já existe uma sincronização/i.test(String(l[3] || ''))) continue; // trava de execução simultânea: por desenho, não é falha da fonte
        const f = fonteDe(l[3]);
        const c = porFonte.get(f) || { Sucesso: 0, Atenção: 0, Erro: 0, ultimoDetalhe: '' };
        const st = ['Sucesso', 'Atenção', 'Erro'].includes(l[2]) ? l[2] : 'Atenção';
        c[st] += 1;
        if (st !== 'Sucesso' && !c.ultimoDetalhe) c.ultimoDetalhe = String(l[3] || '').slice(0, 110);
        porFonte.set(f, c);
      }
      const msgs = [];
      for (const [f, c] of porFonte) {
        const total = c.Sucesso + c['Atenção'] + c.Erro;
        const semSucesso = c.Sucesso === 0 && total >= 3;
        if (semSucesso || c.Erro >= 3) {
          msgs.push(`${f}: ${total} execução(ões) nos últimos 7 dias - ${c.Sucesso} sucesso, ${c['Atenção']} atenção, ${c.Erro} erro${semSucesso ? ' (nenhuma deu certo)' : ''}. Último problema: "${c.ultimoDetalhe}"`);
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
