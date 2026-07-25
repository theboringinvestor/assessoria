#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""platform.html delega a tbi-cartera.js.
El codi duplicat no es contigu (els moduls de fiscalitat i hipoteca hi son
al mig), aixi que s'elimina en tres talls independents."""

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

def talla(ini, fi, requerits, prohibits, label):
    """Elimina l'interval [ini, fi) verificant que conte el que toca."""
    global s, n
    i = s.index(ini)
    j = s.index(fi, i)
    vell = s[i:j]
    for r in requerits:
        assert r in vell, '%s: no trobo "%s" dins del tall' % (label, r)
    for p in prohibits:
        assert p not in vell, '%s: el tall inclou "%s" (massa ampli)' % (label, p)
    s = s[:i] + s[j:]
    n += 1
    print('  [ok] %s (%d chars eliminats)' % (label, len(vell)))
    return len(vell)

assert 'TBI_CARTERA' not in s, 'ja sembla integrat'

BANNER = '// ════════════════════════════════════════════════════════════════════════════\n'
PROHIBITS = ['function renderPortal', 'function renderMatchingTable',
             'ACTIUS_TAXONOMY = [', 'FIRE_MODELS', 'function renderAportacions']

# ── 1) Carregar el motor compartit primer de tot ──────────────────────────
rep('<script src="tbi-perfil.js"></script>',
    '<script src="tbi-cartera.js"></script>\n<script src="tbi-perfil.js"></script>',
    'carregar tbi-cartera.js')

total = 0

# ── 2) Tall A: motor v3 + KPIs + distribucio + matching ───────────────────
total += talla(
    BANNER + "// MOTOR D'ANÀLISI v3",
    BANNER + '// FASE DE RETIRADA',
    ['var MOTOR_V3', 'var TER_PER_CATEGORIA', 'function calcXIRR', 'function calcTWR',
     'function calcTERCartera', 'function calcKPIsCartera', 'function calcDistribucioReal',
     'function calcMatchingITactic', 'function calcEvolucioCartera'],
    PROHIBITS, 'tall A: motor v3 i matching')

# ── 3) Tall B: bloc de retirades ──────────────────────────────────────────
total += talla(
    BANNER + '// FASE DE RETIRADA',
    BANNER + '// FI Sistema de cartera v2',
    ['function calcRatioGuanyCartera', 'function calcRetiradaTactica', 'function calcSalutRetirada'],
    PROHIBITS, 'tall B: retirades')

# ── 4) Tall C: calcPosicionsAmbAgregats ───────────────────────────────────
total += talla(
    '// Calcula per cada posicio els seus agregats a partir dels moviments',
    BANNER + '// FISCALITAT AMPLIADA',
    ['function calcPosicionsAmbAgregats'],
    PROHIBITS + ['function calcKPIsCartera'], 'tall C: calcPosicionsAmbAgregats')

# ── 5) Inserir els adaptadors ─────────────────────────────────────────────
with io.open(os.path.join(BLK, 'adaptadors_cartera.js'), encoding='utf-8') as f:
    adapt = f.read().rstrip('\n')

rep(BANNER + '// FI Sistema de cartera v2',
    adapt + '\n\n' + BANNER + '// FI Sistema de cartera v2',
    'insercio dels adaptadors')

# ── 6) Nota a la taxonomia perque no torni a divergir ─────────────────────
rep('var ACTIUS_TAXONOMY = [',
    "// NOTA: els camps id/emoji/color/nom han de coincidir amb\n"
    "// TBI_CARTERA.TAXONOMIA, que és qui mana per als càlculs. Els textos\n"
    "// educatius (desc, pros, contres, cicle) només viuen aquí.\n"
    'var ACTIUS_TAXONOMY = [',
    'nota a ACTIUS_TAXONOMY')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(s)

print('\n%d canvis · %d chars de codi duplicat eliminats' % (n, total))
print('%d -> %d bytes (%+d)' % (orig, len(s), len(s) - orig))
