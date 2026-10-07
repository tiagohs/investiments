// destino-renda-fixa.js - 07/10/2026 (Tiago: fundo guardado pra comprar a chácara com amigos).
//
// UM conceito, UMA fonte: o DESTINO de um título da Renda Fixa é 'emergencial' | 'longo-prazo' | 'objetivo'. A fonte é a coluna B da aba
// "Carteira Renda Fixa" (o Apps Script lê com destinoRendaFixa_, Planilha.gs - este módulo é o espelho dele no navegador):
//   "Renda Emergencial"                                            -> emergencial
//   "Objetivo" / "Reservado" / "Reservado para objetivos" / "Meta" -> objetivo
//   qualquer outra coisa                                           -> longo-prazo
// O servidor já manda o destino pronto (`marca` em Meus Ativos, `tipoCarteira` em Carteiras), então aqui o normal é receber um dos 3
// tokens; o texto cru da coluna B (ex. `categoria` em Aportes) também é aceito. Toda tela que decide emergencial x longo prazo x objetivo
// chama destinoRendaFixa() em vez de comparar texto.

export const DESTINO_EMERGENCIAL = 'emergencial';
export const DESTINO_LONGO_PRAZO = 'longo-prazo';
export const DESTINO_OBJETIVO = 'objetivo';
export const DESTINOS_RENDA_FIXA = [DESTINO_EMERGENCIAL, DESTINO_LONGO_PRAZO, DESTINO_OBJETIVO];

/** Rótulo completo de cada destino (na tela). */
export const ROTULO_DESTINO_RF = {
  [DESTINO_EMERGENCIAL]: 'Renda Emergencial',
  [DESTINO_LONGO_PRAZO]: 'Renda Fixa de longo prazo',
  [DESTINO_OBJETIVO]: 'Reservado para objetivos',
};

/** Rótulo curto (chips, tags). */
export const ROTULO_DESTINO_RF_CURTO = {
  [DESTINO_EMERGENCIAL]: 'Emergência',
  [DESTINO_LONGO_PRAZO]: 'Longo prazo',
  [DESTINO_OBJETIVO]: 'Objetivos',
};

/** O que se escreve na coluna B da Carteira Renda Fixa pra cada destino. */
export const TEXTO_COLUNA_B_DESTINO_RF = {
  [DESTINO_EMERGENCIAL]: 'Renda Emergencial',
  [DESTINO_LONGO_PRAZO]: 'Renda Fixa',
  [DESTINO_OBJETIVO]: 'Objetivo',
};

const semAcento = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const TEXTOS_OBJETIVO = ['objetivo', 'objetivos', 'reservado', 'reservado para objetivo', 'reservado para objetivos', 'meta', 'metas'];

/** 'emergencial' | 'longo-prazo' | 'objetivo' a partir do texto da coluna B ou de um dos 3 tokens que o servidor manda. */
export function destinoRendaFixa(valor) {
  const t = semAcento(valor);
  if (t === 'renda emergencial' || t === DESTINO_EMERGENCIAL) return DESTINO_EMERGENCIAL;
  if (TEXTOS_OBJETIVO.includes(t)) return DESTINO_OBJETIVO;
  return DESTINO_LONGO_PRAZO;
}

export const ehObjetivoRf = (valor) => destinoRendaFixa(valor) === DESTINO_OBJETIVO;
export const ehEmergencialRf = (valor) => destinoRendaFixa(valor) === DESTINO_EMERGENCIAL;

/** O ativo é uma posição de Renda Fixa 'objetivo'? (`marca` em Meus Ativos). */
export const ativoRfObjetivo = (a) => !!a && a.classe === 'rf' && destinoRendaFixa(a.marca) === DESTINO_OBJETIVO;
export const ativoRfEmergencial = (a) => !!a && a.classe === 'rf' && destinoRendaFixa(a.marca) === DESTINO_EMERGENCIAL;
