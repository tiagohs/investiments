// tests/harness/portfolio-fii.test.js
//
// 05/10/2026: PortfolioFii.gs (Tiago: aba "Patrimônio" dos FIIs - imóveis,
// CRI com IPCA/CDI, cotas de outros FIIs). Dados INVENTADOS no formato dos
// CSVs da CVM (conferido com curl em 05/10/2026: inf_trimestral_fii_imovel /
// _ativo / _geral, inf_mensal_fii_ativo_passivo e o informe mensal das
// securitizadoras inf_mensal_cri_classe / _geral). Planilha falsa, CVM e
// Nominatim FALSOS (sem rede). Nenhum dado real do Tiago.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';

const AGORA = new Date('2026-10-05T15:00:00Z'); // 12h de SP
const CNPJ_SH = '11.111.111/0001-11'; // shopping
const CNPJ_PP = '22.222.222/0001-22'; // papel
const SEC = '33.333.333/0001-33';     // securitizadora

const csv = (cab, linhas) => [cab.join(';'), ...linhas.map((l) => l.join(';'))].join('\n');
const GERAL = (extra = []) => csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Data_Entrega', 'Nome_Fundo_Classe', 'Segmento_Atuacao', 'Mandato'],
  [[CNPJ_SH, '2026-06-30', '1', '2026-08-13', 'FII SHOPPING EXEMPLO', 'Shoppings', 'Renda'], [CNPJ_PP, '2026-06-30', '1', '2026-08-14', 'FII PAPEL EXEMPLO', 'Multicategoria', ''], ...extra]);
const IMOVEL = csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Classe', 'Nome_Imovel', 'Endereco', 'Area', 'Numero_Unidades', 'Outras_Caracteristicas_Relevantes', 'Percentual_Vacancia', 'Percentual_Inadimplencia', 'Percentual_Receitas_FII'],
  [
    [CNPJ_SH, '2026-06-30', '1', 'Imóveis para renda acabados', 'Shopping Alfa', 'Av. Brasil, 100 - Centro, Campinas - SP, 13000-000', '30000', '100', '-', '0.05', '0.02', '0.6'],
    [CNPJ_SH, '2026-06-30', '1', 'Imóveis para renda acabados', 'Shopping Beta - 50%', 'Rua das Flores, 200, Curitiba/PR, Brasil, 80000-000', '20000', '1', 'fração ideal de 50%', '0.10', '-0.01', '0.3'],
    [CNPJ_SH, '2026-06-30', '1', 'Imóveis para renda acabados', 'Galpão Logístico Gama', 'Rua Sem Número, Maceió - AL', '10000', '1', '-', '0', '0', '0.1'],
    [CNPJ_SH, '2026-03-31', '1', 'Imóveis para renda acabados', 'Imóvel do trimestre antigo', 'Rua Velha, 1, Recife - PE', '1', '1', '-', '0', '0', '1'],
  ]);
const ATIVO_CAB = ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Tipo', 'Emissor', 'CNPJ_Emissor', 'Emissao', 'Serie', 'Codigo_Acao', 'Nome_Ativo', 'Data_Vencimento', 'Quantidade', 'Valor'];
const ativo = (c, tipo, emissor, emissao, serie, valor, tri = '2026-06-30') => [c, tri, '1', tipo, emissor, '33333333000133', emissao, serie, '', '', '', '1', String(valor)];
const ATIVO = csv(ATIVO_CAB, [
  ativo(CNPJ_PP, 'CRI/CRA', 'CRI_24A0000001 - ALFA SEC', '80', '1', 600),
  ativo(CNPJ_PP, 'CRI/CRA', 'ALFA SECURITIZADORA S.A.', '5', '2', 300),
  ativo(CNPJ_PP, 'CRI/CRA', 'ALFA SECURITIZADORA S.A.', '0', '0', 100),
  ativo(CNPJ_PP, 'FII', 'ZZSH11 - FII EXEMPLO SHOPPING', '', '', 200),
  ativo(CNPJ_PP, 'Outras Cotas de FI', 'FUNDO CAIXA RF', '', '', 50),
  ativo(CNPJ_PP, 'CRI/CRA', 'CRI_24A0000001 - ALFA SEC', '80', '1', 999999, '2026-03-31'), // trimestre antigo: ignorado
  ativo(CNPJ_SH, 'FII', 'ZZPP11 - FII EXEMPLO PAPEL', '', '', 100),
]);
const MENSAL_AP = csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Total_Necessidades_Liquidez', 'Total_Investido', 'Direitos_Bens_Imoveis', 'Imoveis_Renda_Acabados', 'FII', 'CRI_CRA', 'Acoes_Sociedades_Atividades_FII'],
  [
    [CNPJ_SH, '2026-08-01', '1', '20', '900', '800', '800', '100', '0', '0'],
    [CNPJ_PP, '2026-07-01', '1', '10', '1000', '0', '0', '100', '900', '0'],
    [CNPJ_PP, '2026-08-01', '1', '50', '1200', '0', '0', '200', '1000', '0'],
  ]);
