# Mapa de fórmulas — Investimentos - Controle

Gerado a partir do export `.xlsx` enviado por Tiago em 2026-09-11. Cobre as abas relevantes pro app/automação. Abas puramente pessoais (Despesas Essenciais, Apartamento, ApoioDicas, ⚠️Orientações) foram deixadas de fora — não têm relação com o site.

Todas as abas da planilha, pra referência: Distribuição e Metas, Compras de Investimentos, 📊Dash Geral, Carteira Renda Fixa, 📈Dash Ações, 📈Dash FIIs, 📈Dash Ações USA, Carteira FIIs, Carteira Ações, Transações, Transações - USA, Carteira Ações USA, Bolsa USA >>>, Proventos, 📈Dash Proventos, 📈Dash Proventos USA, Proventos - USA, RV Metas de compra e venda, Despesas Essenciais, Apartamento, ApoioDicas, ⚠️Orientações, Aux_dash_Geral, Aux_dash_Ações, Aux_dash_FIIs, Aux_dash_Proventos, Auxiliar_dash_USA, Auxiliar_app, aux_historico-patrimonio, DB-FIIS, DB-Acoes, DB-Stocks.

---

## Transações / Transações - USA

Cabeçalho na linha 6. Dados começam na linha 7. **Dimensão real da planilha: 10803 linhas (Transações) / 10802 (USA) — só até a linha 387 (BR) / ~15 (USA) tem transação de verdade, mas as fórmulas das colunas G em diante já estão escritas em TODAS as ~10800 linhas, mesmo vazias.** Confirmado testando a linha 5000 e a última linha (10803): a fórmula está lá, idêntica em padrão, só ajustando o número da linha.

**Implicação prática pra automação:** pra lançar uma transação nova (BR ou USA), só precisamos escrever os valores nas colunas A-F da primeira linha realmente vazia (achar via varredura da coluna A, não `getLastRow()` — esse método erra porque as fórmulas ocupam todas as 10800 linhas). Não precisamos copiar nenhuma fórmula pra linha nova — ela já está lá esperando.

Colunas (A-F manuais, G em diante 100% fórmula):

| Col | Rótulo | Tipo | Fórmula (linha 7 como exemplo) |
|---|---|---|---|
| A | Ticker | manual | — |
| B | Data Transação | manual | — |
| C | Tipo da transação | manual (Compra/Venda) | — |
| D | Preço (USD na aba USA) | manual | — |
| E | Qtd. | manual | — |
| F | Taxa transação | manual | — |
| G | Total ações/FIIs | fórmula | `=IF(E7="","",IFERROR($D7*$E7,""))` |
| H | Total + Taxa | fórmula | `=IF(E7="","",IF(C7="Venda",IFERROR(G7-F7,""),IFERROR(G7+F7,"")))` |
| I | Valor ação/FII + Taxa | fórmula | `=IF(E7="","",IFERROR(IF(ISBLANK(E7),"",(H7/E7)),""))` |
| J | Preço médio de compra | fórmula | `=IF(A7="","",AD7)` (aponta pro resultado final da cadeia Q:AD) |
| K | Transação de ações/FIIs (qtd) | fórmula | `=IF($C7="Compra",$E7,-$E7)` (qtd assinada: venda vira negativo) |
| L | Lucro / Prejuízo da operação | fórmula | `=IF(A7="","",IF(C7="Compra","",(I7-J7)*E7))` |
| **M** | **Cotas até a data** | fórmula | `=SUMIF($A$7:$A7,$A7,$K$7:$K7)` — soma acumulada de K por ticker, até a própria linha |
| N | Posição zerada? | fórmula | `=IF(A7="","",IF(M7>0,"","Posição zerada"))` |
| O | Data Ref | fórmula | `=IF(N7="Posição zerada",Q7,"")` |
| P | Cotas atuais | fórmula | `=SUMIF($A$7:$A10803,$A7,$K$7:$K10803)` — total geral (não acumulado até a linha, é o total fixo da coluna toda) |
| Q-AD | (rotuladas "A".."N" — colunas auxiliares sem nome amigável) | fórmula | Cadeia que recalcula o preço médio de compra considerando zeragens de posição (uma espécie de médio ponderado que reseta toda vez que a posição é zerada e reaberta). Não precisa entender/replicar — só precisa saber que existe e que já está pré-preenchida. |

## Carteira Ações / Carteira FIIs / Carteira Ações USA

Uma linha por ticker **já conhecido** (não tem buffer de linhas vazias como Transações). Dimensões reais: Carteira Ações vai até a linha 21 com dado, mas a aba tem até a 29 (linhas 22-29 são só espaçamento em branco, SEM fórmula nenhuma). Carteira FIIs: até a 18 (aba vai até 21). Carteira Ações USA: até a 15, e a aba termina exatamente na 15 — **zero buffer**.

