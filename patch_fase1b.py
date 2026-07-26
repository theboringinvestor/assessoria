#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fase 1b · correccions sortides de provar el render amb dades reals

1. `_fireParsePerfilAport` retorna 1.6 per a "1.600€" (tracta el punt de
   milers com a decimal). Es un bug preexistent del fallback de la
   calculadora FIRE. El context d'objectius fa servir `_frParseEur`, que
   si el parseja bé, i nomes cau a l'altre com a ultim recurs.

2. El pes de risc s'ha de mesurar com a CAPITAL DE CREIXEMENT (100 menys
   renda fixa i liquiditat), no com a pes de renda variable. Amb una
   cartera amb 28% d'or, crypto, crowdlending i private equity, comptar
   nomes la RV feia semblar que hi havia un 35% de capital segur quan de
   segur nomes n'hi havia el 5% de liquiditat.
"""
import re, sys, subprocess

RUTA = 'platform.html'
html = open(RUTA, encoding='utf-8').read()
original = html
canvis = []


def swap(nom, old, new, esperat=1):
    global html
    n = html.count(old)
    assert n == esperat, '[%s] ancoratge trobat %d vegades, esperava %d' % (nom, n, esperat)
    html = html.replace(old, new, esperat)
    canvis.append(nom)


# ─────────────────────────────────────────────────────────────────────────
# 1. Substituir _frPesRVdeTarget per una mesura de creixement
# ─────────────────────────────────────────────────────────────────────────
OLD_PES = """// Pes de renda variable d'una llista de pesos target. Els fons mixtos
// compten com un 60% de RV, igual que fa TBI_CARTERA.pesRV.
function _frPesRVdeTarget(target) {
  if (!Array.isArray(target) || !target.length) return null;
  var rv = 0, tot = 0, i;
  for (i = 0; i < target.length; i++) {
    var pct = parseFloat(target[i].pct) || 0, g = 'alt';
    try {
      if (typeof TBI_CARTERA !== 'undefined') {
        var cc = TBI_CARTERA.cat(target[i].id || target[i].nom);
        if (cc && cc.grup) g = cc.grup;
      }
    } catch (e) {}
    tot += pct;
    if (g === 'rv') rv += pct;
    else if (g === 'mixt') rv += pct * 0.6;
  }
  return tot > 0 ? rv / tot * 100 : null;
}"""

NEW_PES = """// Pes d'ACTIUS DE CREIXEMENT d'una llista de pesos: tot allò que pot caure
// un 30% i necessita anys per recuperar-se. És 100 menys el capital segur
// (renda fixa + liquiditat), no el pes de renda variable.
//
// La diferència no és acadèmica: amb un 28% en or, crypto, crowdlending i
// private equity, mesurar només la RV faria creure que hi ha un 35% de
// capital segur quan de segur només hi ha el 5% de liquiditat. I el capital
// segur és l'únic que pot respondre d'un objectiu a dos anys.
function _frPesCreixement(files) {
  if (!Array.isArray(files) || !files.length) return null;
  var segur = 0, tot = 0, i;
  for (i = 0; i < files.length; i++) {
    var pct = parseFloat(files[i].pct) || 0, g = files[i].grup || null;
    if (!g) {
      try {
        if (typeof TBI_CARTERA !== 'undefined') {
          var cc = TBI_CARTERA.cat(files[i].id || files[i].nom);
          if (cc && cc.grup) g = cc.grup;
        }
      } catch (e) {}
    }
    tot += pct;
    if (g === 'rf' || g === 'cash') segur += pct;
    else if (g === 'mixt') segur += pct * 0.4;
  }
  return tot > 0 ? 100 - (segur / tot * 100) : null;
}

