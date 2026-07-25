// ════════════════════════════════════════════════════════════════════════════
// MOTOR D'ANÀLISI v3 — rendiment real (TIR/TWR), cost real (TER) i
// bandes de deriva 5/25 per al rebalanceig.
// ════════════════════════════════════════════════════════════════════════════

// Paràmetres del motor. Centralitzats aquí per poder-los exposar a admin.
var MOTOR_V3 = {
  banda_abs_pp: 5,        // regla 5/25: desviació absoluta màxima (punts %)
  banda_rel: 0.25,        // regla 5/25: desviació relativa màxima (25% del pes)
  banda_min_pp: 0.5,      // terra de la banda per a pesos molt petits
  import_min_ordre: 50,   // € mínims per línia d'aportació (evita ordres ridícules)
  ter_banc_ref: 1.80,     // cost total mitjà de la banca tradicional (%)
  ter_defecte: 0.25,      // TER assumit si no hi ha dada ni categoria
  retorn_brut_ref: 6.0,   // rendiment brut per il·lustrar l'impacte del cost (%)
  xirr_mesos_min: 6       // sota d'aquest històric la TIR anualitzada no és fiable
};

// TER orientatiu per categoria (%). Fallback quan la posició no té TER propi.
// Són mitjanes de mercat de producte indexat UCITS, no recomanacions.
var TER_PER_CATEGORIA = {
  rv_global:0.20, rv_dividend:0.30, rv_reits:0.35, rv_growth:0.35, rv_value:0.30,
  rv_emergent:0.25, rf_global:0.20, rf_gov_curt:0.15, rf_gov_llarg:0.15,
  rf_corp:0.20, rf_hy:0.45, fons_8020:0.22, fons_6040:0.22, fons_4060:0.22,
  fons_2080:0.22, or_metalls:0.25, commodities:0.40, liquiditat:0.05,
  crowdlending:1.00, crypto:1.00, private_equity:2.00, startups:2.00,
  infraestructures:0.55, hedge_funds:1.50, altres:0.50
};

function terDeCategoria(catId) {
  var t = TER_PER_CATEGORIA[catId];
  return (typeof t === 'number') ? t : MOTOR_V3.ter_defecte;
}

// ── XIRR (TIR diner-ponderada) ──────────────────────────────────────────────
// Substitueix el CAGR ingenu Math.pow(valor/cost, 1/anys), que assumeix que
// tot el capital va entrar el dia del primer moviment i, amb aportacions
// periòdiques, infravalora sistemàticament el rendiment real.
var _MS_ANY = 1000 * 60 * 60 * 24 * 365.25;

function _xnpv(rate, flows) {
  var t0 = flows[0].t, s = 0, i, anys;
  for (i = 0; i < flows.length; i++) {
    anys = (flows[i].t - t0) / _MS_ANY;
    s += flows[i].a / Math.pow(1 + rate, anys);
  }
  return s;
}

function _xnpvDeriv(rate, flows) {
  var t0 = flows[0].t, s = 0, i, anys;
  for (i = 0; i < flows.length; i++) {
    anys = (flows[i].t - t0) / _MS_ANY;
    if (anys === 0) continue;
    s += -anys * flows[i].a / Math.pow(1 + rate, anys + 1);
  }
  return s;
}

// flows: [{t: timestamp ms, a: import amb signe}] — sortides negatives.
// Retorna la taxa anual en decimal (0.072 = 7,2%) o null si no és calculable.
function calcXIRR(flows) {
  if (!flows || flows.length < 2) return null;
  var pos = false, neg = false, i;
  for (i = 0; i < flows.length; i++) {
    if (flows[i].a > 0) pos = true;
    if (flows[i].a < 0) neg = true;
  }
  if (!pos || !neg) return null;

  flows = flows.slice().sort(function(a, b){ return a.t - b.t; });
  if (flows[flows.length - 1].t - flows[0].t < 1000 * 60 * 60 * 24 * 20) return null; // <20 dies

  // 1) Newton-Raphson
  var r = 0.1, f, d, rn;
  for (i = 0; i < 80; i++) {
    f = _xnpv(r, flows);
    d = _xnpvDeriv(r, flows);
    if (!isFinite(f) || !isFinite(d) || Math.abs(d) < 1e-12) break;
    rn = r - f / d;
    if (!isFinite(rn)) break;
    if (rn <= -0.999) rn = (r - 0.999) / 2;
    if (Math.abs(rn - r) < 1e-9) {
      r = rn;
      if (Math.abs(_xnpv(r, flows)) < 1e-4) return r;
      break;
    }
    r = rn;
  }

  // 2) Bisecció de seguretat (robusta encara que Newton divergeixi)
  var lo = -0.999, hi = 10, flo = _xnpv(lo, flows), fhi = _xnpv(hi, flows), mid, fm, k;
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (k = 0; k < 200; k++) {
    mid = (lo + hi) / 2;
    fm = _xnpv(mid, flows);
    if (!isFinite(fm)) return null;
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    if (hi - lo < 1e-9) break;
  }
  return (lo + hi) / 2;
}

