#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tbi-app.html — mateix sistema d'icones que platform.html.

Abans: 20 SVGs fets a mà amb 6 gruixos de traç diferents (1.6 a 2.2).
Ara:   una sola llibreria compartida, traç 1.7, currentColor, mida en em.

Les pastilles de color de les categories passen a ser icones de traç sobre
fons neutre, com a la plataforma.
"""
import io, os, re, subprocess, sys
import icones

BASE = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(BASE, 'tbi-app.html')
html = io.open(F, encoding='utf-8').read()
orig = len(html)
steps = []


def rep(old, new, label, count=1):
    global html
    n = html.count(old)
    assert n == count, 'ESPERAVA %d, TROBAT %d -> %s' % (count, n, label)
    html = html.replace(old, new)
    steps.append(label)


# Icones que fa servir l'app
NEED = ['briefcase', 'trend-up', 'plus-circle', 'message', 'help', 'logout',
        'arrow-right', 'mobile', 'refresh', 'bell', 'globe', 'banknote', 'home',
        'seedling', 'factory', 'rocket', 'bank', 'file', 'clock', 'medal',
        'tools', 'crypto', 'shuffle', 'handshake', 'building', 'coins', 'box']
for n in NEED:
    assert n in icones.PATHS, 'falta la icona ' + n


def ico(name, extra=''):
    """SVG en línia, dimensionat en em: hereta mida i color del contenidor."""
    return '<svg class="ei%s" viewBox="0 0 24 24">%s</svg>' % (extra, icones.PATHS[name])


# ══════════════════════════════════════════════════════════════════
# 1. CSS de la icona — el mateix contracte que a la plataforma
# ══════════════════════════════════════════════════════════════════
CSS = """
/* ══ ICONES ══ */
/* Mateixa llibreria i mateix contracte que platform.html: 24x24, traç 1.7,
   currentColor i mida en em, així hereten el context on es posen. */
.ei{width:1.15em;height:1.15em;display:inline-block;vertical-align:-.19em;
  fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;
  stroke-linejoin:round;flex-shrink:0}
.nav .ei{width:22px;height:22px;vertical-align:0;transition:transform .18s ease}
.topbar .ei,.btn-primary .ei,.btn-ghost .ei{width:1.1em;height:1.1em}
/* Icona de categoria: traç navy sobre fons neutre, sense color de fons */
.chip{
  width:34px;height:34px;border-radius:10px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  background:var(--g50);border:1px solid var(--line);color:var(--navy)
}
.chip .ei{width:18px;height:18px;vertical-align:0}
.chip-sm{width:28px;height:28px;border-radius:8px}
.chip-sm .ei{width:15px;height:15px}
"""
old_chip = """/* ── Pastilla de categoria (substitueix els emojis) ── */
.chip{
  width:34px;height:34px;border-radius:10px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-family:var(--fm);font-size:11px;font-weight:600;color:#fff;
  letter-spacing:.01em;box-shadow:inset 0 -1px 0 rgba(0,0,0,.12)
}
.chip-sm{width:26px;height:26px;border-radius:8px;font-size:9.5px}"""
rep(old_chip, CSS.strip(), 'CSS: llibreria .ei + pastilla neutra')

# La nav ja no fa servir SVG solts sinó .ei
rep(".nav button svg{width:22px;height:22px;stroke-width:1.7;transition:transform .18s ease}\n",
    '', 'CSS: regla antiga de la nav')
rep(".nav button.active svg{transform:translateY(-1px)}",
    ".nav button.active .ei{transform:translateY(-1px)}", 'CSS: estat actiu de la nav')

# ══════════════════════════════════════════════════════════════════
# 2. Llibreria d'icones al JS + mapa de categories
# ══════════════════════════════════════════════════════════════════
lib = ',\n'.join("  '%s':'%s'" % (n, icones.PATHS[n].replace("'", "\\'")) for n in NEED)
CAT = {
    'rv_global': 'globe', 'rv_dividend': 'banknote', 'rv_reits': 'home',
    'rv_emergents': 'seedling', 'rv_sectorial': 'factory', 'rv_growth': 'rocket',
    'rf_global': 'bank', 'rf_corporativa': 'file', 'rf_govern': 'bank',
    'rf_curt': 'clock', 'rf_emergent': 'globe', 'or': 'medal', 'or_metalls': 'medal',
    'materies': 'tools', 'materies_primeres': 'tools', 'cripto': 'crypto',
    'crypto': 'crypto', 'liquiditat': 'coins', 'alternatius': 'shuffle',
    'crowdlending': 'handshake', 'private_equity': 'building',
    'startups': 'seedling', 'immobiliari': 'home',
}
catmap = ', '.join("%s:'%s'" % (k, v) for k, v in CAT.items())

JS = """// ── Llibreria d'icones ────────────────────────────────────────────────
// La mateixa que platform.html: 24x24, traç 1.7, currentColor. La mida surt
// del CSS (.ei), no de l'SVG, així una icona val per a qualsevol context.
var TBI_ICO = {
%s
};
function ico(nom, cls){
  var d = TBI_ICO[nom];
  if (!d) return '';
  return '<svg class="ei' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24">' + d + '</svg>';
}
// Categoria d'actiu -> icona (abans eren emojis)
var CAT_ICO = {%s};
function icoCat(cat){ return ico(CAT_ICO[cat] || 'box'); }

