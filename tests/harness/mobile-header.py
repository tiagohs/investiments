#!/usr/bin/env python3
"""
tests/harness/mobile-header.py - 05/10/2026 (auditoria A-01): prova que um botao DENTRO de cada painel do header
(Registro de Controle/sync, Carrinho, Consolidacao) recebe o toque em 390 px.

Bug original: .shell-fixo{position:sticky; z-index:50} cria contexto de empilhamento; os paineis moram dentro dele e o
#shell-backdrop (z 55) ficava de fora, por cima: elementFromPoint no painel devolvia o backdrop e "Limpar cache"
so fechava o painel. A correcao poe o backdrop DENTRO do .shell-fixo.

Uso (precisa do servidor de previa rodando; usa dados reais do fixtures.json so pra montar a tela):
  node tests/harness/previa.mjs 8801 &
  python3 tests/harness/mobile-header.py [--porta 8801] [--largura 390] [--pagina index.html]
Sai com codigo 0 se todos os paineis passam, 1 se algum falha.
"""
import argparse, asyncio, base64, json, sys, urllib.request
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--porta', type=int, default=8790)
ap.add_argument('--largura', type=int, default=390)
ap.add_argument('--altura', type=int, default=844)
ap.add_argument('--pagina', default='index.html')
ap.add_argument('--esperar', type=int, default=3500)
args = ap.parse_args()

payload = base64.b64encode(json.dumps({'email': 'previa@exemplo.test', 'exp': 4102444800}).encode()).decode().rstrip('=')
TOKEN = f'x.{payload}.y'

# (nome, id do wrap, id do botao que abre, id do painel, id de um botao real dentro do painel)
PAINEIS = [
    ('Registro de Controle', None, 'syncBadgeBtn', 'syncPanel', 'limparCacheBtn'),
    ('Carrinho', 'carrinhoWrap', 'carrinhoBtn', 'carrinhoPanel', None),
    ('Consolidacao', 'consolWrap', 'consolBtn', 'consolPanel', 'consolGo'),
]

JS_PROBE = """
([wrapId, painelId, botaoId]) => {
  const doc = document;
  if (wrapId) { const w = doc.getElementById(wrapId); if (w) w.hidden = false; }
  const painel = doc.getElementById(painelId);
  let alvo = botaoId ? doc.getElementById(botaoId) : null;
  if (!alvo) {   // painel sem botao proprio (carrinho vazio): injeta um botao-sonda no fim do conteudo
    alvo = doc.createElement('button');
    alvo.type = 'button'; alvo.id = 'sondaPainel'; alvo.textContent = 'sonda'; alvo.className = 'btn btn-primary';
    painel.appendChild(alvo);
  }
  alvo.scrollIntoView({ block: 'nearest' });
  return alvo.id;
}
"""

JS_ONDE = """
(alvoId) => {
  const el = document.getElementById(alvoId);
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const topo = document.elementFromPoint(x, y);
  return { x, y, visivel: r.width > 0 && r.height > 0, acertou: !!topo && (topo === el || el.contains(topo)),
           topo: topo ? (topo.id ? '#' + topo.id : topo.className || topo.tagName) : null };
}
"""


async def main():
    falhas = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': args.largura, 'height': args.altura}, has_touch=True, is_mobile=True)

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
        await pg.wait_for_selector('#syncBadgeBtn', state='attached')

        # o toque em qualquer botao so e REGISTRADO (fase de captura) e barrado: nao dispara sincronizacao nem limpeza de verdade
        await pg.evaluate("""() => {
          window.__toques = [];
          window.addEventListener('click', (e) => { const t = e.target.closest('button'); if (t && t.closest('.overlay-panel') && !t.closest('[data-toggle-panel]')) {
            window.__toques.push(t.id); e.stopImmediatePropagation(); e.preventDefault(); } }, true);
        }""")

        for nome, wrap, abre, painel, botao in PAINEIS:
            await pg.evaluate("() => document.getElementById('shell-backdrop') && document.getElementById('shell-backdrop').click()")
            alvo_id = await pg.evaluate(JS_PROBE, [wrap, painel, botao])
            await pg.click(f'#{abre}')
            await pg.wait_for_timeout(250)
            aberto = await pg.evaluate("(id) => document.getElementById(id).classList.contains('open')", painel)
            if not aberto:
                falhas.append(f'{nome}: o painel nao abriu ao tocar em #{abre}')
                continue
            onde = await pg.evaluate(JS_ONDE, alvo_id)
            if not onde['visivel']:
                falhas.append(f'{nome}: o botao #{alvo_id} nao esta visivel')
                continue
            if not onde['acertou']:
                falhas.append(f'{nome}: elementFromPoint no botao #{alvo_id} devolveu {onde["topo"]} (algo por cima do painel)')
                continue
            await pg.mouse.click(onde['x'], onde['y'])
            toques = await pg.evaluate('() => window.__toques')
            if alvo_id not in toques:
                falhas.append(f'{nome}: o clique em #{alvo_id} nao chegou ao botao (toques: {toques})')
                continue
            fechou_com_o_clique = not await pg.evaluate("(id) => document.getElementById(id).classList.contains('open')", painel)
            if fechou_com_o_clique:
                falhas.append(f'{nome}: o clique no botao fechou o painel (foi parar no backdrop)')
                continue
            print(f'ok  {nome}: #{alvo_id} recebeu o clique a {args.largura}px')

        # o backdrop continua funcionando: tocar fora do painel fecha
        await pg.evaluate("() => { document.getElementById('shell-backdrop').classList.remove('open'); document.querySelectorAll('.overlay-panel').forEach(p => p.classList.remove('open')); }")
        await pg.click('#syncBadgeBtn')
        await pg.wait_for_timeout(200)
        # canto inferior esquerdo, longe do painel (que fica no topo)
        await pg.mouse.click(5, args.altura - 5)
        await pg.wait_for_timeout(200)
        if await pg.evaluate("() => document.getElementById('syncPanel').classList.contains('open')"):
            falhas.append('Backdrop: tocar fora do painel nao fechou o painel')
        else:
            print('ok  Backdrop: tocar fora fecha o painel')
        await b.close()

    if falhas:
        print('\nFALHOU:')
        for f in falhas:
            print(' -', f)
        sys.exit(1)
    print('\ntodos os paineis do header recebem o toque')

asyncio.run(main())
