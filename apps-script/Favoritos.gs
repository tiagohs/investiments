/**
 * Favoritos.gs — ativos favoritos da Início (23/09/2026, pedido do Tiago:
 * "inclua nos cards do Meus Ativos um botão pra adicionar aos favoritos.
 * Salve em algum lugar (pode ser na aba auxiliar da planilha)... Esses
 * favoritos aparecem em uma área acima de rentabilidade... drag and drop").
 *
 * Onde fica: aba "Auxiliar_favoritos" da própria planilha (criada sozinha no
 * 1º salvamento). Coluna A = id do ativo ("classe:ref", ex. "acoes:BBAS3",
 * "usa:VNOM", "rf:BRSTNCLF1RI1" - ver inicio-favoritos.js!idFavoritoDoAtivo),
 * na ORDEM em que aparecem na tela; coluna B = quando foi salvo. Dá pra
 * olhar/editar à mão - a linha 1 é o cabeçalho.
 *
 * Leitura: handleHome (Home.gs) devolve `favoritos` junto com o resto da
 * Início (nenhuma chamada a mais). Gravação: doPost action=salvarFavoritos,
 * parâmetro `ids` = JSON de um array de strings (a lista INTEIRA, já na
 * ordem - cada salvamento substitui a anterior).
 *
 * Depois de colar: Implantar → Gerenciar implantações → ✎ → Nova versão.
 */

var ABA_FAVORITOS = 'Auxiliar_favoritos';
var MAX_FAVORITOS = 200;
var MAX_TAMANHO_ID_FAVORITO = 80;

/** Lista de ids na ordem salva ([] se a aba ainda não existe). */
function lerFavoritos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_FAVORITOS);
  if (!aba) return [];
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];
  var ids = [];
  aba.getRange(2, 1, ultima - 1, 1).getValues().forEach(function (linha) {
    var id = String(linha[0] == null ? '' : linha[0]).trim();
    if (id && ids.indexOf(id) === -1) ids.push(id);
  });
  return ids;
}

/** Valida e normaliza a lista vinda do front. Lança erro com mensagem clara. */
function normalizarListaFavoritos_(bruto) {
  var lista;
  try { lista = JSON.parse(bruto); } catch (e) { throw new Error('ids precisa ser um JSON (array de textos)'); }
  if (!Array.isArray(lista)) throw new Error('ids precisa ser um array');
  if (lista.length > MAX_FAVORITOS) throw new Error('no máximo ' + MAX_FAVORITOS + ' favoritos');
  var ids = [];
  lista.forEach(function (item) {
    if (typeof item !== 'string') throw new Error('cada id precisa ser texto');
    var id = item.trim();
    if (!id || id.length > MAX_TAMANHO_ID_FAVORITO || !/^[a-z]+:.+$/.test(id)) throw new Error('id inválido: ' + item);
    if (ids.indexOf(id) === -1) ids.push(id);
  });
  return ids;
}

/** Grava a lista inteira (substitui a anterior) e devolve o que ficou salvo. */
function salvarFavoritos_(ids) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = ss.getSheetByName(ABA_FAVORITOS) || ss.insertSheet(ABA_FAVORITOS);
    var ultima = aba.getLastRow();
    if (ultima >= 2) aba.getRange(2, 1, ultima - 1, 2).clearContent();
    aba.getRange(1, 1, 1, 2).setValues([['Ativo (classe:ref)', 'Salvo em']]);
    if (ids.length) {
      var agora = new Date();
      aba.getRange(2, 1, ids.length, 2).setValues(ids.map(function (id) { return [id, agora]; }));
    }
  } finally {
    lock.releaseLock();
  }
  return lerFavoritos_();
}

function handleSalvarFavoritos(e) {
  try {
    var ids = normalizarListaFavoritos_(e.parameter.ids);
    return jsonOut({ ok: true, favoritos: salvarFavoritos_(ids) });
  } catch (err) {
    return jsonOut({ ok: false, etapa: 'salvarFavoritos', erro: String(err && err.message ? err.message : err) });
  }
}
