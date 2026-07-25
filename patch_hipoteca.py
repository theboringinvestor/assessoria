#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Integra el mòdul portal-hipoteca a platform.html.
Cada substitució assereix count == 1 abans d'aplicar-se."""

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

assert 'portal-hipoteca' not in s, 'el modul ja sembla integrat'

# ── 1) Carregar el motor compartit ────────────────────────────────────────
rep('<script src="tbi-perfil.js"></script>',
    '<script src="tbi-perfil.js"></script>\n<script src="tbi-hipoteca.js"></script>',
    'carregar tbi-hipoteca.js')

# ── 2) normalizeClient: incloure la columna nova ──────────────────────────
# Sense aixo, normalizeClient la deixaria caure silenciosament.
rep("""    perfil_assessor: raw.perfil_assessor || {},
    assessor_analisi: raw.assessor_analisi || null,
  };""",
    """    perfil_assessor: raw.perfil_assessor || {},
    assessor_analisi: raw.assessor_analisi || null,
    // ── Mòdul d'hipoteca i deute ──
    // hipoteques: [{id,nom,capital,anys,modalitat,tipus_fix,diferencial,anys_fix,
    //   euribor_previst,comissio_amort_pct,segurs_anuals,preu_habitatge,
    //   deduccio_pre2013,amortitzacions:[{id,mes,import,mode,data}]}]
    hipoteques: Array.isArray(raw.hipoteques) ? raw.hipoteques : [],
  };""",
    'normalizeClient inclou hipoteques')

# ── 3) Entrades de menu (admin i client) ──────────────────────────────────
rep("""  {id:'portal-fiscalitat', icon:'🧾', label:'Calculadora fiscal'},
  {section:'Sistema'},""",
    """  {id:'portal-fiscalitat', icon:'🧾', label:'Calculadora fiscal'},
  {id:'portal-hipoteca',   icon:'🏠', label:'Hipoteca i deute'},
  {section:'Sistema'},""",
    'menu admin')

rep("""  {id:'portal-fiscalitat', icon:'🧾', label:'Calculadora fiscal'},
  {section:'Compte i suport', collapsible:true},""",
    """  {id:'portal-fiscalitat', icon:'🧾', label:'Calculadora fiscal'},
  {id:'portal-hipoteca', icon:'🏠', label:'Hipoteca i deute'},
  {section:'Compte i suport', collapsible:true},""",
    'menu client')

# ── 4) Titol de la vista ──────────────────────────────────────────────────
rep("""    'portal-fiscalitat': APP.role === 'admin' ? ['Portal Client · Fiscalitat', '👁 Previsualització'] : ['Calculadora fiscal', 'Tributació d\\'inversions · Espanya 2026'],""",
    """    'portal-fiscalitat': APP.role === 'admin' ? ['Portal Client · Fiscalitat', '👁 Previsualització'] : ['Calculadora fiscal', 'Tributació d\\'inversions · Espanya 2026'],
    'portal-hipoteca': APP.role === 'admin' ? ['Portal Client · Hipoteca', '👁 Previsualització'] : ['Hipoteca i deute', 'Simulació, amortització i comparativa amb la teva cartera'],""",
    'titol de la vista')

# ── 5) Router ─────────────────────────────────────────────────────────────
rep("""    case 'portal-fiscalitat': renderPortalFiscalitat(content); break;""",
    """    case 'portal-fiscalitat': renderPortalFiscalitat(content); break;
    case 'portal-hipoteca': renderPortalHipoteca(content); break;""",
    'router')

# ── 6) Targeta al hub ─────────────────────────────────────────────────────
rep("""      + hubSmallCard('🧮','Simulador','portal-simuladors')""",
    """      + hubSmallCard('🧮','Simulador','portal-simuladors')
      + hubSmallCard('🏠','Hipoteca','portal-hipoteca')""",
    'targeta al hub')

# ── 7) Bloc del modul, just abans del sistema de cartera v2 ───────────────
with io.open(os.path.join(BLK, 'portal_hipoteca.js'), encoding='utf-8') as f:
    modul = f.read().rstrip('\n')

anchor = """// ════════════════════════════════════════════════════════════════════════════
// MOTOR D'ANÀLISI v3"""
rep(anchor, modul + '\n\n' + anchor, 'insercio del modul portal-hipoteca')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(s)

print('\n%d substitucions. %d -> %d bytes (%+d)' % (n, orig, len(s), len(s) - orig))