const CRI_CLASSE = csv(
  ['CNPJ_Emissora', 'Codigo_Identificacao_Certificado', 'Data_Referencia', 'Versao', 'Classe', 'Numero_Serie', 'Codigo_CETIP', 'Taxa_Juros', 'Data_Vencimento'],
  [
    [SEC, 'BRXXXCRI001', '2026-07-01', '1', 'Sênior', '1', '24A0000001', 'IPCA + 6,5% a.a.', '2030-01-15'],
    [SEC, 'BRXXXCRI001', '2026-08-01', '1', 'Sênior', '1', '24A0000001', 'IPCA + 7,0% a.a.', '2030-01-15'],
    [SEC, 'BRXXXCRI002', '2026-08-01', '1', 'Sênior', '2', '25B0000002', '100% CDI + 3% a.a.', '2031-06-15'],
    [SEC, 'BRXXXCRI002', '2026-08-01', '1', 'Subordinada', '2', '25B0000003', '', ''],
  ]);
const CRI_GERAL = csv(
  ['CNPJ_Emissora', 'Codigo_Identificacao_Certificado', 'Data_Referencia', 'Versao', 'Numero_Emissao'],
  [[SEC, 'BRXXXCRI001', '2026-08-01', '1', '80'], [SEC, 'BRXXXCRI002', '2026-08-01', '1', '5']]);