// Igual, però sobre la cartera real: es reutilitza la distribució de
// TBI_CARTERA perquè el criteri de categories sigui exactament el mateix.
function _frPesCreixementReal(pos, mov) {
  try {
    if (typeof TBI_CARTERA === 'undefined') return null;
    var d = TBI_CARTERA.distribucio(pos, mov);
    if (!d || !d.length) return null;
    return _frPesCreixement(d.map(function (x) { return { pct: x.pct, grup: x.grup }; }));
  } catch (e) { return null; }
}"""

swap('pes de creixement', OLD_PES, NEW_PES)


# ─────────────────────────────────────────────────────────────────────────
# 2. El sostre del perfil, en termes de creixement
# ─────────────────────────────────────────────────────────────────────────
OLD_SOSTRE = """// El sostre de RV: el que el perfil del client admet. Cap objectiu, per
// llarg que sigui l'horitzó, pot passar d'aquí.
function _frSostreRV(c) {
  var p = _frPesRVdeTarget(_frTargetArquetip(c));
  return (p === null) ? 100 : Math.min(100, Math.round(p));
}"""

NEW_SOSTRE = """// El sostre de risc que admet el perfil del client, mesurat en actius de
// creixement. Cap objectiu, per llarg que sigui l'horitzó, pot passar d'aquí.
function _frSostreRV(c) {
  var p = _frPesCreixement(_frTargetArquetip(c));
  return (p === null) ? 100 : Math.min(100, Math.round(p));
}"""

swap('sostre de creixement', OLD_SOSTRE, NEW_SOSTRE)


# ─────────────────────────────────────────────────────────────────────────
# 3. El context: parser d'aportacio i pes real
# ─────────────────────────────────────────────────────────────────────────
OLD_CTX = """  var aportacio = parseFloat(ov.aportacioMensual);
  if (!isFinite(aportacio) || aportacio < 0) aportacio = _fireParsePerfilAport(perfil) || 0;

  var target = (Array.isArray(c.cartera_target_custom) && c.cartera_target_custom.length)
    ? c.cartera_target_custom : _frTargetArquetip(c);

  var pesRV = null;
  try {
    if (capitalReal > 0 && typeof TBI_CARTERA !== 'undefined') pesRV = TBI_CARTERA.pesRV(pos, mov);
  } catch (e) { pesRV = null; }
  if (pesRV === null || !isFinite(pesRV)) pesRV = _frPesRVdeTarget(target);"""

NEW_CTX = """  // OJO amb el parser: `_fireParsePerfilAport` tracta el punt de milers com
  // a decimal i converteix "1.600€" en 1,60 €/mes. `_frParseEur` sí que
  // entén el format europeu, així que va primer.
  var aportacio = parseFloat(ov.aportacioMensual);
  if (!isFinite(aportacio) || aportacio < 0) aportacio = _frParseEur(perfil.aportacioMensual) || 0;
  if (!aportacio) aportacio = _fireParsePerfilAport(perfil) || 0;

  var target = (Array.isArray(c.cartera_target_custom) && c.cartera_target_custom.length)
    ? c.cartera_target_custom : _frTargetArquetip(c);

  // Pes de creixement: de la cartera real si n'hi ha, si no de la target
  var pesRV = (capitalReal > 0) ? _frPesCreixementReal(pos, mov) : null;
  if (pesRV === null || !isFinite(pesRV)) pesRV = _frPesCreixement(target);"""

swap('context: parser i pes real', OLD_CTX, NEW_CTX)


# ─────────────────────────────────────────────────────────────────────────
# 4. Etiquetes del panell: parlar de creixement, no de RV
# ─────────────────────────────────────────────────────────────────────────
OLD_LBL = """        + '<span><b>' + Math.round(b.rv) + '%</b> RV</span>'
        + '<span><b>' + Math.round(b.rf) + '%</b> RF</span>'
        + '<span><b>' + Math.round(b.cash) + '%</b> liquiditat</span>'
        + '<span class="fr-obj-hint">cartera ara: ' + (ctx.pes_rv_real === null ? '—' : Math.round(ctx.pes_rv_real) + '% RV')
          + ' · sostre del perfil: ' + ctx.pct_rv_max + '% RV</span>'"""

NEW_LBL = """        + '<span><b>' + Math.round(b.rv) + '%</b> creixement</span>'
        + '<span><b>' + Math.round(b.rf) + '%</b> renda fixa</span>'
        + '<span><b>' + Math.round(b.cash) + '%</b> liquiditat</span>'
        + '<span class="fr-obj-hint">cartera ara: ' + (ctx.pes_rv_real === null ? '—' : Math.round(ctx.pes_rv_real) + '% en creixement')
          + ' · sostre del perfil: ' + ctx.pct_rv_max + '%</span>'"""

swap('etiquetes de creixement', OLD_LBL, NEW_LBL)

OLD_MIX = "      +  '<span class=\"fr-obj-hint\">RV/RF/liq</span></span>';"
NEW_MIX = "      +  '<span class=\"fr-obj-hint\">creixement/RF/liq</span></span>';"
swap('etiqueta de la barreja', OLD_MIX, NEW_MIX)

OLD_RET = "    h += '<span class=\"fr-obj-hint\">RV retallada pel perfil</span>';"
NEW_RET = "    h += '<span class=\"fr-obj-hint\">risc retallat pel perfil</span>';"
swap('etiqueta de retall', OLD_RET, NEW_RET)


# ─────────────────────────────────────────────────────────────────────────
assert html != original, 'no s\'ha aplicat cap canvi'
open(RUTA, 'w', encoding='utf-8').write(html)
print('Canvis aplicats: %d' % len(canvis))
for c in canvis:
    print('  · ' + c)

scripts = re.findall(r'<script\b(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.DOTALL)
errors = 0
for i, s in enumerate(scripts):
    open('/tmp/_chk%d.js' % i, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', '/tmp/_chk%d.js' % i], capture_output=True, text=True)
    if r.returncode != 0:
        errors += 1
        print('  BLOC %d INVALID:\n%s' % (i, r.stderr[:1500]))
print('\n%d blocs <script> inline · %d invalids' % (len(scripts), errors))
sys.exit(1 if errors else 0)
