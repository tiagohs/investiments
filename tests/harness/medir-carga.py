#!/usr/bin/env python3
"""
tests/harness/medir-carga.py - 06/10/2026 (A-42): mede o que cada tela carrega do próprio site (cache frio, sem service worker):
nº de módulos JS, nº de CSS, KB e KB gz (gzip calculado; o servidor local não comprime), e erros de console.

  node tests/harness/previa.mjs 8851 &
  python3 tests/harness/medir-carga.py [--porta 8851] [--esperar 3500] [--largura 1280] [--json saida.json]

Cada cenário abre num contexto novo (cache frio). Cenários com "depois" clicam num item do menu e medem só o que a troca
carregou a mais (o router monta as telas no mesmo documento).
"""
import argparse, asyncio, base64, gzip, json, urllib.request
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--porta', type=int, default=8851)
ap.add_argument('--esperar', type=int, default=3500)
ap.add_argument('--largura', type=int, default=1280)
ap.add_argument('--json')
ap.add_argument('--so', help='só os cenários cujo nome contém este texto')
args = ap.parse_args()

payload = base64.b64encode(json.dumps({'email': 'previa@exemplo.test', 'exp': 4102444800}).encode()).decode().rstrip('=')
TOKEN = f'x.{payload}.y'

CENARIOS = [
    ('Início', 'index.html', None),
    ('Início → Acompanhamento', 'index.html', 'distribuicoes'),
    ('Início → Metas', 'index.html', 'metas'),
    ('Acompanhamento', 'distribuicoes-metas.html', None),
    ('Metas', 'metas.html', None),
    ('Carteiras', 'carteiras/index.html', None),
    ('Ativo (BBAS3)', 'ativo/index.html?ref=BBAS3', None),
    ('Transações', 'transacoes/index.html', None),
    ('Proventos', 'proventos/index.html', None),
    ('Organização', 'organizacao/despesas.html', None),
    ('Login', 'login.html', None),
]


def chamar(url, metodo, corpo):
    req = urllib.request.Request(url, data=corpo.encode() if corpo else None, method=metodo,
                                 headers={'content-type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode()


async def medir(p, nome, pagina, depois):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width': args.largura, 'height': 900}, service_workers='block')
    pg = await ctx.new_page()
    erros = []
    pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: erros.append(str(e)))
    itens = []
    tarefas = []
    base = f'http://localhost:{args.porta}/'

    async def anota(resp):
        u = resp.url
        if not u.startswith(base) or '/__api' in u:
            return
        try:
            corpo = await resp.body()
        except Exception:
            return
        tipo = 'html' if u.split('?')[0].endswith('.html') else u.split('?')[0].rsplit('.', 1)[-1]
        itens.append((tipo, u[len(base):], len(corpo), len(gzip.compress(corpo))))
    pg.on('response', lambda r: tarefas.append(asyncio.ensure_future(anota(r))))

    async def api(route):
        u = route.request.url
        q = u[u.index('?'):] if '?' in u else ''
        corpo = await asyncio.to_thread(chamar, f'http://localhost:{args.porta}/__api{q}', route.request.method, route.request.post_data)
        await route.fulfill(body=corpo, content_type='application/json', headers={'access-control-allow-origin': '*'})
    await pg.route('https://script.google.com/**', api)
    await pg.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    await pg.route('**/accounts.google.com/**', lambda r: r.fulfill(body='', content_type='text/javascript'))
    if pagina != 'login.html':
        await pg.add_init_script(f"try {{ localStorage.setItem('investiments_auth_token', '{TOKEN}'); }} catch (e) {{}}")
    await pg.goto(base + pagina)
    await pg.wait_for_timeout(args.esperar)
    await asyncio.gather(*tarefas)
    if depois:
        antes = len(itens)
        await pg.evaluate("() => { const l = document.querySelector('#navDrawer .nav-link[data-section=\"%s\"], .nav-link[data-section=\"%s\"]'); l.click(); }" % (depois, depois))
        await pg.wait_for_timeout(args.esperar)
        await asyncio.gather(*tarefas)
        itens = itens[antes:]
    await b.close()
    js = [i for i in itens if i[0] == 'js']
    css = [i for i in itens if i[0] == 'css']
    tot = [i for i in itens]
    return {
        'tela': nome, 'js_n': len(js), 'js_kb': round(sum(i[2] for i in js) / 1024), 'css_n': len(css),
        'css_kb': round(sum(i[2] for i in css) / 1024), 'total_kb': round(sum(i[2] for i in tot) / 1024),
        'total_gz_kb': round(sum(i[3] for i in tot) / 1024), 'requisicoes': len(tot), 'erros': erros,
        'arquivos': sorted(i[1] for i in itens),
        'maiores': sorted(((i[2], i[1]) for i in itens), reverse=True)[:6],
    }


async def main():
    res = []
    async with async_playwright() as p:
        for nome, pagina, depois in CENARIOS:
            if args.so and args.so not in nome:
                continue
            res.append(await medir(p, nome, pagina, depois))
    print('| Tela | JS (módulos) | JS KB | CSS | CSS KB | total KB (gz) | req. | erros |')
    print('|---|---|---|---|---|---|---|---|')
    for r in res:
        print(f"| {r['tela']} | {r['js_n']} | {r['js_kb']} | {r['css_n']} | {r['css_kb']} | {r['total_kb']} ({r['total_gz_kb']}) | {r['requisicoes']} | {len(r['erros'])} |")
    for r in res:
        if r['erros']:
            print('ERROS', r['tela'], r['erros'][:3])
    if args.json:
        json.dump(res, open(args.json, 'w'), ensure_ascii=False, indent=1)

asyncio.run(main())
