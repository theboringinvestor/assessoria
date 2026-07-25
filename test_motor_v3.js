// ── Stubs de l'entorn de platform.html ──────────────────────────────────
var STATE = { posicions: [], moviments: [], client: null };
function getPosicionsV2(){ return STATE.posicions; }
function getMovimentsV2(){ return STATE.moviments; }
function getClient(){ return STATE.client; }
var ACTIUS_TAXONOMY = [
  {id:'rv_global',ca:'RV Global',emoji:'G',color:'#1'},
  {id:'rf_corp',ca:'RF Corp',emoji:'B',color:'#2'},
  {id:'or_metalls',ca:'Or',emoji:'O',color:'#3'},
  {id:'liquiditat',ca:'Liquiditat',emoji:'C',color:'#4'},
  {id:'crypto',ca:'Crypto',emoji:'K',color:'#5'}
];
var ARQ = { id:'test', nom:'Test', cartNom:'Roma', actius:[
  {id:'rv_global',pct:60},{id:'rf_corp',pct:30},{id:'or_metalls',pct:6},{id:'liquiditat',pct:4}
]};
function getArquetip(){ return ARQ; }
function calcPosicionsAmbAgregats(){
  return STATE.posicions.map(function(p){
    var movs = STATE.moviments.filter(function(m){return m.posicio_id===p.id;});
    var cost=0,u=0,d=0,c=0;
    movs.forEach(function(m){var imp=parseFloat(m.import)||0;var uu=parseFloat(m.unitats)||0;
      if(m.tipus==='compra'){cost+=imp;u+=uu;} if(m.tipus==='venda'){cost-=imp;u-=uu;}
      if(m.tipus==='dividend'){d+=imp;} if(m.tipus==='comissio'){c+=imp;}});
    var v=parseFloat(p.valor_actual)||0;
    return Object.assign({},p,{cost_base:cost,unitats_total:u,dividends_total:d,comissions_total:c,
      pnl_eur:v-cost,pnl_pct:cost>0?((v-cost)/cost*100):0,num_moviments:movs.length});
  });
}

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

// KPIs globals de cartera
function calcKPIsCartera() {
  var posAgg = calcPosicionsAmbAgregats();
  var moviments = getMovimentsV2();
  var valor_total = 0, cost_total = 0, dividends_total = 0, comissions_total = 0;
  posAgg.forEach(function(p){
    valor_total += (parseFloat(p.valor_actual) || 0);
    cost_total += p.cost_base;
    dividends_total += p.dividends_total;
    comissions_total += p.comissions_total;
  });
  var pnl_eur = valor_total - cost_total;
  var pnl_pct = cost_total > 0 ? (pnl_eur / cost_total * 100) : 0;

  // Antiguitat de la cartera (des del primer moviment de compra)
  var dataInici = null;
  moviments.forEach(function(m){
    if (m.tipus === 'compra' && m.data && (!dataInici || m.data < dataInici)) {
      dataInici = m.data;
    }
  });
  var anys = 0;
  if (dataInici) {
    var d0 = new Date(dataInici);
    if (!isNaN(d0.getTime())) anys = Math.max(0, (new Date() - d0) / (1000*60*60*24*365.25));
  }

  // ── Rendiment anualitzat: TIR diner-ponderada (XIRR) ──
  // Abans s'usava Math.pow(valor/cost, 1/anys), que assumeix que tot el capital
  // va entrar el primer dia. Amb aportacions periòdiques això és incorrecte.
  var xirr = null;
  try {
    var flows = calcFluxosCaixa();
    if (flows.length >= 2) {
      var r = calcXIRR(flows);
      if (r !== null && isFinite(r) && r > -0.9999 && r < 100) xirr = r * 100;
    }
  } catch(e) { xirr = null; }
  var xirr_fiable = (xirr !== null) && (anys * 12 >= MOTOR_V3.xirr_mesos_min);

  return {
    valor_total: valor_total,
    cost_total: cost_total,
    pnl_eur: pnl_eur,
    pnl_pct: pnl_pct,
    dividends_total: dividends_total,
    comissions_total: comissions_total,
    xirr: xirr,                                  // TIR anual % (null si no calculable)
    xirr_fiable: xirr_fiable,                    // false si l'històric és massa curt
    cagr: (xirr !== null ? xirr : 0),            // àlies retrocompatible
    anys_actiu: anys,
    num_posicions: posAgg.length,
    num_moviments: moviments.length,
    data_inici: dataInici
  };
}