function montar({ informes = [], nominatim = null, extraAtivo = null, zipsExtra = {} } = {}) {
  const zips = {
    'inf_trimestral_fii_2026.zip': {
      'inf_trimestral_fii_geral_2026.csv': GERAL(),
      'inf_trimestral_fii_imovel_2026.csv': IMOVEL,
      'inf_trimestral_fii_imovel_desempenho_2026.csv': 'lixo',
      'inf_trimestral_fii_ativo_2026.csv': extraAtivo || ATIVO,
      'inf_trimestral_fii_ativo_garantia_rentabilidade_2026.csv': 'lixo',
    },
    'inf_mensal_fii_2026.zip': { 'inf_mensal_fii_ativo_passivo_2026.csv': MENSAL_AP, 'inf_mensal_fii_geral_2026.csv': 'lixo' },
    'inf_mensal_cri_2026.zip': { 'inf_mensal_cri_classe_2026.csv': CRI_CLASSE, 'inf_mensal_cri_geral_2026.csv': CRI_GERAL, 'inf_mensal_cri_creditos_2026.csv': 'lixo' },
    'inf_mensal_cra_2026.zip': { 'inf_mensal_cra_classe_2026.csv': 'CNPJ_Emissora;Codigo_Identificacao_Certificado;Data_Referencia;Versao;Classe;Numero_Serie;Codigo_CETIP;Taxa_Juros;Data_Vencimento', 'inf_mensal_cra_geral_2026.csv': 'CNPJ_Emissora;Codigo_Identificacao_Certificado;Data_Referencia;Versao;Numero_Emissao' },
    ...zipsExtra,
  };
  const ss = planilhaFalsa({
    Auxiliar_ativos: [['Classe', 'Ticker', '', '', '', '', '', 'Qtd'], ['FIIs', 'ZZSH11', '', '', '', '', '', 10], ['FIIs', 'ZZPP11', '', '', '', '', '', 5], ['Ações', 'ZZAA3', '', '', '', '', '', 7]],
    'aux_fii-cnpj': [['Ticker', 'CNPJ', 'Origem', 'Atualizado em'], ['ZZSH11', '11111111000111', 'teste', ''], ['ZZPP11', '22222222000122', 'teste', '']],
    'aux_informes-fii': [['Ticker', 'Categoria/Tipo', 'Assunto', 'Data', 'Documento FNet', 'Atualizado em'], ...informes],
    'Registro de Controle': [['Timestamp', 'Origem', 'Status', 'Detalhe']],
  });
  const chamadas = [];
  const sleeps = [];
  const resp = (code, texto, zip = null, headers = {}) => ({ getResponseCode: () => code, getContentText: () => texto, getHeaders: () => headers, getBlob: () => ({ zip, setContentType() {} }) });
  const estado = { etag: '"v1"', nominatim };
  const { sb, props, registro } = sandboxGas(ss, { agora: AGORA, urlFetch: () => resp(404, '') });
  sb.UrlFetchApp.fetch = (url, op) => {
    const metodo = (op && op.method) || 'get';
    chamadas.push(`${metodo} ${url}`);
    if (/nominatim\.openstreetmap\.org/.test(url)) {
      assert.match(op.headers['User-Agent'], /PortfolioFii.*contato/, 'Nominatim exige User-Agent identificado');
      return estado.nominatim ? estado.nominatim(decodeURIComponent(url.replace(/^.*[?&]q=/, '')), url) : resp(200, '[]');
    }
    if (/dados\.cvm\.gov\.br/.test(url)) {
      const nome = url.replace(/^.*\//, '');
      if (metodo === 'head') return resp(nome in zips ? 200 : 404, '', null, { ETag: estado.etag, 'Content-Length': '123', 'Last-Modified': 'x' });
      const z = zips[nome];
      return z ? resp(200, '', z) : resp(404, 'não achou');
    }
    return resp(404, '');
  };
  sb.Utilities.unzip = (blob) => Object.entries(blob.zip || {}).map(([nome, texto]) => ({ getName: () => nome, getDataAsString: () => texto }));
  sb.Utilities.sleep = (ms) => sleeps.push(ms);
  const linhas = () => sb.portLerLinhas_(ss);
  return { sb, ss, props, registro, chamadas, sleeps, estado, linhas, zips };
}

const nominatimOk = (q) => {
  const ponto = (lat, lon, uf, cidade) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify([{ lat: String(lat), lon: String(lon), address: { 'ISO3166-2-lvl4': `BR-${uf}`, city: cidade } }]) });
  if (/Campinas/.test(q)) return ponto(-22.9, -47.06, 'SP', 'Campinas');
  if (/Curitiba/.test(q) && /^Shopping Beta/.test(q)) return ponto(-25.43, -49.27, 'PR', 'Curitiba');
  if (/^Curitiba, PR$/.test(q)) return ponto(-25.4, -49.2, 'PR', 'Curitiba');
  if (/Maceió/.test(q)) return ponto(-9.66, -35.73, 'SP', 'Maceió'); // UF diferente da esperada (AL): descartado
  return { getResponseCode: () => 200, getContentText: () => '[]' };
};

// ---------------------------------------------------------------------------

test('Portfólio FII: indexador do CRI - IPCA, CDI (DI/Selic), IGP-M, INCC, TR, pré e "Outro"', () => {
  const { sb } = montar();
  const c = (t) => sb.portClassificarTaxa_(t);
  assert.equal(c('IPCA + 7,0000% a.a.'), 'IPCA');
  assert.equal(c('10,50% (aa) mais IPCA'), 'IPCA');
  assert.equal(c('IPCA+ 9,35% a.a'), 'IPCA');
  assert.equal(c('100 % DI 3,00%'), 'CDI');
  assert.equal(c('8,000% (aa) 100% DI'), 'CDI');
  assert.equal(c('CDI + 3,5% a.a.'), 'CDI');
  assert.equal(c('Selic + 1%'), 'CDI');
  assert.equal(c('IGP-M + 8%'), 'IGP-M');
  assert.equal(c('INCC-M + 11,50 %'), 'INCC');
  assert.equal(c('TR + 7,7151%'), 'TR');
  assert.equal(c('PREFIXADO + 0,0001 % a.a'), 'Pré');
  assert.equal(c('14.000 % a.a. (Pré)'), 'Pré');
  assert.equal(c('8,50% a.a.'), 'Pré', 'só número = pré-fixado');
  assert.equal(c('INPC + 5%'), 'Inflação (outro)');
  assert.equal(c('Não definido + 8.900'), 'Outro');
  assert.equal(c('Atualização Monetária: Mensal, de acordo com a var'), 'Outro');
  assert.equal(c(''), 'Outro');
});

