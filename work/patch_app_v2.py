#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Redisseny de tbi-app.html — The Boring Investor
1) Carrega IBM Plex de veritat (l'@import dins de <style> mai s'aplicava)
2) Nou sistema visual (tokens de marca, icones SVG, pastilles de categoria)
3) Arregla el sparkline que es dibuixava sobre el text del hero
4) Elimina colors de marca antiga (#1B3A6B, DM Sans/DM Mono, #C0392B)
Cada substitucio porta assert de unicitat.
"""
import io, os, re, subprocess, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'tbi-app.html')
OUT = os.path.join(BASE, 'tbi-app.html')

html = io.open(SRC, encoding='utf-8').read()
orig_len = len(html)
new_head = io.open(os.path.join(BASE, 'new_head.txt'), encoding='utf-8').read().rstrip('\n')
new_shell = io.open(os.path.join(BASE, 'new_shell.txt'), encoding='utf-8').read().rstrip('\n')

steps = []


def rep(old, new, label, count=1):
    global html
    n = html.count(old)
    assert n == count, 'ESPERAVA %d, TROBAT %d -> %s' % (count, n, label)
    html = html.replace(old, new)
    steps.append(label)


# ─────────────────────────────────────────────────────────────
# 1. BLOC <style> SENCER + <link> de fonts al <head>
# ─────────────────────────────────────────────────────────────
i0 = html.index('<style>')
i1 = html.index('</style>') + len('</style>')
old_style = html[i0:i1]
assert '@import url(' in old_style, 'el bloc style no conte @import'
assert 'DM Sans' not in old_style
html = html[:i0] + new_head + html[i1:]
steps.append('style: bloc sencer substituit (%d -> %d chars)' % (len(old_style), len(new_head)))

# Treure el comentari obsolet del manifest embegut
rep('<!-- PWA manifest embegut com a data URI (fitxer únic, sense fitxers externs) -->\n',
    '', 'head: comentari obsolet del manifest')

# ─────────────────────────────────────────────────────────────
# 2. SHELL DEL BODY (splash / login / app / nav)
# ─────────────────────────────────────────────────────────────
j0 = html.index('<!-- SPLASH -->')
j1 = html.index('<div id="toast" class="toast"></div>')
old_shell = html[j0:j1]
assert 'nav-missatges' in old_shell and '📊' in old_shell, 'shell inesperat'
html = html[:j0] + new_shell + '\n\n' + html[j1:]
steps.append('shell: splash/login/topbar/nav substituits')

# ─────────────────────────────────────────────────────────────
# 3. PALETA DE CATEGORIES + PASTILLES (substitueixen els emojis)
# ─────────────────────────────────────────────────────────────
rep(
    "var CAT_PALETTE = ['#1B3A6B','#2E5FA3','#4A7CC7','#B8902E','#1A5C3A','#8C6BAA','#C0743A','#5B8A72','#A0526B','#3A7A8C','#9A9690','#6B6762'];",
    "var CAT_PALETTE = ['#16233A','#24395C','#3B5A8C','#C8A54A','#1A5C3A','#6B5B95','#A8622F','#4A7A66','#8B3A52','#2F6B7A','#8A8578','#5C5A54'];",
    'CAT_PALETTE alineada amb la marca')

# Helper: inicials + pastilla de color per categoria
anchor = "function emojiFor(p){\n  if (p && p.cat && CAT_EMOJI[p.cat]) return CAT_EMOJI[p.cat];\n  return '•';\n}"
assert html.count(anchor) == 1, 'no trobo emojiFor'
chip_fn = anchor + """

// ── Pastilles de categoria ─────────────────────────────────────────────
// Substitueixen els emojis: un quadrat arrodonit amb el color real de la
// categoria (el mateix del donut) i les inicials del nom. Mateix llenguatge
// visual que la plataforma, i llegible a qualsevol mida.
function catInicials(nom){
  var s = String(nom || '').replace(/[^A-Za-z\\u00C0-\\u024F ]/g, ' ').trim();
  if (!s) return '\\u00b7\\u00b7';
  var mots = s.split(/\\s+/).filter(function(w){
    return ['i','de','del','la','el','les','els','a','per','amb'].indexOf(w.toLowerCase()) === -1;
  });
  if (!mots.length) mots = s.split(/\\s+/);
  if (mots.length === 1) return mots[0].slice(0,2).toUpperCase();
  return (mots[0].charAt(0) + mots[1].charAt(0)).toUpperCase();
}
function chipCat(catId, mida){
  var info = catInfo(catId);
  var cls = (mida === 'sm') ? 'chip chip-sm' : 'chip';
  return '<span class="' + cls + '" style="background:' + (info.color || '#6B7280') + '" aria-hidden="true">'
    + esc(catInicials(info.nom || catId)) + '</span>';
}"""
rep(anchor, chip_fn, 'chipCat() + catInicials()')

# Files de posicio: emoji -> pastilla (vista cartera)
rep("      + '<span class=\"pos-emoji\">'+emojiFor(p)+'</span>'\n"
    "      + '<div style=\"flex:1;min-width:0\">'\n"
    "        + '<div class=\"pos-nom\">'+esc(catNom)+'</div>'",
    "      + chipCat(p.cat)\n"
    "      + '<div style=\"flex:1;min-width:0\">'\n"
    "        + '<div class=\"pos-nom\">'+esc(catNom)+'</div>'",
    'renderCartera: pastilla de categoria')

# Modal actualitzar valors: emoji -> pastilla
rep("        + '<span class=\"pos-emoji\">'+emojiFor(p)+'</span>'",
    "        + chipCat(p.cat, 'sm')",
    'obrirActualitzar: pastilla de categoria')

# ─────────────────────────────────────────────────────────────
# 4. DONUT: tipografia i colors de marca
# ─────────────────────────────────────────────────────────────
rep("""    + '<text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" font-size="11" fill="#9A9690" font-family="DM Sans,sans-serif">Total</text>'
    + '<text x="'+cx+'" y="'+(cy+15)+'" text-anchor="middle" font-size="17" fill="#1B3A6B" font-weight="600" font-family="DM Mono,monospace">'+eurRound(total)+'</text>'""",
    """    + '<text x="'+cx+'" y="'+(cy-5)+'" text-anchor="middle" font-size="9.5" fill="#9AA1AC" letter-spacing="1.2" font-family="IBM Plex Mono,monospace">TOTAL</text>'
    + '<text x="'+cx+'" y="'+(cy+15)+'" text-anchor="middle" font-size="17" fill="#16233A" font-weight="600" font-family="IBM Plex Sans,sans-serif">'+eurRound(total)+'</text>'""",
    'donut: IBM Plex + navy de marca')

# Donut una mica mes fi i modern
rep("  var size = 180, cx = size/2, cy = size/2, r = 62, sw = 26;",
    "  var size = 180, cx = size/2, cy = size/2, r = 64, sw = 19;",
    'donut: traç més fi')
rep("      + 'stroke=\"'+seg.color+'\" stroke-width=\"'+sw+'\" '",
    "      + 'stroke=\"'+seg.color+'\" stroke-width=\"'+sw+'\" stroke-linecap=\"butt\" '",
    'donut: extrems rectes')

# ─────────────────────────────────────────────────────────────
# 5. SPARKLINE DEL HERO — la causa del solapament de la captura
# ─────────────────────────────────────────────────────────────
rep("""  var puja = vals[vals.length-1] >= vals[0];
  var col = puja ? 'var(--green)' : 'var(--red)';
  return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'
    + '<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+col+'" stroke-width="2" '
      + 'stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>'
    + '<circle cx="'+W+'" cy="'+pts[pts.length-1].split(',')[1]+'" r="3" fill="'+col+'"/>'
    + '</svg>';""",
    """  var puja = vals[vals.length-1] >= vals[0];
  var col = puja ? '#1A5C3A' : '#8B1A1A';
  var area = 'M0,'+H+' L' + pts.join(' L') + ' L'+W+','+H+' Z';
  // El sparkline viu a la seva propia banda al peu de la targeta (.hero-spark),
  // no en absolut sobre el contingut: abans es dibuixava per sobre del text.
  return '<div class="hero-spark"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'
    + '<defs><linearGradient id="sparkg" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="'+col+'" stop-opacity=".16"/>'
      + '<stop offset="100%" stop-color="'+col+'" stop-opacity="0"/>'
    + '</linearGradient></defs>'
    + '<path d="'+area+'" fill="url(#sparkg)"/>'
    + '<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+col+'" stroke-width="1.6" '
      + 'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
    + '</svg></div>';""",
    'sparkline: banda propia + area, sense solapament')

# Moure el sparkline al final de la targeta hero
rep("""  html += '<div class="card hero">'
    + sparklineSVG()
    + '<div class="card-lbl">Valor total de la cartera</div>'""",
    """  html += '<div class="card hero">'
    + '<div class="card-lbl">Valor total de la cartera</div>'""",
    'hero: treure el sparkline de dalt')

rep("""    html += '<div class="hero-nota">Amb menys de 6 mesos d\\'històric, anualitzar el rendiment enganya. T\\'ensenyem l\\'acumulat.</div>';
  }
  html += '</div>';""",
    """    html += '<div class="hero-nota">Amb menys de 6 mesos d\\'històric, anualitzar el rendiment enganya. T\\'ensenyem l\\'acumulat.</div>';
  }
  html += sparklineSVG();
  html += '</div>';""",
    'hero: sparkline al peu de la targeta')

# ─────────────────────────────────────────────────────────────
# 6. GRAFIC D'EVOLUCIO — colors de marca
# ─────────────────────────────────────────────────────────────
rep("""      + '<stop offset="0%" stop-color="#1B3A6B" stop-opacity="0.16"/>'
      + '<stop offset="100%" stop-color="#1B3A6B" stop-opacity="0"/>'""",
    """      + '<stop offset="0%" stop-color="#16233A" stop-opacity="0.14"/>'
      + '<stop offset="100%" stop-color="#16233A" stop-opacity="0"/>'""",
    'evolucio: degradat navy')
rep("""    + '<path d="'+lineApt+'" fill="none" stroke="#B8902E" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>'""",
    """    + '<path d="'+lineApt+'" fill="none" stroke="#C8A54A" stroke-width="1.8" stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>'""",
    'evolucio: linia aportat en or de marca')
rep("""    + '<path d="'+lineVal+'" fill="none" stroke="#1B3A6B" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';""",
    """    + '<path d="'+lineVal+'" fill="none" stroke="#16233A" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';""",
    'evolucio: linia valor en navy')
rep("""  ptsVal.forEach(function(p){ svg += '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="#1B3A6B"/>'; });""",
    """  ptsVal.forEach(function(p,i){
    var ultim = (i === ptsVal.length-1);
    svg += '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+(ultim?3.6:2.4)+'" fill="#16233A"'+(ultim?' stroke="#fff" stroke-width="1.6"':'')+'/>';
  });""",
    'evolucio: punts, ultim destacat')
rep("""fill="#9A9690" text-anchor="start">'+mesAbrevCA(snaps[0].mes)+'</text>';""",
    """fill="#9AA1AC" text-anchor="start">'+mesAbrevCA(snaps[0].mes)+'</text>';""",
    'evolucio: etiqueta mes inicial')