// Sèrie d'evolució temporal de la cartera (per al gràfic)
// Retorna [{data, invertit_acum, valor_estimat}] ordenat cronològicament
// Nota: el valor_estimat entre snapshots és el cost_acum + plusvalua interpolada al final
function calcEvolucioCartera() {
  var moviments = getMovimentsV2().slice().sort(function(a,b){
    return (a.data || '').localeCompare(b.data || '');
  });
  if (moviments.length === 0) return [];
  var serie = [];
  var cum = 0;
  moviments.forEach(function(m){
    var imp = parseFloat(m.import) || 0;
    if (m.tipus === 'compra')   cum += imp;
    if (m.tipus === 'venda')    cum -= imp;
    // dividends i comissions no afecten el cost base
    serie.push({ data: m.data, invertit_acum: cum, tipus: m.tipus });
  });
  // Afegir punt final amb el valor actual real
  var kpis = calcKPIsCartera();
  var avui = new Date().toISOString().slice(0,10);
  serie.push({ data: avui, invertit_acum: kpis.cost_total, valor_actual: kpis.valor_total, tipus: 'snapshot' });
  return serie;
}

// Distribució real per categoria (amb noms i colors de la taxonomia)
function calcDistribucioReal() {
  var posAgg = calcPosicionsAmbAgregats();
  var perCat = {};
  posAgg.forEach(function(p){
    var v = parseFloat(p.valor_actual) || 0;
    if (!perCat[p.cat]) perCat[p.cat] = 0;
    perCat[p.cat] += v;
  });
  var total = Object.values(perCat).reduce(function(s,v){return s+v;}, 0);
  return Object.keys(perCat).map(function(catId){
    var taxon = ACTIUS_TAXONOMY.find(function(a){ return a.id === catId; });
    return {
      id: catId,
      nom: taxon ? taxon.ca : catId,
      emoji: taxon ? taxon.emoji : '•',
      color: taxon ? taxon.color : '#888',
      valor: perCat[catId],
      pct: total > 0 ? (perCat[catId] / total * 100) : 0
    };
  }).sort(function(a,b){ return b.valor - a.valor; });
}

