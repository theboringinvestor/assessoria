#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Patch: vista d'administració "Alertes de mercat" (platform.html)

  A) Entrada al menú ADMIN_NAV
  B) Títol de la vista
  C) Cas al switch de renderView
  D) renderAdminAlertes + helpers

Cada reemplaçament assegura count == 1 abans d'aplicar-se.
"""
import io

PATH = 'platform.html'
src = io.open(PATH, encoding='utf-8').read()
orig = len(src)


def patch(old, new, etiqueta):
    global src
    n = src.count(old)
    assert n == 1, u'[%s] ancoratge trobat %d cops (cal 1)' % (etiqueta, n)
    src = src.replace(old, new, 1)
    print(u'  \u2713 %s' % etiqueta)


# ── A) Menú ────────────────────────────────────────────────────────
A = u"  {id:'admin-radar',       icon:TBI_ICO.svg('trend-down'), label:'Radar d\\u2019Oportunitats'},\n"
patch(A, A + u"  {id:'admin-alertes',     icon:TBI_ICO.svg('bell'), label:'Alertes de mercat'},\n", u'A \u00b7 men\u00fa')

# ── B) Títol ───────────────────────────────────────────────────────
B = u"    'admin-radar': ['Radar d\\'Oportunitats', 'Detecci\u00f3 de caigudes i refor\u00e7 din\u00e0mic d\\'aportacions'],\n"
patch(B, B + u"    'admin-alertes': ['Alertes de mercat', 'Detecci\u00f3 autom\u00e0tica de caigudes i enviament als clients'],\n", u'B \u00b7 t\u00edtol')

# ── C) Switch ──────────────────────────────────────────────────────
C = u"    case 'admin-radar': renderAdminRadar(content); break;\n"
patch(C, C + u"    case 'admin-alertes': renderAdminAlertes(content); break;\n", u'C \u00b7 switch')


# ── D) Vista ───────────────────────────────────────────────────────
D_ANCLA = u"function renderAdminEducacio(el){\n"

D = r"""/* ════════════════════════════════════════════════════════════════════════════
   ALERTES DE MERCAT · vista d'administració
   ────────────────────────────────────────────────────────────────────────────
   L'enviament és automàtic: aquesta pantalla no aprova res, supervisa.
   · estat de cada benchmark i drawdown en curs
   · historial d'enviaments amb comptadors
   · editor de plantilles (el text que s'envia sol)
   · frens: pausa global, sostre mensual, anti-ràfega
   ════════════════════════════════════════════════════════════════════════════ */

var _AL_DADES = null;

