#!/usr/bin/env python3
"""
tests/harness/extrair-fixtures.py — extrai as abas que
montarSerieHistoricoInicio_/calcularFluxoCaixaDiario_ (apps-script/) leem
de um export .xlsx real da planilha, no MESMO formato que
SpreadsheetApp.getRange(...).getValues() devolveria (array de arrays,
1 linha por row, datas viram Date de verdade no harness) — pra
tests/harness/gas-vm-harness.mjs rodar o código de produção sem mudar
nada nele. Ver comentário no topo do harness.

Uso:
  python3 tests/harness/extrair-fixtures.py "/caminho/Investimentos - Controle NN.xlsx" [saida.json]

Extrai a lista fixa SHEETS + toda aba que apps-script/*.gs usa (varredura do texto; ver abas_usadas_no_codigo).
Aba que o código usa e não existe no .xlsx sai como AVISO e em _meta.abasAusentesNaPlanilha.

Precisa de openpyxl (`pip install openpyxl --break-system-packages` se
não tiver).
"""
import sys
import os
import re
import json
import datetime

try:
    import openpyxl
except ImportError:
    print('openpyxl não instalado. Rode: pip install openpyxl --break-system-packages', file=sys.stderr)
    sys.exit(1)

SHEETS = [
    'aux_historico-patrimonio',
    'aux_historico-renda-fixa',
    'aux_historico-indices',
    'Transações',
    'Transações - USA',
    'Transações Renda Fixa',
    'Carteira Renda Fixa',
    'Proventos',
    'Proventos - USA',
    # --- 20/09/2026: acrescentadas pra rodar as funções LIVE das telas de
    # Carteiras (montarHome_/montarCarteirasHome_/montarCarteiraClasse_/
    # montarCarteirasRendaFixa_) contra dados reais, a pedido do Tiago
    # ("veja se os números lá batem também") ---
    '📊Dash Geral',
    'Auxiliar_app',
    'Distribuição e Metas',
    'Auxiliar_ativos',
    'Carteira FIIs',
    'RF Contratada - Resumo',
    'RF Contratada - Lotes',
    # --- 26/09/2026: tela Organização Financeira (Despesas.gs) ---
    'Despesas Essenciais',
    # --- 06/10/2026: auditoria geral - metas, patrimônio, gastos, aportes, fundamentos,
    # câmbio e o histórico de sincronizações (abas que não existirem são puladas) ---
    'Registro de Controle',
    'Bolsa USA >>>',
    'aux_metas',
    'aux_patrimonio',
    'aux_gastos',
    'aux_gastos-arquivos',
    'aux_aportes',
    'aux_aportes_eua',  # 07/10/2026: criada pelo Aportes.gs (origem das linhas de Ações EUA gravadas por aporte); pulada se a planilha ainda não tiver
    'aux_fundamentos',
    'aux_fundamentos-historico',
    'aux_fundamentos-resumo',  # 06/10/2026: criada pelo Fundamentos.gs; pulada se a planilha ainda não tiver
    'aux_proventos-conferencia',
    'aux_proventos-anunciados',
    'aux_fii-cnpj',
    'aux_informes-fii',
    'Salário',
]


# 06/10/2026 (A-74): a lista acima envelhecia (8 abas já usadas pelo código não estavam nela e a prévia devolvia ok:true
# vazio em silêncio). Agora o extrator também varre apps-script/*.gs e extrai TODA aba que o código usa: constantes
# `var ...ABA... = '...'`, getSheetByName('...'), insertSheet('...') e `aba: '...'` (LANC_ABAS). Mesma varredura do
# teste tests/harness/abas-contrato.test.js (fixtures-exigidas.mjs!abasDoCodigo) - mantenha as duas em sincronia.
GS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps-script')


def _sem_comentarios(texto):
    texto = re.sub(r'/\*[\s\S]*?\*/', '', texto)
    return re.sub(r"(^|[^:'\"\\])//.*$", r'\1', texto, flags=re.M)