// Construeix els fluxos de caixa reals del client (moviments + valor actual).
// Convenció: el que surt de la butxaca és negatiu.
//   compra i comissió → negatiu · venda i dividend → positiu
//   valor de mercat d'avui → flux positiu final
function calcFluxosCaixa() {
  var moviments = getMovimentsV2();
  var posicions = getPosicionsV2();
  var valor_avui = 0, i;
  for (i = 0; i < posicions.length; i++) {
    valor_avui += (parseFloat(posicions[i].valor_actual) || 0);
  }
  var flows = [];
  moviments.forEach(function(m){
    var imp = parseFloat(m.import) || 0;
    if (!imp) return;
    var t = new Date(m.data).getTime();
    if (isNaN(t)) return;
    if (m.tipus === 'compra')   flows.push({ t: t, a: -imp });
    if (m.tipus === 'venda')    flows.push({ t: t, a:  imp });
    if (m.tipus === 'dividend') flows.push({ t: t, a:  imp });
    if (m.tipus === 'comissio') flows.push({ t: t, a: -imp });
  });
  if (flows.length === 0 || valor_avui <= 0) return [];
  flows.push({ t: Date.now(), a: valor_avui });
  flows.sort(function(a, b){ return a.t - b.t; });
  return flows;
}

// ── TWR (rendiment temps-ponderat) ──────────────────────────────────────────
// Mesura la qualitat de la cartera aïllant l'efecte del calendari d'aportacions.
// Es calcula encadenant els snapshots mensuals: r = (V1 - flux) / V0.
function _mesosEntre(mesA, mesB) {
  var a = String(mesA).split('-'), b = String(mesB).split('-');
  if (a.length < 2 || b.length < 2) return 0;
  return (parseInt(b[0], 10) - parseInt(a[0], 10)) * 12 + (parseInt(b[1], 10) - parseInt(a[1], 10));
}

function calcTWR() {
  var c = getClient();
  var snaps = (c && Array.isArray(c.snapshots_cartera)) ? c.snapshots_cartera.slice() : [];
  var serie = snaps.filter(function(s){ return s && s.mes; })
                   .map(function(s){ return { mes: String(s.mes), valor: parseFloat(s.valor) || 0, invertit: parseFloat(s.invertit) || 0 }; });

  // Punt viu del mes actual (encara no desat com a snapshot)
  var posicions = getPosicionsV2(), valor_avui = 0, i;
  for (i = 0; i < posicions.length; i++) valor_avui += (parseFloat(posicions[i].valor_actual) || 0);
  if (valor_avui > 0) {
    var kp = calcKPIsCartera();
    var mesAvui = new Date().toISOString().slice(0, 7);
    var idx = -1;
    for (i = 0; i < serie.length; i++) if (serie[i].mes === mesAvui) idx = i;
    var punt = { mes: mesAvui, valor: valor_avui, invertit: kp.cost_total };
    if (idx >= 0) serie[idx] = punt; else serie.push(punt);
  }
  serie.sort(function(a, b){ return a.mes.localeCompare(b.mes); });
  if (serie.length < 2) return null;

  var factor = 1, n = 0, v0, v1, flux, r;
  for (i = 1; i < serie.length; i++) {
    v0 = serie[i - 1].valor;
    v1 = serie[i].valor;
    flux = serie[i].invertit - serie[i - 1].invertit;
    if (!(v0 > 0)) continue;
    r = (v1 - flux) / v0;
    if (!isFinite(r) || r <= 0) continue;
    factor *= r;
    n++;
  }
  if (n === 0) return null;
  var mesos = _mesosEntre(serie[0].mes, serie[serie.length - 1].mes);
  var anys = Math.max(mesos / 12, 1 / 12);
  return {
    total: (factor - 1) * 100,
    anual: (Math.pow(factor, 1 / anys) - 1) * 100,
    mesos: mesos,
    n_periodes: n,
    fiable: mesos >= MOTOR_V3.xirr_mesos_min
  };
}

