#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Noms de cartera i d'arquetip: explícits, no decoratius.

Abans:  «IV · Amsterdam» + «L'Arquitecte — Brunelleschi»
Ara:    «Moderat · Multi-actiu»

Els noms bons ja existien a les dades (camps `perfil` i `nom` de cada
arquetip); la ciutat, el número romà i el personatge històric els tapaven.

Els dos camps mantenen el seu paper original al disseny:
  cartRoma -> abans el número romà, ara el PERFIL DE RISC («Moderat»)
              — segueix sent l'etiqueta curta que va davant del nom
  cartNom  -> el nom complet («Moderat · Multi-actiu»)
Així els llocs que ja pintaven `cartRoma + ' · ' + nom` queden correctes sols.

No cal migrar res a Supabase: la plataforma deriva el nom de l'arquetip
a cada càrrega i ignora el text desat.
"""
import io, os, re, subprocess, sys

BASE = os.path.dirname(os.path.abspath(__file__))
steps = []


def rep(txt, old, new, label, count=1):
    n = txt.count(old)
    assert n == count, 'ESPERAVA %d, TROBAT %d -> %s' % (count, n, label)
    steps.append(label)
    return txt.replace(old, new)


# ══════════════════════════════════════════════════════════════════
# 1. tbi-perfil.js — l'origen del nom
# ══════════════════════════════════════════════════════════════════
P = os.path.join(BASE, 'tbi-perfil.js')
js = io.open(P, encoding='utf-8').read()
js0 = len(js)
js = rep(js,
    """        cartNom: a.ciutat, cartRoma: ROMAN[i] + " · " + a.ciutat, cartSub: a.sub,""",
    """        perfil: a.perfil, soph: a.soph, ciutat: a.ciutat,
        // Noms explícits: perfil de risc + estratègia. La ciutat i el número
        // romà eren decoratius i no deien res al client.
        cartNom: a.perfil + " · " + a.nom,
        cartRoma: a.perfil,
        cartSub: a.sub,""",
    'tbi-perfil.js: cartNom = «Perfil · Nom», cartRoma = perfil')
io.open(P, 'w', encoding='utf-8').write(js)

# ══════════════════════════════════════════════════════════════════
# 2. platform.html
# ══════════════════════════════════════════════════════════════════
F = os.path.join(BASE, 'platform.html')
h = io.open(F, encoding='utf-8').read()
h0 = len(h)

# ── L'arquetip passa a dir-se pel que és ──
h = rep(h, "arquetip: arq.nom + ' — ' + arq.ep.split('·')[0].trim(),",
        "arquetip: arq.perfil + ' · ' + arq.nom,", 'arquetip (llistat de clients)')
h = rep(h, "arquetip: raw.arquetip || arq.nom + ' — ' + arq.ep.split('·')[0].trim(),",
        "arquetip: arq.perfil ? (arq.perfil + ' · ' + arq.nom) : (raw.arquetip || arq.nom),",
        'arquetip (fitxa del client)')
h = rep(h, "arquetip: c.arquetip ? c.arquetip.split('—')[0].trim() : '—',",
        """arquetip: (function(){
          var a = getArquetip(deriveArquetipId(c.arquetip));
          return (a && a.perfil) ? (a.perfil + ' · ' + a.nom)
               : (c.arquetip ? c.arquetip.split('—')[0].trim() : '—');
        })(),""",
        'arquetip derivat, no llegit del text desat')

# ── Cartera: sempre derivada, mai el text desat ──
h = rep(h, "cartera: raw.cartera || arq.cartNom,", "cartera: arq.cartNom || raw.cartera,",
        'cartera derivada abans que el text desat')
h = rep(h, "          return (arq && arq.cartRoma) ? arq.cartRoma : (c.cartera || '—');",
        "          return (arq && arq.cartNom) ? arq.cartNom : (c.cartera || '—');",
        'columna Cartera del llistat')

# ── Usos on cartRoma anava sol: ha de ser el nom complet ──
for old, new, lbl in [
    ("autoVal:arq.cartRoma", "autoVal:arq.cartNom", 'Full de Ruta · referència de cartera'),
    ("var carteraTitolAuto = 'Cartera ' + arq.cartRoma;",
     "var carteraTitolAuto = 'Cartera ' + arq.cartNom;", 'Full de Ruta · títol'),
]:
    h = rep(h, old, new, lbl)

n = h.count("(arq ? arq.cartRoma : '')")
assert n == 4, "esperava 4 usos a la generacio del Full de Ruta, trobat %d" % n
h = h.replace("(arq ? arq.cartRoma : '')", "(arq ? arq.cartNom : '')")
steps.append('generació del Full de Ruta · 4 usos')

# ── Desduplicar allà on es pintaven cartRoma i cartNom junts ──
h = rep(h, "' + arq.cartRoma + ' \\u00b7 ' + arq.cartNom",
        "' + arq.cartNom", 'matching: sense duplicar el nom')

# ── Personatge històric fora ──
h = rep(h, """      + '<div style="font-size:11px;color:rgba(255,255,255,.35);font-style:italic;margin-bottom:8px">' + arq.ep + '</div>'\n""",
        '', 'fitxa de perfil: fora el personatge històric')
h = rep(h, """        + '<div class="cg-arq-nom">' + arq.nom + ' — ' + arq.ep.split('·')[0].trim() + ' · ' + arq.cartSub + '</div>'""",
        """        + '<div class="cg-arq-nom">' + arq.cartSub + '</div>'""",
        'carteres model: fora el personatge històric')

# ── Etiqueta central del donut: l'estratègia ──
h = rep(h, "centerLabel: arq.cartNom.split('·')[0].trim()", "centerLabel: arq.nom",
        'donut: etiqueta central = estratègia')

# ── Dades de demostració ──
h = rep(h, """  arquetipId: 'arquitecte',\n  arquetip: "L'Arquitecte — Brunelleschi",\n  cartera: 'IV · Amsterdam',""",
        """  arquetipId: 'multiactiu',\n  arquetip: 'Moderat · Multi-actiu',\n  cartera: 'Moderat · Multi-actiu',""",
        'client de demostració')
for old, new in [
    ("arquetipId:'arquitecte', arquetip:\"L'Arquitecte\", cartera:'IV · Amsterdam'",
     "arquetipId:'multiactiu', arquetip:'Moderat · Multi-actiu', cartera:'Moderat · Multi-actiu'"),
    ("arquetipId:'estoic', arquetip:\"L'Estoic\", cartera:'I · Nova York'",
     "arquetipId:'totindex', arquetip:'Agressiu · Tot índex global', cartera:'Agressiu · Tot índex global'"),
    ("arquetipId:'explorador', arquetip:\"L'Exploradora\", cartera:'II · Singapur'",
     "arquetipId:'dinamic_alt', arquetip:'Dinàmic · Dinàmic alternatiu', cartera:'Dinàmic · Dinàmic alternatiu'"),
    ("arquetipId:'tresorer', arquetip:\"El Tresorer\", cartera:'V · Ginebra'",
     "arquetipId:'preservacio_div', arquetip:'Defensiu · Preservació diversificada', cartera:'Defensiu · Preservació diversificada'"),
    ("arquetipId:'navegant', arquetip:\"La Navegant\", cartera:'III · Roma'",
     "arquetipId:'equilibrat', arquetip:'Moderat · Equilibrat', cartera:'Moderat · Equilibrat'"),
]:
    h = rep(h, old, new, 'demo: ' + old.split("'")[1])

h = rep(h, "Arquetip: L\\'Arquitecte. Cartera: Amsterdam.",
        "Arquetip: Moderat \\u00b7 Multi-actiu.", 'informe de demostració')
h = rep(h, '// CARTERES MODEL — 10 arquetips amb noms de ciutats',
        '// CARTERES MODEL — 13 arquetips, anomenats per perfil de risc i estratègia',
        'comentari del bloc')

io.open(F, 'w', encoding='utf-8').write(h)

print('=' * 64)
for s in steps:
    print('  ✓ ' + s)
print('=' * 64)
print('tbi-perfil.js: %d -> %d · platform.html: %d -> %d' % (js0, len(js), h0, len(h)))

ok = True


def chk(c, m):
    global ok
    print(('  OK    ' if c else '  FALLA ') + m)
    ok = ok and c


for ciutat in ['Amsterdam', 'Nova York', 'Singapur', 'Ginebra', 'Berna', 'Xangai', 'Frankfurt']:
    chk('· ' + ciutat not in h, 'cap «· %s» a platform.html' % ciutat)
chk('arq.ep' not in h, 'cap ús del personatge històric a platform.html')
chk("L'Arquitecte" not in h and "L'Estoic" not in h, 'cap nom d\'ofici als arquetips')
chk('a.perfil + " · " + a.nom' in js, 'tbi-perfil.js genera «Perfil · Nom»')
chk('ROMAN[i]' not in js.split('cartNom:')[1][:200], 'el número romà ja no va al nom')

io.open('/tmp/_p.js', 'w', encoding='utf-8').write(js)
r = subprocess.run(['node', '--check', '/tmp/_p.js'], capture_output=True, text=True)
chk(r.returncode == 0, 'tbi-perfil.js vàlid')
if r.returncode:
    print(r.stderr[:600])
for i, s in enumerate(re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>(.*?)</script>', h, re.DOTALL)):
    io.open('/tmp/_q%d.js' % i, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', '/tmp/_q%d.js' % i], capture_output=True, text=True)
    chk(r.returncode == 0, 'platform.html script %d vàlid' % i)
    if r.returncode:
        print(r.stderr[:600])
sys.exit(0 if ok else 1)