def abas_usadas_no_codigo(gs_dir=GS_DIR):
    """{nome_da_aba: {'arquivos': [...], 'criadaPeloCodigo': bool}} lido do texto dos .gs."""
    achadas = {}
    if not os.path.isdir(gs_dir):
        return achadas
    for arq in sorted(os.listdir(gs_dir)):
        if not arq.endswith('.gs'):
            continue
        with open(os.path.join(gs_dir, arq), encoding='utf-8') as f:
            codigo = _sem_comentarios(f.read())
        constantes = {m.group(1): m.group(2) for m in re.finditer(r"\b(?:var|const|let)\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^'\n]+)'", codigo)}
        def registrar(nome, cria=False):
            if not nome or nome.startswith('http'):
                return
            d = achadas.setdefault(nome, {'arquivos': [], 'criadaPeloCodigo': False})
            if arq not in d['arquivos']:
                d['arquivos'].append(arq)
            d['criadaPeloCodigo'] = d['criadaPeloCodigo'] or cria
        for nome_const, valor in constantes.items():
            if 'ABA' in nome_const or 'SHEET' in nome_const:
                registrar(valor)
        for m in re.finditer(r"\b(?:getSheetByName|insertSheet)\(\s*('([^'\n]+)'|([A-Z][A-Z0-9_]*))\s*\)", codigo):
            nome = m.group(2) or constantes.get(m.group(3))
            registrar(nome, cria='insertSheet' in m.group(0))
        for m in re.finditer(r"\baba:\s*'([^'\n]+)'", codigo):
            registrar(m.group(1))
    # nomes só de teste/instrução (aux_tests é a aba-sandbox do modo teste da importação B3)
    achadas.pop('aux_tests', None)
    return achadas


def serialize(v):
    if isinstance(v, datetime.datetime):
        return {'__date__': v.isoformat()}
    if isinstance(v, datetime.date):
        return {'__date__': v.isoformat() + 'T00:00:00'}
    if isinstance(v, datetime.time):
        return {'__date__': '1899-12-30T' + v.isoformat()}
    if v is None:
        return None
    return v


def validacoes_por_aba(xlsx_path):
    """07/10/2026 (Tiago: lançamento da B3 gravou só Produto+Data e parou - a coluna Movimentação da planilha só aceita
    "Compra,Venda"): as VALIDAÇÕES DE DADOS (lista) de cada aba, lidas direto do XML do .xlsx (o openpyxl read_only não
    traz). { aba: [ { ref: 'C7:C10800', lista: ['Compra','Venda'] | None, listaRef: "'Aba'!$B$1:$B$3" | None, rejeita: bool } ] }.
    O harness (gas-vm-harness.mjs) recusa a escrita fora da lista, como o Apps Script."""
    import zipfile, html
    out = {}
    try:
        z = zipfile.ZipFile(xlsx_path)
        wbx = z.read('xl/workbook.xml').decode('utf-8', 'ignore')
        rels = z.read('xl/_rels/workbook.xml.rels').decode('utf-8', 'ignore')
    except Exception as e:  # noqa: BLE001
        print('AVISO: não consegui ler as validações do .xlsx:', e, file=sys.stderr)
        return out
    alvo_por_id = {}
    for m in re.finditer(r'<Relationship\b([^>]*)/?>', rels):
        a = m.group(1)
        i = re.search(r'Id="([^"]+)"', a)
        t = re.search(r'Target="([^"]+)"', a)
        if i and t:
            alvo_por_id[i.group(1)] = t.group(1)
    for m in re.finditer(r'<sheet\b([^>]*)/?>', wbx):
        a = m.group(1)
        nome = re.search(r'name="([^"]+)"', a)
        rid = re.search(r'r:id="([^"]+)"', a)
        if not nome or not rid or rid.group(1) not in alvo_por_id:
            continue
        alvo = alvo_por_id[rid.group(1)].lstrip('/')
        caminho = alvo if alvo.startswith('xl/') else 'xl/' + alvo
        try:
            x = z.read(caminho).decode('utf-8', 'ignore')
        except KeyError:
            continue
        regras = []
        for attrs, corpo in re.findall(r'<dataValidation\b([^>]*)>(.*?)</dataValidation>', x, re.S):
            tipo = re.search(r'type="([^"]+)"', attrs)
            if not tipo or tipo.group(1) != 'list':
                continue
            ref = re.search(r'sqref="([^"]+)"', attrs)
            f1 = re.search(r'<formula1>(.*?)</formula1>', corpo, re.S)
            if not ref or not f1:
                continue
            formula = html.unescape(f1.group(1)).strip()
            lista, lista_ref = None, None
            if formula.startswith('"') and formula.endswith('"'):
                lista = [v.strip() for v in formula[1:-1].split(',')]
            else:
                lista_ref = formula
            rejeita = 'showErrorMessage="1"' in attrs and 'errorStyle="warning"' not in attrs and 'errorStyle="information"' not in attrs
            for parte in ref.group(1).split():
                regras.append({'ref': parte, 'lista': lista, 'listaRef': lista_ref, 'rejeita': rejeita})
        if regras:
            out[html.unescape(nome.group(1))] = regras
    return out