// Càlcul de gaps (real vs target) amb bandes de deriva 5/25 i recomanació
// d'aportació. Dues bases de càlcul deliberadament separades:
//   · DIAGNÒSTIC  → gaps contra el valor actual (què està desviat avui)
//   · PLANIFICACIÓ→ gaps contra valor + aportació (on posar els diners nous)
// Regla 5/25 (Larimore): es rebalanceja quan la desviació supera 5 punts
// percentuals absoluts o el 25% del pes objectiu, el que sigui més estricte.
function calcMatchingITactic(aportacio, opts) {
  var c = getClient();
  if (!c) return null;
  var arq = getArquetip(c.arquetipId || 'navegant');
  var target = (c.cartera_target_custom && c.cartera_target_custom.length > 0)
    ? c.cartera_target_custom
    : (arq.actius || []);
  if (!target || target.length === 0) return null;

  opts = opts || {};
  var bandaAbs  = (opts.banda_abs_pp != null)     ? opts.banda_abs_pp     : MOTOR_V3.banda_abs_pp;
  var bandaRel  = (opts.banda_rel != null)        ? opts.banda_rel        : MOTOR_V3.banda_rel;
  var bandaMin  = (opts.banda_min_pp != null)     ? opts.banda_min_pp     : MOTOR_V3.banda_min_pp;
  var importMin = (opts.import_min_ordre != null) ? opts.import_min_ordre : MOTOR_V3.import_min_ordre;

  var real = calcDistribucioReal();
  var valor_actual = real.reduce(function(s,r){ return s + r.valor; }, 0);
  var aport = parseFloat(aportacio) || 0;
  var valor_post = valor_actual + aport;

  function _resolCat(t) {
    var catId = t.id;
    if (!catId) {
      var found = ACTIUS_TAXONOMY.find(function(a){ return a.ca === t.nom || a.id === t.nom; });
      catId = found ? found.id : t.nom;
    }
    return catId;
  }

  var rows = target.map(function(t){
    var catId = _resolCat(t);
    var taxon = ACTIUS_TAXONOMY.find(function(a){ return a.id === catId; });
    var realRow = real.find(function(r){ return r.id === catId; });
    var target_pct = parseFloat(t.pct) || 0;
    var real_eur = realRow ? realRow.valor : 0;
    var real_pct = valor_actual > 0 ? (real_eur / valor_actual * 100) : 0;
    var gap_pct = target_pct - real_pct;
    var banda = Math.max(bandaMin, Math.min(bandaAbs, target_pct * bandaRel));
    var fora = valor_actual > 0 && Math.abs(gap_pct) > banda;
    return {
      id: catId,
      nom: taxon ? taxon.ca : (t.nom || catId),
      emoji: taxon ? taxon.emoji : '•',
      color: t.color || (taxon ? taxon.color : '#888'),
      target_pct: target_pct,
      target_eur: target_pct / 100 * valor_actual,
      real_eur: real_eur,
      real_pct: real_pct,
      gap_eur: target_pct / 100 * valor_actual - real_eur,   // diagnòstic
      gap_pct: gap_pct,
      gap_plan: target_pct / 100 * valor_post - real_eur,    // planificació
      banda_pp: banda,
      fora_banda: fora,
      estat: !fora ? 'ok' : (gap_pct > 0 ? 'infra' : 'sobre'),
      fora_pla: false
    };
  });

  // Posicions en categories que NO són a la cartera target. Abans quedaven
  // invisibles al matching: un client amb 30% de crypto sense crypto al target
  // no veia res. Ara hi apareixen amb target 0%.
  var idsTarget = {};
  rows.forEach(function(r){ idsTarget[r.id] = true; });
  real.forEach(function(r){
    if (idsTarget[r.id] || r.valor <= 0) return;
    var real_pct = valor_actual > 0 ? (r.valor / valor_actual * 100) : 0;
    rows.push({
      id: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
      target_pct: 0, target_eur: 0,
      real_eur: r.valor, real_pct: real_pct,
      gap_eur: -r.valor, gap_pct: -real_pct, gap_plan: -r.valor,
      banda_pp: bandaMin,
      fora_banda: real_pct > bandaMin,
      estat: 'sobre',
      fora_pla: true
    });
  });

  // ── Resum de salut de la cartera ──
  var sumaAbsGap = 0, derivaMax = 0, foraPlaPct = 0, nFora = 0;
  rows.forEach(function(r){
    sumaAbsGap += Math.abs(r.gap_pct);
    if (Math.abs(r.gap_pct) > derivaMax) derivaMax = Math.abs(r.gap_pct);
    if (r.fora_pla) foraPlaPct += r.real_pct;
    if (r.fora_banda) nFora++;
  });
  var resum = {
    // Índex de coherència 0-100: les desviacions es compensen per parelles,
    // per això es divideix per 2 (equivalent a 100 - "active share").
    coherencia: valor_actual > 0 ? Math.max(0, Math.round(100 - sumaAbsGap / 2)) : null,
    n_fora_banda: nFora,
    deriva_max_pp: derivaMax,
    cal_rebalanceig: valor_actual > 0 && nFora > 0,
    fora_pla_pct: foraPlaPct,
    valor_actual: valor_actual
  };

  // ── Recomanació d'aportació ──
  var recomanacio = [];
  if (aport > 0) {
    var infra = rows.filter(function(r){ return r.gap_plan > 0.5; });
    var prioritaris = infra.filter(function(r){ return r.fora_banda; });
    var base = prioritaris.length > 0 ? prioritaris : infra;

    if (base.length === 0) {
      // Cartera dins de bandes i sense gaps → DCA pels pesos target majors
      var top = rows.filter(function(r){ return !r.fora_pla && r.target_pct > 0; })
                    .sort(function(a,b){ return b.target_pct - a.target_pct; })
                    .slice(0, 3);
      var sumT = 0;
      top.forEach(function(r){ sumT += r.target_pct; });
      recomanacio = top.map(function(r){
        return {
          cat: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
          import: aport * (sumT > 0 ? r.target_pct / sumT : 1 / top.length),
          motiu: 'DCA equilibrat', prioritat: 'baixa'
        };
      });
    } else {
      var assign = _repartirAportacio(base, rows.filter(function(r){ return !r.fora_pla; }), aport);
      recomanacio = base.map(function(r){
        return {
          cat: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
          import: assign[r.id] || 0,
          motiu: r.fora_banda ? ('Fora de banda · ' + r.gap_pct.toFixed(1) + 'pp') : 'Infraponderat',
          prioritat: r.fora_banda ? 'alta' : 'mitjana'
        };
      });
    }
    recomanacio = _aplicarMinimIArrodonir(recomanacio, aport, importMin);
    recomanacio.forEach(function(l){ l.pct = aport > 0 ? (l.import / aport * 100) : 0; });
  }

  rows.sort(function(a,b){ return b.gap_eur - a.gap_eur; });

  return {
    rows: rows,
    resum: resum,
    valor_actual: valor_actual,
    valor_post: valor_post,
    aportacio: aport,
    import_min_ordre: importMin,
    recomanacio: recomanacio
  };
}


