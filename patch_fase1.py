#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fase 1 · Objectius v2 al Full de Ruta de platform.html

Patró de patch segur: cada substitucio comprova que l'ancoratge apareix
exactament una vegada abans de tocar res. Si algun canvia de forma al repo,
el script para i no deixa el fitxer a mitges.

Ordre:
  1. Carregar tbi-objectius.js
  2. _frAddObjectiu crea objectius v2 (amb data ISO real, no text)
  3. Bloc nou: context, render i handlers dels objectius + coherencia
  4. Reemplacar el bucle de render de la seccio 02
  5. Injectar el panell de coherencia despres dels objectius
  6. CSS nou
"""
import re, sys, subprocess, os

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
# 1. Carregar el modul
# ─────────────────────────────────────────────────────────────────────────
swap('script tbi-objectius.js',
     '<script src="tbi-fire.js"></script>',
     '<script src="tbi-fire.js"></script>\n<script src="tbi-objectius.js"></script>')


# ─────────────────────────────────────────────────────────────────────────
# 2. _frAddObjectiu crea objectius v2
# ─────────────────────────────────────────────────────────────────────────
OLD_ADD = """  c.fullderuta.objectius.push({
    tipus: plantilla.id,
    icona: plantilla.icona,
    titol: plantilla.titol,
    meta:  plantilla.meta,
    import: plantilla.import,
    termini: plantilla.termini
  });"""

NEW_ADD = """  // Objectiu v2: la data es una ISO real des del primer moment, no un text.
  // El motor tradueix el termini de la plantilla ("5 anys") a data concreta.
  var nou = {
    tipus: plantilla.id,
    icona: plantilla.icona,
    titol: plantilla.titol,
    meta:  plantilla.meta,
    import: plantilla.import,
    termini: plantilla.termini
  };
  if (typeof TBI_OBJECTIUS !== 'undefined') {
    nou = TBI_OBJECTIUS.normalitza(nou);
    // Nomes un residual: si el nou ho es, els altres deixen de ser-ho
    if (nou.residual) {
      for (var ri = 0; ri < c.fullderuta.objectius.length; ri++) {
        if (c.fullderuta.objectius[ri]) c.fullderuta.objectius[ri].residual = false;
      }
    }
  }
  c.fullderuta.objectius.push(nou);"""

swap('_frAddObjectiu v2', OLD_ADD, NEW_ADD)


# ─────────────────────────────────────────────────────────────────────────
# 3. Bloc nou de funcions
# ─────────────────────────────────────────────────────────────────────────
BLOC = r"""
/* ════════════════════════════════════════════════════════════════════════════
   OBJECTIUS v2 · sobres virtuals, projecció i coherència
   Tot el càlcul viu a TBI_OBJECTIUS (tbi-objectius.js). Aquí només hi ha
   context (què hi ha de veritat a la cartera), render i handlers.
   ════════════════════════════════════════════════════════════════════════════ */

// Pes de renda variable d'una llista de pesos target. Els fons mixtos
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
}

// Cartera de l'arquetip MiFID del client (la que marca el sostre de risc)
function _frTargetArquetip(c) {
  try {
    var arq = getArquetip((c && c.arquetipId) || '');
    if (arq && Array.isArray(arq.actius)) {
      return arq.actius.map(function (a) { return { id: a.id, nom: a.nom, pct: a.pct, color: a.color }; });
    }
  } catch (e) {}
  return [];
}

// El sostre de RV: el que el perfil del client admet. Cap objectiu, per
// llarg que sigui l'horitzó, pot passar d'aquí.
function _frSostreRV(c) {
  var p = _frPesRVdeTarget(_frTargetArquetip(c));
  return (p === null) ? 100 : Math.min(100, Math.round(p));
}

