// 07/10/2026 (Tiago, sync de documentos): Gastos.gs remove vários arquivos numa reescrita só e guarda os
// cartões/contas encerrados; Proventos.gs lê o "Mês conferido" mesmo quando o Sheets virou o texto em data
// (era por isso que o painel dizia que o extrato de proventos não tinha chegado). Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, AbaFalsa, D, plain } from './planilha-falsa.mjs';

const lanc = (o) => ({ mes: '2025-10', data: '2025-09-20', origem: 'cartao', fonte: 'ourocard', descricao: 'LOJA INVENTADA', categoria: 'compras', valor: 10, tipo: 'compra', parcela: '', ...o });

test('Gastos.gs: excluirArquivosGastos_ tira vários arquivos e os lançamentos deles de uma vez', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  const agora = new sb.Date(2025, 10, 2);
  ['A', 'B', 'C'].forEach((id, k) => sb.salvarImportacaoGastos_(ss, { id, nome: `${id}.pdf`, fonte: 'ourocard', modificado: 'm', meses: ['2025-10'] }, [lanc({ chaveDedup: `k${k}`, descricao: `LOJA ${id}` })], agora));
  assert.equal(plain(sb.lerGastos_(ss)).lancamentos.length, 3);
  const r = plain(sb.excluirArquivosGastos_(ss, ['A', 'C', 'C', '', 'nao-existe']));
  assert.deepEqual([r.ok, r.removidos, r.lancamentosRemovidos], [true, 2, 2]);
  const g = plain(sb.lerGastos_(ss));
  assert.deepEqual(g.arquivos.map((a) => a.id), ['B']);
  assert.deepEqual(g.lancamentos.map((l) => l[9]), ['B']);
  assert.equal(plain(sb.excluirArquivosGastos_(ss, [])).ok, false);
  assert.deepEqual(plain(sb.excluirArquivoGastos_(ss, 'B')), { ok: true, id: 'B' }, 'o de um só continua igual');
});

test('Gastos.gs: fontes encerradas - normaliza, volta no lerGastos_, [] reativa', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  assert.deepEqual(plain(sb.lerGastos_(ss)).fontesEncerradas, []);
  const r = plain(sb.salvarFontesEncerradasGastos_(['OuroCard', 'bradesco', 'bradesco', '<script>', '']));
  assert.deepEqual(r, { ok: true, fontesEncerradas: ['ourocard', 'bradesco'], mesesSemMovimento: {} });
  assert.deepEqual(plain(sb.lerGastos_(ss)).fontesEncerradas, ['ourocard', 'bradesco']);
  sb.salvarFontesEncerradasGastos_([]);
  assert.deepEqual(plain(sb.lerGastos_(ss)).fontesEncerradas, []);
});

test('Proventos.gs: "Mês conferido" gravado como DATA pelo Sheets ainda conta; resumoExtratoB3_ dá o último mês', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss, { agora: new Date('2026-10-15T15:00:00Z') });
  assert.equal(sb.resumoExtratoB3_(ss), null, 'nunca chegou');
  ss.abas['aux_proventos-conferencia'] = new AbaFalsa('aux_proventos-conferencia', [
    ['Linha', 'Ticker / mês', 'Tipo', 'Data pagamento', 'Valor líquido', 'Quantidade', 'Arquivo', 'Registrado em'],
    ['B3', 'AAAA11', 'Rendimento', D(sb, '2026-09-15', 12), 10.5, 10, 'extrato-inventado.xlsx', D(sb, '2026-10-03', 9)],
    ['Mês conferido', D(sb, '2026-08-01'), '', D(sb, '2026-08-31', 12), '', '', 'agosto-inventado.xlsx', D(sb, '2026-09-02', 9)],
    ['Mês conferido', D(sb, '2026-09-01'), '', D(sb, '2026-09-30', 12), '', '', 'extrato-inventado.xlsx', D(sb, '2026-10-03', 9)],
  ]);
  const per = plain(sb.lerConferenciaB3Proventos_(ss)).periodos;
  assert.deepEqual(per.map((p) => [p.mes, p.fim, p.conferidoEm]), [['2026-08', '2026-08-31', '2026-09-02'], ['2026-09', '2026-09-30', '2026-10-03']]);
  const r = plain(sb.resumoExtratoB3_(ss));
  assert.deepEqual([r.ultimoMes, r.fim, r.conferidoEm, r.arquivo, r.meses], ['2026-09', '2026-09-30', '2026-10-03', 'extrato-inventado.xlsx', ['2026-08', '2026-09']]);
  // texto com apóstrofo (como o site grava agora) também
  ss.abas['aux_proventos-conferencia'].l[3][1] = "'2026-08";
  assert.equal(plain(sb.lerConferenciaB3Proventos_(ss)).periodos[0].mes, '2026-08');
});

test('Gastos.gs: meses sem fatura por fonte - normaliza, não apaga as encerradas (e vice-versa), lê o formato antigo', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  sb.PropertiesService.getScriptProperties().setProperty('GASTOS_FONTES_ENCERRADAS', JSON.stringify(['ourocard'])); // formato de antes
  assert.deepEqual(plain(sb.lerGastos_(ss)).fontesEncerradas, ['ourocard']);
  let r = plain(sb.salvarFontesEncerradasGastos_(null, { 'nubank-cartao': ['2024-09', '2024-08', '2024-08', '2024-13', 'x'], '<x>': ['2024-01'] }));
  assert.deepEqual(r, { ok: true, fontesEncerradas: ['ourocard'], mesesSemMovimento: { 'nubank-cartao': ['2024-08', '2024-09'] } });
  r = plain(sb.salvarFontesEncerradasGastos_(['ourocard', 'bradesco'], null));
  assert.deepEqual(r.mesesSemMovimento, { 'nubank-cartao': ['2024-08', '2024-09'] }, 'encerrar não apaga os meses sem fatura');
  const g = plain(sb.lerGastos_(ss));
  assert.deepEqual([g.fontesEncerradas, g.mesesSemMovimento], [['ourocard', 'bradesco'], { 'nubank-cartao': ['2024-08', '2024-09'] }]);
  sb.salvarFontesEncerradasGastos_([], {});
  assert.deepEqual(plain(sb.lerGastos_(ss)).mesesSemMovimento, {});
});

test('cache de respostas: a versão do código entra no carimbo (publicar código novo não serve a resposta da versão anterior)', () => {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss);
  const c = sb.carimboEscritaPlanilha_();
  assert.ok(c.startsWith(sb.VERSAO_CODIGO_CACHE_ + '.'), c);
  assert.ok(sb.chaveCacheGastos_(ss, {}).includes(sb.VERSAO_CODIGO_CACHE_), 'a chave do cache de gastos muda com a versão');
});
