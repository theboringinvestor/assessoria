#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
platform.html — emojis fora, icones monocromàtiques dins.

Ordre d'operacions (important):
  A. Contextos de TEXT PLA (toast/textContent/<option>/value): treure l'emoji,
     mai posar-hi SVG — es veuria el marcatge en cru.
  B. Normalitzar les tres codificacions d'emoji (literal, \\uXXXX, &#N;) a
     caràcter literal, per poder fer una sola passada uniforme.
  C. Substituir cada emoji per la seva icona SVG.
  D. Injectar el CSS de la icona (.ei) i el refinament de xifres/tipografia.
"""
import io, os, re, subprocess, sys, collections
import icones

BASE = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(BASE, 'platform.html')
html = io.open(F, encoding='utf-8').read()
orig = len(html)
steps = []

# Símbols tipogràfics que NO són emoji: es queden (ja són monocroms i sobris)
KEEP = set('✓✔✕✖✗★☆→←↑↓')


def isemo(ch):
    o = ord(ch)
    if ch in KEEP:
        return False
    return (0x1F300 <= o <= 0x1FAFF) or (0x2600 <= o <= 0x27BF) \
        or (0x2B00 <= o <= 0x2BFF) or o == 0x24D8


def rep(old, new, label, count=1):
    global html
    n = html.count(old)
    assert n == count, 'ESPERAVA %d, TROBAT %d -> %s' % (count, n, label)
    html = html.replace(old, new)
    steps.append(label)


# ══════════════════════════════════════════════════════════════════
# A. TEXT PLA — treure l'emoji, no substituir-lo
# ══════════════════════════════════════════════════════════════════
PLA = [
    ("toast('🎉 El teu compte", "toast('El teu compte", 'toast compte activat'),
    ("'⚠ No s\\'ha pogut desar al núvol", "'No s\\'ha pogut desar al núvol", 'toast fitxa'),
    ("toast('🔔 Recordatori activat", "toast('Recordatori activat", 'toast recordatori'),
    ("(ok?'✓ OK':'⚠️ Ha de sumar 100%')", "(ok?'✓ OK':'Ha de sumar 100%')", 'total pesos'),
    ("toast('⚠️ Els pesos han de sumar", "toast('Els pesos han de sumar", 'toast pesos'),
    ("btn.textContent = '📣 Enviar comunicat';", "btn.textContent = 'Enviar comunicat';",
     'botons comunicat', 3),
    ("toast('✅ Perfil actualitzat", "toast('Perfil actualitzat", 'toast perfil'),
    ("toast('📄 Resultat guardat", "toast('Resultat guardat", 'toast informe'),
]
for old, new, lbl in [(a, b, c) for a, b, c, *_ in PLA]:
    cnt = next((p[3] for p in PLA if p[0] == old and len(p) > 3), 1)
    rep(old, new, 'text pla: ' + lbl, cnt)

# toast('⚠ ...') — 6 avisos diferents, tots amb el mateix prefix
n = html.count("toast('⚠ ")
assert n == 6, 'esperava 6 toasts amb ⚠, trobat %d' % n
html = html.replace("toast('⚠ ", "toast('")
steps.append('text pla: 6 toasts d\'avís')

# <option> de moviments: SVG no renderitza dins d'<option>
for e, w in [('🟢', 'compra'), ('🔴', 'venda'), ('💵', 'dividend'), ('📤', 'comissio')]:
    rep("<option value=\"%s\">%s " % (w, e), "<option value=\"%s\">" % w,
        'option %s sense emoji' % w)

# <option> generats des de dades: treure l'emoji només de l'etiqueta visible
rep("""      return '<option value="'+t.id+'">'+t.emoji+' '+t.ca+'</option>';""",
    """      return '<option value="'+t.id+'">'+t.ca+'</option>';""",
    'option taxonomia (1)')
rep("""var optsCat = ACTIUS_TAXONOMY.map(function(a){ return '<option value="'+a.id+'">'+a.emoji+' '+a.ca+'</option>'; }).join('');""",
    """var optsCat = ACTIUS_TAXONOMY.map(function(a){ return '<option value="'+a.id+'">'+a.ca+'</option>'; }).join('');""",
    'option taxonomia (2 i 3)', 2)
# DIAG_CATS: el value guarda l'emoji (compatibilitat amb dades ja desades),
# així que el conservem al value i el treiem només de l'etiqueta.
rep("""+ DIAG_CATS.map(function(c){ return '<option value="'+c.icon+' '+c.v+'">'+c.icon+' '+c.v+'</option>'; }).join('')""",
    """+ DIAG_CATS.map(function(c){ return '<option value="'+c.icon+' '+c.v+'">'+c.v+'</option>'; }).join('')""",
    'option DIAG_CATS (value intacte)')

# ══════════════════════════════════════════════════════════════════
# B. NORMALITZAR LES TRES CODIFICACIONS
# ══════════════════════════════════════════════════════════════════
def dec_sur(m):
    hi, lo = int(m.group(1), 16), int(m.group(2), 16)
    ch = chr(0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00))
    return ch if isemo(ch) else m.group(0)


def dec_bmp(m):
    ch = chr(int(m.group(1), 16))
    return ch if isemo(ch) else m.group(0)


def dec_ent(m):
    ch = chr(int(m.group(1)))
    return ch if isemo(ch) else m.group(0)


a = len(re.findall(r'\\u([dD]8[0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})', html))
html = re.sub(r'\\u([dD]8[0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})', dec_sur, html)
b = len(re.findall(r'\\u(2[6-7B][0-9a-fA-F]{2})', html))
html = re.sub(r'\\u(2[6-7B][0-9a-fA-F]{2})', dec_bmp, html)
c = len(re.findall(r'&#(\d{5,6});', html))
html = re.sub(r'&#(\d{5,6});', dec_ent, html)
steps.append('normalitzades 3 codificacions (%d surrogats, %d BMP, %d entitats)' % (a, b, c))

# ══════════════════════════════════════════════════════════════════
# C. EMOJI -> ICONA SVG
# ══════════════════════════════════════════════════════════════════
inv = collections.Counter(ch for ch in html if isemo(ch))
falten = [e for e in inv if e not in icones.EMOJI]
assert not falten, 'emojis sense mapejar: %s' % ''.join(falten)

total = 0
# Ordre descendent de codi perquè cap substitució n'afecti una altra
for e in sorted(inv, key=lambda x: -ord(x)):
    n = html.count(e)
    # el selector de variació VS16 va enganxat a l'emoji: se'n va amb ell
    html = html.replace(e + '️', icones.svg(icones.EMOJI[e]))
    html = html.replace(e, icones.svg(icones.EMOJI[e]))
    total += n
steps.append('%d emojis substituïts per %d icones diferents'
             % (total, len(set(icones.EMOJI[e] for e in inv))))

# Selectors de variació orfes
nfe = html.count('️')
html = html.replace('️', '')
if nfe:
    steps.append('%d selectors de variació orfes eliminats' % nfe)

# ══════════════════════════════════════════════════════════════════
# D. CSS: icones + refinament de xifres i tipografia
# ══════════════════════════════════════════════════════════════════
CSS = """
/* ══════════ ICONES MONOCROMÀTIQUES ══════════ */
/* Hereten mida i color del contenidor: els call-sites amb font-size:20px,
   44px, etc. segueixen funcionant sense tocar-los. */