// Context per al motor: capital i aportació reals, pes de RV real, sostre
// del perfil, target vigent i l'estat de la calculadora FIRE.
function _frObjCtx(c) {
  c = c || getClient() || {};
  var fr = c.fullderuta || {};
  var ov = fr.overrides || {};
  var perfil = c.perfil || {};
  var i;

  var pos = Array.isArray(c.posicions) ? c.posicions : [];
  var mov = Array.isArray(c.moviments_posicions) ? c.moviments_posicions : [];
  var capitalReal = 0;
  for (i = 0; i < pos.length; i++) capitalReal += (parseFloat(pos[i].valor_actual) || 0);

  // La cartera real mana; si encara no n'hi ha, l'override i després el perfil
  var capital = capitalReal;
  if (capital <= 0) capital = parseFloat(ov.capitalInicial) || 0;
  if (capital <= 0) capital = _frParseEur(perfil.capitalInicial) || 0;

  var aportacio = parseFloat(ov.aportacioMensual);
  if (!isFinite(aportacio) || aportacio < 0) aportacio = _fireParsePerfilAport(perfil) || 0;

  var target = (Array.isArray(c.cartera_target_custom) && c.cartera_target_custom.length)
    ? c.cartera_target_custom : _frTargetArquetip(c);

  var pesRV = null;
  try {
    if (capitalReal > 0 && typeof TBI_CARTERA !== 'undefined') pesRV = TBI_CARTERA.pesRV(pos, mov);
  } catch (e) { pesRV = null; }
  if (pesRV === null || !isFinite(pesRV)) pesRV = _frPesRVdeTarget(target);

  return {
    objectius: Array.isArray(fr.objectius) ? fr.objectius : [],
    capital_total: capital,
    capital_real: capitalReal,
    aportacio_total: aportacio,
    pes_rv_real: pesRV,
    pct_rv_max: _frSostreRV(c),
    target_actual: target,
    fire: c.fire || null
  };
}

/* ── Handlers d'edició ────────────────────────────────────────────────── */

function _frSetObjCamp(idx, field, val) {
  var c = getClient();
  if (!c.fullderuta || !Array.isArray(c.fullderuta.objectius)) return;
  var o = c.fullderuta.objectius[idx];
  if (!o) return;
  if (field === 'capitalAssignat' || field === 'aportacioAssignada' || field === 'import') {
    var n = parseFloat(String(val).replace(/[^\d.,-]/g, '').replace(',', '.'));
    o[field] = (isFinite(n) && n > 0) ? n : 0;
  } else if (field === 'dataObjectiu') {
    o.dataObjectiu = val || null;
    // La data mana: el text lliure antic ("EN 10 ANYS") ja no vol dir res
    if (val) o.termini = null;
  } else {
    o[field] = val;
  }
  _frMarkDirty();
  _frRerender();
}

// Nomes un objectiu pot absorbir el sobrant
function _frSetObjResidual(idx, on) {
  var c = getClient();
  var objs = (c.fullderuta && c.fullderuta.objectius) || [];
  for (var i = 0; i < objs.length; i++) {
    if (objs[i]) objs[i].residual = (!!on && i === idx);
  }
  _frMarkDirty();
  _frRerender();
}

/* ── Render ───────────────────────────────────────────────────────────── */

var _FR_OBJ_ESTATS = {
  assolit:          { txt: 'Assolit',        bg: '#EAF3DE', col: '#1A5C3A' },
  en_ruta:          { txt: 'En ruta',        bg: '#EAF3DE', col: '#1A5C3A' },
  just:             { txt: 'Just',           bg: '#FEF5E7', col: '#7A4A00' },
  fora_ruta:        { txt: 'No hi arriba',   bg: '#FDF0F0', col: '#8B1A1A' },
  sense_data:       { txt: 'Sense data',     bg: '#E9E6DF', col: '#6B6762' },
  sense_assignacio: { txt: 'Sense assignar', bg: '#E9E6DF', col: '#6B6762' }
};

function _frObjBadge(estat) {
  var e = _FR_OBJ_ESTATS[estat] || _FR_OBJ_ESTATS.sense_data;
  return '<span class="fr-obj-badge" style="background:' + e.bg + ';color:' + e.col + '">' + e.txt + '</span>';
}

function _frObjEur(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(Math.round(n)) + '€';
}

function _frObjMesData(d) {
  if (!d) return '—';
  var s = String(d).slice(0, 7).split('-');
  var mesos = ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'];
  var m = parseInt(s[1], 10);
  return (isFinite(m) ? mesos[m - 1] + ' ' : '') + s[0];
}