rep("""fill="#9A9690" text-anchor="end">'+mesAbrevCA(snaps[n-1].mes)+'</text>';""",
    """fill="#9AA1AC" text-anchor="end">'+mesAbrevCA(snaps[n-1].mes)+'</text>';""",
    'evolucio: etiqueta mes final')
rep("""<span style="width:16px;height:3px;background:#1B3A6B;border-radius:2px"></span>""",
    """<span style="width:16px;height:2.5px;background:#16233A;border-radius:2px"></span>""",
    'evolucio: llegenda valor')
rep("""<span style="width:16px;height:0;border-top:2px dashed #B8902E"></span>""",
    """<span style="width:16px;height:0;border-top:2px dashed #C8A54A"></span>""",
    'evolucio: llegenda aportat')

# ─────────────────────────────────────────────────────────────
# 7. BOTONS I ESTATS BUITS: emojis -> icones SVG
# ─────────────────────────────────────────────────────────────
ICO_REFRESH = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
               'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
               '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/>'
               '<path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M20 20v-4.5h-4.5"/></svg>')
ICO_PLUS = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>')

rep("""  var btnTxt = necessitaUpd
    ? (dies === Infinity ? '💱 Posa els valors al dia' : '💱 Actualitzar (fa '+dies+' dies)')
    : '💱 Actualitzar valors';
  html += '<button class="btn-primary" style="margin-bottom:14px" onclick="obrirActualitzar()">'+btnTxt+'</button>';""",
    """  var btnTxt = necessitaUpd
    ? (dies === Infinity ? 'Posa els valors al dia' : 'Actualitzar (fa '+dies+' dies)')
    : 'Actualitzar valors';
  html += '<button class="btn-primary" style="margin-bottom:12px" onclick="obrirActualitzar()">'
    + '%s' + btnTxt + '</button>';""" % ICO_REFRESH,
    'boto actualitzar: icona SVG')