function _alEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function _alData(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('ca-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}
function _alDataHora(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('ca-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
var _AL_TH = 'font-family:var(--fm);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;'
  + 'color:var(--g400);text-align:left;padding:10px 12px;border-bottom:1px solid var(--g200);background:var(--g50)';
var _AL_TD = 'padding:10px 12px;border-bottom:1px solid var(--g100);font-size:12.5px';
var _AL_CARD = 'background:#fff;border:1px solid var(--g200);border-radius:12px';

function renderAdminAlertes(el) {
  el.innerHTML = '<div style="max-width:1080px">'
    + '<div id="al-cos"><div style="color:var(--g400);font-size:13px;padding:24px">Carregant estat dels mercats\u2026</div></div>'
    + '</div>';
  if (!sb) {
    document.getElementById('al-cos').innerHTML =
      '<div style="font-size:12.5px;color:var(--g500);background:var(--g50);border-radius:10px;padding:16px">Supabase no disponible en aquest mode.</div>';
    return;
  }
  _alCarregar();
}

async function _alCarregar() {
  var cos = document.getElementById('al-cos');
  try {
    var r = await Promise.all([
      sb.from('v_benchmark_drawdown').select('*'),
      sb.from('v_alertes_resum').select('*').limit(25),
      sb.from('alertes_config').select('*').eq('id', 1).maybeSingle(),
      sb.from('alertes_plantilles').select('*').order('familia', { ascending: true }).order('llindar', { ascending: true })
    ]);
    for (var i = 0; i < r.length; i++) {
      if (r[i].error) throw new Error(r[i].error.message);
    }
    _AL_DADES = {
      benchmarks: r[0].data || [],
      alertes:    r[1].data || [],
      config:     r[2].data || { pausa_global:false, max_mes_per_client:2, min_exposicio_eur:500, min_exposicio_pct:0.05, hores_entre_alertes:20 },
      plantilles: r[3].data || []
    };
    if (cos) cos.innerHTML = _alHtml(_AL_DADES);
  } catch (e) {
    if (cos) cos.innerHTML = '<div style="font-size:12.5px;color:#8B1A1A;background:#FBEDED;border:1px solid #E8C4C4;border-radius:10px;padding:16px;line-height:1.6">'
      + 'No s\u2019han pogut carregar les dades: ' + _alEsc(e.message) + '<br>'
      + '<span style="color:var(--g500)">Si la migraci\u00f3 encara no s\u2019ha aplicat, \u00e9s normal.</span></div>';
  }
}

function _alHtml(d) {
  var cfg = d.config;
  var ambError = d.benchmarks.filter(function(b){ return !!b.ultim_error; }).length;
  var enCaiguda = d.benchmarks.filter(function(b){ return (b.llindar_actiu||0) > 0; }).length;
  var mesActual = new Date(); mesActual.setDate(1); mesActual.setHours(0,0,0,0);
  var alertesMes = d.alertes.filter(function(a){
    return a.enviada_at && new Date(a.enviada_at) >= mesActual;
  }).length;

  var h = '';

  // ── Barra d'estat i accions ──
  h += '<div style="' + _AL_CARD + ';padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
    + '<label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:12.5px;color:var(--g600)">'
      + '<input type="checkbox" id="al-pausa"' + (cfg.pausa_global ? ' checked' : '') + ' onchange="_alGuardarConfig()" style="width:17px;height:17px;accent-color:#8B1A1A;cursor:pointer">'
      + '<strong style="color:' + (cfg.pausa_global ? '#8B1A1A' : 'var(--g600)') + '">Pausa global</strong>'
      + '<span style="color:var(--g400)">cap alerta s\u2019envia</span>'
    + '</label>'
    + '<div style="flex:1"></div>'
    + '<button onclick="_alAccio(\'verificar\')" style="padding:8px 15px;background:#fff;border:1px solid var(--g200);border-radius:8px;font-size:11.5px;cursor:pointer;font-family:var(--fb);color:var(--g600)">Verificar tickers</button>'
    + '<button onclick="_alAccio(\'detectar\')" style="padding:8px 15px;background:#1B3A6B;color:#fff;border:none;border-radius:8px;font-size:11.5px;cursor:pointer;font-family:var(--fb)">Executar detecci\u00f3 ara</button>'
    + '</div>';

  if (cfg.pausa_global) {
    h += '<div style="background:#FBEDED;border:1px solid #E8C4C4;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#8B1A1A;line-height:1.6">'
      + 'Amb la pausa activada la detecci\u00f3 segueix funcionant i les alertes es registren com a <strong>bloquejades</strong>, per\u00f2 no s\u2019envia res a ning\u00fa.</div>';
  }

  // ── KPIs ──
  function kpi(v, lbl, col) {
    return '<div style="' + _AL_CARD + ';padding:15px 18px">'
      + '<div style="font-family:var(--fd);font-size:25px;font-weight:600' + (col ? ';color:' + col : '') + '">' + v + '</div>'
      + '<div style="font-size:11px;color:var(--g400);margin-top:3px">' + lbl + '</div></div>';
  }
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px">'
    + kpi(d.benchmarks.length - ambError + '<span style="font-size:14px;color:var(--g400)">/' + d.benchmarks.length + '</span>', '\u00cdndexs amb dades', ambError ? '#9A7B2F' : null)
    + kpi(enCaiguda, 'En episodi de caiguda', enCaiguda ? '#8B1A1A' : null)
    + kpi(alertesMes, 'Alertes enviades aquest mes')
    + kpi(cfg.max_mes_per_client, 'Sostre mensual per client')
    + '</div>';

  // ── Estat dels benchmarks ──
  h += '<div style="font-family:var(--fd);font-size:17px;font-weight:500;margin:0 0 10px">Estat dels \u00edndexs</div>';
  h += '<div style="overflow-x:auto;margin-bottom:26px"><table style="width:100%;border-collapse:collapse;' + _AL_CARD + ';overflow:hidden">'
    + '<thead><tr>'
    + '<th style="' + _AL_TH + '">\u00cdndex</th>'
    + '<th style="' + _AL_TH + '">Ticker</th>'
    + '<th style="' + _AL_TH + ';text-align:right">Des del pic</th>'
    + '<th style="' + _AL_TH + '">Recorregut</th>'
    + '<th style="' + _AL_TH + ';text-align:right">Llindar actiu</th>'
    + '<th style="' + _AL_TH + '">Dades de</th>'
    + '</tr></thead><tbody>';

  if (!d.benchmarks.length) {
    h += '<tr><td colspan="6" style="' + _AL_TD + ';color:var(--g500)">Cap benchmark configurat. Aplica la migraci\u00f3.</td></tr>';
  }
  d.benchmarks.forEach(function(b) {
    var dd = b.drawdown_pct == null ? null : parseFloat(b.drawdown_pct);
    var col = dd == null ? 'var(--g400)' : (dd <= -20 ? '#8B1A1A' : dd <= -10 ? '#9A7B2F' : dd <= -5 ? 'var(--g600)' : '#1A5C3A');
    var ample = dd == null ? 0 : Math.min(100, Math.abs(dd) * 2.5);
    h += '<tr>'
      + '<td style="' + _AL_TD + '"><strong>' + _alEsc(b.nom) + '</strong>'
        + (b.ultim_error ? '<div style="font-size:10.5px;color:#8B1A1A;margin-top:3px;line-height:1.5">' + _alEsc(b.ultim_error) + '</div>' : '')
        + '</td>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);font-size:11.5px;color:var(--g500)">' + _alEsc(b.ticker) + '</td>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);text-align:right;font-weight:600;color:' + col + '">'
        + (dd == null ? '\u2014' : (dd > 0 ? '+' : '') + dd.toFixed(1).replace('.', ',') + '%') + '</td>'
      + '<td style="' + _AL_TD + ';min-width:120px"><div style="height:6px;background:var(--g100);border-radius:99px;overflow:hidden">'
        + '<div style="height:100%;width:' + ample + '%;background:' + col + ';border-radius:99px"></div></div></td>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);text-align:right">'
        + ((b.llindar_actiu||0) > 0 ? '<span style="background:#FBEDED;color:#8B1A1A;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600">\u2212' + b.llindar_actiu + '%</span>' : '<span style="color:var(--g300)">\u2014</span>')
        + '</td>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);font-size:11px;color:var(--g500)">' + _alData(b.ultim_data) + '</td>'
      + '</tr>';
  });
  h += '</tbody></table></div>';

  // ── Historial d'alertes ──
  h += '<div style="font-family:var(--fd);font-size:17px;font-weight:500;margin:0 0 10px">Alertes recents</div>';
  h += '<div style="overflow-x:auto;margin-bottom:26px"><table style="width:100%;border-collapse:collapse;' + _AL_CARD + ';overflow:hidden">'
    + '<thead><tr>'
    + '<th style="' + _AL_TH + '">Quan</th>'
    + '<th style="' + _AL_TH + '">\u00cdndex</th>'
    + '<th style="' + _AL_TH + ';text-align:right">Llindar</th>'
    + '<th style="' + _AL_TH + '">Estat</th>'
    + '<th style="' + _AL_TH + ';text-align:right">Correus</th>'
    + '<th style="' + _AL_TH + ';text-align:right">Push</th>'
    + '<th style="' + _AL_TH + ';text-align:right">Omesos</th>'
    + '</tr></thead><tbody>';

  if (!d.alertes.length) {
    h += '<tr><td colspan="7" style="' + _AL_TD + ';color:var(--g500);line-height:1.7">Cap alerta encara. \u00c9s el que hauria de passar la major part del temps.</td></tr>';
  }
  d.alertes.forEach(function(a) {
    var badge = { enviada:['#1A5C3A','#E8F3ED','Enviada'], bloquejada:['#8B1A1A','#FBEDED','Bloquejada'],
                  pendent:['#9A7B2F','#FEF5E7','Pendent'], descartada:['var(--g500)','var(--g100)','Descartada'] }[a.estat]
                || ['var(--g500)','var(--g100)', a.estat];
    h += '<tr>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);font-size:11px;color:var(--g500)">' + _alDataHora(a.enviada_at || a.creada_at) + '</td>'
      + '<td style="' + _AL_TD + '">' + _alEsc(a.benchmark)
        + (a.titol ? '<div style="font-size:11px;color:var(--g500);margin-top:2px">' + _alEsc(a.titol) + '</div>' : '')
        + '</td>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);text-align:right;font-weight:600;color:#8B1A1A">\u2212' + a.llindar + '%</td>'
      + '<td style="' + _AL_TD + '"><span style="background:' + badge[1] + ';color:' + badge[0] + ';padding:3px 10px;border-radius:99px;font-size:10.5px;font-weight:600">' + badge[2] + '</span>'
        + (a.bloqueig_motiu ? '<div style="font-size:10.5px;color:var(--g500);margin-top:3px;line-height:1.5">' + _alEsc(a.bloqueig_motiu) + '</div>' : '')
        + '</td>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);text-align:right">' + (a.emails_ok || 0)
        + (a.errors ? ' <span style="color:#8B1A1A">(' + a.errors + ' err)</span>' : '') + '</td>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);text-align:right">' + (a.push_ok || 0) + '</td>'
      + '<td style="' + _AL_TD + ';font-family:var(--fm);text-align:right;color:var(--g400)">' + (a.omesos || 0) + '</td>'
      + '</tr>';
  });
  h += '</tbody></table></div>';

  // ── Plantilles ──
  var FAM = { rv:'Renda variable', rf:'Renda fixa', or:'Or i metalls', crypto:'Actius digitals' };
  h += '<details style="' + _AL_CARD + ';margin-bottom:16px">'
    + '<summary style="cursor:pointer;padding:16px 20px;font-family:var(--fd);font-size:17px;font-weight:500;list-style:none;display:flex;justify-content:space-between;align-items:center">'
      + '<span>Plantilles de missatge <span style="font-family:var(--fb);font-size:12px;color:var(--g400);font-weight:400">\u00b7 ' + d.plantilles.length + ' escrites</span></span>'
      + '<span style="color:var(--g400);font-size:13px">\u25be</span></summary>'
    + '<div style="padding:0 20px 20px">'
    + '<div style="font-size:12px;color:var(--g500);line-height:1.7;margin-bottom:16px;max-width:620px">'
      + 'Aquest \u00e9s el text que s\u2019envia sol. <code style="background:var(--g100);padding:1px 5px;border-radius:3px;font-size:11px">{benchmark}</code> i '
      + '<code style="background:var(--g100);padding:1px 5px;border-radius:3px;font-size:11px">{dd}</code> se substitueixen en enviar. '
      + 'Les prioritats i el \u201cqu\u00e8 no fer\u201d van una per l\u00ednia.'
    + '</div>';

  var famActual = null;
  d.plantilles.forEach(function(p, idx) {
    if (p.familia !== famActual) {
      famActual = p.familia;
      h += '<div style="font-family:var(--fm);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--g400);margin:18px 0 8px">'
        + _alEsc(FAM[p.familia] || p.familia) + '</div>';
    }
    var pid = 'al-pl-' + idx;
    var ta = 'width:100%;border:1px solid var(--g200);border-radius:7px;padding:8px 10px;font-family:var(--fb);font-size:12px;line-height:1.6;resize:vertical;background:#fff;color:var(--black)';
    h += '<div style="border:1px solid var(--g200);border-radius:10px;padding:14px 16px;margin-bottom:10px" data-fam="' + _alEsc(p.familia) + '" data-lli="' + p.llindar + '">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
        + '<span style="font-family:var(--fm);font-size:13px;font-weight:600;color:#8B1A1A">\u2212' + p.llindar + '%</span>'
        + '<input id="' + pid + '-et" value="' + _alEsc(p.etiqueta) + '" style="font-family:var(--fm);font-size:11px;border:1px solid var(--g200);border-radius:6px;padding:4px 8px;width:190px">'
        + '<div style="flex:1"></div>'
        + '<button onclick="_alGuardarPlantilla(' + idx + ')" style="padding:6px 14px;background:#1B3A6B;color:#fff;border:none;border-radius:7px;font-size:11px;cursor:pointer;font-family:var(--fb)">Desar</button>'
      + '</div>'
      + '<input id="' + pid + '-ti" value="' + _alEsc(p.titol) + '" placeholder="T\u00edtol" style="' + ta + ';margin-bottom:7px;font-weight:600">'
      + '<textarea id="' + pid + '-cx" rows="2" placeholder="Context hist\u00f2ric" style="' + ta + ';margin-bottom:7px">' + _alEsc(p.context) + '</textarea>'
      + '<textarea id="' + pid + '-pr" rows="3" placeholder="Prioritats \u2014 una per l\u00ednia" style="' + ta + ';margin-bottom:7px">' + _alEsc((p.prioritats || []).join('\n')) + '</textarea>'
      + '<textarea id="' + pid + '-nf" rows="1" placeholder="Qu\u00e8 no fer \u2014 un per l\u00ednia" style="' + ta + '">' + _alEsc((p.no_fer || []).join('\n')) + '</textarea>'
      + '</div>';
  });
  h += '</div></details>';

  // ── Frens ──
  function num(id, val, lbl, ajuda) {
    return '<div>'
      + '<label style="font-family:var(--fm);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--g400);display:block;margin-bottom:6px">' + lbl + '</label>'
      + '<input id="' + id + '" type="number" min="0" step="any" value="' + val + '" onchange="_alGuardarConfig()" '
      + 'style="width:100%;font-family:var(--fm);font-size:14px;font-weight:600;color:#1B3A6B;border:1.5px solid var(--g200);border-radius:8px;padding:8px 10px">'
      + '<div style="font-size:10.5px;color:var(--g500);line-height:1.55;margin-top:6px">' + ajuda + '</div></div>';
  }
  h += '<details style="' + _AL_CARD + '">'
    + '<summary style="cursor:pointer;padding:16px 20px;font-family:var(--fd);font-size:17px;font-weight:500;list-style:none;display:flex;justify-content:space-between;align-items:center">'
      + '<span>Frens</span><span style="color:var(--g400);font-size:13px">\u25be</span></summary>'
    + '<div style="padding:0 20px 20px">'
    + '<div style="font-size:12px;color:var(--g500);line-height:1.7;margin-bottom:18px;max-width:620px">'
      + 'No hi ha revisi\u00f3 humana per alerta: aquests l\u00edmits s\u00f3n l\u2019\u00fanic fre. Una setmana nerviosa pot creuar tres llindars en cinc dies.'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px">'
    + num('al-max', cfg.max_mes_per_client, 'M\u00e0x. per client i mes', 'Ning\u00fa rep m\u00e9s correus d\u2019aquests en un mes natural.')
    + num('al-hores', cfg.hores_entre_alertes, 'Hores entre alertes', 'Si dos \u00edndexs creuen llindar el mateix dia, nom\u00e9s surt el primer.')
    + num('al-eur', cfg.min_exposicio_eur, 'Exposici\u00f3 m\u00ednima (\u20ac)', 'Per sota d\u2019aquest import el client no rep l\u2019av\u00eds.')
    + num('al-pct', cfg.min_exposicio_pct, 'Pes m\u00ednim (0\u20131)', '0,05 = la fam\u00edlia ha de pesar almenys un 5% de la seva cartera.')
    + '</div></div></details>';

  return h;
}

// ── Desar configuració ─────────────────────────────────────────────
async function _alGuardarConfig() {
  function v(id, def) {
    var e = document.getElementById(id);
    if (!e) return def;
    var n = parseFloat(e.value);
    return isNaN(n) ? def : n;
  }
  var pausaEl = document.getElementById('al-pausa');
  var payload = {
    pausa_global:        pausaEl ? pausaEl.checked : false,
    max_mes_per_client:  Math.max(0, Math.round(v('al-max', 2))),
    hores_entre_alertes: Math.max(0, Math.round(v('al-hores', 20))),
    min_exposicio_eur:   Math.max(0, v('al-eur', 500)),
    min_exposicio_pct:   Math.min(1, Math.max(0, v('al-pct', 0.05)))
  };
  try {
    var res = await sb.from('alertes_config').update(payload).eq('id', 1).select('id');
    if (res.error) throw res.error;
    if (!res.data || !res.data.length) throw new Error('cap fila actualitzada (RLS o sessi\u00f3 caducada)');
    toast('\u2713 Configuraci\u00f3 desada');
    if (_AL_DADES) {
      _AL_DADES.config = Object.assign({}, _AL_DADES.config, payload);
    }
  } catch (e) {
    toast('Error desant: ' + (e.message || 'desconegut'));
  }
}

// ── Desar una plantilla ────────────────────────────────────────────
async function _alGuardarPlantilla(idx) {
  if (!_AL_DADES) return;
  var p = _AL_DADES.plantilles[idx];
  if (!p) return;
  var pid = 'al-pl-' + idx;
  function val(sufix) {
    var e = document.getElementById(pid + sufix);
    return e ? e.value : '';
  }
  function llista(sufix) {
    return val(sufix).split('\n').map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
  }
  var payload = {
    etiqueta: val('-et').trim(),
    titol:    val('-ti').trim(),
    context:  val('-cx').trim(),
    prioritats: llista('-pr'),
    no_fer:     llista('-nf'),
    actualitzat_at: new Date().toISOString()
  };
  if (!payload.titol || !payload.context) { toast('El t\u00edtol i el context no poden quedar buits'); return; }
  try {
    var res = await sb.from('alertes_plantilles').update(payload)
      .eq('familia', p.familia).eq('llindar', p.llindar).select('familia');
    if (res.error) throw res.error;
    if (!res.data || !res.data.length) throw new Error('cap fila actualitzada (RLS o sessi\u00f3 caducada)');
    Object.assign(p, payload);
    toast('\u2713 Plantilla desada');
  } catch (e) {
    toast('Error desant: ' + (e.message || 'desconegut'));
  }
}

// ── Invocar la funció de detecció ──────────────────────────────────
async function _alAccio(accio) {
  var cos = document.getElementById('al-cos');
  if (cos) cos.innerHTML = '<div style="color:var(--g400);font-size:13px;padding:24px">'
    + (accio === 'verificar' ? 'Comprovant que cada ticker respon\u2026' : 'Baixant preus i comprovant llindars\u2026')
    + '<br><span style="font-size:11.5px">Pot trigar mig minut.</span></div>';
  try {
    var res = await sb.functions.invoke('alertes-mercat-detectar', { body: { accio: accio } });
    if (res.error) throw res.error;
    var b = (res.data && res.data.benchmarks) || [];
    var ko = b.filter(function(x){ return x.ok === false; });
    if (accio === 'verificar') {
      toast(ko.length ? (ko.length + ' ticker(s) no responen \u2014 mira la columna d\u2019error')
                      : '\u2713 Els ' + b.length + ' tickers responen');
    } else {
      var n = (res.data && res.data.alertes_noves && res.data.alertes_noves.length) || 0;
      toast(n ? (n + ' alerta(es) generada(es) i enviada(es)') : '\u2713 Cap llindar creuat');
    }
  } catch (e) {
    toast('Error: ' + (e.message || 'desconegut'));
  }
  _alCarregar();
}

"""

patch(D_ANCLA, D + D_ANCLA, u'D \u00b7 vista renderAdminAlertes')

io.open(PATH, 'w', encoding='utf-8').write(src)
print(u'\n  %d \u2192 %d car\u00e0cters (+%d)' % (orig, len(src), len(src) - orig))
