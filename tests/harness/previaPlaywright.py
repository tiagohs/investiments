#!/usr/bin/env python3
"""
tests/harness/previaPlaywright.py - 02/10/2026: prints de qualquer página do
site com os dados reais (fixtures.json), usando o servidor de prévia
(tests/harness/previa.mjs, que precisa estar rodando).

  node tests/harness/previa.mjs 8790 &
  python3 tests/harness/previaPlaywright.py index.html saida.png [--largura 1400] [--escuro] [--porta 8790] [--esperar 2500]

As chamadas ao Apps Script são redirecionadas pro servidor local; o pdf.js e
as fontes do Google não são baixados (a rede do sandbox pode não alcançar).
"""
import argparse, asyncio, base64, json, urllib.request
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('pagina')
ap.add_argument('saida')
ap.add_argument('--largura', type=int, default=1400)
ap.add_argument('--altura', type=int, default=900)
ap.add_argument('--escuro', action='store_true')
ap.add_argument('--porta', type=int, default=8790)
ap.add_argument('--esperar', type=int, default=2500)
ap.add_argument('--inteira', action='store_true', help='print da página inteira')
args = ap.parse_args()

payload = base64.b64encode(json.dumps({'email': 'previa@exemplo.test', 'exp': 4102444800}).encode()).decode().rstrip('=')
TOKEN = f'x.{payload}.y'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': args.largura, 'height': args.altura}, color_scheme='dark' if args.escuro else 'light')
        erros = []
        pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: erros.append(str(e)))

        def chamar(url, metodo, corpo):
            req = urllib.request.Request(url, data=corpo.encode() if corpo else None, method=metodo,
                                         headers={'content-type': 'application/x-www-form-urlencoded'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode()

        async def api(route):
            u = route.request.url
            q = u[u.index('?'):] if '?' in u else ''
            corpo = await asyncio.to_thread(chamar, f'http://localhost:{args.porta}/__api{q}', route.request.method, route.request.post_data)
            await route.fulfill(body=corpo, content_type='application/json', headers={'access-control-allow-origin': '*'})
        await pg.route('https://script.google.com/**', api)
        await pg.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
        await pg.route('**/accounts.google.com/**', lambda r: r.fulfill(body='', content_type='text/javascript'))
        await pg.add_init_script(f"try {{ localStorage.setItem('investiments_auth_token', '{TOKEN}'); }} catch (e) {{}}")
        await pg.goto(f'http://localhost:{args.porta}/{args.pagina}')
        await pg.wait_for_timeout(args.esperar)
        await pg.screenshot(path=args.saida, full_page=args.inteira)
        print('erros:', erros)
        await b.close()

asyncio.run(main())