test('Portfólio FII: código CETIP e nome da securitizadora saem do texto do emissor', () => {
  const { sb } = montar();
  assert.equal(sb.portExtrairCetip_('CRI_24A2518977 - CANAL CIA DE SEC'), '24A2518977');
  assert.equal(sb.portExtrairCetip_('CRI_21D0546741_DU2 - TRUE SEC'), '21D0546741');
  assert.equal(sb.portExtrairCetip_('TRUE SECURITIZADORA S.A. - CRI - 24F1345887'), '24F1345887');
  assert.equal(sb.portExtrairCetip_('OPEA SECURITIZADORA S.A.'), null);
  assert.equal(sb.portNomeSecuritizadora_('CRI_24A2518977 - CANAL CIA DE SEC'), 'CANAL CIA DE SEC');
  assert.equal(sb.portNomeSecuritizadora_('TRUE SECURITIZADORA S.A. - CRI - 24F1345887'), 'TRUE SECURITIZADORA S.A.');
  assert.equal(sb.portNomeSecuritizadora_('TRUE SEC S.A. - 20G0800227'), 'TRUE SEC S.A.');
  assert.equal(sb.portCnpjFormatado_('2773542000122'), '02.773.542/0001-22', 'a CVM tira o zero da esquerda');
});

test('Portfólio FII: endereço livre da CVM -> cidade/UF só quando dá pra ter certeza', () => {
  const { sb } = montar();
  const p = (t) => plain(sb.portParseEndereco_(t));
  assert.deepEqual([p('Av. Ayrton Senna, 3000 - Barra da Tijuca, Rio de Janeiro - RJ').cidade, p('Av. Ayrton Senna, 3000 - Barra da Tijuca, Rio de Janeiro - RJ').uf], ['Rio de Janeiro', 'RJ']);
  assert.deepEqual([p('R. Sete de Setembro, 555 - Jardim dos Ipês, Suzano -SP, 08674-210').cidade, p('R. Sete de Setembro, 555 - Jardim dos Ipês, Suzano -SP, 08674-210').uf], ['Suzano', 'SP']);
  assert.deepEqual([p('Avenida Jose Luiz Mazzali, 450, Sem Complemento, Santo Antônio, Louveira/SP, Brasil, 13294-002').cidade, p('Avenida Jose Luiz Mazzali, 450, Sem Complemento, Santo Antônio, Louveira/SP, Brasil, 13294-002').uf], ['Louveira', 'SP']);
  assert.deepEqual([p('Rod. Washington Luiz, nº 2.895, Parque Duque,Duque de Caxias - RJ').cidade, p('Rod. Washington Luiz, nº 2.895, Parque Duque,Duque de Caxias - RJ').uf], ['Duque de Caxias', 'RJ']);
  // rua com UF e sem cidade ("R. Brg. Franco - PR"): não confunde a rua com a cidade
  assert.deepEqual(p('R. Brg. Franco - PR'), { endereco: 'R. Brg. Franco - PR', cidade: '', uf: 'PR' });
  // sem UF: nada é chutado
  assert.deepEqual(p('Av. Bandeirantes, nº 4.335'), { endereco: 'Av. Bandeirantes, nº 4.335', cidade: '', uf: '' });
  assert.deepEqual(p('Rua Sé, 10, Sé'), { endereco: 'Rua Sé, 10, Sé', cidade: '', uf: '' }, '"Sé" não é UF');
  assert.deepEqual(p(''), { endereco: '', cidade: '', uf: '' });
  const ln = (t) => plain(sb.portLogradouroNumero_(t));
  assert.deepEqual(ln('Av. Brasil, 100 - Centro, Campinas - SP'), { logradouro: 'Av. Brasil', numero: '100' });
  assert.deepEqual(ln('Estrada do Portela, nº 222, Madureira'), { logradouro: 'Estrada do Portela', numero: '222' });
  assert.deepEqual(ln('EST DOM JOSE ANTONIO DO COUTO Nº 655 CAJURU'), { logradouro: 'EST DOM JOSE ANTONIO DO COUTO', numero: '655' });
  assert.deepEqual(ln('Rua 7 de Setembro'), { logradouro: 'Rua 7 de Setembro', numero: '' }, 'o 7 do nome da rua não é o número');
});