// Franja de projecció: què diu el motor d'aquest objectiu
function _frObjProjHtml(pr, o, esUltim) {
  var estat = pr.estat_ritme;
  if (pr.capital_assignat <= 0 && pr.aportacio_assignada <= 0) estat = 'sense_assignacio';
  var pct = Math.max(0, Math.min(100, pr.progres_pct || 0));
  var colBar = (estat === 'fora_ruta') ? 'var(--red)' : (estat === 'just' ? 'var(--amber)' : 'var(--green)');

  var h = '<div class="fr-obj-proj' + (esUltim ? ' last' : '') + '">'
    + _frObjBadge(estat)
    + '<div class="fr-obj-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + colBar + '"></i></div>'
    + '<span class="fr-obj-pm">' + Math.round(pct) + '%</span>';

  if (pr.anys !== null && pr.anys !== undefined) {
    h += '<span>Horitzó <b>' + (pr.anys < 1 ? '<1' : Math.round(pr.anys)) + ' anys</b></span>'
      +  '<span>Barreja <b>' + Math.round(pr.mix.rv) + '/' + Math.round(pr.mix.rf) + '/' + Math.round(pr.mix.cash) + '</b> '
      +  '<span class="fr-obj-hint">RV/RF/liq</span></span>';
  }
  if (estat !== 'sense_assignacio' && pr.projectat !== null) {
    h += '<span>Projecció <b>' + _frObjEur(pr.projectat) + '</b></span>';
    if (pr.data_projectada) h += '<span>Hi arriba el <b>' + _frObjMesData(pr.data_projectada) + '</b></span>';
    if (estat === 'fora_ruta' || estat === 'just') {
      h += '<span class="fr-obj-cal">Caldrien <b>' + _frObjEur(pr.aportacio_necessaria) + '/mes</b></span>';
    }
  }
  if (pr.mix && pr.mix.retallat_per_perfil) {
    h += '<span class="fr-obj-hint">RV retallada pel perfil</span>';
  }
  return h + '</div>';
}

// Controls d'assessor per a un objectiu
function _frObjCtrlHtml(o, oi) {
  var dataVal = o.dataObjectiu ? String(o.dataObjectiu).slice(0, 7) : '';
  function sel(nom, camp, opcions, actual) {
    var s = '<div class="fr-obj-f"><label>' + nom + '</label><select onchange="_frSetObjCamp(' + oi + ',\'' + camp + '\',this.value)">';
    for (var i = 0; i < opcions.length; i++) {
      s += '<option value="' + opcions[i][0] + '"' + (opcions[i][0] === actual ? ' selected' : '') + '>' + opcions[i][1] + '</option>';
    }
    return s + '</select></div>';
  }
  return '<div class="fr-obj-ctrl">'
    + '<div class="fr-obj-f"><label>Data objectiu</label>'
      + '<input type="month" value="' + dataVal + '" onchange="_frSetObjCamp(' + oi + ',\'dataObjectiu\',this.value)">'
    + '</div>'
    + sel('Prioritat', 'prioritat', [['essencial', 'Essencial'], ['important', 'Important'], ['desitjable', 'Desitjable']], o.prioritat)
    + '<div class="fr-obj-f"><label>Capital assignat</label>'
      + '<input type="number" min="0" step="500"' + (o.residual ? ' disabled title="El residual absorbeix el sobrant"' : '')
      + ' value="' + Math.round(o.capitalAssignat || 0) + '" onchange="_frSetObjCamp(' + oi + ',\'capitalAssignat\',this.value)">'
    + '</div>'
    + '<div class="fr-obj-f"><label>Aportació €/mes</label>'
      + '<input type="number" min="0" step="25"' + (o.residual ? ' disabled title="El residual absorbeix el sobrant"' : '')
      + ' value="' + Math.round(o.aportacioAssignada || 0) + '" onchange="_frSetObjCamp(' + oi + ',\'aportacioAssignada\',this.value)">'
    + '</div>'
    + sel('Estat', 'estat', [['actiu', 'Actiu'], ['assolit', 'Assolit'], ['pausat', 'Pausat']], o.estat)
    + '<label class="fr-obj-res" title="Absorbeix el capital i l’aportació que no reclama cap altre objectiu">'
      + '<input type="checkbox"' + (o.residual ? ' checked' : '') + ' onchange="_frSetObjResidual(' + oi + ',this.checked)"> Residual'
    + '</label>'
  + '</div>';
}

