#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patcher Motor v3 per a platform.html — TIR/TWR, TER real, bandes 5/25.
Cada substitució assereix count == 1 abans d'aplicar-se."""

import io, os, re, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/assessoria/platform.html'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/sessions/funny-amazing-bardeen/mnt/outputs/platform.html'
BLK = os.path.dirname(os.path.abspath(OUT))

def load(name):
    with io.open(os.path.join(BLK, name), encoding='utf-8') as f:
        return f.read().rstrip('\n')

with io.open(SRC, encoding='utf-8') as f:
    s = f.read()

orig_len = len(s)
n = 0

def rep(old, new, label):
    global s, n
    c = s.count(old)
    assert c == 1, 'ANCORA "%s": %d coincidencies (esperava 1)' % (label, c)
    s = s.replace(old, new, 1)
    n += 1
    print('  [ok] %s' % label)

# ── 1) Bloc de motor v3 (helpers) abans de calcKPIsCartera ─────────────────
motor = load('motor_v3_block.js')
rep('// KPIs globals de cartera\nfunction calcKPIsCartera() {',
    motor + '\n\n// KPIs globals de cartera\nfunction calcKPIsCartera() {',
    'insercio bloc MOTOR_V3')

# ── 2) Substituir calcKPIsCartera sencera ──────────────────────────────────
kpis_new = load('kpis_v3.js')
i = s.index('// KPIs globals de cartera\nfunction calcKPIsCartera() {')
j = s.index("// Sèrie d'evolució temporal de la cartera (per al gràfic)", i)
old_kpis = s[i:j]
assert 'Math.pow(valor_total/cost_total' in old_kpis, 'no trobo el CAGR antic dins de calcKPIsCartera'
rep(old_kpis, kpis_new + '\n\n', 'calcKPIsCartera -> XIRR')

# ── 3) Substituir calcMatchingITactic sencera ──────────────────────────────
match_new = load('matching_v3.js')
i = s.index("// Càlcul de gaps (matching real vs target) i recomanació d'aportació")
j = s.index('// ════════════════════════════════════════════════════════════════════════════\n// FI Sistema de cartera v2', i)
old_match = s[i:j]
assert 'function calcMatchingITactic(aportacio) {' in old_match, 'no trobo calcMatchingITactic'
assert old_match.count('slice(0, 2)') == 2, 'la funcio antiga no te el top-2 esperat'
rep(old_match, match_new + '\n\n', 'calcMatchingITactic -> bandes 5/25')

# ── 4) Substituir renderMatchingTable + afegir renderTargetaTER ────────────
render_new = load('render_matching_v3.js')
ter_new = load('render_ter.js')
i = s.index('function renderMatchingTable(match) {')
j = s.index("// Gràfic SVG d'evolució (invertit acumulat + valor cartera, àrea de guany)", i)
old_render = s[i:j]
assert old_render.count('match.rows.forEach') == 1, 'renderMatchingTable inesperada'
rep(old_render, render_new + '\n\n' + ter_new + '\n\n', 'renderMatchingTable + renderTargetaTER')

# ── 5) KPI "Rendiment anual" del resum -> TIR amb fallback ─────────────────
old_kpi_render = """    var pnlUp = kpis.pnl_eur >= 0;
    var heroCol = pnlUp ? '#1A5C3A' : '#C0392B';
    var heroArrow = pnlUp ? '\\u25b2' : '\\u25bc';"""
new_kpi_render = """    var pnlUp = kpis.pnl_eur >= 0;
    var heroCol = pnlUp ? '#1A5C3A' : '#C0392B';
    var heroArrow = pnlUp ? '\\u25b2' : '\\u25bc';

    // Rendiment anualitzat: TIR diner-ponderada. Si l'historic es massa curt
    // (<6 mesos) anualitzar distorsiona, aixi que es mostra l'acumulat.
    var rendLbl, rendVal, rendCol;
    if (kpis.xirr !== null && kpis.xirr_fiable) {
      rendLbl = 'Rendiment anual (TIR)';
      rendVal = (kpis.xirr >= 0 ? '+' : '') + kpis.xirr.toFixed(1) + '%';
      rendCol = kpis.xirr >= 0 ? '#1A5C3A' : '#C0392B';
    } else {
      rendLbl = 'Rendiment acumulat';
      rendVal = (kpis.pnl_pct >= 0 ? '+' : '') + kpis.pnl_pct.toFixed(1) + '%';
      rendCol = kpis.pnl_pct >= 0 ? '#1A5C3A' : '#C0392B';
    }
    var twr = null;
    try { twr = calcTWR(); } catch(e) { twr = null; }"""
rep(old_kpi_render, new_kpi_render, 'preparacio KPI rendiment')

