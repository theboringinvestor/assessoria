// ════════════════════════════════════════════════════════════════════════════
// MÒDUL D'HIPOTECA I DEUTE (portal-hipoteca)
// Motor de càlcul a tbi-hipoteca.js (TBI_HIPOTECA). Aquí només hi ha la capa
// de dades (columna JSONB `hipoteques`) i el render.
//
// REGULATORI: simulació i anàlisi comparativa. No és intermediació de crèdit
// immobiliari (Llei 5/2019) ni recomanació de producte. Cap nom d'entitat.
// ════════════════════════════════════════════════════════════════════════════

function getHipoteques() {
  var c = getClient();
  if (!c) return [];
  return Array.isArray(c.hipoteques) ? c.hipoteques : [];
}

function hipotecaPerId(id) {
  var hs = getHipoteques();
  for (var i = 0; i < hs.length; i++) if (hs[i].id === id) return hs[i];
  return hs[0] || null;
}

// Converteix el registre desat en la configuració que espera el motor
function cfgDeHipoteca(h) {
  if (!h) return null;
  var cfg = {
    capital: parseFloat(h.capital) || 0,
    anys: parseFloat(h.anys) || 0,
    modalitat: h.modalitat || 'fix',
    revisio_mesos: parseFloat(h.revisio_mesos) || 12
  };
  if (cfg.modalitat === 'fix' || cfg.modalitat === 'mixt') cfg.tipus_fix = parseFloat(h.tipus_fix) || 0;
  if (cfg.modalitat === 'variable' || cfg.modalitat === 'mixt') cfg.diferencial = parseFloat(h.diferencial) || 0;
  if (cfg.modalitat === 'mixt') cfg.anys_fix = parseFloat(h.anys_fix) || 5;
  if (h.sol_min != null && h.sol_min !== '') cfg.sol_min = parseFloat(h.sol_min);
  if (h.sostre_max != null && h.sostre_max !== '') cfg.sostre_max = parseFloat(h.sostre_max);
  if (h.comissio_amort_pct != null && h.comissio_amort_pct !== '') cfg.comissio_amort_pct = parseFloat(h.comissio_amort_pct);
  if (h.comissio_opcio) cfg.comissio_opcio = h.comissio_opcio;
  return cfg;
}

function escenariDe(h) {
  if (!h || h.modalitat === 'fix') return 0;
  var e = parseFloat(h.euribor_previst);
  return isFinite(e) ? e : TBI_HIPOTECA.REF.euribor_12m;
}

function amortitzacionsDe(h) {
  return (h && Array.isArray(h.amortitzacions)) ? h.amortitzacions : [];
}

async function desarHipoteques(arr) {
  if (APP.clientData) APP.clientData.hipoteques = arr;
  if (APP.isDemo) { toast('Mode demo: els canvis no es desen'); return true; }
  try {
    if (sb && APP.user && APP.user.email) {
      var res = await sb.from('clients').update({ hipoteques: arr }).eq('email', getClientEmail()).select();
      if (!res.data || res.data.length === 0) { toast('No s’ha pogut desar (permisos)'); return false; }
    }
    return true;
  } catch (e) { toast('Error: ' + (e.message || e)); return false; }
}

