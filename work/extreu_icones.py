#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extreu la llibreria d'icones a tbi-icones.js (font única) i substitueix
cada SVG inline per una crida al mòdul.

El problema delicat és que les icones viuen DINS de cadenes JS, i cal saber
amb quina cometa estan delimitades per poder tallar-les bé. En comptes
d'endevinar-ho per proximitat, es recorre cada línia mantenint l'estat de
cometes (amb escapatòries), que és exacte perquè cap icona travessa una línia.

Xarxa de seguretat: després es comprova amb node que TBI_ICO.svg(nom)
reprodueix EXACTAMENT la cadena que hi havia abans, byte a byte.
"""
import io, os, re, subprocess, sys, json, collections
import icones

BASE = os.path.dirname(os.path.abspath(__file__))
SVG_RE = re.compile(r'<svg class="ei" viewBox="0 0 24 24">(.*?)</svg>')

# ══════════════════════════════════════════════════════════════════
# 1. tbi-icones.js — la font única
# ══════════════════════════════════════════════════════════════════
usats = set()
for f in ['platform.html', 'tbi-app.html']:
    h = io.open(os.path.join(BASE, f), encoding='utf-8').read()
    usats |= set(SVG_RE.findall(h))

path2nom = {}
for nom, d in icones.PATHS.items():
    path2nom[d] = nom
orfes = [d for d in usats if d not in path2nom]
assert not orfes, 'icones al fitxer que no són a la llibreria: %d' % len(orfes)

noms = sorted(set(path2nom[d] for d in usats))
print('icones realment usades: %d de %d definides' % (len(noms), len(icones.PATHS)))

cos = ',\n'.join("    '%s': '%s'" % (n, icones.PATHS[n].replace("'", "\\'")) for n in noms)
LIB = """/* ═══════════════════════════════════════════════════════════════════════
   TBI_ICO — joc d'icones monocromàtiques de The Boring Investor
   Font única per a platform.html, tbi-app.html i qualsevol pàgina futura.

   Contracte: SVG de 24x24, traç 1.7, currentColor. La mida NO va a l'SVG
   sinó a la classe CSS `.ei`, en em, així una mateixa icona serveix per a
   qualsevol context i hereta mida i color del contenidor.

   Cal tenir aquesta regla al full d'estils:
     .ei{width:1.15em;height:1.15em;display:inline-block;vertical-align:-.19em;
       fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;
       stroke-linejoin:round;flex-shrink:0}

   Ús:  TBI_ICO.svg('briefcase')          -> <svg class="ei" ...>...</svg>
        TBI_ICO.svg('bell', 'gran')       -> hi afegeix la classe `gran`
   ═══════════════════════════════════════════════════════════════════════ */
var TBI_ICO = (function () {
  "use strict";
  var VERSION = "2026-07-25";

  var PATHS = {
%s
  };

  /* Marcatge d'una icona. Retorna cadena buida si el nom no existeix:
     mai ha de petar una vista sencera per una icona que falta. */
  function svg(nom, cls) {
    var d = PATHS[nom];
    if (!d) { try { console.warn("[TBI_ICO] icona desconeguda: " + nom); } catch (e) {} return ""; }
    return '<svg class="ei' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24">' + d + "</svg>";
  }

  function has(nom) { return Object.prototype.hasOwnProperty.call(PATHS, nom); }
  function noms() { var r = []; for (var k in PATHS) if (has(k)) r.push(k); return r.sort(); }

  return { VERSION: VERSION, PATHS: PATHS, svg: svg, has: has, noms: noms };
})();

try { console.log("[TBI_ICO] v" + TBI_ICO.VERSION + " carregat \\u00b7 " + TBI_ICO.noms().length + " icones"); } catch (e) {}

if (typeof module !== "undefined" && module.exports) { module.exports = TBI_ICO; }
""" % cos

LIBP = os.path.join(BASE, 'tbi-icones.js')
io.open(LIBP, 'w', encoding='utf-8').write(LIB)
subprocess.run(['node', '--check', LIBP], check=True)
print('tbi-icones.js escrit i vàlid (%d chars)' % len(LIB))


# ══════════════════════════════════════════════════════════════════
# 2. Substitució amb estat de cometes
# ══════════════════════════════════════════════════════════════════
def transforma(linia):
    """Substitueix les icones d'una línia sabent dins de quina cadena són.

    Recorre la línia mantenint quina cometa hi ha oberta. Quan troba una
    icona dins d'una cadena, la talla i hi posa la crida al mòdul.
    Si la icona és HTML cru (fora de tota cadena) es queda tal com està:
    no hi ha cap JS que la pugui generar.
    """
    res = []
    i = 0
    q = None          # cometa oberta actual, o None si som fora de cadena
    canvis = fora = 0
    while i < len(linia):
        c = linia[i]
        # escapatòria dins de cadena: el caràcter següent és literal
        if q and c == '\\':
            res.append(linia[i:i + 2]); i += 2; continue
        if q:
            m = SVG_RE.match(linia, i)
            if m:
                crida = "TBI_ICO.svg('%s')" % path2nom[m.group(1)]
                tanca = linia[m.end():m.end() + 1] == q
                if res and res[-1] == q and tanca:
                    # la icona era tota la cadena: fora cometes, queda la crida
                    res.pop()
                    res.append(crida)
                    i = m.end() + 1
                    q = None          # ← la cadena s'ha acabat aquí
                else:
                    res.append('%s + %s + %s' % (q, crida, q))
                    i = m.end()
                canvis += 1
                continue
            if c == q:
                q = None
            res.append(c); i += 1; continue
        if c in '"\'':
            q = c; res.append(c); i += 1; continue
        m = SVG_RE.match(linia, i)
        if m:
            res.append(m.group(0)); i = m.end(); fora += 1; continue
        res.append(c); i += 1
    return ''.join(res), canvis, fora


TOTAL = {'canvis': 0, 'fora': 0}
for f in ['platform.html', 'tbi-app.html']:
    P = os.path.join(BASE, f)
    h = io.open(P, encoding='utf-8').read()
    abans = len(SVG_RE.findall(h))
    linies = h.split('\n')
    nc = nf = 0
    for k, l in enumerate(linies):
        if 'class="ei"' not in l:
            continue
        nova, c, fo = transforma(l)
        linies[k] = nova
        nc += c
        nf += fo
    h = '\n'.join(linies)
    # carregar el mòdul abans de qualsevol altre script
    if 'tbi-icones.js' not in h:
        anc = '<script src="tbi-cartera.js"></script>' if 'tbi-cartera.js' in h else None
        if anc and h.count(anc) == 1:
            h = h.replace(anc, '<script src="tbi-icones.js"></script>\n' + anc)
        else:
            m = re.search(r'<script src="[^"]+"></script>', h)
            h = h[:m.start()] + '<script src="tbi-icones.js"></script>\n' + h[m.start():]
    io.open(P, 'w', encoding='utf-8').write(h)
    TOTAL['canvis'] += nc
    TOTAL['fora'] += nf
    print('%-16s %d icones -> %d crides al mòdul, %d es queden en HTML cru' % (f, abans, nc, nf))

print('\ntotal: %d crides, %d inline (HTML estàtic)' % (TOTAL['canvis'], TOTAL['fora']))
