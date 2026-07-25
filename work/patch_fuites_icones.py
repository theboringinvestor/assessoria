#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fuites d'icones cap a contextos de TEXT PLA.

Una icona és marcatge SVG: només es pot posar allà on el navegador interpreta
HTML. Si acaba en textContent, en un alert(), en el cos d'un email o dins
d'una propietat CSS content, es veu el codi en cru — que és exactament el que
passava al subtítol del topbar.

Aquest patch treu la icona de tots aquests punts.
"""
import io, os, re, subprocess, sys

BASE = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(BASE, 'platform.html')
html = io.open(F, encoding='utf-8').read()
orig = len(html)
ICO = re.compile(r'<svg class="ei" viewBox="0 0 24 24">.*?</svg>\s?')
steps = []


def neteja_regio(ini, fi, etiqueta):
    """Treu totes les icones entre dos marcadors literals."""
    global html
    a = html.index(ini)
    b = html.index(fi, a) + len(fi)
    blk = html[a:b]
    n = len(ICO.findall(blk))
    assert n, 'cap icona a la regió: ' + etiqueta
    html = html[:a] + ICO.sub('', blk) + html[b:]
    steps.append('%s — %d icones tretes' % (etiqueta, n))


def neteja_patro(pat, etiqueta, minim=1):
    """Treu la icona de cada coincidència d'un patró (grup 1 = tros a netejar)."""
    global html
    rx = re.compile(pat)
    trobats = [0]

    def sub(m):
        s = m.group(0)
        if not ICO.search(s):
            return s
        trobats[0] += len(ICO.findall(s))
        return ICO.sub('', s)

    html = rx.sub(sub, html)
    assert trobats[0] >= minim, '%s: esperava >=%d, trobat %d' % (etiqueta, minim, trobats[0])
    steps.append('%s — %d icones tretes' % (etiqueta, trobats[0]))


# ── A. Mapa de títols del topbar (s'assigna amb textContent) ──────────
neteja_regio("  var titles = {\n", "  var t = titles[viewId]", 'titles del topbar')

# ── B. toast() — el toast fa servir textContent ───────────────────────
neteja_patro(r"toast\(\s*'[^']*'", 'crides a toast()')

# ── C. Cossos de missatge i email (text pla) ──────────────────────────
for var in ['msgBenv', 'msgPla', 'msgComu', 'msgFinal', 'msgAvis']:
    try:
        neteja_patro(r"\b%s\s*=\s*'(?:[^'\\]|\\.)*'" % var, 'variable %s' % var)
    except AssertionError:
        pass

neteja_patro(r"\bvar (?:msg|text|pregunta|avis|confirmMsg) = '(?:[^'\\]|\\.)*'",
             'var msg/text/pregunta/avis')
neteja_patro(r"content:\s*'(?:[^'\\]|\\.)*'", 'camp content: de missatges')

# ── D. Propietat CSS content: no accepta marcatge ─────────────────────
# L'SVG porta cometes dobles a dins, així que no serveix casar la cadena
# sencera: apuntem directament a content:"<svg ... </svg>"
neteja_patro(r'content:"<svg class="ei" viewBox="0 0 24 24">.*?</svg>\s?"',
             'propietat CSS content')

# ── E. Seqüència ZWJ de família: 3 icones -> 1 de sola ────────────────
m = re.search(r"(<svg class=\"ei\"[^>]*>.*?</svg>)\\u200D<svg class=\"ei\"[^>]*>.*?</svg>"
              r"\\u200D<svg class=\"ei\"[^>]*>.*?</svg>", html)
if m:
    html = html[:m.start()] + m.group(1) + html[m.end():]
    steps.append('família 👨‍👩‍👧 — 3 icones col·lapsades en 1')

io.open(F, 'w', encoding='utf-8').write(html)

print('=' * 64)
for s in steps:
    print('  ✓ ' + s)
print('=' * 64)
print('platform.html: %d -> %d chars' % (orig, len(html)))

# ── Verificació ───────────────────────────────────────────────────────
ok = True


def chk(c, m):
    global ok
    print(('  OK    ' if c else '  FALLA ') + m)
    ok = ok and c


bloc = html[html.index('  var titles = {'):html.index('  var t = titles[viewId]')]
chk('class="ei"' not in bloc, 'cap icona al mapa de títols')
chk(not re.search(r"toast\(\s*'[^']*<svg", html), 'cap icona dins de toast()')
chk(not re.search(r"content:\s*'[^']*<svg class=\"ei\"", html), 'cap icona a camps content:')
chk(not re.search(r'content:"[^"]*<svg', html), 'cap icona a CSS content')
chk(not re.search(r'\.(?:textContent|innerText)\s*=[^;]*<svg class="ei"', html),
    'cap icona en assignació directa a textContent')
chk(not re.search(r'\bvar (?:msg|text) = \'[^\']*<svg class="ei"', html),
    'cap icona a var msg/text')
chk(html.count('<svg') == html.count('</svg>'), 'tots els <svg> tancats (%d)' % html.count('<svg'))

for i, s in enumerate(re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>(.*?)</script>',
                                 html, re.DOTALL)):
    p = '/tmp/_ff%d.js' % i
    io.open(p, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    chk(r.returncode == 0, 'script %d vàlid (%d chars)' % (i, len(s)))
    if r.returncode:
        print(r.stderr[:700])

print('\nicones restants: %d' % html.count('<svg class="ei"'))
sys.exit(0 if ok else 1)