.ei{width:1.15em;height:1.15em;display:inline-block;vertical-align:-.19em;
  fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;
  stroke-linejoin:round;flex-shrink:0}
.sidebar-item-icon .ei{width:17px;height:17px;vertical-align:-.22em;stroke-width:1.6}
.sidebar-item-icon{opacity:.85}
.sidebar-item.active .sidebar-item-icon{opacity:1}

/* ══════════ XIFRES ══════════ */
/* Tabular: les columnes de números deixen de ballar en canviar de valor. */
body{font-variant-numeric:tabular-nums;font-feature-settings:'tnum'}
.kpi-value,.kpi-big,.stat-value,td,th,input[type=number],
[style*="var(--fm)"],[class*="-val"],[class*="-num"],[class*="kpi"]{
  font-variant-numeric:tabular-nums;font-feature-settings:'tnum'}

/* ══════════ TITULARS ══════════ */
/* Pes 500/600 amb tracking negatiu: a pes 400 IBM Plex es veu fluix
   a mides grans. Manté la jerarquia, guanya presència. */
h1,h2,h3,.card-title,.login-title,.portal-hello-name,.score-arquetip,
.pc-nom,.cg-cart-nom,.road-phase-nom,.diag-card-title{
  font-weight:600;letter-spacing:-.025em}
.card-title{font-size:14px;letter-spacing:-.01em}
"""
i = html.index('  --r:12px;--sidebar-w:240px;--topbar-h:56px;\n}')
j = html.index('\n', i + 46)
html = html[:j] + '\n' + CSS + html[j:]
steps.append('CSS: icones + xifres tabulars + titulars a pes 600')

# Or com a token disponible (encara no aplicat enlloc: no canvia res avui)
rep('  --ink:#16233A;--ink-2:#24395C;',
    '  --ink:#16233A;--ink-2:#24395C;--gold:#C8A54A;',
    'token --gold disponible')

io.open(F, 'w', encoding='utf-8').write(html)

print('=' * 64)
for s in steps:
    print('  ✓ ' + s)
print('=' * 64)
print('platform.html: %d -> %d chars (+%.1f%%)' % (orig, len(html), (len(html) - orig) * 100.0 / orig))

resta = collections.Counter(ch for ch in html if isemo(ch))
if resta:
    print('✗ QUEDEN EMOJIS:', resta.most_common())
    sys.exit(1)
print('✓ zero emojis al fitxer')
print('✓ %d icones .ei inserides' % html.count('class="ei"'))

scripts = re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>(.*?)</script>', html, re.DOTALL)
ko = 0
for idx, s in enumerate(scripts):
    p = '/tmp/_pi_%d.js' % idx
    io.open(p, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    print(('  ✓ script %d OK (%d chars)' % (idx, len(s))) if r.returncode == 0
          else ('  ✗ script %d INVÀLID:\n%s' % (idx, r.stderr[:900])))
    ko += (r.returncode != 0)
sys.exit(1 if ko else 0)