rep("""  html += '<button class="btn-primary" style="margin-bottom:14px" onclick="obrirRegistrarAportacio()">➕ Registrar aportació feta</button>';""",
    """  html += '<button class="btn-primary" style="margin-bottom:12px" onclick="obrirRegistrarAportacio()">'
    + '%s' + 'Registrar aportació feta</button>';""" % ICO_PLUS,
    'boto registrar aportacio: icona SVG')

# Estats buits: emoji -> marca en gris
EMPTY_MARK = ('<svg width="46" height="46" viewBox="0 0 100 100" aria-hidden="true">'
              '<rect x="1.5" y="1.5" width="97" height="97" rx="23" fill="none" '
              'stroke="currentColor" stroke-width="3" opacity=".35"/>'
              '<circle cx="34" cy="42" r="6" fill="currentColor"/>'
              '<circle cx="66" cy="42" r="6" fill="currentColor"/>'
              '<path d="M31 67 L69 63" stroke="currentColor" stroke-width="7.5" stroke-linecap="round"/></svg>')

rep("""      + '<div class="empty-ico">📊</div>'""",
    """      + '<div class="empty-ico">%s</div>'""" % EMPTY_MARK,
    'estat buit cartera: marca TBI')
rep("""      + '<div class="empty-ico">📅</div>'""",
    """      + '<div class="empty-ico">%s</div>'""" % EMPTY_MARK,
    'estat buit aportar: marca TBI')