// Llista sencera d'objectius. Torna '' si el motor no hi és, i el cridador
// aleshores fa servir el render antic.
function _frObjectiusHtml(objectius, ctx, isAdmin) {
  if (typeof TBI_OBJECTIUS === 'undefined') return '';
  var a = TBI_OBJECTIUS.assignacio(objectius, ctx);
  var h = '';
  for (var oi = 0; oi < a.objectius.length; oi++) {
    var o = a.objectius[oi];
    var pr = TBI_OBJECTIUS.projeccio(o, ctx);
    h += '<div class="fr-objw">'
      + '<div class="fr-obj">'
        + '<div class="fr-obj-ico">' + (o.icona || TBI_ICO.svg('target')) + '</div>'
        + '<div>'
          + '<div class="fr-obj-titol"' + (isAdmin ? ' contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="titol"' : '') + '>' + o.titol + '</div>'
          + '<div class="fr-obj-meta"' + (isAdmin ? ' contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="meta"' : '') + '>' + (o.meta || '') + '</div>'
        + '</div>'
        + '<div class="fr-obj-import">'
          + '<div class="fr-obj-import-val"' + (isAdmin ? ' contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="import"' : '') + '>' + _frObjEur(o.import) + '</div>'
          + '<div class="fr-obj-import-lbl">' + _frObjMesData(o.dataObjectiu) + '</div>'
        + '</div>'
        + (isAdmin ? '<button class="fr-obj-del" onclick="_frRemoveObjectiu(' + oi + ')" title="Eliminar">×</button>' : '<div></div>')
      + '</div>'
      + _frObjProjHtml(pr, o, !isAdmin)
      + (isAdmin ? _frObjCtrlHtml(o, oi) : '')
    + '</div>';
  }
  return h;
}

/* ── Panell de coherència (només assessor) ───────────────────────────── */

function _frCoherenciaHtml(ctx) {
  if (typeof TBI_OBJECTIUS === 'undefined') return '';
  var coh;
  try { coh = TBI_OBJECTIUS.coherencia(ctx); } catch (e) { return ''; }
  if (!coh) return '';

  var col = coh.score >= 85 ? 'var(--green)' : (coh.score >= 60 ? 'var(--amber)' : 'var(--red)');
  var bg = coh.score >= 85 ? 'var(--green-l)' : (coh.score >= 60 ? 'var(--amber-l)' : 'var(--red-l)');
  var a = coh.assignacio;

  var h = '<div class="fr-coh">'
    + '<div class="fr-coh-head">'
      + '<div class="fr-coh-score" style="background:' + bg + ';color:' + col + '">' + coh.score + '<span>/100</span></div>'
      + '<div>'
        + '<div class="fr-coh-titol">Coherència del pla</div>'
        + '<div class="fr-coh-sub">'
          + (coh.flags.length
              ? coh.flags.length + (coh.flags.length === 1 ? ' cosa per resoldre' : ' coses per resoldre')
                + (coh.n_alta ? ' · ' + coh.n_alta + ' greu' + (coh.n_alta === 1 ? '' : 's') : '')
              : 'Objectius, pla i cartera diuen el mateix.')
        + '</div>'
      + '</div>'
    + '</div>';

  // Sobres
  h += '<div class="fr-coh-sobres">'
    + '<div class="fr-coh-kpi"><span>Cartera</span><b>' + _frObjEur(a.capital_total) + '</b></div>'
    + '<div class="fr-coh-kpi"><span>Assignat als objectius</span><b>' + _frObjEur(a.capital_assignat) + '</b></div>'
    + '<div class="fr-coh-kpi"><span>Sense objectiu</span><b>' + _frObjEur(a.capital_lliure) + '</b></div>'
    + '<div class="fr-coh-kpi"><span>Aportació</span><b>' + _frObjEur(a.aportacio_total) + '/mes</b></div>'
    + (coh.capital_segur_real !== null && coh.capital_segur_real !== undefined
        ? '<div class="fr-coh-kpi"><span>Fora de borsa: cal / hi ha</span><b>'
          + _frObjEur(coh.capital_segur_necessari) + ' / ' + _frObjEur(coh.capital_segur_real) + '</b></div>'
        : '')
  + '</div>';

  // Avisos
  if (coh.flags.length) {
    h += '<div class="fr-coh-flags">';
    for (var i = 0; i < coh.flags.length; i++) {
      var f = coh.flags[i];
      var fc = f.gravetat === 'alta' ? 'var(--red)' : (f.gravetat === 'mitjana' ? 'var(--amber)' : 'var(--g400)');
      h += '<div class="fr-coh-flag"><span class="fr-coh-dot" style="background:' + fc + '"></span>'
        + '<div><div class="fr-coh-flag-t">' + escapeHtml(f.titol) + '</div>'
        + '<div class="fr-coh-flag-d">' + escapeHtml(f.detall) + '</div></div></div>';
    }
    h += '</div>';
  }

  // Barreja proposada contra la cartera d'ara
  if (coh.blend) {
    var b = coh.blend;
    h += '<div class="fr-coh-blend">'
      + '<div class="fr-coh-blend-t">' + TBI_ICO.svg('scale') + ' Barreja que demanen els objectius</div>'
      + '<div class="fr-coh-bar">'
        + '<i style="width:' + b.rv.toFixed(1) + '%;background:#1B3A6B" title="RV ' + Math.round(b.rv) + '%"></i>'
        + '<i style="width:' + b.rf.toFixed(1) + '%;background:#8D6E63" title="RF ' + Math.round(b.rf) + '%"></i>'
        + '<i style="width:' + b.cash.toFixed(1) + '%;background:#90A4AE" title="Liquiditat ' + Math.round(b.cash) + '%"></i>'
      + '</div>'
      + '<div class="fr-coh-blend-l">'
        + '<span><b>' + Math.round(b.rv) + '%</b> RV</span>'
        + '<span><b>' + Math.round(b.rf) + '%</b> RF</span>'
        + '<span><b>' + Math.round(b.cash) + '%</b> liquiditat</span>'
        + '<span class="fr-obj-hint">cartera ara: ' + (ctx.pes_rv_real === null ? '—' : Math.round(ctx.pes_rv_real) + '% RV')
          + ' · sostre del perfil: ' + ctx.pct_rv_max + '% RV</span>'
      + '</div>'
      + '<div class="fr-coh-blend-r">Rendiment esperat d’aquesta barreja: <b>'
        + b.rendiment.nominal.toFixed(1).replace('.', ',') + '% nominal</b> · '
        + b.rendiment.real.toFixed(1).replace('.', ',') + '% real (inflació '
        + b.rendiment.inflacio.toFixed(1).replace('.', ',') + '%)</div>'
    + '</div>';
  }

  return h + '</div>';
}

