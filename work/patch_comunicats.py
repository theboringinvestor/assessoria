#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Comunicats de l'app: renderitzar l'HTML real, no text pla.

La newsletter es desa com un document HTML sencer (<!DOCTYPE html>…), pensat
per a clients de correu: taules, amples fixos i estils en línia. L'app el
passava per htmlAText() i en treia només el text.

La solució és la mateixa que ja fa servir la plataforma a
previsualitzarNewsletter(): un <iframe srcdoc>. Aïlla els estils de l'email
dels de l'app (que si no es barrejarien) i manté la maquetació original.

L'iframe va amb sandbox sense allow-scripts ni allow-same-origin: el contingut
el genera en part una IA, així que es tracta com a no fiable. htmlAText() es
manté com a alternativa si el comunicat no porta HTML.
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
# 1. tbi-app.html — obrirComunicat() amb iframe
# ══════════════════════════════════════════════════════════════════
F = os.path.join(BASE, 'tbi-app.html')
h = io.open(F, encoding='utf-8').read()
h0 = len(h)

VELL = """function obrirComunicat(id){
  var n = (_comunicats||[]).find(function(x){ return x.id === id; });
  if (!n) return;
  marcarComunicatLlegit(id);
  var cos = htmlAText(n.html);
  var dataTxt = n.sent_at ? dataHumana(String(n.sent_at).slice(0,10)) : '';

  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modal-com';
  modal.innerHTML = '<div class="modal-inner">'
    + (n.eyebrow ? '<div class="com-eyebrow">'+esc(n.eyebrow)+'</div>' : '')
    + '<div class="modal-h" style="margin-bottom:4px">'+esc(n.titol||'Comunicat')+'</div>'
    + (n.subtitol ? '<div class="modal-sub" style="margin-bottom:6px">'+esc(n.subtitol)+'</div>' : '')
    + '<div style="font-size:11px;color:var(--g400);margin-bottom:16px">'+dataTxt+'</div>'
    + '<div class="com-body">'+esc(cos)+'</div>'
    + '<button class="btn-primary" style="margin-top:20px" onclick="tancarComunicat()">Tancar</button>'
  + '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(ev){ if (ev.target === modal) tancarComunicat(); });
}"""

NOU = """// Prepara l'HTML del comunicat per veure'l dins de l'app:
//  - resol el marcador de baixa (dins de l'app no hi ha enllaç de baixa)
//  - obre els enllaços fora de l'iframe, no dins
//  - hi encaixa l'amplada: els emails porten taules de 600px fixos
function comunicatHTML(raw){
  var s = String(raw || '').split('{{unsubscribe_url}}').join('#');
  var extra = '<base target="_blank">'
    + '<style>html,body{margin:0;padding:0;background:#F7F5F0}'
    + 'body{-webkit-text-size-adjust:100%}'
    + 'img,table,td{max-width:100%!important;height:auto}'
    + 'table{width:100%!important}</style>';
  // injectar just després de <head>, o al principi si el document no en té
  if (/<head[^>]*>/i.test(s)) return s.replace(/<head[^>]*>/i, function(m){ return m + extra; });
  return extra + s;
}

function obrirComunicat(id){
  var n = (_comunicats||[]).find(function(x){ return x.id === id; });
  if (!n) return;
  marcarComunicatLlegit(id);
  var dataTxt = n.sent_at ? dataHumana(String(n.sent_at).slice(0,10)) : '';
  var teHTML = !!(n.html && String(n.html).trim());

  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modal-com';
  modal.innerHTML = '<div class="modal-inner">'
    + (n.eyebrow ? '<div class="com-eyebrow">'+esc(n.eyebrow)+'</div>' : '')
    + '<div class="modal-h" style="margin-bottom:4px">'+esc(n.titol||'Comunicat')+'</div>'
    + (n.subtitol ? '<div class="modal-sub" style="margin-bottom:6px">'+esc(n.subtitol)+'</div>' : '')
    + '<div style="font-size:11px;color:var(--g400);margin-bottom:14px">'+dataTxt+'</div>'
    // Amb HTML: iframe aïllat, que és com es veu al correu.
    // Sense HTML: text pla, com abans.
    + (teHTML
        ? '<iframe id="com-frame" class="com-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Comunicat"></iframe>'
        : '<div class="com-body">'+esc(htmlAText(n.html))+'</div>')
    + '<button class="btn-primary" style="margin-top:16px" onclick="tancarComunicat()">Tancar</button>'
  + '</div>';
  document.body.appendChild(modal);
  if (teHTML){
    var fr = document.getElementById('com-frame');
    // srcdoc per propietat, no per atribut: així no cal escapar res
    if (fr) fr.srcdoc = comunicatHTML(n.html);
  }
  modal.addEventListener('click', function(ev){ if (ev.target === modal) tancarComunicat(); });
}"""

