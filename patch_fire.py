#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FIRE v2 (SWR dinamica + impostos) i mode retirada a portal-aportacions."""

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

assert 'calcRetiradaTactica' not in s, 'el modul ja sembla integrat'

# ── 1) Carregar el motor FIRE ─────────────────────────────────────────────
rep('<script src="tbi-fiscal.js"></script>',
    '<script src="tbi-fiscal.js"></script>\n<script src="tbi-fire.js"></script>',
    'carregar tbi-fire.js')

# ── 2) Motor de retirades, al costat del sistema de cartera v2 ────────────
with io.open(os.path.join(BLK, 'retirades_v1.js'), encoding='utf-8') as f:
    motorRet = f.read().rstrip('\n')
rep("""// ════════════════════════════════════════════════════════════════════════════
// FI Sistema de cartera v2
// ════════════════════════════════════════════════════════════════════════════""",
    motorRet + """

// ════════════════════════════════════════════════════════════════════════════
// FI Sistema de cartera v2
// ════════════════════════════════════════════════════════════════════════════""",
    'motor de retirades')

# ── 3) SWR dinamica al FIRE ───────────────────────────────────────────────
helper = """// ── SWR dinàmica ────────────────────────────────────────────────────────
// La taxa de retirada deixa de ser una constant per model. Depèn dels anys
// que ha de durar la cartera i del seu pes en renda variable: el 4,75% de
// Bengen assumeix 30 anys i una cartera diversificada; qui es retira als 45
// té 47 anys per davant i necessita força menys.
function _fireSWR(modelId){
  var m = FIRE_MODELS[modelId] || FIRE_MODELS.regular;
  var edatRet = _FIRE_STATE.edatObjectiu || 65;
  var anysRet = TBI_FIRE.anysRetirada(edatRet, TBI_FIRE.REF.esperanca_vida_defecte);

  // Pes de RV real de la cartera; si no n'hi ha, el de l'arquetip
  var pctRV = 60;
  try {
    var dist = calcDistribucioReal(), acum = 0, total = 0;
    dist.forEach(function(d){
      var tx = ACTIUS_TAXONOMY.find(function(a){ return a.id === d.id; });
      total += d.pct;
      if (tx && tx.grup === 'rv') acum += d.pct;
      if (tx && tx.grup === 'mixt') acum += d.pct * 0.6;
    });
    if (total > 1) pctRV = acum;
    else {
      var c = getClient();
      var arq = getArquetip(c && c.arquetipId ? c.arquetipId : 'navegant');
      var a2 = 0;
      (arq.actius || []).forEach(function(x){
        var tx2 = ACTIUS_TAXONOMY.find(function(a){ return a.id === x.id; });
        if (tx2 && tx2.grup === 'rv') a2 += (parseFloat(x.pct)||0);
        if (tx2 && tx2.grup === 'mixt') a2 += (parseFloat(x.pct)||0) * 0.6;
      });
      if (a2 > 0) pctRV = a2;
    }
  } catch(e) {}

  var ter = 0.25;
  try { var t = calcTERCartera(); if (t && t.ter_real > 0) ter = t.ter_real; } catch(e) {}

  var s = TBI_FIRE.swr({ anys_retirada: anysRet, pct_rv: pctRV, ter: ter });
  s.classica = m.withdrawal;
  s.diferencia = s.swr - m.withdrawal;
  return s;
}

// Ràtio de plusvàlua latent, per calcular el brut que cal vendre
function _fireRatioGuany(){
  try { var r = calcRatioGuanyCartera(); return (r > 0) ? r : 0.35; } catch(e) { return 0.35; }
}

"""
rep('function _fireCalcModel(modelId, despeses, capital, aportMens, retornPct, edat){',
    helper + 'function _fireCalcModel(modelId, despeses, capital, aportMens, retornPct, edat){',
    'helper _fireSWR')