"""

swap('bloc funcions objectius v2',
     "/* ════════════════════════════════════════════════════════════════════════════\n   OVERRIDES · l'assessor sobreescriu valors sense tocar el client a Supabase",
     BLOC.lstrip('\n') + "\n/* ════════════════════════════════════════════════════════════════════════════\n   OVERRIDES · l'assessor sobreescriu valors sense tocar el client a Supabase")


# ─────────────────────────────────────────────────────────────────────────
# 4. Reemplacar el bucle de render
# ─────────────────────────────────────────────────────────────────────────
OLD_LOOP = """  for (var oi = 0; oi < objectius.length; oi++) {
    var o = objectius[oi];
    var importStr = fEur(o.import || 0);
    if (isAdmin) {
      html += '<div class="fr-obj">'
        + '<div class="fr-obj-ico">' + (o.icona || TBI_ICO.svg('target')) + '</div>'
        + '<div>'
          + '<div class="fr-obj-titol" contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="titol">' + o.titol + '</div>'
          + '<div class="fr-obj-meta" contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="meta">' + (o.meta || '') + '</div>'
        + '</div>'
        + '<div class="fr-obj-import">'
          + '<div class="fr-obj-import-val" contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="import">' + importStr + '</div>'
          + '<div class="fr-obj-import-lbl" contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="termini">En ' + (o.termini || '—') + '</div>'
        + '</div>'
        + '<button class="fr-obj-del" onclick="_frRemoveObjectiu(' + oi + ')" title="Eliminar">×</button>'
      + '</div>';
    } else {
      html += '<div class="fr-obj">'
        + '<div class="fr-obj-ico">' + (o.icona || TBI_ICO.svg('target')) + '</div>'
        + '<div><div class="fr-obj-titol">' + o.titol + '</div><div class="fr-obj-meta">' + (o.meta || '') + '</div></div>'
        + '<div class="fr-obj-import"><div class="fr-obj-import-val">' + importStr + '</div><div class="fr-obj-import-lbl">En ' + (o.termini || '—') + '</div></div>'
        + '<div></div>'
      + '</div>';
    }
  }"""

NEW_LOOP = """  // Render v2: el motor calcula sobres, horitzó, barreja i projecció.
  // Si tbi-objectius.js no hagués carregat, es cau al render antic.
  var _objCtx = _frObjCtx(c);
  _objCtx.objectius = objectius;
  var _objHtml = _frObjectiusHtml(objectius, _objCtx, isAdmin);
  if (_objHtml) {
    html += _objHtml;
  } else {
    for (var oi = 0; oi < objectius.length; oi++) {
      var o = objectius[oi];
      var importStr = fEur(o.import || 0);
      html += '<div class="fr-obj">'
        + '<div class="fr-obj-ico">' + (o.icona || TBI_ICO.svg('target')) + '</div>'
        + '<div>'
          + '<div class="fr-obj-titol"' + (isAdmin ? ' contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="titol"' : '') + '>' + o.titol + '</div>'
          + '<div class="fr-obj-meta"' + (isAdmin ? ' contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="meta"' : '') + '>' + (o.meta || '') + '</div>'
        + '</div>'
        + '<div class="fr-obj-import">'
          + '<div class="fr-obj-import-val"' + (isAdmin ? ' contenteditable="true" data-obj-idx="' + oi + '" data-obj-field="import"' : '') + '>' + importStr + '</div>'
          + '<div class="fr-obj-import-lbl">En ' + (o.termini || '—') + '</div>'
        + '</div>'
        + (isAdmin ? '<button class="fr-obj-del" onclick="_frRemoveObjectiu(' + oi + ')" title="Eliminar">×</button>' : '<div></div>')
      + '</div>';
    }
  }"""

swap('render objectius v2', OLD_LOOP, NEW_LOOP)


# ─────────────────────────────────────────────────────────────────────────
# 5. Panell de coherencia despres dels botons d'afegir
# ─────────────────────────────────────────────────────────────────────────
OLD_TANCA = """      + '<button class="fr-obj-add fr-obj-add-custom" onclick="_frAddObjectiu(\\'lliure\\')">+ Personalitzat</button>'
    + '</div>';
  }
  html += '</div>';"""

NEW_TANCA = """      + '<button class="fr-obj-add fr-obj-add-custom" onclick="_frAddObjectiu(\\'lliure\\')">+ Personalitzat</button>'
    + '</div>';
  }
  // Panell de coherència: només per a l'assessor. El client veu el progrés
  // de cada objectiu, no el diagnòstic intern del pla.
  if (isAdmin) html += _frCoherenciaHtml(_objCtx);
  html += '</div>';"""

swap('panell coherencia', OLD_TANCA, NEW_TANCA)


# ─────────────────────────────────────────────────────────────────────────
# 6. CSS
# ─────────────────────────────────────────────────────────────────────────
CSS_ANCORA = "    + '.fr-obj-add-custom{border-style:dotted;color:var(--g500)}'"

CSS_NOU = CSS_ANCORA + """
    // ── Objectius v2: sobres, projecció i coherència ──
    + '.fr-objw{margin-bottom:12px}'
    + '.fr-objw .fr-obj{margin-bottom:0;border-radius:12px 12px 0 0;border-bottom:none}'
    + '.fr-obj-proj{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:9px 18px;background:var(--g50);border:1px solid var(--g200);border-top:1px dashed var(--g200);border-bottom:none;font-size:10.5px;color:var(--g500);line-height:1.5}'
    + '.fr-obj-proj.last{border-bottom:1px solid var(--g200);border-radius:0 0 12px 12px}'
    + '.fr-obj-proj b{color:var(--g700);font-family:var(--fm);font-weight:500}'
    + '.fr-obj-badge{font-family:var(--fm);font-size:8.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;padding:3px 9px;border-radius:99px;white-space:nowrap}'
    + '.fr-obj-bar{height:5px;background:var(--g100);border-radius:3px;overflow:hidden;min-width:70px;max-width:130px;flex:1 1 70px}'
    + '.fr-obj-bar i{display:block;height:100%;border-radius:3px;transition:width .3s}'
    + '.fr-obj-pm{font-family:var(--fm);font-size:10px;color:var(--g600)}'
    + '.fr-obj-hint{color:var(--g400);font-size:9.5px}'
    + '.fr-obj-cal{color:#8B1A1A}'
    + '.fr-obj-ctrl{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end;padding:12px 18px;background:#fff;border:1px solid var(--g200);border-top:1px dashed var(--g200);border-radius:0 0 12px 12px}'
    + '.fr-obj-f{display:flex;flex-direction:column;gap:3px}'
    + '.fr-obj-f label{font-family:var(--fm);font-size:8.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--g400)}'
    + '.fr-obj-f input,.fr-obj-f select{font-family:var(--fb);font-size:12px;padding:5px 8px;border:1px solid var(--g200);border-radius:7px;background:#fff;color:var(--black)}'
    + '.fr-obj-f input:focus,.fr-obj-f select:focus{outline:none;border-color:var(--accent-m)}'
    + '.fr-obj-f input[type=number]{font-family:var(--fm);width:92px;text-align:right}'
    + '.fr-obj-f input:disabled{background:var(--g50);color:var(--g400)}'
    + '.fr-obj-res{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--g600);cursor:pointer;padding-bottom:5px}'
    + '.fr-coh{margin-top:22px;background:#fff;border:1px solid var(--g200);border-radius:14px;padding:20px 22px}'
    + '.fr-coh-head{display:flex;align-items:center;gap:16px;margin-bottom:16px}'
    + '.fr-coh-score{font-family:var(--fm);font-size:24px;font-weight:500;padding:10px 16px;border-radius:12px;letter-spacing:-.02em;white-space:nowrap}'
    + '.fr-coh-score span{font-size:12px;opacity:.6}'
    + '.fr-coh-titol{font-family:var(--fd);font-size:15px;font-weight:500;color:var(--black)}'
    + '.fr-coh-sub{font-size:11.5px;color:var(--g500);margin-top:2px}'
    + '.fr-coh-sobres{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}'
    + '.fr-coh-kpi{flex:1 1 130px;background:var(--g50);border:1px solid var(--g200);border-radius:9px;padding:9px 12px}'
    + '.fr-coh-kpi span{display:block;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--g400);margin-bottom:3px}'
    + '.fr-coh-kpi b{font-family:var(--fm);font-size:13px;font-weight:500;color:var(--black)}'
    + '.fr-coh-flags{display:flex;flex-direction:column;gap:9px;margin-bottom:16px}'
    + '.fr-coh-flag{display:flex;gap:10px;align-items:flex-start}'
    + '.fr-coh-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:5px}'
    + '.fr-coh-flag-t{font-size:12px;font-weight:500;color:var(--g700);line-height:1.4}'
    + '.fr-coh-flag-d{font-size:11px;color:var(--g500);line-height:1.55;margin-top:1px}'
    + '.fr-coh-blend{border-top:1px solid var(--g100);padding-top:15px}'
    + '.fr-coh-blend-t{font-size:11px;font-weight:500;color:var(--g600);margin-bottom:9px;display:flex;align-items:center;gap:7px}'
    + '.fr-coh-bar{display:flex;height:9px;border-radius:5px;overflow:hidden;background:var(--g100)}'
    + '.fr-coh-bar i{display:block;height:100%}'
    + '.fr-coh-blend-l{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:11px;color:var(--g500)}'
    + '.fr-coh-blend-l b{font-family:var(--fm);font-weight:500;color:var(--g700)}'
    + '.fr-coh-blend-r{font-size:10.5px;color:var(--g500);margin-top:8px}'
    + '.fr-coh-blend-r b{font-family:var(--fm);font-weight:500;color:var(--g700)}'"""

# Els comentaris // dins d'una concatenacio de strings JS trencarien la
# expressio: es fan servir /* */ en linia propia? Millor treure'ls.
CSS_NOU = CSS_NOU.replace(
    "    // ── Objectius v2: sobres, projecció i coherència ──\n", "")

swap('CSS objectius v2', CSS_ANCORA, CSS_NOU)


# ─────────────────────────────────────────────────────────────────────────
# Escriure i validar
# ─────────────────────────────────────────────────────────────────────────
assert html != original, 'no s\'ha aplicat cap canvi'
open(RUTA, 'w', encoding='utf-8').write(html)
print('Canvis aplicats: %d' % len(canvis))
for c in canvis:
    print('  · ' + c)

scripts = re.findall(r'<script\b(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.DOTALL)
print('\nBlocs <script> inline: %d' % len(scripts))
errors = 0
for i, s in enumerate(scripts):
    open('/tmp/_chk%d.js' % i, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', '/tmp/_chk%d.js' % i],
                       capture_output=True, text=True)
    if r.returncode != 0:
        errors += 1
        print('  BLOC %d INVALID:\n%s' % (i, r.stderr[:2000]))
    else:
        print('  bloc %d ok (%d linies)' % (i, s.count('\n')))
sys.exit(1 if errors else 0)