test('Portfólio FII: segmento só pelo NOME e marcado como estimado; nome sem pista fica vazio', () => {
  const { sb } = montar();
  assert.equal(sb.portSegmentoPeloNome_('Shopping Alfa'), 'Shopping');
  assert.equal(sb.portSegmentoPeloNome_('Galpão Logístico Gama'), 'Logística');
  assert.equal(sb.portSegmentoPeloNome_('Torre Norte'), 'Lajes corporativas');
  assert.equal(sb.portSegmentoPeloNome_('Agência Bradesco Centro'), 'Agência bancária');
  assert.equal(sb.portSegmentoPeloNome_('BTLG - Louveira I'), '');
});

test('Portfólio FII: monta o JSON de um fundo de tijolo (imóveis, vacância, % da receita, segmento estimado) e de um de papel (indexador, tipo de ativo, cotas)', () => {
  const t = montar({ nominatim: () => ({ getResponseCode: () => 403, getContentText: () => 'bloqueado' }) });
  const r = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.equal(r.status, 'Atenção', 'Nominatim recusou: aviso, mas o resto sai');
  assert.deepEqual(r.atualizados.sort(), ['ZZPP11', 'ZZSH11']);
  assert.match(r.detalhe, /Nominatim recusou o servidor \(HTTP 403\)/);
  const l = plain(t.linhas());

  const sh = l.ZZSH11.json;
  assert.equal(sh.tipo, 'tijolo');
  assert.equal(sh.segmentoCvm, 'Shoppings');
  assert.deepEqual(sh.ref, { trimestre: '2026-06-30', versao: 1, entrega: '2026-08-13', mensal: '2026-08' });
  assert.equal(sh.imoveis.total, 3, 'só o trimestre mais recente');
  assert.equal(sh.imoveis.areaTotal, 60000);
  const [alfa, beta, gama] = sh.imoveis.itens; // ordenados pela % da receita
  assert.equal(alfa.nome, 'Shopping Alfa'); assert.equal(alfa.cidade, 'Campinas'); assert.equal(alfa.uf, 'SP');
  assert.equal(alfa.pctReceita, 0.6); assert.equal(alfa.vacancia, 0.05); assert.equal(alfa.inadimplencia, 0.02); assert.equal(alfa.segmento, 'Shopping'); assert.equal(alfa.segmentoFonte, 'nome');
  assert.equal(beta.uf, 'PR'); assert.equal(beta.cidade, 'Curitiba'); assert.equal(beta.participacao, '50%'); assert.equal(beta.inadimplencia, null, 'inadimplência negativa não vira dado');
  assert.equal(gama.segmento, 'Logística');
  assert.ok(alfa.k && alfa.k === t.sb.portChaveGeo_(alfa), 'chave de cache estável (servidor e navegador usam a mesma)');
  // composição do mensal (último mês): imóveis 800, FII 100, caixa 20
  assert.equal(sh.composicao.mes, '2026-08');
  assert.deepEqual(sh.composicao.itens.map((i) => [i.chave, i.valor]), [['imoveis', 800], ['cotasFii', 100], ['caixa', 20]]);
  assert.equal(sh.cotas.itens[0].ticker, 'ZZPP11');
  assert.equal(sh.papel, undefined);

  const pp = l.ZZPP11.json;
  assert.equal(pp.tipo, 'papel');
  assert.equal(pp.imoveis, undefined);
  assert.equal(pp.papel.total, 1000, 'o CRI do trimestre antigo não entra');
  assert.equal(pp.papel.identificadoPct, 0.9);
  assert.deepEqual(pp.papel.porIndexador.map((i) => [i.indexador, i.valor, i.pct]), [['IPCA', 600, 0.6], ['CDI', 300, 0.3], ['Não identificado', 100, 0.1]]);
  const [t1, t2, t3] = pp.papel.titulos;
  assert.equal(t1.codigo, '24A0000001'); assert.equal(t1.taxa, 'IPCA + 7,0% a.a.', 'o mês mais novo da securitizadora vale'); assert.equal(t1.vencimento, '2030-01-15'); assert.equal(t1.securitizadora, 'ALFA SEC');
  assert.equal(t2.indexador, 'CDI', 'casou por securitizadora + emissão + série (sem código CETIP no texto)'); assert.equal(t2.emissao, '5'); assert.equal(t2.serie, '2');
  assert.equal(t3.indexador, '', 'emissão/série 0: sem como ligar, fica "Não identificado"');
  assert.deepEqual(pp.porTipoAtivo.map((i) => i.tipo), ['CRI/CRA', 'FII', 'Outras Cotas de FI']);
  assert.equal(pp.cotas.itens[0].nome, 'FII EXEMPLO SHOPPING');
  assert.deepEqual(pp.composicao.itens.map((i) => i.chave), ['cotasFii', 'papel', 'caixa']);

  // planilha: 1 linha por FII, fonte e trimestre; nada de coordenada inventada quando o Nominatim recusou
  assert.match(l.ZZPP11.fonte, /CVM informe trimestral 2026-06-30 v1 \+ mensal 2026-08 \+ securitizadoras/);
  assert.equal(l.ZZSH11.trimestre, '2026-06-30');
  assert.ok(sh.imoveis.itens.every((i) => i.lat === undefined));
  assert.equal(t.ss.aba('aux_fii-portfolio').valores(1).join('|'), 'Ticker|JSON|Fonte|Trimestre|Atualizado em|Fato relevante visto|Conferir|Reprocessar');
  assert.equal(t.registro.length, 1, 'Registro de Controle');
});

