#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Capa visual de tbi-app.html: hero amb sparkline i TIR, semafor de
bandes, cost real, estats buits amb accio i classes en lloc d'inline."""

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

assert 'sparklineSVG' not in s, 'ja sembla aplicat'

# ── 1) Tokens de color que falten + classes noves ─────────────────────────
rep("  --green:#1A5C3A; --red:#C0392B;",
    """  --green:#1A5C3A; --red:#C0392B;
  --gold-dark:#8A6F28;
  --green-bg:#EAF3DE; --red-bg:#FBEDED; --gold-bg:#FDF8EC;""",
    'tokens de color')

CSS = """
/* ── Hero de cartera ── */
.hero{position:relative;overflow:hidden}
.hero .spark{position:absolute;left:0;right:0;bottom:0;width:100%;height:48px;pointer-events:none}
.hero-pnl{font-family:var(--fm);font-size:15px;font-weight:600;margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hero-pill{padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600}
.hero-grid{display:flex;gap:22px;flex-wrap:wrap;margin-top:14px;padding-top:13px;border-top:1px solid var(--g100);position:relative}
.hero-nota{font-size:11px;color:var(--g400);margin-top:10px;line-height:1.5;position:relative}
.mini-lbl{font-size:10px;color:var(--g400);text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.mini-val{font-family:var(--fm);font-size:15px;color:var(--g700);margin-top:2px}
.mini-sub{font-size:10px;color:var(--g400);margin-top:1px}

/* ── Semàfor de coherència ── */
.salut{display:flex;align-items:center;gap:16px;padding:15px 17px;border-radius:14px;margin-bottom:14px}
.salut-num{font-family:var(--fm);font-size:26px;font-weight:700;line-height:1;flex-shrink:0}
.salut-num span{font-size:13px;opacity:.55;font-weight:500}
.salut-txt{font-size:12px;color:var(--g700);line-height:1.55}

/* ── Cost real ── */
.ter-row{display:flex;gap:20px;flex-wrap:wrap;margin-top:10px}
.ter-big{font-family:var(--fm);font-size:19px;font-weight:600;margin-top:3px}

/* ── Llegenda del donut ── */
.leg-row{display:flex;align-items:center;gap:10px;padding:6px 0}
.leg-dot{width:11px;height:11px;border-radius:3px;flex-shrink:0}
.leg-nom{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.leg-pct{font-family:var(--fm);font-size:13px;color:var(--g700)}

/* ── Estats buits amb acció ── */
.empty-rich{text-align:center;padding:44px 26px}
.empty-ico{font-size:42px;margin-bottom:12px}
.empty-tit{font-size:19px;font-weight:600;color:var(--ink);margin-bottom:8px}
.empty-sub{font-size:13.5px;color:var(--g500);line-height:1.65;margin-bottom:22px;max-width:340px;margin-left:auto;margin-right:auto}

/* ── Esquelets de càrrega ── */
.skel{background:linear-gradient(90deg,var(--g100) 25%,var(--g50) 37%,var(--g100) 63%);
  background-size:400% 100%;animation:skel 1.3s ease infinite;border-radius:8px}
@keyframes skel{0%{background-position:100% 50%}100%{background-position:0 50%}}
.skel-card{height:118px;margin-bottom:14px}
.skel-row{height:52px;margin-bottom:9px}
@media (prefers-reduced-motion:reduce){.skel{animation:none}}

/* ── Badge de deriva a la llista de l'objectiu ── */
.badge{display:inline-block;padding:1px 7px;border-radius:99px;font-size:9.5px;font-weight:700;letter-spacing:.02em}
.badge-ok{background:var(--green-bg);color:var(--green)}
.badge-infra{background:var(--gold-bg);color:var(--gold-dark)}
.badge-sobre{background:var(--red-bg);color:var(--red)}
"""
rep('</style>', CSS + '</style>', 'classes CSS noves')

# ── 2) renderCartera nou ──────────────────────────────────────────────────
with io.open(os.path.join(BLK, 'app_cartera_v2.js'), encoding='utf-8') as f:
    nou = f.read().rstrip('\n')