// ── TER real de la cartera ──────────────────────────────────────────────────
// El TER de l'arquetip ("~0,19%") és una etiqueta il·lustrativa. Això calcula
// el cost real ponderat per valor de les posicions que el client té de veritat,
// i el compara amb el target i amb el cost mitjà de la banca tradicional.
function calcTERCartera() {
  var posAgg = calcPosicionsAmbAgregats();
  var valor_total = 0, ponderat = 0, valor_explicit = 0;
  var detall = [];
  posAgg.forEach(function(p){
    var v = parseFloat(p.valor_actual) || 0;
    if (v <= 0) return;
    var brut = (p.ter === null || p.ter === undefined || p.ter === '') ? NaN : parseFloat(p.ter);
    var explicit = isFinite(brut) && brut >= 0;
    var ter = explicit ? brut : terDeCategoria(p.cat);
    valor_total += v;
    ponderat += v * ter;
    if (explicit) valor_explicit += v;
    detall.push({
      id: p.id, nom: p.nom || p.cat, cat: p.cat, valor: v,
      ter: ter, explicit: explicit, cost_eur: v * ter / 100
    });
  });
  if (valor_total <= 0) return null;

  var ter_real = ponderat / valor_total;

  // TER de la cartera target (custom de l'assessor o la de l'arquetip)
  var c = getClient();
  var arq = getArquetip(c && c.arquetipId ? c.arquetipId : 'navegant');
  var target = (c && c.cartera_target_custom && c.cartera_target_custom.length > 0)
    ? c.cartera_target_custom : ((arq && arq.actius) || []);
  var ter_target = null;
  if (target.length > 0) {
    var sumaPct = 0, acum = 0;
    target.forEach(function(t){
      var pct = parseFloat(t.pct) || 0;
      if (pct <= 0) return;
      var catId = t.id || t.nom;
      sumaPct += pct;
      acum += pct * terDeCategoria(catId);
    });
    if (sumaPct > 0) ter_target = acum / sumaPct;
  }

  var g = MOTOR_V3.retorn_brut_ref / 100;
  var v_tbi  = valor_total * Math.pow(1 + g - ter_real / 100, 10);
  var v_banc = valor_total * Math.pow(1 + g - MOTOR_V3.ter_banc_ref / 100, 10);

  detall.sort(function(a, b){ return b.cost_eur - a.cost_eur; });

  return {
    ter_real: ter_real,
    ter_target: ter_target,
    ter_banc: MOTOR_V3.ter_banc_ref,
    valor_total: valor_total,
    cost_anual_eur: valor_total * ter_real / 100,
    cost_banc_eur: valor_total * MOTOR_V3.ter_banc_ref / 100,
    estalvi_anual_eur: valor_total * (MOTOR_V3.ter_banc_ref - ter_real) / 100,
    estalvi_10a_eur: v_tbi - v_banc,
    cobertura_pct: valor_explicit / valor_total * 100,
    detall: detall
  };
}

// ── Repartiment d'una aportació entre categories infraponderades ────────────
// Cascada: proporcional al gap pendent, sense superar-lo mai; el sobrant es
// reparteix pels pesos target. Evita "sobrecorregir" una sola categoria.
function _repartirAportacio(candidats, totsElsRows, aport) {
  var assign = {}, i;
  candidats.forEach(function(r){ assign[r.id] = 0; });
  var restant = aport;
  for (i = 0; i < 8 && restant > 0.01; i++) {
    var oberts = candidats.filter(function(r){ return assign[r.id] < r.gap_plan - 0.01; });
    if (oberts.length === 0) break;
    var sumG = 0;
    oberts.forEach(function(r){ sumG += (r.gap_plan - assign[r.id]); });
    if (sumG <= 0) break;
    var disponible = restant;
    oberts.forEach(function(r){
      var quota = (r.gap_plan - assign[r.id]) / sumG;
      var add = Math.min(disponible * quota, r.gap_plan - assign[r.id]);
      assign[r.id] += add;
      restant -= add;
    });
  }
  if (restant > 0.01) {
    var base = (totsElsRows && totsElsRows.length) ? totsElsRows : candidats;
    var sumT = 0;
    base.forEach(function(r){ sumT += (r.target_pct || 0); });
    base.forEach(function(r){
      if (assign[r.id] === undefined) assign[r.id] = 0;
      assign[r.id] += restant * (sumT > 0 ? (r.target_pct || 0) / sumT : 1 / base.length);
    });
  }
  return assign;
}

// Elimina línies per sota de l'import mínim (redistribuint-les), arrodoneix a
// euros sencers i quadra el residu perquè la suma sigui exactament l'aportació.
function _aplicarMinimIArrodonir(lines, total, minim) {
  lines = lines.filter(function(l){ return l.import > 0.5; })
               .sort(function(a, b){ return b.import - a.import; });
  if (lines.length === 0) return [];

  if (total < minim) {
    lines = [lines[0]];
    lines[0].import = total;
  } else {
    var canvi = true, guard = 0;
    while (canvi && lines.length > 1 && guard < 30) {
      guard++;
      canvi = false;
      var petita = lines[lines.length - 1];
      if (petita.import < minim) {
        lines.pop();
        var pesos = lines.map(function(l){ return l.import; });
        var sum = 0;
        pesos.forEach(function(p){ sum += p; });
        lines.forEach(function(l, i){
          l.import += petita.import * (sum > 0 ? pesos[i] / sum : 1 / lines.length);
        });
        lines.sort(function(a, b){ return b.import - a.import; });
        canvi = true;
      }
    }
  }

  var acum = 0;
  lines.forEach(function(l){ l.import = Math.round(l.import); acum += l.import; });
  var resid = Math.round(total) - acum;
  if (lines.length > 0) lines[0].import += resid;
  return lines.filter(function(l){ return l.import > 0; });
}