test('Portfólio FII: coordenadas - endereço, depois nome+cidade, depois só a cidade; 1 req/s; UF errada descartada; cache permanente', () => {
  const t = montar({ nominatim: nominatimOk });
  t.sb.PropertiesService.getScriptProperties().setProperty('NOMINATIM_CONTATO', 'contato@exemplo.com');
  const r = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.equal(r.status, 'Sucesso');
  const sh = plain(t.linhas()).ZZSH11.json;
  const [alfa, beta, gama] = sh.imoveis.itens;
  assert.deepEqual([alfa.lat, alfa.lon, alfa.precisao], [-22.9, -47.06, 'endereço']);
  assert.deepEqual([beta.lat, beta.lon, beta.precisao], [-25.43, -49.27, 'nome'], 'o endereço não achou: nome + cidade achou');
  assert.deepEqual([gama.lat, gama.lon, gama.precisao], [undefined, undefined, undefined], 'Maceió veio como SP: descartado (outro estado)');
  const reqs = t.chamadas.filter((c) => /nominatim/.test(c));
  assert.ok(reqs.length >= 4 && reqs.length <= 9, `poucas consultas (${reqs.length})`);
  assert.ok(reqs.every((c) => /countrycodes=br/.test(c)));
  assert.ok(t.sleeps.length >= reqs.length - 1 && t.sleeps.every((ms) => ms >= 1000), 'nunca mais que 1 req/s');
  // cache permanente: coordenada achada, falha registrada, e 2ª rodada não consulta de novo
  const cache = t.ss.aba('aux_fii-geocache');
  assert.equal(cache.valores(1).join('|'), 'Chave|Latitude|Longitude|Precisão|Consulta|Atualizado em|UF|Cidade');
  const precisoes = Array.from({ length: cache.getLastRow() - 1 }, (_, i) => cache.valores(i + 2)[3]);
  assert.ok(precisoes.includes('endereço') && precisoes.includes('nome') && precisoes.includes('falhou'));
  const antes = t.chamadas.length;
  t.sb.atualizarPortfolioFii_('Teste');
  assert.equal(t.chamadas.filter((c, i) => i >= antes && /nominatim/.test(c)).length, 0, 'já está no cache (inclusive a falha, por 30 dias)');
});