rep("""      + '<div style="font-size:30px;margin-bottom:6px">📅</div>'
      + '<div class="section-h" style="margin:0 0 6px">Quant vols aportar cada mes?</div>'""",
    """      + '<div class="empty-ico" style="margin-bottom:14px">%s</div>'
      + '<div class="modal-h" style="margin:0 0 8px">Quant vols aportar cada mes?</div>'""" % EMPTY_MARK,
    'aportacio mensual: capçalera')

# ─────────────────────────────────────────────────────────────
# 8. AJUDA: emojis -> icones SVG coherents amb la nav
# ─────────────────────────────────────────────────────────────
rep("""function ajudaItem(emoji, titol, desc){
  return '<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px">'
    + '<div style="font-size:20px;flex-shrink:0">'+emoji+'</div>'
    + '<div><div style="font-size:14px;font-weight:600;color:var(--black);margin-bottom:2px">'+titol+'</div>'
      + '<div style="font-size:12px;color:var(--g500);line-height:1.5">'+desc+'</div></div>'
  + '</div>';
}""",
    """// Icones de l'ajuda: el mateix joc que la barra de navegacio.
var AJUDA_ICONES = {
  cartera:  '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3.5v5.1M19.4 15.2l-4.7-2"/>',
  valors:   '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
  aportar:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
  evolucio: '<path d="M3.5 19.5h17"/><path d="M6 15.5l4.2-4.6 3.2 2.6 4.8-6"/><path d="M14.6 7.5h3.6v3.4"/>',
  missatges:'<path d="M20.5 11.6c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20l1.3-3.4C4.1 15.3 3.5 13.5 3.5 11.6c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z"/>'
};
function ajudaItem(clau, titol, desc){
  var d = AJUDA_ICONES[clau] || AJUDA_ICONES.cartera;
  return '<div style="display:flex;gap:13px;align-items:flex-start;margin-bottom:15px">'
    + '<div style="width:34px;height:34px;border-radius:10px;background:var(--g50);border:1px solid var(--line);'
      + 'display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--navy)">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg></div>'
    + '<div><div style="font-size:14px;font-weight:600;color:var(--black);margin-bottom:3px">'+titol+'</div>'
      + '<div style="font-size:12.5px;color:var(--g500);line-height:1.6">'+desc+'</div></div>'
  + '</div>';
}""",
    'ajudaItem: icones SVG')