old_mini = """        + miniKpi('Rendiment anual', (kpis.cagr >= 0 ? '+' : '') + kpis.cagr.toFixed(1) + '%', kpis.cagr >= 0 ? '#1A5C3A' : '#C0392B')
        + miniKpi('Posicions', String(kpis.num_posicions), 'var(--black)')"""
new_mini = """        + miniKpi(rendLbl, rendVal, rendCol)
        + (twr && twr.fiable ? miniKpi('TWR anual', (twr.anual >= 0 ? '+' : '') + twr.anual.toFixed(1) + '%', twr.anual >= 0 ? '#1A5C3A' : '#C0392B') : '')
        + miniKpi('Posicions', String(kpis.num_posicions), 'var(--black)')"""
rep(old_mini, new_mini, 'miniKpi rendiment -> TIR + TWR')

# ── 6) Targeta de TER al resum ─────────────────────────────────────────────
rep("""    // Composició real (donut) + Top posicions
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px" class="cartera-split">';""",
    """    // Cost real de la cartera (TER ponderat vs target vs banca)
    html += renderTargetaTER();

    // Composició real (donut) + Top posicions
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px" class="cartera-split">';""",
    'targeta TER al resum')

# ── 7) Accio del hub: usar bandes en lloc del llindar fix de 5pp ───────────
old_accio = """      var matchTmp = calcMatchingITactic(aportMensTmp);
      if (matchTmp && matchTmp.rows && matchTmp.rows.length > 0) {
        var topGap = matchTmp.rows.slice().sort(function(a,b){return b.gap_eur - a.gap_eur;})[0];
        if (topGap && topGap.gap_pct > 5) {
          accions.push({
            icon: '⚡',
            titol: 'Categoria infraponderada: ' + (topGap.nom || ''),
            desc: 'La teva cartera est\\u00e0 a ' + topGap.real_pct.toFixed(1) + '% (target ' + topGap.target_pct.toFixed(0) + '%). Aporta a aquesta categoria per rebalancejar.',
            cta: 'Veure recomanaci\\u00f3',
            view: 'portal-aportacions',
            prioritat: 'mitja'
          });
        }
      }"""
new_accio = """      var matchTmp = calcMatchingITactic(aportMensTmp);
      if (matchTmp && matchTmp.resum && matchTmp.resum.cal_rebalanceig) {
        var foraB = matchTmp.rows.filter(function(r){ return r.fora_banda && r.gap_pct > 0; })
                                 .sort(function(a,b){ return b.gap_pct - a.gap_pct; });
        var topGap = foraB[0];
        if (topGap) {
          accions.push({
            icon: '⚡',
            titol: 'Fora de banda: ' + (topGap.nom || ''),
            desc: 'Est\\u00e0s a ' + topGap.real_pct.toFixed(1) + '% i el target \\u00e9s ' + topGap.target_pct.toFixed(0) + '% (banda \\u00b1' + topGap.banda_pp.toFixed(1) + 'pp). Prioritza aquesta categoria a la propera aportaci\\u00f3.',
            cta: 'Veure recomanaci\\u00f3',
            view: 'portal-aportacions',
            prioritat: 'mitja'
          });
        }
      }"""
rep(old_accio, new_accio, 'accio hub -> bandes')

# ── 8) Textos de la recomanacio (ja no son sempre 2 categories) ────────────
rep("""      + '<div style="font-size:12px;color:#9A6B1F;margin-bottom:16px;line-height:1.6">Per maximitzar el matching amb la teva cartera target, aportar només a les 2 categories més infraponderades (estalvies comissions i accelera el rebalanceig):</div>'""",
    """      + '<div style="font-size:12px;color:#9A6B1F;margin-bottom:16px;line-height:1.6">Repartiment calculat amb bandes 5/25: primer les categories fora de banda, sense superar mai el seu gap i amb un mínim de ' + match.import_min_ordre + '€ per ordre.</div>'""",
    'text recomanacio (pestanya matching)')

rep("""      + '<div style="font-size:12px;color:#9A6B1F;margin-bottom:18px;line-height:1.6">Per maximitzar el matching amb la teva cartera <strong>'+arq.cartNom+'</strong>, concentra l\\'aportació de <strong>'+aportMens.toLocaleString('ca-ES')+'€</strong> en les 2 categories més infraponderades:</div>'""",
    """      + '<div style="font-size:12px;color:#9A6B1F;margin-bottom:18px;line-height:1.6">Repartiment de <strong>'+aportMens.toLocaleString('ca-ES')+'€</strong> cap a la teva cartera <strong>'+arq.cartNom+'</strong>, prioritzant el que està fora de banda. Rebalancejar amb diners nous evita vendre — i evita el peatge fiscal.</div>'""",
    'text recomanacio (portal aportacions)')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(s)

print('\n%d substitucions aplicades. %d -> %d bytes (%+d)' % (n, orig_len, len(s), len(s) - orig_len))
