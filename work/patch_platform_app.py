#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
platform.html — accés permanent a l'app mòbil TBI.
1) Entrada fixa al menú lateral (client i admin) que obre el modal d'instal·lació
2) Suport per a items de menú amb accio JS arbitraria (item.action)
3) El banner torna a sortir un cop (clau de localStorage versionada)
4) Banner/modal amb els colors de marca actuals (#16233A, no #1B3A6B)
"""
import io, os, re, subprocess, sys

BASE = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(BASE, 'platform.html')
html = io.open(F, encoding='utf-8').read()
orig = len(html)
steps = []


def rep(old, new, label, count=1):
    global html
    n = html.count(old)
    assert n == count, 'ESPERAVA %d, TROBAT %d -> %s' % (count, n, label)
    html = html.replace(old, new)
    steps.append(label)


# ── 1. Entrada fixa al menú del CLIENT ──────────────────────────────
rep("""  {id:'portal-missatges', icon:'💬', label:'Missatges'},
  {section:'Contingut', collapsible:true},""",
    """  {id:'portal-missatges', icon:'💬', label:'Missatges'},
  {action:'tbiObrirInstallModal', icon:'📱', label:'App mòbil TBI'},
  {section:'Contingut', collapsible:true},""",
    "CLIENT_NAV: entrada 'App mòbil TBI'")

# ── 2. Entrada fixa al menú de l'ADMIN ──────────────────────────────
rep("""  {id:'admin-radar',       icon:'&#128201;', label:'Radar d\\u2019Oportunitats'},
  {section:'Clients'},""",
    """  {id:'admin-radar',       icon:'&#128201;', label:'Radar d\\u2019Oportunitats'},
  {action:'tbiObrirInstallModal', icon:'📱', label:'App mòbil TBI'},
  {section:'Clients'},""",
    "ADMIN_NAV: entrada 'App mòbil TBI'")

# ── 3. setupSidebar: suport per a item.action ───────────────────────
rep("""    } else if (item.external) {
      html += '<button class="sidebar-item" onclick="openExternal(\\'' + item.external + '\\')">'
        + '<span class="sidebar-item-icon">' + item.icon + '</span>'
        + item.label
        + '<span class="sidebar-item-badge">↗</span>'
        + '</button>';""",
    """    } else if (item.external) {
      html += '<button class="sidebar-item" onclick="openExternal(\\'' + item.external + '\\')">'
        + '<span class="sidebar-item-icon">' + item.icon + '</span>'
        + item.label
        + '<span class="sidebar-item-badge">↗</span>'
        + '</button>';
    } else if (item.action) {
      // Item de menú que crida una funció global (p. ex. el modal d'instal·lació
      // de l'app mòbil). No canvia de vista: no porta data-view ni estat actiu.
      html += '<button class="sidebar-item" onclick="if(window[\\'' + item.action + '\\'])window[\\'' + item.action + '\\']()">'
        + '<span class="sidebar-item-icon">' + item.icon + '</span>'
        + item.label
        + '<span class="sidebar-item-badge">↗</span>'
        + '</button>';""",
    'setupSidebar: branca item.action')

# ── 4. El banner torna a sortir un cop ──────────────────────────────
rep("  var KEY = 'tbi_install_banner_dismissed';",
    "  var KEY = 'tbi_install_banner_dismissed_v2';",
    'banner: clau versionada (torna a sortir un cop)')

# ── 5. Banner i modal amb els colors de marca actuals ───────────────
n = html.count('#1B3A6B')
assert n >= 6, 'esperava colors antics al bloc del banner, trobat %d' % n
i0 = html.index('#tbi-install-banner{')
i1 = html.index('</script>', html.index('var KEY = \'tbi_install_banner_dismissed_v2\';'))
blk = html[i0:i1]
blk2 = (blk.replace('#1B3A6B', '#16233A')
           .replace('#0A0A0A', '#16233A')
           .replace('#E8E6E1', '#E4E0D8')
           .replace('#6B6762', '#6B7280')
           .replace('#9A9690', '#9AA1AC')
           .replace('#F4F3F0', '#F2F0EB')
           .replace("font-family:'Fraunces',Georgia,serif;", "font-family:'IBM Plex Sans',sans-serif;"))
assert blk2 != blk
html = html[:i0] + blk2 + html[i1:]
steps.append('banner/modal: paleta de marca + sense Fraunces a interficie')

# Text del banner: més clar que és una app instal·lable
rep("""  <div class="tx"><b>Tens l'app al mòbil</b><span>Entra més ràpid des de la pantalla d'inici.</span></div>""",
    """  <div class="tx"><b>Instal·la l'app TBI al mòbil</b><span>La teva cartera a la pantalla d'inici, sense contrasenya cada cop.</span></div>""",
    'banner: text més explícit')

io.open(F, 'w', encoding='utf-8').write(html)

print('=' * 62)
for s in steps:
    print('  ✓ ' + s)
print('=' * 62)
print('platform.html: %d -> %d chars' % (orig, len(html)))

# Validacio de tots els blocs <script> inline
scripts = re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*type="application/ld\+json")[^>]*>(.*?)</script>',
                     html, re.DOTALL)
print('✓ %d bloc(s) <script> inline a validar' % len(scripts))
ko = 0
for idx, s in enumerate(scripts):
    p = '/tmp/_pf_%d.js' % idx
    io.open(p, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode != 0:
        print('✗ SCRIPT %d INVALID:\n%s' % (idx, r.stderr[:900]))
        ko += 1
    else:
        print('  ✓ script %d OK (%d chars)' % (idx, len(s)))
sys.exit(1 if ko else 0)
