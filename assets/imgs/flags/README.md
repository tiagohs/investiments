# Bandeiras dos países (assets/imgs/flags)

03/10/2026 - pedido do Tiago (Metas › Viagem): "Inclua dropdown de Países e
Cidades, bandeiras dos países (baixe daqui
https://github.com/hampusborgos/country-flags) [...] podemos salvar local, nos assets".

- Origem: repositório [hampusborgos/country-flags](https://github.com/hampusborgos/country-flags),
  pasta `svg/` (baixado em 03/10/2026), um arquivo por país: `<código ISO 3166-1 alfa-2 em minúsculas>.svg`.
- Licença: domínio público - o `package.json` do repositório declara `"license": "PD"` e o
  README explica que "the flags are not under copyright protection since flags are in public
  domain" (as imagens vêm do Wikimedia Commons). Pode haver restrições de USO de bandeiras
  em alguns países (ex.: uso comercial/ofensivo), nada que afete mostrar a bandeira ao lado
  do nome do país.
- Só os países de `assets/data/paises.json` (223 - países e os territórios mais visitados;
  ~2,7 MB no total). A tela carrega cada SVG sob demanda (`loading="lazy"`), e o service
  worker guarda as imagens no cache (cache-first).
- Pra incluir um país: acrescente-o em `assets/data/paises.json` e copie o `<codigo>.svg`
  da pasta `svg/` do repositório acima.