""" % (lib, catmap)

anchor = "// ── Helpers ──\nfunction $(id){ return document.getElementById(id); }"
assert html.count(anchor) == 1
html = html.replace(anchor, JS + anchor)
steps.append('JS: llibreria de %d icones + mapa de %d categories' % (len(NEED), len(CAT)))

# ══════════════════════════════════════════════════════════════════
# 3. Pastilla de categoria: icona en lloc d'inicials
# ══════════════════════════════════════════════════════════════════
i = html.index('// ── Pastilles de categoria')
j = html.index('\n}', html.index('function chipCat(')) + 2
rep(html[i:j], """// ── Pastilles de categoria ─────────────────────────────────────────────
// Icona de traç sobre fons neutre, igual que a la plataforma. El color
// identificatiu de la categoria ja el dona el donut de distribució.
function chipCat(catId, mida){
  var cls = (mida === 'sm') ? 'chip chip-sm' : 'chip';
  return '<span class="' + cls + '" aria-hidden="true">' + icoCat(catId) + '</span>';
}""", 'chipCat(): icona de traç sobre fons neutre')

# La taula d'emojis i les inicials ja no fan cap servei
i = html.index('// ── Taxonomia mínima')
j = html.index('var CAT_NOM = {')
rep(html[i:j], "// ── Taxonomia mínima: nom llegible per categoria (alineat amb platform.html) ──\n",
    'fora la taula CAT_EMOJI')
rep("""function emojiFor(p){
  if (p && p.cat && CAT_EMOJI[p.cat]) return CAT_EMOJI[p.cat];
  return '•';
}

""", '', 'fora emojiFor()')

# ══════════════════════════════════════════════════════════════════
# 4. SVGs fets a mà -> llibreria
# ══════════════════════════════════════════════════════════════════
SUBST = [
    # nav
    ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3.5v5.1M19.4 15.2l-4.7-2"/></svg>',
     ico('briefcase'), 'nav Cartera'),
    ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 19.5h17"/><path d="M6 15.5l4.2-4.6 3.2 2.6 4.8-6"/><path d="M14.6 7.5h3.6v3.4"/></svg>',
     ico('trend-up'), 'nav Evolució'),
    ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/></svg>',
     ico('plus-circle'), 'nav Aportar'),
    ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.6c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20l1.3-3.4C4.1 15.3 3.5 13.5 3.5 11.6c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z"/></svg>',
     ico('message'), 'nav Missatges'),
    # topbar
    ('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 1 1 3.6 2.8c-.5.2-.8.7-.8 1.2v.6"/><path d="M12 17.2v.01"/></svg>',
     ico('help'), 'topbar Ajuda'),
    ('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/></svg>',
     ico('logout'), 'topbar Sortir'),
    # login
    ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
     ico('arrow-right'), 'login Entrar'),
    ('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18.5h2"/></svg>',
     ico('mobile'), 'login Instal·lar'),
    # botons dins de JS
    ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M20 20v-4.5h-4.5"/></svg>',
     ico('refresh'), 'botó Actualitzar valors'),
    ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
     ico('plus-circle'), 'botó Registrar aportació'),
]
for old, new, lbl in SUBST:
    n = html.count(old)
    assert n >= 1, 'no trobo el SVG de: ' + lbl
    html = html.replace(old, new)
    steps.append('%s (%d)' % (lbl, n))

# Ajuda: el mateix joc d'icones
rep("""var AJUDA_ICONES = {
  cartera:  '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3.5v5.1M19.4 15.2l-4.7-2"/>',
  valors:   '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
  aportar:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
  evolucio: '<path d="M3.5 19.5h17"/><path d="M6 15.5l4.2-4.6 3.2 2.6 4.8-6"/><path d="M14.6 7.5h3.6v3.4"/>',
  missatges:'<path d="M20.5 11.6c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20l1.3-3.4C4.1 15.3 3.5 13.5 3.5 11.6c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z"/>'
};""",
"""var AJUDA_ICONES = { cartera:'briefcase', valors:'refresh', aportar:'plus-circle',
                     evolucio:'trend-up', missatges:'message' };""",
    'ajuda: apunta a la llibreria')
rep("""  var d = AJUDA_ICONES[clau] || AJUDA_ICONES.cartera;""",
    """  var nom = AJUDA_ICONES[clau] || AJUDA_ICONES.cartera;""", 'ajudaItem: variable')
rep("""      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg></div>'""",
    """      + ico(nom) + '</div>'""", 'ajudaItem: crida a ico()')

io.open(F, 'w', encoding='utf-8').write(html)

print('=' * 64)
for s in steps:
    print('  ✓ ' + s)
print('=' * 64)
print('tbi-app.html: %d -> %d chars' % (orig, len(html)))

ok = True


def chk(c, m):
    global ok
    print(('  OK    ' if c else '  FALLA ') + m)
    ok = ok and c


amples = sorted(set(re.findall(r'stroke-width="([\d.]+)"', html)))
chk(html.count('class="ei') >= 10, '%d icones .ei a l\'app' % html.count('class="ei'))
chk('CAT_EMOJI' not in html, 'fora la taula d\'emojis')
chk('emojiFor' not in html, 'fora emojiFor()')
chk('catInicials' not in html or 'chip' in html, 'pastilles convertides')
chk(html.count('<svg') == html.count('</svg>'), 'svg equilibrats (%d)' % html.count('<svg'))
print('     gruixos de traç encara al fitxer: %s  (3/7.5/8 = logotip de marca)' % amples)

for i, s in enumerate(re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.DOTALL)):
    io.open('/tmp/_ai%d.js' % i, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', '/tmp/_ai%d.js' % i], capture_output=True, text=True)
    chk(r.returncode == 0, 'script %d vàlid (%d chars)' % (i, len(s)))
    if r.returncode:
        print(r.stderr[:700])
sys.exit(0 if ok else 1)