// ══════════════════════════ TESTS ══════════════════════════
var fails=0, passes=0;
function eq(nom, a, b, tol){ tol=tol||1e-6;
  var ok = (a===null||b===null) ? a===b : Math.abs(a-b)<=tol;
  if(ok){passes++; console.log('  ✓ '+nom+'  ('+(a===null?'null':(+a).toFixed(4))+')');}
  else {fails++; console.log('  ✗ '+nom+'  obtingut='+a+'  esperat='+b);}
}
function ok(nom, cond, info){ if(cond){passes++;console.log('  ✓ '+nom+(info?'  '+info:''));}
  else {fails++;console.log('  ✗ '+nom+(info?'  '+info:''));} }
var DIA=86400000;
function dies(n){ return Date.now()-n*DIA; }
function iso(n){ return new Date(dies(n)).toISOString().slice(0,10); }

console.log('\n── 1. XIRR: casos amb solució analítica ──');
eq('1000 -> 1100 en 1 any = 10%', calcXIRR([{t:dies(365.25),a:-1000},{t:dies(0),a:1100}])*100, 10, 0.05);
eq('1000 -> 2000 en 2 anys = 41,42%', calcXIRR([{t:dies(730.5),a:-1000},{t:dies(0),a:2000}])*100, (Math.pow(2,0.5)-1)*100, 0.05);
eq('1000 -> 800 en 1 any = -20%', calcXIRR([{t:dies(365.25),a:-1000},{t:dies(0),a:800}])*100, -20, 0.05);
eq('sense flux negatiu -> null', calcXIRR([{t:dies(365),a:100},{t:dies(0),a:100}]), null);
eq('un sol flux -> null', calcXIRR([{t:dies(0),a:-100}]), null);
eq('menys de 20 dies -> null', calcXIRR([{t:dies(10),a:-100},{t:dies(0),a:110}]), null);

console.log('\n── 2. El bug del CAGR: aportacions mensuals ──');
// 24 aportacions de 100€ (l'ultima fa 1 mes). Valor final 2600€.
var flows=[], cost=0;
for(var k=24;k>=1;k--){ flows.push({t:dies(k*30.44), a:-100}); cost+=100; }
flows.push({t:dies(0), a:2600});
var xirr=calcXIRR(flows)*100;
var anysNaive=(24*30.44)/365.25;
var cagrNaive=(Math.pow(2600/cost,1/anysNaive)-1)*100;
console.log('    capital aportat: '+cost+'€ · valor final: 2600€ · antiguitat: '+anysNaive.toFixed(2)+' anys');
console.log('    CAGR antic: '+cagrNaive.toFixed(2)+'%   TIR nova: '+xirr.toFixed(2)+'%');
ok('la TIR supera el CAGR ingenu (el capital mitjà real és ~la meitat)', xirr > cagrNaive*1.6,
   '(ratio '+(xirr/cagrNaive).toFixed(2)+'x)');
// Verificacio independent: la TIR ha de fer NPV=0
var npv=0, t0=flows[0].t;
flows.forEach(function(f){ npv += f.a/Math.pow(1+xirr/100,(f.t-t0)/(365.25*DIA)); });
eq('NPV a la taxa trobada = 0', npv, 0, 0.01);

console.log('\n── 3. calcKPIsCartera end-to-end ──');
STATE.posicions=[{id:'p1',cat:'rv_global',nom:'MSCI World',valor_actual:2600}];
STATE.moviments=[];
for(var k2=24;k2>=1;k2--) STATE.moviments.push({id:'m'+k2,posicio_id:'p1',data:iso(k2*30.44),tipus:'compra',import:100});
var kp=calcKPIsCartera();
eq('cost_total', kp.cost_total, 2400);
eq('valor_total', kp.valor_total, 2600);
eq('xirr coincideix amb el càlcul directe', kp.xirr, xirr, 0.2);
ok('xirr_fiable amb 2 anys d\'històric', kp.xirr_fiable===true);
ok('cagr manté retrocompatibilitat (=xirr)', kp.cagr===kp.xirr);
// Historic curt -> no fiable
STATE.moviments=[{id:'m1',posicio_id:'p1',data:iso(60),tipus:'compra',import:2400}];
var kp2=calcKPIsCartera();
ok('històric de 2 mesos -> xirr_fiable=false', kp2.xirr_fiable===false, '(xirr='+(kp2.xirr===null?'null':kp2.xirr.toFixed(1))+')');
// Sense valors de mercat -> xirr null
STATE.posicions=[{id:'p1',cat:'rv_global',valor_actual:0}];
eq('sense valor de mercat -> xirr null', calcKPIsCartera().xirr, null);

