-- Camada de leitura (docs/arquitetura-leitura-cloudflare.md, §5 Modelo de dados).
-- publicacao: uma linha por tela publicada; corpo = JSON da resposta comprimido em gzip (ADR-03).
CREATE TABLE IF NOT EXISTS publicacao (
  chave TEXT PRIMARY KEY,
  geracao TEXT NOT NULL,
  geracao_ms INTEGER NOT NULL, -- instante da geração (Planilha.gs!carimboEscritaPlanilha_): publicação mais velha nunca sobrescreve a mais nova
  hash TEXT NOT NULL,
  publicado_em TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  corpo BLOB NOT NULL
);
-- estado: geração mais nova publicada e outras marcas de saúde (RF-10).
CREATE TABLE IF NOT EXISTS estado (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
-- noticias_fonte (30/10/2026, docs/noticias.md): o que cada fonte de notícias trouxe na última leitura (tempo real, cada
-- índice, cada canal, cada ativo). As telas noticias* são montadas daqui. O cron também cria a tabela se faltar.
CREATE TABLE IF NOT EXISTS noticias_fonte (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  em TEXT NOT NULL
);