def main():
    if len(sys.argv) < 2:
        print('uso: extrair-fixtures.py <planilha.xlsx> [saida.json]', file=sys.stderr)
        sys.exit(1)
    xlsx_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'fixtures.json')

    wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)

    usadas = abas_usadas_no_codigo()
    validacoes = validacoes_por_aba(xlsx_path)
    todas = list(SHEETS) + [n for n in sorted(usadas) if n not in SHEETS]
    ausentes = []
    out = {}
    for nome in todas:
        if nome not in wb.sheetnames:
            quem = ', '.join(usadas[nome]['arquivos']) if nome in usadas else 'lista SHEETS deste script'
            criada = ' (o código cria a aba no 1º uso - normal se ela ainda não existe)' if usadas.get(nome, {}).get('criadaPeloCodigo') else ''
            print(f'AVISO: aba "{nome}" usada em {quem} não está na planilha - pulando (fixture ficará ausente){criada}.', file=sys.stderr)
            ausentes.append(nome)
            continue
        ws = wb[nome]
        linhas = [[serialize(c) for c in row] for row in ws.iter_rows(values_only=True)]
        last_row_idx = 0
        for i, linha in enumerate(linhas, start=1):
            if any(c is not None for c in linha):
                last_row_idx = i
        out[nome] = {'linhas': linhas[:last_row_idx], 'lastRow': last_row_idx}
        if nome in validacoes:
            out[nome]['validacoes'] = validacoes[nome]
        print(nome, '-> lastRow', last_row_idx, 'cols', len(linhas[0]) if linhas else 0)

    # 23/09/2026 #4: de onde as fixtures vieram - o relatório de conferência
    # das telas (relatorio-telas.mjs) mostra isso no topo. A "data dos
    # dados" de verdade (último sync de preços) é lida das próprias linhas.
    # Chaves com "_" na frente não são abas (o harness pula).
    out['_meta'] = {
        'arquivo': os.path.basename(xlsx_path),
        'arquivoModificadoEm': datetime.datetime.fromtimestamp(os.path.getmtime(xlsx_path), datetime.timezone.utc).isoformat(),
        'extraidoEm': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        # 06/10/2026 (A-74): o teste de contrato (abas-contrato.test.js) diz QUAL aba falta e por quê
        'abasUsadasNoCodigo': sorted(usadas),
        'abasAusentesNaPlanilha': sorted(ausentes),
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)

    print('gravado', out_path, '-', os.path.getsize(out_path), 'bytes')


if __name__ == '__main__':
    main()