**Implicação prática:** se uma transação nova envolver um ticker que ainda não existe nessa Carteira, o script precisa inserir uma linha nova nessa aba E copiar a fórmula de uma linha existente pra ela (`Range.copyTo()` do Apps Script resolve isso, já que as fórmulas são todas relativas à própria linha). Colunas A-F (Ticker/Nome/Setor/SubSetor/Segmento) são preenchidas manualmente hoje — pra automatizar 100% precisaríamos de uma fonte pra "Nome/Setor/SubSetor/Segmento" de um ticker novo (as abas DB-Acoes/DB-FIIS/DB-Stocks têm fundamentos, mas não confirmei se têm esses campos — fica como ponto em aberto).

Fórmulas centrais (exemplo Carteira Ações, linha 9):
- `Quantidade de ações` = `=SUMIF('Transações'!$A$7:$A29,$A9,'Transações'!$K$7:$K29)` — soma tudo de Transações pra aquele ticker (note que o range aqui é só até a linha 29, não 10803 — outro detalhe: pode ser necessário atualizar esse range se o volume de transações crescer muito além disso, mas com 10803 linhas de folga não é urgente)
- `Preço médio de compra` = `=IFERROR(IF($A9="","",SUMIFS('Transações'!$AD:$AD,'Transações'!$A:$A,$A9,'Transações'!U:U,"Atual")),"")` — pega o preço médio já calculado em Transações, filtrando pela flag "Atual" (coluna U/T da cadeia auxiliar)
- `Fechamento dia anterior` / `Valor atual` / min/max 52 semanas / gráfico sparkline: todos via GOOGLEFINANCE (BR usa prefixo `BVMF:`, USA direto pelo símbolo)
- Fundamentos (DY, VPA, LPA, margens, ROE, ROA, ROIC, CAGR, liquidez): `VLOOKUP` nas abas DB-Acoes (nacional) / DB-FIIS / DB-Stocks (USA)
- `Proventos totais` (só nas carteiras BR): `SUMIFS(Proventos!$G:$G, Proventos!$C:$C, ticker)`

## Carteira Renda Fixa

Cabeçalho linha 8, dados a partir da 9. Quase tudo manual: Código do investimento, Nome/identificador, Tipo de Investimento, Indexador, Rendimento, Quantidade, Preço unitário, Valor Investido, Data de Emissão, Vencimento, **Valor Atualizado (manual — você mesmo digita, não é fórmula)**. Só duas colunas calculadas: `Prazo (meses)` = `DATEDIF(Data Emissão, Vencimento, "m")`, e mais duas ArrayFormulas auxiliares (M, N) que parecem replicar a data/ano de vencimento. Confirma o que você já tinha dito: não tem transação individual de RF nessa planilha, é tudo lançado direto aqui como posição consolidada.

## Proventos / Proventos - USA

Cabeçalho linha 7/8, manual: Data Com, Data do pagamento, Ticker, Tipo do provento, Núm. de ativos, Provento por ativo, Provento líquido. Fórmulas: "Já pago?" (compara com TODAY()), "Mês/Ano pagamento", "Ano", "Tipo" (VLOOKUP contra as Carteiras pra classificar Ações/FIIs), "dentro do período do dashboard?". Mesmo padrão de buffer gigante de linhas pré-formuladas que Transações (5501 linhas).

## aux_historico-patrimonio ⚠️

**Achado importante:** essa aba, do jeito que está agora, ainda contém uma cópia do conteúdo da Auxiliar_app (linhas "Ibovespa:" / "Variação dia Ibovespa (%)" com fórmula GOOGLEFINANCE) — parece ter sido duplicada a partir da Auxiliar_app em vez de criada em branco. Antes de escrevermos a estrutura real (Data/Ticker/Classe/Cotas/Preço/Valor/Câmbio/Valor BRL que desenhamos), precisamos limpar esse conteúdo residual pra não conflitar.

## Distribuição e Metas / Compras de Investimentos

Abas de dashboard/planejamento (metas de alocação, gasto médio, reserva de emergência, total investido por mês via `SUMPRODUCT` sobre Transações). Não são alvo da automação de importação, mas dependem das mesmas colunas B/D/E de Transações — outro motivo pra manter a estrutura de Transações intocada.

## DB-Acoes / DB-FIIS / DB-Stocks

Tabelas de referência (fundamentos por ticker) usadas via VLOOKUP pelas Carteiras. Não tive cabeçalho reconhecido automaticamente (provavelmente por serem importadas via IMPORTHTML/IMPORTXML de outra fonte ou coladas como valores) — não abri em detalhe, ficam como possível fonte pra "Nome/Setor/Segmento" de um ticker novo, a confirmar se precisarmos.
