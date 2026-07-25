#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tbi-app.html deixa de tenir copia propia dels calculs i delega a
tbi-cartera.js, el mateix motor que fa servir platform.html."""

import io, os, sys

BLK = '/sessions/funny-amazing-bardeen/mnt/outputs'
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BLK, 'tbi-app.html')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BLK, 'tbi-app.html')

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

def talla(ini, fi, requerits, label):
    global s, n
    i = s.index(ini)
    j = s.index(fi, i)
    vell = s[i:j]
    for r in requerits:
        assert r in vell, '%s: no trobo "%s"' % (label, r)
    s = s[:i] + s[j:]
    n += 1
    print('  [ok] %s (%d chars eliminats)' % (label, len(vell)))
    return len(vell)

assert 'TBI_CARTERA' not in s, 'ja sembla integrat'

# ── 1) Carregar el motor compartit ────────────────────────────────────────
rep('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n'
    '<script src="tbi-cartera.js"></script>\n'
    '<script src="tbi-fiscal.js"></script>\n'
    '<script src="tbi-fire.js"></script>',
    'carregar els motors compartits')

# ── 2) aggPosicio delega ──────────────────────────────────────────────────
i = s.index('function aggPosicio(p){')
j = s.index('\nfunction ', i + 10)
vell = s[i:j]
assert 'cost' in vell and 'pnl' in vell, 'aggPosicio inesperada'
nou = """// Agregats d'una posicio. Delega al motor compartit perque l'app i la
// plataforma no puguin tornar a donar numeros diferents.
function aggPosicio(p){
  var a = TBI_CARTERA.agregats([p], getMoviments())[0] || {};
  return {
    valor: parseFloat(p.valor_actual)||0,
    cost: a.cost_base || 0,
    unitats: a.unitats_total || 0,
    pnl: a.pnl_eur || 0,
    pnlPct: a.pnl_pct || 0,
    ratioGuany: a.ratio_guany || 0
  };
}
"""
s = s[:i] + nou + s[j:]
n += 1
print('  [ok] aggPosicio delega (%d -> %d chars)' % (len(vell), len(nou)))

# ── 3) catInfo fa servir la taxonomia canonica ────────────────────────────
i = s.index('function catInfo(catId){')
j = s.index('\nfunction ', i + 10)
vell = s[i:j]
nou = """// Nom i color d'una categoria. Prioritat: el target del client (que pot
// portar colors personalitzats per l'assessor) i, si no, la taxonomia
// canonica compartida — la mateixa que fa servir la plataforma.
function catInfo(catId){
  var target = getTarget();
  for (var i=0;i<target.length;i++){
    var t = target[i];
    if ((t.id || t.nom) === catId && t.color) return { nom: t.nom || catId, color: t.color };
  }
  var c = TBI_CARTERA.cat(catId);
  return { nom: c.nom, color: c.color, emoji: c.emoji, grup: c.grup };
}
"""
s = s[:i] + nou + s[j:]
n += 1
print('  [ok] catInfo usa la taxonomia canonica (%d -> %d chars)' % (len(vell), len(nou)))

# ── 4) calcAportacio: eliminar la copia antiga (top-2, sense bandes) ──────
i = s.index('function calcAportacio(aport){')
j = s.index('\n// Quantes aportacions', i)
vell = s[i:j]
assert 'top2' in vell and 'slice(0,2)' in vell, 'no es la versio antiga esperada'
nou = """// El calcul d'aportacio viu a TBI_CARTERA. Abans l'app en tenia una copia
// amb l'algoritme antic (top-2, sense bandes ni minim per ordre): amb la
// mateixa cartera i 500 euros, l'app deia "RF Corp 499 + Or 1" i la
// plataforma "RF Corp 500". Ara nomes hi ha una implementacio.
function ctxCartera(){
  return { posicions: getPosicions(), moviments: getMoviments(), target: getTarget() };
}
function calcAportacio(aport){
  var target = getTarget();
  if (!target.length) return null;
  var m = TBI_CARTERA.matching(ctxCartera(), aport);
  if (!m) return null;
  // Forma que espera el render de l'app
  return {
    rows: m.rows.map(function(r){
      return { cat:r.id, nom:r.nom, color:r.color, targetPct:r.target_pct,
               realEur:r.real_eur, realPct:r.real_pct, gapEur:r.gap_eur,
               gapPct:r.gap_pct, banda:r.banda_pp, foraBanda:r.fora_banda,
               estat:r.estat, foraPla:r.fora_pla };
    }),
    recomanacio: m.recomanacio.map(function(l){
      return { cat:l.cat, nom:l.nom, color:l.color, import:l.import, motiu:l.motiu, prioritat:l.prioritat };
    }),
    resum: m.resum,
    valorActual: m.valor_actual, valorPost: m.valor_post, aport: m.aportacio
  };
}
"""
s = s[:i] + nou + s[j:]
n += 1
print('  [ok] calcAportacio delega, bandes 5/25 (%d -> %d chars)' % (len(vell), len(nou)))

# ── 5) KPIs de cartera compartits, per al hero ────────────────────────────
rep('function getSnapshots(){',
    """// KPIs complets (inclou TIR i ratio de plusvalua) del motor compartit
function kpisCartera(){
  return TBI_CARTERA.kpis(getPosicions(), getMoviments());
}
function terCartera(){
  return TBI_CARTERA.ter(getPosicions(), getMoviments(), getTarget());
}
function twrCartera(){
  return TBI_CARTERA.twr(getSnapshots(), getPosicions(), getMoviments());
}

function getSnapshots(){""",
    'helpers kpis/ter/twr')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(s)

print('\n%d canvis. %d -> %d bytes (%+d)' % (n, orig, len(s), len(s) - orig))