i = s.index('function renderCartera(){')
j = s.index('\n// ── Modal actualitzar valors ──', i)
vell = s[i:j]
assert 'donutSVG' in vell and 'kpi-big' in vell, 'renderCartera inesperada'
s = s[:i] + nou + '\n' + s[j:]
n += 1
print('  [ok] renderCartera v2 (%d -> %d chars)' % (len(vell), len(nou)))

# ── 3) Esquelet mentre carrega ────────────────────────────────────────────
rep("function go(view){",
    """// Esquelet de carrega: millor que una pantalla en blanc mentre arriba Supabase
function skeleton(){
  var el = $('view');
  if (el) el.innerHTML = '<div class="skel skel-card"></div>'
    + '<div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div>';
}

function go(view){""",
    'esquelet de carrega')

# ── 4) La llista objectiu passa a fer servir bandes ──────────────────────
rep("""    var diff = r.targetPct - r.realPct;
    var diffTxt = (Math.abs(diff) < 0.5) ? 'al punt' : ((diff>0?'+':'')+diff.toFixed(1)+'% per '+(diff>0?'sota':'sobre'));
    var diffCol = (Math.abs(diff) < 0.5) ? 'var(--g400)' : (diff>0 ? 'var(--gold)' : 'var(--g500)');""",
    """    // La referencia ja no es un llindar arbitrari sino la banda 5/25 real
    var diff = r.gapPct;
    var dins = !r.foraBanda;
    var diffTxt = dins ? 'dins de banda' : ((diff>0?'+':'')+diff.toFixed(1)+'pp per '+(diff>0?'sota':'sobre'));
    var diffCol = dins ? 'var(--g400)' : (diff>0 ? 'var(--gold-dark)' : 'var(--red)');
    var badge = '<span class="badge '+(dins?'badge-ok':(diff>0?'badge-infra':'badge-sobre'))+'">'
      + (dins?'ok':(diff>0?'infra':'sobre'))+'</span>';""",
    'llista objectiu amb bandes')

rep("""        + '<div class="pos-meta">Actual '+r.realPct.toFixed(1)+'% · objectiu '+r.targetPct.toFixed(0)+'%</div>'""",
    """        + '<div class="pos-meta">Actual '+r.realPct.toFixed(1)+'% · objectiu '+r.targetPct.toFixed(0)+'% · banda ±'+r.banda.toFixed(1)+'pp '+badge+'</div>'""",
    'meta amb banda i badge')

# ── 5) Explicació de la recomanació coherent amb el motor nou ────────────
rep("""      + 'Suggerit per acostar la teva cartera a l\\'objectiu. Reforça les categories per sota del seu pes ideal.</div>';""",
    """      + 'Calculat amb bandes 5/25: primer el que està fora de banda, mai més enllà del seu forat i amb un mínim de '
      + TBI_CARTERA.PARAMS.import_min_ordre + '€ per ordre. És exactament el mateix càlcul que veu el teu assessor.</div>';""",
    'explicacio de la recomanacio')

# ── 6) Estats buits amb accio ─────────────────────────────────────────────
rep("""    el.innerHTML = '<div class="empty">Encara no tens cartera configurada.<br><br>Quan el teu assessor defineixi la teva cartera, aquí veuràs quant i on aportar cada mes.</div>';""",
    """    el.innerHTML = '<div class="empty-rich">'
      + '<div class="empty-ico">📅</div>'
      + '<div class="empty-tit">Encara no tens cartera objectiu</div>'
      + '<div class="empty-sub">Quan el teu assessor defineixi la teva cartera, aquí veuràs cada mes quant aportar i a quina categoria exactament.</div>'
      + '<button class="btn-primary" onclick="go(\\'missatges\\')">Escriure a l\\'assessor</button>'
      + '</div>';""",
    'estat buit d\'aportacions')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(s)

print('\n%d canvis. %d -> %d bytes (%+d)' % (n, orig, len(s), len(s) - orig))