console.log('\n── 4. TWR ──');
STATE.posicions=[{id:'p1',cat:'rv_global',valor_actual:1210}];
STATE.moviments=[{id:'m1',posicio_id:'p1',data:iso(400),tipus:'compra',import:1000}];
// 2 snapshots: 1000 -> 1100 (sense fluxos) i el punt viu 1210
var mesAnterior=new Date(Date.now()-90*DIA).toISOString().slice(0,7);
var mesInicial=new Date(Date.now()-180*DIA).toISOString().slice(0,7);
STATE.client={arquetipId:'test',snapshots_cartera:[
  {mes:mesInicial,valor:1000,invertit:1000},
  {mes:mesAnterior,valor:1100,invertit:1000}
]};
var twr=calcTWR();
eq('TWR total 1000->1100->1210 = +21%', twr.total, 21, 0.001);
ok('TWR encadena 2 períodes', twr.n_periodes===2, '(n='+twr.n_periodes+')');
// Amb aportació enmig el TWR no s'ha d'inflar
STATE.client.snapshots_cartera=[
  {mes:mesInicial,valor:1000,invertit:1000},
  {mes:mesAnterior,valor:1600,invertit:1500}   // +500 aportats, +100 de mercat
];
STATE.posicions=[{id:'p1',cat:'rv_global',valor_actual:1600}];
STATE.moviments=[{id:'m1',posicio_id:'p1',data:iso(400),tipus:'compra',import:1500}];
var twr2=calcTWR();
eq('TWR aïlla l\'aportació: (1600-500)/1000 = +10%', twr2.total, 10, 0.001);

console.log('\n── 5. TER ponderat ──');
STATE.posicions=[
  {id:'p1',cat:'rv_global',valor_actual:6000},            // 0,20% per defecte
  {id:'p2',cat:'rf_corp',valor_actual:3000},              // 0,20% per defecte
  {id:'p3',cat:'crypto',valor_actual:1000, ter:0.50}      // TER explícit
];
STATE.moviments=[];
var ter=calcTERCartera();
eq('TER ponderat = (6000*.2+3000*.2+1000*.5)/10000', ter.ter_real, (6000*0.20+3000*0.20+1000*0.50)/10000, 1e-9);
eq('cost anual en €', ter.cost_anual_eur, 10000*ter.ter_real/100, 1e-9);
eq('cost banca (1,80%)', ter.cost_banc_eur, 180, 1e-9);
eq('cobertura amb TER explícit = 10%', ter.cobertura_pct, 10, 1e-9);
eq('TER target de l\'arquetip 60/30/6/4', ter.ter_target, (60*0.20+30*0.20+6*0.25+4*0.05)/100, 1e-9);
ok('estalvi a 10 anys > estalvi anual', ter.estalvi_10a_eur > ter.estalvi_anual_eur,
   '('+Math.round(ter.estalvi_10a_eur)+'€ vs '+Math.round(ter.estalvi_anual_eur)+'€/any)');

console.log('\n── 6. Bandes 5/25 ──');
// Target 60/30/6/4. Real: 70/20/6/4 -> RV +10pp sobre (banda 5), RF -10pp (banda 5)
STATE.posicions=[
  {id:'p1',cat:'rv_global',valor_actual:7000},
  {id:'p2',cat:'rf_corp',valor_actual:2000},
  {id:'p3',cat:'or_metalls',valor_actual:600},
  {id:'p4',cat:'liquiditat',valor_actual:400}
];
var m=calcMatchingITactic(0);
var byId={}; m.rows.forEach(function(r){byId[r.id]=r;});
eq('banda de rv_global (60%) = 5pp (topall absolut)', byId.rv_global.banda_pp, 5);
eq('banda de or_metalls (6%) = 1,5pp (25% relatiu)', byId.or_metalls.banda_pp, 1.5);
eq('banda de liquiditat (4%) = 1,0pp', byId.liquiditat.banda_pp, 1.0);
ok('rv_global fora de banda (sobreponderada)', byId.rv_global.fora_banda===true && byId.rv_global.estat==='sobre');
ok('rf_corp fora de banda (infraponderada)', byId.rf_corp.fora_banda===true && byId.rf_corp.estat==='infra');
ok('or_metalls dins de banda', byId.or_metalls.fora_banda===false && byId.or_metalls.estat==='ok');
eq('coherència = 100 - Σ|gap|/2 = 90', m.resum.coherencia, 90);
ok('cal_rebalanceig = true', m.resum.cal_rebalanceig===true);

