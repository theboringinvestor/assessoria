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