rep("""  var rMens = retornPct/100/12;
  // Multiplicador derivat de la taxa de retirada (100/SWR) \\u2014 evita valors duplicats o inconsistents
  var mult = 100 / (m.withdrawal || 4);""",
    """  var rMens = retornPct/100/12;
  // Taxa de retirada dinàmica (horitzó + pes de RV + TER real), no constant
  var _swr = _fireSWR(modelId);
  var taxa = _swr.swr;
  // Les despeses són NETES: cal vendre més perquè la plusvàlua tributa
  var _gu = TBI_FIRE.brutPerNet(despeses, _fireRatioGuany(), 0);
  var despesesBrutes = _gu.brut;
  var mult = 100 / taxa;""",
    'multiplicador dinamic')

# Els tres punts de retorn han de portar la taxa nova i les despeses brutes
rep("""    var objectiuFinal = despeses * mult;""",
    """    var objectiuFinal = despesesBrutes * mult;""",
    'objectiu coast amb brut')
rep("""      taxaRetirada: m.withdrawal, assolit: capital >= capitalNecCoast""",
    """      taxaRetirada: taxa, taxaClassica: m.withdrawal, swrDetall: _swr,
      despesesBrutes: despesesBrutes, impostAnual: _gu.impost,
      assolit: capital >= capitalNecCoast""",
    'retorn coast')

rep("""    var necCartera = Math.max(0, despeses - fp);
    var objectiu = necCartera * mult;""",
    """    var necCartera = Math.max(0, despeses - fp);
    var necBrut = TBI_FIRE.brutPerNet(necCartera, _fireRatioGuany(), 0).brut;
    var objectiu = necBrut * mult;""",
    'objectiu barista amb brut')
rep("""      taxaRetirada: m.withdrawal, assolit: capital >= objectiu""",
    """      taxaRetirada: taxa, taxaClassica: m.withdrawal, swrDetall: _swr,
      despesesBrutes: necBrut, impostAnual: necBrut - necCartera,
      assolit: capital >= objectiu""",
    'retorn barista')

rep("""  var obj = despeses * mult;""",
    """  var obj = despesesBrutes * mult;""",
    'objectiu general amb brut')
rep("""    taxaRetirada: m.withdrawal, assolit: capital >= obj""",
    """    taxaRetirada: taxa, taxaClassica: m.withdrawal, swrDetall: _swr,
    despesesBrutes: despesesBrutes, impostAnual: _gu.impost,
    assolit: capital >= obj""",
    'retorn general')

# ── 4) Renders que encara mostraven la taxa fixa ──────────────────────────
rep("""' + m.nom + ' \\u00b7 Regla del ' + String(m.withdrawal).replace('.',',') + '%</div>'""",
    """' + m.nom + ' \\u00b7 Taxa ' + (r.taxaRetirada || m.withdrawal).toFixed(2).replace('.',',') + '%</div>'""",
    'render taxa (hero)')
rep("""'\\u20ac/any \\u00b7 ' + String(m.withdrawal).replace('.',',') + '%</div>'""",
    """'\\u20ac/any \\u00b7 ' + (r.taxaRetirada || m.withdrawal).toFixed(2).replace('.',',') + '%</div>'""",
    'render taxa (targeta)')
rep("""  var metaTxt = m.nom + ' \\u00b7 retirada ' + String(m.withdrawal).replace('.',',') + '% \\u00b7 sincronitzat amb la calculadora';""",
    """  var metaTxt = m.nom + ' \\u00b7 retirada ' + ((f && f.taxaRetirada) ? f.taxaRetirada.toFixed(2).replace('.',',') : String(m.withdrawal).replace('.',',')) + '% \\u00b7 sincronitzat amb la calculadora';""",
    'render taxa (meta)')

# ── 5) Mode retirada a portal-aportacions ─────────────────────────────────
with io.open(os.path.join(BLK, 'render_retirades.js'), encoding='utf-8') as f:
    modul = f.read().rstrip('\n')

rep('function renderPortalAportacions(el) {\n  var c = getClient();',
    modul + """

// Mode ACUMULAR: la vista d'aportacions original, sense canvis funcionals.
function renderAportacionsAcumular(el) {
  var c = getClient();""",
    'renderPortalAportacions -> renderAportacionsAcumular + wrapper')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(s)

print('\n%d substitucions. %d -> %d bytes (%+d)' % (n, orig, len(s), len(s) - orig))