// Cartera perfecta -> cap acció
STATE.posicions=[
  {id:'p1',cat:'rv_global',valor_actual:6000},{id:'p2',cat:'rf_corp',valor_actual:3000},
  {id:'p3',cat:'or_metalls',valor_actual:600},{id:'p4',cat:'liquiditat',valor_actual:400}
];
var mp=calcMatchingITactic(0);
eq('coherència de cartera perfecta = 100', mp.resum.coherencia, 100);
ok('cap categoria fora de banda', mp.resum.n_fora_banda===0);

// Categoria fora de pla
STATE.posicions.push({id:'p5',cat:'crypto',valor_actual:1000});
var mf=calcMatchingITactic(0);
var cry=mf.rows.filter(function(r){return r.id==='crypto';})[0];
ok('crypto apareix com a fora de pla', !!cry && cry.fora_pla===true, '(real '+(cry?cry.real_pct.toFixed(1):'?')+'%)');
ok('resum.fora_pla_pct > 9%', mf.resum.fora_pla_pct>9, '('+mf.resum.fora_pla_pct.toFixed(1)+'%)');

console.log('\n── 7. Repartiment de l\'aportació ──');
STATE.posicions=[
  {id:'p1',cat:'rv_global',valor_actual:7000},{id:'p2',cat:'rf_corp',valor_actual:2000},
  {id:'p3',cat:'or_metalls',valor_actual:600},{id:'p4',cat:'liquiditat',valor_actual:400}
];
[100,300,1000,5000].forEach(function(a){
  var r=calcMatchingITactic(a);
  var suma=r.recomanacio.reduce(function(s,l){return s+l.import;},0);
  var minOk=r.recomanacio.every(function(l){return l.import>=Math.min(a,50);});
  console.log('    aportació '+a+'€ -> '+r.recomanacio.map(function(l){return l.nom+' '+l.import+'€';}).join(' · '));
  ok('  suma exacta = '+a+'€', suma===a, '(suma='+suma+')');
  ok('  cap línia sota el mínim de 50€', minOk);
});
var r1000=calcMatchingITactic(1000);
ok('prioritza rf_corp (l\'única fora de banda infra)',
   r1000.recomanacio[0].cat==='rf_corp', '(1r='+r1000.recomanacio[0].nom+')');
ok('motiu indica fora de banda', /Fora de banda/.test(r1000.recomanacio[0].motiu), '("'+r1000.recomanacio[0].motiu+'")');

// Aportació enorme: no ha de sobrepassar els gaps i ha de repartir el sobrant
var rBig=calcMatchingITactic(100000);
var sumaBig=rBig.recomanacio.reduce(function(s,l){return s+l.import;},0);
ok('aportació de 100.000€ quadra exactament', sumaBig===100000, '(suma='+sumaBig+')');
ok('aportació gran es reparteix entre >1 categoria', rBig.recomanacio.length>1, '('+rBig.recomanacio.length+' línies)');

// Cartera buida: primera aportació ha de seguir els pesos target
STATE.posicions=[];
var rNou=calcMatchingITactic(1000);
console.log('    primera aportació 1000€ -> '+rNou.recomanacio.map(function(l){return l.nom+' '+l.import+'€';}).join(' · '));
var rvL=rNou.recomanacio.filter(function(l){return l.cat==='rv_global';})[0];
ok('client nou: RV Global s\'endú ~60%', rvL && Math.abs(rvL.import-600)<=60, '('+(rvL?rvL.import:'?')+'€)');
ok('client nou: coherencia null (no hi ha cartera)', rNou.resum.coherencia===null);
ok('client nou: suma exacta', rNou.recomanacio.reduce(function(s,l){return s+l.import;},0)===1000);

// Aportació per sota del mínim -> una sola línia
var rMin=calcMatchingITactic(20);
ok('aportació de 20€ -> 1 sola línia de 20€',
   rMin.recomanacio.length===1 && rMin.recomanacio[0].import===20);

console.log('\n════════════════════════════════════════');
console.log(passes+' passats · '+fails+' fallits');
if(fails) process.exit(1);
