#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Amplia portal-fiscalitat amb pestanyes noves.
La calculadora d'IRPF existent es conserva intacta: només es reanomena
a renderFiscalitatIRPF i passa a ser la primera pestanya."""

import io, os, sys

BLK = '/sessions/funny-amazing-bardeen/mnt/outputs'
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BLK, 'platform.html')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BLK, 'platform.html')

with io.open(SRC, encoding='utf-8') as f:
    s = f.read()
orig = len(s)
n = 0

def rep(old, new, label):
    global s, n
    c = s.count(old)
    assert c == 1, 'ANCORA "%s": %d coincidencies (esperava 1)' % (label, c)
    s = s.replace(old, new, 1)
    n += 1
    print('  [ok] %s' % label)

assert 'renderFiscalitatIRPF' not in s, 'el modul ja sembla integrat'

# ── 1) Carregar el motor fiscal ───────────────────────────────────────────
rep('<script src="tbi-hipoteca.js"></script>',
    '<script src="tbi-hipoteca.js"></script>\n<script src="tbi-fiscal.js"></script>',
    'carregar tbi-fiscal.js')

# ── 2) Reanomenar la calculadora existent (passa a ser una pestanya) ──────
# Es conserva byte a byte: nomes canvia el nom de la funcio.
rep('function renderPortalFiscalitat(el){\n  var html = ',
    "// Calculadora d'IRPF de l'estalvi (primera pestanya de portal-fiscalitat).\n"
    "// Es conserva tal qual: nomes ha canviat de nom en passar a ser pestanya.\n"
    'function renderFiscalitatIRPF(el){\n  var html = ',
    'renderPortalFiscalitat -> renderFiscalitatIRPF')

# ── 3) Inserir el bloc de pestanyes + noves calculadores ──────────────────
with io.open(os.path.join(BLK, 'portal_fiscalitat_v2.js'), encoding='utf-8') as f:
    modul = f.read().rstrip('\n')

anchor = """// ════════════════════════════════════════════════════════════════════════════
// MÒDUL D'HIPOTECA I DEUTE (portal-hipoteca)"""
rep(anchor, modul + '\n\n' + anchor, 'insercio del modul de fiscalitat ampliada')

# ── 4) Actualitzar el subtitol de la vista ────────────────────────────────
rep("""['Calculadora fiscal', 'Tributació d\\'inversions · Espanya 2026']""",
    """['Fiscalitat', 'IRPF, compensacions, fons vs ETF, pensions i dividends · 2026']""",
    'subtitol de la vista')

# ── 5) Etiquetes de menu ──────────────────────────────────────────────────
s2 = s.replace("{id:'portal-fiscalitat', icon:'🧾', label:'Calculadora fiscal'}",
               "{id:'portal-fiscalitat', icon:'🧾', label:'Fiscalitat'}")
assert s2 != s, 'no he trobat les entrades de menu'
print('  [ok] etiquetes de menu (%d)' % s.count("{id:'portal-fiscalitat', icon:'🧾', label:'Calculadora fiscal'}"))
s = s2
n += 1

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(s)

print('\n%d substitucions. %d -> %d bytes (%+d)' % (n, orig, len(s), len(s) - orig))