// ── Format ──
function _hEur(x) { return Math.round(x).toLocaleString('ca-ES') + '€'; }
function _hEur2(x) { return (Math.round(x * 100) / 100).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'; }
function _hPct(x) { return (Math.round(x * 100) / 100).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
function _hMesos(m) {
  var a = Math.floor(m / 12), r = m % 12;
  var s = (a > 0 ? a + ' any' + (a > 1 ? 's' : '') : '') + (a > 0 && r > 0 ? ' i ' : '') + (r > 0 ? r + ' mes' + (r > 1 ? 'os' : '') : '');
  return s || '0 mesos';
}
function _hKpi(l, v, s, destacat) {
  return '<div style="flex:1;min-width:145px;padding:15px 17px;border-radius:11px;background:' + (destacat ? 'var(--black)' : 'var(--g50)') + '">'
    + '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:' + (destacat ? 'rgba(255,255,255,.55)' : 'var(--g400)') + ';margin-bottom:4px">' + l + '</div>'
    + '<div style="font-family:var(--fm);font-size:21px;font-weight:600;letter-spacing:-.5px;color:' + (destacat ? '#C8A54A' : 'var(--black)') + '">' + v + '</div>'
    + (s ? '<div style="font-size:10px;color:' + (destacat ? 'rgba(255,255,255,.5)' : 'var(--g400)') + ';margin-top:2px">' + s + '</div>' : '')
    + '</div>';
}

// Paràmetres d'inversió del client: el TER real de la seva cartera i el retorn
// esperat del seu arquetip. Això és el que fa que la comparativa sigui SEVA
// i no un exemple genèric de calculadora.
function paramsInversioClient() {
  var ter = 0.25, terFont = 'valor per defecte';
  try {
    var t = calcTERCartera();
    if (t && t.ter_real > 0) { ter = t.ter_real; terFont = 'TER real de la teva cartera'; }
  } catch (e) {}
  var retorn = 6, retFont = 'valor per defecte';
  try {
    var c = getClient();
    var arq = getArquetip(c && c.arquetipId ? c.arquetipId : 'navegant');
    if (arq && arq.retorn) {
      var nums = String(arq.retorn).match(/[\d,.]+/g);
      if (nums && nums.length) {
        var vals = nums.map(function (x) { return parseFloat(x.replace(',', '.')); }).filter(isFinite);
        if (vals.length) {
          retorn = vals.reduce(function (s, v) { return s + v; }, 0) / vals.length;
          retFont = 'punt mitjà del teu arquetip ' + arq.nom + ' (' + arq.retorn + ')';
        }
      }
    }
  } catch (e) {}
  return { ter: ter, ter_font: terFont, retorn: retorn, retorn_font: retFont };
}

// ── Modal d'alta/edició ──
function obrirModalHipoteca(id) {
  var h = id ? hipotecaPerId(id) : null;
  var modal = document.createElement('div');
  modal.id = 'modal-hipoteca';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
  var inner = document.createElement('div');
  inner.style.cssText = 'background:#fff;border-radius:14px;max-width:560px;width:100%;padding:28px 32px;max-height:92vh;overflow-y:auto';

  function lbl(t, opt) {
    return '<label style="font-size:11px;font-weight:500;color:var(--g500);display:block;margin-bottom:4px">' + t
      + (opt ? ' <span style="color:var(--g400);font-weight:400">(opcional)</span>' : '') + '</label>';
  }
  function inp(idc, type, ph, val) {
    return '<input id="' + idc + '" type="' + type + '" placeholder="' + ph + '" value="' + (val != null && val !== '' ? val : '') + '"'
      + ' style="width:100%;padding:9px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:13px;font-family:'
      + (type === 'number' ? 'var(--fm);text-align:right' : 'var(--fb)') + '">';
  }
  function sel(idc, opts, val) {
    return '<select id="' + idc + '" style="width:100%;padding:9px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:13px;font-family:var(--fb)">'
      + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(val) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
      + '</select>';
  }

  inner.innerHTML = '<div style="font-family:var(--fd);font-size:22px;font-weight:400;margin-bottom:6px">' + (h ? 'Editar hipoteca' : '+ Nova hipoteca') + '</div>'
    + '<div style="font-size:12px;color:var(--g500);margin-bottom:20px;line-height:1.6">Posa les dades tal com surten a la teva escriptura o al darrer rebut. Si dubtes d’alguna, deixa-la buida.</div>'

    + '<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--g400);margin-bottom:10px">Bàsics</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">'
      + '<div>' + lbl('Nom o referència') + inp('hip-nom', 'text', 'Ex: Habitatge habitual', h ? h.nom : '') + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div>' + lbl('Capital pendent (€)') + inp('hip-capital', 'number', '150000', h ? h.capital : '') + '</div>'
        + '<div>' + lbl('Anys que queden') + inp('hip-anys', 'number', '30', h ? h.anys : '') + '</div>'
      + '</div>'
      + '<div>' + lbl('Modalitat') + sel('hip-modalitat', [['fix', 'Tipus fix'], ['variable', 'Tipus variable'], ['mixt', 'Tipus mixt']], h ? h.modalitat : 'fix') + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div>' + lbl('Tipus fix (%)') + inp('hip-tipus', 'number', '3.00', h ? h.tipus_fix : '') + '</div>'
        + '<div>' + lbl('Diferencial (%)', true) + inp('hip-dif', 'number', '0.75', h ? h.diferencial : '') + '</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div>' + lbl('Anys a tipus fix (mixt)', true) + inp('hip-anysfix', 'number', '5', h ? h.anys_fix : '') + '</div>'
        + '<div>' + lbl('Euríbor previst (%)', true) + inp('hip-euribor', 'number', String(TBI_HIPOTECA.REF.euribor_12m), h ? h.euribor_previst : '') + '</div>'
      + '</div>'
    + '</div>'

    + '<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--g400);margin-bottom:10px">Condicions i context</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div>' + lbl('Comissió amortització (%)', true) + inp('hip-comissio', 'number', 'màxim legal', h ? h.comissio_amort_pct : '') + '</div>'
        + '<div>' + lbl('Assegurances vinculades (€/any)', true) + inp('hip-segurs', 'number', '0', h ? h.segurs_anuals : '') + '</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div>' + lbl('Valor de l’habitatge (€)', true) + inp('hip-preu', 'number', '250000', h ? h.preu_habitatge : '') + '</div>'
        + '<div>' + lbl('Comprat abans de 2013?') + sel('hip-ded', [['no', 'No'], ['si', 'Sí, i em dedueixo']], h && h.deduccio_pre2013 ? 'si' : 'no') + '</div>'
      + '</div>'
    + '</div>'
    + '<div style="padding:11px 14px;background:var(--g50);border-radius:9px;font-size:11px;color:var(--g500);line-height:1.6;margin-bottom:20px">'
      + 'La deducció per habitatge habitual només s’aplica a habitatges adquirits abans de l’1/1/2013 amb dret consolidat. Si la marques, els càlculs la tenen en compte.'
    + '</div>'

    + '<div style="display:flex;gap:10px;justify-content:flex-end">'
      + (h ? '<button onclick="eliminarHipoteca(\'' + h.id + '\')" style="padding:10px 16px;background:transparent;color:#C0392B;border:1.5px solid #E8B4B4;border-radius:8px;font-size:13px;cursor:pointer;font-family:var(--fb);margin-right:auto">Eliminar</button>' : '')
      + '<button onclick="tancarModalHipoteca()" style="padding:10px 18px;background:transparent;color:var(--g500);border:1.5px solid var(--g200);border-radius:8px;font-size:13px;cursor:pointer;font-family:var(--fb)">Cancel·lar</button>'
      + '<button onclick="guardarHipotecaModal(' + (h ? '\'' + h.id + '\'' : 'null') + ')" style="padding:10px 22px;background:var(--black);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--fb)">Desar</button>'
    + '</div>';

  modal.appendChild(inner);
  modal.addEventListener('click', function (e) { if (e.target === modal) tancarModalHipoteca(); });
  document.body.appendChild(modal);
}

function tancarModalHipoteca() {
  var m = document.getElementById('modal-hipoteca');
  if (m) m.remove();
}

async function guardarHipotecaModal(id) {
  function v(idc) { var e = document.getElementById(idc); return e ? e.value : ''; }
  var capital = parseFloat(v('hip-capital')) || 0;
  var anys = parseFloat(v('hip-anys')) || 0;
  if (capital <= 0) { toast('Indica el capital pendent'); return; }
  if (anys <= 0) { toast('Indica els anys que queden'); return; }

  var hs = getHipoteques().slice();
  var idx = -1;
  for (var i = 0; i < hs.length; i++) if (hs[i].id === id) idx = i;

  var reg = {
    id: (idx >= 0 ? hs[idx].id : novaIdLocal('hip')),
    nom: v('hip-nom') || 'Hipoteca',
    capital: capital,
    anys: anys,
    modalitat: v('hip-modalitat') || 'fix',
    tipus_fix: parseFloat(v('hip-tipus')) || 0,
    diferencial: parseFloat(v('hip-dif')) || 0,
    anys_fix: parseFloat(v('hip-anysfix')) || 5,
    euribor_previst: v('hip-euribor') === '' ? null : parseFloat(v('hip-euribor')),
    comissio_amort_pct: v('hip-comissio') === '' ? null : parseFloat(v('hip-comissio')),
    segurs_anuals: parseFloat(v('hip-segurs')) || 0,
    preu_habitatge: parseFloat(v('hip-preu')) || 0,
    deduccio_pre2013: v('hip-ded') === 'si',
    amortitzacions: (idx >= 0 && Array.isArray(hs[idx].amortitzacions)) ? hs[idx].amortitzacions : [],
    creat_el: (idx >= 0 ? hs[idx].creat_el : new Date().toISOString()),
    actualitzat_el: new Date().toISOString()
  };
  if (idx >= 0) hs[idx] = reg; else hs.push(reg);

  var ok = await desarHipoteques(hs);
  if (ok) {
    window._hipSel = reg.id;
    tancarModalHipoteca();
    toast('✓ Hipoteca desada');
    renderView('portal-hipoteca');
  }
}

async function eliminarHipoteca(id) {
  if (!confirm('Segur que vols eliminar aquesta hipoteca? Es perdran també les amortitzacions registrades.')) return;
  var hs = getHipoteques().filter(function (h) { return h.id !== id; });
  var ok = await desarHipoteques(hs);
  if (ok) {
    window._hipSel = hs.length ? hs[0].id : null;
    tancarModalHipoteca();
    toast('Hipoteca eliminada');
    renderView('portal-hipoteca');
  }
}

async function registrarAmortitzacio(id) {
  function v(idc) { var e = document.getElementById(idc); return e ? e.value : ''; }
  var imp = parseFloat(v('am-import')) || 0;
  if (imp <= 0) { toast('Indica un import'); return; }
  var hs = getHipoteques().slice();
  for (var i = 0; i < hs.length; i++) {
    if (hs[i].id !== id) continue;
    if (!Array.isArray(hs[i].amortitzacions)) hs[i].amortitzacions = [];
    hs[i].amortitzacions.push({
      id: novaIdLocal('am'),
      mes: Math.max(1, Math.round(parseFloat(v('am-mes')) || 1)),
      import: imp,
      mode: v('am-mode') || 'termini',
      data: new Date().toISOString().slice(0, 10)
    });
    hs[i].actualitzat_el = new Date().toISOString();
  }
  if (await desarHipoteques(hs)) { toast('✓ Amortització registrada'); renderView('portal-hipoteca'); }
}

async function esborrarAmortitzacio(idHip, idAm) {
  var hs = getHipoteques().slice();
  for (var i = 0; i < hs.length; i++) {
    if (hs[i].id !== idHip) continue;
    hs[i].amortitzacions = amortitzacionsDe(hs[i]).filter(function (a) { return a.id !== idAm; });
  }
  if (await desarHipoteques(hs)) { toast('Amortització esborrada'); renderView('portal-hipoteca'); }
}

function canviarHipTab(t) { window._hipTab = t; renderView('portal-hipoteca'); }
function seleccionarHipoteca(id) { window._hipSel = id; renderView('portal-hipoteca'); }

// ── Gràfic anual capital vs interessos ──
function _hGrafic(files) {
  var anys = TBI_HIPOTECA.perAnys(files);
  if (!anys.length) return '';
  var maxAny = 0;
  anys.forEach(function (a) { maxAny = Math.max(maxAny, a.interes + a.principal + a.extra); });
  var w = 900, h = 170, pad = 4;
  var bw = (w - pad * (anys.length - 1)) / anys.length;
  var s = '<svg viewBox="0 0 ' + w + ' ' + (h + 24) + '" style="width:100%;height:auto">';
  anys.forEach(function (a, i) {
    var x = i * (bw + pad);
    var hi = maxAny > 0 ? a.interes / maxAny * h : 0;
    var hp = maxAny > 0 ? (a.principal + a.extra) / maxAny * h : 0;
    s += '<rect x="' + x.toFixed(1) + '" y="' + (h - hp - hi).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hi.toFixed(1) + '" fill="#C8A54A" opacity=".85"><title>Any ' + a.any + ': ' + _hEur(a.interes) + ' d’interessos</title></rect>';
    s += '<rect x="' + x.toFixed(1) + '" y="' + (h - hp).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hp.toFixed(1) + '" fill="#16233A"><title>Any ' + a.any + ': ' + _hEur(a.principal + a.extra) + ' de capital</title></rect>';
    if (anys.length <= 34 && (i === 0 || (i + 1) % 5 === 0))
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (h + 17) + '" text-anchor="middle" font-size="11" fill="#8A8780" font-family="var(--fm)">' + a.any + '</text>';
  });
  s += '</svg><div style="display:flex;gap:18px;margin-top:8px;font-size:11px;color:var(--g500)">'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:#16233A;border-radius:2px;margin-right:5px"></span>Capital</span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:#C8A54A;border-radius:2px;margin-right:5px"></span>Interessos</span></div>';
  return s;
}

// ════════════════════════════════════════════════════════════════════════════
function renderPortalHipoteca(el) {
  var hs = getHipoteques();

  // ── Estat buit ──
  if (!hs.length) {
    el.innerHTML = '<div class="content-inner fade-in">'
      + '<div style="max-width:620px;margin:40px auto;text-align:center">'
        + '<div style="font-size:44px;margin-bottom:14px">🏠</div>'
        + '<div style="font-family:var(--fd);font-size:26px;margin-bottom:10px">La teva hipoteca, amb números</div>'
        + '<div style="font-size:14px;color:var(--g500);line-height:1.7;margin-bottom:26px">'
          + 'Afegeix la teva hipoteca i podràs veure el quadre d’amortització complet, quant estalvies amortitzant anticipadament i, sobretot, '
          + 'si et convé més amortitzar o invertir aquests diners — calculat amb el cost real de la teva cartera i el retorn esperat del teu arquetip.'
        + '</div>'
        + '<button onclick="obrirModalHipoteca()" style="padding:13px 28px;background:var(--black);color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:500;cursor:pointer;font-family:var(--fb)">+ Afegir la meva hipoteca</button>'
        + '<div style="margin-top:22px;padding:13px 16px;background:var(--g50);border-radius:9px;font-size:11px;color:var(--g500);line-height:1.6;text-align:left">'
          + 'ⓘ Aquest mòdul fa simulació i anàlisi. No és intermediació de crèdit immobiliari ni recomanació de cap producte o entitat concreta.'
        + '</div>'
      + '</div></div>';
    return;
  }

  var sel = window._hipSel && hipotecaPerId(window._hipSel) ? window._hipSel : hs[0].id;
  var h = hipotecaPerId(sel);
  var tab = window._hipTab || 'sim';
  var cfg = cfgDeHipoteca(h);
  var esc = escenariDe(h);
  var amorts = amortitzacionsDe(h);

  var base = TBI_HIPOTECA.generarQuadre(cfg, { escenari: esc });
  var real = amorts.length ? TBI_HIPOTECA.generarQuadre(cfg, { escenari: esc, amortitzacions: amorts }) : base;

  // Dades incompletes o incoherents (capital o termini a zero): no hi ha res
  // a calcular. Millor demanar-ho que ensenyar zeros o petar.
  if (!base.files.length) {
    el.innerHTML = '<div class="content-inner fade-in">'
      + '<div style="padding:22px 26px;background:#FDF0F0;border:1px solid #E8B4B4;border-radius:12px;max-width:560px">'
        + '<div style="font-size:15px;font-weight:600;color:#8C2F2F;margin-bottom:8px">Falten dades a «' + (h.nom || 'aquesta hipoteca') + '»</div>'
        + '<div style="font-size:13px;color:#8C2F2F;line-height:1.7;margin-bottom:18px">Cal un capital pendent i un termini superiors a zero per poder calcular res.</div>'
        + '<button onclick="obrirModalHipoteca(\'' + sel + '\')" style="padding:10px 20px;background:#8C2F2F;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--fb)">Completar les dades</button>'
      + '</div></div>';
    return;
  }

  var html = '<div class="content-inner fade-in">';

  // ── Selector d'hipoteques ──
  if (hs.length > 1 || true) {
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:18px">';
    hs.forEach(function (x) {
      var on = x.id === sel;
      html += '<button onclick="seleccionarHipoteca(\'' + x.id + '\')" style="padding:8px 15px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;font-family:var(--fb);border:1.5px solid ' + (on ? 'var(--black)' : 'var(--g200)') + ';background:' + (on ? 'var(--black)' : 'transparent') + ';color:' + (on ? '#fff' : 'var(--g500)') + '">'
        + (x.nom || 'Hipoteca') + ' · ' + _hEur(x.capital) + '</button>';
    });
    html += '<button onclick="obrirModalHipoteca()" style="padding:8px 14px;border-radius:8px;font-size:12px;cursor:pointer;font-family:var(--fb);border:1.5px dashed var(--g200);background:transparent;color:var(--g500)">+ Afegir</button>'
      + '<div style="flex:1"></div>'
      + '<button onclick="obrirModalHipoteca(\'' + sel + '\')" style="padding:8px 13px;border-radius:8px;font-size:11px;cursor:pointer;font-family:var(--fb);border:1.5px solid var(--g200);background:transparent;color:var(--g500)">✏️ Editar</button>'
      + '</div>';
  }

  // ── Pestanyes ──
  html += '<div style="display:flex;gap:6px;margin-bottom:22px;background:var(--g50);padding:4px;border-radius:9px;width:fit-content;flex-wrap:wrap">';
  [['sim', '🏠 Resum'], ['amort', '✂️ Amortitzar'], ['vs', '⚖️ Amortitzar o invertir'], ['quadre', '📋 Quadre']].forEach(function (t) {
    var on = tab === t[0];
    html += '<button onclick="canviarHipTab(\'' + t[0] + '\')" style="padding:8px 16px;border-radius:7px;border:none;font-size:12px;font-weight:500;cursor:pointer;font-family:var(--fb);background:' + (on ? 'var(--white)' : 'transparent') + ';color:' + (on ? 'var(--black)' : 'var(--g400)') + ';box-shadow:' + (on ? '0 1px 4px rgba(0,0,0,.1)' : 'none') + '">' + t[1] + '</button>';
  });
  html += '</div>';

  var r = real.resum;
  var tae = TBI_HIPOTECA.calcularTAE(cfg, { escenari: esc, segurs_anuals: h.segurs_anuals || 0 });

  // ══════════ RESUM ══════════
  if (tab === 'sim') {
    html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px">'
      + _hKpi('Quota mensual', _hEur2(r.quota_inicial), (r.quota_maxima - r.quota_minima > 1 ? 'màx. ' + _hEur(r.quota_maxima) : 'constant'), true)
      + _hKpi('Interessos totals', _hEur(r.total_interessos), _hPct(r.total_interessos / cfg.capital * 100) + ' del capital')
      + _hKpi('Total a retornar', _hEur(r.total_pagat), _hMesos(r.mesos))
      + _hKpi('TAE amb despeses', tae ? _hPct(tae.tae) : '—', tae ? _hEur(tae.despeses_inicials) + ' de despeses' : '')
      + '</div>';

    // Ràtios de salut si tenim el valor de l'habitatge
    var ing = 0;
    try { var cc = getClient(); ing = parseFloat(cc && cc.perfil && cc.perfil.ingressosMensuals) || 0; } catch (e) {}
    if (h.preu_habitatge > 0 || ing > 0) {
      var rt = TBI_HIPOTECA.ratiosDeute({
        ingressos_mensuals_nets: ing, quota_mensual: r.quota_inicial,
        altres_quotes: 0, preu_habitatge: h.preu_habitatge, capital: cfg.capital
      });
      var colEstat = function (e) { return e === 'ok' ? '#1A5C3A' : (e === 'atencio' ? '#7A4A00' : '#C0392B'); };
      html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px">';
      if (rt.ltv !== null) html += _hKpi('LTV (finançament / valor)', _hPct(rt.ltv), rt.nota_ltv.slice(0, 60) + '…');
      if (rt.dti !== null) html += _hKpi('Esforç sobre ingressos', _hPct(rt.dti), rt.dti_estat === 'ok' ? 'dins del rang habitual' : 'per sobre del rang habitual');
      html += '</div>';
      if (rt.dti_estat === 'risc') {
        html += '<div style="padding:13px 16px;background:#FDF0F0;border:1px solid #E8B4B4;border-radius:10px;font-size:12px;color:#8C2F2F;margin-bottom:20px;line-height:1.6">'
          + '⚠ La quota supera el 35% dels teus ingressos nets. Abans de plantejar-te ampliar inversió, val la pena revisar l’estructura del deute.</div>';
      }
    }

    html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
      + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">On van els teus diners</div>'
      + _hGrafic(real.files)
      + '<div style="margin-top:14px;padding:12px 15px;background:#FEF5E7;border:1px solid #E8C285;border-radius:9px;font-size:12px;color:#7A4A00;line-height:1.6">'
        + 'De cada euro que pagaràs, <strong>' + _hPct(r.total_interessos / r.total_pagat * 100) + '</strong> són interessos. '
        + 'A la meitat del termini encara deuràs <strong>' + _hPct(real.files[Math.floor(real.files.length / 2)].pendent / cfg.capital * 100) + '</strong> del capital inicial: '
        + 'el sistema francès carrega els interessos al principi, i per això amortitzar aviat val molt més que amortitzar tard.'
      + '</div></div>';

    // Stress d'euríbor per a variable i mixt
    if (h.modalitat !== 'fix') {
      var st = TBI_HIPOTECA.stressEuribor(cfg);
      html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
        + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">I si els tipus es mouen?</div>'
        + '<div style="font-size:12px;color:var(--g500);margin-bottom:16px">Amb tipus variable o mixt, la quota d’avui no és una promesa.</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
        + ['Escenari', 'Euríbor', 'Quota inicial', 'Quota màxima', 'Interessos'].map(function (t, i) {
            return '<th style="text-align:' + (i === 0 ? 'left' : 'right') + ';padding:8px 6px;font-size:10px;color:var(--g400);font-weight:500;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--g100)">' + t + '</th>';
          }).join('')
        + '</tr></thead><tbody>';
      st.forEach(function (e) {
        var meu = Math.abs(e.euribor - esc) < 0.01;
        html += '<tr style="border-bottom:1px solid var(--g50);background:' + (meu ? '#FEF5E7' : 'transparent') + '">'
          + '<td style="padding:9px 6px;font-weight:500">' + e.nom + (meu ? ' <span style="font-size:10px;color:#7A4A00">← el teu</span>' : '') + '</td>'
          + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + _hPct(e.euribor) + '</td>'
          + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + _hEur2(e.quota_inicial) + '</td>'
          + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + _hEur2(e.quota_maxima) + '</td>'
          + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + _hEur(e.total_interessos) + '</td></tr>';
      });
      html += '</tbody></table>'
        + '<div style="margin-top:12px;font-size:11px;color:var(--g500);line-height:1.6">Entre l’escenari més favorable i el més advers hi ha <strong>'
        + _hEur2(st[3].quota_inicial - st[0].quota_inicial) + '</strong> de diferència mensual. La pregunta no és si t’agradaria pagar la columna de la dreta, sinó si podries fer-ho durant un any sencer.</div>'
        + '</div>';
    }
  }

  // ══════════ AMORTITZAR ══════════
  if (tab === 'amort') {
    html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
      + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Simular una amortització</div>'
      + '<div style="font-size:12px;color:var(--g500);margin-bottom:16px">Mira l’impacte abans de decidir. Si finalment la fas, registra-la perquè el quadre quedi al dia.</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end">'
        + '<div><label style="font-size:11px;font-weight:500;color:var(--g500);display:block;margin-bottom:4px">Import (€)</label>'
          + '<input id="am-import" type="number" value="10000" oninput="renderSimAmort(\'' + sel + '\')" style="width:100%;padding:9px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:13px;font-family:var(--fm);text-align:right"></div>'
        + '<div><label style="font-size:11px;font-weight:500;color:var(--g500);display:block;margin-bottom:4px">D’aquí a (mesos)</label>'
          + '<input id="am-mes" type="number" value="1" min="1" oninput="renderSimAmort(\'' + sel + '\')" style="width:100%;padding:9px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:13px;font-family:var(--fm);text-align:right"></div>'
        + '<div><label style="font-size:11px;font-weight:500;color:var(--g500);display:block;margin-bottom:4px">Modalitat</label>'
          + '<select id="am-mode" onchange="renderSimAmort(\'' + sel + '\')" style="width:100%;padding:9px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:13px;font-family:var(--fb)"><option value="termini">Reduir termini</option><option value="quota">Reduir quota</option></select></div>'
        + '<div><button onclick="registrarAmortitzacio(\'' + sel + '\')" style="width:100%;padding:10px 16px;background:var(--black);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;font-family:var(--fb)">Registrar</button></div>'
      + '</div>'
      + '<div id="am-resultat" style="margin-top:18px"></div>'
      + '</div>';

    if (amorts.length) {
      html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
        + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">Amortitzacions registrades</div>';
      amorts.slice().sort(function (a, b) { return a.mes - b.mes; }).forEach(function (a) {
        html += '<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--g50);font-size:13px">'
          + '<div style="flex:1"><strong style="font-family:var(--fm)">' + _hEur(a.import) + '</strong> al mes ' + a.mes
          + ' <span style="color:var(--g400);font-size:11px">· ' + (a.mode === 'termini' ? 'reduint termini' : 'reduint quota') + '</span></div>'
          + '<button onclick="esborrarAmortitzacio(\'' + sel + '\',\'' + a.id + '\')" style="background:none;border:none;color:var(--g400);cursor:pointer;font-size:12px">✕</button></div>';
      });
      html += '<div style="margin-top:14px;padding:12px 15px;background:#EAF3DE;border-radius:9px;font-size:12px;color:#1A5C3A;line-height:1.6">'
        + 'Amb el que ja has amortitzat estalvies <strong>' + _hEur(base.resum.total_interessos - real.resum.total_interessos) + '</strong> d’interessos'
        + (base.files.length > real.files.length ? ' i acabes <strong>' + _hMesos(base.files.length - real.files.length) + '</strong> abans' : '') + '.</div>'
        + '</div>';
    }
  }

  // ══════════ AMORTITZAR VS INVERTIR ══════════
  if (tab === 'vs') {
    var pi = paramsInversioClient();
    var vImport = (window._hipVsImport != null) ? window._hipVsImport : 10000;
    var vs = TBI_HIPOTECA.amortitzarVsInvertir(cfg, {
      import: vImport, mode: 'termini', retorn_brut: pi.retorn, ter: pi.ter,
      deduccio_habitatge: !!h.deduccio_pre2013, escenari: esc
    });

    html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;align-items:end">'
        + '<div><label style="font-size:11px;font-weight:500;color:var(--g500);display:block;margin-bottom:4px">Diners disponibles (€)</label>'
          + '<input id="vs-import" type="number" value="' + vImport + '" oninput="window._hipVsImport=parseFloat(this.value)||0;renderView(\'portal-hipoteca\')" style="width:100%;padding:9px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:13px;font-family:var(--fm);text-align:right"></div>'
        + '<div><div style="font-size:11px;color:var(--g500);margin-bottom:4px">Retorn brut esperat</div><div style="font-family:var(--fm);font-size:17px;font-weight:600">' + _hPct(pi.retorn) + '</div><div style="font-size:10px;color:var(--g400)">' + pi.retorn_font + '</div></div>'
        + '<div><div style="font-size:11px;color:var(--g500);margin-bottom:4px">Cost del producte</div><div style="font-family:var(--fm);font-size:17px;font-weight:600">' + _hPct(pi.ter) + '</div><div style="font-size:10px;color:var(--g400)">' + pi.ter_font + '</div></div>'
      + '</div></div>';

    if (vs) {
      var be = vs.breakeven_pct;
      var guanyaInv = (vs.guanya === 'invertir');
      html += '<div style="background:var(--black);border-radius:14px;padding:28px 30px;margin-bottom:18px;color:#fff">'
        + '<div style="font-family:var(--fm);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#C8A54A;margin-bottom:10px">El número que importa</div>'
        + '<div style="font-size:clamp(22px,3vw,30px);font-weight:600;letter-spacing:-.02em;line-height:1.3;margin-bottom:10px">'
        + (be !== null
            ? 'La teva cartera hauria de fer més d’un <span style="color:#C8A54A">' + _hPct(be) + ' brut anual</span> perquè invertir compensi'
            : 'Amortitzar guanya en qualsevol escenari raonable')
        + '</div>'
        + '<div style="color:rgba(255,255,255,.7);font-size:13px;line-height:1.7;max-width:660px">'
        + (be !== null
            ? 'Un cop descomptats el ' + _hPct(pi.ter) + ' de cost del producte i l’IRPF de la base de l’estalvi. '
              + 'El teu arquetip espera un ' + _hPct(pi.retorn) + ', així que ara mateix la balança s’inclina cap a <strong style="color:#fff">'
              + (guanyaInv ? 'invertir' : 'amortitzar') + '</strong>. '
              + 'Recorda que amortitzar és un resultat cert i invertir és una expectativa amb volatilitat pel mig.'
            : 'La certesa d’estalviar interessos supera qualsevol expectativa raonable de mercat amb aquestes dades.')
        + '</div></div>';

      html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">'
        + _hKpi('Si amortitzes', _hEur(vs.net_amortitzar), 'patrimoni net al final', !guanyaInv)
        + _hKpi('Si inverteixes', _hEur(vs.net_invertir), 'net d’impostos', guanyaInv)
        + _hKpi('Diferència', (vs.diferencia >= 0 ? '+' : '') + _hEur(vs.diferencia), guanyaInv ? 'a favor d’invertir' : 'a favor d’amortitzar')
        + _hKpi('Interessos estalviats', _hEur(vs.interessos_estalviats), _hMesos(vs.mesos_estalviats) + ' menys')
        + '</div>';

      html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
        + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Com s’ha calculat</div>'
        + '<div style="font-size:12px;color:var(--g500);margin-bottom:14px;line-height:1.6">Els dos escenaris tenen exactament el mateix cost mensual: el que un estalvia de quota, l’altre l’inverteix. Sense trampes de flux de caixa.</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><tbody>'
        + [['Horitzó de comparació', _hMesos(vs.horitzo_mesos)],
           ['Comissió d’amortització', vs.comissio_amortitzacio > 0 ? _hEur(vs.comissio_amortitzacio) + ' (' + _hPct(vs.comissio_pct) + ')' : 'cap'],
           ['Cartera final si inverteixes', _hEur(vs.cartera_final_invertir) + ' (abans d’impostos)'],
           ['Cartera final si amortitzes', _hEur(vs.cartera_final_amortitzar) + ' (abans d’impostos)']]
          .concat(h.deduccio_pre2013
            ? [['Deducció acumulada amortitzant', _hEur(vs.deduccio_amortitzar)], ['Deducció acumulada invertint', _hEur(vs.deduccio_invertir)]]
            : [])
          .map(function (f) {
            return '<tr style="border-bottom:1px solid var(--g50)"><td style="padding:9px 6px;color:var(--g600)">' + f[0] + '</td>'
              + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + f[1] + '</td></tr>';
          }).join('')
        + '</tbody></table>';

      if (h.deduccio_pre2013 && vs.deduccio_invertir > vs.deduccio_amortitzar) {
        var quotaAnual = vs.quota_abans * 12;
        var forat = TBI_HIPOTECA.REF.deduccio.base_max - quotaAnual;
        html += '<div style="margin-top:14px;padding:13px 16px;background:#FEF5E7;border:1px solid #E8C285;border-radius:9px;font-size:12px;color:#7A4A00;line-height:1.7">'
          + '<strong>Compte amb la deducció.</strong> Amortitzar de cop et fa perdre ' + _hEur(vs.deduccio_invertir - vs.deduccio_amortitzar)
          + ' de deducció acumulada: superes el topall de ' + _hEur(TBI_HIPOTECA.REF.deduccio.base_max) + ' en un sol any i escurces els anys en què encara et podries deduir.'
          + (forat > 0
              ? ' La teva quota anual és de ' + _hEur(quotaAnual) + ', així que la jugada fina és amortitzar <strong>' + _hEur(forat) + ' cada any</strong> per arribar just al topall — ni un euro més.'
              : ' La teva quota ja supera el topall pel seu compte, així que la deducció no et dóna marge extra.')
          + '</div>';
      }
      html += '</div>';
    }
  }

  // ══════════ QUADRE ══════════
  if (tab === 'quadre') {
    html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
      + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Quadre d’amortització</div>'
      + '<div style="font-size:12px;color:var(--g500);margin-bottom:16px">Any a any, incloent les amortitzacions que has registrat.</div>';
    if (amorts.length) {
      html += '<div style="padding:12px 15px;background:#FEF5E7;border:1px solid #E8C285;border-radius:9px;font-size:12px;color:#7A4A00;margin-bottom:16px;line-height:1.6">'
        + 'Aquest quadre inclou ' + amorts.length + ' amortitzaci' + (amorts.length === 1 ? 'ó' : 'ons') + ' registrad'
        + (amorts.length === 1 ? 'a' : 'es') + '. El préstec passa de <strong>' + _hMesos(base.files.length) + '</strong> a <strong>' + _hMesos(real.files.length) + '</strong>.</div>';
    }
    html += '<div style="max-height:460px;overflow-y:auto;border:1px solid var(--g100);border-radius:10px">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead style="position:sticky;top:0;background:var(--g50)"><tr>'
      + ['Any', 'Quotes', 'Interessos', 'Capital', 'Amortitzat', 'Pendent'].map(function (t, i) {
          return '<th style="text-align:' + (i === 0 ? 'left' : 'right') + ';padding:9px 8px;font-size:10px;color:var(--g500);font-weight:600;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--g100)">' + t + '</th>';
        }).join('')
      + '</tr></thead><tbody>';
    TBI_HIPOTECA.perAnys(real.files).forEach(function (a) {
      html += '<tr style="border-bottom:1px solid var(--g50)">'
        + '<td style="padding:9px 8px;font-weight:500">' + a.any + '</td>'
        + '<td style="padding:9px 8px;text-align:right;font-family:var(--fm)">' + _hEur(a.quota) + '</td>'
        + '<td style="padding:9px 8px;text-align:right;font-family:var(--fm);color:#7A4A00">' + _hEur(a.interes) + '</td>'
        + '<td style="padding:9px 8px;text-align:right;font-family:var(--fm)">' + _hEur(a.principal) + '</td>'
        + '<td style="padding:9px 8px;text-align:right;font-family:var(--fm)">' + (a.extra > 0 ? '<strong style="color:#1A5C3A">' + _hEur(a.extra) + '</strong>' : '—') + '</td>'
        + '<td style="padding:9px 8px;text-align:right;font-family:var(--fm)">' + _hEur(a.pendent) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }

  html += '<div style="padding:13px 16px;background:var(--g50);border-radius:9px;font-size:11px;color:var(--g500);line-height:1.6">'
    + 'ⓘ Mòdul de simulació i anàlisi financera. No constitueix intermediació de crèdit immobiliari (Llei 5/2019) ni recomanació de cap producte o entitat. '
    + 'Dades fiscals vigents per a l’exercici 2026. Comprova sempre les condicions reals a la teva escriptura.'
    + '</div></div>';

  el.innerHTML = html;
  if (tab === 'amort') renderSimAmort(sel);
}

// Resultat en viu de la simulació d'amortització (sense re-renderitzar la vista)
function renderSimAmort(idHip) {
  var cont = document.getElementById('am-resultat');
  if (!cont) return;
  var h = hipotecaPerId(idHip);
  if (!h) return;
  var cfg = cfgDeHipoteca(h), esc = escenariDe(h);
  var previes = amortitzacionsDe(h);

  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  var imp = parseFloat(v('am-import')) || 0;
  var mes = Math.max(1, Math.round(parseFloat(v('am-mes')) || 1));
  if (imp <= 0) { cont.innerHTML = '<div style="font-size:12px;color:var(--g400)">Indica un import per veure l’impacte.</div>'; return; }

  var basePrev = TBI_HIPOTECA.generarQuadre(cfg, { escenari: esc, amortitzacions: previes });
  var qT = TBI_HIPOTECA.generarQuadre(cfg, { escenari: esc, amortitzacions: previes.concat([{ mes: mes, import: imp, mode: 'termini' }]) });
  var qQ = TBI_HIPOTECA.generarQuadre(cfg, { escenari: esc, amortitzacions: previes.concat([{ mes: mes, import: imp, mode: 'quota' }]) });
  var estT = basePrev.resum.total_interessos - qT.resum.total_interessos;
  var estQ = basePrev.resum.total_interessos - qQ.resum.total_interessos;
  var comPct = TBI_HIPOTECA.comissioMaximaPct(cfg, mes);
  var comEur = imp * comPct / 100;
  var tipusAra = basePrev.files[mes - 1] ? basePrev.files[mes - 1].tipus : 0;

  var html = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">'
    + _hKpi('Estalvi reduint termini', _hEur(estT), _hMesos(basePrev.files.length - qT.files.length) + ' menys', true)
    + _hKpi('Estalvi reduint quota', _hEur(estQ), 'quota ' + _hEur2(qQ.resum.quota_minima))
    + _hKpi('Comissió', comEur > 0 ? _hEur(comEur) : 'Cap', comEur > 0 ? _hPct(comPct) + ' del capital' : 'fora de període')
    + _hKpi('Rendiment implícit', _hPct(tipusAra), 'segur i lliure d’impostos')
    + '</div>';

  html += '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
    + ['&nbsp;', 'Ara', 'Reduint termini', 'Reduint quota'].map(function (t, i) {
        return '<th style="text-align:' + (i === 0 ? 'left' : 'right') + ';padding:8px 6px;font-size:10px;color:var(--g400);font-weight:500;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--g100)">' + t + '</th>';
      }).join('')
    + '</tr></thead><tbody>'
    + [['Quota mensual', _hEur2(basePrev.resum.quota_inicial), _hEur2(qT.resum.quota_inicial), _hEur2(qQ.resum.quota_minima)],
       ['Durada', _hMesos(basePrev.files.length), _hMesos(qT.files.length), _hMesos(qQ.files.length)],
       ['Interessos totals', _hEur(basePrev.resum.total_interessos), _hEur(qT.resum.total_interessos), _hEur(qQ.resum.total_interessos)]]
      .map(function (f) {
        return '<tr style="border-bottom:1px solid var(--g50)"><td style="padding:9px 6px;font-weight:500">' + f[0] + '</td>'
          + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + f[1] + '</td>'
          + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + f[2] + '</td>'
          + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + f[3] + '</td></tr>';
      }).join('')
    + '<tr><td style="padding:9px 6px;font-weight:600">Estalvi d’interessos</td><td style="padding:9px 6px;text-align:right">—</td>'
    + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm);color:#1A5C3A;font-weight:600">' + _hEur(estT) + '</td>'
    + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm);color:#1A5C3A;font-weight:600">' + _hEur(estQ) + '</td></tr>'
    + '</tbody></table>';

  if (estT > estQ * 1.05) {
    html += '<div style="margin-top:14px;padding:12px 15px;background:#EAF3DE;border-radius:9px;font-size:12px;color:#1A5C3A;line-height:1.6">'
      + '<strong>Reduir el termini estalvia ' + _hEur(estT - estQ) + ' més</strong> que reduir la quota. La contrapartida és que no notaràs cap alleujament mensual. '
      + 'Si la teva tresoreria va justa, reduir quota és una decisió perfectament defensable — la tranquil·litat també val diners.</div>';
  }
  if (comEur > 0) {
    html += '<div style="margin-top:12px;padding:12px 15px;background:#FEF5E7;border:1px solid #E8C285;border-radius:9px;font-size:12px;color:#7A4A00;line-height:1.6">'
      + 'La comissió de ' + _hEur(comEur) + ' es menja el ' + _hPct(comEur / Math.max(estT, 1) * 100) + ' de l’estalvi. '
      + 'Aquest és el <em>màxim legal</em>: comprova a l’escriptura què tens pactat de veritat, perquè sovint és menys o directament zero. '
      + 'Si és així, posa-ho a la fitxa de la hipoteca i el càlcul s’ajustarà.</div>';
  }
  cont.innerHTML = html;
}