h = rep(h, VELL, NOU, 'obrirComunicat(): iframe amb l\'HTML real')

# CSS de l'iframe
h = rep(h, ".com-body{font-size:14.5px;line-height:1.7;color:var(--g700);white-space:pre-line}",
        """.com-body{font-size:14.5px;line-height:1.7;color:var(--g700);white-space:pre-line}
/* El comunicat es veu tal com arriba al correu, dins d'un iframe aïllat
   perquè els estils de l'email no es barregin amb els de l'app. */
.com-frame{width:100%;height:68vh;border:1px solid var(--line);border-radius:var(--r);background:#fff;display:block}""",
        'CSS: .com-frame')

io.open(F, 'w', encoding='utf-8').write(h)

# ══════════════════════════════════════════════════════════════════
# 2. platform.html — espai orfe on hi havia l'emoji del comunicat
# ══════════════════════════════════════════════════════════════════
P = os.path.join(BASE, 'platform.html')
p = io.open(P, encoding='utf-8').read()
p0 = len(p)
# La previsualització del comunicat de comunitat s'imprimeix amb textContent,
# així que la icona hi sortia com a marcatge en cru. Fora.
p = rep(p, "var text = (assumpte ? '' + TBI_ICO.svg('megaphone') + ' ' + assumpte + '\\n\\n' : '')",
        "var text = (assumpte ? assumpte + '\\n\\n' : '')",
        'plataforma: icona fora de la previsualització del comunicat')
io.open(P, 'w', encoding='utf-8').write(p)

print('=' * 64)
for s in steps:
    print('  ✓ ' + s)
print('=' * 64)
print('tbi-app.html: %d -> %d · platform.html: %d -> %d' % (h0, len(h), p0, len(p)))

ok = True


def chk(c, m):
    global ok
    print(('  OK    ' if c else '  FALLA ') + m)
    ok = ok and c


chk('com-frame' in h and '.com-frame{' in h, 'iframe i el seu CSS')
chk('fr.srcdoc = comunicatHTML' in h, 'srcdoc assignat per propietat')
chk('sandbox="allow-popups allow-popups-to-escape-sandbox"' in h,
    'sandbox sense allow-scripts ni allow-same-origin')
chk('allow-scripts' not in h, 'cap allow-scripts enlloc')
chk('allow-same-origin' not in h, 'cap allow-same-origin enlloc')
chk('function htmlAText' in h, 'htmlAText() es manté com a alternativa')
chk('<base target="_blank">' in h, 'els enllaços obren fora de l\'iframe')
chk("split('{{unsubscribe_url}}')" in h, 'marcador de baixa resolt')

for f, t in [('tbi-app.html', h), ('platform.html', p)]:
    for i, s in enumerate(re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>(.*?)</script>', t, re.DOTALL)):
        io.open('/tmp/_c%d.js' % i, 'w', encoding='utf-8').write(s)
        r = subprocess.run(['node', '--check', '/tmp/_c%d.js' % i], capture_output=True, text=True)
        chk(r.returncode == 0, '%s script %d vàlid' % (f, i))
        if r.returncode:
            print(r.stderr[:700])

sys.exit(0 if ok else 1)
