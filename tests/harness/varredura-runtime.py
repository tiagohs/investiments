#!/usr/bin/env python3
"""
tests/harness/varredura-runtime.py - 06/10/2026 (A-42): varredura de runtime de todas as telas (1280 e 390 px) na prévia local:
console sem erro, nenhuma requisição do site falhando (404), prints (opcional) e navegação (gaveta, busca, subabas).

  node tests/harness/previa.mjs 8851 &
  python3 tests/harness/varredura-runtime.py [--porta 8851] [--prints pasta] [--esperar 3000]

Sai com código 1 se alguma tela der erro de console/requisição ou algum passo de navegação falhar.
"""
import argparse, asyncio, base64, json, os, sys, urllib.request
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--porta', type=int, default=8851)
ap.add_argument('--esperar', type=int, default=3000)
ap.add_argument('--prints')
args = ap.parse_args()
BASE = f'http://localhost:{args.porta}/'
payload = base64.b64encode(json.dumps({'email': 'previa@exemplo.test', 'exp': 4102444800}).encode()).decode().rstrip('=')
TOKEN = f'x.{payload}.y'

TELAS = [('inicio', 'index.html'), ('acompanhamento', 'distribuicoes-metas.html'), ('metas', 'metas.html'),
         ('carteiras', 'carteiras/index.html'), ('ativo', 'ativo/index.html?ref=BBAS3'), ('transacoes', 'transacoes/index.html'),
         ('proventos', 'proventos/index.html'), ('organizacao', 'organizacao/despesas.html'), ('login', 'login.html')]


def chamar(url, metodo, corpo):
    req = urllib.request.Request(url, data=corpo.encode() if corpo else None, method=metodo, headers={'content-type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode()


async def nova_pagina(b, largura, login=False):
    ctx = await b.new_context(viewport={'width': largura, 'height': 900})
    pg = await ctx.new_page()
    pg.erros = []
    pg.on('console', lambda m: pg.erros.append('console: ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: pg.erros.append('pageerror: ' + str(e)))
    pg.on('response', lambda r: pg.erros.append(f'HTTP {r.status} {r.url}') if r.url.startswith(BASE) and r.status >= 400 and '/__api' not in r.url else None)

    async def api(route):
        u = route.request.url
        q = u[u.index('?'):] if '?' in u else ''
        corpo = await asyncio.to_thread(chamar, f'http://localhost:{args.porta}/__api{q}', route.request.method, route.request.post_data)
        await route.fulfill(body=corpo, content_type='application/json', headers={'access-control-allow-origin': '*'})
    await pg.route('https://script.google.com/**', api)
    await pg.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    await pg.route('**/accounts.google.com/**', lambda r: r.fulfill(body='', content_type='text/javascript'))
    if not login:
        await pg.add_init_script(f"try {{ localStorage.setItem('investiments_auth_token', '{TOKEN}'); }} catch (e) {{}}")
    return pg


async def main():
    falhas = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for largura in (1280, 390):
            for nome, url in TELAS:
                pg = await nova_pagina(b, largura, login=(nome == 'login'))
                await pg.goto(BASE + url)
                await pg.wait_for_timeout(args.esperar)
                visivel = await pg.evaluate("() => { const m = [...document.querySelectorAll('main')].filter((x) => !x.hidden && x.offsetParent !== null); return m.length ? m[0].innerText.trim().length : 0; }")
                if nome != 'login' and visivel < 50:
                    pg.erros.append(f'main vazio ({visivel} caracteres)')
                if args.prints:
                    os.makedirs(args.prints, exist_ok=True)
                    await pg.screenshot(path=f'{args.prints}/{nome}-{largura}.png', full_page=True)
                # subabas da própria tela
                tabs = await pg.evaluate("() => [...document.querySelectorAll('main:not([hidden]) [data-tab]')].map((t) => t.dataset.tab)")
                vistos = set()
                for t in tabs:
                    if t in vistos:
                        continue
                    vistos.add(t)
                    try:
                        await pg.evaluate("(t) => { const el = document.querySelector('main:not([hidden]) [data-tab=\"' + t + '\"]'); if (el) el.click(); }", t)
                        await pg.wait_for_timeout(700)
                    except Exception as e:
                        pg.erros.append(f'subaba {t}: {e}')
                if args.prints and tabs:
                    await pg.screenshot(path=f'{args.prints}/{nome}-{largura}-subabas.png', full_page=True)
                if pg.erros:
                    falhas.append((largura, nome, pg.erros[:4]))
                print(f'{largura:>5} {nome:<15} subabas={len(vistos):<2} erros={len(pg.erros)}')
                await pg.context.close()

            # navegação entre telas do router (gaveta) + busca + voltar do navegador
            pg = await nova_pagina(b, largura)
            await pg.goto(BASE + 'index.html')
            await pg.wait_for_timeout(args.esperar)

            async def secao():
                return await pg.evaluate("() => document.body.dataset.section")

            async def principal_visivel(id_):
                return await pg.evaluate("(id) => { const m = document.getElementById(id); return !!m && !m.hidden && m.innerText.trim().length > 50; }", id_)
            passos = []
            for chave, id_ in (('distribuicoes', 'page-distribuicoes'), ('metas', 'page-metas'), ('inicio', 'page-inicio')):
                if largura < 840:
                    await pg.evaluate("() => { const b = document.getElementById('navToggleTopo'); if (b) b.click(); }")
                await pg.evaluate("(k) => document.querySelector('#navDrawer .nav-link[data-section=\"' + k + '\"]').click()", chave)
                await pg.wait_for_timeout(args.esperar)
                passos.append((f'gaveta→{chave}', (await secao()) == chave and await principal_visivel(id_)))
            await pg.go_back()
            await pg.wait_for_timeout(1200)
            passos.append(('voltar→metas', (await secao()) == 'metas'))
            await pg.fill('#shellBuscaInput', 'Acompanh')
            await pg.wait_for_timeout(500)
            await pg.evaluate("() => { const o = document.querySelector('#shellBuscaLista [role=option], #shellBuscaLista a, #shellBuscaLista li'); if (o) o.click(); }")
            await pg.wait_for_timeout(args.esperar)
            passos.append(('busca→Acompanhamento', (await secao()) == 'distribuicoes' and await principal_visivel('page-distribuicoes')))
            for passo, ok in passos:
                print(f'{largura:>5} navegação {passo:<28} {"ok" if ok else "FALHOU"}')
                if not ok:
                    falhas.append((largura, 'navegação', [passo]))
            if pg.erros:
                falhas.append((largura, 'navegação', pg.erros[:4]))
            if args.prints:
                await pg.screenshot(path=f'{args.prints}/navegacao-{largura}.png', full_page=True)
            await pg.context.close()
        await b.close()
    for f in falhas:
        print('FALHA', f)
    sys.exit(1 if falhas else 0)

asyncio.run(main())