for emoji, clau in [('📊', 'cartera'), ('💱', 'valors'), ('➕', 'aportar'),
                    ('📈', 'evolucio'), ('💬', 'missatges')]:
    rep("+ ajudaItem('%s', " % emoji, "+ ajudaItem('%s', " % clau,
        'ajuda: %s -> %s' % (emoji, clau))

rep("""      + '<div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:6px">📲 Instal·lar al mòbil</div>'""",
    """      + '<div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:7px">Instal·lar al mòbil</div>'""",
    'ajuda: titol instal·lar sense emoji')
rep("""      + '<div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:8px">🔔 Notificacions</div>'""",
    """      + '<div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:9px">Notificacions</div>'""",
    'ajuda: titol notificacions sense emoji')
rep("""      + '<div style="font-size:13px;color:var(--g700)">' + (actiu ? '🔔 Notificacions activades' : '🔕 Notificacions desactivades') + '</div>'""",
    """      + '<div style="font-size:13px;color:var(--g700)">' + (actiu ? 'Notificacions activades' : 'Notificacions desactivades') + '</div>'""",
    'push: fila sense emoji')

# Banner "ja has aportat": colors de token
rep("""    html += '<div class="banner-upd" style="background:#EEF3EE;border-color:#A8CDB5">'
      + '<div class="txt" style="color:#1A5C3A">✓ Aquest mes ja has registrat '+eurRound(totalFet)+' en aportacions.</div></div>';""",
    """    html += '<div class="banner-upd" style="background:var(--green-bg);border-color:#BFD6C6">'
      + '<div class="txt" style="color:var(--green)">Aquest mes ja has registrat '+eurRound(totalFet)+' en aportacions.</div></div>';""",
    'banner aportacions: tokens de marca')

# Recomanacio d'aportacio: punt de color -> pastilla
rep("""        + '<span style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:'+r.color+'"></span>'""",
    """        + chipCat(r.cat, 'sm')""",
    'aportar: pastilla de categoria a la recomanacio')

# ─────────────────────────────────────────────────────────────
# ESCRIURE + VALIDAR
# ─────────────────────────────────────────────────────────────
io.open(OUT, 'w', encoding='utf-8').write(html)

print('=' * 62)
for s in steps:
    print('  ✓ ' + s)
print('=' * 62)
print('tbi-app.html: %d -> %d chars' % (orig_len, len(html)))

# Comprovacions finals
for bad in ['#1B3A6B', 'DM Sans', 'DM Mono', '#C0392B', '@import', 'pos-emoji', 'class="spark"']:
    assert bad not in html, 'ENCARA HI HA: ' + bad
print('✓ sense marca antiga (#1B3A6B / DM Sans / DM Mono / #C0392B / @import)')

assert 'fonts.googleapis.com/css2?family=IBM+Plex+Sans' in html.split('<style>')[0], \
    'la font no es carrega abans del <style>'
print('✓ IBM Plex es carrega via <link> al <head>')

# node --check a cada bloc <script> inline
scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.DOTALL)
print('✓ %d bloc(s) <script> inline a validar' % len(scripts))
for idx, s in enumerate(scripts):
    p = '/tmp/_chk_%d.js' % idx
    io.open(p, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode != 0:
        print('✗ SCRIPT %d INVALID:\n%s' % (idx, r.stderr))
        sys.exit(1)
    print('  ✓ script %d OK (%d chars)' % (idx, len(s)))

print('\nTOT VALIDAT.')