test('Portfólio FII: só reprocessa com informe novo da CVM (HEAD barato) ou fato relevante novo - que marca "Conferir" e reprocessa na PRÓXIMA execução', () => {
  const t = montar({ nominatim: nominatimOk, informes: [['ZZSH11', 'Fato Relevante', '', '2026-08-20', '111', new Date()]] });
  const r1 = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.deepEqual(r1.atualizados.sort(), ['ZZPP11', 'ZZSH11']);
  assert.equal(plain(t.linhas()).ZZSH11.frVisto, '2026-08-20|111', 'o fato relevante que já existia na 1ª montagem não vira alerta');
  assert.equal(plain(t.linhas()).ZZSH11.conferir, '');

  // 2ª execução, nada mudou: só o HEAD (sem baixar zip, sem Nominatim, sem reescrever)
  t.chamadas.length = 0;
  const r2 = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.deepEqual(r2.atualizados, []);
  assert.deepEqual(t.chamadas, ['head https://dados.cvm.gov.br/dados/FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_2026.zip']);

  // a CVM mudou o arquivo (ETag), mas o informe dos fundos é o mesmo: baixa, compara e NÃO reprocessa
  t.estado.etag = '"v2"';
  t.chamadas.length = 0;
  const r3 = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.deepEqual(r3.atualizados, []);
  assert.ok(t.chamadas.some((c) => /^get .*inf_trimestral_fii_2026\.zip/.test(c)));
  assert.ok(!t.chamadas.some((c) => /inf_mensal_cri/.test(c)), 'sem reprocessar, não baixa os CRI');

  // fato relevante novo no FNet (aux_informes-fii já atualizado pelo gatilho de informes)
  t.ss.aba('aux_informes-fii').getRange(3, 1, 1, 6).setValues([['ZZSH11', 'Fato Relevante', 'Aquisição de imóvel', '2026-10-02', '222', new Date()]]);
  const antes = plain(t.linhas()).ZZSH11.atualizadoEm;
  const r4 = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.deepEqual(r4.marcados, ['ZZSH11']);
  assert.deepEqual(r4.atualizados, [], 'marca agora, reprocessa na próxima execução');
  let l = plain(t.linhas()).ZZSH11;
  assert.match(l.conferir, /Fato relevante de 02\/10\/2026 \(Aquisição de imóvel\) - pode ter mudado, confira/);
  assert.equal(l.reprocessar, true);
  assert.equal(String(l.atualizadoEm), String(antes));
  assert.match(r4.detalhe, /fato relevante novo - conferir: ZZSH11/);

  const r5 = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.deepEqual(r5.atualizados, ['ZZSH11'], 'a próxima execução reprocessa só ele');
  l = plain(t.linhas()).ZZSH11;
  assert.equal(l.reprocessar, false);
  assert.match(l.conferir, /pode ter mudado/, 'o aviso fica até sair informe novo da CVM (a tela compara com a data de entrega)');
  assert.deepEqual(plain(t.linhas()).ZZPP11.reprocessar, false);

  // informe trimestral NOVO na CVM (outro trimestre): reprocessa e limpa o "Conferir"
  const novoGeral = GERAL([[CNPJ_SH, '2026-09-30', '1', '2026-10-04', 'FII SHOPPING EXEMPLO', 'Shoppings', 'Renda']]);
  t.zips['inf_trimestral_fii_2026.zip']['inf_trimestral_fii_geral_2026.csv'] = novoGeral;
  t.estado.etag = '"v3"';
  const r6 = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.deepEqual(r6.atualizados, ['ZZSH11']);
  l = plain(t.linhas()).ZZSH11;
  assert.equal(l.trimestre, '2026-09-30');
  assert.equal(l.conferir, '');
  assert.equal(l.json.imoveis, undefined, 'sem imóveis nesse trimestre do exemplo: o JSON reflete o informe novo, não o antigo');
});

test('Portfólio FII: fundo sem CNPJ fica de fora com aviso; CVM fora do ar = Erro sem apagar o que já tinha', () => {
  const t = montar();
  t.ss.aba('aux_fii-cnpj').getRange(3, 2).setValue('');
  t.sb.CNPJ_FII_CONHECIDOS_ = {};
  const r = plain(t.sb.atualizarPortfolioFii_('Teste'));
  assert.deepEqual(r.atualizados, ['ZZSH11']);
  assert.match(r.detalhe, /sem CNPJ .*ZZPP11/);

  const t2 = montar();
  t2.sb.atualizarPortfolioFii_('Teste');
  const antes = JSON.stringify(plain(t2.linhas()));
  Object.keys(t2.zips).forEach((k) => delete t2.zips[k]);
  const r2 = plain(t2.sb.atualizarPortfolioFii_('Teste', { forcar: true }));
  assert.equal(r2.status, 'Erro');
  assert.equal(JSON.stringify(plain(t2.linhas())), antes, 'a linha anterior continua');
});

test('Portfólio FII: JSON grande cabe na célula (corta endereços e, se preciso, a lista de imóveis)', () => {
  const { sb } = montar();
  const itens = Array.from({ length: 400 }, (_, i) => ({ nome: `Imóvel ${i} `.padEnd(150, 'n'), endereco: 'Rua '.padEnd(200, 'x'), cidade: 'Cidade', uf: 'SP', area: 100, k: `k${i}` }));
  const json = sb.portCompactar_({ ticker: 'ZZ', imoveis: { total: 400, itens } });
  const tam = JSON.stringify(plain(json)).length;
  assert.ok(tam <= 45000, `cabe em 45 mil (${tam})`);
  assert.ok(json.imoveis.omitidos > 0 && json.imoveis.itens.length + json.imoveis.omitidos === 400);
});

test('Portfólio FII: action=fiiPortfolio devolve o JSON guardado + fato relevante + link do FNet; sem linha = existe:false; ticker inválido recusado', () => {
  const t = montar({ nominatim: nominatimOk, informes: [['ZZSH11', 'Fato Relevante', 'Aquisição', '2026-10-02', '222', new Date()]] });
  t.sb.atualizarPortfolioFii_('Teste');
  const r = plain(t.sb.handleFiiPortfolio({ parameter: { ticker: 'zzsh11' } }, { ok: true }));
  assert.equal(r.ok, true); assert.equal(r.existe, true);
  assert.equal(r.portfolio.ticker, 'ZZSH11');
  assert.deepEqual(r.fatoRelevante, { data: '2026-10-02', assunto: 'Aquisição', link: 'https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=222' });
  assert.equal(r.linkFnet, 'https://fnet.bmfbovespa.com.br/fnet/publico/abrirGerenciadorDocumentosCVM?cnpjFundo=11111111000111');
  assert.equal(r.trimestre, '2026-06-30');
  assert.equal(r.faltamCoordenadas, true, 'o galpão de Maceió não achou ponto');
  const sem = plain(t.sb.handleFiiPortfolio({ parameter: { ticker: 'XXXX11' } }, { ok: true }));
  assert.equal(sem.existe, false);
  assert.equal(plain(t.sb.handleFiiPortfolio({ parameter: { ticker: '../x' } }, { ok: true })).ok, false);
  assert.equal(plain(t.sb.handleFiiPortfolio({ parameter: { ticker: 'ZZSH11' } }, { ok: false, erro: 'x' })).etapa, 'autenticação');
});

test('Portfólio FII: coordenadas vindas do navegador - só chave que existe, só dentro do Brasil; entra no JSON e no cache', () => {
  const t = montar(); // Nominatim "não acha nada": o navegador completa
  t.sb.atualizarPortfolioFii_('Teste');
  const itens = plain(t.linhas()).ZZSH11.json.imoveis.itens;
  const k = itens[0].k;
  const coords = [
    { k, lat: -22.9, lon: -47.06, p: 'endereço', u: 'SP', c: 'Campinas' },
    { k: itens[1].k, lat: 48.8, lon: 2.3, p: 'endereço' },          // Paris: fora do Brasil
    { k: 'nao-existe', lat: -22.9, lon: -47.06 },                    // chave que não é deste fundo
  ];
  const r = plain(t.sb.handleFiiPortfolioCoords({ parameter: { ticker: 'ZZSH11', coords: JSON.stringify(coords) } }));
  assert.deepEqual(r, { ok: true, salvos: 1 });
  const novo = plain(t.linhas()).ZZSH11.json.imoveis.itens;
  assert.deepEqual([novo[0].lat, novo[0].lon, novo[0].precisao], [-22.9, -47.06, 'endereço']);
  assert.equal(novo[1].lat, undefined);
  const cache = t.ss.aba('aux_fii-geocache');
  const linhasCache = Array.from({ length: cache.getLastRow() - 1 }, (_, i) => cache.valores(i + 2));
  assert.ok(linhasCache.some((l) => l[0] === k && l[4] === 'navegador' && l[6] === 'SP'));
  assert.equal(plain(t.sb.handleFiiPortfolioCoords({ parameter: { ticker: 'XXXX11', coords: '[]' } })).ok, false);
  assert.equal(plain(t.sb.handleFiiPortfolioCoords({ parameter: { ticker: 'ZZSH11', coords: 'lixo' } })).ok, false);
});
